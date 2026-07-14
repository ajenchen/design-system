---
component: Tabs
family: composite
variants: {}
sizes:
  sm:
    when: "★ cva default — 所有 header 內 tabs(overlay / chrome header / Dialog / Sidebar / dense toolbar)"
  md:
    when: "future tier — 目前無 recommended use case,新 consumer 須先諮詢 DS owner"
  lg:
    when: "獨立 tabs 直接取代 chrome header — page-level workspace 主導覽(tab 高度 = chrome-header-height)"
traits:
  - hasSizes
  - hasInteractiveStates
  - isStructural
benchmark:
  - Radix Tabs primitive: github.com/radix-ui/primitives/tree/main/packages/react/tabs
  - Ant Design Tabs: github.com/ant-design/ant-design/tree/master/components/tabs
  - Carbon Tabs: github.com/carbon-design-system/carbon/tree/main/packages/react/src/components/Tabs
  - Polaris Tabs: github.com/Shopify/polaris/tree/main/polaris-react/src/components/Tabs
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

# Tabs 設計原則

## 定位

Tabs 用於在**同一個上下文底下切換平行的視圖**——每個 tab 對應一塊獨立內容區，同時只顯示一塊。
基於 shadcn/ui Tabs（Radix Tabs），橋接設計系統 token。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

---

## 何時用

- **頁面內切換** 同上下文的平行視圖：專案的「總覽 / 成員 / 設定」
- **Dialog 內切換** 複雜設定：「一般 / 進階 / 整合」
- **Sidebar 面板內切換** 次分類：團隊、頻道、標籤
- 每塊 content 可以有自己的 header / toolbar / layout（container 規模的切換）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 切換的是**整個頁面**（路由層級）| navigation / breadcrumb | Tabs 是同上下文，路由是跨頁 |
| 只有兩個狀態的開關 | `Switch` / `Button pressed` | 兩態用 toggle 直接，不需要 tab 視覺 |
| 規模較小的局部內容變體切換 | `SegmentedControl` | compact control 更適合，見下「Tabs 與 SegmentedControl 的分界」 |

---

## Tabs 與 SegmentedControl 的分界

兩者都能「切換下方顯示的內容」，**「切 view vs 切 value」是過度簡化**——SegmentedControl 切表單欄位 / chart 維度 / list 排序都正當。三角度判斷（任何一個明確傾向就選）：

1. **規模**：Tabs 切一整塊 container（含自己的 header / toolbar / 多 section,子頁規模);SegmentedControl 切局部變體(單一 chart 維度 / list 排序 / form 條件欄位,單 control 承載量)
2. **角色**：Tabs 是 **container 結構元件**(跨父容器寬度、頂部 underline、與 header border 對齊,section 導覽 anchor);SegmentedControl 是 **control 元件**(pill 尺寸、可塞 toolbar / Field / form row、與 Button / Input 並排)
3. **生命週期**：Tabs 切換不進表單狀態(頂多 URL hash);SegmentedControl 值常綁 form state / URL param / 持久化

**Fallback**:跟 Input / Button / Checkbox 並排不違和 → SegmentedControl;必須佔一整行作 section header → Tabs。

### 常見灰色地帶

| 情境 | 選擇 | 理由 |
|------|------|------|
| 付款方式（信用卡 / 銀行轉帳 / 現金）+ 下方跟著變欄位 | **SegmentedControl** | 它是 form field，值會送出，視覺上跟其他 form field 並排 |
| 行事曆 Day / Week / Month 視圖切換 | **SegmentedControl** | Toolbar 尺度，跟日期 picker 並排，選值可綁 URL |
| 電商後台「訂單 / 顧客 / 產品」 | **Tabs** | 每個 view 有自己的 toolbar、filters、table，規模完全獨立 |
| Dashboard「本週 / 本月 / 本季」切換 KPI | **SegmentedControl** | 切的是 chart 的時間維度，不是結構 |
| Dialog 內「一般 / 進階」設定 | **Tabs** | 每個 view 是一整組表單，Tabs 是 dialog 內容的結構切分 |
| Filter bar「全部 / 進行中 / 已完成」 | **SegmentedControl** | Toolbar 尺度、值會進 URL param、跟其他 filter 並排 |

