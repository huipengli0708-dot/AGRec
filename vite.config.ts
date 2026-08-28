import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BUILD_TIME = new Date().toLocaleString("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __IS_DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
  },
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/helper/**"] },
  },
  build: { target: "safari15", sourcemap: false },
});
