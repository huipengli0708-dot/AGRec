// 极轻量的多语言：直接拿中文原文当 key。
//
// 这么做有两个好处：一是源码里读到的还是人话（t("开始录制") 而不是
// t("panel.startRecording")），不用维护一张键名表；二是没翻译到的字符串
// 会自动回落成中文原文，界面永远不会出现空白或者 "missing.key"。
// 代价是中文文案改了就等于换了 key，翻译要跟着更新——所以改文案时
// 记得回来同步一下。

export type Locale = "zh-CN" | "en" | "zh-TW" | "ja" | "es";

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "ja", label: "日本語" },
  { value: "es", label: "Español" },
];

type Dict = Record<string, string>;

const en: Dict = {
  // 选项数据（放大方式 / 指针样式 / 清晰度）
  "鼠标停留放大": "Dwell to zoom",
  "点击放大": "Click to zoom",
  "点击开关": "Click to toggle",
  "快捷键手动控制": "Manual (hotkeys)",
  "不放大": "No zoom",
  "鼠标在一小块区域停住超过设定时间，自动放大到那里": "Zooms in automatically when the pointer rests in a small area long enough",
  "左键点哪就放大哪，保持一会儿再自动缩回": "Zooms to wherever you click, then eases back out",
  "点一下放大并保持，再点一下缩回": "Click once to zoom in and stay, click again to zoom out",
  "自定义两三个键，按住放大/缩小，松手停住；下方可重新设置具体按键": "Assign your own keys: hold to zoom in or out, release to hold the level. Keys are configurable below.",
  "全程原始画面，后期也可以在编辑器里手动加放大段": "Keeps the original framing; you can still add zooms by hand in the editor",
  "经典箭头": "Classic arrow", "反色箭头": "Inverted arrow", "圆点": "Dot",
  "圆环": "Ring", "光晕": "Glow", "隐藏": "Hidden",
  "1080P 全高清": "1080p Full HD", "2K 超清": "2K QHD", "4K 超高清": "4K UHD",
  // 通用 / 导航
  "录制": "Record",
  "我的录制": "Recordings",
  "设置": "Settings",
  "正在启动AGRec…": "Starting AGRec…",
  "正在读取设置…": "Loading settings…",
  "正在打开录制…": "Opening recording…",
  "在访达中打开": "Show in Finder",
  "选择…": "Choose…",
  "更改": "Change",

  // 录制面板
  "整个屏幕": "Entire screen",
  "应用窗口": "App window",
  "框选区域": "Select area",
  "主显示器": "Main display",
  "选一个窗口": "Pick a window",
  "已选窗口": "Window picked",
  "拖一个框": "Drag a box",
  "显示器": "Display",
  "所在显示器": "On display",
  "选区": "Area",
  "目标窗口": "Target window",
  "请在屏幕上拖拽…": "Drag on the screen…",
  "重新框选": "Reselect",
  "开始框选": "Select area",
  "选一个窗口…": "Pick a window…",
  "没找到可录制的窗口，确认目标应用没有最小化": "No recordable windows found — make sure the app isn't minimized",
  "声音": "Audio",
  "麦克风讲解": "Microphone",
  "系统声音": "System audio",
  "不录声音": "No audio",
  "自动放大": "Auto zoom",
  "本次名称": "Name",
  "留空叫「录屏」": "Leave blank for \"Recording\"",
  "开始录制": "Start recording",
  "存到": "Saving to",
  "结束录制并进入编辑": "Stop and edit",
  "正在录制，屏幕上方的悬浮控制条可以暂停 / 继续 / 结束。":
    "Recording. Use the floating bar at the top of the screen to pause, resume or stop.",
  "还没有「屏幕录制」权限，macOS 会拒绝抓取画面。":
    "Screen Recording permission is missing — macOS will refuse to capture.",
  "去系统设置开启": "Open System Settings",
  "请先框选录制区域": "Select a recording area first",
  "请先选择要录制的窗口": "Pick a window to record first",
  "录制内核一次只能录一路声音，所以麦克风和系统声音是三选一，不能同时开。想要「边讲解边录电脑声音」得后期把两条轨道合起来。":
    "The recorder can only capture one audio source at a time, so microphone and system audio are mutually exclusive. To have both, mix the two tracks afterwards.",

  // 悬浮控制条
  "正在保存录制…": "Saving recording…",
  "隐藏预览": "Hide preview",
  "显示预览": "Show preview",
  "继续录制": "Resume",
  "暂停录制": "Pause",
  "结束录制": "Stop",
  "正在准备预览…": "Preparing preview…",

  // 设置窗口
  "通用": "General",
  "画质与导出": "Quality & export",
  "放大与快捷键": "Zoom & shortcuts",
  "鼠标指针": "Cursor",
  "悬浮控制条": "Floating bar",
  "关于": "About",
  "语言": "Language",
  "界面语言，切换后立即生效": "Interface language, applied immediately",
  "保存位置": "Save location",
  "每次录制会在这里新建一个项目文件夹": "Each recording gets its own project folder here",
  "文件夹": "Folder",
  "画质": "Quality",
  "按显示器 / 选区 / 窗口的原始比例输出，高度对齐所选档位":
    "Output keeps the source aspect ratio; the preset sets the height",
  "清晰度": "Resolution",
  "帧率": "Frame rate",
  "编码": "Codec",
  "HEVC 同画质体积更小；H.264 兼容性最好": "HEVC is smaller at equal quality; H.264 is the most compatible",
  "码率": "Bitrate",
  "放大方式与参数": "Zoom mode & parameters",
  "这里选哪种，下面就调哪种的参数；改了也会同步到录制面板上":
    "Pick a mode here to edit its parameters; the recording panel stays in sync",
  "录制中的快捷键": "Shortcuts while recording",
  "放大倍数": "Zoom level",
  "手动模式下这是起始倍数": "In manual mode this is the starting level",
  "缓入时长": "Ease in",
  "二次方缓出，越长越柔和": "Quadratic easing — longer is gentler",
  "缓出时长": "Ease out",
  "保持时长": "Hold",
  "触发后至少放大多久": "Minimum time to stay zoomed after triggering",
  "放大后跟随鼠标平移": "Pan with the cursor while zoomed",
  "关掉则锁定在触发点": "Off locks the view at the trigger point",
  "停留判定": "Dwell detection",
  "鼠标样式": "Cursor style",
  "录制时不录系统指针，导出时用你选的样式重绘，放大后依然清晰":
    "The system cursor isn't recorded; it's redrawn on export, so it stays sharp when zoomed",
  "指针大小": "Cursor size",
  "主色 / 描边": "Fill / outline",
  "点击水波纹": "Click ripple",
  "点击时出现扩散圆环，观众更容易注意到": "A ring spreads out on click so viewers notice it",
  "指针跟手程度": "Cursor smoothing",
  "越低越平滑，越高越贴近真实轨迹": "Lower is smoother, higher tracks the real path more closely",
  "放大时指针跟着变大": "Scale cursor with zoom",
  "样式": "Style",
  "画面预览": "With preview",
  "极简圆点": "Minimal dot",
  "实时画面": "Live view",
  "录制时停在屏幕顶部的那个小条。它已经被排除在录制画面之外，不会被录进视频":
    "The small bar that sits at the top of the screen while recording. It's excluded from the capture and never appears in the video.",
  "关于 AGRec": "About AGRec",
  "为知识博主做的 macOS 录屏工具，开源、免费": "A macOS screen recorder for educators and creators. Open source, free.",
  "当前版本": "Version",
  "软件更新": "Updates",
  "源代码": "Source code",
  "在 GitHub 上查看": "View on GitHub",
  "开发版": "Dev build",
  "打包版": "Release",
  "还没有录制记录。回到「录制」页开始第一次录屏吧。":
    "No recordings yet. Go to the Record tab to make your first one.",
};