---

## 內部結構

```
TabsList ─┬─ TabsTrigger  [startIcon?] [label] [suffix?: badge? + endIcon?]
          ├─ TabsTrigger  ...
          └─ TabsTrigger  ...
TabsContent ← 對應被選中的 trigger
```

**單個 Trigger 內部**：`[startIcon 16/20px] ─gap-2─ [label] ─gap-2─ [suffix span(gap-1): badge? endIcon?]`——slot 間 **gap-2**（8px）對標 **item-layout pattern** 橫向 inline 變體；suffix 內 **gap-1**（4px）對標 **Button** suffix wrapper（`button.tsx` 的 `<span className="inline-flex items-center gap-1">`）
- `startIcon` 描述 tab 的內容性質（人像 icon 配「成員」、齒輪 icon 配「設定」）
- `badge` 傳達該 tab 底下的待處理計數（「通知 3」「成員 12」）
- `endIcon` **純視覺 indicator only**（方向 / 狀態 — ChevronDown 暗示「展開後看到子內容」、Pin / Star 狀態徽記）。**不拼 click 行為** — 點到 endIcon 跟點到 tab body 同效果（切 tab）
- `inlineAction`（2026-05-21 加）拆分 click target：點到 inlineAction 走它自己的 handler 不切 tab；典型如「『更多 ▾』tab 後綴點開 overflow dropdown 不切 tab」（split-click pattern,對齊 GitHub「Code ▾」/ Linear "Triage..." menu / Atlassian split-tab 共識）。DOM 上 inlineAction 是 trigger 的 **sibling**（絕對定位在 trigger 以 paddingRight 預留的區域,同 SidebarMenuButton suffixNode canonical）,**非巢狀 button** — Radix trigger 是原生 `<button>`,巢 button 為 HTML 不合法 + axe nested-interactive（2026-07-05 D4 修）

### 對標對象與故意的偏離

Tabs trigger = **item-layout 橫向變體 + Button 高度系統**。對標 item-layout 的:slot gap-2 / startIcon-label-suffix 三格固定 / suffix 可組合容器。對標 Button 的:固定高度 token(`--tab-height-*`)/ icon size 查表 / suffix wrapper gap-1。

三處刻意偏離 item-layout:
- **固定高度** `h-[var(--tab-height-N) N∈{sm,md,lg}]` + `items-center`(非 `h-[1lh]`)— Tabs 是 Button 樣的固定容器,非內容撐高 row
- **無 `<ItemIcon>` / `<ItemLabel>` helper**,直接吃 `LucideIcon` prop + 裸 `<span>` label — slot 固定三格,無複雜 prefix mixing
- **label 不包 `<span>` padding wrapper**(對比 Button 設計) — selected underline 必須 fit content,label 有橫向 padding 會讓 underline 多 8px 鬆散

**漂移歸屬**:row primitive 漂移以 `item-anatomy.spec.md` 為主;inline 高度 / icon size / suffix 結構漂移以 `button.tsx` 為主。

---

## Variant

**Tabs 目前只有一種視覺**：底線標示型（underline indicator）。

選中 trigger 底部有 2px 的 `bg-primary` 底線（2026-07-06 拍板：持續選中站 base），未選 trigger 僅文字色變化。未來若需要「填色型」或「pill 型」tabs，應先評估是否真的是 Tabs 的語意（通常是 SegmentedControl 或 Button group 的偽裝）再考慮擴充。

---

## Size

Tabs 有三種尺寸,**高度由 `--tab-height-*` token 控制**,隨 `data-density` 自動縮放。

