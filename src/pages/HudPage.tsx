import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import { formatTime } from "../components/UI";

type PreviewPayload = { image: string; zoom: number };

/**
 * 录制中悬浮控制条：窗口 label 为 "hud"。
 * 这个窗口已经在录制端被排除，不会出现在录出来的画面里。
 * 上半部分是实时预览（能看到跟随鼠标的放大效果），下半部分是计时和控制按钮。
 */
export default function HudPage() {
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [manualZoom, setManualZoom] = useState(1);
  const [showPreview, setShowPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const accumRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => { pausedRef.current = paused; lastTickRef.current = Date.now(); }, [paused]);

  useEffect(() => {
    document.documentElement.classList.add("hud-root");
    document.body.classList.add("hud-root");
    accumRef.current = 0;
    lastTickRef.current = Date.now();
    setElapsed(0);
    setPaused(false);

    const timer = window.setInterval(() => {
      const now = Date.now();
      if (!pausedRef.current && lastTickRef.current) {
        accumRef.current += (now - lastTickRef.current) / 1000;
        setElapsed(accumRef.current);
      }
      lastTickRef.current = now;
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const p = listen<PreviewPayload>("recording-preview", (e) => setPreview(e.payload));
    const m = listen<{ value: number }>("recording-manual-zoom", (e) => setManualZoom(e.payload.value));
    return () => { p.then((f) => f()); m.then((f) => f()); };
  }, []);

  async function togglePause() {
    setBusy(true);
    setError("");
    try {
      if (paused) { await api.resumeRecording(); setPaused(false); }
      else { await api.pauseRecording(); setPaused(true); }
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function stop() {
    setBusy(true);
    setSaving(true);
    setError("");
    try {
      await api.stopRecording();
    } catch (e) {
      // 不能静默失败：点了没反应却毫无提示，是最难排查的情况
      setError(String(e));
      setSaving(false);
    } finally {
      setBusy(false);
    }
  }

  const zoom = preview?.zoom ?? manualZoom;

  return (
    <div className="hud">
      <div className="hud-body" data-tauri-drag-region>
        <span className={`hud-dot ${paused ? "paused" : ""} ${saving ? "saving" : ""}`} />
        {saving ? (
          <span className="hud-saving">正在保存录制…</span>
        ) : (
          <>
            <span className="hud-time">{formatTime(elapsed)}</span>
            <span className={`hud-scale ${zoom > 1.05 ? "on" : ""}`}>{zoom.toFixed(2)}×</span>
          </>
        )}
        <div className="hud-actions">
          <button className="hud-btn ghost" onClick={() => setShowPreview((v) => !v)}
            title={showPreview ? "隐藏预览" : "显示预览"}>
            {showPreview ? "▴" : "▾"}
          </button>
          <button className="hud-btn" onClick={togglePause} disabled={busy}
            title={paused ? "继续录制" : "暂停录制"}>
            {paused ? "▶" : "❚❚"}
          </button>
          <button className="hud-btn stop" onClick={stop} disabled={busy} title="结束录制">■</button>
        </div>
      </div>
      {error && <div className="hud-error">{error}</div>}
      {showPreview && !saving && !error && (
        <div className="hud-preview">
          {preview ? (
            <img src={`data:image/jpeg;base64,${preview.image}`} alt="" />
          ) : (
            <div className="hud-preview-empty">正在准备预览…</div>
          )}
          {zoom > 1.05 && <span className="hud-zoom-badge">{zoom.toFixed(1)}×</span>}
        </div>
      )}
    </div>
  );
}
