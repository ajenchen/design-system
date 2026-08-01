#!/usr/bin/env node
// Trusted consumer-side verifier for the complete upgrade provenance chain.
//
// Security boundary:
//   verified npm/Sigstore bundle -> exact GitHub workflow/tag/commit
//   -> exact GitHub lightweight commit tag or direct annotated tag object -> exact commit/tree
//   -> immutable GitHub Release closed asset set (six core files plus optional finalizer evidence) -> receipt/trust/BOM/scaffold/package/SBOM bytes
//   -> exact npm SRI.
// This file is loaded from the current trusted consumer before an incoming package is installed;
// incoming package code and its self-declared verifier are never used to establish this identity.

import { createHash } from 'node:crypto'
import {
  RELEASE_SUPPLY_CHAIN,
  validateReleaseBom,
} from './release-bom-contract.mjs'
import {
  PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET,
  validateProductTemplateScaffoldLock,
} from './product-template-scaffold-lock.mjs'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

export const PROVENANCE_TYPE = 'https://slsa.dev/provenance/v1'
export const GITHUB_ACTIONS_BUILDER = 'https://github.com/actions/runner/github-hosted'
export const NPM_FINALIZATION_RECEIPT_ASSET = 'npm-finalization-receipt.json'
export const RELEASE_TRUST_PREFLIGHT_ASSET = 'release-trust-preflight.json'
export const IMMUTABLE_RELEASE_ASSET_COUNT = 8
export const TRUSTED_UPGRADE_POLICY = Object.freeze({
  schemaVersion: 1,
  repository: 'ajenchen/design-system',
  workflow: '.github/workflows/release.yml',
  workflowRef: RELEASE_SUPPLY_CHAIN.npmProvenance.workflowRef,
  provenancePredicate: PROVENANCE_TYPE,
  builderId: GITHUB_ACTIONS_BUILDER,
  immutableRelease: true,
  releaseBomAsset: 'release-bom.json',
  upgradePackages: Object.freeze([
    '@qijenchen/design-system',
    '@qijenchen/storybook-config',
  ]),
  releasePackages: Object.freeze([
    '@qijenchen/design-system',
    '@qijenchen/governance',
    '@qijenchen/storybook-config',
  ]),
})

const SHA256_RE = /^[a-f0-9]{64}$/
const COMMIT_RE = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/
const POSITIVE_INTEGER_RE = /^[1-9][0-9]*$/
const SRI_RE = /^sha512-[A-Za-z0-9+/]+={0,2}$/

