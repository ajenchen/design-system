#!/usr/bin/env node
// Header tabsSlot W2 invariants test — 守 header-canonical.spec.md Rule W1/W2 的 render-level 契約
// (契約實體 = chrome-header.tsx HEADER_TABS_SLOT_WRAPPER_CLASS `[&_[data-slot=tabs-list]]:px-[...]`
//  + tabs.tsx 三種 overflow 模式 tablist 自標 data-slot="tabs-list"):
//   (W2-a) tablist computed paddingLeft/paddingRight === 解析後 var(--layout-space-loose)
//   (W2-b) 解析後 --layout-space-loose === '16px'(md 預設 density;把「token 鏈斷」跟
//          「density 環境漂移」分開報錯)
//   (W2-c) 第一個 [role=tab] rect.left − header rect.left === 16 ± 0.5px(M32 pixel-quantified:
//          視覺意圖 = triggers 對齊 header content row,與實作 selector 機制無關)
//   (W1)   border 全寬一條線:none 模式 tablist rect.width === header 寬;scroll 模式量 scroll
//          container(tablist 是 min-w-full 可比容器寬,量錯對象 false-fail);menu 模式量
//          scroll container 的 flex row(scroll 區 + ⌄ navigator 容器共同鋪滿 header 寬,
//          兩者各自 border-b 連成全寬一條線;⌄ 未觸發時 row == scroll container 退化同 scroll)
//
// 病根(2026-07-30 F1):beta.86 inlineAction overlay 包 `<div class="relative">` 把 v3
// direct-child selector `[&>[role=tablist]]` 斷鏈 → px-loose 靜默消失(computed 0px),
// source-level gate(layout-space-utility-invariant)抓不到 render 值 → 本 gate 補 render-level 防線。
// 改 HEADER_TABS_SLOT_WRAPPER_CLASS / TabsList overflow DOM 必跑此 script,fail → exit 1 阻 commit。
// Run: `npm run test:header-tabs-slot-invariants` 或 `node scripts/header-tabs-slot-invariants.mjs`

import { launchVerifyBrowser, serveStaticDir, attachStaticRoute } from './lib/sandboxed-verify-browser.mjs'
import { resolveProvisionedPlaywrightRuntime } from '../infra/governance/lib/playwright-runtime.mjs'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')

const runtime = resolveProvisionedPlaywrightRuntime({ repoRoot: ROOT, environment: process.env })
if (!runtime) throw new Error('[header-tabs-slot] exact Playwright Chromium runtime missing; run `npm run setup:playwright`')
process.env.PLAYWRIGHT_BROWSERS_PATH = runtime.environmentValue
const { chromium } = await import('playwright')

if (!existsSync(STATIC)) {
  console.error('✗ storybook-static missing. Run `npm run build-storybook` first.')
  process.exit(1)
}

// ── Stale-build guard(idiom = storybook-smoke-test.mjs 2026-07-05 自抓包 codify)──────────
// 本 script 驗的是 storybook-static/ 靜態 build — 若 build 早於 src 最新改動,整輪量測 =
// 驗舊碼的假綠燈。Guard:storybook-static/iframe.html mtime 必 >= src 最新 tsx/ts/css mtime,
// 否則 fail-loud(fail-closed)。純 Node 實作零 shell。
{
  const { readdirSync: rd, statSync: st } = await import('node:fs')
  const staticMtime = st(join(STATIC, 'iframe.html')).mtimeMs
  const stale = []
  const walk = (dir) => {
    for (const e of rd(dir, { withFileTypes: true })) {
      if (stale.length >= 5) return
      const p = join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(p) }
      else if (/\.(tsx|ts|css)$/.test(e.name) && st(p).mtimeMs > staticMtime) stale.push(p)
    }
  }
  for (const root of [join(ROOT, 'packages/design-system/src'), join(ROOT, 'src')]) {
    if (existsSync(root)) walk(root)
  }
  if (stale.length) {
    console.error('✗ storybook-static/ 比 src 舊(stale build = 假綠燈)。先跑 `npm run build-storybook` 再量測。')
    console.error('  比 build 新的檔案(前 5):')
    for (const p of stale) console.error('  ' + p.replace(ROOT + '/', ''))
    console.error(`  build mtime: ${new Date(staticMtime).toISOString()}`)
    process.exit(1)
  }
}

