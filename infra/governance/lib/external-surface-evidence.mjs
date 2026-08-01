import { verify as verifySignature } from 'node:crypto'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { assertNoEmbeddedSecrets, compareUtf8Bytes, invariant, sha256, stableStringify } from './common.mjs'
import {
  issuerRegistryDigest as computeIssuerRegistryDigest,
  publicKeyFromIssuer,
  resolvePolicyIssuer,
} from './issuer-registry.mjs'
import { runtimeTargetDigest } from './provider-runtime-conformance.mjs'
import { validateRepositorySubjectProof } from './repository-subject-proof.mjs'

const SHA256 = /^sha256:[a-f0-9]{64}$/
const HEX_SHA256 = /^[a-f0-9]{64}$/
const GIT_OID = /^[a-f0-9]{40}$/
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const TARGET_AXES = Object.freeze(['operatingSystem', 'platform', 'arch', 'executionEnvironment', 'distributionVersion', 'pathClass'])

function digest(value) {
  return `sha256:${sha256(value)}`
}

function unprefixedDigest(value) {
  invariant(SHA256.test(value ?? ''), 'Prefixed sha256 digest is invalid')
  return value.slice('sha256:'.length)
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant(Object.keys(value).sort().join(',') === [...expected].sort().join(','), `${label} has an invalid or open shape`)
}

function canonicalUtc(value, label) {
  invariant(typeof value === 'string', `${label} must be a canonical UTC timestamp`)
  const parsed = new Date(value)
  invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value, `${label} must be a canonical UTC timestamp`)
  return parsed
}

function unsignedEvidence(evidence) {
  const { attestation: ignoredAttestation, evidenceDigest: ignoredDigest, ...unsigned } = evidence
  return unsigned
}

export function externalHardGateContractDigest(matrix, repositoryRole) {
  invariant(['authority', 'template-mirror', 'product-consumer'].includes(repositoryRole), 'External evidence repository role is invalid')
  const contractName = repositoryRole === 'authority' ? 'authority' : 'consumer'
  const pointer = matrix?.commonContract?.roleHardGateContracts?.[repositoryRole]
  const contract = matrix?.commonContract?.hardGateContracts?.[contractName]
  invariant(pointer === `#/commonContract/hardGateContracts/${contractName}` && contract, `External evidence hard-gate contract is unavailable for ${repositoryRole}`)
  return digest(stableStringify({ pointer, contract }, 0))
}

function validateAttestation(attestation, evidence) {
  exactKeys(attestation, ['schemaVersion', 'kind', 'status', 'issuerId', 'issuerRegistryDigest', 'algorithm', 'evidenceDigest', 'runId', 'signature', 'coSignatures'], 'External surface evidence attestation')
  invariant(attestation.schemaVersion === 1 && attestation.kind === 'external-runtime-surface-evidence-attestation', 'External surface evidence attestation identity is invalid')
  invariant(attestation.status === 'verified', 'External surface evidence requires a verified issuer attestation')
  invariant(attestation.algorithm === 'ed25519', 'External surface evidence attestation algorithm must be ed25519')
  invariant(HEX_SHA256.test(attestation.issuerRegistryDigest ?? ''), 'External surface evidence issuer registry digest is invalid')
  invariant(attestation.evidenceDigest === evidence.evidenceDigest && attestation.runId === evidence.run.runId, 'External surface evidence attestation subject mismatch')
  invariant(typeof attestation.issuerId === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(attestation.issuerId), 'External surface evidence issuer id is invalid')
  invariant(typeof attestation.signature === 'string', 'External surface evidence issuer signature is missing')
  const signature = Buffer.from(attestation.signature, 'base64')
  invariant(signature.length === 64 && signature.toString('base64') === attestation.signature, 'External surface evidence issuer signature must be canonical Ed25519 base64')
  invariant(Array.isArray(attestation.coSignatures), 'External surface evidence cosignatures must be an array')
  for (const item of attestation.coSignatures) {
    exactKeys(item, ['issuerId', 'signature'], 'External surface evidence cosignature')
    invariant(typeof item.issuerId === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(item.issuerId), 'External surface evidence cosigner id is invalid')
    const cosignature = Buffer.from(item.signature, 'base64')
    invariant(cosignature.length === 64 && cosignature.toString('base64') === item.signature, 'External surface evidence cosignature must be canonical Ed25519 base64')
  }
}

function checkReceipt(evidence, driver) {
  const matches = evidence.checks.filter(check => check.driver === driver)
  invariant(matches.length === 1, `External surface evidence must contain exactly one ${driver} receipt`)
  return matches[0].receiptSha256
}

export function externalRepositoryReadbackDigest(repository, subject) {
  return sha256(stableStringify({
    repositoryId: repository.id,
    repository: repository.github,
    repositoryRole: repository.role,
    defaultBranch: repository.defaultBranch,
    gitCommit: subject.gitCommit,
    gitTree: subject.gitTree,
  }, 0))
}

