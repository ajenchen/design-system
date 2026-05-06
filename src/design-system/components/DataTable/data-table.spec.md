---
component: DataTable
family: null
variants: {}
sizes: {}
traits:
  - isStructural
benchmark:
  - Ant Design Table: github.com/ant-design/ant-design/tree/master/components/table
  - MUI X DataGrid: github.com/mui/mui-x/tree/master/packages/x-data-grid
  - Polaris IndexTable: github.com/Shopify/polaris/tree/main/polaris-react/src/components/IndexTable
  - Carbon DataTable: github.com/carbon-design-system/carbon/tree/main/packages/react/src/components/DataTable
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# DataTable 設計原則

## 定位

DataTable 是基於 TanStack Table 的資料表格元件，提供排序、篩選、選取、欄位操作、虛擬捲動等完整能力。
TanStack Table 負責邏輯，DataTable 負責視覺與互動。

簡單展示場景也用 DataTable（最少 config），不另外維護靜態 Table。
底層使用 `<div>` + ARIA role，不用語義 `<table>`——虛擬捲動需要絕對定位 row，且未來 frozen column 需要獨立 scroll 區域，`<table>` 的佈局模型兩者都不支援。

**不是試算表**——不做公式計算、不做跨 cell 選取。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

### 檔案結構(2026-05-03 split matrix)

12 file,每個過 M21 / M17 / Rule-of-3 三 test:`data-table.tsx`(主,foundational)/ `data-table-filter-panel.tsx` + `data-table-sort-manager.tsx`(panel state 隔離)/ `column-types.ts` + `filter-operators.ts`(✓ Rule-of-3 SSOT,3+ consumer)/ `filter-tree.ts`(pure data + eval,test isolation)/ `lib/column-meta.ts`(Internal SSOT,消 5 處 `(col as any)`)+ stories/spec/css。**M21 retract**:`filter-value-picker.tsx` 1 consumer → 已 inline 回 panel。

---

## 何時用

- **結構化資料列表**：專案列表、使用者管理、訂單清單、商品管理、報表檢視
- **需要排序 / 篩選 / 分頁的資料**：100+ 筆需要探索、搜尋、縮小範圍
- **需要多欄位對齊掃視的資料**：財務報表（數字右對齊縱向比較）、日期時間序列
- **需要 inline 編輯 cell** 的資料（editable table mode）
- **簡單展示也用 DataTable**（最少 config）——不維護第二個靜態 Table 元件

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 唯讀的 key-value 展示（profile 屬性列表）| `DescriptionList` | DataTable 是多 row 集合，DescriptionList 是單一實體的屬性 |
| 階層結構（部門 / 資料夾 tree）| `TreeView` | DataTable 是平面 row，不支援階層展開收合 |
| 卡片式瀏覽（圖文並列）| 自訂 grid / list | Table 是密集 row，不適合大圖 |
| 只有 2-3 筆且不需互動 | 直接 `<dl>` 或自訂 layout | DataTable 的 overhead 對小資料集過度工程 |
| 試算表（公式 / 跨 cell 選取）| 超出範圍，用專門試算表 library | DataTable 不做 cell-level 計算 |
| 需要複雜群組 header + 合併 cell | 自訂或 TanStack 原始 API | DataTable 對 header group 的抽象層有限 |

---

## 層級架構

每一層建立在前一層之上,可獨立啟用。

| 層級 | 能力 | 狀態 |
|------|------|------|
| **L1 基礎結構** | 骨架、尺寸、border、色彩、高度模式、行高模式 | ✅ 完成(本文件 L1 段)|
| **L2 選取** | row selection、checkbox、單/多選、bulk action 整合 | ✅ 完成(本文件 L2 段)|
| **L3 欄位互動** | 排序(本文件 L3)、resize、reorder、pin、顯示隱藏 | 部分完成(sort 完成,resize/reorder/pin/visibility 待 v2)|
| **L4 資料操作 + Cell 能力** | 進階篩選(本文件 L4 Filter)、inline edit、nested rows、row drag(本文件 L4 段)| ✅ Filter / Inline edit / Nested rows / Row drag v3 完成(Jira canonical + virtualization fix) |
| **L5 進階** | 分組、搜尋、tree data v2 enhancements、export CSV/Excel | 待 v2 |

---

## L1：基礎結構

### 一、Table Size

