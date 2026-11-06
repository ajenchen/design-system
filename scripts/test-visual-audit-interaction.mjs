import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
// 啟動一律走 lib/launch-browser.mjs 的 launchBrowser(2026-09-25):原本三處各自 `chromium.launch()`,少了本 repo 沙箱必要的
// `--single-process --no-sandbox`,在沙箱裡三個瀏覽器測試全部在啟動就 FATAL(mach_port_rendezvous Permission denied),
// 一條斷言都沒跑到(M17:同一個啟動參數散在各處,漏寫的那支就靜靜地什麼都沒驗)。
// 起不來照樣讓測試紅(不走 launchBrowserOrSkip):這是 harness 成員測試,沒有「這個環境略過」的語意。
import { launchBrowser } from './lib/launch-browser.mjs'
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
  const browser = await launchBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage()

  await page.setContent(`
    <style>
      [data-visual-hover-target] { color: rgb(0, 0, 0); }
      [data-visual-hover-target]:hover { color: rgb(255, 0, 0); }
    </style>
    <button data-visual-hover-target>Expand</button>
  `)
  // settle 在滑過之後、指標證明之前跑(這時 :hover 已生效),回傳值原樣放進 settled
  const settle = (p) => p.locator('[data-visual-hover-target]').evaluate((element) => ({ colorAtSettle: getComputedStyle(element).color }))
  const result = await executeVisualInteraction(
    page,
    { action: 'hover', selector: '[data-visual-hover-target]' },
    { settle },
  )
  assert.deepEqual(result, {
    action: 'hover',
    selector: '[data-visual-hover-target]',
    matched: 1,
    hoverVerified: true,
    verification: 'trusted-pointer-hit',
    hitTarget: 'target',
    settled: { colorAtSettle: 'rgb(255, 0, 0)' },
  })
  assert.equal(
    await page.locator('[data-visual-hover-target]').evaluate((element) => getComputedStyle(element).color),
    'rgb(255, 0, 0)',
  )

  await page.setContent('<button>Missing marker</button>')
  await assert.rejects(
    executeVisualInteraction(page, { action: 'hover', selector: '[data-visual-hover-target]' }, { settle }),
    /must match exactly 1 target; matched 0/,
  )

  await page.setContent('<button data-visual-hover-target>One</button><button data-visual-hover-target>Two</button>')
  await assert.rejects(
    executeVisualInteraction(page, { action: 'hover', selector: '[data-visual-hover-target]' }, { settle }),
    /must match exactly 1 target; matched 2/,
  )

  await assert.rejects(
    executeVisualInteraction(page, { action: 'hover', selector: 'button[' }, { settle }),
    /invalid selector/,
  )
})

test('visual hover has no fixed sleep: settle is required, runs before the pointer proof, and its failure is not rewrapped', async (t) => {
  const browser = await launchBrowser()
  t.after(() => browser.close())
  const page = await browser.newPage()
  const hover = { action: 'hover', selector: '[data-visual-hover-target]' }
  await page.setContent('<button data-visual-hover-target style="margin:40px">Expand</button>')

  // 2026-10-14 前是固定睡 settleMs(預設 250ms);現在沒有 settle 就是契約錯誤(不默默退回固定睡眠)
  await assert.rejects(executeVisualInteraction(page, hover), /settle must be a function/)
  await assert.rejects(executeVisualInteraction(page, hover, { settleMs: 250 }), /settle must be a function/)

  // settle 的例外(儀器失效)原樣往上:同一個物件,不被包成「hover failed」契約錯誤
  class InstrumentFailure extends Error {}
  const thrown = new InstrumentFailure('INSTRUMENT-FAIL story「button--dismiss-hover-state」沒有量到 —— 計時器一直在排隊')
  await assert.rejects(executeVisualInteraction(page, hover, { settle: async () => { throw thrown } }), (error) => error === thrown)

  // 指標證明在 settle **之後**才讀:settle 期間目標被移開(拍照那一刻已不在指標下)→ 必須紅;
  // 若證明仍在 settle 之前讀(舊順序),這一題會被當成通過
  await page.setContent('<button data-visual-hover-target style="margin:40px">Expand</button>')
  await assert.rejects(
    executeVisualInteraction(page, hover, {
      settle: (p) => p.locator('[data-visual-hover-target]').evaluate((element) => { element.style.marginLeft = '600px' }),
    }),
    /did not leave a trusted mouse pointer/,
  )
})

test('Storybook render health rejects empty canvases and critical asset failures', async (t) => {
  const browser = await launchBrowser()
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

  // 同一個 page 導覽過去,不另開 browser.newPage():那會開第二個 browser context,而 launchBrowser 的
  // `--single-process` 下第二個 context 當場崩(lib/launch-browser.mjs 檔頭)。前一個 monitor 已 dispose,
  // 新的 monitor 在導覽前掛上,只看得到這一段的請求與例外 —— 隔離程度與原本開新 page 相同。
  const brokenPage = page
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
  const browser = await launchBrowser()
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
