#!/usr/bin/env node
// meta-test for check-dangling-infra-ref — 注入 dangling LIVE infra ref → gate 必 exit 1 → 還原(PNG P4.3 gate-meta-test 家族)
//
// Gate 掃 governance docs 引用的 hook/script 名,若 target 不存在磁碟且同行無 retired/未實作/folded 標註
// → Bucket B(dangling LIVE)→ --check exit 1。此 meta-test 注入一條無標註且指向不存在 hook 的引用,
// 驗 gate 真的抓到(baseline PASS → 注入後 FAIL → 還原後 PASS)。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/check-dangling-infra-ref.mjs --check'
let ok = true

// 1) 現況必 PASS(baseline)
if (run(GATE) !== 0) {
  console.error('✗ baseline run 應 PASS 卻 FAIL — repo 已有真 dangling-live infra ref,請先修 repo 再跑本 meta-test')
  process.exit(1)
}
console.log('✓ baseline PASS(exit 0)')

// 2) 注入 dangling LIVE infra ref → 必 FAIL → 還原
//    target 是被掃描的 governance doc;注入行引用一個磁碟上不存在的 hook 名,
//    且同行「不含」任何 ANNOTATED marker(retired/未實作/planned/folded/不存在/@x-skip/@x-allow),
//    → gate 判為 Bucket B(dangling LIVE)→ --check exit 1。
const target = '.claude/references/naming-conventions.md'
const orig = readFileSync(target, 'utf8')
// hook 名須符合 gate 的 HOOK_RE(check|stop|inject|... 開頭 + _[a-z0-9_]+ + .sh/.py),
// 且不能解析到磁碟(不存在 + 無 lib-form + 無 folded-provenance)。
const DANGLING = 'check_meta_test_dangling_ref_probe.sh'
const injectedLine = `\n- INJECTED probe ref: ${DANGLING} (temporary meta-test line; restored in finally)\n`
try {
  writeFileSync(target, orig + injectedLine)
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入 dangling-live infra ref 後 gate 未 FAIL(detection 失效)'); ok = false }
  else console.log('✓ 注入 dangling-live infra ref 被抓(exit ' + code + ')')
} finally {
  writeFileSync(target, orig)
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS 卻 FAIL'); process.exit(1) }
console.log('✓ 還原後 PASS(exit 0)')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
