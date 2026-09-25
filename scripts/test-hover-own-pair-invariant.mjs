#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: hover-own-pair-invariant 在「滑過底色借了別的底的配對」時會紅、在元素用自己的配對(或釘住)時不紅,
 *         而且它的綠燈來自真的掃到東西(判了 N 組)而不是配對表或解析器壞掉後的空集合
 *   紅: 026d5788 之前的 Calendar 非當月格原文(bg-muted + hover:bg-neutral-hover)必須指名 bg-muted 紅;
 *       把現行 calendar.tsx 的非當月格塞回 `!inMonth && 'bg-muted'`(突變)也必須紅;閘的 selftest 正反例(含合成違規)全過
 *   綠: 現行 calendar.tsx 整份檔案 0 筆;全樹掃描(套已知清單)沒有新命中、已知清單格式合法、而且判到的組數 > 0;
 *        全部是 import 判定函式直接呼叫(不起子行程)+ 讀檔,不依賴時間、瀏覽器或網路,重複跑結果相同
 */
// meta-test for hover-own-pair-invariant —— 兩面對照:該紅時紅(以 Calendar 修正前的真實原文為主角)、該綠時綠。
// 背景:2026-09-25 Calendar 非當月格靜止 bg-muted、滑過換成透明底的 --neutral-hover,兩個主題都反向;
// 026d5788 修掉之後,這支閘是「下一次有人再這樣寫」的機械防線。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CALENDAR_BEFORE_026D5788, evaluateTree, loadTable, scanSource, selftest } from './hover-own-pair-invariant.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CAL_REL = 'packages/design-system/src/components/Calendar/calendar.tsx'
const table = loadTable()
let passed = 0
const check = (label, fn) => { fn(); passed++; console.log(`✓ ${label}`) }

check('配對表確實從 semantic.css 讀到(空表會讓全部變成「不判」而假綠)', () => {
  assert.ok(table.pairs.size >= 10, `配對表只有 ${table.pairs.size} 組`)
  assert.equal(table.pairs.get('--neutral-hover'), 'transparent')
  assert.equal(table.pairs.get('--neutral-selected-hover'), '--neutral-selected')
})

check('026d5788 之前的 Calendar 非當月格原文 → 紅,且指名 bg-muted', () => {
  const { violations } = scanSource(CALENDAR_BEFORE_026D5788, 'calendar-before.tsx', table)
  assert.equal(violations.length, 1, JSON.stringify(violations))
  assert.equal(violations[0].hover, 'hover:bg-neutral-hover')
  assert.equal(violations[0].rest, 'bg-muted')
})

const current = readFileSync(join(REPO, CAL_REL), 'utf8')
check('現行 calendar.tsx 整份 → 0 筆', () => {
  const { violations, evaluated } = scanSource(current, CAL_REL, table)
  assert.deepEqual(violations, [])
  assert.ok(evaluated.some((e) => e.hover === 'hover:bg-neutral-hover'), '現行 calendar.tsx 裡應該判到非當月格那一組 —— 沒判到代表解析器沒看到它')
})

check('突變:把 `!inMonth && \'bg-muted\'` 塞回現行 calendar.tsx 的同一段 → 紅', () => {
  const anchor = "'hover:bg-neutral-hover',"
  const idx = current.indexOf(anchor)
  assert.ok(idx > 0, `現行 calendar.tsx 找不到 ${anchor}(被改寫了?請更新本突變的錨點)`)
  const mutated = `${current.slice(0, idx + anchor.length)}\n                !inMonth && 'bg-muted',${current.slice(idx + anchor.length)}`
  const { violations } = scanSource(mutated, CAL_REL, table)
  assert.ok(violations.some((v) => v.rest === 'bg-muted' && v.hover === 'hover:bg-neutral-hover'), JSON.stringify(violations))
})

// 整份 026d5788^ 的 calendar.tsx 已於 2026-09-25 手動驗過(`git show 026d5788^:… | node scripts/hover-own-pair-invariant.mjs --file=… --stdin --no-baseline`
// → 1 筆,指名 bg-muted);這裡不起 git 子行程(淺層 clone 沒有那個物件,而且 harness 不審查子行程參數),
// 由上面「逐字原文」+「突變」兩題在任何環境下證明會紅。

check('閘的 selftest 正反例全過', () => {
  const lines = []
  assert.equal(selftest(table, (line) => lines.push(line)), true, lines.filter((l) => l.startsWith('✗') || l.startsWith('    ')).join('\n'))
})

check('全樹掃描(套已知清單):沒有新命中、清單格式合法、而且真的判到東西', () => {
  const r = evaluateTree({ table })
  assert.ok(r.evaluated.length > 0, `全樹只判到 ${r.evaluated.length} 組 —— 解析器或路徑壞了`)
  assert.deepEqual(r.malformed, [], '已知清單有格式不合的項目')
  assert.deepEqual(r.fresh.map((v) => `${v.path}:${v.line} ${v.hover} × ${v.rest}`), [])
})

console.log(`\n✓ hover-own-pair-invariant meta-test ${passed} 題全過`)
