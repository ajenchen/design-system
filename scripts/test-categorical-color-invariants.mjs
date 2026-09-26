#!/usr/bin/env node
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

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
