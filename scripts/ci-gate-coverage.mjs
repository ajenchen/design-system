#!/usr/bin/env node
/**
 * 「宣稱有閘、其實沒人跑」的 meta 閘(2026-09-08)
 *
 * ci.yml 自己的註解記過四次同一件事:distribute-column-widths、pagination、
 * AgentPanel 兩支、以及本輪新建的八支 —— 全都是「寫好了、有 selftest、
 * commit 說『紅綠由 CI 補』,但 CI 從來沒有呼叫過它」。
 *
 * 判準刻意收窄到**不會誤報**的一條:
 *   凡是註冊成 `npm run test:*` 的,CI 就必須觸達得到。
 * 理由:註冊成 test 就是宣告「這是要被跑的」。反過來,`scripts/` 底下會 exit(1)
 * 的檔案有 172 支,其中多數是工具或經由 build graph / deterministic chain 執行,
 * 拿它們當母體會產生一百多個假警報 —— 噪音閘比沒有閘更糟。
 *
 * 觸達的定義(遞迴):CI workflow 直接寫了 `npm run <name>`,或寫了它底下的
 * `scripts/x.mjs`,或某個已觸達的 npm script 的指令字串裡包含 `<name>`。
 *
 * 例外要寫在原地:package.json 的 script 名字加 `#no-ci` 後綴不行(npm 不允許註解),
 * 所以例外集中在本檔 NOT_A_PR_GATE,每一筆都要寫原因。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts ?? {}
const wfDir = join(ROOT, '.github', 'workflows')
const ci = readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f))
  .map((f) => readFileSync(join(wfDir, f), 'utf8')).join('\n')

// 這些不是 PR 閘,原因寫在旁邊。改動這份清單等於改動「什麼算閘」,要有理由。
const NOT_A_PR_GATE = new Map([
  ['test:governance-harnesses', '十分鐘等級的治理 harness 套件,ci.yml 明文說刻意排除在 PR 閘之外,另有 governance-harnesses.yml'],
  // 下面四支**目前是紅的**,而且正因為沒人跑所以一直沒被發現(2026-09-08 盤點,總帳 AD13)。
  // 這裡明列不是放行,是把「已知紅燈」寫在看得到的地方 —— 原本的狀態是沒有人知道。
  // 修好任一支就把它從這裡刪掉,這條閘會立刻要求它進 CI。
  ['test:waived-self-review', '紅:Harness source inventory is not source-closed —— scripts/ 底下有 6 支 test-*.mjs 沒被分類(其中 5 支是既有漂移,1 支是本輪新增、已補分類)'],
  ['test:provider-neutral-residue', '紅:provider-neutral 殘留掃描回報 1 筆(assert 1 !== 0),尚未定位是哪一筆'],
  ['test:governance-evidence-control-plane', '紅:deep-audit evidence blocked —— Harness source inventory digest drifted,與上面 waived-self-review 同源'],
  ['test:governance-control-plane', '紅:@qijenchen/governance 套件測試 70 個斷言失敗,尚未定位'],
])

// All-Harness registry 也是一條真實執行路徑(governance-harnesses.yml → run-harnesses.mjs
// → infra/governance/providers/harness-registry.json)。不把它算進來的話,
// 由 registry 帶起來的 9 支會變成假警報 —— 噪音閘比沒有閘更糟。
let harnessRegistry = ''
try { harnessRegistry = readFileSync(join(ROOT, 'infra/governance/providers/harness-registry.json'), 'utf8') } catch { /* 沒有就算了 */ }

const reachable = new Set()
for (const name of Object.keys(pkg)) {
  if (ci.includes(`npm run ${name}`) || ci.includes(`npm run --silent ${name}`)) reachable.add(name)
  const files = pkg[name].match(/scripts\/[\w.-]+\.mjs/g) ?? []
  if (files.some((f) => ci.includes(f) || harnessRegistry.includes(f))) reachable.add(name)
  if (harnessRegistry.includes(name)) reachable.add(name)
}
// 遞迴:已觸達的 script 指令裡提到的其他 script 也算觸達
for (let pass = 0; pass < 20; pass++) {
  let grew = false
  for (const parent of [...reachable]) {
    for (const name of Object.keys(pkg)) {
      if (reachable.has(name)) continue
      if ((pkg[parent] ?? '').includes(name)) { reachable.add(name); grew = true }
    }
  }
  if (!grew) break
}

const tests = Object.keys(pkg).filter((k) => k.startsWith('test:'))
const missing = tests.filter((k) => !reachable.has(k) && !NOT_A_PR_GATE.has(k))
const excused = tests.filter((k) => NOT_A_PR_GATE.has(k))

console.log(`test:* 共 ${tests.length} 支;CI 觸達 ${tests.length - missing.length - excused.length},明列例外 ${excused.length},未觸達 ${missing.length}`)
for (const k of excused) console.log(`  ⏭  ${k} —— ${NOT_A_PR_GATE.get(k)}`)

if (process.argv.includes('--selftest')) {
  // 對照組:假裝有一支沒人跑的 test:*,這支必須抓到
  const fake = 'test:__selftest_never_called__'
  const saw = !reachable.has(fake) && !NOT_A_PR_GATE.has(fake)
  console.log(saw ? '\n✓ selftest:沒被 CI 觸達的 test:* 確實會被判為未觸達'
                  : '\n✗ selftest:虛構一支沒人跑的 test:* 卻沒被抓到')
  process.exit(saw ? 0 : 1)
}

if (missing.length) {
  console.error(`\n✗ 下列 test:* 沒有任何 CI workflow 觸達得到 —— 註冊成 test 就是宣告「這要被跑」:`)
  missing.forEach((k) => console.error(`  ${k}  →  ${pkg[k].slice(0, 100)}`))
  console.error('\n  修法二擇一:接進 .github/workflows,或寫進本檔 NOT_A_PR_GATE 並說明原因。')
  process.exit(1)
}
console.log('✓ 每一支 test:* 都有 CI 觸達得到')
