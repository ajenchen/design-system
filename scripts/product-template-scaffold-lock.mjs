#!/usr/bin/env node
// Closed, deterministic provenance for the complete published product-template scaffold.
//
// Static files are byte/mode locked before publication. package-lock.json is the only
// post-release generated path: its path, mode, generator contract, package identities,
// and final bytes are closed by this lock + the mirror evidence tree receipt.

import { createHash } from 'node:crypto'
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION } from './lib/governance-dependency-bootstrap.mjs'

export const PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET = 'product-template-scaffold.lock.json'
export const PRODUCT_TEMPLATE_SCAFFOLD_LOCK_SCHEMA_VERSION = 1
export const PRODUCT_TEMPLATE_SCAFFOLD_LOCK_KIND = 'qijenchen-product-template-scaffold'
export const PRODUCT_TEMPLATE_PACKAGE_LOCK_NPM_COMMAND = Object.freeze([
  'install',
  '--package-lock-only',
  '--ignore-scripts',
  '--legacy-peer-deps',
  '--no-audit',
  '--no-fund',
  // 強制向 registry 重新驗證 metadata(2026-08-05 病根修):CI runner 還原的 npm cache 會
  // 回吐 stale packument,npm 直接回報 'up to date' 而不重新解析 → 產出的 lock 仍釘前一版,
  // mirror 照樣開 PR,直到 consumer 的 `npm ci` 才炸(beta.112 / beta.113 兩次實證)。
  '--prefer-online',
])
export const PRODUCT_TEMPLATE_PACKAGE_LOCK_GENERATOR = `npm@${GOVERNANCE_DEPENDENCY_EXACT_NPM_VERSION} ${PRODUCT_TEMPLATE_PACKAGE_LOCK_NPM_COMMAND.join(' ')}`
export const PRODUCT_TEMPLATE_GENERATED_ENTRIES = Object.freeze([
  Object.freeze({
    path: 'package-lock.json',
    mode: '644',
    generator: PRODUCT_TEMPLATE_PACKAGE_LOCK_GENERATOR,
  }),
])

