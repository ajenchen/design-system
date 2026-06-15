---
component: TimePicker
family: 4
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInputLike
benchmark:
  - Ant Design TimePicker: github.com/ant-design/ant-design/tree/master/components/time-picker
  - MUI X Date Pickers (Time): github.com/mui/mui-x/tree/master/packages/x-date-pickers
---

<!-- @benchmark-cited: D5 retrofit 2026-05-18 — all claims have inline URL or per-claim @benchmark-unverified retract. M22 inline cites added 2026-05-03 v11. -->

# TimePicker 設計原則

## 定位

TimePicker 是**單一時間**(時/分/秒)輸入與顯示元件,對齊 Ant Design `<TimePicker>` API 風格(source: [github.com/react-component/picker/src/PickerInput/SinglePicker.tsx](https://github.com/react-component/picker/blob/master/src/PickerInput/SinglePicker.tsx)),但視覺與互動走本 DS 設計語言。

**Layout Family**:**Family 4(Field control layout)**,視覺對齊 Family 1(Menu item)。見 `patterns/element-anatomy/element-anatomy.spec.md`「Field Composition(不在 family 但相關)」段。

**實作基礎**:
- **Trigger**:`<div role="combobox">` + `fieldWrapperStyles`(視覺 = Input wrapper;**不用 `<button>`** —— 避免內層 `ItemInlineAction` 清除 button 構成 nested-interactive,對齊 Select / Combobox 同 pattern。Radix PopoverTrigger 在 `asChild` 下只 compose onClick 與 aria / data attributes,**不** inject 任何 onKeyDown——Enter / Space / ↓ 鍵盤開啟由 trigger 顯式 `onKeyDown` 實作,對齊 select.tsx canonical + APG combobox required keys)
- **Popup**:`<Popover>`(消費 `patterns/overlay-surface/` 的 surface chrome)
- **Panel 主體**:**自建** 2-3 欄 column picker(時 / 分 / 秒),**不引入第三方 time library**——自建讓 DS own 視覺與交互(對齊 Ant Design 的 Panel 結構 — [react-component/picker TimePanel](https://github.com/react-component/picker/tree/master/src/PickerPanel/TimePanel) + 本 DS token)
- **世界級對照**:Ant Design TimePicker([source](https://github.com/react-component/picker/tree/master/src/PickerPanel/TimePanel))/ Material DateTimePicker([mui-x DigitalClock](https://github.com/mui/mui-x/blob/master/packages/x-date-pickers/src/DigitalClock/DigitalClock.tsx))/ iOS native time picker `@benchmark-unverified`(closed-source)——共同行為:column scroll selector、minuteStep 支援、Now / OK footer、clearable

---

## Controlled-only rationale(Dim 26)

本元件刻意採 **controlled-only** 模式:`value` + `onChange` 必傳,不支援 `defaultValue` uncontrolled fallback。

**為什麼**:
- 內部狀態(panel `open` + 暫存 `draft` 值)若要跟外部 `value` 雙向 sync 會產生 race condition
- Consumer 幾乎一定有外部 state(form library / app state),強制 controlled 消除 ambiguity
- 世界級對照:Ant Design DatePicker([source](https://github.com/react-component/picker/blob/master/src/PickerInput/SinglePicker.tsx)) / Material MUI Select([source](https://github.com/mui/material-ui/blob/master/packages/mui-material/src/Select/Select.js))皆支援 dual-mode;我們選 controlled-only 對齊狀態一致性優先

**若未來要改 dual-mode**:需引入 `useControllableState` helper + 測試 controlled↔uncontrolled switch 場景,屬 major API 擴充,非本 session scope。

### Open-pair rationale:defaultOpen + onOpenChange,無 controlled open(2026-06-12 deep-audit R2 補)

open 軸同樣只開最小 API — **uncontrolled-only**:`defaultOpen`(初始開)+ `onOpenChange`(通知 callback),無 controlled `open` prop。

**為什麼**:
- 已知需求只要「初始開 + 知道何時關」:(1) 視覺快照 — Storybook OpenSnapshot / visual-audit(M15)`defaultOpen` 一行達成;(2) DataTable cell-as-input(`DataTable/cell-registry.tsx`)— `defaultOpen` 1-step 開 panel,`onOpenChange(false)` → cell exit edit mode
- open 跟 panel draft 生命週期綁死:開啟時以當前 value 重新初始化 draft(time-picker.tsx open effect)/ Now → commit + 關 / OK → 關 / Esc dismiss,全走 `setOpen` wrapper 統一 fire `onOpenChange`。controlled `open` 等於把 draft 初始化 + 關閉時機切一半給 consumer,漏接 → draft 殘留 / cell 卡 edit
- 世界級對照:Radix Popover([radix-ui.com/primitives/docs/components/popover](https://www.radix-ui.com/primitives/docs/components/popover))/ Ant Select([ant.design/components/select](https://ant.design/components/select))/ MUI Select([mui.com/material-ui/api/select](https://mui.com/material-ui/api/select/))皆提供 controlled `open` — 它們是泛用 primitive / library,必須支援任意 orchestration;本 DS 是 opinionated form control,無真實 consumer 需求前不為「可能性」付受控成本(Rule-of-3)

**若未來要開 controlled open**:同 value 軸引入 `useControllableState` helper + 測 controlled↔uncontrolled switch,屬 major API 擴充,非本 session scope。

---

## 何時用

| 情境 | 範例 |
|------|------|
| 會議排程時間 | Calendar event 的 start / end time(常 minuteStep=15) |
| 航班 / 公車時刻 | 起飛時間、發車時間(HH:mm) |
| 營業時間 / 工作時間 | 店家開放時間、員工排班上下班 |
| 提醒 / 鬧鐘時間 | Reminder time picker(秒無意義,showSeconds=false) |

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 同時需要日期 + 時間 | **DatePicker with time** 或 `<DatePicker> + <TimePicker>` 並列 | TimePicker 本身不帶日期;需配 DatePicker 組合 |
| 時間範圍(from-to) | **兩個 `<TimePicker>`** 並列 + 之間 `<ArrowRight>` | TimePicker **MVP 不支援 range**,用組合達成(對齊 Ant `TimePicker.RangePicker` 的 composition 思路 — [source](https://github.com/react-component/picker/blob/master/src/PickerInput/RangePicker.tsx)) |
| 純文字時間輸入(秒有意義的科學測量) | `<Input>` + mask / regex validation | TimePicker 的 column UX 不適合大量精確輸入 |
| 倒數計時 / 相對時間 | 自行渲染 `MM:SS` 倒數 | TimePicker 是 wall-clock time,不是 duration |

---

## API

```tsx
<TimePicker
  value={time}                   // ISO "HH:mm" or "HH:mm:ss" | null
  onChange={setTime}
  size="sm" | "md" | "lg"        // 對齊 field-height family,default md
  mode="edit" | "display" | "readonly" | "disabled"   // display = 純展示(DataTable cell 用)
  disabled={boolean}
  error={boolean}
  clearable={boolean}
  placeholder="請選擇時間"
  showSeconds={boolean}          // 預設 false(兩欄:時/分)
  minuteStep={1 | 5 | 10 | 15 | 30}   // 會議常用 15
  secondStep={1 | 5 | 10 | 15 | 30}   // showSeconds=true 時生效
  disabledTime={(parts) => ({    // 動態禁用某些時/分/秒
    disabledHours: [...],
    disabledMinutes: [...],
    disabledSeconds: [...],
  })}
  endIcon={Clock}                // 預設 Clock,傳 null 關閉(2026-05-05 v9:點擊觸發浮層 indicator 一律 suffix,對齊 DatePicker / Material endAdornment)
  locale="en-US"
  formatOptions={{ hour: '2-digit', minute: '2-digit', hour12: false }}
/>
```

### Value 格式

**Value 是 ISO time string**(`"HH:mm"` 或 `"HH:mm:ss"`),local-time 語義(不帶時區 / 不帶日期)—— 對齊 DatePicker 家族的「value = ISO string」策略,consumer 不需持有 Date object。

### 顯示格式化

**Display 走 `Intl.DateTimeFormat`**(跨 locale 統一、12h/24h 支援)。`formatOptions` 透傳進去。

---

## 尺寸

| size | field-height(md density) | Icon | 字體 |
|------|--------------------------|------|------|
| sm | 28px(`h-field-sm`)| 16px | text-body |
| md | 32px(`h-field-md`,**預設**)| 16px | text-body |
| lg | 36px(`h-field-lg`)| 20px | text-body-lg |

**field-height family 成員**,default = md(與 Button / Input / DatePicker 共享),完整 density-aware 值(lg density: sm=32 / md=36 / lg=40)見 `tokens/uiSize/uiSize.spec.md`。

---

## Panel 視覺規則

Panel 展開後的 column picker 結構:

```
┌─────┬─────┬──────────────────┐
│  09 │  00 │                   │
│  10 │  15 │  每欄 scrollable   │  ← body(無可見「時 / 分 / 秒」標題列;
│▓11▓│▓30▓│  選中項灰底         │     label 僅作 listbox aria-label,不渲染)
│  12 │  45 │                   │
│  13 │     │                   │
├─────┴─────┴──────────────────┤
│            [此刻]    [確定]    │  ← footer(固定)
└───────────────────────────────┘
```

### 欄內 item 狀態(對齊 SelectMenu canonical,**非 DatePicker**)

| State | 視覺 | Token |
|-------|------|-------|
| 正常 | 置中文字 | `text-foreground` |
| hover | 灰底 | `hover:bg-neutral-hover` |
| **selected** | **灰底**(非藍底,滿欄矩形填色 `w-full`,無圓角) | `bg-neutral-selected text-foreground` |
| disabled(`disabledTime`) | 灰字 | `text-fg-disabled cursor-not-allowed` |

**為什麼 selected 走 neutral 非 primary**(2026-04-21 canonical):TimePicker panel 是「**列表選中**」語意 — user 在時 / 分 / 秒選項間切換,跟 `SelectMenu` / `MenuItem` 同流派(單選 list → `bg-neutral-selected`)。**DatePicker date cell selected 用 `bg-primary`** 是因為那是「**最終選定日期**」的強 affordance(確定性)。兩者不同語意,不互調。

對齊 SelectMenu / MenuItem 的好處:consumer 看 TimePicker 面板知道這是「選一個項目」,跟 Select 下拉選單認知一致(Ant Design TimePicker panel 同樣採 neutral selected — [picker style source](https://github.com/ant-design/ant-design/blob/master/components/date-picker/style/panel.ts) `@benchmark-unverified` exact line)。

### Spacing + 結構(2026-04-21 canonical,2026-04-21 window width 修正)

- Footer 內 padding = `--layout-space-tight`(12px @ md density)
- **Panel 容器固定寬:2 欄(時 / 分)`w-40`(160px)/ 3 欄(時 / 分 / 秒)`w-60`(240px)**;**每欄 `flex-1 h-full` 等分**容器寬(非固定 `w-12`)。**分隔「:」移除**(AR8 canonical — Ant TimePicker / Google Calendar 同樣不加 `:`,靠 column 間距自明 `@benchmark-unverified` visual)
- Scrollable list 用 **`<ScrollArea>`**(對齊 DS 跨 OS 一致 overlay 捲軸 canonical);不 raw `overflow-y-auto`
- **Scroll-into-view**:mount = `behavior:'auto'`(避閃爍),後續 `value` 變更 = `behavior:'smooth'`(對齊 iOS / Material / Ant timepicker idiom)。SSOT 在 `time-columns.tsx` `TimeColumn` useEffect
- 每 item **`h-field-sm`(28px @ md / 32px @ lg)對齊 DatePicker date cell**(跨 picker 視覺一致)
- Panel 容器高 `h-[216px]`(含 footer);TimeColumns 為 `flex-1 min-h-0`,實際可捲動 list 高 = 216 − footer 實高(Button sm 28px + `py-tight` 12px×2 + border-t 1px ≈ 53px @ md)≈ **~163px**(約可見 5-6 個 item)

### Panel 寬度(固定容器寬,隨 showSeconds 切換)

**Panel 容器固定寬度,欄位 `flex-1` 等分該寬度**(`TimeColumns` 的 `widthClass = showSeconds ? 'w-60' : 'w-40'`):

| 模式 | 欄數 | TimeColumns 容器寬 | 每欄寬(`flex-1` 等分) |
|------|------|------|------|
| HH:mm(預設)| 2 欄 | `w-40` = **160px** | ~80px |
| HH:mm:ss(showSeconds=true)| 3 欄 | `w-60` = **240px** | ~80px |

**世界級對照**:
- Ant Design TimePicker:每欄 ~56px,3 欄 ~170px(Panel 含 footer)`@benchmark-unverified` visual measurement(visual sampling,not source-citable as exact pixel)
- Google Calendar Quick-Time:~150-170px
- Material 3 TimePicker dial:~180px(含 AM/PM)`@benchmark-unverified` visual measurement
- 本 DS:2 欄 160px / 3 欄 240px,**符合世界級緊湊節奏**

**showSeconds 切換時 panel 寬度會跟著變**(刻意):
- showSeconds=false 的 panel 本就應該更窄(`w-40`),兩欄 + 大量留白會顯得 panel 空洞
- Popover position 受 side / align / collisionPadding 控制,寬度變化只移動 panel 位置不影響 anchor 關係

---

## 鍵盤

| 按鍵 | 行為 |
|------|------|
| 點 trigger | 開 Panel |
| Enter / Space / ↓(focus 在 trigger)| 開 Panel(APG combobox required keys,trigger 顯式 `onKeyDown`)|
| Esc | 關 Panel(不確認) |
| Tab | 焦點在 column 間移動 |
| ↑ / ↓ | 欄內上下選(每次移動即 commit,無 highlight 中間態) |
| Home / End | 跳該欄首 / 尾 enabled 值 |

---

## 狀態行為

### Mode / Error / Disabled / Readonly
詳見 `../Field/field-controls.spec.md`(共用規則)。

### Empty 值
`value={null}` / `value=""` / `value=undefined` 都視為空,trigger 顯示 `placeholder`。Display 模式空值顯示 `—`(對齊 `EMPTY_DISPLAY`)。

### 驗證時機
- **每次欄位選取(時 / 分 / 秒任一改變)當下即 commit value 給 `onChange`**(eager commit,非 OK 才送)。OK 鈕(「確定」)只負責關閉 Panel,不另行 commit。`此刻` 按鈕則一次 commit 當前時間並關閉 Panel
- `disabledTime` 在 Panel 開啟時套用(selected hour 改變會重算 disabledMinutes)
- 若 consumer 需要 form-level 必填驗證 → 外層 `<Field>` + `<FieldError>` 承擔(不是 TimePicker 本體責任)

### Loading
N/A — TimePicker 是純同步輸入,無 async 狀態。

---

## A11y 預設

- trigger `role="combobox"`,在 `<Field>` 內時以 `aria-labelledby` 指向 field label(`fieldCtx.labelId`)
- Panel 開啟時 trigger `aria-expanded="true"` + `aria-haspopup="dialog"`
- 每欄 `role="listbox"`(`aria-label` 為 `hours` / `minutes` / `seconds`),item `role="option" aria-selected`
- Screen reader 經 trigger 的 label + 內層可見值文字朗讀目前選取時間(目前值以可見 `<span>` 呈現,無額外 `aria-valuetext`)

---

## Dismiss / Clear 規則(對齊 CLAUDE.md canonical)

- **關閉 Panel** → `onOpenChange(false)`(Popover 內建)/ outside click / Esc —— 這是 **overlay close**,不是 `onClear`
- **清空值** → `clearable={true}` 在 trigger 的 endAction slot 顯示 `X` 透過 `ItemInlineActionButton`(canonical),點擊 `onChange("")`
- **禁止**:用帶文字 label 的 Button(「清除」)作 clear

---

## 為何無 Range(MVP)

user 若需「from-to」時間範圍,用**兩個 `<TimePicker>` 並列 + 中間 `<ArrowRight>`**(對齊 Ant `TimePicker.RangePicker` 的 composition 思路)。內建 Range 暫不 MVP 實作,因為:

1. 大部分「時間範圍」情境是**營業時間 / 會議時段**,consumer 端用兩個 TimePicker 組合語意更清晰
2. 未來若出現大量 Range 需求(如 shift 排班表),再抽 `<TimePicker.Range>` sub-composition,對齊 DatePicker.Range 的 API pattern

---

## ColorMatrix 說明(兩層 SSOT 整合展示)

TimePicker 視覺分兩層,各自繼承不同 SSOT:
- **Trigger 層**:走 Field Controls family 色彩(由 `../Field/field-controls.spec.md` 擁有,共用 Input / Select)
- **Panel column item 層**:走 SelectMenu / MenuItem canonical `bg-neutral-selected`(由 `patterns/element-anatomy/item-anatomy.spec.md` 擁有,非 `bg-primary`——見本 spec「欄內 item 狀態」表)

`ColorMatrix` story 整合展示兩層 token 對照,但不重複定義(各 token 來源明示指向上游 SSOT)。

## 為何無 StateBehavior

trigger 的互動狀態(focus / invalid / disabled / readonly)完全繼承 `../Field/field-controls.spec.md` SSOT「Mode 狀態」;panel 內 column item 的 hover / selected / disabled 走 `patterns/element-anatomy/item-anatomy.spec.md`「選擇 / 狀態視覺規則」。TimePicker 層級無自有 state 行為,panel 開 / 關由 Popover primitive 處理。重寫 StateBehavior = 與兩個 SSOT 同時漂移。

對應 anatomy story:保留 `Overview` + `Inspector` + `ColorMatrix`(兩層整合展示) + `SizeMatrix` + 元件特有 `ModeMatrix` / `PrecisionMatrix`。Field-level state 見 Input `StateBehavior` + field-controls.spec.md;panel item-level state 見 SelectMenu / MenuItem 的對應 story。

---

## 常見誤解

- 「OK(確定)鈕才 commit value」→ 錯;每次欄位選取**當下即 commit**(eager commit),OK 只關 Panel(見「驗證時機」)
- 「時間範圍要等內建 Range」→ 用兩個 `<TimePicker>` 並列組合即可(見「為何無 Range(MVP)」)
- 「value 可傳 Date object」→ 不可;家族統一 ISO time string(見「Value 格式」)
- 「selected 該用藍底」→ panel 是「列表選中」語意走 `bg-neutral-selected`,藍底是 DatePicker date cell 的「最終選定」語意(見「欄內 item 狀態」)

## 禁止事項

- ❌ 不要在 TimePicker 內部直接顯示日期——那是 DatePicker 的語義
- ❌ 不要把 value 改存 Date object——對齊家族 ISO string 策略
- ❌ minuteStep 不要設 7 / 11 / 13 等非整除值——會出現 00 / 07 / 14 / 21 / 28 / 35... 不符時間習慣
- ❌ 不要自刻 `<input type="time">`——瀏覽器原生 UI 跨 OS 不一致,違反 DS「跨 OS 視覺一致」原則
- ❌ Clear button 用帶文字 label 的 Button(違反 dismiss canonical,見 `patterns/element-anatomy/item-anatomy.spec.md`「Dismiss 按鈕 canonical」)

---

## 邊界案例

- **Disabled**:Field SSOT own;trigger 自動 disabled(`text-fg-disabled` + 不開 picker),Display mode + disabled 維持時間格式但 token 切 disabled。
- **Loading**:TimePicker 為 sync UI(time math 在 client),無 loading state。極端 case(後端 disabled-times list)應由 consumer 先 disable trigger 直到 fetch 完成。
- **Empty(no value)**:`value=null` 為合法 initial state,trigger 顯 placeholder;**未傳 `placeholder` 時 default = 格式遮罩**(`HH:MM`,showSeconds=true 時 `HH:MM:SS`),非固定文案。`null` + Display mode 顯 `—`(em dash + `text-fg-muted`)對齊 Input display empty 慣例。
- **Empty(disabled all times)**:極端場景(`disabledHours` / `disabledMinutes` 覆蓋全範圍),panel column 全 disabled,鍵盤焦點停留無導覽目標。
- **Panel 開啟中外部 value 變更**:controlled 單向資料流——欄位選中即時反映新 value,並 scroll-into-view(`behavior:'smooth'`,mount 後的變更;見「Spacing + 結構」的 Scroll-into-view 條)。
- **Dark mode / density**:走 Field + Popover SSOT 自動 adapt;panel column item 由 MenuItem SSOT 控 density。

---

## 相關

- `../DatePicker/date-picker.spec.md` — 日期選擇,TimePicker 姊妹元件,API 風格對齊
- `../Input/input.spec.md` — Field control 基礎
- `../Field/field-controls.spec.md` — Mode / size / error 共用規則
- `../Field/form-validation.spec.md` — 驗證時機
- `../../patterns/element-anatomy/item-anatomy.spec.md`「Dismiss 按鈕 canonical」 — clear button 規則
