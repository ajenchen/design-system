---
pattern: app-shell
family: composite  # 組合 sidebar+header+main+aside,非 Family 1-4 row element
scope: web service page-level layout primitive (sidebar + header + main + aside composition)
benchmark:
  - Mantine AppShell: https://mantine.dev/core/app-shell/ — 6-slot (Header/Navbar/Aside/Footer/Main) + layout="default|alt" mode
  - Ant Design Layout: https://ant.design/components/layout — Layout/Header/Sider/Content/Footer compound API
  - Material 3 Navigation Drawer: https://m3.material.io/components/navigation-drawer/overview — standard (persistent inline) vs modal (overlay with mask)
  - Atlassian Navigation System (Beta): https://atlassian.design/components/navigation-system — TopNav + SideNav + Layout
  - Linear / Notion / Figma — primary-sidebar mode reference(local toolbar header)
  - GitHub / Slack / Gmail — primary-header mode reference(global top bar)
---

<!-- @benchmark-cited: 2026-05-19 D5 cite — all design intent claims backed by frontmatter benchmark URLs. -->

# AppShell 設計原則

## 定位

**Web service 頁面層級的 layout primitive**——組合 `Sidebar` + `ChromeHeader` + `Aside` + main content 成完整 page shell,定義跨元件 composition + responsive + a11y landmark canonical。

**實作基礎**:自建 grid/flex layout(無 Radix primitive 對應)+ 消費既有 DS canonical(`Sidebar` / `header-canonical` / `Sheet` / `layoutSpace`)。對齊 Mantine AppShell compound API + Ant Layout slot 模式。

**Layout Family**:跨 family 的**整頁框架**,不屬 4-family 任一,但**所有 family 元件可塞進 main slot**。

**SSOT 邊界**:
- AppShell own:slot composition / layout mode / Aside inline-vs-modal mode / mobile breakpoint propagate
- **邊界狀態**:layout 殼,無自身互動狀態(disabled / loading / empty 不適用,slot 內容各自管;dark / density 隨 theme subtree);overlay open state 自管(見「Dialog / Sheet / Popover 互動」段)
- **不 own**:Sidebar 視覺(SSOT 在 `sidebar.spec.md`)/ Header 視覺(SSOT 在 `header-canonical.spec.md`)/ Sheet 視覺(SSOT 在 `sheet.spec.md`)/ Main 內 layout(SSOT 在 `layoutSpace.spec.md` 6 條規則)

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
  asideOpen={open}      onAsideOpenChange={setOpen}      // ⌘. / Ctrl+. toggle (本 AppShell own)
  sidebar={<Sidebar>...</Sidebar>}              // SSOT in components/Sidebar/sidebar.spec.md
  header={<ChromeHeader>...</ChromeHeader>}     // SSOT in patterns/header-canonical/header-canonical.spec.md
  aside={<AppShellAside title="Detail">...</AppShellAside>}   // 本 pattern own;modal mode 必 title(Sheet a11y)
>
  {children}    {/* <main> landmark, padding=0,內容遵循 layoutSpace 6 條規則 */}
</AppShell>
```

Sub-component:`<AppShellAside title={...} width={400}>`(width consumer 自決 — `number` 或 `{ md, xl }` breakpoint-keyed,clamp `min-width: 240` / `max-width: 640`;**title prop required**,modal mode 走 Sheet → `aria-labelledby` 強制,per `sheet.spec.md`「禁止事項」(無 title → aria-labelledby 強制))。

### Hook export:`useAppShell()`(2026-05-21 D2 codify per Phase B codex catch)

Public compound API hook,讓 consumer 自拼 custom aside / 自管 modal layout(對齊 Radix `useDialogContext` / MUI `useFormControl` / Mantine `useAppShellContext` 慣例)。

```tsx
import { useAppShell } from '@/design-system/components/AppShell/app-shell'

