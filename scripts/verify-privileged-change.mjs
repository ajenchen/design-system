#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validateIssuerRegistry,
  validateIssuerRegistryLineage,
  validateRegistryPolicyBinding,
} from '../infra/governance/lib/issuer-registry.mjs'
import { validateAttestationPolicy } from '../infra/governance/lib/attestation.mjs'
import { validateRuntimeProfile } from '../infra/governance/lib/provider-runtime-conformance.mjs'
// Phase A of the activation-cluster retirement (2026-08-04, baton §8.1): this verifier no longer
// reads or validates the external-activation / release-tag-authorization ceremony policies. It
// runs from the PROTECTED BASE against candidate trees (governance-anchor pull_request_target), so
// retirement is two-phase to avoid a bootstrap deadlock: Phase A ships a verifier that tolerates
// both trust-root shapes while candidates still carry the ceremony files; only after this is the
// protected base may Phase B delete the files and the legacy keys.

const POLICY_KEYS = [
  '$schema', 'schemaVersion', 'repository', 'algorithm', 'maxAuthorizationTtlMinutes',
  'clockSkewSeconds', 'authorizationDirectory', 'issuerRegistryDigest', 'allowedKeyIds',
  'protectedPaths', 'protectedPrefixes', 'trustRootQuorum', 'bootstrap',
]
// Tolerated-but-ignored during Phase A; rejected again after Phase B removes them for good.
const RETIRED_ACTIVATION_POLICY_KEYS = [
  'externalActivationPolicyDigest', 'authorizationProfileId', 'authorizationProfileDigest',
]
const BOOTSTRAP_KEYS = ['schemaVersion', 'enabled', 'ownerLogins', 'nonce', 'maxCommentTtlMinutes']
const shaPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const REGISTRY_PATH = 'infra/governance/trust/issuers.json'
const POLICY_PATH = 'infra/governance/privileged-trust-roots.json'
const RELEASE_RINGS_PATH = 'infra/governance/release-rings.json'
const RUNTIME_PROFILE_PATH = 'infra/governance/providers/runtime-conformance.json'
const RELEASE_TAG_POLICY_PATH = 'infra/governance/release-tag-authorization-policy.json'
const SEMANTIC_MANIFEST_PATH = 'packages/governance/canonical/manifest.json'
const CONTROL_PLANE_GENESIS_COMMENT_MARKER = 'DS-GOVERNANCE-CONTROL-PLANE-GENESIS-V1 '

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
}

function sha256(value) { return Promise.resolve(createHash('sha256').update(value).digest('hex')) }

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
}

function safeRelative(root, path) {
  const canonicalRoot = resolve(root)
  const rootStat = lstatSync(canonicalRoot)
  invariant(rootStat.isDirectory() && !rootStat.isSymbolicLink(), `trust root must be a real directory: ${root}`)
  const absolute = resolve(canonicalRoot, path)
  const rel = relative(canonicalRoot, absolute)
  invariant(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `path escapes trust root: ${path}`)
  let cursor = canonicalRoot
  for (const part of rel.split(sep).filter(Boolean)) {
    cursor = join(cursor, part)
    try {
      invariant(!lstatSync(cursor).isSymbolicLink(), `path contains a symlink component: ${relative(canonicalRoot, cursor).replaceAll('\\', '/')}`)
    } catch (error) {
      if (error?.code === 'ENOENT') break
      throw error
    }
  }
  return { absolute, rel: rel.replaceAll('\\', '/') }
}

