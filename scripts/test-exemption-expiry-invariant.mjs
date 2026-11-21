#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: exemption-expiry-invariant 在「豁免標記既沒日期也沒指標」或「日期超過 N 天」時會紅、在有日期 / 有指標時不紅,
 *         長得像標記的東西(正規表示式、註解中段的提及、md 反引號與程式碼區塊、scripts 裡的偵測器定義)不算,
 *         標記的日期 / 指標只從它自己那段註解取(緊接的 `// @story-history: …` 這類另一段 `@名稱` 註解不算複查日、不算指標),
 *         而且它的綠燈來自真的掃到東西(標記數 > 0)而不是路徑或掃描器壞掉後的空集合
 *   紅: 把現行 checkbox.tsx 的 `@hover-transition-allow`(有 motion.spec.md 指標)的指標拿掉(突變)必須以 fresh 紅;
 *       把現行 radio-group.tsx 同一個標記的日期改成 now−181 天(突變)必須以「過期」紅;
 *       把現行 sidebar.stories.tsx 檔頭標記的複查續行拿掉(突變)→ 窗格不得撿到下一行 @story-history 的 2026-05-15(必須沒有日期);
 *       全樹任一窗格併進了另一段 `// @名稱` 行 → 紅;閘的 --selftest 正反例全過(含 @story-history 兩面);0 檔必須 INSTRUMENT-FAIL
 *   綠: 現況(套 baseline、now 釘在 baseline.recordedAt)0 筆新增;標記數 > 0;baseline 格式合法(reviewAfterDays 與閘一致);
 *        真正的複查續行(sidebar.stories.tsx 第 2 行)照舊算進窗格;
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

check('閘的 selftest 正反例全過(無主 / 過期紅、合法 / 有主放、長得像的不算、棘輪、時間輸入、0 檔判為儀器失效)', () => {
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

// ── 窗格只收自己那段註解(2026-11-21,WP-24):緊接的 `// @story-history: …` 是另一段,它的日期不是這個標記的複查日 ──
// 修前 sidebar / textarea / button / breadcrumb 的 stories 第 1 行都把第 2 行的 @story-history(2026-05-15 F-migration)當成複查日。
const SIDEBAR = 'packages/design-system/src/components/Sidebar/sidebar.stories.tsx'
const sidebarText = readFileSync(join(REPO, SIDEBAR), 'utf8')
check('兩面:sidebar.stories.tsx 檔頭標記 —— 真正的複查續行照舊認得;拿掉它(突變)後不得撿到下一行 @story-history 的日期', () => {
  const lines = sidebarText.split('\n')
  const reviewIdx = lines.findIndex((l, i) => i > 0 && i < 4 && /^\/\/\s+20\d{2}-\d{2}-\d{2} 複查/.test(l))
  const historyIdx = lines.findIndex((l) => /^\/\/\s*@story-history:.*\b20\d{2}-\d{2}-\d{2}\b/.test(l))
  assert.ok(lines[0].includes('@benchmark-unverified-blanket') && reviewIdx === 1 && historyIdx === 2,
    `錨點變了:sidebar.stories.tsx 應為「第 1 行標記 / 第 2 行複查續行 / 第 3 行帶日期的 @story-history」(請更新本突變的錨點)`)
  const reviewDate = /\b20\d{2}-\d{2}-\d{2}\b/.exec(lines[reviewIdx])[0]
  const real = scanText(sidebarText, SIDEBAR).find((m) => m.marker === '@benchmark-unverified-blanket')
  assert.ok(real && real.window.includes(lines[reviewIdx]) && !real.window.includes('@story-history'), `現行窗格應含複查續行、不含 @story-history,實得:${real?.window}`)
  const realVerdict = evaluate({ now: NOW, files: [{ rel: SIDEBAR, text: sidebarText }], registries: [], baseline }).markers.find((m) => m.line === 1)
  assert.equal(realVerdict?.newest, reviewDate, '真正的複查續行的日期要被認得')
  const mutated = lines.filter((_, i) => i !== reviewIdx).join('\n')
  const m = evaluate({ now: NOW, files: [{ rel: SIDEBAR, text: mutated }], registries: [], baseline }).markers.find((x) => x.line === 1)
  assert.equal(m?.newest, null, `拿掉複查續行後,窗格不得撿到 @story-history 的日期,實得 newest=${m?.newest}`)
})
check('全樹:沒有任何窗格把另一段 `// @名稱` 行併進來(而且真的有標記緊接著這種行,這題不是空轉)', () => {
  // 只看用「標記那一行 + 續行」取窗格的家族;cast 的窗格是上方緊接的註解、allowlist / registry 不是註解,規則不同
  const windowed = current.markers.filter((m) => ['escape', 'cq', 'eslint', 'ts'].includes(m.family))
  const merged = windowed.filter((m) => m.window.split('\n').slice(1).some((l) => /^\s*\/\/[ \t]*@[A-Za-z]/.test(l)))
  assert.deepEqual(merged.map((m) => `${m.file}:${m.line}`), [])
  let adjacent = 0
  for (const m of windowed) {
    if (!/^\s*\/\//.test(m.window)) continue
    const fileLines = readFileSync(join(REPO, m.file), 'utf8').split('\n')
    const next = fileLines[m.line - 1 + m.window.split('\n').length]
    if (next && /^\s*\/\/[ \t]*@[A-Za-z]/.test(next)) adjacent++
  }
  assert.ok(adjacent >= 3, `只有 ${adjacent} 個標記緊接著另一段 // @名稱 行 —— 量具可能沒在讀真實檔`)
})

check('時間是輸入:同一份輸入把 now 往前推 30 天,違規只會變少不會變多', () => {
  const earlier = evaluate({ now: new Date(NOW.getTime() - 30 * DAY) })
  assert.ok(earlier.violations.length <= current.violations.length)
  assert.deepEqual(earlier.fresh, [])
})

check('0 檔 → 判為儀器失效(沒量到 ≠ 沒有豁免)', () => {
  assert.equal(verdictOf(evaluate({ now: NOW, files: [], registries: [], baseline })).status, 'INSTRUMENT-FAIL')
})

console.log(`\n✓ exemption-expiry-invariant meta-test ${passed} 題全過;接著跑共用的「現況必綠 + --selftest 必紅」`)
// baseline 那一半把 now 釘在 recordedAt:這支證明的是儀器會紅,不是今天有沒有東西到期(那是閘自己的執行要講的)。
runGateSelftestMeta('scripts/exemption-expiry-invariant.mjs', { baseArgs: [`--now=${baseline.recordedAt}`], selftestArgs: ['--selftest', `--now=${baseline.recordedAt}`] })
