#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: layoutSpace.spec.md 規則 2「標頭 → 第一個東西」依第一個東西的角色決定距離 ——
 *         bounded region(有框的表格 / 卡 / 面板)= loose、unbounded region(自帶 py 的清單 / nav)= 0、element(標題 / 文字 / 欄位 / 按鈕 / 工具列)= tight。
 *         CASES = 全 DS 盤點(2026-11-10,c2fc683d 建置逐則掃 1079 則 story 的每個 chrome 標頭,另 grep 浮層 body / AppShellAside 的第一個子元素)
 *         出的「標頭底下由範例或元件給頂部內距」的每一處;
 *         md 與 lg 兩種密度各量一次。盤點時判為元件規格層待決(AgentConversation 內距 / 決策卡無分隔線標頭 / Coachmark 媒體)、
 *         版面分區(FileViewer 工具列 → 檢視畫布、Alert placement="fixed" 頁首橫條)、Sidebar 自己的 nav(清單的 py 在 SidebarGroup 包層上)不在 CASES,
 *         理由逐條見下方 NOT_COVERED。
 *   紅: 任一處「標頭底 → 第一個內容頂」與該角色的期望值差 > 0.5px → 指名 case / 密度 / 角色 / 數字並 exit 1;
 *       從 DOM 判出的角色 ≠ 盤點時登記的角色 → 紅(範例換了第一個東西,要重新照規則 2 推一次,不准默默沿用舊頂距)。
 *       歷史紅燈(c2fc683d 建置實測):Sidebar「混合內容」資料夾 → 檔案表格、檔案 → 版本紀錄表格,第一個是有框的 DataTable
 *       (bounded),頂距卻是 tight(md 12 / lg 16)—— 抄旁邊 TableSection(第一個是區段標題 = element = tight)沒照角色重推。
 *       2026-11-11 起主區只有一張表格的頁不再放區段標題(app-shell.spec.md「Main 內塞什麼」,user 2026-11-11 留言):Sidebar Dashboard / 專案、
 *       AppShell InsightsView、範本 DashboardPage 登記改為 bounded;拿修前 411fcc49 建置跑,這 4 處判出 element(h2)→ 與登記不符必紅。
 *   綠: 每一處都等於角色的期望值。純幾何,等元素本身出現、動畫跑完才量;重複跑恆等。
 *   量法: 靜態站開 story(globals density),必要時先點到該狀態(例:樹上點 README.md、展開 FileViewer 資訊面板),
 *         等該狀態的元素本身出現(waitForSelector,不睡固定時間)、`document.getAnimations()` 沒有跑動中的動畫(浮層開場縮放會把距離一起縮)
 *         才量 getBoundingClientRect(M32:量像素,不看 class)。
 *         第一個內容 = 標頭之後的下一塊(同層下一個看得見的兄弟,沒有就往上找)裡所有「看得見的東西」中頂邊最高的那個
 *         (有框 / 底色 / 陰影、有自己的字、控件、或清單 / 表格語意;絕對定位的裝飾與捲軸不算)。頂邊:有框的東西、清單、控件量外框;
 *         只有字的包層量內容框(包層的上內距是間距不是內容)。角色判法(classifyFirst,純函式,selftest 逐列驗):
 *           · DataTable 外殼(`[data-data-table-outer]`)、或有框(≥ 3 邊框線 / 跟外層不同的底色 / 陰影)且不是單一欄位控件、不是控件 / 縮圖
 *             (按鈕 / 連結 / 勾選 / 進度條 / role=img)、不是 Alert → bounded;
 *           · role = list / listbox / menu / tree / navigation 或 ul / ol / nav、沒有框、而且自帶上內距(第一列不貼清單頂)→ unbounded;
 *           · 其他(標題、文字、欄位、按鈕、工具列、沒自帶 py 的純文字清單)→ element。
 *         期望值的 loose / tight 從第一個內容的外層 computed `--layout-space-*` 讀(部分浮層刻意鎖 md,照它自己讀到的算);
 *         另要求頁面根(#storybook-root)的 loose md ≠ lg —— 兩密度讀到同值 = 密度沒套上 = 儀器失效(不讀成通過)。
 *         只看得到外框的東西才算:沒框的按鈕 / 連結往裡找圖示或字(負邊距撐出列外的透明按鈕框不是看得見的內容)。
 *         `--selftest`:(a) 判定表 —— 表格外層改 tight 必紅、標題在前卻用 loose 必紅、清單不貼標頭必紅、角色與盤點不符必紅、
 *         沒量到 / 距離 NaN / 密度沒套上判儀器失效、修後形狀必綠;(b) classifyFirst 逐列。
 *         `--static=<dir>` 指定建置(例:拿 c2fc683d 建置證明 Sidebar 那兩處會紅);指定時不跑新鮮度守衛。
 *   姊妹閘: header-content-sides-invariant.mjs 量同一份 CASES 的左 / 右 / 底(規則 1 / 6 / 4);盤點(CASES / NOT_COVERED)、導航(openCase)、
 *         頁面端量具(pageKit)、角色判法(classifyFirst)只住本檔,兩支 import 同一份。新增一處 = 本檔 CASES + 姊妹閘 SIDES(它的 selftest 驗一一對應)。
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

/**
 * 盤點出的每一處。header = 標頭選擇器(+ headerText:標頭文字須包含;+ nth);waitFor = 這個狀態的內容本身;
 * steps = 量之前要點到的狀態(click = 樹列 / 按鈕的可見文字,或 clickSelector),點完等 waitFor 那個元素出現;
 * role = 盤點時照規則 2 判的角色;src = 給頂部內距的那一行(repo 相對路徑,也是新鮮度守衛的來源清單)。
 * tableName = 主區只有一張表、不放區段標題的那幾處:表格的讀屏名稱(aria-label)必須是這個字串 —— 看得見的標題拿掉後,名字只剩這裡
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
]

/** 盤點到但不在 CASES 的(報告與檔頭的同一份理由;改動時兩邊一起看)。 */
export const NOT_COVERED = [
  ['AgentConversation 內距 loose(agent-panel.tsx:1021,agent-panel.spec.md:198「內距 16(--layout-space-loose)」)', '元件規格層待決:第一則若是代理的文字(element)規則 2 會是 tight;不改元件、回報'],
  ['AgentDecisionCard 標題列無分隔線、body 上下無內距(agent-panel.tsx:1830 / agent-panel.tsx:1847)', '元件規格層待決:標題列 border-b-0,規則 2 的「chrome 標頭 → 內容」前提(有分隔的標頭)不成立;回報'],
  ['Coachmark 標頭 → 媒體區 0', '元件規格層待決:coachmark.spec.md「Media 區規則」media 貼齊外殼(滿版),但沒寫標頭 → 媒體的距離;回報'],
  ['FileViewer 工具列 → 檢視畫布', '版面分區(畫布貼齊、圖置中),不是容器內的第一個內容'],
  ['Alert placement="fixed"', 'alert.spec.md:154「頂部全域警告,無圓角無邊框,橫跨頁面寬度」= 頁首橫條,不是內容'],
  ['Sidebar 標頭 → nav', 'unbounded = 0 成立(SidebarContent 頂 = 標頭底),但清單的 py 在 SidebarGroup 包層(p-2)上、不在清單元素上,DOM 判法分不出;Sidebar 規格自管'],
]

/**
 * 純函式:第一個(或姊妹閘的最後一個)內容的特徵 → 角色。f = { dataTable, border(邊數), ownBg, shadow, role, tag, fieldControl, control, selfPad }。
 * control = 按鈕 / 連結 / 勾選 / 進度條這類控件(規則 2 表「element(input / button / alert)」、規則 4 表「element(欄位 / 文字 / 按鈕)」):
 * 有框有底色也是 element,不是 bounded region(2026-11-11 姊妹閘量「最後一個東西」時加 —— 最後一個常是按鈕 / 進度條)。
 */
export function classifyFirst(f) {
  if (f.dataTable) return 'bounded'
  const framed = f.border >= 3 || f.ownBg || f.shadow
  if (framed && !f.fieldControl && !f.control && !/^(alert|status)$/.test(f.role ?? '')) return 'bounded'
  const listy = /^(list|listbox|menu|tree|navigation)$/.test(f.role ?? '') || /^(ul|ol|nav)$/.test(f.tag)
  if (!framed && listy && f.selfPad) return 'unbounded'
  return 'element'
}

export const expectedGap = (role, { loose, tight }) => (role === 'bounded' ? loose : role === 'unbounded' ? 0 : tight)
const RULE = { bounded: 'bounded region → loose', unbounded: 'unbounded region → 0', element: 'element → tight' }

/** 純函式:[{ id, density, declared, role, gap, loose, tight, first }] → 不符合的訊息清單(呼叫端與 selftest 共用)。 */
export function judge(rows) {
  const failures = []
  for (const r of rows) {
    const where = `${r.id} @${r.density}`
    if (r.err) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} ${r.err}`); continue }
    if (!(r.loose > 0) || !(r.tight > 0)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到 --layout-space-loose / tight`); continue }
    if (!Number.isFinite(r.gap) || !r.role) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 沒量到標頭 → 第一個內容`); continue }
    if (r.role !== r.declared) failures.push(`${where} 第一個內容的角色 = ${r.role}(${r.first ?? '?'}),盤點登記的是 ${r.declared} —— 第一個東西換了,照規則 2 重推頂距並更新 CASES`)
    const want = expectedGap(r.role, r)
    if (Math.abs(r.gap - want) > TOL) failures.push(`${where} 標頭底 → 第一個內容頂 = ${r.gap}px,應 ${want}(規則 2:${RULE[r.role]};第一個內容 = ${r.first ?? '?'})`)
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
  const row = (id, declared, role, density, gap) => ({ id, density, declared, role, gap, ...T[density], first: 'x' })
  const good = CASES.flatMap((c) => DENSITIES.map((d) => row(c.id, c.role, c.role, d, expectedGap(c.role, T[d]))))
  expect(judge(good).length === 0, `修後形狀應綠,實得 ${JSON.stringify(judge(good))}`)
  expect(new Set(CASES.map((c) => c.id)).size === CASES.length, 'CASES id 不得重複')
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
  const base = { dataTable: false, border: 0, ownBg: false, shadow: false, role: null, tag: 'div', fieldControl: false, control: false, selfPad: false }
  const cls = [
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
  const transparent = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c)
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
  const findHeader = (header, headerText, nth) => [...document.querySelectorAll(header)].filter((el) => vis(el) && (!headerText || el.textContent.includes(headerText)))[nth]
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
  return { vis, transparent, effBg, LIST_ROLE, feat, isThing, boxedOf, topOf, findHeader, findBody, collectThings }
}

/** 把 pageKit 裝進目前頁面(window.__layoutKit);每次換頁後、量之前呼叫。 */
export const installPageKit = (page) => page.evaluate(`window.__layoutKit = (${pageKit.toString()})()`)

/** 頁面函式:找標頭 → 下一塊 → 頂邊最高的「看得見的東西」,回傳特徵與距離(角色由 Node 端 classifyFirst 判)。 */
export const probeFirst = ({ header, headerText = null, nth = 0 }) => {
  const K = window.__layoutKit
  const h = K.findHeader(header, headerText, nth)
  if (!h) return { err: `找不到標頭 ${header}${headerText ? `(含「${headerText}」)` : ''}` }
  const body = K.findBody(h)
  if (!body) return { err: '標頭之後沒有內容' }
  const things = K.collectThings(body)
  if (!things.length) return { err: '標頭之後找不到看得見的內容' }
  const minTop = Math.min(...things.map((t) => t.top))
  const pick = things.find((t) => t.top - minTop < 0.5)
  const host = pick.el.parentElement ?? pick.el
  const v = (name) => parseFloat(getComputedStyle(host).getPropertyValue(name))
  const round = (x) => Math.round(x * 10) / 10
  const cls = (pick.el.getAttribute('class') ?? '').split(/\s+/).slice(0, 4).join(' ')
  const f = pick.f
  return {
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

async function measureCase(page, origin, c, density) {
  const opened = await openCase(page, origin, c, density)
  if (opened) return opened
  await installPageKit(page)
  const r = await page.evaluate(probeFirst, { header: c.header, headerText: c.headerText ?? null, nth: c.nth ?? 0 })
  if (r.err) return r
  // 主區不放區段標題的那幾處:表格的名字只剩 aria-label(看得見的標題拿掉了)—— 量畫面上那張表格的讀屏名稱本身,不靠 waitFor 猜
  const tableNameGot = c.tableName ? await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((t) => t.getAttribute('aria-label') ?? '').filter(Boolean), c.waitFor) : undefined
  return { ...r, role: classifyFirst(r.f), tableName: c.tableName, tableNameGot }
}

async function measure() {
  if (!staticArg) requireFreshStorybookBuild(STATIC, [...new Set(CASES.map(srcFile))].concat(['packages/design-system/src/tokens/layoutSpace/layoutSpace.css', 'packages/design-system/src/components/DataTable/data-table.tsx', 'packages/design-system/src/patterns/header-canonical/chrome-header.tsx']))
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
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1)
  try {
    const rows = await measure()
    if (rows === null) process.exit(0) // launchBrowserOrSkip 已印 SKIPPED-ENV / INSTRUMENT-FAIL 判定
    for (const r of rows) console.log(`  ${r.id.padEnd(30)} ${r.density}  ${(r.role ?? '-').padEnd(9)} 距離 ${r.gap ?? '-'}  (loose ${r.loose ?? '-'} / tight ${r.tight ?? '-'})  ${r.first ?? r.err ?? ''}`)
    const failures = judge(rows)
    if (failures.length) { console.error('❌ header-first-gap FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
    console.log(`✅ header-first-gap PASS(${CASES.length} 處 × md / lg:標頭 → 第一個東西依角色 = bounded loose / unbounded 0 / element tight;不在 CASES 的 ${NOT_COVERED.length} 類理由見 NOT_COVERED)`)
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}`); process.exit(1) }
    throw error
  }
}
