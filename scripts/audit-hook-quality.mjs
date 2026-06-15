#!/usr/bin/env node
/**
 * audit-hook-quality.mjs — Per-hook signal-to-noise audit(NOT retire decision)
 *
 * Per user 2026-05-27「不該為砍而砍 — 跑 6 月 fire-log audit:每 hook fire frequency /
 * signal-to-noise / false-positive 報告」directive。
 *
 * Output:.claude/logs/hook-quality-report.json
 *   - per-hook: fire_count_total / fire_count_6mo / fire_per_day / first_fire / last_fire
 *   - classification: hot (>50/day) / warm (5-50/day) / cool (<5/day) / dead (0 fire 6mo)
 *   - file_exists: yes/no(orphan signal:fire log mentions hook no longer exists)
 *   - retire_candidate: ONLY flag with rationale,NOT execute
 *
 * Non-goals:
 * - 不刪 hook(per user「品質為前提,不為砍而砍」)
 * - 不改 hook regex(那是 Task 3 scope)
 * - 不執行 retire decision — pure observability report
 *
 * Usage: node scripts/audit-hook-quality.mjs
 */
import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const FIRE_LOG = join(ROOT, '.claude/logs/hook-fires-per-hook.jsonl')
const HOOK_DIR = join(ROOT, '.claude/hooks')
const OUT = join(ROOT, '.claude/logs/hook-quality-report.json')

if (!existsSync(FIRE_LOG)) {
  console.error('❌ fire log missing:', FIRE_LOG)
  process.exit(2)
}

// 1. Read fire log + aggregate per-hook
// 2026-06-11 fix(prune D2):原只讀 current jsonl(~數小時)卻標「dead 6mo」= 系統性誤導。
// 聚合 rotated archives(.jsonl.YYYYMM)+ summary 寫明真實觀測窗 span。
const LOG_DIR = dirname(FIRE_LOG)
const logFiles = [FIRE_LOG, ...readdirSync(LOG_DIR)
  .filter(f => f.startsWith('hook-fires-per-hook.jsonl.'))
  .map(f => join(LOG_DIR, f))]
