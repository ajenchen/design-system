---
pattern: header-canonical
family: self-contained  # 跨元件 header 規則 SSOT,非 row element
scope: cross-component header anatomy + 設計原則(公開 Pattern,對標 item-anatomy)— chrome + overlay families
benchmark:
  - GitHub Primer PageHeader: https://primer.style/components/page-header/react — hasBorder auto-suppress when Navigation slot contains UnderlineNav
  - Ant Design Tabs: https://ant.design/components/tabs — "Large size tabs are usually used in page header, and small size could be used in Modal"
  - Material UI Tabs: https://mui.com/material-ui/react-tabs/ — Box wrapper draws border, Tabs itself does not (counter-pattern)
  - IBM Carbon Tabs: https://carbondesignsystem.com/components/tabs/usage — defining line is implementation team responsibility, not part of line tabs component
  - Material Design v1/v2 Tabs: https://m1.material.io/components/tabs.html — 48dp default height single size, 2dp indicator
  - Mantine Tabs: https://mantine.dev/core/tabs/ — default variant includes bottom border (self-contained)
---

# Header Canonical 設計原則

> **Foundational SSOT rationale**(cap 800):本 pattern 統一**所有 header 家族**(chrome page header + overlay header)的視覺契約 — border ownership / padding / 高度策略 / tabs 連動 / dismiss canonical。consumer(`SidebarHeader` / `FileViewer Toolbar+InfoPanel` / `AppShell PageHeader+GlobalHeader` / `DialogHeader` / `SheetHeader` / `PopoverHeader` / `CoachmarkHeader` / 未來 Drawer)pointer 指向本 SSOT,**禁各自 hardcode**。

## 選哪個 header(decision — 做任何 header 前先回答這題)

> 本段是「該用哪個 header」的單一決策入口(對標 `item-anatomy.spec.md` 的判斷流程,讓人 / AI 遇到任何 header 設計先走這裡、確認判斷正確才動)。**判準是「這個 header 坐在哪種 surface 上」,不是「長得像不像一條橫列」。**

**先問一題:這個 header 所在的 surface 是「常駐 app chrome」還是「浮層 overlay」?**

| 你的場景 | 用 | 家族 |
|---|---|---|
| **常駐 app chrome**:AppShell page top / global header、Sidebar header、FileViewer toolbar、固定在版面上的工具列 | **`<ChromeHeader>`**(`patterns/header-canonical/chrome-header`)| **B. Fixed-height** |
| **浮層 overlay 標題列**:Dialog / Sheet / Popover / Coachmark 等 overlay 頂部(多數用 `DialogHeader`/`SheetHeader`/`PopoverHeader` consumer wrapper,底層是 SurfaceHeader)| **`<SurfaceHeader>`**(`patterns/overlay-surface`)| **A. Padding-based** |
| 用一整排 **Tabs 直接「取代」整個 header**(無獨立標題列)| **standalone `<Tabs size="lg">`**(tab 高 = chrome-header-height,見 W3 C)| —(tabs 即 chrome)|

**何時不用(when NOT to use)— 最常見誤判**:
- ❌ **chrome 與 overlay 搞混**:看 surface 本身是常駐 chrome 還是浮層,不看視覺像不像。**邊界案例**:Sidebar 內彈出的 flyout / popover header = **overlay → SurfaceHeader**,不因為它長在 sidebar 裡就當 chrome。
- ❌ 純內容區小標題(section heading)→ 用 typography(`text-h6` 等),不是 header primitive
- ❌ 列表 row / menu item → 走 `item-anatomy`,不是 header
- ❌ 卡片內標題列 → Card 自己的 header 區,不套本 pattern

**機械防呆**(讓 AI 即使誤判也被擋):手刻 chrome header(`h-[var(--chrome-header-height)] border-b`)→ `_chrome_header_handcraft` 攔;手刻 overlay header(`px-loose + border-b border-divider` 簽名)→ `check_story_invariants.sh R9` BLOCKER。命名前綴(`chrome-` / `overlay`-surface)本身自帶 surface 語意,讀到名字即知用途。

## 定位

兩個 header 家族(實作 pattern 不同,**視覺契約相同**):

