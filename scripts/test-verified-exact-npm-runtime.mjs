#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import https, { createServer as createHttpsServer } from 'node:https'
import tls from 'node:tls'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import {
  createGovernanceRoutedFetch,
  formatGovernanceProxyNotices,
  isGovernanceProxyFamilyName,
  matchesGovernanceNoProxy,
  openGovernanceProxyTunnel,
  resolveGovernanceProxyForwarding,
  resolveGovernanceProxyRoute,
  downloadCanonicalNpmTarball,
  downloadCanonicalNpmSecurityOverlayTarball,
  downloadWithTransientRetry,
  isTransientRegistryDownloadFailure,
  NPM_RUNTIME_DOWNLOAD_RETRY_LIMIT,
  materializeVerifiedExactNpmRuntime,
  prepareVerifiedExactNpmRuntime,
  resolveExactNpmArtifact,
  resolveExactNpmRuntimeContract,
  nodeReadsSystemTrustStore,
  readSystemTrustAnchorsWithoutEnvironment,
  VERIFIED_NODE_TLS_TRUST_ARGS,
  verifiedNpmNodeArgv,
  verifiedRegistryTrustAnchors,
} from './lib/verified-exact-npm-runtime.mjs'
import {
  createIsolatedGovernanceNpmEnvironment,
  sanitizeGovernanceBootstrapEnvironment,
} from './lib/governance-dependency-bootstrap.mjs'
import { isolatedNpmEnvironment as upgradeIsolatedNpmEnvironment } from './verify-upgrade-evidence.mjs'
import { startConnectProxy } from './proxy-route-parity-probe.mjs'
import {
  buildDeterministicNpmRuntimeArchive,
  installCanonicalNpmHttpsFixture,
} from './test-fixtures/verified-npm-runtime-archive.mjs'

const temporary = []
const version = '11.19.0'

function temporaryDirectory(label = 'verified npm runtime test ') {
  const path = mkdtempSync(join(realpathSync(tmpdir()), label))
  temporary.push(path)
  return path
}

function write(path, body, mode = 0o644) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
  chmodSync(path, mode)
}

function octal(value, length) {
  const digits = Number(value).toString(8)
  assert.ok(digits.length <= length - 1)
  return `${digits.padStart(length - 1, '0')}\0`
}

function tarHeader({ path, body, mode = 0o644, type = '0', linkname = '' }) {
  const content = Buffer.isBuffer(body) ? body : Buffer.from(body || '')
  const header = Buffer.alloc(512)
  const pathBytes = Buffer.from(path)
  assert.ok(pathBytes.length <= 100, `test fixture path exceeds ustar name field:${path}`)
  pathBytes.copy(header, 0)
  header.write(octal(mode, 8), 100, 8, 'ascii')
  header.write(octal(0, 8), 108, 8, 'ascii')
  header.write(octal(0, 8), 116, 8, 'ascii')
  header.write(octal(content.length, 12), 124, 12, 'ascii')
  header.write(octal(0, 12), 136, 12, 'ascii')
  header.fill(0x20, 148, 156)
  header[156] = type.charCodeAt(0)
  if (linkname) Buffer.from(linkname).copy(header, 157)
  Buffer.from('ustar\0').copy(header, 257)
  Buffer.from('00').copy(header, 263)
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0)
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return { content, header }
}

function tarball(entries) {
  const blocks = []
  for (const entry of entries) {
    const { content, header } = tarHeader(entry)
    blocks.push(header, content)
    const remainder = content.length % 512
    if (remainder) blocks.push(Buffer.alloc(512 - remainder))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks), { level: 9 })
}

function npmEntries({
  packageName = 'npm',
  packageVersion = version,
  bin = 'bin/npm-cli.js',
  cli = `if (process.argv[2] === '--version') console.log('${version}')\n`,
  cliMode = 0o755,
  includeCli = true,
} = {}) {
  const entries = [{
    path: 'package/package.json',
    mode: 0o644,
    body: `${JSON.stringify({ name: packageName, version: packageVersion, bin: { npm: bin } })}\n`,
  }]
  if (includeCli) entries.push({ path: 'package/bin/npm-cli.js', mode: cliMode, body: cli })
  return entries
}

function npmEntriesWithSecurityOverlayPreimage() {
  return [
    ...npmEntries(),
    {
      path: 'package/node_modules/brace-expansion/package.json',
      body: `${JSON.stringify({ name: 'brace-expansion', version: '5.0.7' })}\n`,
    },
    {
      path: 'package/node_modules/brace-expansion/index.js',
      body: 'exports.expand = value => [value]\n',
    },
    {
      path: 'package/node_modules/minimatch/package.json',
      body: `${JSON.stringify({
        name: 'minimatch',
        version: '10.2.5',
        main: 'index.js',
        dependencies: { 'brace-expansion': '^5.0.5' },
      })}\n`,
    },
    {
      path: 'package/node_modules/minimatch/index.js',
      body: "const { expand } = require('brace-expansion')\nexports.minimatch = (value, pattern) => expand(pattern).includes(value)\n",
    },
    {
      path: 'package/node_modules/tar/package.json',
      body: `${JSON.stringify({ name: 'tar', version: '7.5.19' })}\n`,
    },
  ]
}

function securityOverlayArchive() {
  return tarball([
    {
      path: 'package/package.json',
      body: `${JSON.stringify({
        name: 'brace-expansion',
        version: '5.0.12',
        main: './dist/commonjs/index.js',
        exports: { '.': { require: './dist/commonjs/index.js' } },
      })}\n`,
    },
    {
      path: 'package/dist/commonjs/index.js',
      body: "exports.expand = value => value === '{a,b}' ? ['a', 'b'] : [value]\n",
    },
  ])
}

function secondarySecurityOverlayArchive() {
  return tarball([
    {
      path: 'package/package.json',
      body: `${JSON.stringify({ name: 'tar', version: '7.5.22' })}\n`,
    },
  ])
}

function artifact(bytes, artifactVersion = version) {
  return Object.freeze({
    version: artifactVersion,
    resolved: `https://registry.npmjs.org/npm/-/npm-${artifactVersion}.tgz`,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  })
}

function repositoryFixture(bytes, { overlayBytes, secondaryOverlayBytes, overlayVersion = '5.0.12' } = {}) {
  const root = join(temporaryDirectory(), 'consumer')
  const npmArtifact = artifact(bytes)
  const overlayArtifact = overlayBytes
    ? {
        name: 'brace-expansion',
        version: overlayVersion,
        resolved: `https://registry.npmjs.org/brace-expansion/-/brace-expansion-${overlayVersion}.tgz`,
        integrity: `sha512-${createHash('sha512').update(overlayBytes).digest('base64')}`,
      }
    : null
  const secondaryOverlayArtifact = secondaryOverlayBytes
    ? {
        name: 'tar',
        version: '7.5.22',
        resolved: 'https://registry.npmjs.org/tar/-/tar-7.5.22.tgz',
        integrity: `sha512-${createHash('sha512').update(secondaryOverlayBytes).digest('base64')}`,
      }
    : null
  const devDependencies = {
    npm: version,
    ...(overlayArtifact ? { 'npm-runtime-brace-expansion-patch': `npm:brace-expansion@${overlayVersion}` } : {}),
    ...(secondaryOverlayArtifact ? { 'npm-runtime-tar-patch': 'npm:tar@7.5.22' } : {}),
  }
  write(join(root, 'package.json'), `${JSON.stringify({ name: 'consumer', version: '0.0.0', devDependencies }, null, 2)}\n`)
  write(join(root, 'package-lock.json'), `${JSON.stringify({
    name: 'consumer',
    version: '0.0.0',
    lockfileVersion: 3,
    packages: {
      '': { name: 'consumer', version: '0.0.0', devDependencies },
      'node_modules/npm': {
        version,
        resolved: npmArtifact.resolved,
        integrity: npmArtifact.integrity,
        bin: { npm: 'bin/npm-cli.js' },
      },
      ...(overlayArtifact ? { 'node_modules/npm-runtime-brace-expansion-patch': overlayArtifact } : {}),
      ...(secondaryOverlayArtifact ? { 'node_modules/npm-runtime-tar-patch': secondaryOverlayArtifact } : {}),
    },
  }, null, 2)}\n`)
  return { artifact: npmArtifact, overlayArtifact, root: realpathSync(root), secondaryOverlayArtifact }
}

function assertMaterializationRejects(entries, pattern, { mutateArtifact } = {}) {
  const bytes = tarball(entries)
  const value = mutateArtifact ? mutateArtifact(artifact(bytes)) : artifact(bytes)
  const parentDirectory = temporaryDirectory('verified npm rejection ')
  assert.throws(
    () => materializeVerifiedExactNpmRuntime({ artifact: value, tarballBytes: bytes, parentDirectory }),
    pattern,
  )
  assert.deepEqual(readdirSync(parentDirectory), [], 'failed materialization must remove its disposable extraction root')
}

