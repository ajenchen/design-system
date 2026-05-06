#!/usr/bin/env node
// Side-by-side: v9 baseline vs current(810b1f5)— PRD-0003 long-text Note cell editing
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'

function makeServer(staticDir, port) {
  const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' }
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
    const fp = join(staticDir, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
  })
  return new Promise(r => { server.listen(port, () => r(server)) })
}

const OUT = '/tmp/v9-vs-current'
mkdirSync(OUT, { recursive: true })

const v9Server = await makeServer('/tmp/v9-baseline/storybook-static', 7001)
const curServer = await makeServer('/home/user/design-system/storybook-static', 7002)

const browser = await chromium.launch({ headless: true })

async function probePRD0003(label, port, screenshot) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
  await page.goto(`http://localhost:${port}/iframe.html?id=design-system-components-datatable-展示--row-auto-height-inline-edit&viewMode=story`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[role="row"][data-row-index]')
  await page.waitForTimeout(500)

  // PRD-0003 = data-row-index="2"(0=PRD-0001, 1=PRD-0002, 2=PRD-0003), Note cell idx 3
  const target = await page.evaluate(() => {
    const cells = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')
    const cell = cells[3]
    if (!cell) return null
    const r = cell.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + 30, cellLeft: r.left, cellTop: r.top, cellRight: r.right, cellBottom: r.bottom }
  })

  // Display cell + column widths (before click)
  const display = await page.evaluate(() => {
    const allHeaders = Array.from(document.querySelectorAll('[role="columnheader"]'))
    const cell = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')[3]
    return {
      cellHeight: cell.getBoundingClientRect().height,
      cellWidth: cell.getBoundingClientRect().width,
      headerWidths: allHeaders.map(h => ({ text: h.textContent?.trim().slice(0, 12), w: Math.round(h.getBoundingClientRect().width) })),
    }
  })

  // Click → edit
  await page.mouse.click(target.x, target.y)
  await page.waitForTimeout(700)

  const edit = await page.evaluate(() => {
    const cell = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')[3]
    const fieldOrTextarea = cell.querySelector('[data-field-mode="edit"], textarea')
    const cellRect = cell.getBoundingClientRect()
    if (!fieldOrTextarea) return { error: 'no edit element' }
    const fr = fieldOrTextarea.getBoundingClientRect()
    return {
      tag: fieldOrTextarea.tagName,
      cellHeight: cellRect.height,
      fieldHeight: fr.height,
      fieldFillsCell: Math.abs(fr.height - cellRect.height) < 2,
      shrinkDelta: cellRect.height - fr.height,
      rows: fieldOrTextarea.getAttribute?.('rows'),
      scrollHeight: fieldOrTextarea.scrollHeight,
    }
  })

  await page.screenshot({
    path: join(OUT, screenshot),
    clip: { x: Math.max(0, target.cellLeft - 30), y: Math.max(0, target.cellTop - 30), width: Math.min(700, target.cellRight - target.cellLeft + 60), height: 300 },
  })

  console.log(`── ${label} ──`)
  console.log(JSON.stringify({ display, edit }, null, 2))
  await page.close()
}

await probePRD0003('v9 baseline (db269c7)', 7001, 'v9-prd0003-edit.png')
await probePRD0003('current (810b1f5)',     7002, 'cur-prd0003-edit.png')

await browser.close()
v9Server.close()
curServer.close()
