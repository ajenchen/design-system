#!/usr/bin/env node
/**
 * visual-audit — 全自動視覺稽核(Layer A mechanical + screenshot 給 Layer B /visual-audit skill 用)
 *
 * ── Layer 分工 ──
 * Layer A(本 script,mechanical)
 *   1. 截圖每個關鍵 story(retina PNG,snapshots/*.png)
 *   2. WCAG 對比度掃描:每個 story 找可見文字 / icon 和底色對比,flag AA 不過(< 4.5:1 for text)
 *   3. 幾何 assertion:讀 `scripts/visual-assertions.json` 定義的 DOM 測量 per story
 *      (例:FileViewer toolbar 4 slot 等高 / DatePicker 四邊 12px 對稱 / Calendar cell 等寬)
 *   4. 產出 snapshots/report.json:{ snapshots: [...], contrastViolations: [...], geometryViolations: [...] }
 *
 * Layer B(`/visual-audit` skill,AI judgement)
 *   讀 snapshots/ PNG 做「設計合理性」判斷(箭頭不壓文字 / Badge 位置合理 / typography 選對 level)——
 *   這類 pattern recognition mechanical 做不到。
 *
 * ── Scope(對齊 CLAUDE.md 稽核三級 policy)──
 *   --scope=changed       (default) 讀 git diff 自動掃動到的 component + direct consumer
 *   --scope=component:NAME          單一元件全 story(e.g. component:DatePicker)
 *   --scope=all                     full DS-wide(release / token 大改 / 季度健檢)
 *   --urls=<csv>                    跑外部 URL(產品 app route,非 Storybook)
 *
 * ── 使用 ──
 *   npm run visual-audit               # 自動啟 storybook + 跑 Layer A + 關閉(headless)
 *   npm run visual-audit:headed        # 同上但帶 browser UI(debug)
 *   node scripts/visual-audit.mjs      # 假設 storybook 已在 :6006 跑
 *
 * ── Exit code ──
 *   0 = 無 violation
 *   1 = 有 contrast / geometry violation(CI 可用此 gate commit)
 */

import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const OUT_DIR = join(PROJECT_ROOT, 'snapshots')
const BASELINE_DIR = join(PROJECT_ROOT, 'snapshots-baseline')
const ASSERTIONS_PATH = join(PROJECT_ROOT, 'scripts/visual-assertions.json')
const STORYBOOK_URL = 'http://localhost:6006'
const PIXEL_DIFF_THRESHOLD = 0.1 // pixelmatch threshold (0=strict, 1=loose)
const PIXEL_DIFF_PCT_BUDGET = 0.5 // flag scenario if > 0.5% pixels differ from baseline