const sha256 = (body) => createHash('sha256').update(body).digest('hex')
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
const validSha512Sri = (value) => {
  if (!SRI_RE.test(value || '')) return false
  const encoded = value.slice('sha512-'.length)
  const digest = Buffer.from(encoded, 'base64')
  return digest.length === 64 && digest.toString('base64') === encoded
}
const exactKeys = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an open or incomplete shape`)
  }
}

const parseJsonAsset = (body, label) => {
  try { return JSON.parse(body.toString('utf8')) }
  catch { throw new Error(`${label} is invalid JSON`) }
}

const canonicalTimestamp = (value, label) => {
  const parsed = new Date(value)
  if (typeof value !== 'string'
    || !Number.isFinite(parsed.getTime())
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new Error(`${label} is not a canonical UTC timestamp`)
  }
  return value
}

function releaseAssetMap(release, label) {
  if (!Array.isArray(release?.assets)) throw new Error(`${label} asset inventory is missing`)
  const assets = new Map()
  for (const asset of release.assets) {
    if (!asset || typeof asset.name !== 'string' || !asset.name || assets.has(asset.name)) {
      throw new Error(`${label} contains duplicate or invalid asset names`)
    }
    assets.set(asset.name, asset)
  }
  return assets
}

function bomReleaseAssets(bom, availableNames = null) {
  // The two high-assurance evidence assets (finalization receipt + release trust
  // preflight) are produced only by the opt-in enterprise finalizer lane. The ordinary
  // release ships the six-file BOM set; when the evidence assets are present they are
  // fully verified, when absent the ordinary set stands on tag + BOM + SLSA provenance.
  const evidenceEntries = [
    { name: NPM_FINALIZATION_RECEIPT_ASSET, size: null, sha256: null, role: 'finalization-receipt' },
    { name: RELEASE_TRUST_PREFLIGHT_ASSET, size: null, sha256: null, role: 'release-trust' },
  ].filter(item => availableNames === null || availableNames.includes(item.name))
  const entries = [
    ...bom.packages.map(item => ({ name: item.file, size: item.size, sha256: item.sha256, role: 'package' })),
    { name: 'release-bom.json', size: null, sha256: null, role: 'bom' },
    { name: bom.sbom.file, size: bom.sbom.size, sha256: bom.sbom.sha256, role: 'sbom' },
    {
      name: bom.governance.productTemplateScaffold.path,
      size: bom.governance.productTemplateScaffold.size,
      sha256: bom.governance.productTemplateScaffold.sha256,
      role: 'scaffold',
    },
    ...evidenceEntries,
  ].sort((left, right) => compareUtf8Bytes(left.name, right.name))
  const expectedCount = IMMUTABLE_RELEASE_ASSET_COUNT - 2 + evidenceEntries.length
  if (entries.length !== expectedCount || new Set(entries.map(item => item.name)).size !== entries.length) {
    throw new Error('release BOM does not resolve to the writer\'s closed release asset set')
  }
  return entries
}

function exactReleaseAssetBodies(assetBodies, expected) {
  if (!assetBodies || typeof assetBodies !== 'object' || Array.isArray(assetBodies)) {
    throw new Error('immutable release asset byte inventory is missing')
  }
  const actual = Object.keys(assetBodies).sort()
  const names = expected.map(item => item.name)
  if (JSON.stringify(actual) !== JSON.stringify(names)) {
    throw new Error(`immutable release asset byte inventory must contain exactly [${names.join(', ')}]`)
  }
  return assetBodies
}

function releaseSetSha256(expected, digests) {
  const permanentEvidence = new Set([NPM_FINALIZATION_RECEIPT_ASSET, RELEASE_TRUST_PREFLIGHT_ASSET])
  const sixFiles = expected.filter(item => !permanentEvidence.has(item.name))
  if (sixFiles.length !== 6) throw new Error('immutable release does not resolve to the exact six-file BOM release set')
  const canonical = sixFiles.map(item => `${digests.get(item.name)}  ${item.name}\n`).join('')
  return sha256(canonical)
}

function validateReleaseTagAuthorizationIdentity(authorization, expected) {
  exactKeys(authorization, [
    'schemaVersion', 'kind', 'repository', 'tag', 'tagObject', 'commit', 'tree',
    'issuerRegistryDigest', 'policyDigest', 'issuedAt', 'expiresAt', 'nonce',
    'authorizationDigest', 'signatures',
  ], 'release-tag authorization')
  if (authorization.schemaVersion !== 1 || authorization.kind !== 'release-tag-authorization') {
    throw new Error('release-tag authorization kind/version mismatch')
  }
  for (const field of ['repository', 'tag', 'tagObject', 'commit', 'tree']) {
    if (authorization[field] !== expected[field]) throw new Error(`release-tag authorization ${field} mismatch`)
  }
  if (!SHA256_RE.test(authorization.issuerRegistryDigest || '')
    || !SHA256_RE.test(authorization.policyDigest || '')
    || !SHA256_RE.test(authorization.authorizationDigest || '')) {
    throw new Error('release-tag authorization digest binding is invalid')
  }
  canonicalTimestamp(authorization.issuedAt, 'release-tag authorization issuedAt')
  canonicalTimestamp(authorization.expiresAt, 'release-tag authorization expiresAt')
  if (!Array.isArray(authorization.signatures) || authorization.signatures.length < 1) {
    throw new Error('release-tag authorization signatures are missing')
  }
  for (const signature of authorization.signatures) {
    exactKeys(signature, ['signerKeyId', 'subject', 'signature'], 'release-tag authorization signature')
  }
  const statement = { ...authorization }
  delete statement.authorizationDigest
  delete statement.signatures
  if (authorization.authorizationDigest !== sha256(stable(statement))) {
    throw new Error('release-tag authorization digest mismatch')
  }
  return authorization
}

function validateReleaseTrustEvidence(evidence, expected) {
  exactKeys(evidence, [
    'schemaVersion', 'kind', 'repository', 'workflow', 'release', 'releaseTagAuthorization',
    'releaseTagAuthorizationPolicy', 'inventoryDigest', 'desiredDigest', 'observedStateDigest',
    'trust', 'requiredCheckEvidence', 'externalActivationRequirements', 'verifiedAt',
  ], 'release trust preflight evidence')
  if (evidence.schemaVersion !== 3 || evidence.kind !== 'release-trust-preflight'
    || evidence.repository !== expected.repository) {
    throw new Error('release trust preflight identity mismatch')
  }
  exactKeys(evidence.workflow, ['path', 'event', 'runId', 'runAttempt'], 'release trust preflight workflow')
  if (evidence.workflow.path !== TRUSTED_UPGRADE_POLICY.workflow
    || evidence.workflow.event !== 'repository_dispatch'
    || !POSITIVE_INTEGER_RE.test(evidence.workflow.runId || '')
    || !POSITIVE_INTEGER_RE.test(evidence.workflow.runAttempt || '')) {
    throw new Error('release trust preflight workflow identity is invalid')
  }
  exactKeys(evidence.release, ['tag', 'tagObject', 'commit', 'tree', 'verification'], 'release trust preflight Git identity')
  for (const field of ['tag', 'tagObject', 'commit', 'tree']) {
    if (evidence.release[field] !== expected[field]) throw new Error(`release trust preflight ${field} mismatch`)
  }
  exactKeys(evidence.release.verification, ['verified', 'reason', 'verifiedAt'], 'release trust preflight tag verification')
  if (evidence.release.verification.verified !== true || evidence.release.verification.reason !== 'valid') {
    throw new Error('release trust preflight tag signature is not GitHub-verified')
  }
  canonicalTimestamp(evidence.release.verification.verifiedAt, 'release trust preflight tag verifiedAt')
  canonicalTimestamp(evidence.verifiedAt, 'release trust preflight verifiedAt')
  validateReleaseTagAuthorizationIdentity(evidence.releaseTagAuthorization, expected)
  exactKeys(evidence.releaseTagAuthorizationPolicy, ['path', 'sha256'], 'release trust preflight authorization policy')
  if (evidence.releaseTagAuthorizationPolicy.path !== 'infra/governance/release-tag-authorization-policy.json'
    || !SHA256_RE.test(evidence.releaseTagAuthorizationPolicy.sha256 || '')
    || evidence.releaseTagAuthorizationPolicy.sha256 !== evidence.releaseTagAuthorization.policyDigest) {
    throw new Error('release trust preflight authorization policy binding is invalid')
  }
  if (!SHA256_RE.test(evidence.inventoryDigest || '')
    || !SHA256_RE.test(evidence.desiredDigest || '')
    || !SHA256_RE.test(evidence.observedStateDigest || '')) {
    throw new Error('release trust preflight state digests are invalid')
  }
  exactKeys(evidence.trust, ['integrations', 'rulesets', 'requiredChecks', 'environments', 'workflows', 'immutableReleases'], 'release trust preflight trust state')
  if (evidence.trust.immutableReleases !== true
    || !Array.isArray(evidence.trust.integrations) || evidence.trust.integrations.length < 1
    || !Array.isArray(evidence.trust.rulesets) || evidence.trust.rulesets.length < 1
    || !Array.isArray(evidence.trust.requiredChecks) || evidence.trust.requiredChecks.length < 1
    || !Array.isArray(evidence.trust.environments)
    || !Array.isArray(evidence.trust.workflows) || evidence.trust.workflows.length < 1
    || !Array.isArray(evidence.requiredCheckEvidence)
    || evidence.requiredCheckEvidence.length !== evidence.trust.requiredChecks.length) {
    throw new Error('release trust preflight trust/readback evidence is invalid')
  }
  exactKeys(evidence.externalActivationRequirements, ['path', 'sha256'], 'release trust preflight activation requirements')
  if (evidence.externalActivationRequirements.path !== 'infra/governance/external-activation-requirements.json'
    || !SHA256_RE.test(evidence.externalActivationRequirements.sha256 || '')) {
    throw new Error('release trust preflight activation requirements binding is invalid')
  }
  return evidence
}

function validateFinalizationReceipt(receipt, expected) {
  exactKeys(receipt, [
    'schemaVersion', 'state', 'source', 'releaseTrust', 'releaseSetSha256', 'bomSha256',
    'stageReceiptSha256', 'stageRun', 'finalizerRun', 'stagingTag', 'targetTag',
    'targetVersion', 'publishOrder', 'stageIds', 'isolatedTags', 'targetTags',
    'packages', 'certifiedAt', 'updatedAt',
  ], 'npm finalization receipt')
  if (receipt.schemaVersion !== 3 || receipt.state !== 'certified') {
    throw new Error('npm finalization receipt is not a certified schema-3 record')
  }
  exactKeys(receipt.finalizerRun, ['workflow', 'event', 'runId', 'runAttempt'], 'npm finalization receipt finalizer run')
  if (receipt.finalizerRun.workflow !== '.github/workflows/release-finalize.yml'
    || receipt.finalizerRun.event !== 'repository_dispatch'
    || typeof receipt.finalizerRun.runId !== 'string'
    || !POSITIVE_INTEGER_RE.test(receipt.finalizerRun.runId)
    || !Number.isSafeInteger(receipt.finalizerRun.runAttempt)
    || receipt.finalizerRun.runAttempt < 1) {
    throw new Error('npm finalization receipt finalizer run identity is invalid')
  }
  if (expected.expectedFinalizerRun) {
    exactKeys(expected.expectedFinalizerRun, ['workflow', 'event', 'runId', 'runAttempt'], 'expected finalizer run')
    if (expected.expectedFinalizerRun.workflow !== '.github/workflows/release-finalize.yml'
      || expected.expectedFinalizerRun.event !== 'repository_dispatch'
      || typeof expected.expectedFinalizerRun.runId !== 'string'
      || !POSITIVE_INTEGER_RE.test(expected.expectedFinalizerRun.runId)
      || !Number.isSafeInteger(expected.expectedFinalizerRun.runAttempt)
      || expected.expectedFinalizerRun.runAttempt < 1) {
      throw new Error('expected finalizer run identity is invalid')
    }
    const expectedFinalizerRun = {
      workflow: expected.expectedFinalizerRun.workflow,
      event: expected.expectedFinalizerRun.event,
      runId: String(expected.expectedFinalizerRun.runId),
      runAttempt: Number(expected.expectedFinalizerRun.runAttempt),
    }
    const actualFinalizerRun = {
      workflow: receipt.finalizerRun.workflow,
      event: receipt.finalizerRun.event,
      runId: String(receipt.finalizerRun.runId),
      runAttempt: Number(receipt.finalizerRun.runAttempt),
    }
    if (stable(actualFinalizerRun) !== stable(expectedFinalizerRun)) {
      throw new Error('npm finalization receipt belongs to a different finalizer run')
    }
  }
  exactKeys(receipt.source, ['repository', 'tag', 'gitHead', 'gitTree'], 'npm finalization receipt source')
  const source = {
    repository: expected.repository,
    tag: expected.tag,
    gitHead: expected.commit,
    gitTree: expected.tree,
  }
  if (stable(receipt.source) !== stable(source)) throw new Error('npm finalization receipt source identity mismatch')
  exactKeys(receipt.releaseTrust, ['authorizationDigest', 'evidenceSha256', 'evidenceFileSha256', 'tagObject', 'artifact'], 'npm finalization receipt release trust')
  exactKeys(receipt.releaseTrust.artifact, ['name', 'digest', 'workflow'], 'npm finalization receipt release trust artifact')
  exactKeys(receipt.releaseTrust.artifact.workflow, ['path', 'event', 'headBranch', 'headSha', 'runId', 'runAttempt'], 'npm finalization receipt release trust workflow')
  const trustWorkflow = receipt.releaseTrust.artifact.workflow
  if (trustWorkflow.path !== expected.trust.workflow.path
    || trustWorkflow.event !== expected.trust.workflow.event
    || trustWorkflow.headBranch !== 'main'
    || trustWorkflow.headSha !== expected.commit
    || String(trustWorkflow.runId) !== expected.trust.workflow.runId
    || String(trustWorkflow.runAttempt) !== expected.trust.workflow.runAttempt
    || !/^sha256:[a-f0-9]{64}$/.test(receipt.releaseTrust.artifact.digest || '')) {
    throw new Error('npm finalization receipt release trust workflow/artifact identity mismatch')
  }
  if (receipt.releaseTrust.tagObject !== expected.tagObject
    || receipt.releaseTrust.authorizationDigest !== expected.trust.releaseTagAuthorization.authorizationDigest
    || receipt.releaseTrust.evidenceSha256 !== sha256(stable(expected.trust))
    || receipt.releaseTrust.evidenceFileSha256 !== expected.trustFileSha256) {
    throw new Error('npm finalization receipt and release trust evidence do not bind the same exact tag object/bytes')
  }
  if (receipt.bomSha256 !== expected.bomSha256 || receipt.releaseSetSha256 !== expected.releaseSetSha256) {
    throw new Error('npm finalization receipt does not bind the exact BOM/six-file release set')
  }
  if (receipt.targetVersion !== expected.version || receipt.targetTag !== expected.bom.npmDistTag
    || stable(receipt.publishOrder) !== stable(expected.bom.publishOrder)) {
    throw new Error('npm finalization receipt release train differs from the BOM')
  }
  const ordered = expected.bom.publishOrder.map(name => {
    const item = expected.bom.packages.find(candidate => candidate.name === name)
    return { name: item.name, version: item.version, integrity: item.integrity, shasum: item.shasum }
  })
  if (stable(receipt.packages) !== stable(ordered)) throw new Error('npm finalization receipt package identities differ from the BOM')
  for (const field of ['stageIds', 'isolatedTags', 'targetTags']) {
    if (!receipt[field] || typeof receipt[field] !== 'object' || Array.isArray(receipt[field])
      || stable(Object.keys(receipt[field]).sort()) !== stable([...expected.bom.publishOrder].sort())) {
      throw new Error(`npm finalization receipt ${field} package set is incomplete`)
    }
  }
  canonicalTimestamp(receipt.certifiedAt, 'npm finalization receipt certifiedAt')
  canonicalTimestamp(receipt.updatedAt, 'npm finalization receipt updatedAt')
  return receipt
}

export function validateUpgradeTrustPolicy(policy) {
  const keys = [
    'schemaVersion', 'repository', 'workflow', 'workflowRef', 'provenancePredicate', 'builderId',
    'immutableRelease', 'releaseBomAsset', 'upgradePackages', 'releasePackages',
  ]
  exactKeys(policy, keys, 'upgrade trust policy')
  for (const key of keys.filter((name) => !['upgradePackages', 'releasePackages'].includes(name))) {
    if (policy[key] !== TRUSTED_UPGRADE_POLICY[key]) {
      throw new Error(`upgrade trust policy ${key} must be ${JSON.stringify(TRUSTED_UPGRADE_POLICY[key])}`)
    }
  }
  for (const key of ['upgradePackages', 'releasePackages']) {
    if (!Array.isArray(policy[key]) || JSON.stringify(policy[key]) !== JSON.stringify(TRUSTED_UPGRADE_POLICY[key])) {
      throw new Error(`upgrade trust policy ${key} does not match the trusted closed package set`)
    }
  }
  return policy
}

export function validateProvenanceStatement(statement, expected) {
  if (!validSha512Sri(expected.integrity)) throw new Error(`${expected.name}: expected npm SHA-512 SRI is invalid`)
  if (!COMMIT_RE.test(expected.gitHead || '')) throw new Error(`${expected.name}: expected release commit is invalid`)
  if (statement?._type !== 'https://in-toto.io/Statement/v1') throw new Error(`${expected.name}: invalid provenance statement type`)
  if (statement.predicateType !== PROVENANCE_TYPE) throw new Error(`${expected.name}: missing SLSA provenance v1 predicate`)
  const expectedPurl = `pkg:npm/${encodeURIComponent(expected.name).replace('%2F', '/')}@${expected.version}`
  const expectedSha512 = Buffer.from(expected.integrity.slice('sha512-'.length), 'base64').toString('hex')
  const subjects = (statement.subject || []).filter((item) => item?.name === expectedPurl)
  if (subjects.length !== 1 || subjects[0].digest?.sha512 !== expectedSha512) {
    throw new Error(`${expected.name}: provenance subject does not bind the exact npm SHA-512`)
  }
  const workflowPath = expected.workflow || TRUSTED_UPGRADE_POLICY.workflow
  const workflowRef = expected.workflowRef || RELEASE_SUPPLY_CHAIN.npmProvenance.workflowRef
  const workflow = statement.predicate?.buildDefinition?.externalParameters?.workflow
  if (workflow?.repository !== `https://github.com/${expected.repository}`
    || workflow?.path !== workflowPath
    || workflow?.ref !== workflowRef) {
    throw new Error(`${expected.name}: provenance workflow identity is not the exact trusted release workflow`)
  }
  const dependencies = (statement.predicate?.buildDefinition?.resolvedDependencies || []).filter(
    (item) => item?.digest?.gitCommit === expected.gitHead,
  )
  if (dependencies.length !== 1
    || dependencies[0].uri !== `git+https://github.com/${expected.repository}@${workflowRef}`) {
    throw new Error(`${expected.name}: provenance does not bind the exact protected-main release commit`)
  }
  if (statement.predicate?.runDetails?.builder?.id !== (expected.builderId || GITHUB_ACTIONS_BUILDER)) {
    throw new Error(`${expected.name}: provenance builder is not GitHub-hosted Actions`)
  }
  return statement
}

