#!/usr/bin/env node
/**
 * 知录开发模式一键启动。
 *
 * 开着这一个终端就够了，三层代码全部自动生效：
 *   - 前端（src/**）           tauri dev 自带热更新，改完立刻反映到界面
 *   - Rust 后端（src-tauri/src）tauri dev 自动重编译并重启应用
 *   - Swift 录制内核（helper/） 本脚本负责监听并重新编译，下次开始录制即生效
 */
import { spawn } from "node:child_process";
import { watch, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helperDir = path.join(root, "helper", "Sources", "ZhiLuHelper");

const C = {
  cyan: (t) => `\x1b[36m${t}\x1b[0m`,
  green: (t) => `\x1b[32m${t}\x1b[0m`,
  red: (t) => `\x1b[31m${t}\x1b[0m`,
  dim: (t) => `\x1b[2m${t}\x1b[0m`,
};

function run(cmd, args) {
  return spawn(cmd, args, { cwd: root, stdio: "inherit" });
}

function buildHelper() {
  return new Promise((resolve) => {
    const p = run("bash", ["scripts/build-helper.sh"]);
    p.on("exit", (code) => resolve(code === 0));
    p.on("error", () => resolve(false));
  });
}

let rebuilding = false;
let queued = false;
let debounce = null;

async function rebuildHelper() {
  if (rebuilding) {
    queued = true;
    return;
  }
  rebuilding = true;
  console.log(C.cyan("\n▶ 检测到录制内核改动，正在重新编译…"));
  const ok = await buildHelper();
  console.log(
    ok
      ? C.green("✅ 录制内核已更新，下次点「开始录制」就是新版本\n")
      : C.red("❌ 录制内核编译失败，看上面的 error 行\n")
  );
  rebuilding = false;
  if (queued) {
    queued = false;
    rebuildHelper();
  }
}

// ---- 首次编译录制内核 ----
console.log(C.cyan("▶ 首次编译录制内核…"));
if (!(await buildHelper())) {
  console.error(C.red("首次编译失败，先解决上面的错误再启动"));
  process.exit(1);
}

// ---- 监听 Swift 源码 ----
if (existsSync(helperDir)) {
  watch(helperDir, { recursive: true }, (_event, filename) => {
    if (!filename || !filename.endsWith(".swift")) return;
    clearTimeout(debounce);
    debounce = setTimeout(rebuildHelper, 400);
  });
  console.log(C.cyan("👀 正在监听录制内核改动"));
}

console.log(
  C.dim("   前端和 Rust 由 tauri dev 自动监听，改动会自己生效")
);
console.log(C.dim("   想退出：在这个窗口按 Control + C\n"));

// ---- 启动 tauri dev ----
const dev = run("npx", ["tauri", "dev"]);
dev.on("exit", (code) => process.exit(code ?? 0));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    dev.kill(sig);
    process.exit(0);
  });
}
