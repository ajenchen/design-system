#!/usr/bin/env node
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, '.claude/snapshots/cell-edit')
mkdirSync(OUT, { recursive: true })
const STATIC = join(ROOT, 'storybook-static')

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(6028, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 2 })
page.on('console', m => console.log(`[console.${m.type()}]`, m.text()))

await page.goto('http://localhost:6028/iframe.html?id=design-system-components-datatable-展示--inline-edit-interactive&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(400)

// Inspect what type of select the Category column uses
const debugInfo = await page.evaluate(() => {
  return {
    isCoarsePointer: window.matchMedia('(pointer: coarse)').matches,
  }
})
console.log('debug:', debugInfo)

const rect = await page.evaluate(() => {
  const row0 = document.querySelector('[role="row"][data-row-index="0"]')
  const cell = row0.querySelectorAll('[role="cell"]')[2]  // Category column
  const r = cell.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})

await page.mouse.click(rect.x, rect.y)
await page.waitForTimeout(500)

const popoverInfo = await page.evaluate(() => {
  const wrappers = document.querySelectorAll('[data-radix-popper-content-wrapper]')
  const triggers = document.querySelectorAll('[role="combobox"]')
  return {
    popoverCount: wrappers.length,
    triggerCount: triggers.length,
    triggerStates: Array.from(triggers).map(t => ({
      ariaExpanded: t.getAttribute('aria-expanded'),
      dataState: t.getAttribute('data-state'),
    })),
  }
})
console.log('after click:', popoverInfo)

await page.screenshot({ path: join(OUT, 'debug.png'), clip: { x: 0, y: 80, width: 1400, height: 500 } })
await browser.close()
server.close()
