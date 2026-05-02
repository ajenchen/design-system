# Advanced Filter — Operator × ColumnType × ValueShape SSOT(DRAFT v1)

> **狀態**:Draft for review。Phase A 交付物。確認後升 `filter-operators.spec.md` 並寫成 `filter-operators.ts` registry。
> **M8 benchmark**:對照 ClickUp(CU)/ Airtable(AT)/ Notion(NT)三家。
> **檔位**:暫放 DataTable/,若決定抽 `patterns/advanced-filter/` 再搬。

## 1. ValueShape canonical(11 種)

每個 operator 的「值該用什麼 picker」由 ValueShape 決定 — panel 只認 ValueShape,不認 op。新增 op 只需 map 到既有 shape。

| ValueShape | UI 渲染 | 何時用 |
|---|---|---|
| `none` | (不渲) | `is_set / is_empty / is_true` 類純 predicate |
| `text` | `<Input>` | 單行文字 |
| `number` | `<NumberInput>` | 單一數字 |
| `number_range` | `<InputSurface>` 內 2× NumberInput + `→` | 數值介於 |
| `date_single` | `<DatePicker>` 單選 | 特定日期 |
| `date_range` | `<InputSurface>` 內 DatePicker range | 日期介於 |
| `date_relative` | `<Select>` 預設選項 | 相對日期(今天 / 本週 / ...) |
| `select_single` | `<Select>` from `column.meta.options` | 單選 |
| `select_multi` | `<SelectMenu>` from `column.meta.options` | 多選 |
| `person_single` | `<PeoplePicker>` 單選 | 單一人員 |
| `person_multi` | `<PeoplePicker multiple>` | 多人員 |

**boolean 不需獨立 shape** — `is_true / is_false` op 自帶語意,ValueShape = `none`。

**date_relative 預設選項 v1 範圍**:`today / yesterday / tomorrow / this_week / last_week / next_week / this_month / last_month / next_month / past_7_days / past_30_days`(11 個,對齊 ClickUp 子集)。

## 2. Operator Registry — 各 columnType 完整 op set

### `string`(文字)
| op key | 中 | en | shape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `contains` | 包含 | contains | `text` | ✓ | ✓ | ✓ |
| `does_not_contain` | 不包含 | does not contain | `text` | ✓ | ✓ | ✓ |
| `is` | 等於 | is | `text` | ✓ | ✓ | ✓ |
| `is_not` | 不等於 | is not | `text` | ✓ | ✓ | ✓ |
| `starts_with` | 開頭為 | starts with | `text` | ✓ | — | ✓ |
| `ends_with` | 結尾為 | ends with | `text` | ✓ | — | ✓ |
| `is_empty` | 為空 | is empty | `none` | ✓ | ✓ | ✓ |
| `is_not_empty` | 不為空 | is not empty | `none` | ✓ | ✓ | ✓ |

**default op**:`contains`。

### `number` / `currency`
| op key | 中 | en | shape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `equals` | 等於 | = | `number` | ✓ | ✓ | ✓ |
| `not_equals` | 不等於 | ≠ | `number` | ✓ | ✓ | ✓ |
| `gt` | 大於 | > | `number` | ✓ | ✓ | ✓ |
| `lt` | 小於 | < | `number` | ✓ | ✓ | ✓ |
| `gte` | 大於等於 | ≥ | `number` | ✓ | ✓ | ✓ |
| `lte` | 小於等於 | ≤ | `number` | ✓ | ✓ | ✓ |
| `between` | 介於 | between | `number_range` | ✓ | — | — |
| `is_empty` | 為空 | is empty | `none` | ✓ | ✓ | ✓ |
| `is_not_empty` | 不為空 | is not empty | `none` | ✓ | ✓ | ✓ |

**default op**:`equals`。`currency` 共用同 set,渲染時依 `column.meta.precision/prefix` 格式化。

