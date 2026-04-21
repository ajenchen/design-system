# Button 設計原則

## 定位

Button 是最基礎的互動元件，用於觸發操作或導覽。
基於 shadcn/ui Button，橋接設計系統 token，支援 uiSize 自動縮放。

**Layout Family**：本元件是 **CLAUDE.md 4-Family Model Family 3（Pill Layout）的 SSOT 擁有者 + action trigger sub-profile canonical**。SegmentedControlItem / Chip / Tag 繼承本元件的 Pill Layout 結構。

---

## Pill Layout（Family 3 SSOT）

**結構**：

```
[startIcon? 16/20px] [<span px-1>label</span>] [<span gap-1>badge? + endIcon?</span>]
```

- 單行（`whitespace-nowrap`）
- Label 包在 `<span className="px-1">` 產生 4px 隱性呼吸
- 右側 suffix 用 `<span className="inline-flex items-center gap-1">` 包住（badge + endIcon 之間 4px）
- 最外層 `gap-0` 或 `gap-1`（由 size 決定——詳見下）
- Items centered (`items-center`)

**為什麼 label 用 span px-1 而非外層 gap**：
- Icon-only 模式（無 label）：外層 padding 公式 `(field-height - icon)/2` 自然對齊無需 gap
- Has-label 模式：label 的 `px-1` 給 icon 跟文字之間的隱性 4px，同時給兩邊 suffix 也是 4px——**單一規則產生兩側 symmetric spacing**
- 若用外層 gap-1，icon-only 時要再加條件移除 gap；用 span px-1 機制更穩

### Sub-profile 1: Action trigger（canonical: Button）

Members: **Button, SegmentedControlItem, Chip**。

| Size | 外距 | 字體 | 字重 | 圖示 | Gap |
|------|------|------|------|------|-----|
| `xs` | `px-2`（8px） | `text-caption`（12px） | `font-medium` | 16px | `gap-0` |
| `sm` | `px-3`（12px） | `text-body`（14px） | `font-medium` | 16px | `gap-1` |
| `md` | `px-3`（12px） | `text-body`（14px） | `font-medium` | 16px | `gap-1` |
| `lg` | `px-3`（12px） | `text-body-lg`（16px） | `font-medium` | 20px | `gap-1` |

**特徵**：padding 較鬆（xs=px-2、sm+=px-3）、font-medium 強調視覺重量、`cursor: pointer`——**因為需要命中區 + 視覺重量搶點擊焦點**。

#### xs 的專屬用途：icon-only toolbar utility

`xs` size 在系統中**不是一般 button**——它是為 **toolbar 的 icon-only compact button** 而存在：
- **24px 固定**（不隨 density 縮放），配合工具列密集排佈
- **主要用法**: icon-only（無 label 或極短 label），text editor / design canvas toolbar 情境
- **不配對 Field**（Field 家族用 sm/md/lg），純 standalone utility
- **Icon-only 時**自動套用 `px-[calc((field-height-xs - 16px)/2)]` = `px-1`（4px）以產生正方形 hit box

雖然 code 允許 xs 帶短 label（text-caption 12px），但**主要場景應該是 icon-only**。有 label 的 compact button 建議直接用 `sm`（28px）。

SegmentedControl 的 xs 遵循相同約束（見 `segmented-control.spec.md`）。

### Sub-profile 2: Data indicator（canonical: Tag）

Members: **Tag**。

| Size | 外距 | 字體 | 字重 | 圖示 | Gap |
|------|------|------|------|------|-----|
| `sm` | `px-1`（4px） | `text-caption`（12px） | `font-medium` | 16px | 隱性（靠 label `px-1`） |
| `md` | `px-1`（4px） | `text-body`（14px） | `font-normal` | 16px | 隱性（靠 label `px-1`） |
| `lg` | `px-1`（4px） | `text-body`（14px） | `font-normal` | 16px | 隱性（靠 label `px-1`） |

**特徵**：padding 較緊（全部 `px-1`）、font-normal（indicator passive 語意）、`cursor: text`——**因為是 data indicator 不是 action，視覺是配角不搶焦點**。

### Action vs Indicator 為什麼不統一

Tag md 和 Button xs 同 24px，但：
- Tag md `px-1` / text-body 14px / font-normal / cursor-text
- Button xs `px-2` / text-caption 12px / font-medium / cursor-pointer

**不統一的世界級理由**（對照 Material / Polaris / Atlassian / Ant / Carbon 共識）：
- **padding 跟著 role**：action 要大命中區 + 視覺重量；indicator 要緊湊低視覺權重
- **font-weight 跟著 role**：action medium（吸引點擊）；indicator normal（passive 讀取）
- **font-size 跟著 pairing**：Tag md pair Field md（14px field typography）；Button xs 是 standalone utility button（compact toolbar，用 12px）

**跟 size 無關、跟 role 有關**。寫新 Family 3 元件先確認 role profile。

### Size Pairing 規則

