#!/usr/bin/env node

import { randomBytes } from 'node:crypto'
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  compareUtf8Bytes,
  deepEqual,
  invariant,
  normalizeRepoPath,
  parseFlags,
  readJson,
  runClosedGit,
  sha256,
  stableStringify,
  validateInventory,
} from '../lib/common.mjs'
import { verifyInventoryRepositoryIdentity } from '../lib/repository-path-topology.mjs'
import { workflowIdentity } from '../lib/workflow-trust.mjs'

const GOVERNANCE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(GOVERNANCE, '../..')
const DEFAULT_DESIRED = resolve(GOVERNANCE, 'desired/github.json')
const DEFAULT_INVENTORY = resolve(GOVERNANCE, 'inventory/managed-repos.json')
const RUNTIME_ROOT = resolve(GOVERNANCE, 'runtime')
const DESIRED_REPO_PATH = 'infra/governance/desired/github.json'
const PROPOSAL_SCHEMA_REF = '../schemas/workflow-identity-proposal.schema.json'
const SHA1 = /^[a-f0-9]{40}$/
const UTF8 = new TextDecoder('utf-8', { fatal: true })

const desiredSchema = readJson(resolve(GOVERNANCE, 'schemas/github-desired.schema.json'))
const proposalSchema = readJson(resolve(GOVERNANCE, 'schemas/workflow-identity-proposal.schema.json'))
// The canonical desired schema uses conditional `required` clauses whose properties
// are declared by the enclosing definition. Keep every other strict check enabled.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false })
ajv.addSchema(desiredSchema)
const validateDesiredSchema = ajv.getSchema(desiredSchema.$id)
const validateProposalSchema = ajv.compile(proposalSchema)

function validationMessage(label, validate) {
  return `${label} schema validation failed: ${ajv.errorsText(validate.errors, { separator: '; ' })}`
}

function isWithin(parent, child) {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !path.startsWith(sep))
}

function assertSafeDirectory(path, boundary, label) {
  invariant(isWithin(boundary, path), `${label} escapes the authority repository`)
  const boundaryStat = lstatSync(boundary)
  invariant(boundaryStat.isDirectory() && !boundaryStat.isSymbolicLink(), `${label} authority boundary must be a real directory`)
  let current = boundary
  const suffix = relative(boundary, path)
  for (const segment of suffix === '' ? [] : suffix.split(sep)) {
    invariant(segment && segment !== '.' && segment !== '..', `${label} contains an unsafe path segment`)
    current = resolve(current, segment)
    const stat = lstatSync(current)
    invariant(stat.isDirectory() && !stat.isSymbolicLink(), `${label} ancestor is redirected or is not a directory: ${current}`)
  }
}

function normalizeWorkflowPath(path) {
  invariant(typeof path === 'string' && /^\.github\/workflows\/.+\.ya?ml$/.test(path), `Invalid workflow path: ${String(path)}`)
  const segments = path.split('/')
  invariant(segments.every(segment => segment && segment !== '.' && segment !== '..'), `Workflow path contains redirection: ${path}`)
  invariant(normalizeRepoPath(path) === path, `Workflow path is not normalized: ${path}`)
  return path
}

function readRegularFile(path, boundary, label) {
  invariant(isWithin(boundary, path), `${label} escapes its source root`)
  assertSafeDirectory(dirname(path), boundary, `${label} parent`)
  invariant(existsSync(path), `${label} is missing: ${path}`)
  const before = lstatSync(path)
  invariant(before.isFile() && !before.isSymbolicLink(), `${label} must be a non-symlink regular file: ${path}`)
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const opened = fstatSync(descriptor)
    invariant(opened.isFile() && opened.dev === before.dev && opened.ino === before.ino, `${label} changed while it was opened: ${path}`)
    const bytes = readFileSync(descriptor)
    const after = fstatSync(descriptor)
    invariant(after.dev === opened.dev && after.ino === opened.ino && after.size === bytes.length && after.mtimeMs === opened.mtimeMs, `${label} changed while it was read: ${path}`)
    return { bytes, text: UTF8.decode(bytes), stat: before }
  } finally {
    closeSync(descriptor)
  }
}

