#!/usr/bin/env node
// Base-trusted preflight for pull_request_target. The candidate tree is data:
// no candidate script or dependency is executed here.

import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validateUpgradeTrustPolicy,
  verifyUpgradeProvenance,
} from './verify-upgrade-provenance.mjs'
import { assertNoRootNpmShrinkwrap } from './lib/governance-dependency-bootstrap.mjs'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const EXACT = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/
const PACKAGES = ['@qijenchen/design-system', '@qijenchen/storybook-config']
const PRODUCT_WORKSPACES = ['apps/*']
const PRODUCT_WORKSPACE_LINK = /^node_modules\/@product\/[A-Za-z0-9._-]+$/
const PRODUCT_WORKSPACE_PATH = /^apps\/[A-Za-z0-9._-]+$/
const REGISTRY_ORIGIN = 'https://registry.npmjs.org'
const REGISTRY_RESPONSE_MAX_BYTES = 1024 * 1024
const REGISTRY_USER_AGENT = 'qijenchen-governance-anchor-preflight/1'

function parseVersion(value) {
  const match = String(value || '').match(EXACT)
  if (!match) throw new Error(`exact semver required; got ${JSON.stringify(value)}`)
  return { core: match.slice(1, 4).map(Number), pre: match[4]?.split('.') ?? null }
}

function compareVersion(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  for (let i = 0; i < 3; i += 1) if (left.core[i] !== right.core[i]) return left.core[i] - right.core[i]
  if (left.pre === null || right.pre === null) return left.pre === right.pre ? 0 : left.pre === null ? 1 : -1
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i += 1) {
    if (left.pre[i] === undefined || right.pre[i] === undefined) return left.pre[i] === undefined ? -1 : 1
    if (left.pre[i] === right.pre[i]) continue
    const an = /^\d+$/.test(left.pre[i])
    const bn = /^\d+$/.test(right.pre[i])
    if (an && bn) return Number(left.pre[i]) - Number(right.pre[i])
    if (an !== bn) return an ? -1 : 1
    return compareUtf8Bytes(left.pre[i], right.pre[i])
  }
  return 0
}

function readJson(path, label) {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch (error) { throw new Error(`${label} is missing or invalid: ${error.message}`) }
}

function canonicalTarball(name, version) {
  return `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`
}

function inspectCandidateSource(root, { allowInstalledDependencies = false } = {}) {
  const rootStat = lstatSync(root)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('candidate root must be a real directory')
  const digest = createHash('sha256')
  const visit = (directory) => {
    for (const entry of readdirSync(directory).sort()) {
      const path = join(directory, entry)
      const rel = relative(root, path).replaceAll('\\', '/')
      const stat = lstatSync(path)
      if (rel === '.git') {
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('candidate .git must be a real directory')
        continue
      }
      if (entry === 'node_modules') {
        if (!allowInstalledDependencies) throw new Error(`candidate preinstall dependency tree forbidden: ${rel}`)
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`installed dependency root must be a real directory: ${rel}`)
        if (rel !== 'node_modules' && !/^apps\/[A-Za-z0-9._-]+\/node_modules$/.test(rel)) {
          throw new Error(`installed dependency tree is outside canonical npm roots: ${rel}`)
        }
        continue
      }
      if (stat.isSymbolicLink()) throw new Error(`candidate symlink forbidden: ${rel}`)
      if (stat.isDirectory()) {
        digest.update(`directory\0${rel}\0${stat.mode & 0o777}\0`)
        visit(path)
      } else if (stat.isFile()) {
        digest.update(`file\0${rel}\0${stat.mode & 0o777}\0`)
        digest.update(readFileSync(path))
        digest.update('\0')
      } else {
        throw new Error(`candidate special filesystem entry forbidden: ${rel}`)
      }
    }
  }
  visit(root)
  return digest.digest('hex')
}

function packageSetDigest(packages) {
  return createHash('sha256').update(JSON.stringify(packages)).digest('hex')
}

