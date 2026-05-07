// R4 in-iframe story-switch via Storybook channel(模擬 user 點 sidebar)
// Storybook iframe 同 doc + channel.emit('setCurrentStory') → 不 reload,只 unmount+remount React tree
import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const client = await ctx.newCDPSession(page)
await client.send('Emulation.setCPUThrottlingRate', { rate: 6 })

// addInitScript 安裝 instrumentation(在每次 doc load 都跑;in-iframe story-switch 不會重跑 — 但 observer 仍存活)
await page.addInitScript(() => {
  window.__R4_LOG = []
  const log = (e, d) => window.__R4_LOG.push({ t: performance.now(), event: e, ...d })
  const sample = () => {
    const rows = document.querySelectorAll('[role="row"][aria-rowindex]').length
    const tableEl = document.querySelector('[role="table"]')
    return { rows, tableH: tableEl?.getBoundingClientRect().height ?? null }
  }
  const start = () => {
    const obs = new MutationObserver(() => log('mut', sample()))
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
    const raf = () => { log('raf', sample()); requestAnimationFrame(raf) }
    requestAnimationFrame(raf)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
  window.__R4_MARK = (n) => log('mark', { name: n })
})

// Phase 1: load Button story FIRST(這樣 storybook router 在 iframe 內 active)
const buttonId = 'design-system-components-button-展示--default'
console.log('[1] load Button story (warm storybook router)')
await page.goto(`http://localhost:6006/iframe.html?id=${buttonId}&viewMode=story`, { waitUntil: 'load' })
await page.waitForTimeout(1500)
await page.evaluate(() => window.__R4_MARK?.('phase1-button-loaded'))

// Phase 2: in-iframe channel switch — Storybook v7+ exposes __STORYBOOK_PREVIEW__
console.log('[2] in-iframe channel switch to WithBulkActions')
const switchResult = await page.evaluate(async (targetId) => {
  // Try storybook v7+ preview API
  const preview = window.__STORYBOOK_PREVIEW__
  const channel = window.__STORYBOOK_ADDONS_CHANNEL__ || preview?.channel
  if (!channel) return { ok: false, reason: 'no channel', keys: Object.keys(window).filter(k => k.includes('STORYBOOK')) }
  window.__R4_MARK?.('before-channel-emit')
  channel.emit('setCurrentStory', { storyId: targetId, viewMode: 'story' })
  return { ok: true, hasPreview: !!preview, channelType: channel.constructor?.name }
}, 'design-system-components-datatable-展示--with-bulk-actions')
console.log('[2] switch result:', JSON.stringify(switchResult))

await page.waitForTimeout(4000)
await page.evaluate(() => window.__R4_MARK?.('after-switch-4s'))

// Extract
const events = await page.evaluate(() => window.__R4_LOG || [])
console.log(`\n=== Total events: ${events.length} ===`)

const switchMark = events.findIndex(e => e.event === 'mark' && e.name === 'before-channel-emit')
const after = switchMark >= 0 ? events.slice(switchMark) : events
console.log(`Events after channel-emit: ${after.length}\n`)

// Print transitions(rows or tableH change)
let pR = -1, pH = -1
const trans = []
const t0 = after[0]?.t ?? 0
for (const e of after) {
  const dR = e.rows !== undefined && e.rows !== pR
  const dH = e.tableH !== undefined && e.tableH !== pH
  if (dR || dH || e.event === 'mark') {
    trans.push({
      ms: (e.t - t0).toFixed(1),
      ev: e.event,
      rows: e.rows ?? '-',
      tableH: typeof e.tableH === 'number' ? e.tableH.toFixed(1) : (e.tableH ?? '-'),
      mark: e.name || ''
    })
    if (e.rows !== undefined) pR = e.rows
    if (e.tableH !== undefined) pH = e.tableH
  }
}
console.log('=== Transitions after channel-emit ===')
console.table(trans.slice(0, 60))
console.log(`Total transitions: ${trans.length}`)

await browser.close()
