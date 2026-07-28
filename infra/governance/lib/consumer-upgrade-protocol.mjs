import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const LIB_ROOT = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let Ajv2020
export const DEFAULT_CONSUMER_UPGRADE_PROTOCOL_PATH = resolve(LIB_ROOT, '../consumer-upgrade-protocol.json')
export const DEFAULT_CONSUMER_UPGRADE_PROTOCOL_SCHEMA_PATH = resolve(LIB_ROOT, '../schemas/consumer-upgrade-protocol.schema.json')
export const DEFAULT_CONSUMER_UPGRADE_PROTOCOL_IMPLEMENTATION_PATH = fileURLToPath(import.meta.url)

const SHA256 = /^[a-f0-9]{64}$/
const GIT_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]))
  return value
}

function stable(value) {
  return JSON.stringify(stableValue(value))
}

function exactKeys(value, keys, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant(stable(Object.keys(value).sort()) === stable([...keys].sort()), `${label} has an invalid or open shape`)
}

function canonicalDate(value, label) {
  const parsed = new Date(value)
  invariant(typeof value === 'string' && Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, `${label} must be canonical UTC`)
  return parsed
}

function ajv2020() {
  if (!Ajv2020) {
    const loaded = require('ajv/dist/2020.js')
    Ajv2020 = loaded.default ?? loaded
  }
  return Ajv2020
}

export function loadConsumerUpgradeProtocol(
  path = DEFAULT_CONSUMER_UPGRADE_PROTOCOL_PATH,
  schemaPath = DEFAULT_CONSUMER_UPGRADE_PROTOCOL_SCHEMA_PATH,
  implementationPath = DEFAULT_CONSUMER_UPGRADE_PROTOCOL_IMPLEMENTATION_PATH,
) {
  const protocolBytes = readFileSync(resolve(path))
  const protocol = JSON.parse(protocolBytes.toString('utf8'))
  const schemaBytes = readFileSync(resolve(schemaPath))
  const implementationBytes = readFileSync(resolve(implementationPath))
  const schema = JSON.parse(schemaBytes.toString('utf8'))
  const Validate = ajv2020()
  const validate = new Validate({ allErrors: true, strict: true }).compile(schema)
  invariant(validate(protocol), `consumer upgrade protocol schema validation failed: ${validate.errors?.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`)
  return { protocol, protocolBytes, schemaBytes, implementationBytes }
}

export function protocolSourceDigests(loaded) {
  exactKeys(loaded, ['implementationBytes', 'protocol', 'protocolBytes', 'schemaBytes'], 'loaded consumer upgrade protocol')
  const digest = bytes => createHash('sha256').update(bytes).digest('hex')
  return Object.freeze({
    specificationSha256: digest(loaded.protocolBytes),
    schemaSha256: digest(loaded.schemaBytes),
    implementationSha256: digest(loaded.implementationBytes),
  })
}

export function upgradeProfile(protocol, profileId) {
  const profile = protocol?.profiles?.[profileId]
  invariant(profile, `unknown consumer upgrade protocol profile ${profileId || '<missing>'}`)
  return profile
}

export function deriveConsumerUpgradeProfileFacts(protocol) {
  invariant(protocol?.schemaVersion === 2 && protocol.kind === 'consumer-upgrade-protocol', 'consumer upgrade protocol facts require the canonical protocol shape')
  const profileIds = Object.keys(protocol.profiles ?? {}).sort()
  invariant(profileIds.length > 0, 'consumer upgrade protocol facts require profiles')
  const profiles = Object.fromEntries(profileIds.map(profileId => {
    const profile = upgradeProfile(protocol, profileId)
    return [profileId, Object.freeze({
      acceptedBootstrapBindingRequired: profile.acceptedBootstrapBindingRequired,
      controlPlaneUpdateBindingRequired: profile.controlPlaneUpdateBindingRequired,
      postAcceptanceProfile: profile.postAcceptanceProfile,
      postControlPlaneUpdateProfile: profile.postControlPlaneUpdateProfile,
    })]
  }))
  const lineage = start => {
    const pending = [start]
    const visited = new Set()
    while (pending.length > 0) {
      const profileId = pending.shift()
      invariant(profiles[profileId], `consumer upgrade protocol lineage references unknown profile ${profileId}`)
      if (visited.has(profileId)) continue
      visited.add(profileId)
      const profile = profiles[profileId]
      for (const next of [profile.postAcceptanceProfile, profile.postControlPlaneUpdateProfile]) {
        if (next !== null) pending.push(next)
      }
    }
    return Object.freeze([...visited].sort())
  }
  return Object.freeze({
    profileIds: Object.freeze(profileIds),
    profiles: Object.freeze(profiles),
    newSnapshotLineage: lineage('new-snapshot-v2'),
    legacyBootstrapLineage: lineage('legacy-bootstrap-v2'),
  })
}