const zhTW: Dict = {
  "鼠标停留放大": "滑鼠停留放大", "点击放大": "點擊放大", "点击开关": "點擊開關",
  "快捷键手动控制": "快速鍵手動控制", "不放大": "不放大",
  "经典箭头": "經典箭頭", "反色箭头": "反色箭頭", "圆点": "圓點",
  "圆环": "圓環", "光晕": "光暈", "隐藏": "隱藏",
  "1080P 全高清": "1080P 全高清", "2K 超清": "2K 超清", "4K 超高清": "4K 超高清",
  "录制": "錄製", "我的录制": "我的錄製", "设置": "設定",
  "正在启动AGRec…": "正在啟動 AGRec…", "正在读取设置…": "正在讀取設定…",
  "正在打开录制…": "正在開啟錄製…", "在访达中打开": "在 Finder 中開啟",
  "选择…": "選擇…", "更改": "變更",
  "整个屏幕": "整個螢幕", "应用窗口": "應用程式視窗", "框选区域": "框選區域",
  "主显示器": "主顯示器", "选一个窗口": "選一個視窗", "已选窗口": "已選視窗",
  "拖一个框": "拖一個框", "显示器": "顯示器", "所在显示器": "所在顯示器",
  "选区": "選區", "目标窗口": "目標視窗", "请在屏幕上拖拽…": "請在螢幕上拖曳…",
  "重新框选": "重新框選", "开始框选": "開始框選", "选一个窗口…": "選一個視窗…",
  "没找到可录制的窗口，确认目标应用没有最小化": "找不到可錄製的視窗，請確認目標應用程式沒有最小化",
  "声音": "聲音", "麦克风讲解": "麥克風講解", "系统声音": "系統聲音", "不录声音": "不錄聲音",
  "自动放大": "自動放大", "本次名称": "本次名稱", "留空叫「录屏」": "留空叫「螢幕錄製」",
  "开始录制": "開始錄製", "存到": "儲存至", "结束录制并进入编辑": "結束錄製並進入編輯",
  "正在录制，屏幕上方的悬浮控制条可以暂停 / 继续 / 结束。": "正在錄製，螢幕上方的懸浮控制列可以暫停 / 繼續 / 結束。",
  "还没有「屏幕录制」权限，macOS 会拒绝抓取画面。": "尚未取得「螢幕錄製」權限，macOS 會拒絕擷取畫面。",
  "去系统设置开启": "前往系統設定開啟",
  "请先框选录制区域": "請先框選錄製區域", "请先选择要录制的窗口": "請先選擇要錄製的視窗",
  "录制内核一次只能录一路声音，所以麦克风和系统声音是三选一，不能同时开。想要「边讲解边录电脑声音」得后期把两条轨道合起来。":
    "錄製核心一次只能錄一路聲音，所以麥克風和系統聲音是三選一，不能同時開啟。想要「邊講解邊錄電腦聲音」需要後期把兩條音軌合併。",
  "正在保存录制…": "正在儲存錄製…", "隐藏预览": "隱藏預覽", "显示预览": "顯示預覽",
  "继续录制": "繼續錄製", "暂停录制": "暫停錄製", "结束录制": "結束錄製", "正在准备预览…": "正在準備預覽…",
  "通用": "一般", "画质与导出": "畫質與匯出", "放大与快捷键": "放大與快速鍵",
  "鼠标指针": "滑鼠指標", "悬浮控制条": "懸浮控制列", "关于": "關於",
  "语言": "語言", "界面语言，切换后立即生效": "介面語言，切換後立即生效",
  "保存位置": "儲存位置", "每次录制会在这里新建一个项目文件夹": "每次錄製會在這裡新建一個專案資料夾",
  "文件夹": "資料夾", "画质": "畫質",
  "按显示器 / 选区 / 窗口的原始比例输出，高度对齐所选档位": "依顯示器 / 選區 / 視窗的原始比例輸出，高度對齊所選檔位",
  "清晰度": "解析度", "帧率": "影格率", "编码": "編碼",
  "HEVC 同画质体积更小；H.264 兼容性最好": "HEVC 同畫質檔案更小；H.264 相容性最好",
  "码率": "位元率", "放大方式与参数": "放大方式與參數",
  "这里选哪种，下面就调哪种的参数；改了也会同步到录制面板上": "這裡選哪一種，下面就調哪一種的參數；變更也會同步到錄製面板",
  "录制中的快捷键": "錄製中的快速鍵", "放大倍数": "放大倍數",
  "手动模式下这是起始倍数": "手動模式下這是起始倍數",
  "缓入时长": "漸入時間", "二次方缓出，越长越柔和": "二次方漸出，越長越柔和",
  "缓出时长": "漸出時間", "保持时长": "保持時間", "触发后至少放大多久": "觸發後至少放大多久",
  "放大后跟随鼠标平移": "放大後跟隨滑鼠平移", "关掉则锁定在触发点": "關閉則鎖定在觸發點",
  "停留判定": "停留判定", "鼠标样式": "滑鼠樣式",
  "录制时不录系统指针，导出时用你选的样式重绘，放大后依然清晰": "錄製時不錄系統指標，匯出時以你選的樣式重繪，放大後依然清晰",
  "指针大小": "指標大小", "主色 / 描边": "主色 / 外框", "点击水波纹": "點擊漣漪",
  "点击时出现扩散圆环，观众更容易注意到": "點擊時出現擴散圓環，觀眾更容易注意到",
  "指针跟手程度": "指標跟手程度", "越低越平滑，越高越贴近真实轨迹": "越低越平滑，越高越貼近真實軌跡",
  "放大时指针跟着变大": "放大時指標跟著變大",
  "样式": "樣式", "画面预览": "畫面預覽", "极简圆点": "極簡圓點", "实时画面": "即時畫面",
  "录制时停在屏幕顶部的那个小条。它已经被排除在录制画面之外，不会被录进视频":
    "錄製時停在螢幕頂端的那個小列。它已被排除在錄製畫面之外，不會被錄進影片",
  "关于 AGRec": "關於 AGRec",
  "为知识博主做的 macOS 录屏工具，开源、免费": "為知識創作者打造的 macOS 螢幕錄製工具，開源、免費",
  "当前版本": "目前版本", "软件更新": "軟體更新", "源代码": "原始碼",
  "在 GitHub 上查看": "在 GitHub 上檢視", "开发版": "開發版", "打包版": "發行版",
  "还没有录制记录。回到「录制」页开始第一次录屏吧。": "還沒有錄製紀錄。回到「錄製」頁開始第一次螢幕錄製吧。",
};

