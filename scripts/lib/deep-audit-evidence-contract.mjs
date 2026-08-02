#!/usr/bin/env node
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createHash, randomUUID, verify as verifySignature } from 'node:crypto'
import { dirname, isAbsolute, resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  assertSafeExistingPath,
  ensureRuntimeEvidenceDirectory,
  ensureRuntimeEvidenceRoot,
  isContained,
  prepareRuntimeEvidenceFile,
  resolveRepositoryRoot,
  resolveRuntimeEvidencePath,
  resolveRuntimeEvidenceRoot,
  safeRelativePath,
} from './governance-runtime-evidence.mjs'
import {
  currentRuntimeCertificationIdentity,
  validateCertificationRuntimeEvidence,
} from '../../infra/governance/lib/runtime-certification.mjs'
import { runClosedGit } from '../../infra/governance/lib/common.mjs'
import { compareUtf8Bytes } from './provider-lifecycle.mjs'
import {
  EXACT_REVIEW_CERTIFICATION_CONTRACT,
  resolveProviderReviewBinding,
  reviewTargetIdentity,
  validateBlockedReviewCapabilitySelectionReceipt,
  validateReviewCapabilitySelectionReceipt,
  verifyEntitlementAvailabilityEvidence,
  verifyExactProviderCertification,
  verifyReviewCapabilitySelection,
} from '../../packages/governance/src/provider-review-binding.mjs'
import {
  assertIssuerActive,
  issuerRegistryDigest,
  loadIssuerRegistry,
  publicKeyFromIssuer,
  resolvePolicyIssuer,
  validateRegistryPolicyBinding,
} from '../../infra/governance/lib/issuer-registry.mjs'
import { validateModelAccessReceipt } from './model-access-receipt.mjs'
import {
  buildComponentClaimInventory,
  buildComponentClaimReceipt,
} from './component-claim-inventory.mjs'
import {
  loadManagedCiTrustedExecutionPlan,
  managedCiExpectedAttestedRunnerEnvironment,
  managedCiExpectedRawReceiptBinding,
} from './managed-ci-trusted-execution-plan.mjs'
import {
  validateManagedCiSandboxReceipt,
  validateManagedCiSandboxReceiptShape,
} from './managed-ci-sandbox-receipt.mjs'
import {
  validateModelBrokerReceipt,
  validateModelBrokerTranscript,
} from './model-broker-transcript.mjs'
import { resolveDeepAuditRubricPaths } from '../governance-build-graph.mjs'
import { validateProviderRegistry } from '../../infra/governance/lib/model-validation.mjs'
import { resolveCertificationCanary } from '../../infra/governance/lib/common.mjs'
import { certificationCarrierPolicyForRole } from '../../infra/governance/lib/role-surface-policy.mjs'
import { resolveLocalRepositoryIdentity } from '../../infra/governance/lib/repository-subject-proof.mjs'
import { validateStandardFiveStepReceipt } from './standard-ci-evidence.mjs'

export { validateManagedCiSandboxReceiptShape }

const CONTRACT_VERSION = 1
const MANIFEST_SCHEMA_VERSION = 4
const HISTORICAL_MANIFEST_SCHEMA_VERSION = 3
const MANIFEST_KIND = 'deep-audit-run-manifest'
const POINTER_KIND = 'deep-audit-active-run'
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const PROVIDER_ID = /^[a-z][a-z0-9-]*$/
const SHA256 = /^[a-f0-9]{64}$/
const GIT_OID = /^[a-f0-9]{40,64}$/
const DEEP_AUDIT_SCHEMA_PATHS = Object.freeze({
  contract: 'scripts/schemas/deep-audit-evidence-contract.schema.json',
  managedSandbox: 'scripts/schemas/managed-ci-sandbox-receipt.schema.json',
  ciObservation: 'scripts/schemas/ci-evidence-observation.schema.json',
  standardCiObservation: 'scripts/schemas/standard-ci-evidence-observation.schema.json',
})
const DEEP_AUDIT_SCHEMA_VALIDATORS = new Map()
const EVIDENCE_KINDS = new Set([
  'deep-audit-deterministic',
  'deep-audit-judgment',
  'deep-audit-hook-residue',
  'deep-audit-ci-enforced',
  'deep-audit-component-a1b',
])
const GENERIC_KINDS = new Set([
  'deep-audit-deterministic',
  'deep-audit-hook-residue',
  'deep-audit-ci-enforced',
])
const DANGEROUS_MODEL_ARGUMENTS = new Set([
  '--dangerously-bypass-approvals-and-sandbox',
  '--dangerously-bypass-hook-trust',
  '--dangerously-skip-permissions',
  '--allow-dangerously-skip-permissions',
])
function fail(message) {
  throw new Error(`deep-audit evidence blocked:${message}`)
}

export function stableStringify(value, space = 0) {
  const normalize = (item) => {
    if (Array.isArray(item)) return item.map(normalize)
    if (!item || typeof item !== 'object') return item
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize(item[key])]))
  }
  return JSON.stringify(normalize(value), null, space)
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function buildDeepAuditSecondOpinionWaiver({
  underlyingSelection,
  authorProviderId,
  selfProviderId,
  now = new Date(),
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('second-opinion waiver time must be valid')
  const payload = {
    schemaVersion: 1,
    kind: 'provider-review-capability-selection-waived',
    selectionStatus: 'REVIEW-WAIVED',
    selectionReasonCode: 'USER_WAIVER',
    waiverAuthority: 'user',
    waiverScope: 'second-opinion-this-run',
    waivedAt: now.toISOString(),
    skill: 'deep-audit-cross-codex',
    authorProviderId,
    selfProviderId,
    bindingDigest: underlyingSelection?.bindingDigest,
    underlyingSelection,
  }
  return Object.freeze({ ...payload, selectionDigest: sha256(stableStringify(payload)) })
}

export function deepAuditProviderIdentityDigest({ authorProvider, providers, reviewSelection = null } = {}) {
  return sha256(stableStringify({
    authorProvider,
    providers,
    ...(reviewSelection === null ? {} : { reviewSelection }),
  }))
}

export function validateDeepAuditEvidenceContractSchema(document, { repoRoot = process.cwd(), manifest = null } = {}) {
  if (!repoRoot) fail('deep-audit contract schema validation requires repository trust roots')
  const root = resolve(repoRoot)
  let entries
  try {
    entries = Object.entries(DEEP_AUDIT_SCHEMA_PATHS).map(([name, relativePath]) => ({
      name,
      relativePath,
      bytes: readFileSync(resolve(root, relativePath)),
    }))
  } catch (error) {
    fail(`deep-audit contract schema dependency is unavailable:${error.message}`)
  }
  if (manifest !== null) {
    if (!Array.isArray(manifest?.inventory)) fail('deep-audit contract schema manifest binding is invalid')
    for (const { relativePath, bytes } of entries) {
      const frozen = manifest.inventory.find(row => row.path === relativePath && row.kind === 'file')
      if (!frozen || frozen.sha256 !== sha256(bytes)) {
        fail(`deep-audit contract schema dependency differs from frozen manifest:${relativePath}`)
      }
    }
  }
  const fingerprint = sha256(Buffer.concat(entries.flatMap(({ relativePath, bytes }) => [
    Buffer.from(`${relativePath}\0`),
    bytes,
    Buffer.from('\0'),
  ])))
  let compiled = DEEP_AUDIT_SCHEMA_VALIDATORS.get(root)
  if (!compiled || compiled.fingerprint !== fingerprint) {
    let schemas
    try {
      schemas = Object.fromEntries(entries.map(({ name, bytes }) => [name, JSON.parse(bytes.toString('utf8'))]))
    } catch (error) {
      fail(`deep-audit contract schema dependency is invalid JSON:${error.message}`)
    }
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: false })
    addFormats(ajv)
    let validate
    try {
      ajv.addSchema(schemas.managedSandbox)
      ajv.addSchema(schemas.ciObservation)
      ajv.addSchema(schemas.standardCiObservation)
      validate = ajv.compile(schemas.contract)
    } catch (error) {
      fail(`deep-audit contract schema cannot compile:${error.message}`)
    }
    compiled = { fingerprint, ajv, validate }
    DEEP_AUDIT_SCHEMA_VALIDATORS.set(root, compiled)
  }
  if (!compiled.validate(document)) {
    fail(`deep-audit contract schema failed:${compiled.ajv.errorsText(compiled.validate.errors, { separator: '; ' })}`)
  }
  return true
}

function git(repoRoot, args, { binary = false } = {}) {
  const result = runClosedGit(args, {
    cwd: resolve(repoRoot),
    maxOutputBytes: 128 * 1024 * 1024,
    output: binary ? 'buffer' : 'capture',
    timeoutMs: 30_000,
  })
  if (result.error || result.signal !== null || result.status !== 0) {
    fail(`closed Git ${args.join(' ')} failed:${String(result.stderr ?? '').trim()}`)
  }
  return result.stdout
}

function evidencePaths({ repoRoot, explicitRoot, create = false } = {}) {
  const repository = resolveRepositoryRoot(repoRoot)
  const evidenceRoot = create
    ? ensureRuntimeEvidenceRoot({ repoRoot: repository, explicitRoot })
    : resolveRuntimeEvidenceRoot({ repoRoot: repository, explicitRoot })
  const deepAuditRoot = create
    ? ensureRuntimeEvidenceDirectory({ repoRoot: repository, explicitRoot, relativePath: 'deep-audit' })
    : resolveRuntimeEvidencePath({ repoRoot: repository, explicitRoot, relativePath: 'deep-audit' })
  return { repository, evidenceRoot, deepAuditRoot }
}

function readJsonFile(path, label) {
  const bytes = readFileSync(path)
  if (bytes.length === 0) fail(`${label} is empty`)
  try {
    return { value: JSON.parse(bytes.toString('utf8')), bytes }
  } catch (error) {
    fail(`${label} is invalid JSON:${error.message}`)
  }
}

function writeExclusive(path, bytes, label) {
  let fd
  try {
    fd = openSync(path, 'wx', 0o600)
    writeFileSync(fd, bytes)
    fsyncSync(fd)
  } catch (error) {
    if (fd !== undefined) closeSync(fd)
    fail(`${label} cannot be created exclusively:${error.message}`)
  }
  closeSync(fd)
}

function replaceAtomic(path, temp, bytes, label) {
  writeExclusive(temp, bytes, `${label} temporary file`)
  try {
    renameSync(temp, path)
  } catch (error) {
    try { unlinkSync(temp) } catch {}
    fail(`${label} cannot be replaced atomically:${error.message}`)
  }
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} has an invalid or open shape; expected ${expected.join(',')}`)
  }
}

export function validateDeepAuditSecondOpinionWaiver(receipt) {
  exactKeys(receipt, [
    'schemaVersion', 'kind', 'selectionStatus', 'selectionReasonCode', 'waiverAuthority',
    'waiverScope', 'waivedAt', 'skill', 'authorProviderId', 'selfProviderId',
    'bindingDigest', 'underlyingSelection', 'selectionDigest',
  ], 'second-opinion waiver')
  if (receipt.schemaVersion !== 1
    || receipt.kind !== 'provider-review-capability-selection-waived'
    || receipt.selectionStatus !== 'REVIEW-WAIVED'
    || receipt.selectionReasonCode !== 'USER_WAIVER'
    || receipt.waiverAuthority !== 'user'
    || receipt.waiverScope !== 'second-opinion-this-run'
    || receipt.skill !== 'deep-audit-cross-codex') fail('second-opinion waiver identity is invalid')
  validIso(receipt.waivedAt, 'second-opinion waiver waivedAt')
  if (!PROVIDER_ID.test(receipt.authorProviderId ?? '') || !PROVIDER_ID.test(receipt.selfProviderId ?? '')) {
    fail('second-opinion waiver provider identity is invalid')
  }
  const underlying = receipt.underlyingSelection
  try {
    if (underlying?.kind === 'provider-review-capability-selection') {
      validateReviewCapabilitySelectionReceipt(underlying)
    } else if (underlying?.kind === 'provider-review-capability-selection-blocked') {
      validateBlockedReviewCapabilitySelectionReceipt(underlying)
    } else fail('second-opinion waiver underlying selection kind is invalid')
  } catch (error) {
    fail(`second-opinion waiver underlying selection is invalid:${error.message}`)
  }
  if (receipt.authorProviderId !== underlying.authorProviderId
    || receipt.selfProviderId !== underlying.selfProviderId
    || receipt.bindingDigest !== underlying.bindingDigest) {
    fail('second-opinion waiver is detached from the underlying selection')
  }
  const { selectionDigest, ...payload } = receipt
  if (!SHA256.test(selectionDigest ?? '') || selectionDigest !== sha256(stableStringify(payload))) {
    fail('second-opinion waiver selectionDigest mismatches')
  }
  return true
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`)
  if (/^(?:todo|tbd|unknown|placeholder|n\/a|none|null|fake)$/i.test(value.trim())) fail(`${label} is a placeholder`)
  return value
}

function validIso(value, label) {
  nonEmptyString(value, label)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || Number.isNaN(Date.parse(value))) {
    fail(`${label} must be an ISO-8601 UTC timestamp`)
  }
}

function digestRows(rows) {
  return sha256(stableStringify(rows))
}

function buildInventory(repository) {
  const indexBytes = git(repository, ['ls-files', '-s', '-z'], { binary: true })
  const tracked = new Map()
  for (const raw of indexBytes.toString('utf8').split('\0').filter(Boolean)) {
    const match = raw.match(/^(\d+) ([a-f0-9]+) (\d+)\t([\s\S]+)$/)
    if (!match) fail('cannot parse Git index inventory')
    const [, mode, oid, stage, path] = match
    if (stage !== '0') fail(`unmerged index entry is not auditable:${path}`)
    if (tracked.has(path)) fail(`duplicate Git index path:${path}`)
    tracked.set(path, { mode, oid })
  }
  const listed = git(repository, ['ls-files', '--cached', '--others', '--exclude-per-directory=.gitignore', '-z'], { binary: true })
    .toString('utf8').split('\0').filter(Boolean)
  const paths = [...new Set([...tracked.keys(), ...listed])].sort()
  const portablePaths = new Set()
  for (const path of paths) {
    if (path.includes('\ufffd') || path !== path.normalize('NFC')) fail(`inventory path is not canonical UTF-8 NFC:${path}`)
    const portable = path.split('/').map(segment => segment.toLocaleLowerCase('en-US')).join('/')
    if (portablePaths.has(portable)) fail(`inventory contains a portable case-fold collision:${path}`)
    portablePaths.add(portable)
  }
  const rows = paths.map((path) => {
    safeRelativePath(path, 'inventory path')
    const absolute = resolve(repository, path)
    if (!isContained(repository, absolute, { allowRoot: false })) fail(`inventory path escapes repository:${path}`)
    const trackedEntry = tracked.get(path)
    const parts = path.split('/')
    let current = repository
    let blockingAncestor = null
    for (let index = 0; index < parts.length - 1; index += 1) {
      current = resolve(current, parts[index])
      let ancestor
      try { ancestor = lstatSync(current) }
      catch (error) {
        if (error?.code !== 'ENOENT') throw error
        blockingAncestor = parts.slice(0, index + 1).join('/')
        break
      }
      if (!ancestor.isDirectory() || ancestor.isSymbolicLink()) {
        blockingAncestor = parts.slice(0, index + 1).join('/')
        break
      }
    }
    if (blockingAncestor) {
      if (!trackedEntry) fail(`untracked inventory path traverses a non-directory ancestor:${path} via ${blockingAncestor}`)
      return { path, kind: 'missing', mode: trackedEntry.mode, bytes: 0, sha256: sha256(`missing\0${path}`) }
    }
    let info
    try { info = lstatSync(absolute) }
    catch (error) {
      if (error?.code !== 'ENOENT') throw error
      if (!trackedEntry) fail(`untracked inventory path vanished:${path}`)
      return { path, kind: 'missing', mode: trackedEntry.mode, bytes: 0, sha256: sha256(`missing\0${path}`) }
    }
    if (info.isSymbolicLink()) {
      const bytes = Buffer.from(readlinkSync(absolute, { encoding: 'buffer' }))
      return { path, kind: 'symlink', mode: '120000', bytes: bytes.length, sha256: sha256(bytes) }
    }
    if (!info.isFile()) fail(`inventory path has unsupported file type:${path}`)
    const bytes = readFileSync(absolute)
    // The worktree bytes and executable bit are one frozen authority. The Git
    // index remains independently bound by indexDigest (and is copied into the
    // disposable clone), so an intentional unstaged chmod must not be replaced
    // by the index mode while materializing the captured worktree.
    const mode = (info.mode & 0o111) !== 0 ? '100755' : '100644'
    return { path, kind: 'file', mode, bytes: bytes.length, sha256: sha256(bytes) }
  })
  assertDeepAuditInventoryTopology(rows, 'captured inventory')
  return { rows, indexDigest: sha256(indexBytes) }
}

function manifestRubric(repository, inventory) {
  try {
    return resolveDeepAuditRubricPaths({ repoRoot: repository, inventory })
  } catch (error) {
    fail(`audit rubric build graph resolution failed:${error.message}`)
  }
}

function componentInventory(inventory) {
  const prefix = 'packages/design-system/src/components/'
  const grouped = new Map()
  for (const row of inventory) {
    if (!row.path.startsWith(prefix)) continue
    if (row.kind === 'missing') continue
    if (row.kind !== 'file') fail(`component inventory contains unsafe source:${row.path}:${row.kind}`)
    const remainder = row.path.slice(prefix.length)
    const [name, ...rest] = remainder.split('/')
    if (!name || rest.length === 0) continue
    if (!grouped.has(name)) grouped.set(name, [])
    grouped.get(name).push(row.path)
  }
  const components = [...grouped.entries()].sort(([left], [right]) => (
    left < right ? -1 : left > right ? 1 : 0
  )).map(([name, paths]) => {
    paths.sort()
    return { name, paths, digest: digestInventoryRows(inventory, paths) }
  })
  if (components.length === 0) fail('component inventory is empty')
  return components
}

export function deriveDeepAuditManifestProjections({ repoRoot = process.cwd(), inventory } = {}) {
  if (!Array.isArray(inventory) || inventory.length === 0) fail('manifest projection inventory is empty')
  const repository = resolveRepositoryRoot(repoRoot)
  return {
    rubricPaths: manifestRubric(repository, inventory),
    components: componentInventory(inventory),
  }
}

