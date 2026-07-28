#!/usr/bin/env node

// Repository-independent npm bootstrap trust boundary.
//
// The committed lock selects one canonical npm tarball and SHA-512 digest. This module downloads
// those bytes with Node's HTTPS stack, verifies the compressed archive before parsing it, accepts
// only a deliberately small ustar subset, and extracts regular files into a fresh disposable root.
// Neither PATH npm nor node_modules/npm is consulted. Callers must keep the returned runtime alive
// only for the operation and invoke cleanup in a finally block.

import { createHash, timingSafeEqual } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { request } from 'node:https'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { gunzipSync } from 'node:zlib'

const NPM_REGISTRY_ORIGIN = 'https://registry.npmjs.org'
const EXACT_STABLE_VERSION = /^\d+\.\d+\.\d+$/
const SHA512_INTEGRITY = /^sha512-([A-Za-z0-9+/]+={0,2})$/
const TAR_BLOCK_SIZE = 512
const MAX_COMPRESSED_BYTES = 8 * 1024 * 1024
const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 5_000
const MAX_ARCHIVE_PATH_BYTES = 256
const textDecoder = new TextDecoder('utf-8', { fatal: true })
const NPM_RUNTIME_OVERLAY_ALIAS = 'npm-runtime-brace-expansion-patch'
const NPM_RUNTIME_OVERLAY_SPEC = 'npm:brace-expansion@5.0.8'
const NPM_RUNTIME_OVERLAY_PACKAGE = 'brace-expansion'
const NPM_RUNTIME_OVERLAY_VERSION = '5.0.8'
const NPM_RUNTIME_OVERLAY_REPLACED_VERSION = '5.0.7'
const NPM_RUNTIME_OVERLAY_TARGET = 'node_modules/brace-expansion'
const NPM_RUNTIME_OVERLAY_CONSUMER = 'node_modules/minimatch'
const NPM_RUNTIME_OVERLAY_CONSUMER_VERSION = '10.2.5'
const NPM_RUNTIME_OVERLAY_CONSUMER_RANGE = '^5.0.5'

const invariant = (condition, message) => {
  if (!condition) throw new Error(`GOV-NPM-RUNTIME-001:${message}`)
}

function regularUnaliasedFile(path, label) {
  try {
    const absolute = resolve(path)
    const info = lstatSync(absolute)
    invariant(
      info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && realpathSync(absolute) === absolute,
      `${label} must be one regular file with no link ancestry`,
    )
    return absolute
  } catch (error) {
    if (String(error?.message || '').startsWith('GOV-NPM-RUNTIME-001:')) throw error
    throw new Error(`GOV-NPM-RUNTIME-001:${label} is missing or unreadable:${error?.message || error}`)
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(regularUnaliasedFile(path, label), 'utf8'))
  } catch (error) {
    if (String(error?.message || '').startsWith('GOV-NPM-RUNTIME-001:')) throw error
    throw new Error(`GOV-NPM-RUNTIME-001:${label} is invalid JSON:${error?.message || error}`)
  }
}

function integrityBytes(integrity) {
  const match = String(integrity || '').match(SHA512_INTEGRITY)
  invariant(match, 'npm lock artifact is missing canonical SHA-512 integrity')
  const bytes = Buffer.from(match[1], 'base64')
  invariant(bytes.length === 64 && bytes.toString('base64') === match[1], 'npm lock SHA-512 integrity is not canonical base64')
  return bytes
}

function npmRuntimeOverlayIdentity(value) {
  return createHash('sha256').update(JSON.stringify({
    schemaVersion: 1,
    kind: 'verified-npm-runtime-security-overlay',
    npmVersion: value.npmVersion,
    alias: value.alias,
    package: value.package,
    version: value.version,
    resolved: value.resolved,
    integrity: value.integrity,
    target: value.target,
    replacedVersion: value.replacedVersion,
    consumer: value.consumer,
    consumerVersion: value.consumerVersion,
    consumerDependencyRange: value.consumerDependencyRange,
  })).digest('hex')
}