const LOCK_KEYS = ['schemaVersion', 'kind', 'releaseVersion', 'staticTreeSha256', 'publishedPathCount', 'entries', 'generatedEntries']
const ENTRY_KEYS = ['path', 'mode', 'size', 'sha256']
const GENERATED_ENTRY_KEYS = ['path', 'mode', 'generator']
const SHA256 = /^[a-f0-9]{64}$/
const VERSION = /^\d+\.\d+\.\d+(?:-(?:beta|next|rc)\.\d+)?$/
const invariant = (condition, message) => { if (!condition) throw new Error(message) }
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const canonicalJson = value => `${JSON.stringify(value, null, 2)}\n`
const comparePathBytes = (left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export function productTemplatePackageLockNpmArgs(prefix) {
  invariant(typeof prefix === 'string' && prefix.length > 0 && !/[\0\r\n]/.test(prefix), 'SCAFFOLD-GENERATOR-001: package-lock prefix is invalid')
  return Object.freeze([
    PRODUCT_TEMPLATE_PACKAGE_LOCK_NPM_COMMAND[0],
    '--prefix',
    prefix,
    ...PRODUCT_TEMPLATE_PACKAGE_LOCK_NPM_COMMAND.slice(1),
  ])
}

function normalizePath(path) {
  invariant(
    typeof path === 'string' && path && !isAbsolute(path) && !path.includes('\\') && !/[\0\r\n]/.test(path),
    `SCAFFOLD-PATH-001: unsafe path ${JSON.stringify(path)}`,
  )
  invariant(
    path.split('/').every(part => part && part !== '.' && part !== '..'),
    `SCAFFOLD-PATH-001: non-canonical path ${path}`,
  )
  invariant(path !== '.git' && !path.startsWith('.git/'), `SCAFFOLD-PATH-001: git metadata is forbidden: ${path}`)
  return path
}

function canonicalMode(stat) {
  const permission = stat.mode & 0o777
  invariant(permission === 0o644 || permission === 0o755, `SCAFFOLD-MODE-001: file mode must be 644 or 755, got ${permission.toString(8)}`)
  return permission.toString(8)
}

export function inventoryProductTemplate(rootPath, { allowRootGitMetadata = false } = {}) {
  const requestedRoot = resolve(rootPath)
  const requestedRootStat = lstatSync(requestedRoot)
  invariant(requestedRootStat.isDirectory() && !requestedRootStat.isSymbolicLink(), 'SCAFFOLD-ROOT-001: scaffold root must be a real directory')
  const root = realpathSync(requestedRoot)
  const rootStat = lstatSync(root)
  invariant(rootStat.isDirectory() && !rootStat.isSymbolicLink(), 'SCAFFOLD-ROOT-001: scaffold root must be a real directory')
  const entries = []
  const visit = directory => {
    for (const name of readdirSync(directory).sort(comparePathBytes)) {
      if (allowRootGitMetadata && directory === root && name === '.git') continue
      const absolute = join(directory, name)
      const stat = lstatSync(absolute)
      const path = normalizePath(relative(root, absolute).replaceAll('\\', '/'))
      invariant(!stat.isSymbolicLink(), `SCAFFOLD-PATH-002: scaffold contains symlink ${path}`)
      if (stat.isDirectory()) visit(absolute)
      else {
        invariant(stat.isFile(), `SCAFFOLD-PATH-002: scaffold contains special file ${path}`)
        const body = readFileSync(absolute)
        entries.push({ path, mode: canonicalMode(stat), size: body.length, sha256: sha256(body) })
      }
    }
  }
  visit(root)
  return entries.sort((left, right) => comparePathBytes(left.path, right.path))
}

export function scaffoldTreeBody(entries) {
  return entries.map(item => `${item.mode} ${item.sha256} ${item.size} ./${item.path}\n`).join('')
}

export function scaffoldTreeSha256(entries) {
  return sha256(Buffer.from(scaffoldTreeBody(entries)))
}

export function validateProductTemplateScaffoldLock(lock) {
  invariant(exactKeys(lock, LOCK_KEYS), 'SCAFFOLD-LOCK-001: scaffold lock has an open or incomplete shape')
  invariant(lock.schemaVersion === PRODUCT_TEMPLATE_SCAFFOLD_LOCK_SCHEMA_VERSION, 'SCAFFOLD-LOCK-001: scaffold lock schema is unsupported')
  invariant(lock.kind === PRODUCT_TEMPLATE_SCAFFOLD_LOCK_KIND, 'SCAFFOLD-LOCK-001: scaffold lock kind is invalid')
  invariant(VERSION.test(lock.releaseVersion ?? ''), 'SCAFFOLD-LOCK-001: scaffold release version is invalid')
  invariant(SHA256.test(lock.staticTreeSha256 ?? ''), 'SCAFFOLD-LOCK-001: static tree digest is invalid')
  invariant(Array.isArray(lock.entries) && lock.entries.length > 0, 'SCAFFOLD-LOCK-001: static scaffold inventory is empty')
  invariant(Array.isArray(lock.generatedEntries), 'SCAFFOLD-LOCK-001: generated scaffold inventory is missing')

  const paths = new Set()
  let previous = null
  for (const entry of lock.entries) {
    invariant(exactKeys(entry, ENTRY_KEYS), 'SCAFFOLD-LOCK-001: static entry has an open or incomplete shape')
    const path = normalizePath(entry.path)
    invariant(previous === null || comparePathBytes(previous, path) < 0, 'SCAFFOLD-LOCK-002: static entries must be uniquely byte-sorted')
    invariant(['644', '755'].includes(entry.mode), `SCAFFOLD-MODE-001: invalid locked mode for ${path}`)
    invariant(Number.isInteger(entry.size) && entry.size >= 0 && SHA256.test(entry.sha256 ?? ''), `SCAFFOLD-LOCK-001: invalid static evidence for ${path}`)
    paths.add(path)
    previous = path
  }

  previous = null
  for (const entry of lock.generatedEntries) {
    invariant(exactKeys(entry, GENERATED_ENTRY_KEYS), 'SCAFFOLD-LOCK-001: generated entry has an open or incomplete shape')
    const path = normalizePath(entry.path)
    invariant(previous === null || comparePathBytes(previous, path) < 0, 'SCAFFOLD-LOCK-002: generated entries must be uniquely byte-sorted')
    invariant(!paths.has(path), `SCAFFOLD-LOCK-002: generated path duplicates a static path: ${path}`)
    invariant(['644', '755'].includes(entry.mode) && typeof entry.generator === 'string' && entry.generator.length > 0, `SCAFFOLD-LOCK-001: invalid generated contract for ${path}`)
    paths.add(path)
    previous = path
  }
  invariant(
    canonicalJson(lock.generatedEntries) === canonicalJson(PRODUCT_TEMPLATE_GENERATED_ENTRIES),
    'SCAFFOLD-LOCK-003: generated path/generator contract differs from the closed release contract',
  )
  invariant(lock.publishedPathCount === paths.size, 'SCAFFOLD-LOCK-001: published path count is stale')
  invariant(scaffoldTreeSha256(lock.entries) === lock.staticTreeSha256, 'SCAFFOLD-LOCK-004: static tree digest differs from locked entries')
  return lock
}

export function buildProductTemplateScaffoldLock({ root, releaseVersion }) {
  invariant(VERSION.test(releaseVersion ?? ''), 'SCAFFOLD-LOCK-001: --version must be an exact supported release version')
  const entries = inventoryProductTemplate(root)
  const generatedPaths = new Set(PRODUCT_TEMPLATE_GENERATED_ENTRIES.map(item => item.path))
  for (const entry of entries) {
    invariant(!generatedPaths.has(entry.path), `SCAFFOLD-LOCK-005: source scaffold already contains generated path ${entry.path}`)
  }
  return validateProductTemplateScaffoldLock({
    schemaVersion: PRODUCT_TEMPLATE_SCAFFOLD_LOCK_SCHEMA_VERSION,
    kind: PRODUCT_TEMPLATE_SCAFFOLD_LOCK_KIND,
    releaseVersion,
    staticTreeSha256: scaffoldTreeSha256(entries),
    publishedPathCount: entries.length + PRODUCT_TEMPLATE_GENERATED_ENTRIES.length,
    entries,
    generatedEntries: PRODUCT_TEMPLATE_GENERATED_ENTRIES,
  })
}

function validateGeneratedPackageLock({ root, lock, releaseBom }) {
  const packageLock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  invariant(packageLock.lockfileVersion === 3 && packageLock.packages && typeof packageLock.packages === 'object', 'SCAFFOLD-GENERATED-001: package-lock.json must be npm lockfileVersion 3')
  const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const lockedRoot = packageLock.packages['']
  invariant(lockedRoot && lockedRoot.name === rootManifest.name && lockedRoot.version === rootManifest.version, 'SCAFFOLD-GENERATED-001: package-lock root identity differs from package.json')
  for (const field of ['dependencies', 'devDependencies', 'engines']) {
    invariant(stable(lockedRoot[field] ?? {}) === stable(rootManifest[field] ?? {}), `SCAFFOLD-GENERATED-001: package-lock root ${field} differs from package.json`)
  }
  invariant(JSON.stringify(lockedRoot.workspaces ?? []) === JSON.stringify(rootManifest.workspaces ?? []), 'SCAFFOLD-GENERATED-001: package-lock root workspaces differ from package.json')
  const appManifest = JSON.parse(readFileSync(join(root, 'apps/template/package.json'), 'utf8'))
  const lockedApp = packageLock.packages['apps/template']
  invariant(lockedApp && lockedApp.name === appManifest.name && lockedApp.version === appManifest.version, 'SCAFFOLD-GENERATED-001: package-lock app workspace identity differs from apps/template/package.json')
  for (const field of ['dependencies', 'devDependencies', 'engines']) {
    invariant(stable(lockedApp[field] ?? {}) === stable(appManifest[field] ?? {}), `SCAFFOLD-GENERATED-001: package-lock app ${field} differs from apps/template/package.json`)
  }
  if (releaseBom) {
    invariant(releaseBom.releaseVersion === lock.releaseVersion, 'SCAFFOLD-GENERATED-002: release BOM version differs from scaffold lock')
    const packages = new Map(releaseBom.packages.map(item => [item.name, item]))
    for (const name of ['@qijenchen/design-system', '@qijenchen/storybook-config']) {
      const expected = packages.get(name)
      const resolved = packageLock.packages[`node_modules/${name}`]
      const packageBase = name.split('/').at(-1)
      const expectedUrl = `https://registry.npmjs.org/${name}/-/${packageBase}-${expected?.version}.tgz`
      invariant(expected && resolved?.version === expected.version && resolved?.integrity === expected.integrity && resolved?.resolved === expectedUrl, `SCAFFOLD-GENERATED-002: package-lock ${name} differs from release BOM version/SRI/canonical registry`)
    }
  }
}

export function verifyProductTemplateScaffold({
  root: rootPath,
  lock: lockValue,
  phase = 'source',
  releaseBom = null,
  allowRootGitMetadata = false,
}) {
  invariant(['source', 'published'].includes(phase), `SCAFFOLD-VERIFY-001: unsupported phase ${phase}`)
  const lock = validateProductTemplateScaffoldLock(lockValue)
  const root = realpathSync(resolve(rootPath))
  const actual = inventoryProductTemplate(root, { allowRootGitMetadata })
  const expectedPaths = new Set(lock.entries.map(item => item.path))
  if (phase === 'published') for (const item of lock.generatedEntries) expectedPaths.add(item.path)
  invariant(actual.length === expectedPaths.size, `SCAFFOLD-VERIFY-002: expected ${expectedPaths.size} published paths, got ${actual.length}`)
  const actualByPath = new Map(actual.map(item => [item.path, item]))
  for (const path of expectedPaths) invariant(actualByPath.has(path), `SCAFFOLD-VERIFY-002: required scaffold path is missing: ${path}`)
  for (const item of actual) invariant(expectedPaths.has(item.path), `SCAFFOLD-VERIFY-002: undeclared scaffold path: ${item.path}`)
  for (const expected of lock.entries) {
    const observed = actualByPath.get(expected.path)
    invariant(canonicalJson(observed) === canonicalJson(expected), `SCAFFOLD-VERIFY-003: scaffold bytes/mode drifted: ${expected.path}`)
  }
  if (phase === 'published') {
    for (const expected of lock.generatedEntries) {
      invariant(actualByPath.get(expected.path)?.mode === expected.mode, `SCAFFOLD-MODE-001: generated path mode drifted: ${expected.path}`)
    }
    validateGeneratedPackageLock({ root, lock, releaseBom })
  }
  return { lock, entries: actual, treeSha256: scaffoldTreeSha256(actual) }
}

export const PRODUCT_TEMPLATE_SCAFFOLD_LOCK_JSON_SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://qijenchen.dev/schemas/product-template-scaffold-lock-v1.schema.json',
  title: 'Qijenchen product-template scaffold lock v1',
  type: 'object',
  additionalProperties: false,
  required: LOCK_KEYS,
  properties: {
    schemaVersion: { const: PRODUCT_TEMPLATE_SCAFFOLD_LOCK_SCHEMA_VERSION },
    kind: { const: PRODUCT_TEMPLATE_SCAFFOLD_LOCK_KIND },
    releaseVersion: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+(?:-(?:beta|next|rc)\\.\\d+)?$' },
    staticTreeSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    publishedPathCount: { type: 'integer', minimum: 2 },
    entries: {
      type: 'array', minItems: 1,
      items: {
        type: 'object', additionalProperties: false, required: ENTRY_KEYS,
        properties: {
          path: { type: 'string', minLength: 1 }, mode: { enum: ['644', '755'] },
          size: { type: 'integer', minimum: 0 }, sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        },
      },
    },
    generatedEntries: {
      type: 'array', minItems: 1, maxItems: 1,
      items: {
        type: 'object', additionalProperties: false, required: GENERATED_ENTRY_KEYS,
        properties: { path: { const: 'package-lock.json' }, mode: { const: '644' }, generator: { type: 'string', minLength: 1 } },
      },
    },
  },
})

