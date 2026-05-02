# Advanced Filter — Operator × ColumnType × ValueShape SSOT(DRAFT v2)

> **狀態**:Draft for review。Phase A 結案版。確認後升 `filter-operators.spec.md` + 寫成 `filter-operators.ts` registry。
> **M8 benchmark**:對照 ClickUp(CU)/ Airtable(AT)/ Notion(NT)三家。**v2 經 web research 重新驗證 op set,修正 v1 憑記憶誤差**。
> **設計路線**:**ClickUp 為 baseline**,合理 + 不衝突 + 真實用的擴充採納(string +2 ops, url 獨立 +4, date +2)。
> **檔位**:暫放 DataTable/,若決定抽 `patterns/advanced-filter/` 再搬。

## 1. ValueShape canonical(11 種)

每個 operator 的「值該用什麼 picker」由 ValueShape 決定 — panel 只認 ValueShape,不認 op。新增 op 只需 map 到既有 shape。

| ValueShape | UI 渲染 | 何時用 |
|---|---|---|
| `none` | (不渲) | `is_set / is_not_set / is_true / is_false` 純 predicate |
| `text` | `<Input>` | 單行文字 |
| `number` | `<NumberInput>` | 單一數字 |
| `number_range` | `<InputSurface>` 內 2× NumberInput + `→` | 數值介於 |
| `date_single` | `<DatePicker>` 單選 | 特定日期 |
| `date_range` | `<InputSurface>` 內 DatePicker range | 日期介於 |
| `date_relative` | `<Select>` 預設選項 | 相對日期 |
| `select_single` | `<Select>` from `column.meta.options` | 單選(罕用,目前無 op 採用) |
| `select_multi` | `<SelectMenu>` from `column.meta.options` | 多選(`select.is` 也走這個 — OR 語意) |
| `person_single` | `<PeoplePicker>` 單選 | 罕用,目前無 op 採用 |
| `person_multi` | `<PeoplePicker multiple>` | `person.is` 也走這 — OR 語意 |

**date_relative 預設選項**(11 個):
`today / yesterday / tomorrow / this_week / last_week / next_week / this_month / last_month / next_month / past_7_days / past_30_days`

## 2. Operator Registry — 各 columnType 完整 op set

### `string`(6 ops)
| op key | 中 | en | valueShape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `contains` | 包含 | contains | `text` | ✓ | ✓ | ✓ |
| `does_not_contain` | 不包含 | does not contain | `text` | ✓ | ✓ | ✓ |
| `is` | 等於 | is | `text` | — | ✓ | ✓ |
| `is_not` | 不等於 | is not | `text` | — | ✓ | ✓ |
| `is_set` | 已設定 | is set | `none` | ✓ | ✓ | ✓ |
| `is_not_set` | 未設定 | is not set | `none` | ✓ | ✓ | ✓ |

**default op**:`contains`。
**擴充說明**:`is` / `is_not` 為 v2 擴充(CU 沒有,AT + NT 有)。實務需求:`title is "Project Alpha"` 跟 `contains "Project"` 語意不同 — 精確等於不被部分匹配誤觸發。**不衝突**:CU 沒這 op 不代表反對,只是 minimal 派。

### `url`(8 ops — 獨立於 string)
| op key | 中 | en | valueShape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `contains` | 包含 | contains | `text` | ✓ | ✓ | ✓ |
| `does_not_contain` | 不包含 | does not contain | `text` | ✓ | ✓ | ✓ |
| `is` | 等於 | is | `text` | — | ✓ | ✓ |
| `is_not` | 不等於 | is not | `text` | — | ✓ | ✓ |
| `starts_with` | 開頭為 | starts with | `text` | — | — | ✓ |
| `ends_with` | 結尾為 | ends with | `text` | — | — | ✓ |
| `is_set` | 已設定 | is set | `none` | ✓ | ✓ | ✓ |
| `is_not_set` | 未設定 | is not set | `none` | ✓ | ✓ | ✓ |