| Family | 實作 | Consumer | Spec home |
|---|---|---|---|
| **A. Padding-based**(overlay)| `py-[var(--layout-space-tight)]` + `data-unbounded` slot trick;高度由內容決定但對齊 `--chrome-header-height` | DialogHeader / SheetHeader / PopoverHeader / 未來 Drawer | `patterns/overlay-surface/overlay-surface.spec.md`(L1 SSOT)+ 本 spec(cross-family canonical) |
| **B. Fixed-height**(chrome)| `h-[var(--chrome-header-height)]` + `items-center`,剛性高度 | SidebarHeader / FileViewer Toolbar / FileViewer InfoPanel / Page top bar | `tokens/uiSize/uiSize.spec.md` L242(`Fixed-height` 段)+ 本 spec(cross-family canonical) |

**為什麼兩家族?** 因 overlay 內 slot 可能塞 multi-line content(`HoverCard` title + description)— 剛性高度會切掉。Chrome 家族 永遠 single-row(toolbar / nav)— 剛性高度給 layout 預測性。兩 pattern 並存(對齊 `tokens/uiSize/uiSize.spec.md` L240-260「Padding-based vs Fixed-h decision tree」)。

---

## 跨家族共同視覺契約(both A + B)

### 1. Border-bottom

- **Token**:`border-b border-divider`(1px / `--divider-color`)
- **Default**:有 border(分區效果)
- **Auto-suppress when withTabs**:見下「withTabs 連動」段

### 2. Horizontal padding

- **Token**:`px-[var(--layout-space-loose)]`(md=16px / lg=24px)
- **不可 override**:tabs / content / actions 所有 slot 統一靠齊此 padding

### 3. Vertical rhythm

- **A 家族**:`py-[var(--layout-space-tight)]`(md=12px / lg=16px)+ `data-unbounded` slot trick → 實際高度對齊 `--chrome-header-height`
- **B 家族**:`h-[var(--chrome-header-height)]`(md=48px / lg=56px)+ `items-center`

### 4. Dismiss icon button(close X)

- **Token**:`<Button iconOnly size="sm" dismiss />`(28px @ md / 32px @ lg)
- **永遠 size="sm"**(不論家族 / density):chrome / overlay header 內 button 一律 sm。**廣化(2026-06-12 user 拍板)**:header 內**所有 field-height 控件**(Button / Input / Select / SegmentedControl / Combobox 等)一律 `sm`,禁混雜不同 field height(Tabs 跟齊 chrome 高度,唯一例外 = 「Tabs 取代整個 header」的 standalone `size="lg"`,見上方表)
- 對齊 既有 `dialog.tsx:132-153` + `sheet.tsx:122-139` + `popover.tsx:87-110`(Dialog/Sheet/Popover 已內建 close X)

### 4.5 Chrome header avatar SSOT(2026-05-21 codify per user directive)

**Canonical**:Chrome header brand mark avatar = **24px,density-fixed,row-size-fixed**。

對齊 5 家世界級共識(Linear / Notion / Figma / Slack / Polaris chrome header brand mark 皆固定 24px,不 density-scale 也不 row-size-scale)。設計理由:avatar 是品牌識別 mark,視覺穩定優於 density 緊鬆 / row size 調整(button 跟 density 走 touch target 邏輯,avatar 不該綁同邏輯)。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**Chrome header 不是 row context**:無 sm/md/lg row size lookup 需求 → chrome header 內 avatar 用 **raw `<Avatar size={24}>`**,**不用 `<ItemAvatar>`**(後者是 row primitive anatomy helper,scope 是 row context — 詳 `item-anatomy.spec.md`「Scope 例外:Chrome header 不是 row context」段)。

**程式表達**(local pattern token,對齊 `data-table.css` 既有 local-token 先例):
- CSS:`--chrome-header-avatar-size: 1.5rem`(`header-canonical.css`)— 供 SidebarHeader 收合對齊公式消費
- JS 端:consumer hardcode `<Avatar size={24}>` + inline comment cite token name(per Avatar API `size: number | 'fill'` 不接 CSS var)

**Consumer rule**:
- 在 chrome header 內放 avatar → **必用 raw `<Avatar size={24}>`**,**禁用 `<ItemAvatar>`**(會誤啟動 row anatomy lookup)
- SidebarHeader 收合對齊公式必消費 `var(--chrome-header-avatar-size)`,**禁** hardcode 24
- WorkspaceBrand demo 即此 pattern 的 reference implementation(`components/AppShell/_demo-helpers.tsx:WorkspaceBrand`)