test.after(() => {
  for (const path of temporary) rmSync(path, { recursive: true, force: true })
})

test('valid lock-digested archive materializes outside the repository and cleanup revokes it', () => {
  const bytes = tarball(npmEntries())
  const repository = repositoryFixture(bytes)
  const parentDirectory = temporaryDirectory()
  const runtime = materializeVerifiedExactNpmRuntime({
    artifact: resolveExactNpmArtifact(repository.root),
    tarballBytes: bytes,
    parentDirectory,
    env: { ...process.env, NODE_OPTIONS: '--definitely-not-a-real-node-option', NODE_PATH: '/attacker' },
  })
  assert.equal(runtime.toolchain.npm, version)
  assert.equal(runtime.toolchain.node, process.version)
  assert.ok(runtime.cli.startsWith(`${runtime.root}/package/`))
  assert.ok(!runtime.cli.startsWith(`${repository.root}/node_modules/`))
  assert.equal(readFileSync(runtime.cli, 'utf8'), npmEntries()[1].body)
  assert.ok(existsSync(runtime.root))
  runtime.cleanup()
  runtime.cleanup()
  assert.equal(existsSync(runtime.root), false)
})

test('prepare downloads only the canonical lock URL and ignores perfect-looking project npm poison', async () => {
  const bytes = tarball(npmEntriesWithSecurityOverlayPreimage())
  const overlayBytes = securityOverlayArchive()
  const secondaryOverlayBytes = secondarySecurityOverlayArchive()
  const repository = repositoryFixture(bytes, { overlayBytes, secondaryOverlayBytes })
  const poisonMarker = join(dirname(repository.root), 'poisoned-installed-npm-ran')
  write(join(repository.root, 'node_modules/npm/package.json'), `${JSON.stringify({ name: 'npm', version, bin: { npm: 'bin/npm-cli.js' } })}\n`)
  write(join(repository.root, 'node_modules/npm/bin/npm-cli.js'), `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(poisonMarker)}, 'ran')\nif (process.argv[2] === '--version') console.log('${version}')\n`, 0o755)
  const urls = []
  const runtime = await prepareVerifiedExactNpmRuntime({
    repositoryRoot: repository.root,
    parentDirectory: temporaryDirectory(),
    download: async (url) => { urls.push(url); return bytes },
    downloadSecurityOverlay: async (url) => {
      urls.push(url)
      return url === repository.overlayArtifact.resolved ? overlayBytes : secondaryOverlayBytes
    },
  })
  try {
    assert.deepEqual(urls, [
      repository.artifact.resolved,
      repository.overlayArtifact.resolved,
      repository.secondaryOverlayArtifact.resolved,
    ])
    assert.equal(runtime.securityOverlay.status, 'applied')
    assert.equal(runtime.securityOverlay.version, '5.0.12')
    assert.equal(
      JSON.parse(readFileSync(join(runtime.packageRoot, 'node_modules/brace-expansion/package.json'), 'utf8')).version,
      '5.0.12',
    )
    assert.equal(
      JSON.parse(readFileSync(join(runtime.packageRoot, 'node_modules/tar/package.json'), 'utf8')).version,
      '7.5.22',
    )
    assert.notEqual(runtime.cli, join(repository.root, 'node_modules/npm/bin/npm-cli.js'))
    assert.equal(existsSync(poisonMarker), false)
  } finally {
    runtime.cleanup()
  }
})

test('runtime contract fails closed when either content-addressed security overlay alias is absent', () => {
  const bytes = tarball(npmEntriesWithSecurityOverlayPreimage())
  const repository = repositoryFixture(bytes)
  assert.throws(
    () => resolveExactNpmRuntimeContract(repository.root),
    /must pin the exact dev-only npm security overlay aliases/,
  )
})

test('wrong compressed SHA-512 fails before extraction', () => {
  const bytes = tarball(npmEntries())
  const parentDirectory = temporaryDirectory('verified npm integrity ')
  const wrongBytes = Buffer.from(bytes)
  wrongBytes[wrongBytes.length - 1] ^= 1
  assert.throws(
    () => materializeVerifiedExactNpmRuntime({ artifact: artifact(bytes), tarballBytes: wrongBytes, parentDirectory }),
    /SHA-512 differs from the committed lock/,
  )
  assert.deepEqual(readdirSync(parentDirectory), [])
})

for (const [label, maliciousEntry, pattern] of [
  ['path traversal', { path: 'package/../escape', body: 'escape' }, /traversal segments/],
  ['absolute path', { path: '/package/escape', body: 'escape' }, /not a portable relative path/],
  ['symlink', { path: 'package/escape', body: '', type: '2', linkname: '../../escape' }, /unsupported directory\/link\/special\/PAX entry type:2/],
  ['hardlink', { path: 'package/escape', body: '', type: '1', linkname: 'package/package.json' }, /unsupported directory\/link\/special\/PAX entry type:1/],
  ['directory record', { path: 'package/bin', body: '', mode: 0o755, type: '5' }, /unsupported directory\/link\/special\/PAX entry type:5/],
]) {
  test(`closed ustar parser rejects ${label}`, () => {
    assertMaterializationRejects([maliciousEntry, ...npmEntries()], pattern)
  })
}

test('closed ustar parser rejects portable aliases and file ancestors', () => {
  assertMaterializationRejects([
    { path: 'package/PACKAGE.json', body: '{}' },
    ...npmEntries(),
  ], /duplicate or portable-alias paths/)
  assertMaterializationRejects([
    { path: 'package/bin', body: 'file' },
    ...npmEntries(),
  ], /file is an ancestor/)
})

for (const [label, options, pattern] of [
  ['wrong package name', { packageName: 'not-npm' }, /package identity differs/],
  ['wrong package version', { packageVersion: '99.0.0' }, /package identity differs/],
  ['wrong package bin', { bin: 'bin/attacker.js' }, /does not bind bin\/npm-cli\.js/],
  ['missing CLI', { includeCli: false }, /verified npm CLI/],
  ['non-executable CLI', { cliMode: 0o644 }, /not executable/],
  ['wrong CLI version', { cli: "if (process.argv[2] === '--version') console.log('99.0.0')\n" }, /reports 99\.0\.0/],
  ['failing CLI', { cli: 'process.exit(44)\n' }, /version probe failed with exit 44/],
]) {
  test(`${label} fails closed and removes disposable runtime`, () => {
    assertMaterializationRejects(npmEntries(options), pattern)
  })
}

test('canonical downloader rejects noncanonical origins and URL decorations before I/O', async () => {
  await assert.rejects(() => downloadCanonicalNpmTarball('https://attacker.invalid/npm.tgz'), /outside the canonical registry contract/)
  await assert.rejects(() => downloadCanonicalNpmTarball(`https://registry.npmjs.org/npm/-/npm-${version}.tgz?redirect=1`), /outside the canonical registry contract/)
  await assert.rejects(() => downloadCanonicalNpmTarball(`http://registry.npmjs.org/npm/-/npm-${version}.tgz`), /outside the canonical registry contract/)
})

test('test-only HTTPS transport serves a deterministic exact lock artifact without a production bypass', async () => {
  const fixture = buildDeterministicNpmRuntimeArchive({
    version,
    cliSource: `if (process.argv[2] === '--version') console.log('${version}')\n`,
  })
  const restore = installCanonicalNpmHttpsFixture(fixture)
  try {
    const downloaded = await downloadCanonicalNpmTarball(fixture.artifact.resolved, { environment: {} })
    assert.deepEqual(downloaded, fixture.tarballBytes)
    const runtime = materializeVerifiedExactNpmRuntime({
      artifact: fixture.artifact,
      tarballBytes: downloaded,
      parentDirectory: temporaryDirectory(),
    })
    runtime.cleanup()
  } finally {
    restore()
  }
})

// 2026-09-29:下載暫時性失敗要重試(ab9a4e1a 那一輪死在「canonical npm download timed out」),契約失敗不重試;兩面對照。
test('transient registry download failures are classified two-sided', () => {
  for (const message of [
    'GOV-NPM-RUNTIME-001:canonical npm download timed out',
    'read ECONNRESET',
    'getaddrinfo EAI_AGAIN registry.npmjs.org',
    'socket hang up',
    'GOV-NPM-RUNTIME-001:canonical npm download returned HTTP 503; redirects are forbidden',
  ]) assert.equal(isTransientRegistryDownloadFailure(new Error(message)), true, message)
  for (const message of [
    'GOV-NPM-RUNTIME-001:canonical npm download returned HTTP 404; redirects are forbidden',
    'GOV-NPM-RUNTIME-001:canonical npm download returned HTTP 301; redirects are forbidden',
    'GOV-NPM-RUNTIME-001:canonical npm tarball URL is outside the canonical registry contract',
    'GOV-NPM-RUNTIME-001:canonical npm download exceeded the closed archive budget',
    'GOV-NPM-RUNTIME-001:canonical npm download length differs from Content-Length',
    'GOV-NPM-RUNTIME-001:canonical npm download is empty',
    'GOV-NPM-RUNTIME-001:npm tarball is not a bounded canonical gzip archive:unexpected end',
  ]) assert.equal(isTransientRegistryDownloadFailure(new Error(message)), false, message)
})