function CustomAside() {
  const { asideOpen, setAsideOpen, isMobile } = useAppShell()
  // 自管 visibility / mobile sync,不必走預設 <AppShellAside>
}
```

**Contract**:
- 必在 `<AppShell>` 子樹內 call,否則 throw(consumer 拼 layout 必 wrap AppShell context)
- 回傳:`{ layout: 'primary-sidebar' | 'primary-header', asideOpen: boolean, setAsideOpen: (open: boolean) => void, isMobile: boolean }`(hook 回傳整個 context,consumer 拼 custom layout 可讀當前 `layout` mode)
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

**Responsive 精修(mobile-Sheet 子句,2026-06-18)**:「只能出現一次」= **同一時間一次,「一次」per breakpoint 判定**。Desktop(≥768px)brand 在 globalHeader、sidebar 內無 SidebarHeader。Mobile(<768px)sidebar 收成 Sheet(`sidebar.tsx` mobile 分支,z-50)打開時**蓋住 globalHeader** → brand 看不到、drawer 變孤兒 → 此時在 Sheet 內補 `<SidebarHeader><WorkspaceBrand/>`(globalHeader 既被蓋住,仍「同一時間一次」,非重複)。機制:consumer 讀既有 `useSidebar().isMobile`,mobile 才條件渲染**同一組 primitive**(style SSOT,與 primary-sidebar 外觀一致,非手刻對齊)。Reference:`_demo-helpers.tsx` `AcmeSidebar`(`includeWorkspaceBrand || isMobile`)。**禁止**:desktop primary-header 同時 globalHeader + SidebarHeader 放 brand(那才是真重複)。對齊 Material modal navigation drawer(手機 drawer 從 top app bar 開、蓋住內容、頂放品牌)+ Gmail / GitHub mobile 選單。

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

**Responsive 精修(mobile-Sheet 子句,per breakpoint;2026-06-18 修正為「鏡像自己桌面的帳號家」)**:mobile(<768px)sidebar 收成 Sheet 蓋住 globalHeader(桌面帳號入口也在 globalHeader 右)→ **帳號入口鏡像桌面位置搬進 Sheet header 右**:在 `<SidebarHeader>` 內放 `<WorkspaceBrand/>`(左)+ `flex-1` + `<AccountMenu/>`(右)= 把整條 globalHeader 原封搬進 Sheet 頂排(SidebarHeader 即 ChromeHeader 基底,與 GlobalHeader 同 primitive → 帳號 avatar 24px + 右緣距 `--layout-space-loose` 由 construction 保證,**非手刻對齊**)。**不在 Sheet 底放 `<SidebarFooter>`**(footer 是 primary-sidebar 的帳號家慣例;primary-header 任何 breakpoint 帳號家都在 header 區)。Consumer 讀 `useSidebar().isMobile` + `useAppShell().layout`(`headerHasAccount = layout === 'primary-header' && isMobile`),desktop 維持無 header/footer。對齊 Material modal navigation drawer 官方「account switcher 放 drawer header 區(與 logo 同區、pinned、最高優先),footer 區放 settings/support 次要項」(<https://m3.material.io/components/navigation-drawer>)+ Gmail / GitHub mobile 選單頂部帳號慣例。**為何不放 footer**:使用者開 Sheet 看到的頂排 = 原本被蓋住的 top bar(brand 左 / 帳號右),空間記憶不斷;把帳號丟到 footer = 誤套 primary-sidebar 慣例(那 mode 桌面帳號本就在底)。Reference:`_demo-helpers.tsx` `AcmeSidebar`。

**為什麼 primary-header 帳號入口在「右上」**:GitHub / Gmail / Slack / Atlassian 的全域標頭一律把「自己的帳號」放右上(品牌在左、帳號在右,左右對稱)= global chrome 標準位置,不是 sidebar footer。

**入口開什麼 = 帳號選單(`<DropdownMenu>`),不是 ProfileCard**:
- 開「個人資料 / 設定 / 登出」navigation 選單(對齊 GitHub / Gmail / Slack / Atlassian「自己的帳號入口」慣例)。
- **不用 `ProfileCard`**:ProfileCard 的預設動作(Chat / 通話)語義是「聯絡某人」,用在**自己**身上不對 — ProfileCard 是看**別人**的人員卡。自己的帳號入口 = 選單。
- 消費既有 `components/DropdownMenu`(`DropdownMenuTrigger asChild` 包 avatar 作 focusable 觸發點)。

**Avatar 尺寸 + 邊距**:帳號 avatar = `<Avatar size={24}>`(density-fixed,跟左側品牌 avatar 同尺寸),走 `../../patterns/header-canonical/header-canonical.spec.md` 4.5 chrome header avatar SSOT(brand + account 皆 24px raw Avatar、非 ItemAvatar)。右側邊距 = 作為 ChromeHeader 主內容區最後一個 child 自然繼承 `--layout-space-loose`(16px@md / 24px@lg),**與左側品牌 avatar 距 leadingRail 分割線的距離對稱**(ChromeHeader px-loose canonical 結構性保證,**禁 hardcode margin**)。

**Reference implementation**:`_demo-helpers.tsx` `AccountMenu`(帳號選單)+ `GlobalHeader`(右 slot 預設放 `<AccountMenu />`)。

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

## Aside 2-mode(對齊 Material 3 standard vs modal drawer canonical)

| Mode | Trigger | Mask 蓋背景? | Background operable? | 佔 layout 寬度? |
|---|---|---|---|---|
| **Standard inline**(對齊 Material 3 standard drawer) | viewport ≥ 768px(`useIsNarrowViewport()`,同 Sidebar mobile 切換) | ❌ 不蓋 | ✅ 可操作 | ✅ 佔 layout |
| **Modal overlay**(對齊 Material 3 modal drawer = Sheet pattern) | viewport < breakpoint | ✅ 蓋 | ❌ 不可操作 | ❌ 不佔(蓋上去) |

**Standard inline** 行為(layout-mode aware):
- `primary-sidebar` mode:右側 fix viewport 頂天立地(同 Sidebar 對稱)
- `primary-header` mode:右側 fix 在 **Header 下方**(不 underlap header,跟 sidebar 同高 — 都從 header 底邊起)
- Width consumer 自傳 `width` prop(`number` 或 `{ md, xl }` breakpoint-keyed),DS 不發明 width token,**clamp `min-width: 240` / `max-width: 640`** 避免過窄無法閱讀 / 過寬擠 main
- 跟 main 共享 layout space(main width = viewport - sidebar - aside)
- **Scroll ownership**:Aside 自帶 scroll(`overflow-y: auto` + `min-h-0`,per Atlassian Layout 慣例),main 自帶 scroll,**禁止** body-level scroll

**Modal overlay** 行為:
- 消費既有 `sheet.spec.md` canonical(從右滑出 + Esc 關 + click-outside 關 + focus trap + restore focus)
- **title prop required**(per `sheet.spec.md`「禁止事項」禁無 title — `aria-labelledby` 強制)
- 跟 Sidebar mobile fallback 同 SSOT

**Breakpoint**:消費既有 `useIsNarrowViewport()` hook(`hooks/use-is-narrow-viewport.ts`,`MOBILE_BREAKPOINT = 768`;與 `sidebar.spec.md`「Mobile 行為」段 768px 同值),**不發明新 breakpoint**(非 CSS token — repo 無 `--sidebar-mobile-breakpoint`)。Sidebar + Aside 同步切 Sheet。

---

## Mobile(viewport < breakpoint)

- **Sidebar**:消費既有 `sidebar.spec.md`「Mobile 行為」canonical(自動切 Sheet,從左滑出,寬度 `--sidebar-width-mobile`)
- **Aside**:同邏輯,切右 Sheet(複用 Sheet primitive,只方向相反)
- **Header**:始終可見(both mode);`primary-sidebar` 仍是 local toolbar / `primary-header` 仍是 global bar
- **AppShell 不重新發明 mobile**,沿用 Sidebar / Sheet 既有 canonical

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

**Scroll ownership**(per Atlassian Layout 慣例):
- Main 自帶 scroll(`overflow-y: auto` + `min-h-0`),Aside / Sidebar 各自帶 scroll
- **禁止** body-level scroll(雙 scrollbar bug),AppShell root `overflow: hidden`

---

## Dialog / Sheet / Popover 互動(per user Q7 — 不是 AppShell scope)

- 所有 modal overlay(Dialog / Sheet / Popover / HoverCard)消費既有 `overlay-surface.spec.md` SSOT
- Mask 蓋整個 AppShell(包含 sidebar + header + aside + main)
- Z-index:AppShell shell root **不設 z-index**(`app-shell.tsx` root `<div>` 走正常 flow / stacking context,唯一 z-* 是 SkipToMain `focus:z-50`);overlay 走既有 **`z-50` Tailwind utility**(`sheet.tsx` SheetOverlay / SheetContent `z-50` SSOT canonical,**不發明 `--z-overlay` token** — repo 內無此 token,Sheet 直接 `z-50`)
- AppShell **不** export `modalOpen` prop,overlay 自管 open / close state

---

## Keyboard shortcuts(消費既有 Sidebar SSOT)

| Shortcut | Action | Cite |
|---|---|---|
| **`⌘B`(macOS)/ `Ctrl+B`(Windows)** | Toggle sidebar | `sidebar.spec.md`「持久化與快捷鍵」SSOT(⌘B / Ctrl+B industry-standard,已內建,不該改);`sidebar.tsx` code key `"b"` |
| **`⌘.`(macOS)/ `Ctrl+.`(Windows)** | Toggle aside | Linear convention(新加) |
| **Skip-to-main link** | `Tab` 第一站 focus 「Skip to content」link → `main` | A11y WCAG 2.4.1 bypass blocks;對齊 Atlassian Layout skip-link |

兩者消費既有 Sidebar keyboard shortcut 機制(`useEffect` + `document.addEventListener('keydown')`),AppShell 不發明新機制。

---

## A11y landmark(對齊 W3C ARIA in HTML + Mantine 慣例)

| Slot | HTML landmark | Auto ARIA |
|---|---|---|
| `header`(`primary-header` mode) | `<header>` 只被 `<div>` 包覆(body-scoped)→ **`role="banner"`** implicit(global banner) | site-wide |
| `header`(`primary-sidebar` mode) | `<header>` 只被 `<div>` 包覆、與 `<main>` 是 sibling(非 main descendant)→ 同樣 body-scoped → **`role="banner"`** implicit | per W3C HTML-AAM:只有 `main/article/aside/nav/section` descendant 的 `<header>` 才 scope out banner;`<div>` ancestor 不會 |
| `sidebar` | **無自帶 landmark** — `<Sidebar>` 渲染 `<div>`(三 collapsible 分支皆然,per `sidebar.spec.md`「A11y 預設」)| consumer 需自行用 `<nav aria-label="Main">` 包住 `<Sidebar>` 才有 navigation landmark;AppShell / Sidebar 皆**不**自帶 `<nav>` / `role="navigation"` |
| `aside` | `<aside aria-label={title}>` | title required(modal mode `aria-labelledby` 強制) |
| `children`(main) | `<main>` | `role="main"`(implicit)+ skip-to-main 跳轉 anchor |

**W3C ARIA in HTML banner rule(精準 quote)**:`<header>` element 在 `<body>` direct context = `role="banner"` implicit;若 `<header>` 是 `<main>` / `<nav>` / `<article>` / `<section>` / `<aside>` descendant,則 **NOT** banner role(W3C HTML AAM spec)。

**本 AppShell 對應落實**(ChromeHeader 三個分支皆 render `<header>`,per `chrome-header.tsx` 2026-05-20「`<div>` → `<header>`」註解):
- `primary-header` mode:`<header>` 被 `flex-shrink-0 <div>` 包覆(AppShell root flex-col 第一個 child,body-scoped)→ implicit banner role ✓
- `primary-sidebar` mode:`<header>` 被 `flex-shrink-0 <div>` 包覆、與 `<main>` 是 sibling(非 main descendant,body-scoped)→ **同樣得到 implicit banner role**。`<div>` wrapper 依 W3C HTML-AAM **不** scope out banner(只有 `main/article/aside/nav/section` 能)。

不發明新 ARIA,消費 HTML5 semantic + WAI-ARIA Landmark 標準 + W3C ARIA in HTML banner rule。

---

## Future extension(目前不定義)

**Multi-sidebar**(Notion / Linear 雙側欄派):**尚未實作**。目前 `sidebar` prop 僅 `React.ReactNode`(單一 slot,無 array signature、無取首位邏輯、無 dev warning)。未來若支援會擴充為 array,SSOT 放 `sidebar.spec.md`,不在本 pattern(per user 2026-05-19「AppShell 不該 customize Sidebar」)。

**Footer**:不 expose slot(per user 2026-05-19「不用 footer」)。Web service 通常不用 footer,consumer 若需要自貼 Main 底。

**Banner / announcement bar**:不 expose slot,consumer 自貼 Main 頂(對齊 Notion / Linear banner consumer-managed convention)。

**Multi-tab / split view**:不 codify(per user 2026-05-19「不用」)。

**Print mode**:`@media print` 隱 sidebar + aside,只露 main(future)。

---

## Token consumption(0 新發明,全消費既有 SSOT)

| 用途 | Consume token / SSOT |
|---|---|
| Mobile breakpoint | `useIsNarrowViewport()` JS hook,768px(非 CSS token;`sidebar.spec.md`「Mobile 行為」段同值)|
| Sidebar width | `--sidebar-width`(`sidebar.spec.md`)|
| Header height | `--chrome-header-height`(`tokens/uiSize/uiSize.spec.md`)|
| Aside width | consumer 自傳 prop(無 token)|
| Layout spacing | `layoutSpace` 全 family(`--layout-space-{tight,loose,bottom}`)|
| Z-index | shell root 不設 z-index;overlay 走 Sheet `z-50` Tailwind utility(`sheet.tsx` SheetOverlay / SheetContent,無 `--z-overlay` token)|
| Sheet fallback | `sheet.spec.md` SSOT |
| Overlay | `overlay-surface.spec.md` SSOT |

**0 新 CSS variable**,per CLAUDE.md token 4 條硬規則(不孤立發明)。

---

## Consumer 紀律

- ❌ 禁:`<AppShell>` 內 wrap 第二個 `<AppShell>`(nested shell 違反「整頁框架」單例性)
- ❌ 禁:`sidebar={<div>...</div>}`(應傳 `<Sidebar>` primitive,確保視覺 SSOT。型別上收 ReactNode、不做機械強制 — React 型別強制易被 wrapper 包一層繞過,世界級 shell 元件皆收 ReactNode;本約定靠 story 示範 + audit 把關。2026-06-10 user 拍板 2a:措辭「必」→「應」對齊 code 真實)
- ❌ 禁:`header={<header>...</header>}`(應傳 `<ChromeHeader>` 或消費 `header-canonical` 派生 header;同上,型別不機械強制)
- ❌ 禁:AppShell.Main 自加 padding(違反 layoutSpace 規則 1B)
- ❌ 禁:AppShellAside header 加第二行 / actions(header = 單行 title + close X,API typed `title: string` 結構鎖;說明文字歸 aside body — 2026-06-12 fork-drift 防線)
- ✅ 必:`layout` mode 在 product 啟動時固定,**不在 runtime 切換**(切換 = product 角色變動 = 應該重 mount app)

---

## 世界級對照

| DS | Slot 結構 | Layout mode | Aside 派 | Mobile |
|---|---|---|---|---|
| **Mantine AppShell** | Header / Navbar / Aside / Footer / Main | `default`(header 頂)/ `alt`(navbar 頂)| collapsable | breakpoint per slot |
| **Ant Layout** | Header / Sider / Content / Footer | 拼 building blocks 兩派並存 | 無 explicit Aside slot | Sider breakpoint |
| **Material 3** | (無 AppShell primitive)| — | Standard inline / Modal overlay drawer | Standard → desktop / Modal → mobile |
| **Atlassian Navigation System** | TopNav + SideNav + Layout(Beta) | TopNav-above-SideNav | — | — |
| **本 DS AppShell** | sidebar + header + aside + main(無 footer 預設)| `primary-sidebar` / `primary-header` 對齊 Mantine 2 mode | Standard inline + Modal overlay 對齊 Material 3 | 消費既有 Sidebar / Sheet SSOT |

---

## 相關 spec(per codex Layer B 比稿修正 path/case)

- `components/Sidebar/sidebar.spec.md` — sidebar 視覺 + 鍵盤 + mobile + SidebarTrigger Pattern A/B SSOT(本 pattern 必消費)
- `patterns/header-canonical/header-canonical.spec.md` — header 視覺契約 SSOT
- `patterns/overlay-surface/overlay-surface.spec.md` — Aside modal mode 上層 SSOT
- `components/Sheet/sheet.spec.md` — modal fallback SSOT(`aria-labelledby` 強制 + `z-50`)
- `tokens/layoutSpace/layoutSpace.spec.md` — Main 內 layout 6 條規則 SSOT
- `tokens/uiSize/uiSize.spec.md` — `--chrome-header-height` 等 size token

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `header-canonical.spec.md`
- `sidebar.spec.md`
