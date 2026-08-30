import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import {
  api, CURSOR_KINDS, RESOLUTIONS,
  type MouseTrack, type Project, type ZoomSegment,
} from "../lib/api";
import { computeFrame, frameTransform } from "../lib/preview";
import { Button, Card, Row, Segmented, Slider, Toggle, formatTime } from "../components/UI";
import { CursorGlyph, hotspotOf } from "../components/CursorGlyph";

type Props = { project: Project; onChange: (p: Project) => void; onBack: () => void };

export default function EditorPage({ project, onChange, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [track, setTrack] = useState<MouseTrack | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(project.duration || 0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number>(-1);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [previewZoom, setPreviewZoom] = useState(true);
  // 预览画布必须跟视频真实比例一致。比例对不上的话，object-fit: contain
  // 会在画面上下（或左右）留出黑边，而鼠标图层是按「整个画布」的百分比定位的，
  // 两套坐标系就差了一条黑边的宽度——放大之后这点误差还会被乘以放大倍数。
  const [videoAspect, setVideoAspect] = useState<number | null>(null);

  const [opts, setOpts] = useState({
    height: project.height || 1440,
    fps: project.fps || 60,
    codec: "hevc" as "hevc" | "h264",
    bitrateMbps: 40,
    format: "mp4" as "mp4" | "mov",
  });

  useEffect(() => {
    api.readTrack(project.trackPath).then(setTrack).catch(() => setTrack(null));
  }, [project.trackPath]);

  useEffect(() => {
    const un = listen<number>("export-progress", (e) => setProgress(e.payload));
    return () => { un.then((f) => f()); };
  }, []);

  // 播放时逐帧刷新预览
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) setTime(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const frame = useMemo(
    () => computeFrame(time, previewZoom ? project.segments : [], track),
    [time, project.segments, track, previewZoom]
  );
  const tf = frameTransform(frame);
  const hot = hotspotOf(project.cursor.kind);

  function update(p: Partial<Project>) {
    const next = { ...project, ...p };
    onChange(next);
    api.saveProject(next).catch(() => {});
  }

  function updateSegment(i: number, p: Partial<ZoomSegment>) {
    const segs = project.segments.map((s, idx) => (idx === i ? { ...s, ...p } : s));
    update({ segments: segs });
  }

  function addSegment() {
    const start = time;
    const seg: ZoomSegment = {
      start,
      end: Math.min(start + project.zoom.hold + project.zoom.zoomOut, duration),
      zoomIn: project.zoom.zoomIn,
      zoomOut: project.zoom.zoomOut,
      scale: project.zoom.scale,
      focusX: frame.cursorX,
      focusY: frame.cursorY,
      follow: project.zoom.follow,
      easing: project.zoom.easing,
    };
    const segs = [...project.segments, seg].sort((a, b) => a.start - b.start);
    update({ segments: segs });
    setSelected(segs.indexOf(seg));
  }

  function removeSegment(i: number) {
    update({ segments: project.segments.filter((_, idx) => idx !== i) });
    setSelected(-1);
  }

  async function regenerate() {
    try {
      const segs = await api.regenerateZoom(project.trackPath, project.zoom);
      update({ segments: segs });
      setMessage(`已按当前参数重新生成 ${segs.length} 段放大`);
    } catch (e) {
      setMessage(String(e));
    }
  }

  async function doExport() {
    setMessage("");
    const suggested = `${project.name}_成品.${opts.format}`;
    const path = await save({
      title: "导出到",
      defaultPath: `${project.dir}/${suggested}`,
      filters: [{ name: "视频", extensions: [opts.format] }],
    });
    if (!path) return;
    setExporting(true);
    setProgress(0);
    try {
      const out = await api.exportVideo(project, {
        height: opts.height,
        fps: opts.fps,
        codec: opts.codec,
        bitrateMbps: opts.bitrateMbps,
        format: opts.format,
        trimStart: 0,
        trimEnd: 0,
        outputPath: path,
      });
      setMessage(`导出完成：${out}`);
      api.revealInFinder(out).catch(() => {});
    } catch (e) {
      setMessage(`导出失败：${e}`);
    } finally {
      setExporting(false);
    }
  }

  function seek(t: number) {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(t, duration));
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  }

  const seg = selected >= 0 ? project.segments[selected] : null;
  const cursorPx = 32 * project.cursor.size * (previewZoom && project.cursor.scaleWithZoom ? tf.scale : 1) * 0.55;

  return (
    <div className="editor">
      <div className="editor-main">
        <div className="stage-wrap">
          <div
            className="stage"
            ref={stageRef}
            style={videoAspect ? { aspectRatio: `${videoAspect}` } : undefined}
          >
            <video
              ref={videoRef}
              src={convertFileSrc(project.video)}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setDuration(v.duration);
                if (v.videoWidth > 0 && v.videoHeight > 0) {
                  setVideoAspect(v.videoWidth / v.videoHeight);
                }
              }}
              onEnded={() => setPlaying(false)}
              style={{
                transformOrigin: "0 0",
                transform: `scale(${tf.scale}) translate(${-tf.cropX * 100}%, ${-tf.cropY * 100}%)`,
              }}
            />
            {project.cursor.kind !== "none" && track && (
              <div
                className="cursor-layer"
                style={{
                  left: `${(frame.cursorX - tf.cropX) * tf.scale * 100}%`,
                  top: `${(frame.cursorY - tf.cropY) * tf.scale * 100}%`,
                  transform: `translate(${-hot.x * cursorPx}px, ${-hot.y * cursorPx}px)`,
                }}
              >
                <CursorGlyph kind={project.cursor.kind} color={project.cursor.color}
                  outlineColor={project.cursor.outlineColor} size={cursorPx} />
              </div>
            )}
            <div className="zoom-badge">{tf.scale.toFixed(2)}×</div>
          </div>
        </div>

        <div className="transport">
          <Button onClick={togglePlay}>{playing ? "暂停" : "播放"}</Button>
          <span className="tc">{formatTime(time)} / {formatTime(duration)}</span>
          <Toggle value={previewZoom} onChange={setPreviewZoom} label="预览放大效果" />
          <div className="spacer" />
          <Button onClick={addSegment}>在此处新增放大</Button>
          <Button onClick={regenerate}>重新自动生成</Button>
        </div>

        <div className="timeline">
          <div className="track"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - r.left) / r.width) * duration);
            }}>
            {project.segments.map((s, i) => (
              <div key={i}
                className={`seg ${i === selected ? "on" : ""}`}
                style={{
                  left: `${(s.start / Math.max(duration, 0.01)) * 100}%`,
                  width: `${((s.end - s.start) / Math.max(duration, 0.01)) * 100}%`,
                }}
                onClick={(e) => { e.stopPropagation(); setSelected(i); seek(s.start); }}
                title={`${formatTime(s.start)} → ${formatTime(s.end)} · ${s.scale.toFixed(1)}×`}>
                <span>{s.scale.toFixed(1)}×</span>
              </div>
            ))}
            <div className="playhead" style={{ left: `${(time / Math.max(duration, 0.01)) * 100}%` }} />
          </div>
          <div className="ticks">
            <span>{formatTime(0)}</span><span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <aside className="editor-side">
        <div className="side-head">
          <Button kind="ghost" onClick={onBack}>← 返回</Button>
          <div>
            <b>{project.name}</b>
            <em className="muted">{project.createdAt}</em>
          </div>
        </div>

        {seg ? (
          <Card title={`放大片段 ${selected + 1}`} desc={`${formatTime(seg.start)} → ${formatTime(seg.end)}`}
            right={<Button kind="danger" onClick={() => removeSegment(selected)}>删除</Button>}>
            <Row label="放大倍数">
              <Slider value={seg.scale} min={1.1} max={4} step={0.05}
                onChange={(v) => updateSegment(selected, { scale: v })}
                format={(v) => `${v.toFixed(2)}×`} />
            </Row>
            <Row label="开始时间">
              <Slider value={seg.start} min={0} max={Math.max(duration, 1)} step={0.05}
                onChange={(v) => updateSegment(selected, { start: Math.min(v, seg.end - 0.3) })}
                format={formatTime} />
            </Row>
            <Row label="结束时间">
              <Slider value={seg.end} min={0} max={Math.max(duration, 1)} step={0.05}
                onChange={(v) => updateSegment(selected, { end: Math.max(v, seg.start + 0.3) })}
                format={formatTime} />
            </Row>
            <Row label="缓入 / 缓出">
              <div className="inline">
                <Slider value={seg.zoomIn} min={0.1} max={3} step={0.05}
                  onChange={(v) => updateSegment(selected, { zoomIn: v })}
                  format={(v) => `${v.toFixed(2)}s`} />
                <Slider value={seg.zoomOut} min={0.1} max={3} step={0.05}
                  onChange={(v) => updateSegment(selected, { zoomOut: v })}
                  format={(v) => `${v.toFixed(2)}s`} />
              </div>
            </Row>
            <Row label="缓动曲线">
              <Segmented value={seg.easing}
                options={[
                  { value: "quadOut", label: "二次方缓出" },
                  { value: "cubicOut", label: "三次方缓出" },
                  { value: "inOutQuad", label: "缓入缓出" },
                ]}
                onChange={(v) => updateSegment(selected, { easing: v })} />
            </Row>
            <Row label="跟随鼠标平移">
              <Toggle value={seg.follow} onChange={(v) => updateSegment(selected, { follow: v })} />
            </Row>
            {!seg.follow && (
              <Row label="焦点位置" hint="不跟随时锁定在这个点">
                <div className="inline">
                  <Slider value={seg.focusX} min={0} max={1} step={0.01}
                    onChange={(v) => updateSegment(selected, { focusX: v })}
                    format={(v) => `X ${Math.round(v * 100)}%`} />
                  <Slider value={seg.focusY} min={0} max={1} step={0.01}
                    onChange={(v) => updateSegment(selected, { focusY: v })}
                    format={(v) => `Y ${Math.round(v * 100)}%`} />
                </div>
              </Row>
            )}
          </Card>
        ) : (
          <Card title="放大片段" desc="在时间轴上点选一段来编辑，或在播放头处新增">
            <p className="muted">共 {project.segments.length} 段</p>
          </Card>
        )}

        <Card title="鼠标样式" desc="改动会直接反映到导出画面">
          <div className="cursor-grid small">
            {CURSOR_KINDS.map((c) => (
              <button key={c.value}
                className={`cursor-card ${project.cursor.kind === c.value ? "on" : ""}`}
                onClick={() => update({ cursor: { ...project.cursor, kind: c.value } })}>
                <div className="preview">
                  <CursorGlyph kind={c.value} color={project.cursor.color}
                    outlineColor={project.cursor.outlineColor} size={30} />
                </div>
                <b>{c.label}</b>
              </button>
            ))}
          </div>
          <Row label="大小">
            <Slider value={project.cursor.size} min={0.8} max={3} step={0.1}
              onChange={(v) => update({ cursor: { ...project.cursor, size: v } })}
              format={(v) => `${v.toFixed(1)}×`} />
          </Row>
          <Row label="配色">
            <div className="colors">
              <input type="color" value={project.cursor.color}
                onChange={(e) => update({ cursor: { ...project.cursor, color: e.target.value } })} />
              <input type="color" value={project.cursor.outlineColor}
                onChange={(e) => update({ cursor: { ...project.cursor, outlineColor: e.target.value } })} />
            </div>
          </Row>
          <Row label="点击水波纹">
            <Toggle value={project.cursor.clickRipple}
              onChange={(v) => update({ cursor: { ...project.cursor, clickRipple: v } })} />
          </Row>
        </Card>

        <Card title="导出" desc="按最终发布画质重新渲染，含放大动画与自定义鼠标">
          <Row label="分辨率">
            <Segmented value={opts.height}
              options={RESOLUTIONS.map((r) => ({ value: r.height, label: r.label }))}
              onChange={(h) => {
                const r = RESOLUTIONS.find((x) => x.height === h)!;
                setOpts({ ...opts, height: h, bitrateMbps: r.bitrate });
              }} />
          </Row>
          <Row label="帧率">
            <Segmented value={opts.fps}
              options={[{ value: 30, label: "30" }, { value: 60, label: "60" }]}
              onChange={(v) => setOpts({ ...opts, fps: v })} />
          </Row>
          <Row label="格式 / 编码">
            <div className="inline">
              <Segmented value={opts.format}
                options={[{ value: "mp4", label: "MP4" }, { value: "mov", label: "MOV" }]}
                onChange={(v) => setOpts({ ...opts, format: v })} />
              <Segmented value={opts.codec}
                options={[{ value: "hevc", label: "HEVC" }, { value: "h264", label: "H.264" }]}
                onChange={(v) => setOpts({ ...opts, codec: v })} />
            </div>
          </Row>
          <Row label="码率">
            <Slider value={opts.bitrateMbps} min={8} max={200} step={2}
              onChange={(v) => setOpts({ ...opts, bitrateMbps: v })}
              format={(v) => `${v} Mbps`} />
          </Row>
          {exporting && (
            <div className="progress"><div style={{ width: `${progress * 100}%` }} /></div>
          )}
          <div className="inline">
            <Button kind="primary" onClick={doExport} disabled={exporting}>
              {exporting ? `导出中 ${Math.round(progress * 100)}%` : "开始导出"}
            </Button>
            <Button onClick={() => api.revealInFinder(project.dir)}>打开项目文件夹</Button>
          </div>
          {message && <p className="muted small">{message}</p>}
        </Card>
      </aside>
    </div>
  );
}
