#!/usr/bin/env node
/**
 * check-three-layer-stories.mjs — Deterministic 三層 stories 存在性閘(2026-07-16)。
 *
 * 為何存在(user verbatim 2026-07-15「確保Storybook的內容都符合規範」+ dim-11 假證據事件):
 *   deep-audit dim-11 residue 曾**由 AI 重放冒充機械證據**宣稱「全元件三層齊備」——**但 InlineEdit
 *   是全 64 元件唯一缺 anatomy + principles 兩層的**。AI 自評不可靠 → 本 script = 機械真相:
 *   enumerate 全 public component,任一缺 anatomy/principles → exit 1 BLOCK,冒充不了。
 *
 * 三層 canonical(story-rules.md):
 *   1 展示 `<name>.stories.tsx`  2 設計規格 `<name>.anatomy.stories.tsx`  3 設計原則 `<name>.principles.stories.tsx`
 *
 * Scope:`packages/design-system/src/components/<Name>/`。**Internal 元件豁免**(frontmatter isInternal —
 *   內部 primitive 不對 consumer 展示三層;偵測 spec.md `internal: true` / `- isInternal`)。
 *
 * 用法:
 *   node scripts/check-three-layer-stories.mjs          # 報告
 *   node scripts/check-three-layer-stories.mjs --check   # CI 模式(缺層 → exit 1)
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const CHECK = process.argv.includes('--check')
const COMPONENTS_DIR = path.join(ROOT, 'packages/design-system/src/components')

const isInternal = (dir) => {
  const spec = fs.readdirSync(dir).find((f) => f.endsWith('.spec.md'))
  if (!spec) return false
  const src = fs.readFileSync(path.join(dir, spec), 'utf8')
  // frontmatter internal marker(spec-rules.md canonical:`internal: true` 或 `- isInternal`)
  return /^\s*internal:\s*true/m.test(src) || /^\s*-\s*isInternal/m.test(src)
}

const missing = []
let scanned = 0

for (const name of fs.readdirSync(COMPONENTS_DIR).sort()) {
  const dir = path.join(COMPONENTS_DIR, name)
  if (!fs.statSync(dir).isDirectory()) continue
  const files = fs.readdirSync(dir)
  const hasShowcase = files.some((f) => f.endsWith('.stories.tsx') && !f.includes('.anatomy.') && !f.includes('.principles.'))
  if (!hasShowcase) continue // 無展示層 = 非公開展示元件(純 util / 型別 dir),跳過
  if (isInternal(dir)) continue // internal primitive 豁免三層
  scanned++
  const hasAnatomy = files.some((f) => f.endsWith('.anatomy.stories.tsx'))
  const hasPrinciples = files.some((f) => f.endsWith('.principles.stories.tsx'))
  const gaps = []
  if (!hasAnatomy) gaps.push('anatomy')
  if (!hasPrinciples) gaps.push('principles')
  if (gaps.length) missing.push({ component: name, missing: gaps })
}

if (!CHECK) {
  const LOG_DIR = path.join(ROOT, '.claude/logs')
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
  fs.writeFileSync(path.join(LOG_DIR, 'three-layer-stories.json'), JSON.stringify({ scanned, missing }, null, 2))
}

console.log('═════════════════════════════════════════════════')
console.log('▶ Three-Layer Stories 存在性閘(展示 / 設計規格 / 設計原則)')
console.log(`   Public 元件掃描: ${scanned}`)
console.log(`   缺層元件: ${missing.length}`)
console.log('═════════════════════════════════════════════════')

if (missing.length) {
  console.error('\n❌ 缺三層 stories:')
  for (const m of missing) console.error(`   ${m.component}: 缺 ${m.missing.join(' + ')}`)
  console.error('\n每個 public component 必備 <name>.anatomy.stories.tsx + <name>.principles.stories.tsx(story-rules.md 三層 canonical)。')
  if (CHECK) process.exit(1)
} else {
  console.log('\n✅ 全 public 元件三層齊備(機械證據,非 AI 自評)')
}
process.exit(0)