test('download retry: timed-out attempts are retried with backoff, contract failures are not, exhaustion fails closed with attempts', async () => {
  const waits = []
  const reports = []
  const sleep = async (ms) => { waits.push(ms) }
  const report = (line) => { reports.push(line) }
  let calls = 0
  const bytes = await downloadWithTransientRetry(async () => {
    calls += 1
    if (calls < 3) throw new Error('GOV-NPM-RUNTIME-001:canonical npm download timed out')
    return Buffer.from('ok')
  }, { label: 'canonical npm', sleep, report })
  assert.deepEqual(bytes, Buffer.from('ok'))
  assert.equal(calls, 3)
  assert.deepEqual(waits, [2_000, 4_000])
  assert.equal(reports.length, 2)
  assert.match(reports[0], /attempt 1\/3/)

  let contractCalls = 0
  await assert.rejects(() => downloadWithTransientRetry(async () => {
    contractCalls += 1
    throw new Error('GOV-NPM-RUNTIME-001:canonical npm download returned HTTP 404; redirects are forbidden')
  }, { sleep, report }), /HTTP 404/)
  assert.equal(contractCalls, 1, 'contract failure must not be retried')

  let exhausted = 0
  await assert.rejects(() => downloadWithTransientRetry(async () => {
    exhausted += 1
    throw new Error('read ECONNRESET')
  }, { sleep, report }), new RegExp(`ECONNRESET\\(after ${NPM_RUNTIME_DOWNLOAD_RETRY_LIMIT} attempts\\)`))
  assert.equal(exhausted, NPM_RUNTIME_DOWNLOAD_RETRY_LIMIT)
})

// 2026-09-30:渲染用參考樹(舊 commit)可用歷史認證修補層 5.0.9;預設合約(一般安裝 / 發版 / consumer 同步)不行。兩面對照。
test('historically certified overlay is accepted only when the caller opts in for a render-only reference tree', () => {
  const bytes = tarball(npmEntriesWithSecurityOverlayPreimage())
  const historical = repositoryFixture(bytes, { overlayBytes: Buffer.from('overlay-5.0.9'), secondaryOverlayBytes: Buffer.from('tar-7.5.22'), overlayVersion: '5.0.9' })
  assert.throws(() => resolveExactNpmRuntimeContract(historical.root), /must pin the exact dev-only npm security overlay aliases/, 'default contract must reject the superseded overlay')
  const contract = resolveExactNpmRuntimeContract(historical.root, { historicalOverlay: true })
  assert.equal(contract.securityOverlay.version, '5.0.9')
  assert.equal(contract.securityOverlay.resolved, 'https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.9.tgz')
  const uncertified = repositoryFixture(bytes, { overlayBytes: Buffer.from('overlay-5.0.7'), secondaryOverlayBytes: Buffer.from('tar-7.5.22'), overlayVersion: '5.0.7' })
  assert.throws(() => resolveExactNpmRuntimeContract(uncertified.root, { historicalOverlay: true }), /must pin the exact dev-only npm security overlay aliases/, 'an overlay version that was never certified stays rejected')
  const current = repositoryFixture(bytes, { overlayBytes: Buffer.from('overlay-5.0.12'), secondaryOverlayBytes: Buffer.from('tar-7.5.22') })
  assert.equal(resolveExactNpmRuntimeContract(current.root, { historicalOverlay: true }).securityOverlay.version, '5.0.12', 'opting in never replaces the current overlay')
})

test('overlay downloader accepts only certified overlay tarballs before any I/O', async () => {
  await assert.rejects(() => downloadCanonicalNpmSecurityOverlayTarball('https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.7.tgz', { retryLimit: 1 }), /outside the canonical registry contract/)
})


// ── 2026-11-26 P0:下游 Claude Code 雲端 `setup:all` 必定 SELF_SIGNED_CERT_IN_CHAIN ──────────────────────────────────
// 要保證的性質:TLS 被重新簽、代理 CA 只在主機系統憑證庫時,鎖定鏈(父行程下載 + 子行程鎖定 npm + Playwright 瀏覽器下載)
// 仍連得上,而且信任錨不取自任何環境變數。下面幾題:(1) argv 契約 (2) 父行程信任錨的組成,系統庫在環境清空的子行程讀
// (3) 同族呼叫點全數經過共用入口,含 Playwright 下載子行程繼承 execArgv 的呼叫形狀 (4) 真 TLS 對照組:剝光環境變數、
// 只有系統憑證庫信任自訂 CA,拿掉修法必連不上、有修法必連得上;父行程環境帶著指向探針 CA 的 SSL_CERT_FILE / SSL_CERT_DIR 也不算數。
test('verified npm argv carries the system trust-store flag on every Node that can read the system store', () => {
  assert.deepEqual(VERIFIED_NODE_TLS_TRUST_ARGS, ['--use-system-ca'])
  // 判定表(Node 官方文件:--use-system-ca 三平台 22.15.0 / 23.9.0,tls.getCACertificates 22.15.0 / 23.10.0)。
  for (const [nodeVersion, expected] of [
    ['22.13.0', false], ['22.14.9', false], ['22.15.0', true], ['22.23.5', true],
    ['23.9.0', false], ['23.10.0', true], ['24.0.0', true], ['24.14.0', true], ['25.1.0', true],
    ['20.19.0', false], ['v22.15.0', true], ['22.15', false], ['not-a-version', false],
  ]) assert.equal(nodeReadsSystemTrustStore(nodeVersion), expected, nodeVersion)
  assert.deepEqual(verifiedNpmNodeArgv('/tmp/npm/bin/npm-cli.js', ['ci', '--ignore-scripts'], { nodeVersion: '22.15.0' }), ['--use-system-ca', '/tmp/npm/bin/npm-cli.js', 'ci', '--ignore-scripts'])
  assert.deepEqual(verifiedNpmNodeArgv('/tmp/npm/bin/npm-cli.js', ['ci'], { nodeVersion: '22.13.0' }), ['/tmp/npm/bin/npm-cli.js', 'ci'], 'older contract Node keeps the pre-fix argv (the flag would be a bad option there)')
  assert.equal(nodeReadsSystemTrustStore(process.versions.node), true, 'this test runner must be able to prove the fixed path')
  assert.deepEqual(verifiedNpmNodeArgv('/tmp/npm-cli.js', ['ci']).slice(0, 1), ['--use-system-ca'])
  assert.throws(() => verifiedNpmNodeArgv('', ['ci']), /verified npm CLI path is missing/)
  assert.throws(() => verifiedNpmNodeArgv('/tmp/npm-cli.js', ['ci', 1]), /argv must be an array of strings/)
})

test('in-process registry trust anchors are the bundled store plus the system store, never the environment-derived extra store', () => {
  const requested = []
  const fakeTls = {
    getCACertificates(type) {
      requested.push(type)
      return { bundled: ['BUNDLED-A', 'SHARED'], system: ['IN-PROCESS-SYSTEM-FOLLOWS-SSL_CERT_FILE'], extra: ['ENV-EXTRA'], default: ['BUNDLED-A', 'ENV-EXTRA'] }[type]
    },
  }
  let systemReads = 0
  const readSystemAnchors = () => {
    systemReads += 1
    return ['SYSTEM-PROXY-CA', 'SHARED']
  }
  assert.deepEqual(verifiedRegistryTrustAnchors({ tlsModule: fakeTls, nodeVersion: '22.15.0', readSystemAnchors }), ['BUNDLED-A', 'SHARED', 'SYSTEM-PROXY-CA'])
  // 'system' 不在本行程讀:本行程環境沒剝,Linux 上它會跟著 SSL_CERT_FILE / SSL_CERT_DIR 走(Node cli.md --use-system-ca 段)。
  assert.deepEqual(requested, ['bundled'], 'system / extra / default must never be read in the unsanitized parent process')
  assert.equal(systemReads, 1)
  assert.equal(verifiedRegistryTrustAnchors({ tlsModule: fakeTls, nodeVersion: '22.14.0', readSystemAnchors }), undefined, 'older contract Node keeps the Node default trust (pre-fix behavior)')
  assert.equal(requested.length + systemReads, 2, 'no trust-store read is attempted on a Node that cannot provide it')
  assert.throws(() => verifiedRegistryTrustAnchors({ tlsModule: {}, nodeVersion: '22.15.0', readSystemAnchors }), /tls\.getCACertificates is unavailable/)
  assert.throws(() => verifiedRegistryTrustAnchors({ tlsModule: { getCACertificates: () => [] }, nodeVersion: '22.15.0', readSystemAnchors }), /TLS trust anchors are unavailable/)
  const real = verifiedRegistryTrustAnchors()
  assert.ok(real.length > 0 && real.every((pem) => pem.includes('BEGIN CERTIFICATE')))
})

