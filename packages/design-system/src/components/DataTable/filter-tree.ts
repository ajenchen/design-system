/**
 * filter-tree.ts — FilterTree types + helpers + evaluator
 *
 * 抽自 data-table-filter-panel.tsx 為了 file-size budget(panel 拆分)。
 * 純資料結構 + pure functions,無 UI dep。
 *
 * 詳:./filter-operators.spec.md
 */

import {
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  addDays, addWeeks, addMonths, subDays,
} from 'date-fns'
import { OPERATOR_REGISTRY, type OperatorSpec } from './filter-operators'

/**
 * 把 relative key 轉成 [start, end] 時間區間(local time,inclusive)。
 * 對齊 Notion / ClickUp idiom — 以「今天」為錨點計算。
 */
function relativeKeyToRange(key: string, now: Date = new Date()): [number, number] | null {
  const today = startOfDay(now)
  switch (key) {
    case 'today':        return [today.getTime(), endOfDay(now).getTime()]
    case 'yesterday':    return [startOfDay(subDays(now, 1)).getTime(), endOfDay(subDays(now, 1)).getTime()]
    case 'tomorrow':     return [startOfDay(addDays(now, 1)).getTime(), endOfDay(addDays(now, 1)).getTime()]
    case 'this_week':    return [startOfWeek(now, { weekStartsOn: 1 }).getTime(), endOfWeek(now, { weekStartsOn: 1 }).getTime()]
    case 'last_week':    return [startOfWeek(addWeeks(now, -1), { weekStartsOn: 1 }).getTime(), endOfWeek(addWeeks(now, -1), { weekStartsOn: 1 }).getTime()]
    case 'next_week':    return [startOfWeek(addWeeks(now, 1), { weekStartsOn: 1 }).getTime(), endOfWeek(addWeeks(now, 1), { weekStartsOn: 1 }).getTime()]
    case 'this_month':   return [startOfMonth(now).getTime(), endOfMonth(now).getTime()]
    case 'last_month':   return [startOfMonth(addMonths(now, -1)).getTime(), endOfMonth(addMonths(now, -1)).getTime()]
    case 'next_month':   return [startOfMonth(addMonths(now, 1)).getTime(), endOfMonth(addMonths(now, 1)).getTime()]
    case 'past_7_days':  return [startOfDay(subDays(now, 7)).getTime(), endOfDay(now).getTime()]
    case 'past_30_days': return [startOfDay(subDays(now, 30)).getTime(), endOfDay(now).getTime()]
    case 'next_7_days':  return [startOfDay(now).getTime(), endOfDay(addDays(now, 7)).getTime()]
    case 'next_30_days': return [startOfDay(now).getTime(), endOfDay(addDays(now, 30)).getTime()]
    default: return null
  }
}

// ── Types ────────────────────────────────────────────────────────────────

export type Conjunction = 'and' | 'or'

export interface FilterCondition {
  kind: 'cond'
  /** 唯一 row id(stable across renders) */
  id: string
  /** 對應 column id;空字串 = 尚未選 field(operator/value picker disabled) */
  field: string
  /** OperatorSpec.op key — 對齊 OPERATOR_REGISTRY */
  op: string
  /** 依 ValueShape 解讀的值 */
  value: unknown
}

export interface FilterGroup {
  kind: 'group'
  id: string
  /** group 內 children 共用的 join(全 AND 或全 OR;不允許混) */
  conjunction: Conjunction
  /** ⚠️ 型別鎖死:children 只能 condition,不可再 nested group(1-level cap) */
  children: FilterCondition[]
}

export type FilterTreeFlat = {
  mode: 'flat'
  conjunction: Conjunction
  children: FilterCondition[]
}

export type FilterTreeNested = {
  mode: 'nested'
  conjunction: Conjunction
  children: FilterGroup[]
}

export type FilterTree = FilterTreeFlat | FilterTreeNested

// ── Helpers — public API ────────────────────────────────────────────────

