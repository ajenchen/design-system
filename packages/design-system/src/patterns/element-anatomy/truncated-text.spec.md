---
component: TruncatedText
family: non-family
isInternal: true
benchmark:
  - Ant Design Typography.Text ellipsis={{ tooltip }}: https://ant.design/components/typography
  - MUI 社群共識 useIsOverflow hook + 條件 Tooltip: https://github.com/mui/material-ui/issues/37211
  - Carbon Overflow content(truncate 樣式 + hover tooltip 同 pattern): https://carbondesignsystem.com/patterns/overflow-content/
---

# TruncatedText / useTruncated 設計原則(SSOT)

**Layout Family**:non-family(hosted inline element,無 own layout —— 嵌在宿主 row/cell/pill 內)。

**定位**:「單行文字**可能**溢出容器 → 溢出時 `text-ellipsis` 截斷 + **僅截斷時**顯示 tooltip 補全」的共用引擎與呈現層。收斂 Breadcrumb label / DataTable 純文字 cell / Tag 三處**先前逐字重複**的截斷偵測 + tooltip 邏輯為單一 SSOT(2026-07-19,user 拍板)。

## 兩層架構(對齊世界級聯集)

| 層 | 物件 | 職責 | 對標 |
|----|------|------|------|
| 底層量測引擎 | **`useTruncated(options?)` hook**(public,`hooks/use-truncated`)| 全 DS 共用單一 `ResizeObserver`(dispatch 到 per-element callback,`WeakMap`)+ `isTruncated` 狀態機 + 二次量測時序。回 `{ ref, isTruncated }` | MUI/MUI-X 社群「hook 量測 + 條件 Tooltip」 |
| 上層組合 | **`<TruncatedText>` component**(@internal,本檔)| 消費 hook + 封裝「永遠 wrap Tooltip、`open` 控制可見」的截斷 span 呈現 | Ant `Typography.Text ellipsis` 高階元件 |

**為何兩層**:Breadcrumb / DataTable 結構同構(截斷 span 即 tooltip trigger)→ 用 component;Tag 因 **trigger(整個 tag root)≠ 量測元素(內層 `[data-tag-text]` span)** + Canvas `measureText`(flex 內 `scrollWidth` 不可靠)+ 截斷才 `tabIndex=0`/focus-ring 的自訂 a11y → **只用 hook 自組**。缺任一層 = 假 SSOT(只抽 component 則 Tag 被迫留自己的 RO copy;只抽 hook 則兩個 component consumer 各自重寫 wrap JSX)。

## `open` 控制而非條件 wrap(canonical)

「**永遠** wrap Tooltip、`open={isTruncated ? undefined : false}`」而非「未截斷回裸 span、截斷才 wrap」:後者切換 JSX 樹 → span unmount/remount → ref 換到新 DOM、`useEffect([])` 不重跑 → 觀察的 DOM 與實際 DOM 對不上(Breadcrumb 2026-05-11 抓的 bug)。`open={false}` 時 `TooltipTrigger asChild` 只把 handler/`data-state` 合併到同一 span(無多餘 DOM、tooltip 靜默),與裸 span 視覺行為等價。對齊 `components/Tooltip/tooltip.principles.stories.tsx`「沒被截斷就不該顯示 tooltip」。

## 何時用 / 何時不用

- **用**:宿主 row/cell/pill 內「寬度受限的單行文字」,溢出時要保留可讀性(hover/focus 見全文)。
- **不用**:(a) 多行文字(本 primitive 是 `truncate` 單行 `white-space:nowrap`,不處理多行);(b) compound content(icon+field/select/person 等自帶 layout)—— `truncate` 的 inline baseline 會 collapse Field/inline-flex 對齊(DataTable 於 `renderCellContent` 對 compound 欄位**bypass** `<TruncatedText>`,只 primitive string/number 才走);(c) 內容永遠放得下(不需 tooltip 補救)。

## 消費者變異點(hook options)

| option | 預設 | 用途 |
|--------|------|------|
| `measure` | `scrollWidth > clientWidth`(觀察元素自身)| Tag 傳 Canvas `measureText`(observe root、量測內層 span);回 `undefined` = 保留前狀態 |
| `deps` | `[]`(mount-once)| Tag 傳 `[children]`(children 變重量)|
| `recheckAfterPaint` | `true`(rAF + `setTimeout(100)` 二次量,抓字型 async 假陰性)| Tag 傳 `false`(原無二次量)|
| `timing` | `'effect'` | Tag 傳 `'layoutEffect'`(避免 paint flash)|

`<TruncatedText>` props:`children` / `className`(align passthrough)/ `tooltip`(預設 = children;Breadcrumb 傳 `fullText`)/ `display`（`'inline'` 預設保 baseline;`'block'` Breadcrumb 用)。

## A11y 預設

- 截斷才顯示 tooltip(補全被裁文字);未截斷不顯示(避免噪音)。
- Tooltip 經 Radix `TooltipTrigger`/`TooltipContent`:hover + keyboard focus 皆可觸發(對齊 W3C APG Tooltip pattern)。
- Tag 變異:截斷時 root `tabIndex=0` + focus-visible ring(讓 Tab 到即見全文,APG 前提 trigger 可 focus);未截斷不入 tab 序。此 a11y 由 Tag 讀 `isTruncated` 自渲染,不進 hook(consumer 自控)。

## 禁止事項

- ❌ 把 Tag 的偵測改回 `scrollWidth`(flex 內不可靠 → 行為漂移)。
- ❌ 用條件 wrap(未截斷裸 span / 截斷才 wrap)—— 見上「`open` 控制」canonical。
- ❌ 對 compound content 套 `<TruncatedText>`(baseline collapse);走宿主 bypass。
- ❌ 多 consumer 各自 `new ResizeObserver` / 複製 shared RO 引擎 —— 一律消費 `useTruncated`(SSOT)。
