#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 提交的對外彙總檔 styles/tokens.css 逐字等於產生器從現在的樹算出來的內容 —— 檔頭寫「自動產生、禁止手改」這句話是真的
 *   紅: 手加 / 手刪一行 @import、或新增一個宣告 :root / @theme 的元件樣式檔卻沒重跑產生器 → --check 印 DRIFT 並 exit 1;
 *       --selftest 在記憶體裡造這幾種漂移(拿掉 tabs.css 那行、假裝 agent-panel.css 沒被元件程式匯入、多一個沒被匯入的新元件樣式檔)各自必紅
 *   綠: 樹與提交的檔一致時必綠;純讀檔比字串,不開瀏覽器、不量時間,重跑結果不變
 *
 * gen-figma-make-artifacts.mjs — Phase 4.5 Consumer DX
 *
 * Generates SSOT-derived consumer artifacts that auto-sync with token CSS files:
 *   • packages/design-system/src/styles/tokens.css — single aggregator (1-import setup)
 *
 * Why: Figma Make + ad-hoc Tailwind consumers want 1 CSS import to load full token system,
 * not 8 individual @import lines. Generator scans tokens/ + emits aggregator preserving
 * canonical load order (primitives first → @theme-using files next).
 *
 * SSOT propagation contract (per CLAUDE.md 2026-05-23 SSOT auto-sync canonical):
 *   • Source of truth: packages/design-system/src/tokens/** (all CSS files)
 *   • Derived artifact: src/styles/tokens.css (this script generates)
 *   • CI guard: `--check` + `--selftest` run in ci.yml verify-static(2026-11-11 才真的接上 —— 這行原本寫
 *     「runs in release.yml audit gates + ci.yml」,但兩個 workflow 與 package.json 都沒有呼叫它;期間彙總檔被手改兩次、
 *     產生器輸出與提交的檔不同也沒有任何閘紅。M37「閘存在 = 檔案存在」)
 *   • Drift detection: regenerate to memory, diff with committed file, exit 1 if differ
 *   • 元件程式自己 import 的樣式檔(例:components/AgentPanel/agent-panel.css 由 agent-panel.tsx import)不進彙總檔:
 *     它隨元件模組載入;再進彙總檔 = 同一份樣式載入兩次、而且改變樣式載入順序。判準與 token-creation-invariant C6 同一條
 *     (元件樣式檔要嘛進彙總檔、要嘛被設計系統程式匯入),掃描範圍沿用它的 isScannable(stories / 測試不算)。
 *
 * Adding a new token category (e.g. `tokens/animation/animation.css`):
 *   1. Author the new token CSS file as usual
 *   2. Run `node scripts/gen-figma-make-artifacts.mjs` — aggregator auto-includes it
 *   3. Commit aggregator update alongside token file
 *   4. CI `--check` confirms no drift
 *
 * Pattern aligned with:
 *   • scripts/sync-governance-counters.mjs (governance numbers SSOT propagation)
 *   • scripts/gen-design-system-barrel.mjs (component barrel auto-gen)
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs'
import { join, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'
import { isScannable } from './token-creation-invariant.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const DS_SRC = join(REPO_ROOT, 'packages/design-system/src')
const TOKENS_DIR = join(DS_SRC, 'tokens')
const PATTERNS_DIR = join(DS_SRC, 'patterns')
const COMPONENTS_DIR = join(DS_SRC, 'components')
const OUTPUT_DIR = join(DS_SRC, 'styles')
const OUTPUT_FILE = join(OUTPUT_DIR, 'tokens.css')

const CHECK_MODE = process.argv.includes('--check')
const SELFTEST_MODE = process.argv.includes('--selftest')

/** Recursively find all .css files under TOKENS_DIR. */
function findTokenCssFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) {
      out.push(...findTokenCssFiles(full))
    } else if (s.isFile() && entry.endsWith('.css')) {
      out.push(full)
    }
  }
  return out
}

