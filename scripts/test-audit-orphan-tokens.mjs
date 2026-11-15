#!/usr/bin/env node
// meta-test for audit-orphan-tokens — 注入已知違規(真 orphan token)→ gate 必 exit != 0 → 還原(PNG P4.3 gate-meta-test 家族)
//
// Gate 檢測邏輯(scripts/audit-orphan-tokens.mjs --check)fail branch (c):cat.real.length > 0 →
// 「N real orphan token(s)」→ process.exit(1)。本 meta-test 在真 token CSS 檔尾注入一個
// 「不被任何 consumer 消費、且不落任何 structural-keep regex」的 orphan token(--zzz- 前綴不撞 bridge
// class-name;唯一亂名不撞 JS literal mirror / @theme / @utility)→ 逼 cat.real 從 0 變 1 → gate FAIL。
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// 從本 script 位置推 repo root(scripts/ 的上一層),cwd-independent
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = () => spawnSync(process.execPath, ['--', 'scripts/audit-orphan-tokens.mjs', '--check'], { stdio: 'pipe', cwd: ROOT }).status ?? 1
let ok = true

// 1) 現況必 PASS(baseline)
if (run() !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ baseline gate PASS(exit 0)')

// 2) 注入違規(真 orphan token)→ 必 FAIL → 還原
const target = path.join(ROOT, 'packages/design-system/src/tokens/motion/motion.css')
const orig = readFileSync(target, 'utf8')
try {
  // --zzz- 前綴不落 bridges(--spacing-/--color-/--radius- 等)→ 無 Tailwind class-name 消費;
  // 唯一亂名不落 @theme inline / @utility / JS literal mirror / structural-keep regex → 保證進 cat.real。
  writeFileSync(target, orig + '\n:root {\n  --zzz-meta-test-orphan-do-not-use: #f00;\n}\n')
  const code = run()
  if (code === 0) { console.error('✗ 注入 real orphan token 後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 2b) 2026-11-15:保留分類改讀分類表 token-registry.json 的 retention(腳本不再內建)。
//     證明它真的讀那份:拿掉分類表的 palette 一類 → 原本歸在色階完整的孤兒變成真孤兒 → 必 FAIL → 還原。
//     (腳本若還偷偷內建一份 regex,這一步會照樣 PASS —— 那就是第二份住處沒拆掉)
const registryPath = path.join(ROOT, 'packages/design-system/src/tokens/token-registry.json')
const registryOrig = readFileSync(registryPath, 'utf8')
try {
  const reg = JSON.parse(registryOrig)
  const before = reg.retention.categories.length
  reg.retention.categories = reg.retention.categories.filter((c) => c.key !== 'palette')
  if (reg.retention.categories.length !== before - 1) { console.error('✗ 分類表找不到 palette 這一類(對照組本身失效)'); ok = false }
  writeFileSync(registryPath, JSON.stringify(reg, null, 2) + '\n')
  const code = run()
  if (code === 0) { console.error('✗ 拿掉分類表的 palette 一類後 gate 未 FAIL(腳本沒有讀分類表,或另有內建分類)'); ok = false }
  else console.log('✓ 拿掉分類表的一類 → 被抓(exit ' + code + ';保留分類確實讀自分類表)')
} finally {
  writeFileSync(registryPath, registryOrig)
}

// 3) 還原後必 PASS
if (run() !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log('✓ 還原後 gate PASS(exit 0)')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
