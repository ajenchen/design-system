#!/usr/bin/env node
/**
 * Story Auto-Compile — Phase 4(2026-04-24)
 *
 * 讀 tsx `*Meta` export + spec.md YAML frontmatter,驗 key 一致性,
 * 產出 canonical story rows(6-story anatomy:Overview / Inspector /
 * Color / Size / State / A11y + Do-Don't + See also)。
 *
 * Usage:
 *   node scripts/compile-stories.mjs <ComponentName>         # default: print to stdout
 *   node scripts/compile-stories.mjs <ComponentName> --check # drift detection(exit 1 若 spec/tsx key 不齊)
 *   node scripts/compile-stories.mjs --all                   # 全 components
 *
 * Phase 4 變更 vs Phase 3:
 * - eval() → vm.runInNewContext(sandbox {}),防 arbitrary code execution
 * - 加 --check / --all flags
 * - 加 6-story A11y placeholder(對齊 2026-04-24 canonical)
 * - 加 See also cross-link section
 * - 非 zero exit 時明確錯誤訊息,供 pre-commit hook / audit skill 消費
 */

import fs from 'node:fs'
import vm from 'node:vm'
import yaml from 'js-yaml'
import { globSync } from 'node:fs'

const args = process.argv.slice(2)
const isCheck = args.includes('--check')
const isAll = args.includes('--all')
const componentArgs = args.filter(a => !a.startsWith('--'))

if (!isAll && componentArgs.length === 0) {
  console.error('Usage: node scripts/compile-stories.mjs <ComponentName> [--check] | --all')
  process.exit(1)
}

const COMPONENTS_DIR = 'packages/design-system/src/components'

function toKebab(name) {
  return name.replace(/[A-Z]/g, (c, i) => (i === 0 ? c.toLowerCase() : `-${c.toLowerCase()}`))
}