export function externalSurfaceDistributionIdentityDigest(distribution) {
  return digest(stableStringify({
    authority: distribution.authority,
    productId: distribution.productId,
    version: distribution.version,
  }, 0))
}

export function externalManagedSessionDigest(evidence) {
  const binding = evidence.surfaceBinding
  return sha256(stableStringify({
    profileId: evidence.profile.id,
    runId: evidence.run.runId,
    repositoryReadbackSha256: binding.repositoryReadbackSha256,
    distributionReadbackSha256: binding.distributionReadbackSha256,
    hardGateReceiptSha256: binding.hardGateReceiptSha256,
  }, 0))
}

export function externalManagedControlPlaneDigest(evidence) {
  const binding = evidence.surfaceBinding
  return sha256(stableStringify({
    profileId: evidence.profile.id,
    profileDigest: evidence.subject.profileDigest,
    harnessDigest: evidence.subject.harnessDigest,
    hardGateContractDigest: evidence.subject.hardGateContractDigest,
    repositoryReadbackSha256: binding.repositoryReadbackSha256,
    distributionReadbackSha256: binding.distributionReadbackSha256,
  }, 0))
}

function validateRepositoryFields(binding, evidence, label) {
  invariant(/^[a-z0-9][a-z0-9-]*$/.test(binding.repositoryId ?? ''), `${label} repository id is invalid`)
  invariant(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(binding.repository ?? ''), `${label} repository identity is invalid`)
  invariant(['authority', 'template-mirror', 'product-consumer'].includes(binding.repositoryRole), `${label} repository role is invalid`)
  invariant(/^[A-Za-z0-9._\/-]+$/.test(binding.defaultBranch ?? ''), `${label} default branch is invalid`)
  invariant(binding.repositoryId === evidence.profile.repositoryId
    && binding.repository === evidence.profile.repository
    && binding.repositoryRole === evidence.profile.repositoryRole, `${label} repository differs from the evidence profile`)
}

function validateManagedBinding(binding, evidence) {
  exactKeys(binding, [
    'kind',
    'repositoryId',
    'repository',
    'repositoryRole',
    'defaultBranch',
    'sessionIdentitySha256',
    'repositoryReadbackSha256',
    'distributionReadbackSha256',
    'hardGateReceiptSha256',
    'controlPlaneReadbackSha256',
  ], 'Managed external runtime binding')
  invariant(binding.kind === 'managed-runtime-readback', 'Managed external runtime binding kind is invalid')
  validateRepositoryFields(binding, evidence, 'Managed external runtime binding')
  for (const [key, value] of Object.entries(binding)) {
    if (key.endsWith('Sha256')) invariant(HEX_SHA256.test(value ?? ''), `Managed external runtime binding ${key} is not content-addressed`)
  }
  invariant(evidence.distribution.identityDigest === externalSurfaceDistributionIdentityDigest(evidence.distribution), 'Managed external runtime distribution identity digest is not canonical')
  invariant(binding.distributionReadbackSha256 === unprefixedDigest(evidence.distribution.identityDigest), 'Managed external runtime distribution readback differs from the distribution identity')
  invariant(binding.repositoryReadbackSha256 === externalRepositoryReadbackDigest({
    id: binding.repositoryId,
    github: binding.repository,
    role: binding.repositoryRole,
    defaultBranch: binding.defaultBranch,
  }, evidence.subject), 'Managed external runtime repository readback differs from the repository subject')
  invariant(binding.hardGateReceiptSha256 === checkReceipt(evidence, 'external-hard-gate-receipt'), 'Managed external runtime hard-gate receipt is detached from its check')
  invariant(binding.sessionIdentitySha256 === externalManagedSessionDigest(evidence)
    && binding.sessionIdentitySha256 === checkReceipt(evidence, 'external-runtime-session-binding'), 'Managed external runtime session receipt is detached from its repository/distribution/hard-gate bundle')
  invariant(binding.controlPlaneReadbackSha256 === externalManagedControlPlaneDigest(evidence), 'Managed external runtime control-plane readback is detached from its profile subject')
}

