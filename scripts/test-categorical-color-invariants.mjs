#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: categorical-color-invariants 這支閘在該紅的時候真的會紅(不是恆綠),且現行檔案下是綠的。
 *   紅: 閘對「色相偷換」或「深色 step-2 退回舊公式」任一種注入沒有紅 → 印出哪一組對照失效並 exit 1。
 *   綠: 現況綠、兩組注入都紅、還原後綠。不是抽籤 —— 注入是固定字串替換(色相注入寫回原檔並在 finally 還原;
 *       色階注入寫在暫存目錄、用環境變數指過去,不動 repo 檔),重複跑結果恆等。
 */
// meta-test for categorical-color-invariants — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
// 驗 I1 名實一致(零 offset):map 的 key X 值只能引用 --color-X-*;把 CAT_SUBTLE.blue 的
// bg token 從 --color-blue-1 偷換成 --color-red-1(categorical-vs-semantic 混淆的真實故障模式)
// → gate I1 應抓「引用了 --color-red-*(應為 --color-blue-*)」→ exit 1。finally 還原原檔。
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = () => spawnSync(process.execPath, ['--', 'scripts/categorical-color-invariants.mjs'], { stdio: 'pipe' }).status ?? 1
let ok = true

// 1) 現況必 PASS
if (run() !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ baseline PASS')

// 2) 注入違規 → 必 FAIL → 還原
const target = 'packages/design-system/src/tokens/categorical-color.ts'
const NEEDLE = "blue: 'bg-[var(--color-blue-1)] text-[var(--color-blue-7)]',"
const POISON = "blue: 'bg-[var(--color-red-1)] text-[var(--color-blue-7)]',"
const orig = readFileSync(target, 'utf8')
try {
  const mutated = orig.replace(NEEDLE, POISON)
  if (mutated === orig) { console.error('✗ 注入 no-op(NEEDLE 未命中,injection 失效)'); process.exit(1) }
  writeFileSync(target, mutated)
  const code = run()
  if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(I1 detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run() !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log('✓ 還原後 PASS')

// 4) I5 色階順序對照組(2026-09-26):把深色 step-2 換回舊公式(往純黑退 l×0.28)的 primitives 副本
//    —— 寫在暫存目錄、用環境變數指過去,不動 repo 檔 → I5 必紅;原檔 → I5 必綠(上面第 1 步已含)
{
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const prim = readFileSync('packages/design-system/src/tokens/color/primitives.css', 'utf8')
  const OLD_STEP2 = ') calc(l * 0.28) calc(c * 0.65) h);'
  const poisoned = prim.replace(/\) l c h \/ calc\(0\.18 \/ l\)\);/g, OLD_STEP2)
  if (poisoned === prim) { console.error('✗ I5 注入 no-op(深色 step-2 公式未命中)'); process.exit(1) }
  const dir = mkdtempSync(join(tmpdir(), 'cat-color-'))
  try {
    const file = join(dir, 'primitives.css')
    writeFileSync(file, poisoned)
    const r = spawnSync(process.execPath, ['--', 'scripts/categorical-color-invariants.mjs'], { stdio: 'pipe', env: { ...process.env, CATEGORICAL_COLOR_PRIMITIVES: file } })
    const out = String(r.stdout) + String(r.stderr)
    if ((r.status ?? 1) === 0 || !/✗ I5 \| dark /.test(out)) { console.error('✗ 深色 step-2 退回舊公式後 I5 未紅(色階順序 detection 失效)'); ok = false }
    else console.log('✓ 深色 step-2 退回舊公式 → I5 紅')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// 5) I4 實心底字色原則對照組(2026-11-26):原則是「白字對比不低於綠色 → 白,低於 → 深」,門檻由 primitives 現算。
//    每一組都要「紅」而且「點名對的那一格」;門檻那一行每次都會印,用它證明門檻是現算的(綠色一動,門檻跟著動)。
const { mkdtempSync, rmSync } = await import('node:fs')
const { join } = await import('node:path')
const { tmpdir } = await import('node:os')
const runOut = (env = {}) => {
  const r = spawnSync(process.execPath, ['--', 'scripts/categorical-color-invariants.mjs'], { stdio: 'pipe', env: { ...process.env, ...env } })
  return { status: r.status ?? 1, out: String(r.stdout) + String(r.stderr) }
}
const thresholdLine = (out) => (out.match(/^I4 門檻 = .*$/m) ?? [''])[0]
const baselineThreshold = thresholdLine(runOut().out)
if (!/淺 \d\.\d\d \/ 深 \d\.\d\d/.test(baselineThreshold)) { console.error(`✗ 現況印不出門檻行(拿到「${baselineThreshold}」)`); process.exit(1) }

// 5a/5b) 字色放錯桶:turquoise 放回深字(2026-07-16 的錯)、amber 改白字 —— 寫回原檔、finally 還原
for (const [label, needle, poison, expect] of [
  ['turquoise 放回深字', "turquoise: 'bg-[var(--color-turquoise-6)] text-on-emphasis',", "turquoise: 'bg-[var(--color-turquoise-6)] text-on-emphasis-dark',", /✗ I4 \| CAT_SOLID\.turquoise 字色 = 白字/],
  ['amber 改白字', "amber: 'bg-[var(--color-amber-6)] text-on-emphasis-dark',", "amber: 'bg-[var(--color-amber-6)] text-on-emphasis',", /✗ I4 \| CAT_SOLID\.amber 字色 = 深字/],
]) {
  const before = readFileSync(target, 'utf8')
  try {
    const mutated = before.replace(needle, poison)
    if (mutated === before) { console.error(`✗ ${label}:注入 no-op(NEEDLE 未命中)`); process.exit(1) }
    writeFileSync(target, mutated)
    const r = runOut()
    if (r.status === 0 || !expect.test(r.out) || !/user 決定的原則/.test(r.out)) { console.error(`✗ ${label} 後 I4 沒有紅在那一格(或訊息沒寫明是 user 決定的原則)`); ok = false }
    else console.log(`✓ ${label} → I4 紅並點名那一格`)
  } finally {
    writeFileSync(target, before)
  }
}

// 5c/5d) primitives 副本(暫存目錄 + 環境變數,不動 repo 檔)
const primSrc = readFileSync('packages/design-system/src/tokens/color/primitives.css', 'utf8')
const shiftL = (css, hue, delta) => css.replace(new RegExp(`(--color-${hue}-6:\\s*oklch\\()([\\d.]+)`, 'g'), (_, head, l) => `${head}${(+l + delta).toFixed(2)}`)
const tmp = mkdtempSync(join(tmpdir(), 'cat-solid-'))
try {
  // 5c) 綠色調暗到比橘色暗(兩個模式 L −0.10)、橘色仍白 → 門檻上移、orange 該換桶 → 紅,門檻行與現況不同
  const greenDarker = shiftL(primSrc, 'green', -0.10)
  if (greenDarker === primSrc) { console.error('✗ 綠色注入 no-op'); process.exit(1) }
  writeFileSync(join(tmp, 'green.css'), greenDarker)
  const g = runOut({ CATEGORICAL_COLOR_PRIMITIVES: join(tmp, 'green.css') })
  const moved = thresholdLine(g.out)
  if (g.status === 0 || moved === baselineThreshold || !/✗ I4 \| CAT_SOLID\.orange /.test(g.out) || !/✗ I4 \| orange 換桶檢查/.test(g.out)) {
    console.error(`✗ 綠色調暗後門檻沒跟著移或 orange 沒紅(現況「${baselineThreshold}」→ 注入後「${moved}」)`); ok = false
  } else console.log(`✓ 綠色調暗 → 門檻跟著移(「${baselineThreshold}」→「${moved}」),orange 換桶並紅`)

  // 5d) 某色相自己變暗跨過門檻(amber 兩個模式 L −0.25)→ 換桶格紅並寫明需 user 確認(閘不自動換)
  const amberDarker = shiftL(primSrc, 'amber', -0.25)
  writeFileSync(join(tmp, 'amber.css'), amberDarker)
  const a = runOut({ CATEGORICAL_COLOR_PRIMITIVES: join(tmp, 'amber.css') })
  if (a.status === 0 || !/✗ I4 \| amber 換桶檢查[^\n]*需 user 確認/.test(a.out)) { console.error('✗ amber 調暗跨過門檻後換桶格沒紅(或沒寫「需 user 確認」)'); ok = false }
  else console.log('✓ amber 調暗跨過門檻 → 換桶格紅並寫明需 user 確認')

  // 6) I6 寫死實心底字色:暫存檔寫死 orange-6 底配 text-white → 紅並點名;同一行帶 @cat-solid-ok: 理由 → 不點名
  const fixture = join(tmp, 'hardcoded-solid.tsx')
  writeFileSync(fixture, [
    'export const Bad = () => <span className="bg-[var(--color-orange-6)] text-white">設計</span>',
    'export const Ok = () => <span className="bg-[var(--color-lime-6)] text-black">設計</span> // @cat-solid-ok: 對照組',
  ].join('\n'))
  const h = runOut({ CATEGORICAL_COLOR_SCAN_EXTRA: fixture })
  if (h.status === 0 || !new RegExp(`✗ I6 \\|[^\\n]*hardcoded-solid\\.tsx:1`).test(h.out) || /hardcoded-solid\.tsx:2/.test(h.out)) { console.error('✗ 寫死 orange-6 底配 text-white 沒被 I6 點名(或帶特例記號的那一行也被點名)'); ok = false }
  else console.log('✓ 寫死 orange-6 底配 text-white → I6 紅並點名檔:行;帶 @cat-solid-ok 的那一行放行')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

// 7) 全部還原後必 PASS
if (runOut().status !== 0) { console.error('✗ 對照組還原後應 PASS'); process.exit(1) }
console.log('✓ 對照組還原後 PASS')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
