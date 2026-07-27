import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TextDecoder } from 'node:util'
import {
  GhApiClient,
  diffRepository,
  fetchRepositoryState,
  materializeProfile,
  validateModel,
} from '../../infra/governance/bin/reconcile-github.mjs'
import {
  assertExternalActivationReady,
  externalActivationPolicyDigest,
} from '../../infra/governance/lib/external-activation.mjs'
import {
  resolveVerifiedCandidateRelease,
  verifiedReleaseEvidenceDigest,
} from '../../infra/governance/lib/release-evidence.mjs'
import {
  releaseTrustPreflightEvidenceDigest,
  validateReleaseTrustPreflightEvidence,
} from '../../infra/governance/lib/release-trust-preflight.mjs'
import { resolveGitHubRuntimeValidationContext } from '../../infra/governance/lib/runtime-certification.mjs'
import { loadActiveDeepAuditRun, sha256, stableStringify } from './deep-audit-evidence-contract.mjs'
import {
  assertCiPlanCoverage,
  loadCanonicalCiModels,
  loadCiEvidencePlan,
} from './ci-evidence-plan.mjs'
import {
  buildCiObservationDocument,
  buildCiObservationPayload,
  ciStagingFilenames,
  validateCiObservationDocument,
} from './ci-evidence-pipeline.mjs'

function fail(message) {
  throw new Error(`CI live observation blocked:${message}`)
}

const clone = (value) => JSON.parse(JSON.stringify(value))
const strictUtf8 = new TextDecoder('utf-8', { fatal: true })
const RELEASE_TRUST_ARCHIVE_MAX_BYTES = 20 * 1024 * 1024
const RELEASE_TRUST_DOCUMENT_MAX_BYTES = 16 * 1024 * 1024
const CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1)
  return value >>> 0
}))

