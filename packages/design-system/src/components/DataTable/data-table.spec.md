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

- **有高度約束**(固定 `height="400px"` 等具體 px/rem,或 `height="100%"` 由父 flex 提供約束,Linear 做法——都走相同 cap 行為,無 dead surface):資料少→outer 內容高度;資料多→撐到上限後內部 scroll(虛擬捲動啟用,header 固定)
- **無高度約束**(auto):內容決定高度,table 框只包住內容;適合少量資料、預覽、嵌入式表格。犧牲:無虛擬捲動(全部渲染)、header 隨頁面捲走、水平捲軸在 table 最底部——這些不是 bug,是模式的取捨

### 三、三區域架構（AG Grid 模式）

Table 分三層:
- **Header**(固定頂部,結構性地在 scroll 容器外、body 上方——不用 CSS sticky,永遠固定在頂部):含 left / center / right 三區,center 區與 body center 的水平捲動 JS 同步 scrollLeft(center-header 跟隨 center-body 捲動位置,同步機制見「捲軸」段 + `data-table.tsx`)。Header bg 用 `--muted`(code `HEADER_BG = 'bg-muted'`,比 surface 深一階,同 anatomy ColorMatrix)
- **Body viewport**:含 left / center / right 三區;center-body 是唯一的水平 scroll container、也是垂直 scroll container(`overflow-y-auto`),left / right body 不自行捲動(`overflow-hidden`,`scrollTop` 由 center 的 `onScroll` 同步兩側;AR44:V scroll 移進 region 自身,讓水平捲軸落在可視視窗底部,不必捲到內容底才看到)
- **Left / Right 區**:寬度由凍結欄加總,不吃水平捲動;frozen 邊界線用 `.dtPanelBoundaryRight/Left` 的 **1px 偽元素**(`::after`,`width:1px background:var(--divider)` 貼齊面板內緣;不佔 box model、不被 Windows 懸浮捲軸蓋 — 2026-05-12 自 `border-divider` 改制的理由保留),header + body panel 各套,視覺整欄高度。**畫線機制統一鐵律(2026-08-20 user 拍板)**:全表 1px 線(欄間短線 / 凍結邊界 / 外框)一律「元素/border」機制,**禁用陰影畫線** — 非整數縮放與 Retina 下瀏覽器對陰影與背景色盒的柵格化取整不同,會讓同規格的線出現 1 vs 2 實體像素的粗細分家(2026-08-20 user 報修錨例);**Center 區**:flex-1,水平 overflow 自行處理

完整 class / overflow 規則見 `data-table.tsx`。

**固定行高確保跨 region 對齊。** 所有 row 用 `h-table-row-{size}`，三個 region 的 row 精確同高。

**Header/body region 寬度同步。** Header region 寬度由內容決定（columns + actions），body region 量測 header 寬度同步（機制見 `data-table.tsx`）。

### 四、行高模式

Table 層級的模式切換，不是 column 層級。跟 AG Grid / Airtable 的做法一致。

- **固定行高（預設，適合大多數場景）**：所有 row 同高、內容垂直置中——文字、tag、badge、avatar 等不同高度的元件都自然居中，不需處理對齊；文字一律截斷不換行（column 的 `wrap: true` 被忽略）
- **自動行高（適合描述、備註等需完整顯示的欄位）**：row 高度由最高的 cell 決定、內容頂部對齊；垂直 padding 由目標行高推導（單行時製造置中效果，多行時保持頂部對齊）；`wrap: true` 的欄位可換行撐高 row

### 五、Header vs Body 的視覺區隔

**兩種垂直分隔線：**

| 類型 | 範圍 | 適用 |
|------|------|------|
| Header 分隔線 | 僅 header 區域（上下留 padding） | 一般非 frozen 欄位之間 |
| Frozen 邊界線 | **整欄高度**(table 頂部到列區底部) | frozen column 與 scrollable area 的交界。有水平捲軸時,pinned 區補了等高的透明下邊框(見不變條件 (7)),而 `::after` 的 `bottom:0` 貼的是 padding box,所以線畫到**捲軸帶的上緣**為止 —— 這是對的:分隔線分的是列,捲軸帶不是列。AG Grid 同理(它的假水平捲軸在三個 row container 之外,pinned 分隔線也只到列區底)。**別把它改成畫穿捲軸帶** |

