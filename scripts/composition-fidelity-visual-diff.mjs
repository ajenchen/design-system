#!/usr/bin/env node
/**
 * composition-fidelity-visual-diff.mjs
 *
 * Mechanical mechanism for「DS canonical render 跟 consumer (product-workspace) render 必 visual-identical」
 * Per user 2026-05-27 directive「mechanical 機制讓未來所有 DS components 在 product-workspace 渲染必跟 DS canonical 一致 可被驗證(byte-identity 不夠,visual diff)」
 *
 * Mapping SSOT:consumer story file 的 `// @story-baseline: <DS-story-id>` marker
 *
 * Usage:
 *   node scripts/composition-fidelity-visual-diff.mjs \
 *     --ds-static=packages/design-system/storybook-static \
 *     --consumer-static=/path/to/product-workspace/storybook-static \
 *     --out=.claude/snapshots/composition-fidelity \
 *     --threshold-pct=0.5
 *
 * Or against live servers:
 *   --ds-url=http://localhost:9001 --consumer-url=http://localhost:9002
 *
 * Exit codes:
 *   0 — all diffs within threshold
 *   1 — at least one diff exceeds threshold
 *   2 — setup error (missing tool / story / baseline marker)
 */
import { chromium } from 'playwright'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import http from 'node:http'
import { mkdirSync, existsSync, readFileSync, statSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)]
}))

// v2 (2026-05-27 M31 synthesis Step 5):G1-G5 fixes + 2 enhancements
// G1 hardcoded id → parse storybook-static/index.json 動態 derive
// G2 no CI gate → consumed by .github/workflows/composition-fidelity.yml
// G3 only scan App.tsx → glob *.stories.tsx + *.tsx for @story-baseline
// G4 0.5% pixel threshold too lax → per-mapping @composition-fidelity-threshold: override
// G5 no viewport/theme/density normalize → force common before screenshot
const THRESHOLD_PCT = Number(args['threshold-pct'] ?? 0.5)
const OUT = args.out || join(ROOT, '.claude/snapshots/composition-fidelity')
const CONSUMER_ROOT = args['consumer-root'] || '/tmp/product-workspace'
const VIEWPORT_W = Number(args['viewport-w'] ?? 1280)
const VIEWPORT_H = Number(args['viewport-h'] ?? 720)
const FORCE_THEME = args['force-theme'] ?? 'light'
const FORCE_DENSITY = args['force-density'] ?? 'md'

mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'baseline'), { recursive: true })
mkdirSync(join(OUT, 'consumer'), { recursive: true })
mkdirSync(join(OUT, 'diff'), { recursive: true })

// ── 1. Walk consumer source tree for @story-baseline markers ──
// G3 fix: glob *.stories.tsx + *.tsx + App.tsx (per-line, not just first match)
function walkSources(dir, exts = new Set(['.tsx', '.ts'])) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === 'storybook-static') continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...walkSources(full, exts))
    } else if (st.isFile() && exts.has(extname(entry))) {
      out.push(full)
    }
  }
  return out
}

// G1 fix: parse storybook-static/index.json to find real consumer story id
function loadStorybookIndex(staticDir) {
  if (!staticDir) return null
  const candidates = ['index.json', 'stories.json']
  for (const fn of candidates) {
    const p = join(staticDir, fn)
    if (existsSync(p)) {
      try { return JSON.parse(readFileSync(p, 'utf-8')) } catch {}
    }
  }
  return null
}

function findStoryIdByTitleExport(index, titlePattern, exportName) {
  if (!index || !index.entries) return null
  for (const [id, entry] of Object.entries(index.entries)) {
    const titleMatch = titlePattern instanceof RegExp ? titlePattern.test(entry.title || '') : (entry.title || '').includes(titlePattern)
    const nameMatch = entry.name === exportName || (entry.importPath || '').includes(exportName)
    if (titleMatch && (nameMatch || entry.id?.endsWith(`--${exportName.toLowerCase()}`))) return id
  }
  return null
}

const consumerStaticArg = args['consumer-static']
const consumerIndex = loadStorybookIndex(consumerStaticArg)
const dsStaticArg = args['ds-static'] || join(ROOT, 'storybook-static')
const dsIndex = loadStorybookIndex(dsStaticArg)

