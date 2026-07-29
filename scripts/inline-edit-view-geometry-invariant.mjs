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

const SIZES = ['sm', 'md', 'lg']
const errors = []

// (1) fieldViewGeometry 多行分支:每個 size 一條 `multiline && size === 'N' && 'py-[var(--field-control-py-N)]'`
const fw = read('packages/design-system/src/components/Field/field-wrapper.tsx')
// (2) textarea cva size axis:每個 size 一條 `N: 'text-… py-[var(--field-control-py-N)]'`
const ta = read('packages/design-system/src/components/Textarea/textarea.tsx')

const viewPy = {}
const editPy = {}
for (const size of SIZES) {
  const view = fw.match(new RegExp(`multiline && size === '${size}' && '(py-\\[[^']+\\])'`))
  const edit = ta.match(new RegExp(`\\n\\s+${size}: '[^']*?(py-\\[[^\\]]+\\])'`))
  if (!view) errors.push(`找不到 fieldViewGeometry 多行 ${size} py class(field-wrapper.tsx)`)
  if (!edit) errors.push(`找不到 Textarea size axis ${size} py class(textarea.tsx)`)
  if (view) viewPy[size] = view[1]
  if (edit) editPy[size] = edit[1]
}

// (3) 兩者必逐 size 相等,且必消費 --field-control-py-* token(不得回退成字面 py-N,
//     否則單行 Textarea 與同 size Input 又會不等高、density 也不再自動連動)
for (const size of SIZES) {
  if (!viewPy[size] || !editPy[size]) continue
  const expected = `py-[var(--field-control-py-${size})]`
  if (viewPy[size] !== editPy[size]) {
    errors.push(`${size} py 不一致:fieldViewGeometry 多行=${viewPy[size]} vs Textarea edit=${editPy[size]} — InlineEdit 多行 read↔edit 垂直不齊`)
  } else if (viewPy[size] !== expected) {
    errors.push(`${size} py 未消費 SSOT token:得到 ${viewPy[size]},應為 ${expected}(uiSize.css 公式 = (field-height − 1lh)/2 − 1px)`)
  }
  console.log(`  ${size}: view=${viewPy[size] ?? '?'} | edit=${editPy[size] ?? '?'}`)
}

// (4) token 本身必在 uiSize.css 且維持邊框修正項——少了 −1px 三個 size 都會比 Input 高 2px
const uiSize = read('packages/design-system/src/tokens/uiSize/uiSize.css')
for (const size of SIZES) {
  const decl = uiSize.match(new RegExp(`--field-control-py-${size}:\\s*calc\\(\\(var\\(--field-height-${size}\\) - 1lh\\) / 2 - 1px\\);`))
  if (!decl) errors.push(`uiSize.css 缺 --field-control-py-${size} 或公式漂移(必為 calc((var(--field-height-${size}) - 1lh) / 2 - 1px))`)
}

if (errors.length) {
  console.error('\n❌ InlineEdit view geometry invariant FAIL:')
  for (const e of errors) console.error(`   - ${e}`)
  console.error('\n修:讓 fieldViewGeometry 多行 py 與 textarea.tsx base py 對齊(Model A read↔edit 零跳契約)。')
  process.exit(1)
}
console.log('✅ InlineEdit view geometry invariant PASS')
process.exit(0)
