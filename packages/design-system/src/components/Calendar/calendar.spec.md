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
  - W3C APG Grid Pattern: www.w3.org/WAI/ARIA/apg/patterns/grid/
  - W3C APG Date Picker Dialog Example: www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/
---


# Calendar 設計原則

## 定位

Calendar 是**月事件檢視 canvas**,讓 user 瀏覽、定位、快速增減月份事件。週 / 日 timeline 不在本元件 API 中；若未來實作，需以真實行為與獨立規格重新提案，不先保留空 prop / variant。月檢視是本元件唯一已驗證、可維護的 interaction model。

**Layout Family**:**非 4-Family,屬 page-composite**(見 `patterns/element-anatomy/element-anatomy.spec.md`「Page-composite」段)。多區塊 layout(Toolbar / Grid / EventTile / SidePanel),各自 own 自己的 anatomy。

**實作基礎**:
- 自建 composite(非 DayPicker)—— DayPicker 是「date picker 選日期」primitive,event calendar 是「頁面上看事件」的頁面 layout,兩者語意完全不同
- 消費 DS primitive:`<Button>`(prev / next / 今天 / 新事件 CTA);月 grid cell 與 event tile 為元件自身用 CSS grid + token 組合,不另外消費 primitive。日期運算用 `date-fns`
- 日期運算用 `date-fns`(已有 dependency,輕量)——不自造 date math

**與 DatePicker 的區分(重要)**:

| 元件 | 定位 | 互動模型 | 適用 Layout |
|------|------|---------|------------|
| `<DatePicker>` | **選日期**的 form control | 點 trigger → 浮層 Calendar → 選一個 → 回填 input | Field control(form 的一部分) |
| `<DateGrid>`(DayPicker 包裝,2026-04-21 自 Calendar 改名) | DatePicker 的內部 calendar grid primitive | N/A(不直接消費) | Internal to DatePicker |
| **`<Calendar>`**(本元件) | **看事件**的 page-level canvas | 在月 view 中瀏覽 event、點 event 看詳情 | Page layout(整個檢視頁面) |

「User 需要選日期」 → DatePicker。「User 需要看本月會議 / 行程 / 截止日」 → **Calendar**。

**世界級對照**:
- **Notion Calendar**:月 / 週 / 日 view + 左側 filter + 時間軸精確拖拉
- **Google Calendar**:月 / 週 / 日 + 多曆疊加 + 週末 highlight
- **Fantastical**:月 + event tile 顏色強調
- **macOS Calendar**:簡潔 month grid + 左側 mini month

本元件只承諾 **月 view**；未實作能力不預佔公開 API。

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
| 「可以傳 `view="week"` 預留週 view」 | 未實作能力不預佔 API；目前沒有 `view` prop |

---

## API

```tsx
<Calendar
  referenceDate={Date}                      // 當前聚焦日期(月檢視的那個月)
  defaultReferenceDate={Date}
  onReferenceDateChange={(date) => ...}
  today={Date}                              // today highlight / Today button / default month 的同一時間來源;可釘 SSR/測試
  events={Event[]}                          // 事件資料
  onEventClick={(event) => ...}             // 點 event tile 回調;事件方塊可點時必填(見下方「日期格與事件方塊:可點或唯讀」)
  readOnlyEvents                            // 事件方塊唯讀(與 onEventClick 二擇一):不亮、不是按鈕
  onDateClick={(date) => ...}               // 點月 cell / 日期數字鈕回調(用於新增);日期格可點時必填
  readOnlyDates                             // 日期格唯讀(與 onDateClick 二擇一):不亮、日期數字不是按鈕
  onCreateEvent={() => ...}                 // 點「新事件」CTA 回調
  weekStartsOn={0 | 1}                      // 0=Sun, 1=Mon
  renderEventTile={(event) => ReactNode}    // 自訂 event tile 視覺
  locale="en-US"                            // Intl 語系(月份標題 / 星期名;預設 'en-US')
  prevAriaLabel="上個月"                    // i18n override:prev 導覽鈕 aria-label
  nextAriaLabel="下個月"                    // i18n override:next 導覽鈕 aria-label
  navAriaLabel="行事曆月份導覽"             // i18n override:月份導覽 <nav> landmark aria-label
  todayLabel="今天"                         // i18n override:「今天」按鈕文字
  createLabel="新事件"                      // i18n override:「新事件」CTA 文字(僅在傳 onCreateEvent 時渲染)
  className
/>
```

