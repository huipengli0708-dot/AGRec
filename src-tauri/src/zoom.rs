use crate::model::{MouseTrack, ZoomParams, ZoomSegment};

/// 依据鼠标轨迹生成放大片段。放大方式是**五选一**，互不叠加：
/// - none        不放大
/// - dwell       鼠标在小范围内停留超过阈值就放大
/// - click       左键点击处放大，保持一段时间后自动缩回
/// - clickToggle 点一下放大、再点一下缩回（录制时已实时写进轨迹的 z 字段）
/// - manual      按住 Z + 滚轮无级调节、按 X 缩回（同样写进 z 字段）
///
/// clickToggle 与 manual 都属于「你在录制时明确表达过的意图」，直接照搬轨迹里的缩放级别，
/// 不做任何自动推断。
pub fn generate(track: &MouseTrack, p: &ZoomParams) -> Vec<ZoomSegment> {
    if track.samples.is_empty() || track.width <= 0.0 || track.height <= 0.0 {
        return vec![];
    }

    let norm: Vec<(f64, f64, f64, bool, f64)> = track
        .samples
        .iter()
        .map(|s| {
            (
                s.t,
                (s.x / track.width).clamp(0.0, 1.0),
                (s.y / track.height).clamp(0.0, 1.0),
                s.down,
                if s.z.is_finite() && s.z >= 1.0 { s.z } else { 1.0 },
            )
        })
        .collect();

    let total = norm.last().map(|s| s.0).unwrap_or(0.0);

    match p.trigger.as_str() {
        "none" => vec![],
        "manual" | "clickToggle" => manual_segments(&norm, p, total),
        "click" => auto_segments(click_triggers(&norm), p, total),
        _ => auto_segments(dwell_triggers(&norm, p), p, total),
    }
}

/// 手动放大：把轨迹里 z > 1 的连续区间原样变成片段，倍数取区间峰值
fn manual_segments(
    norm: &[(f64, f64, f64, bool, f64)],
    p: &ZoomParams,
    total: f64,
) -> Vec<ZoomSegment> {
    // "manual"（按住 A+Z/A+X 无级调节）里，用户在录制时已经亲手控过一遍缩放曲线，
    // 导出时要原样回放这条曲线（何时停、停在哪个倍数都照录），不能再套一层自动缓入缓出，
    // 否则不管手上怎么控，导出的视频永远是同一条自动收尾曲线——这正是「A+X 缩回时停不下来」的根因。
    // "clickToggle"（点一下瞬间切换）没有这层手控曲线可言，仍然用 zoomIn/zoomOut 包络做平滑动画。
    let continuous = p.trigger == "manual";
    let mut segs = Vec::new();
    let mut i = 0usize;
    while i < norm.len() {
        if norm[i].4 <= 1.02 {
            i += 1;
            continue;
        }
        let start = norm[i].0;
        let mut peak = norm[i].4;
        let (mut sx, mut sy, mut cnt): (f64, f64, f64) = (0.0, 0.0, 0.0);
        let mut j = i;
        while j < norm.len() && norm[j].4 > 1.02 {
            peak = peak.max(norm[j].4);
            sx += norm[j].1;
            sy += norm[j].2;
            cnt += 1.0;
            j += 1;
        }
        let end = norm[j.min(norm.len() - 1)].0;
        // 太短的（手抖滚一下）忽略
        if end - start >= 0.25 {
            segs.push(ZoomSegment {
                start: if continuous { start.max(0.0) } else { (start - p.zoom_in * 0.5).max(0.0) },
                // 手控曲线也留一小截尾巴：单独点 X 归位时 z 是一帧之内从 1.6 掉到 1.0 的，
                // 片段要是正好切在这一帧，导出时平滑还没走完就没片段可用了，画面会「啪」一下跳。
                // 多留 0.45 秒让曲线在片段内部自然收到 1.0×。
                end: if continuous { (end + 0.45).min(total.max(end + 0.2)) } else { (end + p.zoom_out).min(total.max(end + 0.2)) },
                zoom_in: p.zoom_in,
                zoom_out: p.zoom_out,
                scale: peak,
                focus_x: sx / cnt.max(1.0),
                focus_y: sy / cnt.max(1.0),
                // 手动放大期间画面始终跟随鼠标
                follow: true,
                easing: p.easing.clone(),
                track_curve: continuous,
            });
        }
        i = j.max(i + 1);
    }
    dedup_overlaps(segs)
}

