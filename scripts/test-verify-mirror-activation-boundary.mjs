#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  appendFileSync,
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { assertExternalActivationReady } from '../infra/governance/lib/external-activation.mjs'
import {
  deriveGithubMutationBoundaryDesiredBindings,
  sha256,
  stableJson,
  validateGithubMutationBoundaryContract,
} from './lib/github-mutation-boundary.mjs'
import {
  DEFAULT_ACTIVATION_VALIDATOR,
  EMPTY_BYPASS_ACTORS_DIGEST,
  assertMirrorActivationBoundaryProofAgainstRelease,
  buildMirrorActivationBoundaryProof,
  parseMirrorActivationBoundaryCli,
  validateMirrorActivationBoundaryProof,
  verifyMirrorActivationBoundary,
  writeMirrorActivationBoundaryProof,
} from './verify-mirror-activation-boundary.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')
const NOW = new Date('2030-01-02T00:00:00.000Z')
const SOURCE = 'ajenchen/design-system'
const TARGET = 'ajenchen/ds-product-template'
const POLICY_PATH = 'infra/governance/external-activation-policy.json'
const CONTRACT_PATH = 'infra/governance/providers/github-mutation-boundary-contract.json'
const temporary = []

test.after(() => {
  for (const path of temporary.reverse()) rmSync(path, { recursive: true, force: true })
})

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function canonicalDigest(value) {
  return sha256(stableJson(value))
}

function fixtureDigest(label) {
  return sha256(`mirror-activation-boundary-test:${label}`)
}

function canonicalDocument(path) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8'))
}

function fakePolicyRequirement({ id, repository, contractDigest }) {
  return {
    id,
    kind: 'github-mutation-boundary',
    repository,
    requiredFor: ['release', 'objective-completion'],
    mutationBoundaryContract: { path: CONTRACT_PATH, sha256: contractDigest },
  }
}

function fakeActivatedRequirement(policyRequirement, { scope, contract, contractDigest, observedAt, expiresAt }) {
  const desired = contract.desiredBindings[scope]
  const observedResource = {
    projectionContractDigest: contractDigest,
    fullRulesetsDigest: fixtureDigest(`${scope}:full-rulesets`),
    bypassActorsDigest: EMPTY_BYPASS_ACTORS_DIGEST,
    publicRulesetProjectionDigest: fixtureDigest(`${scope}:public-rulesets`),
    normalizedRulesetsDigest: desired.normalizedRulesetsDigest,
    requiredChecksDigest: desired.requiredChecksDigest,
    actionsWorkflowPermissionsDigest: desired.actionsWorkflowPermissionsDigest,
    repositoryIdentityDefaultBranchDigest: desired.repositoryIdentityDefaultBranchDigest,
    environmentPolicyDigest: desired.environmentPolicyDigest,
  }
  return {
    ...clone(policyRequirement),
    status: 'activated',
    observedAt,
    expiresAt,
    evidence: {
      signerKeyId: `fixture-${scope}`,
      subject: `fixture-${scope}-subject`,
      signature: `fixture-${scope}-signature`,
      coSignatures: [],
      payload: {
        requirementId: policyRequirement.id,
        repository: policyRequirement.repository,
        observedAt,
        expiresAt,
        observedResource,
      },
    },
  }
}

function resealModel(model) {
  const policyDigest = canonicalDigest(model.policy)
  model.ledger.policy = { path: POLICY_PATH, sha256: policyDigest }
  model.requirementsBytes = Buffer.from(`${JSON.stringify(model.ledger, null, 2)}\n`)
  model.expectedRequirementsSha256 = sha256(model.requirementsBytes)
  return model
}

