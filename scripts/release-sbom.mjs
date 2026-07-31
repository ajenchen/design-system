#!/usr/bin/env node

import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RELEASE_TAG_PATTERN = /^v[0-9]+\.[0-9]+\.[0-9]+(?:-(?:beta|next|rc)\.[0-9]+)?$/
const GIT_TREE_PATTERN = /^[0-9a-f]{40}$/

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function validateIdentity({ tag, gitTree }) {
  invariant(RELEASE_TAG_PATTERN.test(tag || ''), 'release SBOM tag must be vX.Y.Z or vX.Y.Z-(beta|next|rc).N')
  invariant(GIT_TREE_PATTERN.test(gitTree || ''), 'release SBOM git tree must be a lowercase full SHA-1')
}

function validateCycloneDx(document) {
  invariant(document !== null && typeof document === 'object' && !Array.isArray(document), 'release SBOM must be a JSON object')
  invariant(document.bomFormat === 'CycloneDX', 'release SBOM must use CycloneDX format')
  const version = typeof document.specVersion === 'string'
    ? document.specVersion.match(/^([0-9]+)\.([0-9]+)$/)
    : null
  invariant(version, 'release SBOM must declare a numeric CycloneDX specVersion')
  const major = Number(version[1])
  const minor = Number(version[2])
  invariant(major > 1 || (major === 1 && minor >= 4), 'release SBOM requires CycloneDX specVersion 1.4 or newer')
  invariant(
    document.metadata === undefined
      || (document.metadata !== null && typeof document.metadata === 'object' && !Array.isArray(document.metadata)),
    'release SBOM metadata must be a JSON object when present',
  )
}

function canonicalJsonValue(value, location = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), `release SBOM contains a non-finite number at ${location}`)
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalJsonValue(item, `${location}[${index}]`))
  }
  invariant(typeof value === 'object', `release SBOM contains a non-JSON value at ${location}`)
  const prototype = Object.getPrototypeOf(value)
  invariant(
    prototype === Object.prototype || prototype === null,
    `release SBOM contains a non-JSON object at ${location}`,
  )
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalJsonValue(value[key], `${location}.${key}`)]),
  )
}

export function releaseSbomSerialNumber({ tag, gitTree }) {
  validateIdentity({ tag, gitTree })
  // SHA-1 is used only to preserve the existing deterministic UUID-shaped
  // identifier. Release authenticity remains bound by the signed tag and BOM.
  const digest = createHash('sha1').update(`${tag}:${gitTree}`).digest()
  digest[6] = (digest[6] & 0x0f) | 0x50
  digest[8] = (digest[8] & 0x3f) | 0x80
  const hexadecimal = digest.subarray(0, 16).toString('hex')
  return `urn:uuid:${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20, 32)}`
}

export function normalizeReleaseSbom(document, { tag, gitTree }) {
  validateCycloneDx(document)
  const normalized = {
    ...document,
    serialNumber: releaseSbomSerialNumber({ tag, gitTree }),
  }
  if (document.metadata !== undefined) {
    normalized.metadata = { ...document.metadata }
    delete normalized.metadata.timestamp
  }
  return canonicalJsonValue(normalized)
}

export function canonicalReleaseSbomBytes(document, identity) {
  return Buffer.from(`${JSON.stringify(normalizeReleaseSbom(document, identity), null, 2)}\n`, 'utf8')
}

function parseArgs(argv) {
  const allowed = new Set(['--input', '--output', '--tag', '--git-tree'])
  const values = {}
  invariant(argv.length % 2 === 0, 'release SBOM arguments must be name/value pairs')
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    invariant(allowed.has(name) && value && !value.startsWith('--'), `invalid release SBOM argument: ${name || '<missing>'}`)
    invariant(values[name] === undefined, `duplicate release SBOM argument: ${name}`)
    values[name] = value
  }
  for (const name of allowed) invariant(values[name], `${name} is required`)
  return values
}

function canonicalRegularInput(path) {
  const absolute = resolve(path)
  const before = lstatSync(absolute)
  invariant(
    before.isFile() && !before.isSymbolicLink() && realpathSync(absolute) === absolute,
    'release SBOM input must be a canonical regular file (no symlink)',
  )
  const body = readFileSync(absolute, 'utf8')
  const after = lstatSync(absolute)
  invariant(
    after.isFile()
      && !after.isSymbolicLink()
      && before.dev === after.dev
      && before.ino === after.ino
      && before.size === after.size
      && before.mtimeMs === after.mtimeMs
      && before.ctimeMs === after.ctimeMs,
    'release SBOM input changed while it was read',
  )
  return body
}

function canonicalUnusedOutput(path) {
  const absolute = resolve(path)
  invariant(!existsSync(absolute), 'release SBOM output already exists')
  const parent = dirname(absolute)
  const stats = lstatSync(parent)
  invariant(
    stats.isDirectory() && !stats.isSymbolicLink() && realpathSync(parent) === parent,
    'release SBOM output parent must be a canonical directory (no symlink)',
  )
  return absolute
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const input = canonicalRegularInput(args['--input'])
  const output = canonicalUnusedOutput(args['--output'])
  let document
  try {
    document = JSON.parse(input)
  } catch (error) {
    throw new Error(`release SBOM input is not valid JSON: ${error.message}`)
  }
  const body = canonicalReleaseSbomBytes(document, {
    tag: args['--tag'],
    gitTree: args['--git-tree'],
  })
  writeFileSync(output, body, { flag: 'wx', mode: 0o600 })
  console.log(`✅ canonical release SBOM written: ${output}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exitCode = 1
  }
}
