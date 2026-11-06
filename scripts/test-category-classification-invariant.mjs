#!/usr/bin/env node
// meta-test for category-classification-invariant — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
//
// gate 檢查三訊號一致(folder / storybook title / frontmatter isInternal)。
// 注入手法:把 components/Alert story title 的 category 段從 Components 改成 Patterns
//   → fromTitle=pattern 但 resolveCategory=component(folder=components + 無 isInternal)
//   → Invariant 1「title 反映 category 必 === resolveCategory」被打破 → gate exit 1。
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolveUnitOwnSpec } from './lib/unit-own-spec.mjs'

const run = () => spawnSync(process.execPath, ['--', 'scripts/category-classification-invariant.mjs'], { stdio: 'pipe' }).status ?? 1
let ok = true

// 1) 現況必 PASS
if (run() !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ baseline PASS(gate exit 0)')

// 2) 注入違規 → 必 FAIL → 還原
const target = 'packages/design-system/src/components/Alert/alert.stories.tsx'
const orig = readFileSync(target, 'utf8')
const NEEDLE = 'Design System/Components/Alert/'
const MUTATED = 'Design System/Patterns/Alert/'
if (!orig.includes(NEEDLE)) { console.error(`✗ 目標檔找不到 title 段 [${NEEDLE}] — 注入基礎失效`); process.exit(1) }
try {
  writeFileSync(target, orig.replace(NEEDLE, MUTATED))
  const code = run()
  if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) public component 的 main story 移除 Autodocs → 必 FAIL → 還原
const AUTODOCS = "  tags: ['autodocs'],\n"
if (!orig.includes(AUTODOCS)) { console.error('✗ 目標檔缺 Autodocs anchor — 注入基礎失效'); process.exit(1) }
try {
  writeFileSync(target, orig.replace(AUTODOCS, ''))
  const code = run()
  if (code === 0) { console.error('✗ 移除 Autodocs 後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ Autodocs policy drift 被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 4) shared Storybook sidebar 順序背離 matrix → 必 FAIL → 還原
const previewTarget = 'packages/storybook-config/preview.tsx'
const previewOrig = readFileSync(previewTarget, 'utf8')
const ORDER_ANCHOR = "          'Patterns',\n          'Internal',"
if (!previewOrig.includes(ORDER_ANCHOR)) { console.error('✗ storySort anchor 漂移 — 注入基礎失效'); process.exit(1) }
try {
  writeFileSync(previewTarget, previewOrig.replace(ORDER_ANCHOR, "          'Internal',\n          'Patterns',"))
  const code = run()
  if (code === 0) { console.error('✗ storySort 順序漂移後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ storySort matrix drift 被抓(exit ' + code + ')')
} finally {
  writeFileSync(previewTarget, previewOrig)
}

// 5) 讀的是「這個單元自己的 spec」,不是資料夾裡第一個(2026-10-14,SM2b ①;判準 lib/unit-own-spec.mjs)
//    SelectMenu 資料夾裡按字母序第一個是 select-menu-unrestricted.spec.md(沒有 frontmatter),主 spec 是 select-menu.spec.md(有 isInternal)。
//    5a 判定表:同名優先、順序無關、單一 spec 退回、兩份以上又沒有同名 = 判不了(不猜)
assert.deepEqual(resolveUnitOwnSpec('SelectMenu', ['select-menu-unrestricted.spec.md', 'select-menu.spec.md']).spec, 'select-menu.spec.md')
assert.deepEqual(resolveUnitOwnSpec('SelectMenu', ['select-menu.spec.md', 'select-menu-unrestricted.spec.md']).spec, 'select-menu.spec.md')
assert.deepEqual(resolveUnitOwnSpec('Steps', ['steps-state-visuals.spec.md', 'steps.spec.md']).spec, 'steps.spec.md')
assert.deepEqual(resolveUnitOwnSpec('layoutSpace', ['layoutSpace.css', 'layoutSpace.spec.md', 'layoutSpace.stories.tsx']).spec, 'layoutSpace.spec.md')
assert.deepEqual(resolveUnitOwnSpec('Menu', ['menu-item.spec.md', 'menu-item.tsx']), { spec: 'menu-item.spec.md', reason: 'only-spec', candidates: ['menu-item.spec.md'] })
assert.deepEqual(resolveUnitOwnSpec('Zz', ['b.spec.md', 'a.spec.md']), { spec: null, reason: 'ambiguous', candidates: ['a.spec.md', 'b.spec.md'] })
assert.deepEqual(resolveUnitOwnSpec('Zz', ['zz.tsx']), { spec: null, reason: 'no-spec', candidates: [] })
console.log('✓ 主 spec 判定表:同名優先(與檔案順序無關)、單一 spec 退回、兩份以上沒有同名 → 判不了')

//    5b 真檔突變:主 spec 拿掉 isInternal → 必紅(證明讀的是主 spec;若讀第一個,這個突變不會改變任何結果)
const ownSpec = 'packages/design-system/src/components/SelectMenu/select-menu.spec.md'
const ownOrig = readFileSync(ownSpec, 'utf8')
const INTERNAL_TRAIT = '\n  - isInternal\n'
if (!ownOrig.includes(INTERNAL_TRAIT)) { console.error('✗ select-menu.spec.md frontmatter 找不到 isInternal trait — 注入基礎失效'); process.exit(1) }
try {
  writeFileSync(ownSpec, ownOrig.replace(INTERNAL_TRAIT, '\n'))
  const code = run()
  if (code === 0) { console.error('✗ 主 spec 拿掉 isInternal 後 gate 未 FAIL —— 它讀的不是這個單元自己的 spec'); ok = false }
  else console.log('✓ 主 spec(select-menu.spec.md)拿掉 isInternal 被抓(exit ' + code + ');旁邊沒有 frontmatter 的 select-menu-unrestricted.spec.md 排在前面也不影響判定')
} finally {
  writeFileSync(ownSpec, ownOrig)
}

//    5c 判不了就紅:臨時單元資料夾有兩份 spec、沒有一份同名 → 必紅(不准挑一份猜)→ 刪除
const fixtureDir = 'packages/design-system/src/components/ZzOwnSpecProbe'
try {
  mkdirSync(fixtureDir, { recursive: true })
  writeFileSync(`${fixtureDir}/alpha.spec.md`, '# probe\n')
  writeFileSync(`${fixtureDir}/beta.spec.md`, '---\ntraits:\n  - isInternal\n---\n# probe\n')
  writeFileSync(`${fixtureDir}/zz-own-spec-probe.stories.tsx`, "export default { title: 'Design System/Components/ZzOwnSpecProbe/展示', tags: ['autodocs'] }\n")
  const r = spawnSync(process.execPath, ['--', 'scripts/category-classification-invariant.mjs'], { stdio: 'pipe', encoding: 'utf8' })
  if (r.status === 0 || !/ZzOwnSpecProbe: 有 2 份 spec/.test(r.stdout ?? '')) { console.error(`✗ 兩份 spec 都不同名時 gate 沒有以「判不了」紅(exit ${r.status})`); ok = false }
  else console.log('✓ 兩份 spec 都不同名 → 判不了、紅(exit ' + r.status + ')')
} finally {
  rmSync(fixtureDir, { recursive: true, force: true })
}

// 6) 還原後必 PASS
if (run() !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log('✓ 還原後 PASS(gate exit 0)')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