export function deriveWorkflowIdentitySources(inventory, {
  governanceRoot = GOVERNANCE,
  authorityRoot = resolve(governanceRoot, '../..'),
  desired = null,
  identityVerifier = verifyInventoryRepositoryIdentity,
} = {}) {
  validateInventory(inventory)
  invariant(inventory.workflowIdentitySources && typeof inventory.workflowIdentitySources === 'object' && !Array.isArray(inventory.workflowIdentitySources), 'Inventory must define workflowIdentitySources')
  const repositories = new Map(inventory.repositories.map(repository => [repository.id, repository]))
  const verifiedRepositories = new Map()
  const canonicalAuthorityRoot = realpathSync(resolve(authorityRoot))
  const sourceProfiles = Object.keys(inventory.workflowIdentitySources).sort()
  if (desired) {
    const desiredProfiles = Object.keys(desired.profiles ?? {}).sort()
    invariant(deepEqual(sourceProfiles, desiredProfiles), `workflowIdentitySources profile closure differs from desired profiles: sources=${sourceProfiles.join(',')} desired=${desiredProfiles.join(',')}`)
  }
  return Object.fromEntries(sourceProfiles.map(profile => {
    const registration = inventory.workflowIdentitySources[profile]
    invariant(registration && Object.keys(registration).sort().join(',') === 'repositoryId', `Workflow identity source ${profile} has an open or invalid shape`)
    const repository = repositories.get(registration.repositoryId)
    invariant(repository, `Workflow identity source ${profile} references unknown repository ${registration.repositoryId}`)
    if (!verifiedRepositories.has(repository.id)) {
      verifiedRepositories.set(repository.id, identityVerifier({
        inventory,
        repositoryId: repository.id,
        governanceRoot,
      }))
    }
    const root = verifiedRepositories.get(repository.id).sourceRoot
    assertSafeDirectory(root, canonicalAuthorityRoot, `Workflow identity source ${profile}`)
    return [profile, { profile, repositoryId: repository.id, root }]
  }))
}

function closedV2Identity(observed) {
  return {
    contentSha256: observed.contentSha256,
    gitBlobSha: observed.gitBlobSha,
    semanticSha256: observed.semanticSha256,
    semanticVersion: 2,
  }
}

function expectedMatchesObserved(expected, observed) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) return false
  if (expected.contentSha256 !== observed.contentSha256 || expected.gitBlobSha !== observed.gitBlobSha) return false
  const version = expected.semanticVersion ?? 1
  return version === 1
    ? expected.semanticSha256 === observed.legacySemanticSha256
    : version === 2 && expected.semanticSha256 === observed.semanticSha256
}

