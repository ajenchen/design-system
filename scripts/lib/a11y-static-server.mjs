import fs from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { isContainedPath } from './canonical-path-containment.mjs'
import { snapshotStorybookStatic } from './storybook-static-snapshot.mjs'

const LOOPBACK_HOST = '127.0.0.1'
const CONTENT_TYPES = new Map([
  ['.css', 'text/css'],
  ['.html', 'text/html'],
  ['.js', 'application/javascript'],
  ['.json', 'application/json'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
])

function fail(message) {
  throw new Error(`a11y static server blocked:${message}`)
}

function canonicalStaticRoot(rootDirectory) {
  if (typeof rootDirectory !== 'string' || !rootDirectory) fail('root directory must be a non-empty string')
  const absolute = path.resolve(rootDirectory)
  const info = fs.lstatSync(absolute)
  if (!info.isDirectory() || info.isSymbolicLink()) fail('root directory must be a regular non-symlink directory')
  return fs.realpathSync(absolute)
}

function safeDefaultFile(defaultFile) {
  if (typeof defaultFile !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(defaultFile)) {
    fail('default file must be one safe root filename')
  }
  return defaultFile
}

/** Resolve one URL to a single-link regular file physically contained by the static root. */
export function resolveA11yStaticFile(rootDirectory, requestUrl, { defaultFile = 'index.html' } = {}) {
  if (typeof requestUrl !== 'string' || !requestUrl || /[\0\r\n]/.test(requestUrl)) return null
  let root
  let pathname
  try {
    root = canonicalStaticRoot(rootDirectory)
    const rawPathname = requestUrl.split(/[?#]/, 1)[0]
    if (!rawPathname.startsWith('/')) return null
    pathname = decodeURIComponent(rawPathname)
  } catch {
    return null
  }
  if (pathname.includes('\\') || pathname.includes('\0')) return null
  if (pathname === '/' || pathname === '') pathname = `/${safeDefaultFile(defaultFile)}`
  if (pathname.split('/').some(segment => segment === '.' || segment === '..')) return null

  const candidate = path.resolve(root, pathname.replace(/^\/+/, ''))
  if (!isContainedPath(root, candidate)) return null
  try {
    const candidateInfo = fs.lstatSync(candidate)
    if (!candidateInfo.isFile() || candidateInfo.isSymbolicLink() || candidateInfo.nlink !== 1) return null
    const real = fs.realpathSync(candidate)
    if (real !== candidate || !isContainedPath(root, real)) return null
    return real
  } catch {
    return null
  }
}

/** Start one owned ephemeral loopback server and return its unforgeable origin + awaited stop. */
// **Storybook 建置一律從本次獨佔的快照供檔**(2026-09-24):根目錄裡有 build-info.json(= 一份完整的
// `npm run build-storybook` 產物)時,先凍結成快照再服務,不再每次請求讀活目錄。錨例:
// data-table-invariants.mjs 本機誤紅 —— 另一個 agent 同時 build-storybook,第一步就清空輸出目錄,
// 後續導覽全部 404,被判成「表格沒有列」(M37:把「路徑」當成「建置身分」)。沒有 build-info.json 的
// 根目錄(consumer dist 等)照舊直接服務;建置不完整或複製期間被重建 → 以「儀器失效」的名義丟出。
// `notFound` 是同源 404 帳本:快照不會再變,任何 404 都是「建置缺檔」或「story 要了不存在的檔」,
// 呼叫端失敗時應一併印出,不讓「儀器沒拿到檔」被讀成「元件沒渲染」。
export async function startA11yStaticServer({ rootDirectory, defaultFile = 'index.html', snapshot = 'auto' } = {}) {
  const liveRoot = canonicalStaticRoot(rootDirectory)
  safeDefaultFile(defaultFile)
  // 「這是一份 Storybook 建置」的判定:有完成標記,或目錄就叫 storybook-static。後者沒有標記 = 別人正在重建
  // (重建第一步就刪標記、最後才寫回)或從沒建完 —— 這時 snapshotStorybookStatic 會以「儀器失效」丟出,
  // 不再退回讀活目錄(那正是 2026-09-24 誤紅的路徑)。其他根目錄(consumer dist、暫存頁)照舊直接服務。
  const isStorybookBuild = fs.existsSync(path.join(liveRoot, 'build-info.json')) || path.basename(liveRoot) === 'storybook-static'
  const frozen = (snapshot === 'auto' && isStorybookBuild) || snapshot === true
    ? snapshotStorybookStatic(liveRoot)
    : null
  const root = frozen ? canonicalStaticRoot(frozen.dir) : liveRoot
  const notFound = []
  if (frozen) process.once('exit', () => frozen.dispose())
  const server = createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      response.statusCode = 405
      response.setHeader('Allow', 'GET, HEAD')
      response.end()
      return
    }
    const file = resolveA11yStaticFile(root, request.url || '/', { defaultFile })
    if (!file) {
      notFound.push((request.url || '/').split(/[?#]/, 1)[0])
      response.statusCode = 404
      response.end()
      return
    }
    try {
      const bytes = fs.readFileSync(file)
      response.setHeader('Content-Type', CONTENT_TYPES.get(path.extname(file)) || 'application/octet-stream')
      response.setHeader('Content-Length', String(bytes.length))
      response.end(request.method === 'HEAD' ? undefined : bytes)
    } catch {
      response.statusCode = 404
      response.end()
    }
  })

  await new Promise((resolveListening, rejectListening) => {
    const reject = (error) => rejectListening(error)
    server.once('error', reject)
    server.listen(0, LOOPBACK_HOST, () => {
      server.off('error', reject)
      resolveListening()
    })
  })
  // 伺服器本身不再把事件迴圈釘住(2026-09-18)。
  // 根因錨:`overlay-footer-gutter-invariant.mjs` 在 CI 上印完「✓ 通過」之後**空轉 13 分鐘**直到 job 撞 25 分上限被砍;
  // 同一天查出四支全 story 掃描的閘寫的是 `await server.close?.()` —— 這個物件根本**沒有 `close`**(只有 `stop`),
  // 可選鏈讓它靜靜地變成 no-op,於是監聽中的 server 一直把 Node 的事件迴圈撐著。
  // `unref()` 之後,「忘了關」不再等於「永遠不結束」;正常路徑仍然該呼叫 `stop()`(它會連同連線一起收掉)。
  server.unref()
  const address = server.address()
  if (!address || typeof address === 'string' || address.address !== LOOPBACK_HOST || !Number.isInteger(address.port)) {
    await new Promise(resolveClosed => server.close(resolveClosed))
    fail('listening capability is not an owned IPv4 loopback port')
  }

  let stopped = false
  const stop = async () => {
    if (stopped) return
    stopped = true
    // 先把還開著的連線砍掉再關:`server.close()` 預設**等既有連線排空**,
    // 瀏覽器留下的 keep-alive socket 會讓它一直等下去(上面那個 13 分鐘就是這樣來的)。
    server.closeAllConnections?.()
    await new Promise((resolveClosed, rejectClosed) => {
      server.close(error => error ? rejectClosed(error) : resolveClosed())
    })
    frozen?.dispose()
  }
  return Object.freeze({
    host: LOOPBACK_HOST,
    port: address.port,
    origin: `http://${LOOPBACK_HOST}:${address.port}`,
    stop,
    // `close` 是 Node server 的習慣名字,呼叫端很自然會伸手去拿;沒有它的時候
    // `server.close?.()` 會靜靜地什麼都不做(2026-09-18 實測四支閘都是這樣寫的)。給同一個實作,別再有人踩。
    close: stop,
    /** 同源 404 帳本(路徑,不含 query);呼叫端失敗時印出 `[...new Set(server.notFound)]`。 */
    notFound,
    /** 本次服務的建置快照(沒有 build-info.json 的根目錄為 null)。 */
    snapshot: frozen ? Object.freeze({ dir: frozen.dir, buildInfo: frozen.buildInfo }) : null,
    /** 正在服務的根目錄(有快照 = 快照目錄;沒有 = 原根目錄)。讀清單一律從這裡讀,見 readServedStorybookIndex。 */
    servedRoot: root,
  })
}

/**
 * 讀**正在服務的那一份**建置的 Storybook index.json(2026-09-25,待辦總帳 C5)。
 * story 清單必須跟頁面出自同一份建置:伺服器從快照供檔、清單卻讀活目錄的閘,在別人同時 build-storybook 時
 * 會拿到「清單有、快照沒有」(或反過來)的 story,把「清單與頁面不是同一份」讀成「story 載入失敗」(假的儀器紅),
 * 或把新增的 story 漏量。有快照 → 讀快照;沒有快照(非 Storybook 根目錄)→ 讀服務中的根目錄 —— 兩者都是「正在服務的那一份」。
 * 缺檔 / 壞檔照常丟例外(呼叫端先用 requireStorybookBuild 擋「根本沒有建置」)。
 * @param {{ servedRoot: string }} server startA11yStaticServer 的回傳
 * @returns {any} 解析後的 index.json
 */
export function readServedStorybookIndex(server) {
  if (!server || typeof server.servedRoot !== 'string') throw new TypeError('readServedStorybookIndex:要傳 startA11yStaticServer 的回傳(需有 servedRoot)')
  return JSON.parse(fs.readFileSync(path.join(server.servedRoot, 'index.json'), 'utf8'))
}
