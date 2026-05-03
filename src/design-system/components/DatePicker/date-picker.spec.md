---
component: DatePicker
family: 4
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInputLike
---

<!-- @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved. -->

# DatePicker 設計原則

## 定位

DatePicker 是**單一日期**的輸入與顯示元件。Edit 用**本 DS 自建 DateGrid**(基於 `react-day-picker` + 本 DS token)+ Popover 呈現;Display 用 `Intl.DateTimeFormat`。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 DatePicker 特有的原則。

**Layout Family**:CLAUDE.md 4-Family Model **Family 4(Field control layout)** 消費者。結構繼承 `components/Field/field-controls.spec.md` 的 `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]` 規格,視覺對齊 Family 1(Menu item)讓 SelectMenu trigger + options 連續一致。

**實作基礎**:
- Trigger:`<button>` 包 `fieldWrapperStyles`(視覺仍是 Input wrapper,只是改為可點擊觸發浮層)
- Popup:`Popover`(消費 overlay-surface pattern 外殼)
- DateGrid 主體:消費 `<DateGrid>` 內部 primitive(見 `../DateGrid/date-grid.spec.md`;`react-day-picker` 包裝成本 DS token);**不是** `<Calendar>` — `<Calendar>` 是 event 檢視 canvas,跟 DatePicker 無關

---

## Controlled-only rationale(Dim 26)

本元件刻意採 **controlled-only** 模式:`value` + `onChange` 必傳,不支援 `defaultValue` uncontrolled fallback。

**為什麼**:
- 內部狀態複雜(search filter / range / menu open state)跟 `value` 雙向 sync 會產生 race condition
- Consumer 幾乎一定有外部 state(form library / app state),強制 controlled 消除 ambiguity
- 世界級對照:Ant Design DatePicker / Material MUI Select 皆支援 dual-mode;我們選 controlled-only 對齊狀態一致性優先

**若未來要改 dual-mode**:需引入 `useControllableState` helper + 測試 controlled↔uncontrolled switch 場景,屬 major API 擴充,非本 session scope。

---

## 何時用

- **單一日期選擇**：出生日、到期日、提醒日、發佈日
- **需要 locale-aware 顯示**（`Intl.DateTimeFormat` 自動處理年月日順序、月份語言）
- **需要視覺上與 Dialog / Popover / SelectMenu 一致的浮層體驗**（所有浮層都用我們的 token）
- **DataTable 的日期欄位**（自動整合，meta.type='date'）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 日期範圍（from → to） | **`<DatePicker.Range>`**(本檔下「DatePicker.Range」段,2026-04-21 新增) | 仿 Ant `DatePicker.RangePicker` 架構:雙 input + 箭頭 + 共用 calendar icon,Popover 展開兩月份並列 |
| 日期 + 時間（含時分） | **本元件加 `showTime` prop**(canonical 2026-05-02,Ant idiom) | DatePicker `showTime` / DatePickerRange `showTime` 內建 TimeColumns + 此刻/確定 footer;value 變 ISO datetime |
| 相對時間（「3 天前」「昨天」）| 自訂 Display 元件 | DatePicker 的 Display 是絕對日期；相對時間需要計算 + locale 格式化 |
| 純文字 YYYY-MM-DD（不需要 picker）| `Input` | 如 API debug 介面、不需互動的純記錄 |
| 生日等「只有月日、不需要年」的欄位 | 目前用 DatePicker 忍受年份 | 多數情境可接受；要極致可自訂 MonthDayPicker |
| Notion / Google 式 event calendar 檢視 | **`<Calendar>`** 元件(見 `../Calendar/calendar.spec.md`,月/週/日 event view);**非本元件語義** | DatePicker 是「選日期」的 form control;Calendar 是「看事件」的頁面 canvas,兩者雖名字都有 calendar 但是不同 DS 元件 |

---

## DateGrid popup(本 DS 自建)

