#!/usr/bin/env node
// meta-test for header-tabs-slot-invariants — 注入已知違規 → gate 必 exit≠0 → 還原(PNG P4.3 gate-meta-test 家族)
//
// header-tabs-slot-invariants.mjs 是 Playwright runtime gate:拿 built storybook-static 起 http server,
// 量 header tabsSlot 三種 overflow 模式渲染後的 W2 契約(tablist paddingLeft/Right = 解析後
// var(--layout-space-loose) 且 = 16px + 第一 tab 左緣 rect 對齊)。本 meta-test 注入違規:改 built CSS
// 的 `--layout-space-loose` token 宣告 → 0px → padding/rect 全崩 → gate 必 FAIL(證明 gate 測的是
// render 值,不是 source 字面)。
//
// 兩個 runtime-gate 專屬處理(vs 純 source-reading gate 的 meta-test;同 test-data-table-invariants.mjs):
//   1) 前置:此 gate 需 built storybook-static。canonical gate-meta runner 的 snapshot 刻意不複製
//      ignored build output,所以此 meta-test 只在 disposable snapshot 內自行 build;不會回寫 caller。
//   2) 注入目標 CSS 檔名帶 build hash(preview-<hash>.css)→ 動態掃 assets/*.css 找含該 token 宣告
//      的檔,不寫死。token 在 layoutSpace.css 有 3 處宣告(root / lg override / md reset)→ 全域
//      replace + 掃所有含宣告的 css 檔(只改第一處可能被 cascade 後宣告蓋回 → meta-test 假紅)。
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GATE = join(ROOT, 'scripts/header-tabs-slot-invariants.mjs') // 無 --check(此 gate 忽略 argv,直接跑)
const runGate = () => {
  const result = spawnSync(process.execPath, ['--', GATE], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return result.status ?? 1
}

// 前置:canonical runner 不會把 ignored storybook-static 帶入 snapshot。只允許在已標記的
// disposable snapshot 自行建立,避免單獨執行 meta-test 時意外寫入 caller 工作區。
const STATIC = join(ROOT, 'storybook-static')
if (!existsSync(STATIC)) {
  const disposableRoot = process.env.GOVERNANCE_DISPOSABLE_SNAPSHOT_ROOT
  if (!disposableRoot || realpathSync(disposableRoot) !== realpathSync(ROOT)) {
    console.error('✗ storybook-static 缺 — 先 `npm run build-storybook`(header-tabs-slot-invariants 需 built artifact 才能跑)')
    process.exit(1)
  }
  // A clean snapshot has no ignored workspace dist either.  Build the library
  // surface first so storybook-config can resolve @qijenchen/design-system.
  for (const [label, args] of [
    ['library prerequisite', ['run', '--silent', 'build:lib']],
    ['Storybook', ['run', '--silent', 'build-storybook']],
  ]) {
    const build = spawnSync('npm', args, {
      cwd: ROOT,
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    if (build.status !== 0) {
      const detail = `${build.stderr || build.stdout || build.error?.message || build.signal || 'unknown failure'}`.trim()
      console.error(`✗ disposable snapshot ${label} build 失敗:${detail.slice(-2000)}`)
      process.exit(1)
    }
  }
  if (!existsSync(STATIC)) {
    console.error('✗ disposable snapshot Storybook build exit 0 但未產生 storybook-static')
    process.exit(1)
  }
}

// 找注入目標:含 `--layout-space-loose:` 宣告的 built CSS(檔名帶 build hash → 動態掃,禁寫死;
// 宣告 `--layout-space-loose:<value>` 才中,var(--layout-space-loose) 引用不中)
const TOKEN_FIND = /--layout-space-loose:/
const assetsDir = join(STATIC, 'assets')
const targets = readdirSync(assetsDir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => join(assetsDir, f))
  .filter((p) => TOKEN_FIND.test(readFileSync(p, 'utf8')))
if (targets.length === 0) {
  console.error('✗ 找不到含 --layout-space-loose token 宣告的 built CSS — 無法注入,拒絕假綠(meta-test 無效)')
  process.exit(1)
}

let ok = true

// 1) 現況必 PASS
if (runGate() !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }

// 2) 注入違規(--layout-space-loose 全宣告 → 0px → tablist padding/第一 tab rect 對齊全崩)→ 必 FAIL → 還原
const originals = new Map(targets.map((p) => [p, readFileSync(p, 'utf8')]))
try {
  for (const [p, orig] of originals) {
    writeFileSync(p, orig.replace(/(--layout-space-loose:)[^;}]+/g, (_m, p1) => `${p1}0px`))
  }
  const code = runGate()
  if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(W2 render 契約 detection 失效)'); ok = false }
  else console.log('✓ 注入違規被抓(--layout-space-loose → 0px,W2 padding/rect 崩,exit ' + code + ')')
} finally {
  for (const [p, orig] of originals) writeFileSync(p, orig) // 還原原檔 bytes
}

// 3) 還原後必 PASS
if (runGate() !== 0) { console.error('✗ 還原後應 PASS'); process.exit(1) }
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
