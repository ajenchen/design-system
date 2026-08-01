#!/usr/bin/env node
/**
 * audit-a11y.mjs — Run axe-core against every Storybook story headlessly
 *
 * 2026-05-23 Decision 4 autonomous (per user verbatim「決策四你看怎樣世界級的做法就怎樣不以省工為前提，
 * 這種東西為何需要我決策?不是就是按照我規定的標準跑嗎?」)
 *
 * Pipeline:
 *   1. Read storybook-static/index.json (Storybook build manifest with all stories)
 *   2. For each story → render `iframe.html?id=<id>` headlessly via playwright chromium
 *   3. Inject @axe-core/playwright AxeBuilder
 *   4. Run WCAG 2 A + AA rules (configurable)
 *   5. Aggregate violations + exit code(0 = clean, 1 = WCAG AA violations)
 *
 * Output:
 *   - `<absolute-git-dir>/governance-runtime/evidence/audit/a11y-audit.json` — full report
 *   - stderr — pretty print top N violations
 *
 * Usage:
 *   npm run a11y:check                 # full sweep (CI mode)
 *   npm run a11y:check -- --story=N    # spot-check first N stories (dev)
 *   npm run a11y:check -- --tag=button # only stories matching tag (dev)
 *
 * Pre-condition:
 *   - storybook-static/ exists(run `npm run build-storybook` first)
 *   - playwright chromium installed(postinstall ensures)
 *
 * 對齊 Carbon AVT(每 PR 跑)/ Atlassian a11y linters(season) / Material UI axe-core integration。
 */

import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import {
  createA11yFingerprintMap,
  createA11yStoryCorpus,
  evaluateA11yRegressionGate,
  evaluateA11yScanIntegrity,
  evaluateA11ySeverityGate,
  parseA11yAuditArgs,
} from './lib/a11y-gate.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { prepareRuntimeEvidenceFile, resolveRuntimeEvidencePath } from './lib/governance-runtime-evidence.mjs'
import { createStorybookRenderHealthMonitor } from './lib/storybook-render-health.mjs'

const ROOT = process.cwd()
const STORYBOOK_DIR = path.join(ROOT, 'storybook-static')
const INDEX_FILE = path.join(STORYBOOK_DIR, 'index.json')
const LOG_FILE = resolveRuntimeEvidencePath({ repoRoot: ROOT, relativePath: 'audit/a11y-audit.json' })

let parsedArgs
try {
  parsedArgs = parseA11yAuditArgs(process.argv.slice(2))
} catch (error) {
  console.error(`❌ ${error.message}`)
  process.exit(2)
}
const { limit: LIMIT, tag: TAG, verbose: VERBOSE, gate: GATE, writeBaseline: WRITE_BASELINE } = parsedArgs
// 2026-06-04 baseline-diff gate(Carbon AVT pattern,advisory → enforce-on-new transition):
//   --baseline-write:跑全掃 → 寫 a11y-baseline.json(現存 violation 快照)。建 / 更新 baseline 用。
//   --gate:跑全掃 → 對照 baseline,只在「新增 / 增量」violation(regression)fail。CI enforce 用。
//   (不帶旗標:原行為 = critical+serious 任一即 fail,dev spot-check 用。)
// 指紋粒度:`storyId|ruleId` → nodeCount。regression = 新 key OR count 增加(catch 既有 violating story
//   再加一個 white-on-bright 元素 → 同 (story,rule) count↑)。audit-error(infra timeout 等)不納指紋，
//   但一律 fail closed；掃描失敗絕不能被基線吸收或當成 WCAG PASS。
// This gate baseline is governance authority, not a Claude-local convenience file.
// Keeping it under the privileged infra closure means any relaxation is digest-bound
// and must pass the governance-anchor authorization path before merge.
const BASELINE_FILE = path.join(ROOT, 'infra/governance/baseline/a11y-baseline.json')

if (!fs.existsSync(INDEX_FILE)) {
  console.error('❌ storybook-static/index.json not found. Run `npm run build-storybook` first.')
  process.exit(1)
}

const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'))
if (!index.entries || typeof index.entries !== 'object') {
  console.error('❌ storybook-static/index.json has no `entries` map — manifest format changed. Aborting (refuse false-green).')
  process.exit(1)
}
let stories = Object.values(index.entries).filter(e => e.type === 'story')

// Empty-set guard BEFORE any TAG/LIMIT narrowing — 0 stories from the raw manifest
// means the build is empty or the manifest format changed → scanning 0 stories would
// vacuously "pass" (false-green). Refuse it.
if (stories.length === 0) {
  console.error('❌ 0 stories — manifest empty/format changed (no `type === "story"` entries). Refusing false-green pass.')
  process.exit(1)
}

