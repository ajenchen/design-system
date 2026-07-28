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
  const address = server.address()
  if (!address || typeof address === 'string' || address.address !== LOOPBACK_HOST || !Number.isInteger(address.port)) {
    await new Promise(resolveClosed => server.close(resolveClosed))
    fail('listening capability is not an owned IPv4 loopback port')
  }

  let stopped = false
  return Object.freeze({
    host: LOOPBACK_HOST,
    port: address.port,
    origin: `http://${LOOPBACK_HOST}:${address.port}`,
    async stop() {
      if (stopped) return
      stopped = true
      await new Promise((resolveClosed, rejectClosed) => {
        server.close(error => error ? rejectClosed(error) : resolveClosed())
      })
    },
  })
}