/** Empty FilterTree — consumer 用來 init useState */
export function createEmptyFilterTree(mode: 'flat'): FilterTreeFlat
export function createEmptyFilterTree(mode: 'nested'): FilterTreeNested
export function createEmptyFilterTree(mode: 'flat' | 'nested'): FilterTree {
  if (mode === 'flat') return { mode: 'flat', conjunction: 'and', children: [] }
  return { mode: 'nested', conjunction: 'and', children: [] }
}

/** 是否有任何 active filter — DataTable trigger button checked state 用 */
export function isFilterTreeActive(tree: FilterTree): boolean {
  if (tree.mode === 'flat') {
    return tree.children.some((c) => isConditionComplete(c))
  }
  return tree.children.some((g) => g.children.some((c) => isConditionComplete(c)))
}

/** Condition 是否「已填齊」可參與 filter 求值 */
function isConditionComplete(c: FilterCondition): boolean {
  if (!c.field || !c.op) return false
  const spec = getOperatorSpecLoose(c.op)
  if (!spec) return false
  if (spec.valueShape === 'none') return true
  return c.value !== '' && c.value !== null && c.value !== undefined
}

/** loose lookup — 我們不知 columnType,試所有 type */
function getOperatorSpecLoose(op: string): OperatorSpec | null {
  for (const list of Object.values(OPERATOR_REGISTRY)) {
    const found = list.find((o) => o.op === op)
    if (found) return found
  }
  return null
}

// ── Deep-equal compare(refresh icon 顯示判定用) ─────────────────────────

/** Compare two FilterTrees structurally — 忽略內部 row id(refresh-detect 不該被內部 id 干擾)*/
export function isFilterTreeEqual(a: FilterTree, b: FilterTree): boolean {
  if (a.mode !== b.mode || a.conjunction !== b.conjunction) return false
  if (a.children.length !== b.children.length) return false
  if (a.mode === 'flat' && b.mode === 'flat') {
    return a.children.every((c, i) => isConditionEqual(c, b.children[i]))
  }
  if (a.mode === 'nested' && b.mode === 'nested') {
    return a.children.every((g, i) => isGroupEqual(g, b.children[i]))
  }
  return false
}

function isGroupEqual(a: FilterGroup, b: FilterGroup): boolean {
  if (a.conjunction !== b.conjunction) return false
  if (a.children.length !== b.children.length) return false
  return a.children.every((c, i) => isConditionEqual(c, b.children[i]))
}

function isConditionEqual(a: FilterCondition, b: FilterCondition): boolean {
  if (a.field !== b.field || a.op !== b.op) return false
  return JSON.stringify(a.value) === JSON.stringify(b.value)
}

// ── Tree Evaluation(globalFilter approach)──────────────────────────────

/**
 * 整棵 FilterTree 對 row 求 boolean。
 * 配合 useReactTable `globalFilterFn`:
 *
 *   const tree = useState<FilterTree>(createEmptyFilterTree('flat'))
 *   useReactTable({
 *     state: { globalFilter: tree },
 *     onGlobalFilterChange: setTree,
 *     globalFilterFn: (row, _, t: FilterTree) => evaluateTree(t, row.original),
 *     getFilteredRowModel: getFilteredRowModel(),
 *   })
 */
// any-allow: row-generic — TanStack row.original 是 generic,filter eval 跨 type 必走 any
export function evaluateTree(tree: FilterTree, row: any): boolean {
  if (tree.children.length === 0) return true

  if (tree.mode === 'flat') {
    const completed = tree.children.filter(isConditionComplete)
    if (completed.length === 0) return true
    const results = completed.map((c) => evaluateCondition(c, row))
    return tree.conjunction === 'and' ? results.every(Boolean) : results.some(Boolean)
  }

  // nested
  const groupResults = tree.children.map((g) => evaluateGroup(g, row))
  // group 沒任何 complete condition 的視為 pass-through(true)
  const meaningful = groupResults.filter((_, i) => tree.children[i].children.some(isConditionComplete))
  if (meaningful.length === 0) return true
  return tree.conjunction === 'and' ? meaningful.every(Boolean) : meaningful.some(Boolean)
}

