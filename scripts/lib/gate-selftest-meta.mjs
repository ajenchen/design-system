// ═══════════════════════════════════════════════════════════════════════════
// 閘的 meta-test 共用跑法:「現況必綠 + 對照組必紅」
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼需要這一支**(2026-09-21):`audit-gate-meta-test-coverage` 要求每一支 checker gate
// 都要有一支 `scripts/test-<閘名>.mjs`,證明它**在該紅的時候會紅**。當天機械盤點:87 支閘裡
// 41 支沒有 —— 而那支稽核**自己也沒有任何執行面呼叫它**,所以這 47% 的缺口從來沒有人看見。
// 它們大多早就自帶 `--selftest`(注入合成違規、必須被抓到),缺的只是「有人去跑」。
//
// 約定:
//   `node <閘>`              → 0 = 現況乾淨;其他 = 紅
//   `node <閘> --selftest`   → 0 = 合成違規**被抓到**(量具有效);非 0 = 假綠
//   「略過」**只認閘主動印出的標記**,不認退出碼(標記的單一來源:lib/launch-browser.mjs):
//     MISSING-BUILD / STALE-BUILD / 既有的缺前置訊息 → 缺前置,略過
//     SKIPPED-ENV(或 Playwright 自己的啟動失敗訊息)→ 起不了瀏覽器,略過;
//       但 GOVERNANCE_BROWSER_REQUIRED=1 的 lane 裡 → 紅
//     INSTRUMENT-FAIL / BROWSER-REQUIRED → **一律紅**,優先於任何略過判斷
//
// 兩面缺一不可:只跑 baseline 的綠燈是零證據(M32 sub-invariant「儀器要先有對照組」)。
//
// **2026-09-25 根因修正(M37:沒量到被讀成沒發生)**:第一版把 `exit 2` 一律讀成「起不了環境 → 略過」。
// 而 openStory(lib/launch-browser.mjs)上線後,十支瀏覽器閘(agent-fab-hit-area / color-scheme /
// combobox-single-path / data-table-pinned-resize / focus-indicator / form-gap-token / overlay-shortcut-scope /
// pagination-narrow-ladder / switch-thumb-ring / virtual-cursor-modality)在 story 開不起來時同樣 exit 2 ——
// 於是**真正的儀器失效**在這裡被印成「略過 … 起不了環境」、exit 0。閘自己的檔頭寫著「不是產品裁決,
// 也不算通過」,到了這一層卻被讀成通過。兩支閘(dialog-height / menu-message-row)還因此刻意改用 exit 1
// 繞開這條誤讀 —— 規則重犯代表缺的是這一層的判準,不是各閘再繞一次。
// 同一個病的另兩面一併收掉:
//   · agent-logo-brand-scale / agent-panel-fixed-anatomy 的**內建自測失敗**也是 exit 2 → 以前被略過,現在紅;
//   · 五支手寫的 meta-test(action-bar-toolbar 等)各自抄了一份「exit 2 = 略過」→ 改呼叫本檔(M17)。

import { spawnSync } from 'node:child_process'
import {
  BROWSER_REQUIRED_ENV,
  BROWSER_REQUIRED_MARKER,
  INSTRUMENT_FAIL_MARKER,
  MISSING_BUILD_MARKER,
  SKIPPED_ENV_MARKER,
  STALE_BUILD_MARKER,
  isBrowserRequired,
} from './launch-browser.mjs'

const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// 「儀器失效」—— 開了卻沒量到。任何輸出含這個標記:不是略過、也不是通過。
// 建置快照不完整(lib/storybook-static-snapshot.mjs)印的也是同一個字(那支會交付給 consumer、
// 不 import 本 repo 的 launch-browser,所以字串寫在那邊;test-storybook-static-snapshot 斷言兩邊一致)。
const INSTRUMENT_FAIL = new RegExp(`\\b${literal(INSTRUMENT_FAIL_MARKER)}\\b`, 'u')

