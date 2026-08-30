// AGRec · 面向知识博主的 macOS 录屏工具
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod helper;
mod model;
mod zoom;

use anyhow::Result;
use model::*;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc::Receiver;
use std::sync::Mutex;
use tauri::{Emitter, Listener, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

#[derive(Default)]
struct AppState {
    recording: Mutex<Option<RecordingSession>>,
}

struct RecordingSession {
    handle: helper::RecordHandle,
    rx: Receiver<serde_json::Value>,
    dir: PathBuf,
    name: String,
    config: RecordConfig,
    started_at: chrono::DateTime<chrono::Local>,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ---------------------------------------------------------------- 环境检查

#[derive(serde::Serialize)]
struct EnvStatus {
    helper: bool,
    screen: bool,
    microphone: bool,
    message: String,
}

#[tauri::command]
fn check_env() -> EnvStatus {
    match helper::helper_path() {
        Err(e) => EnvStatus {
            helper: false,
            screen: false,
            microphone: false,
            message: e.to_string(),
        },
        Ok(_) => match helper::run_once(&["permission"]) {
            Ok(v) => EnvStatus {
                helper: true,
                screen: v.get("screen").and_then(|b| b.as_bool()).unwrap_or(false),
                microphone: v.get("microphone").and_then(|b| b.as_bool()).unwrap_or(false),
                message: String::new(),
            },
            Err(e) => EnvStatus {
                helper: true,
                screen: false,
                microphone: false,
                message: e.to_string(),
            },
        },
    }
}

#[tauri::command]
fn list_displays() -> Result<Vec<DisplayInfo>, String> {
    let v = helper::run_once(&["displays"]).map_err(err)?;
    let arr = v.get("displays").cloned().unwrap_or(serde_json::json!([]));
    serde_json::from_value(arr).map_err(err)
}

#[tauri::command]
fn list_windows() -> Result<Vec<WindowInfo>, String> {
    let v = helper::run_once(&["windows"]).map_err(err)?;
    let arr = v.get("windows").cloned().unwrap_or(serde_json::json!([]));
    serde_json::from_value(arr).map_err(err)
}

// ---------------------------------------------------------------- 设置

fn settings_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join("settings.json")
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Settings {
    let p = settings_path(&app);
    std::fs::read_to_string(p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(Settings::fallback)
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let p = settings_path(&app);
    let text = serde_json::to_string_pretty(&settings).map_err(err)?;
    std::fs::write(p, text).map_err(err)
}

// ---------------------------------------------------------------- 选区拾取

/// 弹出一个覆盖指定区域（通常是所选显示器）的透明窗口，等待用户拖拽画框。
/// 返回的矩形坐标是「相对该区域左上角」的本地坐标，可以直接透传给录制请求。
#[tauri::command]
async fn pick_area(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<AreaRect, String> {
    // 选区是录制开始前的准备动作，这时候悬浮控制条不该还留在屏幕上——
    // 万一上一次录制的收尾路径漏掉了隐藏（或者崩溃退出），这里强制关一次兜底，
    // 不然选区遮罩上会叠出一个不该出现的悬浮条。
    if let Some(hud) = app.get_webview_window("hud") {
        let _ = hud.hide();
    }

    let win = ensure_picker(&app)?;
    win.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }))
        .map_err(err)?;
    win.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
        .map_err(err)?;
    win.show().map_err(err)?;
    let _ = win.set_focus();

    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let tx = Mutex::new(Some(tx));
    let handler = app.listen("area-picked", move |event| {
        if let Some(tx) = tx.lock().unwrap().take() {
            let _ = tx.send(event.payload().to_string());
        }
    });

    let result = tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(std::time::Duration::from_secs(180))
    })
    .await
    .map_err(|e| e.to_string())?;

    app.unlisten(handler);
    let _ = win.hide();

    let payload = result.map_err(|_| "未选择区域".to_string())?;
    let value: serde_json::Value = serde_json::from_str(&payload).map_err(err)?;
    if value.get("cancelled").and_then(|c| c.as_bool()).unwrap_or(false) {
        return Err("已取消选择区域".into());
    }
    serde_json::from_value::<AreaRect>(value).map_err(err)
}

