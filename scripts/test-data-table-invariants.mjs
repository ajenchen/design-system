#!/usr/bin/env node
// meta-test for data-table-invariants — 注入已知違規 → gate 必 exit≠0 → 還原(PNG P4.3 gate-meta-test 家族)
//
// data-table-invariants.mjs 是 Playwright runtime gate:拿 built storybook-static 起 http server,
// 量 DataTable 渲染後的 pixel 不變條件(I1-I7)。本 meta-test 針對 I6 =「@lg 全 cell/header 字級必
// 16px(text-body-lg)」注入違規:改 built CSS 的 `--font-body-lg-size` token(= text-body-lg 字級來源)
// → 全 lg 文字字級崩 → I6 FAIL,gate exit 1。
//
// 兩個 runtime-gate 專屬處理(vs 純 source-reading gate 的 meta-test):
//   1) 前置:此 gate 需 built storybook-static(CI / 本機 `npm run build-storybook` 後才有)。缺 = 環境未備。
//   2) 注入目標 CSS 檔名帶 build hash(preview-<hash>.css)→ 動態掃 assets/*.css 找含該 token 的檔,不寫死。
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe' }); return 0 } catch (e) { return e.status ?? 1 } }
const GATE = 'node scripts/data-table-invariants.mjs' // 無 --check(此 gate 忽略 argv,直接跑)

// 前置:built storybook-static 必存在(此 gate 缺 build 會自己 exit 1,非偵測失效)
const STATIC = 'storybook-static'
if (!existsSync(STATIC)) {
  console.error('✗ storybook-static 缺 — 先 `npm run build-storybook`(data-table-invariants 需 built artifact 才能跑)')
  process.exit(1)
}

// 找注入目標:含 `--font-body-lg-size:` 的 built CSS(檔名帶 build hash → 動態掃,禁寫死)
const TOKEN_RE = /(--font-body-lg-size:)[^;}]+/
const assetsDir = join(STATIC, 'assets')
const target = readdirSync(assetsDir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => join(assetsDir, f))
  .find((p) => TOKEN_RE.test(readFileSync(p, 'utf8')))
if (!target) {
  console.error('✗ 找不到含 --font-body-lg-size token 的 built CSS — 無法注入,拒絕假綠(meta-test 無效)')
  process.exit(1)
}

let ok = true

// 1) 現況必 PASS
if (run(GATE) !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }

// 2) 注入違規(--font-body-lg-size → 11px → text-body-lg @lg 字級崩)→ I6 必 FAIL → 還原
const orig = readFileSync(target, 'utf8')
try {
  writeFileSync(target, orig.replace(TOKEN_RE, (_m, p1) => `${p1}11px`))
  const code = run(GATE)
  if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(I6 font detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(I6 @lg 字級崩,exit ' + code + ')')
} finally {
  writeFileSync(target, orig) // 還原原檔
}

// 3) 還原後必 PASS
if (run(GATE) !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
