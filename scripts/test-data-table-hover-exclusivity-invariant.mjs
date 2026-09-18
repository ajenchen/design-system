#!/usr/bin/env node
// meta-test for data-table-hover-exclusivity-invariant — 現況必綠、對照組(硬加孤兒標記)必紅(gate-meta-test 家族)。
// 需要已 build 的 storybook-static;起不了 Chromium / 沒有 build 時視為略過。
import { spawnSync } from 'node:child_process'
const run = (args) => spawnSync(process.execPath, ['scripts/data-table-hover-exclusivity-invariant.mjs', ...args], { stdio: 'pipe', encoding: 'utf8' })
const base = run([])
if (base.status === 2) { console.log('· 略過:沒有 storybook-static(閘 exit 2)'); process.exit(0) }
if (/SKIPPED-ENV|Failed to launch|browserType\.launch/u.test(base.stdout + base.stderr)) { console.log('· 略過:環境起不了 Chromium'); process.exit(0) }
let ok = true
if (base.status !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL\n' + base.stdout + base.stderr); ok = false } else console.log('✓ baseline PASS(gate exit 0)')
const sab = run(['--selftest'])
if (sab.status !== 0) { console.error('✗ 對照組(孤兒標記)沒讓閘紅(detection 失效)\n' + sab.stdout + sab.stderr); ok = false } else console.log('✓ 對照組被抓(selftest exit 0)')
process.exit(ok ? 0 : 1)
