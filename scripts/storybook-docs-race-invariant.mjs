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
 *   「真的渲染完成」一律有訊號(2026-09-25):前置以 openStory 開兩則 story、管理介面以 openStory 等側欄節點、進站 / 切換後 / 重載後
 *   都以 lib 的 waitForStoryRender(openStory 第 3 步的同一份實作)在 preview iframe 裡等**那一則** finished;點側欄節點後讀節點自己的
 *   aria-expanded(不再「點完睡 300ms 再數子節點」);延遲的 DocsRenderer chunk 必須真的送達才量。
 *   任一等不到 = 儀器失效 exit 1(點名、附 404),不當產品結果。
 *   node scripts/storybook-docs-race-invariant.mjs [--static=<dir>] [--selftest] [--delay=3000]
 */
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, StoryRenderInstrumentError, requireStorybookBuild, waitForDocsRender, waitForStoryRender } from './lib/launch-browser.mjs'
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
requireStorybookBuild(join(STATIC, 'index.json'))

let fail = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`); if (!ok) fail++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** preview iframe 的 frame 每次重取:離開渲染完整的 docs 頁時 Storybook 會整個 reload preview(StoryRender.teardown 的逃生路徑),
 *  舊 frame 的執行環境會被銷毀(6fdbd788 runner 上「Execution context was destroyed」)。 */
const getFrame = async (page) => (await page.waitForSelector('#storybook-preview-iframe')).contentFrame()
const evalIn = async (page, fn, arg) => { for (let i = 0; i < 20; i++) { try { return await (await getFrame(page)).evaluate(fn, arg) } catch (e) { if (!/context was destroyed|navigation|detached/i.test(String(e))) throw e; await sleep(250) } } throw new Error('preview frame 一直在導航') }
const sel = (x) => `[id="${x}"]`

/** 儀器失效:這一趟沒有量到(story 沒渲染完成 / 缺檔 / 延遲的 chunk 還沒送達),**不是產品裁決**;一律 exit 1,不准當通過也不准略過。 */
class DocsRaceInstrumentError extends Error {}
const instrumentFail = (what, reason, server, ledgerStart = 0) => {
  const missing = [...new Set(server.notFound.slice(ledgerStart))]
  return new DocsRaceInstrumentError(`INSTRUMENT-FAIL ${what} —— ${reason}${missing.length ? `;同源 404:${missing.join(', ')}` : ''}。這是儀器失效(沒量到),不是產品裁決,但這次不能算通過`)
}
/**
 * 管理介面裡「點側欄切到另一則 story」是 Storybook channel 驅動的,preview iframe 沒有導覽可以交給 openStory。
 * 判定一律走 lib 的 waitForStoryRender(openStory 第 3 步的同一份實作,M17):preview iframe 裡 `__STORYBOOK_PREVIEW__.currentRender`
 * 是**這一則**、phase = finished、body 是 sb-show-main;錯誤頁 / 無預覽頁當場停;preview 途中整個 reload 也照樣續等。
 * 逾時只是「等不到」的上限。等不到 = 儀器失效(DocsRaceInstrumentError),附本次切換之後的同源 404。
 */
const previewRendered = async (page, storyId, { what, timeoutMs, ledgerStart }) => {
  const iframe = await page.waitForSelector('#storybook-preview-iframe', { state: 'attached', timeout: timeoutMs }).catch(() => null)
  const frame = await iframe?.contentFrame().catch(() => null)
  if (!frame) throw instrumentFail(`${what}「${storyId}」`, `${timeoutMs / 1000} 秒內等不到 preview iframe`, server, ledgerStart)
  try {
    return await waitForStoryRender(frame, { storyId, label: `${storyId}(${what})`, timeoutMs, notFound: server.notFound, notFoundFrom: ledgerStart })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    throw new DocsRaceInstrumentError(error.message)
  }
}
/**
 * 點元件節點直到它展開(展開 = 已開 Docs、子節點在;已展開的節點再點只會收合,收合了就再點一次)。
 * 判定讀節點**自己的** aria-expanded:點擊的結果就寫在那個屬性上,不再「點完睡 300ms 再數子節點」(慢的機器上 300ms 可能還沒重畫,
 * 於是少點一次、節點被收合,接下來點 story 會以 Playwright 逾時崩掉 —— 被讀成別的問題)。
 */
const expandComponentNode = async (page) => {
  const node = page.locator(sel(P)).first()
  for (let clicks = 0; clicks < 2; clicks++) {
    const before = await node.getAttribute('aria-expanded')
    await node.click()
    const flipped = await page.waitForFunction(([id, prev]) => {
      const value = document.getElementById(id)?.getAttribute('aria-expanded')
      return value != null && value !== prev
    }, [P, before], { timeout: 10000 }).then(() => true, () => false)
    if (!flipped) throw instrumentFail(`側欄節點「${P}」`, `點擊後 10 秒內 aria-expanded 沒有改變(停在 ${before})`, server)
    if ((await node.getAttribute('aria-expanded')) === 'true') return
  }
  throw instrumentFail(`側欄節點「${P}」`, '點兩次仍不是展開狀態', server)
}
const MEASURE = () => {
  const docs = document.getElementById('storybook-docs'), root = document.getElementById('storybook-root')
  const hist = [...document.querySelectorAll('[aria-label="歷史對話"]')].map((el) => { const w = el.closest('[data-radix-popper-content-wrapper]'); const b = el.getBoundingClientRect(); return { rect: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)], transform: w?.style.transform ?? null } })
  return { href: location.href.replace(/^.*iframe\.html/, ''), history: hist, docsChildren: docs?.childElementCount ?? null, docsHidden: docs?.hasAttribute('hidden') ?? null, rootChildren: root?.childElementCount ?? null, active: document.activeElement?.tagName + '[' + (document.activeElement?.getAttribute('aria-label') || '') + ']' }
}

const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
try {
  /** 開管理介面並等到要點的側欄節點本身出現(openStory,document 模式:根節點有內容、無關鍵資源失敗、無頁面例外)。
   *  原本是 networkidle + 固定睡 800ms —— 代理量;缺檔時一路點下去,最後被讀成「守衛誤殺 docs」。 */
  const openManager = async (page) => {
    try {
      await openStory(page, server.origin + `/index.html?path=/story/${TASK}`, { storybook: false, waitFor: sel(P), notFound: server.notFound, label: `管理介面(${TASK})` })
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      throw new DocsRaceInstrumentError(error.message)
    }
  }
  // 前置:兩則會被切到的 story 本身必須渲染得出來(openStory,全部瀏覽器閘共用的「真的渲染完成」判定)。
  // 缺 story 檔時在這裡就以儀器失效點名、附 404 停下,不再跑完三趟重試(舊版在缺檔下跑 463 秒、最後報「守衛誤殺正常 docs」)。
  {
    const browser = await launchBrowser()
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      for (const id of [TASK, DEMO]) await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { notFound: server.notFound })
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      throw new DocsRaceInstrumentError(error.message)
    } finally { await browser.close() }
  }
  /** 一次切換:delayMs 延遲 DocsRenderer chunk;selftest 時把守衛拿掉。回傳切換後 3.5s 的量測與「docs 頁本身有渲染」的對照。
   *  每次自己起一個瀏覽器:沙箱用 --single-process,關掉唯一的 page 會把整個瀏覽器帶走(示範閘同樣每個寬度各起一個)。 */
  const run = async ({ delayMs, disableGuard }) => {
    const browser = await launchBrowser()
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      const routed = { delayed: 0, patched: 0, delivered: 0 }
      // 延遲的 DocsRenderer chunk **真的送達**才算數(M37):量測當下若它還在路上,殭屍根本還沒機會長出來,「沒有殭屍」不是證據
      // (404 也會觸發 requestfinished —— 只算 2xx,缺檔的 chunk 不算送達)
      page.on('requestfinished', async (request) => { if (/DocsRenderer-[^/]+\.js$/.test(request.url()) && (await request.response().catch(() => null))?.ok()) routed.delivered++ })
      await page.route((url) => /\.js$/.test(url.pathname), async (route) => {
        const url = route.request().url()
        if (/DocsRenderer-[^/]+\.js$/.test(url) && delayMs > 0) { routed.delayed++; await sleep(delayMs) }
        if (!disableGuard) return route.continue().catch(() => {})
        // 重載會中止進行中的請求,這時 `route.fetch()` 會丟例外 —— 2026-09-12 我加的重試就是這樣把整支腳本炸掉的
        // (CI `storybook-docs-race-invariant.mjs:62` 未捕捉例外)。攔截器必須對「請求已被中止」免疫。
        let res
        try { res = await route.fetch() } catch { return route.continue().catch(() => {}) }
        let body = await res.text().catch(() => null)
        if (body == null) return route.continue().catch(() => {})
        // 守衛的兩處 `element.hasAttribute("hidden")`(只在含 DocsRenderer 匯入的 preview chunk 裡):換成永遠 false 的屬性名
        if (body.includes('DocsRenderer') && body.includes('hasAttribute("hidden")')) { routed.patched++; body = body.split('hasAttribute("hidden")').join('hasAttribute("data-docs-race-guard-off")') }
        return route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'application/javascript' } }).catch(() => {})
      })
      await openManager(page)
      // 從 task-assistant 進站:它在 preview 裡真的渲染完成,才開始點(原本靠上面那 800ms 剛好夠)
      await previewRendered(page, TASK, { what: '進站 story', timeoutMs: 30000, ledgerStart: 0 })
      const ledger = server.notFound.length
      // 點元件節點 → 開 Docs
      await expandComponentNode(page)
      await sleep(500) // 情境本身:Docs 載入**進行中**才點進 story(競態的觸發條件),不是等渲染
      await page.locator(sel(DEMO)).first().click()
      // story 先渲染完成(原本只等 #storybook-root 有子節點、而且等不到也照樣往下量 —— 沒量到會被讀成產品結果)
      await previewRendered(page, DEMO, { what: '切換後的 story', timeoutMs: 20000, ledgerStart: ledger })
      // 再等「延遲的 chunk 到達之後」的那段時間(殭屍就是在那之後長出來的):這段是給**不該發生的事**發生的機會,不是等渲染
      await sleep(Math.max(3500, delayMs + 1500))
      if (delayMs > 0 && routed.delivered === 0) {
        throw instrumentFail(`切換後的 story「${DEMO}」`, `延遲 ${delayMs}ms 的 DocsRenderer chunk 在量測當下沒有成功送達(還在路上或 404;攔到 ${routed.delayed} 次)—— 殭屍還沒有機會長出來,這一趟的「沒有殭屍」不是證據`, server, ledger)
      }
      const m = await evalIn(page, MEASURE)
      // 對照:留在 Docs 頁時 docs 要真的渲染出來(守衛不得誤殺正常 docs);共享 runner 上 14 個 story 的 docs 頁可能要十幾秒
      // 等待 30s → 60s,再加一次重載重試(2026-09-11)。這支閘在慢 runner 上紅過三次,症狀都是
      // `rootChildren: 0 / docsChildren: 0`——**什麼都沒渲染**,也就是這一趟根本沒量到東西(儀器沒跑起來),
      // 不是守衛誤殺正常 docs。同期證據:同一輪 CI 裡 DataTable 的閘量到 main 自己的長工中位就有 372ms。
      // 重試一次仍然空 → 照樣紅。
      // 「docs 頁渲染出來了」走 lib 的 waitForDocsRender(2026-09-25,待辦總帳 C5):原本這裡是本檔私有的 200ms 輪詢
      // (只看 #storybook-docs 有子節點、沒被藏起來),與 verify-published-deploy 的 DOCS_SETTLED 是兩份各自的判定(M17)。
      // 共用判定多驗「currentRender 是這一則 docs、不在 preparing」;等不到回 false,由下面「量到 0 就重試」照舊處理。
      const openDocs = async () => {
        await expandComponentNode(page)
        try {
          await waitForDocsRender(await getFrame(page), { docsId: `${P}--docs`, timeoutMs: 60000, notFound: server.notFound, label: `${P} 的 docs 頁` })
          return true
        } catch (error) {
          if (!(error instanceof StoryRenderInstrumentError)) throw error
          return false
        }
      }
      // 重試 1 次 → 3 次(2026-09-12,第四次誤紅)。這個 docs 頁要渲染 15 支 story、其中 9 支含 DataTable,
      // 共享 runner 負載高時 60 秒等不完;症狀恆為 `rootChildren: 0 / docsChildren: 0` = **這一趟根本沒量到東西**,
      // 不是守衛誤殺正常 docs。已排除是自適應緩衝造成的:緩衝只在捲動中重算,docs 頁沒人捲 → 維持初始值,
      // 而且沒有那道守衛的 7f342b23(每次 render 都擴)這支閘是綠的。
      // 仍然全部落空 → 照樣紅(不靜默跳過:「沒量到」不可以偽裝成「通過」)。
      // **條件要在「量測當下」成立,不是「等待當下」成立**(2026-09-12 第五次誤紅)。
      // 上一版只在 `openDocs()` 等不到時重試;實際 CI 的失敗是 openDocs 回報成功、接著量到 0 ——
      // docs 渲染出來之後又被拆掉。所以改成「開 → 量 → 沒量到才重試」。
      let docsPage = null
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await openDocs()
        docsPage = await evalIn(page, MEASURE)
        if ((docsPage?.docsChildren ?? 0) > 0) break
        if (attempt < 3) {
          console.log(`   ⟳ Docs 頁量到 0 個子節點(這一趟儀器沒跑起來),重載後重試 ${attempt}/3`)
          const retryLedger = server.notFound.length
          await openManager(page)
          // 重載後等 preview 裡的進站 story 真的渲染完成再點(原本固定睡 1200ms 當「preview 起來了」的代理);docs 頁本身的渲染由 openDocs 的等待判定
          await previewRendered(page, TASK, { what: `重載後(第 ${attempt} 次重試)的進站 story`, timeoutMs: 30000, ledgerStart: retryLedger })
        }
      }
      return { m, docsPage, routed }
    } finally { await browser.close().catch(() => {}) }
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
} catch (error) {
  if (!(error instanceof DocsRaceInstrumentError)) throw error
  console.error(`✗ ${error.message}`)
  console.error(`\n✗ Storybook docs 競態${SELFTEST ? '對照組' : ''}這次沒有量到(儀器失效)—— 不算通過,也不是產品裁決`)
  process.exitCode = 1
} finally {
  await server.stop()
}
if (process.exitCode === 1) process.exit(1)
console.log(fail ? `\n✗ ${fail} 項未通過` : `\n✓ ${SELFTEST ? '對照組:守衛關掉時殭屍 docs 與歷史浮層如預期重現(儀器有效)' : 'Storybook docs 競態:全通過'}`)
process.exit(fail ? 1 : 0)
