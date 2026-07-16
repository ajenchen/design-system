#!/usr/bin/env node
/**
 * inline-edit-view-geometry-invariant.mjs — 機械鎖 InlineEdit 多行 view py == Textarea edit py。
 *
 * 為何存在(2026-07-16 Model A round16 + 對抗稽核 F1):InlineEdit 多行 read↔edit 零跳依賴
 *   `fieldViewGeometry(size, multiline=true)` 的 `py-2` **等於** Textarea edit base 的 `py-2`。
 *   兩者都是 Tailwind class(非 token)→ 無型別連動,Textarea py 一改、InlineEdit 多行 read 就跟 edit
 *   垂直不齊、卻沒有任何 gate 抓。本 script = 該 SSOT 契約的機械鎖(field-wrapper.tsx / field-controls.spec.md
 *   宣稱的「invariant 鎖」實體)。
 *
 * 驗:
 *   (1) field-wrapper.tsx `fieldViewGeometry` 多行分支的 py class
 *   (2) textarea.tsx cva base 的 py class
 *   兩者必相等 → 不等 exit 1。
 *
 * 用法:node scripts/inline-edit-view-geometry-invariant.mjs [--check]
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// (1) fieldViewGeometry multiline 分支:`multiline ? 'items-start py-2' : 'items-center'`
const fw = read('packages/design-system/src/components/Field/field-wrapper.tsx')
const fvgMatch = fw.match(/multiline\s*\?\s*'items-start\s+(py-[\d.]+)'/)
// (2) textarea cva base:`'px-[var(--field-px)] py-2'`
const ta = read('packages/design-system/src/components/Textarea/textarea.tsx')
const taMatch = ta.match(/'px-\[var\(--field-px\)\]\s+(py-[\d.]+)'/)

const errors = []
if (!fvgMatch) errors.push('找不到 fieldViewGeometry 多行 py class(field-wrapper.tsx `multiline ? items-start py-N`)')
if (!taMatch) errors.push('找不到 Textarea base py class(textarea.tsx `px-[var(--field-px)] py-N`)')

let ok = false
if (fvgMatch && taMatch) {
  const fvgPy = fvgMatch[1]
  const taPy = taMatch[1]
  ok = fvgPy === taPy
  if (!ok) errors.push(`py 不一致:fieldViewGeometry 多行=${fvgPy} vs Textarea edit=${taPy} — InlineEdit 多行 read↔edit 垂直不齊`)
  console.log(`InlineEdit 多行 view py = ${fvgPy} | Textarea edit py = ${taPy} → ${ok ? '✅ 一致' : '❌ 漂移'}`)
}

if (errors.length) {
  console.error('\n❌ InlineEdit view geometry invariant FAIL:')
  for (const e of errors) console.error(`   - ${e}`)
  console.error('\n修:讓 fieldViewGeometry 多行 py 與 textarea.tsx base py 對齊(Model A read↔edit 零跳契約)。')
  process.exit(1)
}
console.log('✅ InlineEdit view geometry invariant PASS')
process.exit(0)
