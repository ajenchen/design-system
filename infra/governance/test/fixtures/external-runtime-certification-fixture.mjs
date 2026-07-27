import { sign } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { resolveCertificationCanary, sha256, stableStringify } from '../../lib/common.mjs'
import { buildRepositorySubjectProof } from '../../lib/repository-subject-proof.mjs'
import {
  externalGitHubCheckRunDigest,
  externalGitHubControlPlaneDigest,
  externalGitHubDesiredPolicy,
  externalGitHubRulesetReadbackDigest,
  externalGitHubWorkflowRunDigest,
  externalHardGateContractDigest,
  externalManagedControlPlaneDigest,
  externalManagedSessionDigest,
  externalRepositoryReadbackDigest,
  externalSurfaceDistributionDigest,
  externalSurfaceDistributionIdentityDigest,
  externalSurfaceEvidenceSigningPayload,
} from '../../lib/external-surface-evidence.mjs'
import { runtimeTargetDigest } from '../../lib/provider-runtime-conformance.mjs'

function setReceipt(evidence, driver, receiptSha256) {
  const matches = evidence.checks.filter(check => check.driver === driver)
  if (matches.length !== 1) throw new Error(`External certification fixture expected one ${driver} check`)
  matches[0].receiptSha256 = receiptSha256
}

function signedEvidence(evidence, runtimeProfile, signer) {
  const value = structuredClone(evidence)
  const { attestation: ignoredAttestation, evidenceDigest: ignoredDigest, ...unsigned } = value
  value.evidenceDigest = `sha256:${sha256(stableStringify(unsigned, 0))}`
  value.attestation = {
    schemaVersion: 1,
    kind: 'external-runtime-surface-evidence-attestation',
    status: 'verified',
    issuerId: signer.keyId,
    issuerRegistryDigest: runtimeProfile.issuerRegistryDigest,
    algorithm: 'ed25519',
    evidenceDigest: value.evidenceDigest,
    runId: value.run.runId,
    signature: null,
    coSignatures: [],
  }
  value.attestation.signature = sign(null, externalSurfaceEvidenceSigningPayload(value, signer.keyId), signer.privateKey).toString('base64')
  return value
}

function repositoryIdentity(repository) {
  const gitCommit = sha256(`external-fixture:${repository.id}:commit`).slice(0, 40)
  const gitTree = sha256(`external-fixture:${repository.id}:tree`).slice(0, 40)
  return {
    gitCommit,
    gitTree,
    subjectProofs: {
      [gitCommit]: buildRepositorySubjectProof(repository, {
        subjectCommit: gitCommit,
        subjectTree: gitTree,
        carrierCommit: gitCommit,
        carrierTree: gitTree,
      }),
    },
  }
}

function writeEvidence(root, evidence) {
  const bytes = Buffer.from(`${stableStringify(evidence)}\n`)
  const artifactSha256 = sha256(bytes)
  const reference = `infra/governance/evidence/external-runtime/${artifactSha256}.json`
  mkdirSync(resolve(root, 'infra/governance/evidence/external-runtime'), { recursive: true })
  writeFileSync(resolve(root, reference), bytes)
  return { reference, artifactSha256 }
}