一般 column 只在 header 有短線——body 的欄位邊界由 header 引導，不需額外視覺噪音。但 frozen column 的邊界是結構性的分隔（固定區域 vs 捲動區域），需要全高度的線來明確標示。Row actions 欄本質上是 frozen right column，左邊界也使用 full-height 分隔線。

**Header 文字弱化。** Header 是結構標籤，不是資訊本體。字體與 body 相同但使用次要文字色，搭配 muted 背景拉出層級，讓視覺重心留在 body 的資料上。

### 六、外框規則

**邊框標記「這裡有使用者看不到的內容」。** 沒有邊框時，使用者無法判斷內容是否有溢出。加框的條件（滿足任一即加）：**垂直捲動**（有高度約束，內容超出容器）／**水平溢出**（欄位總寬超過容器）／**有 frozen column**（固定欄與捲動區域的分界線需要外框歸屬）／**全表 inline edit**（可編輯容器需要邊界提示）。

不加框時，最後一行保留底線自然收尾。加框時最後一行底線去掉，避免與外框 double border。**Prop**：`bordered`（boolean，預設 `true`）。多數場景（有高度約束的虛擬捲動 / frozen column / inline edit 表）都應保持預設；只在**資料量極少、無溢出、嵌在 Card / Section 內已有外框**的展示型場景傳 `bordered={false}` 讓最外層視覺收尾。

### 六之二、Column 寬度 API + 不變條件(2026-05-06 v14.3)

**Column 數量不是品質判準。** 單欄 DataTable 是有效用法（例如只需選取名稱的清單、窄容器中的唯一核心屬性）；`columns` 的數量由業務 schema 決定，不得用「至少兩欄」類 hook 把單欄當成 minimal mock。品質應檢查欄位語意、真實資料與容器布局，不是欄位數。

**命名**:`meta.width` / `meta.minWidth` / `meta.maxWidth`(px)。**不用 TanStack `size`** — DS 內 `size` 既定為 `'sm'|'md'|'lg'` density(49+ 處),避 namespace 衝突。內部 pre-process copy 到 TanStack root,resize feature 正常。No-resize default:`width` = reserve(cell ≥ width,flex 可 grow,不可 shrink)。`enableColumnResize=true`:`width` = 初始,`minWidth` = 拖拉下限(default 80)。**不變條件(invariants,L2 test + hook 守)**:(1) cell width = column width(跟 padding/state/mode 無關)(2) view↔edit cell width 0 delta (3) view↔edit cell height 0 delta(textarea `field-sizing:content`)(4) Field 填滿 cell 高度(1px 容差於 cell.border-r)(5) No-resize column ≥ meta.width。(6) **header 與 body 的內容盒必須等寬**(橫軸)。根因不是捲軸,是**欄寬被算了兩次**:非拖拉模式的欄用 CSS flex(`flex: 1 1 baseSize`)由瀏覽器在 header 與 body **兩個不同容器裡各分配一次**;body 的 `overflow-y:auto` 捲軸吃掉 15px 後兩個容器寬度不同,`flex-grow: 1` 是**平均分配**剩餘空間,於是每欄少 15/n px 並逐欄累積(實測 7 欄:0 / 2.1 / 4.3 / 6.4 / 8.6 / 10.7 / 12.9,增量恰為 15/7;4 欄:0 / 3.8 / 7.5 / 11.3,增量恰為 15/4)。**只有「彈性分配 + 捲軸佔版面」同時成立才看得到**——水平溢出時欄寬是絕對值,15px 只吃掉右端餘白,所以多數表格看起來正常;拖拉模式(`enableColumnResize`)本來就用絕對 `width`,結構上免疫。作法:量 `centerHeader.clientWidth - centerBody.clientWidth`(量不變式本身,不是「捲軸多寬」這個代理值),補等寬 `padding-right` 到 center header panel。**不用** `scrollbar-gutter: stable` —— 那會在沒有捲軸時也永久預留空位,content-fit 看起來像恆有捲軸。