function validateInstalledWorkspaceLinks(candidate, lock) {
  const dependencyRoot = join(candidate, 'node_modules')
  const expected = new Map(Object.entries(lock.packages)
    .filter(([, entry]) => entry?.link === true)
    .map(([path, entry]) => [path, entry.resolved]))
  const observed = new Map()
  const inspectLink = (absolute, rel) => {
    const stat = lstatSync(absolute)
    if (!stat.isSymbolicLink()) return
    observed.set(rel, resolve(join(absolute, '..'), readlinkSync(absolute)))
  }
  for (const name of readdirSync(dependencyRoot).sort()) {
    const absolute = join(dependencyRoot, name)
    const stat = lstatSync(absolute)
    const rel = `node_modules/${name}`
    if (stat.isSymbolicLink()) inspectLink(absolute, rel)
    else if (stat.isDirectory() && name.startsWith('@')) {
      for (const child of readdirSync(absolute).sort()) inspectLink(join(absolute, child), `${rel}/${child}`)
    }
  }
  for (const [path, target] of observed) {
    if (!expected.has(path)) throw new Error(`installed tree contains an unexpected workspace symlink: ${path}`)
    if (target !== resolve(candidate, expected.get(path))) throw new Error(`installed workspace symlink target differs from the exact lock: ${path}`)
  }
  for (const [path, target] of expected) {
    const absolute = join(candidate, path)
    if (!observed.has(path) || !lstatSync(absolute).isSymbolicLink() || observed.get(path) !== resolve(candidate, target)) {
      throw new Error(`installed tree is missing the exact locked workspace symlink: ${path}`)
    }
  }
}

export function createPreinstallEvidence(locked, candidateRoot) {
  return {
    schemaVersion: 1,
    candidateRoot: resolve(candidateRoot),
    sourceDigest: locked.sourceDigest,
    designSystem: locked.designSystem,
    lockEntries: locked.files,
    packageSetDigest: packageSetDigest(locked.packages),
  }
}

function validatePreinstallEvidence(evidence, candidateRoot) {
  const expectedKeys = ['candidateRoot', 'designSystem', 'lockEntries', 'packageSetDigest', 'schemaVersion', 'sourceDigest']
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)
    || JSON.stringify(Object.keys(evidence).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error('preinstall evidence has an open or incomplete shape')
  }
  if (evidence.schemaVersion !== 1 || evidence.candidateRoot !== resolve(candidateRoot)) throw new Error('preinstall evidence candidate/schema binding mismatch')
  if (!/^[0-9a-f]{64}$/.test(evidence.sourceDigest || '') || !/^[0-9a-f]{64}$/.test(evidence.packageSetDigest || '')) {
    throw new Error('preinstall evidence digest is invalid')
  }
  if (!Number.isSafeInteger(evidence.lockEntries) || evidence.lockEntries < 1) throw new Error('preinstall evidence lock cardinality is invalid')
  parseVersion(evidence.designSystem)
  return evidence
}

function canonicalRegistryMetadataUrl(name, version) {
  if (!PACKAGES.includes(name)) throw new Error(`registry package is outside the closed governance set: ${name}`)
  parseVersion(version)
  return `${REGISTRY_ORIGIN}/${name.replace('/', '%2F')}/${encodeURIComponent(version)}`
}

export async function liveRegistry(name, version, {
  fetchImpl = globalThis.fetch,
  signal = AbortSignal.timeout(30_000),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('native HTTPS registry transport is unavailable')
  const expectedUrl = canonicalRegistryMetadataUrl(name, version)
  const response = await fetchImpl(expectedUrl, {
    method: 'GET',
    redirect: 'error',
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: {
      Accept: 'application/json',
      'User-Agent': REGISTRY_USER_AGENT,
    },
    signal,
  })
  if (!response || response.status !== 200) {
    throw new Error(`registry metadata response status is not exactly 200: ${String(response?.status)}`)
  }
  if (response.url !== expectedUrl) throw new Error('registry metadata response URL differs from the exact request')

  const contentType = response.headers?.get?.('content-type') || ''
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
    throw new Error(`registry metadata content type is not exact JSON: ${contentType}`)
  }
  const declaredLength = response.headers?.get?.('content-length')
  if (declaredLength !== null && declaredLength !== undefined) {
    if (!/^(?:0|[1-9]\d*)$/.test(declaredLength)) throw new Error('registry metadata content length is invalid')
    const length = Number(declaredLength)
    if (!Number.isSafeInteger(length) || length > REGISTRY_RESPONSE_MAX_BYTES) {
      throw new Error('registry metadata response exceeds the closed byte limit')
    }
  }
  if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') {
    throw new Error('registry metadata response body is not a bounded byte stream')
  }

  const chunks = []
  let total = 0
  for await (const chunk of response.body) {
    if (!(chunk instanceof Uint8Array)) throw new Error('registry metadata response emitted a non-byte chunk')
    total += chunk.byteLength
    if (total > REGISTRY_RESPONSE_MAX_BYTES) throw new Error('registry metadata response exceeds the closed byte limit')
    chunks.push(Buffer.from(chunk))
  }
  if (declaredLength !== null && declaredLength !== undefined && total !== Number(declaredLength)) {
    throw new Error('registry metadata response length differs from the declared byte count')
  }
  if (total === 0) throw new Error('registry metadata response body is empty')

  let raw
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total))
  } catch (error) {
    throw new Error(`registry metadata response is not valid UTF-8: ${error.message}`)
  }
  let body
  try {
    body = JSON.parse(raw)
  } catch (error) {
    throw new Error(`registry metadata response is not valid JSON: ${error.message}`)
  }
  const expectedTarball = canonicalTarball(name, version)
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || body.name !== name || body.version !== version
    || !body.dist || typeof body.dist !== 'object' || Array.isArray(body.dist)
    || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(body.dist.integrity || '')
    || body.dist.tarball !== expectedTarball) {
    throw new Error('registry metadata identity or exact artifact binding is invalid')
  }
  return Object.freeze({
    integrity: body.dist.integrity,
    tarball: body.dist.tarball,
  })
}

