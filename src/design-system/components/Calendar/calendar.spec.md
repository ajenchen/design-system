---
component: Calendar
family: null
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
---

# Calendar 設計原則

## 定位

Calendar 是**事件檢視 canvas**,讓 user 以**月 / 週 / 日** 三種 view 瀏覽、定位、快速增減事件。對齊 Notion Calendar / Google Calendar / Fantastical / macOS Calendar 的事件檢視模型。

**Layout Family**:**非 4-Family,屬 page-composite**(見 `patterns/element-anatomy/element-anatomy.spec.md`「Page-composite」段)。多區塊 layout(Toolbar / Grid / EventTile / SidePanel),各自 own 自己的 anatomy。

**實作基礎**:
- 自建 composite(非 DayPicker)—— DayPicker 是「date picker 選日期」primitive,event calendar 是「頁面上看事件」的頁面 layout,兩者語意完全不同
- 消費 DS primitives:`<Button>` / `<Tabs>`(切換 view) / `<DropdownMenu>`(新增事件入口) / `<ScrollArea>`(垂直事件列表) / `<AspectRatio>`(月 view 的 cell 比例)
- 日期運算用 `date-fns`(已有 dependency,輕量)——不自造 date math

**與 DatePicker 的區分(重要)**:

| 元件 | 定位 | 互動模型 | 適用 Layout |
|------|------|---------|------------|
| `<DatePicker>` | **選日期**的 form control | 點 trigger → 浮層 Calendar → 選一個 → 回填 input | Field control(form 的一部分) |
| `<Calendar>`(DayPicker 包裝) | DatePicker 的內部 calendar grid primitive | N/A(不直接消費) | Internal to DatePicker |
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
  onRangeSelect={(from, to) => ...}         // 月 view 拖拉選一段 range(新增 multi-day)
  weekStartsOn={0 | 1}                      // 0=Sun, 1=Mon
  renderEventTile={(event) => ReactNode}    // 自訂 event tile 視覺
  renderEmpty={() => ReactNode}             // 無事件狀態
  size="md" | "lg"                          // cell 大小(MVP 兩尺寸)
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
  allDay?: boolean            // true = 跨整日,渲染為橫跨數欄的 tile
  color?: string              // 事件類別色(來自 DS palette,consumer 自選)
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
│     │     │     │█mtg │█vac │     │█dl  │      event tile(橫跨)
├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│  5  │  6  │  7  │  8  │  9  │ 10  │ 11  │
│event│     │     │     │event│     │     │
│█ret │     │     │     │█rev │     │     │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴────────────────────┘

*= prev/next month outside days(text-fg-disabled)
```

### Cell 規則

- **Cell 尺寸**:MVP 月 view cell 高度固定,容納日期 header + 3 個 event tile;寬度 7 欄等分
- **日期 header**:右上角數字(對齊 Google Calendar 視覺慣例)
- **Today cell**:日期數字以 primary-filled pill 強調(對齊 Google Calendar today pill)
- **Outside day cell**:上/下月溢出日期弱化字色 + 背景略暗區分
- **Hover cell**:整 cell 帶 neutral-hover 提示可點擊新增入口
- **Weekend cell**:可選弱化背景(對齊 Google;MVP 預設關閉)

### Event tile 規則

- **一般 event(timed)**:`{color}-subtle` 底色 + `{color}-text` 文字,圓角 + 緊湊 padding + truncate(單行)
- **All-day event**:同一般 tile 但橫跨多 cell(grid-column span)
- **Hover tile**:用 `{color}-hover` 微暗化表示可點擊
- **超出 tile 限制**:顯示「+N more」(對齊 Google Calendar),點擊展開 popover 列表

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

**不用 `<Empty>` 元件**——Empty 是「引導使用者做什麼」,月曆空白是常態不是引導目標。若整個月**零事件**可選擇顯示 subtle 提示(`<Empty icon={CalendarPlus} title="本月無事件" />`),由 consumer 在 `renderEmpty` 提供。

### Loading
載入 events 時,cells 用 `<Skeleton>` placeholder tile(對齊其他非同步元件)。

### Error
載入失敗時,顯示 toolbar 內 inline error hint + retry button;不 block 整個 calendar 顯示。

### a11y
- Toolbar navigation 用 `<nav aria-label="calendar navigation">`
- Month grid 用 `role="grid"`,每 cell `role="gridcell"`,日期用 `aria-label="2026 年 4 月 3 日,3 個事件"`
- Event tile `role="button"` + descriptive `aria-label`(title + time)
- Keyboard:方向鍵移動 cell focus / Enter 打開事件 / PageUp/Down 切月

---

## 禁止事項

- ❌ 不用 `<DayPicker>` 為底層——DayPicker 是 form control 用,結構不適合 page-level event canvas
- ❌ 不硬寫 month grid 為 `<table>`——用 CSS grid(月 view 可能跨 cell span event,table 不好 span)
- ❌ 不把 event 資料存在元件內部 state——event 是 consumer 責任,本元件是純 view
- ❌ 不自動打開「新事件」表單——`onDateClick` / `onRangeSelect` 回調給 consumer 決定(避免強制開 Dialog UX)
- ❌ 不重造 date math——用 `date-fns`

---

## MVP vs 後續增量

### MVP(本次 session)
- 月 view(完整)
- Toolbar prev/next/today + title
- Event tile render(單 line + color variant + truncate)
- Today cell highlight
- Outside days visual
- Empty / loading 基礎

### 後續(tech debt)
- 週 view(timeline 24 小時縱軸)
- 日 view(single-day timeline)
- 拖拉新增 event(from 月 cell → range select)
- 拖拉移動 event(cross-day drag)
- 「+N more」展開 popover
- 左側 mini month + filter sidebar
- 多曆疊加(multi-calendar sources)
- Print view / iCal export

---

## Anatomy N/A rationale(偏離 canonical 5 的說明)

- **無 `SizeMatrix`**:MVP 只支援 `view="month"` + 固定 `size="md"`,無多 size tier 可 matrix 對照。後續擴充 week / day view 時再補 SizeMatrix
- **無 `StateBehavior`**:Calendar 是 page-composite canvas,本身無 `hover / focus / disabled` 狀態;互動狀態屬於內部 primitive(event tile / date cell),由 `<Button>` / `<DropdownMenu>` 等消費元件自己的 StateBehavior 負責

---

## 相關

- `../DatePicker/date-picker.spec.md` — 選日期的 form control,本元件姊妹概念(不同職責)
- `../Calendar/calendar.spec.md` — DatePicker 內部 calendar grid primitive(DayPicker 包裝);**不直接面向 consumer**
- `../../patterns/action-bar/action-bar.spec.md` — Toolbar 左中右分組規則
- `../../patterns/element-anatomy/element-anatomy.spec.md` — Page-composite 分類
