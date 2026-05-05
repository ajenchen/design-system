#!/usr/bin/env node
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, '.claude/snapshots/f3-row-drag')
const STATIC = join(ROOT, 'storybook-static')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(6021, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 700 }, deviceScaleFactor: 2 })
await page.goto('http://localhost:6021/iframe.html?id=design-system-components-datatable-展示--row-drag-interactive&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]', { timeout: 8000 })
await page.waitForTimeout(500)

// hover row 0
const row = page.locator('[role="row"][data-row-index="0"]').first()
const box = await row.boundingBox()
await page.mouse.move(box.x + 60, box.y + box.height / 2)
await page.waitForTimeout(400)

// find handle in DOM (Portal target = body)
const handleInfo = await page.evaluate(() => {
  const h = document.querySelector('[aria-label="拖曳重排此列"]')
  if (!h) return { found: false }
  const r = h.getBoundingClientRect()
  const styles = getComputedStyle(h)
  return {
    found: true,
    box: { x: r.x, y: r.y, w: r.width, h: r.height },
    bg: styles.backgroundColor,
    border: styles.border,
    color: styles.color,
    classList: h.className,
    parent: h.parentElement?.tagName + ' ' + (h.parentElement?.className || ''),
  }
})
console.log('Handle info:', JSON.stringify(handleInfo, null, 2))

if (handleInfo.found) {
  const b = handleInfo.box
  // Zoom: 100x100 around handle center
  await page.screenshot({
    path: join(OUT, 'handle-zoom.png'),
    clip: { x: Math.max(0, b.x - 40), y: Math.max(0, b.y - 30), width: 120, height: 80 },
  })
  console.log('Zoomed shot saved')
}

await browser.close()
server.close()
