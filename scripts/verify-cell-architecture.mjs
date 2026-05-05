#!/usr/bin/env node
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, '.claude/snapshots/verify-arch')
mkdirSync(OUT, { recursive: true })
const STATIC = join(ROOT, 'storybook-static')

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(6029, r))

const browser = await chromium.launch({ headless: true })

async function clickCellAndSnap(storyId, cellIdx, label) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 2 })
  await page.goto(`http://localhost:6029/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[role="row"][data-row-index]')
  await page.waitForTimeout(400)

  // Snap display state
  const displayState = await page.evaluate((idx) => {
    const cell = document.querySelectorAll('[role="row"][data-row-index="0"] [role="cell"]')[idx]
    if (!cell) return null
    const r = cell.getBoundingClientRect()
    // Find text node y position inside cell
    const textY = (() => {
      const range = document.createRange()
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode())) {
        if (node.textContent?.trim()) {
          range.selectNodeContents(node)
          const rr = range.getBoundingClientRect()
          if (rr.height > 0) return { top: rr.top - r.top, height: rr.height, text: node.textContent.slice(0, 20) }
        }
      }
      return null
    })()
    return { cellH: r.height, cellY: r.y, textY }
  }, cellIdx)

  const rect = await page.evaluate((idx) => {
    const cell = document.querySelectorAll('[role="row"][data-row-index="0"] [role="cell"]')[idx]
    if (!cell) return null
    const r = cell.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, cellIdx)

  if (!rect) { await page.close(); return null }
  await page.mouse.click(rect.x, rect.y)
  await page.waitForTimeout(400)

  const editState = await page.evaluate((idx) => {
    const cell = document.querySelectorAll('[role="row"][data-row-index="0"] [role="cell"]')[idx]
    const r = cell.getBoundingClientRect()
    const cs = getComputedStyle(cell)
    const focusedEl = document.activeElement
    const focusedR = focusedEl ? focusedEl.getBoundingClientRect() : null
    const popovers = document.querySelectorAll('[data-radix-popper-content-wrapper]').length
    return {
      cellH: r.height,
      cellY: r.y,
      hasInsetShadow: cs.boxShadow.includes('inset'),
      focusedTag: focusedEl?.tagName,
      focusedY: focusedR ? focusedR.top - r.top : null,
      focusedH: focusedR?.height,
      popovers,
    }
  }, cellIdx)

  await page.screenshot({ path: join(OUT, `${label}-cell${cellIdx}.png`), clip: { x: 0, y: 0, width: 1400, height: 600 } })
  console.log(`\n[${label} cell-${cellIdx}]`)
  console.log('  display:', displayState)
  console.log('  edit:   ', editState)

  await page.close()
}

// Inline-edit-interactive: cell 1=Product(text), 2=Category(select), 3=Stock(select), 6=Price(number)
await clickCellAndSnap('design-system-components-datatable-展示--inline-edit-interactive', 1, 'inline-edit')
await clickCellAndSnap('design-system-components-datatable-展示--inline-edit-interactive', 2, 'inline-edit')
await clickCellAndSnap('design-system-components-datatable-展示--inline-edit-interactive', 6, 'inline-edit')

await browser.close()
server.close()