| Size | md density | lg density | 字體 | 何時用 | 世界級對照 |
|------|-----------|-----------|------|--------|-----------|
| `sm` ★ cva default(2026-05-17 從 md 改 sm)| 32 | 40 | `text-body` (14) | **預設 use case**:所有 header 內 tabs(overlay header / chrome header / Dialog / Sidebar / dense toolbar)| Ant Design verbatim:「**small size could be used in Modal**」(`ant.design/components/tabs`)|
| `md` | 40 | 48 | `text-body` (14) | **Future tier — 目前無 recommended use case**;新 consumer 必先諮詢 DS owner | 多家世界級 DS(Material / MUI / Primer / Polaris)只有 1 個 default size,無中間階梯 | <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
| `lg` | 48 | 56 | `text-body-lg` (16) | **獨立 tabs 直接取代 chrome header 用**(tab 高度 = `--chrome-header-height` 像素相等,48/56)— page-level workspace 主導覽 | Ant verbatim:「**Large size tabs are usually used in page header**」(`ant.design/components/tabs`)|

**Token alignment + size 階梯 rationale SSOT**:`--tab-height-lg` (48/56) = `--chrome-header-height` (48/56) 像素相等 + md future tier + sm default 遷移 — **完整 cross-family canonical 詳** `patterns/header-canonical/header-canonical.spec.md` W3/W5/W6(per Rule-of-3 SSOT 集中此處,本元件 spec.md 不重複論述,只列上表 size table)。

### 為什麼 Tabs 不複用 `--field-height-*`

Tabs 是 navigation container，不是 form control。field-height 的 scale（24–36）是為 input / button 設計，套在 tabs 上高度 < 32px 時底線距 baseline < 8px，違反 navigation breathing 最小值。世界級設計系統（Atlassian 32 / Polaris 44 / Material 48）的 tabs 高度都在 32 起跳。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

### 為什麼獨立於 `--table-row-*`

目前 `--tab-height-*` 的數值（32/40/48，lg density 40/48/56）**碰巧與 `--table-row-*` 相同**，但兩者**語意獨立**——tab 是 navigation container，table row 是 tabular data container，未來任何一方需要調整都不應牽動另一方。Token 獨立宣告，不 alias。

---

## Overflow 模式

Tabs 支援三種 overflow 策略，透過 `TabsList` 的 `overflow` prop 選擇：

| Mode | 行為 | 何時用 |
|---|---|---|
| `none` ★default | 不處理，triggers 溢出父容器 | Tabs 數量可控、一定塞得下 |
| `scroll` | 單行橫向滾動 + 邊緣 fade mask 指示 | 動態 tabs 但不希望中斷視覺順序 |
| `menu` | scroll + ⌄ quick-jump dropdown（列全部 tab，點選跳轉），所有 triggers 一直可見 | 工具列 tabs、需要快速跳轉到任一 tab |

### scroll 模式

外層 overflow-x scroll(scrollbar 隱藏)+ 邊緣 mask-image gradient 依滾動位置動態 fade(不可滾無 mask / 可右→右 fade / 可左→左 fade / 雙向→兩側)。`useScrollEdges()` hook 追蹤狀態。**Mask 不用 gradient overlay**:mask 淡化內容本身 alpha,自動融合任何背景(dark / card / surface);overlay 需寫死背景色會漂移。

**Scroll arrow buttons**(`atStart/atEnd === false` 時顯示 `<ChevronLeft/Right>`,點擊捲 80% 容器寬,smooth scroll):三輸入方式都要顧——鍵盤(Radix 原生方向鍵 + scroll-into-view) / trackpad(兩指橫滑) / 滑鼠滾輪(需 `Shift+wheel`,一般使用者不知道,**必須補 arrow buttons**)。Arrow 容器 `pointer-events-none` + 內層 Button `pointer-events-auto`,不阻擋下方 trigger hit test。對齊 Material 3 / Ant / Carbon / Mantine。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

### menu 模式