const mapping = []
const sources = walkSources(CONSUMER_ROOT)
for (const file of sources) {
  const src = readFileSync(file, 'utf-8')
  // G3 + G4: support multiple markers per file + per-mapping threshold override
  const lines = src.split(/\n/)
  let currentThreshold = THRESHOLD_PCT
  let currentMode = 'pixel'        // v3 2026-05-27: 'pixel' | 'shell-only' | 'structural'
  let currentMaskSelector = null    // CSS selector to mask inner content (replace pixels w/ solid color before diff)
  for (let i = 0; i < lines.length; i++) {
    const tm = lines[i].match(/@composition-fidelity-threshold:\s*([\d.]+)/)
    if (tm) currentThreshold = Number(tm[1])
    const mm = lines[i].match(/@composition-fidelity-mode:\s*(pixel|shell-only|structural)/)
    if (mm) currentMode = mm[1]
    const ms = lines[i].match(/@composition-fidelity-mask:\s*(.+)/)
    if (ms) currentMaskSelector = ms[1].trim()
    const bm = lines[i].match(/@story-baseline:\s*([^\n\r]+)/)
    if (!bm) continue
    const baselineRef = bm[1].trim()
    // baselineRef formats accepted:
    //   @qijenchen/design-system/components/Sidebar/sidebar.stories.tsx#IconCollapse
    //   @qijenchen/design-system/components/Button/button.stories.tsx#Default
    //   @qijenchen/design-system/patterns/header-canonical/...
    const pathMatch = baselineRef.match(/(components|patterns|tokens)\/([A-Za-z][a-zA-Z0-9-]+)\/[^#]+#(\w+)/)
    if (!pathMatch) continue
    const tier = pathMatch[1]  // components / patterns / tokens
    const componentLower = pathMatch[2].toLowerCase().replace(/-/g, '')
    const exportName = pathMatch[3]
    // Convert PascalCase to kebab
    const variant = exportName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')
    const tierMap = { components: 'components', patterns: 'patterns', tokens: 'tokens' }
    const titleTier = tierMap[tier] || 'components'
    // Try DS index lookup first, fall back to derived id
    let baselineStoryId = `design-system-${titleTier}-${componentLower}-展示--${variant}`
    if (dsIndex) {
      const found = findStoryIdByTitleExport(dsIndex, new RegExp(`Design System/${titleTier}/`, 'i'), exportName)
      if (found) baselineStoryId = found
    }
    // Consumer story id — derive from consumer file path relative to consumer-root
    const rel = relative(CONSUMER_ROOT, file).replace(/\\/g, '/')
    // apps/template/src/App.tsx → apps-template-appshell-dashboard--default (if App.tsx)
    // apps/template/src/*.stories.tsx → use storybook index lookup
    let consumerStoryId = null
    if (consumerIndex) {
      // Try to find by importPath relative match
      for (const [id, entry] of Object.entries(consumerIndex.entries || {})) {
        if ((entry.importPath || '').endsWith(rel.replace(/^apps\//, ''))) {
          consumerStoryId = id
          break
        }
      }
    }
    if (!consumerStoryId) {
      // Fallback: derive from file path
      if (rel.endsWith('App.tsx')) {
        consumerStoryId = 'apps-template-appshell-dashboard--default'
      } else {
        consumerStoryId = rel.replace(/\.(stories\.)?tsx?$/, '').replace(/\//g, '-').toLowerCase() + '--default'
      }
    }
    mapping.push({
      baselineRef, baselineStoryId, consumerStoryId, sourceFile: file,
      threshold: currentThreshold, sourceLine: i + 1,
      mode: currentMode, maskSelector: currentMaskSelector,
    })
  }
}

if (mapping.length === 0) {
  console.error('❌ No @story-baseline markers found in consumer source.')
  console.error(`   Searched root: ${CONSUMER_ROOT}`)
  process.exit(2)
}

console.log(`Found ${mapping.length} @story-baseline mapping(s):`)
mapping.forEach(m => console.log(`  - ${m.consumerStoryId} → ${m.baselineStoryId}`))

// ── 2. Spin up static file servers if needed ──
function staticServer(dir, port) {
  const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' }
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0])
    if (p === '/') p = '/index.html'
    const fp = join(dir, p)
    if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' })
    res.end(readFileSync(fp))
  })
  return new Promise(resolve => server.listen(port, () => resolve(server)))
}

let dsUrl = args['ds-url']
let consumerUrl = args['consumer-url']
let dsServer, consumerServer
if (!dsUrl) {
  const dsStatic = args['ds-static'] || join(ROOT, 'storybook-static')
  if (!existsSync(dsStatic)) {
    console.error(`❌ DS static dir not found: ${dsStatic}`)
    process.exit(2)
  }
  dsServer = await staticServer(dsStatic, 8801)
  dsUrl = 'http://localhost:8801'
}
if (!consumerUrl) {
  const consumerStatic = args['consumer-static']
  if (!consumerStatic || !existsSync(consumerStatic)) {
    console.error(`❌ Consumer static dir not found: ${consumerStatic}`)
    process.exit(2)
  }
  consumerServer = await staticServer(consumerStatic, 8802)
  consumerUrl = 'http://localhost:8802'
}

// ── 3. Screenshot + diff per mapping ──
const browser = await chromium.launch({ headless: true })
const results = []
let failCount = 0

// G5 fix: viewport / theme / density normalization helper
async function normalizePage(page) {
  // Force light theme + md density via Storybook globalTypes URL params
  // Also set localStorage for theme stickiness
  await page.addInitScript(({ theme, density }) => {
    try {
      window.localStorage.setItem('ds-theme', theme)
      document.documentElement.setAttribute('data-theme', theme)
      document.documentElement.setAttribute('data-density', density)
    } catch {}
  }, { theme: FORCE_THEME, density: FORCE_DENSITY })
}

// Sanitize filename — story ids may contain unsafe chars
function safeName(s) { return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180) }