DatePicker 使用**本 DS 自建 DateGrid** + Popover 而非瀏覽器原生 `<input type="date">`。歷史變更(2026-04-19):原本遵守「不自建 calendar」禁令以保留 mobile 原生 wheel UX,但 CLAUDE.md Mindset #1 擴充後明確要求「視覺上也必須跟世界級一樣整齊」——原生 picker 視覺不受控、跨瀏覽器不一致,無法達成與 Dialog / SelectMenu / Combobox 等浮層的視覺連續性。遂改為自建 DateGrid。

**命名變更(2026-04-21)**:原 `<Calendar>` 元件改名為 `<DateGrid>`(DatePicker 內部 primitive),讓 `Calendar` 這個命名留給真正的事件檢視 canvas(對齊 Notion / Google / Apple / Ant 世界級慣例)。DatePicker 內部 primitive 以功能命名為 `DateGrid`。

### 架構

```
<button fieldWrapperStyles>        ← 視覺仍是 Input wrapper(不變)
  <span>格式化的日期文字</span>
  <ItemInlineAction X />            ← 選用,clearable=true 時顯示
  <CalendarIcon />                   ← 右側固定(lucide icon,視覺 affordance)
</button>
       │ 點擊開啟
       ▼
<Popover>
  <DateGrid />                     ← react-day-picker + 本 DS token(原 Calendar)
</Popover>
```

### Cell state canonical(5 種語意視覺)

DateGrid cell 有 5 種語意視覺,每種用不同形狀/色彩語言避免混淆:

- **正常(未 hover)** — 黑字透明底(base reading state)
- **today** — 文字下方藍色底線(**非 ring circle**,避免與 hover 混淆,對齊 Ant / Google Calendar / macOS Calendar)
- **disabled** — 灰底圓圈 + 淺灰字(與 outside month 視覺略有區隔)
- **selected**(single / range 端點) — **藍底白字圓**
- **range track**(中間日期) — 灰底矩形橫條(打在 day 容器層,非 button 層;與端點圓接縫形成連續 bar)
- **hover**(未選中) — 藍圈 outline **無 fill**(非 filled 避免跟 selected 混淆)

**為什麼 selected 用 primary 非 neutral**:DatePicker 的 selected 是「**最終選定日期**」強 affordance,用 primary 顯示確定性(對齊 Google Calendar / Notion Calendar / Ant DatePicker 慣例)。**對照 TimePicker 選項 selected 用 `bg-neutral-selected`**(見 `time-picker.spec.md`),因為 TimePicker panel 是「**列表選中**」語意(user 在時分選項間切換),跟 SelectMenu 同流派。兩者差異 codified 在各 spec,不互調。

**State stacking(組合狀態處理)**:
- today + selected → **selected 勝出**(藍底白字圓)
- today + range-middle → track 灰底 + underline 仍可見
- outside month → 弱化字色(不套 disabled 灰底圓,outside 只是「非當月」不是「禁選」)

其他區塊(月份 caption / Nav 按鈕 / 星期標頭)視覺層級:月份 caption 與 SelectMenu 標題同等、Nav 按鈕走 tertiary icon button 規格、星期標頭弱化為輔助資訊。

完整 class / token 對照見 anatomy `CalendarTokens` story。

### Spacing canonical(2026-04-21 對齊 user 附圖)

- Popover padding **四邊對稱** 12px(= `--layout-space-tight` @ md density,實作走 `p-3`)
- **左右對稱**:prev/next chevron button 中心 = 第一/最後一欄日期 cell 中心(`w-9` × 7 + chevron `w-9`);chevron 到 popover 邊距 = 最邊欄日期到 popover 邊距 = 12px
- **上下對稱**:month caption 到 popover top 距離 = 最後一排日期到 popover bottom 距離 = 12px(均從 `p-3` 繼承)
- day cell 固定 `h-9 w-9`(36×36);week header 固定 `h-8 w-9`

### Calendar icon

右側固定顯示 Calendar icon（視覺指示這是日期輸入）。Trigger 本身是 `<button>`,點擊開啟 Popover。

---

## DatePicker.Range(2026-04-21 新增,仿 Ant Design)

### API

