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
| **L5 Cell 能力** | custom renderer、inline edit、validation、copy/paste | 待定 |
| **L6 進階呈現** | 展開列、tree data | 待定 |
| **L7 匯出** | CSV/Excel、列印、context menu | 待定 |

---

## L1：基礎結構

### 一、Table Size

DataTable 有三種尺寸（`sm`、`md`、`lg`），透過 `size` prop 控制。

**Size 不等於 density。** Size 是這張表格的結構決策（需要多緊湊），density 是全域的使用者偏好。同一頁可以有不同 size 的表格，density 全頁一致。

水平 padding 隨 density 響應（觸控模式自動加大），垂直方向由行高模式決定（見第四節）。

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

### 三、Header 結構

**Header 在垂直 scroll 容器外面，水平捲動用 JS 同步。**

為什麼不用 sticky：table 的底色是 `bg-surface`（半透明），sticky header 需要不透明背景才能擋住底下的 body rows。但 table 可能放在任何容器上（canvas、card、modal），無法預先算出 surface 疊加後的最終不透明色。把 header 拿到 scroll 外面，`bg-muted` 自然疊在 `bg-surface` 上，不管 table 放在哪裡顏色都正確。

水平捲動同步用 `onScroll` → `headerRef.scrollLeft`，這是 AG Grid 等世界級 table 的標準做法。

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

**Header 有垂直分隔線、body 沒有。** Header 承載欄位操作（resize、reorder），垂直分隔線既是欄位邊界的辨識線，也是 resize handle 的視覺錨點。Body 的內容由 header 建立的欄位邊界引導，額外的垂直線只增加雜訊。

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

每列最右側可配置操作選單（編輯、刪除、複製等）：

- 預設 hover 時才顯示——減少視覺雜訊，使用者不需要時不佔注意力
- 可配置為常駐顯示（適合操作頻率極高的場景）
- Row actions 永遠固定在最右側，不參與水平捲動

### 十、與 Toolbar 的關係

DataTable 不內建 toolbar。Toolbar 是外部用 action-bar pattern 組合的，保持職責分離。

篩選、排序、分組走統一入口（toolbar 按鈕），不做在表頭的 per-column filter。這些按鈕的 variant 規則見 `action-bar.spec.md`。

### 十一、可推導值的原則

**可推導的值用 CSS `calc()` 表達推導過程，不硬寫結果。** 這讓依賴關係留在 code 裡——上游值變動時，下游自動跟著算，不需要有人「記得」去改第三個數字。

---

## 禁止事項

- ❌ 不使用斑馬紋——hover / selected 已足夠區分行，斑馬紋增加狀態組合的視覺複雜度
- ❌ 無隱藏內容、無 frozen column、非 inline edit 的表格不加外框
- ❌ Body cell 之間不加垂直分隔線——靠 header 建立的欄位邊界引導即可
- ❌ Toolbar 不內建在 DataTable 裡——toolbar 是外部組合，職責分離
- ❌ 截斷文字不無條件顯示 tooltip——只有實際被截斷時才顯示
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
