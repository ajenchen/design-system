# DataTable 設計原則

## 定位

DataTable 是基於 TanStack Table 的資料表格元件，提供排序、篩選、選取、欄位操作、虛擬捲動等完整能力。
TanStack Table 負責邏輯，DataTable 負責視覺與互動。

簡單展示場景也用 DataTable（最少 config），不另外維護靜態 Table。
底層使用 `<div>` + ARIA role，不用語義 `<table>`——虛擬捲動需要絕對定位 row，且未來 frozen column 需要獨立 scroll 區域，`<table>` 的佈局模型兩者都不支援。

**不是試算表**——不做公式計算、不做跨 cell 選取。

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

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

每一層建立在前一層之上，可獨立啟用。

| 層級 | 能力 | 狀態 |
|------|------|------|
| **L1 基礎結構** | 骨架、尺寸、border、色彩、高度模式、行高模式 | 本文件 |
| **L2 選取** | row selection、checkbox、批次操作列 | 待定 |
| **L3 欄位互動** | 排序、resize、reorder、pin、顯示隱藏 | 待定 |
| **L4 資料操作** | 篩選、分組、搜尋（統一入口） | 待定 |
| **L5 Cell 能力** | custom renderer、inline edit、validation、copy/paste | 設計決策已定，實作待做 |
| **L6 進階呈現** | 展開列、tree data | 待定 |
| **L7 匯出** | CSV/Excel、列印、context menu | 待定 |

---

## L1：基礎結構

### 一、Table Size

DataTable 有三種尺寸（`sm`、`md`、`lg`），透過 `size` prop 控制。

**Size 不等於 density。** Size 是這張表格的結構決策（需要多緊湊），density 是全域的使用者偏好。同一頁可以有不同 size 的表格，density 全頁一致。

水平 padding 固定,不隨 size 或 density 變化(具體 token 見 `data-table.tsx`);垂直方向由行高模式決定(見第四節)。

### 二、高度模式

**有高度約束 vs 無高度約束，決定可用的功能組合。**

**有高度約束**（指定高度值，或父容器提供高度限制）
- 超出就捲動，header 固定在頂部，虛擬捲動啟用
- 適合大量資料、需要持續操作的場景
- 高度來源可以是明確的 px 值，也可以是 flex 佈局讓 table 填滿剩餘空間（Linear 做法）——這是使用端的 layout 決策，不是 DataTable 的模式

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

### 七、Column Type

**Column type 是資料行為的預設合約。** 指定 type 就自動獲得該類型的對齊、渲染、排序、篩選行為，不需要逐一配置。

每種 type 回答四個問題：
1. **Cell 呈現方式**——純文字、tag、avatar、checkbox 等
2. **對齊**——跟隨資料的閱讀方式（文字靠左、數字靠右、checkbox 置中）
3. **排序**——字母序、數值、時間
4. **篩選**——文字搜尋、範圍、多選

Type 提供合理的預設，但每個問題都可以在 column definition 層級覆寫。

Header 的對齊永遠與該欄 body cell 一致。

### 八、Row 狀態

- **不使用斑馬紋**——hover + selected 兩種狀態已足夠，斑馬紋疊加會產生四種以上的背景色組合，增加視覺雜訊
- **Hover 與 selected 用不同色系**（neutral vs primary-subtle），讓使用者一眼區分「正在看的」與「已選的」

### 九、Row Actions

每列最右側可配置操作（編輯、刪除、複製等）。位於 right-pinned region，不參與水平捲動。

**元件 canonical(2026-04-22)**:Row actions **一律 Button iconOnly, variant="text", size="xs"(固定 24px)**,不隨 row tier 放大,**不套 `dismiss` prop**。

**為什麼固定 size="xs"**:row actions 屬「dense utility affordance」——存在於每一 row 末端,常駐但不搶焦點,是輔助操作不是資料本體。固定小尺寸讓 action region 視覺輕量,資料 cell 為視覺重心。對照 `patterns/element-anatomy/item-anatomy.spec.md` 的「Predicate」+「Real case 表」:row-dedicated action region 屬「高頻小尺寸 utility」家族。