function escapePointer(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function candidatePathFor(root, workflow, authorityRoot) {
  const absolute = resolve(root, workflow)
  invariant(isWithin(authorityRoot, absolute), `Workflow source is outside the authority candidate tree: ${absolute}`)
  return normalizeRepoPath(relative(authorityRoot, absolute))
}

function validateDesiredModel(desired, sources) {
  invariant(validateDesiredSchema(desired), validationMessage('Desired GitHub state', validateDesiredSchema))
  const profiles = Object.keys(desired.profiles).sort()
  invariant(deepEqual(profiles, Object.keys(sources).sort()), 'Desired profiles and workflow source registry must have the same closed key set')
  const identitiesByPhysicalPath = new Map()
  const bind = (profileName, workflow, identity, label) => {
    normalizeWorkflowPath(workflow)
    const source = sources[profileName]
    const key = resolve(source.root, workflow)
    if (identitiesByPhysicalPath.has(key)) {
      invariant(deepEqual(identitiesByPhysicalPath.get(key).identity, identity), `${label} conflicts with ${identitiesByPhysicalPath.get(key).label} for the same workflow source ${key}`)
    } else {
      identitiesByPhysicalPath.set(key, { identity, label })
    }
  }
  for (const [profileName, profile] of Object.entries(desired.profiles)) {
    profile.requiredChecks.forEach((check, index) => {
      if (check.workflow) bind(profileName, check.workflow, check.workflowIdentity, `${profileName} requiredChecks[${index}]`)
    })
    profile.environments.forEach((environment, index) => bind(profileName, environment.workflow, environment.workflowIdentity, `${profileName} environments[${index}]`))
    if (profile.tagPolicy.sourceWorkflow) bind(profileName, profile.tagPolicy.sourceWorkflow, profile.tagPolicy.sourceWorkflowIdentity, `${profileName} tagPolicy`)
  }
  return true
}

export function synchronizeWorkflowIdentities(desired, {
  sources,
  authorityRoot = ROOT,
  readWorkflow = readRegularFile,
} = {}) {
  invariant(sources && typeof sources === 'object', 'Workflow identity sources are required')
  validateDesiredModel(desired, sources)
  const updated = structuredClone(desired)
  const changes = []
  const cache = new Map()
  const sourceConsumers = new Map()

  const bind = ({ profileName, holder, field, label, binding }) => {
    if (!holder?.[field]) return
    const workflow = normalizeWorkflowPath(holder[field])
    const source = sources[profileName]
    const absolute = resolve(source.root, workflow)
    const cacheKey = absolute
    if (!cache.has(cacheKey)) {
      const { text } = readWorkflow(absolute, source.root, `Workflow ${profileName}:${workflow}`)
      const observed = workflowIdentity(text)
      const sourceId = sha256(`${source.repositoryId}\0${workflow}`)
      cache.set(cacheKey, {
        absolute,
        candidatePath: candidatePathFor(source.root, workflow, authorityRoot),
        identity: closedV2Identity(observed),
        observed,
        path: workflow,
        repositoryId: source.repositoryId,
        sourceId,
      })
    }
    const cached = cache.get(cacheKey)
    invariant(cached.repositoryId === source.repositoryId && cached.path === workflow, `Ambiguous workflow source identity for ${absolute}`)
    if (!sourceConsumers.has(cached.sourceId)) sourceConsumers.set(cached.sourceId, new Set())
    sourceConsumers.get(cached.sourceId).add(profileName)
    const identityField = `${field}Identity`
    const before = holder[identityField] ?? null
    if (!expectedMatchesObserved(before, cached.observed)) {
      const after = cached.identity
      changes.push({ profile: profileName, binding, label, sourceId: cached.sourceId, workflow, before, after })
      holder[identityField] = after
    }
  }

  for (const [profileName, profile] of Object.entries(updated.profiles).sort(([left], [right]) => compareUtf8Bytes(left, right))) {
    profile.requiredChecks.forEach((check, index) => bind({
      profileName,
      holder: check,
      field: 'workflow',
      label: `required check ${check.context}`,
      binding: `/profiles/${escapePointer(profileName)}/requiredChecks/${index}/workflowIdentity`,
    }))
    profile.environments.forEach((environment, index) => bind({
      profileName,
      holder: environment,
      field: 'workflow',
      label: `environment ${environment.name}`,
      binding: `/profiles/${escapePointer(profileName)}/environments/${index}/workflowIdentity`,
    }))
    if (profile.tagPolicy.sourceWorkflow) bind({
      profileName,
      holder: profile.tagPolicy,
      field: 'sourceWorkflow',
      label: 'release tag source',
      binding: `/profiles/${escapePointer(profileName)}/tagPolicy/sourceWorkflowIdentity`,
    })
  }

  const workflowSources = [...cache.values()].map(source => ({
    sourceId: source.sourceId,
    repositoryId: source.repositoryId,
    profiles: [...sourceConsumers.get(source.sourceId)].sort(),
    path: source.path,
    candidatePath: source.candidatePath,
    identity: source.identity,
  })).sort((left, right) => compareUtf8Bytes(left.sourceId, right.sourceId))
  changes.sort((left, right) => compareUtf8Bytes(left.binding, right.binding))
  validateDesiredModel(updated, sources)
  return { desired: updated, changes, workflowSources, uniqueWorkflowCount: cache.size }
}

export function readSourceRevision(root = ROOT) {
  const result = runClosedGit(['rev-parse', 'HEAD', 'HEAD^{tree}'], {
    cwd: resolve(root),
    timeoutMs: 5000,
  })
  invariant(!result.error && result.signal === null && result.status === 0, 'Git source revision is unavailable through the closed Git runtime')
  const [commitSha, treeSha, ...extra] = result.stdout.trim().split(/\r?\n/)
  invariant(extra.length === 0, 'Git source revision returned an open output shape')
  invariant(SHA1.test(commitSha) && SHA1.test(treeSha), 'Git source revision must use 40-character object IDs')
  return { commitSha, treeSha }
}

function proposalPayload(proposal) {
  const payload = structuredClone(proposal)
  delete payload.proposalDigest
  return payload
}

function assertProposalClosure(proposal) {
  invariant(validateProposalSchema(proposal), validationMessage('Workflow identity proposal', validateProposalSchema))
  invariant(proposal.proposalDigest === sha256(stableStringify(proposalPayload(proposal), 0)), 'Workflow identity proposal digest does not match its canonical payload')
  const afterBytes = `${stableStringify(proposal.desiredAfter)}\n`
  invariant(proposal.desired.afterSha256 === sha256(afterBytes), 'Workflow identity proposal desired-after digest is invalid')
  const sources = new Map()
  for (const source of proposal.workflowSources) {
    invariant(!sources.has(source.sourceId), `Duplicate workflow sourceId ${source.sourceId}`)
    invariant(source.sourceId === sha256(`${source.repositoryId}\0${source.path}`), `Workflow sourceId does not bind ${source.repositoryId}:${source.path}`)
    sources.set(source.sourceId, source)
  }
  const changedSourceIds = new Set()
  for (const change of proposal.changes) {
    const source = sources.get(change.sourceId)
    invariant(source, `Proposal change references unknown workflow source ${change.sourceId}`)
    invariant(change.workflow === source.path && deepEqual(change.after, source.identity), `Proposal change ${change.binding} is inconsistent with its workflow source`)
    changedSourceIds.add(change.sourceId)
  }
  const required = [DESIRED_REPO_PATH, ...[...changedSourceIds].map(id => sources.get(id).candidatePath)].sort()
  invariant(deepEqual(proposal.requiredChangedPaths, [...new Set(required)].sort()), 'Workflow identity proposal changed-path closure is incomplete or open')
  return true
}

export function buildWorkflowIdentityProposal({
  desiredBytes,
  inventory,
  sourceRevision,
  governanceRoot = GOVERNANCE,
  authorityRoot = resolve(governanceRoot, '../..'),
  readWorkflow = readRegularFile,
} = {}) {
  invariant(Buffer.isBuffer(desiredBytes), 'Exact desired-before bytes are required')
  invariant(SHA1.test(sourceRevision?.commitSha ?? '') && SHA1.test(sourceRevision?.treeSha ?? ''), 'A closed Git source commit/tree revision is required')
  let desired
  try { desired = JSON.parse(UTF8.decode(desiredBytes)) } catch (error) { throw new Error(`Desired GitHub state is not valid UTF-8 JSON: ${error.message}`, { cause: error }) }
  const sources = deriveWorkflowIdentitySources(inventory, { governanceRoot, authorityRoot, desired })
  const synchronized = synchronizeWorkflowIdentities(desired, { sources, authorityRoot, readWorkflow })
  invariant(synchronized.changes.length > 0, 'Workflow identities are already synchronized; no proposal is needed')
  const desiredAfterBytes = Buffer.from(`${stableStringify(synchronized.desired)}\n`, 'utf8')
  const changedSourceIds = new Set(synchronized.changes.map(change => change.sourceId))
  const candidatePaths = synchronized.workflowSources.filter(source => changedSourceIds.has(source.sourceId)).map(source => source.candidatePath)
  const payload = {
    $schema: PROPOSAL_SCHEMA_REF,
    schemaVersion: 1,
    kind: 'workflow-identity-review-proposal',
    applicationMode: 'local-candidate-preparation-only',
    authorizationStatus: 'not-performed',
    authority: inventory.authority,
    sourceRevision: structuredClone(sourceRevision),
    desired: {
      path: DESIRED_REPO_PATH,
      beforeSha256: sha256(desiredBytes),
      afterSha256: sha256(desiredAfterBytes),
    },
    workflowSources: synchronized.workflowSources,
    changes: synchronized.changes,
    requiredChangedPaths: [...new Set([DESIRED_REPO_PATH, ...candidatePaths])].sort(),
    desiredAfter: synchronized.desired,
  }
  const proposal = { ...payload, proposalDigest: sha256(stableStringify(payload, 0)) }
  assertProposalClosure(proposal)
  return {
    proposal,
    proposalBytes: Buffer.from(`${stableStringify(proposal)}\n`, 'utf8'),
    desiredAfterBytes,
    synchronization: synchronized,
  }
}

export function parseWorkflowIdentityProposal(bytes) {
  invariant(Buffer.isBuffer(bytes), 'Proposal bytes are required')
  let proposal
  try { proposal = JSON.parse(UTF8.decode(bytes)) } catch (error) { throw new Error(`Workflow identity proposal is not valid UTF-8 JSON: ${error.message}`, { cause: error }) }
  const canonical = Buffer.from(`${stableStringify(proposal)}\n`, 'utf8')
  invariant(bytes.equals(canonical), 'Workflow identity proposal bytes are not exact canonical JSON')
  assertProposalClosure(proposal)
  return proposal
}

function atomicReplace(path, bytes, mode) {
  const temporary = resolve(dirname(path), `.${path.split(sep).at(-1)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`)
  let descriptor = null
  try {
    descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), mode)
    writeFileSync(descriptor, bytes)
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = null
    renameSync(temporary, path)
    const directory = openSync(dirname(path), constants.O_RDONLY)
    try { fsyncSync(directory) } finally { closeSync(directory) }
  } finally {
    if (descriptor !== null) closeSync(descriptor)
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

export function applyReviewedWorkflowIdentityProposal({
  proposalBytes,
  expectedProposalDigest,
  inventory,
  desiredPath = DEFAULT_DESIRED,
  governanceRoot = GOVERNANCE,
  authorityRoot = resolve(governanceRoot, '../..'),
  sourceRevision = readSourceRevision(authorityRoot),
  readWorkflow = readRegularFile,
  beforeFinalRead = null,
} = {}) {
  const proposal = parseWorkflowIdentityProposal(proposalBytes)
  invariant(expectedProposalDigest === proposal.proposalDigest, 'Explicit reviewed proposal digest acknowledgement does not match')
  invariant(proposal.applicationMode === 'local-candidate-preparation-only' && proposal.authorizationStatus === 'not-performed', 'Proposal must not claim privileged authorization')
  invariant(deepEqual(sourceRevision, proposal.sourceRevision), 'Git source commit/tree changed after proposal review')
  invariant(resolve(desiredPath) === resolve(governanceRoot, 'desired/github.json'), 'Reviewed apply may only target the canonical desired GitHub state')

  const lockPath = resolve(dirname(desiredPath), `.${desiredPath.split(sep).at(-1)}.workflow-identity.lock`)
  const lock = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600)
  try {
    const firstDesired = readRegularFile(desiredPath, authorityRoot, 'Desired GitHub state')
    invariant(sha256(firstDesired.bytes) === proposal.desired.beforeSha256, 'Desired-before CAS failed')
    const first = buildWorkflowIdentityProposal({ desiredBytes: firstDesired.bytes, inventory, sourceRevision, governanceRoot, authorityRoot, readWorkflow })
    invariant(first.proposalBytes.equals(proposalBytes), 'Reviewed proposal no longer matches all workflow sources and desired state')

    if (beforeFinalRead) beforeFinalRead()

    const finalDesired = readRegularFile(desiredPath, authorityRoot, 'Desired GitHub state')
    invariant(sha256(finalDesired.bytes) === proposal.desired.beforeSha256, 'Desired-before CAS failed during final read')
    const final = buildWorkflowIdentityProposal({ desiredBytes: finalDesired.bytes, inventory, sourceRevision, governanceRoot, authorityRoot, readWorkflow })
    invariant(final.proposalBytes.equals(proposalBytes), 'Reviewed proposal changed during final workflow read')
    invariant(final.desiredAfterBytes.equals(Buffer.from(`${stableStringify(proposal.desiredAfter)}\n`, 'utf8')), 'Desired-after bytes differ from the reviewed proposal')
    atomicReplace(desiredPath, final.desiredAfterBytes, finalDesired.stat.mode & 0o777)
    const written = readRegularFile(desiredPath, authorityRoot, 'Applied desired GitHub state')
    invariant(written.bytes.equals(final.desiredAfterBytes), 'Atomic desired-state readback failed')
    return {
      applied: true,
      authorizationStatus: 'not-performed',
      proposalDigest: proposal.proposalDigest,
      changedBindings: proposal.changes.length,
      changedWorkflowSources: proposal.requiredChangedPaths.length - 1,
    }
  } finally {
    closeSync(lock)
    if (existsSync(lockPath)) unlinkSync(lockPath)
  }
}

