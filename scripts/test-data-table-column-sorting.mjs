#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DataTable 每個欄型都有自己的排序比法(components/DataTable/lib/column-sorting.ts;data-table.spec.md「七、Column Type」排序表),
 *        而且**不靠 TanStack 的自動判斷**:
 *        T 判定表:每一型給一組儲存格值,真的用 TanStack v8 的 getSortedRowModel 排(升冪 / 降冪),順序 = 表上寫的期望值
 *          (期望值手寫,不是抄輸出)—— person 照名字、multiPerson 逐人比名字、string / url / time 不分大小寫且數字段照數值、
 *          date 照時間、select / multiSelect 決定前同修前(照原始值);
 *        L 列數無關:同一組人員 / 字串值放成 ≤ 10 列與 > 10 列兩張表,排出來的順序相同(自動判斷 `flatRows.slice(10)` 會讓兩者不同);
 *        C 呼叫端:data-table.tsx 的欄位前處理真的對每個有 meta.type 的欄掛 `sortingFnForColumnType`,且 consumer 自己寫的 sortingFn 不被蓋掉
 *          (瀏覽器端由 `scripts/data-table-column-sorting-invariant.mjs` 驗頁面真的照這個排)。
 *   紅: 任一格不符即 exit 1;`--selftest` 把每一型的比法換回修前(欄不掛 sortingFn = TanStack `'auto'`),判定表必須抓到 ≥ 6 格不符
 *        (人員 / 多人亂排、≤ 10 列的字串分大小寫、≤ 10 列的時間照字元比…),抓不到 = 判定表沒在驗這條規則 → exit 1。
 *   綠: 全部相符時綠;純函式 + TanStack 純邏輯(table-core),無 DOM、無時鐘、無隨機。
 *
 * Run: `node scripts/test-data-table-column-sorting.mjs`(`--selftest` 跑對照組)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTable, getCoreRowModel, getSortedRowModel } from '@tanstack/table-core'
import { sortingFnForColumnType } from '../packages/design-system/src/components/DataTable/lib/column-sorting.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')