export function assertProductTemplateScaffoldLockSchemaMirror(path = fileURLToPath(new URL('./schemas/product-template-scaffold-lock.schema.json', import.meta.url))) {
  const mirror = JSON.parse(readFileSync(path, 'utf8'))
  invariant(canonicalJson(mirror) === canonicalJson(PRODUCT_TEMPLATE_SCAFFOLD_LOCK_JSON_SCHEMA), 'SCAFFOLD-SCHEMA-001: scaffold lock JSON Schema mirror drifted from executable contract')
  return true
}

function parseArgs(argv) {
  const flags = new Set(['--verify', '--allow-git-metadata'])
  const values = new Set(['--root', '--output', '--lock', '--version', '--phase', '--bom'])
  const parsed = { flags: new Set() }
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index]
    if (flags.has(name)) { parsed.flags.add(name); continue }
    invariant(values.has(name), `unknown option: ${name}`)
    const value = argv[index + 1]
    invariant(value && !value.startsWith('--'), `${name} requires a value`)
    parsed[name] = value
    index += 1
  }
  invariant(parsed['--root'], '--root is required')
  return parsed
}

function main() {
  assertProductTemplateScaffoldLockSchemaMirror()
  const args = parseArgs(process.argv.slice(2))
  if (args.flags.has('--verify')) {
    invariant(args['--lock'], '--lock is required with --verify')
    const lock = JSON.parse(readFileSync(resolve(args['--lock']), 'utf8'))
    const releaseBom = args['--bom'] ? JSON.parse(readFileSync(resolve(args['--bom']), 'utf8')) : null
    const result = verifyProductTemplateScaffold({
      root: args['--root'], lock, phase: args['--phase'] ?? 'source', releaseBom,
      allowRootGitMetadata: args.flags.has('--allow-git-metadata'),
    })
    console.log(`✅ product-template scaffold verified (${args['--phase'] ?? 'source'}): ${result.entries.length} paths sha256:${result.treeSha256}`)
    return
  }
  invariant(args['--output'] && args['--version'], '--output and --version are required when generating')
  const output = resolve(args['--output'])
  const lock = buildProductTemplateScaffoldLock({ root: args['--root'], releaseVersion: args['--version'] })
  writeFileSync(output, canonicalJson(lock), { flag: 'wx' })
  console.log(`✅ product-template scaffold lock built: ${output} (${lock.publishedPathCount} published paths)`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(error.message); process.exit(1) }
}
