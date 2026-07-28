#!/usr/bin/env node

import assert from 'node:assert/strict'
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
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import {
  downloadCanonicalNpmTarball,
  materializeVerifiedExactNpmRuntime,
  prepareVerifiedExactNpmRuntime,
  resolveExactNpmArtifact,
  resolveExactNpmRuntimeContract,
} from './lib/verified-exact-npm-runtime.mjs'
import {
  buildDeterministicNpmRuntimeArchive,
  installCanonicalNpmHttpsFixture,
} from './test-fixtures/verified-npm-runtime-archive.mjs'

const temporary = []
const version = '11.18.0'

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
  ]
}

function securityOverlayArchive() {
  return tarball([
    {
      path: 'package/package.json',
      body: `${JSON.stringify({
        name: 'brace-expansion',
        version: '5.0.8',
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

function artifact(bytes, artifactVersion = version) {
  return Object.freeze({
    version: artifactVersion,
    resolved: `https://registry.npmjs.org/npm/-/npm-${artifactVersion}.tgz`,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  })
}

function repositoryFixture(bytes, { overlayBytes } = {}) {
  const root = join(temporaryDirectory(), 'consumer')
  const npmArtifact = artifact(bytes)
  const overlayArtifact = overlayBytes
    ? {
        name: 'brace-expansion',
        version: '5.0.8',
        resolved: 'https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.8.tgz',
        integrity: `sha512-${createHash('sha512').update(overlayBytes).digest('base64')}`,
      }
    : null
  const devDependencies = {
    npm: version,
    ...(overlayArtifact ? { 'npm-runtime-brace-expansion-patch': 'npm:brace-expansion@5.0.8' } : {}),
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
    },
  }, null, 2)}\n`)
  return { artifact: npmArtifact, overlayArtifact, root: realpathSync(root) }
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
  const repository = repositoryFixture(bytes, { overlayBytes })
  const poisonMarker = join(dirname(repository.root), 'poisoned-installed-npm-ran')
  write(join(repository.root, 'node_modules/npm/package.json'), `${JSON.stringify({ name: 'npm', version, bin: { npm: 'bin/npm-cli.js' } })}\n`)
  write(join(repository.root, 'node_modules/npm/bin/npm-cli.js'), `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(poisonMarker)}, 'ran')\nif (process.argv[2] === '--version') console.log('${version}')\n`, 0o755)
  const urls = []
  const runtime = await prepareVerifiedExactNpmRuntime({
    repositoryRoot: repository.root,
    parentDirectory: temporaryDirectory(),
    download: async (url) => { urls.push(url); return bytes },
    downloadSecurityOverlay: async (url) => { urls.push(url); return overlayBytes },
  })
  try {
    assert.deepEqual(urls, [repository.artifact.resolved, repository.overlayArtifact.resolved])
    assert.equal(runtime.securityOverlay.status, 'applied')
    assert.equal(runtime.securityOverlay.version, '5.0.8')
    assert.equal(
      JSON.parse(readFileSync(join(runtime.packageRoot, 'node_modules/brace-expansion/package.json'), 'utf8')).version,
      '5.0.8',
    )
    assert.notEqual(runtime.cli, join(repository.root, 'node_modules/npm/bin/npm-cli.js'))
    assert.equal(existsSync(poisonMarker), false)
  } finally {
    runtime.cleanup()
  }
})

test('runtime contract fails closed when the content-addressed security overlay alias is absent', () => {
  const bytes = tarball(npmEntriesWithSecurityOverlayPreimage())
  const repository = repositoryFixture(bytes)
  assert.throws(
    () => resolveExactNpmRuntimeContract(repository.root),
    /must pin npm-runtime-brace-expansion-patch/,
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