function compileOne(componentName) {
  const lowerKebab = toKebab(componentName)
  const folderDir = `${COMPONENTS_DIR}/${componentName}`
  let specPath = `${folderDir}/${lowerKebab}.spec.md`
  let tsxPath = `${folderDir}/${lowerKebab}.tsx`

  // Multi-primitive folder convention(e.g. Menu/menu-item, SelectionControl/selection-item)—
  // spec/tsx 檔名用 primitive 而非 folder kebab。Fall back:find *.spec.md in folder
  // (exclude stories.tsx types),match same stem tsx。
  if (!fs.existsSync(specPath) && fs.existsSync(folderDir)) {
    const specFiles = fs.readdirSync(folderDir).filter(f => f.endsWith('.spec.md'))
    if (specFiles.length === 1) {
      const stem = specFiles[0].replace(/\.spec\.md$/, '')
      specPath = `${folderDir}/${specFiles[0]}`
      tsxPath = `${folderDir}/${stem}.tsx`
    }
  }

  if (!fs.existsSync(specPath) || !fs.existsSync(tsxPath)) {
    return { component: componentName, skipped: true, reason: 'spec or tsx missing' }
  }

  const specContent = fs.readFileSync(specPath, 'utf-8')
  const fmMatch = specContent.match(/^---\n([\s\S]*?)\n---\n/)
  if (!fmMatch) {
    return { component: componentName, skipped: true, reason: 'no frontmatter(Phase 2 未 migration)' }
  }
  const specMeta = yaml.load(fmMatch[1])

  const tsxContent = fs.readFileSync(tsxPath, 'utf-8')
  const metaMatch = tsxContent.match(/export const \w+Meta = (\{[\s\S]*?\n\}) as const/)
  if (!metaMatch) {
    return { component: componentName, skipped: true, reason: 'no componentMeta export(Phase 1 未 migration)' }
  }

  // Phase 4:vm.runInNewContext sandbox 取代 eval
  // Context = {} 空物件,無法存取 process/fs/require 等,compile-safe
  let tsxMeta
  try {
    tsxMeta = vm.runInNewContext(`(${metaMatch[1]})`, {}, { timeout: 500 })
  } catch (e) {
    return { component: componentName, skipped: true, reason: `componentMeta parse error: ${e.message}` }
  }

  // Validate keys alignment
  const errors = []
  const specVariants = Object.keys(specMeta.variants || {})
  const tsxVariants = Object.keys(tsxMeta.variants || {})
  const vMissing = specVariants.filter(k => !tsxVariants.includes(k))
  const vExtra = tsxVariants.filter(k => !specVariants.includes(k))
  if (vMissing.length) errors.push(`variants spec-only: ${vMissing.join(', ')}`)
  if (vExtra.length) errors.push(`variants tsx-only: ${vExtra.join(', ')}`)

  const specSizes = Object.keys(specMeta.sizes || {})
  const tsxSizes = Object.keys(tsxMeta.sizes || {})
  const sMissing = specSizes.filter(k => !tsxSizes.includes(k))
  const sExtra = tsxSizes.filter(k => !specSizes.includes(k))
  if (sMissing.length) errors.push(`sizes spec-only: ${sMissing.join(', ')}`)
  if (sExtra.length) errors.push(`sizes tsx-only: ${sExtra.join(', ')}`)

  // 2026-05-15 anti-false-pass invariant(per /design-system-audit --deep Dim 45+46 audit
  // finding,user verbatim「機械化產出應該有一套產出標準?驗證時應該也是要以該套標準來檢驗」):
  // Empty-vs-empty `variants:{} sizes:{}` 兩邊都空 → 原 diff = 0 false-pass。
  // 若 spec frontmatter `traits:` 包含 `hasSizes` / `hasVariants` → 必至少 1 key in
  // (a) specMeta(spec frontmatter)+(b) tsxMeta(componentMeta export)。
  // 違反 = M14 violation(canonical promised, not landed)。
  const specTraits = Array.isArray(specMeta.traits) ? specMeta.traits : []
  if (specTraits.includes('hasSizes')) {
    if (specSizes.length === 0) errors.push(`hasSizes trait declared but spec.sizes empty(M14 violation: canonical promised, not landed)`)
    if (tsxSizes.length === 0) errors.push(`hasSizes trait declared but tsx componentMeta.sizes empty(M14 violation)`)
  }
  if (specTraits.includes('hasVariants')) {
    if (specVariants.length === 0) errors.push(`hasVariants trait declared but spec.variants empty(M14 violation: canonical promised, not landed)`)
    if (tsxVariants.length === 0) errors.push(`hasVariants trait declared but tsx componentMeta.variants empty(M14 violation)`)
  }

  if (errors.length) {
    return { component: componentName, drift: true, errors }
  }

  // Generate canonical rendering(POC markdown)
  const lines = []
  lines.push('=== AUTO-COMPILED anatomy section ===\n')
  lines.push(`# ${componentName} 元件總覽\n`)
  lines.push(`**Layout Family**: ${tsxMeta.family}`)
  lines.push(`**Default**: variant=\`${tsxMeta.defaultVariant}\` / size=\`${tsxMeta.defaultSize}\`\n`)
  lines.push('## Variants\n')
  lines.push('| Variant | When | World-class 對照 |')
  lines.push('|---------|------|-----------------|')
  for (const [key, specV] of Object.entries(specMeta.variants || {})) {
    const wc = (specV['world-class'] || []).join(' / ')
    lines.push(`| \`${key}\` | ${specV.when} | ${wc} |`)
  }
  lines.push('\n## Sizes\n')
  lines.push('| Size | Field Height | Icon | Typography | When |')
  lines.push('|------|-------------|------|-----------|------|')
  for (const [key, tsxS] of Object.entries(tsxMeta.sizes)) {
    const specS = specMeta.sizes[key] || {}
    lines.push(`| \`${key}\` | ${tsxS.fieldHeight}px | ${tsxS.iconSize}px | ${tsxS.typography} | ${specS.when || '—'} |`)
  }
  lines.push('\n## States\n')
  tsxMeta.states.forEach(s => lines.push(`- ${s}`))
  lines.push('\n## Tokens consumed\n')
  for (const [cat, tokens] of Object.entries(tsxMeta.tokens)) {
    lines.push(`- **${cat}**: ${tokens.map(t => `\`${t}\``).join(', ')}`)
  }

  if (specMeta['禁止事項']) {
    lines.push('\n## Do / Don\'t(auto from spec 禁止事項)\n')
    specMeta['禁止事項'].forEach((d, i) => {
      lines.push(`**${i + 1}. ❌ ${d.rule}**`)
      lines.push(`   - Why: ${d.reason}`)
      lines.push(`   - 反例: \`${d['反例']}\``)
      lines.push('')
    })
  }

  lines.push('## 6. 無障礙與鍵盤(Accessibility & Keyboard)\n')
  lines.push('> 2026-04-24 6-story canonical(對齊 Material/Polaris/Atlassian 專章)。')
  lines.push('> Phase 4 加 spec `a11y:` frontmatter 欄位後自動產 ARIA 對照 / Keyboard map / Focus order / WCAG AA 對比 snapshot。\n')

  lines.push('## See also(三層 stories 互聯)\n')
  lines.push(`- **展示**(${lowerKebab}.stories.tsx)— 真實業務場景`)
  lines.push(`- **設計規格**(${lowerKebab}.anatomy.stories.tsx)— 6-matrix inspect(本檔)`)
  lines.push(`- **設計原則**(${lowerKebab}.principles.stories.tsx)— do/don't + 情境選擇`)
  lines.push('\n=== END AUTO-COMPILED ===')

  const output = lines.join('\n')
  // Dim 45 is a structural generator check, not merely a spec/tsx key diff.
  // Validate every generated variant/size row plus the mandatory accessibility
  // and reciprocal navigation sections before --check may report alignment.
  const structuralErrors = []
  for (const key of specVariants) {
    if (!output.includes(`| \`${key}\` |`)) structuralErrors.push(`generated Variants row missing:${key}`)
  }
  for (const key of tsxSizes) {
    if (!output.includes(`| \`${key}\` |`)) structuralErrors.push(`generated Sizes row missing:${key}`)
  }
  for (const required of [
    '## 6. 無障礙與鍵盤(Accessibility & Keyboard)',
    '## See also(三層 stories 互聯)',
    `${lowerKebab}.stories.tsx`,
    `${lowerKebab}.anatomy.stories.tsx`,
    `${lowerKebab}.principles.stories.tsx`,
  ]) {
    if (!output.includes(required)) structuralErrors.push(`generated structural section missing:${required}`)
  }
  if (structuralErrors.length) return { component: componentName, drift: true, errors: structuralErrors }

  return { component: componentName, ok: true, output }
}