**default op**:`contains`。
**為何獨立 string**:URL filtering 場景 prefix / suffix 匹配是強剛需(`starts_with "https://"` / `ends_with ".pdf"`)。string 場景則否。語意分流避免 over-extension。

### `number` / `currency`(9 ops)
| op key | 中 | en | valueShape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `equals` | 等於 | = | `number` | ✓ | ✓ | ✓ |
| `not_equals` | 不等於 | ≠ | `number` | ✓ | ✓ | ✓ |
| `gt` | 大於 | > | `number` | ✓ | ✓ | ✓ |
| `gte` | 大於等於 | ≥ | `number` | ✓ | ✓ | ✓ |
| `lt` | 小於 | < | `number` | ✓ | ✓ | ✓ |
| `lte` | 小於等於 | ≤ | `number` | ✓ | ✓ | ✓ |
| `between` | 介於 | between | `number_range` | ✓ | — | — |
| `is_set` | 已設定 | is set | `none` | ✓ | ✓ | ✓ |
| `is_not_set` | 未設定 | is not set | `none` | ✓ | ✓ | ✓ |

**default op**:`equals`。`currency` 共用同 set,渲染依 `column.meta.precision/prefix` 格式化。
**`between`**:對應 CU 的 RANGE,配合 InputSurface split input 自然好用。

### `date`(9 ops)
| op key | 中 | en | valueShape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `is` | 是 | is | `date_single` | — | ✓ | ✓ |
| `is_before` | 早於 | before | `date_single` | ✓ | ✓ | ✓ |
| `is_after` | 晚於 | after | `date_single` | ✓ | ✓ | ✓ |
| `is_on_or_before` | 不晚於 | on or before | `date_single` | — | ✓ | ✓ |
| `is_on_or_after` | 不早於 | on or after | `date_single` | — | ✓ | ✓ |
| `is_between` | 介於 | between | `date_range` | ✓ | ✓ | — |
| `is_relative` | 相對 | relative | `date_relative` | ✓ | ✓ | ✓ |
| `is_set` | 已設定 | is set | `none` | ✓ | ✓ | ✓ |
| `is_not_set` | 未設定 | is not set | `none` | ✓ | ✓ | ✓ |

**default op**:`is`。
**擴充說明**:`is_on_or_before` / `is_on_or_after` 為 v2 擴充(CU 沒,AT + NT 有)— 實務「截止 ≤ 今天(含當天)」不能用嚴格 `before` 表達,語意上是 CU 的 gap。

### `select`(4 ops — CU UX 派,不另設 is_any_of)
| op key | 中 | en | valueShape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `is` | 是 | is | `select_multi` | ✓ | ✓ | ✓ |
| `is_not` | 不是 | is not | `select_multi` | ✓ | ✓ | ✓ |
| `is_set` | 已設定 | is set | `none` | ✓ | ✓ | ✓ |
| `is_not_set` | 未設定 | is not set | `none` | ✓ | ✓ | ✓ |

**default op**:`is`。
**關鍵**:`is` / `is_not` 配 `select_multi`(picker 多選,1 個值也合法)。
- `is [Open]` = Open
- `is [Open, Review]` = Open OR Review

對齊 CU UX:`is` 直接接受多值,**不另設 `is_any_of` / `is_none_of`**(Airtable 派,過度切)。

### `multiSelect`(5 ops — CU 派)
| op key | 中 | en | valueShape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `has_any_of` | 含其中之一 | Any | `select_multi` | ✓ | ✓ | ✓(叫 contains)|
| `has_all_of` | 全部包含 | All | `select_multi` | ✓ | ✓ | — |
| `has_none_of` | 不含其中任一 | None of | `select_multi` | ✓ | ✓ | ✓(叫 does_not_contain)|
| `is_set` | 已設定 | is set | `none` | ✓ | ✓ | ✓ |
| `is_not_set` | 未設定 | is not set | `none` | ✓ | ✓ | ✓ |