**Sync invariant**:`--chrome-header-avatar-size` CSS 值 + `<Avatar size={24}>` JS literal + `AVATAR_SIZE.inline.md = 24`(`item-anatomy.tsx:94`,L93 是 `export const AVATAR_SIZE = {` 宣告開頭)三者必同 24px 值。改 spec canonical 時 grep `--chrome-header-avatar-size` + `chrome header avatar canonical` keyword 找全 sync 點。

### 5. Title typography

- `text-body-lg font-medium` 或 `text-h6`(細節由 family spec 自決)

### 6. Background ownership(2026-05-20 codify per user directive,SSOT)

**核心原則**:Header 自身**不該畫 bg**。bg 永遠屬於「header 所在 surface 層」的職責。違反 = 顏色疊加 / drift / 跨 consumer 視覺不一致(user 2026-05-20 抓 aside header bg-surface 疊在 aside bg-surface 上)。

**3 場景分類**:

| 場景 | Header bg | Parent surface | Rationale |
|---|---|---|---|
| **Top-level chrome header**(直接坐 canvas 上,如 PageHeader / app top bar)| **自畫 `bg-surface`**(consumer 透過 `className="bg-surface"` 注入 ChromeHeader)| Main content 是 `bg-canvas`,header 本身就是 chrome region marker 必須區分 work area | `<ChromeHeader className="bg-surface">` |
| **Nested chrome header**(parent 已是 chrome region:SidebarHeader / AsideHeader / FileViewer InfoPanel)| **transparent**(不傳 bg className,繼承 parent)| Sidebar / Aside 自身已 `bg-surface`,header 再畫 = 同色疊加(理論透明)但給 dark mode 半透明變體留 drift 風險 | `<ChromeHeader>`(無 bg className)|
| **Overlay header**(Dialog / Sheet / Popover)| **transparent** | Overlay 自身 `bg-surface-raised`,header 透明繼承 | `<SurfaceHeader>`(SurfaceHeader 內無 bg) |

**反 pattern 錨例**(2026-05-20 修正):
- `app-shell.tsx:268` aside built-in header `bg-surface` 疊在 aside `bg-surface`(規則 6 nested case 違反)→ 撤回
- `_demo-helpers.tsx:131` PageHeader 自刻 `<header>` + `bg-surface` → migrate 消費 ChromeHeader + 保 `bg-surface`(top-level 合法)
- `sidebar.stories.tsx:113` Sidebar IconCollapse demo 自刻 header + `bg-surface` → 後續一併 migrate(同 PageHeader 路徑)

### 7. Element contract(實作層,2026-05-20)

ChromeHeader 內部用 `<header>` element(非 `<div>`)。HTML5 spec 允許 sectional content 多次 `<header>`(`role="banner"` 只 page top 一個,sectional 內 default `<header>` 不自動有 banner role)。統一 element contract 消除「何時用 header / 何時用 div」consumer drift。(與規則 6 背景所有權是兩個層級:6 是設計原則,本條是 code contract。)

---

## withTabs 連動(本 SSOT 最核心契約)

當 header 內含 Tabs(`<Tabs>` 子元件)時,**6 條 lockstep 規則**:

### Rule W1:Border ownership = semantic vs paint 拆分(對齊 GitHub Primer)

**規則**:**Header 是 semantic owner**(「這 surface 需要 bottom border 分區」是 header 的概念決定),**Paint owner 隨 state 變**:
- `withTabs={false}` → header 自畫(`border-b border-divider`)
- `withTabs={true}` → header **auto-suppress 自己的 paint**,**TabsList 自身的 `border-b border-divider` 接管實際 paint**(視覺同一條線;`TABS_LIST_BASE` tabs.tsx:116 用 `border-divider` neutral-4,同 Dialog/Sheet/Popover/Sidebar header)

**這不是 reject user 直覺**(「border 該由 header 自己畫」)— 而是把「誰負責這條線存在」和「誰實際 paint」拆開。User 直覺 = semantic ownership 正確;DS 實作 = withTabs 時 delegate paint 給 TabsList,因為 tabs selected underline 是「從 1px gray border 長出 2px primary」設計 idiom(`tabs.spec.md:185-187`),paint owner 不在 tabs 會讓 underline 失去 base line。

