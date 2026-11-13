#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: layoutSpace.spec.md 規則 2「標頭 → 第一個東西」依第一個東西的角色決定距離 ——
 *         bounded region(有框的表格 / 卡 / 面板)= loose、unbounded region(自帶 py 的清單 / nav)= 0、element(標題 / 文字 / 欄位 / 按鈕 / 工具列)= tight。
 *         CASES = 全 DS 盤點(2026-11-10,c2fc683d 建置逐則掃 1079 則 story 的每個 chrome 標頭,另 grep 浮層 body / AppShellAside 的第一個子元素)
 *         出的「標頭底下由範例或元件給頂部內距」的每一處;
 *         md 與 lg 兩種密度各量一次。2026-11-13 補 AgentPanel 對話區三處(第一則是我方氣泡 / 代理文字、新對話空白頁;
 *         layoutSpace.spec.md 規則 2「適用範圍與量法三點」【AI 推導 2026-11-13】)。量法與本閘不同、另有閘守的(決策卡無分隔線標頭、
 *         Coachmark 媒體區、DataTable 巢狀篩選群組)、版面分區(FileViewer 工具列 → Viewport(檢視區)、Alert placement="fixed" 頁首橫條)、
 *         Sidebar 自己的 nav(清單的 py 在 SidebarGroup 包層上)不在 CASES,理由逐條見下方 NOT_COVERED。
 *   紅: 任一處「標頭底 → 第一個內容頂」與該角色的期望值差 > 0.5px → 指名 case / 密度 / 角色 / 數字並 exit 1;
 *       從 DOM 判出的角色 ≠ 盤點時登記的角色 → 紅(範例換了第一個東西,要重新照規則 2 推一次,不准默默沿用舊頂距)。
 *       量的當下第一個內容所在的捲動區沒有捲在最上面(捲回頂端後讀回的捲動位置不是 0)→ 儀器失效,那一格不再往下判 —— 不拿被捲走的距離指控產品(見量法)。
 *       歷史紅燈(c2fc683d 建置實測):Sidebar「混合內容」資料夾 → 檔案表格、檔案 → 版本紀錄表格,第一個是有框的 DataTable
 *       (bounded),頂距卻是 tight(md 12 / lg 16)—— 抄旁邊 TableSection(第一個是區段標題 = element = tight)沒照角色重推。
 *       2026-11-11 起主區只有一張表格的頁不再放區段標題(app-shell.spec.md「Main 內塞什麼」,user 2026-11-11 留言):Sidebar Dashboard / 專案、
 *       AppShell InsightsView、範本 DashboardPage 登記改為 bounded;拿修前 411fcc49 建置跑,這 4 處判出 element(h2)→ 與登記不符必紅。
 *   綠: 每一處都等於角色的期望值。純幾何,等元素本身出現、動畫跑完才量;重複跑恆等。
 *   量法: 靜態站開 story(globals density),必要時先點到該狀態(例:樹上點 README.md、展開 FileViewer 資訊面板),
 *         等該狀態的元素本身出現(waitForSelector,不睡固定時間)、`document.getAnimations()` 沒有跑動中的動畫(浮層開場縮放會把距離一起縮)
 *         才量 getBoundingClientRect(M32:量像素,不看 class)。
 *         量之前先把標頭之後那塊(含它自己)裡每一層捲動過的容器捲回頂端 —— 頂距是「捲在最上面時」的距離。對話區(agent-panel.tsx#AgentConversation)
 *         一進頁會自動捲到底,內容一比捲動區高,第一則訊息就被捲到標頭後面:2026-11-13 審查實測,把視窗高從本閘用的 900 換成 600,
 *         「第一則是我方氣泡」那格量到 −53 / −73 並指控產品「應 12 / 16」(900 時會綠,是因為那則範例的內容比捲動區矮)。捲完讀回第一個內容
 *         往上到那塊的每一層捲動位置,不是 0 → 儀器失效「… 沒有捲在最上面」,不拿那個距離判產品。這一步對盤點的每一格都做(不只對話區那兩格;
 *         其他格目前進頁都停在頂端,捲回頂端是空動作);姊妹閘量「頂」用同一步(pageKit.scrollBody / scrollOffset)。
 *         第一個內容 = 標頭之後的下一塊(同層下一個看得見的兄弟,沒有就往上找)裡所有「看得見的東西」中頂邊最高的那個
 *         (有框 / 底色 / 陰影、有自己的字、控件、或清單 / 表格語意;絕對定位的裝飾與捲軸不算)。頂邊:有框的東西、清單、控件量外框;
 *         只有字的包層量內容框(包層的上內距是間距不是內容)。角色判法(classifyFirst,純函式,selftest 逐列驗):
 *           · DataTable 外殼(`[data-data-table-outer]`)、或有框(≥ 3 邊框線 / 跟外層不同的底色 / 陰影)且不是單一欄位控件、不是控件 / 縮圖
 *             (按鈕 / 連結 / 勾選 / 進度條 / role=img)、不是 Alert、而且**外框撐滿容器內容寬** → bounded;
 *           · 有框但外框沒撐滿容器內容寬(左右有不是內距 / 框線 / 外距給的空白 > 1px,例:寬最多 85% 的我方訊息氣泡)→ element
 *             (2026-11-13;layoutSpace.spec.md「元件角色」那張表:region「寬度撐滿」對 element「寬高自然」;有沒有底色是先判成 region 之後才問的題
 *             (同檔「心智模型」Step 1)。【AI 推導 2026-11-13】「撐不撐滿寬」只是「占不占該層主要空間」的近似,兩個方向都會判錯 ——
 *             紅了、或新增下面這幾種格時,一律照規格「判斷 3 題」人工重判,把人判的角色寫進 CASES,不照閘判出來的角色填:
 *               (a) 會被判成 element 的另外幾種形狀:並排的幾張卡、置中的定寬卡(max-width + 左右 auto 外距,即使它是該層唯一的主角)、
 *                   主欄的卡旁邊有側欄、撐滿寬的卡但容器有傳統捲軸佔位(容器內容寬少掉捲軸那一條);
 *               (b) 反方向,會被判成 bounded 的:撐滿寬、有框、但只是 N 則之一的塊(例:對話裡的決策回執)排第一個時。這時閘會紅
 *                   「角色與盤點不符」—— 要照規格三題人工重判(規格「元件角色」的例子:對話訊息流裡的每一則訊息 = element),不是直接把頂距改成 loose。
 *               (a)(b) 的形狀 2026-11-13 審查用本檔的頁面量具在合成頁面上逐一量過;目前盤點的格都沒有踩到);
 *             有框卻沒量到撐不撐滿 → 判不出角色 = 儀器失效;
 *           · role = list / listbox / menu / tree / navigation 或 ul / ol / nav、沒有框、而且自帶上內距(第一列不貼清單頂)→ unbounded;
 *           · 其他(標題、文字、欄位、按鈕、工具列、沒自帶 py 的純文字清單)→ element。
 *         期望值的 loose / tight 從第一個內容的外層 computed `--layout-space-*` 讀(部分浮層刻意鎖 md,照它自己讀到的算);
 *         另要求頁面根(#storybook-root)的 loose md ≠ lg —— 兩密度讀到同值 = 密度沒套上 = 儀器失效(不讀成通過)。
 *         只看得到外框的東西才算:沒框的按鈕 / 連結往裡找圖示或字(負邊距撐出列外的透明按鈕框不是看得見的內容)。
 *         置中的格(CASES `centered: true`,例:新對話空白頁的空狀態在撐滿的包層裡置中):頂距改量**結構內距** —— 從第一個內容往上到容器內緣,
 *         每一層的 padding + border + margin 加總(置中多出來的空白不算;與姊妹閘量左右 / 底同一個量法,layoutSpace.spec.md 規則 2「適用範圍與量法三點」(3)),
 *         另要求內容真的在內距框裡置中(內距框內上方空白 = 下方空白,差 ≤ 0.5px)—— 不置中了就不是這個量法管的格,紅,重推。
 *         `--selftest`:(a) 判定表 —— 表格外層改 tight 必紅、標題在前卻用 loose 必紅、清單不貼標頭必紅、角色與盤點不符必紅、
 *         對話區頂距打回 loose(修前建置實測 16 / 24:735eb800 建置,以及把本次兩行改動還原後重建的 9faad029 畫面,兩份都跑過、新增的 6 格全紅)必紅、
 *         氣泡被判成 bounded 必紅、空白頁包層沒有上內距(修前實測 0)必紅、
 *         置中不成立必紅、沒量到 / 距離 NaN / 置中量不到 / 密度沒套上 / 沒捲在最上面 / 沒讀到捲動位置判儀器失效、修後形狀必綠;(b) classifyFirst 逐列;
 *         (c) 對話溢出對照(真建置、真瀏覽器;(a)(b) 先過才跑;沒有建置 / 起不了瀏覽器照共用政策印缺前置 / 略過標記):對話區兩格 × 兩密度,
 *         把視窗高縮到對話內容真的比捲動區高(從 300 往下試,量到捲得動才算數;都造不出溢出 = 對照組不成立 = selftest 失敗 —— 不靠範例現在剛好多長),
 *         同一頁量兩次:不先捲(把對話捲到底,= 進頁自動捲到底的那個狀態)→ 必須判成儀器失效「對話沒有捲在最上面」而且沒有任何一行指控產品;
 *         先捲到頂 → 讀回捲動位置 0、距離 = tight、綠。
 *         `--static=<dir>` 指定建置(例:拿 c2fc683d 建置證明 Sidebar 那兩處會紅);指定時不跑新鮮度守衛。
 *   姊妹閘: header-content-sides-invariant.mjs 量同一份 CASES 的左 / 右 / 底(規則 1 / 6 / 4);盤點(CASES / NOT_COVERED)、導航(openCase)、
 *         頁面端量具(pageKit)、角色判法(classifyFirst)只住本檔,兩支 import 同一份。新增一處 = 本檔 CASES + 姊妹閘 SIDES(它的 selftest 驗一一對應)。
 *         pageKit 另有一個使用者:agent-decision-card-validation-invariant.mjs 的 G2(2026-11-13)import 本檔的 installPageKit,用 collectThings / bottomOf
 *         找決策卡標題列裡最低的那個內容 —— 改「看得見的東西」的判法時,那支的 --selftest 也要跑。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = path.resolve(staticArg ? staticArg.slice('--static='.length) : path.join(REPO, 'storybook-static'))
const TOL = 0.5
const DENSITIES = ['md', 'lg']
const C = 'design-system-components-'
const DS = 'packages/design-system/src/'
const SURFACE_HEADER = '[data-slot="surface-header"]'
const AGENT_PANEL_HEADER = '[data-agent-panel-mode] header'

/**
 * 盤點出的每一處。header = 標頭選擇器(+ headerText:標頭文字須包含;+ nth);waitFor = 這個狀態的內容本身;
 * steps = 量之前要點到的狀態(click = 樹列 / 按鈕的可見文字,或 clickSelector),點完等 waitFor 那個元素出現;
 * role = 盤點時照規則 2 判的角色;src = 給頂部內距的那一行(repo 相對路徑,也是新鮮度守衛的來源清單)。
 * centered = 內容在撐滿的容器裡置中的格:頂距量容器的結構上內距、另驗內容真的在內距框裡置中(量法見檔頭)。
 * scroller = 第一個內容所在的捲動區在訊息裡怎麼稱呼(沒捲在最上面時點名用;沒寫 = 「第一個內容所在的捲動區」)。寫了這一欄的格 = 進頁會自己捲動的格
 * (目前只有對話區兩格:一進頁自動捲到底),--selftest (c) 拿它們造溢出做對照;量之前捲回頂端、捲完讀回這一步每一格都做,不看這一欄。
 * tableName =主區只有一張表、不放區段標題的那幾處:表格的讀屏名稱(aria-label)必須是這個字串 —— 看得見的標題拿掉後,名字只剩這裡
 * (Sidebar 那幾處另有 sidebar-main-follows-selection 比對;AppShell Insights 與範本原本沒有任何閘守,2026-11-11 r3 審查補)。
 * src 寫「檔名#宣告」優先於「檔名:行號」(owner-claims C6(c) 驗宣告存在;行號在被引用檔上方加一行就過期 —— 2026-11-11 Sidebar 的 MainTable
 * 那一行在同一串 commit 裡從第 250 行被推到第 260 行,C6(b) 紅;改成宣告名後不再跟行數走)。
 */
/** CASES.src → 檔案路徑(去掉 `:行號` 或 `#宣告`),新鮮度守衛用;姊妹閘 import 同一支 */
export const srcFile = (c) => c.src.replace(/(?::\d+|#[\w$-]+)$/, '')
export const CASES = [
  // ── 範例自己給的頂部內距(consumer 組裝)
  // 主區只有一張表格的頁(app-shell.spec.md「Main 內塞什麼」:不在主區重複放標題與說明,2026-11-11 起)—— 第一個內容 = 有框的 DataTable = bounded;
  // 主區若又放回區段標題,DOM 判出的角色變 element → 與登記的 bounded 不符 → 紅
  { id: 'sidebar-mixed-folder', story: `${C}sidebar-展示--mixed-content`, header: 'main > header', waitFor: '[aria-label="frontend 裡的檔案"]', role: 'bounded', src: `${DS}components/Sidebar/sidebar.stories.tsx#MainTable`, label: 'Sidebar 混合內容 資料夾 frontend → 檔案表格(MainTable)' },
  { id: 'sidebar-mixed-file', story: `${C}sidebar-展示--mixed-content`, header: 'main > header', waitFor: '[aria-label="frontend 裡的檔案"]', steps: [{ click: 'README.md', waitFor: '[aria-label="README.md 的版本紀錄"]' }], role: 'bounded', src: `${DS}components/Sidebar/sidebar.stories.tsx#MainTable`, label: 'Sidebar 混合內容 檔案 README.md → 版本紀錄表格(MainTable)' },
  { id: 'sidebar-mixed-ios', story: `${C}sidebar-展示--mixed-content`, header: 'main > header', waitFor: '[aria-label="frontend 裡的檔案"]', steps: [{ click: 'Mobile App', waitFor: '[aria-label="Mobile App 裡的檔案"]' }, { press: 'ArrowRight', waitFor: '#storybook-root [role="treegrid"] [role="row"][aria-level="2"]:has-text("iOS")' }, { click: 'iOS', waitFor: '[aria-label="iOS 裡的檔案"]' }], role: 'bounded', src: `${DS}components/Sidebar/sidebar.stories.tsx#MainTable`, label: 'Sidebar 混合內容 資料夾 Mobile App → iOS → 檔案表格(MainTable;user 2026-11-11 在這張圖留言「你要確保這個table有按照layout space的設計原則排版吧？」)' },
  { id: 'sidebar-dashboard-table', story: `${C}sidebar-展示--icon-collapse`, header: 'main > header', waitFor: 'main [role="table"]', tableName: '今日待處理議題', role: 'bounded', src: `${DS}components/Sidebar/sidebar.stories.tsx#MainTable`, label: 'Sidebar 完整佈局 Dashboard → 今日待處理議題表格(MainTable)' },
  { id: 'sidebar-project-table', story: `${C}sidebar-展示--group-action`, header: 'main > header', waitFor: 'main [role="table"]', tableName: '進行中的議題', role: 'bounded', src: `${DS}components/Sidebar/sidebar.stories.tsx#MainTable`, label: 'Sidebar 群組動作 專案 → 進行中的議題表格(MainTable)' },
  { id: 'appshell-insights', story: `${C}appshell-設計規格--overview`, header: 'header', headerText: 'Dashboard', waitFor: '#app-shell-main [role="table"]', tableName: 'Sprint 42 還沒完成的議題', role: 'bounded', src: `${DS}components/AppShell/_demo-helpers.tsx#InsightsView`, label: 'AppShell 元件總覽 Main → InsightsView 表格' },
  { id: 'appshell-aside-issue', story: `${C}appshell-設計規格--overview`, header: 'header', headerText: 'ENG-1042', waitFor: 'dl', role: 'element', src: `${DS}components/AppShell/_demo-helpers.tsx:437`, label: 'AppShell 元件總覽 Right panel 議題詳情(主區表格的 ENG-1042)→ 標題列' },
  { id: 'appshell-readout', story: `${C}appshell-設計規格--state-behavior`, header: 'header', headerText: 'Sprint 42 議題', waitFor: '[data-readout="menu"]', role: 'element', src: `${DS}components/AppShell/app-shell.anatomy.stories.tsx:206`, label: 'AppShell 狀態行為 Main → 讀數 DescriptionList' },
  { id: 'appshell-rule-aside', story: `${C}appshell-設計規格--state-behavior`, header: 'header', headerText: 'ENG-1042', waitFor: '[data-readout="menu"]', role: 'element', src: `${DS}components/AppShell/app-shell.anatomy.stories.tsx:280`, label: 'AppShell 狀態行為 Right panel → 一段文字' },
  { id: 'appshell-inbox-toolbar', story: `${C}appshell-展示--primary-sidebar`, header: 'header', headerText: 'Inbox', waitFor: '#app-shell-main [role="table"]', role: 'element', src: `${DS}stories-helpers/scene/data-toolbar.tsx:41`, label: 'AppShell 主側欄 Inbox → 工具列(搜尋 / 篩選)' },
  { id: 'appshell-inbox-tabs-toolbar', story: `${C}appshell-展示--primary-sidebar-with-tabs`, header: 'header', headerText: 'Inbox', waitFor: '#app-shell-main [role="table"]', role: 'element', src: `${DS}stories-helpers/scene/data-toolbar.tsx:41`, label: 'AppShell 主側欄 + 分頁 Inbox → 分頁內容的工具列' },
  { id: 'appshell-issue-detail', story: `${C}appshell-展示--primary-sidebar`, header: 'header', headerText: 'ENG-1042', waitFor: '#app-shell-main [role="table"]', role: 'element', src: `${DS}components/AppShell/_demo-helpers.tsx:437`, label: 'AppShell 主側欄 Right panel 議題詳情 → 標題列' },
  { id: 'template-dashboard', story: 'apps-template-appshell-dashboard--default', header: 'header', headerText: '總覽', waitFor: 'main [role="table"]', tableName: '今日待處理訂單', role: 'bounded', src: 'apps/template/src/App.tsx:178', label: '範本 DashboardPage → 今日待處理訂單表格(ds-canonical/templates/dashboard-app.tsx 同一份)' },
  { id: 'agentpanel-task-list', story: `${C}agentpanel-展示--url-registry-demo`, header: 'header', headerText: '結帳流程改版', waitFor: '#demo-stage-main [role="table"]', role: 'element', src: `${DS}stories-helpers/scene/data-toolbar.tsx:41`, label: 'AgentPanel 有網址的頁 任務清單 → 分頁內容的工具列' },
  { id: 'header-single-row', story: 'design-system-patterns-header-anatomy--single-row', header: 'header', waitFor: 'header + div p', role: 'element', src: `${DS}patterns/header-canonical/header-canonical.stories.tsx:131`, label: 'Header 單列 → 一行說明' },
  { id: 'header-with-tabs', story: 'design-system-patterns-header-anatomy--with-tabs', header: 'header', waitFor: '[role="tabpanel"] p', role: 'element', src: `${DS}patterns/header-canonical/header-canonical.stories.tsx:173`, label: 'Header 帶分頁 → 概覽兩行(TabsContent 內建 mt-tight)' },
  // ── 元件自己給的頂部內距(DialogBody / SheetBody / SurfaceBody / FileViewer 資訊面板 / Popover 清單即區域)
  { id: 'fileviewer-info-panel', story: `${C}fileviewer-展示--open-snapshot`, header: 'aside header', waitFor: 'button[aria-label="展開詳細資訊面板"]', steps: [{ clickSelector: 'button[aria-label="展開詳細資訊面板"]', waitFor: 'aside textarea' }], role: 'element', src: `${DS}components/FileViewer/file-viewer.tsx:527`, label: 'FileViewer 資訊面板 → 說明欄位(規格範例 3)' },
  { id: 'dialog-body', story: `${C}dialog-展示--open-snapshot`, header: SURFACE_HEADER, waitFor: '[role="dialog"] p', role: 'element', src: `${DS}components/Dialog/dialog.tsx:448`, label: 'Dialog → 內文第一段' },
  { id: 'sheet-body', story: `${C}sheet-展示--open-snapshot`, header: SURFACE_HEADER, waitFor: '[role="dialog"] label', role: 'element', src: `${DS}components/Sheet/sheet.tsx:244`, label: 'Sheet → 第一個欄位' },
  { id: 'surface-body', story: 'design-system-internal-patterns-overlay-surface--three-part-structure', header: SURFACE_HEADER, waitFor: '[data-slot="surface-body"] p', role: 'element', src: `${DS}patterns/overlay-surface/overlay-surface.tsx:195`, label: 'SurfaceHeader / Body / Footer 三段 → 內文第一段' },
  { id: 'header-anatomy-surface', story: 'design-system-patterns-header-anatomy--overview', header: SURFACE_HEADER, waitFor: '[data-slot="surface-body"] dl', role: 'element', src: `${DS}patterns/overlay-surface/overlay-surface.tsx:195`, label: 'Header 元件總覽 SurfaceHeader → DescriptionList' },
  { id: 'popover-inspector', story: `${C}popover-設計規格--inspector`, header: SURFACE_HEADER, waitFor: '[data-slot="surface-body"] [role="group"]', role: 'element', src: `${DS}patterns/overlay-surface/overlay-surface.tsx:195`, label: 'Popover 檢視器 → 勾選群組' },
  { id: 'datatable-filter-panel', story: `${C}datatable-展示--filter-panel-empty`, header: SURFACE_HEADER, waitFor: '[data-slot="surface-body"] button', role: 'element', src: `${DS}components/DataTable/data-table-filter-panel.tsx:394`, label: 'DataTable 篩選面板 → 第一列條件' },
  { id: 'fileitem-upload-manager', story: `${C}fileitem-展示--upload-manager-surface`, header: SURFACE_HEADER, waitFor: '[data-slot="surface-body"] img', role: 'element', src: `${DS}patterns/overlay-surface/overlay-surface.tsx:195`, label: 'FileItem 上傳管理面板 → 第一個檔案列' },
  { id: 'popover-list-region', story: `${C}popover-展示--open-snapshot`, header: SURFACE_HEADER, waitFor: '[role="listbox"]', role: 'unbounded', src: `${DS}components/Popover/popover.stories.tsx:71`, label: 'Popover 清單即區域 → 選項清單(body 撤內距、清單自帶 py)' },
  // ── AgentPanel 對話區(2026-11-13;layoutSpace.spec.md 規則 2「適用範圍與量法三點」、角色例子「對話訊息流」,皆【AI 推導 2026-11-13】,user 沒有逐字講過)
  // 對話區 = 標頭底下的 body(底已是 48 = 規則 4 第 1 列),每一則訊息 = element → 頂 tight;第一則是誰(我方氣泡 / 代理文字)頂距都不變。
  // 不用「任務助理」那則:代理標誌的動畫不會停,openCase 等動畫跑完會 10 秒逾時。
  // 對話區一進頁會自動捲到底(agent-panel.tsx#AgentConversation):內容比捲動區高時第一則訊息被捲到標頭後面 → 量之前捲回頂端、捲完讀回(檔頭量法;scroller 見上方欄位說明)。
  { id: 'agentpanel-chat-user-first', story: `${C}agentpanel-展示--multiple-replies`, header: AGENT_PANEL_HEADER, waitFor: '[role="log"] > *', role: 'element', scroller: '對話', src: `${DS}components/AgentPanel/agent-panel.tsx#AgentConversation`, label: 'AgentPanel 對話區 → 第一則是我方氣泡(有底色、寬最多 85%、沒撐滿寬 = element)' },
  { id: 'agentpanel-chat-agent-first', story: `${C}agentpanel-展示--decision-summary-in-flow`, header: AGENT_PANEL_HEADER, waitFor: '[role="log"] > *', role: 'element', scroller: '對話', src: `${DS}components/AgentPanel/agent-panel.tsx#AgentConversation`, label: 'AgentPanel 對話區 → 第一則是代理文字' },
  // 新對話空白頁:空狀態在撐滿的包層裡置中 → 頂距量包層的結構上內距(centered,量法見檔頭);等的是包層裡的招喚態標誌本身(不認文案)
  { id: 'agentpanel-new-conversation', story: `${C}agentpanel-展示--new-conversation`, header: AGENT_PANEL_HEADER, waitFor: `${AGENT_PANEL_HEADER} + div svg[role="img"]`, role: 'element', centered: true, src: `${DS}stories-helpers/scene/agent-demo.tsx#DemoConversation`, label: 'AgentPanel 新對話空白頁 → 空狀態(在包層的內距框裡置中;頂 = 包層上內距)' },
]

/** 盤點到但不在 CASES 的(報告與檔頭的同一份理由;改動時兩邊一起看)。 */
export const NOT_COVERED = [
  ['AgentDecisionCard 標題列無分隔線、body 上下無內距(agent-decision-card.spec.md「8. AgentDecisionCard(決策卡)」第二條,繼承 Popover surface 那一條)', '量法與本閘不同:標題列的分隔線被元件規格拿掉 → 這一段只由標頭的下內距給、body 頂部歸零,要從「標頭內容的底」(標頭裡最低的那個內容的外框底)量到第一張選項卡頂 = tight(layoutSpace.spec.md 規則 2「適用範圍與量法三點」(2)【AI 推導 2026-11-13】);本閘量的是標頭外框底 → 內容(這裡恆 0)。由 agent-decision-card-validation-invariant.mjs 的 G 系列守'],
  ['Coachmark 標頭 → 媒體區 0', '結構分區:媒體區與標頭 / body / footer 並列、貼齊外殼,不是 body 裡的內容,不套規則 2 的表(同上 (1);coachmark.spec.md「Media 區規則」位置那一條)。由 overlay-story-contract-invariant.mjs R17(上緣)/ R18(左右)守'],
  ['DataTable 巢狀篩選面板 標題列 → 第一個灰底群組', '群組在面板這一層是 element(data-table.spec.md「巢狀群組的間距」),頂距與平鋪模式同一行程式給(本檔 datatable-filter-panel 那一格已守);巢狀那則的頂距與群組框內的固定 8 由 data-table-filter-group-spacing-invariant.mjs 守'],
  ['FileViewer 工具列 → Viewport(檢視區)', '結構分區(Viewport 貼齊外殼、圖置中),不是標頭底下的內容,不套規則 2 的表(layoutSpace.spec.md 規則 2「適用範圍與量法三點」(1))'],
  ['Alert placement="fixed"', 'alert.spec.md:154「頂部全域警告,無圓角無邊框,橫跨頁面寬度」= 頁首橫條,不是內容'],
  ['Sidebar 標頭 → nav', 'unbounded = 0 成立(SidebarContent 頂 = 標頭底),但清單的 py 在 SidebarGroup 包層(p-2)上、不在清單元素上,DOM 判法分不出;Sidebar 規格自管'],
]

/**
 * 純函式:第一個(或姊妹閘的最後一個)內容的特徵 → 角色。f = { dataTable, border(邊數), ownBg, shadow, role, tag, fieldControl, control, selfPad, fillsWidth }。
 * control = 按鈕 / 連結 / 勾選 / 進度條這類控件(規則 2 表「element(input / button / alert)」、規則 4 表「element(欄位 / 文字 / 按鈕)」):
 * 有框有底色也是 element,不是 bounded region(2026-11-11 姊妹閘量「最後一個東西」時加 —— 最後一個常是按鈕 / 進度條)。
 * fillsWidth = 外框有沒有撐滿容器內容寬(頁面端 pageKit.fillsWidth 量的布林值;2026-11-13 加):有框但沒撐滿 → element
 * (layoutSpace.spec.md「元件角色」那張表:region「寬度撐滿」對 element「寬高自然」—— 有沒有底色是先判成 region 之後才問的第二題(同檔「心智模型」Step 1);
 * 例:寬最多 85% 的我方訊息氣泡。這是「占不占該層主要空間」的近似【AI 推導 2026-11-13】,兩個方向會判錯的形狀見檔頭量法)。有框卻沒有這個量值 → null(判不出角色,
 * judge 當儀器失效;不准默默當成撐滿)。DataTable 外殼不看這一項(表格外殼就是 bounded)。
 */
export function classifyFirst(f) {
  if (f.dataTable) return 'bounded'
  const framed = f.border >= 3 || f.ownBg || f.shadow
  if (framed && !f.fieldControl && !f.control && !/^(alert|status)$/.test(f.role ?? '')) {
    if (typeof f.fillsWidth !== 'boolean') return null
    return f.fillsWidth ? 'bounded' : 'element'
  }
  const listy = /^(list|listbox|menu|tree|navigation)$/.test(f.role ?? '') || /^(ul|ol|nav)$/.test(f.tag)
  if (!framed && listy && f.selfPad) return 'unbounded'
  return 'element'
}

export const expectedGap = (role, { loose, tight }) => (role === 'bounded' ? loose : role === 'unbounded' ? 0 : tight)
const RULE = { bounded: 'bounded region → loose', unbounded: 'unbounded region → 0', element: 'element → tight' }

/**
 * 純函式:[{ id, density, declared, role, gap, loose, tight, first, scrolled, scroller }] → 不符合的訊息清單(呼叫端與 selftest 共用)。
 * scrolled = 量的當下第一個內容所在各層捲動區的捲動位置(捲回頂端後讀回;必須是 0);scroller = 那個捲動區在訊息裡的稱呼(CASES)。
 * 置中的格(centered: true)另帶 above / below(內距框內第一個內容上方、最後一個內容下方的空白);gap = 容器的結構上內距。
 */
export function judge(rows) {
  const failures = []
  for (const r of rows) {
    const where = `${r.id} @${r.density}`
    if (r.err) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} ${r.err}`); continue }
    if (!(r.loose > 0) || !(r.tight > 0)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到 --layout-space-loose / tight`); continue }
    if (!Number.isFinite(r.gap) || !r.role) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 沒量到標頭 → 第一個內容${Number.isFinite(r.gap) ? `(第一個內容 ${r.first ?? '?'} 有框,卻沒量到它撐不撐滿寬 —— 判不出角色)` : ''}`); continue }
    if (r.centered && !(Number.isFinite(r.above) && Number.isFinite(r.below))) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 置中的格沒量到內距框內上 / 下的空白(上 ${r.above} / 下 ${r.below})`); continue }
    // 捲動位置(2026-11-13):頂距只在第一個內容所在的每一層捲動區都捲在最上面時才量得到(檔頭量法)。沒讀到 / 不是 0 → 儀器失效,這一格不再往下判 ——
    // 被捲走時量到的距離(審查實測 −53 / −73)不是產品的頂距,不拿去指控產品,也不讀成通過
    if (!Number.isFinite(r.scrolled)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 沒讀到第一個內容所在捲動區的捲動位置(量的時候有沒有捲在最上面不知道)`); continue }
    if (r.scrolled > TOL) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} ${r.scroller ?? '第一個內容所在的捲動區'}沒有捲在最上面(量的當下捲動位置 ${r.scrolled}px,這時量到的「標頭底 → 第一個內容頂」${r.gap}px 不能用)—— 頂距要捲到頂端才量得到;這是量測沒對好,不是產品的問題`); continue }
    if (r.role !== r.declared) failures.push(`${where} 第一個內容的角色 = ${r.role}(${r.first ?? '?'}),盤點登記的是 ${r.declared} —— 第一個東西換了,照規則 2 重推頂距並更新 CASES`)
    const want = expectedGap(r.role, r)
    if (r.centered) {
      // 置中的格:量的是容器的結構上內距(置中多出來的空白不算);內容不在內距框裡置中 = 不是這個量法管的格
      if (Math.abs(r.gap - want) > TOL) failures.push(`${where} 置中的內容:容器的上內距 = ${r.gap}px,應 ${want}(規則 2:${RULE[r.role]};內容在撐滿的容器裡置中時,規則值寫成容器的上內距 —— layoutSpace.spec.md 規則 2「適用範圍與量法三點」(3);第一個內容 = ${r.first ?? '?'})`)
      if (Math.abs(r.above - r.below) > TOL) failures.push(`${where} 登記為置中,但內容不在內距框裡置中:上方空白 ${r.above}px、下方空白 ${r.below}px(差 > ${TOL})—— 內容換了排法,照規則 2 重推頂距並更新 CASES(拿掉 centered)`)
    } else if (Math.abs(r.gap - want) > TOL) failures.push(`${where} 標頭底 → 第一個內容頂 = ${r.gap}px,應 ${want}(規則 2:${RULE[r.role]};第一個內容 = ${r.first ?? '?'})`)
    // 主區只有一張表、不放區段標題的頁(app-shell.spec.md「Main 內塞什麼」):表格的讀屏名稱是那個標題唯一剩下的地方 —— 拿掉不能沒人知道
    if (r.tableName && !(r.tableNameGot ?? []).includes(r.tableName)) failures.push(`${where} 主區表格的讀屏名稱(aria-label)= ${JSON.stringify(r.tableNameGot ?? [])},應含「${r.tableName}」—— 主區不放區段標題後,表格的名字只剩 aria-label`)
  }
  // 密度有沒有套上看頁面根(#storybook-root):部分浮層刻意鎖 md(M3、density.spec.md),浮層裡兩密度同值是正確的,期望值照它自己讀到的 token 算
  for (const id of new Set(rows.map((r) => r.id))) {
    const looses = rows.filter((r) => r.id === id && (r.rootLoose ?? r.loose) > 0).map((r) => r.rootLoose ?? r.loose)
    if (looses.length === DENSITIES.length && new Set(looses).size === 1) failures.push(`${INSTRUMENT_FAIL_MARKER}:${id} 兩種密度在頁面根讀到同一個 loose(${looses[0]})—— 密度沒套上`)
  }
  return failures
}