export function externalGitHubDesiredPolicy(desired, repository, profileProvider) {
  invariant(desired?.schemaVersion === 1 && repository && profileProvider, 'GitHub Actions canonical desired policy inputs are missing')
  invariant(profileProvider.surfacePolicy?.kind === 'github-protected-workflow-readback', 'GitHub Actions runtime profile policy is invalid')
  const desiredProfile = desired.profiles?.[repository.desiredProfile]
  invariant(desiredProfile, `GitHub Actions desired profile ${repository.desiredProfile ?? '<missing>'} is unavailable`)
  const selector = profileProvider.surfacePolicy.hardGateByRepositoryRole?.[repository.role]
  exactKeys(selector, ['checkContext', 'oidcSubjectMode', 'trustSource'], `GitHub Actions hard-gate selector for ${repository.role ?? '<missing>'}`)
  invariant(
    ['repository-workflow', 'protected-base-workflow'].includes(selector.trustSource)
      && ['pull-request', 'credential-environment', 'protected-ref'].includes(selector.oidcSubjectMode),
    `GitHub Actions hard-gate selector for ${repository.role} is invalid`,
  )
  const checks = (desiredProfile.requiredChecks ?? []).filter(check => (
    check.context === selector.checkContext
    && check.trustSource === selector.trustSource
  ))
  invariant(checks.length === 1, `GitHub Actions desired profile ${repository.desiredProfile} must resolve one role-selected hard-gate check`)
  const requiredCheck = checks[0]
  invariant(Array.isArray(requiredCheck.requiredEvents) && requiredCheck.requiredEvents.length === 1, 'GitHub Actions role-selected hard-gate must declare exactly one event')
  const integration = desired.integrations?.[requiredCheck.integration]
  invariant(Number.isSafeInteger(integration?.id) && integration.id > 0, `GitHub Actions role-selected hard-gate integration ${requiredCheck.integration ?? '<missing>'} requires an exact active App id`)
  let oidcSubject
  if (selector.oidcSubjectMode === 'credential-environment') {
    invariant(selector.trustSource === 'protected-base-workflow', 'Credential-environment OIDC requires a protected-base workflow hard gate')
    const environments = (desiredProfile.environments ?? []).filter(environment => (
      environment.workflow === requiredCheck.workflow
      && environment.credentialIntegration === requiredCheck.integration
    ))
    invariant(environments.length === 1, 'GitHub Actions protected-base hard gate must resolve one credential-bound environment')
    oidcSubject = `repo:${repository.github}:environment:${environments[0].name}`
  } else if (selector.oidcSubjectMode === 'protected-ref') {
    invariant(
      selector.trustSource === 'protected-base-workflow'
        && requiredCheck.requiredEvents[0] === 'repository_dispatch'
        && requiredCheck.integration === 'githubActions',
      'GitHub Actions protected-ref hard gate has an incompatible event, integration, or trust source',
    )
    oidcSubject = `repo:${repository.github}:ref:refs/heads/${repository.defaultBranch}`
  } else {
    invariant(
      selector.oidcSubjectMode === 'pull-request'
        && selector.trustSource === 'repository-workflow'
        && requiredCheck.requiredEvents[0] === 'pull_request'
        && requiredCheck.integration === 'githubActions',
      'GitHub Actions native pull-request hard gate has an incompatible event, integration, or trust source',
    )
    oidcSubject = `repo:${repository.github}:pull_request`
  }
  const rulesets = (desiredProfile.rulesets ?? []).filter(ruleset => ruleset.name === profileProvider.surfacePolicy.requiredRulesetName)
  invariant(rulesets.length === 1 && rulesets[0].enforcement === 'active', 'GitHub Actions protected required-check ruleset is unavailable')
  const ruleset = rulesets[0]
  const desiredStateDigest = sha256(stableStringify({
    repository: {
      id: repository.id,
      github: repository.github,
      role: repository.role,
      defaultBranch: repository.defaultBranch,
      desiredProfile: repository.desiredProfile,
    },
    integrations: desired.integrations,
    profile: desiredProfile,
  }, 0))
  return {
    repositoryId: repository.id,
    repository: repository.github,
    repositoryRole: repository.role,
    defaultBranch: repository.defaultBranch,
    protectedRef: `refs/heads/${repository.defaultBranch}`,
    workflowPath: requiredCheck.workflow,
    workflowBlobSha256: requiredCheck.workflowIdentity.contentSha256,
    workflowGitBlobSha: requiredCheck.workflowIdentity.gitBlobSha,
    workflowSemanticSha256: requiredCheck.workflowIdentity.semanticSha256,
    event: requiredCheck.requiredEvents[0],
    artifactName: profileProvider.surfacePolicy.artifactName,
    checkName: requiredCheck.context,
    checkAppId: String(integration.id),
    rulesetName: ruleset.name,
    rulesetPolicyDigest: sha256(stableStringify({ ruleset, requiredCheckName: requiredCheck.context }, 0)),
    desiredStateDigest,
    oidcSubject,
  }
}

export function externalGitHubCheckRunDigest(binding) {
  return sha256(stableStringify({
    repository: binding.repository,
    runDatabaseId: binding.runDatabaseId,
    runAttempt: binding.runAttempt,
    headSha: binding.headSha,
    checkName: binding.checkName,
    checkConclusion: binding.checkConclusion,
    checkAppId: binding.checkAppId,
  }, 0))
}