**世界級對照**:
- GitHub Primer PageHeader verbatim:「`hasBorder` defaults true,**but border NOT rendered if Navigation child contains UnderlineNav**;UnderlineNav itself provides bottom border」(`primer.style/components/page-header/react`)
- 我們既有 spec:`tabs.spec.md` 「出現在 Dialog / Sidebar / 任何 header」段「Consumer 把 Tabs 放在 header 區域內、移除 header 自己的 `border-b`,讓 Tabs 接管」
- 我們既有禁止:`tabs.spec.md`「禁止事項」段「Dialog / Sidebar header 內不得同時有 header `border-b` 和 TabsList `border-b`——會出現雙線」

**Counter-pattern(reject)**:Material UI 走「container 畫 border + tabs 不畫」(`<Box sx={{ borderBottom: 1 }}><Tabs>...</Tabs></Box>`)— 本 DS reject 此方向,理由:tabs underline 需 base line(MUI 2px indicator 浮空是另一派視覺語言,跨派遷移成本高且既有 spec 已 codify Primer 派)。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

### Rule W2:Tabs 水平 padding 對齊 header(by inheritance,不重複設)

**規則**:TabsList **不設自己的左右 padding**,**繼承** parent header 的 `var(--layout-space-loose)` padding。視覺結果 = tabs 第一個 trigger 從 header 內邊起 = 跟 header content row 對齊。

**實作機制(2026-05-18 v3 — `tabsSlot` prop,user verbatim「分隔線寬度應該要填滿整個 dialog」)**:

ChromeHeader / SurfaceHeader 新增 `tabsSlot?: ReactNode` prop。提供時自動 **column mode**:
- Row 1:children(title + close X / actions)— 跟 single-row 模式同 padding,但 border-b 撤掉
- Row 2:tabsSlot 包在 `<div className="[&>[role=tablist]]:w-full [&>[role=tablist]]:px-[var(--layout-space-loose)]">`(wrapper 本身**不** inset,只用 CSS arbitrary variant 給 TabsList 注入 `w-full` + 內 padding)
  - **TabsList 全 dialog 寬**(`w-full`)→ 自身 `border-b border-divider` 延展全 dialog 寬 = W1 視覺一條線
  - **TabsList 內 padding-x = px-loose** → triggers 從 px-loose 內邊起,對齊 header content row(W2 alignment 達成)
  - Selected trigger 2px primary 真 overlay TabsList 1px gray border(`tabs.spec.md:187-189` canonical)

**v1/v2 反 pattern**(歷史錨):
- v1(2026-05-18 initial):wrapper 加 `border-b border-divider` + TabsList 自身 `border-b border-border` 共存 → 雙線(色不同 + 1px box gap)
- v2(2026-05-18 mid):wrapper px-loose + TabsList w-full inside → border 只跨 dialog - 2×px-loose(沒到 dialog 邊)
- v3(本):wrapper 不 inset,TabsList 自己 padding inset triggers + 全 dialog 寬 border ✓

**W2 spec 註**:原 W2「TabsList 不設左右 padding,繼承 parent header padding」描述假設 ChromeHeader single-row 模式;**column mode 下實作機制改為 CSS arbitrary variant 注入 TabsList 內 padding**(不是 by-inheritance 從 wrapper)。Selected primary overlay full-width gray 共識(GitHub Primer UnderlineNav / Ant Design line type / Mantine default)需要 TabsList 自畫 full-width border。

**Consumer 用法**(Dialog 範例):
```tsx
<Tabs defaultValue="general">           {/* Radix Tabs root,wrap 整 DialogContent */}
  <DialogHeader
    tabsSlot={
      <TabsList>
        <TabsTrigger value="general">一般</TabsTrigger>
        <TabsTrigger value="members">成員</TabsTrigger>
      </TabsList>
    }
  >
    <DialogTitle>專案設定</DialogTitle>
  </DialogHeader>
  <DialogBody>                          {/* DialogBody 自管 px-loose + scroll */}
    <TabsContent value="general">一般設定內容</TabsContent>
    <TabsContent value="members">成員管理內容</TabsContent>
  </DialogBody>
</Tabs>
```