function loadProviderInputs(repository, now) {
  const registry = JSON.parse(readFileSync(resolve(repository, 'packages/governance/canonical/providers.json'), 'utf8'))
  const capabilityRegistry = JSON.parse(readFileSync(resolve(repository, 'infra/governance/providers/review-capability-registry.json'), 'utf8'))
  const capabilityCertificationLedger = JSON.parse(readFileSync(resolve(repository, 'infra/governance/providers/review-capability-certifications.json'), 'utf8'))
  const invocationRegistry = JSON.parse(readFileSync(resolve(repository, 'infra/governance/providers/model-invocation-profiles.json'), 'utf8'))
  const modelReleaseRegistry = JSON.parse(readFileSync(resolve(repository, 'infra/governance/providers/model-release-registry.json'), 'utf8'))
  const matrix = JSON.parse(readFileSync(resolve(repository, 'infra/governance/providers/compatibility-matrix.json'), 'utf8'))
  const runtimeProfile = JSON.parse(readFileSync(resolve(repository, 'infra/governance/providers/runtime-conformance.json'), 'utf8'))
  const ledger = JSON.parse(readFileSync(resolve(repository, 'infra/governance/providers/certifications.json'), 'utf8'))
  const inventory = JSON.parse(readFileSync(resolve(repository, 'infra/governance/inventory/managed-repos.json'), 'utf8'))
  const desiredGithub = JSON.parse(readFileSync(resolve(repository, 'infra/governance/desired/github.json'), 'utf8'))
  const roleSurfacePolicy = JSON.parse(readFileSync(resolve(repository, 'infra/governance/providers/role-surface-policy.json'), 'utf8'))
  const issuerRegistry = JSON.parse(readFileSync(resolve(repository, 'infra/governance/trust/issuers.json'), 'utf8'))
  if (!Array.isArray(registry.providers) || !matrix.providers || !Array.isArray(runtimeProfile.providers)
    || !Array.isArray(ledger.certifications)) {
    fail('provider registry/certification authority is invalid')
  }
  let validation
  try {
    validation = validateProviderRegistry(matrix, runtimeProfile, {
      adapterRegistry: registry,
      now,
    })
  } catch (error) {
    fail(`provider compatibility/runtime profile authority is invalid:${error.message}`)
  }
  return {
    registry,
    capabilityRegistry,
    capabilityCertificationLedger,
    invocationRegistry,
    modelReleaseRegistry,
    matrix,
    runtimeProfile,
    ledger,
    inventory,
    desiredGithub,
    roleSurfacePolicy,
    issuerRegistry,
    validation,
  }
}

function reverifyEntitlementAvailability(repository, inputs, records, expectedGitTree, now) {
  if (!Array.isArray(records)) fail('review entitlement availability must be an array')
  return records.map((record, index) => {
    const invocationProfileId = record?.invocationProfileId
    const invocationProfiles = [
      inputs.invocationRegistry?.profiles?.[invocationProfileId],
      inputs.invocationRegistry?.externalEntitlementProfiles?.[invocationProfileId],
    ].filter(Boolean)
    if (invocationProfiles.length !== 1) {
      fail(`review entitlement availability profile is unregistered or ambiguous:${invocationProfileId ?? '<missing>'}`)
    }
    const [invocationProfile] = invocationProfiles
    const availabilityBinding = invocationProfile?.availabilityEvidence
    if (!availabilityBinding || typeof availabilityBinding !== 'object') {
      fail(`review entitlement availability profile lacks evidence authority:${invocationProfileId ?? '<missing>'}`)
    }
    const reference = safeRelativePath(
      record?.evidence?.reference,
      `review entitlement availability[${index}] evidence reference`,
    )
    if (!reference.startsWith('infra/governance/evidence/provider-runtime/')) {
      fail(`review entitlement availability evidence is outside provider runtime evidence:${reference}`)
    }
    const artifactPath = resolve(repository, reference)
    assertSafeExistingPath(repository, artifactPath, `review entitlement availability[${index}] evidence`, {
      targetKind: 'file',
    })
    const liveCertification = certificationBinding(
      repository,
      inputs,
      availabilityBinding.compatibilityProviderId,
      availabilityBinding.runtimeProviderId,
      availabilityBinding.runtimeKind,
      availabilityBinding.surface,
      availabilityBinding.runtimeProfileId,
      expectedGitTree,
      now,
      record.target?.id,
    )
    if (liveCertification === null
      || liveCertification.certificationId !== record.runtimeCertificationId
      || liveCertification.recordDigest !== record.runtimeCertificationDigest
      || liveCertification.artifactSha256 !== record.evidence.sha256
      || liveCertification.evidenceDigest !== record.runtimeEvidenceDigest
      || liveCertification.reference !== reference) {
      fail(`review entitlement availability certification binding is stale:${record?.invocationProfileId ?? '<missing>'}`)
    }
    const certifiedRecord = inputs.ledger.certifications.find(
      (candidate) => candidate.id === liveCertification.certificationId,
    )
    const certifiedTarget = certifiedRecord?.platformMatrix?.find(
      (candidate) => candidate.id === liveCertification.targetId,
    )
    const certifiedSubjectTree =
      (certifiedTarget?.runtimeEvidence ?? certifiedRecord?.runtimeEvidence)?.gitTree
    if (!GIT_OID.test(certifiedSubjectTree ?? '')) {
      fail(`review entitlement availability lacks its certified subject tree:${record?.invocationProfileId ?? '<missing>'}`)
    }
    let verified
    try {
      verified = verifyEntitlementAvailabilityEvidence({
        invocationRegistry: inputs.invocationRegistry,
        invocationProfileId: record.invocationProfileId,
        certificationLedger: inputs.ledger,
        target: record.target,
        expectedGitTree: certifiedSubjectTree,
        runtimeEvidenceBytes: readFileSync(artifactPath),
        now,
      })
    } catch (error) {
      fail(`review entitlement availability is not live-valid:${record?.invocationProfileId ?? '<missing>'}:${error.message}`)
    }
    if (stableStringify(verified) !== stableStringify(record)) {
      fail(`review entitlement availability record is stale:${record?.invocationProfileId ?? '<missing>'}`)
    }
    return verified
  })
}

function certificationBinding(repository, inputs, compatibilityId, runtimeProviderId, runtimeKind, runtimeSurface, runtimeProfileId, headTree, now, targetId = null) {
  const candidates = inputs.ledger.certifications.filter((record) => record.provider === compatibilityId
    && record.runtimeKind === runtimeKind
    && record.surface === runtimeSurface
    && record.repositoryRole === 'authority')
  if (candidates.length > 1) fail(`multiple runtime certification records exist:${compatibilityId}/${runtimeKind}/${runtimeSurface}/authority`)
  if (candidates.length === 0 || candidates[0].status === 'not-certified' || candidates[0].status === 'not-applicable') return null
  const record = candidates[0]
  const certifiedTargets = (record.platformMatrix || []).filter((target) => target.status === 'certified')
  if (targetId === null && certifiedTargets.length === 0) return null
  if (targetId === null && certifiedTargets.length !== 1) {
    fail(`runtime certification requires an exact target:${record.id}:${certifiedTargets.map((target) => target.id).join(',') || '<none>'}`)
  }
  const target = (record.platformMatrix || []).find((candidate) => candidate.id === (targetId ?? certifiedTargets[0].id))
  if (!target) fail(`runtime certification target is unregistered:${record.id}/${targetId}`)
  const certifiedEvidenceBinding = target.runtimeEvidence ?? record.runtimeEvidence
  if (!certifiedEvidenceBinding || !GIT_OID.test(certifiedEvidenceBinding.gitTree ?? '')) {
    fail(`runtime certification target lacks its exact certified subject tree:${record.id}/${target.id}`)
  }
  let exact
  try {
    exact = verifyExactProviderCertification({
      certificationLedger: [record],
      compatibilityProviderId: compatibilityId,
      runtimeProviderId,
      runtimeProfileId,
      runtimeKind,
      surface: runtimeSurface,
      repositoryRole: 'authority',
      target: reviewTargetIdentity(target),
      expectedGitTree: certifiedEvidenceBinding.gitTree,
      now,
    })
  } catch (error) {
    fail(`runtime certification exact target is invalid:${record.id}:${error.message}`)
  }
  const binding = exact.evidence
  if (!binding || typeof binding !== 'object' || !SHA256.test(binding.artifactSha256 ?? '')) {
    fail(`certified runtime record lacks content-addressed evidence:${record.id}`)
  }
  const reference = safeRelativePath(binding.reference, 'runtime certification reference')
  const expectedReferenceRoot = binding.evidenceKind === 'external-runtime-surface-conformance'
    ? 'infra/governance/evidence/external-runtime/'
    : 'infra/governance/evidence/provider-runtime/'
  if (!reference.endsWith(`/${binding.artifactSha256}.json`) || !reference.startsWith(expectedReferenceRoot)) {
    fail(`runtime certification reference is not content-addressed:${record.id}`)
  }
  const artifactPath = resolve(repository, reference)
  assertSafeExistingPath(repository, artifactPath, `runtime certification artifact ${record.id}`, { targetKind: 'file' })
  const artifactBytes = readFileSync(artifactPath)
  if (sha256(artifactBytes) !== binding.artifactSha256) fail(`runtime certification artifact digest mismatches:${record.id}`)
  let artifact
  try { artifact = JSON.parse(artifactBytes.toString('utf8')) } catch { fail(`runtime certification artifact is invalid JSON:${record.id}`) }
  if (artifact.status !== 'pass' || artifact.evidenceDigest !== binding.evidenceDigest) {
    fail(`runtime certification artifact did not pass or is unbound:${record.id}`)
  }
  let liveReceipt
  try {
    const repositoryTarget = resolveCertificationCanary(inputs.inventory, 'authority')
    const carrierPolicy = certificationCarrierPolicyForRole(inputs.roleSurfacePolicy, 'authority')
    const repositoryIdentity = resolveLocalRepositoryIdentity({
      repoRoot: repository,
      repository: repositoryTarget,
      subjectCommits: [binding.gitCommit],
      carrierPolicy,
    })
    liveReceipt = validateCertificationRuntimeEvidence(record, {
      repoRoot: repository,
      identity: currentRuntimeCertificationIdentity(repository),
      matrix: inputs.matrix,
      runtimeProfile: inputs.runtimeProfile,
      issuerRegistry: inputs.issuerRegistry,
      repositoryTarget,
      repositoryIdentity,
      carrierPolicy,
      desiredGithub: inputs.desiredGithub,
      now,
      targetId: target.id,
    })
  } catch (error) {
    fail(`runtime certification is not live-valid:${record.id}:${error.message}`)
  }
  if (liveReceipt.evidenceDigest !== binding.evidenceDigest
    || liveReceipt.providerId !== (binding.profileId ?? binding.providerId)
    || liveReceipt.runtimeProfileId !== runtimeProfileId) {
    fail(`runtime certification live receipt mismatches:${record.id}`)
  }
  return {
    certificationId: record.id,
    certificationStatus: exact.certificationStatus,
    providerId: compatibilityId,
    runtimeProviderId,
    runtimeKind,
    surface: record.surface,
    repositoryRole: record.repositoryRole,
    targetId: target.id,
    targetDigest: exact.targetDigest,
    certifiedAt: exact.certifiedAt,
    expiresAt: exact.expiresAt,
    recordDigest: digestRows(record),
    artifactSha256: binding.artifactSha256,
    evidenceDigest: binding.evidenceDigest,
    reference,
  }
}

export function discoverVerifiedReviewerEntitlementAvailability({
  repository,
  inputs,
  expectedGitTree,
  requiredEntitlementId = null,
  peerProvider = null,
  peerRuntime = null,
  peerSurface = null,
  peerTarget = null,
  now = new Date(),
} = {}) {
  if (!repository || !inputs || !GIT_OID.test(expectedGitTree ?? '')
    || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('review entitlement discovery requires an exact repository, frozen tree, provider inputs, and valid clock')
  }
  const externalProfiles = inputs.invocationRegistry?.externalEntitlementProfiles
  if (!externalProfiles || typeof externalProfiles !== 'object' || Array.isArray(externalProfiles)) {
    fail('external entitlement profile registry is missing or invalid')
  }
  const eligibleInvocationProfileIds = [...new Set(
    (inputs.capabilityRegistry?.reviewProfiles || [])
      .filter((profile) => profile?.routeClass === 'subscription-entitlement')
      .map((profile) => profile.invocationProfileId),
  )].sort(compareUtf8Bytes)
  const availability = []
  for (const invocationProfileId of eligibleInvocationProfileIds) {
    const profile = externalProfiles[invocationProfileId]
    const binding = profile?.availabilityEvidence
    if (!profile || !binding || typeof binding !== 'object' || Array.isArray(binding)) continue
    if (requiredEntitlementId !== null && profile.entitlementId !== requiredEntitlementId) continue
    if (peerProvider !== null && profile.providerId !== peerProvider) continue
    if (peerRuntime !== null && binding.runtimeKind !== peerRuntime) continue
    if (peerSurface !== null && binding.surface !== peerSurface) continue
    const certificationMatches = inputs.ledger.certifications.filter((record) => (
      record.provider === binding.compatibilityProviderId
      && record.runtimeKind === binding.runtimeKind
      && record.surface === binding.surface
      && record.repositoryRole === binding.repositoryRole
    ))
    if (certificationMatches.length > 1) {
      fail(`multiple entitlement runtime certifications exist:${invocationProfileId}`)
    }
    if (certificationMatches.length === 0) continue
    const certifiedTargets = (certificationMatches[0].platformMatrix || [])
      .filter((target) => target.status === 'certified')
    const target = peerTarget === null
      ? (certifiedTargets.length === 1 ? certifiedTargets[0] : null)
      : certifiedTargets.find((candidate) => candidate.id === peerTarget) ?? null
    if (target === null) continue
    let liveCertification
    try {
      liveCertification = certificationBinding(
        repository,
        inputs,
        binding.compatibilityProviderId,
        binding.runtimeProviderId,
        binding.runtimeKind,
        binding.surface,
        binding.runtimeProfileId,
        expectedGitTree,
        now,
        target.id,
      )
    } catch {
      // Discovery is availability-only. A candidate that cannot prove the
      // existing signed, fresh, exact runtime-certification chain is simply
      // unavailable and can never mint a weaker entitlement capability.
      continue
    }
    if (liveCertification === null
      || liveCertification.certificationId !== certificationMatches[0].id
      || liveCertification.runtimeProviderId !== binding.runtimeProviderId
      || liveCertification.runtimeKind !== binding.runtimeKind
      || liveCertification.surface !== binding.surface
      || liveCertification.targetId !== target.id) continue
    const evidenceBinding = target.runtimeEvidence
    if (!evidenceBinding || typeof evidenceBinding !== 'object' || Array.isArray(evidenceBinding)) continue
    let reference
    try {
      reference = safeRelativePath(
        evidenceBinding.reference,
        `review entitlement evidence ${invocationProfileId} reference`,
      )
    } catch {
      continue
    }
    if (!reference.startsWith('infra/governance/evidence/provider-runtime/')
      || reference !== `infra/governance/evidence/provider-runtime/${evidenceBinding.artifactSha256}.json`) continue
    if (liveCertification.artifactSha256 !== evidenceBinding.artifactSha256
      || liveCertification.evidenceDigest !== evidenceBinding.evidenceDigest
      || liveCertification.reference !== reference) continue
    const artifactPath = resolve(repository, reference)
    let runtimeEvidenceBytes
    try {
      assertSafeExistingPath(repository, artifactPath, `review entitlement evidence ${invocationProfileId}`, {
        targetKind: 'file',
      })
      runtimeEvidenceBytes = readFileSync(artifactPath)
    } catch {
      continue
    }
    try {
      availability.push(verifyEntitlementAvailabilityEvidence({
        invocationRegistry: inputs.invocationRegistry,
        invocationProfileId,
        certificationLedger: inputs.ledger,
        target: reviewTargetIdentity(target),
        expectedGitTree: evidenceBinding.gitTree,
        runtimeEvidenceBytes,
        now,
      }))
    } catch {
      // Exact verification owns the availability decision. Failure cannot
      // create a weaker route or a partially trusted record.
    }
  }
  return availability.sort((left, right) => compareUtf8Bytes(
    `${left.providerId}/${left.invocationProfileId}/${left.entitlementId}`,
    `${right.providerId}/${right.invocationProfileId}/${right.entitlementId}`,
  ))
}

function resolveProviderRuntimeSelection(inputs, id, runtimeOverride, runtimeSurface) {
  if (!PROVIDER_ID.test(id)) fail(`provider id is invalid:${id}`)
  if (!PROVIDER_ID.test(runtimeSurface ?? '')) fail(`provider runtime surface must be explicit and registered:${id}/${runtimeSurface ?? 'missing'}`)
  const record = inputs.registry.providers.find((provider) => provider.id === id)
  if (!record || record.providerKind !== 'concrete-runtime') fail(`provider is not a registered concrete runtime:${id}`)
  const compatibility = Object.entries(inputs.matrix.providers)
    .find(([, value]) => value?.adapterProviderId === id)
  if (!compatibility) fail(`provider has no compatibility registration:${id}`)
  const [compatibilityId, compatibilityRecord] = compatibility
  if (!inputs.validation.surfaceIds.has(runtimeSurface)) {
    fail(`provider runtime surface is unregistered:${id}/${runtimeSurface}`)
  }
  const runtimeKinds = Object.keys(compatibilityRecord.runtimeKinds ?? {}).sort()
  const candidates = runtimeKinds.filter((kind) => (
    typeof compatibilityRecord.runtimeKinds[kind]?.runtimeProfilesBySurface?.[runtimeSurface] === 'string'
  ))
  const preferred = candidates.find((kind) => (
    compatibilityRecord.runtimeKinds[kind].runtimeProfilesBySurface[runtimeSurface] === id
  )) ?? (candidates.length === 1 ? candidates[0] : null)
  const runtimeIdentity = runtimeOverride ?? preferred
  if (!runtimeIdentity || !candidates.includes(runtimeIdentity)) {
    fail(`provider runtime identity/surface tuple is unregistered:${id}/${runtimeIdentity ?? 'missing'}/${runtimeSurface}`)
  }
  const runtimeProfileId = inputs.validation.runtimeProfilesByCertificationTuple
    .get(`${compatibilityId}/${runtimeIdentity}/${runtimeSurface}`)
  if (!runtimeProfileId) fail(`provider runtime compatibility/profile tuple is unresolved:${compatibilityId}/${runtimeIdentity}/${runtimeSurface}`)
  const runtimeProfile = inputs.runtimeProfile.providers.find((profile) => profile.id === runtimeProfileId)
  if (!runtimeProfile || runtimeProfile.adapterProviderId !== id
    || runtimeProfile.runtimeKind !== runtimeIdentity
    || runtimeProfile.certificationSurface !== runtimeSurface) {
    fail(`provider runtime profile binding is invalid:${id}/${runtimeProfileId}/${runtimeIdentity}/${runtimeSurface}`)
  }
  if (compatibilityRecord.runtimeKinds[runtimeIdentity].runtimeEvidenceRequired !== true
    || inputs.matrix.surfaces[runtimeSurface]?.certificationPolicy !== 'target-bound-evidence-required') {
    fail(`provider runtime tuple does not require target-bound evidence:${id}/${runtimeIdentity}/${runtimeSurface}`)
  }
  return { record, compatibilityId, runtimeIdentity, runtimeProfileId }
}

