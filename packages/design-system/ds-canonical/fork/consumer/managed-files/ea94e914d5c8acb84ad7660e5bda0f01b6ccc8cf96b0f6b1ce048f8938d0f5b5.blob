#!/usr/bin/env node
/**
 * check-plugin-installed.mjs — postinstall governance-presence notice(provider-neutral)
 *
 * 2026-06-17 C-prime 改寫(adversarial pre-ship verify FINDING M4):
 *   舊版印「plugin NOT INSTALLED → /plugin install」巨型紅 banner,但 C-prime 治理
 *   改 committed-config + npm,**不需 plugin**(對齊同套件 CLAUDE.md「不需裝 plugin」)。
 *   舊 banner 在每次 npm install(含 Dependabot/sync workflow)誤嚇 fork user 說治理壞了。
 *   檔名保留(package.json postinstall + mirror ALLOWLIST + mirror workflow paths 三處同步,
 *   sync-governance-counters --check 驗 allowlist↔paths 對齊 → 改名會連鎖,故只改行為)。
 *
 * 偵測 immutable 治理 payload(node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json)。
 *   - 就位 → 確認；Claude/Codex adapters 已是 committed Day-0 views。
 *   - 缺 → 只回報 degraded；postinstall/SessionStart 都不得偷偷修補或解析 mutable tag。
 * **永遠 exit 0**(presence notice only；真正 hard gate 由 governance check/CI 負責)。
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const CWD = process.cwd()
const FORK_MANIFEST = resolve(CWD, 'node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json')

if (existsSync(FORK_MANIFEST)) {
  console.log('✓ DS immutable 治理 payload 就位；committed AGENTS/Claude/Codex adapters 可由同一 snapshot 驗證。')
  process.exit(0)
}

const YELLOW = '\x1b[33m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

console.log(`
${BOLD}💡 DS 治理 payload 尚未就位${RESET}(node_modules/@qijenchen/design-system/ds-canonical/fork 不存在)。

${YELLOW}不需 plugin，也不會由 AI session 自動安裝。${RESET}
  • 用唯一 bootstrap 安裝並驗證 committed snapshot:${BOLD}npm run setup:all${RESET}
  • 升級必指定 exact semver，走 upgrade branch/PR:${BOLD}npm run sync-all -- --to X.Y.Z${RESET}(只讀 plan)
  • 套用需乾淨專用分支:${BOLD}npm run sync-all -- --apply --to X.Y.Z${RESET}

Day-0 instructions/skills 已 committed；npm payload 補齊 provider-neutral 檢查與原生 hook 加速器。

${YELLOW}注:本 notice 不修改工作區也不宣稱治理已通過；最終結果只看 governance check + CI。${RESET}
`)

// 永遠 exit 0(notice-only)。
process.exit(0)