menu = **scroll 模式 + 額外的 ⌄ quick-jump navigator**(show-all navigator pattern,對齊 Chrome 分頁下拉 / VS Code 編輯器分頁 / Discord 頻道跳轉)。全部 TabsTrigger 一直可見、留在底層 `overflow-x-auto` 捲動容器內(**不套 `invisible`、不隱藏溢出**)。右側 `OverflowMenuTriggerButton`(`ChevronDown` ⌄ icon)在有溢出空間時(`canScroll`)出現,點開 DropdownMenu **列出全部 tab**(非只溢出者);當前選中的 tab 用 DropdownMenuItem 的 `selected` 標記(`bg-neutral-selected`,跟 SelectMenu 單選同一套視覺)。點 menu item 經 Tabs context `onValueChange` 觸發切換(Radix 自然更新 `data-state`),同時 `scrollIntoView`(`inline: center`)把該 tab 捲到視圖中央。底層仍是真實捲動容器(非 `overflow-hidden`)的理由:`scrollIntoView` 與鍵盤 focus 的 auto scroll-into-view 都需要真實 scroll 容器;捲軸用 CSS 隱藏。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

**a11y**:全部 trigger 一直在 DOM 且可見(保 Radix roving tabindex);鍵盤使用者方向鍵導覽全部 tab,或 Tab 到 ⌄ 用 dropdown 快速跳轉,兩路徑並存。對齊 Ant Design Tabs / Atlassian Navigation Tabs。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

### 跨元件共用

`useScrollEdges`(及 `OverflowScrollArrow` / `OverflowMenuTriggerButton`)在 `patterns/horizontal-overflow/horizontal-overflow.tsx`(re-export 自 `hooks/use-overflow-items.ts`),`ChipGroup` 的 `layout="scroll" | "menu"` 消費同一組 primitive,確保 Tabs / Chip overflow 行為一致。注意 Tabs / Chip 的 menu 模式都是 show-all navigator(用 `useScrollEdges` 偵測捲動邊界),**不用** `useOverflowIndices`(那是「動態算溢出 index」用,menu 永遠顯示全部所以不需要)。

---

## 寬度行為

**Trigger 寬度永遠由內容決定（hug content）**——Tabs 沒有 `fullWidth` / 等分模式。

Tabs 是 **navigation anchor**，不是 compact control：
- 它在視覺階層上是 section header 等級，用「文字流」的節奏左對齊排列，trigger 間以 `--layout-space-loose` 分隔，接近閱讀動線
- 「各 segment 同寬」是 SegmentedControl 的身份特徵（對齊 Apple HIG / Material 3 等定義），Tabs 沒有這層視覺契約 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- 需要 compact 的等寬互斥切換器 → 用 `SegmentedControl`；需要 section-level 的視圖導覽 → 用 Tabs

**Triggers 之間 gap**：使用 `--layout-space-loose`（md density 16px / lg density 24px），與其他「pattern 層級的鬆散留白」共用同一 token。Tabs 的 gap 不是裝飾性空白，而是告訴使用者「每個 tab 是獨立的視圖入口」的視覺分隔。

**TabsList 容器寬度(2026-06-12 user 拍板,解 L58 spec≠code)**:**跨滿父容器**(none 模式 `w-full`;scroll/menu 模式 inner list `min-w-full` 保留溢出成長)——底線連成整條、右端達內容區邊緣,與「跨父容器寬度、與 header border 對齊」的角色定義一致(對齊 Ant nav `left:0;right:0` 底線 / Primer UnderlineNav;shadcn 為 pill 式不同型不適用)。Trigger 本身仍 hug content(上段不變)。**左右邊距 ownership**:TabsList **不自加水平 padding**——邊距由容器的 `--layout-space-loose` gutter 提供(standalone = 父容器 padding;withTabs = 繼承 header padding,W2 lockstep),故 tab 左緣永遠對齊兄弟內容左緣。

**TabsContent 與 TabsList 間距(2026-06-12 user 拍板)**:`--layout-space-tight`(md 12px,density 連動),**內建於 TabsContent**(`mt-[var(--layout-space-tight)]`,className 可覆寫;full-height 佈局用 `mt-0`)。依 `layoutSpace.spec`「親疏 3 級」第一級(同 bundle,元件 spec own)+ 規則 3「直接功能依賴 = tight」精神;**不**取 Ant 的固定 16px(M23 自家 token 優先)。內容本身的排版歸 item-anatomy / 各內容元件管,本條只管 list↔content gap。