**禁忌**:
- ❌ 把 `<Tabs>` 放在 `<DialogContent>` 外(Radix TabsList ↔ TabsContent 必同 Tabs root)
- ❌ 在 TabsList 上加 `className="px-*"`(會與 wrapper padding 疊加)
- ❌ 在 TabsContent 上加 padding(會跟 DialogBody canonical px-loose pt-tight pb-bottom 重複)
- ❌ Backward-compat `withTabs={true}` 無 tabsSlot 場景:header 自己抑制 border-b,但 consumer 需自管 Tabs row layout — 不推薦(除非從 layout template 來)

**Verify**:write-time 由 `chrome_header_dispatcher.sh` 經 lib helper(`_tab_lg_chrome_header_equal.sh` + `_header_with_tabs_border.sh`,2026-05-31 升 exit 2 BLOCK)把關;pixel-quantified visual probe 走 `/visual-audit --scope=changed`(無專屬 runtime-verify script)。

**Rationale**:對齊 Carbon verbatim「first label should always align to other content in the space」(`carbondesignsystem.com/components/tabs/usage`)。「by inheritance 不重複設」是 GitHub Primer + Material UI 隱含 idiom — tabs container 不主動畫 padding,讓外層 container 統一管。

### Rule W3:Tabs size 與 header family 對應

| Header family | Tabs size | Rationale |
|---|---|---|
| **A. Overlay header(Padding-based)** | `sm`(32/40)| 對齊 Ant verbatim「small size could be used in Modal」;overlay 內 close X 也是 sm 統一 | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
| **B. Chrome header(Fixed-h)** | `sm`(32/40)| chrome 內 buttons 全部 sm(real grep:`Sidebar / FileViewer toolbar / InfoPanel` 所有 buttons size=sm),tabs 跟齊 |
| **C. Standalone(tabs 取代 chrome header)** | `lg`(48/56)| Tabs 直接取代 header 用,**tab 高 = chrome-header-height 像素相等**(48/56)— Ant verbatim「Large size tabs are usually used in page header」 | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**Token alignment 強連動**:`--tab-height-lg` md=48 / lg=56 與 `--chrome-header-height` md=48 / lg=56 **像素完全相等**(皆定義於 `uiSize.css`:`--chrome-header-height` L50/L98、`--tab-height-lg` 同檔;`globals.css` 僅 21 行 aggregator,不定義此 token)— 這是「lg tabs 取代 chrome header」的 SSOT linkage 鐵證。**禁止任何一方獨自調整**(動 chrome-header-height 必同步 tab-height-lg,反之同)。

**Enforcement = assert,不 CSS alias**(per M31 codex 比稿 Step 5):`uiSize.css` 的 `--tab-height-*` 有 `data-ui-size="md"` reset selector(component-size scope),`--chrome-header-height` 是 layout/density token(app-chrome scope)— alias 會把兩個不同 scope 綁死。**機制**:保留 duplicated literals + `chrome_header_dispatcher.sh` → `lib/_tab_lg_chrome_header_equal.sh`(2026-05-31 升 exit 2 BLOCK)parse CSS 提取 md/lg 值 assert equality → 任一方獨自改 = BLOCKER。

### Rule W4:Tabs row 與 header content row 為 flush stack(無 negative margin)

**規則**:有 tabs 的 header,header content row(title + actions)在上 / tabs row 在下,中間 **gap = 0**,直接疊。

**Rationale**:negative margin chain 會破 M25「Layered chain invariant 必整鏈 forward」— 任何 ancestor 改動 padding/height 都會讓 negative margin 視覺漂移。改用 flush stack(`<div className="flex flex-col">`)— 兩 row 各自管自己 vertical rhythm,zero coupling。

**世界級對照**:GitHub Primer PageHeader + UnderlineNav 採 flush stack(無 negative margin)— UnderlineNav 直接 append PageHeader 下方,border 由 UnderlineNav 接管。

### Rule W5:md tabs size 為 future tier,目前無 use case

**規則**:`--tab-height-md`(40/48)token **保留**,但**目前無 recommended use case**;新 consumer 想用 md 必先諮詢 DS owner 取得 use case rationale。

**Rationale**:
- Header 內 tabs 對應 button-sm → tabs sm(W3 已 cover)
- 獨立 chrome-replacement tabs → tabs lg(W3 已 cover)
- 中間階梯(md=40)無清楚場景 — 多家世界級 DS(Material / MUI / Primer / Polaris)只有 1 個 default size(無 sm/md/lg 階梯)= sweet spot 只需 2 tier <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**Conservative path**:token 不刪(避免 breaking change 與 stories 維護成本);spec 明寫 future tier。

