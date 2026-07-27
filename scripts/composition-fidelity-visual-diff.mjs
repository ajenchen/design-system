#!/usr/bin/env node
/**
 * composition-fidelity-visual-diff.mjs
 *
 * Composition fidelity(2026-05-27 初版 / 2026-06-02 conformance-model 修正,SSOT: packages/design-system/ds-canonical/references/composition-fidelity.md)
 * Consumer 對 DS 用法正確性「主要由靜態 conformance 驗」(對齊 Polaris/Atlassian/Carbon lint);本 script 的 pixel/DOM
 * identity diff 是「明確 opt-in」(只比標 @composition-fidelity-mode 的 mapping,用於忠實複製 replica / same-story 回歸)。
 * 單獨 @story-baseline = conformance 意圖,不做 identity diff。禁拿產品範本(內容刻意不同)pixel 比 DS showcase(反 pattern)。
 *
 * Mapping SSOT:consumer story file 的 `// @story-baseline: <DS-story-id>` marker
 *
 * Usage:
 *   node scripts/composition-fidelity-visual-diff.mjs \
 *     --ds-static=packages/design-system/storybook-static \
 *     --consumer-static=/path/to/product-workspace/storybook-static \
 *     --out=visual/composition-fidelity-custom \
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
import { existsSync, readFileSync, statSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ensureRuntimeEvidenceDirectory,
  ensureRuntimeEvidenceRoot,
  prepareRuntimeEvidenceFile,
} from './lib/governance-runtime-evidence.mjs'

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
// Runtime screenshots/reports are mutable evidence, never provider discovery state.
// A custom --out remains supported only when it stays below the Git-owned evidence root.
const OUT = args.out
  ? ensureRuntimeEvidenceRoot({ repoRoot: ROOT, explicitRoot: args.out })
  : ensureRuntimeEvidenceDirectory({ repoRoot: ROOT, relativePath: 'visual/composition-fidelity' })
const CONSUMER_ROOT = args['consumer-root'] || '/tmp/product-workspace'
const VIEWPORT_W = Number(args['viewport-w'] ?? 1280)
const VIEWPORT_H = Number(args['viewport-h'] ?? 720)
const FORCE_THEME = args['force-theme'] ?? 'light'
const FORCE_DENSITY = args['force-density'] ?? 'md'

for (const relativePath of ['baseline', 'consumer', 'diff']) {
  ensureRuntimeEvidenceDirectory({ repoRoot: ROOT, explicitRoot: OUT, relativePath })
}
const evidenceFile = (relativePath) => prepareRuntimeEvidenceFile({ repoRoot: ROOT, explicitRoot: OUT, relativePath })

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
const invalidMappingMarkers = []
let modeMarkerCount = 0
const sources = walkSources(CONSUMER_ROOT)
for (const file of sources) {
  const src = readFileSync(file, 'utf-8')
  // G3 + G4: support multiple markers per file + per-mapping threshold override
  const lines = src.split(/\n/)
  let currentThreshold = THRESHOLD_PCT
  let currentMode = null           // 2026-06-02: null = conformance-only(不做 identity diff);標 'pixel'|'shell-only'|'structural' = 明確 opt-in identity 比對
  let currentMaskSelector = null    // CSS selector to mask inner content (replace pixels w/ solid color before diff)
  for (let i = 0; i < lines.length; i++) {
    const tm = lines[i].match(/@composition-fidelity-threshold:\s*([\d.]+)/)
    if (tm) currentThreshold = Number(tm[1])
    const mm = lines[i].match(/@composition-fidelity-mode:\s*(pixel|shell-only|structural)/)
    if (mm) { currentMode = mm[1]; modeMarkerCount += 1 }
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
    if (!pathMatch) {
      if (currentMode !== null) invalidMappingMarkers.push(`${relative(CONSUMER_ROOT, file)}:${i + 1}: invalid @story-baseline ${baselineRef}`)
      continue
    }
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

// ── 2026-06-02 conformance-model shift ──
// Per CF research(world-class benchmark:Polaris/Atlassian/Carbon 全用 static lint 驗 consumer 用法,
// 無一家用「product demo 截圖 == DS showcase 截圖」pixel-identity = 公認反 pattern)+ 專案自身
// 2026-05-27 結論(memory feedback_ai_ground_truth_unreliable_mechanical_primary:render fidelity 由架構
// 保障、template-vs-canonical pixel diff = noise 非 drift = false positive)。
// → @story-baseline 單獨 = conformance 意圖(交靜態 hook 驗:check_consumer_ds_primitive_misuse /
//   check_layout_space_magic_numbers / check_consumer_story_baseline / check_story_invariants R7/R8)。
// → pixel/DOM identity 比對改「明確 opt-in」:只有額外標 @composition-fidelity-mode 的 mapping 才比
//   (用於忠實複製 replica / same-story 跨版本回歸)。對內容刻意不同的 template 不再 false-positive。
const conformanceOnly = mapping.filter((m) => m.mode === null)
const identityMappings = mapping.filter((m) => m.mode !== null)
const requireMappings = args['require-mappings'] === true || args['require-mappings'] === 'true'

if (requireMappings && invalidMappingMarkers.length) {
  console.error('❌ Invalid composition-fidelity mapping marker(s):')
  invalidMappingMarkers.forEach((item) => console.error(`   - ${item}`))
  process.exit(2)
}
if (requireMappings && (modeMarkerCount === 0 || identityMappings.length === 0)) {
  console.error(`❌ Required composition-fidelity gate is vacuous(mode markers=${modeMarkerCount}, executable mappings=${identityMappings.length}).`)
  process.exit(2)
}

if (conformanceOnly.length) {
  console.log(`ℹ️  ${conformanceOnly.length} 個 @story-baseline = conformance-only(無 @composition-fidelity-mode)→ 由靜態 conformance hook 驗,不做 pixel/DOM identity diff:`)
  conformanceOnly.forEach((m) => console.log(`     - ${m.consumerStoryId} ⊢ ${m.baselineRef}`))
}
if (identityMappings.length === 0) {
  console.log('✅ 0 個 identity-opt-in mapping → skip pixel/DOM identity diff。')
  console.log('   Consumer 對 DS 的用法正確性由靜態 conformance 防線保證(對齊 Polaris/Atlassian/Carbon lint 模型),非 pixel-identity。')
  console.log('   要做 identity 比對請在該 consumer story 加 @composition-fidelity-mode: structural|pixel|shell-only(用於忠實複製 / same-story 回歸)。')
  process.exit(0)
}

console.log(`Found ${identityMappings.length} identity-verify mapping(s)(標 @composition-fidelity-mode):`)
identityMappings.forEach((m) => console.log(`  - ${m.consumerStoryId} → ${m.baselineStoryId} [${m.mode}]`))

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

for (const m of identityMappings) {
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
  // v4 2026-05-27 dual-track: capture DOM signature alongside pixel.
  // Per user verbatim「DOM diff 不能取代 pixel diff,要雙管齊下」+ AI self-audit unreliable rule.
  // DOM diff catches structural drift(class / ARIA / data-* / computed style)pixel cannot see;
  // pixel diff catches visual rendering drift DOM cannot see. Both run, both report,
  // any layer FAIL = overall FAIL. EXPAND not REPLACE(per feedback_ai_self_audit_unreliable_*).
  async function domSignature(p) {
    return await p.evaluate(() => {
      // Capture every element's stable signature: tag + role + class set + data-* + key computed styles
      // Skip our own fidelity-mask overlay divs
      const KEY_COMPUTED = ['display', 'position', 'width', 'height', 'padding', 'margin',
                            'border-width', 'border-radius', 'background-color', 'color',
                            'font-size', 'font-weight', 'line-height', 'gap', 'grid-template-columns']
      function normalizeClass(cls) {
        // Defensive coerce — SVGAnimatedString.className is object not string;use baseVal
        let s = ''
        if (typeof cls === 'string') s = cls
        else if (cls && typeof cls === 'object' && typeof cls.baseVal === 'string') s = cls.baseVal
        // Sort class names so order doesn't matter; strip storybook auto-added
        return s.split(/\s+/).filter(c => c && !c.startsWith('sb-')).sort().join(' ')
      }
      function snapshot(el, depth = 0) {
        if (!el || el.nodeType !== 1) return null
        if (el.getAttribute('data-fidelity-mask') === '1') return null
        const cs = getComputedStyle(el)
        const styles = {}
        for (const k of KEY_COMPUTED) styles[k] = cs.getPropertyValue(k)
        const dataAttrs = {}
        for (const a of el.attributes) if (a.name.startsWith('data-')) dataAttrs[a.name] = a.value
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || null,
          ariaLabel: el.getAttribute('aria-label') || null,
          class: normalizeClass(el.className),
          data: dataAttrs,
          styles,
          children: Array.from(el.children).map(c => snapshot(c, depth + 1)).filter(Boolean),
        }
      }
      // 2026-06-16 root-cause fix(pre-existing ≥12-run DOM_FAIL):從 document.body 起算會把 Storybook
      // 自己的 wrapper chrome(#storybook-root 外層 + decorator div,classless 或 sb- 被 normalizeClass 剝掉)
      // 一起比;DS 自建 storybook 與 consumer npm storybook 的 wrapper 巢狀層數不同 → classless wrapper path
      // collapse 後跨 storybook 錯位 → 串聯出大量假 styleDrift(pixel=0% 完美一致卻 DOM_FAIL)。錨定 story
      // 內容根 #storybook-root(Storybook 7+;fallback #root / body)→ 只比實際 component DOM,排除 chrome。
      const storyRoot = document.querySelector('#storybook-root')
        || document.getElementById('root')
        || document.body
      return snapshot(storyRoot)
    })
  }
  function flattenDom(node, out = [], path = '') {
    if (!node) return out
    const here = `${path}/${node.tag}${node.role ? `[role=${node.role}]` : ''}${node.class ? `.${node.class.replace(/\s+/g, '.')}` : ''}`
    out.push({ path: here, role: node.role, class: node.class, data: node.data, styles: node.styles })
    for (const c of node.children || []) flattenDom(c, out, here)
    return out
  }
  function domDiff(baselineDom, consumerDom) {
    const a = flattenDom(baselineDom)
    const b = flattenDom(consumerDom)
    const pathsA = new Set(a.map(x => x.path))
    const pathsB = new Set(b.map(x => x.path))
    const missingInConsumer = [...pathsA].filter(p => !pathsB.has(p))
    const extraInConsumer = [...pathsB].filter(p => !pathsA.has(p))
    // Style drift on shared paths
    const styleDrifts = []
    const aByPath = Object.fromEntries(a.map(x => [x.path, x]))
    for (const node of b) {
      const ref = aByPath[node.path]
      if (!ref) continue
      for (const k of Object.keys(ref.styles)) {
        if (ref.styles[k] !== node.styles[k]) {
          styleDrifts.push({ path: node.path, prop: k, baseline: ref.styles[k], consumer: node.styles[k] })
        }
      }
    }
    return {
      missing: missingInConsumer.length,
      extra: extraInConsumer.length,
      styleDrifts: styleDrifts.length,
      sample: { missing: missingInConsumer.slice(0, 5), extra: extraInConsumer.slice(0, 5), styles: styleDrifts.slice(0, 10) },
    }
  }
  let baselineDom, consumerDom
  try {
    await page.goto(`${dsUrl}/iframe.html?id=${encodeURIComponent(m.baselineStoryId)}&viewMode=story&globals=theme:${FORCE_THEME};density:${FORCE_DENSITY}`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    await page.waitForTimeout(800)
    baselineDom = await domSignature(page)  // v4 dual-track: capture DOM BEFORE mask injection
    baselineBuf = await snapshot(page)
    writeFileSync(evidenceFile(`baseline/${fileSafe}.png`), baselineBuf)

    await page.goto(`${consumerUrl}/iframe.html?id=${encodeURIComponent(m.consumerStoryId)}&viewMode=story&globals=theme:${FORCE_THEME};density:${FORCE_DENSITY}`, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    await page.waitForTimeout(800)
    consumerDom = await domSignature(page)  // v4 dual-track
    consumerBuf = await snapshot(page)
    writeFileSync(evidenceFile(`consumer/${fileSafe}.png`), consumerBuf)
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
  writeFileSync(evidenceFile(`diff/${fileSafe}.png`), PNG.sync.write(diff))

  const totalPx = width * height
  const diffPct = (diffPx / totalPx) * 100
  const effectiveThreshold = m.threshold ?? THRESHOLD_PCT
  const pixelPassed = diffPct <= effectiveThreshold

  // dual-track: pixel + DOM signature(EXPAND not REPLACE pixel layer)
  //   - pixel diff = visual ground truth;DOM diff = structural ground truth(catches drift pixel cannot see)
  //   - 預設 union(任一 layer FAIL = overall FAIL);**例外:shell-only 模式 skip DOM diff**(2026-06-03,
  //     見下方 — DOM 仍含被遮內容會 false-positive,故 shell-only 只由 masked pixel 決定 verdict)
  //   - identity diff 整體是 opt-in(只跑標 @composition-fidelity-mode 的 mapping;單獨 @story-baseline = conformance)
  let domVerdict = { status: 'SKIP', reason: 'no DOM snapshot captured' }
  if (m.mode === 'shell-only') {
    // 2026-06-03 修:shell-only 只在 pixel 層遮罩 inner content(白 div overlay),DOM 仍含被遮的內容元素 →
    // DOM signature diff 會對 by-design 不同的內容 false-positive(等於遮罩沒生效到 DOM)。shell-only 語意 =
    // 只比遮罩後的視覺殼,故 DOM diff 在此模式無意義 → SKIP,只由 masked pixel 決定 verdict。
    domVerdict = { status: 'SKIP', reason: 'shell-only mode: DOM diff skipped (content masked at pixel layer only; DOM-diff would false-positive on intentionally-different inner content)' }
  } else if (baselineDom && consumerDom) {
    const dd = domDiff(baselineDom, consumerDom)
    // Threshold:0 missing/extra/style drift = clean。Any > 0 = potential drift。
    // For template-vs-canonical scope: missing/extra > 5 OR styleDrifts > 20 = FAIL
    const domThreshold = m.domThreshold || { missing: 5, extra: 5, styleDrifts: 20 }
    const domPassed = dd.missing <= domThreshold.missing && dd.extra <= domThreshold.extra && dd.styleDrifts <= domThreshold.styleDrifts
    domVerdict = {
      status: domPassed ? 'PASS' : 'FAIL',
      missing: dd.missing,
      extra: dd.extra,
      styleDrifts: dd.styleDrifts,
      sample: dd.sample,
      threshold: domThreshold,
    }
    writeFileSync(evidenceFile(`diff/${fileSafe}.dom.json`), JSON.stringify({ baselineDom, consumerDom, diff: dd }, null, 2))
  }

  // Overall verdict: UNION fail (any layer fail = overall fail), per AI-self-audit-unreliable canonical
  const overallPassed = pixelPassed && (domVerdict.status === 'PASS' || domVerdict.status === 'SKIP')
  const overallStatus = overallPassed ? 'PASS' : (pixelPassed ? 'DOM_FAIL' : (domVerdict.status === 'FAIL' ? 'BOTH_FAIL' : 'PIXEL_FAIL'))

  results.push({
    ...m,
    status: overallStatus,
    pixel: { passed: pixelPassed, diffPx, totalPx, diffPct: diffPct.toFixed(4), threshold: effectiveThreshold },
    dom: domVerdict,
  })
  if (!overallPassed) failCount++

  const pixelIcon = pixelPassed ? '✓' : '✗'
  const domIcon = domVerdict.status === 'PASS' ? '✓' : domVerdict.status === 'SKIP' ? '○' : '✗'
  console.log(`pixel:${pixelIcon} dom:${domIcon} ${m.consumerStoryId} ← ${m.baselineStoryId}  pixel=${diffPct.toFixed(4)}% dom=missing/${domVerdict.missing ?? '?'} extra/${domVerdict.extra ?? '?'} styles/${domVerdict.styleDrifts ?? '?'}${overallPassed ? '' : '  FAIL('+overallStatus+')'}`)
}

await browser.close()
dsServer?.close()
consumerServer?.close()

const report = { generatedAt: new Date().toISOString(), threshold: THRESHOLD_PCT, mapping: identityMappings, conformanceOnly, results, summary: { total: results.length, fail: failCount, pass: results.length - failCount } }
const reportPath = evidenceFile('report.json')
writeFileSync(reportPath, JSON.stringify(report, null, 2))

console.log('\n=== Composition fidelity report ===')
console.log(JSON.stringify(report.summary, null, 2))
console.log(`Full report: ${reportPath}`)

process.exit(failCount === 0 ? 0 : 1)
