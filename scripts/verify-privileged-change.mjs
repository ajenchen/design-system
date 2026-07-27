#!/usr/bin/env node

import { createHash, createPrivateKey, sign, verify } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  issuerRegistryDigest,
  publicKeyFromIssuer,
  resolvePolicyIssuer,
  validateIssuerRegistry,
  validateIssuerRegistryLineage,
  validateRegistryPolicyBinding,
} from '../infra/governance/lib/issuer-registry.mjs'
import { validateAttestationPolicy } from '../infra/governance/lib/attestation.mjs'
import { validateRuntimeProfile } from '../infra/governance/lib/provider-runtime-conformance.mjs'
import { validateReleaseTagAuthorizationPolicy } from '../infra/governance/lib/release-tag-authorization.mjs'
import {
  externalActivationPolicyDigest,
  resolveExternalActivationProfile,
} from '../infra/governance/lib/external-activation.mjs'
import {
  loadGovernanceBuildGraphSemanticDefinition,
  pathMatches as buildGraphPathMatches,
  stageSourceMatches,
} from './governance-build-graph.mjs'

const AUTH_KEYS = [
  'schemaVersion', 'kind', 'repository', 'baseSha', 'candidateHeadSha',
  'changedPaths', 'contentDigest', 'issuerRegistryDigest', 'issuedAt', 'expiresAt',
  'signerKeyId', 'subject', 'signature', 'coSignatures',
]
const POLICY_KEYS = [
  '$schema', 'schemaVersion', 'repository', 'algorithm', 'maxAuthorizationTtlMinutes',
  'clockSkewSeconds', 'authorizationDirectory', 'issuerRegistryDigest', 'allowedKeyIds',
  'protectedPaths', 'protectedPrefixes', 'trustRootQuorum', 'bootstrap',
  'externalActivationPolicyDigest', 'authorizationProfileId', 'authorizationProfileDigest',
]
const COSIGNATURE_KEYS = ['signerKeyId', 'subject', 'signature']
const BOOTSTRAP_KEYS = ['schemaVersion', 'enabled', 'ownerLogins', 'nonce', 'maxCommentTtlMinutes']
const shaPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const REGISTRY_PATH = 'infra/governance/trust/issuers.json'
const POLICY_PATH = 'infra/governance/privileged-trust-roots.json'
const EXTERNAL_ACTIVATION_POLICY_PATH = 'infra/governance/external-activation-policy.json'
const RELEASE_RINGS_PATH = 'infra/governance/release-rings.json'
const RUNTIME_PROFILE_PATH = 'infra/governance/providers/runtime-conformance.json'
const RELEASE_TAG_POLICY_PATH = 'infra/governance/release-tag-authorization-policy.json'
const SEMANTIC_MANIFEST_PATH = 'packages/governance/canonical/manifest.json'
const CONTROL_PLANE_GENESIS_MARKERS = Object.freeze([
  '.github/workflows/governance-anchor.yml',
  'governance/control-plane.lock.json',
  'infra/governance/bin/reconcile-github.mjs',
  'infra/governance/desired/github.json',
  'infra/governance/inventory/managed-repos.json',
  'infra/governance/privileged-trust-roots.json',
  'infra/governance/staged-rollout-plan.json',
  'infra/governance/trust/issuers.json',
  'packages/governance/canonical/manifest.json',
  'scripts/governance-build-graph.json',
  'scripts/verify-privileged-change.mjs',
])
const CONTROL_PLANE_GENESIS_COMMENT_MARKER = 'DS-GOVERNANCE-CONTROL-PLANE-GENESIS-V1 '
const PRODUCTION_PROFILE = 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM'

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

function resolveTrustRootProfile(root, policy) {
  const externalActivationPolicy = readRegularJson(
    root,
    EXTERNAL_ACTIVATION_POLICY_PATH,
    'external activation policy',
  )
  const policyDigest = externalActivationPolicyDigest(externalActivationPolicy)
  invariant(
    policy.externalActivationPolicyDigest === policyDigest,
    'privileged trust-root external activation policy digest is stale or substituted',
  )
  invariant(
    policy.authorizationProfileId === externalActivationPolicy.activeProfile,
    'privileged trust-root profile differs from the active canonical profile',
  )
  const profile = resolveExternalActivationProfile(externalActivationPolicy, {
    expectedPolicyDigest: policy.externalActivationPolicyDigest,
    profileId: policy.authorizationProfileId,
  })
  invariant(
    policy.authorizationProfileDigest === profile.sha256,
    'privileged trust-root profile digest is stale or substituted',
  )
  return { externalActivationPolicy, profile }
}

