# DateTimePicker / DateTimeRangePicker — Spec(DRAFT v1)

> **狀態**:Phase B 交付物。Phase D 元件實作前的 spec。
> **配合**:`advanced-filter-operators.draft.md` v3 — `column.meta.includeTime=true` 時 ValueShape 切到 `datetime_*`,渲染這兩支元件。
> **M8 benchmark**:**Ant Design** 主對標(user 偏好 + ref 圖)+ React Aria(a11y 補強)+ MUI X / Carbon 對照。

## 1. 定位

DS 既有 DatePicker / DatePickerRange(date-only)+ TimePicker(time-only)的 datetime 組合版。

| 元件 | 用途 | 對標 |
|---|---|---|
| `<DateTimePicker>` | 單一 datetime(date + time)選擇 | Ant Design DatePicker `showTime` |
| `<DateTimeRangePicker>` | datetime 區間(start datetime + end datetime)選擇 | Ant Design RangePicker `showTime` |

**實作基礎**:
- **Trigger**:`<button>` + `fieldWrapperStyles`(對齊 DatePicker / TimePicker idiom)
- **Popover**:消費 `patterns/overlay-surface/`
- **Calendar**:消費既有 `Calendar` primitive(react-day-picker)
- **Time columns**:消費 TimePicker 內部的 `TimeColumns`(本 phase 抽出共用 — Rule-of-3 滿足:TimePicker / DateTimePicker / DateTimeRangePicker)

**世界級對照**:
- Ant Design DatePicker `showTime` / RangePicker `showTime`(主對標)
- React Aria DatePicker(a11y 標竿)
- MUI X DateTimePicker(stacked layout 派,我們不採)
- Carbon / Polaris / USWDS:**都沒原生 DateTimePicker**(我們做了 = 領先)

## 2. Layout(對齊 user ref 圖 + Ant 實際結構)

### DateTimePicker(single)

```
┌──────────────────────────┬──────────────┐
│  [<] Nov 2021      [>]   │   Time       │
│  Mo Tu We Th Fr Sa Su    │   HH MM SS   │
│   1  2  3  4  5  6  7    │              │
│   8  9 10 11 12 13 14    │   00 00 00   │
│  [15] 16 17 18 19 20 21  │   01 01 01   │
│   ...                    │   02 02 02   │
│   ...                    │   ...        │
├──────────────────────────┴──────────────┤
│ [Now]                              [OK] │
└─────────────────────────────────────────┘
```

- 寬度約 ~600-700px
- 左:Calendar(同 DatePicker 既有 calendar)
- 右:Time columns(scroll selector,3 欄 HH/MM/SS)
- 底:Now + OK footer

### DateTimeRangePicker(range — Ant 實際行為:single calendar mode when showTime)

**user 上輪修正:Ant 加 showTime 後 RangePicker 切成 single calendar(不是 2 calendars 並排)**。我們對齊:

```
┌──────────────────────────┬──────────────┐
│  [<] Nov 2021      [>]   │   Time       │
│  ...calendar with range  │   HH MM SS   │
│  highlight (start→end).. │              │
│  [15] 16 17 18 19 [20]   │   00 00 00   │
│   ...                    │   ...        │
├──────────────────────────┴──────────────┤
│ Editing: [Start ◉  End ○]               │
│ [Now]                              [OK] │
└─────────────────────────────────────────┘
```

- 寬度約 ~600-700px(跟 single 一樣窄,popover 友善)
- Calendar 顯示 single month + range highlight(start→end 標亮)
- Time columns 套**目前 active end**(state machine,start / end 切換)
- Footer 加「Editing: Start | End」segmented indicator,顯示目前在編哪個 end

### 為什麼不走 MUI X 派(stacked tab views)

- 多步驟 navigation(day → time)增加操作成本
- 視覺上跟 user ref 圖不一致
- Ant idiom 一目了然 + 對齊 ref → 採用

## 3. 互動規格

### needConfirm(對齊 Ant)

datetime / datetime-range **預設 `needConfirm=true`** — user 必須按 OK 才提交。

**理由**:time scroll selector 沒有明確「結束」訊號(滾完不代表 user 確認),沒 OK button user 容易意外 commit 錯時間。

### Now button

| 元件 | 行為 |
|---|---|
| DateTimePicker | 一鍵填入當前 datetime(`new Date()`)|
| DateTimeRangePicker | 一鍵填入「**目前 active end** = 當前 datetime」(只動 active end,不動另一端) |

### OK button

- DateTimePicker:有 date + time → enabled,點擊 commit + 關 popover;缺一 → disabled
- DateTimeRangePicker:start + end 都齊 → enabled;否則 disabled

### State machine(Range 專用)

Initial state:active = `start`

```
[start picking] ─click date→ time scroll OK→ [end picking]
       ↑                                            │
       └──── click "Editing: Start" segmented ──────┘
```

- 進 popover 預設 active = start
- 點 calendar date → 套到 active end 的 date 部分
- 滾 time → 套到 active end 的 time 部分
- 點 OK 或選完 start time → 自動 advance 到 end
- user 可手動切「Editing: Start | End」回頭改

### Trigger field 顯示

| 元件 | trigger 顯示 |
|---|---|
| DateTimePicker | `2021-11-15 10:30` 格式(可 `formatOptions` 自訂) |
| DateTimeRangePicker | `2021-11-15 10:30 → 2021-12-20 18:45 📅` Ant-style split-input |

### 鍵盤導航

| 按鍵 | 行為 |
|---|---|
| Tab | trigger → 進 popover → calendar grid → time columns → Now → OK |
| Arrow keys | calendar 內格移動(WCAG ARIA grid pattern);time column 內 ↑↓ 換值 |
| Enter | 在 calendar 上選日期;在 time column 上 commit 該值 |
| Esc | 關 popover(不 commit) |
| Page Up/Down | calendar 換月 |

