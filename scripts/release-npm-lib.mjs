#!/usr/bin/env node
// Provider-neutral npm release primitives shared by staging, platform-interactive promotion, and finalization.

import { createHash, randomUUID } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { inspectReleaseSet } from './release-set.mjs'
import { assertReleaseBomSchemaMirror, validateReleaseBom } from './release-bom-contract.mjs'
import {
  PROVENANCE_TYPE,
  validateProvenanceStatement,
} from './verify-upgrade-provenance.mjs'
import {
  expectedReleaseTrustArtifactName,
  STAGE_HEAD_BRANCH,
  STAGE_WORKFLOW_EVENT,
  STAGE_WORKFLOW_PATH,
  validateStageRunIdentityDocument,
} from './release-stage-run-identity.mjs'

export { validateProvenanceStatement }

export const npmRegistry = 'https://registry.npmjs.org'
export const provenanceType = PROVENANCE_TYPE
export const minimumStagedNpmVersion = '11.15.0'
export const FINALIZER_WORKFLOW_PATH = '.github/workflows/release-finalize.yml'
export const FINALIZER_WORKFLOW_EVENT = 'repository_dispatch'

const SHA1 = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const POSITIVE_INTEGER = /^[1-9][0-9]*$/

const sleep = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds))

function parseSemver(version) {
  const match = String(version).match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  )
  if (!match) throw new Error(`invalid semantic version: ${version}`)
  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

export function compareReleaseVersions(left, right) {
  const a = parseSemver(left)
  const b = parseSemver(right)
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    if (a.prerelease.length === b.prerelease.length) return 0
    return a.prerelease.length ? -1 : 1
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = a.prerelease[index]
    const rightIdentifier = b.prerelease[index]
    if (leftIdentifier === undefined) return -1
    if (rightIdentifier === undefined) return 1
    if (leftIdentifier === rightIdentifier) continue
    const leftNumeric = /^\d+$/.test(leftIdentifier)
    const rightNumeric = /^\d+$/.test(rightIdentifier)
    if (leftNumeric && rightNumeric) return BigInt(leftIdentifier) > BigInt(rightIdentifier) ? 1 : -1
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return leftIdentifier > rightIdentifier ? 1 : -1
  }
  return 0
}

export function stagingTagForVersion(version) {
  parseSemver(version)
  return `governance-stage-${version.replace(/[^0-9A-Za-z._-]/g, '-')}`
}

export function planReleaseChannelPromotion({ orderedNames, targetVersion, targetTag, tagVersions }) {
  if (!['beta', 'latest'].includes(targetTag)) {
    throw new Error(`unsupported release channel ${targetTag}; only beta/latest may be promoted`)
  }
  parseSemver(targetVersion)
  if (!Array.isArray(orderedNames) || orderedNames.length !== 3 || new Set(orderedNames).size !== 3) {
    throw new Error('release channel requires exactly three uniquely ordered packages')
  }
  const versions = orderedNames.map((name) => tagVersions[name] ?? null)
  if (versions.every((version) => version === null)) {
    throw new Error(
      `release channel ${targetTag} has never been bootstrapped; interactive channel bootstrap requires an explicit audited procedure`,
    )
  }
  if (versions.some((version) => version === null)) {
    throw new Error(`release channel ${targetTag} is split: one or more package tags are missing`)
  }
  const baselineVersions = Object.fromEntries(orderedNames.map((name, index) => [name, versions[index]]))
  if (versions.every((version) => version === targetVersion)) {
    return { status: 'complete', baselineVersions, promotedCount: orderedNames.length }
  }
  for (const [index, baselineVersion] of versions.entries()) {
    if (baselineVersion !== targetVersion && compareReleaseVersions(targetVersion, baselineVersion) <= 0) {
      throw new Error(
        `release channel downgrade/replay forbidden for ${orderedNames[index]}: `
        + `target ${targetVersion} must be strictly newer than ${baselineVersion}`,
      )
    }
  }
  const promotedCount = versions.findIndex((version) => version !== targetVersion)
  const prefixLength = promotedCount === -1 ? versions.length : promotedCount
  if (versions.some((version, index) => (index < prefixLength) !== (version === targetVersion))) {
    throw new Error(`release channel ${targetTag} has a non-resumable split-brain promotion order`)
  }
  return {
    status: prefixLength ? 'partial' : 'ready',
    baselineVersions,
    promotedCount: prefixLength,
  }
}