function providerBinding(repository, inputs, id, runtimeOverride, runtimeSurface, headTree, now, reviewBinding, reviewPeerId, targetId = null) {
  const selection = resolveProviderRuntimeSelection(inputs, id, runtimeOverride, runtimeSurface)
  const { record, compatibilityId, runtimeIdentity, runtimeProfileId } = selection
  const reviewTransport = nonEmptyString(reviewBinding.transport, `provider ${id} review transport`)
  return {
    id,
    displayName: nonEmptyString(record.displayName, `provider ${id} displayName`),
    providerKind: record.providerKind,
    runtimeIdentity,
    runtimeSurface,
    runtimeProfileId,
    reviewTransport,
    reviewSkill: reviewBinding.skill,
    reviewPeerId,
    certificationContract: reviewBinding.certificationContract,
    reviewBindingDigest: reviewBinding.bindingDigest,
    registryRecordDigest: digestRows(record),
    runtimeCertification: certificationBinding(
      repository,
      inputs,
      compatibilityId,
      id,
      runtimeIdentity,
      runtimeSurface,
      runtimeProfileId,
      headTree,
      now,
      targetId,
    ),
  }
}

export function captureDeepAuditSnapshot(repoRoot) {
  const repository = resolveRepositoryRoot(repoRoot)
  const head = String(git(repository, ['rev-parse', 'HEAD'])).trim()
  const tree = String(git(repository, ['rev-parse', 'HEAD^{tree}'])).trim()
  if (!GIT_OID.test(head) || !GIT_OID.test(tree)) fail('repository HEAD/tree identity is invalid')
  const { rows: inventory, indexDigest } = buildInventory(repository)
  const inventoryDigest = digestRows(inventory)
  return {
    repository,
    head,
    tree,
    indexDigest,
    inventory,
    inventoryDigest,
    worktreeFingerprint: digestRows({ head, tree, indexDigest, inventoryDigest }),
  }
}

export function digestInventoryRows(inventory, paths) {
  if (!Array.isArray(inventory) || !Array.isArray(paths) || paths.length === 0) fail('inventory digest selection must be non-empty arrays')
  const sorted = [...paths].sort()
  if (new Set(sorted).size !== sorted.length || sorted.some((path, index) => path !== paths[index])) {
    fail('inventory digest paths must be unique and sorted')
  }
  const byPath = new Map(inventory.map((row) => [row.path, row]))
  const rows = sorted.map((path) => {
    const row = byPath.get(path)
    if (!row) fail(`coverage path is absent from frozen inventory:${path}`)
    return row
  })
  return digestRows(rows)
}

export function digestInventorySelection(manifest, paths) {
  return digestInventoryRows(manifest.inventory, paths)
}

export function digestSandboxVerification(manifest) {
  if (!manifest || !Array.isArray(manifest.inventory) || manifest.inventory.length === 0) fail('sandbox verification requires frozen inventory')
  const transcript = `${manifest.inventory.map((row) => `${row.path}\0${row.kind}\0${row.mode}\0${row.sha256}`).join('\n')}\n`
  return sha256(transcript)
}

function validateInventoryRow(row, label) {
  exactKeys(row, ['path', 'kind', 'mode', 'bytes', 'sha256'], label)
  safeRelativePath(row.path, `${label}.path`)
  if (!['file', 'symlink', 'missing'].includes(row.kind)) fail(`${label}.kind is invalid`)
  if (!/^(?:100644|100755|120000|160000)$/.test(row.mode)) fail(`${label}.mode is invalid`)
  if (!Number.isSafeInteger(row.bytes) || row.bytes < 0) fail(`${label}.bytes is invalid`)
  if (!SHA256.test(row.sha256)) fail(`${label}.sha256 is invalid`)
}

export function assertDeepAuditInventoryTopology(inventory, label = 'deep-audit inventory') {
  if (!Array.isArray(inventory) || inventory.length === 0) fail(`${label} must be a non-empty array`)
  const byPath = new Map()
  for (const row of inventory) {
    if (!row || typeof row !== 'object' || typeof row.path !== 'string' || !row.path) fail(`${label} row is invalid`)
    if (byPath.has(row.path)) fail(`${label} path is duplicated:${row.path}`)
    byPath.set(row.path, row)
  }
  for (const row of inventory) {
    const parts = row.path.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      const ancestorPath = parts.slice(0, index).join('/')
      const ancestor = byPath.get(ancestorPath)
      if (!ancestor || ancestor.kind === 'missing') continue
      if (!['file', 'symlink'].includes(ancestor.kind)) fail(`${label} ancestor kind is invalid:${ancestorPath}`)
      if (row.kind !== 'missing') {
        fail(`${label} has a non-missing descendant below ${ancestor.kind} leaf:${ancestorPath} -> ${row.path}`)
      }
      break
    }
  }
  return true
}

function validateCertification(binding, label) {
  if (binding === null) return
  exactKeys(binding, [
    'certificationId', 'certificationStatus', 'providerId', 'runtimeProviderId', 'runtimeKind', 'surface',
    'repositoryRole', 'targetId', 'targetDigest', 'certifiedAt', 'expiresAt',
    'recordDigest', 'artifactSha256', 'evidenceDigest', 'reference',
  ], label)
  for (const key of ['certificationId', 'providerId', 'runtimeProviderId', 'runtimeKind', 'surface', 'repositoryRole', 'targetId', 'reference']) nonEmptyString(binding[key], `${label}.${key}`)
  if (!['certified', 'conditional'].includes(binding.certificationStatus)) fail(`${label}.certificationStatus is invalid`)
  validIso(binding.certifiedAt, `${label}.certifiedAt`)
  validIso(binding.expiresAt, `${label}.expiresAt`)
  if (Date.parse(binding.expiresAt) <= Date.parse(binding.certifiedAt)) fail(`${label} expiry ordering is invalid`)
  if (!SHA256.test(binding.recordDigest) || !SHA256.test(binding.targetDigest) || !SHA256.test(binding.artifactSha256)) fail(`${label} digest is invalid`)
  if (!/^sha256:[a-f0-9]{64}$/.test(binding.evidenceDigest)) fail(`${label}.evidenceDigest is invalid`)
  if (!new RegExp(`^infra/governance/evidence/(?:provider-runtime|external-runtime)/${binding.artifactSha256}\\.json$`).test(binding.reference)) {
    fail(`${label}.reference is not content-addressed by artifactSha256`)
  }
}

function validateProvider(provider, label, { allowBlockedPeer = false } = {}) {
  exactKeys(provider, [
    'id', 'displayName', 'providerKind', 'runtimeIdentity', 'runtimeSurface', 'runtimeProfileId',
    'reviewTransport', 'reviewSkill', 'reviewPeerId',
    'certificationContract', 'reviewBindingDigest', 'registryRecordDigest', 'runtimeCertification',
  ], label)
  if (!PROVIDER_ID.test(provider.id)) fail(`${label}.id is invalid`)
  nonEmptyString(provider.displayName, `${label}.displayName`)
  if (provider.providerKind !== 'concrete-runtime') fail(`${label}.providerKind must be concrete-runtime`)
  nonEmptyString(provider.runtimeIdentity, `${label}.runtimeIdentity`)
  if (!PROVIDER_ID.test(provider.runtimeSurface ?? '')) fail(`${label}.runtimeSurface is invalid`)
  if (!PROVIDER_ID.test(provider.runtimeProfileId ?? '')) fail(`${label}.runtimeProfileId is invalid`)
  nonEmptyString(provider.reviewTransport, `${label}.reviewTransport`)
  if (provider.reviewSkill !== 'deep-audit-cross-codex') fail(`${label}.reviewSkill is invalid`)
  if (allowBlockedPeer && provider.reviewPeerId === null) {
    // A frozen source candidate may bind the policy and registry state before
    // any independent capability is certified. It must not invent a peer.
  } else if (!PROVIDER_ID.test(provider.reviewPeerId) || provider.reviewPeerId === provider.id) {
    fail(`${label}.reviewPeerId is invalid`)
  }
  if (provider.certificationContract !== EXACT_REVIEW_CERTIFICATION_CONTRACT) fail(`${label}.certificationContract is invalid`)
  if (!SHA256.test(provider.reviewBindingDigest) || !SHA256.test(provider.registryRecordDigest)) fail(`${label} digest is invalid`)
  validateCertification(provider.runtimeCertification, `${label}.runtimeCertification`)
  if (provider.runtimeCertification && (provider.runtimeCertification.runtimeProviderId !== provider.id
    || provider.runtimeCertification.runtimeKind !== provider.runtimeIdentity
    || provider.runtimeCertification.surface !== provider.runtimeSurface
    || provider.runtimeCertification.repositoryRole !== 'authority')) {
    fail(`${label}.runtimeCertification binds a different provider/runtime/surface/role tuple`)
  }
}

export function validateSelectedEntitlementPeerBinding(manifest) {
  const selection = manifest.reviewSelection
  if (selection?.kind !== 'provider-review-capability-selection'
    || selection.selected?.routeClass !== 'subscription-entitlement') return true
  const selected = selection.selected
  const matches = (selection.entitlementAvailability || []).filter((record) => (
    record?.providerId === selected.providerId
    && record.invocationProfileId === selected.invocationProfileId
    && record.entitlementId === selected.entitlementId
  ))
  if (matches.length !== 1) {
    fail('subscription-entitlement selection must bind exactly one verified availability record')
  }
  const availability = matches[0]
  const peer = manifest.providers.peer
  const certification = peer?.runtimeCertification
  if (!peer
    || !certification
    || availability.runtimeProviderId !== peer.id
    || availability.runtimeProfileId !== peer.runtimeProfileId
    || availability.runtimeKind !== peer.runtimeIdentity
    || availability.runtimeSurface !== peer.runtimeSurface
    || availability.repositoryRole !== 'authority'
    || availability.runtimeCertificationId !== certification.certificationId
    || availability.runtimeCertificationDigest !== certification.recordDigest
    || availability.target?.id !== certification.targetId
    || availability.targetDigest !== certification.targetDigest) {
    fail('subscription-entitlement availability is detached from the exact peer runtime/surface/profile/target certification')
  }
  return true
}

export function validateDeepAuditRunManifest(manifest) {
  // This is the portable, structure-and-digest validator. Authenticity is
  // established separately: a live run is re-derived by loadActiveDeepAuditRun
  // with requireCurrent=true, while a historical run is bound by its signed,
  // content-addressed rollout receipt. Re-projecting a historical manifest
  // against today's mutable checkout would make valid old evidence non-durable.
  const isHistorical = manifest?.schemaVersion === HISTORICAL_MANIFEST_SCHEMA_VERSION
  exactKeys(manifest, [
    'schemaVersion', 'contractVersion', 'evidenceKind', 'runId', 'createdAt', 'head', 'tree',
    'indexDigest', 'inventoryDigest', 'rubricDigest', 'worktreeFingerprint', 'authorProvider',
    'providerIdentityDigest', 'providers', ...(isHistorical ? [] : ['reviewSelection']),
    'inventory', 'rubricPaths', 'components',
  ], 'run manifest')
  if (![HISTORICAL_MANIFEST_SCHEMA_VERSION, MANIFEST_SCHEMA_VERSION].includes(manifest.schemaVersion)
    || manifest.contractVersion !== CONTRACT_VERSION || manifest.evidenceKind !== MANIFEST_KIND) fail('run manifest identity is invalid')
  if (!RUN_ID.test(manifest.runId)) fail('run manifest runId is invalid')
  validIso(manifest.createdAt, 'run manifest createdAt')
  if (!GIT_OID.test(manifest.head) || !GIT_OID.test(manifest.tree)) fail('run manifest Git identity is invalid')
  for (const key of ['indexDigest', 'inventoryDigest', 'rubricDigest', 'worktreeFingerprint']) {
    if (!SHA256.test(manifest[key])) fail(`run manifest ${key} is invalid`)
  }
  exactKeys(manifest.providers, ['self', 'peer'], 'run manifest providers')
  const blockedSelection = !isHistorical
    && manifest.reviewSelection?.kind === 'provider-review-capability-selection-blocked'
  const waivedSelection = !isHistorical
    && manifest.reviewSelection?.kind === 'provider-review-capability-selection-waived'
  const selectionWithoutPeer = blockedSelection || waivedSelection
  validateProvider(manifest.providers.self, 'run manifest providers.self', { allowBlockedPeer: selectionWithoutPeer })
  if (selectionWithoutPeer) {
    if (manifest.providers.peer !== null || manifest.providers.self.reviewPeerId !== null) {
      fail('blocked or waived run manifest must not invent a peer provider')
    }
  } else {
    validateProvider(manifest.providers.peer, 'run manifest providers.peer')
    if (manifest.providers.self.id === manifest.providers.peer.id) fail('run manifest providers must be distinct')
    if (manifest.providers.self.reviewPeerId !== manifest.providers.peer.id
      || manifest.providers.peer.reviewPeerId !== manifest.providers.self.id
      || manifest.providers.self.reviewBindingDigest !== manifest.providers.peer.reviewBindingDigest) {
      fail('run manifest provider review binding is asymmetric or mismatched')
    }
  }
  if (!PROVIDER_ID.test(manifest.authorProvider)) fail('run manifest authorProvider is invalid')
  if (manifest.authorProvider !== manifest.providers.self.id) fail('run manifest authorProvider must equal providers.self.id')
  if (manifest.providers.peer !== null && manifest.authorProvider === manifest.providers.peer.id) {
    fail('run manifest peer provider must differ from authorProvider')
  }
  if (!isHistorical) {
    try {
      if (blockedSelection) validateBlockedReviewCapabilitySelectionReceipt(manifest.reviewSelection)
      else if (waivedSelection) validateDeepAuditSecondOpinionWaiver(manifest.reviewSelection)
      else validateReviewCapabilitySelectionReceipt(manifest.reviewSelection)
    } catch (error) {
      fail(`run manifest review capability selection is invalid:${error.message}`)
    }
    if (manifest.reviewSelection.authorProviderId !== manifest.authorProvider
      || manifest.reviewSelection.selfProviderId !== manifest.providers.self.id
      || manifest.reviewSelection.bindingDigest !== manifest.providers.self.reviewBindingDigest
      || (!selectionWithoutPeer && (
        manifest.reviewSelection.selected.providerId !== manifest.providers.peer.id
        || manifest.reviewSelection.bindingDigest !== manifest.providers.peer.reviewBindingDigest
      ))) {
      fail('run manifest review capability selection is detached from provider bindings')
    }
    validateSelectedEntitlementPeerBinding(manifest)
  }
  if (!SHA256.test(manifest.providerIdentityDigest)
    || manifest.providerIdentityDigest !== deepAuditProviderIdentityDigest({
      authorProvider: manifest.authorProvider,
      providers: manifest.providers,
      ...(isHistorical ? {} : { reviewSelection: manifest.reviewSelection }),
    })) fail('run manifest providerIdentityDigest mismatches author/provider bindings')
  if (!Array.isArray(manifest.inventory) || manifest.inventory.length === 0) fail('run manifest inventory is empty')
  manifest.inventory.forEach((row, index) => validateInventoryRow(row, `run manifest inventory[${index}]`))
  const inventoryPaths = manifest.inventory.map((row) => row.path)
  if (new Set(inventoryPaths).size !== inventoryPaths.length || inventoryPaths.some((path, index) => index > 0 && path <= inventoryPaths[index - 1])) fail('run manifest inventory must be unique and sorted')
  assertDeepAuditInventoryTopology(manifest.inventory, 'run manifest inventory')
  if (digestRows(manifest.inventory) !== manifest.inventoryDigest) fail('run manifest inventoryDigest mismatches')
  if (!Array.isArray(manifest.rubricPaths) || manifest.rubricPaths.length === 0) fail('run manifest rubricPaths is empty')
  if (digestInventoryRows(manifest.inventory, manifest.rubricPaths) !== manifest.rubricDigest) fail('run manifest rubricDigest mismatches')
  if (!Array.isArray(manifest.components) || manifest.components.length === 0) fail('run manifest components is empty')
  const componentRoot = 'packages/design-system/src/components/'
  const inventoryByPath = new Map(manifest.inventory.map((row) => [row.path, row]))
  const expectedComponentPaths = manifest.inventory
    .filter((row) => row.kind === 'file' && row.path.startsWith(componentRoot) && row.path.slice(componentRoot.length).includes('/'))
    .map((row) => row.path)
    .sort()
  const observedComponentPaths = []
  let prior = ''
  for (const component of manifest.components) {
    exactKeys(component, ['name', 'paths', 'digest'], 'run manifest component')
    nonEmptyString(component.name, 'run manifest component.name')
    if (component.name.includes('/') || component.name.includes('\\') || /\p{Cc}/u.test(component.name)) fail('run manifest component.name is unsafe')
    if (prior && component.name <= prior) fail('run manifest components must be unique and sorted')
    prior = component.name
    if (!Array.isArray(component.paths) || component.paths.length === 0) fail(`component inventory paths are empty:${component.name}`)
    if (new Set(component.paths).size !== component.paths.length
      || component.paths.some((path, index) => index > 0 && path <= component.paths[index - 1])) {
      fail(`component inventory paths must be unique and sorted:${component.name}`)
    }
    const expectedPrefix = `${componentRoot}${component.name}/`
    for (const path of component.paths) {
      const row = inventoryByPath.get(path)
      if (!row || row.kind !== 'file' || !path.startsWith(expectedPrefix)) fail(`component inventory path is not an exact regular member:${component.name}:${path}`)
      observedComponentPaths.push(path)
    }
    if (!SHA256.test(component.digest) || digestInventoryRows(manifest.inventory, component.paths) !== component.digest) fail(`component inventory digest mismatches:${component.name}`)
  }
  observedComponentPaths.sort()
  if (new Set(observedComponentPaths).size !== observedComponentPaths.length
    || stableStringify(observedComponentPaths) !== stableStringify(expectedComponentPaths)) {
    fail('run manifest components do not exactly partition the after-image component files')
  }
  const expectedFingerprint = digestRows({
    head: manifest.head,
    tree: manifest.tree,
    indexDigest: manifest.indexDigest,
    inventoryDigest: manifest.inventoryDigest,
  })
  if (expectedFingerprint !== manifest.worktreeFingerprint) fail('run manifest worktreeFingerprint mismatches')
  return true
}