function collectVerifiedPayloads(value, payloads, visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return
  visited.add(value)
  if (
    typeof value.dsseEnvelope?.payload === 'string'
    && value.dsseEnvelope?.payloadType === 'application/vnd.in-toto+json'
    && Array.isArray(value.dsseEnvelope?.signatures)
    && value.dsseEnvelope.signatures.length > 0
    && value.verificationMaterial
  ) payloads.add(value.dsseEnvelope.payload)
  if (Array.isArray(value)) {
    for (const item of value) collectVerifiedPayloads(item, payloads, visited)
  } else {
    for (const item of Object.values(value)) collectVerifiedPayloads(item, payloads, visited)
  }
}

export function verifiedProvenanceStatement(auditReport, expected) {
  if (!auditReport || !Array.isArray(auditReport.invalid) || !Array.isArray(auditReport.missing)) {
    throw new Error('npm signature audit JSON has an invalid closed result shape')
  }
  if (auditReport.invalid.length || auditReport.missing.length) {
    throw new Error('npm signature audit contains invalid or missing registry evidence')
  }
  if (!Array.isArray(auditReport.verified)) {
    throw new Error('npm signature audit lacks --json verified provenance bundles')
  }
  const matches = auditReport.verified.filter((item) => item?.name === expected.name && item?.version === expected.version)
  if (matches.length !== 1) throw new Error(`${expected.name}@${expected.version}: expected exactly one verified npm attestation entry`)
  if (matches[0].registry !== 'https://registry.npmjs.org/') {
    throw new Error(`${expected.name}@${expected.version}: verified attestation came from a non-canonical registry`)
  }
  const payloads = new Set()
  collectVerifiedPayloads(matches[0].attestationBundles, payloads)
  const statements = []
  for (const payload of payloads) {
    let statement
    try { statement = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) }
    catch { throw new Error(`${expected.name}@${expected.version}: verified DSSE payload is invalid JSON`) }
    if (statement.predicateType === PROVENANCE_TYPE) statements.push(statement)
  }
  if (statements.length !== 1) {
    throw new Error(`${expected.name}@${expected.version}: expected exactly one verified SLSA provenance statement`)
  }
  return statements[0]
}

