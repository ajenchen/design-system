#!/usr/bin/env node
// meta-test for audit-content-quality — 注入已知違規 → gate 必 exit != 0 → 還原(PNG gate-meta-test 家族)
// Gate 掃 packages/design-system/src/components/**/*.stories.tsx;無 --fix 時偵測到 violation 即 exit 1。
// 注入:非 anatomy showcase story 加 deprecated 序號 name(`'1. …'`)→ trips Check 4a nonAnatomyNumbering。
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
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

// 5) Anatomy canonical display name 必精確匹配。
const anatomyTarget = join(repoRoot, 'packages/design-system/src/components/Button/button.anatomy.stories.tsx')
const anatomyOrig = readFileSync(anatomyTarget, 'utf8')
try {
  writeFileSync(anatomyTarget, anatomyOrig.replace("name: '元件總覽'", "name: '總覽（錯誤注入）'"))
  const code = run()
  if (code === 0) { console.error('✗ anatomy canonical 顯示名漂移後 gate 未 FAIL'); ok = false }
  else console.log('✓ anatomy canonical 顯示名漂移被抓(exit ' + code + ')')
} finally {
  writeFileSync(anatomyTarget, anatomyOrig)
}

// 6) Missing canonical section 必有該 section 自己的 scoped rationale；
//    不相干的 rationale 不可當整檔 escape。
try {
  const injected = `// @anatomy-rationale:\n// ColorMatrix N/A — 注入測試的合法但不相干理由。\n${anatomyOrig}`
    .replace('export const SizeMatrix =', 'export const InjectedMissingSizeMatrix =')
  writeFileSync(anatomyTarget, injected)
  const code = run()
  if (code === 0) { console.error('✗ missing SizeMatrix 借用不相干 rationale 後 gate 未 FAIL'); ok = false }
  else console.log('✓ missing anatomy section 的 scoped rationale 規則被抓(exit ' + code + ')')
} finally {
  writeFileSync(anatomyTarget, anatomyOrig)
}

// 7) Showcase 只要求一個有代表性的 reader-facing story；不強迫 export 名為 Default。
try {
  writeFileSync(target, orig.replace('export const Default: Story =', 'export const RepresentativeBaseline: Story ='))
  const code = run()
  if (code !== 0) { console.error('✗ 非 Default 的 representative showcase 應 PASS 卻 FAIL'); ok = false }
  else console.log('✓ 非 Default 的 representative showcase 可通過')
} finally {
  writeFileSync(target, orig)
}

// 8) 完全沒有 reader-facing export 的 showcase 必 FAIL。
try {
  writeFileSync(target, orig.replace(/^export const /gm, 'const '))
  const code = run()
  if (code === 0) { console.error('✗ 空 showcase gate 未 FAIL'); ok = false }
  else console.log('✓ 空 showcase 被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 9) 單一完整 integrated UsageGuidance 合法；任意 thin non-decision story 不合法。
const principlesTarget = join(repoRoot, 'packages/design-system/src/components/Button/button.principles.stories.tsx')
const principlesOrig = readFileSync(principlesTarget, 'utf8')
const singleIntegrated = principlesOrig.replace(
  /^export const (?!UsageGuidance\b)/gm,
  'const ',
)
try {
  writeFileSync(principlesTarget, singleIntegrated)
  const code = run()
  if (code !== 0) { console.error('✗ 單一 integrated UsageGuidance 應 PASS 卻 FAIL'); ok = false }
  else console.log('✓ 單一 integrated UsageGuidance 可通過')
} finally {
  writeFileSync(principlesTarget, principlesOrig)
}
try {
  writeFileSync(principlesTarget, singleIntegrated.replace('export const UsageGuidance', 'export const StylingNotes'))
  const code = run()
  if (code === 0) { console.error('✗ 單一 thin non-decision principle gate 未 FAIL'); ok = false }
  else console.log('✓ 單一 thin non-decision principle 被抓(exit ' + code + ')')
} finally {
  writeFileSync(principlesTarget, principlesOrig)
}

// 10) test-only 不得與 !test/!dev 組合而從 automation surface 消失。
if (!orig.includes("tags: ['test-only']")) {
  console.error('✗ 目標檔缺 test-only probe anchor — 注入基礎失效')
  process.exit(1)
}
try {
  writeFileSync(target, orig.replace("tags: ['test-only']", "tags: ['test-only', '!test']"))
  const code = run()
  if (code === 0) { console.error('✗ test-only + !test visibility drift 未被抓'); ok = false }
  else console.log('✓ test-only + !test visibility drift 被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 11) shared Autodocs filter 是 visibility contract，不可只靠每檔約定。
const previewTarget = join(repoRoot, 'packages/storybook-config/preview.tsx')
const previewOrig = readFileSync(previewTarget, 'utf8')
const previewFilter = "filter: (story: { tags?: string[] }) => !story.tags?.includes('test-only'),"
if (!previewOrig.includes(previewFilter)) {
  console.error('✗ shared preview 缺 test-only filter anchor — 注入基礎失效')
  process.exit(1)
}
try {
  writeFileSync(previewTarget, previewOrig.replace(previewFilter, 'filter: () => true,'))
  const code = run()
  if (code === 0) { console.error('✗ 移除 shared Autodocs test-only filter 後 gate 未 FAIL'); ok = false }
  else console.log('✓ shared Autodocs test-only filter 漂移被抓(exit ' + code + ')')
} finally {
  writeFileSync(previewTarget, previewOrig)
}

// 11b) 一個 title 只能有一個 CSF 檔(2026-10-13):另開一個與 Button 展示頁同 title 的檔(裡面有一則給人看的範例,
//      其他規則都不會紅)→ 必須以「title 被兩個檔共用」紅 —— 只看 exit code 會被別條規則掩護,所以比對那一條的訊息。
const dupFile = join(repoRoot, 'packages/design-system/src/components/Button/button-injected-duplicate-title.stories.tsx')
const buttonTitle = orig.match(/^\s*title:\s*['"]([^'"]+)['"]/m)?.[1]
if (!buttonTitle) { console.error('✗ Button 展示檔讀不到 title — 注入基礎失效'); process.exit(1) }
try {
  writeFileSync(dupFile, `import type { Meta, StoryObj } from '@storybook/react'\nconst meta: Meta = { title: '${buttonTitle}' }\nexport default meta\nexport const InjectedDuplicateTitle: StoryObj = { name: '注入的同 title 檔' }\n`)
  const r = spawnSync(process.execPath, ['--', 'scripts/audit-content-quality.mjs', '--check'], { stdio: 'pipe', encoding: 'utf8' })
  const hit = (r.status ?? 1) !== 0 && /title "[^"]+" is shared by 2 CSF files/.test(r.stdout)
  if (!hit) { console.error('✗ 兩個 CSF 檔共用同一個 title 未被抓(exit ' + r.status + ')'); ok = false }
  else console.log('✓ 兩個 CSF 檔共用同一個 title 被抓(exit ' + r.status + ')')
} finally {
  try { unlinkSync(dupFile) } catch {}
}

// 12) 還原後必 PASS
if (run() !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
