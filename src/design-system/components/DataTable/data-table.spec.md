# DataTable 設計原則

## 定位

DataTable 是基於 TanStack Table 的資料表格元件，提供排序、篩選、選取、欄位操作、虛擬捲動等完整能力。
TanStack Table 負責邏輯，DataTable 負責視覺與互動。

簡單展示場景也用 DataTable（最少 config），不另外維護靜態 Table。
底層使用 `<div>` + ARIA role，不用語義 `<table>`——虛擬捲動需要絕對定位 row，`<table>` 的佈局模型不支援。

**不是試算表**——不做公式計算、不做跨 cell 選取。

---

## 層級架構

每一層建立在前一層之上，可獨立啟用。

| 層級 | 能力 | 狀態 |
|------|------|------|
| **L1 基礎結構** | 骨架、尺寸、border、色彩 | 本文件 |
| **L2 選取** | row selection、checkbox、批次操作列 | 待定 |
| **L3 欄位互動** | 排序、resize、reorder、pin、顯示隱藏 | 待定 |
| **L4 資料操作** | 篩選、分組、搜尋（統一入口） | 待定 |
| **L5 Cell 能力** | custom renderer、inline edit、validation、copy/paste | 待定 |
| **L6 進階呈現** | 展開列、tree data、虛擬捲動 | 待定 |
| **L7 匯出** | CSV/Excel、列印、context menu | 待定 |

---

## L1：基礎結構

### 一、Table Size

DataTable 有三種尺寸（`sm`、`md`、`lg`），透過 `size` prop 控制。

**Size 不等於 density。** Size 是這張表格的結構決策（需要多緊湊），density 是全域的使用者偏好。同一頁可以有不同 size 的表格，density 全頁一致。

- Header cell 的水平 padding 是靜態值——header 是結構性區域，間距固定以維持欄位分隔線的穩定位置
- Body cell 的 padding 引用 `--ui-space-*` token，隨 density 響應——觸控模式自動獲得更寬鬆的操作間距
- 沒有 row minHeight——行高由 padding + 內容自然決定，配合虛擬捲動的動態測量

### 二、Header vs Body 的視覺區隔

Header 是表格的「控制面板」，body 是「資料區」，兩者有刻意的視覺差異：

**Header 有垂直分隔線、body 沒有。** Header 承載欄位操作（resize、reorder），垂直分隔線既是欄位邊界的辨識線，也是 resize handle 的視覺錨點。Body 的內容由 header 建立的欄位邊界引導，額外的垂直線只增加雜訊。

**Header 文字弱化。** Header 是結構標籤，不是資訊本體。使用次要文字色 + 小字 + 中粗體，讓視覺重心留在 body 的資料上。

### 三、外框規則

外框的有無由「表格是否具有明確邊界」決定：

- **一般表格**：無外框，表格融入頁面。最後一行保留底線自然收尾
- **有 frozen column**：加外框。固定欄與捲動區域的陰影分界暗示「這是有邊界的容器」，沒有外框時陰影會漂浮在空中。有外框時最後一行底線去掉，避免與外框 double border
- **全表 inline edit**：加外框。外框標記「這是一個可編輯區域」，跟 input 元件加邊框是同一個原則——邊框 = 可互動的邊界提示。有外框時最後一行底線同樣去掉

### 四、文字截斷

- **預設截斷（ellipsis）**：大多數欄位。截斷時自動顯示 tooltip 展示完整文字，未截斷時不顯示——tooltip 是補救機制，不是裝飾
- **換行（wrap）**：描述、備註等需要看完整內容的欄位。由 column definition 指定

### 五、對齊

對齊跟隨資料的閱讀方式：
- **文字靠左**——西文閱讀方向
- **數字靠右**——位數對齊，方便縱向比較
- **操作靠右**——固定在行尾，形成穩定的操作區
- **Checkbox 置中**——固定寬度的選取欄

Header 的對齊永遠與該欄 body cell 一致。

### 六、Row 狀態

- **不使用斑馬紋**——hover + selected 兩種狀態已足夠，斑馬紋疊加會產生四種以上的背景色組合，增加視覺雜訊
- **Hover 與 selected 用不同色系**（neutral vs primary-subtle），讓使用者一眼區分「正在看的」與「已選的」

### 七、Row Actions

每列最右側可配置操作選單（編輯、刪除、複製等）：

- 預設 hover 時才顯示——減少視覺雜訊，使用者不需要時不佔注意力
- 可配置為常駐顯示（適合操作頻率極高的場景）
- Row actions 永遠固定在最右側，不參與水平捲動

### 八、與 Toolbar 的關係

DataTable 不內建 toolbar。Toolbar 是外部用 action-bar pattern 組合的，保持職責分離。

篩選、排序、分組走統一入口（toolbar 按鈕），不做在表頭的 per-column filter。這些按鈕的 variant 規則見 `action-bar.spec.md`。

### 九、虛擬捲動

使用 TanStack Virtual，只渲染可見區域的 row。因為 cell padding 響應 density、部分欄位允許換行，行高不固定，必須用 `measureElement` 動態測量。

Header 永遠固定在頂部，不參與虛擬捲動。

---

## 禁止事項

- ❌ 不使用斑馬紋——hover / selected 已足夠區分行，斑馬紋增加狀態組合的視覺複雜度
- ❌ 一般表格不加外框——只有 frozen column 或全表 inline edit 才加
- ❌ Body cell 之間不加垂直分隔線——靠 header 建立的欄位邊界引導即可
- ❌ Toolbar 不內建在 DataTable 裡——toolbar 是外部組合，職責分離
- ❌ 截斷文字不無條件顯示 tooltip——只有實際被截斷時才顯示
- ❌ 數字欄位不靠左對齊——靠右才能縱向比較
- ❌ 不假設行高固定——虛擬捲動必須動態測量

---

## 關聯文件

- `action-bar.spec.md`：toolbar 的排列、variant、溢出規則
- `button.spec.md`：row actions 按鈕規則
- `uiSize/uiSize.spec.md`：`--ui-space-*` token 定義
- `color/color.spec.md`：語義色彩
- `elevation/elevation.spec.md`：固定欄陰影
