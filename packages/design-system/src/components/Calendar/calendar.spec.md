---
component: Calendar
family: composite
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
benchmark:
  - Ant Design Calendar: github.com/ant-design/ant-design/tree/master/components/calendar
  - MUI X Date Pickers: github.com/mui/mui-x/tree/master/packages/x-date-pickers
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — Notion/Google/Fantastical/macOS Calendar references retained as visual product references with per-claim @benchmark-unverified inline (closed-source, no canonical DS doc URL exists). Frontmatter benchmark URLs cover OSS Ant + MUI. -->

# Calendar 設計原則

## 定位

Calendar 是**事件檢視 canvas**,讓 user 以**月 / 週 / 日** 三種 view 瀏覽、定位、快速增減事件(**MVP 僅實作月 view**,週 / 日 列後續增量,見「MVP vs 後續增量」)。對齊 Notion Calendar / Google Calendar / Fantastical / macOS Calendar 的事件檢視模型 <!-- @benchmark-unverified: closed-source product visual references, no public DS spec URL; visual sampling -->。

**Layout Family**:**非 4-Family,屬 page-composite**(見 `patterns/element-anatomy/element-anatomy.spec.md`「Page-composite」段)。多區塊 layout(Toolbar / Grid / EventTile / SidePanel),各自 own 自己的 anatomy。

**實作基礎**:
- 自建 composite(非 DayPicker)—— DayPicker 是「date picker 選日期」primitive,event calendar 是「頁面上看事件」的頁面 layout,兩者語意完全不同
- 消費 DS primitives:`<Button>`(prev / next / 今天 / 新事件 CTA) / `<SegmentedControl>`(切換 view);月 grid cell 與 event tile 為元件自身用 CSS grid + token 組合,不另外消費 primitive。日期運算用 `date-fns`
- 日期運算用 `date-fns`(已有 dependency,輕量)——不自造 date math

**與 DatePicker 的區分(重要)**:

| 元件 | 定位 | 互動模型 | 適用 Layout |
|------|------|---------|------------|
| `<DatePicker>` | **選日期**的 form control | 點 trigger → 浮層 Calendar → 選一個 → 回填 input | Field control(form 的一部分) |
| `<DateGrid>`(DayPicker 包裝,2026-04-21 自 Calendar 改名) | DatePicker 的內部 calendar grid primitive | N/A(不直接消費) | Internal to DatePicker |
| **`<Calendar>`**(本元件) | **看事件**的 page-level canvas | 在月/週/日 view 中瀏覽 event、點 event 看詳情、拖拉新增 | Page layout(整個檢視頁面) |

「User 需要選日期」 → DatePicker。「User 需要看本月會議 / 行程 / 截止日」 → **Calendar**。

**世界級對照**:
- **Notion Calendar**:月 / 週 / 日 view + 左側 filter + 時間軸精確拖拉
- **Google Calendar**:月 / 週 / 日 + 多曆疊加 + 週末 highlight
- **Fantastical**:月 + event tile 顏色強調
- **macOS Calendar**:簡潔 month grid + 左側 mini month

本元件 MVP 鎖定 **月 view**(最常用 ~80% 場景),週 / 日 view 列後續增量。

---

## 何時用

| 情境 | 範例 |
|------|------|
| 團隊會議 / 行程總覽 | Notion Calendar 替代品:這個月有哪些會議、專案截止日 |
| 個人 todo 時間軸 | 本週 / 本月待辦事件分布 |
| 內容發佈排程 | 社群 / Blog 的發文行事曆、影片排程 |
| 訂房 / 訂位可視化 | 以 calendar 視角看已訂和空房的 capacity |
| 專案 milestone | sprint deadline / release date 視覺化 |

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 「選一個日期」表單欄位 | `<DatePicker>` | Calendar 是檢視 canvas,不是 form control |
| 「選一個日期範圍」表單欄位 | `<DatePicker.Range>` | 同上 |
| 時間 granularity 是時分秒的儀表板 | Timeline / Gantt chart | event calendar 的最小 granularity 是**時段**(15-60 分鐘),不是秒級 |
| 單純事件**列表**(沒時間軸視覺需求) | `<DataTable>` / `<Empty>` | 列表是「linear」瀏覽,calendar 是「spatial」瀏覽 |
| 跨日 span 排程視覺(bar 橫跨多欄) | Gantt / Timeline | 月 view 多日事件為每涵蓋日各一條 tile,非橫跨欄 span bar(見「Event tile 規則」) |