DataTable 有三種尺寸（`sm`、`md`、`lg`），透過 `size` prop 控制。

**Size 不等於 density。** Size 是這張表格的結構決策（需要多緊湊），density 是全域的使用者偏好。同一頁可以有不同 size 的表格，density 全頁一致。

水平 padding 固定,不隨 size 或 density 變化(具體 token 見 `data-table.tsx`);垂直方向由行高模式決定(見第四節)。

### 二、高度模式

**有高度約束 vs 無高度約束，決定可用的功能組合。**

**有高度約束**(指定高度值,或父容器提供高度限制)
- 行為:資料少→outer 內容高度;資料多→撐到上限後內部 scroll(虛擬捲動啟用,header 固定)
- 高度來源:固定 `height="400px"` 等具體 px/rem,或 `height="100%"` 由父 flex 提供約束(Linear 做法)— 都走相同 cap 行為,無 dead surface

**無高度約束**（auto）
- 內容決定高度，table 框只包住內容
- 適合少量資料、預覽、嵌入式表格
- 犧牲：無虛擬捲動（全部渲染）、header 隨頁面捲走、水平捲軸在 table 最底部
- 這些不是 bug，是模式的取捨

### 三、三區域架構（AG Grid 模式）

Table 分三層:
- **Header**(固定頂部,不在 scroll 容器內):含 left / center / right 三區,center 區與 body center 的水平捲動 JS 同步 scrollLeft
- **Body viewport**(垂直可捲,橫向由 center 區負責):含 left / center / right 三區,只有 center 可水平捲動,left / right 不隨水平捲動
- **Left / Right 區**:寬度由凍結欄加總,不吃水平捲動;**Center 區**:flex-1,水平 overflow 自行處理

完整 class / overflow 規則見 `data-table.tsx`。

**Header 在 scroll 容器外面。** 不用 CSS sticky——header 結構性地在 body 上方，永遠固定在頂部。Header bg 用 `neutral-2-opaque`（不透明），不受底層色影響。

**三個 region 共享垂直捲動。** body-viewport 是唯一的垂直 scroll container，三個 body region 是它的 flex children。垂直捲動天然同步，不需 JS。

**只有 center 水平捲動。** center-body `overflow-x: auto`。center-header `overflow: hidden`，用 JS sync：`centerBody.scrollLeft → centerHeader.scrollLeft`。

**Left / right 不水平捲動。** `overflow: hidden`。Frozen 邊界用 `border-divider`（全高度）。

**固定行高確保跨 region 對齊。** 所有 row 用 `h-table-row-{size}`，三個 region 的 row 精確同高。

**Header/body region 寬度同步。** Header region 寬度由內容決定（columns + actions），body region 用 ResizeObserver 量測 header 寬度並同步。

### 四、行高模式

Table 層級的模式切換，不是 column 層級。跟 AG Grid / Airtable 的做法一致。

**固定行高（預設）**——適合大多數場景
- 所有 row 同高，內容垂直置中
- 文字、tag、badge、avatar 等不同高度的元件都自然居中，不需要處理對齊
- 文字一律截斷，不換行（column 的 `wrap: true` 被忽略）

**自動行高**——適合有描述、備註等需要完整顯示的欄位
- Row 高度由最高的 cell 決定，內容頂部對齊
- 垂直 padding 由目標行高推導，單行時製造置中效果，多行時保持頂部對齊
- `wrap: true` 的欄位可換行撐高 row

### 五、Header vs Body 的視覺區隔

**兩種垂直分隔線：**

| 類型 | 範圍 | 適用 |
|------|------|------|
| Header 分隔線 | 僅 header 區域（上下留 padding） | 一般非 frozen 欄位之間 |
| Frozen 邊界線 | **整欄高度**（table 頂部到底部） | frozen column 與 scrollable area 的交界 |

一般 column 只在 header 有短線——body 的欄位邊界由 header 引導，不需額外視覺噪音。但 frozen column 的邊界是結構性的分隔（固定區域 vs 捲動區域），需要全高度的線來明確標示。

Row actions 欄本質上是 frozen right column，左邊界也使用 full-height 分隔線。

**Header 文字弱化。** Header 是結構標籤，不是資訊本體。字體與 body 相同但使用次要文字色，搭配 muted 背景拉出層級，讓視覺重心留在 body 的資料上。

### 六、外框規則

**邊框標記「這裡有使用者看不到的內容」。** 沒有邊框時，使用者無法判斷內容是否有溢出。