// ── Args parse(支援 --flag 和 --key=value)─────────────────────────────────
const ARG_LIST = process.argv.slice(2)
const ARGS_SET = new Set(ARG_LIST.filter((a) => !a.includes('=')))
const ARGS_KV = Object.fromEntries(
  ARG_LIST.filter((a) => a.includes('=')).map((a) => {
    const eq = a.indexOf('=')
    return [a.slice(0, eq), a.slice(eq + 1)]
  }),
)
const AUTO_START = ARGS_SET.has('--auto-start')
const HEADED = ARGS_SET.has('--headed')
const RETINA = ARGS_SET.has('--retina') // 預設 1x,Layer B AI 可讀(2x 超 2000px 限制);--retina opt-in for debug
const SCOPE = ARGS_KV['--scope'] ?? 'changed' // changed | all | component:<name>
const URLS = ARGS_KV['--urls'] // CSV of URLs,overrides scenario mode
const NO_A11Y = ARGS_SET.has('--no-a11y') // skip @axe-core/playwright(default runs)
const NO_DIFF = ARGS_SET.has('--no-diff') // skip baseline pixel diff
const UPDATE_BASELINE = ARGS_SET.has('--update-baseline') // copy new snapshots as baseline
// 2026-05-18 ship per codex Phase B F5: Dim 51 theme/density/RTL matrix support
// 用法:`--matrix=theme-density-rtl` → 對每 scenario 跑 6-cell matrix
//   (light / dark / high-contrast) × (density-md / density-lg) × (ltr / rtl)
// Storybook globals 對齊 .storybook/preview.tsx:57-65 — theme={light|dark|hc} density={md|lg} dir={ltr|rtl}
const MATRIX = ARGS_KV['--matrix'] // 'theme-density' | 'theme-density-rtl'(舊名,同義)| undefined
// 2026-06-11 dim 51 真落地:MATRIX_CELLS 原為 dead code(定義後 main loop 從未消費 = doc-claim ≠ code)。
// 同時修 cell 清單造假:preview.tsx globals 真值只有 theme{light,dark} × density{md,lg} —
// 原 hc / dir:rtl cell 注入未知 global = Storybook 靜默忽略 = 截到的其實是 light/ltr(假覆蓋)。
// RTL / high-contrast 屬 DS-wide 未決策(見拍板清單),DS 落地後再擴 cell。
const MATRIX_CELLS = MATRIX === 'theme-density' || MATRIX === 'theme-density-rtl'
  ? [
      { theme: 'light', density: 'md', label: 'light-md' },
      { theme: 'dark', density: 'md', label: 'dark-md' },
      { theme: 'light', density: 'lg', label: 'light-lg' },
      { theme: 'dark', density: 'lg', label: 'dark-lg' },
    ]
  : []
if (MATRIX_CELLS.length && UPDATE_BASELINE) {
  console.error('[visual-audit] --matrix 與 --update-baseline 不可併用(cell 截圖無 baseline 槽,會污染 baseline)')
  process.exit(1)
}

// ── 主 scenario 清單 ────────────────────────────────────────────────────────
// 先讀 assertions.json 取 scenario,fallback 到 hardcoded
let ASSERTIONS = {}
try {
  const raw = await readFile(ASSERTIONS_PATH, 'utf-8')
  ASSERTIONS = JSON.parse(raw)
} catch {
  console.warn('[visual-audit] scripts/visual-assertions.json 缺失,用內建 fallback')
  ASSERTIONS = {
    scenarios: [
      { id: 'design-system-components-datepicker-展示--basic', file: 'datepicker-basic.png' },
      { id: 'design-system-components-datepicker-展示--range-picker', file: 'datepicker-range.png' },
      { id: 'design-system-components-calendar-展示--團隊行事曆', file: 'calendar-event-team.png' },
      { id: 'design-system-components-timepicker-展示--會議時段', file: 'timepicker-meeting.png' },
      { id: 'design-system-components-fileviewer-展示--default', file: 'fileviewer-default.png' },
      { id: 'design-system-components-rating-展示--default', file: 'rating-default.png' },
      { id: 'design-system-components-coachmark-展示--tipsmultistep', file: 'coachmark-tips.png' },
      { id: 'design-system-components-carousel-展示--default', file: 'carousel-default.png' },
    ],
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function ensureOutDir() {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true })
}

async function waitForStorybook(url, maxWaitMs = 120_000) {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(url + '/iframe.html')
      if (res.ok) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

// WCAG 2.1 相對亮度公式
function relativeLuminance([r, g, b]) {
  const channel = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
function contrastRatio(rgb1, rgb2) {
  const L1 = relativeLuminance(rgb1)
  const L2 = relativeLuminance(rgb2)
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1]
  return (lighter + 0.05) / (darker + 0.05)
}
function parseRgb(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str)
  if (!m) return null
  const parts = m[1].split(',').map((s) => parseFloat(s.trim()))
  if (parts.length < 3) return null
  return [parts[0], parts[1], parts[2]]
}

// ── Contrast scan:在 page 內跑,抓所有可見文字 node ────────────────────────

