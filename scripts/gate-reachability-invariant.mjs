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
for (let changed = true; changed;) {
  changed = false
  for (const f of scripts) {
    if (reachable.has(f)) continue
    for (const r of reachable) if (source[r]?.includes(f)) { reachable.add(f); changed = true; break }
  }
}
const orphans = scripts.filter((f) => !reachable.has(f) && GATE_LIKE.test(f)).sort()

if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify({
    note: '寫了閘就要有人跑它。這裡記的是「目前沒有任何執行面會呼叫」的閘/測試腳本。數字只准往下 —— 新增孤兒會讓 gate-reachability-invariant.mjs 變紅。清掉既有孤兒(接進 CI 或退役)之後跑 --update-baseline 重記。',
    generatedBy: 'scripts/gate-reachability-invariant.mjs --update-baseline',
    count: orphans.length,
    orphans,
  }, null, 2) + '\n')
  console.log(`baseline 已更新:${orphans.length} 支孤兒 → ${BASELINE.replace(ROOT + '/', '')}`)
  process.exit(0)
}

if (!existsSync(BASELINE)) { console.error(`✗ 找不到 baseline(${BASELINE})—— 先跑 --update-baseline`); process.exit(2) }
const baseline = JSON.parse(read(BASELINE))
const known = new Set(baseline.orphans || [])
const added = orphans.filter((f) => !known.has(f))
const fixed = [...known].filter((f) => !orphans.includes(f))

console.log(`掃描 ${scripts.length} 支 scripts/*.mjs;執行面(CI / package.json / hooks / skills / infra)可達 ${reachable.size} 支`)
console.log(`名字像閘/測試卻沒人呼叫:${orphans.length} 支(baseline ${baseline.count})`)
if (fixed.length) console.log(`↓ 已接好線或已退役 ${fixed.length} 支:${fixed.slice(0, 8).join(', ')}${fixed.length > 8 ? ' …' : ''}\n   → 跑 --update-baseline 把它們從 baseline 移除,數字才會真的往下`)
for (const f of added) console.log(`  ✗ 新增孤兒:scripts/${f} —— 沒有任何 CI workflow / npm script / hook 會呼叫它,它宣稱的保護不存在`)

if (SELFTEST) {
  if (added.includes(SYNTHETIC)) { console.log('\n✓ selftest:合成孤兒被抓到,量具會紅'); process.exit(0) }
  console.log('\n✗ selftest:合成孤兒沒被抓到 —— 這支是假綠,不能當證據'); process.exit(1)
}
if (orphans.length === 0 && baseline.count === 0) { console.log('\n✓ 每一支閘/測試都有執行面會呼叫'); process.exit(0) }
if (added.length) { console.log(`\n✗ ${added.length} 支新增孤兒 —— 新寫的閘必須同時接進某個執行面`); process.exit(1) }
console.log('\n✓ 沒有新增孤兒(既有 ' + orphans.length + ' 支待逐步接線或退役,數字只准往下)')
process.exit(0)
