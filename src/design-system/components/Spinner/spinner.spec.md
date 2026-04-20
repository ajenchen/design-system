# Spinner 設計原則

**載入中視覺 primitive**——整個設計系統唯一的 loading 旋轉圖示,任何要表達「進行中」的元件都從這裡消費。

**Layout Family**：非上述 family — self-contained primitive（獨立視覺，無 slot 結構）。

**實作基礎**：純 CSS 旋轉動畫（rotating SVG），無 external primitive base。

> 一個最薄的 primitive。沒有 variant、沒有速度調節、沒有 color prop。單一職責:顯示「東西在轉」。

---

## 定位

Spinner 是**純視覺 primitive**,跟 `Avatar` / Lucide `Icon` 同類——**自由 `size: number` (px)**,由消費者決定尺寸,顏色透過 `currentColor` 從父層繼承。

它不是獨立使用的「載入中頁面」。全頁 / overlay / skeleton 等更高階的 loading 狀態是**另一層元件的責任**(未來可能的 `LoadingOverlay` / `Skeleton`),Spinner 只是那些元件內部會用的底層 primitive。

---

## 何時用

- **Button / Inline Action 的 loading 狀態**：Button `loading` prop 內部渲染 Spinner
- **元件內部的非同步等待**：資料 fetch 中、form submitting、按鈕執行動作中
- **cell / row 局部 loading**：table cell 正在載入該列資料
- **小區塊的 inline 進度**：Toast action pending、search 結果載入中

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 全頁或 overlay loading | `LoadingOverlay`（未來）| Spinner 只是底層 primitive,全頁 loading 需要背景遮罩 + 居中容器 |
| 骨架載入（list / card / table 初次 render）| `Skeleton`（未來）| Skeleton 保留內容形狀讓使用者預期佈局 |
| 進度有具體百分比 | `Progress` | Spinner 是「不定進度」,有具體 % 用 Progress（分界詳見 `../Progress/progress.spec.md`「與 Spinner 的分界」節，為本分界的 SSOT） |
| 通知計數 / 狀態紅點 | `Badge`（dot 模式）| Badge 表達「有東西」,Spinner 表達「正在處理」 |

---

## 為什麼獨立成元件而不是 inline `Loader2`

歷史:過去 Button 的 `loading` state 在元件內 inline `<Loader2 size={iconSize} className="animate-spin" />`,同樣作法可能在 7 個 candidate 消費者複製:
- Button(`loading` prop,現有)
- Field endAction(async validation loading)
- Steps current indicator(step 執行中)
- SelectMenu / Combobox footer(async options loading)
- PeoplePicker(async search)
- DataTable row / pagination(async data loading)
- 全頁 / card / dialog 的 loading overlay

7 個 inline 重複會帶來:
1. **Icon drift** — 哪天想換成非 Loader2 的自訂 SVG,要改 7 處
2. **Animation drift** — 有人寫 `animate-spin`,有人寫自訂 `animate-[spin_1.5s_linear_infinite]`,快慢不同
3. **A11y 處理不一致** — 有人加 `role="status"`,有人加 `aria-hidden`,有人都沒加
4. **Size tier 查表複製** — 每個消費者都要 `size === 'lg' ? 20 : 16`,跟 `ICON_SIZE` 重複

抽成 primitive 就是 single source of truth——**今天只有 Button 一個消費者,但基礎建立好讓未來擴充零摩擦**,跟 `horizontal-overflow` / `item-layout` 同一個架構哲學。

---

## API

```tsx
export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** 尺寸(px)。預設 24。跟 Avatar / Lucide icon 相同的自由 px 策略。 */
  size?: number
  /**
   * A11y label。
   * - 不傳 → spinner `aria-hidden`,由父層用 `aria-busy` 管理 loading 狀態(Button 模式)
   * - 傳 → spinner 自己報 `role="status"` + `aria-label`(獨立 loading 區塊模式)
   */
  'aria-label'?: string
}
```

### 尺寸策略:自由 `number`,跟 Avatar 同一套

不用 `sm | md | lg` enum,理由跟 Avatar 一樣——Spinner 的消費場景跨度太大:
- 16px(Button text icon 位置、Field endAction、Tag 內)
- 20px(lg tier 的 icon 位置)
- 24px(row primitive 的 loading footer、inline card loading)
- 32px(loading card 中央)
- 48–64px(empty state、full-screen overlay)

用 enum 只能 cover 前兩個,empty state 和 overlay 一定會有人硬寫 `className="w-12 h-12"` 繞過 prop,反而製造漂移。

### 顏色策略:`currentColor`

Spinner 的 stroke 顏色是 `currentColor`(繼承父層的 text color)。消費者控制顏色:
- Button primary variant → text white → spinner 白色
- Button text variant → text foreground → spinner 深色
- Field endAction 位置 → text fg-muted → spinner 灰色
- Empty state → text fg-secondary → spinner 中灰

