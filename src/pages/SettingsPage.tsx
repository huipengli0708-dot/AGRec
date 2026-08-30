
import { open } from "@tauri-apps/plugin-dialog";
import {
  api, BUILD_INFO, CURSOR_KINDS, RESOLUTIONS, ZOOM_TRIGGERS,
  type HudStyle, type Settings, type SettingsSection,
} from "../lib/api";
import { Button, Card, HotkeyField, Row, Segmented, Slider, Tip, Toggle } from "../components/UI";
import { CursorGlyph } from "../components/CursorGlyph";
import { t, LOCALES, type Locale } from "../lib/i18n";
import UpdateButton from "../components/UpdateButton";

type Props = {
  settings: Settings;
  onSettings: (s: Settings) => void;
  /** 分组由窗口那层持有：点齿轮时可以带着「要跳到哪一组」进来 */
  section: SettingsSection;
  onSection: (s: SettingsSection) => void;
};

export const SECTIONS: { key: SettingsSection; label: string }[] = [
  { key: "general", label: "通用" },
  { key: "quality", label: "画质与导出" },
  { key: "zoom", label: "放大与快捷键" },
  { key: "cursor", label: "鼠标指针" },
  { key: "hud", label: "悬浮控制条" },
  { key: "about", label: "关于" },  // label 是中文原文，渲染时再过 t()
];

/** 悬浮控制条的样式示意图。纯静态，不联动真实录制状态，
 *  只是让人在切换之前能看见这个样式大概长什么样。 */
function HudSample({ style }: { style: HudStyle }) {
  const minimal = style === "minimal";
  return (
    <div className="hud-sample">
      {!minimal && <div className="hud-sample-screen">{t("实时画面")}</div>}
      <div className="hud-sample-bar">
        <span className="hud-sample-dot" />
        <span className="hud-sample-time">00:12</span>
        {!minimal && <span className="hud-sample-scale">1.00×</span>}
        {!minimal && <span className="hud-sample-btn ghost">▴</span>}
        <span className="hud-sample-btn">❚❚</span>
        <span className="hud-sample-btn stop">■</span>
      </div>
    </div>
  );
}