(7) **pinned 與 center 的可視列高必須一致**(縱軸,同一根因的孿生)。center body 自己有 `overflow-x:auto`,水平捲軸吃掉它 15px 高;pinned 區沒有捲軸 → pinned 比 center 多露出一條列(實測 300 vs 285),無高度限制時則是表格底緣出現 15px 階差。作法:補等高的**透明 `border-bottom`** 給 left / right body panel。**必須是 border 不是 padding**:`overflow` 的裁切邊是 **padding box**,padding 只會讓 `clientHeight` 不變、列直接畫進 padding 區(實測 padding 版本 `clientHeight` 仍 300,列從 y=784 畫到 799);border 在 padding box 外面,`clientHeight` 因此真的少 15(300 → 285),列才會被裁掉。透明 border 之下 panel 底色照樣畫(`background-clip` 預設 border-box),看不出接縫。

**兩軸的量測**都由「每次 render 後」與 ResizeObserver 兩個來源驅動:列數變(分頁/篩選/展開)走前者,容器尺寸變(視窗/面板拖曳)走後者;padding 只加在 header 與 pinned 區,不會回頭改變 center body 尺寸,不形成量測迴圈。整數量測刻意用 `offsetWidth/clientWidth`(同一座標系),**不可**改用 `getBoundingClientRect()`—— 縮放時它與 `clientWidth` 不同座標系會算錯;非整數縮放下的殘差實測 ≤ 0.33px(次像素,不可見)。

**表頭底色只准疊一層(2026-09-03 user 抓到視覺落差)**:`--muted` 是**半透明**(light `oklch(0 0 0 / 4%)`、dark `oklch(1 0 0 / 8%)`),所以「底色畫在 header row、讓出的 strip 補在 panel」會在重疊處疊成兩層 —— strip 只有一層,在淺色比欄位區淺一階、深色反過來偏暗。**底色與下分隔線一律畫在三個 header panel 上(`HEADER_PANEL`),row 不畫**,strip 因此天生同色、兩個主題都一致。AG Grid 的 `.ag-header-row::after` 與 MUI X 的 `GridScrollbarFillerCell` 是把 filler 放進 **row 裡的一格**,同樣只疊一次;我們選 panel 而非 row-cell,是因為 row 內加格會改變彈性欄寬的項目集合與水平捲動範圍。

**世界級對照**(2026-09-03 讀原始碼):**AG Grid v36** 把 header 塞進 body 同一個捲動容器(`gridHeaderComp.ts` `eTopSection.prepend`),真捲軸以 `scrollbar-width: none` 收成 0 寬,可見捲軸是`ag-fake-vertical-scroll` 這個 absolute 兄弟元素,而且每欄寬度只算一次寫進 `AgColumn.actualWidth`,header cell 與 body cell 讀同一個整數 → 結構上不可能分歧;**Glide Data Grid** 整張表畫在同一塊 canvas,同理。**MUI X DataGrid** 與我們同型:隱藏原生捲軸、量到寬度後在 header 尾端放一個 `GridScrollbarFillerCell`(寬 = `var(--DataGrid-hasScrollY) * var(--DataGrid-scrollbarSize)`);**Handsontable** 更直接——`width = getWorkspaceWidth(); if (hasVerticalScroll()) width -= getScrollbarWidth()`。亦即「量到捲軸寬度就把 header 縮同寬」有兩家直接前例,不是取巧;差別在 AG Grid / Glide 是**單一容器**、我們與 MUI X / Handsontable 是**兩個容器 + 補償**。要拿到結構性免疫得走 AG Grid 那條路(header 移進捲動容器 + 假捲軸),那是另一個量級的改動且會改變捲軸的視覺位置,不在本次範圍。

**機械閘** = `scripts/data-table-invariants.mjs` I11 / I11b(橫軸)+ I12(縱軸)。CI 的 headless Chromium 是 overlay 捲軸(gutter = 0),只驗自然狀態等於空轉——把 padding 整段拿掉 CI 照樣綠;I11b / I12 因此各用一條 15px 透明邊框造出與真捲軸同值的量測(`clientWidth` 不含 border、`offsetWidth` 含),補償分支在任何環境都會被走到(2026-09-03 實測:註入 `::-webkit-scrollbar` 寬度**無法**讓 CI 的捲軸佔版面,此路不通)。對應 `scripts/data-table-invariants.mjs`(script 內 I1-I3 label 字串仍用 `display↔edit` — 2026-07-16 FieldMode display→view 更名前的歷史命名,語意同 view↔edit)。改 `columnSizeStyle` / 切 layout 必跑 invariant test 才 commit。

