use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayInfo {
    pub id: u32,
    pub width: i64,
    pub height: i64,
    #[serde(rename = "originX")]
    pub origin_x: f64,
    #[serde(rename = "originY")]
    pub origin_y: f64,
    #[serde(rename = "isMain")]
    pub is_main: bool,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowInfo {
    pub id: u32,
    pub title: String,
    pub app: String,
    pub width: i64,
    pub height: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AreaRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MouseSample {
    pub t: f64,
    pub x: f64,
    pub y: f64,
    pub down: bool,
    /// 手动缩放级别（快捷键+滚轮 / 点击开关），缺省 1.0 表示没有手动放大
    #[serde(default = "one")]
    pub z: f64,
}

fn one() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MouseTrack {
    pub width: f64,
    pub height: f64,
    #[serde(rename = "originX")]
    pub origin_x: f64,
    #[serde(rename = "originY")]
    pub origin_y: f64,
    pub samples: Vec<MouseSample>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoomSegment {
    pub start: f64,
    pub end: f64,
    #[serde(rename = "zoomIn")]
    pub zoom_in: f64,
    #[serde(rename = "zoomOut")]
    pub zoom_out: f64,
    pub scale: f64,
    #[serde(rename = "focusX")]
    pub focus_x: f64,
    #[serde(rename = "focusY")]
    pub focus_y: f64,
    pub follow: bool,
    pub easing: String,
    /// 手动缩放（trigger == "manual"）专用：为 true 时导出阶段直接按录制时的
    /// 真实缩放曲线逐帧取值，不再套用 zoomIn/zoomOut 的自动缓入缓出包络。
    #[serde(rename = "trackCurve", default)]
    pub track_curve: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorStyle {
    pub kind: String,
    pub size: f64,
    pub color: String,
    #[serde(rename = "outlineColor")]
    pub outline_color: String,
    #[serde(rename = "clickRipple")]
    pub click_ripple: bool,
    pub smoothing: f64,
    #[serde(rename = "scaleWithZoom")]
    pub scale_with_zoom: bool,
}

impl Default for CursorStyle {
    fn default() -> Self {
        Self {
            kind: "arrow".into(),
            size: 1.4,
            color: "#FFFFFF".into(),
            outline_color: "#111111".into(),
            click_ripple: true,
            smoothing: 0.55,
            scale_with_zoom: false,
        }
    }
}

/// 自动放大的生成参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoomParams {
    /// 放大方式，五选一：none | dwell | click | clickToggle | manual
    #[serde(default = "default_trigger")]
    pub trigger: String,
    pub scale: f64,
    #[serde(rename = "zoomIn")]
    pub zoom_in: f64,
    #[serde(rename = "zoomOut")]
    pub zoom_out: f64,
    /// 触发后至少保持多久
    pub hold: f64,
    /// 停留多久算“停留”
    #[serde(rename = "dwellTime")]
    pub dwell_time: f64,
    /// 停留判定半径（归一化，0~1）
    #[serde(rename = "dwellRadius")]
    pub dwell_radius: f64,
    /// 两段放大之间的最小间隔
    #[serde(rename = "minGap")]
    pub min_gap: f64,
    /// 是否在放大期间跟随鼠标平移
    pub follow: bool,
    pub easing: String,
    /// 手动模式（trigger == "manual"）用的三个物理按键码（CGKeyCode），
    /// 由设置页里"点击设置"实际按键采集得到，不写死具体键盘布局。
    /// 缺省沿用标准 ANSI 键盘的 A / Z / X。
    #[serde(rename = "hotkeyA", default = "default_hotkey_a")]
    pub hotkey_a: u16,
    #[serde(rename = "hotkeyZ", default = "default_hotkey_z")]
    pub hotkey_z: u16,
    #[serde(rename = "hotkeyX", default = "default_hotkey_x")]
    pub hotkey_x: u16,
}

fn default_hotkey_a() -> u16 { 0x00 }
fn default_hotkey_z() -> u16 { 0x06 }
fn default_hotkey_x() -> u16 { 0x07 }

fn default_trigger() -> String {
    "dwell".into()
}

impl Default for ZoomParams {
    fn default() -> Self {
        Self {
            trigger: "dwell".into(),
            scale: 1.8,
            zoom_in: 0.9,
            zoom_out: 0.7,
            hold: 1.6,
            dwell_time: 0.9,
            dwell_radius: 0.04,
            min_gap: 0.6,
            follow: true,
            easing: "quadOut".into(),
            hotkey_a: default_hotkey_a(),
            hotkey_z: default_hotkey_z(),
            hotkey_x: default_hotkey_x(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordConfig {
    #[serde(rename = "displayId")]
    pub display_id: u32,
    /// 1080 / 1440 / 2160
    pub height: i64,
    pub fps: i64,
    /// h264 | hevc
    pub codec: String,
    #[serde(rename = "bitrateMbps")]
    pub bitrate_mbps: f64,
    /// none | system | mic
    #[serde(rename = "audioSource")]
    pub audio_source: String,
    #[serde(rename = "saveDir")]
    pub save_dir: String,
    pub cursor: CursorStyle,
    pub zoom: ZoomParams,
    #[serde(rename = "projectName")]
    pub project_name: Option<String>,
    /// display | area | window
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default)]
    pub area: Option<AreaRect>,
    #[serde(rename = "windowId", default)]
    pub window_id: Option<u32>,
}

fn default_mode() -> String {
    "display".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub dir: String,
    pub name: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub video: String,
    #[serde(rename = "trackPath")]
    pub track_path: String,
    pub duration: f64,
    pub width: i64,
    pub height: i64,
    pub fps: i64,
    pub segments: Vec<ZoomSegment>,
    pub cursor: CursorStyle,
    pub zoom: ZoomParams,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    /// 1080 / 1440 / 2160
    pub height: i64,
    pub fps: i64,
    pub codec: String,
    #[serde(rename = "bitrateMbps")]
    pub bitrate_mbps: f64,
    /// mp4 | mov
    pub format: String,
    #[serde(rename = "trimStart")]
    pub trim_start: f64,
    #[serde(rename = "trimEnd")]
    pub trim_end: f64,
    #[serde(rename = "outputPath")]
    pub output_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(rename = "saveDir")]
    pub save_dir: String,
    #[serde(rename = "defaultHeight")]
    pub default_height: i64,
    #[serde(rename = "defaultFps")]
    pub default_fps: i64,
    #[serde(rename = "defaultCodec")]
    pub default_codec: String,
    #[serde(rename = "defaultBitrate")]
    pub default_bitrate: f64,
    #[serde(rename = "audioSource")]
    pub audio_source: String,
    pub cursor: CursorStyle,
    pub zoom: ZoomParams,

    // 下面三个是「上次录的是什么范围」。以前它们只活在页面里，
    // 每次重开软件都要重新选一遍整屏/选区/窗口和显示器。
    // 都带 serde default：老的 settings.json 里没有这几个字段，
    // 少了 default 整个文件会反序列化失败，用户的其它设置会被一起清空。
    /// display | area | window
    #[serde(rename = "captureMode", default = "default_capture_mode")]
    pub capture_mode: String,
    #[serde(rename = "displayId", default)]
    pub display_id: Option<u32>,
    #[serde(default)]
    pub area: Option<AreaRect>,

    /// 悬浮控制条样式：preview（带实时预览）| minimal（只有圆点+计时+按钮）
    #[serde(rename = "hudStyle", default = "default_hud_style")]
    pub hud_style: String,
}

fn default_capture_mode() -> String {
    "display".into()
}

fn default_hud_style() -> String {
    "preview".into()
}

impl Settings {
    pub fn fallback() -> Self {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
        Self {
            save_dir: format!("{home}/Movies/AGRec"),
            default_height: 1440,
            default_fps: 60,
            default_codec: "hevc".into(),
            default_bitrate: 40.0,
            audio_source: "mic".into(),
            cursor: CursorStyle::default(),
            zoom: ZoomParams::default(),
            capture_mode: default_capture_mode(),
            display_id: None,
            area: None,
            hud_style: default_hud_style(),
        }
    }
}
