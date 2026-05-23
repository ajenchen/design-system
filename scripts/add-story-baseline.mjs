#!/usr/bin/env node
/**
 * add-story-baseline.mjs — Auto-add @story-baseline cite markers to stories wrapping primitives
 *
 * 2026-05-23 Decision 6 autonomous(per user verbatim「決策六,這種東西到底為什麼要我決策?
 * 不是應該自動選 A 嗎?」)
 *
 * Pipeline:
 *   1. Read `.claude/references/story-baseline-registry.json` SSOT(per-primitive baseline)
 *   2. Walk `packages/design-system/src/components/**\/*.stories.tsx`(non-anatomy/principles)
 *   3. For each story file:
 *      a. Skip if already has `@story-baseline:` marker
 *      b. Skip if it IS the baseline owner(eg. sidebar.stories.tsx for Sidebar)
 *      c. Detect which primitives are wrapped via grep `<Sidebar` / `<DataTable` / `<Dialog` / `<Sheet` / `<Popover` / `<ChromeHeader` JSX
 *      d. For each wrap-target with registry entry → inject `// @story-baseline: <baseline>` comment after first import block
 *
 * Output:
 *   - Mutates `*.stories.tsx` files in place
 *   - `.claude/logs/story-baseline-batch.json` — log of files updated / skipped
 *
 * Usage:
 *   node scripts/add-story-baseline.mjs            # dry-run(default)
 *   node scripts/add-story-baseline.mjs --apply    # actually mutate files
 *
 * Idempotent — re-running skips already-tagged files。
 */

import fs from 'node:fs'
import path from 'node:path'
import { globSync } from 'node:fs'

const ROOT = process.cwd()
const APPLY = process.argv.includes('--apply')
const REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude/references/story-baseline-registry.json'), 'utf-8'))

const targetPrimitives = Object.keys(REGISTRY.components || {})
console.log(`▶ Story baseline migration — registry primitives: ${targetPrimitives.join(', ')}`)
console.log(`   Mode: ${APPLY ? 'APPLY (mutating files)' : 'DRY-RUN'}`)
console.log('')

const storyFiles = globSync('packages/design-system/src/components/*/*.stories.tsx', { cwd: ROOT })
  .filter(f => !f.includes('.anatomy.stories.tsx'))
  .filter(f => !f.includes('.principles.stories.tsx'))

const log = { ts: new Date().toISOString(), applyMode: APPLY, files: { tagged: [], skipped_already_marked: [], skipped_self_baseline: [], skipped_no_wrap: [], errored: [] } }

for (const rel of storyFiles) {
  const abs = path.join(ROOT, rel)
  const content = fs.readFileSync(abs, 'utf-8')
  const fileName = path.basename(rel) // eg. button.stories.tsx
  const componentDir = path.basename(path.dirname(rel)) // eg. Button

  // Skip if already tagged
  if (/@story-baseline:/.test(content)) {
    log.files.skipped_already_marked.push(rel)
    continue
  }

  // Skip if this story IS itself a registered baseline owner
  const isSelfBaseline = Object.values(REGISTRY.components || {}).some(c =>
    typeof c.baseline === 'string' && c.baseline.endsWith(fileName.replace('.stories.tsx', '') + '.stories.tsx' + '#' + (c.baseline.split('#')[1] || '')) ||
    (c.baseline && c.baseline.includes(`/${componentDir}/`) && c.baseline.endsWith('.stories.tsx#' + (c.baseline.split('#')[1] || ''))),
  )
  if (isSelfBaseline) {
    log.files.skipped_self_baseline.push(rel)
    continue
  }

  // Detect which registry primitives this story wraps via JSX tag scan
  const wrapped = []
  for (const prim of targetPrimitives) {
    // Primitive components live under `packages/design-system/src/components/<Name>/` (PascalCase)
    // Skip self(eg. Button stories shouldn't cite Button baseline)
    if (componentDir === prim) continue
    const tagPattern = new RegExp(`<${prim}[\\s>]`)
    if (tagPattern.test(content)) wrapped.push(prim)
  }

  if (wrapped.length === 0) {
    log.files.skipped_no_wrap.push(rel)
    continue
  }

  // Build baseline cite marker — use first matched primitive(most stories wrap one main one)
  const primaryPrim = wrapped[0]
  const baseline = REGISTRY.components[primaryPrim].baseline
  const markerLine = `// @story-baseline: ${baseline}`
  const noteLine = wrapped.length > 1
    ? `// (本 stories wrap ${wrapped.join(' + ')};primary baseline cite per .claude/references/story-baseline-registry.json)`
    : `// (per .claude/references/story-baseline-registry.json#${primaryPrim})`

  // Inject before first `import` line(or at line 1 if no imports)
  const lines = content.split('\n')
  const firstImportIdx = lines.findIndex(l => l.trim().startsWith('import '))
  const injectIdx = firstImportIdx >= 0 ? firstImportIdx : 0
  lines.splice(injectIdx, 0, markerLine, noteLine)
  const newContent = lines.join('\n')

  log.files.tagged.push({ file: rel, primary: primaryPrim, wrapped })

  if (APPLY) {
    fs.writeFileSync(abs, newContent)
  }
}

const LOG_DIR = path.join(ROOT, '.claude/logs')
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
const logPath = path.join(LOG_DIR, 'story-baseline-batch.json')
fs.writeFileSync(logPath, JSON.stringify(log, null, 2))

console.log('═══════════════════════════════════════════')
console.log(`Total stories scanned: ${storyFiles.length}`)
console.log(`✓ Tagged: ${log.files.tagged.length}`)
console.log(`- Skipped(already marked): ${log.files.skipped_already_marked.length}`)
console.log(`- Skipped(self-baseline): ${log.files.skipped_self_baseline.length}`)
console.log(`- Skipped(no primitive wrap): ${log.files.skipped_no_wrap.length}`)
console.log(`- Errored: ${log.files.errored.length}`)
console.log(`Log: ${logPath}`)
if (!APPLY) console.log('\nDRY-RUN — re-run with --apply to mutate files.')
process.exit(0)
