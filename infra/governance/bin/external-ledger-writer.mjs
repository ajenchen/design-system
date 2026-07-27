#!/usr/bin/env node

import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  parseFlags,
  readJson,
  runClosedGit,
  sha256,
  stableStringify,
} from '../lib/common.mjs'
import {
  externalOperatorPaths,
  parseCanonicalExternalOperatorArtifact,
  readExternalOperatorArtifact,
} from '../lib/external-operator.mjs'
import {
  createExternalLedgerWriterDispatch,
  createExternalLedgerWriterPlan,
  createExternalLedgerRunArtifactIdentityReceipt,
  executeExternalLedgerWriterTransaction,
  parseExternalLedgerHandoffCommitMessage,
  resolveExternalLedgerRunArtifactIdentity,
  validateExternalLedgerWriterPlan,
} from '../lib/external-ledger-writer.mjs'
import { validateExternalActivationRequirements } from '../lib/external-activation.mjs'

const COMMANDS = new Set([
  'package-dispatch',
  'verify-dispatch',
  'verify-artifact',
  'verify-run-artifact',
  'verify-pr-head',
  'write-pr',
])
const ARTIFACT_FILES = Object.freeze(['dispatch.json', 'handoff.json', 'writer-plan.json'])
const GIT_OID = /^[a-f0-9]{40}$/
const SHA256 = /^[a-f0-9]{64}$/
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const MAX_JSON_BYTES = 8 * 1024 * 1024
const GITHUB_API_ORIGIN = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'
const WRITER_TOKEN_ENVIRONMENT = 'GOVERNANCE_WRITER_APP_TOKEN'
const UTF8 = new TextDecoder('utf-8', { fatal: true })

function usage() {
  return `Usage: node infra/governance/bin/external-ledger-writer.mjs <command> [options]

Local operator command (no network or Git mutation):
  package-dispatch --handoff <reviewed-runtime-handoff.json> --output <dispatch.json>

Protected-default, credential-free workflow commands:
  verify-dispatch --event <repository_dispatch-event.json> --repository <owner/repo>
    --head-sha <protected-main-sha> --output-dir <new-artifact-dir>
  verify-artifact --event <repository_dispatch-event.json> --repository <owner/repo>
    --head-sha <protected-main-sha> --artifact-dir <downloaded-artifact-dir>
  verify-run-artifact --repository <owner/repo> --head-sha <protected-main-sha>
    --run-id <id> --run-attempt <attempt> --artifact-id <id>
    --artifact-digest <sha256> --output <identity.json>
  verify-pr-head --trusted-root <protected-base-checkout>
    --candidate-root <untrusted-data-checkout> --repository <owner/repo>
    --base-sha <protected-base-sha> --base-ref <protected-default-branch>
    --head-sha <candidate-head-sha>
    --head-ref <deterministic-writer-branch> --head-repository <owner/repo>
    --pr-author <writer-bot-login> --pr-author-type Bot
    --pr-number <positive-integer> --pr-state open --pr-draft false
    --pr-title <deterministic-title> --pr-body <deterministic-body>
    --maintainer-can-modify false

Environment-gated Governance Writer App command:
  write-pr --repository <owner/repo> --head-sha <protected-main-sha>
    --artifact-dir <verified-artifact-dir> --run-id <id> --run-attempt <attempt>
    --artifact-id <id> --artifact-digest <sha256> --artifact-identity <identity.json>
    --token-env GOVERNANCE_WRITER_APP_TOKEN --app-id-env GOVERNANCE_WRITER_APP_ID
    --app-slug <slug> --installation-id <id> --action-sha <pinned-sha>
    --output <new-readback-receipt.json>

Only write-pr can call GitHub mutation endpoints. It may create one deterministic
one-parent branch and one draft=false pull request. It cannot update main, merge,
review, approve, or execute candidate code. The built-in Actions token, PATs, and
ambient gh credentials are rejected as writer authority.
`
}

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function gitOutput(args, { encoding = 'utf8' } = {}) {
  const result = runClosedGit(args, {
    cwd: externalOperatorPaths.repoRoot,
    maxOutputBytes: MAX_JSON_BYTES,
    output: encoding === 'utf8' ? 'capture' : 'buffer',
    timeoutMs: 10_000,
  })
  if (result.status !== 0) {
    const detail = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr
    throw new Error(`Protected Git read failed: ${String(detail || '').trim()}`)
  }
  return result.stdout
}