export function assertExpectedChannelProgress(actual, expected) {
  const actualBaselines = JSON.stringify(actual.baselineVersions)
  const expectedBaselines = JSON.stringify(expected.baselineVersions)
  if (actualBaselines !== expectedBaselines || actual.promotedCount !== expected.promotedCount) {
    throw new Error(
      `release channel changed concurrently: expected baselines ${expectedBaselines} with `
      + `${expected.promotedCount} promoted, observed ${actualBaselines} with ${actual.promotedCount} promoted`,
    )
  }
}

export function classifyNpmViewResult(result) {
  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  let parsed
  try { parsed = stdout.trim() ? JSON.parse(stdout) : null } catch { parsed = null }
  if (result.status === 0) return { kind: 'found', value: parsed }
  const canonicalStderr404 = stderr.split(/\r?\n/).some((line) => line.trim() === 'npm error code E404')
  if (parsed?.error?.code === 'E404' || (!parsed && canonicalStderr404)) return { kind: 'missing' }
  return {
    kind: 'error',
    message: `npm view failed (exit ${result.status ?? 'unknown'}): ${(stderr || stdout).trim().slice(0, 1500)}`,
  }
}

const forbiddenNpmCredentialNames = (environment) => Object.entries(environment)
  .filter(([name, value]) => {
    if (!String(value || '').trim()) return false
    const normalized = name.toLowerCase()
    return normalized === 'npm_token'
      || normalized === 'node_auth_token'
      || normalized === 'npm_otp'
      || (normalized.startsWith('npm_config_') && /(?:auth.?token|_authtoken|otp)/.test(normalized))
  })
  .map(([name]) => name)
  .sort()

export function assertTokenlessNpmEnvironment(environment) {
  const present = forbiddenNpmCredentialNames(environment)
  if (present.length) {
    throw new Error(`long-lived or injected npm write credentials are forbidden; remove: ${present.join(', ')}`)
  }
}

export function assertInteractivePromotionEnvironment({
  environment,
  stdinIsTTY,
  stdoutIsTTY,
}) {
  assertTokenlessNpmEnvironment(environment)
  if (!stdinIsTTY || !stdoutIsTTY) {
    throw new Error('npm approval/promotion requires a real interactive TTY for platform-enforced login/2FA')
  }
  if (environment.CI || environment.GITHUB_ACTIONS) {
    throw new Error('npm approval/promotion is forbidden in CI because the tokenless flow requires npm platform login/2FA')
  }
}

export function decideNpmStageAction({ name, version, versionState, packageState }) {
  if (versionState?.kind === 'found') {
    throw new Error(`${name}@${version} is already public; staging cannot safely reconstruct the original stage receipt`)
  }
  if (versionState?.kind !== 'missing') {
    throw new Error(`${name}@${version}: version lookup did not produce a safe E404 state`)
  }
  if (packageState?.kind === 'missing') {
    throw new Error(
      `${name} has never been published. Native npm staged publishing cannot create a package. `
      + 'A maintainer must first publish a lower, non-consumed bootstrap version with interactive 2FA, '
      + 'then configure release.yml as a stage-only trusted publisher and disallow tokens.',
    )
  }
  if (packageState?.kind !== 'found' || packageState.value !== name) {
    throw new Error(`${name}: package identity lookup returned an unexpected value`)
  }
  return 'stage-missing-version'
}

export function npmResult(npmCli, args, options = {}) {
  return spawnSync(npmCli, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      npm_config_registry: npmRegistry,
      npm_config_ignore_scripts: 'true',
    },
    ...options,
  })
}

export function npmView(npmCli, spec, field) {
  const result = npmResult(npmCli, ['view', spec, field, '--json', `--registry=${npmRegistry}`])
  const classified = classifyNpmViewResult(result)
  if (classified.kind === 'error') throw new Error(classified.message)
  return classified
}

export function readTagVersions(npmCli, ordered, tag) {
  return Object.fromEntries(ordered.map((item) => {
    const state = npmView(npmCli, `${item.name}@${tag}`, 'version')
    if (state.kind === 'missing') return [item.name, null]
    if (state.kind !== 'found' || typeof state.value !== 'string') {
      throw new Error(`${item.name}: dist-tag ${tag} returned an unexpected value`)
    }
    return [item.name, state.value]
  }))
}

