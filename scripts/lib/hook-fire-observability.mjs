/**
 * hook-fire-observability.mjs — 「這支 hook 六個月沒 fire」到底是不是一個可以說的句子
 *
 * 2026-09-24 M37(identity substitution)第 N 個形狀:
 *   要保證的性質 = 「這支 hook 在過去六個月沒有被觸發」
 *   實際拿來判斷的值 = 「fire log 裡找不到它的紀錄」
 *   兩者何時分開 = 記錄器根本沒在錄的時候。
 *
 * 而本 repo 的記錄器**預設就是關的**:
 *   packages/design-system/ds-canonical/hooks/_log-fire.sh
 *     [ "${GOVERNANCE_TELEMETRY_OPT_IN:-0}" = "1" ] || return 1
 *   scripts/run-provider-hook.mjs#telemetryOptIn 只把外界的環境變數往下傳,沒有預設開;
 *   scripts/managed-host-assurance.mjs:1620 與 scripts/governance-check.mjs:2980 明寫 '0'。
 * 所以「零筆」是**預設狀態**,不是觀察結果。拿它去提名 retire,等於用沒插電的電表
 * 證明這棟樓沒人住 —— 2026-09-24 這支稽核就把全部 60 支 hook 標成 dead。
 *
 * 判準(直接量那個性質,不用代理):
 *   一份 log 要能支持「窗內零筆」這句話,必須兩端都證明得了自己有在錄 ——
 *   (a) 窗**開始之前**有紀錄  → 證明 log 的歷史真的回溯到窗頭(沒被 rotation 吃掉、不是昨天才開始錄)
 *   (b) 窗**結尾附近**有紀錄  → 證明錄到現在都還活著(不是中途被關掉)
 *   少任何一端 → 儀器全盲,不得產生任何 dead / retire 提名。
 *
 * 2026-11-18 同一條規則的另外兩層(檔尾「哪些名字算 hook」一節):
 *   (c) 「有幾支 hook」量的是**註冊清單**,不是 hooks/ 目錄裡有幾個 .sh/.py —— 目錄裡還有被 source 的
 *       `_log-fire.sh`,掃目錄得 59、註冊清單去重得 58。
 *   (d) 「窗內零筆」只對**會寫紀錄**的 hook 有意義。不呼叫 log_hook_fire 的 hook 觀測窗再健康也恆為零筆,
 *       這種 hook 標 `not-instrumented`,永遠不進 dead、也永遠不被提名退場。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const DEFAULT_WINDOW_MS = 6 * 30 * 24 * 60 * 60 * 1000
/** 全部 hook 合起來超過這麼久沒有任何一筆 = 記錄器已經停了,不是大家都沒 fire。 */
export const DEFAULT_LIVE_TOLERANCE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 讀 fire log 本體 + 它輪替出來的封存檔。
 * 刻意跟判定放在同一個模組:M32 的教訓是「純函式測過了,但餵它的那支沒人測」——
 * selftest 會連這支一起跑,因為封存檔沒被讀進來的話,窗頭那一端永遠證明不了。
 */
export function readFireRecords(logDir, baseName = 'hook-fires-per-hook.jsonl') {
  let entries = []
  try {
    entries = readdirSync(logDir)
  } catch {
    return []
  }
  const files = entries
    .filter((name) => name === baseName || name.startsWith(`${baseName}.`))
    .sort()
    .map((name) => join(logDir, name))
  const records = []
  for (const file of files) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed && parsed.hook && parsed.ts) records.push(parsed)
      } catch { /* 壞行忽略,不讓一行壞掉的 JSON 靜默吃掉整份 log */ }
    }
  }
  return records
}

/**
 * @param {object} input
 * @param {string[]} input.fireTimestamps  全部 hook 的 ISO 時戳(不分 hook — 儀器死活是整份 log 的性質)
 * @param {number} input.nowMs
 * @param {number} [input.windowMs]
 * @param {number} [input.liveToleranceMs]
 * @returns {{blind:boolean, reasons:string[], coversWindowStart:boolean, isLive:boolean,
 *            firstTs:string|null, lastTs:string|null, totalRecords:number, windowRecords:number}}
 */
export function assessObservation({
  fireTimestamps,
  nowMs,
  windowMs = DEFAULT_WINDOW_MS,
  liveToleranceMs = DEFAULT_LIVE_TOLERANCE_MS,
}) {
  const sorted = [...fireTimestamps]
    .filter((ts) => typeof ts === 'string' && !Number.isNaN(Date.parse(ts)))
    .sort()
  const cutoffMs = nowMs - windowMs
  const firstTs = sorted.length ? sorted[0] : null
  const lastTs = sorted.length ? sorted[sorted.length - 1] : null
  const coversWindowStart = firstTs !== null && Date.parse(firstTs) <= cutoffMs
  const isLive = lastTs !== null && nowMs - Date.parse(lastTs) <= liveToleranceMs
  const reasons = []
  if (!sorted.length) {
    reasons.push('fire log 一筆都沒有 —— 遙測預設關閉(GOVERNANCE_TELEMETRY_OPT_IN 未設為 1),零筆是預設狀態不是觀察結果')
  } else {
    if (!coversWindowStart) {
      reasons.push(`log 最早一筆是 ${firstTs},晚於分類窗起點 ${new Date(cutoffMs).toISOString()} —— 窗頭那一段從來沒被觀察過`)
    }
    if (!isLive) {
      reasons.push(`log 最後一筆是 ${lastTs},距今超過容許值 —— 記錄器已停,窗尾那一段沒被觀察過`)
    }
  }
  return {
    blind: reasons.length > 0,
    reasons,
    coversWindowStart,
    isLive,
    firstTs,
    lastTs,
    totalRecords: sorted.length,
    windowRecords: sorted.filter((ts) => Date.parse(ts) >= cutoffMs).length,
  }
}

