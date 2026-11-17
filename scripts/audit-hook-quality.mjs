#!/usr/bin/env node
/**
 * audit-hook-quality.mjs — Per-hook signal-to-noise audit(NOT retire decision)
 *
 * Per user 2026-05-27「不該為砍而砍 — 跑 6 月 fire-log audit:每 hook fire frequency /
 * signal-to-noise / false-positive 報告」directive。
 *
 * Output:<absolute-git-dir>/governance-runtime/evidence/audit/hook-quality-report.json
 *   - per-hook: fire_count_total / fire_count_6mo / fire_per_day / first_fire / last_fire
 *   - classification: hot (>50/day) / warm (5-50/day) / cool (<5/day) / dead (0 fire 6mo)
 *     / not-instrumented(註冊了但不寫紀錄)/ dispatched(dispatcher 子規則)/ orphan / unknown
 *   - registered / instrumented / dispatchedBy:這個名字是不是註冊 hook、有沒有在寫紀錄、被誰叫
 *   - retire_candidate: ONLY flag with rationale,NOT execute
 *   - summary.observation: 儀器自述 —— blind=true 代表觀測窗沒涵蓋分類窗,
 *     此時所有零筆 hook 標 `unknown`(不是 `dead`)且**零 retire 提名**。
 *     判準見 lib/hook-fire-observability.mjs;對照組見 test-audit-hook-quality.mjs。
 *
 * 2026-11-18(knowledge-prune WP-07):
 *   - fire log 不存在(遙測從沒開過,也就是預設狀態)= 跟空 log 同一份全盲報告,exit 0。
 *     以前這裡 exit 2,SKILL 叫人先看的 summary.observation 在預設狀態下根本產不出來。
 *   - 「有哪些 hook」改讀註冊清單,不再掃目錄(掃目錄會把被 source 的 _log-fire.sh 也算進去)。
 *   - 註冊清單壞掉、或清單上的 hook 檔不在 → exit 1,不出報告(清單對不上時任何分類都不可信)。
 *
 * Non-goals:
 * - 不刪 hook(per user「品質為前提,不為砍而砍」)
 * - 不改 hook regex(那是 Task 3 scope)
 * - 不執行 retire decision — pure observability report
 *
 * Usage: node scripts/audit-hook-quality.mjs
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareRuntimeEvidenceFile, resolveProviderTelemetryStateRoot } from './lib/governance-runtime-evidence.mjs'
import { validateHookRegistrations, validateProviderRegistryDocument } from './lib/provider-runtime-validation.mjs'
import {
  assessObservation,
  classifyHook,
  findDispatchers,
  isFireInstrumented,
  readFireRecords,
  registeredHookNames,
  DEFAULT_WINDOW_MS,
  DEFAULT_LIVE_TOLERANCE_MS,
} from './lib/hook-fire-observability.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const TELEMETRY_STATE = resolveProviderTelemetryStateRoot({ repoRoot: ROOT })
const FIRE_LOG = join(TELEMETRY_STATE, 'hook-fires-per-hook.jsonl')

function abort(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

function readJson(relativePath, label) {
  try {
    return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'))
  } catch (error) {
    return abort(`${label} 讀不到或不是 JSON(${relativePath}):${error.message}`)
  }
}

// 1. 「有哪些 hook」= 註冊清單(M37:要量的是「會被 provider 叫起來的 hook」,不是「目錄裡有這個檔」)。
//    清單位置讀 providers.json 的 canonical.hookRegistrations,兩份都先過 canonical validator。
let PROVIDERS
let REGISTRATIONS
try {
  PROVIDERS = validateProviderRegistryDocument(readJson('packages/governance/canonical/providers.json', 'provider registry'))
  REGISTRATIONS = validateHookRegistrations(readJson(PROVIDERS.canonical.hookRegistrations, 'hook registrations'))
} catch (error) {
  abort(`註冊清單沒通過 canonical validator:${error.message}`)
}
const HOOK_DIR = join(ROOT, PROVIDERS.canonical.roots.hooks)
const REGISTERED = registeredHookNames(REGISTRATIONS)
const hookSources = new Map()
for (const hook of REGISTERED) {
  try {
    hookSources.set(hook, readFileSync(join(HOOK_DIR, hook), 'utf8'))
  } catch (error) {
    abort(`註冊清單有 ${hook},但讀不到 ${join(PROVIDERS.canonical.roots.hooks, hook)}(${error.code || error.message})—— 清單和檔案對不上,這份稽核不能出`)
  }
}

// 2. Read fire log + aggregate per-hook
// 2026-06-11 fix(prune D2):原只讀 current jsonl(~數小時)卻標「dead 6mo」= 系統性誤導。
// 聚合 rotated archives(.jsonl.YYYYMM)+ summary 寫明真實觀測窗 span。
// 2026-11-18:log 檔(甚至整個狀態目錄)不存在時,readFireRecords 回空陣列 → 跟空 log 走同一條全盲路徑。
const LOG_DIR = dirname(FIRE_LOG)
const fireLogPresent = existsSync(FIRE_LOG)
const fires = readFireRecords(LOG_DIR)

// 2026-09-24 fix(M37 identity substitution):「log 裡零筆」不等於「這支 hook 沒 fire」。
// 本 repo 的 _log-fire.sh 要 GOVERNANCE_TELEMETRY_OPT_IN=1 才寫,預設不寫 —— 也就是說
// 零筆是**預設狀態**。判準與理由住在 lib/hook-fire-observability.mjs,本檔只消費。
const OBSERVATION = assessObservation({
  fireTimestamps: fires.map(f => f.ts),
  nowMs: Date.now(),
  windowMs: DEFAULT_WINDOW_MS,
  liveToleranceMs: DEFAULT_LIVE_TOLERANCE_MS,
})

const perHook = {}
for (const f of fires) {
  if (!f.hook || !f.ts) continue
  if (!perHook[f.hook]) perHook[f.hook] = { count: 0, firstTs: f.ts, lastTs: f.ts, recentTs: [] }
  perHook[f.hook].count++
  if (f.ts < perHook[f.hook].firstTs) perHook[f.hook].firstTs = f.ts
  if (f.ts > perHook[f.hook].lastTs) perHook[f.hook].lastTs = f.ts
}

// 3. Compute 6-month window
const SIX_MO_MS = 6 * 30 * 24 * 60 * 60 * 1000
const NOW = Date.now()
const SIX_MO_CUTOFF = new Date(NOW - SIX_MO_MS).toISOString()

const report = []
const registeredSet = new Set(REGISTERED)
const seenHooks = new Set([...Object.keys(perHook), ...REGISTERED])
// fire log 裡的名字是 runtime 資料;只拿符合註冊清單命名規則的名字去碰檔案系統
const SAFE_HOOK_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/

for (const hook of [...seenHooks].sort()) {
  const data = perHook[hook] || { count: 0, firstTs: null, lastTs: null, recentTs: [] }
  const registered = registeredSet.has(hook)
  const instrumented = registered ? isFireInstrumented(hookSources.get(hook)) : null
  const dispatchedBy = !registered && SAFE_HOOK_NAME.test(hook) && existsSync(join(HOOK_DIR, 'lib', hook))
    ? findDispatchers(hook, hookSources)
    : []
  // Count fires within 6mo
  const fires6mo = fires.filter(f => f.hook === hook && f.ts >= SIX_MO_CUTOFF).length
  // Compute fire/day in window where hook was active
  let firePerDay = 0
  if (data.firstTs && data.lastTs && data.count > 0) {
    const spanDays = Math.max(1, (new Date(data.lastTs) - new Date(data.firstTs)) / (1000 * 60 * 60 * 24))
    firePerDay = data.count / spanDays
  }
  // Classify + retire candidate signal(NOT execute)—— 判準與優先序住在 lib,本檔只消費。
  // 儀器全盲時零筆標 unknown;不寫紀錄的 hook 標 not-instrumented;兩者都永遠不提名退場。
  const { classification, retireCandidate, retireReason } = classifyHook({
    registered,
    instrumented,
    dispatchedBy,
    blind: OBSERVATION.blind,
    fires6mo,
    firePerDay,
  })

  report.push({
    hook,
    classification,
    registered,
    instrumented,
    dispatchedBy,
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
const notInstrumented = report.filter(r => r.classification === 'not-instrumented').map(r => r.hook)
const summary = {
  generatedAt: new Date().toISOString(),
  // 2026-06-11:真實觀測窗(rotation 史曾遺失;「dead」只代表此窗內 0 fire,非保證 6mo)
  observedWindow: allTs.length ? { from: allTs[0], to: allTs[allTs.length - 1], totalFires: allTs.length } : null,
  totalHooksInFireLog: Object.keys(perHook).length,
  // 2026-11-18:hook 數 = 註冊清單去重(以前數目錄,會把 _log-fire.sh 也算進去)
  hookRegistrations: PROVIDERS.canonical.hookRegistrations,
  totalRegisteredHooks: REGISTERED.length,
  // 2026-09-24:儀器自述。blind=true 時本報告**不含任何 retire 提名**,不得拿去砍 hook。
  observation: {
    blind: OBSERVATION.blind,
    reasons: OBSERVATION.reasons,
    coversWindowStart: OBSERVATION.coversWindowStart,
    isLive: OBSERVATION.isLive,
    fireLogPresent,
    telemetryOptIn: process.env.GOVERNANCE_TELEMETRY_OPT_IN === '1',
  },
  classifications: {
    hot: report.filter(r => r.classification === 'hot').length,
    warm: report.filter(r => r.classification === 'warm').length,
    cool: report.filter(r => r.classification === 'cool').length,
    dead: report.filter(r => r.classification === 'dead').length,
    orphan: report.filter(r => r.classification === 'orphan').length,
    unknown: report.filter(r => r.classification.startsWith('unknown')).length,
    notInstrumented: notInstrumented.length,
    dispatched: report.filter(r => r.classification === 'dispatched').length,
  },
  // 不寫紀錄的註冊 hook:fire 數對它們不構成任何證據,不論儀器盲不盲
  notInstrumented,
  retireCandidates: report.filter(r => r.retireCandidate).length,
  hotHooksForTuning: report.filter(r => r.classification === 'hot').map(r => r.hook),
}

// 報告到這裡才確定要寫:evidence 目錄在此才建立,前面任何一步失敗都不留下空目錄。
const OUT = prepareRuntimeEvidenceFile({ repoRoot: ROOT, relativePath: 'audit/hook-quality-report.json' })

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
if (OBSERVATION.blind) {
  console.log('\n⚠️  儀器全盲:本次沒有任何 retire 提名可以成立。')
  for (const reason of OBSERVATION.reasons) console.log(`   - ${reason}`)
  console.log('   要讓這支稽核產生有效輸出:GOVERNANCE_TELEMETRY_OPT_IN=1 讓 hook 開始記錄,累積滿一個分類窗後再跑。')
}
if (notInstrumented.length) {
  console.log(`\nℹ️  ${notInstrumented.length} 支註冊 hook 不寫 fire 紀錄,fire 數對它們不構成證據(不會被提名退場):`)
  for (const hook of notInstrumented) console.log(`   - ${hook}`)
}
console.log('\nNote: This report is OBSERVABILITY only. Route retire decisions through the knowledge-prune authority classifier: engineering/governance retirement is autonomous; only a genuine product/UI/UX SSOT tradeoff requires an exact human decision.')

process.exit(0)