**世界級對照**:
- **Material DataGrid**——row action 固定 24px(`GridActionsCellItem` 用 `IconButton size="small"`,不隨 rowHeight 放大)
- **Polaris DataTable / IndexTable**——row actions 在 hover 顯示,固定 20-24px icon button
- **Atlassian Dynamic Table**——row actions 固定 small iconOnly,不跟 table density 連動
- **Apple HIG(macOS Finder / Mail list row)**——inline actions 固定 ≤24px,不隨 list density 放大

**為什麼不隨 row tier 放大**:row height 變化反映的是「資料密度」(sm / md / lg row 高度 tier),action 不是資料本體,不該跟資料密度同步縮放——否則 lg row 的 action 會變成搶焦點的主要互動元素,violate「action 輔助、data 本體」的資訊層級。

**不套 `dismiss` prop**:`dismiss` 語意是「關閉此訊息 / 忽略此提示」(見 Button spec「Dismiss 視覺類」+ `# 元件 Props 命名原則` callback 命名 canonical — `onDismiss` 指 toast / alert 被暫時忽略),Trash / Delete 是**資料破壞性動作**,語意是 `onRemove`(從集合移除 item),不是 dismiss。視覺用 `variant="text"` 標準 icon button 表達,不套 dismiss 的 icon 色弱化 treatment(dismiss 弱化是為了「訊息關閉不搶焦點」,row delete 需要正常 icon 可讀性)。

**常駐顯示。** Row actions 有獨立的 frozen right region，不佔資料欄位空間，永遠可見。Region 邊界用全高度 `border-divider` 標示。

**收納邏輯：**

| 數量 | 顯示方式 |
|------|----------|
| 1-2 | icon buttons 並排(全 size="xs")|
| 3+ | 前 1-2 個 inline + MoreVertical dropdown(全 size="xs") |

MoreVertical dropdown 包含所有操作，確保鍵盤可存取全部。

**Header/body 寬度同步：** Header 渲染 invisible buttons 佔位(同 size="xs"),確保 header 和 body 的 right region 同寬。

### 十、與 Toolbar 的關係

DataTable 不內建 toolbar。Toolbar 是外部用 action-bar pattern 組合的，保持職責分離。

篩選、排序、分組走統一入口（toolbar 按鈕），不做在表頭的 per-column filter。這些按鈕的 variant 規則見 `action-bar.spec.md`。

### 十一之一、Cell 垂直對齊 + icon 尺寸原則(consumer 自訂 render)

Cell 本體已 `flex items-center`,row 本體也 `items-center`——**consumer 自訂 cell render 直接放內容即可,不需額外包裝控制垂直置中**。

**Icon size canonical(含 CircularProgress / 狀態 icon / 自訂 glyph)**:
- `size="sm" | "md"` → **16px**
- `size="lg"` → **20px**

此規則對齊 DataTable 內部 `iconSize = size === 'lg' ? 20 : 16`(line ~213,driving ChevronDown / Calendar edit indicator)與 Field family canonical(`field-controls.spec.md`)。Consumer 自訂 render 的 icon / spinner 尺寸應走這兩個值,不自由挑 14 / 18 / 24 等非 canonical 數字——否則同一 row 不同 cell 的 icon 會刻度不齊。

canonical 寫法(icon/spinner + text):
```tsx
cell: () => (
  <span className="inline-flex items-center gap-2 text-fg-muted">
    <CircularProgress size={16} /> {/* sm/md table */}
    同步中
  </span>
)
```

**內部實作細節**:DataTable 的 `renderCellContent` 對 consumer 自訂 render(`colType === undefined`)的回傳值做 compound 判斷——`React.isValidElement(content)` 為 true 時 bypass `TruncateCell`。理由:`TruncateCell` 的 `span.truncate` 強制 `white-space:nowrap` + inline baseline context,對 inline-flex / icon+text 自訂結構會造成基線錯位(曾發生:sync cell spinner 基線偏移,即使外層 cell `items-center` 也無效)。

這跟 `isKnownCompound`(select / multiSelect / person / multiPerson / url)走同一條 bypass 分支——SelectDisplay 的 Tag、PersonDisplay 的 avatar+name 都是自帶 layout 的 compound,不該被 truncate wrapper 包。