const ja: Dict = {
  "鼠标停留放大": "静止でズーム", "点击放大": "クリックでズーム", "点击开关": "クリックで切替",
  "快捷键手动控制": "手動（ショートカット）", "不放大": "ズームなし",
  "经典箭头": "標準の矢印", "反色箭头": "反転した矢印", "圆点": "ドット",
  "圆环": "リング", "光晕": "グロー", "隐藏": "非表示",
  "1080P 全高清": "1080p フル HD", "2K 超清": "2K QHD", "4K 超高清": "4K UHD",
  "录制": "録画", "我的录制": "録画一覧", "设置": "設定",
  "正在启动AGRec…": "AGRec を起動しています…", "正在读取设置…": "設定を読み込んでいます…",
  "正在打开录制…": "録画を開いています…", "在访达中打开": "Finder で表示",
  "选择…": "選択…", "更改": "変更",
  "整个屏幕": "画面全体", "应用窗口": "アプリのウインドウ", "框选区域": "範囲を選択",
  "主显示器": "メインディスプレイ", "选一个窗口": "ウインドウを選択", "已选窗口": "選択済み",
  "拖一个框": "ドラッグで指定", "显示器": "ディスプレイ", "所在显示器": "対象ディスプレイ",
  "选区": "範囲", "目标窗口": "対象ウインドウ", "请在屏幕上拖拽…": "画面上でドラッグしてください…",
  "重新框选": "選び直す", "开始框选": "範囲を選択", "选一个窗口…": "ウインドウを選択…",
  "没找到可录制的窗口，确认目标应用没有最小化": "録画できるウインドウがありません。アプリが最小化されていないか確認してください",
  "声音": "音声", "麦克风讲解": "マイク", "系统声音": "システム音声", "不录声音": "録音しない",
  "自动放大": "自動ズーム", "本次名称": "名前", "留空叫「录屏」": "空欄なら「録画」",
  "开始录制": "録画を開始", "存到": "保存先", "结束录制并进入编辑": "停止して編集",
  "正在录制，屏幕上方的悬浮控制条可以暂停 / 继续 / 结束。":
    "録画中です。画面上部のフローティングバーで一時停止・再開・停止できます。",
  "还没有「屏幕录制」权限，macOS 会拒绝抓取画面。":
    "「画面収録」の権限がありません。macOS が画面の取得を拒否します。",
  "去系统设置开启": "システム設定を開く",
  "请先框选录制区域": "先に録画範囲を選択してください", "请先选择要录制的窗口": "先に録画するウインドウを選択してください",
  "录制内核一次只能录一路声音，所以麦克风和系统声音是三选一，不能同时开。想要「边讲解边录电脑声音」得后期把两条轨道合起来。":
    "録画エンジンは一度に 1 系統の音声しか収録できないため、マイクとシステム音声は排他です。両方必要な場合は後から 2 つのトラックをミックスしてください。",
  "正在保存录制…": "録画を保存しています…", "隐藏预览": "プレビューを隠す", "显示预览": "プレビューを表示",
  "继续录制": "再開", "暂停录制": "一時停止", "结束录制": "停止", "正在准备预览…": "プレビューを準備中…",
  "通用": "一般", "画质与导出": "画質と書き出し", "放大与快捷键": "ズームとショートカット",
  "鼠标指针": "カーソル", "悬浮控制条": "フローティングバー", "关于": "情報",
  "语言": "言語", "界面语言，切换后立即生效": "表示言語。切り替えるとすぐに反映されます",
  "保存位置": "保存先", "每次录制会在这里新建一个项目文件夹": "録画ごとにここへプロジェクトフォルダを作成します",
  "文件夹": "フォルダ", "画质": "画質",
  "按显示器 / 选区 / 窗口的原始比例输出，高度对齐所选档位": "元のアスペクト比のまま書き出し、高さをプリセットに合わせます",
  "清晰度": "解像度", "帧率": "フレームレート", "编码": "コーデック",
  "HEVC 同画质体积更小；H.264 兼容性最好": "HEVC は同画質でより小さく、H.264 は互換性が最も高い",
  "码率": "ビットレート", "放大方式与参数": "ズーム方式とパラメータ",
  "这里选哪种，下面就调哪种的参数；改了也会同步到录制面板上": "ここで選んだ方式のパラメータを下で調整します。録画パネルとも同期します",
  "录制中的快捷键": "録画中のショートカット", "放大倍数": "ズーム倍率",
  "手动模式下这是起始倍数": "手動モードでは開始倍率になります",
  "缓入时长": "イーズイン", "二次方缓出，越长越柔和": "二次イージング。長いほど滑らかです",
  "缓出时长": "イーズアウト", "保持时长": "保持時間", "触发后至少放大多久": "トリガー後に最低限ズームを保つ時間",
  "放大后跟随鼠标平移": "ズーム中にカーソルへ追従", "关掉则锁定在触发点": "オフならトリガー地点に固定",
  "停留判定": "静止の判定", "鼠标样式": "カーソルの見た目",
  "录制时不录系统指针，导出时用你选的样式重绘，放大后依然清晰":
    "システムカーソルは収録せず、書き出し時に描き直すのでズームしても鮮明です",
  "指针大小": "カーソルの大きさ", "主色 / 描边": "塗り / 輪郭", "点击水波纹": "クリックの波紋",
  "点击时出现扩散圆环，观众更容易注意到": "クリック時に広がる円で視聴者が気づきやすくなります",
  "指针跟手程度": "追従の強さ", "越低越平滑，越高越贴近真实轨迹": "低いほど滑らか、高いほど実際の軌跡に忠実",
  "放大时指针跟着变大": "ズームに合わせてカーソルも拡大",
  "样式": "スタイル", "画面预览": "プレビュー付き", "极简圆点": "最小表示", "实时画面": "ライブ映像",
  "录制时停在屏幕顶部的那个小条。它已经被排除在录制画面之外，不会被录进视频":
    "録画中に画面上部に表示される小さなバーです。収録対象から除外されており、映像には映りません",
  "关于 AGRec": "AGRec について",
  "为知识博主做的 macOS 录屏工具，开源、免费": "教育系クリエイターのための macOS 画面録画ツール。オープンソース・無料",
  "当前版本": "バージョン", "软件更新": "アップデート", "源代码": "ソースコード",
  "在 GitHub 上查看": "GitHub で見る", "开发版": "開発版", "打包版": "リリース版",
  "还没有录制记录。回到「录制」页开始第一次录屏吧。": "まだ録画がありません。「録画」タブから最初の録画を始めましょう。",
};

