#!/usr/bin/env node
// release-preflight.mjs — 單一指令跑 release.yml publish 會 check 的全部 gate,fail-fast。
//
// ROOT CAUSE FIX(2026-06-02):beta.43/45 連續多次 push 失敗,根因全相同 ——
//   「發版前靠手動記得逐道跑 sync / check → 一定會漏」(beta.43 漏 version-sync + ds-canonical;
//    beta.45 又漏 ds-canonical re-sync)。release CI gate 是對的,是本地 preflight 不完整。
//
// 本指令 = ① 先跑 SYNCS(version 5-manifest + ds-canonical → 修 drift,CI 抓不到)
//          ② 跑全部 deterministic gate(1:1 對齊 release.yml「Audit gates」)
//          ③ build + FULL story smoke + dogfood(packaging + runtime gate)
//          ④ 5-manifest version 一致性 verify
//          ⑤ 全過才寫 pass-marker(.claude/logs/release-preflight-pass.json,綁 HEAD sha,
//             per-machine untracked 產物 —— 不入 git / 不入 CI,僅供本機 PreToolUse 比對)
//
// tag-push 機械強制:check_solo_workflow.sh 的 R4 驗 marker.head == 當前 HEAD,否則 BLOCK
//   → 把「靠人記得跑 preflight」變「機械保證」。(無獨立 check_tag_preflight.sh — 用 R4 復用既有 hook)
//
// 用法:npm run release:preflight  (bump 版本後、push tag 前跑;全過再 tag)

import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'

let stepNum = 0
function run(label, cmd) {
  stepNum++
  process.stdout.write(`\n▶ [${stepNum}] ${label}\n    $ ${cmd}\n`)
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() })
  } catch {
    console.error(`\n❌ RELEASE PREFLIGHT FAIL at step ${stepNum}: ${label}`)
    console.error('   修掉上面的錯,re-run `npm run release:preflight`。tag 前必全過。')
    process.exit(1)
  }
}

console.log('═══ Release Preflight — 1:1 release.yml gates,fail-fast ═══')

// ① SYNCS first(修 drift,讓 CI 抓不到)
run('sync version → 5 manifests', 'node scripts/sync-version-to-all-manifests.mjs')
run('sync ds-canonical mirror', 'node scripts/sync-ds-canonical.mjs')
// C-prime fork governance corpus 從 .claude SSOT 重生(hooks + preamble,deterministic)→ 下方 --check 驗 + commit 進 tag。
run('sync fork-governance corpus(hooks + preamble ← .claude SSOT)', 'node scripts/build-fork-governance.mjs')
// PNG P2.2:codex 原生 surface(.codex/hooks.json + .agents/skills)從 .claude SSOT 重生 → 下方 --check 驗。
run('sync codex adapter(.codex/hooks.json + .agents/skills ← .claude SSOT)', 'node scripts/gen-codex-adapter.mjs')
// llms.txt/llms-full.txt 從 spec frontmatter build-time 重生(deterministic,禁手維護;對齊 Mantine
// 「每 release 從 source 重生」)。SYNCS 段重生 → 下方 drift gate 驗 + commit 進 tag。
run('sync llms.txt + llms-full.txt(從 spec frontmatter)', 'node scripts/gen-llms-txt.mjs')
run('sync template canonical App(dashboard-app.tsx ← apps/template App.tsx)', 'node scripts/sync-template-canonical-app.mjs')

