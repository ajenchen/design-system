#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import {
  externalActivationPolicyDigest,
  loadExternalActivationPolicy,
  resolveExternalActivationProfile,
} from '../infra/governance/lib/external-activation.mjs'
import { issuerRegistryDigest } from '../infra/governance/lib/issuer-registry.mjs'
import {
  bootstrapCommentBody,
  cosignPrivilegedChangeAuthorization,
  issuePrivilegedChangeAuthorization,
  privilegedChangeSet,
  validateControlPlaneGenesisChallengeTransition,
  verifyPrivilegedChange,
} from './verify-privileged-change.mjs'
import {
  CONTROL_PLANE_GENESIS_BASE_COMMIT,
  CONTROL_PLANE_GENESIS_BASE_TREE,
  CONTROL_PLANE_GENESIS_CLOSED_STATE,
  CONTROL_PLANE_GENESIS_OPEN_STATE,
  CONTROL_PLANE_GENESIS_TOMBSTONES,
  controlPlaneGenesisTransitionDigest,
} from './lib/control-plane-genesis-transition.mjs'

const BASE_SHA = '1'.repeat(40)
const HEAD_SHA = '2'.repeat(40)
const REPOSITORY = 'ajenchen/design-system'
const NOW = new Date('2026-07-20T00:30:00Z')
const PRODUCTION_PROFILE = 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM'
const MAXIMUM_PROFILE = 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM'
const canonicalClaudeCapabilityProbeChecks = JSON.parse(readFileSync(
  join(import.meta.dirname, '../infra/governance/providers/runtime-conformance.json'),
  'utf8',
)).providers
  .find(provider => provider.id === 'claude')
  .checks
  .filter(check => check.driver === 'claude-review-capability-probe')
const protectedFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  '.github/workflows/governance-anchor.yml',
  '.github/workflows/release.yml',
  '.github/workflows/release-finalize.yml',
  '.github/workflows/changeset-version.yml',
  'scripts/release-npm-publish.mjs',
]

function genesisCandidateFixture() {
  const outer = mkdtempSync(join(tmpdir(), 'control-plane-genesis-candidate-'))
  const repository = join(outer, 'repository')
  const clone = spawnSync('git', ['clone', '--shared', '--quiet', process.cwd(), repository], {
    encoding: 'utf8',
  })
  assert.equal(clone.status, 0, clone.stderr)
  for (const tombstone of CONTROL_PLANE_GENESIS_TOMBSTONES) {
    const target = join(repository, tombstone.path)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(process.cwd(), tombstone.path), target)
    chmodSync(target, tombstone.mode === '100755' ? 0o755 : 0o644)
  }
  return {
    repository,
    cleanup: () => rmSync(outer, { recursive: true, force: true }),
  }
}

function issuer(name, roles = ['privileged-change-authorizer', 'root-rotator', 'runtime-evidence-issuer', 'apply-authorizer', 'completion-attestor']) {
  const keys = generateKeyPairSync('ed25519')
  return {
    keys,
    record: {
      keyId: `fixture-${name}`,
      subject: `reviewer-${name}`,
      publicKeySpki: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      roles,
      status: 'active',
      notBefore: '2026-01-01T00:00:00.000Z',
      notAfter: '2030-01-01T00:00:00.000Z',
      revokedAt: null,
    },
  }
}

function registry(records) {
  return {
    $schema: '../schemas/issuer-registry.schema.json',
    schemaVersion: 1,
    algorithm: 'ed25519',
    issuers: records,
  }
}

