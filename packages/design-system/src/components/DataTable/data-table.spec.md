---
component: DataTable
family: composite
variants: {}
sizes: {}
traits:
  - isStructural
foundational_ssot: true  # 2026-05-18 codify per AGENTS.md「行數預算」:foundational SSOT ≤ 800-1200 line 例外。DataTable 涵蓋 L1-L4 完整 grid taxonomy(structure / selection / sort+filter / inline-edit + drag + nested),為 DS 最複雜 composite + 跨家族 anchor(行對齊 item-anatomy / 浮層對齊 overlay-surface / state 對齊 field-controls)。
benchmark:
  - Ant Design Table: github.com/ant-design/ant-design/tree/master/components/table
  - MUI X DataGrid: github.com/mui/mui-x/tree/master/packages/x-data-grid
  - Polaris IndexTable: github.com/Shopify/polaris/tree/main/polaris-react/src/components/IndexTable
  - Carbon DataTable: github.com/carbon-design-system/carbon/tree/main/packages/react/src/components/DataTable
---


# DataTable 設計原則

## 定位

DataTable 是基於 TanStack Table 的資料表格元件，提供排序、篩選、選取、欄位操作、虛擬捲動等完整能力。TanStack Table 負責邏輯，DataTable 負責視覺與互動。

底層使用 `<div>` + ARIA role，不用語義 `<table>`——虛擬捲動需要絕對定位 row，且未來 frozen column 需要獨立 scroll 區域，`<table>` 的佈局模型兩者都不支援。

**預設不是試算表**——預設模式不做公式計算、不做跨 cell 選取(定位是「資料展示 + row 操作」,非 Excel)。但提供 **opt-in `spreadsheetMode` prop**:啟用後支援方向鍵跨 cell 導覽 + cell editing(見「A11y 預設」Keyboard 行為段),給確實需要 Excel-like 編輯的 productivity 場景。預設關閉以保持單純。(2026-06-01 user 拍板:原「不是試算表」與已 ship 的 opt-in 矛盾,改「預設不是 + 可 opt-in」對齊 code、保留功能)

**Layout Family**：非上述 family — composite / multi-section（多區塊組合，自 own layout）。

**檔案結構**:檔案拆分架構(12 file split matrix)與工程決策史屬 code home — 詳 `data-table.tsx` 檔頭 docblock(2026-06-11 遷移,Level 4;spec 只管設計語言)。

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
| 深層階層結構（部門 / 資料夾 tree）| `TreeView` | DataTable 支援淺層 nested-rows（L4 展開子列），但深層多階縮排 + 大量節點的 folder/dept tree 語意仍屬 TreeView |
| 卡片式瀏覽（圖文並列）| 自訂 grid / list | Table 是密集 row，不適合大圖 |
| 只有 2-3 筆且不需互動 | 直接 `<dl>` 或自訂 layout | DataTable 的 overhead 對小資料集過度工程 |
| 試算表（公式 / cell-level 計算）| 超出範圍，用專門試算表 library | DataTable 的 `spreadsheetMode` 支援跨 cell 選取 / Shift 矩形範圍 / 方向鍵導覽 / cell 編輯,但不做公式或 cell-level 計算 |
| 需要複雜群組 header + 合併 cell | 自訂或 TanStack 原始 API | DataTable 對 header group 的抽象層有限 |

---

## 層級架構(每一層建立在前一層之上,可獨立啟用)

| 層級 | 能力 | 狀態 |
|------|------|------|
| **L1 基礎結構** | 骨架、尺寸、border、色彩、高度模式、行高模式 | ✅ 完成(本文件 L1 段)|
| **L2 選取** | row selection、checkbox、單/多選、bulk action 整合 | ✅ 完成(本文件 L2 段)|
| **L3 欄位互動** | 排序(本文件 L3)、resize、reorder、pin、顯示隱藏 | ✅ 完成(sort + resize + reorder + pin + visibility 全 props 支援:`enableColumnResize` / `enableColumnReorder` / `columnVisibility` / `pinnedLeftColumns` / `pinnedRightColumns`,見 `data-table.tsx` `DataTableProps` 宣告)|
| **L4 資料操作 + Cell 能力** | 進階篩選(本文件 L4 Filter)、inline edit、nested rows、row drag(本文件 L4 段)| ✅ Filter / Inline edit / Nested rows / Row drag v3 完成(Jira canonical + virtualization fix) |
| **L5 進階** | **分頁(本文件 L5 段)**、分組、搜尋、tree data v2 enhancements、export CSV/Excel | ✅ 分頁完成(2026-07-06);其餘待 v2 |

---

## L1：基礎結構

### 一、Table Size

DataTable 有三種尺寸（`sm`、`md`、`lg`），透過 `size` prop 控制。**Size 不等於 density。** Size 是這張表格的結構決策（需要多緊湊），density 是全域的使用者偏好。同一頁可以有不同 size 的表格，density 全頁一致。

水平 padding 固定,不隨 size 或 density 變化(具體 token 見 `data-table.tsx`);垂直方向由行高模式決定(見第四節)。

**Cell / header 字級隨 size,對齊 Field family。** 三種 size 的 cell 與 header 預設字級**必與同 size 的 Field 一致**:`sm`/`md` → `text-body`(14px)、`lg` → `text-body-lg`(16px),SSOT = `fieldDisplayTextClass()`(`field-wrapper.tsx`)。`lg` 行高放大時字級同步放大,避免「字小、行高大」失衡。**機制**:typed cell 由各自 Field 控件吃 `size` 自動套用(cell-registry 各 cell view mode 必傳 `size`,**禁漏傳**否則 fallback md 卡 14px);header 與非-Field 內容(consumer 自訂 cell)由 cell wrapper / header `cn(fieldDisplayTextClass(size))` 套用。`1lh`-based cell-py 公式(見第四節)隨字級自動吸收,row 高不變。

### 二、高度模式(有高度約束 vs 無高度約束,決定可用的功能組合)

- **有高度約束**(固定 `height="400px"` 等具體 px/rem,或 `height="100%"` 由父 flex 提供約束,Linear 做法——都走相同 cap 行為,無 dead surface):資料少→outer 內容高度;資料多→撐到上限後內部 scroll(虛擬捲動啟用,header 固定)。**填滿高度量的是 outer 真正拿到的格子**(2026-09-29,待辦總帳 OE3):父層**內容盒**(扣 padding / border)減掉同一個流向裡的剛性兄弟(工具列、分頁列;`flex-grow > 0` 的兄弟不扣)與 gap;表頭與每個兄弟都在觀察名單上(表頭變高、分頁列後出現都會重算)。同一個父層放兩張填滿高度的表格不支援(各給自己的格子)。閘 `scripts/data-table-invariants.mjs` I37。
- **無高度約束**(auto):內容決定高度,table 框只包住內容;適合少量資料、預覽、嵌入式表格。犧牲:無虛擬捲動(全部渲染)、header 隨頁面捲走、水平捲軸在 table 最底部——這些不是 bug,是模式的取捨

### 三、三區域架構（AG Grid 模式）

Table 分三層:
- **Header**(固定頂部,結構性地在 scroll 容器外、body 上方——不用 CSS sticky,永遠固定在頂部):含 left / center / right 三區,center 區與 body center 的水平捲動 JS 同步 scrollLeft(center-header 跟隨 center-body 捲動位置,同步機制見「捲軸」段 + `data-table.tsx`)。
  **底色與下分隔線分屬兩個宿主**(2026-09-04 定案,兩者的約束不同):
  - **底色**畫在三個 header panel 上(`HEADER_PANEL = 'bg-muted'`),row 不畫 —— `--muted` 半透明,**只准疊一層**,疊兩層會出現深淺差;讓給垂直捲軸的那條 strip 因為在 center panel 內,所以自動同色。
  - **下分隔線**畫在**表頭列群組**(`.dtHeaderRowGroup::after`)上,一條橫貫整表。三個理由缺一不可:
    (a) 用 `border-b` 會讓 panel 從 40 變 41(body row 的線含在 `rowHeight` 的 border-box 內,而 panel 沒指定高度),表頭比每一列高 1px;
    (b) **不能畫在 header panel 上**:center header panel 是**捲動容器**,而絕對定位的子元素屬於捲動溢位內容,會跟著內容位移 —— 實測捲到底(`scrollLeft` = 382)時線的左緣跑到 x = −265,右側 382px 完全沒有線,缺口寬度恆等於 `scrollLeft`。列群組不捲動也不裁切,線因此天生橫貫整表(含 strip),也不會有分段接縫;
    (c) 順帶消掉一個一個元素只有一個 `::after` 的碰撞:左右 header panel 同時掛凍結邊界線 `.dtPanelBoundaryRight/Left::after`,若下分隔線也用 `::after`,兩條規則會合併成 `left:0 right:0 top:0 bottom:0 width:1px height:1px` = 角落一個 1×1 的點,**兩條線同時消失**(2026-09-04 user 回報「釘選欄 header 最右邊的分隔線消失了」「表頭下方分隔線沒延伸到底」的共同根因,由 7a8a2c3a 引入、同日修正)。
  機械閘 `I13` 因此必須**取像素**且必須**涵蓋捲動後的狀態**:第一版 I13 比的是 `getComputedStyle(::after).height` 與 border-box 高,兩個真 bug 都從這個盲點溜過去(見不變條件 (8))。
- **Body viewport**:含 left / center / right 三區;center-body 是唯一的水平 scroll container、也是垂直 scroll container(`overflow-y-auto`),left / right body 不自行捲動(`overflow-hidden`;`scrollTop` 由 center 的 `onScroll` 同步兩側,而任何非 center 區被瀏覽器自己捲動(焦點捲動等)都先導回 center、再由 center 校準三區 —— **雙向收斂、真相源仍只有 center**,見缺陷 C;AR44:V scroll 移進 region 自身,讓水平捲軸落在可視視窗底部,不必捲到內容底才看到)
- **Left / Right 區**:寬度 = 該區欄寬總和,**算出來的不是量出來的**(見不變條件 (9)),不吃水平捲動;frozen 邊界線是 **1px 偽元素**(`width:1px background:var(--divider)`,不佔 box model、不被 Windows 懸浮捲軸蓋 — 2026-05-12 自 `border-divider` 改制的理由保留),分兩段畫、**宿主不同**:表頭段在 header panel 上(`.dtPanelBoundaryRight/Left::after`,panel 高就是 40,`bottom:0` 即到底);列區段在**列區外層**上(`.dtLeftBoundary::before` / `.dtRightBoundary::after`,位置由 `--dt-left-w` / `--dt-right-w` 給,與面板寬同一個數字)。**列區段不能畫在釘選面板上**:面板自己是 `overflow:hidden`,而 `overflow` 的裁切邊是 **padding box**,面板底部那條等同水平捲軸高的透明 border 在它外面 —— 線無論怎麼負向延伸都畫不出來(2026-09-04 一度用 `bottom: calc(-1 * var(--dt-hscroll-gutter))`,版面盒延伸了、像素沒有,是假宣稱)。外層不裁切也不捲動,兩段相接即為視覺整欄高度、頂天立地。**畫線機制統一鐵律(2026-08-20 user 拍板)**:全表 1px 線(欄間短線 / 凍結邊界 / 外框)一律「元素/border」機制,**禁用陰影畫線** — 非整數縮放與 Retina 下瀏覽器對陰影與背景色盒的柵格化取整不同,會讓同規格的線出現 1 vs 2 實體像素的粗細分家(2026-08-20 user 報修錨例);**Center 區**:flex-1,水平 overflow 自行處理

完整 class / overflow 規則見 `data-table.tsx`。

**固定行高確保跨 region 對齊。** 所有 row 用 `h-table-row-{size}`，三個 region 的 row 精確同高。

**Header/body region 寬度同步。** left 與沒有 `rowActions` 的 right 面板:寬度由 Σ 解析欄寬算出,header 與 body 面板寫同一個數字(不變條件 (9));只有 `hasRowActions` 的右面板例外 —— header 面板寬由內容決定(columns + actions),body 面板量測 header 同步(登記的殘留,見六之二之零)。機制見 `data-table.tsx`。(2026-09-05 更正:原句「body region 量測 header 寬度同步」是全面量測年代的敘述,與第六節「算出來的不是量出來的」矛盾。)

### 四、行高模式

Table 層級的模式切換，不是 column 層級。跟 AG Grid / Airtable 的做法一致。

- **固定行高（預設，適合大多數場景）**：所有 row 同高、內容垂直置中——文字、tag、badge、avatar 等不同高度的元件都自然居中，不需處理對齊；文字一律截斷不換行（column 的 `wrap: true` 被忽略）
- **自動行高（適合描述、備註等需完整顯示的欄位）**：row 高度由最高的 cell 決定、內容頂部對齊；垂直 padding 由目標行高推導（單行時製造置中效果，多行時保持頂部對齊）；`wrap: true` 的欄位可換行撐高 row

**垂直內距公式（SSOT，`data-table.css`）**:

```
--table-cell-py = (var(--table-row-{size}) - 1lh) / 2 - 1px
```

`- 1px` **不是微調,是公式的前提**:view 態的內容載體(Field / Textarea 的 `view × naked`)自帶一圈 1px 透明上下框,那是 read↔edit 零跳的幾何佔位(`field-controls.spec.md`;世界級同做法:Bootstrap `.form-control-plaintext`、Atlassian inline-edit read-view),所以實際內容高是 **1lh + 2px** 而不是 1lh。固定行高把這 2px 吸收掉(高度被 `h-table-row-*` 釘死 + `overflow-hidden`),**自動行高是由內容反推高度,2px 會直接進總高**。Field 家族的 `--field-control-py-*`(`tokens/uiSize/uiSize.css`)為了同一個理由本來就帶 `- 1px`,兩式現在同型。

**固定行高不受此項影響有代數理由**:置中盒的位置 = `(H − c) / 2`,與 padding 無關;改公式只會讓 header cell 的盒子從 40 縮到 38(row 仍 40、內容仍置中),而欄寬把手的 1px 線因為 inset 也是 `--table-cell-py`,兩邊同縮、線長不變(實測 21 → 21)。

