import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright'
import {
  executeVisualInteraction,
  normalizeVisualInteraction,
} from './lib/visual-audit-interaction.mjs'

test('visual interaction manifest contract is closed and hover-only', () => {
  assert.deepEqual(
    normalizeVisualInteraction({ action: 'hover', selector: '[data-visual-hover-target]' }),
    { action: 'hover', selector: '[data-visual-hover-target]' },
  )
  for (const invalid of [
    null,
    [],
    {},
    { action: 'click', selector: 'button' },
    { action: 'hover' },
    { action: 'hover', selector: '' },
    { action: 'hover', selector: ' button' },
    { action: 'hover', selector: 'button', delay: 1 },
  ]) {
    assert.throws(
      () => normalizeVisualInteraction(invalid),
      /visual interaction contract:/,
    )
  }
})

test('visual hover uses a real unique Playwright pointer target and fails closed otherwise', async (t) => {
  const browser = await chromium.launch()
  t.after(() => browser.close())
  const page = await browser.newPage()

  await page.setContent(`
    <style>
      [data-visual-hover-target] { color: rgb(0, 0, 0); }
      [data-visual-hover-target]:hover { color: rgb(255, 0, 0); }
    </style>
    <button data-visual-hover-target>Expand</button>
  `)
  const result = await executeVisualInteraction(
    page,
    { action: 'hover', selector: '[data-visual-hover-target]' },
    { settleMs: 0 },
  )
  assert.deepEqual(result, {
    action: 'hover',
    selector: '[data-visual-hover-target]',
    matched: 1,
    hoverVerified: true,
    verification: 'trusted-pointer-hit',
    hitTarget: 'target',
    settleMs: 0,
  })
  assert.equal(
    await page.locator('[data-visual-hover-target]').evaluate((element) => getComputedStyle(element).color),
    'rgb(255, 0, 0)',
  )

  await page.setContent('<button>Missing marker</button>')
  await assert.rejects(
    executeVisualInteraction(page, { action: 'hover', selector: '[data-visual-hover-target]' }),
    /must match exactly 1 target; matched 0/,
  )

  await page.setContent('<button data-visual-hover-target>One</button><button data-visual-hover-target>Two</button>')
  await assert.rejects(
    executeVisualInteraction(page, { action: 'hover', selector: '[data-visual-hover-target]' }),
    /must match exactly 1 target; matched 2/,
  )

  await assert.rejects(
    executeVisualInteraction(page, { action: 'hover', selector: 'button[' }),
    /invalid selector/,
  )
})
