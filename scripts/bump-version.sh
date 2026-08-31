#!/usr/bin/env bash
# 一次改掉所有该改的版本号。
#
# 版本号散在四个文件里，手改极易漏。漏了 package-lock.json 尤其阴——
# CI 的 npm ci 会校验它和 package.json 是否同步，对不上直接退出，
# 而报错信息只说 "npm ci can only install packages when your
# package.json and package-lock.json are in sync"，不会告诉你是版本号的事。
#
# 用法：bash scripts/bump-version.sh 0.3.0
set -euo pipefail
cd "$(dirname "$0")/.."

NEW="${1:-}"
if [ -z "${NEW}" ]; then
  echo "用法: bash scripts/bump-version.sh 0.3.0" >&2
  exit 1
fi
if ! echo "${NEW}" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "版本号格式不对，应该像 0.3.0" >&2
  exit 1
fi

python3 - "${NEW}" <<'PYEOF'
import json, re, sys
new = sys.argv[1]

for path in ("package.json", "package-lock.json", "src-tauri/tauri.conf.json"):
    d = json.load(open(path, encoding="utf-8"))
    d["version"] = new
    if path == "package-lock.json":
        d["packages"][""]["version"] = new
    json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(path, "a", encoding="utf-8").write("\n")
    print(f"  {path} -> {new}")

p = "src-tauri/Cargo.toml"
s = open(p, encoding="utf-8").read()
s = re.sub(r'(?m)^version = "[0-9.]+"$', f'version = "{new}"', s, count=1)
open(p, "w", encoding="utf-8").write(s)
print(f"  {p} -> {new}")

p = "src-tauri/Cargo.lock"
s = open(p, encoding="utf-8").read()
s2 = re.sub(r'(?m)^(name = "agrec"\nversion = )"[0-9.]+"', r'\1"%s"' % new, s, count=1)
if s2 != s:
    open(p, "w", encoding="utf-8").write(s2)
    print(f"  {p} -> {new}")
PYEOF

echo ""
echo "改完了。接下来："
echo "  git add -A && git commit -m \"发布 v${NEW}\""
echo "  git tag v${NEW} && git push && git push origin v${NEW}"