function trustDocuments(records, {
  bootstrap = records.length === 0,
  quorum = 1,
  profileId = PRODUCTION_PROFILE,
  privilegedAllowedKeyIds = null,
} = {}) {
  const issuers = registry(records)
  const digest = issuerRegistryDigest(issuers)
  const allowedKeyIds = privilegedAllowedKeyIds ?? records
    .filter(item => item.roles.includes('privileged-change-authorizer') && item.roles.includes('root-rotator'))
    .map(item => item.keyId)
  const rolloutKeyIds = records
    .filter(item => item.roles.includes('apply-authorizer') && item.roles.includes('completion-attestor'))
    .map(item => item.keyId)
  const runtimeKeyIds = records
    .filter(item => item.roles.includes('runtime-evidence-issuer'))
    .map(item => item.keyId)
  const releaseTagKeyIds = records
    .filter(item => item.roles.length === 1 && item.roles[0] === 'release-tag-authorizer')
    .map(item => item.keyId)
  const externalActivationPolicy = structuredClone(loadExternalActivationPolicy())
  externalActivationPolicy.activeProfile = profileId
  const activationPolicyDigest = externalActivationPolicyDigest(externalActivationPolicy)
  const externalActivationProfile = resolveExternalActivationProfile(externalActivationPolicy, {
    expectedPolicyDigest: activationPolicyDigest,
    profileId,
  })
  return {
    externalActivationPolicy,
    issuers,
    policy: {
      $schema: 'schemas/privileged-trust-roots.schema.json',
      schemaVersion: 2,
      repository: REPOSITORY,
      algorithm: 'ed25519',
      externalActivationPolicyDigest: activationPolicyDigest,
      authorizationProfileId: externalActivationProfile.id,
      authorizationProfileDigest: externalActivationProfile.sha256,
      maxAuthorizationTtlMinutes: 60,
      clockSkewSeconds: 0,
      authorizationDirectory: 'governance/authorizations',
      issuerRegistryDigest: digest,
      allowedKeyIds,
      trustRootQuorum: quorum,
      bootstrap: { schemaVersion: 1, enabled: bootstrap, ownerLogins: ['ajenchen'], nonce: 'fixture-bootstrap-nonce-v1', maxCommentTtlMinutes: 30 },
      protectedPaths: protectedFiles.filter(path => path.startsWith('.github/') || !path.includes('/')),
      protectedPrefixes: ['infra/governance/', 'packages/governance/', 'scripts/'],
    },
    rings: {
      schemaVersion: 3,
      attestationPolicy: {
        schemaVersion: 1,
        algorithm: 'ed25519',
        maxAuthorizationTtlMinutes: 60,
        maxCompletionTtlMinutes: 10080,
        clockSkewSeconds: 0,
        issuerRegistryDigest: digest,
        allowedKeyIds: rolloutKeyIds,
        applyAuthorizationQuorum: 1,
        completionAttestationQuorum: 1,
      },
    },
    runtime: {
      $schema: '../schemas/runtime-conformance-profile.schema.json',
      schemaVersion: 5,
      evidenceOutput: 'runtime/provider-runtime-conformance.json',
      timeoutMs: 45000,
      maxOutputBytes: 1048576,
      maxEvidenceAgeSeconds: 86400,
      issuerRegistryDigest: digest,
      allowedKeyIds: runtimeKeyIds,
      requiredIssuerQuorum: 1,
      platformPolicy: {
        nativeWindows: 'unsupported',
        windowsLinuxExecutionEnvironments: ['wsl2', 'devcontainer'],
        pathClasses: ['no-space', 'contains-space'],
      },
      providers: [
        {
          id: 'claude', runtimeKind: 'claude-code-cli', certificationSurface: 'local', executable: 'claude', versionArguments: ['--version'],
          adapterProviderId: 'claude', executionMode: 'local-probe', evidenceKind: 'provider-runtime-conformance', surfacePolicy: { kind: 'local-probe' },
          distributionVersionAuthority: { kind: 'profile-external-certification', version: '2.1.215' },
          certificationTargets: [{
            id: 'linux-linux-x64-native-no-space', operatingSystem: 'linux', platform: 'linux', arch: 'x64',
            executionEnvironment: 'native', distributionVersion: '2.1.215', pathClass: 'no-space',
          }],
          checks: [
            ...structuredClone(canonicalClaudeCapabilityProbeChecks),
            { id: 'provider-hook-adapter-block', driver: 'provider-hook-adapter', requiresModel: false },
          ],
        },
        {
          id: 'codex', runtimeKind: 'codex-cli', certificationSurface: 'local', executable: 'codex', versionArguments: ['--version'],
          adapterProviderId: 'codex', executionMode: 'local-probe', evidenceKind: 'provider-runtime-conformance', surfacePolicy: { kind: 'local-probe' },
          distributionVersionAuthority: { kind: 'profile-external-certification', version: '1.0.0' },
          certificationTargets: [{
            id: 'linux-linux-x64-native-no-space', operatingSystem: 'linux', platform: 'linux', arch: 'x64',
            executionEnvironment: 'native', distributionVersion: '1.0.0', pathClass: 'no-space',
          }],
          checks: [{ id: 'provider-hook-adapter-block', driver: 'provider-hook-adapter', requiresModel: false }],
        },
      ],
    },
    releaseTag: {
      $schema: 'schemas/release-tag-authorization-policy.schema.json',
      schemaVersion: 2,
      repository: REPOSITORY,
      algorithm: 'ed25519',
      externalActivationPolicyDigest: activationPolicyDigest,
      authorizationProfileId: externalActivationProfile.id,
      authorizationProfileDigest: externalActivationProfile.sha256,
      releaseAuthorization: structuredClone(externalActivationProfile.releaseAuthorization),
      maxAuthorizationTtlMinutes: 60,
      clockSkewSeconds: 0,
      issuerRegistryDigest: digest,
      allowedKeyIds: releaseTagKeyIds,
      requiredSignerQuorum: externalActivationProfile.releaseAuthorization.minimumSignerQuorum,
    },
  }
}

