import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { doctorRepository } from '../bin/consumerctl.mjs'
import { FixtureApiClient, reconcileFixtureTestHarness } from '../bin/reconcile-github.mjs'
import { readJson, validateInventory } from '../lib/common.mjs'
import { validateCertifications, validateDesiredGithub, validateGovernanceModel, validateProviderRegistry, validateReleaseRings } from '../lib/model-validation.mjs'
import { compareUtf8Bytes, sha256, stableStringify } from '../lib/common.mjs'
import {
  prepareClaudeReviewCapabilityProbe,
  runtimeEvidenceSigningPayload,
  runtimeTargetDigest,
} from '../lib/provider-runtime-conformance.mjs'
import { issuerRegistryDigest } from '../lib/issuer-registry.mjs'
import { PROVIDER_REGISTRY } from '../../../scripts/gen-codex-adapter.mjs'
import { createExternalRuntimeCertificationFixture } from './fixtures/external-runtime-certification-fixture.mjs'
import {
  buildRepositorySubjectProof,
  resolveLocalRepositoryIdentity,
  validateRepositorySubjectProof,
} from '../lib/repository-subject-proof.mjs'
import { certificationCarrierPolicyForRole, loadRoleSurfacePolicy } from '../lib/role-surface-policy.mjs'
import { normalizeRuntimeValidationContext } from '../lib/runtime-certification.mjs'
import {
  externalActivationPolicyDigest,
  loadExternalActivationPolicy,
} from '../lib/external-activation.mjs'

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/github')
const GOVERNANCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = resolve(GOVERNANCE_ROOT, '../..')
const inventory = readJson(resolve(FIXTURES, 'inventory.json'))
const desired = readJson(resolve(FIXTURES, 'desired.json'))
const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
const certifications = readJson(resolve(FIXTURES, 'certifications.json'))
const canonicalInventory = readJson(resolve(GOVERNANCE_ROOT, 'inventory/managed-repos.json'))
const canonicalDesired = readJson(resolve(GOVERNANCE_ROOT, 'desired/github.json'))
const canonicalRings = readJson(resolve(GOVERNANCE_ROOT, 'release-rings.json'))

// The deterministic governance entrypoint intentionally requires all three repository roles so
// workflow identities cannot name an absent source repository. Keep the focused fixture data, but
// close its topology with canonical authority/template profiles and role surfaces.
const authorityRepository = structuredClone(
  canonicalInventory.repositories.find(repository => repository.id === 'design-system'),
)
const templateRepository = structuredClone(
  canonicalInventory.repositories.find(repository => repository.id === 'ds-product-template'),
)
const productRepository = inventory.repositories[0]
productRepository.github = 'ajenchen/consumer'
productRepository.localPathFromGovernanceRoot = '../../../consumer'
inventory.authority = canonicalInventory.authority
inventory.repositories = [authorityRepository, templateRepository, productRepository]
inventory.certificationCanaries = {
  authority: { repositoryId: authorityRepository.id },
  'template-mirror': { repositoryId: templateRepository.id },
  'product-consumer': { repositoryId: productRepository.id },
}
inventory.ownershipPolicies = {
  'authority-repository': structuredClone(canonicalInventory.ownershipPolicies['authority-repository']),
  'published-template-mirror': structuredClone(canonicalInventory.ownershipPolicies['published-template-mirror']),
  'product-consumer': structuredClone(canonicalInventory.ownershipPolicies['product-consumer']),
}

desired.profiles = {
  'design-system-authority': structuredClone(canonicalDesired.profiles['design-system-authority']),
  'product-consumer': desired.profiles['product-consumer'],
  'published-template': structuredClone(canonicalDesired.profiles['published-template']),
}

const fixtureProductRing = rings.rings[0]
const fixtureCandidateDigest = rings.assignments.consumer.candidateReleaseDigest
rings.rings = [
  structuredClone(canonicalRings.rings.find(ring => ring.order === 0)),
  structuredClone(canonicalRings.rings.find(ring => ring.order === 1)),
  fixtureProductRing,
]
rings.assignments = {
  'design-system': {
    ring: authorityRepository.releaseRing,
    wave: 'canary',
    enteredAt: '2020-01-01T00:00:00Z',
    candidateReleaseDigest: fixtureCandidateDigest,
    applyAuthorization: null,
    completionAttestation: null,
    manualBlockers: [],
  },
  'ds-product-template': {
    ring: templateRepository.releaseRing,
    wave: 'canary',
    enteredAt: '2020-01-01T00:00:00Z',
    candidateReleaseDigest: fixtureCandidateDigest,
    applyAuthorization: null,
    completionAttestation: null,
    manualBlockers: [],
  },
  consumer: rings.assignments.consumer,
}

const productCertificationRecords = certifications.certifications
const templateRequiredSurfaces = new Set(templateRepository.providerSurfacesRequired)
const cloneCertificationRole = (record, role) => ({
  ...structuredClone(record),
  id: record.id.replace('-product-', `-${role.replace('-mirror', '')}-`),
  repositoryRole: role,
})
certifications.certifications = [
  ...productCertificationRecords.map(record => cloneCertificationRole(record, 'authority')),
  ...productCertificationRecords
    .filter(record => templateRequiredSurfaces.has(`${record.provider}/${record.runtimeKind}/${record.surface}`))
    .map(record => cloneCertificationRole(record, 'template-mirror')),
  ...productCertificationRecords,
]
const providerMatrix = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../providers/compatibility-matrix.json'))
const runtimeProfile = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../providers/runtime-conformance.json'))
const issuerRegistry = readJson(resolve(FIXTURES, 'issuer-registry.json'))
const fixtureIssuer = issuerRegistry.issuers.find(issuer => issuer.keyId === 'fixture-ed25519')
fixtureIssuer.roles = [...new Set([
  ...fixtureIssuer.roles,
  'runtime-evidence-issuer',
])].sort()
const fixtureIssuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
rings.attestationPolicy.issuerRegistryDigest = fixtureIssuerRegistryDigest
const fixtureRuntimeProfile = structuredClone(runtimeProfile)
fixtureRuntimeProfile.issuerRegistryDigest = fixtureIssuerRegistryDigest
fixtureRuntimeProfile.allowedKeyIds = [fixtureIssuer.keyId]
fixtureRuntimeProfile.requiredIssuerQuorum = 1
const waivers = { schemaVersion: 1, waivers: [] }
const now = new Date('2026-07-20T00:00:00Z')
const externalRuntimeKeys = generateKeyPairSync('ed25519')
const externalRuntimeIssuer = {
  keyId: 'fixture-runtime-evidence',
  subject: 'fixture-runtime-evidence',
  publicKeySpki: externalRuntimeKeys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  roles: ['runtime-evidence-issuer'],
  status: 'active',
  notBefore: '2020-01-01T00:00:00.000Z',
  notAfter: '2030-01-01T00:00:00.000Z',
  revokedAt: null,
}
const externalIssuerRegistry = structuredClone(issuerRegistry)
externalIssuerRegistry.issuers.push(externalRuntimeIssuer)
const externalRuntimeProfile = structuredClone(fixtureRuntimeProfile)
externalRuntimeProfile.issuerRegistryDigest = issuerRegistryDigest(externalIssuerRegistry)
externalRuntimeProfile.allowedKeyIds = [externalRuntimeIssuer.keyId]
externalRuntimeProfile.requiredIssuerQuorum = 1
const externalRuntimeRings = structuredClone(rings)
externalRuntimeRings.attestationPolicy.issuerRegistryDigest = externalRuntimeProfile.issuerRegistryDigest
const externalRuntimeFixture = createExternalRuntimeCertificationFixture({
  inventory,
  desired,
  certifications,
  matrix: providerMatrix,
  runtimeProfile: externalRuntimeProfile,
  signer: { keyId: externalRuntimeIssuer.keyId, privateKey: externalRuntimeKeys.privateKey },
  now,
})
after(() => externalRuntimeFixture.dispose())

function validRuntimeGovernanceOptions(overrides = {}) {
  return {
    inventory,
    desired,
    rings: externalRuntimeRings,
    certifications: externalRuntimeFixture.certifications,
    waivers,
    now,
    issuerRegistry: externalIssuerRegistry,
    runtimeProfile: externalRuntimeProfile,
    ...externalRuntimeFixture.runtimeValidationContext,
    ...overrides,
  }
}

function validateFixtureCertifications(document, overrides = {}) {
  return validateCertifications(document, {
    now,
    matrix: providerMatrix,
    runtimeProfile: fixtureRuntimeProfile,
    issuerRegistry,
    ...overrides,
  })
}

function productReleaseRing(document) {
  const ring = document.rings.find(candidate => candidate.order === 2)
  assert.ok(ring, 'fixture must contain one product-consumer release ring')
  return ring
}