**v1 trigger 採 Ant button-style**(`MM/DD/YYYY HH:mm` 顯示文字,click 開 popover)。
**v2 enhancement(留 phase 後)**:trigger 改 React Aria segmented field — 每 segment 鍵盤可改不必開 popover。

## 4. A11y 預設

### ARIA roles

| 元件部分 | role |
|---|---|
| Trigger | `button`(`aria-haspopup="dialog"`) |
| Popover | `role="dialog"` `aria-modal="false"` |
| Calendar | `role="grid"` + dates `role="gridcell"`(react-day-picker 預設) |
| Time column | `role="listbox"` + values `role="option"` |
| Now / OK button | standard `<Button>` semantics |

### Screen reader

- Trigger label 必設(`aria-label` 或 visible label) — describe 資料用途(e.g.「截止 datetime」)
- Range:trigger `aria-label` 描述「起 ~ 訖」;Editing indicator 用 `aria-live="polite"` announce 切換

### Required behaviors

- Trigger button accept Enter / Space 開 popover
- Popover open / close announced
- Calendar grid 鍵盤導航不被 time columns 攔截

## 5. Props API

### DateTimePicker

```ts
export interface DateTimePickerProps {
  mode?: 'edit' | 'readonly' | 'disabled'
  size?: 'sm' | 'md' | 'lg'
  value?: string | null         // ISO 8601 with time(e.g. '2021-11-15T10:30:00')
  onChange?: (value: string | null) => void
  defaultValue?: never          // controlled-only(對齊 TimePicker idiom)
  placeholder?: string
  needConfirm?: boolean         // default true
  showSeconds?: boolean         // default false(分為止)
  minuteStep?: number           // default 1
  secondStep?: number
  formatOptions?: Intl.DateTimeFormatOptions
  locale?: string
  clearable?: boolean
  error?: boolean
  disabled?: boolean
  className?: string
}
```

### DateTimeRangePicker

```ts
export interface DateTimeRangePickerProps {
  mode?: 'edit' | 'readonly' | 'disabled'
  size?: 'sm' | 'md' | 'lg'
  value?: [string | null, string | null] | null
  onChange?: (value: [string | null, string | null]) => void
  placeholder?: [string, string]
  needConfirm?: boolean
  showSeconds?: boolean
  minuteStep?: number
  secondStep?: number
  formatOptions?: Intl.DateTimeFormatOptions
  locale?: string
  clearable?: boolean
  error?: boolean
  disabled?: boolean
  className?: string
}
```

**Controlled-only**:對齊 DatePicker / TimePicker 既有慣例(避免 internal state 跟 props sync race)。

## 6. 視覺 token

| 部位 | token |
|---|---|
| Popover surface | `--surface-1` + `--elevation-3` |
| Trigger field background | `--surface-1`(edit)/ transparent(readonly) |
| Trigger field border | `--border-default`(edit)/ none(readonly) |
| Selected date(calendar) | `--accent` + `--accent-fg` |
| Today underline(calendar) | `--accent` text-decoration |
| Selected time(column) | `--accent-subtle` background |
| Now / OK button | 消費 `<Button variant="tertiary">` / `<Button variant="primary">` |
| 分隔線(calendar | time)| `border-r --border-subtle` |

## 7. M17 SSOT — Calendar / TimeColumns 共用 primitive

### Calendar primitive
- 消費者:DatePicker / DatePickerRange / DateTimePicker / DateTimeRangePicker(4 個)→ **Rule-of-3 滿足,抽出共用**
- 既有 `Calendar` 已 export,confirm 4 元件可共用即可

### TimeColumns primitive(本 phase 抽)
- 消費者:TimePicker / DateTimePicker / DateTimeRangePicker(3 個)→ **Rule-of-3 滿足,抽出共用**
- 從 TimePicker 內部抽 `TimeColumns` 子元件(scroll selector + minuteStep/secondStep + commit on Enter)
- TimePicker 改成消費 TimeColumns + 其他 chrome(footer Now/OK 等)

## 8. 禁止事項(❌)

- ❌ 自包 Provider(對齊 DS 全規:元件不該自包 portal / theme provider)
- ❌ Range layout 用 2 calendars 並排(寬度爆 + 跟 ref 圖不符;Ant showTime 也不這樣)
- ❌ stacked tab views(MUI 派 — UX 多步驟,user 不喜歡)
- ❌ 沒 OK button auto-commit datetime(time scroll 沒明確結束訊號,user 易誤觸)
- ❌ 同 popover 同時編 start + end(state machine 會 ambiguous;active end 切換明確)

## 9. Phase D 實作排序

```
D.1 抽 TimeColumns primitive from TimePicker(refactor)
  └─ 寫 TimeColumns.tsx + 改 TimePicker 消費
  └─ tsc + 既有 TimePicker stories pass
D.2 DateTimePicker.tsx + spec.md + stories
D.3 DateTimeRangePicker.tsx + spec.md + stories
D.4 filter panel 在 column.meta.includeTime=true 時切渲 datetime picker
D.5 /component-quality-gate + /ux-audit + /visual-audit(對 ref 圖)
```

## 10. 待 review

- [ ] Single calendar layout for both single + range(對齊 Ant 實際行為,不是 2 calendars)
- [ ] needConfirm=true 預設 OK?
- [ ] Range state machine(active = start | end 切換)互動 OK?
- [ ] v1 trigger 採 Ant button-style;v2 改 React Aria segmented field — phase 排這樣 OK?
- [ ] TimeColumns primitive 抽出(M17 Rule-of-3 滿足)OK?
