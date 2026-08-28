declare const __BUILD_TIME__: string;
declare const __IS_DEV__: boolean;

export const BUILD_INFO = {
  time: typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "未知",
  isDev: typeof __IS_DEV__ !== "undefined" ? __IS_DEV__ : false,
};

import { invoke } from "@tauri-apps/api/core";

export type DisplayInfo = {
  id: number; width: number; height: number;
  originX: number; originY: number; isMain: boolean; name: string;
};

export type WindowInfo = { id: number; title: string; app: string; width: number; height: number };
export type AreaRect = { x: number; y: number; width: number; height: number };
export type CaptureMode = "display" | "area" | "window";

export type CursorKind = "arrow" | "arrowLight" | "dot" | "ring" | "halo" | "none";

export type CursorStyle = {
  kind: CursorKind;
  size: number;
  color: string;
  outlineColor: string;
  clickRipple: boolean;
  smoothing: number;
  scaleWithZoom: boolean;
};

export type ZoomTrigger = "none" | "dwell" | "click" | "clickToggle" | "manual";

export type ZoomParams = {
  trigger: ZoomTrigger;
  scale: number;
  zoomIn: number;
  zoomOut: number;
  hold: number;
  dwellTime: number;
  dwellRadius: number;
  minGap: number;
  follow: boolean;
  easing: "quadOut" | "cubicOut" | "inOutQuad";
};

export const ZOOM_TRIGGERS: { value: ZoomTrigger; label: string; desc: string }[] = [
  { value: "dwell", label: "鼠标停留放大", desc: "鼠标在一小块区域停住超过设定时间，自动放大到那里" },
  { value: "click", label: "点击放大", desc: "左键点哪就放大哪，保持一会儿再自动缩回" },
  { value: "clickToggle", label: "点击开关", desc: "点一下放大并保持，再点一下缩回" },
  { value: "manual", label: "快捷键手动控制", desc: "按住 A+Z 放大、A+X 慢慢缩小，松手停住；单独点 X 一步归位" },
  { value: "none", label: "不放大", desc: "全程原始画面，后期也可以在编辑器里手动加放大段" },
];

export type ZoomSegment = {
  start: number;
  end: number;
  zoomIn: number;
  zoomOut: number;
  scale: number;
  focusX: number;
  focusY: number;
  follow: boolean;
  easing: "quadOut" | "cubicOut" | "inOutQuad";
};

export type MouseSample = { t: number; x: number; y: number; down: boolean };
export type MouseTrack = {
  width: number; height: number; originX: number; originY: number; samples: MouseSample[];
};

export type RecordConfig = {
  displayId: number;
  height: number;
  fps: number;
  codec: "h264" | "hevc";
  bitrateMbps: number;
  audioSource: "none" | "system" | "mic";
  saveDir: string;
  cursor: CursorStyle;
  zoom: ZoomParams;
  projectName?: string;
  mode: CaptureMode;
  area?: AreaRect;
  windowId?: number;
};

export type Project = {
  dir: string;
  name: string;
  createdAt: string;
  video: string;
  trackPath: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  segments: ZoomSegment[];
  cursor: CursorStyle;
  zoom: ZoomParams;
};

export type ExportOptions = {
  height: number;
  fps: number;
  codec: "h264" | "hevc";
  bitrateMbps: number;
  format: "mp4" | "mov";
  trimStart: number;
  trimEnd: number;
  outputPath?: string;
};

export type Settings = {
  saveDir: string;
  defaultHeight: number;
  defaultFps: number;
  defaultCodec: "h264" | "hevc";
  defaultBitrate: number;
  audioSource: "none" | "system" | "mic";
  cursor: CursorStyle;
  zoom: ZoomParams;
};

export type EnvStatus = { helper: boolean; screen: boolean; microphone: boolean; message: string };

export const api = {
  checkEnv: () => invoke<EnvStatus>("check_env"),
  listDisplays: () => invoke<DisplayInfo[]>("list_displays"),
  listWindows: () => invoke<WindowInfo[]>("list_windows"),
  pickArea: (x: number, y: number, width: number, height: number) =>
    invoke<AreaRect>("pick_area", { x, y, width, height }),
  loadSettings: () => invoke<Settings>("load_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  startRecording: (config: RecordConfig) => invoke<string>("start_recording", { config }),
  pauseRecording: () => invoke<void>("pause_recording"),
  resumeRecording: () => invoke<void>("resume_recording"),
  stopRecording: () => invoke<Project>("stop_recording"),
  isRecording: () => invoke<boolean>("is_recording"),
  saveProject: (project: Project) => invoke<void>("save_project", { project }),
  loadProject: (dir: string) => invoke<Project>("load_project", { dir }),
  listProjects: (root: string) => invoke<Project[]>("list_projects", { root }),
  regenerateZoom: (trackPath: string, params: ZoomParams) =>
    invoke<ZoomSegment[]>("regenerate_zoom", { trackPath, params }),
  readTrack: (trackPath: string) => invoke<MouseTrack>("read_track", { trackPath }),
  exportVideo: (project: Project, options: ExportOptions) =>
    invoke<string>("export_video", { project, options }),
  revealInFinder: (path: string) => invoke<void>("reveal_in_finder", { path }),
  openPath: (path: string) => invoke<void>("open_path", { path }),
  openScreenSettings: () => invoke<void>("open_screen_recording_settings"),
  ensureDir: (path: string) => invoke<void>("ensure_dir", { path }),
};

export const RESOLUTIONS = [
  { label: "1080P 全高清", height: 1080, bitrate: 20 },
  { label: "2K 超清", height: 1440, bitrate: 40 },
  { label: "4K 超高清", height: 2160, bitrate: 80 },
];

export const CURSOR_KINDS: { value: CursorKind; label: string; desc: string }[] = [
  { value: "arrow", label: "经典箭头", desc: "白色箭头 + 深色描边，通用" },
  { value: "arrowLight", label: "反色箭头", desc: "深色箭头 + 浅色描边，适合浅色界面" },
  { value: "dot", label: "圆点", desc: "实心圆点，干净不遮挡内容" },
  { value: "ring", label: "圆环", desc: "空心圆环，强调位置" },
  { value: "halo", label: "光晕", desc: "柔和光斑，适合演示重点" },
  { value: "none", label: "隐藏", desc: "不显示鼠标" },
];