### 六之二之一、兩容器架構的已知缺陷清單(2026-09-03 對抗式稽核)

header 與 body 是**兩個容器、各自跑一次 CSS flex 分配**(見不變條件 (6));下列缺陷全部源自這一點,
補償只能讓「兩次計算的輸入相等」,不能讓它變成「一次計算」。已修的在上面,未修的列在這裡,
避免下一個人以為都修完了。**AG Grid 對每一條都結構性免疫**(欄寬只算一次寫進 `AgColumn.actualWidth`,
header 與 body 讀同一個整數)。

| # | 缺陷 | 觸發條件 | 嚴重度 | 狀態 |
|---|---|---|---|---|
| A | `rowActions` 佔位欄:header 用固有寬、body 用 `flex-1`,右釘選區剩餘空間分給不同項目集合 | `pinnedRightColumns` 非空 **且** 有 `rowActions`(目前無 story 命中) | 高(可達數十 px) | **已修**(header 佔位補 `flex-1`) |
| B | 釘選區寬度「量 header → state → 灌給 body」,首幀 0 + `offsetWidth` 取整 | 一律;非整數縮放 / DPR 1.25 放大誤差 | 中(首幀 + sub-pixel) | **部分修**(改 `useLayoutEffect` 消掉首幀;取整殘差仍在) |
| C | `overflow:hidden` 的面板仍會被瀏覽器因 focus 捲動,而同步是單向的 | Tab 到 center header 被截掉的欄寬把手 / 釘選區被截掉的可編輯 cell | 中高(一旦發生永久錯位) | **已修**(次要捲動區導回 center body) |
| D | 欄位群組(`columns: [...]` 巢狀)時 header 只渲染最上層、被葉 id 濾光 → 空白 header 列 | 任一欄用 TanStack 欄位群組寫法 | 高(完全對不上) | **未修**:等同「不支援卻沒擋」,需實作多層 header 或在型別層擋掉 |
| E | 釘選欄 header 的 hover ⌄ 選單與排序箭頭改變面板固有寬 → center 欄寬重排 | 預設模式 + 釘選欄 header 內容寬 ≥ 該欄 size | 中高(滑過去就跳) | **未修**:需為圖示預留固定空間 |
| F | `autoRowHeight` / cell error 時同一列在三區各自算高度;虛擬捲動只量 center | `autoRowHeight`、`cellErrors`、`meta.wrap` | 中高 | **未修**:需列高單一真相來源 |
| G | 右對齊欄被排序時,排序箭頭把標題推離右緣 20px(body 值仍貼右) | 該欄被單欄排序 / hover | 中 | **未修**:AG Grid 同樣把箭頭放在標籤右側,先視為既有慣例 |
| H | `data-table.css` 的 `::-webkit-scrollbar` 客製(10px、track、thumb、corner)實測未生效,瀏覽器畫的是原生 15px | 一律 | 中(死碼 + 規格與 css 數字矛盾) | **未修**:疑為同檔 `@supports` 區塊重新宣告標準屬性導致 Chrome 忽略偽元素 |