function completeModel() {
  const contract = canonicalDocument(CONTRACT_PATH)
  const contractSchema = canonicalDocument('infra/governance/schemas/github-mutation-boundary-contract.schema.json')
  const inventory = canonicalDocument('infra/governance/inventory/managed-repos.json')
  const desired = canonicalDocument('infra/governance/desired/github.json')
  validateGithubMutationBoundaryContract(contract, { desired, inventory })
  const contractDigest = canonicalDigest(contract)
  const sourcePolicy = fakePolicyRequirement({ id: 'fixture-source-boundary', repository: SOURCE, contractDigest })
  const targetPolicy = fakePolicyRequirement({ id: 'fixture-target-boundary', repository: TARGET, contractDigest })
  const policy = { requirements: [sourcePolicy, targetPolicy] }
  const ledger = {
    policy: { path: POLICY_PATH, sha256: canonicalDigest(policy) },
    requirements: [
      fakeActivatedRequirement(sourcePolicy, {
        scope: 'source', contract, contractDigest,
        observedAt: '2030-01-01T23:15:00.000Z', expiresAt: '2030-01-05T00:00:00.000Z',
      }),
      fakeActivatedRequirement(targetPolicy, {
        scope: 'target', contract, contractDigest,
        observedAt: '2030-01-01T23:30:00.000Z', expiresAt: '2030-01-04T00:00:00.000Z',
      }),
    ],
  }
  return resealModel({
    ledger,
    policy,
    contract,
    contractSchema,
    inventory,
    desired,
    rings: { attestationPolicy: { clockSkewSeconds: 120, maxCompletionTtlMinutes: 10080 } },
    issuerRegistry: {},
    runtimeProfile: {},
  })
}

function buildOptions(model, activationValidator = () => ({ ready: true, scope: 'release' })) {
  return {
    ledger: model.ledger,
    requirementsBytes: model.requirementsBytes,
    expectedRequirementsSha256: model.expectedRequirementsSha256,
    inventory: model.inventory,
    desired: model.desired,
    rings: model.rings,
    issuerRegistry: model.issuerRegistry,
    policy: model.policy,
    runtimeProfile: model.runtimeProfile,
    projectionContract: model.contract,
    projectionContractSchema: model.contractSchema,
    expectedCommit: 'a'.repeat(40),
    expectedTree: 'b'.repeat(40),
    releaseRoot: '/release/source',
    now: NOW,
    activationValidator,
  }
}

function mutateModel(mutator) {
  const model = completeModel()
  mutator(model)
  return resealModel(model)
}

function runGit(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout.trim()
}

