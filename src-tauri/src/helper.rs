use anyhow::{anyhow, Result};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver};
use tauri::Emitter;

/// 一旦开始收尾就静音预览帧转发。
/// 预览帧是几十 KB 的 base64 图片，推给界面必须走主线程；
/// 如果这时候主线程正忙着等录制结束，两边就会互相等成死锁。
pub static PREVIEW_MUTED: AtomicBool = AtomicBool::new(false);

#[cfg(target_arch = "aarch64")]
const TRIPLE: &str = "aarch64-apple-darwin";
#[cfg(target_arch = "x86_64")]
const TRIPLE: &str = "x86_64-apple-darwin";

/// 找到 helper 可执行文件：打包后与主程序同目录，开发时在 src-tauri/binaries/
pub fn helper_path() -> Result<PathBuf> {
    let exe = std::env::current_exe()?;
    let dir = exe.parent().ok_or_else(|| anyhow!("无法定位程序目录"))?;

    let candidates = vec![
        dir.join("zhilu-helper"),
        dir.join(format!("zhilu-helper-{TRIPLE}")),
        // cargo dev: target/debug/../../binaries
        dir.join("../../binaries").join(format!("zhilu-helper-{TRIPLE}")),
        dir.join("../../../binaries").join(format!("zhilu-helper-{TRIPLE}")),
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!("zhilu-helper-{TRIPLE}")),
    ];
    for c in candidates {
        if c.exists() {
            return Ok(c);
        }
    }
    Err(anyhow!(
        "找不到录制内核 zhilu-helper，请先运行 ./scripts/build-helper.sh 编译"
    ))
}

/// 执行一次性命令，返回 helper 输出的最后一条 JSON
pub fn run_once(args: &[&str]) -> Result<serde_json::Value> {
    let out = Command::new(helper_path()?)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()?;

    let text = String::from_utf8_lossy(&out.stdout);
    let mut last: Option<serde_json::Value> = None;
    for line in text.lines() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
            last = Some(v);
        }
    }
    match last {
        Some(v) => {
            if v.get("type").and_then(|t| t.as_str()) == Some("error") {
                Err(anyhow!(v
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("未知错误")
                    .to_string()))
            } else {
                Ok(v)
            }
        }
        None => Err(anyhow!(
            "录制内核没有返回结果：{}",
            String::from_utf8_lossy(&out.stderr)
        )),
    }
}

/// 一次正在进行的录制：保留写入 stdin 的句柄 + 子进程 pid。
/// pid 是关键——子进程本身被 move 进了后台读取线程，外面拿不到 `Child`，
/// 一旦它不听 "stop" 的话（卡在编码、卡在写 stderr），没有 pid 就完全没法收拾它，
/// 只能眼睁睁看着一个 4K 编码进程在后台一直跑。
pub struct RecordHandle {
    pub stdin: std::process::ChildStdin,
    pub pid: u32,
}

/// 强制杀掉录制内核。用于「stop 指令没人应答」这种收不了尾的情况。
/// 走 /bin/kill 而不是 Child::kill，是因为 Child 已经被后台线程接管了。
pub fn force_kill(pid: u32) {
    let _ = Command::new("/bin/kill")
        .arg("-9")
        .arg(pid.to_string())
        .status();
}

/// 清理掉可能残留的录制内核进程。
/// 只匹配 `zhilu-helper ... record`，不会误伤正在跑的导出任务。
/// 每次开始新录制前调一次，把历史上没收拾干净的孤儿进程一并清掉。
pub fn kill_orphan_recorders() {
    let out = Command::new("/bin/ps").args(["-axo", "pid=,args="]).output();
    let Ok(out) = out else { return };
    let me = std::process::id();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        let line = line.trim();
        let Some((pid_str, args)) = line.split_once(char::is_whitespace) else {
            continue;
        };
        if !args.contains("zhilu-helper") {
            continue;
        }
        // 只杀录制子命令；导出（export）可能是用户主动发起的长任务，不能碰
        if !args.split_whitespace().any(|a| a == "record") {
            continue;
        }
        let Ok(pid) = pid_str.trim().parse::<u32>() else {
            continue;
        };
        if pid == me {
            continue;
        }
        force_kill(pid);
    }
}