// Certification tests must be reproducible in a clean clone. Staging runtime evidence is
// intentionally gitignored and host-specific, so construct a redacted, schema-complete fixture
// from the committed runtime profile instead of borrowing a developer machine's last probe.
function runtimeEvidenceCheckCommand(provider, check) {
  if (check.driver === 'claude-review-capability-probe') {
    return prepareClaudeReviewCapabilityProbe({
      repoRoot: REPO_ROOT,
      provider,
      check,
      environmentNames: ['HOME'],
    }).command
  }
  return {
    executable: provider.executable,
    arguments: check.driver === 'claude-entitlement-readback'
      ? ['auth', 'status', '--json']
      : [`<${check.driver}>`],
    cwd: '<fixture>',
    stdin: 'none',
    environmentNames: check.driver === 'claude-entitlement-readback'
      ? ['HOME', 'USER']
      : [],
  }
}

function runtimeEvidenceFixtureSource() {
  const operatingSystem = 'macos'
  const platform = 'darwin'
  const arch = 'arm64'
  const executionEnvironment = 'native'
  const pathClass = 'no-space'
  const localProfiles = runtimeProfile.providers.filter(provider => provider.executionMode === 'local-probe')
  const providers = localProfiles.map((provider) => {
    const target = provider.certificationTargets.find(item => item.operatingSystem === operatingSystem
      && item.platform === platform && item.arch === arch && item.executionEnvironment === executionEnvironment && item.pathClass === pathClass)
    return {
      id: provider.id,
      status: 'fail',
      targetBinding: { id: target.id, digest: runtimeTargetDigest(target) },
      tool: {
        executable: provider.executable,
        version: provider.id === 'codex' ? 'codex-cli 0.144.6' : '2.1.215 (Claude Code)',
        status: 'pass',
        command: {
          executable: provider.executable,
          arguments: structuredClone(provider.versionArguments),
          cwd: '<repo>',
          stdin: 'none',
          environmentNames: provider.id === 'claude'
            ? ['HOME']
            : ['CODEX_HOME', 'HOME'],
        },
        distribution: {
          activePackageContentDigest: `sha256:${'a'.repeat(64)}`,
          authorityDigest: `sha256:${'b'.repeat(64)}`,
          commandName: provider.executable,
          resolutionStatus: 'pass',
          pathDigest: `sha256:${'1'.repeat(64)}`,
          contentDigest: `sha256:${'2'.repeat(64)}`,
          distributionVersion: target.distributionVersion,
          lockDigest: `sha256:${'c'.repeat(64)}`,
          packageContentProtocol: 'npm-ustar-package-tree-v1',
          platform,
          arch,
          targetContentDigest: `sha256:${'d'.repeat(64)}`,
          targetPathDigest: `sha256:${'e'.repeat(64)}`,
          toolchainPlatform: `${platform}-${arch}`,
        },
      },
      checks: provider.checks.map((check) => ({
        id: check.id,
        driver: check.driver,
        certificationImpact: check.certificationImpact ?? 'required',
        status: 'fail',
        command: runtimeEvidenceCheckCommand(provider, check),
        result: {
          exitCode: null,
          timedOut: false,
          outputExceeded: false,
          assertions: [
            { id: 'process-did-not-time-out', pass: true },
            { id: 'provider-output-limit-not-exceeded', pass: true },
            { id: 'fixture-semantic-assertion', pass: false },
          ],
        },
      })),
    }
  })
  const evidence = {
    schemaVersion: 4,
    kind: 'provider-runtime-conformance',
    scope: 'local-fleet',
    status: 'fail',
    run: {
      runId: '11111111-1111-4111-8111-111111111111',
      generatedAt: '2026-07-19T12:00:00.000Z',
      validUntil: '2026-07-20T12:00:00.000Z',
      operatingSystem,
      platform,
      arch,
      executionEnvironment,
      pathClass,
      hostDigest: `sha256:${'3'.repeat(64)}`,
    },
    subject: {
      gitHead: '4'.repeat(40),
      gitTree: '5'.repeat(40),
      worktreeDirty: true,
      contractDigest: `sha256:${'6'.repeat(64)}`,
      contractValid: true,
      contractBlockingDiagnosticIds: [],
      registeredProviderIds: localProfiles.map((provider) => provider.adapterProviderId),
      profileDigest: `sha256:${'7'.repeat(64)}`,
      harnessDigest: `sha256:${'8'.repeat(64)}`,
    },
    safety: {
      isolatedTemporaryFixtures: true,
      temporaryCredentialHandling: 'codex-auth-copy-if-available-0700-deleted-after-probe',
      processEnvironmentPolicy: 'closed-explicit-allowlist-v1',
      providerExecutableAuthority: 'repo-content-v2-certification-v1',
      realRepositorySourceWrites: false,
      remoteMutations: false,
      certificationLedgerWrites: false,
      rawEnvironmentRecorded: false,
      rawProviderOutputRecorded: false,
    },
    providers,
    attestation: {
      schemaVersion: 1,
      kind: 'provider-runtime-evidence-attestation',
      status: 'pending',
      issuerId: null,
      issuerRegistryDigest: '9'.repeat(64),
      algorithm: 'ed25519',
      evidenceDigest: `sha256:${'a'.repeat(64)}`,
      runId: '11111111-1111-4111-8111-111111111111',
      signature: null,
      coSignatures: [],
    },
    evidenceDigest: `sha256:${'a'.repeat(64)}`,
  }
  return evidence
}

test('valid runtime governance ledgers pass the same fail-closed entrypoint used by reconciliation', () => {
  assert.equal(validateGovernanceModel(validRuntimeGovernanceOptions()), true)
})

test('runtime validation context closes every identity layer to the registered inventory', () => {
  const options = validRuntimeGovernanceOptions()
  const context = {
    repoRoot: options.repoRoot,
    runtimeIdentity: structuredClone(options.runtimeIdentity),
    externalRepositoryIdentities: structuredClone(options.externalRepositoryIdentities),
  }
  assert.equal(normalizeRuntimeValidationContext(context, { inventory }), context)

  const runtimeExtension = structuredClone(context)
  runtimeExtension.runtimeIdentity.injected = true
  assert.throws(
    () => normalizeRuntimeValidationContext(runtimeExtension, { inventory }),
    /Runtime validation identity has an invalid or open shape/,
  )

  const missingRepository = structuredClone(context)
  delete missingRepository.externalRepositoryIdentities.consumer
  assert.throws(
    () => normalizeRuntimeValidationContext(missingRepository, { inventory }),
    /external repository identities has an invalid or open shape/,
  )

  const extraRepository = structuredClone(context)
  extraRepository.externalRepositoryIdentities.unregistered = structuredClone(extraRepository.externalRepositoryIdentities.consumer)
  assert.throws(
    () => normalizeRuntimeValidationContext(extraRepository, { inventory }),
    /external repository identities has an invalid or open shape/,
  )

  const proofExtension = structuredClone(context)
  const repository = inventory.repositories.find(item => Object.keys(proofExtension.externalRepositoryIdentities[item.id].subjectProofs).length > 0)
  const subjectCommit = Object.keys(proofExtension.externalRepositoryIdentities[repository.id].subjectProofs)[0]
  proofExtension.externalRepositoryIdentities[repository.id].subjectProofs[subjectCommit].injected = true
  assert.throws(
    () => normalizeRuntimeValidationContext(proofExtension, { inventory }),
    /Repository subject proof .* has an invalid or open shape/,
  )

  const prototypeExtension = structuredClone(context)
  const prototypeRepository = inventory.repositories.find(item => Object.keys(prototypeExtension.externalRepositoryIdentities[item.id].subjectProofs).length > 0)
  const prototypeCommit = Object.keys(prototypeExtension.externalRepositoryIdentities[prototypeRepository.id].subjectProofs)[0]
  Object.setPrototypeOf(prototypeExtension.externalRepositoryIdentities[prototypeRepository.id].subjectProofs[prototypeCommit], { injected: true })
  assert.throws(
    () => normalizeRuntimeValidationContext(prototypeExtension, { inventory }),
    /Repository subject proof .* must be a plain object/,
  )
})