加框的條件（滿足任一即加）：
- **垂直捲動**（有高度約束，內容超出容器）
- **水平溢出**（欄位總寬超過容器）
- **有 frozen column**（固定欄與捲動區域的陰影分界需要外框歸屬）
- **全表 inline edit**（可編輯容器需要邊界提示）

不加框時，最後一行保留底線自然收尾。加框時最後一行底線去掉，避免與外框 double border。

**Prop**：`bordered`（boolean，預設 `true`）。多數場景（有高度約束的虛擬捲動 / frozen column / inline edit 表）都應保持預設；只在**資料量極少、無溢出、嵌在 Card / Section 內已有外框**的展示型場景傳 `bordered={false}` 讓最外層視覺收尾。

### 六之二、Column 寬度 API + 不變條件(2026-05-06 v14.3)

**命名**:`meta.width` / `meta.minWidth` / `meta.maxWidth`(px)。**不用 TanStack `size`** — DS 內 `size` 既定為 `'sm'|'md'|'lg'` density(49+ 處),避 namespace 衝突。內部 pre-process copy 到 TanStack root,resize feature 正常。No-resize default:`width` = reserve(cell ≥ width,flex 可 grow,不可 shrink)。`enableColumnResize=true`:`width` = 初始,`minWidth` = 拖拉下限(default 80)。

**不變條件(invariants,L2 test + hook 守)**:(1) cell width = column width(跟 padding/state/mode 無關)(2) display↔edit cell width 0 delta (3) display↔edit cell height 0 delta(textarea `field-sizing:content`)(4) Field 填滿 cell 高度(1px 容差於 cell.border-r)(5) No-resize column ≥ meta.width。對應 `scripts/data-table-invariants.mjs`。改 `columnSizeStyle` / 切 layout 必跑 invariant test 才 commit。

### 七、Column Type

**Column type 是資料行為的預設合約。** 指定 type 自動獲得對齊 / 渲染 / 排序 / 篩選行為,可在 column 層級覆寫。Header 對齊永遠跟該欄 body cell 一致。

### 八、Row 狀態

- **不使用斑馬紋**——hover + selected 兩種狀態已足夠，斑馬紋疊加會產生四種以上的背景色組合，增加視覺雜訊
- **Hover 與 selected 用不同色系**（neutral vs primary-subtle），讓使用者一眼區分「正在看的」與「已選的」

### 九、Row Actions

每列最右側可配置操作(編輯、刪除、複製等)。位於 right-pinned region(全高 `border-divider` 分隔),不參與水平捲動,**常駐顯示**(對齊 dense data ops 派)。

**Canonical**:Row actions 一律 `Button iconOnly variant="text" size="xs"`(固定 24px),不隨 row tier 放大,**不套 `dismiss` prop**(Trash/Delete = `onRemove` 語意,不是 dismiss)。

**Why 固定 24**:row actions 是「dense utility affordance」(輔助 ≠ 資料本體),固定 24 讓資料 cell 為視覺重心;放大會違反「data 本體 / action 輔助」階層。對照 `patterns/element-anatomy/inline-action.spec.md` Real case 表「DataTable row dedicated action column」row。

**世界級對照**:Material DataGrid `GridActionsCellItem`(IconButton small)/ Polaris IndexTable hover 20-24px / Atlassian Dynamic Table small iconOnly / Apple HIG Finder list row ≤24px — 全派固定不放大。

**收納邏輯：**

| 數量 | 顯示方式 |
|------|----------|
| 1-2 | icon buttons 並排(全 size="xs")|
| 3+ | 前 1-2 個 inline + MoreVertical dropdown(全 size="xs") |

MoreVertical dropdown 包含所有操作，確保鍵盤可存取全部。

**Header/body 寬度同步：** Header 渲染 invisible buttons 佔位(同 size="xs"),確保 header 和 body 的 right region 同寬。

### 九之二、Cell action primitive 分類(2026-04-29 codified)

SSOT → `patterns/element-anatomy/inline-action.spec.md`「Real case 表」+ Predicate。**核心**:視覺一體用 Inline Action,視覺分離(獨立 column / toolbar)用 Button。

