#!/usr/bin/env node
// cli-init.mjs — `npx @qijenchen/design-system-init` consumer-side 1-cmd setup
//
// What it does:
//   1. Symlink consumer-cwd/.claude/design-system → node_modules/@qijenchen/design-system/ds-canonical
//      → Claude Code 自動 load DS skills / hooks / rules / references / commands
//   2. Symlink consumer-cwd/CLAUDE.design-system.md → node_modules/@qijenchen/design-system/CLAUDE.md
//      → Consumer 自己的 CLAUDE.md import this for inherit DS mindset
//   3. Print consumer should add to their entry CSS(3-line setup)
//
// Why symlink not copy:
//   `npm update @qijenchen/design-system` 自動 sync 全部 SSOT(consumer 不用再跑)
//   per user 2026-05-25「每次手動更新 package 都能獲取最新跟 ds repo 同步的 ssot 等所有檔案」
//
// Idempotent: re-run safe(skip if symlink exists pointing same place).

import { existsSync, mkdirSync, symlinkSync, readlinkSync, lstatSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CWD = process.cwd()
const __dirname = dirname(fileURLToPath(import.meta.url))
// 本檔 ship 在 package root(package.json bin: "./cli-init.mjs")→ __dirname 即
// node_modules/@qijenchen/design-system/。2026-07-16 修(PNG §4 疑點證實為 bug):原
// `join(__dirname, '..')` 指到 node_modules/@qijenchen/ → 所有 source「not found」→
// init 全程靜默 skip(symlink 一個都沒建,假成功)。
const PACKAGE_ROOT = __dirname

function ensureSymlink(from, to, label) {
  const fromAbs = join(CWD, from)
  const toAbs = join(PACKAGE_ROOT, to)
  if (!existsSync(toAbs)) {
    console.warn(`⚠️ source not found: ${toAbs} — skip ${label}`)
    return
  }
  mkdirSync(dirname(fromAbs), { recursive: true })
  if (existsSync(fromAbs) || lstatSync(fromAbs, { throwIfNoEntry: false })) {
    // Check if it's already the right symlink
    try {
      const current = readlinkSync(fromAbs)
      const expected = relative(dirname(fromAbs), toAbs)
      if (current === expected) {
        console.log(`✓ ${label} already in sync(${from})`)
        return
      }
      // Wrong target — remove + redo
      unlinkSync(fromAbs)
    } catch {
      console.warn(`⚠️ ${from} exists but not a symlink — skip(remove manually if you want to re-link)`)
      return
    }
  }
  const relPath = relative(dirname(fromAbs), toAbs)
  symlinkSync(relPath, fromAbs, 'dir')
  console.log(`✓ linked ${label}: ${from} → ${relPath}`)
}

console.log('═══ @qijenchen/design-system init ═══')
console.log(`Consumer cwd: ${CWD}`)
console.log(`Package root: ${PACKAGE_ROOT}`)
console.log('')

// 1. Symlink DS canonical → .claude/design-system/
ensureSymlink('.claude/design-system', 'ds-canonical', 'DS canonical(skills/hooks/rules/references/commands)')

// 2. Symlink DS CLAUDE.md → CLAUDE.design-system.md
//    Consumer's own CLAUDE.md can `@import` or reference this file.
const dsCLAUDEsrc = join(PACKAGE_ROOT, 'CLAUDE.md')
if (existsSync(dsCLAUDEsrc)) {
  const dest = join(CWD, 'CLAUDE.design-system.md')
  if (!existsSync(dest)) {
    const rel = relative(dirname(dest), dsCLAUDEsrc)
    symlinkSync(rel, dest)
    console.log(`✓ linked CLAUDE.design-system.md → ${rel}`)
  } else {
    console.log(`✓ CLAUDE.design-system.md already exists(skip)`)
  }
}

// 3. AGENTS.md 投影到 consumer root(PNG P2.4:Codex 等 AGENTS.md 標準 agent 原生 discovery)
//    Consumer-owned:存在則 skip + 提示 merge,絕不覆蓋。內容 = pointer stub(指 npm 內
//    DS AGENTS.md 本體 → npm update 自動最新,stub 零 drift;對齊 ADR-1 禁 symlink 作唯一機制)。
const consumerAgents = join(CWD, 'AGENTS.md')
if (existsSync(join(PACKAGE_ROOT, 'AGENTS.md'))) {
  if (!existsSync(consumerAgents)) {
    writeFileSync(consumerAgents, `# AI agent instructions(this repo consumes @qijenchen/design-system)

<!-- generated once by qijenchen-ds-init;consumer-owned — 建立後歸你維護,可自由增寫。 -->

本 repo 消費 \`@qijenchen/design-system\`。**寫 UI / 設計決策前先讀 DS 治理核心**(隨 npm update 自動最新):

- \`node_modules/@qijenchen/design-system/AGENTS.md\` — DS 治理核心(mindset / SSOT 消費 / 命名 / 4-Family)
- \`node_modules/@qijenchen/design-system/ds-canonical/\` — rules / references / skills 全文
- \`node_modules/@qijenchen/design-system/src/components/<Name>/<name>.spec.md\` + \`.stories.tsx\` — 元件何時用 / 官方 composition

(在下方加入你產品自己的 instructions。)
`)
    console.log('✓ created AGENTS.md(pointer stub → DS 治理核心;consumer-owned,可自由增寫)')
  } else {
    console.log('✓ AGENTS.md already exists(skip;如要吃 DS 治理,手動 merge 一行指路 node_modules/@qijenchen/design-system/AGENTS.md)')
  }
}

console.log('')
console.log('═══ Next steps ═══')
console.log('1. Add to your entry CSS(globals.css):')
console.log('   @import \'tailwindcss\';')
console.log('   @import \'@qijenchen/design-system/styles/tokens\';')
console.log('   @source \'../node_modules/@qijenchen/design-system/src/**/*.{js,ts,jsx,tsx}\';')
console.log('')
console.log('2. Wrap your app root in <TooltipProvider>:')
console.log('   import { TooltipProvider } from \'@qijenchen/design-system\'')
console.log('   <TooltipProvider><App /></TooltipProvider>')
console.log('')
console.log('3. Restart your Claude Code session to pick up newly-linked .claude/design-system/.')
console.log('   Claude 自動 load DS skills / hooks / rules / references / commands。')
console.log('')
console.log('All Done. Future `npm update @qijenchen/design-system` 會 auto-sync all SSOT via symlink.')