**default op**:`has_any_of`。**`is_exactly` 已砍**(user 確認 v1 不需,實務 edge case)。

### `select` vs `multiSelect` op set 為何不同(根源 cell 資料形狀)

| | `select`(cell = 單一字串) | `multiSelect`(cell = 字串陣列) |
|---|---|---|
| 1-to-1 比對 | ✓ `is` / `is_not`(picker 多選 OR-語意) | ✗ 不適用(陣列比單值 ambiguous) |
| 集合運算 | ✗ 不適用 | ✓ `has_any_of` / `has_all_of` / `has_none_of` |

差異**根源於 cell 資料形狀**,不是 picker 不同。Value picker 兩者都共用 `SelectMenu` DS 既有元件。

### `person`(4 ops — 跟 select 同邏輯)
| op key | 中 | en | valueShape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `is` | 是 | is | `person_multi` | ✓ | ✓ | ✓ |
| `is_not` | 不是 | is not | `person_multi` | ✓ | ✓ | ✓ |
| `is_set` | 已指派 | is set | `none` | ✓ | ✓ | ✓ |
| `is_not_set` | 未指派 | is not set | `none` | ✓ | ✓ | ✓ |

**default op**:`is`。對齊 CU assignee 邏輯(單欄但 picker 多選)。

### `multiPerson`(5 ops — 跟 multiSelect 同邏輯)
| op key | 中 | en | valueShape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `has_any_of` | 含其中之一 | Any | `person_multi` | ✓ | ✓ | ✓ |
| `has_all_of` | 全部包含 | All | `person_multi` | ✓ | ✓ | — |
| `has_none_of` | 不含其中任一 | None of | `person_multi` | ✓ | ✓ | ✓ |
| `is_set` | 已指派 | is set | `none` | ✓ | ✓ | ✓ |
| `is_not_set` | 未指派 | is not set | `none` | ✓ | ✓ | ✓ |

**default op**:`has_any_of`。

### `boolean`(2 ops)
| op key | 中 | en | valueShape | CU | AT | NT |
|---|---|---|---|---|---|---|
| `is_true` | 是 | is checked | `none` | ✓ | ✓ | ✓ |
| `is_false` | 否 | is not checked | `none` | ✓ | ✓ | ✓ |

**default op**:`is_true`。**沒有 `is_set`**(boolean 在 DB 通常 default false,語意上不存在 unset 狀態)。

## 3. 數量總覽

| Type | ops 數 | CU 派 / 擴充 |
|---|---|---|
| `string` | 6 | CU 4 + 擴 `is` / `is_not` |
| `url` | 8 | CU 4 + 擴 `is` / `is_not` / `starts_with` / `ends_with`(獨立 type) |
| `number` / `currency` | 9 | 純 CU |
| `date` | 9 | CU 7 + 擴 `is_on_or_before` / `is_on_or_after` |
| `select` | 4 | 純 CU |
| `multiSelect` | 5 | 純 CU |
| `person` | 4 | 純 CU |
| `multiPerson` | 5 | 純 CU |
| `boolean` | 2 | 純 CU |
| **總計** | **52 ops, 9 types** | 6 ops 擴充 / 46 ops CU 對齊 |

## 4. 設計語言一致性自查(對齊 CU,M8 自我比對 web-researched docs)

| 一致性面向 | 對齊狀態 |
|---|---|
| 統一用 `is_set` / `is_not_set`(不混 `is_empty`) | 9 types 全用(boolean 豁免) |
| select / person 用 `is` 配多值 picker(不另設 `is_any_of`) | ✓ 對齊 CU UX |
| multiSelect / multiPerson 用 `has_*` 動詞(對應 CU labels Any/All/None) | ✓ |
| number 用 `between` 對應 CU RANGE | ✓ |
| date 用 `before/after/between/relative` + `is_set` 不混 Airtable `is_empty` 風 | ✓ |
| 6 ops 擴充項皆有 ≥ 2 家 world-class DS 採用,且不衝突 CU 設計語言 | ✓ |