| Pairing | 邏輯 |
|---------|------|
| Tag md ↔ Field md, Tag sm ↔ Field sm | Tag 出現在 Field 內（Combobox 已選 tag、DataTable cell）時視覺對齊 Field 字級 |
| Button sm / md / lg ↔ Field sm / md / lg | Button 配對 Field 時同名對應 |
| Button xs = 獨立 utility | 不配對 Field,用於 toolbar compact button |

---

## 內部結構（簡要，完整見 Pill Layout SSOT）

```
[startIcon?]  [label]  [badge? + endIcon?]
```

- `startIcon`：最多一個，放在最左側
- `badge` 和 `endIcon` 可同時出現在右側
- `badge` 傳入 Badge 元件（通知計數指示器）。Badge 層級應匹配按鈕的視覺重量——深色底按鈕（primary、secondary+danger）只適合 `critical`，詳見 `badge.spec.md`

---

## Variant — 視覺強調等級

Variant 控制**視覺強調等級**（visual weight），不決定語意意圖。

| Variant | 何時使用 |
|---------|----------|
| `primary` | 這個畫面或操作區**最重要的單一主要動作**，每個操作區最多一個 |
| `secondary` | 正面與負面選項**並存**時，代表正面那個（例：儲存草稿 vs 放棄） |
| `tertiary` | **最常用**的非主要按鈕；取消、關閉、一般輔助操作都用這個 |
| `text` | 低視覺權重；適合不需要特別強調的輔助動作 |
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
| `sm` | 工具列、表格行內 |
| `md` | **預設**。表單、對話框 |
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

**正方形保證雙重鎖**:
1. **Padding 公式**:`px-[calc((field-height - icon-size)/2)]` —— 水平 padding 等於 `(高度 - icon)/2`,讓 icon 落在正中心(密度切換時自動重算)
2. **`aspect-square` CSS rule**:強制 `width: height`,即使消費者誤傳 `children` / `badge` / `loading` 等會撐寬的內容,CSS 仍鎖死方形

兩層都存在是因為 #1 雖在正常情境夠用,但元件歷史上多次被回報「loading 狀態不方形」——`aspect-square` 是 last line of defense,讓未來任何 content 變動都不會破壞幾何鐵律。

**icon-only 按鈕內建自動 tooltip：** 當 `iconOnly` 為 true 時，Button 自動以 `aria-label` 的值渲染 tooltip。開發者不需要額外包 `<Tooltip>`——tooltip 是元件保證的行為，不是開發者「記得要加」的外部組合。

`aria-label` 是給螢幕閱讀器的，tooltip 是給所有人看的，兩者語意相同，由同一個值驅動。

需要附加元素時有兩種明確 pattern：

**icon + 下拉指示**——不加 `iconOnly`（保留 endIcon 展開指示），必須設定 `aria-label`。

**icon + overlay 角標**——**只適用 `iconOnly` Button**。canonical 走 `<Button iconOnly overlayBadge={<Badge .../>} />` prop,內部把 badge 相對於 icon 視覺重心定位(不是 button chrome padding)。**禁止** consumer 手刻 `<div relative><Button/><Badge absolute/></div>`——padding 差距會讓 badge 飄到 chrome 角,離 icon 太遠失去語義連結(曾發生「badge 位置錯得離譜」的 bug)。

**有 label 的 Button 禁止用 overlay Badge**——label 撐寬後 badge 會跑到按鈕右邊緣,跟 icon 語義脫鉤。若需傳達「這個 action 有 N 個待辦」用 **inline badge**(`<Button badge={<Badge/>}>...</Button>`,badge 跟 label 並列在右),或改 `iconOnly` 後走 overlay。完整規則見 `badge.spec.md`「Overlay 適用元件 canonical」節(明示 overlay 只疊在 iconOnly Button / Avatar / 純 Icon 三類「單一視覺重心」anchor)。

---

## 狀態

### Dark mode

由 semantic token(`--primary` / `--error` / `--foreground` 等)自動切換,無自訂 dark palette。詳見 `../../tokens/color/color.spec.md`。

### disabled

- 防止表單重複送出、避免使用者因延遲而重複點擊
- `disabled` 本身**不代表**正在載入；若需傳達載入中，應同時設定 `loading`
- disabled 時品牌 / 狀態色完全移除，統一回到 neutral——避免「可用但弱化」的視覺誤導
- danger 在 disabled 時同樣消失，呈現與非 danger 版本相同的外觀

### loading

顯示 `CircularProgress`(indeterminate),自動 disabled,設定 `aria-busy`。

**CircularProgress 永遠在左側(`startIcon` 位置)**,方向與行動發起一致:
- 有 `startIcon` → icon 換成 CircularProgress(同位置替換)
- 無 `startIcon` → CircularProgress 加在文字左邊

`endIcon` 在 loading 時維持顯示(如 ChevronDown 指示下拉仍可展開)。