export function externalGitHubWorkflowRunDigest(binding) {
  return sha256(stableStringify({
    evidenceRunId: binding.evidenceRunId,
    repositoryId: binding.repositoryId,
    repository: binding.repository,
    repositoryReadbackSha256: binding.repositoryReadbackSha256,
    defaultBranch: binding.defaultBranch,
    protectedRef: binding.protectedRef,
    workflowPath: binding.workflowPath,
    workflowBlobSha256: binding.workflowBlobSha256,
    workflowGitBlobSha: binding.workflowGitBlobSha,
    workflowSemanticSha256: binding.workflowSemanticSha256,
    runDatabaseId: binding.runDatabaseId,
    runAttempt: binding.runAttempt,
    event: binding.event,
    headSha: binding.headSha,
    treeSha: binding.treeSha,
    artifactName: binding.artifactName,
    artifactSha256: binding.artifactSha256,
    checkRunSha256: binding.checkRunSha256,
    oidcIssuer: binding.oidcIssuer,
    oidcSubject: binding.oidcSubject,
    oidcSubjectSha256: binding.oidcSubjectSha256,
    desiredStateDigest: binding.desiredStateDigest,
    controlPlaneReadbackSha256: binding.controlPlaneReadbackSha256,
  }, 0))
}

export function externalGitHubControlPlaneDigest(evidence) {
  const binding = evidence.surfaceBinding
  return sha256(stableStringify({
    profileId: evidence.profile.id,
    profileDigest: evidence.subject.profileDigest,
    harnessDigest: evidence.subject.harnessDigest,
    hardGateContractDigest: evidence.subject.hardGateContractDigest,
    repositoryReadbackSha256: binding.repositoryReadbackSha256,
    desiredStateDigest: binding.desiredStateDigest,
  }, 0))
}

export function externalGitHubRulesetReadbackDigest(binding) {
  return sha256(stableStringify({
    repository: binding.repository,
    rulesetId: binding.rulesetId,
    rulesetName: binding.rulesetName,
    rulesetEnforcement: binding.rulesetEnforcement,
    requiredCheckName: binding.requiredCheckName,
    rulesetPolicyDigest: binding.rulesetPolicyDigest,
    desiredStateDigest: binding.desiredStateDigest,
  }, 0))
}

