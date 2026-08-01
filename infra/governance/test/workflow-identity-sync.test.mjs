import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  applyReviewedWorkflowIdentityProposal,
  buildWorkflowIdentityProposal,
  deriveWorkflowIdentitySources,
  parseWorkflowIdentityProposal,
  synchronizeWorkflowIdentities,
} from '../bin/sync-workflow-identities.mjs'
import { readJson, sha256, stableStringify } from '../lib/common.mjs'
import { workflowIdentity } from '../lib/workflow-trust.mjs'

const GOVERNANCE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(GOVERNANCE, '../..')
const DESIRED = readJson(resolve(GOVERNANCE, 'desired/github.json'))
const INVENTORY = readJson(resolve(GOVERNANCE, 'inventory/managed-repos.json'))
const REVISION = Object.freeze({ commitSha: '1'.repeat(40), treeSha: '2'.repeat(40) })
const MUTATED = Object.freeze([
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  '.github/workflows/external-ledger-writer.yml',
])

function workflowBindings(desired) {
  const output = []
  for (const [profile, value] of Object.entries(desired.profiles)) {
    for (const check of value.requiredChecks) if (check.workflow) output.push({ profile, path: check.workflow })
    for (const environment of value.environments) output.push({ profile, path: environment.workflow })
    if (value.tagPolicy.sourceWorkflow) output.push({ profile, path: value.tagPolicy.sourceWorkflow })
  }
  return output
}

function fixture(t, { mutate = true } = {}) {
  const container = realpathSync(mkdtempSync(resolve(tmpdir(), 'workflow-identity-')))
  const root = resolve(container, 'repo')
  const governanceRoot = resolve(root, 'infra/governance')
  const desiredPath = resolve(governanceRoot, 'desired/github.json')
  mkdirSync(resolve(governanceRoot, 'desired'), { recursive: true })
  mkdirSync(resolve(governanceRoot, 'runtime'), { recursive: true })
  execFileSync('/usr/bin/git', ['init', '-q'], { cwd: root })
  execFileSync('/usr/bin/git', ['remote', 'add', 'origin', 'git@github.com:ajenchen/design-system.git'], { cwd: root })
  t.after(() => rmSync(container, { recursive: true, force: true }))

  const repositories = new Map(INVENTORY.repositories.map(repository => [repository.id, repository]))
  const copied = new Set()
  for (const { profile, path } of workflowBindings(DESIRED)) {
    const repository = repositories.get(INVENTORY.workflowIdentitySources[profile].repositoryId)
    const sourceRoot = repository.id === 'design-system' ? ROOT : resolve(ROOT, 'template/ds-product-template')
    const targetRoot = repository.id === 'design-system' ? root : resolve(root, 'template/ds-product-template')
    const target = resolve(targetRoot, path)
    if (copied.has(target)) continue
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(resolve(sourceRoot, path), target)
    copied.add(target)
  }

  const sources = deriveWorkflowIdentitySources(INVENTORY, { governanceRoot, authorityRoot: root, desired: DESIRED })
  const baseline = synchronizeWorkflowIdentities(DESIRED, { sources, authorityRoot: root }).desired
  writeFileSync(desiredPath, `${stableStringify(baseline)}\n`)
  if (mutate) {
    for (const path of MUTATED) writeFileSync(resolve(root, path), `${readFileSync(resolve(root, path), 'utf8')}\n# reviewed proposal drift\n`)
  }
  return {
    root,
    governanceRoot,
    desiredPath,
    inventory: structuredClone(INVENTORY),
    desiredBytes: () => readFileSync(desiredPath),
    desired: () => JSON.parse(readFileSync(desiredPath, 'utf8')),
    sources: () => deriveWorkflowIdentitySources(INVENTORY, { governanceRoot, authorityRoot: root, desired: JSON.parse(readFileSync(desiredPath, 'utf8')) }),
  }
}

function build(fx) {
  return buildWorkflowIdentityProposal({
    desiredBytes: fx.desiredBytes(),
    inventory: fx.inventory,
    sourceRevision: REVISION,
    governanceRoot: fx.governanceRoot,
    authorityRoot: fx.root,
  })
}

test('three unique stale workflows fan out to exactly four authority bindings and every consumer source is still read once', t => {
  const fx = fixture(t)
  const counts = new Map()
  const result = synchronizeWorkflowIdentities(fx.desired(), {
    sources: fx.sources(),
    authorityRoot: fx.root,
    readWorkflow(path) {
      counts.set(path, (counts.get(path) ?? 0) + 1)
      return { text: readFileSync(path, 'utf8') }
    },
  })
  assert.equal(result.changes.length, 4)
  assert.equal(new Set(result.changes.map(change => change.sourceId)).size, 3)
  assert.equal(result.uniqueWorkflowCount, counts.size)
  assert.ok([...counts.values()].every(count => count === 1))

  const proposal = build(fx).proposal
  assert.equal(proposal.changes.length, 4)
  assert.equal(proposal.requiredChangedPaths.length, 4)
  assert.ok(proposal.changes.every(change => change.after.semanticVersion === 2))
  assert.equal(proposal.authorizationStatus, 'not-performed')
})

