import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import {
  api, CURSOR_KINDS, RESOLUTIONS, ZOOM_TRIGGERS,
  type AreaRect, type CaptureMode, type DisplayInfo, type EnvStatus,
  type Project, type Settings, type WindowInfo,
} from "../lib/api";
import { Button, Card, HotkeyField, Row, Segmented, Slider, Tip, Toggle, formatTime } from "../components/UI";
import { CursorGlyph } from "../components/CursorGlyph";

type Props = {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onRecorded: (p: Project) => void;
};

export default function RecordPage({ settings, onSettings, onRecorded }: Props) {
  const [env, setEnv] = useState<EnvStatus | null>(null);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [displayId, setDisplayId] = useState<number>(0);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("display");
  const [area, setArea] = useState<AreaRect | null>(null);
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
      const main = d.find((x) => x.isMain) ?? d[0];
      if (main) setDisplayId(main.id);
    }).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (captureMode === "window" && windows.length === 0) {
      api.listWindows().then(setWindows).catch((e) => setError(String(e)));
    }
    if (captureMode !== "area") setArea(null);
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

  async function pickDir() {
    const dir = await open({ directory: true, multiple: false, title: "选择视频保存位置" });
    if (typeof dir === "string") patch({ saveDir: dir });
  }

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
      const project = await api.stopRecording();
      setRecording(false);
      onRecorded(project);
    } catch (e) {
      setError(String(e));
      setRecording(false);
    } finally {
      setBusy(false);
    }
  }

  const res = RESOLUTIONS.find((r) => r.height === settings.defaultHeight) ?? RESOLUTIONS[1];

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
                    onChange={(v) => { setDisplayId(v); setArea(null); }}
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

          <Card title="画质" desc="按显示器 / 选区 / 窗口的原始比例输出，高度对齐所选档位">
            <Row label="清晰度">
              <Segmented
                value={settings.defaultHeight}
                options={RESOLUTIONS.map((r) => ({ value: r.height, label: r.label }))}
                onChange={(h) => {
                  const r = RESOLUTIONS.find((x) => x.height === h)!;
                  patch({ defaultHeight: h, defaultBitrate: r.bitrate });
                }}
              />
            </Row>
            <Row label="帧率">
              <Segmented
                value={settings.defaultFps}
                options={[
                  { value: 30, label: "30 fps" },
                  { value: 60, label: "60 fps" },
                ]}
                onChange={(v) => patch({ defaultFps: v })}
              />
            </Row>
            <Row label="编码" hint="HEVC 同画质体积更小；H.264 兼容性最好">
              <Segmented
                value={settings.defaultCodec}
                options={[
                  { value: "hevc", label: "HEVC / H.265" },
                  { value: "h264", label: "H.264" },
                ]}
                onChange={(v) => patch({ defaultCodec: v })}
              />
            </Row>
            <Row label="码率" hint={`${res.label} 推荐 ${res.bitrate} Mbps`}>
              <Slider value={settings.defaultBitrate} min={8} max={160} step={2}
                onChange={(v) => patch({ defaultBitrate: v })}
                format={(v) => `${v} Mbps`} />
            </Row>
            <Row label="声音">
              <Segmented
                value={settings.audioSource}
                options={[
                  { value: "mic", label: "麦克风讲解" },
                  { value: "system", label: "系统内录" },
                  { value: "none", label: "不录声音" },
                ]}
                onChange={(v) => patch({ audioSource: v })}
              />
            </Row>
          </Card>

          <Card title="保存位置" desc="每次录制会在这里新建一个项目文件夹">
            <Row label="文件夹">
              <div className="path-row">
                <input className="text" value={settings.saveDir}
                  onChange={(e) => patch({ saveDir: e.target.value })} />
                <Button onClick={pickDir}>选择…</Button>
              </div>
            </Row>
            <Row label="本次名称" hint="留空则默认叫「录屏」">
              <input className="text" placeholder="例如：第 12 讲 · 财报怎么读"
                value={name} onChange={(e) => setName(e.target.value)} />
            </Row>
          </Card>

          <Card title="鼠标样式" desc="录制时不录系统指针，导出时用你选的样式重绘，放大后依然清晰">
            <div className="cursor-grid">
              {CURSOR_KINDS.map((c) => (
                <button key={c.value}
                  className={`cursor-card ${settings.cursor.kind === c.value ? "on" : ""}`}
                  onClick={() => patchCursor({ kind: c.value })}>
                  <div className="preview">
                    <CursorGlyph kind={c.value} color={settings.cursor.color}
                      outlineColor={settings.cursor.outlineColor} size={44} />
                  </div>
                  <b>{c.label}</b>
                  <em>{c.desc}</em>
                </button>
              ))}
            </div>
            <Row label="指针大小">
              <Slider value={settings.cursor.size} min={0.8} max={3} step={0.1}
                onChange={(v) => patchCursor({ size: v })}
                format={(v) => `${v.toFixed(1)}×`} />
            </Row>
            <Row label="主色 / 描边">
              <div className="colors">
                <input type="color" value={settings.cursor.color}
                  onChange={(e) => patchCursor({ color: e.target.value })} />
                <input type="color" value={settings.cursor.outlineColor}
                  onChange={(e) => patchCursor({ outlineColor: e.target.value })} />
              </div>
            </Row>
            <Row label="点击水波纹" hint="点击时出现扩散圆环，观众更容易注意到">
              <Toggle value={settings.cursor.clickRipple}
                onChange={(v) => patchCursor({ clickRipple: v })} />
            </Row>
            <Row label="指针跟手程度" hint="越低越平滑，越高越贴近真实轨迹">
              <Slider value={settings.cursor.smoothing} min={0.1} max={1} step={0.05}
                onChange={(v) => patchCursor({ smoothing: v })}
                format={(v) => `${Math.round(v * 100)}%`} />
            </Row>
            <Row label="放大时指针跟着变大">
              <Toggle value={settings.cursor.scaleWithZoom}
                onChange={(v) => patchCursor({ scaleWithZoom: v })} />
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

            {settings.zoom.trigger === "manual" && (
              <div className="hint-box">
                <b>录制中的快捷键</b>{" "}
                <Tip text="键不对、换了外接键盘识别不到？点“点击设置”，自己在键盘上按一下想用的键就行，采集的是这把键盘实际上报的按键，跟型号、布局无关。两个手势看的是按下缩小键那一刻前置键在不在，跟按住多久无关。注意：录制中在输入框里打字，如果打到跟“缩小键”一样的字母会被当成归位，建议挑一个平时打字不常用的键。不做操作时倍数一直保持，画面持续跟随鼠标移动，只影响录出来的视频，不影响你自己看到的屏幕。" />
                <div className="hotkey-row">
                  前置键 <HotkeyField value={settings.zoom.hotkeyA}
                    onChange={(v) => patchZoom({ hotkeyA: v })} /> +
                  放大键 <HotkeyField value={settings.zoom.hotkeyZ}
                    onChange={(v) => patchZoom({ hotkeyZ: v })} /> — 持续放大，松开停在当前倍数
                </div>
                <div className="hotkey-row">
                  前置键 <HotkeyField value={settings.zoom.hotkeyA}
                    onChange={(v) => patchZoom({ hotkeyA: v })} /> +
                  缩小键 <HotkeyField value={settings.zoom.hotkeyX}
                    onChange={(v) => patchZoom({ hotkeyX: v })} /> — 缓慢缩小，松开停在当前倍数
                </div>
                <div>单独按一下缩小键（不按前置键）— 一步归位到 1.00×</div>
              </div>
            )}

            {settings.zoom.trigger !== "none" && (
              <>
                <Row label="放大倍数" hint={settings.zoom.trigger === "manual" ? "手动模式下这是起始倍数" : undefined}>
                  <Slider value={settings.zoom.scale} min={1.2} max={3} step={0.1}
                    onChange={(v) => patchZoom({ scale: v })} format={(v) => `${v.toFixed(1)}×`} />
                </Row>
                <Row label="缓入时长" hint="二次方缓出，越长越柔和">
                  <Slider value={settings.zoom.zoomIn} min={0.2} max={2.5} step={0.1}
                    onChange={(v) => patchZoom({ zoomIn: v })} format={(v) => `${v.toFixed(1)} 秒`} />
                </Row>
                <Row label="缓出时长">
                  <Slider value={settings.zoom.zoomOut} min={0.2} max={2.5} step={0.1}
                    onChange={(v) => patchZoom({ zoomOut: v })} format={(v) => `${v.toFixed(1)} 秒`} />
                </Row>
              </>
            )}

            {(settings.zoom.trigger === "dwell" || settings.zoom.trigger === "click") && (
              <>
                <Row label="保持时长" hint="触发后至少放大多久">
                  <Slider value={settings.zoom.hold} min={0.4} max={6} step={0.2}
                    onChange={(v) => patchZoom({ hold: v })} format={(v) => `${v.toFixed(1)} 秒`} />
                </Row>
                <Row label="放大后跟随鼠标平移" hint="关掉则锁定在触发点">
                  <Toggle value={settings.zoom.follow} onChange={(v) => patchZoom({ follow: v })} />
                </Row>
              </>
            )}

            {settings.zoom.trigger === "dwell" && (
              <Row label="停留判定" hint="在多小的范围里停多久算“在讲这里”">
                <div className="inline">
                  <Slider value={settings.zoom.dwellTime} min={0.3} max={3} step={0.1}
                    onChange={(v) => patchZoom({ dwellTime: v })} format={(v) => `${v.toFixed(1)} 秒`} />
                  <Slider value={settings.zoom.dwellRadius} min={0.01} max={0.15} step={0.005}
                    onChange={(v) => patchZoom({ dwellRadius: v })}
                    format={(v) => `${Math.round(v * 100)}% 画面`} />
                </div>
              </Row>
            )}
          </Card>

          <div className="footer-bar">
            <Button kind="primary" onClick={start} disabled={busy || !displays.length}>
              开始录制
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
