// 「這支腳本是不是被直接執行(而不是被 import)」的**唯一**實作(2026-11-14,A7 審查 A 第 4 條)。
//
// **為什麼不能只比字串(M37)**:經符號連結的路徑叫它時(macOS /tmp → /private/tmp、/var → /private/var,
// 或任何掛在 symlink 底下的 checkout),process.argv[1] 是連結那一份,import.meta.url 卻是 Node 解析過符號連結的真實路徑 ——
// 兩個字串不相等 → 判成「被 import」→ 什麼都不跑、0 行輸出、exit 0,連不存在的建置都是「綠」。
// 審查 A 的實測:`node /tmp/…/scripts/doc-heading-inventory-invariant.mjs --static=/nonexistent` → 0 行、exit 0;
// 同一個指令改走 /private/tmp → MISSING-BUILD、exit 2。CI 從實際目錄用相對路徑叫,不受影響;本機、驅動或 harness 用絕對路徑叫就會出事。
// 判準:兩邊各自 realpath 之後相等。任一邊解析不了(argv[1] 不存在等)→ false。
// (data-table-row-estimate-density-invariant.mjs 先用了這個寫法,2026-11-14 抽到這裡;全庫同族還有幾十支只比字串的,另列給主線排。)

import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BROWSER_REQUIRED_MARKER, INSTRUMENT_FAIL_MARKER, MISSING_BUILD_MARKER, SKIPPED_ENV_MARKER, STALE_BUILD_MARKER,
} from './launch-browser.mjs'

/**
 * @param {string} importMetaUrl 呼叫端的 import.meta.url
 * @param {string|undefined} [argv1] 預設 process.argv[1]
 * @returns {boolean}
 */
export function isDirectRun(importMetaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false
  try {
    return realpathSync(path.resolve(argv1)) === realpathSync(fileURLToPath(importMetaUrl))
  } catch {
    return false
  }
}

/**
 * 對照組(各閘 --selftest 共用):在暫存目錄放一個指向這支腳本的符號連結,**經連結**叫它一次,回子行程的結束碼與輸出。
 * 呼叫端決定給什麼參數、期望什麼 —— 例:`--static=<不存在的目錄>` → 缺建置的標記 + 結束碼 2 = 它真的跑了;
 * 只比字串的寫法在這裡什麼都不跑、0 行輸出、exit 0(審查 A 的 s01)。
 * `naiveSkips` = 同一組路徑「只比字串」會不會判成被 import(必須是 true,這個連結才真的走到了兩種寫法分岔的地方);
 * `helperRuns` = isDirectRun 對同一組路徑的判定(必須是 true)。
 * @param {string} importMetaUrl 被叫的腳本(呼叫端傳自己的 import.meta.url)
 * @param {string[]} args
 * @param {{ cwd?: string, timeoutMs?: number }} [options]
 * @returns {{ made: boolean, why?: string, status?: number|null, text?: string, naiveSkips?: boolean, helperRuns?: boolean }}
 */
export function runViaSymlink(importMetaUrl, args, { cwd = process.cwd(), timeoutMs = 180_000 } = {}) {
  const target = realpathSync(fileURLToPath(importMetaUrl))
  let dir = ''
  try {
    dir = mkdtempSync(path.join(tmpdir(), 'direct-run-link-'))
    if (!dir) return { made: false, why: '暫存目錄建立失敗' }
    const link = path.join(dir, path.basename(target))
    symlinkSync(target, link)
    const naiveSkips = path.resolve(link) !== target
    const helperRuns = isDirectRun(importMetaUrl, link)
    const child = spawnSync(process.execPath, [link, ...args], { cwd, encoding: 'utf8', timeout: timeoutMs })
    return { made: true, status: child.status, text: `${child.stdout ?? ''}${child.stderr ?? ''}`, naiveSkips, helperRuns }
  } catch (error) {
    return { made: false, why: String(error?.message ?? error).split('\n')[0] }
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}

const MARKERS = [INSTRUMENT_FAIL_MARKER, BROWSER_REQUIRED_MARKER, MISSING_BUILD_MARKER, STALE_BUILD_MARKER, SKIPPED_ENV_MARKER]
const maskMarkers = (text) => MARKERS.reduce((t, m) => t.replaceAll(m, '[標記]'), String(text))

/**
 * 「`--static=<不存在的目錄>` 一進來就判缺建置」的閘共用的那一格(section-gap / overflow-reveal-selected / doc-heading-inventory):
 * 經符號連結叫自己、給一份不存在的建置 → 必須以缺建置的標記與結束碼 2 結束(= 真的跑了)。
 * 回 { ok, line }:line 是人話、**不含任何機讀標記字樣**(selftest 的成功行可以直接印;失敗時子行程輸出裡的標記已遮成「[標記]」)。
 * @param {string} importMetaUrl 被驗的閘(呼叫端傳自己的 import.meta.url)
 * @param {string[]} [extraArgs]
 */
export function missingBuildViaSymlinkControl(importMetaUrl, extraArgs = []) {
  let holder = ''
  try {
    holder = mkdtempSync(path.join(tmpdir(), 'direct-run-no-build-'))
    const missing = path.join(holder, 'no-such-build')
    const r = runViaSymlink(importMetaUrl, [`--static=${missing}`, ...extraArgs])
    if (!r.made) return { ok: false, line: `經符號連結叫自己:對照組沒有跑成(${r.why})` }
    if (!r.naiveSkips || !r.helperRuns) return { ok: false, line: `經符號連結叫自己:路徑判定不符(只比字串會判成被 import:${r.naiveSkips};isDirectRun:${r.helperRuns})—— 這個連結沒有走到兩種寫法分岔的地方,對照組不成立` }
    const marked = r.text.includes(MISSING_BUILD_MARKER)
    if (r.status === 2 && marked) return { ok: true, line: '經符號連結叫這支閘、給一份不存在的建置 → 以缺建置的標記與結束碼 2 結束(真的跑了;只比字串的寫法在這裡什麼都不跑、exit 0)' }
    const silent = r.status === 0 && !r.text.trim()
    return { ok: false, line: `經符號連結叫這支閘、給一份不存在的建置:應以缺建置的標記與結束碼 2 結束,實得結束碼 ${String(r.status)}、輸出${marked ? '有' : '沒有'}標記${silent ? ' —— 什麼都沒跑(「是不是被直接執行」是不是又只比字串?)' : ''}。子行程輸出(標記字樣已遮):${maskMarkers(r.text).slice(0, 600)}` }
  } finally {
    if (holder) rmSync(holder, { recursive: true, force: true })
  }
}
