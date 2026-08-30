import { useEffect, useState } from "react";
import { api, type Project } from "../lib/api";
import { Button, Card, formatTime } from "../components/UI";
import { t } from "../lib/i18n";

export default function LibraryPage({ root, onOpen }: { root: string; onOpen: (p: Project) => void }) {
  const [items, setItems] = useState<Project[]>([]);

  useEffect(() => { api.listProjects(root).then(setItems).catch(() => setItems([])); }, [root]);

  return (
    <div className="page">
      <Card title={t("我的录制")} desc={`来自 ${root}`}
        right={<Button onClick={() => api.revealInFinder(root)}>{t("在访达中打开")}</Button>}>
        {items.length === 0 ? (
          <p className="muted">{t("还没有录制记录。回到「录制」页开始第一次录屏吧。")}</p>
        ) : (
          <div className="project-list">
            {items.map((p) => (
              <button key={p.dir} className="project" onClick={() => onOpen(p)}>
                <b>{p.name}</b>
                <em className="muted">
                  {p.createdAt} · 时长 {formatTime(p.duration)} · {p.segments.length} 段放大
                </em>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