/// 左键点击触发点
fn click_triggers(norm: &[(f64, f64, f64, bool, f64)]) -> Vec<(f64, f64, f64)> {
    let mut out = Vec::new();
    let mut prev_down = false;
    for &(t, x, y, down, _) in norm {
        if down && !prev_down && t > 0.25 {
            out.push((t, x, y));
        }
        prev_down = down;
    }
    out
}

/// 鼠标停留触发点
fn dwell_triggers(norm: &[(f64, f64, f64, bool, f64)], p: &ZoomParams) -> Vec<(f64, f64, f64)> {
    let mut out = Vec::new();
    let mut i = 0usize;
    let mut last_dwell = -10.0f64;
    while i < norm.len() {
        let t0 = norm[i].0;
        if t0 - last_dwell < p.dwell_time + p.hold {
            i += 1;
            continue;
        }
        let mut j = i;
        let (mut sx, mut sy, mut cnt): (f64, f64, f64) = (0.0, 0.0, 0.0);
        let (mut minx, mut maxx, mut miny, mut maxy) = (1.0f64, 0.0f64, 1.0f64, 0.0f64);
        while j < norm.len() && norm[j].0 - t0 <= p.dwell_time {
            let (_, x, y, _, _) = norm[j];
            sx += x;
            sy += y;
            cnt += 1.0;
            minx = minx.min(x);
            maxx = maxx.max(x);
            miny = miny.min(y);
            maxy = maxy.max(y);
            j += 1;
        }
        if cnt > 4.0 && (maxx - minx) <= p.dwell_radius && (maxy - miny) <= p.dwell_radius {
            let t = t0 + p.dwell_time;
            out.push((t, sx / cnt, sy / cnt));
            last_dwell = t;
            i = j;
        } else {
            i += 1;
        }
    }
    out
}

/// 把自动触发点合并成片段
fn auto_segments(
    mut triggers: Vec<(f64, f64, f64)>,
    p: &ZoomParams,
    total: f64,
) -> Vec<ZoomSegment> {
    triggers.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let lead = 0.12_f64; // 触发前一点点开始缓入，让动作看起来有预判
    let mut segs: Vec<ZoomSegment> = Vec::new();
    for (t, fx, fy) in triggers {
        let start = (t - lead).max(0.0);
        let end = (t + p.hold + p.zoom_out).min(total.max(t + 0.2));

        if let Some(last) = segs.last_mut() {
            if start <= last.end + p.min_gap {
                last.end = last.end.max(end);
                last.focus_x = (last.focus_x + fx) / 2.0;
                last.focus_y = (last.focus_y + fy) / 2.0;
                continue;
            }
        }
        segs.push(ZoomSegment {
            start,
            end,
            zoom_in: p.zoom_in,
            zoom_out: p.zoom_out,
            scale: p.scale,
            focus_x: fx,
            focus_y: fy,
            follow: p.follow,
            easing: p.easing.clone(),
            track_curve: false,
        });
    }
    segs.retain(|s| s.end - s.start >= s.zoom_in + s.zoom_out * 0.6);
    dedup_overlaps(segs)
}

fn dedup_overlaps(mut segs: Vec<ZoomSegment>) -> Vec<ZoomSegment> {
    segs.sort_by(|a, b| a.start.partial_cmp(&b.start).unwrap_or(std::cmp::Ordering::Equal));
    for i in 1..segs.len() {
        let prev_end = segs[i - 1].end;
        if segs[i].start < prev_end {
            segs[i].start = prev_end + 0.02;
        }
    }
    segs.retain(|s| s.end - s.start > 0.3);
    segs
}