export function createExternalRuntimeCertificationFixture({
  inventory,
  desired,
  certifications: baseCertifications,
  matrix,
  runtimeProfile,
  signer,
  now,
} = {}) {
  if (!Array.isArray(inventory?.repositories) || !desired || !baseCertifications || !matrix || !runtimeProfile || !signer || !(now instanceof Date)) {
    throw new Error('External runtime certification fixture inputs are invalid')
  }
  const root = mkdtempSync(resolve(tmpdir(), 'external-certification-fixture-'))
  try {
    const certifications = structuredClone(baseCertifications)
    const externalRepositoryIdentities = Object.fromEntries(inventory.repositories.map(repository => [repository.id, repositoryIdentity(repository)]))
    const runtimeIdentity = {
      gitCommit: sha256('external-fixture:control-plane-commit').slice(0, 40),
      gitTree: sha256('external-fixture:control-plane-tree').slice(0, 40),
      profileDigest: `sha256:${sha256('external-fixture:runtime-profile')}`,
      harnessDigest: `sha256:${sha256('external-fixture:harness')}`,
    }
    let fixtureIndex = 0
    for (const certification of certifications.certifications.filter(item => item.status === 'certified' || item.status === 'conditional')) {
      const profileId = matrix.providers?.[certification.provider]?.runtimeKinds?.[certification.runtimeKind]?.runtimeProfilesBySurface?.[certification.surface]
      const profileProvider = runtimeProfile.providers.find(item => item.id === profileId)
      if (profileProvider?.executionMode !== 'external-attested') continue
      const repository = resolveCertificationCanary(inventory, certification.repositoryRole)
      const identity = externalRepositoryIdentities[repository.id]
      const target = profileProvider.certificationTargets[0]
      const authority = profileProvider.distributionVersionAuthority
      const generatedAt = new Date(now.getTime() - 60_000)
      const validUntil = new Date(generatedAt.getTime() + runtimeProfile.maxEvidenceAgeSeconds * 1000)
      const policy = certification.surface === 'github-actions'
        ? externalGitHubDesiredPolicy(desired, repository, profileProvider)
        : null
      const evidence = {
        schemaVersion: 1,
        kind: 'external-runtime-surface-conformance',
        status: 'pass',
        profile: {
          id: profileProvider.id,
          adapterProviderId: profileProvider.adapterProviderId,
          runtimeKind: profileProvider.runtimeKind,
          surface: profileProvider.certificationSurface,
          repositoryId: repository.id,
          repository: repository.github,
          repositoryRole: repository.role,
        },
        run: {
          runId: `10000000-0000-4000-8000-${String(++fixtureIndex).padStart(12, '0')}`,
          generatedAt: generatedAt.toISOString(),
          validUntil: validUntil.toISOString(),
          operatingSystem: target.operatingSystem,
          platform: target.platform,
          arch: target.arch,
          executionEnvironment: target.executionEnvironment,
          pathClass: target.pathClass,
          targetId: target.id,
          targetDigest: runtimeTargetDigest(target),
        },
        subject: {
          gitCommit: identity.gitCommit,
          gitTree: identity.gitTree,
          profileDigest: runtimeIdentity.profileDigest,
          harnessDigest: runtimeIdentity.harnessDigest,
          hardGateContractDigest: externalHardGateContractDigest(matrix, repository.role),
        },
        distribution: {
          authority: authority.authority,
          productId: authority.productId,
          version: authority.version,
          identityDigest: null,
        },
        checks: profileProvider.checks.map(check => ({ id: check.id, driver: check.driver, status: 'pass', receiptSha256: '0'.repeat(64) })),
        surfaceBinding: null,
        attestation: null,
        evidenceDigest: null,
      }
      evidence.distribution.identityDigest = externalSurfaceDistributionIdentityDigest(evidence.distribution)
      if (certification.surface === 'github-actions') {
        evidence.surfaceBinding = {
          kind: 'github-actions-readback',
          evidenceRunId: evidence.run.runId,
          repositoryId: repository.id,
          repository: repository.github,
          repositoryRole: repository.role,
          defaultBranch: repository.defaultBranch,
          repositoryReadbackSha256: externalRepositoryReadbackDigest(repository, evidence.subject),
          protectedRef: policy.protectedRef,
          workflowPath: policy.workflowPath,
          workflowBlobSha256: policy.workflowBlobSha256,
          workflowGitBlobSha: policy.workflowGitBlobSha,
          workflowSemanticSha256: policy.workflowSemanticSha256,
          runDatabaseId: String(30_000_000 + fixtureIndex),
          runAttempt: 1,
          event: policy.event,
          headSha: identity.gitCommit,
          treeSha: identity.gitTree,
          artifactName: policy.artifactName,
          artifactSha256: sha256(`external-fixture:${repository.id}:artifact`),
          checkName: policy.checkName,
          checkConclusion: 'success',
          checkAppId: policy.checkAppId,
          checkRunSha256: '0'.repeat(64),
          workflowRunReadbackSha256: '0'.repeat(64),
          rulesetId: String(40_000_000 + fixtureIndex),
          rulesetName: policy.rulesetName,
          rulesetEnforcement: 'active',
          requiredCheckName: policy.checkName,
          rulesetPolicyDigest: policy.rulesetPolicyDigest,
          rulesetReadbackSha256: '0'.repeat(64),
          desiredStateDigest: policy.desiredStateDigest,
          controlPlaneReadbackSha256: '0'.repeat(64),
          oidcIssuer: 'https://token.actions.githubusercontent.com',
          oidcSubject: policy.oidcSubject,
          oidcSubjectSha256: sha256(policy.oidcSubject),
        }
        evidence.surfaceBinding.checkRunSha256 = externalGitHubCheckRunDigest(evidence.surfaceBinding)
        evidence.surfaceBinding.rulesetReadbackSha256 = externalGitHubRulesetReadbackDigest(evidence.surfaceBinding)
        evidence.surfaceBinding.controlPlaneReadbackSha256 = externalGitHubControlPlaneDigest(evidence)
        evidence.surfaceBinding.workflowRunReadbackSha256 = externalGitHubWorkflowRunDigest(evidence.surfaceBinding)
        setReceipt(evidence, 'external-distribution-identity', evidence.distribution.identityDigest.slice('sha256:'.length))
        setReceipt(evidence, 'external-hard-gate-receipt', evidence.surfaceBinding.artifactSha256)
        setReceipt(evidence, 'github-workflow-run-binding', evidence.surfaceBinding.workflowRunReadbackSha256)
        setReceipt(evidence, 'github-ruleset-readback', evidence.surfaceBinding.rulesetReadbackSha256)
      } else {
        evidence.surfaceBinding = {
          kind: 'managed-runtime-readback',
          repositoryId: repository.id,
          repository: repository.github,
          repositoryRole: repository.role,
          defaultBranch: repository.defaultBranch,
          sessionIdentitySha256: '0'.repeat(64),
          repositoryReadbackSha256: externalRepositoryReadbackDigest(repository, evidence.subject),
          distributionReadbackSha256: evidence.distribution.identityDigest.slice('sha256:'.length),
          hardGateReceiptSha256: sha256(`external-fixture:${profileProvider.id}:hard-gate`),
          controlPlaneReadbackSha256: '0'.repeat(64),
        }
        evidence.surfaceBinding.sessionIdentitySha256 = externalManagedSessionDigest(evidence)
        evidence.surfaceBinding.controlPlaneReadbackSha256 = externalManagedControlPlaneDigest(evidence)
        setReceipt(evidence, 'external-distribution-identity', evidence.surfaceBinding.distributionReadbackSha256)
        setReceipt(evidence, 'external-hard-gate-receipt', evidence.surfaceBinding.hardGateReceiptSha256)
        setReceipt(evidence, 'external-runtime-session-binding', evidence.surfaceBinding.sessionIdentitySha256)
      }
      const signed = signedEvidence(evidence, runtimeProfile, signer)
      const artifact = writeEvidence(root, signed)
      certification.providerVersion = target.distributionVersion
      certification.certifiedAt = now.toISOString()
      certification.expiresAt = new Date(Math.min(validUntil.getTime(), now.getTime() + 60 * 60 * 1000)).toISOString()
      certification.platformMatrix = [{ ...target, status: 'certified', limitations: [] }]
      certification.runtimeEvidence = {
        evidenceKind: signed.kind,
        reference: artifact.reference,
        artifactSha256: artifact.artifactSha256,
        evidenceDigest: signed.evidenceDigest,
        profileId: profileProvider.id,
        runId: signed.run.runId,
        targetId: target.id,
        targetDigest: signed.run.targetDigest,
        repositoryId: repository.id,
        repository: repository.github,
        repositoryRole: repository.role,
        repositoryReadbackSha256: signed.surfaceBinding.repositoryReadbackSha256,
        operatingSystem: target.operatingSystem,
        platform: target.platform,
        arch: target.arch,
        executionEnvironment: target.executionEnvironment,
        distributionVersion: target.distributionVersion,
        pathClass: target.pathClass,
        distributionDigest: externalSurfaceDistributionDigest(signed.distribution),
        ...signed.subject,
      }
    }
    return {
      certifications,
      runtimeValidationContext: { repoRoot: root, runtimeIdentity, externalRepositoryIdentities },
      dispose: () => rmSync(root, { recursive: true, force: true }),
    }
  } catch (error) {
    rmSync(root, { recursive: true, force: true })
    throw error
  }
}
