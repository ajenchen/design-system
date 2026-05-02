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
| `is_exactly` | 完全等於 | is exactly | `select_multi` | — | ✓ | — |
| `is_empty` | 為空 | is empty | `none` | ✓ | ✓ | ✓ |
| `is_not_empty` | 不為空 | is not empty | `none` | ✓ | ✓ | ✓ |

**default op**:`has_any_of`。

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

## 4. 待 user 拍板

| # | 議題 | 我的傾向 | 為什麼 |
|---|---|---|---|
| 1 | `string` 是否包 `starts_with` / `ends_with` | **包** | CU + NT 都有,AT 沒有但用戶實務常用(URL prefix / file extension 場景) |
| 2 | `number` 是否包 `between` | **包** | CU 有,且配合 InputSurface split input 同時驗證 |
| 3 | `select` 是否包 `is_any_of` / `is_none_of`(單選欄位多選比對) | **包** | CU + AT 都有。實務:「Status is one of [Open, In Progress, Review]」 |
| 4 | `multiSelect` 的 `is_exactly`(完全等於) | **不包(v1 砍)** | 只有 AT 有,語意 edge case,先砍簡化 |
| 5 | `date_relative` 預設選項 | **11 個常用集** | 對齊 ClickUp 子集。完整版約 30 項,v1 太雜 |
| 6 | label 是否硬編中文 | **暫硬編,留 i18n hook** | DS 既有元件多硬編繁中,本 draft 跟風;之後若 i18n 統一改 |
| 7 | op 命名 snake_case vs camelCase | **snake_case** | 對齊 SQL / ClickUp / Airtable API 命名 idiom,跟 column types(camelCase)區分 |

## 5. 出現次數統計(M8 信心指標)

3 家共出現 op(計入別名統一)後:
- **3/3 家共識**:46 個 op-cell(高信心)
- **2/3 家共識**:8 個 op-cell(`starts_with` / `ends_with` / `is_any_of` / `is_none_of` / `has_any_of` / `has_all_of` / `is_on_or_before` / `is_on_or_after`)— 中信心,但實務常用,保留
- **1/3 家獨有**:2 個 op-cell(`number.between` 只 CU、`is_exactly` 只 AT)— 低信心,前者保留(配 InputSurface 自然)、後者砍

---

## 6. Review checklist(請 user 確認)

- [ ] ValueShape 11 種 OK(沒漏)
- [ ] 每個 columnType 的 op set OK(沒多餘 / 沒漏關鍵)
- [ ] 中文 label 措辭 OK(尤其 `is_set` 譯「已設定」、`is_empty` 譯「為空」的差異)
- [ ] default op 選擇 OK
- [ ] 待拍板 7 題決議
- [ ] op 命名 snake_case 風格 OK

確認後升正式 spec 並開始 Phase 1 code。