function validateGitHubBinding(binding, evidence) {
  exactKeys(binding, [
    'kind', 'evidenceRunId', 'repositoryId', 'repository', 'repositoryRole', 'defaultBranch', 'repositoryReadbackSha256', 'protectedRef',
    'workflowPath', 'workflowBlobSha256', 'workflowGitBlobSha', 'workflowSemanticSha256',
    'runDatabaseId', 'runAttempt', 'event',
    'headSha', 'treeSha', 'artifactName', 'artifactSha256', 'checkName', 'checkConclusion', 'checkAppId',
    'checkRunSha256', 'workflowRunReadbackSha256', 'rulesetId', 'rulesetName', 'rulesetEnforcement',
    'requiredCheckName', 'rulesetPolicyDigest', 'rulesetReadbackSha256', 'desiredStateDigest', 'controlPlaneReadbackSha256',
    'oidcIssuer', 'oidcSubject', 'oidcSubjectSha256',
  ], 'GitHub Actions external runtime binding')
  invariant(binding.kind === 'github-actions-readback', 'GitHub Actions external runtime binding kind is invalid')
  invariant(binding.evidenceRunId === evidence.run.runId, 'GitHub Actions readback is detached from the external evidence run')
  validateRepositoryFields(binding, evidence, 'GitHub Actions external runtime binding')
  invariant(binding.repositoryReadbackSha256 === externalRepositoryReadbackDigest({
    id: binding.repositoryId,
    github: binding.repository,
    role: binding.repositoryRole,
    defaultBranch: binding.defaultBranch,
  }, evidence.subject), 'GitHub Actions repository readback differs from the repository subject')
  invariant(binding.protectedRef === `refs/heads/${binding.defaultBranch}`, 'GitHub Actions protected ref differs from the repository default branch')
  invariant(/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(binding.workflowPath ?? ''), 'GitHub Actions workflow path is invalid')
  invariant(GIT_OID.test(binding.workflowGitBlobSha ?? ''), 'GitHub Actions workflow Git blob identity is invalid')
  invariant(/^\d+$/.test(binding.runDatabaseId ?? '') && Number.isInteger(binding.runAttempt) && binding.runAttempt >= 1, 'GitHub Actions run identity is invalid')
  invariant(typeof binding.event === 'string' && /^[a-z_]+$/.test(binding.event), 'GitHub Actions event identity is invalid')
  invariant(GIT_OID.test(binding.headSha ?? '') && GIT_OID.test(binding.treeSha ?? ''), 'GitHub Actions commit/tree identity is invalid')
  invariant(binding.headSha === evidence.subject.gitCommit && binding.treeSha === evidence.subject.gitTree, 'GitHub Actions run commit/tree differs from the evidence subject')
  invariant(typeof binding.artifactName === 'string' && binding.artifactName.length > 0 && HEX_SHA256.test(binding.artifactSha256 ?? ''), 'GitHub Actions artifact identity is incomplete')
  invariant(typeof binding.checkName === 'string' && binding.checkName.length > 0 && binding.checkConclusion === 'success', 'GitHub Actions check did not succeed')
  invariant(/^\d+$/.test(binding.checkAppId ?? '') && HEX_SHA256.test(binding.checkRunSha256 ?? ''), 'GitHub Actions check/App readback is incomplete')
  invariant(binding.checkRunSha256 === externalGitHubCheckRunDigest(binding), 'GitHub Actions check readback is detached from its workflow run')
  invariant(/^\d+$/.test(binding.rulesetId ?? '') && typeof binding.rulesetName === 'string' && binding.rulesetEnforcement === 'active', 'GitHub Actions required-check ruleset is not active')
  invariant(binding.requiredCheckName === binding.checkName && HEX_SHA256.test(binding.rulesetReadbackSha256 ?? ''), 'GitHub Actions ruleset does not bind the successful check')
  invariant(binding.rulesetReadbackSha256 === externalGitHubRulesetReadbackDigest(binding), 'GitHub Actions ruleset readback is detached from its desired policy')
  invariant(binding.oidcIssuer === 'https://token.actions.githubusercontent.com'
    && typeof binding.oidcSubject === 'string'
    && binding.oidcSubjectSha256 === sha256(binding.oidcSubject), 'GitHub Actions OIDC identity is invalid')
  invariant(evidence.distribution.identityDigest === externalSurfaceDistributionIdentityDigest(evidence.distribution), 'GitHub Actions distribution identity digest is not canonical')
  invariant(binding.controlPlaneReadbackSha256 === externalGitHubControlPlaneDigest(evidence), 'GitHub Actions control-plane readback is detached from the profile/desired subject')
  invariant(binding.artifactSha256 === checkReceipt(evidence, 'external-hard-gate-receipt'), 'GitHub Actions hard-gate receipt is detached from its artifact')
  invariant(binding.workflowRunReadbackSha256 === externalGitHubWorkflowRunDigest(binding)
    && binding.workflowRunReadbackSha256 === checkReceipt(evidence, 'github-workflow-run-binding'), 'GitHub Actions workflow receipt is detached from its run/check/artifact bundle')
  invariant(binding.rulesetReadbackSha256 === checkReceipt(evidence, 'github-ruleset-readback'), 'GitHub Actions ruleset receipt is detached from its readback')
  invariant(unprefixedDigest(evidence.distribution.identityDigest) === checkReceipt(evidence, 'external-distribution-identity'), 'GitHub Actions distribution receipt is detached from its identity')
  for (const key of ['workflowBlobSha256', 'workflowSemanticSha256', 'artifactSha256', 'checkRunSha256', 'workflowRunReadbackSha256', 'rulesetPolicyDigest', 'rulesetReadbackSha256', 'desiredStateDigest', 'controlPlaneReadbackSha256', 'oidcSubjectSha256']) {
    invariant(HEX_SHA256.test(binding[key] ?? ''), `GitHub Actions ${key} is not content-addressed`)
  }
}