for (const m of mapping) {
  const page = await browser.newPage({ viewport: { width: VIEWPORT_W, height: VIEWPORT_H }, deviceScaleFactor: 1 })
  await normalizePage(page)
  const fileSafe = safeName(`${m.consumerStoryId}__vs__${m.baselineStoryId}`)
  let baselineBuf, consumerBuf
  // v3 mode-aware mask helper:overlay solid div over `<main>` (or custom selector) before screenshot
  // so inner page content (intentional differences) doesn't dominate pixel diff.
  // mode = 'shell-only' or maskSelector set → mask; default 'pixel' → no mask.
  async function snapshot(p) {
    if (m.mode === 'shell-only' || (m.maskSelector && m.maskSelector.length)) {
      const sel = m.maskSelector || 'main, [data-mask="content"]'
      await p.evaluate((s) => {
        document.querySelectorAll(s).forEach(el => {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return
          const mask = document.createElement('div')
          mask.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;background:#fff;z-index:99999;pointer-events:none;`
          mask.setAttribute('data-fidelity-mask', '1')
          document.body.appendChild(mask)
        })
      }, sel)
      await p.waitForTimeout(100)
    }
    return await p.screenshot({ fullPage: false })
  }
  try {
    await page.goto(`${dsUrl}/iframe.html?id=${encodeURIComponent(m.baselineStoryId)}&viewMode=story&globals=theme:${FORCE_THEME};density:${FORCE_DENSITY}`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    await page.waitForTimeout(800)
    baselineBuf = await snapshot(page)
    writeFileSync(join(OUT, 'baseline', `${fileSafe}.png`), baselineBuf)

    await page.goto(`${consumerUrl}/iframe.html?id=${encodeURIComponent(m.consumerStoryId)}&viewMode=story&globals=theme:${FORCE_THEME};density:${FORCE_DENSITY}`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    await page.waitForTimeout(800)
    consumerBuf = await snapshot(page)
    writeFileSync(join(OUT, 'consumer', `${fileSafe}.png`), consumerBuf)
  } catch (e) {
    results.push({ ...m, status: 'TIMEOUT', error: e.message.slice(0, 200) })
    failCount++
    await page.close()
    continue
  }
  await page.close()

  // Pixel diff
  const png1 = PNG.sync.read(baselineBuf)
  const png2 = PNG.sync.read(consumerBuf)
  const { width, height } = png1
  if (png2.width !== width || png2.height !== height) {
    results.push({ ...m, status: 'SIZE_MISMATCH', baselineSize: `${width}x${height}`, consumerSize: `${png2.width}x${png2.height}` })
    failCount++
    console.log(`✗ ${m.consumerStoryId} ← ${m.baselineStoryId}  SIZE_MISMATCH ${width}x${height} vs ${png2.width}x${png2.height}`)
    continue
  }
  const diff = new PNG({ width, height })
  // G4 fix: per-mapping threshold + perceptual threshold for typography regions
  const pmThreshold = m.perceptual ? 0.2 : 0.1  // 0.2 = more lenient for anti-aliased text
  const diffPx = pixelmatch(png1.data, png2.data, diff.data, width, height, { threshold: pmThreshold, includeAA: false })
  writeFileSync(join(OUT, 'diff', `${fileSafe}.png`), PNG.sync.write(diff))

  const totalPx = width * height
  const diffPct = (diffPx / totalPx) * 100
  const effectiveThreshold = m.threshold ?? THRESHOLD_PCT
  const passed = diffPct <= effectiveThreshold
  results.push({ ...m, status: passed ? 'PASS' : 'FAIL', diffPx, totalPx, diffPct: diffPct.toFixed(4), threshold: effectiveThreshold })
  if (!passed) failCount++
  console.log(`${passed ? '✓' : '✗'} ${m.consumerStoryId} ← ${m.baselineStoryId}  diff=${diffPct.toFixed(4)}% (${diffPx}/${totalPx} px,threshold=${effectiveThreshold}%)${passed ? '' : '  FAIL'}`)
}

await browser.close()
dsServer?.close()
consumerServer?.close()

const report = { generatedAt: new Date().toISOString(), threshold: THRESHOLD_PCT, mapping, results, summary: { total: results.length, fail: failCount, pass: results.length - failCount } }
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))

console.log('\n=== Composition fidelity report ===')
console.log(JSON.stringify(report.summary, null, 2))
console.log(`Full report: ${join(OUT, 'report.json')}`)

process.exit(failCount === 0 ? 0 : 1)
