---
component: AppShell
family: composite  # 組合 sidebar+header+main+aside,非 Family 1-4 row element
variants: {}  # layout 是頁面結構 mode,非視覺 variant 軸
sizes: {}  # shell 尺寸由 slots / responsive layout 自管,無 component size 軸
traits: []  # page-level layout composite,slots 全 ReactNode 組合,無 trait variants(R3 trait enforce 無適用項;2026-07-04 dim 29 補宣告)
scope: web service page-level layout primitive (sidebar + header + main + aside composition)
benchmark:
  - Mantine AppShell: https://mantine.dev/core/app-shell/ — 6-slot (Header/Navbar/Aside/Footer/Main) + layout="default|alt" mode
  - Ant Design Layout: https://ant.design/components/layout — Layout/Header/Sider/Content/Footer compound API
  - Material 3 Navigation Drawer: https://m3.material.io/components/navigation-drawer/overview — standard (persistent inline) vs modal (overlay with mask)
  - Atlassian Navigation System (Beta): https://atlassian.design/components/navigation-system — TopNav + SideNav + Layout
  - Linear / Notion / Figma — primary-sidebar mode reference(local toolbar header)
  - GitHub / Slack / Gmail — primary-header mode reference(global top bar)
---


# AppShell 設計原則

## 定位

**Web service 頁面層級的 layout primitive**——組合 `Sidebar`(Menu)+ `ChromeHeader` + main content + `Aside`(Right panel)+ `AgentPanel`(AI agent)成完整 page shell,定義跨元件 composition + 四區版面規則(「版面規則」)+ a11y landmark canonical。

**實作基礎**:自建 grid/flex layout(無 Radix primitive 對應)+ 消費既有 DS canonical(`Sidebar` / `header-canonical` / `AgentPanel` / `ResizeHandle` / `layoutSpace`);四區版面的計算 = 自建純函式 `./layout-model.ts`(規則是 user 2026-10-14 自訂,無現成 primitive)。對齊 Mantine AppShell compound API + Ant Layout slot 模式。

**Layout Family**:跨 family 的**整頁框架**,不屬 4-family 任一,但**所有 family 元件可塞進 main slot**。

**SSOT 邊界**:
- AppShell own:slot composition / layout mode / 四區版面(誰並排、誰變浮層、誰暫藏、可拉上限、寬度紀錄、水平捲動 —— 「版面規則」)
- **邊界狀態**:layout 殼,無自身互動狀態(disabled / loading / empty 不適用,slot 內容各自管;dark / density 隨 theme subtree);overlay open state 自管(見「Dialog / Sheet / Popover 互動」段)
- **不 own**:Sidebar 視覺(SSOT 在 `sidebar.spec.md`)/ Header 視覺(SSOT 在 `header-canonical.spec.md`)/ AI agent 面板內容(SSOT 在 `agent-panel.spec.md`)/ Sheet 視覺(SSOT 在 `sheet.spec.md`)/ Main 內 layout(SSOT 在 `layoutSpace.spec.md` 6 條規則)

**不是**:`Sidebar`(本 shell consumer 之一)/ `Sheet`(臨時浮層)/ `ChromeHeader`(local header)/ `Page`(語意 wrapper,不存在於本 DS)。

---

## 何時用

- 多頁 web service 主結構(Linear / Notion / Slack / GitHub / Asana 類)
- 需要 sidebar + main 持續共存,跨頁切換時 sidebar 不重渲染
- 需要 right panel(info / inspector / detail pane)跟 main 並存

## 何時不用

| 場景 | 改用 | 原因 |
|---|---|---|
| 單頁 landing / marketing site | `<main>` 直接展開 | 沒導覽不需要 shell |
| Auth 頁(login / signup) | 自寫 centered layout | 不該被 sidebar 佔位 |
| Embedded widget / iframe | `<main>` only | 已被 host shell 包住 |
| 文件 reader(全螢幕閱讀)| `<main>` only | shell chrome 干擾閱讀 |

---

## API skeleton(對齊 Mantine compound API)

```tsx
<AppShell
  layout="primary-sidebar" | "primary-header"   // 預設 primary-sidebar
  // sidebar 開合 state 走 Sidebar SSOT 既有 SidebarProvider(消費既有 ⌘B / Ctrl+B,本 AppShell 不重發明)
  mainMinWidth={600}    // 必填:Main 只有最小寬(「版面規則」§1)
  asideOpen={open}      onAsideOpenChange={setOpen}      // ⌘. / Ctrl+. toggle (本 AppShell own)
  sidebar={<Sidebar collapsible="icon" widthRange={{ min: 240, initial: 240, max: 320 }}>...</Sidebar>}   // Menu;SSOT in components/Sidebar/sidebar.spec.md
  header={<ChromeHeader>...</ChromeHeader>}     // SSOT in patterns/header-canonical/header-canonical.spec.md
  aside={<AppShellAside title="Detail" contentType="issue-detail" widthRange={{ min: 250, initial: 320, max: 500 }}>...</AppShellAside>}   // Right panel
  agent={<AgentPanelDock>{({ close }) => <AgentPanel onClose={close}>...</AgentPanel>}</AgentPanelDock>}   // AI agent;SSOT in components/AgentPanel/agent-panel.spec.md
>
  {children}    {/* <main> landmark, padding=0,內容遵循 layoutSpace 6 條規則 */}
</AppShell>
```

Sub-component:`<AppShellAside title={...} contentType={...} widthRange={{ min, initial, max }} defaultWidth? onWidthCommit?>` —— 寬度 = 這種內容類型的最小 / 初始 / 最大(「版面規則」§1;同一 `contentType` 的不同資料共用設定與寬度紀錄)。**title prop required**(= `<aside aria-label>`)。2026-10-14 前的 `width: number | { md, xl }` 依視窗挑寬與 240 / 640 硬夾隨「版面規則」退場(破壞性)。Menu(`<Sidebar widthRange contentType>`)與 AI agent(`<AgentPanel widthRange contentType>`)的寬度設定同一形狀、同一個名字 `widthRange`(不叫 `width`:AgentPanel 的 `width` 早已是「受控寬度紀錄」);`defaultWidth` / `onWidthCommit` = 產品自存紀錄的還原與接收(§7)。`mainMinWidth`、`contentType`、`widthRange`、`agent` slot、`requestAside`、`navigateFromAgent` 是 2026-10-14 為落地「版面規則」新增的 API(AI 建議的形狀,工程決定)。

**Aside body padding(內容自帶,刻意 Pattern B)**:`<AppShellAside>` 的 body(ScrollArea 內)**不自帶 px/py**,由 consumer 塞入的 children 自行負責留白(對齊 `layoutSpace.spec.md` 規則 1B「父層/內容管 padding」的裸結構路線,同 Table / DataTable)。**理由**:aside 內容異質(清單需 hover 貼邊滿版、表格需 flush、表單才需 padding),框架統一加 padding 反而破壞清單/表格。與 Dialog / Sheet body 自帶 `px-loose py-tight` 的差異是**刻意**的(那兩者內容較單一)。consumer 放需留白的內容時,自帶 `px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]`(範例 `app-shell.stories.tsx` 即如此)。

**Aside 開關控制(刻意單向,2026-07-17 user 拍板)**:`asideOpen` / `onAsideOpenChange` 提供完整 **controlled** 路徑;uncontrolled fallback 初值**刻意固定關閉**(`useState(false)`),**不提供 `defaultAsideOpen`**。理由:側邊詳情面板實務上幾乎一定由 app 的 route / 選取狀態驅動,初值固定關閉是合理預設,額外加 `defaultAsideOpen` 偏 YAGNI。對齊 Dim 26 dual-mode canonical 的「刻意單一模式 → 補 rationale」例外機制。未來真有 uncontrolled 初值需求再加(additive,不破壞)。

### Hook export:`useAppShell()`(2026-05-21 D2 codify per Phase B codex catch)