function fixture({
  signer = false,
  quorum = 1,
  profileId = PRODUCTION_PROFILE,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'privileged-change-'))
  const trusted = join(root, 'trusted')
  const candidate = join(root, 'candidate')
  const write = (base, path, content) => {
    const target = join(base, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  for (const path of protectedFiles) {
    write(trusted, path, `trusted:${path}\n`)
    write(candidate, path, `trusted:${path}\n`)
  }
  const signerRecord = signer ? issuer('key') : null
  const releaseSigners = [
    issuer('release-one', ['release-tag-authorizer']),
    issuer('release-two', ['release-tag-authorizer']),
  ]
  const install = (base, records, options = {}) => {
    const bootstrap = options.bootstrap ?? records.length === 0
    const installedRecords = bootstrap
      ? records
      : [...records, ...releaseSigners.map(item => item.record).filter(record => !records.some(item => item.keyId === record.keyId))]
    const documents = trustDocuments(installedRecords, {
      quorum,
      profileId,
      ...options,
      bootstrap,
    })
    write(base, 'infra/governance/external-activation-policy.json', `${JSON.stringify(documents.externalActivationPolicy, null, 2)}\n`)
    write(base, 'infra/governance/trust/issuers.json', `${JSON.stringify(documents.issuers, null, 2)}\n`)
    write(base, 'infra/governance/privileged-trust-roots.json', `${JSON.stringify(documents.policy, null, 2)}\n`)
    write(base, 'infra/governance/release-rings.json', `${JSON.stringify(documents.rings, null, 2)}\n`)
    write(base, 'infra/governance/providers/runtime-conformance.json', `${JSON.stringify(documents.runtime, null, 2)}\n`)
    write(base, 'infra/governance/release-tag-authorization-policy.json', `${JSON.stringify(documents.releaseTag, null, 2)}\n`)
    write(base, 'packages/governance/canonical/manifest.json', `${JSON.stringify({
      schemaVersion: 1,
      sources: [
        { id: 'agent-bootstrap', path: 'AGENTS.md', required: true },
        { id: 'claude-adapter', path: 'CLAUDE.md', required: true },
        { id: 'privileged-script', path: 'scripts/release-npm-publish.mjs', required: true },
      ],
    }, null, 2)}\n`)
    return documents
  }
  for (const base of [trusted, candidate]) install(base, signerRecord ? [signerRecord.record] : [], { bootstrap: !signerRecord })
  return { trusted, candidate, keys: signerRecord?.keys, signer: signerRecord, releaseSigners, write, install }
}

test('unchanged privileged executable closure needs no authorization', async () => {
  const { trusted, candidate } = fixture()
  const result = await verifyPrivilegedChange({ trustedRoot: trusted, candidateRoot: candidate, repository: REPOSITORY, baseSha: BASE_SHA, candidateHeadSha: HEAD_SHA, now: NOW })
  assert.deepEqual(result.changedPaths, [])
})

// 3B(2026-07-29 user 拍板):per-PR Ed25519 授權與 owner-comment bootstrap 拆除 ——
// head-sha 命名 + 同 head 提交的綁定是密碼學不動點(不可滿足);保留 closure /
// changedPaths 聯集 / registry append-only lineage 結構驗證 + protected required checks。
test('privileged trust-config installation verifies structurally without owner-comment bootstrap(3B)', async () => {
  const root = fixture()
  const signer = issuer('one')
  const documents = root.install(root.candidate, [signer.record], { bootstrap: false })
  const result = await verifyPrivilegedChange({ trustedRoot: root.trusted, candidateRoot: root.candidate, repository: REPOSITORY, baseSha: BASE_SHA, candidateHeadSha: HEAD_SHA, pullRequest: 42, now: new Date('2026-07-20T00:10:00Z') })
  assert.equal(result.authorized, true)
  assert.equal(result.authorization, null)
  assert.ok(result.changedPaths.includes('infra/governance/trust/issuers.json'))
  assert.deepEqual(documents.policy.allowedKeyIds, [signer.record.keyId])
  assert.equal(documents.policy.trustRootQuorum, 1)
  assert.equal(documents.releaseTag.allowedKeyIds.length, 2, 'functional release-only fixture keys remain outside the privileged allowlist')
})

test('single-owner bootstrap rejects multiple privileged/root keys rather than inventing custodian independence', async () => {
  const root = fixture()
  const signers = [issuer('single-owner-duplicate-one'), issuer('single-owner-duplicate-two')]
  root.install(root.candidate, signers.map(item => item.record), { bootstrap: false })
  await assert.rejects(
    privilegedChangeSet({ trustedRoot: root.trusted, candidateRoot: root.candidate }),
    /requires exactly one governed key carrying both privileged-change-authorizer and root-rotator roles/,
  )
})

test('maximum-assurance bootstrap fails closed below two distinct privileged/root signer subjects', async () => {
  const root = fixture({ quorum: 2, profileId: MAXIMUM_PROFILE })
  const signer = issuer('maximum-only-one')
  root.install(root.candidate, [signer.record], { bootstrap: false })
  await assert.rejects(
    privilegedChangeSet({ trustedRoot: root.trusted, candidateRoot: root.candidate }),
    /lacks quorum 2 for privileged-change-authorizer|lacks quorum 2 for root-rotator/,
  )
})

test('privileged trust policy is content-addressed to the active canonical assurance profile', async () => {
  const mutations = [
    {
      label: 'external policy digest',
      mutate: policy => { policy.externalActivationPolicyDigest = 'd'.repeat(64) },
      pattern: /external activation policy digest is stale or substituted/,
    },
    {
      label: 'active profile identity',
      mutate: policy => { policy.authorizationProfileId = MAXIMUM_PROFILE },
      pattern: /profile differs from the active canonical profile/,
    },
    {
      label: 'active profile digest',
      mutate: policy => { policy.authorizationProfileDigest = 'e'.repeat(64) },
      pattern: /profile digest is stale or substituted/,
    },
    {
      label: 'single-owner quorum widening',
      mutate: policy => { policy.trustRootQuorum = 2 },
      pattern: /quorum is invalid for profile PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM/,
    },
  ]
  for (const mutation of mutations) {
    const root = fixture({ signer: true })
    const policyPath = join(root.candidate, 'infra/governance/privileged-trust-roots.json')
    const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
    mutation.mutate(policy)
    writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
    await assert.rejects(
      privilegedChangeSet({ trustedRoot: root.trusted, candidateRoot: root.candidate }),
      mutation.pattern,
      mutation.label,
    )
  }
})

test('canonical source keeps genesis and ordinary bootstrap free of a raw two-registry-key gate', () => {
  const source = readFileSync(join(process.cwd(), 'scripts/verify-privileged-change.mjs'), 'utf8')
  assert.doesNotMatch(source, /requireTwoRegistryKeys|registry\.issuers\.length\s*>=\s*2|at least two independent registry keys/)
  const policy = JSON.parse(readFileSync(join(process.cwd(), 'infra/governance/privileged-trust-roots.json'), 'utf8'))
  assert.equal(policy.authorizationProfileId, PRODUCTION_PROFILE)
  assert.equal(policy.trustRootQuorum, 1)
})

test('control-plane genesis requires the open transition and verifies its exact base binding', () => {
  const repository = process.cwd()
  const graph = JSON.parse(readFileSync(join(repository, 'scripts/governance-build-graph.json'), 'utf8'))
  const transition = graph.controlPlaneGenesisTransition
  const validated = validateControlPlaneGenesisChallengeTransition({
    candidateRoot: repository,
    transition,
    baseSha: CONTROL_PLANE_GENESIS_BASE_COMMIT,
    baseTree: CONTROL_PLANE_GENESIS_BASE_TREE,
  })
  assert.equal(validated.state, CONTROL_PLANE_GENESIS_OPEN_STATE)
  assert.equal(validated.releaseAllowed, false)
})

test('control-plane genesis challenge binds exact transition after-images', t => {
  const fixture = genesisCandidateFixture()
  t.after(fixture.cleanup)
  const graph = JSON.parse(readFileSync(join(process.cwd(), 'scripts/governance-build-graph.json'), 'utf8'))
  const transition = graph.controlPlaneGenesisTransition
  const verify = () => validateControlPlaneGenesisChallengeTransition({
    candidateRoot: fixture.repository,
    transition,
    baseSha: CONTROL_PLANE_GENESIS_BASE_COMMIT,
    baseTree: CONTROL_PLANE_GENESIS_BASE_TREE,
  })
  assert.doesNotThrow(verify)

  const command = join(fixture.repository, '.claude/commands/gov-status.md')
  const commandBytes = readFileSync(command)
  writeFileSync(command, Buffer.concat([commandBytes, Buffer.from('\n')]))
  assert.throws(verify, /tombstone digest drift/)
  writeFileSync(command, commandBytes)

  const hook = join(fixture.repository, '.claude/hooks/check_post_main_ssot_propagate.sh')
  chmodSync(hook, 0o644)
  assert.throws(verify, /tombstone mode drift/)
  chmodSync(hook, 0o755)
  unlinkSync(hook)
  symlinkSync('../commands/gov-status.md', hook)
  assert.throws(verify, /tombstone is not one regular file/)
  unlinkSync(hook)
  copyFileSync(join(process.cwd(), '.claude/hooks/check_post_main_ssot_propagate.sh'), hook)
  chmodSync(hook, 0o755)

  const baselineLeaf = join(
    fixture.repository,
    '.claude/snapshots-baseline/cell-picker-final-post-select-canary/select-display-hover.png',
  )
  const baselineBytes = readFileSync(baselineLeaf)
  writeFileSync(baselineLeaf, Buffer.concat([baselineBytes, Buffer.from('\n')]))
  assert.throws(verify, /preserved tree digest drift/)
  writeFileSync(baselineLeaf, baselineBytes)

  const preamble = join(fixture.repository, 'packages/design-system/ds-canonical/fork/preamble.md')
  chmodSync(preamble, 0o755)
  assert.throws(verify, /preserved file mode drift/)
  chmodSync(preamble, 0o644)

  const scriptsAlias = join(fixture.repository, 'packages/design-system/scripts')
  assert.equal(readlinkSync(scriptsAlias), '../../scripts')
  unlinkSync(scriptsAlias)
  symlinkSync('../scripts', scriptsAlias)
  assert.throws(verify, /preserved symlink target drift/)
})

test('control-plane genesis rejects a closed transition and a substituted challenge base', () => {
  const repository = process.cwd()
  const graph = JSON.parse(readFileSync(join(repository, 'scripts/governance-build-graph.json'), 'utf8'))
  const transition = graph.controlPlaneGenesisTransition
  const closed = structuredClone(transition)
  closed.state = CONTROL_PLANE_GENESIS_CLOSED_STATE
  closed.releaseAllowed = true
  closed.contentDigest = controlPlaneGenesisTransitionDigest(closed)
  assert.throws(
    () => validateControlPlaneGenesisChallengeTransition({
      candidateRoot: repository,
      transition: closed,
      baseSha: CONTROL_PLANE_GENESIS_BASE_COMMIT,
      baseTree: CONTROL_PLANE_GENESIS_BASE_TREE,
    }),
    /transition must remain open/,
  )
  for (const [baseSha, baseTree] of [
    ['0'.repeat(40), CONTROL_PLANE_GENESIS_BASE_TREE],
    [CONTROL_PLANE_GENESIS_BASE_COMMIT, '0'.repeat(40)],
  ]) {
    assert.throws(
      () => validateControlPlaneGenesisChallengeTransition({
        candidateRoot: repository,
        transition,
        baseSha,
        baseTree,
      }),
      /transition base commit\/tree differs from the exact challenge base/,
    )
  }
})

test('maximum-assurance registry rotation and revocation require the existing multi-signer root-rotator quorum', async () => {
  const root = fixture({ quorum: 2, profileId: MAXIMUM_PROFILE })
  const signers = [issuer('one'), issuer('two'), issuer('three')]
  for (const base of [root.trusted, root.candidate]) root.install(base, signers.slice(0, 2).map(item => item.record), { bootstrap: false })
  const revoked = { ...signers[0].record, status: 'revoked', revokedAt: '2026-07-20T00:00:00.000Z' }
  root.install(root.candidate, [revoked, signers[1].record, signers[2].record], { bootstrap: false })
  const candidatePolicyPath = join(root.candidate, 'infra/governance/privileged-trust-roots.json')
  const candidatePolicy = JSON.parse(readFileSync(candidatePolicyPath, 'utf8'))
  candidatePolicy.allowedKeyIds = [signers[1].record.keyId, signers[2].record.keyId]
  writeFileSync(candidatePolicyPath, `${JSON.stringify(candidatePolicy, null, 2)}\n`)
  for (const [path, field] of [
    ['infra/governance/release-rings.json', 'attestationPolicy'],
    ['infra/governance/providers/runtime-conformance.json', null],
  ]) {
    const target = join(root.candidate, path)
    const data = JSON.parse(readFileSync(target, 'utf8'))
    const policy = field ? data[field] : data
    policy.allowedKeyIds = [signers[1].record.keyId, signers[2].record.keyId]
    writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`)
  }
  // 3B:合法輪換 + 撤銷(append-only)結構性通過;lineage 破壞案由
  // 「issuer registry lineage is append-only」測試持續 fail-closed。
  const rotation = await verifyPrivilegedChange({ trustedRoot: root.trusted, candidateRoot: root.candidate, repository: REPOSITORY, baseSha: BASE_SHA, candidateHeadSha: HEAD_SHA, now: NOW })
  assert.equal(rotation.authorized, true)
  assert.ok(rotation.changedPaths.includes('infra/governance/trust/issuers.json'))
})

test('maximum-assurance release-tag authorization policy rotation requires the existing root-rotator quorum', async () => {
  const root = fixture({ quorum: 2, profileId: MAXIMUM_PROFILE })
  const signers = [issuer('release-policy-root-one'), issuer('release-policy-root-two')]
  for (const base of [root.trusted, root.candidate]) root.install(base, signers.map(item => item.record), { bootstrap: false })
  const releasePolicyPath = join(root.candidate, 'infra/governance/release-tag-authorization-policy.json')
  const releasePolicy = JSON.parse(readFileSync(releasePolicyPath, 'utf8'))
  releasePolicy.maxAuthorizationTtlMinutes = 61
  writeFileSync(releasePolicyPath, `${JSON.stringify(releasePolicy, null, 2)}\n`)
  // 3B:policy 檔屬特權 closure,變更以 changedPaths 精確揭露並結構性通過。
  const result = await verifyPrivilegedChange({ trustedRoot: root.trusted, candidateRoot: root.candidate, repository: REPOSITORY, baseSha: BASE_SHA, candidateHeadSha: HEAD_SHA, now: NOW })
  assert.equal(result.authorized, true)
  assert.ok(result.changedPaths.includes('infra/governance/release-tag-authorization-policy.json'))
})

test('issuer revocation is structural without ceremony time anchor and reactivation stays fail-closed(3B)', async () => {
  // 3B:無簽章 issuedAt 可錨 → 撤銷時戳只需為合法時間;不可復活/不可改寫仍 fail-closed。
  for (const revokedAt of ['2026-07-19T23:59:59.000Z', '2026-07-20T00:00:01.000Z']) {
    const root = fixture({ quorum: 1 })
    const signers = [issuer(`effective-revoked-${revokedAt.slice(17, 19)}`), issuer(`effective-authorizer-${revokedAt.slice(17, 19)}`)]
    for (const base of [root.trusted, root.candidate]) {
      root.install(base, signers.map(item => item.record), {
        bootstrap: false,
        privilegedAllowedKeyIds: [signers[1].record.keyId],
      })
    }
    root.install(root.candidate, [
      { ...signers[0].record, status: 'revoked', revokedAt },
      signers[1].record,
    ], {
      bootstrap: false,
      privilegedAllowedKeyIds: [signers[1].record.keyId],
    })
    for (const [path, field] of [
      ['infra/governance/privileged-trust-roots.json', null],
      ['infra/governance/release-rings.json', 'attestationPolicy'],
      ['infra/governance/providers/runtime-conformance.json', null],
    ]) {
      const target = join(root.candidate, path)
      const data = JSON.parse(readFileSync(target, 'utf8'))
      const policy = field ? data[field] : data
      policy.allowedKeyIds = [signers[1].record.keyId]
      writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`)
    }
    const revocation = await verifyPrivilegedChange({ trustedRoot: root.trusted, candidateRoot: root.candidate, repository: REPOSITORY, baseSha: BASE_SHA, candidateHeadSha: HEAD_SHA, now: NOW })
    assert.equal(revocation.authorized, true)
  }
  const root = fixture({ quorum: 1 })
  const signers = [issuer('reactivate-victim'), issuer('reactivate-keeper')]
  for (const base of [root.trusted, root.candidate]) {
    root.install(base, [
      { ...signers[0].record, status: 'revoked', revokedAt: '2026-07-19T00:00:00.000Z' },
      signers[1].record,
    ], {
      bootstrap: false,
      privilegedAllowedKeyIds: [signers[1].record.keyId],
    })
  }
  root.install(root.candidate, signers.map(item => item.record), {
    bootstrap: false,
    privilegedAllowedKeyIds: [signers[1].record.keyId],
  })
  await assert.rejects(
    verifyPrivilegedChange({ trustedRoot: root.trusted, candidateRoot: root.candidate, repository: REPOSITORY, baseSha: BASE_SHA, candidateHeadSha: HEAD_SHA, now: NOW }),
    /cannot be reactivated or rewritten/,
  )
})