export default function SettingsPage({ settings, onSettings, section, onSection }: Props) {
  const patch = (p: Partial<Settings>) => onSettings({ ...settings, ...p });
  const patchCursor = (p: Partial<Settings["cursor"]>) =>
    onSettings({ ...settings, cursor: { ...settings.cursor, ...p } });
  const patchZoom = (p: Partial<Settings["zoom"]>) =>
    onSettings({ ...settings, zoom: { ...settings.zoom, ...p } });

  const res = RESOLUTIONS.find((r) => r.height === settings.defaultHeight) ?? RESOLUTIONS[1];
  const trigger = ZOOM_TRIGGERS.find((z) => z.value === settings.zoom.trigger);

  async function pickDir() {
    const dir = await open({ directory: true, multiple: false, title: "选择视频保存位置" });
    if (typeof dir === "string") patch({ saveDir: dir });
  }

  return (
    <div className="settings-shell">
      <nav className="settings-rail">
        {SECTIONS.map((s) => (
          <button key={s.key}
            className={section === s.key ? "on" : ""}
            onClick={() => onSection(s.key)}>
            {t(s.label)}
          </button>
        ))}
      </nav>

      <div className="settings-main">
        {section === "general" && (
          <>
          <Card title={t("语言")} desc={t("界面语言，切换后立即生效")}>
            <Row label={t("语言")}>
              <Segmented
                value={settings.locale ?? "zh-CN"}
                options={LOCALES.map((l) => ({ value: l.value, label: l.label }))}
                onChange={(v: Locale) => patch({ locale: v })}
              />
            </Row>
          </Card>

          <Card title={t("保存位置")} desc={t("每次录制会在这里新建一个项目文件夹")}>
            <Row label={t("文件夹")}>
              <div className="path-row">
                <input className="text" value={settings.saveDir}
                  onChange={(e) => patch({ saveDir: e.target.value })} />
                <Button onClick={pickDir}>{t("选择…")}</Button>
              </div>
            </Row>
          </Card>
          </>
        )}

        {section === "quality" && (
          <Card title={t("画质")} desc={t("按显示器 / 选区 / 窗口的原始比例输出，高度对齐所选档位")}>
            <Row label={t("清晰度")}>
              <Segmented
                value={settings.defaultHeight}
                options={RESOLUTIONS.map((r) => ({ value: r.height, label: t(r.label) }))}
                onChange={(h) => {
                  const r = RESOLUTIONS.find((x) => x.height === h)!;
                  patch({ defaultHeight: h, defaultBitrate: r.bitrate });
                }}
              />
            </Row>
            <Row label={t("帧率")}>
              <Segmented
                value={settings.defaultFps}
                options={[
                  { value: 30, label: "30 fps" },
                  { value: 60, label: "60 fps" },
                ]}
                onChange={(v) => patch({ defaultFps: v })}
              />
            </Row>
            <Row label={t("编码")} hint={t("HEVC 同画质体积更小；H.264 兼容性最好")}>
              <Segmented
                value={settings.defaultCodec}
                options={[
                  { value: "hevc", label: "HEVC / H.265" },
                  { value: "h264", label: "H.264" },
                ]}
                onChange={(v) => patch({ defaultCodec: v })}
              />
            </Row>
            <Row label={t("码率")} hint={`${res.label} · ${res.bitrate} Mbps`}>
              <Slider value={settings.defaultBitrate} min={8} max={160} step={2}
                onChange={(v) => patch({ defaultBitrate: v })}
                format={(v) => `${v} Mbps`} />
            </Row>
          </Card>
        )}

        {section === "zoom" && (
          <Card title={t("放大方式与参数")} desc={t("这里选哪种，下面就调哪种的参数；改了也会同步到录制面板上")}>
            <div className="cursor-grid">
              {ZOOM_TRIGGERS.map((z) => (
                <button key={z.value}
                  className={`cursor-card trigger-card ${settings.zoom.trigger === z.value ? "on" : ""}`}
                  onClick={() => patchZoom({ trigger: z.value })}>
                  <span className="trigger-card-title">
                    <b>{t(z.label)}</b>
                    <Tip text={t(z.desc)} />
                  </span>
                </button>
              ))}
            </div>
            {settings.zoom.trigger === "none" && (
              <div className="settings-note">
                「{trigger?.label}」不需要参数。想调别的方式，点上面对应的那一项就行。
              </div>
            )}

            {settings.zoom.trigger === "manual" && (
              <div className="hint-box">
                <b>{t("录制中的快捷键")}</b>{" "}
                <Tip text="键不对、换了外接键盘识别不到？点“点击设置”，自己在键盘上按一下想用的键就行，采集的是这把键盘实际上报的按键，跟型号、布局无关。两个手势看的是按下缩小键那一刻前置键在不在，跟按住多久无关。注意：录制中在输入框里打字，如果打到跟“缩小键”一样的字母会被当成归位，建议挑一个平时打字不常用的键。不做操作时倍数一直保持，画面持续跟随鼠标移动，只影响录出来的视频，不影响你自己看到的屏幕。" />
                <div className="hotkey-row">
                  前置键 <HotkeyField value={settings.zoom.hotkeyA}
                    onChange={(v) => patchZoom({ hotkeyA: v })} /> +
                  放大键 <HotkeyField value={settings.zoom.hotkeyZ}
                    onChange={(v) => patchZoom({ hotkeyZ: v })} /> — 持续放大，松开停在当前倍数
                </div>
                <div className="hotkey-row">
                  前置键 <HotkeyField value={settings.zoom.hotkeyA}
                    onChange={(v) => patchZoom({ hotkeyA: v })} /> +
                  缩小键 <HotkeyField value={settings.zoom.hotkeyX}
                    onChange={(v) => patchZoom({ hotkeyX: v })} /> — 缓慢缩小，松开停在当前倍数
                </div>
                <div>单独按一下缩小键（不按前置键）— 一步归位到 1.00×</div>
              </div>
            )}

            {settings.zoom.trigger !== "none" && (
              <>
                <Row label={t("放大倍数")} hint={settings.zoom.trigger === "manual" ? t("手动模式下这是起始倍数") : undefined}>
                  <Slider value={settings.zoom.scale} min={1.2} max={3} step={0.1}
                    onChange={(v) => patchZoom({ scale: v })} format={(v) => `${v.toFixed(1)}×`} />
                </Row>
                <Row label={t("缓入时长")} hint={t("二次方缓出，越长越柔和")}>
                  <Slider value={settings.zoom.zoomIn} min={0.2} max={2.5} step={0.1}
                    onChange={(v) => patchZoom({ zoomIn: v })} format={(v) => `${v.toFixed(1)} 秒`} />
                </Row>
                <Row label={t("缓出时长")}>
                  <Slider value={settings.zoom.zoomOut} min={0.2} max={2.5} step={0.1}
                    onChange={(v) => patchZoom({ zoomOut: v })} format={(v) => `${v.toFixed(1)} 秒`} />
                </Row>
              </>
            )}

            {(settings.zoom.trigger === "dwell" || settings.zoom.trigger === "click") && (
              <>
                <Row label={t("保持时长")} hint={t("触发后至少放大多久")}>
                  <Slider value={settings.zoom.hold} min={0.4} max={6} step={0.2}
                    onChange={(v) => patchZoom({ hold: v })} format={(v) => `${v.toFixed(1)} 秒`} />
                </Row>
                <Row label={t("放大后跟随鼠标平移")} hint={t("关掉则锁定在触发点")}>
                  <Toggle value={settings.zoom.follow} onChange={(v) => patchZoom({ follow: v })} />
                </Row>
              </>
            )}

            {settings.zoom.trigger === "dwell" && (
              <Row label={t("停留判定")}>
                <div className="inline">
                  <Slider value={settings.zoom.dwellTime} min={0.3} max={3} step={0.1}
                    onChange={(v) => patchZoom({ dwellTime: v })} format={(v) => `${v.toFixed(1)} 秒`} />
                  <Slider value={settings.zoom.dwellRadius} min={0.01} max={0.15} step={0.005}
                    onChange={(v) => patchZoom({ dwellRadius: v })}
                    format={(v) => `${Math.round(v * 100)}% 画面`} />
                </div>
              </Row>
            )}
          </Card>
        )}

        {section === "cursor" && (
          <Card title={t("鼠标样式")} desc={t("录制时不录系统指针，导出时用你选的样式重绘，放大后依然清晰")}>
            <div className="cursor-grid">
              {CURSOR_KINDS.map((c) => (
                <button key={c.value}
                  className={`cursor-card ${settings.cursor.kind === c.value ? "on" : ""}`}
                  onClick={() => patchCursor({ kind: c.value })}>
                  <div className="preview">
                    <CursorGlyph kind={c.value} color={settings.cursor.color}
                      outlineColor={settings.cursor.outlineColor} size={44} />
                  </div>
                  <span>{t(c.label)}</span>
                </button>
              ))}
            </div>
            <Row label={t("指针大小")}>
              <Slider value={settings.cursor.size} min={0.8} max={3} step={0.1}
                onChange={(v) => patchCursor({ size: v })} format={(v) => `${v.toFixed(1)}×`} />
            </Row>
            <Row label={t("主色 / 描边")}>
              <div className="inline">
                <input type="color" value={settings.cursor.color}
                  onChange={(e) => patchCursor({ color: e.target.value })} />
                <input type="color" value={settings.cursor.outlineColor}
                  onChange={(e) => patchCursor({ outlineColor: e.target.value })} />
              </div>
            </Row>
            <Row label={t("点击水波纹")} hint={t("点击时出现扩散圆环，观众更容易注意到")}>
              <Toggle value={settings.cursor.clickRipple}
                onChange={(v) => patchCursor({ clickRipple: v })} />
            </Row>
            <Row label={t("指针跟手程度")} hint={t("越低越平滑，越高越贴近真实轨迹")}>
              <Slider value={settings.cursor.smoothing} min={0.1} max={1} step={0.05}
                onChange={(v) => patchCursor({ smoothing: v })} format={(v) => v.toFixed(2)} />
            </Row>
            <Row label={t("放大时指针跟着变大")}>
              <Toggle value={settings.cursor.scaleWithZoom}
                onChange={(v) => patchCursor({ scaleWithZoom: v })} />
            </Row>
          </Card>
        )}

        {section === "hud" && (
          <Card title={t("悬浮控制条")} desc={t("录制时停在屏幕顶部的那个小条。它已经被排除在录制画面之外，不会被录进视频")}>
            <Row label={t("样式")}>
              <Segmented
                value={settings.hudStyle ?? "preview"}
                options={[
                  { value: "preview", label: t("画面预览") },
                  { value: "minimal", label: t("极简圆点") },
                ]}
                onChange={(v) => patch({ hudStyle: v })}
              />
            </Row>
            <HudSample style={settings.hudStyle ?? "preview"} />
          </Card>
        )}

        {section === "about" && (
          <Card title={t("关于 AGRec")} desc={t("为知识博主做的 macOS 录屏工具，开源、免费")}>
            <Row label={t("当前版本")}>
              <span className="muted">
                {BUILD_INFO.isDev ? t("开发版") : t("打包版")} · {BUILD_INFO.time}
              </span>
            </Row>
            {!BUILD_INFO.isDev && (
              <Row label={t("软件更新")}>
                <UpdateButton />
              </Row>
            )}
            <Row label={t("源代码")}>
              <Button onClick={() => api.openPath("https://github.com/huipengli0708-dot/AGRec")}>
                {t("在 GitHub 上查看")}
              </Button>
            </Row>
          </Card>
        )}
      </div>
    </div>
  );
}