export function protocolLockProjection(protocol, sourceDigests) {
  exactKeys(sourceDigests, ['implementationSha256', 'schemaSha256', 'specificationSha256'], 'consumer upgrade protocol source digests')
  for (const [name, value] of Object.entries(sourceDigests)) invariant(SHA256.test(value || ''), `consumer upgrade protocol ${name} is invalid`)
  return Object.freeze({
    ...structuredClone(protocol.lockProjection),
    ...sourceDigests,
  })
}

export function validateProtocolLock(value, protocol, sourceDigests) {
  const expected = protocolLockProjection(protocol, sourceDigests)
  invariant(stable(value) === stable(expected), 'consumer governance lock does not bind the exact protected-base reconstruction protocol')
  return expected
}

export function validateConsumerBootstrapReadback(value, {
  repository,
  candidateRelease,
  releaseBom,
  protocol,
  sourceDigests,
} = {}) {
  exactKeys(value, [
    'schemaVersion', 'kind', 'repositoryId', 'repository', 'protocolId', 'protocolSpecificationSha256',
    'protocolSchemaSha256', 'protocolImplementationSha256',
    'bootstrapMode', 'baseDefaultBranchHeadSha', 'pullRequestNumber', 'pullRequestHeadSha',
    'mergeCommitSha', 'mergeTreeSha', 'defaultBranchHeadSha', 'candidateSourceCommit', 'candidateSourceTree',
    'version', 'consumerLockSha256', 'forkCorpusLockSha256', 'templateStaticTreeSha256',
    'fullSnapshotPlanDigest', 'materializedGovernanceTreeSha256', 'requiredChecksDigest',
    'reviewAuthorization', 'legacySelfUpdateUsed', 'candidateCodeExecuted', 'eligible', 'mergedAt', 'observedAt',
  ], 'consumer bootstrap readback')
  invariant(value.schemaVersion === 1 && value.kind === 'consumer-governance-bootstrap-readback', 'consumer bootstrap readback identity is invalid')
  const assignedProfile = upgradeProfile(protocol, repository?.upgradeProtocolProfile)
  invariant(
    repository?.role === 'product-consumer'
      && assignedProfile.bootstrapRequired === true
      && assignedProfile.entryMode === 'one-time-reviewed-full-snapshot-pr'
      && assignedProfile.bootstrapEvidenceContract === 'consumer-governance-bootstrap-readback-v1',
    'consumer bootstrap readback repository is not an inventory-declared legacy product consumer',
  )
  invariant(value.repositoryId === repository.id && value.repository === repository.github, 'consumer bootstrap readback targets the wrong repository')
  exactKeys(sourceDigests, ['implementationSha256', 'schemaSha256', 'specificationSha256'], 'consumer bootstrap protocol source digests')
  invariant(
    value.protocolId === protocol.protocolId
    && value.protocolSpecificationSha256 === sourceDigests.specificationSha256
    && value.protocolSchemaSha256 === sourceDigests.schemaSha256
    && value.protocolImplementationSha256 === sourceDigests.implementationSha256,
    'consumer bootstrap readback protocol binding is stale',
  )
  invariant(value.bootstrapMode === 'one-time-reviewed-full-snapshot-pr', 'legacy consumer bootstrap is not a reviewed full-snapshot PR')
  for (const field of ['baseDefaultBranchHeadSha', 'pullRequestHeadSha', 'mergeCommitSha', 'mergeTreeSha', 'defaultBranchHeadSha', 'candidateSourceCommit', 'candidateSourceTree']) {
    invariant(GIT_OID.test(value[field] || ''), `consumer bootstrap readback ${field} is invalid`)
  }
  invariant(value.baseDefaultBranchHeadSha !== value.pullRequestHeadSha, 'consumer bootstrap PR does not change the legacy base')
  invariant(value.defaultBranchHeadSha === value.mergeCommitSha, 'consumer bootstrap default branch is not the reviewed merge commit')
  invariant(Number.isSafeInteger(value.pullRequestNumber) && value.pullRequestNumber > 0, 'consumer bootstrap PR number is invalid')
  invariant(candidateRelease && value.candidateSourceCommit === candidateRelease.sourceCommit && value.candidateSourceTree === candidateRelease.sourceTree && value.version === candidateRelease.version, 'consumer bootstrap does not bind the immutable candidate')
  invariant(releaseBom && value.consumerLockSha256 === releaseBom.governance.consumer.sha256, 'consumer bootstrap lock digest differs from the release BOM')
  invariant(value.forkCorpusLockSha256 === releaseBom.governance.forkCorpus.sha256, 'consumer bootstrap fork corpus differs from the release BOM')
  invariant(value.templateStaticTreeSha256 === releaseBom.governance.productTemplateScaffold.staticTreeSha256, 'consumer bootstrap template snapshot differs from the release BOM')
  for (const field of ['fullSnapshotPlanDigest', 'materializedGovernanceTreeSha256', 'requiredChecksDigest']) invariant(SHA256.test(value[field] || ''), `consumer bootstrap readback ${field} is invalid`)
  exactKeys(value.reviewAuthorization, ['actorId', 'authorizationDigest', 'authorizedAt', 'kind'], 'consumer bootstrap review authorization')
  invariant(value.reviewAuthorization.kind === 'independent-engineering-attestation' && typeof value.reviewAuthorization.actorId === 'string' && value.reviewAuthorization.actorId.length > 0 && SHA256.test(value.reviewAuthorization.authorizationDigest || ''), 'consumer bootstrap independent engineering attestation is invalid')
  const authorizedAt = canonicalDate(value.reviewAuthorization.authorizedAt, 'consumer bootstrap authorization time')
  const mergedAt = canonicalDate(value.mergedAt, 'consumer bootstrap merge time')
  const observedAt = canonicalDate(value.observedAt, 'consumer bootstrap observation time')
  invariant(authorizedAt <= mergedAt && mergedAt <= observedAt, 'consumer bootstrap attestation/merge/readback chronology is invalid')
  invariant(value.legacySelfUpdateUsed === false && value.candidateCodeExecuted === false && value.eligible === true, 'consumer bootstrap used the legacy self-updater, executed candidate code, or is ineligible')
  return value
}

