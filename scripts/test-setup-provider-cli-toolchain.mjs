import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  deriveActivePackageContentPlan,
  deriveLockedPackageContentFromTarball,
  resolveProviderCliToolchainCandidateAuthority,
  resolveProviderCliToolchainAuthority,
  setupProviderCliToolchain,
  validateProviderCliFilesystemAuthority,
  verifyProviderCliRuntimeForCertification,
  verifyProviderCliToolchainStatic,
} from './setup-provider-cli-toolchain.mjs'
import { resolveExactNpmRuntimeContract } from './lib/verified-exact-npm-runtime.mjs'
import { captureGitVisibleWorktree } from './lib/worktree-fingerprint.mjs'

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SETUP_MODULE_URL = pathToFileURL(join(REPOSITORY_ROOT, 'scripts/setup-provider-cli-toolchain.mjs')).href
const PROVIDER_CLI_EXECUTION_PROBE = join(REPOSITORY_ROOT, 'scripts/test-fixtures/provider-cli-execution-probe.mjs')
const CANONICAL_AUTHORITY_MANIFEST = readFileSync(join(REPOSITORY_ROOT, 'infra/governance/providers/provider-cli-toolchain.json'))
const CANONICAL_AUTHORITY_LOCK = readFileSync(join(REPOSITORY_ROOT, 'infra/governance/providers/provider-cli-toolchain.package-lock.json'))
const CALLER_LOCK = JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'package-lock.json'), 'utf8'))
const NPM_ARTIFACT = CALLER_LOCK.packages['node_modules/npm']
const NPM_RUNTIME_CONTRACT = resolveExactNpmRuntimeContract(REPOSITORY_ROOT)
const NPM_OVERLAY = NPM_RUNTIME_CONTRACT.securityOverlay
const NPM_OVERLAY_SPEC = `npm:${NPM_OVERLAY.package}@${NPM_OVERLAY.version}`
const NPM_OVERLAY_ARTIFACT = CALLER_LOCK.packages[`node_modules/${NPM_OVERLAY.alias}`]
const TEST_PLATFORM = process.platform === 'darwin' ? 'darwin' : 'linux'
const TEST_ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'
const TEST_PLATFORM_ID = `${TEST_PLATFORM}-${TEST_ARCH}`

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function sha512Integrity(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

function packageManifestBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

function fakePackageFiles(lockPath, lock) {
  const entry = lock.packages[lockPath]
  assert.ok(entry, `missing fake package lock entry:${lockPath}`)
  const packageName = entry.name ?? lockPath.slice('node_modules/'.length)
  const files = new Map()
  if (lockPath === 'node_modules/@anthropic-ai/claude-code') {
    files.set('package.json', packageManifestBytes({
      name: packageName,
      version: entry.version,
      bin: { claude: 'bin/claude.exe' },
      scripts: { install: 'node forbidden-postinstall.cjs' },
    }))
  } else if (lockPath.startsWith('node_modules/@anthropic-ai/claude-code-')) {
    files.set('package.json', packageManifestBytes({ name: packageName, version: entry.version }))
    files.set('claude', Buffer.from('#!/usr/bin/env node\nprocess.stdout.write("2.1.215 (Claude Code)\\n")\n'))
  } else if (lockPath === 'node_modules/@openai/codex') {
    files.set('package.json', packageManifestBytes({
      name: packageName,
      version: entry.version,
      bin: { codex: 'bin/codex.js' },
    }))
    files.set('bin/codex.js', Buffer.from('#!/usr/bin/env node\nprocess.stdout.write("codex-cli 0.144.6\\n")\n'))
  } else if (lockPath.startsWith('node_modules/@openai/codex-')) {
    files.set('package.json', packageManifestBytes({ name: packageName, version: entry.version }))
  } else if (lockPath === 'node_modules/@future-ai/future-cli') {
    files.set('package.json', packageManifestBytes({
      name: packageName,
      version: entry.version,
      bin: { 'future-model': 'bin/future.js' },
    }))
    files.set('bin/future.js', Buffer.from('#!/usr/bin/env node\nprocess.stdout.write("future-model 1.2.3\\n")\n'))
  } else {
    assert.fail(`no fake package files for ${lockPath}`)
  }
  return files
}

function writeTarString(header, offset, length, value) {
  const bytes = Buffer.from(value, 'ascii')
  assert.ok(bytes.length <= length)
  bytes.copy(header, offset)
}

function writeTarOctal(header, offset, length, value) {
  const text = value.toString(8).padStart(length - 2, '0')
  assert.equal(text.length, length - 2)
  header.write(text, offset, length - 2, 'ascii')
  header[offset + length - 2] = 0x20
  header[offset + length - 1] = 0
}

function fakePackageTarball(files, { mutateHeader } = {}) {
  const blocks = []
  for (const [path, bodyValue] of [...files.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    const body = Buffer.from(bodyValue)
    const header = Buffer.alloc(512)
    writeTarString(header, 0, 100, `package/${path}`)
    writeTarOctal(header, 100, 8, path.startsWith('bin/') || path === 'claude' ? 0o755 : 0o644)
    writeTarOctal(header, 108, 8, 0)
    writeTarOctal(header, 116, 8, 0)
    writeTarOctal(header, 124, 12, body.length)
    writeTarOctal(header, 136, 12, 0)
    header.fill(0x20, 148, 156)
    header[156] = 0x30
    writeTarString(header, 257, 6, 'ustar')
    writeTarString(header, 263, 2, '00')
    mutateHeader?.(header, path)
    let checksum = 0
    for (const byte of header) checksum += byte
    const checksumText = checksum.toString(8).padStart(6, '0')
    header.write(checksumText, 148, 6, 'ascii')
    header[154] = 0
    header[155] = 0x20
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks), { mtime: 0 })
}

function packageContentRows(manifest, lock) {
  const requested = new Map()
  for (const tool of manifest.tools) {
    requested.set(`node_modules/${tool.packageName}`, [...manifest.installPolicy.supportedPlatforms])
    if (tool.platformPackage !== null) {
      for (const platform of manifest.installPolicy.supportedPlatforms) {
        requested.set(
          `node_modules/${tool.platformPackage.nameTemplate.replace('{platform}', platform)}`,
          [platform],
        )
      }
    }
  }
  const rows = []
  for (const [lockPath, platforms] of [...requested].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    const entry = lock.packages[lockPath]
    assert.ok(entry, `missing content authority lock entry:${lockPath}`)
    const tarball = fakePackageTarball(fakePackageFiles(lockPath, lock))
    entry.integrity = sha512Integrity(tarball)
    rows.push({ ...deriveLockedPackageContentFromTarball(tarball, { lockPath, ...entry }), platforms })
  }
  return rows
}

function toolchainBytes(manifest, lock, { refreshPackageContent = true } = {}) {
  if (refreshPackageContent) {
    manifest.packageContent = {
      protocol: 'npm-ustar-package-tree-v1',
      modePolicy: 'excluded-portable-content-only',
      packages: packageContentRows(manifest, lock),
    }
  }
  manifest.packageLock.packageCount = Object.keys(lock.packages).length - 1
  const lockBytes = Buffer.from(`${JSON.stringify(lock, null, 2)}\n`)
  manifest.packageLock.sha256 = sha256(lockBytes)
  return {
    lockBytes,
    manifestBytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
  }
}

function withSyntheticProvider({ provisioned }) {
  const manifest = JSON.parse(AUTHORITY_MANIFEST.toString('utf8'))
  const lock = JSON.parse(AUTHORITY_LOCK.toString('utf8'))
  manifest.providerBindings.push({
    providerId: 'future-model',
    provisioning: provisioned ? 'repo-provisioned-cli' : 'external-runtime',
    toolProviderId: provisioned ? 'future-model' : null,
  })
  if (provisioned) {
    manifest.tools.push({
      providerId: 'future-model',
      packageName: '@future-ai/future-cli',
      version: '1.2.3',
      executable: 'future-model',
      binKind: 'node-entrypoint',
      packageBin: 'bin/future.js',
      platformPackage: null,
      versionProbe: 'exact-semver-token',
    })
    lock.packages[''].dependencies['@future-ai/future-cli'] = '1.2.3'
    lock.packages['node_modules/@future-ai/future-cli'] = {
      version: '1.2.3',
      resolved: 'https://registry.npmjs.org/@future-ai/future-cli/-/future-cli-1.2.3.tgz',
      integrity: `sha512-${Buffer.alloc(64, 7).toString('base64')}`,
      bin: { 'future-model': 'bin/future.js' },
    }
  }
  return { manifest, lock, ...toolchainBytes(manifest, lock) }
}

const fixtureAuthority = toolchainBytes(
  JSON.parse(CANONICAL_AUTHORITY_MANIFEST.toString('utf8')),
  JSON.parse(CANONICAL_AUTHORITY_LOCK.toString('utf8')),
)
const AUTHORITY_MANIFEST = fixtureAuthority.manifestBytes
const AUTHORITY_LOCK = fixtureAuthority.lockBytes

function deriveSyntheticTarball(files, options = {}) {
  const lockPath = 'node_modules/@openai/codex'
  const tarball = fakePackageTarball(files, options)
  return deriveLockedPackageContentFromTarball(tarball, {
    lockPath,
    integrity: sha512Integrity(tarball),
  })
}

function write(path, bytes, options = {}) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, bytes, options)
}

