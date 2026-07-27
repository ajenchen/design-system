// Test-only deterministic transport for the verified exact npm runtime.
//
// This is deliberately an imported fixture API, not an environment-variable branch in production
// code. A clean-room test may preload a module that calls installCanonicalNpmHttpsFixture before
// importing the production entrypoint. The production downloader still requests the exact canonical
// URL and verifies the exact lock digest; only Node's HTTPS transport is replaced inside that child.

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import { Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'

const VERSION = /^\d+\.\d+\.\d+$/

function octal(value, length) {
  const digits = Number(value).toString(8)
  assert.ok(digits.length <= length - 1, 'fixture ustar octal field overflow')
  return `${digits.padStart(length - 1, '0')}\0`
}

function regularHeader(path, content, mode) {
  const body = Buffer.from(content)
  const name = Buffer.from(path)
  assert.ok(name.length > 0 && name.length <= 100, `fixture ustar path is invalid:${path}`)
  const header = Buffer.alloc(512)
  name.copy(header, 0)
  header.write(octal(mode, 8), 100, 8, 'ascii')
  header.write(octal(0, 8), 108, 8, 'ascii')
  header.write(octal(0, 8), 116, 8, 'ascii')
  header.write(octal(body.length, 12), 124, 12, 'ascii')
  header.write(octal(0, 12), 136, 12, 'ascii')
  header.fill(0x20, 148, 156)
  header[156] = 0x30
  Buffer.from('ustar\0').copy(header, 257)
  Buffer.from('00').copy(header, 263)
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0)
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return { body, header }
}

export function buildDeterministicNpmRuntimeArchive({ version, cliSource }) {
  assert.match(version || '', VERSION, 'fixture npm version must be exact stable semver')
  assert.equal(typeof cliSource, 'string')
  assert.ok(cliSource.length > 0 && Buffer.byteLength(cliSource) <= 2 * 1024 * 1024, 'fixture npm CLI source is invalid')
  const manifest = `${JSON.stringify({
    name: 'npm',
    version,
    type: 'commonjs',
    bin: { npm: 'bin/npm-cli.js' },
  })}\n`
  const blocks = []
  for (const [path, body, mode] of [
    ['package/package.json', manifest, 0o644],
    ['package/bin/npm-cli.js', cliSource, 0o755],
  ]) {
    const entry = regularHeader(path, body, mode)
    blocks.push(entry.header, entry.body)
    const remainder = entry.body.length % 512
    if (remainder) blocks.push(Buffer.alloc(512 - remainder))
  }
  blocks.push(Buffer.alloc(1024))
  const tarballBytes = gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 })
  const artifact = Object.freeze({
    version,
    resolved: `https://registry.npmjs.org/npm/-/npm-${version}.tgz`,
    integrity: `sha512-${createHash('sha512').update(tarballBytes).digest('base64')}`,
  })
  return Object.freeze({ artifact, tarballBytes })
}

export function installCanonicalNpmHttpsFixture({ artifact, tarballBytes }) {
  assert.match(artifact?.version || '', VERSION)
  assert.equal(artifact.resolved, `https://registry.npmjs.org/npm/-/npm-${artifact.version}.tgz`)
  assert.ok(Buffer.isBuffer(tarballBytes) && tarballBytes.length > 0)
  assert.equal(
    artifact.integrity,
    `sha512-${createHash('sha512').update(tarballBytes).digest('base64')}`,
    'fixture tarball differs from its lock artifact',
  )
  const originalRequest = https.request
  let active = true
  https.request = function fixtureRequest(input, options, callback) {
    const url = String(input instanceof URL ? input.href : input)
    if (url !== artifact.resolved) return originalRequest.call(this, input, options, callback)
    const request = new EventEmitter()
    let ended = false
    request.setTimeout = () => request
    request.destroy = (error) => {
      if (error) queueMicrotask(() => request.emit('error', error))
      return request
    }
    request.end = () => {
      assert.equal(ended, false, 'fixture HTTPS request ended more than once')
      ended = true
      queueMicrotask(() => {
        const response = Readable.from([Buffer.from(tarballBytes)])
        response.statusCode = 200
        response.headers = {
          'content-encoding': 'identity',
          'content-length': String(tarballBytes.length),
        }
        callback(response)
      })
      return request
    }
    return request
  }
  syncBuiltinESMExports()
  return () => {
    if (!active) return
    active = false
    https.request = originalRequest
    syncBuiltinESMExports()
  }
}