| I | 補償用實體方向屬性,RTL 下捲軸在另一邊 | `enableRtl` 類情境 | 中 | **已修**(改 `padding-inline-end`;面板邊界線與欄寬把手仍是實體方向,未修)|
| J | 三處量測都是整數量化(`offsetWidth` / `clientWidth`),殘差餵回 flex 分配 | 縮放 110%、DPR 1.25/1.5 | 中低(≤1px) | **未修**:與已修的 15px 是同一類機制,只是量級不同;結構解同 (6) 末段 |
| K | `MIN_COLUMN_WIDTH = 80` 是死碼(TanStack 預設 `minSize: 20` 永遠先命中),`maxSize` 預設 `MAX_SAFE_INTEGER` 被寫進每個 cell 的 inline style | 一律 | 中(契約與文件失效) | **未修**:需在 `columnSizeStyle` 比照 `ResizeHandle` 的繞法 |
| L | 「自動調整寬度」量 `firstElementChild`(樹狀列量到 chevron)、不看 header 寬、`+32` 硬寫而實際 padding 由 token 決定 | 用該選單項時 | 中 | **部分修**(查詢範圍已限定本表格;量測元素與 buffer 未修)|
| M | 欄間分隔線的歸屬 header 與 body 不對稱(右釘選 + rowActions 時同一位置 header 無線 / body 有線;拖曳中最後一格突然畫線)| 該組合 | 中低(1px 視覺)| **未修** |
| N | `centerColsWidth` 被算兩次(`:1475` 與 `renderBodyRows` 內),註解宣稱是同一個 SSOT | 一律 | 低(今天數值相同)| **未修**:抽成單一來源即可 |

**已用實測推翻的疑慮**:稽核擔心 header 的 `padding-right` 會讓水平捲動範圍比 body 少一個捲軸寬
(Chromium 對區塊容器 inline-end padding 不算進 scrollable overflow)。實測相反:
header `scrollWidth` 915 = body 900 + padding 15,兩邊捲動範圍都是 397,捲到最右端 header 與 body
`scrollLeft` 同為 397、每欄位移 0。

### 六之三、Runtime perf budget canonical(2026-05-14 codex+Layer A)

`scripts/runtime-perf-datatable.mjs`(Playwright,cooldown 60-90s)+ 60fps 16.67ms canonical(web.dev / MDN long-task >50ms)。**4 test cases**:

| Case | Story | Avg / p95 / long-task | Gate |
|---|---|---|---|
| A Plain virt | `VirtualScroll` | ≤16.67/≤33/0 | hard |
| B Rich budget | `RoadmapPerfBudget`(500×13 rich+inline-edit,fixed 600px;2026-05-17 整併誤 retire → 2026-06-12 R2 重建,gate 恢復可跑) | ≤50/≤80/≤1 | hard |
| C Row drag | `RowDragWithVirtualization` | ≤33/≤50/longest<100 | soft(DnD thermal) |
| D Edit isolation | `<Profiler>` TBD | skip ≥ visible−active | hard |

**2026-06-12 重建後實測**(static build,3 runs/case):1x CPU — A 16.56/16.8/0、B 24.0/33.4/0、C 16.67/16.8/0 全過 gate;script 預設 4x throttle 在有背景負載機器上全 case 一致 ~2.3x 超標(含未動過的對照組 A)→ 本表門檻實證對應 1x/閒置條件,4x 門檻是否重校 = user 決策(本表數字不動)。

**Anti-pattern**:`RoadmapAllInOne`(全 features stack)≈117ms 不達 B,因 SortableRowProvider/column reorder/resize/selection/overlay 同時開。Consumer:13+ cols rich-cell → 拆 detail drawer / column visibility 預設 hide,不該期 60fps + 全 feature stack。Cite + Phase 1/2 history → `cell-registry.tsx` perf-fix JSDoc(`buildCellWithSurface` 上方)+ commits log。

### 七、Column Type

**Column type 是資料行為的預設合約。** 指定 type 自動獲得對齊 / 渲染 / 排序 / 篩選行為,可在 column 層級覆寫。Header 對齊永遠跟該欄 body cell 一致(**機制**:對齊 class 必同時套在 header 外層與內層的排序點擊區 —— 點擊區是 `flex-1` 撐滿的,只套外層等於沒套,標題會被推回最左;`TruncatedText` 的 `text-right` 在 flex row 內是收縮寬度,救不了。**機械閘** = `scripts/data-table-invariants.mjs` I10:量標題文字與首列儲存格文字的邊緣,右對齊比右緣、置中比中線、左對齊比左緣,>1.5px 就紅。2026-09-03 user 抓到金額欄標題與數字對不齊,根因即此,規格早已這樣寫、程式沒做到)。select/multiSelect 的 `meta.options` 消費 Select 的完整 `SelectOption` schema(M30 wrapper-extends-primitive;含 icon / iconClassName / description),`meta.selectedItemRenderer` 轉發 Select 同名 API 供 status 類彩色 cell(2026-07-08 補——原 `{value,label}` 窄型別 = 假 SSOT,WM 被迫手刻 bare trigger 實證)。

