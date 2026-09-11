#!/usr/bin/env node
/**
 * Storybook docs 生命週期競態閘(2026-09-10;user:「剛進 storybook 時,點進範例裡,很常會出現此時不應該出現的選單在左上角…重新整理又會變正常」)
 *
 * 根因(Storybook 8.6.18,`@storybook/core/dist/preview-api/index.js:4985-5000`):`CsfDocsRender.renderToElement` 先 `await` DocsRenderer chunk、
 * `DocsRenderer.render` 再 `await` @mdx-js/react chunk,兩段 await 之後都不再檢查這次 render 是否已被 teardown;teardownRender 要等第一段 await
 * 之後才掛上,所以 user 在 Docs 頁載入中點進 story 時 teardown 根本沒東西可取消 → docs 在 `#storybook-docs[hidden]` 裡渲染成殭屍,
 * 裡面預設開啟的浮層(AgentPanel「歷史浮層開啟」快照)portal 到 body、錨點 0×0 → 定位到視窗左上角 (0, 8) 還搶焦點,直到 reload。
 * 守衛在 `packages/storybook-config/preview.tsx` 的 `docs.renderer`(render 前後看 `#storybook-docs` 是否已被 View 藏起來)。
 *
 * 量法(真實 manager UI):把 DocsRenderer chunk 延遲 3 秒 → 從 task-assistant 進站 → 點側欄的 AgentPanel 節點(開 Docs)→ 500ms 後點 url-registry-demo →
 *   等 3.5 秒:body 不得有 `[aria-label="歷史對話"]`(歷史浮層)、`#storybook-docs` 子節點必為 0、`#storybook-root` 已有 story、焦點不在浮層裡。
 *   對照組(`--selftest`):把 served preview chunk 裡守衛的 `hasAttribute("hidden")` 換成永遠 false 的屬性名 → 殭屍與浮層必須重現(儀器先證明會紅);
 *   另跑一次不延遲的正常切換,確認正常路徑 docs 仍會渲染(守衛沒有誤殺)。
 *   node scripts/storybook-docs-race-invariant.mjs [--static=<dir>] [--selftest] [--delay=3000]
 */
import { existsSync } from 'node:fs'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const SELFTEST = process.argv.includes('--selftest')
const staticArg = arg('static')
const STATIC = staticArg ? (isAbsolute(staticArg) ? staticArg : join(process.cwd(), staticArg)) : join(REPO, 'storybook-static')
const DELAY = Number(arg('delay') ?? 3000)
const P = 'design-system-components-agentpanel-展示'
const DEMO = `${P}--url-registry-demo`
const TASK = `${P}--task-assistant`
if (!existsSync(join(STATIC, 'index.json'))) { console.error(`找不到 ${STATIC}/index.json —— 先 build storybook`); process.exit(2) }

