import assert from 'node:assert/strict'
import test from 'node:test'
import {
  candidatePlanDigest,
  evaluateReleaseRingSoak,
  issueApplyAuthorization,
  issueCompletionAttestation,
  resolveRolloutWave,
  verifyApplyAuthorization,
} from '../lib/rollout-state-machine.mjs'
import { issuerRegistryDigest } from '../lib/issuer-registry.mjs'
import { sha256, stableStringify } from '../lib/common.mjs'
import {
  externalActivationPolicyDigest,
  loadExternalActivationPolicy,
} from '../lib/external-activation.mjs'

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIONNr2Y1hDSWkLyinTTfdEU1ilmYox3tHunig5bPsrEp
-----END PRIVATE KEY-----
`
const candidateRelease = {
  id: 'ajenchen/design-system@v1.2.3',
  version: '1.2.3',
  sourceCommit: '1111111111111111111111111111111111111111',
  sourceTree: '2222222222222222222222222222222222222222',
  bomSha256: 'a'.repeat(64),
  packages: [
    { name: '@qijenchen/design-system', version: '1.2.3', integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}` },
    { name: '@qijenchen/governance', version: '1.2.3', integrity: `sha512-${Buffer.alloc(64, 2).toString('base64')}` },
    { name: '@qijenchen/storybook-config', version: '1.2.3', integrity: `sha512-${Buffer.alloc(64, 3).toString('base64')}` },
  ],
  observedAt: '2026-07-20T00:00:00Z',
}
const verifiedReleaseEvidenceDigest = '8'.repeat(64)
const passingPredicates = [{ id: 'gate', type: 'plan-conflict-free', pass: true, evidenceDigest: 'b'.repeat(64), message: 'pass' }]
const NOW = new Date('2026-07-20T00:30:00Z')
const issuerRegistry = {
  $schema: '../schemas/issuer-registry.schema.json',
  schemaVersion: 1,
  algorithm: 'ed25519',
  issuers: [{
    keyId: 'fixture-ed25519',
    subject: 'fixture-governance',
    publicKeySpki: 'MCowBQYDK2VwAyEAk2uZrtL/IxPATYuuY8Y/MLunvpd6t132J3/c0EM83V8=',
    roles: ['apply-authorizer', 'completion-attestor'],
    status: 'active',
    notBefore: '2020-01-01T00:00:00.000Z',
    notAfter: '2030-01-01T00:00:00.000Z',
    revokedAt: null,
  }],
}
const policy = {
  schemaVersion: 1,
  algorithm: 'ed25519',
  maxAuthorizationTtlMinutes: 60,
  maxCompletionTtlMinutes: 10080,
  clockSkewSeconds: 0,
  issuerRegistryDigest: issuerRegistryDigest(issuerRegistry),
  allowedKeyIds: ['fixture-ed25519'],
  applyAuthorizationQuorum: 1,
  completionAttestationQuorum: 1,
}

function ring(id, order, maxParallel = 1) {
  return { id, order, maxParallel, waves: [{ id: 'canary', order: 0, maxParallel }], promotionPredicates: [{ id: 'gate', type: 'plan-conflict-free' }] }
}

function assignment(ringId) {
  return { ring: ringId, wave: 'canary', enteredAt: '2026-07-20T00:00:00Z', manualBlockers: [], applyAuthorization: null, completionAttestation: null }
}

function candidate(repoId, actions = [{ kind: 'change' }]) {
  return {
    repoId,
    github: `acme/${repoId}`,
    defaultBranchHeadSha: repoId === 'authority' ? '2'.repeat(40) : '3'.repeat(40),
    observedStateDigest: repoId === 'authority' ? 'c'.repeat(64) : 'd'.repeat(64),
    actions,
    conflicts: [],
    predicateResults: passingPredicates,
  }
}

function soakFixture(type = 'soak-observation') {
  return {
    predicate: { id: 'post-release-soak', type },
    repo: { id: 'authority', github: 'ajenchen/design-system' },
    ring: {
      id: 'ring-0-authority',
      minimumSoakHours: 72,
    },
    assignment: {
      ring: 'ring-0-authority',
      wave: 'canary',
      enteredAt: candidateRelease.observedAt,
      candidateReleaseDigest: sha256(stableStringify(candidateRelease, 0)),
    },
  }
}

function signed(kind, item, planDigest, ringId) {
  const issue = kind === 'apply' ? issueApplyAuthorization : issueCompletionAttestation
  return issue({
    repoId: item.repoId,
    github: item.github,
    ringId,
    waveId: 'canary',
    candidateRelease,
    verifiedReleaseEvidenceDigest,
    candidatePlanDigest: planDigest,
    predicateResults: item.predicateResults,
    stateDigest: item.observedStateDigest,
    defaultBranchHeadSha: item.defaultBranchHeadSha,
    actions: item.actions,
    signerKeyId: 'fixture-ed25519',
    subject: 'fixture-governance',
    privateKey: PRIVATE_KEY,
    issuedAt: '2026-07-20T00:00:00Z',
    expiresAt: kind === 'apply' ? '2026-07-20T01:00:00Z' : '2026-07-27T00:00:00Z',
    attestationPolicy: policy,
  })
}

