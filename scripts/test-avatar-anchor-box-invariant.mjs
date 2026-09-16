#!/usr/bin/env node
// meta-test for avatar-anchor-box-invariant — 現況必綠、對照組(注入被拉寬的 Avatar 形狀)必紅(gate-meta-test 家族)。
// 需要已 build 的 storybook-static;起不了 Chromium / 沒有 build 時視為略過。
import { spawnSync } from 'node:child_process'
const run = (args) => spawnSync(process.execPath, ['scripts/avatar-anchor-box-invariant.mjs', ...args], { stdio: 'pipe', encoding: 'utf8' })
// baseline 用 --limit 收斂:這支驗的是**偵測力**(該紅會不會紅),覆蓋率由 CI 的完整 sweep 負責,
// 兩邊都跑全掃會讓同一份工作做三次(2026-09-16 實測:CI job 因此被 15 分鐘上限砍掉)。
const base = run(['--limit=60'])
if (base.status === 2) { console.log('· 略過:沒有 storybook-static(閘 exit 2)'); process.exit(0) }
if (/SKIPPED-ENV|Failed to launch|browserType\.launch/u.test(base.stdout + base.stderr)) { console.log('· 略過:環境起不了 Chromium'); process.exit(0) }
let ok = true
if (base.status !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL\n' + base.stdout + base.stderr); ok = false } else console.log('✓ baseline PASS(gate exit 0)')
const sab = run(['--selftest', '--limit=1'])
// 注:對照組只需要一支 story —— 注入點在第一支掃到的頁面上。
if (sab.status !== 1) { console.error('✗ 對照組(被拉寬的外框)沒讓閘紅(detection 失效)\n' + sab.stdout + sab.stderr); ok = false } else console.log('✓ 對照組被抓(閘 exit 1)')
process.exit(ok ? 0 : 1)
