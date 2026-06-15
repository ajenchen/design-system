---
component: DatePicker
family: 4
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInputLike
benchmark:
  - Ant Design DatePicker: github.com/ant-design/ant-design/tree/master/components/date-picker
  - MUI X Date Pickers: github.com/mui/mui-x/tree/master/packages/x-date-pickers
  - react-day-picker: github.com/gpbl/react-day-picker
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — all world-class DS claims below have inline URL or per-claim retract. Frontmatter benchmark list expanded with canonical doc URLs. -->

# DatePicker 設計原則

## 定位

DatePicker 是**單一日期**的輸入與顯示元件(form 場景選定絕對日期的 Field control)。組成(DateGrid + Popover、`Intl.DateTimeFormat` 格式化)見下方「實作基礎」與「格式化」。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 DatePicker 特有的原則。

**Layout Family**:CLAUDE.md 4-Family Model **Family 4(Field control layout)** 消費者。結構繼承 `components/Field/field-controls.spec.md` 的 `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]` 規格,視覺對齊 Family 1(Menu item)讓 SelectMenu trigger + options 連續一致。

**實作基礎**:
- Trigger:`<div role="combobox" tabIndex={0}>` 包 `fieldWrapperStyles`(視覺仍是 Input wrapper,只是改為可點擊觸發浮層)。**刻意不用 native `<button>`**——trigger 內含 `ItemInlineAction`(本身是 `<button>`),button 包 button 會構成 nested-interactive(axe serious 違規);改用 `div + role="combobox"`;Radix PopoverTrigger 只 compose onClick(div 無 native Enter/Space→click),Enter / Space 開 popover 由本檔自建 onKeyDown 補(見 date-picker.tsx trigger 註解)。對齊 Combobox / Select / TimePicker 同 pattern。**例外**:`DatePicker.Range` 的雙 input 是真 `<button type="button">`(各自獨立 active,無內含 inline-action)
- Popup:`Popover`(消費 overlay-surface pattern 外殼)
- DateGrid 主體:消費 `<DateGrid>` 內部 primitive(見 `../DateGrid/date-grid.spec.md`;`react-day-picker` 包裝成本 DS token);**不是** `<Calendar>` — `<Calendar>` 是 event 檢視 canvas,跟 DatePicker 無關

---

## Controlled-only rationale(Dim 26)

本元件刻意採 **controlled-only** 模式:`value` + `onChange` 必傳,不支援 `defaultValue` uncontrolled fallback。

