#!/usr/bin/env node
/**
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
 *   • CI guard: `--check` mode runs in release.yml audit gates + ci.yml
 *   • Drift detection: regenerate to memory, diff with committed file, exit 1 if differ
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
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const DS_SRC = join(REPO_ROOT, 'packages/design-system/src')
const TOKENS_DIR = join(DS_SRC, 'tokens')
const PATTERNS_DIR = join(DS_SRC, 'patterns')
const COMPONENTS_DIR = join(DS_SRC, 'components')
const OUTPUT_DIR = join(DS_SRC, 'styles')
const OUTPUT_FILE = join(OUTPUT_DIR, 'tokens.css')

const CHECK_MODE = process.argv.includes('--check')

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
    return catA.localeCompare(catB)
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

function generate() {
  const files = sortCanonical(findTokenCssFiles(TOKENS_DIR))

  // Within color/, primitives.css must come before semantic.css
  // (semantic uses primitive var() references).
  const ordered = []
  for (const cat of [...new Set(files.map((f) => relative(TOKENS_DIR, f).split('/')[0]))]) {
    const catFiles = files.filter((f) => relative(TOKENS_DIR, f).startsWith(cat + '/'))
    catFiles.sort((a, b) => {
      const isPrimA = a.endsWith('primitives.css') ? -1 : 0
      const isPrimB = b.endsWith('primitives.css') ? -1 : 0
      return isPrimA - isPrimB || a.localeCompare(b)
    })
    ordered.push(...catFiles)
  }

  // Scan patterns/ + components/ for CSS containing token/runtime declarations
  const extras = [
    ...findExtraCssFiles(PATTERNS_DIR),
    ...findExtraCssFiles(COMPONENTS_DIR),
  ].sort((a, b) => relative(DS_SRC, a).localeCompare(relative(DS_SRC, b)))

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
  // `@import tokens` 一次拿到。SSOT = motion.css 動畫 token → overlay-motion 共用類綁 --tw-* 變數。
  const twAnimateBlock = '/* Overlay 進出場動畫 utilities(tw-animate-css;7 浮層消費)*/\n@import "tw-animate-css";\n\n'
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

function main() {
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
