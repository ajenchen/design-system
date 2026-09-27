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
 *   scripts/run-provider-hook.mjs:1794 只把外界的環境變數往下傳,沒有預設開;
 *   scripts/managed-host-assurance.mjs:1620 與 scripts/governance-check.mjs:2980 明寫 '0'。
 * 所以「零筆」是**預設狀態**,不是觀察結果。拿它去提名 retire,等於用沒插電的電表
 * 證明這棟樓沒人住 —— 2026-09-24 這支稽核就把全部 60 支 hook 標成 dead。
 *
 * 判準(直接量那個性質,不用代理):
 *   一份 log 要能支持「窗內零筆」這句話,必須兩端都證明得了自己有在錄 ——
 *   (a) 窗**開始之前**有紀錄  → 證明 log 的歷史真的回溯到窗頭(沒被 rotation 吃掉、不是昨天才開始錄)
 *   (b) 窗**結尾附近**有紀錄  → 證明錄到現在都還活著(不是中途被關掉)
 *   少任何一端 → 儀器全盲,不得產生任何 dead / retire 提名。
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
