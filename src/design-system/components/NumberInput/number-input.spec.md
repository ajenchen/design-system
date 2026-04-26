---
component: NumberInput
family: 4
variants: {}
sizes: {}
traits:
  - hasInteractiveStates
  - isInputLike
---

# NumberInput 設計原則

## 定位

NumberInput 是**數值的**輸入與顯示元件。格式化邏輯：`toLocaleString()` + prefix/suffix + precision。

共用規則見 `../Field/field-controls.spec.md`。本文件只記錄 NumberInput 特有的原則。

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

---

## 格式化選項

| 選項 | 說明 | 範例 |
|------|------|------|
| `prefix` | 前綴字串（如貨幣符號） | `$2,490` |
| `suffix` | 後綴字串（如百分比） | `85.5%` |
| `precision` | 小數位數 | `85.50` |
| `locale` | 數字格式 locale | 預設 `en-US` |

## 對齊

- **Edit 模式（input）**：靠左——input 內打字是左到右
- **Table cell（Display）**：靠右——縱向比較位數需要右對齊（由 DataTable 的 column type `number` / `currency` 控制）

## Display

`NumberInputDisplay` 在 table cell 和 Form readonly 共用 `formatNumber()` 格式化函式。

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

## 相關

- `../Input/input.spec.md` — 純文字（含電話 / 郵遞區號等「看起來像數字」的資料）
- `../DatePicker/date-picker.spec.md` — 日期
- `../Slider/slider.spec.md` — 視覺調整數值（音量、亮度）
- `../Field/field-controls.spec.md` — Field Control 共用規則（mode / size / endAction / error）
