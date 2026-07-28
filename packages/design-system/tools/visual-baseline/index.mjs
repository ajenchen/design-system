import { createPublicKey, verify } from 'node:crypto'
import { existsSync, lstatSync, readdirSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { PNG } from 'pngjs'
import {
  SHA256_PATTERN,
  applyAtomicOperations,
  assertSafeExistingPath,
  canonicalRoot,
  compareUtf8Bytes,
  exactKeys,
  isContained,
  portablePath,
  readStableFile,
  sha256,
  stableStringify,
} from '../shared/safe-filesystem.mjs'
import {
  assertClosedGitLocalConfiguration,
  runClosedGit,
} from '../../ds-canonical/fork/common/closed-tool-execution.mjs'

export const VISUAL_BASELINE_TOOL_VERSION = '1.0.0'
export const VISUAL_BASELINE_PNG_PARSER_VERSION = 'pngjs@7.0.0'
const PROPOSAL_KIND = 'qijenchen-visual-baseline-proposal'
const REVIEW_DOMAIN = 'qijenchen.visual-baseline.review.v1'
const REVIEW_POLICY_SCHEMA_REFERENCE = './schemas/visual-baseline-review-policy.schema.json'
const REVIEW_ISSUERS_RELATIVE_PATH = 'trust/issuers.json'
const REVIEW_TRUST_ROLES = Object.freeze([
  Object.freeze({
    id: 'authority',
    markerPath: 'infra/governance',
    policyPath: 'infra/governance/visual-baseline-review-policy.json',
    issuerRegistryPath: 'infra/governance/trust/issuers.json',
  }),
  Object.freeze({
    id: 'consumer',
    markerPath: 'governance',
    policyPath: 'governance/visual-baseline-review-policy.json',
    issuerRegistryPath: 'governance/trust/issuers.json',
  }),
])
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function fail(message) {
  throw new Error(`visual baseline review blocked:${message}`)
}

function readJsonAuthority(root, path, label) {
  const read = readStableFile(root, path, label, fail)
  let value
  try { value = JSON.parse(read.bytes.toString('utf8')) } catch (error) { fail(`${label} is invalid JSON:${error.message}`) }
  return { ...read, value }
}

function gitRead(root, args, label) {
  try {
    assertClosedGitLocalConfiguration(root)
    const result = runClosedGit(args, {
      cwd: resolve(root),
      timeoutMs: 10_000,
    })
    if (result.error || result.signal !== null || result.status !== 0) {
      fail(`${label} is unavailable through the closed Git runtime`)
    }
    const value = result.stdout.trim()
    if (!value || /[\0\r\n]/.test(value)) fail(`${label} is empty or non-canonical`)
    return value
  } catch (error) {
    if (String(error.message).startsWith('visual baseline review blocked:')) throw error
    fail(`${label} is unavailable:${String(error.stderr || error.message).trim()}`)
  }
}

function canonicalRemoteIdentity(value) {
  let remote = value
  if (/^[^@\s]+@[^:\s]+:.+$/.test(remote)) {
    const match = remote.match(/^[^@\s]+@([^:\s]+):(.+)$/)
    remote = `ssh://${match[1]}/${match[2]}`
  }
  let parsed
  try { parsed = new URL(remote) } catch { fail('origin remote must be a canonical HTTPS or SSH repository URL') }
  if (!['https:', 'ssh:'].includes(parsed.protocol) || !parsed.hostname || parsed.search || parsed.hash || parsed.pathname.includes('%')) {
    fail('origin remote must be a canonical credential-free HTTPS or SSH repository URL')
  }
  const path = parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '')
  if (!path || path.split('/').some((part) => !part || part === '.' || part === '..' || /[\\\0\r\n]/.test(part))) {
    fail('origin remote repository path is invalid')
  }
  const host = `${parsed.hostname.toLowerCase()}${parsed.port ? `:${parsed.port}` : ''}`
  return `${host}/${path}`
}