test('parallel budget fails closed instead of flattening all authorized repositories', () => {
  const inventory = { repositories: [{ id: 'a', github: 'acme/a' }, { id: 'b', github: 'acme/b' }] }
  const rings = { attestationPolicy: policy, rings: [ring('ring-0', 0, 1)], assignments: { a: assignment('ring-0'), b: assignment('ring-0') } }
  const repoCandidates = [candidate('a'), candidate('b')]
  const planDigest = candidatePlanDigest({ candidateRelease, verifiedReleaseEvidenceDigest, repoCandidates: repoCandidates.map(({ repoId, github, defaultBranchHeadSha, observedStateDigest, actions, conflicts }) => ({ repoId, github, defaultBranchHeadSha, observedStateDigest, actions, conflicts })) })
  for (const item of repoCandidates) rings.assignments[item.repoId].applyAuthorization = signed('apply', item, planDigest, 'ring-0')

  const result = resolveRolloutWave({ inventory, rings, candidateRelease, verifiedReleaseEvidenceDigest, candidatePlanDigest: planDigest, repoCandidates, now: NOW, issuerRegistry })
  assert.deepEqual(result.selectedRepoIds, [])
  assert.ok(result.blockers.some(blocker => blocker.includes('parallel budget exceeded')))
})

test('a cryptographically valid but stale plan authorization cannot authorize the current plan', () => {
  const inventory = { repositories: [{ id: 'a', github: 'acme/a' }] }
  const item = candidate('a')
  const rings = { attestationPolicy: policy, rings: [ring('ring-0', 0)], assignments: { a: assignment('ring-0') } }
  rings.assignments.a.applyAuthorization = signed('apply', item, 'e'.repeat(64), 'ring-0')
  assert.equal(verifyApplyAuthorization(rings.assignments.a.applyAuthorization, {
    repoId: 'a', github: 'acme/a', ringId: 'ring-0', waveId: 'canary', candidateRelease, verifiedReleaseEvidenceDigest, attestationPolicy: policy,
  }, { now: NOW, issuerRegistry }).valid, true)

  const result = resolveRolloutWave({ inventory, rings, candidateRelease, verifiedReleaseEvidenceDigest, candidatePlanDigest: 'f'.repeat(64), repoCandidates: [item], now: NOW, issuerRegistry })
  assert.deepEqual(result.selectedRepoIds, [])
  assert.ok(result.blockers.some(blocker => blocker.includes('candidatePlanDigest mismatch')))
})

test('only an exact signed readback completion advances to the next ring', () => {
  const inventory = { repositories: [{ id: 'authority', github: 'acme/authority' }, { id: 'consumer', github: 'acme/consumer' }] }
  const authority = candidate('authority', [])
  const consumer = candidate('consumer')
  const repoCandidates = [authority, consumer]
  const rings = {
    attestationPolicy: policy,
    rings: [ring('ring-0', 0), ring('ring-1', 1)],
    assignments: { authority: assignment('ring-0'), consumer: assignment('ring-1') },
  }
  const planDigest = candidatePlanDigest({ candidateRelease, verifiedReleaseEvidenceDigest, repoCandidates: repoCandidates.map(({ repoId, github, defaultBranchHeadSha, observedStateDigest, actions, conflicts }) => ({ repoId, github, defaultBranchHeadSha, observedStateDigest, actions, conflicts })) })
  rings.assignments.authority.completionAttestation = signed('complete', authority, planDigest, 'ring-0')
  rings.assignments.consumer.applyAuthorization = signed('apply', consumer, planDigest, 'ring-1')

  const result = resolveRolloutWave({ inventory, rings, candidateRelease, verifiedReleaseEvidenceDigest, candidatePlanDigest: planDigest, repoCandidates, now: NOW, issuerRegistry })
  assert.deepEqual(result.current, { ring: 'ring-1', wave: 'canary', repoIds: ['consumer'] })
  assert.deepEqual(result.selectedRepoIds, ['consumer'])
})