Public compound API hook,讓 consumer 自拼 custom aside / 自管 modal layout(對齊 Radix `useDialogContext` / MUI `useFormControl` / Mantine `useAppShellContext` 慣例)。

```tsx
import { useAppShell } from '@/design-system/components/AppShell/app-shell'

function CustomAside() {
  const { asideOpen, setAsideOpen, requestAside, display } = useAppShell()
  // 自管 visibility,依 display.right 判斷;不必走預設 <AppShellAside>
}
```

**Contract**:
- 必在 `<AppShell>` 子樹內 call,否則 throw(consumer 拼 layout 必 wrap AppShell context)
- 回傳:`{ layout: 'primary-sidebar' | 'primary-header', asideOpen: boolean, setAsideOpen: (open: boolean) => void, requestAside: (contentType?: string) => void, navigateFromAgent: () => void, display: Record<'menu' | 'right' | 'agent', PanelDisplay> }`(hook 回傳整個 context,consumer 拼 custom layout 可讀當前 `layout` mode 與各區顯示方式;`PanelDisplay` = 並排 / 浮層 / 暫藏 / 關閉,`layout-model.ts`)。`requestAside` = 使用者主動要求 Right 顯示內容(§4)。`navigateFromAgent` = 使用者在 AI agent 裡點了導向 Main 的東西(§4 末條):和產品自己的導航放在同一個事件裡呼叫。2026-10-14 前的 `isMobile`(768 斷點)隨「版面規則」退場(破壞性)
- 設計目的:給跳出 `<AppShellAside>` 預設 sub-component 框架的 consumer 用(rare),DS 預設仍建議走 `<AppShellAside>` slot

---

## Layout mode(對齊 Mantine `layout` prop)

| Mode | Sidebar 位置 | Header 結構 | 適用 product 派 |
|---|---|---|---|
| **`primary-sidebar`**(預設)| 頂天立地 full-height(viewport 左側) | 1 層 = `header`(local toolbar 在 main col 頂)| Linear / Notion / Figma |
| **`primary-header`** | globalHeader 下方 full-height(扣 globalHeader 高)| **2 層** = `globalHeader`(頂橫跨 viewport)+ `header`(local 在 main col 頂)| GitHub / Slack / Gmail |

**Header 永遠是 horizontal strip,不延伸 vertical**(per 2026-05-19 user clarification)。

### primary-header = primary-sidebar + 一條 global header

`primary-header` mode = `primary-sidebar` mode 的所有東西 + **額外一條 global header 在頂**。`header` slot(local toolbar)**仍然存在**,只是上面多了 `globalHeader` slot(跨頁 chrome)。世界級對照(皆為 2 層 header):
- **GitHub**:global top nav(logo / search / account)+ **repo header**(breadcrumb / branch selector,**local**)+ sidebar + content
- **Slack**:global header(workspace switcher)+ **channel header**(channel name / settings,**local**)+ sidebar + main
- **Gmail**:global logo bar + **email list toolbar**(sort / filter,**local**)+ sidebar + list

**常見誤解:「primary-header = header 取代 local toolbar」** — 錯;global header 是**加在 local toolbar 之上**,不是取代(上列三家全部同時保有兩層)。

**API**:
- `header` prop:**永遠** local page header(per page actions / breadcrumb / filter),兩 mode 都 render
- `globalHeader` prop:**僅** `primary-header` mode render(account / workspace switcher / search / notifications)
- `primary-sidebar` mode 傳 `globalHeader` 會被**忽略**(explicit ignore,not error)

### WorkspaceBrand 放置 SSOT(2026-05-21 codify per user directive「globalHeader 存在時 sidebar 內 header 該拿掉」)

| Mode | WorkspaceBrand 放置 | Sidebar 內 SidebarHeader | 對齊 World-class |
|---|---|---|---|
| `primary-sidebar` | **Sidebar 頂部**(`<SidebarHeader>` 內)| 有 — 放 WorkspaceBrand | Linear / Notion / Figma file panel(無 global header,workspace 自然在 sidebar 頂) |
| `primary-header` | **globalHeader 左側**(`<GlobalHeader>` 左 slot,搭配 SidebarTrigger)| **無 / 空 SidebarHeader** | GitHub(repo page sidebar 無 header,org/repo 在 global breadcrumb)/ Gmail(無 workspace brand 在 sidebar)/ Figma file editor(file name 在 global top bar,Layers 面板無 header) |

**Rule:WorkspaceBrand 只能出現一次**(視覺 SSOT)。`primary-header` mode 重複放(同時在 globalHeader + SidebarHeader)= 視覺冗餘 + 跨產品識別混淆 → **禁止**。