| 位置 | Primitive |
|------|-----------|
| Header cell internal(sort / ⌄ menu / filter funnel / pin)| `ItemInlineActionButton` `size="md"`(對齊 AG Grid / Material / Airtable / Notion / Polaris) |
| **Multi-sort header(≥2 columns sorted)** | **隱藏 header arrow + 取消排序 dropdown option**(K7,2026-05-04)— 無 order 編號的單個 arrow 在 multi-sort 是 partial info → 反而混淆;user 走 SortManager panel 看完整 priority(SSOT)。0/1 sort 仍秀 arrow 完整資訊。理由:現行 DS 不顯 sort order 編號,跟 Airtable / Linear / Atlassian / Carbon 純箭頭派一致;multi-sort 時這派需 SortManager fallback(world-class 共識) |
| Body cell internal(display endAction / clear / edit indicator)| Field family endAction(自動繼承) |
| Row dedicated action column | Button `xs iconOnly` 24px(見「九、Row Actions」) |
| Toolbar | Button(action-bar 共識) |

❌ Header cell 塞 `<Button size="sm" iconOnly>`(權重不一體)/ Body cell 手刻 `<button>` 繞過 Field endAction / Row action column 用 Inline Action(需 chrome affordance)。

### 十、與 Toolbar 的關係

DataTable 不內建 toolbar。Toolbar 是外部用 action-bar pattern 組合的，保持職責分離。

篩選、排序、分組走統一入口（toolbar 按鈕），不做在表頭的 per-column filter。這些按鈕的 variant 規則見 `action-bar.spec.md`。

### 十一之一、Cell 垂直對齊 + icon canonical

Cell 已 `flex items-center`,consumer render 直接 inline-flex + gap-2。Icon size:sm/md→16 / lg→20(對齊 Field family,禁 14/18/24 自由挑)。`renderCellContent` 對 `React.isValidElement(content)` true / `isKnownCompound`(select/multiSelect/person/url)bypass TruncateCell;primitive 才走 truncate + hover tooltip。❌ consumer wrapper 加 `leading-none` / `h-full` / `align-middle` 治標 — 根因常在 TruncateCell 包覆。

### 十一、Cell 單行截斷原則

固定行高下 cell 單行,空間不足:純文字 `text-overflow: ellipsis`;Tag 文字內部 truncate(Tag bg 跟縮);multiSelect 動態 `+N`;Person avatar 不縮 name truncate;Link truncate。每個 Display 元件自管 truncation,Cell `overflow-hidden` 僅 safety net。截斷必顯 `...`(禁硬裁無 ellipsis)。截斷 hover 顯 tooltip。autoRowHeight wrap 模式不適用(可換行撐 row 高)。

### 十二、Inline Edit 視覺差異(全表 `inlineEdit` 模式)

固定行高(不 autoRowHeight)、body cells 之間垂直分隔線、select / date / person 右側 ChevronDown / Calendar 指示器、外框自動加。詳互動 canonical 見下方「L4 Inline Edit」段。

### 十三、可推導值用 `calc()` 表達(不硬寫結果)— 上游動,下游自動跟著算

### 十四、狀態處理職責邊界

DataTable 只管「確定有 column + 有 / 沒 data」,不管生命週期:

| 狀態 | 誰處理 | 做法 |
|------|-------|------|
| Empty | DataTable 內建 | 自動渲 `Empty` primitive |
| Loading | Consumer | 外層 CircularProgress / Skeleton |
| Error | Consumer | 外層 Alert |
| Disabled(整表)| N/A | Cell-level 由 Field Controls 管 |

判斷法:「我知道 data 是什麼嗎?」知道 → 傳;還在載 → 外面 Skeleton;失敗 → 外面 Alert。Dark mode / density:semantic token 自動切換。

---

## 捲軸(pinned header / column + scroll canonical)

3-panel(left-pinned / center-scroll / right-pinned),center body 用 **native `overflow-x-auto`**(非 ScrollArea),header 透過 JS `onScroll` 同步 scrollLeft。對齊 Linear / Notion / Airbnb / Ant ProTable / TanStack 主流。

**不用 `<ScrollArea>` 的理由**:Radix viewport nested div 會 break scrollLeft 同步;pinned column 需「左右獨立 scroll + 中央共享 scroll state」,單一 viewport 不適配。

**Tech debt**:macOS auto-hide vs Windows/Linux 常駐 scrollbar,cross-OS 視覺寬度差異 — consumer 可 override `::-webkit-scrollbar` 樣式;ScrollArea 重構列 post-v1。

---

