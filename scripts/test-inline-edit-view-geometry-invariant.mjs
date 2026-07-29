#!/usr/bin/env node
// meta-test for inline-edit-view-geometry-invariant — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
// 2026-07-28 對齊 token 級合約:invariant 現逐 size 驗「fieldViewGeometry 多行 py ==
// Textarea edit py == py-[var(--field-control-py-N)]」+ uiSize.css 公式未漂移,
// 故注入也升級為 (a) class 漂移 (b) token 公式漂移 兩種。
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = () => spawnSync(process.execPath, ['--', 'scripts/inline-edit-view-geometry-invariant.mjs'], { stdio: 'pipe' }).status ?? 1
let ok = true

// 1) 現況必 PASS
if (run() !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }

// 2) 注入違規 → 必 FAIL → 還原
const MUTATIONS = [
  {
    label: 'field-wrapper 多行 md py 從 token 漂回字面值',
    target: 'packages/design-system/src/components/Field/field-wrapper.tsx',
    from: "multiline && size === 'md' && 'py-[var(--field-control-py-md)]'",
    to: "multiline && size === 'md' && 'py-2'",
  },
  {
    label: 'uiSize.css token 公式丟失 −1px 邊框修正',
    target: 'packages/design-system/src/tokens/uiSize/uiSize.css',
    from: '--field-control-py-md: calc((var(--field-height-md) - 1lh) / 2 - 1px);',
    to: '--field-control-py-md: calc((var(--field-height-md) - 1lh) / 2);',
  },
]
for (const mutation of MUTATIONS) {
  const orig = readFileSync(mutation.target, 'utf8')
  if (!orig.includes(mutation.from)) { console.error(`✗ 注入點不存在:${mutation.label}`); ok = false; continue }
  try {
    writeFileSync(mutation.target, orig.replace(mutation.from, mutation.to))
    const code = run()
    if (code === 0) { console.error(`✗ 注入違規後 gate 未 FAIL(detection 失效):${mutation.label}`); ok = false }
    else console.log(`✓ 注入違規被抓(exit ${code}):${mutation.label}`)
  } finally {
    writeFileSync(mutation.target, orig)
  }
}

// 3) 還原後必 PASS
if (run() !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
