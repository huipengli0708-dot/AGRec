# 阿光知录 · 面向知识博主的 macOS 录屏工具

受 [Cap](https://github.com/CapSoftware/Cap) 启发独立开发的录屏工具，与 Cap 官方无任何关联，全中文界面，核心是三件事：
**可换的鼠标样式**、**跟随鼠标的二次方缓出放大**、**1080P / 2K / 4K 高清输出**。

---

## 它是怎么做到的

| 需求 | 实现方式 |
| --- | --- |
| 更换鼠标样式 | 录制时用 `showsCursor = false` **不录系统指针**，同时以 120Hz 记录鼠标轨迹与左键状态；导出时按你选的样式在画面上重绘。所以放大之后指针依然是矢量级清晰，而且随时可以换样式重导。 |
| 跟随鼠标放大 | 录完自动分析轨迹：**左键点击** 和 **鼠标在小范围停留** 都会触发放大。缓动默认二次方缓出（quadOut），倍数、缓入/缓出时长、保持时长、触发灵敏度全部可调，编辑器里还能逐段改、手动加、手动删。 |
| 1080P / 2K / 4K | 录制与导出都可独立选择 1080 / 1440 / 2160，编码可选 H.264 或 HEVC，码率可调（4K 默认 80 Mbps）。 |
| 自定存储位置 | 保存目录在录制页直接选，每次录制生成一个独立项目文件夹。 |
| 全中文 | 界面、提示、错误信息均为中文。 |
| 适合知识博主 | 麦克风讲解直录、点击水波纹提示、停留自动放大、逐段微调、项目可反复重导。 |

## 技术结构

```
zhilu-recorder/
├── helper/                     Swift 原生内核（ScreenCaptureKit + AVFoundation + CoreImage）
│   └── Sources/ZhiLuHelper/
│       ├── main.swift          子命令：displays / permission / record / export
│       ├── Recorder.swift      屏幕录制 + 鼠标轨迹采集 + 音频写入
│       ├── Timeline.swift      逐帧预计算缩放/焦点/指针/水波纹
│       ├── Exporter.swift      自定义 AVVideoCompositing，做裁剪缩放与指针合成
│       └── CursorRenderer.swift 各种指针样式的位图绘制
├── src-tauri/                  Rust 后端（Tauri 2）：进程调度、项目管理、自动放大算法
│   └── src/{main.rs, model.rs, zoom.rs, helper.rs}
├── src/                        React + TypeScript 前端（全中文界面）
└── scripts/build-helper.sh     编译 Swift 内核
```

放大不是用滤镜近似出来的：导出阶段每一帧都按 `Timeline` 算出的缩放系数做**真实裁剪 + 重采样**，
所以 4K 源放大 2 倍时画面依然来自原始像素，不会糊。

## 环境要求

- macOS 13 Ventura 或更高（ScreenCaptureKit 要求）
- Xcode 16 及以上（或对应的 Command Line Tools）：`xcode-select --install`
  （若使用较旧 Xcode 编译 `Exporter.swift` 报类型不匹配，按文件顶部注释把 `[String: any Sendable]` 改成 `[String: Any]`）
- Node.js 18+、Rust（`curl https://sh.rustup.rs -sSf | sh`）

## 跑起来

```bash
npm install
npm run app          # 等价于 build-helper.sh + tauri dev
```

首次运行 macOS 会要求 **屏幕录制** 权限（以及选麦克风时的 **麦克风** 权限）。
授权后需要退出应用重开一次，权限才会对录制进程生效。

打包：

```bash
npx tauri icon assets/app-icon.png    # 生成图标（只需一次）
npm run release                        # 通用二进制 + dmg
```

## 使用流程

1. **录制页**：选显示器 → 选清晰度（1080P / 2K / 4K）→ 选声音来源 → 选保存文件夹 → 挑鼠标样式 → 调自动放大参数 → 开始录制。
2. 录制时不会显示悬浮球干扰画面；按「结束录制并进入编辑」停止。
3. **编辑器**：左边实时预览放大效果（自定义指针会一起预览），下方时间轴上蓝色块就是自动生成的放大片段。
   - 点选片段 → 右侧调倍数、起止、缓入缓出、缓动曲线、是否跟随鼠标
   - 播放头处「新增放大」可手动补一段
   - 改了参数想重来，点「重新自动生成」
4. **导出**：选分辨率/帧率/编码/码率 → 选保存路径 → 渲染完成后自动在访达中定位。

## 项目文件夹里有什么

```
录屏_20260825_143012/
├── 原始录制.mov      不含鼠标的原始画面（最高画质母版）
├── mouse.json        鼠标轨迹与点击记录
├── project.json      放大片段、鼠标样式等可编辑参数
└── xxx_成品.mp4      导出结果
```

母版和轨迹都保留着，所以任何时候都能改样式、改放大，重新导出一版。

## 已知边界

- 目前仅 macOS（依赖 ScreenCaptureKit）。
- 声音一次录一路：麦克风讲解 **或** 系统内录，暂不混音。
- 摄像头画中画尚未接入（`Info.plist` 已预留权限）。