if (TAG) stories = stories.filter(s => s.id.toLowerCase().includes(TAG.toLowerCase()))
if (LIMIT > 0) stories = stories.slice(0, LIMIT)

// Second empty-set guard AFTER narrowing — a --tag that matches nothing would also
// scan 0 stories and vacuously pass. Dev spot-checks must not silently no-op.
if (stories.length === 0) {
  console.error(`❌ 0 stories after filtering (--tag=${TAG ?? ''} --story=${LIMIT}) — nothing to scan. Refusing false-green pass.`)
  process.exit(1)
}

const expectedScanCorpus = createA11yStoryCorpus(stories.map(story => story.id))

console.log(`▶ a11y audit:running axe-core against ${stories.length} stories`)

const server = await startA11yStaticServer({ rootDirectory: STORYBOOK_DIR, defaultFile: 'iframe.html' })
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })

const results = { ts: new Date().toISOString(), total: stories.length, violationsByStory: {}, summary: { totalViolations: 0, byRule: {}, bySeverity: { critical: 0, serious: 0, moderate: 0, minor: 0 } } }
const completedStoryIds = []

for (let i = 0; i < stories.length; i++) {
  const s = stories[i]
  const url = `${server.origin}/iframe.html?id=${encodeURIComponent(s.id)}&viewMode=story`
  const page = await ctx.newPage()
  const renderHealth = createStorybookRenderHealthMonitor(page)
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(300)
    await renderHealth.assertHealthy({ label: s.id })
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    if (result.violations.length > 0) {
      results.violationsByStory[s.id] = result.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
      }))
      for (const v of result.violations) {
        results.summary.totalViolations += v.nodes.length
        results.summary.byRule[v.id] = (results.summary.byRule[v.id] || 0) + v.nodes.length
        if (v.impact) results.summary.bySeverity[v.impact] = (results.summary.bySeverity[v.impact] || 0) + v.nodes.length
      }
    }
    if (VERBOSE || (i + 1) % 20 === 0) {
      console.log(`  [${i + 1}/${stories.length}] ${s.id} — ${result.violations.length} violation type(s)`)
    }
  } catch (e) {
    console.error(`  ⚠️  ${s.id} — ${e.message}`)
    results.violationsByStory[s.id] = [{ id: 'audit-error', impact: 'serious', help: e.message, nodes: 1 }]
  } finally {
    renderHealth.dispose()
    await page.close()
  }
  completedStoryIds.push(s.id)
}

await ctx.close()
await browser.close()
await server.stop()

const scanCorpus = createA11yStoryCorpus(completedStoryIds)
if (scanCorpus.storyIdsSha256 !== expectedScanCorpus.storyIdsSha256) {
  console.error('❌ completed a11y scan corpus differs from the selected manifest corpus — refusing false-green pass')
  process.exit(1)
}

prepareRuntimeEvidenceFile({ repoRoot: ROOT, relativePath: 'audit/a11y-audit.json' })
// 2026-06-06 idempotent write:violations(排除 ts)無變則沿用既有 ts,避免 CI(a11y-and-size.yml --gate)每次跑 churn git tree
const __serializeA11y = (o) => JSON.stringify({ ...o, ts: undefined }, null, 2)
if (fs.existsSync(LOG_FILE)) {
  try {
    const __e = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'))
    if (__serializeA11y(__e) === __serializeA11y(results) && __e.ts) results.ts = __e.ts
  } catch { /* corrupt existing → 正常重寫 */ }
}
fs.writeFileSync(LOG_FILE, JSON.stringify(results, null, 2))

console.log('')
console.log('═══════════════════════════════════════════')
console.log(`▶ a11y audit complete`)
console.log(`   Stories scanned: ${results.total}`)
console.log(`   Stories with violations: ${Object.keys(results.violationsByStory).length}`)
console.log(`   Total violation instances: ${results.summary.totalViolations}`)
console.log(`   By severity: critical=${results.summary.bySeverity.critical} / serious=${results.summary.bySeverity.serious} / moderate=${results.summary.bySeverity.moderate} / minor=${results.summary.bySeverity.minor}`)
console.log(`   Report: ${LOG_FILE}`)

if (results.summary.totalViolations > 0) {
  console.log('')
  console.log('▶ Top rules violated:')
  const topRules = Object.entries(results.summary.byRule).sort((a, b) => b[1] - a[1]).slice(0, 10)
  for (const [rule, count] of topRules) console.log(`   • ${rule}: ${count}`)
}