/**
 * Canonical load order — must place primitives FIRST so semantic / @theme-using files
 * can reference primitive vars via `var(--color-blue-6)` etc.
 * Other categories sorted alphabetically (deterministic + auto-handles new categories).
 *
 * Anchor: mirrors src/globals.css canonical order (2026-05-25 verify).
 */
const CATEGORY_ORDER = [
  'color',      // MUST be first (primitives defines vars consumed everywhere)
  'typography',
  'uiSize',
  'layoutSpace',
  'radius',
  'opacity',
  'motion',
  'elevation',  // future-proof
]

function sortCanonical(files) {
  return files.sort((a, b) => {
    const catA = relative(TOKENS_DIR, a).split('/')[0]
    const catB = relative(TOKENS_DIR, b).split('/')[0]
    const idxA = CATEGORY_ORDER.indexOf(catA)
    const idxB = CATEGORY_ORDER.indexOf(catB)
    // Known category? Use canonical index; unknown → push to end alphabetically.
    if (idxA !== -1 && idxB !== -1) return idxA - idxB
    if (idxA !== -1) return -1
    if (idxB !== -1) return 1
    return compareUtf8Bytes(catA, catB)
  })
}

/** Scan patterns/ + components/ for CSS files containing token/runtime CSS declarations.
 *  These declare consumer-needed tokens / styles outside tokens/ home. Per 2026-05-27 root-cause:
 *  src/globals.css 已 import them for DS internal,但 tokens.css consumer aggregator
 *  漏掉導致 consumer 拿不到。Auto-scan 防再犯。 */
function findExtraCssFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) {
      out.push(...findExtraCssFiles(full))
    } else if (s.isFile() && entry.endsWith('.css')) {
      const content = readFileSync(full, 'utf8')
      if (
        content.includes(':root') ||
        content.includes('@theme') ||
        content.includes('@utility') ||
        content.includes('@keyframes')
      ) {
        out.push(full)
      }
    }
  }
  return out
}

/** 設計系統程式(.ts / .tsx,stories / 測試不算 —— 範圍同 token-creation-invariant 的 isScannable)自己 import 的樣式檔絕對路徑。 */
function findCodeImportedCss(dir = DS_SRC, out = new Set()) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) { if (entry !== 'node_modules') findCodeImportedCss(full, out); continue }
    if (!/\.(ts|tsx)$/.test(entry) || !isScannable(relative(REPO_ROOT, full).split(sep).join('/'))) continue
    for (const m of readFileSync(full, 'utf8').matchAll(/^\s*import\s+['"](\.{1,2}\/[^'"]+\.css)['"]/gm)) out.add(join(dirname(full), m[1]))
  }
  return out
}

const defaultExtraCandidates = () => [...findExtraCssFiles(PATTERNS_DIR), ...findExtraCssFiles(COMPONENTS_DIR)]