**`badge` 不應出現在 loading 或 disabled 狀態。** Badge 傳達的是「有 N 件待處理」，但按鈕不可互動時使用者無法處理——繼續顯示計數是誤導。業務端應在進入 loading / disabled 前移除 badge。元件不會自動隱藏（避免替業務做判斷），但設計原則上不應出現這個組合。

### pressed（toggle）

`pressed` prop 表示**該按鈕的功能目前啟用中**（只有開和關兩種狀態）。設定 `pressed` 時 Button 自動寫入 `aria-pressed` 與 `data-state`，由 variant 的 `data-[state=on]` 分支套用樣式。

**適用 variant**：

- **`secondary` + `pressed`** → 淡藍底 / primary 字（對齊原 checked 視覺）
- **`tertiary` + `pressed`** → 同 secondary pressed 視覺（兩個 variant 按下後視覺合併）
- **`text` + `pressed`** → neutral-selected 底；hover 反向變淺（`neutral-selected-hover`）；`:active` 深一階（`neutral-selected-active`）
- **`primary` / `link`** → 不支援 toggle，傳入 `pressed` 無視覺效果（primary 本身是主要操作不應 toggle；link 語意為導覽不應 toggle）

適用場景：全螢幕開關、釘選、篩選啟用、面板展開等**單一功能的 on/off**。

```tsx
// 釘選按鈕（icon-only text variant）
<Button variant="text" iconOnly pressed={isPinned} startIcon={Pin} aria-label="釘選" />

// 篩選啟用
<Button variant="tertiary" pressed={filterOn} startIcon={Filter}>只看未完成</Button>
```

### Dismiss 視覺類(2026-04-22 新增,cross-implementation dimming canonical)

**Dismiss 視覺類 = callback 是 `onClose` / `onDismiss` / `onRemove` / `onClear` 的 iconOnly Button**。必遵守:

| 屬性 | 規則 | 為什麼 |
|------|------|--------|
| `variant` | **強制 `text`** | 其他 variant 視覺 chrome 太強,搶 dismiss 弱化語意 |
| Icon 色 default | **`fg-muted`**(override Button text variant 預設 `foreground`) | 跟 Inline Action dismiss 視覺一致,達成 cross-implementation 弱化 |
| Icon 色 hover | `foreground` | 跟 Inline Action hover 色一致 |
| `iconOnly` | **強制 true** | dismiss 必 icon-only(帶 label 違反 dismiss「可忽略」本質) |

**為什麼這樣**:不管 dismiss 實作走 Inline Action 或 Button(按 item-anatomy predicate 的 position 決定),視覺弱化語意跨實作一致 — user 不該感受到 dismiss 視覺差異。

**典型 case**:
- **FileItem row delete**(row dedicated region)→ Button size=row tier iconOnly variant=text + dismiss icon dimming
- **DataTable row delete action**(frozen column)→ 同上 size=row tier
- 在 host chrome 內的 dismiss(Dialog / Sheet / Alert / Tag)→ 走 Inline Action,本身已 fg-muted ✓

完整 predicate 見 `patterns/element-anatomy/item-anatomy.spec.md`「Predicate: Inline Action vs Button iconOnly」+「Dismiss 按鈕 canonical」。

### 禁止事項(dismiss)

- ❌ Dismiss Button 用 `variant="primary" / "secondary" / "tertiary"` — 視覺 chrome 太強
- ❌ Dismiss Button 帶 label(「關閉」/ Close)— dismiss 必 icon-only,雙重 affordance 違反本質
- ❌ Dismiss Button icon 色不 override,用 Button text variant 預設 foreground — 太強,不弱化

> **多選一（radio group）不要用 `pressed`。** 視圖切換（清單 / 看板 / 時間軸，三選一）是 radio group 語意，應使用 Segmented Control。`pressed` 只描述「這個按鈕自己的功能是否開啟」。

> **`pressed` 與 `:active` 的差異**——`:active` 是 CSS 瞬間 click 回饋（按下去那一刻），`pressed` 是 ARIA 持續 toggle on 狀態（按下後一直維持）。Button text variant 的 pressed 狀態同時支援 `:active`（再次點擊時的深一階回饋），兩者透過不同 token 表達（見 `color.spec.md` 的「active vs selected」段落）。

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
- ❌ `pressed` 不得用於多選一——應使用 Segmented Control
- ❌ `pressed` 不得套用於 `primary` / `link`——主要操作不應 toggle、link 語意為導覽
- ❌ `iconOnly` 不可與 `endIcon` 或 `badge` 並用——會破壞正方形結構

---

## 空值 / 驗證

N/A(action trigger,無資料層)。

---

## 相關

- `../Badge/badge.spec.md` — Button 內 badge slot 計數標記
- `../../patterns/action-bar/action-bar.spec.md` — 按鈕排列 / gap-2 分組規則 SSOT
- `../Tabs/tabs.spec.md` — tab 與 `pressed` button group 的分界