// ② Deterministic audit gates(== release.yml「Audit gates」step + story type-check)
run('tsc -b', 'npx tsc -b')
run('typecheck:stories', 'npm run --silent typecheck:stories')
run('audit-orphan-tokens', 'node scripts/audit-orphan-tokens.mjs --check')
run('categorical-color-invariants', 'node scripts/categorical-color-invariants.mjs')
run('motion-delay-invariants', 'node scripts/audit-motion-delay-invariants.mjs')
run('status-color-invariant(progress/step/in-progress → --info)', 'node scripts/status-color-invariant.mjs')
run('layout-space-utility-invariant(裸 px-loose silent-fail)', 'node scripts/layout-space-utility-invariant.mjs')
run('category-classification-invariant(分類三訊號一致)', 'node scripts/category-classification-invariant.mjs')
run('item-content-leading-coherence(防 reading-gap+compact-行高 off-grid 偏移,Notice 2026-06-15 anchor)', 'node scripts/item-content-leading-coherence.mjs')
run('checkbox-group-handcraft(防手刻 div 包選項 Checkbox,2026-06-15 popover/sheet/coachmark anchor)', 'node scripts/checkbox-group-handcraft-invariant.mjs')
run('layout-space-story-coherence(防 token overview story 顯示值 drift,2026-06-15 tight 8≠12 anchor)', 'node scripts/layout-space-story-coherence.mjs')
run('overlay-density-lock-placement(防 density lock 設在 header 非 surface 根,FileViewer 圖二 anchor)', 'node scripts/overlay-density-lock-placement.mjs')
run('code-quality-audit', 'node scripts/code-quality-audit.mjs --scope=packages/design-system/src/components --check')
run('content-quality', 'node scripts/audit-content-quality.mjs --check')
run('governance-counters', 'node scripts/sync-governance-counters.mjs --check')
// 2026-07-10 user「每類病根必有防線,稽核應確認這個基本原則」→ dim 91 常設閘進發版鏈:
// registry 每 failure class 必 protected / remediating+plan / judgment+auditDim,缺 = 擋發版。
run('failure-class coverage(dim 91,每類病根必有防線)', 'node scripts/audit-failure-class-coverage.mjs --check')
run('hook-test coverage(BLOCKER hook 必有 test 檔)', 'node scripts/audit-hook-test-coverage.mjs --check')
run('gate meta-test coverage(checker gate 必有 meta-test;ratchet 只擋新洞)', 'node scripts/audit-gate-meta-test-coverage.mjs --check')
run('gen-figma-make-artifacts', 'node scripts/gen-figma-make-artifacts.mjs --check')
run('root barrel internal-exclusion(dim-72)', 'node scripts/gen-design-system-barrel.mjs --check')
run('plugin-structure-validate', 'node scripts/plugin-structure-validate.mjs')
run('story-quality', 'npm run --silent story-quality:check')
run('three-layer stories(每 public 元件必備 anatomy+principles;取代 dim-11 AI 假證據)', 'node scripts/check-three-layer-stories.mjs --check')
run('LinkTo integrity(story 改名/retire 反向引用斷鏈;DA3 C.0b 謂詞化)', 'node scripts/audit-linkto-integrity.mjs --check')
run('agents-bootstrap(PNG:AGENTS.md ≤32KiB + CLAUDE.md @import + Rule Index 零死鏈 + 無雙 SSOT + npm mirror)', 'node scripts/check-agents-bootstrap.mjs --check')
// PNG P2.2:codex adapter 生成物(.codex/hooks.json + .agents/skills)vs .claude SSOT drift + eligibility 鎖
run('codex-adapter drift check(.codex + .agents ← SSOT;eligibility 機械鎖)', 'node scripts/gen-codex-adapter.mjs --check')
// PNG P4.2:branch-protection probe(資訊模式 — main 現無 required checks,已列 user 拍板;user 啟用後改 --check enforcing)
run('branch-protection probe(informational)', 'node scripts/check-branch-protection.mjs')
run('governance-tamper(preflight gate-count ratchet + time-boxed waiver 過期)', 'node scripts/check-governance-tamper.mjs --check')
run('rule coverage(91 dim 全分類 + 機制檔案存在 + rule-ID;PNG P3.3)', 'npm run --silent audit:coverage-matrix')
run('inline-edit view geometry invariant(多行 py == Textarea edit py,read↔edit 零跳鎖)', 'node scripts/inline-edit-view-geometry-invariant.mjs')
run('ds-canonical drift check', 'node scripts/sync-ds-canonical.mjs --check')
// C-prime #5(2026-06-17 codex 共識 C3 future-SSOT 閘):fork 治理 corpus 必過(a) classify 漏接閘
// (新增 hook 未分類 = FAIL)+(b) 生成物 vs SSOT drift gate,且(c) 假 fork harness 防假生效。
// 這把「未來 DS 治理增刪改 → fork 同步」從『靠記得』變『機械強制』(漏分類/drift/假生效 = 擋發版)。
run('fork-governance --check(classify 漏接 + drift gate,C3 future-SSOT)', 'node scripts/build-fork-governance.mjs --check')
run('fork-governance harness(假 fork 防 false-green/brick/crash)', 'node scripts/test-fork-governance.mjs')
run('template canonical App drift check(防 receiver 覆寫 scaffold App.tsx)', 'node scripts/sync-template-canonical-app.mjs --check')
// 2026-06-08:DS src 改了必 bump 才 republish(補「republish 靠 AI 記得 bump」非機械斷點)。
// preflight 此時 version 已 bump → gate 見「bumped → OK」綠;若忘 bump 直 push 則 ci.yml 同道 gate 擋。
run('DS src republish gate(src 改了必 bump,防 ship stale)', 'node scripts/check-src-republish.mjs --check')
run('llms.txt drift check(build-time derive,禁手維護)', 'node scripts/gen-llms-txt.mjs --check')
run('Field cascade-resolve gate(防新控件漏讀 size/mode/disabled context — 統一 SSOT)', 'node scripts/check-field-cascade-resolve.mjs')

