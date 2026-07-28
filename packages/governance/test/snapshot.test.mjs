import assert from 'node:assert/strict'
import { chmod, cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  EXTERNAL_ACTIVATION_CARRIER_PATH,
  PROVIDER_CERTIFICATION_CARRIER_PATH,
  REVIEW_CAPABILITY_CERTIFICATION_CARRIER_PATH,
  projectGovernanceCarrierBytes,
} from '../src/carrier-projection.mjs'
import { inspectContract, sourceRecords } from '../src/contract.mjs'
import { checkRepository, generateRepository } from '../src/snapshot.mjs'
import { cleanup, makeRepository, repositoryMetadata, write } from './helpers.mjs'

async function generatedRepository(t) {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))
  const generated = await generateRepository({ repoRoot })
  assert.equal(generated.outcome, 'PASS')
  return repoRoot
}

function hasKind(value, kind) {
  return value.diagnostics.some((item) => item.evidence.kind === kind)
}

test('check is read-only and passes with hooks disabled', async (t) => {
  const repoRoot = await generatedRepository(t)
  const before = await repositoryMetadata(repoRoot)
  const checked = await checkRepository({ repoRoot, hooksOff: true })
  const after = await repositoryMetadata(repoRoot)
  assert.equal(checked.outcome, 'PASS')
  assert.equal(checked.data.hooksOff, true)
  assert.equal(after, before)
})

test('check rejects missing, extra, tampered, and wrong-mode files', async (t) => {
  const repoRoot = await generatedRepository(t)
  const controlPlane = resolve(repoRoot, 'governance/generated/control-plane.json')

  await rm(controlPlane)
  assert.equal(hasKind(await checkRepository({ repoRoot }), 'missing-file'), true)

  await generateRepository({ repoRoot })
  await write(repoRoot, 'governance/generated/extra.txt', 'unexpected\n')
  assert.equal(hasKind(await checkRepository({ repoRoot }), 'extra-file'), true)

  await generateRepository({ repoRoot })
  await writeFile(controlPlane, 'tampered\n')
  assert.equal(hasKind(await checkRepository({ repoRoot }), 'content-hash-mismatch'), true)

  await generateRepository({ repoRoot })
  const adapter = resolve(repoRoot, 'governance/generated/adapters/claude-hook.mjs')
  await chmod(adapter, 0o644)
  assert.equal(hasKind(await checkRepository({ repoRoot }), 'mode-mismatch'), true)
})

test('lock is external to the snapshot and participates in exact checking', async (t) => {
  const repoRoot = await generatedRepository(t)
  await writeFile(resolve(repoRoot, 'governance/control-plane.lock.json'), '{}\n')
  const checked = await checkRepository({ repoRoot })
  assert.equal(checked.outcome, 'FAIL')
  assert.equal(hasKind(checked, 'content-hash-mismatch'), true)
})

test('canonical sources and generated targets reject symlink redirection outside the repository', async (t) => {
  const sourceRepo = await makeRepository()
  const externalSourceDirectory = await mkdtemp(resolve(tmpdir(), 'qijenchen-governance-source-link-'))
  t.after(() => cleanup(sourceRepo))
  t.after(() => rm(externalSourceDirectory, { recursive: true, force: true }))
  const externalSource = resolve(externalSourceDirectory, 'AGENTS.md')
  await writeFile(externalSource, 'outside authority\n')
  await rm(resolve(sourceRepo, 'AGENTS.md'))
  await symlink(externalSource, resolve(sourceRepo, 'AGENTS.md'))
  const sourceCheck = await checkRepository({ repoRoot: sourceRepo })
  assert.equal(sourceCheck.outcome, 'FAIL')
  assert.equal(hasKind(sourceCheck, 'canonical-source-path'), true)

  const outputRepo = await makeRepository()
  const externalOutputDirectory = await mkdtemp(resolve(tmpdir(), 'qijenchen-governance-output-link-'))
  t.after(() => cleanup(outputRepo))
  t.after(() => rm(externalOutputDirectory, { recursive: true, force: true }))
  await rm(resolve(outputRepo, 'governance'), { recursive: true, force: true })
  await symlink(externalOutputDirectory, resolve(outputRepo, 'governance'))
  const generated = await generateRepository({ repoRoot: outputRepo })
  assert.equal(generated.outcome, 'FAIL')
  assert.equal(hasKind(generated, 'unsafe-path'), true)
  assert.deepEqual(await readdir(externalOutputDirectory), [])
})

