// R4 body-height probe — 量真正會縮的 element(centerBody)+ inline style 變化
// Hypothesis:bodyMaxHeight (line 915-923) 第一次 compute 抓 stale outer rect
// (story-switch from layout=centered → fullscreen 時 parent 還沒收斂)
// 後續 ResizeObserver 修正 → user 看「table 從矮長高」
import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const client = await ctx.newCDPSession(page)
await client.send('Emulation.setCPUThrottlingRate', { rate: 6 })

await page.addInitScript(() => {
  window.__R4_LOG = []
  const log = (e, d) => window.__R4_LOG.push({ t: performance.now(), event: e, ...d })
  const sample = () => {
    const tableEl = document.querySelector('[role="table"]')
    const hscroll = document.querySelector('[data-datatable-hscroll]')
    const outer = document.querySelector('[data-data-table-outer]')
    const rows = document.querySelectorAll('[role="row"][aria-rowindex]').length
    return {
      rows,
      tableH: tableEl?.getBoundingClientRect().height ?? null,
      hscrollH: hscroll?.getBoundingClientRect().height ?? null,
      hscrollMaxH: hscroll?.style?.maxHeight ?? null,
      outerH: outer?.getBoundingClientRect().height ?? null,
    }
  }
  const start = () => {
    const obs = new MutationObserver(() => log('mut', sample()))
    obs.observe(document.documentElement, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['style', 'class']
    })
    const raf = () => { log('raf', sample()); requestAnimationFrame(raf) }
    requestAnimationFrame(raf)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
  window.__R4_MARK = (n) => log('mark', { name: n })
})

// Phase 1: load Button (centered layout)
const buttonId = 'design-system-components-button-展示--default'
console.log('[1] load Button (centered layout)')
await page.goto(`http://localhost:6006/iframe.html?id=${buttonId}&viewMode=story`, { waitUntil: 'load' })
await page.waitForTimeout(1500)

// Phase 2: in-iframe channel switch to WithBulkActions (fullscreen layout)
console.log('[2] channel switch to WithBulkActions (fullscreen layout)')
await page.evaluate(() => {
  window.__R4_MARK?.('before-switch')
  window.__STORYBOOK_ADDONS_CHANNEL__.emit('setCurrentStory', {
    storyId: 'design-system-components-datatable-展示--with-bulk-actions',
    viewMode: 'story'
  })
})
await page.waitForTimeout(4000)
await page.evaluate(() => window.__R4_MARK?.('end-4s'))

// Extract
const events = await page.evaluate(() => window.__R4_LOG || [])
const switchIdx = events.findIndex(e => e.event === 'mark' && e.name === 'before-switch')
const after = switchIdx >= 0 ? events.slice(switchIdx) : events
const t0 = after[0]?.t ?? 0

console.log(`\n=== Events captured: ${events.length} total / ${after.length} after switch ===\n`)

// Show ALL changes to ANY of: rows / tableH / hscrollH / hscrollMaxH / outerH
const fields = ['rows', 'tableH', 'hscrollH', 'hscrollMaxH', 'outerH']
const prev = Object.fromEntries(fields.map(f => [f, undefined]))
const trans = []
for (const e of after) {
  const changed = {}
  let any = false
  for (const f of fields) {
    if (e[f] !== undefined && e[f] !== prev[f]) {
      changed[f] = `${prev[f]}→${typeof e[f] === 'number' ? e[f].toFixed(1) : e[f]}`
      prev[f] = e[f]
      any = true
    }
  }
  if (any || e.event === 'mark') {
    trans.push({
      ms: (e.t - t0).toFixed(1),
      ev: e.event,
      mark: e.name || '',
      ...changed,
    })
  }
}

console.log('=== Transitions (every field change) ===')
console.table(trans.slice(0, 80))
console.log(`Total transitions: ${trans.length}`)

await browser.close()
