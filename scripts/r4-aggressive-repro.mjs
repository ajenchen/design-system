// R4 aggressive repro — sub-frame interval + CPU throttle + frame screenshot
import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()

// CDP throttle CPU 4x slowdown(放大 timing 差異 — user environment slower than headless)
const client = await ctx.newCDPSession(page)
await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })

const id = 'design-system-components-datatable-展示--with-bulk-actions'
const startNav = Date.now()
await page.goto(`http://localhost:6006/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'commit' })
const navMs = Date.now() - startNav
console.log(`[nav] commit at ${navMs}ms`)

// Sample every 10ms for first 2000ms (200 samples)
const samples = []
const startProbe = Date.now()
while (Date.now() - startProbe < 2000) {
  const t = Date.now() - startProbe
  const rect = await page.locator('[role="table"]').first().boundingBox().catch(() => null)
  const rowCount = await page.locator('[role="row"][aria-rowindex]').count().catch(() => 0)
  const bodyH = await page.locator('[data-datatable-hscroll]').first().boundingBox().catch(() => null)
  const outerH = await page.locator('[data-data-table-outer]').first().boundingBox().catch(() => null)
  samples.push({
    t,
    table_h: rect?.height ?? 'no-table',
    rows: rowCount,
    body_h: bodyH?.height ?? 'no-body',
    outer_h: outerH?.height ?? 'no-outer',
  })
  await page.waitForTimeout(10)
}

// Find any value transitions (where any field changes between samples)
console.log('\n=== TRANSITIONS (frames where row count / table height changed) ===')
const transitions = []
for (let i = 1; i < samples.length; i++) {
  const prev = samples[i - 1]
  const cur = samples[i]
  const changed = []
  if (prev.table_h !== cur.table_h) changed.push(`table_h ${prev.table_h}→${cur.table_h}`)
  if (prev.rows !== cur.rows) changed.push(`rows ${prev.rows}→${cur.rows}`)
  if (prev.body_h !== cur.body_h) changed.push(`body_h ${prev.body_h}→${cur.body_h}`)
  if (changed.length > 0) {
    transitions.push({ t: cur.t, changes: changed.join(' | ') })
  }
}

if (transitions.length === 0) {
  console.log('NO TRANSITIONS — values stable from t=0 to t=2000ms')
  // First sample
  console.log('First sample:', JSON.stringify(samples[0]))
  console.log('Last sample:', JSON.stringify(samples[samples.length - 1]))
} else {
  console.table(transitions.slice(0, 30))
  console.log(`Total transitions: ${transitions.length}`)
}

// Screenshot grid for visual verification
for (const t of [0, 100, 200, 400, 800]) {
  // Find sample closest to t
  await page.waitForTimeout(10)
}

await browser.close()
