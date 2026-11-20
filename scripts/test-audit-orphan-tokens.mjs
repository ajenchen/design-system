#!/usr/bin/env node
// meta-test for audit-orphan-tokens — 注入已知違規(真 orphan token)→ gate 必 exit != 0 → 還原(PNG P4.3 gate-meta-test 家族)
//
// Gate 檢測邏輯(scripts/audit-orphan-tokens.mjs --check)fail branch (c):cat.real.length > 0 →
// 「N real orphan token(s)」→ process.exit(1)。本 meta-test 在真 token CSS 檔尾注入一個
// 「不被任何 consumer 消費、且不落任何 structural-keep regex」的 orphan token(--zzz- 前綴不撞 bridge
// class-name;唯一亂名不撞 JS literal mirror / @theme / @utility)→ 逼 cat.real 從 0 變 1 → gate FAIL。
//
// 2026-11-20 起由 ci.yml governance-control-plane job 直呼(knowledge-prune WP-21),原本只在夜間 harness 跑;
// 本機約 66 秒(閘本身每次約 13 秒、跑五次),放在與 verify-static 平行的 job,不拉長關鍵路徑。
//
// @gate-contract
//   保證: audit-orphan-tokens.mjs(--check) 該紅時紅、該綠時綠 —— 在 tokens/motion/motion.css 末尾注入一顆沒人用的 --zzz- token → 必須非 0;
//         注入「被 padding-top 讀」「只被另一個自訂屬性讀」「沒人讀」三個名字 → 必須非 0,而且只點名後兩個;
//         拿掉 token-registry.json 的 palette 保留類別 → 必須非 0;注入前與每次還原後閘都必須 exit 0
//   紅: 任一步不照預期 → 印出是哪一步並 exit 1
//   綠: 都照預期時 exit 0;motion.css 與 token-registry.json 在 finally 寫回原文,不讀時間,重複跑結果相同
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

// 2a) 2026-11-20(A123 / CISB0-ORPHAN-TOKENS):token 檔裡一般 CSS 屬性讀的 var() 算消費、自訂屬性宣告讀的不算 —— 兩面同一次注入:
//     --zzz-…-used-by-property 只被 padding-top 讀 → 必須不是孤兒(改前會被誤判:layoutSpace.css 的 --layout-body-start / -end 就是這一種);
//     --zzz-…-feeds-only-a-name 只被另一個自訂屬性讀、--zzz-…-alias 沒人讀 → 兩個都必須是孤兒(規則沒有放寬成「token 檔裡出現過 var() 就算」)。
const runOut = () => spawnSync(process.execPath, ['--', 'scripts/audit-orphan-tokens.mjs', '--check'], { encoding: 'utf8', cwd: ROOT })
try {
  writeFileSync(target, orig + '\n[data-zzz-meta-test] {\n  --zzz-meta-test-used-by-property: 1px;\n  --zzz-meta-test-feeds-only-a-name: 2px;\n' +
    '  --zzz-meta-test-alias: var(--zzz-meta-test-feeds-only-a-name);\n  padding-top: var(--zzz-meta-test-used-by-property);\n}\n')
  const r = runOut()
  const out = `${r.stdout}${r.stderr}`
  const named = (name) => new RegExp(`❌ ${name} @`).test(out)
  if (r.status === 0) { console.error('✗ 注入兩個只被自訂屬性讀 / 沒人讀的名字後 gate 未 FAIL'); ok = false }
  else if (!named('--zzz-meta-test-feeds-only-a-name') || !named('--zzz-meta-test-alias')) { console.error('✗ 只被自訂屬性讀的名字沒被點名成孤兒(規則被放寬了)'); ok = false }
  else if (named('--zzz-meta-test-used-by-property')) { console.error('✗ 被一般 CSS 屬性讀的名字被判成孤兒(token 檔裡的真消費沒算到)'); ok = false }
  else console.log('✓ token 檔裡:被 padding-top 讀的不算孤兒、只被自訂屬性讀 / 沒人讀的兩個都被點名(exit ' + r.status + ')')
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
