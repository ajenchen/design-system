// Probe — Cell picker geometry contract baseline(D 路徑 Phase 1)
//
// Purpose:capture pre-implement baseline rect for 6 picker types in display vs edit mode。
// Runs against `column-types` story which has all picker types in one DataTable。
//
// Output:
//   - tmp/cell-picker-geometry/{type}-{mode}.png   (cropped cell screenshot)
//   - tmp/cell-picker-geometry/baseline.json       (rect deltas + raw measurements)
//
// 量測:per cell type 取 row 0 的對應欄位,
//   1. capture display rect(boundingBox)
//   2. click → enter edit mode
//   3. capture edit rect
//   4. compute delta(edit - display)— 偏移量 visualization
//
// 跑法:`npm run storybook` 起服務後 → `node scripts/probe-cell-picker-geometry.mjs`(`STORYBOOK_URL` 可改位址);
//      或對一份建置:`node scripts/probe-cell-picker-geometry.mjs --static=storybook-static`
//      (以 lib/a11y-static-server.mjs 從本次獨佔的快照供檔,並有同源 404 帳本)。
//
// 此 baseline = D 路徑 implement post-fix 的 diff 對照源。Acceptance:每 edge ≤ 0.5 CSS px(codex strict gate)。
//
// **這是探針(工具),不是閘**:不在 CI。但「story 真的畫好了才量」與閘同一個判準(2026-09-25):
// 走 lib/launch-browser.mjs 的 openStory —— Storybook 回報渲染完成(含 play)+ render-health + 9 個被量的格子都出現 +
// 渲染期間的請求全部結束(取代 networkidle)+ 版面連續靜止 N 個影格(取代固定睡 1500ms)。
// 開不起來 → **儀器失效**:點名 story、附 Storybook 錯誤原文與同源 404,exit 1。原本每一格都「找不到格子」被 catch 吞掉,
// 最後照樣印「✓ probe complete — 9 types captured」exit 0(實測刪掉 data-table.stories 的 chunk 就是這樣)。

import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const STORYBOOK_URL = process.env.STORYBOOK_URL || 'http://localhost:6006'
const STATIC_ARG = process.argv.find((a) => a.startsWith('--static='))?.slice('--static='.length)
const OUT_DIR = resolve('tmp/cell-picker-geometry')

// inline-edit story:purpose-built editable cells,cellEditable=true。
const STORY_ID = 'design-system-components-datatable-展示--inline-edit'

// inline-edit story columns map(probe 7 picker types,加 control group string / number 對照)
const PICKER_TYPES = [
  { type: 'select',       colId: 'category' },
  { type: 'multiSelect',  colId: 'tags' },
  { type: 'date',         colId: 'releaseDate' },
  { type: 'time',         colId: 'reminderTime' },
  { type: 'url',          colId: 'url' },
  { type: 'person',       colId: 'owner' },
  { type: 'multiPerson',  colId: 'reviewers' },
  // control group(對照組,期待 delta = 0)
  { type: 'string',       colId: 'name' },
  { type: 'number',       colId: 'qty' },
]

async function captureCellRect(page, cellSelector, label) {
  const handle = await page.$(cellSelector)
  if (!handle) return { error: `not found: ${cellSelector}` }
  const box = await handle.boundingBox()
  return box ? { ...box, label } : { error: 'no boundingBox', label }
}

// Inner content rect — capture position of the first text-bearing element inside cell,
// 這才是 user 視覺感受到的「value 位置」(outer cell 永遠固定,inner content 才會偏)。
async function captureInnerContentRect(page, cellSelector) {
  return await page.evaluate((sel) => {
    const cell = document.querySelector(sel)
    if (!cell) return { error: 'cell not found' }
    // Try Field wrapper first(edit mode 必有);fallback to first deep span/anchor with text
    const fieldWrapper = cell.querySelector('[data-field-mode]')
    if (fieldWrapper) {
      const r = fieldWrapper.getBoundingClientRect()
      return { source: 'data-field-mode', x: r.x, y: r.y, width: r.width, height: r.height }
    }
    // Display branch:深入找第一個有 text 的 leaf(span / a / div)
    const candidates = cell.querySelectorAll('span, a, div')
    for (const c of candidates) {
      const txt = (c.textContent || '').trim()
      if (txt && txt !== '—' && c.children.length === 0) {
        const r = c.getBoundingClientRect()
        return { source: 'leaf-text', x: r.x, y: r.y, width: r.width, height: r.height, sample: txt.slice(0, 30) }
      }
    }
    return { error: 'no inner content found' }
  }, cellSelector)
}