// 「必需瀏覽器的 lane 起不了瀏覽器」—— 紅(launch-browser.mjs exitOnBrowserLaunchFailure 印的)。
const BROWSER_REQUIRED_FAIL = new RegExp(`\\b${literal(BROWSER_REQUIRED_MARKER)}\\b`, 'u')

// 「環境起不來」——瀏覽器根本開不了。SKIPPED-ENV 是共用政策印的;另外三句是 Playwright 自己的啟動失敗訊息
//(閘直接 launchBrowser() 沒接住時,未攔截例外的第一行就是它們)。
const SKIP_PATTERN = new RegExp(`${literal(SKIPPED_ENV_MARKER)}|Failed to launch|browserType\\.launch|Executable doesn't exist`, 'u')

// 「缺前置條件」——storybook-static 不存在或過時。
//
// **2026-09-21 必須單獨認這一條的理由**:gate-meta lane 是在 repo 的**拋棄式快照**裡跑的
// (`scripts/run-gate-meta-tests.mjs` 的 snapshotRoot),而 `storybook-static` 是 gitignore 的建置產物,
// 快照裡**不存在**。缺它的時候各閘的退出碼並不一致 —— 實測 `focus-indicator-invariants` 是 2、
// 而 `pagination-narrow-ladder-invariant` 與 `agent-fab-hit-area-invariant` 是 **1**
// (原文:`✗ storybook-static missing. Run \`npm run build-storybook\` first.`)。
// 認訊息而不是只認退出碼:訊息是閘自己印的、語意明確,退出碼在各閘之間不一致。
// MISSING-BUILD 是 2026-09-25 起的標準標記(launch-browser.mjs requireStorybookBuild);
// 後兩句是更早的閘已經在印的訊息,保留辨認。
const MISSING_PREREQUISITE_MESSAGE = new RegExp(
  `\\b${literal(MISSING_BUILD_MARKER)}\\b|\\b${literal(STALE_BUILD_MARKER)}\\b|storybook-static missing|Run \`npm run build-storybook\``, 'u')

// **第三種形狀(2026-09-21 夜間 lane 實測抓到)**:有些閘**根本沒有守衛**,缺 storybook-static
// 時是直接 ENOENT 崩掉(例:`color-scheme-invariant` 的
// `lstat '.../governance-repository-snapshot-XXXX/repo/storybook-static'`),
// 輸出裡只有 Node 的堆疊,沒有任何人話訊息。
// 判準刻意用「兩個條件同時成立」而不是單一寬鬆字串:必須是檔案不存在類的錯誤,
// **而且**出錯的路徑指向 storybook-static —— 這樣不會把真正的失敗吃掉。
const isMissingStorybookCrash = (text) => (
  /ENOENT|no such file or directory/u.test(text) && /storybook-static/u.test(text)
)

const missingPrerequisite = (text) => MISSING_PREREQUISITE_MESSAGE.test(text) || isMissingStorybookCrash(text)

/**
 * 一次閘執行的判定(純函式;順序即優先序,前面的先贏)。
 * @param {{ status: number|null, text: string }} run   閘的退出碼與完整輸出(stdout + stderr)
 * @param {{ browserRequired?: boolean }} [context]
 * @returns {{ verdict: 'instrument-fail'|'browser-required'|'skip-prerequisite'|'skip-env'|'env-required'|'pass'|'fail' }}
 */
export function classifyGateRun({ status, text }, { browserRequired = isBrowserRequired() } = {}) {
  // 1. 儀器失效:沒量到 ≠ 沒發生。放在所有略過判斷之前 —— 輸出裡同時出現缺前置字樣也一樣紅。
  if (INSTRUMENT_FAIL.test(text)) return { verdict: 'instrument-fail' }
  // 2. 必需瀏覽器的 lane 起不了瀏覽器
  if (BROWSER_REQUIRED_FAIL.test(text)) return { verdict: 'browser-required' }
  // 3. 缺前置(閘明確說了「沒有建置 / 建置過時」)
  if (missingPrerequisite(text)) return { verdict: 'skip-prerequisite' }
  // 4. 起不了瀏覽器:一般環境略過;必需瀏覽器的 lane 紅
  if (SKIP_PATTERN.test(text)) return { verdict: browserRequired ? 'env-required' : 'skip-env' }
  // 5. 其餘只看退出碼 —— **包括 2**:沒有標記的 exit 2 不是略過
  return { verdict: status === 0 ? 'pass' : 'fail' }
}