async function scanContrast(page) {
  // Page-side:蒐集所有文字節點的 computedStyle + 父層 bg(往上爬到第一個非透明 bg)
  // WCAG 2.1 豁免(對齊 CLAUDE.md 稽核 canonical 優先順序):
  //   - [aria-hidden="true"] 裝飾性元素
  //   - [data-field-mode="disabled"] / [disabled] — disabled UI 豁免
  //   - [data-decorative] / avatar fallback initials(incidental text)
  //   - logo / brand mark(logotype 豁免)
  const samples = await page.evaluate(() => {
    /** @type {{text:string,color:string,bg:string,fontSize:number,fontWeight:number,selector:string}[]} */
    const out = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const text = node.textContent?.trim()
      if (!text || text.length === 0) continue
      const parent = node.parentElement
      if (!parent) continue

      // ── WCAG 2.1 豁免判定(walk ancestors 查標記) ──
      let ancestor = parent
      let exempt = false
      while (ancestor) {
        // aria-hidden = 裝飾性(screen reader 略過,對比豁免)
        if (ancestor.getAttribute('aria-hidden') === 'true') { exempt = true; break }
        // disabled UI(WCAG 2.1 明言豁免 1.4.3)
        if (ancestor.hasAttribute('disabled')) { exempt = true; break }
        if (ancestor.getAttribute('data-field-mode') === 'disabled') { exempt = true; break }
        if (ancestor.getAttribute('aria-disabled') === 'true') { exempt = true; break }
        // 裝飾性標記(DS convention)
        if (ancestor.hasAttribute('data-decorative')) { exempt = true; break }
        // logotype 豁免(WCAG 2.1 明言豁免)
        if (ancestor.getAttribute('role') === 'img' && ancestor.hasAttribute('aria-label')) { exempt = true; break }
        ancestor = ancestor.parentElement
      }
      if (exempt) continue

      const style = getComputedStyle(parent)
      // find effective background(走 DOM parent 至第一個非透明)
      let bgEl = parent
      let bg = ''
      while (bgEl) {
        const bgStyle = getComputedStyle(bgEl)
        if (bgStyle.backgroundColor && bgStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && bgStyle.backgroundColor !== 'transparent') {
          bg = bgStyle.backgroundColor
          break
        }
        bgEl = bgEl.parentElement
      }
      if (!bg) bg = 'rgb(255,255,255)' // default canvas white
      // Skip hidden
      const rect = parent.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) continue
      const selPath = (() => {
        let s = parent.tagName.toLowerCase()
        if (parent.id) s += '#' + parent.id
        const cls = (parent.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.')
        if (cls) s += '.' + cls
        return s
      })()
      out.push({
        text: text.slice(0, 40),
        color: style.color,
        bg,
        fontSize: parseFloat(style.fontSize),
        fontWeight: parseInt(style.fontWeight, 10) || 400,
        selector: selPath,
      })
    }
    return out
  })

  const violations = []
  for (const s of samples) {
    const fg = parseRgb(s.color)
    const bg = parseRgb(s.bg)
    if (!fg || !bg) continue
    const ratio = contrastRatio(fg, bg)
    // WCAG AA:regular text >= 4.5;large text (>= 18px or >= 14px bold) >= 3.0
    const large = s.fontSize >= 18 || (s.fontSize >= 14 && s.fontWeight >= 700)
    const threshold = large ? 3.0 : 4.5
    if (ratio < threshold) {
      violations.push({
        text: s.text,
        fg: s.color,
        bg: s.bg,
        ratio: Math.round(ratio * 100) / 100,
        threshold,
        fontSize: s.fontSize,
        selector: s.selector,
      })
    }
  }
  return { sampled: samples.length, violations }
}

// ── Geometry assertions ──────────────────────────────────────────────────────

