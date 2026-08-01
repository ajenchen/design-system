import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { chromium } from 'playwright'
import {
  executeVisualInteraction,
  normalizeVisualInteraction,
} from './lib/visual-audit-interaction.mjs'
import {
  createRenderHealthMonitor,
  createStorybookRenderHealthMonitor,
} from './lib/storybook-render-health.mjs'

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

test('Storybook render health rejects empty canvases and critical asset failures', async (t) => {
  const browser = await chromium.launch()
  t.after(() => browser.close())

  const page = await browser.newPage()
  const monitor = createStorybookRenderHealthMonitor(page)
  await page.setContent('<div id="storybook-root"><button>Rendered story</button></div>')
  assert.deepEqual(await monitor.assertHealthy({ label: 'healthy-story' }), {
    root: 'rendered',
    criticalFailures: 0,
    pageErrors: 0,
  })

  await page.setContent('<div id="storybook-root"></div>')
  await assert.rejects(
    monitor.assertHealthy({ label: 'blank-story', timeoutMs: 50 }),
    /render health:blank-story:empty story root/,
  )

  await page.setContent('<div id="storybook-root"></div><div data-radix-portal><div role="dialog">Portal story</div></div>')
  await monitor.assertHealthy({ label: 'portal-only-story' })
  monitor.dispose()

  const server = createServer((request, response) => {
    if (request.url === '/broken.js') {
      response.writeHead(504, { 'content-type': 'application/javascript' })
      response.end('')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<div id="storybook-root"><button>Looks rendered</button></div><script src="/broken.js"></script>')
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  t.after(() => {
    server.closeAllConnections()
    return new Promise((resolve) => server.close(resolve))
  })

  const brokenPage = await browser.newPage()
  const brokenMonitor = createStorybookRenderHealthMonitor(brokenPage)
  const address = server.address()
  assert(address && typeof address === 'object')
  await brokenPage.goto(`http://127.0.0.1:${address.port}`, { waitUntil: 'domcontentloaded' })
  await assert.rejects(
    brokenMonitor.assertHealthy({ label: 'broken-assets' }),
    /critical resource failures=script 504/,
  )
  brokenMonitor.dispose()
})

test('document render health accepts product roots, rejects infrastructure-only bodies, and catches later page errors', async (t) => {
  const browser = await chromium.launch()
  t.after(() => browser.close())
  const page = await browser.newPage()
  const monitor = createRenderHealthMonitor(page, { mode: 'document' })

  await page.setContent('<main><h1>Product route</h1></main>')
  await monitor.assertHealthy({ label: 'product-route' })

  await page.setContent('<script>globalThis.__booted = true</script>')
  await assert.rejects(
    monitor.assertHealthy({ label: 'blank-product-route', timeoutMs: 50 }),
    /blank-product-route:empty document root/,
  )

  await page.setContent('<div id="root"><button>Interactive product</button></div>')
  await monitor.assertHealthy({ label: 'pre-interaction' })
  await page.evaluate(() => setTimeout(() => { throw new Error('post-interaction crash') }, 0))
  await page.waitForTimeout(20)
  await assert.rejects(
    monitor.assertHealthy({ label: 'post-interaction' }),
    /post-interaction:page exceptions=post-interaction crash/,
  )
  monitor.dispose()
})
