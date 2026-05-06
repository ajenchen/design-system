#!/usr/bin/env node
// Focused Combobox state debug — searchable Tags cell open + focus → expected border?
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')
const OUT = join(ROOT, '.claude/snapshots/combobox-state')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(6060, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 })

// Use Combobox 搜尋 story (combobox搜尋整合演示)
await page.goto('http://localhost:6060/iframe.html?id=design-system-components-combobox-展示--searchable&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const probe = async (label) => {
  const data = await page.evaluate(() => {
    // Find all inline-trigger comboboxes (search box inside trigger)
    const triggers = document.querySelectorAll('[role="combobox"]')
    return Array.from(triggers).map((t, i) => {
      const input = t.querySelector('input')
      const cs = window.getComputedStyle(t)
      return {
        i,
        hasInput: !!input,
        inputFocused: input ? document.activeElement === input : false,
        dataState: t.getAttribute('data-state'),
        ariaExpanded: t.getAttribute('aria-expanded'),
        borderColor: cs.borderTopColor,
        borderTopWidth: cs.borderTopWidth,
        rect: t.getBoundingClientRect(),
      }
    })
  })
  console.log(`\n=== ${label} ===`)
  data.forEach(d => console.log(`  combobox[${d.i}] hasInput=${d.hasInput} focused=${d.inputFocused} dataState=${d.dataState} aria-expanded=${d.ariaExpanded} border=${d.borderColor}`))
  return data
}

await probe('Initial — all closed')

// Click 2nd combobox(searchIn=trigger inline searchable)
const target = await page.evaluate(() => {
  const triggers = document.querySelectorAll('[role="combobox"]')
  const t = triggers[1]
  if (!t) return null
  const r = t.getBoundingClientRect()
  return { x: r.x + 40, y: r.y + r.height / 2 }
})
if (target) {
  await page.mouse.click(target.x, target.y)
  await page.waitForTimeout(700)
  await probe('After click trigger[1]')
  await page.screenshot({ path: join(OUT, 'after-click.png'), clip: { x: 0, y: 0, width: 1000, height: 400 } })
}

// Click the input directly to ensure input focused
await page.evaluate(() => {
  const input = document.querySelectorAll('[role="combobox"]')[1]?.querySelector('input')
  input?.focus()
})
await page.waitForTimeout(400)
await probe('After explicit input focus')

// Move mouse far away (focus stays on input)
await page.mouse.move(50, 700)
await page.waitForTimeout(400)
await probe('After mouse-away (input still focused)')
await page.screenshot({ path: join(OUT, 'focus-only.png'), clip: { x: 0, y: 0, width: 1000, height: 400 } })

// Move mouse over the trigger (hover + focus)
if (target) {
  await page.mouse.move(target.x, target.y)
  await page.waitForTimeout(400)
  await probe('After hover+focus')
  await page.screenshot({ path: join(OUT, 'hover-focus.png'), clip: { x: 0, y: 0, width: 1000, height: 400 } })
}

await browser.close()
server.close()
