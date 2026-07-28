#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { generateKeyPairSync, sign } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import {
  applyReviewedVisualBaseline,
  checkVisualBaseline,
  expectedVisualReviewImages,
  planVisualBaseline,
  validateVisualBaselineReview,
} from '../packages/design-system/tools/visual-baseline/index.mjs'
import { runVisualBaselineCli } from '../packages/design-system/tools/visual-baseline/cli.mjs'
import {
  compareUtf8Bytes,
  sha256,
  stableStringify,
} from '../packages/design-system/tools/shared/safe-filesystem.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function withAdversarialLocaleCompare(locale, callback) {
  const descriptor = Object.getOwnPropertyDescriptor(String.prototype, 'localeCompare')
  assert.ok(descriptor)
  const collator = new Intl.Collator(locale, { usage: 'sort', sensitivity: 'variant' })
  Object.defineProperty(String.prototype, 'localeCompare', {
    ...descriptor,
    value(other) {
      return collator.compare(String(this), String(other))
    },
  })
  try {
    return callback()
  } finally {
    Object.defineProperty(String.prototype, 'localeCompare', descriptor)
  }
}

function png(body) {
  const digest = Buffer.from(sha256(body), 'hex')
  const image = new PNG({ width: 1, height: 1 })
  image.data[0] = digest[0]
  image.data[1] = digest[1]
  image.data[2] = digest[2]
  image.data[3] = 255
  return PNG.sync.write(image)
}

function writeJson(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, bytes)
  return sha256(bytes)
}