function repositoryBinding(root) {
  const topLevel = canonicalRoot(gitRead(root, ['rev-parse', '--show-toplevel'], 'Git repository top level'), 'Git repository top level', fail)
  if (topLevel !== root) fail('visual baseline --root must equal the Git repository top level')
  const headCommit = gitRead(root, ['rev-parse', '--verify', 'HEAD^{commit}'], 'Git HEAD commit')
  const headTree = gitRead(root, ['rev-parse', '--verify', 'HEAD^{tree}'], 'Git HEAD tree')
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(headCommit) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(headTree)) {
    fail('Git HEAD commit/tree identity is invalid')
  }
  return {
    identity: canonicalRemoteIdentity(gitRead(root, ['remote', 'get-url', 'origin'], 'Git origin remote')),
    headCommit,
    headTree,
  }
}

function assertRepositoryBinding(root, expected) {
  if (stableStringify(repositoryBinding(root)) !== stableStringify(expected)) {
    fail('repository origin/HEAD commit/tree differs from the proposal trust domain')
  }
}

function selectReviewTrustRole(root) {
  const present = REVIEW_TRUST_ROLES.filter((role) => existsSync(resolve(root, role.policyPath)))
  if (present.length > 1) fail('authority and consumer visual-review policies cannot coexist in one repository')
  if (present.length === 1) return present[0]
  return REVIEW_TRUST_ROLES.find((role) => role.id === (
    existsSync(resolve(root, REVIEW_TRUST_ROLES[0].markerPath)) ? 'authority' : 'consumer'
  ))
}

function roleForTrustDescriptor(descriptor) {
  return REVIEW_TRUST_ROLES.find((role) => role.policyPath === descriptor.policyPath) ?? null
}

function loadReviewTrust(root) {
  const role = selectReviewTrustRole(root)
  const unavailable = {
    status: 'not-activated',
    policyPath: role.policyPath,
    policySha256: null,
    issuerRegistryPath: role.issuerRegistryPath,
    issuerRegistrySha256: null,
    managedActivationEvidencePath: null,
    managedActivationEvidenceSha256: null,
  }
  if (!existsSync(resolve(root, role.policyPath))) return { descriptor: unavailable, policy: null, issuers: null, activation: null }
  const policyRead = readJsonAuthority(root, role.policyPath, 'visual review trust policy')
  const policy = policyRead.value
  exactKeys(policy, ['$schema', 'schemaVersion', 'kind', 'status', 'issuerRegistryPath', 'issuerRegistrySha256', 'human', 'managedBroker'], 'visual review trust policy', fail)
  if (policy.schemaVersion !== 1 || policy.kind !== 'visual-baseline-review-trust-policy'
    || policy.$schema !== REVIEW_POLICY_SCHEMA_REFERENCE
    || !['active', 'not-activated'].includes(policy.status) || policy.issuerRegistryPath !== REVIEW_ISSUERS_RELATIVE_PATH) fail('visual review trust policy identity is invalid')
  exactKeys(policy.human, ['status', 'allowedKeyIds'], 'visual review human policy', fail)
  exactKeys(policy.managedBroker, ['status', 'allowedKeyIds', 'activationEvidencePath', 'activationEvidenceSha256', 'modelAuthorityPolicyDigest', 'brokerPolicyDigest'], 'visual review managed-broker policy', fail)
  for (const branch of [policy.human, policy.managedBroker]) {
    if (!['active', 'not-activated'].includes(branch.status) || !Array.isArray(branch.allowedKeyIds)
      || new Set(branch.allowedKeyIds).size !== branch.allowedKeyIds.length
      || branch.allowedKeyIds.some((key) => typeof key !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(key))) fail('visual review trust policy key allowlist is invalid')
  }
  if ((policy.status === 'active') !== (policy.human.status === 'active')) fail('visual review trust policy aggregate activation status is inconsistent')
  if ((policy.human.status === 'active' && policy.human.allowedKeyIds.length === 0)
    || (policy.human.status === 'not-activated' && policy.human.allowedKeyIds.length !== 0)) fail('visual review trust branch activation/key allowlist is inconsistent')
  if (policy.managedBroker.status !== 'not-activated' || policy.managedBroker.allowedKeyIds.length !== 0
    || [policy.managedBroker.activationEvidencePath, policy.managedBroker.activationEvidenceSha256,
      policy.managedBroker.modelAuthorityPolicyDigest, policy.managedBroker.brokerPolicyDigest].some((value) => value !== null)) {
    fail('managed visual review is reserved but not activated in this tool version; a future version must reuse the canonical signed model-broker receipt validators')
  }
  const issuerRead = readJsonAuthority(root, role.issuerRegistryPath, 'visual review issuer registry')
  if (!SHA256_PATTERN.test(policy.issuerRegistrySha256) || issuerRead.sha256 !== policy.issuerRegistrySha256) fail('visual review issuer registry digest is stale')
  const issuers = issuerRead.value
  exactKeys(issuers, ['$schema', 'schemaVersion', 'algorithm', 'issuers'], 'visual review issuer registry', fail)
  if (issuers.schemaVersion !== 1 || issuers.algorithm !== 'ed25519' || !Array.isArray(issuers.issuers)) fail('visual review issuer registry is invalid')
  const descriptor = {
    status: policy.status,
    policyPath: role.policyPath,
    policySha256: policyRead.sha256,
    issuerRegistryPath: role.issuerRegistryPath,
    issuerRegistrySha256: issuerRead.sha256,
    managedActivationEvidencePath: null,
    managedActivationEvidenceSha256: null,
  }
  return { descriptor, policy, issuers, activation: null }
}