test('a forged aligned upstream completion cannot advance the fleet', () => {
  const inventory = { repositories: [{ id: 'authority', github: 'acme/authority' }, { id: 'consumer', github: 'acme/consumer' }] }
  const authority = candidate('authority', [])
  const consumer = candidate('consumer')
  const repoCandidates = [authority, consumer]
  const rings = {
    attestationPolicy: policy,
    rings: [ring('ring-0', 0), ring('ring-1', 1)],
    assignments: { authority: assignment('ring-0'), consumer: assignment('ring-1') },
  }
  const planDigest = '9'.repeat(64)
  rings.assignments.authority.completionAttestation = signed('complete', authority, planDigest, 'ring-0')
  rings.assignments.authority.completionAttestation.signature = rings.assignments.authority.completionAttestation.signature.replace(/^./, value => value === 'A' ? 'B' : 'A')
  rings.assignments.consumer.applyAuthorization = signed('apply', consumer, planDigest, 'ring-1')

  const result = resolveRolloutWave({ inventory, rings, candidateRelease, verifiedReleaseEvidenceDigest, candidatePlanDigest: planDigest, repoCandidates, now: NOW, issuerRegistry })
  assert.equal(result.current.ring, 'ring-0')
  assert.deepEqual(result.selectedRepoIds, [])
  assert.ok(result.blockers.some(blocker => blocker.includes('signed apply authorization is missing')))
})

test('production-grade soak is exact-release-bound deferred evidence, not a release blocker', () => {
  const fixture = soakFixture()
  const first = evaluateReleaseRingSoak({
    ...fixture,
    candidateRelease,
    now: new Date('2026-07-20T00:30:00Z'),
  })
  const repeated = evaluateReleaseRingSoak({
    ...fixture,
    candidateRelease,
    now: new Date('2026-07-20T00:30:00Z'),
  })
  assert.equal(first.pass, true)
  assert.match(first.message, /deferred post-release/)
  assert.deepEqual(repeated, first)
  const elapsedWithoutObservationReceipt = evaluateReleaseRingSoak({
    ...fixture,
    candidateRelease,
    now: new Date('2026-07-25T00:00:00Z'),
  })
  assert.equal(elapsedWithoutObservationReceipt.pass, true)
  assert.match(elapsedWithoutObservationReceipt.message, /remains deferred post-release/)

  const substitutedRelease = {
    ...candidateRelease,
    version: '1.2.4',
    id: 'ajenchen/design-system@v1.2.4',
    packages: candidateRelease.packages.map(item => ({ ...item, version: '1.2.4' })),
  }
  const stale = evaluateReleaseRingSoak({
    ...fixture,
    candidateRelease: substitutedRelease,
    now: new Date('2026-07-20T00:30:00Z'),
  })
  assert.equal(stale.pass, false)
  assert.match(stale.message, /stale|different release/)
  assert.notEqual(stale.evidenceDigest, first.evidenceDigest)

  const staleDeployment = evaluateReleaseRingSoak({
    ...fixture,
    assignment: {
      ...fixture.assignment,
      enteredAt: '2026-07-19T23:59:59Z',
    },
    candidateRelease,
    now: new Date('2026-07-20T00:30:00Z'),
  })
  assert.equal(staleDeployment.pass, false)
  assert.match(staleDeployment.message, /deployment identity/)
})

test('maximum-assurance keeps the candidate-bound soak as a blocking promotion gate', () => {
  const maximumPolicy = structuredClone(loadExternalActivationPolicy())
  maximumPolicy.activeProfile = 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM'
  const expectedActivationPolicyDigest = externalActivationPolicyDigest(maximumPolicy)
  const fixture = soakFixture('soak-complete')
  const incomplete = evaluateReleaseRingSoak({
    ...fixture,
    candidateRelease,
    now: new Date('2026-07-20T00:30:00Z'),
    activationPolicy: maximumPolicy,
    expectedActivationPolicyDigest,
  })
  assert.equal(incomplete.pass, false)
  assert.match(incomplete.message, /minimum soak incomplete/)

  const complete = evaluateReleaseRingSoak({
    ...fixture,
    candidateRelease,
    now: new Date('2026-07-23T00:00:00Z'),
    activationPolicy: maximumPolicy,
    expectedActivationPolicyDigest,
  })
  assert.equal(complete.pass, true)
  assert.match(complete.message, /minimum soak complete/)
})

test('deployment profile and release-ring soak predicate cannot be substituted across profiles', () => {
  assert.throws(
    () => evaluateReleaseRingSoak({
      ...soakFixture('soak-complete'),
      candidateRelease,
      now: NOW,
    }),
    /requires release-ring predicate soak-observation/,
  )

  const maximumPolicy = structuredClone(loadExternalActivationPolicy())
  maximumPolicy.activeProfile = 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM'
  assert.throws(
    () => evaluateReleaseRingSoak({
      ...soakFixture('soak-observation'),
      candidateRelease,
      now: NOW,
      activationPolicy: maximumPolicy,
      expectedActivationPolicyDigest: externalActivationPolicyDigest(maximumPolicy),
    }),
    /requires release-ring predicate soak-complete/,
  )
})
