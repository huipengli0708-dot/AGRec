#!/usr/bin/env bash
# 编译 macOS 原生录制/导出 helper，并按 Tauri sidecar 命名规则放到 src-tauri/binaries/
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/helper/Sources/ZhiLuHelper"
OUTDIR="$ROOT/src-tauri/binaries"
mkdir -p "$OUTDIR"

if ! command -v swiftc >/dev/null 2>&1; then
  echo "❌ 找不到 swiftc，请先安装 Xcode 或 Command Line Tools：xcode-select --install" >&2
  exit 1
fi

FRAMEWORKS=(-framework ScreenCaptureKit -framework AVFoundation -framework CoreMedia
            -framework CoreImage -framework CoreVideo -framework CoreGraphics -framework AppKit)

build_arch () {
  local arch="$1" out="$2"
  echo "→ 编译 $arch"
  swiftc -O -swift-version 5 \
    -target "${arch}-apple-macos13.0" \
    "${FRAMEWORKS[@]}" \
    -o "$out" \
    "$SRC"/*.swift
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ "${1:-}" == "--universal" ]]; then
  build_arch arm64  "$TMP/helper-arm64"
  build_arch x86_64 "$TMP/helper-x86_64"
  lipo -create "$TMP/helper-arm64" "$TMP/helper-x86_64" -output "$TMP/helper"
  cp "$TMP/helper" "$OUTDIR/zhilu-helper-aarch64-apple-darwin"
  cp "$TMP/helper" "$OUTDIR/zhilu-helper-x86_64-apple-darwin"
  # 打 --target universal-apple-darwin 时，Tauri 找的 sidecar 名字带的是
  # universal-apple-darwin 后缀，不是上面两个单架构名。少这一份 CI 会报
  # 「sidecar not found」。反正是同一个 lipo 出来的胖二进制，多放一份不占事。
  cp "$TMP/helper" "$OUTDIR/zhilu-helper-universal-apple-darwin"
else
  HOST_ARCH="$(uname -m)"
  if [[ "$HOST_ARCH" == "arm64" ]]; then
    build_arch arm64 "$OUTDIR/zhilu-helper-aarch64-apple-darwin"
  else
    build_arch x86_64 "$OUTDIR/zhilu-helper-x86_64-apple-darwin"
  fi
fi

chmod +x "$OUTDIR"/zhilu-helper-* 2>/dev/null || true
echo "✅ helper 已生成于 $OUTDIR"