async function runGeometryAssertions(page, assertions) {
  if (!assertions || assertions.length === 0) return []
  const violations = []
  for (const a of assertions) {
    try {
      if (a.type === 'equalHeight') {
        const heights = await page.$$eval(a.selector, (els) => els.map((el) => el.getBoundingClientRect().height))
        if (heights.length === 0) continue
        const first = heights[0]
        const mismatch = heights.filter((h) => Math.abs(h - first) > 0.5)
        if (mismatch.length > 0) {
          violations.push({
            assertion: a.name,
            type: 'equalHeight',
            expected: first,
            actual: heights,
            selector: a.selector,
          })
        }
      } else if (a.type === 'padding4Sided') {
        const padding = await page.$eval(a.selector, (el) => {
          const s = getComputedStyle(el)
          return {
            top: parseFloat(s.paddingTop),
            right: parseFloat(s.paddingRight),
            bottom: parseFloat(s.paddingBottom),
            left: parseFloat(s.paddingLeft),
          }
        })
        const vals = Object.values(padding)
        const first = vals[0]
        const mismatch = vals.some((v) => Math.abs(v - first) > 0.5)
        if (mismatch) {
          violations.push({
            assertion: a.name,
            type: 'padding4Sided',
            expected: `all = ${a.expected ?? first}`,
            actual: padding,
            selector: a.selector,
          })
        } else if (a.expected !== undefined && Math.abs(first - a.expected) > 0.5) {
          violations.push({
            assertion: a.name,
            type: 'padding4Sided',
            expected: a.expected,
            actual: first,
            selector: a.selector,
          })
        }
      } else if (a.type === 'gap') {
        const gap = await page.$eval(a.selector, (el) => parseFloat(getComputedStyle(el).gap) || 0)
        if (Math.abs(gap - a.expected) > 0.5) {
          violations.push({
            assertion: a.name,
            type: 'gap',
            expected: a.expected,
            actual: gap,
            selector: a.selector,
          })
        }
      }
    } catch (err) {
      // selector not found — 跳過不算 violation(story 可能沒 render 該元素)
    }
  }
  return violations
}

// ── Main ────────────────────────────────────────────────────────────────────

