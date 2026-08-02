#!/usr/bin/env node
// Dim 14 mechanical repository-hygiene core. Canonical rationale and exemptions live in
// packages/design-system/ds-canonical/references/repository-hygiene{,-policy.json}.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readlinkSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const POLICY_PATH = resolve(SCRIPT_DIR, '../packages/design-system/ds-canonical/references/repository-hygiene-policy.json')

function usage(message) {
  if (message) console.error(`repository hygiene:${message}`)
  console.error('usage: node scripts/repository-hygiene-invariant.mjs [--check] [--root <repo>] [--profile <authority|product-consumer>] [--json]')
  process.exit(2)
}

function parseArgs(argv) {
  let root = process.cwd()
  let profile = 'authority'
  let json = false
  const seen = new Set()
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--check') {
      if (seen.has('check')) usage('duplicate --check')
      seen.add('check')
    } else if (argument === '--json') {
      if (seen.has('json')) usage('duplicate --json')
      seen.add('json')
      json = true
    } else if (argument === '--root' || argument === '--profile') {
      const key = argument.slice(2)
      if (seen.has(key) || !argv[index + 1] || argv[index + 1].startsWith('--')) usage(`invalid ${argument}`)
      seen.add(key)
      if (key === 'root') root = argv[index + 1]
      else profile = argv[index + 1]
      index += 1
    } else if (argument.startsWith('--root=') || argument.startsWith('--profile=')) {
      const [flag, value] = argument.split('=', 2)
      const key = flag.slice(2)
      if (seen.has(key) || !value) usage(`invalid ${flag}`)
      seen.add(key)
      if (key === 'root') root = value
      else profile = value
    } else usage(`unknown argument ${argument}`)
  }
  return { root: resolve(root), profile, json }
}

function gitInventory(root) {
  let output
  try {
    output = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30_000,
    })
  } catch (error) {
    throw new Error(`cannot enumerate Git inventory:${error.message}`)
  }
  return [...new Set(output.toString('utf8').split('\0').filter(Boolean))].sort()
}

function startsWithAny(path, prefixes) {
  return prefixes.some((prefix) => path.startsWith(prefix))
}

function normalizedPathSet(paths) {
  return [...paths].sort().join('\0')
}

