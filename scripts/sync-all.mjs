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

// §15 契約 flags:--dry-run(npm install --dry-run + 骨架只算不寫)/ --json(machine-readable 單一 JSON 輸出)
const DRY_RUN = process.argv.includes('--dry-run')
const AS_JSON = process.argv.includes('--json')
const say = (...a) => { if (!AS_JSON) console.log(...a) }

function run(label, cmd, args) {
  if (!AS_JSON) process.stdout.write(`▶ ${label}... `)
  const result = spawnSync(cmd, args, { stdio: [AS_JSON ? 'ignore' : 'inherit', 'pipe', 'pipe'], encoding: 'utf8' })
  if (result.status === 0) { say('✓'); return true }
  say(`✗(exit ${result.status})`)
  if (result.stderr) say(`  stderr: ${result.stderr.trim().split('\n').slice(0, 3).join('\n  ')}`)
  return false
}

say(`🔄 同步 DS 治理到最新(npm-only,雲端可跑)${DRY_RUN ? ' — dry-run 只算不寫' : ''}`)
say('')

const npmArgs = ['install', '@qijenchen/design-system@beta', '@qijenchen/storybook-config@beta', '--legacy-peer-deps']
if (DRY_RUN) npmArgs.push('--dry-run')
const ok = run(
  `npm install @qijenchen/{design-system,storybook-config}@beta(明確 @beta,不靠 lockfile/latest)${DRY_RUN ? '[dry-run]' : ''}`,
  'npm',
  npmArgs,
)

say('')
if (ok) {
  say('✅ 治理本體已更到最新(node_modules/@qijenchen/design-system/ds-canonical/fork)。')
  say('   • 設計紀律 preamble + fork hooks 隨 npm 更新。')

  // 接線骨架(committed 啟動器 + settings hooks + codex surface)從 npm-current idempotent 刷新 →
  // 達成「接線層」也完全同步(既有 fork 一鍵 adopt;DS 改啟動器後重跑即同步)。
  // 注:dry-run 時 npm install 沒真裝,骨架刷新按「現有 node_modules 內容」計算(仍只算不寫)。
  if (!AS_JSON) process.stdout.write(`▶ 刷新接線骨架(啟動器 + settings hooks + codex surface)${DRY_RUN ? '[dry-run]' : ''}... `)
  let refresh
  try { refresh = refreshLaunchers(process.cwd(), { dryRun: DRY_RUN }) } catch (e) { refresh = { error: String(e?.message || e) } }
  if (refresh?.error) {
    say(`⚠️(${refresh.error})`)
  } else if (refresh?.skipped) {
    say(`skip(${refresh.skipped})`)
  } else {
    say('✓')
    if (refresh.copied?.length) say(`   • 啟動器:${refresh.copied.join(' / ')}`)
    if (refresh.removed?.length) say(`   • 移除 obsolete plugin-era hook:${refresh.removed.join(' / ')}(防 brick:這些舊 hook 沒 plugin 會擋掉所有編輯)`)
    if (refresh.settingsMerged) say('   • settings.json hooks + permissions 已對齊 canonical(strip 舊 launcher + obsolete + append + union,未動你自有非治理 hook)。')
    if (refresh.skills?.length) say(`   • skills(可叫用如 /${refresh.skills[0]}):${refresh.skills.join(' / ')}(複製進 .claude/skills/,下個 session 生效;未動你自有 skill)`)
    if (refresh.commands?.length) say(`   • commands:${refresh.commands.join(' / ')}`)
    if (refresh.agents?.length) say(`   • agents:${refresh.agents.join(' / ')}`)
    if (refresh.codex?.length) say(`   • codex surface:${refresh.codex.join(' / ')}(AGENTS.md 標準 agent 原生 discovery;.codex hooks 需 Codex TUI /hooks 一次 trust 才生效)`)
    if (refresh.codexSkipped?.length) say(`   • codex surface 未動:${refresh.codexSkipped.join(' / ')}(你自有版本,如要吃治理版請刪除後重跑 sync-all)`)
  }

  if (AS_JSON) { console.log(JSON.stringify({ ok: true, dryRun: DRY_RUN, refresh })); process.exit(0) }
  console.log('')
  console.log('   ── 各軌生效時機(多數已即時/自動,不必盲目重啟整個 session)──')
  console.log('   ✅ 機械強制 hook:已即時生效(dispatcher 每次觸發即重讀 npm-current,無需動作)')
  console.log('   ✅ settings 接線:Claude Code file watcher 自動 hot-reload(無需動作;雲端或保險起見開新 session 最穩)')
  console.log('   🟡 設計指引 preamble + skills:本 session 仍舊版 → 開新 session 自動最新,或現在跑 /clear 立即刷新(⚠️ /clear 會清空本對話 history)')
  console.log('   👉 想立刻全套用最新指引:跑 /clear 或開新 session;只改 code 想繼續手上工作:機械強制已即時,不必動作')
  process.exit(0)
}

if (AS_JSON) { console.log(JSON.stringify({ ok: false, dryRun: DRY_RUN })); process.exit(1) }
console.log('⚠️  npm install 失敗 — 試 `npm install --legacy-peer-deps` 後重跑;確認網路可達 npm registry。')
process.exit(1)