// ── Baseline fingerprint(storyId|ruleId → nodeCount;排除 flaky audit-error)──
const sortedMap = createA11yFingerprintMap(results.violationsByStory)
const scanIntegrity = evaluateA11yScanIntegrity(results.violationsByStory)
const scanErrors = scanIntegrity.auditErrors

// ── --baseline-write:寫 / 更新 baseline 快照 ──
if (WRITE_BASELINE) {
  if (scanErrors.length) {
    console.error(`\n❌ refusing baseline write: ${scanErrors.length} story scan(s) failed:${scanErrors.slice(0, 5).join(', ')}${scanErrors.length > 5 ? ' …' : ''}`)
    process.exit(1)
  }
  const dir = path.dirname(BASELINE_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({
    _meta: {
      purpose: 'a11y baseline-diff gate — 現存 violation 快照;gate 只 fail 新增/增量(regression)。重建:npm run a11y:check -- --baseline-write(需先 build-storybook)',
      generatedAt: new Date().toISOString(),
      stories: scanCorpus.storyIds.length,
      storyIds: scanCorpus.storyIds,
      storyIdsSha256: scanCorpus.storyIdsSha256,
      fingerprints: Object.keys(sortedMap).length,
    },
    fingerprints: sortedMap,
  }, null, 2))
  console.log(`\n✅ baseline written: ${BASELINE_FILE}`)
  console.log(`   ${Object.keys(sortedMap).length} fingerprints(storyId|ruleId)across ${results.total} stories`)
  process.exit(0)
}

// ── --gate:對照 baseline,只 fail regression(新 key OR count↑)──
if (GATE) {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error(`\n❌ --gate 但無 baseline(${BASELINE_FILE})。先跑 npm run a11y:check -- --baseline-write 建立。Refusing false-green.`)
    process.exit(1)
  }
  const baselineDocument = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'))
  const decision = evaluateA11yRegressionGate({
    violationsByStory: results.violationsByStory,
    baselineDocument,
    scannedStoryIds: scanCorpus.storyIds,
  })
  const { regressions, auditErrors, improved, corpus } = decision
  if (auditErrors.length) console.error(`\n❌ ${auditErrors.length} story 掃描出錯；refusing false-green:${auditErrors.slice(0, 5).join(', ')}${auditErrors.length > 5 ? ' …' : ''}`)
  if (!corpus.ok) {
    console.error(`\n❌ Storybook corpus differs from the governed a11y baseline; refusing subset/replacement false-green.`)
    if (corpus.missingStoryIds.length) console.error(`   Missing:${corpus.missingStoryIds.slice(0, 10).join(', ')}${corpus.missingStoryIds.length > 10 ? ' …' : ''}`)
    if (corpus.unexpectedStoryIds.length) console.error(`   Unexpected:${corpus.unexpectedStoryIds.slice(0, 10).join(', ')}${corpus.unexpectedStoryIds.length > 10 ? ' …' : ''}`)
  }
  if (!decision.ok) {
    if (regressions.length) {
      console.error(`\n❌ a11y GATE FAIL — ${regressions.length} 個新增/增量 violation(regression vs baseline):`)
      for (const r of regressions.slice(0, 30)) console.error(`   • ${r.key}  (baseline ${r.base} → now ${r.now})`)
      if (regressions.length > 30) console.error(`   … +${regressions.length - 30} more`)
      console.error(`\n修:消除新違規;或若為 documented exception(如 green 綠底白字)+ intentional,跑 --baseline-write 更新 baseline 並在 commit 說明理由。`)
    }
    process.exit(1)
  }
  // 改善(baseline 有、現在沒了)提示更新
  console.log(`\n✅ a11y GATE PASS — 0 regression vs baseline${improved.length ? `(且 ${improved.length} 個已修復,可跑 --baseline-write 收緊 baseline)` : ''}`)
  process.exit(0)
}

// ── 預設(無旗標):critical / serious 任一即 fail(dev spot-check)──
const severityDecision = evaluateA11ySeverityGate(results)
if (!severityDecision.ok) {
  const { hard, auditErrors } = severityDecision
  if (hard) console.error(`\n❌ ${hard} critical+serious WCAG AA violation(s) — CI fail`)
  if (auditErrors.length) console.error(`\n❌ ${auditErrors.length} story scan(s) failed — refusing false-green:${auditErrors.slice(0, 5).join(', ')}`)
  process.exit(1)
}
console.log('\n✅ No critical/serious WCAG AA violations')
process.exit(0)
