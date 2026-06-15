---
component: DateGrid
family: composite
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInternal
benchmark:
  - react-day-picker (shadcn Calendar base): github.com/gpbl/react-day-picker
  - Ant Design DatePicker: github.com/ant-design/ant-design/tree/master/components/date-picker
  - MUI X Date Pickers: github.com/mui/mui-x/tree/master/packages/x-date-pickers
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — body claims marked per-claim @benchmark-unverified inline; canonical source URLs in frontmatter benchmark list. -->

<!-- M22 retrofit DONE 2026-05-03 v11(real source URLs added inline below)-->

# DateGrid 設計原則

## 定位

DateGrid 是 **DatePicker 內部的 date-grid primitive**(月份格網 + 前後導航 + 日 cell),**不直接面向 consumer**。2026-04-21 從原本的 `Calendar/` 改名為 `DateGrid/`,因為「Calendar」此命名在世界級 DS 慣例專指**事件檢視 canvas**(見 `../Calendar/calendar.spec.md`),而本元件只是「選日期用的格網」,不做事件呈現。保留 Calendar 名字給 event view 元件是世界級對齊。

**實作基礎**:`react-day-picker@9` 包裝 + 本 DS token 覆寫預設視覺。所有 classNames 透過 `classNames` prop 注入,避免引入原生 `.rdp-*` 樣式漂移。

**Layout Family**:非上述 family — composite / multi-section(月份 caption + 星期標頭 + 日期網格 + nav 按鈕,多區塊組合)。

**Storybook title 層級**:`Design System/Internal/DateGrid/*`(非 Components/,因為它是 DatePicker 的 internal primitive;對齊 `.claude/rules/ui-development.md`「Public component vs Internal primitive canonical」(intent-based 判準):consumer 經 `DatePicker` wrapper 取得,不直接 import 本元件)。

**世界級命名對照(為什麼不叫 Calendar)**:

| DS | 「Calendar」此名字給誰 | DayPicker 內部格網叫什麼 |
|----|-----------------------|-------------------------|
| Notion | event calendar 檢視(月/週/日) | 無(DatePicker 另有 calendar popup) |
| Google | Google Calendar(event 檢視) | 無公開 DS,DatePicker 另管 |
| Ant Design | inline 行事曆(含事件) | 無(DatePicker 自建 panel) |
| Apple HIG / Fantastical | event 檢視 | 無(DatePicker inline) |
| Material MUI | `<Calendar>` 已棄 → `<DateCalendar>`(date picker grid,single-date only;Range 走另元件 `<DateRangeCalendar>`)— source: [github.com/mui/mui-x](https://github.com/mui/mui-x/blob/master/packages/x-date-pickers/src/DateCalendar/DateCalendar.tsx) | `<DateCalendar>` |
| React Aria | `<Calendar>`(date picker grid)— source: [react-spectrum.adobe.com](https://react-spectrum.adobe.com/react-aria/Calendar.html) `@benchmark-unverified`(WebFetch 403)| `<Calendar>` |
| **本 DS** | **`<Calendar>`**(event 檢視 canvas,見 `../Calendar/`) | **`<DateGrid>`**(本元件) |

結論:Material / React Aria 用 `Calendar` 指 date-picker-grid 有點誤導(user 以為是 event 檢視);本 DS 對齊 Notion / Google / Ant / Apple 的大眾認知,**`Calendar` 給 event view**、**`DateGrid` 給 date picker grid**。 <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->

---

## 何時用

DateGrid 是 internal primitive(見「定位」),一般 consumer 經 `DatePicker` 取得;以下為 DS 內部組合或進階 inline 場景:

- **Inline 月曆顯示**:dashboard / 行事曆小卡 / 日期 filter bar
- **DatePicker 浮層內嵌**:DatePicker 消費本元件作為選日 popup(見 `../DatePicker/date-picker.spec.md`)
- **範圍選擇**:`mode="range"` 適用「from → to」場景(訂單日期範圍、查詢時段)
- **多日選擇**:`mode="multiple"` 適用「勾選多個不連續日期」(event sign-up)

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 日期輸入欄位 | `DatePicker` | DateGrid 是 inline,欄位需要 trigger + popup 結構 |
| 純顯示單日期 | `<DatePicker mode="display">` / `Intl.DateTimeFormat` | 不需 interactive 月曆 |
| 時間選擇(時分) | `TimePicker`(見 `../TimePicker/time-picker.spec.md`)| DateGrid 只處理日期層級 |
| 事件行事曆(日程本) | 專用行事曆元件 | DateGrid 是日期選擇;事件日誌需要 event overlay / drag / week/month view 切換 |

---

## mode(react-day-picker API)

| mode | 選擇行為 | 典型場景 |
|------|---------|---------|
| `single`（預設） | 單日選取,點新日取代舊選 | DatePicker / 生日 / 到期日 |
| `multiple` | 可勾選多個不連續日期 | event 報名多日 |
| `range` | from → to 連續範圍 | 訂單日期範圍 / 查詢時段 |

**range vs multiple 分界**:選的是「連續區間」(只在乎起迄兩端)→ `range`;選的是「各自獨立的日子」(可不連續、逐日增減)→ `multiple`。起迄日場景(訂單 / 查詢時段)固定走 `range`;簽核 / 報名這類逐日勾選走 `multiple`。

---

## 實作機制:classNames 鏡射 modifier keys(2026-04-21 AR43 修正)

**重要**:react-day-picker v9 的 cell 只有 `data-selected / data-disabled / data-today / data-outside / data-focused` 這幾個 DOM attribute;**`data-range-start / data-range-middle / data-range-end` 不存在**。

因此用 `[&[data-range-middle=true]]:xxx` 這種 attribute selector **根本不會生效**(舊版做法錯誤)。

**正解**:把 state 樣式放進 `classNames[state]` 物件,v9 的 `getClassNamesForModifiers` 會在對應 modifier 為 true 時把該 key 的 class 附加到 Day CELL。範例:`classNames.range_middle: 'bg-[var(--color-neutral-2)] [&>button]:!bg-transparent'`。

`[&>button]:xxx` 從 cell 向內選子 button 用於 button-level 樣式(selected / disabled 的藍底白圓等)。

---

## 五種 cell state canonical(2026-04-21,AR43 定案)

世界級對照 — Ant Design([github.com/ant-design/ant-design](https://github.com/ant-design/ant-design/tree/master/components/date-picker))/ Google Calendar / macOS Calendar / Material 3([mui/mui-x DateCalendar](https://github.com/mui/mui-x/blob/master/packages/x-date-pickers/src/DateCalendar/DateCalendar.tsx))的 picker grid 共通做法 `@benchmark-unverified`(visual claims,non-source-citable):
- today 不做 ring circle(跟 hover ring 混淆),改用 underline 或 dot
- selected 用藍底白字圓,range 端點共用同樣視覺
- range 中段用灰底 rectangle track,跟端點的圓相切成連續 pill
- hover 非 filled(與 selected 區隔)
- disabled 顯示灰底圓圈(明確「此格不可選」),非 opacity-50

| State | 視覺 | Token 角色(class 細節見 tsx)| 備註 |
|-------|------|------------------------------|------|
| **today**(未選) | 數字下方短圓桿(藍) | button `::after` bar,色用 `primary`,尺寸靠近文字行底(不貼 button 邊) | affordance 方式,不 fill bg;位置刻意貼近數字避免「黏 button 邊」視覺 flaw |
| **today + selected** | 數字下方短圓桿(白) | bar 色切 `on-emphasis` | 選中藍底上藍 bar 隱形,必切白;以 state 疊加 selector 覆寫 |
| **disabled** | 灰底 + 淡字 | `bg-disabled` + `fg-disabled` + `cursor-not-allowed` | 跟 Button disabled token 一致,不自創 palette |
| **outside(非本月)**| 淡字(只文字) | `fg-muted` | 比 disabled 弱:outside 仍可 hover / 可點,純是「非焦點月份」的標示 |
| **selected / range 端點** | 藍底白字圓 | button `primary` 底 + `on-emphasis` 字 | range_start / range_end 共用此視覺 |
| **range 端點 cell bg** | 灰底半圓 track,**高度 = button**,向 middle 外擴 2px bridge gap | `neutral-selected`;class 細節見「Range track canonical」+ tsx | 圓弧半徑 = button 半徑無錯位;舊版 cell-level bg 圓弧半徑 16px 比 button 14px 大 = 視覺 misalign |
| **range track(中間)** | 灰底矩形,**高度 = button**(28×28 @ md),左右各外擴 2px 接合相鄰 cell | `neutral-selected`;button 透明顯露 track(class 細節見 tsx)| track 高度跟 selected 圓一致,不留 2px「fat」邊;相鄰 pseudo 接合連貫橫向 track |
| **hover(未選中)** | 藍圈 outline(無 fill) | button hover ring 色 `primary`,無 bg(ring 寬度等 class 細節見 tsx)| 細 ring 對齊 Apple HIG `@benchmark-unverified` / Ant `@benchmark-unverified`(visual,non-source-citable) |

## 組合狀態(state stacking order)

- today + selected → selected 勝出的**底色**(藍底白字圓);bar 跟著切 on-emphasis(白)保持可見
- range-start / range-end → selected 規則(cell 半圓 track + button 圓)
- range-middle → track 規則(cell 灰底矩形 + button 透明)
- today + range-middle → track(灰底)+ today bar(藍色仍可見,cell 未 selected)
- hover 在 selected / disabled 上被 ring-0 壓制(避免二次 hover 出現方框 bug);range-middle 的 button 透明顯露 track,hover ring 仍顯示(見 tsx `range_middle` 註解)

## Spacing canonical(2026-05-03 v8)

- 整個 popover padding `p-3`(12px,對齊 `--layout-space-tight` @ md density)
- 四邊對稱:左右 chevron 按鈕到邊距 = 最左最右日期 cell 到邊距(12px)
- 上下對稱:caption 到頂 = 最後一排日期到底(均 12px,從 `p-3` 繼承)
- day cell 固定 `h-field-sm w-[var(--field-height-sm)]`(28px @ md / 32px @ lg)
- week header 同寬,`h-field-sm`
- **Cell 之間 gap = 4px(H + V)**:走 table-native `border-separate border-spacing-1`,不用 grid layout(grid 會 break border-spacing)
- **Caption row alignment canonical**:`pt-3 + h-field-xs + mb-3 = 12 + 24 + 12 = 48px`
  - DateGrid month_caption + TimePickerSidePanel header **必走同樣 48px caption row 結構**
  - title text vertical center Y 一致 = 12 + 12 = 24px(from container top)
  - ⚠️ 改 DateGrid `p-3` → 必同步改 `TimePickerSidePanel py-3`,否則對齊破

**為什麼用 `h-field-sm` 而非固定 `h-9`**:picker grid 在 lg density 下也要跟 Input 系統一起放大,`h-field-sm` 在 md = 28px / lg = 32px,比 Ant/Google 固定 36px(`@benchmark-unverified` visual measurement)稍緊但對齊本 DS 的 field 家族。day cell 尺寸雖固定,但**隨 density 縮放**,視覺跟 popup 內其他欄位(Input / Button)保持比例。

## Nav button canonical(2026-05-03 v9)

Prev/Next chevron 用 `<Button variant="text" size="xs" iconOnly>`(DS primitive 消費,不 hand-coded inline-flex)。透過 RDP v9 `components.PreviousMonthButton / NextMonthButton` override(`node_modules/react-day-picker/dist/esm/components/Nav.js` 證實支援)。

**Icon 顏色 = Button 預設 `text-foreground`(neutral-9 / 85% 黑)**,**對齊 DS 一致設計語言**(M23):
- Icon-only Button 預設 = neutral-9(本 DS 既有 canonical)
- `fg-muted`(45%)專屬 dismiss / inline action / placeholder(spec.md 既有定義)
- chevron nav 是 functional navigation,不是 dismiss → 不該套 fg-muted 自開新 tier

歷史(2026-05-03):v6-v8 曾以未驗證的「Ant chevron muted」印象覆蓋 DS canonical,已撤回(M23 防再犯)。

⚠️ RDP `PreviousMonthButton` override 必丟 `children`(RDP 把 `<Chevron>` 當 children 傳)否則 double svg(2026-05-03 v8 抓到 bug)。

## Weekday header canonical(2026-05-03 v9)

`text-foreground text-body font-medium`(neutral-9 + 500 weight + body size)。對齊 caption「April 2026」同視覺權重(都屬 calendar header 區),不弱化。撤銷 v3 用 `fg-secondary font-normal` 的 mistake(M23)。

## Range track canonical(2026-05-03 v8)

對齊 Ant `cell-range-start::before { border-radius: 9999px 0 0 9999px }`(stadium pattern): <!-- @benchmark-unverified: see frontmatter benchmark list for canonical DS source URL -->
- `range_start` / `range_end` cell pseudo:左 / 右半圓 stadium,向 middle 側外擴 2px bridge gap(class 細節見 tsx `range_start` / `range_end`)
- `range_middle` cell pseudo:滿 cell 高矩形、左右各外擴 2px,無 rounding(class 細節見 tsx)
- pseudo 蓋全 cell + bridge 4px gap → button 圓的 corner triangle 看到 pseudo bg(對齊 button 圓的左/右半弧,無「凸出」)
- `bg-neutral-selected`(semantic = neutral-2)— 對齊 TimePicker 選中項目樣式

---

## 禁止事項

- ❌ **不改視覺 token 為硬色值**(`bg-primary` 必須來自 semantic,不可 `bg-blue-500`)
- ❌ **不用 `.rdp-*` 原生 class 直接樣式化**(繞過本元件 classNames prop 會跨版本斷掉)
- ❌ **不自包 Popover**(DateGrid 是 inline primitive;需要浮層由 consumer 包 Popover,見 DatePicker)
- ❌ **不混用其他 calendar library**(若 DateRange / DateTime 需求出現,擴充本元件 `mode="range"` 或新 prop,不引第二套)
- ❌ **Consumer 不可外加 padding wrapper**(canonical 2026-05-02)— DateGrid root 自帶 `p-3`;`<div className="p-2"><DateGrid /></div>` 會造成 popover edge → 第一個 day cell 雙重 padding(8 + 12 = 20px),違反 mindset #2「優先消費既有 SSOT」。直接放 `<DateGrid />` 在 Popover/parent 內即可。Hook `check_pattern_invariants.sh` C.3(P0 BLOCK,PRIMITIVES_REGEX 含 DateGrid)機械攔截

---

## A11y 預設

react-day-picker v9 自動處理:
- **鍵盤**：ArrowLeft/Right 切日,ArrowUp/Down 切週,Shift+ArrowLeft/Right 切月、Shift+ArrowUp/Down 切年,PageUp/Down 切月、Shift+PageUp/Down 切年,Home/End 切週首尾
- **ARIA**：`role="grid"` + 日格 `role="gridcell" aria-selected`
- **Focus**：`autoFocus` prop 自動 focus 到選中日(或今天)
- **Locale**：`locale` prop 控制週首日、星期標頭語言

**DS 自訂部分**:day button 的 focus ring 由本元件 classNames 覆寫為 DS canonical(`focus-visible:ring-2 ring-ring`,非 RDP 預設樣式);nav 按鈕為 DS `<Button>` 並帶 `aria-label`(上一個月 / 下一個月)。其餘 consumer 無需額外處理,保留 react-day-picker API 即可。

---

## shadcn passthrough 例外說明

DateGrid 本元件是**對 `react-day-picker` 的 `<DayPicker>` 元件薄包裝**,用於橋接 DS token(classNames 覆寫 + components 注入自訂 `PreviousMonthButton` / `NextMonthButton`)。

**ref 處理**:採 **DS 統一 `React.forwardRef` 慣例**(`forwardRef<HTMLDivElement, DateGridProps>`),但因 react-day-picker v9 的 `DayPicker` 內部是多 `<div>` 結構、未對外 forward ref 到單一 DOM 節點,故 **ref 簽名保留但不附著**(真要取 DOM 由 consumer 包一層 wrapper)。保留 forwardRef 簽名是為了跟 Radix / shadcn 其餘元件的一致設計語言對齊,即使 ref 不附著。

**props passthrough**:`DateGridProps = React.ComponentProps<typeof DayPicker>`,經 `{...props}` 直接 spread 至 `DayPicker`(declarative API:selected / onSelect / mode / classNames / components 等)。

`displayName = 'DateGrid'` 讓 React DevTools / Storybook 辨識。

**何時應改 ref 附著**:若未來 react-day-picker 升級提供單節點 `ref` prop,或我們決定包一層自有 DOM 容器(如加 footer action buttons),再把 ref 接到該容器上。

---

## 邊界案例

- **Disabled day**:`disabled` prop 走 react-day-picker matcher;disabled cell 視覺 `text-fg-disabled`(M24)、`cursor-not-allowed`、click 不觸發 onSelect、鍵盤導覽自動 skip。
- **Loading(server-rendered grid)**:DateGrid 為 sync render(date math 在 client),非 async surface。consumer 若需 async disabled-dates fetch(如後端 holiday list),應先 disable trigger 直到 fetch 完成,DateGrid 開啟後立即 ready。
- **Empty(全 disabled days)**:極端場景(所有日期都被 disabled matcher 命中),DateGrid 渲完整 grid 但全部 cell 為 disabled state,鍵盤焦點停留無導覽目標(react-day-picker v9 內建)。Enter / Space 在 disabled cell 上無動作不報錯(RDP DayButton 對 disabled day 渲染 native `disabled`,focus target 時改掛 `aria-disabled`),Tab 走 roving tabIndex 整個 grid 只停一格。
- **Dark mode**:走 semantic token(primary / neutral / fg-muted)自動 adapt。
- **Density**:DateGrid day cell 走 `h-field-sm w-[var(--field-height-sm)]`,**隨 density 縮放**(md = 28×28 / lg = 32×32,token `--field-height-sm` 在 `[data-density="lg"]` override 為 `2rem`),跟 popup 內 Input / Button 等 field 家族一起放大保持比例(見 L128 + L120)。grid 寬度為 intrinsic(7 × cell + 4px gap + `p-3`),lg 下整體變寬;DateGrid 無內部 overflow / responsive 縮排機制,容器(Popover / parent)以內容寬呈現。

---

## 相關

- `../DatePicker/date-picker.spec.md` — **本元件 consumer**:DatePicker 消費 DateGrid 作為選日 popup
- `../../tokens/color/color.spec.md` — semantic token 來源（primary / neutral / fg-muted 等）
- react-day-picker 官方文件 — `https://react-day-picker.js.org`

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `calendar.spec.md`
- `date-picker.spec.md`