export function validateDeepAuditRunProviderBindings(manifest, {
  repoRoot = process.cwd(),
  now = new Date(),
} = {}) {
  validateDeepAuditRunManifest(manifest)
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    fail('historical fixed-peer manifest cannot drive a new capability-selected review')
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('provider binding validation time must be a valid Date')
  const repository = resolveRepositoryRoot(repoRoot)
  const inputs = loadProviderInputs(repository, now)
  const blockedSelection = manifest.reviewSelection.kind === 'provider-review-capability-selection-blocked'
  const waivedSelection = manifest.reviewSelection.kind === 'provider-review-capability-selection-waived'
  const selectionWithoutPeer = blockedSelection || waivedSelection
  const sourceSelection = waivedSelection
    ? manifest.reviewSelection.underlyingSelection
    : manifest.reviewSelection
  const sourceSelectionBlocked = sourceSelection.kind === 'provider-review-capability-selection-blocked'
  const entitlementAvailability = waivedSelection
    ? []
    : reverifyEntitlementAvailability(
        repository,
        inputs,
        sourceSelection.entitlementAvailability,
        manifest.tree,
        now,
      )
  let resolvedReview
  try {
    resolvedReview = resolveProviderReviewBinding({
      registry: inputs.registry,
      skill: 'deep-audit-cross-codex',
      selfProviderId: manifest.providers.self.id,
      authorProviderId: manifest.authorProvider,
      expectedPeerProviderId: waivedSelection || sourceSelectionBlocked ? null : sourceSelection.selected.providerId,
      expectedReviewProfileId: waivedSelection || sourceSelectionBlocked ? null : sourceSelection.selected.reviewProfileId,
      expectedModelReleaseId: waivedSelection || sourceSelectionBlocked ? null : sourceSelection.selected.modelReleaseId,
      requiredEntitlementId: waivedSelection ? null : sourceSelection.requiredEntitlementId,
      entitlementAvailability,
      requireCertificationContract: true,
      requireSelectedCapability: !waivedSelection && !sourceSelectionBlocked,
      capabilityRegistry: inputs.capabilityRegistry,
      capabilityCertificationLedger: inputs.capabilityCertificationLedger,
      invocationRegistry: inputs.invocationRegistry,
      modelReleaseRegistry: inputs.modelReleaseRegistry,
      now,
    })
  } catch (error) {
    fail(`run manifest provider review binding is stale:${error.message}`)
  }
  if (!waivedSelection && !sourceSelectionBlocked) {
    try {
      verifyReviewCapabilitySelection({
        receipt: sourceSelection,
        registry: inputs.registry,
        capabilityRegistry: inputs.capabilityRegistry,
        capabilityCertificationLedger: inputs.capabilityCertificationLedger,
        invocationRegistry: inputs.invocationRegistry,
        modelReleaseRegistry: inputs.modelReleaseRegistry,
        skill: 'deep-audit-cross-codex',
        selfProviderId: manifest.providers.self.id,
        authorProviderId: manifest.authorProvider,
        requiredEntitlementId: sourceSelection.requiredEntitlementId,
        entitlementAvailability,
        observedProviderId: resolvedReview.peer.id,
        observedReviewProfileId: resolvedReview.selectedProfile.id,
        observedModelReleaseId: resolvedReview.selectedProfile.modelReleaseId,
        observedResponseModelId: resolvedReview.selectedProfile.requestModelId,
        now,
      })
    } catch (error) {
      fail(`run manifest review capability selection is stale:${error.message}`)
    }
  }
  if (waivedSelection && resolvedReview.bindingDigest !== manifest.reviewSelection.bindingDigest) {
    fail('run manifest second-opinion waiver binding is stale')
  }
  if (!waivedSelection && stableStringify(resolvedReview.selectionReceipt) !== stableStringify(sourceSelection)) {
    fail('run manifest review capability selection receipt is stale')
  }
  const expectedByRole = {
    self: { record: resolvedReview.self, reviewPeerId: selectionWithoutPeer ? null : resolvedReview.peer.id },
    ...(selectionWithoutPeer ? {} : {
      peer: { record: resolvedReview.peer, reviewPeerId: resolvedReview.self.id },
    }),
  }
  for (const role of selectionWithoutPeer ? ['self'] : ['self', 'peer']) {
    const provider = manifest.providers[role]
    const expected = expectedByRole[role]
    const resolved = resolveProviderRuntimeSelection(
      inputs,
      provider.id,
      provider.runtimeIdentity,
      provider.runtimeSurface,
    )
    if (resolved.runtimeProfileId !== provider.runtimeProfileId
      || resolved.record.id !== expected.record.id
      || provider.displayName !== expected.record.displayName
      || provider.providerKind !== expected.record.providerKind
      || digestRows(resolved.record) !== provider.registryRecordDigest
      || provider.reviewTransport !== resolvedReview.transport
      || provider.reviewSkill !== resolvedReview.skill
      || provider.reviewPeerId !== expected.reviewPeerId
      || provider.certificationContract !== resolvedReview.certificationContract
      || provider.reviewBindingDigest !== resolvedReview.bindingDigest) {
      fail(`run manifest provider compatibility/profile binding is stale:${provider.id}`)
    }
    if (provider.runtimeCertification !== null) {
      const expected = certificationBinding(
        repository,
        inputs,
        resolved.compatibilityId,
        provider.id,
        provider.runtimeIdentity,
        provider.runtimeSurface,
        provider.runtimeProfileId,
        manifest.tree,
        now,
        provider.runtimeCertification.targetId,
      )
      if (expected === null || stableStringify(expected) !== stableStringify(provider.runtimeCertification)) {
        fail(`run manifest runtime certification binding is stale:${provider.id}`)
      }
    }
  }
  return true
}

export function prepareDeepAuditRun({
  repoRoot = process.cwd(),
  explicitRoot = null,
  selfProvider = null,
  peerProvider = null,
  authorProvider = null,
  selfRuntime = null,
  peerRuntime = null,
  selfSurface = null,
  peerSurface = null,
  selfTarget = null,
  peerTarget = null,
  requiredReviewerEntitlement = null,
  reviewerEntitlementAvailability = [],
  secondOpinionWaiver = null,
  replaceActive = false,
  now = new Date(),
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('prepare time must be a valid Date')
  if (!selfProvider) fail('self provider must be explicit; no provider default is permitted')
  if (!selfSurface) fail('self runtime surface must be explicit; no surface default is permitted')
  if (!Array.isArray(reviewerEntitlementAvailability)) {
    fail('reviewer entitlement availability must be verified adapter readback records')
  }
  if (![null, 'user'].includes(secondOpinionWaiver)) {
    fail('second-opinion waiver must be the exact value user')
  }
  if (secondOpinionWaiver !== null && (peerProvider !== null || peerRuntime !== null
    || peerSurface !== null || peerTarget !== null || requiredReviewerEntitlement !== null
    || reviewerEntitlementAvailability.length > 0)) {
    fail('second-opinion waiver cannot be combined with peer selection inputs')
  }
  const resolvedAuthorProvider = authorProvider ?? selfProvider
  const paths = evidencePaths({ repoRoot, explicitRoot, create: true })
  const activeRelative = 'deep-audit/active-run.json'
  const activePath = prepareRuntimeEvidenceFile({ repoRoot: paths.repository, explicitRoot, relativePath: activeRelative })
  if (existsSync(activePath) && !replaceActive) fail('an active deep-audit run already exists; explicit --replace-active is required')
  const snapshot = captureDeepAuditSnapshot(paths.repository)
  const inputs = loadProviderInputs(paths.repository, now)
  const verifiedReviewerEntitlementAvailability = secondOpinionWaiver !== null
    ? []
    : reviewerEntitlementAvailability.length > 0
    ? reverifyEntitlementAvailability(
        paths.repository,
        inputs,
        reviewerEntitlementAvailability,
        snapshot.tree,
        now,
      )
    : discoverVerifiedReviewerEntitlementAvailability({
        repository: paths.repository,
        inputs,
        expectedGitTree: snapshot.tree,
        requiredEntitlementId: requiredReviewerEntitlement,
        peerProvider,
        peerRuntime,
        peerSurface,
        peerTarget,
        now,
      })
  let resolvedReview
  try {
    resolvedReview = resolveProviderReviewBinding({
      registry: inputs.registry,
      skill: 'deep-audit-cross-codex',
      selfProviderId: selfProvider,
      authorProviderId: resolvedAuthorProvider,
      expectedPeerProviderId: peerProvider,
      requiredEntitlementId: requiredReviewerEntitlement,
      entitlementAvailability: verifiedReviewerEntitlementAvailability,
      requireCertificationContract: true,
      requireSelectedCapability: false,
      capabilityRegistry: inputs.capabilityRegistry,
      capabilityCertificationLedger: inputs.capabilityCertificationLedger,
      invocationRegistry: inputs.invocationRegistry,
      modelReleaseRegistry: inputs.modelReleaseRegistry,
      now,
    })
  } catch (error) {
    fail(`deep-audit review binding is invalid:${error.message}`)
  }
  const reviewSelection = secondOpinionWaiver === 'user'
    ? buildDeepAuditSecondOpinionWaiver({
        underlyingSelection: resolvedReview.selectionReceipt,
        authorProviderId: resolvedAuthorProvider,
        selfProviderId: selfProvider,
        now,
      })
    : resolvedReview.selectionReceipt
  const selectedCapability = secondOpinionWaiver === null && resolvedReview.peer !== null
  const selectedEntitlementAvailability = selectedCapability
    && resolvedReview.selectionReceipt.selected.routeClass === 'subscription-entitlement'
    ? verifiedReviewerEntitlementAvailability.find((record) => (
        record.providerId === resolvedReview.selectionReceipt.selected.providerId
        && record.invocationProfileId === resolvedReview.selectionReceipt.selected.invocationProfileId
        && record.entitlementId === resolvedReview.selectionReceipt.selected.entitlementId
      )) ?? null
    : null
  const resolvedPeerRuntime = peerRuntime ?? selectedEntitlementAvailability?.runtimeKind ?? null
  const resolvedPeerSurface = peerSurface ?? selectedEntitlementAvailability?.runtimeSurface ?? null
  const resolvedPeerTarget = peerTarget ?? selectedEntitlementAvailability?.target?.id ?? null
  if (selectedCapability && !resolvedPeerSurface) {
    fail('peer runtime surface must be explicit after capability selection')
  }
  const resolvedPeerProvider = selectedCapability ? resolvedReview.peer.id : null
  const { rubricPaths, components } = deriveDeepAuditManifestProjections({
    repoRoot: paths.repository,
    inventory: snapshot.inventory,
  })
  const providers = {
    self: providerBinding(paths.repository, inputs, selfProvider, selfRuntime, selfSurface, snapshot.tree, now, resolvedReview, resolvedPeerProvider, selfTarget),
    peer: selectedCapability
      ? providerBinding(
          paths.repository,
          inputs,
          resolvedPeerProvider,
          resolvedPeerRuntime,
          resolvedPeerSurface,
          snapshot.tree,
          now,
          resolvedReview,
          selfProvider,
          resolvedPeerTarget,
        )
      : null,
  }
  const manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    contractVersion: CONTRACT_VERSION,
    evidenceKind: MANIFEST_KIND,
    runId: randomUUID(),
    createdAt: now.toISOString(),
    head: snapshot.head,
    tree: snapshot.tree,
    indexDigest: snapshot.indexDigest,
    inventoryDigest: snapshot.inventoryDigest,
    rubricDigest: digestInventoryRows(snapshot.inventory, rubricPaths),
    worktreeFingerprint: snapshot.worktreeFingerprint,
    authorProvider: resolvedAuthorProvider,
    providerIdentityDigest: deepAuditProviderIdentityDigest({
      authorProvider: resolvedAuthorProvider,
      providers,
      reviewSelection,
    }),
    providers,
    reviewSelection,
    inventory: snapshot.inventory,
    rubricPaths,
    components,
  }
  validateDeepAuditRunManifest(manifest)
  const manifestBytes = Buffer.from(`${stableStringify(manifest, 2)}\n`)
  const manifestSha256 = sha256(manifestBytes)
  const manifestRelative = `deep-audit/runs/${manifest.runId}/run-manifest.json`
  const manifestPath = prepareRuntimeEvidenceFile({ repoRoot: paths.repository, explicitRoot, relativePath: manifestRelative })
  const runRoot = dirname(manifestPath)
  writeExclusive(manifestPath, manifestBytes, 'run manifest')
  const pointer = { schemaVersion: 1, evidenceKind: POINTER_KIND, runId: manifest.runId, manifestSha256 }
  const pointerBytes = Buffer.from(`${stableStringify(pointer, 2)}\n`)
  if (existsSync(activePath)) {
    const tempRelative = `deep-audit/.active-run.${randomUUID()}.tmp`
    const tempPath = prepareRuntimeEvidenceFile({ repoRoot: paths.repository, explicitRoot, relativePath: tempRelative })
    replaceAtomic(activePath, tempPath, pointerBytes, 'active run pointer')
  } else writeExclusive(activePath, pointerBytes, 'active run pointer')
  return { ...paths, manifest, manifestSha256, manifestPath, runRoot, activePath }
}

function assertCurrentSnapshot(manifest, repository) {
  const current = captureDeepAuditSnapshot(repository)
  for (const key of ['head', 'tree', 'indexDigest', 'inventoryDigest', 'worktreeFingerprint']) {
    if (current[key] !== manifest[key]) fail(`active run is stale:${key} changed`)
  }
  const currentProjections = deriveDeepAuditManifestProjections({ repoRoot: repository, inventory: current.inventory })
  const currentRubricPaths = currentProjections.rubricPaths
  if (stableStringify(currentRubricPaths) !== stableStringify(manifest.rubricPaths)) {
    fail('active run rubric projection differs from the current build graph and frozen inventory')
  }
  const currentComponents = currentProjections.components
  if (stableStringify(currentComponents) !== stableStringify(manifest.components)) {
    fail('active run component projection differs from the current after-image inventory')
  }
}

export function loadActiveDeepAuditRun({ repoRoot = process.cwd(), explicitRoot = null, requireCurrent = true } = {}) {
  const paths = evidencePaths({ repoRoot, explicitRoot, create: false })
  const activePath = resolveRuntimeEvidencePath({ repoRoot: paths.repository, explicitRoot, relativePath: 'deep-audit/active-run.json' })
  const pointerRead = readJsonFile(activePath, 'active run pointer')
  const pointer = pointerRead.value
  exactKeys(pointer, ['schemaVersion', 'evidenceKind', 'runId', 'manifestSha256'], 'active run pointer')
  if (pointer.schemaVersion !== 1 || pointer.evidenceKind !== POINTER_KIND || !RUN_ID.test(pointer.runId) || !SHA256.test(pointer.manifestSha256)) {
    fail('active run pointer identity is invalid')
  }
  const manifestRelative = `deep-audit/runs/${pointer.runId}/run-manifest.json`
  const manifestPath = resolveRuntimeEvidencePath({ repoRoot: paths.repository, explicitRoot, relativePath: manifestRelative })
  const runRoot = dirname(manifestPath)
  const manifestRead = readJsonFile(manifestPath, 'run manifest')
  if (sha256(manifestRead.bytes) !== pointer.manifestSha256) fail('active run manifest digest mismatches pointer')
  const manifest = manifestRead.value
  validateDeepAuditRunManifest(manifest)
  if (manifest.runId !== pointer.runId) fail('active run pointer and manifest runId mismatch')
  if (requireCurrent) assertCurrentSnapshot(manifest, paths.repository)
  return { ...paths, activePath, pointer, manifestPath, runRoot, manifest, manifestSha256: pointer.manifestSha256 }
}

function validateProducer(producer, evidenceKind, manifest) {
  exactKeys(producer, [
    'providerId', 'runtime', 'runtimeSurface', 'runtimeProfileId',
    'model', 'transport', 'runtimeCertificationDigest',
  ], 'evidence producer')
  if (producer.providerId === 'generic') {
    if (!GENERIC_KINDS.has(evidenceKind)) fail('generic producer is forbidden for judgment/A1b evidence')
    if (producer.runtime !== 'deterministic-script' || producer.runtimeSurface !== 'local'
      || producer.runtimeProfileId !== null || producer.model !== 'none'
      || producer.transport !== 'local-process' || producer.runtimeCertificationDigest !== null) {
      fail('generic producer identity is not canonical')
    }
    return
  }
  const provider = [manifest.providers.self, manifest.providers.peer]
    .filter(Boolean)
    .find((item) => item.id === producer.providerId)
  if (!provider) fail(`evidence producer is not a run provider:${producer.providerId}`)
  if (producer.runtime !== provider.runtimeIdentity) fail('evidence producer runtime mismatches run manifest')
  if (producer.runtimeSurface !== provider.runtimeSurface) fail('evidence producer runtime surface mismatches run manifest')
  if (producer.runtimeProfileId !== provider.runtimeProfileId) fail('evidence producer runtime profile mismatches run manifest')
  nonEmptyString(producer.model, 'evidence producer model')
  nonEmptyString(producer.transport, 'evidence producer transport')
  if (!provider.runtimeCertification) fail(`evidence producer lacks runtime certification:${producer.providerId}`)
  if (producer.runtimeCertificationDigest !== provider.runtimeCertification.recordDigest) fail('evidence producer runtime certification digest mismatches')
}

function validateCommand(command) {
  exactKeys(command, ['argv', 'cwd', 'exitCode', 'startedAt', 'finishedAt'], 'evidence command')
  if (!Array.isArray(command.argv) || command.argv.length === 0 || command.argv.some((arg) => typeof arg !== 'string' || !arg)) fail('evidence command argv is invalid')
  if (command.cwd !== '.') fail('evidence command cwd must be repository-relative dot')
  if (!Number.isInteger(command.exitCode)) fail('evidence command exitCode is invalid')
  validIso(command.startedAt, 'evidence command startedAt')
  validIso(command.finishedAt, 'evidence command finishedAt')
  if (Date.parse(command.finishedAt) < Date.parse(command.startedAt)) fail('evidence command timestamps are reversed')
}

function validateCoverage(coverage, manifest) {
  exactKeys(coverage, ['inventoryPaths', 'inventoryDigest', 'filesScanned'], 'evidence coverage')
  if (!Number.isSafeInteger(coverage.filesScanned) || coverage.filesScanned <= 0) fail('evidence coverage filesScanned is invalid')
  if (!Array.isArray(coverage.inventoryPaths) || coverage.inventoryPaths.length !== coverage.filesScanned) fail('evidence coverage path count mismatches')
  const digest = digestInventorySelection(manifest, coverage.inventoryPaths)
  if (coverage.inventoryDigest !== digest) fail('evidence coverage inventoryDigest mismatches frozen inventory')
}

