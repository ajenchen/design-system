---
component: CircularProgress
family: null
variants: {}
sizes: {}
traits:
  - isMatrixHeavy
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# CircularProgress 設計原則

**圓形進度指示(determinate + indeterminate 雙模式)**——整個設計系統 circular 形式進度的 SSOT。

**Layout Family**:非 family — self-contained primitive(獨立視覺,無 slot 結構)。

**實作基礎**:自繪 SVG(雙 circle:track + arc)+ Tailwind `animate-spin`(indeterminate 模式)。無 external primitive base。

> 最薄的 circular progress primitive。`value` 有無切換兩態:無 value = indeterminate 旋轉 / 有 value = determinate arc + track。

---

## 定位 + 姊妹元件分界(SSOT)

| 元件 | 型態 | 可量化? | 典型使用 |
|------|------|---------|----------|
| **`ProgressBar`** | linear **determinate** | ✅ 0–100 | 頁面級 / 表單步驟 / 上傳 bar / card 內大區塊進度 |
| **`CircularProgress`**(本元件) | circular **兩態** | ✅ 有 value / ❌ 無 value | inline 小空間 / Button loading / Field loading / 單一 icon 位置 / cell 內進度 |

**判斷法**:
- 水平大區塊 / 頁面級 → **ProgressBar**
- 小空間 / inline icon 位置 → **CircularProgress**(有 value 用 determinate / 無則 indeterminate)

### 世界級流派選擇(為何 circular 兩態合一)

查 6 家世界級 circular progress 命名策略:
- **合一派**(一元件 determinate + indeterminate):Material `CircularProgress` / Chakra `CircularProgress`
- **分離派**(2 元件):Ant(`Spin` + `Progress type=circle`) / Mantine(`Loader` + `RingProgress`)
- **只有 indeterminate**:Polaris / Atlassian / Carbon
- **混合**:Apple HIG(ActivityIndicator indeterminate / ProgressView determinate circular+linear 合)

**本 DS 採合一派**(Material / Chakra),理由:
1. **語義一致**:「CircularProgress」天然涵蓋兩態,不像「Spinner with value」語義拉扯
2. **元件數少**:不拆 Spinner + CircularProgress 兩元件,consumer 只要記一個
3. **視覺結構共用**:同一 SVG skeleton(`size` + strokeWidth + 雙 circle),`value` 有無只切換 dashoffset 計算 + animate-spin class,無 code 重複

(2026-04-20 從「Spinner + CircularProgress 分離」改為本架構;`Spinner` 元件已廢除並遷至本元件。consumer 改 import `CircularProgress`。)

---

## 何時用

- **Button / Inline Action 的 loading 狀態**:Button `loading` prop 內部渲染(無 value = indeterminate)
- **Field loading 狀態**(Input / NumberInput / Combobox / Select):consumer 傳 `loading={true}` → 元件內部 readonly + endAction slot 自動塞 `<CircularProgress>`(見 `field-controls.spec.md`「Loading state」)
- **Cell / row 局部進度**(cell 上傳中、cell async fetch 中):size 16-20 inline
- **inline 可量化小進度**(如 file uploader list row 的上傳 % / 倒數計時):有 value
- **全頁 / empty surface 載入**:`<Empty icon={<CircularProgress size={48}/>}/>` compose(Empty canonical 垂直堆疊,無需另造)

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 頁面級 / 表單級大區塊進度 | `ProgressBar`(linear) | CircularProgress 在大尺寸視覺比例不如 linear bar |
| 骨架載入(list / card 初次 render) | `Skeleton` | Skeleton 保留內容形狀 |
| 全頁 loading 版面 | `<Empty icon={<CircularProgress/>}/>` | 版面繼承 Empty 垂直堆疊 canonical |
| 通知計數 / 狀態紅點 | `Badge`(dot 模式) | 語義完全不同 |

---

## API

```tsx
export interface CircularProgressProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** 0-100;undefined → indeterminate(旋轉 partial arc) */
  value?: number
  /** 直徑 px,預設 24,≤ 64 建議 */
  size?: number
  /** 狀態色(與 ProgressBar 一致) */
  status?: 'inProgress' | 'success' | 'error'
  /** 視覺 label(inline,font-size inherit,color text-fg-muted) */
  label?: string
  /** Determinate 模式的 affix(indeterminate 忽略) */
  affix?: 'value' | 'status-icon' | React.ReactNode
  /** A11y label(指定後 shouldAnnounce=true) */
  'aria-label'?: string
}
```

### 尺寸策略:自由 `number`,跟 Avatar 同一套

不用 `sm | md | lg` enum(跨度 16 → 64 太大)。

#### Size inheritance table(consumer 傳入的 canonical 值)

| Context | 建議 `size` | 來源 |
|---------|-------------|------|
| 獨立使用 | **24**(預設) | 不傳 |
| Button startIcon loading | `iconSize`(16 / 20) | Button 內部程式化 `<CircularProgress size={iconSize}/>` |
| Field endAction loading | `ICON_SIZE[size]`(16 / 16 / 20) | Input / Field 內部程式化(`loading` prop) |
| 取代 Avatar | 與 Avatar size 相同 | Consumer 傳 |
| Empty overlay 全頁 loading | **48** | Empty 範例與 story convention |
| 大型 card 中央 | 32–48 | Consumer 判 |