export function readAndPlanChannel(npmCli, ordered, targetVersion, targetTag) {
  return planReleaseChannelPromotion({
    orderedNames: ordered.map((item) => item.name),
    targetVersion,
    targetTag,
    tagVersions: readTagVersions(npmCli, ordered, targetTag),
  })
}

export async function validateRegistryPackage(npmCli, item, identity) {
  const found = npmView(npmCli, `${item.name}@${item.version}`, 'dist')
  if (found.kind !== 'found' || !found.value || typeof found.value !== 'object') {
    throw new Error(`${item.name}@${item.version}: registry read-back is missing`)
  }
  const dist = found.value
  if (dist.integrity !== item.integrity || dist.shasum !== item.shasum) {
    throw new Error(
      `${item.name}@${item.version}: registry digest mismatch `
      + `(integrity=${dist.integrity || '<missing>'}, shasum=${dist.shasum || '<missing>'})`,
    )
  }
  if (dist.attestations?.provenance?.predicateType !== provenanceType || !dist.attestations?.url) {
    throw new Error(`${item.name}@${item.version}: trusted-publishing provenance is missing`)
  }
  const attestationUrl = new URL(dist.attestations.url)
  if (attestationUrl.origin !== npmRegistry || !attestationUrl.pathname.startsWith('/-/npm/v1/attestations/')) {
    throw new Error(`${item.name}@${item.version}: npm attestation URL is not canonical`)
  }
  const response = await fetch(attestationUrl, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`${item.name}@${item.version}: attestation fetch failed with HTTP ${response.status}`)
  const envelope = await response.json()
  const provenance = envelope.attestations?.find((entry) => entry.predicateType === provenanceType)
  const payload = provenance?.bundle?.dsseEnvelope?.payload
  if (!payload) throw new Error(`${item.name}@${item.version}: signed provenance payload is missing`)
  let statement
  try { statement = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) } catch {
    throw new Error(`${item.name}@${item.version}: signed provenance payload is invalid`)
  }
  validateProvenanceStatement(statement, { ...item, ...identity })
}

export async function waitForPublishedPackage(npmCli, item, identity) {
  let lastError
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await validateRegistryPackage(npmCli, item, identity)
      return
    } catch (error) {
      lastError = error
      if (attempt < 12) await sleep(5_000)
    }
  }
  throw lastError
}