function readRegularJson(root, path, label) {
  const absolute = safeRelative(root, path).absolute
  const stat = lstatSync(absolute)
  invariant(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular non-symlink file`)
  return JSON.parse(readFileSync(absolute, 'utf8'))
}

function policyProtectsPath(policy, path, { directory = false } = {}) {
  if (!directory && policy.protectedPaths.includes(path)) return true
  return policy.protectedPrefixes.some(prefix => path === prefix.slice(0, -1) || path.startsWith(prefix))
}

function validateSemanticSourceClosure(root, policy) {
  invariant(policyProtectsPath(policy, SEMANTIC_MANIFEST_PATH), `semantic source manifest is outside the privileged closure: ${SEMANTIC_MANIFEST_PATH}`)
  const manifest = readRegularJson(root, SEMANTIC_MANIFEST_PATH, 'provider-neutral semantic source manifest')
  invariant(Array.isArray(manifest.sources), 'provider-neutral semantic source manifest has no closed sources array')
  const ids = new Set()
  const paths = new Set()
  for (const source of manifest.sources) {
    invariant(source && typeof source === 'object' && !Array.isArray(source), 'semantic source entry must be an object')
    invariant(typeof source.id === 'string' && source.id.length > 0 && !ids.has(source.id), `semantic source id is invalid or duplicated: ${source?.id}`)
    invariant(typeof source.path === 'string' && source.path.length > 0, `semantic source path is invalid or duplicated: ${source?.path}`)
    ids.add(source.id)
    const resolved = safeRelative(root, source.path)
    const stat = lstatSync(resolved.absolute)
    invariant(!stat.isSymbolicLink() && (stat.isFile() || stat.isDirectory()), `semantic source must be a regular file or real directory: ${source.path}`)
    const canonicalSourcePaths = stat.isDirectory() ? [resolved.rel, `${resolved.rel}/`] : [resolved.rel]
    invariant(canonicalSourcePaths.includes(source.path), `semantic source path is not canonical: ${source.path}`)
    invariant(!paths.has(resolved.rel), `semantic source path is invalid or duplicated: ${source.path}`)
    paths.add(resolved.rel)
    invariant(policyProtectsPath(policy, source.path, { directory: stat.isDirectory() }), `semantic source is outside the privileged closure: ${source.path}`)
  }
}

export function readIssuerRegistry(root) {
  const registry = readRegularJson(root, REGISTRY_PATH, 'issuer registry')
  validateIssuerRegistry(registry)
  return registry
}

function entry(root, path) {
  const { absolute, rel } = safeRelative(root, path)
  let stat
  try { stat = lstatSync(absolute) } catch (error) {
    if (error?.code === 'ENOENT') return { path: rel, type: 'absent' }
    throw error
  }
  invariant(!stat.isSymbolicLink(), `protected path may not be a symlink: ${rel}`)
  invariant(stat.isFile(), `protected path must be a regular file: ${rel}`)
  return { path: rel, type: 'file', mode: (stat.mode & 0o777).toString(8).padStart(4, '0'), bytes: readFileSync(absolute) }
}

function walkFiles(root, prefix) {
  const { absolute, rel } = safeRelative(root, prefix)
  let stat
  try { stat = lstatSync(absolute) } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  invariant(!stat.isSymbolicLink() && stat.isDirectory(), `protected prefix must be a real directory: ${rel}`)
  const files = []
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name)
      const item = lstatSync(path)
      const itemRel = relative(root, path).replaceAll('\\', '/')
      invariant(!item.isSymbolicLink(), `protected prefix contains symlink: ${itemRel}`)
      if (item.isDirectory()) visit(path)
      else if (item.isFile()) files.push(itemRel)
      else throw new Error(`protected prefix contains unsupported path: ${itemRel}`)
    }
  }
  visit(absolute)
  return files
}

function validatePolicy(policy, registry, { root, now = new Date() } = {}) {
  // Phase A shape tolerance: accept the trimmed shape or the legacy shape that still carries the
  // retired activation keys (which are no longer read or validated).
  const policyShapeValid = exactKeys(policy, POLICY_KEYS)
    || exactKeys(policy, [...POLICY_KEYS, ...RETIRED_ACTIVATION_POLICY_KEYS])
  invariant(policyShapeValid, 'privileged trust-root policy has an invalid or open shape')
  invariant(policy.$schema === 'schemas/privileged-trust-roots.schema.json', 'privileged trust-root schema reference is invalid')
  invariant(policy.schemaVersion === 2 && policy.algorithm === 'ed25519', 'privileged trust-root policy version/algorithm is invalid')
  invariant(typeof policy.repository === 'string' && /^[^/]+\/[^/]+$/.test(policy.repository), 'privileged trust-root repository is invalid')
  invariant(Number.isInteger(policy.maxAuthorizationTtlMinutes) && policy.maxAuthorizationTtlMinutes >= 1 && policy.maxAuthorizationTtlMinutes <= 1440, 'privileged authorization TTL is invalid')
  invariant(Number.isInteger(policy.clockSkewSeconds) && policy.clockSkewSeconds >= 0 && policy.clockSkewSeconds <= 300, 'privileged authorization clock skew is invalid')
  invariant(typeof policy.authorizationDirectory === 'string' && !policy.authorizationDirectory.startsWith('/'), 'privileged authorization directory is invalid')
  invariant(Number.isInteger(policy.trustRootQuorum) && policy.trustRootQuorum >= 1 && policy.trustRootQuorum <= 5, 'privileged trust-root quorum is invalid')
  invariant(exactKeys(policy.bootstrap, BOOTSTRAP_KEYS) && policy.bootstrap.schemaVersion === 1, 'privileged bootstrap policy has an invalid or open shape')
  invariant(typeof policy.bootstrap.enabled === 'boolean' && Array.isArray(policy.bootstrap.ownerLogins) && new Set(policy.bootstrap.ownerLogins).size === policy.bootstrap.ownerLogins.length, 'privileged bootstrap owner allowlist is invalid')
  invariant(policy.bootstrap.ownerLogins.every(login => /^[A-Za-z0-9-]+$/.test(login)) && typeof policy.bootstrap.nonce === 'string' && policy.bootstrap.nonce.length >= 16, 'privileged bootstrap trust anchor is invalid')
  invariant(Number.isInteger(policy.bootstrap.maxCommentTtlMinutes) && policy.bootstrap.maxCommentTtlMinutes >= 1 && policy.bootstrap.maxCommentTtlMinutes <= 60, 'privileged bootstrap comment TTL is invalid')
  for (const key of ['protectedPaths', 'protectedPrefixes', 'allowedKeyIds']) invariant(Array.isArray(policy[key]), `privileged trust-root ${key} must be an array`)
  invariant(new Set(policy.protectedPaths).size === policy.protectedPaths.length && new Set(policy.protectedPrefixes).size === policy.protectedPrefixes.length, 'privileged trust-root paths must be unique')
  invariant(policy.protectedPrefixes.every(prefix => prefix.endsWith('/')), 'privileged protected prefixes must end in /')
  // The ceremony profile's quorum band collapsed to the single-owner production reality; the
  // static 1..5 bound above plus quorum=1 here is the whole remaining contract (baton §8.1).
  const privilegedBinding = validateRegistryPolicyBinding(policy, registry, {
    role: 'privileged-change-authorizer',
    quorum: 1,
    now,
    allowUnactivated: policy.bootstrap.enabled,
  })
  const rootBinding = validateRegistryPolicyBinding(policy, registry, {
    role: 'root-rotator',
    quorum: policy.trustRootQuorum,
    now,
    allowUnactivated: policy.bootstrap.enabled,
  })
  if (policy.bootstrap.enabled) {
    invariant(policy.allowedKeyIds.length === 0 && registry.issuers.length === 0, 'one-time bootstrap requires an empty issuer registry and no allowed keys')
  } else {
    invariant(policy.allowedKeyIds.length >= policy.trustRootQuorum, 'closed bootstrap requires enough allowed keys for the active trust-root quorum')
    {
      // Single-owner production is the deployment's only shape (baton §8.1): the ceremony
      // profile selector is gone, and the strictest band it ever selected applies always.
      invariant(
        policy.allowedKeyIds.length === 1
          && privilegedBinding.eligible.length === 1
          && rootBinding.eligible.length === 1
          && privilegedBinding.eligible[0].keyId === rootBinding.eligible[0].keyId,
        'single-owner production profile requires exactly one governed key carrying both privileged-change-authorizer and root-rotator roles',
      )
    }
  }
  return policy
}

export function readTrustRootPolicy(trustedRoot, { now = new Date() } = {}) {
  const registry = readIssuerRegistry(trustedRoot)
  const policy = validatePolicy(
    readRegularJson(trustedRoot, POLICY_PATH, 'privileged trust-root policy'),
    registry,
    { root: trustedRoot, now },
  )
  validateSemanticSourceClosure(trustedRoot, policy)
  return policy
}

async function image(root, path) {
  const item = entry(root, path)
  return item.type === 'absent'
    ? { path: item.path, type: item.type }
    : { path: item.path, type: item.type, mode: item.mode, sha256: await sha256(item.bytes) }
}

export async function privilegedChangeSet({
  trustedRoot,
  candidateRoot,
  policy = readTrustRootPolicy(trustedRoot),
  candidatePolicy = readTrustRootPolicy(candidateRoot),
}) {
  // The verified image is the union of the current and proposed closures.
  // Otherwise a candidate could add a policy prefix and semantic manifest entry
  // while leaving the newly introduced source bytes outside the structural check.
  const policies = [policy, candidatePolicy]
  const protectedPaths = new Set([POLICY_PATH, REGISTRY_PATH])
  for (const item of policies) for (const path of item.protectedPaths) protectedPaths.add(path)
  const protectedPrefixes = new Set(policies.flatMap(item => item.protectedPrefixes))
  for (const prefix of protectedPrefixes) {
    for (const path of [...walkFiles(trustedRoot, prefix), ...walkFiles(candidateRoot, prefix)]) protectedPaths.add(path)
  }
  const changed = []
  const candidateImages = []
  for (const path of [...protectedPaths].sort()) {
    const before = await image(trustedRoot, path)
    const after = await image(candidateRoot, path)
    if (stable(before) !== stable(after)) {
      changed.push(path)
      candidateImages.push(after)
    }
  }
  return { changedPaths: changed, contentDigest: await sha256(stable(candidateImages)) }
}

function trustProjection(root) {
  const policy = readRegularJson(root, POLICY_PATH, 'privileged trust-root policy')
  const rings = readRegularJson(root, RELEASE_RINGS_PATH, 'release-rings policy')
  const runtime = readRegularJson(root, RUNTIME_PROFILE_PATH, 'runtime conformance profile')
  // Phase A tolerance: the retired release-tag ceremony policy may already be absent from one
  // side; its bytes still participate in change detection while present so a candidate cannot
  // silently rewrite it, and absence on both sides is simply the post-retirement steady state.
  const releaseTag = entry(root, RELEASE_TAG_POLICY_PATH).type === 'absent'
    ? null
    : readRegularJson(root, RELEASE_TAG_POLICY_PATH, 'release-tag authorization policy')
  return {
    privileged: {
      retiredActivationKeys: RETIRED_ACTIVATION_POLICY_KEYS.map((key) => policy[key] ?? null),
      issuerRegistryDigest: policy.issuerRegistryDigest,
      allowedKeyIds: policy.allowedKeyIds,
      trustRootQuorum: policy.trustRootQuorum,
      bootstrap: policy.bootstrap,
    },
    rollout: rings.attestationPolicy,
    runtime: { issuerRegistryDigest: runtime.issuerRegistryDigest, allowedKeyIds: runtime.allowedKeyIds, requiredIssuerQuorum: runtime.requiredIssuerQuorum },
    releaseTag,
  }
}

function trustConfigurationChanged(trustedRoot, candidateRoot, changes) {
  if (changes.changedPaths.includes(REGISTRY_PATH) || changes.changedPaths.includes(POLICY_PATH)) return true
  return stable(trustProjection(trustedRoot)) !== stable(trustProjection(candidateRoot))
}

function validateCandidateTrustConfiguration(candidateRoot, { now = new Date() } = {}) {
  const registry = readIssuerRegistry(candidateRoot)
  const policy = readTrustRootPolicy(candidateRoot, { now })
  invariant(policy.bootstrap.enabled === false, 'one-time bootstrap may never be reopened')
  invariant(policy.allowedKeyIds.length >= policy.trustRootQuorum, 'candidate privileged policy does not configure its root-rotation quorum')
  const rings = readRegularJson(candidateRoot, RELEASE_RINGS_PATH, 'release-rings policy')
  validateAttestationPolicy(rings.attestationPolicy, { issuerRegistry: registry, now, allowUnactivated: false })
  invariant(rings.attestationPolicy.allowedKeyIds.length > 0, 'candidate release policy must configure registry key references')
  const runtime = readRegularJson(candidateRoot, RUNTIME_PROFILE_PATH, 'runtime conformance profile')
  validateRuntimeProfile(runtime, { issuerRegistry: registry, now, allowUnactivated: false })
  invariant(runtime.allowedKeyIds.length > 0, 'candidate runtime policy must configure registry key references')
  // Ceremony policies (external-activation / release-tag-authorization) are no longer validated:
  // they had no live consumer (baton §8.1 reachability audit) and Phase B removes their files.
  return { registry, policy }
}

function controlPlaneGenesisReceiptDigest(receipt) {
  const unsigned = { ...receipt }
  delete unsigned.receiptDigest
  return createHash('sha256')
    .update(`qijenchen-control-plane-genesis-receipt-v1\n${stable(unsigned)}`)
    .digest('hex')
}

function closedGit(root, args, label) {
  const result = spawnSync('/usr/bin/git', ['-C', resolve(root), ...args], {
    cwd: resolve(root),
    encoding: 'utf8',
    env: {
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      LC_ALL: 'C',
    },
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  invariant(!result.error && result.status === 0,
    `${label} failed closed: ${(result.stderr || result.error?.message || 'unknown Git failure').trim()}`)
  return result.stdout
}

// Live reconciler readback still needs this generic checkout identity guard
// after the one-time Genesis challenge issuer has been retired.
export function verifyGitCheckoutIdentity(root, { head, tree, label }) {
  const identity = closedGit(root, ['rev-parse', 'HEAD^{commit}', 'HEAD^{tree}'],
    `${label} identity readback`).trim().split('\n')
  invariant(identity.length === 2 && identity[0] === head && identity[1] === tree,
    `${label} checkout does not match the declared commit/tree`)
  invariant(closedGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    `${label} worktree readback`).length === 0,
  `${label} checkout contains uncommitted or untracked bytes`)
}

export function validateControlPlaneGenesisReceipt(receipt) {
  invariant(exactKeys(receipt, [
    'schemaVersion', 'kind', 'challenge', 'challengeDigest', 'authorization',
    'verifiedAt', 'receiptDigest',
  ]), 'control-plane genesis receipt has an invalid or open shape')
  invariant(receipt.schemaVersion === 1 && receipt.kind === 'control-plane-genesis-verification',
    'control-plane genesis receipt identity is invalid')
  invariant(exactKeys(receipt.challenge, [
    'schemaVersion', 'kind', 'repository', 'pullRequest', 'baseSha', 'baseTree',
    'candidateHeadSha', 'candidateHeadTree', 'changedPaths', 'changedPathsDigest',
    'controlPlaneClosureDigest', 'controlPlaneStageDigest', 'buildGraphDigest',
    'manifestDigest', 'inventoryDigest', 'desiredDigest', 'controlPlaneLockDigest',
    'issuerRegistryDigest',
  ]), 'control-plane genesis receipt challenge has an invalid or open shape')
  invariant(receipt.challenge.schemaVersion === 1 && receipt.challenge.kind === 'control-plane-genesis-challenge',
    'control-plane genesis challenge identity is invalid')
  invariant(receipt.challenge.repository === 'ajenchen/design-system'
    && Number.isSafeInteger(receipt.challenge.pullRequest) && receipt.challenge.pullRequest > 0,
  'control-plane genesis challenge repository or PR identity is invalid')
  for (const field of ['baseSha', 'baseTree', 'candidateHeadSha', 'candidateHeadTree']) {
    invariant(shaPattern.test(receipt.challenge[field]), `control-plane genesis challenge ${field} is invalid`)
  }
  const paths = receipt.challenge.changedPaths
  invariant(Array.isArray(paths) && paths.length > 0 && new Set(paths).size === paths.length
    && stable(paths) === stable([...paths].sort()), 'control-plane genesis challenge changed paths are invalid')
  for (const field of [
    'changedPathsDigest', 'controlPlaneClosureDigest', 'controlPlaneStageDigest',
    'buildGraphDigest', 'manifestDigest', 'inventoryDigest', 'desiredDigest',
    'controlPlaneLockDigest', 'issuerRegistryDigest',
  ]) invariant(/^[a-f0-9]{64}$/.test(receipt.challenge[field] ?? ''), `control-plane genesis challenge ${field} is invalid`)
  invariant(receipt.challenge.changedPathsDigest === createHash('sha256').update(stable(paths)).digest('hex'),
    'control-plane genesis challenge changed-path digest is invalid')
  invariant(receipt.challengeDigest === createHash('sha256')
    .update(`qijenchen-control-plane-genesis-challenge-v1\n${stable(receipt.challenge)}`)
    .digest('hex'), 'control-plane genesis challenge digest is invalid')
  invariant(exactKeys(receipt.authorization, ['kind', 'commentId', 'commentDigest', 'ownerLogin', 'createdAt'])
    && receipt.authorization.kind === 'github-owner-comment'
    && /^[1-9][0-9]*$/.test(receipt.authorization.commentId)
    && /^[a-f0-9]{64}$/.test(receipt.authorization.commentDigest)
    && receipt.authorization.ownerLogin === 'ajenchen',
  'control-plane genesis authorization identity is invalid')
  for (const [field, value] of [['authorization createdAt', receipt.authorization.createdAt], ['verifiedAt', receipt.verifiedAt]]) {
    const parsed = new Date(value)
    invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, `control-plane genesis receipt ${field} is invalid`)
  }
  invariant(new Date(receipt.authorization.createdAt) <= new Date(receipt.verifiedAt),
    'control-plane genesis receipt predates its authorization')
  invariant(receipt.receiptDigest === controlPlaneGenesisReceiptDigest(receipt),
    'control-plane genesis receipt digest is invalid')
  return receipt
}

export function controlPlaneGenesisCommentBody({ challenge, challengeDigest, expiresAt, nonce }) {
  return `${CONTROL_PLANE_GENESIS_COMMENT_MARKER}${stable({
    challenge,
    challengeDigest,
    expiresAt,
    nonce,
  })}`
}

export async function verifyPrivilegedChange({
  trustedRoot,
  candidateRoot,
  repository,
  baseSha,
  candidateHeadSha,
  now = new Date(),
  ...unsupported
}) {
  invariant(
    Object.keys(unsupported).length === 0,
    `unsupported privileged verification option(s): ${Object.keys(unsupported).sort().join(', ')}`,
  )
  invariant(shaPattern.test(baseSha) && shaPattern.test(candidateHeadSha), 'privileged verification commit SHA is invalid')
  const registry = readIssuerRegistry(trustedRoot)
  const policy = readTrustRootPolicy(trustedRoot, { now })
  // Candidate validation happens before change-set calculation, and the
  // candidate policy is then included in that calculation. New semantic source
  // bytes are therefore part of this verification, not merely future changes.
  const candidatePolicy = readTrustRootPolicy(candidateRoot, { now })
  invariant(repository === policy.repository, `privileged verification repository mismatch: ${repository}`)
  const changes = await privilegedChangeSet({ trustedRoot, candidateRoot, policy, candidatePolicy })
  if (changes.changedPaths.length === 0) return { verified: true, changedPaths: [] }
  // 3B: privileged closure changes are structural verification, not a per-change
  // signature, OWNER-comment, key-enrollment, or authorization-artifact ceremony.
  // The retained fail-closed boundaries are semantic-source closure validation,
  // the trusted+candidate union closure, append-only issuer lineage for trust
  // configuration changes, and repository protected required checks.
  if (trustConfigurationChanged(trustedRoot, candidateRoot, changes)) {
    const candidate = validateCandidateTrustConfiguration(candidateRoot, { now })
    // With no per-change issuedAt, revocation remains structurally validated:
    // append-only, immutable, non-reactivatable, and non-deletable lineage.
    validateIssuerRegistryLineage(registry, candidate.registry)
  }
  return { verified: true, changedPaths: changes.changedPaths }
}

const VERIFY_CLI_FLAGS = new Set([
  '--trusted',
  '--candidate',
  '--repository',
  '--base-sha',
  '--candidate-head-sha',
])
const REMOVED_CEREMONY_FLAGS = new Set([
  '--issue',
  '--private-key',
  '--signer-key-id',
  '--subject',
  '--issued-at',
  '--expires-at',
  '--bootstrap-comments',
  '--pull-request',
])

function parseCliArgs(args) {
  for (const argument of args) {
    invariant(
      !REMOVED_CEREMONY_FLAGS.has(argument),
      `${argument} was removed: privileged closure verification has no per-change signature, OWNER comment, or key-enrollment ceremony`,
    )
  }
  invariant(args.length % 2 === 0, 'privileged verification arguments must be flag/value pairs')
  const values = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    invariant(VERIFY_CLI_FLAGS.has(flag), `unknown privileged verification flag: ${flag}`)
    invariant(!values.has(flag), `duplicate privileged verification flag: ${flag}`)
    invariant(value && !value.startsWith('--'), `missing ${flag}`)
    values.set(flag, value)
  }
  for (const flag of VERIFY_CLI_FLAGS) invariant(values.has(flag), `missing ${flag}`)
  return values
}

async function main() {
  const values = parseCliArgs(process.argv.slice(2))
  const trustedRoot = resolve(values.get('--trusted'))
  const candidateRoot = resolve(values.get('--candidate'))
  const repository = values.get('--repository')
  const baseSha = values.get('--base-sha')
  const candidateHeadSha = values.get('--candidate-head-sha')
  const result = await verifyPrivilegedChange({
    trustedRoot,
    candidateRoot,
    repository,
    baseSha,
    candidateHeadSha,
  })
  console.log(`privileged executable closure verified structurally (${result.changedPaths.length} changed paths)`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(error => { console.error(error.message); process.exit(1) })