function sameReviewTrust(left, right) {
  return stableStringify(left) === stableStringify(right)
}

function safeRootPath(root, value, label) {
  const absolute = resolve(root, value)
  if (!isContained(root, absolute)) fail(`${label} must be below the repository root`)
  assertSafeExistingPath(root, absolute, label, fail, { kind: 'directory' })
  const path = relative(root, absolute).split(sep).join('/')
  return portablePath(path, label, fail)
}

function inventoryImages(root, directory, { candidate }) {
  const rows = []
  const absoluteRoot = resolve(root, directory)
  const visit = (relativeDirectory) => {
    const absolute = relativeDirectory ? resolve(absoluteRoot, relativeDirectory) : absoluteRoot
    for (const entry of readdirSync(absolute, { withFileTypes: true })
      .sort((a, b) => compareUtf8Bytes(a.name, b.name))) {
      const child = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      const full = resolve(absoluteRoot, child)
      const info = lstatSync(full)
      if (entry.isSymbolicLink() || info.isSymbolicLink()) fail(`${candidate ? 'candidate' : 'baseline'} inventory crosses a symbolic link:${child}`)
      if (entry.isDirectory()) {
        visit(child)
        continue
      }
      if (!entry.isFile() || !info.isFile() || info.nlink !== 1) fail(`${candidate ? 'candidate' : 'baseline'} inventory contains an unsafe entry:${child}`)
      if (!child.toLowerCase().endsWith('.png')) {
        if (candidate) fail(`candidate inventory contains a non-PNG file:${child}`)
        continue
      }
      const repositoryPath = `${directory}/${child}`
      const read = readStableFile(root, repositoryPath, `${candidate ? 'candidate' : 'baseline'} image ${child}`, fail)
      if (read.bytes.length < PNG_MAGIC.length || !read.bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) fail(`image lacks the canonical PNG signature:${repositoryPath}`)
      try {
        const decoded = PNG.sync.read(read.bytes, { checkCRC: true })
        if (!Number.isSafeInteger(decoded.width) || decoded.width < 1 || !Number.isSafeInteger(decoded.height) || decoded.height < 1) fail(`image has invalid decoded dimensions:${repositoryPath}`)
      } catch (error) {
        if (String(error.message).startsWith('visual baseline review blocked:')) throw error
        fail(`image is not a complete CRC-valid decodable PNG:${repositoryPath}:${error.message}`)
      }
      rows.push({ path: child, sha256: read.sha256, bytes: read.size, mode: read.mode })
    }
  }
  visit('')
  return rows.sort((a, b) => compareUtf8Bytes(a.path, b.path))
}

function descriptor(row) {
  return row ? { sha256: row.sha256, bytes: row.bytes } : null
}

