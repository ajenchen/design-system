#!/usr/bin/env node
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const STATIC = '/home/user/design-system/storybook-static'
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(8300, r))
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
await page.goto('http://localhost:8300/iframe.html?id=design-system-components-datatable-展示--row-drag-interactive&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

const initOrder = await page.evaluate(() => Array.from(document.querySelectorAll('[role="row"][data-row-index]')).slice(0,6).map(r => r.querySelector('[role="cell"]')?.textContent?.trim().slice(0,8)))
console.log('Initial:', initOrder.join(' / '))

// Hover row 0 to reveal handle(portal-rendered, only visible on hover)
const row0Center = await page.evaluate(() => {
  const r = document.querySelector('[role="row"][data-row-index="0"]').getBoundingClientRect()
  return { x: r.x + 50, y: r.y + r.height / 2 }
})
await page.mouse.move(row0Center.x, row0Center.y)
await page.waitForTimeout(300)

const info = await page.evaluate(() => {
  const row3 = document.querySelector('[role="row"][data-row-index="3"]')
  // handle is portal-rendered at body level
  const handle0 = document.querySelector('button[aria-label="拖曳重排此列"]')
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x + b.width/2, y: b.y + b.height/2 } }
  return {
    handle0: handle0 ? r(handle0) : null,
    row3: r(row3),
  }
})
console.log('handle 0:', info.handle0)

if (info.handle0) {
  await page.mouse.move(info.handle0.x, info.handle0.y)
  await page.mouse.down()
  await page.waitForTimeout(80)
  await page.mouse.move(info.handle0.x, info.handle0.y + 10, { steps: 3 })
  await page.waitForTimeout(150)
  await page.mouse.move(info.row3.x, info.row3.y, { steps: 10 })
  await page.waitForTimeout(300)

  const indicators = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[role="row"] div[aria-hidden="true"]'))
      .filter(el => { const cs = window.getComputedStyle(el); return cs.position === 'absolute' && (cs.height === '2px' || cs.width === '2px') })
      .map(el => {
        const cs = window.getComputedStyle(el)
        const parentRow = el.closest('[role="row"]')
        return { rowIdx: parentRow?.getAttribute('data-row-index'), pos: cs.top === '0px' ? 'before' : 'after' }
      })
  })
  console.log('Mid-drag indicators:', JSON.stringify(indicators))

  await page.mouse.up()
  await page.waitForTimeout(300)

  const finalOrder = await page.evaluate(() => Array.from(document.querySelectorAll('[role="row"][data-row-index]')).slice(0,6).map(r => r.querySelector('[role="cell"]')?.textContent?.trim().slice(0,8)))
  console.log('Final:  ', finalOrder.join(' / '))
  console.log('Order changed?', JSON.stringify(initOrder) !== JSON.stringify(finalOrder))
}

await browser.close()
server.close()
