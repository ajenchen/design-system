// R4 story-switch repro — user clue: 只有從其他 story 切到 with-bulk-actions 才有 animation
// reload 同 story 沒事 → 故必須走 Storybook story-switch path,不能直接 navigate
import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()

// CDP CPU 6x slowdown
const client = await ctx.newCDPSession(page)
await client.send('Emulation.setCPUThrottlingRate', { rate: 6 })

// addInitScript 在每次新 doc 都會跑(reload 重跑;同 iframe story-switch 不會重跑 — 這正是我們要的:在 first nav 安裝 observer,后续 story-switch 觀察)
await page.addInitScript(() => {
  window.__R4_LOG = []
  const log = (event, data) => {
    window.__R4_LOG.push({ t: performance.now(), event, ...data })
  }

  const sample = () => {
    const rows = document.querySelectorAll('[role="row"][aria-rowindex]').length
    const tableEl = document.querySelector('[role="table"]')
    const tableH = tableEl?.getBoundingClientRect().height ?? null
    return { rows, tableH }
  }

  const obs = new MutationObserver(() => log('mutation', sample()))
  const startObserver = () => {
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'aria-rowindex'] })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver)
  else startObserver()

  // Continuous RAF — 不限 frame 數,持續到 page close
  const rafLoop = () => {
    const s = sample()
    log('raf', s)
    requestAnimationFrame(rafLoop)
  }
  if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(rafLoop)

  // Mark — 讓我們知道 navigation phase 切換點
  window.__R4_MARK = (name) => log('mark', { name })
})

// === Phase 1: 先載入「另一個」story(模擬 user 從別處切過來的情境)===
// 用一個簡單 story 當起點 — Button 之類沒有 DataTable 的
const startStoryId = 'design-system-components-button-展示--default'
console.log('[phase1] navigate to start story (Button)')
await page.goto(`http://localhost:6006/iframe.html?id=${startStoryId}&viewMode=story`, { waitUntil: 'load' })
await page.waitForTimeout(1000)
await page.evaluate(() => window.__R4_MARK?.('phase1-button-loaded'))

// === Phase 2: in-iframe 切到 WithBulkActions(透過修改 URL search 但不 reload)===
// Storybook iframe 內 history.replaceState + 觸發 channel?其實最直接:導到新 URL 但 iframe 同 origin 同 document
// 但 iframe.html 改 ?id 是 full reload(不是同 iframe re-render)
// 真實 user pattern:在 Storybook 主頁(manager)點 sidebar — 但 iframe 仍同源同 doc;manager 透過 postMessage 告 iframe 切 story
// 折衷:直接 from iframe.html 切到新 ?id 用 page.goto — 這是 RELOAD,但比起最初的「直接 navigate」我們在 phase 1 已經 warm 過 storybook bundle,phase 2 navigate 會復用 module cache → 接近 user 體感
const targetStoryId = 'design-system-components-datatable-展示--with-bulk-actions'
console.log('[phase2] navigate to WithBulkActions (warm cache)')
const t0 = Date.now()
await page.goto(`http://localhost:6006/iframe.html?id=${targetStoryId}&viewMode=story`, { waitUntil: 'load' })
const navMs = Date.now() - t0
console.log(`[phase2] load done in ${navMs}ms`)
await page.evaluate(() => window.__R4_MARK?.('phase2-datatable-loaded'))
await page.waitForTimeout(3000)

// === Phase 3: 真正的 in-place story switch — 用 manager URL ===
// 改用 /index.html 開,讓 storybook router 處理 story switch
console.log('[phase3] manager-mode start: open Button story via manager')
await page.goto(`http://localhost:6006/?path=/story/${startStoryId.replace(/^design-system-components-/, 'components-')}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

// 重新安裝 instrumentation 在 iframe 內(因為 iframe 是 child context)
const frame = page.frames().find(f => f.url().includes('iframe.html'))
if (frame) {
  console.log(`[phase3] iframe url=${frame.url()}`)
  await frame.evaluate(() => {
    window.__R4_LOG = window.__R4_LOG || []
    const log = (event, data) => window.__R4_LOG.push({ t: performance.now(), event, ...data })
    const sample = () => {
      const rows = document.querySelectorAll('[role="row"][aria-rowindex]').length
      const tableEl = document.querySelector('[role="table"]')
      const tableH = tableEl?.getBoundingClientRect().height ?? null
      return { rows, tableH }
    }
    if (!window.__R4_OBS) {
      window.__R4_OBS = new MutationObserver(() => log('mutation', sample()))
      window.__R4_OBS.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
    }
    const rafLoop = () => { log('raf', sample()); requestAnimationFrame(rafLoop) }
    requestAnimationFrame(rafLoop)
    window.__R4_MARK = (n) => log('mark', { name: n })
  })
}

// 透過 manager 點 sidebar 切到 WithBulkActions(這是真實 user pattern)
console.log('[phase3] manager: click sidebar → WithBulkActions')
// Storybook sidebar item — find by partial text
try {
  await page.waitForSelector('a[href*="datatable"]', { timeout: 5000 })
  // expand DataTable group
  const dtGroup = page.locator('button:has-text("DataTable")').first()
  if (await dtGroup.count() > 0) await dtGroup.click().catch(() => {})
  await page.waitForTimeout(500)
  const withBulk = page.locator('a:has-text("With Bulk Actions"), a:has-text("WithBulkActions")').first()
  await page.evaluate(() => window.__R4_MARK?.('before-sidebar-click'))
  if (frame) await frame.evaluate(() => window.__R4_MARK?.('iframe-before-switch'))
  await withBulk.click()
  console.log('[phase3] clicked sidebar item — in-place switch in progress')
  await page.waitForTimeout(3000)
  if (frame) await frame.evaluate(() => window.__R4_MARK?.('iframe-after-switch-3s'))
} catch (e) {
  console.log(`[phase3] sidebar click failed: ${e.message}`)
}

// === Extract logs from iframe ===
const iframeLog = frame ? await frame.evaluate(() => window.__R4_LOG || []) : []
const events = iframeLog.sort((a, b) => a.t - b.t)
console.log(`\n=== iframe events captured: ${events.length} ===\n`)

// 找到 'iframe-before-switch' mark,從那點開始看
const switchIdx = events.findIndex(e => e.event === 'mark' && e.name === 'iframe-before-switch')
const slice = switchIdx >= 0 ? events.slice(switchIdx) : events
console.log(`Slicing from before-switch mark (idx=${switchIdx}), ${slice.length} events after switch\n`)

// row count + tableH transitions
let prevR = -1, prevH = -1
const trans = []
for (const e of slice) {
  const dR = e.rows !== undefined && e.rows !== prevR
  const dH = e.tableH !== undefined && e.tableH !== prevH
  if (dR || dH || e.event === 'mark') {
    trans.push({
      t_ms: (e.t - slice[0].t).toFixed(1),
      event: e.event,
      rows: e.rows ?? '-',
      tableH: e.tableH ?? '-',
      mark: e.name ?? ''
    })
    if (e.rows !== undefined) prevR = e.rows
    if (e.tableH !== undefined) prevH = e.tableH
  }
}
console.log('=== Transitions after sidebar-switch ===')
console.table(trans.slice(0, 50))

await browser.close()