// Verify edit mode engaged — check Field wrapper or popover state
async function verifyEditEngaged(page, cellSelector) {
  return await page.evaluate((sel) => {
    const cell = document.querySelector(sel)
    if (!cell) return { engaged: false, reason: 'cell missing' }
    // 1) Field wrapper data-field-mode="edit"
    if (cell.querySelector('[data-field-mode="edit"]')) {
      return { engaged: true, signal: 'data-field-mode=edit' }
    }
    // 2) Popover open (portal — outside cell)
    const popoverOpen = !!document.querySelector('[role="listbox"][data-state="open"], [role="dialog"][data-state="open"]')
    if (popoverOpen) return { engaged: true, signal: 'popover-portal-open' }
    // 3) input element focused inside cell
    const ae = document.activeElement
    if (ae && cell.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
      return { engaged: true, signal: 'focused-input' }
    }
    return { engaged: false, reason: 'no edit signal' }
  }, cellSelector)
}

// Cell selector: data-column-id matches + nth row(:nth-child rowIndex+2 — row 1 is header)
const cellSelectorOf = ({ colId }, rowIndex = 0) => `[role="row"]:nth-child(${rowIndex + 2}) [data-column-id="${colId}"]`

async function probeCellType(page, { type, colId }, rowIndex = 0) {
  console.log(`\n── ${type} (col=${colId}, row ${rowIndex}) ──`)

  const cellSelector = cellSelectorOf({ colId }, rowIndex)
  const handle = await page.$(cellSelector)
  if (!handle) return { type, error: `cell not located: ${cellSelector}` }

  // 1) DISPLAY mode — capture cell outer + inner content rect
  const displayCell = await captureCellRect(page, cellSelector, 'display-cell')
  const displayInner = await captureInnerContentRect(page, cellSelector)
  await page.screenshot({
    path: resolve(OUT_DIR, `${type}-display.png`),
    clip: { x: Math.max(0, displayCell.x - 4), y: Math.max(0, displayCell.y - 4), width: displayCell.width + 8, height: displayCell.height + 8 },
  })

  // 2) Click cell → enter edit mode
  await page.click(cellSelector)
  // 等「進入編輯」的訊號本身(與下方 verifyEditEngaged 同一組訊號;原本固定睡 500ms)。等不到 → 下方照實記成 edit not engaged
  await page.waitForFunction(isEditEngaged, cellSelector, { timeout: 5000, polling: 'raf' }).catch(() => {})
  // 進入編輯之後的 500ms 不是「已渲染」的代理:元素已出現,等的是浮層的開啟動畫(zoom / fade)走完再截圖
  await page.waitForTimeout(500)

  // 3) Verify edit engaged
  const engaged = await verifyEditEngaged(page, cellSelector)
  if (!engaged.engaged) {
    console.log(`  display-cell:  ${JSON.stringify(displayCell)}`)
    console.log(`  display-inner: ${JSON.stringify(displayInner)}`)
    console.log(`  ⚠ edit not engaged: ${engaged.reason}`)
    return { type, colId, displayCell, displayInner, editEngaged: false, editError: engaged.reason }
  }

  // 4) EDIT mode — capture cell outer + inner content rect
  const editCell = await captureCellRect(page, cellSelector, 'edit-cell')
  const editInner = await captureInnerContentRect(page, cellSelector)
  await page.screenshot({
    path: resolve(OUT_DIR, `${type}-edit.png`),
    clip: { x: Math.max(0, editCell.x - 4), y: Math.max(0, editCell.y - 4), width: editCell.width + 8, height: editCell.height + 8 },
  })

  // 5) delta(inner content edit minus display per edge — 這是 user 視覺看到的偏移)
  const innerDelta = displayInner.error || editInner.error ? null : {
    x:      editInner.x - displayInner.x,
    y:      editInner.y - displayInner.y,
    width:  editInner.width - displayInner.width,
    height: editInner.height - displayInner.height,
    right:  (editInner.x + editInner.width) - (displayInner.x + displayInner.width),
    bottom: (editInner.y + editInner.height) - (displayInner.y + displayInner.height),
  }

  // 6) Esc 取消 edit(下個 type 用)—— 等「離開編輯」的訊號本身;離不開就記下來(下一格的量測可能受影響)
  await page.keyboard.press('Escape')
  const editExited = await page.waitForFunction((sel) => !document.querySelector(sel)?.querySelector('[data-field-mode="edit"]')
    && !document.querySelector('[role="listbox"][data-state="open"], [role="dialog"][data-state="open"]'), cellSelector, { timeout: 5000, polling: 'raf' }).then(() => true, () => false)
  if (!editExited) console.log('  ⚠ Escape 之後 5 秒仍在編輯 / 浮層仍開著')
  // 離開編輯之後的 300ms:等浮層的關閉動畫淡出,免得下一格的截圖拍到它(元素狀態已確認,不是「已渲染」的代理)
  await page.waitForTimeout(300)

  console.log(`  display-cell:  ${JSON.stringify(displayCell)}`)
  console.log(`  display-inner: ${JSON.stringify(displayInner)}`)
  console.log(`  edit-cell:     ${JSON.stringify(editCell)}`)
  console.log(`  edit-inner:    ${JSON.stringify(editInner)}`)
  console.log(`  ✦ INNER DELTA: ${JSON.stringify(innerDelta)}`)

  return { type, colId, displayCell, displayInner, editEngaged: true, editSignal: engaged.signal, editCell, editInner, innerDelta, editExited }
}