function canonicalExecutionEnvironment(manifest, repository) {
  const lockfile = manifest.inventory.find((row) => row.path === 'package-lock.json' && row.kind === 'file')
  if (!lockfile) fail('package-lock.json must be present in the frozen inventory')
  if (typeof repository !== 'string' || !repository) fail('execution environment requires an explicit repository root')
  const lockfilePath = resolve(repository, lockfile.path)
  assertSafeExistingPath(repository, lockfilePath, 'frozen package-lock.json', { targetKind: 'file' })
  const before = lstatSync(lockfilePath, { bigint: true })
  const lockfileBytes = readFileSync(lockfilePath)
  const after = lstatSync(lockfilePath, { bigint: true })
  if (
    before.dev !== after.dev
    || before.ino !== after.ino
    || before.mode !== after.mode
    || before.nlink !== after.nlink
    || before.size !== after.size
    || before.mtimeNs !== after.mtimeNs
    || before.ctimeNs !== after.ctimeNs
    || sha256(lockfileBytes) !== lockfile.sha256
  ) fail('package-lock.json changed after the deep-audit snapshot')
  let lock
  try {
    lock = JSON.parse(lockfileBytes.toString('utf8'))
  } catch (error) {
    fail(`package-lock.json is invalid JSON:${error.message}`)
  }
  const npmRecord = lock?.packages?.['node_modules/npm']
  const npmVersion = npmRecord?.version
  if (
    lock.lockfileVersion !== 3
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(npmVersion ?? '')
    || lock.packages?.['']?.devDependencies?.npm !== npmVersion
    || npmRecord.resolved !== `https://registry.npmjs.org/npm/-/npm-${npmVersion}.tgz`
    || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(npmRecord.integrity ?? '')
    || npmRecord.bin?.npm !== 'bin/npm-cli.js'
  ) fail('frozen package-lock.json does not bind one canonical exact npm runtime')
  return {
    nodeVersion: process.version,
    npmVersion,
    platform: process.platform,
    arch: process.arch,
    lockfilePath: lockfile.path,
    lockfileSha256: lockfile.sha256,
  }
}

function validateExecutionEnvironment(environment, manifest, { requireCurrent = false, repoRoot = null } = {}) {
  exactKeys(environment, ['nodeVersion', 'npmVersion', 'platform', 'arch', 'lockfilePath', 'lockfileSha256'], 'evidence execution environment')
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(environment.nodeVersion)
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(environment.npmVersion)) fail('evidence execution runtime versions are invalid')
  nonEmptyString(environment.platform, 'evidence execution environment platform')
  nonEmptyString(environment.arch, 'evidence execution environment arch')
  const lockfile = manifest.inventory.find((row) => row.path === environment.lockfilePath && row.kind === 'file')
  if (environment.lockfilePath !== 'package-lock.json' || !lockfile || environment.lockfileSha256 !== lockfile.sha256) fail('evidence execution environment lockfile is not bound to frozen inventory')
  if (requireCurrent && stableStringify(environment) !== stableStringify(canonicalExecutionEnvironment(manifest, repoRoot))) {
    fail('evidence execution environment mismatches the producer/write runtime')
  }
}

function validateModelTransportReceipt(receipt, coverage, label) {
  exactKeys(receipt, [
    'promptSha256', 'promptBytes', 'responseSha256', 'responseBytes', 'providerRunId', 'sessionId',
    'coverageInventoryDigest', 'transcriptReference', 'transcriptSha256', 'transcriptBytes',
    'invocationProfileDigest', 'resultSchemaSha256',
  ], label)
  for (const key of ['promptSha256', 'responseSha256', 'transcriptSha256', 'invocationProfileDigest', 'resultSchemaSha256']) {
    if (!SHA256.test(receipt[key])) fail(`${label}.${key} is invalid`)
  }
  if (!Number.isSafeInteger(receipt.promptBytes) || receipt.promptBytes <= 0
    || !Number.isSafeInteger(receipt.responseBytes) || receipt.responseBytes <= 0
    || !Number.isSafeInteger(receipt.transcriptBytes) || receipt.transcriptBytes <= 0) fail(`${label} byte counts are invalid`)
  nonEmptyString(receipt.providerRunId, `${label}.providerRunId`)
  nonEmptyString(receipt.sessionId, `${label}.sessionId`)
  if (receipt.coverageInventoryDigest !== coverage?.inventoryDigest) fail(`${label} coverage assertion mismatches the envelope`)
  const reference = safeRelativePath(receipt.transcriptReference, `${label}.transcriptReference`)
  if (!/^(?:judgment|component-a1b)\/[a-z][a-z0-9-]*\/_transcripts\/[a-f0-9]{64}\.json$/.test(reference)
    || !reference.endsWith(`/${receipt.transcriptSha256}.json`)) fail(`${label} transcript reference is not content-addressed`)
}

function validateModelAccessReceiptShape(receipt, coverage, label) {
  exactKeys(receipt, [
    'schemaVersion', 'status', 'traceFormat', 'traceSha256', 'traceBytes',
    'coverageInventoryDigest', 'contentAccessPaths', 'missingPaths', 'outsideCoveragePaths',
    'forbiddenToolUses', 'nonContentToolUseCount',
  ], label)
  if (receipt.schemaVersion !== 1 || !['verified', 'coverage-unverified'].includes(receipt.status)) fail(`${label} identity/status is invalid`)
  if (!['claude-stream-json', 'codex-jsonl-unverifiable', 'unavailable'].includes(receipt.traceFormat)
    || !SHA256.test(receipt.traceSha256) || !Number.isSafeInteger(receipt.traceBytes) || receipt.traceBytes <= 0
    || receipt.coverageInventoryDigest !== coverage?.inventoryDigest
    || !Number.isSafeInteger(receipt.nonContentToolUseCount) || receipt.nonContentToolUseCount < 0) fail(`${label} trace binding is invalid`)
  for (const field of ['contentAccessPaths', 'missingPaths', 'outsideCoveragePaths', 'forbiddenToolUses']) {
    if (!Array.isArray(receipt[field]) || receipt[field].some((value) => typeof value !== 'string' || !value)
      || new Set(receipt[field]).size !== receipt[field].length
      || receipt[field].some((value, index) => index > 0 && value <= receipt[field][index - 1])) fail(`${label}.${field} must be unique and sorted`)
  }
  const expectedPaths = coverage?.inventoryPaths ?? []
  if (receipt.contentAccessPaths.some((path) => !expectedPaths.includes(path))
    || receipt.missingPaths.some((path) => !expectedPaths.includes(path))) fail(`${label} coverage partition contains a foreign path`)
  const observedPartition = [...receipt.contentAccessPaths, ...receipt.missingPaths].sort()
  if (stableStringify(observedPartition) !== stableStringify(expectedPaths)) fail(`${label} does not partition exact frozen coverage`)
  if (receipt.outsideCoveragePaths.length !== 0) fail(`${label} records out-of-coverage content access`)
  if (receipt.forbiddenToolUses.length !== 0) fail(`${label} records a forbidden tool invocation`)
  const verifiable = receipt.traceFormat === 'claude-stream-json' && receipt.missingPaths.length === 0
  if ((receipt.status === 'verified') !== verifiable) fail(`${label} status does not match trace-backed coverage`)
}

function validateJudgmentFinding(finding, label) {
  exactKeys(finding, ['path', 'line', 'severity', 'rule', 'problem', 'recommendation'], label)
  safeRelativePath(finding.path, `${label}.path`)
  if (!Number.isSafeInteger(finding.line) || finding.line <= 0) fail(`${label}.line is invalid`)
  if (!['blocking', 'material', 'marginal'].includes(finding.severity)) fail(`${label}.severity is invalid`)
  for (const key of ['rule', 'problem', 'recommendation']) nonEmptyString(finding[key], `${label}.${key}`)
}

function validateFalseClaim(finding, label) {
  exactKeys(finding, ['claimId', 'path', 'line', 'severity', 'claim', 'actual', 'recommendation'], label)
  if (!SHA256.test(finding.claimId)) fail(`${label}.claimId is invalid`)
  safeRelativePath(finding.path, `${label}.path`)
  if (!Number.isSafeInteger(finding.line) || finding.line <= 0) fail(`${label}.line is invalid`)
  if (!['blocking', 'material', 'marginal'].includes(finding.severity)) fail(`${label}.severity is invalid`)
  for (const key of ['claim', 'actual', 'recommendation']) nonEmptyString(finding[key], `${label}.${key}`)
}

function validateComponentClaimReceipt(receipt, payload, { manifest, repoRoot } = {}) {
  exactKeys(receipt, [
    'schemaVersion', 'status', 'claimInventoryDigest', 'claimCount', 'verdictDigest',
    'verifiedCount', 'falseCount', 'unverifiableCount', 'supportingSourceSetDigest',
    'supportingSourceCount', 'dependencySourceFindingsDigest', 'dependencySourceFindingCount',
  ], 'A1b claim receipt')
  if (receipt.schemaVersion !== 1 || !['verified', 'unverifiable'].includes(receipt.status)
    || !SHA256.test(receipt.claimInventoryDigest) || !SHA256.test(receipt.verdictDigest)
    || !SHA256.test(receipt.supportingSourceSetDigest) || !SHA256.test(receipt.dependencySourceFindingsDigest)
    || !Number.isSafeInteger(receipt.claimCount) || receipt.claimCount <= 0
    || !Number.isSafeInteger(receipt.verifiedCount) || receipt.verifiedCount < 0
    || !Number.isSafeInteger(receipt.falseCount) || receipt.falseCount < 0
    || !Number.isSafeInteger(receipt.unverifiableCount) || receipt.unverifiableCount < 0
    || !Number.isSafeInteger(receipt.supportingSourceCount) || receipt.supportingSourceCount <= 0
    || !Number.isSafeInteger(receipt.dependencySourceFindingCount) || receipt.dependencySourceFindingCount < 0
    || receipt.verifiedCount + receipt.falseCount + receipt.unverifiableCount !== receipt.claimCount
    || (receipt.status === 'verified') !== (receipt.unverifiableCount === 0 && receipt.dependencySourceFindingCount === 0)) {
    fail('A1b claim receipt counts/identity are invalid')
  }
  if (!repoRoot) fail('A1b claim receipt validation requires repository bytes')
  let inventory
  try { inventory = buildComponentClaimInventory({ repoRoot, manifest, component: payload.component }) }
  catch (error) { fail(`A1b deterministic claim inventory is invalid:${error.message}`) }
  if (receipt.claimInventoryDigest !== inventory.claimInventoryDigest
    || receipt.claimCount !== inventory.claimCount || payload.claimsVerified !== inventory.claimCount
    || receipt.falseCount !== payload.falseClaims.length
    || receipt.supportingSourceSetDigest !== inventory.supportingSourceSetDigest
    || receipt.supportingSourceCount !== inventory.supportingSourceCount
    || receipt.dependencySourceFindingsDigest !== inventory.dependencySourceFindingsDigest
    || receipt.dependencySourceFindingCount !== inventory.dependencySourceFindingCount) {
    fail('A1b claim receipt does not bind the complete frozen claim/dependency-source inventory')
  }
  const claimById = new Map(inventory.claims.map((claim) => [claim.claimId, claim]))
  const ids = new Set()
  for (const falseClaim of payload.falseClaims) {
    const claim = claimById.get(falseClaim.claimId)
    if (!claim || ids.has(falseClaim.claimId) || claim.path !== falseClaim.path || claim.line !== falseClaim.line) {
      fail(`A1b false claim does not match a unique frozen claim:${falseClaim.claimId}`)
    }
    ids.add(falseClaim.claimId)
  }
  return inventory
}

function validateSandboxReceipt(receipt, manifest, label, {
  repoRoot,
  manifestSha256,
  now = new Date(),
  evidenceKind = null,
  selectedProvider = null,
  evidenceEnvelopeDigest = null,
} = {}) {
  const localKeys = [
    'materialization',
    'manifestVerificationBeforeDigest',
    'manifestVerificationAfterDigest',
    'callerFingerprintBeforeDigest',
    'callerFingerprintAfterDigest',
    'dependencyViewBeforeDigest',
    'dependencyViewAfterDigest',
    'dependencyLockfileSha256',
    'installedLockfileSha256',
    'installedDependencyIdentityDigest',
    'dependencyProvenance',
    'dependencyTrust',
    'executionIsolation',
    'containmentBackend',
    'externalWriteContainment',
    'cleanup',
  ]
  const managed = receipt?.dependencyTrust === 'managed-ci-attested'
  if (managed) {
    if (!repoRoot || !manifestSha256) fail(`${label} managed CI validation requires repository trust roots and active manifest digest`)
    if (!evidenceKind) fail(`${label} managed CI validation requires an evidence kind`)
    const frozenLockfile = manifest.inventory.find(row => row.path === 'package-lock.json' && row.kind === 'file')
    if (!frozenLockfile) fail(`${label} frozen manifest lacks package-lock.json`)
    let managedState
    let expectedManaged
    try {
      managedState = loadManagedCiTrustedExecutionPlan({ repoRoot, requireActivated: true })
      expectedManaged = managedCiExpectedRawReceiptBinding(managedState, { evidenceKind, selectedProvider })
      validateManagedCiSandboxReceipt({
        receipt,
        repoRoot,
        now,
        expected: {
          manifestVerificationDigest: digestSandboxVerification(manifest),
          dependencyLockfileSha256: frozenLockfile.sha256,
          activeRun: {
            runId: manifest.runId,
            manifestSha256,
            head: manifest.head,
            tree: manifest.tree,
          },
          receiptBinding: expectedManaged,
          workflow: {
            repository: managedState.plan.workflow.repository,
            path: managedState.plan.workflow.path,
            event: managedState.plan.workflow.event,
            head: manifest.head,
            tree: manifest.tree,
          },
          runnerEnvironment: managedCiExpectedAttestedRunnerEnvironment(managedState),
          evidenceEnvelopeDigest,
          maxAgeSeconds: managedState.plan.observation.maxAgeSeconds,
        },
      })
    } catch (error) {
      fail(`${label} managed CI receipt validation failed:${error.message}`)
    }
    return
  }
  exactKeys(receipt, localKeys, label)
  for (const key of [
    'manifestVerificationBeforeDigest',
    'manifestVerificationAfterDigest',
    'callerFingerprintBeforeDigest',
    'callerFingerprintAfterDigest',
    'dependencyViewBeforeDigest',
    'dependencyViewAfterDigest',
    'dependencyLockfileSha256',
    'installedLockfileSha256',
    'installedDependencyIdentityDigest',
  ]) if (!SHA256.test(receipt[key])) fail(`${label}.${key} is invalid`)
  const manifestDigest = digestSandboxVerification(manifest)
  if (receipt.manifestVerificationBeforeDigest !== manifestDigest
    || receipt.manifestVerificationAfterDigest !== manifestDigest) fail(`${label} does not bind the complete frozen manifest before/after`)
  if (receipt.callerFingerprintBeforeDigest !== receipt.callerFingerprintAfterDigest) fail(`${label} caller repository fingerprint changed`)
  if (receipt.dependencyViewBeforeDigest !== receipt.dependencyViewAfterDigest) fail(`${label} installed dependency view changed`)
  const frozenLockfile = manifest.inventory.find((row) => row.path === 'package-lock.json' && row.kind === 'file')
  if (!frozenLockfile || receipt.dependencyLockfileSha256 !== frozenLockfile.sha256) fail(`${label} dependency lockfile is not bound to the frozen manifest`)
  if (receipt.cleanup !== true) fail(`${label} cleanup did not complete`)
  if (receipt.materialization !== 'inode-independent-copy-on-write-or-byte-copy') fail(`${label}.materialization is not the canonical disposable snapshot`)
  if (receipt.dependencyProvenance !== 'caller-node-modules-copy') fail(`${label}.dependencyProvenance is unsupported`)
  if (receipt.dependencyTrust !== 'untrusted-local-copy') fail(`${label}.dependencyTrust must explicitly downgrade copied local dependencies`)
  if (receipt.executionIsolation !== 'disposable-repository-copy'
    || receipt.containmentBackend !== 'none'
    || receipt.externalWriteContainment !== 'unverified') fail(`${label} must not claim external-write containment from a disposable copy alone`)
}

function validateGeneratedOutputReceipt(receipt, label) {
  exactKeys(receipt, ['declaredRoots', 'beforeDigest', 'afterDigest', 'changedPaths'], label)
  if (!Array.isArray(receipt.declaredRoots) || !Array.isArray(receipt.changedPaths)) fail(`${label} paths are invalid`)
  for (const [field, values] of [['declaredRoots', receipt.declaredRoots], ['changedPaths', receipt.changedPaths]]) {
    const normalized = values.map((value, index) => safeRelativePath(value, `${label}.${field}[${index}]`))
    if (new Set(normalized).size !== normalized.length
      || normalized.some((value, index) => index > 0 && value <= normalized[index - 1])) fail(`${label}.${field} must be unique and sorted`)
  }
  if (!SHA256.test(receipt.beforeDigest) || !SHA256.test(receipt.afterDigest)) fail(`${label} digests are invalid`)
  for (const changedPath of receipt.changedPaths) {
    if (!receipt.declaredRoots.some((root) => changedPath === root || changedPath.startsWith(`${root}/`))) {
      fail(`${label} changed path is outside declared output roots:${changedPath}`)
    }
  }
  if (receipt.declaredRoots.length === 0
    && (receipt.changedPaths.length !== 0 || receipt.beforeDigest !== receipt.afterDigest)) fail(`${label} changed output without a declared root`)
}

function canonicalEd25519Signature(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) fail(`${label} encoding is invalid`)
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.length !== 64 || bytes.toString('base64url') !== value) fail(`${label} is not canonical Ed25519`)
  return bytes
}