/// 拿到悬浮控制条窗口；配置里那个若没建出来（例如透明窗口被系统拒绝），就在运行时补建一个。
/// 失败时返回带原因的错误，而不是悄悄跳过——否则录制时「浮窗没出现」会毫无线索。
fn ensure_hud(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window("hud") {
        return Ok(w);
    }
    WebviewWindowBuilder::new(app, "hud", WebviewUrl::App("index.html".into()))
        .title("AGRec · 悬浮控制条")
        .inner_size(400.0, 300.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .visible(false)
        .build()
        .map_err(|e| format!("无法创建悬浮控制条窗口：{e}"))
}

fn ensure_picker(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window("picker") {
        return Ok(w);
    }
    WebviewWindowBuilder::new(app, "picker", WebviewUrl::App("index.html".into()))
        .title("AGRec · 选择录制区域")
        .inner_size(400.0, 300.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .visible(false)
        .build()
        .map_err(|e| format!("无法创建选区窗口：{e}"))
}

fn position_hud(app: &tauri::AppHandle, hud: &tauri::WebviewWindow) {
    if let Ok(Some(mon)) = app.primary_monitor() {
        let scale = mon.scale_factor();
        let pos = mon.position();
        let size = mon.size();
        let hud_w = 400.0;
        let x = (pos.x as f64 / scale) + ((size.width as f64 / scale) - hud_w) / 2.0;
        let y = (pos.y as f64 / scale) + 14.0;
        let _ = hud.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
    }
}

/// 录制结束（无论成功、失败还是被强制中断）后把界面恢复原状。
/// 抽出来是因为有三条退出路径，漏掉任何一条用户都会卡在悬浮条上。
fn restore_windows_after_recording(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    if let Some(hud) = app.get_webview_window("hud") {
        let _ = hud.hide();
    }
}

// ---------------------------------------------------------------- 录制

#[tauri::command]
fn start_recording(
    app: tauri::AppHandle,
    state: State<AppState>,
    config: RecordConfig,
) -> Result<String, String> {
    let mut guard = state.recording.lock().map_err(err)?;
    if guard.is_some() {
        return Err("已经在录制中了".into());
    }

    let now = chrono::Local::now();
    let base = config
        .project_name
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "录屏".to_string());
    let name = format!("{}_{}", base, now.format("%Y%m%d_%H%M%S"));
    let dir = Path::new(&config.save_dir).join(&name);
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建保存目录：{e}"))?;

    let video = dir.join("原始录制.mov");
    let track = dir.join("mouse.json");
    let area = config.area.clone().unwrap_or(AreaRect { x: 0.0, y: 0.0, width: 0.0, height: 0.0 });
    let req = serde_json::json!({
        "output": video.to_string_lossy(),
        "trackPath": track.to_string_lossy(),
        "displayID": config.display_id,
        "width": 0,
        "height": config.height,
        "fps": config.fps,
        "bitrateMbps": config.bitrate_mbps,
        "codec": config.codec,
        "audioSource": config.audio_source,
        "mode": config.mode,
        "areaX": area.x,
        "areaY": area.y,
        "areaWidth": area.width,
        "areaHeight": area.height,
        "windowID": config.window_id.unwrap_or(0),
        "zoomScale": config.zoom.scale,
        "trigger": config.zoom.trigger,
        "dwellTime": config.zoom.dwell_time,
        "dwellRadius": config.zoom.dwell_radius,
        "hotkeyA": config.zoom.hotkey_a,
        "hotkeyZ": config.zoom.hotkey_z,
        "hotkeyX": config.zoom.hotkey_x,
    });
    let req_path = dir.join("record-request.json");
    std::fs::write(&req_path, serde_json::to_vec_pretty(&req).map_err(err)?).map_err(err)?;

    // 开录前先清掉历史遗留的录制内核。正常情况下一个都不该有；
    // 但只要曾经出现过「收尾超时」，就会留下一个还在录 4K 的孤儿进程，
    // 而且它不会自己停。不清理的话，录几次机器上就并行跑着几个编码进程。
    helper::kill_orphan_recorders();

    helper::PREVIEW_MUTED.store(false, std::sync::atomic::Ordering::Relaxed);
    let (handle, rx) =
        helper::spawn_record(&req_path.to_string_lossy(), app.clone()).map_err(err)?;
    *guard = Some(RecordingSession {
        handle,
        rx,
        dir: dir.clone(),
        name,
        config,
        started_at: now,
    });
    drop(guard);

    match ensure_hud(&app) {
        Ok(hud) => {
            // 悬浮条窗口是复用的：同一次 `npm run app` 里录第二遍、第三遍时都是同一个
            // 窗口实例再 show() 一次，React 组件从没重新 mount 过，"正在保存录制…"、
            // 计时器、缩放数字这些 state 会原样带到下一次录制——上次结束时留下的
            // saving=true 没人重置，下一次一打开悬浮条就直接卡死在"正在保存录制…"，
            // 预览小窗和缩放数字全被盖住，跟没有一样。开录前强制刷新一次页面，
            // 让它当成全新的组件重新 mount，状态清零。
            let _ = hud.eval("location.reload()");
            std::thread::sleep(std::time::Duration::from_millis(150));
            position_hud(&app, &hud);
            let _ = hud.show();
            let _ = hud.set_always_on_top(true);
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.hide();
            }
        }
        Err(e) => {
            // 悬浮条起不来不该导致录制失败，但要让用户看见原因
            let _ = app.emit("hud-error", &e);
        }
    }

    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn pause_recording(state: State<AppState>) -> Result<(), String> {
    let mut guard = state.recording.lock().map_err(err)?;
    let session = guard.as_mut().ok_or("当前没有正在进行的录制")?;
    helper::send_command(&mut session.handle, "pause").map_err(err)
}

#[tauri::command]
fn resume_recording(state: State<AppState>) -> Result<(), String> {
    let mut guard = state.recording.lock().map_err(err)?;
    let session = guard.as_mut().ok_or("当前没有正在进行的录制")?;
    helper::send_command(&mut session.handle, "resume").map_err(err)
}

#[tauri::command]
async fn stop_recording(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    let session = {
        let mut guard = state.recording.lock().map_err(err)?;
        guard.take().ok_or("当前没有正在进行的录制")?
    };
    let RecordingSession {
        mut handle,
        rx,
        dir,
        name,
        config,
        started_at,
    } = session;

    // 先掐掉预览帧转发，再把「等内核收尾」这件事挪到后台线程 —— 主线程必须保持空闲，
    // 否则转发线程推事件推不动，双方互相等，界面就卡死了。
    helper::PREVIEW_MUTED.store(true, std::sync::atomic::Ordering::Relaxed);

    let stop_outcome = tauri::async_runtime::spawn_blocking(move || {
        let r = helper::stop_record(&mut handle, &rx);
        // 无论成败，handle 在这里被 drop：stdin 关闭，内核的 readLine 循环拿到 EOF 后退出。
        (r, handle.pid)
    })
    .await
    .map_err(|e| format!("等待录制收尾异常：{e}"))?;

    let result = match stop_outcome {
        (Ok(v), _) => v,
        (Err(e), pid) => {
            // 收尾失败时不能就这么 return —— 主窗口还藏着、悬浮条还挂着，
            // 用户会看到一个「点了没反应」的空壳。先把界面恢复原状再报错。
            helper::force_kill(pid);
            restore_windows_after_recording(&app);
            return Err(err(e));
        }
    };

    if result.get("type").and_then(|t| t.as_str()) == Some("error") {
        restore_windows_after_recording(&app);
        return Err(result
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("录制失败")
            .to_string());
    }

    let video = dir.join("原始录制.mov");
    let track_path = dir.join("mouse.json");
    let duration = result.get("duration").and_then(|d| d.as_f64()).unwrap_or(0.0);

    let track: MouseTrack = std::fs::read_to_string(&track_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(MouseTrack {
            width: 0.0,
            height: 0.0,
            origin_x: 0.0,
            origin_y: 0.0,
            samples: vec![],
        });

    let segments = zoom::generate(&track, &config.zoom);

    let project = Project {
        dir: dir.to_string_lossy().to_string(),
        name,
        created_at: started_at.format("%Y-%m-%d %H:%M:%S").to_string(),
        video: video.to_string_lossy().to_string(),
        track_path: track_path.to_string_lossy().to_string(),
        duration,
        width: 0,
        height: config.height,
        fps: config.fps,
        segments,
        cursor: config.cursor.clone(),
        zoom: config.zoom.clone(),
    };
    write_project(&project)?;

    restore_windows_after_recording(&app);
    let _ = app.emit("recording-finished", &project);

    Ok(project)
}

#[tauri::command]
fn is_recording(state: State<AppState>) -> bool {
    state
        .recording
        .lock()
        .map(|g| g.is_some())
        .unwrap_or(false)
}

// ---------------------------------------------------------------- 项目

fn write_project(p: &Project) -> Result<(), String> {
    let path = Path::new(&p.dir).join("project.json");
    std::fs::write(path, serde_json::to_string_pretty(p).map_err(err)?).map_err(err)
}

#[tauri::command]
fn save_project(project: Project) -> Result<(), String> {
    write_project(&project)
}

#[tauri::command]
fn load_project(dir: String) -> Result<Project, String> {
    let path = Path::new(&dir).join("project.json");
    let text = std::fs::read_to_string(path).map_err(|e| format!("读取项目失败：{e}"))?;
    serde_json::from_str(&text).map_err(err)
}

#[tauri::command]
fn list_projects(root: String) -> Vec<Project> {
    let mut out = vec![];
    if let Ok(entries) = std::fs::read_dir(&root) {
        for e in entries.flatten() {
            let p = e.path().join("project.json");
            if let Ok(text) = std::fs::read_to_string(p) {
                if let Ok(proj) = serde_json::from_str::<Project>(&text) {
                    out.push(proj);
                }
            }
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    out
}

#[tauri::command]
fn regenerate_zoom(track_path: String, params: ZoomParams) -> Result<Vec<ZoomSegment>, String> {
    let text = std::fs::read_to_string(&track_path).map_err(|e| format!("读取鼠标轨迹失败：{e}"))?;
    let track: MouseTrack = serde_json::from_str(&text).map_err(err)?;
    Ok(zoom::generate(&track, &params))
}

#[tauri::command]
fn read_track(track_path: String) -> Result<MouseTrack, String> {
    let text = std::fs::read_to_string(&track_path).map_err(|e| format!("读取鼠标轨迹失败：{e}"))?;
    serde_json::from_str(&text).map_err(err)
}

// ---------------------------------------------------------------- 导出

/// 在阻塞线程里跑导出，边跑边把进度发给前端
fn run_export(app: &tauri::AppHandle, req_path: &Path) -> Option<String> {
    let helper_bin = match helper::helper_path() {
        Ok(p) => p,
        Err(e) => return Some(e.to_string()),
    };
    let mut child = match Command::new(helper_bin)
        .arg("export")
        .arg(req_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return Some(format!("启动导出失败：{e}")),
    };
    let stdout = match child.stdout.take() {
        Some(s) => s,
        None => return Some("无法读取导出进度".into()),
    };
    let mut error_msg = None;
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
            match v.get("type").and_then(|t| t.as_str()) {
                Some("progress") => {
                    let p = v.get("value").and_then(|x| x.as_f64()).unwrap_or(0.0);
                    let _ = app.emit("export-progress", p);
                }
                Some("error") => {
                    error_msg = Some(
                        v.get("message")
                            .and_then(|m| m.as_str())
                            .unwrap_or("导出失败")
                            .to_string(),
                    );
                }
                _ => {}
            }
        }
    }
    let _ = child.wait();
    error_msg
}

#[tauri::command]
async fn export_video(
    app: tauri::AppHandle,
    project: Project,
    options: ExportOptions,
) -> Result<String, String> {
    let dir = PathBuf::from(&project.dir);
    let track_text = std::fs::read_to_string(&project.track_path)
        .map_err(|e| format!("读取鼠标轨迹失败：{e}"))?;
    let track: serde_json::Value = serde_json::from_str(&track_text).map_err(err)?;

    let ext = if options.format == "mov" { "mov" } else { "mp4" };
    let output = options
        .output_path
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            dir.join(format!("{}_成品.{}", project.name, ext))
                .to_string_lossy()
                .to_string()
        });

    let req = serde_json::json!({
        "input": project.video,
        "output": output,
        "width": 0,
        "height": options.height,
        "fps": options.fps,
        "bitrateMbps": options.bitrate_mbps,
        "codec": options.codec,
        "segments": project.segments,
        "cursor": project.cursor,
        "track": track,
        "trimStart": options.trim_start,
        "trimEnd": options.trim_end,
    });
    let req_path = dir.join("export-request.json");
    std::fs::write(&req_path, serde_json::to_vec_pretty(&req).map_err(err)?).map_err(err)?;

    let app2 = app.clone();
    let req_path2 = req_path.clone();
    let error_msg = tauri::async_runtime::spawn_blocking(move || run_export(&app2, &req_path2))
        .await
        .map_err(|e| format!("导出线程异常：{e}"))?;

    if let Some(m) = error_msg {
        return Err(m);
    }
    let _ = app.emit("export-progress", 1.0);
    Ok(output)
}

