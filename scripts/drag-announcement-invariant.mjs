#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Drag announcement invariant — 防「DndContext 沒接播報」回流
// ═══════════════════════════════════════════════════════════════════════════
//
// 2026-09-07:全 DS 4 個 DndContext 先前沒有任何一個傳 `accessibility`,於是吃
// dnd-kit 的英文預設播報,而且它從自己的生命週期發 —— 我們的守衛 return 掉、
// 根本沒重排時,螢幕閱讀器仍會聽到「已放到 X」(對輔助科技宣稱假結果)。
// 修完之後這支閘防止未來新增 DndContext 時漏接。
//
// 形狀照 `scripts/agent-panel-fixed-anatomy-invariant.mjs`:純靜態掃描 + selftest。

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 路徑含中文 → 必須用 fileURLToPath 解碼,不能用 .pathname(會留下 %E6 這種百分號編碼)
const ROOT = fileURLToPath(new URL('../packages/design-system/src', import.meta.url))

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.tsx') && !name.includes('.stories.')) out.push(p)
  }
  return out
}

/** 回傳 [{file, line}] — 有 <DndContext 卻沒有 accessibility={{ announcements 的位置 */
export function findUnannouncedDndContexts(files) {
  const bad = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    if (!src.includes('<DndContext')) continue
    const lines = src.split('\n')
    lines.forEach((l, i) => {
      if (!l.includes('<DndContext')) return
      // 看這個 JSX 開標籤到 `>` 為止的區塊內有沒有 accessibility
      let block = ''
      for (let j = i; j < Math.min(i + 30, lines.length); j++) {
        block += lines[j] + '\n'
        if (/^\s*>\s*$/.test(lines[j]) || lines[j].includes('announcements }}>')) break
      }
      if (!/accessibility=\{\{\s*announcements/.test(block)) bad.push({ file: f.replace(ROOT, 'src'), line: i + 1 })
    })
  }
  return bad
}

if (process.argv.includes('--selftest')) {
  const cases = [
    { src: '<DndContext\n  onDragEnd={x}\n>', shouldFail: true },
    { src: '<DndContext\n  onDragEnd={x}\n  accessibility={{ announcements }}\n>', shouldFail: false },
    { src: '<DndContext a={1} onDragEnd={x} accessibility={{ announcements }}>', shouldFail: false },
    { src: 'no dnd here', shouldFail: false },
  ]
  let ok = true
  cases.forEach((c, i) => {
    const tmp = join(process.env.TMPDIR || '/tmp', `dai-selftest-${i}.tsx`)
    writeFileSync(tmp, c.src)
    const got = findUnannouncedDndContexts([tmp]).length > 0
    if (got !== c.shouldFail) { console.error(`selftest ${i} FAIL: 預期 ${c.shouldFail} 實得 ${got}`); ok = false }
  })
  console.log(ok ? '✓ selftest 4/4 通過' : '✗ selftest 失敗')
  process.exit(ok ? 0 : 1)
}

const bad = findUnannouncedDndContexts(walk(ROOT))
if (bad.length) {
  console.error('✗ 下列 DndContext 沒有傳 accessibility={{ announcements }} —— 會吃 dnd-kit 的英文預設,')
  console.error('  而且它從自己的生命週期播報,守衛 return 掉時仍會播假的成功訊息。')
  console.error('  消費 `lib/drag-announcements.ts` 的 createDragAnnouncements()。')
  bad.forEach(b => console.error(`    ${b.file}:${b.line}`))
  process.exit(1)
}
console.log(`✓ 全部 DndContext 都已接繁中播報並誠實回報結果`)