function crc32(bytes) {
  let value = 0xffffffff
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function exactSingleFileZip(archive, expectedName) {
  if (!Buffer.isBuffer(archive) || archive.length < 22 || archive.length > RELEASE_TRUST_ARCHIVE_MAX_BYTES) {
    fail('release trust artifact ZIP is empty, oversized, or not binary')
  }
  const minimum = Math.max(0, archive.length - 22 - 0xffff)
  let eocd = -1
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) !== 0x06054b50) continue
    const commentLength = archive.readUInt16LE(offset + 20)
    if (commentLength === 0 && offset + 22 === archive.length) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) fail('release trust artifact ZIP has no exact end-of-central-directory record')
  const disk = archive.readUInt16LE(eocd + 4)
  const centralDisk = archive.readUInt16LE(eocd + 6)
  const entriesOnDisk = archive.readUInt16LE(eocd + 8)
  const entries = archive.readUInt16LE(eocd + 10)
  const centralSize = archive.readUInt32LE(eocd + 12)
  const centralOffset = archive.readUInt32LE(eocd + 16)
  if (
    disk !== 0
      || centralDisk !== 0
      || entriesOnDisk !== 1
      || entries !== 1
      || centralOffset + centralSize !== eocd
      || centralSize < 46
      || centralOffset + 46 > archive.length
      || archive.readUInt32LE(centralOffset) !== 0x02014b50
  ) fail('release trust artifact ZIP is multipart, open, or structurally invalid')
  const flags = archive.readUInt16LE(centralOffset + 8)
  const method = archive.readUInt16LE(centralOffset + 10)
  const expectedCrc = archive.readUInt32LE(centralOffset + 16)
  const compressedSize = archive.readUInt32LE(centralOffset + 20)
  const uncompressedSize = archive.readUInt32LE(centralOffset + 24)
  const nameLength = archive.readUInt16LE(centralOffset + 28)
  const extraLength = archive.readUInt16LE(centralOffset + 30)
  const commentLength = archive.readUInt16LE(centralOffset + 32)
  const entryDisk = archive.readUInt16LE(centralOffset + 34)
  const localOffset = archive.readUInt32LE(centralOffset + 42)
  const centralEnd = centralOffset + 46 + nameLength + extraLength + commentLength
  if (
    entryDisk !== 0
      || (flags & ~(0x0008 | 0x0800)) !== 0
      || ![0, 8].includes(method)
      || uncompressedSize <= 0
      || uncompressedSize > RELEASE_TRUST_DOCUMENT_MAX_BYTES
      || compressedSize > RELEASE_TRUST_ARCHIVE_MAX_BYTES
      || extraLength !== 0
      || commentLength !== 0
      || centralEnd !== eocd
  ) fail('release trust artifact ZIP entry flags, method, size, or inventory is invalid')
  let name
  try {
    name = strictUtf8.decode(archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength))
  } catch {
    fail('release trust artifact ZIP entry name is not strict UTF-8')
  }
  if (name !== expectedName || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    fail('release trust artifact ZIP contains an unexpected entry')
  }
  if (localOffset !== 0 || localOffset + 30 > centralOffset || archive.readUInt32LE(localOffset) !== 0x04034b50) {
    fail('release trust artifact ZIP local header is invalid')
  }
  const localFlags = archive.readUInt16LE(localOffset + 6)
  const localMethod = archive.readUInt16LE(localOffset + 8)
  const localCrc = archive.readUInt32LE(localOffset + 14)
  const localCompressedSize = archive.readUInt32LE(localOffset + 18)
  const localUncompressedSize = archive.readUInt32LE(localOffset + 22)
  const localNameLength = archive.readUInt16LE(localOffset + 26)
  const localExtraLength = archive.readUInt16LE(localOffset + 28)
  const localNameStart = localOffset + 30
  const dataStart = localNameStart + localNameLength + localExtraLength
  const dataEnd = dataStart + compressedSize
  let localName
  try {
    localName = strictUtf8.decode(archive.subarray(localNameStart, localNameStart + localNameLength))
  } catch {
    fail('release trust artifact ZIP local entry name is not strict UTF-8')
  }
  if (
    localFlags !== flags
      || localMethod !== method
      || localName !== expectedName
      || localExtraLength !== 0
      || dataStart > dataEnd
      || dataEnd > centralOffset
  ) fail('release trust artifact ZIP local and central records disagree')
  if ((flags & 0x0008) === 0) {
    if (
      localCrc !== expectedCrc
        || localCompressedSize !== compressedSize
        || localUncompressedSize !== uncompressedSize
        || dataEnd !== centralOffset
    ) fail('release trust artifact ZIP local sizes or boundary differ from its central record')
  } else {
    if (
      localCrc !== 0
        || localCompressedSize !== 0
        || localUncompressedSize !== 0
        || dataEnd + 16 !== centralOffset
        || archive.readUInt32LE(dataEnd) !== 0x08074b50
        || archive.readUInt32LE(dataEnd + 4) !== expectedCrc
        || archive.readUInt32LE(dataEnd + 8) !== compressedSize
        || archive.readUInt32LE(dataEnd + 12) !== uncompressedSize
    ) fail('release trust artifact ZIP data descriptor is not exact')
  }
  const compressed = archive.subarray(dataStart, dataEnd)
  let bytes
  try {
    bytes = method === 0
      ? Buffer.from(compressed)
      : inflateRawSync(compressed, { maxOutputLength: RELEASE_TRUST_DOCUMENT_MAX_BYTES })
  } catch (error) {
    fail(`release trust artifact ZIP payload cannot be decompressed:${error.message}`)
  }
  if (bytes.length !== uncompressedSize || crc32(bytes) !== expectedCrc) {
    fail('release trust artifact ZIP payload size or CRC32 differs from its central record')
  }
  return bytes
}

function releaseTrustDocumentFromArchive(archive) {
  const bytes = exactSingleFileZip(archive, 'release-trust-preflight.json')
  try {
    return JSON.parse(strictUtf8.decode(bytes))
  } catch (error) {
    fail(`release trust artifact is not strict UTF-8 JSON:${error.message}`)
  }
}

