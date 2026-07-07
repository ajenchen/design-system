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
  /** Date 欄位比對精度(2026-07-04 Q6 拍板,兌現 spec「includeTime」雙精度契約):
   *  panel 建 condition 時依 column meta 寫入 — includeTime=true → 'ms',否則 'day'
   *  (AG Grid midnight-truncate / MUI X setHours(0,0,0,0) 共識;避 Airtable 邊界漏抓地雷)。
   *  非 date 欄位 / 舊 tree 無此欄 → undefined(date ops fallback 'day' 預設)。 */
  datePrecision?: 'day' | 'ms'
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

/** loose lookup — 我們不知 columnType,試所有 type。
 *  D3 perf(2026-07-06):module-level Map cache — OPERATOR_REGISTRY 是 module 常數,
 *  同一 op key 查詢結果永不變;原每 call 線性掃全 registry,而 evaluateTree 熱路徑
 *  per-row 呼叫時(10k rows × N conditions)放大成數十萬次比較,cache 後 O(1)。 */
const opSpecLooseCache = new Map<string, OperatorSpec | null>()
function getOperatorSpecLoose(op: string): OperatorSpec | null {
  const cached = opSpecLooseCache.get(op)
  if (cached !== undefined) return cached
  let found: OperatorSpec | null = null
  for (const list of Object.values(OPERATOR_REGISTRY)) {
    const hit = list.find((o) => o.op === op)
    if (hit) { found = hit; break }
  }
  opSpecLooseCache.set(op, found)
  return found
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

// ── D3 perf(2026-07-06):per-condition compile-once cache ────────────────
// TanStack globalFilterFn 逐 row 呼叫 evaluateTree,原實作每 row 重做「跨全 rows 不變」
// 的常數工作:isConditionComplete(operator registry 掃描)、dateMs(filterValue) 重 parse、
// filterValue 重 toLowerCase、is_relative 重算時間區間 — 10k rows × N conditions 全額放大。
// Fix:以 condition 物件為 key 的 WeakMap 快取 filterValue 側預解析結果,row loop 只轉
// cellValue 側。Panel 更新走 immutable `{ ...c, ...patch }`(新物件 = 新 cache entry),
// 舊 entry 隨舊 condition 物件 GC — cache 無失效問題。
interface PreparedCondition {
  /** isConditionComplete 結果(registry 掃描一次,取代原 per-row filter 掃描) */
  complete: boolean
  /** filterValue 側是否 Person(物件或含 Person 的陣列) */
  filterIsPerson: boolean
  /** person 比對 ops 的 filter 側 id array(cellValue 是 Person 時也走 person path,故照 op 準備) */
  filterPersonIds: string[] | null
  /** 文字 ops 用:String(filterValue).toLowerCase() */
  filterTextLower: string | null
  /** is / is_not 陣列(多值 OR 語意)逐元素 lowercase */
  filterTextLowerArr: string[] | null
  /** 單值 date ops(is_before 家族;is / is_not with datePrecision)— datePrecision 已套 */
  filterDateMs: number | null
  /** is_between 兩端(空端 = ±Infinity,語意同原 inline 邏輯) */
  filterDateStart: number | null
  filterDateEnd: number | null
  /** is_relative:快取區間 + 計算當日 stamp(跨日自動重算 — 所有 relative 區間都是
   *  calendar day 的純函數,同日內恆定,見 localDayKey) */
  relRange: [number, number] | null
  relDayKey: number
}

const PERSON_CAPABLE_OPS = new Set(['is', 'is_not', 'has_any_of', 'has_all_of', 'has_none_of'])
const DATE_SINGLE_OPS = new Set(['is_before', 'is_after', 'is_on_or_before', 'is_on_or_after'])
const TEXT_OPS = new Set(['contains', 'does_not_contain', 'starts_with', 'ends_with', 'is', 'is_not'])

const preparedCache = new WeakMap<FilterCondition, PreparedCondition>()

function prepareCondition(c: FilterCondition): PreparedCondition {
  const hit = preparedCache.get(c)
  if (hit) return hit
  const fv = c.value
  const isBetweenPair = c.op === 'is_between' && Array.isArray(fv) && fv.length === 2
  const prepared: PreparedCondition = {
    complete: isConditionComplete(c),
    filterIsPerson: isPersonObject(fv) || (Array.isArray(fv) && fv.some(isPersonObject)),
    filterPersonIds: PERSON_CAPABLE_OPS.has(c.op)
      ? (Array.isArray(fv) ? fv.map(personId) : [personId(fv)])
      : null,
    filterTextLower: TEXT_OPS.has(c.op) ? String(fv).toLowerCase() : null,
    filterTextLowerArr:
      (c.op === 'is' || c.op === 'is_not') && Array.isArray(fv) ? fv.map((v) => String(v).toLowerCase()) : null,
    filterDateMs:
      DATE_SINGLE_OPS.has(c.op) || ((c.op === 'is' || c.op === 'is_not') && c.datePrecision !== undefined)
        ? toDateMs(fv, c.datePrecision)
        : null,
    filterDateStart: isBetweenPair ? (fv[0] ? toDateMs(fv[0], c.datePrecision) : -Infinity) : null,
    filterDateEnd: isBetweenPair ? (fv[1] ? toDateMs(fv[1], c.datePrecision) : Infinity) : null,
    relRange: null,
    relDayKey: 0,
  }
  preparedCache.set(c, prepared)
  return prepared
}

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
    // null = 無 complete condition → pass-through(語意同原 completed.length === 0 分支)
    return evaluateConditionsJoined(tree.children, tree.conjunction, row) ?? true
  }

  // nested — group 沒任何 complete condition 的視為 pass-through(不參與 conjunction),
  // 語意同原 meaningful filter
  let sawMeaningful = false
  for (const g of tree.children) {
    const r = evaluateConditionsJoined(g.children, g.conjunction, row)
    if (r === null) continue
    sawMeaningful = true
    if (tree.conjunction === 'and') {
      if (!r) return false
    } else if (r) {
      return true
    }
  }
  if (!sawMeaningful) return true
  return tree.conjunction === 'and'
}