function selftest() {
  let ok = true
  const expect = (cond, msg) => { if (!cond) { console.error(`✗ selftest:${msg}`); ok = false } }
  const T = { md: { loose: 16, tight: 12 }, lg: { loose: 24, tight: 16 } }
  const row = (id, declared, role, density, gap) => ({ id, density, declared, role, gap, ...T[density], first: 'x', scrolled: 0 })
  // 置中的格:量測另帶內距框內上 / 下的空白(修後 = 兩邊相等)
  const centeredRow = (id, density, gap, above = 296.5, below = above) => ({ ...row(id, 'element', 'element', density, gap), centered: true, above, below })
  const good = CASES.flatMap((c) => DENSITIES.map((d) => (c.centered ? centeredRow(c.id, d, expectedGap(c.role, T[d])) : row(c.id, c.role, c.role, d, expectedGap(c.role, T[d])))))
  expect(judge(good).length === 0, `修後形狀應綠,實得 ${JSON.stringify(judge(good))}`)
  expect(new Set(CASES.map((c) => c.id)).size === CASES.length, 'CASES id 不得重複')
  // 「透明」的判定表(2026-11-14):透明度 0 的各種寫法都算透明;結尾剛好是 0 的不透明色、滑過時的淡底色(透明度 0.02)不算
  const { transparent } = pageKit()
  const CLEAR = ['', 'transparent', 'rgba(0, 0, 0, 0)', 'oklch(0 0 0 / 0)', 'color(srgb 0 0 0 / 0)', 'rgb(0 0 0 / 0%)']
  const SOLID = ['rgb(255, 255, 0)', 'rgba(0, 0, 0, 0.02)', 'oklch(0 0 0 / 0.02)', 'color(srgb 0 0 0 / 0.5)', 'oklch(0.5 0.1 0)']
  expect(CLEAR.every((c) => transparent(c)), `透明度 0 的寫法應全判透明,沒判到:${JSON.stringify(CLEAR.filter((c) => !transparent(c)))}`)
  expect(!SOLID.some((c) => transparent(c)), `看得見的顏色不得判成透明,誤判:${JSON.stringify(SOLID.filter((c) => transparent(c)))}`)
  // AgentPanel 對話區(2026-11-13):修前建置實測頂距是 loose(md 16 / lg 24)—— 兩格 × 兩密度都必紅,訊息指名 element → tight
  const CONVERSATION = ['agentpanel-chat-user-first', 'agentpanel-chat-agent-first']
  expect(CONVERSATION.every((id) => CASES.find((c) => c.id === id)?.role === 'element'), `對話區 ${CONVERSATION.join(' / ')} 應登記 element`)
  const topLoose = judge(CONVERSATION.flatMap((id) => [row(id, 'element', 'element', 'md', 16), row(id, 'element', 'element', 'lg', 24)]))
  expect(topLoose.length === 4 && topLoose.every((s) => s.includes('element → tight')), `對話區頂距打回 loose 應 2 格 × 2 密度都紅,實得 ${JSON.stringify(topLoose)}`)
  // 對話沒捲在最上面(2026-11-13 審查實測:視窗高 600 時進頁自動捲到底,scrollTop 65 / 89、量到 −53 / −73)→ 儀器失效、點名「對話沒有捲在最上面」,
  // 而且不得有任何一行拿 −53 / −73 指控產品;同一格捲回頂端(讀回 0、12 / 16)→ 綠;沒讀到捲動位置 → 儀器失效(不准默默當成 0)
  expect(CONVERSATION.every((id) => CASES.find((c) => c.id === id)?.scroller === '對話') && CASES.filter((c) => c.scroller).length === CONVERSATION.length, `登記 scroller 的應只有對話區 ${CONVERSATION.join(' / ')}(--selftest (c) 拿它們造溢出)`)
  const stuckAtBottom = judge([{ ...row('agentpanel-chat-user-first', 'element', 'element', 'md', -53), scrolled: 65, scroller: '對話' }, { ...row('agentpanel-chat-user-first', 'element', 'element', 'lg', -73), scrolled: 89, scroller: '對話' }])
  expect(stuckAtBottom.length === 2 && stuckAtBottom.every((s) => s.includes(INSTRUMENT_FAIL_MARKER) && s.includes('對話沒有捲在最上面')), `對話沒捲在最上面應兩密度都判儀器失效、不指控產品,實得 ${JSON.stringify(stuckAtBottom)}`)
  expect(judge([{ ...row('agentpanel-chat-user-first', 'element', 'element', 'md', 12), scroller: '對話' }, { ...row('agentpanel-chat-user-first', 'element', 'element', 'lg', 16), scroller: '對話' }]).length === 0, '對話捲回頂端(讀回 0)、12 / 16 應綠')
  const otherScroller = judge([{ ...row('popover-list-region', 'unbounded', 'unbounded', 'md', -40), scrolled: 40 }])
  expect(otherScroller.length === 1 && otherScroller[0].includes(INSTRUMENT_FAIL_MARKER) && otherScroller[0].includes('第一個內容所在的捲動區沒有捲在最上面'), `沒登記 scroller 的格被捲動也應判儀器失效,實得 ${JSON.stringify(otherScroller)}`)
  const noScrollRead = judge([{ ...row('agentpanel-chat-user-first', 'element', 'element', 'md', 12), scrolled: undefined }])
  expect(noScrollRead.length === 1 && noScrollRead[0].includes(INSTRUMENT_FAIL_MARKER) && noScrollRead[0].includes('沒讀到'), `沒讀到捲動位置應判儀器失效,實得 ${JSON.stringify(noScrollRead)}`)
  // 氣泡被判成 bounded(2026-11-13 前的角色判法:有底色就是 bounded)—— 登記是 element,必紅(即使 16 / 24 照 bounded 算是對的)
  const bubbleBounded = judge([row('agentpanel-chat-user-first', 'element', 'bounded', 'md', 16), row('agentpanel-chat-user-first', 'element', 'bounded', 'lg', 24)])
  expect(bubbleBounded.length === 2 && bubbleBounded.every((s) => s.includes('盤點登記的是 element')), `氣泡被判成 bounded 應兩密度都紅,實得 ${JSON.stringify(bubbleBounded)}`)
  // 新對話空白頁(置中的格):修前包層沒有上內距(實測 0)必紅;內距對但不置中(內容貼頂)必紅;置中的量值缺 → 儀器失效;登記必須是 centered
  const EMPTY = 'agentpanel-new-conversation'
  expect(CASES.find((c) => c.id === EMPTY)?.centered === true && CASES.filter((c) => c.centered).length === 1, `置中的格目前只有 ${EMPTY} 一處(新增置中的格要在這裡補對照)`)
  const noPad = judge([centeredRow(EMPTY, 'md', 0, 326.5), centeredRow(EMPTY, 'lg', 0, 316.5)])
  expect(noPad.length === 2 && noPad.every((s) => s.includes('容器的上內距 = 0px') && s.includes('element → tight')), `空白頁包層沒有上內距應兩密度都紅,實得 ${JSON.stringify(noPad)}`)
  const notCentered = judge([centeredRow(EMPTY, 'md', 12, 0, 593)])
  expect(notCentered.length === 1 && notCentered[0].includes('不在內距框裡置中') && !notCentered[0].includes(INSTRUMENT_FAIL_MARKER), `登記置中但內容貼頂應紅(不是儀器失效),實得 ${JSON.stringify(notCentered)}`)
  expect(judge([centeredRow(EMPTY, 'md', 12, NaN, 296.5)]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER) && s.includes('置中')), '置中的格上方空白沒量到應判儀器失效')
  expect(judge([{ ...row(EMPTY, 'element', 'element', 'md', 12), centered: true }]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '置中的格缺 above / below 應判儀器失效(不准默默當成一般格)')
  // 有框卻沒量到撐不撐滿寬 → classifyFirst 回 null → 判不出角色 = 儀器失效
  expect(judge([row('x', 'element', null, 'md', 12)]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER) && s.includes('判不出角色')), '角色判不出來應判儀器失效')
  // 主區表格的讀屏名稱(2026-11-11 r3 審查:拿掉區段標題後,AppShell Insights / 範本兩張表的 aria-label 被拿掉不會有任何紅燈)
  const named = CASES.filter((c) => c.tableName)
  expect(named.length === 4 && ['appshell-insights', 'template-dashboard', 'sidebar-dashboard-table', 'sidebar-project-table'].every((id) => named.some((c) => c.id === id)), `登記 tableName 的應是主區只有一張表的 4 處,實得 ${named.map((c) => c.id).join(', ')}`)
  const nameRow = (got) => ({ ...row('appshell-insights', 'bounded', 'bounded', 'md', 16), tableName: 'Sprint 42 還沒完成的議題', tableNameGot: got })
  expect(judge([nameRow(['Sprint 42 還沒完成的議題'])]).length === 0, '表格讀屏名稱對 → 綠')
  expect(judge([nameRow([])]).some((s) => s.includes('讀屏名稱') && !s.includes(INSTRUMENT_FAIL_MARKER)), '表格拿掉 aria-label → 紅(產品缺名字,不是儀器失效)')
  expect(judge([nameRow(['Sprint 42'])]).some((s) => s.includes('應含「Sprint 42 還沒完成的議題」')), '表格名字換成別的 → 紅')
  // c2fc683d 實測:Sidebar 混合內容兩處表格外層是 tight(12 / 16)
  const before = judge(['sidebar-mixed-folder', 'sidebar-mixed-file'].flatMap((id) => [row(id, 'bounded', 'bounded', 'md', 12), row(id, 'bounded', 'bounded', 'lg', 16)]))
  expect(before.length === 4 && before.every((s) => s.includes('bounded region → loose')), `表格外層改 tight 應 4 格都紅,實得 ${JSON.stringify(before)}`)
  // 標題在前卻用 loose(第一個是標題列 / 文字的那幾處若改成 loose)
  const titleLoose = judge([row('appshell-issue-detail', 'element', 'element', 'md', 16), row('appshell-issue-detail', 'element', 'element', 'lg', 24)])
  expect(titleLoose.length === 2 && titleLoose.every((s) => s.includes('element → tight')), `標題在前卻用 loose 應兩密度都紅,實得 ${JSON.stringify(titleLoose)}`)
  // 主區只有一張表格卻又放回區段標題(修前 411fcc49 建置實測的形狀:第一個 = h2 = element、頂距 tight 12 / 16)—— 登記是 bounded,必紅
  const SINGLE_TABLE = ['sidebar-dashboard-table', 'sidebar-project-table', 'appshell-insights', 'template-dashboard']
  expect(SINGLE_TABLE.every((id) => CASES.find((c) => c.id === id)?.role === 'bounded'), `主區只有一張表格的 ${SINGLE_TABLE.join(' / ')} 應登記 bounded`)
  const titleBack = judge(SINGLE_TABLE.flatMap((id) => [row(id, 'bounded', 'element', 'md', 12), row(id, 'bounded', 'element', 'lg', 16)]))
  expect(SINGLE_TABLE.every((id) => ['md', 'lg'].every((d) => titleBack.some((s) => s.startsWith(`${id} @${d}`) && s.includes('盤點登記的是 bounded')))), `主區放回區段標題應 4 處 × 2 密度都紅,實得 ${JSON.stringify(titleBack)}`)
  expect(judge([row('x', 'unbounded', 'unbounded', 'md', 12), row('x', 'unbounded', 'unbounded', 'lg', 0)]).some((s) => s.includes('unbounded region → 0') && s.includes('@md')), '清單沒貼標頭(多了 tight)應紅')
  expect(judge([row('x', 'bounded', 'element', 'md', 12), row('x', 'bounded', 'element', 'lg', 16)]).some((s) => s.includes('盤點登記的是 bounded')), '角色與盤點不符應紅(即使頂距照新角色算是對的)')
  expect(judge([{ id: 'x', density: 'md', declared: 'bounded', err: '找不到標頭' }]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '沒量到應判儀器失效')
  expect(judge([row('x', 'element', 'element', 'md', NaN)]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '距離 NaN 應判儀器失效')
  expect(judge([row('x', 'element', 'element', 'md', 12), { ...row('x', 'element', 'element', 'lg', 12), loose: 16, tight: 12 }]).some((s) => s.includes('密度沒套上')), '兩密度同 loose 應判儀器失效')
  // 浮層鎖 md:頁面根兩密度不同、浮層裡同值 → 不是儀器失效,期望照浮層讀到的值
  const locked = [{ ...row('p', 'element', 'element', 'md', 12), rootLoose: 16 }, { ...row('p', 'element', 'element', 'lg', 12), loose: 16, tight: 12, rootLoose: 24 }]
  expect(judge(locked).length === 0, `浮層鎖 md 應綠,實得 ${JSON.stringify(judge(locked))}`)
  expect(judge([{ ...locked[0] }, { ...locked[1], rootLoose: 16 }]).some((s) => s.includes('密度沒套上')), '頁面根兩密度同值應判儀器失效')
  // classifyFirst 逐列
  const base = { dataTable: false, border: 0, ownBg: false, shadow: false, role: null, tag: 'div', fieldControl: false, control: false, selfPad: false, fillsWidth: true }
  const cls = [
    // 2026-11-13:有框但沒撐滿容器內容寬 → element;撐滿 → bounded(不變);有框卻沒有這個量值 → null(儀器失效,不准默默當成撐滿)
    [{ ...base, ownBg: true, fillsWidth: false }, 'element', '有底色、沒撐滿寬的我方訊息氣泡'],
    [{ ...base, border: 4, ownBg: true, shadow: true, fillsWidth: false }, 'element', '有框有底色有陰影、但沒撐滿寬的卡'],
    [{ ...base, ownBg: true, fillsWidth: true }, 'bounded', '有底色、撐滿寬的面板(不變)'],
    [{ ...base, ownBg: true, fillsWidth: undefined }, null, '有底色、卻沒量到撐不撐滿寬(判不出角色)'],
    [{ ...base, dataTable: true, fillsWidth: false }, 'bounded', 'DataTable 外殼不看撐不撐滿寬'],
    [{ ...base, tag: 'button', border: 4, ownBg: true, control: true, fillsWidth: false }, 'element', '有框有底色、沒撐滿寬的按鈕(控件那一條先成立)'],
    [{ ...base, tag: 'p', fillsWidth: false }, 'element', '沒框的文字不看撐不撐滿寬'],
    [{ ...base, role: 'listbox', selfPad: true, fillsWidth: false }, 'unbounded', '自帶 py 的無框清單不看撐不撐滿寬'],
    [{ ...base, tag: 'button', border: 4, ownBg: true, control: true }, 'element', '有框有底色的按鈕(規則 4 表「element(欄位 / 文字 / 按鈕)」)'],
    [{ ...base, role: 'progressbar', ownBg: true, control: true }, 'element', '進度條(有底色的細條)'],
    [{ ...base, role: 'img', ownBg: true, control: true }, 'element', '有底色的頭像 / 縮圖(role=img)'],
    [{ ...base, dataTable: true, border: 4, ownBg: true }, 'bounded', 'DataTable 外殼'],
    [{ ...base, dataTable: true }, 'bounded', 'DataTable 外殼(bordered=false 也是表格外殼)'],
    [{ ...base, border: 4, ownBg: true }, 'bounded', '有框有底色的卡'],
    [{ ...base, ownBg: true }, 'bounded', '只有底色的面板'],
    [{ ...base, border: 1 }, 'element', '只有一條底線(不是框)'],
    [{ ...base, border: 4, fieldControl: true }, 'element', '單一欄位控件(輸入框外框)'],
    [{ ...base, border: 4, ownBg: true, role: 'alert' }, 'element', 'Alert(規則 2 表明列 element)'],
    [{ ...base, role: 'listbox', selfPad: true }, 'unbounded', '自帶 py 的無框清單'],
    [{ ...base, tag: 'nav', selfPad: true }, 'unbounded', '自帶 py 的 nav'],
    [{ ...base, tag: 'ul' }, 'element', '沒自帶 py 的純文字清單(活動紀錄那種)'],
    [{ ...base, role: 'listbox', border: 4, selfPad: true }, 'bounded', '有框的清單 = bounded'],
    [{ ...base, role: 'radiogroup' }, 'element', '選項群組'],
    [{ ...base, tag: 'h2' }, 'element', '區段標題'],
    [{ ...base, tag: 'p' }, 'element', '一段文字'],
  ]
  for (const [f, want, what] of cls) expect(classifyFirst(f) === want, `classifyFirst(${what})應 ${want},實得 ${classifyFirst(f)}`)
  console.log(ok ? '✅ header-first-gap selftest PASS' : '❌ header-first-gap selftest FAIL')
  return ok
}

/**
 * 頁面端共用量具:看得見嗎 / 特徵 / 算不算一個「東西」/ 頂邊 / 找標頭 / 找標頭之後那塊 / 收集那塊裡看得見的東西。
 * 原閘與姊妹閘 header-content-sides-invariant.mjs 都用 installPageKit 裝進同一頁,判法只有這一個住所(M17)。
 * 函式本身被 toString 送進頁面,不得引用外層變數。
 */
export const pageKit = () => {
  const vis = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false
    return !(cs.position === 'absolute' && cs.clip && cs.clip !== 'auto')
  }
  // 透明度是 0 就算透明:瀏覽器對不同色彩空間回的寫法不同(rgba(0, 0, 0, 0) / oklch(0 0 0 / 0) / color(srgb 0 0 0 / 0));
  // 只認前一種的話,看不見的外框會被當成看得見、拿去指控產品(2026-11-14 驗證實跑抓到;selftest 有判定表)
  const transparent = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c) || /\/\s*0(\.0+)?%?\s*\)$/.test(c)
  const effBg = (el) => { for (let n = el; n; n = n.parentElement) { const b = getComputedStyle(n).backgroundColor; if (!transparent(b)) return b } return 'rgb(255, 255, 255)' }
  const LIST_ROLE = /^(list|listbox|menu|tree|navigation)$/
  const feat = (el) => {
    const cs = getComputedStyle(el)
    const border = ['Top', 'Right', 'Bottom', 'Left'].filter((s) => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none' && !transparent(cs[`border${s}Color`])).length
    const ownBg = !transparent(cs.backgroundColor) && cs.backgroundColor !== effBg(el.parentElement)
    const shadow = cs.boxShadow !== 'none'
    const role = el.getAttribute('role')
    const tag = el.tagName.toLowerCase()
    const framed = border >= 3 || ownBg || shadow
    // 單一欄位控件 = 輸入元素本身,或「有框、裝著一個輸入元素、高 ≤ 64」的外框(Input / Select 的殼);沒框的包層(工具列、表單列)不算
    const fieldControl = /^(input|textarea|select)$/.test(tag) || (framed && el.querySelectorAll('input:not([type=hidden]), textarea, select, [contenteditable="true"]').length === 1 && el.getBoundingClientRect().height <= 64)
    const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    // 自帶 py:清單第一個項目不貼清單頂(項目 = option / menuitem / treeitem / li / 連結)
    const firstItem = (LIST_ROLE.test(role ?? '') || /^(ul|ol|nav)$/.test(tag)) ? [...el.querySelectorAll('[role=option], [role^=menuitem], [role=treeitem], [role=listitem], li, a')].find(vis) : null
    const selfPad = !!firstItem && firstItem.getBoundingClientRect().top - el.getBoundingClientRect().top > 0.5
    // 控件 / 縮圖:按鈕 / 連結 / 勾選 / 進度條 / 頭像縮圖這類(規則 2 / 4 表的 element),有框有底色也不是 bounded region
    const control = /^(button|a|img)$/.test(tag) || /^(button|link|checkbox|radio|switch|tab|combobox|slider|progressbar|meter|spinbutton|separator|img)$/.test(role ?? '')
    return { dataTable: el.hasAttribute('data-data-table-outer'), border, ownBg, shadow, framed, role, tag, fieldControl, control, text, selfPad }
  }
  // 沒框的按鈕 / 連結不算一個「東西」(它的外框看不見,可能還用負邊距撐出列外),往裡找看得見的圖示或字
  const isThing = (f) => f.dataTable || f.framed || f.border >= 1 || f.text || f.fieldControl
    || /^(img|svg|canvas|video|iframe|hr|ul|ol|dl|table|nav|p|h1|h2|h3|h4|h5|h6|label)$/.test(f.tag)
    || /^(list|listbox|menu|menubar|tree|treegrid|table|grid|navigation|separator|radiogroup|group|alert|status|img)$/.test(f.role ?? '')
  // 有框 / 清單 / 控件 / 圖量外框;只有字的包層量內容框(包層的內距是間距不是內容)
  const boxedOf = (f) => f.dataTable || f.framed || f.border >= 1 || f.fieldControl || /^(ul|ol|nav|img|svg|canvas|video|iframe|hr)$/.test(f.tag) || /^(list|listbox|menu|tree|navigation|table|grid|treegrid|img)$/.test(f.role ?? '')
  const topOf = (el, f) => {
    const r = el.getBoundingClientRect()
    if (boxedOf(f)) return r.top
    const cs = getComputedStyle(el)
    return r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop)
  }
  // 底邊(topOf 的對邊,同一個判法):有框 / 清單 / 控件 / 圖量外框;只有字的包層量內容框
  const bottomOf = (el, f) => {
    const r = el.getBoundingClientRect()
    if (boxedOf(f)) return r.bottom
    const cs = getComputedStyle(el)
    return r.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom)
  }
  // 捲動位置(2026-11-13):量「標頭底 → 第一個內容頂」的前提是標頭之後那塊裡的捲動容器都捲在最上面(對話區一進頁會自動捲到底)。
  //   scrollBody(body, 'top'):body 與它裡面每一層捲動過的容器立即捲回頂端(不走平滑捲動),回「捲之前」最大的捲動位置;
  //     'end' 只給 --selftest 對照組:把每一層捲得動的容器捲到底 = 重現「進頁自動捲到底」,而且不靠產品這一刻有沒有自動捲。
  //   scrollOffset(el, body):el 往上到 body(含)每一層「現在」的捲動位置取最大(top)、內容比該層高出多少取最大(overflow)—— 捲完讀回用。
  //     el 自己不算:它自己捲動只移動它的子孫,不移動它的頂邊。
  const scrollBody = (body, to = 'top') => {
    let was = 0
    for (const n of [body, ...body.querySelectorAll('*')]) {
      if (to === 'end' ? n.scrollHeight - n.clientHeight < 1 : n.scrollTop === 0) continue
      was = Math.max(was, Math.abs(n.scrollTop))
      n.scrollTo({ top: to === 'end' ? n.scrollHeight : 0, behavior: 'instant' })
    }
    return was
  }
  const scrollOffset = (el, body) => {
    let top = 0, overflow = 0
    for (let n = el; n && n !== body;) {
      n = n.parentElement
      if (!n) break
      top = Math.max(top, Math.abs(n.scrollTop))
      overflow = Math.max(overflow, n.scrollHeight - n.clientHeight)
    }
    return { top, overflow }
  }
  const findHeader =(header, headerText, nth) => [...document.querySelectorAll(header)].filter((el) => vis(el) && (!headerText || el.textContent.includes(headerText)))[nth]
  // 標頭之後那塊 = 同層下一個看得見的兄弟,沒有就往上找(最多三層)
  const findBody = (h) => {
    let node = h, body = null
    for (let up = 0; up < 3 && node && !body; up++) {
      let s = node.nextElementSibling
      while (s && !vis(s)) s = s.nextElementSibling
      body = s
      node = node.parentElement
    }
    return body
  }
  // 那塊裡所有「看得見的東西」(遇到東西就停、不往裡找);skipSelf = 只看 root 的子孫(姊妹閘往無框清單裡找列內容時用)
  const collectThings = (root, { skipSelf = false } = {}) => {
    const things = []
    const visit = (el) => {
      if (!(el instanceof Element)) return
      const cs = getComputedStyle(el)
      if (cs.display === 'contents') { [...el.children].forEach(visit); return }
      if (!vis(el)) return
      if ((cs.position === 'absolute' || cs.position === 'fixed') && el !== root) return // 裝飾 / 捲軸 / 浮出的提示,不是內容流
      const f = feat(el)
      if (isThing(f) && !(skipSelf && el === root)) { things.push({ el, f, top: topOf(el, f) }); return }
      ;[...el.children].forEach(visit)
    }
    visit(root)
    return things
  }
  // 結構內距(某一邊):從 el 往上到 body(含 body 自己的內距與框線),每一層的 padding + border + margin 加總;el 自己只算 margin
  // (它的框線 / 內距是它自己的)。auto 外距不算(置中的版心寬不是內距;computed 會回算出來的 px,要看 computedStyleMap)。
  // 姊妹閘量左右 / 底、本閘量「撐不撐滿寬」與置中格的頂,都是這一個量法。
  const cssNum = (el, p) => parseFloat(getComputedStyle(el)[p]) || 0
  const sideCap = (s) => s[0].toUpperCase() + s.slice(1)
  const marginOf = (el, side) => { let auto = false; try { auto = String(el.computedStyleMap().get(`margin-${side}`)) === 'auto' } catch { auto = false } return auto ? 0 : cssNum(el, `margin${sideCap(side)}`) }
  const structuralInset = (el, body, side) => {
    let sum = cssNum(body, `padding${sideCap(side)}`) + cssNum(body, `border${sideCap(side)}Width`)
    for (let n = el; n && n !== body; n = n.parentElement) {
      if (getComputedStyle(n).display === 'contents') continue
      sum += marginOf(n, side) + (n === el ? 0 : cssNum(n, `padding${sideCap(side)}`) + cssNum(n, `border${sideCap(side)}Width`))
    }
    return sum
  }
  // 外框撐滿容器內容寬嗎:左右兩邊「不是內距 / 框線 / 外距給的空白」加起來 ≤ 1px = 撐滿(classifyFirst 的 fillsWidth)。
  // 回 { fills, slack };body 自己就是那個東西 → 撐滿。
  const fillsWidth = (el, body) => {
    if (el === body) return { fills: true, slack: 0 }
    const r = el.getBoundingClientRect(), b = body.getBoundingClientRect()
    const slack = (r.left - b.left - structuralInset(el, body, 'left')) + (b.right - r.right - structuralInset(el, body, 'right'))
    return { fills: slack <= 1, slack: Math.round(slack * 10) / 10 }
  }
  return { vis, transparent, effBg, LIST_ROLE, feat, isThing, boxedOf, topOf, bottomOf, scrollBody, scrollOffset, findHeader, findBody, collectThings, structuralInset, fillsWidth }
}