// 頁面端:這一格是否已進入編輯(與 verifyEditEngaged 同一組訊號,給 waitForFunction 用)
function isEditEngaged(sel) {
  const cell = document.querySelector(sel)
  if (!cell) return false
  if (cell.querySelector('[data-field-mode="edit"]')) return true
  if (document.querySelector('[role="listbox"][data-state="open"], [role="dialog"][data-state="open"]')) return true
  const ae = document.activeElement
  return !!(ae && cell.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'))
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const server = STATIC_ARG ? await startA11yStaticServer({ rootDirectory: resolve(STATIC_ARG), defaultFile: 'iframe.html' }) : null
  const browser = await launchBrowser()
  try {
    return await run(browser, server)
  } finally {
    await browser.close()
    await server?.stop()
  }
}

async function run(browser, server) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()

  const url = `${server?.origin ?? STORYBOOK_URL}/iframe.html?id=${encodeURIComponent(STORY_ID)}&viewMode=story`
  console.log(`open: ${url}`)
  try {
    await openStory(page, url, {
      // 等被量的每一格本身(9 種欄位的第 0 列)
      waitFor: (selectors) => selectors.every((s) => document.querySelector(s)),
      waitForArg: PICKER_TYPES.map((item) => cellSelectorOf(item, 0)),
      requestsSettled: true, settleFrames: 10, notFound: server?.notFound ?? null,
    })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    // 沒量到 ≠ 量到了:不寫 baseline.json、不印「complete」,exit 1(不是產品裁決)
    console.error(`✗ ${error.message}`)
    if (server?.notFound.length) console.error(`同源 404:${[...new Set(server.notFound)].join(', ')}`)
    process.exitCode = 1
    return
  }

  // Capture full story screenshot for context
  await page.screenshot({ path: resolve(OUT_DIR, '_story-overview.png'), fullPage: false })

  const results = []
  for (const item of PICKER_TYPES) {
    try {
      const r = await probeCellType(page, item, 0)
      results.push(r)
    } catch (e) {
      console.error(`  ✗ ${item.type} error:`, e.message)
      results.push({ type: item.type, error: e.message })
    }
  }

  await writeFile(
    resolve(OUT_DIR, 'baseline.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      storyId: STORY_ID,
      viewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
      pickers: results,
    }, null, 2),
  )

  // 誠實的總數:「captured」只算真的量到 edit 前後的那幾格;edit 沒進入 / 量測出錯的分開列(它們在 baseline.json 裡照樣有紀錄)
  const measured = results.filter((r) => r.editEngaged && !r.error).length
  const notEngaged = results.filter((r) => r.editEngaged === false).length
  const errored = results.filter((r) => r.error).length
  console.log(`\n✓ probe complete — ${results.length} types:${measured} measured / ${notEngaged} edit not engaged / ${errored} errors`)
  console.log(`output: ${OUT_DIR}/`)
  console.log(`baseline: ${OUT_DIR}/baseline.json`)
}

main().catch((e) => { console.error(e); process.exit(1) })
