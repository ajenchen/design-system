#!/usr/bin/env node
/**
 * F3 Row-Drag v2 Visual Verify
 *
 * Verifies two stories with persistent screenshots:
 * 1. RowDragInteractive — pinnedLeft+pinnedRight 3-panel mirror sync
 * 2. RowDragWithVirtualization — 200 rows, ~20-30 visible, drag works
 */

import { chromium } from 'playwright'
import http from 'node:http'
import { mkdirSync, existsSync, rmSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, '.claude/snapshots/f3-row-drag')
const STATIC_DIR = join(ROOT, 'storybook-static')
const PORT = 6020
const BASE = `http://localhost:${PORT}`

mkdirSync(OUT, { recursive: true })

// ── Start built-in static server ──
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2',
}
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0])
  if (urlPath === '/') urlPath = '/index.html'
  const filePath = join(STATIC_DIR, urlPath)
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404); res.end('not found'); return
  }
  const mime = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, { 'content-type': mime })
  res.end(readFileSync(filePath))
})
await new Promise((r) => server.listen(PORT, r))
console.log('[verify] static server on :' + PORT)

let exitCode = 0
const results = []

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
})
const page = await context.newPage()
page.setDefaultTimeout(15000)

// helper: navigate to storybook story iframe (avoids docs UI)
async function gotoStory(storyId) {
  const url = `${BASE}/iframe.html?id=${storyId}&viewMode=story`
  console.log('  goto', url)
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('  [page-console-err]', msg.text())
  })
  page.on('pageerror', (err) => console.log('  [page-error]', err.message))
  await page.goto(url, { waitUntil: 'networkidle' })
  // give time for React to settle
  await page.waitForSelector('[role="table"]', { timeout: 10000 })
  await page.waitForSelector('[role="row"][data-row-index]', { timeout: 10000 })
  await page.waitForTimeout(500)
}

// helper: hover row 0 to surface drag handle
async function hoverFirstRow() {
  // find first body row (first tr inside the table tbody — there can be multiple tbodies for pinned regions)
  const firstRow = page.locator('[role="row"][data-row-index]').first()
  await firstRow.scrollIntoViewIfNeeded()
  const box = await firstRow.boundingBox()
  if (!box) return null
  await page.mouse.move(box.x + 24, box.y + box.height / 2)
  await page.waitForTimeout(300)
  return { row: firstRow, box }
}

// Use Playwright's real mouse — Chromium dispatches both mouse* and pointer* events automatically
async function startDrag() {
  const handle = page.locator('[role="button"][aria-label="拖曳重排此列"]').first()
  if (!(await handle.count())) return null
  // Force-hover parent row so handle becomes opacity-100 and hit-testable
  const row = page.locator('[role="row"][data-row-index]').first()
  await row.hover({ force: true })
  await page.waitForTimeout(150)
  const box = await handle.boundingBox()
  if (!box) return null
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  return { x: cx, y: cy }
}

async function pointerMoveTo(x, y) {
  // Playwright's real mouse fires both mouse and pointer events with proper sequencing
  await page.mouse.move(x, y, { steps: 5 })
}

async function pointerUp(x, y) {
  await page.mouse.move(x, y)
  await page.mouse.up()
}