test('multiple product consumers retain one explicit WM-equivalent certification canary', () => {
  const base = validRuntimeGovernanceOptions()
  const multiInventory = structuredClone(base.inventory)
  const firstProductRepository = multiInventory.repositories
    .find(item => item.role === 'product-consumer')
  multiInventory.repositories.push({
    ...structuredClone(firstProductRepository),
    id: 'second-consumer',
    github: 'ajenchen/second-consumer',
  })
  const identities = structuredClone(base.externalRepositoryIdentities)
  const secondRepository = multiInventory.repositories.find(item => item.id === 'second-consumer')
  const secondSource = identities.consumer
  identities['second-consumer'] = {
    gitCommit: secondSource.gitCommit,
    gitTree: secondSource.gitTree,
    subjectProofs: Object.fromEntries(Object.entries(secondSource.subjectProofs).map(([subjectCommit, proof]) => [
      subjectCommit,
      buildRepositorySubjectProof(secondRepository, {
        subjectCommit: proof.subjectCommit,
        subjectTree: proof.subjectTree,
        carrierCommit: proof.carrierCommit,
        carrierTree: proof.carrierTree,
        relationship: proof.relationship,
        changedFiles: proof.changedFiles,
      }),
    ])),
  }
  const options = {
    now: base.now,
    repoRoot: base.repoRoot,
    runtimeIdentity: base.runtimeIdentity,
    runtimeProfile: base.runtimeProfile,
    issuerRegistry: base.issuerRegistry,
    inventory: multiInventory,
    desiredGithub: base.desired,
    externalRepositoryIdentities: identities,
  }
  assert.equal(multiInventory.certificationCanaries['product-consumer'].repositoryId, 'consumer')
  assert.equal(validateCertifications(base.certifications, options), true)

  const openIdentities = structuredClone(identities)
  openIdentities.unregistered = structuredClone(identities.consumer)
  assert.throws(
    () => validateCertifications(base.certifications, { ...options, externalRepositoryIdentities: openIdentities }),
    /external repository identities has an invalid or open shape/,
  )

  const incompleteIdentities = structuredClone(identities)
  delete incompleteIdentities['second-consumer']
  assert.throws(
    () => validateCertifications(base.certifications, { ...options, externalRepositoryIdentities: incompleteIdentities }),
    /external repository identities has an invalid or open shape/,
  )

  const crossed = structuredClone(multiInventory)
  crossed.certificationCanaries['product-consumer'].repositoryId = 'second-consumer'
  assert.throws(() => validateCertifications(base.certifications, { ...options, inventory: crossed }), /repository differs from the certification inventory target/)
})

test('governance model rejects role-surface drift and requires exact ledger/inventory key equality', () => {
  const missingSurface = structuredClone(inventory)
  const missingProductSurface = missingSurface.repositories
    .find(repository => repository.role === 'product-consumer')
  missingProductSurface.providerSurfacesRequired = missingProductSurface.providerSurfacesRequired
    .filter(requirement => requirement !== 'codex/codex-cloud/cloud')
  assert.throws(
    () => validateGovernanceModel(validRuntimeGovernanceOptions({ inventory: missingSurface })),
    /provider surfaces differ from the canonical role-surface policy/,
  )

  const staleRing = structuredClone(externalRuntimeRings)
  productReleaseRing(staleRing).promotionPredicates
    .find(predicate => predicate.type === 'provider-surfaces-certified').surfaces
    .pop()
  assert.throws(
    () => validateGovernanceModel(validRuntimeGovernanceOptions({ rings: staleRing })),
    /provider surfaces differ from the canonical role-surface policy/,
  )

  const missingLedger = structuredClone(externalRuntimeFixture.certifications)
  missingLedger.certifications = missingLedger.certifications.filter(record => !(
    record.provider === 'codex'
      && record.runtimeKind === 'codex-cloud'
      && record.surface === 'cloud'
      && record.repositoryRole === 'product-consumer'
  ))
  assert.throws(
    () => validateGovernanceModel(validRuntimeGovernanceOptions({ certifications: missingLedger })),
    /ledger keys must exactly equal role-surface inventory requirements; missing=\[codex\/codex-cloud\/cloud\/product-consumer\]; extra=\[\]/,
  )

  const extraLedger = structuredClone(externalRuntimeFixture.certifications)
  const extraRecord = structuredClone(extraLedger.certifications.find(record => (
    record.provider === 'codex'
      && record.runtimeKind === 'codex-cli'
      && record.surface === 'local'
      && record.repositoryRole === 'product-consumer'
  )))
  extraRecord.id = 'fixture-codex-cli-template-extra-v1'
  extraRecord.repositoryRole = 'template-mirror'
  extraLedger.certifications.push(extraRecord)
  assert.throws(
    () => validateGovernanceModel(validRuntimeGovernanceOptions({ certifications: extraLedger })),
    /ledger keys must exactly equal role-surface inventory requirements; missing=\[\]; extra=\[codex\/codex-cli\/local\/template-mirror\]/,
  )
})

test('release-ring policy rejects omitted gates, weakened soak and parallelism, reordered roles, and self-declared evidence', () => {
  const expectRejection = (mutate, pattern) => {
    const poisoned = structuredClone(externalRuntimeRings)
    mutate(poisoned)
    assert.throws(
      () => validateReleaseRings(inventory, poisoned, { now, issuerRegistry: externalIssuerRegistry }),
      pattern,
    )
  }

  expectRejection(
    value => {
      productReleaseRing(value).promotionPredicates = productReleaseRing(value).promotionPredicates
        .filter(predicate => predicate.type === 'provider-surfaces-certified')
    },
    /rings schema validation failed/,
  )
  expectRejection(
    value => {
      const ring = productReleaseRing(value)
      const requiredChecksIndex = ring.promotionPredicates
        .findIndex(predicate => predicate.type === 'required-checks-green')
      ring.promotionPredicates[requiredChecksIndex] = {
        id: 'duplicate-manual-gate',
        type: 'manual-blockers-clear',
      }
    },
    /rings schema validation failed/,
  )
  expectRejection(
    value => { productReleaseRing(value).minimumSoakHours = 1 },
    /rings schema validation failed/,
  )
  expectRejection(
    value => { productReleaseRing(value).maxParallel = 999999 },
    /rings schema validation failed/,
  )
  expectRejection(
    value => {
      const ring = productReleaseRing(value)
      ring.order = 3
      ring.minimumSoakHours = 24
      ring.promotionPredicates = ring.promotionPredicates
        .filter(predicate => predicate.type !== 'upstream-waves-promoted')
      ring.promotionPredicates
        .find(predicate => predicate.type === 'no-active-waiver-at-or-above').risk = 'critical'
    },
    /rings schema validation failed|product-consumer order must be 2/,
  )
  expectRejection(
    value => {
      productReleaseRing(value).promotionPredicates
        .find(predicate => predicate.type === 'no-active-waiver-at-or-above').risk = 'low'
    },
    /rings schema validation failed/,
  )
  expectRejection(
    value => {
      productReleaseRing(value).promotionPredicates.find(predicate => predicate.type === 'plan-conflict-free').type = 'evidence-pass'
    },
    /rings schema validation failed/,
  )
  expectRejection(
    value => {
      value.evidence.push({
        id: 'self-declared-pass',
        type: 'arbitrary',
        status: 'pass',
        reference: 'self',
        sha256: 'a'.repeat(64),
        observedAt: now.toISOString(),
      })
    },
    /rings schema validation failed/,
  )

  for (const mutate of [
    value => { productReleaseRing(value).minimumSoakHours = 0 },
    value => { productReleaseRing(value).maxParallel = 999999 },
    value => {
      productReleaseRing(value).promotionPredicates = productReleaseRing(value).promotionPredicates
        .filter(predicate => predicate.type === 'provider-surfaces-certified')
    },
    value => {
      productReleaseRing(value).promotionPredicates.find(predicate => predicate.type === 'plan-conflict-free').type = 'evidence-pass'
    },
  ]) {
    const schemaPoison = structuredClone(externalRuntimeRings)
    mutate(schemaPoison)
    assert.throws(
      () => validateGovernanceModel(validRuntimeGovernanceOptions({ rings: schemaPoison })),
      /rings schema validation failed/,
    )
  }

  const governanceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const liveInventory = readJson(resolve(governanceRoot, 'inventory/managed-repos.json'))
  const reordered = readJson(resolve(governanceRoot, 'release-rings.json'))
  const liveIssuerRegistry = readJson(resolve(governanceRoot, 'trust/issuers.json'))
  const liveNow = new Date(Math.max(...liveIssuerRegistry.issuers
    .filter(issuer => issuer.status === 'active')
    .map(issuer => Date.parse(issuer.notBefore))) + 60_000)
  reordered.rings.reverse()
  assert.throws(
    () => validateReleaseRings(liveInventory, reordered, {
      now: liveNow,
      issuerRegistry: liveIssuerRegistry,
    }),
    /strictly increasing order/,
  )
  const mixedRoles = readJson(resolve(governanceRoot, 'release-rings.json'))
  mixedRoles.assignments['work-management'].ring = 'ring-1-template-canary'
  assert.throws(
    () => validateReleaseRings(liveInventory, mixedRoles, {
      now: liveNow,
      issuerRegistry: liveIssuerRegistry,
    }),
    /must contain exactly one managed repository role/,
  )
})