function generate({ extraCandidates = defaultExtraCandidates(), codeImported = findCodeImportedCss() } = {}) {
  const files = sortCanonical(findTokenCssFiles(TOKENS_DIR))

  // Within color/, primitives.css must come before semantic.css
  // (semantic uses primitive var() references).
  const ordered = []
  for (const cat of [...new Set(files.map((f) => relative(TOKENS_DIR, f).split('/')[0]))]) {
    const catFiles = files.filter((f) => relative(TOKENS_DIR, f).startsWith(cat + '/'))
    catFiles.sort((a, b) => {
      const isPrimA = a.endsWith('primitives.css') ? -1 : 0
      const isPrimB = b.endsWith('primitives.css') ? -1 : 0
      return isPrimA - isPrimB || compareUtf8Bytes(a, b)
    })
    ordered.push(...catFiles)
  }

  // Scan patterns/ + components/ for CSS containing token/runtime declarations;
  // 元件程式自己 import 的(元件內部樣式,隨元件模組載入)不收 —— 見檔頭。
  const extras = extraCandidates
    .filter((f) => !codeImported.has(f))
    .sort((a, b) => compareUtf8Bytes(relative(DS_SRC, a), relative(DS_SRC, b)))

  const header = `/* ═══════════════════════════════════════════════════════════════════════
   @qijenchen/design-system — Consolidated Token Stylesheet
   ═══════════════════════════════════════════════════════════════════════

   AUTO-GENERATED by scripts/gen-figma-make-artifacts.mjs — DO NOT EDIT MANUALLY.

   To add a new token category:
     1. Create packages/design-system/src/tokens/<category>/*.css
     2. Run: node scripts/gen-figma-make-artifacts.mjs
     3. Commit this file alongside the new token file

   Single-import setup for consumers (Figma Make / ad-hoc Tailwind v4 projects):

     import '@qijenchen/design-system/styles/tokens'

   Load order canonical (per src/globals.css):
     primitives → @theme-using files (semantic / typography / uiSize / ...) →
     other categories (layoutSpace / radius / opacity / motion).

   Why aggregator:
     Tailwind v4 generates utility classes only when @theme directives are
     loaded. Individual token files declare both raw CSS vars (:root) and
     @theme inline blocks; aggregator preserves canonical order so all utility
     classes are generated correctly.

   ═══════════════════════════════════════════════════════════════════════ */

`
  // Overlay 進出場動畫 utilities(tw-animate-css;7 浮層消費 animate-in/fade/zoom/slide + --tw-enter-* 變數)。
  // 2026-07-11 加:原 class 寫了但外掛沒裝 = 動畫全 no-op。必在 tokens 前、`@import "tailwindcss"` 後
  // (entry globals.css 已先 import tailwindcss)。tw-animate-css 為 DS package dependency,consumer
  // `@import tokens` 一次拿到。SSOT = motion.css 動畫 token → overlay-motion / disclosure-motion 共用類綁 --tw-* 變數。
  // 2026-10-07:原地展開收合(TreeView / Accordion / AgentPanel 思考塊)的 collapsible keyframe 也只來自這裡 ——
  // DS 的 base.css 不再重宣告同名 keyframe / 工具類(待辦總帳 T8;scripts/motion-ssot-invariant.mjs M3)。
  const twAnimateBlock = '/* 開合動畫 utilities(tw-animate-css;7 浮層進出場 + 3 個原地展開收合消費,SSOT = tokens/motion/overlay-motion.ts、disclosure-motion.ts)*/\n@import "tw-animate-css";\n\n'
  const imports = twAnimateBlock + ordered
    .map((f) => `@import './../tokens/${relative(TOKENS_DIR, f)}';`)
    .join('\n')

  // Non-token CSS containing token/runtime declarations — auto-detected per 2026-05-27 root-cause sweep
  let extrasBlock = ''
  if (extras.length > 0) {
    extrasBlock = '\n\n/* Non-token CSS (patterns/ + components/) containing token/runtime declarations\n   or component-internal styles — auto-detected by generator scan. Per 2026-05-27\n   root-cause fix: src/globals.css 已 import for DS internal, 但 consumer-facing\n   tokens.css aggregator 必須也包含, 不然 consumer 拿不到 → 跑版。 */\n'
    extrasBlock += extras
      .map((f) => `@import './../${relative(DS_SRC, f)}';`)
      .join('\n')
  }

  // Base layer(body typography + reset + focus + button cursor)— 必在所有 token 之後 import
  // (依賴 --font-sans / --canvas / --foreground 等)。Consumer 經單一 `@import tokens` 即拿到 base,
  // 符 single-import 原則(2026-05-29 fix:base.css orphan + consumer 字體 drift root cause)。SSOT: styles/base.css。
  const baseBlock =
    '\n\n/* Base layer — body typography(font-family var(--font-sans))+ reset + focus + button cursor。\n' +
    '   必在 token 之後(依賴 token vars)。Consumer `@import tokens` 一次拿到。SSOT: styles/base.css。 */\n' +
    "@import './base.css';"

  return header + imports + extrasBlock + baseBlock + '\n'
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/**
 * 對照組:同一個比對(產生器輸出 === 提交的檔)在記憶體裡造漂移,各自必紅;現況與「新檔被元件程式匯入」必綠。
 * 注入沒改到東西(例:tabs.css 那行已不在、agent-panel.css 不再被匯入)= 對照組本身過期 → INSTRUMENT-FAIL,不當通過。
 */
function selftest() {
  if (!existsSync(OUTPUT_FILE)) { console.error('✗ INSTRUMENT-FAIL 提交的彙總檔不存在'); return false }
  const committed = readFileSync(OUTPUT_FILE, 'utf8')
  const candidates = defaultExtraCandidates()
  const codeImported = findCodeImportedCss()
  const AGENT = join(COMPONENTS_DIR, 'AgentPanel/agent-panel.css')
  const FIXTURE = join(COMPONENTS_DIR, 'FixtureNew/fixture-new.css')
  const TABS_LINE = "@import './../components/Tabs/tabs.css';\n"
  const pre = [
    [committed.includes(TABS_LINE), `提交的檔裡找不到「${TABS_LINE.trim()}」`],
    [candidates.includes(AGENT) && codeImported.has(AGENT), 'agent-panel.css 不再是「宣告 :root / @keyframes 且被元件程式匯入」的檔'],
  ]
  for (const [ok, why] of pre) if (!ok) { console.error(`✗ INSTRUMENT-FAIL 對照組的注入點過期:${why}(先修對照組)`); return false }
  const cases = [
    ['現況:產生器輸出 = 提交的檔', generate({ extraCandidates: candidates, codeImported }), committed, true],
    ['提交的檔被手刪一行(tabs.css)', generate({ extraCandidates: candidates, codeImported }), committed.replace(TABS_LINE, ''), false],
    ['agent-panel.css 假裝沒被元件程式匯入 → 產生器會收它、提交的檔沒有', generate({ extraCandidates: candidates, codeImported: new Set([...codeImported].filter((f) => f !== AGENT)) }), committed, false],
    ['新的元件樣式檔宣告 :root、沒被元件程式匯入、也沒重跑產生器', generate({ extraCandidates: [...candidates, FIXTURE], codeImported }), committed, false],
    ['同一個新檔被元件程式匯入 → 不進彙總檔', generate({ extraCandidates: [...candidates, FIXTURE], codeImported: new Set([...codeImported, FIXTURE]) }), committed, true],
  ]
  let ok = true
  for (const [label, generated, existing, expectInSync] of cases) {
    const inSync = generated === existing
    const pass = inSync === expectInSync
    if (!pass) ok = false
    console.log(`${pass ? '✓' : '✗'} ${expectInSync ? '該綠' : '該紅'}:${label}(實得${inSync ? '一致' : ' DRIFT'})`)
  }
  console.log(ok ? '✓ 對照組:漂移各自會紅、一致時綠(儀器有效)' : '✗ 對照組有一條沒照預期 —— 儀器無效')
  return ok
}

function main() {
  if (SELFTEST_MODE) process.exit(selftest() ? 0 : 1)
  const generated = generate()

  if (CHECK_MODE) {
    if (!existsSync(OUTPUT_FILE)) {
      console.error('❌ DRIFT: ' + relative(REPO_ROOT, OUTPUT_FILE) + ' does not exist.')
      console.error('   Run: node scripts/gen-figma-make-artifacts.mjs')
      process.exit(1)
    }
    const existing = readFileSync(OUTPUT_FILE, 'utf8')
    if (existing !== generated) {
      console.error('❌ DRIFT: ' + relative(REPO_ROOT, OUTPUT_FILE) + ' is out of sync with tokens/.')
      console.error('   Run: node scripts/gen-figma-make-artifacts.mjs')
      console.error('   Then commit the updated file.')
      process.exit(1)
    }
    console.log('✅ ' + relative(REPO_ROOT, OUTPUT_FILE) + ' is in sync with tokens/.')
    return
  }

  ensureDir(OUTPUT_DIR)
  writeFileSync(OUTPUT_FILE, generated)
  console.log('✅ Generated ' + relative(REPO_ROOT, OUTPUT_FILE))
  console.log('   Source: ' + relative(REPO_ROOT, TOKENS_DIR) + '/**/*.css')
  console.log('   Imports: ' + generated.split('\n').filter((l) => l.startsWith('@import')).length + ' token files')
}

main()