function validateCiTrustReceipt(receipt, { manifest, manifestSha256, repoRoot, now, dim, capability }) {
  if (receipt?.contract === 'standard-five-step-live-observation-v1') {
    validateStandardFiveStepReceipt(receipt, {
      repoRoot,
      activeRun: { manifest, manifestSha256 },
    })
    const dimension = receipt.observation.dimensions.find((item) => item.dim === dim)
    if (!dimension || dimension.capability !== capability) fail('standard CI receipt dimension/capability differs')
    return true
  }
  exactKeys(receipt, ['contract', 'subject', 'observation', 'observationPayload', 'attestation'], 'CI trust receipt')
  if (receipt.contract !== 'signed-github-check-observation-v1') fail('CI trust receipt contract is unsupported')
  exactKeys(receipt.subject, ['repository', 'workflow', 'checkName', 'runId', 'head', 'tree'], 'CI trust receipt subject')
  for (const key of ['repository', 'workflow', 'checkName', 'runId']) nonEmptyString(receipt.subject[key], `CI trust receipt subject.${key}`)
  // During the governed authority transition the observed workflow run is
  // intentionally pinned to the candidate commit while the prepared manifest
  // is pinned to the candidate tree.  The dimension/observation checks below
  // close the candidate HEAD identity; requiring the manifest HEAD here would
  // incorrectly reject the only valid transition shape.
  if (receipt.subject.tree !== manifest.tree) fail('CI trust receipt subject does not bind the active candidate tree')
  exactKeys(receipt.observation, ['status', 'conclusion', 'observedAt', 'apiPayloadSha256'], 'CI trust receipt observation')
  if (receipt.observation.status !== 'completed' || receipt.observation.conclusion !== 'success' || !SHA256.test(receipt.observation.apiPayloadSha256)) fail('CI trust receipt observation did not complete successfully')
  validIso(receipt.observation.observedAt, 'CI trust receipt observedAt')
  const observedAt = new Date(receipt.observation.observedAt)
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || observedAt > now) fail('CI trust receipt observation time is invalid')
  if (!repoRoot) fail('CI trust receipt validation requires repository trust roots')
  const payloadSha256 = sha256(stableStringify(receipt.observationPayload))
  if (receipt.observation.apiPayloadSha256 !== payloadSha256) fail('CI trust receipt observation payload digest mismatches')
  const schema = JSON.parse(readFileSync(resolve(repoRoot, 'scripts/schemas/ci-evidence-observation.schema.json'), 'utf8'))
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: false })
  addFormats(ajv)
  const validateObservation = ajv.compile(schema)
  const observationDocument = {
    $schema: 'schemas/ci-evidence-observation.schema.json',
    schemaVersion: 1,
    kind: 'ci-enforced-content-addressed-observation',
    payloadSha256,
    payload: receipt.observationPayload,
  }
  if (!validateObservation(observationDocument)) fail(`CI trust receipt observation payload schema failed:${ajv.errorsText(validateObservation.errors)}`)
  const payload = receipt.observationPayload
  if (payload.runBinding.runId !== manifest.runId || payload.runBinding.manifestSha256 !== manifestSha256
    || payload.runBinding.head !== manifest.head || payload.runBinding.tree !== manifest.tree) fail('CI trust receipt observation is bound to a different immutable run')
  if (payload.nonce !== receipt.attestation?.binding?.nonce
    || payload.observedAt !== receipt.observation.observedAt) fail('CI trust receipt nonce/time binding mismatches')
  const expiresAt = new Date(payload.expiresAt)
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= observedAt || now > expiresAt) fail('CI trust receipt is expired or has an invalid validity interval')
  const apiReadbackDigest = sha256(stableStringify({
    repositories: payload.repositories,
    release: payload.release,
    propagation: payload.propagation,
    dimensions: payload.dimensions,
  }))
  if (payload.apiReadbackDigest !== apiReadbackDigest) fail('CI trust receipt API readback digest is not reproducible')
  const dimension = payload.dimensions.find((item) => item.dim === dim)
  if (!dimension || dimension.capability !== capability
    || stableStringify(receipt.subject) !== stableStringify({
      repository: dimension.repository,
      workflow: dimension.workflow,
      checkName: dimension.checkName,
      runId: dimension.runId,
      head: dimension.head,
      tree: dimension.tree,
    })) fail('CI trust receipt dimension/subject binding mismatches')
  const run = dim === 64 ? payload.release.stageWorkflowRun : dim === 66 ? payload.release.mirrorWorkflowRun : null
  if (!run || String(run.id) !== String(dimension.runId)) fail('CI trust receipt workflow run binding is absent')
  const authority = payload.repositories.find((item) => item.role === 'authority')
  const workflowIdentityRecord = authority?.observed?.workflowContents?.[dimension.workflow]?.identity
  if (!workflowIdentityRecord) fail('CI trust receipt workflow identity readback is absent')
  const registry = loadIssuerRegistry(resolve(repoRoot, 'infra/governance/trust/issuers.json'))
  const registryDigest = issuerRegistryDigest(registry)
  const ringsBytes = readFileSync(resolve(repoRoot, 'infra/governance/release-rings.json'))
  const rings = JSON.parse(ringsBytes)
  const canonicalModels = new Map(payload.canonicalModels.map((item) => [item.name, item]))
  const issuerModel = canonicalModels.get('issuers')
  const ringsModel = canonicalModels.get('rings')
  const issuerBytes = readFileSync(resolve(repoRoot, 'infra/governance/trust/issuers.json'))
  if (issuerModel?.path !== 'infra/governance/trust/issuers.json' || issuerModel.sha256 !== sha256(issuerBytes)
    || ringsModel?.path !== 'infra/governance/release-rings.json' || ringsModel.sha256 !== sha256(ringsBytes)) {
    fail('CI trust receipt canonical trust models differ from current repository bytes')
  }
  const policy = rings.attestationPolicy
  if (policy.issuerRegistryDigest !== registryDigest) fail('CI trust receipt issuer registry/policy digest substitution detected')
  let policyState
  try {
    policyState = validateRegistryPolicyBinding(policy, registry, {
      role: 'completion-attestor',
      quorum: policy.completionAttestationQuorum,
      now,
      allowUnactivated: false,
    })
  } catch (error) { fail(`CI trust receipt attestation policy is invalid:${error.message}`) }
  if (!policyState.active) fail('CI trust receipt completion policy is not activated')
  exactKeys(receipt.attestation, ['binding', 'signatures'], 'CI trust receipt attestation')
  const binding = receipt.attestation.binding
  exactKeys(binding, [
    'contract', 'observationSha256', 'nonce', 'issuerRegistryDigest', 'apiReadbackDigest',
    'observedAt', 'expiresAt', 'runBinding', 'dimension',
  ], 'CI trust receipt attestation binding')
  exactKeys(binding.dimension, [
    'dim', 'capability', 'repository', 'workflow', 'checkName', 'runId', 'runAttempt',
    'head', 'tree', 'workflowIdentityDigest',
  ], 'CI trust receipt attestation dimension')
  const expectedBinding = {
    contract: 'ci-enforced-observation-attestation-v1',
    observationSha256: payloadSha256,
    nonce: payload.nonce,
    issuerRegistryDigest: registryDigest,
    apiReadbackDigest,
    observedAt: payload.observedAt,
    expiresAt: payload.expiresAt,
    runBinding: payload.runBinding,
    dimension: {
      dim,
      capability,
      repository: dimension.repository,
      workflow: dimension.workflow,
      checkName: dimension.checkName,
      runId: dimension.runId,
      runAttempt: run.runAttempt,
      head: dimension.head,
      tree: dimension.tree,
      workflowIdentityDigest: sha256(stableStringify(workflowIdentityRecord)),
    },
  }
  if (stableStringify(binding) !== stableStringify(expectedBinding)) fail('CI trust receipt detached binding is not reproducible')
  if (!Array.isArray(receipt.attestation.signatures)
    || receipt.attestation.signatures.length < policy.completionAttestationQuorum
    || receipt.attestation.signatures.length > 5) fail('CI trust receipt lacks bounded completion-attestor quorum')
  const observationBytes = Buffer.from(stableStringify(binding))
  const unsignedReceipt = {
    contract: receipt.contract,
    subject: receipt.subject,
    observation: receipt.observation,
    observationPayload: receipt.observationPayload,
  }
  const receiptBytes = Buffer.from(stableStringify(unsignedReceipt))
  const keys = new Set()
  const subjects = new Set()
  for (const [index, signature] of receipt.attestation.signatures.entries()) {
    exactKeys(signature, ['issuerKeyId', 'observationPayloadSha256', 'observationSignature', 'receiptPayloadSha256', 'receiptSignature'], `CI trust receipt signature[${index}]`)
    if (keys.has(signature.issuerKeyId)) fail('CI trust receipt contains duplicate attestor keys')
    keys.add(signature.issuerKeyId)
    let issuer
    try {
      issuer = resolvePolicyIssuer(policy, registry, signature.issuerKeyId, {
        role: 'completion-attestor',
        at: observedAt,
        validThrough: expiresAt,
      })
      assertIssuerActive(issuer, { role: 'completion-attestor', at: now, validThrough: now })
    } catch (error) { fail(`CI trust receipt issuer is not currently authorized:${error.message}`) }
    subjects.add(issuer.subject)
    if (signature.observationPayloadSha256 !== sha256(observationBytes)
      || !verifySignature(null, observationBytes, publicKeyFromIssuer(issuer), canonicalEd25519Signature(signature.observationSignature, 'CI observation signature'))
      || signature.receiptPayloadSha256 !== sha256(receiptBytes)
      || !verifySignature(null, receiptBytes, publicKeyFromIssuer(issuer), canonicalEd25519Signature(signature.receiptSignature, 'CI receipt signature'))) {
      fail('CI trust receipt detached signature or payload digest is invalid')
    }
  }
  if (subjects.size < policy.completionAttestationQuorum) fail('CI trust receipt quorum is not independent across issuer subjects')
}

function validatePayload(payload, evidenceKind, {
  coverage,
  manifest,
  manifestSha256,
  repoRoot,
  now,
  selectedProvider = null,
  evidenceEnvelopeDigest = null,
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('evidence payload must be an object')
  if (evidenceKind === 'deep-audit-deterministic') {
    if (payload.status === 'UNOBSERVED') {
      exactKeys(payload, [
        'dim', 'name', 'planDigest', 'capabilities', 'commandIds', 'status', 'reasonCode',
        'credentialReferences', 'observedAt', 'summary',
      ], 'deterministic unobserved payload')
      if (payload.dim !== 83
        || payload.reasonCode !== 'NETLIFY_LIVE_CREDENTIAL_REFERENCE_ABSENT'
        || stableStringify(payload.capabilities) !== '["local","network","published-release"]'
        || stableStringify(payload.commandIds) !== '["published-live-deploy"]') {
        fail('deterministic unobserved payload is not the exact credential-gated dim 83 route')
      }
      exactKeys(payload.credentialReferences, ['required', 'observed'], 'deterministic unobserved credential references')
      if (stableStringify(payload.credentialReferences.required)
          !== '["NETLIFY_LIVE_BASIC_AUTH","NETLIFY_PREVIEW_PASSWORD"]'
        || stableStringify(payload.credentialReferences.observed) !== '[]') {
        fail('deterministic unobserved credential-reference receipt is invalid')
      }
      nonEmptyString(payload.name, 'deterministic unobserved payload name')
      if (!SHA256.test(payload.planDigest)) fail('deterministic unobserved payload planDigest is invalid')
      validIso(payload.observedAt, 'deterministic unobserved payload observedAt')
      nonEmptyString(payload.summary, 'deterministic unobserved payload summary')
      return
    }
    exactKeys(payload, ['dim', 'name', 'planDigest', 'capabilities', 'commandIds', 'commands', 'findings', 'summary', 'sandboxReceipt'], 'deterministic payload')
    if (!Number.isInteger(payload.dim)) fail('deterministic payload dim is invalid')
    nonEmptyString(payload.name, 'deterministic payload name')
    if (!SHA256.test(payload.planDigest)) fail('deterministic payload planDigest is invalid')
    if (!Array.isArray(payload.capabilities) || payload.capabilities.length === 0
      || payload.capabilities.some((value) => typeof value !== 'string' || !value)) fail('deterministic payload capabilities are invalid')
    if (!Array.isArray(payload.commandIds) || payload.commandIds.length === 0
      || payload.commandIds.some((value) => typeof value !== 'string' || !value)) fail('deterministic payload commandIds are invalid')
    if (!Array.isArray(payload.commands) || payload.commands.length !== payload.commandIds.length) fail('deterministic payload commands are incomplete')
    for (const command of payload.commands) {
      exactKeys(command, ['argv', 'exitCode', 'startedAt', 'finishedAt', 'stdoutSha256', 'stderrSha256', 'stdoutTail', 'stderrTail', 'generatedOutputReceipt'], 'deterministic payload command')
      if (!Array.isArray(command.argv) || command.argv.length === 0 || command.argv.some((value) => typeof value !== 'string' || !value)) fail('deterministic payload command argv is invalid')
      if (!Number.isInteger(command.exitCode) || !SHA256.test(command.stdoutSha256) || !SHA256.test(command.stderrSha256)) fail('deterministic payload command result is invalid')
      validIso(command.startedAt, 'deterministic payload command startedAt')
      validIso(command.finishedAt, 'deterministic payload command finishedAt')
      if (Date.parse(command.finishedAt) < Date.parse(command.startedAt)) fail('deterministic payload command timestamps are reversed')
      if (typeof command.stdoutTail !== 'string' || typeof command.stderrTail !== 'string') fail('deterministic payload command tails are invalid')
      validateGeneratedOutputReceipt(command.generatedOutputReceipt, 'deterministic payload command generated output receipt')
    }
    if (!Array.isArray(payload.findings)) fail('deterministic payload findings are invalid')
    nonEmptyString(payload.summary, 'deterministic payload summary')
    validateSandboxReceipt(payload.sandboxReceipt, manifest, 'deterministic sandbox receipt', {
      repoRoot, manifestSha256, now, evidenceKind, evidenceEnvelopeDigest,
    })
    return
  }
  if (evidenceKind === 'deep-audit-judgment') {
    const managed = payload?.sandboxReceipt?.dependencyTrust === 'managed-ci-attested'
    exactKeys(payload, managed
      ? ['dim', 'findings', 'brokerReceipt', 'sandboxReceipt']
      : ['dim', 'findings', 'transportReceipt', 'accessReceipt', 'sandboxReceipt'], 'judgment payload')
    if (!Number.isInteger(payload.dim) || !Array.isArray(payload.findings)) fail('judgment payload is invalid')
    const coveragePaths = new Set(coverage?.inventoryPaths ?? [])
    payload.findings.forEach((finding, index) => {
      validateJudgmentFinding(finding, `judgment finding[${index}]`)
      if (!coveragePaths.has(finding.path)) fail(`judgment finding path is outside exact coverage:${finding.path}`)
    })
    if (managed) {
      try {
        validateModelBrokerReceipt(payload.brokerReceipt, {
          coverageInventoryDigest: coverage?.inventoryDigest,
          managedAttestationBinding: payload.sandboxReceipt?.attestation?.binding,
        })
      } catch (error) { fail(`judgment broker receipt is invalid:${error.message}`) }
    } else {
      validateModelTransportReceipt(payload.transportReceipt, coverage, 'judgment transport receipt')
      validateModelAccessReceiptShape(payload.accessReceipt, coverage, 'judgment access receipt')
    }
    validateSandboxReceipt(payload.sandboxReceipt, manifest, 'judgment sandbox receipt', {
      repoRoot, manifestSha256, now, evidenceKind, selectedProvider, evidenceEnvelopeDigest,
    })
    return
  }
  if (evidenceKind === 'deep-audit-hook-residue') {
    exactKeys(payload, ['dim', 'capability', 'enforcementSuiteReceipt', 'replayReceipt', 'sandboxReceipt'], 'hook payload')
    if (!Number.isInteger(payload.dim)) fail('hook payload dim is invalid')
    nonEmptyString(payload.capability, 'hook payload capability')
    const suite = payload.enforcementSuiteReceipt
    exactKeys(suite, ['planSha256', 'commandSha256', 'stdoutSha256', 'stderrSha256', 'sandboxBeforeSha256', 'sandboxAfterSha256', 'sandboxVerificationDigest', 'tests', 'suitePassed'], 'hook enforcement suite receipt')
    for (const key of ['planSha256', 'commandSha256', 'stdoutSha256', 'stderrSha256', 'sandboxBeforeSha256', 'sandboxAfterSha256', 'sandboxVerificationDigest']) {
      if (!SHA256.test(suite[key])) fail(`hook enforcement suite ${key} is invalid`)
    }
    if (suite.sandboxBeforeSha256 !== suite.sandboxAfterSha256) fail('hook enforcement suite mutated its isolated sandbox')
    if (suite.sandboxVerificationDigest !== digestSandboxVerification(manifest)) fail('hook enforcement suite did not verify the complete frozen sandbox inventory')
    if (!Array.isArray(suite.tests) || suite.tests.length === 0) fail('hook enforcement suite tests are empty')
    for (const test of suite.tests) {
      exactKeys(test, ['test', 'observed'], 'hook enforcement suite test')
      nonEmptyString(test.test, 'hook enforcement suite test name')
      if (test.observed !== true) fail(`hook enforcement suite test was not observed:${test.test}`)
    }
    if (suite.suitePassed !== true) fail('hook enforcement suite did not pass')
    const replay = payload.replayReceipt
    exactKeys(replay, ['planSha256', 'inventoryDigest', 'filesScanned', 'invocationCount', 'warningCount', 'blockingCount', 'sandboxBeforeSha256', 'sandboxAfterSha256', 'sandboxVerificationDigest', 'findings', 'invocations', 'focusedContracts', 'complete'], 'hook replay receipt')
    if (replay.planSha256 !== suite.planSha256) fail('hook suite/replay plan digests differ')
    if (!SHA256.test(replay.sandboxBeforeSha256) || !SHA256.test(replay.sandboxAfterSha256)
      || replay.sandboxBeforeSha256 !== replay.sandboxAfterSha256) fail('hook replay mutated or omitted its isolated sandbox digest')
    if (replay.sandboxVerificationDigest !== digestSandboxVerification(manifest)) fail('hook replay did not verify the complete frozen sandbox inventory')
    if (replay.inventoryDigest !== coverage?.inventoryDigest || replay.filesScanned !== coverage?.filesScanned) fail('hook replay coverage does not bind the envelope inventory')
    for (const key of ['filesScanned', 'invocationCount', 'warningCount', 'blockingCount']) {
      if (!Number.isSafeInteger(replay[key]) || replay[key] < (key === 'filesScanned' ? 1 : 0)) fail(`hook replay ${key} is invalid`)
    }
    if (!Array.isArray(replay.invocations) || replay.invocations.length !== replay.invocationCount) fail('hook replay invocationCount mismatches')
    if (!Array.isArray(replay.findings) || !Array.isArray(replay.focusedContracts)) fail('hook replay receipts are incomplete')
    const validateInvocation = (item, label) => {
      exactKeys(item, ['path', 'hook', 'event', 'tool', 'exitCode', 'outcome', 'stdoutBytes', 'stdoutSha256', 'stderrBytes', 'stderrSha256'], label)
      for (const key of ['path', 'hook', 'event', 'tool', 'outcome']) nonEmptyString(item[key], `${label}.${key}`)
      if (!Number.isInteger(item.exitCode) || !Number.isSafeInteger(item.stdoutBytes) || item.stdoutBytes < 0
        || !Number.isSafeInteger(item.stderrBytes) || item.stderrBytes < 0
        || !SHA256.test(item.stdoutSha256) || !SHA256.test(item.stderrSha256)) fail(`${label} result is invalid`)
      if (!['clean', 'warning', 'blocking'].includes(item.outcome)) fail(`${label}.outcome is outside the closed enum`)
      if ((item.outcome === 'blocking' && item.exitCode !== 2) || (item.outcome !== 'blocking' && item.exitCode !== 0)) fail(`${label} exitCode/outcome binding is invalid`)
    }
    replay.invocations.forEach((item, index) => validateInvocation(item, `hook replay invocation[${index}]`))
    replay.findings.forEach((item, index) => {
      exactKeys(item, ['path', 'hook', 'event', 'tool', 'exitCode', 'outcome', 'stdoutBytes', 'stdoutSha256', 'stderrBytes', 'stderrSha256', 'stdoutExcerpt', 'stderrExcerpt'], `hook replay finding[${index}]`)
      const invocationShape = Object.fromEntries(Object.entries(item).filter(([key]) => !['stdoutExcerpt', 'stderrExcerpt'].includes(key)))
      validateInvocation(invocationShape, `hook replay finding[${index}]`)
      if (typeof item.stdoutExcerpt !== 'string' || typeof item.stderrExcerpt !== 'string') fail(`hook replay finding[${index}] excerpts are invalid`)
    })
    const warningCount = replay.invocations.filter((item) => /^(?:warn|warning)$/i.test(item.outcome)).length
    const blockingCount = replay.invocations.filter((item) => /^(?:block|blocked|blocking)$/i.test(item.outcome)).length
    if (warningCount !== replay.warningCount || blockingCount !== replay.blockingCount) fail('hook replay outcome counts mismatch')
    const expectedFindings = replay.invocations.filter((item) => item.outcome !== 'clean')
    const normalizedFindings = replay.findings.map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => !['stdoutExcerpt', 'stderrExcerpt'].includes(key))))
    if (stableStringify(normalizedFindings) !== stableStringify(expectedFindings)) fail('hook replay findings must match every non-clean invocation exactly once')
    for (const item of replay.focusedContracts) {
      exactKeys(item, ['contract', 'hook', 'event', 'tool', 'test', 'observed'], 'hook focused contract')
      for (const key of ['contract', 'hook', 'event', 'test']) nonEmptyString(item[key], `hook focused contract.${key}`)
      if (typeof item.tool !== 'string') fail('hook focused contract.tool must be a string')
      if (item.observed !== true) fail(`hook focused contract was not observed:${item.contract}`)
    }
    if (replay.invocationCount === 0 && replay.focusedContracts.length === 0) fail('hook replay has neither file invocations nor focused contracts')
    if (replay.complete !== true) fail('hook replay is incomplete')
    validateSandboxReceipt(payload.sandboxReceipt, manifest, 'hook sandbox receipt', {
      repoRoot, manifestSha256, now, evidenceKind, evidenceEnvelopeDigest,
    })
    return
  }
  if (evidenceKind === 'deep-audit-ci-enforced') {
    exactKeys(payload, ['dim', 'capability', 'receipt'], 'CI payload')
    if (!Number.isInteger(payload.dim)) fail('CI payload dim is invalid')
    nonEmptyString(payload.capability, 'CI payload capability')
    validateCiTrustReceipt(payload.receipt, { manifest, manifestSha256, repoRoot, now, dim: payload.dim, capability: payload.capability })
    return
  }
  if (evidenceKind === 'deep-audit-component-a1b') {
    const managed = payload?.sandboxReceipt?.dependencyTrust === 'managed-ci-attested'
    exactKeys(payload, managed
      ? ['component', 'claimsVerified', 'falseClaims', 'brokerReceipt', 'claimReceipt', 'sandboxReceipt']
      : ['component', 'claimsVerified', 'falseClaims', 'transportReceipt', 'accessReceipt', 'claimReceipt', 'sandboxReceipt'], 'A1b payload')
    nonEmptyString(payload.component, 'A1b payload component')
    if (!Number.isInteger(payload.claimsVerified) || payload.claimsVerified <= 0 || !Array.isArray(payload.falseClaims)) fail('A1b payload is invalid')
    const coveragePaths = new Set(coverage?.inventoryPaths ?? [])
    payload.falseClaims.forEach((finding, index) => {
      validateFalseClaim(finding, `A1b falseClaim[${index}]`)
      if (!coveragePaths.has(finding.path)) fail(`A1b falseClaim path is outside exact coverage:${finding.path}`)
    })
    if (managed) {
      try {
        validateModelBrokerReceipt(payload.brokerReceipt, {
          coverageInventoryDigest: coverage?.inventoryDigest,
          managedAttestationBinding: payload.sandboxReceipt?.attestation?.binding,
        })
      } catch (error) { fail(`A1b broker receipt is invalid:${error.message}`) }
    } else {
      validateModelTransportReceipt(payload.transportReceipt, coverage, 'A1b transport receipt')
      validateModelAccessReceiptShape(payload.accessReceipt, coverage, 'A1b access receipt')
    }
    validateComponentClaimReceipt(payload.claimReceipt, payload, { manifest, repoRoot })
    validateSandboxReceipt(payload.sandboxReceipt, manifest, 'A1b sandbox receipt', {
      repoRoot, manifestSha256, now, evidenceKind, selectedProvider, evidenceEnvelopeDigest,
    })
    return
  }
  fail(`unsupported evidence kind:${evidenceKind}`)
}