function gitAt(cwd, args, { encoding = 'utf8' } = {}) {
  const result = runClosedGit(args, {
    cwd,
    maxOutputBytes: MAX_JSON_BYTES,
    output: encoding === 'utf8' ? 'capture' : 'buffer',
    timeoutMs: 10_000,
  })
  if (result.status !== 0) {
    const detail = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr
    throw new Error(`Protected external-ledger PR Git read failed: ${String(detail || '').trim()}`)
  }
  return result.stdout
}

function resolveProtectedBase(expectedCommit, ledgerPath, expectedHeadSha = expectedCommit) {
  invariant(GIT_OID.test(expectedCommit ?? ''), 'Reviewed expected base commit must be a full SHA-1 object id')
  invariant(expectedHeadSha === expectedCommit, 'Workflow protected-default head differs from the reviewed expected base commit')
  invariant([
    'infra/governance/providers/certifications.json',
    'infra/governance/providers/review-capability-certifications.json',
    'infra/governance/external-activation-requirements.json',
  ].includes(ledgerPath), 'Reviewed ledger path is not an external-ledger authority')
  const root = String(gitOutput(['rev-parse', '--show-toplevel'])).trim()
  invariant(realpathSync(root) === realpathSync(externalOperatorPaths.repoRoot), 'Writer checkout is not the canonical repository root')
  const currentBaseCommit = String(gitOutput(['rev-parse', '--verify', 'HEAD'])).trim()
  invariant(currentBaseCommit === expectedCommit, 'Protected Git HEAD differs from the reviewed expected-old base commit')
  const currentBaseTree = String(gitOutput(['rev-parse', `${currentBaseCommit}^{tree}`])).trim()
  invariant(GIT_OID.test(currentBaseTree), 'Protected Git base tree is invalid')
  const ledgerBytes = Buffer.from(gitOutput(['show', `${currentBaseCommit}:${ledgerPath}`], { encoding: null }))
  let ledger
  try {
    ledger = JSON.parse(UTF8.decode(ledgerBytes))
  } catch (error) {
    throw new Error(`Protected Git base ledger is not UTF-8 JSON: ${error.message}`, { cause: error })
  }
  return {
    currentBaseCommit,
    currentBaseTree,
    baseLedgerSha256: sha256(stableStringify(ledger, 0)),
  }
}

function handoffLedgerPaths(handoff) {
  if (handoff?.operation === 'provider-review-capability-certification') {
    invariant(
      Array.isArray(handoff.ledgers)
        && handoff.ledgers.length === 2
        && handoff.ledgers[0].path === 'infra/governance/providers/certifications.json'
        && handoff.ledgers[1].path
          === 'infra/governance/providers/review-capability-certifications.json',
      'Reviewed provider review certification ledger set is invalid',
    )
    return handoff.ledgers.map(ledger => ledger.path)
  }
  return [handoff?.ledger?.path]
}

function resolveProtectedBaseForHandoff(
  expectedCommit,
  handoff,
  expectedHeadSha = expectedCommit,
) {
  const paths = handoffLedgerPaths(handoff)
  if (paths.length === 1) {
    return resolveProtectedBase(expectedCommit, paths[0], expectedHeadSha)
  }
  const first = resolveProtectedBase(expectedCommit, paths[0], expectedHeadSha)
  const baseLedgerSha256s = {
    [paths[0]]: first.baseLedgerSha256,
  }
  for (const path of paths.slice(1)) {
    baseLedgerSha256s[path] = resolveProtectedBase(
      expectedCommit,
      path,
      expectedHeadSha,
    ).baseLedgerSha256
  }
  return {
    currentBaseCommit: first.currentBaseCommit,
    currentBaseTree: first.currentBaseTree,
    baseLedgerSha256: null,
    baseLedgerSha256s,
  }
}

function canonicalBytes(value) {
  return Buffer.from(`${stableStringify(value)}\n`, 'utf8')
}

function readCanonical(path, label, options = {}) {
  const source = readExternalOperatorArtifact(path, { label, maxBytes: MAX_JSON_BYTES, ...options })
  const value = parseCanonicalExternalOperatorArtifact(source.bytes, label)
  invariant(canonicalBytes(value).equals(source.bytes), `${label} bytes are not canonical`)
  return { ...source, value }
}

function assertRealDirectory(path, label) {
  const info = lstatSync(path)
  invariant(info.isDirectory() && !info.isSymbolicLink(), `${label} must be a real directory`)
}

function createArtifactDirectory(path) {
  const target = resolve(path)
  const parent = resolve(dirname(target))
  invariant(existsSync(parent), 'Writer artifact output parent is missing')
  assertRealDirectory(parent, 'Writer artifact output parent')
  invariant(!existsSync(target), 'Writer artifact output directory already exists')
  mkdirSync(target, { mode: 0o700 })
  assertRealDirectory(target, 'Writer artifact output directory')
  return target
}