**不要**給 Spinner 加 `color` / `variant` prop——那會讓消費者陷入「要傳 `color="muted"` 還是 `className="text-fg-muted"`?」的選擇焦慮,不如只留一條路。

### A11y 策略:兩種模式

**模式 A(父層管理 `aria-busy`)**:
```tsx
<button aria-busy={loading}>
  {loading ? <Spinner size={16} aria-hidden /> : <Icon size={16} />}
  Save
</button>
```
螢幕閱讀器從 `aria-busy={true}` 知道按鈕正在處理中,Spinner 本身 `aria-hidden` 不干擾。Button 就是這個模式。

**模式 B(Spinner 自報 loading)**:
```tsx
<div className="flex items-center justify-center p-8">
  <Spinner size={48} aria-label="載入專案中" />
</div>
```
獨立 loading 區塊,沒有父層 `aria-busy`,Spinner 自己 `role="status"` + `aria-label` 讓螢幕閱讀器能感知。

---

## 視覺

- **Icon**:Lucide `Loader2`(跟 Button 既有的 loading 視覺一致,不換)
- **Animation**:`animate-spin`(Tailwind 內建 `1s linear infinite`)
- **Stroke**:Lucide 預設 2px,不另外調

---

## Row primitive consumer 的將來

未來任何 row primitive(Sidebar / TreeView / SelectMenu / DropdownMenu / Steps)若需要 loading state,請在 `patterns/element-anatomy/item-anatomy.tsx` 開 `<ItemSpinner>` helper——自動從 `RowSizeContext` 讀 `ICON_SIZE[size]` 傳給 `<Spinner />`,消費者寫 `<ItemSpinner />` 就好。跟 `<ItemIcon>` / `<ItemAvatar>` 同一個 pattern。

**但現在 YAGNI**——沒真實消費者就不做 ItemSpinner helper,等第一個 row primitive 需要 loading state 時再加。

---

## Do / Don't

✅ **Do**
- 從本元件 import Spinner,不要自己 inline `<Loader2 className="animate-spin" />`
- 用 `currentColor` 讓 Spinner 繼承父層 text color
- `aria-busy` 在父層 + Spinner `aria-hidden`(Button 模式)
- 或 Spinner 自帶 `aria-label`(獨立 loading 模式)

❌ **Don't**
- 不要 inline copy `<Loader2 className="animate-spin" />`,所有 loading 視覺都走 Spinner
- 不要加 `color` / `variant` / `speed` / `thickness` prop——YAGNI,單一職責
- 不要在 Spinner 外層自己包 `absolute inset-0 flex items-center justify-center` 做 overlay——那是 `LoadingOverlay` 的責任(未來元件)
- 不要用 Spinner 表達「永遠在轉」的裝飾效果——Spinner 的語意是「正在載入、正在處理」,裝飾無限轉會誤導 a11y

---

## 為何無 Inspector / ColorMatrix / SizeMatrix / StateBehavior

Spinner 是**最薄的 primitive**(單一職責:顯示「東西在轉」),設計上刻意避免多維度變體:

- **無 Inspector**:Spinner 無 variant / state / 可切換的 prop(size 是自由 number,不是 enum),互動切換式 Inspector 無法呈現它的決策點——該討論的是「何時用」而不是「參數怎麼調」,這已由 `UsageInButton` / `UsageInline` 兩個 consumer context story 覆蓋。
- **無 ColorMatrix**:Spinner 色彩刻意走 `currentColor` 繼承父層 text color(Button primary → 白 / text variant → 深色 / Field → fg-muted),**無自己的色彩決策**。加 `color` variant 會製造「傳 `color="muted"` 還是 `className="text-fg-muted"`?」的選擇焦慮(本 spec 「顏色策略」段明述)。
- **無 SizeMatrix**:Spinner 無 sm/md/lg enum,尺寸是自由 `number` px,跨度極大(16px button / 24px inline / 48px overlay),由 consumer 依 context 傳入。建立 SizeMatrix 等於強制成 enum,違背刻意保留自由度的設計(見本 spec「尺寸策略」段)。
- **無 StateBehavior**:Spinner 本身無 hover / focus / active / selected / disabled——「轉」是唯一狀態,「不轉」= 不渲染 Spinner。載入結束後父層 swap 成其他 icon(Button loading → icon)。

對應 anatomy story:保留 `Overview` + consumer context `UsageInButton` / `UsageInline`(真實 Spinner 使用場景)。

---

## 相關

- **Avatar 自由 size 策略** — `components/Avatar/avatar.tsx`(同一個 pattern 的先例)
- **Row primitive 的 RowSizeContext** — `patterns/element-anatomy/item-anatomy.tsx`(未來 `ItemSpinner` helper 的基礎)
- **Button loading prop** — `components/Button/button.tsx`(當前唯一消費者)