export function validateExternalSurfaceEvidence(evidence) {
  exactKeys(evidence, ['schemaVersion', 'kind', 'status', 'profile', 'run', 'subject', 'distribution', 'checks', 'surfaceBinding', 'attestation', 'evidenceDigest'], 'External surface evidence')
  invariant(evidence.schemaVersion === 1 && evidence.kind === 'external-runtime-surface-conformance', 'External surface evidence identity is invalid')
  invariant(['pass', 'fail'].includes(evidence.status), 'External surface evidence status is invalid')
  exactKeys(evidence.profile, ['id', 'adapterProviderId', 'runtimeKind', 'surface', 'repositoryId', 'repository', 'repositoryRole'], 'External surface evidence profile')
  invariant(typeof evidence.profile.id === 'string' && /^[a-z][a-z0-9-]*$/.test(evidence.profile.id), 'External surface evidence profile id is invalid')
  invariant(evidence.profile.adapterProviderId === null || /^[a-z][a-z0-9-]*$/.test(evidence.profile.adapterProviderId), 'External surface evidence adapter provider id is invalid')
  invariant(/^[a-z][a-z0-9-]*$/.test(evidence.profile.runtimeKind ?? ''), 'External surface evidence runtime kind is invalid')
  invariant(['local', 'remote-control', 'cloud', 'github-actions'].includes(evidence.profile.surface), 'External surface evidence surface is invalid')
  invariant(/^[a-z0-9][a-z0-9-]*$/.test(evidence.profile.repositoryId ?? ''), 'External surface evidence repository id is invalid')
  invariant(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(evidence.profile.repository ?? ''), 'External surface evidence repository identity is invalid')
  invariant(['authority', 'template-mirror', 'product-consumer'].includes(evidence.profile.repositoryRole), 'External surface evidence repository role is invalid')

  exactKeys(evidence.run, ['runId', 'generatedAt', 'validUntil', 'operatingSystem', 'platform', 'arch', 'executionEnvironment', 'pathClass', 'targetId', 'targetDigest'], 'External surface evidence run')
  invariant(UUID_V4.test(evidence.run.runId ?? ''), 'External surface evidence runId must be UUIDv4')
  const generatedAt = canonicalUtc(evidence.run.generatedAt, 'External surface evidence generatedAt')
  const validUntil = canonicalUtc(evidence.run.validUntil, 'External surface evidence validUntil')
  invariant(validUntil > generatedAt, 'External surface evidence validUntil must be after generatedAt')
  invariant(['macos', 'linux'].includes(evidence.run.operatingSystem) && ['darwin', 'linux'].includes(evidence.run.platform), 'External surface evidence OS/platform is invalid')
  invariant(['arm64', 'x64'].includes(evidence.run.arch), 'External surface evidence architecture is invalid')
  invariant(['native', 'remote-host', 'cloud-hosted', 'github-hosted-runner'].includes(evidence.run.executionEnvironment), 'External surface evidence executionEnvironment is invalid')
  invariant(['no-space', 'contains-space'].includes(evidence.run.pathClass), 'External surface evidence pathClass is invalid')
  invariant(/^[a-z0-9][a-z0-9-]*$/.test(evidence.run.targetId ?? '') && SHA256.test(evidence.run.targetDigest ?? ''), 'External surface evidence target binding is invalid')

  exactKeys(evidence.subject, ['gitCommit', 'gitTree', 'profileDigest', 'harnessDigest', 'hardGateContractDigest'], 'External surface evidence subject')
  invariant(GIT_OID.test(evidence.subject.gitCommit ?? '') && GIT_OID.test(evidence.subject.gitTree ?? ''), 'External surface evidence Git identity is invalid')
  for (const key of ['profileDigest', 'harnessDigest', 'hardGateContractDigest']) invariant(SHA256.test(evidence.subject[key] ?? ''), `External surface evidence ${key} is invalid`)

  exactKeys(evidence.distribution, ['authority', 'productId', 'version', 'identityDigest'], 'External surface distribution identity')
  invariant(/^[a-z0-9][a-z0-9.-]*$/.test(evidence.distribution.authority ?? ''), 'External surface distribution authority is invalid')
  invariant(/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(evidence.distribution.productId ?? '') && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(evidence.distribution.version ?? ''), 'External surface distribution product/version is invalid')
  invariant(SHA256.test(evidence.distribution.identityDigest ?? ''), 'External surface distribution identity is not content-addressed')

  invariant(Array.isArray(evidence.checks) && evidence.checks.length > 0, 'External surface evidence checks are missing')
  const checkIds = new Set()
  for (const check of evidence.checks) {
    exactKeys(check, ['id', 'driver', 'status', 'receiptSha256'], 'External surface evidence check')
    invariant(/^[a-z][a-z0-9-]*$/.test(check.id ?? '') && !checkIds.has(check.id), `External surface evidence check id is invalid or duplicated: ${String(check.id)}`)
    invariant(/^[a-z][a-z0-9-]*$/.test(check.driver ?? '') && ['pass', 'fail'].includes(check.status), `External surface evidence check ${check.id} is invalid`)
    invariant(HEX_SHA256.test(check.receiptSha256 ?? ''), `External surface evidence check ${check.id} receipt is not content-addressed`)
    checkIds.add(check.id)
  }
  invariant(evidence.status === (evidence.checks.every(check => check.status === 'pass') ? 'pass' : 'fail'), 'External surface evidence status disagrees with checks')

  if (evidence.profile.surface === 'github-actions') validateGitHubBinding(evidence.surfaceBinding, evidence)
  else validateManagedBinding(evidence.surfaceBinding, evidence)
  invariant(evidence.evidenceDigest === digest(stableStringify(unsignedEvidence(evidence), 0)), 'External surface evidence digest is invalid')
  validateAttestation(evidence.attestation, evidence)
  assertNoEmbeddedSecrets(evidence)
  return true
}

export function externalSurfaceEvidenceSigningPayload(evidence, issuerId, issuerRegistryDigest = evidence?.attestation?.issuerRegistryDigest) {
  invariant(typeof issuerId === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(issuerId), 'External surface evidence signing issuer id is invalid')
  invariant(HEX_SHA256.test(issuerRegistryDigest ?? ''), 'External surface evidence signing issuer registry digest is invalid')
  return Buffer.from(`qijenchen-external-runtime-surface-evidence-v1\0${stableStringify({
    evidenceDigest: evidence.evidenceDigest,
    issuerId,
    issuerRegistryDigest,
    runId: evidence.run.runId,
  }, 0)}`, 'utf8')
}