## L2:選取(Selection)

DataTable 的 row selection layer。提供 controlled/uncontrolled state + 視覺 + 鍵盤,搭配獨立 `BulkActionBar` primitive 完成批次 workflow。

**世界級對照**:Material DataGrid `rowSelectionModel` / Polaris IndexTable `selectedResources` / Linear / Notion 全 controlled-first + uncontrolled fallback。AG Grid 的 imperative `gridRef.api` 不採(違背 React idiom + 既有 Field/Switch/Checkbox controllable 慣例)。

### 一、State 模式

```ts
selection?: string[]                  // controlled
defaultSelection?: string[]           // uncontrolled
onSelectionChange?: (ids: string[]) => void
selectable?: boolean | 'single' | 'multi'  // default 'multi'
isRowSelectable?: (row: TData) => boolean
preserveSelectionOnFilter?: boolean   // default false
```

對齊 `useControllableState` idiom(Field / Switch / Checkbox 已用)。

### 二、Checkbox column

- **位置**:最左,自動 left-pin(不論 consumer pin 哪些 cols)
- **寬度**:對稱 row-actions 區寬
- **顯示時機**:**always visible**(對齊 Linear 2024 / Polaris / Material consensus,不允 hover-show)
- **Header tri-state**:none / indeterminate / all,使用既有 Checkbox `indeterminate` prop

### 三、全選邏輯(2-step pattern)

對齊 ref 圖 + Linear / Gmail / Notion canonical:

1. Header checkbox click(none → all)→ 選**目前可見** rows(filter 後 visible-only)
2. 全頁可見已選 → BulkActionBar 顯示 hint:「已選取本頁 N 個。**點此選取全部 M 個**」
3. 點 hint → 擴 dataset 全選,hint 改:「已選取全部 M 個。**清除選取項目**」

不直接擴 dataset(避免誤觸大量資料)。

### 四、互動

- click checkbox → toggle 該 row
- **shift-click checkbox** → 從 anchor row 到當前 row 區間選(內部 track anchor)
- header checkbox click → toggle 全可見
- **整 cell 區可點擊**(canonical):cell padding 任何位置(不只視覺 checkbox/radio 本體)點擊都觸發 toggle / select。對齊 Linear / Apple Mail / Material DataGrid — 增 hit target 不要求精準瞄準。Disabled row 不觸發。實作:select cell 容器 div onClick 委派到 toggleRow / setSelection

### 五、Disabled rows

- prop:`isRowSelectable?: (row) => boolean`
- 視覺:**僅 checkbox disabled + 灰**;**row 其他 cell 內容正常 render**(對齊 Material DataGrid / Polaris)— row 的資料仍有資訊價值
- 全選跳過 disabled rows

### 六、Selection × filter / sort 互動

- **filter 套用 → filtered-out 的 selected rows 預設清掉**(對齊 Material / AG Grid / Polaris / GitHub / Gmail consensus)
- **opt-in `preserveSelectionOnFilter={true}`** → 給 productivity scope(Linear / Airtable 用法),保留 hidden selected,BulkActionBar 顯示「{visible} selected ({hidden} hidden by filter)」
- sort 套用 → selection 全保留(sort 不影響可見性)

### 七、BulkActionBar 整合(inline composition canonical)

`BulkActionBar` 是獨立 primitive(`../BulkActionBar/`),不內建。Consumer flex-column 容器 inline composition,**toolbar 永遠保留**(filter / sort / search selection 期間仍可用,additive 派 — 對齊 Linear / Notion / Apple Mail / iOS Files)。Hint banner 用 `<Alert variant="info" placement="fixed">` + ReactNode title。4 layout use case 詳 `../BulkActionBar/bulk-action-bar.spec.md`。

### 八、a11y 預設

- 每個 row checkbox 必有 `aria-label`:consumer 提供 `getRowAriaLabel?: (row) => string`,fallback `"Select row"`
- header checkbox `aria-label="Select all visible rows"`
- 鍵盤:`Space` toggle / `Shift+Space` 擴 range / `Cmd/Ctrl+A` 選全可見 / `Esc` clear
- Selection 變更可選 `aria-live="polite"` 通知(consumer-implemented)
- **Multi mode 用 Checkbox / Single mode 用 Radio**(對齊 Material DataGrid / Polaris IndexTable 共識,same-row consistency 全 sm)。Single mode 內部 wrap `RadioGroupPrimitive.Root` 提供 context,header checkbox 抑制(single 無「全選」概念)。

