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
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import {
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
import { sanitizeGovernanceBootstrapEnvironment } from './lib/governance-dependency-bootstrap.mjs'
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
    const downloaded = await downloadCanonicalNpmTarball(fixture.artifact.resolved)
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
    await downloadCanonicalNpmTarball(fixture.artifact.resolved)
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