// ---------------------------------------------------------------- 杂项

#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("无法打开访达：{e}"))
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    Command::new("open")
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("无法打开：{e}"))
}

#[tauri::command]
fn open_screen_recording_settings() {
    let _ = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .spawn();
}

#[tauri::command]
fn ensure_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("创建目录失败：{e}"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::default())
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            let WindowEvent::CloseRequested { api, .. } = event else {
                return;
            };

            // macOS 上关掉最后一个窗口并不会让 App 跟着退出，而 Tauri 这个版本
            // 又没有把「点 Dock 图标」的事件透出来。窗口一旦被销毁，Dock 里就会
            // 留下一个亮着、却怎么点都打不开的图标，只能强制退出再重开。
            //
            // 所以这里改成：没在录制就直接退出整个 App（关窗＝退出，符合直觉）；
            // 正在录制就只把窗口藏起来，别把录制一起带走——悬浮控制条还在，
            // 录完 restore_windows_after_recording 会自己把主窗口叫回来。
            api.prevent_close();
            let busy = window
                .state::<AppState>()
                .recording
                .lock()
                .map(|g| g.is_some())
                .unwrap_or(false);
            if busy {
                let _ = window.hide();
            } else {
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            check_env,
            list_displays,
            list_windows,
            load_settings,
            save_settings,
            pick_area,
            start_recording,
            pause_recording,
            resume_recording,
            stop_recording,
            is_recording,
            save_project,
            load_project,
            list_projects,
            regenerate_zoom,
            read_track,
            export_video,
            reveal_in_finder,
            open_path,
            open_screen_recording_settings,
            ensure_dir,
        ])
        .build(tauri::generate_context!())
        .expect("AGRec启动失败")
        .run(|_app, event| {
            // 关掉应用不代表录制内核会跟着死：它是独立进程，
            // 主程序退出后它照样在录、照样在写文件。这里兜底清理一次。
            // 只在真正退出时清理。ExitRequested 是「请求退出」，可能被拦下来，
            // 那时候录制说不定还在正常进行，杀了就是误伤。
            if matches!(event, tauri::RunEvent::Exit) {
                helper::kill_orphan_recorders();
            }
        });
}