### 九、L2 禁止事項

- ❌ 不用 hover-show checkbox(always visible canonical)
- ❌ 不在 disabled row 整 row 灰底,只 disable checkbox
- ❌ 不直接 row click 選取(預防誤觸,只 checkbox / 鍵盤)。例外:`selectable="single"` 可 opt-in
- ❌ 不一鍵擴 dataset 全選(必先「選本頁 + hint 點擊擴 dataset」2-step)
- ❌ Filter 後 hidden selected 不主動清除 hint 不顯示(必告知 user)

---

## L4:Advanced Filter(進階篩選 panel)

DataTable toolbar 的「篩選」按鈕展開 `<DataTableFilterPanel>` — flat 或 1-level nested boolean expression builder。實作 sub-file `data-table-filter-panel.tsx`(同 SortManager 對齊 sub-file pattern,**不另開 5-file**:spec / stories 都消費本檔)。

**M8 對標**:ClickUp 為主 + Notion / Airtable / Coda / Linear。Image ref:user 提供 ClickUp-style 截圖(2026-05-02)。

### 一、Mode

- `mode="flat"`:root children 只裝 condition(無 group)
- `mode="nested"`:root children 是 group,group 內 children 是 condition,**型別鎖死 1-level**

```ts
type FilterCondition = { kind: 'cond'; id: string; field: string; op: string; value: unknown }
type FilterGroup     = { kind: 'group'; id: string; conjunction: 'and'|'or'; children: FilterCondition[] }
type FilterTreeFlat   = { mode: 'flat';   conjunction: 'and'|'or'; children: FilterCondition[] }
type FilterTreeNested = { mode: 'nested'; conjunction: 'and'|'or'; children: FilterGroup[] }
```

`FilterGroup['children']` 只能 `FilterCondition[]` — TypeScript 編譯就拒 over-nest,不靠 runtime check。

### 二、求值策略

採 TanStack `globalFilter` + 自訂 `globalFilterFn(row, _, tree) => evaluateTree(tree, row.original)`,**棄 `columnFilters`**(N 條同 column 不能 OR)。`evaluateTree` SSOT 在 `filter-tree.ts`。**ms-precision when `meta.includeTime=true`**:datetime 比對檢查 column meta,`true` 走 ms 比對(避開 Airtable day-precision 漏邊界地雷)。

### 三、Operator × ValueShape SSOT

`filter-operators.ts` 的 `OPERATOR_REGISTRY: Record<ColumnType, OperatorSpec[]>` 是唯一 truth。Panel 完全 data-driven:field 選 → load op set → 選 op → 由 `valueShape` dispatch picker(`filter-value-picker.tsx`)。`is_set` / `is_not_set` / `is_true` / `is_false`(`ValueShape='none'`)不渲 picker。

ValueShape ↔ DS picker 對照(canonical 2026-05-02):

| Shape | Picker | 備註 |
|------|--------|------|
| `text` | `<Input>` | |
| `number` | `<NumberInput>` | |
| `date_single` | `<DatePicker>` | |
| `date_range` | `<DatePickerRange>` | Ant-style split-input |
| `date_relative` | `<Select groups>` 13 option × 3 group | 過去 / 目前 / 未來(對齊 Linear / Notion idiom 2026-05-04) |
| `datetime_single` | `<DatePicker showTime>` | `meta.includeTime=true` 時 promote |
| `datetime_range` | `<DatePickerRange showTime>` | 同上 |
| `select_multi` | `<Combobox>` | |
| `person_multi` | `<PeoplePicker multi>` 預留 | v1 fallback Input |

### 四、UI canonical

- 第 1 row conjunction 是靜態 `Where` label(`px-3` 對齊下方 Field value 起點 = 12px)
- field 未選 → operator + value picker disabled;同 group 共用 conjunction(toggle 任一 → flip 整 group)
- **空狀態**:無 condition → 只顯 inline `+ 加篩選` CTA(對齊 Notion / Airtable / Linear,**禁止** auto-create 空 row)
- **CTA 位置**:緊貼最後一條 row(text variant 輕量,**廢 SurfaceFooter**),條件與「加入」屬同一語境
- **Trash / 刪除**:row 是 form-control row → text Button(non Inline Action,違 item-anatomy canonical)
- **And/Or Select** `minRows={2}`(2 選項顯式縮 menu 高度);**Where padding** `px-3` align Field
- Header refresh icon:`value !== defaultValue` 顯;ButtonDivider 串接 close X(對齊欄位顯示 chrome canonical)
- **Relative date 群組**:`DATE_RELATIVE_GROUPS` Past / Current / Future,走 `<Select groups>`
- Trigger button checked(`aria-pressed`):`value` 有 ≥ 1 active condition → on(語意:資料被篩,獨立於 refresh)