**機械閘**:`scripts/data-table-invariants.mjs` I7 驗固定行高 == token、**I14 驗自動行高單行 == token**(逐 sm/md/lg)。2026-09-04 之前只有 I7,所以這 2px 靜默存在。

> **已知殘差(刻意不修)**:修正後單行自動 row = token + 1(那 1px 是列的下分隔線,在 border-box 之外),固定 row = token(分隔線含在 border-box 內)。這是「分隔線在不在高度預算裡」的結構性差異,不是同一個 bug;要抹平得寫成 `- 1.5px`,公式會失去可讀性,而且同一張表內所有 row 同模式所以看不出來。

### 五、Header vs Body 的視覺區隔

**兩種垂直分隔線：**

| 類型 | 範圍 | 適用 |
|------|------|------|
| Header 分隔線 | 僅 header 區域（上下留 padding） | 一般非 frozen 欄位之間 |
| Frozen 邊界線 | **整欄高度**(表頭頂端到表格底緣,**貫穿水平捲軸帶**) | frozen column 與 scrollable area 的交界。2026-09-04 起列區段畫在不裁切的列區外層上,所以有水平捲軸時線也一路畫到 border-box 底,不再停在捲軸帶上緣。與 v33.3.2 一致(它特地讓 `.ag-body-horizontal-scroll` 的 spacer 也帶 border 讓線貫穿);先前「只到列區底」的寫法連同其 DS-自有 rationale 一併作廢。|

一般 column 只在 header 有短線——body 的欄位邊界由 header 引導，不需額外視覺噪音。但 frozen column 的邊界是結構性的分隔（固定區域 vs 捲動區域），需要全高度的線來明確標示。Row actions 欄本質上是 frozen right column，左邊界也使用 full-height 分隔線。

#### 三種垂直分隔線的**畫法歸屬**,以及選取欄為何會漏掉(2026-09-24 root cause)

上表原本只列兩種。**實際有三種**,而且三種各由**不同元件**負責畫 —— 這就是選取欄漏線的根因:

| 種類 | 幾何 | 誰畫的 | 什麼情況下不會被畫 |
|---|---|---|---|
| **表頭欄間短線** | 一個行高(`1lh`),垂直置中 | 畫在 **`ResizeHandle` 那個區塊**裡(`showLine` + `lineInsetStart/End="var(--table-cell-py)"`)。進入條件是 `if (!showDivider && !isResizable) return null` —— **只要該畫線就會渲染,與可不可調寬無關** | **選取欄有自己的 early-return 分支,到不了這一段**—— 它是 `headerCellEl` 裡**唯一**這樣的欄。拖拉欄與列動作欄走一般分支,所以有線 |
| **凍結邊界線** | 整欄高度,貫穿水平捲軸帶 | `dtPanelBoundaryLeft/Right` 畫在面板上 | 非面板邊界的欄 |
| **列身欄間線**(僅 inline edit / spreadsheet 模式)| 整格高度 | cell 自己的 `.dtCellGrid` | 選取欄的 render 分支在套上這個 class **之前就 early-return** |

⛔ **這一段的第一版寫錯過,同日更正**:原本寫「系統欄不可調寬 → 不渲染 `ResizeHandle` → 永遠沒線」。**不可調寬不是原因** —— 實測 `with-bulk-actions` 那則故事 `enableColumnResize` 預設 `false`、全部欄位都不可調寬,卻有 5 條表頭線。**兩件事同時成立 ≠ 前者導致後者**;真正的因是 early-return。

**Root cause 一句話:規範用「這是哪一種邊界」定義線,程式碼卻用「這裡剛好渲染了哪個元件」畫線。**
兩者在多數欄位上碰巧一致,所以看起來沒事;**一旦某一欄不渲染那個元件,線就靜默消失,而且沒有任何訊號**。
這是 M37「用一個當時剛好成立的觀察量代替要保證的性質」的標準形狀:
要保證的是「這是一個欄邊界」,實際判的是「這裡有沒有 `ResizeHandle`」。

**歷史怎麼走到這一步**:選取欄原本有自己的 ad-hoc 規則
(`[data-column-id="__select__"]:not(:last-child)` 加 border-right),2026-05-12 退役,
註解寫的理由是「走 inlineEdit canonical」—— 但那句話從來沒有被驗證過:
`dtCellGrid` 碰不到選取欄的 render 分支,`ResizeHandle` 也不會在系統欄渲染。
**退役一條規則時說「改由某某接手」,卻沒有當場驗證某某真的作用得到那個對象** —— 同一族的判準見
`ds-canonical/skills/design-system-audit/references/historical-bugs.md`。

**2026-09-24 補線時我自己又踩了同一族三次**(全部由 user 抓到,留檔警惕):
1. 直接把列身的 `.dtCellGrid`(整格高)套到表頭 → 表頭出現 30px 全高線、隔壁是 21px 短線。
   **一般非 frozen 欄的線不是整高,整高只屬於 frozen 邊界** —— 上表第一行就寫著,我沒讀就照抄隔壁。
2. 給表頭加 `self-stretch` → 表頭格變 39、隔壁 38。**其他表頭格是內容高 + 列的 `align-items:center` 置中**,
   把一般欄撐滿等於把它當成 frozen 在畫。
3. 線的內縮寫成 `top/bottom: var(--table-cell-py)` → 得到 16px,隔壁 21px。
   因為那個 calc 含 `1lh`,而選取欄沒帶表頭字級 class,繼承到根字級(16/24)算出 7,隔壁是 14/21 算出 8.5。
   **正解是直接寫 `height: 1lh` + 垂直置中**,不依賴格子自己的高度與字級推導。

**判準(寫任何一條線之前)**:先答「這是哪一種邊界」,再去看**那一種**的幾何與畫法,
**不要看隔壁那一格怎麼寫就照抄** —— 隔壁可能是另一種邊界,或是靠某個這一欄不會渲染的元件在畫。

**Header 文字弱化。** Header 是結構標籤，不是資訊本體。字體與 body 相同但使用次要文字色，搭配 muted 背景拉出層級，讓視覺重心留在 body 的資料上。

### 六、外框規則

**邊框標記「這裡有使用者看不到的內容」。** 沒有邊框時，使用者無法判斷內容是否有溢出。加框的條件（滿足任一即加）：**垂直捲動**（有高度約束，內容超出容器）／**水平溢出**（欄位總寬超過容器）／**有 frozen column**（固定欄與捲動區域的分界線需要外框歸屬）／**全表 inline edit**（可編輯容器需要邊界提示）。

不加框時，最後一行保留底線自然收尾。加框時最後一行底線去掉，避免與外框 double border。**Prop**：`bordered`（boolean，預設 `true`）。多數場景（有高度約束的虛擬捲動 / frozen column / inline edit 表）都應保持預設；只在**資料量極少、無溢出、嵌在 Card / Section 內已有外框**的展示型場景傳 `bordered={false}` 讓最外層視覺收尾。

### 六之二、Column 寬度 API + 不變條件(2026-05-06 v14.3)

**Column 數量不是品質判準。** 單欄 DataTable 是有效用法（例如只需選取名稱的清單、窄容器中的唯一核心屬性）；`columns` 的數量由業務 schema 決定，不得用「至少兩欄」類 hook 把單欄當成 minimal mock。品質應檢查欄位語意、真實資料與容器布局，不是欄位數。

**命名**:`meta.width` / `meta.minWidth` / `meta.maxWidth`(px)。**不用 TanStack `size`** — DS 內 `size` 既定為 `'sm'|'md'|'lg'` density(49+ 處),避 namespace 衝突。內部 pre-process copy 到 TanStack root,resize feature 正常。No-resize default:`width` = reserve(cell ≥ width,flex 可 grow,不可 shrink)。`enableColumnResize=true`:`width` = 初始,`minWidth` = 拖拉下限(default 80)。**不變條件(invariants,L2 test + hook 守)**:(1) cell width = column width(跟 padding/state/mode 無關)(2) view↔edit cell width 0 delta (3) view↔edit cell height 0 delta(textarea `field-sizing:content`)(4) Field 填滿 cell 高度(1px 容差於 cell.border-r)(5) No-resize column ≥ meta.width。(6) **欄寬只算一次,header 與 body 寫同一個整數**(橫軸)。這是 AG Grid v33(= 我們對照的那一代,header 同樣是獨立 viewport 靠 JS 同步)的模型:欄寬算進 `AgColumn.actualWidth`,`headerCellCtrl` 與 `cellPositionFeature` 各自把**同一個整數**寫成 `style.width`。舊作法把分配交給 CSS flex(`flex: 1 1 baseSize`),由瀏覽器在 header 與 body **兩個容器各跑一次**;只要可用寬度差一點(垂直捲軸 15px、border、取整),`flex-grow: 1` 就把差額**平均攤到每一欄並逐欄累積**(實測 7 欄:0 / 2.1 / 4.3 / 6.4 / 8.6 / 10.7 / 12.9,增量恰為 15/7;4 欄增量恰為 15/4)。現作法:`distributeColumnWidths(bases, maxes, available)` 算一次,`available` **一律取 body 的內容寬**(較窄的那個),取整用**前綴和游標**(`round(累積理想 − 累積已配)`,同 AG Grid `columnFlexService`)讓誤差被下一欄吸收、上限 ±0.5px 不累積,餘數補給最後一欄;撞到 `maxSize` 的欄先凍結再重分配。header 比 body 多出來的寬度變成**尾端空白**,由 panel 的表頭底色蓋住 —— 對應 AG Grid `CenterWidthFeature` 的 `addSpacer`;header 內層 wrapper 的 `minWidth` 因此要 `+ vScrollbarSpacer`,否則捲到最右端 header 會少一個捲軸寬而落後(實測未補時 hMax 382 vs bMax 397)。**原本的 `padding-inline-end` 補償已於 2026-09-03 移除**——它是 flex 模型下「讓兩次計算的輸入相等」的權宜,欄寬改成算一次後不再需要。拖拉欄寬模式(`enableColumnResize`)本來就兩邊同源(同一個 `getSize()`),不進這條路。**三個區都適用**(2026-09-03 補):v33 的 `HeaderCellCtrl.setupWidth` 與 `CellPositionFeature.onWidthChanged` 不分區,釘選欄只是不參與 flex 分配、不是不走「算一次」;釘選欄的解析寬 = `round(getSize())`。**機械閘**:`scripts/test-distribute-column-widths.mjs`(純函式單測 17 條,含 story 走不到的「撞上限凍結 → 重分配」分支)+ `scripts/data-table-invariants.mjs` 的 I11 / I11b(center,含模擬捲軸佔位)與 **I11c(三區各自斷言 header 寬 === cell 寬、左緣重合)**。演算法本體抽成獨立純模組 `column-widths.ts`,才能單測。

(7) **pinned 與 center 的可視列高必須一致**(縱軸,同一根因的孿生)。center body 自己有 `overflow-x:auto`,水平捲軸吃掉它 15px 高;pinned 區沒有捲軸 → pinned 比 center 多露出一條列(實測 300 vs 285),無高度限制時則是表格底緣出現 15px 階差。作法:補等高的**透明 `border-bottom`** 給 left / right body panel。**必須是 border 不是 padding**:`overflow` 的裁切邊是 **padding box**,padding 只會讓 `clientHeight` 不變、列直接畫進 padding 區(實測 padding 版本 `clientHeight` 仍 300,列從 y=784 畫到 799);border 在 padding box 外面,`clientHeight` 因此真的少 15(300 → 285),列才會被裁掉。透明 border 之下 panel 底色照樣畫(`background-clip` 預設 border-box)—— **前提是 panel 自己要宣告底色**,2026-09-04 起兩個釘選面板都帶 `bg-surface`(缺陷 R);同日起這條讓位帶上還疊一條 `overflow-x: scroll` 的裝飾帶,讓水平捲軸的凹槽在釘選區底下連續(缺陷 Q)。

(8) **守兩軸不變條件的機械閘必須取像素、且涵蓋捲動後的狀態**(M32;2026-09-04 兩個真 bug 的教訓,2026-09-05 補進清單 —— 第六節與缺陷 P 早就引用本條,但清單先前只列到 (7)):`getComputedStyle(::after).height` 或版面盒數字會被「版面盒延伸了、像素沒畫」(缺陷 P 的第一次嘗試)與「線隨 `scrollLeft` 位移」(第六節 (b))騙成假綠,所以 I13 取像素、並在 `scrollLeft` = max 時再量一次;同理 I11b / I12 在 gutter = 0 的 CI 上用 15px 透明邊框造出與真捲軸同值的量測,而不是只驗自然狀態。

