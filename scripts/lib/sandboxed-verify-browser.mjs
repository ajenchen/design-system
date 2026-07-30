// Runtime-verification transport SSOT(2026-07-30)。
//
// Why this file exists:驗證契約要求 user-visible change 必跑 browser / Storybook 驗證,但 agent
// sandbox 有兩個實測限制,原本散在各 runner 各自(不)處理:
//   1. macOS seatbelt 禁 mach bootstrap check-in → 預設 `chromium.launch()` 直接 FATAL。
//      `--single-process --no-zygote` 免 mach rendezvous,CSS / layout 量測結果與 multiprocess 相同。
//   2. sandbox 禁 listen(EPERM/EACCES)→ inline http server 起不來。Playwright request
//      interception 可直供同一份 static bytes,只換傳輸層,不改服務內容或斷言。
// 兩者都是 primary-then-fallback:CI 與 user machine 走 primary(與改動前逐字相同),受限環境才
// 降級,且**每次都印出走了哪條路**——沒有靜默降級,不可能出現「以為驗了其實沒驗」的假綠。
//
// M17:這是唯一住所。任何 runner 禁自刻 chromium.launch / http.createServer(機械強制:
// check_pattern_invariants.sh 未涵蓋此類 → 由 P0-C workflow-contract conformance suite 斷言)。
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

const permissionDenied = (error) => error?.code === 'EPERM' || error?.code === 'EACCES'

/**
 * 啟動 verification browser。primary = 預設 multiprocess headless;mach port 被拒時 retry
 * 一次 single-process。回傳 { browser, mode } — mode 供 runner 印出/記錄實際路徑。
 * @param {{ launch: Function }} chromium playwright chromium namespace
 */
export async function launchVerifyBrowser(chromium, { headless = true, args = [], log = console.log } = {}) {
  try {
    const browser = await chromium.launch({ headless, args })
    return { browser, mode: 'multiprocess' }
  } catch (error) {
    log(`ℹ 預設 chromium launch 失敗(${error?.message?.split('\n')[0] || 'unknown'})— retry --single-process(免 mach rendezvous;量測斷言不變)`)
    const browser = await chromium.launch({ headless, args: ['--single-process', '--no-zygote', ...args] })
    return { browser, mode: 'single-process' }
  }
}

/**
 * 供 static 目錄給 browser。primary = inline http server on `port`;listen 被拒時回傳
 * interception 描述,由 caller 用 `attachStaticRoute(page, served)` 掛到 page 上。
 * 兩條路的 URL 形狀相同(http://localhost:<port>/...),story ID / 斷言零改動。
 */
export async function serveStaticDir(root, { port, log = console.log } = {}) {
  if (!existsSync(root)) throw new Error(`serveStaticDir: static root missing:${root}`)
  const origin = `http://localhost:${port}`
  const readEntry = (rawPath) => {
    let p = decodeURIComponent(String(rawPath).split('?')[0])
    if (p === '/') p = '/index.html'
    const fp = join(root, p)
    if (!existsSync(fp) || statSync(fp).isDirectory()) return null
    return { type: MIME[extname(fp)] || 'application/octet-stream', body: readFileSync(fp) }
  }
  try {
    const server = http.createServer((req, res) => {
      const hit = readEntry(req.url)
      if (!hit) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'content-type': hit.type })
      res.end(hit.body)
    })
    await new Promise((resolvePromise, rejectPromise) => {
      server.once('error', rejectPromise)
      server.listen(port, resolvePromise)
    })
    return {
      origin,
      transport: 'http-server',
      readEntry,
      async close() { await new Promise((r) => server.close(r)) },
    }
  } catch (error) {
    if (!permissionDenied(error)) throw error
    log(`ℹ sandbox 禁 listen(${error.code})— 改用 Playwright request interception 直供同一份 bytes(斷言不變)`)
    return { origin, transport: 'route-interception', readEntry, async close() {} }
  }
}

/** interception 模式下必須呼叫;http-server 模式為 no-op,caller 可無條件呼叫。 */
export async function attachStaticRoute(page, served) {
  if (served.transport !== 'route-interception') return
  await page.route(`${served.origin}/**`, (route) => {
    const hit = served.readEntry(new URL(route.request().url()).pathname)
    if (!hit) return route.fulfill({ status: 404, body: '' })
    return route.fulfill({ status: 200, contentType: hit.type, body: hit.body })
  })
}
