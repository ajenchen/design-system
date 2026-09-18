import fs from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { isContainedPath } from './canonical-path-containment.mjs'

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
export async function startA11yStaticServer({ rootDirectory, defaultFile = 'index.html' } = {}) {
  const root = canonicalStaticRoot(rootDirectory)
  safeDefaultFile(defaultFile)
  const server = createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method || '')) {
      response.statusCode = 405
      response.setHeader('Allow', 'GET, HEAD')
      response.end()
      return
    }
    const file = resolveA11yStaticFile(root, request.url || '/', { defaultFile })
    if (!file) {
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
  }
  return Object.freeze({
    host: LOOPBACK_HOST,
    port: address.port,
    origin: `http://${LOOPBACK_HOST}:${address.port}`,
    stop,
    // `close` 是 Node server 的習慣名字,呼叫端很自然會伸手去拿;沒有它的時候
    // `server.close?.()` 會靜靜地什麼都不做(2026-09-18 實測四支閘都是這樣寫的)。給同一個實作,別再有人踩。
    close: stop,
  })
}