function writeNewCanonical(path, value) {
  const target = resolve(path)
  const parent = resolve(dirname(target))
  invariant(existsSync(parent), `Output parent is missing: ${parent}`)
  assertRealDirectory(parent, 'Output parent')
  invariant(basename(target) !== '.' && basename(target) !== '..' && !existsSync(target), `Output already exists: ${target}`)
  const bytes = canonicalBytes(value)
  invariant(bytes.length > 0 && bytes.length <= MAX_JSON_BYTES, 'Output is missing or oversized')
  let descriptor = null
  try {
    descriptor = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600)
    const opened = fstatSync(descriptor)
    invariant(opened.isFile() && opened.nlink === 1, 'Output is not a unique regular file')
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
  } finally {
    if (descriptor !== null) closeSync(descriptor)
  }
  const readback = readExternalOperatorArtifact(target, { label: 'Output readback', maxBytes: MAX_JSON_BYTES })
  invariant(readback.bytes.equals(bytes), 'Output readback differs from the committed bytes')
  return target
}

function readDispatchEvent(path, repository) {
  const source = readExternalOperatorArtifact(path, {
    label: 'External ledger repository_dispatch event',
    maxBytes: MAX_JSON_BYTES,
  })
  let event
  try {
    event = JSON.parse(UTF8.decode(source.bytes))
  } catch (error) {
    throw new Error(`External ledger repository_dispatch event is not UTF-8 JSON: ${error.message}`, { cause: error })
  }
  invariant(event?.action === 'external-ledger-write-request', 'External ledger workflow action is not allowlisted')
  invariant(event?.repository?.full_name === repository, 'External ledger workflow event targets another repository')
  invariant(event.client_payload && typeof event.client_payload === 'object' && !Array.isArray(event.client_payload),
    'External ledger workflow event client_payload is invalid')
  return { event_type: event.action, client_payload: event.client_payload }
}

function readArtifactDirectory(path) {
  const directory = resolve(path)
  invariant(existsSync(directory), 'External ledger artifact directory is missing')
  assertRealDirectory(directory, 'External ledger artifact directory')
  const files = readdirSync(directory).sort()
  invariant(JSON.stringify(files) === JSON.stringify([...ARTIFACT_FILES].sort()),
    'External ledger artifact directory has an open or incomplete file set')
  const dispatch = readCanonical(resolve(directory, 'dispatch.json'), 'External ledger artifact dispatch', { boundary: directory }).value
  const handoff = readCanonical(resolve(directory, 'handoff.json'), 'External ledger artifact handoff', { boundary: directory }).value
  const plan = readCanonical(resolve(directory, 'writer-plan.json'), 'External ledger artifact plan', { boundary: directory }).value
  return { directory, dispatch, handoff, plan }
}

function verifyArtifact({ artifactDir, request = null, repository, headSha, now }) {
  const artifact = readArtifactDirectory(artifactDir)
  invariant(artifact.handoff.repository?.github === repository, 'External ledger artifact handoff targets another repository')
  invariant(artifact.handoff.gitTransaction?.expectedBaseCommit === headSha,
    'External ledger artifact handoff does not bind the protected workflow head')
  const base = resolveProtectedBaseForHandoff(headSha, artifact.handoff, headSha)
  const expectedRequest = request ?? artifact.dispatch
  invariant(stableStringify(artifact.dispatch, 0) === stableStringify(expectedRequest, 0),
    'External ledger artifact dispatch differs from the protected workflow event')
  const validated = validateExternalLedgerWriterPlan(artifact.plan, {
    request: expectedRequest,
    repository,
    ...base,
    now,
  })
  invariant(stableStringify(validated.handoff, 0) === stableStringify(artifact.handoff, 0),
    'External ledger artifact handoff differs from the dispatch')
  return { ...artifact, ...validated, base }
}

function positiveInteger(value, label) {
  invariant(/^[1-9][0-9]*$/.test(String(value ?? '')), `${label} must be a positive integer`)
  return String(value)
}

function validateRepository(repository) {
  invariant(REPOSITORY.test(repository ?? ''), 'Repository must be owner/name')
  return repository
}