**浮層精修(2026-06-18 立,2026-10-14 改條件)**:「只能出現一次」= **同一時間一次**。`primary-header` 的 Menu 浮層(Sheet,z-50)從視窗頂端起、**蓋住 globalHeader**(「版面規則」§9)→ 品牌看不到、浮層變孤兒 → 此時在浮層內補 `<SidebarHeader><WorkspaceBrand/>`(globalHeader 既被蓋住,仍「同一時間一次」,非重複),用**同一組 primitive**(style SSOT,與 primary-sidebar 外觀一致,非手刻對齊)。觸發條件 = Menu 顯示為浮層(consumer 讀 `useAppShell().display.menu`);2026-10-14 前是「768 以下 Sidebar 收成 Sheet」(`useSidebar().isMobile`),隨 768 斷點退場、規則內容不變(D:30 清單 #23)。Reference:`_demo-helpers.tsx` `AcmeSidebar`。**禁止**:primary-header 同時 globalHeader + SidebarHeader 放 brand(那才是真重複)。

**Slack 為 mixed pattern 例外**(thin workspace rail + channels sidebar 有 workspace name)— 不採用此分類,DS 採 **GitHub / Gmail / Figma** 共識(globalHeader 存在 → sidebar 內無 header)。

**Consumer 實作 pattern**:
```tsx
// primary-sidebar 派(Linear/Notion):
<AppShell layout="primary-sidebar"
  sidebar={<Sidebar><SidebarHeader><WorkspaceBrand /></SidebarHeader>...</Sidebar>}
  header={<PageHeader title="..." />}>...

// primary-header 派(GitHub/Gmail/Figma):
<AppShell layout="primary-header"
  globalHeader={<GlobalHeader>... <WorkspaceBrand /> ...</GlobalHeader>}  {/* brand 在這 */}
  sidebar={<Sidebar viewportInsetTop="..."> {/* 無 SidebarHeader */} ...</Sidebar>}
  header={<PageHeader title="..." />}>...
```

### 帳號入口(Account entry)放置 SSOT(2026-06-17 codify per user directive「primary-header 不該把個人設定放 sidebar footer,該放主標頭右側 avatar」)

「帳號 / 個人設定入口」(目前使用者的 avatar,點開 = 帳號選單)放置同樣 **mode-dependent**,鏡像上方 WorkspaceBrand 規則:

| Mode | 帳號入口放置 | Sidebar footer | 對齊 World-class |
|---|---|---|---|
| `primary-sidebar` | **Sidebar 底部**(`<SidebarFooter>` 內,當前使用者)| 有 — 放使用者 | Linear / Notion / Figma(無 global header,帳號自然在 sidebar 底)|
| `primary-header` | **globalHeader 右側**(trailing slot,品牌在左、帳號在右)| **無 / 空** | GitHub / Gmail / Slack(帳號 avatar 一律在 global top bar 右上)|

**Rule:帳號入口只能出現一次**(視覺 SSOT,同 WorkspaceBrand)。`primary-header` mode 同時放(globalHeader 右 + sidebar footer)= 視覺冗餘 + 入口混淆 → **禁止**;`primary-header` 的 sidebar **不放** user footer(與上方「globalHeader 存在 → sidebar 不重複 chrome 角色」同源邏輯)。

**機械強制(2026-07-30 codify per WM F9 layer 3「無機械攔」)**:consumer 層 `packages/design-system/ds-canonical/hooks/check_consumer_code_quality.sh`(GOV-CONSUMER-QUALITY-001,fork corpus 隨附)兩段互補 — (a) 既有 primary-header 段:檔內宣告 `layout="primary-header"` + `<SidebarFooter>` → BLOCK;(b) 帳號入口 duplicate 段:mode 字面不在檔內時,SidebarHeader block 帳號選單簽名(AccountMenu / DropdownMenuTrigger+Avatar+account 語彙)與 SidebarFooter user 區同檔並存 → BLOCK(escape `@account-entry-allow: <rationale>`)。story 層 early-warn = `story-baseline-registry.json#sidebar-handbuilt-account-trigger`。跨檔組合(layout 宣告與 sidebar 分檔)機械不可及 → 歸 `/product-ui-audit` judgment。

**浮層精修(帳號入口,同上條件)**:Menu 浮層若蓋住 globalHeader(桌面帳號入口也在 globalHeader 右)→ **帳號入口鏡像桌面位置搬進浮層頂排右**:`<SidebarHeader>` 內放 `<WorkspaceBrand/>`(左)+ `flex-1` + `<AccountMenu/>`(右)= 把整條 globalHeader 原封搬進浮層頂排(SidebarHeader 即 ChromeHeader 基底,與 GlobalHeader 同 primitive → 帳號 avatar 24px + 右緣距 `--layout-space-loose` 由 construction 保證,**非手刻對齊**);**不在浮層底放 `<SidebarFooter>`**(primary-header 帳號家在 header 區,footer 是 primary-sidebar 慣例)。對齊 Material modal navigation drawer「account switcher 放 drawer header 區,footer 區放 settings/support 次要項」(<https://m3.material.io/components/navigation-drawer>)。觸發條件同上(Menu 顯示為浮層,`useAppShell().display.menu`);2026-10-14 前以 `useSidebar().isMobile`(768)判斷,隨斷點退場、規則內容不變(D:30 清單 #23)。Reference:`_demo-helpers.tsx` `AcmeSidebar`。

**為什麼 primary-header 帳號入口在「右上」**:GitHub / Gmail / Slack / Atlassian 的全域標頭一律把「自己的帳號」放右上(品牌在左、帳號在右,左右對稱)= global chrome 標準位置,不是 sidebar footer。

**入口開什麼 = 帳號選單(`<DropdownMenu>`),不是 ProfileCard**:
- 開「個人資料 / 設定 / 登出」navigation 選單(對齊 GitHub / Gmail / Slack / Atlassian「自己的帳號入口」慣例)。
- **不用 `ProfileCard`**:ProfileCard 的預設動作(Chat / 通話)語義是「聯絡某人」,用在**自己**身上不對 — ProfileCard 是看**別人**的人員卡。自己的帳號入口 = 選單。
- 消費既有 `components/DropdownMenu`(`DropdownMenuTrigger asChild` 包 avatar 作 focusable 觸發點)。

**Avatar 尺寸 + 邊距**:帳號 avatar = `<Avatar size={24}>`(density-fixed,跟左側品牌 avatar 同尺寸),走 `../../patterns/header-canonical/header-canonical.spec.md` 4.5 chrome header avatar SSOT(brand + account 皆 24px raw Avatar、非 ItemAvatar)。右側邊距 = 作為 ChromeHeader 主內容區最後一個 child 自然繼承 `--layout-space-loose`(16px@md / 24px@lg),**與左側品牌 avatar 距 leadingRail 分割線的距離對稱**(ChromeHeader px-loose canonical 結構性保證,**禁 hardcode margin**)。

**Reference implementation**:`../AccountMenu/account-menu.tsx`(公開元件;2026-07-30 F9 自 `_demo-helpers.tsx` 升 public,demo `AccountMenu` 為綁示範資料的薄 wrapper 消費之)+ `_demo-helpers.tsx` `GlobalHeader`(右 slot 預設放 `<AccountMenu />`)。

**真正的 distinguishing factor = Header scope(local toolbar vs global bar)**:
- **Local toolbar 派**(當前頁 anchor / breadcrumb / page-level actions / filter / 該頁 specific 操作)→ `primary-sidebar`
- **Global bar 派**(account avatar / workspace switcher / notifications / 跨頁 search / 跨頁導覽)→ `primary-header`

**常見誤解:「multi-workspace 就必須 primary-header 派」** — workspace 多寡跟 layout 派别無相關性(world-class 反證:Linear / Notion / Figma 皆 multi-workspace 卻用 primary-sidebar;Gmail 多 account 用 primary-header)。選 mode = 表態「Header 是 local 還是 global」,**不是**「workspace 是 single 還是 multi」。

**Sidebar toggle 按鈕位置**(消費既有 `sidebar.spec.md`「SidebarTrigger 位置(兩種 canonical pattern)」段,**不發明新 toggle**):

| Mode | 對應 Sidebar pattern | Toggle 位置 |
|---|---|---|
| `primary-sidebar` | `sidebar.spec.md` Pattern A(無 global top bar) | 主內容 header 最左 |
| `primary-header` | `sidebar.spec.md` Pattern B(有 global top bar) | global top bar 最左 |

**唯一 invariant**(`sidebar.spec.md`「SidebarTrigger 位置」段既有):trigger 必在 sidebar 任何 state(offcanvas / icon / expanded)下都可見 — 收合後 sidebar 不見了,toggle 不可能留在 sidebar 內(會跟著消失)。兩 mode 結論都落在 **Header 最左**,只是該 Header 是 local toolbar(Pattern A)還是 global bar(Pattern B)。Consumer 直接 `<SidebarTrigger />` 塞 Header 最左,AppShell 不 wrap / 不發明。

**層級語意差異**:`primary-sidebar` 的 Header scope = local(當前頁);`primary-header` 的 Header scope = global(整 app)。兩者是不同 product 角色,**不互通**。Consumer 選 mode = 表態 product 是哪派。

**Workspace switcher 預設位置**:
- `primary-sidebar`:sidebar 頂部(對齊 Linear / Notion / Slack)
- `primary-header`:header 左側(對齊 GitHub / Gmail)

**Breadcrumb 預設位置**:
- `primary-sidebar`:Header 內(當前頁 anchor,對齊 Linear local header)
- `primary-header`:Main 頂(對齊 GitHub `<repo>/<dir>/<file>` breadcrumb)

兩者都消費既有 `breadcrumb.spec.md` 視覺 canonical,只是 placement 不同。

---

## 版面規則(Menu / Main / Right panel / AI agent)

> **本節是 AppShell 四區版面的唯一住所**(2026-10-14)。可執行版本 = `./layout-model.ts`(DS 內部模組,不對外匯出;`app-shell.tsx` 經 `reduceLayout` / `deriveLayout` 排四區,面板經 `./app-shell-context.ts` 登記設定、拿回顯示方式);判定表 = `scripts/test-app-shell-layout-model.mjs`(`npm run test:app-shell-layout-model`;`--selftest` 把模型與呼叫端逐一改壞,每一個都必須紅);真頁面 = `scripts/app-shell-layout-invariant.mjs`(`npm run test:app-shell-layout`:設計規格「狀態行為」在真實視窗寬度與真操作下逐步等於模型)。其他 spec 只寫自己的部分並指回這裡。
> **出處標記**:`U:n` / `D:n` = user 2026-10-14 第一則 / 第二則原文第 n 行,逐字收錄在 `governance/planning/2026-10-14-app-shell-layout-user-spec.md`。D:22–30 是 AI 的建議,user 以 D:10「其他app shell 我沒意見的部分確保符合我們一致的設計語言且不違背世界級的設計,就照你建議做」核准,下文標「AI 建議(D:n 核准)」;規格沒寫、由 DS 既有規格回答的標檔名;AI 從規則推出、user 沒逐字說過的標「AI 推導」。
> **原則**(user D:12 問句,AI D:31 確認):使用者主動要求呈現某內容時,UI 要確保該內容明確清楚地呈現在使用者眼前 —— 以下每一條取捨都圍繞這一句。
> **範圍**:DS 以 desktop web 為主,不為手機或過小視窗設計(U:77、D:8、D:20)。

### 1. 四區與寬度設定

| 區(由左至右,U:4) | 開關 | 拖寬 | 寬度設定 | 承載 |
|---|---|---|---|---|
| Menu | ✅ | ✅ | 依內容類型:最小 / 初始 / 最大(U:6) | `sidebar` slot = `<Sidebar>` |
| Main | 始終存在 | ❌ | **只有最小寬**;填滿並排面板沒用到的空間(U:5) | `children` = `<main>` |
| Right panel | ✅ | ✅ | 依內容類型:最小 / 初始 / 最大(U:6) | `aside` slot = `<AppShellAside>` |
| AI agent | ✅ | ✅ | 依內容類型:最小 / 初始 / 最大(U:6) | `AgentPanel`(`../AgentPanel/agent-panel.spec.md`) |

- 三值皆正數、最小 ≤ 初始 ≤ 最大;同一內容類型的不同資料共用設定(U:6);不合法時開發階段報錯(AI 推導)。DS 不再硬夾任何寬度,產品設的值為準。
- Main 最小寬由產品給(U:5 只寫「始終保留最小寬度」,沒寫值誰給 → AI 建議:必填、DS 不替產品挑預設;user 兩個例子都用 600,U:13、U:35)。
- 「視窗寬度」= 視窗內可供 App 排版的寬度(U:7)= AppShell 根節點**看得到**的寬(ResizeObserver 量,不量 `window`;不含水平捲出去的部分,U:27)—— 量法是 AI 推導。
- 產品沒設時的 DS 預設(沿用既有值,AI 建議):AI agent 360 / 400 / 640(`AGENT_PANEL_WIDTH_MIN / DEFAULT / MAX`)、Right panel 240 / 320 / 640(現行 `ASIDE_WIDTH_MIN / DEFAULT / MAX`)、Menu 最小 240 / 初始 240(`--sidebar-width-min` / `--sidebar-width`,出處見 `../Sidebar/sidebar.spec.md`「尺寸規範」);Menu 最大 DS 沒有既有值 → 產品必給。

### 2. 開關紀錄、顯示方式、寬度紀錄分開管

| 東西 | 誰改 | 規則 |
|---|---|---|
| 開關紀錄(開 / 關) | 只有使用者 | 視窗大小或內容自動變化只重排顯示方式與寬度,不改開關紀錄;**暫藏 ≠ 關閉**;已關閉的面板不會自動重開(U:9、U:11)。唯一會連帶關閉**其他面板**的是第 4 點;AI agent 浮層時從 agent 導向 Main 是它自己讓位(第 4 點末條,D:23) |
| 顯示方式 | 系統每次現算 | 並排 / 浮層 / 暫藏(只有 Menu)/ 關閉(`layout-model.ts` `PanelDisplay`;U:9、U:20-26) |
| 寬度紀錄 | 只有使用者調整寬度 | 每個面板、每種內容類型一份(第 7 點;U:66-67、D:19) |

### 3. 誰並排 —— 放得下就並排,沒有任何固定門檻

視窗寬度、面板開關或顯示內容改變時,依 **Right panel → AI agent → Menu** 安排已開啟的面板(U:20)。每一步:視窗寬 − Main 最小寬 − 已決定並排面板的最小寬 ≥ 這個面板的最小寬 → 並排;**只看最小寬,不看初始寬或使用者設的寬**(U:21)。

| 面板 | 放得下 | 放不下 |
|---|---|---|
| Right panel | 並排 | **仍然並排**(永遠不變浮層;U:23,user D1 原話 U:77「我就是要並排」) |
| AI agent | 並排 | 右側浮層(U:24) |
| Menu | 並排 | 已是浮層就維持,否則暫藏(U:25) |

- Menu 暫藏時按開關(或 ⌘B)→ 左側浮層;已開啟的面板重新放得下 → 恢復並排(U:26)。Menu 並排時按開關 → 關閉(U:9)。
- Menu 原本**關閉**、放不下時按一下開關 → **直接出左側浮層**(開關紀錄 = 開),不先變成看不到的暫藏、要再按第二次(AI 建議,D:25 核准)。
- Menu 浮層開著時再按開關、按 Esc 或點浮層外 → **收回暫藏**,開關紀錄仍是開;之後放得下自己回來並排(AI 建議,D:26 核准;與現行 Sidebar 窄版抽屜「開收另外存、不動開關紀錄」同一個做法)。
- AI agent 何時變浮層是當下算出來的,不是門檻:Main 600 + AI agent 最小 360 → 960;多開最小 250 的 Right → 1210;AI agent 最小改 350 → 950。768 / 960 / 1280 固定門檻全部退場(U:21 只看最小寬,本來就沒有門檻;user U:84 問句「這個門檻難道不用拿掉嗎？」;清單 D:30)。
- **知情**(AI 推導,判定表 A7):沒細列時視窗 1050–1199、三個都開 → AI agent 先變浮層讓出空間,Menu 反而回來並排(U:26);這時 AI agent 浮層讓底下不能操作(第 9 點),Menu 看得到、要等 AI agent 關掉才能點。

### 4. 唯一的連帶關閉

使用者**主動要求** Right panel 顯示內容(打開它,或切換它目前顯示的內容)時,Main 最小寬 + Right panel「新內容」最小寬 + 已開啟 AI agent 的最小寬(+ 細列,第 6 點;不含 Menu 的最小寬,U:12 只列這三區)合計超過視窗寬 → 關閉 AI agent(U:12、U:15;判定表 U1、U23)。例:視窗 1100,最小 600 / 300 / 300,合計 1200 → 關閉(U:13)。
- 主動要求 = 開關鈕、⌘.、使用者切換 Right 的內容;內容自己更新不算(U:11;判定表 U24)。AI agent 並排或浮層,開著就算(U:16 浮層「不關閉」= 仍開著)。接法(工程決定):Right 從關變開一律算要求(已關閉的面板不會自動重開,U:11);開著時使用者要看別的內容 → 同一個事件裡呼叫 `useAppShell().requestAside(內容類型)`(同類型換一筆資料也算,省略參數);`<AppShellAside contentType>` 換了卻沒有對應的 `requestAside` = 內容自己變,不連帶關閉。
- 只開 AI agent、或只是視窗變窄 → 什麼都不關;兩者原本並排、只因視窗縮小 → AI agent 改右側浮層(U:16)。
- 「唯一會連帶關閉其他面板」指**面板之間**;AI agent 浮層時從 agent 導向 Main 而自己收起,不在此列(AI 建議,D:23 核准;規則住 `../AgentPanel/agent-panel.spec.md`「浮層時從代理導向 Main」)。接法(工程決定):AI agent 裡導向 Main 的連結 / 按鈕在同一個事件裡呼叫 `useAppShell().navigateFromAgent()` —— 浮層時收起 AI agent、焦點在它裡面時回 `#app-shell-main`(目標是 modal 時 Dialog 自己聚焦,AppShell 不搶);並排時不動。示範:展示「四區版面」「任務助理放不下時 — 右側浮層」裡 AI agent 回覆中的「Insights」連結;機械閘 `scripts/app-shell-layout-invariant.mjs` S21(浮層收起)、S22(並排不動)。
- 結果(AI 推導,判定表 P2 窮舉):要求 Right 之後 AI agent 只會並排或被關,**不會變成蓋住 Right 的浮層**。

### 5. 可拉上限(並排面板)

先從視窗寬扣除 Main 與所有並排面板的最小寬(+ 細列),剩餘**平均**加到各面板的可拉上限;某面板到設定最大寬就停,其餘繼續均分,直到用完或全部到最大(U:31-32)。所以**所有並排面板都拉到上限時 Main 剛好剩最小寬**,全部到最大時多的留給 Main(U:33;user D2 原話 U:78)。上限只決定最多能拉多寬,不會自動拉到上限(U:51)。
- 上限不取整:取整後 1440 全拉滿時 Main 剩 601,不是 U:33 的「剛好」(AI 推導,判定表 A1、P1)。
- **知情**(AI 推導,判定表 A12):上限是替其他面板預留的 —— 1600、三個都開、Right 紀錄 480 → Right 只顯示 330、Main 650,多的 50 留給 Menu 與 AI agent 拉到各自上限;這就是 U:75「其他面板的寬度與可拉上限不變」。

### 6. Menu 細列(消費者選用)

有細列 = 消費者選 `collapsible="icon"`(`../Sidebar/sidebar.spec.md`「Collapsible」);沒選 = 細列寬 0,以下全部退回 U 原文。以下是 AI 建議、D:24 核准(依 user U:82 的問句方向):
- 有細列時,Menu 最少看得到的就是細列,再窄也不消失(U:27 只寫水平捲動,沒有「窄就拿掉」)。
- 可拉上限與水平捲動判斷:Menu **並排**時展開的 Menu 取代細列的位置,細列不另扣(扣的是 Menu 最小寬)→ U:35-50 的數字一個都不變;Menu **關閉 / 暫藏 / 浮層**時,細列像 Main 最小寬一樣先扣。例:1600、Menu 關閉、細列 48 → Right 上限 426、AI agent 526(48 + 426 + 526 + 600 = 1600);細列 68 → 416 / 516。
- 排 Right 與 AI agent、第 4 點的合計:**不論 Menu 此刻是否並排,細列一律先扣**(D:24「「要求 Right panel 時關閉 AI agent」的合計都要扣細列」;Menu 排在最後、之後可能被暫藏而只剩細列,所以排前兩者時 Menu 最少就佔細列 —— 這不是「另扣」,Menu 並排時是展開的 Menu 取代細列)。只在 Menu 沒並排時才扣的話,要求 Right 之後 AI agent 會變成蓋住 Right 的浮層(AI 推導,判定表 D17、P2)。
- 細列寬來自 token 公式 `--sidebar-width-icon`(md 48 / lg 68,`../Sidebar/sidebar.spec.md`「尺寸規範」),不能拖、不是面板;程式量實際寬,不寫死 48。有細列時暫藏與關閉長得一樣(都只剩細列),差別只在放得下時暫藏的會自己回來(U:26)、關閉的不會(U:11)。
- 世界級同一個算法(細列是收起來的 Menu、展開時不是「細列 + 展開寬」):Carbon UI Shell 收起讓出 48px、展開改讓 256px(<https://github.com/carbon-design-system/carbon/blob/main/packages/styles/scss/components/ui-shell/content/_content.scss>);Material `ModalWideNavigationRail` 展開成浮層時「Keep this rail even when expanded so that screen layout doesn't change」(<https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/WideNavigationRail.kt>)。

### 7. 寬度紀錄與實際顯示

- 每個面板依內容類型各記一份;沒調過以初始寬為目標,調過以紀錄為目標(U:66)。並排與浮層共用同一份紀錄;切換內容、切換顯示方式、關閉面板都不清(U:67)。
- 實際顯示:目標合法 → 照目標;超出限制 → 暫時夾到最近的合法寬、**不覆寫紀錄**,限制放寬後自動恢復(U:70-71)。例:AI agent 設 600,視窗縮到最多 430 → 暫時 430,視窗恢復 → 600(U:74)。
- **使用者調整寬度 = 紀錄他當下看到的寬**:每次主動調整結束(拖曳放開,或鍵盤每按一下 ←/→/Home/End),紀錄 = 當下實際顯示的寬;超出限制的部分顯示不出來,所以不會被記(U:72)。**只點一下把手沒有拖**(放開點與按下點距離為 0)不算調整、不寫。依據:user D:6 原話「我認為應該要記住任何時候使用者resize的樣子,以此作為紀錄吧？使用者調整尺寸應該就是以此為主比較符合使用者的預期吧？」,AI 整理為 D:19。例:紀錄 600、目前最多 430、往外拖卡在 430 → 紀錄變 430,視窗恢復仍是 430。
- **系統自動校正(視窗變化、重新排版)從不寫紀錄**(U:71、D:19)。判斷「拖過沒有」看放開點與按下點的距離,不數 pointermove(`AGENTS.md`「失敗記憶索引」拖曳 vs 點擊)。
- 拖並排面板:寬度差**只由 Main 吸收**,其他面板的寬度與可拉上限不變;拖浮層:並排區域不受影響(U:75)。
- 寬度跨重新整理:DS 不存,放開時通知產品、由產品自存(沿用 AgentPanel `onWidthCommit` 的現行分工,四區同一條)。

### 8. 水平捲動

Main 與已決定並排面板的最小寬(+ 細列)合計超過視窗寬 → 各自維持最小寬,**整個殼水平捲動**;捲動延伸出的空間**不**增加判斷並排時的可用寬(U:27)。Main 永遠不被壓到最小寬以下(U:5)。
- 捲動住在 AppShell 根節點裡唯一一層捲動容器(水平可捲、垂直不捲;根節點本身不捲,是浮層與遮罩的定位基準);body 不捲;垂直捲動照舊在各區自己裡面 —— 不會出現兩條垂直捲軸(AI 推導,見下方「Main slot」捲動歸屬)。浮層與遮罩釘在看得到的視窗範圍,不跟著捲走(AI 推導:浮層上限以視窗寬計,U:59)。
- **使用者要求的 Right 一定端到眼前**(AI 推導,依原則 D:31;user 規格沒寫):Right 放不下仍並排,殼水平捲時新開的 Right 可能落在看得到的範圍右邊、只露出一截(連 × 都看不到)。所以使用者**主動要求** Right 顯示內容(打開它、`requestAside`;第 4 點)之後,若它沒有整個在看得到的範圍裡,AppShell 把自己的捲動容器捲到 Right 整個看得到(右緣對齊看得到的右緣;只捲 AppShell 的捲動容器,不連帶捲頁面)。視窗變化、內容自己變不算要求,不捲。機械閘 `scripts/app-shell-layout-invariant.mjs` S19(800、只開 Menu,按「顯示詳情」→ Right 右緣 ≤ 視窗右緣)。
- **消費者指引**(user D:8 原話「消費者在設定各個元素的最小寬度時,其實應該盡量設定得讓水平捲軸在 desktop web 幾乎不會出現」):照本節規則,只有「Right 放不下仍並排」與「視窗比 Main 最小寬(+ 細列)還窄」兩種情況會捲(AI agent、Menu 放不下時變浮層或暫藏,不會撐出捲動),所以只要 **Main 最小寬 + 細列寬 + 每一種 Right 內容的最小寬 ≤ 產品要支援的最窄 desktop 版面寬**,就不會捲(AI 由規則推導)。例:user 例子 Main 600 + Right 250 → 版面寬 < 850 才會捲。

### 9. 浮層(Menu 左側浮層、AI agent 右側浮層)

- 浮層獨立計算寬度、**不佔並排空間**(U:53);可拖曳調寬,另一側至少保留 48px(U:55)= `--layout-space-viewport-inset`(`../../tokens/layoutSpace/layoutSpace.spec.md`,與 Dialog 同一顆,不新造)。
- 可拖範圍:最小寬 ~ min(設定最大寬, 視窗寬 − 48)(U:56-59)。視窗 − 48 連最小寬都放不下 → 優先保留留白,暫時顯示「視窗 − 48」、不改紀錄;例:視窗 320、最小 300 → 272(U:61-62)。此時把手照常顯示、拖不動(AI 推導:U:55 浮層可拖 → 把手照常;U:56-61 的範圍只剩一個值 → 拖不動)。
- 位置(規格沒寫,沿用 DS 既有):AI agent 浮層貼右、上下貼齊 AppShell 根節點(沿用 2026-10-14 前「上下右貼齊容器」,容器 = 根節點;`primary-header` 時也蓋住 globalHeader),入口鈕的家在根節點右下(AI 推導)。Menu 浮層從版面左緣開始、蓋住細列(DS 的細列就是收起來的 Menu,圖示中心不跳;浮層與被蓋住的細列畫的是同一份 Menu 內容,兩份共用選取與群組展開狀態 —— `../Sidebar/sidebar.spec.md`「同一份內容、畫兩份」,機械閘 `scripts/app-shell-layout-invariant.mjs` S20);垂直方向沿用 Sidebar 現行的 Sheet 抽屜 —— 從視窗頂端起,`primary-header` 時**蓋住 globalHeader**,品牌與帳號照上方兩條「浮層精修」鏡像進浮層頂排(user 以 D:10 核准的 D:30 舊設計清單 #23 / #111:觸發條件改成「Menu 是浮層」,規則內容不變)。開關(Pattern A 在 Main 頁首最左、Pattern B 在 globalHeader 最左)會被 Menu 浮層蓋住 —— 收回用 Esc、點浮層外或 ⌘B。
- 遮罩與關閉(規格沒寫,沿用 DS 既有):AI agent 浮層底下鋪並存遮罩、點遮罩關閉 AI agent、底下其餘區域不可操作(`../AgentPanel/agent-panel.spec.md`);Menu 浮層沿用 Sidebar 現行的 Sheet 承載,點外面或 Esc 收回暫藏(第 3 點)。
- **疊在 AI agent 浮層上面的層照樣能操作**(AI 推導,依 D:27 與層級表):AI agent 浮層讓底下的宿主不能操作(遮罩 + inert),但「底下」只指層級表上比它低的 —— 視窗變窄、AI agent 變浮層的那一刻已經開著的 Menu 浮層、確認框(第 6 列 `z-50`)畫在它上面,不是被蓋住的宿主,照樣可點、可聚焦(2026-10-14 審查抓到:原本連它們一起 inert,畫在最上面卻點不到、焦點掉到 body)。並存 modal(第 4 列 `z-40`)照舊在它底下、暫時不能操作。判定住 `../AgentPanel/agent-panel.tsx` `openLayersAbove`;機械閘 `scripts/app-shell-layout-invariant.mjs` S17、S18。
- **浮層可以同時存在多個**,沒有「同時只能一個」(user U:81 問句;AI 建議,D:27 核准;DS 本來就允許疊,`../Dialog/dialog.spec.md` 確認框可疊在 Dialog 上)。誰在上面照 `../../tokens/elevation/elevation.spec.md`「疊放順序」:AI agent 浮層第 5 列、Menu 浮層(Sheet)第 6 列;同一列時後掛上的在上。D:27 括號「後開的在上」是 AI 整理時對層級表的簡述(AI 原提案是「照 DS 現有層級」,D:30 清單保留項 K3 寫明 Menu 浮層 z-50 蓋在 AI agent 浮層上):AppShell 裡兩者並存時,AI agent 一定先開著(並排或浮層),Menu 浮層後叫出(AI agent 浮層讓底下不能點、只剩 ⌘B;Menu 浮層是 modal Sheet,開著時點不到 AI agent 入口鈕,AI agent 也沒有快捷鍵),所以後開的 Menu 浮層在上,兩種說法結果相同;若產品在 Menu 浮層開著時用程式打開 AI agent,照層級表 Menu 浮層仍在上(AI 推導)。

### 10. 鍵盤、焦點、展開狀態

| 項目 | 規則 | 出處 |
|---|---|---|
| ⌘B / Ctrl+B | = 按 Menu 開關(第 3 點) | `../Sidebar/sidebar.spec.md`「持久化與快捷鍵」 |
| ⌘. / Ctrl+. | = 按 Right panel 開關;打開算「主動要求」,走第 4 點 | 下方「Keyboard shortcuts」;AI 推導 |
| Esc,焦點在 AI agent 裡 | 一次只關一層:裡面開著選單 / 歷史浮層 / 確認框先關那個;沒有了,**浮層**的 AI agent 關閉(= ×,開關紀錄變關,對話與草稿保留);**並排**的永遠不因 Esc 關閉 | AI 建議,D:22 核准;細節 `../AgentPanel/agent-panel.spec.md`「Esc 與關閉語意」 |
| Esc,焦點在 Menu 浮層 | 收回暫藏 | AI 建議,D:26 核准 |
| 拖曳把手的鍵盤 | ←/→ 每步 16、Home / End;每按一下 = 一次調整(第 7 點) | `../../patterns/resize-handle/resize-handle.spec.md`「a11y」 |
| 把手上按 Enter 收合 / 還原 | 本次不做:DS 既有缺口,記待辦總帳 Q5 | AI 建議,D:29 核准 |
| 焦點所在的面板被版面暫藏、被第 4 點連帶關閉、或因「從 AI agent 導向 Main」收起 | 回 `#app-shell-main`(焦點已經被別的東西接走時不搶 —— 例:導向的目標是 modal) | 沿用 DS 既有後備「開啟者不在了 → `#app-shell-main`」(`../../lib/overlay-focus-return.ts`,WCAG 2.4.3);延伸到「被版面收掉」是 AI 推導,在 D:30 清單(保留項 K7) |
| 開關鈕 `aria-expanded` | 跟畫面:展開的內容看得到(並排 / 浮層)= true;暫藏、關閉 = false;Menu 開關另帶 `aria-controls` 指向 Menu | AI 推導、在 D:30 清單(新增項 N15)(W3C APG Disclosure <https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/>) |

### 11. 算例(判定表逐格驗;設定 = Main 最小 600、Menu 200–240、Right 250–500、AI agent 350–700(U:36-39),初始寬 220 / 320 / 400 為 AI 假設,沒細列)

| 情境 | 結果 | 出處(判定表格) |
|---|---|---|
| 1100,最小 600 / 300 / 300,AI agent 開著時打開 Right | 合計 1200 > 1100 → 關閉 AI agent | U:12-13(U1) |
| 同上,兩者原本並排、只因視窗縮到 1100 | AI agent 改右側浮層,不關閉 | U:16(U3) |
| 1600、三個都開 | 上限 240 / 330 / 430;全拉滿時 Main 600 | U:35-49(U4) |
| 2200、三個都開 | 上限 240 / 500 / 700;Main 760 | U:50(U5) |
| 320、浮層最小 300 | 暫時 272,紀錄不變 | U:61-62(U7) |
| AI agent 設 600 → 縮到最多 430 → 恢復 | 430 → 600 | U:74(U8) |
| 同上,在 430 時往外拖(卡住)/ 只點一下不拖 | 紀錄變 430、恢復後仍 430 / 紀錄仍 600、恢復回 600 | D:6、D:19(D1、D2) |
| 700、只開 Right | Right 250 並排、Main 600、殼水平捲 150 | U:23、U:27(U12) |
| 1440、三個都開 | 上限 213.33 / 263.33 / 363.33(不取整) | AI 推導(A1) |
| 1280、三個都開、AI agent 紀錄 600 | Menu 暫藏;Right 290、AI agent 390;Main 600 | AI 推導(A8) |
| 1100、三個都開、AI agent 紀錄 600 | Menu 並排 220、Right 275、AI agent 浮層 600、Main 605 | AI 推導(A2) |
| 1280、三個都開,把 Right 換成最小 400 的內容 | 1350 > 1280 → 關 AI agent;Menu 回並排;Right 440;換回原內容 AI agent 也不回來 | AI 推導(A3、U18) |
| 1600、Menu 關閉、細列 48 / 68 | Right 上限 426 / 416、AI agent 526 / 516 | D:24(D8、D9) |
| 1230、細列 48、最小 600 / 300 / 300,要求 Right | 600 + 48 + 300 + 300 = 1248 > 1230 → 關閉 AI agent | D:24(D10) |
| 1300、Right 與 AI agent 開、Menu 關閉,按 Menu 開關 | 直接出左側浮層;再按 → 暫藏;放到 1400 → 並排 | D:25、D:26(D13、D14) |
| 320 浮層 272 時拖(有位移),再放到 2200 | 紀錄 272;並排時夾到最近的合法寬 300 | AI 照 D:19 + U:70-71 推(A5) |

### 12. 不能用在 AppShell 的

- ❌ Menu 用 `collapsible="none"`(U:4「皆為可開關」;AI 建議,D:28 核准:AppShell 裡開發時警告;Sidebar 元件本身的 `none` 這次不刪)。
- ❌ 依固定視窗寬切換形態(768 / 960 / 1280)、Right panel 窄版 Sheet、AI agent「容器 − 48、不能拖」的蓋板、「面板 ≤ 視窗 50% / 舞台 3/5 / 容器 3/8」比例上限(D:30;全部被本節取代)。

### Right panel(`<AppShellAside>`)

- 只有並排一種形態(第 3 點)。`primary-sidebar`:右側頂天立地(同 Sidebar 對稱);`primary-header`:在 Header 下方(不 underlap header,跟 sidebar 同高)。
- 寬度 = 內容類型的最小 / 初始 / 最大(第 1 點),可拖寬(左緣 `ResizeHandle`)。`title` 必填 → `<aside aria-label>`。
- **Scroll ownership**:Aside 自帶 scroll(body 包 `<ScrollArea>` primitive + `min-h-0`,per Atlassian Layout 慣例 <https://atlassian.design/components/navigation-system>),body 不捲。
- 開啟者不在了(焦點還原時)→ 後備 `#app-shell-main`(全 DS 一支 `../../lib/overlay-focus-return.ts`,WCAG 2.4.3)。

---

## Main slot

**`<main>` landmark + padding=0**。AppShell.Main 是空殼 layout primitive,**不發明任何內距規則**。

Main 內塞什麼(table / field / card / page header / list)的 layout + spacing → **完全遵循 `layoutSpace.spec.md` 既有 6 條規則 + 親疏 3 級**:
- 規則 1:水平 padding(3 patterns 並存 — bounded surface 自帶 / 純 layout 父層管 / list item 自帶)
- 規則 2:頂部(Header → 第一個元素的 gap)
- 規則 3:元素間 gap(只看親疏)
- 規則 6:Chrome 表面水平 padding 統一 `loose`

**禁止**:AppShell.Main 強制 padding(會跟內部 DataTable / naked list 衝突 + 違反規則 1B「純 layout primitive 無邊界 → 父層管」)。

**Consumer examples**(per codex Layer B 建議補):
- Page header(`<DashboardHeader>` 類自帶 `px-loose` chrome)→ 直接 mount(規則 1A)
- Card / Panel(自帶 border + bg)→ wrap consumer 自加 `px-loose` 父層(規則 1B)
- DataTable(naked structure)→ consumer wrap `<div className="px-[var(--layout-space-loose)]">` 父層管(規則 1B)
- naked list(`.map()` 不包 wrapper)→ 每 item 自帶 `px-loose`(規則 1C)

**Scroll ownership**(per Atlassian Layout 慣例 <https://atlassian.design/components/navigation-system>):
- 垂直:Main 自帶 scroll(`overflow-y: auto` + `min-h-0`),Right panel / Menu / AI agent 各自帶 scroll;AppShell 根節點垂直不捲
- 水平:只在「版面規則」§8 的情況(最小寬合計超過視窗寬)由 **AppShell 根節點裡的捲動容器**水平捲動;Main 守最小寬,不再 `min-w-0` 被壓到 0(2026-10-14 前根節點一律 `overflow: hidden`)
- **禁止** body-level scroll(雙 scrollbar bug)

---

## Dialog / Sheet / Popover 互動(per user Q7 — 不是 AppShell scope)

- 所有 modal overlay(Dialog / Sheet / Popover / HoverCard)消費既有 `overlay-surface.spec.md` SSOT
- Mask 蓋整個 AppShell(包含 sidebar + header + aside + main)
- Z-index:AppShell shell root **不設 z-index**(`app-shell.tsx` root `<div>` 走正常 flow / stacking context,唯一 z-* 是 SkipToMain `focus:z-50`);AppShell 自己的浮層(Menu 浮層、AI agent 浮層)上下照「版面規則」§9;其餘 overlay 走既有 **`z-50` Tailwind utility**(`sheet.tsx` SheetOverlay / SheetContent `z-50` SSOT canonical,**不發明 `--z-overlay` token** — repo 內無此 token,Sheet 直接 `z-50`)
- AppShell **不** export `modalOpen` prop,overlay 自管 open / close state

---

## Keyboard shortcuts(消費既有 Sidebar SSOT)

| Shortcut | Action | Cite |
|---|---|---|
| **`⌘B`(macOS)/ `Ctrl+B`(Windows)** | Toggle sidebar | `sidebar.spec.md`「持久化與快捷鍵」SSOT(⌘B / Ctrl+B industry-standard,已內建,不該改);`sidebar.tsx` code key `"b"` |
| **`⌘.`(macOS)/ `Ctrl+.`(Windows)** | Toggle aside | Linear convention(新加) |
| **Skip-to-main link** | `Tab` 第一站 focus 「Skip to content」link → `main` | A11y WCAG 2.4.1 bypass blocks;對齊 Atlassian Layout skip-link |

**`⌘B`** 消費既有 Sidebar SSOT 機制(Sidebar 內建 `useEffect` + `window.addEventListener('keydown')`,AppShell **不重複 register**;住在 AppShell 裡的 `<Sidebar>` 把版面的開關處理登記回 `SidebarProvider`,所以 ⌘B 照「版面規則」§3 走)。**`⌘.`** 為 AppShell **自有** `window` keydown listener(`app-shell.tsx` AppShell 本體的 keydown effect,沿用相同 pattern 形態,但屬**新註冊**、非消費 Sidebar — 對齊上表「新加」標記)。此 AppShell 自有 listener 目前**未含** Sidebar handler 的 IME composition / input-textarea guard(打字時 `⌘.` 仍會觸發 — 已知 gap)。

---

## A11y landmark(對齊 W3C ARIA in HTML + Mantine 慣例)

| Slot | HTML landmark | Auto ARIA |
|---|---|---|
| `header`(`primary-header` mode) | `<header>` 只被 `<div>` 包覆(body-scoped)→ **`role="banner"`** implicit(global banner) | site-wide |
| `header`(`primary-sidebar` mode) | `<header>` 只被 `<div>` 包覆、與 `<main>` 是 sibling(非 main descendant)→ 同樣 body-scoped → **`role="banner"`** implicit | per W3C HTML-AAM:只有 `main/article/aside/nav/section` descendant 的 `<header>` 才 scope out banner;`<div>` ancestor 不會 |
| `sidebar` | **無自帶 landmark** — `<Sidebar>` 渲染 `<div>`(三 collapsible 分支皆然,per `sidebar.spec.md`「A11y 預設」)| consumer 需自行用 `<nav aria-label="Main">` 包住 `<Sidebar>` 才有 navigation landmark;AppShell / Sidebar 皆**不**自帶 `<nav>` / `role="navigation"` |
| `aside` | `<aside aria-label={title}>` | title required |
| `children`(main) | `<main>` | `role="main"`(implicit)+ skip-to-main 跳轉 anchor |
| skip link | `<nav aria-label="Skip links">` 包 skip-to-main `<a>`(2026-07-30 WM patch 收編:裸 `<a>` 落在所有 landmark 之外 → axe region violation)| `role="navigation"`(implicit;WebAIM skip-navigation idiom)|

**W3C ARIA in HTML banner rule(精準 quote)**:`<header>` element 在 `<body>` direct context = `role="banner"` implicit;若 `<header>` 是 `<main>` / `<nav>` / `<article>` / `<section>` / `<aside>` descendant,則 **NOT** banner role(W3C HTML AAM spec)。

**本 AppShell 對應落實**(ChromeHeader 三個分支皆 render `<header>`,per `chrome-header.tsx` 2026-05-20「`<div>` → `<header>`」註解):
- `primary-header` mode:`<header>` 被 `flex-shrink-0 <div>` 包覆(AppShell root flex-col 第一個 child,body-scoped)→ implicit banner role ✓
- `primary-sidebar` mode:`<header>` 被 `flex-shrink-0 <div>` 包覆、與 `<main>` 是 sibling(非 main descendant,body-scoped)→ **同樣得到 implicit banner role**。`<div>` wrapper 依 W3C HTML-AAM **不** scope out banner(只有 `main/article/aside/nav/section` 能)。

不發明新 ARIA,消費 HTML5 semantic + WAI-ARIA Landmark 標準 + W3C ARIA in HTML banner rule。

---

## Future extension(目前不定義)

**Multi-sidebar**(Notion / Linear 雙側欄派):**尚未實作**。目前 `sidebar` prop 僅 `React.ReactNode`(單一 slot,無 array signature、無取首位邏輯、無 dev warning)。未來若支援會擴充為 array,SSOT 放 `sidebar.spec.md`,不在本 composite(per user 2026-05-19「AppShell 不該 customize Sidebar」)。

**Footer**:不 expose slot(per user 2026-05-19「不用 footer」)。Web service 通常不用 footer,consumer 若需要自貼 Main 底。

**Banner / announcement bar**:不 expose slot,consumer 自貼 Main 頂(對齊 Notion / Linear banner consumer-managed convention)。

**Multi-tab / split view**:不 codify(per user 2026-05-19「不用」)。

**Print mode**:`@media print` 隱 sidebar + aside,只露 main(future)。

---

## Token consumption(0 新發明,全消費既有 SSOT)

| 用途 | Consume token / SSOT |
|---|---|
| Menu / Right panel / AI agent 寬度 | 依內容類型的最小 / 初始 / 最大(「版面規則」§1;產品沒設時 Menu 預設 `--sidebar-width-min` / `--sidebar-width`,`sidebar.spec.md`)|
| Menu 細列寬 | `--sidebar-width-icon`(`sidebar.spec.md`「尺寸規範」)|
| 浮層另一側留白 | `--layout-space-viewport-inset`(`tokens/layoutSpace/layoutSpace.spec.md`)|
| Header height | `--chrome-header-height`(`tokens/uiSize/uiSize.spec.md`)|
| Layout spacing | `layoutSpace` 全 family(`--layout-space-{tight,loose,bottom}`)|
| Z-index | shell root 不設 z-index;overlay 走 Sheet `z-50` Tailwind utility(`sheet.tsx` SheetOverlay / SheetContent,無 `--z-overlay` token)|
| Menu 浮層承載 | `sheet.spec.md` SSOT |
| Overlay | `overlay-surface.spec.md` SSOT |

**0 新 CSS variable**,per `packages/design-system/ds-canonical/rules/ui-development.md`「Token 命名 4 條硬規則」(不孤立發明)。

---

## Consumer 紀律

- ❌ 禁:`<AppShell>` 內 wrap 第二個 `<AppShell>`(nested shell 違反「整頁框架」單例性)
- ❌ 禁:`sidebar={<div>...</div>}`(應傳 `<Sidebar>` primitive,確保視覺 SSOT。raw-element slot 簽名(`sidebar={<div>}` / `header={<header>}` 等)由 `check_consumer_app_invariants.sh` Pattern 9 機械攔(P0,2026-06-12 加);TS 型別層仍收 ReactNode 不強制 — React 型別強制易被 wrapper 包一層繞過,世界級 shell 元件皆收 ReactNode;wrapper 包一層繞過的殘餘 case 靠 story 示範 + audit 把關。2026-06-10 user 拍板 2a:措辭「必」→「應」對齊 code 真實)
- ❌ 禁:`header={<header>...</header>}`(應傳 `<ChromeHeader>` 或消費 `header-canonical` 派生 header;同上 — Pattern 9 同攔 header raw-element,TS 型別層不強制)
- ❌ 禁:AppShell.Main 自加 padding(違反 layoutSpace 規則 1B)
- ❌ 禁:AppShell 的 Menu 用 `collapsible="none"`(「版面規則」§12)
- ✅ 應:各區最小寬照「版面規則」§8 消費者指引設定(Main 最小寬 + 細列 + 每種 Right 內容最小寬 ≤ 產品要支援的最窄 desktop 版面寬),讓水平捲軸在 desktop 幾乎不出現
- ❌ 禁:AppShellAside header 加第二行 / actions(header = 單行 title + close X,API typed `title: string` 結構鎖;說明文字歸 aside body — 2026-06-12 fork-drift 防線)
- ✅ 必:`layout` mode 在 product 啟動時固定,**不在 runtime 切換**(切換 = product 角色變動 = 應該重 mount app)

---

## 世界級對照

| DS | Slot 結構 | Layout mode | Aside 派 | 放不下時 |
|---|---|---|---|---|
| **Mantine AppShell** | Header / Navbar / Aside / Footer / Main | `default`(header 頂)/ `alt`(navbar 頂)| collapsable | breakpoint per slot |
| **Ant Layout** | Header / Sider / Content / Footer | 拼 building blocks 兩派並存 | 無 explicit Aside slot | Sider breakpoint |
| **Material 3** | (無 AppShell primitive)| — | Standard inline / Modal overlay drawer | standard ↔ modal 依視窗(<https://github.com/material-components/material-components-android/blob/master/docs/components/NavigationDrawer.md>) |
| **Atlassian Navigation System** | TopNav + SideNav + Layout(Beta) | TopNav-above-SideNav | — | — |
| **本 DS AppShell** | Menu + header + Main + Right panel + AI agent(無 footer 預設)| `primary-sidebar` / `primary-header` 對齊 Mantine 2 mode | Right panel 永遠並排 | 不用固定斷點:每次用各區最小寬現算 —— AI agent 變右側浮層、Menu 暫藏 / 左側浮層、仍放不下則殼水平捲(「版面規則」;user 2026-10-14 自訂) |

---

## 相關 spec(per codex Layer B 比稿修正 path/case)

- `components/Sidebar/sidebar.spec.md` — Menu 視覺 + 鍵盤 + 細列 + SidebarTrigger Pattern A/B SSOT(本 composite 必消費)
- `components/AgentPanel/agent-panel.spec.md` — AI agent 面板內容、遮罩、Esc 與關閉語意(形態與寬度歸本檔「版面規則」)
- `patterns/resize-handle/resize-handle.spec.md` — 四區拖寬把手
- `patterns/header-canonical/header-canonical.spec.md` — header 視覺契約 SSOT
- `patterns/overlay-surface/overlay-surface.spec.md` — overlay 上層 SSOT
- `components/Sheet/sheet.spec.md` — Menu 浮層承載(`z-50`)
- `tokens/elevation/elevation.spec.md` — 疊放順序(浮層上下)
- `tokens/layoutSpace/layoutSpace.spec.md` — Main 內 layout 6 條規則 SSOT
- `tokens/uiSize/uiSize.spec.md` — `--chrome-header-height` 等 size token

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `account-menu.spec.md`
- `agent-panel.spec.md`
- `dialog.spec.md`
- `header-canonical.spec.md`
- `resize-handle.spec.md`
- `sidebar.spec.md`