> ⚠️ **此預設只在 TabsContent 緊接 tab bar 當直接 sibling 時成立**(standalone 頁面 tabs、ChromeHeader-as-sibling)。當 `tabsSlot` composition 把 tab bar 抬進 chrome header、TabsContent 留在 `DialogBody`/`SheetBody`/`SurfaceBody`(chrome scroll body,已自帶 `pt-/py-[var(--layout-space-tight)]`)內時,body 已擁有 header→content gap,TabsContent 的預設 `mt-tight` 會**雙重疊加**(md 24 / lg 32)。此時 TabsContent **必 `className="mt-0"`** 把 ownership 轉移給 body — 詳見下方「出現在 Dialog」段。一軸單一 spacing owner,per `item-anatomy.spec.md`「垂直 padding 歸屬 / 禁雙重 padding」。Hook `check_tabs_content_chrome_body_double_gap.sh` 機械強制。

---

## Underline 與 TabsList border 的視覺關係

TabsList 底部有 1px gray border（`border-divider`，neutral-4），selected trigger 有 2px primary 底線。**這兩條線視覺上必須是同一條**——selected 底線從 TabsList 的 gray border 位置「長出來」，不得出現雙線。

**原則**：selected 底線必須覆蓋並延伸 TabsList 的 gray border，避免疊線。實作手法（pseudo-element 定位）見 `.tsx`。

**色 token = `--divider`(neutral-4)而非 `--border`(neutral-5)**(2026-05-18 改 per user verbatim「我認為應該把 tabs 的下底線統一改成是 divider 色吧?」+「做」approval):跟 Dialog / Sheet / Popover / Sidebar header `border-b border-divider` 同色——chrome separator 一致,withTabs scenario 下 underline = chrome separator,色不同會視覺斷裂;selected trigger 2px primary indicator overlay 1px divider 對比仍清楚;對齊 `color.spec.md`「T-junction connectivity 原則」(tabs underline 跟 header separator T 字交接)。在 Dialog / Sidebar header 內特別重要——header 的 `border-b` 和 Tabs 的 `border-b` 必須感知為同一條水平線。

---

## 出現在 Dialog / Sidebar / 任何 header

Tabs 常與容器 header 的底邊 border 合併——**視覺上只有一條線**,不是 header border + tabs border 疊兩條。

**做法**:Tabs 的 `TabsList` 底部 border 與 header 的 `border-b` 實際上是**同一條線**(設計上重疊、實作上不重複渲染)。**Header 退讓**(移除自己 `border-b`),**Tabs 接管**(自身 `border-b border-divider` per `TABS_LIST_BASE`,2026-05-18 fd843c25 統一 chrome separator 色)。三種 overflow mode 的 TabsList 一律跨滿父容器(none 模式 `w-full`;scroll / menu 模式 inner list `min-w-full` 保留溢出成長,見「寬度行為」段;`TABS_LIST_BASE` + `overflow-y-hidden` 阻 y auto-promote,2026-05-19 c359c711 border owner 升 list 內部);chrome header 內的全寬 paint 由 `ChromeHeader` tabsSlot wrapper 以 `[&>[role=tablist]]:w-full` 強制(見 `header-canonical.spec.md`)。

**世界級對照(verbatim cite)**:GitHub Primer PageHeader「`hasBorder` defaults true,**but border NOT rendered if Navigation child contains UnderlineNav**;UnderlineNav itself provides bottom border」(`primer.style/components/page-header/react`);Ant Tabs line type 自帶 bottom border(`ant.design/components/tabs`);Mantine Tabs default variant 自包 bottom border(`mantine.dev/core/tabs/`)。**Counter-pattern(reject)**:Material UI 走「container 畫 border + tabs 不畫」(`<Box sx={{ borderBottom: 1 }}><Tabs>` 從 `mui.com/material-ui/react-tabs/`)——本 DS reject,理由:tabs underline 需 1px gray base line(見「Underline 與 TabsList border 的視覺關係」段),tabs 不畫 border 會讓 2px primary indicator 浮空失去 base