function changedImages(proposal) {
  return proposal.images.filter((row) => row.action !== 'unchanged')
}

export function visualBaselineProposalDigest(proposal) {
  const projection = structuredClone(proposal)
  delete projection.proposalDigest
  return sha256(stableStringify(projection))
}

export function planVisualBaseline({ repoRoot = process.cwd(), candidateRoot, baselineRoot, statements, authorIdentity } = {}) {
  const root = canonicalRoot(repoRoot, 'visual baseline repository root', fail)
  if (typeof authorIdentity !== 'string' || authorIdentity.trim().length < 3) fail('an explicit proposal author identity is required')
  const candidate = safeRootPath(root, candidateRoot, 'candidate root')
  const baseline = safeRootPath(root, baselineRoot, 'baseline root')
  const candidateAbsolute = resolve(root, candidate)
  const baselineAbsolute = resolve(root, baseline)
  if (isContained(candidateAbsolute, baselineAbsolute, { allowRoot: true })
    || isContained(baselineAbsolute, candidateAbsolute, { allowRoot: true })) fail('candidate and baseline roots must be disjoint')
  if (!statements || typeof statements !== 'object' || Array.isArray(statements)) fail('a per-image statements object is required')
  const candidateInventory = inventoryImages(root, candidate, { candidate: true })
  const baselineInventory = inventoryImages(root, baseline, { candidate: false })
  if (!candidateInventory.length) fail('candidate inventory contains no PNG images')
  const candidates = new Map(candidateInventory.map((row) => [row.path, row]))
  const baselines = new Map(baselineInventory.map((row) => [row.path, row]))
  const paths = [...new Set([...candidates.keys(), ...baselines.keys()])].sort(compareUtf8Bytes)
  const images = paths.map((path) => {
    const candidateRow = candidates.get(path) ?? null
    const baselineRow = baselines.get(path) ?? null
    const action = !baselineRow ? 'create' : !candidateRow ? 'delete'
      : baselineRow.sha256 === candidateRow.sha256 ? 'unchanged' : 'replace'
    const statement = action === 'unchanged' ? null : statements[path]
    if (action !== 'unchanged' && (typeof statement !== 'string' || statement.trim().length < 12
      || /^(?:todo|tbd|same|looks good|approved|unknown|n\/a)$/i.test(statement.trim()))) {
      fail(`changed image requires an explicit visual diff statement:${path}`)
    }
    return { path, action, baseline: descriptor(baselineRow), candidate: descriptor(candidateRow), statement: statement?.trim() ?? null }
  })
  const expectedStatementPaths = images.filter((row) => row.action !== 'unchanged').map((row) => row.path)
  if (stableStringify(Object.keys(statements).sort(compareUtf8Bytes)) !== stableStringify(expectedStatementPaths)) fail('statement keys must equal the exact changed-image set')
  const proposal = {
    schemaVersion: 1,
    kind: PROPOSAL_KIND,
    toolVersion: VISUAL_BASELINE_TOOL_VERSION,
    pngParserVersion: VISUAL_BASELINE_PNG_PARSER_VERSION,
    reviewDomain: REVIEW_DOMAIN,
    repository: repositoryBinding(root),
    authorIdentity: authorIdentity.trim(),
    candidateRoot: candidate,
    baselineRoot: baseline,
    candidateInventory,
    baselineInventory,
    images,
    reviewTrust: loadReviewTrust(root).descriptor,
    proposalDigest: '',
  }
  proposal.proposalDigest = visualBaselineProposalDigest(proposal)
  validateVisualBaselineProposal(proposal)
  return proposal
}

function validateInventory(rows, label) {
  if (!Array.isArray(rows)) fail(`${label} must be an array`)
  const paths = []
  for (const row of rows) {
    exactKeys(row, ['path', 'sha256', 'bytes', 'mode'], `${label} row`, fail)
    portablePath(row.path, `${label} path`, fail)
    if (!row.path.toLowerCase().endsWith('.png') || !SHA256_PATTERN.test(row.sha256)
      || !Number.isSafeInteger(row.bytes) || row.bytes < PNG_MAGIC.length
      || !Number.isInteger(row.mode) || row.mode < 0 || row.mode > 0o777) fail(`${label} row is invalid:${row.path}`)
    paths.push(row.path)
  }
  if (stableStringify(paths) !== stableStringify([...new Set(paths)].sort(compareUtf8Bytes))) fail(`${label} is not unique and sorted`)
}