test('issuer registry lineage is append-only across authorized rotations', async () => {
  for (const mutation of ['delete-historical-key', 'replace-historical-public-key']) {
    const root = fixture({ quorum: 1 })
    const signers = [issuer('lineage-one'), issuer('lineage-two')]
    for (const base of [root.trusted, root.candidate]) {
      root.install(base, signers.map(item => item.record), {
        bootstrap: false,
        privilegedAllowedKeyIds: [signers[1].record.keyId],
      })
    }
    const candidateRecords = mutation === 'delete-historical-key'
      ? [signers[1].record]
      : [{ ...signers[0].record, publicKeySpki: issuer('attacker-replacement').record.publicKeySpki }, signers[1].record]
    root.install(root.candidate, candidateRecords, {
      bootstrap: false,
      privilegedAllowedKeyIds: [signers[1].record.keyId],
    })
    const authorization = await issuePrivilegedChangeAuthorization({
      trustedRoot: root.trusted,
      candidateRoot: root.candidate,
      repository: REPOSITORY,
      baseSha: BASE_SHA,
      candidateHeadSha: HEAD_SHA,
      signerKeyId: signers[1].record.keyId,
      subject: signers[1].record.subject,
      privateKey: signers[1].keys.privateKey,
      issuedAt: '2026-07-20T00:00:00Z',
      expiresAt: '2026-07-20T01:00:00Z',
    })
    root.write(root.candidate, `governance/authorizations/${HEAD_SHA}.json`, `${JSON.stringify(authorization)}\n`)
    await assert.rejects(
      verifyPrivilegedChange({ trustedRoot: root.trusted, candidateRoot: root.candidate, repository: REPOSITORY, baseSha: BASE_SHA, candidateHeadSha: HEAD_SHA, now: NOW }),
      mutation === 'delete-historical-key' ? /missing from the append-only current registry/ : /changed immutable lineage field publicKeySpki/,
    )
  }
})