### `date`
| op key | 中 | en | shape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `is` | 是 | is | `date_single` | ✓ | ✓ | ✓ |
| `is_before` | 早於 | is before | `date_single` | ✓ | ✓ | ✓ |
| `is_after` | 晚於 | is after | `date_single` | ✓ | ✓ | ✓ |
| `is_on_or_before` | 不晚於 | is on or before | `date_single` | — | ✓ | ✓ |
| `is_on_or_after` | 不早於 | is on or after | `date_single` | — | ✓ | ✓ |
| `is_between` | 介於 | is between | `date_range` | ✓ | ✓ | ✓ |
| `is_relative` | 相對 | is within | `date_relative` | ✓ | ✓ | ✓ |
| `is_set` | 已設定 | is set | `none` | ✓ | ✓ | ✓ |
| `is_not_set` | 未設定 | is not set | `none` | ✓ | ✓ | ✓ |

**default op**:`is`。注意:date 用 `is_set / is_not_set`(語意「沒設日期」),其他 type 用 `is_empty / is_not_empty`(「值為空」)— 對齊 ClickUp。

### `select`(單選)
| op key | 中 | en | shape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `is` | 是 | is | `select_single` | ✓ | ✓ | ✓ |
| `is_not` | 不是 | is not | `select_single` | ✓ | ✓ | ✓ |
| `is_any_of` | 是其中之一 | is any of | `select_multi` | ✓ | ✓ | — |
| `is_none_of` | 不是其中任一 | is none of | `select_multi` | ✓ | ✓ | — |
| `is_empty` | 為空 | is empty | `none` | ✓ | ✓ | ✓ |
| `is_not_empty` | 不為空 | is not empty | `none` | ✓ | ✓ | ✓ |

**default op**:`is`。

### `multiSelect`(多選)
| op key | 中 | en | shape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `has_any_of` | 含其中之一 | has any of | `select_multi` | ✓ | ✓ | — |
| `has_all_of` | 全部包含 | has all of | `select_multi` | ✓ | ✓ | — |
| `has_none_of` | 不含其中任一 | has none of | `select_multi` | ✓ | ✓ | ✓ |
| `is_empty` | 為空 | is empty | `none` | ✓ | ✓ | ✓ |
| `is_not_empty` | 不為空 | is not empty | `none` | ✓ | ✓ | ✓ |

**default op**:`has_any_of`。**`is_exactly` 已砍**(user 確認 v1 不需,實務 edge case)。

### `select` vs `multiSelect` op set 為何不同(關鍵差異)

| | `select`(cell = 單一字串) | `multiSelect`(cell = 字串陣列) |
|---|---|---|
| 1-to-1 比對 | ✓ `is` / `is_not` | ✗ 不適用(陣列比單值 ambiguous) |
| 集合屬於 | ✓ `is_any_of` / `is_none_of` | ✗ 用 `has_*` 取代 |
| 集合運算 | ✗ 不適用(單值無法「全含」) | ✓ `has_any_of` / `has_all_of` / `has_none_of` |

差異**根源於 cell 資料形狀**,不是 picker 不同。Value picker 兩者都共用 `Select`(單值)/ `SelectMenu`(多值)DS 既有元件。

### `person`(單一人員)
| op key | 中 | en | shape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `is` | 是 | is | `person_single` | ✓ | ✓ | ✓ |
| `is_not` | 不是 | is not | `person_single` | ✓ | ✓ | ✓ |
| `is_empty` | 未指派 | is empty | `none` | ✓ | ✓ | ✓ |
| `is_not_empty` | 已指派 | is not empty | `none` | ✓ | ✓ | ✓ |

**default op**:`is`。

### `multiPerson`(多人員)
| op key | 中 | en | shape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `has_any_of` | 含其中之一 | has any of | `person_multi` | ✓ | ✓ | ✓ |
| `has_all_of` | 全部包含 | has all of | `person_multi` | ✓ | ✓ | — |
| `has_none_of` | 不含其中任一 | has none of | `person_multi` | ✓ | ✓ | ✓ |
| `is_empty` | 未指派 | is empty | `none` | ✓ | ✓ | ✓ |
| `is_not_empty` | 已指派 | is not empty | `none` | ✓ | ✓ | ✓ |

**default op**:`has_any_of`。

### `boolean`(checkbox)
| op key | 中 | en | shape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `is_true` | 是 | is checked | `none` | ✓ | ✓ | ✓ |
| `is_false` | 否 | is not checked | `none` | ✓ | ✓ | ✓ |

