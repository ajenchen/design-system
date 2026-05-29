#!/usr/bin/env node
// sync-all.mjs — 1-command sync npm + Claude plugin marketplace + plugin install
//
// Anchor:2026-05-28 全盤 sweep round 4 — 原 inline `sync-all` script 用
// `2>/dev/null && ... && echo "✓"` chain → 任一 step silent fail 仍顯 ✓ 誤導 user
// 以為 sync 完成。本 script 顯式 try each step + report per-step status。

import { spawnSync } from 'node:child_process'

function run(label, cmd, args) {
  process.stdout.write(`▶ ${label}... `)
  const result = spawnSync(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], encoding: 'utf8' })
  if (result.status === 0) {
    console.log('✓')
    return true
  }
  console.log(`✗(exit ${result.status})`)
  if (result.stderr) console.log(`  stderr: ${result.stderr.trim().split('\n').slice(0, 3).join('\n  ')}`)
  return false
}

console.log('🔄 Syncing all sources(npm + Claude plugin marketplace + plugin install)')
console.log('')

const results = {
  npm: run(
    'npm update @qijenchen/* to latest @beta',
    'npm',
    ['update', '@qijenchen/design-system', '@qijenchen/storybook-config', '--legacy-peer-deps'],
  ),
  marketplace: run(
    'Claude plugin marketplace update qijenchen-ds',
    'claude',
    ['plugin', 'marketplace', 'update', 'qijenchen-ds'],
  ),
  plugin: run(
    'Claude plugin update design-system@qijenchen-ds',
    'claude',
    ['plugin', 'update', 'design-system@qijenchen-ds'],
  ),
}

console.log('')
const passed = Object.values(results).filter(Boolean).length
const total = Object.keys(results).length

if (passed === total) {
  console.log(`✅ All ${total} sources synced. Restart Claude Code session to apply plugin changes.`)
  process.exit(0)
}

console.log(`⚠️  ${passed}/${total} sources synced — review ✗ lines above for fail reason:`)
if (!results.npm) {
  console.log(`  • npm update fail → 試 \`npm install --legacy-peer-deps\` 後重跑`)
}
if (!results.marketplace) {
  console.log(`  • Claude plugin marketplace fail`)
  console.log(`    常見原因 1:marketplace 'qijenchen-ds' 還沒 add 到 local Claude CLI`)
  console.log(`       → 跑:claude plugin marketplace add github:ajenchen/design-system`)
  console.log(`         (一次性 setup,之後 sync-all 才 work)`)
  console.log(`    常見原因 2:claude CLI 不在 PATH`)
  console.log(`       → which claude → 無 → install Claude Code CLI(https://claude.com/code)`)
}
if (!results.plugin) {
  console.log(`  • Plugin 'design-system' update fail`)
  console.log(`    常見原因:plugin 還沒 install`)
  console.log(`       → 跑:claude plugin install design-system@qijenchen-ds`)
  console.log(`         (一次性 setup,之後 sync-all 才 work)`)
}

console.log('')
console.log('完整 first-time setup(fork user):')
console.log('  1. claude plugin marketplace add github:ajenchen/design-system')
console.log('  2. claude plugin install design-system@qijenchen-ds')
console.log('  3. npm run sync-all   # 之後每次 DS update 跑此')

// Exit 1 if any step failed — surface to user / CI
process.exit(1)