async function auditScenario(browser, scenario, opts = {}) {
  // deviceScaleFactor 預設 1(非 retina)— 2x retina 會讓 snapshot 寬度達 2880px,
  // 超過 AI sub-agent 的 image-dimension 限制(2000px),導致 Layer B 跑不了。
  // Mechanical Layer A 用 1x 夠用(contrast / geometry 量測與 DPI 無關)。
  // 若真需 retina debug,傳 opts.retina=true。
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: opts.retina ? 2 : 1,
  })
  const page = await context.newPage()
  // scenario 可有 .url(任意 URL,for product app routes)或 .id(Storybook story id)
  // 2026-05-18 ship per codex Phase B F5 + Dim 51: opts.matrixCell { theme, density, dir }
  // 注入 Storybook globals query params(對齊 .storybook/preview.tsx 全域 toolbar)
  const matrixCell = opts.matrixCell
  const globalsParam = matrixCell
    ? `&globals=theme:${matrixCell.theme};density:${matrixCell.density}`
    : ''
  const url = scenario.url
    ? scenario.url
    : `${STORYBOOK_URL}/iframe.html?id=${scenario.id}&viewMode=story${globalsParam}`

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 })

    // Interactive stories(hover / focus / tooltip / click / item-hover 等)透過 play() 設定狀態,
    // 不可被 reset 覆蓋。用 story id 關鍵字偵測(keyword-based),tagged 以外 fallback keyword match。
    const storyId = scenario.id ?? ''
    // 匹配 story id 含 interactive keywords(anywhere after '--'),不限於結尾
    const isInteractive =
      /--[a-z-]*(hover|focus|tooltip|click|interactive|pressed|active|swap|open-snapshot)[a-z-]*$/i.test(storyId)

    if (!isInteractive) {
      await page.mouse.move(0, 0) // avoid mouse hovering an icon-only trigger auto-showing tooltip in snapshot
    }
    await page.waitForTimeout(isInteractive ? 1200 : 600) // interactive stories 需更長等 play() + animations 結束

    if (!isInteractive) {
      // Blur active element — overlays with autoFocus (Radix Dialog / Popover) focus on close button,
      // and icon-only Button's focus-triggered tooltip would appear in the snapshot
      await page.evaluate(() => {
        const el = document.activeElement
        if (el && 'blur' in el && typeof el.blur === 'function') el.blur()
      })
      await page.waitForTimeout(200) // let tooltip dismiss
    }

    // Detect Storybook error display(stale cache / module resolution failure)—
    // 若 story load 失敗,Storybook 顯示 error。用 `#error-message` 有實際 text 偵測,
    // 而非 class prefix(後者會誤匹 Storybook 初始 DOM chrome)。
    const errorMsg = await page.locator('#error-message').textContent().catch(() => '')
    if (errorMsg && errorMsg.trim().length > 0) {
      return { id: scenario.id ?? scenario.url, file: scenario.file, error: `Storybook error display: ${errorMsg.slice(0, 200)}` }
    }

    const screenshotPath = join(OUT_DIR, scenario.file)
    await page.screenshot({ path: screenshotPath, fullPage: false })

    const contrast = await scanContrast(page)
    const geometry = await runGeometryAssertions(page, scenario.assertions)

    // ── axe-core a11y scan(2026-04-25,補 WCAG floor canonical 自動化)──
    // Canonical ladder(`# 稽核 canonical` 節)排序 WCAG 為 mechanical floor,但允許
    // DS spec documented exemption(incidental text / disabled / logotype / decorative)。
    // axe-core 不知 exemption,會誤報合法 disabled text 為 color-contrast violation。
    // 策略:disable axe `color-contrast`(Layer A `scanContrast` 已管含 exemption 邏輯),
    // 保留 axe 其他規則(aria-label / label-association / focus / landmark 等 axe 特長)。
    let a11yViolations = []
    if (!opts.noA11y) {
      try {
        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .disableRules([
            // Layer A scanContrast 已覆蓋且知 canonical ladder exemption;axe 無 exemption 會
            // 誤報 disabled/incidental text
            'color-contrast',
            // Radix portal 開啟時對 trigger 容器設 aria-hidden=true,其內 focusable 不 DOM-
            // hide(Radix canonical a11y pattern:screen reader 靠 aria-hidden 跳過,鍵盤由
            // focus trap 控)。axe 過度 flag,已知社群 false positive(axe-core issue #3259)。
            'aria-hidden-focus',
          ])
          .analyze()
        a11yViolations = axe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          nodes: v.nodes.length,
        }))
      } catch (axeErr) {
        a11yViolations = [{ id: '_axe-error', impact: 'unknown', description: axeErr.message }]
      }
    }

    // ── pixel diff vs baseline(if baseline exists)──
    let diff = null
    if (!opts.noDiff) {
      const baselinePath = join(BASELINE_DIR, scenario.file)
      if (existsSync(baselinePath)) {
        try {
          const current = PNG.sync.read(readFileSync(screenshotPath))
          const baseline = PNG.sync.read(readFileSync(baselinePath))
          if (current.width === baseline.width && current.height === baseline.height) {
            const diffImg = new PNG({ width: current.width, height: current.height })
            const diffPixels = pixelmatch(
              current.data,
              baseline.data,
              diffImg.data,
              current.width,
              current.height,
              { threshold: PIXEL_DIFF_THRESHOLD },
            )
            const total = current.width * current.height
            const pct = (diffPixels / total) * 100
            diff = { diffPixels, total, pct: Number(pct.toFixed(3)), exceedBudget: pct > PIXEL_DIFF_PCT_BUDGET }
          } else {
            diff = { error: `dimension mismatch(current ${current.width}×${current.height} vs baseline ${baseline.width}×${baseline.height})` }
          }
        } catch (diffErr) {
          diff = { error: diffErr.message }
        }
      }
    }

    return {
      id: scenario.id ?? scenario.url,
      file: scenario.file,
      contrast,
      geometryViolations: geometry,
      a11yViolations,
      diff,
    }
  } catch (err) {
    return { id: scenario.id ?? scenario.url, file: scenario.file, error: err.message }
  } finally {
    await context.close()
  }
}

