#!/usr/bin/env node
// meta-test for check-plugin-installed — 注入 detection state → gate 分支必翻轉 → 還原(PNG P4.3 gate-meta-test 家族)
//
// ⚠️ 本 gate 是 notice-only postinstall script:**永遠 exit 0**(見 check-plugin-installed.mjs
//    header「永遠 exit 0(notice-only)」+ L46-47)。它唯一的 detection logic =
//    existsSync(<cwd>/node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json),
//    據此在兩個 STDOUT 分支間選擇(「治理本體就位」確認 vs「尚未就位」友善 notice)。
//    因 exit code 恆為 0,無法用 exit≠0 當 pass/fail 訊號;故 meta-test 以 gate 的**可觀察
//    STDOUT 分支**當訊號:toggle manifest presence,斷言輸出確實隨 detection 翻轉。
//
// Anti-fake-green:gate 用 process.cwd() 解析 manifest 路徑,故在 isolated temp cwd 造/不造
//    manifest 即可注入 detection state,完全不動 repo / node_modules。若 detection 被移除
//    (gate 永遠印同一分支)→ 2a 或 2b 斷言必 FAIL,本 test 隨之 FAIL(非恆綠)。
import { execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve(process.cwd(), 'scripts/check-plugin-installed.mjs')
const MANIFEST_REL = 'node_modules/@qijenchen/design-system/ds-canonical/fork/manifest.json'
// 分支唯一標記(注意:「尚未就位」含子字串「就位」,故 present 標記用「治理本體就位」contiguous — 只在 present 分支出現)
const PRESENT = '治理本體就位'
const MISSING = '尚未就位'

// 從指定 cwd 跑 gate,回 {code, out}
const runIn = (cwd) => {
  try { return { code: 0, out: execSync(`node ${JSON.stringify(SCRIPT)}`, { cwd, stdio: 'pipe' }).toString() } }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout ? e.stdout.toString() : '') } }
}

let ok = true

// 1) baseline — 在真 repo cwd 跑 gate;notice-only 必 exit 0
const baseline = runIn(process.cwd())
if (baseline.code !== 0) { console.error('✗ baseline run 應 exit 0 卻 =' + baseline.code); process.exit(1) }
console.log('✓ baseline exit 0 (notice-only gate)')

// 2) 注入 detection state（isolated temp cwd,不動 repo / node_modules）→ 分支必翻轉 → finally 還原
const tmp = mkdtempSync(join(tmpdir(), 'plugin-gate-'))
try {
  // 2a) 缺 manifest → gate 必偵測到並印「尚未就位」notice
  const missing = runIn(tmp)
  if (missing.code !== 0) { console.error('✗ missing-manifest run 應 exit 0'); ok = false }
  if (!missing.out.includes(MISSING)) { console.error('✗ 缺 manifest 卻未印「尚未就位」— detection 失效'); ok = false }
  else console.log('✓ 缺 manifest → gate 偵測到並印「尚未就位」notice')

  // 2b) 注入 manifest → gate detection 必翻轉成「就位」分支且不再印「尚未就位」
  mkdirSync(join(tmp, 'node_modules/@qijenchen/design-system/ds-canonical/fork'), { recursive: true })
  writeFileSync(join(tmp, MANIFEST_REL), '{"fork":"meta-test"}')
  const present = runIn(tmp)
  if (present.code !== 0) { console.error('✗ present-manifest run 應 exit 0'); ok = false }
  if (!present.out.includes(PRESENT) || present.out.includes(MISSING)) {
    console.error('✗ 注入 manifest 後分支未翻轉成「就位」— detection 失效(fake-green trap)'); ok = false
  } else console.log('✓ 注入 manifest → gate detection 翻轉成「就位」分支')
} finally {
  rmSync(tmp, { recursive: true, force: true }) // 還原:清掉 temp cwd(repo 全程零改動)
}

// 3) 還原後真 repo cwd 再跑一次必 exit 0
if (runIn(process.cwd()).code !== 0) { console.error('✗ 還原後應 exit 0'); process.exit(1) }
console.log('✓ 還原後 gate exit 0')

console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