function validateDescriptor(value, label, allowNull) {
  if (value === null && allowNull) return
  exactKeys(value, ['sha256', 'bytes'], label, fail)
  if (!SHA256_PATTERN.test(value.sha256) || !Number.isSafeInteger(value.bytes) || value.bytes < PNG_MAGIC.length) fail(`${label} is invalid`)
}

export function validateVisualBaselineProposal(proposal) {
  exactKeys(proposal, ['schemaVersion', 'kind', 'toolVersion', 'pngParserVersion', 'reviewDomain', 'repository', 'authorIdentity', 'candidateRoot', 'baselineRoot', 'candidateInventory', 'baselineInventory', 'images', 'reviewTrust', 'proposalDigest'], 'visual baseline proposal', fail)
  if (proposal.schemaVersion !== 1 || proposal.kind !== PROPOSAL_KIND || proposal.toolVersion !== VISUAL_BASELINE_TOOL_VERSION
    || proposal.pngParserVersion !== VISUAL_BASELINE_PNG_PARSER_VERSION
    || proposal.reviewDomain !== REVIEW_DOMAIN
    || typeof proposal.authorIdentity !== 'string' || proposal.authorIdentity.trim().length < 3
    || !SHA256_PATTERN.test(proposal.proposalDigest) || proposal.proposalDigest !== visualBaselineProposalDigest(proposal)) fail('visual baseline proposal identity or digest is invalid')
  exactKeys(proposal.repository, ['identity', 'headCommit', 'headTree'], 'visual baseline repository binding', fail)
  if (typeof proposal.repository.identity !== 'string' || !/^[a-z0-9.-]+(?::[0-9]+)?\/[A-Za-z0-9._~/-]+$/.test(proposal.repository.identity)
    || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(proposal.repository.headCommit)
    || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(proposal.repository.headTree)) fail('visual baseline repository binding is invalid')
  portablePath(proposal.candidateRoot, 'candidate root', fail)
  portablePath(proposal.baselineRoot, 'baseline root', fail)
  validateInventory(proposal.candidateInventory, 'candidate inventory')
  validateInventory(proposal.baselineInventory, 'baseline inventory')
  exactKeys(proposal.reviewTrust, ['status', 'policyPath', 'policySha256', 'issuerRegistryPath', 'issuerRegistrySha256', 'managedActivationEvidencePath', 'managedActivationEvidenceSha256'], 'visual review trust descriptor', fail)
  const trustRole = roleForTrustDescriptor(proposal.reviewTrust)
  if (!['active', 'not-activated'].includes(proposal.reviewTrust.status) || !trustRole
    || proposal.reviewTrust.issuerRegistryPath !== trustRole.issuerRegistryPath) fail('visual review trust descriptor identity is invalid')
  for (const key of ['policySha256', 'issuerRegistrySha256', 'managedActivationEvidenceSha256']) {
    if (proposal.reviewTrust[key] !== null && !SHA256_PATTERN.test(proposal.reviewTrust[key])) fail(`visual review trust ${key} is invalid`)
  }
  if (proposal.reviewTrust.managedActivationEvidencePath !== null
    || proposal.reviewTrust.managedActivationEvidenceSha256 !== null) fail('managed visual review activation evidence is not supported by this tool version')
  if (!Array.isArray(proposal.images) || !proposal.images.length) fail('visual baseline proposal images are empty')
  const imagePaths = []
  for (const row of proposal.images) {
    exactKeys(row, ['path', 'action', 'baseline', 'candidate', 'statement'], 'visual baseline image', fail)
    portablePath(row.path, 'visual baseline image path', fail)
    if (!['create', 'replace', 'delete', 'unchanged'].includes(row.action)) fail(`visual baseline image action is invalid:${row.path}`)
    validateDescriptor(row.baseline, `${row.path} baseline descriptor`, true)
    validateDescriptor(row.candidate, `${row.path} candidate descriptor`, true)
    const expectedAction = !row.baseline ? 'create' : !row.candidate ? 'delete'
      : row.baseline.sha256 === row.candidate.sha256 ? 'unchanged' : 'replace'
    if (row.action !== expectedAction) fail(`visual baseline image action/digest mismatch:${row.path}`)
    if (row.action === 'unchanged' ? row.statement !== null
      : typeof row.statement !== 'string' || row.statement.length < 12) fail(`visual baseline image statement is invalid:${row.path}`)
    imagePaths.push(row.path)
  }
  if (stableStringify(imagePaths) !== stableStringify([...new Set(imagePaths)].sort(compareUtf8Bytes))) fail('visual baseline image paths are not unique and sorted')
  const candidateProjection = proposal.images.filter((row) => row.candidate).map((row) => ({ path: row.path, ...row.candidate }))
  const baselineProjection = proposal.images.filter((row) => row.baseline).map((row) => ({ path: row.path, ...row.baseline }))
  const stripMode = (rows) => rows.map(({ path, sha256: digest, bytes }) => ({ path, sha256: digest, bytes }))
  if (stableStringify(candidateProjection) !== stableStringify(stripMode(proposal.candidateInventory))
    || stableStringify(baselineProjection) !== stableStringify(stripMode(proposal.baselineInventory))) fail('visual baseline image rows do not close both inventories')
  return true
}

