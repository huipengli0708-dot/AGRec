import type { MouseTrack, ZoomSegment } from "./api";

export function ease(u: number, kind: string): number {
  const x = Math.min(Math.max(u, 0), 1);
  if (kind === "cubicOut") return 1 - Math.pow(1 - x, 3);
  if (kind === "inOutQuad") return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  return 1 - Math.pow(1 - x, 2);
}

function indexAt(track: MouseTrack, t: number): number {
  const s = track.samples;
  let lo = 0, hi = s.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s[mid].t <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans;
}

/** 取 [t-window, t] 内的平均位置，作为预览用的平滑值 */
function averaged(track: MouseTrack, t: number, win: number) {
  const s = track.samples;
  if (!s.length) return { x: 0.5, y: 0.5, down: false };
  const end = indexAt(track, t);
  let i = end, sx = 0, sy = 0, n = 0, down = s[end].down;
  while (i >= 0 && t - s[i].t <= win) {
    sx += s[i].x; sy += s[i].y; n++; i--;
  }
  if (!n) { sx = s[end].x; sy = s[end].y; n = 1; }
  return {
    x: Math.min(Math.max(sx / n / (track.width || 1), 0), 1),
    y: Math.min(Math.max(sy / n / (track.height || 1), 0), 1),
    down,
  };
}

export type PreviewFrame = {
  zoom: number;
  focusX: number;
  focusY: number;
  cursorX: number;
  cursorY: number;
};

export function computeFrame(
  t: number,
  segments: ZoomSegment[],
  track: MouseTrack | null
): PreviewFrame {
  const cur = track ? averaged(track, t, 0.05) : { x: 0.5, y: 0.5, down: false };
  const foc = track ? averaged(track, t, 0.55) : { x: 0.5, y: 0.5, down: false };

  let zoom = 1, fx = 0.5, fy = 0.5, best = 0;
  for (const seg of segments) {
    if (t < seg.start || t > seg.end) continue;
    const zi = Math.max(seg.zoomIn, 0.01);
    const zo = Math.max(seg.zoomOut, 0.01);
    let p: number;
    if (t < seg.start + zi) p = ease((t - seg.start) / zi, seg.easing);
    else if (t > seg.end - zo) p = ease((seg.end - t) / zo, seg.easing);
    else p = 1;
    p = Math.min(Math.max(p, 0), 1);
    if (p <= best) continue;
    best = p;
    zoom = 1 + (seg.scale - 1) * p;
    const tx = seg.follow ? foc.x : seg.focusX;
    const ty = seg.follow ? foc.y : seg.focusY;
    fx = 0.5 + (tx - 0.5) * p;
    fy = 0.5 + (ty - 0.5) * p;
  }
  return { zoom, focusX: fx, focusY: fy, cursorX: cur.x, cursorY: cur.y };
}

/** 把焦点换算成 CSS transform（等价于导出时的裁剪逻辑） */
export function frameTransform(f: PreviewFrame) {
  const z = Math.max(f.zoom, 1);
  const cropW = 1 / z, cropH = 1 / z;
  let cx = f.focusX - cropW / 2;
  let cy = f.focusY - cropH / 2;
  cx = Math.min(Math.max(cx, 0), 1 - cropW);
  cy = Math.min(Math.max(cy, 0), 1 - cropH);
  // 以百分比表示的位移（相对容器宽高）
  return {
    scale: z,
    translateX: -cx * z * 100,
    translateY: -cy * z * 100,
    cropX: cx,
    cropY: cy,
    cropW,
    cropH,
  };
}
