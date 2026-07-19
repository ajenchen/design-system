#!/usr/bin/env node
// meta-test for check-story-linkto-targets — 注入 stale <LinkTo name> → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/check-story-linkto-targets.mjs --check'
let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL(repo 有真 stale LinkTo,換乾淨 target)'); process.exit(1) }

// 2) 注入違規 → 必 FAIL → 還原
//    gate 驗每個 <LinkTo kind name> 的 name 命中該 kind(title)底下某 story name。
//    把一個既有 LinkTo 的 name 改成不存在的 story name → 觸發 stale detection(exit 1)。
const target = 'packages/design-system/src/components/TimePicker/time-picker.principles.stories.tsx'
const orig = readFileSync(target, 'utf8')
const NEEDLE = 'name="會議時段"'
if (!orig.includes(NEEDLE)) { console.error(`✗ 找不到注入錨點 ${NEEDLE}(target 檔內容已變,換錨點)`); process.exit(1) }
try {
  writeFileSync(target, orig.replace(NEEDLE, 'name="__META_TEST_NONEXISTENT_STORY__"'))
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入 stale LinkTo 後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入 stale LinkTo name 被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