let fail = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`); if (!ok) fail++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** preview iframe 的 frame 每次重取:離開渲染完整的 docs 頁時 Storybook 會整個 reload preview(StoryRender.teardown 的逃生路徑),
 *  舊 frame 的執行環境會被銷毀(6fdbd788 runner 上「Execution context was destroyed」)。 */
const getFrame = async (page) => (await page.waitForSelector('#storybook-preview-iframe')).contentFrame()
const evalIn = async (page, fn) => { for (let i = 0; i < 20; i++) { try { return await (await getFrame(page)).evaluate(fn) } catch (e) { if (!/context was destroyed|navigation|detached/i.test(String(e))) throw e; await sleep(250) } } throw new Error('preview frame 一直在導航') }
/** 等到 pred 成立(每 200ms 看一次),最多 timeout ms;共享 runner 上 docs 頁渲染 14 個 story 可能要十幾秒,固定等待會誤判 */
const waitFor = async (page, pred, timeout) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await evalIn(page, pred)) return true; await sleep(200) } return false }
const sel = (x) => `[id="${x}"]`
const MEASURE = () => {
  const docs = document.getElementById('storybook-docs'), root = document.getElementById('storybook-root')
  const hist = [...document.querySelectorAll('[aria-label="歷史對話"]')].map((el) => { const w = el.closest('[data-radix-popper-content-wrapper]'); const b = el.getBoundingClientRect(); return { rect: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)], transform: w?.style.transform ?? null } })
  return { href: location.href.replace(/^.*iframe\.html/, ''), history: hist, docsChildren: docs?.childElementCount ?? null, docsHidden: docs?.hasAttribute('hidden') ?? null, rootChildren: root?.childElementCount ?? null, active: document.activeElement?.tagName + '[' + (document.activeElement?.getAttribute('aria-label') || '') + ']' }
}

const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
try {
  /** 一次切換:delayMs 延遲 DocsRenderer chunk;selftest 時把守衛拿掉。回傳切換後 3.5s 的量測與「docs 頁本身有渲染」的對照。
   *  每次自己起一個瀏覽器:沙箱用 --single-process,關掉唯一的 page 會把整個瀏覽器帶走(示範閘同樣每個寬度各起一個)。 */
  const run = async ({ delayMs, disableGuard }) => {
    const browser = await launchBrowser()
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const routed = { delayed: 0, patched: 0 }
    await page.route((url) => /\.js$/.test(url.pathname), async (route) => {
      const url = route.request().url()
      if (/DocsRenderer-[^/]+\.js$/.test(url) && delayMs > 0) { routed.delayed++; await sleep(delayMs) }
      if (!disableGuard) return route.continue()
      const res = await route.fetch(); let body = await res.text()
      // 守衛的兩處 `element.hasAttribute("hidden")`(只在含 DocsRenderer 匯入的 preview chunk 裡):換成永遠 false 的屬性名
      if (body.includes('DocsRenderer') && body.includes('hasAttribute("hidden")')) { routed.patched++; body = body.split('hasAttribute("hidden")').join('hasAttribute("data-docs-race-guard-off")') }
      return route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'application/javascript' } })
    })
    await page.goto(server.origin + `/index.html?path=/story/${TASK}`, { waitUntil: 'networkidle' }); await sleep(800)
    // 點元件節點 → 開 Docs(已展開的節點再點只會收合,收合了就再點一次)
    await page.locator(sel(P)).first().click(); await sleep(300)
    if ((await page.locator(sel(DEMO)).count()) === 0) await page.locator(sel(P)).first().click()
    await sleep(500)
    await page.locator(sel(DEMO)).first().click()
    // story 先渲染出來,再等「延遲的 chunk 到達之後」的那段時間(殭屍就是在那之後長出來的)
    await waitFor(page, () => (document.getElementById('storybook-root')?.childElementCount ?? 0) > 0, 20000)
    await sleep(Math.max(3500, delayMs + 1500))
    const m = await evalIn(page, MEASURE)
    // 對照:留在 Docs 頁時 docs 要真的渲染出來(守衛不得誤殺正常 docs);共享 runner 上 14 個 story 的 docs 頁可能要十幾秒
    // 等待 30s → 60s,再加一次重載重試(2026-09-11)。這支閘在慢 runner 上紅過三次,症狀都是
    // `rootChildren: 0 / docsChildren: 0`——**什麼都沒渲染**,也就是這一趟根本沒量到東西(儀器沒跑起來),
    // 不是守衛誤殺正常 docs。同期證據:同一輪 CI 裡 DataTable 的閘量到 main 自己的長工中位就有 372ms。
    // 重試一次仍然空 → 照樣紅。
    const openDocs = async () => {
      await page.locator(sel(P)).first().click(); await sleep(300)
      if ((await page.locator(sel(DEMO)).count()) === 0) await page.locator(sel(P)).first().click()
      return waitFor(page, () => (document.getElementById('storybook-docs')?.childElementCount ?? 0) > 0 && !document.getElementById('storybook-docs')?.hasAttribute('hidden'), 60000)
    }
    if (!(await openDocs())) {
      console.log('   ⟳ Docs 頁 60 秒內什麼都沒渲染(這一趟儀器沒跑起來),重載後重試一次')
      await page.goto(server.origin + `/index.html?path=/story/${TASK}`, { waitUntil: 'networkidle' }).catch(() => {})
      await sleep(1200)
      await openDocs()
    }
    const docsPage = await evalIn(page, MEASURE)
    await browser.close()
    return { m, docsPage, routed }
  }

  const raced = await run({ delayMs: DELAY, disableGuard: SELFTEST })
  const zombie = raced.m.history.length > 0 || (raced.m.docsChildren ?? 0) > 0
  const detail = JSON.stringify({ routed: raced.routed, after: raced.m })
  if (SELFTEST) {
    check(`對照組(守衛關掉,DocsRenderer 延遲 ${DELAY}ms):殭屍 docs / 歷史浮層必須重現`, raced.routed.patched > 0 && zombie, detail)
  } else {
    check(`DocsRenderer 延遲 ${DELAY}ms、Docs 載入中點進 story → 沒有殭屍 docs(子節點 0)、沒有歷史浮層、story 已渲染、焦點不在浮層裡`, raced.routed.delayed > 0 && !zombie && raced.m.docsHidden === true && (raced.m.rootChildren ?? 0) > 0 && !/搜尋對話/.test(raced.m.active), detail)
  }
  check('切回 Docs 頁:docs 仍正常渲染(守衛沒有誤殺正常 docs)', (raced.docsPage.docsChildren ?? 0) > 0 && raced.docsPage.docsHidden === false, JSON.stringify(raced.docsPage))
  if (!SELFTEST) {
    const normal = await run({ delayMs: 0, disableGuard: false })
    check('不延遲的正常切換:沒有殭屍、沒有歷史浮層', normal.m.history.length === 0 && (normal.m.docsChildren ?? 0) === 0 && (normal.m.rootChildren ?? 0) > 0, JSON.stringify(normal.m))
  }
} finally {
  await server.stop()
}
console.log(fail ? `\n✗ ${fail} 項未通過` : `\n✓ ${SELFTEST ? '對照組:守衛關掉時殭屍 docs 與歷史浮層如預期重現(儀器有效)' : 'Storybook docs 競態:全通過'}`)
process.exit(fail ? 1 : 0)