function isTransientName(path) {
  const name = basename(path)
  if (/^(?:\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(name)) return true
  if (/^(?:\.tmp|tmp|temp|debug|scratch|untitled|screenshot|screen-shot)(?:[._-]|$)/i.test(name)) return true
  if (/(?:\.bak|\.orig|\.rej|\.sw[op]|~)$/i.test(name)) return true
  const segments = path.split('/')
  return segments.some((segment) => /^(?:tmp|temp|scratch|debug)$/i.test(segment))
}

function excludedFromDuplicateScan(path, policy, futureReservedPrefixes = []) {
  if (startsWithAny(path, policy.duplicateExcludedPrefixes)) return true
  if (startsWithAny(path, futureReservedPrefixes)) return true
  const segments = path.split('/')
  return segments.some((segment) => policy.duplicateExcludedSegments.includes(segment))
}

function isRepositoryRelativePath(path, { requireTrailingSlash = false } = {}) {
  if (typeof path !== 'string' || !path.trim() || path !== path.trim() || path.startsWith('/')) return false
  if (path.includes('\\') || (requireTrailingSlash && !path.endsWith('/'))) return false
  const normalized = requireTrailingSlash ? path.slice(0, -1) : path
  return !normalized.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
}

function concreteFutureText(value) {
  return typeof value === 'string'
    && value.trim() === value
    && value.length >= 40
    && !/(?:\bTBD\b|\bTODO\b|maybe useful|future use|someday|可能有用|以後再說|未定)/i.test(value)
}

export function validateFutureReservedEntries({ profileName, profile, inventoryPaths, now = new Date() }) {
  if (!Array.isArray(profile.futureReservedEntries)) {
    throw new Error(`malformed future-reserved entries in profile:${profileName}`)
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('invalid future-reserved validation clock')

  const seenPrefixes = new Set()
  for (const [index, entry] of profile.futureReservedEntries.entries()) {
    const label = `${profileName}/futureReservedEntries[${index}]`
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${label}:entry must be an object`)
    const keys = Object.keys(entry).sort()
    const required = ['activationCondition', 'lifecycle', 'owner', 'pathPrefix', 'purpose'].sort()
    if (keys.length !== required.length || keys.some((key, keyIndex) => key !== required[keyIndex])) {
      throw new Error(`${label}:exact fields required:pathPrefix,owner,purpose,activationCondition,lifecycle`)
    }
    if (!isRepositoryRelativePath(entry.pathPrefix, { requireTrailingSlash: true }) || seenPrefixes.has(entry.pathPrefix)) {
      throw new Error(`${label}:pathPrefix must be a unique repository-relative directory prefix`)
    }
    if ([...seenPrefixes].some((prefix) => prefix.startsWith(entry.pathPrefix) || entry.pathPrefix.startsWith(prefix))) {
      throw new Error(`${label}:future-reserved prefixes must not overlap`)
    }
    seenPrefixes.add(entry.pathPrefix)
    const topLevel = entry.pathPrefix.split('/')[0]
    if (typeof profile.topLevelPurposes?.[topLevel] !== 'string') {
      throw new Error(`${label}:pathPrefix top-level home is undeclared:${topLevel}`)
    }
    if (entry.pathPrefix.split('/').filter(Boolean).length === 1
      && !/future[- ]reserved/i.test(profile.topLevelPurposes[topLevel])) {
      throw new Error(`${label}:whole-home exemption requires an explicitly future-reserved top-level purpose`)
    }
    if (!isRepositoryRelativePath(entry.owner) || !inventoryPaths.includes(entry.owner)) {
      throw new Error(`${label}:owner must be a present repository-relative canonical file:${String(entry.owner)}`)
    }
    if (entry.owner.startsWith(entry.pathPrefix)) throw new Error(`${label}:owner cannot be inside its own future-reserved prefix`)
    if (!concreteFutureText(entry.purpose)) throw new Error(`${label}:purpose is missing or non-concrete`)
    if (!concreteFutureText(entry.activationCondition) || !entry.activationCondition.includes(entry.owner)) {
      throw new Error(`${label}:activationCondition must be concrete and name its owner`)
    }
    const lifecycle = entry.lifecycle
    const lifecycleKeys = lifecycle && typeof lifecycle === 'object' && !Array.isArray(lifecycle)
      ? Object.keys(lifecycle).sort()
      : []
    if (lifecycleKeys.join('\0') !== ['date', 'mode', 'onLapse'].sort().join('\0')
      || !['review-by', 'expire-on'].includes(lifecycle.mode)
      || !/^\d{4}-\d{2}-\d{2}$/.test(lifecycle.date ?? '')
      || lifecycle.onLapse !== 'reclassify-or-remove') {
      throw new Error(`${label}:lifecycle requires mode(review-by|expire-on), ISO date, and reclassify-or-remove`)
    }
    const lifecycleAt = Date.parse(`${lifecycle.date}T00:00:00Z`)
    if (!Number.isFinite(lifecycleAt) || lifecycleAt <= now.getTime()) {
      throw new Error(`${label}:future-reserved lifecycle lapsed:${lifecycle.date}`)
    }
    if (!inventoryPaths.some((path) => path.startsWith(entry.pathPrefix))) {
      throw new Error(`${label}:declared future-reserved prefix has no repository content`)
    }
  }

  for (const [topLevel, purpose] of Object.entries(profile.topLevelPurposes ?? {})) {
    if (!/future[- ]reserved/i.test(purpose)) continue
    if (!profile.futureReservedEntries.some((entry) => entry.pathPrefix.split('/')[0] === topLevel)) {
      throw new Error(`${profileName}/${topLevel}:future-reserved purpose lacks the four-field declaration`)
    }
  }
  return profile.futureReservedEntries.map((entry) => entry.pathPrefix)
}

export function auditRepositoryHygiene({ root, profileName, policy }) {
  if (policy?.schemaVersion !== 2
    || policy.authority !== 'packages/design-system/ds-canonical/references/repository-hygiene.md'
    || !Array.isArray(policy.transientExemptPrefixes)
    || !Array.isArray(policy.duplicateExcludedPrefixes)
    || !Array.isArray(policy.duplicateExcludedSegments)) {
    throw new Error('malformed repository-hygiene policy identity')
  }
  const profile = policy.profiles?.[profileName]
  if (!profile) throw new Error(`unknown profile:${profileName}`)
  if (!profile.topLevelPurposes || !profile.declaredSymlinks || !Array.isArray(profile.duplicateExemptGroups)) {
    throw new Error(`malformed profile:${profileName}`)
  }

  const violations = []
  const paths = gitInventory(root)
  const present = []
  const topLevels = new Set()
  const symlinks = new Map()
  const duplicateCandidates = []

  for (const rel of paths) {
    let info
    try { info = lstatSync(join(root, rel)) }
    catch (error) {
      if (error?.code === 'ENOENT') continue // an intentional tracked deletion is absent from this worktree snapshot
      throw error
    }
    present.push(rel)
    topLevels.add(rel.split('/')[0])
    if (!startsWithAny(rel, policy.transientExemptPrefixes) && isTransientName(rel)) {
      violations.push({ rule: 'R1', path: rel, message: 'transient/editor/OS artifact is repository content' })
    }
    if (info.isSymbolicLink()) {
      symlinks.set(rel, readlinkSync(join(root, rel)))
      continue
    }
    if (info.isFile() && info.size > 0) duplicateCandidates.push(rel)
  }

  const futureReservedPrefixes = validateFutureReservedEntries({ profileName, profile, inventoryPaths: present })
  const duplicateScanPaths = duplicateCandidates.filter((rel) => !excludedFromDuplicateScan(rel, policy, futureReservedPrefixes))

  for (const topLevel of [...topLevels].sort()) {
    const purpose = profile.topLevelPurposes[topLevel]
    if (typeof purpose !== 'string' || !purpose.trim()) {
      violations.push({ rule: 'R2', path: topLevel, message: `top-level home has no declared purpose in profile ${profileName}` })
    }
  }

  const declaredSymlinks = new Map(Object.entries(profile.declaredSymlinks))
  for (const [path, target] of symlinks) {
    if (!declaredSymlinks.has(path)) {
      violations.push({ rule: 'R3', path, message: `undeclared repository symlink -> ${target}` })
    } else if (declaredSymlinks.get(path) !== target) {
      violations.push({ rule: 'R3', path, message: `symlink target drift:${target} (expected ${declaredSymlinks.get(path)})` })
    }
  }
  for (const [path] of declaredSymlinks) {
    if (!present.includes(path)) {
      violations.push({ rule: 'R3', path, message: 'declared repository symlink is missing' })
    } else if (!symlinks.has(path)) {
      violations.push({ rule: 'R3', path, message: 'declared symlink exists but is not a symlink' })
    }
  }
  for (const [path, target] of symlinks) {
    if (!declaredSymlinks.has(path) || declaredSymlinks.get(path) !== target) continue
    const resolvedTarget = resolve(dirname(join(root, path)), target)
    try {
      // Follow the target chain: lstat alone would accept a target that is itself a broken symlink.
      statSync(resolvedTarget)
    } catch (error) {
      if (error?.code === 'ENOENT') {
        violations.push({ rule: 'R3', path, message: `declared symlink target is missing:${target}` })
      } else throw error
    }
  }

  const byHash = new Map()
  for (const rel of duplicateScanPaths) {
    const digest = createHash('sha256').update(readFileSync(join(root, rel))).digest('hex')
    const group = byHash.get(digest) ?? []
    group.push(rel)
    byHash.set(digest, group)
  }
  const exemptGroups = new Map(profile.duplicateExemptGroups.map((entry) => {
    if (!Array.isArray(entry.paths) || entry.paths.length < 2 || typeof entry.reason !== 'string' || !entry.reason.trim()) {
      throw new Error(`malformed duplicate exemption in profile:${profileName}`)
    }
    return [normalizedPathSet(entry.paths), entry.reason]
  }))
  let duplicateGroups = 0
  let exemptDuplicateGroups = 0
  for (const group of [...byHash.values()].filter((entry) => entry.length > 1)) {
    duplicateGroups += 1
    const key = normalizedPathSet(group)
    if (exemptGroups.has(key)) {
      exemptDuplicateGroups += 1
      continue
    }
    violations.push({ rule: 'R4', path: group.join(' | '), message: 'undeclared exact-content duplicate group' })
  }

  return Object.freeze({
    ok: violations.length === 0,
    profile: profileName,
    root,
    inventoryPaths: present.length,
    topLevelHomes: topLevels.size,
    symlinks: symlinks.size,
    duplicateCandidates: duplicateScanPaths.length,
    futureReservedPrefixes: futureReservedPrefixes.length,
    duplicateGroups,
    exemptDuplicateGroups,
    violations,
  })
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  let policy
  try { policy = JSON.parse(readFileSync(POLICY_PATH, 'utf8')) }
  catch (error) {
    console.error(`❌ repository-hygiene-invariant FAIL:cannot read policy:${error.message}`)
    return 1
  }

  let result
  try { result = auditRepositoryHygiene({ root: args.root, profileName: args.profile, policy }) }
  catch (error) {
    console.error(`❌ repository-hygiene-invariant FAIL:${error.message}`)
    return 1
  }

  if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else if (result.ok) {
    console.log(`✅ repository-hygiene-invariant PASS(profile=${result.profile};paths=${result.inventoryPaths};homes=${result.topLevelHomes};symlinks=${result.symlinks};future-reserved=${result.futureReservedPrefixes};duplicate-groups=${result.duplicateGroups},declared=${result.exemptDuplicateGroups})`)
  } else {
    console.error(`❌ repository-hygiene-invariant FAIL(${result.violations.length};profile=${result.profile}):`)
    for (const violation of result.violations) console.error(`   - ${violation.rule} ${violation.path}: ${violation.message}`)
  }
  return result.ok ? 0 : 1
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) process.exit(main())