**default op**:`is_true`。**沒有 `is_empty`**(boolean 在 DB 通常 default false,語意上不存在「empty」)。

### `url`
| op key | 中 | en | shape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `contains` | 包含 | contains | `text` | ✓ | ✓ | ✓ |
| `does_not_contain` | 不包含 | does not contain | `text` | ✓ | ✓ | ✓ |
| `is` | 是 | is | `text` | ✓ | ✓ | ✓ |
| `is_not` | 不是 | is not | `text` | ✓ | ✓ | ✓ |
| `starts_with` | 開頭為 | starts with | `text` | ✓ | — | ✓ |
| `ends_with` | 結尾為 | ends with | `text` | ✓ | — | ✓ |
| `is_empty` | 為空 | is empty | `none` | ✓ | ✓ | ✓ |
| `is_not_empty` | 不為空 | is not empty | `none` | ✓ | ✓ | ✓ |

**default op**:`contains`。Op set 跟 `string` 一樣,只是 column type 不同(渲染 cell 為 link)。

## 3. TypeScript 結構草案

```ts
export type ValueShape =
  | 'none' | 'text' | 'number' | 'number_range'
  | 'date_single' | 'date_range' | 'date_relative'
  | 'select_single' | 'select_multi'
  | 'person_single' | 'person_multi'

export interface OperatorSpec {
  op: string                 // op key,e.g. 'contains'
  label: string              // 顯示名,e.g. '包含'(i18n 之後)
  valueShape: ValueShape
}

export const OPERATOR_REGISTRY: Record<ColumnType, OperatorSpec[]> = { ... }
export const DEFAULT_OPERATOR: Record<ColumnType, string> = { ... }
```

## 4. 拍板紀錄(2026-05-02 user 確認)

| # | 議題 | 決議 |
|---|---|---|
| 1 | `string` 包 `starts_with` / `ends_with` | ✅ 包 |
| 2 | `number` 包 `between` | ✅ 包 |
| 3 | `select` 包 `is_any_of` / `is_none_of` | ✅ 包 |
| 4 | `multiSelect` 的 `is_exactly` | ❌ 砍(user 確認 v1 不需) |
| 5 | `date_relative` 預設選項 | ✅ 11 個常用集 |
| 6 | label 硬編繁中 | ✅ 暫硬編,留 i18n hook |
| 7 | op 命名 snake_case | ✅ 採用 |

## 5. 同 field 可重複加 condition(關鍵設計約束)

對齊 ClickUp idiom — 同一 field 可加多筆 condition,例:

```
(Status is Open OR Status is Review) AND Priority is High
```

我們的 FilterTree model 天然支援(condition 沒 dedup by field)。

**技術坑**:TanStack `ColumnFiltersState` 是 per-column 一筆 filter value,**不能塞 N 條同 column**。實作時需要:
- Panel 自己管 FilterTree state
- 求值時整棵 tree 對 row 求 boolean(透過 `globalFilter` 或 client-side 聚合)
- 棄用 TanStack 的 `columnFilters` 自動聚合

此約束會影響 panel ↔ DataTable 的 API 設計,**Phase B spec.md 處理**。

## 6. 出現次數統計(M8 信心指標)

3 家共出現 op(計入別名統一)後:
- **3/3 家共識**:46 個 op-cell(高信心)
- **2/3 家共識**:8 個 op-cell(`starts_with` / `ends_with` / `is_any_of` / `is_none_of` / `has_any_of` / `has_all_of` / `is_on_or_before` / `is_on_or_after`)— 中信心,實務常用保留
- **1/3 家獨有**:1 個 op-cell(`number.between` 只 CU)— 配 InputSurface 自然,保留

---

## 7. Phase A 結案 — Phase B 銜接

Phase B 啟動項:
- [ ] ValueShape × DS 元件視覺驗證(SelectMenu / PeoplePicker / DatePicker / NumberInput / InputSurface)
- [ ] advanced-filter spec.md draft(data model / props / 與 DataTable 耦合 / FilterTree 求值策略)
- [ ] InputSurface pattern vs component 決定
- [ ] i18n 策略確認

確認後升正式 spec 並開始 Phase 1 code。