```tsx
<DatePicker.Range
  value={[startIso, endIso]}           // [string | null, string | null] | null
  onChange={([start, end]) => ...}
  size="sm" | "md" | "lg"              // default md,對齊 field-height family
  placeholder={['Start date', 'End date']}   // 雙 placeholder
  disabled
  clearable                             // 一次清空兩端點
  formatOptions                         // Intl.DateTimeFormatOptions,與 single 共用
  locale
  showTime                              // 啟用時間欄位 → value 變 [datetime, datetime]
  showSeconds                           // showTime 時是否顯示秒
  minuteStep={15}
  needConfirm                           // 預設 showTime=true 時為 true
/>
```

### 結構(對齊 user 提供附圖 [Image #3])

```
┌───────────────────────────────────────────────┐
│ Start date     →     End date            📅  │
└───────────────────────────────────────────────┘
 │               │                │              │
 │               │                │              └─ CalendarIcon(固定右側,視覺指示)
 │               │                └─ End date(獨立 button,點擊 activeEnd='end')
 │               └─ ArrowRight icon(`mx-2`,text-fg-muted)
 └─ Start date(獨立 button,點擊 activeEnd='start')
```

外層是 `fieldWrapperStyles` 容器,內含**兩個獨立 button**(start / end input),點任一個都開 Popover **並設定 activeEnd**。Active 端點視覺以 `data-active-end="true"` underline 標示(對齊 Ant RangePicker active input 視覺)。

### Active-end 機制(canonical 2026-05-02,對齊 Ant Design RangePicker)

對齊 Ant Design 實證(WebFetch react-component/picker source code 2026-05-03):**input-click 切換 activeEnd**,而**非** footer toggle / radio 按鈕。

**Source citations**:
- Ant `activeIndex` tracking + `getActiveRange`:`https://github.com/react-component/picker/blob/master/src/PickerInput/RangePicker.tsx`(`function getActiveRange(activeIndex) { return activeIndex === 1 ? 'end' : 'start' }`)
- Ant `useRangeDisabledDate`:`https://github.com/react-component/picker/blob/master/src/PickerInput/hooks/useRangeDisabledDate.ts`(activeIndex=1 + start 已選 → date < start disabled)
- Material X DateRangePicker docs:`https://mui.com/x/react-date-pickers/date-range-picker/`(同 input-driven activeEnd 派)
- Atlassian DateRangePicker:`https://atlassian.design/components/datetime-picker/`

- 點 start input → `activeEnd='start'` + 開 popover;DateGrid range 選的端點落到 start
- 點 end input → `activeEnd='end'` + 開 popover;同理只更新 end
- **Auto-advance**:選完 start → 自動切 `activeEnd='end'` 等待 user 選 end(Ant idiom)
- **showTime=true 時 TimeColumns 套 active end 的 time**(只能編一端的時間,符合單一焦點原則)
- 視覺指示:active input 加 `decoration-primary underline-offset-4 decoration-2`(對齊 Field focus 語意)

### Popover 行為

- `mode="range"` + `numberOfMonths={2}`(兩月並列,對齊 Airbnb / Booking / Ant Design)
- 點 date → 依 `activeEnd` 更新對應端點(start | end);auto-advance 至 end 等選
- showTime=false:兩端點都填好 → Popover **自動關閉**
- showTime=true:`needConfirm=true`(default),user 按「確定」才 commit + close
- 期間 user 可 hover 未來端點預覽 range track 視覺(Calendar 內建)
- Clear 按鈕清空兩端點 `onChange([null, null])`

### Range 視覺規則

- **range_start / range_end**:沿用 single selected 的視覺(藍底白字圓)
- **range middle**:灰底矩形橫條(打在 day 容器層,不是 button 層)
- **端點 ↔ 中間的接縫**:端點採半圓角(左端 `rounded-l-full` / 右端 `rounded-r-full`)讓圓弧 + 矩形無縫連接成一條連續底色帶

完整 class 對照見 anatomy `CalendarTokens`(State canonical 表的 `selected` / `range track`)。

### 禁止