/**
 * @param {string} gate 閘的檔名(相對 repo 根,例如 `scripts/button-variant-invariant.mjs`)
 * @param {{ baseArgs?: string[], selftestArgs?: string[] }} [options] 現況 / 對照組各自的參數
 * @returns {never} 直接 process.exit
 */
export function runGateSelftestMeta(gate, { baseArgs = [], selftestArgs = ['--selftest'] } = {}) {
  const run = (args) => {
    const r = spawnSync(process.execPath, [gate, ...args], { stdio: 'pipe', encoding: 'utf8' })
    return { status: r.status, text: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  }
  const browserRequired = isBrowserRequired()

  const base = run(baseArgs)
  const baseVerdict = classifyGateRun(base, { browserRequired }).verdict
  if (baseVerdict === 'skip-prerequisite') {
    console.log(`· 略過:${gate} 缺 storybook-static(exit ${base.status})—— 這是缺前置,不是產品壞掉;`)
    console.log('  真正的紅綠由 CI 的瀏覽器 job 裁決(那裡會先 build-storybook)。')
    process.exit(0)
  }
  if (baseVerdict === 'skip-env') {
    console.log(`· 略過:${gate} 起不了環境(exit ${base.status};閘印了 ${SKIPPED_ENV_MARKER} 或 Playwright 啟動失敗)`)
    process.exit(0)
  }

  let ok = true
  const explain = {
    'instrument-fail': `✗ baseline 儀器失效(exit ${base.status};輸出含 ${INSTRUMENT_FAIL_MARKER})—— 沒量到不是略過,也不是通過`,
    'browser-required': `✗ baseline 起不了瀏覽器,而這個 lane 宣告 ${BROWSER_REQUIRED_ENV}=1(exit ${base.status})—— 不准略過`,
    'env-required': `✗ baseline 起不了瀏覽器,而這個 lane 宣告 ${BROWSER_REQUIRED_ENV}=1(exit ${base.status})—— 不准略過`,
    fail: `✗ baseline 應該綠卻紅(exit ${base.status})${base.status === 2 ? '—— exit 2 不是略過:略過只認閘明確印出的缺前置 / 環境標記' : ''}`,
  }
  if (baseVerdict !== 'pass') {
    console.error(`${explain[baseVerdict]}\n${base.text}`)
    ok = false
  } else {
    console.log('✓ baseline PASS(現況乾淨)')
  }

  const control = run(selftestArgs)
  const controlVerdict = classifyGateRun(control, { browserRequired }).verdict
  if (controlVerdict === 'skip-prerequisite' || controlVerdict === 'skip-env') {
    console.log('· 略過:對照組起不了環境')
    process.exit(ok ? 0 : 1)
  }
  if (controlVerdict === 'instrument-fail') {
    console.error(`✗ 對照組儀器失效(exit ${control.status};輸出含 ${INSTRUMENT_FAIL_MARKER})—— 沒量到不得讀成「對照組被抓到」\n${control.text}`)
    ok = false
  } else if (controlVerdict === 'browser-required' || controlVerdict === 'env-required') {
    console.error(`✗ 對照組起不了瀏覽器,而這個 lane 宣告 ${BROWSER_REQUIRED_ENV}=1(exit ${control.status})—— 不准略過\n${control.text}`)
    ok = false
  } else if (controlVerdict !== 'pass') {
    console.error(`✗ 對照組沒讓閘紅 —— 這支閘的綠燈是零證據(exit ${control.status})\n${control.text}`)
    ok = false
  } else {
    console.log('✓ 對照組被抓到(閘在該紅的時候會紅)')
  }

  process.exit(ok ? 0 : 1)
}