function canonicalDownloadAsset(url, repository, tag, assetName) {
  let parsed
  try { parsed = new URL(url) } catch { return false }
  if (parsed.origin !== 'https://github.com' || parsed.search || parsed.hash) return false
  let path
  try { path = decodeURIComponent(parsed.pathname) } catch { return false }
  return path === `/${repository}/releases/download/${tag}/${assetName}`
}

function expectedBomSupplyChain(policy) {
  return {
    npmProvenance: {
      predicateType: policy.provenancePredicate,
      builderId: policy.builderId,
      workflow: policy.workflow,
      workflowRef: policy.workflowRef,
    },
    immutableGitHubRelease: {
      required: policy.immutableRelease,
      bomAsset: policy.releaseBomAsset,
    },
  }
}

export function validateImmutableReleaseSnapshot({
  release,
  assetBodies,
  tagIdentity,
  packages,
  version,
  policy,
  expectedFinalizerRun = null,
  // Lane selector, fail-closed by default:false = high-assurance(governance anchor /
  // enterprise finalizer)— GitHub-verified signed annotated tag + full 8-asset closure required。
  // true = ordinary consumer upgrade lane(tag→commit→tree + BOM + SLSA provenance;
  // 簽章與 finalizer evidence assets 是 opt-in 加值)。Ordinary 入口必須顯式傳 true。
  ordinaryRelease = false,
}) {
  validateUpgradeTrustPolicy(policy)
  const tag = `v${version}`
  if (!release
    || release.tag_name !== tag
    || release.name !== tag
    || release.draft !== false
    || release.immutable !== true
    || Boolean(release.prerelease) !== tag.includes('-')) {
    throw new Error(`GitHub Release ${tag} is missing, draft, mutable, or has the wrong exact identity`)
  }
  exactKeys(tagIdentity, ['ref', 'tag', 'tagObject', 'commit', 'tree', 'verification'], 'verified release tag identity')
  if (tagIdentity.ref !== `refs/tags/${tag}` || tagIdentity.tag !== tag) {
    throw new Error(`GitHub release tag identity does not bind the exact name ${tag}`)
  }
  for (const [field, value] of Object.entries({
    tagObject: tagIdentity.tagObject,
    commit: tagIdentity.commit,
    tree: tagIdentity.tree,
  })) {
    if (!COMMIT_RE.test(value || '')) throw new Error(`GitHub release ${field} is not a full Git object ID`)
  }
  exactKeys(tagIdentity.verification, [
    'verified', 'reason', 'verifiedAt', 'signatureSha256', 'payloadSha256',
  ], 'verified release tag signature')
  const identitySigned = tagIdentity.verification.verified === true
    && tagIdentity.verification.reason === 'valid'
    && SHA256_RE.test(tagIdentity.verification.signatureSha256 || '')
    && SHA256_RE.test(tagIdentity.verification.payloadSha256 || '')
  const identityUnsignedOrdinary = ordinaryRelease
    && tagIdentity.verification.verified === false
    && ['unsigned', 'unknown_signature_type'].includes(tagIdentity.verification.reason)
    && tagIdentity.verification.verifiedAt === null
    && tagIdentity.verification.signatureSha256 === null
    && tagIdentity.verification.payloadSha256 === null
  if (!identitySigned && !identityUnsignedOrdinary) {
    throw new Error(ordinaryRelease
      ? 'release tag identity verification state is invalid'
      : 'release tag identity is not a direct GitHub-verified signed annotated tag object')
  }
  if (identitySigned) canonicalTimestamp(tagIdentity.verification.verifiedAt, 'GitHub release tag verifiedAt')

  if (!assetBodies || typeof assetBodies !== 'object' || Array.isArray(assetBodies)
    || !Object.prototype.hasOwnProperty.call(assetBodies, policy.releaseBomAsset)) {
    throw new Error(`immutable release asset byte inventory is missing ${policy.releaseBomAsset}`)
  }
  const bomBody = Buffer.isBuffer(assetBodies[policy.releaseBomAsset])
    ? assetBodies[policy.releaseBomAsset]
    : Buffer.from(String(assetBodies[policy.releaseBomAsset] || ''))
  const bom = parseJsonAsset(bomBody, `GitHub immutable release ${tag} BOM`)
  validateReleaseBom(bom, { requireSbom: true })
  const releaseAssets = releaseAssetMap(release, `GitHub immutable release ${tag}`)
  // High-assurance lane 要求完整 8-asset closure(finalizer evidence 不可缺);
  // ordinary lane 才允許 evidence assets 依實際存在過濾。
  const expectedAssets = bomReleaseAssets(bom, ordinaryRelease ? [...releaseAssets.keys()] : null)
  exactReleaseAssetBodies(assetBodies, expectedAssets)
  const expectedNames = expectedAssets.map(item => item.name)
  if (releaseAssets.size !== expectedAssets.length
    || JSON.stringify([...releaseAssets.keys()].sort()) !== JSON.stringify(expectedNames)) {
    throw new Error(`GitHub immutable release ${tag} must contain exactly the writer's closed release asset set [${expectedNames.join(', ')}]`)
  }

  const assetDigests = new Map()
  const verifiedAssets = []
  for (const expected of expectedAssets) {
    const asset = releaseAssets.get(expected.name)
    const body = Buffer.isBuffer(assetBodies[expected.name])
      ? assetBodies[expected.name]
      : Buffer.from(String(assetBodies[expected.name] || ''))
    if (!asset || !POSITIVE_INTEGER_RE.test(String(asset.id ?? ''))
      || asset.state !== 'uploaded'
      || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')
      || !canonicalDownloadAsset(asset.browser_download_url, policy.repository, tag, expected.name)
      || !Number.isSafeInteger(asset.size) || asset.size <= 0
      || asset.size !== body.length || asset.digest !== `sha256:${sha256(body)}`) {
      throw new Error(`GitHub immutable release ${tag} asset ${expected.name} failed exact metadata/byte readback`)
    }
    const digest = asset.digest.slice('sha256:'.length)
    if ((expected.size !== null && asset.size !== expected.size)
      || (expected.sha256 !== null && digest !== expected.sha256)) {
      throw new Error(`GitHub immutable release ${tag} asset ${expected.name} differs from the release BOM`)
    }
    assetDigests.set(expected.name, digest)
    verifiedAssets.push({ id: String(asset.id), name: expected.name, digest: asset.digest, size: asset.size })
  }

  const bomSha256 = assetDigests.get(policy.releaseBomAsset)
  if (bom.releaseVersion !== version) throw new Error(`release BOM identity does not match ${version}`)
  if (bom.source?.repository !== policy.repository
    || bom.source?.repositoryUrl !== `git+https://github.com/${policy.repository}.git`
    || bom.source?.tag !== tag
    || bom.source?.gitCommit !== tagIdentity.commit
    || bom.source?.gitTree !== tagIdentity.tree) {
    throw new Error('release BOM does not bind the exact trusted repository, tag object, commit, and tree')
  }
  if (stable(bom.supplyChain) !== stable(expectedBomSupplyChain(policy))) {
    throw new Error('release BOM supply-chain policy does not match the trusted workflow/immutable-release contract')
  }

  const scaffoldBinding = bom.governance.productTemplateScaffold
  const scaffoldBytes = Buffer.isBuffer(assetBodies[PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET])
    ? assetBodies[PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET]
    : Buffer.from(String(assetBodies[PRODUCT_TEMPLATE_SCAFFOLD_LOCK_ASSET] || ''))
  let scaffoldLock
  try { scaffoldLock = validateProductTemplateScaffoldLock(JSON.parse(scaffoldBytes.toString('utf8'))) }
  catch (error) { throw new Error(`GitHub immutable release ${tag} scaffold lock is invalid: ${error.message}`) }
  if (scaffoldLock.schemaVersion !== scaffoldBinding.schemaVersion
    || scaffoldLock.releaseVersion !== scaffoldBinding.releaseVersion
    || scaffoldLock.staticTreeSha256 !== scaffoldBinding.staticTreeSha256
    || scaffoldLock.publishedPathCount !== scaffoldBinding.publishedPathCount) {
    throw new Error(`GitHub immutable release ${tag} scaffold-lock inventory differs from the release BOM`)
  }

  if (!Array.isArray(bom.packages) || bom.packages.length !== policy.releasePackages.length) {
    throw new Error('release BOM package set is incomplete')
  }
  const names = bom.packages.map((item) => item?.name).sort()
  if (new Set(names).size !== names.length || JSON.stringify(names) !== JSON.stringify([...policy.releasePackages].sort())) {
    throw new Error('release BOM package set differs from the trusted release train')
  }
  for (const item of bom.packages) {
    if (item.version !== version || !validSha512Sri(item.integrity)) throw new Error(`${item.name}: release BOM npm identity is invalid`)
  }
  for (const expected of packages) {
    const item = bom.packages.find((candidate) => candidate.name === expected.name)
    if (!item || item.version !== expected.version || item.integrity !== expected.integrity) {
      throw new Error(`${expected.name}: npm SRI does not match immutable GitHub Release BOM readback`)
    }
  }

  const exactReleaseSetSha256 = releaseSetSha256(expectedAssets, assetDigests)
  const hasTrustAsset = Object.prototype.hasOwnProperty.call(assetBodies, RELEASE_TRUST_PREFLIGHT_ASSET)
  const hasReceiptAsset = Object.prototype.hasOwnProperty.call(assetBodies, NPM_FINALIZATION_RECEIPT_ASSET)
  if (hasReceiptAsset && !hasTrustAsset) {
    throw new Error('finalization receipt requires its paired release trust evidence asset')
  }
  let trust = null
  if (hasTrustAsset) {
    const trustBytes = Buffer.isBuffer(assetBodies[RELEASE_TRUST_PREFLIGHT_ASSET])
      ? assetBodies[RELEASE_TRUST_PREFLIGHT_ASSET]
      : Buffer.from(String(assetBodies[RELEASE_TRUST_PREFLIGHT_ASSET] || ''))
    trust = validateReleaseTrustEvidence(
      parseJsonAsset(trustBytes, RELEASE_TRUST_PREFLIGHT_ASSET),
      {
        repository: policy.repository,
        tag,
        tagObject: tagIdentity.tagObject,
        commit: tagIdentity.commit,
        tree: tagIdentity.tree,
      },
    )
  }
  if (hasReceiptAsset) {
    const receiptBytes = Buffer.isBuffer(assetBodies[NPM_FINALIZATION_RECEIPT_ASSET])
      ? assetBodies[NPM_FINALIZATION_RECEIPT_ASSET]
      : Buffer.from(String(assetBodies[NPM_FINALIZATION_RECEIPT_ASSET] || ''))
    validateFinalizationReceipt(parseJsonAsset(receiptBytes, NPM_FINALIZATION_RECEIPT_ASSET), {
      repository: policy.repository,
      tag,
      tagObject: tagIdentity.tagObject,
      commit: tagIdentity.commit,
      tree: tagIdentity.tree,
      version,
      bom,
      bomSha256,
      releaseSetSha256: exactReleaseSetSha256,
      trust,
      trustFileSha256: assetDigests.get(RELEASE_TRUST_PREFLIGHT_ASSET),
      expectedFinalizerRun,
    })
  }
  return {
    bom,
    bomSha256,
    gitCommit: tagIdentity.commit,
    gitTree: tagIdentity.tree,
    tag,
    tagObject: tagIdentity.tagObject,
    tagVerification: { ...tagIdentity.verification },
    releaseSetSha256: exactReleaseSetSha256,
    finalizationReceiptSha256: assetDigests.get(NPM_FINALIZATION_RECEIPT_ASSET) ?? null,
    releaseTrustEvidenceSha256: assetDigests.get(RELEASE_TRUST_PREFLIGHT_ASSET) ?? null,
    externalActivationRequirementsSha256: trust ? trust.externalActivationRequirements.sha256 : null,
    assetDigest: `sha256:${bomSha256}`,
    assetSize: bomBody.length,
    assets: verifiedAssets,
  }
}

