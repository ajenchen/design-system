---
# Story Auto-Compile 結構化 canonical(見 .claude/planning/story-auto-compile.md Phase 2)
# Keys 必跟 button.tsx buttonMeta + cva buttonVariants 對齊(compile-time 驗)。
component: Button
family: 3  # Pill Layout
traits:
  - hasVariants
  - hasSizes
  - hasInteractiveStates
variants:
  primary:
    when: "主要 action / CTA"
    world-class: ["Polaris Button primary", "Material Filled Button", "Atlassian Primary"]
  secondary:
    when: "陪襯 primary 的次要 action"
    world-class: ["Polaris Button default", "Material Tonal Button"]
  tertiary:
    when: "第三級 action(tool-like / icon-heavy)"
    world-class: ["Material Outlined Button"]
  text:
    when: "文字樣式 — low emphasis / toolbar embedded"
    world-class: ["Ant Button type=text", "Material Text Button"]
  link:
    when: "內文連結 — inline reading context"
    world-class: ["Polaris Link", "Ant Button type=link"]
sizes:
  xs: { when: "row-embedded inline(FileItem rich action / DataTable row action)" }
  sm: { when: "form field-height 28 / compact chrome" }
  md: { when: "default general UI" }
  lg: { when: "touch / prominent CTA / stakeholder-facing surface" }
禁止事項:
  - rule: "iconOnly 必傳 aria-label"
    reason: "a11y 硬性要求 — 無 label 盲人讀不到"
    反例: "<Button iconOnly startIcon={X} />"
  - rule: "不自加 embedded=true / dense 類維度"
    reason: "Embedded 情境走 L2 host slot(如 Input.endAction)不擴 Button"
    反例: "Button 加 embedded=true 繞過 L2 分層"
  - rule: "dismiss 走 dismiss prop 不用 destructive"
    reason: "Dismiss 是功能弱化 fg-muted,非破壞性"
    反例: "<Button iconOnly variant=destructive startIcon={X} />"
related:
  近親: [SegmentedControl, IconButton, Link]
  SSOT-anchor: "button.spec.md → Pill Layout(Family 3 SSOT)"
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

> **Foundational SSOT rationale**(cap 800,2026-04-25 approved):
> Family 3 (Pill Layout) SSOT owner。SegmentedControlItem / Chip / Tag 繼承 Pill 結構;Dismiss canonical(X icon 色處理)cascade 到全 DS inline actions;Button sm/md/lg 與 Field sm/md/lg size pairing 是系統級 invariant。scope 本質 > 單一元件。

# Button 設計原則

## 定位

Button 是最基礎的互動元件，用於觸發操作或導覽。
基於 shadcn/ui Button，橋接設計系統 token，支援 uiSize 自動縮放。

**Layout Family**：本元件是 **CLAUDE.md 4-Family Model Family 3（Pill Layout）的 SSOT 擁有者 + action trigger sub-profile canonical**。SegmentedControlItem / Chip / Tag 繼承本元件的 Pill Layout 結構。

---

## 何時用

- **觸發 primary action / CTA**:Submit form、Save、Publish、Send、Confirm 等改變 system state 的動作
- **次要 navigation in flow**:Wizard 的 Next / Back、Modal 的 Continue、Onboarding 的 Get started
- **Submit form**:`<Button type="submit">` form 結尾的提交鍵
- **Confirm dialog**:Dialog footer 的 Confirm / Cancel pair(action-bar.spec.md SSOT)
- **Toolbar utility**(xs / sm icon-only):text editor / canvas toolbar 的格式化 / 工具切換

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 純 navigation 跨頁(無 state change)| `Link` / HTML `<a>` | Button 語義是「觸發動作」,navigation 用 anchor SR 朗讀「link」而非「button」 |
| Inline 段落內可點文字 | HTML `<a>` 或 `link` variant standalone | `link` variant 不嵌入段落(見 link variant 規則),段落內用原生 `<a>` |
| Tab-style 同層切換(總覽 / 成員 / 設定)| `Tabs` / `SegmentedControl` | 「多選一」radio 語義,不是動作觸發 |
| Toggle filter / view-mode 多選一(列表 / 看板 / 時間軸)| `SegmentedControl` | 同上,不是 `pressed` button |
| Status / data indicator(non-action,例「3 件待處理」label)| `Tag` / `Badge` | Indicator passive 語義(font-normal / cursor-text),Button 是 action(font-medium / cursor-pointer) |
| Avatar / icon 純展示(non-clickable)| `Avatar` / `Icon` | 無 interactive 語義不應 Button |

---

## Pill Layout（Family 3 SSOT）

**結構**：

```
[startIcon? 16/20px] [<span px-1>label</span>] [<span gap-1>badge? + endIcon?</span>]
```

- 單行不 wrap
- Label 兩側隱性 4px 呼吸(icon ↔ label / label ↔ suffix 對稱)
- 右側 suffix(badge + endIcon)內部 4px

**為什麼用 label 兩側隱性呼吸而非外層 gap**:
- Icon-only(無 label)→ 外層 padding 公式 `(field-height - icon)/2` 自然對齊,無需 gap
- Has-label → label 兩側隱性 4px 給 icon 跟文字之間 / label 跟 suffix 之間,**單一規則產生兩側 symmetric spacing**
- 若用外層 gap-1,icon-only 時要再加條件移除;label 兩側機制更穩(實作 class 細節詳 `button.tsx`)

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