test('canonical GitHub profile minima reject required-check, environment, release, token, tag, and role substitution', () => {
  const governanceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const liveInventory = readJson(resolve(governanceRoot, 'inventory/managed-repos.json'))
  const liveDesired = readJson(resolve(governanceRoot, 'desired/github.json'))
  const expectDesiredPoison = (mutate) => {
    const poisoned = structuredClone(liveDesired)
    mutate(poisoned)
    assert.throws(
      () => validateDesiredGithub(liveInventory, poisoned),
      /desired schema validation failed/,
    )
  }
  const expectInventoryPoison = (mutate, pattern) => {
    const poisoned = structuredClone(liveInventory)
    mutate(poisoned)
    assert.throws(() => validateInventory(poisoned), pattern)
  }

  expectDesiredPoison(value => {
    value.profiles['design-system-authority'].requiredChecks.pop()
  })
  expectDesiredPoison(value => {
    value.profiles['design-system-authority'].requiredChecks
      .find(check => check.context === 'Verify(tsc + tests + compile + build)').context = 'Renamed verify'
  })
  expectDesiredPoison(value => {
    const check = value.profiles['design-system-authority'].requiredChecks
      .find(candidate => candidate.context === 'Packaging integrity(dims 84/85/86/88 light checks)')
    check.workflow = '.github/workflows/ci.yml'
  })
  expectDesiredPoison(value => {
    value.profiles['product-consumer'].requiredChecks[0].context = 'Replacement snapshot'
  })
  expectDesiredPoison(value => {
    value.profiles['design-system-authority'].environments = value.profiles['design-system-authority'].environments
      .filter(environment => environment.name !== 'release-finalize')
  })
  expectDesiredPoison(value => {
    value.profiles['design-system-authority'].immutableReleases = false
  })
  expectDesiredPoison(value => {
    const finalize = value.profiles['design-system-authority'].environments
      .find(environment => environment.name === 'release-finalize')
    finalize.independentReviewRequired = true
    finalize.preventSelfReview = true
  })
  expectDesiredPoison(value => {
    value.profiles['product-consumer'].environments = value.profiles['product-consumer'].environments
      .filter(environment => environment.name !== 'governance-upgrade')
  })
  expectDesiredPoison(value => {
    value.profiles['product-consumer'].actionsWorkflowPermissions.can_approve_pull_request_reviews = true
  })
  expectDesiredPoison(value => {
    const upgrade = value.profiles['product-consumer'].environments
      .find(environment => environment.name === 'governance-upgrade')
    upgrade.credentialIntegration = 'governanceCheckApp'
  })
  expectDesiredPoison(value => {
    const profile = value.profiles['product-consumer']
    profile.tagPolicy.allowCreation = true
    const tagRuleset = profile.rulesets.find(ruleset => ruleset.target === 'tag')
    tagRuleset.rules = tagRuleset.rules.filter(rule => rule.type !== 'creation')
  })
  expectDesiredPoison(value => {
    const duplicate = structuredClone(value.profiles['design-system-authority'].environments
      .find(environment => environment.name === 'governance-mirror'))
    duplicate.waitTimer = 1
    value.profiles['design-system-authority'].environments.push(duplicate)
  })
  expectDesiredPoison(value => {
    const environments = value.profiles['design-system-authority'].environments
    const npmIndex = environments.findIndex(environment => environment.name === 'npm-release')
    const duplicate = structuredClone(environments.find(environment => environment.name === 'release-finalize'))
    duplicate.waitTimer = 1
    environments[npmIndex] = duplicate
  })
  expectDesiredPoison(value => { value.integrations.githubActions.required = false })
  for (const integration of ['governanceCheckApp', 'governanceWriterApp']) {
    expectDesiredPoison(value => { value.integrations[integration].required = true })
  }
  for (const mutate of [
    value => { value.integrations.githubActions.id = 999 },
    value => { value.integrations.githubActions.slug = 'attacker-actions' },
    value => { value.integrations.githubActions.capability = 'writer' },
    value => { value.integrations.githubActions.secretPrefix = 'ATTACKER' },
    value => { value.integrations.governanceCheckApp.slug = 'attacker-check' },
    value => { value.integrations.governanceCheckApp.capability = 'writer' },
    value => { value.integrations.governanceCheckApp.operationMode = 'external-service' },
    value => { value.integrations.governanceCheckApp.secretPrefix = 'ATTACKER_CHECK' },
    value => { value.integrations.governanceWriterApp.slug = 'attacker-writer' },
    value => { value.integrations.governanceWriterApp.capability = 'check-only' },
    value => { value.integrations.governanceWriterApp.operationMode = 'external-service' },
    value => { value.integrations.governanceWriterApp.secretPrefix = 'ATTACKER_WRITER' },
  ]) expectDesiredPoison(mutate)
  for (const mutate of [
    value => { value.managedEnvironmentNames.push('production') },
    value => { value.managedEnvironmentNames[0] = 'production' },
    value => { value.managedEnvironmentNames.pop() },
  ]) expectDesiredPoison(mutate)

  const additive = structuredClone(liveDesired)
  additive.profiles['design-system-authority'].requiredChecks.push({
    ...structuredClone(additive.profiles['design-system-authority'].requiredChecks
      .find(check => check.context === 'Verify(tsc + tests + compile + build)')),
    context: 'Additional independently reviewed security scan',
  })
  assert.equal(validateDesiredGithub(liveInventory, additive), true)

  for (const [repoId, replacement] of [
    ['design-system', 'product-consumer'],
    ['ds-product-template', 'design-system-authority'],
    ['work-management', 'published-template'],
  ]) {
    const substitutedInventory = structuredClone(liveInventory)
    substitutedInventory.repositories.find(repository => repository.id === repoId).desiredProfile = replacement
    assert.throws(
      () => validateDesiredGithub(substitutedInventory, liveDesired),
      /inventory schema validation failed/,
    )
  }

  for (const [repoId, replacement] of [
    ['design-system', 'product-consumer'],
    ['ds-product-template', 'authority-repository'],
    ['work-management', 'published-template-mirror'],
  ]) {
    const substitutedInventory = structuredClone(liveInventory)
    substitutedInventory.repositories.find(repository => repository.id === repoId).ownershipPolicy = replacement
    assert.throws(
      () => validateDesiredGithub(substitutedInventory, liveDesired),
      /inventory schema validation failed/,
    )
  }

  for (const authority of [
    'attacker/design-system@infra/governance',
    'ajenchen/work-management@infra/governance',
    'ajenchen/design-system@attacker',
  ]) {
    expectInventoryPoison(
      value => { value.authority = authority },
      /Inventory authority must exactly equal ajenchen\/design-system@infra\/governance/,
    )
  }
  expectInventoryPoison(value => {
    const repository = value.repositories.find(candidate => candidate.role === 'authority')
    repository.github = 'attacker/design-system'
    value.authority = 'attacker/design-system@infra/governance'
  }, /must use registered GitHub repository ajenchen\/design-system/)
  expectInventoryPoison(value => {
    const repository = value.repositories.find(candidate => candidate.role === 'template-mirror')
    repository.github = 'attacker/ds-product-template'
  }, /must use registered GitHub repository ajenchen\/ds-product-template/)
  expectInventoryPoison(value => {
    value.repositories.find(candidate => candidate.id === 'work-management').github = 'attacker/work-management'
  }, /must remain under authority owner ajenchen/)
  expectInventoryPoison(value => {
    value.repositories.find(candidate => candidate.id === 'work-management').github = 'ajenchen/renamed-product'
  }, /GitHub repository name must equal its registered id/)

  for (const profile of ['design-system-authority', 'product-consumer', 'published-template']) {
    expectInventoryPoison(
      value => { value.workflowIdentitySources[profile].repositoryId = 'work-management' },
      new RegExp(`Workflow identity source ${profile} must use repository`),
    )
  }
  expectInventoryPoison(
    value => { delete value.workflowIdentitySources },
    /Inventory workflowIdentitySources must be a mapping/,
  )
  expectInventoryPoison(
    value => { delete value.workflowIdentitySources['published-template'] },
    /must exactly cover the canonical desired profiles/,
  )
  expectInventoryPoison(
    value => { value.workflowIdentitySources.attacker = { repositoryId: 'work-management' } },
    /must exactly cover the canonical desired profiles/,
  )

  for (const repoId of ['design-system', 'ds-product-template', 'work-management']) {
    expectInventoryPoison(
      value => { value.repositories.find(repository => repository.id === repoId).defaultBranch = 'attacker' },
      /must use default branch main/,
    )
  }

  for (const [repoId, expectedPath, replacementPath] of [
    ['design-system', 'localPathFromGovernanceRoot', 'mirrorSourcePathFromGovernanceRoot'],
    ['ds-product-template', 'mirrorSourcePathFromGovernanceRoot', 'localPathFromGovernanceRoot'],
    ['work-management', 'localPathFromGovernanceRoot', 'mirrorSourcePathFromGovernanceRoot'],
  ]) {
    expectInventoryPoison(value => {
      const repository = value.repositories.find(candidate => candidate.id === repoId)
      repository[replacementPath] = repository[expectedPath]
      delete repository[expectedPath]
    }, new RegExp(`must use ${expectedPath}|may not use ${replacementPath}`))
  }

  for (const [repoId, requiredCapability, forbiddenCapability] of [
    ['design-system', 'publishes', 'consumes'],
    ['ds-product-template', 'consumes', 'publishes'],
    ['work-management', 'consumes', 'publishes'],
  ]) {
    expectInventoryPoison(value => {
      delete value.repositories.find(repository => repository.id === repoId)[requiredCapability]
    }, new RegExp(`must declare canonical ${requiredCapability}`))
    expectInventoryPoison(value => {
      value.repositories.find(repository => repository.id === repoId)[forbiddenCapability] = ['@attacker/package']
    }, new RegExp(`may not declare ${forbiddenCapability}`))
    for (const mutate of [
      values => { values[0] = '@attacker/package' },
      values => { values.push('@attacker/package') },
      values => { values.pop() },
    ]) {
      expectInventoryPoison(value => {
        mutate(value.repositories.find(repository => repository.id === repoId)[requiredCapability])
      }, new RegExp(`must declare canonical ${requiredCapability}`))
    }
  }

  expectInventoryPoison(value => {
    value.repositories.find(repository => repository.id === 'work-management').upgradeProtocolProfile = 'new-snapshot-v2'
  }, /Existing legacy product work-management may not self-declare the new-snapshot upgrade lineage/)

  for (const [policyId, defaultMode] of [
    ['authority-repository', 'generated'],
    ['published-template-mirror', 'consumer-owned'],
    ['product-consumer', 'authority'],
  ]) {
    expectInventoryPoison(value => {
      value.ownershipPolicies[policyId].defaultMode = defaultMode
    }, /ownership default must remain/)
  }
  for (const [policyId, pattern] of [
    ['authority-repository', 'infra/governance/**'],
    ['authority-repository', '.github/CODEOWNERS'],
    ['published-template-mirror', '.github/workflows/**'],
    ['published-template-mirror', '.github/dependabot.yml'],
    ['product-consumer', 'scripts/sync-all.mjs'],
    ['product-consumer', 'package.json'],
  ]) {
    expectInventoryPoison(value => {
      const rules = value.ownershipPolicies[policyId].rules
      rules.splice(rules.findIndex(rule => rule.pattern === pattern), 1)
    }, /ownership policy/)
  }
  expectInventoryPoison(value => {
    value.ownershipPolicies['product-consumer'].rules
      .find(rule => rule.pattern === 'scripts/sync-all.mjs').mode = 'consumer-owned'
  }, /ownership policy/)
  expectInventoryPoison(value => {
    value.ownershipPolicies['product-consumer'].rules.push({
      pattern: 'scripts/**',
      mode: 'consumer-owned',
      owner: 'attacker',
    })
  }, /Ambiguous ownership/)
  expectInventoryPoison(value => {
    value.ownershipPolicies.attacker = { defaultMode: 'consumer-owned', rules: [] }
  }, /ownershipPolicies must exactly cover/)
})