**程式化原則**:consumer wrapper(Button / Input `loading`)內部決定 size,consumer 不再傳;獨立場景(Empty / 自組 card)consumer 傳。

### 最大尺寸建議(不設硬上限)

不設 prop 上限(跟 Avatar 策略一致)。視覺建議 ≤ 64px。超過通常代表場景該改用 Empty 組合或動畫插圖。

### Determinate 達 100% 的 canonical:**swap 為完成 state,不留 value=100**

達 100% 時 consumer **必須 swap** 為完成狀態呈現,不保留 `<CircularProgress value={100}/>`:

| 完成後呈現 | 場景 |
|-----------|------|
| ✓ 打勾 icon(`<CircleCheck/>` / `<Check/>`) | cell inline / 上傳列表 row |
| 直接呈現該呈現的內容 | 資料載入完成 → 渲染實際 list / table / card |
| 切到 `<Empty>` 或其他 state component | 全頁 overlay → 內容出現;或 empty state |
| CircularProgress 直接消失 | 非同步操作完成,UI 回到預設態 |

**世界級慣例**:Gmail / Dropbox / Google Drive 上傳完成即消失;iOS Activity Indicator 完成隱藏;Figma / Notion async fetch 完成切到實際內容。

**為什麼不留 100%**:`CircularProgress` 語義是「進行中」,停在 100% 跟「完成」的語義衝突,使用者看到「滿的 circle」會困惑「還在跑嗎?」。

### 不設 `status` prop — 完成 / 失敗由 consumer 端 swap

世界級 DS(Material / Chakra / Ant / Polaris)**沒有**「success / error CircularProgress」variant——完成與失敗的語義應由 consumer 在業務邏輯上**替換 CircularProgress 為實際內容**(Check icon + label / 結果 / 錯誤訊息等),不讓 progress 指示器本身做狀態 morph(綠底空心 circle + check icon 並排是 anti-pattern)。

```tsx
// ✅ canonical — consumer 端 swap
{uploading
  ? <CircularProgress />
  : done
  ? <><Check /> 已完成</>
  : error
  ? <><AlertCircle /> 失敗,重試</>
  : null}

// ❌ anti-pattern — 不存在的 API
<CircularProgress status="success" />      // 本 DS 無此 prop
<CircularProgress affix="status-icon" />   // 本 DS 無此選項
```

### Size canonical(一條規則)

**若 CircularProgress 放在 field-height 相關容器內,`size` 對齊該容器的 icon 尺寸;否則預設 `24`。**

| 情境 | 建議 size | 為什麼 |
|------|----------|--------|
| field-height 相關容器(Button loading / Input loading / DataTable cell / Field control loading 等) | 對齊容器的 iconSize(本 DS 全部是 `sm/md = 16 / lg = 20`) | 與容器內其他 icon 視覺同刻度,避免 row 內 icon 跳高低 |
| 獨立使用 / 全頁 / Empty overlay / Coachmark media 等無 field-height 約束 | 預設 24(傳統 Material 標準)— 需要更大(例如 Empty 大圖)可 32 / 48 | 無參考尺寸時走 DS 預設,不憑感覺挑 |

**實作保證**:
- Button / Input / Field 等 **元件內部自動傳對的 size**(consumer 不用傳)— 來源:這些元件本來就知道自己的 `iconSize`(`field-controls.spec.md` 中 `sm/md=16, lg=20`)
- DataTable cell 由 consumer 手寫 render,**consumer 傳 `16`(sm/md table) / `20`(lg table)** — 規則在 `data-table.spec.md` 十一之一
- 獨立使用 CircularProgress 的元件 **預設走 24** — 已是 `<CircularProgress />` default

世界級對照:Material / Ant / Carbon 的 inline loading 全部 16dp;Material 獨立使用標準 = 40dp(desktop)/ 24dp(compact)。本 DS 收斂成「inline 跟 context 走 16 或 20,獨立走 24」兩檔,不暴露更多 size 階。

### 顏色策略:固定 `text-primary` + consumer 覆寫

固定 `text-primary`(品牌語義色「正在處理」)。不隨狀態變色。

| Consumer | className | 實際色彩 |
|----------|-----------|---------|
| 獨立 / 全頁 / Empty overlay / Input loading | 無(走預設) | `text-primary` |
| Button `loading` 各 variant | `className="text-current"` | 繼承 button `text-on-emphasis` / `text-foreground` |

Track 色鎖 `var(--secondary)`(= neutral-3,與 ProgressBar track 一致)。

### Label 策略:font-size 繼承 + 色鎖 neutral-7

- `label` 有值 → render `<span className="text-fg-muted">`,font-size **繼承 parent**(不設 text-size class,CSS inherit 天然處理)
- 塞在元件內(Button / Field)時不用 label(元件本身已有文字);全頁 / Empty overlay 場景可開

### A11y 策略

