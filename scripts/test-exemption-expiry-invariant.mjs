#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: exemption-expiry-invariant 在「豁免標記既沒日期也沒指標」或「日期超過 N 天」時會紅、在有日期 / 有指標時不紅,
 *         長得像標記的東西(正規表示式、註解中段的提及、md 反引號與程式碼區塊、scripts 裡的偵測器定義)不算,
 *         而且它的綠燈來自真的掃到東西(標記數 > 0)而不是路徑或掃描器壞掉後的空集合
 *   紅: 把現行 checkbox.tsx 的 `@hover-transition-allow`(有 motion.spec.md 指標)的指標拿掉(突變)必須以 fresh 紅;
 *       把現行 radio-group.tsx 同一個標記的日期改成 now−181 天(突變)必須以「過期」紅;
 *       閘的 --selftest 正反例全過;0 檔必須 INSTRUMENT-FAIL
 *   綠: 現況(套 baseline、now 釘在 baseline.recordedAt)0 筆新增;標記數 > 0;baseline 格式合法(reviewAfterDays 與閘一致);
 *        判定不依賴今天幾號:同一份輸入把 now 往前推,只會讓「過期」變「未過期」,不會多出任何違規
 */
// meta-test for exemption-expiry-invariant —— 現況必綠 + 對照組必紅(兩面缺一不可,M32「儀器要先有對照組」)。
// 時間是輸入:這裡所有日期都相對於 now 推導、baseline 那一半把 now 釘在 recordedAt(M37 第九個形狀:
// fixture 寫死日期 = 定時炸彈)。真正的「今天有東西到期」警報是閘自己的執行,不是這支 meta-test。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runGateSelftestMeta } from './lib/gate-selftest-meta.mjs'
import { BASELINE, REVIEW_AFTER_DAYS, evaluate, loadBaseline, scanText, selftest, verdictOf } from './exemption-expiry-invariant.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DAY = 86_400_000
const iso = (d) => d.toISOString().slice(0, 10)
const baseline = loadBaseline(BASELINE)
assert.ok(baseline && /^\d{4}-\d{2}-\d{2}$/.test(baseline.recordedAt), 'baseline 缺 recordedAt')
const NOW = new Date(`${baseline.recordedAt}T00:00:00Z`)
let passed = 0
const check = (label, fn) => { fn(); passed++; console.log(`✓ ${label}`) }

check('閘的 selftest 正反例全過(無主 / 過期紅、合法 / 有主放、長得像的不算、棘輪、時間輸入、0 檔 INSTRUMENT-FAIL)', () => {
  const lines = []
  assert.equal(selftest(NOW, (l) => lines.push(l)), true, lines.filter((l) => l.startsWith('✗')).join('\n'))
})

check('baseline 格式合法:reviewAfterDays 與閘一致、每筆有 key、count 對得上', () => {
  assert.equal(baseline.reviewAfterDays, REVIEW_AFTER_DAYS)
  assert.equal(baseline.entries.length, baseline.count)
  assert.ok(baseline.entries.every((e) => typeof e.key === 'string' && e.key.split('|').length >= 4))
})

const current = evaluate({ now: NOW })
check('現況(now = recordedAt):真的掃到東西,而且 0 筆新增 → PASS', () => {
  assert.ok(current.markers.length > 100, `只掃到 ${current.markers.length} 個標記 —— 路徑或掃描器壞了`)
  assert.deepEqual(current.fresh.map((m) => `${m.file}:${m.line} ${m.marker}`), [])
  assert.equal(verdictOf(current).status, 'PASS')
})