test('the system trust store is read by a same-Node child whose environment is empty', () => {
  const calls = []
  const pem = '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n'
  const anchors = readSystemTrustAnchorsWithoutEnvironment({
    execPath: '/host/node',
    runner(command, args, options) {
      calls.push({ command, args, options })
      return { status: 0, stdout: JSON.stringify([pem]), stderr: '' }
    },
  })
  assert.deepEqual(anchors, [pem])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, '/host/node')
  assert.deepEqual(calls[0].args.slice(0, 2), ['--input-type=module', '--eval'])
  assert.match(calls[0].args[2], /getCACertificates\('system'\)/)
  assert.equal(calls[0].args.length, 3, 'no inherited execArgv / flags reach the reader')
  assert.deepEqual(calls[0].options.env, {}, 'SSL_CERT_FILE / SSL_CERT_DIR / NODE_EXTRA_CA_CERTS / NODE_OPTIONS cannot reach the reader')
  assert.equal(calls[0].options.shell, false)
  for (const [result, pattern] of [
    [{ status: 1, stdout: '' }, /system trust store read failed:1/],
    [{ error: new Error('spawn EACCES') }, /system trust store read failed:spawn EACCES/],
    [{ status: 0, stdout: 'not json' }, /invalid JSON/],
    [{ status: 0, stdout: JSON.stringify(['not a pem']) }, /non-PEM data/],
    [{ status: 0, stdout: JSON.stringify({}) }, /non-PEM data/],
  ]) assert.throws(() => readSystemTrustAnchorsWithoutEnvironment({ runner: () => result }), pattern)
  assert.ok(Array.isArray(readSystemTrustAnchorsWithoutEnvironment()), 'the real reader returns the host system store (possibly empty)')
})

test('canonical downloads hand the bundled+system anchors to Node HTTPS', async () => {
  const fixture = buildDeterministicNpmRuntimeArchive({
    version,
    cliSource: `if (process.argv[2] === '--version') console.log('${version}')\n`,
  })
  const restore = installCanonicalNpmHttpsFixture(fixture)
  const fixtureRequest = https.request
  const seen = []
  https.request = function recordingRequest(input, options, callback) {
    seen.push(options)
    return fixtureRequest.call(this, input, options, callback)
  }
  syncBuiltinESMExports()
  try {
    // environment: {} —— 讓路由固定為直連(本機若設了不帶帳密的 HTTPS_PROXY,這個測 TLS 錨的測試不該改走代理)。
    await downloadCanonicalNpmTarball(fixture.artifact.resolved, { environment: {} })
  } finally {
    https.request = fixtureRequest
    syncBuiltinESMExports()
    restore()
  }
  assert.equal(seen.length, 1)
  assert.deepEqual(seen[0].ca, verifiedRegistryTrustAnchors())
})

