/**
 * filter-operators.ts — Advanced Filter Operator Registry SSOT
 *
 * Single source of truth for all filter operator definitions.
 * 51 ops × 9 columnTypes × 12 ValueShapes.
 *
 * **禁止**:component 內 hardcode op 字串。一律走 `OPERATOR_REGISTRY[columnType]`。
 *
 * 設計路線:ClickUp baseline + 合理擴充(string +2, url 獨立 +4, date +2)。
 * 詳細 spec:`./filter-operators.spec.md`
 */

import type { ColumnType } from './column-types'

// ── ValueShape ───────────────────────────────────────────────────────────

/**
 * Filter value 該用什麼 picker — panel 只認 ValueShape,不認 op。
 * 新增 op 只需 map 到既有 shape。
 */
export type ValueShape =
  | 'none'              // is_set / is_not_set / is_true / is_false 純 predicate
  | 'text'              // <Input>
  | 'number'            // <NumberInput>
  | 'date_single'       // <DatePicker> single date
  | 'date_range'        // <DatePickerRange> Ant-style split-input
  | 'date_relative'     // <Select> 預設選項(today/yesterday/this_week/...)
  | 'datetime_single'   // <DatePicker showTime>(includeTime=true)
  | 'datetime_range'    // <DatePickerRange showTime>(includeTime=true)
  | 'select_single'     // <Select>(預留,目前無 op 採用)
  | 'select_multi'      // <SelectMenu multiple>(select.is 也走這)
  | 'person_single'     // <PeoplePicker>(預留)
  | 'person_multi'      // <PeoplePicker multiple>(person.is 也走這)

// ── OperatorSpec ────────────────────────────────────────────────────────

export interface OperatorSpec {
  /** Internal key, snake_case, immutable for FilterTree serialization */
  op: string
  /** UI label in zh-TW(暫硬編,留 i18n hook) */
  label: string
  /** Reference label for English / future i18n key */
  labelEn: string
  /**
   * Value picker shape.
   * date_* shapes auto-promote to datetime_* when includeTime=true(via `getValueShape`).
   */
  valueShape: ValueShape
}

// ── Date Relative Options(13 個,含分組)───────────────────────────────
// 群組順序 + 排列對齊 Linear / Notion / ClickUp 共識:Past → Current → Future
// 群內排列:由遠到近(Past:30 → 7 → 月 → 週 → 昨;Future:明 → 週 → 月 → 7 → 30)
//          中間語義 anchor today/this 排於 Current

export const DATE_RELATIVE_GROUPS = [
  { key: 'past',    label: '過去' },
  { key: 'current', label: '目前' },
  { key: 'future',  label: '未來' },
] as const

export const DATE_RELATIVE_OPTIONS = [
  // Past
  { value: 'past_30_days',  label: '過去 30 天', group: 'past' },
  { value: 'past_7_days',   label: '過去 7 天',  group: 'past' },
  { value: 'last_month',    label: '上月',       group: 'past' },
  { value: 'last_week',     label: '上週',       group: 'past' },
  { value: 'yesterday',     label: '昨天',       group: 'past' },
  // Current
  { value: 'today',         label: '今天',       group: 'current' },
  { value: 'this_week',     label: '本週',       group: 'current' },
  { value: 'this_month',    label: '本月',       group: 'current' },
  // Future
  { value: 'tomorrow',      label: '明天',       group: 'future' },
  { value: 'next_week',     label: '下週',       group: 'future' },
  { value: 'next_month',    label: '下月',       group: 'future' },
  { value: 'next_7_days',   label: '未來 7 天',  group: 'future' },
  { value: 'next_30_days',  label: '未來 30 天', group: 'future' },
] as const

// ── Per-columnType op definitions ───────────────────────────────────────

const STRING_OPS: OperatorSpec[] = [
  { op: 'contains',         label: '包含',       labelEn: 'contains',          valueShape: 'text' },
  { op: 'does_not_contain', label: '不包含',     labelEn: 'does not contain',  valueShape: 'text' },
  { op: 'is',               label: '等於',       labelEn: 'is',                valueShape: 'text' },
  { op: 'is_not',           label: '不等於',     labelEn: 'is not',            valueShape: 'text' },
  { op: 'is_set',           label: '已設定',     labelEn: 'is set',            valueShape: 'none' },
  { op: 'is_not_set',       label: '未設定',     labelEn: 'is not set',        valueShape: 'none' },
]