Primitive 回傳(string / number / `<>plain text</>`)仍走 TruncateCell,有單行省略 + hover tooltip。

常見誤用 → 基線錯位:
- ❌ 在 consumer wrapper 加 `leading-none` 嘗試壓縮行高 → 壓縮 text line box 後,text baseline 與 inline 圖示互搶基線
- ❌ 在 consumer wrapper 加 `h-full` → cell 沒設定明確高度,`h-full` 解為 0 或 auto,無效
- ❌ 在 consumer wrapper 加 `align-middle` → cell 內是 flex context,`align-middle`(inline 屬性)無效

**Debug 協議(cell 對齊任何問題的第一站)**:

若使用者回報 cell 對齊錯位(spinner / icon / tag baseline 不齊),**必先讀 `data-table.tsx` 的 `renderCellContent` + `TruncateCell`(大約 line 86-202)**,再看 cell 內容元件。理由:DataTable 內部有 consumer 看不見的 wrapper 層(TruncateCell 的 `span.truncate` 強制 inline baseline context),根因常在這裡,不在 consumer 元件。

過去吃過的虧:在 CircularProgress 加 `align-middle` / 在 consumer 加 `leading-none` 都是治標,真正的根因是 TruncateCell 包了 consumer 自訂結構 → 浪費幾輪才定位。現在已透過 `React.isValidElement` bypass 修掉(line ~199),新的 consumer element 自動不走 TruncateCell — 但此 debug 協議留著,因為未來任何 cell 對齊類 bug 都應優先查此 pipeline。

### 十一、Cell 單行截斷原則

固定行高模式下，所有 cell 內容都是單行。空間不足時的行為：

- **純文字**（text、number、currency、date、boolean）：文字 `text-overflow: ellipsis`
- **Tag**（select）：Tag 可縮，文字在 Tag 內部 truncate，背景跟著縮——不是整個 Tag 被裁掉
- **多 Tag**（multiSelect）：根據容器寬度動態計算 `+N`，不靠視覺裁切
- **Person**（avatar + name）：avatar 不縮，name 文字 truncate
- **Link**：連結文字 truncate

**截斷必須顯示 `...`（text-overflow: ellipsis），不可硬裁（overflow: hidden 無 ellipsis）。** 每個 Display 元件自己負責 truncation：TruncateCell、Tag 內部 truncate、PersonDisplay name truncate。Cell 的 `overflow-hidden` 只是最後的 safety net，正常情況下子元件應該先 truncate。

被截斷的內容 hover 時顯示 tooltip。自動行高模式不適用此規則——wrap 欄位可換行撐高 row。

### 十二、Inline Edit（L5 設計決策）

全表 inline edit 模式的視覺差異：

**固定行高。** Inline edit 永遠使用固定行高，不支援 autoRowHeight。編輯改變內容時行高不變，其他行不跳動。長文字在固定空間內截斷，需要展開時用 overlay 或 modal。

**分隔線：** Body cell 之間加垂直分隔線——每個 cell 是獨立可編輯單位，需要明確邊界。唯讀模式不加（靠 header 引導即可）。

**Select 類指示器：** 跟 Field 內的行為一致，可選擇的 cell 右側顯示指示 icon：

| Column type | 指示器 | 位置 |
|-------------|--------|------|
| select / multiSelect | ChevronDown | 右側 |
| date | Calendar | 右側 |
| person | ChevronDown | 右側 |
| text / number | 無（focus 時光標就夠） | — |
| boolean | Checkbox 自帶視覺 | 左對齊 |

**外框：** 全表 inline edit 滿足加框條件（見§六），table 加外框。

### 十三、可推導值的原則

**可推導的值用 CSS `calc()` 表達推導過程，不硬寫結果。** 這讓依賴關係留在 code 裡——上游值變動時，下游自動跟著算，不需要有人「記得」去改第三個數字。

### 十四、狀態處理的職責邊界

DataTable 只處理「確定有 column + 有 data（或沒 data）」的情境，不處理生命週期：