### 五、Filterable column 判定

| 條件 | 是否出現 |
|------|---------|
| Display column(無 `accessorKey`)| ❌ TanStack 內建限制 |
| Accessor + 有 `meta.type` | ✅ 預設 |
| Accessor + `meta.filterable: false` | ❌ opt-out |
| Accessor + 無 `meta.type` | ❌ 無 type 無法決定 op set |

**Composite column**(兩 field 合一欄):資料 atomic + render composite 是業界共識(Notion / Airtable / TanStack)。要 filter 細顆粒 → 拆 atomic column,不在 panel 另設 composite-filter 機制。

### 六、L4 禁止事項

- ❌ 同 group 混 AND / OR(boolean ambiguity)
- ❌ 動態切換 `mode`(會丟 group 結構,mount 後鎖死)
- ❌ 1+ 層 nest(型別禁;UI 不提供 add-group-inside-group button)
- ❌ Drag handle reorder filter(filter 順序對結果無影響,對齊 ClickUp / Airtable / Notion)
- ❌ Composite column 直接 filter(拆 atomic column)
- ❌ 自開 5-file 結構(spec / stories 合進本 spec + `data-table.stories.tsx`,對齊 SortManager sub-file pattern)

---

## L4 Inline Edit / Nested rows / Row drag(2026-05-04)

對齊 Notion / Airtable type-aware editor + Jira drag idiom @benchmark-unverified。

### Inline Edit — per-column opt-in

`columnDef.meta.editable: boolean | (row) => boolean`(`true` / fn-true 才開)。Commit:blur or Enter → `onCellCommit(rowId, colId, value)`;Cancel:Esc。

| ColumnType | Trigger | Edit mode |
|--|--|--|
| string / url | click cell | `<Input>` autoFocus |
| number / currency | click cell | `<NumberInput>` |
| date | click cell | `<DatePicker>` |
| select / multiSelect | click cell | `<Select>` / `<Combobox>` |
| person / multiPerson | click cell | `<Input>` v1 fallback |
| **boolean** | direct toggle | `<Checkbox>` 無 mode 切換 |
| **url** | **hover cell → Pencil 按鈕(xs iconOnly tertiary)→ click** | `<Input>`(read 永遠是連結)|

### Nested rows — forward TanStack

```tsx
tableOptions={{ getSubRows, getRowCanExpand, state: { expanded }, onExpandedChange }}
```
- Indent:`depth × var(--tree-indent-{sm,md,lg})` token SSOT(`tokens/uiSize/uiSize.css`,跨 TreeView)
- Chevron:注入 first non-`__select__` content cell,rotate-90 展/收
- Click 分權:chevron stopPropagation 不 fire select
- Leaf placeholder:同層 sibling 有 expandable 時 leaf 也佔位
- a11y:row `aria-expanded` / `aria-level`
- Selection cascade:default OFF;`selectionCascade` opt-in 待 v2

### Drag visual SSOT(2026-05-06 v14.5)

Row drag + column reorder + TreeView 共用 `lib/drag-visual.ts`:source `opacity-disabled` 半透(reuse Atlassian Pragmatic 慣例,不 split token)+ DragOverlay ghost(`bg-surface-raised` + `shadow-[var(--elevation-200)]`,**不 dim**)+ 2px primary drop indicator(row 水平 / column 垂直,皆 `bg-primary` `h-0.5` 或 `w-0.5`)。Column 用 pseudo variant(`cloneElement` 不能加 child);row 用 absolute div(2026-05-06 v14.6)。

### Row drag(Jira canonical,v3 已 ship)

`enableRowDrag?: boolean` + `onRowReorder?: (sourceId, targetId, 'before' | 'after')`。Library:@dnd-kit/sortable + @dnd-kit/core。**必填 `getRowId`**(否則 dnd 用 row.index reorder 後錯位)。