test('every managed release-tag ruleset requires signed commits as defense-in-depth', () => {
  const unsigned = structuredClone(desired)
  const tagRuleset = unsigned.profiles['product-consumer'].rulesets.find(item => item.target === 'tag')
  tagRuleset.rules = tagRuleset.rules.filter(rule => rule.type !== 'required_signatures')
  assert.throws(
    () => validateGovernanceModel({ inventory, desired: unsigned, rings, certifications, waivers, now, issuerRegistry, runtimeProfile: fixtureRuntimeProfile }),
    /must require signed commits/,
  )
})

test('managed GitHub rulesets reject disabled, non-matching, incomplete and renamed protection policies', () => {
  const validateDesiredPoison = (poison, pattern) => assert.throws(
    () => validateGovernanceModel(validRuntimeGovernanceOptions({ desired: poison })),
    pattern,
  )

  const openCondition = structuredClone(desired)
  openCondition.profiles['product-consumer'].rulesets[0].conditions.unreviewed = {}
  validateDesiredPoison(openCondition, /desired schema validation failed/)

  const tagOnly = structuredClone(desired)
  tagOnly.profiles['product-consumer'].rulesets = tagOnly.profiles['product-consumer'].rulesets.filter(ruleset => ruleset.target === 'tag')
  validateDesiredPoison(tagOnly, /desired schema validation failed/)

  const disabled = structuredClone(desired)
  disabled.profiles['product-consumer'].rulesets[0].enforcement = 'disabled'
  validateDesiredPoison(disabled, /desired schema validation failed/)

  const renamedNamespace = structuredClone(desired)
  renamedNamespace.managedRulesetPrefix = 'unmanaged/'
  renamedNamespace.profiles['product-consumer'].rulesets.forEach((ruleset) => {
    ruleset.name = ruleset.name.replace(/^fleet\//, 'unmanaged/')
  })
  validateDesiredPoison(renamedNamespace, /desired schema validation failed/)

  const neverMatchesDefaultBranch = structuredClone(desired)
  neverMatchesDefaultBranch.profiles['product-consumer'].rulesets
    .find(ruleset => ruleset.name === 'fleet/base-integrity')
    .conditions.ref_name.include = ['refs/heads/does-not-exist']
  validateDesiredPoison(neverMatchesDefaultBranch, /weakened target, rollout, or ref condition/)

  const deferredBaseIntegrity = structuredClone(desired)
  deferredBaseIntegrity.profiles['product-consumer'].rulesets
    .find(ruleset => ruleset.name === 'fleet/base-integrity')
    .rollout = 'on-promotion'
  validateDesiredPoison(deferredBaseIntegrity, /weakened target, rollout, or ref condition/)

  const creationOnlyTagPolicy = structuredClone(desired)
  creationOnlyTagPolicy.profiles['product-consumer'].rulesets
    .find(ruleset => ruleset.target === 'tag')
    .rules = [{ type: 'creation' }]
  validateDesiredPoison(creationOnlyTagPolicy, /must require signed commits/)
})

test('a forged certified record with a failed required check is rejected before API reads', () => {
  const forged = readJson(resolve(FIXTURES, 'certification-forged-failed-check.json'))
  const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))

  assert.throws(
    () => reconcileFixtureTestHarness.buildPlan({ inventory, desired, rings, certifications: forged, waivers, client, now, issuerRegistry, runtimeProfile: fixtureRuntimeProfile }),
    /contains a non-passing required check/,
  )
  assert.deepEqual(client.calls, [])
})

test('certified records require a valid future expiry and complete timestamps', () => {
  const missingExpiry = readJson(resolve(FIXTURES, 'certification-missing-expiry.json'))
  assert.throws(() => validateFixtureCertifications(missingExpiry), /must have a valid expiresAt/)

  const expired = structuredClone(certifications)
  expired.certifications[0].expiresAt = '2026-07-19T00:00:00Z'
  assert.throws(() => validateFixtureCertifications(expired), /target status expired/)

  const impossibleDate = structuredClone(certifications)
  impossibleDate.certifications[0].certifiedAt = '2026-02-31T00:00:00Z'
  assert.throws(() => validateFixtureCertifications(impossibleDate), /valid certifiedAt/)
})

test('provider surface and certification identities are unique and known', () => {
  const duplicate = readJson(resolve(FIXTURES, 'certification-duplicate-key.json'))
  assert.throws(() => validateFixtureCertifications(duplicate), /Duplicate provider certification key/)

  const crossedCertification = structuredClone(certifications)
  const crossedRecord = crossedCertification.certifications.find(record => (
    record.provider === 'codex' && record.runtimeKind === 'codex-cli' && record.surface === 'local'
  ))
  crossedRecord.surface = 'cloud'
  crossedCertification.certifications = [
    crossedRecord,
    ...crossedCertification.certifications.filter(record => record !== crossedRecord),
  ]
  assert.throws(
    () => validateFixtureCertifications(crossedCertification),
    /Unknown certification tuple codex\/codex-cli\/cloud/,
  )

  const unknownInventory = readJson(resolve(FIXTURES, 'inventory-unknown-requirement.json'))
  const client = new FixtureApiClient(resolve(FIXTURES, 'empty'))
  assert.throws(
    () => reconcileFixtureTestHarness.buildPlan({ inventory: unknownInventory, desired, rings, certifications, waivers, client, now, issuerRegistry, runtimeProfile: fixtureRuntimeProfile }),
    /Unknown surface requirement ci\/github-actions\/moon-runtime/,
  )
  assert.deepEqual(client.calls, [])
})