| 狀態 | 誰處理 | 做法 |
|------|--------|------|
| **Empty**（無資料）| DataTable 內建 | 自動渲染 `Empty` primitive——保持跟 SelectMenu / Combobox 視覺一致。consumer 不自訂 |
| **Loading** | Consumer | table 外層 CircularProgress / Skeleton。DataTable 本身不跑生命週期判斷 |
| **Error** | Consumer | table 外層 Alert。DataTable 不處理 data 取得失敗 |
| **Disabled**（整表）| N/A | DataTable 是資料展示元件，無整表 disabled 概念；Cell-level 編輯狀態由 Field Controls 管（見 `field-controls.spec.md`）|

**判斷法**：「我知道 data 是什麼嗎？」知道 → 傳給 DataTable；還在載 → 外面 Skeleton；載失敗 → 外面 Alert。

**Dark mode / density**：由 semantic token（row bg / divider）+ `--table-row-*` token 自動切換，無自訂 palette。

---

## 捲軸(pinned header / column + scroll canonical)

**目前實作**:3-panel 架構(left-pinned / center-scroll / right-pinned),center body 使用 **native `overflow-x-auto`**(非 ScrollArea),header 透過 JS `onScroll` 同步 scrollLeft。這是 **世界級 pinned-column table 的主流實作**(對照 Linear / Notion / Airbnb:全部 native scroll + sticky columns;Ant Design ProTable、TanStack Table example 皆同流派)。

**為何不用 `<ScrollArea>`**:
- ScrollArea(Radix)的 viewport 是 nested div 結構,breaking 目前 `centerHeaderRef` / `centerBodyRef` 的 scrollLeft 同步邏輯
- Pinned column 需要**左右 panel 獨立 scroll 但中央 panel 共享 scroll state** — ScrollArea 單一 viewport 設計不適配
- Native scroll 搭配 sticky cols 是全 SaaS DataTable(Linear / Notion / Figma tables / Airbnb Host calendar / Stripe dashboard)canonical

**已知 trade-off(tech debt)**:
- macOS 預設 auto-hide scrollbar → Windows / Linux 有常駐 scrollbar 視覺寬度差異(cross-OS 不一致)
- 緩解:consumer 可 override `className` 加自訂 `::-webkit-scrollbar` 樣式;未來若要 cross-OS 一致可考慮 ScrollArea 重構(列 post-v1 tech debt,需完整 regression test)

**正確性確認**:現況 pinned header/column 同步邏輯運作正常(Airbnb-style 行為),horizontal scroll 的 scrollbar 由瀏覽器管,thumb 位置正確反映 centerBody 的 scrollLeft。

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

## 為何無 Inspector / SizeMatrix / StateBehavior(直接對應 canonical 命名)

DataTable 是**composite multi-section 元件**(header / body / row / cell / toolbar 多區塊組合),每個區塊有自己的設計決策——因此 anatomy 採「按區塊 + 按 feature」拆分,而非 canonical 5 的單元維度:

- **無 Inspector**:DataTable 的關鍵決策是「資料 schema 如何對應 column type」,不是單一 prop 的切換——互動 Inspector 切 sort / filter / pagination 無法呈現「column alignment / row height 與資料類型的關係」。改以 `ColumnTypes` / `AlignmentRule` / `Features`(sort / filter / resize / reorder / pagination) 覆蓋真正的決策面。
- **無 SizeMatrix**(canonical 命名):row 尺寸不是元件層級的 size prop,而是 **row-height tier**(compact / comfortable / relaxed,對應 32 / 40 / 56 px),已由元件特有 `RowHeightMatrix` own——story 名強調 row 而不是 component size,因為 DataTable 整體無 sm/md/lg。
- **無 StateBehavior**(canonical 命名):DataTable 的 state 分散在多層(row hover / row selected / cell editing / loading / empty),集中寫不如分層:row 色彩已在 `ColorMatrix` 覆蓋(header / row / cell 狀態色),空狀態已在元件特有 `EmptyState` own(Empty primitive 消費),編輯 cell 的 state 由 `field-controls.spec.md` SSOT 處理。

對應 anatomy story:保留 `Overview` + 元件特有 `ColumnTypes` / `RowHeightMatrix` / `AlignmentRule` / `Features` / `ColorMatrix` / `EmptyState`(composite 元件的按區塊 / 按 feature 拆分是比 canonical 5 更合適的結構)。

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