for (const path of protectedFiles) {
  test(`privileged mutation verifies closure and reports the exact changed path: ${path}`, async () => {
    // 3B:無 per-PR 簽章;守門 = closure 驗證 + changedPaths 精確揭露 + protected required checks。
    const { trusted, candidate, write } = fixture()
    write(candidate, path, `${readFileSync(join(candidate, path), 'utf8')}reviewed-step\n`)
    const result = await verifyPrivilegedChange({ trustedRoot: trusted, candidateRoot: candidate, repository: REPOSITORY, baseSha: BASE_SHA, candidateHeadSha: HEAD_SHA, now: NOW })
    assert.equal(result.authorized, true)
    assert.deepEqual(result.changedPaths, [path])
  })
}

test('stale authorization artifacts are inert data and never consulted(3B)', async () => {
  const { trusted, candidate, write } = fixture()
  write(candidate, 'scripts/release-npm-publish.mjs', 'reviewed privileged change\n')
  write(candidate, `governance/authorizations/${HEAD_SHA}.json`, 'not-even-json{{{\n')
  const result = await verifyPrivilegedChange({ trustedRoot: trusted, candidateRoot: candidate, repository: REPOSITORY, baseSha: BASE_SHA, candidateHeadSha: HEAD_SHA, now: NOW })
  assert.equal(result.authorized, true)
  assert.equal(result.authorization, null)
  assert.ok(result.changedPaths.includes('scripts/release-npm-publish.mjs'))
})

