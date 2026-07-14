#!/usr/bin/env node
// check-src-republish.mjs — 機械閘:DS src 改了但版本沒 bump → BLOCK(防 ship stale)
//
// 2026-06-08 補(user 質問「ds push main → template 自動同步」鏈最弱的非機械環節):
//   release.yml 只在 push tag `v*` 觸發 npm publish;plain main push 只 dispatch event 不 republish。
//   所以「DS src(含 stories/components)改了 push main、但 AI 忘記 bump+tag」→ npm 版本 stale →
//   consumer `npm install @beta` 解析到同版本 = no-op → 拿不到新 code。**完全沒有機械閘擋這個**。
//
// 本 gate(CI main-push + release-preflight + release.yml 三處跑):
//   baseline = npm latest published 版本(npm view,primary)/ git tag 排序(fallback);
//   diff **npm 真實 publish surface**(SSOT = packages/design-system/package.json "files" 欄)
//   between v<baseline> 與 HEAD。2026-07-14 dim-66 修:原 gate 只看 src runtime + ds-canonical/fork,
//   且註解錯稱「stories / spec.md 不 ship」—— files 欄實際 ship src/**/*.{tsx,ts,css}(**含 stories**,
//   無 negate)+ src/**/*.spec.md + src/**/*.json + **整個 ds-canonical corpus**(rules / references /
//   skills / commands / hooks,僅排 ds-canonical/.claude)+ README.md / CLAUDE.md / cli-init.mjs /
//   ds-story-manifest.json / llms*.txt。這些 surface 改了沒 bump 一樣 stale-ship(dispatch event 成功、
//   receiver 重裝未變 @beta 仍是 no-op)。
//   若 ship-relevant diff 非空 **且** currentVersion === npm latest(沒 bump)→ exit 1(BLOCK)。
//   不 ship 的檔(spec.ts / test.ts / repo 治理檔)改 → 不擋。已 bump → 不擋(會走發版鏈)。
//   網路失敗 / 無 baseline tag → 降級 warn-only exit 0(不讓 registry 抖動擋住正常 push)。
//
// 對齊世界級:changesets `status --since` / Lerna-Nx affected-since-tag 都用「diff vs published baseline」。

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const CHECK = process.argv.includes('--check')
const PKG = 'packages/design-system'
const SRC_GLOB = `${PKG}/src`
// 整個 ds-canonical corpus ship 進 npm(files: "ds-canonical" + "!ds-canonical/.claude")。
// 歷史:2026-06-08 只納 fork 子目錄(adversarial run-4 MAJOR);2026-07-14 dim-66 對齊 files 欄
// 全 corpus(rules / references / skills / commands / hooks 同樣 ship,改了沒 bump = stale-ship)。
const CANONICAL_GLOB = `${PKG}/ds-canonical`
// package root 的 shipped 單檔(files 欄列名 + package.json 本身 npm 恆 ship)
const ROOT_SHIPPED = [
  `${PKG}/README.md`,
  `${PKG}/CLAUDE.md`,
  `${PKG}/cli-init.mjs`,
  `${PKG}/ds-story-manifest.json`,
  `${PKG}/llms.txt`,
  `${PKG}/llms-full.txt`,
  `${PKG}/package.json`,
]

const sh = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim()
const warn = (msg) => { console.warn(`⚠️  ${msg}`); process.exit(0) }  // 降級:不擋

const currentVersion = JSON.parse(readFileSync(`${PKG}/package.json`, 'utf8')).version

// ── baseline = npm latest(primary)/ git tag 排序(fallback)──
let npmLatest = null
try {
  npmLatest = sh('npm view @qijenchen/design-system version', { timeout: 20000 })
} catch {
  // 網路 / registry 失敗 → fallback git tag
}
let baselineVersion = npmLatest
if (!baselineVersion) {
  try {
    const tags = sh('git tag --list "v*" --sort=-v:refname').split('\n').filter(Boolean)
    // 取第一個 ≠ v<current> 的 tag(current 若已 tag 則取次新;current 未 tag 則取最新已發)
    const baseTag = tags.find((t) => t !== `v${currentVersion}`) || tags[0]
    baselineVersion = baseTag ? baseTag.replace(/^v/, '') : null
  } catch {
    warn('無法取 npm latest 也無 git tag baseline → skip republish gate(降級,不擋)')
  }
}
if (!baselineVersion) warn('無 baseline 版本(首次發版?)→ skip republish gate')

const baselineTag = `v${baselineVersion}`

// 確保 baseline tag 本地存在(CI shallow clone 可能缺)→ 試 fetch,失敗則降級
try {
  sh(`git rev-parse --verify --quiet ${baselineTag}^{commit}`)
} catch {
  try { sh(`git fetch --quiet --depth=1 origin tag ${baselineTag}`) } catch { /* ignore */ }
  try { sh(`git rev-parse --verify --quiet ${baselineTag}^{commit}`) }
  catch { warn(`baseline tag ${baselineTag} 本地不存在(shallow clone?)→ skip republish gate(降級)`) }
}

// ── ship-relevant diff:對齊 package.json "files" 欄真實 publish surface ──
let changed = []
try {
  changed = sh(`git diff --name-only ${baselineTag} HEAD -- ${SRC_GLOB} ${CANONICAL_GLOB} ${ROOT_SHIPPED.join(' ')}`).split('\n').filter(Boolean)
} catch (e) {
  warn(`git diff 失敗(${e.message.split('\n')[0]})→ skip republish gate`)
}
// files 欄對照(SSOT = packages/design-system/package.json):
//   src/**/*.{tsx,ts,css} + *.spec.md + *.json ship(**含 stories.tsx** — 無 negate);
//   顯式 negate:!src/**/*.spec.ts / !src/**/*.test.ts / !ds-canonical/.claude。
const isShipRelevant = (f) => {
  if (ROOT_SHIPPED.includes(f)) return true
  if (f.startsWith(`${CANONICAL_GLOB}/`)) return !f.startsWith(`${CANONICAL_GLOB}/.claude/`)
  if (!f.startsWith(`${SRC_GLOB}/`)) return false
  if (/\.spec\.ts$/.test(f) || /\.test\.ts$/.test(f)) return false
  return /\.(tsx|ts|css|json)$/.test(f) || /\.spec\.md$/.test(f)
}
const shipDiff = changed.filter(isShipRelevant)

// ── 判定 ──
if (shipDiff.length === 0) {
  console.log(`✓ republish gate:npm publish surface 無 ship-relevant 改動 vs ${baselineTag}(非 shipped 檔或無改)→ 不需 republish`)
  process.exit(0)
}
const bumped = currentVersion !== baselineVersion
if (!bumped) {
  console.error(`\n❌ republish gate BLOCK:npm publish surface 已改但版本沒 bump(still ${currentVersion},npm latest 已是此版)`)
  console.error(`   → 此 push 不會 republish npm → consumer \`npm install @beta\` 拿到 stale code。`)
  console.error(`   ship-relevant 改動(${shipDiff.length}):`)
  shipDiff.slice(0, 20).forEach((f) => console.error(`     - ${f}`))
  console.error(`\n   修:bump packages/design-system/package.json 版本 → 跑 \`npm run release:preflight\` → tag + push tag。`)
  process.exit(1)
}
console.log(`✓ republish gate:publish surface 改了且版本已 bump(${baselineVersion} → ${currentVersion})→ 會走發版鏈,OK`)
process.exit(0)
