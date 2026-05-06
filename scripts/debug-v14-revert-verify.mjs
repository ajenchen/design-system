#!/usr/bin/env node
// Verify v14 revert: Field naked back to v9 baseline → Field 撐滿 cell + 2px double border 接受。
// Also verify columnResizeMode 'onChange' live resize works.
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')
const OUT = join(ROOT, '.claude/snapshots/v14-revert-verify')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(6066, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 2 })

// ── Test 1: autoRowHeight inline edit — Field 必撐滿 cell ──
await page.goto('http://localhost:6066/iframe.html?id=design-system-components-datatable-展示--row-auto-height-inline-edit&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

// Click Note cell on row index 2 (PRD-0003) — that's the long-Note row that exposed v12 bug
const target1 = await page.evaluate(() => {
  const cells = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')
  const cell = cells[3]
  if (!cell) return null
  const r = cell.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + 30 }
})
await page.mouse.click(target1.x, target1.y)
await page.waitForTimeout(700)

const m1 = await page.evaluate(() => {
  const editingRow = document.querySelector('[role="row"][data-row-index="2"]')
  const editingCell = editingRow?.querySelectorAll('[role="cell"]')[3]
  if (!editingCell) return { error: 'cell not found' }
  const field = editingCell.querySelector('[data-field-mode="edit"]')
  if (!field) return { error: 'no Field' }
  const cellRect = editingCell.getBoundingClientRect()
  const fieldRect = field.getBoundingClientRect()
  const fieldCs = window.getComputedStyle(field)
  return {
    cell: { top: cellRect.top, bottom: cellRect.bottom, height: cellRect.height, left: cellRect.left, right: cellRect.right, width: cellRect.width },
    field: { top: fieldRect.top, bottom: fieldRect.bottom, height: fieldRect.height, left: fieldRect.left, right: fieldRect.right, width: fieldRect.width },
    fieldPosition: fieldCs.position,
    fieldHeight: fieldCs.height,
    fillsVertically: Math.abs(fieldRect.height - cellRect.height) < 2,
    fillsHorizontally: Math.abs(fieldRect.width - cellRect.width) < 4, // padding tolerance
  }
})

console.log('── Test 1: autoRowHeight Note cell editing ──')
console.log(JSON.stringify(m1, null, 2))

await page.screenshot({
  path: join(OUT, 'autoRow-note-editing.png'),
  clip: { x: Math.max(0, target1.x - 300), y: Math.max(0, target1.y - 100), width: 700, height: 300 },
})

// ── Test 2: ColumnResize live drag verify ──
await page.goto('http://localhost:6066/iframe.html?id=design-system-components-datatable-展示--column-resize&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)

const handle = await page.evaluate(() => {
  // Find first resize handle (separator role)
  const sep = document.querySelector('[role="separator"][aria-orientation="vertical"]')
  if (!sep) return null
  const r = sep.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, initialColRight: r.x + r.width / 2 }
})

if (!handle) {
  console.log('── Test 2: NO resize handle found ──')
} else {
  await page.screenshot({ path: join(OUT, 'resize-story-initial.png'), fullPage: false })
  // Debug: log handle position + check getResizeHandler attachment
  const debugInfo = await page.evaluate(() => {
    const sep = document.querySelector('[role="separator"][aria-orientation="vertical"]')
    return {
      sepClass: sep?.className,
      hasOnMouseDown: !!sep?.onmousedown,
      cursor: window.getComputedStyle(sep).cursor,
      ariaLabel: sep?.getAttribute('aria-label'),
      headerCount: document.querySelectorAll('[role="columnheader"]').length,
      sepCount: document.querySelectorAll('[role="separator"]').length,
    }
  })
  console.log('── Test 2 debug:', JSON.stringify(debugInfo, null, 2))
  // Get initial column width
  const initialW = await page.evaluate(() => {
    const cell = document.querySelector('[role="columnheader"]:nth-child(2)')
    return cell?.getBoundingClientRect().width
  })

  // 找出 handle 屬於哪個 column header,然後量該 column 的 cell width
  const colInfo = await page.evaluate(() => {
    const sep = document.querySelector('[role="separator"][aria-orientation="vertical"]')
    const headerCell = sep?.closest('[role="columnheader"]')
    const headers = Array.from(document.querySelectorAll('[role="columnheader"]'))
    const idx = headerCell ? headers.indexOf(headerCell) : -1
    return { idx, headerWidth: headerCell?.getBoundingClientRect().width }
  })
  const targetSel = `[role="columnheader"]:nth-of-type(${colInfo.idx + 1})`
  const initialW2 = colInfo.headerWidth

  // Drag with explicit steps + waits to allow React to re-render mid-drag
  await page.mouse.move(handle.x, handle.y)
  await page.mouse.down()
  await page.waitForTimeout(50)
  await page.mouse.move(handle.x + 40, handle.y, { steps: 10 })
  await page.waitForTimeout(100)
  const midW = await page.evaluate((sel) => {
    const cell = document.querySelector(sel)
    return cell?.getBoundingClientRect().width
  }, targetSel)
  await page.mouse.move(handle.x + 100, handle.y, { steps: 10 })
  await page.waitForTimeout(100)
  const endDragW = await page.evaluate((sel) => {
    const cell = document.querySelector(sel)
    return cell?.getBoundingClientRect().width
  }, targetSel)
  await page.mouse.up()
  await page.waitForTimeout(300)
  const finalW = await page.evaluate((sel) => {
    const cell = document.querySelector(sel)
    return cell?.getBoundingClientRect().width
  }, targetSel)

  console.log('── Test 2: ColumnResize live drag ──')
  console.log(JSON.stringify({
    handleColumnIdx: colInfo.idx,
    initialW: initialW2,
    midDragW: midW,
    endDragW,
    finalW,
    liveResize: midW > initialW2 + 20 && endDragW > midW + 20,
    deltaInitial_to_mid: midW - initialW2,
    deltaMid_to_end: endDragW - midW,
    finalDelta: finalW - initialW2,
  }, null, 2))
}

await browser.close()
server.close()