// ── 突變一:把一個有指標的真實標記的指標拿掉 → 無主 → fresh 紅 ──────────────────
const CHECKBOX = 'packages/design-system/src/components/Checkbox/checkbox.tsx'
const checkboxText = readFileSync(join(REPO, CHECKBOX), 'utf8')
check('現行 checkbox.tsx 的 @hover-transition-allow 有指標(motion.spec.md),不是違規', () => {
  const hit = scanText(checkboxText, CHECKBOX).find((m) => m.marker === '@hover-transition-allow')
  assert.ok(hit, '現行 checkbox.tsx 找不到 @hover-transition-allow(被改寫了?請更新本突變的錨點)')
  const r = evaluate({ now: NOW, files: [{ rel: CHECKBOX, text: checkboxText }], registries: [], baseline })
  assert.ok(!r.violations.some((v) => v.marker === '@hover-transition-allow'), '現行標記不該是違規')
})
check('突變:把那條標記的指標(motion.spec.md)改成不存在的檔 → 無主 → fresh 紅', () => {
  assert.ok(checkboxText.includes('motion.spec.md'), '錨點 motion.spec.md 不在 checkbox.tsx 裡(請更新本突變的錨點)')
  const mutated = checkboxText.replace('motion.spec.md', 'never-there-dir/nothing.spec.md')
  const r = evaluate({ now: NOW, files: [{ rel: CHECKBOX, text: mutated }], registries: [], baseline })
  const hit = r.fresh.find((v) => v.marker === '@hover-transition-allow')
  assert.ok(hit, `突變後應該以 fresh 紅,實得 ${JSON.stringify(r.fresh.map((v) => v.marker))}`)
  assert.equal(hit.kind, 'unanchored')
  // 指標在 checkbox.tsx 裡寫的是 `tokens/motion/motion.spec.md`,突變後的懸空指標就是 `tokens/motion/never-there-dir/nothing.spec.md`
  //(閘回報的是標記裡寫的整條路徑,不是只有被換掉的那一段)
  assert.deepEqual(hit.dangling, ['tokens/motion/never-there-dir/nothing.spec.md'])
  assert.equal(verdictOf(r).status, 'VIOLATION')
})

// ── 突變二:把一個有日期的真實標記的日期改成 now−181 天 → 過期 → fresh 紅;now−180 天 → 不紅 ──
const RADIO = 'packages/design-system/src/components/RadioGroup/radio-group.tsx'
const radioText = readFileSync(join(REPO, RADIO), 'utf8')
check('突變:radio-group.tsx 的 @hover-transition-allow 日期改成 now−181 天 → 過期紅;改成 now−180 天 → 不紅(邊界兩面)', () => {
  const hit = scanText(radioText, RADIO).find((m) => m.marker === '@hover-transition-allow')
  assert.ok(hit, '現行 radio-group.tsx 找不到 @hover-transition-allow(被改寫了?請更新本突變的錨點)')
  const date = /\b20\d{2}-\d{2}-\d{2}\b/.exec(hit.window)?.[0]
  assert.ok(date, `那條標記的窗格裡應該有日期(實得窗格:${hit.window.slice(0, 120)})`)
  const withDate = (d) => radioText.replace(hit.window, hit.window.replace(date, d))
  const expired = evaluate({ now: NOW, files: [{ rel: RADIO, text: withDate(iso(new Date(NOW.getTime() - 181 * DAY))) }], registries: [], baseline })
  const e = expired.fresh.find((v) => v.marker === '@hover-transition-allow')
  assert.ok(e && e.kind === 'expired' && e.ageDays === 181, `now−181 天應該以「過期」紅,實得 ${JSON.stringify(expired.fresh.map((v) => [v.marker, v.kind, v.ageDays]))}`)
  const edge = evaluate({ now: NOW, files: [{ rel: RADIO, text: withDate(iso(new Date(NOW.getTime() - 180 * DAY))) }], registries: [], baseline })
  assert.ok(!edge.fresh.some((v) => v.marker === '@hover-transition-allow'), 'now−180 天不該紅(邊界)')
})

check('時間是輸入:同一份輸入把 now 往前推 30 天,違規只會變少不會變多', () => {
  const earlier = evaluate({ now: new Date(NOW.getTime() - 30 * DAY) })
  assert.ok(earlier.violations.length <= current.violations.length)
  assert.deepEqual(earlier.fresh, [])
})

check('0 檔 → INSTRUMENT-FAIL(沒量到 ≠ 沒有豁免)', () => {
  assert.equal(verdictOf(evaluate({ now: NOW, files: [], registries: [], baseline })).status, 'INSTRUMENT-FAIL')
})

console.log(`\n✓ exemption-expiry-invariant meta-test ${passed} 題全過;接著跑共用的「現況必綠 + --selftest 必紅」`)
// baseline 那一半把 now 釘在 recordedAt:這支證明的是儀器會紅,不是今天有沒有東西到期(那是閘自己的執行要講的)。
runGateSelftestMeta('scripts/exemption-expiry-invariant.mjs', { baseArgs: [`--now=${baseline.recordedAt}`], selftestArgs: ['--selftest', `--now=${baseline.recordedAt}`] })