test('every verified-npm spawn and the Playwright browser download in the setup, sync and candidate chain carry the shared trust flag', () => {
  // 同族全修(M10):鎖定 npm 的每個呼叫點。只剩 probeCli 的 `--version`(不連網)直接帶 cli。
  // 不在此列(交 release.yml 在 GitHub-hosted runner 跑、直接以 shebang 執行 npm):release-npm-publish /
  // release-npm-readback / release-npm-finalize-verify。
  const callers = [
    'scripts/lib/governance-dependency-bootstrap.mjs',
    'scripts/setup-provider-cli-toolchain.mjs',
    'scripts/install-candidate-dependencies.mjs',
    'scripts/run-verified-npm.mjs',
    'scripts/verify-upgrade-evidence.mjs',
  ]
  const rawSpawn = /process\.execPath,\s*\[\s*(?:cli|npmCli|runtime\.cli|npmRuntime\.cli)\b/
  for (const path of callers) {
    const source = readFileSync(path, 'utf8')
    assert.doesNotMatch(source, rawSpawn, `${path} spawns the verified npm CLI without the system trust-store flag`)
    assert.match(source, /verifiedNpmNodeArgv\(/, `${path} lost the shared verified npm argv`)
  }
  const runtimeSource = readFileSync('scripts/lib/verified-exact-npm-runtime.mjs', 'utf8')
  assert.deepEqual([...runtimeSource.matchAll(new RegExp(rawSpawn.source, 'g'))].length, 1, 'only the offline --version probe may spawn the CLI directly')
  assert.match(runtimeSource, /process\.execPath, \[cli, '--version'\]/)
  // 同族:DS repo 的 setup:all(setup-authority-governance.mjs)在剝除後的環境跑 Playwright 安裝,Chromium 由 Node HTTPS 下載
  //(playwright-core lib/server/utils/network.js 的 httpRequest,不傳 ca)。它的 node argv 一樣要經共用入口。
  const playwrightSource = readFileSync('scripts/ensure-playwright-browsers.mjs', 'utf8')
  assert.match(playwrightSource, /const installArgs = \[\.\.\.verifiedNodeTrustArgs\(\), cli, 'install'/, 'Playwright browser install lost the shared system trust-store flag')
  assert.doesNotMatch(playwrightSource, /installArgs = \[cli\b/)
  // 旗標要傳到真正下載的那支行程:Playwright CLI 以 child_process.fork(modulePath) 開下載子行程、不帶 options,
  // Node 文件:fork 的 execArgv「Default: process.execArgv」(https://nodejs.org/docs/latest-v22.x/api/child_process.html#child_processforkmodulepath-args-options)。
  // 升級 Playwright 若改成帶 options(可能覆寫 execArgv),這裡會紅,要重新查證。
  const fetcherSource = readFileSync('node_modules/playwright-core/lib/server/registry/browserFetcher.js', 'utf8')
  const forks = [...fetcherSource.matchAll(/childProcess\.fork\(([^;]*)\);/g)].map((match) => match[1])
  assert.deepEqual(forks, ['import_path.default.join(__dirname, "oopDownloadBrowserMain.js")'], 'Playwright download child must be forked without options so it inherits process.execArgv')
  assert.doesNotMatch(fetcherSource, /execArgv/, 'Playwright download fork must not override execArgv')
})

// 真 TLS 對照組。改系統憑證庫需要非互動 root,harness 測試本身不得執行 sudo / openssl(harness-source-inventory
// 的執行檔白名單),所以由 CI 的 workflow 步驟準備:發一張探針 CA 與 127.0.0.1 的伺服器憑證,先在「CA 未被信任」狀態跑一次,
// 再用 sudo 放進系統憑證庫後跑一次,跑完移除(.github/workflows/ci.yml「Cloud portability gates」)。
//   GOVERNANCE_SYSTEM_TRUST_STORE_PROBE = 憑證目錄(ca.pem / leaf.key / leaf.pem)
//   GOVERNANCE_SYSTEM_TRUST_STORE_PROBE_STATE = untrusted | trusted
// 沒給目錄(本機 macOS 沙箱不能改鑰匙圈)時以「儀器無法執行」標 skip,不算通過;給了目錄卻缺檔或狀態不認得 = 儀器失效,紅。
const SYSTEM_TRUST_PROBE_DIRECTORY = process.env.GOVERNANCE_SYSTEM_TRUST_STORE_PROBE
const SYSTEM_TRUST_PROBE_STATE = process.env.GOVERNANCE_SYSTEM_TRUST_STORE_PROBE_STATE
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SYSTEM_TRUST_PROBE_CLIENT = join(REPOSITORY_ROOT, 'scripts/test-fixtures/system-trust-probe-client.mjs')
const CERTIFICATE_ERROR = /^ERROR (?:SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|DEPTH_ZERO_SELF_SIGNED_CERT|CERT_UNTRUSTED)$/

// 子行程環境照鎖定鏈的規則剝除;帶上指向探針 CA 的 NODE_EXTRA_CA_CERTS / SSL_CERT_FILE / NODE_OPTIONS,證明它們不算數。
function probeEnvironment(directory) {
  const environment = sanitizeGovernanceBootstrapEnvironment({
    PATH: process.env.PATH,
    HOME: directory,
    NODE_EXTRA_CA_CERTS: join(directory, 'ca.pem'),
    SSL_CERT_FILE: join(directory, 'ca.pem'),
    SSL_CERT_DIR: directory,
    NODE_OPTIONS: '--use-openssl-ca',
  })
  assert.deepEqual(Object.keys(environment).sort(), ['HOME', 'PATH'])
  return environment
}

function settleProbe(resolvePromise) {
  return (error, stdout) => resolvePromise(String(stdout || '').trim() || `ERROR ${error?.code || error?.message || 'no-output'}`)
}

test('stripped environment + probe CA only in the system trust store: bundled-only fails, the locked chain connects', async (t) => {
  if (!SYSTEM_TRUST_PROBE_DIRECTORY) {
    t.skip('儀器無法執行:要由 CI 的 Linux runner 準備探針憑證並以 sudo 改系統憑證庫(GOVERNANCE_SYSTEM_TRUST_STORE_PROBE);本機不算通過')
    return
  }
  assert.ok(['untrusted', 'trusted'].includes(SYSTEM_TRUST_PROBE_STATE), `probe state must be untrusted or trusted, got ${SYSTEM_TRUST_PROBE_STATE}`)
  const server = createHttpsServer({
    key: readFileSync(join(SYSTEM_TRUST_PROBE_DIRECTORY, 'leaf.key')),
    cert: readFileSync(join(SYSTEM_TRUST_PROBE_DIRECTORY, 'leaf.pem')),
  }, (_request, response) => response.end('ok'))
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
  const port = String(server.address().port)
  const env = probeEnvironment(SYSTEM_TRUST_PROBE_DIRECTORY)
  try {
    const bundledOnly = await new Promise((resolvePromise) => execFile(process.execPath, ['--', SYSTEM_TRUST_PROBE_CLIENT, port, 'default'], { env, timeout: 20_000 }, settleProbe(resolvePromise)))
    const lockedNpmChild = await new Promise((resolvePromise) => execFile(process.execPath, ['--use-system-ca', '--', SYSTEM_TRUST_PROBE_CLIENT, port, 'default'], { env, timeout: 20_000 }, settleProbe(resolvePromise)))
    const downloadAnchors = await new Promise((resolvePromise) => execFile(process.execPath, ['--', SYSTEM_TRUST_PROBE_CLIENT, port, 'anchors'], { env, timeout: 20_000 }, settleProbe(resolvePromise)))
    // 父行程(剝除者)本身的環境沒剝:帶著指向探針 CA 的 SSL_CERT_FILE / SSL_CERT_DIR 跑下載臂。Linux 上若在本行程讀 'system',
    // 這兩個變數會把探針 CA 帶進信任錨(Node cli.md --use-system-ca 段)—— 所以 untrusted 態它必須仍連不上。
    const hostileParentAnchors = await new Promise((resolvePromise) => execFile(process.execPath, ['--', SYSTEM_TRUST_PROBE_CLIENT, port, 'anchors'], {
      env: { ...env, SSL_CERT_FILE: join(SYSTEM_TRUST_PROBE_DIRECTORY, 'ca.pem'), SSL_CERT_DIR: SYSTEM_TRUST_PROBE_DIRECTORY },
      timeout: 20_000,
    }, settleProbe(resolvePromise)))
    // 鎖定 npm 子行程真正拿到的旗標就是這一個(argv 契約由上面的判定表與呼叫點掃描守)。
    assert.deepEqual(verifiedNpmNodeArgv('/npm-cli.js').slice(0, 1), ['--use-system-ca'])
    // 對照臂(拿掉修法、環境變數已剝):不論 CA 在不在系統庫都必須連不上。
    assert.match(bundledOnly, CERTIFICATE_ERROR, `control arm (bundled-only) must reject the probe CA, got ${bundledOnly}`)
    if (SYSTEM_TRUST_PROBE_STATE === 'untrusted') {
      // 儀器對照:CA 還沒進系統庫時,有修法的兩臂也必須連不上 —— 否則後面的綠燈不代表系統庫真的起作用。
      assert.match(lockedNpmChild, CERTIFICATE_ERROR, `--use-system-ca must still reject an untrusted CA, got ${lockedNpmChild}`)
      assert.match(downloadAnchors, CERTIFICATE_ERROR, `download anchors must still reject an untrusted CA, got ${downloadAnchors}`)
      assert.match(hostileParentAnchors, CERTIFICATE_ERROR, `parent SSL_CERT_FILE / SSL_CERT_DIR must not reach the download anchors, got ${hostileParentAnchors}`)
    } else {
      assert.equal(lockedNpmChild, 'STATUS 200', 'locked npm child (--use-system-ca) must trust the system store')
      assert.equal(downloadAnchors, 'STATUS 200', 'in-process download anchors must trust the system store')
      assert.equal(hostileParentAnchors, 'STATUS 200', 'download anchors still trust the system store when the parent carries CA variables')
    }
  } finally {
    server.close()
  }
})

// ── 代理轉送(2026-11-26):判定表、npm 原始碼對照、呼叫端真的消費同一支判定 ──────────────────────────────
// 雲端 setup:all 在 npm ci 之後死在 audit signatures → ENOTFOUND tuf-repo-cdn.sigstore.dev(代理變數被剝光)。
// 規則只住 resolveGovernanceProxyForwarding:不帶帳密的 http(s) 代理只用來路由;其餘照舊剝除並印原因(不印值)。

test('proxy forwarding decision table: only credential-free http(s) HTTPS_PROXY / NO_PROXY are forwarded, with reasons and no values printed', () => {
  const cloudNoProxy = 'localhost,127.0.0.1,registry.npmjs.org'
  const rows = [
    // [環境, 轉送結果, 剝除原因(null = 沒有剝除), 路由用的 proxy 欄位]
    [{}, {}, null, null],
    [{ HTTPS_PROXY: 'http://proxy.internal:3128', NO_PROXY: cloudNoProxy }, { HTTPS_PROXY: 'http://proxy.internal:3128', NO_PROXY: cloudNoProxy }, null, { hostname: 'proxy.internal', port: 3128, protocol: 'http:' }],
    [{ https_proxy: 'https://proxy.internal' }, { HTTPS_PROXY: 'https://proxy.internal' }, null, { hostname: 'proxy.internal', port: 443, protocol: 'https:' }],
    [{ HTTPS_PROXY: 'http://proxy.internal' }, { HTTPS_PROXY: 'http://proxy.internal' }, null, { hostname: 'proxy.internal', port: 80, protocol: 'http:' }],
    [{ HTTPS_PROXY: 'http://[::1]:3128' }, { HTTPS_PROXY: 'http://[::1]:3128' }, null, { hostname: '[::1]', port: 3128, protocol: 'http:' }],
    [{ HTTPS_PROXY: 'http://proxy.internal:3128/some/path?q=1#x' }, { HTTPS_PROXY: 'http://proxy.internal:3128' }, null, { hostname: 'proxy.internal', port: 3128, protocol: 'http:' }],
    [{ HTTPS_PROXY: '  http://proxy.internal:3128  ' }, { HTTPS_PROXY: 'http://proxy.internal:3128' }, null, { hostname: 'proxy.internal', port: 3128, protocol: 'http:' }],
    // 帶帳密(帳號、密碼、兩者)→ 剝除;NO_PROXY 跟著不轉送(沒有代理就沒有要繞過的)。
    [{ HTTPS_PROXY: 'http://user:secret@proxy.internal:3128', NO_PROXY: cloudNoProxy }, {}, 'credentials', null],
    [{ HTTPS_PROXY: 'http://user@proxy.internal:3128' }, {}, 'credentials', null],
    [{ HTTPS_PROXY: 'http://:secret@proxy.internal:3128' }, {}, 'credentials', null],
    // 無法解析 / scheme 不支援。
    [{ HTTPS_PROXY: '127.0.0.1:3128' }, {}, 'unparseable', null],
    [{ HTTPS_PROXY: 'not a url' }, {}, 'unparseable', null],
    [{ HTTPS_PROXY: 'proxy.internal:3128' }, {}, 'unsupported-scheme', null],
    [{ HTTPS_PROXY: 'socks5://proxy.internal:1080' }, {}, 'unsupported-scheme', null],
    [{ HTTPS_PROXY: 'file:///etc/passwd' }, {}, 'unsupported-scheme', null],
    // 不轉送的代理名照舊剝除、不當候選。
    [{ HTTP_PROXY: 'http://proxy.internal:3128', http_proxy: 'http://proxy.internal:3128', ALL_PROXY: 'http://proxy.internal:3128', all_proxy: 'http://p:1', proxy: 'http://p:1', NOPROXY: 'x' }, {}, null, null],
    // 大小寫並存:照 curl 慣例取小寫;小寫帶帳密就剝除,不退回大寫(curl 也不會退回)。
    [{ https_proxy: 'http://lower.internal:1', HTTPS_PROXY: 'http://upper.internal:2' }, { HTTPS_PROXY: 'http://lower.internal:1' }, null, { hostname: 'lower.internal', port: 1, protocol: 'http:' }],
    [{ https_proxy: 'http://user:secret@lower.internal:1', HTTPS_PROXY: 'http://upper.internal:2' }, {}, 'credentials', null],
    [{ https_proxy: '', HTTPS_PROXY: 'http://upper.internal:2' }, { HTTPS_PROXY: 'http://upper.internal:2' }, null, { hostname: 'upper.internal', port: 2, protocol: 'http:' }],
    [{ HTTPS_PROXY: 'http://p.internal:1', no_proxy: 'lower.example', NO_PROXY: 'upper.example' }, { HTTPS_PROXY: 'http://p.internal:1', NO_PROXY: 'lower.example' }, null, { hostname: 'p.internal', port: 1, protocol: 'http:' }],
    // NO_PROXY 有控制字元 → 只剝 NO_PROXY,代理照轉。
    [{ HTTPS_PROXY: 'http://p.internal:1', NO_PROXY: 'a.example\nb.example' }, { HTTPS_PROXY: 'http://p.internal:1' }, 'unparseable', { hostname: 'p.internal', port: 1, protocol: 'http:' }],
  ]
  for (const [environment, forwarded, reason, proxy] of rows) {
    const label = JSON.stringify(environment)
    const decision = resolveGovernanceProxyForwarding(environment)
    assert.deepEqual({ ...decision.forwarded }, forwarded, label)
    assert.equal(decision.notices.find((notice) => notice.kind === 'dropped')?.reason ?? null, reason, label)
    if (proxy) {
      assert.equal(decision.proxy.hostname, proxy.hostname, label)
      assert.equal(decision.proxy.port, proxy.port, label)
      assert.equal(decision.proxy.protocol, proxy.protocol, label)
    } else {
      assert.equal(decision.proxy, null, label)
    }
    for (const line of formatGovernanceProxyNotices(decision)) {
      assert.doesNotMatch(line, /secret|user@|proxy\.internal|lower\.internal|upper\.internal|p\.internal|3128|example|::1|passwd/, `notice prints a value:${line}`)
    }
  }
  // 原因字串逐字(spec:只印「帶帳密 / 無法解析 / scheme 不支援」)。
  assert.match(formatGovernanceProxyNotices(resolveGovernanceProxyForwarding({ HTTPS_PROXY: 'http://u:p@h:1' })).join('\n'), /GOV-PROXY-FORWARD:HTTPS_PROXY 帶帳密/)
  assert.match(formatGovernanceProxyNotices(resolveGovernanceProxyForwarding({ https_proxy: '127.0.0.1:1' })).join('\n'), /GOV-PROXY-FORWARD:https_proxy 無法解析/)
  assert.match(formatGovernanceProxyNotices(resolveGovernanceProxyForwarding({ HTTPS_PROXY: 'socks5://h:1' })).join('\n'), /GOV-PROXY-FORWARD:HTTPS_PROXY scheme 不支援/)
  assert.match(formatGovernanceProxyNotices(resolveGovernanceProxyForwarding({ https_proxy: 'http://a:1', HTTPS_PROXY: 'http://b:2' })).join('\n'), /https_proxy 與 HTTPS_PROXY 同時存在且不同,照 curl 慣例取小寫/)
  assert.match(formatGovernanceProxyNotices(resolveGovernanceProxyForwarding({ HTTPS_PROXY: 'http://h:1', NO_PROXY: 'x' })).join('\n'), /轉送 HTTPS_PROXY\(來源 HTTPS_PROXY,scheme=http:,帳密=無\)、NO_PROXY=有/)
  // 代理家族名不分大小寫(@npmcli/agent proxy.js 不分大小寫讀)。
  for (const name of ['HTTPS_PROXY', 'https_proxy', 'Https_Proxy', 'HTTP_PROXY', 'proxy', 'PROXY', 'ALL_PROXY', 'no_proxy', 'NO_PROXY', 'NoProxy', 'NOPROXY']) assert.equal(isGovernanceProxyFamilyName(name), true, name)
  for (const name of ['PATH', 'HOME', 'PROXY_HOST', 'MY_HTTPS_PROXY_URL', 'NODE_EXTRA_CA_CERTS']) assert.equal(isGovernanceProxyFamilyName(name), false, name)
})

test('NO_PROXY matching mirrors the exact @npmcli/agent bundled in npm 11.19.0, row by row', async () => {
  // 對照組直接載入 npm 11.19.0 內建的 @npmcli/agent lib/proxy.js(鎖定 npm 子行程用它判定),兩邊逐格必須相同。
  const { default: agentProxy } = await import('../node_modules/npm/node_modules/@npmcli/agent/lib/proxy.js')
  assert.equal(JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'node_modules/npm/node_modules/@npmcli/agent/package.json'), 'utf8')).version, '4.0.2', '@npmcli/agent moved — re-read proxy.js before trusting this mirror')
  const rows = [
    ['https://registry.npmjs.org/x', 'localhost,127.0.0.1,registry.npmjs.org', true],
    ['https://tuf-repo-cdn.sigstore.dev/timestamp.json', 'localhost,127.0.0.1,registry.npmjs.org', false],
    ['https://registry.npmjs.org/x', '.npmjs.org', true],
    ['https://registry.npmjs.org/x', 'npmjs.org', true],
    ['https://registry.npmjs.org/x', 'org', true],
    ['https://registry.npmjs.org/x', 'pmjs.org', false],
    ['https://registry.npmjs.org/x', '*', false],
    ['https://registry.npmjs.org/x', 'registry.npmjs.org:443', false],
    ['https://registry.npmjs.org/x', '  other.example ,  registry.npmjs.org  ', true],
    ['https://registry.npmjs.org/x', '', false],
    ['https://registry.npmjs.org/x', ',,', false],
    ['https://[::1]:8443/x', '[::1]', true],
    ['https://[::1]:8443/x', '::1', false],
    ['https://127.0.0.1/x', '127.0.0.1', true],
    ['https://127.0.0.1/x', '0.0.1', true],
  ]
  for (const [url, noProxy, expectedDirect] of rows) {
    const agentDirect = agentProxy.getProxy(url, { proxy: 'http://proxy.internal:3128', noProxy }) === null
    assert.equal(agentDirect, expectedDirect, `@npmcli/agent itself:${url} ${noProxy}`)
    assert.equal(matchesGovernanceNoProxy(new URL(url).hostname, noProxy), expectedDirect, `mirror:${url} ${noProxy}`)
    const route = resolveGovernanceProxyRoute(url, { HTTPS_PROXY: 'http://proxy.internal:3128', NO_PROXY: noProxy })
    assert.equal(route.mode, expectedDirect ? 'direct' : 'connect', `route:${url} ${noProxy}`)
  }
  assert.equal(resolveGovernanceProxyRoute('https://registry.npmjs.org/x', {}).mode, 'direct')
  assert.equal(resolveGovernanceProxyRoute('https://registry.npmjs.org/x', { HTTPS_PROXY: 'http://u:p@proxy.internal:3128' }).mode, 'direct')
})

test('npm reads the forwarded proxy only from the environment, including the TUF fetch path (source pins)', () => {
  // 以 npm 11.19.0 實際原始碼為準:環境變數同時涵蓋 registry 與 TUF 兩條路;npmrc 的 https-proxy 到不了 TUF。
  // 任何一處改寫(升級 npm)這裡就紅,要重新查證再改「代理轉送」段的出處。
  const npmRoot = join(REPOSITORY_ROOT, 'node_modules/npm')
  const proxySource = readFileSync(join(npmRoot, 'node_modules/@npmcli/agent/lib/proxy.js'), 'utf8')
  assert.match(proxySource, /const PROXY_ENV_KEYS = new Set\(\['https_proxy', 'http_proxy', 'proxy', 'no_proxy'\]\)/)
  assert.match(proxySource, /key = key\.toLowerCase\(\)/)
  assert.match(proxySource, /\? PROXY_ENV\.https_proxy\n/)
  assert.match(proxySource, /noProxy = PROXY_ENV\.no_proxy/)
  const registryFetch = readFileSync(join(npmRoot, 'node_modules/npm-registry-fetch/lib/index.js'), 'utf8')
  assert.match(registryFetch, /proxy: opts\.httpsProxy \|\| opts\.proxy,/)
  const verifySignatures = readFileSync(join(npmRoot, 'lib/utils/verify-signatures.js'), 'utf8')
  assert.match(verifySignatures, /tufClient\.initTUF\(\{\n\s+cachePath: this\.opts\.tufCache,\n\s+retry: this\.opts\.retry,\n\s+timeout: this\.opts\.timeout,\n\s+\}\)/, 'initTUF must still receive no proxy option (so only the environment reaches it)')
  const tufFetcher = readFileSync(join(npmRoot, 'node_modules/tuf-js/dist/fetcher.js'), 'utf8')
  assert.match(tufFetcher, /make_fetch_happen_1\.default\)\(url, \{\n\s+headers: \{\n\s+\[USER_AGENT_HEADER\]: this\.userAgent \|\| '',\n\s+\},\n\s+timeout: this\.timeout,\n\s+retry: this\.retry,\n\s+\}\)/)
  const remote = readFileSync(join(npmRoot, 'node_modules/make-fetch-happen/lib/remote.js'), 'utf8')
  assert.match(remote, /const agent = getAgent\(request\.url, \{ \.\.\.options, signal: undefined \}\)/)
  assert.equal(existsSync(join(npmRoot, 'node_modules/tuf-js/node_modules/make-fetch-happen')), false, 'tuf-js must use the hoisted make-fetch-happen → @npmcli/agent')
  assert.equal(existsSync(join(npmRoot, 'node_modules/make-fetch-happen/node_modules/@npmcli/agent')), false, 'make-fetch-happen must use the hoisted @npmcli/agent')
})