export function expectedDeepAuditEvidencePath(envelope) {
  const payload = envelope.payload
  if (envelope.evidenceKind === 'deep-audit-deterministic') return `deterministic/dim-${payload.dim}.json`
  if (envelope.evidenceKind === 'deep-audit-judgment') return `judgment/${envelope.producer.providerId}/dim-${payload.dim}.json`
  if (envelope.evidenceKind === 'deep-audit-hook-residue') return `hook-residue/dim-${payload.dim}.json`
  if (envelope.evidenceKind === 'deep-audit-ci-enforced') return `ci-enforced/dim-${payload.dim}.json`
  if (envelope.evidenceKind === 'deep-audit-component-a1b') return `component-a1b/${envelope.producer.providerId}/${payload.component}.json`
  fail(`unsupported evidence kind:${envelope.evidenceKind}`)
}

export function managedEvidenceEnvelopeDigest(envelope, relativePath = null) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) fail('managed envelope digest input is invalid')
  const canonicalPath = safeRelativePath(relativePath ?? expectedDeepAuditEvidencePath(envelope), 'managed evidence relativePath')
  const projection = structuredClone(envelope)
  const attestation = projection.payload?.sandboxReceipt?.attestation
  if (attestation && typeof attestation === 'object' && !Array.isArray(attestation)) {
    delete attestation.signatures
    if (attestation.binding && typeof attestation.binding === 'object' && !Array.isArray(attestation.binding)) {
      delete attestation.binding.evidenceEnvelopeDigest
    }
  }
  return sha256(stableStringify({ relativePath: canonicalPath, envelope: projection }))
}

export function validateDeepAuditEvidenceEnvelope(envelope, {
  manifest,
  manifestSha256,
  relativePath = null,
  requireCurrentEnvironment = false,
  repoRoot = null,
  now = new Date(),
} = {}) {
  if (!manifest) fail('evidence validation requires a run manifest')
  if (repoRoot === null) fail('evidence validation requires an explicit repository root')
  const repository = resolveRepositoryRoot(repoRoot)
  validateDeepAuditRunManifest(manifest)
  exactKeys(envelope, [
    'schemaVersion', 'contractVersion', 'evidenceKind', 'runId', 'manifestSha256', 'head', 'tree',
    'inventoryDigest', 'rubricDigest', 'worktreeBefore', 'worktreeAfter', 'producer', 'command',
    'environment', 'coverage', 'payload',
  ], 'evidence envelope')
  if (envelope.schemaVersion !== 1 || envelope.contractVersion !== CONTRACT_VERSION || !EVIDENCE_KINDS.has(envelope.evidenceKind)) fail('evidence envelope identity is invalid')
  if (envelope.runId !== manifest.runId || envelope.manifestSha256 !== manifestSha256) fail('evidence envelope is from a different run')
  for (const key of ['head', 'tree', 'inventoryDigest', 'rubricDigest']) {
    if (envelope[key] !== manifest[key]) fail(`evidence envelope ${key} mismatches run manifest`)
  }
  if (envelope.worktreeBefore !== manifest.worktreeFingerprint || envelope.worktreeAfter !== manifest.worktreeFingerprint) fail('evidence command changed or mismatched the frozen worktree')
  validateProducer(envelope.producer, envelope.evidenceKind, manifest)
  validateCommand(envelope.command)
  validateExecutionEnvironment(envelope.environment, manifest, { requireCurrent: requireCurrentEnvironment, repoRoot: repository })
  validateCoverage(envelope.coverage, manifest)
  const canonicalEvidencePath = expectedDeepAuditEvidencePath(envelope)
  if (relativePath !== null && safeRelativePath(relativePath, 'evidence relativePath') !== canonicalEvidencePath) fail('evidence path does not match envelope identity')
  const evidenceEnvelopeDigest = managedEvidenceEnvelopeDigest(envelope, canonicalEvidencePath)
  validatePayload(envelope.payload, envelope.evidenceKind, {
    coverage: envelope.coverage,
    manifest,
    manifestSha256,
    repoRoot: repository,
    now,
    selectedProvider: ['deep-audit-judgment', 'deep-audit-component-a1b'].includes(envelope.evidenceKind)
      ? envelope.producer.providerId
      : null,
    evidenceEnvelopeDigest,
  })
  validateDeepAuditEvidenceContractSchema(envelope, { repoRoot: repository, manifest })
  if (['deep-audit-deterministic', 'deep-audit-hook-residue', 'deep-audit-ci-enforced'].includes(envelope.evidenceKind)
    && envelope.command.exitCode !== 0) fail('mechanical evidence command did not complete successfully')
  return true
}

export function buildDeepAuditEvidenceEnvelope({
  activeRun,
  evidenceKind,
  producer,
  command,
  coveragePaths,
  payload,
} = {}) {
  if (!activeRun?.manifest || !activeRun.manifestSha256) fail('activeRun is required')
  const { manifest, manifestSha256 } = activeRun
  const envelope = {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    evidenceKind,
    runId: manifest.runId,
    manifestSha256,
    head: manifest.head,
    tree: manifest.tree,
    inventoryDigest: manifest.inventoryDigest,
    rubricDigest: manifest.rubricDigest,
    worktreeBefore: manifest.worktreeFingerprint,
    worktreeAfter: manifest.worktreeFingerprint,
    producer,
    command,
    environment: canonicalExecutionEnvironment(manifest, activeRun.repository),
    coverage: {
      inventoryPaths: coveragePaths,
      inventoryDigest: digestInventorySelection(manifest, coveragePaths),
      filesScanned: coveragePaths.length,
    },
    payload,
  }
  validateDeepAuditEvidenceEnvelope(envelope, {
    manifest,
    manifestSha256,
    requireCurrentEnvironment: true,
    repoRoot: activeRun.repository,
  })
  return envelope
}

export function writeDeepAuditEvidenceEnvelope({
  repoRoot = process.cwd(),
  explicitRoot = null,
  relativePath,
  envelope,
} = {}) {
  if (process.env.GOVERNANCE_READ_ONLY === '1') fail('GOVERNANCE_READ_ONLY forbids evidence writes')
  const active = loadActiveDeepAuditRun({ repoRoot, explicitRoot, requireCurrent: true })
  if (['deep-audit-judgment', 'deep-audit-component-a1b'].includes(envelope?.evidenceKind)) {
    fail('model evidence must be published atomically with its content-addressed transcript')
  }
  validateDeepAuditEvidenceEnvelope(envelope, {
    manifest: active.manifest,
    manifestSha256: active.manifestSha256,
    relativePath,
    requireCurrentEnvironment: true,
    repoRoot: active.repository,
  })
  const safePath = safeRelativePath(relativePath, 'evidence relativePath')
  const target = prepareRuntimeEvidenceFile({
    repoRoot: active.repository,
    explicitRoot,
    relativePath: `deep-audit/runs/${active.manifest.runId}/${safePath}`,
  })
  writeExclusive(target, Buffer.from(`${stableStringify(envelope, 2)}\n`), 'deep-audit evidence')
  return { path: target, envelope }
}

export function validateDeepAuditModelTranscriptArtifact({ bytes, relativePath, envelope, repoRoot = null, manifest = null } = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail('model transcript artifact bytes are empty')
  const digest = sha256(bytes)
  const managed = envelope.payload?.brokerReceipt !== undefined
  const receipt = managed ? envelope.payload.brokerReceipt : envelope.payload.transportReceipt
  if (relativePath !== receipt.transcriptReference || digest !== receipt.transcriptSha256
    || bytes.length !== receipt.transcriptBytes) fail('model transcript artifact does not match its transport receipt')
  if (managed) {
    if (!repoRoot || !manifest) fail('managed model broker transcript validation requires repository bytes and manifest')
    const expectedKind = envelope.evidenceKind === 'deep-audit-judgment' ? 'judgment' : 'component-a1b'
    const expectedSubject = expectedKind === 'judgment' ? envelope.payload.dim : envelope.payload.component
    let claimInventory = null
    if (expectedKind === 'component-a1b') {
      try { claimInventory = buildComponentClaimInventory({ repoRoot, manifest, component: expectedSubject }) }
      catch (error) { fail(`managed model broker A1b inventory is invalid:${error.message}`) }
    }
    let transcript
    try {
      transcript = validateModelBrokerTranscript({
        repoRoot,
        bytes,
        manifest,
        manifestSha256: envelope.manifestSha256,
        task: {
          kind: expectedKind,
          subject: expectedSubject,
          coverage: envelope.coverage,
          claimInventory,
        },
        provider: {
          providerId: envelope.producer.providerId,
          runtime: envelope.producer.runtime,
          requestModelId: envelope.producer.model,
          runtimeCertificationDigest: envelope.producer.runtimeCertificationDigest,
          modelReleaseId: receipt.modelReleaseId,
          modelReleaseBindingDigest: receipt.modelReleaseBindingDigest,
          modelReleaseRegistryDigest: receipt.modelReleaseRegistryDigest,
        },
        managedAttestationBinding: envelope.payload.sandboxReceipt.attestation.binding,
      })
    } catch (error) { fail(`managed model broker transcript is invalid:${error.message}`) }
    const broker = transcript.broker
    const authority = transcript.provider.modelReleaseAuthorityBinding
    for (const [receiptKey, transcriptValue] of [
      ['brokerPlanDigest', broker.planDigest],
      ['invocationRegistryDigest', broker.invocationRegistryDigest],
      ['brokerProfileDigest', broker.brokerProfileDigest],
      ['selectedProfileDigest', broker.selectedProfileDigest],
      ['modelIdentityPolicyDigest', broker.modelIdentityPolicyDigest],
      ['requestModelId', transcript.provider.requestModelId],
      ['observedResponseModelId', transcript.provider.requestModelId],
      ['modelReleaseId', transcript.provider.modelReleaseId],
      ['modelReleaseBindingDigest', transcript.provider.modelReleaseBindingDigest],
      ['modelReleaseRegistryDigest', transcript.provider.modelReleaseRegistryDigest],
      ['modelReleaseAuthorityBindingDigest', sha256(stableStringify(authority))],
      ['effectivePromotionBindingDigest', transcript.provider.effectivePromotionBindingDigest],
      ['modelReleaseValidFrom', authority.modelReleaseValidFrom],
      ['modelReleaseValidUntil', authority.modelReleaseValidUntil],
      ['providerInvocationWindow', authority.providerInvocationWindow],
      ['exchangeInvocationObservations', authority.exchangeInvocationObservations],
      ['modelAuthorityReceiptDigest', sha256(stableStringify(authority.authorityReceipt))],
      ['modelAuthorityReadbackDigest', sha256(stableStringify(authority.sourceReadback))],
      ['modelAuthorityRevocationRegistryDigest', authority.revocationReadback.bodySha256],
      ['modelAuthorityRevocationReadbackDigest', sha256(stableStringify(authority.revocationReadback))],
      ['modelAuthorityAuditReadbackDigest', sha256(stableStringify(authority.auditReadback))],
      ['modelAuthorityReplayLedgerReceiptDigest', authority.authorityReceipt.replayLedgerReceiptDigest],
      ['providerInvocationWindowDigest', sha256(stableStringify(authority.providerInvocationWindow))],
      ['exchangeInvocationObservationsDigest', sha256(stableStringify(authority.exchangeInvocationObservations))],
      ['modelAuthorityPolicyDigest', transcript.provider.modelAuthorityPolicyDigest],
      ['modelAuthorityBindingSchemaDigest', transcript.provider.modelAuthorityBindingSchemaDigest],
      ['modelAuthorityIssuerRegistryDigest', transcript.provider.modelAuthorityIssuerRegistryDigest],
      ['resultSchemaSha256', broker.resultSchemaSha256],
      ['shardSetDigest', broker.shardSetDigest],
      ['shardCount', broker.shardCount],
      ['reductionDigest', broker.reductionDigest],
      ['managedAttestationDigest', transcript.managedAttestationDigest],
    ]) if (stableStringify(receipt[receiptKey]) !== stableStringify(transcriptValue)) fail(`managed model broker receipt/transcript mismatches:${receiptKey}`)
    if (expectedKind === 'judgment') {
      if (transcript.outcome.dim !== envelope.payload.dim
        || stableStringify(transcript.outcome.findings) !== stableStringify(envelope.payload.findings)) {
        fail('managed model broker judgment outcome mismatches envelope')
      }
    } else if (transcript.outcome.component !== envelope.payload.component
      || transcript.outcome.claimsVerified !== envelope.payload.claimsVerified
      || stableStringify(transcript.outcome.falseClaims) !== stableStringify(envelope.payload.falseClaims)
      || stableStringify(transcript.outcome.claimReceipt) !== stableStringify(envelope.payload.claimReceipt)) {
      fail('managed model broker A1b outcome mismatches envelope')
    }
    return transcript
  }
  let transcript
  try { transcript = JSON.parse(bytes.toString('utf8')) } catch (error) { fail(`model transcript artifact is invalid JSON:${error.message}`) }
  exactKeys(transcript, [
    'schemaVersion', 'evidenceKind', 'runId', 'manifestSha256', 'task', 'provider', 'invocation',
    'coverage', 'prompt', 'stdout', 'stderr', 'result', 'accessReceipt', 'claimReceipt',
  ], 'model transcript')
  if (transcript.schemaVersion !== 1 || transcript.evidenceKind !== 'deep-audit-model-transcript'
    || transcript.runId !== envelope.runId || transcript.manifestSha256 !== envelope.manifestSha256) fail('model transcript run identity mismatches')
  exactKeys(transcript.task, ['kind', 'subject'], 'model transcript task')
  const expectedKind = envelope.evidenceKind === 'deep-audit-judgment' ? 'judgment' : 'component-a1b'
  const expectedSubject = expectedKind === 'judgment' ? envelope.payload.dim : envelope.payload.component
  if (transcript.task.kind !== expectedKind || transcript.task.subject !== expectedSubject) fail('model transcript task identity mismatches')
  exactKeys(transcript.provider, ['providerId', 'runtime', 'model'], 'model transcript provider')
  for (const key of ['providerId', 'runtime', 'model']) if (transcript.provider[key] !== envelope.producer[key]) fail(`model transcript provider ${key} mismatches`)
  exactKeys(transcript.invocation, [
    'profileDigest', 'resultSchemaSha256', 'executable', 'argv', 'cwd', 'snapshotRoot', 'startedAt', 'finishedAt',
    'exitCode', 'providerRunId', 'sessionId',
  ], 'model transcript invocation')
  if (transcript.invocation.profileDigest !== receipt.invocationProfileDigest
    || transcript.invocation.resultSchemaSha256 !== receipt.resultSchemaSha256) fail('model transcript profile/schema digest mismatches')
  nonEmptyString(transcript.invocation.executable, 'model transcript executable')
  if (!Array.isArray(transcript.invocation.argv) || transcript.invocation.argv.length === 0
    || transcript.invocation.argv.some((arg) => typeof arg !== 'string' || !arg || DANGEROUS_MODEL_ARGUMENTS.has(arg))) fail('model transcript argv is invalid or unsafe')
  if (transcript.invocation.cwd !== '.') fail('model transcript cwd must be repository-relative dot')
  if (!isAbsolute(transcript.invocation.snapshotRoot)) fail('model transcript snapshotRoot must be the absolute disposable root used for trace normalization')
  validIso(transcript.invocation.startedAt, 'model transcript startedAt')
  validIso(transcript.invocation.finishedAt, 'model transcript finishedAt')
  if (!Number.isInteger(transcript.invocation.exitCode) || transcript.invocation.exitCode !== 0
    || transcript.invocation.startedAt !== envelope.command.startedAt
    || transcript.invocation.finishedAt !== envelope.command.finishedAt
    || transcript.invocation.exitCode !== envelope.command.exitCode
    || stableStringify([transcript.invocation.executable, ...transcript.invocation.argv]) !== stableStringify(envelope.command.argv)) fail('model transcript command receipt mismatches envelope')
  if (transcript.invocation.providerRunId !== receipt.providerRunId || transcript.invocation.sessionId !== receipt.sessionId) fail('model transcript run/session identity mismatches')
  exactKeys(transcript.coverage, ['inventoryDigest', 'filesScanned'], 'model transcript coverage')
  if (transcript.coverage.inventoryDigest !== envelope.coverage.inventoryDigest
    || transcript.coverage.filesScanned !== envelope.coverage.filesScanned) fail('model transcript coverage mismatches')
  if (typeof transcript.prompt !== 'string' || Buffer.byteLength(transcript.prompt) !== receipt.promptBytes
    || sha256(transcript.prompt) !== receipt.promptSha256) fail('model transcript prompt bytes/digest mismatches')
  if (typeof transcript.stdout !== 'string' || typeof transcript.stderr !== 'string') fail('model transcript raw provider output is invalid')
  if (stableStringify(transcript.accessReceipt) !== stableStringify(envelope.payload.accessReceipt)) fail('model transcript access receipt mismatches envelope')
  try {
    validateModelAccessReceipt(transcript.accessReceipt, {
      providerId: envelope.producer.providerId,
      stdout: transcript.stdout,
      snapshotRoot: transcript.invocation.snapshotRoot,
      coveragePaths: envelope.coverage.inventoryPaths,
      coverageInventoryDigest: envelope.coverage.inventoryDigest,
    })
  } catch (error) { fail(`model transcript access proof is invalid:${error.message}`) }
  const responseBytes = Buffer.from(`${stableStringify(transcript.result)}\n`)
  if (responseBytes.length !== receipt.responseBytes || sha256(responseBytes) !== receipt.responseSha256) fail('model transcript structured response digest mismatches')
  if (expectedKind === 'judgment') {
    if (transcript.result?.dim !== envelope.payload.dim
      || stableStringify(transcript.result.findings) !== stableStringify(envelope.payload.findings)) fail('model transcript judgment result mismatches envelope')
    if (transcript.claimReceipt !== null) fail('judgment transcript cannot contain an A1b claim receipt')
  } else {
    if (transcript.result?.component !== envelope.payload.component
      || transcript.result.claimsVerified !== envelope.payload.claimsVerified
      || stableStringify(transcript.result.falseClaims) !== stableStringify(envelope.payload.falseClaims)
      || stableStringify(transcript.claimReceipt) !== stableStringify(envelope.payload.claimReceipt)) fail('model transcript A1b result mismatches envelope')
    if (!repoRoot) fail('model transcript A1b validation requires repository bytes')
    let inventory
    let rebuiltReceipt
    try {
      inventory = buildComponentClaimInventory({ repoRoot, manifest, component: envelope.payload.component })
      rebuiltReceipt = buildComponentClaimReceipt({
        claimInventory: inventory,
        claimVerdicts: transcript.result.claimVerdicts,
        falseClaims: transcript.result.falseClaims,
      })
    } catch (error) { fail(`model transcript A1b claim closure is invalid:${error.message}`) }
    if (stableStringify(rebuiltReceipt) !== stableStringify(envelope.payload.claimReceipt)) fail('model transcript A1b claim receipt is not reproducible')
  }
  return transcript
}