/** 用 TanStack 真的排一次;legacy = 修前(欄沒有 sortingFn → 'auto') */
function sortValues(type, values, { desc = false, legacy = false } = {}) {
  let state = { sorting: [{ id: 'v', desc }] }
  const column = { id: 'v', accessorFn: (row) => row.v, ...(legacy ? {} : { sortingFn: sortingFnForColumnType(type) }) }
  const table = createTable({
    data: values.map((v, i) => ({ v, i })),
    columns: [column],
    state,
    onStateChange: (u) => { state = typeof u === 'function' ? u(state) : u },
    renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  table.setOptions((prev) => ({ ...prev, state }))
  return table.getSortedRowModel().rows.map((r) => r.original.i)
}

const P = (name) => ({ name, avatarUrl: `https://i.pravatar.cc/128?u=${name}`, description: 'Sales' })
// 每格:[欄型, 說明, 值, 期望升冪順序(值的索引)]
const CASES = [
  ['person', '照名字、不分大小寫;null 當最小', [P('Carol Liu'), P('alice'), 'Bob', null, P('David Wu')], [3, 1, 2, 0, 4]],
  ['person', '同名照原順序(穩定)', [P('Bob'), P('Alice'), P('Bob')], [1, 0, 2]],
  ['multiPerson', '逐人比名字,前面相同時人少的在前;空陣列最小', [[P('Bob'), P('Alice')], [P('Alice')], [], [P('Alice'), P('Carol')], [P('Bob')]], [2, 1, 3, 4, 0]],
  ['string', '不分大小寫、數字段照數值', ['第 10 版', '第 2 版', 'apple', 'Banana'], [2, 3, 1, 0]],
  ['url', '不分大小寫', ['https://figma.com/b', 'https://Atlassian.com/a'], [1, 0]],
  ['time', '9:30 < 10:00(數字段照數值)', ['10:00', '9:30', '09:15'], [2, 1, 0]],
  ['date', '照時間;Date 與 ISO 字串混用;null 最小', ['2026-03-10', new Date('2026-01-05T00:00:00'), null, '2026-02-01'], [2, 1, 3, 0]],
  ['number', '照數值(同修前)', [10, 2, -1, 0.5], [2, 3, 1, 0]],
  ['currency', '照數值(同修前)', [1200, 99.9, 15000], [1, 0, 2]],
  ['boolean', 'false 在前(同修前)', [true, false], [1, 0]],
  ['select', '決定前同修前:照原始值', ['not-started', 'blocked', 'done', 'in-progress'], [1, 2, 3, 0]],
  ['multiSelect', '決定前同修前:原始值接成字串比', [['frontend', 'design'], ['backend'], [], ['backend', 'qa']], [2, 1, 3, 0]],
]

let fails = 0
const mismatch = []
const record = (ok, label, detail) => {
  if (!ok) { mismatch.push(label); if (!SELFTEST) console.log(`✗ ${label} | ${detail}`) }
  else if (!SELFTEST) console.log(`✓ ${label}`)
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

for (const [type, why, values, expectAsc] of CASES) {
  const asc = sortValues(type, values, { legacy: SELFTEST })
  record(same(asc, expectAsc), `T ${type} 升冪:${why}`, `得 ${JSON.stringify(asc)} 應 ${JSON.stringify(expectAsc)}`)
  // 降冪 = 升冪反過來(相等的那幾格維持原順序,TanStack 的平手規則);本表只放沒有平手的值時才驗降冪
  const hasTie = type === 'person' && why.startsWith('同名')
  if (!hasTie) {
    const desc = sortValues(type, values, { desc: true, legacy: SELFTEST })
    record(same(desc, [...expectAsc].reverse()), `T ${type} 降冪:${why}`, `得 ${JSON.stringify(desc)} 應 ${JSON.stringify([...expectAsc].reverse())}`)
  }
}

// L:列數無關 —— 自動判斷看的是第 11 列以後,≤ 10 列與 > 10 列會選到不同比法
const NAMES = ['carol', 'Alice', 'bob', 'David', 'erin', 'Frank', 'grace', 'Heidi', 'ivan', 'Judy', 'Ken', 'liam', 'Mallory', 'nina', 'Oscar']
for (const [type, make] of [['person', (n) => P(n)], ['string', (n) => n]]) {
  const small = sortValues(type, NAMES.slice(0, 5).map(make), { legacy: SELFTEST }).map((i) => NAMES[i])
  const big = sortValues(type, NAMES.map(make), { legacy: SELFTEST }).map((i) => NAMES[i]).filter((n) => NAMES.slice(0, 5).includes(n))
  const expect = ['Alice', 'bob', 'carol', 'David', 'erin']
  record(same(small, expect) && same(big, expect), `L ${type} ≤ 10 列與 > 10 列同序`, `5 列 ${small.join(' ')} / 15 列 ${big.join(' ')} 應 ${expect.join(' ')}`)
}

// C:呼叫端真的消費(selftest 下不驗 —— 對照組只換比法)
if (!SELFTEST) {
  const src = readFileSync(join(ROOT, 'packages/design-system/src/components/DataTable/data-table.tsx'), 'utf8')
  const block = src.slice(src.indexOf('const dsProcessedColumns = React.useMemo'), src.indexOf('const columnsWithSelection = React.useMemo'))
  record(block.length > 0 && /meta\.type !== undefined && cAny\.sortingFn === undefined\) updates\.sortingFn = sortingFnForColumnType/.test(block),
    'C data-table.tsx 前處理對有 meta.type 且沒自帶 sortingFn 的欄掛 sortingFnForColumnType', '前處理裡找不到那一行')
}

if (SELFTEST) {
  const need = 6
  console.log(`[selftest] 修前比法(TanStack 'auto')被判定表抓到 ${mismatch.length} 格不符(需 ≥ ${need}):${mismatch.join(' / ')}`)
  if (mismatch.length < need) { console.log('✗ 判定表抓不到修前的病 → 沒在驗這條規則'); process.exit(1) }
  console.log('✓ selftest:判定表會紅')
  process.exit(0)
}
fails = mismatch.length
console.log(fails === 0 ? `✓ test-data-table-column-sorting:全部相符` : `✗ test-data-table-column-sorting:${fails} 格不符`)
process.exit(fails === 0 ? 0 : 1)