## 常見誤解

| 誤解 | 正解 |
|------|------|
| 「Calendar 是 DatePicker 的內部 grid」 | 那是 `DateGrid`(DayPicker 包裝);本元件是 page-level 事件 canvas(見「定位」分界表) |
| 「多日事件渲染成橫跨多欄的長 bar」 | 月 view 為 per-cell 模型,每涵蓋日各一條 tile(見「Event tile 規則」) |
| 「整月無事件要放 `<Empty>`」 | 空白即常態;需要提示由 consumer 外層自疊(見「狀態 > Empty」) |
| 「傳 `view="week"` 就有週 view」 | MVP 只實作月 view,週 / 日為後續增量(見「狀態 > 邊界案例」) |

---

## API(MVP)

```tsx
<Calendar
  view="month" | "week" | "day"           // MVP 只支援 "month"
  defaultView="month"
  referenceDate={Date}                      // 當前聚焦日期(月檢視的那個月)
  onViewChange={(view) => ...}
  onReferenceDateChange={(date) => ...}
  events={Event[]}                          // 事件資料
  onEventClick={(event) => ...}             // 點 event tile 回調
  onDateClick={(date) => ...}               // 點月 cell 回調(用於新增)
  onCreateEvent={() => ...}                 // 點「新事件」CTA 回調
  weekStartsOn={0 | 1}                      // 0=Sun, 1=Mon
  renderEventTile={(event) => ReactNode}    // 自訂 event tile 視覺
  size="md" | "lg"                          // cell 大小(MVP 只 md;lg 為 tech debt)
  className
/>
```

### Event type

```tsx
interface CalendarEvent {
  id: string
  title: string
  start: string | Date       // ISO "YYYY-MM-DDTHH:mm" 或 "YYYY-MM-DD"(all-day)
  end: string | Date
  allDay?: boolean            // true = 全天事件,渲染為頂端全天長條(淡底 + 左 accent 條);多日事件在每個涵蓋日各顯示一條
  color?: CategoricalHue     // 12 categorical 色相(消費 categorical-color SSOT,與 Tag / Avatar 共用);色名 1:1 對 --color-{hue}-*
  metadata?: Record<string, unknown>   // 自由資料,renderEventTile 讀
}
```

---

