import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()

await page.addInitScript(() => {
  window.__R4_INIT_T = performance.now()
  window.__R4_LOG = ['init at ' + performance.now()]
})

const buttonId = 'design-system-components-button-展示--default'
await page.goto(`http://localhost:6006/iframe.html?id=${buttonId}&viewMode=story`, { waitUntil: 'load' })

const before = await page.evaluate(() => ({ logLen: window.__R4_LOG?.length, t: window.__R4_INIT_T }))
console.log('[before switch]', before)

await page.evaluate(() => {
  const ch = window.__STORYBOOK_ADDONS_CHANNEL__
  ch.emit('setCurrentStory', { storyId: 'design-system-components-datatable-展示--with-bulk-actions', viewMode: 'story' })
})
await page.waitForTimeout(2000)

const after = await page.evaluate(() => ({
  logLen: window.__R4_LOG?.length,
  initT: window.__R4_INIT_T,
  url: location.href,
  hasTable: !!document.querySelector('[role="table"]'),
  rows: document.querySelectorAll('[role="row"][aria-rowindex]').length
}))
console.log('[after switch]', after)

await browser.close()