export function resolveExactNpmArtifact(repositoryRoot) {
  const root = realpathSync(resolve(repositoryRoot))
  const rootInfo = lstatSync(root)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), 'repository root must be one real directory')
  const manifest = readJson(join(root, 'package.json'), 'package.json')
  const lock = readJson(join(root, 'package-lock.json'), 'package-lock.json')
  invariant(lock.lockfileVersion === 3 && lock.packages && typeof lock.packages === 'object' && !Array.isArray(lock.packages), 'package-lock.json must use lockfileVersion 3')
  const lockedRoot = lock.packages['']
  invariant(lockedRoot && typeof lockedRoot === 'object' && !Array.isArray(lockedRoot), 'package-lock.json root record is missing')
  const declarations = [
    ['dependencies', manifest?.dependencies?.npm, lockedRoot?.dependencies?.npm],
    ['devDependencies', manifest?.devDependencies?.npm, lockedRoot?.devDependencies?.npm],
  ].filter(([, declared]) => declared !== undefined)
  invariant(declarations.length === 1, 'npm must be pinned in exactly one dependency bucket')
  const [bucket, version, lockedVersion] = declarations[0]
  invariant(EXACT_STABLE_VERSION.test(version || ''), `${bucket}.npm must pin one exact stable version`)
  invariant(lockedVersion === version, `package-lock.json root ${bucket}.npm differs from package.json`)
  const entry = lock.packages['node_modules/npm']
  const resolved = `${NPM_REGISTRY_ORIGIN}/npm/-/npm-${version}.tgz`
  invariant(entry?.link !== true && entry?.version === version, 'package-lock.json npm artifact is missing or not exact')
  invariant(entry.resolved === resolved, 'package-lock.json npm artifact is not the canonical registry tarball')
  integrityBytes(entry.integrity)
  invariant(entry.bin?.npm === 'bin/npm-cli.js', 'package-lock.json npm artifact does not bind bin/npm-cli.js')
  return Object.freeze({ integrity: entry.integrity, resolved, version })
}

export function resolveExactNpmRuntimeContract(repositoryRoot) {
  const root = realpathSync(resolve(repositoryRoot))
  const npmArtifact = resolveExactNpmArtifact(root)
  invariant(npmArtifact.version === '11.18.0', 'npm security overlay is not certified for this exact npm version')
  const manifest = readJson(join(root, 'package.json'), 'package.json')
  const lock = readJson(join(root, 'package-lock.json'), 'package-lock.json')
  invariant(
    manifest?.devDependencies?.[NPM_RUNTIME_OVERLAY_ALIAS] === NPM_RUNTIME_OVERLAY_SPEC
      && manifest?.dependencies?.[NPM_RUNTIME_OVERLAY_ALIAS] === undefined,
    `package.json must pin ${NPM_RUNTIME_OVERLAY_ALIAS} as the exact dev-only npm alias ${NPM_RUNTIME_OVERLAY_SPEC}`,
  )
  const lockedRoot = lock.packages?.['']
  invariant(
    lockedRoot?.devDependencies?.[NPM_RUNTIME_OVERLAY_ALIAS] === NPM_RUNTIME_OVERLAY_SPEC
      && lockedRoot?.dependencies?.[NPM_RUNTIME_OVERLAY_ALIAS] === undefined,
    `package-lock.json root must pin ${NPM_RUNTIME_OVERLAY_ALIAS} as the exact dev-only npm alias`,
  )
  const entry = lock.packages?.[`node_modules/${NPM_RUNTIME_OVERLAY_ALIAS}`]
  const resolved = `${NPM_REGISTRY_ORIGIN}/${NPM_RUNTIME_OVERLAY_PACKAGE}/-/${NPM_RUNTIME_OVERLAY_PACKAGE}-${NPM_RUNTIME_OVERLAY_VERSION}.tgz`
  invariant(
    entry?.link !== true
      && entry?.name === NPM_RUNTIME_OVERLAY_PACKAGE
      && entry?.version === NPM_RUNTIME_OVERLAY_VERSION
      && entry?.resolved === resolved,
    'package-lock.json npm security overlay artifact is missing or not the canonical registry tarball',
  )
  integrityBytes(entry.integrity)
  const securityOverlay = {
    alias: NPM_RUNTIME_OVERLAY_ALIAS,
    package: NPM_RUNTIME_OVERLAY_PACKAGE,
    version: NPM_RUNTIME_OVERLAY_VERSION,
    resolved,
    integrity: entry.integrity,
    npmVersion: npmArtifact.version,
    target: NPM_RUNTIME_OVERLAY_TARGET,
    replacedVersion: NPM_RUNTIME_OVERLAY_REPLACED_VERSION,
    consumer: NPM_RUNTIME_OVERLAY_CONSUMER,
    consumerVersion: NPM_RUNTIME_OVERLAY_CONSUMER_VERSION,
    consumerDependencyRange: NPM_RUNTIME_OVERLAY_CONSUMER_RANGE,
  }
  securityOverlay.identityDigest = npmRuntimeOverlayIdentity(securityOverlay)
  return Object.freeze({
    ...npmArtifact,
    securityOverlay: Object.freeze(securityOverlay),
  })
}