function normalizedReconciliation(candidate) {
  return {
    repoId: candidate.repoId,
    github: candidate.github,
    ring: candidate.ring,
    defaultBranchHeadSha: candidate.defaultBranchHeadSha,
    observedStateDigest: candidate.observedStateDigest,
    requiredChecks: candidate.requiredChecks,
    conflicts: candidate.conflicts,
    actions: candidate.actions,
    deferredActions: candidate.deferredActions,
  }
}

function assertRuntimeRepositorySnapshot(runtimeValidationContext, repo, observed, remoteTree) {
  const runtimeIdentity = runtimeValidationContext.externalRepositoryIdentities?.[repo.id]
  if (!runtimeIdentity
    || runtimeIdentity.gitCommit !== observed.defaultBranchHeadSha
    || runtimeIdentity.gitTree !== observed.defaultBranchTreeSha
    || runtimeIdentity.gitTree !== remoteTree) {
    fail(`GitHub default-branch commit/tree changed between runtime certification and CI observation:${repo.id}`)
  }
  return runtimeIdentity
}

function assertRuntimeSnapshotsStable(initialContext, finalContext) {
  if (stableStringify(finalContext) !== stableStringify(initialContext)) {
    fail('GitHub runtime certification identities changed during CI live observation')
  }
  return true
}

function decodeContent(response, label) {
  if (!response || response.type && response.type !== 'file' || typeof response.content !== 'string' || response.encoding !== 'base64') fail(`${label} GitHub content response is invalid`)
  const compact = response.content.replaceAll(/\s/g, '')
  const bytes = Buffer.from(compact, 'base64')
  if (bytes.toString('base64') !== compact) fail(`${label} GitHub content is not canonical base64`)
  return bytes
}

function normalizeWorkflowPath(value) {
  return typeof value === 'string' ? value.replace(/@[^@]+$/, '') : value
}

function listWorkflowRuns(client, repo, { path, event, headSha, headBranch }) {
  const endpoint = `/repos/${repo.github}/actions/workflows/${encodeURIComponent(path)}/runs?status=completed&per_page=100`
  const response = client.request('GET', endpoint)
  if (!response || !Number.isSafeInteger(response.total_count) || response.total_count > 100 || !Array.isArray(response.workflow_runs)
    || response.workflow_runs.length !== response.total_count) fail(`workflow run readback requires unsupported pagination:${repo.id}/${path}`)
  return response.workflow_runs.filter((run) => normalizeWorkflowPath(run.path) === path
    && run.event === event
    && run.head_sha === headSha
    && run.head_branch === headBranch
    && run.status === 'completed'
    && run.conclusion === 'success')
    .sort((left, right) => Number(right.id) - Number(left.id))
}

function normalizeWorkflowRun(run) {
  if (!Number.isSafeInteger(run?.id) || run.id <= 0 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0) fail('workflow run numeric identity is invalid')
  return {
    id: String(run.id),
    runAttempt: run.run_attempt,
    path: normalizeWorkflowPath(run.path),
    event: run.event,
    headBranch: run.head_branch,
    headSha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion,
  }
}

function repositoryTree(client, repo, head) {
  const commit = client.request('GET', `/repos/${repo.github}/git/commits/${head}`)
  const tree = commit?.tree?.sha
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(tree ?? '')) fail(`GitHub commit tree readback is invalid:${repo.id}`)
  return tree
}

function mergedPullRequest(client, repo, head) {
  const response = client.request('GET', `/repos/${repo.github}/commits/${head}/pulls?per_page=100`)
  if (!Array.isArray(response) || response.length > 100) fail(`merged PR readback requires unsupported pagination:${repo.id}`)
  const matches = response.filter((item) => item?.state === 'closed' && item.merged_at && item.merge_commit_sha === head && item.base?.ref === repo.defaultBranch)
  if (matches.length !== 1) fail(`protected head must map to exactly one merged propagation PR:${repo.id}`)
  const pr = matches[0]
  return {
    number: pr.number,
    state: pr.state,
    mergedAt: new Date(pr.merged_at).toISOString(),
    mergeCommitSha: pr.merge_commit_sha,
    baseRef: pr.base.ref,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    authorLogin: pr.user?.login,
  }
}