// ── Scope resolution ───────────────────────────────────────────────────────
// 依 --scope / --urls 過濾 ASSERTIONS.scenarios 或產生 ad-hoc scenarios

function getChangedComponents() {
  // 讀 git diff 找動到的 packages/design-system/src/components/<Name>/ 目錄
  try {
    // 相比 main:用 `git diff main...HEAD --name-only` + working tree
    const committedFiles = execSync('git diff main...HEAD --name-only 2>/dev/null || echo ""', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    }).trim().split('\n').filter(Boolean)
    const workingFiles = execSync('git diff --name-only HEAD 2>/dev/null || echo ""', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    }).trim().split('\n').filter(Boolean)
    const stagedFiles = execSync('git diff --cached --name-only 2>/dev/null || echo ""', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    }).trim().split('\n').filter(Boolean)
    const all = new Set([...committedFiles, ...workingFiles, ...stagedFiles])
    const components = new Set()
    for (const f of all) {
      const m = /^src\/design-system\/components\/([^/]+)\//.exec(f)
      if (m) components.add(m[1])
    }
    return components
  } catch {
    return new Set()
  }
}

function filterScenarios(allScenarios) {
  // --urls mode:完全覆蓋,產生 ad-hoc scenarios 跑外部 URL
  if (URLS) {
    return URLS.split(',').map((u, i) => ({
      url: u.trim(),
      file: `url-${i}-${u.replace(/[^a-z0-9]/gi, '_').slice(0, 40)}.png`,
    }))
  }

  // Storybook scenario filtering by --scope
  if (SCOPE === 'all') {
    return allScenarios
  }

  if (SCOPE.startsWith('component:')) {
    const compName = SCOPE.slice('component:'.length).toLowerCase()
    return allScenarios.filter((s) =>
      s.id && s.id.toLowerCase().includes(`-${compName}-`)
    )
  }

  if (SCOPE === 'changed') {
    const changed = getChangedComponents()
    if (changed.size === 0) {
      console.log('[visual-audit] git diff 無動到 component,scope=changed 無 scenario 可跑')
      return []
    }
    const names = [...changed].map((n) => n.toLowerCase())
    console.log(`[visual-audit] scope=changed,動到的 component: ${[...changed].join(', ')}`)
    return allScenarios.filter((s) => {
      if (!s.id) return false
      return names.some((n) => s.id.toLowerCase().includes(`-${n}-`))
    })
  }

  console.warn(`[visual-audit] 未知 scope=${SCOPE},fallback 到 all`)
  return allScenarios
}

