#!/usr/bin/env node
/**
 * Visual verification for DS Devmode addon — covers all 3 unverified items:
 *   1. Position layer renders for `position: absolute` element
 *   2. Canvas redline at small distance(< 8px)— no number label, line only
 *   3. Compact red label visual width verification
 *
 * Each test:
 *   1. Open story
 *   2. Activate addon via toolbar button
 *   3. Pin a target element via dispatchEvent
 *   4. Screenshot full panel + canvas
 */
import { chromium } from 'playwright'
import { launchBrowser } from './lib/launch-browser.mjs'
import fs from 'fs'

const PORT = process.env.SB_PORT || '6006'

const tests = [
  {
    name: 'avatar-status-dot',
    storyId: 'design-system-components-avatar-設計原則--with-badge-overlay-rule',
    targetSelector: '[aria-hidden="true"][class*="absolute"][class*="rounded-full"]',
    desc: 'Avatar status dot — position:absolute, tiny ~8x8',
  },
  {
    name: 'button-link-span',
    storyId: 'design-system-components-button-展示--all-variants',
    targetSelector: 'button:has-text("前往設定") span.px-1',
    desc: 'Button link span — distance interior idiom(parent padding 12 扣後 = 0)',
  },
  {
    name: 'button-itself',
    storyId: 'design-system-components-button-展示--all-variants',
    targetSelector: 'button:has-text("新增")',
    desc: 'Button itself — distance to story container content area',
  },
  {
    name: 'tag-with-border',
    storyId: 'design-system-components-tag-展示--with-icon',
    targetSelector: 'div.inline-flex.rounded-md.border',
    desc: 'Tag — has border-transparent 1px, expects Border 1/1/1/1',
  },
  {
    name: 'far-sibling',
    storyId: 'design-system-components-button-展示--all-variants',
    targetSelector: 'button:has-text("新增")',
    desc: 'Pin 新增 + hover 前往設定(far sibling 600+ px)— check sibling MAX_LINE 一致性',
    siblingHover: 'button:has-text("前往設定")',
  },
]

const browser = await launchBrowser()
fs.mkdirSync('tmp', { recursive: true })