async function downloadCanonicalRegistryTarball(url, {
  label,
  pathPattern,
  timeoutMs = 30_000,
} = {}) {
  const target = new URL(url)
  invariant(
    target.protocol === 'https:'
      && target.origin === NPM_REGISTRY_ORIGIN
      && !target.username
      && !target.password
      && !target.port
      && !target.search
      && !target.hash
      && pathPattern.test(target.pathname),
    `${label} tarball URL is outside the canonical registry contract`,
  )
  return await new Promise((resolvePromise, rejectPromise) => {
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      rejectPromise(error instanceof Error ? error : new Error(String(error)))
    }
    const requestHandle = request(target, {
      method: 'GET',
      headers: {
        Accept: 'application/octet-stream',
        'Accept-Encoding': 'identity',
        'User-Agent': 'qijenchen-verified-npm-runtime/1',
      },
    }, (response) => {
      const status = response.statusCode || 0
      if (status !== 200) {
        response.resume()
        fail(new Error(`GOV-NPM-RUNTIME-001:${label} download returned HTTP ${status}; redirects are forbidden`))
        return
      }
      const contentEncoding = String(response.headers['content-encoding'] || 'identity').toLowerCase()
      if (contentEncoding !== 'identity') {
        response.resume()
        fail(new Error(`GOV-NPM-RUNTIME-001:${label} download used unexpected content encoding:${contentEncoding}`))
        return
      }
      const contentLength = Number(response.headers['content-length'] || 0)
      if (contentLength && (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > MAX_COMPRESSED_BYTES)) {
        response.resume()
        fail(new Error(`GOV-NPM-RUNTIME-001:${label} download length exceeds the closed archive budget`))
        return
      }
      const chunks = []
      let length = 0
      response.on('data', (chunk) => {
        length += chunk.length
        if (length > MAX_COMPRESSED_BYTES) {
          response.destroy(new Error(`GOV-NPM-RUNTIME-001:${label} download exceeded the closed archive budget`))
          return
        }
        chunks.push(chunk)
      })
      response.on('error', fail)
      response.on('end', () => {
        if (settled) return
        if (contentLength && length !== contentLength) {
          fail(new Error(`GOV-NPM-RUNTIME-001:${label} download length differs from Content-Length`))
          return
        }
        if (length === 0) {
          fail(new Error(`GOV-NPM-RUNTIME-001:${label} download is empty`))
          return
        }
        settled = true
        resolvePromise(Buffer.concat(chunks, length))
      })
    })
    requestHandle.setTimeout(timeoutMs, () => requestHandle.destroy(new Error(`GOV-NPM-RUNTIME-001:${label} download timed out`)))
    requestHandle.on('error', fail)
    requestHandle.end()
  })
}

export async function downloadCanonicalNpmTarball(url, { timeoutMs = 30_000 } = {}) {
  return downloadCanonicalRegistryTarball(url, {
    label: 'canonical npm',
    pathPattern: /^\/npm\/-\/npm-\d+\.\d+\.\d+\.tgz$/,
    timeoutMs,
  })
}

export async function downloadCanonicalNpmSecurityOverlayTarball(url, { timeoutMs = 30_000 } = {}) {
  return downloadCanonicalRegistryTarball(url, {
    label: 'canonical npm security overlay',
    pathPattern: /^\/brace-expansion\/-\/brace-expansion-5\.0\.8\.tgz$/,
    timeoutMs,
  })
}

function decodeTarField(header, offset, length, label) {
  const field = header.subarray(offset, offset + length)
  const terminator = field.indexOf(0)
  const bytes = terminator === -1 ? field : field.subarray(0, terminator)
  if (terminator !== -1) invariant(field.subarray(terminator).every((byte) => byte === 0), `${label} has nonzero bytes after NUL`)
  let value
  try { value = textDecoder.decode(bytes) } catch { throw new Error(`GOV-NPM-RUNTIME-001:${label} is not valid UTF-8`) }
  invariant(!/[\u0000-\u001f\u007f]/u.test(value), `${label} contains control characters`)
  return value
}

function parseTarOctal(header, offset, length, label, { allowEmpty = false } = {}) {
  const raw = header.subarray(offset, offset + length).toString('ascii').replace(/[\0 ]+$/u, '').replace(/^ +/u, '')
  if (!raw && allowEmpty) return 0
  invariant(/^[0-7]+$/.test(raw), `${label} is not canonical octal`)
  const value = Number.parseInt(raw, 8)
  invariant(Number.isSafeInteger(value) && value >= 0, `${label} exceeds the safe integer range`)
  return value
}

function portablePathKey(value) {
  return value.split('/').map((segment) => segment.normalize('NFC').toLocaleLowerCase('en-US').normalize('NFC')).join('/')
}

function canonicalArchivePath(value, label) {
  invariant(value.length > 0 && Buffer.byteLength(value) <= MAX_ARCHIVE_PATH_BYTES, `${label} exceeds the closed path budget`)
  invariant(!value.startsWith('/') && !value.includes('\\') && !value.includes('//'), `${label} is not a portable relative path`)
  const parts = value.split('/')
  invariant(parts.every((part) => part && part !== '.' && part !== '..'), `${label} contains traversal segments`)
  invariant(parts[0] === 'package' && parts.length > 1, `${label} must live below the package/ archive root`)
  return value
}