const es: Dict = {
  "鼠标停留放大": "Zoom al detenerse", "点击放大": "Zoom al hacer clic", "点击开关": "Clic para alternar",
  "快捷键手动控制": "Manual (atajos)", "不放大": "Sin zoom",
  "经典箭头": "Flecha clásica", "反色箭头": "Flecha invertida", "圆点": "Punto",
  "圆环": "Anillo", "光晕": "Halo", "隐藏": "Oculto",
  "1080P 全高清": "1080p Full HD", "2K 超清": "2K QHD", "4K 超高清": "4K UHD",
  "录制": "Grabar", "我的录制": "Grabaciones", "设置": "Ajustes",
  "正在启动AGRec…": "Iniciando AGRec…", "正在读取设置…": "Cargando ajustes…",
  "正在打开录制…": "Abriendo grabación…", "在访达中打开": "Mostrar en Finder",
  "选择…": "Elegir…", "更改": "Cambiar",
  "整个屏幕": "Pantalla completa", "应用窗口": "Ventana de app", "框选区域": "Seleccionar área",
  "主显示器": "Pantalla principal", "选一个窗口": "Elige una ventana", "已选窗口": "Ventana elegida",
  "拖一个框": "Arrastra un marco", "显示器": "Pantalla", "所在显示器": "En la pantalla",
  "选区": "Área", "目标窗口": "Ventana objetivo", "请在屏幕上拖拽…": "Arrastra sobre la pantalla…",
  "重新框选": "Volver a seleccionar", "开始框选": "Seleccionar área", "选一个窗口…": "Elige una ventana…",
  "没找到可录制的窗口，确认目标应用没有最小化": "No se encontraron ventanas grabables; comprueba que la app no esté minimizada",
  "声音": "Audio", "麦克风讲解": "Micrófono", "系统声音": "Audio del sistema", "不录声音": "Sin audio",
  "自动放大": "Zoom automático", "本次名称": "Nombre", "留空叫「录屏」": "En blanco: «Grabación»",
  "开始录制": "Empezar a grabar", "存到": "Se guarda en", "结束录制并进入编辑": "Detener y editar",
  "正在录制，屏幕上方的悬浮控制条可以暂停 / 继续 / 结束。":
    "Grabando. Usa la barra flotante superior para pausar, reanudar o detener.",
  "还没有「屏幕录制」权限，macOS 会拒绝抓取画面。":
    "Falta el permiso de Grabación de Pantalla; macOS bloqueará la captura.",
  "去系统设置开启": "Abrir Ajustes del Sistema",
  "请先框选录制区域": "Selecciona primero un área", "请先选择要录制的窗口": "Elige primero una ventana",
  "录制内核一次只能录一路声音，所以麦克风和系统声音是三选一，不能同时开。想要「边讲解边录电脑声音」得后期把两条轨道合起来。":
    "El motor de grabación solo captura una fuente de audio a la vez, así que micrófono y audio del sistema son excluyentes. Para tener ambos, mezcla las dos pistas después.",
  "正在保存录制…": "Guardando grabación…", "隐藏预览": "Ocultar vista previa", "显示预览": "Mostrar vista previa",
  "继续录制": "Reanudar", "暂停录制": "Pausar", "结束录制": "Detener", "正在准备预览…": "Preparando vista previa…",
  "通用": "General", "画质与导出": "Calidad y exportación", "放大与快捷键": "Zoom y atajos",
  "鼠标指针": "Cursor", "悬浮控制条": "Barra flotante", "关于": "Acerca de",
  "语言": "Idioma", "界面语言，切换后立即生效": "Idioma de la interfaz, se aplica al instante",
  "保存位置": "Ubicación", "每次录制会在这里新建一个项目文件夹": "Cada grabación crea aquí su propia carpeta",
  "文件夹": "Carpeta", "画质": "Calidad",
  "按显示器 / 选区 / 窗口的原始比例输出，高度对齐所选档位": "Mantiene la proporción original; el preajuste fija la altura",
  "清晰度": "Resolución", "帧率": "Fotogramas", "编码": "Códec",
  "HEVC 同画质体积更小；H.264 兼容性最好": "HEVC pesa menos con igual calidad; H.264 es el más compatible",
  "码率": "Tasa de bits", "放大方式与参数": "Modo de zoom y parámetros",
  "这里选哪种，下面就调哪种的参数；改了也会同步到录制面板上":
    "Elige un modo aquí para ajustar sus parámetros; el panel de grabación se mantiene sincronizado",
  "录制中的快捷键": "Atajos durante la grabación", "放大倍数": "Nivel de zoom",
  "手动模式下这是起始倍数": "En modo manual es el nivel inicial",
  "缓入时长": "Entrada", "二次方缓出，越长越柔和": "Suavizado cuadrático: cuanto más largo, más suave",
  "缓出时长": "Salida", "保持时长": "Mantener", "触发后至少放大多久": "Tiempo mínimo con zoom tras activarse",
  "放大后跟随鼠标平移": "Seguir al cursor con zoom", "关掉则锁定在触发点": "Desactivado: fija la vista en el punto de activación",
  "停留判定": "Detección de pausa", "鼠标样式": "Estilo del cursor",
  "录制时不录系统指针，导出时用你选的样式重绘，放大后依然清晰":
    "El cursor del sistema no se graba: se redibuja al exportar, así que se ve nítido al ampliar",
  "指针大小": "Tamaño", "主色 / 描边": "Relleno / borde", "点击水波纹": "Onda al hacer clic",
  "点击时出现扩散圆环，观众更容易注意到": "Un anillo se expande al hacer clic para que se note",
  "指针跟手程度": "Suavizado del cursor", "越低越平滑，越高越贴近真实轨迹": "Más bajo, más suave; más alto, más fiel al trazo real",
  "放大时指针跟着变大": "Escalar el cursor con el zoom",
  "样式": "Estilo", "画面预览": "Con vista previa", "极简圆点": "Punto mínimo", "实时画面": "En vivo",
  "录制时停在屏幕顶部的那个小条。它已经被排除在录制画面之外，不会被录进视频":
    "La pequeña barra que aparece arriba mientras grabas. Está excluida de la captura y nunca sale en el vídeo",
  "关于 AGRec": "Acerca de AGRec",
  "为知识博主做的 macOS 录屏工具，开源、免费": "Grabador de pantalla para macOS pensado para creadores educativos. Libre y gratuito",
  "当前版本": "Versión", "软件更新": "Actualizaciones", "源代码": "Código fuente",
  "在 GitHub 上查看": "Ver en GitHub", "开发版": "Compilación de desarrollo", "打包版": "Versión",
  "还没有录制记录。回到「录制」页开始第一次录屏吧。": "Aún no hay grabaciones. Ve a «Grabar» para hacer la primera.",
};

const DICT: Record<Locale, Dict> = { "zh-CN": {}, en, "zh-TW": zhTW, ja, es };

let current: Locale = "zh-CN";

/** 设置当前语言。各个窗口读到 settings 之后调一次即可。 */
export function setLocale(l: Locale | undefined) {
  current = l && DICT[l] ? l : "zh-CN";
}

export function getLocale(): Locale {
  return current;
}

/** 取译文。没有对应翻译时原样返回中文，界面不会出现空缺。 */
export function t(zh: string): string {
  return DICT[current][zh] ?? zh;
}