test('future providers are registry-driven, while unknown and unregistered aliases fail closed', () => {
  const schema = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../schemas/provider-surface-certification.schema.json'))
  assert.equal(schema.$defs.certification.properties.provider.enum, undefined)
  assert.equal(schema.$defs.certification.properties.provider.pattern, '^[a-z][a-z0-9-]*$')
  assert.equal(schema.$defs.localRuntimeEvidence.properties.providerId.enum, undefined)
  const inventorySchema = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../schemas/managed-repos.schema.json'))
  assert.equal(inventorySchema.$defs.repository.properties.providerSurfacesRequired.items.pattern, '^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$')

  const crossedInventory = structuredClone(inventory)
  crossedInventory.repositories
    .find(repository => repository.role === 'product-consumer')
    .providerSurfacesRequired = ['ci/codex-cli/github-actions']
  assert.throws(() => validateInventory(crossedInventory), /Unknown runtime kind in surface requirement/)

  const unknown = structuredClone(certifications)
  unknown.certifications[0].provider = 'future-model'
  assert.throws(
    () => validateFixtureCertifications(unknown),
    /Unknown certification provider future-model/,
  )

  const unregisteredMatrix = structuredClone(providerMatrix)
  unregisteredMatrix.providers['future-model'] = {
    adapterProviderId: 'future-adapter',
    runtimeKinds: {
      'future-model-cli': { runtimeProfilesBySurface: { local: 'future-model-local' }, runtimeEvidenceRequired: true },
    },
    minimumVersion: '1.0.0',
  }
  assert.throws(
    () => validateProviderRegistry(unregisteredMatrix, runtimeProfile),
    /maps unknown adapter provider future-adapter/,
  )

  const extendedAdapterRegistry = structuredClone(PROVIDER_REGISTRY)
  const futureAdapter = structuredClone(extendedAdapterRegistry.providers.find((provider) => provider.id === 'generic'))
  futureAdapter.id = 'future-adapter'
  futureAdapter.displayName = 'Future adapter fixture'
  futureAdapter.providerKind = 'concrete-runtime'
  futureAdapter.instructionEntry = 'FUTURE.md'
  futureAdapter.sharedInstructionEntry = 'FUTURE.md'
  futureAdapter.skillDirectory = '.future-adapter/workflows'
  futureAdapter.runtime = {
    cli: {
      executable: 'future-model',
      localExecutable: 'node_modules/.bin/future-model',
      briefInvocationMarkers: ['review'],
      discoveryMarkers: ['command -v future-model'],
      replyArtifactPrefix: 'future-model-reply',
    },
    transcript: { contract: null, stability: 'unavailable', fixture: null, access: null },
    contextOutputTransport: 'stderr',
    stopDecisionTransport: 'blocking-exit',
    branchNamespace: 'future-model/',
    memorySyncScript: null,
  }
  futureAdapter.adapter.generate = true
  futureAdapter.adapter.repositoryInstructionSource = null
  futureAdapter.adapter.productInstructionSource = 'scripts/fork-role-sources/AGENTS.product.md'
  futureAdapter.adapter.skillView = {
    directory: '.future-adapter/workflows',
    materializerId: 'markdown-workflows-directory-v1',
  }
  futureAdapter.adapter.discovery = {
    providerRootNames: ['.future-adapter'],
    instructionNames: ['FUTURE.md'],
    instructionOverrideNames: [],
    configPaths: [],
    pluginRootNames: [],
  }
  futureAdapter.adapter.exclusions = futureAdapter.adapter.exclusions.filter((entry) => entry.scope === 'native-hooks')
  extendedAdapterRegistry.providers.push(futureAdapter)
  assert.throws(
    () => validateProviderRegistry(unregisteredMatrix, runtimeProfile, { adapterRegistry: extendedAdapterRegistry }),
    /adapter coverage must exactly equal registered concrete runtimes|Canonical provider CLI bindings must exactly enumerate/,
  )

  const extendedProfile = structuredClone(fixtureRuntimeProfile)
  extendedProfile.providers.push({
    id: 'future-model-local',
    adapterProviderId: 'future-adapter',
    runtimeKind: 'future-model-cli',
    certificationSurface: 'local',
    executionMode: 'external-attested',
    evidenceKind: 'external-runtime-surface-conformance',
    surfacePolicy: { kind: 'inventory-repository-readback' },
    executable: null,
    distributionVersionAuthority: { kind: 'external-runtime-identity', authority: 'future-provider-release', productId: 'future-model', version: '1.0.0' },
    versionArguments: [],
    certificationTargets: [{
      id: 'macos-darwin-arm64-native-no-space', operatingSystem: 'macos', platform: 'darwin', arch: 'arm64',
      executionEnvironment: 'native', distributionVersion: '1.0.0', pathClass: 'no-space',
    }],
    checks: [{ id: 'future-hard-gate-receipt', driver: 'external-hard-gate-receipt', requiresModel: false }],
  })
  const extendedMatrix = structuredClone(unregisteredMatrix)
  const futureLedger = {
    schemaVersion: 2,
    certifications: [{
      id: 'future-model-local-v1',
      provider: 'future-model',
      runtimeKind: 'future-model-cli',
      providerVersion: '1.0.0',
      adapterVersion: 'governance-protocol-1',
      surface: 'local',
      repositoryRole: 'authority',
      status: 'not-certified',
      platformMatrix: [{
        id: 'macos-darwin-arm64-native-no-space', operatingSystem: 'macos', platform: 'darwin', arch: 'arm64',
        executionEnvironment: 'native', distributionVersion: '1.0.0', pathClass: 'no-space', status: 'not-certified',
        limitations: ['Runtime certification evidence has not yet been promoted.'],
      }],
      checks: [{ id: 'registration', status: 'not-tested', evidence: { kind: 'command-output', reference: 'future provider onboarding fixture' } }],
      limitations: ['Runtime certification evidence has not yet been promoted.'],
    }],
  }
  const extendedToolchain = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../providers/provider-cli-toolchain.json'))
  extendedToolchain.providerBindings.push({ providerId: 'future-model', provisioning: 'external-runtime', toolProviderId: null })
  assert.equal(validateProviderRegistry(extendedMatrix, extendedProfile, {
    adapterRegistry: extendedAdapterRegistry,
    issuerRegistry,
    now,
    providerCliToolchain: extendedToolchain,
  }).aliases.get('future-model-local'), 'future-model/future-model-cli/local')
  assert.equal(validateCertifications(futureLedger, {
    now,
    matrix: extendedMatrix,
    runtimeProfile: extendedProfile,
    adapterRegistry: extendedAdapterRegistry,
    issuerRegistry,
    providerCliToolchain: extendedToolchain,
  }), true)
})

test('certification versions and evidence are mandatory even when a record is not certified', () => {
  const missingVersion = structuredClone(certifications)
  delete missingVersion.certifications[0].adapterVersion
  assert.throws(() => validateFixtureCertifications(missingVersion), /must declare adapterVersion/)

  const missingEvidence = structuredClone(certifications)
  delete missingEvidence.certifications[0].checks[0].evidence.reference
  assert.throws(() => validateFixtureCertifications(missingEvidence), /missing evidence reference/)
})

test('consumer doctor validates all control-plane ledgers before inspecting a checkout', () => {
  const forged = readJson(resolve(FIXTURES, 'certification-forged-failed-check.json'))
  assert.throws(
    () => doctorRepository({
      inventory,
      desired,
      matrix: providerMatrix,
      rings,
      certifications: forged,
      waivers,
      repoId: 'consumer',
      root: '/path/that-must-not-be-inspected',
      now,
      issuerRegistry,
      runtimeProfile: fixtureRuntimeProfile,
    }),
    /contains a non-passing required check/,
  )

  const invalidCases = [
    { name: 'inventory', inventory: readJson(resolve(FIXTURES, 'inventory-unknown-requirement.json')), expected: /Unknown surface requirement/ },
    { name: 'desired', desired: { ...desired, schemaVersion: 2 }, expected: /Desired GitHub schemaVersion/ },
    { name: 'rings', rings: { ...rings, schemaVersion: 1 }, expected: /Release rings schemaVersion|rings schema validation failed/ },
    { name: 'waivers', waivers: { schemaVersion: 2, waivers: [] }, expected: /Waiver ledger schemaVersion/ },
  ]
  for (const invalid of invalidCases) {
    assert.throws(
      () => doctorRepository({
        inventory: invalid.inventory ?? inventory,
        desired: invalid.desired ?? desired,
        matrix: providerMatrix,
        rings: invalid.rings ?? rings,
        certifications,
        waivers: invalid.waivers ?? waivers,
        repoId: 'consumer',
        root: '/path/that-must-not-be-inspected',
        now,
        issuerRegistry,
        runtimeProfile: fixtureRuntimeProfile,
      }),
      invalid.expected,
      `${invalid.name} must fail before checkout inspection`,
    )
  }
})

