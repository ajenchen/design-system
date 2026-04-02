# DataTable 設計原則

## 定位

DataTable 是基於 TanStack Table 的資料表格元件，提供排序、篩選、選取、欄位操作、虛擬捲動等完整能力。
TanStack Table 負責邏輯，DataTable 負責視覺與互動。

簡單展示場景也用 DataTable（最少 config），不另外維護靜態 Table。
底層使用 `<div>` + ARIA role，不用語義 `<table>`——虛擬捲動需要絕對定位 row，且未來 frozen column 需要獨立 scroll 區域，`<table>` 的佈局模型兩者都不支援。

**不是試算表**——不做公式計算、不做跨 cell 選取。

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

水平 padding 統一 12px，不隨 size 或 density 變化。垂直方向由行高模式決定（見第四節）。

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

```
table
├── header（固定頂部，不在 scroll 內）
│   ├── left-header（shrink-0, overflow:hidden）
│   ├── center-header（flex-1, overflow:hidden, JS sync scrollLeft）
│   └── right-header（shrink-0, overflow:hidden）
└── body-viewport（overflow-y:auto, display:flex, items-start）
    ├── left-body（shrink-0, overflow:hidden）
    ├── center-body（flex-1, overflow-x:auto, overflow-y:hidden）
    └── right-body（shrink-0, overflow:hidden）
```

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

**邊框標記「這裡有使用者看不到的內容」。** 沒有邊框時，被裁切的內容看起來像 render bug。

加框的條件（滿足任一即加）：
- **垂直捲動**（有高度約束，內容超出容器）
- **水平溢出**（欄位總寬超過容器）
- **有 frozen column**（固定欄與捲動區域的陰影分界需要外框歸屬）
- **全表 inline edit**（可編輯容器需要邊界提示）

不加框時，最後一行保留底線自然收尾。加框時最後一行底線去掉，避免與外框 double border。

### 七、Column Type

**Column type 是資料行為的預設合約。** 指定 type 就自動獲得該類型的對齊、渲染、排序、篩選行為，不需要逐一配置。

每種 type 回答四個問題：
1. **看起來像什麼**——文字？badge？avatar？checkbox？
2. **怎麼對齊**——跟隨資料的閱讀方式（文字靠左、數字靠右、checkbox 置中）
3. **怎麼排序**——字母序？數值？時間？
4. **怎麼篩選**——文字搜尋？範圍？多選？

Type 提供合理的預設，但每個問題都可以在 column definition 層級覆寫。

Header 的對齊永遠與該欄 body cell 一致。

### 八、Row 狀態

- **不使用斑馬紋**——hover + selected 兩種狀態已足夠，斑馬紋疊加會產生四種以上的背景色組合，增加視覺雜訊
- **Hover 與 selected 用不同色系**（neutral vs primary-subtle），讓使用者一眼區分「正在看的」與「已選的」

### 九、Row Actions

每列最右側可配置操作（編輯、刪除、複製等）。位於 right-pinned region，不參與水平捲動。

**元件：** `Button variant="text" size="xs" iconOnly`——Row action 是獨立的 Button，不是 Inline Action（Inline Action 是嵌入在其他元件內部的，如 Tag dismiss）。

**常駐顯示。** Row actions 有獨立的 frozen right region，不佔資料欄位空間，永遠可見。Region 邊界用全高度 `border-divider` 標示。

**收納邏輯：**

| 數量 | 顯示方式 |
|------|----------|
| 1-2 | icon buttons 並排 |
| 3+ | 前 1-2 個 inline + MoreVertical dropdown |

MoreVertical dropdown 包含所有操作，確保鍵盤可存取全部。

**Header/body 寬度同步：** Header 渲染 invisible buttons 佔位，確保 header 和 body 的 right region 同寬。

### 十、與 Toolbar 的關係

DataTable 不內建 toolbar。Toolbar 是外部用 action-bar pattern 組合的，保持職責分離。

篩選、排序、分組走統一入口（toolbar 按鈕），不做在表頭的 per-column filter。這些按鈕的 variant 規則見 `action-bar.spec.md`。

### 十一、Cell 單行截斷原則

固定行高模式下，所有 cell 內容都是單行。空間不足時的行為：

- **純文字**（text、number、currency、date、boolean）：文字 `text-overflow: ellipsis`
- **Tag**（select）：Tag 可縮，文字在 Tag 內部 truncate，背景跟著縮——不是整個 Tag 被裁掉
- **多 Tag**（multiSelect）：根據容器寬度動態計算 `+N`，不靠視覺裁切
- **Person**（avatar + name）：avatar 不縮，name 文字 truncate
- **Link**：連結文字 truncate

被截斷的內容 hover 時顯示 tooltip（由 `TruncateCell` 統一處理）。自動行高模式不適用此規則——wrap 欄位可換行撐高 row。

### 十二、Inline Edit（L5 設計決策）

全表 inline edit 模式的視覺差異：

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

## 關聯文件

- `action-bar.spec.md`：toolbar 的排列、variant、溢出規則
- `button.spec.md`：row actions 按鈕規則
- `uiSize/uiSize.spec.md`：`--table-row-*`、`--field-height-*` token 定義
- `color/color.spec.md`：語義色彩
- `elevation/elevation.spec.md`：固定欄陰影
