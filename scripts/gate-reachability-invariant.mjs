#!/usr/bin/env node
/**
 * 不變式:**寫了閘就要有人跑它。**
 *
 * 本 repo 反覆踩同一個病:spec 寫「由 xxx.mjs 機械強制」、腳本也真的存在、甚至還有包裝測試,
 * 但**沒有任何 CI workflow、npm script 或 hook 會呼叫它** —— 於是那條「機械強制」是假的,
 * 而且沒有任何訊號會告訴你。已知錨例:
 *   - 2026-09-18 推播閘:hook 存在、測試 6 個情境全綠,但整條路徑被 `requires: peer-cli` 擋掉,
 *     真實 session 從沒跑過(測試全都直接跑 hook 檔,沒走過真實入口)。
 *   - 2026-09-18 native/custom parity 閘:只掛在自述「非 required check」的 nightly。
 *   - ci.yml 註解自己記過兩次 distribute-column-widths / pagination 同一種病。
 *
 * 量法:把「執行面」當根(`.github/workflows/**`、`package.json`、`ds-canonical/hooks/**`、
 * `ds-canonical/skills/**`、`infra/governance/{test,lib}/**`),遞移展開它們提到的 `scripts/*.mjs`,
 * 算不出來的就是孤兒。名字像閘/測試的孤兒(`invariant|probe|audit|check|test-|gate`)才進判定 ——
 * 一次性工具腳本不在此列。
 *
 * **棘輪,不是一次到位**:現況有一批既有孤兒,一次全接進 CI 會同時炸開且無法評估落點。
 * 因此鎖 baseline(`scripts/gate-reachability-baseline.json`):**新增孤兒 = 紅**,既有孤兒清掉會提醒更新
 * baseline。數字只准往下,不准往上。要合法新增一支閘,就得同時把它接進某個執行面。
 *
 * @gate-contract
 *   保證: 名字像閘/測試的腳本,真的有執行面(CI / npm script / hook / skill)會呼叫它
 *   紅: 新增一支沒有任何人呼叫的閘(或把某支從 CI 拿掉)→ 本閘必須指名它並紅
 *   綠: 沒有新增孤兒時必須綠;selftest 每次都注入合成孤兒驗它會紅,所以綠燈不是因為量具壞了
 *
 * 用法:
 *   node scripts/gate-reachability-invariant.mjs              判定
 *   node scripts/gate-reachability-invariant.mjs --update-baseline   接好線之後重記
 *   node scripts/gate-reachability-invariant.mjs --selftest    對照組(注入一支合成孤兒,必須紅)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverGateMetaTestPairs } from './lib/gate-meta-test-inventory.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
const UPDATE = process.argv.includes('--update-baseline')
const BASELINE = join(ROOT, 'scripts', 'gate-reachability-baseline.json')
const GATE_LIKE = /invariant|probe|audit|check|^test-|gate/
const SYNTHETIC = 'synthetic-orphan-invariant.mjs'

const read = (p) => { try { return readFileSync(p, 'utf8') } catch { return '' } }
const walk = (dir, out = []) => {
  let entries; try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git') continue
    const full = join(dir, name)
    let info; try { info = statSync(full) } catch { continue }
    if (info.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

// 執行面 = 真的會把腳本跑起來的地方
const executionSurfaces = [
  ...walk(join(ROOT, '.github/workflows')),
  join(ROOT, 'package.json'),
  ...walk(join(ROOT, 'packages/design-system/ds-canonical/hooks')),
  ...walk(join(ROOT, 'packages/design-system/ds-canonical/skills')),
  ...walk(join(ROOT, 'infra/governance/test')),
  ...walk(join(ROOT, 'infra/governance/lib')),
  // harness 套件的成員清單:governance-harnesses.yml(夜間)→ run-harnesses.mjs → 這份 inventory,
  // 逐一把成員跑起來。它是真的執行面,只是入口在 providers/ 而不是 workflows/ ——
  // 漏掉它會讓 22 支真的每晚都在跑的測試被誤判成「沒人呼叫的孤兒」(2026-09-21)。
  join(ROOT, 'infra/governance/providers/harness-source-inventory.json'),
].filter((p) => /\.(ya?ml|json|sh|mjs|md)$/.test(p))
const corpus = executionSurfaces.map(read).join('\n')

const SELF = 'gate-reachability-invariant.mjs'
const scripts = readdirSync(join(ROOT, 'scripts')).filter((f) => f.endsWith('.mjs'))
// 量具自己不當「呼叫者」:它的原始碼提到 baseline 裡每一支孤兒的檔名(還有對照組的合成名),
// 不排除的話它一被接進 CI,就會把所有它列出來的孤兒都「變成可達」——量具把自己量綠。
// 2026-09-18 實測:接進 CI 後對照組立刻假綠,就是這個自我參照。
const source = Object.fromEntries(scripts.filter((f) => f !== SELF).map((f) => [f, read(join(ROOT, 'scripts', f))]))
if (SELFTEST) { scripts.push(SYNTHETIC); source[SYNTHETIC] = '// 合成孤兒:沒有任何執行面提到它\n' }

// 執行面直接提到的算可達(量具自己被 CI 呼叫,所以它本身是可達的)
const reachable = new Set(scripts.filter((f) => corpus.includes(f)))

// gate-meta pair 是**動態探索**出來的:run-gate-meta-tests.mjs 掃 `scripts/test-<stem>.mjs`
// 且 `scripts/<stem>.mjs` 存在者全跑,沒有任何地方會字面提到它們的檔名。
// 只看「有沒有被字面提到」會把這些全判成孤兒 —— 那是拿「被提到」當「會被跑」的替身,
// 跟這支閘自己要守的病同一種(2026-09-21:41 支新 meta-test 全被誤判成孤兒)。
// 前提是探索器自己得先可達:它若沒人跑,它探索出來的東西也不會被跑。
const GATE_META_RUNNER = 'run-gate-meta-tests.mjs'
if (reachable.has(GATE_META_RUNNER)) {
  // 用同一支探索實作,不另寫一份規則(M17:同公式不得有第二個住所)。
  for (const { file } of discoverGateMetaTestPairs(ROOT)) reachable.add(file)
} else {
  console.log(`⚠️  ${GATE_META_RUNNER} 自己不可達 —— 它探索出來的 meta-test 一律照孤兒計`)
}
for (let changed = true; changed;) {
  changed = false
  for (const f of scripts) {
    if (reachable.has(f)) continue
    for (const r of reachable) if (source[r]?.includes(f)) { reachable.add(f); changed = true; break }
  }
}
const orphans = scripts.filter((f) => !reachable.has(f) && GATE_LIKE.test(f)).sort()

// 「刻意只手動跑」的理由帳(2026-09-27):孤兒不是只有「還沒接線」一種 —— 有的是給人看截圖的探針,CI 沒有斷言可判。
// 那種要**寫得出原因**(引得出同一件事的 CI 閘是哪一支、這支為什麼只能人看)才准留在 baseline 裡;沒寫的一律算「待接線或退役」。
// 重記(--update-baseline)時只保留仍是孤兒的條目;已接線的自動掉出。
const readManualOnly = (json) => {
  const entries = Object.entries(json.manualOnly ?? {})
  for (const [file, why] of entries) {
    if (typeof why !== 'string' || why.trim().length < 20) { console.error(`✗ baseline.manualOnly["${file}"] 的理由必須是一段引得出原因的文字(≥ 20 字),實得 ${JSON.stringify(why)}`); process.exit(2) }
  }
  return Object.fromEntries(entries)
}

if (UPDATE) {
  const previous = existsSync(BASELINE) ? readManualOnly(JSON.parse(read(BASELINE))) : {}
  const manualOnly = Object.fromEntries(Object.entries(previous).filter(([f]) => orphans.includes(f)))
  writeFileSync(BASELINE, JSON.stringify({
    note: '寫了閘就要有人跑它。這裡記的是「目前沒有任何執行面會呼叫」的閘/測試腳本。數字只准往下 —— 新增孤兒會讓 gate-reachability-invariant.mjs 變紅。清掉既有孤兒(接進 CI 或退役)之後跑 --update-baseline 重記。manualOnly:刻意只手動跑的那幾支,每支都要寫得出原因(同一件事的 CI 閘是哪一支、為什麼只能人看);沒寫的算待接線或退役。',
    generatedBy: 'scripts/gate-reachability-invariant.mjs --update-baseline',
    count: orphans.length,
    orphans,
    manualOnly,
  }, null, 2) + '\n')
  console.log(`baseline 已更新:${orphans.length} 支孤兒(其中 ${Object.keys(manualOnly).length} 支刻意只手動跑)→ ${BASELINE.replace(ROOT + '/', '')}`)
  process.exit(0)
}

if (!existsSync(BASELINE)) { console.error(`✗ 找不到 baseline(${BASELINE})—— 先跑 --update-baseline`); process.exit(2) }
const baseline = JSON.parse(read(BASELINE))
const known = new Set(baseline.orphans || [])
const manualOnly = readManualOnly(baseline)
const added = orphans.filter((f) => !known.has(f))
const fixed = [...known].filter((f) => !orphans.includes(f))
// 理由帳裡的檔已經有人呼叫了 → 帳過期(它不再是孤兒,理由也不該再掛著)
const staleManual = Object.keys(manualOnly).filter((f) => !orphans.includes(f))
const pending = orphans.filter((f) => !(f in manualOnly))

console.log(`掃描 ${scripts.length} 支 scripts/*.mjs;執行面(CI / package.json / hooks / skills / infra)可達 ${reachable.size} 支`)
console.log(`名字像閘/測試卻沒人呼叫:${orphans.length} 支(baseline ${baseline.count};其中刻意只手動跑、理由已記 ${Object.keys(manualOnly).length - staleManual.length} 支)`)
for (const [f, why] of Object.entries(manualOnly)) if (orphans.includes(f)) console.log(`  · 刻意只手動跑:scripts/${f} —— ${why}`)
if (fixed.length) console.log(`↓ 已接好線或已退役 ${fixed.length} 支:${fixed.slice(0, 8).join(', ')}${fixed.length > 8 ? ' …' : ''}\n   → 跑 --update-baseline 把它們從 baseline 移除,數字才會真的往下`)
for (const f of staleManual) console.log(`  ✗ manualOnly 記的 scripts/${f} 已有執行面呼叫,理由帳過期 —— 跑 --update-baseline 重記`)
for (const f of added) console.log(`  ✗ 新增孤兒:scripts/${f} —— 沒有任何 CI workflow / npm script / hook 會呼叫它,它宣稱的保護不存在`)

if (SELFTEST) {
  if (added.includes(SYNTHETIC)) { console.log('\n✓ selftest:合成孤兒被抓到,量具會紅'); process.exit(0) }
  console.log('\n✗ selftest:合成孤兒沒被抓到 —— 這支是假綠,不能當證據'); process.exit(1)
}
if (staleManual.length) { console.log(`\n✗ ${staleManual.length} 支 manualOnly 理由帳過期`); process.exit(1) }
if (orphans.length === 0 && baseline.count === 0) { console.log('\n✓ 每一支閘/測試都有執行面會呼叫'); process.exit(0) }
if (added.length) { console.log(`\n✗ ${added.length} 支新增孤兒 —— 新寫的閘必須同時接進某個執行面`); process.exit(1) }
console.log(`\n✓ 沒有新增孤兒(既有 ${pending.length} 支待逐步接線或退役、${orphans.length - pending.length} 支刻意只手動跑且理由已記,數字只准往下)`)
process.exit(0)