function validatePolicy(policy, registry, { root, now = new Date() } = {}) {
  invariant(exactKeys(policy, POLICY_KEYS), 'privileged trust-root policy has an invalid or open shape')
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
  const { profile } = resolveTrustRootProfile(root, policy)
  invariant(
    policy.trustRootQuorum >= profile.releaseAuthorization.minimumSignerQuorum
      && policy.trustRootQuorum <= profile.releaseAuthorization.maximumSignerQuorum
      && (
        profile.releaseAuthorization.minimumSignerQuorum !== profile.releaseAuthorization.maximumSignerQuorum
        || policy.trustRootQuorum === profile.releaseAuthorization.minimumSignerQuorum
      ),
    `privileged trust-root quorum is invalid for profile ${profile.id}`,
  )
  const privilegedBinding = validateRegistryPolicyBinding(policy, registry, {
    role: 'privileged-change-authorizer',
    quorum: profile.id === PRODUCTION_PROFILE ? 1 : policy.trustRootQuorum,
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
    if (profile.id === PRODUCTION_PROFILE) {
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
  const { externalActivationPolicy } = resolveTrustRootProfile(trustedRoot, policy)
  const releaseTagPolicy = readRegularJson(trustedRoot, RELEASE_TAG_POLICY_PATH, 'release-tag authorization policy')
  validateReleaseTagAuthorizationPolicy(releaseTagPolicy, {
    issuerRegistry: registry,
    now,
    allowUnactivated: policy.bootstrap.enabled,
    externalActivationPolicy,
    expectedExternalActivationPolicyDigest: policy.externalActivationPolicyDigest,
  })
  invariant(releaseTagPolicy.repository === policy.repository, 'release-tag and privileged trust-root repository bindings differ')
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
  // The authorization image is the union of the current and proposed closures.
  // Otherwise a candidate could add a policy prefix and semantic manifest entry
  // while leaving the newly introduced source bytes outside the signed digest.
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

function unsignedPayload(authorization) {
  const payload = { ...authorization }
  delete payload.signature
  delete payload.coSignatures
  return Buffer.from(stable(payload), 'utf8')
}

export async function issuePrivilegedChangeAuthorization({ trustedRoot, candidateRoot, repository, baseSha, candidateHeadSha, signerKeyId, subject, privateKey, issuedAt, expiresAt }) {
  const registry = readIssuerRegistry(trustedRoot)
  const issuanceTime = new Date(issuedAt)
  const policy = readTrustRootPolicy(trustedRoot, { now: issuanceTime })
  const candidatePolicy = readTrustRootPolicy(candidateRoot, { now: issuanceTime })
  const changes = await privilegedChangeSet({ trustedRoot, candidateRoot, policy, candidatePolicy })
  invariant(changes.changedPaths.length > 0, 'no privileged change requires authorization')
  const authorization = {
    schemaVersion: 1,
    kind: 'privileged-change-authorization',
    repository,
    baseSha,
    candidateHeadSha,
    changedPaths: changes.changedPaths,
    contentDigest: changes.contentDigest,
    issuerRegistryDigest: issuerRegistryDigest(registry),
    issuedAt,
    expiresAt,
    signerKeyId,
    subject,
    signature: '',
    coSignatures: [],
  }
  const key = privateKey?.type === 'private' ? privateKey : createPrivateKey(privateKey)
  invariant(key.asymmetricKeyType === 'ed25519', 'privileged authorization private key must be Ed25519')
  authorization.signature = sign(null, unsignedPayload(authorization), key).toString('base64url')
  return authorization
}

export function cosignPrivilegedChangeAuthorization(authorization, { signerKeyId, subject, privateKey }) {
  invariant(exactKeys(authorization, AUTH_KEYS), 'privileged authorization has an invalid or open shape')
  invariant(![authorization.signerKeyId, ...authorization.coSignatures.map(item => item.signerKeyId)].includes(signerKeyId), 'privileged cosigner must be distinct')
  invariant(![authorization.subject, ...authorization.coSignatures.map(item => item.subject)].includes(subject), 'privileged cosigner subject must be distinct')
  const key = privateKey?.type === 'private' ? privateKey : createPrivateKey(privateKey)
  invariant(key.asymmetricKeyType === 'ed25519', 'privileged authorization private key must be Ed25519')
  authorization.coSignatures.push({ signerKeyId, subject, signature: sign(null, unsignedPayload(authorization), key).toString('base64url') })
  return authorization
}

function bootstrapPayload({ repository, pullRequest, candidateHeadSha, trustRootSha256, issuerRegistryDigest, contentDigest, expiresAt, nonce }) {
  return { repository, pullRequest, candidateHeadSha, trustRootSha256, issuerRegistryDigest, contentDigest, expiresAt, nonce }
}

export function bootstrapCommentBody(input) {
  return `DS-GOVERNANCE-BOOTSTRAP-V1 ${stable(bootstrapPayload(input))}`
}

function trustProjection(root) {
  const policy = readRegularJson(root, POLICY_PATH, 'privileged trust-root policy')
  const rings = readRegularJson(root, RELEASE_RINGS_PATH, 'release-rings policy')
  const runtime = readRegularJson(root, RUNTIME_PROFILE_PATH, 'runtime conformance profile')
  const releaseTag = readRegularJson(root, RELEASE_TAG_POLICY_PATH, 'release-tag authorization policy')
  return {
    privileged: {
      externalActivationPolicyDigest: policy.externalActivationPolicyDigest,
      authorizationProfileId: policy.authorizationProfileId,
      authorizationProfileDigest: policy.authorizationProfileDigest,
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
  const releaseTag = readRegularJson(candidateRoot, RELEASE_TAG_POLICY_PATH, 'release-tag authorization policy')
  const { externalActivationPolicy } = resolveTrustRootProfile(candidateRoot, policy)
  validateReleaseTagAuthorizationPolicy(releaseTag, {
    issuerRegistry: registry,
    now,
    allowUnactivated: false,
    externalActivationPolicy,
    expectedExternalActivationPolicyDigest: policy.externalActivationPolicyDigest,
  })
  invariant(releaseTag.repository === policy.repository, 'candidate release-tag and privileged repository bindings differ')
  invariant(releaseTag.allowedKeyIds.length > 0, 'candidate release-tag policy must configure dedicated registry key references')
  return { registry, policy }
}

function controlPlaneGenesisReceiptDigest(receipt) {
  const unsigned = { ...receipt }
  delete unsigned.receiptDigest
  return createHash('sha256')
    .update(`qijenchen-control-plane-genesis-receipt-v1\n${stable(unsigned)}`)
    .digest('hex')
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

function canonicalChangedPaths(candidateRoot, changedPaths) {
  invariant(Array.isArray(changedPaths) && changedPaths.length > 0, 'control-plane genesis requires a non-empty trusted PR changed-path list')
  const normalized = changedPaths.map(path => {
    invariant(typeof path === 'string' && path.length > 0, 'control-plane genesis changed path is invalid')
    const resolved = safeRelative(candidateRoot, path)
    invariant(resolved.rel === path && path !== '.', `control-plane genesis changed path is not canonical: ${path}`)
    return path
  })
  invariant(new Set(normalized).size === normalized.length, 'control-plane genesis changed paths contain duplicates')
  invariant(stable(normalized) === stable([...normalized].sort()), 'control-plane genesis changed paths are not canonically ordered')
  return normalized
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

export function verifyGitCheckoutIdentity(root, { head, tree, label }) {
  const identity = closedGit(root, ['rev-parse', 'HEAD^{commit}', 'HEAD^{tree}'],
    `${label} identity readback`).trim().split('\n')
  invariant(identity.length === 2 && identity[0] === head && identity[1] === tree,
    `${label} checkout does not match the declared commit/tree`)
  invariant(closedGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    `${label} worktree readback`).length === 0,
  `${label} checkout contains uncommitted or untracked bytes`)
}

function exactGitChangedPaths(candidateRoot, { baseSha, baseTree, candidateHeadSha, candidateHeadTree }) {
  const resolved = closedGit(candidateRoot, [
    'rev-parse',
    `${baseSha}^{commit}`,
    `${baseSha}^{tree}`,
    `${candidateHeadSha}^{commit}`,
    `${candidateHeadSha}^{tree}`,
  ], 'control-plane genesis commit/tree object readback').trim().split('\n')
  invariant(resolved.length === 4
    && resolved[0] === baseSha
    && resolved[1] === baseTree
    && resolved[2] === candidateHeadSha
    && resolved[3] === candidateHeadTree,
  'control-plane genesis declared commit/tree objects differ from canonical Git readback')
  const fields = closedGit(candidateRoot, [
    'diff',
    '--name-status',
    '-z',
    '--no-renames',
    '--no-ext-diff',
    '--no-textconv',
    `${baseSha}^{tree}`,
    `${candidateHeadSha}^{tree}`,
  ], 'control-plane genesis exact changed-path readback').split('\0')
  if (fields.at(-1) === '') fields.pop()
  invariant(fields.length > 0 && fields.length % 2 === 0,
    'control-plane genesis exact Git changed-path readback is empty or malformed')
  const paths = []
  for (let index = 0; index < fields.length; index += 2) {
    invariant(fields[index] === 'A' || fields[index] === 'M',
      `control-plane genesis contains forbidden Git status ${fields[index]} for ${fields[index + 1]}`)
    paths.push(fields[index + 1])
  }
  invariant(new Set(paths).size === paths.length,
    'control-plane genesis Git changed-path readback contains duplicates')
  return paths.sort()
}

export async function prepareControlPlaneGenesisChallenge({
  trustedRoot,
  candidateRoot,
  repository,
  baseSha,
  baseTree,
  candidateHeadSha,
  candidateHeadTree,
  pullRequest,
  changedPaths,
  now = new Date(),
}) {
  invariant(shaPattern.test(baseSha) && shaPattern.test(baseTree)
    && shaPattern.test(candidateHeadSha) && shaPattern.test(candidateHeadTree),
  'control-plane genesis commit/tree identity is invalid')
  invariant(repository === 'ajenchen/design-system', 'control-plane genesis is restricted to the registered authority repository')
  invariant(Number.isSafeInteger(pullRequest) && pullRequest > 0, 'control-plane genesis requires an exact pull request number')
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'control-plane genesis verification time is invalid')
  const paths = canonicalChangedPaths(candidateRoot, changedPaths)
  verifyGitCheckoutIdentity(trustedRoot, {
    head: baseSha,
    tree: baseTree,
    label: 'control-plane genesis trusted base',
  })
  verifyGitCheckoutIdentity(candidateRoot, {
    head: candidateHeadSha,
    tree: candidateHeadTree,
    label: 'control-plane genesis candidate',
  })
  invariant(stable(paths) === stable(exactGitChangedPaths(candidateRoot, {
    baseSha,
    baseTree,
    candidateHeadSha,
    candidateHeadTree,
  })), 'control-plane genesis changed paths do not equal the complete base-to-candidate Git tree diff')
  const graph = loadGovernanceBuildGraphSemanticDefinition({
    repoRoot: candidateRoot,
  })
  const stage = graph.stages.find(candidate => candidate.id === 'control-plane')
  invariant(stage, 'canonical build graph has no control-plane stage')
  const withinControlPlaneClosure = path => stageSourceMatches(stage, path)
    || stage.outputs.some(declaration => buildGraphPathMatches(path, declaration))
  for (const path of paths) invariant(withinControlPlaneClosure(path), `control-plane genesis changed a path outside the canonical control-plane closure: ${path}`)
  for (const marker of CONTROL_PLANE_GENESIS_MARKERS) {
    invariant(withinControlPlaneClosure(marker), `control-plane genesis marker is outside the canonical control-plane closure: ${marker}`)
    invariant((await image(trustedRoot, marker)).type === 'absent', `control-plane genesis is permanently closed because the trusted base already contains ${marker}`)
    invariant(paths.includes(marker), `control-plane genesis omits required marker ${marker}`)
    invariant((await image(candidateRoot, marker)).type === 'file', `control-plane genesis candidate lacks required marker ${marker}`)
  }
  const { registry, policy } = validateCandidateTrustConfiguration(candidateRoot, { now })
  const repositoryOwner = repository.split('/')[0]
  invariant(stable(policy.bootstrap.ownerLogins) === stable([repositoryOwner]), 'control-plane genesis owner allowlist must contain only the registered repository owner')
  const images = []
  for (const path of paths) {
    const before = await image(trustedRoot, path)
    const after = await image(candidateRoot, path)
    invariant(after.type === 'file', `control-plane genesis may not delete or materialize a non-file path: ${path}`)
    invariant(stable(before) !== stable(after), `control-plane genesis trusted PR changed-path list contains an unchanged path: ${path}`)
    images.push({ path, before, after })
  }
  const buildGraphBytes = readFileSync(safeRelative(candidateRoot, 'scripts/governance-build-graph.json').absolute)
  const manifestBytes = readFileSync(safeRelative(candidateRoot, SEMANTIC_MANIFEST_PATH).absolute)
  const inventoryBytes = readFileSync(safeRelative(candidateRoot, 'infra/governance/inventory/managed-repos.json').absolute)
  const desiredBytes = readFileSync(safeRelative(candidateRoot, 'infra/governance/desired/github.json').absolute)
  const controlPlaneLockBytes = readFileSync(safeRelative(candidateRoot, 'governance/control-plane.lock.json').absolute)
  const challenge = {
    schemaVersion: 1,
    kind: 'control-plane-genesis-challenge',
    repository,
    pullRequest,
    baseSha,
    baseTree,
    candidateHeadSha,
    candidateHeadTree,
    changedPaths: paths,
    changedPathsDigest: await sha256(stable(paths)),
    controlPlaneClosureDigest: await sha256(stable(images)),
    controlPlaneStageDigest: await sha256(stable({
      id: stage.id,
      sources: stage.sources,
      sourceExcludes: stage.sourceExcludes,
      outputs: stage.outputs,
      runtimeEntrypoints: stage.runtimeEntrypoints,
    })),
    buildGraphDigest: await sha256(buildGraphBytes),
    manifestDigest: await sha256(manifestBytes),
    inventoryDigest: await sha256(inventoryBytes),
    desiredDigest: await sha256(desiredBytes),
    controlPlaneLockDigest: await sha256(controlPlaneLockBytes),
    issuerRegistryDigest: issuerRegistryDigest(registry),
  }
  return {
    challenge,
    policy,
    challengeDigest: await sha256(`qijenchen-control-plane-genesis-challenge-v1\n${stable(challenge)}`),
  }
}

export function controlPlaneGenesisCommentBody({ challenge, challengeDigest, expiresAt, nonce }) {
  return `${CONTROL_PLANE_GENESIS_COMMENT_MARKER}${stable({
    challenge,
    challengeDigest,
    expiresAt,
    nonce,
  })}`
}

export async function verifyControlPlaneGenesis(input) {
  const prepared = await prepareControlPlaneGenesisChallenge(input)
  const { challenge, challengeDigest, policy } = prepared
  const now = input.now ?? new Date()
  const comments = input.bootstrapComments
  invariant(Array.isArray(comments), 'control-plane genesis requires trusted GitHub PR comment readback')
  const repositoryOwner = challenge.repository.split('/')[0]
  const maxExpiry = new Date(now.getTime() + policy.bootstrap.maxCommentTtlMinutes * 60 * 1000)
  const matches = comments.flat(Infinity).filter(comment => {
    const createdAt = new Date(comment?.created_at)
    const updatedAt = new Date(comment?.updated_at)
    if (comment?.author_association !== 'OWNER' || comment?.user?.login !== repositoryOwner) return false
    if (!Number.isFinite(createdAt.getTime()) || createdAt.getTime() !== updatedAt.getTime() || createdAt > now) return false
    if (typeof comment.body !== 'string' || !comment.body.startsWith(CONTROL_PLANE_GENESIS_COMMENT_MARKER)) return false
    let payload
    try { payload = JSON.parse(comment.body.slice(CONTROL_PLANE_GENESIS_COMMENT_MARKER.length)) } catch { return false }
    if (!exactKeys(payload, ['challenge', 'challengeDigest', 'expiresAt', 'nonce'])) return false
    const expiresAt = new Date(payload.expiresAt)
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now || expiresAt > maxExpiry || createdAt > expiresAt) return false
    return comment.body === controlPlaneGenesisCommentBody({
      challenge,
      challengeDigest,
      expiresAt: payload.expiresAt,
      nonce: policy.bootstrap.nonce,
    })
  })
  invariant(matches.length === 1, 'control-plane genesis requires exactly one unedited, unexpired OWNER comment bound to the exact base/head/tree/control-plane closure')
  const comment = matches[0]
  const receipt = {
    schemaVersion: 1,
    kind: 'control-plane-genesis-verification',
    challenge,
    challengeDigest,
    authorization: {
      kind: 'github-owner-comment',
      commentId: String(comment.id),
      commentDigest: await sha256(comment.body),
      ownerLogin: repositoryOwner,
      createdAt: new Date(comment.created_at).toISOString(),
    },
    verifiedAt: now.toISOString(),
    receiptDigest: null,
  }
  receipt.receiptDigest = controlPlaneGenesisReceiptDigest(receipt)
  return validateControlPlaneGenesisReceipt(receipt)
}

async function verifyBootstrapTransition({ trustedRoot, candidateRoot, repository, candidateHeadSha, pullRequest, comments, changes, policy, now }) {
  invariant(policy.bootstrap.enabled && policy.allowedKeyIds.length === 0, 'privileged trust root is not in one-time bootstrap mode')
  invariant(Number.isInteger(pullRequest) && pullRequest > 0 && Array.isArray(comments), 'privileged bootstrap requires trusted PR comment evidence')
  const { registry: candidateRegistry, policy: candidatePolicy } = validateCandidateTrustConfiguration(candidateRoot, { now })
  for (const key of POLICY_KEYS.filter(key => !['issuerRegistryDigest', 'allowedKeyIds', 'bootstrap'].includes(key))) {
    invariant(stable(candidatePolicy[key]) === stable(policy[key]), `bootstrap transition may not alter policy field ${key}`)
  }
  invariant(stable({ ...candidatePolicy.bootstrap, enabled: true }) === stable(policy.bootstrap), 'bootstrap transition may only close the bootstrap enabled flag')
  const trustRootPath = safeRelative(candidateRoot, POLICY_PATH).absolute
  const trustRootSha256 = await sha256(readFileSync(trustRootPath))
  const candidateRegistryDigest = issuerRegistryDigest(candidateRegistry)
  const maxExpiry = new Date(now.getTime() + policy.bootstrap.maxCommentTtlMinutes * 60 * 1000)
  const matching = comments.flat(Infinity).filter(comment => {
    const createdAt = new Date(comment?.created_at)
    const updatedAt = new Date(comment?.updated_at)
    if (comment?.author_association !== 'OWNER' || !policy.bootstrap.ownerLogins.includes(comment?.user?.login)) return false
    if (!Number.isFinite(createdAt.getTime()) || createdAt.getTime() !== updatedAt.getTime() || createdAt > now) return false
    const marker = 'DS-GOVERNANCE-BOOTSTRAP-V1 '
    if (typeof comment.body !== 'string' || !comment.body.startsWith(marker)) return false
    let payload
    try { payload = JSON.parse(comment.body.slice(marker.length)) } catch { return false }
    if (!exactKeys(payload, ['repository', 'pullRequest', 'candidateHeadSha', 'trustRootSha256', 'issuerRegistryDigest', 'contentDigest', 'expiresAt', 'nonce'])) return false
    const expiresAt = new Date(payload.expiresAt)
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now || expiresAt > maxExpiry || createdAt > expiresAt) return false
    return comment.body === bootstrapCommentBody({ repository, pullRequest, candidateHeadSha, trustRootSha256, issuerRegistryDigest: candidateRegistryDigest, contentDigest: changes.contentDigest, expiresAt: payload.expiresAt, nonce: policy.bootstrap.nonce })
  })
  invariant(matching.length === 1, 'privileged bootstrap requires exactly one unedited, unexpired OWNER comment bound to this PR/head/trust root/registry/closure')
  return { authorized: true, changedPaths: changes.changedPaths, authorization: { kind: 'owner-comment-bootstrap', commentId: matching[0].id } }
}

export async function verifyPrivilegedChange({
  trustedRoot,
  candidateRoot,
  repository,
  baseSha,
  candidateHeadSha,
  pullRequest = null,
  bootstrapComments = null,
  now = new Date(),
  controlPlaneGenesis = false,
  baseTree = null,
  candidateHeadTree = null,
  changedPaths = null,
}) {
  invariant(shaPattern.test(baseSha) && shaPattern.test(candidateHeadSha), 'privileged verification commit SHA is invalid')
  if (controlPlaneGenesis) {
    return verifyControlPlaneGenesis({
      trustedRoot,
      candidateRoot,
      repository,
      baseSha,
      baseTree,
      candidateHeadSha,
      candidateHeadTree,
      pullRequest,
      changedPaths,
      bootstrapComments,
      now,
    })
  }
  const registry = readIssuerRegistry(trustedRoot)
  const policy = readTrustRootPolicy(trustedRoot, { now })
  // Candidate validation happens before change-set calculation, and the
  // candidate policy is then included in that calculation. New semantic source
  // bytes are therefore part of this authorization, not merely future changes.
  const candidatePolicy = readTrustRootPolicy(candidateRoot, { now })
  invariant(repository === policy.repository, `privileged verification repository mismatch: ${repository}`)
  const changes = await privilegedChangeSet({ trustedRoot, candidateRoot, policy, candidatePolicy })
  if (changes.changedPaths.length === 0) return { authorized: true, changedPaths: [], authorization: null }
  const authorizationPath = safeRelative(candidateRoot, `${policy.authorizationDirectory}/${candidateHeadSha}.json`).absolute
  let authorization
  try { authorization = JSON.parse(readFileSync(authorizationPath, 'utf8')) } catch (error) {
    if (policy.bootstrap.enabled && policy.allowedKeyIds.length === 0 && bootstrapComments) {
      return verifyBootstrapTransition({ trustedRoot, candidateRoot, repository, candidateHeadSha, pullRequest, comments: bootstrapComments, changes, policy, now })
    }
    throw new Error(`privileged executable closure changed without ${relative(candidateRoot, authorizationPath)}: ${changes.changedPaths.join(', ')}`, { cause: error })
  }
  invariant(exactKeys(authorization, AUTH_KEYS), 'privileged authorization has an invalid or open shape')
  invariant(authorization.schemaVersion === 1 && authorization.kind === 'privileged-change-authorization', 'privileged authorization kind/version is invalid')
  invariant(authorization.repository === repository && authorization.baseSha === baseSha && authorization.candidateHeadSha === candidateHeadSha, 'privileged authorization repository or commit binding mismatch')
  invariant(stable(authorization.changedPaths) === stable(changes.changedPaths) && authorization.contentDigest === changes.contentDigest, 'privileged authorization does not bind the exact executable closure change')
  invariant(authorization.issuerRegistryDigest === policy.issuerRegistryDigest && authorization.issuerRegistryDigest === issuerRegistryDigest(registry), 'privileged authorization issuer registry binding mismatch')
  const issuedAt = new Date(authorization.issuedAt)
  const expiresAt = new Date(authorization.expiresAt)
  invariant(Number.isFinite(issuedAt.getTime()) && Number.isFinite(expiresAt.getTime()) && expiresAt > issuedAt, 'privileged authorization time window is invalid')
  invariant(expiresAt.getTime() - issuedAt.getTime() <= policy.maxAuthorizationTtlMinutes * 60 * 1000, 'privileged authorization exceeds policy TTL')
  invariant(issuedAt.getTime() <= now.getTime() + policy.clockSkewSeconds * 1000 && expiresAt > now, 'privileged authorization is not currently valid')
  invariant(Array.isArray(authorization.coSignatures) && authorization.coSignatures.every(item => exactKeys(item, COSIGNATURE_KEYS)), 'privileged authorization cosignatures have an invalid shape')
  const signatures = [{ signerKeyId: authorization.signerKeyId, subject: authorization.subject, signature: authorization.signature }, ...authorization.coSignatures]
  invariant(new Set(signatures.map(item => item.signerKeyId)).size === signatures.length, 'privileged authorization signers must be distinct')
  invariant(new Set(signatures.map(item => item.subject)).size === signatures.length, 'privileged authorization signer subjects must be distinct')
  const trustChange = trustConfigurationChanged(trustedRoot, candidateRoot, changes)
  const role = trustChange ? 'root-rotator' : 'privileged-change-authorizer'
  for (const item of signatures) {
    const issuer = resolvePolicyIssuer(policy, registry, item.signerKeyId, { role, at: issuedAt, validThrough: expiresAt })
    resolvePolicyIssuer(policy, registry, item.signerKeyId, { role, at: now, validThrough: now })
    invariant(issuer.subject === item.subject, 'privileged authorization signer subject does not match the issuer registry')
    const signature = Buffer.from(item.signature, 'base64url')
    invariant(signature.length === 64 && signature.toString('base64url') === item.signature, 'privileged authorization signature encoding is not canonical Ed25519 base64url')
    invariant(verify(null, unsignedPayload(authorization), publicKeyFromIssuer(issuer), signature), 'privileged authorization signature is invalid')
  }
  invariant(signatures.length >= (trustChange ? policy.trustRootQuorum : 1), 'privileged trust-root rotation/revocation lacks the active profile signer quorum')
  if (trustChange) {
    const candidate = validateCandidateTrustConfiguration(candidateRoot, { now })
    validateIssuerRegistryLineage(registry, candidate.registry, { revocationEffectiveAt: issuedAt })
  }
  return { authorized: true, changedPaths: changes.changedPaths, authorization }
}

function value(args, flag) {
  const at = args.indexOf(flag)
  invariant(at >= 0 && args[at + 1] && !args[at + 1].startsWith('--'), `missing ${flag}`)
  return args[at + 1]
}

async function main() {
  const args = process.argv.slice(2)
  const trustedRoot = resolve(value(args, '--trusted'))
  const candidateRoot = resolve(value(args, '--candidate'))
  const repository = value(args, '--repository')
  const baseSha = value(args, '--base-sha')
  const candidateHeadSha = value(args, '--candidate-head-sha')
  if (args.includes('--issue')) {
    const privateKeyPath = resolve(value(args, '--private-key'))
    const stat = lstatSync(privateKeyPath)
    invariant(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0, 'private key must be a regular non-symlink file with no group/other permissions')
    const authorization = await issuePrivilegedChangeAuthorization({
      trustedRoot, candidateRoot, repository, baseSha, candidateHeadSha,
      signerKeyId: value(args, '--signer-key-id'), subject: value(args, '--subject'),
      privateKey: readFileSync(privateKeyPath), issuedAt: value(args, '--issued-at'), expiresAt: value(args, '--expires-at'),
    })
    process.stdout.write(`${JSON.stringify(authorization, null, 2)}\n`)
    return
  }
  const bootstrapComments = args.includes('--bootstrap-comments') ? JSON.parse(readFileSync(resolve(value(args, '--bootstrap-comments')), 'utf8')) : null
  const pullRequest = args.includes('--pull-request') ? Number(value(args, '--pull-request')) : null
  const controlPlaneGenesis = args.includes('--control-plane-genesis')
  const changedPaths = controlPlaneGenesis ? JSON.parse(readFileSync(resolve(value(args, '--changed-paths')), 'utf8')) : null
  const result = await verifyPrivilegedChange({
    trustedRoot,
    candidateRoot,
    repository,
    baseSha,
    candidateHeadSha,
    bootstrapComments,
    pullRequest,
    controlPlaneGenesis,
    baseTree: controlPlaneGenesis ? value(args, '--base-tree') : null,
    candidateHeadTree: controlPlaneGenesis ? value(args, '--candidate-head-tree') : null,
    changedPaths,
  })
  if (controlPlaneGenesis) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else console.log(`privileged executable closure verified (${result.changedPaths.length} authorized changes)`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(error => { console.error(error.message); process.exit(1) })