test('manifest source exclusions are the single digest boundary for generated subtrees', async (t) => {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))
  const inspected = await inspectContract({ repoRoot })
  assert.ok(inspected.contract)
  assert.equal(inspected.diagnostics.some(item => ['FAIL', 'BLOCK', 'ERROR'].includes(item.outcome)), false)

  await write(repoRoot, 'scripts/generated/exclusion-sentinel.mjs', 'one\n')
  const first = (await sourceRecords(inspected.contract)).find(record => record.id === 'repository-automation-corpus')
  await write(repoRoot, 'scripts/generated/exclusion-sentinel.mjs', 'two\n')
  const second = (await sourceRecords(inspected.contract)).find(record => record.id === 'repository-automation-corpus')
  assert.equal(second.hash, first.hash, 'excluded generated bytes must not affect the canonical scripts digest')
  assert.deepEqual(second.excludes, ['scripts/generated/'])

  await write(repoRoot, 'scripts/source-sentinel.mjs', 'canonical\n')
  const third = (await sourceRecords(inspected.contract)).find(record => record.id === 'repository-automation-corpus')
  assert.notEqual(third.hash, second.hash, 'non-excluded script bytes must remain canonical inputs')
})

test('manifest source paths have exactly one canonical owner id', async (t) => {
  const repoRoot = await makeRepository()
  t.after(() => cleanup(repoRoot))
  const canonicalFixture = resolve(repoRoot, 'canonical-manifest-fixture')
  await cp(new URL('../canonical', import.meta.url), canonicalFixture, { recursive: true })
  const manifestPath = resolve(canonicalFixture, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.sources.push({
    ...manifest.sources[0],
    id: `${manifest.sources[0].id}-ambiguous-owner`,
  })
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const inspected = await inspectContract({ repoRoot, manifestPath })
  assert.ok(inspected.diagnostics.some(item => (
    item.evidence.kind === 'duplicate-id'
      && item.evidence.path === 'source-path'
      && item.message.includes('Duplicate source-path identifier')
  )))
})

test('carrier projections exclude only production-written state and retain immutable policy axes', () => {
  const activation = {
    $schema: 'schemas/external-activation-requirements.schema.json',
    schemaVersion: 4,
    policy: { path: 'infra/governance/external-activation-policy.json', sha256: 'a'.repeat(64) },
    requirements: [{
      id: 'example',
      kind: 'github-repository',
      repository: 'example/repository',
      desiredPath: 'desired.json#/example',
      requiredFor: ['objective-completion'],
      status: 'not-activated',
      evidence: null,
      observedAt: null,
      expiresAt: null,
      condition: 'Exact signed readback is required.',
      reason: 'Mutable state must not redefine policy.',
    }],
  }
  const projectActivation = value => projectGovernanceCarrierBytes({
    path: EXTERNAL_ACTIVATION_CARRIER_PATH,
    projectionId: 'external-activation-state-v1',
    bytes: Buffer.from(JSON.stringify(value)),
  })
  const activated = structuredClone(activation)
  Object.assign(activated.requirements[0], {
    status: 'activated',
    evidence: { signed: true },
    observedAt: '2026-07-25T00:00:00.000Z',
    expiresAt: '2026-07-26T00:00:00.000Z',
  })
  assert.deepEqual(projectActivation(activated), projectActivation(activation))
  const staticActivationDrift = structuredClone(activated)
  staticActivationDrift.requirements[0].reason = 'Substituted policy.'
  assert.notDeepEqual(projectActivation(staticActivationDrift), projectActivation(activation))

  const certification = {
    $schema: '../schemas/provider-surface-certification.schema.json',
    schemaVersion: 2,
    certifications: [{
      id: 'example-cli-local-v1',
      provider: 'example',
      runtimeKind: 'example-cli',
      providerVersion: '1.2.3',
      adapterVersion: 'governance-protocol-1',
      surface: 'local',
      repositoryRole: 'authority',
      status: 'not-certified',
      platformMatrix: [{
        id: 'linux-x64-native',
        operatingSystem: 'linux',
        platform: 'linux',
        arch: 'x64',
        executionEnvironment: 'native',
        distributionVersion: '1.2.3',
        pathClass: 'no-space',
        status: 'not-certified',
        limitations: ['No signed evidence.'],
      }],
      checks: [],
      limitations: ['No signed evidence.'],
    }],
  }
  const projectCertification = value => projectGovernanceCarrierBytes({
    path: PROVIDER_CERTIFICATION_CARRIER_PATH,
    projectionId: 'provider-certification-state-v1',
    bytes: Buffer.from(JSON.stringify(value)),
  })
  const certified = structuredClone(certification)
  Object.assign(certified.certifications[0], {
    status: 'certified',
    checks: [{ id: 'external-runtime-evidence-linux-x64-native', status: 'pass' }],
    limitations: [],
  })
  Object.assign(certified.certifications[0].platformMatrix[0], {
    status: 'certified',
    limitations: [],
    certifiedAt: '2026-07-25T00:00:00.000Z',
    expiresAt: '2026-07-26T00:00:00.000Z',
    runtimeEvidence: { artifactSha256: 'b'.repeat(64) },
  })
  assert.deepEqual(projectCertification(certified), projectCertification(certification))
  for (const mutate of [
    value => { value.certifications[0].providerVersion = '1.2.4' },
    value => { value.certifications[0].platformMatrix[0].distributionVersion = '1.2.4' },
    value => { value.certifications[0].adapterVersion = 'governance-protocol-2' },
    value => { value.certifications[0].certifiedAt = '2026-07-25T00:00:00.000Z' },
  ]) {
    const drifted = structuredClone(certified)
    mutate(drifted)
    assert.notDeepEqual(projectCertification(drifted), projectCertification(certification))
  }

  const reviewCapabilityCertification = {
    $schema: '../schemas/review-capability-certifications.schema.json',
    schemaVersion: 1,
    kind: 'review-capability-certification-ledger',
    certifications: [],
  }
  const projectReviewCapabilityCertification = value =>
    projectGovernanceCarrierBytes({
      path: REVIEW_CAPABILITY_CERTIFICATION_CARRIER_PATH,
      projectionId: 'review-capability-certification-state-v1',
      bytes: Buffer.from(JSON.stringify(value)),
    })
  const certifiedReviewCapability =
    structuredClone(reviewCapabilityCertification)
  certifiedReviewCapability.certifications.push({
    id: 'claude-maximum-review',
    reviewProfileId: 'claude-max-code-opus',
    reviewProfileDigest: 'c'.repeat(64),
    providerId: 'claude',
    modelReleaseId: 'claude/claude-opus',
    entitlementId: 'claude-max',
    status: 'certified',
    assuranceTier: 'maximum',
    reasoningTier: 'maximum',
    computeTier: 'maximum',
    certifiedAt: '2026-07-25T00:00:00.000Z',
    expiresAt: '2026-07-26T00:00:00.000Z',
    evidence: {
      reference:
        `infra/governance/evidence/review-capability/${'d'.repeat(64)}.json`,
      sha256: 'd'.repeat(64),
    },
  })
  assert.deepEqual(
    projectReviewCapabilityCertification(certifiedReviewCapability),
    projectReviewCapabilityCertification(reviewCapabilityCertification),
  )
  const openReviewCapability =
    structuredClone(certifiedReviewCapability)
  openReviewCapability.certifications[0].unreviewed = true
  assert.throws(
    () => projectReviewCapabilityCertification(openReviewCapability),
    /invalid or open shape/,
  )
})

test('carrier projections reject ambiguous or non-canonical JSON bytes', () => {
  const duplicate = Buffer.from(
    '{"$schema":"schemas/external-activation-requirements.schema.json","schemaVersion":4,"schemaVersion":4,"policy":{},"requirements":[]}',
  )
  const project = bytes => projectGovernanceCarrierBytes({
    path: EXTERNAL_ACTIVATION_CARRIER_PATH,
    projectionId: 'external-activation-state-v1',
    bytes,
  })
  assert.throws(() => project(duplicate), /duplicate object key/)
  assert.throws(() => project(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), duplicate])), /UTF-8 BOM/)
  assert.throws(() => project(Buffer.from([0xc3, 0x28])), /not canonical UTF-8/)
})