### 八、Row 狀態

- **不使用斑馬紋**——hover 狀態已足夠區分行，斑馬紋疊加會產生多種背景色組合，增加視覺雜訊
- **選取狀態僅由 row 內的 selection control（`multi`→Checkbox / `single`→Radio）呈現，不另加 selected-row 底色**——避免「勾選框 + row 底色」雙重冗餘指示（2026-05-31 user 決策：有 checkbox 就只用 checkbox 呈現狀態）；hover 用 neutral-hover，與 selection 正交（純表示「正在看的」）

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

### 十三、狀態處理職責邊界

DataTable 只管「column + data」;Loading / Error / Disabled-整表由 consumer 外層處理。Empty 自動渲 `Empty`。Dark mode / density 走 token。**Loading**(無資料 → 外層 `Skeleton × N rows`;有資料 refresh → 容器疊 `<CircularProgress/>` 24px center + table `opacity-disabled` reuse,**禁**:內建 loading prop / Empty 套 loading / 自定義 opacity)。Skeleton 表示尚無 row shape，refresh overlay 則保留目前資料與 table geometry。

---

## 捲軸(pinned header / column + scroll canonical)

3-panel(left-pinned / center-scroll / right-pinned),center body 用 **native `overflow-x-auto`**(非 ScrollArea),header 透過 JS `onScroll` 同步 scrollLeft。**不用 `<ScrollArea>` 的理由**:Radix viewport nested div 會 break scrollLeft 同步;pinned column 需「左右獨立 scroll + 中央共享 scroll state」,單一 viewport 不適配。

**Tech debt**:macOS auto-hide vs Windows/Linux 常駐 scrollbar,cross-OS 視覺寬度差異 — consumer 可 override `::-webkit-scrollbar` 樣式;ScrollArea 重構列 post-v1。

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
- **整 cell 區可點擊**(canonical):cell padding 任何位置(不只視覺 checkbox/radio 本體)點擊都觸發 toggle / select，擴大 hit target 且不要求精準瞄準。Disabled row 不觸發。實作:select cell 容器 div onClick 委派到 toggleRow / setSelection

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
- **And/Or Select** `minRows={2}`(2 選項顯式縮 menu 高度);**Where padding** `px-[var(--field-px)]` align Field
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

- **Handle**:Button tertiary iconOnly xs(GripVertical)24px chip,所有 state(idle / hover / aria-disabled)統一 `bg-surface-raised`(border / shadow 已 retire,2026-05-12 per user「我有叫你加 elevation 嗎」),fixed-position 浮層貼 row 左緣、不佔 column 空間(位置 JS 計算,實作見 `data-table.tsx`);**hover-reveal** 由 JS 控 visibility / opacity(row 或 handle hover 顯示;drag 中 source 強制顯示、其他列隱藏)。Tertiary chip 非 ItemInlineAction 因透明背景撞 table border。
- **Sort × Drag 互斥**:sort.length>0 → handle disabled+Tooltip。**Top-level only**(`row.depth>0` 不顯 handle)。**Position**:active vs over 視覺位置 → `'after'`/`'before'` 對齊 `arrayMove`。**Consumer-managed mutation**:`onRowReorder(sourceId, targetId, position)`,DS 不持 row order，因為資料排序與 persistence authority 都在 consumer。
- **Virtualization 整合**(v3 2026-05-05):enableRowDrag 自動把 overscan 拉到 `Math.max(overscan, 5)` + drag 期 freeze `measureElement` + `modifiers={[snapToCursorModifier]}`(ghost top-left 對齊 cursor,不鎖軸)。**3-panel mirror sync**:primary 永遠 = center region(v15.4 撤銷「left 優先」— multi-instance same-id 是 dnd-kit anti-pattern,且 pinned column 是「鎖定欄」語意非 drag 起點),只有 center 掛 `useDraggable`;mirror region(left / right pinned)只掛 `useDroppable`,drag 期以 `useDndContext` 同步 source 半透視覺(Path B source 留原位,無 row transform);handle 只 render primary(center)避雙觸發。**Cross-parent drop 禁止**(已知 limit):nested 只同 top-level 重排,collisionDetection 過濾,顯 invalid signal。

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