export function verifyRegistrySignatures(npmCli, packages) {
  const directory = mkdtempReal('release-registry-signatures-')
  try {
    const dependencies = Object.fromEntries(packages.map((item) => [item.name, item.version]))
    writeFileSync(join(directory, 'package.json'), JSON.stringify({
      name: 'release-registry-signature-verifier',
      version: '0.0.0',
      private: true,
      dependencies,
    }, null, 2) + '\n')
    execFileSync(npmCli, [
      'install', '--package-lock-only', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund',
      `--registry=${npmRegistry}`,
    ], { cwd: directory, stdio: 'inherit', env: { ...process.env, npm_config_registry: npmRegistry } })
    execFileSync(npmCli, ['audit', 'signatures', '--prefix', directory, `--registry=${npmRegistry}`], {
      cwd: directory,
      stdio: 'inherit',
      env: { ...process.env, npm_config_registry: npmRegistry },
    })
    execFileSync(npmCli, ['audit', '--audit-level=high', '--prefix', directory, `--registry=${npmRegistry}`], {
      cwd: directory,
      stdio: 'inherit',
      env: { ...process.env, npm_config_registry: npmRegistry },
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function mkdtempReal(prefix) {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)))
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function inspectDigestBoundEvidenceFile(path, {
  expectedSha256,
  expectedName,
  label = 'release evidence',
}) {
  if (!SHA256.test(expectedSha256 || '')) throw new Error(`${label} expected digest must be a lowercase SHA-256`)
  const absolute = resolve(path)
  const stats = lstatSync(absolute)
  if (!stats.isFile() || stats.isSymbolicLink() || realpathSync(absolute) !== absolute) {
    throw new Error(`${label} must be a canonical regular file (no symlink)`)
  }
  if (expectedName && basename(absolute) !== expectedName) {
    throw new Error(`${label} asset name must be ${expectedName}`)
  }
  if (stats.size < 1) throw new Error(`${label} must not be empty`)
  const digest = sha256File(absolute)
  if (digest !== expectedSha256) throw new Error(`${label} digest differs from the expected certified bytes`)
  return { name: basename(absolute), size: stats.size, sha256: digest, path: absolute }
}

export function loadReleaseContext({ artifacts, bomPath, repository, tag, gitHead }) {
  const canonicalBom = resolve(artifacts, 'release-bom.json')
  if (resolve(bomPath) !== canonicalBom) throw new Error('--bom must be release-bom.json inside --artifacts')
  const bom = JSON.parse(readFileSync(canonicalBom, 'utf8'))
  assertReleaseBomSchemaMirror()
  validateReleaseBom(bom, { requireSbom: true })
  const releaseSet = inspectReleaseSet(artifacts)
  if (bom.source?.repository !== repository || bom.source?.tag !== tag || bom.source?.gitCommit !== gitHead) {
    throw new Error('release BOM identity does not match repository/tag/commit arguments')
  }
  const packagesByName = new Map(bom.packages.map((item) => [item.name, item]))
  const ordered = bom.publishOrder.map((name) => packagesByName.get(name))
  if (ordered.some((item) => !item) || new Set(ordered).size !== 3) throw new Error('release BOM publish order is incomplete')
  if (new Set(ordered.map((item) => item.version)).size !== 1) {
    throw new Error('release BOM packages are not on one exact version train')
  }
  if (!['beta', 'latest'].includes(bom.npmDistTag)) {
    throw new Error(`release BOM channel ${bom.npmDistTag} is unsupported; governed trains may target only beta/latest`)
  }
  for (const item of ordered) {
    if (!/^[0-9a-f]{40}$/.test(item.shasum || '')) throw new Error(`${item.name}: release BOM is missing npm SHA-1 shasum`)
  }
  return {
    releaseSet,
    bom,
    bomPath: canonicalBom,
    ordered,
    targetVersion: ordered[0].version,
    targetTag: bom.npmDistTag,
    stagingTag: stagingTagForVersion(ordered[0].version),
    identity: { repository, tag, gitHead },
  }
}

export function createStageReceipt(context, releaseTrust) {
  validateReleaseTrustBinding(releaseTrust, context)
  return {
    schemaVersion: 2,
    state: 'staging',
    source: { ...context.identity, gitTree: context.bom.source.gitTree },
    releaseTrust,
    releaseSetSha256: context.releaseSet.sha256,
    bomSha256: sha256File(context.bomPath),
    targetTag: context.targetTag,
    stagingTag: context.stagingTag,
    publishOrder: context.ordered.map((item) => item.name),
    packages: context.ordered.map((item) => ({
      name: item.name,
      version: item.version,
      file: item.file,
      integrity: item.integrity,
      shasum: item.shasum,
      status: 'planned',
      stageId: null,
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function allowedObjectKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unexpected.length) throw new Error(`${label} has an open shape: ${unexpected.sort().join(', ')}`)
}

function canonicalTimestamp(value, label) {
  const parsed = new Date(value)
  if (typeof value !== 'string' || !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical UTC timestamp`)
  }
}

export function validateReleaseTrustBinding(binding, context, expected = null) {
  exactObjectKeys(binding, ['authorizationDigest', 'evidenceSha256', 'evidenceFileSha256', 'tagObject', 'artifact'], 'release trust binding')
  if (!SHA256.test(binding.authorizationDigest || '')) throw new Error('release authorization digest is invalid')
  if (!SHA256.test(binding.evidenceSha256 || '')) throw new Error('release trust evidence digest is invalid')
  if (!SHA256.test(binding.evidenceFileSha256 || '')) throw new Error('release trust evidence file digest is invalid')
  if (!SHA1.test(binding.tagObject || '')) throw new Error('release trust tag object is invalid')
  exactObjectKeys(binding.artifact, ['name', 'digest', 'workflow'], 'release trust artifact binding')
  exactObjectKeys(binding.artifact.workflow, ['path', 'event', 'headBranch', 'headSha', 'runId', 'runAttempt'], 'release trust workflow binding')
  const workflow = binding.artifact.workflow
  if (workflow.path !== STAGE_WORKFLOW_PATH || workflow.event !== STAGE_WORKFLOW_EVENT || workflow.headBranch !== STAGE_HEAD_BRANCH) {
    throw new Error('release trust workflow identity drifted')
  }
  if (!SHA1.test(workflow.headSha || '') || workflow.headSha !== context.identity.gitHead) {
    throw new Error('release trust workflow head SHA drifted')
  }
  if (!POSITIVE_INTEGER.test(String(workflow.runId || '')) || !Number.isSafeInteger(workflow.runAttempt) || workflow.runAttempt < 1) {
    throw new Error('release trust workflow run identity is invalid')
  }
  const expectedName = expectedReleaseTrustArtifactName({ runId: workflow.runId, runAttempt: workflow.runAttempt })
  if (binding.artifact.name !== expectedName) throw new Error('release trust artifact name drifted')
  if (!/^sha256:[a-f0-9]{64}$/.test(binding.artifact.digest || '')) throw new Error('release trust artifact digest is invalid')
  if (expected) {
    const expectedBinding = {
      authorizationDigest: expected.authorizationDigest,
      evidenceSha256: expected.evidenceSha256,
      evidenceFileSha256: expected.evidenceFileSha256,
      tagObject: expected.tagObject,
      artifactName: expected.artifactName ?? expectedName,
      artifactDigest: expected.artifactDigest?.startsWith('sha256:')
        ? expected.artifactDigest
        : `sha256:${expected.artifactDigest}`,
      runId: String(expected.runId),
      runAttempt: String(expected.runAttempt),
      headSha: expected.headSha ?? context.identity.gitHead,
    }
    if (binding.authorizationDigest !== expectedBinding.authorizationDigest
      || binding.evidenceSha256 !== expectedBinding.evidenceSha256
      || binding.evidenceFileSha256 !== expectedBinding.evidenceFileSha256
      || binding.tagObject !== expectedBinding.tagObject
      || binding.artifact.name !== expectedBinding.artifactName
      || binding.artifact.digest !== expectedBinding.artifactDigest
      || workflow.runId !== expectedBinding.runId
      || String(workflow.runAttempt) !== expectedBinding.runAttempt
      || workflow.headSha !== expectedBinding.headSha) {
      throw new Error('release trust audit chain differs from the expected original workflow/artifact')
    }
  }
  return binding
}

export function validateStageReceipt(receipt, context, { requireComplete = false, releaseTrustExpected = null } = {}) {
  if (receipt?.schemaVersion !== 2) throw new Error('stage receipt schema is not 2')
  allowedObjectKeys(receipt, [
    'schemaVersion', 'state', 'source', 'releaseTrust', 'releaseSetSha256', 'bomSha256', 'targetTag',
    'stagingTag', 'publishOrder', 'packages', 'createdAt', 'updatedAt', 'awaitingPlatformConfirmationAt',
  ], 'stage receipt')
  validateReleaseTrustBinding(receipt.releaseTrust, context, releaseTrustExpected)
  exactObjectKeys(receipt.source, ['repository', 'tag', 'gitHead', 'gitTree'], 'stage receipt source')
  if (receipt.source?.repository !== context.identity.repository
    || receipt.source?.tag !== context.identity.tag
    || receipt.source?.gitHead !== context.identity.gitHead
    || receipt.source?.gitTree !== context.bom.source.gitTree) {
    throw new Error('stage receipt source identity does not match the release BOM')
  }
  if (receipt.releaseSetSha256 !== context.releaseSet.sha256
    || receipt.bomSha256 !== sha256File(context.bomPath)
    || receipt.targetTag !== context.targetTag
    || receipt.stagingTag !== context.stagingTag
    || JSON.stringify(receipt.publishOrder) !== JSON.stringify(context.bom.publishOrder)) {
    throw new Error('stage receipt plan/digest does not match the exact release set')
  }
  if (!Array.isArray(receipt.packages) || receipt.packages.length !== context.ordered.length) {
    throw new Error('stage receipt package set is incomplete')
  }
  for (let index = 0; index < context.ordered.length; index += 1) {
    const expected = context.ordered[index]
    const actual = receipt.packages[index]
    allowedObjectKeys(actual, [
      'name', 'version', 'file', 'integrity', 'shasum', 'status', 'stageId',
      'attemptedAt', 'failure', 'stagedAt', 'recoveredAt',
    ], `stage receipt package ${index}`)
    for (const field of ['name', 'version', 'file', 'integrity', 'shasum']) {
      if (actual?.[field] !== expected[field]) throw new Error(`stage receipt ${field} drift for ${expected.name}`)
    }
    if (!['planned', 'submitting', 'staged', 'ambiguous'].includes(actual.status)) {
      throw new Error(`stage receipt has invalid status for ${expected.name}`)
    }
    if (actual.status === 'staged' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actual.stageId || '')) {
      throw new Error(`stage receipt is missing a valid stageId for ${expected.name}`)
    }
    if (requireComplete && actual.status !== 'staged') {
      throw new Error(`stage receipt is not complete for ${expected.name}; status=${actual.status}`)
    }
  }
  if (requireComplete && receipt.state !== 'awaiting-platform-confirmation') {
    throw new Error(`stage receipt state must be awaiting-platform-confirmation, got ${receipt.state}`)
  }
  if (!['staging', 'recovery-required', 'awaiting-platform-confirmation'].includes(receipt.state)) {
    throw new Error(`stage receipt state is invalid: ${receipt.state}`)
  }
  for (const [field, value] of [
    ['createdAt', receipt.createdAt], ['updatedAt', receipt.updatedAt],
    ['awaitingPlatformConfirmationAt', receipt.awaitingPlatformConfirmationAt],
  ]) {
    if (value !== undefined) canonicalTimestamp(value, `stage receipt ${field}`)
  }
  return receipt
}

export function validateStagePublishJson(parsed, item) {
  const value = parsed?.[item.name] || (parsed?.name === item.name ? parsed : null)
  if (!value || value.name !== item.name || value.version !== item.version) {
    throw new Error(`${item.name}: npm stage publish --json returned the wrong package identity`)
  }
  if (value.integrity !== item.integrity || value.shasum !== item.shasum) {
    throw new Error(`${item.name}: npm stage publish --json digest does not match the release BOM`)
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.stageId || '')) {
    throw new Error(`${item.name}: npm stage publish --json did not return a valid stageId`)
  }
  return value
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function exactObjectKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has an open or incomplete shape`)
  }
}

function validFinalizerRunIdentity(value, { runId, runAttempt }) {
  exactObjectKeys(value, ['workflow', 'event', 'runId', 'runAttempt'], 'npm finalization receipt finalizer run identity')
  if (value.workflow !== FINALIZER_WORKFLOW_PATH || value.event !== FINALIZER_WORKFLOW_EVENT) {
    throw new Error('npm finalization receipt finalizer workflow identity drifted')
  }
  if (value.runId !== String(runId) || String(value.runAttempt) !== String(runAttempt)) {
    throw new Error('npm finalization receipt belongs to a different finalizer run (replay forbidden)')
  }
}

export function validateFinalizationReceipt(receipt, context, {
  stageReceiptSha256,
  stageRunIdentity,
  stageRunExpected,
  finalizerRunId,
  finalizerRunAttempt,
  releaseTrustExpected,
  now = new Date(),
}) {
  if (receipt?.schemaVersion !== 3 || receipt.state !== 'certified') {
    throw new Error('npm finalization receipt is not a certified schema-3 record')
  }
  exactObjectKeys(receipt, [
    'schemaVersion', 'state', 'source', 'releaseTrust', 'releaseSetSha256', 'bomSha256', 'stageReceiptSha256',
    'stageRun', 'finalizerRun', 'stagingTag', 'targetTag', 'targetVersion', 'publishOrder',
    'stageIds', 'isolatedTags', 'targetTags', 'packages', 'certifiedAt', 'updatedAt',
  ], 'npm finalization receipt')
  validateReleaseTrustBinding(receipt.releaseTrust, context, releaseTrustExpected)
  exactObjectKeys(receipt.source, ['repository', 'tag', 'gitHead', 'gitTree'], 'npm finalization receipt source')
  validateStageRunIdentityDocument(stageRunIdentity, stageRunExpected, { now })
  if (stable(receipt.stageRun) !== stable(stageRunIdentity)) {
    throw new Error('npm finalization receipt stage run/artifact identity drifted')
  }
  if (receipt.releaseTrust.artifact.name !== stageRunIdentity.releaseTrustArtifact.name
    || receipt.releaseTrust.artifact.digest !== stageRunIdentity.releaseTrustArtifact.digest
    || receipt.releaseTrust.artifact.workflow.path !== stageRunIdentity.workflow.path
    || receipt.releaseTrust.artifact.workflow.event !== stageRunIdentity.workflow.event
    || receipt.releaseTrust.artifact.workflow.headBranch !== stageRunIdentity.workflow.headBranch
    || receipt.releaseTrust.artifact.workflow.headSha !== stageRunIdentity.workflow.headSha
    || receipt.releaseTrust.artifact.workflow.runId !== stageRunIdentity.workflow.runId
    || receipt.releaseTrust.artifact.workflow.runAttempt !== stageRunIdentity.workflow.runAttempt) {
    throw new Error('npm finalization receipt release trust artifact identity drifted from the original successful run')
  }
  validFinalizerRunIdentity(receipt.finalizerRun, { runId: finalizerRunId, runAttempt: finalizerRunAttempt })
  if (receipt.source?.repository !== context.identity.repository
    || receipt.source?.tag !== context.identity.tag
    || receipt.source?.gitHead !== context.identity.gitHead
    || receipt.source?.gitTree !== context.bom.source.gitTree) {
    throw new Error('npm finalization receipt source identity drifted')
  }
  if (receipt.releaseSetSha256 !== context.releaseSet.sha256
    || receipt.bomSha256 !== sha256File(context.bomPath)
    || receipt.stageReceiptSha256 !== stageReceiptSha256
    || receipt.stagingTag !== context.stagingTag
    || receipt.targetTag !== context.targetTag
    || receipt.targetVersion !== context.targetVersion
    || JSON.stringify(receipt.publishOrder) !== JSON.stringify(context.bom.publishOrder)) {
    throw new Error('npm finalization receipt is not bound to the exact release/stage plan')
  }
  const expectedTags = Object.fromEntries(context.ordered.map((item) => [item.name, item.version]))
  const packageNames = context.ordered.map((item) => item.name)
  exactObjectKeys(receipt.stageIds, packageNames, 'npm finalization receipt stage IDs')
  exactObjectKeys(receipt.isolatedTags, packageNames, 'npm finalization receipt isolated tags')
  exactObjectKeys(receipt.targetTags, packageNames, 'npm finalization receipt target tags')
  if (JSON.stringify(receipt.isolatedTags) !== JSON.stringify(expectedTags)
    || JSON.stringify(receipt.targetTags) !== JSON.stringify(expectedTags)) {
    throw new Error('npm finalization receipt does not certify both isolated and target tags')
  }
  if (!Array.isArray(receipt.packages) || receipt.packages.length !== context.ordered.length) {
    throw new Error('npm finalization receipt package set is incomplete')
  }
  for (let index = 0; index < context.ordered.length; index += 1) {
    const expected = context.ordered[index]
    const actual = receipt.packages[index]
    exactObjectKeys(actual, ['name', 'version', 'integrity', 'shasum'], `npm finalization receipt package ${index}`)
    for (const field of ['name', 'version', 'integrity', 'shasum']) {
      if (actual?.[field] !== expected[field]) throw new Error(`npm finalization receipt ${field} drift for ${expected.name}`)
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.stageIds?.[expected.name] || '')) {
      throw new Error(`npm finalization receipt is missing a stageId for ${expected.name}`)
    }
  }
  const certifiedAt = new Date(receipt.certifiedAt)
  const updatedAt = new Date(receipt.updatedAt)
  if (!Number.isFinite(certifiedAt.getTime()) || certifiedAt.toISOString() !== receipt.certifiedAt
    || !Number.isFinite(updatedAt.getTime()) || updatedAt.toISOString() !== receipt.updatedAt
    || updatedAt < certifiedAt) {
    throw new Error('npm finalization receipt timestamps are invalid')
  }
  return receipt
}

export function writeAtomicJson(path, value) {
  const directory = dirname(resolve(path))
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const temporary = join(directory, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  const descriptor = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(descriptor, JSON.stringify({ ...value, updatedAt: new Date().toISOString() }, null, 2) + '\n')
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  renameSync(temporary, resolve(path))
  let directoryDescriptor
  try {
    directoryDescriptor = openSync(directory, 'r')
    fsyncSync(directoryDescriptor)
  } catch {
    // Some non-POSIX filesystems do not allow fsync on a directory; the file itself is already durable.
  } finally {
    if (directoryDescriptor !== undefined) closeSync(directoryDescriptor)
  }
}

export function parseJsonOutput(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? 'unknown'}): ${(result.stderr || result.stdout || '').trim().slice(0, 2000)}`)
  }
  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error(`${label} returned invalid JSON: ${(result.stdout || '').trim().slice(0, 1000)}`)
  }
}