export function validateConsumerControlPlaneUpdateReadback(value, {
  repository,
  candidateRelease,
  releaseBom,
  protocol,
  sourceDigests,
} = {}) {
  exactKeys(value, [
    '$schema', 'schemaVersion', 'kind', 'repositoryId', 'repository', 'protocolId', 'protocolSpecificationSha256',
    'protocolSchemaSha256', 'protocolImplementationSha256', 'controlPlaneImplementationSha256',
    'controlPlanePolicySha256', 'controlPlanePlanSchemaSha256', 'controlPlaneSnapshotVerificationSchemaSha256',
    'controlPlaneReadbackSchemaSha256', 'controlPlaneReadbackVerificationSchemaSha256',
    'controlPlaneAcceptanceProposalSchemaSha256', 'controlPlaneBaselineReceiptSchemaSha256',
    'managedReposSchemaSha256', 'engineClosureSha256',
    'updateMode', 'sourceProfile', 'postUpdateProfile', 'sequence', 'predecessorReadbackSha256',
    'baseDefaultBranchHeadSha', 'pullRequestNumber', 'pullRequestHeadSha', 'mergeCommitSha',
    'mergeTreeSha', 'defaultBranchHeadSha', 'candidateSourceCommit', 'candidateSourceTree',
    'version', 'candidateReleaseSha256', 'releaseBomSha256', 'consumerLockSha256',
    'forkCorpusLockSha256', 'templateStaticTreeSha256', 'candidateCorpusReceiptSha256',
    'fullSnapshotPlanDigest', 'currentSnapshotTreeSha256', 'baseSnapshotTreeSha256',
    'incomingSnapshotTreeSha256', 'materializedGovernanceTreeSha256', 'snapshotVerificationDigest',
    'requiredChecks', 'requiredChecksComplete', 'requiredApprovingReviewCount',
    'reviews', 'reviewsComplete', 'dismissStaleReviewsRequired',
    'ordinaryUpdaterUsed', 'candidateCodeExecuted', 'eligible', 'mergedAt', 'observedAt',
    'issuerRegistryDigest', 'quorum', 'nonce', 'issuedAt', 'expiresAt', 'signatures',
  ], 'consumer control-plane update readback')
  invariant(
    value.$schema === 'https://qijenchen.dev/schemas/consumer-control-plane-update-readback-v1.schema.json'
      && value.schemaVersion === 1
      && value.kind === 'consumer-governance-control-plane-update-readback',
    'consumer control-plane update readback identity is invalid',
  )
  const assignedProfile = upgradeProfile(protocol, repository?.upgradeProtocolProfile)
  const updatePolicy = protocol?.reviewedControlPlaneUpdate
  const eligibleProfiles = [...(updatePolicy?.entryProfiles ?? []), ...(updatePolicy?.establishedProfiles ?? [])]
  invariant(
    ['template-mirror', 'product-consumer'].includes(repository?.role)
      && eligibleProfiles.includes(repository.upgradeProtocolProfile)
      && assignedProfile.controlPlaneUpdateMode === 'recurring-reviewed-full-snapshot-pr'
      && assignedProfile.controlPlaneUpdateEvidenceContract === 'consumer-governance-control-plane-update-readback-v1'
      && typeof assignedProfile.postControlPlaneUpdateProfile === 'string',
    'consumer control-plane update readback repository is not assigned to an eligible product profile',
  )
  invariant(value.repositoryId === repository.id && value.repository === repository.github, 'consumer control-plane update readback targets the wrong repository')
  exactKeys(sourceDigests, ['implementationSha256', 'schemaSha256', 'specificationSha256'], 'consumer control-plane update protocol source digests')
  invariant(
    value.protocolId === protocol.protocolId
      && value.protocolSpecificationSha256 === sourceDigests.specificationSha256
      && value.protocolSchemaSha256 === sourceDigests.schemaSha256
      && value.protocolImplementationSha256 === sourceDigests.implementationSha256,
    'consumer control-plane update readback protocol binding is stale',
  )
  invariant(value.updateMode === updatePolicy.mode, 'consumer control-plane update readback mode is invalid')
  invariant(value.sourceProfile === repository.upgradeProtocolProfile && value.postUpdateProfile === assignedProfile.postControlPlaneUpdateProfile, 'consumer control-plane update readback profile transition is stale')
  const prior = repository.acceptedControlPlaneUpdate ?? null
  invariant(
    (prior !== null) === assignedProfile.controlPlaneUpdateBindingRequired,
    'consumer control-plane update source profile and accepted chain head disagree',
  )
  const expectedSequence = prior === null ? 1 : prior.sequence + 1
  const expectedPredecessor = prior === null ? null : prior.readbackSha256
  invariant(value.sequence === expectedSequence && value.predecessorReadbackSha256 === expectedPredecessor, 'consumer control-plane update readback does not extend the exact accepted chain head')
  const postProfile = upgradeProfile(protocol, value.postUpdateProfile)
  invariant(postProfile.controlPlaneUpdateBindingRequired === true && postProfile.postControlPlaneUpdateProfile === value.postUpdateProfile, 'consumer control-plane update post profile is not a recurring chain-bound profile')
  for (const field of [
    'controlPlaneImplementationSha256', 'controlPlanePolicySha256', 'controlPlanePlanSchemaSha256',
    'controlPlaneSnapshotVerificationSchemaSha256', 'controlPlaneReadbackSchemaSha256',
    'controlPlaneReadbackVerificationSchemaSha256', 'controlPlaneAcceptanceProposalSchemaSha256',
    'controlPlaneBaselineReceiptSchemaSha256', 'managedReposSchemaSha256', 'engineClosureSha256',
    'candidateReleaseSha256', 'releaseBomSha256', 'consumerLockSha256', 'forkCorpusLockSha256',
    'templateStaticTreeSha256', 'fullSnapshotPlanDigest', 'currentSnapshotTreeSha256',
    'baseSnapshotTreeSha256', 'incomingSnapshotTreeSha256', 'materializedGovernanceTreeSha256',
    'candidateCorpusReceiptSha256', 'snapshotVerificationDigest', 'issuerRegistryDigest',
  ]) invariant(SHA256.test(value[field] || ''), `consumer control-plane update readback ${field} is invalid`)
  for (const field of ['baseDefaultBranchHeadSha', 'pullRequestHeadSha', 'mergeCommitSha', 'mergeTreeSha', 'defaultBranchHeadSha', 'candidateSourceCommit', 'candidateSourceTree']) {
    invariant(GIT_OID.test(value[field] || ''), `consumer control-plane update readback ${field} is invalid`)
  }
  invariant(value.baseDefaultBranchHeadSha !== value.pullRequestHeadSha, 'consumer control-plane update PR does not change the protected base')
  invariant(value.defaultBranchHeadSha === value.mergeCommitSha, 'consumer control-plane update default branch is not the reviewed merge commit')
  invariant(Number.isSafeInteger(value.pullRequestNumber) && value.pullRequestNumber > 0, 'consumer control-plane update PR number is invalid')
  invariant(
    candidateRelease
      && value.candidateSourceCommit === candidateRelease.sourceCommit
      && value.candidateSourceTree === candidateRelease.sourceTree
      && value.version === candidateRelease.version,
    'consumer control-plane update does not bind the immutable candidate',
  )
  invariant(releaseBom && value.consumerLockSha256 === releaseBom.governance.consumer.sha256, 'consumer control-plane update lock digest differs from the release BOM')
  invariant(value.forkCorpusLockSha256 === releaseBom.governance.forkCorpus.sha256, 'consumer control-plane update fork corpus differs from the release BOM')
  invariant(value.templateStaticTreeSha256 === releaseBom.governance.productTemplateScaffold.staticTreeSha256, 'consumer control-plane update template snapshot differs from the release BOM')
  invariant(
    value.requiredApprovingReviewCount === 0,
    'consumer control-plane update must not introduce a GitHub human-approval gate',
  )
  invariant(
    value.requiredChecksComplete === true
      && value.reviewsComplete === true
      && value.dismissStaleReviewsRequired === true,
    'consumer control-plane observer did not attest complete checks and the zero-review set with stale-review dismissal',
  )
  invariant(Array.isArray(value.requiredChecks) && value.requiredChecks.length > 0, 'consumer control-plane update must enumerate all required checks')
  const checkContexts = []
  let latestCheck = new Date(0)
  for (const check of value.requiredChecks) {
    exactKeys(check, ['completedAt', 'conclusion', 'context', 'headSha', 'runAttempt', 'runId', 'status', 'workflowIdentityDigest'], 'consumer control-plane required check')
    invariant(typeof check.context === 'string' && check.context.length > 0, 'consumer control-plane required check context is missing')
    invariant(check.status === 'completed' && check.conclusion === 'success' && check.headSha === value.pullRequestHeadSha, `consumer control-plane required check ${check.context || '<missing>'} is incomplete, unsuccessful, or stale`)
    invariant(typeof check.runId === 'string' && /^[1-9][0-9]*$/.test(check.runId) && Number.isSafeInteger(check.runAttempt) && check.runAttempt >= 1, `consumer control-plane required check ${check.context} run identity is invalid`)
    invariant(SHA256.test(check.workflowIdentityDigest || ''), `consumer control-plane required check ${check.context} workflow identity is invalid`)
    const completedAt = canonicalDate(check.completedAt, `consumer control-plane required check ${check.context} completion time`)
    if (completedAt > latestCheck) latestCheck = completedAt
    checkContexts.push(check.context)
  }
  invariant(stable(checkContexts) === stable([...new Set(checkContexts)].sort()), 'consumer control-plane required checks must be complete, unique, and canonically sorted')
  invariant(
    Array.isArray(value.reviews) && value.reviews.length === 0,
    'consumer control-plane update GitHub approval set must be empty',
  )
  const mergedAt = canonicalDate(value.mergedAt, 'consumer control-plane update merge time')
  const observedAt = canonicalDate(value.observedAt, 'consumer control-plane update observation time')
  canonicalDate(value.issuedAt, 'consumer control-plane update receipt issue time')
  canonicalDate(value.expiresAt, 'consumer control-plane update receipt expiry time')
  invariant(
    latestCheck <= mergedAt && mergedAt <= observedAt,
    'consumer control-plane update checks/merge/readback chronology is invalid',
  )
  invariant(Number.isSafeInteger(value.quorum) && value.quorum >= 1 && value.quorum <= 5 && Array.isArray(value.signatures), 'consumer control-plane observer signature envelope is invalid')
  invariant(value.ordinaryUpdaterUsed === false && value.candidateCodeExecuted === false && value.eligible === true, 'consumer control-plane update used the ordinary updater, executed candidate code, or is ineligible')
  return value
}
