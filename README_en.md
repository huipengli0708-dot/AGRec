<div align="center">

<img src="assets/app-icon.png" width="96" height="96" alt="AGRec" />

# AGRec

**A macOS screen recorder built for knowledge creators · Zoom follows your talk · Any cursor you like**

[中文](README.md) · [Website](https://huipengli0708-dot.github.io/AGRec/)

[![Release](https://img.shields.io/github/v/release/huipengli0708-dot/AGRec?style=flat-square&label=version&color=5b4bdb)](https://github.com/huipengli0708-dot/AGRec/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-5b4bdb?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%2013%2B-5b4bdb?style=flat-square)](#install)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-5b4bdb?style=flat-square)](https://tauri.app)

**[Download](https://github.com/huipengli0708-dot/AGRec/releases/latest) · [Usage](#usage) · [Build from source](#build-from-source) · [Roadmap](#roadmap)**

<br />

<img src="assets/readme/hero-montage.png" width="820" alt="AGRec preview" />

</div>

<br />

Independently built, inspired by [Cap](https://github.com/CapSoftware/Cap) — not affiliated with the official Cap project. AGRec focuses on three things and does them well: **zoom that follows what you're explaining, no manual editing needed**, **a cursor you can swap for any style you like**, and **1080p to 4K export that never loses detail**. Designed around how knowledge creators actually record.

<br />

## How it works

|  |  |
| :-- | :-- |
| **Zoom that follows your mouse** | After recording, AGRec analyzes the cursor trail automatically: a **left click** or the cursor **resting in a small area** both trigger a zoom. Easing defaults to quad-out; scale, ease-in/out duration, hold time and trigger sensitivity are all tunable, and every segment can be edited, added, or removed by hand in the editor. |
| **Any cursor style** | Recording captures with `showsCursor = false` — the system pointer is never recorded — while the real cursor trail and click state are sampled at 120Hz. On export, the cursor is redrawn in whatever style you pick, so it stays crisp even when zoomed in, and you can re-export with a different style anytime. |
| **1080p / 2K / 4K** | Recording and export resolution (1080 / 1440 / 2160) are chosen independently, codec is H.264 or HEVC, bitrate is adjustable (4K defaults to 80 Mbps). Zoom isn't a filter approximation — every frame is cropped and resampled from the real source, so a 4K recording stays sharp even at 2x zoom. |
| **Built for creators** | Direct mic narration, click ripples, dwell-to-zoom, per-segment fine-tuning, and project files you can re-export anytime. |

<br />

## Screens

<table>
<tr>
<td width="33%"><img src="assets/readme/panel.png" alt="Recording panel" /><br /><sub>Recording panel</sub></td>
<td width="33%"><img src="assets/readme/settings-zoom.png" alt="Zoom settings" /><br /><sub>Zoom settings</sub></td>
<td width="33%"><img src="assets/readme/settings-cursor.png" alt="Cursor settings" /><br /><sub>Cursor settings</sub></td>
</tr>
<tr>
<td width="33%"><img src="assets/readme/editor-export.png" alt="Export settings" /><br /><sub>Editor · Export</sub></td>
<td width="33%"><img src="assets/readme/settings-quality.png" alt="Quality settings" /><br /><sub>Quality settings</sub></td>
<td width="33%"><img src="assets/readme/settings-hud.png" alt="HUD settings" /><br /><sub>HUD style settings</sub></td>
</tr>
</table>

<br />

## Install

Grab the latest `.dmg` from [Releases](https://github.com/huipengli0708-dot/AGRec/releases/latest) and drag it into Applications.

> **Getting "AGRec can't be opened" / "unidentified developer"?**
> AGRec isn't signed with a paid Apple Developer ID yet — this doesn't affect functionality, just allow it once:
>
> - **GUI**: System Settings → Privacy & Security, scroll down to "AGRec was blocked" and click "Open Anyway"
> - **Terminal** (faster):
>   ```bash
>   xattr -dr com.apple.quarantine /Applications/AGRec.app
>   ```
>
> The first launch will also ask for **Screen Recording** (and **Microphone**, if you pick a mic source) permission. After granting it in System Settings, fully quit (⌘Q) and reopen AGRec for the permission to take effect. Auto-update is built in, so you won't need to download future versions manually.

<br />

## Usage

1. **Recording panel**: pick a scope (entire screen / an app window / a selected area) → pick quality → pick audio source → pick a cursor style → set the zoom mode → start recording.
2. The floating HUD never appears in the recording itself; click "Stop" to end and the editor opens automatically in its own window.
3. **Editor**: the left side previews the zoom in real time (with your chosen cursor style), and the blue blocks on the timeline below are the auto-generated zoom segments.
   - Select a segment to adjust scale, start/end, ease-in/out, easing curve, and whether it follows the mouse
   - "Add zoom" at the playhead inserts a segment manually
   - "Regenerate" re-runs auto-detection if you want to start over
4. **Export**: pick resolution/framerate/codec/bitrate → pick a save path → the Finder opens to the result once rendering finishes.

Everything else (save location, quality presets, zoom parameters, cursor style, HUD style) lives in a separate **Settings window**, opened from the gear icon in the top-right of the main panel.

<br />

## What's in a project folder

```
录屏_20260825_143012/
├── 原始录制.mov       raw recording without the cursor (the master file)
├── mouse.json         cursor trail and click log
├── project.json        editable zoom segments, cursor style, etc.
└── xxx_成品.mp4        exported output
```

The master file and cursor trail are always kept, so you can change the cursor style or zoom and re-export anytime.

<br />

## Build from source

<details>
<summary>Requirements & commands</summary>

<br />

- macOS 13 Ventura or later (required by ScreenCaptureKit)
- Xcode 16+ (or matching Command Line Tools): `xcode-select --install`
- Node.js 18+, Rust (`curl https://sh.rustup.rs -sSf | sh`)

```bash
npm install
npm run app          # equivalent to build-helper.sh + tauri dev
```

Package a local build (with local signing):

```bash
npx tauri icon assets/app-icon.png    # generate icons, once
npm run release                        # universal binary + dmg
```

Releases on GitHub are built and published automatically by GitHub Actions (`.github/workflows/release.yml`) on every tag push. Signing and auto-update setup: [`docs/自动更新.md`](docs/自动更新.md) (Chinese).

</details>

<details>
<summary>Architecture</summary>

<br />

```
AGRec/
├── helper/                     Native Swift core (ScreenCaptureKit + AVFoundation + CoreImage)
│   └── Sources/ZhiLuHelper/
│       ├── main.swift          subcommands: displays / permission / record / export
│       ├── Recorder.swift      screen capture + cursor trail sampling + audio
│       ├── Timeline.swift      per-frame zoom/focus/cursor/ripple precomputation
│       ├── Exporter.swift      custom AVVideoCompositing for crop/zoom + cursor compositing
│       └── CursorRenderer.swift bitmap rendering for each cursor style
├── src-tauri/                  Rust backend (Tauri 2): process orchestration, multi-window (panel/HUD/settings/editor), project management, zoom algorithm
│   └── src/{main.rs, model.rs, zoom.rs, helper.rs}
├── src/                         React + TypeScript frontend (i18n)
└── scripts/                     build-helper.sh builds the Swift core; release.sh packages locally; bump-version.sh bumps the version everywhere
```

</details>

<br />

## Roadmap

- [ ] Windows version (in progress)
- [ ] Editor UI translations
- [ ] Export presets for platforms (Xiaohongshu / Bilibili / video accounts — after real user research, not guessing)
- [ ] Camera picture-in-picture (permission already declared in `Info.plist`, not wired up yet)
- [ ] Mixing system audio and microphone (currently either/or)

**Known limits**: macOS only for now (ScreenCaptureKit-dependent); one audio source at a time (mic or system audio, no mixing); no camera picture-in-picture yet.

<br />

<div align="center">

Found a bug or have an idea? Open an [Issue](https://github.com/huipengli0708-dot/AGRec/issues). Released under the [MIT](LICENSE) license.

</div>
