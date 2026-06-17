#!/usr/bin/env node
// sync-all.mjs — 1-command 同步 DS 治理到最新(C-prime:npm-only,雲端可跑)
//
// 2026-06-17 C-prime 改寫(codex C5 共識 + 雲端探針實證):治理改 committed-config-first —
//   - 治理「本體」(fork hooks + 設計紀律 preamble)在 npm package 的 ds-canonical/fork/,`npm install @beta` 即最新。
//   - 設計紀律「事前注入」由 committed SessionStart hook 讀 npm-current preamble(下個 session 自動最新)。
//   - skills 由 committed `.claude/settings.json` 的 enabledPlugins 在雲端自動浮出(免 plugin 指令)。
// 故 sync-all = 純 npm(不再 shell `claude plugin ...`;舊 plugin 指令在雲端不可靠 #63028 + 非 npm-only)。
//
// Anchor:plain `npm install` 會被 lockfile 重現舊樹(codex risk 2)→ 明確 `@beta` 拿最新 beta(robust)。

import { spawnSync } from 'node:child_process'

function run(label, cmd, args) {
  process.stdout.write(`▶ ${label}... `)
  const result = spawnSync(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], encoding: 'utf8' })
  if (result.status === 0) { console.log('✓'); return true }
  console.log(`✗(exit ${result.status})`)
  if (result.stderr) console.log(`  stderr: ${result.stderr.trim().split('\n').slice(0, 3).join('\n  ')}`)
  return false
}

console.log('🔄 同步 DS 治理到最新(npm-only,雲端可跑)')
console.log('')

const ok = run(
  'npm install @qijenchen/{design-system,storybook-config}@beta(明確 @beta,不靠 lockfile/latest)',
  'npm',
  ['install', '@qijenchen/design-system@beta', '@qijenchen/storybook-config@beta', '--legacy-peer-deps'],
)

console.log('')
if (ok) {
  console.log('✅ 治理本體已更到最新(node_modules/@qijenchen/design-system/ds-canonical/fork)。')
  console.log('   • 設計紀律 preamble + fork hooks 隨 npm 更新。')
  console.log('   • Skills 由 committed enabledPlugins 自動浮出(免 plugin 指令)。')
  console.log('   👉 重啟 Claude Code session → committed hook 重讀 npm-current 治理生效。')
  process.exit(0)
}

console.log('⚠️  npm install 失敗 — 試 `npm install --legacy-peer-deps` 後重跑;確認網路可達 npm registry。')
process.exit(1)
