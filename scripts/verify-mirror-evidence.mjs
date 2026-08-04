#!/usr/bin/env node

// Mirror-tree inventory validation against the protected-base allowlist policy.
// The signed evidence-envelope layer (receipt + activation-boundary proof) was
// retired 2026-08-04 with the activation cluster: it had no live producer or
// consumer — the mirror workflow consumes only validateMirrorRoot.
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import {
  MIRROR_PROVIDER_POLICY,
  deriveManagedSurfaceMirrorPolicy,
  loadVerifiedForkSurfaceAuthority,
} from './lib/published-template-provider-surfaces.mjs'

const POLICY_V1_KEYS = ['schemaVersion', 'exactPaths', 'generatedExactPaths', 'pathPrefixes']
const POLICY_V2_KEYS = [...POLICY_V1_KEYS, 'providerSurfaceAuthority']
const PROVIDER_AUTHORITY_KEYS = ['derivationPolicy', 'lockPath', 'manifestPath']
const invariant = (condition, message) => { if (!condition) throw new Error(message) }
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const comparePathBytes = (left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))

function normalizePath(path, { prefix = false } = {}) {
  invariant(typeof path === 'string' && path && !isAbsolute(path) && !path.includes('\\') && !/[\0\r\n]/.test(path), `MIRROR-PATH-001: unsafe path ${JSON.stringify(path)}`)
  const body = prefix && path.endsWith('/') ? path.slice(0, -1) : path
  invariant(body && body.split('/').every(part => part && part !== '.' && part !== '..') && `${body}${prefix ? '/' : ''}` === path, `MIRROR-PATH-001: non-canonical path ${path}`)
  invariant(body !== '.git' && !body.startsWith('.git/'), `MIRROR-PATH-001: git metadata is forbidden: ${path}`)
  return path
}

function inventory(root, { allowRootGitMetadata = false } = {}) {
  const files = []
  const visit = directory => {
    for (const name of readdirSync(directory).sort(comparePathBytes)) {
      if (allowRootGitMetadata && directory === root && name === '.git') continue
      const absolute = join(directory, name)
      const stat = lstatSync(absolute)
      const path = normalizePath(relative(root, absolute).replaceAll('\\', '/'))
      invariant(!stat.isSymbolicLink(), `MIRROR-PATH-002: mirror contains symlink ${path}`)
      if (stat.isDirectory()) visit(absolute)
      else {
        invariant(stat.isFile(), `MIRROR-PATH-002: mirror contains special file ${path}`)
        files.push({ path, mode: (stat.mode & 0o777).toString(8), sha256: sha256(readFileSync(absolute)) })
      }
    }
  }
  visit(root)
  return files.sort((left, right) => comparePathBytes(left.path, right.path))
}

export function resolvePublishedTemplateMirrorPolicy({ policy, authorityRoot = null }) {
  const expectedKeys = policy?.schemaVersion === 2 ? POLICY_V2_KEYS : POLICY_V1_KEYS
  invariant(exactKeys(policy, expectedKeys) && [1, 2].includes(policy.schemaVersion), 'MIRROR-POLICY-001: protected-base mirror policy has an open or invalid shape')
  invariant(Array.isArray(policy.exactPaths) && Array.isArray(policy.generatedExactPaths) && Array.isArray(policy.pathPrefixes), 'MIRROR-POLICY-001: mirror policy arrays are missing')
  const exactPaths = policy.exactPaths.map(path => normalizePath(path))
  const generatedExactPaths = policy.generatedExactPaths.map(path => normalizePath(path))
  const pathPrefixes = policy.pathPrefixes.map(path => normalizePath(path, { prefix: true }))
  const requiredPathPrefixes = []
  if (policy.schemaVersion === 2) {
    invariant(exactKeys(policy.providerSurfaceAuthority, PROVIDER_AUTHORITY_KEYS), 'MIRROR-POLICY-001: provider surface authority has an open or invalid shape')
    invariant(policy.providerSurfaceAuthority.derivationPolicy === MIRROR_PROVIDER_POLICY, 'MIRROR-POLICY-001: provider surface derivation policy is unsupported')
    invariant(authorityRoot, 'MIRROR-POLICY-001: provider surface policy requires its protected authority root')
    const authority = loadVerifiedForkSurfaceAuthority({ authorityRoot, ...policy.providerSurfaceAuthority })
    const derived = deriveManagedSurfaceMirrorPolicy(authority)
    exactPaths.push(...derived.exactPaths)
    pathPrefixes.push(...derived.pathPrefixes)
    requiredPathPrefixes.push(...derived.requiredPathPrefixes)
  }
  const exact = new Set(exactPaths)
  const generated = new Set(generatedExactPaths)
  invariant(exact.size === exactPaths.length && generated.size === generatedExactPaths.length && new Set(pathPrefixes).size === pathPrefixes.length, 'MIRROR-POLICY-001: mirror policy paths are duplicated across static and provider-derived authority')
  invariant([...exact].every(path => !generated.has(path)), 'MIRROR-POLICY-001: a mirror path cannot be both static/provider-managed and post-release generated')
  for (const path of [...exact, ...generated]) invariant(!pathPrefixes.some(prefix => path.startsWith(prefix)), `MIRROR-POLICY-001: exact mirror path overlaps a tree policy:${path}`)
  for (let left = 0; left < pathPrefixes.length; left += 1) for (let right = left + 1; right < pathPrefixes.length; right += 1) {
    invariant(!pathPrefixes[right].startsWith(pathPrefixes[left]) && !pathPrefixes[left].startsWith(pathPrefixes[right]), `MIRROR-POLICY-001: mirror tree policies overlap:${pathPrefixes[left]}:${pathPrefixes[right]}`)
  }
  return { exact, generated, prefixes: pathPrefixes, requiredPathPrefixes }
}

export function validateMirrorInventory({ files, policy, requireGenerated = true, authorityRoot = null }) {
  const { exact, generated, prefixes, requiredPathPrefixes } = resolvePublishedTemplateMirrorPolicy({ policy, authorityRoot })
  const seen = new Set()
  for (const item of files) {
    const path = normalizePath(item.path)
    invariant(!seen.has(path), `MIRROR-PATH-003: duplicate mirror path ${path}`)
    seen.add(path)
    invariant(exact.has(path) || generated.has(path) || prefixes.some(prefix => path.startsWith(prefix)), `MIRROR-PATH-004: mirror path is outside protected-base allowlist: ${path}`)
  }
  for (const path of exact) invariant(seen.has(path), `MIRROR-PATH-005: required mirror path is missing: ${path}`)
  if (requireGenerated) for (const path of generated) invariant(seen.has(path), `MIRROR-PATH-005: required generated mirror path is missing: ${path}`)
  for (const prefix of requiredPathPrefixes) invariant([...seen].some(path => path.startsWith(prefix)), `MIRROR-PATH-005: required provider mirror tree is missing or empty: ${prefix}`)
  return true
}

export function validateMirrorRoot({ mirrorRoot, policy, requireGenerated = true, allowRootGitMetadata = false, authorityRoot = null }) {
  const requestedRoot = resolve(mirrorRoot)
  const requestedStat = lstatSync(requestedRoot)
  invariant(requestedStat.isDirectory() && !requestedStat.isSymbolicLink(), 'MIRROR-PATH-002: mirror root must be a real directory')
  const files = inventory(realpathSync(requestedRoot), { allowRootGitMetadata })
  validateMirrorInventory({ files, policy, requireGenerated, authorityRoot })
  return files
}