**世界級對照(per-variant)**:
- `primary` ≈ Material `Filled` / Polaris `Primary` / Ant `type="primary"` / Carbon `Primary`
- `secondary` ≈ Material `Outlined` / Polaris `Default` / Ant `type="default"` / Carbon `Secondary`
- `tertiary` ≈ Material `Tonal/Filled Tonal` / Atlassian `Subtle` / Ant `type="dashed"`(近似)
- `text` ≈ Material `Text` / Polaris `Plain` / Ant `type="text"` / Atlassian `Subtle-Link`
- `link` ≈ Polaris `Plain+removeUnderline=false` / Ant `type="link"` / Apple HIG Borderless

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

**Idiom**(2026-04-25 重訂為 Polaris/Atlassian padding-free 派):

```tsx
const ICON_ONLY_BASE = 'aspect-square p-0 min-w-0 gap-0'
```

1. **`aspect-square`** 從 `h-field-X` 推 width=height
2. **`p-0`** override base `px-3`,完全無 inner padding
3. **base `flex items-center justify-center`** + **`[&_svg]:shrink-0`** → SVG 自動置中且不被擠

完整 rationale(包含 2026-04-25 從 padding-formula 派切換的 bug origin)+ 4 家世界級對照 → **SSOT 在 `tokens/uiSize/uiSize.spec.md`「Icon-only 元件的 padding canonical」節**。本 spec 不重複,只 pointer。

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

### Dismiss 視覺類(X close only)

**Dismiss 語意嚴格 = 「關閉 surface / 忽略訊息」— 只屬 X(close)icon**。Trash / Delete / Remove / Clear **不是 dismiss**(見 inline-action.spec.md「Dismiss canonical — X close only」)。

#### `dismiss` prop 規則(X close 專用)

| 屬性 | 規則 | 為什麼 |
|------|------|--------|
| `variant` | **強制 `text`**(由 `dismiss` prop 內部 override)| 其他 variant chrome 太強,搶 dismiss 弱化語意 |
| Icon 色 default | **`fg-muted`**(override Button text variant 預設 `foreground`) | 對齊 Inline Action dismiss 弱化,cross-implementation 一致 |
| Icon 色 hover | `foreground` | 對齊 Inline Action hover |
| `iconOnly` | **強制 true** | dismiss 必 icon-only,帶 label 違反「可忽略」本質 |

#### 觸發條件(Button 限定)

**觸發** `dismiss` prop override:
- `<Button dismiss />` 明示
- callback = `onClose` / `onDismiss`(X close 語意)

**不觸發**(這些 callback 語意非 dismiss):
- `onRemove` — collection 層面移除 item(用一般 Button / Inline Action)
- `onClear` — 欄位清空 value(用 Inline Action)
- `onDelete` — destructive remove(用一般 primitive,icon 選 Trash 自帶破壞性語意)

#### 典型 case

- Dialog / Sheet / Popover / Alert **chrome corner close X** → `<Button iconOnly dismiss />`(action group region;corner 左側可並排 refresh / share + Separator)
- Toast / Coachmark corner close X → 同上
- FileItem / DataTable **row delete(Trash icon)**→ 一般 Button xs 或 Inline Action(看 row size),**不套 dismiss**
- Tag dismiss X / Input clear X → Inline Action(host chrome padding 內,不是 Button)

完整 predicate 見 `patterns/element-anatomy/item-anatomy.spec.md`「Predicate」+「Dismiss canonical」。

#### `data-unbounded` attribute(2026-04-22 v5 canonical)

Button 自動加 **`data-unbounded="true"`** attribute 當 **`variant === 'text'` OR `dismiss === true`** 任一成立。這是 DS-wide 視覺邊界 marker,讓容器(如 SurfaceHeader)可用 CSS selector 對無視覺邊界 button 套 layout 調整。

**實際應用**:`SurfaceHeader` / `SurfaceFooter` 內建 CSS rule:
```css
[&_[data-unbounded]]:my-[calc((var(--field-height-xs) - var(--field-height-sm)) / 2)]
```
→ md: my=-2px / lg: my=-4px
→ 效果:Button native size 不變(sm 28/32,touch target 亦同),**layout 佔位縮到 24**(等效 xs 幾何),header = 24 + 2×tight = 48/56 = `--chrome-header-height` ✓

**詳**:`patterns/overlay-surface/overlay-surface.spec.md`「Chrome dismiss size canonical」+ `tokens/uiSize/uiSize.spec.md`「Chrome header 選型 canonical」。

**Consumer 無需手動加**:Button 自動設。若 consumer 自刻非 Button 的 unbounded control(罕見),可手動加 `data-unbounded="true"` 加入 canonical。

### 禁止事項(dismiss)

- ❌ Trash / Delete / Clear 套 `dismiss` prop — 語意誤用;destructive/clear 本身有明確語意,弱化會混淆
- ❌ Dismiss Button 帶 label(「關閉」/ Close)— 雙重 affordance 違反本質
- ❌ Dismiss Button 用 `variant="primary/secondary/tertiary"` — `dismiss` prop 內部強制 text,傳其他 variant 無效
- ❌ X close 用 Inline Action 在 chrome corner — corner 屬 action group region(多 action 排列 + Separator),必 Button

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

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `alert.spec.md`
- `chip.spec.md`
- `data-table.spec.md`
- `dropdown-menu.spec.md`
- `element-anatomy.spec.md`
- `file-upload.spec.md`
- `switch.spec.md`
- `tag.spec.md`
- `tooltip.spec.md`

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `bulk-action-bar.spec.md`