function githubHeaders(token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function fetchOk(fetchImpl, url, options, label) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), ...options })
  if (!response?.ok) throw new Error(`${label} readback failed with HTTP ${response?.status ?? '<unknown>'}`)
  return response
}

export async function resolveImmutableReleaseSnapshot({
  repository,
  tag,
  assetName,
  fetchImpl = fetch,
  token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
  // 同 validateImmutableReleaseSnapshot:false = 高保證車道(簽章 + 8-asset 全集必要),
  // true = ordinary consumer 車道。預設 fail-closed。
  ordinaryRelease = false,
}) {
  const apiBase = `https://api.github.com/repos/${repository}`
  if (assetName !== TRUSTED_UPGRADE_POLICY.releaseBomAsset) {
    throw new Error(`immutable release resolver requires ${TRUSTED_UPGRADE_POLICY.releaseBomAsset}`)
  }
  const releaseResponse = await fetchOk(
    fetchImpl,
    `${apiBase}/releases/tags/${encodeURIComponent(tag)}`,
    { headers: githubHeaders(token) },
    `GitHub Release ${tag}`,
  )
  const release = await releaseResponse.json()
  const releaseAssets = releaseAssetMap(release, `GitHub Release ${tag}`)
  const asset = releaseAssets.get(assetName)
  if (!asset?.browser_download_url || !canonicalDownloadAsset(asset.browser_download_url, repository, tag, assetName)) {
    throw new Error(`GitHub Release ${tag} is missing ${assetName} at its canonical download URL`)
  }
  const bomResponse = await fetchOk(
    fetchImpl,
    asset.browser_download_url,
    { headers: { Accept: 'application/octet-stream' } },
    `GitHub Release ${tag} ${assetName}`,
  )
  const bomBody = Buffer.from(await bomResponse.arrayBuffer())
  const bom = parseJsonAsset(bomBody, `GitHub Release ${tag} ${assetName}`)
  validateReleaseBom(bom, { requireSbom: true })
  if (bom.source?.repository !== repository || bom.source?.tag !== tag) {
    throw new Error(`GitHub Release ${tag} BOM repository/tag identity mismatch`)
  }
  const expectedAssets = bomReleaseAssets(bom, ordinaryRelease ? [...releaseAssets.keys()] : null)
  const expectedNames = expectedAssets.map(item => item.name)
  if (releaseAssets.size !== expectedAssets.length
    || JSON.stringify([...releaseAssets.keys()].sort()) !== JSON.stringify(expectedNames)) {
    throw new Error(`GitHub Release ${tag} does not contain the writer's exact release asset set`)
  }
  const assetBodies = { [assetName]: bomBody }
  for (const expected of expectedAssets) {
    if (expected.name === assetName) continue
    const item = releaseAssets.get(expected.name)
    if (!item?.browser_download_url
      || !canonicalDownloadAsset(item.browser_download_url, repository, tag, expected.name)) {
      throw new Error(`GitHub Release ${tag} asset ${expected.name} has no canonical download URL`)
    }
    const response = await fetchOk(
      fetchImpl,
      item.browser_download_url,
      { headers: { Accept: 'application/octet-stream' } },
      `GitHub Release ${tag} ${expected.name}`,
    )
    assetBodies[expected.name] = Buffer.from(await response.arrayBuffer())
  }

  const encodedTag = encodeURIComponent(tag)
  const referenceResponse = await fetchOk(
    fetchImpl,
    `${apiBase}/git/ref/tags/${encodedTag}`,
    { headers: githubHeaders(token) },
    `GitHub tag ${tag}`,
  )
  const reference = await referenceResponse.json()
  const referenceType = reference?.object?.type
  if (!reference
    || typeof reference !== 'object'
    || Array.isArray(reference)
    || reference.ref !== `refs/tags/${tag}`
    || !['commit', 'tag'].includes(referenceType)
    || !COMMIT_RE.test(reference.object?.sha || '')) {
    throw new Error(`GitHub tag ${tag} must return one exact lightweight commit ref or annotated tag ref`)
  }

  const annotated = referenceType === 'tag'
  if (!annotated && !ordinaryRelease) {
    throw new Error(`GitHub tag ${tag} high-assurance lane requires a directly verified signed annotated tag object`)
  }
  const tagObjectSha = reference.object.sha
  let commitSha
  let signedAndValid = false
  let verification = null
  if (annotated) {
    const tagObjectResponse = await fetchOk(
      fetchImpl,
      `${apiBase}/git/tags/${tagObjectSha}`,
      { headers: githubHeaders(token) },
      `GitHub annotated tag ${tag}`,
    )
    const tagObject = await tagObjectResponse.json()
    if (tagObject?.sha !== tagObjectSha
      || tagObject?.tag !== tag
      || tagObject?.object?.type !== 'commit'
      || !COMMIT_RE.test(tagObject.object.sha || '')) {
      throw new Error(`GitHub tag ${tag} annotated tag object/name/direct commit binding is invalid`)
    }
    commitSha = tagObject.object.sha
    verification = tagObject.verification
    // An annotated ordinary release accepts signed-valid or explicitly unsigned tag objects.
    // A broken signature claim (bad_signature etc.) still fails closed.
    signedAndValid = verification?.verified === true && verification?.reason === 'valid'
    const unsignedOrdinary = ordinaryRelease
      && verification?.verified === false
      && ['unsigned', 'unknown_signature_type'].includes(verification?.reason)
    if (!signedAndValid && !unsignedOrdinary) {
      throw new Error(`GitHub tag ${tag} is not an acceptable direct annotated tag object:${verification?.reason || '<missing>'}`)
    }
    if (signedAndValid) {
      if (typeof verification.signature !== 'string' || !verification.signature
        || typeof verification.payload !== 'string' || !verification.payload) {
        throw new Error(`GitHub tag ${tag} is not a directly verified signed annotated tag object`)
      }
      canonicalTimestamp(verification.verified_at, `GitHub tag ${tag} verified_at`)
    }
  } else {
    // The formal release orchestrator publishes one exact lightweight tag. Its authority is the
    // ref → commit → tree binding plus the immutable BOM and npm SLSA provenance; no tag object
    // exists to carry a signature, so tagObject intentionally equals the direct commit object.
    commitSha = tagObjectSha
  }
  const confirmedReferenceResponse = await fetchOk(
    fetchImpl,
    `${apiBase}/git/ref/tags/${encodedTag}`,
    { headers: githubHeaders(token) },
    `GitHub tag ${tag} confirmation`,
  )
  const confirmedReference = await confirmedReferenceResponse.json()
  if (!confirmedReference
    || typeof confirmedReference !== 'object'
    || Array.isArray(confirmedReference)
    || confirmedReference.ref !== reference.ref
    || confirmedReference?.object?.type !== referenceType
    || confirmedReference.object.sha !== tagObjectSha) {
    throw new Error(`GitHub tag ${tag} changed while its exact object binding was being verified`)
  }
  const commitResponse = await fetchOk(
    fetchImpl,
    `${apiBase}/git/commits/${commitSha}`,
    { headers: githubHeaders(token) },
    `GitHub release commit ${commitSha}`,
  )
  const commit = await commitResponse.json()
  if (commit?.sha !== commitSha || !COMMIT_RE.test(commit?.tree?.sha || '')) {
    throw new Error(`GitHub release commit ${commitSha} has no exact tree identity`)
  }
  return {
    release,
    assetBodies,
    tagIdentity: {
      ref: reference.ref,
      tag,
      tagObject: tagObjectSha,
      commit: commitSha,
      tree: commit.tree.sha,
      verification: !annotated
        ? {
          verified: false,
          reason: 'unsigned',
          verifiedAt: null,
          signatureSha256: null,
          payloadSha256: null,
        }
        : signedAndValid
        ? {
          verified: true,
          reason: 'valid',
          verifiedAt: verification.verified_at,
          signatureSha256: sha256(verification.signature),
          payloadSha256: sha256(verification.payload),
        }
        : {
          verified: false,
          reason: verification.reason,
          verifiedAt: null,
          signatureSha256: null,
          payloadSha256: null,
        },
    },
  }
}

