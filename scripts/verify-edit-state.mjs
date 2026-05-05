#!/usr/bin/env node
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')
const OUT = join(ROOT, '.claude/snapshots/verify-edit-state')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(6037, r))

const browser = await chromium.launch({ headless: true })

async function captureEdit(storyId, cellIdx, label) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 700 }, deviceScaleFactor: 2 })
  await page.goto(`http://localhost:6037/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[role="row"][data-row-index]')
  await page.waitForTimeout(400)

  const rect = await page.evaluate((idx) => {
    const cell = document.querySelectorAll('[role="row"][data-row-index="0"] [role="cell"]')[idx]
    if (!cell) return null
    const r = cell.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, cellIdx)
  if (rect) await page.mouse.click(rect.x, rect.y)
  await page.waitForTimeout(500)

  // Clip to a window around row 0–2
  await page.screenshot({
    path: join(OUT, `${label}-cell${cellIdx}-edit.png`),
    clip: { x: 0, y: 60, width: 1400, height: 250 }
  })
  console.log(`✓ ${label} cell-${cellIdx}`)
  await page.close()
}

// fixed mode editing
await captureEdit('design-system-components-datatable-展示--inline-edit-interactive', 1, 'fixed')   // Product (string single-line)
await captureEdit('design-system-components-datatable-展示--inline-edit-interactive', 6, 'fixed')   // Price (currency right-align)
await captureEdit('design-system-components-datatable-展示--inline-edit-interactive', 2, 'fixed')   // Category (select)

// autoRow editing
await captureEdit('design-system-components-datatable-展示--row-auto-height-inline-edit', 1, 'autoRow')  // Product wrap
await captureEdit('design-system-components-datatable-展示--row-auto-height-inline-edit', 4, 'autoRow')  // Price right-align

await browser.close()
server.close()