// ③ Build + smoke + dogfood(== release.yml publish job + smoke-shard job)
run('build:lib', 'npm run --silent build:lib')
// bundle-size gate(2026-07-07 治理進化收尾:performance-audit 自認缺口補上;budget SSOT =
// packages/design-system/bundle-budget.json,蓄意增大 → --init 更新 + commit 說明)
run('bundle-size gate', 'node scripts/check-bundle-size.mjs --check')
run('naming-structure invariant', 'node scripts/naming-structure-invariant.mjs')
// 2026-06-16 root-cause gate:apps/template 是 React 19 workspace,root tsc -b references 不含它 → React19
// 專屬錯(@types/react 移除全域 JSX namespace → `JSX.Element` TS2503)只在 receiver `cd apps/template &&
// npm run build` 才炸,DS preflight 一路假綠 ship(bde81e7e 2026-06-12 brick ds-product-template receiver +
// 自身 Audit + Dependabot PR,連敗到 beta.67)。跑 receiver 同款 build command 在 tag 前攔下此 class。
run('build apps/template(React19 receiver build — 防 root tsc 漏掉的 receiver-only TS2503)', 'cd apps/template && npm run build')
run('build-storybook', 'npm run --silent build-storybook')
// FULL story runtime smoke == release.yml smoke-shard job(被 `needs:` 硬 gate)。這是唯一能攔
// SizeMatrix 那類 {var}-undefined / runtime crash 的 gate;build-storybook 是 compile-time、dogfood
// 只 render 2 個 component,都攔不到。漏此道 = preflight marker 綠但 CI smoke 仍會紅(2026-06-02 audit
// iceberg)。
// 2026-07-18 root-cause fix:本機原「單次串跑全 961」在 ~60 story 後 python http.server + chromium 資源
// 累積把後續 probe 拖垮(false hang;非程式錯)。改為本機也分 8 shard 串跑(全 961 零抽樣、每 shard 重起
// server + browser 即資源歸零 → 不再拖垮),對齊 CI smoke-shard matrix 本來就分片的作法。任一 shard 非 0 →
// 整步 fail。每 shard 前清 port 殘留 server 避免 bind 衝突 false-fail。
// ⚙️ GATE RETIRE 理由(governance-tamper R1 ratchet,baseline 52→51,同 commit 更新 preflight-gate-baseline.json):
//   原獨立 `run('clear smoke port 8920', ...)` step 併入下方 shard 迴圈內(每 shard 前清 port,比原「跑前清一次」
//   更正確)→ run() 呼叫數 -1。非移除防線:清 port 邏輯仍在(移進迴圈)、smoke 覆蓋零損失(全 961)。
run('FULL storybook runtime smoke — 分 8 shard 串跑(全 961 story 零抽樣;每 shard 資源歸零防拖垮)',
  'for N in 1 2 3 4 5 6 7 8; do lsof -ti:8920 | xargs kill -9 2>/dev/null || true; node scripts/storybook-smoke-test.mjs --full --shard=$N/8 || exit 1; done')
// InlineEdit 對齊 + blur exit pixel invariant(2026-07-17 root cause 修的機械鎖):委派控件 view 左緣落 label
// x=0(Δ≤1.5px)+ 點 Status 進 edit→blur→editing=0 回 display 無殘留。需 storybook-static(build 後才跑)。
run('InlineEdit 對齊 + blur exit pixel invariant', 'node scripts/probe-inline-edit-align.mjs')
run('dogfood pre-publish verify', 'node scripts/dogfood-prepublish-verify.mjs')

// ④ 5-manifest version 一致性 verify(== release.yml BLOCKER L199)
process.stdout.write(`\n▶ [${++stepNum}] 5-manifest version 一致性\n`)
const versions = {
  'design-system': JSON.parse(readFileSync('packages/design-system/package.json', 'utf8')).version,
  'storybook-config': JSON.parse(readFileSync('packages/storybook-config/package.json', 'utf8')).version,
  'plugin.json': JSON.parse(readFileSync('.claude-plugin/plugin.json', 'utf8')).version,
}
const mk = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf8'))
versions['marketplace.metadata'] = mk.metadata.version
versions['marketplace.plugins[ds]'] = (mk.plugins.find((p) => p.name === 'design-system') || {}).version
const uniq = [...new Set(Object.values(versions))]
if (uniq.length !== 1) {
  console.error('❌ 5-manifest version 不一致:', JSON.stringify(versions, null, 2))
  console.error('   修:node scripts/sync-version-to-all-manifests.mjs')
  process.exit(1)
}
console.log(`    ✓ 5 manifests 全一致 = ${uniq[0]}`)

