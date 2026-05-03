---
component: Tabs
family: null
variants: {}
sizes:
  sm:
    when: "form field-height 28 / compact chrome / dialog / panel context"
  md:
    when: "default general UI"
  lg:
    when: "touch / prominent CTA / stakeholder-facing surface"
traits:
  - hasSizes
  - hasInteractiveStates
  - isStructural
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

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

兩者都能「切換下方顯示的內容」，**「切 view vs 切 value」是過度簡化的二分法**——SegmentedControl 切換下方表單欄位、chart 維度、list 排序都是正當用法。真正的分界用以下三個角度，**任何一個明確傾向哪邊就選哪邊**：

### 1. 切換對象的規模

- **Tabs**：切換的是一整塊 container——可能包含它自己的 header、toolbar、多個 section。每個 view 是獨立的子頁規模
- **SegmentedControl**：切換的是局部內容的變體——單一 chart 的資料維度、單一 list 的排序方式、單一 form 的條件欄位。規模 = 一個 control 能承載的量

### 2. 視覺與結構角色

- **Tabs**：是 **container 的結構元件**。跨越整個父容器寬度、頂部 underline、與 header border 對齊——它是 section 的導覽 anchor，頁面裡不能有兩組 Tabs 互相搶戲
- **SegmentedControl**：是 **control 元件**。pill 尺寸、可塞進 toolbar / Field / form row、能跟 Button / Input 並排而不違和

### 3. 值的生命週期

- **Tabs**：切換通常**不進表單狀態、不會被送出**——純粹是 view 的路徑（頂多存在 URL hash 裡）
- **SegmentedControl**：選值常常**綁在 form state / URL param / 會被持久化**——它是一個 control 的當前值

### Fallback 判斷

邊界模糊時：
- 把它跟 Input / Button / Checkbox 並排不違和 → **SegmentedControl**
- 必須佔據自己的一整行作為 section header → **Tabs**

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

**單個 Trigger 內部**：

```
[startIcon?]  [label]  [suffix?]
  ↑            ↑         ↑
  16/20px      plain     span(gap-1): [badge?] [endIcon?]
               span
  │─── gap-2 ────│─── gap-2 ──│
```

- **Trigger 三層 slot 間 gap-2**（8px），對標 **item-layout pattern** 的橫向 inline 變體
- **suffix 內 gap-1**（4px），對標 **Button** suffix wrapper（`button.tsx:288`）
- `startIcon` 描述 tab 的內容性質（人像 icon 配「成員」、齒輪 icon 配「設定」）
- `badge` 傳達該 tab 底下的待處理計數（「通知 3」「成員 12」）
- `endIcon` 用於「該 tab 點下去會展開更多」的少見情境（如 popover tab），通常不用

### 對標對象與故意的偏離

Tabs trigger 對標 **item-layout pattern 的橫向變體**，但有三處刻意偏離：

| 偏離 | 做法 | 理由 |
|------|------|------|
| 不用 `h-[1lh]` 對齊 prefix | 固定高度 `h-[var(--tab-height-*)]` + `items-center` | Tabs 是固定高度容器（像 Button），不是內容撐高的 row；prefix 靠 flex 置中即可 |
| 不提供 `<ItemIcon>` / `<ItemLabel>` helper | 直接接受 `LucideIcon` prop、label 用裸 `<span>` | Tabs trigger 單行文字、slot 固定三格，沒有複雜 prefix mixing 場景，不需要 typed helper |
| label 不包 `<span className="px-1">`（與 Button 不同） | 裸 `<span>` | trigger 的 selected underline 必須 fit content——若 label 有 px-1，underline 會比視覺文字多 8px 顯得鬆散 |

**共同點（才是真正對標 item-layout 的部分）**：
- slot 間 gap-2 的橫向節奏
- startIcon / label / suffix 三格固定順序
- suffix 作為可組合容器（目前 badge + endIcon，未來可擴充）