- ❌ 不自刻「兩個 `<Input>` + 中間箭頭」繞過 `DatePicker.Range`(canonical 本元件提供)
- ❌ 不讓 Popover 在選第一個端點後就關閉(違反 range selection UX)
- ❌ value 用單字串 `"2026-01-01/2026-01-07"`——必 `[string | null, string | null]`,語意清楚 + 避免 parse 錯誤
- ❌ Range active-end **不**用 footer toggle / radio 切換(違反 Ant / Material / Atlassian 慣例);必走 input-click

---

## showTime(2026-05-02 新增,Ant idiom 整合 datetime)

### API

```tsx
<DatePicker
  showTime                              // 啟用時間欄位 → value 變 ISO datetime
  showSeconds={false}                   // 是否顯示秒(預設 false,對齊 Ant)
  minuteStep={15}                       // 分鐘步進,會議常用 15
  secondStep={1}
  needConfirm                           // 預設 showTime=true 時為 true(Ant idiom)
  value={iso}                           // 'YYYY-MM-DDTHH:MM:SS'
  onChange={...}
/>

<DatePicker.Range showTime ... />       // Range 同樣 props
```

### 行為

- showTime=true:popover 右側出現 `<TimePickerSidePanel>`(內部消費 TimeColumns),通過 `<CalendarTimeContainer>` absolute positioning 讓 DateGrid 主導 row 高度(TimeColumns 不撐高)
- TimePickerSidePanel **header dynamic 顯示當前 active time**(`HH:MM` / `HH:MM:SS`),對齊 Ant `<DatePicker showTime />` panel header(canonical 2026-05-03 v9)
- TimePickerSidePanel 結構:**pt-3 + h-field-xs flex center + mb-3**(top 對齊 DateGrid month_caption 同 Y baseline;**bottom = 0,讓 time list 連續延伸到 SurfaceFooter border-t**,對齊 Ant / Material time-picker 「continuous scroll」idiom — canonical 2026-05-03 v10)
- TimePickerSidePanel header **下方無 divider**(對齊 DateGrid month_caption 也無 border-b),DS internal canonical M23 優先於 Ant time-picker header divider 慣例 — 兩 panel 同層級 caption 視覺對稱(canonical 2026-05-03 v10)
- 底部 footer **消費 SurfaceFooter SSOT**(`patterns/overlay-surface`)— border-t + canonical px-loose py-tight padding,**不**自寫 Separator + p-2 + ml-auto wrapper(canonical 2026-05-03 v8)
- Footer 排版(對齊 Ant `marginInlineStart: auto` on OK):左「此刻」(`mr-auto` push)、右「確定」(needConfirm)或「關閉」
- Range showTime footer **無「此刻」**(對齊 Ant `showNow={multiple ? false : showNow}`)— 只「確定」走 SurfaceFooter justify-end
- value 格式:`'YYYY-MM-DDTHH:MM:SS'`(local-time 語意,不帶 timezone)
- needConfirm=true 時 user 編輯先暫存 draft,trigger text 即時讀 draft(canonical 2026-05-03 v8 修);按確定才 onChange;false 時邊編邊 commit
- showSeconds=false(default)→ TimeColumns 只顯示 H/M(對齊 Ant 預設)
- Range cell disable(對齊 Ant `useRangeDisabledDate`):activeEnd='start' + end 已選 → date > end disabled;activeEnd='end' + start 已選 → date < start disabled
- Range stadium pattern(canonical 2026-05-03 v8):rangeStart/End cell pseudo `before:rounded-l-full / rounded-r-full` 跟 button 圓的左/右半弧 EXACTLY OVERLAY → 無「凸出」(對齊 Ant `cell-range-start::before { border-radius: 9999px 0 0 9999px }`)

### 為什麼用 prop 而非分離 `<DateTimePicker>` 元件

世界級對照:**Ant Design / Material X / Atlassian / Carbon 全採 prop 模式**(`showTime` / `withTime` / `granularity`),非分離元件。Source:
- Ant `<DatePicker showTime />`:`https://ant.design/components/date-picker#datepicker-demo-time`(`showTime: true | object`)
- Material X `views={['day','hours','minutes']}` / `format`:`https://mui.com/x/react-date-pickers/date-time-picker/`
- Atlassian `<DateTimePicker>`:`https://atlassian.design/components/datetime-picker/`
- React Aria `granularity`:`https://react-spectrum.adobe.com/react-aria/DatePicker.html#granularity`