function parseClosedUstar(tarBytes) {
  invariant(Buffer.isBuffer(tarBytes) && tarBytes.length >= TAR_BLOCK_SIZE * 2 && tarBytes.length % TAR_BLOCK_SIZE === 0, 'decompressed npm archive is not block-aligned ustar')
  invariant(tarBytes.length <= MAX_UNCOMPRESSED_BYTES, 'decompressed npm archive exceeds the closed size budget')
  const entries = []
  const paths = new Map()
  let offset = 0
  let endOffset = -1
  while (offset + TAR_BLOCK_SIZE <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + TAR_BLOCK_SIZE)
    if (header.every((byte) => byte === 0)) {
      endOffset = offset
      break
    }
    invariant(entries.length < MAX_ARCHIVE_ENTRIES, 'npm archive exceeds the closed entry budget')
    invariant(header.subarray(257, 263).equals(Buffer.from('ustar\0')) && header.subarray(263, 265).equals(Buffer.from('00')), 'npm archive uses an unsupported tar format')
    const recordedChecksum = parseTarOctal(header, 148, 8, 'tar header checksum')
    let computedChecksum = 0
    for (let index = 0; index < TAR_BLOCK_SIZE; index += 1) computedChecksum += index >= 148 && index < 156 ? 0x20 : header[index]
    invariant(recordedChecksum === computedChecksum, 'npm archive tar header checksum mismatch')
    const name = decodeTarField(header, 0, 100, 'tar entry name')
    const prefix = decodeTarField(header, 345, 155, 'tar entry prefix')
    const path = canonicalArchivePath(prefix ? `${prefix}/${name}` : name, 'tar entry path')
    const key = portablePathKey(path)
    invariant(!paths.has(key), `npm archive contains duplicate or portable-alias paths:${paths.get(key) || path}:${path}`)
    const typeByte = header[156]
    const type = typeByte === 0 || typeByte === 0x30 ? 'file' : null
    // The canonical npm archive contains only regular files. Rejecting directory records as well
    // as links, devices, and metadata extensions keeps extraction to one closed write primitive.
    invariant(type !== null, `npm archive contains unsupported directory/link/special/PAX entry type:${String.fromCharCode(typeByte || 0)}`)
    const mode = parseTarOctal(header, 100, 8, `tar mode ${path}`)
    invariant(mode === 0o644 || mode === 0o755, `npm archive entry has unsupported mode:${path}:${mode.toString(8)}`)
    const size = parseTarOctal(header, 124, 12, `tar size ${path}`, { allowEmpty: true })
    invariant(size <= MAX_FILE_BYTES, `npm archive file exceeds the closed per-file budget:${path}`)
    const dataStart = offset + TAR_BLOCK_SIZE
    const paddedSize = Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE
    const nextOffset = dataStart + paddedSize
    invariant(nextOffset <= tarBytes.length, `npm archive entry exceeds archive bounds:${path}`)
    const padding = tarBytes.subarray(dataStart + size, nextOffset)
    invariant(padding.every((byte) => byte === 0), `npm archive entry has nonzero padding:${path}`)
    const parentParts = path.split('/')
    for (let index = 1; index < parentParts.length; index += 1) {
      const parentKey = portablePathKey(parentParts.slice(0, index).join('/'))
      invariant(paths.get(parentKey)?.type !== 'file', `npm archive file is an ancestor of another entry:${path}`)
    }
    for (const existingKey of paths.keys()) {
      invariant(!existingKey.startsWith(`${key}/`), `npm archive file is an ancestor of another entry:${path}`)
    }
    paths.set(key, { path, type })
    entries.push({ content: tarBytes.subarray(dataStart, dataStart + size), mode, path, type })
    offset = nextOffset
  }
  invariant(endOffset >= 0 && tarBytes.length - endOffset >= TAR_BLOCK_SIZE * 2, 'npm archive lacks the two-block end marker')
  invariant(tarBytes.subarray(endOffset).every((byte) => byte === 0), 'npm archive has data after its end marker')
  invariant(entries.length > 0, 'npm archive contains no files')
  return entries
}

function extractClosedArchive(entries, extractionRoot) {
  const root = realpathSync(resolve(extractionRoot))
  invariant(lstatSync(root).isDirectory(), 'disposable extraction root must be a real directory')
  for (const entry of entries) {
    const target = join(root, ...entry.path.split('/'))
    const parent = dirname(target)
    mkdirSync(parent, { recursive: true, mode: 0o755 })
    const realParent = realpathSync(parent)
    invariant(realParent.startsWith(`${root}${sep}`) || realParent === root, `npm extraction parent escaped disposable root:${entry.path}`)
    const descriptor = openSync(target, 'wx', entry.mode)
    try { writeFileSync(descriptor, entry.content) } finally { closeSync(descriptor) }
    chmodSync(target, entry.mode)
  }
  return join(root, 'package')
}