export async function verifyCandidateLock({
  trustedRoot,
  candidateRoot,
  registryLookup = liveRegistry,
  allowInstalledDependencies = false,
  expectedSourceDigest = null,
}) {
  const trusted = resolve(trustedRoot)
  const candidate = resolve(candidateRoot)
  assertNoRootNpmShrinkwrap(candidate, { errorPrefix: 'GOV-ANCHOR-PREFLIGHT-LOCK-001' })
  const sourceDigest = inspectCandidateSource(candidate, { allowInstalledDependencies })
  if (expectedSourceDigest && sourceDigest !== expectedSourceDigest) throw new Error('candidate source changed after the preinstall trust check')

  const trustedBom = readJson(join(trusted, 'governance/lock.json'), 'trusted governance lock')
  const candidateBom = readJson(join(candidate, 'governance/lock.json'), 'candidate governance lock')
  validateUpgradeTrustPolicy(trustedBom.upgradeTrust)
  validateUpgradeTrustPolicy(candidateBom.upgradeTrust)
  if (JSON.stringify(candidateBom.upgradeTrust) !== JSON.stringify(trustedBom.upgradeTrust)) {
    throw new Error('candidate upgrade trust policy differs from the protected base')
  }
  const pkg = readJson(join(candidate, 'package.json'), 'candidate package.json')
  const lock = readJson(join(candidate, 'package-lock.json'), 'candidate package-lock.json')
  if (JSON.stringify(pkg.workspaces) !== JSON.stringify(PRODUCT_WORKSPACES)) {
    throw new Error(`candidate workspaces must equal the protected product roots: ${PRODUCT_WORKSPACES.join(', ')}`)
  }
  if (lock.lockfileVersion !== 3 || !lock.packages || typeof lock.packages !== 'object') throw new Error('candidate requires closed npm lockfileVersion 3')

  const rootLock = lock.packages[''] || {}
  if (JSON.stringify(rootLock.workspaces) !== JSON.stringify(PRODUCT_WORKSPACES)) {
    throw new Error(`candidate root lock workspaces must equal the protected product roots: ${PRODUCT_WORKSPACES.join(', ')}`)
  }
  for (const name of PACKAGES) {
    const declared = pkg.dependencies?.[name]
    parseVersion(declared)
    const key = name === PACKAGES[0] ? 'designSystem' : 'storybookConfig'
    const trustedVersion = trustedBom.release?.[key]
    if (compareVersion(declared, trustedVersion) < 0) throw new Error(`${name} downgrade ${declared} < trusted base ${trustedVersion}`)
    if (candidateBom.release?.[key] !== declared) throw new Error(`${name} does not match candidate governance lock`)
    if (rootLock.dependencies?.[name] !== declared) throw new Error(`${name} root lock declaration is not exact`)

    const entry = lock.packages[`node_modules/${name}`]
    const expectedTarball = canonicalTarball(name, declared)
    if (entry?.version !== declared || entry?.resolved !== expectedTarball || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry?.integrity || '')) {
      throw new Error(`${name} lock entry is not the canonical exact npm artifact`)
    }
    const registry = await registryLookup(name, declared)
    if (registry.tarball !== expectedTarball || registry.integrity !== entry.integrity) throw new Error(`${name} lock does not match live npm registry metadata`)
  }
  if (pkg.dependencies[PACKAGES[0]] !== pkg.dependencies[PACKAGES[1]]) throw new Error('DS and Storybook governance releases must move in lockstep')

  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!entry || path === '') continue
    if (entry.link === true) {
      if (!PRODUCT_WORKSPACE_LINK.test(path) || !PRODUCT_WORKSPACE_PATH.test(entry.resolved || '')) throw new Error(`unsafe or non-product workspace link in lock: ${path}`)
      const workspace = readJson(join(candidate, entry.resolved, 'package.json'), `workspace manifest for ${entry.resolved}`)
      if (workspace.private !== true || workspace.name !== path.slice('node_modules/'.length)) throw new Error(`workspace link identity is not private and exact: ${path}`)
      continue
    }
    if (entry.resolved && !String(entry.resolved).startsWith('https://registry.npmjs.org/')) throw new Error(`non-canonical registry source in lock: ${path}`)
    if (entry.resolved && !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity || '')) throw new Error(`missing sha512 integrity in lock: ${path}`)
  }
  if (allowInstalledDependencies) validateInstalledWorkspaceLinks(candidate, lock)

  return {
    designSystem: pkg.dependencies[PACKAGES[0]],
    files: Object.keys(lock.packages).length,
    sourceDigest,
    policy: trustedBom.upgradeTrust,
    packages: PACKAGES.map((name) => ({
      name,
      version: pkg.dependencies[name],
      integrity: lock.packages[`node_modules/${name}`].integrity,
    })),
  }
}

