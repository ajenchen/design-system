#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DataTable「哪幾列正在編輯」(components/DataTable/lib/editing-rows.ts `editingRowIndexesOf`)是格鍵 `cellEditId` 的
 *        **反函式精確比**:前綴 `${rowId}__` 之後剩下的必須正好是一個存在的欄 id;列 id 含 `__` 時不會把別列配進來;
 *        格鍵格式本身有歧義時(列 `a` + 欄 `b__c` 與列 `a__b` + 欄 `c`)兩列都回(與 data-table.tsx `isEditingThisCell` 同一個答案)。
 *        另驗呼叫端:data-table.tsx 從 lib 取 `cellEditId` / `editingRowIndexesOf`、不留第二份格鍵格式,而且 `editingRowIndexes`
 *        真的呼叫 `editingRowIndexesOf`(M32:值是誰算的)。
 *   紅: 判定表任一格不符 → exit 1(判定表寫的是**期望值**,不是抄輸出)。`--selftest` 換上 2026-11-05 f5c343a2 的前綴代理寫法
 *        (`editingCellId.startsWith(`${r.id}__`)`)當對照組,判定表必須抓到 ≥ 1 格不符,抓不到 = 判定表沒在分辨反函式與前綴代理 → exit 1。
 *   綠: 全部相符;純函式無時鐘、無隨機、無 DOM,重複跑結果恆等。
 *
 * 2026-11-16(A25 覆核 SF10;【AI 推導 2026-11-16】)。為什麼要它:I39(瀏覽器)用的 story 列 id(`RDM-100-1`、`SKU-002`)不含 `__`,
 * 把反函式改回前綴代理 I39 照樣綠 —— 「用反函式不用代理」(M37)這件事原本沒有任何閘分辨得出來。
 *
 * Run: `node scripts/test-data-table-editing-rows.mjs`(`--selftest` 跑對照組)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as real from '../packages/design-system/src/components/DataTable/lib/editing-rows.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')

// 對照組:2026-11-05 f5c343a2 的前綴代理(列 id 加 `__` 當前綴,不看剩下的是不是欄 id)
const prefixProxy = {
  editingRowIndexesOf: (editingCellId, rowIds) => {
    if (editingCellId == null) return []
    const hits = []
    rowIds.forEach((rowId, i) => { if (editingCellId.startsWith(`${rowId}__`)) hits.push(i) })
    return hits
  },
}

// [名稱, editingCellId, 列 id(依列序), 欄 id, 期望索引]
const TABLE = [
  ['沒有在編輯 → 空', null, ['r1', 'r2'], ['name', 'qty'], []],
  ['一般格鍵:r2__qty → 第 1 列', real.cellEditId('r2', 'qty'), ['r1', 'r2', 'r3'], ['name', 'qty'], [1]],
  ['列 id 是另一列 id 的前綴(列 `a` 與 `a__b`、欄 `c`):編輯 `a__b` 的 `c` → 只有 `a__b`(`a` + `b__c` 不是存在的欄)', 'a__b__c', ['a', 'a__b'], ['c'], [1]],
  ['同一組列、欄是 `b__c`(列 `a` 的欄)、編輯 `a` 的 `b__c` → 只有 `a`', 'a__b__c', ['a', 'a__b'], ['b__c'], [0]],
  ['格鍵格式本身有歧義(列 `a` + 欄 `b__c` 與列 `a__b` + 欄 `c` 都組成 `a__b__c`)→ 兩列都回(與 isEditingThisCell 同一個答案)', 'a__b__c', ['a', 'a__b'], ['c', 'b__c'], [0, 1]],
  ['欄 id 不存在(欄被拿掉了)→ 沒有任何一列', real.cellEditId('r1', 'gone'), ['r1', 'r2'], ['name'], []],
  ['列 id 本身含 `__`、欄 id 正常 → 那一列', real.cellEditId('RDM__100', 'title'), ['RDM', 'RDM__100'], ['title'], [1]],
  ['空字串列 id 不會配上任何格鍵前綴以外的東西(`__name` 是列 `` 的 name)', '__name', ['', 'x'], ['name'], [0]],
  ['同一列 id 出現兩次(呼叫端給錯也不吞):兩個索引都回', real.cellEditId('dup', 'name'), ['dup', 'dup'], ['name'], [0, 1]],
]

let fail = 0
const run = (impl, label) => {
  let wrong = 0
  for (const [name, id, rowIds, colIds, want] of TABLE) {
    const got = impl.editingRowIndexesOf(id, rowIds, colIds)
    const ok = JSON.stringify(got) === JSON.stringify(want)
    if (!ok) wrong++
    if (label === 'real') { if (!ok) fail++; console.log(`${ok ? '✓' : '✗'} 判定表|${name} → [${got}](期望 [${want}])`) }
  }
  return wrong
}
run(real, 'real')
{
  // 格鍵格式:組回去與拆開來是同一份(cellEditId 是格鍵的唯一住所)
  const ok = real.cellEditId('r', 'c') === 'r__c'
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 格鍵|cellEditId('r', 'c') = ${real.cellEditId('r', 'c')}`)
}
{
  // 呼叫端(M32 參數邊界):data-table.tsx 從 lib 取兩支、不留第二份格鍵格式;editingRowIndexes 真的呼叫 editingRowIndexesOf
  const src = readFileSync(join(ROOT, 'packages/design-system/src/components/DataTable/data-table.tsx'), 'utf8')
  const imports = /import \{ cellEditId, editingRowIndexesOf \} from '\.\/lib\/editing-rows'/.test(src)
  const noLocal = !/const cellEditId = /.test(src)
  const calls = /const editingRowIndexes = React\.useMemo\(\(\) => \{\n[^\n]*\n\s+return editingRowIndexesOf\(editingCellId, rows\.map\(\(r\) => r\.id\), table\.getAllLeafColumns\(\)\.map\(\(c\) => c\.id\)\)/.test(src)
  const ok = imports && noLocal && calls
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 呼叫端|data-table.tsx 從 lib 匯入 ${imports}、沒有本地第二份 cellEditId ${noLocal}、editingRowIndexes 呼叫 editingRowIndexesOf(列 id 依列序、全部葉欄) ${calls}`)
}
if (SELFTEST) {
  const wrong = run(prefixProxy, 'proxy')
  const ok = wrong >= 1
  if (!ok) fail++
  console.log(`${ok ? '✓' : '✗'} 對照組|2026-11-05 f5c343a2 的前綴代理 → 判定表 ${wrong} 格不符(必須 ≥ 1)`)
}

console.log(fail ? `\n✗ ${fail} 項不符` : `\n✓ 編輯列判定表全過${SELFTEST ? '(含前綴代理對照組)' : ''}`)
process.exit(fail ? 1 : 0)
