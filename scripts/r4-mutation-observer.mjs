// R4 — Instrument page with MutationObserver + Performance Observer
// Captures every DOM mutation of role=row + every paint frame from page lifecycle start
import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()

// CDP CPU throttle 6x
const client = await ctx.newCDPSession(page)
await client.send('Emulation.setCPUThrottlingRate', { rate: 6 })

// addInitScript runs BEFORE any page JS loads
await page.addInitScript(() => {
  window.__R4_LOG = []
  const log = (event, data) => {
    window.__R4_LOG.push({ t: performance.now(), event, ...data })
  }

  // Performance: track every paint
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-paint' || entry.name === 'first-contentful-paint') {
            log('paint', { name: entry.name })
          }
        }
      }).observe({ type: 'paint', buffered: true })
    } catch (e) { /* noop */ }
  }

  // MutationObserver — track row count changes
  const startObserver = () => {
    const obs = new MutationObserver(() => {
      const rows = document.querySelectorAll('[role="row"][aria-rowindex]').length
      const tableEl = document.querySelector('[role="table"]')
      const tableH = tableEl?.getBoundingClientRect().height ?? null
      log('mutation', { rows, tableH })
    })
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver)
  } else {
    startObserver()
  }

  // RAF: log every animation frame for first 60 frames
  let rafCount = 0
  const rafLoop = () => {
    if (rafCount >= 60) return
    rafCount++
    const rows = document.querySelectorAll('[role="row"][aria-rowindex]').length
    const tableEl = document.querySelector('[role="table"]')
    const tableH = tableEl?.getBoundingClientRect().height ?? null
    log('raf', { frame: rafCount, rows, tableH })
    requestAnimationFrame(rafLoop)
  }
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(rafLoop)
})

const id = 'design-system-components-datatable-展示--with-bulk-actions'
await page.goto(`http://localhost:6006/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'load' })
await page.waitForTimeout(2500)

const log = await page.evaluate(() => window.__R4_LOG || [])

// Filter for transitions where rows count or tableH change
const events = log.sort((a, b) => a.t - b.t)
console.log(`\n=== Total instrumented events: ${events.length} ===\n`)

// Show row count progression
let prevRows = -1
const transitions = []
for (const e of events) {
  if (e.rows !== undefined && e.rows !== prevRows) {
    transitions.push({ t_ms: e.t.toFixed(1), event: e.event, rows: e.rows, tableH: e.tableH, frame: e.frame })
    prevRows = e.rows
  }
}

console.log('=== Row count transitions ===')
console.table(transitions.slice(0, 30))

// Show table height progression
let prevH = -1
const hTrans = []
for (const e of events) {
  if (e.tableH !== undefined && e.tableH !== null && e.tableH !== prevH) {
    hTrans.push({ t_ms: e.t.toFixed(1), event: e.event, tableH: e.tableH, rows: e.rows })
    prevH = e.tableH
  }
}

console.log('\n=== Table height transitions ===')
console.table(hTrans.slice(0, 30))

// Show first 10 RAF frames
console.log('\n=== First 10 RAF frames ===')
const rafs = events.filter(e => e.event === 'raf').slice(0, 10)
console.table(rafs.map(r => ({ t: r.t.toFixed(1), frame: r.frame, rows: r.rows, tableH: r.tableH })))

await browser.close()
