---
component: NumberInput
family: 4
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInputLike
benchmark:
  - Ant Design InputNumber: github.com/ant-design/ant-design/tree/master/components/input-number
  - MUI TextField (number): github.com/mui/material-ui/tree/master/packages/mui-material/src/TextField
---

# NumberInput 設計原則

## 定位

NumberInput 是**數值的**輸入與顯示元件。格式化邏輯：`toLocaleString()` + prefix/suffix + precision。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 NumberInput 特有的原則。

## Controlled-only rationale(Dim 26)

本元件採 **controlled-only**:`value` + `onChange`,不支援 `defaultValue` uncontrolled fallback(value pair V1)。對齊 Field 家族 canonical(Combobox / DatePicker / TimePicker / SelectMenu 同,rationale 見各 spec 同名段);NumberInput 另因 raw 輸入 ↔ 格式化值的 parse pipeline 以 `null` 為空值 sentinel,dual-mode 會複製 parse 狀態。未來要改 dual-mode 需 `useControllableState` helper,屬 major API 擴充。

**Layout Family**：CLAUDE.md 4-Family Model **Family 4（Field control layout）** 消費者。結構繼承 `components/Field/field-controls.spec.md` 的 `fieldWrapperStyles + [startIcon?] [<editable>] [endAction?]` 規格,視覺對齊 Family 1（Menu item）讓 SelectMenu trigger + options 連續一致。

---

## 何時用

- **所有數值資料**：金額、數量、百分比、比率、測量值、年齡、計數
- **需要格式化的 value**：千分位（`1,234,567`）、貨幣前綴（`$2,490`）、百分比後綴（`85.5%`）、小數精度（`0.00`）
- **需要 locale-aware 顯示**（`toLocaleString()` 自動處理千分位分隔符、小數點形式）
- **DataTable 的數值欄位**（right-aligned + 自動格式化）

## 何時不用

| 場景 | 改用 | 原因 |
|------|------|------|
| 純文字 / 看起來像數字的字串（電話、郵遞區號）| `Input` | 電話不是算術型數字，不需要千分位 / 不該用 step |
| 日期 / 時間戳 | `DatePicker` | 需要日期語意和 picker 互動 |
| 視覺調整數值（音量、亮度、滑動調整）| `Slider` | 使用者目標是「感受」而非「輸入精確值」 |
| 大量帶小數的科學計算 | `Input` + 自訂驗證 | 極端精度需求超出 NumberInput 格式化能力 |

**常見誤解**:(1)「看起來像數字」≠ 數值——電話 / 郵遞區號 / 身分證號用 `Input`(見上表);(2)百分比 value 直接存 `85` 非 `0.85`,`suffix='%'` 純顯示;(3)NumberInput **無** step ↑↓ stepper——純值輸入,加減互動走 `endSlot`(見禁止事項)。

---

## 格式化選項

| 選項 | 說明 | 範例 |
|------|------|------|
| `prefix` | 前綴字串（如貨幣符號） | `$2,490` |
| `suffix` | 後綴字串（如百分比） | `85.5%` |
| `precision` | 小數位數 | `85.50` |
| `locale` | 數字格式 locale | 預設 `en-US` |

千分位**無獨立 prop**——由 `toLocaleString(locale)` 自動產生(含負號與超大數字分組)。「何時用」列的四種格式化(千分位 / 前綴 / 後綴 / 精度)= 上表 3 個 prop + 此預設行為的映射。

## 對齊

- **Edit 模式（input）**：靠左——input 內打字是左到右
- **Table cell（Display）**：靠右——縱向比較位數需要右對齊（由 DataTable 的 column type `number` / `currency` 控制）

## Display

`<NumberInput mode="display">` 在 table cell 和 Form readonly 共用 `formatNumber()` 格式化函式。

- 有值：格式化輸出（prefix + localized number + suffix）
- null / undefined：`—`（em dash），`text-fg-muted`

## DataTable 整合

```tsx
// 自動格式化——不需要手寫 cell
col.accessor('price', {
  header: 'Price',
  meta: { type: 'currency', prefix: '$' },
})
```

`currency` 類型預設 `prefix: '$'`，其餘等同 `number`。

---

## Mode / Validation / a11y

詳見 `../Field/field-controls.spec.md`(Mode / Validation)+ `../Field/form-validation.spec.md`(驗證時機)。

---

## 禁止事項