function probeCli(cli, expectedVersion, { cwd, env, runner }) {
  const isolatedEnv = Object.fromEntries(Object.entries(env || {}).filter(([name]) => !/^(?:NODE_OPTIONS|NODE_PATH)$/i.test(name)))
  const result = runner(process.execPath, [cli, '--version'], {
    cwd,
    env: isolatedEnv,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
  if (result?.error) throw result.error
  invariant(result?.status === 0, `verified npm CLI version probe failed with exit ${result?.status}`)
  invariant(String(result.stdout || '').trim() === expectedVersion, `verified npm CLI reports ${String(result.stdout || '').trim() || '<empty>'}, expected ${expectedVersion}`)
}

function regularTreeDigest(rootPath) {
  const root = realpathSync(resolve(rootPath))
  const rootInfo = lstatSync(root)
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), 'npm security overlay tree root must be one real directory')
  const records = []
  const walk = (directory, prefix = '') => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = join(directory, entry.name)
      const info = lstatSync(absolute)
      invariant(!entry.isSymbolicLink() && !info.isSymbolicLink(), `npm security overlay tree contains a symlink:${relative}`)
      if (entry.isDirectory()) {
        invariant(info.isDirectory() && realpathSync(absolute) === absolute, `npm security overlay tree contains an aliased directory:${relative}`)
        walk(absolute, relative)
        continue
      }
      invariant(
        entry.isFile() && info.isFile() && info.nlink === 1 && realpathSync(absolute) === absolute,
        `npm security overlay tree contains an unsafe file:${relative}`,
      )
      const bytes = readFileSync(absolute)
      records.push({
        path: relative,
        mode: info.mode & 0o777,
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      })
    }
  }
  walk(root)
  invariant(records.length > 0, 'npm security overlay tree is empty')
  return createHash('sha256').update(JSON.stringify(records)).digest('hex')
}

function probeNpmRuntimeSecurityOverlay(packageRoot, { env, runner }) {
  const isolatedEnv = Object.fromEntries(Object.entries(env || {}).filter(([name]) => !/^(?:NODE_OPTIONS|NODE_PATH)$/i.test(name)))
  const compatibilityProbe = `
const dependencyRoot = '.' + '/node_modules/'
const brace = require(dependencyRoot + 'brace-expansion')
const minimatchModule = require(dependencyRoot + 'minimatch')
const minimatch = minimatchModule.minimatch || minimatchModule
if (typeof brace.expand !== 'function') process.exit(41)
if (JSON.stringify(brace.expand('{a,b}')) !== JSON.stringify(['a','b'])) process.exit(42)
if (typeof minimatch !== 'function' || !minimatch('a', '{a,b}')) process.exit(43)
`
  const result = runner(process.execPath, ['--eval', compatibilityProbe], {
    cwd: packageRoot,
    env: isolatedEnv,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })
  if (result?.error) throw result.error
  invariant(result?.status === 0, `npm security overlay compatibility probe failed with exit ${String(result?.status)}`)
}