理由:
- API surface 一致(同 props 結構,只多 4 個 time-related prop)
- 避免 DateTimePicker / DateTimeRangePicker / DatePicker / DatePickerRange 4 個元件 cross-product
- consumer 從 date-only 升級 datetime 只加 prop,不換元件

歷史(2026-04-21~05-01):曾分離為 `<DateTimePicker>` 在 DataTable 內,2026-05-02 user audit 發現抽象不對(M17 SSOT 違反 + API surface 不一致),合併回 DatePicker showTime。

---

## 格式化

| 選項 | 說明 | 範例 |
|------|------|------|
| `formatOptions` | `Intl.DateTimeFormatOptions` | `{ year: 'numeric', month: 'short', day: 'numeric' }` |
| `locale` | BCP 47 locale | `'zh-TW'`、`'en-US'` |

Display 模式（readonly / disabled / DataTable cell）使用 `Intl.DateTimeFormat` 格式化。Edit 模式 trigger 顯示文字也透過 `Intl.DateTimeFormat` 格式化（與 Display 一致，`formatOptions` / `locale` prop 對兩者皆生效）。

---

## Clearable

`clearable` prop 在有值時顯示 clear 按鈕（endAction）。

- 只在 edit 模式顯示
- 清除後 value 變為 `null`（Display 顯示 —）
- **Dual-state sync canonical**(2026-05-03 v10):X 點擊必同時 `onChange?.('')` + `setDraft(null)`(Range 同),否則 `needConfirm=true`(showTime 預設)且 popover 開著時 `displayValue=draft` 仍顯示舊值,trigger 看起來「沒清」。X 在 trigger 上是 standard clear affordance,不走 needConfirm「等確定」語義 — 立刻 commit + 同步 draft

---

## 禁止事項

- ❌ 不在 readonly / disabled 模式顯示 clear 按鈕
- ❌ 不改 DateGrid 視覺 token 為本 DS 以外的顏色(`bg-primary` / `ring-primary` 等必須來自 semantic token,不可硬寫)
- ❌ 不用其他 calendar library 平行實作(若有 DateRange / DateTime 未來需求,擴充本 DateGrid 而非引入第二個 library)

---

## shadcn passthrough 例外說明

DatePicker 套 `React.forwardRef` + `displayName`,但**不 `...props` spread DOM**——consumer 透過 `DatePickerProps` 明列 API surface(value / onChange / mode / size / formatOptions 等),不 spread 任何剩餘 DOM attrs 到 trigger。

**為什麼 intentional**:DatePicker trigger 是 **compound**(Display 模式為 span 視覺、Edit 模式為 Button),不同 render tree。若 spread `...props` 則會 leak 到特定一邊,另一邊 consumer 誤以為無效:

- consumer 傳 `onFocus` → 期待作用在「edit trigger button」,但 Display 模式無 trigger 會忽略
- consumer 傳 `data-testid` → 指向哪個 render tree 取決於當下 mode,測試不穩定
- consumer 傳 className → **這個有明確語義**:套在 root wrapper(不論哪個 mode 都穩定),`DatePickerProps.className` 顯式接收

顯式列 API surface 符合世界級 composite 元件慣例(Material DatePicker / Atlassian DateTimePicker 皆如此),consumer 知道能傳什麼,避免靜默失效。

**`asChild` 不支援**:同理,compound trigger 無單一 Slot 目標。consumer 若要自訂 trigger 視覺,改用 DatePickerDisplay + 自家 Button composition。

---

## 相關

- `../Input/input.spec.md` — 純文字 YYYY-MM-DD（不需 picker 互動的場景）
- `../NumberInput/number-input.spec.md` — 年齡、天數等數值
- `../Field/field-controls.spec.md` — Field Control 共用規則（mode / size / endAction / error）