function exactCheckRun(observed, name, workflowPath) {
  const matches = observed.checkRuns.filter((run) => run.name === name
    && run.head_sha === observed.defaultBranchHeadSha
    && run.workflowRun?.path === workflowPath
    && run.workflowRun?.event === 'push'
    && run.status === 'completed'
    && run.conclusion === 'success')
  if (matches.length !== 1) fail(`current protected head must have exactly one ${name} check from ${workflowPath}`)
  const run = clone(matches[0])
  run.id = String(run.id)
  run.workflowRun.id = String(run.workflowRun.id)
  return run
}

function exactProtectedCheckRun(client, repo, candidateHead, check, integration) {
  const response = client.request('GET', `/repos/${repo.github}/commits/${candidateHead}/check-runs?per_page=100`)
  if (!response || !Number.isSafeInteger(response.total_count) || response.total_count > 100
    || !Array.isArray(response.check_runs) || response.check_runs.length !== response.total_count) {
    fail(`authority PR check readback requires unsupported pagination:${check.context}`)
  }
  const matches = response.check_runs.filter((run) => run.name === check.context
    && run.head_sha === candidateHead
    && run.app?.id === integration.id
    && run.app?.slug === integration.slug
    && run.status === 'completed'
    && run.conclusion === 'success')
  if (matches.length !== 1) fail(`authority PR must have exactly one successful ${check.context} check from the reviewed App`)
  return { ...clone(matches[0]), id: String(matches[0].id), workflowRun: null }
}

function downloadTrustEvidence(repository, run, client) {
  const artifacts = client.request('GET', `/repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`)
  if (!artifacts || !Number.isSafeInteger(artifacts.total_count) || artifacts.total_count > 100
    || !Array.isArray(artifacts.artifacts) || artifacts.artifacts.length !== artifacts.total_count) fail('release trust artifact readback requires unsupported pagination')
  const expectedName = `release-trust-${run.id}-${run.runAttempt}`
  const matches = artifacts.artifacts.filter((item) => item?.name === expectedName
    && item.expired === false
    && Number.isSafeInteger(item.id)
    && item.id > 0
    && Number.isSafeInteger(item.size_in_bytes)
    && item.size_in_bytes > 0
    && item.size_in_bytes <= RELEASE_TRUST_ARCHIVE_MAX_BYTES
    && /^sha256:[a-f0-9]{64}$/.test(item.digest ?? ''))
  if (matches.length !== 1) fail(`release workflow must expose exactly one live ${expectedName} artifact`)
  if (typeof client.requestBytes !== 'function') fail('live GitHub client lacks the digest-preserving binary artifact transport')
  const archive = client.requestBytes(
    'GET',
    `/repos/${repository}/actions/artifacts/${matches[0].id}/zip`,
    { maxOutputBytes: RELEASE_TRUST_ARCHIVE_MAX_BYTES },
  )
  if (archive.length !== matches[0].size_in_bytes || `sha256:${sha256(archive)}` !== matches[0].digest) {
    fail('release trust artifact raw ZIP differs from its GitHub API size/digest readback')
  }
  return releaseTrustDocumentFromArchive(archive)
}

function trustExpected(models, bindings, authority, candidate, stage, observedAt) {
  return {
    repository: authority.github,
    releaseTag: `v${candidate.version}`,
    releaseCommit: candidate.sourceCommit,
    releaseTree: candidate.sourceTree,
    desired: models.desired,
    inventory: models.inventory,
    activationRequirements: models.externalActivationRequirements,
    activationInventory: models.inventory,
    activationDesired: models.desired,
    activationPolicy: models.externalActivationPolicy,
    mutationBoundaryContract: models.githubMutationBoundaryContract,
    expectedActivationPolicyDigest: externalActivationPolicyDigest(models.externalActivationPolicy),
    rings: models.rings,
    requirementsSha256: bindings.find((item) => item.name === 'externalActivationRequirements').sha256,
    releaseTagAuthorizationPolicy: models.releaseTagAuthorizationPolicy,
    issuerRegistry: models.issuers,
    runId: stage.id,
    runAttempt: String(stage.runAttempt),
    now: observedAt,
  }
}