**Auto-suppress 機制(Phase 2 production code 提案)**:header primitive 加 `withTabs?: boolean` prop → true 時自動移除自身 `border-b`,免 consumer 手動忘記。對齊 GitHub Primer 的 auto-suppress 模式(免 consumer 手動 prop)。完整 cross-header canonical 詳 `patterns/header-canonical/header-canonical.spec.md` W1。

Size 建議:overlay / chrome header 內用 `sm`(32/40)— 對應 close X 也是 sm,視覺一致;**獨立取代 chrome header** 的 page-level workspace tabs 用 `lg`(48/56,= chrome-header-height)。

**間距 ownership**:tabsSlot 模式下 `TabsContent` 放 `DialogBody`/`SheetBody`/`SurfaceBody`(自帶 `pt-/py-tight`)內時**必 `className="mt-0"`** — body 已擁有 header→content gap,TabsContent 預設 `mt-tight` 會雙重(md 24 / lg 32,2026-07-01 user 抓)。詳「TabsContent 與 TabsList 間距」段;hook `check_tabs_content_chrome_body_double_gap.sh` 強制。

---

## 狀態

DS 詞彙 **selected**（持續選中）；Radix DOM attr 為 `data-state="active"`（primitive 命名，不改寫）。

| State | 視覺 |
|---|---|
| selected | `text-foreground` + `font-medium` + 底部 2px `bg-primary` 底線（semantic.css 選中規則；2026-07-06 拍板持續選中站 base，Ant inkBarColor = colorPrimary 同款）|
| 未選 | `text-fg-secondary` + `font-medium`（與 selected 同 weight，差異僅文字色 + 有無底線，非 weight）、無底線；hover 時文字色轉 `text-foreground` |
| disabled | `text-fg-disabled`；無 hover 色變化、無底線；`cursor-not-allowed`；不接受鍵盤 focus |
| focus-visible | `ring-2 ring-ring ring-offset-1`，與 Button 一致；鍵盤導覽（左右箭頭）由 Radix 原生處理 |

---

## Badge 與 loading 的邊界

- **Badge 在 tab 上**傳達「這個 view 底下有待處理」，未選中時仍應顯示（否則使用者不知道該切過去）
- Tab **沒有 loading 狀態**——載入的是 content 區，不是 tab 本身
- Disabled tab **不應**同時有 badge（語意矛盾：「有待處理但你不能看」）

### 補充邊界案例

- **Empty(no tabs)**:單 tab 已禁用(見「禁止事項」),0 tab 同理 — consumer 應條件性不渲 `<Tabs>`,不渲空 TabsList。
- **Empty content panel**:tab 切到沒內容的 view 時,content panel 應渲 `<Empty>` 引導 user(對齊 empty 元件的 page-empty pattern)— 由 consumer 決定,Tabs primitive 不獨立處理。
- **Disabled tab 鍵盤行為**:Radix Tabs 自動 skip disabled tab(`←/→` 不停留),focus 跳到下一個可用 tab。
- **極長 label**:trigger `whitespace-nowrap` 不換行、不 truncate(hug content);整列放不下屬 TabsList 溢出問題,走「Overflow 模式」(scroll / menu),非單 trigger 截斷。
- **RTL**:未實作方向鏡像(scroll edge / arrow 以 LTR `scrollLeft` 計算,與 Chip 共用 `useScrollEdges`);RTL 屬 DS-wide 決策,未定(與 Chip / Breadcrumb 同口徑)。
- **Dark mode / density**:走 chrome-header / Field 對應 token 自動 adapt;`size` × `variant` matrix 已在 anatomy 完整呈現,density 由 size prop 表達不獨立 own 維度。

---

## 禁止事項