test('comment-only edits preserve V2 semantics but still require exact content/blob review', t => {
  const fx = fixture(t, { mutate: false })
  const before = workflowIdentity(readFileSync(resolve(fx.root, MUTATED[0]), 'utf8'))
  writeFileSync(resolve(fx.root, MUTATED[0]), `${readFileSync(resolve(fx.root, MUTATED[0]), 'utf8')}\n# comment only\n`)
  const after = workflowIdentity(readFileSync(resolve(fx.root, MUTATED[0]), 'utf8'))
  assert.equal(after.semanticSha256, before.semanticSha256)
  assert.notEqual(after.contentSha256, before.contentSha256)
  assert.notEqual(after.gitBlobSha, before.gitBlobSha)
  const result = synchronizeWorkflowIdentities(fx.desired(), { sources: fx.sources(), authorityRoot: fx.root })
  assert.ok(result.changes.some(change => change.workflow === MUTATED[0]))
})

test('proposal is canonical, digest-bound, closed, deterministic, and binds changedPaths', t => {
  const fx = fixture(t)
  const first = build(fx)
  const second = build(fx)
  assert.ok(first.proposalBytes.equals(second.proposalBytes))
  assert.deepEqual(parseWorkflowIdentityProposal(first.proposalBytes), first.proposal)

  const nonCanonical = Buffer.from(JSON.stringify(first.proposal), 'utf8')
  assert.throws(() => parseWorkflowIdentityProposal(nonCanonical), /not exact canonical JSON/)

  const open = structuredClone(first.proposal)
  open.unreviewed = true
  assert.throws(() => parseWorkflowIdentityProposal(Buffer.from(`${stableStringify(open)}\n`)), /schema validation failed/)

  const missingPath = structuredClone(first.proposal)
  missingPath.requiredChangedPaths.pop()
  const payload = structuredClone(missingPath)
  delete payload.proposalDigest
  missingPath.proposalDigest = sha256(stableStringify(payload, 0))
  assert.throws(() => parseWorkflowIdentityProposal(Buffer.from(`${stableStringify(missingPath)}\n`)), /changed-path closure/)
})

test('reviewed apply is atomic candidate preparation, explicitly not privileged authorization', t => {
  const fx = fixture(t)
  const built = build(fx)
  const result = applyReviewedWorkflowIdentityProposal({
    proposalBytes: built.proposalBytes,
    expectedProposalDigest: built.proposal.proposalDigest,
    inventory: fx.inventory,
    desiredPath: fx.desiredPath,
    governanceRoot: fx.governanceRoot,
    authorityRoot: fx.root,
    sourceRevision: REVISION,
  })
  assert.equal(result.applied, true)
  assert.equal(result.authorizationStatus, 'not-performed')
  assert.deepEqual(fx.desired(), built.proposal.desiredAfter)
})

test('digest acknowledgement, Git tree, desired CAS, proposal bytes, and authorization claims all fail closed without mutation', t => {
  const cases = [
    {
      name: 'acknowledgement',
      prepare() {},
      options(built) { return { expectedProposalDigest: 'f'.repeat(64) } },
      pattern: /acknowledgement does not match/,
    },
    {
      name: 'tree',
      prepare() {},
      options(built) { return { expectedProposalDigest: built.proposal.proposalDigest, sourceRevision: { ...REVISION, treeSha: '3'.repeat(40) } } },
      pattern: /commit\/tree changed/,
    },
    {
      name: 'desired CAS',
      prepare(fx) { writeFileSync(fx.desiredPath, `${readFileSync(fx.desiredPath, 'utf8')} `) },
      options(built) { return { expectedProposalDigest: built.proposal.proposalDigest } },
      pattern: /Desired-before CAS failed/,
    },
  ]
  for (const item of cases) {
    const fx = fixture(t)
    const built = build(fx)
    item.prepare(fx)
    const before = fx.desiredBytes()
    const overrides = item.options(built)
    assert.throws(() => applyReviewedWorkflowIdentityProposal({
      proposalBytes: built.proposalBytes,
      expectedProposalDigest: overrides.expectedProposalDigest,
      inventory: fx.inventory,
      desiredPath: fx.desiredPath,
      governanceRoot: fx.governanceRoot,
      authorityRoot: fx.root,
      sourceRevision: overrides.sourceRevision ?? REVISION,
    }), item.pattern, item.name)
    assert.ok(fx.desiredBytes().equals(before), item.name)
  }

  const fx = fixture(t)
  const built = build(fx)
  const forged = structuredClone(built.proposal)
  forged.authorizationStatus = 'authorized'
  assert.throws(() => parseWorkflowIdentityProposal(Buffer.from(`${stableStringify(forged)}\n`)), /schema validation failed/)
  assert.ok(fx.desiredBytes().equals(readFileSync(fx.desiredPath)))
})