test('a newly required semantic source cannot be added outside the privileged closure', async () => {
  const root = fixture()
  const manifestPath = join(root.candidate, 'packages/governance/canonical/manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.sources.push({ id: 'unmanaged-semantics', path: 'docs/unmanaged-semantics.md', required: true })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  root.write(root.candidate, 'docs/unmanaged-semantics.md', 'malicious provider instructions\n')
  await assert.rejects(
    verifyPrivilegedChange({ trustedRoot: root.trusted, candidateRoot: root.candidate, repository: REPOSITORY, baseSha: BASE_SHA, candidateHeadSha: HEAD_SHA, now: NOW }),
    /semantic source is outside the privileged closure/,
  )
})

test('optional semantic-source downgrade cannot escape the privileged closure', async () => {
  const root = fixture()
  const manifestPath = join(root.candidate, 'packages/governance/canonical/manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.sources.push({ id: 'optional-backdoor', path: 'docs/optional-backdoor.md', required: false })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  root.write(root.candidate, 'docs/optional-backdoor.md', 'candidate-selected semantics\n')
  await assert.rejects(
    verifyPrivilegedChange({ trustedRoot: root.trusted, candidateRoot: root.candidate, repository: REPOSITORY, baseSha: BASE_SHA, candidateHeadSha: HEAD_SHA, now: NOW }),
    /semantic source is outside the privileged closure/,
  )
})

test('semantic-source closure accepts existing directory identity forms but rejects slash-alias duplication', async () => {
  const root = fixture()
  for (const base of [root.trusted, root.candidate]) {
    root.write(base, 'scripts/review-corpus/source.mjs', 'export const reviewed = true\n')
    const manifestPath = join(base, 'packages/governance/canonical/manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.sources.push({ id: 'review-corpus', path: 'scripts/review-corpus/', required: true })
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
  const accepted = await verifyPrivilegedChange({
    trustedRoot: root.trusted,
    candidateRoot: root.candidate,
    repository: REPOSITORY,
    baseSha: BASE_SHA,
    candidateHeadSha: HEAD_SHA,
    now: NOW,
  })
  assert.deepEqual(accepted.changedPaths, [])

  for (const base of [root.trusted, root.candidate]) {
    const manifestPath = join(base, 'packages/governance/canonical/manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.sources.find(source => source.id === 'review-corpus').path = 'scripts/review-corpus'
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
  const noSlashAccepted = await verifyPrivilegedChange({
    trustedRoot: root.trusted,
    candidateRoot: root.candidate,
    repository: REPOSITORY,
    baseSha: BASE_SHA,
    candidateHeadSha: HEAD_SHA,
    now: NOW,
  })
  assert.deepEqual(noSlashAccepted.changedPaths, [])

  const candidateManifestPath = join(root.candidate, 'packages/governance/canonical/manifest.json')
  const candidateManifest = JSON.parse(readFileSync(candidateManifestPath, 'utf8'))
  candidateManifest.sources.push({ id: 'review-corpus-alias', path: 'scripts/review-corpus/', required: true })
  writeFileSync(candidateManifestPath, `${JSON.stringify(candidateManifest, null, 2)}\n`)
  await assert.rejects(
    verifyPrivilegedChange({
      trustedRoot: root.trusted,
      candidateRoot: root.candidate,
      repository: REPOSITORY,
      baseSha: BASE_SHA,
      candidateHeadSha: HEAD_SHA,
      now: NOW,
    }),
    /semantic source path is invalid or duplicated/,
  )
})

test('semantic-source closure rejects symlinked path components', async () => {
  const root = fixture()
  root.write(root.candidate, 'outside/semantics.md', 'outside source\n')
  symlinkSync('outside', join(root.candidate, 'docs-link'), 'dir')
  const manifestPath = join(root.candidate, 'packages/governance/canonical/manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.sources.push({ id: 'linked-semantics', path: 'docs-link/semantics.md', required: true })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const policyPath = join(root.candidate, 'infra/governance/privileged-trust-roots.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  policy.protectedPaths.push('docs-link/semantics.md')
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
  await assert.rejects(
    verifyPrivilegedChange({ trustedRoot: root.trusted, candidateRoot: root.candidate, repository: REPOSITORY, baseSha: BASE_SHA, candidateHeadSha: HEAD_SHA, now: NOW }),
    /path contains a symlink component/,
  )
})

test('simultaneous policy and semantic-manifest extension binds the new source bytes now', async () => {
  const root = fixture({ signer: true })
  const semanticPath = 'docs/reviewed-semantics.md'
  root.write(root.candidate, semanticPath, 'reviewed semantic source\n')
  const manifestPath = join(root.candidate, 'packages/governance/canonical/manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.sources.push({ id: 'reviewed-semantics', path: semanticPath, required: true })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const policyPath = join(root.candidate, 'infra/governance/privileged-trust-roots.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  policy.protectedPaths.push(semanticPath)
  policy.protectedPaths.sort()
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)

  // 3B:聯集閉包不變量保留 —— 同時擴充 policy + manifest 時,新 source 位元組
  // 必進 changedPaths(candidate 不能靠自己加前綴讓新 source 躲出變更集)。
  const result = await verifyPrivilegedChange({ trustedRoot: root.trusted, candidateRoot: root.candidate, repository: REPOSITORY, baseSha: BASE_SHA, candidateHeadSha: HEAD_SHA, now: NOW })
  assert.equal(result.authorized, true)
  for (const path of [semanticPath, 'infra/governance/privileged-trust-roots.json', 'packages/governance/canonical/manifest.json']) {
    assert.ok(result.changedPaths.includes(path), `${path} must be inside the union-closure change set`)
  }
})

test('revoked, expired, and role-ineligible issuer policies fail closed', async () => {
  for (const mutation of [
    record => ({ ...record, status: 'revoked', revokedAt: '2026-07-20T00:00:00.000Z' }),
    record => ({ ...record, notAfter: '2026-07-20T00:01:00.000Z' }),
    record => ({ ...record, roles: ['root-rotator'] }),
  ]) {
    const root = fixture({ signer: true })
    const poisoned = mutation(root.signer.record)
    root.install(root.trusted, [poisoned], { bootstrap: false })
    await assert.rejects(
      verifyPrivilegedChange({ trustedRoot: root.trusted, candidateRoot: root.candidate, repository: REPOSITORY, baseSha: BASE_SHA, candidateHeadSha: HEAD_SHA, now: NOW }),
      /revoked|expired|lacks quorum|cannot be empty after trust activation/,
    )
  }
})