function consumerSourceRun(client, repo, pr) {
  const runs = listWorkflowRuns(client, repo, {
    path: '.github/workflows/sync-design-system.yml',
    event: 'repository_dispatch',
    headSha: pr.baseSha,
    headBranch: repo.defaultBranch,
  })
  if (runs.length !== 1) fail(`consumer propagation PR must map to exactly one protected-base upgrade run:${repo.id}`)
  return normalizeWorkflowRun(runs[0])
}

async function collectLiveCiObservationCore({ repoRoot, now, client }) {
  repoRoot = resolve(repoRoot)
  const planState = loadCiEvidencePlan({ repoRoot })
  const activeRun = loadActiveDeepAuditRun({ repoRoot, requireCurrent: true })
  assertCiPlanCoverage(planState, activeRun.manifest)
  const { models, bindings } = loadCanonicalCiModels(planState, { repoRoot })
  const runtimeValidationContext = resolveGitHubRuntimeValidationContext({
    client,
    repoRoot,
    inventory: models.inventory,
    certifications: models.certifications,
    runtimeProfile: models.runtimeProfile,
    live: true,
  })
  validateModel(
    models.inventory,
    models.desired,
    models.rings,
    models.certifications,
    models.waivers,
    now,
    models.issuers,
    models.runtimeProfile,
    runtimeValidationContext,
  )
  const activationDigest = externalActivationPolicyDigest(models.externalActivationPolicy)
  for (const scope of ['release', 'fleet-rollout']) assertExternalActivationReady(models.externalActivationRequirements, {
    scope,
    inventory: models.inventory,
    desired: models.desired,
    mutationBoundaryContract: models.githubMutationBoundaryContract,
    rings: models.rings,
    issuerRegistry: models.issuers,
    policy: models.externalActivationPolicy,
    expectedPolicyDigest: activationDigest,
    now,
  })
  const candidate = models.rings.candidateRelease
  if (!candidate || candidate.sourceTree !== activeRun.manifest.tree) fail('active run tree is not the canonical candidate release tree')

  const verifiedReleaseEvidence = await resolveVerifiedCandidateRelease(candidate)
  const repositoryRows = []
  const observedById = new Map()
  const materializedById = new Map()
  for (const repo of models.inventory.repositories) {
    const assignment = models.rings.assignments[repo.id]
    const eligibility = { eligible: true, promoted: true, ring: assignment.ring, wave: assignment.wave, blockers: [] }
    const materialized = materializeProfile(repo, models.desired, models.rings, eligibility)
    materializedById.set(repo.id, materialized)
    const observed = fetchRepositoryState(client, repo, materialized, models.desired)
    const reconciliation = normalizedReconciliation(diffRepository(repo, materialized, clone(observed), models.desired, now))
    if (reconciliation.actions.length || reconciliation.deferredActions.length || reconciliation.conflicts.length) fail(`managed GitHub state is not exactly reconciled:${repo.id}`)
    const remoteTree = repositoryTree(client, repo, observed.defaultBranchHeadSha)
    const runtimeIdentity = assertRuntimeRepositorySnapshot(runtimeValidationContext, repo, observed, remoteTree)
    const row = {
      repositoryId: repo.id,
      repository: repo.github,
      role: repo.role,
      remoteTree,
      certificationIdentity: clone(runtimeIdentity),
      observed,
      observedSha256: sha256(stableStringify(observed)),
      reconciliation,
    }
    repositoryRows.push(row)
    observedById.set(repo.id, row)
  }
  const authority = models.inventory.repositories.find((item) => item.role === 'authority')
  const authorityReadback = observedById.get(authority.id)
  if (authorityReadback.observed.defaultBranchHeadSha !== candidate.sourceCommit
    || authorityReadback.remoteTree !== candidate.sourceTree) fail('authority protected main is not the exact candidate release commit/tree')
  const authorityPr = mergedPullRequest(client, authority, candidate.sourceCommit)
  const candidateHeadTree = repositoryTree(client, authority, activeRun.manifest.head)
  const mergeCommitTree = repositoryTree(client, authority, candidate.sourceCommit)
  if (authorityPr.headSha !== activeRun.manifest.head
    || candidateHeadTree !== activeRun.manifest.tree
    || mergeCommitTree !== candidate.sourceTree
    || candidateHeadTree !== mergeCommitTree) fail('authority merged PR does not preserve the active candidate tree')
  const authorityChecks = materializedById.get(authority.id).requiredChecks.map((check) => exactProtectedCheckRun(
    client,
    authority,
    activeRun.manifest.head,
    check,
    models.desired.integrations[check.integration],
  ))
  const stageCandidates = listWorkflowRuns(client, authority, {
    path: '.github/workflows/release.yml',
    event: 'repository_dispatch',
    headSha: candidate.sourceCommit,
    headBranch: authority.defaultBranch,
  })
  if (stageCandidates.length === 0) fail('no successful exact protected release run exists')
  const stageWorkflowRun = normalizeWorkflowRun(stageCandidates[0])
  const trustPreflightEvidence = downloadTrustEvidence(authority.github, stageWorkflowRun, client)
  const expectedTrust = trustExpected(models, bindings, authority, candidate, stageWorkflowRun, now)
  validateReleaseTrustPreflightEvidence(trustPreflightEvidence, expectedTrust)
  const mirrorCandidates = listWorkflowRuns(client, authority, {
    path: '.github/workflows/mirror-to-published-template.yml',
    event: 'workflow_run',
    headSha: candidate.sourceCommit,
    headBranch: authority.defaultBranch,
  })
  if (mirrorCandidates.length !== 1) fail('release commit must map to exactly one successful workflow_run mirror')
  const mirrorWorkflowRun = normalizeWorkflowRun(mirrorCandidates[0])
  const release = {
    candidateRelease: clone(candidate),
    authorityTransition: {
      sourcePullRequest: authorityPr,
      candidateHeadTree,
      mergeCommitTree,
      requiredChecks: authorityChecks,
    },
    verifiedReleaseEvidence,
    verifiedReleaseEvidenceDigest: verifiedReleaseEvidenceDigest(verifiedReleaseEvidence, candidate),
    trustPreflightEvidence,
    trustPreflightDigest: releaseTrustPreflightEvidenceDigest(trustPreflightEvidence, expectedTrust),
    stageWorkflowRun,
    mirrorWorkflowRun,
  }

  const propagation = []
  for (const repo of models.inventory.repositories.filter((item) => item.role !== 'authority')) {
    const readback = observedById.get(repo.id)
    const head = readback.observed.defaultBranchHeadSha
    const pr = mergedPullRequest(client, repo, head)
    const packageJsonResponse = client.request('GET', `/repos/${repo.github}/contents/package.json?ref=${head}`)
    const packageLockResponse = client.request('GET', `/repos/${repo.github}/contents/package-lock.json?ref=${head}`)
    const auditResponse = client.request('GET', `/repos/${repo.github}/contents/.github/workflows/audit.yml?ref=${head}`)
    const sourceWorkflowRun = repo.role === 'template-mirror' ? mirrorWorkflowRun : consumerSourceRun(client, repo, pr)
    propagation.push({
      repositoryId: repo.id,
      repository: repo.github,
      role: repo.role,
      version: candidate.version,
      remoteHead: head,
      remoteTree: readback.remoteTree,
      packageJson: JSON.parse(decodeContent(packageJsonResponse, `${repo.id} package.json`).toString('utf8')),
      packageLock: JSON.parse(decodeContent(packageLockResponse, `${repo.id} package-lock.json`).toString('utf8')),
      sourcePullRequest: pr,
      sourceWorkflowRun,
      auditWorkflow: {
        path: '.github/workflows/audit.yml',
        refHead: head,
        content: decodeContent(auditResponse, `${repo.id} audit workflow`).toString('utf8'),
        declaredBlobSha: auditResponse.sha,
      },
      checks: planState.plan.observation.consumerChecks.map((check) => ({
        id: check.id,
        run: exactCheckRun(readback.observed, check.checkName, check.workflow),
      })),
    })
  }
  const finalRuntimeValidationContext = resolveGitHubRuntimeValidationContext({
    client,
    repoRoot,
    inventory: models.inventory,
    certifications: models.certifications,
    runtimeProfile: models.runtimeProfile,
    live: true,
  })
  assertRuntimeSnapshotsStable(runtimeValidationContext, finalRuntimeValidationContext)
  const payload = buildCiObservationPayload({
    planState,
    activeRun,
    modelBindings: bindings,
    repositories: repositoryRows,
    release,
    propagation,
    observedAt: now,
  })
  const document = buildCiObservationDocument(payload)
  validateCiObservationDocument(document, { repoRoot, planState, activeRun, models, modelBindings: bindings, now })
  return { document, planState, activeRun }
}