function applyNpmRuntimeSecurityOverlay({
  packageRoot,
  stagingParent,
  securityOverlay,
  tarballBytes,
  env,
  runner,
}) {
  invariant(
    securityOverlay
      && securityOverlay.identityDigest === npmRuntimeOverlayIdentity(securityOverlay)
      && securityOverlay.package === NPM_RUNTIME_OVERLAY_PACKAGE
      && securityOverlay.version === NPM_RUNTIME_OVERLAY_VERSION
      && securityOverlay.target === NPM_RUNTIME_OVERLAY_TARGET
      && securityOverlay.replacedVersion === NPM_RUNTIME_OVERLAY_REPLACED_VERSION
      && securityOverlay.consumer === NPM_RUNTIME_OVERLAY_CONSUMER
      && securityOverlay.consumerVersion === NPM_RUNTIME_OVERLAY_CONSUMER_VERSION
      && securityOverlay.consumerDependencyRange === NPM_RUNTIME_OVERLAY_CONSUMER_RANGE,
    'npm security overlay contract is invalid',
  )
  const expectedIntegrity = integrityBytes(securityOverlay.integrity)
  invariant(Buffer.isBuffer(tarballBytes) && tarballBytes.length > 0 && tarballBytes.length <= MAX_COMPRESSED_BYTES, 'npm security overlay tarball bytes exceed the closed compressed budget')
  const actualIntegrity = createHash('sha512').update(tarballBytes).digest()
  invariant(timingSafeEqual(actualIntegrity, expectedIntegrity), 'npm security overlay tarball SHA-512 differs from the committed lock')
  let tarBytes
  try { tarBytes = gunzipSync(tarballBytes, { maxOutputLength: MAX_UNCOMPRESSED_BYTES }) } catch (error) {
    throw new Error(`GOV-NPM-RUNTIME-001:npm security overlay tarball is not a bounded canonical gzip archive:${error?.message || error}`)
  }
  const entries = parseClosedUstar(tarBytes)
  const target = resolve(packageRoot, ...securityOverlay.target.split('/'))
  const targetInfo = lstatSync(target)
  invariant(
    targetInfo.isDirectory() && !targetInfo.isSymbolicLink() && realpathSync(target) === target,
    'npm security overlay target must be one real extracted directory',
  )
  const replacedManifest = readJson(join(target, 'package.json'), 'npm security overlay replaced package manifest')
  invariant(
    replacedManifest.name === securityOverlay.package && replacedManifest.version === securityOverlay.replacedVersion,
    'npm security overlay replaced package identity differs from the certified contract',
  )
  const consumer = resolve(packageRoot, ...securityOverlay.consumer.split('/'))
  const consumerManifest = readJson(join(consumer, 'package.json'), 'npm security overlay consumer manifest')
  invariant(
    consumerManifest.name === 'minimatch'
      && consumerManifest.version === securityOverlay.consumerVersion
      && consumerManifest.dependencies?.[securityOverlay.package] === securityOverlay.consumerDependencyRange,
    'npm security overlay consumer identity or dependency range differs from the certified contract',
  )
  const staging = realpathSync(mkdtempSync(join(realpathSync(resolve(stagingParent)), '.verified-npm-security-overlay-')))
  chmodSync(staging, 0o700)
  const replacement = extractClosedArchive(entries, staging)
  const replacementManifest = readJson(join(replacement, 'package.json'), 'npm security overlay replacement package manifest')
  invariant(
    replacementManifest.name === securityOverlay.package && replacementManifest.version === securityOverlay.version,
    'npm security overlay replacement package identity differs from the committed lock',
  )
  rmSync(target, { recursive: true, force: false })
  renameSync(replacement, target)
  rmSync(staging, { recursive: true, force: false })
  const appliedManifest = readJson(join(target, 'package.json'), 'applied npm security overlay package manifest')
  invariant(
    appliedManifest.name === securityOverlay.package && appliedManifest.version === securityOverlay.version,
    'applied npm security overlay identity differs after atomic replacement',
  )
  probeNpmRuntimeSecurityOverlay(packageRoot, { env, runner })
  const treeDigest = regularTreeDigest(target)
  return Object.freeze({
    schemaVersion: 1,
    kind: 'verified-npm-runtime-security-overlay-receipt',
    status: 'applied',
    identityDigest: securityOverlay.identityDigest,
    npmVersion: securityOverlay.npmVersion,
    package: securityOverlay.package,
    version: securityOverlay.version,
    integrity: securityOverlay.integrity,
    target: securityOverlay.target,
    replacedVersion: securityOverlay.replacedVersion,
    consumer: securityOverlay.consumer,
    consumerVersion: securityOverlay.consumerVersion,
    treeDigest,
  })
}

function verifyAppliedNpmRuntimeSecurityOverlay({
  packageRoot,
  securityOverlay,
  expectedTreeDigest,
  env,
  runner,
}) {
  const packageManifest = readJson(join(packageRoot, 'package.json'), 'installed npm package manifest')
  invariant(
    packageManifest.name === 'npm' && packageManifest.version === securityOverlay.npmVersion,
    'installed npm package identity differs from the overlay contract',
  )
  const target = resolve(packageRoot, ...securityOverlay.target.split('/'))
  const targetManifest = readJson(join(target, 'package.json'), 'installed npm security overlay package manifest')
  invariant(
    targetManifest.name === securityOverlay.package && targetManifest.version === securityOverlay.version,
    'installed npm security overlay package is missing, stale, or substituted',
  )
  const consumerManifest = readJson(
    join(packageRoot, ...securityOverlay.consumer.split('/'), 'package.json'),
    'installed npm security overlay consumer manifest',
  )
  invariant(
    consumerManifest.name === 'minimatch'
      && consumerManifest.version === securityOverlay.consumerVersion
      && consumerManifest.dependencies?.[securityOverlay.package] === securityOverlay.consumerDependencyRange,
    'installed npm security overlay consumer identity or dependency range drifted',
  )
  const treeDigest = regularTreeDigest(target)
  invariant(treeDigest === expectedTreeDigest, 'installed npm security overlay tree differs from the verified runtime overlay')
  probeNpmRuntimeSecurityOverlay(packageRoot, { env, runner })
  return Object.freeze({
    schemaVersion: 1,
    kind: 'verified-installed-npm-security-overlay-receipt',
    status: 'verified',
    identityDigest: securityOverlay.identityDigest,
    npmVersion: securityOverlay.npmVersion,
    package: securityOverlay.package,
    version: securityOverlay.version,
    integrity: securityOverlay.integrity,
    target: securityOverlay.target,
    treeDigest,
  })
}