/** 把 pageKit 裝進目前頁面(window.__layoutKit);每次換頁後、量之前呼叫。 */
export const installPageKit = (page) => page.evaluate(`window.__layoutKit = (${pageKit.toString()})()`)

/**
 * 頁面函式:找標頭 → 下一塊 → 頂邊最高的「看得見的東西」,回傳特徵與距離(角色由 Node 端 classifyFirst 判)。
 * scroll = 'top'(預設):先把那一塊裡捲動過的容器捲回頂端再找東西、量位置;'keep'(不捲)/ 'end'(捲到底)只給 --selftest 對照組。
 * 不論哪一種,量完都讀回第一個內容所在各層的捲動位置(scrolled;judge 要求是 0)。
 */
export const probeFirst = ({ header, headerText = null, nth = 0, scroll = 'top' }) => {
  const K = window.__layoutKit
  const h = K.findHeader(header, headerText, nth)
  if (!h) return { err: `找不到標頭 ${header}${headerText ? `(含「${headerText}」)` : ''}` }
  const body = K.findBody(h)
  if (!body) return { err: '標頭之後沒有內容' }
  const scrolledBefore = scroll === 'keep' ? null : K.scrollBody(body, scroll)
  const things = K.collectThings(body)
  if (!things.length) return { err: '標頭之後找不到看得見的內容' }
  const minTop = Math.min(...things.map((t) => t.top))
  const pick = things.find((t) => t.top - minTop < 0.5)
  const host = pick.el.parentElement ?? pick.el
  const v = (name) => parseFloat(getComputedStyle(host).getPropertyValue(name))
  const round = (x) => Math.round(x * 10) / 10
  const cls = (pick.el.getAttribute('class') ?? '').split(/\s+/).slice(0, 4).join(' ')
  const fill = K.fillsWidth(pick.el, body)
  const f = { ...pick.f, fillsWidth: fill.fills, widthSlack: fill.slack }
  // 置中的格用(CASES centered):容器的結構上 / 下內距,與內距框內第一個內容上方、最後一個內容下方的空白(置中 = 兩者相等)
  const num = (el, p) => parseFloat(getComputedStyle(el)[p]) || 0
  const bottomOf = (t) => K.bottomOf(t.el, t.f)
  const last = things.reduce((a, t) => (bottomOf(t) > bottomOf(a) + 0.5 ? t : a))
  const b = body.getBoundingClientRect()
  // 只有字的包層量的是內容框(topOf / bottomOf)→ 它自己的內距 / 框線也算在結構內距裡,兩邊才對得上
  const own = (t, side) => (K.boxedOf(t.f) ? 0 : num(t.el, `padding${side}`) + num(t.el, `border${side}Width`))
  const topInset = K.structuralInset(pick.el, body, 'top') + own(pick, 'Top'), bottomInset = K.structuralInset(last.el, body, 'bottom') + own(last, 'Bottom')
  // 捲完讀回:第一個內容往上到那一塊的每一層,量的當下捲在哪(scrolled)、內容比捲動區高出多少(scrollOverflow,只供列印與對照組的前提)
  const at = K.scrollOffset(pick.el, body)
  return {
    scrolled: round(at.top), scrollOverflow: round(at.overflow), scrolledBefore: scrolledBefore === null ? null : round(scrolledBefore),
    topInset: round(topInset), bottomInset: round(bottomInset),
    above: round(pick.top - (b.top + topInset)), below: round((b.bottom - bottomInset) - bottomOf(last)),
    gap: round(pick.top - h.getBoundingClientRect().bottom), f,
    loose: v('--layout-space-loose'), tight: v('--layout-space-tight'),
    rootLoose: parseFloat(getComputedStyle(document.querySelector('#storybook-root') ?? document.documentElement).getPropertyValue('--layout-space-loose')),
    first: `<${f.tag}${f.role ? ` role=${f.role}` : ''}${f.dataTable ? ' data-data-table-outer' : ''}${cls ? ` class="${cls}…"` : ''}>「${(pick.el.textContent ?? '').trim().slice(0, 16)}」`,
  }
}