// ============================================================
// Story 1 — RowDragInteractive (3-panel pinned)
// ============================================================
{
  const storyId = 'design-system-components-datatable-展示--row-drag-interactive'
  const r = { story: 'RowDragInteractive', storyId, checks: [] }
  console.log('\n[verify] === RowDragInteractive (3-panel pinned) ===')
  try {
    await gotoStory(storyId)

    // count rowgroups (pinned-left / center / pinned-right rendered as separate rowgroup divs)
    // Each region renders the same logical rows → mirror sync means same row id appears in multiple regions
    const rowGroups = await page.locator('[role="rowgroup"]').count()
    const rowsTotal = await page.locator('[role="row"][data-row-index]').count()
    const distinctRowIdx = await page.evaluate(() => {
      const idxs = new Set()
      document.querySelectorAll('[role="row"][data-row-index]').forEach((el) => idxs.add(el.getAttribute('data-row-index')))
      return idxs.size
    })
    r.checks.push({ name: 'rowgroup count', value: rowGroups })
    r.checks.push({ name: 'role=row total', value: rowsTotal })
    r.checks.push({ name: 'distinct row indices', value: distinctRowIdx })
    const mirrorMultiplier = distinctRowIdx > 0 ? rowsTotal / distinctRowIdx : 0
    r.checks.push({ name: 'mirror multiplier (rows/distinctIdx)', value: mirrorMultiplier })
    console.log('  rowgroups:', rowGroups, '| rows total:', rowsTotal, '| distinct idx:', distinctRowIdx, '| multiplier:', mirrorMultiplier)

    // capture initial
    await page.screenshot({ path: join(OUT, 'rowDragInteractive-initial.png'), fullPage: false })
    console.log('  ✓ initial.png')

    // hover first row → handle visible
    const hover = await hoverFirstRow()
    await page.screenshot({ path: join(OUT, 'rowDragInteractive-hover.png'), fullPage: false })
    console.log('  ✓ hover.png')

    // start drag, move ~120px down, do NOT release yet → mid-drag screenshot
    const start = await startDrag()
    if (start) {
      // step the move so dnd-kit picks up activation (8px threshold)
      await pointerMoveTo(start.x, start.y + 10)
      await page.waitForTimeout(50)
      await pointerMoveTo(start.x, start.y + 60)
      await page.waitForTimeout(50)
      await pointerMoveTo(start.x, start.y + 140)
      await page.waitForTimeout(300)

      // sample DOM transforms — find rows across all rowgroups (pinned-left / center / pinned-right)
      // dnd-kit applies transform to the dragged row across all panels (mirror sync)
      const transforms = await page.evaluate(() => {
        const groups = Array.from(document.querySelectorAll('[role="rowgroup"]'))
        const out = []
        groups.forEach((g, i) => {
          const rows = Array.from(g.querySelectorAll('[role="row"][data-row-index]'))
          rows.forEach((tr) => {
            const idx = tr.getAttribute('data-row-index')
            const t = getComputedStyle(tr).transform
            // also capture the transform style attr (dnd-kit applies via inline style)
            const inline = tr.getAttribute('style') || ''
            if ((t && t !== 'none') || /transform:/i.test(inline)) {
              out.push({ group: i, rowIndex: idx, transform: t, inline: inline.match(/transform:\s*[^;]+/)?.[0] || null })
            }
          })
        })
        return out
      })

      r.checks.push({ name: 'mid-drag transforms', value: transforms })
      console.log('  mid-drag transforms:', JSON.stringify(transforms, null, 2))

      await page.screenshot({ path: join(OUT, 'rowDragInteractive-after-drag.png'), fullPage: false })
      console.log('  ✓ after-drag.png (mid-drag)')

      await pointerUp(start.x, start.y + 140)
      await page.waitForTimeout(300)

      // Mirror sync assertion: same data-row-index in ≥2 distinct rowgroups should share transform
      let mirrorOk = false
      const byIdx = {}
      for (const t of transforms) {
        byIdx[t.rowIndex] = byIdx[t.rowIndex] || []
        byIdx[t.rowIndex].push(t)
      }
      const mirrorDetail = []
      for (const k of Object.keys(byIdx)) {
        const groups = new Set(byIdx[k].map((t) => t.group))
        const transformsSet = new Set(byIdx[k].map((t) => t.transform))
        mirrorDetail.push({ rowIndex: k, groupCount: groups.size, distinctTransforms: transformsSet.size, instances: byIdx[k].length })
        // mirror OK if same idx appears in 3 groups (pinned-left / center / pinned-right) with single transform
        if (groups.size >= 2 && transformsSet.size === 1) mirrorOk = true
      }
      r.checks.push({ name: 'mirror sync', value: mirrorOk })
      r.checks.push({ name: 'mirror detail', value: mirrorDetail })
      console.log('  mirror detail:', JSON.stringify(mirrorDetail, null, 2))
      console.log('  mirror sync:', mirrorOk ? 'PASS' : 'FAIL')
      if (!mirrorOk) exitCode = 1
    } else {
      r.checks.push({ name: 'drag handle', value: 'not found' })
      exitCode = 1
    }
  } catch (e) {
    console.error('  ERROR:', e.message)
    r.error = e.message
    exitCode = 1
  }
  results.push(r)
}

