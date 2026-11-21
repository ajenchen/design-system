#!/usr/bin/env node
// meta-test for audit-motion-delay-invariants — 注入已知違規 → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
// 靶點 R3(單一住處,2026-11-15 起;原本是「JS mirror 與 CSS 同值」):
//   (a) 在 motion.css 補回一份 --motion-delay-plain → CSS 長出第二份 → gate FAIL;
//   (b) 把 motion.ts 的 MOTION_DELAY_PLAIN_MS 改名 → 唯一住處讀不到 → gate FAIL。
// R1(numeric literal delay)/ R2(tier freeze needle)不受影響:(a) 改的是 CSS,(b) 改的是 export 名,
// 都不是 openDelay/closeDelay/delayDuration 關鍵字;(b) 會讓 tier-freeze 的 consumer import 斷掉,但 R2 只比對字串,不編譯。
//
// 2026-11-20 起由 ci.yml verify-static 直呼(knowledge-prune WP-21),原本只在夜間 harness 跑。
//
// @gate-contract
//   保證: audit-motion-delay-invariants.mjs 的 R3 在該紅的時候會紅 —— (a) motion.css 補回 --motion-delay-plain、(b) motion.ts 的
//         MOTION_DELAY_PLAIN_MS 改名,兩次注入閘都必須 exit 非 0;注入前與還原後閘都必須 exit 0(R1 / R2 沒有注入,只靠現況必綠)
//   紅: 現況就紅、注入沒改到東西(靶點漂移)、注入後閘仍 exit 0、或還原後不綠 → 印出是哪一步並 exit 1
//   綠: 都照預期時 exit 0;兩個檔在 finally 寫回原文,不讀時間,重複跑結果相同
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const GATE = join(ROOT, 'scripts/audit-motion-delay-invariants.mjs')
const run = () => spawnSync(process.execPath, ['--', GATE], { stdio: 'pipe' }).status ?? 1
let ok = true

// 1) 現況必 PASS
if (run() !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ baseline PASS(exit 0)')

// 2) 注入違規 → 必 FAIL → 還原
const inject = (rel, mutate, label) => {
  const target = join(ROOT, rel)
  const orig = readFileSync(target, 'utf8')
  try {
    const mutated = mutate(orig)
    if (mutated === orig) { console.error(`✗ 注入無效(${label}):找不到可改的地方(gate 靶點漂移)`); process.exit(1) }
    writeFileSync(target, mutated)
    const code = run()
    if (code === 0) { console.error(`✗ 注入違規後 gate 未 FAIL(${label})`); ok = false }
    else console.log(`✓ 注入違規被抓(${label};exit ${code})`)
  } finally {
    writeFileSync(target, orig)
  }
}
inject('packages/design-system/src/tokens/motion/motion.css', (s) => s.replace(':root {', ':root {\n  --motion-delay-plain: 500ms;'), 'motion.css 補回 CSS 鏡像')
inject('packages/design-system/src/tokens/motion/motion.ts', (s) => s.replace('MOTION_DELAY_PLAIN_MS = 500', 'MOTION_DELAY_PLAIN_MS_RENAMED = 500'), 'motion.ts 常數改名')

// 3) 還原後必 PASS
if (run() !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log('✓ 還原後 PASS(exit 0)')
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
