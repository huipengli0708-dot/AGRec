import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { api, BUILD_INFO, type Project, type Settings } from "./lib/api";
import RecordPage from "./pages/RecordPage";
import EditorPage from "./pages/EditorPage";
import LibraryPage from "./pages/LibraryPage";
import HudPage from "./pages/HudPage";
import PickerPage from "./pages/PickerPage";
import SettingsPage from "./pages/SettingsPage";
import UpdateButton from "./components/UpdateButton";

type Tab = "record" | "library";

const windowLabel = getCurrentWindow().label;

// hud / picker 这两个窗口是叠在真实桌面上方的透明覆盖层，不能带 body 的不透明底色，
// 不然即使 Tauri 那边开了 transparent:true，页面自己画的实心背景也会把桌面整个盖住，
// 表现出来就是整块变黑、看不到底下真实的屏幕内容。
if (windowLabel === "hud" || windowLabel === "picker") {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

export default function App() {
  if (windowLabel === "hud") return <HudPage />;
  if (windowLabel === "picker") return <PickerPage />;
  if (windowLabel === "settings") return <SettingsWindow />;
  return <MainApp />;
}

/** 设置窗口。它和主面板各读各的 settings，靠 Rust 发的 settings-changed
 *  事件互相通知——谁改了对方就重新读一次，不然两边各握一份旧副本，
 *  后保存的会把先保存的整个覆盖掉。 */
function SettingsWindow() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => { api.loadSettings().then(setSettings); }, []);
  useEffect(() => {
    const un = listen("settings-changed", () => { api.loadSettings().then(setSettings); });
    return () => { un.then((f) => f()); };
  }, []);

  if (!settings) return <div className="loading">正在读取设置…</div>;

  return (
    <SettingsPage
      settings={settings}
      onSettings={(s) => { setSettings(s); api.saveSettings(s).catch(() => {}); }}
    />
  );
}

function MainApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>("record");
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => { api.loadSettings().then(setSettings); }, []);

  useEffect(() => {
    const un = listen<Project>("recording-finished", (e) => setProject(e.payload));
    return () => { un.then((f) => f()); };
  }, []);

  // 设置窗口里改了什么，这边要跟着重新读一次
  useEffect(() => {
    const un = listen("settings-changed", () => { api.loadSettings().then(setSettings); });
    return () => { un.then((f) => f()); };
  }, []);

  function updateSettings(s: Settings) {
    setSettings(s);
    api.saveSettings(s).catch(() => {});
  }

  if (!settings) return <div className="loading">正在启动AGRec…</div>;

  if (project) {
    return (
      <EditorPage
        project={project}
        onChange={setProject}
        onBack={() => setProject(null)}
      />
    );
  }

  return (
    <div className="shell">
      <header className="titlebar" data-tauri-drag-region>
        <div className="brand">
          AGRec<em>为知识博主做的录屏工具</em>
          <span className={`build-tag ${BUILD_INFO.isDev ? "dev" : ""}`}>
            {BUILD_INFO.isDev ? "开发版" : "打包版"} · {BUILD_INFO.time}
          </span>
        </div>
        <nav>
          {!BUILD_INFO.isDev && <UpdateButton />}
          <button className={tab === "record" ? "on" : ""} onClick={() => setTab("record")}>录制</button>
          <button className={tab === "library" ? "on" : ""} onClick={() => setTab("library")}>我的录制</button>
          <button className="gear" onClick={() => api.openSettings()} title="设置">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </nav>
      </header>
      {tab === "record" ? (
        <RecordPage settings={settings} onSettings={updateSettings} onRecorded={setProject} />
      ) : (
        <LibraryPage root={settings.saveDir} onOpen={setProject} />
      )}
    </div>
  );
}
