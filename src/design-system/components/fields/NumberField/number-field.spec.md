# NumberField 設計原則

## 定位

NumberField 是數值的輸入與顯示元件。格式化邏輯：`toLocaleString()` + prefix/suffix。

共用規則見 `field.spec.md`。本文件只記錄 NumberField 特有的原則。

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

`NumberFieldDisplay` 在 table cell 和 Form readonly 共用 `formatNumber()` 格式化函式。

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