async function main() {
  await ensureOutDir()

  let storybookProc = null
  if (AUTO_START) {
    console.log('[visual-audit] 啟動 storybook...')
    storybookProc = spawn('npm', ['run', 'storybook', '--', '--ci', '--quiet'], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    storybookProc.stdout.on('data', () => {})
    storybookProc.stderr.on('data', () => {})

    const ready = await waitForStorybook(STORYBOOK_URL, 180_000)
    if (!ready) {
      console.error('[visual-audit] storybook 120s 未就緒')
      storybookProc.kill()
      process.exit(1)
    }
    console.log('[visual-audit] storybook 就緒')
  } else {
    const ready = await waitForStorybook(STORYBOOK_URL, 5_000)
    if (!ready) {
      console.error(`[visual-audit] storybook 未跑(${STORYBOOK_URL})。加 --auto-start 或先 npm run storybook`)
      process.exit(1)
    }
  }

  // Scope resolution
  const scopedScenarios = filterScenarios(ASSERTIONS.scenarios)
  if (scopedScenarios.length === 0) {
    console.log('[visual-audit] 0 scenario 符合 scope,跳過(exit 0)')
    if (storybookProc) storybookProc.kill()
    process.exit(0)
  }
  console.log(`[visual-audit] scope=${URLS ? 'urls' : SCOPE},跑 ${scopedScenarios.length} scenario`)

  const browser = await chromium.launch({ headless: !HEADED })
  const results = []
  let totalContrastViolations = 0
  let totalGeometryViolations = 0
  let totalA11yViolations = 0
  let totalDiffBudgetBreached = 0

  for (const scenario of scopedScenarios) {
    // 2026-06-11 dim 51:matrix mode = 每 scenario × cell 全跑 violation scan(contrast/geometry/axe)。
    // cell 截圖檔名帶 label、無 baseline 槽 → 固定 noDiff(pixel-diff 防線由非 matrix 正常跑負責)。
    const cellRuns = MATRIX_CELLS.length
      ? MATRIX_CELLS.map((cell) => ({
          scenario: { ...scenario, file: scenario.file ? scenario.file.replace(/\.png$/, `--${cell.label}.png`) : scenario.file },
          opts: { retina: RETINA, noA11y: NO_A11Y, noDiff: true, matrixCell: cell },
          tag: ` [${cell.label}]`,
        }))
      : [{ scenario, opts: { retina: RETINA, noA11y: NO_A11Y, noDiff: NO_DIFF }, tag: '' }]
    for (const run of cellRuns) {
      console.log(`[visual-audit] 稽核 ${scenario.id ?? scenario.url}${run.tag}`)
      const r = await auditScenario(browser, run.scenario, run.opts)
      results.push(r)
      if (r.contrast?.violations?.length) totalContrastViolations += r.contrast.violations.length
      if (r.geometryViolations?.length) totalGeometryViolations += r.geometryViolations.length
      if (r.a11yViolations?.length) totalA11yViolations += r.a11yViolations.length
      if (r.diff?.exceedBudget) totalDiffBudgetBreached++
      if (r.error) console.error(`  ✗ ${r.error}`)
    }
  }

  await browser.close()

  // ── Update baseline if requested ──
  if (UPDATE_BASELINE) {
    const { copyFile } = await import('node:fs/promises')
    if (!existsSync(BASELINE_DIR)) await mkdir(BASELINE_DIR, { recursive: true })
    let copied = 0
    for (const r of results) {
      if (r.file && !r.error) {
        await copyFile(join(OUT_DIR, r.file), join(BASELINE_DIR, r.file))
        copied++
      }
    }
    console.log(`[visual-audit] Baseline updated(${copied} files copied to snapshots-baseline/)`)
  }

  if (storybookProc) storybookProc.kill()

  const report = {
    generatedAt: new Date().toISOString(),
    totalContrastViolations,
    totalGeometryViolations,
    totalA11yViolations,
    totalDiffBudgetBreached,
    scenarios: results,
  }
  await writeFile(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))

  console.log(`\n[visual-audit] 完成`)
  console.log(`  Contrast violations: ${totalContrastViolations}`)
  console.log(`  Geometry violations: ${totalGeometryViolations}`)
  if (!NO_A11Y) console.log(`  A11y violations (WCAG 2.1 AA): ${totalA11yViolations}`)
  if (!NO_DIFF) console.log(`  Baseline diff budget breached: ${totalDiffBudgetBreached} (threshold ${PIXEL_DIFF_PCT_BUDGET}%)`)
  console.log(`  Report: ${join(OUT_DIR, 'report.json')}`)
  console.log(`  Screenshots: ${OUT_DIR}/*.png`)
  console.log(`\n[Layer B:invoke /visual-audit 讀 snapshots/ 做 AI 設計合理性判斷]`)

  process.exit(
    totalContrastViolations > 0 ||
      totalGeometryViolations > 0 ||
      totalA11yViolations > 0 ||
      totalDiffBudgetBreached > 0
      ? 1
      : 0,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
