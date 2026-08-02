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

function deterministicArchive(entries) {
  const blocks = []
  for (const [path, body, mode] of entries) {
    const entry = regularHeader(path, body, mode)
    blocks.push(entry.header, entry.body)
    const remainder = entry.body.length % 512
    if (remainder) blocks.push(Buffer.alloc(512 - remainder))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 })
}

export function buildDeterministicNpmRuntimeArchive({
  version,
  cliSource,
  includeSecurityOverlay = false,
}) {
  assert.match(version || '', VERSION, 'fixture npm version must be exact stable semver')
  assert.equal(typeof cliSource, 'string')
  assert.ok(cliSource.length > 0 && Buffer.byteLength(cliSource) <= 2 * 1024 * 1024, 'fixture npm CLI source is invalid')
  const manifest = `${JSON.stringify({
    name: 'npm',
    version,
    type: 'commonjs',
    bin: { npm: 'bin/npm-cli.js' },
  })}\n`
  const npmEntries = [
    ['package/package.json', manifest, 0o644],
    ['package/bin/npm-cli.js', cliSource, 0o755],
  ]
  if (includeSecurityOverlay) {
    npmEntries.push(
      ['package/node_modules/brace-expansion/package.json', `${JSON.stringify({ name: 'brace-expansion', version: '5.0.7' })}\n`, 0o644],
      ['package/node_modules/brace-expansion/index.js', 'exports.expand = value => [value]\n', 0o644],
      ['package/node_modules/minimatch/package.json', `${JSON.stringify({
        name: 'minimatch',
        version: '10.2.5',
        main: 'index.js',
        dependencies: { 'brace-expansion': '^5.0.5' },
      })}\n`, 0o644],
      ['package/node_modules/minimatch/index.js', "const { expand } = require('brace-expansion')\nexports.minimatch = (value, pattern) => expand(pattern).includes(value)\n", 0o644],
      ['package/node_modules/tar/package.json', `${JSON.stringify({ name: 'tar', version: '7.5.19' })}\n`, 0o644],
    )
  }
  const tarballBytes = deterministicArchive(npmEntries)
  const artifact = Object.freeze({
    version,
    resolved: `https://registry.npmjs.org/npm/-/npm-${version}.tgz`,
    integrity: `sha512-${createHash('sha512').update(tarballBytes).digest('base64')}`,
  })
  if (!includeSecurityOverlay) return Object.freeze({ artifact, tarballBytes })

  const securityOverlayTarballBytes = deterministicArchive([
    ['package/package.json', `${JSON.stringify({
      name: 'brace-expansion',
      version: '5.0.8',
      main: './dist/commonjs/index.js',
      exports: { '.': { require: './dist/commonjs/index.js' } },
    })}\n`, 0o644],
    ['package/dist/commonjs/index.js', "exports.expand = value => value === '{a,b}' ? ['a', 'b'] : [value]\n", 0o644],
  ])
  const securityOverlayArtifact = Object.freeze({
    name: 'brace-expansion',
    version: '5.0.8',
    resolved: 'https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.8.tgz',
    integrity: `sha512-${createHash('sha512').update(securityOverlayTarballBytes).digest('base64')}`,
  })
  const secondarySecurityOverlayTarballBytes = deterministicArchive([
    ['package/package.json', `${JSON.stringify({ name: 'tar', version: '7.5.22' })}\n`, 0o644],
  ])
  const secondarySecurityOverlayArtifact = Object.freeze({
    name: 'tar',
    version: '7.5.22',
    resolved: 'https://registry.npmjs.org/tar/-/tar-7.5.22.tgz',
    integrity: `sha512-${createHash('sha512').update(secondarySecurityOverlayTarballBytes).digest('base64')}`,
  })
  return Object.freeze({
    artifact,
    tarballBytes,
    secondarySecurityOverlayArtifact,
    secondarySecurityOverlayTarballBytes,
    securityOverlayArtifact,
    securityOverlayTarballBytes,
  })
}

export function installCanonicalNpmHttpsFixture({
  artifact,
  secondarySecurityOverlayArtifact,
  secondarySecurityOverlayTarballBytes,
  tarballBytes,
  securityOverlayArtifact,
  securityOverlayTarballBytes,
}) {
  assert.match(artifact?.version || '', VERSION)
  assert.equal(artifact.resolved, `https://registry.npmjs.org/npm/-/npm-${artifact.version}.tgz`)
  assert.ok(Buffer.isBuffer(tarballBytes) && tarballBytes.length > 0)
  assert.equal(
    artifact.integrity,
    `sha512-${createHash('sha512').update(tarballBytes).digest('base64')}`,
    'fixture tarball differs from its lock artifact',
  )
  const servedArtifacts = new Map([[artifact.resolved, Buffer.from(tarballBytes)]])
  if (securityOverlayArtifact || securityOverlayTarballBytes) {
    assert.deepEqual(
      {
        name: securityOverlayArtifact?.name,
        version: securityOverlayArtifact?.version,
        resolved: securityOverlayArtifact?.resolved,
      },
      {
        name: 'brace-expansion',
        version: '5.0.8',
        resolved: 'https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.8.tgz',
      },
    )
    assert.ok(Buffer.isBuffer(securityOverlayTarballBytes) && securityOverlayTarballBytes.length > 0)
    assert.equal(
      securityOverlayArtifact.integrity,
      `sha512-${createHash('sha512').update(securityOverlayTarballBytes).digest('base64')}`,
      'fixture security-overlay tarball differs from its lock artifact',
    )
    servedArtifacts.set(securityOverlayArtifact.resolved, Buffer.from(securityOverlayTarballBytes))
  }
  if (secondarySecurityOverlayArtifact || secondarySecurityOverlayTarballBytes) {
    assert.deepEqual(
      {
        name: secondarySecurityOverlayArtifact?.name,
        version: secondarySecurityOverlayArtifact?.version,
        resolved: secondarySecurityOverlayArtifact?.resolved,
      },
      {
        name: 'tar',
        version: '7.5.22',
        resolved: 'https://registry.npmjs.org/tar/-/tar-7.5.22.tgz',
      },
    )
    assert.ok(Buffer.isBuffer(secondarySecurityOverlayTarballBytes) && secondarySecurityOverlayTarballBytes.length > 0)
    assert.equal(
      secondarySecurityOverlayArtifact.integrity,
      `sha512-${createHash('sha512').update(secondarySecurityOverlayTarballBytes).digest('base64')}`,
      'fixture secondary security-overlay tarball differs from its lock artifact',
    )
    servedArtifacts.set(secondarySecurityOverlayArtifact.resolved, Buffer.from(secondarySecurityOverlayTarballBytes))
  }
  const originalRequest = https.request
  let active = true
  https.request = function fixtureRequest(input, options, callback) {
    const url = String(input instanceof URL ? input.href : input)
    const responseBytes = servedArtifacts.get(url)
    if (!responseBytes) return originalRequest.call(this, input, options, callback)
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
        const response = Readable.from([responseBytes])
        response.statusCode = 200
        response.headers = {
          'content-encoding': 'identity',
          'content-length': String(responseBytes.length),
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