function fixture({ candidate, baseline }) {
  const root = mkdtempSync(join(tmpdir(), 'visual-baseline-review-'))
  for (const [directory, files] of [['candidate', candidate], ['baseline', baseline]]) {
    mkdirSync(join(root, directory), { recursive: true })
    for (const [path, body] of Object.entries(files)) {
      const target = join(root, directory, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, png(body))
    }
  }
  execFileSync('git', ['init', '--quiet'], { cwd: root, stdio: 'pipe' })
  execFileSync('git', ['remote', 'add', 'origin', `https://github.com/qijenchen-visual-fixtures/${basename(root).toLowerCase()}.git`], { cwd: root, stdio: 'pipe' })
  execFileSync('git', ['add', '--', 'candidate', 'baseline'], { cwd: root, stdio: 'pipe' })
  execFileSync('git', ['-c', 'user.name=Visual Fixture', '-c', 'user.email=visual-fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'visual fixture base'], { cwd: root, stdio: 'pipe' })
  return root
}

test('Unicode visual paths and proposal digests use UTF-8 byte order under adversarial Intl locales', () => {
  const root = fixture({
    candidate: {
      'ä-image.png': 'new umlaut image',
      'z-image.png': 'new z image',
    },
    baseline: {
      'ä-image.png': 'old umlaut image',
      'z-image.png': 'old z image',
    },
  })
  const names = ['z-image.png', 'ä-image.png']
  const locales = ['en-US', 'sv-SE']
  const localeOrders = locales.map((locale) => [...names].sort(new Intl.Collator(locale).compare))
  assert.notDeepEqual(localeOrders[0], localeOrders[1])
  const statements = {
    'ä-image.png': 'Reviewed the Unicode umlaut image replacement.',
    'z-image.png': 'Reviewed the ASCII z image replacement.',
  }
  const proposals = locales.map((locale) => withAdversarialLocaleCompare(locale, () => planVisualBaseline({
    repoRoot: root,
    authorIdentity: 'unicode-order-audit',
    candidateRoot: 'candidate',
    baselineRoot: 'baseline',
    statements,
  })))
  assert.deepEqual(proposals[0], proposals[1])
  assert.equal(proposals[0].proposalDigest, proposals[1].proposalDigest)

  const expectedPaths = ['ä-image.png', 'z-image.png'].sort(compareUtf8Bytes)
  assert.deepEqual(proposals[0].candidateInventory.map((row) => row.path), expectedPaths)
  assert.deepEqual(proposals[0].baselineInventory.map((row) => row.path), expectedPaths)
  assert.deepEqual(proposals[0].images.map((row) => row.path), expectedPaths)
})

function activateTrust(root, { human = null, managed = null, role = 'consumer' } = {}) {
  const governanceRoot = role === 'authority' ? 'infra/governance' : role === 'consumer' ? 'governance' : null
  assert.ok(governanceRoot, `unsupported visual review trust role:${role}`)
  const issuers = [human, managed].filter(Boolean).map((row) => ({
    keyId: row.keyId,
    subject: row.subject,
    publicKeySpki: row.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    roles: [row.role],
    status: 'active',
    notBefore: '2026-07-22T00:00:00.000Z',
    notAfter: '2026-07-23T00:00:00.000Z',
    revokedAt: null,
  }))
  const registry = { $schema: '../schemas/issuer-registry.schema.json', schemaVersion: 1, algorithm: 'ed25519', issuers }
  const issuerRegistrySha256 = writeJson(join(root, governanceRoot, 'trust/issuers.json'), registry)
  let activationEvidencePath = null
  let activationEvidenceSha256 = null
  let modelAuthorityPolicyDigest = null
  let brokerPolicyDigest = null
  let activation = null
  if (managed) {
    modelAuthorityPolicyDigest = sha256('model-authority-policy')
    brokerPolicyDigest = sha256('broker-policy')
    activation = {
      schemaVersion: 1,
      kind: 'managed-model-broker-activation-readback',
      status: 'active',
      executionClass: 'model-broker',
      activationBundleDigest: sha256('activation-bundle'),
      managedReceiptDigest: sha256('managed-receipt'),
      modelAuthorityPolicyDigest,
      brokerPolicyDigest,
      issuerRegistryDigest: issuerRegistrySha256,
      signedReadbackDigest: sha256('signed-readback'),
    }
    activationEvidencePath = 'visual-baseline-managed-broker-activation.json'
    activationEvidenceSha256 = writeJson(join(root, governanceRoot, activationEvidencePath), activation)
  }
  const policy = {
    $schema: './schemas/visual-baseline-review-policy.schema.json',
    schemaVersion: 1,
    kind: 'visual-baseline-review-trust-policy',
    status: human ? 'active' : 'not-activated',
    issuerRegistryPath: 'trust/issuers.json',
    issuerRegistrySha256,
    human: { status: human ? 'active' : 'not-activated', allowedKeyIds: human ? [human.keyId] : [] },
    managedBroker: {
      status: managed ? 'active' : 'not-activated',
      allowedKeyIds: managed ? [managed.keyId] : [],
      activationEvidencePath,
      activationEvidenceSha256,
      modelAuthorityPolicyDigest,
      brokerPolicyDigest,
    },
  }
  writeJson(join(root, governanceRoot, 'visual-baseline-review-policy.json'), policy)
  return { policy, registry, activation }
}

function signedHumanReview(proposal, authority, reviewedAt = '2026-07-22T01:00:00.000Z') {
  const review = {
    schemaVersion: 1,
    kind: 'human-visual-baseline-review',
    proposalDigest: proposal.proposalDigest,
    decision: 'approved',
    reviewer: authority.subject,
    reviewedAt,
    images: expectedVisualReviewImages(proposal),
    attestation: null,
  }
  const core = structuredClone(review)
  delete core.attestation
  const unsigned = {
    schemaVersion: 1,
    kind: 'human-visual-baseline-review-attestation',
    algorithm: 'ed25519',
    reviewDomain: proposal.reviewDomain,
    repositoryIdentity: proposal.repository.identity,
    baseCommit: proposal.repository.headCommit,
    baseTree: proposal.repository.headTree,
    proposalDigest: proposal.proposalDigest,
    reviewDigest: sha256(stableStringify(core)),
    authorIdentity: proposal.authorIdentity,
    issuerRegistryDigest: proposal.reviewTrust.issuerRegistrySha256,
    policyDigest: proposal.reviewTrust.policySha256,
    issuedAt: reviewedAt,
    expiresAt: '2026-07-22T01:20:00.000Z',
    signerKeyId: authority.keyId,
    subject: authority.subject,
  }
  review.attestation = { ...unsigned, signature: sign(null, Buffer.from(stableStringify(unsigned)), authority.privateKey).toString('base64url') }
  return review
}

function authority(keyId, subject, role) {
  const pair = generateKeyPairSync('ed25519')
  return { ...pair, keyId, subject, role }
}

test('one canonical trust-policy byte image resolves mechanically in authority and BOM-projected consumer roles', () => {
  const canonicalRoot = join(REPO_ROOT, 'infra/governance')
  const files = [
    'visual-baseline-review-policy.json',
    'schemas/visual-baseline-review-policy.schema.json',
    'schemas/issuer-registry.schema.json',
    'trust/issuers.json',
  ]
  for (const role of ['authority', 'consumer']) {
    const root = fixture({ candidate: { 'image.png': 'new' }, baseline: { 'image.png': 'old' } })
    const projectionRoot = role === 'authority' ? 'infra/governance' : 'governance'
    for (const path of files) {
      const destination = join(root, projectionRoot, path)
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, readFileSync(join(canonicalRoot, path)))
    }
    const policyPath = join(root, projectionRoot, 'visual-baseline-review-policy.json')
    const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
    const registry = JSON.parse(readFileSync(join(root, projectionRoot, policy.issuerRegistryPath), 'utf8'))
    assert.ok(existsSync(resolve(dirname(policyPath), policy.$schema)))
    assert.ok(existsSync(resolve(dirname(join(root, projectionRoot, 'trust/issuers.json')), registry.$schema)))
    const proposal = planVisualBaseline({
      repoRoot: root,
      authorIdentity: 'portable-policy-audit-label',
      candidateRoot: 'candidate',
      baselineRoot: 'baseline',
      statements: { 'image.png': 'Reviewed the role-portable visual candidate bytes.' },
    })
    assert.equal(proposal.reviewTrust.status, 'not-activated')
    assert.equal(proposal.reviewTrust.policyPath, `${projectionRoot}/visual-baseline-review-policy.json`)
    assert.equal(proposal.reviewTrust.issuerRegistryPath, `${projectionRoot}/trust/issuers.json`)
  }
})

test('ambient Git config injection cannot substitute the proposal repository identity', () => {
  const root = fixture({ candidate: { 'image.png': 'new' }, baseline: { 'image.png': 'old' } })
  const poisoned = {
    GIT_CONFIG_COUNT: process.env.GIT_CONFIG_COUNT,
    GIT_CONFIG_KEY_0: process.env.GIT_CONFIG_KEY_0,
    GIT_CONFIG_VALUE_0: process.env.GIT_CONFIG_VALUE_0,
    GIT_CONFIG_PARAMETERS: process.env.GIT_CONFIG_PARAMETERS,
  }
  try {
    process.env.GIT_CONFIG_COUNT = '1'
    process.env.GIT_CONFIG_KEY_0 = 'remote.origin.url'
    process.env.GIT_CONFIG_VALUE_0 = 'https://github.com/attacker/substituted.git'
    process.env.GIT_CONFIG_PARAMETERS = "'remote.origin.url=https://github.com/attacker/parameters.git'"
    const proposal = planVisualBaseline({
      repoRoot: root,
      authorIdentity: 'git-environment-negative-probe',
      candidateRoot: 'candidate',
      baselineRoot: 'baseline',
      statements: { 'image.png': 'Verified repository identity ignores ambient Git injection.' },
    })
    assert.match(proposal.repository.identity, /^github\.com\/qijenchen-visual-fixtures\//)
    assert.doesNotMatch(proposal.repository.identity, /attacker/)
  } finally {
    for (const [key, value] of Object.entries(poisoned)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('allowlisted signed human review atomically replaces, creates, and deletes exact decoded PNGs', () => {
  const root = fixture({ candidate: { 'same.png': 'same', 'replace.png': 'new', 'nested/create.png': 'create' }, baseline: { 'same.png': 'same', 'replace.png': 'old', 'delete.png': 'delete' } })
  const reviewer = authority('human-reviewer', 'trusted-human-reviewer', 'visual-baseline-reviewer')
  activateTrust(root, { human: reviewer })
  const proposal = planVisualBaseline({
    repoRoot: root,
    authorIdentity: 'proposal-author',
    candidateRoot: 'candidate',
    baselineRoot: 'baseline',
    statements: {
      'delete.png': 'Removed the obsolete legacy state snapshot.',
      'nested/create.png': 'Added the reviewed nested empty-state snapshot.',
      'replace.png': 'Primary control spacing and border changed intentionally.',
    },
  })
  const review = signedHumanReview(proposal, reviewer)
  const now = new Date('2026-07-22T01:05:00.000Z')
  assert.equal(checkVisualBaseline({ repoRoot: root, proposal, review, now }).state, 'pending')
  const before = readFileSync(join(root, 'baseline/replace.png'))
  writeFileSync(join(root, 'baseline/.qijenchen-visual-baseline.lock'), 'first-writer\n')
  assert.throws(() => applyReviewedVisualBaseline({ repoRoot: root, proposal, review, now, expectedProposalDigest: proposal.proposalDigest }), /another tool transaction is active/)
  assert.deepEqual(readFileSync(join(root, 'baseline/replace.png')), before)
  unlinkSync(join(root, 'baseline/.qijenchen-visual-baseline.lock'))
  assert.equal(applyReviewedVisualBaseline({ repoRoot: root, proposal, review, now, expectedProposalDigest: proposal.proposalDigest }).changed, 3)
  assert.equal(checkVisualBaseline({ repoRoot: root, proposal, review, now }).state, 'applied')
  assert.deepEqual(readFileSync(join(root, 'baseline/replace.png')), readFileSync(join(root, 'candidate/replace.png')))
  assert.equal(applyReviewedVisualBaseline({ repoRoot: root, proposal, review, now, expectedProposalDigest: proposal.proposalDigest }).changed, 0)
})

test('a valid signed review cannot replay across repositories with identical image and trust bytes', () => {
  const reviewer = authority('human-reviewer', 'trusted-human-reviewer', 'visual-baseline-reviewer')
  const first = fixture({ candidate: { 'image.png': 'new' }, baseline: { 'image.png': 'old' } })
  const second = fixture({ candidate: { 'image.png': 'new' }, baseline: { 'image.png': 'old' } })
  activateTrust(first, { human: reviewer })
  activateTrust(second, { human: reviewer })
  const proposal = planVisualBaseline({
    repoRoot: first,
    authorIdentity: 'proposal-author',
    candidateRoot: 'candidate',
    baselineRoot: 'baseline',
    statements: { 'image.png': 'Reviewed the exact shared image bytes for repository one.' },
  })
  const review = signedHumanReview(proposal, reviewer)
  assert.throws(() => validateVisualBaselineReview({
    repoRoot: second,
    proposal,
    review,
    now: new Date('2026-07-22T01:05:00.000Z'),
  }), /repository origin\/HEAD commit\/tree differs from the proposal trust domain/)
})

test('unsigned/self-reported human review, forged review, and caller callbacks fail closed', () => {
  const root = fixture({ candidate: { 'image.png': 'new' }, baseline: { 'image.png': 'old' } })
  const proposal = planVisualBaseline({ repoRoot: root, authorIdentity: 'proposal-author', candidateRoot: 'candidate', baselineRoot: 'baseline', statements: { 'image.png': 'Changed the selected row emphasis intentionally.' } })
  writeJson(join(root, 'proposal.json'), proposal)
  assert.throws(() => runVisualBaselineCli(['check', '--root', root, '--proposal', 'proposal.json']), /pending visual changes require --review/)
  const selfReport = {
    schemaVersion: 1,
    kind: 'human-visual-baseline-review',
    proposalDigest: proposal.proposalDigest,
    decision: 'approved',
    reviewer: 'made-up-reviewer',
    reviewedAt: '2026-07-22T01:00:00.000Z',
    images: expectedVisualReviewImages(proposal),
    attestation: {},
  }
  assert.throws(() => validateVisualBaselineReview({ repoRoot: root, proposal, review: selfReport, now: new Date('2026-07-22T01:05:00.000Z') }), /not activated/)
  assert.throws(() => applyReviewedVisualBaseline({ repoRoot: root, proposal, review: selfReport, expectedProposalDigest: proposal.proposalDigest, modelVerifier: () => true }), /rejects caller callbacks/)
})

test('proposal, trust-policy, issuer, rogue/missing image, mode, symlink, and corrupt PNG substitution fail closed', () => {
  const root = fixture({ candidate: { 'image.png': 'new' }, baseline: { 'image.png': 'old' } })
  const reviewer = authority('human-reviewer', 'trusted-human-reviewer', 'visual-baseline-reviewer')
  activateTrust(root, { human: reviewer })
  const proposal = planVisualBaseline({ repoRoot: root, authorIdentity: 'proposal-author', candidateRoot: 'candidate', baselineRoot: 'baseline', statements: { 'image.png': 'Updated the reviewed field focus treatment.' } })
  writeFileSync(join(root, 'candidate/rogue.png'), png('rogue'))
  assert.throws(() => checkVisualBaseline({ repoRoot: root, proposal }), /candidate inventory changed/)

  const poisoned = fixture({ candidate: { 'image.png': 'new' }, baseline: { 'image.png': 'old' } })
  symlinkSync(join(poisoned, 'candidate/image.png'), join(poisoned, 'candidate/alias.png'))
  assert.throws(() => planVisualBaseline({ repoRoot: poisoned, authorIdentity: 'proposal-author', candidateRoot: 'candidate', baselineRoot: 'baseline', statements: {} }), /symbolic link/)

  const corrupt = fixture({ candidate: { 'image.png': 'new' }, baseline: { 'image.png': 'old' } })
  writeFileSync(join(corrupt, 'candidate/image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))
  assert.throws(() => planVisualBaseline({ repoRoot: corrupt, authorIdentity: 'proposal-author', candidateRoot: 'candidate', baselineRoot: 'baseline', statements: { 'image.png': 'Corrupt candidate must never be accepted.' } }), /complete CRC-valid decodable PNG/)

  const swapped = fixture({ candidate: { 'image.png': 'new' }, baseline: { 'image.png': 'old' } })
  activateTrust(swapped, { human: reviewer })
  const swappedProposal = planVisualBaseline({ repoRoot: swapped, authorIdentity: 'proposal-author', candidateRoot: 'candidate', baselineRoot: 'baseline', statements: { 'image.png': 'Updated the reviewed content hierarchy and spacing.' } })
  chmodSync(join(swapped, 'baseline/image.png'), 0o700)
  assert.throws(() => checkVisualBaseline({ repoRoot: swapped, proposal: swappedProposal }), /partial, rogue, missing, or concurrently changed/)
  chmodSync(join(swapped, 'baseline/image.png'), 0o644)
  writeFileSync(join(swapped, 'governance/visual-baseline-review-policy.json'), '{}\n')
  assert.throws(() => validateVisualBaselineReview({ repoRoot: swapped, proposal: swappedProposal, review: signedHumanReview(swappedProposal, reviewer), now: new Date('2026-07-22T01:05:00.000Z') }), /invalid or open shape/)
})

test('digest-only pseudo activation cannot enable managed model review', () => {
  const root = fixture({ candidate: { 'image.png': 'new' }, baseline: { 'image.png': 'old' } })
  const managed = authority('managed-runtime', 'managed-runtime-subject', 'runtime-evidence-issuer')
  activateTrust(root, { managed, role: 'authority' })
  assert.throws(() => planVisualBaseline({
    repoRoot: root,
    authorIdentity: 'proposal-author',
    candidateRoot: 'candidate',
    baselineRoot: 'baseline',
    statements: { 'image.png': 'Digest strings cannot activate managed visual review.' },
  }), /reserved but not activated.*canonical signed model-broker receipt validators/)
})
