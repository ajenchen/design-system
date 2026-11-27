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


# DatePicker 設計原則

## 定位

DatePicker 是**單一日期**的輸入與顯示元件(form 場景選定絕對日期的 Field control)。組成(DateGrid + Popover、`Intl.DateTimeFormat` 格式化)見下方「實作基礎」與「格式化」。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 DatePicker 特有的原則。

**Layout Family**:本元件是 `components/Field/field-controls.spec.md` 所擁有的 **Family 4(Field control layout)** 消費者。結構繼承其 `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]` 規格,視覺對齊 Family 1(Menu item)讓 SelectMenu trigger + options 連續一致。

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
- open 跟 draft 暫存生命週期綁死:確認 commit(date-picker.tsx `handleConfirm` → `onChange` + close)/ `needConfirm=false` 選日即關 / Esc + outside-click dismiss。controlled `open` 等於把 draft-commit 時機切一半給 consumer,漏接 → draft 沒 commit / cell 卡 edit。`DatePicker.Range` 更進一步 — open + `activeEnd` 純內部編排,只收 `defaultOpen`(2026-11-27:放在 `InlineEdit` 裡時點一下進編輯就開好日曆、焦點在日曆裡,同 (2) 的 1-step;修前沒有這個參數,Calendar 詳情的時間欄點一下只把焦點交給開始端、要再點一次,user 2026-11-27 原話「為何日期就地編輯點了第一下不會自動 focus?」),不收 `onOpenChange` 與 controlled `open`
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
| 日期範圍（from → to） | **`<DatePicker.Range>`**(本檔下「DatePicker.Range」段,2026-04-21 新增) | 仿 Ant `DatePicker.RangePicker` 架構:雙 input + 箭頭 + 共用 calendar icon,Popover 展開兩月份並列(雙 input:https://github.com/react-component/picker/blob/9ecb0508645e1c0d9f3181263eecafdd1e262f6b/src/PickerInput/Selector/RangeSelector.tsx#L257-L266;箭頭:https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/generatePicker/generateRangePicker.tsx#L177;兩月份:https://github.com/react-component/picker/blob/9ecb0508645e1c0d9f3181263eecafdd1e262f6b/src/PickerInput/RangePicker.tsx#L388-L392) |
| 日期 + 時間（含時分） | **本元件加 `showTime` prop**(canonical 2026-05-02,Ant idiom:`showTime`「To provide an additional time selection」,https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/index.en-US.md#L188) | DatePicker `showTime` / DatePickerRange `showTime` 內建 TimeColumns + 此刻/確定 footer;value 變 ISO datetime |
| 相對時間（「3 天前」「昨天」）| 自訂展示元件 | DatePicker 的 view 態是絕對日期；相對時間需要計算 + locale 格式化 |
| 純文字 YYYY-MM-DD（不需要 picker）| `Input` | 如 API debug 介面、不需互動的純記錄 |
| 生日等「只有月日、不需要年」的欄位 | 目前用 DatePicker 忍受年份 | 多數情境可接受；要極致可自訂 MonthDayPicker |
| 月 / 週 / 日的行程(event)檢視 | **`<Calendar>`** 元件(見 `../Calendar/calendar.spec.md`,月/週/日 event view);**非本元件語義** | DatePicker 是「選日期」的 form control;Calendar 是「看事件」的頁面 canvas,兩者雖名字都有 calendar 但是不同 DS 元件([來源](https://github.com/react-component/picker/blob/9ecb0508645e1c0d9f3181263eecafdd1e262f6b/src/PickerInput/Selector/RangeSelector.tsx#L257-L266)、[來源](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/generatePicker/generateRangePicker.tsx#L177)、[來源](https://github.com/react-component/picker/blob/9ecb0508645e1c0d9f3181263eecafdd1e262f6b/src/PickerInput/RangePicker.tsx#L388-L392)) |

**常見誤解**:(1)「用 DatePicker 選日期範圍」— 單一 DatePicker 只選一天,範圍必用 `<DatePicker.Range>`;(2)「DatePicker = Calendar」— 前者選日期、後者看事件(見上表末列);(3)「date + time 要獨立 DateTimePicker 元件」— 走 `showTime` prop,非分離元件(見「showTime」段)。

---

## DateGrid popup(本 DS 自建)

DatePicker 使用**本 DS 自建 DateGrid** + Popover 而非瀏覽器原生 `<input type="date">`。歷史變更(2026-04-19):原本遵守「不自建 calendar」禁令以保留 mobile 原生 wheel UX,但 `AGENTS.md`「每次任務前的 6 條 mindset」#1 擴充後明確要求「視覺上也必須跟世界級一樣整齊」——原生 picker 視覺不受控、跨瀏覽器不一致,無法達成與 Dialog / SelectMenu / Combobox 等浮層的視覺連續性。遂改為自建 DateGrid。

**命名變更(2026-04-21)**:原 `<Calendar>` 元件改名為 `<DateGrid>`(DatePicker 內部 primitive),讓 `Calendar` 這個命名留給真正的事件檢視 canvas(「Calendar」讓人想到看行程的整頁畫布;挑日期的格子用功能命名,兩個東西不共用一個名字)。DatePicker 內部 primitive 以功能命名為 `DateGrid`。

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
- **today** — 文字下方藍色底線(**非 ring circle**,避免與 hover 混淆)；today 是持續參考點，不與 hover 的瞬時 outline 共用形狀
- **disabled** — 灰底圓圈 + 淺灰字(與 outside month 視覺略有區隔)
- **selected**(single / range 端點) — **藍底白字圓**
- **range track**(中間日期) — 灰底矩形橫條,與端點圓接縫形成連續 bar(實作層級詳 `date-grid.tsx` cell anatomy 註解)
- **hover**(未選中) — 藍圈 outline **無 fill**(非 filled 避免跟 selected 混淆)

**為什麼 selected 用 primary 非 neutral**:DatePicker 的 selected 是「**最終選定日期**」強 affordance,用 primary 顯示確定性。**對照 TimePicker 選項 selected 用 `bg-neutral-selected`**(見 `time-picker.spec.md`),因為 TimePicker panel 是「**列表選中**」語意(user 在時分選項間切換),跟 SelectMenu 同流派。兩者差異 codified 在各 spec,不互調。

**State stacking(組合狀態處理)**:
- today + selected → **selected 勝出**(藍底白字圓)
- today + range-middle → track 灰底 + underline 仍可見
- outside month(鄰月日子)→ **一條原則:只在同一天不會被畫兩次時顯示** —— 一張月曆淡字(不套 disabled 灰底圓,outside 只是「非當月」不是「禁選」)、兩張以上並排不渲染;原則、八家對照與實作 SSOT 見 `../DateGrid/date-grid.spec.md`「鄰月日子:一條原則」

其他區塊(月份 caption / Nav 按鈕 / 星期標頭)視覺層級:月份 caption 與 SelectMenu 標題同等、Nav 按鈕消費 `Button variant="text" size="xs" iconOnly`(色彩走 Button 預設 text-foreground)、星期標頭與 caption 同視覺權重(不弱化,2026-05-03 撤銷 fg-secondary)。

完整 class / token 對照見 anatomy `CalendarTokens` story。

### Spacing canonical(2026-04-21 對齊 user 附圖)

- Popover padding **四邊對稱** 12px(= `--layout-space-tight` @ md density,實作走 `p-3`)
- **左右對稱**:prev/next chevron button 中心 = 第一/最後一欄日期 cell 中心;chevron 到 popover 邊距 = 最邊欄日期到 popover 邊距 = 12px
- **上下對稱**:month caption 到 popover top 距離 = 最後一排日期到 popover bottom 距離 = 12px(均從 `p-3` 繼承)
- day cell 與 week header 尺寸 SSOT → `date-grid.spec.md:116`(消費 `--field-height-sm` token,density-aware:md=28×28 / lg=32×32)

### Typed input(Issue 10,2026-05-10 opt-in)

`typeable?: boolean`(default false)→ trigger 內渲 real `<input type="text" role="combobox">` 取代 `<span>`,user 可直接打字 + Calendar icon 仍開 popover(兩種方式並存:記得日期的人直接打,要對照星期的人開日曆點)。外層 Field wrapper 只負責視覺與 Popover click anchor,不重複 `role` / `aria-*`;popup 開啟、dialog 實際掛載後,真 input 才輸出 `aria-controls` 指向該 dialog,關閉後移除,禁止把 Radix 的懸空 IDREF 留在純視覺 wrapper。Parser `parseDateInput(input, { allowTime, locale })` 接 ISO YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD + native `Date.parse` fallback(RFC 'Mar 12 2026');時間段可以是 24 小時 `HH:MM[:SS]`(照舊),或這個語系 12 小時制的上下午寫法(zh-TW「2026/07/05 下午2:30」、en-US「2:30 PM」,大小寫不分)—— 顯示跟語系之後(下方「格式化」)輸入框裡就是這種寫法,打回去必須認得;上下午的字從 Intl `formatToParts` 反推、不寫死任何語言,「下午13:00」、認不得的字一律不合法(`range-format.ts` `parseTimeText`,判定表 `scripts/test-date-range-format.mjs` Q 列含三個語系 × 0–23 點的往返)【AI 推導 2026-11-26,DATE-TIME(定)的落地細節】。Partial input allow;`Enter`/`Blur` commit;`Esc` reset(**草稿 ≠ 顯示值或格式錯時,那一下 Esc 歸輸入框還原草稿、不關外層浮層**:放在 Dialog 裡第一下只還原草稿、第二下才輪到表單回復 / 關對話框;日曆開著時日曆才是最內層 —— 只關日曆、草稿不動,2026-10-01 前同一下又關日曆又還原;`ds-canonical/references/keyboard-model-canonical.md`「焦點所在的控件自己那一層也算一層」);接 `useFormValidation` 時 consumer 的 `onKeyDown` / `onBlur` 先跑再走元件的、`name` 掛在這個 `<input>`(規則 8 聚焦),輸入框 + 日曆浮層算同一個欄位(`../../lib/composite-field-focus.ts`:焦點搬進日曆不算離開,2026-10-01 待辦總帳 N83;從觸發欄位離開、從彈出層直接離開(開著點空白處 / 直接點下一格 / 不可搜尋的 Select 開著按 Tab)、握著焦點的節點隨收起卸載,都算離開一次(2026-10-21 r1b fields F1:修前判準只掛在觸發欄位,從彈出層直接離開時 consumer 收不到 blur;`useCompositeFieldBlur` 兩邊都聽、關的那一下補量);不可打字的觸發欄位同一條);IME 組字中不誤觸發(鍵盤 `Enter` / `Esc` / `↓` 走全 DS 一支 `../../lib/ime-composition.ts` `isImeComposing` —— 2026-09-30 前這裡只看 `compositionstart/end` 記的旗標,Safari 注音按 `Enter` 選字時 `compositionend` 先到,那一下被當成提交;失焦不是鍵盤事件,仍靠那個旗標)。Invalid → `aria-invalid`。**v1 limits**:US `MM/DD/YYYY` vs EU `DD/MM/YYYY` ambiguous → Date.parse fallback;locale-aware format prop deferred v2;TimePicker typed input deferred(column picker UX 不同)。

**預設 false 的理由**(user 2026-11-17 決定):user 對決策頁 r10 第 6 題④的留言(逐字,貼在「我的建議：乙」那一段):「我要選甲，維持，這開關本來就是由消費者自行評斷情境決定開與否，改成乙並不是在所有情境都比較方便」—— 要不要能直接打字由消費者依情境開 `typeable`;預設維持只能點開日曆選,行為不變。AI 當時建議乙(預設可打字),user 未採。2026-11-15 前這裡的理由只寫了相容,已撤。

## 可輸入模式的開啟行為(2026-09-07,user 提問後查證重訂)

| 怎麼開的 | 日曆 | 焦點 | 為什麼 |
|---|---|---|---|
| **點欄位任何地方**(文字、空白、圖示) | 開 | **留在輸入框,可繼續打字** | Ant Design 官方文件逐字「By clicking the input box, you can select a date from a popup calendar」(https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/index.en-US.md#L14),且 `inputReadOnly` 預設 `false`(https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/index.en-US.md#L113) |
| **鍵盤 ArrowDown / Alt+ArrowDown** | 開 | **進日曆** | [W3C APG date-picker combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-datepicker/) 逐字「opened by activating the choose date button or by moving keyboard focus to the combobox and pressing Down Arrow or Alt + Down Arrow」;焦點不進去就走不了日期格 |

**兩條路不是二選一。** 好用的是滑鼠那條(邊看日曆邊打字),但鍵盤那條不能為了它犧牲可操作性 ——
所以依「怎麼被打開的」分流。

**訂正一則舊宣稱**:先前程式碼註解宣稱「Calendar icon 點才開 popover」是 **Ant** 等兩家的 typed-date idiom ——([來源](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/index.en-US.md#L14))
對 Ant 而言是反的(官方文件:「By clicking the input box, you can select a date from a popup calendar.」https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/index.en-US.md#L14)。而且實測當時**日曆一開焦點就被搬進去,之後完全打不了字**,
等於 `typeable` 這個 prop 的賣點在日曆開啟後就失效。

機械閘:`scripts/datepicker-typeable-open.mjs`。


---

## DatePicker.Range(2026-04-21 新增,仿 Ant Design RangePicker:https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/index.en-US.md#L248)

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
  locale                                // 預設 'zh-TW';也決定日曆面週首日(見「週起始日」)
  weekStartsOn={prefs.weekStartsOn}     // 選填,0 = 週日 … 6 = 週六;沒傳由 locale 推,與 single 共用(app 層同一個值)
  showTime                              // 啟用時間欄位 → value 變 [datetime, datetime]
  showSeconds                           // showTime 時是否顯示秒
  minuteStep={15}
  needConfirm                           // 預設 showTime=true 時為 true
  defaultOpen                           // 選填,預設 false;掛上時面板就開著、作用端從開始端起(就地編輯用,見「Open-pair rationale」)
  formatRange                           // 選填,預設 false;只管 mode="view":兩端寫成一段(同一天合併),見「區間檢視合併(formatRange)」
/>
```

### 結構

外層是 `fieldWrapperStyles` 容器,內含**兩個獨立 button**(start / end input,點任一個都開 Popover **並設定 activeEnd**)、中間 `ArrowRight` icon(`mx-2`,`text-fg-muted`)、右側固定 `CalendarIcon`。作用端(面板開著的那一端 `data-active-end="true"`、面板關著時鍵盤聚焦的那一顆)以一條**壓在欄位框下邊上**的線標示(線長 = 該端文字寬、線色 = 框色;規則見下方「Active-end 機制」視覺指示;對齊 Ant RangePicker 底部 active bar,https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/style/index.ts#L276-L283)。

**外框本身就是點擊目標(2026-09-27)**:外框的內距與 1px 邊框底下沒有按鈕,指到那裡外框會亮(`hover:border-border-hover`),此前點下去什麼都不發生 =「亮著卻點不到」(`ds-canonical/references/hit-area-canonical.md` 一-1;09-27 全面稽核實測抓到,是 N53 那一族漏掉的第 7 處)。規則:點在外框裡、不是任何控件上 → **開離指標最近的那一段**(以起訖兩顆鈕的中線為界:左半開起始日、右半開結束日),焦點落在該鈕;外框游標一般手形(它會開面板,不能打字 —— 此前的 `cursor-text` 是錯的)。同家族 Select / Combobox / TimePicker / PeoplePicker 的外框本身就是點擊目標(`field-wrapper.tsx`「點外框 = 點輸入處」註解),本條只是補齊漏網。世界級同向:Ant RangePicker 整個外框掛 `onClick`(rc-picker https://github.com/react-component/picker/blob/9ecb0508645e1c0d9f3181263eecafdd1e262f6b/src/PickerInput/Selector/RangeSelector.tsx#L238-L249 根節點 `onClick={onClick}` → https://github.com/react-component/picker/blob/9ecb0508645e1c0d9f3181263eecafdd1e262f6b/src/PickerInput/RangePicker.tsx#L471-L487 `onSelectorClick` → `triggerOpen(true)`;mousedown 時 `preventDefault` 讓焦點留在輸入處)、Carbon DatePicker 走 flatpickr `clickOpens: !readOnly`(https://github.com/carbon-design-system/carbon/blob/593de4deda2d96f47f71cdfc9b30d07bd1302304/packages/react/src/components/DatePicker/DatePicker.tsx#L677)。〔做法由 AI 提出;user 09-27 對甲案(點外框 = 開那一段)答「確保符合我們一致的設計語言且不違背世界級的設計就照你建議」,條件式同意,條件核對如上〕

### Active-end 機制(canonical 2026-05-02,對齊 Ant Design RangePicker:聚焦哪一個 input 就切到哪一端,https://github.com/react-component/picker/blob/9ecb0508645e1c0d9f3181263eecafdd1e262f6b/src/PickerInput/RangePicker.tsx#L690-L698)

對齊 Ant Design 實證(react-component/picker 原始碼,https://github.com/react-component/picker/blob/9ecb0508645e1c0d9f3181263eecafdd1e262f6b/src/PickerInput/RangePicker.tsx#L690-L698):**input-click 切換 activeEnd**,而**非** footer toggle / radio 按鈕。

**Source citations**:
- Ant `activeIndex` tracking + `getActiveRange`:`https://github.com/react-component/picker/blob/master/src/PickerInput/RangePicker.tsx`(`function getActiveRange(activeIndex) { return activeIndex === 1 ? 'end' : 'start' }`)
- Ant `useRangeDisabledDate`:`https://github.com/react-component/picker/blob/master/src/PickerInput/hooks/useRangeDisabledDate.ts`(activeIndex=1 + start 已選 → date < start disabled)
- Material X DateRangePicker docs:`https://mui.com/x/react-date-pickers/date-range-picker/`(同 input-driven activeEnd 派)
- Atlassian DateRangePicker:`https://atlassian.design/components/datetime-picker/`

- 點 start input → `activeEnd='start'` + 開 popover;DateGrid range 選的端點落到 start
- 點 end input → `activeEnd='end'` + 開 popover;同理只更新 end
- **Auto-advance**:選完 start → 自動切 `activeEnd='end'` 等待 user 選 end(一次連續選完一段區間,不必再去點結束欄)
- **showTime=true 時 TimeColumns 套 active end 的 time**(只能編一端的時間,符合單一焦點原則)
- 視覺指示:作用端一條**壓在欄位框下邊上**的線(RANGE-FOCUS-BAR(定)2026-11-26;user 第四輪決策卡留言,逐字:「應該是甲，但是你的圖片的底線長度應該要等同於上方的時間吧？」;對話內確認「可以,照甲做」「可以,套用」)
  - 位置:線的下緣 = 欄位框外緣、粗 2px,蓋住那一段 1px 框線,與框線合成一條(不是框線上方再一條)。各尺寸 × 各密度都一樣 —— 位置由文字行盒下緣往下 `--field-control-py-*` + `--field-border-width` 推(`tokens/uiSize/uiSize.css`),不寫死 px。
  - 線長 = 該端文字寬(長日期被截斷時 = 看得到的那一段),不是按鈕寬。
  - 顏色 = 框當下的顏色:一般主色(`--color-primary`,同聚焦時的框);欄位錯誤時紅(`--color-error`,同錯誤的框 —— Field 的錯誤色勝過聚焦色,`../Field/field-wrapper.tsx` error 條)。Field 家族目前沒有警告態;日後加了,線色跟框色走同一個變數(`--range-end-bar-color`)。
  - 高對比模式(forced-colors):線色換成系統色 `Highlight`【AI 推導 2026-11-26,核對發現】。該模式下 `background-color` 會被瀏覽器強制換成底色(只有系統色不換;W3C https://www.w3.org/TR/css-color-adjust-1/ 「Properties Affected by Forced Colors Mode」),畫在背景上的線會消失、起訖兩顆又分不出焦點在哪一顆(違反 `ds-canonical/references/focus-canonical.md`「同一個承擔者被兩個以上 tab stop 共用時,每一顆必須另有自己的區分指示」);框線在該模式由瀏覽器換成 `CanvasText`,線用 `Highlight` 才與框分得出來。
  - 理由(決策卡上甲案的說明,AI 提出、user 選甲):線與框線合成一條,框裡不會多出第二條線(同 Tabs 選中線蓋住下方分隔線 —— `../Tabs/tabs.spec.md`「這兩條線視覺上必須是同一條」);位置貼框,不隨字級與行高變(此前的文字底線 `decoration-primary underline-offset-4 decoration-2` 離框的距離隨尺寸而變)。Ant RangePicker 同位置:active bar `bottom: -lineWidth`、`height: lineWidthBold`、`background: colorPrimary`(https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/style/index.ts#L276-L283),錯誤 / 警告時 active bar 換成 `colorError` / `colorWarning`(同檔 `genPickerStatusStyle`)。
  - 文字段只裁水平(`overflow-x-clip`),不能雙軸裁 —— 線從文字段往下伸到框外緣,雙軸裁切會把它整條裁掉(2026-11-17 A50 是同一類:當時文字底線的下半被裁、2px 只畫出 1px)。
  - 閘 `scripts/datepicker-range-active-underline-invariant.mjs`(量像素:線下緣 = 框外緣、線長 = 文字寬、線色 = 框色;一般 / 大密度 × sm / md / lg × 帶 / 不帶時間、錯誤態、高對比模式(線色 = Highlight)、長日期截斷、Calendar 詳情時間欄,起訖兩端 × 鍵盤 / 點開兩種出現方式 × 像素比 1 / 2)

### Popover 行為

- 用 `mode="single"` + 自管 `rangeModifiers`(**不**用 RDP 內建 `mode="range"`——其 click 配對邏輯與 activeEnd 衝突,見 date-picker.tsx Range DateGrid「mode='single' + manual modifiers」註解);`numberOfMonths={showTime ? 1 : 2}`：date-only Range 兩月並列以便同時看起訖範圍，showTime Range 保留一月讓時間 controls 有穩定空間。**兩月時鄰月日子不渲染**(DateGrid 規則,`../DateGrid/date-grid.spec.md`「outside」列;2026-09-23 user 拍板:同一天不再出現兩次,藍圓與框只畫一次);單月(showTime)鄰月日子照舊顯示淡字
- 點 date → 依 `activeEnd` 更新對應端點(start | end);auto-advance 至 end 等選
- showTime=false:兩端點都填好 → Popover **自動關閉**
- showTime=true:`needConfirm=true`(default),user 按「確定」才 commit + close
- range track 視覺由已選端點靜態算出(`rangeModifiers` 讀 committed start/end,見 date-picker.tsx `rangeModifiers` 註解);**停留預覽**:滑鼠停在／看得見的鍵盤焦點落在某一天時,依 `activeEnd` 算出「點下去會變成」的區間交給 DateGrid 畫成藍色細框 —— 規則表見下方「區間預覽」(2026-09-23 user 拍板;此前此處寫「無 hover 預覽」,那是 2026-06-05 把當時的程式行為抄成文件,不是決定)
- Clear 按鈕清空兩端點 `onChange([null, null])`

### Range 視覺規則

- **range_start / range_end**:沿用 single selected 的視覺(藍底白字圓)
- **range middle**:灰底矩形橫條(實作層級詳 `date-grid.tsx`);停留時不畫單格 hover 圈,由「區間預覽」的框接手(見下段)
- **端點 ↔ 中間的接縫**:端點朝區間外側保留完整圓弧、朝區間內側與矩形無縫銜接,形成連續底色帶；實作 class 對照由 anatomy 管理

### 區間預覽(2026-09-23 user 拍板)

停留(滑鼠 / 看得見的鍵盤焦點)在某一天 d 時,依正在選的那一端算出「點下去會變成」的區間,交給 DateGrid 以藍色細框畫出(畫法 owner:`../DateGrid/date-grid.spec.md`「區間預覽框」;判定純函式 `range-preview.ts`,判定表 `scripts/test-range-preview.mjs`,幾何閘 `scripts/datepicker-range-preview.mjs`):

| 狀態 | 停留在 d | 預覽區間 | 例(已選 5/4–5/12) |
|---|---|---|---|
| 正在選結束日,開始日已選 | d ≥ 開始日 | [開始日, d] | 停 5/20 → 框 5/4→5/20;停 5/7 → 框 5/4→5/7(縮小也看得見) |
| 正在選開始日,結束日已選 | d ≤ 結束日 | [d, 結束日] | 停 5/1 → 框 5/1→5/12 |
| 只選了開始日(第一次點完) | d ≥ 開始日 | [開始日, d] | 選完起點掃過去就看得到長度 |
| 正在選的那一端,對面還空(兩端都空;或正在選開始日而只有開始日) | 任一天 | 不預覽,只有單格 hover 圈 | 沒有另一端可以框 |
| 順序不合(不可點的日子) | — | 不預覽 | 選結束日時停在 5/3 |
| d 與對面那一端同一天 | — | 單格(完整一圈) | 選結束日時停在開始日 5/4(停在既有結束日則仍是 [開始日, 結束日]) |

- **灰色 track 留著**,框疊在上面(現在是這樣 / 準備變成這樣同時看得到)。
- **停留日 = 框的那一端**:不畫單格 hover 圈,只有框的半圓端點,缺口朝區間內側;正在選結束日時停留日在右端(半圓朝右)、選開始日時鏡射。
- **鍵盤同權**:方向鍵移動焦點時同樣預覽(焦點日 = 停留日);只算看得見的焦點(`:focus-visible`),浮層開啟時程式搬過去的焦點不算,滑鼠使用者不會先看到整段框。
- **滑鼠與鍵盤,最後一個輸入贏**:滑鼠移進某格 → 框到那格;鍵盤把看得見的焦點移到某格 → 框到那格,即使滑鼠還停在別格;滑鼠離開**日期格區**(格與格間的縫、可點日子圓外的四個角都算在內;移到月份標題、星期列或 footer 就算離開)時,框退回仍帶著鍵盤焦點的那一天(不是消失);「離開日期格區」不是「離開單格」—— 格與格之間 4px 的縫隙、日期圓外的四個角都**不屬於任何一天**,但 `DateGrid` 在指標停在縫或(可點日子的)角裡時**不把 leave 轉發**出來(縫:2026-09-24 改版,先前是把 day button 的命中區外擴 2px 去吃掉那道縫,那讓命中區大於可視形狀,已撤;角:2026-09-26 補上,先前只算縫,指標沒走在格子正中線上 —— 偏一點、貼邊、斜著走 —— 整條框就會先消失 6–14 步再出現;兩者見 `../DateGrid/date-grid.spec.md`「日期格的命中區 = 可視形狀」的「現行機制」第 2 條),所以指標跨格時不論走不走中線,框都不會先消失再出現。**離開不論快慢都算**(2026-09-26 修 D1,待辦總帳 N54):先前慢慢移出格陣時,指標會先停進最外圈那道縫(那次 leave 依上句被吞),接著從縫走出去已經沒有任何事件清框 —— 框一路卡著,連移到 footer、「確定」鈕或浮層外都不收(showTime 時還出現「框顯示 4/15→5/02、按確定卻套用 4/15–4/20」的不一致);現在格陣本身在指標離開時補送那一次欠著的 leave(畫法與機制 owner `../DateGrid/date-grid.spec.md`「現行機制」第 4 條),框照本句退回鍵盤焦點日或消失。兩張月曆之間的空白也算離開日期格區。清除只由同一種來源做(滑鼠離開只清滑鼠設的、失焦只清鍵盤設的),點日期時前一格的 blur 不會把滑鼠剛設的停留日清掉。
- **縫與角裡點下去 = 點停留日**(2026-09-26):框亮著時,指標停在縫或角裡(框仍停在上一天)點下去,結果與直接點框停著的那一天相同 —— 正在選結束日時,結束日變成那一天、浮層關;游標與日期同為手形。沒有框時(兩端都空、對面那端還空)縫與角點了沒反應、不是手形;鍵盤把框移到別天之後,滑鼠所在的縫與角也不接點擊。只算滑鼠(觸控維持原樣);鍵盤操作不變。規則、理由、世界級對照與實測的 owner → `../DateGrid/date-grid.spec.md`「縫與角裡的點擊」;閘 `scripts/datepicker-range-preview.mjs` `corner` / `gapclick` 兩家族。
- **框不是游標,鍵盤焦點框留在原地**:預覽框只回答「現在點下去會變成什麼」;鍵盤焦點框照 `ds-canonical/references/focus-canonical.md` 規則一留在焦點日,滑鼠 hover 不搬、不抹它(日期格是「不搶反白的常駐清單」:真 DOM 焦點 + roving tabindex,hover 只有 CSS)。所以焦點在 5/5、滑鼠停在 5/20 時,5/5 的往內 2px 藍線與 5/4→5/20 的預覽框同時存在、可以分離 —— 這是預期,不是不一致(user 2026-09-24 問,逐字節錄「為何出現鍵盤焦點之後，再用滑鼠hover在日期上，按照我們其他元件搶焦點的邏輯的話，鍵盤焦點不是應該要消失嗎？」,全句見 `ds-canonical/references/focus-canonical.md` 來源總帳;舊句漏了「的話」等字,2026-09-27 依 M36(a) 換回逐字;搶焦點只屬於 cmdk / Radix Menu 那類「反白 = 唯一游標」的浮層選單;日曆格 hover 與焦點各走獨立通道是五家一手來源一致的做法:[MUI X `DayCalendar.tsx`](https://github.com/mui/mui-x/blob/master/packages/x-date-pickers/src/DateCalendar/DayCalendar.tsx)(`focusedDay` 只由 keydown / focus 改)、[react-day-picker `DayPicker.tsx`](https://github.com/gpbl/react-day-picker/blob/main/packages/react-day-picker/src/DayPicker.tsx)(mouseenter 只轉呼叫 callback)、[flatpickr `index.ts`](https://github.com/flatpickr/flatpickr/blob/master/src/index.ts)(`onMouseOver` 只增刪 class)、[Polaris `DatePicker.tsx`](https://github.com/Shopify/polaris/blob/main/polaris-react/src/components/DatePicker/DatePicker.tsx)(`hoverDate` 與 `focusDate` 兩個 state)、[W3C APG datepicker-dialog.js](https://www.w3.org/WAI/content-assets/wai-aria-practices/patterns/dialog-modal/examples/js/datepicker-dialog.js)(cell 只綁 click / keydown / focus)、[React Aria `useCalendarCell.ts`](https://cdn.jsdelivr.net/npm/@react-aria/calendar/src/useCalendarCell.ts)(hover 只 `highlightDate`))。閘:`scripts/datepicker-range-preview.mjs` 互搶段。
- **停留日的單格圈是靜態壓掉的**:對面那端已有值時,每一個「停留會有框」的格(順序合法的日子)在停留**之前**就不畫單格 hover 圈 —— 單格圈是 CSS 即時的、框是 React 狀態慢一幀,壓制若掛在框上,每次停留都先閃一圈整圓再變成半圓。順序不合的日子與兩端都空時不壓,單格圈照畫。
- **鍵盤焦點框往內畫**:日期格的焦點框一律往內 2px(格與格只隔 4px,track 與預覽框就在縫裡);藍底格(選中日 / 端點)1px 白線退 3px。幾何 owner `ds-canonical/references/focus-canonical.md`「填色元素上的內描邊」,畫法 owner `../DateGrid/date-grid.spec.md` cell state 表「focus-visible」列。
- **showTime 單月同一套規則**(track 是否顯示另管,見「Popover 行為」)。
- 比較只看日,端點帶時間也一樣。

**來源總帳**(user 2026-09-23 原話,逐字):「我反而認為這種日期區間選擇器hover 到日期應該要讓使用者可以看出到底選下去之後實際的區間會變成怎樣，所以我反而認為是可以用現在藍色邊框的視覺語言去預框出選中後的區間」;Q1–Q4、Q6、Q7 「照你建議」(做 / 實線藍框 / 兩端都預覽 / track 留著 / 鍵盤同權 / showTime 同一套);Q5:「若有藍框區間的話,所 hover 到的日期不會是完整的一個圓圈,應該要與藍框區間在視覺上一氣呵成,所以所hover的日期的藍框不會是完整的圓形,而會是一個半圓,至於這個半圓的缺口朝向哪一邊則取決於正在選的是起始日還是結束日」。**先前三句被當成「規則」的文字**(本檔舊句「無 hover 預覽」、`date-grid.spec.md` 舊句「中段 hover ring 一併壓制」、story 舊說明「不出現第二層 hover ring」)都是 AI 在 2026-06-05 / 07-05 / 08-02 稽核時把程式行為抄成文件,沒有任何 user 原話;2026-09-23 差點據此反著修,user 提問後撤回。
同日看過預覽站後(逐字):「為何往前縮短和往後延長的範例看起來是一樣的? 以及為何範例要直接呈現鍵盤焦點?」(示範層兩題,修在 story 的 play:hover 由示範自己建立、開好浮層後放掉程式搬的焦點);「為何我 hover 到日期都會先看到一圈圓形藍色外框,閃了一下,才會變成半圓? 此外,鍵盤操作和滑鼠會hover在日期會造成畫面上的預期區間變得不精確,因為滑鼠和鍵盤沒有搶走彼此的焦點?」(兩題是 bug 回報,解法由 AI 定:靜態壓制 / 最後一個輸入贏);「然後我覺得date 的鍵盤焦點感覺要改成往內畫的那種,否則會跟區間藍框有視覺衝突,你仔細研究看要怎樣」「第五點,應該不只往內畫吧?否則整個選中狀態只會看起來是比較小的藍底?」「我會想要選D,因為 c的白線幾乎要切到文字了,你覺得呢?」+ 結構化選擇「D:1px 白線,退 3px」(焦點線是 user 拍板,兩個候選與數值由 AI 依 [Carbon `_flatpickr.scss#L561-L571`](https://github.com/carbon-design-system/carbon/blob/f577d3573ab87b97fb774a3482402ffed375aa1b/packages/styles/scss/components/date-picker/_flatpickr.scss#L561-L571) 的選中日 `.flatpickr-day.selected:focus { outline: 1px solid $layer-02; outline-offset: -3px }` 提出)。
同日晚間看預覽站(逐字):「圖一為何五月的區塊非五月沒有變成該有非當月的樣式?以前是這樣?我怎麼印象中我們有討論甚至修正過類似的東西?」(查證:從未定義過 outside × range,2026-09-07 只修 outside × disabled)+ 結構化選擇「兩月時不顯示鄰月日子」(user 拍板;兩個候選與各家原始碼出處見 `../DateGrid/date-grid.spec.md`「outside」列)。2026-09-24 user 追問(逐字):「我的意思是兩月不渲染的世界級設計，其一個月預設會怎樣？到底要渲染還是不渲染？是否要一致？世界級的設計是怎樣？」→ 逐家讀原始碼列八家對照後,結構化選擇「維持現況,改寫成一條原則」(user 拍板;原則與對照表見 `../DateGrid/date-grid.spec.md`「鄰月日子:一條原則」);「為何選區間,從某日「水平」移動到其隔日,藍色的區間框線都會閃動一下?」(bug 回報,根因 4px 縫隙,解法由 AI 定);「我不要用滑鼠看範例結果直接就看到鍵盤焦點,我當下明明就沒有用鍵盤操作」(示範層規則,owner `ds-canonical/rules/story-rules.md`「示範 = 滑鼠使用者」)。
2026-09-26(日期縫與角):R21 研究實測本 DS 在日期圓外的角會閃(偏離中線橫越時整條框消失 6–14 步;世界級對照與一手出處見 `../DateGrid/date-grid.spec.md`「縫與角裡的點擊」),以及待辦總帳 N54 建議 ①「預覽亮著的任何位置、包括縫,點下去就得到正在預覽的值」(`governance/planning/2026-09-25-interaction-and-hover-remediation.md` N54 列,AI 措辭)後,同意批次 `:105` 記:「日期縫與角」屬 user 沒點名、依「其餘都照建議做嗎」的問法理解為照建議做的四項(總帳原文標為 AI 判讀、回報時明講);2026-09-26 的實作指示記為 user 決定:「日期圓圈外的角滑過去不再閃」「在縫或角裡點下去 = 確認正在預覽的那一天」「離開整張格陣時預覽照樣收掉(D1 保留)」。依據的原則是 user 同日原話(`:225`,逐字):「我滑到某個區塊但不是滑到文字上但文字卻變色了，此時表示產生了樣式變化，儘管沒滑到文字上，此時點擊也應該要有反應，我的意思是這樣」。「只算滑鼠、觸控維持原樣」與「鍵盤把框移走後縫與角不接點擊」是 AI 依此原則推導的邊界,user 未另外表示。

完整 class 對照見 anatomy `CalendarTokens`(State canonical 表的 `selected` / `range track`)。

### 區間檢視合併(formatRange)

**來源**:user 2026-11-25 在 TIMEFIELD 題選「日期元件檢視加「自動合併」選項，行事曆開啟 (Recommended)」(選項文字由 AI 擬,逐字)。user 定的範圍:`DatePicker.Range` 的 view 加一個選填設定,用 Intl formatRange 同一天自動合併、跨日寫兩端,預設關;Calendar 詳情開啟(由 Calendar 那一包接)。下面的參數名、預設寫法與退回條件是 AI 依此推導的工程細節,逐條標【AI 推導】。

**規則**:
- `formatRange`(預設 `false`)只管 `mode="view"`:兩端都有值時輸出**一段文字**,用標準 `Intl.DateTimeFormat.prototype.formatRange` —— 同一天自動合併、跨日寫兩端、起訖完全相同只寫一個值。合併規則全交給 Intl(ECMA-402 §11.5.8 [PartitionDateTimeRangePattern](https://tc39.es/ecma402/#sec-partitiondatetimerangepattern);MDN:「If the start and end dates are equivalent at the precision of the output, the output will only contain a single date.」[formatRange](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/formatRange)),元件不自己判斷「同一天」。
- **不合併、退回兩段**【AI 推導】:只有一端有值;任一端解析不了;起點晚於終點(值本身有問題,照兩段讓人看到兩端;舊版引擎的 formatRange 對它丟例外、新版照順序寫,兩種都不採);`showTime` 但一端帶時間、一端沒有(合併會吃掉其中一端的時間);執行環境沒有 `formatRange`。
- **退回兩段的長相**【AI 推導 2026-11-25】:版面與 `formatRange={false}` 相同(起 → 終兩段、中間箭頭、各自截斷、空的那端顯示 placeholder),**每一端的日期與時間用合併顯示的同一套寫法**(下方「日期寫法」:兩位數月日、時間 12 / 24 跟語系;傳了 `formatOptions` 也是同一套補法)—— 開了 `formatRange` 的一頁上,合併的列與退回的列並排出現,不會一列 `07`、一列 `7`。2026-11-26 起這套寫法與兩段顯示的預設相同(都是兩位數月日)。時間照每一端自己:只有一端帶時間時,另一端只寫日期(與兩段顯示相同)。只有解析不了的那一端照原樣(與不開相同)。實作 `range-format.ts` `formatDateRangeEndpoint`;判定表 F 列與「同一頁日期樣式一致」性質把退回的列算進去(對照組:退回的列換成 2026-11-25 版的不補零寫法,同一支檢查必紅)。
- **只管 view**【AI 推導】:edit / readonly / disabled 仍是起 → 終兩段 —— 那三種模式的兩端各是一個欄位值(edit 時各是一顆可點、會切換作用端的鈕),合併之後「改哪一端」沒有對象。所以開了 `formatRange` 的 view 與 edit 觸發文字**刻意不同**(下方「格式化」那句「兩者一致」的例外)。
- **結束日照舊是「含」**:本元件的值本來就是含,不做全天換算;拿「不含結束日」資料(例 iCal 的 DTEND)來顯示的呼叫端先自己換成含(Calendar 由 `../Calendar/calendar.spec.md` 那一端換算)。
- **截斷照舊**:一段文字一個 `TruncatedText`,實際截斷才顯示完整值的 tooltip(`../Tooltip/tooltip.spec.md:30`)。

**日期寫法(判定表)**【DATE-TIME(定)2026-11-26】:沒傳 `formatOptions` 時,合併顯示用「數字年月日、**兩位數月日**」+ 時間「時(不補零)+ 兩位數分,**12 / 24 小時跟語系**」—— 與兩段顯示、edit 觸發文字、可打字輸入框同一套(下方「格式化」)。

- **user 原話**(2026-11-26 決策卡 DATE-TIME,逐字):第一輪兩則留言「為何不補零？」「可以跟著語系有一個預設？但是一樣可以獨立調整？然後跟著中文語系預設是12小時，英文的話是24小時？」;第二輪點選「時間跟語系(12 / 24)、日期一律補零,兩者都能單獨覆寫」(選項文字與建議由 AI 擬),同卡留言「補零這件事應該可以不用給覆寫？一律都補零？」(問句;協調者依此回覆「日期一律補零、不另給補零開關;時間 12 / 24 跟語系、可用既有參數覆寫」)。卡上註明 CLDR 依地區不依語言:en-US 也是 12 小時(「10:00 AM」),英文要 24 小時傳 `en-GB` 或用參數覆寫。
- **取代的舊理由**:2026-11-25 版這裡寫「數字年月日、不補零 + 2 位數 24 小時」,理由是 ICU 在只有日期的跨日區間會丟掉補零、不補零才能整頁一致 —— 那是 AI 推導(commit cb4353d7),推不出「只能不補零」;已由上面的 user 決定取代。現在的做法是把 ICU 丟掉的零補回:合併時拿 `formatRangeToParts` 的每一段,選項要求兩位數的月 / 日若被寫成一位數就前面補 0 再接起來(`range-format.ts` `padRangeDateParts`;只補請求了兩位數的欄位,consumer 傳 `month: 'numeric'` 照它)。
- **補零不給開關**:日期一律補零是 DS 預設,沒有另一個參數管它;要別的日期寫法照舊傳整份 `formatOptions`(既有參數)。
- **12 / 24 的覆寫**:傳寫了時間欄位的 `formatOptions`(例 `{ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }`)就照它、不補(判定表 X18)。世界級同一種做法:React Aria `hourCycle`「By default, this is determined by the user's locale.」(<https://react-aria.adobe.com/DateField>)、MUI X `ampm` 預設 `adapter.is12HourCycleInCurrentLocale()`(<https://mui.com/x/api/date-pickers/date-time-picker/>);Ant 是預設 24 小時、不看語系(反例,<https://raw.githubusercontent.com/ant-design/ant-design/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/time-picker/index.en-US.md>)。

下表是 Node 24.14.0 / ICU 78.2 / CLDR 48.0 實得(判定表與對照組 `scripts/test-date-range-format.mjs`,純函式 `range-format.ts`;分隔號兩側與 en-US AM / PM 前的窄空白照 ICU):

| 情況 | 值 | zh-TW | en-US | en-GB |
|---|---|---|---|---|
| 同一天有時段 | 7/15 10:00 → 7/15 11:00 | `2026/07/15 上午10:00至11:00` | `07/15/2026, 10:00 – 11:00 AM` | `15/07/2026, 10:00–11:00` |
| 同一天下午 | 7/5 14:30 → 7/5 16:00 | `2026/07/05 下午2:30至4:00` | `07/05/2026, 2:30 – 4:00 PM` | `05/07/2026, 14:30–16:00` |
| 跨日全天(只有日期) | 7/15 → 7/17 | `2026/07/15至2026/07/17`(ICU 原本寫 `2026/7/15至2026/7/17`,補回) | `07/15/2026 – 07/17/2026`(補回) | `15/07/2026 – 17/07/2026` |
| 跨日有時段 | 7/15 22:00 → 7/16 01:00 | `2026/07/15 下午10:00 – 2026/07/16 上午1:00` | `07/15/2026, 10:00 PM – 07/16/2026, 1:00 AM` | `15/07/2026, 22:00 – 16/07/2026, 01:00` |
| 同一刻 | 7/15 10:00 → 7/15 10:00 | `2026/07/15 上午10:00` | `07/15/2026, 10:00 AM` | `15/07/2026, 10:00` |
| 一端空 | 7/15 10:00 → 空 | 兩段:`2026/07/15 上午10:00` → 結束端 placeholder | 兩段:`07/15/2026, 10:00 AM` → 結束端 placeholder | (同左,兩段) |

對照組(換成它們,同一支「同一頁日期樣式一致」檢查必紅):
- **區間不補零(ICU 原樣)**:只有日期的跨日區間與帶秒的區間,ICU 會丟掉補零 → `2026/7/15至2026/7/17`,同一頁同時出現 `07` 與 `7` —— 補回那一步拿掉就紅。
- **文字月份 / `dateStyle`**(例 `dateStyle: 'full'` 同一天有時段是 `2026年7月15日 星期三 上午10:00–11:00`):zh-TW 只有日期的跨日區間一律換成數字月日 → `2026/7/15星期三至2026/7/17星期五`;同一頁會同時出現「年月日」與斜線兩種。
- **退回兩段不補零(2026-11-25 版)**:合併的列補零、退回的列不補,同一頁一列 `07`、一列 `7`。

傳了 `formatOptions` 時:日期段照它;`showTime` 而它沒寫任何時間欄位,就補上預設時間(用 `dateStyle` 的補 `timeStyle`,因為 Intl 不准兩者與 `hour` 混用;其餘補「時 + 兩位數分」、12 / 24 跟語系,有秒再補秒);退回兩段的每一端也用這同一組選項。自訂寫法的樣式一致由呼叫端負責 —— `dateStyle` 那條陷阱照樣會出現(判定表保留 `dateStyle: 'full'` 那兩列當證據)。其他語系照 CLDR 的區間資料,本表只保證 zh-TW、en-US、en-GB(例:ja-JP 同一天有時段的區間是「14時30分～16時00分」,與單獨 format 的「14:30」不同,本元件不改寫)。

**為什麼是選填、預設關**:設計系統的日期區間元件不在檢視時自動合併,出口是自訂格式函式,或在欄位外的文字用 Intl formatRange ——
- Mantine:預設兩端各自格式化再用 `labelSeparator` 接起來([get-formatted-date.ts L31-L33](https://github.com/mantinedev/mantine/blob/8f2ae606f8a37d5971f8315685e7daab44d9fbe2/packages/@mantine/dates/src/utils/get-formatted-date/get-formatted-date.ts#L31-L33));要別的寫法用 `valueFormatter`:「`valueFormatter` is a more powerful alternative to the `valueFormat` prop. It allows formatting the value label with a custom function.」([date-picker-input.mdx L59-L60](https://github.com/mantinedev/mantine/blob/8f2ae606f8a37d5971f8315685e7daab44d9fbe2/apps/mantine.dev/src/pages/dates/date-picker-input.mdx#L59-L60))。
- MUI X:每一端的寫法用欄位的 `format`、中間的分隔號用 `dateSeparator`,沒有把兩端合併的選項 —— 「You can use the `dateSeparator` prop to change the separator rendered between the start and end dates」([custom-field.md L27](https://github.com/mui/mui-x/blob/30c4193c80aaaa0362aad752ae92fbfeb61b4461/docs/data/date-pickers/custom-field/custom-field.md#L27));官方 Button 欄位範例也是兩端各自 `date.format(pickerContext.fieldFormat)` 再用 ` – ` 接起來([MaterialDateRangePicker.tsx L38-L42](https://github.com/mui/mui-x/blob/30c4193c80aaaa0362aad752ae92fbfeb61b4461/docs/data/date-pickers/custom-field/behavior-button/MaterialDateRangePicker.tsx#L38-L42));要別的長相就整個換掉 field(custom-field.md「Using a Button」,[L125](https://github.com/mui/mui-x/blob/30c4193c80aaaa0362aad752ae92fbfeb61b4461/docs/data/date-pickers/custom-field/custom-field.md#L125))。
- React Aria / Spectrum:欄位外的檢視文字示範 `formatter.formatRange(...)`([DateRangePicker.mdx L300](https://github.com/adobe/react-spectrum/blob/b1e8cf579fcc4cda0031f09d7d4e3bdff299fc3a/packages/@adobe/react-spectrum/docs/datepicker/DateRangePicker.mdx#L300));`DateFormatter.formatRange`「Formats a date range as a string.」([DateFormatter.ts L43-L44](https://github.com/adobe/react-spectrum/blob/b1e8cf579fcc4cda0031f09d7d4e3bdff299fc3a/packages/@internationalized/date/src/DateFormatter.ts#L43-L44))。

本 DS 把「欄位外用 formatRange」收成元件自己的 view 選項,讓 InlineEdit 這類「檢視文字要渲染控件自己的 `mode="view"`、禁止自刻」的消費端(`../InlineEdit/inline-edit.spec.md` `renderRead` 那一列)不必另組字串;預設關,其他用到 `DatePicker.Range` 的地方畫面不變。

**參數名**【AI 推導,命名 3 重 test】:(1)與同一個元件既有的 `formatOptions` 同一族(都是「交給 Intl 怎麼寫」);(2)同一個詞、同一個意思至少兩家:ECMA-402 `Intl.DateTimeFormat.prototype.formatRange`([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/formatRange))、React Aria `DateFormatter.formatRange`([DateFormatter.ts L43-L44](https://github.com/adobe/react-spectrum/blob/b1e8cf579fcc4cda0031f09d7d4e3bdff299fc3a/packages/@internationalized/date/src/DateFormatter.ts#L43-L44));(3)全 DS 沒有同名參數,唯一同字是 `../DateGrid/date-grid.stories.tsx` 範例裡的本地函式,意思相同(把起訖寫成一段字),不是公開 API。Mantine `valueFormatter`([date-picker-input.mdx L59-L60](https://github.com/mantinedev/mantine/blob/8f2ae606f8a37d5971f8315685e7daab44d9fbe2/apps/mantine.dev/src/pages/dates/date-picker-input.mdx#L59-L60))、MUI 自訂 field([custom-field.md L125](https://github.com/mui/mui-x/blob/30c4193c80aaaa0362aad752ae92fbfeb61b4461/docs/data/date-pickers/custom-field/custom-field.md#L125))是「整個換掉格式函式 / 欄位」,不是同一件事,不採這兩個名字。

### 禁止

- ❌ 不自刻「兩個 `<Input>` + 中間箭頭」繞過 `DatePicker.Range`(canonical 本元件提供)
- ❌ 不讓 Popover 在選第一個端點後就關閉(違反 range selection UX)
- ❌ value 用單字串 `"2026-01-01/2026-01-07"`——必 `[string | null, string | null]`,語意清楚 + 避免 parse 錯誤
- ❌ Range active-end **不**用 footer toggle / radio 切換(欄位本身就是「現在在選哪一端」的指示,再加一組切換鈕等於兩個入口說同一件事);必走 input-click

---

## showTime(2026-05-02 新增,Ant idiom 整合 datetime:https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/index.en-US.md#L188)

### API

```tsx
<DatePicker
  showTime                              // 啟用時間欄位 → value 變 ISO datetime
  showSeconds={false}                   // 是否顯示秒(預設 false:表單多半只到分鐘,秒欄是雜訊;Ant 預設格式含秒 HH:mm:ss,這裡刻意不同)([來源](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/time-picker/index.en-US.md#L63)、[來源](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/index.en-US.md#L259))
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
- TimePickerSidePanel **header dynamic 顯示當前 active time**(`HH:MM` / `HH:MM:SS`),對齊 Ant `<DatePicker showTime />` panel header(rc-picker TimePanel 標題列顯示目前值,https://github.com/react-component/picker/blob/9ecb0508645e1c0d9f3181263eecafdd1e262f6b/src/PickerPanel/TimePanel/index.tsx#L33-L35;canonical 2026-05-03 v9)。**面板跟欄位同一份 12 / 24(TIME-12H-PANEL(定)2026-11-26)**:user 第三輪決策卡點選「A:12 小時語系時,面板加一欄「上午 / 下午」,時欄改成 1–12;面板標題和空白提示字也用 12 小時」,對話內確認「可以,照 A 做」;24 小時語系不變。12 小時語系(例預設 zh-TW)面板最後多一欄上下午、時欄只列這半天的 `12`、`01`…`11`,標題與欄位同一份時間寫法(「下午2:30」,`range-format.ts` `formatPanelTime`);24 小時語系照舊 `HH:MM`。判斷、欄位順序、上下午的字、世界級對照都與 TimePicker 同一條(`../TimePicker/time-picker.spec.md`「顯示格式化」的面板 12 / 24 小時);單日與 Range 的面板都經 `resolveTimePanelFormat(locale, resolveDateRangeFormatOptions(true, showSeconds, formatOptions), …)`,`formatOptions` 寫了 `hourCycle: 'h23'` 的面板也是 24 小時。面板寬隨欄數(`../TimePicker/time-columns.tsx` `timeColumnsWidthClass`,`CalendarTimeContainer` 的佔位讀同一支),12 小時制多上下午一欄、加寬約 80px【AI 推導,列入預覽清單】;空值時標題的「--:--」不變【AI 推導】
- 欄位裡的字(edit 觸發文字、view / readonly / disabled、可打字輸入框):日期 + 時間一次交給 `Intl.DateTimeFormat`,日期兩位數月日、時間 12 / 24 跟語系 —— zh-TW「2026/07/05 下午2:30」、en-US「07/05/2026, 2:30 PM」、en-GB「05/07/2026, 14:30」(DATE-TIME(定)2026-11-26,規則與原話見「區間檢視合併(formatRange)」日期寫法);改前時間一律接 24 小時 `HH:MM`、不看語系也不看 `formatOptions`
- TimePickerSidePanel 結構:**pt-3 + h-field-xs flex center + mb-3**(top 對齊 DateGrid month_caption 同 Y baseline;**bottom = 0,讓 time list 連續延伸到 SurfaceFooter border-t**,對齊 Ant time-picker 「continuous scroll」idiom — canonical 2026-05-03 v10)
- TimePickerSidePanel header **下方無 divider**(對齊 DateGrid month_caption 也無 border-b),DS internal canonical M23 優先於 Ant time-picker header divider 慣例 — 兩 panel 同層級 caption 視覺對稱(canonical 2026-05-03 v10)
- 底部 footer **消費 SurfaceFooter SSOT**(`patterns/overlay-surface`)— border-t + py-tight,**不**自寫 Separator + p-2 + ml-auto wrapper(canonical 2026-05-03 v8)。
  **左右內距覆寫成 12px**(`px-[var(--item-px,var(--field-px))]`,與 `DateGrid` 根同一個運算式):判準 owner 是
  `../../patterns/overlay-surface/overlay-surface.spec.md`「`SurfaceFooter` 的左右內距要對齊誰」——
  footer 對齊的是**這個浮層的內容左邊界** = **12px**(2026-09-18 user 拍板以原規格的 12 為準)。
  寫法是 `px-[var(--item-px,var(--field-px))]` —— 跟 `DateGrid` 容器**同一個運算式、同一個來源**,
  不是兩個剛好都等於 12 的字面值。實測:chevron 12 = 星期標頭 12 = 日期格 12 = footer 按鈕 12。
  完整脈絡(最外圈 4px 怎麼來的、為何抵銷、上游與同 repo 先例)在
  `../DateGrid/date-grid.spec.md`「Spacing canonical」(**那裡是 owner,本處不重述**)。
  **不是**「canonical 所以 px-loose」—— 那句話會讓人照抄到沒有 header 的下拉選單裡,
  2026-09-17 就這樣差出 4px(33 vs 29)。
  ✅ **2026-09-18 起兩邊是綁定的,不再是巧合**:footer、`DateGrid` 根、右側時間欄的上內距
  三處讀**同一個運算式** `var(--item-px,var(--field-px))`;任何容器覆寫 `--item-px`,三者一起動。
  (原文寫「兩個不相干的字面值剛好相等、改一邊另一邊不會跟」,那是 `p-3` 還是字面值時的狀況,已過期。)
  機械防線仍在:`scripts/overlay-footer-gutter-invariant.mjs` 量像素、不看寫法,那支閘不得退役
- Footer 排版(對齊 Ant `marginInlineStart: auto` on OK):左「此刻」(`mr-auto` push)、右「確定」(needConfirm)或「關閉」
- Range showTime footer **無「此刻」**(對齊 Ant `showNow={multiple ? false : showNow}`)— 只「確定」走 SurfaceFooter justify-end
- value 格式:`'YYYY-MM-DDTHH:MM:SS'`(local-time 語意,不帶 timezone)
- needConfirm=true 時 user 編輯先暫存 draft,trigger text 即時讀 draft(canonical 2026-05-03 v8 修);按確定才 onChange;false 時邊編邊 commit
- **needConfirm 獨立於 showTime**(2026-07-05 D4 codify):date-only `<DatePicker needConfirm>` 亦成立,footer 渲染 gate = `showTime || needConfirm`(single 與 Range 一致)——needConfirm 時「確定」是唯一 commit 路徑,漏渲 footer = draft 永遠無法 commit 的死路(2026-07-05 修 single 漏 `|| needConfirm`)
- showSeconds=false(default)→ TimeColumns 只顯示 H/M(對齊 Ant 預設)
- Range cell disable(對齊 Ant `useRangeDisabledDate`):activeEnd='start' + end 已選 → date > end disabled;activeEnd='end' + start 已選 → date < start disabled
- Range stadium pattern(canonical 2026-05-03 v8):SSOT → `../DateGrid/date-grid.spec.md`(`range_start` / `range_end` 半圓 stadium 規則;class 細節見 `date-grid.tsx`)

### 為什麼用 prop 而非分離 `<DateTimePicker>` 元件

世界級對照:**Ant Design 採 prop 模式**(`showTime`);**MUI X 與 Atlassian 反而是分離元件**(`<DateTimePicker>`)。本 DS 採 prop 模式的理由是 M21 prop-variant test(同一個欄位、同一種值,只多時間欄)。Source([來源](https://cdn.jsdelivr.net/npm/@mui/x-date-pickers@8.29.5/DateTimePicker/index.d.ts)、[來源](https://cdn.jsdelivr.net/npm/@atlaskit/datetime-picker@19.4.2/dist/types/index.d.ts)、[來源](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/index.en-US.md#L188)):
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
| `locale` | BCP 47 locale,預設 `'zh-TW'`(DS 日期元件共用的 `DEFAULT_DATE_LOCALE`,`../../lib/date-locale.ts`) | `'zh-TW'`、`'en-US'` |

預設(未傳 `formatOptions` / `locale`)直接組 `YYYY/MM/DD`(locale-independent,對齊 Ant year-first:Ant 預設 `YYYY-MM-DD`,https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/index.en-US.md#L183;見 date-picker.tsx `formatDate` 註解);這個字面跟預設語系 zh-TW 走 `Intl.DateTimeFormat` 兩位數年月日的輸出相同(`2026/07/15`)。傳 `formatOptions` / `locale` 才走 `Intl.DateTimeFormat`(沒傳 `formatOptions` 時用 `range-format.ts` `DATE_RANGE_DEFAULT_DATE_OPTIONS`,同一份兩位數年月日),只傳 `formatOptions` 時語系用 zh-TW。

**日期一律補零、時間跟語系(DATE-TIME(定)2026-11-26)**:數字日期一律兩位數月日,不給補零開關;`showTime` 且值帶時間時,時間段 =「時(不補零)+ 兩位數分」、12 / 24 小時跟語系(CLDR 依地區:zh-TW、en-US 12 小時,en-GB、ja-JP 24 小時),zh-TW 例「2026/07/05 下午2:30」。單日、Range 兩段、edit 觸發文字、可打字輸入框、合併顯示全部同一套(`range-format.ts` `resolveDateRangeFormatOptions` 一支);要固定 24 小時就在 `formatOptions` 寫時間欄位(例 `hourCycle: 'h23'`),寫了就照它。user 原話與取代的舊理由見「區間檢視合併(formatRange)」日期寫法;同一條規則在 TimePicker(`../TimePicker/time-picker.spec.md`「顯示格式化」)與 Calendar(`../Calendar/calendar.spec.md`「資料語意」時間顯示)。

View / readonly / disabled 模式(含 DataTable cell)與 Edit 模式 trigger 文字同一條格式化路徑,兩者一致;唯一例外是 `DatePicker.Range` 開了 `formatRange` 的 view(兩端寫成一段;合併不了而退回兩段時每一端也用同一套寫法;判定表見「區間檢視合併(formatRange)」)。

**預設語系 zh-TW(2026-11-24)**:user 選「全 DS 日期元件一起改 zh-TW (Recommended)」(選項為 AI 擬;Calendar / DatePicker / TimePicker 同一個預設)。之前是 `'en-US'`:只傳 `formatOptions` 沒傳 `locale` 的欄位,文字從英文變中文(例 `{ year: 'numeric', month: 'long', day: 'numeric' }`:「April 2, 2026」→「2026年4月2日」);什麼格式參數都沒傳的欄位畫面不變。

## 不可選日期(`disabledDate`,2026-11-26)

`disabledDate?: (date: Date) => boolean`:回 `true` 的那天不可選。單日與 `DatePicker.Range` 都收。產品 canary 回報 C33:不可選日期的樣子與行為早已定好(本檔「Cell state canonical」的 disabled 列、`../DateGrid/date-grid.spec.md`「Disabled day」),Range 內部也已經用同一條管線把順序不合的日子設成不可選,缺的只是公開參數。

- **畫面與互動**:不另定 —— 轉給 DateGrid 的 `disabled`,灰底圓圈 + 淺灰字、點不動、鍵盤導覽跳過(date-grid.spec.md「Disabled day」)。
- **Range**:「順序不合」與 `disabledDate` 任一成立就不可選(同一支判斷,`date-picker.tsx` `isDayDisabled`);起訖兩端都不能落在不可選的日子。區間中間跨過不可選的日子不另擋(本參數只管「能不能點那一天」)。
- **可打字**(`typeable`):打進一個不可選的日期 = 跟解析失敗同一條路(`aria-invalid`、保留草稿讓使用者修,見「驗證時機」)【AI 推導 2026-11-26,依「Typed input」與「驗證時機」的解析失敗寫法,列入預覽清單】。
- **後端給清單**:在函式裡查那份清單;清單還在抓時怎麼辦見「邊界案例」Loading 那條。
- **範例**:`date-picker.stories.tsx`「不可選日期:門市維修預約」(週末與 12/25 不可選,可打字)。
- **命名**:三重測試 —— (1) DS 詞彙:DateGrid 已用 `disabled` 表示「不可選的日子」,DatePicker 的 `disabled` 是整個欄位停用,所以加 `Date` 區分;(2) Ant DatePicker 公共 API 同名同義「disabledDate — Specify the date that cannot be selected」(https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/date-picker/index.en-US.md),Element Plus 同名「The disabled date is set by `disabledDate`, which is a function」(https://element-plus.org/en-US/component/date-picker.html);(3) DS 內沒有其他元件用 `disabledDate`。
- **尚未定案**:showTime 時面板底的「此刻」鈕在今天不可選時要不要停用,屬新的畫面決定,本次不改(鈕照舊可按),待 user 決定。

## 週起始日

日曆面(單日與 `DatePicker.Range` 都是)一週從哪天開始:有傳 `weekStartsOn`(0 = 週日 … 6 = 週六)就用;沒傳時由 `locale` 推 —— 語系 → CLDR,規則的唯一住處是 `../DateGrid/date-grid.spec.md`「週起始日」(實作 `../../lib/date-locale.ts` `resolveWeekStartsOn`)。預設語系 zh-TW = 週日,所以沒傳 `locale` 也沒傳 `weekStartsOn` 的日曆畫面不變;傳 `locale="en-GB"` / `"de-DE"` / `"zh-CN"` 的,2026-11-24 起日曆面是週一起(之前日曆面一律是 react-day-picker 預設的週日起,不看 `locale`)。產品有「一週從週一開始」這類使用者偏好時,在 app 層把同一個值傳給每一個日期元件的 `weekStartsOn`(不要在個別元件寫死數字,理由見 DateGrid 設計原則「週首日不可在元件內硬寫」)。日曆面的月份與星期文字仍是 react-day-picker 預設的英文,`locale` 目前只管欄位文字與週首日。

---

## Clearable

`clearable` prop 在有值時顯示 clear 按鈕（endAction）。

- 只在 edit 模式顯示
- 清除後 `onChange?.('')`（空字串 = 空值；view 態顯示半形 -,text-foreground）
- **鍵盤清得掉**:焦點在清除鈕上按 `Enter` / 空白 = 清除(按鈕自己的行為),**不**打開日曆 —— 觸發欄位的 `onKeyDown` 對「事件來自欄位裡的按鈕」直接放行(Select / Combobox / TimePicker 2026-07-14 已修同一條,本元件 2026-09-30 補:修前這兩鍵被觸發欄位 `preventDefault` 吃掉、改成打開日曆,鍵盤永遠清不掉,實測)
- **清除後焦點**:按鈕隨清除卸載,焦點在它身上時交回欄位(可打字 → 輸入框;否則觸發欄位;區間 → 起始日那顆鈕),不掉到 `body`(`../Field/field-wrapper.tsx` `keepFieldFocusBeforeUnmount`,Select / Combobox / TimePicker 同一支)
- **Dual-state sync canonical**(2026-05-03 v10):X 點擊必同時 `onChange?.('')` + `setDraft(null)`(Range 同),否則 `needConfirm=true`(showTime 預設)且 popover 開著時 `displayValue=draft` 仍顯示舊值,trigger 看起來「沒清」。X 在 trigger 上是 standard clear affordance,不走 needConfirm「等確定」語義 — 立刻 commit + 同步 draft

---

## 禁止事項

- ❌ 不在 readonly / disabled 模式顯示 clear 按鈕
- ❌ 不改 DateGrid 視覺 token 為本 DS 以外的顏色(`bg-primary` / `ring-primary` 等必須來自 semantic token,不可硬寫)
- ❌ 不用其他 calendar library 平行實作(若有 DateRange / DateTime 未來需求,擴充本 DateGrid 而非引入第二個 library)

---

## 元件封裝慣例例外說明(稽核第 9 維)

DatePicker 套 `React.forwardRef` + `displayName`;`DatePickerProps` extends `Omit<React.HTMLAttributes<HTMLDivElement>, 'value' | 'onChange' | 'placeholder' | 'defaultValue'>`,剩餘 DOM attrs `...props` spread 到**當前 mode 的 root wrapper**(edit trigger `<div role="combobox">` / readonly · disabled wrapper div / Range wrapper div)。

**例外**:`mode="view"` 預設(未 opt-in `showDisplayEndIcon`)輸出裸 `<span>`,**不** spread `...props`——consumer 傳 DOM attrs(`data-testid` / `onFocus` 等)時注意 view 模式不生效;`className` 各 mode 皆顯式接收(套在該 mode 的 root 元素)。

**`asChild` 不支援**:trigger 是 compound(view 裸 span / edit `div role="combobox"` 不同 render tree),無單一 Slot 目標。consumer 若要自訂 trigger 視覺,改用 `<DatePicker mode="view">` + 自家 Button composition。

---

## A11y 預設

**Focus**:Field 家族的焦點指示 = **欄位邊框轉主色 1px**,不畫全域 2px 外框,**不分滑鼠鍵盤**(owner = `ds-canonical/references/focus-canonical.md` 規則二「Field 家族控件本身」列;關閉時觸發器 wrapper 自己是焦點站,只有邊框轉色 —— 全域 `:focus-visible` 由 `fieldWrapperStyles` 的 `focus-visible:outline-none` 抑制,@focus-suppress C)。**自己的浮層開著時**維持同一個聚焦的框,不看焦點留在欄位裡還是已搬進浮層(唯一出處 `../Field/field.spec.md`「Field state machine SSOT」;本句 2026-11-12 前寫「不分開著關著」並說開啟時焦點在裡面的插入點控件,對焦點會搬進浮層的情形不成立,已更正)。唯讀態:同樣是邊框轉主色 1px,但**只在鍵盤聚焦時畫、滑鼠點不變**(2026-11-11;`../Field/field-controls.spec.md`「Focus 行為」readonly 段。本句 2026-09-10 前寫「改由全域外描邊畫」,已過時)。閘:`virtual-cursor-modality-invariant.mjs` G / H 段。 typeable 變體焦點在真 `<input>`(插入點控件)、非 typeable 在 wrapper,兩者同樣只有邊框轉色;Range 的起訖兩顆共用同一圈邊框,靠作用端那條壓在框下邊上的線區分(線色 = 框色;見上方「Active-end 機制」視覺指示)。

- Trigger:非 typeable 由 Field wrapper 持 `role="combobox"`;typeable 由真 `<input>` 持 combobox 語意,外層 wrapper 不重複 ARIA。兩者皆有 `aria-haspopup="dialog"` + `aria-expanded={open}` + accessible name(`aria-label` / 或外層 `<label>` / 或 fieldCtx label),並只在 popup 已掛載時輸出 `aria-controls` 指向同一個 dialog ID(關閉時移除,不得留下懸空 IDREF)
- Popover content:`role="dialog"`;單一日期 popover 的 PopoverContent 帶 `aria-label="日期選擇"`(date-picker.tsx#DatePicker,DS default dialog label),Range popover 加 `aria-label="日期區間選擇"`
- DateGrid 鍵盤:Arrow keys 切日 / PageUp/Down 切月 / Home/End 行首尾(react-day-picker v9 內建);Range 模式下焦點移到哪一天就預覽哪一天(見「區間預覽」),鍵盤與滑鼠看到同一件事
- Trigger 鍵盤(Space / Enter open;Esc close + 回焦):單一 DatePicker 的 `<div role="combobox">` 無 native Enter/Space→click,由元件**自建 `onKeyDown`** 開 popover(Radix PopoverTrigger 只 compose onClick;`date-picker.tsx#DatePicker` 觸發點 `onKeyDown` 上方那段註解),Esc 關閉後靠 PopoverTrigger 的 Radix **內建** `triggerRef.focus()` 回焦;**可打字時**外層觸發 div 不可聚焦(焦點站是內層 `<input>`),Radix 還給它 = 什麼都沒還 —— 鍵盤 `↓` 開日曆(焦點進日曆)再按 Esc 收起,焦點掉到 `body`(2026-10-01 實測:修改前的基準樹量到 BODY),改由 `onCloseAutoFocus` 經 `../../lib/overlay-focus-return.ts` `returnFocusToOpener`(沒有觸發點)還給輸入框:鍵盤收起 / 在日曆裡挑日期 → 回輸入框(指標挑的不畫鍵盤框),點外面收起不搶(AI 推導,同 Range 的既有做法;閘 `scripts/escape-and-focus-contract-invariant.mjs` F-date-return);Range 用 native `<button>` onClick 開、只掛 PopoverAnchor(triggerRef 恆 null → 內建回焦 no-op),改由 `onCloseAutoFocus` 交給全 DS 一支 `../../lib/overlay-focus-return.ts` `returnFocusToOpener` 回焦 active 端 button(沒有觸發點 + 非 modal:點外面收起不搶;守 WCAG 2.4.3;2026-09-30 前本元件自己記 `hasInteractedOutside`,判斷相同)
- Range 雙 trigger:`activeEnd` state 指向當前編輯端,`aria-expanded` 對應只當該 trigger active 時 true

---

## 驗證時機

走 Field SSOT(`Field/form-validation.spec.md`)。DatePicker 為 form control,validation 行為:

- `required` + `value=null` → submit 時 trigger error,`aria-invalid="true"` + error border
- Range mode:start > end → invalid;component 內建 `isOutOfRangeOrder` 在 picker 端視覺 disable 違序日期(activeEnd='end' 時 `date < start` disable;activeEnd='start' 時 `date > end` disable),consumer 仍應在 submit 端確保 start 先 commit 才接受 end
- Typed input(`typeable=true`):`parseDateInput` 失敗 → `aria-invalid`,blur 觸發 error message;解析成功但落在 `disabledDate` 回 `true` 的日子,同樣處理(見「不可選日期」)
- Validation timing:typed input → blur + submit;picker pick → onChange 即時(已選有效日期不需延遲)

## 邊界案例

- **Disabled**:Field SSOT own;resolvedMode='disabled' 走 readonly / disabled 純 wrapper 分支(無 Popover trigger、`aria-disabled`、不開 picker),文字與 Calendar icon 切 `text-fg-disabled`。readonly 不顯示 Calendar icon(類型身份 indicator 規則,SSOT field-controls.spec.md「下拉箭頭（Select / Combobox）與類型身份 indicator」);disabled 保留並切 `fg-disabled`。顯式 `mode="view"` 永遠最優先(useResolvedFieldMode step 1,見 field-context.ts):view + disabled 同傳走 view 分支不套 disabled token;要 disabled chrome 傳 `disabled` 或 `mode="disabled"`。
- **Loading(server-rendered grid)**:DatePicker 為 sync UI 不獨立 own loading。若 consumer 場景需 async date constraint fetch(如後端 disabled-dates list;清單本身經 `disabledDate` 傳入,見「不可選日期」),consumer 應先 disable trigger 直到 fetch 完成,或在 popover 開啟後 body 切 `<Empty icon={<CircularProgress/>}/>`(對齊 panel-body loading SSOT)。本 spec scope 內不渲 loading state。
- **Empty(no value)**:`value=null` → trigger 顯 placeholder(預設 `YYYY/MM/DD`,showTime 時 24 小時語系 `YYYY/MM/DD HH:MM`、12 小時語系照面板同一份 12 / 24 寫成 zh-TW `YYYY/MM/DD 上午/下午HH:MM`【AI 推導 2026-11-26,TIME-12H-PANEL(定)「空白提示字也用 12 小時」的寫法,列入預覽清單】;consumer 可傳 `placeholder` 覆寫)。無導覽目標時鍵盤焦點停留(react-day-picker v9 內建)。
- **Invalid date input**:Field validation 處理 `aria-invalid="true"` + error border + 下方 error message;DatePicker 本身不 own validation 規則。
- **極長格式化日期**:trigger 文字單行 `truncate`(ellipsis),不換行不撐高(View / Edit / typeable / Range 雙 input 皆同);實際截斷時 hover / focus 顯完整值 tooltip(僅實際截斷才顯——rule owner `components/Tooltip/tooltip.spec.md`「截斷文字 → 用 tooltip 顯示完整內容。」):View 路徑消費 `<TruncatedText>`;Edit trigger 與 Range 兩端 button 為 interactive host,消費 `useTruncated` 自組(trigger = host、量測內層值 span,SSOT `patterns/element-anatomy/truncated-text.spec.md`「兩層架構(對齊世界級聯集)」:trigger ≠ 量測元素時只用 hook 自組),popover 開啟時靜默。typeable `<input>` 可捲動編輯,無截斷補救需求。
- **RTL**:不支援；全域 LTR-only compatibility contract 見 `packages/design-system/README.md#compatibility-matrix`。trigger / Range / DateGrid 不在本檔另立支援決策。
- **Dark mode / density**:走 Field + Popover SSOT 自動 adapt;DateGrid 內 cell 尺寸 density-aware(消費 `--field-height-sm`:md=28×28 / lg=32×32,對齊 L128 + `date-grid.spec.md:116`),隨 density 縮放而非固定。

---

## 相關

- `../Input/input.spec.md` — 純文字 YYYY-MM-DD（不需 picker 互動的場景）
- `../NumberInput/number-input.spec.md` — 年齡、天數等數值
- `../Field/field-controls.spec.md` — Field Control 共用規則（mode / size / endAction / error）

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `calendar.spec.md`
- `date-grid.spec.md`
- `header-canonical.spec.md`
- `input.spec.md`
- `number-input.spec.md`
- `time-picker.spec.md`