### Rule W6:Default tabs size 為 sm(已 land)

**規則**:Tabs `cva defaultVariants.size = 'sm'` — **已 land**(`tabs.tsx:135` TabsList param `size = 'sm'` + `:394` trigger cva `defaultVariants.size = 'sm'`,inline comment「2026-05-17 從 'md' 改 'sm'」)。

**邊界 — tabs 超寬溢出**:header 內 TabsList 溢出處理走 `components/Tabs/tabs.spec.md`「Overflow 模式」(`TabsList` `overflow` prop:none / scroll / menu),非本 SSOT scope。

**Rationale**:overlay / chrome / dense toolbar 用 sm(tab 高 32/40)對齊 Ant「small size could be used in Modal」。production consumer 主要在 stories;cva default 改 sm 已過 visual baseline diff merge。

---

## 連動機制(防漂移 SSOT)

### Layer 1 — Token shared

兩家族 consume 同組 CSS variable(機械對齊):
- `--chrome-header-height`(uiSize.css:50,98)
- `--layout-space-loose` / `--layout-space-tight`
- `--divider-color`
- `--tab-height-sm` / `--tab-height-lg`(uiSize.css:36-38 md default + 94-96 lg-density override)
- `--field-height-sm`(button sm 透過 button family 連動)

### Layer 2 — Spec pointer

6 consumer spec.md 在 Header 段加 pointer:
- `components/Sidebar/sidebar.spec.md`
- `components/FileViewer/file-viewer.spec.md`(Toolbar + InfoPanel 兩處 header)
- `components/Dialog/dialog.spec.md`
- `components/Sheet/sheet.spec.md`
- `components/Popover/popover.spec.md`
- `tokens/uiSize/uiSize.spec.md`「消費 --chrome-header-height」段

### Layer 3 — Primitive consumption(Phase 2,等 user 拍板)

- A 家族:`SurfaceHeader` 已是 primitive(`overlay-surface.tsx:62-118`)— add `withTabs?: boolean` prop auto-suppress border
- B 家族:**新建 `ChromeHeader` primitive**(`patterns/header-canonical/chrome-header.tsx`)— Sidebar / FileViewer / InfoPanel 全 migrate

**ChromeHeader API(per M31 codex 比稿 Step 5 — 比 v1 更窄,避免 M21 prop variant 風險)**:
```tsx
<ChromeHeader
  withTabs?: boolean              // false (default) | true → auto-suppress border + delegate to TabsList
  tabsSlot?: ReactNode            // Tabs row(column mode + W1-W6 lockstep,2026-05-18 ship)
  lockDensity?: 'inherit' | 'lg'  // 'inherit' (default) | 'lg' → 強制 chrome-header-height lg=56(viewer 等 fullscreen chrome)
  leadingRail?: ReactNode         // 2026-05-21 ship per AppShell primary-header globalHeader:固定 width=sidebar-width-icon 的左 rail,內 justify-center 排列(toggle/logo 跟 sidebar 收合 icon center x 對齊)。對齊 GitHub global nav 左 logo 區 / Slack thin workspace rail 慣例。
>
  {children}
</ChromeHeader>
```

**不開**:`density?: 'md'|'lg'` 自由 prop(M21 違反 — 任意 density 等於 cva-on-pattern,該由 density context 決定)。`lockDensity="lg"` 是 escape hatch 給 fullscreen viewer chrome(FileViewer 永遠 lg-equivalent design intent),其餘 consumer 走 `inherit`(跟 page density)。**Grep evidence**(historical 錨,migration 已完成):migration 前 `Sidebar` + `FileViewer Toolbar/InfoPanel` 各自手刻同一 signature `flex items-center gap-2 shrink-0 h-[var(--chrome-header-height)] border-b border-divider px-[var(--layout-space-loose)]`(production 重複 contract,非 premature abstraction)→ 過 M21 prop variant test 3 條(`<Sidebar>` 等近親 grep / 3 家世界級 page-header primitive / value 結構不同)→ 抽成本 primitive。**現況**:全部已消費 `<ChromeHeader>`(`sidebar.tsx:479` / `file-viewer.tsx:328` Toolbar + `:459` InfoPanel),grep 全 repo 已無此手刻 signature(除 `chrome-header.tsx` primitive 本身)。