// ============================================================
// Story 2 — RowDragWithVirtualization
// ============================================================
{
  const storyId = 'design-system-components-datatable-展示--row-drag-with-virtualization'
  const r = { story: 'RowDragWithVirtualization', storyId, checks: [] }
  console.log('\n[verify] === RowDragWithVirtualization (200 rows) ===')
  try {
    await gotoStory(storyId)

    // count rendered rows — distinct data-row-index (story has no pinned columns, so 1 group expected)
    const renderInfo = await page.evaluate(() => {
      const groups = document.querySelectorAll('[role="rowgroup"]').length
      const rows = document.querySelectorAll('[role="row"][data-row-index]').length
      const distinctIdx = new Set()
      document.querySelectorAll('[role="row"][data-row-index]').forEach((el) => distinctIdx.add(el.getAttribute('data-row-index')))
      return { groups, rows, distinct: distinctIdx.size }
    })
    r.checks.push({ name: 'render info', value: renderInfo })
    console.log('  rowgroups:', renderInfo.groups, '| total row elements:', renderInfo.rows, '| distinct idx:', renderInfo.distinct, '(data: 200)')
    const virtualOk = renderInfo.distinct < 50
    r.checks.push({ name: 'virtualization engaged (distinct < 50)', value: virtualOk })
    if (!virtualOk) exitCode = 1

    await page.screenshot({ path: join(OUT, 'rowDragWithVirtualization-initial.png'), fullPage: false })
    console.log('  ✓ initial.png')

    // hover row 0
    await hoverFirstRow()
    await page.screenshot({ path: join(OUT, 'rowDragWithVirtualization-hover.png'), fullPage: false })
    console.log('  ✓ hover.png')

    // scroll the inner scroll container down by 1000px to verify virtualizer recycles rows
    const scrollContainer = page.locator('[data-virtual-scroll], .overflow-auto').first()
    const hasScroll = (await scrollContainer.count()) > 0
    if (hasScroll) {
      await scrollContainer.evaluate((el) => (el.scrollTop = 1000))
      await page.waitForTimeout(400)
      const rowsAfterScroll = await page.locator('[role="row"][data-row-index]').count()
      r.checks.push({ name: 'rows after scroll', value: rowsAfterScroll })
      console.log('  rows after scroll(1000px):', rowsAfterScroll)
      // reset
      await scrollContainer.evaluate((el) => (el.scrollTop = 0))
      await page.waitForTimeout(300)
    }

    // perform a drag on the (re-)hovered first row
    await hoverFirstRow()
    const start = await startDrag()
    if (start) {
      await pointerMoveTo(start.x, start.y + 10)
      await page.waitForTimeout(50)
      await pointerMoveTo(start.x, start.y + 80)
      await page.waitForTimeout(300)
      await page.screenshot({ path: join(OUT, 'rowDragWithVirtualization-after-drag.png'), fullPage: false })
      console.log('  ✓ after-drag.png')
      await pointerUp(start.x, start.y + 80)
      await page.waitForTimeout(200)
      r.checks.push({ name: 'drag executed', value: true })
    } else {
      r.checks.push({ name: 'drag handle', value: 'not found' })
      exitCode = 1
    }
  } catch (e) {
    console.error('  ERROR:', e.message)
    r.error = e.message
    exitCode = 1
  }
  results.push(r)
}

await browser.close()
server.close()

// cleanup tmp files
for (const i of [1, 2, 3]) {
  const p = `/tmp/f3-row-drag-verify-${i}.png`
  if (existsSync(p)) {
    rmSync(p)
    console.log('[cleanup] removed', p)
  }
}

console.log('\n[verify] === RESULTS ===')
console.log(JSON.stringify(results, null, 2))
process.exit(exitCode)
