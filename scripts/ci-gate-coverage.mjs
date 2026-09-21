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
  // 2026-09-21 全部修好並接進 CI 的 governance-control-plane job,因此**不再列為例外**:
  //   test:waived-self-review / test:governance-evidence-control-plane —— 同源:harness 來源清單未閉合
  //     (7 支 test-*.mjs 沒分類 + 一支測試自己用 new Function/--eval 違反來源政策,把整個 runner 擋住)
  //   test:provider-neutral-residue —— 8 筆 provider 專屬措辭缺 adapter/provenance 揭露
  //   test:governance-control-plane —— hook 語料總數寫死 61(實際 62)+ 全庫散落的空 .claude/.cc-writes 殘留
  // 留下這段註解是要記住:它們當初被列成例外的理由是「目前是紅的」,而那正是最不該放行的理由 ——
  // 紅燈沒有觀眾,就永遠不會有人修。
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

// 母體 = `test:*` **與** `check:*`。
// 2026-09-21 補 `check:*` 的理由:`check:bundle-size` 與 `check:naming-structure` 兩支都是
// 會 exit(1) 的閘,都只註冊成 npm script、沒有任何 workflow 呼叫,於是一個從 2026-07-14、
// 一個從 2026-08-05 起就是紅的而沒有人看見。`check:` 跟 `test:` 一樣是「宣告這要被跑」的前綴。
const tests = Object.keys(pkg).filter((k) => k.startsWith('test:') || k.startsWith('check:'))
const missing = tests.filter((k) => !reachable.has(k) && !NOT_A_PR_GATE.has(k))
const excused = tests.filter((k) => NOT_A_PR_GATE.has(k))

console.log(`test:* / check:* 共 ${tests.length} 支;CI 觸達 ${tests.length - missing.length - excused.length},明列例外 ${excused.length},未觸達 ${missing.length}`)
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
  console.error(`\n✗ 下列 test:* / check:* 沒有任何 CI workflow 觸達得到 —— 註冊成 test 就是宣告「這要被跑」:`)
  missing.forEach((k) => console.error(`  ${k}  →  ${pkg[k].slice(0, 100)}`))
  console.error('\n  修法二擇一:接進 .github/workflows,或寫進本檔 NOT_A_PR_GATE 並說明原因。')
  process.exit(1)
}
console.log('✓ 每一支 test:* / check:* 都有 CI 觸達得到')
