#!/usr/bin/env node
// sync-all.mjs — 1-command 同步 DS 治理到最新(C-prime:npm-only,雲端可跑)
//
// 2026-06-17 C-prime 改寫(codex C5 共識 + 雲端探針實證):治理改 committed-config-first —
//   - 治理「本體」(fork hooks + 設計紀律 preamble)在 npm package 的 ds-canonical/fork/,`npm install @beta` 即最新。
//   - 設計紀律「事前注入」由 committed SessionStart hook 讀 npm-current preamble(下個 session 自動最新)。
//   - skills(slash command)非 C-prime 自動送達(Claude Code 不認 node_modules + 專案級 enabledPlugins 靜默忽略 #62174);治理核心靠 preamble 注入 + dispatcher hooks,不靠 skills。
// 故 sync-all = 純 npm(不再 shell `claude plugin ...`;舊 plugin 指令在雲端不可靠 #63028 + 非 npm-only)。
//
// Anchor:plain `npm install` 會被 lockfile 重現舊樹(codex risk 2)→ 明確 `@beta` 拿最新 beta(robust)。

import { spawnSync } from 'node:child_process'
import { refreshLaunchers } from './refresh-fork-launchers.mjs'

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

  // 接線骨架(committed 啟動器 + settings hooks)從 npm-current launchers idempotent 刷新 →
  // 達成「接線層」也完全同步(既有 fork 一鍵 adopt;DS 改啟動器後重跑即同步)。
  process.stdout.write('▶ 刷新接線骨架(啟動器 + settings hooks)... ')
  let refresh
  try { refresh = refreshLaunchers(process.cwd()) } catch (e) { refresh = { error: String(e?.message || e) } }
  if (refresh?.error) {
    console.log(`⚠️(${refresh.error})`)
  } else if (refresh?.skipped) {
    console.log(`skip(${refresh.skipped})`)
  } else {
    console.log('✓')
    if (refresh.copied?.length) console.log(`   • 啟動器:${refresh.copied.join(' / ')}`)
    if (refresh.removed?.length) console.log(`   • 移除 obsolete plugin-era hook:${refresh.removed.join(' / ')}(防 brick:這些舊 hook 沒 plugin 會擋掉所有編輯)`)
    if (refresh.settingsMerged) console.log('   • settings.json hooks + permissions 已對齊 canonical(strip 舊 launcher + obsolete + append + union,未動你自有非治理 hook)。')
    if (refresh.skills?.length) console.log(`   • skills(可叫用如 /${refresh.skills[0]}):${refresh.skills.join(' / ')}(複製進 .claude/skills/,下個 session 生效;未動你自有 skill)`)
    if (refresh.commands?.length) console.log(`   • commands:${refresh.commands.join(' / ')}`)
    if (refresh.agents?.length) console.log(`   • agents:${refresh.agents.join(' / ')}`)
  }

  console.log('   👉 重啟 Claude Code session → committed hook 重讀 npm-current 治理 + skills 生效。')
  process.exit(0)
}

console.log('⚠️  npm install 失敗 — 試 `npm install --legacy-peer-deps` 後重跑;確認網路可達 npm registry。')
process.exit(1)
