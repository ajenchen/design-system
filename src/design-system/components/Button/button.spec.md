# Button 設計原則

## 定位

Button 是最基礎的互動元件，用於觸發操作或導覽。
基於 shadcn/ui Button，橋接設計系統 token，支援 uiSize 自動縮放。

---

## 內部結構

```
[startIcon?]  [label]  [badge? + endIcon?]
```

- `startIcon`：最多一個，放在最左側
- `badge` 和 `endIcon` 可同時出現在右側
- `badge` 傳入 Badge 元件（通知計數指示器）。Badge 層級應匹配按鈕的視覺重量——深色底按鈕（primary、checked、secondary+danger）只適合 `critical`，詳見 `badge.spec.md`

---

## Variant — 視覺強調等級

Variant 控制**視覺強調等級**（visual weight），不決定語意意圖。

| Variant | 何時使用 |
|---------|----------|
| `primary` | 這個畫面或操作區**最重要的單一主要動作**，每個操作區最多一個 |
| `secondary` | 正面與負面選項**並存**時，代表正面那個（例：儲存草稿 vs 放棄） |
| `tertiary` | **最常用**的非主要按鈕；取消、關閉、一般輔助操作都用這個 |
| `text` | 低視覺權重；適合不需要特別強調的輔助動作 |
| `checked` | 某個功能**目前啟用中**（binary toggle）；未啟用可使用 `secondary` 以下任何 variant，啟用後換 `checked` |
| `link` | 帶使用者前往其他頁面的按鈕，視覺上像連結但需要 button 行為。放在內容區，不用於操作列，不嵌入段落文字（段落內用 HTML `<a>` 代替）|

> **`tertiary` 是日常最常用的變體。** 確認/取消配對、工具列輔助操作、卡片上的 CTA 幾乎都用 tertiary。

---

## danger prop — 語意意圖

`danger` 是 boolean prop，疊加在 variant 上，將顏色改為紅色。
**視覺強調等級（variant）與語意意圖（danger）分開表達，互相獨立。**

| 組合 | 使用場景 |
|------|----------|
| `primary` + `danger` | **立即且不可逆**——點下去就發生，前面沒有任何確認步驟 |
| `secondary` + `danger` | 有警示意圖，但點下去**還可以反悔**——後面還有一層確認 |
| `text` + `danger` | 低強調的危險操作——工具列刪除 icon（有後續確認）|

---

## 常見配對模式

```tsx
// 一般操作區（最常見）
<Button variant="primary">確認</Button>
<Button variant="tertiary">取消</Button>

// 正面 vs 負面選擇
<Button variant="secondary">儲存草稿</Button>
<Button variant="secondary" danger>放棄變更</Button>

// 立即危險操作（確認對話框最後一步，點下去就執行）
<Button variant="primary" danger startIcon={Trash2}>永久刪除</Button>
<Button variant="tertiary">取消</Button>
```

---

## Size

尺寸有四種，高度隨 `data-ui-size` 自動縮放（`xs` 除外）。
icon-only 不是獨立尺寸——加上 `iconOnly` prop 讓任何尺寸變正方形。

| Size | 何時使用 |
|------|----------|
| `xs` | 密集 UI、tag、inline 動作。固定尺寸，不隨 density 縮放 |
| `sm` | **預設**。工具列、表格行內 |
| `md` | 表單、對話框 |
| `lg` | 頁面主要 CTA |

---

## Icon

所有 icon 來自 `lucide-react`，禁止使用其他來源。

**兩個 icon prop 的語意不同：**

| Prop | 語意 |
|------|------|
| `startIcon` | **描述這個按鈕做什麼**——是 label 的圖示說明（Plus、Save、Download、Trash2） |
| `endIcon` | **指示按鈕會開啟下一層**——告訴使用者點了還有更多（ChevronDown、ChevronRight） |

`endIcon` 不應放動詞性圖示（如 Download、Trash2），否則使用者會誤以為右側有獨立的第二個操作。

### 溢出選單

溢出的位置、類型、判斷規則，見 `action-bar.spec.md`。

### iconOnly 的邊界

`iconOnly` 嚴格定義為「只有一個 icon，正方形」，不可與 `endIcon` 或 `badge` 並用。

**icon-only 按鈕內建自動 tooltip：** 當 `iconOnly` 為 true 時，Button 自動以 `aria-label` 的值渲染 tooltip。開發者不需要額外包 `<Tooltip>`——tooltip 是元件保證的行為，不是開發者「記得要加」的外部組合。

`aria-label` 是給螢幕閱讀器的，tooltip 是給所有人看的，兩者語意相同，由同一個值驅動。

需要附加元素時有兩種明確 pattern：

**icon + 下拉指示**——不加 `iconOnly`（保留 endIcon 展開指示），必須設定 `aria-label`。

**icon + overlay 角標**——角標用外部 `relative` 容器疊加，不是 Button 的 `badge` prop（inline badge 會破壞正方形）。

---

## 狀態

### disabled

- 防止表單重複送出、避免使用者因延遲而重複點擊
- `disabled` 本身**不代表**正在載入；若需傳達載入中，應同時設定 `loading`
- disabled 時品牌 / 狀態色完全移除，統一回到 neutral——避免「可用但弱化」的視覺誤導
- danger 在 disabled 時同樣消失，呈現與非 danger 版本相同的外觀

### loading

顯示 spinner，自動 disabled，設定 `aria-busy`。

**Spinner 永遠在左側（`startIcon` 位置）**，方向與行動發起一致：
- 有 `startIcon` → icon 換成 spinner（同位置替換）
- 無 `startIcon` → spinner 加在文字左邊

`badge` / `endIcon` 在 loading 時依然顯示。

### checked（toggle）

`checked` variant 表示**該按鈕的功能目前啟用中**（只有開和關兩種狀態）。

適用場景：全螢幕開關、釘選、篩選啟用、面板展開等**單一功能的 on/off**。

> **多選一（radio group）不要用 `checked`。** 視圖切換（清單 / 看板 / 時間軸，三選一）是 radio group 語意，應使用 Segmented Control。`checked` 只描述「這個按鈕自己的功能是否開啟」。

---

## 按鈕排列

排序、分隔線、溢出規則的 single source of truth 在 `action-bar.spec.md`。

### 垂直排列

所有按鈕撐滿容器寬度（`fullWidth`）。**最希望被點擊的按鈕放最上方**——視覺動線由上往下。

---

## 禁止事項

- ❌ 同一操作區不得超過一個 `primary`——超過一個時使用者無法判斷主次
- ❌ 卡片清單的重複 CTA 不得用 `primary`——頁面充斥填滿按鈕會稀釋 primary 的信號強度，改用 `tertiary`
- ❌ `primary` + `danger` 前面不得有任何確認步驟——它本身就是最後一步
- ❌ icon-only 不得省略 `aria-label`——tooltip 由元件自動產生，但 `aria-label` 是必要輸入
- ❌ 不得引用 `lucide-react` 以外的 icon
- ❌ `startIcon` 不得放超過一個
- ❌ `link` variant 不得嵌入段落文字——用 HTML `<a>` 代替
- ❌ 不得直接使用 `variant="destructive"` 或 `variant="ghost"`——shadcn 內部 alias，僅供框架元件使用
- ❌ `danger` 僅支援 `primary`、`secondary`、`text`——`tertiary` + danger 與 secondary 視覺完全相同（冗餘），`link` + danger 語義矛盾（連結暗示導覽，非破壞）
- ❌ `checked` 不得用於多選一——應使用 Segmented Control
- ❌ `iconOnly` 不可與 `endIcon` 或 `badge` 並用——會破壞正方形結構