test('release-ring soak semantics follow the single canonical deployment profile and fail closed on cross-profile substitution', () => {
  const productionRings = structuredClone(externalRuntimeRings)
  assert.equal(
    validateReleaseRings(inventory, productionRings, {
      now,
      issuerRegistry: externalIssuerRegistry,
    }),
    true,
  )

  const blockingSubstitution = structuredClone(productionRings)
  for (const ring of blockingSubstitution.rings) {
    ring.promotionPredicates.find(predicate => predicate.type === 'soak-observation').type = 'soak-complete'
  }
  assert.throws(
    () => validateReleaseRings(inventory, blockingSubstitution, {
      now,
      issuerRegistry: externalIssuerRegistry,
    }),
    /PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM requires release-ring predicate soak-observation/,
  )

  const maximumPolicy = structuredClone(loadExternalActivationPolicy())
  maximumPolicy.activeProfile = 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM'
  const maximumPolicyDigest = externalActivationPolicyDigest(maximumPolicy)
  assert.throws(
    () => validateReleaseRings(inventory, productionRings, {
      now,
      issuerRegistry: externalIssuerRegistry,
      activationPolicy: maximumPolicy,
      expectedActivationPolicyDigest: maximumPolicyDigest,
    }),
    /MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM requires release-ring predicate soak-complete/,
  )
  assert.equal(
    validateReleaseRings(inventory, blockingSubstitution, {
      now,
      issuerRegistry: externalIssuerRegistry,
      activationPolicy: maximumPolicy,
      expectedActivationPolicyDigest: maximumPolicyDigest,
    }),
    true,
  )
})

function fixtureGit(repoRoot, args) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || `git ${args.join(' ')} failed`)
  return result.stdout.trim()
}

function runtimeCertifiedFixture() {
  const carrierRoot = realpathSync(mkdtempSync(resolve(tmpdir(), 'runtime-certification-carrier-')))
  fixtureGit(carrierRoot, ['init', '-b', 'main'])
  fixtureGit(carrierRoot, ['config', 'user.name', 'Runtime Fixture'])
  fixtureGit(carrierRoot, ['config', 'user.email', 'runtime-fixture@example.invalid'])
  writeFileSync(resolve(carrierRoot, 'subject.txt'), 'immutable tested subject\n')
  fixtureGit(carrierRoot, ['add', 'subject.txt'])
  fixtureGit(carrierRoot, ['commit', '-m', 'tested subject'])
  const subjectCommit = fixtureGit(carrierRoot, ['rev-parse', 'HEAD'])
  const subjectTree = fixtureGit(carrierRoot, ['rev-parse', 'HEAD^{tree}'])
  const source = runtimeEvidenceFixtureSource()
  const evidence = structuredClone(source)
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const signedIssuerRegistry = {
    $schema: '../schemas/issuer-registry.schema.json',
    schemaVersion: 1,
    algorithm: 'ed25519',
    issuers: [{
      keyId: 'fixture-issuer',
      subject: 'fixture-runtime-authority',
      publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      roles: ['runtime-evidence-issuer'],
      status: 'active',
      notBefore: '2026-01-01T00:00:00.000Z',
      notAfter: '2030-01-01T00:00:00.000Z',
      revokedAt: null,
    }],
  }
  const signedRuntimeProfile = structuredClone(runtimeProfile)
  signedRuntimeProfile.issuerRegistryDigest = issuerRegistryDigest(signedIssuerRegistry)
  signedRuntimeProfile.allowedKeyIds = ['fixture-issuer']
  signedRuntimeProfile.requiredIssuerQuorum = 1
  const identity = {
    profileDigest: `sha256:${'8'.repeat(64)}`,
    harnessDigest: `sha256:${'9'.repeat(64)}`,
  }
  Object.assign(evidence.subject, identity, { gitHead: subjectCommit, gitTree: subjectTree, worktreeDirty: false })
  for (const providerEvidence of evidence.providers) {
    providerEvidence.status = 'pass'
    for (const check of providerEvidence.checks) {
      check.status = 'pass'
      for (const assertion of check.result.assertions) assertion.pass = true
    }
  }
  evidence.status = 'pass'
  Object.assign(evidence.run, {
    runId: '33333333-3333-4333-8333-333333333333',
    generatedAt: '2026-07-19T12:00:00.000Z',
    validUntil: '2026-07-20T12:00:00.000Z',
  })
  const { attestation: ignoredAttestation, evidenceDigest: ignored, ...unsigned } = evidence
  evidence.evidenceDigest = `sha256:${sha256(stableStringify(unsigned, 0))}`
  evidence.attestation = {
    ...source.attestation,
    status: 'verified',
    issuerId: 'fixture-issuer',
    issuerRegistryDigest: signedRuntimeProfile.issuerRegistryDigest,
    evidenceDigest: evidence.evidenceDigest,
    runId: evidence.run.runId,
    coSignatures: [],
    signature: null,
  }
  evidence.attestation.signature = sign(null, runtimeEvidenceSigningPayload(evidence, 'fixture-issuer'), privateKey).toString('base64')
  const bytes = Buffer.from(`${stableStringify(evidence)}\n`)
  const artifactSha256 = sha256(bytes)
  const reference = `infra/governance/evidence/provider-runtime/${artifactSha256}.json`
  mkdirSync(resolve(carrierRoot, 'infra/governance/evidence/provider-runtime'), { recursive: true })
  writeFileSync(resolve(carrierRoot, reference), bytes)
  const provider = evidence.providers.find(item => item.id === 'codex')
  const version = provider.tool.version.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)[0]
  const ledger = {
    schemaVersion: 2,
    certifications: [{
      id: 'codex-runtime-fixture', provider: 'codex', providerVersion: version, adapterVersion: 'governance-protocol-1',
      runtimeKind: 'codex-cli',
      surface: 'local', repositoryRole: 'authority', status: 'certified', certifiedAt: '2026-07-19T13:00:00.000Z', expiresAt: '2026-07-20T11:00:00.000Z',
      platformMatrix: [{
        id: provider.targetBinding.id,
        operatingSystem: evidence.run.operatingSystem,
        platform: evidence.run.platform,
        arch: evidence.run.arch,
        executionEnvironment: evidence.run.executionEnvironment,
        distributionVersion: provider.tool.distribution.distributionVersion,
        pathClass: evidence.run.pathClass,
        status: 'certified',
        limitations: [],
      }],
      runtimeEvidence: {
        reference,
        artifactSha256,
        evidenceDigest: evidence.evidenceDigest,
        providerId: 'codex',
        runId: evidence.run.runId,
        scope: evidence.scope,
        targetId: provider.targetBinding.id,
        targetDigest: provider.targetBinding.digest,
        operatingSystem: evidence.run.operatingSystem,
        platform: evidence.run.platform,
        arch: evidence.run.arch,
        executionEnvironment: evidence.run.executionEnvironment,
        distributionVersion: provider.tool.distribution.distributionVersion,
        pathClass: evidence.run.pathClass,
        distributionDigest: `sha256:${sha256(stableStringify(provider.tool.distribution, 0))}`,
        gitCommit: subjectCommit,
        gitTree: subjectTree,
        ...identity,
        hardGateContractDigest: evidence.subject.contractDigest,
      },
      checks: [{ id: 'runtime', status: 'pass', evidence: { kind: 'artifact-digest', reference, sha256: artifactSha256 } }], limitations: [],
    }],
  }
  mkdirSync(resolve(carrierRoot, 'infra/governance/providers'), { recursive: true })
  writeFileSync(resolve(carrierRoot, 'infra/governance/providers/certifications.json'), `${stableStringify(ledger)}\n`)
  fixtureGit(carrierRoot, ['add', 'infra/governance/evidence', 'infra/governance/providers/certifications.json'])
  fixtureGit(carrierRoot, ['commit', '-m', 'carry certification ledger and evidence'])
  const cloneParent = realpathSync(mkdtempSync(resolve(tmpdir(), 'runtime-certification-clone-')))
  const repoRoot = resolve(cloneParent, 'clean-clone')
  const clone = spawnSync('git', ['clone', '--quiet', carrierRoot, repoRoot], { encoding: 'utf8' })
  assert.equal(clone.status, 0, clone.stderr)
  const repository = { id: 'authority-canary', github: 'fixture/authority-canary', role: 'authority', defaultBranch: 'main' }
  const inventory = {
    certificationCanaries: { authority: { repositoryId: repository.id } },
    repositories: [repository],
  }
  const carrierPolicy = certificationCarrierPolicyForRole(loadRoleSurfacePolicy(), 'authority')
  const externalRepositoryIdentities = {
    [repository.id]: resolveLocalRepositoryIdentity({
      repoRoot,
      repository,
      subjectCommits: [subjectCommit],
      carrierPolicy,
    }),
  }
  return {
    repoRoot,
    identity,
    inventory,
    externalRepositoryIdentities,
    ledger,
    runtimeProfile: signedRuntimeProfile,
    issuerRegistry: signedIssuerRegistry,
    evidencePath: resolve(repoRoot, reference),
    subjectCommit,
    dispose: () => {
      rmSync(carrierRoot, { recursive: true, force: true })
      rmSync(cloneParent, { recursive: true, force: true })
    },
  }
}

