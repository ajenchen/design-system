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


<!-- M22 retrofit DONE 2026-05-03 v11(real source URLs added inline below)-->

# DateGrid 設計原則

## 定位

DateGrid 是 **DatePicker 內部的 date-grid primitive**(月份格網 + 前後導航 + 日 cell),**不直接面向 consumer**。2026-04-21 從原本的 `Calendar/` 改名為 `DateGrid/`,因為「Calendar」此命名在世界級 DS 慣例專指**事件檢視 canvas**(見 `../Calendar/calendar.spec.md`),而本元件只是「選日期用的格網」,不做事件呈現。保留 Calendar 名字給 event view 元件是世界級對齊。

**實作基礎**:`react-day-picker@9` 包裝 + 本 DS token 覆寫預設視覺。**載入 RDP `style.css` 為結構基底**(tsx `import 'react-day-picker/style.css'`),再以 `classNames` prop 逐 key 用 DS token 覆寫視覺層(caption / weekday / day / range 等);**未列出的結構 key 沿用 RDP 原生 `.rdp-*` 預設**。故非「零 rdp-*」,而是「DS token 管視覺層、rdp-* 提供結構層」。

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
| React Aria | `<Calendar>`(date picker grid)— source: [React Aria Calendar](https://react-spectrum.adobe.com/react-aria/Calendar.html) | `<Calendar>` |
| **本 DS** | **`<Calendar>`**(event 檢視 canvas,見 `../Calendar/`) | **`<DateGrid>`**(本元件) |

結論:本 DS 用 **`Calendar` 表示 event view**、用 **`DateGrid` 表示 date-picker grid**。兩個名稱直接反映資料模型與 interaction contract，避免 consumer 以同一 component identity 混用事件瀏覽與日期選取。

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
| 純顯示單日期 | `<DatePicker mode="view">` / `Intl.DateTimeFormat` | 不需 interactive 月曆 |
| 時間選擇(時分) | `TimePicker`(見 `../TimePicker/time-picker.spec.md`)| DateGrid 只處理日期層級 |
| 事件行事曆(日程本) | 專用行事曆元件 | DateGrid 是日期選擇;事件日誌需要 event overlay / drag / week/month view 切換 |

---

## mode(react-day-picker API)

| mode | 選擇行為 | 典型場景 |
|------|---------|---------|
| `single` | 單日選取,點新日取代舊選 | DatePicker / 生日 / 到期日 |
| `multiple` | 可勾選多個不連續日期 | event 報名多日 |
| `range` | from → to 連續範圍 | 訂單日期範圍 / 查詢時段 |

**mode 無預設值**(react-day-picker v9 `mode?: Mode | undefined`,本元件薄包裝不補 default):未傳 `mode` 時 grid 為**非互動純展示**(day 渲染純文字非 button,不可選);DS 內所有消費者(DatePicker / stories)皆顯式傳 `mode`。

**range vs multiple 分界**:選的是「連續區間」(只在乎起迄兩端)→ `range`;選的是「各自獨立的日子」(可不連續、逐日增減)→ `multiple`。起迄日場景(訂單 / 查詢時段)固定走 `range`;簽核 / 報名這類逐日勾選走 `multiple`。

---

## 實作機制:classNames 鏡射 modifier keys(2026-04-21 AR43 修正)

**重要**:react-day-picker v9 的 cell state DOM attribute 只有 `data-selected / data-disabled / data-today / data-outside / data-focused`(另有非 state 的 `data-day / data-month / data-hidden`);**`data-range-start / data-range-middle / data-range-end` 不存在**。

因此用 `[&[data-range-middle=true]]:xxx` 這種 attribute selector **根本不會生效**(舊版做法錯誤)。

**正解**:把 state 樣式放進 `classNames[state]` 物件,v9 的 `getClassNamesForModifiers` 會在對應 modifier 為 true 時把該 key 的 class 附加到 Day CELL。範例:`classNames.range_middle: "before:content-[''] before:absolute before:inset-y-0 before:-inset-x-[2px] before:bg-neutral-selected [&>button]:!bg-transparent"`(用 `before:` pseudo + semantic `--neutral-selected` token,對齊下方 Range track canonical 與 tsx)。

`[&>button]:xxx` 從 cell 向內選子 button 用於 button-level 樣式(selected / disabled 的藍底白圓等)。

---

## 五種 cell state canonical(2026-04-21,AR43 定案)

本 DS picker grid 的視覺狀態 contract：
- today 不做 ring circle(跟 hover ring 混淆),改用 underline 或 dot
- selected 用藍底白字圓,range 端點共用同樣視覺
- range 中段用灰底 rectangle track,跟端點的圓相切成連續 pill
- hover 非 filled(與 selected 區隔)
- disabled 顯示灰底圓圈(明確「此格不可選」),非 opacity-50

| State | 視覺 | Token 角色(class 細節見 tsx)| 備註 |
|-------|------|------------------------------|------|
| **today**(未選) | today indicator | 消費 `primary` semantic role；確切結構與尺寸由 `date-grid.tsx` 擁有 | 與 selected background 保持不同狀態語言，兩者疊加時仍可辨識 |
| **today + selected** | 數字下方短圓桿(白) | bar 色切 `on-emphasis` | 選中藍底上藍 bar 隱形,必切白;以 state 疊加 selector 覆寫 |
| **disabled** | 灰底 + 淡字 | `bg-disabled` + `fg-disabled` + `cursor-not-allowed` | 跟 Button disabled token 一致,不自創 palette |
| **outside(非本月)**| 單月:淡字(只文字);**兩月以上:不渲染**(格留空) | `fg-muted` —— **僅在該日仍可點、且未被選中時**;`numberOfMonths > 1` 時 `showOutsideDays` 強制 false(consumer 傳 true 也不放行) | 比 disabled 弱:outside 的前提就是「仍可 hover / 可點」,純是「非焦點月份」的標示。**該日若同時被 disable,一律讓位給 `fg-disabled`**(M24「disabled > muted」)—— 兩者都套會讓「非本月又不可選」比「本月不可選」更深,恰好相反。實作以 `[&:not([data-selected])>button:not(:disabled):not([aria-disabled="true"])]` 表達此前提,不用 `!important` 硬壓(2026-09-07 user 抓圖修正;2026-09-23 加 `:not([data-selected])`,選中是 state、淡字是裝飾)。**兩月並排時同一天會在相鄰兩張月曆各出現一次,區間 track / 端點藍圓 / 預覽框就被畫兩次**(user 2026-09-23 圖一:4/26 在四月與五月面板各一顆藍圓)—— [MUI X `DateRangeCalendar.tsx`](https://github.com/mui/mui-x/blob/master/packages/x-date-pickers-pro/src/DateRangeCalendar/DateRangeCalendar.tsx)(`calendars > 1` 時補位格 `opacity: 0`、不吃任何選取樣式,原註解「otherwise the same day would be rendered in two calendars」)/ [Polaris `Day.tsx`](https://github.com/Shopify/polaris/blob/main/polaris-react/src/components/DatePicker/components/Day/Day.tsx)(`Month.tsx` 把非當月位置當 `null` 交給 `Day`,`Day.tsx` 渲染空的 `EmptyDayCell`)/ [flatpickr `index.ts`](https://github.com/flatpickr/flatpickr/blob/master/src/index.ts)(`showMonths > 1` 時 `prevMonthDay hidden`)/ [react-day-picker 文件](https://daypicker.dev/docs/grid-and-months)(「By default, DayPicker hides the days falling into other months」)都不顯示,只有 [Ant `panel.ts`](https://github.com/ant-design/ant-design/blob/master/components/date-picker/style/panel.ts) 顯示淡字但所有 in-range / range-start / range-end 樣式鎖在 `&-in-view`;user 2026-09-23 拍板「兩月時不顯示鄰月日子」 |
| **selected / range 端點** | 藍底白字圓 | button `primary` 底 + `on-emphasis` 字 | range_start / range_end 共用此視覺 |
| **range 端點 cell bg** | 灰底半圓 track,**高度 = button**,向 middle 外擴 2px bridge gap | `neutral-selected`;class 細節見「Range track canonical」+ tsx | 圓弧半徑 = button 半徑無錯位;舊版 cell-level bg 圓弧半徑 16px 比 button 14px 大 = 視覺 misalign |
| **range track(中間)** | 灰底矩形,**高度 = button**(28×28 @ md),左右各外擴 2px 接合相鄰 cell | `neutral-selected`;button 透明顯露 track(class 細節見 tsx)| track 高度跟 selected 圓一致,不留 2px「fat」邊;相鄰 pseudo 接合連貫橫向 track |
| **hover(未選中)** | 藍圈 outline(無 fill) | button hover ring 色 `primary-hover`(2026-07-07 user 拍板統一:瞬時 hover 進 primary 家族 = hover 階,FileUpload / Slider thumb hover 同族;base 專屬持續選中與 focus),無 bg(ring 寬度等 class 細節見 tsx)| outline 保留 cell 底色，與 selected fill 明確區分 |
| **range 預覽框(停留 / 焦點)** | 同色同粗的藍色細框把「點下去會變成」的區間框起來,兩端半圓、與 track 同高;停留日就是框的那一端 | td `::after`(track 用 `::before`),1.5px `primary-hover`;class 住在 tsx `RANGE_PREVIEW_CLASSNAMES` | 只有 `DatePicker.Range` 會算出這組 modifier(它才知道正在選哪一端);DateGrid 只擁有畫法。規則見下方「區間預覽框」。**跨格不閃**:停留日掛在 button 的 mouseenter / mouseleave,格間 4px 縫隙屬於 table,指標經過縫隙會先 leave 再 enter、整條框卸掉一幀 —— day button 的 `::before` 命中區外擴 2px 補滿縫隙(與框跨縫用的 −2px 是同一個數字,hit = paint;user 2026-09-23 抓到「水平移動到隔日框會閃一下」) |
| **focus-visible(鍵盤焦點)** | 非填色格:往內 2px 藍線;填色格(selected / range 端點):1px 白線退 3px,外圈留藍 | day button `focus-visible:focus-ring-inset`;填色 modifier 另掛 `EMPHASIS_FOCUS_RING_CLASSNAME`(= `focus-ring-inset-emphasis`,幾何 owner `styles/base.css` + `focus-canonical.md`「填色元素上的內描邊」)| 格與格只隔 4px,track / 預覽框就跑在縫裡,往外畫會壓到框線;藍底上藍線看不見、白線貼邊只是削小藍圓(2026-09-23 user 拍板 D,原話在 focus-canonical 來源總帳) |

## 組合狀態(state stacking order)

- today + selected → selected 勝出的**底色**(藍底白字圓);bar 跟著切 on-emphasis(白)保持可見
- range-start / range-end → selected 規則(cell 半圓 track + button 圓)
- range-middle → track 規則(cell 灰底矩形 + button 透明)
- today + range-middle → track(灰底)+ today bar **維持藍色**(2026-07-07 user 拍板:切白只屬「藍底白字圓」的選中日/端點;range 中段是淺灰底,白 bar 近乎隱形 = today 標記消失。range_middle 以 `!bg-primary` 覆寫 today 的 `data-selected` 切白——RDP v9 range 中段日同樣掛 selected modifier 故會誤觸發。對照 Ant panel.ts:cell-today 指示 = colorPrimary,in-range 只換底色、無規則隱藏/改色 today 指示)
- hover 在 selected / disabled 上被 ring-0 壓制(避免二次 hover 出現方框 bug);RDP `mode="range"` 的 range-middle 因同樣掛 selected modifier,button hover ring 一併被壓制(2026-07-05 對照 RDP source 修正舊句「hover ring 仍顯示」)。**`DatePicker.Range` 的中段不掛 selected,停留時由「區間預覽框」接手:停留日不畫單格圈,改畫框的半圓端點**(2026-09-23 user 拍板;此前這一句被當成「中段 hover 不該有圈」的規則,其實它只是描述套件行為,從未有人拍板 —— 來源總帳見 `../DatePicker/date-picker.spec.md`「區間預覽」)
- **選中日 hover 底色升階**:ring 壓制之外,選中日 hover 時 `bg-primary → bg-primary-hover`(2026-07-06 補明文——「選中之上 hover = 同色相升 hover 階」家族,Checkbox / Switch checked hover 同款;code 已有此行為,本句消 spec-code 落差)
- focus-visible + range-middle(RDP `mode="range"`)→ 中段同掛 selected 會吃到填色格的白線,但中段底是淺灰、白線看不見,以 `[&>button]:focus-visible:!focus-ring-inset` 壓回一般往內 2px 藍線(同權重靠順序不可靠);`DatePicker.Range` 的中段不掛 selected,直接走 day button 的內描邊
- outside + selected(單月,選中日落在鄰月位置)→ 藍底白字圓照畫、不淡化(state 勝裝飾,M24);淡字選擇器以 `:not([data-selected])` 讓位。RDP `mode="range"` 單月的鄰月中段日同掛 selected,字色跟當月中段一樣深(不淡化;只在單月 range 出現)
- outside + range / 預覽框(兩月)→ **不存在**:兩月以上鄰月日子不渲染(見 outside 列)。2026-09-23 前這一組從未寫進本清單(M5 缺口),code 憑 range 中段的 `!text-foreground` 決定結果:鄰月日子一進區間就全深、起點藍圓在兩個面板各畫一次;2026-09-07 只修了 outside × disabled 這一對,沒掃同族的 outside × range(M10)

## 區間預覽框(2026-09-23 user 拍板)

**是什麼**:`DatePicker.Range` 停留(滑鼠 / 看得見的鍵盤焦點)在某一天時,用**單日 hover 圈同一條藍色細框**(1.5px `primary-hover`)把「現在點下去,區間會變成從哪到哪」框起來。已選區間的灰色 track 照舊顯示,框疊在上面:縮小時框在 track 裡面、放大時框超出 track。**哪幾天要框由 DatePicker.Range 決定**(它才知道正在選哪一端,規則表在 `../DatePicker/date-picker.spec.md`「區間預覽」);本節只擁有**畫法**。

| 格 | 畫法 |
|---|---|
| 起點 | 上下邊 + 左側邊 + 左半圓(`rounded-l-full`,圓半徑 = button 半徑,與藍圓同弧);右側向鄰格外擴 2px 接縫 |
| 中段 | 只有上下邊;左右各外擴 2px 接縫,不畫側邊 |
| 終點 | 鏡射起點 |
| 單格(起訖同一天) | 完整一圈(左右側邊 + 全圓角),位置與大小 = 單日 hover 圈 |
| 列首 / 列尾(換列處) | 不畫側邊,框是開口的;外擴歸零不溢出面板留白 —— 與 track 在換列處的處理同款 |
| 停留日 | **不畫 button 的單格 hover 圈**,框的半圓端點就是它;缺口朝區間內側,方向依正在選開始日或結束日而定(user 原話:「所 hover 的日期的藍框不會是完整的圓形,而會是一個半圓,至於這個半圓的缺口朝向哪一邊則取決於正在選的是起始日還是結束日」) |
| 已選端點落在框裡 | 藍圓在 button 層(z 在框之上),框的線從圓的上下切點進出,視覺連續;不另外處理 |

**層次**:track = td `::before`、預覽框 = td `::after`、today bar = button 的 `::after`,三者互不衝突;button 在最上層。

**世界級對照**(讀原始碼,2026-09-23):五家有區間選擇的元件庫都在停留時預覽區間,差別只在畫法 —— Ant Design v4 用虛線上下邊 + 兩端側邊([panel.less](https://github.com/ant-design/ant-design/blob/4.x-stable/components/date-picker/style/panel.less) `-range-hover*`,`border-top/bottom: dashed @picker-date-hover-range-border-color`)、MUI X 用 1.2px 虛線([DateRangePickerDay.tsx](https://github.com/mui/mui-x/blob/master/packages/x-date-pickers-pro/src/DateRangePickerDay/DateRangePickerDay.tsx) `previewStyles`)、Ant v5 現行與 Polaris 用與已選區間同色的淺色填([rc-picker PanelBody.tsx](https://github.com/react-component/picker/blob/master/src/PickerPanel/PanelBody.tsx) 把 `hoverRangeValue` 算成 `-in-range`;[Polaris Day.tsx](https://github.com/Shopify/polaris/blob/main/polaris-react/src/components/DatePicker/components/Day/Day.tsx) `(inRange || inHoveringRange) && styles['Day-inRange']`)、Carbon(flatpickr)用填色([index.ts](https://github.com/flatpickr/flatpickr/blob/master/src/index.ts) `onMouseOver` → `startRange / inRange / endRange`)。**本 DS 選實線**:沿用單日 hover 圈的顏色與粗細,不新增第二種「暫定」表達(M23 DS 既有語言優先;user 2026-09-23 Q2 拍板)。我們包的 react-day-picker 本身沒有預覽([range-mode 文件](https://daypicker.dev/selections/range-mode)只有 `range_start / range_middle / range_end`),所以由 DatePicker.Range 自算。

## Spacing canonical(2026-05-03 v8)

- **內距住在每一張月曆身上,不在根**(2026-09-18 user 裁示,原話:「我覺得真的要做的話,邏輯就是這樣,
  而不是另外加一個 token,反而造成漂移,因為視覺就是要在各種情況營造對稱感吧?」)。
  `month` 帶 `p-[var(--item-px,var(--field-px))]`(md 12),**根不帶內距**。
  為什麼是 `--item-px`:這個浮層掛在欄位上,內容要跟 trigger 的文字落在同一條線 ——
  那正是 `--item-px` 預設取自 `--field-px` 的理由(`../../patterns/element-anatomy/item-anatomy.spec.md`「Token: `--item-px`」)。
  `DatePicker` 的 footer 與右側時間欄的上內距讀**同一個運算式**,所以整個面板的邊是同一個來源。
- **兩張月曆之間不設 gap**,距離由「各自的內距相加」自然形成(md 12 + 12 = **24**)。
  - **所以沒有、也不需要月間距 token** —— 少一個可以漂的東西。
    同日稍早一度改成 `gap-[var(--layout-space-loose)]`,那是「再加一顆要維護的數字」,已撤回。
  - **對稱是結構保證的**:單張與並排長得完全一樣,不靠任何人記得維護某個值。
  - 世界級同款:**Ant Design 就是這個作法**(兩張各自帶左右內距、中間不設 gap),
    且 v4(內距 12 → 間距 24)與 v5(18 → 36)跨大版本維持 1:2,是刻意的比例。
  - ⚠️ **nav 必須跟著內距走**:`button_previous/next` 相對 `month` 的 **padding box** 做 absolute 定位
    (= 盒子最外緣)。內距搬到 `month` 之後不補偏移,chevron 會比日期格往外 12px(2026-09-18 實測確認)。
    兩顆 nav 因此讀同一顆 `--item-px`。
- **最外圈的 border-spacing 必須抵銷**(`month_grid` 帶 `-m-1`)。
  `border-spacing` 的語意是「格與格之間 4px」,但 CSS **連最外圈也各給 4px** ——
  不抵銷的話日期格會落在 12 + 4 = 16,而 chevron 貼著 12,四邊對稱就破了。
  這 4px **從來沒有人決定過**(2026-09-18 查 git 全史:原規格只說「四邊對稱 12px」),是 `border-separate` 的副作用。
  - **同 repo 早有正確先例**:`Carousel` 用每張投影片的 `pl-4` 當間距,容器就用 `-ml-4` 抵掉(`../Carousel/carousel.tsx:202`)。
  - **上游也不外溢**:`react-day-picker` 自己是 `border-collapse: collapse`,其 457 行 `style.css` 裡 `border-spacing` 出現 **0 次**;
    IBM Carbon 的日曆第一格同樣貼齊容器內距(2026-09-18 讀原始碼 + 實測)。
  - **範圍軌道在列的頭尾要夾住**:range 的 `-2px` bridge 是用來跨過格間 4px 縫接鄰格,
    但列的第一格左邊、最後一格右邊沒有鄰格,不夾就會溢出內距(實測 2px)。
    夾在 `month_grid`(`[&_tr>td:first-child]:before:!left-0` / `last-child`)—— 實測 react-day-picker
    **不會**把加在 `classNames.range_*` 的 class 帶到 `<td>`,掛在那裡不會生效。
- **對齊基準是盒,不是圖示**:chevron 是 24px 按鈕、內含 16px 圖示置中,所以**圖示**在 16、**盒**在 12。
  本 DS 一律盒對盒 —— `../../patterns/overlay-surface/overlay-surface.spec.md:116-117`
  「item 的 **padding-box 左緣** = header title 左緣」「**對齊的是列的前緣,不是文字**」、:121「對齊的同樣是**按鈕左緣**」。
  ⚠️ 不要拿 `data-unbounded` 當水平對齊前例:它的負 margin 全庫**只有垂直的 `my-`**(`overlay-surface.tsx:68`)。
- 實測(2026-09-18 修後):裸 DateGrid 四邊 chevron 盒 12 / 日期格 12 / 最後一排到底 12;
  `DatePicker` 面板 chevron 12 = 星期標頭 12 = 日期格 12 = footer 按鈕 12;
  雙月面板 面板邊→第一格 12、最後一格→下一張第一格 **24**、面板寬 490。
- day cell 固定 `h-field-sm w-[var(--field-height-sm)]`(28px @ md / 32px @ lg)
- week header 同寬,`h-field-sm`
- **Cell 之間 gap = 4px(H + V)**:走 table-native `border-separate border-spacing-1`,不用 grid layout(grid 會 break border-spacing)
- **Caption row alignment canonical**:`pt-3 + h-field-xs + mb-3 = 12 + 24 + 12 = 48px`
  - DateGrid month_caption + TimePickerSidePanel header **必走同樣 48px caption row 結構**
  - title text vertical center Y 一致 = 12 + 12 = 24px(from container top)
  - ⚠️ 改 DateGrid `p-3` → 必同步改 `TimePickerSidePanel pt-3`(root 刻意 bottom = 0,見 date-picker.tsx docblock),否則對齊破

**為什麼用 `h-field-sm` 而非固定 `h-9`**:picker grid 在 lg density 下也要跟 Input 系統一起放大,`h-field-sm` 在 md = 28px / lg = 32px。day cell 尺寸雖固定,但**隨 density 縮放**,視覺跟 popup 內其他欄位(Input / Button)保持比例。

## Nav button canonical(2026-05-03 v9)

Prev/Next chevron 用 `<Button variant="text" size="xs" iconOnly>`(DS primitive 消費,不 hand-coded inline-flex)。透過 RDP v9 `components.PreviousMonthButton / NextMonthButton` override(本元件 `navLayout="around"` 下按鈕由 `DayPicker.js` 於首/末月 caption 兩側直渲;無 navLayout 時才走 `Nav.js` — 兩路徑皆消費此 override,`node_modules/react-day-picker/dist/esm/` 證實)。

**Icon 顏色 = Button 預設 `text-foreground`(neutral-9 / 85% 黑)**,**對齊 DS 一致設計語言**(M23):
- Icon-only Button 預設 = neutral-9(本 DS 既有 canonical)
- `fg-muted`(45%)專屬 dismiss / inline action / placeholder(spec.md 既有定義)
- chevron nav 是 functional navigation,不是 dismiss → 不該套 fg-muted 自開新 tier

歷史(2026-05-03):v6-v8 曾以未驗證的「Ant chevron muted」印象覆蓋 DS canonical,已撤回(M23 防再犯)。

⚠️ RDP `PreviousMonthButton` override 必丟 `children`(RDP 把 `<Chevron>` 當 children 傳)否則 double svg(2026-05-03 v8 抓到 bug)。

## Weekday header canonical(2026-05-03 v9)

`text-foreground text-body font-medium`(neutral-9 + 500 weight + body size)。對齊 caption「April 2026」同視覺權重(都屬 calendar header 區),不弱化。撤銷 v3 用 `fg-secondary font-normal` 的 mistake(M23)。

## Range track canonical(2026-05-03 v8)

Range 起訖使用 stadium 端點，讓連續區間有清楚的開始、延伸與結束：
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
- ❌ **Consumer 不可外加 padding wrapper**(canonical 2026-05-02)— DateGrid 的內距自帶在**每一張月曆**上(2026-09-18 從根搬過去,見上方 Spacing canonical);`<div className="p-2"><DateGrid /></div>` 會造成 popover edge → 第一個 day cell 雙重 padding(8 + 12 = 20px),違反 mindset #2「優先消費既有 SSOT」。直接放 `<DateGrid />` 在 Popover/parent 內即可。Hook `check_pattern_invariants.sh` C.3(P0 BLOCK,PRIMITIVES_REGEX 含 DateGrid)機械攔截

---

## A11y 預設

react-day-picker v9 自動處理:
- **鍵盤**：ArrowLeft/Right 切日,ArrowUp/Down 切週,Shift+ArrowLeft/Right 切月、Shift+ArrowUp/Down 切年,PageUp/Down 切月、Shift+PageUp/Down 切年,Home/End 切週首尾
- **ARIA**：`role="grid"` + 日格 `role="gridcell" aria-selected`
- **Focus**：`autoFocus` prop 自動 focus 到選中日(或今天)
- **Locale**：`locale` prop 控制週首日、星期標頭語言

**DS 自訂部分**:day button 的焦點框由本元件 classNames 覆寫為 DS 焦點幾何(`focus-visible:focus-ring-inset`,填色格 `focus-ring-inset-emphasis`,見上方 cell state 表「focus-visible」列;非 RDP 預設樣式。2026-09-23 前本句寫的 `focus-visible:ring-2 ring-ring` 是 2026-09-07 焦點幾何收斂前的舊寫法);SR 文案經 RDP `labels` API 提供中文 default(nav「上一個月 / 下一個月」、day / weekday / grid 等全繁中,對齊 2026-07-04 全庫 SR label 中文 canonical),consumer 傳 `labels` 可逐鍵覆寫(i18n),不在 components override 內 hardcode `aria-label`(會蓋死覆寫通道)。其餘 consumer 無需額外處理,保留 react-day-picker API 即可。

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