/// 启动录制子进程：
/// - 同步等待它报告「已开始」
/// - 之后交给一个后台线程持续读取 stdout：
///   - "preview" 类型的行会作为 `recording-preview` 事件广播给前端（悬浮条用它展示实时缩放预览）
///   - "ok" / "error" 类型的行（录制收尾的最终结果）会通过返回的 Receiver 传出
pub fn spawn_record(
    request_file: &str,
    app: tauri::AppHandle,
) -> Result<(RecordHandle, Receiver<serde_json::Value>)> {
    let mut child = Command::new(helper_path()?)
        .arg("record")
        .arg(request_file)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let pid = child.id();

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| anyhow!("无法写入录制内核"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow!("无法读取内核输出"))?;

    // stderr 必须有人持续读走，否则管道缓冲区（约 64KB）一满，
    // 子进程就会永久阻塞在 write(stderr) 上——录制线程整个僵住，
    // 但 ScreenCaptureKit 还在往内存里灌帧，表现就是「停不下来 + 越来越卡」。
    // ScreenCaptureKit / AVFoundation / CoreImage 的日志量完全够撑满这个缓冲区。
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(stderr)
                .lines()
                .map_while(std::result::Result::ok)
            {
                eprintln!("[zhilu-helper] {line}");
            }
        });
    }

    let mut reader = BufReader::new(stdout);

    let mut line = String::new();
    reader.read_line(&mut line)?;
    let v: serde_json::Value =
        serde_json::from_str(line.trim()).map_err(|_| anyhow!("录制内核启动异常：{line}"))?;
    if v.get("type").and_then(|t| t.as_str()) == Some("error") {
        let msg = v
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("未知错误")
            .to_string();
        let _ = child.kill();
        return Err(anyhow!(msg));
    }

    let (tx, rx) = channel();
    std::thread::spawn(move || {
        for line in reader.lines().map_while(std::result::Result::ok) {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else {
                continue;
            };
            match v.get("type").and_then(|t| t.as_str()) {
                Some("preview") => {
                    if !PREVIEW_MUTED.load(Ordering::Relaxed) {
                        let _ = app.emit("recording-preview", &v);
                    }
                }
                Some("manualZoom") => {
                    if !PREVIEW_MUTED.load(Ordering::Relaxed) {
                        let _ = app.emit("recording-manual-zoom", &v);
                    }
                }
                Some("ok") | Some("error") => {
                    let _ = tx.send(v);
                    break;
                }
                _ => {}
            }
        }
        let _ = child.wait();
    });

    Ok((RecordHandle { stdin, pid }, rx))
}

/// 给正在录制的内核发一条控制指令（pause / resume / stop）
pub fn send_command(handle: &mut RecordHandle, cmd: &str) -> Result<()> {
    handle.stdin.write_all(format!("{cmd}\n").as_bytes())?;
    handle.stdin.flush()?;
    Ok(())
}

/// 通知子进程停止，并等待收尾信息（写入完成、鼠标轨迹落盘）
pub fn stop_record(
    handle: &mut RecordHandle,
    rx: &Receiver<serde_json::Value>,
) -> Result<serde_json::Value> {
    // 先礼：让内核自己收尾，把 moov 写完、轨迹落盘
    let sent = send_command(handle, "stop");

    if sent.is_ok() {
        if let Ok(v) = rx.recv_timeout(std::time::Duration::from_secs(30)) {
            return Ok(v);
        }
    }

    // 后兵：30 秒还没收尾（或者 stdin 都写不进去了），说明内核已经僵住。
    // 这里**必须**强杀。之前的版本只是返回一个错误就撒手不管，
    // 而 Rust 这边的 session 已经被取走了，等于「界面觉得没在录了、
    // 但那个 4K 编码进程还在后台狂写文件」。录几次就叠几个，机器不卡才怪。
    force_kill(handle.pid);
    // 给它一点时间真正退出，顺带回收后台读取线程
    let _ = rx.recv_timeout(std::time::Duration::from_secs(3));
    Err(anyhow!(
        "录制内核没有在 30 秒内收尾，已强制结束（进程 {}）。\
         这一段的视频文件可能不完整。",
        handle.pid
    ))
}