| 模式 | role | aria 屬性 |
|------|------|----------|
| Determinate(`value` 有值) | `progressbar` | `aria-valuenow / aria-valuemin=0 / aria-valuemax=100` + optional `aria-label` |
| Indeterminate + 有 aria-label / label | `status` | `aria-label={label ?? aria-label}` |
| Indeterminate + 無 label | `aria-hidden=true` | 由父層 `aria-busy` 管理(Button 模式) |

---

## 視覺與幾何鐵律

- **正方形不可妥協**:`style={{ width: size, height: size }}` 強制。本體絕不加 margin / padding
- **SVG 雙 circle**:track(`var(--secondary)`) + arc(`currentColor`),stroke-linecap round,rotate -90deg 從 12 點起始
- **strokeWidth 動態 scale**:`Math.max(2, Math.round(size / 10))` 維持跨尺寸視覺比例
  - size 24 → stroke 2
  - size 32 → stroke 3
  - size 48 → stroke 5
  - size 64 → stroke 6
- **Indeterminate arc**:固定 25%(`INDETERMINATE_ARC_RATIO=0.25`),外層 `animate-spin` 旋轉整個 span(Material 流派)
- **旋轉規則單純**:indeterminate → 轉;determinate → 不轉;沒有 status 條件分支,因為沒有 status。完成時 consumer 把整個 CircularProgress swap 成其他內容(Check icon / 結果 / Empty),不靠元件本身做 spin-stop 動畫
- **`align-middle` 鎖死**(SVG 對齊 adjacent text x-height 中線):外層 span 本體帶 `align-middle`,避免在 inline-flex 容器內出現基線錯位。consumer 若在文字旁放 CircularProgress,**不需**自己加 `align-middle` 或 `leading-none`
- **Determinate transition**:`transition-[stroke-dashoffset] duration-300`(value 變化時 smooth animation)

---

## Do / Don't

✅ **Do**
- 無進度資訊 → 不傳 value(indeterminate,替代舊 Spinner 用法)
- 有進度資訊 → 傳 `value={N}`(determinate + track)
- 跟 Button / Field loading 配合 → 走 `loading` prop,不自己 import
- 全頁 loading → `<Empty icon={<CircularProgress size={48}/>}/>`,不手刻 overlay

❌ **Don't**
- 不要 inline `<Loader2 className="animate-spin" />` — 用 CircularProgress
- 不要加 `color` / `variant` / `speed` / `thickness` prop — 單一職責
- 不要在本元件外包 `absolute inset-0 flex items-center justify-center` — 用 Empty compose
- 不要用 CircularProgress 表達裝飾效果 — 語意鎖「進度」,不轉其他

---

## 為何僅保留 Overview + 兩 consumer context stories

CircularProgress 是**最薄的 circular progress primitive**,刻意避免多維度變體:

- **無 Inspector**:variant 只有 value 有無 + status 三狀態(lifecycle),互動切換式 Inspector 可展的決策點少。`UsageInButton` / `UsageInline` 已覆蓋真實 consumer context
- **ColorMatrix N/A(只繼承 Progress color token)**:本元件 color 完全來自 `text-current`(繼承 host)+ Progress token(track / fill),無 own variant × state 色彩組合可 matrix 對照。status(running/success/error)已在 `UsageInButton` / `UsageInline` 真實 context 演示,獨立 ColorMatrix story 會是冗餘
- **SizeMatrix 透過 Inspector 即可展示 — 無 separate SizeMatrix story**:size 是自由 number(非 sm/md/lg tier),Inspector 的 size slider 即可展示 16 / 24 / 32 / 48 等常用值的行為差異,比靜態 matrix 更貼近消費情境
- **無 StateBehavior**:無 hover / focus / active,唯一「狀態」是 value 變化(已在 Determinate story 動態演示)

對應 anatomy story:`Overview` + `UsageInButton` + `UsageInline`。缺 canonical 5 多數項的 rationale 即本段。

---

## 相關

- **ProgressBar** — `components/ProgressBar/progress-bar.spec.md`(linear determinate 姊妹元件)
- **Avatar 自由 size 策略** — `components/Avatar/avatar.tsx`(同 pattern 先例)
- **Empty compose 全頁 loading** — `components/Empty/empty.spec.md`(icon slot 接 ReactElement)
- **Field loading state** — `components/Field/field-controls.spec.md`「Loading state」
- **Button loading prop** — `components/Button/button.tsx`(消費,使用 `text-current` 繼承)

## 遷移記錄(2026-04-20)

`Spinner` 元件已廢除並遷至本元件。Breaking change:
- `import { Spinner } from '.../Spinner/spinner'` → `import { CircularProgress } from '.../CircularProgress/circular-progress'`
- `<Spinner size={N}/>` → `<CircularProgress size={N}/>`(indeterminate 行為相同)
- `<Spinner size={N} aria-label="..."/>` → `<CircularProgress size={N} aria-label="..."/>`
- 新增能力:`<CircularProgress value={N}/>` 支援 determinate

遷移理由:世界級命名對齊 Material / Chakra,支援 determinate 需求(user 2026-04-20 提出),元件數減少(廢除重複的 Spinner 名稱)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `badge.spec.md`
- `skeleton.spec.md`