// ④.5 template consumer dep 一致性(2026-06-08:防 template DS dep 落後 DS version 再現「beta.32」)
// sync-version-to-all-manifests.mjs 已把 template DS+sb dep 改寫成 `^DSversion`;此處 fail-closed 斷言
// 「沒同步就不准 tag」。注:apps/template 的 `*` workspace dep 由 mirror 處理,不在此驗。
const tmplPkg = JSON.parse(readFileSync('template/ds-product-template/package.json', 'utf8'))
const tmplExpected = `^${uniq[0]}`
const tmplDeps = {
  '@qijenchen/design-system': tmplPkg.dependencies?.['@qijenchen/design-system'],
  '@qijenchen/storybook-config': tmplPkg.dependencies?.['@qijenchen/storybook-config'],
}
const tmplDrift = Object.entries(tmplDeps).filter(([, v]) => v !== tmplExpected)
if (tmplDrift.length) {
  console.error(`❌ template consumer dep 落後 DS version(應 ${tmplExpected}):`, JSON.stringify(tmplDeps, null, 2))
  console.error('   修:node scripts/sync-version-to-all-manifests.mjs')
  process.exit(1)
}
console.log(`    ✓ template consumer dep 對齊 ${tmplExpected}`)

// ④.9 worktree-clean 終局 gate(2026-06-12 beta.66 CI 紅燈根治):上方 sync 步驟(ds-canonical /
// llms / template canonical App / 5-manifest)會「重生」working tree 檔案 — 若有未 commit 的重生產物,
// pass-marker 綁的 HEAD 不含它們 → tag 的乾淨 checkout 在 CI 同道 drift gate 必紅(local 綠 / CI 紅)。
// 故 marker 寫入前 worktree 必乾淨;dirty → fail-fast 列檔要求先 commit 再重跑。
import { execSync as _ex } from 'node:child_process'
{
  const dirty = _ex('git status --porcelain', { encoding: 'utf8' }).trim()
  if (dirty) {
    console.error('\n❌ RELEASE PREFLIGHT FAIL: sync 步驟產生未 commit 的重生檔案(tag 會缺它們 → CI drift gate 必紅):')
    console.error(dirty.split('\n').map((l) => '   ' + l).join('\n'))
    console.error('   修:git add -A && git commit(訊息註明 preflight sync 產物)→ 重跑 npm run release:preflight')
    process.exit(1)
  }
}

// ⑤ pass-marker(綁 HEAD sha)— PNG P3.4:attestation 格式(repo/SHA/版本/治理 digest/gates PASS 清單/surface)
const head = execSync('git rev-parse HEAD').toString().trim()
mkdirSync('.claude/logs', { recursive: true })
const crypto = await import('node:crypto')
const sha256 = (f) => { try { return crypto.createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16) } catch { return null } }
writeFileSync(
  '.claude/logs/release-preflight-pass.json',
  JSON.stringify({
    head, version: uniq[0], ts: new Date().toISOString(),
    repo: 'ajenchen/design-system',
    governanceDigest: { agentsMd: sha256('AGENTS.md'), claudeMd: sha256('CLAUDE.md'), coverageMatrix: sha256('.claude/logs/audit-coverage-matrix.json'), preflightGateBaseline: sha256('.claude/references/preflight-gate-baseline.json') },
    gatesPassed: stepNum,
    surface: process.env.CLAUDECODE ? 'claude-code-local' : process.env.CODEX_SANDBOX ? 'codex' : 'shell',
    ruleIds: 'DS-DIM-001..091(coverage → .claude/logs/audit-coverage-matrix.json)',
  }, null, 2) + '\n',
)
console.log(`\n✅ RELEASE PREFLIGHT PASS @ ${head.slice(0, 8)}  version=${uniq[0]}`)
console.log('   pass-marker 已寫(綁此 HEAD)→ 現在可安全 tag + push tag。')
console.log('   ⚠️ tag 前若再有 commit,須重跑 preflight(marker 綁 HEAD,變了就 BLOCK)。')
