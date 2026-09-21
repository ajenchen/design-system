#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 「閘要有對照組」的共用跑法,能正確分辨四種局面 ——
 *         缺前置(快照裡沒有 storybook-static)/ 起不了瀏覽器 / 閘真的紅 / 閘是假綠。
 *         最關鍵的是**前兩種不得被報成「產品壞掉」**,後兩種不得被略過吃掉。
 *   紅: 把「認訊息」那一段拆掉退回只認退出碼 2 的第一版 → 前兩格立刻紅
 *       (2026-09-21 實測驗過:拆掉紅、還原綠)。
 *   綠: 七種局面全對時綠。不是抽籤 —— 用**合成假閘**(退出碼與輸出都由測試指定),
 *        不開瀏覽器、不依賴任何建置產物,同一份 worktree 重複跑結果恆等。
 *
 * meta-test for lib/gate-selftest-meta.mjs —— 共用的「閘要有對照組」跑法本身也要有對照組。
 *
 * **為什麼需要(2026-09-21)**:gate-meta lane 是在 repo 的**拋棄式快照**裡跑的,
 * 而 `storybook-static` 是 gitignore 的建置產物、快照裡不存在。缺它的時候各閘的退出碼
 * **並不一致**(實測 focus-indicator 是 2、pagination 與 agent-fab-hit-area 是 1)。
 * 第一版只認退出碼 2,於是退出碼 1 的那些會被誤報成「baseline 應該綠卻紅」——
 * **把「缺前置」當成「產品壞了」**,正是這一整批在修的同一種病。
 *
 * 四種局面都要對:缺前置 → 略過;起不了環境 → 略過;真的紅 → 紅;正常 → 綠。
 * 用合成的假閘(退出碼與訊息都由測試指定)驗,不依賴任何真實建置產物。
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const work = mkdtempSync(join(tmpdir(), 'gate-selftest-meta-'))
let fail = 0

/** 造一支假閘:baseline 與 --selftest 各自的退出碼與輸出都可指定。 */
function fakeGate(name, { baseCode, baseOut, selfCode = 0, selfOut = '' }) {
  mkdirSync(join(work, 'scripts', 'lib'), { recursive: true })
  writeFileSync(join(work, 'scripts', `${name}.mjs`), `
const selftest = process.argv.includes('--selftest')
if (selftest) { console.log(${JSON.stringify(selfOut)}); process.exit(${selfCode}) }
console.log(${JSON.stringify(baseOut)}); process.exit(${baseCode})
`)
  return `scripts/${name}.mjs`
}

function runMeta(gatePath) {
  const runner = join(work, 'scripts', 'run-meta.mjs')
  writeFileSync(runner, `
import { runGateSelftestMeta } from ${JSON.stringify(join(REPO_ROOT, 'scripts/lib/gate-selftest-meta.mjs'))}
runGateSelftestMeta(${JSON.stringify(gatePath)})
`)
  const r = spawnSync(process.execPath, ['--', 'scripts/run-meta.mjs'], { cwd: work, encoding: 'utf8' })
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

const CASES = [
  ['缺 storybook-static 且退出碼 1 → 略過(不得報成產品壞掉)',
   { baseCode: 1, baseOut: '✗ storybook-static missing. Run `npm run build-storybook` first.' },
   (r) => r.status === 0 && /缺 storybook-static/.test(r.out),
   '快照裡沒有建置產物,退出碼 1 的閘不得被誤判成紅'],
  ['缺 storybook-static 且退出碼 2 → 略過',
   { baseCode: 2, baseOut: '✗ storybook-static missing. Run `npm run build-storybook` first.' },
   (r) => r.status === 0 && /缺 storybook-static/.test(r.out), '同上,只是退出碼不同'],
  ['建置過時(STALE-BUILD)→ 略過',
   { baseCode: 2, baseOut: '✗ STALE-BUILD:原始碼比 storybook-static 新' },
   (r) => r.status === 0, '過時也是缺前置'],
  ['閘沒有守衛、直接 ENOENT 崩在 storybook-static 上 → 略過(2026-09-21 夜間 lane 實測的第三種形狀)',
   { baseCode: 1, baseOut: "Error: ENOENT: no such file or directory, lstat '/tmp/snapshot/repo/storybook-static'" },
   (r) => r.status === 0 && /缺 storybook-static/.test(r.out),
   '全庫 50+ 支用到 storybook-static 的腳本沒有存在性守衛,崩潰形狀也必須認得'],
  ['ENOENT 但不是 storybook-static → 不得當成略過(這是真失敗)',
   { baseCode: 1, baseOut: "Error: ENOENT: no such file or directory, open '/repo/packages/design-system/src/missing.tsx'" },
   (r) => r.status === 1 && /baseline 應該綠卻紅/.test(r.out),
   '判準必須兩個條件同時成立,否則會把真失敗吃掉'],
  ['提到 storybook-static 但不是檔案不存在 → 不得當成略過',
   { baseCode: 1, baseOut: '✗ storybook-static 裡有 3 個 story 的焦點框顏色不對' },
   (r) => r.status === 1 && /baseline 應該綠卻紅/.test(r.out),
   '同上,反方向的對照'],
  ['起不了瀏覽器 → 略過',
   { baseCode: 0, baseOut: '⚠️ SKIPPED-ENV: 無法啟動 Chromium' },
   (r) => r.status === 0 && /起不了環境/.test(r.out), '環境問題不得指控產品'],
  ['一切正常 → 綠',
   { baseCode: 0, baseOut: '✅ PASS', selfCode: 0, selfOut: '✓ selftest:合成違規被抓到' },
   (r) => r.status === 0 && /baseline PASS/.test(r.out) && /對照組被抓到/.test(r.out), '兩半都成立才算綠'],
  ['baseline 真的紅 → 紅(不得被略過吃掉)',
   { baseCode: 1, baseOut: '✗ 有 3 條不變式失敗' },
   (r) => r.status === 1 && /baseline 應該綠卻紅/.test(r.out), '真失敗必須照樣紅'],
  ['對照組抓不到 → 紅(閘是假綠)',
   { baseCode: 0, baseOut: '✅ PASS', selfCode: 1, selfOut: '✗ selftest:合成違規沒被抓到' },
   (r) => r.status === 1 && /零證據/.test(r.out), '對照組失效必須紅'],
]

for (const [name, spec, want, why] of CASES) {
  const gate = fakeGate(`fake-${CASES.indexOf(CASES.find((c) => c[0] === name))}`, spec)
  const r = runMeta(gate)
  if (want(r)) console.log(`✓ ${name}`)
  else { console.log(`✗ ${name} —— ${why}\n   exit=${r.status}\n${r.out.split('\n').filter(Boolean).map((l) => '   ' + l).join('\n')}`); fail += 1 }
}

rmSync(work, { recursive: true, force: true })
console.log(fail ? `\n✗ ${fail} 項不符` : '\n✅ gate-selftest-meta PASS(缺前置 / 環境 / 真紅 / 假綠 四種局面都對)')
process.exit(fail ? 1 : 0)