**與 Button 共享的部分**：
- 固定高度 token 系統（`--tab-height-*` 對應 `--field-height-*` 的語義結構）
- Icon size 查表（sm/md=16, lg=20）
- suffix wrapper `gap-1`

> **結論**：Tabs 不完全屬於 item-layout，也不完全屬於 Button，而是「item-layout 的橫向 inline 變體 + Button 的高度系統」。未來若有人在 row primitive 和 Tabs 之間發現設計漂移，以 **item-anatomy.spec.md 為主**；若在 inline 高度 / icon size / suffix 結構發現漂移，以 **button.tsx 為主**。

---

## Variant

**Tabs 目前只有一種視覺**：底線標示型（underline indicator）。

選中 trigger 底部有 2px 的 `bg-primary` 底線，未選 trigger 僅文字色變化。未來若需要「填色型」或「pill 型」tabs，應先評估是否真的是 Tabs 的語意（通常是 SegmentedControl 或 Button group 的偽裝）再考慮擴充。

---

## Size

Tabs 有三種尺寸，**高度由 `--tab-height-*` token 控制**，隨 `data-density` 自動縮放。

| Size | md density | lg density | 字體 | 何時用 |
|------|-----------|-----------|------|--------|
| `sm` | 32 | 40 | `text-body` (14) | Dialog、Sidebar 面板、dense toolbar |
| `md` ★default | 40 | 48 | `text-body` (14) | 一般頁面主要 tabs |
| `lg` | 48 | 56 | `text-body-lg` (16) | Page-level hero tabs（少見）|

### 為什麼 Tabs 不複用 `--field-height-*`

Tabs 是 navigation container，不是 form control。field-height 的 scale（24–36）是為 input / button 設計，套在 tabs 上會壓得太擠、底線失去呼吸感。世界級設計系統（Atlassian 32 / Polaris 44 / Material 48）的 tabs 高度都在 32 起跳。

### 為什麼獨立於 `--table-row-*`

目前 `--tab-height-*` 的數值（32/40/48，lg density 40/48/56）**碰巧與 `--table-row-*` 相同**，但兩者**語意獨立**——tab 是 navigation container，table row 是 tabular data container，未來任何一方需要調整都不應牽動另一方。Token 獨立宣告，不 alias。

---

## Overflow 模式

Tabs 支援三種 overflow 策略，透過 `TabsList` 的 `overflow` prop 選擇：

| Mode | 行為 | 何時用 |
|---|---|---|
| `none` ★default | 不處理，triggers 溢出父容器 | Tabs 數量可控、一定塞得下 |
| `scroll` | 單行橫向滾動 + 邊緣 fade mask 指示 | 動態 tabs 但不希望中斷視覺順序 |
| `menu` | 塞不下收進 `⋯` dropdown，所有 triggers 仍在 DOM | 工具列 tabs、需要完整選項可見 |

### scroll 模式

- 外層 `overflow-x-auto scrollbar-none`
- 邊緣用 `mask-image: linear-gradient(...)` 漸變透明，指示還有內容在視窗外
- Mask 依滾動位置動態調整（不可滾→無 mask、可往右→右邊 fade、可往左→左邊 fade、雙向→兩側 fade）
- **左右 scroll arrow buttons**：`atStart === false` 時左側顯示 `<ChevronLeft>`、`atEnd === false` 時右側顯示 `<ChevronRight>`，點擊捲動 80% 容器寬度（smooth scroll）
- 使用 `useScrollEdges()` hook 追蹤 scroll state

**為什麼用 mask 不用 gradient overlay**：mask 淡化的是內容本身的 alpha，自動融合任何背景色（dark mode / card / surface 都自動正確）。Gradient overlay 需要寫死具體背景色，遇到不同背景就漂移。

**為什麼要 scroll arrow buttons**：三種輸入方式都要顧到
- **鍵盤使用者**：Radix Tabs 原生左右方向鍵 + 瀏覽器 `scroll-into-view` 自動捲到 focused trigger ✓
- **Trackpad 使用者**：兩指橫向滑動 ✓
- **滑鼠滾輪使用者**：水平滾動需要 `Shift+wheel`，一般使用者不知道——**必須補 arrow buttons**