function githubTransport(token = null) {
  invariant(token === null || (typeof token === 'string' && token.length >= 20 && token.length <= 4096),
    'GitHub token is malformed')
  async function request(method, path, body = undefined, { allow404 = false } = {}) {
    invariant(['GET', 'POST'].includes(method), `GitHub API method is forbidden: ${method}`)
    invariant(typeof path === 'string'
      && (path.startsWith('/repos/') || path === '/installation/repositories?per_page=100')
      && !path.includes('://')
      && !path.includes('..'),
      'GitHub API path is outside the repository boundary')
    const url = new URL(path, GITHUB_API_ORIGIN)
    invariant(url.origin === GITHUB_API_ORIGIN && !url.username && !url.password, 'GitHub API origin changed')
    const response = await fetch(url, {
      method,
      redirect: 'error',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (allow404 && response.status === 404) return null
    const text = await response.text()
    invariant(text.length <= MAX_JSON_BYTES, 'GitHub API response is oversized')
    let value = null
    if (text) {
      try { value = JSON.parse(text) } catch (error) {
        throw new Error(`GitHub API response is not JSON: ${method} ${path}: ${error.message}`, { cause: error })
      }
    }
    invariant(response.ok, `GitHub API request failed: ${method} ${path}: ${response.status}:${value?.message ?? 'unknown'}`)
    return value
  }
  return {
    requestJson: (path, options = {}) => request('GET', path, undefined, options),
    requestMutation: (method, path, body) => request(method, path, body),
  }
}

function captureToken(environmentName, { writer = false } = {}) {
  invariant(/^[A-Z][A-Z0-9_]*$/.test(environmentName ?? ''), 'Token environment name is invalid')
  if (writer) invariant(environmentName === WRITER_TOKEN_ENVIRONMENT,
    `Writer authority must come only from ${WRITER_TOKEN_ENVIRONMENT}`)
  else throw new Error('Authenticated artifact identity readback is forbidden')
  if (writer) {
    invariant(process.env.GH_TOKEN === undefined && process.env.GITHUB_TOKEN === undefined,
      'Ambient gh or GITHUB_TOKEN credentials are forbidden in the Writer App mutation process')
    const suspicious = Object.keys(process.env).filter(name => /(?:^|_)(?:PAT|PERSONAL_ACCESS_TOKEN|ADMIN_TOKEN)(?:_|$)/i.test(name))
    invariant(suspicious.length === 0, 'PAT, personal access, and admin token channels are forbidden in the Writer App mutation process')
  }
  const token = process.env[environmentName]
  invariant(typeof token === 'string' && token.length > 0, `${environmentName} is missing`)
  delete process.env[environmentName]
  return token
}

function artifactBinding(flags) {
  const runId = positiveInteger(flags['run-id'], 'Run id')
  const runAttempt = positiveInteger(flags['run-attempt'], 'Run attempt')
  const id = positiveInteger(flags['artifact-id'], 'Artifact id')
  invariant(SHA256.test(flags['artifact-digest'] ?? ''), 'Artifact digest must be a lowercase SHA-256')
  return {
    runId,
    runAttempt,
    id,
    digest: flags['artifact-digest'],
    name: `external-ledger-${runId}-${runAttempt}`,
  }
}

function deriveWriterAuthority(handoff, now) {
  const desired = readJson(externalOperatorPaths.desired)
  const desiredAppId = desired?.integrations?.governanceWriterApp?.id
  invariant(Number.isSafeInteger(desiredAppId) && desiredAppId > 0,
    'Protected desired state has not pinned a positive Governance Writer App id')
  let requirement
  if (handoff.operation === 'external-activation'
    && handoff.reviewedProposal?.requirementId === 'resolve-governance-app-identities') {
    requirement = handoff.reviewedProposal.reviewedRequirement
  } else {
    const ledger = readJson(externalOperatorPaths.activationLedger)
    validateExternalActivationRequirements(ledger, {
      inventory: readJson(externalOperatorPaths.inventory),
      desired,
      rings: readJson(externalOperatorPaths.releaseRings),
      issuerRegistry: readJson(externalOperatorPaths.issuerRegistry),
      policy: readJson(externalOperatorPaths.activationPolicy),
      mutationBoundaryContract: readJson(externalOperatorPaths.mutationBoundaryContract),
      now,
    })
    const matches = ledger.requirements.filter(item => item.id === 'resolve-governance-app-identities')
    invariant(matches.length === 1, 'Protected base lacks a unique Governance App identity activation requirement')
    requirement = matches[0]
  }
  invariant(requirement?.status === 'activated'
    && SHA256.test(requirement?.evidence?.sha256 ?? ''),
  'Governance App identity activation is not signed/current in the reviewed carrier')
  const observedAt = new Date(requirement.observedAt)
  const expiresAt = new Date(requirement.expiresAt)
  invariant(Number.isFinite(observedAt.getTime())
    && observedAt.toISOString() === requirement.observedAt
    && Number.isFinite(expiresAt.getTime())
    && expiresAt.toISOString() === requirement.expiresAt
    && observedAt <= now
    && now < expiresAt,
  'Governance App identity activation observation is future-dated, expired, or non-canonical')
  const observed = requirement.evidence?.payload?.observedResource
  invariant(observed && Array.isArray(observed.installationTokenProbes),
    'Governance App identity activation lacks installation token probes')
  const matches = observed.installationTokenProbes.filter(probe => (
    probe.credentialRepository === handoff.repository.github
      && probe.environment === 'governance-external-ledger'
      && probe.integration === 'governanceWriterApp'
      && probe.targetRepository === handoff.repository.github
  ))
  invariant(matches.length === 1, 'Signed Governance App activation lacks the exact authority external-ledger route')
  const probe = matches[0]
  invariant(Number.isSafeInteger(probe.appId)
    && probe.appId === desiredAppId
    && Number.isSafeInteger(probe.installationId)
    && probe.installationId > 0
    && probe.tokenMinted === true
    && probe.installationRepositoryVerified === true
    && probe.capabilityProbeSucceeded === true
    && probe.repositorySelection === 'selected'
    && stableStringify(probe.permissions, 0) === stableStringify({
      contents: 'write',
      pullRequests: 'write',
      workflows: 'write',
    }, 0),
  'Signed Governance Writer App probe identity/capability differs from protected desired state')
  return {
    desiredAppId: String(desiredAppId),
    signedProbeAppId: String(probe.appId),
    signedProbeInstallationId: String(probe.installationId),
    signedActivationEvidenceSha256: requirement.evidence.sha256,
    signedActivationObservedAt: requirement.observedAt,
    signedActivationExpiresAt: requirement.expiresAt,
  }
}

function singleTrailingNewline(value) {
  return String(value).replace(/(?:\r?\n)+$/, '')
}

function verifyProtectedExternalLedgerPr({
  trustedRoot,
  candidateRoot,
  repository,
  baseSha,
  baseRef,
  headSha,
  headRef,
  headRepository,
  prAuthor,
  prAuthorType,
  prNumber,
  prState,
  prDraft,
  prTitle,
  prBody,
  maintainerCanModify,
  now,
  validationOptions = {},
}) {
  const trusted = realpathSync(resolve(trustedRoot))
  const candidate = realpathSync(resolve(candidateRoot))
  assertRealDirectory(trusted, 'Protected external-ledger base checkout')
  assertRealDirectory(candidate, 'Protected external-ledger candidate data checkout')
  invariant(GIT_OID.test(baseSha ?? '') && GIT_OID.test(headSha ?? '') && baseSha !== headSha,
    'Protected external-ledger PR base/head identity is invalid')
  invariant(String(gitAt(trusted, ['rev-parse', 'HEAD^{commit}'])).trim() === baseSha,
    'Protected external-ledger verifier checkout differs from the PR base')
  invariant(String(gitAt(candidate, ['rev-parse', 'HEAD^{commit}'])).trim() === headSha,
    'Protected external-ledger candidate checkout differs from the PR head')
  const parentLine = String(gitAt(candidate, ['rev-list', '--parents', '-n', '1', headSha])).trim().split(' ')
  invariant(parentLine.length === 2 && parentLine[0] === headSha && parentLine[1] === baseSha,
    'Protected external-ledger PR head is not an exact one-parent child of its protected base')
  const message = singleTrailingNewline(gitAt(candidate, ['show', '-s', '--format=%B', headSha]))
  const { handoff, carrier } = parseExternalLedgerHandoffCommitMessage(message)
  invariant(handoff.repository.github === repository
    && headRepository === repository
    && baseRef === handoff.repository.defaultBranch
    && handoff.gitTransaction.expectedBaseRef === `refs/heads/${baseRef}`
    && handoff.gitTransaction.expectedBaseCommit === baseSha
    && handoff.gitTransaction.expectedBaseTree === String(gitAt(trusted, ['rev-parse', `${baseSha}^{tree}`])).trim()
    && prAuthor === 'qijenchen-governance-writer[bot]'
    && prAuthorType === 'Bot'
    && /^[1-9][0-9]*$/.test(prNumber)
    && prState === 'open'
    && prDraft === 'false'
    && maintainerCanModify === 'false',
  'Protected external-ledger PR repository/base/tree/author/state identity is invalid')
  const baseLedgerSha256s = {}
  for (const path of handoffLedgerPaths(handoff)) {
    const ledgerBytes = Buffer.from(gitAt(
      trusted,
      ['show', `${baseSha}:${path}`],
      { encoding: null },
    ))
    let ledger
    try { ledger = JSON.parse(UTF8.decode(ledgerBytes)) } catch (error) {
      throw new Error(`Protected external-ledger base ledger is not UTF-8 JSON: ${error.message}`, { cause: error })
    }
    baseLedgerSha256s[path] = sha256(stableStringify(ledger, 0))
  }
  const multiLedger = handoff.operation === 'provider-review-capability-certification'
  const base = {
    currentBaseCommit: baseSha,
    currentBaseTree: handoff.gitTransaction.expectedBaseTree,
    baseLedgerSha256: multiLedger ? null : baseLedgerSha256s[handoff.ledger.path],
    baseLedgerSha256s: multiLedger ? baseLedgerSha256s : null,
  }
  const request = createExternalLedgerWriterDispatch({
    handoff,
    carrier,
    ...base,
    now,
    validationOptions,
  })
  const created = createExternalLedgerWriterPlan({
    request,
    repository,
    ...base,
    now,
    validationOptions,
  })
  invariant(created.plan.gitTransaction.branch === headRef,
    'Protected external-ledger PR branch is not deterministic')
  invariant(created.plan.commit.subject === message.split('\n', 1)[0]
    && created.plan.commit.handoffDigest === handoff.handoffDigest
    && created.commitMessage === message,
  'Protected external-ledger PR commit carrier is not canonical')
  invariant(created.plan.pullRequest.title === prTitle && created.pullRequestBody === prBody,
    'Protected external-ledger PR title or body is not deterministic')
  const metadata = String(gitAt(candidate, [
    'show',
    '-s',
    '--format=%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI',
    headSha,
  ])).trim().split('\0')
  invariant(metadata.length === 6
    && metadata[0] === created.plan.commit.author.name
    && metadata[1] === created.plan.commit.author.email
    && new Date(metadata[2]).toISOString() === created.plan.commit.author.date
    && metadata[3] === created.plan.commit.committer.name
    && metadata[4] === created.plan.commit.committer.email
    && new Date(metadata[5]).toISOString() === created.plan.commit.committer.date,
  'Protected external-ledger PR commit author/committer/time identity is invalid')
  const diff = Buffer.from(gitAt(candidate, [
    'diff-tree',
    '--no-commit-id',
    '--name-status',
    '--no-renames',
    '-r',
    '-z',
    headSha,
  ], { encoding: null })).toString('utf8').split('\0').filter(Boolean)
  invariant(diff.length === created.plan.changes.length * 2,
    'Protected external-ledger PR changes an unexpected number of paths')
  const observed = []
  for (let index = 0; index < diff.length; index += 2) {
    observed.push({ status: diff[index], path: diff[index + 1] })
  }
  invariant(stableStringify(observed.map(item => item.path), 0)
    === stableStringify(created.plan.changes.map(change => change.path), 0),
  'Protected external-ledger PR changed-path order/closure differs from the reviewed handoff')
  for (let index = 0; index < created.plan.changes.length; index += 1) {
    const change = created.plan.changes[index]
    const entry = observed[index]
    invariant(entry.status === (change.baseState === 'absent' ? 'A' : 'M'),
      `Protected external-ledger PR base state is invalid: ${change.path}`)
    const headEntry = String(gitAt(candidate, ['ls-tree', headSha, '--', change.path])).trim()
    invariant(headEntry === `${change.mode} ${change.type} ${change.gitBlobSha}\t${change.path}`,
      `Protected external-ledger PR mode/blob identity is invalid: ${change.path}`)
    const baseEntry = String(gitAt(trusted, ['ls-tree', baseSha, '--', change.path])).trim()
    if (change.baseState === 'absent') invariant(baseEntry === '',
      `Protected external-ledger PR evidence path already existed at base: ${change.path}`)
    else invariant(/^100644 blob [a-f0-9]{40}\t/.test(baseEntry)
      && !baseEntry.includes(change.gitBlobSha),
    `Protected external-ledger PR ledger base blob identity is invalid: ${change.path}`)
    const bytes = Buffer.from(gitAt(candidate, ['show', `${headSha}:${change.path}`], { encoding: null }))
    invariant(bytes.equals(created.changeBytes.get(change.path))
      && sha256(bytes) === change.bytesSha256,
    `Protected external-ledger PR file bytes differ from the reviewed handoff: ${change.path}`)
  }
  return {
    handoffDigest: handoff.handoffDigest,
    planDigest: created.plan.planDigest,
    operation: handoff.operation,
    changedPaths: created.plan.changes.map(change => change.path),
  }
}

export async function run(argv = process.argv.slice(2), {
  now = new Date(),
  clock = () => new Date(),
  protectedValidationOptions = {},
} = {}) {
  const flags = parseFlags(argv, {
    handoff: 'string',
    output: 'string',
    event: 'string',
    repository: 'string',
    'head-sha': 'string',
    'output-dir': 'string',
    'artifact-dir': 'string',
    'run-id': 'string',
    'run-attempt': 'string',
    'artifact-id': 'string',
    'artifact-digest': 'string',
    'artifact-identity': 'string',
    'token-env': 'string',
    'app-id-env': 'string',
    'app-slug': 'string',
    'installation-id': 'string',
    'action-sha': 'string',
    'trusted-root': 'string',
    'candidate-root': 'string',
    'base-sha': 'string',
    'base-ref': 'string',
    'head-ref': 'string',
    'head-repository': 'string',
    'pr-author': 'string',
    'pr-author-type': 'string',
    'pr-number': 'string',
    'pr-state': 'string',
    'pr-draft': 'string',
    'pr-title': 'string',
    'pr-body': 'string',
    'maintainer-can-modify': 'string',
    help: 'boolean',
  })
  if (flags.help) {
    process.stdout.write(usage())
    return 0
  }
  invariant(flags._.length === 1 && COMMANDS.has(flags._[0]), `Choose exactly one writer command.\n${usage()}`)
  const command = flags._[0]

  if (command === 'verify-pr-head') {
    for (const flag of [
      'trusted-root', 'candidate-root', 'repository', 'base-sha',
      'base-ref', 'head-sha', 'head-ref', 'head-repository', 'pr-author',
      'pr-author-type', 'pr-number', 'pr-state', 'pr-draft', 'pr-title',
      'pr-body', 'maintainer-can-modify',
    ]) invariant(flags[flag] !== undefined && flags[flag] !== '',
      `verify-pr-head requires --${flag}`)
    const result = verifyProtectedExternalLedgerPr({
      trustedRoot: flags['trusted-root'],
      candidateRoot: flags['candidate-root'],
      repository: validateRepository(flags.repository),
      baseSha: flags['base-sha'],
      baseRef: flags['base-ref'],
      headSha: flags['head-sha'],
      headRef: flags['head-ref'],
      headRepository: flags['head-repository'],
      prAuthor: flags['pr-author'],
      prAuthorType: flags['pr-author-type'],
      prNumber: flags['pr-number'],
      prState: flags['pr-state'],
      prDraft: flags['pr-draft'],
      prTitle: flags['pr-title'],
      prBody: flags['pr-body'],
      maintainerCanModify: flags['maintainer-can-modify'],
      now,
      validationOptions: protectedValidationOptions,
    })
    process.stdout.write(`${stableStringify({ ready: true, ...result })}\n`)
    return 0
  }

  if (command === 'package-dispatch') {
    invariant(flags.handoff && flags.output, 'package-dispatch requires --handoff and --output')
    const source = readCanonical(flags.handoff, 'Reviewed external ledger handoff', {
      boundary: externalOperatorPaths.runtimeDirectory,
    })
    const handoff = source.value
    const base = resolveProtectedBaseForHandoff(
      handoff.gitTransaction?.expectedBaseCommit,
      handoff,
    )
    const dispatch = createExternalLedgerWriterDispatch({ handoff, ...base, now })
    writeNewCanonical(flags.output, dispatch)
    process.stdout.write(`${stableStringify({
      ready: true,
      externalMutationPerformed: false,
      handoffDigest: handoff.handoffDigest,
      dispatchDigest: dispatch.client_payload.dispatchDigest,
      output: resolve(flags.output),
    })}\n`)
    return 0
  }

  const repository = validateRepository(flags.repository)
  invariant(GIT_OID.test(flags['head-sha'] ?? ''), `${command} requires a full --head-sha`)
  const headSha = flags['head-sha']

  if (command === 'verify-dispatch') {
    invariant(flags.event && flags['output-dir'], 'verify-dispatch requires --event and --output-dir')
    const request = readDispatchEvent(flags.event, repository)
    invariant(request.client_payload.expectedBaseCommit === headSha,
      'External ledger dispatch expected base differs from the protected workflow head')
    const compressedHandoff = request.client_payload.handoffGzipBase64
    invariant(typeof compressedHandoff === 'string', 'External ledger dispatch is missing its compressed handoff')
    const provisional = parseCanonicalExternalOperatorArtifact(
      gunzipSync(Buffer.from(compressedHandoff, 'base64'), { maxOutputLength: MAX_JSON_BYTES }),
      'External ledger dispatch handoff',
    )
    const base = resolveProtectedBaseForHandoff(headSha, provisional, headSha)
    const created = createExternalLedgerWriterPlan({ request, repository, ...base, now })
    const directory = createArtifactDirectory(flags['output-dir'])
    writeNewCanonical(resolve(directory, 'dispatch.json'), request)
    writeNewCanonical(resolve(directory, 'handoff.json'), created.handoff)
    writeNewCanonical(resolve(directory, 'writer-plan.json'), created.plan)
    verifyArtifact({ artifactDir: directory, request, repository, headSha, now })
    process.stdout.write(`${stableStringify({
      ready: true,
      externalMutationPerformed: false,
      handoffDigest: created.handoff.handoffDigest,
      planDigest: created.plan.planDigest,
      artifactDirectory: directory,
    })}\n`)
    return 0
  }

  if (command === 'verify-artifact') {
    invariant(flags.event && flags['artifact-dir'], 'verify-artifact requires --event and --artifact-dir')
    const request = readDispatchEvent(flags.event, repository)
    const verified = verifyArtifact({ artifactDir: flags['artifact-dir'], request, repository, headSha, now })
    process.stdout.write(`${stableStringify({
      ready: true,
      externalMutationPerformed: false,
      handoffDigest: verified.handoff.handoffDigest,
      planDigest: verified.plan.planDigest,
    })}\n`)
    return 0
  }

  if (command === 'verify-run-artifact') {
    const binding = artifactBinding(flags)
    invariant(flags.output, 'verify-run-artifact requires --output')
    invariant(!flags['token-env'], 'verify-run-artifact forbids token credentials')
    const transport = githubTransport()
    const identity = await resolveExternalLedgerRunArtifactIdentity({
      repository,
      headSha,
      runId: binding.runId,
      runAttempt: binding.runAttempt,
      artifactId: binding.id,
      artifactDigest: binding.digest,
      requestJson: transport.requestJson,
      now,
    })
    const receipt = createExternalLedgerRunArtifactIdentityReceipt(identity, { now })
    writeNewCanonical(flags.output, receipt)
    process.stdout.write(`${stableStringify({
      ready: true,
      externalMutationPerformed: false,
      artifact: identity.artifact,
      identityDigest: receipt.identityDigest,
      output: resolve(flags.output),
    })}\n`)
    return 0
  }

  invariant(command === 'write-pr', 'Unsupported writer command')
  invariant(flags['artifact-dir'] && flags.output && flags['token-env'] && flags['artifact-identity']
    && flags['app-id-env'] && flags['app-slug'] && flags['installation-id'] && flags['action-sha'],
  'write-pr requires artifact, artifact identity, exact Writer App identity, token environment, and output')
  const binding = artifactBinding(flags)
  const verified = verifyArtifact({ artifactDir: flags['artifact-dir'], repository, headSha, now })
  const artifactIdentity = readCanonical(
    flags['artifact-identity'],
    'Verified same-run external ledger artifact identity',
  ).value
  const writerAuthority = deriveWriterAuthority(verified.handoff, now)
  const token = captureToken(flags['token-env'], { writer: true })
  invariant(flags['app-id-env'] === 'GOVERNANCE_WRITER_APP_ID',
    'Writer App id must use the exact environment-gated GOVERNANCE_WRITER_APP_ID channel')
  const appId = process.env[flags['app-id-env']]
  invariant(/^[1-9][0-9]*$/.test(appId ?? ''), 'Governance Writer App id is missing or invalid')
  delete process.env[flags['app-id-env']]
  const transport = githubTransport(token)
  const receipt = await executeExternalLedgerWriterTransaction({
    plan: verified.plan,
    handoff: verified.handoff,
    dispatch: verified.dispatch,
    artifactIdentity,
    expectedArtifact: binding,
    writerIdentity: {
      appId,
      appSlug: flags['app-slug'],
      installationId: flags['installation-id'],
      actionSha: flags['action-sha'],
      ...writerAuthority,
    },
    requestJson: transport.requestJson,
    requestMutation: transport.requestMutation,
    clock,
  })
  writeNewCanonical(flags.output, receipt)
  process.stdout.write(`${stableStringify({
    ready: true,
    externalMutationPerformed: true,
    directDefaultBranchWritePerformed: false,
    mergePerformed: false,
    reviewPerformed: false,
    candidateCodeExecuted: false,
    pullRequest: receipt.pullRequest,
    receiptDigest: receipt.receiptDigest,
    output: resolve(flags.output),
  })}\n`)
  return 0
}

export const externalLedgerWriterCliTestHarness = Object.freeze({
  captureWriterToken: environmentName => captureToken(environmentName, { writer: true }),
})

const entry = process.argv[1] ? resolve(process.argv[1]) : ''
if (entry && entry === fileURLToPath(import.meta.url)) {
  run().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
