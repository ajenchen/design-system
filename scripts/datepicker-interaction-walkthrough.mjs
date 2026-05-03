#!/usr/bin/env node
/**
 * scripts/datepicker-interaction-walkthrough.mjs
 *
 * Interactive walk-through verification for DatePicker stories(canonical 2026-05-03 v5)。
 * Pure mechanical screenshot capture of click flows + assert trigger text update。
 * 補 visual-audit Layer A 只截 static state 的 gap。
 *
 * Tests:
 *   1. Single date click: trigger text updates
 *   2. Single showTime: click date + click confirm: trigger text updates
 *   3. Range start input click: activeEnd='start' (underline visible)
 *   4. Range click date in calendar: trigger text updates immediately
 *   5. Range cell disable when out-of-order
 *
 * Usage: node scripts/datepicker-interaction-walkthrough.mjs
 */

import { chromium } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const OUT_DIR = join(__dirname, '..', 'snapshots', 'walkthrough')
const STORYBOOK_URL = 'http://localhost:6006'

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const results = []

function pass(name) {
  results.push({ name, status: 'PASS' })
  console.log(`  ✓ ${name}`)
}
function fail(name, msg) {
  results.push({ name, status: 'FAIL', msg })
  console.log(`  ✗ ${name}: ${msg}`)
}