Arrow buttons 用 `pointer-events-none` 外層 + `pointer-events-auto` 內層包 Button 的技巧，讓 arrow 按鈕以外的絕對定位區域不阻擋下方 triggers 的 hit test。

**對齊**：Material 3 / Ant Design / Carbon / Mantine 都有 scroll arrows（Polaris / Primer 是少數例外，假設使用者用 trackpad）。

### menu 模式

- 所有 `TabsTrigger` 渲染在 DOM 中（保留 Radix Tabs 的 roving tabindex）
- 用 `useOverflowIndices()` 偵測哪些 trigger 溢出
- 溢出的 trigger 套 `invisible`（`visibility: hidden`，不接受 hit test 但保持 layout）
- 右側渲染 `<Button variant="text" iconOnly startIcon={MoreVertical} />`(overflow menu canonical icon,見 CLAUDE.md「常用 icon canonical」)
- 點擊開 DropdownMenu，內容是對應的 tab labels
- 點 menu item 透過 Tabs context 的 `onValueChange` 觸發選擇變化，Radix 自然更新 `data-state` 並讓對應 trigger 浮現

**a11y 保留機制**：溢出的 triggers 只是視覺隱藏、仍在 DOM，Radix 的 roving tabindex 依然可以 focus 它們。鍵盤使用者可以進入 TabsList 用方向鍵在所有 triggers 之間導覽，或用 Tab 到 `⋯` 按鈕用 dropdown 介面，兩條互動路徑同時可用。

**對齊**：Ant Design Tabs `moreIcon` / Atlassian Navigation Tabs 的作法。

### 跨元件共用

`useOverflowIndices` 和 `useScrollEdges` 是 `src/design-system/hooks/use-overflow-items.ts` 裡的共用 hook，`ChipGroup` 的 `layout="scroll" | "menu"` 消費同一組 hook，確保 Tabs 和 Chip 的 overflow 行為視覺 / 機制一致。

---

## 寬度行為

**Trigger 寬度永遠由內容決定（hug content）**——Tabs 沒有 `fullWidth` / 等分模式。

Tabs 是 **navigation anchor**，不是 compact control：
- 它在視覺階層上是 section header 等級，用「文字流」的節奏左對齊排列，trigger 間以 `--layout-space-loose` 分隔，接近閱讀動線
- 「各 segment 同寬」是 SegmentedControl 的身份特徵（對齊 Apple HIG / Material 3 等定義），Tabs 沒有這層視覺契約
- 需要 compact 的等寬互斥切換器 → 用 `SegmentedControl`；需要 section-level 的視圖導覽 → 用 Tabs

**Triggers 之間 gap**：使用 `--layout-space-loose`（md density 16px / lg density 24px），與其他「pattern 層級的鬆散留白」共用同一 token。Tabs 的 gap 不是裝飾性空白，而是告訴使用者「每個 tab 是獨立的視圖入口」的視覺分隔。

---

## Underline 與 TabsList border 的視覺關係

TabsList 底部有 1px gray border（`border-border`），selected trigger 有 2px primary-hover 底線。**這兩條線視覺上必須是同一條**——selected 底線從 TabsList 的 gray border 位置「長出來」，不得出現雙線。

**原則**：selected 底線必須覆蓋並延伸 TabsList 的 gray border，避免疊線。實作手法（pseudo-element 定位）見 `.tsx`。

在 Dialog / Sidebar header 內特別重要——header 的 `border-b` 和 Tabs 的 `border-b` 必須感知為同一條水平線。

---

## 出現在 Dialog / Sidebar

Tabs 常與容器 header 的底邊 border 合併——**視覺上只有一條線**，不是 header border + tabs border 疊兩條。

**做法**：Tabs 的 `TabsList` 底部 border 與 Dialog/Sidebar header 的 `border-b` 實際上是**同一條線**（設計上重疊、實作上不重複渲染）。Consumer 把 Tabs 放在 header 區域內、移除 header 自己的 `border-b`，讓 Tabs 的 border 接管。

