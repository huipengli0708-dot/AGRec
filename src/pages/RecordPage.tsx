import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  api, ZOOM_TRIGGERS,
  type AreaRect, type CaptureMode, type DisplayInfo, type EnvStatus,
  type Settings, type WindowInfo,
} from "../lib/api";
import { Button, Card, Row, Segmented, Tip, formatTime } from "../components/UI";

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
    <div className="page">
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
          <Card title="录制范围" desc="整屏、框选一块区域，或者只录某个应用窗口">
            <Row label="范围类型">
              <Segmented
                value={captureMode}
                options={[
                  { value: "display", label: "整个屏幕" },
                  { value: "area", label: "自定义选区" },
                  { value: "window", label: "应用窗口" },
                ]}
                onChange={setCaptureMode}
              />
            </Row>
            {captureMode === "display" && (
              <Row label="显示器">
                <Segmented
                  value={displayId}
                  options={displays.map((d) => ({
                    value: d.id,
                    label: `${d.name}（${d.width}×${d.height}）`,
                  }))}
                  onChange={setDisplayId}
                />
              </Row>
            )}
            {captureMode === "area" && (
              <>
                <Row label="所在显示器" hint="选区会在这台显示器上框选">
                  <Segmented
                    value={displayId}
                    options={displays.map((d) => ({ value: d.id, label: d.name }))}
                    onChange={(v) => onSettings({ ...settings, displayId: v, area: null })}
                  />
                </Row>
                <Row label="选区">
                  <div className="inline">
                    <Button onClick={pickArea} disabled={pickingArea}>
                      {pickingArea ? "请在屏幕上拖拽框选…" : area ? "重新框选" : "开始框选"}
                    </Button>
                    {area && (
                      <span className="muted small">
                        已选定 {Math.round(area.width)} × {Math.round(area.height)}
                      </span>
                    )}
                  </div>
                </Row>
              </>
            )}
            {captureMode === "window" && (
              <Row label="目标窗口">
                {windows.length === 0 ? (
                  <span className="muted small">没有找到可录制的窗口，确认目标应用没有最小化</span>
                ) : (
                  <div className="window-list">
                    {windows.map((w) => (
                      <button key={w.id}
                        className={`window-item ${windowId === w.id ? "on" : ""}`}
                        onClick={() => setWindowId(w.id)}>
                        <b>{w.title}</b>
                        <em>{w.app} · {w.width}×{w.height}</em>
                      </button>
                    ))}
                  </div>
                )}
              </Row>
            )}
          </Card>









          <Card title="声音" desc="麦克风录你的讲解；系统声音录电脑本身发出的声音（视频、音乐、提示音）">
            <Row label="录什么声音">
              <Segmented
                value={settings.audioSource}
                options={[
                  { value: "mic", label: "麦克风讲解" },
                  { value: "system", label: "系统声音" },
                  { value: "none", label: "不录声音" },
                ]}
                onChange={(v) => patch({ audioSource: v })}
              />
            </Row>
          </Card>

          <Card title="放大方式" desc="五选一，录完后按这个规则生成放大片段，编辑器里还能逐段微调">
            <div className="cursor-grid">
              {ZOOM_TRIGGERS.map((z) => (
                <button key={z.value}
                  className={`cursor-card trigger-card ${settings.zoom.trigger === z.value ? "on" : ""}`}
                  onClick={() => patchZoom({ trigger: z.value })}>
                  <span className="trigger-card-title">
                    <b>{z.label}</b>
                    <Tip text={z.desc} />
                  </span>
                </button>
              ))}
            </div>
            {settings.zoom.trigger !== "none" && (
              <div className="settings-note">
                倍数、缓入缓出
                {settings.zoom.trigger === "manual" && "、录制中用哪几个键"}
                这些参数在
                <button className="linkish" onClick={() => api.openSettings("zoom")}>设置 · 放大与快捷键</button>
                里调。
              </div>
            )}
          </Card>

          <Card title="本次录制">
            <Row label="名称" hint="留空则默认叫「录屏」">
              <input className="text" placeholder="例如：第 12 讲 · 财报怎么读"
                value={name} onChange={(e) => setName(e.target.value)} />
            </Row>
          </Card>

          <div className="footer-bar">
            <Button kind="primary" onClick={start} disabled={busy || !displays.length}>
              开始录制
            </Button>
            <span className="muted small">这一页的设置会自动保存，下次打开沿用</span>
          </div>
        </>
      )}
    </div>
  );
}
