#!/usr/bin/env node
// meta-test for data-table-invariants — 注入已知違規 → gate 必 exit≠0 → 還原(PNG P4.3 gate-meta-test 家族)
//
// data-table-invariants.mjs 是 Playwright runtime gate:拿 built storybook-static 起 http server,
// 量 DataTable 渲染後的 pixel 不變條件(I1-I7)。本 meta-test 針對 I6 =「@lg 全 cell/header 字級必
// 16px(text-body-lg)」注入違規:改 built CSS 的 `--font-body-lg-size` token(= text-body-lg 字級來源)
// → 全 lg 文字字級崩 → I6 FAIL,gate exit 1。
//
// 兩個 runtime-gate 專屬處理(vs 純 source-reading gate 的 meta-test):
//   1) 前置:此 gate 需 built storybook-static。canonical gate-meta runner 的 snapshot 刻意不複製
//      ignored build output，所以此 meta-test 只在 disposable snapshot 內自行 build；不會回寫 caller。
//   2) 注入目標 CSS 檔名帶 build hash(preview-<hash>.css)→ 動態掃 assets/*.css 找含該 token 的檔,不寫死。
//   3) **注入只寫在建置的私有複本上**(2026-09-25):閘有 `--build=<dir>` 之後,不再原地改工作樹的 storybook-static。
//      原本是改完 → 跑 → 寫回:注入期間任何人(別的閘、別的 agent)對 storybook-static 建快照,拿到的會是**重簽過清單的
//      注入版**,完整性核對擋不下來(清單是對的),量到 11px 字級卻以為是產品(M37:把「路徑」當成「建置身分」)。
//      中途被中止還會把注入版留在工作樹。複本在 os.tmpdir(),結束一律刪;工作樹的建置全程唯讀。
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resignBuildManifest } from './lib/storybook-static-snapshot.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GATE = join(ROOT, 'scripts/data-table-invariants.mjs') // 無 --check;唯一的參數是 --build=<建置目錄>(預設 storybook-static)
const runGate = (args = []) => {
  const result = spawnSync(process.execPath, ['--', GATE, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return { status: result.status ?? 1, text: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

// 前置:canonical runner 不會把 ignored storybook-static 帶入 snapshot。只允許在已標記的
// disposable snapshot 自行建立，避免單獨執行 meta-test 時意外寫入 caller 工作區。
const STATIC = join(ROOT, 'storybook-static')
if (!existsSync(STATIC)) {
  const disposableRoot = process.env.GOVERNANCE_DISPOSABLE_SNAPSHOT_ROOT
  if (!disposableRoot || realpathSync(disposableRoot) !== realpathSync(ROOT)) {
    console.error('✗ storybook-static 缺 — 先 `npm run build-storybook`(data-table-invariants 需 built artifact 才能跑)')
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
if (runGate().status !== 0) { console.error('✗ baseline run 應 PASS 卻 FAIL'); process.exit(1) }

// 2) 注入違規(--font-body-lg-size → 11px → text-body-lg @lg 字級崩)→ I6 必 FAIL —— 在**私有複本**上做,工作樹的建置不動
// 注入是**刻意**改建置:複本的 build-info.json 檔案清單跟著重簽(2026-09-25 起快照會逐檔核對大小),
// 否則閘會先以「建置不完整 / INSTRUMENT-FAIL」拒絕 —— 那個紅不是偵測到違規,算成「被抓」就是假證明(M37)。
const copyRoot = mkdtempSync(join(tmpdir(), 'data-table-meta-'))
try {
  const copy = join(copyRoot, 'storybook-static')
  cpSync(STATIC, copy, { recursive: true })
  const copiedTarget = join(copy, relative(STATIC, target))
  writeFileSync(copiedTarget, readFileSync(copiedTarget, 'utf8').replace(TOKEN_RE, (_m, p1) => `${p1}11px`))
  resignBuildManifest(copy)
  const { status: code, text } = runGate([`--build=${copy}`])
  if (code === 0) { console.error('✗ 注入違規後 gate 未 FAIL(I6 font detection 失效)'); ok = false }
  else if (/INSTRUMENT-FAIL/.test(text)) { console.error('✗ 注入違規後的紅是儀器失效(沒量到),不是偵測到違規 —— 不能算被抓\n' + text.slice(-1500)); ok = false }
  else if (!/✗ I6 \|/.test(text)) { console.error('✗ 注入違規後有紅,但不是 I6 抓到的 —— 不能證明 I6 會紅\n' + text.slice(-1500)); ok = false }
  else console.log('✓ 注入違規被抓(I6 @lg 字級崩,exit ' + code + ')')
} finally {
  rmSync(copyRoot, { recursive: true, force: true })
}

// (原本的第 3 步「還原後必 PASS」已不需要:工作樹的建置從頭到尾沒被改過,第 1 步的 baseline 就是它的結果。)
console.log(ok ? '✅ meta-test PASS' : '❌ meta-test FAIL')
process.exit(ok ? 0 : 1)