export function verifyExternalSurfaceEvidenceAttestation(evidence, runtimeProfile, { issuerRegistry, now = new Date() } = {}) {
  validateExternalSurfaceEvidence(evidence)
  invariant(issuerRegistry && typeof issuerRegistry === 'object', 'External surface evidence issuer registry is required')
  invariant(evidence.attestation.issuerRegistryDigest === runtimeProfile.issuerRegistryDigest
    && evidence.attestation.issuerRegistryDigest === computeIssuerRegistryDigest(issuerRegistry), 'External surface evidence issuer registry digest mismatch')
  const generatedAt = new Date(evidence.run.generatedAt)
  const validUntil = new Date(evidence.run.validUntil)
  const signatures = [{ issuerId: evidence.attestation.issuerId, signature: evidence.attestation.signature }, ...evidence.attestation.coSignatures]
  invariant(new Set(signatures.map(item => item.issuerId)).size === signatures.length, 'External surface evidence issuers must be distinct')
  const subjects = new Set()
  for (const item of signatures) {
    const issuer = resolvePolicyIssuer(runtimeProfile, issuerRegistry, item.issuerId, { role: 'runtime-evidence-issuer', at: generatedAt, validThrough: validUntil })
    resolvePolicyIssuer(runtimeProfile, issuerRegistry, item.issuerId, { role: 'runtime-evidence-issuer', at: now, validThrough: now })
    invariant(!subjects.has(issuer.subject), `External surface evidence issuer subjects must be distinct: ${issuer.subject}`)
    const signature = Buffer.from(item.signature, 'base64')
    invariant(verifySignature(null, externalSurfaceEvidenceSigningPayload(evidence, issuer.keyId), publicKeyFromIssuer(issuer), signature), `External surface evidence issuer signature verification failed for ${issuer.keyId}`)
    subjects.add(issuer.subject)
  }
  invariant(subjects.size >= runtimeProfile.requiredIssuerQuorum, `External surface evidence lacks required issuer quorum ${runtimeProfile.requiredIssuerQuorum}`)
  return true
}

