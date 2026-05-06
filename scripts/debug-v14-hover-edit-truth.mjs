#!/usr/bin/env node
// 量測 hover + edit 兩 state 的真實 box / border / outline 位置
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')
const OUT = join(ROOT, '.claude/snapshots/v14-hover-edit-truth')
mkdirSync(OUT, { recursive: true })

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(6067, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 4 })

await page.goto('http://localhost:6067/iframe.html?id=design-system-components-datatable-展示--row-auto-height-inline-edit&viewMode=story', { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

// 找 PRD-0003 row idx 2 Note cell(idx 3)
const target = await page.evaluate(() => {
  const cells = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')
  const cell = cells[3]
  if (!cell) return null
  const r = cell.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + 30, cellLeft: r.left, cellRight: r.right, cellTop: r.top, cellBottom: r.bottom }
})

// === HOVER state（mouse on cell, no click）===
await page.mouse.move(target.x, target.y)
await page.waitForTimeout(400)

const hoverM = await page.evaluate(() => {
  const cell = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')[3]
  const cs = window.getComputedStyle(cell)
  const r = cell.getBoundingClientRect()
  // neighbor cell on the LEFT
  const prevCell = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')[2]
  const prevR = prevCell.getBoundingClientRect()
  const prevCs = window.getComputedStyle(prevCell)
  return {
    cell: {
      paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom,
      borderLeftWidth: cs.borderLeftWidth, borderRightWidth: cs.borderRightWidth,
      borderRightColor: cs.borderRightColor,
      outlineWidth: cs.outlineWidth, outlineOffset: cs.outlineOffset, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor,
      rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height },
    },
    prevCell: {
      borderRightWidth: prevCs.borderRightWidth,
      borderRightColor: prevCs.borderRightColor,
      rect: { left: prevR.left, right: prevR.right },
    },
    gridGap: r.left - prevR.right, // ideally 0(adjacent borders share pixel)
  }
})

await page.screenshot({ path: join(OUT, 'hover-state.png'), clip: { x: target.cellLeft - 30, y: target.cellTop - 30, width: target.cellRight - target.cellLeft + 60, height: target.cellBottom - target.cellTop + 60 } })

// === EDIT state（click cell to enter edit）===
await page.mouse.click(target.x, target.y)
await page.waitForTimeout(700)

const editM = await page.evaluate(() => {
  const cell = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')[3]
  const cs = window.getComputedStyle(cell)
  const cellR = cell.getBoundingClientRect()
  const field = cell.querySelector('[data-field-mode="edit"]')
  const fcs = field ? window.getComputedStyle(field) : null
  const fr = field ? field.getBoundingClientRect() : null
  const prevCell = document.querySelectorAll('[role="row"][data-row-index="2"] [role="cell"]')[2]
  const prevR = prevCell.getBoundingClientRect()
  return {
    cell: {
      paddingInline: cs.paddingInline, paddingBlock: cs.paddingBlock,
      borderRightWidth: cs.borderRightWidth,
      rect: { left: cellR.left, right: cellR.right, top: cellR.top, bottom: cellR.bottom },
    },
    field: field ? {
      borderLeftWidth: fcs.borderLeftWidth, borderRightWidth: fcs.borderRightWidth,
      borderTopWidth: fcs.borderTopWidth, borderBottomWidth: fcs.borderBottomWidth,
      borderColor: fcs.borderColor,
      paddingLeft: fcs.paddingLeft, paddingRight: fcs.paddingRight,
      paddingTop: fcs.paddingTop, paddingBottom: fcs.paddingBottom,
      position: fcs.position,
      rect: { left: fr.left, right: fr.right, top: fr.top, bottom: fr.bottom, width: fr.width, height: fr.height },
    } : null,
    fieldVsCell: field ? {
      leftGap: fr.left - cellR.left,    // ideally 0 if Field border at cell edge
      rightGap: cellR.right - fr.right, // ideally 0
      topGap: fr.top - cellR.top,
      bottomGap: cellR.bottom - fr.bottom,
    } : null,
    fieldVsPrevGrid: field ? fr.left - prevR.right : null, // ideally 0(Field border 直接接 prev cell border-r)
  }
})

await page.screenshot({ path: join(OUT, 'edit-state.png'), clip: { x: target.cellLeft - 30, y: target.cellTop - 30, width: target.cellRight - target.cellLeft + 60, height: target.cellBottom - target.cellTop + 60 } })

console.log('=== HOVER state ===')
console.log(JSON.stringify(hoverM, null, 2))
console.log('=== EDIT state ===')
console.log(JSON.stringify(editM, null, 2))

await browser.close()
server.close()