// Transport + launch 皆消費 scripts/lib/sandboxed-verify-browser.mjs(M17 單一住所):
// primary = inline http server + 預設 multiprocess chromium(CI / user machine 路徑);
// 受限環境自動降級為 route interception / --single-process,並印出實際走的路徑(無靜默降級)。
const served = await serveStaticDir(STATIC, { port: 7501 })
const { browser, mode: launchMode } = await launchVerifyBrowser(chromium)
console.log(`ℹ transport=${served.transport} launch=${launchMode}`)
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await attachStaticRoute(page, served)

const failures = []
const passes = []

function record(invariant, label, pass, detail = '') {
  if (pass) passes.push(`✓ ${invariant} | ${label}`)
  else failures.push(`✗ ${invariant} | ${label} | ${detail}`)
}

// 3 個 tabsSlot × overflow story(story ID = export name;改 export 名 = 此處同步改,
// story 載入失敗 → record fail,禁 silent skip 假綠)
const STORIES = [
  { id: 'design-system-patterns-header-anatomy--with-tabs', mode: 'none', label: 'tabsSlot×none' },
  { id: 'design-system-patterns-header-anatomy--with-tabs-overflow-scroll', mode: 'scroll', label: 'tabsSlot×scroll' },
  { id: 'design-system-patterns-header-anatomy--with-tabs-overflow-menu', mode: 'menu', label: 'tabsSlot×menu' },
]

const fmt = (v) => (v == null ? 'null' : typeof v === 'number' ? v.toFixed(2) : String(v))