// ─── Main ────────────────────────────────────────
const targets = isAll
  ? fs.readdirSync(COMPONENTS_DIR).filter(d => fs.statSync(`${COMPONENTS_DIR}/${d}`).isDirectory())
  : componentArgs

const results = targets.map(compileOne)
const drifts = results.filter(r => r.drift)
const skipped = results.filter(r => r.skipped)
const ok = results.filter(r => r.ok)

if (isCheck) {
  // A zero-migration tree would otherwise make both Dim 23 and Dim 45 pass
  // vacuously. Skipped components stay visible as migration debt; the deep-
  // audit runner additionally refuses to issue completion receipts while any
  // skipped count is non-zero.
  if (ok.length === 0) {
    console.error(`❌ 0 component(s) compiled; ${skipped.length} skipped. Refusing vacuous canonical-drift coverage.`)
    process.exit(1)
  }
  if (drifts.length > 0) {
    console.error(`❌ ${drifts.length} component(s) with spec/tsx canonical drift:\n`)
    drifts.forEach(d => {
      console.error(`  ${d.component}:`)
      d.errors.forEach(e => console.error(`    - ${e}`))
    })
    process.exit(1)
  }
  console.log(`✅ ${ok.length} component(s) canonical aligned; ${skipped.length} skipped(migration 未做)`)
  process.exit(0)
}

// Default mode:print compiled output + summary
if (!isAll && ok.length > 0) {
  console.log(ok[0].output)
  console.log('')
}
if (skipped.length > 0) {
  console.log(`ℹ️  Skipped(${skipped.length}): ${skipped.map(s => `${s.component}(${s.reason})`).join(', ')}`)
}
if (drifts.length > 0) {
  console.error(`\n❌ Drift(${drifts.length}):`)
  drifts.forEach(d => {
    console.error(`  ${d.component}:`)
    d.errors.forEach(e => console.error(`    - ${e}`))
  })
  process.exit(1)
}
console.log(`\n✅ ${ok.length} aligned / ${skipped.length} skipped / 0 drift`)
