#!/usr/bin/env node
// meta-test for action-bar-toolbar-invariant — 對照組必紅、現況必綠(gate-meta-test 家族)。
// 閘自帶 --selftest:注入 `[data-toolbar-search]{min-width:auto!important}`(= 2026-09-16 修前的手抄工具列)→ 至少一格溢出 / 錯位。
// 需要已 build 的 storybook-static(CI 的瀏覽器 job 先 build);起不了 Chromium 時閘自己印 SKIPPED-ENV / 例外 → 這裡視為略過。
import { spawnSync } from 'node:child_process'
const run = (args) => spawnSync(process.execPath, ['scripts/action-bar-toolbar-invariant.mjs', ...args], { stdio: 'pipe', encoding: 'utf8' })
const base = run([])
if (base.status === 2) { console.log('· 略過:沒有 storybook-static(閘 exit 2)'); process.exit(0) }
if (/SKIPPED-ENV|Failed to launch|browserType\.launch/u.test(base.stdout + base.stderr)) { console.log('· 略過:環境起不了 Chromium'); process.exit(0) }
let ok = true
if (base.status !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL\n' + base.stdout + base.stderr); ok = false } else console.log('✓ baseline PASS(gate exit 0)')
const sab = run(['--selftest'])
if (sab.status !== 0) { console.error('✗ 對照組(拿掉搜尋框下限)沒讓閘紅(detection 失效)\n' + sab.stdout + sab.stderr); ok = false } else console.log('✓ 對照組被抓(selftest exit 0)')
process.exit(ok ? 0 : 1)