const fires = logFiles.flatMap(lf => {
  try {
    return readFileSync(lf, 'utf-8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
})

const perHook = {}
for (const f of fires) {
  if (!f.hook || !f.ts) continue
  if (!perHook[f.hook]) perHook[f.hook] = { count: 0, firstTs: f.ts, lastTs: f.ts, recentTs: [] }
  perHook[f.hook].count++
  if (f.ts < perHook[f.hook].firstTs) perHook[f.hook].firstTs = f.ts
  if (f.ts > perHook[f.hook].lastTs) perHook[f.hook].lastTs = f.ts
}

// 2. Enumerate active hooks (file system reality)
const activeHooks = new Set()
function walkHooks(dir, prefix = '') {
  for (const entry of readdirSync(dir)) {
    if (entry === 'retired' || entry === 'tests' || entry === 'lib') continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isFile() && (entry.endsWith('.sh') || entry.endsWith('.py'))) activeHooks.add(entry)
  }
}
walkHooks(HOOK_DIR)

// 3. Compute 6-month window
const SIX_MO_MS = 6 * 30 * 24 * 60 * 60 * 1000
const NOW = Date.now()
const SIX_MO_CUTOFF = new Date(NOW - SIX_MO_MS).toISOString()

const report = []
const seenHooks = new Set([...Object.keys(perHook), ...activeHooks])

for (const hook of [...seenHooks].sort()) {
  const data = perHook[hook] || { count: 0, firstTs: null, lastTs: null, recentTs: [] }
  const fileExists = activeHooks.has(hook)
  // Count fires within 6mo
  const fires6mo = fires.filter(f => f.hook === hook && f.ts >= SIX_MO_CUTOFF).length
  // Compute fire/day in window where hook was active
  let firePerDay = 0
  if (data.firstTs && data.lastTs && data.count > 0) {
    const spanDays = Math.max(1, (new Date(data.lastTs) - new Date(data.firstTs)) / (1000 * 60 * 60 * 24))
    firePerDay = data.count / spanDays
  }
  // Classify
  let classification
  if (fires6mo === 0) classification = fileExists ? 'dead' : 'orphan'
  else if (firePerDay > 50) classification = 'hot'
  else if (firePerDay > 5) classification = 'warm'
  else classification = 'cool'

  // Retire candidate signal(NOT execute)
  // 2026-06-11 fix(prune D2):(a) `_` prefix root helpers(被 source 的共用 lib,自己永不 fire)
  // 不提名 retire;(b) dead 標籤帶真實觀測窗(rotation 史曾遺失,窗可能遠短於 6mo)
  const isSourcedHelper = hook.startsWith('_') && /log-fire|helper/.test(hook)
  let retireCandidate = false
  let retireReason = null
  if (classification === 'dead' && fileExists && !isSourcedHelper) {
    retireCandidate = true
    retireReason = `0 fire in OBSERVED window(觀測窗見 summary.observedWindow,非保證 6mo)— observe rationale before retire`
  } else if (isSourcedHelper && classification === 'dead') {
    retireCandidate = false
    retireReason = 'sourced shared helper(被其他 hook source,自身永不 fire)— NOT retirable'
  } else if (classification === 'orphan') {
    retireCandidate = true
    retireReason = 'fire log mentions hook no longer in file system — likely already retired but log shows historical fires'
  } else if (classification === 'hot') {
    retireCandidate = false
    retireReason = `HOT(${firePerDay.toFixed(1)}/day)— consider regex tuning if high false-positive,NOT retire`
  }

  report.push({
    hook,
    classification,
    fileExists,
    fireCount: data.count,
    fires6mo,
    firePerDay: Number(firePerDay.toFixed(2)),
    firstTs: data.firstTs,
    lastTs: data.lastTs,
    retireCandidate,
    retireReason,
  })
}

// 4. Summary
const allTs = fires.map(f => f.ts).filter(Boolean).sort()
const summary = {
  generatedAt: new Date().toISOString(),
  // 2026-06-11:真實觀測窗(rotation 史曾遺失;「dead」只代表此窗內 0 fire,非保證 6mo)
  observedWindow: allTs.length ? { from: allTs[0], to: allTs[allTs.length - 1], totalFires: allTs.length } : null,
  totalHooksInFireLog: Object.keys(perHook).length,
  totalActiveFiles: activeHooks.size,
  classifications: {
    hot: report.filter(r => r.classification === 'hot').length,
    warm: report.filter(r => r.classification === 'warm').length,
    cool: report.filter(r => r.classification === 'cool').length,
    dead: report.filter(r => r.classification === 'dead').length,
    orphan: report.filter(r => r.classification === 'orphan').length,
  },
  retireCandidates: report.filter(r => r.retireCandidate).length,
  hotHooksForTuning: report.filter(r => r.classification === 'hot').map(r => r.hook),
}

// 2026-06-06 idempotent write:內容(排除 summary.generatedAt)無變則沿用既有時戳,避免每次跑 churn git tree
const __payloadHQ = { summary, hooks: report }
const __serializeHQ = (o) => JSON.stringify({ ...o, summary: { ...o.summary, generatedAt: undefined } }, null, 2)
if (existsSync(OUT)) {
  try {
    const __e = JSON.parse(readFileSync(OUT, 'utf8'))
    if (__serializeHQ(__e) === __serializeHQ(__payloadHQ) && __e.summary?.generatedAt) summary.generatedAt = __e.summary.generatedAt
  } catch { /* corrupt existing → 正常重寫 */ }
}
writeFileSync(OUT, JSON.stringify({ summary, hooks: report }, null, 2))

// 5. Console output
console.log('\n=== Hook Quality Report ===')
console.log(JSON.stringify(summary, null, 2))
console.log(`\nFull report: ${OUT}`)
console.log('\nNote: This report is OBSERVABILITY only. Retire decisions need human review per knowledge-prune skill Checkpoint workflow.')

process.exit(0)