- ❌ 一組 Tabs 不得只有一個 trigger——單一 tab 無切換語意，應直接顯示內容
- ❌ 不得用 Tabs 做表單單選（選 view ≠ 選 value）——改用 SegmentedControl
- ❌ 不得用 Tabs 做頁面層級導覽（切路由）——改用 navigation
- ❌ Trigger `startIcon` 不得超過一個
- ❌ **同一組 Tabs 內 `startIcon` 全有或全無**(2026-05-18 加 per user 抓「圖一 tabs 圖示混用」)——禁止「總覽無 icon / 成員 + 通知 + 設定 有 icon」這種視覺重心散亂的混用。對齊 Material UI Tabs「Tab labels may be either all icons or all text」+ Carbon「Do not mix dismissible tabs without icons with dismissible tabs with icons」。Scope **限縮 `startIcon`** — `endIcon`(badge / chevron-down 等狀態 indicator)可獨立判斷,因屬狀態 affordance 非語意 label icon <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- ❌ `endIcon` 不得放動詞性 icon（Download、Trash2）——tab 是視圖切換，不是觸發動作
- ❌ Dialog / Sidebar header 內不得同時有 header `border-b` 和 TabsList `border-b`——會出現雙線
- ❌ 不得把 trigger 改成等分 / fullWidth——等寬互斥切換是 SegmentedControl 的身份特徵，Tabs 是 navigation anchor，兩者不同層級。需要等寬改用 SegmentedControl
- ❌ Trigger 不得使用 `border-b-2` 實作 selected underline——會與 TabsList 的 `border-b` 形成上下雙線;selected underline 必須與 TabsList border 同層渲染(見 `tabs.tsx`)
- ❌ 不得自行改寫 Radix Tabs 的 `role` / `aria-*` 屬性

---

## Anatomy story 結構

Tabs anatomy 採 DS 標準結構 + 元件特有矩陣:

- `Overview` —— 預設視覺概覽
- `Inspector`(`元件檢閱器`)—— 互動式 prop 試玩(`size` × `overflow` × `value` 即時切換),對齊全部同類元件「單組合即時試玩 prop」的 DS 慣例
- 標準 `SizeMatrix` / `ColorMatrix` / `StateBehavior`(selected / hover / disabled)—— 結構性對照,呈現 underline / selected border 與 TabsList border 的視覺關係(見「Underline 與 TabsList border 的視覺關係」段),單組合 Inspector 無法並列呈現
- 元件特有 `OverflowMatrix`(scroll / menu / fade 三模式)—— 「tabs 放不下時怎麼處理」是設計決策題,需三方案 side-by-side 同時比較,Inspector 單組合無法呈現
- `SpacingTokens` —— 間距 token 對照
- `Accessibility`(`無障礙`)—— Radix tabs a11y 預設摘要 + Keyboard 行為對照(詳「A11y 預設」段)

---

## 相關

- SegmentedControl（`segmented-control.spec.md`）——切 value 的 radio 群組
- Button `pressed`（`button.spec.md`）——單一按鈕的 on/off toggle
- item-layout pattern（`item-anatomy.spec.md`）——gap-2 slot 間距的來源
- Accordion（`../Accordion/accordion.spec.md`）——多段獨立收合（非互斥切換）

## A11y 預設

**ARIA / Pattern**:繼承 Radix `tabs` primitive a11y 預設(role / aria-* / 鍵盤導覽)。詳 [Radix Accessibility docs](https://www.radix-ui.com/primitives/docs/components/tabs#accessibility)。

**Keyboard 行為**:

- Tab — 進入 TabList
- ←/→ — 切 tab
- Home/End — 第一 / 最後 tab
- Enter / Space — activate

**Focus**:Tabs 為內嵌導覽,不困住焦點(無 focus trap);Radix `tabs` primitive 以 roving tabindex 管理 tab 之間的鍵盤移動(整組 tabs 為單一 tab stop)。選中 tab 與 TabsContent 各有 focus-visible 焦點框(`ring-2 ring-ring` per design-system focus-visible canonical)。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `accordion.spec.md`
- `button.spec.md`
- `carousel.spec.md`
- `header-canonical.spec.md`
- `horizontal-overflow.spec.md`
- `segmented-control.spec.md`
- `sidebar.spec.md`
- `steps.spec.md`