(9) **釘選面板寬 = 該區解析寬總和,算出來的不是量出來的**(橫軸;2026-09-04 `f3fe9f2e`,2026-09-05 補進清單):left 面板與沒有 `rowActions` 的 right 面板都由 `panelWidth`(Σ `resolvedWidths`)算出,header 面板與 body 面板寫同一個數字,不再「量 header `offsetWidth` → state → 灌給 body」(首幀 0 與取整殘差一併消失)。對照 v33.3.2 [`pinnedColumnService.ts#L166-L192`](https://github.com/ag-grid/ag-grid/blob/v33.3.2/packages/ag-grid-community/src/pinnedColumns/pinnedColumnService.ts#L166-L192) `setupHeaderPinnedWidth`:寫進表頭釘選容器的是 `checkContainerWidths` 由 `visibleCols.getColsLeftWidth()` / `getDisplayedColumnsRightWidth()` 算出的 `leftWidth` / `rightWidth`([`#L40-L54`](https://github.com/ag-grid/ag-grid/blob/v33.3.2/packages/ag-grid-community/src/pinnedColumns/pinnedColumnService.ts#L40-L54)),不是量出來的。**唯一殘留**:`hasRowActions` 時右面板寬仍量 header(rowActions 是 consumer 任意 JSX、無宣告寬;見六之二之零「評估後不改」與缺陷 A / E)。**閘的邊界**(2026-09-05 稽核):I11c 斷言的是結果(三區 header 寬 === cell 寬、左緣重合),不鎖機制 —— 釘選欄若退回 `flex: 1 1 base` 而兩面板仍同寬,I11c 照樣綠;沒有斷言檢查釘選 cell 帶 `flex: 0 0 w` 或 cell 寬 === `round(getSize())`,登記為閘缺口。

**兩軸的量測**都由「每次 render 後」與 ResizeObserver 兩個來源驅動:列數變(分頁/篩選/展開)走前者(這類變化不一定改變被觀察元素的 box size,ResizeObserver 未必送通知),容器尺寸變(視窗/面板拖曳)走後者;**兩軸的補償都不碰 center body 自己的尺寸**(橫軸加在 header 內層 wrapper 的內容寬、縱軸加在 pinned panel 的 border-bottom),所以不形成量測迴圈。(**2026-09-03 更正**:此處原寫「padding 只加在 header 與 pinned 區」—— 兩處 padding 補償都已移除,橫軸改內容寬、縱軸改透明 border,舊敘述已失效。)整數量測刻意用 `offsetWidth/clientWidth`(同一座標系),**不可**改用 `getBoundingClientRect()`—— 縮放時它與 `clientWidth` 不同座標系會算錯;非整數縮放下的殘差實測 ≤ 0.33px(次像素,不可見)。

**表頭底色只准疊一層(2026-09-03 user 抓到視覺落差)**:`--muted` 是**半透明**(light `oklch(0 0 0 / 4%)`、dark `oklch(1 0 0 / 8%)`),所以「底色畫在 header row、讓出的 strip 補在 panel」會在重疊處疊成兩層 —— strip 只有一層,在淺色比欄位區淺一階、深色反過來偏暗。**底色與下分隔線一律畫在三個 header panel 上(`HEADER_PANEL`),row 不畫**,strip 因此天生同色、兩個主題都一致。**同一個原則的世界級對照**:v33 的底色由 `.ag-header`(`width:100%` + `--ag-header-background-color`)畫一次,header cell 是 `position:absolute` 不會延伸到加寬處,所以加寬出來的空白天生就是 header 底色 —— **沒有第二層**,和我們「由橫跨 strip 的容器畫唯一一層、row/cell 不重畫」是同一招。(**2026-09-03 撤回**:先前這裡寫「AG Grid 的 `.ag-header-row::after` 是把 filler 放進 row 裡的一格」—— v33.3.2 原始碼裡 `.ag-header-row::after` 在 pinned / 捲軸這條路徑上沒有這個角色,該句無第一手證據支持,依 M22 撤回。MUI X 的 `GridScrollbarFillerCell` 確實是 row 內一格,但不在本次證據集內,不作為背書。)我們選 panel 而非 row-cell 的理由是 DS 自己的:row 內加格會改變彈性欄寬的項目集合與水平捲動範圍。

**對照基準的版本政策(2026-09-04 登記)**:我們逐條對照的是 **AG Grid v33.3.2**(2025-06-04),而
`ag-grid-community` 現行 `latest` 是 **36.1.0**(2026-08-05)—— **我們落後三個大版本,而且 v33 不是 LTS**
(npm 上唯一的 LTS tag 是 `v32-lts`)。這件事先前 repo 裡沒有任何一處寫下來,先補記免得被讀成「對齊現行 AG Grid」。

- **架構斷點精確落在 36.0.0**,v34 / v35 與 v33 是同一套(捲動類名計數:`ag-body-viewport` 在 33/34/35 各 16/16/17,
  在 36.1.0 是 **0**;`ag-grid-viewport` 反過來 0/0/0 → **9**)。
- **v36 換掉的正是我們現在採用的這套模型**,官方理由逐字([升級文件](https://raw.githubusercontent.com/ag-grid/ag-grid/release-36.0.0/documentation/ag-grid-docs/src/content/docs/upgrading-to-ag-grid-36/index.mdoc) L92):
  > The grid now uses a single container to permit both vertical and horizontal scrolling natively in the browser.
  > Previously the header, body and pinned columns were placed in separate containers with **scrolling synchronised
  > using JavaScript, which led to visible lag** on more complex grids or slower computers.

  **我們現在做的就是那件事**(`data-table.tsx` 的 scrollLeft/scrollTop 同步)。這是「我們的架構選擇有上限」的
  第一手證據,登記在此,不因為結論是「暫不改」就藏起來。
- 同檔 L215:v36 把 `ag-scroller-corner` / `ag-horizontal-left-spacer` / `ag-horizontal-right-spacer` **整組刪掉**,
  理由是「there is one large scrollable region」—— 也就是**我們的缺陷 P/Q/R 那一族在 v36 結構上不存在**。
- **但缺陷 O 不必等 v36**:v33 的垂直捲軸就是 `.ag-body` 的 in-flow 兄弟,結構上已落在整表最右緣。
  不要把 O 的定價綁在 v36 上,那會讓後人高估修 O 的門檻。
- **為什麼不換基準**:v33 回答的是「這個架構的細節我們做對了嗎」,v36 回答的是「這個架構本身選對了嗎」。
  v36 的 DOM 已經沒有可以跟我們逐條對上的東西(它沒有 header viewport 這個概念),換過去不是推翻對照,
  是讓對照**變成不可比** —— 而不可比很容易被讀成「上游沒這個問題所以我們的缺陷不存在」。兩個問題不該同一個基準兼差。
- **我們從未安裝過 ag-grid**(7 個 `package.json` grep `ag-grid` = 0 命中,`node_modules/ag-grid*` 不存在)——
  **純紙上對照:讀原始碼,零執行、零 runtime 量測**。對「欄寬只算一次」這類**演算法**宣稱,讀原始碼是夠的;
  對「捲動手感 / 捲軸外觀 / a11y」這類**行為**宣稱,讀原始碼驗不出來(上面撤回的三條正是踩在這條線上)。
  要實測時用 CDN UMD(`https://cdn.jsdelivr.net/npm/ag-grid-community@<v>/dist/ag-grid-community.js`,兩版都取得到)
  搭一次性 harness,**不進 `package.json`** —— 釘一個停更非 LTS 的套件進 lockfile 與供應鏈面,代價比收益大。

**世界級對照**(2026-09-03 讀 **v33.3.2** 第一手 `.ts` / `.css` 原始碼;**同日更正**:先前這段把 v33 與 v36 混成一份對照,並據此推出一個錯的工程結論,已撤回):

- **結構性免疫來自「寬度單一來源」,不是來自「單一捲動容器」。** v33 的 header **就是獨立 viewport**(`.ag-header-viewport`,由 `GridBodyScrollFeature.setScrollLeftForAllContainersExceptCurrent` 同步 `scrollLeft` —— 跟我們一樣),而欄寬同時只算一次存進 `AgColumn.actualWidth`(唯一寫入口 `setActualWidth`,進門先夾 min 再夾 max),`HeaderCellCtrl.setupWidth` 與 `CellPositionFeature.onWidthChanged` 各自訂閱同一個 `widthChanged`、各自讀同一個 `getActualWidth()` 寫成 inline px;`.ag-cell` 是 `position:absolute` + inline px,**兩邊都沒有任何 `flex-grow`**。`ColumnFlexService.refreshFlexedColumns` 的原始碼註解自陳是 CSS Flexbox「Resolve Flexible Lengths」的 JS 直譯(只支援 grow、不支援 flex-basis)。
- **假捲軸 v33 就有**(`fakeVScrollComp.ts` / `fakeHScrollComp.ts` / `abstractFakeScrollComp.ts` 都在 v33.3.2 的目錄樹裡);**v36** 追加的是「header 併進 body 同一個 scroller」,它解的是**捲動同步與捲軸視覺落點**,不是欄寬分歧。所以先前寫的「要拿到結構性免疫得先改成單一捲動容器,那是另一個量級的改動、不在本次範圍」是**錯的定價**,已撤回 —— 我們現在的「算一次 + 兩邊寫同一個整數」就是 v33 的模型本身,而且 v33 對**三個區**都這麼做,我們也已於同日補上釘選區(缺陷 B)。
- **同型前例**(隱藏原生捲軸 + header 尾端補等寬):**MUI X DataGrid** 的 `GridScrollbarFillerCell`(寬 = `var(--DataGrid-hasScrollY) * var(--DataGrid-scrollbarSize)`)、**Handsontable** 的 `width = getWorkspaceWidth(); if (hasVerticalScroll()) width -= getScrollbarWidth()`;**Glide Data Grid** 整張表同一塊 canvas,同理免疫。
- **仍存在的架構差異**(不是缺陷,是已知取捨):v33 的水平捲軸是 `.ag-root` 層的一條假捲軸、垂直捲軸是 `.ag-body` 的 in-flow 兄弟元素 → 捲軸落在整表最右緣、三區共用同一個 `.ag-body-viewport`,所以「pinned 多露一列」在它那邊結構上不可能;我們用原生捲軸 + 兩軸量測補償達到同一個不變條件。**2026-09-04 撤回**:此處原本寫「換到的是慣性捲動、平台一致的捲軸外觀與零額外 a11y 風險」—— 三條逐條查證都不成立(v33 的 `.ag-body-viewport` 本身就是原生 `overflow-y:auto` + `-webkit-overflow-scrolling:touch`;它的可見捲軸是**代理元素上的原生捲軸**,不是自繪;代理捲軸帶 `aria-hidden`),依 M22 撤回。**真正換到的**只有一件可證的事:不必自己實作代理捲軸元件 —— v33 為此付 `fakeHScrollComp.ts` 174 行 + `fakeVScrollComp.ts` 80 行 + `abstractFakeScrollComp.ts` 110 行 = 364 行,外加 `gridBodyScrollFeature.ts` 776 行的同步(水平 6 個 partner)。代價見缺陷表 O / P / Q。

**機械閘** = `scripts/data-table-invariants.mjs` I11 / I11b(橫軸)+ I12(縱軸)。CI 的 headless Chromium 是 overlay 捲軸(gutter = 0),只驗自然狀態等於空轉——把 padding 整段拿掉 CI 照樣綠;I11b / I12 因此各用一條 15px 透明邊框造出與真捲軸同值的量測(`clientWidth` 不含 border、`offsetWidth` 含),補償分支在任何環境都會被走到(2026-09-03 實測:註入 `::-webkit-scrollbar` 寬度**無法**讓 CI 的捲軸佔版面,此路不通)。對應 `scripts/data-table-invariants.mjs`(script 內 I1-I3 label 字串仍用 `display↔edit` — 2026-07-16 FieldMode display→view 更名前的歷史命名,語意同 view↔edit)。改 `columnSizeStyle` / 切 layout 必跑 invariant test 才 commit。

### 預掛緩衝(overscan)與捲動效能 → `data-table-scroll-performance.spec.md`(2026-09-27 抽出,獨立 SSOT)

「預掛緩衝(overscan)— 隨機器能力自適應」、「六之三、Runtime perf budget canonical」、捲動的結構不變條件、零空白不變條件、快速捲動的列殼、捲動中不量沒人看的東西、每列成本、出殼判準、同一時間最多一列 hover、指標底下那一列永遠有 hover 反應 —— 整段住在 `./data-table-scroll-performance.spec.md`;本檔只留這個指標。

### 六之二之零 / 六之二之一、捲軸專項稽核與兩容器架構已知缺陷清單 → `data-table-known-defects.spec.md`(2026-09-27 抽出,獨立 SSOT)

2026-09-05 捲軸專項稽核的四條「看起來有做、其實沒作用」(α / β / γ / δ)、機械閘 I17 / I18 / I19、評估後不改的三條,與 2026-09-03 對抗式稽核的兩容器缺陷清單(A–U;含 T / I 兩列「登記待補」)整段住在 `./data-table-known-defects.spec.md`;本檔內凡寫「見缺陷 X」「見六之二之零」都指那份清單。

### 七、Column Type

**Column type 是資料行為的預設合約。** 指定 type 自動獲得對齊 / 渲染 / 排序 / 篩選行為,可在 column 層級覆寫。

**對齊只作用在儲存格內容,表頭一律靠左**(2026-09-04 user 拍板:「header 的規格就是要一致,只有內容會置右」)。表頭是結構標籤,一整列標題對齊同一條左緣才掃得順;數值右對齊的目的是讓位數在**資料之間**縱向比較,而標題不是資料、不參與那個比較。**世界級對照(2026-09-05 讀第一手後更正;原句「Polaris IndexTable 只在 body cell 右對齊數值、標題列維持左;Notion / Airtable / Linear 同樣靠左」無 cite 且與原始碼相反,已撤回)**:Polaris 與 AG Grid v33 都是**數值欄表頭與儲存格同向靠右** —— Polaris IndexTable 的 heading 有 [`alignment?: 'start' | 'center' | 'end'`(IndexTable.tsx#L47-L53)](https://github.com/Shopify/polaris/blob/main/polaris-react/src/components/IndexTable/IndexTable.tsx#L47-L53),官方指南寫「[Numeric cells and titles should be right aligned](https://github.com/Shopify/polaris/blob/main/polaris.shopify.com/content/components/tables/index-table.mdx#L173)」,Polaris DataTable 的 [`columnContentTypes: 'numeric'` 整欄靠右(DataTable.tsx#L31、#L47)](https://github.com/Shopify/polaris/blob/main/polaris-react/src/components/DataTable/DataTable.tsx#L31);AG Grid v33.3.2 的 `numericColumn` 同時給 [`headerClass: 'ag-right-aligned-header'` + `cellClass: 'ag-right-aligned-cell'`(defaultColumnTypes.ts#L3-L11)](https://github.com/ag-grid/ag-grid/blob/v33.3.2/packages/ag-grid-community/src/entities/defaultColumnTypes.ts#L3-L11)。**本 DS 刻意偏離**這兩家:authority 是 user 2026-09-04 的拍板(上引原話),DS 自有理由如前(標題是結構標籤、不參與位數比較)。Notion / Airtable / Linear 沒有可驗證的第一手原始碼,不列為對照。**機械閘** = `scripts/data-table-invariants.mjs` I10:量所有型別欄位的**標題左緣**必須落在同一條線(彼此差 ≤1.5px),同時量右對齊欄的**儲存格內容右緣**確實貼齊 cell 右內緣 —— 兩件事分開驗,任何一邊回頭去跟另一邊對齊就會紅。

> **來源總帳(2026-09-04)**:2026-09-03 我曾把表頭一起推到右邊,並在此處寫成「Header 對齊永遠跟該欄 body cell 一致」——那句是**我自己推導的,不是 user 拍板**,且該次改動未經同意。已於 2026-09-04 撤回,本段為現行 SSOT。歷史事實一併記錄:`f8cec708`(2026-04-29,commit 主旨是 sort 重做)在標題與外層之間插入 `flex-1` 的排序點擊區,使外層的 `justify-end` 失去可分配空間,標題被推回最左 —— 在那之前標題文字實際上是靠右的(`text-right` 套在外層、內層 `TruncateCell` 為 `flex-1`)。也就是說「靠左」是那次副作用之後的狀態,而 user 要的正是這個狀態;現在由本段明文定為規格,不再依賴副作用。

select/multiSelect 的 `meta.options` 消費 Select 的完整 `SelectOption` schema(M30 wrapper-extends-primitive;含 icon / iconClassName / description),`meta.selectedItemRenderer` 轉發 Select 同名 API 供 status 類彩色 cell(2026-07-08 補——原 `{value,label}` 窄型別 = 假 SSOT,WM 被迫手刻 bare trigger 實證)。

### 八、Row 狀態

- **不使用斑馬紋**——hover 狀態已足夠區分行，斑馬紋疊加會產生多種背景色組合，增加視覺雜訊
- **選取狀態僅由 row 內的 selection control（`multi`→Checkbox / `single`→Radio）呈現，不另加 selected-row 底色**——避免「勾選框 + row 底色」雙重冗餘指示（2026-05-31 user 決策：有 checkbox 就只用 checkbox 呈現狀態）；hover 用 neutral-hover，與 selection 正交（純表示「正在看的」）。`spreadsheetMode` 的區間格被滑過時維持原色(滑過色只畫在該列的非區間格上),規則見「試算表模式」段。**指標在列或表頭裡的小按鈕上時(巢狀滑過)**:規則與 user 原話只住在 `../../tokens/color/color.spec.md`「Hover 換色配對總則」巢狀滑過段 —— 宿主保留自己的 hover,按鈕自己的滑過色疊在上面(沿同一把灰階往上一階):列上的動作鈕 / 巢狀展開鈕 / portal 出去的**列拖曳把手**時整列維持 `data-hovered` 底色;表頭 ⌄ 欄位選單上時排序區維持 `foreground` 字色(排序箭頭跟著),指到欄寬把手則不算。套到表格是 AI 推導,與 2026-09-04 user 回報「hover inline action 後整列底色消失」被當 bug 修掉同方向。列把手帶**專用**的 `data-hover-row-index` 讓 hover 代理認得它屬於哪一列(不重用 `data-row-index`,那個屬性的其他讀者只該找到列本身);⌄ 外層帶 `data-col-menu` 供排序區的兄弟選擇器認。

### 九、Row Actions

每列最右側可配置操作(編輯、刪除、複製等)。位於 right-pinned region(全高 1px `var(--divider)` 分隔線,機制見「三區域架構」frozen 邊界),不參與水平捲動,**常駐顯示**(對齊 dense data ops 派)。

**Canonical**:Row actions 一律 `Button iconOnly variant="text" size="xs"`(固定 24px),不隨 row tier 放大,**不套 `dismiss` prop**(Trash/Delete = `onRemove` 語意,不是 dismiss)。**Why 固定 24**:row actions 是「dense utility affordance」(輔助 ≠ 資料本體),固定 24 讓資料 cell 為視覺重心;放大會違反「data 本體 / action 輔助」階層。對照 `patterns/element-anatomy/inline-action.spec.md` Real case 表「DataTable row dedicated action column」row。

Action measure 固定不隨 row tier 放大；row tier 只調整資料內容與 padding，utility affordance 維持同一視覺權重。

**收納邏輯(consumer 自建)**:`rowActions` 是 raw callback `(row)=>ReactNode`,DataTable 原樣渲染回傳內容,**不代管計數 / 不自動 MoreVertical 收納**。建議 consumer 自行實作:1-2 個 → icon buttons 並排(全 size="xs");3+ → 前 1-2 個 inline + MoreVertical dropdown(全 size="xs";dropdown 包含所有操作,確保鍵盤可存取全部)。**Header/body 寬度同步**(DataTable 代管):header 渲染同一 `rowActions` 輸出但設為 invisible 佔位,確保 header 和 body 的 right region 同寬。

### 九之二、Cell action primitive 分類(2026-04-29 codified)

SSOT → `patterns/element-anatomy/inline-action.spec.md`「Real case 表」+ Predicate。**核心**:視覺一體用 Inline Action,視覺分離(獨立 column / toolbar)用 Button。

| 位置 | Primitive |
|------|-----------|
| Header cell internal(sort / ⌄ menu / filter funnel / pin)| `ItemInlineActionButton` `size="md"`，讓 action 與 header label 共用同一 item anatomy |
| **Multi-sort header(≥2 columns sorted)** | **隱藏 header arrow + 取消排序 dropdown option**(K7,2026-05-04)— 無 order 編號的單個 arrow 在 multi-sort 是 partial info → 反而混淆;user 走 SortManager panel 看完整 priority(SSOT)。0/1 sort 仍秀 arrow 完整資訊。理由:現行 DS 不顯 sort order 編號,跟 Airtable / Linear / Atlassian / Carbon 純箭頭派一致;multi-sort 時這派需 SortManager fallback(world-class 共識) |
| **Sort arrow 顏色(2026-08-18 user 拍板)** | **繼承點擊區文字色,與 label 完全連動**:靜止 = header 的 `text-fg-secondary`,hover 隨 `hover:text-foreground` 與 label 同升;**禁**釘 `text-fg-muted`、**禁** primary。分家判準:`fg-muted` 家 = 永遠在場的裝飾/affordance 標記(Select trigger chevron / DatePicker 日曆 / SelectMenu 搜尋 / Accordion chevron);sort arrow = **套用後才出現的狀態資訊**(方向即資訊),歸行內圖示 canonical 預設 secondary 階(`item-anatomy.tsx` ItemIcon emphasis 預設)。世界級:Carbon 全狀態 `$icon-primary` 與 label 同階([carbon `_data-table-sort.scss`](https://github.com/carbon-design-system/carbon/blob/main/packages/styles/scss/components/data-table/sort/_data-table-sort.scss))/ Polaris 繼承 `--p-color-text-secondary` 與 label 連動([polaris `IndexTable.module.css`](https://github.com/Shopify/polaris/blob/main/polaris-react/src/components/IndexTable/IndexTable.module.css));Ant 的 active=`colorPrimary` 派(唯一一家)不採 — 與 DS「chrome 低調、狀態不喧嘩」語言衝突 |
| Body cell internal(view endAction / clear / edit indicator)| Field family endAction(自動繼承)。**View 態零恆顯型別 icon(2026-07-08 A 案)**:editable affordance = hover outline(SSOT → field.spec.md L4/L6,`nakedCellEditableDisplayHover`);boolean = live Checkbox(AG Grid 同);url = hover Pencil(click-opens-link 與 edit 衝突的功能性入口,非型別 indicator)。**cell 空值 = 全空白**(2026-07-08 B 案,SSOT → field-controls.spec.md「null / undefined 值」surface 分流表) |
| Row dedicated action column | Button `xs iconOnly` 24px(見「九、Row Actions」) |
| Toolbar | Button(action-bar 共識) |

❌ Header cell 塞 `<Button size="sm" iconOnly>`(權重不一體)/ Body cell 手刻 `<button>` 繞過 Field endAction / Row action column 用 Inline Action(需 chrome affordance)。

### 十、與 Toolbar 的關係

DataTable 不內建 toolbar。Toolbar 是外部用 action-bar pattern 組合的，保持職責分離。篩選、排序、分組走統一入口（toolbar 按鈕），不做在表頭的 per-column filter。這些按鈕的 variant 規則見 `action-bar.spec.md`。

### 十一之一、Cell 垂直對齊 + icon canonical

Cell 已 `flex items-center`,consumer render 直接 inline-flex + gap-2。Icon size:sm/md→16 / lg→20(對齊 Field family,禁 14/18/24 自由挑)。`renderCellContent` 對 `React.isValidElement(content)` true / `isKnownCompound`(select/multiSelect/person/multiPerson/url/date/time)bypass TruncateCell;primitive 才走 truncate + hover tooltip。❌ consumer wrapper 加 `leading-none` / `h-full` / `align-middle` 治標 — 根因常在 TruncateCell 包覆。

### 十一、Cell 單行截斷原則

固定行高下 cell 單行,空間不足:純文字 `text-overflow: ellipsis`;Tag 文字內部 truncate(Tag bg 跟縮);multiSelect 動態 `+N`;Person avatar 不縮 name truncate;Link truncate。每個 view 態元件自管 truncation,Cell `overflow-hidden` 僅 safety net。截斷必顯 `...`(禁硬裁無 ellipsis)。截斷 hover 顯 tooltip。autoRowHeight wrap 模式不適用(可換行撐 row 高)。

### 十二、可推導值用 `calc()` 表達(不硬寫結果)— 上游動,下游自動跟著算

行高與 cell 垂直內距的公式住在**第四節**(`--table-cell-py`),不在這裡重述——同一個公式只准有一個住所。列高 token 本身在 `tokens/uiSize`。

### 十三、狀態處理職責邊界

DataTable 只管「column + data」;Loading / Error / Disabled-整表由 consumer 外層處理。Empty 自動渲 `Empty`。Dark mode / density 走 token。**Loading**(無資料 → 外層 `Skeleton × N rows`;有資料 refresh → 容器疊 `<CircularProgress/>` 24px center + table `opacity-disabled` reuse,**禁**:內建 loading prop / Empty 套 loading / 自定義 opacity)。Skeleton 表示尚無 row shape，refresh overlay 則保留目前資料與 table geometry。

---

## 捲軸(pinned header / column + scroll canonical)

3-panel(left-pinned / center-scroll / right-pinned),center body 用 **native `overflow-x-auto`**(非 ScrollArea),header 透過 JS `onScroll` 同步 scrollLeft。**不用 `<ScrollArea>` 的理由**:Radix viewport nested div 會 break scrollLeft 同步;pinned column 需「左右獨立 scroll + 中央共享 scroll state」,單一 viewport 不適配。

**Tech debt**:macOS auto-hide vs Windows/Linux 常駐 scrollbar,cross-OS 視覺寬度差異。**consumer 不得以 `::-webkit-scrollbar` override**(2026-09-05 撤回原「consumer 可 override」建議):裸 `::-webkit-scrollbar` 會把 overlay 捲軸強制變成佔版面的 classic 捲軸,正是缺陷 H 選用標準屬性 `scrollbar-width: thin` + `scrollbar-color` 的理由;要調整只能走 `--scrollbar-thumb` / `--scrollbar-track` 顏色 token。ScrollArea 重構列 post-v1。**機械閘**(2026-09-08):`scripts/data-table-scrollbar-visibility.mjs` 在任何機器上重現 Windows 幾何(拿掉 headless 的 `--hide-scrollbars` + 根規則造 17px / 11px 傳統捲軸、DPR 1–1.5、另跑原生 CSS 組),對每支 DataTable story 驗「捲動區完整在裁切框內、捲軸外側一半的像素真的是捲軸、slot 縮 1–3px 後不溢出」;`scripts/data-table-scroll-cost.mjs` 量每捲一步的強制排版次數。**未結**:user 在 Windows 回報「兩軸各半看不到」(2026-09-08),Mac 模擬重現不了,已修的是填滿高度時漏扣外框邊框的 2px(自 2026-04-30 起),完整歸因待 Windows 截圖與環境資料(Chrome/Edge 版本、OS 縮放、瀏覽器縮放、哪支 story)。

---

## L2:選取(Selection)

DataTable 的 row selection layer。提供 controlled/uncontrolled state + 視覺 + 鍵盤,搭配獨立 `BulkActionBar` primitive 完成批次 workflow。State contract 跟既有 Field/Switch/Checkbox controllable 慣例一致，不另開 imperative grid-ref mutation path。

### 一、State 模式(discriminated union,2026-06-22 支援反向選取 inverted)

```ts
// 選取模型:include(列舉)/ all(反向,全集 − excluded)
type DataTableSelection =
  | { mode: 'include'; ids: string[] }     // 只選 ids 列(預設)
  | { mode: 'all'; excluded: string[] }    // 全資料集(filter 後)選取,扣掉 excluded

selection?: string[] | DataTableSelection         // controlled;傳 string[] = include shorthand(向後相容)
defaultSelection?: string[] | DataTableSelection  // uncontrolled
onSelectionChange?: (next: DataTableSelection) => void  // 一律 emit union
// (無 totalCount prop — 全集筆數 M 由 consumer 自持;2026-07-13 D1 拍板移除 DS 內零消費 no-op prop)
selectable?: boolean | 'single' | 'multi'  // default false(不啟用);true 等同 'multi';single 永遠 include
isRowSelectable?: (row: TData) => boolean
preserveSelectionOnFilter?: boolean   // default false
```

對齊 `useControllableState` idiom(Field / Switch / Checkbox 已用)+ MUI X DataGrid v8 `rowSelectionModel { type:'include'|'exclude', ids }` / AG Grid `selectAll + toggledNodes` 反向選取共識。**計數(consumer)**:`mode==='all' ? M − excluded.length : ids.length`(M = consumer 自持的全集筆數,DataTable 不收 totalCount prop)。**向後相容**:傳 `string[]` 自動正規化為 `{ mode:'include' }`;但 `onSelectionChange` 一律 emit union(consumer 讀取端需處理兩 mode)。

### 二、Checkbox column

- **位置**:最左,自動 left-pin(不論 consumer pin 哪些 cols)
- **寬度**:固定 40px(system col;不可 resize、不可隱藏)
- **顯示時機**:**always visible**；selection affordance 不依賴 pointer hover，鍵盤與觸控使用者也能直接發現
- **Header tri-state**:none / indeterminate / all,使用既有 Checkbox `indeterminate` prop

### 三、全選邏輯(2-step pattern + 反向選取 inverted)

全選採兩階段，並以 inverted model 表示大型資料集：

1. Header checkbox click(none → all)→ 選**目前可見** rows(filter 後 visible-only)= `{ mode:'include', ids:[…visible] }`
2. 全頁可見已選 → BulkActionBar hint:「已選取本頁 N 個。**點此選取全部 M 個**」
3. 點 hint → consumer `setSelection({ mode:'all', excluded:[] })` 擴 dataset 全選,hint 改:「已選取全部 M 個。**清除選取項目**」
4. **反向選取(inverted)**:all 模式下取消勾選某幾筆 → 加進 `excluded`(`選取 = 全集 − excluded`);再勾回 → 移出 `excluded`。對 10k 筆只載 50 筆**不需列舉其餘 ID**,任意 toggle 順序封閉、O(1)。count = `M − excluded.length`(M = consumer 自持全集筆數),hint 顯示「已選取全部 M 個(排除 K 個)」。

不**一鍵**直接擴 dataset(避免誤觸大量資料,必先 2-step);擴選後的反向扣除由 inverted 模型自動處理。

### 四、互動

- click checkbox → toggle 該 row
- **shift-click checkbox** → 從 anchor row 到當前 row 區間選(內部 track anchor)
- header checkbox click → toggle 全可見
- **整 cell 區可點擊**(canonical):選取格的 padding 任何位置(不只視覺 checkbox 本體)點擊都觸發 toggle / select,表頭全選格同理。Disabled row 不觸發。**表頭全選格只在 `mode="multi"` 可點**:`single` 模式沒有「全選」這回事(RadioGroup 一次只能選一列),表頭選取格與「可選的列為 0」時一樣停用(`data-table.tsx` `isHeaderDisabled = selectableVisibleIds.length === 0 || mode !== 'multi'`;2026-09-27 補寫,此前只在程式裡)。實作:select cell 容器 div 的 `onClick` 委派到 `toggleRow` / `setSelection`,內部 checkbox / radio 用 `stopPropagation` 避免重複觸發。
  - **理由已於 2026-09-24 換掉。** 舊理由寫的是「擴大 hit target 且不要求精準瞄準」—— 那是觸控論述,而 user 2026-09-24 裁示本 DS 以滑鼠指標的精度為前提,不拿觸控尺寸建議當依據。同日我一度依據另一條規則把 `onClick` 拿掉,**也是錯的,當天改回來**。
  - **現行理由是世界級一手對照**:AG Grid / MUI X Data Grid / react-data-grid / Glide Data Grid 四家的 cell 都是點擊目標,而且**四家沒有任何一家讓選取格的空白處變成死區** —— AG Grid 聚焦該 cell(原始碼註解逐字 "we need to make sure the cell wrapping that checkbox is focused")、MUI X 該 cell 出現 focus outline、react-data-grid 該 cell 變 active cell、Glide 直接選列(整格無命中測試)。
  - **「命中區 = 懸停回饋形狀」那條規則不適用於表格的格**:三家是「hover 畫在列、點擊目標卻是格」,形狀本來就不一致。那條規則的成立範圍是**控件層**(按鈕、行內動作),owner 與撤回紀錄見 `ds-canonical/references/hit-area-canonical.md`「適用範圍」節。
  - **也不依「有沒有畫垂直格線」分流**:查無一手依據。真正切的那一刀是 `cellSelection` 這類 feature flag —— AG Grid 的 `columnBorder` 預設是透明色,同一份 DOM、同一份 JS,只差上不上色。
  - **選取欄在格線模式下有自己的欄間線**(user 2026-09-24 拍板補回來)。它曾有過專用規則,2026-05-12 退役時說好「走 inlineEdit canonical」,但 tsx 的選取欄分支在套上 `dtCellGrid` 之前就 early-return —— 舊線拿掉、新線沒接到,**兩頭落空**。實測全表 325 個格有格線、選取格是唯一沒有的那一個,勾選框與第一個資料欄視覺上併成同一個盒。現在列身與表頭都套 `dtCellGrid`,本區最後一欄仍不畫(`data-dt-last-col`,凍結邊界線 / 外框接管)。**這條跟可點範圍無關** —— 上一條已明記「有格線 → 整格可點」查無一手依據;補線是視覺 bug 修復,兩件事不綁在一起。

### 五、Disabled rows

- prop:`isRowSelectable?: (row) => boolean`
- 視覺:**僅 checkbox disabled + 灰**;**row 其他 cell 內容正常 render**——不可選取不代表該 row 的資料失去資訊價值
- 全選跳過 disabled rows

### 六、Selection × filter / sort 互動

- **`include` 模式**:filter 套用 → filtered-out 的 selected rows 預設清掉，避免使用者對目前看不見的列執行批次操作
- **`all`(反向)模式**:語意 = 「全部**符合當前 filter**的列 − excluded」→ filter 變動時 selection set 隨 filter **自然重算**(M 跟著變),`excluded` 保留不清(被 filter 掉的 excluded 列無害,回到該 filter 時仍排除);**不**套用上面的 include-mode 清除。consumer 計數用更新後的全集筆數 M(consumer 自持)。
- **opt-in `preserveSelectionOnFilter={true}`**(僅 include 模式)→ 給 productivity scope(Linear / Airtable 用法),保留 hidden selected,BulkActionBar 顯示「{visible} selected ({hidden} hidden by filter)」
- sort 套用 → selection 全保留(sort 不影響可見性,兩 mode 同)

### 七、BulkActionBar 整合(inline composition canonical)

`BulkActionBar` 是獨立 primitive(`../BulkActionBar/`),不內建。Consumer flex-column 容器 inline composition,**toolbar 永遠保留**，讓 filter / sort / search 在 selection 期間仍可用。Hint banner 用 `<Alert variant="neutral" placement="fixed">` + ReactNode title(資訊性 hint 非 info hue,canonical 見 `data-table.stories.tsx` WithBulkActions)。4 layout use case 詳 `../BulkActionBar/bulk-action-bar.spec.md`。

### 八、a11y 預設

- 每個 row checkbox 必有 `aria-label`:consumer 提供 `getRowAriaLabel?: (row) => string`,fallback `'選取此列'`
- header checkbox `aria-label="全選可見列"`
- 鍵盤:`Space` toggle / `Shift+Space` 擴 range / `Cmd/Ctrl+A` 選全可見 / `Esc` clear
- Selection 變更可選 `aria-live="polite"` 通知(consumer-implemented)
- **Multi mode 用 Checkbox / Single mode 用 Radio**，兩者在同一 row density 使用 sm。Single mode 內部 wrap `RadioGroupPrimitive.Root` 提供 context,header checkbox 抑制(single 無「全選」概念)。

### 九、L2 禁止事項

- ❌ 不用 hover-show checkbox(always visible canonical)
- ❌ 不在 disabled row 整 row 灰底,只 disable checkbox
- ❌ 不直接 row click 選取(預防誤觸,只 checkbox / 鍵盤)。例外:`selectable="single"` 可 opt-in
- ❌ 不一鍵擴 dataset 全選(必先「選本頁 + hint 點擊擴 dataset」2-step)
- ❌ Filter 後 hidden selected 不主動清除 hint 不顯示(必告知 user)

---

## L4:Advanced Filter(進階篩選 panel)

DataTable toolbar 的「篩選」按鈕展開 `<DataTableFilterPanel>` — flat 或 1-level nested boolean expression builder。實作 sub-file `data-table-filter-panel.tsx`(同 SortManager 對齊 sub-file pattern,**不另開 5-file**:spec / stories 都消費本檔)。結構 authority 是本節型別與 user 提供的 2026-05-02 reference image；外部產品名稱不作規則證據。

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

Panel 額外公開兩個正交控制:

```ts
interface DataTableFilterPanelProps<TData> {
  maxConditions?: number
  labels?: Partial<DataTableFilterPanelLabels>
}
```

- **`maxConditions`**:計算 condition leaf 總數。flat = `tree.children.length`;nested = 所有 `group.children.length` 加總。未傳 = unlimited;有限值先 `floor` 並 clamp 至 ≥ 0,非有限非法值(NaN / -Infinity)fail closed 為 0。到 cap 後 initial-mount auto row、flat add、nested group 內 add、root add group、cell prefill 五條路徑全部拒絕;prefill 即使被拒仍呼叫 `onPrefillConsumed`，避免同一 request 重試迴圈。Controlled `value` 已超 cap 時**不裁資料**，只停用後續新增。
- **`labels`**:跟 `DATA_TABLE_FILTER_PANEL_DEFAULT_LABELS` shallow + nested maps deep merge。涵蓋 panel chrome、Where/And/Or、欄位/operator/value placeholder 與 accessible name、刪除/新增/移除、multi-select 子 picker 的 trigger / empty 文案、PeoplePicker 的 trigger / search / empty 文案，以及 operator / relative-date group / option label maps。Panel dispatch 必須把這些子 picker 文案完整下傳，不能漏回 Combobox / PeoplePicker 的獨立 zh-TW defaults。Operator 未 override 的 key 回退 `OPERATOR_REGISTRY[].label`，registry 仍是預設文字 SSOT。

### 二、求值策略

採 TanStack `globalFilter` + 自訂 `globalFilterFn(row, _, tree) => evaluateTree(tree, row.original)`,**棄 `columnFilters`**(N 條同 column 不能 OR)。`evaluateTree` SSOT 在 `filter-tree.ts`。**比對精度(2026-07-04 Q6 實作)**:panel 建 condition 時把 `meta.includeTime` 固化為 `condition.datePrecision`('ms' / 'day';`evaluateTree` 簽名不變)— date ops 預設 day 級(本地 `startOfDay` 截斷,AG Grid / MUI X 慣例;`is` 同步走日期比對非字串),`includeTime=true` 才 ms 全精度(避開 Airtable day-precision 漏邊界地雷)。

### 三、Operator × ValueShape SSOT

`filter-operators.ts` 的 `OPERATOR_REGISTRY: Record<ColumnType, OperatorSpec[]>` 是唯一 truth。Panel 完全 data-driven:field 選 → load op set → 選 op → 由 `valueShape` dispatch picker(`data-table-filter-value-picker.tsx`,@internal;2026-07-14 file-size 拆檔自 panel)。`is_set` / `is_not_set` / `is_true` / `is_false`(`ValueShape='none'`)不渲 picker。

`ValueShape` 是 DataTable 篩選編輯器的封閉內部命名空間；其中 `text` 只表示以 `<Input>` 編輯篩選值，與 Button 等元件各自命名空間中的同名視覺 variant 無關，不可跨 namespace 合併或推導語意。

ValueShape ↔ DS picker 對照(canonical 2026-05-02):

| Shape | Picker | 備註 |
|------|--------|------|
| `text` | `<Input>` | |
| `number` | `<NumberInput>` | |
| `date_single` | `<DatePicker>` | |
| `date_range` | `<DatePickerRange>` | Ant-style split-input |
| `date_relative` | `<Select groups>` 13 option × 3 group | 過去 / 目前 / 未來三個時間方向群組 |
| `datetime_single` | `<DatePicker showTime>` | `meta.includeTime=true` 時 promote |
| `datetime_range` | `<DatePickerRange showTime>` | 同上 |
| `select_multi` | `<Combobox>` | |
| `person_multi` | `<PeoplePicker>` 多選 | 2026-05-07 升級為真 picker,吃 `column.meta.people` |

### 四、UI canonical

- 第 1 row conjunction 是靜態 `Where` label(`px-[var(--field-px)]` 對齊下方 Field value 起點 = 12px)
- field 未選 → operator + value picker disabled;同 group 共用 conjunction(第 2 條 row 是唯一可改的 And/Or Select,改動連動整 group;第 3 條起唯讀顯示當前 conjunction — A6 canonical)
- **空狀態(兩態,G fix 2026-05-04 v2)**:initial mount 且 value 空且 `maxConditions` 尚有容量 → auto-add 1 條空 condition row(field 未選 → operator / value 自動 disabled;讓 user 直接看到 row shape,不必先點 CTA;useRef gate 只 mount 一次);`maxConditions=0` 不 auto-add。user 手動刪光 → 只顯 inline `+ 加篩選` CTA、不 re-add，尊重已明確執行的清空意圖
- **CTA 位置**:緊貼最後一條 row(**廢 SurfaceFooter**),條件與「加入」屬同一語境;root-level「加篩選 / 加入篩選器」用 `tertiary`(輕量但有邊界,符合 root-CTA 重量),group 內「加入巢狀篩選」才用 `text`(更輕,inline 於 group 內)
- **Trash / 刪除**:row 是 form-control row → text Button(non Inline Action,違 item-anatomy canonical)
- **And/Or Select**:不再需要縮選單高度(2026-09-08 起選單 0 筆走與選項等高的訊息列、無最小高度,舊 `minRows` 已退役);**Where padding** `px-[var(--field-px)]` align Field
- Header refresh icon:`value !== defaultValue` 顯;ButtonDivider 串接 close X(對齊欄位顯示 chrome canonical)
- **Relative date 群組**:`DATE_RELATIVE_GROUPS` Past / Current / Future,走 `<Select groups>`
- **Labels / i18n**:所有 panel-owned 可見文字與 accessible name 經 `labels`；operator 與 relative-date maps 是 nested partial override。Column header / option label 仍由 consumer 的 `ColumnDef` 提供，不由 panel 翻譯。
- **Readable secondary copy**:`Where` / 第 3 列起 conjunction 與 field placeholder 用 `fg-secondary`，在 `surface` / nested `muted` 背景維持 WCAG AA 正文對比；不可退回只適合弱化 icon / 非正文 metadata 的 `fg-muted`。
- **Condition cap**:任何 add CTA 到 cap 時保留於原位置但 disabled；group creation 本身帶 1 個 condition，故消耗 1 容量。刪除後立即恢復新增。
- Trigger button checked(`aria-pressed`):`value` 有 ≥ 1 active condition → on(語意:資料被篩,獨立於 refresh)

### 五、Filterable column 判定

| 條件 | 是否出現 |
|------|---------|
| Display column(無 `accessorKey`)| ❌ 慣例排除 — 判定實際只看 `meta.type`(display column 不設 type 即不出現;非 TanStack 機械限制,設了 type 仍會列入)|
| Accessor + 有 `meta.type` | ✅ 預設 |
| Accessor + `meta.filterable: false` | ❌ opt-out |
| Accessor + 無 `meta.type` | ❌ 無 type 無法決定 op set |

**Composite column**(兩 field 合一欄):資料 atomic + render composite 是業界共識(Notion / Airtable / TanStack)。要 filter 細顆粒 → 拆 atomic column,不在 panel 另設 composite-filter 機制。

### 六、L4 禁止事項

- ❌ 同 group 混 AND / OR(boolean ambiguity)
- ❌ 動態切換 `mode`(會丟 group 結構,mount 後鎖死)
- ❌ 1+ 層 nest(型別禁;UI 不提供 add-group-inside-group button)
- ❌ Drag handle reorder filter(filter 順序不改變 boolean expression 的求值結果，提供 reorder 只會產生虛假 affordance)
- ❌ Composite column 直接 filter(拆 atomic column)
- ❌ 自開 5-file 結構(spec / stories 合進本 spec + `data-table.stories.tsx`,對齊 SortManager sub-file pattern)

---

## L4 Inline Edit / Nested rows / Row drag(2026-05-04)

### Inline create row(表格底部「+ 新增」列)— 只定義 idle 態(2026-07-08 WM 戰役 codify,user 拍板)

**點擊後的編輯內容 consumer 自組**(常被客製,不 canonical 化、不加 DS API):TanStack headless 無此 feature(https://tanstack.com/table/v8/docs/guide/custom-features)、AG Grid 無內建(官方 blog 教 pinned row DIY:https://blog.ag-grid.com/add-new-rows-using-a-pinned-row-at-the-top-of-the-grid/)、Ant ProComponents 只定義 trigger 列。**可定義的只有尚未點擊的 idle 列**,幾何全消費既有 token(零新值):

- **高度** = `h-table-row-{size}`(與 data row 精確同高 — 上方「三 region row 精確同高」延伸到此列)
- **左 padding** = `--table-cell-px`,「+ icon + 文字」對齊**第一資料欄**內容起點(啟 selection / drag 系統欄時同樣對齊第一資料欄,Notion / Airtable 同)
- **Typography** = cell 同字級(`fieldDisplayTextClass(size)`)+ `text-fg-muted`(placeholder 語感);Plus icon 同 `fg-muted`
- **Hover** = 整列 `neutral-hover` + cursor-pointer,**整列可點**(hit-target 對齊 L2「整 cell 區可點擊」)
- **點擊 → inline**(不強制開 dialog;欄位複雜的 create 另走 Dialog 可並存);建議行為(非契約):Enter 提交後保持編輯態連續新增(Jira inline create idiom)、Esc 還原 idle 列
- **拒絕**:Ant 式全寬 dashed 按鈕(表單語境 idiom,dashed 不在 DS 視覺語言);idle 列是 row 形(Notion「+ New」/ Airtable plus row / Asana「Add task…」line 資料庫工具共識)

### Inline Edit — per-column opt-in

`columnDef.meta.editable: boolean | (row) => boolean`(`true` / fn-true 才開)。Commit:blur or Enter → `onCellCommit(rowId, colId, value)`;Cancel:Esc。例外:autoRowHeight string cell 的 edit 是 `Textarea` — Enter 換行、`Cmd/Ctrl+Enter` commit(blur 同 commit)。

| ColumnType | Trigger | Edit mode |
|--|--|--|
| string | click cell | `<Input>` autoFocus |
| number / currency | click cell | `<NumberInput>` |
| date | click cell | `<DatePicker>` |
| select / multiSelect | click cell | `<Select>` / `<Combobox>` |
| person / multiPerson | click cell | `<PeoplePicker variant="naked">`(選人 picker) |
| **boolean** | direct toggle | `<Checkbox>` 無 mode 切換 |
| **url** | **hover cell → Pencil 按鈕(xs iconOnly tertiary)→ click** | `<Input>`(read 永遠是連結;cell click 走 anchor 開連結,**不**進 edit)— 屬下方「navigate-valued cell 通用類別」|

### Navigate-valued cell 通用類別(2026-07-08 user 拍板 codify — 原 url 專屬條文升級)

**定義**:凡「點值的主行為 = 導航/開啟而非編輯」的型別(url;未來 parent / email / file / relation 同類),一律繼承四條 — 新型別只在上表登記一行,其餘全繼承,禁逐型別重刻:

1. **排除 click-to-edit 與 hover outline**(code gate `data-table.tsx` editable-click 判斷排除該型別 — 此前只活在 code,本段為條文 SSOT):值可點 = click 屬導航,cell 不再是「點擊進 edit」目標,hover outline(field.spec.md L4)一併不套
2. **排除 Enter / F2 進 edit**(下方鍵盤段「非 boolean/url」既有規則,類別化後隨表繼承)
3. **唯一 edit affordance = hover Pencil**(xs iconOnly tertiary,`opacity-0 group-hover/cell:opacity-100`,onClick `stopPropagation` + `onRequestEdit`)— 對齊 AG Grid 官方三件套(`suppressClickEdit` + 「including a button in your cell renderer」+ `startEditingCell()`,https://www.ag-grid.com/react-data-grid/cell-editing-start-stop/)+ Jira hover-pencil + Notion title cell hover-OPEN 鏡像;Atlaskit target-tag 分流(點 `<a>` 導航、點空白區編輯)為次選已評估不採(與 hover-outline 統一 affordance 衝突)
4. **edit 觸發後 = 一般 field 行為契約**:Pencil 只負責「進入 edit」一步;進入後 autoFocus 進輸入、Esc 取消、Enter/blur commit、驗證時機、focus 樣式全部回歸 field-controls edit-mode canonical,與其他型別 cell edit 零特例。若 edit 態控件與 form 場景不同(url 用 plain `<Input>` 非 LinkInput — LinkInput edit 預設顯 link 態,cell 需直接輸入),**必在上表該行寫明 documented 例外 + rationale**,禁只留 code 註解

### 試算表模式(`spreadsheetMode`):點格、焦點框、區間色(2026-09-26)

**來源**:user 2026-09-26 同意三條改法(待辦總帳 `governance/planning/2026-09-25-interaction-and-hover-remediation.md` X35 / L7)。三條都只作用在 `spreadsheetMode`;預設模式與勾選列模式不變。

| 情境 | 規則 | 依據 |
|---|---|---|
| **點任何格** | 格游標(藍框)移到被點的那一格 —— **唯讀格、開關格與連結格的空白處都一樣**。Shift+點 = 從起點延伸區間(藍框留在起點);再點一次已選的格 = 進編輯,**只限**「點格即編輯」的格,唯讀 / boolean / url 沒有可進的編輯,游標留在原格。格內自己處理點擊的控件照舊:勾選框切換值(commit 後游標本來就回到該格)、連結開連結、鉛筆鈕進編輯。**滑過樣式不變**:淺框提示與手形游標仍只給點格即編輯的格 | W3C APG grid 原文「In a grid, every cell contains a focusable element or is itself focusable, regardless of whether the cell content is editable or interactive.」([grid-pattern.html#L74](https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/grid/grid-pattern.html#L74));AG Grid 36.2.0 按下即 `focusCell`,不看能不能編輯([cellMouseListenerFeature.ts#L183-L196](https://github.com/ag-grid/ag-grid/blob/0fee5b7b1e839ae23fe860e404042448f3c1375d/packages/ag-grid-community/src/rendering/cell/cellMouseListenerFeature.ts#L183-L196));MUI X 9.14.0 放開時 `setCellFocus`([useGridFocus.ts#L390-L427](https://github.com/mui/mui-x/blob/c83b3dd6996f6913947b1be3e5d47655153ced60/packages/x-data-grid/src/hooks/features/focus/useGridFocus.ts#L390-L427));Handsontable 唯讀格「still allow navigation and copying of data」([read-only cells](https://handsontable.com/docs/javascript-data-grid/read-only-cells/))。DS 內部:方向鍵本來就走得到唯讀格(可走的欄只排除勾選欄),修前「滑鼠點不到、鍵盤走得到」自相矛盾 |
| **根節點與格游標只畫一個框** | 有格游標時,焦點框 = 那一格的 DS 焦點框(`focus-ring-inset`,2px `--ring` 往內),表格根節點**不畫**;此刻沒有格游標(例:按 Esc 清掉之後)才由根節點畫同一種內描邊。勾選列模式沒有格游標,仍由根節點畫。滑鼠點格與鍵盤移動看到的是同一個框;焦點離開格線區時格游標框收起(見表下第一條) | `ds-canonical/references/focus-canonical.md` A 類把「DataTable 根」列為「框畫在被指到的那一項上、容器抑制瀏覽器預設外框」,「框怎麼畫」只准三種幾何(原本的 1px `--primary` 是第四種,而且與根節點 2px 框同時出現 = 兩個焦點指示)。世界級(R21 實測)都只在格上畫、容器不畫:AG Grid「cells use a border only to indicate focus」([_general.css#L409-L420](https://github.com/ag-grid/ag-grid/blob/0fee5b7b1e839ae23fe860e404042448f3c1375d/packages/ag-grid-community/src/theming/core/css/_general.css#L409-L420))、MUI X 根 `outline: 'none'`([GridRootStyles.ts#L184](https://github.com/mui/mui-x/blob/c83b3dd6996f6913947b1be3e5d47655153ced60/packages/x-data-grid/src/components/containers/GridRootStyles.ts#L184))、APG `[role="gridcell"]:focus` 點線框([dataGrids.css#L72-L78](https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/grid/examples/css/dataGrids.css#L72-L78))。**框的粗細不是世界級共識**(AG Grid 1px `border: 1px solid`([_grid-layout.css#L281-L291](https://github.com/ag-grid/ag-grid/blob/0fee5b7b1e839ae23fe860e404042448f3c1375d/packages/ag-grid-community/src/theming/core/css/_grid-layout.css#L281-L291))、APG 3px 點線(同上 dataGrids.css))—— 2px 取自 DS 自己的焦點框幾何 |
| **區間格 × 列被滑過** | 區間格(`--primary-subtle`)在它那一列被滑過時**維持原色,淺深一致**;同一列的非區間格照常變 `--neutral-hover`,顏色與沒有區間的列相同。做法:含區間格的列被滑過時,滑過色不畫在列上、改畫在該列的非區間格上(`data-table.css`)。修前淺色不變(`--primary-subtle` 不透明)、深色 #1C304A → #243851(alpha 公式讓列的滑過色透上來) | 不新增 token(`../../tokens/README.md`「找不到現有 family 可鏡射 → 先質疑是否真需要」)、彩色底不疊層(`../../tokens/color/color.spec.md`「疊層只用在「底」」)、DS 內 `--primary-subtle` 被滑過從不換底(按下的 Button 只換字色)。世界級**兩派都有,不是共識**:MUI X 同列別格被滑過時選中格不變([GridRootStyles.ts#L142-L151](https://github.com/mui/mui-x/blob/c83b3dd6996f6913947b1be3e5d47655153ced60/packages/x-data-grid/src/components/containers/GridRootStyles.ts#L142-L151)),AG Grid 讓列滑過透進區間([_grid-layout.css#L375-L392](https://github.com/ag-grid/ag-grid/blob/0fee5b7b1e839ae23fe860e404042448f3c1375d/packages/ag-grid-community/src/theming/core/css/_grid-layout.css#L375-L392))。本段依上面三條 DS 既有規則選前者 |

- **焦點離開格線區時格游標框收起**(2026-09-26,**AI 依 (b) 推導 —— (b)「只留一個焦點框」為 AI 建議、09-26 user 未另提 → AI 判讀照建議做,方向來自 user 原話「一個藍色focus ring 就已經夠顯眼了」**):格游標框只在焦點在格線區裡時畫 —— 表格根節點、某一格裡(含格內控件,例:勾選框)、或浮層編輯器。焦點 Tab 到表頭控件(排序區、⌄ 欄位選單)或離開表格時,框收起、**游標位置保留**,Tab / Shift+Tab 回到表格時原格重現;區間底色不受影響(選取不是焦點)。否則那一刻是「表頭控件的焦點框 + 格游標框」兩個一模一樣的藍框。對齊資料表格派:格上的框只在格(或格內)有焦點時畫 —— AG Grid `.ag-cell-focus…:focus-within`([_grid-layout.css#L281-L291](https://github.com/ag-grid/ag-grid/blob/0fee5b7b1e839ae23fe860e404042448f3c1375d/packages/ag-grid-community/src/theming/core/css/_grid-layout.css#L281-L291))、MUI X `& .cell:focus`([GridRootStyles.ts#L266-L269](https://github.com/mui/mui-x/blob/c83b3dd6996f6913947b1be3e5d47655153ced60/packages/x-data-grid/src/components/containers/GridRootStyles.ts#L266-L269))、W3C APG `[role="gridcell"]:focus`([dataGrids.css#L72-L78](https://github.com/w3c/aria-practices/blob/3f094fde1c81b25dfa69162563bf28d093f854d4/content/patterns/grid/examples/css/dataGrids.css#L72-L78))。試算表產品(Excel / Google Sheets)作用格常駐的做法未驗證,不採。
- **Esc 行為不變**:未編輯時 Esc 清掉格游標與區間;焦點留在表格上,焦點框改由根節點畫(上表第二列)。
- **機械閘**:`scripts/data-table-invariants.mjs` I31(區間格兩主題釘住)/ I32(根節點與格游標框不同時出現、格游標 = DS 焦點框、Esc 後由根節點接手、Tab 到表頭控件時只剩那個控件的框、Shift+Tab 回來原格重現)/ I33(點唯讀格、開關格空白、連結格空白都移動格游標,且開關值不變、不開連結)。

### Nested rows — forward TanStack

```tsx
tableOptions={{ getSubRows, getRowCanExpand, state: { expanded }, onExpandedChange }}
```
- Indent:`depth × var(--tree-indent-{sm,md,lg})` token SSOT(`tokens/uiSize/uiSize.css`,跨 TreeView)
- Chevron:注入 first non-`__select__` content cell,rotate-90 展/收
- Click 分權:chevron stopPropagation 不 fire select
- Leaf placeholder:同層 sibling 有 expandable 時 leaf 也佔位
- a11y:`aria-expanded` 套在展開 chevron `<button>`(非 row);`aria-level` 尚未實作(row depth 目前僅以 `--tree-indent-*` 縮排視覺呈現)
- Visual interaction regression:`NestedRowsExpanderHoverState` 的 play 標記實際 chevron button；`visual-assertions.json` interaction 再由 Playwright 真 pointer hover 並 fail-closed 驗證唯一 target / trusted pointer hit，禁止只 dispatch synthetic hover event 假綠。
- Selection cascade:default OFF;`selectionCascade` opt-in 待 v2

### Drag visual SSOT(2026-05-06 v14.5)

Row drag + column reorder + TreeView 共用 `lib/drag-visual.ts`:source `opacity-disabled` 半透(reuse Atlassian Pragmatic 慣例,不 split token)+ DragOverlay ghost(`bg-surface-raised` + `shadow-[var(--elevation-200)]`,**不 dim**)+ 2px primary drop indicator(row 水平 / column 垂直,皆 `bg-primary` `h-0.5` 或 `w-0.5`)。Column 用 pseudo variant(`cloneElement` 不能加 child);row 用 absolute div(2026-05-06 v14.6)。

### Row drag(Jira canonical,v3 已 ship)

`enableRowDrag?: boolean` + `onRowReorder?: (sourceId, targetId, 'before' | 'after')`。Library:@dnd-kit/core(v15.0 Path B 用 `useDraggable` + `useDroppable`,不用 `@dnd-kit/sortable`)。**必填 `getRowId`**(否則 dnd 用 row.index reorder 後錯位)。

- **Handle**:Button tertiary iconOnly xs(GripVertical)24px chip,**只有底色被覆寫成不透明的 `bg-surface-raised`,其餘一律照 Button 平常的 initial / hover / active 走**(border / shadow 已 retire,2026-05-12 per user「我有叫你加 elevation 嗎」;2026-09-06 user 重申「其 initial,hover,active 狀態都是只改底色為 bg-surface-raised,其餘不變,壓著那顆鈕的時候狀態應該是 active」)。**dnd-kit 的 `aria-pressed` 必須在傳進 Button 前濾掉** —— 它拖曳中恆送 `true`(core.esm.js:3436),而 Button 把該屬性解讀成 toggle 按下(button.tsx:194),會讓這顆非 toggle 的把手在拖曳中變成藍底藍字無框,fixed-position 浮層貼 row 左緣、不佔 column 空間(位置 JS 計算,實作見 `data-table.tsx`);**hover-reveal** 由 JS 控 visibility / opacity(row 或 handle hover 顯示)。**拖曳進行中三個把手全部不顯示**(2026-09-06 user 提案 + 實測收斂):把手存在的唯一理由是「表格列看不出來能拖」這個可發現性問題;拖曳一旦開始理由即消失,回到 `lib/drag-visual.ts` 的 SSOT ——來源半透明 + 落點線,畫面上無把手,與 TreeView(`tree-view.tsx:258`「整列可拖,無 grip handle」)一致。拖影本就不含把手(clone `[role="row"]`,把手是 portal 出去的 fixed 浮層),隱藏後來源與拖影才對稱。**列已無鍵盤拖曳路徑**(2026-09-06 `c5d3b4c1` 拆除,詳本檔「列重排的鍵盤與單指標路徑」段):把手不再接收 dnd-kit 的 `onKeyDown`,`tabIndex` 恆為 -1、不進 tab 順序。故本條所述的隱藏只影響指標拖曳;先前此處以「拖曳中的即時回饋是落點線 + dnd-kit live region」為由,描述的是已被拆除的鍵盤路徑,已更正。(聚焦不顯示把手為**既有 a11y 缺陷**,另案)。Tertiary chip 非 ItemInlineAction 因透明背景撞 table border。
- **捲動與可視帶**(2026-09-10 取代 2026-09-09 的「裁切與所屬列相同」;user 原話「這樣的效果看起來好醜,drag button會直接被裁掉…jira在捲動table的時候會把drag button藏起來直到滑鼠再次滑到其他table row」):
  - **捲動即藏、真實移動才顯**:任何捲動(body、釘選面板、頁面、resize)一發生,正在畫的把手(hover 中或淡出中)**立即**隱藏(不淡出、不跟列走),直到指標座標真的改變才依 hover 重新顯示(150ms 淡入照舊)。Chromium 捲動後用同一座標補發的 mouseover / mousemove 不算移動(否則把手會在 user 沒有意圖下換列,舊把手半裁地掛在表頭線下淡出 = 殘影)。實作:`data-table.tsx` `rowDragScrollLatch`(模組層一份、document 上一個座標 listener、只有渲染過把手的實例訂閱)。
  - **整顆放得進 body 可視帶才顯示**:可視帶 = 所屬 body 面板的 client box(不含水平捲軸;傳統 17px 捲軸下把手不得坐在捲軌上)。24px 把手置中於列中心,上下任一邊超出可視帶就不顯示(部分露出的列沒有把手,捲進一點就有);把手永遠不出現在 body 可視帶之外。不再用 `clip-path` 把 chip 切成殘片。
  - **AI 推導的取捨**(非 user 拍板):部分露出的列暫無指標把手 —— 與 MUI X / AG Grid(把手是列內儲存格、隨列被裁,該狀態下同樣看不到或只剩碎片)一致;Atlassian Pragmatic DnD 設計準則的 hover 把手用 CSS :hover 顯隱、天生不追列;Jira 捲動中隱藏是 user 第一手觀察(官方文件未載)。位置不變(跨左邊框的浮層 chip,清單家族),不改成列內專用欄。鍵盤 / focus-visible 不受閂鎖影響(把手目前 tabIndex -1、聚焦不顯示,既有 a11y 缺陷另案)。
  閘:`scripts/data-table-handle-clip-invariant.mjs`(P0 整列可見 → 顯示且無 clip;P1 列半滑進表頭底下 → 指標未動不顯示、指標動了仍不顯示、移到完整列才顯示;P2 整列滑出 → 不顯示;P3 傳統捲軸幾何下把手底不越過 client 底;`--selftest` 強制 opacity 1 必紅)、`scripts/data-table-handle-position.mjs`(指標不動的捲動:第一個 scroll 事件後零把手;`--hover=follow` 指標有動:可見把手貼原列中心 ±1px,`--selftest` 注入 20px 偏移必拒)。保留 fixed portal、Button 與拖曳語意。
- **Sort × Drag 互斥**:sort.length>0 → handle disabled+Tooltip。**Top-level only**(`row.depth>0` 不顯 handle)。**Position**:active vs over 視覺位置 → `'after'`/`'before'` 對齊 `arrayMove`。**Consumer-managed mutation**:`onRowReorder(sourceId, targetId, position)`,DS 不持 row order，因為資料排序與 persistence authority 都在 consumer。
- **Virtualization 整合**(v3 2026-05-05):enableRowDrag 自動把 overscan 拉到 `Math.max(overscan, 5)` + drag 期 freeze `measureElement` + `modifiers={[snapToCursorModifier]}`(ghost top-left 對齊 cursor,不鎖軸)。**3-panel mirror sync**:primary 永遠 = center region(v15.4 撤銷「left 優先」— multi-instance same-id 是 dnd-kit anti-pattern,且 pinned column 是「鎖定欄」語意非 drag 起點),只有 center 掛 `useDraggable`;mirror region(left / right pinned)只掛 `useDroppable`,drag 期以 `useDndContext` 同步 source 半透視覺(Path B source 留原位,無 row transform);handle 只 render primary(center)避雙觸發。**Cross-parent drop 禁止**(已知 limit):nested 只同 top-level 重排,collisionDetection 過濾。**把手不表示「不能放」**(2026-09-06 user 逐字「本來就不需要 invalid,我們不是就已經有引導的落點線了嗎」):訊號在目標端 —— 不能放時就不出落點線、不出 `bg-drop-target`,起點不變色。與 `lib/drag-visual.ts`(拖曳視覺 SSOT,無 invalid 態)及另兩個消費者(TreeView / 欄位重排,同樣無 invalid 態)一致;外部對照:[Atlassian Pragmatic DnD 設計準則](https://github.com/atlassian/pragmatic-drag-and-drop/blob/main/packages/documentation/constellation/08-design-guidelines/index.mdx)「A background color change to communicate that dropping is possible should only be applied when a user can perform a drop operation.」、[MDN 拖放規範](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Drag_operations)(游標為主要回饋,被拖元素不變外觀)、[React Aria](https://github.com/adobe/react-spectrum/blob/main/packages/dev/s2-docs/pages/react-aria/blog/drag-and-drop.mdx)(未定義 invalid 視覺)三家皆同。

---

## L5:分頁(Pagination,2026-07-06)

**共用模式(user 拍板)**:`Pagination` 獨立公開元件是頁碼視覺 SSOT(`../Pagination/pagination.spec.md`,細節不在此重述);DataTable 加 `pagination` prop 內建消費它——內部接 TanStack `getPaginationRowModel()`,表格下方 render 分頁列。對齊 Ant Table(消費 Pagination)/ Atlassian DynamicTable(`rowsPerPage`)/ MUI DataGrid 內建派;shadcn data-table 教學同款「分頁 render 在 DataTable 元件 JSX 內」。

**API**:`pagination?: boolean | DataTablePaginationOptions`——`{ pageSize?(**uncontrolled 初始值**,預設 20;之後變更由使用者操作選單驅動、經 onPageSizeChange 回報,動態改此欄位不生效——controlled 需求列 v2。注意與 Pagination 元件的 pageSize prop 語意不同:那是 controlled)、pageSizeOptions?(傳了才渲染「每頁 N 筆」Select sm)、showTotal?(傳 true 才渲染 range 資訊,= Ant showTotal opt-in 邏輯)、page? / defaultPage? / onPageChange?(1-based dual-mode)、onPageSizeChange? }`。v1 = **client-side only**(全量 data 進來由 TanStack 切頁);server-side(`manualPagination` + 外部 total)列 v2。

**分頁列(bar)規則**:
- **bar 本體 SSOT 在 `<Pagination>` 完整形態**(2026-07-06 user 拍板「Pagination 元件提供完整功能、Table 按一致定義套用」):showTotal range 資訊、「N 筆/頁」選單、「資訊左、操作右」layout 全在 `../Pagination/pagination.spec.md`「完整形態」段——DataTable **只轉發 config + own TanStack state**(controlled 消費),不自拼分頁列
- **間距**:表格 → 分頁列 = `--layout-space-tight`(layoutSpace spec 規則 3「跨範疇 functional 交互」;Ant Table margin 16px / shadcn py-4 同量級)
- **對齊**:純頁碼形態**靠右**(shadcn `justify-end` / Ant Table 預設 `bottomEnd` / MUI TablePagination / Carbon 控制群 4 家實證);完整形態由 Pagination 自帶 w-full justify-between
- **`total` 數源** = `getPrePaginationRowModel().rows.length`(filter 後全集)——**不是** selection all-mode 的 server-side 全集數 M(那由 consumer 自持,語意不同)
- filter / data 縮小時自動 clamp 當前頁(對齊 MUI X);`isEmpty` 時分頁列整條不渲染(Empty 已渲染)

**與虛擬滾動互斥**:啟用分頁 → `useVirtual` 強制關閉——TanStack 官方定位兩者為互斥替代策略(分頁 = 每頁固定筆數主動換頁;虛擬滾動 = 連續滾動只渲可視列)。分頁時無虛擬化保護,建議 `pageSize ≤ 100`。

**height 預設連動**:未顯式傳 `height` 時,啟用分頁預設 **`'auto'` 自然高度**(hug 當前頁)——頁碼是分頁的唯一導覽通道,再疊 body 內捲動 = 雙重導覽(一頁 20 筆只露 10 筆);對齊 Ant Table 無預設高度罩、`scroll.y` 顯式選配慣例。未分頁維持既有 `'400px'` 預設;**顯式傳 height 一律尊重**(分頁 + 頁內捲動可並用)。

**Selection 交互**:header checkbox「全選」= 當頁可見列(page-scoped,rows 即當頁);跨頁已選 ids 翻頁不清除;BulkActionBar 2-step「已選本頁 N → 選全部 M」語意與分頁天然契合(見 L2 段)。`aria-rowcount` = 全集筆數 + 1(非當頁,ARIA 規範)。

**禁止**:❌ 分頁 + 期待虛擬滾動同時生效;❌ 繞過 prop 在表格下方自行手排 standalone `<Pagination>`(間距/對齊/互斥全部走本段 canonical)。

---

## Overlay + cell error SSOT(Phase 9)

**Overlay**:viewport `position:fixed inset:0` layer。`getCellRect()` 從 `getBoundingClientRect()` 取 float coords no rounding。Paint:hover ring 1px `--border-hover` `outline outline-offset:-1px` in-place;selected ring(格游標)= DS 焦點框 `focus-ring-inset`(2px `--ring` 往內,只掛 class 不寫值,2026-09-26 起;見「試算表模式」段)(range outer ring 已 2026-05-10 retire — range 視覺只剩 cell-bg `--primary-subtle` `[data-range-cell]`,bg 已足以標示範圍、外框冗餘);active editor host portal opaque `<div>` z 3(cell 保持 view 態)。**Viewport clip**(Issue 6):body panel 加 `data-datatable-panel="left|center|right"`;`getCellGeometry()` return cell+panel rect;`<ClipMask>` panel rect `overflow:hidden`,內部 `toRelRect()` 轉 mask-relative(hover/selected ring 按 panel clip,不畫出 pin boundary)。Active editor host **不 clip**，因為 editor 必能越過 cell paint layer 接收互動。

**Cell errors**(Issue 9):`cellErrors?: Record<string, string|string[]>` prop key `${rowId}:${colId}`。Cell view 態渲 error 14px `text-error` 下方 gap-1;array→`<ul><li>`;single→`<span>`。`aria-describedby` + `aria-invalid` + `<span role="alert">`。`overflow:visible` 當有 error(搭 `autoRowHeight`)。**Per-row state SSOT** cell-render wrapper(`items-X` 等)必 consume `effectiveAutoRowForCell`,禁 global `autoRowHeight`(audit `audit-data-table-row-mode-ssot.mjs` 強制)。**Edit-clears-own-cell** 自動清視覺,consumer onCellCommit validate 後回填。**a11y caveat**:≥ 5 同時 `role="alert"` 第一次 paint AT 噪音 → consumer 可考 `role="status"` fallback，避免初次 paint 同時打斷多次。

---

## 禁止事項

- ❌ 不使用斑馬紋——hover 已足夠區分行，斑馬紋增加狀態組合的視覺複雜度
- ❌ 無隱藏內容、無 frozen column、非 inline edit 的表格不加外框
- ❌ 非 inlineEdit table 的 body cell 之間不加垂直分隔線——靠 header 建立的欄位邊界引導即可。inlineEdit table 的 body cells **4 邊均有 1px divider**，因為每個 cell 都是可進入的獨立 editing surface
- ❌ Toolbar 不內建在 DataTable 裡——toolbar 是外部組合，職責分離
- ❌ 截斷文字不無條件顯示 tooltip——只有實際被截斷時才顯示
- ❌ Tag 不可被外層 overflow-hidden 裁掉邊框——Tag 自身 shrink + 內部文字 truncate
- ❌ 數字欄位不靠左對齊——靠右才能縱向比較
- ❌ 不在 column 層級混用對齊策略——行高模式是 table 層級切換
- ❌ 無高度約束時不要期待 header 固定或虛擬捲動——這是模式的取捨

---

## Anatomy 結構例外

DataTable 是 composite multi-section 元件,**不套 SizeMatrix / StateBehavior**(由 `RowHeightMatrix` / `ColorMatrix` 對應)而採「按區塊 + 按 feature」拆:`Overview` / `Inspector`(props 即時檢閱)/ `ColumnTypes` / `RowHeightMatrix`(對應 row-height tier 而非 component size)/ `AlignmentRule` / `Features` / `ColorMatrix`(row 多 state 集中)/ `EmptyState`(消費 Empty primitive)/ `BorderedProp` / `Accessibility`。理由:單一 Inspector 無法呈現「資料 schema → column type 對應」這類跨 prop 決策,Inspector 之外仍按 feature 拆。

---

## 相關

- `../../patterns/action-bar/action-bar.spec.md` — toolbar 的排列、variant、溢出規則
- `../Button/button.spec.md` — row actions 按鈕規則
- `../DescriptionList/description-list.spec.md` — 唯讀屬性列表（非多 row 場景）
- `../TreeView/tree-view.spec.md` — 階層結構的對應元件
- `../../tokens/uiSize/uiSize.spec.md` — `--table-row-*` / `--field-height-*` token
- `../../tokens/color/color.spec.md` — 語義色彩
- `../../tokens/elevation/elevation.spec.md` — drag ghost 陰影(`--elevation-200`;固定欄分界為 1px divider,無陰影)
- `../Field/field-controls.spec.md` — cell editable 時的 Field Control 共用規則

## A11y 預設

**ARIA / Pattern**:DataTable 是 composite tabular widget,**對齊 W3C ARIA Authoring Practices Guide `grid` pattern**(非 `radio-group`——之前 boilerplate 從 RadioGroup spec 誤抄;DataTable 是 multi-row / multi-column composite,not single-choice selection group,a11y semantics 完全不同(grid vs radio-group)<!-- @benchmark-verified: 2026-05-18 D1 rewrite -->):

- Root 套 `role="table"`(currently)或 `role="grid"`(future tier,when cell editing 普及)— 詳 [WAI-ARIA APG: grid](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) + [MDN grid role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/grid_role)
- Center body 捲動層套 `role="rowgroup"`(非空表):唯讀模式該層帶 `tabIndex=0` + `aria-label`(scrollable-region-focusable),**focusable 的無 role 中間層會被 axe aria-required-children 判為 table 的不合法 owned child**(2026-07-29 WM beta.95 錨例;與 Tabs 2026-07-18 決策1 同型)。rowgroup = 合法 table 子代 + 可具名([WAI-ARIA 1.2 §5.2.8.4 Name from author](https://www.w3.org/TR/wai-aria-1.2/#namecalculation))。空表例外:Empty 塊非 row → 不掛 rowgroup、亦無 overflow 故一併省 tabIndex/名稱
- Column headers:以 `<div role="columnheader">` 顯式標記(本元件用 div + ARIA role,非語義 `<table>` — 見定位段;不渲染 `<th>` / `scope`)
- Row headers:目前無對應(平面 row,無 row header 語意;未渲染 `role="rowheader"`)
- Sortable column:`aria-sort="none" | "ascending" | "descending"` on 該 column header `<div role="columnheader">`
- Selection state(若啟用 selection mode):視覺**僅由 `__select__` 欄的 selection control(`multi`→Checkbox / `single`→Radio)呈現,不套 selected-row 底色**;control 自帶 `aria-checked` 傳達狀態(row 本身目前**未**套 `aria-selected`,`grid` root 亦未套 `aria-multiselectable` — 留待 `role="grid"` future tier)
- 字 cell hover overlay action:overlay 為 absolute/fixed paint layer(`DataTableInteractionLayer`),trigger 目前**未**套 `aria-haspopup` / `aria-controls`(留待 future tier)

**列重排的鍵盤與單指標路徑(2026-09-06 登記缺口)**:
- **列**的鍵盤拖曳已於 2026-09-06 拆除 —— 實測 Space 會啟動、按方向鍵後落點線消失、放下順序不變,
  屬「看似支援實則不能完成」。根因:`DndContext` 單一 sensors 由欄／列共用,而 dnd-kit 鍵盤座標
  自 activator 矩形起算;列的 activator 是貼表格左緣的 fixed 把手,不在任何列矩形內,
  `pointerWithin + rectIntersection` 因此永遠解不出 `over`。把手不再 spread `onKeyDown` 且 `tabIndex=-1`。
- **欄位**的鍵盤重排**可用且保留**(同手法實測:Category 由第 3 欄移至第 5 欄);
  其 activator 是 header cell,落在其他 header 矩形內,故 `over` 解得出。**`KeyboardSensor` 不得移除。**
- **待補(backlog)**:(a) [WCAG 2.5.7 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
  要求拖曳功能須有「單指標、不需拖曳」的替代路徑,規範自身舉的例子即清單重排的「上移／下移」控制項;
  DataTable 與 TreeView 目前皆無此路徑。落地形式已定(該列 `rowActions` overflow 選單多兩個項目,
  樣式沿用既有 menu,無新 token),僅 API 歸屬(DS 於 `enableRowDrag` 時自動注入 vs consumer 自加)待定。
  (b) 是否採用 TreeView 的 `Cmd/Ctrl+Shift+方向鍵`(`tree-view.spec.md:294-295`)作為加速器,研究中。
  (c) 列拖曳無客製 live region,落回 dnd-kit 英文預設字串(TreeView 有自己的,`tree-view.tsx:374-378`)。

**Keyboard 行為**(目前實作 — `tableKeyboardHandler`):
- ↑↓←→:cell-to-cell navigation **僅 `spreadsheetMode` opt-in 時生效**;selection 尚未建立時按方向鍵自動選取第一個 visible cell(鍵盤可直接進入 spreadsheet 導覽,無需滑鼠 click — 對齊 Excel / Google Sheets / AG Grid「focus grid → first cell active」,2026-07-05 D4 補);預設模式方向鍵無作用
- Shift+↑↓←→(2026-09-29,待辦總帳 N46;WCAG 2.1.1「Shift+點擊做得到的,鍵盤也要做得到」):從格游標(起點)往那個方向**擴大 / 縮小區間**——起點與藍框不動(同 Shift+點擊:起點永遠是 `selectedCellId`),動的是終點;第二下起從上一次的終點繼續;放開 Shift 再按方向鍵 = 一般移動、區間重設為單格。一手:AG Grid "Focusing a cell and then holding down ⇧ Shift and using the arrow keys will create a range starting from the focused cell."(<https://www.ag-grid.com/javascript-data-grid/cell-selection/>);MUI X "Use the arrow keys to focus on a cell, then hold Shift and navigate to another cell—if Shift is released and pressed again then the selection will restart from the last focused cell."(<https://mui.com/x/react-data-grid/cell-selection/>;本 DS 重設回**起點**而非「上一次的終點」,對齊本檔既有 Shift+點擊 canonical)。2026-09-29 前方向鍵一律重設起點、Shift 被忽略
- Enter / F2:spreadsheet 模式下進 cell editing(cell 可編輯 + 非 boolean/url 時);**Enter 確認後維持原格不下移**(2026-07-05 user 拍板;10 家實查:Excel 系 7 家下移、AG Grid 預設維持原格 — 採 AG Grid 派,數據 → `.claude/logs/deep-audit-2026-07-03/enter-commit-navigation-benchmark.json`;未來連續輸入需求可重議 opt-in);**edit 退出(commit / Esc)後 selection 還原至該 cell、焦點還給 table root**(editor unmount 後焦點掉到 body 才收回,不搶 user 點擊的新焦點 — 對齊 spreadsheet RFC Contract 11 + Excel / AG Grid,2026-07-05 D4 補);**編輯中再按 `F2` = 結算、回到格導覽**(2026-09-29,待辦總帳 N46;跨元件規則 `ds-canonical/references/keyboard-model-canonical.md`「`F2` 恆為進到格裡的控件,再按一次回到格導覽」,APG Grid 逐字 "A subsequent press of F2 restores grid navigation functions.";值留著 = commit,因為 APG 只把「還原」寫在 Escape 那一條,本元件的 Esc 已是取消編輯;只有文字型編輯器(string / number / url)吃這個鍵,浮層型(date / select / person)的出口仍是選值或點外面;實作 = `../Field/field-edit-keys.ts` `commitOnF2`,`cell-registry.tsx` makeKeyHandler 傳 true)
  - **兩個鍵都給的理由是跨元件規則**(owner → `ds-canonical/references/keyboard-model-canonical.md`「進格用什麼鍵」):**`F2` 恆為進格;`Enter` 在該格的主要動作沒有佔走它時,也是進格**。本元件的檢視態儲存格沒有主要動作,所以兩個都給;`Calendar` 日期鈕的 `Enter` 被「選這一天」佔走,所以只給 `F2`。新元件照這條判,不要再逐案挑鍵。
- Cmd/Ctrl+A:`mode="multi"` selection 時選全可見列(扣 disabled)
- Esc:取消 editing(spreadsheet)/ 未在編輯時清格游標與區間(spreadsheet;焦點框改由表格根節點畫)/ 清 selection(selection mode);**IME 組字中的 Enter / Esc 不觸發 commit / cancel**(cell editor 帶組字 guard,2026-07-05 D4 補 — 中文選字 Enter 不誤提交半截組字;判準全 DS 一支 `../../lib/ime-composition.ts` `isImeComposing`,2026-09-30 收成一支)
- Tab:進入表格後操作排序與勾選;portal edit(`experimentalActiveEditorController`)中 Tab / Shift+Tab = commit 當前 draft + 移至下一個 editable cell 進 edit(2026-07-05 D4 補 commit — 原本換格丟 draft)

> APG grid full keyboard model(Home/End、Ctrl+Home/End、PageUp/PageDown、roving cell action)為 `role="grid"` future tier 目標,**尚未實作**。

**Focus**:table root `tabIndex=0` **僅在 selection enabled 或 `spreadsheetMode` 時**(否則 `undefined` = 不可 focus);cell 目前無 roving `tabindex=-1` 機制。**根節點與格游標框不同時出現**(2026-09-26):`spreadsheetMode` 有格游標時畫在那一格(`focus-ring-inset`,只在焦點在格線區裡時畫;Tab 到表頭控件時收起、位置保留),根節點不畫;沒有格游標(Esc 之後)與勾選列模式由根節點畫 `focus-visible:focus-ring-inset`(規則與依據見「試算表模式」段)。互動元素(勾選框 / 排序 header / 展開鈕 / row action)各自 focusable + focus-visible ring(`outline: 2px solid var(--ring)`)。APG grid roving-tabindex focus model 為 future tier 目標,尚未實作 → 見 [WAI APG keyboard model](https://www.w3.org/WAI/ARIA/apg/patterns/grid/#keyboardinteraction)。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `bulk-action-bar.spec.md`
- `carousel.spec.md`
- `circular-progress.spec.md`
- `data-table-known-defects.spec.md`
- `data-table-scroll-performance.spec.md`
- `description-list.spec.md`
- `filter-operators.spec.md`
- `opacity.spec.md`
- `pagination.spec.md`
- `scroll-area.spec.md`
- `tree-view.spec.md`
