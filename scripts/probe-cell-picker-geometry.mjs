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
// 跑法:`npm run storybook` 起服務後 → `node scripts/probe-cell-picker-geometry.mjs`。
//
// 此 baseline = D 路徑 implement post-fix 的 diff 對照源。Acceptance:每 edge ≤ 0.5 CSS px(codex strict gate)。

import { chromium } from 'playwright'
import { launchBrowser } from './lib/launch-browser.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const STORYBOOK_URL = process.env.STORYBOOK_URL || 'http://localhost:6006'
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

async function probeCellType(page, { type, colId }, rowIndex = 0) {
  console.log(`\n── ${type} (col=${colId}, row ${rowIndex}) ──`)

  // Cell selector: data-column-id matches + nth row(:nth-child rowIndex+2 — row 1 is header)
  const cellSelector = `[role="row"]:nth-child(${rowIndex + 2}) [data-column-id="${colId}"]`
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

  // 6) Esc 取消 edit(下個 type 用)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  console.log(`  display-cell:  ${JSON.stringify(displayCell)}`)
  console.log(`  display-inner: ${JSON.stringify(displayInner)}`)
  console.log(`  edit-cell:     ${JSON.stringify(editCell)}`)
  console.log(`  edit-inner:    ${JSON.stringify(editInner)}`)
  console.log(`  ✦ INNER DELTA: ${JSON.stringify(innerDelta)}`)

  return { type, colId, displayCell, displayInner, editEngaged: true, editSignal: engaged.signal, editCell, editInner, innerDelta }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await launchBrowser()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()

  const url = `${STORYBOOK_URL}/iframe.html?id=${STORY_ID}&viewMode=story`
  console.log(`open: ${url}`)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1500)

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

  console.log(`\n✓ probe complete — ${results.length} types captured`)
  console.log(`output: ${OUT_DIR}/`)
  console.log(`baseline: ${OUT_DIR}/baseline.json`)

  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