export function validateExternalSurfaceEvidenceBinding(evidence, {
  certification,
  certificationTarget,
  repositoryTarget,
  repositoryIdentity,
  profileProvider,
  runtimeProfile,
  matrix,
  desiredGithub,
  identity,
  carrierPolicy,
  issuerRegistry,
  now = new Date(),
} = {}) {
  verifyExternalSurfaceEvidenceAttestation(evidence, runtimeProfile, { issuerRegistry, now })
  invariant(profileProvider.executionMode === 'external-attested' && profileProvider.evidenceKind === evidence.kind, 'External surface evidence profile is not externally attestable')
  invariant(evidence.status === 'pass', 'External surface evidence did not pass')
  invariant(evidence.profile.id === profileProvider.id
    && evidence.profile.adapterProviderId === profileProvider.adapterProviderId
    && evidence.profile.runtimeKind === certification.runtimeKind
    && evidence.profile.surface === certification.surface
    && evidence.profile.repositoryRole === certification.repositoryRole, 'External surface evidence profile/certification binding mismatch')
  invariant(repositoryTarget && repositoryIdentity, 'External surface evidence requires an exact inventory repository and live repository identity')
  invariant(repositoryTarget.role === certification.repositoryRole
    && evidence.profile.repositoryId === repositoryTarget.id
    && evidence.profile.repository === repositoryTarget.github, 'External surface evidence repository differs from the certification inventory target')
  validateRepositorySubjectProof(repositoryTarget, repositoryIdentity, {
    subjectCommit: evidence.subject.gitCommit,
    subjectTree: evidence.subject.gitTree,
  }, { carrierPolicy })
  invariant(evidence.surfaceBinding.repositoryId === repositoryTarget.id
    && evidence.surfaceBinding.repository === repositoryTarget.github
    && evidence.surfaceBinding.repositoryRole === repositoryTarget.role
    && evidence.surfaceBinding.defaultBranch === repositoryTarget.defaultBranch, 'External surface evidence readback repository differs from the inventory target')
  const target = profileProvider.certificationTargets.find(candidate => candidate.id === evidence.run.targetId)
  invariant(target && certificationTarget.id === target.id, 'External surface evidence target is absent from the active profile or certification')
  invariant(evidence.run.targetDigest === runtimeTargetDigest(target), 'External surface evidence target digest mismatch')
  for (const axis of TARGET_AXES) {
    const observed = axis === 'distributionVersion' ? evidence.distribution.version : evidence.run[axis]
    invariant(observed === target[axis] && observed === certificationTarget[axis], `External surface evidence ${axis} differs from its profile/certification target`)
  }
  const authority = profileProvider.distributionVersionAuthority
  invariant(authority.kind === 'external-runtime-identity'
    && evidence.distribution.authority === authority.authority
    && evidence.distribution.productId === authority.productId
    && evidence.distribution.version === authority.version, 'External surface distribution identity differs from its canonical authority')
  invariant(certification.providerVersion === evidence.distribution.version, 'External surface evidence providerVersion is stale or mismatched')
  invariant(evidence.subject.profileDigest === identity.profileDigest && evidence.subject.harnessDigest === identity.harnessDigest, 'External surface evidence profile/Harness binding is stale')
  invariant(evidence.subject.hardGateContractDigest === externalHardGateContractDigest(matrix, certification.repositoryRole), 'External surface evidence hard-gate contract binding is stale')
  if (certification.surface === 'github-actions') {
    const expected = externalGitHubDesiredPolicy(desiredGithub, repositoryTarget, profileProvider)
    for (const field of [
      'repositoryId', 'repository', 'repositoryRole', 'defaultBranch', 'protectedRef', 'workflowPath',
      'workflowBlobSha256', 'workflowGitBlobSha', 'workflowSemanticSha256', 'event', 'artifactName',
      'checkName', 'checkAppId', 'rulesetName', 'rulesetPolicyDigest', 'desiredStateDigest', 'oidcSubject',
    ]) invariant(evidence.surfaceBinding[field] === expected[field], `GitHub Actions ${field} differs from the canonical inventory/desired policy`)
    invariant(evidence.surfaceBinding.requiredCheckName === expected.checkName, 'GitHub Actions ruleset required check differs from the canonical desired policy')
  }
  const generatedAt = new Date(evidence.run.generatedAt)
  const validUntil = new Date(evidence.run.validUntil)
  invariant(validUntil.getTime() === generatedAt.getTime() + runtimeProfile.maxEvidenceAgeSeconds * 1000, 'External surface evidence validity window does not match the active profile')
  invariant(generatedAt <= now && now <= validUntil, 'External surface evidence is not fresh')
  const certifiedAt = new Date(certificationTarget.certifiedAt ?? certification.certifiedAt)
  const expiresAt = new Date(certificationTarget.expiresAt ?? certification.expiresAt)
  invariant(certifiedAt >= generatedAt && certifiedAt <= validUntil && expiresAt <= validUntil, 'External surface certification is outside its evidence validity window')
  const expectedChecks = profileProvider.checks.map(({ id, driver }) => ({ id, driver })).sort((left, right) => compareUtf8Bytes(left.id, right.id))
  const actualChecks = evidence.checks.map(({ id, driver }) => ({ id, driver })).sort((left, right) => compareUtf8Bytes(left.id, right.id))
  invariant(stableStringify(actualChecks, 0) === stableStringify(expectedChecks, 0), 'External surface evidence check coverage differs from the active runtime profile')
  return true
}

export function loadContentAddressedExternalSurfaceEvidence(repoRoot, binding) {
  exactKeys(binding, [
    'evidenceKind', 'reference', 'artifactSha256', 'evidenceDigest', 'profileId', 'runId', 'targetId', 'targetDigest',
    'repositoryId', 'repository', 'repositoryRole', 'repositoryReadbackSha256',
    'operatingSystem', 'platform', 'arch', 'executionEnvironment', 'distributionVersion', 'pathClass',
    'distributionDigest', 'gitCommit', 'gitTree', 'profileDigest', 'harnessDigest', 'hardGateContractDigest',
  ], 'External surface certification evidence binding')
  invariant(binding.evidenceKind === 'external-runtime-surface-conformance', 'External surface certification evidence kind is invalid')
  invariant(/^infra\/governance\/evidence\/external-runtime\/[a-f0-9]{64}\.json$/.test(binding.reference ?? ''), 'External surface evidence reference must be content-addressed below infra/governance/evidence/external-runtime')
  invariant(HEX_SHA256.test(binding.artifactSha256 ?? '') && binding.reference.endsWith(`/${binding.artifactSha256}.json`), 'External surface evidence filename must equal its artifact sha256')
  const root = resolve(repoRoot)
  const path = resolve(root, binding.reference)
  invariant(path.startsWith(`${root}${sep}`) && existsSync(path), `External surface evidence is missing: ${binding.reference}`)
  let current = root
  for (const segment of relative(root, path).split(sep)) {
    current = resolve(current, segment)
    invariant(!lstatSync(current).isSymbolicLink(), `External surface evidence traverses a symlink: ${binding.reference}`)
  }
  invariant(lstatSync(path).isFile(), `External surface evidence is not a regular file: ${binding.reference}`)
  const bytes = readFileSync(path)
  invariant(sha256(bytes) === binding.artifactSha256, 'External surface evidence artifact bytes do not match sha256')
  return { evidence: JSON.parse(bytes.toString('utf8')), bytes }
}

export function externalSurfaceDistributionDigest(distribution) {
  return digest(stableStringify(distribution, 0))
}