function reviewRows(proposal) {
  return changedImages(proposal).map((row) => ({
    path: row.path,
    baselineSha256: row.baseline?.sha256 ?? null,
    candidateSha256: row.candidate?.sha256 ?? null,
    statement: row.statement,
    decision: 'approved',
  }))
}

function validateReviewRows(images, proposal) {
  if (!Array.isArray(images)) fail('review images must be an array')
  for (const row of images) {
    exactKeys(row, ['path', 'baselineSha256', 'candidateSha256', 'statement', 'decision'], 'review image', fail)
    portablePath(row.path, 'review image path', fail)
    if ((row.baselineSha256 !== null && !SHA256_PATTERN.test(row.baselineSha256))
      || (row.candidateSha256 !== null && !SHA256_PATTERN.test(row.candidateSha256))
      || typeof row.statement !== 'string' || row.statement.length < 12 || row.decision !== 'approved') fail(`review image is invalid:${row.path}`)
  }
  if (stableStringify(images) !== stableStringify(reviewRows(proposal))) fail('review does not approve the exact digest-bound changed-image set')
}

function canonicalTime(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) fail(`${label} must be canonical ISO-8601 UTC`)
  return new Date(value)
}

function verifyReviewSignature({ attestation, review, proposal, trust, role, allowedKeyIds, now, label }) {
  const issuedAt = canonicalTime(attestation.issuedAt, `${label} issuedAt`)
  const expiresAt = canonicalTime(attestation.expiresAt, `${label} expiresAt`)
  const current = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date(Number.NaN)
  if (!Number.isFinite(current.getTime()) || expiresAt <= issuedAt || expiresAt.getTime() - issuedAt.getTime() > 30 * 60_000
    || issuedAt.getTime() > current.getTime() + 5 * 60_000 || expiresAt <= current) fail(`${label} is outside its short-lived verification window`)
  const issuer = trust.issuers.issuers.find((row) => row.keyId === attestation.signerKeyId)
  if (!issuer || !allowedKeyIds.includes(attestation.signerKeyId) || issuer.status !== 'active'
    || issuer.subject !== attestation.subject || !Array.isArray(issuer.roles) || !issuer.roles.includes(role)
    || canonicalTime(issuer.notBefore, `${label} issuer notBefore`) > issuedAt
    || canonicalTime(issuer.notAfter, `${label} issuer notAfter`) < expiresAt || issuer.revokedAt !== null) fail(`${label} signer is not an active allowlisted ${role}`)
  const reviewCore = structuredClone(review)
  delete reviewCore.attestation
  if (attestation.proposalDigest !== proposal.proposalDigest || attestation.reviewDigest !== sha256(stableStringify(reviewCore))
    || attestation.authorIdentity !== proposal.authorIdentity || attestation.issuerRegistryDigest !== trust.descriptor.issuerRegistrySha256
    || attestation.policyDigest !== trust.descriptor.policySha256 || attestation.reviewDomain !== proposal.reviewDomain
    || attestation.repositoryIdentity !== proposal.repository.identity || attestation.baseCommit !== proposal.repository.headCommit
    || attestation.baseTree !== proposal.repository.headTree || review.reviewedAt !== attestation.issuedAt) fail(`${label} content/trust/repository binding is invalid`)
  const unsigned = structuredClone(attestation)
  delete unsigned.signature
  try {
    const signature = Buffer.from(attestation.signature, 'base64url')
    if (signature.length !== 64 || signature.toString('base64url') !== attestation.signature) fail(`${label} signature encoding is not canonical`)
    const publicKey = createPublicKey({ key: Buffer.from(issuer.publicKeySpki, 'base64'), format: 'der', type: 'spki' })
    if (publicKey.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from(stableStringify(unsigned)), publicKey, signature)) fail(`${label} signature is invalid`)
  } catch (error) {
    if (String(error.message).startsWith('visual baseline review blocked:')) throw error
    fail(`${label} signature cannot be verified:${error.message}`)
  }
  return issuer
}