function writeJson(root, path, value) {
  const absolute = join(root, path)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`)
}

function gitFixture({ inventorySymlink = false } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'mirror-activation-boundary-')))
  temporary.push(base)
  const root = join(base, 'release')
  mkdirSync(root)
  const model = completeModel()
  writeFileSync(join(root, 'README.md'), 'immutable release fixture\n')
  writeJson(root, 'infra/governance/external-activation-requirements.json', model.ledger)
  writeJson(root, POLICY_PATH, model.policy)
  if (inventorySymlink) {
    const outside = join(base, 'outside-inventory.json')
    writeFileSync(outside, `${JSON.stringify(model.inventory)}\n`)
    const inventoryPath = join(root, 'infra/governance/inventory/managed-repos.json')
    mkdirSync(dirname(inventoryPath), { recursive: true })
    symlinkSync(outside, inventoryPath)
  } else writeJson(root, 'infra/governance/inventory/managed-repos.json', model.inventory)
  writeJson(root, 'infra/governance/desired/github.json', model.desired)
  writeJson(root, 'infra/governance/release-rings.json', model.rings)
  writeJson(root, 'infra/governance/trust/issuers.json', model.issuerRegistry)
  writeJson(root, 'infra/governance/providers/runtime-conformance.json', model.runtimeProfile)
  writeJson(root, CONTRACT_PATH, model.contract)
  writeJson(root, 'infra/governance/schemas/github-mutation-boundary-contract.schema.json', model.contractSchema)
  runGit(root, ['init', '-q'])
  runGit(root, ['config', 'user.name', 'Mirror Fixture'])
  runGit(root, ['config', 'user.email', 'mirror-fixture@example.invalid'])
  runGit(root, ['add', '-A'])
  runGit(root, ['commit', '-q', '-m', 'fixture'])
  const commit = runGit(root, ['rev-parse', 'HEAD'])
  const tree = runGit(root, ['rev-parse', 'HEAD^{tree}'])
  const requirementsBytes = readFileSync(join(root, 'infra/governance/external-activation-requirements.json'))
  return {
    base,
    root,
    model,
    commit,
    tree,
    requirementsSha256: sha256(requirementsBytes),
    output: join(root, 'activation-boundary-proof.json'),
  }
}

function verifyFixture(fixture, overrides = {}) {
  return verifyMirrorActivationBoundary({
    releaseSourceRoot: fixture.root,
    expectedCommit: fixture.commit,
    expectedTree: fixture.tree,
    expectedExternalActivationRequirementsSha256: fixture.requirementsSha256,
    outputPath: fixture.output,
    now: NOW,
    activationValidator: () => ({ ready: true, scope: 'release' }),
    ...overrides,
  })
}

test('production default is the canonical full external-activation assertion', () => {
  assert.equal(DEFAULT_ACTIVATION_VALIDATOR, assertExternalActivationReady)
})

test('shared desired-binding projection is the sole committed contract derivation', () => {
  const model = completeModel()
  const derived = deriveGithubMutationBoundaryDesiredBindings({
    desired: model.desired,
    inventory: model.inventory,
    contract: model.contract,
  })
  assert.deepEqual(derived.desiredBindings, model.contract.desiredBindings)
  assert.equal(validateGithubMutationBoundaryContract(model.contract, {
    desired: model.desired,
    inventory: model.inventory,
  }), model.contract)
  assert.deepEqual(model.contract.freshnessPolicy.scopes.target.directRuntimeRead, [
    'publicRulesetProjectionDigest', 'repositoryIdentityDefaultBranchDigest',
  ])
  assert.deepEqual(model.contract.freshnessPolicy.scopes.target.contractBound, [
    'projectionContractDigest', 'environmentPolicyDigest',
  ])
  for (const scope of ['source', 'target']) {
    assert.ok(derived.projections[scope].requiredChecks.every(check => (
      Object.keys(check).sort().join(',') === 'context,integration,ruleset'
    )))
  }

  const drifted = clone(model.contract)
  drifted.desiredBindings.source.normalizedRulesetsDigest = '0'.repeat(64)
  assert.throws(() => validateGithubMutationBoundaryContract(drifted, {
    desired: model.desired,
    inventory: model.inventory,
  }), /committed desired bindings differ/)
  assert.throws(() => deriveGithubMutationBoundaryDesiredBindings({
    desired: model.desired,
    inventory: model.inventory,
    contract: drifted,
  }), /committed desired bindings differ/)

  const overclaimed = clone(model.contract)
  overclaimed.freshnessPolicy.scopes.target.directRuntimeRead.push('environmentPolicyDigest')
  overclaimed.freshnessPolicy.scopes.target.contractBound.pop()
  assert.throws(() => validateGithubMutationBoundaryContract(overclaimed), /target freshness classifications drifted/)

  const unversioned = clone(model.contract)
  delete unversioned.githubApiVersion
  assert.throws(() => validateGithubMutationBoundaryContract(unversioned), /open or incomplete shape/)
  const substitutedVersion = clone(model.contract)
  substitutedVersion.githubApiVersion = 'latest'
  assert.throws(() => validateGithubMutationBoundaryContract(substitutedVersion), /API version mismatch/)
})

test('projection schema root cannot omit, add, or reopen a contract field', () => {
  const missing = completeModel()
  missing.contractSchema.required = missing.contractSchema.required.filter(key => key !== 'freshnessPolicy')
  assert.throws(() => buildMirrorActivationBoundaryProof(buildOptions(missing)), /schema required fields/)

  const added = completeModel()
  added.contractSchema.properties.attacker = { type: 'boolean' }
  assert.throws(() => buildMirrorActivationBoundaryProof(buildOptions(added)), /schema properties/)

  const reopened = completeModel()
  reopened.contractSchema.additionalProperties = true
  assert.throws(() => buildMirrorActivationBoundaryProof(buildOptions(reopened)), /schema root must be closed/)
})

test('pure builder calls the injected release-scoped validator and emits one closed deterministic proof', () => {
  const model = completeModel()
  let call = null
  const activationValidator = (ledger, options) => {
    call = { ledger, options }
    return { ready: true, scope: 'release' }
  }
  const proof = buildMirrorActivationBoundaryProof(buildOptions(model, activationValidator))
  assert.equal(call.ledger, model.ledger)
  assert.equal(call.options.scope, 'release')
  assert.equal(call.options.now, NOW)
  assert.equal(call.options.desired, model.desired)
  assert.equal(call.options.mutationBoundaryContract, model.contract)
  assert.equal(call.options.managedCiValidationContext.repoRoot, '/release/source')
  assert.equal(call.options.managedCiValidationContext.runtimeProfile, model.runtimeProfile)
  assert.equal(proof.minimumExpiresAt, '2030-01-04T00:00:00.000Z')
  assert.deepEqual(proof.boundaries.map(boundary => boundary.requirementId), [
    'fixture-source-boundary', 'fixture-target-boundary',
  ])
  assert.deepEqual(proof.boundaries.map(boundary => boundary.environmentClassification), [
    { kind: 'named-protected-environment', name: 'governance-mirror' },
    { kind: 'absent', name: null },
  ])
  assert.equal(Object.hasOwn(proof, 'generatedAt'), false)
  assert.equal(validateMirrorActivationBoundaryProof(proof, { now: NOW }), true)
  assert.deepEqual(buildMirrorActivationBoundaryProof(buildOptions(model)), proof)
})

test('closed CLI rejects missing, unknown, duplicate, inline, and positional inputs', () => {
  const valid = [
    '--release-source-root', '/release',
    '--expected-commit', 'a'.repeat(40),
    '--expected-tree', 'b'.repeat(40),
    '--expected-external-activation-requirements-sha256', 'c'.repeat(64),
    '--output', '/proof.json',
  ]
  assert.deepEqual(parseMirrorActivationBoundaryCli(valid), {
    releaseSourceRoot: '/release',
    expectedCommit: 'a'.repeat(40),
    expectedTree: 'b'.repeat(40),
    expectedExternalActivationRequirementsSha256: 'c'.repeat(64),
    outputPath: '/proof.json',
  })
  assert.throws(() => parseMirrorActivationBoundaryCli(valid.slice(0, -2)), /usage/)
  assert.throws(() => parseMirrorActivationBoundaryCli([...valid.slice(0, -2), '--unknown', '/proof.json']), /unknown/)
  assert.throws(() => parseMirrorActivationBoundaryCli([...valid.slice(0, -2), '--output=/proof.json', 'x']), /unknown/)
  const duplicated = [...valid]
  duplicated.splice(2, 2, '--release-source-root', '/other')
  assert.throws(() => parseMirrorActivationBoundaryCli(duplicated), /duplicate/)
  const positional = [...valid]
  positional[0] = 'release-source-root'
  assert.throws(() => parseMirrorActivationBoundaryCli(positional), /unknown or positional/)
})

test('real clean Git worktree verifies commit/tree, writes 0600, and refuses output replay', () => {
  const fixture = gitFixture()
  const proof = verifyFixture(fixture)
  assert.equal(proof.release.commit, fixture.commit)
  assert.equal(proof.release.tree, fixture.tree)
  assert.equal(lstatSync(fixture.output).mode & 0o777, 0o600)
  assert.deepEqual(JSON.parse(readFileSync(fixture.output, 'utf8')), proof)
  assert.throws(() => verifyFixture(fixture), /already exists|no-clobber/)
})

test('read-only release assertion revalidates signed readiness and rejects a structurally valid fabricated proof', () => {
  const fixture = gitFixture()
  const proof = verifyFixture(fixture)
  const before = readFileSync(fixture.output)
  let calls = 0
  assert.deepEqual(assertMirrorActivationBoundaryProofAgainstRelease({
    proof,
    releaseSourceRoot: fixture.root,
    expectedCommit: fixture.commit,
    expectedTree: fixture.tree,
    expectedExternalActivationRequirementsSha256: fixture.requirementsSha256,
    now: NOW,
    activationValidator: () => { calls += 1; return { ready: true, scope: 'release' } },
  }), proof)
  assert.equal(calls, 1)
  assert.deepEqual(readFileSync(fixture.output), before)

  const fabricated = clone(proof)
  fabricated.boundaries[0].publicRulesetProjectionDigest = 'f'.repeat(64)
  assert.throws(() => assertMirrorActivationBoundaryProofAgainstRelease({
    proof: fabricated,
    releaseSourceRoot: fixture.root,
    expectedCommit: fixture.commit,
    expectedTree: fixture.tree,
    expectedExternalActivationRequirementsSha256: fixture.requirementsSha256,
    now: NOW,
    activationValidator: () => ({ ready: true, scope: 'release' }),
  }), /differs from the fully revalidated signed release evidence/)
})

test('release source rejects wrong commit, wrong tree, and a dirty tracked tree', () => {
  const wrongCommit = gitFixture()
  assert.throws(() => verifyFixture(wrongCommit, {
    expectedCommit: '0'.repeat(40), outputPath: join(wrongCommit.root, 'wrong-commit.json'),
  }), /HEAD differs/)

  const wrongTree = gitFixture()
  assert.throws(() => verifyFixture(wrongTree, {
    expectedTree: '0'.repeat(40), outputPath: join(wrongTree.root, 'wrong-tree.json'),
  }), /tree differs/)

  const dirty = gitFixture()
  appendFileSync(join(dirty.root, 'README.md'), 'tracked drift\n')
  assert.throws(() => verifyFixture(dirty), /tracked tree is dirty/)
})

test('release source rejects direct-root symlinks and tracked file path escape', () => {
  const direct = gitFixture()
  const alias = join(direct.base, `${basename(direct.root)}-alias`)
  symlinkSync(direct.root, alias)
  assert.throws(() => verifyFixture(direct, {
    releaseSourceRoot: alias,
    outputPath: join(direct.root, 'symlink-root.json'),
  }), /must not be a symbolic link/)

  const escaped = gitFixture({ inventorySymlink: true })
  assert.throws(() => verifyFixture(escaped), /crosses a symbolic link/)
})

test('requirements byte substitution fails before activation validation', () => {
  const fixture = gitFixture()
  let called = false
  assert.throws(() => verifyFixture(fixture, {
    expectedExternalActivationRequirementsSha256: '0'.repeat(64),
    activationValidator: () => { called = true; return { ready: true, scope: 'release' } },
  }), /requirements byte hash differs/)
  assert.equal(called, false)
})

for (const [label, mutate, pattern] of [
  ['missing target', model => {
    model.policy.requirements.pop()
    model.ledger.requirements.pop()
  }, /exactly two/],
  ['duplicate source', model => {
    model.policy.requirements[1].repository = SOURCE
    model.ledger.requirements[1].repository = SOURCE
    model.ledger.requirements[1].evidence.payload.repository = SOURCE
  }, /exactly one.*design-system|exactly one.*ds-product-template/],
  ['wrong repository', model => {
    model.policy.requirements[1].repository = 'ajenchen/not-the-template'
    model.ledger.requirements[1].repository = 'ajenchen/not-the-template'
    model.ledger.requirements[1].evidence.payload.repository = 'ajenchen/not-the-template'
  }, /exactly one.*ds-product-template|unexpected repository/],
]) {
  test(`requirement discovery rejects ${label} without guessed IDs`, () => {
    const model = mutateModel(mutate)
    assert.throws(() => buildMirrorActivationBoundaryProof(buildOptions(model)), pattern)
  })
}

for (const [label, mutate, pattern] of [
  ['projection contract', resource => { resource.projectionContractDigest = '0'.repeat(64) }, /projection contract digest drifted/],
  ['empty bypass actors', resource => { resource.bypassActorsDigest = '0'.repeat(64) }, /empty bypass-actor set/],
  ['desired normalized rulesets', resource => { resource.normalizedRulesetsDigest = '0'.repeat(64) }, /immutable desired binding/],
  ['public projection shape', resource => { resource.publicRulesetProjectionDigest = 'not-a-digest' }, /publicRulesetProjectionDigest is invalid/],
]) {
  test(`signed observed resource rejects wrong ${label}`, () => {
    const model = mutateModel(model => mutate(model.ledger.requirements[0].evidence.payload.observedResource))
    assert.throws(() => buildMirrorActivationBoundaryProof(buildOptions(model)), pattern)
  })
}

test('expired signed evidence and expired proof fail closed', () => {
  const model = mutateModel(model => {
    const requirement = model.ledger.requirements[1]
    requirement.expiresAt = '2030-01-01T23:59:59.000Z'
    requirement.evidence.payload.expiresAt = requirement.expiresAt
  })
  assert.throws(() => buildMirrorActivationBoundaryProof(buildOptions(model)), /evidence is expired/)

  const proof = buildMirrorActivationBoundaryProof(buildOptions(completeModel()))
  assert.throws(() => validateMirrorActivationBoundaryProof(proof, {
    now: new Date(proof.minimumExpiresAt),
  }), /minimum remaining validity/)
})

test('old-but-unexpired signed observation fails the contract-specific freshness window', () => {
  const model = mutateModel(model => {
    const requirement = model.ledger.requirements[0]
    requirement.observedAt = '2030-01-01T22:59:59.000Z'
    requirement.evidence.payload.observedAt = requirement.observedAt
  })
  assert.equal(new Date(model.ledger.requirements[0].expiresAt) > NOW, true)
  assert.throws(() => buildMirrorActivationBoundaryProof(buildOptions(model)), /observation is too old/)
})

test('unexpired evidence inside the retry horizon fails minimum remaining validity', () => {
  const model = mutateModel(model => {
    const requirement = model.ledger.requirements[1]
    requirement.expiresAt = '2030-01-02T00:04:59.000Z'
    requirement.evidence.payload.expiresAt = requirement.expiresAt
  })
  assert.equal(new Date(model.ledger.requirements[1].expiresAt) > NOW, true)
  assert.throws(() => buildMirrorActivationBoundaryProof(buildOptions(model)), /minimum remaining validity/)
})

test('proof validator rejects open shape, substituted public digest shape, and boundary replay', () => {
  const proof = buildMirrorActivationBoundaryProof(buildOptions(completeModel()))
  assert.throws(() => validateMirrorActivationBoundaryProof({ ...proof, attacker: true }), /open shape/)
  const publicPoison = clone(proof)
  publicPoison.boundaries[0].publicRulesetProjectionDigest = 'wrong'
  assert.throws(() => validateMirrorActivationBoundaryProof(publicPoison), /public projection digest is invalid/)
  const replay = clone(proof)
  replay.boundaries[1] = clone(replay.boundaries[0])
  assert.throws(() => validateMirrorActivationBoundaryProof(replay), /repository order\/identity|duplicated/)
})

test('standalone proof writer is deterministic, private, and no-clobber', () => {
  const proof = buildMirrorActivationBoundaryProof(buildOptions(completeModel()))
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'mirror-activation-proof-output-')))
  temporary.push(base)
  const output = join(base, 'proof.json')
  assert.equal(writeMirrorActivationBoundaryProof(proof, output), output)
  assert.equal(lstatSync(output).mode & 0o777, 0o600)
  const first = readFileSync(output)
  assert.throws(() => writeMirrorActivationBoundaryProof(proof, output), /already exists/)
  assert.deepEqual(readFileSync(output), first)
  chmodSync(output, 0o600)
})