**未跑 audit / test 驗證**,僅與 web-researched ClickUp / Airtable / Notion docs 自我比對。

## 5. TypeScript 結構草案

```ts
export type ValueShape =
  | 'none' | 'text' | 'number' | 'number_range'
  | 'date_single' | 'date_range' | 'date_relative'
  | 'select_single' | 'select_multi'
  | 'person_single' | 'person_multi'

export interface OperatorSpec {
  op: string                 // e.g. 'contains'
  label: string              // e.g. '包含'(暫硬編,留 i18n hook)
  valueShape: ValueShape
}

export const OPERATOR_REGISTRY: Record<ColumnType, OperatorSpec[]> = { ... }
export const DEFAULT_OPERATOR: Record<ColumnType, string> = { ... }
```

## 6. 拍板紀錄(2026-05-02 user 確認)

| # | 議題 | 決議 |
|---|---|---|
| 1 | 設計路線 | **走 ClickUp 派**,合理擴充採納 |
| 2 | `string` 擴 `is` / `is_not` | ✅ 採用(CU minimal 不夠) |
| 3 | `url` 獨立 type 擴 `starts_with` / `ends_with` | ✅ 採用(URL prefix 強剛需) |
| 4 | `date` 擴 `is_on_or_before` / `is_on_or_after` | ✅ 採用(CU gap) |
| 5 | `multiSelect` 走 5 ops(含 `has_all_of`)| ✅ |
| 6 | `is_exactly` 全砍 | ✅ |
| 7 | label 暫硬編繁中 + 留 i18n hook | ✅ |
| 8 | op 命名 snake_case | ✅ |
| 9 | 統一 `is_set` / `is_not_set`(不混 `is_empty`) | ✅ |

## 7. 同 field 可重複加 condition(設計約束)

對齊 ClickUp idiom — 同一 field 可加多筆 condition,例:

```
(Status is Open OR Status is Review) AND Priority is High
```

我們的 FilterTree model 天然支援。

**技術坑(信心 85%,Phase B spec.md 詳)**:TanStack `ColumnFiltersState` per-column 一筆 filter value,N 條同 column 會 AND-chain 不能 OR。**業界標準解法**:棄用 `columnFilters`,改自管 FilterTree state + 用 `globalFilter` + 自訂 `globalFilterFn` 走樹求 boolean。

## 8. Phase A 結案 — Phase B 銜接

Phase B 啟動項:
- [ ] ValueShape × DS 元件視覺驗證(`SelectMenu` / `PeoplePicker` / `DatePicker` / `NumberInput` / `Input` 是否能直接套)
- [ ] InputSurface(split input)pattern vs component 決定
- [ ] advanced-filter spec.md draft(data model / props / 與 DataTable 耦合 / FilterTree 求值策略)
- [ ] i18n 策略確認(對照 DS 既有元件)

## Sources(M8 benchmark)

- [ClickUp filter help](https://help.clickup.com/hc/en-us/articles/6308875427223-Use-filters-to-search-tasks)
- [ClickUp custom field filter](https://help.clickup.com/hc/en-us/articles/12665650881943-Search-sort-and-filter-tasks-by-Custom-Fields)
- [ClickUp filter API](https://developer.clickup.com/docs/filter-views)
- [ClickUp range operator](https://developer.clickup.com/docs/range)
- [Airtable filter records](https://support.airtable.com/docs/filtering-records-using-conditions)
- [Airtable single select](https://support.airtable.com/docs/single-select-field)
- [Airtable multiple select](https://support.airtable.com/docs/multiple-select-field)
- [Notion API filter](https://developers.notion.com/reference/post-database-query-filter)
- [go-notion SDK source](https://github.com/sorcererxw/go-notion/blob/master/api.go)
