---
component: Calendar
family: composite
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
benchmark:
  - FullCalendar DayGrid: github.com/fullcalendar/fullcalendar/tree/main/packages/preact/src/daygrid
  - MUI X Scheduler month view: github.com/mui/mui-x/tree/master/packages/x-scheduler/src/month-view
  - Toast UI Calendar: github.com/nhn/tui.calendar
  - W3C APG Grid Pattern: www.w3.org/WAI/ARIA/apg/patterns/grid/
---

# Calendar 設計原則

> 標記:【C1】【Q6(定)】這類代號 = user 的決定,原話與選項逐字收在文末「決定來源總帳」;【總帳更正 #n】= 2026-11-24 草稿核對後 AI 依已定決定字面推出的判定(不是 user 新決定;#1–#9 原文逐字收在文末「決定來源總帳」的「總帳更正 #1–#9」表);【AI 推導】= 由既有規範或已驗證的世界級證據推出,user 可推翻。

## 定位

Calendar 是**看事件的頁面 canvas**:在一段日期範圍裡瀏覽、定位、新增事件,並在詳情浮層裡就地修改。本規格一次定**月 / 週 / 日 / 議程**四種檢視,實作分兩段 —— 第一段重做月檢視並發一版,第二段做週 / 日 / 議程【C5】。週 / 日 / 議程只寫到決策總帳已定的程度,未定的列在「待定」,不先自訂。

**實作狀態(2026-11-24)**:本規格先行。第一段合回前,元件程式仍是改寫前的樣子(每格最多 3 筆、「+N more」不可點、多日事件每格各一條、日期數字在右上等;預設語系已在 0.1.0-beta.151 改成 zh-TW,帳本 `Calendar.locale`);兩者的差異逐項列在「第一段實作範圍」,實作時逐條登記變更帳本(`../../../ds-canonical/references/props-naming.md`「相容政策」)。

**Layout Family**:**非 4-Family,屬 page-composite**(`../../patterns/element-anatomy/element-anatomy.spec.md`「Page-composite」段)。多區塊:工具列 / 格陣 / 事件列 / 「+N」清單浮層 / 事件詳情浮層,各自 own 自己的 anatomy。

**實作基礎**:自建 composite,不用 DayPicker —— DayPicker 是「選日期」的 form control primitive(`../DateGrid/date-grid.spec.md`),本元件是「看事件」的頁面版面,語意不同。消費的 DS primitive:工具列 `ChromeHeader` + `Button`(第二段加 `SegmentedControl`);清單與詳情浮層 `PopoverContent` / `PopoverHeader` / `PopoverTitle` / `PopoverBody`;詳情欄位 `Field` + `InlineEdit` + `Switch` + `DatePicker.Range` + `Select`;載入 `Skeleton`;格陣捲動 `ScrollArea`;事件列盒高讀 Tag 的 `--tag-height-md`;類別色讀 `../../tokens/categorical-color.ts`。日期運算用 `date-fns`(不自造 date math);語系、星期名與時間格式用 `Intl`。

| 元件 | 定位 | 互動模型 |
|------|------|---------|
| `<DatePicker>` | **選日期**的 form control | 點 trigger → 浮層日曆 → 選一個 → 回填欄位 |
| `<DateGrid>` | DatePicker 內部的日曆格 primitive(不直接面向 consumer) | — |
| **`<Calendar>`** | **看事件**的頁面 canvas | 在檢視裡瀏覽事件、點空白新增、點事件看詳情與就地改 |