Size 建議在這些容器內用 `sm`（32/40），避免 header 過高。

---

## 狀態

### active

選中的 trigger：
- 文字色 `text-foreground`、`font-medium`
- 底部 2px 底線 `bg-primary-hover`（對齊 semantic.css：選中狀態的邊框/文字統一用 `--primary-hover`）

未選的 trigger：
- 文字色 `text-fg-secondary`、一般 weight
- 無底線
- hover 時文字色轉 `text-foreground`

### disabled

- 文字色 `text-fg-disabled`
- 無 hover 色變化、無底線
- Cursor 變為 `not-allowed`（滑鼠移過明確告知不可點）
- 不接受鍵盤 focus

### focus-visible

`ring-2 ring-ring ring-offset-1`，與 Button 一致。鍵盤導覽（Radix Tabs 原生支援左右箭頭）由 Radix 處理。

---

## Badge 與 loading 的邊界

- **Badge 在 tab 上**傳達「這個 view 底下有待處理」，未選中時仍應顯示（否則使用者不知道該切過去）
- Tab **沒有 loading 狀態**——載入的是 content 區，不是 tab 本身
- Disabled tab **不應**同時有 badge（語意矛盾：「有待處理但你不能看」）

---

## 禁止事項

- ❌ 一組 Tabs 不得只有一個 trigger——單一 tab 無切換語意，應直接顯示內容
- ❌ 不得用 Tabs 做表單單選（選 view ≠ 選 value）——改用 SegmentedControl
- ❌ 不得用 Tabs 做頁面層級導覽（切路由）——改用 navigation
- ❌ Trigger `startIcon` 不得超過一個
- ❌ `endIcon` 不得放動詞性 icon（Download、Trash2）——tab 是視圖切換，不是觸發動作
- ❌ Dialog / Sidebar header 內不得同時有 header `border-b` 和 TabsList `border-b`——會出現雙線
- ❌ 不得把 trigger 改成等分 / fullWidth——等寬互斥切換是 SegmentedControl 的身份特徵，Tabs 是 navigation anchor，兩者不同層級。需要等寬改用 SegmentedControl
- ❌ Trigger 不得使用 `border-b-2` 實作 selected underline——會與 TabsList 的 `border-b` 形成上下雙線;selected underline 必須與 TabsList border 同層渲染(見 `tabs.tsx`)
- ❌ 不得自行改寫 Radix Tabs 的 `role` / `aria-*` 屬性

---

## 為何無 Inspector

Tabs 決策維度是 `size` × `variant` × overflow 模式 × 寬度行為——已由 `SizeMatrix` / `ColorMatrix` / `StateBehavior`(selected / hover / disabled) / 元件特有 `OverflowMatrix`(scroll / menu / fade 三模式) / `SpacingTokens` 五張結構 story 完整覆蓋。

互動 Inspector 切單一 tab 不如 `OverflowMatrix` 的三種 overflow 模式 side-by-side 比較有效——「tabs 放不下時怎麼處理」是設計決策題,需要同時看三個方案。同樣 `SizeMatrix` / `StateBehavior` 是結構性對照,單 tab 互動無法呈現 underline / selected border 與 TabsList border 的視覺關係(見「Underline 與 TabsList border 的視覺關係」段)。

對應 anatomy story:保留 `Overview` + `SizeMatrix` + `ColorMatrix` + `StateBehavior` + 元件特有 `OverflowMatrix` + `SpacingTokens`。

---

## 相關

- SegmentedControl（`segmented-control.spec.md`）——切 value 的 radio 群組
- Button `pressed`（`button.spec.md`）——單一按鈕的 on/off toggle
- item-layout pattern（`item-anatomy.spec.md`）——gap-2 slot 間距的來源
- Accordion（`../Accordion/accordion.spec.md`）——多段獨立收合（非互斥切換）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `carousel.spec.md`
- `sidebar.spec.md`
- `steps.spec.md`
