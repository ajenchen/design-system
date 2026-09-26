#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: hover-own-pair-invariant 在「滑過底色借了別的底的配對」時會紅、在元素用自己的配對(或釘住)時不紅,
 *         而且它的綠燈來自真的掃到東西(判了 N 組)而不是配對表或解析器壞掉後的空集合
 *   紅: 026d5788 之前的 Calendar 非當月格原文(bg-muted + hover:bg-neutral-hover)必須指名 bg-muted 紅;
 *       把現行 calendar.tsx 的非當月格塞回 `!inMonth && 'bg-muted'`(突變)也必須紅;閘的 selftest 正反例(含合成違規)全過;
 *       (2026-09-25 C12②)「底」滑過 / 按住直接換成 --neutral-* 必須紅且提示指到疊層 utility;疊層疊在「底」以外(secondary / 透明)必須紅;
 *       單檔模式判到 0 組必須是 NO-EVIDENCE(exit 1),全樹判到 0 組必須是 INSTRUMENT-FAIL —— 兩者都不得是 PASS
 *   綠: 現行 calendar.tsx 整份檔案 0 筆;全樹掃描(套已知清單)沒有新命中、已知清單格式合法、而且判到的組數 > 0;
 *        「底」+ 疊層真的被判成 ✓(不是略過);單檔模式的「已知清單沒出現」只算被掃的那個檔;
 *        全部是 import 判定函式直接呼叫(不起子行程)+ 讀檔,不依賴時間、瀏覽器或網路,重複跑結果相同
 */
// meta-test for hover-own-pair-invariant —— 兩面對照:該紅時紅(以 Calendar 修正前的真實原文為主角)、該綠時綠。
// 背景:2026-09-25 Calendar 非當月格靜止 bg-muted、滑過換成透明底的 --neutral-hover,兩個主題都反向;
// 026d5788 修掉之後,這支閘是「下一次有人再這樣寫」的機械防線。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CALENDAR_BEFORE_026D5788, evaluateTree, loadTable, scanSource, selftest, verdictOf } from './hover-own-pair-invariant.mjs'

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
  assert.equal(verdictOf(r).status, 'PASS')
})

// ── 2026-09-25 C12②:B8「底」疊層 + 0 組不得印 ✓(待辦總帳 C12②;SSOT = color.spec.md「Hover 換色配對總則」)──

check('紅:「底」滑過 / 按住直接換成 --neutral-*(深色變暗 / 沒反應)→ 紅,提示指到疊層 utility', () => {
  const hover = scanSource(`const a = cn('bg-surface hover:bg-neutral-hover')`, 'x.tsx', table).violations
  assert.equal(hover.length, 1, JSON.stringify(hover))
  assert.match(hover[0].why, /bg-interaction-hover/)
  const press = scanSource(`const a = cn('bg-surface-raised active:bg-neutral-active')`, 'x.tsx', table).violations
  assert.equal(press.length, 1, JSON.stringify(press))
  assert.match(press[0].why, /bg-interaction-active/)
})

check('紅:疊層疊在「底」以外 —— secondary 要換自己的 -hover、透明要換 --neutral-hover', () => {
  const onSecondary = scanSource(`const a = cn('bg-secondary hover:bg-interaction-hover')`, 'x.tsx', table).violations
  assert.equal(onSecondary.length, 1, JSON.stringify(onSecondary))
  assert.match(onSecondary[0].why, /--secondary-hover/)
  const onTransparent = scanSource(`const a = cn('bg-transparent hover:bg-interaction-hover')`, 'x.tsx', table).violations
  assert.equal(onTransparent.length, 1, JSON.stringify(onTransparent))
  assert.match(onTransparent[0].why, /--neutral-hover/)
})

check('綠:「底」+ 疊層被判成 ✓(真的判過,不是當成非色彩 class 略過)', () => {
  const { violations, evaluated } = scanSource(`const a = cn('bg-canvas hover:bg-interaction-hover active:bg-interaction-active')`, 'x.tsx', table)
  assert.deepEqual(violations, [])
  assert.equal(evaluated.filter((e) => e.verdict === '✓' && /bg-interaction-/.test(e.hover)).length, 2, JSON.stringify(evaluated))
})

check('0 組不得印 ✓:單檔 = NO-EVIDENCE、全樹 = INSTRUMENT-FAIL(M37;修前 --file 判 0 組印 ✓ exit 0)', () => {
  const utils = evaluateTree({ table, files: [[join(REPO, 'packages/design-system/src/lib/utils.ts'), undefined]], fileMode: true })
  assert.equal(utils.evaluated.length, 0, 'utils.ts 應該沒有可判的一對(若這裡不是 0,換一個沒有底色回饋的檔當對照組)')
  assert.deepEqual(verdictOf(utils), { status: 'NO-EVIDENCE', exitCode: 1 })
  const empty = evaluateTree({ table, files: [] })
  assert.deepEqual(verdictOf(empty), { status: 'INSTRUMENT-FAIL', exitCode: 1 })
  // 對照組:同一個單檔模式、判得到東西的檔 → PASS(證明 NO-EVIDENCE 不是單檔模式一律紅)
  assert.equal(verdictOf(evaluateTree({ table, files: [[join(REPO, CAL_REL), undefined]], fileMode: true })).status, 'PASS')
})

check('單檔模式的「已知清單沒出現」只算被掃的那個檔(修前把其他檔的 14 筆全列成「已修好」)', () => {
  const r = evaluateTree({ table, files: [[join(REPO, 'packages/design-system/src/patterns/resize-handle/resize-handle.tsx'), undefined]], fileMode: true })
  assert.deepEqual(r.stale, [])
  assert.equal(r.pending.length, 2, JSON.stringify(r.pending.map((v) => v.hover)))
})

console.log(`\n✓ hover-own-pair-invariant meta-test ${passed} 題全過`)