function writeJson(path, value, options = {}) {
  write(path, `${JSON.stringify(value, null, 2)}\n`, options)
}

function runFixtureExecutable(target, args, cwd) {
  return spawnSync(
    process.execPath,
    ['--', PROVIDER_CLI_EXECUTION_PROBE, '--target', target, '--', ...args],
    { cwd, encoding: 'utf8', shell: false },
  )
}

function git(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
    },
    encoding: 'utf8',
    shell: false,
  })
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`)
}

function fixture(t, { role = 'authority', manifestBytes = AUTHORITY_MANIFEST, lockBytes = AUTHORITY_LOCK } = {}) {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'provider-cli-toolchain-test-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const packageManifest = {
    name: 'provider-cli-toolchain-fixture',
    private: true,
    version: '0.0.0',
    devDependencies: {
      npm: NPM_ARTIFACT.version,
      [NPM_OVERLAY.alias]: NPM_OVERLAY_SPEC,
    },
  }
  const packageLock = {
    name: packageManifest.name,
    version: packageManifest.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: packageManifest.name,
        version: packageManifest.version,
        devDependencies: {
          npm: NPM_ARTIFACT.version,
          [NPM_OVERLAY.alias]: NPM_OVERLAY_SPEC,
        },
      },
      'node_modules/npm': {
        version: NPM_ARTIFACT.version,
        resolved: NPM_ARTIFACT.resolved,
        integrity: NPM_ARTIFACT.integrity,
        dev: true,
        bin: { npm: 'bin/npm-cli.js' },
      },
      [`node_modules/${NPM_OVERLAY.alias}`]: {
        ...NPM_OVERLAY_ARTIFACT,
      },
    },
  }
  writeJson(join(root, 'package.json'), packageManifest)
  writeJson(join(root, 'package-lock.json'), packageLock)
  write(join(root, '.gitignore'), 'node_modules/\n')
  write(join(root, 'tracked.txt'), 'unchanged\n')
  write(
    join(root, 'scripts/setup-provider-cli-toolchain.mjs'),
    `export { verifyProviderCliRuntimeForShim } from ${JSON.stringify(SETUP_MODULE_URL)}\n`,
  )
  if (role === 'authority') {
    write(join(root, 'infra/governance/providers/provider-cli-toolchain.json'), manifestBytes)
    write(join(root, 'infra/governance/providers/provider-cli-toolchain.package-lock.json'), lockBytes)
  } else {
    write(join(root, 'governance/provider-cli-toolchain.json'), manifestBytes)
    write(join(root, 'governance/provider-cli-toolchain.package-lock.json'), lockBytes)
  }
  git(root, ['init', '--quiet'])
  git(root, ['add', '--all'])
  return root
}

function executable(path, source) {
  write(path, source, { mode: 0o755 })
  chmodSync(path, 0o755)
}

function materializeFakeInstall(stage, manifest, { platformId = TEST_PLATFORM_ID } = {}) {
  const lock = JSON.parse(readFileSync(join(stage, 'package-lock.json'), 'utf8'))
  const active = manifest.packageContent.packages.filter(record => record.platforms.includes(platformId))
  for (const record of active) {
    for (const [path, bytes] of fakePackageFiles(record.lockPath, lock)) {
      const absolute = join(stage, record.lockPath, path)
      const isExecutable = path === 'claude' || path.startsWith('bin/')
      write(absolute, bytes, { mode: isExecutable ? 0o755 : 0o644 })
      if (isExecutable) chmodSync(absolute, 0o755)
    }
  }
  mkdirSync(join(stage, 'node_modules/.bin'), { recursive: true })
  symlinkSync('../@openai/codex/bin/codex.js', join(stage, 'node_modules/.bin/codex'))
  writeJson(join(stage, 'node_modules/.package-lock.json'), { generated: true })
}

function harness(root, {
  claudeVersion,
  codexVersion,
  mutateTrackedOnCi = false,
  platformId = TEST_PLATFORM_ID,
} = {}) {
  const calls = []
  const runtimeEnvironments = []
  let cleanupCount = 0
  const runner = (command, args, options) => {
    calls.push({ command, args: [...args], options: { ...options, env: { ...options.env } } })
    if (command === process.execPath && args[0] === '/verified/npm-cli.js') {
      if (args[1] === 'ci') {
        const manifestPath = [
          join(root, 'infra/governance/providers/provider-cli-toolchain.json'),
          join(root, 'governance/provider-cli-toolchain.json'),
        ].find(path => lstatSync(path, { throwIfNoEntry: false })?.isFile())
        materializeFakeInstall(options.cwd, JSON.parse(readFileSync(manifestPath, 'utf8')), { platformId })
        if (mutateTrackedOnCi) write(join(root, 'tracked.txt'), 'mutated by subprocess\n')
      }
      return { status: 0, stdout: '', stderr: '' }
    }
    if (
      (String(command).endsWith('/claude') && args[0] === '--version')
      || (
        command === process.execPath
        && String(args[0]).endsWith('/node_modules/.bin/claude')
        && args[1] === '--version'
      )
    ) {
      return { status: 0, stdout: `${claudeVersion ?? '2.1.215'} (Claude Code)\n`, stderr: '' }
    }
    if (
      command === process.execPath
      && (
        String(args[0]).endsWith('/node_modules/.bin/codex')
        || String(args[0]).endsWith('/bin/codex.js')
      )
      && args[1] === '--version'
    ) {
      return { status: 0, stdout: `codex-cli ${codexVersion ?? '0.144.6'}\n`, stderr: '' }
    }
    if (
      command === process.execPath
      && (
        String(args[0]).endsWith('/node_modules/.bin/future-model')
        || String(args[0]).endsWith('/bin/future.js')
      )
      && args[1] === '--version'
    ) {
      return { status: 0, stdout: 'future-model 1.2.3\n', stderr: '' }
    }
    assert.fail(`unexpected provider toolchain subprocess:${String(command)} ${args.map(String).join(' ')}`)
  }
  const runtimeFactory = async ({ repositoryRoot, env }) => {
    assert.equal(realpathSync(repositoryRoot), root)
    runtimeEnvironments.push({
      env: { ...env },
      globalConfig: readFileSync(env.NPM_CONFIG_GLOBALCONFIG, 'utf8'),
      userConfig: readFileSync(env.NPM_CONFIG_USERCONFIG, 'utf8'),
    })
    const artifact = resolveExactNpmRuntimeContract(repositoryRoot)
    const securityOverlay = Object.freeze({
      schemaVersion: 1,
      kind: 'verified-npm-runtime-security-overlay-receipt',
      status: 'applied',
      ...artifact.securityOverlay,
      treeDigest: 'a'.repeat(64),
    })
    return {
      cli: '/verified/npm-cli.js',
      artifact,
      securityOverlay,
      toolchain: { node: process.version, npm: artifact.version },
      cleanup() { cleanupCount += 1 },
    }
  }
  return {
    calls,
    get cleanupCount() { return cleanupCount },
    npmCalls: () => calls.filter(call => call.command === process.execPath && call.args[0] === '/verified/npm-cli.js'),
    runner,
    runtimeEnvironments,
    runtimeFactory,
  }
}

function setupOptions(root, testHarness, overrides = {}) {
  return {
    root,
    platform: TEST_PLATFORM,
    arch: TEST_ARCH,
    libc: TEST_PLATFORM === 'linux' ? 'glibc' : null,
    baseEnvironment: {
      PATH: process.env.PATH,
      SAFE_FIXTURE_VALUE: 'retained',
      ANTHROPIC_API_KEY: 'must-not-leak',
      OPENAI_API_KEY: 'must-not-leak',
      NODE_OPTIONS: '--require=/untrusted/preload.cjs',
      NPM_CONFIG_REGISTRY: 'https://untrusted.invalid/',
    },
    runner: testHarness.runner,
    runtimeFactory: testHarness.runtimeFactory,
    ...overrides,
  }
}

function assertNoStageDirectories(root) {
  const base = join(root, 'node_modules/.provider-cli-toolchain')
  const visit = (directory) => {
    const children = readdirSync(directory, { withFileTypes: true })
    assert.equal(children.some(entry => entry.name.startsWith('.stage-')), false)
    for (const entry of children) if (entry.isDirectory()) visit(join(directory, entry.name))
  }
  visit(base)
}

function expectedRuntimeTarget(root, authorityDigest, platform = TEST_PLATFORM_ID) {
  return join(root, 'node_modules/.provider-cli-toolchain/content-v2', platform, authorityDigest)
}

test('filesystem authority accepts trusted owners and root-owned sticky runtime bases but rejects unsafe writable entries', () => {
  assert.equal(typeof process.getuid, 'function')
  const currentUid = process.getuid()
  assert.equal(validateProviderCliFilesystemAuthority({
    uid: currentUid,
    mode: 0o100755,
    aclEntries: [{ effect: 'deny', principal: 'everyone', rights: ['delete'] }],
  }, { currentUid, label: 'Google Drive deny-only ACL fixture' }), true)
  assert.equal(validateProviderCliFilesystemAuthority({
    uid: 0,
    mode: 0o100555,
  }, { currentUid, label: 'root-owned fixture' }), true)
  assert.equal(validateProviderCliFilesystemAuthority({
    uid: 0,
    mode: 0o041777,
  }, { currentUid, label: 'root-owned sticky runtime directory fixture' }), true)
  assert.throws(() => validateProviderCliFilesystemAuthority({
    uid: currentUid + 1,
    mode: 0o100755,
  }, { currentUid, label: 'foreign fixture' }), /must be owned by the current uid or root/)
  assert.throws(() => validateProviderCliFilesystemAuthority({
    uid: currentUid,
    mode: 0o100775,
  }, { currentUid, label: 'writable fixture' }), /must not be writable by group or other users/)
  assert.throws(() => validateProviderCliFilesystemAuthority({
    uid: 0,
    mode: 0o040777,
  }, { currentUid, label: 'root-owned non-sticky writable directory fixture' }), /must not be writable by group or other users/)
  assert.throws(() => validateProviderCliFilesystemAuthority({
    uid: 0,
    mode: 0o101777,
  }, { currentUid, label: 'root-owned sticky regular file fixture' }), /must not be writable by group or other users/)
  assert.throws(() => validateProviderCliFilesystemAuthority({
    uid: currentUid + 1,
    mode: 0o041777,
  }, { currentUid, label: 'foreign writable sticky directory fixture' }), /must be owned by the current uid or root/)
})

test('strict locked-tar derivation verifies SHA-512 and canonical directory/file content', () => {
  const files = new Map([
    ['package.json', Buffer.from('{"name":"@openai/codex"}\n')],
    ['bin/codex.js', Buffer.from('#!/usr/bin/env node\n')],
  ])
  const first = deriveSyntheticTarball(files)
  const second = deriveSyntheticTarball(new Map([...files].reverse()))
  assert.deepEqual(first, second)
  assert.deepEqual(first, {
    fileCount: 2,
    lockPath: 'node_modules/@openai/codex',
    totalBytes: 45,
    treeSha256: first.treeSha256,
  })
  assert.match(first.treeSha256, /^[a-f0-9]{64}$/)

  const tarball = fakePackageTarball(files)
  assert.throws(
    () => deriveLockedPackageContentFromTarball(tarball, {
      lockPath: 'node_modules/@openai/codex',
      integrity: `sha512-${Buffer.alloc(64).toString('base64')}`,
    }),
    /tarball SHA-512 differs from the exact lock/,
  )
})

test('strict locked-tar derivation rejects aliases, links, PAX, traversal, deep paths, root files, and nonzero tails', () => {
  assert.throws(
    () => deriveSyntheticTarball(new Map([['A', Buffer.from('a')], ['a', Buffer.from('b')]])),
    /collides with portable alias/,
  )
  assert.throws(
    () => deriveSyntheticTarball(new Map([['safe', Buffer.from('x')]]), {
      mutateHeader(header) { header[156] = 0x32 },
    }),
    /link, special, PAX, or extension entry/,
  )
  assert.throws(
    () => deriveSyntheticTarball(new Map([['safe', Buffer.from('x')]]), {
      mutateHeader(header) { header[156] = 0x78 },
    }),
    /link, special, PAX, or extension entry/,
  )
  assert.throws(
    () => deriveSyntheticTarball(new Map([['safe', Buffer.from('x')]]), {
      mutateHeader(header) {
        header.fill(0, 0, 100)
        writeTarString(header, 0, 100, 'package/../escape')
      },
    }),
    /must be a portable repository-relative path/,
  )
  assert.throws(
    () => deriveSyntheticTarball(new Map([['safe', Buffer.from('x')]]), {
      mutateHeader(header) {
        header.fill(0, 0, 100)
        header.fill(0, 345, 500)
        writeTarString(header, 0, 100, 'leaf')
        writeTarString(header, 345, 155, `package/${Array(64).fill('a').join('/')}`)
      },
    }),
    /exceeds depth 64/,
  )
  assert.throws(
    () => deriveSyntheticTarball(new Map([['safe', Buffer.from('x')]]), {
      mutateHeader(header) {
        header.fill(0, 0, 100)
        writeTarString(header, 0, 100, 'package')
      },
    }),
    /package root entry must be an empty directory/,
  )
  const valid = fakePackageTarball(new Map([['safe', Buffer.from('x')]]))
  const withTail = gzipSync(Buffer.concat([gunzipSync(valid), Buffer.alloc(512, 1)]), { mtime: 0 })
  assert.throws(
    () => deriveLockedPackageContentFromTarball(withTail, {
      lockPath: 'node_modules/@openai/codex',
      integrity: sha512Integrity(withTail),
    }),
    /concatenated or nonzero tail/,
  )
})

test('installs locked provider CLIs atomically, probes real shims, and is idempotent', async (t) => {
  const root = fixture(t)
  const before = captureGitVisibleWorktree(root)
  const testHarness = harness(root)
  mkdirSync(join(root, 'node_modules/.bin'), { recursive: true })
  symlinkSync('/untrusted/claude', join(root, 'node_modules/.bin/claude'))
  write(join(root, 'node_modules/.bin/codex'), '#!/bin/sh\nexit 99\n', { mode: 0o755 })

  const result = await setupProviderCliToolchain(setupOptions(root, testHarness))
  assert.equal(result.status, 'installed')
  assert.equal(result.role, 'authority')
  assert.equal(result.platform, TEST_PLATFORM_ID)
  assert.equal(result.authorityDigest, sha256(AUTHORITY_MANIFEST))
  assert.equal(result.target, expectedRuntimeTarget(root, result.authorityDigest))
  assert.match(result.versions.claude, /2\.1\.215/)
  assert.match(result.versions.codex, /0\.144\.6/)
  assert.deepEqual(captureGitVisibleWorktree(root), before)
  assertNoStageDirectories(root)
  assert.equal(testHarness.cleanupCount, 1)

  const npmCalls = testHarness.npmCalls()
  assert.equal(npmCalls.length, 3)
  assert.deepEqual(npmCalls.map(call => call.args.slice(1, 3)), [
    ['ci', '--ignore-scripts'],
    ['audit', 'signatures'],
    ['audit', '--audit-level=high'],
  ])
  for (const call of npmCalls) {
    assert.equal(call.options.shell, false)
    assert.equal(Number.isInteger(call.options.timeout) && call.options.timeout >= 1_000, true)
    assert.equal(call.options.env.NPM_CONFIG_IGNORE_SCRIPTS, 'true')
    assert.equal(call.options.env.NPM_CONFIG_REGISTRY, 'https://registry.npmjs.org/')
  }
  assert.equal(npmCalls[0].args.includes('--legacy-peer-deps'), true)
  assert.equal(npmCalls[0].args.includes('--no-bin-links'), true)
  assert.equal(npmCalls[0].args.includes('--registry=https://registry.npmjs.org/'), true)
  assert.equal(npmCalls[1].args.includes('--registry=https://registry.npmjs.org/'), true)
  assert.equal(npmCalls[2].args.includes('--registry=https://registry.npmjs.org/'), true)

  const isolatedRecord = testHarness.runtimeEnvironments[0]
  const isolated = isolatedRecord.env
  assert.equal(isolated.SAFE_FIXTURE_VALUE, 'retained')
  for (const name of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'NODE_OPTIONS']) assert.equal(Object.hasOwn(isolated, name), false)
  assert.equal(isolatedRecord.userConfig.includes('ignore-scripts=true'), true)
  assert.equal(isolatedRecord.globalConfig.includes('registry=https://registry.npmjs.org/'), true)

  for (const executableName of ['claude', 'codex']) {
    const shim = join(root, 'node_modules/.bin', executableName)
    const info = lstatSync(shim)
    assert.equal(info.isFile(), true)
    assert.equal(info.isSymbolicLink(), false)
    assert.notEqual(info.mode & 0o111, 0)
    const version = runFixtureExecutable(shim, ['--version'], root)
    assert.equal(version.status, 0, version.stderr)
    const certification = verifyProviderCliRuntimeForCertification({ rootPath: root, executable: executableName })
    assert.equal(certification.binding.authorityDigest, result.authorityDigest)
    assert.equal(certification.binding.lockDigest, result.lockDigest)
    assert.equal(certification.binding.executable, executableName)
    assert.equal(certification.binding.platform, TEST_PLATFORM_ID)
    assert.equal(certification.binding.packageContentProtocol, 'npm-ustar-package-tree-v1')
    assert.match(certification.binding.activePackageContentDigest, /^[a-f0-9]{64}$/)
    assert.equal(certification.binding.shimPath, `node_modules/.bin/${executableName}`)
    assert.equal(certification.binding.shimSha256, sha256(readFileSync(shim)))
    assert.equal(certification.binding.targetSha256, sha256(readFileSync(certification.target)))
  }
  assert.throws(
    () => verifyProviderCliRuntimeForCertification({
      rootPath: root,
      executable: 'codex',
      expectedExecutable: '/caller-controlled/target',
    }),
    /certification options are unsupported:expectedExecutable/,
  )
  assert.equal(readFileSync(join(result.target, 'package-lock.json')).equals(AUTHORITY_LOCK), true)
  assert.equal(lstatSync(join(result.target, `node_modules/@anthropic-ai/claude-code-${TEST_PLATFORM_ID}/claude`)).isFile(), true)
  assert.equal(lstatSync(join(result.target, 'node_modules/@openai/codex/bin/codex.js')).isFile(), true)
  assert.equal(lstatSync(join(result.target, 'node_modules/.bin'), { throwIfNoEntry: false }), undefined)
  assert.equal(lstatSync(join(result.target, 'node_modules/.package-lock.json'), { throwIfNoEntry: false }), undefined)
  assert.equal(lstatSync(join(result.target, 'forbidden-postinstall-marker'), { throwIfNoEntry: false }), undefined)

  const claudeShim = join(root, 'node_modules/.bin/claude')
  const codexShim = join(root, 'node_modules/.bin/codex')
  const targetMtime = statSync(result.target, { bigint: true }).mtimeNs
  const claudeMtime = statSync(claudeShim, { bigint: true }).mtimeNs
  const codexMtime = statSync(codexShim, { bigint: true }).mtimeNs
  const callsBeforeReady = testHarness.npmCalls().length
  const ready = await setupProviderCliToolchain(setupOptions(root, testHarness))
  assert.equal(ready.status, 'ready')
  assert.equal(testHarness.npmCalls().length, callsBeforeReady)
  assert.equal(statSync(result.target, { bigint: true }).mtimeNs, targetMtime)
  assert.equal(statSync(claudeShim, { bigint: true }).mtimeNs, claudeMtime)
  assert.equal(statSync(codexShim, { bigint: true }).mtimeNs, codexMtime)

  const checked = await setupProviderCliToolchain(setupOptions(root, testHarness, { check: true }))
  assert.equal(checked.status, 'ready')
  assert.equal(testHarness.npmCalls().length, callsBeforeReady)
  assert.deepEqual(captureGitVisibleWorktree(root), before)
  assert.equal(testHarness.cleanupCount, 1)
  assert.equal(lstatSync(isolated.NPM_CONFIG_USERCONFIG, { throwIfNoEntry: false }), undefined)
})

test('writer-safe setup installs and statically verifies runtime and shims without executing provider binaries', async (t) => {
  const root = fixture(t)
  const testHarness = harness(root)
  const result = await setupProviderCliToolchain(setupOptions(root, testHarness, { probeExecutables: false }))
  assert.equal(result.status, 'installed')
  assert.equal(result.staticVerified, true)
  assert.equal(result.executablesProbed, false)
  assert.equal(result.versions, null)
  assert.equal(testHarness.calls.length, 3)
  assert.equal(testHarness.npmCalls().length, 3)
  assert.ok(testHarness.calls.every(call => call.command === process.execPath && call.args[0] === '/verified/npm-cli.js'))

  const verified = verifyProviderCliToolchainStatic({
    root,
    platform: TEST_PLATFORM,
    arch: TEST_ARCH,
    libc: TEST_PLATFORM === 'linux' ? 'glibc' : null,
  })
  assert.equal(verified.staticVerified, true)
  assert.equal(verified.executablesProbed, false)
  assert.equal(verified.versions, null)
  assert.equal(verified.target, result.target)
  assert.equal(testHarness.calls.length, 3, 'zero-spawn static verification called the injected runner')
})

test('rejects missing and stale verified npm security overlays before the first npm call', async (t) => {
  for (const overlayState of ['missing', 'stale']) {
    const root = fixture(t)
    const testHarness = harness(root)
    await assert.rejects(
      setupProviderCliToolchain(setupOptions(root, testHarness, {
        runtimeFactory: async (options) => {
          const runtime = await testHarness.runtimeFactory(options)
          return {
            ...runtime,
            securityOverlay: overlayState === 'missing'
              ? undefined
              : { ...runtime.securityOverlay, identityDigest: 'f'.repeat(64) },
          }
        },
      })),
      /verified exact npm runtime security overlay is missing, stale, or substituted/,
    )
    assert.equal(testHarness.npmCalls().length, 0)
    assert.equal(testHarness.cleanupCount, 1)
    assertNoStageDirectories(root)
  }
})

test('static authority rejects writable shim, target, package entry, and replaceable ancestor', async (t) => {
  const root = fixture(t)
  const testHarness = harness(root)
  const installed = await setupProviderCliToolchain(setupOptions(root, testHarness, { probeExecutables: false }))
  const cases = [
    {
      path: join(root, 'node_modules/.bin/codex'),
      mode: 0o755,
      invoke: () => verifyProviderCliRuntimeForCertification({ rootPath: root, executable: 'codex' }),
    },
    {
      path: join(installed.target, 'node_modules/@openai/codex/bin/codex.js'),
      mode: 0o755,
      invoke: () => verifyProviderCliRuntimeForCertification({ rootPath: root, executable: 'codex' }),
    },
    {
      path: join(installed.target, 'node_modules/@openai/codex/package.json'),
      mode: 0o644,
      invoke: () => verifyProviderCliToolchainStatic({
        root,
        platform: TEST_PLATFORM,
        arch: TEST_ARCH,
        libc: TEST_PLATFORM === 'linux' ? 'glibc' : null,
      }),
    },
    {
      path: join(root, 'node_modules/.bin'),
      mode: 0o755,
      invoke: () => verifyProviderCliRuntimeForCertification({ rootPath: root, executable: 'codex' }),
    },
  ]
  for (const item of cases) {
    chmodSync(item.path, item.mode | 0o022)
    assert.throws(item.invoke, /must not be writable by group or other users/)
    chmodSync(item.path, item.mode)
  }
  assert.equal(verifyProviderCliToolchainStatic({
    root,
    platform: TEST_PLATFORM,
    arch: TEST_ARCH,
    libc: TEST_PLATFORM === 'linux' ? 'glibc' : null,
  }).staticVerified, true)
})

test('resolves the consumer manifest and lock pair without an authority checkout', (t) => {
  const root = fixture(t, { role: 'consumer' })
  const authority = resolveProviderCliToolchainAuthority(root)
  assert.equal(authority.role, 'consumer')
  assert.equal(authority.manifestPath, 'governance/provider-cli-toolchain.json')
  assert.equal(authority.lockPath, 'governance/provider-cli-toolchain.package-lock.json')
  assert.equal(authority.authorityDigest, sha256(AUTHORITY_MANIFEST))
  assert.equal(authority.lockDigest, sha256(AUTHORITY_LOCK))
})

test('candidate authority permits only a missing package-content proposal and derives the exact active plan', (t) => {
  const manifest = JSON.parse(AUTHORITY_MANIFEST.toString('utf8'))
  const lock = JSON.parse(AUTHORITY_LOCK.toString('utf8'))
  delete manifest.packageContent
  const candidateBytes = toolchainBytes(manifest, lock, { refreshPackageContent: false })
  const root = fixture(t, candidateBytes)
  const candidate = resolveProviderCliToolchainCandidateAuthority(root)
  const plan = deriveActivePackageContentPlan(candidate.manifest, candidate.lock)
  assert.equal(plan.length, 10)
  assert.deepEqual(plan.map(record => record.lockPath), [...plan.map(record => record.lockPath)].sort())
  assert.ok(plan.every(record => Object.isFrozen(record) && Object.isFrozen(record.platforms)))
  assert.throws(
    () => resolveProviderCliToolchainAuthority(root),
    /package-content authority is required/,
  )

  const rogueManifest = structuredClone(manifest)
  rogueManifest.unreviewed = true
  const rogueBytes = toolchainBytes(rogueManifest, lock, { refreshPackageContent: false })
  assert.throws(
    () => resolveProviderCliToolchainCandidateAuthority(fixture(t, rogueBytes)),
    /invalid or open shape/,
  )

  const futureManifest = JSON.parse(AUTHORITY_MANIFEST.toString('utf8'))
  futureManifest.schemaVersion = 3
  const futureBytes = toolchainBytes(futureManifest, lock, { refreshPackageContent: false })
  assert.throws(
    () => resolveProviderCliToolchainCandidateAuthority(fixture(t, futureBytes)),
    error => error?.code === 'GOV-PROVIDER-CLI-CONTROL-PLANE-UPDATE-REQUIRED',
  )

  const futureProtocolManifest = JSON.parse(AUTHORITY_MANIFEST.toString('utf8'))
  futureProtocolManifest.packageContent.protocol = 'future-content-v3'
  const futureProtocolBytes = toolchainBytes(futureProtocolManifest, lock, { refreshPackageContent: false })
  assert.throws(
    () => resolveProviderCliToolchainCandidateAuthority(fixture(t, futureProtocolBytes)),
    error => error?.code === 'GOV-PROVIDER-CLI-CONTROL-PLANE-UPDATE-REQUIRED',
  )
})

test('accepts a registered external provider without inventing a repo-provisioned CLI', (t) => {
  const { manifestBytes, lockBytes } = withSyntheticProvider({ provisioned: false })
  const root = fixture(t, { manifestBytes, lockBytes })
  const authority = resolveProviderCliToolchainAuthority(root)
  assert.equal(authority.manifest.providerBindings.find(binding => binding.providerId === 'future-model').toolProviderId, null)
  assert.equal(authority.manifest.tools.some(tool => tool.providerId === 'future-model'), false)
})

test('installs a synthetic third provider from the same closed manifest and exact lock', async (t) => {
  const { manifestBytes, lockBytes } = withSyntheticProvider({ provisioned: true })
  const root = fixture(t, { manifestBytes, lockBytes })
  const testHarness = harness(root)
  const result = await setupProviderCliToolchain(setupOptions(root, testHarness))
  assert.match(result.versions['future-model'], /1\.2\.3/)
  assert.equal(lstatSync(join(result.target, 'node_modules/@future-ai/future-cli/bin/future.js')).isFile(), true)
  const shim = join(root, 'node_modules/.bin/future-model')
  assert.equal(lstatSync(shim).isFile(), true)
  assert.equal(runFixtureExecutable(shim, ['--version'], root).status, 0)
})

test('rejects missing and rogue provider/tool/lock mutations before install', (t) => {
  const external = withSyntheticProvider({ provisioned: false })
  external.manifest.providerBindings.find(binding => binding.providerId === 'future-model').provisioning = 'repo-provisioned-cli'
  external.manifest.providerBindings.find(binding => binding.providerId === 'future-model').toolProviderId = 'future-model'
  const missingToolBytes = toolchainBytes(external.manifest, external.lock)
  assert.throws(
    () => resolveProviderCliToolchainAuthority(fixture(t, missingToolBytes)),
    /tools differ from the closed repo-provisioned provider bindings/,
  )

  const rogue = withSyntheticProvider({ provisioned: false })
  rogue.manifest.tools.push({
    providerId: 'rogue-model',
    packageName: '@rogue-ai/rogue-cli',
    version: '9.9.9',
    executable: 'rogue-model',
    binKind: 'node-entrypoint',
    packageBin: 'bin/rogue.js',
    platformPackage: null,
    versionProbe: 'exact-semver-token',
  })
  const rogueBytes = toolchainBytes(rogue.manifest, rogue.lock, { refreshPackageContent: false })
  assert.throws(
    () => resolveProviderCliToolchainAuthority(fixture(t, rogueBytes)),
    /tools differ from the closed repo-provisioned provider bindings/,
  )

  const missingLock = withSyntheticProvider({ provisioned: true })
  delete missingLock.lock.packages['node_modules/@future-ai/future-cli']
  const missingLockBytes = toolchainBytes(missingLock.manifest, missingLock.lock, { refreshPackageContent: false })
  assert.throws(
    () => resolveProviderCliToolchainAuthority(fixture(t, missingLockBytes)),
    /lock lost @future-ai\/future-cli@1\.2\.3/,
  )
})

test('rejects digest drift and non-registry lock artifacts before install', (t) => {
  const digestRoot = fixture(t)
  write(join(digestRoot, 'infra/governance/providers/provider-cli-toolchain.package-lock.json'), Buffer.concat([AUTHORITY_LOCK, Buffer.from('\n')]))
  assert.throws(
    () => resolveProviderCliToolchainAuthority(digestRoot),
    /package-lock digest differs from the manifest/,
  )

  const lock = JSON.parse(AUTHORITY_LOCK.toString('utf8'))
  lock.packages['node_modules/@openai/codex'].resolved = 'file:../untrusted-codex.tgz'
  const lockBytes = Buffer.from(`${JSON.stringify(lock, null, 2)}\n`)
  const manifest = JSON.parse(AUTHORITY_MANIFEST.toString('utf8'))
  manifest.packageLock.sha256 = sha256(lockBytes)
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
  const artifactRoot = fixture(t, { manifestBytes, lockBytes })
  assert.throws(
    () => resolveProviderCliToolchainAuthority(artifactRoot),
    /artifact is not the canonical registry tarball/,
  )

  const dependencyManifest = JSON.parse(AUTHORITY_MANIFEST.toString('utf8'))
  const dependencyLock = JSON.parse(AUTHORITY_LOCK.toString('utf8'))
  dependencyLock.packages['node_modules/@openai/codex'].dependencies = { '@rogue/required': '1.0.0' }
  dependencyLock.packages['node_modules/@rogue/required'] = {
    version: '1.0.0',
    resolved: 'https://registry.npmjs.org/@rogue/required/-/required-1.0.0.tgz',
    integrity: `sha512-${Buffer.alloc(64, 9).toString('base64')}`,
  }
  const dependencyBytes = toolchainBytes(dependencyManifest, dependencyLock, { refreshPackageContent: false })
  assert.throws(
    () => resolveProviderCliToolchainAuthority(fixture(t, dependencyBytes)),
    /required dependency escapes the content-authorized active closure/,
  )

  const aliasManifest = JSON.parse(AUTHORITY_MANIFEST.toString('utf8'))
  const aliasLock = JSON.parse(AUTHORITY_LOCK.toString('utf8'))
  const codexMain = aliasLock.packages['node_modules/@openai/codex']
  codexMain.optionalDependencies[`@openai/codex-${TEST_PLATFORM_ID}`] = `npm:@openai/codex@0.144.5-${TEST_PLATFORM_ID}`
  const aliasBytes = toolchainBytes(aliasManifest, aliasLock, { refreshPackageContent: false })
  assert.throws(
    () => resolveProviderCliToolchainAuthority(fixture(t, aliasBytes)),
    /platform dependency does not bind its exact locked package/,
  )
})

test('a failed real version probe leaves no digest target or staging directory', async (t) => {
  const root = fixture(t)
  const testHarness = harness(root, { claudeVersion: '9.9.9' })
  await assert.rejects(
    setupProviderCliToolchain(setupOptions(root, testHarness)),
    /did not report exact token 2\.1\.215/,
  )
  const digest = sha256(AUTHORITY_MANIFEST)
  assert.equal(lstatSync(expectedRuntimeTarget(root, digest), { throwIfNoEntry: false }), undefined)
  assertNoStageDirectories(root)
  assert.equal(testHarness.cleanupCount, 1)
})

test('detects a subprocess mutation of the Git-visible caller worktree', async (t) => {
  const root = fixture(t)
  const testHarness = harness(root, { mutateTrackedOnCi: true })
  await assert.rejects(
    setupProviderCliToolchain(setupOptions(root, testHarness)),
    /mutated the Git-visible caller worktree/,
  )
  const digest = sha256(AUTHORITY_MANIFEST)
  assert.equal(lstatSync(expectedRuntimeTarget(root, digest), { throwIfNoEntry: false }), undefined)
  assertNoStageDirectories(root)
  assert.equal(testHarness.cleanupCount, 1)
})

test('--check rejects a poisoned controlled shim without rewriting it', async (t) => {
  const root = fixture(t)
  const testHarness = harness(root)
  await setupProviderCliToolchain(setupOptions(root, testHarness))
  const shim = join(root, 'node_modules/.bin/codex')
  write(shim, '#!/bin/sh\nexit 91\n', { mode: 0o755 })
  const poisoned = readFileSync(shim)
  await assert.rejects(
    setupProviderCliToolchain(setupOptions(root, testHarness, { check: true })),
    /codex shim differs from authority/,
  )
  assert.throws(
    () => verifyProviderCliRuntimeForCertification({ rootPath: root, executable: 'codex' }),
    /provider CLI codex shim differs from authority/,
  )
  assert.equal(readFileSync(shim).equals(poisoned), true)
  assert.equal(testHarness.npmCalls().length, 3)
})

test('rejects same-version poison in an installed runtime before it can return ready', async (t) => {
  const root = fixture(t)
  const testHarness = harness(root)
  const installed = await setupProviderCliToolchain(setupOptions(root, testHarness))
  const runtimeExecutable = join(installed.target, 'node_modules/@openai/codex/bin/codex.js')
  const poisoned = Buffer.concat([
    readFileSync(runtimeExecutable),
    Buffer.from('\n// same-version runtime poison\n'),
  ])
  write(runtimeExecutable, poisoned, { mode: 0o755 })
  chmodSync(runtimeExecutable, 0o755)
  const sameVersionProbe = runFixtureExecutable(runtimeExecutable, ['--version'], root)
  assert.equal(sameVersionProbe.status, 0, sameVersionProbe.stderr)
  assert.match(sameVersionProbe.stdout, /codex-cli 0\.144\.6/)
  const callsBeforeReuse = testHarness.calls.length

  await assert.rejects(
    setupProviderCliToolchain(setupOptions(root, testHarness)),
    /installed package content differs from authority:node_modules\/@openai\/codex/,
  )
  await assert.rejects(
    setupProviderCliToolchain(setupOptions(root, testHarness, { check: true })),
    /installed package content differs from authority:node_modules\/@openai\/codex/,
  )
  assert.equal(testHarness.calls.length, callsBeforeReuse)
  assert.equal(testHarness.npmCalls().length, 3)
  assert.equal(readFileSync(runtimeExecutable).equals(poisoned), true)
})

test('a forged legacy self receipt cannot authorize a content-v2 runtime', async (t) => {
  const root = fixture(t)
  const testHarness = harness(root)
  const installed = await setupProviderCliToolchain(setupOptions(root, testHarness))
  const forged = join(installed.target, '.provider-cli-runtime-content.json')
  writeJson(forged, {
    authorityDigest: installed.authorityDigest,
    contentDigest: 'f'.repeat(64),
    entries: [],
  }, { mode: 0o600 })
  const callsBeforeCheck = testHarness.calls.length

  await assert.rejects(
    setupProviderCliToolchain(setupOptions(root, testHarness, { check: true })),
    /runtime root inventory is not closed/,
  )
  assert.equal(testHarness.calls.length, callsBeforeCheck)
  assert.equal(lstatSync(forged).isFile(), true)
})

test('per-invocation verification blocks persisted poison before provider bytes execute', async (t) => {
  const root = fixture(t)
  const testHarness = harness(root)
  const installed = await setupProviderCliToolchain(setupOptions(root, testHarness))
  const runtimeExecutable = join(installed.target, 'node_modules/@openai/codex/bin/codex.js')
  const marker = join(root, 'poison-executed')
  write(
    runtimeExecutable,
    Buffer.concat([
      readFileSync(runtimeExecutable),
      Buffer.from(`\nimport('node:fs').then(fs => fs.writeFileSync(${JSON.stringify(marker)}, 'executed'))\n`),
    ]),
    { mode: 0o755 },
  )
  chmodSync(runtimeExecutable, 0o755)

  const result = runFixtureExecutable(join(root, 'node_modules/.bin/codex'), ['--version'], root)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /installed package content differs from authority:node_modules\/@openai\/codex/)
  assert.equal(lstatSync(marker, { throwIfNoEntry: false }), undefined)
})

test('non-executable package poison is rejected by external package authority', async (t) => {
  const root = fixture(t)
  const testHarness = harness(root)
  const installed = await setupProviderCliToolchain(setupOptions(root, testHarness))
  const packageJson = join(installed.target, 'node_modules/@openai/codex/package.json')
  write(packageJson, Buffer.concat([readFileSync(packageJson), Buffer.from(' ')]), { mode: 0o644 })
  await assert.rejects(
    setupProviderCliToolchain(setupOptions(root, testHarness, { check: true })),
    /installed package content differs from authority:node_modules\/@openai\/codex/,
  )
})

test('installed package closure rejects Unicode, links, and extra scoped packages', async (t) => {
  const root = fixture(t)
  const testHarness = harness(root)
  const installed = await setupProviderCliToolchain(setupOptions(root, testHarness))
  const codexRoot = join(installed.target, 'node_modules/@openai/codex')

  const unicode = join(codexRoot, 'é.txt')
  write(unicode, 'poison\n')
  await assert.rejects(
    setupProviderCliToolchain(setupOptions(root, testHarness, { check: true })),
    /must contain ASCII only/,
  )
  rmSync(unicode)

  const linked = join(codexRoot, 'linked-package.json')
  symlinkSync('package.json', linked)
  await assert.rejects(
    setupProviderCliToolchain(setupOptions(root, testHarness, { check: true })),
    /contains a link or unsupported filesystem entry/,
  )
  rmSync(linked)

  write(join(installed.target, 'node_modules/@rogue/rogue-cli/index.js'), 'poison\n')
  await assert.rejects(
    setupProviderCliToolchain(setupOptions(root, testHarness, { check: true })),
    /installed package inventory differs from authority/,
  )
})

test('content-v1 and legacy digest-only runtimes remain inert during content-v2 installation', async (t) => {
  const root = fixture(t)
  const testHarness = harness(root)
  const initial = await setupProviderCliToolchain(setupOptions(root, testHarness))
  const legacyTarget = join(root, 'node_modules/.provider-cli-toolchain/content-v1', TEST_PLATFORM_ID, initial.authorityDigest)
  mkdirSync(dirname(legacyTarget), { recursive: true })
  renameSync(initial.target, legacyTarget)
  const digestOnlyTarget = join(root, 'node_modules/.provider-cli-toolchain', initial.authorityDigest)
  mkdirSync(digestOnlyTarget, { recursive: true })
  const digestOnlySentinel = join(digestOnlyTarget, 'must-remain-inert')
  write(digestOnlySentinel, 'legacy\n')
  const digestOnlyBefore = statSync(digestOnlySentinel, { bigint: true })
  const legacyExecutable = join(legacyTarget, 'node_modules/@openai/codex/bin/codex.js')
  const legacyBytes = readFileSync(legacyExecutable)
  const legacyExecutableStat = statSync(legacyExecutable, { bigint: true })
  const legacyRootStat = statSync(legacyTarget, { bigint: true })
  const callsBeforeCheck = testHarness.calls.length

  await assert.rejects(
    setupProviderCliToolchain(setupOptions(root, testHarness, { check: true })),
    new RegExp(`provider CLI toolchain is not installed:.*content-v2.*${TEST_PLATFORM_ID}`),
  )
  assert.equal(testHarness.calls.length, callsBeforeCheck)

  const migrated = await setupProviderCliToolchain(setupOptions(root, testHarness))
  assert.equal(migrated.status, 'installed')
  assert.equal(migrated.target, expectedRuntimeTarget(root, initial.authorityDigest))
  assert.notEqual(migrated.target, legacyTarget)
  assert.equal(lstatSync(legacyTarget).isDirectory(), true)
  assert.equal(readFileSync(legacyExecutable).equals(legacyBytes), true)
  assert.equal(readFileSync(digestOnlySentinel, 'utf8'), 'legacy\n')
  const digestOnlyAfter = statSync(digestOnlySentinel, { bigint: true })
  for (const field of ['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs']) {
    assert.equal(digestOnlyAfter[field], digestOnlyBefore[field])
  }
  const legacyExecutableAfter = statSync(legacyExecutable, { bigint: true })
  const legacyRootAfter = statSync(legacyTarget, { bigint: true })
  for (const field of ['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs']) {
    assert.equal(legacyExecutableAfter[field], legacyExecutableStat[field])
  }
  for (const field of ['dev', 'ino', 'mode', 'mtimeNs', 'ctimeNs']) {
    assert.equal(legacyRootAfter[field], legacyRootStat[field])
  }

  const ready = await setupProviderCliToolchain(setupOptions(root, testHarness, { check: true }))
  assert.equal(ready.status, 'ready')
  assert.equal(ready.target, migrated.target)
  assert.equal(testHarness.npmCalls().length, 6)
})

test('fails closed for Linux runtimes that are not verified glibc', async (t) => {
  const root = fixture(t)
  const testHarness = harness(root)
  await assert.rejects(
    setupProviderCliToolchain(setupOptions(root, testHarness, {
      platform: 'linux',
      arch: 'x64',
      libc: 'musl-or-unknown',
    })),
    /Linux runtime requires glibc/,
  )
  assert.equal(testHarness.calls.length, 0)
})
