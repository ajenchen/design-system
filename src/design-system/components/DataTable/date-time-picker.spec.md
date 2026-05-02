# DateTimePicker / DateTimeRangePicker

## 定位

DS 既有 `DatePicker` / `DatePickerRange`(date-only)+ `TimePicker`(time-only)的 datetime 組合版,提供「日期 + 時間」原子選擇。

| 元件 | 用途 |
|---|---|
| `<DateTimePicker>` | 單一 datetime 選擇 |
| `<DateTimeRangePicker>` | datetime 區間(start datetime + end datetime)選擇 |

**實作基礎**:
- **Trigger**:`<button>` + `fieldWrapperStyles`(對齊 DatePicker / TimePicker idiom)
- **Popover**:`<Popover>`(消費 `patterns/overlay-surface/`)
- **Calendar**:消費 `<DateGrid>`(內部基於 react-day-picker)
- **Time columns**:消費 `<TimeColumns>` primitive(於 `TimePicker/time-columns.tsx`,M17 SSOT,共 TimePicker / DateTimePicker / DateTimeRangePicker 三個 consumer)

**Layout Family**:Family 4(Field control layout)消費者。

**M8 對標**:**Ant Design** 主對標(user 偏好 + ref 圖)+ React Aria(a11y)+ MUI X / Carbon 對照。**Carbon / Polaris / USWDS 都沒原生 DateTimePicker** — 我們做了 = 領先。

## 何時用

- 業務語意需要「日期 + 時間」一起原子捕捉(會議起訖、deadline、log timestamp、release schedule)
- DataTable column meta `includeTime=true` 時自動切到 datetime 變體(filter `is_between` / `is_before` / `is_after`)
- 需要 ms-precision 比對(避開 Airtable 知名「day-precision 漏邊界」地雷)

## 何時不用

- ❌ 只需日期(無時間語意)→ 用 `DatePicker` / `DatePickerRange`
- ❌ 只需時間(無日期語意)→ 用 `TimePicker`
- ❌ 業務需「跨多天的 segment 列表」(行程 timetable)→ 屬 calendar app 範疇,不是 picker
- ❌ 純文字 ISO timestamp 編輯(技術人 use case)→ 用 `<Input>`,picker 反而拖慢

## 近親分界

| 元件 | 場景 |
|---|---|
| `DateTimePicker`(本)| 單值 datetime |
| `DateTimeRangePicker`(本)| 兩值 datetime(start, end)|
| `DatePicker` | 單值 date(無時間)|
| `DatePickerRange` | 兩值 date(無時間)|
| `TimePicker` | 單值 time(無日期)|

## 常見誤解

- ❌ 「Range 應該 2 calendars 並排」:**Ant `showTime` 實際行為是 single calendar**(寬度友善 + UX 一致),我們對齊 Ant
- ❌ 「不需 OK button,選完 commit」:time scroll selector 沒明確「結束」訊號,**`needConfirm=true` 預設**
- ❌ 「`needConfirm=false` 比較簡潔」:user 容易意外 commit 錯時間;預設 true 是 Ant 共識
- ❌ 「同 popover 可同時編 start + end」:state machine 會 ambiguous;**active end 切換**(Editing: Start | End indicator)明確分權
- ❌ 「stacked tab views(day → time)較好」:多步驟 navigation 增加成本(MUI 派),**Ant 平鋪派**對 user 友善

## Layout(對齊 user ref 圖 + Ant 實際)

### DateTimePicker(single)

```
┌──────────────────────────┬──────────────┐
│  [<] Nov 2021      [>]   │   Time       │
│  Mo Tu We Th Fr Sa Su    │   HH MM SS   │
│   1  2  3  4  5  6  7    │   00 00 00   │
│   ...                    │   01 01 01   │
│  [15] 16 17 18 19 20 21  │   ...        │
├──────────────────────────┴──────────────┤
│ [Now]                              [OK] │
└─────────────────────────────────────────┘
```

### DateTimeRangePicker

**single calendar mode**(對齊 Ant showTime 實際,**不是 2 calendars 並排**):

```
┌──────────────────────────┬──────────────┐
│  [<] Nov 2021      [>]   │   Time       │
│  ...calendar with range  │   HH MM SS   │
│  highlight (start→end).. │              │
│  [15] 16 17 18 19 [20]   │   ...        │
├──────────────────────────┴──────────────┤
│ Editing: [Start ◉  End ○]               │
│ [Now]                              [OK] │
└─────────────────────────────────────────┘
```

- Calendar 顯示 single month + range highlight
- TimeColumns 套**目前 active end**(state machine,start / end 切換)
- Footer 加 `Editing: Start | End` segmented indicator

## State machine(Range)

```
[start picking] ─click date→ time scroll OK→ [end picking]
       ↑                                            │
       └──── click "Editing: Start" segmented ──────┘
```