function verifyHumanReview(review, proposal, trust, now) {
  exactKeys(review, ['schemaVersion', 'kind', 'proposalDigest', 'decision', 'reviewer', 'reviewedAt', 'images', 'attestation'], 'human visual review', fail)
  if (trust.policy?.status !== 'active' || trust.policy.human.status !== 'active') fail('trusted human visual-review authority is not activated')
  if (review.schemaVersion !== 1 || review.proposalDigest !== proposal.proposalDigest || review.decision !== 'approved'
    || typeof review.reviewer !== 'string' || review.reviewer.trim().length < 3) fail('human visual review identity is invalid')
  validateReviewRows(review.images, proposal)
  const attestation = review.attestation
  exactKeys(attestation, ['schemaVersion', 'kind', 'algorithm', 'reviewDomain', 'repositoryIdentity', 'baseCommit', 'baseTree', 'proposalDigest', 'reviewDigest', 'authorIdentity', 'issuerRegistryDigest', 'policyDigest', 'issuedAt', 'expiresAt', 'signerKeyId', 'subject', 'signature'], 'human visual review attestation', fail)
  if (attestation.schemaVersion !== 1 || attestation.kind !== 'human-visual-baseline-review-attestation' || attestation.algorithm !== 'ed25519'
    || attestation.subject !== review.reviewer) fail('human visual review attestation identity is invalid')
  const issuer = verifyReviewSignature({ attestation, review, proposal, trust, role: 'visual-baseline-reviewer', allowedKeyIds: trust.policy.human.allowedKeyIds, now, label: 'human visual review attestation' })
  return { reviewKind: review.kind, reviewer: review.reviewer, signerKeyId: issuer.keyId }
}

function verifyManagedReview(review, proposal, trust, now) {
  void review
  void proposal
  void trust
  void now
  fail('managed-model-broker visual review is not activated in this tool version; digest-only pseudo-activation is forbidden until the canonical signed broker/model-authority validators are reused')
}

export function validateVisualBaselineReview({ review, proposal, repoRoot = process.cwd(), now = new Date() } = {}) {
  validateVisualBaselineProposal(proposal)
  const root = canonicalRoot(repoRoot, 'visual baseline repository root', fail)
  assertRepositoryBinding(root, proposal.repository)
  const trust = loadReviewTrust(root)
  if (!sameReviewTrust(trust.descriptor, proposal.reviewTrust)) fail('visual review trust authority changed after proposal planning')
  if (!review || typeof review !== 'object' || Array.isArray(review)) fail('review evidence is required')
  if (review.kind === 'human-visual-baseline-review') return verifyHumanReview(review, proposal, trust, now)
  if (review.kind === 'managed-model-broker-visual-review') return verifyManagedReview(review, proposal, trust, now)
  fail('review kind must be explicit human review or cryptographically attested managed-model-broker review')
}