function verifyInstalledNpmAuditClosure(repositoryRoot, securityOverlay) {
  const root = realpathSync(resolve(repositoryRoot))
  const expected = [
    ['node_modules/brace-expansion', 'brace-expansion', securityOverlay.version, null],
    ['node_modules/minimatch', 'minimatch', securityOverlay.consumerVersion, [securityOverlay.package, securityOverlay.consumerDependencyRange]],
    [`node_modules/${securityOverlay.alias}`, securityOverlay.package, securityOverlay.version, null],
  ]
  try {
    const eslintManifest = readJson(join(root, 'node_modules/eslint/package.json'), 'installed eslint audit-closure manifest')
    invariant(
      eslintManifest.name === 'eslint'
        && eslintManifest.version === '10.8.0'
        && eslintManifest.dependencies?.minimatch === '^10.2.5',
      'installed eslint audit-closure identity or minimatch range drifted',
    )
    expected.push(['node_modules/eslint', 'eslint', '10.8.0', ['minimatch', '^10.2.5']])
  } catch (error) {
    if (!String(error?.message || '').includes('is missing or unreadable')) throw error
  }
  const records = expected.map(([relative, name, version, dependency]) => {
    const manifest = readJson(join(root, relative, 'package.json'), `installed npm audit-closure manifest ${relative}`)
    invariant(
      manifest.name === name
        && manifest.version === version
        && (!dependency || manifest.dependencies?.[dependency[0]] === dependency[1]),
      `installed npm audit-closure package drifted:${relative}`,
    )
    return {
      path: relative,
      name,
      version,
      dependency: dependency ? { name: dependency[0], range: dependency[1] } : null,
    }
  })
  return Object.freeze({
    records: Object.freeze(records.map((record) => Object.freeze(record))),
    digest: createHash('sha256').update(JSON.stringify(records)).digest('hex'),
  })
}