- **Handle 視覺**:`<Button variant="tertiary" iconOnly size="xs" startIcon={GripVertical} />`(24px elevated chip:`bg-surface` + `border-divider` + `text-foreground` icon)。**absolute** `left-1 top-1/2 -translate-y-1/2` 浮在 row 左緣 4px inset,**不佔 column 空間**。對齊 Jira backlog row drag idiom(@benchmark-unverified,M22)。不用 `ItemInlineActionButton` 因透明背景在 row 邊界會撞 table border line — tertiary chip 自帶 surface + border 才是 elevated handle 視覺
- **Hover-reveal** `opacity-0 group-hover/row:opacity-100`(Notion / Airtable 共識)
- **Sort × Drag 互斥**:sort.length > 0 → handle disabled + Tooltip(對齊 Notion / Airtable)
- **Top-level only**:nested sub-rows(`row.depth > 0`)不顯示 handle;同 parent level 才能 reorder
- **Position 計算**:active vs over 視覺位置 → `'after'`(往下)/ `'before'`(往上),對齊 `arrayMove` 慣例
- **Consumer-managed mutation**:onRowReorder 收 (sourceId, targetId, position),consumer 自管 splice + setState(Notion / Airtable / Linear pattern,DS 不持有 row order)
- **Virtualization 整合**(v3 fix 2026-05-05):enableRowDrag 自動 `overscan ≥ 10`(避免 source row unmount 導致 useSortable stale)+ drag 期間 freeze `measureElement`(避免 transform 競爭)+ DndContext `modifiers={[restrictToVerticalAxis]}` inline 鎖 Y 軸(避免 X 抖動 loop)
- **3-panel mirror sync**:每 region row 各 mount `useSortable`(共享同 SortableContext.items)自然取得相同 transform;handle 只 render 在 primary region(left 優先,fallback center)避免雙觸發
- **Cross-parent drop 禁止**(已知限制):nested rows 只能同 top-level scope 內重排,子層不能跨 parent;collisionDetection 過濾 same-parent siblings,跨 parent 顯示 invalid drop signal(設計保守,對齊 Notion)

---

## 禁止事項

- ❌ 不使用斑馬紋——hover / selected 已足夠區分行，斑馬紋增加狀態組合的視覺複雜度
- ❌ 無隱藏內容、無 frozen column、非 inline edit 的表格不加外框
- ❌ Body cell 之間不加垂直分隔線——靠 header 建立的欄位邊界引導即可
- ❌ Toolbar 不內建在 DataTable 裡——toolbar 是外部組合，職責分離
- ❌ 截斷文字不無條件顯示 tooltip——只有實際被截斷時才顯示
- ❌ Tag 不可被外層 overflow-hidden 裁掉邊框——Tag 自身 shrink + 內部文字 truncate
- ❌ 數字欄位不靠左對齊——靠右才能縱向比較
- ❌ 不在 column 層級混用對齊策略——行高模式是 table 層級切換
- ❌ 無高度約束時不要期待 header 固定或虛擬捲動——這是模式的取捨

---

## Anatomy 結構例外

DataTable 是 composite multi-section 元件,**不套 canonical 5**(Inspector / SizeMatrix / StateBehavior)而採「按區塊 + 按 feature」拆:`Overview` / `ColumnTypes` / `RowHeightMatrix`(對應 row-height tier 而非 component size)/ `AlignmentRule` / `Features` / `ColorMatrix`(row 多 state 集中)/ `EmptyState`(消費 Empty primitive)。理由:單一 Inspector 無法呈現「資料 schema → column type 對應」這類跨 prop 決策。

---

## 相關

- `../../patterns/action-bar/action-bar.spec.md` — toolbar 的排列、variant、溢出規則
- `../Button/button.spec.md` — row actions 按鈕規則
- `../DescriptionList/description-list.spec.md` — 唯讀屬性列表（非多 row 場景）
- `../TreeView/tree-view.spec.md` — 階層結構的對應元件
- `../../tokens/uiSize/uiSize.spec.md` — `--table-row-*` / `--field-height-*` token
- `../../tokens/color/color.spec.md` — 語義色彩
- `../../tokens/elevation/elevation.spec.md` — 固定欄陰影
- `../Field/field-controls.spec.md` — cell editable 時的 Field Control 共用規則

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `carousel.spec.md`
- `circular-progress.spec.md`
- `scroll-area.spec.md`
- `item-anatomy.spec.md`
