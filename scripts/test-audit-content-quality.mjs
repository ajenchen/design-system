#!/usr/bin/env node
// meta-test for audit-content-quality — 注入已知違規 → gate 必 exit != 0 → 還原(PNG gate-meta-test 家族)
// Gate 掃 packages/design-system/src/components/**/*.stories.tsx;無 --fix 時偵測到 violation 即 exit 1。
// 注入:非 anatomy showcase story 加 deprecated 序號 name(`'1. …'`)→ trips Check 4a nonAnatomyNumbering。
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Gate 用 relative path 'packages/design-system/src/components' → 必以 repo root 為 cwd。
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
process.chdir(repoRoot)

const run = () => spawnSync(process.execPath, ['--', 'scripts/audit-content-quality.mjs', '--check'], { stdio: 'pipe' }).status ?? 1
let ok = true

// 1) 現況必 PASS
if (run() !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }

// 2) 注入違規 → 必 FAIL → 還原
const target = join(repoRoot, 'packages/design-system/src/components/Button/button.stories.tsx')
const orig = readFileSync(target, 'utf8')
try {
  // deprecated 2026-04-26:非 anatomy stories 不該有序號 name(Check 4a nonAnatomyNumbering)
  const injected = orig + `\nexport const InjectedNumberingViolation = {\n  name: '1. 注入序號違規測試',\n};\n`
  writeFileSync(target, injected)
  const code = run()
  if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) JSX canvas 的 Markdown emphasis 會把 ** 原樣顯示,gate 必抓。
try {
  const injected = orig + `\nconst injectedMarkdownToken = '跨 expression';\nexport const InjectedMarkdownViolation = {\n  name: '注入星號違規測試',\n  render: () => <p>這是**不會被解析的 {injectedMarkdownToken} 粗體**</p>,\n};\n`
  writeFileSync(target, injected)
  const code = run()
  if (code === 0) { console.error('✗ 注入 literal Markdown 後 gate 未 FAIL'); ok = false }
  else console.log('✓ 注入 literal Markdown 被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 4) Reader-facing Autodocs 缺 component 導讀時必 FAIL。
const docsDescriptionBlock = /\n  parameters: \{\n    docs: \{\n      description: \{\n        component: [^\n]+\n      \},\n    \},\n  \},/
if (!docsDescriptionBlock.test(orig)) {
  console.error('✗ 目標檔缺 Autodocs description anchor — 注入基礎失效')
  process.exit(1)
}
try {
  writeFileSync(target, orig.replace(docsDescriptionBlock, ''))
  const code = run()
  if (code === 0) { console.error('✗ 移除 Autodocs component description 後 gate 未 FAIL'); ok = false }
  else console.log('✓ 缺 Autodocs component description 被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 5) 還原後必 PASS
if (run() !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
