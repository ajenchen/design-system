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

const SKIP_PATTERN = /SKIPPED-ENV|Failed to launch|browserType\.launch|Executable doesn't exist/u

/**
 * @param {string} gate 閘的檔名(相對 repo 根,例如 `scripts/button-variant-invariant.mjs`)
 * @returns {never} 直接 process.exit
 */
export function runGateSelftestMeta(gate) {
  const run = (args) => spawnSync(process.execPath, [gate, ...args], { stdio: 'pipe', encoding: 'utf8' })

  const base = run([])
  const baseText = `${base.stdout ?? ''}${base.stderr ?? ''}`
  if (base.status === 2 || SKIP_PATTERN.test(baseText)) {
    console.log(`· 略過:${gate} 缺前置條件(exit ${base.status})`)
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
  if (SKIP_PATTERN.test(controlText)) {
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