const noRunningAnimation = () => document.getAnimations().every((a) => a.playState !== 'running')

/**
 * 開到盤點那一處的狀態(開 story → 依 steps 點 → 等 waitFor 本身出現 → 指標移開 → 動畫跑完);成功回 null、失敗回 { err }。
 * 姊妹閘 header-content-sides-invariant.mjs(左 / 右 / 底)共用同一份導航,兩支量的是同一個畫面。
 */
export async function openCase(page, origin, c, density) {
  const url = `${origin}/iframe.html?id=${encodeURIComponent(c.story)}&viewMode=story&globals=${encodeURIComponent(`theme:light;density:${density}`)}`
  await openStory(page, url, { waitFor: c.waitFor ?? c.header, label: c.story })
  for (const s of c.steps ?? []) {
    if (s.press) { // 鍵盤步驟(例:樹狀表格的列選到後按 ArrowRight 展開,WAI-ARIA Treegrid)
      await page.keyboard.press(s.press)
      try { await page.waitForSelector(s.waitFor, { state: 'visible', timeout: 10_000 }) } catch { return { err: `按 ${s.press} 之後等不到 ${s.waitFor}` } }
      continue
    }
    const target = s.clickSelector
      ? page.locator(s.clickSelector).first()
      : page.locator('#storybook-root [role="treegrid"] [role="row"], #storybook-root [role="tree"] [role="treeitem"], #storybook-root button').filter({ hasText: new RegExp(`^\\s*${s.click.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first()
    if (!(await target.count())) return { err: `找不到要點的「${s.click ?? s.clickSelector}」` }
    await target.click()
    try { await page.waitForSelector(s.waitFor, { state: 'visible', timeout: 10_000 }) } catch { return { err: `點「${s.click ?? s.clickSelector}」之後等不到 ${s.waitFor}` } }
  }
  await page.mouse.move(0, 0)
  try { await page.waitForFunction(noRunningAnimation, null, { timeout: 10_000 }) } catch { return { err: '10 秒內動畫沒跑完' } }
  return null
}

/** 已經開到那一處之後量一次(同一頁可以重複量;scroll 見 probeFirst —— 預設先捲回頂端,--selftest (c) 才傳 'end')。 */
async function probeCase(page, c, { scroll = 'top' } = {}) {
  await installPageKit(page)
  const r = await page.evaluate(probeFirst, { header: c.header, headerText: c.headerText ?? null, nth: c.nth ?? 0, scroll })
  if (r.err) return r
  // 主區不放區段標題的那幾處:表格的名字只剩 aria-label(看得見的標題拿掉了)—— 量畫面上那張表格的讀屏名稱本身,不靠 waitFor 猜
  const tableNameGot = c.tableName ? await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((t) => t.getAttribute('aria-label') ?? '').filter(Boolean), c.waitFor) : undefined
  // 置中的格:頂距 = 容器的結構上內距(置中多出來的空白不算);看得見的距離(標頭底 → 第一個內容頂)另存 visualGap 只供列印
  const top = c.centered ? { centered: true, gap: r.topInset, visualGap: r.gap } : {}
  return { ...r, ...top, role: classifyFirst(r.f), tableName: c.tableName, tableNameGot, scroller: c.scroller }
}

/** 開到盤點那一處再量(一格的完整量法;對照用的腳本可以換視窗高度後呼叫同一支)。 */
export async function measureCase(page, origin, c, density) {
  const opened = await openCase(page, origin, c, density)
  return opened ?? probeCase(page, c)
}

const freshSources = () => [...new Set(CASES.map(srcFile))].concat(['packages/design-system/src/tokens/layoutSpace/layoutSpace.css', 'packages/design-system/src/components/DataTable/data-table.tsx', 'packages/design-system/src/patterns/header-canonical/chrome-header.tsx'])

/** --selftest (c) 試的視窗高(本閘正式量用 900):由高到矮,第一個讓對話真的捲得動的就用。2026-11-13 實測:第一則是我方氣泡那則 ≤ 600 就溢出、第一則是代理文字那則要 ≤ 300。 */
const OVERFLOW_HEIGHTS = [300, 240, 200, 160]

/**
 * --selftest (c):對話溢出對照(真建置、真瀏覽器)。對 CASES 裡登記 scroller 的每一格 × 兩密度:視窗縮矮到對話內容真的比捲動區高,同一頁量兩次 ——
 *   不先捲(把對話捲到底 = 進頁自動捲到底的那個狀態)→ 必須判成儀器失效、點名「對話沒有捲在最上面」,而且沒有任何一行指控產品;
 *   先捲到頂(正式量法)→ 讀回捲動位置 0、距離 = tight、綠。
 * 前提自己量:捲到底之後讀回的捲動位置 > 0 才算造出溢出;試完每個高度都造不出 → 對照組不成立 → 回 false(不靠範例現在剛好多長)。
 * 輸出不印儀器失效的機讀標記(lib/gate-selftest-meta.mjs 看到標記就判這次自測儀器失效);真的開不起來才印。
 */
async function selftestOverflow() {
  if (!staticArg) requireFreshStorybookBuild(STATIC, freshSources())
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
  if (!browser) { await server.stop(); return true } // launchBrowserOrSkip 已印 SKIPPED-ENV / BROWSER-REQUIRED 判定並結束行程,不會走到這裡
  let ok = true
  const expect = (cond, msg) => { if (!cond) { console.error(`✗ selftest (c):${msg}`); ok = false } }
  const plain = (list) => JSON.stringify(list).replaceAll(INSTRUMENT_FAIL_MARKER, '儀器失效')
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    for (const c of CASES.filter((x) => x.scroller)) for (const density of DENSITIES) {
      const where = `${c.id} @${density}`
      let shown = false
      for (const height of OVERFLOW_HEIGHTS) {
        await page.setViewportSize({ width: 1280, height })
        const opened = await openCase(page, server.origin, c, density)
        if (opened) { expect(false, `${where} 視窗高 ${height} 開不起來:${opened.err}`); shown = true; break }
        const stuck = { id: c.id, density, declared: c.role, ...(await probeCase(page, c, { scroll: 'end' })) }
        if (stuck.err) { expect(false, `${where} 視窗高 ${height} 沒量到:${stuck.err}`); shown = true; break }
        if (!(stuck.scrolled > TOL)) continue // 這個高度對話還裝得下、捲不動 → 換更矮的
        const stuckFailures = judge([stuck])
        expect(stuckFailures.length > 0 && stuckFailures.every((s) => s.includes(INSTRUMENT_FAIL_MARKER)) && stuckFailures.some((s) => s.includes(`${c.scroller}沒有捲在最上面`)),
          `${where} 視窗高 ${height}、${c.scroller}停在捲動位置 ${stuck.scrolled}(量到 ${stuck.gap}px)應只判成儀器失效「${c.scroller}沒有捲在最上面」、不指控產品,實得 ${plain(stuckFailures)}`)
        const atTop = { id: c.id, density, declared: c.role, ...(await probeCase(page, c)) }
        const topFailures = judge([atTop])
        expect(atTop.scrolled === 0 && Math.abs(atTop.gap - atTop.tight) <= TOL && topFailures.length === 0,
          `${where} 視窗高 ${height}、先捲到頂應讀回 0、距離 = tight ${atTop.tight}、綠,實得 讀回 ${atTop.scrolled}、距離 ${atTop.gap}、${plain(topFailures)}`)
        console.log(`  (c) ${where}  視窗高 ${height}:${c.scroller}內容比捲動區高 ${stuck.scrollOverflow}px(進頁時捲動位置 ${stuck.scrolledBefore})`
          + `\n        不先捲(停在捲動位置 ${stuck.scrolled}):量到 ${stuck.gap}px → 判成儀器失效「${c.scroller}沒有捲在最上面」${stuckFailures.every((s) => s.includes(INSTRUMENT_FAIL_MARKER)) ? '、沒有指控產品' : '(另有指控產品的訊息 ✗)'}`
          + `\n        先捲到頂(從 ${atTop.scrolledBefore} 捲回、讀回 ${atTop.scrolled}):量到 ${atTop.gap}px(tight ${atTop.tight})→ ${topFailures.length ? '紅 ✗' : '綠'}`)
        shown = true
        break
      }
      expect(shown, `${where} 視窗高 ${OVERFLOW_HEIGHTS.join(' / ')} 都造不出溢出(${c.scroller}捲不動)—— 對照組不成立,這次自測沒有證明任何事`)
    }
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}`)
    ok = false
  } finally { await browser.close(); await server.stop() }
  console.log(ok ? '✅ header-first-gap selftest (c) 對話溢出對照 PASS' : '❌ header-first-gap selftest (c) 對話溢出對照 FAIL')
  return ok
}

async function measure() {
  if (!staticArg) requireFreshStorybookBuild(STATIC, freshSources())
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip()
  if (!browser) { await server.stop(); return null }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const rows = []
    for (const c of CASES) for (const density of DENSITIES) rows.push({ id: c.id, density, declared: c.role, ...(await measureCase(page, server.origin, c, density)) })
    return rows
  } finally { await browser.close(); await server.stop() }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (process.argv.includes('--selftest')) {
    // (a)(b) 判定表先過才開瀏覽器:起不了瀏覽器時 launchBrowserOrSkip 以 0 結束(SKIPPED-ENV),不能讓它蓋掉判定表的紅
    if (!selftest()) process.exit(1)
    process.exit((await selftestOverflow()) ? 0 : 1)
  }
  try {
    const rows = await measure()
    if (rows === null) process.exit(0) // launchBrowserOrSkip 已印 SKIPPED-ENV / INSTRUMENT-FAIL 判定
    for (const r of rows) console.log(`  ${r.id.padEnd(30)} ${r.density}  ${(r.role ?? '-').padEnd(9)} 距離 ${r.gap ?? '-'}  (loose ${r.loose ?? '-'} / tight ${r.tight ?? '-'})  ${r.first ?? r.err ?? ''}${r.centered ? `  〔置中:距離 = 容器上內距;內距框內上方空白 ${r.above} / 下方空白 ${r.below};標頭底 → 內容頂 ${r.visualGap}〕` : ''}${r.scrolledBefore > 0 ? `  〔量之前把${r.scroller ?? '捲動區'}從捲動位置 ${r.scrolledBefore} 捲回頂端,讀回 ${r.scrolled}〕` : ''}`)
    const failures = judge(rows)
    if (failures.length) { console.error('❌ header-first-gap FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
    console.log(`✅ header-first-gap PASS(${CASES.length} 處 × md / lg:標頭 → 第一個東西依角色 = bounded loose / unbounded 0 / element tight;不在 CASES 的 ${NOT_COVERED.length} 類理由見 NOT_COVERED)`)
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}`); process.exit(1) }
    throw error
  }
}