// ── 哪些名字算 hook、它有沒有在寫紀錄(2026-11-18)────────────────────────────────

/** 從已驗證的 hooks/registrations.json 取出註冊的 hook 名(同一支掛在多個事件只算一次),排序後回傳。 */
export function registeredHookNames(registrations) {
  const names = new Set()
  for (const groups of Object.values(registrations?.hooks ?? {})) {
    for (const group of groups ?? []) {
      for (const descriptor of group?.hooks ?? []) {
        if (descriptor?.kind === 'hook' && typeof descriptor.hook === 'string') names.add(descriptor.hook)
      }
    }
  }
  return [...names].sort()
}

/**
 * 只認 repo 裡唯一的寫法:**頂格**一行 `source <…>/_log-fire.sh 2>/dev/null && log_hook_fire`,
 * 而且 log_hook_fire 不帶參數(紀錄名 = 這支 hook 的檔名,稽核才對得上)。
 * 2026-11-18 盤點:54 支註冊 hook 和 12 條 dispatcher 子規則全是這個寫法;沒有它的 4 支
 * (governance_control_plane.sh、record_release_consent.sh、stop_repository_text_checks.sh、
 * block_prototype_imports.py)從來不寫紀錄。
 * 刻意只認這一種:縮排(在函式或分支裡)、帶別的名字、只 source 不呼叫、只出現在註解裡,一律判「沒裝」。
 * 判錯也只會錯在「不提名退場」那一邊,不會把一支其實沒在錄的 hook 判成 dead。
 */
const FIRE_LOG_CALL = /^source\s+.*\/_log-fire\.sh["']?\s+(?:2>\s*\/dev\/null\s+)?&&\s*log_hook_fire$/

export function isFireInstrumented(source) {
  return String(source ?? '').split('\n').some((line) => FIRE_LOG_CALL.test(line.replace(/\s+$/, '')))
}

/**
 * fire log 裡有、註冊清單裡沒有的名字,有一種**不是**已退場:dispatcher 用 `bash lib/_x.sh` 叫起來的子規則,
 * 它們用自己的檔名寫紀錄(post_edit_dispatcher.sh 8 條、chrome_header_dispatcher.sh 4 條)。
 * 判法:呼叫端先確認 hooks/lib/ 底下真的有這個檔,這裡再找哪些註冊 hook 的非註解行寫著 `/<名字>`。
 * @param {string} name
 * @param {Map<string,string>} hookSources  註冊 hook 名 → 原始碼
 */
export function findDispatchers(name, hookSources) {
  const needle = `/${name}`
  const dispatchers = []
  for (const [hook, source] of hookSources) {
    const lines = String(source ?? '').split('\n')
    if (lines.some((line) => !/^\s*#/.test(line) && line.includes(needle))) dispatchers.push(hook)
  }
  return dispatchers.sort()
}

export const BLIND_RETIRE_REASON = '儀器全盲 —— 觀測窗沒有涵蓋分類窗,零筆不是證據(見 summary.observation.reasons)'

/**
 * 一支 hook 的分類與退場提名。順序就是判準的優先序:
 *   1. 註冊了但沒裝量具 → not-instrumented(零筆跟它有沒有被觸發無關)
 *   2. 沒註冊、但是註冊 dispatcher 的子規則 → dispatched(退場跟著 dispatcher 審)
 *   3. 儀器全盲且零筆 → unknown / unknown-orphan
 *   4. 零筆 → dead(註冊)/ orphan(沒註冊)—— 只有這兩種會被提名退場
 *   5. 有紀錄 → hot / warm / cool
 */
export function classifyHook({ registered, instrumented, dispatchedBy = [], blind, fires6mo, firePerDay }) {
  if (registered && !instrumented) {
    return {
      classification: 'not-instrumented',
      retireCandidate: false,
      retireReason: '這支 hook 不寫 fire 紀錄(原始碼沒有頂格的 `source …/_log-fire.sh && log_hook_fire`)—— log 裡零筆跟它有沒有被觸發無關,不得用 fire 數提名退場;要退場改用 knowledge-prune 的靜態判準',
    }
  }
  if (!registered && dispatchedBy.length > 0) {
    return {
      classification: 'dispatched',
      retireCandidate: false,
      retireReason: `不是註冊 hook,是 ${dispatchedBy.join('、')} 呼叫的子規則(hooks/lib/)—— 退場跟著那支 dispatcher 的規則清單審,不由 fire 數提名`,
    }
  }
  if (blind && fires6mo === 0) {
    return { classification: registered ? 'unknown' : 'unknown-orphan', retireCandidate: false, retireReason: BLIND_RETIRE_REASON }
  }
  if (fires6mo === 0) {
    return registered
      ? {
          classification: 'dead',
          retireCandidate: true,
          retireReason: '0 fire in OBSERVED window(觀測窗見 summary.observedWindow,非保證 6mo)— observe rationale before retire',
        }
      : {
          classification: 'orphan',
          retireCandidate: true,
          retireReason: 'fire log 有它的舊紀錄,但它已不在註冊清單、也不是任何註冊 dispatcher 的子規則 —— 多半早已退場,log 裡是歷史紀錄',
        }
  }
  if (firePerDay > 50) {
    return {
      classification: 'hot',
      retireCandidate: false,
      retireReason: `HOT(${firePerDay.toFixed(1)}/day)— consider regex tuning if high false-positive,NOT retire`,
    }
  }
  return { classification: firePerDay > 5 ? 'warm' : 'cool', retireCandidate: false, retireReason: null }
}
