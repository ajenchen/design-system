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
- **Trigger**:`<button>` + `fieldWrapperStyles`(視覺 = Input wrapper,但 role 是 button 開 popover)
- **Popup**:`<Popover>`(消費 `patterns/overlay-surface/` 的 surface chrome)
- **Panel 主體**:**自建** 2-3 欄 column picker(時 / 分 / 秒),**不引入第三方 time library**——自建讓 DS own 視覺與交互(對齊 Ant Design 的 Panel 結構 — [react-component/picker TimePanel](https://github.com/react-component/picker/tree/master/src/PickerPanel/TimePanel) + 本 DS token)
- **世界級對照**:Ant Design TimePicker([source](https://github.com/react-component/picker/tree/master/src/PickerPanel/TimePanel))/ Material DateTimePicker([mui-x DigitalClock](https://github.com/mui/mui-x/blob/master/packages/x-date-pickers/src/DigitalClock/DigitalClock.tsx))/ iOS native time picker `@benchmark-unverified`(closed-source)——共同行為:column scroll selector、minuteStep 支援、Now / OK footer、clearable

---

## Controlled-only rationale(Dim 26)

本元件刻意採 **controlled-only** 模式:`value` + `onChange` 必傳,不支援 `defaultValue` uncontrolled fallback。

**為什麼**:
- 內部狀態複雜(search filter / range / menu open state)跟 `value` 雙向 sync 會產生 race condition
- Consumer 幾乎一定有外部 state(form library / app state),強制 controlled 消除 ambiguity
- 世界級對照:Ant Design DatePicker([source](https://github.com/react-component/picker/blob/master/src/PickerInput/SinglePicker.tsx)) / Material MUI Select([source](https://github.com/mui/material-ui/blob/master/packages/mui-material/src/Select/Select.js))皆支援 dual-mode;我們選 controlled-only 對齊狀態一致性優先

**若未來要改 dual-mode**:需引入 `useControllableState` helper + 測試 controlled↔uncontrolled switch 場景,屬 major API 擴充,非本 session scope。

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
  mode="edit" | "readonly" | "disabled"
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
┌─────────────────────────────────┐
│  時    分    [秒]                │  ← header(有 label 時顯示)
├─────┬─────┬──────────────────┤
│  09 │  00 │                   │
│  10 │  15 │  每欄 scrollable   │  ← body
│▓11▓│▓30▓│  選中項藍底白字     │
│  12 │  45 │                   │
│  13 │     │                   │
├─────┴─────┴──────────────────┤
│            [Now]    [OK]     │  ← footer(選填)
└───────────────────────────────┘
```

### 欄內 item 狀態(對齊 SelectMenu canonical,**非 DatePicker**)

| State | 視覺 | Token |
|-------|------|-------|
| 正常 | 置中文字 | `text-foreground` |
| hover | 灰底 | `hover:bg-neutral-hover` |
| **selected** | **灰底**(非藍底) | `bg-neutral-selected text-foreground rounded-md` |
| disabled(`disabledTime`) | 灰字 | `text-fg-disabled cursor-not-allowed` |

**為什麼 selected 走 neutral 非 primary**(2026-04-21 canonical):TimePicker panel 是「**列表選中**」語意 — user 在時 / 分 / 秒選項間切換,跟 `SelectMenu` / `MenuItem` 同流派(單選 list → `bg-neutral-selected`)。**DatePicker date cell selected 用 `bg-primary`** 是因為那是「**最終選定日期**」的強 affordance(確定性)。兩者不同語意,不互調。

對齊 SelectMenu / MenuItem 的好處:consumer 看 TimePicker 面板知道這是「選一個項目」,跟 Select 下拉選單認知一致(Ant Design TimePicker panel 同樣採 neutral selected — [picker style source](https://github.com/ant-design/ant-design/blob/master/components/date-picker/style/panel.ts) `@benchmark-unverified` exact line)。

### Spacing + 結構(2026-04-21 canonical,2026-04-21 window width 修正)

- Panel 內 padding = `--layout-space-tight`(12px @ md density)
- **三欄(時 / 分 / 秒)各欄 `w-12`(48px)固定,非 flex-1 均分**(對齊 Ant / Google 世界級慣例 `@benchmark-unverified` visual measurement)。**分隔「:」移除**(AR8 canonical — Ant TimePicker / Google Calendar 同樣不加 `:`,靠 column 間距自明 `@benchmark-unverified` visual)
- Scrollable list 用 **`<ScrollArea>`**(對齊 DS 跨 OS 一致 overlay 捲軸 canonical);不 raw `overflow-y-auto`
- **Scroll-into-view**:mount = `behavior:'auto'`(避閃爍),後續 `value` 變更 = `behavior:'smooth'`(對齊 iOS / Material / Ant timepicker idiom)。SSOT 在 `time-columns.tsx` `TimeColumn` useEffect
- 每 item **`h-field-sm`(28px @ md / 32px @ lg)對齊 DatePicker date cell**(跨 picker 視覺一致)
- List 高 `h-[216px]`(容納約 7 個 item 置中)

### Panel 寬度 content-driven(AR42 修正,2026-04-21)

**每欄 w-12(48px)固定,Panel 寬度隨 showSeconds 動態變化**:

| 模式 | 欄數 | Panel 寬(含 padding + gap) |
|------|------|---------------------------|
| HH:mm(預設)| 2 欄 | `2 × 48 + gap-1 × 1 + px × 2` ≈ 48×2 + 4 + 24 = **124px** |
| HH:mm:ss(showSeconds=true)| 3 欄 | `3 × 48 + gap-1 × 2 + px × 2` ≈ 48×3 + 8 + 24 = **176px** |

**世界級對照**:
- Ant Design TimePicker:每欄 ~56px,3 欄 ~170px(Panel 含 footer)`@benchmark-unverified` visual measurement(visual sampling,not source-citable as exact pixel)
- Google Calendar Quick-Time:~150-170px
- Material 3 TimePicker dial:~180px(含 AM/PM)`@benchmark-unverified` visual measurement
- 本 DS:每欄 48px,2 欄 ~124px / 3 欄 ~176px,**符合世界級緊湊節奏**

**為什麼每欄 48px 不 56 / 64**:
- 48px = `h-field-sm × 1.7`,兩位數字 `tabular-nums`(約 16-18px 寬)+ 左右呼吸 ~15px。不貼邊也不浪費
- 56-64px 寬度逼近 Select menu 語境;picker column 超過此寬度會模糊 picker vs menu 的視覺界線
- Ant 56 / 本 DS 48 差異在:Ant 的 item 有圓角 button 佔寬,本 DS 走 `rounded-md` `text-center`,視覺 48px 不擠 `@benchmark-unverified` visual measurement

**showSeconds 切換時 panel 寬度會跟著變**(刻意):
- 對齊 Ant 慣例(content-driven)
- showSeconds=false 的 panel 本就應該更窄,兩欄 + 大量留白會顯得 panel 空洞
- Popover position 受 side / align / collisionPadding 控制,寬度變化只移動 panel 位置不影響 anchor 關係

---

## 鍵盤

| 按鍵 | 行為 |
|------|------|
| 點 trigger | 開 Panel |
| Esc | 關 Panel(不確認) |
| Tab | 焦點在 column 間移動 |
| ↑ / ↓ | 欄內上下選 |
| Enter | 確認當前 highlight |
| 直接鍵入數字(optional) | 跳到對應值 |

---

## 狀態行為

### Mode / Error / Disabled / Readonly
詳見 `../Field/field-controls.spec.md`(共用規則)。

### Empty 值
`value={null}` / `value=""` / `value=undefined` 都視為空,trigger 顯示 `placeholder`。Display 模式空值顯示 `—`(對齊 `EMPTY_DISPLAY`)。

### 驗證時機
- Panel 關閉(OK 或 outside click)時 commit value 給 `onChange`
- `disabledTime` 在 Panel 開啟時套用(selected hour 改變會重算 disabledMinutes)
- 若 consumer 需要 form-level 必填驗證 → 外層 `<Field>` + `<FieldError>` 承擔(不是 TimePicker 本體責任)

### Loading
N/A — TimePicker 是純同步輸入,無 async 狀態。

---

## A11y 預設

- trigger 需 `aria-label`(若沒外部 `<label>`)
- Panel 開啟時 trigger `aria-expanded="true"`
- 每欄 `role="listbox"`,item `role="option" aria-selected`
- Screen reader 讀出「時間選擇器,當前 9 時 30 分」

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
- **Empty(no value)**:`value=null` 為合法 initial state,trigger 顯 placeholder(預設「選擇時間」);`null` + Display mode 顯 `—`(em dash + `text-fg-muted`)對齊 Input display empty 慣例。
- **Empty(disabled all times)**:極端場景(`disabledHours` / `disabledMinutes` 覆蓋全範圍),panel column 全 disabled,鍵盤焦點停留無導覽目標。
- **Dark mode / density**:走 Field + Popover SSOT 自動 adapt;panel column item 由 MenuItem SSOT 控 density。

---

## 相關

- `../DatePicker/date-picker.spec.md` — 日期選擇,TimePicker 姊妹元件,API 風格對齊
- `../Input/input.spec.md` — Field control 基礎
- `../Field/field-controls.spec.md` — Mode / size / error 共用規則
- `../Field/form-validation.spec.md` — 驗證時機
- `../../patterns/element-anatomy/item-anatomy.spec.md`「Dismiss 按鈕 canonical」 — clear button 規則
