// ═══════════════════════════════════════════════════════════════════════════
// 閘的 meta-test 共用跑法:「現況必綠 + 對照組必紅」
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼需要這一支**(2026-09-21):`audit-gate-meta-test-coverage` 要求每一支 checker gate
// 都要有一支 `scripts/test-<閘名>.mjs`,證明它**在該紅的時候會紅**。當天機械盤點:87 支閘裡
// 41 支沒有 —— 而那支稽核**自己也沒有任何執行面呼叫它**,所以這 47% 的缺口從來沒有人看見。
// 它們大多早就自帶 `--selftest`(注入合成違規、必須被抓到),缺的只是「有人去跑」。
//
// 約定(沿用既有閘的寫法):
//   `node <閘>`              → 0 = 現況乾淨;2 = 缺前置(例如沒有 storybook-static)視為略過
//   `node <閘> --selftest`   → 0 = 合成違規**被抓到**(量具有效);非 0 = 假綠
//
// 兩面缺一不可:只跑 baseline 的綠燈是零證據(M32 sub-invariant「儀器要先有對照組」)。

import { spawnSync } from 'node:child_process'

// 「環境起不來」——瀏覽器根本開不了。
const SKIP_PATTERN = /SKIPPED-ENV|Failed to launch|browserType\.launch|Executable doesn't exist/u

// 「缺前置條件」——storybook-static 不存在或過時。
//
// **2026-09-21 必須單獨認這一條的理由**:gate-meta lane 是在 repo 的**拋棄式快照**裡跑的
// (`scripts/run-gate-meta-tests.mjs` 的 snapshotRoot),而 `storybook-static` 是 gitignore 的建置產物,
// 快照裡**不存在**。缺它的時候各閘的退出碼並不一致 —— 實測 `focus-indicator-invariants` 是 2、
// 而 `pagination-narrow-ladder-invariant` 與 `agent-fab-hit-area-invariant` 是 **1**
// (原文:`✗ storybook-static missing. Run \`npm run build-storybook\` first.`)。
// 只認退出碼 2 的話,退出碼 1 的那些會被我這支共用跑法誤報成「baseline 應該綠卻紅」——
// **把「缺前置」當成「產品壞了」**,正是這一整批在修的同一種病。
// 認訊息而不是只認退出碼:訊息是閘自己印的、語意明確,退出碼在各閘之間不一致。
const MISSING_PREREQUISITE = /storybook-static missing|STALE-BUILD|Run `npm run build-storybook`/u

/**
 * @param {string} gate 閘的檔名(相對 repo 根,例如 `scripts/button-variant-invariant.mjs`)
 * @returns {never} 直接 process.exit
 */
export function runGateSelftestMeta(gate) {
  const run = (args) => spawnSync(process.execPath, [gate, ...args], { stdio: 'pipe', encoding: 'utf8' })

  const base = run([])
  const baseText = `${base.stdout ?? ''}${base.stderr ?? ''}`
  if (MISSING_PREREQUISITE.test(baseText)) {
    console.log(`· 略過:${gate} 缺 storybook-static(exit ${base.status})—— 這是缺前置,不是產品壞掉;`)
    console.log('  真正的紅綠由 CI 的瀏覽器 job 裁決(那裡會先 build-storybook)。')
    process.exit(0)
  }
  if (base.status === 2 || SKIP_PATTERN.test(baseText)) {
    console.log(`· 略過:${gate} 起不了環境(exit ${base.status})`)
    process.exit(0)
  }

  let ok = true
  if (base.status !== 0) {
    console.error(`✗ baseline 應該綠卻紅(exit ${base.status})\n${baseText}`)
    ok = false
  } else {
    console.log('✓ baseline PASS(現況乾淨)')
  }

  const control = run(['--selftest'])
  const controlText = `${control.stdout ?? ''}${control.stderr ?? ''}`
  if (MISSING_PREREQUISITE.test(controlText) || SKIP_PATTERN.test(controlText)) {
    console.log('· 略過:對照組起不了環境')
    process.exit(ok ? 0 : 1)
  }
  if (control.status !== 0) {
    console.error(`✗ 對照組沒讓閘紅 —— 這支閘的綠燈是零證據(exit ${control.status})\n${controlText}`)
    ok = false
  } else {
    console.log('✓ 對照組被抓到(閘在該紅的時候會紅)')
  }

  process.exit(ok ? 0 : 1)
}
