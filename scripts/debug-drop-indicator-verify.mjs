#!/usr/bin/env node
// Visual snapshot 驗 drop indicator (row + column)在 drag mid-motion 時實際 render
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')
const OUT = join(ROOT, '.claude/snapshots/drop-indicator-verify')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(7700, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })

// === COLUMN drop indicator ===
console.log('── COLUMN drag mid-motion drop indicator ──')
await page.goto('http://localhost:7700/iframe.html?id=design-system-components-datatable-展示--column-reorder&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

const colInfo = await page.evaluate(() => {
  const product = document.querySelector('[role="columnheader"][data-column-id="name"]')
  const category = document.querySelector('[role="columnheader"][data-column-id="category"]')
  if (!product || !category) return null
  const pr = product.getBoundingClientRect()
  const cr = category.getBoundingClientRect()
  return {
    productCenter: { x: pr.x + pr.width / 2, y: pr.y + pr.height / 2 },
    categoryCenter: { x: cr.x + cr.width / 2, y: cr.y + cr.height / 2 },
  }
})

if (colInfo) {
  await page.mouse.move(colInfo.productCenter.x, colInfo.productCenter.y)
  await page.mouse.down()
  await page.waitForTimeout(50)
  await page.mouse.move(colInfo.productCenter.x + 30, colInfo.productCenter.y, { steps: 5 })
  await page.waitForTimeout(300)
  await page.mouse.move(colInfo.categoryCenter.x + 5, colInfo.categoryCenter.y, { steps: 12 })
  await page.waitForTimeout(500)
  // Check React state via window: setDropIndicator applies pseudo class on category header
  const colDebug = await page.evaluate(() => {
    const cat = document.querySelector('[role="columnheader"][data-column-id="category"]')
    if (!cat) return { err: 'no cat' }
    const cs = window.getComputedStyle(cat, '::before')
    const csa = window.getComputedStyle(cat, '::after')
    return {
      catClass: cat.className,
      beforeBg: cs.backgroundColor, beforeWidth: cs.width, beforeHeight: cs.height, beforePos: cs.position, beforeContent: cs.content,
      afterBg: csa.backgroundColor, afterWidth: csa.width, afterHeight: csa.height, afterPos: csa.position, afterContent: csa.content,
    }
  })
  console.log('Category header pseudo computed:', JSON.stringify(colDebug, null, 2))

  const colCheck = await page.evaluate(() => {
    // Look for pseudo-element styles via getComputedStyle on header with 'before:absolute'
    const headers = Array.from(document.querySelectorAll('[role="columnheader"][data-column-id]'))
    const result = headers.map(h => {
      const id = h.getAttribute('data-column-id')
      const before = window.getComputedStyle(h, '::before')
      const after = window.getComputedStyle(h, '::after')
      const beforeVisible = before.content !== 'none' && before.position === 'absolute' && before.width !== '0px' && before.width !== 'auto'
      const afterVisible = after.content !== 'none' && after.position === 'absolute' && after.width !== '0px' && after.width !== 'auto'
      return { id, beforeVisible, afterVisible, beforeBg: before.backgroundColor, afterBg: after.backgroundColor }
    })
    return result.filter(r => r.beforeVisible || r.afterVisible)
  })
  console.log('Mid-drag indicator hits:', JSON.stringify(colCheck, null, 2))

  await page.screenshot({ path: join(OUT, 'column-mid-drag.png'), clip: { x: 0, y: 50, width: 1024, height: 200 } })
  await page.mouse.up()
  await page.waitForTimeout(300)
}

// === ROW drop indicator ===
console.log('\n── ROW drag mid-motion drop indicator ──')
await page.goto('http://localhost:7700/iframe.html?id=design-system-components-datatable-展示--row-drag-interactive&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

const rowInfo = await page.evaluate(() => {
  // Find drag handle on row 0
  const handle0 = document.querySelector('[role="row"][data-row-index="0"] [aria-label*="拖曳"], [role="row"][data-row-index="0"] [aria-label*="drag"]')
  const row0 = document.querySelector('[role="row"][data-row-index="0"]')
  const row3 = document.querySelector('[role="row"][data-row-index="3"]')
  if (!row0 || !row3) return null
  // Use row dragHandle if exists; else just left edge of row 0
  const r0 = row0.getBoundingClientRect()
  const r3 = row3.getBoundingClientRect()
  let handleCenter = null
  if (handle0) {
    const hr = handle0.getBoundingClientRect()
    handleCenter = { x: hr.x + hr.width / 2, y: hr.y + hr.height / 2 }
  }
  return {
    handleCenter: handleCenter ?? { x: r0.x + 12, y: r0.y + r0.height / 2 },
    row0Center: { x: r0.x + r0.width / 2, y: r0.y + r0.height / 2 },
    row3Center: { x: r3.x + r3.width / 2, y: r3.y + r3.height / 2 },
  }
})

if (rowInfo) {
  await page.mouse.move(rowInfo.handleCenter.x, rowInfo.handleCenter.y)
  await page.mouse.down()
  await page.waitForTimeout(50)
  await page.mouse.move(rowInfo.handleCenter.x, rowInfo.handleCenter.y + 20, { steps: 5 })
  await page.waitForTimeout(150)
  await page.mouse.move(rowInfo.row3Center.x, rowInfo.row3Center.y, { steps: 8 })
  await page.waitForTimeout(300)

  const rowCheck = await page.evaluate(() => {
    // dropIndicatorRow.before/after = absolute div top-0 / bottom-0 h-0.5 bg-primary
    const indicators = Array.from(document.querySelectorAll('[role="row"] div[aria-hidden="true"]'))
      .filter(el => {
        const cs = window.getComputedStyle(el)
        return cs.position === 'absolute' && cs.height === '2px' && (cs.top === '0px' || cs.bottom === '0px')
      })
    return indicators.map(el => {
      const cs = window.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      const parentRow = el.closest('[role="row"]')
      return {
        rowIdx: parentRow?.getAttribute('data-row-index'),
        position: cs.top === '0px' ? 'before' : 'after',
        bgColor: cs.backgroundColor,
        width: rect.width,
        height: rect.height,
      }
    })
  })
  console.log('Mid-drag row indicator hits:', JSON.stringify(rowCheck, null, 2))

  await page.screenshot({ path: join(OUT, 'row-mid-drag.png'), clip: { x: 0, y: 0, width: 1024, height: 350 } })
  await page.mouse.up()
  await page.waitForTimeout(300)
}

await browser.close()
server.close()