// any-allow: row-generic
function evaluateGroup(group: FilterGroup, row: any): boolean {
  const completed = group.children.filter(isConditionComplete)
  if (completed.length === 0) return true
  const results = completed.map((c) => evaluateCondition(c, row))
  return group.conjunction === 'and' ? results.every(Boolean) : results.some(Boolean)
}

// any-allow: row-generic
function evaluateCondition(cond: FilterCondition, row: any): boolean {
  if (!cond.field || !cond.op) return true
  const cellValue = row?.[cond.field]
  return matchOperator(cond.op, cellValue, cond.value)
}

// PersonValue identity helper(2026-05-07):
// person/multiPerson cell value 是 `{ name, avatarUrl?, description? }` 物件 — 比對時用 `name`
// 當 stable id(PeoplePicker SSOT 沒有 id field,name 是唯一身分標識)。對齊 Notion / Linear /
// Asana 的 person filter 比對 idiom(都用 name/email 當 id)。
function personId(v: unknown): string {
  if (v && typeof v === 'object' && 'name' in v) return String((v as { name: unknown }).name ?? '')
  return String(v ?? '')
}
function isPersonObject(v: unknown): v is { name: string } {
  return !!v && typeof v === 'object' && 'name' in v
}

// code-quality-allow: long-function — 13-operator switch dispatch table,table-driven 重構會把 op-specific guards 拆出反增 indirection
function matchOperator(op: string, cellValue: unknown, filterValue: unknown): boolean {
  // 不需 value 的 op
  switch (op) {
    case 'is_set':     return cellValue !== null && cellValue !== undefined && cellValue !== ''
    case 'is_not_set': return cellValue === null || cellValue === undefined || cellValue === ''
    case 'is_true':    return cellValue === true
    case 'is_false':   return cellValue === false
  }

  // 需 value 但 value 空 → 視為 incomplete,pass-through
  if (filterValue === null || filterValue === undefined || filterValue === '') return true
  if (Array.isArray(filterValue) && filterValue.length === 0) return true

  // Person-aware specialization(person_single / person_multi)— 物件透過 name 比對。
  // 偵測:cellValue 或 filterValue 任一是 Person object(或包 Person 的陣列)→ 走 personId path。
  const cellIsPerson = isPersonObject(cellValue) || (Array.isArray(cellValue) && cellValue.some(isPersonObject))
  const filterIsPerson = isPersonObject(filterValue) || (Array.isArray(filterValue) && filterValue.some(isPersonObject))
  if (cellIsPerson || filterIsPerson) {
    const cellIds = Array.isArray(cellValue) ? cellValue.map(personId) : [personId(cellValue)]
    const filterIds = Array.isArray(filterValue) ? filterValue.map(personId) : [personId(filterValue)]
    switch (op) {
      case 'is':         return cellIds.length === 1 && filterIds.length >= 1 && filterIds.includes(cellIds[0])
      case 'is_not':     return !(cellIds.length === 1 && filterIds.length >= 1 && filterIds.includes(cellIds[0]))
      case 'has_any_of': return cellIds.some((c) => filterIds.includes(c))
      case 'has_all_of': return filterIds.every((f) => cellIds.includes(f))
      case 'has_none_of':return !cellIds.some((c) => filterIds.includes(c))
      default:           return true
    }
  }

  switch (op) {
    case 'contains':         return String(cellValue ?? '').toLowerCase().includes(String(filterValue).toLowerCase())
    case 'does_not_contain': return !String(cellValue ?? '').toLowerCase().includes(String(filterValue).toLowerCase())
    // 2026-05-12 Round 6 fix(user 抓 Roadmap 進階篩選「全部」結果空)— impl-vs-spec drift。
    // Per `filter-operators.spec.md` L116「is 直接接受多值,不另設 is_any_of」+ L103-116
    // select(is/is_not + select_multi ValueShape OR 語意)+ L31-32(select.is / person.is 都走
    // select_multi / person_multi ValueShape)。原 impl 只做 single-value 比對,filterValue 是
    // array(全選 options)→ String(array)= "v1,v2" → 永遠 != single cellValue → 結果空。
    // Fix:加 array handling,走 OR 語意:any → match;is_not → every-not-match。
    case 'is':
      if (Array.isArray(filterValue))
        return filterValue.some((v) => String(cellValue ?? '').toLowerCase() === String(v).toLowerCase())
      return String(cellValue ?? '').toLowerCase() === String(filterValue).toLowerCase()
    case 'is_not':
      if (Array.isArray(filterValue))
        return filterValue.every((v) => String(cellValue ?? '').toLowerCase() !== String(v).toLowerCase())
      return String(cellValue ?? '').toLowerCase() !== String(filterValue).toLowerCase()
    case 'starts_with':      return String(cellValue ?? '').toLowerCase().startsWith(String(filterValue).toLowerCase())
    case 'ends_with':        return String(cellValue ?? '').toLowerCase().endsWith(String(filterValue).toLowerCase())

    case 'equals':     return Number(cellValue) === Number(filterValue)
    case 'not_equals': return Number(cellValue) !== Number(filterValue)
    case 'gt':         return Number(cellValue) > Number(filterValue)
    case 'gte':        return Number(cellValue) >= Number(filterValue)
    case 'lt':         return Number(cellValue) < Number(filterValue)
    case 'lte':        return Number(cellValue) <= Number(filterValue)

    case 'is_before':       return new Date(String(cellValue)).getTime() < new Date(String(filterValue)).getTime()
    case 'is_after':        return new Date(String(cellValue)).getTime() > new Date(String(filterValue)).getTime()
    case 'is_on_or_before': return new Date(String(cellValue)).getTime() <= new Date(String(filterValue)).getTime()
    case 'is_on_or_after':  return new Date(String(cellValue)).getTime() >= new Date(String(filterValue)).getTime()
    case 'is_between': {
      if (!Array.isArray(filterValue) || filterValue.length !== 2) return true
      const cv = new Date(String(cellValue)).getTime()
      const start = filterValue[0] ? new Date(String(filterValue[0])).getTime() : -Infinity
      const end = filterValue[1] ? new Date(String(filterValue[1])).getTime() : Infinity
      return cv >= start && cv <= end
    }
    case 'is_relative': {
      // Phase D 完整實作 — relative key → time range → in-range test
      const range = relativeKeyToRange(String(filterValue))
      if (!range) return true  // unknown key,pass-through
      const cv = new Date(String(cellValue)).getTime()
      if (Number.isNaN(cv)) return false  // invalid cellValue → 不命中
      const [start, end] = range
      return cv >= start && cv <= end
    }

    case 'has_any_of': {
      if (!Array.isArray(filterValue)) return true
      if (Array.isArray(cellValue)) return cellValue.some((c) => filterValue.includes(c))
      return filterValue.includes(cellValue)
    }
    case 'has_all_of': {
      if (!Array.isArray(filterValue)) return true
      if (Array.isArray(cellValue)) return filterValue.every((v) => cellValue.includes(v))
      return false
    }
    case 'has_none_of': {
      if (!Array.isArray(filterValue)) return true
      if (Array.isArray(cellValue)) return !cellValue.some((c) => filterValue.includes(c))
      return !filterValue.includes(cellValue)
    }

    default: return true
  }
}

/**
 * @deprecated v0.x — old per-column filterFn integration。
 * 新版用 `evaluateTree` 配 TanStack `globalFilter`。
 * 保留為了過渡期 backward-compat,新 consumer 不要用。
 */
export function dataTableFilterMatch(cellValue: unknown, filterValue: unknown): boolean {
  if (typeof filterValue === 'object' && filterValue !== null && 'operator' in filterValue && 'value' in filterValue) {
    const fv = filterValue as { operator: string; value: unknown }
    return matchOperator(fv.operator, cellValue, fv.value)
  }
  return String(cellValue ?? '').toLowerCase().includes(String(filterValue ?? '').toLowerCase())
}