for (const story of STORIES) {
  await page.goto(`http://localhost:7501/iframe.html?id=${story.id}&viewMode=story`, { waitUntil: 'networkidle' })
  try {
    await page.waitForSelector('[data-slot="tabs-list"]', { timeout: 15000 })
  } catch {
    record('LOAD', `${story.label} story 載入(${story.id})`, false, 'tablist([data-slot=tabs-list])未出現 — story 缺失/改名/render 失敗,禁 silent skip')
    continue
  }
  await page.waitForTimeout(400)

  const d = await page.evaluate(() => {
    const header = document.querySelector('header')
    const tl = document.querySelector('[data-slot="tabs-list"]')
    if (!header || !tl) return { error: 'header 或 [data-slot=tabs-list] 不存在' }
    const cs = getComputedStyle(tl)
    const hr = header.getBoundingClientRect()
    const tr = tl.getBoundingClientRect()
    const firstTab = tl.querySelector('[role="tab"]')
    // scroll container = tablist 直接 parent 且 overflow-x auto/scroll(scroll/menu 模式才有)
    const parent = tl.parentElement
    const pOverflowX = parent ? getComputedStyle(parent).overflowX : null
    const sc = pOverflowX === 'auto' || pOverflowX === 'scroll' ? parent : null
    const scr = sc ? sc.getBoundingClientRect() : null
    const rowr = sc?.parentElement ? sc.parentElement.getBoundingClientRect() : null
    return {
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      resolvedLoose: cs.getPropertyValue('--layout-space-loose').trim(),
      headerLeft: hr.left, headerWidth: hr.width,
      tablistWidth: tr.width,
      firstTabLeft: firstTab ? firstTab.getBoundingClientRect().left : null,
      hasScrollContainer: !!sc,
      scLeft: scr ? scr.left : null, scWidth: scr ? scr.width : null,
      rowWidth: rowr ? rowr.width : null,
    }
  })
  if (d.error) {
    record('LOAD', `${story.label} story 量測(${story.id})`, false, d.error)
    continue
  }

  // (W2-a) computed padding = 解析後 token(token 鏈通不通)
  record('W2-a', `${story.label} tablist paddingLeft = resolved var(--layout-space-loose)`,
    d.paddingLeft === d.resolvedLoose && d.paddingLeft !== '',
    `paddingLeft ${fmt(d.paddingLeft)} vs resolved '${fmt(d.resolvedLoose)}'(0px/不等 = wrapper 契約斷鏈)`)
  record('W2-a', `${story.label} tablist paddingRight = resolved var(--layout-space-loose)`,
    d.paddingRight === d.resolvedLoose && d.paddingRight !== '',
    `paddingRight ${fmt(d.paddingRight)} vs resolved '${fmt(d.resolvedLoose)}'`)

  // (W2-b) 解析值 = md 預設 16px(density 環境漂移獨立報錯)
  record('W2-b', `${story.label} resolved --layout-space-loose === '16px'(md 預設)`,
    d.resolvedLoose === '16px', `got '${fmt(d.resolvedLoose)}'(density 漂移或 token 改值)`)

  // (W2-c) M32 pixel-quantified:第一個 tab 左緣 − header 左緣 = 16 ± 0.5
  record('W2-c', `${story.label} 第一個 tab 左緣 − header 左緣 = 16±0.5px`,
    d.firstTabLeft !== null && Math.abs(d.firstTabLeft - d.headerLeft - 16) <= 0.5,
    `delta ${d.firstTabLeft === null ? 'no [role=tab]' : fmt(d.firstTabLeft - d.headerLeft)}(應 16;0 = px-loose 靜默消失)`)

  // (W1) 全寬契約 — 量測對象依 overflow 模式(tablist scroll/menu 是 min-w-full 可比容器寬):
  if (story.mode === 'none') {
    record('W1', `${story.label} 結構:none 模式無 scroll container`, !d.hasScrollContainer,
      'tablist parent 是 overflow-x 容器 — story 疑似 render 錯 overflow 模式')
    record('W1', `${story.label} tablist 全寬 = header 寬 ±0.5`,
      Math.abs(d.tablistWidth - d.headerWidth) <= 0.5,
      `tablist ${fmt(d.tablistWidth)} vs header ${fmt(d.headerWidth)}(w-full 注入斷 = border 沒鋪滿)`)
  } else {
    record('W1', `${story.label} 結構:${story.mode} 模式有 scroll container`, d.hasScrollContainer,
      'tablist parent 非 overflow-x 容器 — story 疑似 render 錯 overflow 模式,禁 silent skip')
    if (story.mode === 'scroll') {
      record('W1', `${story.label} scroll container 全寬 = header 寬 ±0.5`,
        d.scWidth !== null && Math.abs(d.scWidth - d.headerWidth) <= 0.5,
        `container ${fmt(d.scWidth)} vs header ${fmt(d.headerWidth)}(arrows 是 absolute overlay 不佔寬)`)
    } else {
      // menu:⌄ navigator 觸發時 scroll container 讓出右側寬度給按鈕容器,兩者的 flex row
      // 才是「border 連成全寬一條線」的量測對象;未觸發時 row == scroll container(退化同 scroll)。
      record('W1', `${story.label} scroll row(捲動區 + ⌄ 容器)全寬 = header 寬 ±0.5`,
        d.rowWidth !== null && Math.abs(d.rowWidth - d.headerWidth) <= 0.5,
        `row ${fmt(d.rowWidth)} vs header ${fmt(d.headerWidth)}`)
      record('W1', `${story.label} scroll container 左緣貼齊 header 左緣 ±0.5`,
        d.scLeft !== null && Math.abs(d.scLeft - d.headerLeft) <= 0.5,
        `container.left ${fmt(d.scLeft)} vs header.left ${fmt(d.headerLeft)}`)
    }
  }
}

// ── Output ──
console.log(`\n=== Header tabsSlot W2 Invariants Test ===`)
console.log(`PASS: ${passes.length}`)
console.log(`FAIL: ${failures.length}\n`)
if (passes.length > 0) console.log(passes.join('\n'))
if (failures.length > 0) {
  console.log('\n--- FAILURES ---')
  console.log(failures.join('\n'))
}

await browser.close()
await served.close()

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} invariant(s) failed. Block commit.`)
  process.exit(1)
}
console.log(`\n✓ All ${passes.length} invariants pass.`)
process.exit(0)