### Layer 4 — Hook mechanical

`chrome_header_dispatcher.sh` 依序 dispatch **4 個 lib helper**(完整清單 SSOT = dispatcher 本身,避免 spec drift):

- `lib/_app_shell_primary_header_consistency.sh`(2026-05-31 exit 2 BLOCK)— primary-header layout 必傳 `globalHeader` prop,缺則 BLOCKER
- `lib/_header_with_tabs_border.sh`(2026-05-31 exit 2 BLOCK)— grep tsx 若 header 元件含 `<Tabs>` child 但未走 `withTabs` API → BLOCKER
- `lib/_tab_lg_chrome_header_equal.sh`(2026-05-31 exit 2 BLOCK,W3 pointer)— parse `uiSize.css` assert `--tab-height-lg` 像素等於 `--chrome-header-height`,任一方獨自改 → BLOCKER
- `lib/_chrome_header_handcraft.sh`(WARN,Phase 3 才升 P0)— grep 是否仍有 hardcoded `h-[var(--chrome-header-height)] border-b` 自刻 chrome header(該消費 ChromeHeader primitive)
- （以上皆 lib helper,經 `chrome_header_dispatcher.sh` 統一 dispatch;無 standalone `check_*.sh` 檔。前 3 個 SSOT-canonical deterministic helper exit 2 傳播真 block;`_chrome_header_handcraft` 維持 warn）

---

## 禁止事項

- ❌ Header 內同時有 header `border-b` 和 TabsList `border-b`(雙線)— per W1
- ❌ Tabs underline 用 `border-b-2` 在 trigger 上實作(雙線)— per `tabs.spec.md`「禁止事項」段(trigger 禁 `border-b-2`)
- ❌ Negative margin 接 header 與 tabs row(脆弱 chain)— per W4
- ❌ Hardcode `h-16` / `h-14` / `h-12` 自寫 chrome header 高度 — 必 `--chrome-header-height`
- ❌ Header 內 close X 用 `size="md"` 或 `size="lg"`(real grep 100% sm)
- ❌ Tabs default 覆寫回 `size="md"`(W5 + W6)— cva default 已是 sm,不該寫回 md
- ❌ ChromeHeader children 塞 `flex-col` 第二行(title + 副標/description)— Chrome 家族永遠 single-row(上方「為什麼兩家族」段);頁面說明文字歸 content 區 page heading,非 chrome(2026-06-12 fork-drift 防線,同 sidebar.spec.md SidebarHeader 必單行條;registry antiPattern `chromeheader-subtitle-second-line` 機械攔)

---

## A11y 預設

- Header 用 `<header>` semantic element;**僅 page-top top-level chrome header** 暴露 `role="banner"` landmark。nested 在 sectioning content(`<aside>` / `<section>` / overlay)內的 `<header>` 對 SR **不暴露 banner role**(per WAI-ARIA APG + MDN:`<header>` 只在最近 sectioning ancestor 為 `<body>` 時才是 banner)。ChromeHeader 是 layout primitive,**不硬塞 banner role**(與「7. Element contract」段一致)
- Tabs 走 Radix Tabs(原生 `role="tablist" / role="tab" / aria-selected`)
- Dismiss button `aria-label="關閉"`(close X)
- 鍵盤:Tabs 左右方向鍵切換(Radix);Esc 觸發 dismiss(overlay 家族)

---

## 跨元件參考

- `patterns/overlay-surface/overlay-surface.spec.md` — A 家族 SurfaceHeader / SurfaceBody / SurfaceFooter SSOT
- `tokens/uiSize/uiSize.spec.md` L160-289 — `--chrome-header-height` token canonical + Padding-based vs Fixed-h decision tree
- `components/Tabs/tabs.spec.md` L122-138(size 階梯)+ L185-247(border 視覺契約)
- `components/Button/button.spec.md` — size="sm" close X / inline action canonical

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `app-shell.spec.md`
- `dialog.spec.md`
- `file-viewer.spec.md`
- `item-anatomy.spec.md`
- `overlay-surface.spec.md`
- `popover.spec.md`
- `sheet.spec.md`
- `sidebar.spec.md`
- `tabs.spec.md`
- `uiSize.spec.md`