const URL_OPS: OperatorSpec[] = [
  { op: 'contains',         label: '包含',       labelEn: 'contains',          valueShape: 'text' },
  { op: 'does_not_contain', label: '不包含',     labelEn: 'does not contain',  valueShape: 'text' },
  { op: 'is',               label: '等於',       labelEn: 'is',                valueShape: 'text' },
  { op: 'is_not',           label: '不等於',     labelEn: 'is not',            valueShape: 'text' },
  { op: 'starts_with',      label: '開頭為',     labelEn: 'starts with',       valueShape: 'text' },
  { op: 'ends_with',        label: '結尾為',     labelEn: 'ends with',         valueShape: 'text' },
  { op: 'is_set',           label: '已設定',     labelEn: 'is set',            valueShape: 'none' },
  { op: 'is_not_set',       label: '未設定',     labelEn: 'is not set',        valueShape: 'none' },
]

const NUMBER_OPS: OperatorSpec[] = [
  { op: 'equals',           label: '等於',       labelEn: '=',                 valueShape: 'number' },
  { op: 'not_equals',       label: '不等於',     labelEn: '≠',                 valueShape: 'number' },
  { op: 'gt',               label: '大於',       labelEn: '>',                 valueShape: 'number' },
  { op: 'gte',              label: '大於等於',   labelEn: '≥',                 valueShape: 'number' },
  { op: 'lt',               label: '小於',       labelEn: '<',                 valueShape: 'number' },
  { op: 'lte',              label: '小於等於',   labelEn: '≤',                 valueShape: 'number' },
  { op: 'is_set',           label: '已設定',     labelEn: 'is set',            valueShape: 'none' },
  { op: 'is_not_set',       label: '未設定',     labelEn: 'is not set',        valueShape: 'none' },
]

const DATE_OPS: OperatorSpec[] = [
  { op: 'is',               label: '是',         labelEn: 'is',                valueShape: 'date_single' },
  { op: 'is_before',        label: '早於',       labelEn: 'before',            valueShape: 'date_single' },
  { op: 'is_after',         label: '晚於',       labelEn: 'after',             valueShape: 'date_single' },
  { op: 'is_on_or_before',  label: '不晚於',     labelEn: 'on or before',      valueShape: 'date_single' },
  { op: 'is_on_or_after',   label: '不早於',     labelEn: 'on or after',       valueShape: 'date_single' },
  { op: 'is_between',       label: '介於',       labelEn: 'between',           valueShape: 'date_range' },
  { op: 'is_relative',      label: '相對',       labelEn: 'relative',          valueShape: 'date_relative' },
  { op: 'is_set',           label: '已設定',     labelEn: 'is set',            valueShape: 'none' },
  { op: 'is_not_set',       label: '未設定',     labelEn: 'is not set',        valueShape: 'none' },
]

const SELECT_OPS: OperatorSpec[] = [
  { op: 'is',               label: '是',         labelEn: 'is',                valueShape: 'select_multi' },
  { op: 'is_not',           label: '不是',       labelEn: 'is not',            valueShape: 'select_multi' },
  { op: 'is_set',           label: '已設定',     labelEn: 'is set',            valueShape: 'none' },
  { op: 'is_not_set',       label: '未設定',     labelEn: 'is not set',        valueShape: 'none' },
]

const MULTI_SELECT_OPS: OperatorSpec[] = [
  { op: 'has_any_of',       label: '含其中之一', labelEn: 'Any',               valueShape: 'select_multi' },
  { op: 'has_all_of',       label: '全部包含',   labelEn: 'All',               valueShape: 'select_multi' },
  { op: 'has_none_of',      label: '不含其中任一', labelEn: 'None of',         valueShape: 'select_multi' },
  { op: 'is_set',           label: '已設定',     labelEn: 'is set',            valueShape: 'none' },
  { op: 'is_not_set',       label: '未設定',     labelEn: 'is not set',        valueShape: 'none' },
]