test('a clean clone at a later ledger carrier commit validates the immutable tested subject without self-reference', (t) => {
  const fixture = runtimeCertifiedFixture()
  t.after(fixture.dispose)
  const validationOptions = {
    now,
    repoRoot: fixture.repoRoot,
    runtimeIdentity: fixture.identity,
    runtimeProfile: fixture.runtimeProfile,
    issuerRegistry: fixture.issuerRegistry,
    inventory: fixture.inventory,
    externalRepositoryIdentities: fixture.externalRepositoryIdentities,
  }
  const carrierIdentity = fixture.externalRepositoryIdentities['authority-canary']
  assert.notEqual(carrierIdentity.gitCommit, fixture.subjectCommit)
  assert.deepEqual(carrierIdentity.subjectProofs[fixture.subjectCommit].changedPaths, [
    `infra/governance/evidence/provider-runtime/${fixture.ledger.certifications[0].runtimeEvidence.artifactSha256}.json`,
    'infra/governance/providers/certifications.json',
  ])
  assert.equal(validateCertifications(fixture.ledger, validationOptions), true)

  const missing = structuredClone(fixture.ledger)
  delete missing.certifications[0].runtimeEvidence
  assert.throws(() => validateCertifications(missing, validationOptions), /must bind runtime conformance evidence/)

  const stale = structuredClone(fixture.ledger)
  stale.certifications[0].runtimeEvidence.gitTree = '6'.repeat(40)
  assert.throws(() => validateCertifications(stale, validationOptions), /gitTree binding differs from its runtime artifact/)

  const missingAncestry = structuredClone(fixture.externalRepositoryIdentities)
  delete missingAncestry['authority-canary'].subjectProofs[fixture.subjectCommit]
  assert.throws(() => validateCertifications(fixture.ledger, {
    ...validationOptions,
    externalRepositoryIdentities: missingAncestry,
  }), /missing protected ancestry\/object readback/)

  const crossRepositoryInventory = structuredClone(fixture.inventory)
  crossRepositoryInventory.repositories[0].github = 'fixture/cross-repository'
  assert.throws(() => validateCertifications(fixture.ledger, {
    ...validationOptions,
    inventory: crossRepositoryInventory,
  }), /object readback digest mismatch/)

  const forbiddenCarrier = structuredClone(fixture.externalRepositoryIdentities)
  const forbiddenIdentity = forbiddenCarrier['authority-canary']
  const originalProof = forbiddenIdentity.subjectProofs[fixture.subjectCommit]
  forbiddenIdentity.subjectProofs[fixture.subjectCommit] = buildRepositorySubjectProof(fixture.inventory.repositories[0], {
    subjectCommit: originalProof.subjectCommit,
    subjectTree: originalProof.subjectTree,
    carrierCommit: originalProof.carrierCommit,
    carrierTree: originalProof.carrierTree,
    relationship: originalProof.relationship,
    changedFiles: [...originalProof.changedFiles, { path: 'src/untested-change.ts', status: 'modified' }]
      .sort((left, right) => compareUtf8Bytes(left.path, right.path)),
  })
  assert.throws(() => validateCertifications(fixture.ledger, {
    ...validationOptions,
    externalRepositoryIdentities: forbiddenCarrier,
  }), /changed forbidden path src\/untested-change\.ts/)

  const wrongProvider = structuredClone(fixture.ledger)
  wrongProvider.certifications[0].runtimeEvidence.providerId = 'claude'
  assert.throws(() => validateCertifications(wrongProvider, validationOptions), /provider binding mismatch/)

  const managedRuntimeWithoutRepository = structuredClone(fixture.ledger)
  managedRuntimeWithoutRepository.certifications[0].runtimeKind = 'codex-desktop'
  const { inventory: ignoredInventory, externalRepositoryIdentities: ignoredRepositoryIdentities, ...withoutRepository } = validationOptions
  assert.throws(() => validateCertifications(managedRuntimeWithoutRepository, withoutRepository), /requires the managed repository inventory/)

  const wrongDistribution = structuredClone(fixture.ledger)
  wrongDistribution.certifications[0].runtimeKind = 'codex-cloud'
  assert.throws(() => validateCertifications(wrongDistribution, validationOptions), /Unknown certification tuple codex\/codex-cloud\/local/)

  const wrongSurface = structuredClone(fixture.ledger)
  wrongSurface.certifications[0].surface = 'remote-control'
  assert.throws(() => validateCertifications(wrongSurface, validationOptions), /Unknown certification tuple codex\/codex-cli\/remote-control/)

  writeFileSync(fixture.evidencePath, `${readFileSync(fixture.evidencePath, 'utf8')} `)
  assert.throws(() => validateCertifications(fixture.ledger, validationOptions), /artifact bytes do not match sha256/)
})

test('repository subject proof terminates at an exact self carrier without recursive certification', () => {
  const repository = { id: 'consumer-canary', github: 'fixture/consumer-canary', role: 'product-consumer', defaultBranch: 'main' }
  const gitCommit = 'a'.repeat(40)
  const gitTree = 'b'.repeat(40)
  const proof = buildRepositorySubjectProof(repository, {
    subjectCommit: gitCommit,
    subjectTree: gitTree,
    carrierCommit: gitCommit,
    carrierTree: gitTree,
  })
  assert.equal(validateRepositorySubjectProof(repository, {
    gitCommit,
    gitTree,
    subjectProofs: { [gitCommit]: proof },
  }, {
    subjectCommit: gitCommit,
    subjectTree: gitTree,
  }, {
    carrierPolicy: { relationship: 'exact-subject', allowedChangedPaths: [] },
  }), true)

  const descendantCommit = 'c'.repeat(40)
  const descendantTree = 'd'.repeat(40)
  const descendantProof = buildRepositorySubjectProof(repository, {
    subjectCommit: gitCommit,
    subjectTree: gitTree,
    carrierCommit: descendantCommit,
    carrierTree: descendantTree,
    changedFiles: [{ path: 'infra/governance/providers/certifications.json', status: 'modified' }],
  })
  assert.throws(() => validateRepositorySubjectProof(repository, {
    gitCommit: descendantCommit,
    gitTree: descendantTree,
    subjectProofs: { [gitCommit]: descendantProof },
  }, {
    subjectCommit: gitCommit,
    subjectTree: gitTree,
  }, {
    carrierPolicy: { relationship: 'exact-subject', allowedChangedPaths: [] },
  }), /must exactly equal the carrier/)
})

test('repository subject proofs require one UTF-8 path order independent of locale collation', () => {
  const unicodeNames = ['Z', 'ä', 'ب', 'あ', '中', '\uE000', '😀']
  const subjectCommit = 'a'.repeat(40)
  const subjectTree = 'b'.repeat(40)
  const carrierCommit = 'c'.repeat(40)
  const carrierTree = 'd'.repeat(40)
  const expectedPaths = unicodeNames
    .map(name => `infra/governance/evidence/provider-runtime/${name}.json`)
    .sort(compareUtf8Bytes)
  const repository = {
    id: 'authority-canary',
    github: 'fixture/authority-canary',
    role: 'authority',
    defaultBranch: 'main',
  }
  const changedFiles = expectedPaths.map(path => ({ path, status: 'added' }))
  const proof = buildRepositorySubjectProof(repository, {
    subjectCommit,
    subjectTree,
    carrierCommit,
    carrierTree,
    changedFiles,
  })
  assert.deepEqual(proof.changedPaths, expectedPaths)
  assert.equal(validateRepositorySubjectProof(repository, {
    gitCommit: carrierCommit,
    gitTree: carrierTree,
    subjectProofs: { [subjectCommit]: proof },
  }, {
    subjectCommit,
    subjectTree,
  }, {
    carrierPolicy: {
      relationship: 'ledger-carrier-descendant',
      allowedChangedPaths: ['infra/governance/evidence/provider-runtime/**'],
    },
  }), true)
  const locales = ['en-US', 'tr-TR', 'sv-SE', 'ja-JP', 'ar']
  const localeOrders = locales.map(locale => [...expectedPaths].sort(new Intl.Collator(locale).compare))
  assert(new Set(localeOrders.map(order => JSON.stringify(order))).size > 1)
  const nonCanonical = localeOrders.find(order => JSON.stringify(order) !== JSON.stringify(expectedPaths))
  assert(nonCanonical)
  assert.throws(() => buildRepositorySubjectProof(repository, {
    subjectCommit,
    subjectTree,
    carrierCommit,
    carrierTree,
    changedFiles: nonCanonical.map(path => ({ path, status: 'added' })),
  }), /changedFiles must be path-sorted/)
})