function sameInventory(left, right) {
  return stableStringify(left) === stableStringify(right)
}

function visualState(root, proposal) {
  const candidate = inventoryImages(root, proposal.candidateRoot, { candidate: true })
  if (!sameInventory(candidate, proposal.candidateInventory)) fail('candidate inventory changed, gained, lost, or renamed an image after planning')
  const baseline = inventoryImages(root, proposal.baselineRoot, { candidate: false })
  if (sameInventory(baseline, proposal.baselineInventory)) return changedImages(proposal).length ? 'pending' : 'no-changes'
  const expectedApplied = proposal.candidateInventory.map((row) => ({ ...row }))
  if (sameInventory(baseline, expectedApplied)) return 'applied'
  fail('baseline inventory is a partial, rogue, missing, or concurrently changed state')
}

export function checkVisualBaseline({ repoRoot = process.cwd(), proposal, review = null, now = new Date() } = {}) {
  validateVisualBaselineProposal(proposal)
  const root = canonicalRoot(repoRoot, 'visual baseline repository root', fail)
  assertRepositoryBinding(root, proposal.repository)
  const state = visualState(root, proposal)
  const reviewer = review ? validateVisualBaselineReview({ review, proposal, repoRoot: root, now }) : null
  return { proposalDigest: proposal.proposalDigest, state, changedImages: changedImages(proposal).length, review: reviewer }
}

export function applyReviewedVisualBaseline(options = {}) {
  const allowed = new Set(['repoRoot', 'proposal', 'review', 'expectedProposalDigest', 'now'])
  const unknown = Object.keys(options).filter((key) => !allowed.has(key))
  if (unknown.length) fail(`apply-reviewed rejects caller callbacks and unknown trust inputs:${unknown.join(',')}`)
  const {
    repoRoot = process.cwd(), proposal, review, expectedProposalDigest, now = new Date(),
  } = options
  validateVisualBaselineProposal(proposal)
  if (!SHA256_PATTERN.test(expectedProposalDigest ?? '') || expectedProposalDigest !== proposal.proposalDigest) fail('explicit expected proposal digest is missing or mismatched')
  const root = canonicalRoot(repoRoot, 'visual baseline repository root', fail)
  assertRepositoryBinding(root, proposal.repository)
  const reviewer = validateVisualBaselineReview({ review, proposal, repoRoot: root, now })
  const state = visualState(root, proposal)
  if (state === 'applied' || state === 'no-changes') return { proposalDigest: proposal.proposalDigest, state, changed: 0, review: reviewer }
  const operations = changedImages(proposal).map((row) => {
    let afterBytes = null
    let mode = 0o600
    if (row.candidate) {
      const candidate = readStableFile(root, `${proposal.candidateRoot}/${row.path}`, `reviewed candidate ${row.path}`, fail)
      if (candidate.sha256 !== row.candidate.sha256 || candidate.size !== row.candidate.bytes) fail(`candidate changed while materializing:${row.path}`)
      afterBytes = candidate.bytes
      mode = candidate.mode
    }
    return {
      action: row.action,
      path: `${proposal.baselineRoot}/${row.path}`,
      beforeSha256: row.baseline?.sha256 ?? null,
      beforeMode: row.baseline ? proposal.baselineInventory.find((item) => item.path === row.path)?.mode : undefined,
      afterSha256: row.candidate?.sha256 ?? null,
      afterBytes,
      mode,
    }
  })
  const result = applyAtomicOperations({
    root,
    operations,
    fail,
    lockName: `${proposal.baselineRoot}/.qijenchen-visual-baseline.lock`,
  })
  if (visualState(root, proposal) !== 'applied') fail('visual baseline atomic readback did not reach the reviewed candidate inventory')
  return { proposalDigest: proposal.proposalDigest, state: 'applied', changed: result.changed, review: reviewer }
}

export function expectedVisualReviewImages(proposal) {
  validateVisualBaselineProposal(proposal)
  return reviewRows(proposal)
}