const PERSON_OPS: OperatorSpec[] = [
  { op: 'is',               label: '是',         labelEn: 'is',                valueShape: 'person_multi' },
  { op: 'is_not',           label: '不是',       labelEn: 'is not',            valueShape: 'person_multi' },
  { op: 'is_set',           label: '已指派',     labelEn: 'is set',            valueShape: 'none' },
  { op: 'is_not_set',       label: '未指派',     labelEn: 'is not set',        valueShape: 'none' },
]

const MULTI_PERSON_OPS: OperatorSpec[] = [
  { op: 'has_any_of',       label: '含其中之一', labelEn: 'Any',               valueShape: 'person_multi' },
  { op: 'has_all_of',       label: '全部包含',   labelEn: 'All',               valueShape: 'person_multi' },
  { op: 'has_none_of',      label: '不含其中任一', labelEn: 'None of',         valueShape: 'person_multi' },
  { op: 'is_set',           label: '已指派',     labelEn: 'is set',            valueShape: 'none' },
  { op: 'is_not_set',       label: '未指派',     labelEn: 'is not set',        valueShape: 'none' },
]

const BOOLEAN_OPS: OperatorSpec[] = [
  { op: 'is_true',          label: '是',         labelEn: 'is checked',        valueShape: 'none' },
  { op: 'is_false',         label: '否',         labelEn: 'is not checked',    valueShape: 'none' },
]

/**
 * SSOT canonical — 全部 51 ops, 9 columnTypes 對照表.
 *
 * **禁止繞過**:component 內勿 hardcode op 字串(M17 Rule-of-3 + Phase 5 Q3=c TypeScript-enforce 派)。
 * `currency` 共用 `number` op set,渲染依 `column.meta.precision/prefix` 格式化。
 */
export const OPERATOR_REGISTRY: Record<ColumnType, OperatorSpec[]> = {
  string:      STRING_OPS,
  url:         URL_OPS,
  number:      NUMBER_OPS,
  currency:    NUMBER_OPS,
  date:        DATE_OPS,
  // Phase C(2026-05-05):time column 暫先 reuse DATE_OPS shape — advanced filter `time_*`
  // ValueShape 整合留 Phase D+。consumer 走基本 cell render(無 advanced filter)不影響。
  time:        DATE_OPS,
  select:      SELECT_OPS,
  multiSelect: MULTI_SELECT_OPS,
  person:      PERSON_OPS,
  multiPerson: MULTI_PERSON_OPS,
  boolean:     BOOLEAN_OPS,
}

/** Default operator per columnType — 開新 condition 時的 op preset */
export const DEFAULT_OPERATOR: Record<ColumnType, string> = {
  string:      'contains',
  url:         'contains',
  number:      'equals',
  currency:    'equals',
  date:        'is',
  time:        'is',
  select:      'is',
  multiSelect: 'has_any_of',
  person:      'is',
  multiPerson: 'has_any_of',
  boolean:     'is_true',
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Resolve ValueShape for a given op + columnType + includeTime flag.
 *
 * `date_single` / `date_range` shapes auto-promote to `datetime_single` /
 * `datetime_range` when columnType=`date` && includeTime=true. All other
 * shapes pass-through unchanged.
 *
 * `date_relative` stays as-is(relative 本質 day-level,e.g. `today` =
 * 從今天 00:00 到 23:59:59,跟 includeTime 無關)。
 */
export function getValueShape(
  op: OperatorSpec,
  columnType: ColumnType,
  includeTime?: boolean,
): ValueShape {
  if (columnType === 'date' && includeTime) {
    if (op.valueShape === 'date_single') return 'datetime_single'
    if (op.valueShape === 'date_range') return 'datetime_range'
  }
  return op.valueShape
}

/** Get OperatorSpec by columnType + op key. Returns null if not found. */
export function getOperatorSpec(columnType: ColumnType, op: string): OperatorSpec | null {
  return OPERATOR_REGISTRY[columnType]?.find((o) => o.op === op) ?? null
}