export function materializeVerifiedExactNpmRuntime({
  artifact,
  tarballBytes,
  securityOverlayTarballBytes,
  parentDirectory = tmpdir(),
  env = process.env,
  runner = spawnSync,
} = {}) {
  invariant(artifact && typeof artifact === 'object' && !Array.isArray(artifact), 'verified npm artifact contract is missing')
  invariant(EXACT_STABLE_VERSION.test(artifact.version || ''), 'verified npm artifact version is invalid')
  invariant(artifact.resolved === `${NPM_REGISTRY_ORIGIN}/npm/-/npm-${artifact.version}.tgz`, 'verified npm artifact URL/version binding is invalid')
  const expectedIntegrity = integrityBytes(artifact.integrity)
  invariant(Buffer.isBuffer(tarballBytes) && tarballBytes.length > 0 && tarballBytes.length <= MAX_COMPRESSED_BYTES, 'npm tarball bytes exceed the closed compressed budget')
  const actualIntegrity = createHash('sha512').update(tarballBytes).digest()
  invariant(timingSafeEqual(actualIntegrity, expectedIntegrity), 'npm tarball SHA-512 differs from the committed lock')
  let tarBytes
  try { tarBytes = gunzipSync(tarballBytes, { maxOutputLength: MAX_UNCOMPRESSED_BYTES }) } catch (error) {
    throw new Error(`GOV-NPM-RUNTIME-001:npm tarball is not a bounded canonical gzip archive:${error?.message || error}`)
  }
  const entries = parseClosedUstar(tarBytes)
  const parent = realpathSync(resolve(parentDirectory))
  const root = realpathSync(mkdtempSync(join(parent, 'verified-exact-npm-')))
  chmodSync(root, 0o700)
  let keep = false
  try {
    const packageRoot = extractClosedArchive(entries, root)
    const packageManifest = readJson(join(packageRoot, 'package.json'), 'verified npm package manifest')
    invariant(packageManifest.name === 'npm' && packageManifest.version === artifact.version, 'verified npm package identity differs from the committed lock')
    invariant(packageManifest.bin?.npm === 'bin/npm-cli.js', 'verified npm package does not bind bin/npm-cli.js')
    const securityOverlay = artifact.securityOverlay
      ? applyNpmRuntimeSecurityOverlay({
          packageRoot,
          stagingParent: root,
          securityOverlay: artifact.securityOverlay,
          tarballBytes: securityOverlayTarballBytes,
          env,
          runner,
        })
      : null
    invariant(
      artifact.securityOverlay ? securityOverlay?.status === 'applied' : securityOverlay === null && securityOverlayTarballBytes === undefined,
      'npm security overlay materialization state differs from the runtime contract',
    )
    const cli = regularUnaliasedFile(join(packageRoot, 'bin/npm-cli.js'), 'verified npm CLI')
    invariant((lstatSync(cli).mode & 0o111) !== 0, 'verified npm CLI is not executable')
    probeCli(cli, artifact.version, { cwd: packageRoot, env, runner })
    keep = true
    let live = true
    const runtime = {
      artifact: Object.freeze({ ...artifact }),
      cli,
      packageRoot,
      root,
      securityOverlay,
      toolchain: Object.freeze({ node: process.version, npm: artifact.version }),
      applyInstalledSecurityOverlay(repositoryRoot) {
        invariant(securityOverlay?.status === 'applied', 'verified runtime has no applied npm security overlay')
        const repository = realpathSync(resolve(repositoryRoot))
        const packageRoot = resolve(repository, 'node_modules/npm')
        const installedManifest = readJson(join(packageRoot, 'package.json'), 'installed npm package manifest')
        invariant(
          installedManifest.name === 'npm' && installedManifest.version === artifact.version,
          'installed npm package identity differs from the verified runtime',
        )
        const receipt = applyNpmRuntimeSecurityOverlay({
          packageRoot,
          stagingParent: resolve(packageRoot, 'node_modules'),
          securityOverlay: artifact.securityOverlay,
          tarballBytes: securityOverlayTarballBytes,
          env,
          runner,
        })
        invariant(receipt.treeDigest === securityOverlay.treeDigest, 'installed npm security overlay tree differs from the verified runtime overlay')
        const installedReceipt = verifyAppliedNpmRuntimeSecurityOverlay({
          packageRoot,
          securityOverlay: artifact.securityOverlay,
          expectedTreeDigest: securityOverlay.treeDigest,
          env,
          runner,
        })
        const auditClosure = verifyInstalledNpmAuditClosure(repository, artifact.securityOverlay)
        return Object.freeze({
          ...installedReceipt,
          auditClosureDigest: auditClosure.digest,
          auditClosure: auditClosure.records,
        })
      },
      verifyInstalledSecurityOverlay(repositoryRoot) {
        invariant(securityOverlay?.status === 'applied', 'verified runtime has no applied npm security overlay')
        const repository = realpathSync(resolve(repositoryRoot))
        const installedReceipt = verifyAppliedNpmRuntimeSecurityOverlay({
          packageRoot: resolve(repository, 'node_modules/npm'),
          securityOverlay: artifact.securityOverlay,
          expectedTreeDigest: securityOverlay.treeDigest,
          env,
          runner,
        })
        const auditClosure = verifyInstalledNpmAuditClosure(repository, artifact.securityOverlay)
        return Object.freeze({
          ...installedReceipt,
          auditClosureDigest: auditClosure.digest,
          auditClosure: auditClosure.records,
        })
      },
      cleanup() {
        if (!live) return
        live = false
        rmSync(root, { recursive: true, force: true })
      },
    }
    return Object.freeze(runtime)
  } finally {
    if (!keep) rmSync(root, { recursive: true, force: true })
  }
}

export async function prepareVerifiedExactNpmRuntime({
  repositoryRoot,
  parentDirectory = tmpdir(),
  download = downloadCanonicalNpmTarball,
  downloadSecurityOverlay = downloadCanonicalNpmSecurityOverlayTarball,
  env = process.env,
  runner = spawnSync,
} = {}) {
  const artifact = resolveExactNpmRuntimeContract(repositoryRoot)
  const tarballBytes = await download(artifact.resolved)
  const securityOverlayTarballBytes = await downloadSecurityOverlay(artifact.securityOverlay.resolved)
  return materializeVerifiedExactNpmRuntime({
    artifact,
    tarballBytes,
    securityOverlayTarballBytes,
    parentDirectory,
    env,
    runner,
  })
}

export function assertVerifiedExactNpmRuntimeCapability(runtime, expectedContract) {
  invariant(
    runtime?.cli
      && runtime?.artifact?.version === expectedContract?.version
      && runtime?.artifact?.resolved === expectedContract?.resolved
      && runtime?.artifact?.integrity === expectedContract?.integrity
      && runtime?.toolchain?.npm === expectedContract?.version,
    'verified exact npm runtime capability differs from the committed artifact',
  )
  const expectedOverlay = expectedContract?.securityOverlay
  invariant(
    expectedOverlay
      && runtime?.artifact?.securityOverlay?.identityDigest === expectedOverlay.identityDigest
      && runtime?.securityOverlay?.status === 'applied'
      && runtime?.securityOverlay?.identityDigest === expectedOverlay.identityDigest
      && runtime?.securityOverlay?.integrity === expectedOverlay.integrity
      && runtime?.securityOverlay?.target === expectedOverlay.target
      && runtime?.securityOverlay?.version === expectedOverlay.version,
    'verified exact npm runtime security overlay is missing, stale, or substituted',
  )
  return true
}
