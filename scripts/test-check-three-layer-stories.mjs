#!/usr/bin/env node
// meta-test for check-three-layer-stories — 暫時 rename 一個 principles 檔 → gate 必 exit 1 → 還原
//
// 2026-11-20 起由 ci.yml verify-static 直呼(knowledge-prune WP-21),原本只在夜間 harness 跑。
//
// @gate-contract
//   保證: check-three-layer-stories.mjs(--check) 在該紅的時候會紅 —— 暫時把 accordion.principles.stories.tsx 改名(Accordion 缺設計原則層),閘必須 exit 非 0;注入前與還原後同一支閘都必須 exit 0
//   紅: 現況就紅(repo 已有真違規)、注入後閘仍 exit 0(偵測失效)、或還原後不綠 → 印出是哪一步並 exit 1
//   綠: 三步都照預期時 exit 0;檔名在 finally 改回,不讀時間,重複跑結果相同
import { spawnSync } from 'node:child_process'
import { renameSync } from 'node:fs'

const run = () => spawnSync(process.execPath, ['--', 'scripts/check-three-layer-stories.mjs', '--check'], { stdio: 'pipe' }).status ?? 1
const f = 'packages/design-system/src/components/Accordion/accordion.principles.stories.tsx'
const hidden = f + '.metatest-hidden'

if (run() !== 0) { console.error('✗ baseline 應 PASS'); process.exit(1) }
let ok = true
try {
  renameSync(f, hidden)
  if (run() === 0) { console.error('✗ 缺層未被抓'); ok = false } else console.log('✓ 缺層被抓')
} finally { renameSync(hidden, f) }
if (run() !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL'); process.exit(ok ? 0 : 1)
