#!/usr/bin/env bash
# 本地打包。和 CI 走同一套签名配置，区别只在密钥从哪儿来。
set -euo pipefail
cd "$(dirname "$0")/.."

# 1) 代码签名身份。
#    以前这个写死在 tauri.conf.json 里，但那个自签名证书只存在于开发机的钥匙串中，
#    GitHub Actions 上根本没有，CI 一构建就会失败。所以改成用环境变量传：
#    本地默认用「AGRec Dev」，CI 里不设这个变量，走 Tauri 默认的临时签名。
export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-AGRec Dev}"

# 2) 更新包的签名密钥。
#    自动更新要求每个安装包都带一个签名，客户端用 tauri.conf.json 里的公钥验证，
#    验不过就拒绝安装——这是防止别人往你的更新源里塞恶意包的唯一屏障。
#    私钥绝对不能进仓库：本地放在 ~/.tauri/agrec.key，CI 里放 GitHub Secrets。
KEY_FILE="${TAURI_KEY_FILE:-$HOME/.tauri/agrec.key}"
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && [ -f "$KEY_FILE" ]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
fi

if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  echo "⚠️  没找到更新签名私钥（$KEY_FILE）。"
  echo "   这次打出来的包不能用于自动更新，只能手动安装。"
  echo "   要启用自动更新，先跑一次：npx tauri signer generate -w \"$KEY_FILE\""
  echo ""
fi

bash scripts/build-helper.sh --universal
npx tauri build "$@"