test('every locked-chain environment builder consumes the shared proxy decision (sanitize, isolated npm env, upgrade reconstruction)', () => {
  const reported = []
  const hostile = {
    PATH: '/usr/bin:/bin',
    HOME: '/home/runner',
    HTTPS_PROXY: 'http://proxy.internal:3128',
    NO_PROXY: 'localhost,registry.npmjs.org',
    HTTP_PROXY: 'http://proxy.internal:3128',
    ALL_PROXY: 'http://proxy.internal:3128',
    Https_Proxy: 'http://mixed.internal:1',
    proxy: 'http://bare.internal:1',
    NODE_EXTRA_CA_CERTS: '/tmp/ca.pem',
    SSL_CERT_FILE: '/tmp/ca.pem',
    NODE_OPTIONS: '--use-openssl-ca',
    NPM_CONFIG_HTTPS_PROXY: 'http://npmrc.internal:1',
    npm_config_noproxy: '*',
  }
  const sanitized = sanitizeGovernanceBootstrapEnvironment(hostile, { report: (decision) => reported.push(decision) })
  assert.deepEqual(sanitized, { PATH: '/usr/bin:/bin', HOME: '/home/runner', HTTPS_PROXY: 'http://proxy.internal:3128', NO_PROXY: 'localhost,registry.npmjs.org' })
  assert.equal(reported.length, 1)
  assert.equal(reported[0].notices.at(-1).kind, 'forwarded')
  const credentialed = sanitizeGovernanceBootstrapEnvironment({ ...hostile, HTTPS_PROXY: 'http://user:secret@proxy.internal:3128' }, { report: (decision) => reported.push(decision) })
  assert.deepEqual(credentialed, { PATH: '/usr/bin:/bin', HOME: '/home/runner' })
  assert.deepEqual(reported[1].notices.map((notice) => notice.reason), ['credentials'])

  const isolated = createIsolatedGovernanceNpmEnvironment({ PATH: '/usr/bin:/bin', HOME: '/home/runner', HTTPS_PROXY: 'http://proxy.internal:3128', NO_PROXY: 'registry.npmjs.org', HTTP_PROXY: 'http://x:1' })
  try {
    assert.equal(isolated.env.HTTPS_PROXY, 'http://proxy.internal:3128')
    assert.equal(isolated.env.NO_PROXY, 'registry.npmjs.org')
    assert.equal(isolated.env.HTTP_PROXY, undefined)
    assert.equal(readFileSync(isolated.env.NPM_CONFIG_USERCONFIG, 'utf8'), 'registry=https://registry.npmjs.org/\nignore-scripts=true\nstrict-ssl=true\nalways-auth=false\n', 'npmrc stays closed: proxy routing is environment-only')
  } finally {
    isolated.cleanup()
  }

  const upgradeRoot = temporaryDirectory('upgrade npm env ')
  const upgrade = upgradeIsolatedNpmEnvironment(upgradeRoot, { HTTPS_PROXY: 'http://proxy.internal:3128', NO_PROXY: 'registry.npmjs.org', HTTP_PROXY: 'http://x:1', NODE_OPTIONS: '--x' })
  assert.equal(upgrade.HTTPS_PROXY, 'http://proxy.internal:3128')
  assert.equal(upgrade.NO_PROXY, 'registry.npmjs.org')
  assert.equal(upgrade.HTTP_PROXY, undefined)
  assert.equal(upgrade.NODE_OPTIONS, undefined)
  const upgradeCredentialed = upgradeIsolatedNpmEnvironment(temporaryDirectory('upgrade npm env '), { HTTPS_PROXY: 'http://u:p@proxy.internal:3128' })
  assert.equal(Object.keys(upgradeCredentialed).some((name) => isGovernanceProxyFamilyName(name)), false)

  // 呼叫點掃描(同族全修 M10):鎖定 npm 子行程的環境一律出自共用剝除 / 共用判定,不得自己拼代理變數。
  for (const [path, pattern] of [
    ['scripts/lib/governance-dependency-bootstrap.mjs', /const forwarding = resolveGovernanceProxyForwarding\(baseEnvironment\)/],
    ['scripts/verify-upgrade-evidence.mjs', /const forwarding = resolveGovernanceProxyForwarding\(baseEnvironment\)/],
    ['scripts/run-verified-npm.mjs', /sanitizeGovernanceBootstrapEnvironment\(environment\)/],
    ['scripts/install-candidate-dependencies.mjs', /createIsolatedGovernanceNpmEnvironment\(environment,/],
    ['scripts/setup-provider-cli-toolchain.mjs', /createIsolatedGovernanceNpmEnvironment\(baseEnvironment,/],
    ['scripts/setup-authority-governance.mjs', /sanitizeGovernanceBootstrapEnvironment\(baseEnvironment\)/],
    ['scripts/setup-governance.mjs', /sanitizeGovernanceBootstrapEnvironment\(baseEnvironment\)/],
  ]) {
    const source = readFileSync(join(REPOSITORY_ROOT, path), 'utf8')
    assert.match(source, pattern, `${path} no longer builds its npm environment through the shared proxy decision`)
    assert.doesNotMatch(source, /\b(?:HTTPS_PROXY|https_proxy|NO_PROXY|no_proxy)\s*:/, `${path} hand-writes a proxy variable`)
  }
  const runtimeSource = readFileSync(join(REPOSITORY_ROOT, 'scripts/lib/verified-exact-npm-runtime.mjs'), 'utf8')
  assert.match(runtimeSource, /const route = resolveGovernanceProxyRoute\(target\.href, environment\)/, 'the in-process download lost the shared route decision')
  assert.match(runtimeSource, /await download\(artifact\.resolved, \{ environment: env \}\)/)
  assert.equal([...runtimeSource.matchAll(/await downloadSecurityOverlay\(artifact\.securityOverlay\.(?:secondaryResolved|resolved), \{ environment: env \}\)/g)].length, 2)
})

test('canonical downloads take the shared route: NO_PROXY hit goes direct, otherwise a CONNECT tunnel to the forwarded proxy with the same trust anchors', async () => {
  const fixture = buildDeterministicNpmRuntimeArchive({ version, cliSource: `if (process.argv[2] === '--version') console.log('${version}')\n` })
  const tunnels = []
  const refuse = async (options) => {
    tunnels.push(options)
    throw new Error('GOV-NPM-RUNTIME-001:test tunnel refused')
  }
  // 經代理:主機不在 NO_PROXY → 一定先開隧道(這裡拒絕),帶的是轉送的代理與同一組 ca。
  await assert.rejects(
    downloadCanonicalNpmTarball(fixture.artifact.resolved, { environment: { HTTPS_PROXY: 'http://proxy.internal:3128', NO_PROXY: 'example.com' }, openTunnel: refuse, retryLimit: 1 }),
    /test tunnel refused/,
  )
  assert.equal(tunnels.length, 1)
  assert.equal(tunnels[0].host, 'registry.npmjs.org')
  assert.equal(tunnels[0].port, 443)
  assert.equal(tunnels[0].proxy.origin, 'http://proxy.internal:3128')
  assert.deepEqual(tunnels[0].ca, verifiedRegistryTrustAnchors())
  // 帶帳密 → 不轉送 → 直連(不開隧道);registry 在 NO_PROXY → 直連。兩者都由 https fixture 直接回應。
  const restore = installCanonicalNpmHttpsFixture(fixture)
  try {
    for (const environment of [
      { HTTPS_PROXY: 'http://user:secret@proxy.internal:3128' },
      { HTTPS_PROXY: 'http://proxy.internal:3128', NO_PROXY: 'localhost,registry.npmjs.org' },
    ]) {
      assert.deepEqual(await downloadCanonicalNpmTarball(fixture.artifact.resolved, { environment, openTunnel: refuse, retryLimit: 1 }), fixture.tarballBytes)
    }
  } finally {
    restore()
  }
  assert.equal(tunnels.length, 1, 'direct routes must never open a tunnel')
})

// TRACKER R74(workspace 2026-11-27 雲端 session 實測):DS repo 掛到 session 之後 sync-all 仍 HTTP 401 —— 內建 fetch 不讀
// HTTPS_PROXY、直連 api.github.com。升級鏈讀 GitHub Release / npm attestation 的預設 fetch 改走同一支路由判定。兩面:
// 不帶帳密的代理 → CONNECT 隧道(同一組錨、重導向逐跳重判、跨 origin 不帶 Authorization);沒代理 / 帶帳密 / NO_PROXY → 內建 fetch。
test('upgrade-chain reads take the shared route: a credential-free HTTPS_PROXY tunnels (same anchors, per-hop redirects); no proxy, a credentialed proxy, or a NO_PROXY hit stay on the built-in fetch', async () => {
  const tunnels = []
  const requests = []
  const directCalls = []
  const anchors = Object.freeze(['TEST-ANCHOR'])
  const openTunnel = async (options) => {
    tunnels.push(options)
    return { destroyed: false, destroy() { this.destroyed = true } }
  }
  const release = 'https://api.github.com/repos/ajenchen/design-system/releases/tags/v0.1.0-beta.152'
  const asset = 'https://release-assets.example.com/bom.json?sig=1'
  const replies = {
    [release]: { status: 302, headers: { location: asset } },
    [asset]: { status: 200, headers: { 'content-type': 'application/json' }, body: '{"ok":true}' },
  }
  const requestImpl = (url, options, onResponse) => {
    requests.push({ url: url.href, method: options.method, headers: options.headers, ca: options.ca, socket: options.createConnection() })
    const handle = new EventEmitter()
    handle.destroy = () => {}
    handle.end = () => {
      const reply = replies[url.href]
      const response = Readable.from(reply.body ? [Buffer.from(reply.body)] : [])
      Object.assign(response, { statusCode: reply.status, statusMessage: '', headers: reply.headers })
      onResponse(response)
    }
    return handle
  }
  const directFetch = async (url, options) => {
    directCalls.push({ url, options })
    return new Response('direct', { status: 200 })
  }
  const routed = (environment) => createGovernanceRoutedFetch({ environment, directFetch, openTunnel, trustAnchors: () => anchors, requestImpl, report: () => {} })
  const proxied = routed({ HTTPS_PROXY: 'http://proxy.internal:3128', NO_PROXY: 'registry.npmjs.org' })

  const response = await proxied(release, { headers: { Authorization: 'Bearer test-token', Accept: 'application/vnd.github+json' } })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.deepEqual(tunnels.map((item) => [item.proxy.origin, item.host, item.port, item.ca]), [
    ['http://proxy.internal:3128', 'api.github.com', 443, anchors],
    ['http://proxy.internal:3128', 'release-assets.example.com', 443, anchors],
  ])
  assert.equal(requests[0].headers.authorization, 'Bearer test-token')
  assert.equal(requests[0].headers['accept-encoding'], 'identity')
  assert.ok(requests[0].headers['user-agent'], 'GitHub refuses API reads without a User-Agent')
  assert.equal(requests[1].headers.authorization, undefined, 'a cross-origin redirect must not carry Authorization')
  assert.equal(requests[0].ca, anchors)
  assert.equal(directCalls.length, 0, 'a proxied route must never fall back to a direct read')
  await assert.rejects(proxied(release, { redirect: 'error' }), /redirect refused/)

  // NO_PROXY 命中 → 內建 fetch;沒有代理 / 帶帳密的代理(不轉送)→ 內建 fetch。三者都不開隧道。
  const tunnelsBefore = tunnels.length
  assert.equal(await (await proxied('https://registry.npmjs.org/-/npm/v1/attestations/x@1', {})).text(), 'direct')
  for (const environment of [{}, { HTTPS_PROXY: 'http://user:secret@proxy.internal:3128' }]) {
    assert.equal(await (await routed(environment)(release, {})).text(), 'direct')
  }
  assert.equal(directCalls.length, 3)
  assert.deepEqual(directCalls.map((call) => call.url), ['https://registry.npmjs.org/-/npm/v1/attestations/x@1', release, release])
  assert.equal(tunnels.length, tunnelsBefore, 'direct routes must never open a tunnel')

  // 呼叫點(同族全修 M10):升級鏈兩個讀網路的預設 fetch 都是這一支,不再是裸的內建 fetch。
  const provenance = readFileSync(join(REPOSITORY_ROOT, 'scripts/verify-upgrade-provenance.mjs'), 'utf8')
  assert.equal([...provenance.matchAll(/fetchImpl = governanceRoutedFetch\b/g)].length, 2)
  assert.doesNotMatch(provenance, /fetchImpl = (?:globalThis\.)?fetch\b/)
})

test('prepare hands its npm environment to every canonical download, so the download and the locked npm child route alike', async () => {
  const bytes = tarball(npmEntriesWithSecurityOverlayPreimage())
  const overlayBytes = securityOverlayArchive()
  const secondaryOverlayBytes = secondarySecurityOverlayArchive()
  const repository = repositoryFixture(bytes, { overlayBytes, secondaryOverlayBytes })
  const env = { PATH: process.env.PATH, HTTPS_PROXY: 'http://proxy.internal:3128', NO_PROXY: 'registry.npmjs.org' }
  const seen = []
  const runtime = await prepareVerifiedExactNpmRuntime({
    repositoryRoot: repository.root,
    parentDirectory: temporaryDirectory(),
    env,
    download: async (url, options) => { seen.push(options?.environment); return bytes },
    downloadSecurityOverlay: async (url, options) => {
      seen.push(options?.environment)
      return url === repository.overlayArtifact.resolved ? overlayBytes : secondaryOverlayBytes
    },
  })
  runtime.cleanup()
  assert.equal(seen.length, 3)
  for (const environment of seen) assert.equal(environment, env)
})

test('CONNECT tunnel through a credential-free local proxy: TLS is verified with the caller anchors only (probe certificates from CI)', async (t) => {
  if (!SYSTEM_TRUST_PROBE_DIRECTORY) {
    t.skip('儀器無法執行:要由 CI 的 Linux runner 準備探針憑證(GOVERNANCE_SYSTEM_TRUST_STORE_PROBE);本機不算通過')
    return
  }
  const probeCa = readFileSync(join(SYSTEM_TRUST_PROBE_DIRECTORY, 'ca.pem'), 'utf8')
  const server = createHttpsServer({
    key: readFileSync(join(SYSTEM_TRUST_PROBE_DIRECTORY, 'leaf.key')),
    cert: readFileSync(join(SYSTEM_TRUST_PROBE_DIRECTORY, 'leaf.pem')),
    // 握手失敗的伺服器端 socket 預設要等 handshakeTimeout(120 秒)才收;測試自己追蹤並在 finally 收掉,失敗時才不會掛著。
    handshakeTimeout: 10_000,
  }, (_request, response) => response.end('tunnel-ok'))
  const serverSockets = new Set()
  server.on('connection', (socket) => {
    serverSockets.add(socket)
    socket.on('close', () => serverSockets.delete(socket))
  })
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
  const port = server.address().port
  const records = []
  const proxy = await startConnectProxy({ allowPorts: [port], onRecord: (record) => records.push(record) })
  const route = resolveGovernanceProxyRoute(`https://127.0.0.1:${port}/`, { HTTPS_PROXY: `http://127.0.0.1:${proxy.port}` })
  assert.equal(route.mode, 'connect')
  const get = (socket) => new Promise((resolvePromise, rejectPromise) => {
    const handle = https.request({ host: '127.0.0.1', port, path: '/', createConnection: () => socket }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => resolvePromise(body))
    })
    handle.on('error', rejectPromise)
    handle.end()
  })
  try {
    // 與 caller 給的錨相同 → 通;代理只看到 CONNECT。
    const socket = await openGovernanceProxyTunnel({ proxy: route.proxy, host: '127.0.0.1', port, ca: [probeCa], timeoutMs: 10_000 })
    assert.equal(await get(socket), 'tunnel-ok')
    assert.ok(records.some((record) => record.method === 'CONNECT' && record.port === port && record.status === 200))
    // 對照:同一條隧道、錨只有內建 bundle(探針 CA 不在裡面)→ 必須拒絕。代理不新增任何信任。
    await assert.rejects(
      openGovernanceProxyTunnel({ proxy: route.proxy, host: '127.0.0.1', port, ca: tls.getCACertificates('bundled'), timeoutMs: 10_000 }),
      (error) => /SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT_LOCALLY|self-signed|unable to (?:verify|get)/i.test(`${error.code} ${error.message}`),
    )
    // 代理拒絕(非白名單埠)→ 隧道失敗、不退回直連。
    await assert.rejects(
      openGovernanceProxyTunnel({ proxy: route.proxy, host: '127.0.0.1', port: 443, ca: [probeCa], timeoutMs: 10_000 }),
      /proxy CONNECT returned HTTP 403/,
    )
  } finally {
    await proxy.close()
    for (const socket of serverSockets) socket.destroy()
    server.close()
  }
})