/** 一組 conditions 依 conjunction 求 boolean;null = 組內無 complete condition(pass-through)。
 *  D3 perf:prepared.complete 取代原 per-row `children.filter(isConditionComplete)`
 *  (registry 掃描 + filter/map 兩個中間陣列 alloc);and/or 短路 — 條件是 pure predicate
 *  無副作用,求值順序 / 省略不影響結果。 */
// any-allow: row-generic
function evaluateConditionsJoined(children: FilterCondition[], conjunction: Conjunction, row: any): boolean | null {
  let sawComplete = false
  for (const c of children) {
    const prepared = prepareCondition(c)
    if (!prepared.complete) continue
    sawComplete = true
    const matched = evaluateCondition(c, prepared, row)
    if (conjunction === 'and') {
      if (!matched) return false
    } else if (matched) {
      return true
    }
  }
  if (!sawComplete) return null
  return conjunction === 'and'
}

// any-allow: row-generic
function evaluateCondition(cond: FilterCondition, prepared: PreparedCondition, row: any): boolean {
  if (!cond.field || !cond.op) return true
  const cellValue = row?.[cond.field]
  return matchOperator(cond.op, cellValue, cond.value, cond.datePrecision, prepared)
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

// Q6(2026-07-04):date 比對精度 helper — 'ms' 全精度;其餘(含 undefined)day 級
// (本地時區 startOfDay 截斷,對齊 AG Grid / MUI X date 欄 midnight 慣例)。
// D3 perf(2026-07-06):自 matchOperator 內 closure 提升 top-level — prepareCondition
// (filterValue 側,每 condition 一次)與 matchOperator(cellValue 側,每 row)共用同一實作。
function toDateMs(v: unknown, datePrecision?: 'day' | 'ms'): number {
  const d = new Date(String(v))
  if (Number.isNaN(d.getTime())) return NaN
  return datePrecision === 'ms' ? d.getTime() : startOfDay(d).getTime()
}

/** 本地日曆日 stamp(yyyymmdd)— is_relative 快取跨日失效判定(每 row 1 個 Date alloc,
 *  取代原 relativeKeyToRange 每 row 4-10 個 Date alloc + 區間重算) */
function localDayKey(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

// code-quality-allow: long-function — 13-operator switch dispatch table,table-driven 重構會把 op-specific guards 拆出反增 indirection
function matchOperator(op: string, cellValue: unknown, filterValue: unknown, datePrecision?: 'day' | 'ms', prepared?: PreparedCondition): boolean {
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
  // D3 perf:filterValue 側偵測 + id array 消費 prepared 快取(cellValue 側必然 per-row)。
  const cellIsPerson = isPersonObject(cellValue) || (Array.isArray(cellValue) && cellValue.some(isPersonObject))
  const filterIsPerson = prepared
    ? prepared.filterIsPerson
    : isPersonObject(filterValue) || (Array.isArray(filterValue) && filterValue.some(isPersonObject))
  if (cellIsPerson || filterIsPerson) {
    const cellIds = Array.isArray(cellValue) ? cellValue.map(personId) : [personId(cellValue)]
    const filterIds = prepared?.filterPersonIds ?? (Array.isArray(filterValue) ? filterValue.map(personId) : [personId(filterValue)])
    switch (op) {
      case 'is':         return cellIds.length === 1 && filterIds.length >= 1 && filterIds.includes(cellIds[0])
      case 'is_not':     return !(cellIds.length === 1 && filterIds.length >= 1 && filterIds.includes(cellIds[0]))
      case 'has_any_of': return cellIds.some((c) => filterIds.includes(c))
      case 'has_all_of': return filterIds.every((f) => cellIds.includes(f))
      case 'has_none_of':return !cellIds.some((c) => filterIds.includes(c))
      default:           return true
    }
  }

  // (date 精度 helper 已提升為 top-level `toDateMs`;文字 ops 的 filterValue lowercase 消費
  //  prepared 快取,prepared 缺席 = deprecated dataTableFilterMatch 路徑 inline fallback — D3 perf)

  switch (op) {
    case 'contains':         return String(cellValue ?? '').toLowerCase().includes(prepared?.filterTextLower ?? String(filterValue).toLowerCase())
    case 'does_not_contain': return !String(cellValue ?? '').toLowerCase().includes(prepared?.filterTextLower ?? String(filterValue).toLowerCase())
    // 2026-05-12 Round 6 fix(user 抓 Roadmap 進階篩選「全部」結果空)— impl-vs-spec drift。
    // Per `filter-operators.spec.md` L116「is 直接接受多值,不另設 is_any_of」+ L103-116
    // select(is/is_not + select_multi ValueShape OR 語意)+ L31-32(select.is / person.is 都走
    // select_multi / person_multi ValueShape)。原 impl 只做 single-value 比對,filterValue 是
    // array(全選 options)→ String(array)= "v1,v2" → 永遠 != single cellValue → 結果空。
    // Fix:加 array handling,走 OR 語意:any → match;is_not → every-not-match。
    case 'is':
      // Q6:date 欄位(datePrecision 有值)走日期比對非字串 — 「2026-06-01」與「2026-06-01 14:30」
      // 在 day 精度下相等(原字串小寫相等連同日不同格式都漏)
      if (datePrecision) {
        const a = toDateMs(cellValue, datePrecision)
        const b = prepared?.filterDateMs ?? toDateMs(filterValue, datePrecision)
        return !Number.isNaN(a) && a === b
      }
      if (Array.isArray(filterValue)) {
        const cellLower = String(cellValue ?? '').toLowerCase()
        const filterLowers = prepared?.filterTextLowerArr ?? filterValue.map((v) => String(v).toLowerCase())
        return filterLowers.some((v) => cellLower === v)
      }
      return String(cellValue ?? '').toLowerCase() === (prepared?.filterTextLower ?? String(filterValue).toLowerCase())
    case 'is_not':
      if (datePrecision) {
        const a = toDateMs(cellValue, datePrecision)
        const b = prepared?.filterDateMs ?? toDateMs(filterValue, datePrecision)
        return Number.isNaN(a) || a !== b
      }
      if (Array.isArray(filterValue)) {
        const cellLower = String(cellValue ?? '').toLowerCase()
        const filterLowers = prepared?.filterTextLowerArr ?? filterValue.map((v) => String(v).toLowerCase())
        return filterLowers.every((v) => cellLower !== v)
      }
      return String(cellValue ?? '').toLowerCase() !== (prepared?.filterTextLower ?? String(filterValue).toLowerCase())
    case 'starts_with':      return String(cellValue ?? '').toLowerCase().startsWith(prepared?.filterTextLower ?? String(filterValue).toLowerCase())
    case 'ends_with':        return String(cellValue ?? '').toLowerCase().endsWith(prepared?.filterTextLower ?? String(filterValue).toLowerCase())

    case 'equals':     return Number(cellValue) === Number(filterValue)
    case 'not_equals': return Number(cellValue) !== Number(filterValue)
    case 'gt':         return Number(cellValue) > Number(filterValue)
    case 'gte':        return Number(cellValue) >= Number(filterValue)
    case 'lt':         return Number(cellValue) < Number(filterValue)
    case 'lte':        return Number(cellValue) <= Number(filterValue)

    case 'is_before':       return toDateMs(cellValue, datePrecision) < (prepared?.filterDateMs ?? toDateMs(filterValue, datePrecision))
    case 'is_after':        return toDateMs(cellValue, datePrecision) > (prepared?.filterDateMs ?? toDateMs(filterValue, datePrecision))
    case 'is_on_or_before': return toDateMs(cellValue, datePrecision) <= (prepared?.filterDateMs ?? toDateMs(filterValue, datePrecision))
    case 'is_on_or_after':  return toDateMs(cellValue, datePrecision) >= (prepared?.filterDateMs ?? toDateMs(filterValue, datePrecision))
    case 'is_between': {
      if (!Array.isArray(filterValue) || filterValue.length !== 2) return true
      const cv = toDateMs(cellValue, datePrecision)
      const start = prepared?.filterDateStart ?? (filterValue[0] ? toDateMs(filterValue[0], datePrecision) : -Infinity)
      const end = prepared?.filterDateEnd ?? (filterValue[1] ? toDateMs(filterValue[1], datePrecision) : Infinity)
      return cv >= start && cv <= end
    }
    case 'is_relative': {
      // Phase D 完整實作 — relative key → time range → in-range test
      // D3 perf:relativeKeyToRange 所有輸出都是 calendar day 的純函數(today / this_week /
      // past_7_days… 全是日界),同日內恆定 → 以 localDayKey 判跨日,同日重用快取區間
      // (原每 row 重算 4-10 個 Date alloc)。
      let range: [number, number] | null
      if (prepared) {
        const now = new Date()
        const dayKey = localDayKey(now)
        if (prepared.relDayKey !== dayKey) {
          prepared.relRange = relativeKeyToRange(String(filterValue), now)
          prepared.relDayKey = dayKey
        }
        range = prepared.relRange
      } else {
        range = relativeKeyToRange(String(filterValue))
      }
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