// Extra test:sibling distance(pin 1 element, hover another)
const siblingTest = async (browser) => {
  console.log(`\n=== sibling-distance: pin 新增 button + hover 取消 button → 元件↔元件 distance ===`)
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${PORT}/?path=/story/design-system-components-button-展示--all-variants`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const btn = page.locator('button[title*="DS Devmode"]').first()
  await btn.waitFor({ state: 'visible', timeout: 5000 })
  await btn.click()
  await page.waitForTimeout(500)
  const iframe = page.frameLocator('#storybook-preview-iframe')
  const pinTarget = iframe.locator('button:has-text("新增")').first()
  await pinTarget.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
  await page.waitForTimeout(500)
  const hoverTarget = iframe.locator('button:has-text("取消")').first()
  await hoverTarget.evaluate(el => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true })))
  await page.waitForTimeout(800)
  const iframeRect = await page.locator('#storybook-preview-iframe').boundingBox()
  if (iframeRect) {
    await page.screenshot({
      path: 'tmp/visual-sibling-distance-canvas.png',
      clip: { x: iframeRect.x, y: iframeRect.y, width: Math.min(iframeRect.width, 800), height: 200 },
    })
    console.log('  Canvas: tmp/visual-sibling-distance-canvas.png')
  }
  await ctx.close()
}

for (const t of tests) {
  console.log(`\n=== ${t.name}: ${t.desc} ===`)
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await ctx.newPage()
  const url = `http://localhost:${PORT}/?path=/story/${encodeURIComponent(t.storyId)}`
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  // Activate addon via toolbar button
  const toolbarBtn = page.locator('button[title*="DS Devmode"]').first()
  await toolbarBtn.waitFor({ state: 'visible', timeout: 5000 })
  await toolbarBtn.click()
  await page.waitForTimeout(500)

  // Find target inside iframe + measure
  const iframe = page.frameLocator('#storybook-preview-iframe')
  const target = iframe.locator(t.targetSelector).first()
  const count = await target.count()
  console.log(`  Found ${count} target`)
  if (count === 0) {
    console.log(`  SKIP: no element found`)
    await ctx.close()
    continue
  }

  const measure = await target.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const parent = el.parentElement
    const pr = parent?.getBoundingClientRect()
    return {
      rect: { w: r.width, h: r.height, x: r.left, y: r.top },
      position: cs.position,
      parentRect: pr ? { w: pr.width, h: pr.height } : null,
      distanceLeft: pr ? r.left - pr.left : null,
      distanceRight: pr ? pr.right - r.right : null,
      distanceTop: pr ? r.top - pr.top : null,
      distanceBottom: pr ? pr.bottom - r.bottom : null,
    }
  })
  console.log(`  Element:`, JSON.stringify(measure))

  // Pin via dispatchEvent
  await target.evaluate((el) => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(800)

  // Optional sibling hover for cross-element distance test
  if (t.siblingHover) {
    const sib = iframe.locator(t.siblingHover).first()
    if (await sib.count() > 0) {
      await sib.evaluate(el => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true })))
      await page.waitForTimeout(500)
    }
  }

  // Click DS Devmode tab
  const tab = page.locator('button[role="tab"]:has-text("DS Devmode")').first()
  if (await tab.count() > 0) {
    await tab.click()
    await page.waitForTimeout(500)
  }

  // Capture panel scrolled down to see list/code sections
  // Find the addon panel scrollable container
  const panelScrollResult = await page.evaluate(() => {
    // The DS Devmode panel root is inside [role="tabpanel"] — find scrollable parent
    const heads = Array.from(document.querySelectorAll('div')).filter(d =>
      d.textContent?.startsWith('DS Devmode') && d.children.length >= 2
    )
    if (heads.length === 0) return { ok: false, reason: 'no DS Devmode heading' }
    const head = heads[heads.length - 1]
    let cur = head
    while (cur && cur.scrollHeight <= cur.clientHeight + 5) {
      cur = cur.parentElement
    }
    if (!cur) return { ok: false, reason: 'no scrollable parent' }
    const rect = cur.getBoundingClientRect()
    return { ok: true, rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height }, scrollHeight: cur.scrollHeight }
  })
  console.log(`  Panel scroll info: ${JSON.stringify(panelScrollResult)}`)

  // Resize viewport tall to capture full panel(panel can be long with code section)
  await page.setViewportSize({ width: 1600, height: 1500 })
  await page.waitForTimeout(300)

  // Screenshot full
  const fullPath = `tmp/visual-${t.name}-full.png`
  await page.screenshot({ path: fullPath, fullPage: false })

  // Screenshot canvas iframe directly to see redline overlay
  const iframeRect = await page.locator('#storybook-preview-iframe').boundingBox()
  if (iframeRect) {
    const canvasPath = `tmp/visual-${t.name}-canvas.png`
    await page.screenshot({
      path: canvasPath,
      clip: { x: iframeRect.x, y: iframeRect.y, width: Math.min(iframeRect.width, 800), height: Math.min(iframeRect.height, 400) },
    })
    console.log(`  Canvas: ${canvasPath}`)
  }

  // Screenshot panel anatomy area
  const anatomyRect = await page.evaluate(() => {
    const heads = Array.from(document.querySelectorAll('div'))
      .filter(d => d.textContent?.startsWith('Layer properties'))
    if (heads.length === 0) return null
    const head = heads[heads.length - 1]
    const next = head.nextElementSibling
    if (!next) return null
    const r = next.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return null
    return { x: Math.max(0, r.left - 10), y: Math.max(0, head.getBoundingClientRect().top - 5), w: Math.min(r.width + 20, 1400), h: Math.min(r.height + 50, 350) }
  })
  if (anatomyRect && anatomyRect.w > 0 && anatomyRect.h > 0) {
    const anatomyPath = `tmp/visual-${t.name}-panel.png`
    await page.screenshot({ path: anatomyPath, clip: { x: anatomyRect.x, y: anatomyRect.y, width: anatomyRect.w, height: anatomyRect.h } })
    console.log(`  Panel: ${anatomyPath}`)
  } else {
    console.log(`  Panel: SKIPPED(rect not measurable)`)
  }

  await ctx.close()
}

await siblingTest(browser)

await browser.close()
console.log('\n=== Done ===')