### 日期格與事件方塊:可點或唯讀(2026-09-26,待辦總帳 L8 / C15)

日期格(點一下 = 在這天新增)與事件方塊(點一下 = 打開事件)是**兩個獨立的點擊目標**,各自二擇一:

| 目標 | 可點(預設) | 唯讀 |
|---|---|---|
| 日期格 | 傳 `onDateClick`(**必填**);整格 `hover:bg-neutral-hover`、日期數字是 `<button>`(手形游標、Enter / Space → `onDateClick`) | 寫 `readOnlyDates`、**不可以**傳 `onDateClick`;整格不亮、日期數字是一般文字(同字級、同今天 pill)、游標不變。鍵盤停靠點改為格子本身(見「A11y 預設」) |
| 事件方塊 | 傳 `onEventClick`(**必填**);`role="button"`、滑過同色深一階、`cursor-pointer`、F2 進格可達 | 寫 `readOnlyEvents`、**不可以**傳 `onEventClick`;同色但不帶滑過(`CAT_SUBTLE`,= `CAT_EVENT` 去掉滑過那一段)、不是按鈕、不進格內導覽;截斷時仍有完整標題提示(資訊揭露,不是點擊回饋) |

- **為什麼二擇一、不是「可省略」**:元件本身沒有內建的「新增」或「打開事件」行為(見「禁止事項」:不自動開表單)。若回調可省略、又拿「有沒有傳」決定長相,忘了傳的 consumer 會得到一個長得能點、點了沒反應的月曆 —— `meta-patterns` M23(f) 禁的正是這件事(不以 callback 有無當渲染閘;無內建行為的 callback 必填)。改成型別層的二擇一(discriminated union):沒宣告唯讀就一定要傳回調,宣告了就不准傳,編譯期就逼每個 consumer 講清楚。
- **為什麼要有唯讀**:沒有「點日子新增」的月曆(新增走右上角 CTA 的內容排程、純看的假日行事曆)若照樣整格亮、日期數字照樣是按鈕,就是「看起來能點、點了沒反應」。`../../tokens/color/color.spec.md`「Hover 換色配對總則」:只有「點了會有反應」的元素才有底色的滑過回饋。2026-09-25 批次曾把兩個回調改成無條件必填(C2),等於規定月曆一定可點、沒有唯讀的可能,與此相反,已撤回。
- **命名**:沿用 DS 既有的 `readOnly` 語彙 —— `../Rating/rating.tsx` 的 `readOnly`「唯讀(無 hover / click 響應)」、Field 家族的 readonly 模式(看得到、聚焦得到、改不了)—— 加上作用對象(`Dates` / `Events`),因為兩個目標要能分開宣告。世界級同一個語意:[MUI X `FormProps.readOnly`](https://github.com/mui/mui-x/blob/v9.14.0/packages/x-date-pickers/src/internals/models/formProps.ts#L8-L13)(DateCalendar 繼承:「When read-only, the value cannot be changed but the user can interact with the interface.」)、[React Aria `useCalendarCell.ts#L207-L212`](https://github.com/adobe/react-spectrum/blob/4dd44e0f400636a87a9ad4390903e78c5ae6113c/packages/react-aria/src/calendar/useCalendarCell.ts#L207-L212)(`isReadOnly` 時按下不選取、只把焦點移到那一天 —— 格陣導覽照常)。
- `onCreateEvent` 維持可選,因為「新事件」CTA 本身是條件渲染(見 Toolbar 段),不傳就沒有那顆鈕,不會出現點了沒反應的東西。
- 範例:`展示 — 內容發佈月曆` / `展示 — 空行事曆`(`readOnlyDates`:新增走 CTA,事件點得開)、`設計原則 — 唯讀的日期格與事件`(兩者都唯讀的假日行事曆)。

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

## Anatomy(月 view)

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar:[◀] [今天] [▶] 2026 年 4 月               [+ 新事件] │
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

- **Cell 尺寸**:MVP 月 view cell 最小高度 `min-h-28`(112px),容納日期 header + 3 個 event tile,並隨容器高度伸縮(root `h-full` + grid `flex-1`);寬度 7 欄等分
- **日期 header**:右上角數字(對齊 Google Calendar 視覺慣例)
- **Today cell**:日期數字以 info-filled pill 強調(對齊 Google Calendar today pill)
- **Outside day cell**:上/下月溢出日期**只用淡字**區分(日期數字 `fg-muted`),**不加底色**(2026-09-25 user 選「可以，拿掉底色 (Recommended)」,選項由 AI 提供)。理由:非當月格跟當月格的可點性相同(日期格可點時一樣可點,`onDateClick` = 在這天新增;唯讀時一樣唯讀,見「API」段「日期格與事件方塊:可點或唯讀」與下方「為什麼跨月的界線是格陣邊界」段),所以 (1) 字色用「淡」不用「disabled」—— disabled 字色留給真的不可操作的東西;(2) 底色跟當月格一樣透明,滑過時是同一個滑過色。這跟 DateGrid 的「鄰月日子」是同一條規則(`../DateGrid/date-grid.spec.md` outside 列:淡字、只有文字、比 disabled 弱)。2026-04-21 起的舊寫法「背景略暗」用的是 `bg-muted`,那是「不可操作」的 token(`../../tokens/color/color.spec.md`「Static Subtle Background」段),放在可點的格上造成滑過反而往底色退(淺色變淺、深色變暗;實測淺色 `#F5F5F5` → `#FAFAFA`、深色 `#2F2F2F` → `#262626`),已撤除
- **Hover cell**:日期格可點時整 cell 帶 neutral-hover 提示可點擊新增入口;`readOnlyDates` 時不亮(點了沒反應就不給滑過回饋)
- **命中區**:懸停回饋是**整格**(`hover:bg-neutral-hover`),而整格就是命中區(cell div 的 onClick = `onDateClick`)—— 懸停形狀 ≡ 命中區,合 `ds-canonical/references/hit-area-canonical.md`。右上角的日期數字鈕**不是第二個目標**,是同一個目標的鍵盤入口:它自己沒有任何 hover 樣式,平日底色恆為透明,動作與宿主格相同,也完全落在格內,所以不會生出隱形帶、搶不走別人的點擊。它的 24px 圓盒是**今天 pill 的高度**(平日跟齊 → 跨 cell 數字落在同一條光學基線)+ 焦點框幾何,**不是**某條最小點擊尺寸;原本 `calendar.tsx` 註解寫的「WCAG 2.5.8 ≥24」已於 2026-09-24 撤回(本 DS 以滑鼠指標的精度為前提,不拿觸控尺寸建議當依據)。實測(1280×900,md,`展示 — 團隊行事曆`):平日鈕 24.00×24.00 且背景 `rgba(0,0,0,0)`、數字字面 6.58×17;今天鈕 31.30×24.00(`px-2`)帶 `bg-info`;格 178×155.80,hover 前後格底色 `rgba(0,0,0,0)` → `oklch(0 0 0 / 0.02)`,鈕底色兩次皆透明;掃全部 stylesheet 命中該鈕的 `:hover` 規則 = 0 條。`readOnlyDates` 時沒有命中區可談:格子不接點擊、不亮,日期數字是一般文字
- **Weekend cell**:弱化背景(對齊 Google);MVP 未實作,列後續增量。**約束(2026-09-25,AI 推導、未經 user 確認)**:週末格一樣可點,所以若要加底色**不可用 `bg-muted`**(不可操作的 token,見上方 Outside day cell),而且要同時定好它自己的滑過色,不能沿用透明格的 `neutral-hover`(否則滑過會往底色退:淺色變淺、深色變暗)

### Event tile 規則

- **一般 event(timed)**:事件色相 subtle 底 + 對應文字色(消費 categorical-color SSOT,與 Tag / Avatar 共用 12 色相),單行 truncate
- **All-day event**(2026-06-01 補實作):淡底 tile + 左側實心 accent 條 + 字重略強,排在 cell 事件區頂端(`allDay` 事件排序在有時間事件之前);多日全天事件靠日期範圍 filter 在每個涵蓋日各顯示一條(非單一橫跨多欄的 grid-column span bar——month view per-cell 模型不做跨欄絕對定位)
- **Hover tile**:事件方塊可點時滑過換成同色濃一格(淡底 step-1 → step-2;淺色變深、深色變亮 —— 色階號碼 = 離所在底色多遠,`../../tokens/color/color.spec.md`「Dark mode subtle」;2026-09-26 前深色 step-2 往純黑退,滑過變近黑);`readOnlyEvents` 時不亮(改用不帶滑過的同一組色 `CAT_SUBTLE`)、不是按鈕
- **超出 tile 限制**:每格最多顯示 3 筆事件,超出顯示「+N more」弱化計數文字(對齊 Google Calendar),目前不可點擊(點擊展開 popover 列表為後續增量)

完整 cell + event tile 的 class / token 對照見 anatomy `ColorMatrix` story。

### Toolbar

```
[◀] [今天] [▶]    月份標題(2026 年 4 月)    [+ 新事件]
```

- 左 Nav:`<Button iconOnly>` prev/next + `<Button>今天</Button>` 跳 today
- 中央 title:`<h2 className="text-h3">` or `text-body-lg font-medium`
- 右上 CTA:`<Button variant="primary" startIcon={Plus}>新事件</Button>` — **條件渲染:僅在傳 `onCreateEvent` 回調時出現**(未傳 = 無 CTA;與格子 / 事件方塊可不可點無關,那兩者由「API」段「日期格與事件方塊:可點或唯讀」各自宣告);文案由 `createLabel` prop override(對齊 `todayLabel` 等 chrome 文字 i18n override 慣例)

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

### 邊界案例

- **單格事件 > 3**:只渲染前 3 筆,其餘**不進 DOM**(鍵盤 / SR 不可達),以「+N more」弱化計數提示(不可點擊,展開 popover 為後續增量)
- **極長事件標題**:tile 單行 truncate,不換行不撐高 cell;實際截斷時 hover / focus 顯完整標題 tooltip(僅實際截斷才顯——rule owner `components/Tooltip/tooltip.spec.md:32`「截斷文字 → tooltip」,SSOT `patterns/element-anatomy/truncated-text.spec.md`;tile 是 interactive host → `useTruncated` 自組、trigger = tile 本體、量測內層文字 span;toolbar 月份標題同規則,消費 `<TruncatedText>`)
- **跨月多日事件**:依日期範圍 filter,在每個涵蓋日各顯示一條(含 outside days 與翻月後的新月份)
- **載入失敗 / 舊資料**:無內建 error 狀態(見上)——Calendar 照常渲染 consumer 當下傳入的 `events`,互動不自動禁用;是否 block 由 consumer 決定
- **週末**:目前無週末弱化，週末 cell 行為與平日一致(event tile 照常顯示)。**RTL 不支援**，全域 owner 見 `packages/design-system/README.md#compatibility-matrix`。

### a11y
- Toolbar navigation 用 `<nav aria-label>`(預設 `行事曆月份導覽`,consumer 可由 `navAriaLabel` prop override)
- Month grid 用 `role="grid"`,每 cell `role="gridcell"`(非互動容器 — button 語義禁互動後代,cell 內含事件 tile 不可自身為 button);日期格可點時日期數字為 `<button>`,ISO 格式 `aria-label="2026-04-03,3 個事件"`;`readOnlyDates` 時同一個名字掛在 gridcell 本身(日期數字是一般文字)
- **整個月格陣是一個 Tab 停靠點**(roving tabindex:只有目前焦點日的日期鈕 `tabIndex=0`,其餘日期鈕與全部事件 tile 皆 `-1`)——宣告了 `role="grid"` 就必須同時提供另一套內部導覽機制,SSOT `ds-canonical/references/keyboard-model-canonical.md`「鐵律」
- Event tile `role="button"` + `aria-label`(事件標題,格式 `事件:{title}`);`readOnlyEvents` 時沒有角色、不命名,事件標題就是它的文字內容
- Keyboard:見文末「A11y 預設」(keyboard map SSOT,本節不重複)

---

## 禁止事項

- ❌ 不用 `<DayPicker>` 為底層——DayPicker 是 form control 用,結構不適合 page-level event canvas
- ❌ 不硬寫 month grid 為 `<table>`——用 CSS grid(月 view 為 per-cell 模型不跨欄 span,見「Event tile 規則」;後續週 / 日 view 的 timeline / 拖拉增量需 grid 自由佈局,table 結構難擴充)
- ❌ 不把 event 資料存在元件內部 state——event 是 consumer 責任,本元件是純 view
- ❌ 不自動打開「新事件」表單——`onDateClick` / `onCreateEvent` 回調給 consumer 決定(避免強制開 Dialog UX)
- ❌ 不重造 date math——月 / 週 grid 邊界運算(`startOfMonth` / `eachDayOfInterval` / `isSameMonth` 等)一律用 `date-fns`。**唯一例外(D3 perf,tsx `eventsByDate` memo 有註解)**:每 render 對 42 cells 分桶事件的 hot path 用原生 timestamp 迭代(`new Date(y, m, d).getTime()` + `setDate(+1)`)—— 避免 per-cell `isWithinInterval` 的 O(42×N) 重複掃描;此 raw-Date 迭代**限縮在** bucketing memo 內,不外溢為通則

---

## 已實作範圍

- 月 view(完整)
- Toolbar prev/next/today + title
- Event tile render(單 line + color variant + truncate)
- Today cell highlight
- Outside days visual
- Empty 為常態空白(無內建 empty/loading/error UI)

### 非本 API 的未實作構想

下列能力不以空 prop / disabled control 預佔公開 surface；未來若有真實 consumer，需重新做需求、行為、a11y 與視覺設計：

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

- **無 `SizeMatrix`**:Calendar 沒有 size variant；禁止為未實作視覺保留空 `size` prop。
- **`StateBehavior` 已存在**(today / outside month / 多事件 / event hover / empty cell):Calendar 本身無 `hover / focus / disabled` 互動 prop,但 cell / event tile 的視覺狀態由 anatomy `StateBehavior` story 列舉(對齊 calendar.anatomy.stories.tsx 檔頭 @anatomy-rationale)

---

## 相關

- `../DatePicker/date-picker.spec.md` — 選日期的 form control,本元件姊妹概念(不同職責)
- `../DateGrid/date-grid.spec.md` — DatePicker 內部 calendar grid primitive(DayPicker v9 包裝;2026-04-21 從 Calendar 改名);**不直接面向 consumer**
- `../../patterns/action-bar/action-bar.spec.md` — Toolbar 左中右分組規則
- `../../patterns/element-anatomy/element-anatomy.spec.md` — Page-composite 分類

## A11y 預設

**ARIA / Pattern**:對齊 [W3C ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/patterns/) 對應 pattern。

**Keyboard 行為(實作現況,2026-09-24 補齊 APG Data Grid)**:

模型來源逐字,[W3C APG Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/):

> "Since only one element in the entire grid is included in the tab sequence, grouping with a grid can dramatically reduce the number of tab stops on a page."

> "Implementations of `grid` make these key commands available when an element in the grid has received focus, e.g., after a user has moved focus to the grid with Tab."

焦點放在格子還是格內的鈕,同一份文件的 "Whether to Focus on a Cell Or an Element Inside It" 逐字:

> "A cell contains one widget whose operation does not require arrow keys and grid navigation keys set focus on that widget. Examples of such widgets include link, button, menubutton, toggle button, radio button (not radio group), switch, and checkbox."

所以本元件的真焦點是**日期數字 `<button>`**(SR 會報「按鈕」),不是 `gridcell` 容器。參考實作 [APG Date Picker Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/) 的 Keyboard Support 表逐字寫同一件事:

> "Note that, as specified in the Grid Pattern, only one button in the calendar grid is in the Tab sequence."

**`readOnlyDates` 時焦點改放在格子上**(2026-09-26):日期數字不再是按鈕,格子本身沒有「不需方向鍵的那一個控件」可以停(可點的事件方塊是格內的 widget,照下表用 `Enter` / `F2` 進去),同一節的另一種最優設計逐字是:

> "A cell contains text or a single graphic and grid navigation keys set focus on the cell."

所以唯讀時 roving tabindex 與 `aria-label`(`2026-04-03,3 個事件`)掛在 `gridcell` 本身;方向鍵、Home / End、PageUp / PageDown 與下表完全相同,只有停靠點換了元素。這是跨元件規則 `ds-canonical/references/keyboard-model-canonical.md`「焦點放哪」的直接套用,不是另立例外。

按鍵表(每一條的出處都在右欄;日期格陣內):

| 按鍵 | 行為 | 一手出處(逐字) |
|---|---|---|
| `Tab` / `Shift+Tab` | 進 / 出整個格陣,**只停一次**;停在今天(今天不在本月則停在該月 1 號) | APG Date Picker Dialog:"only one button in the calendar grid is in the Tab sequence" / "If no date has been selected, places focus on the current date." |
| `←` / `→` | 前一天 / 後一天 | APG Date Picker Dialog:"Right Arrow — Moves focus to the next day." / "Left Arrow — Moves focus to the previous day." |
| `↑` / `↓` | 上一週 / 下一週的同一天 | 同上:"Up Arrow — Moves focus to the same day of the previous week." / "Down Arrow — Moves focus to the same day of the next week." |
| `Home` / `End` | 該週的第一天 / 最後一天(依 `weekStartsOn`) | 同上:"Home — Moves focus to the first day (e.g Sunday) of the current week." / "End — Moves focus to the last day (e.g. Saturday) of the current week." |
| `PageUp` / `PageDown` | 上一個月 / 下一個月,焦點落在同一個日號;該日號不存在則落當月最後一天 | 同上:"Page Down — Changes the grid of dates to the next month. Moves focus to the day of the month that has the same number. If that day does not exist, moves focus to the last day of the month." |
| `Shift+PageUp` / `Shift+PageDown` | 去年 / 明年的同月同日,溢位規則同上 | 同上:"Shift + Page Down — Changes the grid of dates to the same month in the next year." |
| `Enter` / `Space` | 日期格可點:啟用目前這一天 → `onDateClick`(native button activation)。`readOnlyDates`:格子沒有主要動作 → `Enter` 等於進格(同下列 `F2`),`Space` 無動作 | APG Date Picker Dialog 的 Date Grid 把 Space/Enter 指派給「選這一天」;唯讀時依 `keyboard-model-canonical.md`「`Enter` 恆為「啟動焦點上的東西」—— 焦點在格上時那就等於進格」 |
| `F2` | **進格**:焦點移到本格第一個事件 tile(`readOnlyEvents` 時方塊不是 widget,沒有可停的,不動作) | APG Grid Pattern:"F2: ... If the cell contains one or more widgets, places focus on the first widget." |

格內(焦點在事件 tile 時,grid navigation 依 APG 定義**已停用**):

| 按鍵 | 行為 | 一手出處(逐字) |
|---|---|---|
| `↓` / `→` | 下一個事件 tile(到底不繞回) | APG Grid Pattern:"Right Arrow or Down Arrow: If the cell contains multiple widgets, moves focus to the next widget inside the cell, optionally wrapping to the first widget if focus is on the last widget." |
| `↑` / `←` | 上一個事件 tile(到頂不繞回) | 同上:"Left Arrow or Up Arrow: If the cell contains multiple widgets, moves focus to the previous widget inside the cell" |
| `Escape` / `F2` | **出格**:焦點回到本格的日期停靠點(可點:日期數字鈕;`readOnlyDates`:格子本身),grid navigation 恢復 | 同上:"Escape: restores grid navigation." / "F2: ... A subsequent press of F2 restores grid navigation functions." |
| `Enter` / `Space` | 觸發 `onEventClick` | 本元件既有行為(tile `role="button"`;`readOnlyEvents` 時沒有可進的方塊) |

Toolbar 的 prev / 今天 / next / 新事件 CTA 是格陣外的標準控件,各自一個 Tab 停靠點(它們不是 `grid` 的後代,不套單一停靠點規則)。

**為什麼進格用 `F2` 而不是 `Enter`**:APG 的 "Editing and Navigating Inside a Cell" 把 `Enter` 與 `F2` **並列**為慣例(原文:"Following are common keyboard conventions for disabling and restoring grid navigation functions.",其下同時列 Enter 與 F2);但同一份 APG 的 Date Picker Dialog 範例把 `Space/Enter` 指派給「選這一天」。本元件的日期鈕有 `onDateClick` 這個真實動作,若把 `Enter` 改成進格就會蓋掉它。取 `F2` 是在 APG **明文列出的兩個慣例之間**擇一,不是自創第三種。

這已經收成**跨元件規則**,不再是本元件的逐案選擇:`ds-canonical/references/keyboard-model-canonical.md`「進格用什麼鍵」—— **`F2` 恆為進格;`Enter` 在該格的主要動作沒有佔走它時,也是進格**。本元件的 `Enter` 被 `onDateClick` 佔走,所以只給 `F2`;`DataTable` 的檢視態儲存格沒有主要動作,所以兩個都給。`readOnlyDates` 的月曆格也沒有主要動作,所以同樣兩個都給。同一條規則解釋三者,不需要例外清單。

**為什麼跨月的界線是「格陣邊界」而不是「月份邊界」**:APG Date Picker Dialog 的月曆只畫當月(參考實作 `datepicker-dialog.js` 的 `updateDate()` 對非當月的格 `domNode.textContent = ''` 並加 `disabled`),所以那裡「離開當月」等於「離開畫面」。本元件的 outside day 是**有事件、可點的真格**(見「Cell 規則 > Outside day cell」),因此等價的不變式是「焦點日必須是一個畫得出來的格」:方向鍵走到 outside day 時月份不動(那一格本來就在眼前),只有走出整個格陣才換月,換月後焦點必定落在目標那一天。

**刻意不實作的 APG 選配鍵**:

- `Control+Home` / `Control+End`(整個格陣的第一 / 最後一格):APG Data Grid 有列,但 Date Picker Dialog 參考實作的格陣 keydown handler 沒有這兩個 case;月曆的「第一 / 最後一格」是上/下月的溢出日,語意上不是使用者想去的地方,`PageUp/PageDown` 已覆蓋跨月需求。
- `Shift+←/→`(切月)、`Shift+↑/↓`(切年):`DateGrid`(react-day-picker v9)有,本元件不跟。APG Data Grid 把 `Shift+方向鍵` 定義為 "Extends selection one cell to the right/left/up/down",在 `grid` 語意下拿它當跨月鍵會與規範衝突;跨月跨年由 `PageUp/PageDown` 與 `Shift+PageUp/PageDown` 承接(與 `date-grid.spec.md:311` 的 `PageUp/Down 切月、Shift+PageUp/Down 切年` 對齊)。
- `Control+Space` / `Shift+Space` / `Control+A` 等選取鍵:本元件沒有 cell / row 選取模型(見「禁止事項」——event 資料是 consumer 責任),無對應功能。

**Keyboard 後續增量**:

- 「+N more」目前不可聚焦也不進 DOM(見「邊界案例 > 單格事件 > 3」);展開 popover 後需一併定義其鍵盤進出。
- 型別前導搜尋(鍵入數字跳到該日)不在 APG 月曆範例中,無一手依據,暫不做。

**`renderEventTile` 的鍵盤責任歸屬**:自訂 tile 的外層 wrapper 由本元件統一 own `role="button"`、`tabIndex={-1}`、`data-calendar-tile`、focus ring 與 Enter/Space activation —— 自訂視覺不會把 keyboard parity 推給 consumer。`readOnlyEvents` 時外層只是一層排版用的 `div`(不是按鈕、不進格內導覽、沒有焦點框),同一份可點 / 唯讀契約。Consumer 回傳內容必為 presentational(不可再巢狀 button / link,否則等於在 grid 裡多開 Tab 停靠點);互動由 `onEventClick` 單一 owner 承接。

**Focus**:鍵盤聚焦時(`focus-visible`)畫 outline 焦點框,幾何見 `ds-canonical/references/focus-canonical.md`「框怎麼畫」(同 button.spec A11y 段;2026-09-24 訂正,原 `ring-2 ring-ring` + box-shadow + `outline-none` 是已退役的寫法)。日期數字按鈕與內建事件 tile 走全域 `:focus-visible` 外描邊(`outline: 2px solid var(--ring)`,往外 2px;元件不寫任何 class);`renderEventTile` 自訂 tile 的外層 wrapper 寫內描邊 `focus-visible:focus-ring-inset`(往內 2px;事件方塊之間 gap 只有 2px,往外會壓到上下相鄰的方塊)。`readOnlyDates` 時焦點在格子本身,格與格之間零間距 → 同樣往內 `focus-visible:focus-ring-inset`(`focus-canonical.md`「問題二」)。

**驗證**:Storybook a11y addon panel 應 0 critical violation。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。
