import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { api, type Project, type Settings, type SettingsSection } from "./lib/api";
import RecordPage from "./pages/RecordPage";
import EditorPage from "./pages/EditorPage";
import LibraryPage from "./pages/LibraryPage";
import HudPage from "./pages/HudPage";
import PickerPage from "./pages/PickerPage";
import SettingsPage from "./pages/SettingsPage";

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
  if (windowLabel === "editor") return <EditorWindow />;
  return <MainApp />;
}

/** 编辑器窗口。要打开哪个项目有两条来路：窗口是刚建出来的，
 *  就自己去 Rust 那儿把「待打开的目录」取回来；窗口本来就开着，
 *  则等 editor-open 事件。两条都要有，少一条就会出现「点了没反应」。 */
function EditorWindow() {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");

  function load(dir: string) {
    api.loadProject(dir)
      .then(setProject)
      .catch((e) => setError(`打不开这个录制：${e}`));
  }

  useEffect(() => {
    api.takeEditorProject().then((dir) => { if (dir) load(dir); }).catch(() => {});
  }, []);

  useEffect(() => {
    const un = listen<string>("editor-open", (e) => load(e.payload));
    return () => { un.then((f) => f()); };
  }, []);

  if (error) return <div className="loading">{error}</div>;
  if (!project) return <div className="loading">正在打开录制…</div>;

  return (
    <EditorPage
      project={project}
      onChange={setProject}
      onBack={() => getCurrentWindow().close()}
    />
  );
}

/** 设置窗口。它和主面板各读各的 settings，靠 Rust 发的 settings-changed
 *  事件互相通知——谁改了对方就重新读一次，不然两边各握一份旧副本，
 *  后保存的会把先保存的整个覆盖掉。 */
function SettingsWindow() {
  const [settings, setSettings] = useState<Settings | null>(null);
  // 窗口是新建出来的时候，要跳的分组只能从 URL 上拿——那会儿页面还没挂载，
  // Rust 发的事件没人接得住。窗口已经开着的情况才走事件。
  const [section, setSection] = useState<SettingsSection>(() => {
    const s = new URLSearchParams(window.location.search).get("section");
    return (s as SettingsSection) || "general";
  });

  useEffect(() => { api.loadSettings().then(setSettings); }, []);
  useEffect(() => {
    const un = listen("settings-changed", () => { api.loadSettings().then(setSettings); });
    return () => { un.then((f) => f()); };
  }, []);
  useEffect(() => {
    const un = listen<SettingsSection>("settings-goto", (e) => setSection(e.payload));
    return () => { un.then((f) => f()); };
  }, []);

  if (!settings) return <div className="loading">正在读取设置…</div>;

  return (
    <SettingsPage
      settings={settings}
      onSettings={(s) => { setSettings(s); api.saveSettings(s).catch(() => {}); }}
      section={section}
      onSection={setSection}
    />
  );
}

function MainApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>("record");

  useEffect(() => { api.loadSettings().then(setSettings); }, []);

  // 录完就把编辑器窗口叫起来。停止录制不管是从面板按的还是从悬浮条按的，
  // 走的都是同一个 Rust 命令、发的都是这个事件，所以这里是唯一的入口，
  // 不会出现两条路各开一次编辑器。
  useEffect(() => {
    const un = listen<Project>("recording-finished", (e) => {
      api.openEditor(e.payload.dir).catch(() => {});
    });
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

  return (
    <div className="shell">
      <header className="titlebar" data-tauri-drag-region>
        {/* 窗口只有 400 宽，标题栏放不下副标题、版本号和「检查更新」了。
            版本号和检查更新都已经搬进「设置 · 关于」，这里只留品牌和两个图标。 */}
        <div className="brand">AGRec</div>
        <nav>
          <button className={tab === "record" ? "on" : ""} onClick={() => setTab("record")}
            title="录制">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.9"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></svg>
          </button>
          <button className={tab === "library" ? "on" : ""} onClick={() => setTab("library")}
            title="我的录制">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.9"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /></svg>
          </button>
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
        <RecordPage settings={settings} onSettings={updateSettings} />
      ) : (
        <LibraryPage root={settings.saveDir} onOpen={(p) => api.openEditor(p.dir).catch(() => {})} />
      )}
    </div>
  );
}
