import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { api, BUILD_INFO, type Project, type Settings } from "./lib/api";
import RecordPage from "./pages/RecordPage";
import EditorPage from "./pages/EditorPage";
import LibraryPage from "./pages/LibraryPage";
import HudPage from "./pages/HudPage";
import PickerPage from "./pages/PickerPage";
import UpdateButton from "./components/UpdateButton";

type Tab = "record" | "library";

const windowLabel = getCurrentWindow().label;

export default function App() {
  if (windowLabel === "hud") return <HudPage />;
  if (windowLabel === "picker") return <PickerPage />;
  return <MainApp />;
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