export async function verifyCandidate({
  trustedRoot,
  candidateRoot,
  registryLookup = liveRegistry,
  auditReport,
  releaseLookup,
  // Provenance moved from the audit-signatures bundles to a live registry attestation readback
  // (522612a5); without forwarding that seam this gate reaches the public registry and no
  // injected fixture can exercise the negative cases.
  attestationLookup,
  preinstallEvidence = null,
}) {
  const evidence = preinstallEvidence ? validatePreinstallEvidence(preinstallEvidence, candidateRoot) : null
  const locked = await verifyCandidateLock({
    trustedRoot,
    candidateRoot,
    registryLookup,
    allowInstalledDependencies: Boolean(evidence),
    expectedSourceDigest: evidence?.sourceDigest || null,
  })
  if (evidence && (
    locked.designSystem !== evidence.designSystem
    || locked.files !== evidence.lockEntries
    || packageSetDigest(locked.packages) !== evidence.packageSetDigest
  )) throw new Error('candidate lock identity changed after the preinstall trust check')
  if (!auditReport) throw new Error('verified npm audit-signatures JSON with provenance bundles is required')
  const provenance = await verifyUpgradeProvenance({
    auditReport,
    packages: locked.packages,
    version: locked.designSystem,
    policy: locked.policy,
    ...(releaseLookup ? { releaseLookup } : {}),
    ...(attestationLookup ? { attestationLookup } : {}),
  })
  return { designSystem: locked.designSystem, files: locked.files, provenance }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const rawArgs = process.argv.slice(2)
  const valueOf = (name) => {
    const index = rawArgs.indexOf(name)
    return index >= 0 ? rawArgs[index + 1] : undefined
  }
  const args = {
    trusted: valueOf('--trusted'),
    candidate: valueOf('--candidate'),
    verifiedAttestations: valueOf('--verified-attestations'),
    evidenceOut: valueOf('--evidence-out'),
    preinstallEvidence: valueOf('--preinstall-evidence'),
    lockOnly: rawArgs.includes('--lock-only'),
  }
  if (!args.trusted || !args.candidate) {
    console.error('usage: governance-anchor-preflight.mjs --trusted <base> --candidate <head> [--lock-only --evidence-out <file> | --verified-attestations <npm-audit.json> --preinstall-evidence <file>]')
    process.exit(2)
  }
  try {
    if (args.lockOnly === Boolean(args.verifiedAttestations)
      || args.lockOnly !== Boolean(args.evidenceOut)
      || Boolean(args.verifiedAttestations) !== Boolean(args.preinstallEvidence)) {
      throw new Error('select lock-only with evidence-out, or verified-attestations with preinstall-evidence')
    }
    let result
    if (args.lockOnly) {
      result = await verifyCandidateLock({ trustedRoot: args.trusted, candidateRoot: args.candidate })
      writeFileSync(resolve(args.evidenceOut), `${JSON.stringify(createPreinstallEvidence(result, args.candidate), null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    } else {
      result = await verifyCandidate({
        trustedRoot: args.trusted,
        candidateRoot: args.candidate,
        auditReport: readJson(resolve(args.verifiedAttestations), 'verified npm attestation report'),
        preinstallEvidence: readJson(resolve(args.preinstallEvidence), 'preinstall trust evidence'),
      })
    }
    const identity = result.provenance
      ? `; ${result.provenance.repository}@${result.provenance.gitCommit} ${result.provenance.releaseAssetDigest}`
      : '; lock-only'
    console.log(`✅ base-trusted candidate preflight PASS (${result.designSystem}; ${result.files} lock entries${identity})`)
  } catch (error) {
    console.error(`❌ GOV-ANCHOR-PREFLIGHT: ${error.message}`)
    process.exit(1)
  }
}
