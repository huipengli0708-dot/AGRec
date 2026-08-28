import { useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * 标题栏的"检查更新"按钮。
 * 打包版才有意义——开发版本来就是实时改的，不走这套发布流程。
 */
export default function UpdateButton() {
  const [state, setState] = useState<
    "idle" | "checking" | "none" | "available" | "downloading" | "ready" | "error"
  >("idle");
  const [pending, setPending] = useState<Update | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [version, setVersion] = useState("");

  async function doCheck() {
    setState("checking");
    setError("");
    try {
      const update = await check();
      if (update) {
        setPending(update);
        setVersion(update.version);
        setState("available");
      } else {
        setState("none");
        setTimeout(() => setState("idle"), 2500);
      }
    } catch (e) {
      setError(String(e));
      setState("error");
    }
  }

  async function doInstall() {
    if (!pending) return;
    setState("downloading");
    setProgress(0);
    try {
      let total = 0, got = 0;
      await pending.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        else if (ev.event === "Progress") {
          got += ev.data.chunkLength;
          if (total > 0) setProgress(Math.min(100, Math.round((got / total) * 100)));
        } else if (ev.event === "Finished") setProgress(100);
      });
      setState("ready");
    } catch (e) {
      setError(String(e));
      setState("error");
    }
  }

  if (state === "idle") {
    return (
      <button className="update-btn" onClick={doCheck} title="检查有没有新版本">
        检查更新
      </button>
    );
  }
  if (state === "checking") return <span className="update-tag">检查中…</span>;
  if (state === "none") return <span className="update-tag ok">已是最新版本</span>;
  if (state === "error") {
    return (
      <span className="update-tag err" title={error} onClick={doCheck}>
        检查失败，点击重试
      </span>
    );
  }
  if (state === "available") {
    return (
      <span className="update-tag hot">
        发现新版本 {version}
        <button className="update-btn small" onClick={doInstall}>立即更新</button>
      </span>
    );
  }
  if (state === "downloading") {
    return <span className="update-tag">下载中 {progress}%…</span>;
  }
  // ready
  return (
    <span className="update-tag hot">
      已下载，重启后生效
      <button className="update-btn small" onClick={() => relaunch()}>立即重启</button>
    </span>
  );
}