export async function verifyUpgradeProvenance({ auditReport, packages, version, policy, releaseLookup = resolveImmutableReleaseSnapshot, ordinaryRelease = false }) {
  validateUpgradeTrustPolicy(policy)
  if (!Array.isArray(packages) || packages.length !== policy.upgradePackages.length) {
    throw new Error('upgrade provenance requires the exact trusted package set')
  }
  const names = packages.map((item) => item?.name)
  if (JSON.stringify(names) !== JSON.stringify(policy.upgradePackages)) {
    throw new Error('upgrade provenance package order/set differs from the trusted policy')
  }
  for (const item of packages) {
    if (item.version !== version || !validSha512Sri(item.integrity)) throw new Error(`${item.name}: upgrade npm identity is invalid`)
  }
  const snapshot = await releaseLookup({
    repository: policy.repository,
    tag: `v${version}`,
    assetName: policy.releaseBomAsset,
    ordinaryRelease,
  })
  const immutable = validateImmutableReleaseSnapshot({ ...snapshot, packages, version, policy, ordinaryRelease })
  for (const item of packages) {
    const statement = verifiedProvenanceStatement(auditReport, item)
    validateProvenanceStatement(statement, {
      ...item,
      repository: policy.repository,
      workflow: policy.workflow,
      workflowRef: policy.workflowRef,
      builderId: policy.builderId,
      tag: immutable.tag,
      gitHead: immutable.gitCommit,
    })
  }
  return {
    repository: policy.repository,
    workflow: policy.workflow,
    tag: immutable.tag,
    tagObject: immutable.tagObject,
    gitCommit: immutable.gitCommit,
    gitTree: immutable.gitTree,
    bomSha256: immutable.bomSha256,
    releaseAssetDigest: immutable.assetDigest,
    releaseSetSha256: immutable.releaseSetSha256,
    finalizationReceiptSha256: immutable.finalizationReceiptSha256,
    releaseTrustEvidenceSha256: immutable.releaseTrustEvidenceSha256,
    packages: packages.map((item) => ({ name: item.name, version: item.version, integrity: item.integrity })),
  }
}