/**
 * Publish one producer's complete receipt set after validating and staging
 * every item. A new category uses one directory rename. Deterministic profiles
 * may append a disjoint staged batch under a fixed transaction marker; readers
 * fail closed while that marker exists, and in-process failures roll back every
 * newly created receipt before removing it.
 */
const DETERMINISTIC_RECEIPT_FILE = /^dim-(?:[1-9]|[1-8][0-9]|9[01])\.json$/
const DETERMINISTIC_APPEND_MARKER = '.append-transaction.json'

function scanDeterministicEvidenceCategory({
  active,
  targetPath,
  allowTransactionMarker = false,
  validateEnvelopes = true,
} = {}) {
  const rows = []
  let transactionMarker = false
  for (const entry of readdirSync(targetPath, { withFileTypes: true }).sort((left, right) => compareUtf8Bytes(left.name, right.name))) {
    const path = resolve(targetPath, entry.name)
    const info = lstatSync(path)
    if (entry.name === DETERMINISTIC_APPEND_MARKER) {
      if (!allowTransactionMarker) fail('deterministic evidence contains an incomplete append transaction')
      if (transactionMarker || info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) {
        fail('deterministic append transaction marker is unsafe')
      }
      transactionMarker = true
      continue
    }
    if (!DETERMINISTIC_RECEIPT_FILE.test(entry.name)) {
      fail(`deterministic evidence category contains an unknown entry:${entry.name}`)
    }
    if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) {
      fail(`deterministic evidence receipt is not a unique regular file:${entry.name}`)
    }
    const bytes = readFileSync(path)
    if (validateEnvelopes) {
      let envelope
      try {
        envelope = JSON.parse(bytes.toString('utf8'))
      } catch (error) {
        fail(`existing deterministic evidence is invalid JSON:${entry.name}:${error.message}`)
      }
      validateDeepAuditEvidenceEnvelope(envelope, {
        manifest: active.manifest,
        manifestSha256: active.manifestSha256,
        relativePath: `deterministic/${entry.name}`,
        requireCurrentEnvironment: true,
        repoRoot: active.repository,
      })
    }
    rows.push({
      name: entry.name,
      mode: (info.mode & 0o7777).toString(8),
      size: bytes.length,
      sha256: sha256(bytes),
    })
  }
  return {
    rows,
    names: new Set(rows.map((row) => row.name)),
    fingerprint: sha256(stableStringify(rows)),
    transactionMarker,
  }
}

export function writeDeepAuditEvidenceEnvelopeBatch({
  repoRoot = process.cwd(),
  explicitRoot = null,
  items,
  publishPrefix = null,
  artifacts = [],
  appendExistingCategory = false,
} = {}) {
  if (process.env.GOVERNANCE_READ_ONLY === '1') fail('GOVERNANCE_READ_ONLY forbids evidence writes')
  if (!Array.isArray(items) || items.length === 0) fail('evidence batch must be non-empty')
  if (typeof appendExistingCategory !== 'boolean') fail('appendExistingCategory must be boolean')
  const active = loadActiveDeepAuditRun({ repoRoot, explicitRoot, requireCurrent: true })
  const relativePaths = items.map((item) => safeRelativePath(item?.relativePath, 'evidence batch relativePath'))
  if (new Set(relativePaths).size !== relativePaths.length) fail('evidence batch contains duplicate paths')
  const category = relativePaths[0].split('/')[0]
  if (!relativePaths.every((path) => path.startsWith(`${category}/`))) fail('evidence batch must publish exactly one top-level evidence category')
  const modelKinds = new Set(['deep-audit-judgment', 'deep-audit-component-a1b'])
  const isModelBatch = modelKinds.has(items[0]?.envelope?.evidenceKind)
  if (items.some((item) => modelKinds.has(item?.envelope?.evidenceKind) !== isModelBatch)) {
    fail('evidence batch cannot mix model and non-model evidence')
  }
  let publishRoot = category
  if (isModelBatch) {
    const provider = items[0]?.envelope?.producer?.providerId
    const expectedCategory = items[0]?.envelope?.evidenceKind === 'deep-audit-judgment'
      ? 'judgment'
      : 'component-a1b'
    const expectedPrefix = `${expectedCategory}/${provider}`
    if (publishPrefix !== expectedPrefix) fail(`model evidence publishPrefix must be exactly ${expectedPrefix}`)
    if (category !== expectedCategory
      || items.some((item) => item?.envelope?.evidenceKind !== items[0].envelope.evidenceKind
        || item?.envelope?.producer?.providerId !== provider)) {
      fail('model evidence batch must contain exactly one provider and evidence kind')
    }
    publishRoot = safeRelativePath(publishPrefix, 'model evidence publishPrefix')
  } else if (publishPrefix !== null || artifacts.length !== 0) {
    fail('non-model evidence batch cannot declare a publishPrefix or artifacts')
  }
  if (appendExistingCategory && (isModelBatch || publishRoot !== 'deterministic')) {
    fail('appendExistingCategory is restricted to deterministic evidence')
  }
  if (!relativePaths.every((path) => path.startsWith(`${publishRoot}/`))) {
    fail(`evidence batch paths must be contained by publish root:${publishRoot}`)
  }
  for (let index = 0; index < items.length; index += 1) {
    validateDeepAuditEvidenceEnvelope(items[index].envelope, {
      manifest: active.manifest,
      manifestSha256: active.manifestSha256,
      relativePath: relativePaths[index],
      requireCurrentEnvironment: true,
      repoRoot: active.repository,
    })
  }
  const artifactRows = artifacts.map((artifact, index) => {
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)
      || Object.keys(artifact).sort().join(',') !== 'bytes,relativePath') {
      fail(`model transcript artifact ${index} must contain exactly bytes and relativePath`)
    }
    const relativePath = safeRelativePath(artifact.relativePath, `model transcript artifact ${index} relativePath`)
    if (!Buffer.isBuffer(artifact.bytes)) fail(`model transcript artifact ${index} bytes must be a Buffer`)
    return { relativePath, bytes: artifact.bytes }
  })
  if (isModelBatch) {
    if (artifactRows.length !== items.length) fail('model evidence requires exactly one transcript artifact per envelope')
    if (new Set(artifactRows.map((artifact) => artifact.relativePath)).size !== artifactRows.length) {
      fail('model evidence batch contains duplicate transcript artifact paths')
    }
    const transcriptPattern = new RegExp(`^${publishRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/_transcripts/([a-f0-9]{64})\\.json$`)
    const artifactByPath = new Map(artifactRows.map((artifact) => [artifact.relativePath, artifact]))
    const referenced = new Set()
    for (const item of items) {
      const reference = (item.envelope.payload.brokerReceipt ?? item.envelope.payload.transportReceipt).transcriptReference
      if (referenced.has(reference)) fail(`model transcript is referenced by more than one envelope:${reference}`)
      referenced.add(reference)
      const artifact = artifactByPath.get(reference)
      if (!artifact) fail(`model transcript artifact is missing:${reference}`)
      const match = reference.match(transcriptPattern)
      if (!match || match[1] !== sha256(artifact.bytes)) fail(`model transcript artifact path is not content addressed:${reference}`)
      validateDeepAuditModelTranscriptArtifact({ bytes: artifact.bytes, relativePath: reference, envelope: item.envelope, repoRoot: active.repository, manifest: active.manifest })
    }
    if (artifactRows.some((artifact) => !referenced.has(artifact.relativePath))) {
      fail('model evidence batch contains an unreferenced transcript artifact')
    }
  } else if (artifactRows.length !== 0) {
    fail('non-model evidence batch cannot contain transcript artifacts')
  }
  const targetRelative = `deep-audit/runs/${active.manifest.runId}/${publishRoot}`
  const targetPath = resolveRuntimeEvidencePath({ repoRoot: active.repository, explicitRoot, relativePath: targetRelative })
  const targetAlreadyExists = existsSync(targetPath)
  let deterministicBefore = null
  if (targetAlreadyExists) {
    if (!appendExistingCategory) fail(`evidence batch publish root already exists:${publishRoot}`)
    const targetInfo = lstatSync(targetPath)
    if (targetInfo.isSymbolicLink() || !targetInfo.isDirectory()) {
      fail('deterministic evidence publish root is unsafe')
    }
    deterministicBefore = scanDeterministicEvidenceCategory({ active, targetPath })
    const newNames = relativePaths.map((path) => path.slice('deterministic/'.length))
    const overlap = newNames.filter((name) => deterministicBefore.names.has(name))
    if (overlap.length) fail(`deterministic append would overwrite existing evidence:${overlap.join(',')}`)
  }
  const slashIndex = publishRoot.lastIndexOf('/')
  const publishParent = slashIndex === -1 ? '' : publishRoot.slice(0, slashIndex)
  const stageName = `.batch-${randomUUID()}`
  const stageRelative = `deep-audit/runs/${active.manifest.runId}/${publishParent ? `${publishParent}/` : ''}${stageName}`
  const stagePath = ensureRuntimeEvidenceDirectory({ repoRoot: active.repository, explicitRoot, relativePath: stageRelative })
  const appendedPaths = []
  let appendMarkerPath = null
  let appendMarkerCreated = false
  try {
    for (let index = 0; index < items.length; index += 1) {
      const insidePublishRoot = relativePaths[index].slice(publishRoot.length + 1)
      const stageFile = prepareRuntimeEvidenceFile({
        repoRoot: active.repository,
        explicitRoot,
        relativePath: `${stageRelative}/${insidePublishRoot}`,
      })
      writeExclusive(stageFile, Buffer.from(`${stableStringify(items[index].envelope, 2)}\n`), 'staged deep-audit evidence')
    }
    for (const artifact of artifactRows) {
      const insidePublishRoot = artifact.relativePath.slice(publishRoot.length + 1)
      const stageFile = prepareRuntimeEvidenceFile({
        repoRoot: active.repository,
        explicitRoot,
        relativePath: `${stageRelative}/${insidePublishRoot}`,
      })
      writeExclusive(stageFile, artifact.bytes, 'staged model transcript artifact')
    }
    loadActiveDeepAuditRun({ repoRoot: active.repository, explicitRoot, requireCurrent: true })
    if (!targetAlreadyExists) {
      renameSync(stagePath, targetPath)
    } else {
      const beforeCommit = scanDeterministicEvidenceCategory({ active, targetPath })
      if (beforeCommit.fingerprint !== deterministicBefore.fingerprint) {
        fail('deterministic evidence changed before append commit')
      }
      appendMarkerPath = resolve(targetPath, DETERMINISTIC_APPEND_MARKER)
      const stagedRows = relativePaths.map((relativePath) => {
        const insidePublishRoot = relativePath.slice(publishRoot.length + 1)
        const path = resolve(stagePath, insidePublishRoot)
        const bytes = readFileSync(path)
        return { name: insidePublishRoot, path, bytes, sha256: sha256(bytes) }
      })
      writeExclusive(appendMarkerPath, Buffer.from(`${stableStringify({
        schemaVersion: 1,
        runId: active.manifest.runId,
        publishRoot,
        files: stagedRows.map(({ name, sha256: digest }) => ({ name, sha256: digest })),
      }, 2)}\n`), 'deterministic append transaction marker')
      appendMarkerCreated = true
      const lockedState = scanDeterministicEvidenceCategory({
        active,
        targetPath,
        allowTransactionMarker: true,
      })
      if (!lockedState.transactionMarker || lockedState.fingerprint !== deterministicBefore.fingerprint) {
        fail('deterministic evidence changed while acquiring append transaction')
      }
      for (const row of stagedRows) {
        const destination = resolve(targetPath, row.name)
        writeExclusive(destination, row.bytes, `deterministic append ${row.name}`)
        appendedPaths.push(destination)
      }
      const committedState = scanDeterministicEvidenceCategory({
        active,
        targetPath,
        allowTransactionMarker: true,
      })
      for (const row of deterministicBefore.rows) {
        const committed = committedState.rows.find((candidate) => candidate.name === row.name)
        if (stableStringify(committed) !== stableStringify(row)) {
          fail(`deterministic append changed pre-existing evidence:${row.name}`)
        }
      }
      for (const row of stagedRows) {
        const committed = committedState.rows.find((candidate) => candidate.name === row.name)
        if (!committed || committed.sha256 !== row.sha256) {
          fail(`deterministic append receipt verification failed:${row.name}`)
        }
      }
      rmSync(stagePath, { recursive: true, force: true })
      unlinkSync(appendMarkerPath)
      appendMarkerCreated = false
    }
  } catch (error) {
    try { rmSync(stagePath, { recursive: true, force: true }) } catch {}
    let rollbackClean = true
    for (const path of appendedPaths.reverse()) {
      try { unlinkSync(path) } catch { rollbackClean = false }
    }
    if (appendMarkerCreated && rollbackClean) {
      try {
        unlinkSync(appendMarkerPath)
        appendMarkerCreated = false
      } catch {
        rollbackClean = false
      }
    }
    if (!rollbackClean) fail(`deterministic append rollback failed after:${error.message}`)
    if (String(error?.message ?? '').startsWith('deep-audit evidence blocked:')) throw error
    fail(`evidence batch publish failed:${error.message}`)
  }
  const paths = relativePaths.map((path) => resolveRuntimeEvidencePath({
    repoRoot: active.repository,
    explicitRoot,
    relativePath: `deep-audit/runs/${active.manifest.runId}/${path}`,
  }))
  const artifactPaths = artifactRows.map((artifact) => resolveRuntimeEvidencePath({
    repoRoot: active.repository,
    explicitRoot,
    relativePath: `deep-audit/runs/${active.manifest.runId}/${artifact.relativePath}`,
  }))
  return { paths, artifactPaths, count: paths.length }
}

export const deepAuditEvidenceContract = Object.freeze({
  contractVersion: CONTRACT_VERSION,
  manifestKind: MANIFEST_KIND,
  pointerKind: POINTER_KIND,
  evidenceKinds: Object.freeze([...EVIDENCE_KINDS]),
  genericProducer: Object.freeze({
    providerId: 'generic',
    runtime: 'deterministic-script',
    runtimeSurface: 'local',
    runtimeProfileId: null,
    model: 'none',
    transport: 'local-process',
    runtimeCertificationDigest: null,
  }),
})