- ❌ 不要拿 NumberInput 顯示電話 / 郵遞區號 / 身分證號(非算術型數字)— 用 `Input`(電話千分位無意義 / step 不適用)
- ❌ 不要把 `precision` 設超過 6(浮點精度雜訊)— 極端精度需求超出格式化能力,改用 `Input` + 自驗證
- ❌ 不要在 DataTable cell 用左對齊 NumberInput(縱向比較位數需右對齊)— 走 DataTable column type `number` / `currency` 預設右對齊
- ❌ 不要把 `prefix='$'` 跟 `suffix='元'` 同時用 — 貨幣語意衝突,擇一即可
- ❌ 不要拿 NumberInput 做百分比但 value 存 0–1(`0.85` × 100 = 85%)— DS canonical 是 value 直接存百分比數值(85),`suffix='%'` 純顯示
- ❌ 不要自加 step ↑↓ button — NumberInput 是純值輸入(`type="text" inputMode="decimal"`),不提供 step；需要加減互動請走 `endSlot` 放自訂 stepper button group

---

## 邊界案例

- **Disabled**:由 Field SSOT own(`Field/field-controls.spec.md` State machine 段)。視覺:wrapper bg → `bg-disabled`(neutral-2,`semantic.css` `--bg-disabled`)、formatted text → `text-fg-disabled`(M24 state>emphasis)。Display mode + disabled 維持格式化輸出但 token 切 disabled。
- **Loading**:NumberInput 不提供 loading state(`NumberInputProps` 無 `loading` prop、無 `CircularProgress` / `aria-busy` 邏輯)。數值輸入為同步操作,無 async fetch 語意;若需 async 場景(如遠端校驗)請走外層 Field validation + `endSlot` 自訂 spinner。
- **Empty(null / undefined / 空字串)**:Display mode 渲 `—`(em dash + `text-fg-muted`);Edit mode placeholder 走 default placeholder color。
- **Invalid input**(non-numeric):input 為 `type="text" inputMode="decimal"`,onChange 以 `Number(raw)` parse,NaN 時忽略不觸發 `onChange`(value 維持原值);搭配 Field validation 渲 error variant(`aria-invalid="true"` + `text-fg-error` border + 下方 error message)。
- **負數 / 超大數字**:`toLocaleString(locale)` 自動處理負號與千分位分組,無特殊 prop。
- **科學記號輸入**(`1e5`):`Number(raw)` parse 為 `100000`,非 NaN 即觸發 `onChange`(`number-input.tsx:136-138`)。
- **精度上限**:`precision` > 6 為禁止事項(浮點精度雜訊),極端精度走 `Input` + 自驗證。
- **RTL**:未實作方向鏡像(edit 靠左 / table cell 靠右皆以 LTR 設計);RTL 屬 DS-wide 決策,未定(與 Chip / Breadcrumb 同口徑)。
- **Dark mode / density**:走 Field SSOT,不獨立 own。

---

## 相關

- `../Input/input.spec.md` — 純文字（含電話 / 郵遞區號等「看起來像數字」的資料）
- `../DatePicker/date-picker.spec.md` — 日期
- `../Slider/slider.spec.md` — 視覺調整數值（音量、亮度）
- `../Field/field-controls.spec.md` — Field Control 共用規則（mode / size / endAction / error）

## A11y 預設

**ARIA / Pattern**:ARIA / keyboard 機制**僅 edit mode 適用**——edit mode 渲染 native `<input>` element(預設 a11y),且把 `...props`(含 `aria-label` / `aria-describedby` 等)轉發到該 input,Field wrapper 另補 `aria-invalid` / `aria-required` / `aria-describedby` / `aria-errormessage`。`display` / `readonly` / `disabled` 三 mode 渲染的是無互動純展示文字(`<div>` + `<span>`,不轉發 `aria-*`),螢幕報讀僅得格式化後的靜態值(對齊 Carbon read-only / Stripe display 慣例)。

**Keyboard 行為**:

- Tab — focus
- 數字鍵 — 輸入數值

**Focus**:native input 為 `outline-none` 無自身 focus ring;藍框由 Field wrapper 的 `focus-within:!border-primary` 提供(input 取得 focus → wrapper `focus-within` fire → border 轉 primary)。

**驗證**:Storybook a11y addon panel 應 0 critical violation;鍵盤完整可操作(無需滑鼠)。WCAG AA contrast ≥ 4.5:1(text)/ 3:1(UI)。

## 被引用(auto-maintained,Dim 3 reciprocal audit)

> 本節由 `scripts/add-reciprocal-pointers.mjs` 自動維護,列出在 SSOT 語境下指向本 spec 的其他 spec。若要手動補充,寫在本節之前。

- `date-picker.spec.md`
- `input.spec.md`
- `slider.spec.md`