export async function collectLiveCiObservation(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('production observer options must be an object')
  const allowed = new Set(['repoRoot'])
  const unknown = Object.keys(options).filter((key) => !allowed.has(key))
  if (unknown.length) fail(`production observer API forbids override options:${unknown.join(',')}`)
  const { repoRoot = process.cwd() } = options
  return collectLiveCiObservationCore({ repoRoot, now: new Date(), client: new GhApiClient() })
}

// Read-only fixture seam. It can return an in-memory observation but exposes no
// staging/import/signing operation; production collection never calls it.
export const ciLiveObserverTestHarness = Object.freeze({
  collect({ repoRoot = process.cwd(), now, client } = {}) {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !client || typeof client.request !== 'function') {
      fail('test observer requires an explicit clock and read-only API client')
    }
    return collectLiveCiObservationCore({ repoRoot, now, client })
  },
  assertRepositorySnapshot(runtimeValidationContext, repo, observed, remoteTree) {
    return clone(assertRuntimeRepositorySnapshot(runtimeValidationContext, repo, observed, remoteTree))
  },
  assertSnapshotsStable(initialContext, finalContext) {
    return assertRuntimeSnapshotsStable(initialContext, finalContext)
  },
  extractReleaseTrustArtifact(archive) {
    return clone(releaseTrustDocumentFromArchive(archive))
  },
})