## Anatomy(月 view,MVP)

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar:[◀] 2026 年 4 月 [▶]        [< 日 週 月 >]  [+ 新事件] │
├─────┬─────┬─────┬─────┬─────┬─────┬─────┬────────────────────┤
│ 週日 │ 週一 │ 週二 │ 週三 │ 週四 │ 週五 │ 週六 │   ← 星期 header   │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┼────────────────────┤
│ 29* │ 30* │ 31* │  1  │  2  │  3  │  4  │   ← 月 grid row
│     │     │     │event│event│     │event│
│     │     │     │█mtg │▌vac │     │█dl  │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│  5  │  6  │  7  │  8  │  9  │ 10  │ 11  │
│event│     │     │     │event│     │     │
│█ret │     │     │     │█rev │     │     │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴────────────────────┘
```

圖例:`*` = 上 / 下月 outside days(弱化字色);`█` = 一般 event tile;`▌` = 全天事件(左 accent 條)。

### Cell 規則

- **Cell 尺寸**:MVP 月 view cell 高度固定,容納日期 header + 3 個 event tile;寬度 7 欄等分
- **日期 header**:右上角數字(對齊 Google Calendar 視覺慣例)
- **Today cell**:日期數字以 info-filled pill 強調(對齊 Google Calendar today pill)
- **Outside day cell**:上/下月溢出日期弱化字色 + 背景略暗區分
- **Hover cell**:整 cell 帶 neutral-hover 提示可點擊新增入口
- **Weekend cell**:弱化背景(對齊 Google);MVP 未實作,列後續增量

### Event tile 規則

- **一般 event(timed)**:事件色相 subtle 底 + 對應文字色(消費 categorical-color SSOT,與 Tag / Avatar 共用 12 色相),單行 truncate
- **All-day event**(2026-06-01 補實作):淡底 tile + 左側實心 accent 條 + 字重略強,排在 cell 事件區頂端(`allDay` 事件排序在有時間事件之前);多日全天事件靠日期範圍 filter 在每個涵蓋日各顯示一條(非單一橫跨多欄的 grid-column span bar——month view per-cell 模型不做跨欄絕對定位)
- **Hover tile**:hover 微暗化表示可點擊
- **超出 tile 限制**:每格最多顯示 3 筆事件,超出顯示「+N more」弱化計數文字(對齊 Google Calendar),目前不可點擊(點擊展開 popover 列表為後續增量)

完整 cell + event tile 的 class / token 對照見 anatomy `ColorMatrix` story。

### Toolbar

```
[◀] [今天] [▶]    月份標題(2026 年 4 月)    [日 | 週 | 月]    [+ 新事件]
```

- 左 Nav:`<Button iconOnly>` prev/next + `<Button>今天</Button>` 跳 today
- 中央 title:`<h2 className="text-h3">` or `text-body-lg font-medium`
- 右視圖切換:`<SegmentedControl>`(day/week/month)—— MVP 只啟用 month,其他 disabled
- 右上 CTA:`<Button variant="primary" startIcon={Plus}>新事件</Button>`

對齊 `patterns/action-bar/action-bar.spec.md`(左 context / 中 focus / 右 CTA 的經典分組)。

---

## 狀態

### Empty
無事件時 cell 空白(不顯示 empty state)——calendar 本身是 canvas,空白 = 沒事件,語意自明。

**不用 `<Empty>` 元件**——Empty 是「引導使用者做什麼」,月曆空白是常態不是引導目標。若整個月**零事件**需要 subtle 提示(`<Empty icon={CalendarPlus} title="本月無事件" />`),由 consumer 自行疊在 Calendar 外層(MVP 無內建 `renderEmpty` hook,列後續增量)。

### Loading
MVP 無內建 loading 狀態(無 `loading` prop / 無 Skeleton 分支)——events 由 consumer 取得,載入中時 consumer 自行決定是否在 Calendar 外層顯示 placeholder。後續增量擬以 `<Skeleton>` placeholder tile 對齊其他非同步元件(見「MVP vs 後續增量」)。

### Error
MVP 無內建 error 狀態(無 `error` / `onRetry` prop)——載入失敗由 consumer 在外層處理。後續增量擬在 toolbar 內顯示 inline error hint + retry button 且不 block 整個 calendar 顯示。

### 邊界案例(MVP 實作現況)

- **單格事件 > 3**:只渲染前 3 筆,其餘**不進 DOM**(鍵盤 / SR 不可達),以「+N more」弱化計數提示(不可點擊,展開 popover 為後續增量)
- **極長事件標題**:tile 單行 truncate,不換行不撐高 cell
- **跨月多日事件**:依日期範圍 filter,在每個涵蓋日各顯示一條(含 outside days 與翻月後的新月份)
- **載入失敗 / 舊資料**:無內建 error 狀態(見上)——Calendar 照常渲染 consumer 當下傳入的 `events`,互動不自動禁用;是否 block 由 consumer 決定
- **`view` 傳 `week` / `day`**:MVP 仍渲染月 grid;SegmentedControl 的週/日項 disabled(使用者無法切入),但受控 `value` 仍反映外部傳入值(`data-view` 同步)
- **週末 / RTL**:MVP 無週末弱化(列後續增量)、無 RTL 專屬處理——週末 cell 行為與平日完全一致(event tile 照常顯示)

### a11y
- Toolbar navigation 用 `<nav aria-label>`(預設 `行事曆月份導覽`,consumer 可由 `navAriaLabel` prop override)
- Month grid 用 `role="grid"`,每 cell `role="gridcell"`(非互動容器 — button 語義禁互動後代,cell 內含事件 tile 不可自身為 button);日期數字為 `<button>`,ISO 格式 `aria-label="2026-04-03,3 個事件"`
- Event tile `role="button"` + `aria-label`(事件標題,格式 `事件:{title}`)
- Keyboard:見文末「A11y 預設」(keyboard map SSOT,本節不重複)

---

## 禁止事項

- ❌ 不用 `<DayPicker>` 為底層——DayPicker 是 form control 用,結構不適合 page-level event canvas
- ❌ 不硬寫 month grid 為 `<table>`——用 CSS grid(月 view 為 per-cell 模型不跨欄 span,見「Event tile 規則」;後續週 / 日 view 的 timeline / 拖拉增量需 grid 自由佈局,table 結構難擴充)
- ❌ 不把 event 資料存在元件內部 state——event 是 consumer 責任,本元件是純 view
- ❌ 不自動打開「新事件」表單——`onDateClick` / `onCreateEvent` 回調給 consumer 決定(避免強制開 Dialog UX)
- ❌ 不重造 date math——用 `date-fns`

---

## MVP vs 後續增量

### MVP(本次 session)
- 月 view(完整)
- Toolbar prev/next/today + title
- Event tile render(單 line + color variant + truncate)
- Today cell highlight
- Outside days visual
- Empty 為常態空白(無內建 empty/loading/error UI)

### 後續(tech debt)
- 週 view(timeline 24 小時縱軸)
- 日 view(single-day timeline)
- 拖拉新增 event(from 月 cell → range select)
- 拖拉移動 event(cross-day drag)
- 「+N more」展開 popover
- 左側 mini month + filter sidebar
- 多曆疊加(multi-calendar sources)
- 內建 loading(Skeleton)/ error(inline hint + retry)/ renderEmpty hook
- 拖拉選 range(`onRangeSelect`)
- Print view / iCal export

---

## Anatomy N/A rationale(偏離 canonical 5 的說明)

- **無 `SizeMatrix`**:MVP 只支援 `view="month"` + 固定 `size="md"`,無多 size tier 可 matrix 對照。後續擴充 week / day view 時再補 SizeMatrix
- **`StateBehavior` 已存在**(today / outside month / 多事件 / event hover / empty cell):Calendar 本身無 `hover / focus / disabled` 互動 prop,但 cell / event tile 的視覺狀態由 anatomy `StateBehavior` story 列舉(對齊 calendar.anatomy.stories.tsx 檔頭 @anatomy-rationale)

---

## 相關

- `../DatePicker/date-picker.spec.md` — 選日期的 form control,本元件姊妹概念(不同職責)
- `../DateGrid/date-grid.spec.md` — DatePicker 內部 calendar grid primitive(DayPicker v9 包裝;2026-04-21 從 Calendar 改名);**不直接面向 consumer**
- `../../patterns/action-bar/action-bar.spec.md` — Toolbar 左中右分組規則
- `../../patterns/element-anatomy/element-anatomy.spec.md` — Page-composite 分類

## A11y 預設

**ARIA / Pattern**:對齊 [W3C ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/) 對應 pattern。

**Keyboard 行為(MVP 實作現況)**:

- Tab — 逐一 focus 每格的日期數字按鈕與其中的事件 tile(cell 為非互動 `role="gridcell"` 容器;滑鼠點 cell 空白處等同點日期,keyboard 走日期數字按鈕,功能等價。對齊 Google Calendar)
- Enter / Space — 啟用目前 focus 的元素:日期數字按鈕觸發 `onDateClick`(native button activation),事件 tile 觸發 `onEventClick`
- Toolbar 的 prev / 今天 / next / 檢視切換為標準可聚焦控件,Tab 可達
- `renderEventTile` 自訂 tile:外層 wrapper 只掛 `onClick`(無 role / tabIndex / onKeyDown)——keyboard 可達性由 consumer 的自訂 tile 自行渲染 focusable element 提供(default tile 才內建 `role="button"` + tabIndex + Enter/Space);否則該 tile 僅滑鼠可點

**Keyboard 後續增量(尚未實作,見「MVP vs 後續增量」)**:

- ↑/↓/←/→ 在日期格間 roving 移動、PageUp/Down 切月、Shift+PageUp/Down 切年、Esc 關閉 — 隨週 / 日 view 增量一併補上 roving tabindex
- 此為**已知 a11y gap(非發佈 blocker)**:方向鍵 roving 是 APG grid pattern 建議;MVP 所有互動元素皆 Tab 可達(鍵盤可操作性已滿足),驗證基準見下方「驗證」

**Focus**:focus-visible ring 對齊 DS canonical(`outline: 2px solid var(--ring)`);日期數字按鈕與事件 tile 皆有 ring。

**驗證**:Storybook a11y addon panel 應 0 critical violation。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。
