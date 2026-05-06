#!/usr/bin/env node
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(6070, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })

await page.goto('http://localhost:6070/iframe.html?id=design-system-components-datatable-展示--row-auto-height-inline-edit&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

const target = await page.evaluate(() => {
  const cells = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')
  const r = cells[3].getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + 30 }
})
await page.mouse.click(target.x, target.y)
await page.waitForTimeout(700)

const m = await page.evaluate(() => {
  const cell = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')[3]
  const field = cell.querySelector('[data-field-mode="edit"]')
  return {
    fieldClassName: field?.className,
    fieldClassList: field ? Array.from(field.classList) : null,
    classCount: field?.classList.length,
  }
})
console.log(JSON.stringify(m, null, 2))

await browser.close()
server.close()