function writeCiObservationStaging(stagingDirectory, document) {
  const directory = resolve(stagingDirectory)
  if (existsSync(directory)) {
    const info = lstatSync(directory)
    if (!info.isDirectory() || info.isSymbolicLink() || readdirSync(directory).length !== 0) fail('staging directory must be a new or empty real directory')
  } else {
    const parent = resolve(dirname(directory))
    const parentInfo = lstatSync(parent)
    if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) fail('staging parent must be a real directory')
    mkdirSync(directory, { mode: 0o700 })
  }
  const filename = ciStagingFilenames(document).observation
  const bytes = Buffer.from(`${stableStringify(document, 2)}\n`)
  const target = join(directory, filename)
  writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 })
  return { directory, path: target, filename, payloadSha256: document.payloadSha256 }
}

export async function observeLiveCiObservationToStaging(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('production staging options must be an object')
  const allowed = new Set(['repoRoot', 'stagingDirectory'])
  const unknown = Object.keys(options).filter((key) => !allowed.has(key))
  if (unknown.length) fail(`production staging API forbids override options:${unknown.join(',')}`)
  const { repoRoot = process.cwd(), stagingDirectory } = options
  if (typeof stagingDirectory !== 'string' || stagingDirectory.length === 0) fail('production staging directory is required')
  const observed = await collectLiveCiObservation({ repoRoot })
  const staged = writeCiObservationStaging(stagingDirectory, observed.document)
  return { observed, staged }
}