**世界級對照從哪來**:設計系統沒有事件月曆可對照 —— Atlassian 的 calendar 只選日期(<https://registry.npmjs.org/@atlaskit/calendar/latest>)、Material 3 查到的是日期選擇器(<https://github.com/material-components/material-components-android/blob/master/docs/components/DatePicker.md>)、Fluent 2 沒有事件月曆(<https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-calendar-compat/library/README.md>)、Carbon 沒有(<https://carbondesignsystem.com/components/date-picker/usage/>)、Polaris 沒有(<https://shopify.dev/docs/api/app-home/polaris-web-components/forms/datepicker>)、Primer 連日期選擇器都沒有(<https://github.com/primer/react>)。

所以各段的對照來自事件月曆產品與事件月曆元件庫,逐項附一手來源,只引 2026-11-24 研究裡驗證成立的部分;DS 既有規範優先於外部(M23)。

---

## 四種檢視【C5】

| 檢視 | 拿來做什麼【AI 推導】 | 段 |
|---|---|---|
| 月 | 看整月分布、找某一天與空檔;每格只放摘要(開始時間 + 標題),細節在詳情浮層 | 第一段 |
| 週 | 一週的時段安排與衝突:縱向時間軸,全天 / 跨日事件在頂部一列 | 第二段 |
| 日 | 單日的時段細節(只有一欄的週檢視) | 第二段 |
| 議程 | 依時間順序列出事件,讀得到完整標題;線性閱讀 | 第二段 |

四種都有的世界級:Google Calendar 有日 / 週 / 月 / Schedule 等檢視、右上角切換(<https://support.google.com/calendar/answer/37189?hl=en&co=GENIE.Platform%3DDesktop>);new Outlook 有 Day / Work Week / Week / Month(<https://support.microsoft.com/en-us/office/change-how-you-view-your-outlook-calendar-a4e0dfd2-89a1-4770-9197-a3e786f4cd8f>);Apple 行事曆有日 / 週 / 月 / 年(<https://support.apple.com/en-au/guide/calendar/ical002/27.0/mac/27>);MUI X Scheduler 有 day / week / month / agenda,agenda 預設 12 天(<https://mui.com/x/react-scheduler/event-calendar/views/>);React Big Calendar 預設 month / week / day / agenda(<https://github.com/jquense/react-big-calendar/blob/master/src/Calendar.js>)。

- **第一段不開 `view` 參數**【AI 推導】:只有一個值的參數沒有用;第二段加上是新增、不破壞(未實作的能力不預佔 API)。
- **第二段 API 形狀**【AI 推導】:`view` / `defaultView` / `onViewChange` / `views`,與 MUI X 同名(<https://mui.com/x/react-scheduler/event-calendar/views/>)、Mantine 也用 `view` / `onViewChange`(<https://mantine.dev/llms/schedule-schedule.md>);週 / 日的時段參數與拖選新增的回呼等「待定」定案後再列。
- **不在四種裡**:年檢視、自訂天數、資源檢視、手機版面(手機版面見「窄寬度」【Q8(定)】)。

## 何時用

| 情境 | 範例 |
|------|------|
| 團隊會議 / 行程總覽 | 團隊行事曆:這個月有哪些會議、誰請假 |
| 內容發佈排程 | 社群 / 部落格的發文月曆 |
| 專案 milestone | sprint 截止日、上線日、程式碼凍結 |
| 唯讀的參考月曆 | 公司假日行事曆(日期格與事件都唯讀,新增仍走右上角「新事件」) |

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 表單裡「選一個日期」 | `<DatePicker>` | Calendar 是檢視 canvas,不是 form control |
| 表單裡「選一個日期範圍」 | `<DatePicker.Range>` | 同上 |
| 事件要依欄位排序、篩選、批次處理 | `<DataTable>` | 列表是線性瀏覽;Calendar 是依日期的空間瀏覽 |

## 常見誤解

| 誤解 | 正解 |
|------|------|
| 「Calendar 是 DatePicker 的內部格子」 | 那是 `DateGrid`;本元件是頁面上看事件的 canvas |
| 「點『+N』就是在這天新增」 | 點「+N」打開當天完整清單,不會新增 —— 事件列與「+N」都阻止點擊冒泡到格子【Q6(定)】 |
| 「今天要跟日期選擇器一樣用數字下方短線」 | 行事曆的今天用實心底【C8(定)】;同一家的選擇器與事件月曆今天長得不同是常態(見「Cell 規則」) |
| 「多日事件每一天各畫一條」 | 畫成橫跨多格的長條、換週切段【C1】 |
| 「整月沒事件要放 `<Empty>`」 | 月檢視空白就是常態,不提示【Q11(定)】 |
| 「可以先傳 `view="week"` 預留」 | 第一段沒有 `view` 參數(見「四種檢視」) |

---

## API(第一段)

```tsx
<Calendar
  referenceDate={Date}                    // 目前顯示的那個月;defaultReferenceDate / onReferenceDateChange 同慣例
  today={Date}                            // 今天標示 / 「今天」鈕 / 預設月份的同一個時間來源(可釘 SSR / 測試)
  events={CalendarEvent[]}
  onDateClick={(date) => …}               // 日期格:二擇一 —— 可點(在這天新增)
  readOnlyDates                           //   或唯讀
  eventDetail={{ onEventChange, isEditable?, actions?, renderExtra?, categories? }}  // 事件方塊:三擇一 —— 內建詳情浮層
  onEventClick={(event, { anchor }) => …} //   或產品自己開(anchor = 被點的那一列 / 那一段)
  readOnlyEvents                          //   或整個月曆的事件唯讀
  onCreateEvent={() => …}                 // 右上角「新事件」;必填、恆渲染
  renderEventTile={(event, segment) => ReactNode}
  loading                                 // 格內骨架【Q11(定)】
  hideWeekends                            // 隱藏週末,預設關【Q10(定)】
  showWeekNumbers                         // 左側週數欄,預設關【Q10(定)、Q10b(定)】
  moreListMaxHeight={number | string}     // 「+N」清單浮層的高度上限,只能往更矮調【C9】
  locale="zh-TW"                          // 預設 zh-TW【Q9(定)】
  weekStartsOn={0 | 1 | 2 | 3 | 4 | 5 | 6} // 沒傳 = 從語系推【WS(定)】
  eventTimeFormat={Intl.DateTimeFormatOptions}  // 事件開始時間的格式,預設 { hour: 'numeric', minute: '2-digit' }(見「資料語意」時間顯示)
  titleAs="h2"                            // 工具列標題層級 h1–h3
  labels={Partial<CalendarLabels>}        // 讀屏字串與檢視名稱,預設繁中、逐鍵可覆寫
  prevAriaLabel / nextAriaLabel / navAriaLabel / todayLabel / createLabel  // 既有 i18n 參數,保留
  moreLabel={(count) => string}           // 計數列文字,預設 `+N`【C6】
  className
/>
```

- `eventDetail.onEventChange(event, patch)` 必填(M23(f):沒有內建 fallback 的回呼必填);`patch` 只帶這一次改到的欄位(`title` / `start` / `end` / `allDay` / `location` / `description` / `categoryId` + `color`),時間一律是本地牆上時間字串(全天的 `end` 照舊不含);`event` = 當下 `events` 裡最新的那一筆。`isEditable(event)` 預設全部可編,`false` = 詳情照開、每一欄只能看 —— 用在看得到、但沒有權限改的那一筆:共享行事曆只有檢視權限(Google 日曆「See event details」權限,<https://support.google.com/calendar/answer/37082?hl=en>;Outlook「Can view all details」,<https://support.microsoft.com/en-us/office/share-your-calendar-in-outlook-on-the-web-7ecef8ae-139c-40d9-bae2-a23977ee58d5>)、只是受邀者且主辦人沒開放修改(Google Calendar API `guestsCanModify`「The default is False.」,<https://developers.google.com/workspace/calendar/api/v3/reference/events>)、從外部行事曆同步進來、本產品寫不回去【AI 推導】【`isEditable` 本身是 AI 推導:6c21636b(2026-11-24)寫進規格,2026-11-24 決策總帳沒有 user 原話;2026-11-26 決策卡 user 留言(問句)「這個詳情不是 就地編輯嗎？為何還會有分只能看的時候？」,看過 AI 說明(保留,即 DS 就地編輯既有的權限鎖 `../InlineEdit/inline-edit.spec.md:52`、`:126`)後點選「了解,照這樣做」】;`actions(event)` 放標題列操作位;`renderExtra(event)` 放標準欄位下方的額外欄位(同一個 FieldGroup 裡);`categories` = 類別清單 `{ id, name, color }[]`,沒傳就沒有「類別」欄【COLORFIELD(定)】。型別 `CalendarEventDetail` / `CalendarEventPatch` / `CalendarCategory` 從根出口匯出。
- **顯示用時區 `timeZone` 第二段再定,第一段不開**【AI 推導;決策總帳 2026-11-25 AI 判定(工程,照「四種檢視」的「未實作的能力不預佔 API」)】:只讓時間字跟著另一個時區、格子與「今天」照瀏覽器時區分,兩者會互相矛盾 —— 23:30+08:00 的事件在 `Asia/Tokyo` 顯示「上午12:30」,卻畫在 7/15 那格;要做就得讓格子、「今天」與時間字一起換時區(`@date-fns/tz` 要加成直接依賴,目前只是 react-day-picker 帶進來的),屬於第二段的範圍。第一段的格子、「今天」與時間字一律用瀏覽器時區(見「資料語意」時區那條)。
- 新增的名字【AI 推導】:`moreListMaxHeight` 照 `../../../ds-canonical/references/props-naming.md`「尺寸參數」的「子部位」與「上下限 `max*`」兩列推得;詳情這一批的名字過 AGENTS.md「命名 3 重 test」(① 對齊既有 DS 詞彙 ② ≥ 2 家世界級用此詞 ③ 同字在 DS 別處有沒有別義),結果如下(三題都過才採用):

  | 名字 | ① 既有 DS 詞彙 | ② 世界級 | ③ 同字別義 |
  |---|---|---|---|
  | `eventDetail` | 沿用本元件既有的 `event*` 前綴(`onEventClick` / `readOnlyEvents` / `renderEventTile`);`detail` = `../InlineEdit/inline-edit.spec.md:119`「detail pane」 | Toast UI `eventDetailPopup`(<https://github.com/nhn/tui.calendar/blob/main/apps/calendar/src/components/popup/eventDetailPopup.tsx>);Syncfusion Schedule `getEventDetails`(<https://ej2.syncfusion.com/react/documentation/api/schedule#geteventdetails>) | 無(DS 原始碼沒有別的 `eventDetail`) |
  | `onEventChange` / `CalendarEventPatch` | DS 回呼 = `on` + 名詞 + `Change`(`onOpenChange` / `onValueChange`);patch 只帶改到的欄位 | FullCalendar `eventChange`「Called after an event has been modified in some way.」(<https://fullcalendar.io/docs/eventChange>);JSON Merge Patch 的「只送改到的欄位」(RFC 7396,<https://www.rfc-editor.org/rfc/rfc7396>) | 無 |
  | `isEditable` | 與 InlineEdit `editable` 同義(能不能改);函式形加 `is` | FullCalendar `editable`「Determines whether the events on the calendar can be modified.」(<https://fullcalendar.io/docs/editable>);MUI X `isCellEditable`「define which individual cells the user can edit」(<https://mui.com/x/react-data-grid/editing/>) | 無 |
  | `CalendarCategory` / `categories` / `categoryId` | DS 沒有既有的「類別」API 型別;`*Id` 指向清單裡的一筆 = Select `value` 存 id 的同一種寫法 | Outlook `outlookCategory`(名稱 + 顏色的主清單,<https://github.com/microsoftgraph/microsoft-graph-docs-contrib/blob/main/api-reference/v1.0/resources/outlookcategory.md>);Google 行事曆 API 事件的 `colorId`「This is an ID referring to an entry in the `event` section of the colors definition」(<https://developers.google.com/workspace/calendar/api/v3/reference/events>) | 無:DS 元件沒有叫 `category` 的參數;原始碼裡的 `category` 只見於範例資料(`stories-helpers/data/product-catalog.ts` 的商品類別,同義)與治理用的元件分類表 |
  | `labels.detail*`(十個鍵:`detailClose` / `detailTitle` / `detailTime` / `detailAllDay` / `detailLocation` / `detailLocationPlaceholder` / `detailDescription` / `detailDescriptionPlaceholder` / `detailCategory` / `detailCategoryPlaceholder`) | 本元件 `labels` 既有寫法 = 部位前綴 + 名詞(`moreListClose`);`*Placeholder` = Field 家族既有參數名 | 字串鍵不是對外概念名,② 以 DS 內既有 `labels` 寫法為準(本表第一欄) | 無:`close` / `title` 這類單字在 DS 有別的意思,所以一律帶 `detail` 前綴,不收裸字 |

### 日期格與事件方塊:可點或唯讀

日期格(點一下 = 在這天新增)與事件方塊(點一下 = 打開事件)是**兩個獨立的點擊目標**,各自在型別層擇一(discriminated union):

| 目標 | 選項 | 結果 |
|---|---|---|
| 日期格 | `onDateClick`(必填) | 整格可點、手形游標、滑過不變色【CELL-HOVER(定)】;日期數字是 `<button>`(Enter / Space → `onDateClick`) |
| 日期格 | `readOnlyDates`(不可以傳 `onDateClick`) | 整格不是點擊目標、日期數字是一般文字、游標不變(箭頭);鍵盤停靠點改為格子本身(見「A11y 預設」) |
| 事件方塊 | `eventDetail` | 點了開內建詳情浮層(見「事件詳情浮層」) |
| 事件方塊 | `onEventClick` | 點了呼叫產品的回呼,多帶 `{ anchor }` = 被點的那一列 / 那一段【總帳更正 #4】 |
| 事件方塊 | `readOnlyEvents` | 方塊不可點、不亮、不是按鈕、沒有詳情;截斷時仍有完整標題提示 |
| 單筆事件 | `CalendarEvent.readOnly` | 同上一列,只作用在這一筆(例:假日)【AI 推導:原本唯讀只能整個月曆一起設,假日要「單筆唯讀、其他可點」】 |

- **為什麼擇一、不是可省略**:元件沒有內建的「新增」行為(不自動開表單);回呼若可省略、又拿「有沒有傳」決定長相,忘了傳的 consumer 會得到看起來能點、點了沒反應的月曆 —— M23(f) 禁的就是這件事。
- **為什麼要有唯讀**:沒有「點日子新增」的月曆(新增走右上角、純看的假日行事曆)若照樣整格手形游標、日期照樣是按鈕,就是「看起來能點、點了沒反應」。只有「點了會有反應」的地方才是手形、才有底色的滑過回饋(`../../../ds-canonical/references/hit-area-canonical.md`「一、可以操作的東西」第 3 條、第 5 條、「四、其他東西滑過不變」)。
- **命名**:沿用 DS 的 `readOnly` 語彙(`../Rating/rating.tsx` 的 `readOnly`、Field 家族的 readonly 模式),加上作用對象。世界級同語意:[MUI X `FormProps.readOnly`](https://github.com/mui/mui-x/blob/v9.14.0/packages/x-date-pickers/src/internals/models/formProps.ts#L8-L13)(「When read-only, the value cannot be changed but the user can interact with the interface.」)、[React Aria `useCalendarCell.ts#L207-L212`](https://github.com/adobe/react-spectrum/blob/4dd44e0f400636a87a9ad4390903e78c5ae6113c/packages/react-aria/src/calendar/useCalendarCell.ts#L207-L212)(唯讀時按下只移焦點,格陣導覽照常)。
- **`onCreateEvent` 也必填,而且沒有唯讀版本**:右上角「新事件」是全域新增入口、工具列的固定元素、恆渲染,與日期格 / 事件方塊可不可點無關;哪些日期不能新增由新增流程自己擋【維持 U1】。
- **唯讀事件與「詳情只能看」是兩件事**:`readOnlyEvents` / `readOnly` = 沒有詳情可開;`eventDetail.isEditable(event) === false` = 詳情照開、每個欄位只能看【`isEditable` 是 AI 推導,出處見「API(第一段)」`eventDetail` 那條】(MUI X Scheduler 官方文件原句「Events with `readOnly: true` (or belonging to a read-only resource) open the dialog in view-only mode.」,<https://mui.com/x/react-scheduler/event-calendar/editing/>;2026-11-26 前這裡引的 `dialog-utils.ts` 只有算浮層位置的 `calculatePosition`、沒有唯讀邏輯,出處不實,已換)。

### CalendarEvent

```tsx
interface CalendarEvent {
  id: string
  title: string
  start: string | Date        // "YYYY-MM-DD"(只有日期)或 "YYYY-MM-DDTHH:mm"(本地時間)或帶 offset / Z 的絕對時間
  end: string | Date          // 一律「不含」(見「資料語意」)
  allDay?: boolean
  color?: CategoricalColor    // 12 類別色相 + 'neutral'(與 Tag / Avatar 共用,型別在 categorical-color.ts);neutral 的長條 / 滑過 / 色條在同檔 CAT_EVENT_NEUTRAL
  location?: string           // 詳情的「地點」
  description?: string        // 詳情的「說明」
  categoryId?: string         // 詳情的「類別」= eventDetail.categories 裡某一個的 id【COLORFIELD(定)】
  readOnly?: boolean          // 只有這一筆唯讀
  metadata?: Record<string, unknown>  // 自由資料,renderEventTile 讀
}
```

沒傳 `color` 時用 blue(現況預設)。重複事件不在資料模型裡【AI 推導】:產品先展開成一筆筆事件再傳入。

## 資料語意【AI 推導,除非另標】

- **`end` 一律不含**:全天與有時段都一樣,與 iCalendar 相同 ——「The "DTEND" property for a "VEVENT" calendar component specifies the non-inclusive end of the event.」(RFC 5545 §3.6.1,<https://www.rfc-editor.org/rfc/rfc5545#section-3.6.1>)。例:`start: '2026-07-20', end: '2026-07-23'` = 20、21、22 三天。開發期偵測到全天事件 `end === start`(多半還在用「含」的資料)時警告。
- **什麼算跨日長條**【Q7(定)】:標全天(一天或多天)或有時段且**滿 24 小時** → 長條;有時段、未滿 24 小時(含過夜,例 22:00 – 01:00)→ 只畫在開始那天,詳情顯示完整區間。Google Calendar 同:過夜不滿 24 小時只畫在開始那天、詳情顯示完整區間(<https://calendar.google.com/calendar/embed?src=3haig2m9msslkpf2tn1h56nn9g%40group.calendar.google.com&mode=MONTH&dates=20261201%2F20261228&ctz=UTC&hl=en>)。
- **只有日期、沒寫 `allDay`** → 當全天(有時段的長相要顯示時間,只有日期的事件沒有時間可顯示);明寫 `allDay: false` 照舊。
- **午夜結束**(22:00 – 隔天 00:00):`end` 不含,所以只畫在開始那天;不可把「午夜結束」當成全天。
- **時區**:帶 offset 或 `Z` = 絕對時間;不帶 offset 的時刻 = 本地時間;只有日期 = 不帶時區的「那一天」。第一段的格子、「今天」與時間字一律用瀏覽器時區;顯示用時區參數 `timeZone` 第二段再定(見「API(第一段)」下方那條)。逐日計算一律用日曆日(`date-fns` `addDays`),不用「+ 86400000 毫秒」(日光節約那天會錯一天);「滿 24 小時」用實際時間差判。
- **異常資料**:`start` 晚於 `end` → 當成開始那一刻的零長度事件畫在開始那天,開發期警告。
- **時間顯示**:月格只顯示**開始時間**,詳情顯示完整起訖;預設 `Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' })`(zh-TW「上午10:00」、en-US「10:00 AM」),`eventTimeFormat` 可覆寫(傳了就整份取代預設、不合併;同名參數 FullCalendar `eventTimeFormat`,<https://fullcalendar.io/docs/eventTimeFormat>)。畫在哪【AI 推導】:有時段事件的標題前;滿 24 小時的有時段長條只在含真起點的那一段(`segment.isStart`)標題前;全天不畫;窄寬時都不畫(「窄寬度」(1))。事件的讀屏名稱用同一個格式(「A11y 預設」事件列)。詳情時間欄的時間也用同一份(`eventTimeFormat` 或預設),同一個畫面只有一種時間寫法(見「事件詳情浮層」時間欄)【AI 推導】。【DATE-TIME(定)2026-11-26:時間 12 / 24 跟語系(CLDR:zh-TW、en-US 12 小時,en-GB 24 小時)、用既有參數覆寫(本元件 = `eventTimeFormat`)—— 月格預設本來就是這樣,2026-11-26 起與 DatePicker / TimePicker 讀同一份常數(`../DatePicker/range-format.ts` `DEFAULT_TIME_FORMAT_OPTIONS`);數字日期一律補零、不給補零開關 —— 詳情時間欄 2026-11-26 已實作(見「事件詳情浮層」時間欄)】
- **語系**【Q9(定)】:`locale` 預設 `'zh-TW'`(Calendar / DatePicker / TimePicker 同一批改);標題、星期名、時間格式都跟 `locale` 走。
- **週起始日**【WS(定)】:`weekStartsOn` 是本元件自己的參數,有傳就用;沒傳時從語系推,來源一律 `Intl` 的 CLDR 週資料(zh-TW 週日、zh-CN 週一)—— 不讀 `date-fns` 語系物件(`date-fns` 的 zh-TW 是週一,與 CLDR 不同【總帳更正 #2】)。同一條規則管日期選擇器與表格「本週」篩選(總帳 WS(定))。世界級同派(元件參數優先、沒給才從語系的 CLDR 推):React Aria(<https://react-aria.adobe.com/Calendar>、<https://github.com/adobe/react-spectrum/blob/main/packages/@internationalized/date/src/queries.ts>)、Atlassian(<https://atlassian.design/components/calendar/code>、<https://unpkg.com/@atlaskit/locale@5.5.0/dist/es2019/internal/localization-provider/get-week-info.js>)、MUI X Scheduler(<https://mui.com/x/react-scheduler/event-calendar/localization/>)。`Intl` 的 weekInfo 不支援時要有後備表(實作時查)。

## 外殼(四種檢視共用)【AI 推導:既有規則落地,除非另標】

起因:user 問(逐字,問句,不是決定)「行事曆應該一整個像是一個 table 元件用邊框圈出範圍嗎？ 若是的話，那其上下左右是否也應該要保留邊距？我看分割畫面側欄的範例沒有保留下邊距 此外我也好奇世界級的設計是如何畫這個元件的邊？或是如何定義它的邊」。查證結果:外框早就有、與 DataTable 同一套,缺的是這一段規格與根節點的邊緣標記;本段只把既有規則寫下來,元件畫面不變(2026-11-26)。

- **長相**:根節點 `bg-surface rounded-md border border-divider overflow-hidden` —— 一圈 1px 淡框加圓角,工具列與檢視內容都在框裡。與 DataTable 外框同一套(`../DataTable/data-table.tsx` `dataTableVariants`:`bg-surface rounded-md overflow-hidden` + 預設 `border border-divider`)。
- **為什麼要框**:與 DataTable 同一個理由 ——「邊框標記「這裡有使用者看不到的內容」」(`../DataTable/data-table.spec.md:193`)。容器比「週數 × 格最小高」矮時格陣區會捲動(「Cell 規則」每一週等高那條),框就是捲動範圍的邊界。目前沒有拿掉外框的參數;放進本身已有框的容器、要避免框中框時再議(DS 先例 DataTable `bordered`,`../DataTable/data-table.spec.md:195`),第一段不開。
- **工具列在框裡**(與 DataTable 唯一的差別):DataTable 的工具列是外部組合、放在框外(`../DataTable/data-table.spec.md:669`「Toolbar 不內建在 DataTable 裡——toolbar 是外部組合，職責分離」);月曆的工具列是元件的固定元素(見「工具列」),放在框裡、不畫底色,坐在外殼的 `bg-surface` 上 = 巢狀 chrome(`../../patterns/header-canonical/header-canonical.spec.md:111` Nested chrome header 那一列「transparent(不傳 bg className,繼承 parent)」),與格陣之間用 ChromeHeader 自己的底線分開。
- **最外圈格線交給外框**:每一週最右那格不畫右線、最後一週不畫下線,那一條由外框當(`calendar.tsx` 格子 class 的註解「最後一週不畫下線 —— 根節點外框已經是那一條,兩條疊成 2px 雙線(稽核 D6)」)—— 與 DataTable「加框時最後一行底線去掉，避免與外框 double border」同一條(`../DataTable/data-table.spec.md:195`)。
- **格陣貼齊外框**:格陣區(星期列與週列)左、右、下三邊不留內距,格子直接貼到框線;格內的空隙由格子自己的內距給(見「間距」)。只有工具列有自己的內距(ChromeHeader)。
- **四周距離:元件不帶外距,由容器給**:同一段距離只由一層給 ——「容器給內距,元件不再加外距去推容器」(`../../tokens/layoutSpace/layoutSpace.spec.md:154`)。左右 = `loose`(同檔 `:95`「任何內容左右 padding 最終 = `loose`」);底:月曆是有完整外框的 bounded region → 容器底 = `loose`(同檔 `:161`)。容器認得出這一點,靠根節點的邊緣標記 `data-layout-region="bounded"`(同檔 `:156`「元件根部宣告自己的邊緣 `data-layout-region="bounded"`(有完整外框:表格 / 卡片 / 面板)」;與 DataTable 外框同一個標記)—— 放進 DialogBody / SheetBody 這類會自己給上下內距的容器、又是最後一塊時,底自動 = `loose`,不是一般元素的 `bottom` 48(`../../tokens/layoutSpace/layoutSpace.css`)。上方沒有標頭時規格沒寫,範例照 `loose` 給。範例外層一律 `p-[var(--layout-space-loose)]`(一般密度 16 / 大密度 24,同檔 `:11`)。機械:`scripts/layout-body-edges-invariant.mjs` —— 全部 story 驗標記實不實(標 bounded 就要量得到完整外框);`--selftest` κ 把月曆範例的外層改成 `data-layout-body="fill"` 的容器,量到底 = `loose`,對照組拿掉標記 → 底 48、紅「缺標記」。
- **世界級的三種畫法**(背景;DS 照上面的 DS 規則,M23):
  - 甲 框只圍格子區、工具列在框外 —— React Big Calendar 月檢視 `.rbc-month-view { position: relative; border: 1px solid #ddd;`(<https://unpkg.com/react-big-calendar@1.19.4/lib/css/react-big-calendar.css>);MUI X Scheduler 月檢視外層 `borderRadius: theme.shape.borderRadius,` + ``border: `1px solid ${(theme.vars || theme).palette.divider}`,`` + `overflow: 'hidden',`(<https://github.com/mui/mui-x/blob/542cd5511402a67693008684a6d00a22c977a014/packages/x-scheduler/src/month-view/MonthView.tsx#L32-L45>);FullCalendar v6 格子區外框由 `.fc-scrollgrid` 本身(上、左)與區段格(右、下)拼成 —— `.fc-theme-standard .fc-scrollgrid{border:1px solid var(--fc-border-color)}` 再 `.fc .fc-scrollgrid{border-bottom-width:0;border-collapse:separate;border-right-width:0}`,`.fc-theme-standard td,.fc-theme-standard th{border:1px solid var(--fc-border-color)}` 再 `.fc .fc-scrollgrid-section>*{border-left-width:0;border-top-width:0}`;內層格子表把最外圈藏起來 `.fc .fc-scrollgrid table{border-left-style:hidden;border-right-style:hidden;border-top-style:hidden}`、`.fc .fc-scrollgrid-section-body table,.fc .fc-scrollgrid-section-footer table{border-bottom-style:hidden}`(<https://unpkg.com/@fullcalendar/core@6.1.19/index.global.js>)。
  - 乙 框連工具列一起圍(DS 屬這一派)—— Syncfusion Schedule 根節點 `.e-schedule { background: #fff; border: 1px solid rgba(0, 0, 0, 0.12); }`(<https://unpkg.com/@syncfusion/ej2-schedule@31.1.17/styles/material.css>);FullCalendar v7 breezy 主題工具列與格子區分段畫框、拼成一圈 `border-radius: 8px` 的框(<https://unpkg.com/fullcalendar@7.1.5/themes/breezy/theme.css>)。
  - 丙 不畫外框、只畫格線 —— Toast UI Calendar 外層 `.toastui-calendar-layout { box-sizing: border-box; position: relative; white-space: nowrap; }`、月檢視 `.toastui-calendar-layout.toastui-calendar-month { height: 100%; }`,都沒有框(<https://unpkg.com/@toast-ui/calendar@2.1.3/dist/toastui-calendar.css>)。
  - FullCalendar v7 把外框做成選項 `borderless`「Removes all outer borders from the calendar.」,「Boolean, default: `false`」(<https://fullcalendar.io/docs/borderless>)。

## 工具列(四種檢視共用)【AI 推導,除非另標】

- **`<ChromeHeader>`**:「固定在版面上的工具列」= 常駐 chrome(`../../patterns/header-canonical/header-canonical.spec.md:26`),固定高 48(一般密度)/ 56(大密度)(同檔 `:68`);裡面所有控件一律 `sm`(同檔 `:73`)。工具列不畫底色,坐在 Calendar 自己的底上。
- **排法**:左 =〔‹〕〔今天〕〔›〕+ 期間標題;右 =〔檢視切換(第二段)〕〔+ 新事件〕。標題在左、按鈕靠右(`../../patterns/action-bar/action-bar.spec.md:109`),primary 在業務層最右(同檔 `:121`)。
- **標題**:`text-body-lg font-medium`(`header-canonical.spec.md:100`);截斷才顯完整文字提示(消費 `<TruncatedText>`);層級由 `titleAs` 指定(預設 `h2`)。月檢視標題 = `Intl` `{ year: 'numeric', month: 'long' }`(zh-TW「2026年7月」)。
- **‹ › 與「今天」**:月檢視 ±1 個月;「今天」跳到今天所在的月,鍵盤停靠點落在今天。週 / 日 / 議程各自的跳幅與標題格式在第二段定(議程的天數屬「待定」Q13)。
- **「新事件」**:`<Button variant="primary" startIcon={Plus}>`,全域新增入口、恆渲染、`onCreateEvent` 必填、文字由 `createLabel` 換【維持 U1】。
- **檢視切換(第二段)**:`SegmentedControl` `sm`,放「新事件」左邊 —— DS 已明列「Filter / toolbar 的分段切換:…日 / 週 / 月」(`../SegmentedControl/segmented-control.spec.md:47`);四種檢視共用同一條工具列、切的是內容不是整塊容器,所以不是 Tabs(同檔 `:57`)。只開一種檢視時不畫(看 `views` 有幾個,不是看回呼有沒有傳)。窄寬時不換成下拉。不內建單字母快捷鍵(會與產品自己的快捷鍵打架;產品要做就用 `onViewChange` / `onReferenceDateChange` 接)。

## 月檢視

### Anatomy

```
┌ 工具列(ChromeHeader)──────────────────────────────────────┐
│ [‹][今天][›] 2026年7月                            [+ 新事件] │
├──┬─────┬─────┬─────┬─────┬─────┬─────┬─────┤ ← 星期列(格陣第一列,置中)
│週│ 週日 │ 週一 │ 週二 │ 週三 │ 週四 │ 週五 │ 週六 │
├──┼─────┴─────┴─────┴─────┴─────┴─────┴─────┤
│27│ (5)  ← 日期框 24,左上                          │ ← 每一週等高
│  │ ████ 跨日長條(車道 0,可橫跨多格)████            │
│  │ ▍上午10:00 設計審查 ← 有時段:無底 + 色條 + 時間 + 標題│
│  │ +3               ← 放不下時最後一列換成「+N」       │
└──┴───────────────────────────────────────────┘
```

週數欄(最左一欄)選用、預設關。

### Cell 規則

- **格子是非互動容器**:`role="gridcell"`,格內有日期鈕、事件列、「+N」各自的目標(button 語意禁互動後代)【維持 U4】。
- **日期數字在左上**【C10(改)】:今天的實心底與 1 號的「7月1日」一起在左上。這是 user 的可讀性判斷;研究查不到任何來源寫過「數字置左或置右」的理由,數字在左上的事件月曆有 Mantine(<https://github.com/mantinedev/mantine/blob/master/packages/@mantine/schedule/src/components/MonthView/MonthView.module.css>)、Toast UI(<https://unpkg.com/@toast-ui/calendar@2.1.3/dist/toastui-calendar.css>)、Syncfusion(<https://unpkg.com/@syncfusion/ej2-schedule@31.1.17/styles/material.css>)、FullCalendar v7 breezy / forma 主題(<https://unpkg.com/fullcalendar@7.1.5/themes/breezy/index.js>),只當背景。
- **今天 = 實心底**【C8(定)】:日期框 `bg-info text-on-emphasis`(`--info`,不得改用 `--primary` 家族,`scripts/status-color-invariant.mjs` 守)【維持 U12】;讀屏見「A11y 預設」。事件月曆今天用實心的:MUI X 實心圓角方塊(<https://github.com/mui/mui-x/blob/master/packages/x-scheduler/src/month-view/month-view-row/MonthViewCell.tsx#L53-L109>)、Mantine 實心圓(<https://github.com/mantinedev/mantine/blob/master/packages/@mantine/schedule/src/components/MonthView/MonthView.module.css#L76-L131>)、Google Calendar 藍色實心圓(<https://workspaceupdates.googleblog.com/2024/10/new-look-and-feel-and-dark-mode-google-calendar.html>)、Apple 行事曆紅色實心圓(官方截圖是週檢視,<https://support.apple.com/guide/calendar/icl1010/mac>)、Notion 資料庫月曆紅色實心圓(<https://www.notion.com/help/calendars>)。**同一家的日期選擇器與事件月曆今天長得不同是常態**:MUI(<https://github.com/mui/mui-x/blob/master/packages/x-date-pickers/src/PickerDay/PickerDay.tsx#L93-L141>)、Ant Design(<https://github.com/ant-design/ant-design/blob/5d2ba41768697a3bc8912e9ab84590db44dc9b4c/components/calendar/style/index.ts#L133-L218>)、Mantine(<https://github.com/mantinedev/mantine/blob/master/packages/@mantine/dates/src/components/Day/Day.module.css#L58-L109>)—— 所以 `../DateGrid/date-grid.spec.md` 的今天短線不動。日後行事曆加「選取日期」時,選取的樣子**不得**與今天的實心底相同(待定 Q14b)。
- **每月 1 號帶月份**【Q15(定)】:每月 1 號(含前後月溢出的那幾格)顯示 `Intl` `{ month: 'short', day: 'numeric' }`(zh-TW「7月1日」);今天剛好是 1 號時實心底包住整段字。窄到拿掉時間時只顯示「1」【總帳更正 #8】。讀屏名稱不受影響。世界級:Google Calendar「Nov 1」(<https://calendar.google.com/calendar/embed?src=j7gov1cmnqr9tvg14k621j7t5c%40group.calendar.google.com&src=3haig2m9msslkpf2tn1h56nn9g%40group.calendar.google.com&mode=MONTH&dates=20261101%2F20261128&ctz=UTC&hl=en>)、MUI X 1 號顯示「月 日」(<https://github.com/mui/mui-x/blob/master/packages/x-scheduler/src/month-view/month-view-row/MonthViewCell.tsx>)、Notion 資料庫「Feb 1」(<https://www.notion.com/help/calendars>)、Trello「Jun 1」(<https://support.atlassian.com/trello/docs/calendar-view/>)。
- **非當月格**:只用淡字(日期數字 `fg-muted`),**不加底色** —— 非當月格與當月格可點性相同(一樣手形游標、滑過一樣不變色、點了一樣在那天新增),disabled 字色與 `bg-muted`(「不可操作」的底,`../../tokens/color/color.spec.md`「Static Subtle Background」)留給真的不能操作的東西【維持 U3】。
- **星期列**:是格陣的第一列(每格 `role="columnheader"`,見「A11y 預設」);文字**置中**【C10(改)】;字樣 `text-foreground text-body font-medium` 維持【P6,總帳更正 #6】;灰底條 `bg-muted` 維持現狀(沒有證據顯示是問題,【總帳更正 #9】)。內距【AI 推導,預覽時回報 user】:每格四邊 = 格子內距 4,內容盒高 = 列高單位 24(`h-tag-md`,字在盒內垂直置中)→ 列高 = 4 + 24 + 4 = 32,與日期列同一個列高單位,不跟字型行高走(「間距」表沒有列到這一格;改前寫死 `px-2 py-1.5`,列高 33)。星期列不跟週列捲、不做 sticky:`--muted` 是半透明,捲過去的內容會從灰底透出來。
- **週末不加底**【Q10(定)】(Google Calendar 週末無底色,<https://calendar.google.com/calendar/embed?src=j7gov1cmnqr9tvg14k621j7t5c%40group.calendar.google.com&src=3haig2m9msslkpf2tn1h56nn9g%40group.calendar.google.com&mode=MONTH&dates=20261101%2F20261128&ctz=UTC&hl=en>)。假日由產品傳入**單筆唯讀的全天事件**,不做特殊日期樣式。
- **隱藏週末 `hideWeekends`**【Q10(定)】:預設關;開了以後那兩欄不畫。【AI 推導】「週末」= 語系的週末(`Intl` weekInfo);只落在週末的事件不畫;跨過週末的長條在週五收、週一起,兩端直角(「跨日長條」);車道只用看得見的日子分配,只在週末的事件不佔車道(否則平白多出「+1」);週末由 `lib/date-locale.ts` `resolveWeekend(locale)` 給(zh-TW 週六日、en-IL 週五六),星期列同步拿掉那幾欄;鍵盤跳過被藏的日子,落點規則見「A11y 預設」鍵盤表。世界級:Notion Calendar 可選顯示週末(<https://www.notion.com/help/notion-calendar-settings>)、MUI X 可藏週末(<https://github.com/mui/mui-x/blob/master/packages/x-scheduler/src/month-view/month-view-row/MonthViewCell.tsx>)、FullCalendar `weekends`(<https://github.com/fullcalendar/fullcalendar/blob/main/packages/preact/src/themes/classic/index.tsx>)、Mantine(<https://github.com/mantinedev/mantine/blob/master/packages/@mantine/schedule/src/components/MonthView/MonthView.module.css>)。
- **週數欄 `showWeekNumbers`**【Q10(定)、Q10b(定)、WEEKNUM-BOX(定)】:預設關;左側獨立窄欄。**週數格與日期格同一套結構**【WEEKNUM-BOX(定)】:格子內距 4、週數放在與日期框同一個 24 寬的框裡(高 24、寬至少 24,`h-tag-md` / `min-w-tag-md`,週數在框內置中),框離格左 4、離格頂 4,與日期框相同;欄寬 = 格子內距 4 + 框 24 + 格子內距 4 + 格線 1 = 33(數值見「間距」週數欄寬列)→ 週數與日期離格線用同一套算法(格子內距 4 + 在 24 的框裡置中;兩位數週數離格線約 7.3,日期數字是比例字寬,依字形差零點幾 px)。起因:user 問「你確定目前 calendar 週數欄位的寬度是取決於最大週數的寬度加上左右邊距？然後左右邊距跟日期距離左邊的邊距是一樣的？」—— 實量不是:原本欄寬 = 2 × 4 + `2ch`(Q10b 的「格子左內距 × 2 + 最寬週數」),週數左右各約 3.6,日期數字卻因為放在 24 的框裡置中、離格線約 7.2。選項由 AI 提,user 選「跟日期格同一套 (Recommended)」並回「所以現在日期已經放在24*24格子裡了？若是的話，照你建議」(已確認日期框就是 24 × 24)。週數 `text-body` 一般字重 `text-fg-secondary`、等寬數字【Q10b(定),不變】;欄頭「週」(`labels` 可換)`text-body` 一般字重 `text-fg-secondary`、上下左右置中。週數格的格線與日期格同一套(右 / 下各一條、最後一週不畫下線),星期列的灰底條延伸到欄頭「週」【AI 推導】。第一段不可點,第二段點了切到該週的週檢視。第一週怎麼算跟語系走,資料來源由工程定(`Intl` weekInfo 沒有「第一週最少幾天」,不得自編規則)—— 定為 CLDR `minDays`(`lib/date-locale.ts` `resolveFirstWeekMinDays`),週數 = 該週第一天的 `date-fns` `getWeek`、週起始日用本元件解析後的那一個【AI 推導】:2026 年底那一週(含 2027-01-01)en-GB 是第 53 週、en-US 與 zh-TW 是第 1 週。欄寬實作 = `calc(2 × --calendar-gap + --tag-height-md + --calendar-grid-line)`(三項都讀既有的值,不寫死數字;`calendar-geometry.ts`),週數框與日期框讀同一個盒樣式;星期列與週列讀同一個欄設定【AI 推導】。世界級:MUI X 左側獨立 28px 欄、欄頭「W」、不可點(<https://github.com/mui/mui-x/tree/master/packages/x-scheduler>),第一週依 CLDR(<https://github.com/mui/mui-x/tree/master/packages/x-scheduler-internals>);Syncfusion 左側 36px 欄、欄頭空白、不可點(<https://help.syncfusion.com/scheduler-sdk/react/schedule/views>);Mantine 左側 42px 欄、點了切週檢視(<https://mantine.dev/schedule/month-view/>);Outlook 官方說週數在月檢視的左邊界、預設關(<https://support.microsoft.com/en-US/outlook/calendar/turn-on-or-off-week-numbers-in-month-view-and-the-date-navigator-for-outlook>);FullCalendar 開 `navLinks` 時點週數切週檢視(<https://fullcalendar.io/docs/weekNumberCalculation>)。
- **每一週等高**【C3】:週列平分格陣高度,格高不被內容撐高(MUI X 週列 `minmax(0,1fr)`,<https://github.com/mui/mui-x/blob/master/packages/x-scheduler/src/month-view/MonthView.tsx>)。月有幾週就畫幾週(4–6 列)。【AI 推導】格最小高 = 上內距 + 日期框 + 日期到第一列 + 一列 + 下內距 + 格線(4 + 24 + 4 + 24 + 4 + 1 = 61,至少看得到完整的一列或「+N」、下內距完整 4;格子的底線畫在格高裡面,不算進去時內容只剩 59);**事件列不被壓扁**:格子比內容矮時,放不下的列由格子裁掉,看得到的列一律高 24(放幾列見「每格筆數」);容器比「週數 × 格最小高」還矮時,格陣區在 Calendar 殼裡用 `ScrollArea` 捲動,工具列與星期列不捲;最後一週的格子不畫底線(避免與外框疊成雙線)。
- **滑過**【CELL-HOVER(定)】:日期格可點時**滑過不變色**,只有手形游標告訴你「點了在這天新增」—— 依據 `../../../ds-canonical/references/hit-area-canonical.md`「一、可以操作的東西」第 2 條「點得到的地方不一定要有樣式變化。〔user N50〕」與第 3 條(點得到 → 手形);user 2026-11-26 第五輪決策卡點選「A:拿掉日期格的滑過底色,只留手形游標」(選項由 AI 擬)。三件事照舊、不能少:(1) 手形游標蓋滿整格(格內空白、日期鈕;第 3 條);(2) 鍵盤焦點框照舊(日期鈕走全域 `:focus-visible`,見「焦點框」);(3) 格內可點的事件列 / 長條 / 「+N」照舊有自己的滑過,瞬間切換、不做過渡【維持 U2】(第 1 條:畫面有變化的地方按下去都要觸發它)。`readOnlyDates` 時游標不變(箭頭)。2026-11-26 前整格滑過上 `--neutral-hover`(2026-04-21 首版 86c5436c 由 AI 放入、沒有出處,之後沒有一列決定過它)。只管月檢視的日期格,不延伸到其他格狀元件或日後有時段的週 / 日檢視(換一類東西要重新查證,meta-patterns M8「跨類別外推本身就是新主張」)。世界級:事件月曆的空白格多數滑過沒有底色 —— FullCalendar v7 經典主題格子只有今天 / 停用的底(<https://raw.githubusercontent.com/fullcalendar/fullcalendar/v7.1.5/packages/preact/src/themes/classic/index.tsx>)、Toast UI(<https://raw.githubusercontent.com/nhn/tui.calendar/main/apps/calendar/src/css/daygrid/dayGrid.css>)、React Big Calendar(<https://raw.githubusercontent.com/bigcalendar/react-big-calendar/master/src/sass/month.scss>)、MUI X(格子只有鍵盤焦點底色,<https://raw.githubusercontent.com/mui/mui-x/master/packages/x-scheduler/src/month-view/month-view-row/MonthViewCell.tsx>)、Kendo(<https://raw.githubusercontent.com/telerik/kendo-themes/develop/packages/core/scss/components/scheduler/_theme.scss>)、SAP OpenUI5(只有已選取的格子有滑過,<https://raw.githubusercontent.com/SAP/openui5/master/src/sap.m/src/sap/m/themes/base/SinglePlanningCalendarMonthGrid.less>);有底色的是 Syncfusion(<https://cdn.jsdelivr.net/npm/@syncfusion/ej2-schedule@31.2.15/styles/schedule/_theme.scss>)與 DevExtreme(<https://raw.githubusercontent.com/DevExpress/DevExtreme/main/packages/devextreme-scss/scss/widgets/generic/scheduler/_index.scss>)。沒有一家把不做的理由寫成文字。
- **命中區**【Q6(定)、總帳更正 #3】:滑過有樣式變化的位置,按下去就必須觸發它(`../../../ds-canonical/references/hit-area-canonical.md`「一、可以操作的東西」第 1 條);日期格本身滑過不變,它的訊號是手形游標 —— 手形的範圍 = 命中區(格內空白與日期鈕是手形、點了在這天新增;唯讀的列與長條是箭頭、點了什麼都不發生)。

| 位置 | 點了 | 滑過 / 游標 |
|---|---|---|
| 可點的事件列 / 長條 | 開詳情(或呼叫 `onEventClick`);**阻止冒泡** | 自己的配對(淡底 step-1 → step-2;透明列 → `--neutral-hover`,`color.spec.md`「Hover 換色配對總則」);格子不變;手形 |
| 「+N」 | 開「+N」清單浮層;**阻止冒泡** | `--neutral-hover`;格子不變;手形 |
| 唯讀事件列 / 唯讀長條 | **阻止冒泡,什麼都不發生**(不開詳情、不新增) | 自己不亮、格子不變;**箭頭**(蓋掉格子的手形) |
| 日期數字鈕 | `onDateClick`(在這天新增) | 自己不亮、格子不變;手形(它是同一個目標的鍵盤入口,不是第二個目標:沒有自己的滑過、底色透明、完全落在格內;24 的框是列高,不是最小點擊尺寸 —— DS 不採觸控尺寸建議,`hit-area-canonical.md`「本 DS 不採納觸控尺寸建議」)【維持 U4】 |
| 格內其他地方(內距、列與列的縫、日期列空白) | `onDateClick`(在這天新增) | 格子不變;手形 |

**點格內空白處也把鍵盤位置帶過來**:格陣的停靠點(roving tabindex)搬到這一天、焦點落在這一天的日期鈕,之後 `Tab` 回來停在剛點的那天、consumer 開的對話框關掉後焦點也回到它(與 DataTable 試算表模式同一條:滑鼠點到哪一格,鍵盤位置就跟到哪一格,`../DataTable/data-table.spec.md`「試算表模式」);點日期鈕也走同一條路(Safari 點按鈕不給焦點,要主動給)。唯讀列阻止冒泡同時解掉一個錯日問題:長條的 DOM 放在它這一週第一個可見日的格子裡(見「跨日長條」),冒泡會落到第一格 —— 所有長條一律阻止冒泡,點第 3 天那段不會在第 1 天新增。單擊空白即新增的世界級:Google Calendar 點空白時段跳快速新增(說明頁寫的是時段,沒有專寫月檢視;<https://support.google.com/calendar/answer/72143?hl=en&co=GENIE.Platform%3DDesktop>)、MUI X 單擊空格新增(<https://github.com/mui/mui-x/blob/master/docs/data/scheduler/event-calendar/editing/editing.md>)、Syncfusion 單擊開快速新增(<https://help.syncfusion.com/scheduler-sdk/react/schedule/editor-template>)。

### 間距【SPACING(定)】

起因:user 問日期框左邊距 6px 的依據 —— 6px 是 2026-04-21 首版(86c5436c)AI 寫的 `p-1.5`,沒有依據;同時盤點出格內一串寫死的尺寸。整套間距改成從 Tag 的尺寸與 item-anatomy 的列距規則推:**格內所有空隙 = 4,事件列 = Tag md**。依據:`../Tag/tag.spec.md:196-200`(Tag md 盒高 24、`text-body` 14px `font-normal`、「Tag px」4、「Text px」4)、`../../patterns/element-anatomy/item-anatomy.spec.md:467`(有底色 + 圓角 + 內縮的 standalone pill,清單必 gap ≥ 4)。選項與數值是 AI 擬的,user 對事件列選「Tag md:24px、14px 字」,其餘照提案。

| 部位 | 值 | 依據 |
|---|---|---|
| 事件列 | 高 24(`--tag-height-md`)、`text-body` 14px `font-normal`、`rounded-md` | Tag md(`tag.spec.md:196-200`) |
| 事件文字左內距 | 8 = 4 + 4 | Tag 的「Tag px」4 + 「Text px」4(`tag.spec.md:196-200`;結構見同檔「內部結構」) |
| 有時段的色條 | 色條寬 4 + 間隔 4,文字同在 8;色條高 = 字高(`text-body` 的字級 `--font-body-size`,14)、上下置中、圓頭(`rounded-sm`)【BAR(定)】 | 色條佔「Tag px」那 4、間隔 = 「Text px」4 → 全天與有時段的字左緣在同一條線(修原本有色條的字右偏 3px);寬 = `calendar-geometry.ts` `CALENDAR_ACCENT_WIDTH_PX`;圓頭 = `../../tokens/radius/radius.css`「短邊 ≤ 10px 用 sm」(寬 4 的 2px 圓角 = 兩端半圓) |
| 有時段的時間 → 標題 | 4 | = 格內空隙;時間與標題是同一行文字,一起截斷、省略號在行尾(欄寬不夠時先吃標題,時間仍在)【AI 推導】 |
| 列距(格內與「+N」清單) | 4 | `item-anatomy.spec.md:467`;混合清單取最保守的 gap(同檔「混合視覺語言 list」那一條);也等於 Tag 與 Tag 之間 4(`tag.spec.md`「圓角與間距」) |
| 格子左右內距 | 4 | 與列距同值 → 格邊到事件列 = 事件列到事件列,四邊等距(同 Tag 放進欄位時「四邊等距」的做法,`tag.spec.md`「圓角與間距」) |
| 格子上 / 下內距 | 上 4(日期框離格頂);下 4【AI 推導:四邊等距】 | 同上 |
| 日期框 | 24 × 24(高 = 一列的高),離格頂 4、離格左 4;內容置中,比 24 寬時(「7月1日」、今天的實心底)左右內距 8【AI 推導:同事件文字左內距】 | 日期列與事件列用同一個列高單位,格高算式只有一個列高;週數框同此(「Cell 規則」週數欄【WEEKNUM-BOX(定)】) |
| 日期框 → 第一列 | 4 | = 列距 |
| 「+N」列 | 高 24、左右內距 8、`rounded-md` | 與事件列同高【C3】;內距與圓角同事件列【AI 推導】 |
| 週數欄寬 | 33 = 格子內距 4 + 週數框 24 + 格子內距 4 + 格線 1;週數在框內置中 | 【WEEKNUM-BOX(定)】與日期格同一套(格子內距 4 + 24 框置中),取代 Q10b 的「格子左內距 × 2 + 最寬週數」;user 原話見「Cell 規則」週數欄 |

- 全部寫死的尺寸(`p-1.5`、`gap-0.5`、`min-h-28`、`h-6` / `min-w-6`、`px-1.5 py-0.5`、色條 3px 等)改從 token / 既有元件規格推。數值的唯一住處是 `calendar-geometry.ts`(列高 24 = Tag md 盒高,與 `../Tag/tag.tsx` 的 `TAG_HEIGHT_PX.md` 同值、由閘鎖住;空隙 4、文字內距 8、格線 1、格最小高 61),設成 Calendar 根節點上的元件內變數 `--calendar-gap` / `--calendar-text-inset` / `--calendar-cell-min-h`,class 一律寫 `p-[var(--calendar-gap)]` 這種形式;只有 Calendar 讀、不隨密度切換 → 元件自己的值,不開 token(`../../tokens/token-system.spec.md` 判斷流程第 0 題)【AI 推導】。閘 `scripts/calendar-geometry-invariant.mjs`:Calendar 元件檔(不含範例)的 class 字串出現數字型的內距 / 外距 / 間距 / 寬高 / 最小最大值 / 邊框寬或 `[Npx]` 就紅(工具列 `<nav>` 的按鈕群 `gap-2` 照 `utility-registry.json` canonical_micro_geometry 放行),並核對列高常數與 `TAG_HEIGHT_PX.md` 同值、空隙 = 4、格線 = 1、文字內距與格最小高照算式(格最小高含格線)、class 讀到的 `--calendar-*` 都有設值;畫出來的像素由 `scripts/calendar-month-invariant.mjs` 在瀏覽器量(含「最小高的週:事件列 24、下內距 4」與「容器再矮,事件列與「+N」列仍是 24」)。
- 世界級的列距:MUI X 4(<https://mui.com/x/react-scheduler/event-calendar/views/>)、Mantine 4(<https://mantine.dev/schedule/month-view/>);Google Calendar 是 2(<https://calendar.google.com/calendar/embed>)—— DS 的 standalone pill 規則要 ≥ 4,DS 規則優先(M23)。

### 事件的兩種長相【C2】

| | 全天 / 跨日長條(判定見「資料語意」) | 有時段(未滿 24 小時) |
|---|---|---|
| 底 | 類別淡底 step-1(`../../tokens/categorical-color.ts` `CAT_EVENT`) | 無底(透明) |
| 前綴 | 無(舊的左側 3px 色條拿掉)【AI 推導:色條改成有時段專用,兩種都有就分不出來】 | 左側類別色色條:類別 step-6(`CAT_ACCENT`,只給顏色)、寬 4(`calendar-geometry.ts`)、**高 = 字高、上下置中、圓頭**【BAR(定)】 |
| 內容 | 標題;滿 24 小時的有時段事件,含真起點的那一段(`segment.isStart`)前面加開始時間【AI 推導】 | 開始時間 + 標題(同一行,一起截斷、省略號在行尾)【一起截斷是 AI 推導】 |
| 字色 | 類別字色 step-7【維持 U10】 | 時間 `text-fg-secondary`、標題 `text-foreground`【TIMECOLOR(定)】 |
| 滑過(可點時) | 同色深一格 step-2(`CAT_EVENT`) | `--neutral-hover`(透明底的配對,`../../tokens/color/color.spec.md`「Hover 換色配對總則」);格子本身不變(「Cell 規則」滑過條) |
| 形狀 | `rounded-md`;斷開那一端直角(「跨日長條」) | `rounded-md`,只在滑過 / 焦點時看得見(permanent transparent,`item-anatomy.spec.md`「關鍵定義」) |

- **色條 = 字高、圓頭**【BAR(定)】:user 原話「選 a 字高+圓頭好了，把色條視為字的一部分也一樣是有韻律的，且撐滿的話跟文字的落差有點太大且事件之間的間隔也不明顯」(三個對照版本 A 字高圓頭 / B 撐滿圓頭 / C 撐滿直角是 AI 做的對照圖)。實作:高 = `text-body` 的字級 token `--font-body-size`(14,不寫死)、在 24 的列裡上下置中(上下各 5,相鄰兩條色條之間 4 + 5 + 5 = 14);圓頭 = `rounded-sm`(`../../tokens/radius/radius.css`「短邊 ≤ 10px 用 sm」,寬 4 的 2px 圓角 = 兩端半圓)。世界級:Apple 行事曆 macOS 26 / 27 月檢視有時段事件 = 約一行字高的圓頭短豎條、上下置中(<https://support.apple.com/guide/calendar/symbols-used-in-calendar-symbls/27.0/mac/27>);另一種做法 Cron(2022 官方月檢視圖)撐滿列高(<https://www.cron.com/changelog/2022-01-17-month-view>)。
- **時間灰、標題主色**【TIMECOLOR(定)】:user 選「時間灰、標題主色 (Recommended)」(選項由 AI 提供)。色條已帶類別色,文字不再上色;時間是次要資訊。兩個主題實量對比(2026-11-26 格子不再疊滑過底之後重量,團隊行事曆「設計審查」那一列,`scripts/calendar-month-invariant.mjs` CR):時間字靜止 7.00 / 滑過 6.92(淺色)、12.41 / 11.36(深色);標題 15.13 / 14.69、16.86 / 15.13,都 ≥ 4.5(2026-11-25 格子還疊滑過底時,滑過那一欄是時間 6.73 / 10.14、標題 14.06 / 13.39)。
- 選色條不選圓點:DS 的圓點已被 Badge 的 dot 模式佔用(`../Badge/badge.spec.md:43`、`:75`)。
- 唯讀(`readOnlyEvents` 或單筆 `readOnly`):同色、不帶滑過(`CAT_SUBTLE`),透明列不亮、不是手形。
- 中性灰事件(`color: 'neutral'`,不屬於任何類別,例:全公司的假日)【AI 推導】:`categorical-color.ts` 的 `CAT_EVENT_NEUTRAL`(不進 12 色相的表;放在 categorical-color.ts 是決策總帳 2026-11-25 的 AI 判定)—— 長條 `--secondary` 底 + `--foreground` 字、可點時滑過換它自己的配對 `--secondary-hover`、唯讀只有底與字;色條 `--color-neutral-9`。依據:`../../tokens/color/color.spec.md`「Static Subtle Background」bg-secondary 列(站在這個底上而且可點的,滑過換 `--secondary-hover`)、Tag neutral 同底同字(`../Tag/tag.tsx#tagVariants`)、可點時的滑過先例 FileItem 靜態小膠囊(`../FileItem/file-item.tsx#FileItem`)、色條同 Tag / Avatar neutral solid 的 neutral-9。
- 沒傳 `color`(或傳了認不得的值)= blue。
- 世界級:全天 = 有底的條、有時段 = 無底 —— Google Calendar(<https://calendar.google.com/calendar/embed?src=j7gov1cmnqr9tvg14k621j7t5c%40group.calendar.google.com&src=3haig2m9msslkpf2tn1h56nn9g%40group.calendar.google.com&mode=MONTH&dates=20261101%2F20261128&ctz=UTC&hl=en>)、FullCalendar(<https://fullcalendar.io/docs/eventDisplay>)、MUI X(<https://github.com/mui/mui-x/blob/master/packages/x-scheduler/src/internals/components/event/day-grid-event/DayGridEvent.tsx>)、Toast UI(<https://github.com/nhn/tui.calendar/blob/main/apps/calendar/src/components/events/horizontalEvent.tsx>);有時段改用左側色條 —— Apple 行事曆的 macOS 指南:全天 = 淡色底長條、有時段 = 左側色條(<https://support.apple.com/guide/calendar/symbls/27.0/mac/27>)。

### 跨日長條【C1、Q3(定)】

- **換週切段**:每一週列畫一段,第二段起重複標題;起點在可見範圍之前的,用斷開端表示延續【C1】。Google Calendar:跨日畫長條、遇週換行切段、第二段重複標題、長條佔上方的列、單日排下面(<https://calendar.google.com/calendar/embed?src=j7gov1cmnqr9tvg14k621j7t5c%40group.calendar.google.com&src=3haig2m9msslkpf2tn1h56nn9g%40group.calendar.google.com&mode=MONTH&dates=20260501%2F20260528&ctz=UTC&hl=en>)。
- **斷開那一端一律直角**【Q3(定)】:換週的兩端、起點在可見範圍前、終點在可見範圍後(以上 = Q3(定) 備註的「換週與超出可見範圍」);被溢出格的「+N」切開時靠那一格的那一端、「+N」清單裡這一天之前 / 之後還有的那一端【AI 推導:依 Q3(定)「一律」】—— 一律拿掉該端圓角,只有事件真正的起點 / 終點留 `rounded-md`;不新增箭頭等形狀。FullCalendar 只有真起點 / 終點圓角(<https://fullcalendar.io/docs/eventSlicing>)、React Big Calendar 斷開那端直角(<https://unpkg.com/react-big-calendar@1.20.0/lib/css/react-big-calendar.css>)、Toast UI 接續段直角(<https://github.com/nhn/tui.calendar/blob/main/apps/calendar/src/components/events/horizontalEvent.tsx>)。
- **車道分配**【AI 推導】:每一週列各自分配;依「格內排序」逐筆放進「它涵蓋的每一天都還空著」的最低車道,同一個事件在同一週每一天保持同一條車道;單日事件照同一規則補進空著的車道。每一列在一週裡的 y 位置固定(列高 24 + 列距 4 的等距),長條才能在相鄰格對齊。
- **放不下時逐格切**【AI 推導】:同一條長條在有空間的格照畫,在溢出的那一格被「+N」取代(FullCalendar 預設也這樣切,<https://fullcalendar.io/docs/eventSlicing>)。
- **滑過 / 點擊 / 焦點**【AI 推導】:整段是一個目標;點哪一段,詳情就錨在那一段。指標在長條上時只有長條自己變,格子不變(「Cell 規則」滑過條【CELL-HOVER(定)】)。長條不一定是指標底下那一格的 DOM 子孫,所以「按在哪一段 = 從哪一天進格」由實作用指標所在點的命中測試認,不沿 DOM 祖先找。
- **實作備註**【AI 推導,實作前寫 POC 驗證(M2)】:ARIA 規定 `row` 底下只能是 `gridcell`,所以長條的 DOM 放在它這一週第一個可見日的格子裡、用定位畫過後面幾格;從它涵蓋的其他日子進格也走得到同一個元素(「A11y 預設」)。

### 格內排序【AI 推導】

同一天由上而下:(1) 開始日期早的在上;(2) 同一天開始的,長的在上(跨日長條因此在上);(3) 全天在有時段之前;(4) 有時段的依開始時間;(5) 最後依標題。「+N」清單浮層用同一個順序。

### 每格筆數與「+N」【C3、C6】

- **依格高自動決定**【C3】:可放列數(算式【AI 推導】)k = max(1, ⌊(格高 − 格線 − 上內距 − 日期框高 − 日期到第一列 − 下內距 + 列距) ÷ (列高 + 列距)⌋)(格高 = 量到的格子外框,含自己的底線 1;最後一週沒有底線,照同一式算只是下方多 1px 空白);格高變了(視窗、容器、密度)就重算(ResizeObserver)。剛好放滿不出現「+N」。
- **看最高佔用的車道,不看筆數**【總帳更正 #7】:這一格要的列數 m = 這一格最高佔用的車道序號 + 1。m ≤ k → 全畫;m > k → 車道 0 … k−2 照畫,第 k 列換成「+N」,N = 這一格車道 ≥ k−1 的事件筆數。被換掉的那一列在這一格本來就空著時會出現「+1」【AI 推導】(藏起來的是固定在更高車道的長條,不能挪進空著的那一列);那一列有事件時 N ≥ 2。
- **「+N」那一列**:一律「+N」【C6】(`moreLabel` 可覆寫);與事件同高、無底【C3】;原生 `<button>`(`aria-haspopup="dialog"`、`aria-expanded`);`rounded-md`、靜止透明,滑過 `--neutral-hover`、手形游標;字色 `text-fg-secondary`【AI 推導:改成可點的控件後,文字角色是次要資訊,不動 `--fg-muted` 這個 token(維持 U11)】;字級同事件列 `text-body`【AI 推導】;格內導覽排在這一天的事件之後(「A11y 預設」格內那段);點了開「+N」清單浮層、阻止冒泡。窄時「+N」的字不另換、自訂的長字由產品負責【AI 推導】。
- 舊的「每格最多 3 筆」撤掉;被藏起來的事件從此有路:進格 → 「+N」→ 清單。
- 世界級:Google Calendar 格高決定列數、溢出時最後一列換成「N more」、剛好放滿不出現(<https://calendar.google.com/calendar/embed?src=j7gov1cmnqr9tvg14k621j7t5c%40group.calendar.google.com&src=3haig2m9msslkpf2tn1h56nn9g%40group.calendar.google.com&src=en.usa%23holiday%40group.v.calendar.google.com&src=en.christian%23holiday%40group.v.calendar.google.com&mode=MONTH&dates=20261201%2F20261228&ctz=UTC&hl=en>),「N more」純文字、無底、與事件約同高(<https://calendar.google.com/calendar/embed?src=j7gov1cmnqr9tvg14k621j7t5c%40group.calendar.google.com&src=3haig2m9msslkpf2tn1h56nn9g%40group.calendar.google.com&src=en.usa%23holiday%40group.v.calendar.google.com&mode=MONTH&dates=20261201%2F20261228&ctz=UTC&hl=en>);FullCalendar `dayMaxEventRows: true` 依格高、列數含 +more(<https://fullcalendar.io/docs/dayMaxEventRows>),極窄時只顯示「+2」(<https://github.com/fullcalendar/fullcalendar/blob/main/packages/preact/src/common/MoreLinkContainer.tsx>);MUI X 用 ResizeObserver 量格高、最少 1(<https://github.com/mui/mui-x/blob/master/packages/x-scheduler/src/month-view/MonthView.tsx>)、「n more..」佔一個事件列(<https://github.com/mui/mui-x/blob/master/packages/x-scheduler/src/month-view/month-view-row/MonthViewCell.tsx>);React Big Calendar 依高度、最少 1(<https://github.com/jquense/react-big-calendar/blob/master/src/Month.js>)。

### 焦點框【AI 推導】

事件列、長條、「+N」、自訂方塊外層一律**往外**畫:四周最小淨空(列距 4、格子內距 4)≥ 4 → 往外(`../../../ds-canonical/references/focus-canonical.md`「問題二:畫在外面還是裡面?」;4.00 算放得下)。原本「事件方塊之間 2px → 往內」隨列距改 4 失效。`readOnlyDates` 時焦點在格子本身、格與格零間距 → 維持往內。

---

## 「+N」清單浮層

**內容**:**當天全部事件**(含格內已畫出來的),與格內同樣式、同互動,順序同「格內排序」;清單 `role="list"`。跨日事件在清單裡是一列,這一天之前 / 之後還有的那一端直角【AI 推導:依 Q3(定)「一律」】。唯讀事件照樣列出(清單的目的是讓藏起來的事件看得到),列是純文字、不可點【AI 推導】。世界級:Google Calendar 疊在格上列出當天全部(<https://calendar.google.com/calendar/embed?src=j7gov1cmnqr9tvg14k621j7t5c%40group.calendar.google.com&src=3haig2m9msslkpf2tn1h56nn9g%40group.calendar.google.com&src=en.usa%23holiday%40group.v.calendar.google.com&mode=MONTH&dates=20261201%2F20261228&ctz=UTC&hl=en>)、FullCalendar 預設 popover 列出當天全部(<https://fullcalendar.io/docs/moreLinkClick>)。

**外殼**:消費 `PopoverContent` / `PopoverHeader` / `PopoverTitle` / `PopoverBody`,不手刻浮層標題列(M23;閘 R9)。標題文字 = 日期 + 星期,`Intl` 跟 `locale` 走(zh-TW `{ month: 'long', day: 'numeric', weekday: 'short' }` =「7月15日 週三」;月日與星期之間有沒有空白隨瀏覽器的 ICU 版本變,範例與閘不寫死這串字)【AI 推導】;`PopoverTitle` 自動接 `aria-labelledby`。

**位置 = 展開型**【Q2(定)、Q2b(定)】:定位依據是那一格的外框(不是「+N」那顆鈕);**浮層中心 = 格子中心(水平 + 垂直)**,蓋在那一格上;碰到視窗邊推回、留 8(`collisionPadding`);寬 ≥ 格寬(= max(格寬, Popover 預設寬))【寬的取法 AI 推導】;關閉後焦點回「+N」。這是 Popover 規格的「展開型」例外(`../Popover/popover.spec.md`「蓋在錨點上(展開型)」,用 `PopoverContent` 的 `coverAnchor`),不套「與觸發點隔 8」與「align 跟著觸發點位置」兩條;位置與可用高(視窗高 − 上下各 8)由浮層幾何 SSOT 算(`../../tokens/elevation/elevation.spec.md`「浮層高度上限」)。世界級:Google Calendar 疊在該格上、水平置中、寬大於格(<https://calendar.google.com/calendar/embed?src=j7gov1cmnqr9tvg14k621j7t5c%40group.calendar.google.com&src=3haig2m9msslkpf2tn1h56nn9g%40group.calendar.google.com&src=en.usa%23holiday%40group.v.calendar.google.com&mode=MONTH&dates=20261201%2F20261228&ctz=UTC&hl=en>);Toast UI 水平置中、頂端對齊格子、寬 max(格寬 + 10, 280)(<https://github.com/nhn/tui.calendar/blob/main/apps/calendar/src/components/dayGridMonth/gridCell.tsx>);MUI X 蓋在格上、對齊按鈕左上(<https://github.com/mui/mui-x/blob/master/packages/x-scheduler/src/internals/components/more-events-popover/MoreEventsPopover.tsx>)。

**標題列與內距**【Q4(定)、總帳更正 #1】:照決策卡做法 —— 標題列 = 標準 `PopoverHeader`(SurfaceHeader;一般密度 45 = 標題行高 21 + 上下 `--layout-space-tight` 12)、內建 ×;**標題列底下不畫分隔線、body 頂部 0**:標題到頂部(12)= 標題到第一筆(12),這一段只由標題列的下內距給(`../AgentPanel/agent-decision-card.spec.md:10-11`;`../../tokens/layoutSpace/layoutSpace.spec.md` 規則 2「適用範圍與量法三點」(2));最後一筆到底 = 12(`layoutSpace.spec.md:163`:容器不擋頁面、高度貼著內容 → 與頂部同值);**左右 16**(`--layout-space-loose`,SurfaceBody 預設;列的前緣因此對齊標題左緣)。總帳 Q4(定) 備註原寫「四周 12」是 AI 記總帳時的筆誤,AI 當時給 user 的規格是「上下 12、左右 16」。世界級:Google Calendar 標題是星期 + 日期 + Close(<https://calendar.google.com/calendar/embed?src=j7gov1cmnqr9tvg14k621j7t5c%40group.calendar.google.com&src=3haig2m9msslkpf2tn1h56nn9g%40group.calendar.google.com&src=en.usa%23holiday%40group.v.calendar.google.com&mode=MONTH&dates=20261201%2F20261228&ctz=UTC&hl=en>);Toast UI 的標題列在捲動區外(<https://github.com/nhn/tui.calendar/blob/main/apps/calendar/src/components/dayGridMonth/gridCell.tsx>)、Syncfusion 也是(<https://cdn.jsdelivr.net/npm/@syncfusion/ej2-schedule/styles/material.css>)。

**列距 4 = 韻律規則的例外**【Q4b(定)】:清單是上 12 / 列與列 4 / 下 12;照 `layoutSpace.spec.md:111`「一串同樣的條目」的韻律本該「上 = 列與列 = 下」,這裡刻意不照。理由是 user 原話:「這邊比較是例外吧？為了要跟格子裡的視覺語言一致，所以筆距保持跟格子裡一樣比較合理吧」。本例外只住本檔。

**高度與捲動**【C9】:實際高 = min(可用高, 上限)。上限預設取「最後一列只露一半」(半列原則:上限 = 標題列 + N × (列高 + 列距) + 0.5 × 列高;body 頂部 0、底部內距在捲動區裡只有捲到底才看得到【AI 推導】),**N = 9**【AI 推導,回報 user:取 DS 清單型浮層單行列的同一個 N(`../../tokens/elevation/overlay-geometry.ts` `OVERLAY_LIST_ROWS.single`,由來是最接近改前寫死的 300px);一般密度上限 = 框 2 + 標題列 45 + 9 ×(24 + 4)+ 12 = 311px;對照 Google Calendar 的 480 ≈ N = 15(479px);常數 `calendar-more-list.tsx` `CALENDAR_MORE_LIST_ROWS`】;`moreListMaxHeight`(數字 px 或字串)只能往更矮調,與 `PopoverContent` 的 `maxHeight` 同一個契約(公式 `../../tokens/elevation/overlay-geometry.ts` `capHeight`)。**標題列固定、只有清單捲**:標題列不縮、不被捲走,內容在內文區頂邊被裁、不會滑到標題列底下(`../../patterns/overlay-surface/overlay-surface.spec.md`「Viewport-aware scroll chain invariant」)。世界級:Google Calendar 清單容器 max-height 480 自捲(結構,<https://calendar.google.com/calendar/embed?src=j7gov1cmnqr9tvg14k621j7t5c%40group.calendar.google.com&src=3haig2m9msslkpf2tn1h56nn9g%40group.calendar.google.com&src=en.usa%23holiday%40group.v.calendar.google.com&src=en.uk%23holiday%40group.v.calendar.google.com&mode=MONTH&dates=20261201%2F20261228&ctz=UTC&hl=en>);Syncfusion 內容 max-height 150 自捲、標題列在捲動區外(<https://cdn.jsdelivr.net/npm/@syncfusion/ej2-schedule/styles/material.css>);反例 MUI X 標題跟著捲(讀原始碼推得,<https://github.com/mui/material-ui/blob/master/packages/mui-material/src/Popover/Popover.js>)。

**鍵盤與焦點**:清單裡可點的事件列是原生 `<button>`(不在格陣裡,沒有 gridcell 的限制)【AI 推導】,所以開啟時焦點落在第一筆事件(DS 規則:body 第一個表單控件,`../Popover/popover.spec.md`「A11y 預設」);整張都是唯讀事件時落在浮層容器本身,讀屏念出標題日期。`Tab` 在浮層裡繞圈;`Esc` 關清單、焦點回「+N」;點外面關清單、焦點留在點的地方(`../../../ds-canonical/references/keyboard-model-canonical.md`「關了之後焦點去哪」)。清單開著時格子變高(視窗、容器、密度)、那一格不再溢出、「+N」不畫:清單留著,關掉時焦點回這一天的日期停靠點(「+N」已不在)【AI 推導】。MUI X 的 More Events 浮層也是 Esc 關(<https://github.com/mui/mui-x/blob/master/docs/data/scheduler/accessibility/accessibility.md>)。

**點清單裡的事件**【C4、總帳更正 #4】:**在旁邊再開詳情浮層,清單留著**;被點那一列在詳情開著時維持它自己的滑過色【AI 推導】。`eventDetail` 與 `onEventClick` 兩條路都一樣:清單不先關,`onEventClick` 帶 `{ anchor }` = 被點的那一列;**產品用 DS 浮層(`Popover` 等)、錨在那一列上**時,那個浮層算清單那一層的內部,點它、點它裡面欄位自己的浮層都不關清單(判準與做法:`../../lib/overlay-nesting.ts`「從這一層開出來的另一層」—— 錨點在清單裡、而且比清單晚開;規則住 `../../patterns/overlay-surface/overlay-surface.spec.md`「A11y 預設」的「Esc / 點外面關閉」條);產品用非 DS 的浮層(直接用 Radix 或別的套件)時清單會被關 —— 沒登記的浮層一律不算子層(`overlay-nesting.ts:27`「寧可多關,不可不關」),寫在 `onEventClick` 的說明裡。內建詳情的錨點元素就是那一列(上下取那一列、左右取清單外框,見「事件詳情浮層」位置)。Esc 一次關一層。浮層疊浮層的總則:`../Popover/popover.spec.md`「禁止事項」(少用、不寫死層數【C4b】)。世界級:Google Calendar 從 overview 點事件,詳情緊貼 overview 旁、overview 保留、Esc 一次只關最上層(<https://calendar.google.com/calendar/embed?src=j7gov1cmnqr9tvg14k621j7t5c%40group.calendar.google.com&src=3haig2m9msslkpf2tn1h56nn9g%40group.calendar.google.com&src=en.usa%23holiday%40group.v.calendar.google.com&mode=MONTH&dates=20261201%2F20261228&ctz=UTC&hl=en>);Toast UI 兩層並存(<https://github.com/nhn/tui.calendar/blob/main/apps/calendar/src/slices/popup.ts>);Syncfusion 從 more 浮層點不關 more(<https://github.com/syncfusion/ej2-javascript-ui-controls/blob/master/controls/schedule/src/schedule/popups/quick-popups.ts>);MUI X dialog 在旁邊、浮層留在後面(<https://github.com/mui/mui-x/blob/master/docs/data/scheduler/accessibility/accessibility.md>)。反面教材:FullCalendar 與 React Big Calendar 的 more 浮層一遇到外部 mousedown 就關,開發者自己的詳情一被點,清單就關(<https://github.com/fullcalendar/fullcalendar/blob/main/packages/preact/src/common/MorePopover.tsx>、<https://github.com/jquense/react-big-calendar/blob/master/src/Month.js>)。

## 事件詳情浮層

**定位**【C7、Q5(定)】:閱讀為主、偶爾就地改一欄 —— 正是 `../InlineEdit/inline-edit.spec.md:119-120`「detail pane metadata 就地編輯」「這個值大部分時間是被閱讀的,偶爾才編輯」;同檔 `:127`「多欄位一次編輯 → 用表單(進入一次編輯全部欄位)」講的是一次進入編輯全部欄位的表單,不適用這裡。所以詳情浮層由 `Field` 組成,可編輯的欄位走 `InlineEdit`;「全天」是自己一個 Field(開關)。這不是「內容多」:內容多 = 要一次填寫多個欄位(表單)或篩選資料(`../Popover/popover.spec.md`「禁止事項」)。世界級:Notion Calendar 在面板就地改欄位(<https://www.notion.com/help/manage-your-calendars-and-events>)、MUI X 點事件開對話框直接改、有全天開關(官方文件「Click any event in the demo below to open the dialog. From there you can edit the event details or delete it.」「General: title, start/end date and time, all-day toggle, resource and color selectors, and description.」,<https://mui.com/x/react-scheduler/event-calendar/editing/>;2026-11-26 前引的 `dialog-utils.ts` 只算浮層位置、不支持這句,已換)、Apple 打開事件後直接改時間地點(<https://support.apple.com/guide/calendar/add-modify-or-delete-events-icalwr13-events/27.0/mac/27>)。反例:Google Calendar 要按 Edit event 進編輯再存(<https://support.google.com/calendar/answer/72143?hl=en&co=GENIE.Platform%3DDesktop>)、Outlook 選事件後按 Edit(<https://support.microsoft.com/en-US/outlook/create-modify-or-delete-a-meeting-request-or-appointment-in-outlook-on-the-web>)。

**外殼**:`PopoverContent`(非 modal)+ `PopoverHeader` + `PopoverBody`;寬先用 Popover 預設,不夠才傳 `width` 數字,不新增寬度檔位(實量結果見下方「寬」)。字級吃整頁預設字級 14px【F1(定)】,欄位的字由 Field / InlineEdit 自帶。**內距**:標題列是標準 `PopoverHeader`(標題列下有分隔線),body 用 `PopoverBody` 預設,不加任何內距 class —— 標頭 → 第一個欄位 = `tight`(`../../tokens/layoutSpace/layoutSpace.spec.md` 規則 2)、最後一個欄位 → 底 = 與頂部同值(同檔規則 4 第 4 列:浮層不擋頁面、高度貼著內容 = hug)、左右 `loose`;垂直排的就地編輯框外伸 `--field-bleed`(13)進這 16 裡(`../Field/field.spec.md`「閱讀情境」容器內距 ≥ `--field-bleed`)。

**標題列**【AI 推導,預覽時請 user 看】:事件標題是 `InlineEdit`(預設 `<Input>`),放在 `PopoverTitle` 的位置、不包成 Field —— DS 浮層標題只住標題區、不得在內容裡手刻標題(`../Popover/popover.spec.md`「Title typography canonical」),InlineEdit「何時用」第一條就是標題就地編輯(`inline-edit.spec.md:118`)。字級 14 + `font-medium`;InlineEdit `sm` view 態 28 高,所以標題列 = 28 + 上下 12 = 52、view / edit 兩態同高,× 的佔位要跟這一行同高(浮層標題列 × 佔位跟著標題行高是跨元件工作)。浮層的名字 = 事件標題本身(不得把隱形編輯鈕的「編輯 …」字樣算進去,編輯中也不能變空)。標題清空後提交 = 還原原值。標題列操作位(〔操作〕〔分隔線〕〔×〕)放 `eventDetail.actions(event)` 的內容;刪除這類破壞性動作預設收進「⋯」選單(`../../patterns/action-bar/action-bar.spec.md:123`);沒有「儲存」鈕、沒有 footer(每個欄位自己提交)。

**內文欄位**(**垂直排**:`Field` + `FieldLabel`、標籤在上(Field 預設方向),包在一個 `FieldGroup` 裡)【由 Field 組成、可編輯欄位走 InlineEdit、全天自己一個 Field = Q5(定);垂直排 = FIELD-ORIENT(定);有哪些欄位、各欄平常 / 編輯的長相 = AI 推導,除非另標】。組裡有就地編輯 = **閱讀情境**(標籤次要色、垂直排框外伸、同組同高),規則與理由的唯一住所是 `../Field/field.spec.md`「閱讀情境」,本元件不另寫。同一組不混放純顯示與就地編輯:不能改的值一律 `InlineEdit editable={false}`(`../InlineEdit/inline-edit.spec.md:52`、`:126`)。

| 欄位 | 平常 | 編輯 | 依據 |
|---|---|---|---|
| 時間 | 一段文字:`DatePicker.Range` 檢視 + `formatRange`(同一天自動合併、跨日寫兩端)【TIMEFIELD(定)】;日期段 = DatePicker 的預設日期寫法(兩位數月日)、時間段 = 月格同一份 `eventTimeFormat`(預設 zh-TW「上午10:00」)—— 有時段例「2026/07/15 上午10:00至11:00」,全天例「2026/07/15至2026/07/17」(分隔字隨瀏覽器 ICU;ICU 在區間丟掉的零由 `../DatePicker/range-format.ts` 補回)【DATE-TIME(定)2026-11-26,已實作:日期一律補零、時間 12 / 24 跟語系,`eventTimeFormat` 覆寫】 | InlineEdit → **一個** `DatePicker.Range`,有時段時加 `showTime`(`../DatePicker/date-picker.spec.md:69`);兩端選好才提交 | 時間寫法與月格同一份,平常與編輯中兩端的字都用它(Calendar 傳給 `DatePicker.Range` 的 `formatOptions`;編輯中例「2026/07/15 上午10:00」)—— 同一個詳情看和改是同一種寫法【DATE-TIME(定)2026-11-26;改前編輯中是 DatePicker 的 24 小時 `2026/07/15 10:00`】;全天的 `end` 不含、`DatePicker.Range` 的結束日含 → 進出換算一天(`calendar-layout.ts` `detailRangeOf` / `rangeToTimePatch`) |
| 全天 | 可改時 `Switch`,**直接切換**(不走 InlineEdit 的檢視 / 編輯兩態);只能看時 `InlineEdit editable={false}`、值委派 `Switch mode="view"`(勾 / 叉;`../InlineEdit/inline-edit.spec.md`「值-格式化」委派路徑) | 同左 | 【Q5(定)】自己一個 Field;直接切換【AI 推導,預覽時請 user 看】:DS 就地編輯對 boolean 的既有規則是 direct toggle(`../DataTable/data-table.spec.md`「Inline Edit — per-column opt-in」boolean 列) |
| 地點 | 文字;空值顯示「加上地點…」 | InlineEdit 預設 `<Input>` | `inline-edit.spec.md`「空值」 |
| 說明 | 多行文字;空值顯示「加上說明…」 | InlineEdit `multiline` | `inline-edit.spec.md`「型別化 view + 多行 + 鍵盤 SSOT」 |
| 類別 | 類別 Tag(字 = 類別名、色 = 類別色;`Select` 檢視 `display="tag"`);空值顯示「選擇類別…」 | InlineEdit → `Select`(`display="tag"`,選項帶類別色 = `SelectOption.tagVariant`);選了 → `categoryId` 與 `color` 一起交回 | 【COLORFIELD(定)】欄名「類別」、產品傳 `{ id, name, color }` 清單、沒傳就不顯示;`color` 一起換【AI 推導:月格畫的是 `event.color`,同一下換才不會一筆事件兩種顏色】;不用圓點(Badge dot 已佔用) |
| 額外 | `eventDetail.renderExtra(event)` | 產品自己放 | 例:與會者、會議連結;放在同一個 FieldGroup 裡(同一個閱讀情境範圍) |

欄位順序 = 上表由上而下(時間 → 全天 → 地點 → 說明 → 類別 → 額外)【AI 推導】。

**寬**【AI 推導的算式;user 2026-11-26 第三輪決策卡 detail-width 選 A「可以,改成 416」】:26rem = 416(PopoverContent `width` 數字,常數 `calendar-geometry.ts` `CALENDAR_EVENT_DETAIL_WIDTH_PX`)。唯一目的:時間欄進編輯的 `DatePicker.Range showTime` 兩端的字不被裁(平常的一段合併文字在 Popover 預設 288 就放得下)。量法:兩端平分多出來的寬,每端分到 = 91 + (寬 − 288) ÷ 2(2026-11-26 在 1280 × 900 實量:288 時每端 91)。當時的字「2026/07/05 10:00」每端要 113–115 → 曾取 22rem = 352;同日 DATE-TIME(定)後預設 zh-TW 編輯中的字是「2026/07/05 上午10:00」,多兩個中文字(字級 14,約 +28)、2026-11-26 實量 352 時兩端要 143 / 141、只分到 123 → 被裁→ 照同一套量法至少 392,加同樣 16 的餘量(字型 / 語系差異)取整數 rem 416。實量 = `scripts/calendar-month-invariant.mjs` DT-time-fit(一般 / 大密度,編輯中兩端不被裁,訊息印每端要的寬與分到的寬)。浮層寬不隨編輯或全天切換變。

- **切換「全天」時的時間**【Q16(定)】:有時段切成全天 → 只留日期,記住原本的時間;切回有時段 → 記得就還原;原本就是全天的事件切成有時段 → 開始日 09:00 起、長度一小時(一小時為【AI 推導】)。切換時「時間」欄的編輯控件跟著換(有 / 沒有時間)。記住的時間是 **UI 記憶、不是事件資料**:只存在 Calendar 存活期間(重新整理就沒了)【AI 推導】,不違反「禁止事項」第 2 條 —— 詳情顯示的一律是 `events` 裡那一筆的值,consumer 沒把 patch 寫回時詳情照舊。切換一律從當下最新的那一筆算(`calendar-layout.ts` `toggleAllDayPatch`;寫回的時刻是牆上時間字串,不是加毫秒,日光節約那天也是 09:00 – 10:00)。世界級:MUI X 切全天只隱藏時間欄、值留著,關掉後原時間回來(<https://mui.com/x/react-scheduler/event-calendar/preferences/>);Syncfusion 編輯既有事件時切全天值不動、會還原(<https://github.com/syncfusion/ej2-javascript-ui-controls/blob/master/controls/schedule/src/schedule/popups/event-window.ts>)。
- 【AI 推導】可編輯時空欄位照樣列出(顯示 placeholder);`isEditable` 為 false 時空欄位不列、各欄位 InlineEdit `editable={false}`(不亮、不灰,`inline-edit.spec.md`「editable 閘」);「全天」也一樣是 `InlineEdit editable={false}`、值委派 `Switch mode="view"`(`../Switch/switch.spec.md:156`)—— 同一組不混放純顯示與就地編輯(`../InlineEdit/inline-edit.spec.md:52`、`:126`)。
- Body 上下內距由容器給(`PopoverBody` = hug),欄位之間照 FieldGroup 既有間距,不另訂。

**位置**【DT-DIRECTION(定)2026-11-26】:格陣與「+N」清單都照 DS 子選單擺法 —— 擺法、間距與翻面全照 `../Popover/popover.spec.md`「禁止事項」允許的用法 (2)(「擺法與 DS 已有的 `DropdownMenu` 子選單相同」;間距同 `../DropdownMenu/dropdown-menu.spec.md` SubContent「使用相同規格，包括 sideOffset」),本段不重述數值:**開在被點那一項的右側、上緣對齊**(`side="right"`、`align="start"`,其餘用 Popover 預設),右側放不下由 Popover 的碰撞翻面翻到左側(與 Popover / SelectMenu 同一套機制,數值 `../../tokens/elevation/overlay-geometry.ts`);不依那一天在星期的哪一半換邊(2026-11-26 前是【AI 推導】的「朝格陣中央」:左半邊的欄往右、右半邊往左,已由本條取代)。錨點【AI 推導】= 被點的那個元素(格內事件列、那一段長條、清單裡那一列)。從清單打開時水平貼著清單浮層的外緣(同樣先右、放不下翻左)、垂直對齊被點那一列的上緣(虛擬錨點:左右取清單外框、上下取那一列,錨點元素 = 那一列)。改了日期讓事件移到別天:新位置還在畫面上 → 跟過去(換一個新的錨點物件,Radix 只在錨點物件換了才重算;`../Popover/popover.tsx` PopoverAnchor 上方「換錨點 = 換一個包裝物件」);不在 → 留在原位(回上一次量到的矩形,不回 0×0)。被點的那一段 / 那一列在詳情開著時維持自己的滑過色(`data-detail-open`;色表 `../../tokens/categorical-color.ts` `CAT_EVENT_OPEN` / `CAT_EVENT_NEUTRAL.open`、透明列 `--neutral-hover`),格陣裡與清單裡都套【AI 推導】。世界級:Google Calendar 詳情在事件旁、頂端對齊(<https://calendar.google.com/calendar/embed?src=j7gov1cmnqr9tvg14k621j7t5c%40group.calendar.google.com&mode=MONTH&dates=20261201%2F20261228&ctz=UTC&hl=en>);Toast UI 開在右側、放不下翻左(<https://github.com/nhn/tui.calendar/blob/main/apps/calendar/src/components/popup/eventDetailPopup.tsx>)。

**本元件的層次**:清單浮層 → 詳情浮層 → 欄位自己的日曆 / 時間浮層(欄位控件自己開的彈出層,與表格篩選面板裡的下拉同一類)。產品真的需要一次填很多欄位(邀請與會者、重複規則)時,才改對話框 / 側邊面板 —— 由產品在 `actions` 放「開完整編輯」【AI 推導】。

**Esc(一次少一層)**(`keyboard-model-canonical.md`「`Esc` 一次只關最內層」、「焦點所在的控件自己那一層也算一層」):欄位的日曆 / 時間浮層開著 → 只關那個浮層、草稿不動;欄位在編輯中 → 取消編輯、焦點回那個欄位;詳情開著 → 關詳情、焦點回打開它的那一列 / 方塊;清單開著 → 關清單、焦點回「+N」。

**點外面**【AI 推導】:(1) **先提交、再關** —— InlineEdit 點外面 = 提交(`inline-edit.spec.md`「互動模型」),Popover 點外面 = 關;同一下發生時,浮層卸載前草稿一定已經提交(卸載時仍在編輯 = 視為提交,這是 InlineEdit 的跨元件工作);(2) 點在清單浮層上 = 詳情的外面 → 只關詳情、清單留著;(3) 點在頁面上 → 兩層都關、焦點留在點的地方。打開詳情的元素不在了(事件被移走)→ 焦點改給事件新位置的方塊,再不在就給原日期的停靠點。

## 狀態與邊界案例

- **載入中 `loading`**【Q11(定)】:工具列、星期列、日期數字照畫;每格事件區換成**一條**與事件列同高的 DS `Skeleton`【一條是 AI 推導】;格陣 `aria-busy="true"`、骨架 `aria-hidden`(`../Skeleton/skeleton.spec.md:86-87`;形狀對齊真實內容,同檔 `:64`)。載入中仍可點空白新增、鍵盤走格【AI 推導】;日期停靠點的讀屏名稱只念日期、不念筆數(還沒載完的筆數不是事實;格陣已有 `aria-busy`)【AI 推導,預覽時請 user 確認】。世界級:MUI X 每格一條骨架、不轉圈、不加遮罩(<https://github.com/mui/mui-x/blob/master/packages/x-scheduler/src/month-view/month-view-row/MonthViewCell.tsx#L261>);Atlassian:骨架尺寸和形狀對齊真實內容(<https://atlassian.design/components/skeleton/usage>)。
- **載入失敗**【Q11(定)】:元件不內建;產品在月曆外放 DS `Alert`。FullCalendar 只有失敗回呼(<https://fullcalendar.io/docs/eventSourceFailure>)。
- **沒有事件**【Q11(定)】:月檢視不提示,空白就是常態(不用 `<Empty>`);議程(第二段)寫「沒有事件」。MUI X 月檢視沒有空白提示、agenda 才有「No upcoming events」(<https://github.com/mui/mui-x/blob/master/packages/x-scheduler/src/locales/enUS.ts#L174>);FullCalendar 的「No events to display」只用在 list 檢視(<https://fullcalendar.io/docs/no-events-render-hooks>)。
- **極長標題**:事件列單行截斷,不換行不撐高;實際截斷時滑過 / 焦點顯示完整標題提示(`../Tooltip/tooltip.spec.md`「截斷文字 → 用 tooltip 顯示完整內容。」,SSOT `../../patterns/element-anatomy/truncated-text.spec.md`;事件列是互動宿主 → 自組 `useTruncated`、量內層文字)。
- **跨月多日事件**:照日期範圍畫進前後月溢出的格子與翻月後的新月份(長條在可見範圍邊界直角)。
- **舊資料 / 失敗後**:照常渲染當下傳入的 `events`,互動不自動停用。
- **從右到左排版**:不支援(全域 owner `packages/design-system/README.md#compatibility-matrix`)。

## 窄寬度(桌機 RWD)【Q8(定)、總帳更正 #8】

DS 以桌機為主(`../../tokens/typography/typography.spec.md`「DS 主場景是 desktop」;`../../../ds-canonical/references/hit-area-canonical.md`「本 DS 不採納觸控尺寸建議」)。只做桌機 RWD:容器變窄時**縮減內容**,不換版面 ——(1) 有時段列拿掉時間,只留色條 + 標題(滿 24 小時的有時段長條第一段的開始時間也拿掉【AI 推導】);(2) 星期縮一字(`Intl` `weekday: 'narrow'`,zh-TW「日」);(3) 計數本來就是「+N」;(4) 筆數照「每格筆數」依格高;(5) 1 號只顯示「1」(與拿掉時間同一個門檻)。斷點看**欄寬**、不看視窗寬:**欄寬 ≤ 60 = 窄**(`calendar-geometry.ts` `CALENDAR_NARROW_COLUMN_MAX_PX`;欄寬 = 一個日期格的外框寬,ResizeObserver 量;量版面上的寬,不量畫面上被祖先縮放後的寬(Dialog / Popover 開場有 `zoom-in-95`,欄寬 62 在 0.95 倍下會量成 58.9);欄是 `minmax(0, 1fr)`,縮內容不改欄寬,旗標不會來回跳)【AI 推導,預覽時回報 user】—— 起點取 FullCalendar 的 micro 門檻 60(見下方世界級);2026-11-25 在 1280 × 900 實量現有範例的欄寬:展示 / 設計規格 178、設計原則 141.14、「與 DatePicker 的分工」(半寬)69.28,都沒有跨過;展示「分割畫面側欄(窄寬)」側欄 400 寬時 56.9,跨過。**有時間字之後的實量**(2026-11-25,團隊行事曆,zh-TW 預設格式;回報 user、門檻是否調整待 user 看):時間字連同後面的間隔約 62–68(「上午9:30」62、「上午10:00」68.4),一列可放字的寬 = 欄寬 − 25(格線 1 + 格子左右內距 8 + 色條與間隔 8 + 右內距 8)→ 欄寬 61 起時間字出現,但標題要到欄寬約 101–107 才放得下一個中文字(「下午2:00」101、「上午10:00」107;在那之前畫面只有被截斷的時間,例欄寬 69.28「上午…」、100「上午10:0…」),放得下 2 個中文字要欄寬約 115–121;現有範例:展示 / 設計規格 178(標題約 6 字)、設計原則 141.14(約 3 字)、「與 DatePicker 的分工」69.28(標題 0 字、時間被截斷)。不做:手機版面、第二段的「月格 + 當天清單」;窄時也不自動切議程、檢視切換不換成下拉【AI 推導】。世界級同類(只縮內容):FullCalendar 欄寬 ≤ 60px 為 micro,拿掉時間、只顯示「+N」、星期縮成一個字(<https://github.com/fullcalendar/fullcalendar/blob/main/packages/preact/src/daygrid/components/DayGridLayoutNormal.tsx#L78>、<https://github.com/fullcalendar/fullcalendar/blob/main/packages/preact/src/daygrid/components/DayGridRow.tsx#L541>);MUI X 窄寬主要縮字級、月格仍放事件(<https://github.com/mui/mui-x/blob/master/docs/data/scheduler/event-calendar/responsiveness/responsiveness.md>)。

## 選取與拖拉【Q14(定)】

第一段不做任何選取或拖拉;第二段做拖選多天新增(細節「待定」Q14b);拖曳移動 / 拉長之後再議。第二段實作提醒:單擊空白新增與拖選共存,點擊或拖曳一律看「放開點離按下點的距離」(AGENTS.md 失敗記憶索引)。世界級:Apple 月檢視從開始日拖到結束日建多日事件(<https://support.apple.com/guide/calendar/icl1018/mac>)、React Big Calendar `selectable`(<https://github.com/jquense/react-big-calendar/blob/master/src/Calendar.js>)。

## 待定(第二段開工前定,不在本規格自編)

- **Q12 週 / 日 / 議程的鍵盤**:月檢視模型(一個停靠點、方向鍵、F2 進格)是對月格陣的條件式同意【維持 U7】;把「一串一站」這類模型套到月曆事件以外的檢視是新的設計主張、要 user 拍板(`keyboard-model-canonical.md`「適用範圍 —— 只有這些」)。
- **Q13 週 / 日 / 議程的版面細節**:時段刻度、預設捲到幾點、上班時段與「現在時間」線、頂部全天列放不下時怎麼收、重疊事件怎麼排、議程預設幾天與沒事件的日子要不要列、清單標題日期要不要做成「前往這一天」。已定的只有:議程整段沒有事件寫「沒有事件」【Q11(定)】、不做「月格 + 清單」【Q8(定)】、週數第二段點了切週檢視【Q10b(定)】。
- **Q14b 拖選新增的細節**:拖選中的樣子(不得與今天的實心底相同【C8(定)】;DateGrid 區間端點是藍底白字圓,直接沿用會撞)、放開後直接呼叫新增回呼還是先出快速新增。

## 禁止事項

- ❌ 不用 `<DayPicker>` 為底層;不把月格寫成 `<table>`(長條與第二段的時間軸需要 grid 自由佈局)
- ❌ 不把事件資料存在元件內部 state —— 事件是 consumer 責任;詳情改動經 `onEventChange` 交回
- ❌ 不自動打開「新事件」表單;不拿回呼有沒有傳決定畫不畫「新事件」(M23(f))
- ❌ 「+N」、事件列(含唯讀)、長條的點擊不得冒泡成「在這天新增」【Q6(定)】
- ❌ 不手刻浮層標題列 —— 清單與詳情浮層一律消費 `PopoverHeader`(M23;閘 R9)
- ❌ 今天不得用 `--primary` 家族;今天不得改成數字下方短線【C8(定)】
- ❌ 格內不寫死尺寸(`p-1.5` / `gap-0.5` / `min-h-28` 這類)—— 一律從「間距」表的 token / 元件規格推【SPACING(定)】
- ❌ 不重造 date math —— 一律 `date-fns`;唯一例外是每 render 分桶事件的 hot path 可用原生 timestamp 迭代(限縮在 memo 內),逐日仍用日曆日不用固定毫秒
- ❌ 不讀 `date-fns` 語系物件的週起始日【WS(定)】

## 第一段實作範圍(相對 2026-11-24 程式)

**畫面看得見的變化**:有時段事件改無底 + 色條 + 開始時間 + 標題,全天改淡底長條、拿掉左 3px 條【C2】(色條字高、圓頭【BAR(定)】;時間灰、標題主色【TIMECOLOR(定)】;新增 neutral 事件色;窄寬時拿掉時間);多日事件改橫跨長條、換週切段、斷開端直角【C1、Q3(定)】;每格筆數依格高、各週等高,「+N more」改「+N」、與事件同高、可點【C3、C6】;日期數字右上 → 左上,今天實心底跟著移【C10(改)】;每月 1 號顯示「7月1日」【Q15(定)】;整套間距改「間距」表(事件列 24 / 14px、列距 2 → 4、格內距 6 → 4)【SPACING(定)】;焦點框往外;工具列改 ChromeHeader;沒傳語系時新加的時間也是中文格式【Q9(定)】(標題與星期已在 0.1.0-beta.151 的 `Calendar.locale` 改成中文,不在本段);「+N」字色 muted → secondary;容器太矮時格陣可捲、底緣雙線拿掉;週數欄 / 隱藏週末 / 載入中骨架(選用)【Q10(定)、Q10b(定)、Q11(定)】;日期格滑過不再變灰、只有手形游標【CELL-HOVER(定)】。

**行為變化**:點「+N」開以格子為中心的當天清單、不再變成新增【Q2b(定)】;點事件開詳情浮層、各欄位就地改【C7、Q5(定)、Q16(定)】;從清單點事件,詳情開在旁邊、清單不關,`onEventClick` 也一樣【C4、總帳更正 #4】;點唯讀事件不再新增、游標是箭頭【總帳更正 #3】;午夜結束與過夜不滿 24 小時只畫開始那天【Q7(定)】;只有日期沒標全天的改畫全天長條。

**對產品工程師的破壞性變更**:全天事件 `end` 改「不含」(現有資料 +1 天);`renderEventTile` 內容只能一列高、多收 `segment` 參數(`{ isStart, isEnd, continuesBefore, continuesAfter, isSegmentRepeat }`,畫延續與重複標題用);星期列移進格陣(DOM 結構換了);讀屏字串改寫(事件名稱從「事件:{標題}」改成「{標題},{時間或日期}{,全天}」);`CalendarEvent.color` 多收 `'neutral'`(在 `renderEventTile` 裡拿 `event.color` 去查 12 色相表的要先處理它);`CAT_ACCENT` 的內容從左側 3px 邊框改成色條底色。

**依賴的跨元件工作**(各自登記):Popover 展開型定位與可用高;清單類浮層高度上限可調 + 半列原則【C9】;浮層標題列 × 佔位跟著標題行高;InlineEdit「卸載時仍在編輯 = 提交」;SelectMenu 選項帶類別色;`categorical-color.ts` 的 `CAT_ACCENT` 改給有時段色條、補 neutral 事件色;全 DS 日期元件預設 zh-TW 與週起始日從 `Intl` 推【Q9(定)、WS(定)】;focus-canonical / keyboard-model-canonical 的 Calendar 列隨實作更新。

---

## 決定來源總帳

### user 決定(2026-11-24 決策總帳;選項文字帶「(Recommended)」的 = 選項與建議是 AI 擬的、user 選定)

| 代號 | 決定 | user 原話 / 選項(逐字) |
|---|---|---|
| C1 | 跨日畫成橫跨多格的長條,換週切段 | 「畫成橫跨多格的長條 (Recommended)」 |
| C2 | 全天 / 跨日 = 淡底長條;有時段 = 無底 + 色條 + 時間 + 標題 | 「A基本上可以，但到底是用圓點好還是用我本來給你的圖稿上的那種像是垂直槓線好？」→ 選「垂直槓線 (Recommended)」 |
| C3 | 每格筆數依格高;放不下時最後一列換成計數列(與事件同高、無底);各週等高 | 「依格子高度自動決定 (Recommended)」 |
| C4 | 從清單點事件 → 旁邊再開詳情浮層 | 「我覺得可以照你建議，但我好奇我們DS為何要禁止浮層開浮層？是我定義的嗎？根據是什麼？是否有合理具體理由？世界級的設計有禁止嗎？我想確認一下上述問題的答案」 |
| C4b | 浮層疊浮層少用、不寫死層數 | 「需要限制嗎？世界級的設計都有限制層數？我認為可以建議少用，但不確定是否要限制層數」→ 選「建議少用，不寫死層數 (Recommended)」 |
| C5 | 規格定四種檢視,實作分兩段 | 「規格一次定四種，實作分兩段 (Recommended)」 |
| C6 | 計數文字一律「+N」 | 「一律「+N」」 |
| C7 | 詳情浮層閱讀為主、各欄位就地編輯 | 「你指的設計系統寫的那個原則是我說的嗎？你是不是又不按照工作流程，然後去脈絡化亂解讀？整個內容是以檢視為主同時支援編輯的情況就會使用就地編輯這類元件吧？你仔細查證ds是否這樣說？以及這樣說是否合理？…」 |
| C8(定) | 今天維持實心底 | 「維持實心底 (Recommended)」 |
| C9 | 清單浮層高度上限可調,預設取最適合的 | 「這個最大高度本來就是可以讓消費者調整的對吧？那我們預設的最大高度就是取一個我們覺得最適合的吧？」 |
| C10(改) | 日期數字左上、星期置中 | 「我覺得日期置放左邊比較好讀，所以星期可能置中，這樣跟 clickup planner的設計是一樣的」 |
| Q2(定) / Q2b(定) | 「+N」清單蓋在那一格上、定位依據是格子、以格子為中心(水平 + 垂直) | 「蓋在那一格上，定位依據是格子 (Recommended)」;再選「以格子為中心(水平 + 垂直) (Recommended)」 |
| Q3(定) | 長條斷開端一律直角 | 「斷開端一律改直角 (Recommended)」 |
| Q4(定) | 清單標題列照決策卡做法 | 「照決策卡做法 (Recommended)」 |
| Q4b(定) | 清單列距 4 = 韻律例外 | 「這邊比較是例外吧？為了要跟格子裡的視覺語言一致，所以筆距保持跟格子裡一樣比較合理吧」 |
| Q5(定) | 詳情由 Field 組成、可編輯欄位走 InlineEdit、全天自己一個 Field | 「這個表單雖然是檢視用，但應該都是 field 元件？然後是套用inline edit的field元件？我是覺得開關要自己是一個field吧？」 |
| Q6(定) | 單擊空白即新增;事件列與 +N 阻止冒泡 | 「維持單擊空白就新增 (Recommended)」 |
| Q7(定) | 過夜事件只畫在開始那天;滿 24 小時或全天才是長條 | 「只畫在開始那天 (Recommended)」 |
| Q8(定) | 只做桌機 RWD(縮內容) | 「我們ds難道沒說過我們是以支援桌機為主嗎？你是否忘記這件事？若是如此，root cuase?以及若有rwd也是以桌機的rwd為主吧？」 |
| Q9(定) | 全 DS 日期元件預設 zh-TW | 「全 DS 日期元件一起改 zh-TW (Recommended)」 |
| Q10(定) | 週末不加底;隱藏週末、週數欄為選用(預設關);假日用唯讀全天事件 | 「我覺得可以照你建議，但是週數欄的設計規格應該要在確認？…」 |
| Q10b(定) | 週數欄長相(見「Cell 規則」) | 「我覺得可以照你建議，反正週數跟日期字體 token 一樣但可以不加粗，然後標頭的字體 token 也是跟其他標頭一樣，粗細則可以討論，週數的標題和週數的顏色也可以討論，但我想知道的是為何日期框左邊距是6px?…」→ 欄頭選「弱化：不加粗 + fg-secondary (Recommended)」 |
| Q11(定) | 只內建載入中(格內骨架) | 「只內建載入中(格內骨架) (Recommended)」 |
| Q14(定) | 第一段不做選取,第二段做拖選新增 | 「第一段不做，第二段做拖選新增 (Recommended)」 |
| Q15(定) | 每月 1 號帶月份 | 「照你建議」 |
| Q16(定) | 切換全天:記住並還原;原本全天的給 09:00 起一小時 | 「記住並還原;原本全天的給 09:00 起一小時 (Recommended)」 |
| SPACING(定) | 整套間距(見「間距」) | 起因「…為何日期框左邊距是6px?這感覺不是我們ds會出現的數字，依據是什麼？我好奇」「此外我想問calendar是否還有其他類似'亂用6px'的地方？」;事件列選「Tag md:24px、14px 字」,其餘照 AI 提案 |
| WS(定) | 週起始日:各元件參數 + 沒傳時跟語系的 CLDR | 「應該是不同的設定？但都可以有預設？世界級的設計如何設計？」→「你確定中文語系的起始通常預設都是週日？世界級的設計是這樣？」→ 選「跟語系的 CLDR (Recommended)」 |
| F1(定) | 整頁預設字級 14px,浮層經 Portal 繼承 | 「照全域做 (Recommended)」,原話「確定是世界級的設計就照你建議」 |
| BAR(定) | 有時段事件的色條 = 字高、上下置中、圓頭(寬 4、間隔 4 不變);2026-11-25 決策總帳 | 「選 a 字高+圓頭好了，把色條視為字的一部分也一樣是有韻律的，且撐滿的話跟文字的落差有點太大且事件之間的間隔也不明顯」(A 字高圓頭 / B 撐滿圓頭 / C 撐滿直角三個對照版本是 AI 做的圖) |
| TIMECOLOR(定) | 有時段事件的時間 `text-fg-secondary`、標題 `text-foreground`;2026-11-25 決策總帳 | 選「時間灰、標題主色 (Recommended)」 |
| DT-DIRECTION(定) | 事件詳情在格陣與「+N」清單都照 DS 子選單擺法:開在右側、對齊上緣、隔 8,右邊放不下翻左(見「事件詳情浮層」位置;2026-11-26 已實作,閘 `scripts/calendar-month-invariant.mjs` DT-side / DT-side-right / DT-side-flip / DT-list);2026-11-26 決策卡 | 第一輪留言「詳情的觸發點很明確就是事件吧？為何不是按照ds既有pattern?」;第二輪 user 點選「格陣和清單都照子選單擺法:先開右側」(2026-11-26 決策卡;選項與建議是 AI 擬的),同卡留言「可以照你建議，但一般 popover 在下方空間不足時也會往上開，對吧？跟 select menu 的行為是同一個 ssot?」(問句;協調者回覆:是,Popover / SelectMenu / DropdownMenu 同一套 Radix 碰撞翻面,詳情照子選單先開右、放不下翻左) |
| CELL-HOVER(定) | 月檢視可點的日期格滑過不變色、只留手形游標;鍵盤焦點框、事件 /「+N」自己的滑過、點空白新增、唯讀照舊(見「Cell 規則」滑過條;2026-11-26 已實作,閘 `scripts/calendar-month-invariant.mjs` HV1–HV4);2026-11-26 第五輪決策卡 | user 點選「A:拿掉日期格的滑過底色,只留手形游標」(選項與建議是 AI 擬的;留言欄空白) |
| DATE-TIME(定) | 時間 12 / 24 跟語系、可用既有參數覆寫(本元件 `eventTimeFormat`);數字日期一律補零、不給補零開關(見「資料語意」時間顯示、「事件詳情浮層」時間欄;2026-11-26 已實作,DatePicker / TimePicker 同一條);2026-11-26 決策卡 | 第一輪兩則留言「為何不補零？」「可以跟著語系有一個預設？但是一樣可以獨立調整？然後跟著中文語系預設是12小時，英文的話是24小時？」;第二輪 user 點選「時間跟語系(12 / 24)、日期一律補零,兩者都能單獨覆寫」(2026-11-26 決策卡;選項與建議是 AI 擬的;跟語系時 en-US 也是 12 小時,卡上 en-US 例字「10:00 AM」),同卡留言「補零這件事應該可以不用給覆寫？一律都補零？」(問句;協調者依此回覆「日期一律補零、不另給補零開關」) |

**維持(先前的 user 決定,預設不重議)**:user 2026-11-23 原話「我決定過的部分基本上就不用重議了吧？除非跟研究或是擴充性有關或是有衝突或是違背ds一致的設計語言 才需要重新評估吧？」

| 代號 | 決定 | 原話 / 出處 |
|---|---|---|
| U1 | 右上角「新事件」= 全域新增、恆渲染、`onCreateEvent` 必填 | 「第三題，右上角那是全域新增，表示點了之後要先選了日期才能新增啊，那肯定會擋住不能新增的日期啊，所以我不確定你到底要我決定什麼」(2026-09-29) |
| U2 | 滑過瞬間切換、不做過渡(全 DS) | 「第三題改成全部瞬間」(2026-09-10) |
| U3 | 非當月格不加底色 | 選『可以，拿掉底色 (Recommended)』(2026-09-25,選項由 AI 提供) |
| U4 | 格子是非互動容器 | 2026-06-11「2c 修 code」(程式註記;逐字原話引不出) |
| U6 | 巢狀滑過:卡片保留、按鈕往上一階(全 DS;2026-11-26 起月曆格子沒有滑過色,格內事件不再疊在格子的滑過上【CELL-HOVER(定)】) | 選『卡片保留、按鈕再亮一層 (Recommended)』(2026-09-25;原文在 `color.spec.md`「巢狀滑過」) |
| U7 | 月格鍵盤:一個停靠點、方向鍵、F2 進格 | 「符合我們一致的設計語言且不違背世界級的設計就照建議」(有條件同意) |
| U8 | 唯讀日期格 / 事件方塊 | 「確保符合我們一致的設計語言且不違背世界級的設計且都有確保整個ds 是SSOT,避免漂移就照你建議做」 |
| U9 | 深色滑過格上 7 個色相對比 < 4.5 擱置(2026-11-26 起格子不上滑過底【CELL-HOVER(定)】,月曆不再出現這個組合) | 「這個先忽略」(2026-09-26) |
| U10 | 淺色類別淡底上的字維持 step-7 | 「要我拍板的第一題就照舊規格」(2026-09-29) |
| U11 | `--fg-muted` 維持現狀 | 「這個問題你很早之前就問過我了,而且上次我就說維持現狀。這次也是,等我要改再等我主動」(2026-09-21) |
| U12 | 今天用 `--info` | commit 96f75ac1 記 user 選『改用 --info(對齊 token 字典)』(原對話已不存在) |
| U15 | 深色淡底改半透明,事件方塊滑過 = 同色濃一格 | 「確保這符合我們一致的設計語言且不違背世界級的設計就照你建議做」 |
| P6 | 星期標題字樣 `text-foreground text-body font-medium` 維持 | 2026-09-07 user 問星期標題為何那麼淺 → 依既有規範改深;AI 先前說的「你 2026-05-03 定的」引不出原話,已撤回(M36(a)) |

被取代的舊決定:2026-06-01「A 補實作」全天(user 只決定要做,視覺是 AI 選的)→ 視覺由 C2 取代;示範殼「點事件開浮層看名稱與日期」(2026-10-21「d13照你建議」)→ 內容由 C7 擴充;「+N more」先暫緩 → 由 C3 / C6 / Q2(定) / Q2b(定) 取代。

### 總帳更正 #1–#9(AI 判定,不是 user 決定)

本規格裡的【總帳更正 #n】指下表。原文逐字取自 2026-11-24 決策總帳「2026-11-24 草稿 v1 核對後的更正與 AI 判定(不需 user 決定;依據附後)」那一段,編號 = 那一段的條目順序(總帳本身不進 repo);原文裡的行號是 2026-11-24 當時的。

| # | 總帳原文(逐字) | 性質 |
|---|---|---|
| 1 | Q4(定) 備註「四周 12」是 AI 記總帳時的筆誤:AI 當時給 user 的規格是「標題列上方 / 標題→第一筆 / 最後一筆→底 = 12,左右 16(loose)」,user 問的也是上下等距 → 更正為「上下 12、左右 16」。 | AI 判定 |
| 2 | Q9 週起始日:date-fns zh-TW = 週一(locale/zh-TW.js:24),Intl zh-TW = 週日(node 實測 firstDay 7)。user 同意的前提是「現況不變(週日)」→ 全 DS 以 Intl(CLDR)為準。 | AI 判定;後由 WS(定) user 選「跟語系的 CLDR (Recommended)」確認 |
| 3 | X18 / P2 / P2':依 Q6(定)「事件列與 +N 阻止冒泡」字面,唯讀事件列也阻止冒泡(點了不新增),格子在唯讀列上不亮(hit-area-canonical.md:34 懸停 = 命中)。同時解掉多日長條冒泡到第一格的錯日問題。 | AI 判定 |
| 4 | P3:為了讓 C4「清單留著、旁邊開詳情」對所有 consumer 成立,onEventClick 要帶事件列的錨點元素、清單不先關。 | AI 判定 |
| 5 | P4:popover.spec.md 的「內容多」措辭改成「要一次填寫多個欄位(表單)或篩選資料」,與 inline-edit.spec.md:119-120「閱讀為主、偶爾編輯」區分,詳情浮層屬後者。 | AI 判定 |
| 6 | P6:U5 星期標題字樣(text-foreground text-body font-medium)維持,寫進維持清單。 | AI 判定 |
| 7 | P7:每格放不放得下以「最高佔用的車道」算,不是事件筆數。 | AI 判定 |
| 8 | X4:窄到拿掉時間的門檻,1 號同時只顯示「1」。 | AI 判定 |
| 9 | Q17 星期列灰底:沒有證據顯示是問題 → 維持現狀,不提問(feedback_propose_discipline.md Sub-rule 9)。 | AI 判定 |

### AI 推導清單(user 可推翻;看得見的列進發版確認頁)

第一段不開 `view`;第一段不開顯示用時區 `timeZone`(格子、「今天」與時間字一律瀏覽器時區);第二段 API 形狀 `view` / `defaultView` / `onViewChange` / `views`;事件方塊第三種選項 `eventDetail` 與單筆 `readOnly`;重複事件不進資料模型(產品先展開);只有日期沒標全天 → 全天;`end` 不含;時區 / 日光節約 / 異常資料;月格只顯示開始時間(滿 24 小時的有時段長條只在含真起點那一段、窄寬時不顯示)、`eventTimeFormat` 整份取代預設;有時段事件時間與標題同一行一起截斷、中間隔 4;全天長條拿掉左側色條(色條只給有時段);neutral 事件色(`--secondary` 長條 / `--secondary-hover` 滑過 / `--color-neutral-9` 色條)、沒傳或認不得的顏色 = blue;車道分配、格內排序、逐格切;「+N」切開處與清單裡跨日列的斷開端也直角(依 Q3(定)「一律」);長條 DOM 放第一個可見日的格子;每格列數算式、「+1」出現條件;「+N」的內距、圓角、字色 secondary、窄時不另換字;焦點框往外;格子下內距 4、格最小高(含格線 1)、事件列不被壓扁(放不下由格子裁掉)、容器太矮時捲動;日期框寬於 24 時左右內距 8;`renderEventTile` 限一列高、多收 `segment`;格內鍵盤為「+N」與跨日長條補的順序、從每一天進格、`Esc` 回進格那一天;清單裡唯讀事件照列、純文字不可點;清單標題文字格式、寬的取法、以格為中心的可用高、開啟焦點、半列公式;被點那一列在詳情開著時維持滑過色;詳情的標題放標題列、全天開關直接切換、時間用一個 `DatePicker.Range`;詳情有哪些欄位(地點 / 說明 / 類別 / 額外)與各欄平常 / 編輯的長相;詳情可編輯時空欄位照列(顯示 placeholder)、只能看時空欄位不列;詳情錨點(被點的那個元素)、本元件的層次、點外面先提交再關;載入中一條骨架、仍可操作;窄寬斷點看欄寬、不自動切議程、檢視切換不換下拉;工具列改 ChromeHeader、導覽群到標題 8(ChromeHeader 子項間距,改前 16)、「今天」只搬鍵盤停靠點不搶焦點、檢視切換用 SegmentedControl、不內建快捷鍵;星期列內距(四邊 4、列高 32);隱藏週末的鍵盤落點(方向鍵 / Home / End / PageUp / PageDown 跳過被藏的日子、今天或 1 號被藏時的停靠點);週數第一週的資料來源 = CLDR `minDays`、週數欄寬用 `calc(2 × 4 + 2ch)`、週數欄格線同日期格、灰底條延伸到欄頭;載入中日期名稱不念筆數;窄寬門檻欄寬 ≤ 60;A11y:週數欄欄頭 `columnheader`、週數格 `rowheader`(名稱「第 N 週」、不是操作目標);星期列移進格陣(`row` / `columnheader`)、今天 `aria-current` 與名稱前的「今天,」、日期停靠點與事件列的讀屏名稱格式、「+N」讀屏名稱、`labels` 物件收全部讀屏字串;四種檢視各自的用途描述;詳情時間欄的時間寫法與月格同一份(日期段 = DatePicker 的預設日期寫法,補零由 DATE-TIME(定)決定)、選了類別 `color` 一起換、欄位順序與三個佔位字、詳情寬、從清單開的虛擬錨點、事件移走時跟過去、全天切換的記憶只存在 Calendar 存活期間、詳情開著時那一段維持滑過色(格陣與清單都套)、截斷提示只在滑過或看得見的焦點時開(用滑鼠關詳情後不跳);`eventDetail.isEditable`(詳情只能看)與它的第三種情況(外部同步寫不回去)。2026-11-26 起改由 user 決定(見上方 user 決定表):詳情往哪一側開(原本這裡的「側邊朝格陣中央、用點擊點 / 進格那一天所在的欄判斷」已撤)→ DT-DIRECTION(定,2026-11-26 已實作);詳情時間欄日期段不補零 → DATE-TIME(定,2026-11-26 已實作:一律補零、時間 12 / 24 跟語系)。

## Anatomy N/A rationale(偏離 canonical 5 的說明)

- **無 `SizeMatrix`**:Calendar 沒有 size 檔位;密度只經 token(`--layout-space-*`、`--tag-height-md`、ChromeHeader 高)影響,不為未實作視覺保留空 `size` prop。
- **`StateBehavior`**:Calendar 本身沒有 hover / focus / disabled 互動 prop;格、事件列、長條、「+N」、清單與詳情浮層的視覺狀態由 anatomy `StateBehavior` story 列舉,清單與詳情各需一則開著的範例(M15)。

## 相關

`../DatePicker/date-picker.spec.md`(選日期的 form control)、`../DateGrid/date-grid.spec.md`(DatePicker 內部日曆格)、`../Popover/popover.spec.md`(清單與詳情浮層的外殼、展開型例外、浮層疊浮層)、`../InlineEdit/inline-edit.spec.md`(詳情就地編輯)、`../Tag/tag.spec.md`(事件列尺寸)、`../../patterns/overlay-surface/overlay-surface.spec.md`(浮層標題列 / 內文 / 點外面關閉)、`../../patterns/header-canonical/header-canonical.spec.md`(工具列)、`../../patterns/action-bar/action-bar.spec.md`(工具列分組與排序)、`../../patterns/element-anatomy/element-anatomy.spec.md`(Page-composite 分類)。

## A11y 預設

**ARIA / Pattern**【本段各條 AI 推導,除非另標】:對齊 [W3C ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/) 的 Grid Pattern。

- 工具列的月份導覽用 `<nav aria-label>`(預設「行事曆月份導覽」,`navAriaLabel` 可換)。
- 月格陣 `role="grid"`;**星期列是格陣的第一個 `role="row"`**,每格 `role="columnheader"`、名稱用完整星期名;週數欄打開時,欄頭(星期列第一格 `columnheader`,字 = `labels.weekNumberHeader`,預設「週」)與每週的週數格(該列第一格 `rowheader`,看得見的是數字,名稱 = `labels.weekNumber`,預設「第 27 週」)不是操作目標:沒有 `tabindex`、不進格陣的停靠點,第一段不可點【AI 推導】。
- 每格 `role="gridcell"`(非互動容器)【維持 U4】。日期停靠點的名稱 = 完整日期(`Intl` `dateStyle: 'full'`,zh-TW「2026年7月15日 星期三」)+ 筆數;**今天**加 `aria-current="date"`、名稱前加「今天,」(DS 的 DateGrid 已這樣做;MUI X 今天也是 `aria-current=date`,<https://github.com/mui/mui-x/blob/master/docs/data/scheduler/accessibility/accessibility.md>)。1 號顯示「7月1日」不影響名稱。
- 事件列 / 長條 `role="button"`,名稱「{標題},{開始時間 或 起訖日期}{,全天}」:有時段(未滿 24 小時)= 開始時間(與畫面上同一個格式,依 `locale` / `eventTimeFormat`),例「設計審查,上午10:00」;長條(全天,或有時段且滿 24 小時)= 起訖日期(`Intl` `{ month: 'long', day: 'numeric' }`,結束日 = 畫出來的最後一天,一天只寫一個日期),例「Alex 休假,7月20日 – 7月22日,全天」「公司創立紀念日,7月3日,全天」;窄寬拿掉畫面上的時間時名稱照舊;字串由 `labels.event(title, when, allDay)` 組(可覆寫);`renderEventTile` 的外層用同一個名稱。唯讀時沒有角色、不命名,標題(與時間)就是文字內容。`readOnlyDates` 時焦點在格子上,讀屏要念到日期、今天、筆數**與每個事件標題**(格子的 `aria-label` 不得蓋掉格內文字)。Outlook 的讀屏也是標題後接時間、日期(<https://support.microsoft.com/en-US/accessibility/outlook/basic-tasks-using-a-screen-reader-with-the-calendar-in-outlook>)。
- 「+N」原生 `<button>`,名稱「{日期},還有 {N} 個事件」(`labels` 可換);`aria-haspopup="dialog"`、`aria-expanded`。Google Calendar 的「N more」是 `role=button`、名稱「N more events」(<https://calendar.google.com/calendar/embed?src=j7gov1cmnqr9tvg14k621j7t5c%40group.calendar.google.com&src=3haig2m9msslkpf2tn1h56nn9g%40group.calendar.google.com&src=en.usa%23holiday%40group.v.calendar.google.com&mode=MONTH&dates=20261201%2F20261228&ctz=UTC&hl=en>),讀屏使用者到 More 按鈕按 Enter / Space 看被藏的事件(<https://support.google.com/calendar/answer/6101541?hl=en>)。
- 載入中格陣 `aria-busy="true"`,骨架 `aria-hidden`;日期停靠點名稱不念筆數(見「狀態與邊界案例」)。
- **字串可覆寫**:`labels` 收所有讀屏字串與檢視名稱(格陣、日期、事件、+N、‹ › 各檢視、檢視切換、清單 / 詳情的關閉、週數欄欄頭),預設繁中、逐鍵可覆寫,元件裡不寫死 `aria-label`;既有 `prevAriaLabel` / `nextAriaLabel` / `navAriaLabel` / `todayLabel` / `createLabel` / `moreLabel` 保留。

**Keyboard(月檢視)**【維持 U7】([來源](https://github.com/w3c/aria-practices/blob/0f765e4dc33e966026114ac12a8380db1de3b787/content/patterns/grid/grid-pattern.html#L205-L221)):整個月格陣是**一個 Tab 停靠點**(roving tabindex)—— APG 原文:"Since only one element in the entire grid is included in the tab sequence, grouping with a grid can dramatically reduce the number of tab stops on a page."。真焦點是**日期數字 `<button>`**(格裡唯一不需方向鍵的控件):"A cell contains one widget whose operation does not require arrow keys and grid navigation keys set focus on that widget."。`readOnlyDates` 時焦點改放格子本身:"A cell contains text or a single graphic and grid navigation keys set focus on the cell."(跨元件規則 `../../../ds-canonical/references/keyboard-model-canonical.md`「本 DS 的兩個消費者」)。

| 按鍵 | 行為 | 一手出處 |
|---|---|---|
| `Tab` / `Shift+Tab` | 進 / 出整個格陣,只停一次;停在今天(今天不在本月則停在 1 號)。`hideWeekends` 時【AI 推導】:今天被藏 → 同一週下一個看得見的日子,這一週後面沒有就前一個;1 號被藏 → 1 號之後第一個看得見的日子;「今天」鈕搬停靠點同一條 | APG Date Picker Dialog:"only one button in the calendar grid is in the Tab sequence"([來源](https://github.com/w3c/aria-practices/blob/0f765e4dc33e966026114ac12a8380db1de3b787/content/patterns/dialog-modal/examples/datepicker-dialog.html#L249)) |
| `←` / `→`、`↑` / `↓` | 前 / 後一天;上 / 下一週同一天。`hideWeekends` 時落點被藏就往移動方向找最近一個看得見的日子(週五按 `→` 到下週一)【AI 推導】 | 同上 Keyboard Support 表 |
| `Home` / `End` | 該週第一天 / 最後一天(依週起始日);`hideWeekends` 時 = 該列第一個 / 最後一個看得見的日子【AI 推導】 | 同上 |
| `PageUp` / `PageDown`、`Shift+PageUp` / `Shift+PageDown` | 上 / 下一個月(去年 / 明年同月)同一日號,不存在則落當月最後一天;`hideWeekends` 時落點被藏就往同方向找,找到的那天跑出目標月就改往反方向(停在目標月裡)【AI 推導】 | 同上 |
| `Enter` / `Space` | 日期格可點:在這一天新增(`onDateClick`);`readOnlyDates`:`Enter` = 進格、`Space` 無動作 | 鍵位同 APG 日期選擇器,動作是新增;唯讀依 `keyboard-model-canonical.md`「進格用什麼鍵」 |
| `F2` | **進格**:焦點移到本格第一個 widget | APG Grid:"F2: ... If the cell contains one or more widgets, places focus on the first widget." |

**格內**(焦點在格內 widget 時 grid navigation 停用,[來源](https://github.com/w3c/aria-practices/blob/0f765e4dc33e966026114ac12a8380db1de3b787/content/patterns/grid/grid-pattern.html#L341-L346))【維持 U7;本段為「+N」與跨日長條補的順序、從每一天進格、`Esc` 回進格那一天是 AI 推導】:widget 的順序 = 畫面由上而下 —— 這一天的事件列 / 長條(依車道)→「+N」。`↓` / `→` 下一個、`↑` / `←` 上一個(到底不繞回);`Escape` / `F2` 出格,回到**進格那一天**的日期停靠點(從第 X 天走到長條再按 Esc,回第 X 天,不是長條起點那一天);事件列 `Enter` / `Space` 開詳情(或 `onEventClick`);「+N」`Enter` / `Space` 開清單。跨日長條從它涵蓋的**每一天**進格都走得到,焦點框畫在整段上。格內模式是焦點所在控件自己的一層(帶 `data-escape-layer`):月曆放在 Dialog 裡,第一下 `Escape` 只出格(`keyboard-model-canonical.md`「焦點所在的控件自己那一層也算一層」)。

工具列的 ‹ / 今天 / › / 新事件是格陣外的標準控件,各自一個 Tab 停靠點。**為什麼進格用 `F2` 不用 `Enter`**:`Enter` 被「在這天新增」佔走;跨元件規則「`F2` 恆為進格;`Enter` 在該格的主要動作沒有佔走它時也是進格」(`keyboard-model-canonical.md`「進格用什麼鍵」)。**跨月的界線是格陣邊界**:非當月的格是有事件、可點的真格,方向鍵走到那裡月份不動,只有走出整個格陣才換月。**刻意不實作**([來源](https://github.com/w3c/aria-practices/blob/0f765e4dc33e966026114ac12a8380db1de3b787/content/patterns/grid/grid-pattern.html#L219-L220)):`Control+Home` / `Control+End`(月格的第一 / 最後一格是溢出日)、`Shift+方向鍵` 切月切年(APG 定義為延伸選取,跨月由 PageUp / PageDown 承接)、選取鍵(第一段沒有選取模型)、型別前導搜尋(APG 月曆範例沒有)。

**浮層的鍵盤**見「「+N」清單浮層」與「事件詳情浮層」的 Esc / 焦點條。

**`renderEventTile` 的鍵盤責任歸屬**:自訂方塊的外層 wrapper 由本元件統一 own `role="button"`、`tabIndex={-1}`、`data-calendar-tile`、焦點框與 Enter/Space activation —— 自訂視覺不會把鍵盤責任推給 consumer。`readOnlyEvents` 時外層只是一層排版用的 `div`。回傳內容必為 presentational(不可再巢狀 button / link),而且必須放得進一列的高度(車道等距)【AI 推導】;第二個參數 `segment` 帶這一段的延續資訊【AI 推導】。

**`renderEventTile` 的滑過責任歸屬**:外層 wrapper 只 own 鍵盤與命中、不畫滑過(它不知道自訂內容的靜止底);滑過由 consumer 在回傳內容上畫,規則與內建事件列同一份:可點才有、唯讀不畫;滑過值 = 自己靜止底的配對(`color.spec.md`「Hover 換色配對總則」);亮起來的形狀 = 命中區,回傳內容要鋪滿 wrapper(`hit-area-canonical.md`「一-4 細則」);宿主格本身不上滑過底(「Cell 規則」滑過條【CELL-HOVER(定)】)。

**Focus**:鍵盤聚焦時(`focus-visible`)畫外描邊,幾何見 `focus-canonical.md`「框怎麼畫」;日期數字鈕走全域 `:focus-visible`;事件列、長條、「+N」、自訂外層往外(見「焦點框」);`readOnlyDates` 的格子往內。

**驗證**:Storybook a11y addon 0 critical violation。對比:文字 4.5:1 / UI 3:1,已知例外一條 —— 淺色主題類別淡底上 step-7 的字有 5 個色相不到 4.5【維持 U10】。(原本的第二條「深色滑過中的格上 7 個色相不到 4.5【U9】」2026-11-26 起不再發生:格子不上滑過底【CELL-HOVER(定)】。)

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `color.spec.md`
- `layoutSpace.spec.md`