test('a concurrent workflow change during the final read aborts before desired mutation', t => {
  const fx = fixture(t)
  const built = build(fx)
  const before = fx.desiredBytes()
  assert.throws(() => applyReviewedWorkflowIdentityProposal({
    proposalBytes: built.proposalBytes,
    expectedProposalDigest: built.proposal.proposalDigest,
    inventory: fx.inventory,
    desiredPath: fx.desiredPath,
    governanceRoot: fx.governanceRoot,
    authorityRoot: fx.root,
    sourceRevision: REVISION,
    beforeFinalRead() {
      writeFileSync(resolve(fx.root, MUTATED[0]), `${readFileSync(resolve(fx.root, MUTATED[0]), 'utf8')}\n# concurrent\n`)
    },
  }), /changed during final workflow read/)
  assert.ok(fx.desiredBytes().equals(before))
})

test('same physical workflow bindings must carry one identity and desired schema is validated before reads', t => {
  const fx = fixture(t, { mutate: false })
  const conflicting = fx.desired()
  conflicting.profiles['design-system-authority'].tagPolicy.sourceWorkflowIdentity.contentSha256 = 'f'.repeat(64)
  assert.throws(() => synchronizeWorkflowIdentities(conflicting, { sources: fx.sources(), authorityRoot: fx.root }), /conflicts with/)

  const open = fx.desired()
  open.unmodeled = true
  assert.throws(() => synchronizeWorkflowIdentities(open, { sources: fx.sources(), authorityRoot: fx.root }), /schema validation failed/)
})

test('inventory-driven source registry is closed and cannot redirect to WM or an unknown repository', t => {
  const fx = fixture(t, { mutate: false })
  const unknown = structuredClone(fx.inventory)
  unknown.workflowIdentitySources['product-consumer'].repositoryId = 'work-management-unknown'
  assert.throws(() => deriveWorkflowIdentitySources(unknown, { governanceRoot: fx.governanceRoot, authorityRoot: fx.root, desired: fx.desired() }), /must use repository ds-product-template/)

  const redirected = structuredClone(fx.inventory)
  redirected.workflowIdentitySources['product-consumer'].repositoryId = 'work-management'
  assert.throws(() => deriveWorkflowIdentitySources(redirected, { governanceRoot: fx.governanceRoot, authorityRoot: fx.root, desired: fx.desired() }), /must use repository ds-product-template/)

  const open = structuredClone(fx.inventory)
  open.workflowIdentitySources['product-consumer'].path = '../../../work-management'
  assert.throws(() => deriveWorkflowIdentitySources(open, { governanceRoot: fx.governanceRoot, authorityRoot: fx.root, desired: fx.desired() }), /closed repositoryId binding/)
})

for (const invalid of ['missing', 'symlink', 'nonregular', 'ancestor-redirection', 'invalid-yaml']) {
  test(`workflow source rejects ${invalid}`, t => {
    const fx = fixture(t, { mutate: false })
    const path = resolve(fx.root, MUTATED[0])
    if (invalid === 'missing') unlinkSync(path)
    if (invalid === 'symlink') {
      unlinkSync(path)
      symlinkSync(resolve(fx.root, '.github/workflows/ci.yml'), path)
    }
    if (invalid === 'nonregular') {
      unlinkSync(path)
      mkdirSync(path)
    }
    if (invalid === 'ancestor-redirection') {
      const workflows = resolve(fx.root, '.github/workflows')
      const real = resolve(fx.root, '.github/workflows-real')
      renameSync(workflows, real)
      symlinkSync(real, workflows)
    }
    if (invalid === 'invalid-yaml') writeFileSync(path, 'name: broken\non: [push]\njobs: [')
    assert.throws(() => synchronizeWorkflowIdentities(fx.desired(), { sources: fx.sources(), authorityRoot: fx.root }), /missing|symlink|ancestor is redirected|valid|YAML|mapping|object/i)
  })
}

test('bare --write is rejected before any authority bytes can change', () => {
  const desiredPath = resolve(GOVERNANCE, 'desired/github.json')
  const before = readFileSync(desiredPath)
  const result = spawnSync(process.execPath, ['--', resolve(GOVERNANCE, 'bin/sync-workflow-identities.mjs'), '--write'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Unknown option --write/)
  assert.ok(readFileSync(desiredPath).equals(before))
})
