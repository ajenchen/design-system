// Keyboard drag probe — verify dnd-kit KeyboardSensor 預設 25px 箭頭 stepping 在
// 砍掉 sortableKeyboardCoordinates 後仍可 launch + reorder row。
// 對 commit f24998f 的 Step 4.6 補測。
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()

// 列拖曳重排（含釘選欄）story
const storyId = 'design-system-components-datatable-展示--row-drag-interactive'
const url = `http://localhost:6006/iframe.html?id=${storyId}&viewMode=story`
console.log(`[1] load: ${url}`)
await page.goto(url, { waitUntil: 'load', timeout: 20000 })
await page.waitForTimeout(2000)

// Capture initial row order
const initialOrder = await page.$$eval('[role="row"][data-sortable-row-id]', els =>
  Array.from(new Set(els.map(e => e.dataset.sortableRowId)))
)
console.log('[2] initial row order:', initialOrder.slice(0, 6))

// Hover first row → reveals portal'd drag handle button
const firstRow = await page.$('[role="row"][data-sortable-row-id]')
if (!firstRow) { console.error('[FAIL] no row found'); await browser.close(); process.exit(1) }
await firstRow.hover()
await page.waitForTimeout(500)

// Drag handle is portal'd outside row → query whole document by aria-label
const targetHandle = await page.$('button[aria-label="拖曳重排此列"]')
if (!targetHandle) {
  console.error('[FAIL] No drag handle button found (handle 應該 portal 到 table 外,aria-label="拖曳重排此列")')
  // Debug: list all buttons
  const allButtons = await page.$$eval('button', els => els.map(b => b.getAttribute('aria-label') || b.textContent?.trim().slice(0, 30)).slice(0, 20))
  console.log('available buttons aria-label:', allButtons)
  await browser.close()
  process.exit(1)
}
await targetHandle.focus()
await page.waitForTimeout(200)

const focused = await page.evaluate(() => document.activeElement?.tagName + '.' + (document.activeElement?.className || '').slice(0, 40))
console.log('[3] focused element:', focused)

// Activate keyboard drag — Space (dnd-kit default activator)
console.log('[4] press Space → activate keyboard drag')
await page.keyboard.press('Space')
await page.waitForTimeout(400)

// Detect drag overlay appeared
const overlayExists = await page.$eval('body', () => !!document.querySelector('[role="row"]') && document.body.style.cursor !== '').catch(() => null)
console.log('[4.1] drag started?:', overlayExists !== null)

// Press ArrowDown 3x — should move active row down by 3 step (25px each)
console.log('[5] ArrowDown × 3')
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(150)
}

// Confirm drop
console.log('[6] press Space → drop')
await page.keyboard.press('Space')
await page.waitForTimeout(800)

// Capture new row order
const finalOrder = await page.$$eval('[role="row"][data-sortable-row-id]', els =>
  Array.from(new Set(els.map(e => e.dataset.sortableRowId)))
)
console.log('[7] final row order:', finalOrder.slice(0, 6))

// Compare
const reordered = JSON.stringify(initialOrder) !== JSON.stringify(finalOrder)
console.log(`\n=== Result ===`)
console.log(`initial: ${initialOrder.slice(0, 4).join(' → ')}`)
console.log(`final:   ${finalOrder.slice(0, 4).join(' → ')}`)
console.log(`reordered: ${reordered ? '✅ YES — keyboard drag works' : '❌ NO — keyboard drag did NOT reorder'}`)

await browser.close()
process.exit(reordered ? 0 : 1)