- 進 popover 預設 active = `start`
- 點 calendar date → 套 active end 的 date 部分
- 滾 time → 套 active end 的 time 部分
- user 可手動切「Editing: Start | End」回頭改

## 互動規格

### `needConfirm`

預設 `true`。理由如「常見誤解」段。`false` 時點 calendar / 滾 time 即 commit(consumer 自負風險)。

### Now button

| 元件 | 行為 |
|---|---|
| DateTimePicker | 一鍵填入當前 datetime(`new Date()`) |
| DateTimeRangePicker | 一鍵填入「**目前 active end** = 當前 datetime」(只動 active end)|

### OK button

- DateTimePicker:有 datetime → enabled,點擊 commit + 關 popover
- DateTimeRangePicker:start + end 都齊 → enabled

### Trigger 顯示

| 元件 | 顯示 |
|---|---|
| DateTimePicker | `2021-11-15 10:30`(可 `formatOptions` 自訂) |
| DateTimeRangePicker | `2021-11-15 10:30 → 2021-12-20 18:45`(Ant-style split-input)|

## 空值 / 驗證 / Loading

- **空值**:`value=null` 時 trigger 顯示 placeholder;point inside picker 開啟仍 OK
- **驗證**:`error` prop 套 `--error` border;不做 cross-field validation(start ≤ end 屬 consumer 業務邏輯)
- **Loading**:無;datetime 是同步運算(無 async 需求)
- **clearable**:啟用時 trigger 內顯示 ✕ inline action,點擊 → `onChange(null)`

## A11y 預設

| 部分 | role / 屬性 |
|---|---|
| Trigger | `<button>` + `aria-haspopup="dialog"` + `aria-expanded` |
| Popover | `role="dialog"` + `aria-label` |
| Calendar | `role="grid"`(DateGrid 提供)+ dates `role="gridcell"` |
| Time columns | `role="listbox"` + values `role="option"`(TimeColumns 提供)|
| Editing indicator(Range)| `role="radiogroup"` + `aria-checked`(對齊 React Aria idiom)|
| Now / OK button | `<Button>` 內建 semantics |

### Keyboard map

| 按鍵 | 行為 |
|---|---|
| Tab | trigger → 進 popover → calendar grid → time columns → Editing(range only)→ Now → OK |
| Arrow keys | calendar 內格移動(WCAG ARIA grid pattern);time column 內 ↑↓ 換值 |
| Enter | calendar 上選日期;time column 上 commit 該值 |
| Esc | 關 popover(不 commit) |
| Page Up/Down | calendar 換月 |

## Props

### DateTimePicker

```ts
export interface DateTimePickerProps {
  mode?: 'edit' | 'readonly' | 'disabled'
  size?: 'sm' | 'md' | 'lg'
  value?: string | null               // ISO 8601 e.g. '2021-11-15T10:30:00'
  onChange?: (value: string | null) => void
  placeholder?: string
  needConfirm?: boolean               // default true
  showSeconds?: boolean               // default false
  minuteStep?: TimeStep
  secondStep?: TimeStep
  clearable?: boolean
  error?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
}
```

### DateTimeRangePicker

```ts
export interface DateTimeRangePickerProps {
  // 同上,差別:
  value?: [string | null, string | null] | null
  onChange?: (value: [string | null, string | null]) => void
  placeholder?: [string, string]
}
```

**Controlled-only**:對齊 DatePicker / TimePicker 慣例(避免 internal state 跟 props sync race)。

## 視覺 token

| 部位 | token |
|---|---|
| Popover surface | `--surface-1` + `--elevation-3` |
| Selected date(calendar)| `--accent` + `--accent-fg`(DateGrid 提供)|
| Today underline | `--accent` text-decoration(DateGrid 提供)|
| Selected time(column)| `bg-neutral-selected`(TimeColumns 提供)|
| Now / OK button | `<Button variant="tertiary">` / `<Button variant="primary">` |
| 分隔線(calendar \| time)| `border-l border-divider`(`leadingDivider` prop)|

## 禁止事項

- ❌ 自包 Provider(對齊 DS 全規:元件不該自包 portal / theme provider)
- ❌ Range layout 用 2 calendars 並排(寬度爆 + 不對齊 Ant showTime 實際行為)
- ❌ Stacked tab views(MUI 派,多步驟 user 不喜歡)
- ❌ 沒 OK button auto-commit datetime(time scroll 沒明確結束訊號)
- ❌ 同 popover 同時編 start + end(state machine ambiguous;active end 切換明確)

## 相關 links

- `DatePicker/date-picker.spec.md` — date-only 單值 / range
- `TimePicker/time-picker.spec.md` — time-only
- `DateGrid/date-grid.spec.md` — calendar primitive
- `TimePicker/time-columns.tsx` — H/M/S column scroll selector primitive(M17 SSOT)
- `data-table-filter-panel.spec.md` — `meta.includeTime=true` 渲 datetime picker