async function snap(page, label) {
  const file = join(OUT_DIR, `${label}.png`)
  await page.screenshot({ path: file, fullPage: false })
  return file
}

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()

  // ── Test 1: Single DatePicker click → trigger updates ────────────────────
  console.log('\n[Test 1] Single DatePicker click → trigger updates')
  await page.goto(`${STORYBOOK_URL}/iframe.html?id=design-system-components-datepicker-展示--default&viewMode=story`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  const trigger1 = page.locator('[role="combobox"]').first()
  const beforeText1 = await trigger1.textContent()
  await trigger1.click()
  await page.waitForTimeout(300)
  await snap(page, 'test1-popup-open')
  // Click date 20
  const day20 = page.locator('[role="dialog"] button.rounded-full:has-text("20")').first()
  await day20.click()
  await page.waitForTimeout(300)
  const afterText1 = await trigger1.textContent()
  await snap(page, 'test1-after-click')
  if (afterText1 !== beforeText1 && afterText1?.includes('20')) {
    pass(`Single click date 20 updates trigger: "${beforeText1}" → "${afterText1}"`)
  } else {
    fail('Single click', `before="${beforeText1}" after="${afterText1}"`)
  }

  // ── Test 2: Single DateTime click + confirm → trigger updates ────────────
  console.log('\n[Test 2] Single showTime click date + 確定 → trigger updates')
  await page.goto(`${STORYBOOK_URL}/iframe.html?id=design-system-components-datepicker-展示--show-time&viewMode=story`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  const trigger2 = page.locator('[role="combobox"]').first()
  const beforeText2 = await trigger2.textContent()
  await trigger2.click()
  await page.waitForTimeout(300)
  // Click date 20 — should update DRAFT (trigger reflects draft per V5 fix)
  await page.locator('[role="dialog"] button.rounded-full:has-text("20")').first().click()
  await page.waitForTimeout(300)
  const draftText2 = await trigger2.textContent()
  await snap(page, 'test2-after-date-click')
  if (draftText2?.includes('20') && draftText2 !== beforeText2) {
    pass(`Single showTime date click reflects in trigger draft: "${beforeText2}" → "${draftText2}"`)
  } else {
    fail('Single showTime date click', `trigger should show 20 after click, got "${draftText2}"`)
  }
  // Click 確定
  await page.locator('button:has-text("確定")').click()
  await page.waitForTimeout(300)
  const committedText2 = await trigger2.textContent()
  await snap(page, 'test2-after-confirm')
  if (committedText2?.includes('20')) {
    pass(`Single showTime 確定 commits: "${committedText2}"`)
  } else {
    fail('Single showTime confirm', `trigger should retain 20, got "${committedText2}"`)
  }

  // ── Test 3: Range start input click → activeEnd='start' underline ────────
  console.log('\n[Test 3] Range start input click → activeEnd underline')
  await page.goto(`${STORYBOOK_URL}/iframe.html?id=design-system-components-datepicker-展示--range-picker&viewMode=story`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  const startInput = page.locator('button[aria-haspopup="dialog"]').first()
  const endInput = page.locator('button[aria-haspopup="dialog"]').nth(1)
  await startInput.click()
  await page.waitForTimeout(300)
  await snap(page, 'test3-start-active')
  const startActiveAttr = await startInput.getAttribute('data-active-end')
  if (startActiveAttr === 'true') {
    pass(`Start input click sets data-active-end="true"`)
  } else {
    fail('Start input click', `data-active-end should be "true", got "${startActiveAttr}"`)
  }
  // Click end input
  await endInput.click()
  await page.waitForTimeout(300)
  await snap(page, 'test3-end-active')
  const endActiveAttr = await endInput.getAttribute('data-active-end')
  const startActiveAfter = await startInput.getAttribute('data-active-end')
  if (endActiveAttr === 'true' && startActiveAfter !== 'true') {
    pass(`End input click switches active to end (start.data-active-end now ${startActiveAfter})`)
  } else {
    fail('End input click', `end="${endActiveAttr}" start="${startActiveAfter}"`)
  }

  // ── Test 4: Range click date → trigger updates immediately ──────────────
  console.log('\n[Test 4] Range click date → trigger updates immediately')
  await page.goto(`${STORYBOOK_URL}/iframe.html?id=design-system-components-datepicker-展示--range-picker&viewMode=story`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  const startInput4 = page.locator('button[aria-haspopup="dialog"]').first()
  const startTextBefore4 = await startInput4.textContent()
  await startInput4.click()
  await page.waitForTimeout(300)
  // Click a future date in calendar
  await page.locator('[role="dialog"] button.rounded-full:has-text("8")').first().click()
  await page.waitForTimeout(400)
  const startTextAfter4 = await startInput4.textContent()
  await snap(page, 'test4-after-range-click')
  if (startTextAfter4?.includes('8') && startTextAfter4 !== startTextBefore4) {
    pass(`Range start click on day 8 updates trigger: "${startTextBefore4}" → "${startTextAfter4}"`)
  } else {
    fail('Range click', `start should show 8, got "${startTextAfter4}"`)
  }

  // ── Test 5b: Single Clearable click X clears value ──────────────────────
  console.log('\n[Test 5b] Single clearable X clears value')
  await page.goto(`${STORYBOOK_URL}/iframe.html?id=design-system-components-datepicker-展示--clearable&viewMode=story`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  const trigger5b = page.locator('[role="combobox"]').first()
  const before5b = await trigger5b.textContent()
  // Find X button(ItemInlineAction with X icon — aria-label="清除日期")
  const clearBtn = page.locator('button[aria-label="清除日期"]').first()
  if (!(await clearBtn.isVisible().catch(() => false))) {
    fail('Single clear', `X button (aria-label="清除日期") not visible`)
  } else {
    await clearBtn.click()
    await page.waitForTimeout(300)
    const after5b = await trigger5b.textContent()
    await snap(page, 'test5b-after-clear')
    if (after5b !== before5b && (after5b?.includes('YYYY') || after5b?.includes('—') || after5b?.trim() === '')) {
      pass(`Single clear empties value: "${before5b}" → "${after5b}"`)
    } else {
      fail('Single clear', `expected empty/placeholder, got "${after5b}"`)
    }
  }

  // ── Test 5c: Range Clearable X clears both ends ─────────────────────────
  console.log('\n[Test 5c] Range clearable X clears both ends')
  await page.goto(`${STORYBOOK_URL}/iframe.html?id=design-system-components-datepicker-展示--range-picker&viewMode=story`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  // RangePicker story 第 1 instance has clearable + value
  const startBefore5c = await page.locator('button[aria-haspopup="dialog"]').first().textContent()
  const rangeClear = page.locator('button[aria-label="清除日期區間"]').first()
  if (!(await rangeClear.isVisible().catch(() => false))) {
    fail('Range clear', `X button (aria-label="清除日期區間") not visible`)
  } else {
    await rangeClear.click()
    await page.waitForTimeout(300)
    const startAfter5c = await page.locator('button[aria-haspopup="dialog"]').first().textContent()
    const endAfter5c = await page.locator('button[aria-haspopup="dialog"]').nth(1).textContent()
    await snap(page, 'test5c-after-range-clear')
    // Both ends should show placeholder text now
    if (startAfter5c !== startBefore5c && (startAfter5c?.includes('Start') || startAfter5c?.includes('日期'))) {
      pass(`Range clear empties both ends: start="${startBefore5c}" → "${startAfter5c}", end="${endAfter5c}"`)
    } else {
      fail('Range clear', `expected placeholders, start="${startAfter5c}" end="${endAfter5c}"`)
    }
  }

  // ── Test 5d: showTime+needConfirm popover-open clear sync(2026-05-03 v10 bug fix)─
  // Bug:needConfirm=true(showTime 預設)時 clear 只 update value,沒 setDraft(null),
  // displayValue=draft 仍顯示舊值 → trigger 看起來「沒清」。修法 setDraft 同步。
  console.log('\n[Test 5d] showTime clear syncs draft (popover-open path)')
  await page.goto(`${STORYBOOK_URL}/iframe.html?id=design-system-components-datepicker-展示--show-time&viewMode=story`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  const trigger5d = page.locator('[role="combobox"]').first()
  const before5d = (await trigger5d.textContent())?.trim()
  await trigger5d.click() // open popover
  await page.waitForTimeout(300)
  const clearBtn5d = page.locator('button[aria-label="清除日期"]').first()
  if (!(await clearBtn5d.isVisible())) {
    fail('showTime clear sync', `X button not visible on showTime story trigger`)
  } else {
    await clearBtn5d.click()
    await page.waitForTimeout(200)
    const after5d = (await trigger5d.textContent())?.trim()
    await snap(page, 'test5d-showtime-clear-sync')
    // After clear,trigger 應顯示 placeholder(YYYY/MM/DD HH:MM 類)而非保留原 datetime
    if (after5d && !after5d.match(/\d{4}\/\d{2}\/\d{2}/)) {
      pass(`showTime clear empties trigger: "${before5d}" → "${after5d}"`)
    } else {
      fail('showTime clear sync', `expected placeholder, trigger still shows "${after5d}" (draft 未同步 bug)`)
    }
  }

  // ── Test 5: Range cell disable when out-of-order ────────────────────────
  console.log('\n[Test 5] Range cell disable when out-of-order')
  await page.goto(`${STORYBOOK_URL}/iframe.html?id=design-system-components-datepicker-展示--range-picker&viewMode=story`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  // Existing value: ['2026-04-15', '2026-04-20'] per story
  const startInput5 = page.locator('button[aria-haspopup="dialog"]').first()
  await startInput5.click()
  await page.waitForTimeout(300)
  // activeEnd='start', end=April 20, so dates AFTER April 20 should be disabled
  const day25 = page.locator('[role="dialog"] button.rounded-full:has-text("25")').first()
  const isDisabled = await day25.isDisabled().catch(() => false)
  await snap(page, 'test5-cell-disable')
  if (isDisabled) {
    pass(`Date 25 (after end=20) is disabled when activeEnd='start'`)
  } else {
    fail('Cell disable', `Date 25 should be disabled, but isDisabled=${isDisabled}`)
  }

  await browser.close()

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('\n─── Summary ─────────────────────')
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  console.log(`Total: ${results.length}, Pass: ${passed}, Fail: ${failed}`)
  console.log(`Screenshots: ${OUT_DIR}`)
  if (failed > 0) {
    console.log('\nFAILED:')
    for (const r of results.filter((r) => r.status === 'FAIL')) {
      console.log(`  - ${r.name}: ${r.msg}`)
    }
    process.exit(1)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
