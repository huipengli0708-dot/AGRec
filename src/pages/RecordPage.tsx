import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  api, ZOOM_TRIGGERS,
  type AreaRect, type CaptureMode, type DisplayInfo, type EnvStatus,
  type Settings, type WindowInfo,
} from "../lib/api";
import { Button, Tip, formatTime } from "../components/UI";

type Props = {
  settings: Settings;
  onSettings: (s: Settings) => void;
};

export default function RecordPage({ settings, onSettings }: Props) {
  const [env, setEnv] = useState<EnvStatus | null>(null);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [windowId, setWindowId] = useState<number | null>(null);

  // 录制范围、显示器、选区直接存在 settings 里，重开软件后保持上次的选择。
  // 窗口 id 不存——它每次开机都会变，存下来只会指向一个已经不存在的窗口。
  const captureMode: CaptureMode = settings.captureMode ?? "display";
  const displayId = settings.displayId ?? 0;
  const area = settings.area ?? null;
  const setCaptureMode = (v: CaptureMode) =>
    onSettings({ ...settings, captureMode: v, area: v === "area" ? settings.area : null });
  const setDisplayId = (v: number) => onSettings({ ...settings, displayId: v });
  const setArea = (v: AreaRect | null) => onSettings({ ...settings, area: v });
  const [pickingArea, setPickingArea] = useState(false);
  const [name, setName] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    api.checkEnv().then(setEnv);
    api.listDisplays().then((d) => {
      setDisplays(d);
      // 上次记住的显示器如果还接着，就沿用；拔掉了就退回主显示器，
      // 不然会卡在一个已经不存在的显示器 id 上，怎么点都录不出来。
      if (!d.some((x) => x.id === settings.displayId)) {
        const main = d.find((x) => x.isMain) ?? d[0];
        if (main) setDisplayId(main.id);
      }
    }).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (captureMode === "window" && windows.length === 0) {
      api.listWindows().then(setWindows).catch((e) => setError(String(e)));
    }
  }, [captureMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const un = listen<string>("hud-error", (e) =>
      setError(`悬浮控制条没能打开：${e.payload}。录制仍在继续，可以用本页的「结束录制」按钮停止。`));
    return () => { un.then((f) => f()); };
  }, []);

  // 录制可能不是从这一页结束的——悬浮条上的「结束」也能停。
  // 编辑器搬成独立窗口之后，这一页不会再被整页替换掉了，
  // 所以必须自己听一下结束事件，否则会一直停在「正在录制」的界面上，
  // 再点「结束录制」就报「当前没有正在进行的录制」。
  useEffect(() => {
    const un = listen("recording-finished", () => setRecording(false));
    return () => { un.then((f) => f()); };
  }, []);

  // 兜底：万一录制内核自己挂了、或者哪条退出路径没发事件，
  // 界面也不该永远卡在「正在录制」上。慢速轮询一下真实状态。
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => {
      api.isRecording().then((on) => { if (!on) setRecording(false); }).catch(() => {});
    }, 2000);
    return () => window.clearInterval(t);
  }, [recording]);

  useEffect(() => {
    if (recording) {
      const t0 = Date.now();
      timer.current = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 100);
    } else if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
      setElapsed(0);
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [recording]);

  const patch = (p: Partial<Settings>) => onSettings({ ...settings, ...p });
  const patchCursor = (p: Partial<Settings["cursor"]>) =>
    onSettings({ ...settings, cursor: { ...settings.cursor, ...p } });
  const patchZoom = (p: Partial<Settings["zoom"]>) =>
    onSettings({ ...settings, zoom: { ...settings.zoom, ...p } });


  async function pickArea() {
    const d = displays.find((x) => x.id === displayId) ?? displays[0];
    if (!d) return;
    setPickingArea(true);
    setError("");
    try {
      const rect = await api.pickArea(d.originX, d.originY, d.width, d.height);
      setArea(rect);
    } catch (e) {
      setError(String(e));
    } finally {
      setPickingArea(false);
    }
  }

  async function start() {
    setError("");
    if (captureMode === "area" && !area) { setError("请先框选录制区域"); return; }
    if (captureMode === "window" && windowId == null) { setError("请先选择要录制的窗口"); return; }
    setBusy(true);
    try {
      await api.ensureDir(settings.saveDir);
      await api.startRecording({
        displayId,
        height: settings.defaultHeight,
        fps: settings.defaultFps,
        codec: settings.defaultCodec,
        bitrateMbps: settings.defaultBitrate,
        audioSource: settings.audioSource,
        saveDir: settings.saveDir,
        cursor: settings.cursor,
        zoom: settings.zoom,
        projectName: name || undefined,
        mode: captureMode,
        area: captureMode === "area" ? area ?? undefined : undefined,
        windowId: captureMode === "window" ? windowId ?? undefined : undefined,
      });
      setRecording(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      // 编辑器由 App 那层统一在 recording-finished 事件里打开。
      // 这里不要自己再开一次：悬浮条上的「结束」走的是同一个命令、
      // 发的是同一个事件，两边都开就会重复触发。
      await api.stopRecording();
      setRecording(false);
    } catch (e) {
      setError(String(e));
      setRecording(false);
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="panel">
      {env && !env.helper && (
        <div className="banner warn">
          录制内核尚未编译。请在项目根目录执行 <code>./scripts/build-helper.sh</code> 后重启应用。
          <div className="muted small">{env.message}</div>
        </div>
      )}
      {env && env.helper && !env.screen && (
        <div className="banner warn">
          还没有「屏幕录制」权限，macOS 会拒绝抓取画面。
          <Button kind="ghost" onClick={() => api.openScreenSettings()}>去系统设置开启</Button>
        </div>
      )}
      {error && <div className="banner error">{error}</div>}

      {recording ? (
        <div className="recording-hero">
          <div className="pulse" />
          <div className="time">{formatTime(elapsed)}</div>
          <p className="muted">正在录制，屏幕上方的悬浮控制条可以暂停 / 继续 / 结束。</p>
          <Button kind="danger" onClick={stop} disabled={busy}>结束录制并进入编辑</Button>
        </div>
      ) : (
        <>
          <div className="scope-tiles">
            <button className={`scope-tile ${captureMode === "display" ? "on" : ""}`}
              onClick={() => setCaptureMode("display")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" />
              </svg>
              <b>整个屏幕</b>
              <em>{displays.find((d) => d.id === displayId)?.name ?? "主显示器"}</em>
            </button>

            <button className={`scope-tile ${captureMode === "window" ? "on" : ""}`}
              onClick={() => setCaptureMode("window")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18M7 7h.01" />
              </svg>
              <b>应用窗口</b>
              <em>{windowId != null ? windows.find((w) => w.id === windowId)?.app ?? "已选窗口" : "选一个窗口"}</em>
            </button>

            <button className={`scope-tile ${captureMode === "area" ? "on" : ""}`}
              onClick={() => setCaptureMode("area")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
              </svg>
              <b>框选区域</b>
              <em>{area ? `${Math.round(area.width)}×${Math.round(area.height)}` : "拖一个框"}</em>
            </button>
          </div>

          {captureMode === "display" && displays.length > 1 && (
            <div className="panel-row">
              <span className="panel-row-label">显示器</span>
              <select className="panel-select" value={displayId}
                onChange={(e) => setDisplayId(Number(e.target.value))}>
                {displays.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}（{d.width}×{d.height}）</option>
                ))}
              </select>
            </div>
          )}

          {captureMode === "area" && (
            <>
              {displays.length > 1 && (
                <div className="panel-row">
                  <span className="panel-row-label">所在显示器</span>
                  <select className="panel-select" value={displayId}
                    onChange={(e) => onSettings({ ...settings, displayId: Number(e.target.value), area: null })}>
                    {displays.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
              <div className="panel-row">
                <span className="panel-row-label">选区</span>
                <Button onClick={pickArea} disabled={pickingArea}>
                  {pickingArea ? "请在屏幕上拖拽…" : area ? "重新框选" : "开始框选"}
                </Button>
              </div>
            </>
          )}

          {captureMode === "window" && (
            <div className="panel-row col">
              <span className="panel-row-label">目标窗口</span>
              {windows.length === 0 ? (
                <span className="muted small">没找到可录制的窗口，确认目标应用没有最小化</span>
              ) : (
                <select className="panel-select wide" value={windowId ?? ""}
                  onChange={(e) => setWindowId(Number(e.target.value))}>
                  <option value="" disabled>选一个窗口…</option>
                  {windows.map((w) => (
                    <option key={w.id} value={w.id}>{w.app} · {w.title}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="panel-divider" />

          <div className="panel-row">
            <span className="panel-row-label">
              声音
              <Tip text="录制内核一次只能录一路声音，所以麦克风和系统声音是三选一，不能同时开。想要「边讲解边录电脑声音」得后期把两条轨道合起来。" />
            </span>
            <select className="panel-select" value={settings.audioSource}
              onChange={(e) => patch({ audioSource: e.target.value as Settings["audioSource"] })}>
              <option value="mic">麦克风讲解</option>
              <option value="system">系统声音</option>
              <option value="none">不录声音</option>
            </select>
          </div>

          <div className="panel-row">
            <span className="panel-row-label">
              自动放大
              <Tip text={ZOOM_TRIGGERS.find((z) => z.value === settings.zoom.trigger)?.desc ?? ""} />
            </span>
            <select className="panel-select" value={settings.zoom.trigger}
              onChange={(e) => patchZoom({ trigger: e.target.value as Settings["zoom"]["trigger"] })}>
              {ZOOM_TRIGGERS.map((z) => (
                <option key={z.value} value={z.value}>{z.label}</option>
              ))}
            </select>
          </div>

          <div className="panel-row">
            <span className="panel-row-label">本次名称</span>
            <input className="text" placeholder="留空叫「录屏」"
              value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <button className="start-btn" onClick={start} disabled={busy || !displays.length}>
            <i />开始录制
          </button>

          <div className="panel-foot">
            存到 {settings.saveDir.split("/").slice(-2).join(" / ")}
            <button className="linkish" onClick={() => api.openSettings("general")}>更改</button>
          </div>
        </>
      )}
    </div>
  );
}
