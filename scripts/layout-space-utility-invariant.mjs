#!/usr/bin/env node
// layout-space-utility-invariant.mjs — 抓「裸 layout-space utility 名」silent fail。
//
// Why(2026-06-05 user「圖一 column header 文字貼邊」抓出):
//   `--layout-space-loose/tight/bottom` 是 token,但 **沒有**註冊成 Tailwind named utility
//   (@theme spacing scale 只有 field/table-row/tab/tree-indent,無 loose/tight)。
//   所以 className 寫 `px-loose` / `py-tight` / `pb-bottom` → Tailwind 產不出 CSS → **silently
//   無 padding**(built storybook css 證實無 .px-loose 規則)。唯一合法形式 = `px-[var(--layout-space-loose)]`。
//   resize-handle.stories L17/L62 hand-craft `px-loose` → column header 文字貼左邊界(無左 padding)。
//   = CLAUDE.md 失敗索引「Tailwind v4 自訂 utility 必註冊否則 silent 失效」的具體 case。
//
//   註:comment / docstring 裡寫 `px-loose` 當「鬆散 padding」簡寫 = 無害(不渲染),本 lint 不攔。
//   只攔**真 className / cn() 字串**裡的裸名。改 `px-[var(--layout-space-<name>)]` 即修。
//
// Run: `node scripts/layout-space-utility-invariant.mjs`(deterministic audit chain)。fail → exit 1。

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'packages/design-system/src')

// 裸 layout-space utility 名(這些 named 形式都 silent fail,只有 [var(--layout-space-*)] 合法)
const BARE = /\b(p[xytblr]?|m[xytblr]?|gap|space-[xy])-(loose|tight|cozy|bottom)\b/
// 合法 arbitrary 形式(含此 = OK)
const VALID = /var\(--layout-space-/
// comment 行(docstring 簡寫 px-loose,無害)
const COMMENT = /^\s*(\*|\/\/|\/\*|\{\s*\/\*)/
// 真 className / class 字串上下文(只在這類行攔,避免誤殺散文)
const CLASS_CTX = /className\s*=|cn\(|class:|'[^']*\b(p[xytblr]?|gap)-/

const failures = []
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(p); continue }
    if (!/\.tsx?$/.test(e.name)) continue
    const lines = readFileSync(p, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (COMMENT.test(line)) return
      if (!BARE.test(line)) return
      // 該行 BARE match 區段不在 var() 形式內 + 在 className/cn context
      if (VALID.test(line) && !line.replace(/px-\[var\(--layout-space-[a-z]+\)\]|p[xytblrym]?-\[var\([^)]*\)\]/g, '').match(BARE)) return
      if (!CLASS_CTX.test(line)) return
      const m = line.match(BARE)
      failures.push(`✗ ${p.replace(ROOT + '/', '')}:${i + 1} 裸 \`${m[0]}\`(silent fail,無 CSS)— 改 \`${m[1]}-[var(--layout-space-${m[2]})]\` — ${line.trim().slice(0, 80)}`)
    })
  }
}
walk(SRC)

console.log('\n=== Layout-Space Utility Invariant(裸 px-loose/py-tight silent-fail 防線)===')
console.log(`FAIL: ${failures.length}\n`)
if (failures.length) {
  console.log(failures.join('\n'))
  console.error(`\n✗ ${failures.length} 處 className 用裸 layout-space utility 名 → Tailwind 產不出 CSS(silent 無 padding)。`)
  console.error(`  修:px-loose → px-[var(--layout-space-loose)] / py-tight → py-[var(--layout-space-tight)] 等。`)
  process.exit(1)
}
console.log('✓ 無裸 layout-space utility(className 全用合法 [var(--layout-space-*)] 形式).')
process.exit(0)