**為什麼**:
- 內部狀態複雜(draft 暫存 / popover open / Range activeEnd)跟 `value` 雙向 sync 會產生 race condition
- Consumer 幾乎一定有外部 state(form library / app state),強制 controlled 消除 ambiguity
- 世界級對照:Ant Design DatePicker([ant.design/components/date-picker](https://ant.design/components/date-picker)) / Material MUI X DatePicker([mui.com/x/react-date-pickers/date-picker](https://mui.com/x/react-date-pickers/date-picker/))皆 value + defaultValue 共存;我們選 controlled-only 對齊狀態一致性優先

**若未來要改 dual-mode**:需引入 `useControllableState` helper + 測試 controlled↔uncontrolled switch 場景,屬 major API 擴充,非本 session scope。

### Open-pair rationale:defaultOpen + onOpenChange,無 controlled open(2026-06-12 deep-audit R2 補)

open 軸同樣只開最小 API — **uncontrolled-only**:`defaultOpen`(初始開)+ `onOpenChange`(通知 callback),無 controlled `open` prop。

**為什麼**:
- 已知需求只要「初始開 + 知道何時關」:(1) 視覺快照 — Storybook OpenSnapshot / visual-audit(M15)`defaultOpen` 一行達成;(2) DataTable cell-as-input(`DataTable/cell-registry.tsx`)— `defaultOpen` 1-step 開 calendar,`onOpenChange(false)` → cell exit edit mode
- open 跟 draft 暫存生命週期綁死:確認 commit(date-picker.tsx `handleConfirm` → `onChange` + close)/ `needConfirm=false` 選日即關 / Esc + outside-click dismiss。controlled `open` 等於把 draft-commit 時機切一半給 consumer,漏接 → draft 沒 commit / cell 卡 edit。`DatePicker.Range` 更進一步 — open + `activeEnd` 純內部編排,連 pair 都不收
- 世界級對照:Radix Popover([radix-ui.com/primitives/docs/components/popover](https://www.radix-ui.com/primitives/docs/components/popover))/ Ant Select([ant.design/components/select](https://ant.design/components/select))/ MUI Select([mui.com/material-ui/api/select](https://mui.com/material-ui/api/select/))皆提供 controlled `open` — 它們是泛用 primitive / library,必須支援任意 orchestration;本 DS 是 opinionated form control,無真實 consumer 需求前不為「可能性」付受控成本(Rule-of-3)

**若未來要開 controlled open**:同 value 軸引入 `useControllableState` helper + 測 controlled↔uncontrolled switch,屬 major API 擴充,非本 session scope。

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

**常見誤解**:(1)「用 DatePicker 選日期範圍」— 單一 DatePicker 只選一天,範圍必用 `<DatePicker.Range>`;(2)「DatePicker = Calendar」— 前者選日期、後者看事件(見上表末列);(3)「date + time 要獨立 DateTimePicker 元件」— 走 `showTime` prop,非分離元件(見「showTime」段)。

---

## DateGrid popup(本 DS 自建)

DatePicker 使用**本 DS 自建 DateGrid** + Popover 而非瀏覽器原生 `<input type="date">`。歷史變更(2026-04-19):原本遵守「不自建 calendar」禁令以保留 mobile 原生 wheel UX,但 CLAUDE.md Mindset #1 擴充後明確要求「視覺上也必須跟世界級一樣整齊」——原生 picker 視覺不受控、跨瀏覽器不一致,無法達成與 Dialog / SelectMenu / Combobox 等浮層的視覺連續性。遂改為自建 DateGrid。

**命名變更(2026-04-21)**:原 `<Calendar>` 元件改名為 `<DateGrid>`(DatePicker 內部 primitive),讓 `Calendar` 這個命名留給真正的事件檢視 canvas(對齊 Notion / Google / Apple / Ant 世界級慣例)。DatePicker 內部 primitive 以功能命名為 `DateGrid`。

### 架構

```
<div role="combobox" tabIndex={0} fieldWrapperStyles>  ← Input wrapper 外觀;用 div+role 不用 button 避免 nested-interactive
  <span>格式化的日期文字</span>
  <ItemInlineAction X />            ← 選用,clearable=true 時顯示(本身是 button)
  <CalendarIcon />                   ← 右側固定(lucide icon,視覺 affordance)
</div>
       │ 點擊 / Enter / Space 開啟
       ▼
<Popover>
  <DateGrid />                     ← react-day-picker + 本 DS token(原 Calendar)
</Popover>
```

### Cell state canonical(5 種語意視覺)

DateGrid cell 有 5 種語意視覺,每種用不同形狀/色彩語言避免混淆:

- **正常(未 hover)** — 黑字透明底(base reading state)
- **today** — 文字下方藍色底線(**非 ring circle**,避免與 hover 混淆,對齊 [Ant DatePicker](https://ant.design/components/date-picker) `today` cell underline / Google Calendar / macOS Calendar <!-- @benchmark-unverified: Google Calendar + macOS Calendar 無公開 spec URL,visual observation -->)
- **disabled** — 灰底圓圈 + 淺灰字(與 outside month 視覺略有區隔)
- **selected**(single / range 端點) — **藍底白字圓**
- **range track**(中間日期) — 灰底矩形橫條,與端點圓接縫形成連續 bar(實作層級詳 `date-grid.tsx` cell anatomy 註解)
- **hover**(未選中) — 藍圈 outline **無 fill**(非 filled 避免跟 selected 混淆)

**為什麼 selected 用 primary 非 neutral**:DatePicker 的 selected 是「**最終選定日期**」強 affordance,用 primary 顯示確定性(對齊 [Ant DatePicker selected blue fill](https://ant.design/components/date-picker) / Google Calendar / Notion Calendar 慣例 <!-- @benchmark-unverified: Google Calendar + Notion Calendar 無公開 spec URL,visual observation -->)。**對照 TimePicker 選項 selected 用 `bg-neutral-selected`**(見 `time-picker.spec.md`),因為 TimePicker panel 是「**列表選中**」語意(user 在時分選項間切換),跟 SelectMenu 同流派。兩者差異 codified 在各 spec,不互調。

**State stacking(組合狀態處理)**:
- today + selected → **selected 勝出**(藍底白字圓)
- today + range-middle → track 灰底 + underline 仍可見
- outside month → 弱化字色(不套 disabled 灰底圓,outside 只是「非當月」不是「禁選」)

其他區塊(月份 caption / Nav 按鈕 / 星期標頭)視覺層級:月份 caption 與 SelectMenu 標題同等、Nav 按鈕消費 `Button variant="text" size="xs" iconOnly`(色彩走 Button 預設 text-foreground)、星期標頭與 caption 同視覺權重(不弱化,2026-05-03 撤銷 fg-secondary)。

完整 class / token 對照見 anatomy `CalendarTokens` story。

### Spacing canonical(2026-04-21 對齊 user 附圖)

- Popover padding **四邊對稱** 12px(= `--layout-space-tight` @ md density,實作走 `p-3`)
- **左右對稱**:prev/next chevron button 中心 = 第一/最後一欄日期 cell 中心;chevron 到 popover 邊距 = 最邊欄日期到 popover 邊距 = 12px
- **上下對稱**:month caption 到 popover top 距離 = 最後一排日期到 popover bottom 距離 = 12px(均從 `p-3` 繼承)
- day cell 與 week header 尺寸 SSOT → `date-grid.spec.md:120`(消費 `--field-height-sm` token,density-aware:md=28×28 / lg=32×32)

### Typed input(Issue 10,2026-05-10 opt-in)

`typeable?: boolean`(default false)→ trigger 內渲 real `<input type="text">` 取代 `<span>`,user 可直接打字 + Calendar icon 仍開 popover(Material X DatePicker / Ant DatePicker / Notion typed-date 雙 affordance 共識)。Parser `parseDateInput(input, { allowTime })` 接 ISO YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD + native `Date.parse` fallback(RFC 'Mar 12 2026')。Partial input allow;`Enter`/`Blur` commit;`Esc` reset;IME `compositionstart/end` guard 不誤觸發。Invalid → `aria-invalid`。**v1 limits**:US `MM/DD/YYYY` vs EU `DD/MM/YYYY` ambiguous → Date.parse fallback;locale-aware format prop deferred v2;TimePicker typed input deferred(column picker UX 不同)。

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

### 結構

外層是 `fieldWrapperStyles` 容器,內含**兩個獨立 button**(start / end input,點任一個都開 Popover **並設定 activeEnd**)、中間 `ArrowRight` icon(`mx-2`,`text-fg-muted`)、右側固定 `CalendarIcon`。Active 端點視覺以 `data-active-end="true"` underline 標示(對齊 Ant RangePicker active input 視覺)。

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

- 用 `mode="single"` + 自管 `rangeModifiers`(**不**用 RDP 內建 `mode="range"`——其 click 配對邏輯與 activeEnd 衝突,見 date-picker.tsx Range DateGrid「mode='single' + manual modifiers」註解);`numberOfMonths={showTime ? 1 : 2}`(date-only Range 兩月並列對齊 [Ant RangePicker](https://ant.design/components/date-picker#rangepicker);showTime Range 1 月,對齊 Ant `multiplePanel=false` <!-- @benchmark-unverified: Airbnb / Booking 無公開 DS spec URL,visual observation -->)
- 點 date → 依 `activeEnd` 更新對應端點(start | end);auto-advance 至 end 等選
- showTime=false:兩端點都填好 → Popover **自動關閉**
- showTime=true:`needConfirm=true`(default),user 按「確定」才 commit + close
- range track 視覺由已選端點靜態算出(`rangeModifiers` 讀 committed start/end,見 date-picker.tsx `rangeModifiers` 註解);**無** hover 未選端點的預覽(RDP hover-preview 只在內建 `mode="range"` 才有,本元件刻意不用)
- Clear 按鈕清空兩端點 `onChange([null, null])`

### Range 視覺規則

- **range_start / range_end**:沿用 single selected 的視覺(藍底白字圓)
- **range middle**:灰底矩形橫條(實作層級詳 `date-grid.tsx`)
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

預設(未傳 `formatOptions` / `locale`)直接組 `YYYY/MM/DD`(locale-independent,對齊 Ant year-first;見 date-picker.tsx `formatDate` 註解);傳 `formatOptions` / `locale` 才走 `Intl.DateTimeFormat`。Display 模式(readonly / disabled / DataTable cell)與 Edit 模式 trigger 文字同一條格式化路徑,兩者一致。

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

DatePicker 套 `React.forwardRef` + `displayName`;`DatePickerProps` extends `Omit<React.HTMLAttributes<HTMLDivElement>, 'value' | 'onChange' | 'placeholder' | 'defaultValue'>`,剩餘 DOM attrs `...props` spread 到**當前 mode 的 root wrapper**(edit trigger `<div role="combobox">` / readonly · disabled wrapper div / Range wrapper div)。

**例外**:`mode="display"` 預設(未 opt-in `showDisplayEndIcon`)輸出裸 `<span>`,**不** spread `...props`——consumer 傳 DOM attrs(`data-testid` / `onFocus` 等)時注意 display 模式不生效;`className` 各 mode 皆顯式接收(套在該 mode 的 root 元素)。

**`asChild` 不支援**:trigger 是 compound(display 裸 span / edit `div role="combobox"` 不同 render tree),無單一 Slot 目標。consumer 若要自訂 trigger 視覺,改用 `<DatePicker mode="display">` + 自家 Button composition。

---

## A11y 預設

- Trigger:`role="combobox"` + `aria-haspopup="dialog"` + `aria-expanded={open}` + 必含 accessible name(`aria-label` / 或外層 `<label>` / 或 fieldCtx label)
- Popover content:`role="dialog"`;單一日期 popover 不重覆 `aria-label`(由 trigger 的 `role="combobox"` accessible name 標示),Range popover 加 `aria-label="日期區間選擇"`
- DateGrid 鍵盤:Arrow keys 切日 / PageUp/Down 切月 / Home/End 行首尾(react-day-picker v9 內建)
- Trigger 鍵盤:Space / Enter open;Esc close + focus return to trigger(Radix Popover 內建)
- Range 雙 trigger:`activeEnd` state 指向當前編輯端,`aria-expanded` 對應只當該 trigger active 時 true

---

## 驗證時機

走 Field SSOT(`Field/form-validation.spec.md`)。DatePicker 為 form control,validation 行為:

- `required` + `value=null` → submit 時 trigger error,`aria-invalid="true"` + error border
- Range mode:start > end → invalid;component 內建 `isOutOfRangeOrder` 在 picker 端視覺 disable 違序日期(activeEnd='end' 時 `date < start` disable;activeEnd='start' 時 `date > end` disable),consumer 仍應在 submit 端確保 start 先 commit 才接受 end
- Typed input(`typeable=true`):`parseDateInput` 失敗 → `aria-invalid`,blur 觸發 error message
- Validation timing:typed input → blur + submit;picker pick → onChange 即時(已選有效日期不需延遲)

## 邊界案例

- **Disabled**:Field SSOT own;resolvedMode='disabled' 走 readonly / disabled 純 wrapper 分支(無 Popover trigger、`aria-disabled`、不開 picker),文字與 Calendar icon 切 `text-fg-disabled`。顯式 `mode="display"` 永遠最優先(useResolvedFieldMode step 1,見 field-context.ts):display + disabled 同傳走 display 分支不套 disabled token;要 disabled chrome 傳 `disabled` 或 `mode="disabled"`。
- **Loading(server-rendered grid)**:DatePicker 為 sync UI 不獨立 own loading。若 consumer 場景需 async date constraint fetch(如後端 disabled-dates list),consumer 應先 disable trigger 直到 fetch 完成,或在 popover 開啟後 body 切 `<Empty icon={<CircularProgress/>}/>`(對齊 panel-body loading SSOT)。本 spec scope 內不渲 loading state。
- **Empty(no value)**:`value=null` → trigger 顯 placeholder(預設 `YYYY/MM/DD`,showTime 時 `YYYY/MM/DD HH:MM`;consumer 可傳 `placeholder` 覆寫)。無導覽目標時鍵盤焦點停留(react-day-picker v9 內建)。
- **Invalid date input**:Field validation 處理 `aria-invalid="true"` + error border + 下方 error message;DatePicker 本身不 own validation 規則。
- **極長格式化日期**:trigger 文字單行 `truncate`(ellipsis),不換行不撐高(Display / Edit / typeable / Range 雙 input 皆同)。
- **RTL**:未實作方向鏡像(trigger / Range 雙 input / DateGrid 皆以 LTR physical 方向設計);RTL 屬 DS-wide 決策,未定(與 Chip / Breadcrumb 同口徑)。
- **Dark mode / density**:走 Field + Popover SSOT 自動 adapt;DateGrid 內 cell 尺寸固定不隨 density 漂移(date grid 為密度敏感不可變區)。

---

## 相關

- `../Input/input.spec.md` — 純文字 YYYY-MM-DD（不需 picker 互動的場景）
- `../NumberInput/number-input.spec.md` — 年齡、天數等數值
- `../Field/field-controls.spec.md` — Field Control 共用規則（mode / size / endAction / error）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `calendar.spec.md`
- `date-grid.spec.md`
- `input.spec.md`
- `number-input.spec.md`
- `time-picker.spec.md`