**Overlay**:viewport `position:fixed inset:0` layer。`getCellRect()` 從 `getBoundingClientRect()` 取 float coords no rounding。Paint:hover/selected ring `outline outline-offset:-1px` in-place(range outer ring 已 2026-05-10 retire — range 視覺只剩 cell-bg `--primary-subtle` `[data-range-cell]`,bg 已足以標示範圍、外框冗餘);active editor host portal opaque `<div>` z 3(cell 保持 view 態)。**Viewport clip**(Issue 6):body panel 加 `data-datatable-panel="left|center|right"`;`getCellGeometry()` return cell+panel rect;`<ClipMask>` panel rect `overflow:hidden`,內部 `toRelRect()` 轉 mask-relative(hover/selected ring 按 panel clip,不畫出 pin boundary)。Active editor host **不 clip**，因為 editor 必能越過 cell paint layer 接收互動。

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

**Keyboard 行為**(目前實作 — `tableKeyboardHandler`):
- ↑↓←→:cell-to-cell navigation **僅 `spreadsheetMode` opt-in 時生效**;selection 尚未建立時按方向鍵自動選取第一個 visible cell(鍵盤可直接進入 spreadsheet 導覽,無需滑鼠 click — 對齊 Excel / Google Sheets / AG Grid「focus grid → first cell active」,2026-07-05 D4 補);預設模式方向鍵無作用
- Enter / F2:spreadsheet 模式下進 cell editing(cell 可編輯 + 非 boolean/url 時);**Enter 確認後維持原格不下移**(2026-07-05 user 拍板;10 家實查:Excel 系 7 家下移、AG Grid 預設維持原格 — 採 AG Grid 派,數據 → `.claude/logs/deep-audit-2026-07-03/enter-commit-navigation-benchmark.json`;未來連續輸入需求可重議 opt-in);**edit 退出(commit / Esc)後 selection 還原至該 cell、焦點還給 table root**(editor unmount 後焦點掉到 body 才收回,不搶 user 點擊的新焦點 — 對齊 spreadsheet RFC Contract 11 + Excel / AG Grid,2026-07-05 D4 補)
- Cmd/Ctrl+A:`mode="multi"` selection 時選全可見列(扣 disabled)
- Esc:取消 editing(spreadsheet)/ 清 selection(selection mode);**IME 組字中的 Enter / Esc 不觸發 commit / cancel**(cell editor 帶 `isComposing` guard,2026-07-05 D4 補 — 中文選字 Enter 不誤提交半截組字)
- Tab:進入表格後操作排序與勾選;portal edit(`experimentalActiveEditorController`)中 Tab / Shift+Tab = commit 當前 draft + 移至下一個 editable cell 進 edit(2026-07-05 D4 補 commit — 原本換格丟 draft)

> APG grid full keyboard model(Home/End、Ctrl+Home/End、PageUp/PageDown、roving cell action)為 `role="grid"` future tier 目標,**尚未實作**。

**Focus**:table root `tabIndex=0` **僅在 selection enabled 或 `spreadsheetMode` 時**(否則 `undefined` = 不可 focus);cell 目前無 roving `tabindex=-1` 機制。互動元素(勾選框 / 排序 header / 展開鈕 / row action)各自 focusable + focus-visible ring(`outline: 2px solid var(--ring)`)。APG grid roving-tabindex focus model 為 future tier 目標,尚未實作 → 見 [WAI APG keyboard model](https://www.w3.org/WAI/ARIA/apg/patterns/grid/#keyboardinteraction)。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `bulk-action-bar.spec.md`
- `carousel.spec.md`
- `circular-progress.spec.md`
- `description-list.spec.md`
- `filter-operators.spec.md`
- `opacity.spec.md`
- `pagination.spec.md`
- `scroll-area.spec.md`
- `tree-view.spec.md`