function writeRuntimeProposal(outputPath, bytes) {
  const path = resolve(outputPath)
  invariant(isWithin(RUNTIME_ROOT, path) && path !== RUNTIME_ROOT, 'Proposal output must remain under infra/governance/runtime')
  assertSafeDirectory(dirname(path), RUNTIME_ROOT, 'Proposal output directory')
  atomicReplace(path, bytes, 0o600)
}

function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv, {
    check: 'boolean',
    propose: 'boolean',
    'apply-reviewed-proposal': 'boolean',
    output: 'string',
    proposal: 'string',
    'expected-proposal-digest': 'string',
  })
  invariant(flags._.length === 0, `Unexpected positional argument: ${flags._[0]}`)
  const modes = ['check', 'propose', 'apply-reviewed-proposal'].filter(mode => flags[mode])
  invariant(modes.length === 1, 'Choose exactly one of --check, --propose, or --apply-reviewed-proposal')
  const inventory = readJson(DEFAULT_INVENTORY)

  if (flags['apply-reviewed-proposal']) {
    invariant(flags.proposal && flags['expected-proposal-digest'], '--apply-reviewed-proposal requires --proposal and --expected-proposal-digest')
    invariant(!flags.output, '--output is only valid with --propose')
    const proposalPath = resolve(flags.proposal)
    invariant(isWithin(RUNTIME_ROOT, proposalPath) && proposalPath !== RUNTIME_ROOT, 'Reviewed proposal must be a regular file under infra/governance/runtime')
    const proposalRead = readRegularFile(proposalPath, RUNTIME_ROOT, 'Workflow identity proposal')
    const result = applyReviewedWorkflowIdentityProposal({
      proposalBytes: proposalRead.bytes,
      expectedProposalDigest: flags['expected-proposal-digest'],
      inventory,
    })
    console.log(`prepared local candidate from ${result.changedBindings} reviewed binding(s); privileged authorization was not performed`)
    return
  }

  invariant(!flags.proposal && !flags['expected-proposal-digest'], '--proposal and --expected-proposal-digest are only valid with --apply-reviewed-proposal')
  const desiredRead = readRegularFile(DEFAULT_DESIRED, ROOT, 'Desired GitHub state')
  const sourceRevision = readSourceRevision(ROOT)
  const desired = JSON.parse(desiredRead.text)
  const sources = deriveWorkflowIdentitySources(inventory, { desired })
  const result = synchronizeWorkflowIdentities(desired, { sources })
  if (result.changes.length === 0) {
    invariant(!flags.output, '--output is unnecessary because workflow identities are synchronized')
    console.log('workflow identities are synchronized')
    return
  }
  if (flags.check) {
    invariant(!flags.output, '--output is only valid with --propose')
    for (const change of result.changes) console.error(`${change.profile}: ${change.label} (${change.workflow}) is stale`)
    throw new Error(`reviewed workflow identity drift: ${result.changes.length} binding(s) across ${new Set(result.changes.map(change => change.sourceId)).size} unique workflow source(s); inspect --propose`)
  }
  const built = buildWorkflowIdentityProposal({ desiredBytes: desiredRead.bytes, inventory, sourceRevision })
  if (flags.output) {
    writeRuntimeProposal(flags.output, built.proposalBytes)
    console.log(`wrote review-only proposal ${built.proposal.proposalDigest} to ${resolve(flags.output)}; no authority state was changed`)
  } else {
    process.stdout.write(built.proposalBytes)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
