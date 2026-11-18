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
 *     / not-instrumented(不寫紀錄、窗內零筆)/ dispatched(dispatcher 子規則、零筆沒有獨立證據力)
 *     / orphan / unknown
 *   - registered / instrumented / dispatchedBy:這個名字是不是註冊 hook、有沒有在寫紀錄、被誰叫
 *   - retire_candidate: ONLY flag with rationale,NOT execute
 *   - summary.observation: 儀器自述 —— blind=true 代表觀測窗沒涵蓋分類窗,
 *     此時所有零筆 hook 標 `unknown`(不是 `dead`)且**零 retire 提名**。
 *     判準見 lib/hook-fire-observability.mjs;對照組見 test-audit-hook-quality.mjs。
 *
 * 2026-11-18(knowledge-prune WP-07):
 *   - D2-3:fire log 不存在(遙測從沒開過,也就是預設狀態;全新 clone 連狀態目錄都沒有)= 跟空 log
 *     同一份全盲報告,exit 0。以前這裡 exit 2,knowledge-prune SKILL 叫人先看的 summary.observation
 *     在預設狀態下根本產不出來。
 *   - Phase 0 觀察:「有哪些 hook」改讀註冊清單,不再掃目錄(掃目錄會把被 source 的 _log-fire.sh 也算進去)。
 *     註冊清單壞掉、或清單上的 hook 檔不在 → exit 1,不出報告(清單對不上時任何分類都不可信)。
 *   - D2-2(2):不寫紀錄的 hook 零筆時標 not-instrumented,dispatcher 子規則零筆時看 dispatcher 有沒有在跑;
 *     窗內有紀錄的一律照頻率分。會寫紀錄的子規則從 hooks/lib/ 列出來,不只靠 log 裡出現過的名字。
 *     判準與優先序住在 lib 的 classifyHook,本檔只負責把值算出來交給它。
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
//    清單位置讀 providers.json 的 canonical.hookRegistrations(與 build-fork-governance.mjs 同一種讀法),
//    兩份都先過 canonical validator。
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
// 原始碼要拿來判「有沒有寫紀錄」與「是誰叫子規則」,所以這裡直接讀;讀不到 = 清單和檔案對不上。
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
// 每個名字窗內幾筆,算一次:子規則的分類要用到叫它的 dispatcher 自己的窗內筆數(M32:這個值是誰算的也要測)
const fires6moByHook = new Map()
for (const f of fires) if (f.ts >= SIX_MO_CUTOFF) fires6moByHook.set(f.hook, (fires6moByHook.get(f.hook) ?? 0) + 1)

const report = []
const registeredSet = new Set(REGISTERED)
// fire log 裡的名字是 runtime 資料;只拿符合註冊清單命名規則的名字去碰檔案系統
const SAFE_HOOK_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/

// dispatcher 子規則:hooks/lib/ 底下、有註冊 hook 在非註解行提到它的檔(dispatcher 用 `bash lib/_x.sh` 叫起來,
// 用自己的檔名寫紀錄)。回傳 null = 不是子規則。
const LIB_DIR = join(HOOK_DIR, 'lib')
const subRuleCache = new Map()
function subRuleInfo(name) {
  if (subRuleCache.has(name)) return subRuleCache.get(name)
  let info = null
  const path = join(LIB_DIR, name)
  if (!registeredSet.has(name) && SAFE_HOOK_NAME.test(name) && existsSync(path) && statSync(path).isFile()) {
    const dispatchedBy = findDispatchers(name, hookSources)
    if (dispatchedBy.length) {
      let source
      try {
        source = readFileSync(path, 'utf8')
      } catch (error) {
        abort(`${name} 是 ${dispatchedBy.join('、')} 叫的子規則,但讀不到 ${join(PROVIDERS.canonical.roots.hooks, 'lib', name)}(${error.code || error.message})`)
      }
      info = { dispatchedBy, instrumented: isFireInstrumented(source) }
    }
  }
  subRuleCache.set(name, info)
  return info
}
// 會寫紀錄的子規則從檔案系統列出來,不只靠 log 裡出現過的名字:一條從來沒寫過紀錄的子規則
// (每次都在記錄那一行之前就退出)只看 log 永遠找不到,「dispatcher 有在跑、它卻零筆」這個訊號也就發不出來。
// 被 source 的共用 helper(_provider_paths.sh 等)不在頂格寫紀錄,不會被列進來。
let libEntries = []
try {
  libEntries = readdirSync(LIB_DIR)
} catch (error) {
  if (error.code !== 'ENOENT') abort(`讀不到 ${join(PROVIDERS.canonical.roots.hooks, 'lib')}(${error.code || error.message})`)
}
const loggingSubRules = libEntries.filter(name => name.endsWith('.sh') && subRuleInfo(name)?.instrumented === true)
const seenHooks = new Set([...Object.keys(perHook), ...REGISTERED, ...loggingSubRules])

for (const hook of [...seenHooks].sort()) {
  const data = perHook[hook] || { count: 0, firstTs: null, lastTs: null, recentTs: [] }
  const registered = registeredSet.has(hook)
  const subRule = registered ? null : subRuleInfo(hook)
  const dispatchedBy = subRule?.dispatchedBy ?? []
  // null = 沒有原始碼可判(不在註冊清單、也不是子規則)
  const instrumented = registered ? isFireInstrumented(hookSources.get(hook)) : (subRule?.instrumented ?? null)
  const fires6mo = fires6moByHook.get(hook) ?? 0
  const dispatcherFires6mo = Object.fromEntries(dispatchedBy.map(name => [name, fires6moByHook.get(name) ?? 0]))
  // Compute fire/day in window where hook was active
  let firePerDay = 0
  if (data.firstTs && data.lastTs && data.count > 0) {
    const spanDays = Math.max(1, (new Date(data.lastTs) - new Date(data.firstTs)) / (1000 * 60 * 60 * 24))
    firePerDay = data.count / spanDays
  }
  // Classify + retire candidate signal(NOT execute)—— 判準與優先序住在 lib,本檔只消費。
  // 窗內有紀錄 → 照頻率分;零筆時:不寫紀錄 → not-instrumented;子規則看 dispatcher;全盲 → unknown;
  // 全盲時永遠零提名。
  const { classification, retireCandidate, retireReason } = classifyHook({
    registered,
    instrumented,
    dispatchedBy,
    dispatcherFires6mo,
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
// 「不寫紀錄」是原始碼的性質,不是分類結果(窗內有舊紀錄的會照頻率分,但它仍然不寫紀錄)
const notInstrumented = report.filter(r => r.instrumented === false).map(r => r.hook)
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
    // 2026-11-18:分得出「log 檔根本不存在」(遙測從沒開過)和「log 檔在但是空的」
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
    notInstrumented: report.filter(r => r.classification === 'not-instrumented').length,
    dispatched: report.filter(r => r.classification === 'dispatched').length,
  },
  // 不寫紀錄的 hook / 子規則:窗內零筆對它們不構成任何證據,不論儀器盲不盲
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
  console.log(`\nℹ️  ${notInstrumented.length} 支 hook 不寫 fire 紀錄,窗內零筆對它們不構成證據(不會因零筆被提名退場):`)
  for (const hook of notInstrumented) console.log(`   - ${hook}`)
}
console.log('\nNote: This report is OBSERVABILITY only. Route retire decisions through the knowledge-prune authority classifier: engineering/governance retirement is autonomous; only a genuine product/UI/UX SSOT tradeoff requires an exact human decision.')

process.exit(0)
