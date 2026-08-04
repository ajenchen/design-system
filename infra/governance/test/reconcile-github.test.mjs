import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  FixtureApiClient,
  GhApiClient,
  CommandOffHostMirror,
  applyPlan as reconcileApplyPlan,
  buildPlan as reconcileBuildPlan,
  fetchRepositoryState,
  githubApiRequestDescriptor,
  journalAuthorizationEnvelopeDigest,
  main as reconcileMain,
  reconcileFixtureTestHarness,
  resolveRuntimeValidationContext,
  stageActionTransaction,
  validateActionTransactionClass,
  validateTransactionJournal as reconcileValidateTransactionJournal,
  validateModel as reconcileValidateModel,
} from '../bin/reconcile-github.mjs'
import {
  compareUtf8Bytes,
  readJson as readJsonFile,
  runClosedGh,
  sha256,
  stableStringify,
} from '../lib/common.mjs'
import { workflowIdentity } from '../lib/workflow-trust.mjs'
import { issuerRegistryDigest } from '../lib/issuer-registry.mjs'
import {
  createFleetRecoveryAuthorization,
  historicalControlPlaneDigest,
  normalizeHistoricalControlPlane,
  signFleetRecoveryAuthorization,
  verifyFleetRecoveryAuthorization,
} from '../lib/fleet-recovery-authorization.mjs'
import {
  FLEET_RECONCILE_MIRROR_IDENTITY_KEYS,
  FLEET_RECONCILE_MIRROR_PROTOCOL,
  buildFleetReconcileEventMirrorRequest,
  buildFleetReconcileHeadVerificationRequest,
  fleetReconcileMirrorReceiptDigest,
  fleetReconcileMirrorSignedPayload,
  fleetReconcileMirrorVerificationDigest,
  validateFleetReconcileMirrorIdentity,
  validateFleetReconcileHeadVerification,
  validateFleetReconcileHeadVerificationRequest,
  validateFleetReconcileOffHostReceipt,
  verifyFleetReconcileJournalOffHost,
} from '../lib/fleet-reconcile-mirror.mjs'
import { createExternalRuntimeCertificationFixture } from './fixtures/external-runtime-certification-fixture.mjs'

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/github')
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SCHEMAS = resolve(dirname(fileURLToPath(import.meta.url)), '../schemas')
function readJson(path) {
  const value = readJsonFile(path)
  if (value?.attestationPolicy) value.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
  return value
}
const inventory = readJson(resolve(FIXTURES, 'inventory.json'))
const desired = readJson(resolve(FIXTURES, 'desired.json'))
// The external-ledger writer environment is retired with its ceremony.
desired.managedEnvironmentNames = ['npm-release', 'governance-upgrade']
// The consumer audit workflow bytes live in the consumer repositories, so the
// fixture pins are re-anchored to this in-test workflow and every fixture client
// serves exactly these bytes plus one fresh successful Verify-consumer run.
const CONSUMER_AUDIT_WORKFLOW = [
  'name: Audit',
  'on:',
  '  pull_request:',
  'permissions:',
  '  contents: read',
  'jobs:',
  '  verify-consumer:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: npm run audit-consumer',
  '',
].join('\n')
const consumerAuditIdentity = workflowIdentity(CONSUMER_AUDIT_WORKFLOW)
desired.profiles['product-consumer'].requiredChecks[0].workflowIdentity = {
  contentSha256: consumerAuditIdentity.contentSha256,
  gitBlobSha: consumerAuditIdentity.gitBlobSha,
  semanticVersion: consumerAuditIdentity.semanticVersion,
  semanticSha256: consumerAuditIdentity.semanticSha256,
}

function alignConsumerRoutes(routes) {
  routes['GET /repos/acme/consumer/contents/.github/workflows/audit.yml?ref=main'] = {
    response: { text: CONSUMER_AUDIT_WORKFLOW, sha: consumerAuditIdentity.gitBlobSha },
  }
  routes['GET /repos/acme/consumer/commits/2222222222222222222222222222222222222222/check-runs?per_page=100'] = {
    response: {
      check_runs: [{
        id: 9001,
        name: 'Verify consumer',
        head_sha: '2'.repeat(40),
        external_id: '2'.repeat(40),
        details_url: 'https://github.com/acme/consumer/actions/runs/42',
        status: 'completed',
        conclusion: 'success',
        completed_at: '2026-07-20T00:00:00Z',
        app: { id: 15368, slug: 'github-actions' },
      }],
    },
  }
  routes['GET /repos/acme/consumer/actions/runs/42'] = {
    response: {
      id: 42,
      path: '.github/workflows/audit.yml',
      head_sha: '2'.repeat(40),
      event: 'pull_request',
      status: 'completed',
      conclusion: 'success',
    },
  }
  return routes
}

function alignedFixtureClient(directory = resolve(FIXTURES, 'empty')) {
  const client = new FixtureApiClient(directory)
  alignConsumerRoutes(client.routes)
  return client
}
const baseCertifications = readJson(resolve(FIXTURES, 'certifications.json'))
const baseIssuerRegistry = readJson(resolve(FIXTURES, 'issuer-registry.json'))
const baseRuntimeProfile = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../providers/runtime-conformance.json'))
const compatibilityMatrix = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../providers/compatibility-matrix.json'))

function transactionRuntimeProfile(source) {
  const value = structuredClone(source)
  for (const provider of value.providers.filter(item => item.executionMode === 'local-probe')) {
    const version = provider.certificationTargets[0].distributionVersion
    provider.executionMode = 'external-attested'
    provider.evidenceKind = 'external-runtime-surface-conformance'
    provider.surfacePolicy = { kind: 'inventory-repository-readback' }
    provider.executable = null
    provider.distributionVersionAuthority = {
      kind: 'external-runtime-identity',
      authority: 'fixture-signed-runtime-release',
      productId: provider.id,
      version,
    }
    provider.versionArguments = []
    provider.checks = [
      { id: `${provider.id}-distribution-identity`, driver: 'external-distribution-identity', requiresModel: false },
      { id: `${provider.id}-hard-gate-receipt`, driver: 'external-hard-gate-receipt', requiresModel: false },
      { id: `${provider.id}-runtime-session-binding`, driver: 'external-runtime-session-binding', requiresModel: false },
    ]
  }
  return value
}

function transactionCertificationLedger(source) {
  const value = structuredClone(source)
  for (const certification of value.certifications) {
    certification.status = 'certified'
    certification.certifiedAt = '2026-07-20T00:00:00.000Z'
    certification.expiresAt = '2026-07-20T01:00:00.000Z'
    certification.platformMatrix = certification.platformMatrix.map(target => ({
      ...target,
      status: 'certified',
      limitations: [],
    }))
    certification.checks = [{
      id: 'signed-runtime-evidence',
      status: 'pass',
      evidence: { kind: 'command-output', reference: 'fixture signed runtime evidence' },
    }]
    certification.limitations = []
    delete certification.runtimeEvidence
  }
  return value
}

const transactionRuntimeProfileSource = transactionRuntimeProfile(baseRuntimeProfile)
const transactionBaseCertifications = transactionCertificationLedger(baseCertifications)
// The managed-CI activation fixture is retired with the managed-CI executor
// ceremony; a locally generated runtime-evidence issuer keeps the external
// runtime certification fixture verifiable against the same issuer registry.
function generatedFixtureIssuer(keyId, subject, roles = ['runtime-evidence-issuer']) {
  const keys = generateKeyPairSync('ed25519')
  return {
    ...keys,
    record: {
      keyId,
      subject,
      publicKeySpki: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      roles,
      status: 'active',
      notBefore: '2020-01-01T00:00:00.000Z',
      notAfter: '2030-01-01T00:00:00.000Z',
      revokedAt: null,
    },
  }
}
const runtimeEvidenceIssuer = generatedFixtureIssuer(
  'fixture-runtime-evidence-signer',
  'spiffe://qijenchen.dev/test/runtime-evidence-signer',
)
const issuerRegistry = structuredClone(baseIssuerRegistry)
issuerRegistry.issuers.push(runtimeEvidenceIssuer.record)
const runtimeProfile = structuredClone(transactionRuntimeProfileSource)
runtimeProfile.issuerRegistryDigest = issuerRegistryDigest(issuerRegistry)
runtimeProfile.allowedKeyIds = [runtimeEvidenceIssuer.record.keyId]
runtimeProfile.requiredIssuerQuorum = 1
const externalRuntimeFixture = createExternalRuntimeCertificationFixture({
  inventory,
  desired,
  certifications: transactionBaseCertifications,
  matrix: compatibilityMatrix,
  runtimeProfile,
  signer: { keyId: runtimeEvidenceIssuer.record.keyId, privateKey: runtimeEvidenceIssuer.privateKey },
  now: new Date('2026-07-20T00:00:00Z'),
})

test('command off-host mirror authenticates one private executable and exposes only its explicit credential', t => {
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'closed-off-host-mirror-')))
  t.after(() => rmSync(fixture, { recursive: true, force: true }))
  const command = join(fixture, 'mirror-adapter')
  const leakMarker = join(fixture, 'ambient-secret-leaked')
  writeFileSync(command, `#!/bin/sh
cat >/dev/null
if [ -n "\${UNRELATED_RECONCILE_SECRET:-}" ]; then
  printf '%s\\n' leaked > ${JSON.stringify(leakMarker)}
  exit 9
fi
if [ "\${GOVERNANCE_OFF_HOST_MIRROR_TOKEN:-}" != fixture-mirror-token ]; then
  exit 8
fi
printf '%s\\n' '{"ok":true}'
`)
  chmodSync(command, 0o555)
  process.env.UNRELATED_RECONCILE_SECRET = 'must-not-cross-command-boundary'
  t.after(() => { delete process.env.UNRELATED_RECONCILE_SECRET })
  const mirror = new CommandOffHostMirror(command, { credential: 'fixture-mirror-token' })
  t.after(() => rmSync(mirror.privateRoot, { recursive: true, force: true }))
  assert.deepEqual(mirror.append({ schemaVersion: 1 }), { ok: true })
  assert.equal(existsSync(leakMarker), false)
  chmodSync(command, 0o755)
  writeFileSync(command, '#!/bin/sh\nexit 0\n')
  assert.throws(
    () => mirror.verify({ schemaVersion: 1 }),
    /source command changed after authentication/,
  )
})

test('closed GitHub CLI cache is source-scoped and never inherits PATH or unrelated secrets', t => {
  const fixture = mkdtempSync(join(tmpdir(), 'closed-gh-transport-'))
  t.after(() => rmSync(fixture, { recursive: true, force: true }))
  const explicitGh = join(fixture, 'fixture-gh')
  const pathGh = join(fixture, 'gh')
  const pathMarker = join(fixture, 'path-gh-executed')
  writeFileSync(explicitGh, `#!/bin/sh
if [ -n "\${UNRELATED_GH_SECRET:-}" ]; then exit 7; fi
if [ "\${GH_TOKEN:-}" != fixture-gh-token ]; then exit 8; fi
printf '%s\\n' fixture-explicit-gh
`)
  writeFileSync(pathGh, `#!/bin/sh
printf '%s\\n' invoked > ${JSON.stringify(pathMarker)}
exit 9
`)
  chmodSync(explicitGh, 0o755)
  chmodSync(pathGh, 0o755)
  const explicit = runClosedGh(['--version'], {
    cwd: fixture,
    environment: {},
    executable: explicitGh,
    repoRoot: REPO_ROOT,
    token: 'fixture-gh-token',
    tokenEnvironmentName: null,
  })
  assert.equal(explicit.status, 0)
  assert.equal(explicit.stdout.trim(), 'fixture-explicit-gh')
  const platformDefault = runClosedGh(['--version'], {
    cwd: fixture,
    environment: { PATH: fixture, UNRELATED_GH_SECRET: 'must-not-cross' },
    repoRoot: REPO_ROOT,
    requireToken: false,
  })
  assert.equal(platformDefault.status, 0)
  assert.match(platformDefault.stdout, /^gh version /)
  assert.equal(existsSync(pathMarker), false)
  assert.throws(
    () => runClosedGh(['--version'], {
      cwd: fixture,
      environment: {},
      repoRoot: REPO_ROOT,
      requireToken: false,
      runtimePlatform: 'win32',
    }),
    /unsupported on platform win32/,
  )
})
after(() => externalRuntimeFixture.dispose())
const certifications = externalRuntimeFixture.certifications
const runtimeValidationContext = externalRuntimeFixture.runtimeValidationContext
const waivers = { schemaVersion: 1, waivers: [] }
const NOW = new Date('2026-07-20T00:00:00Z')
const issuerValidationTime = registry => new Date(
  Math.max(...registry.issuers.map(issuer => Date.parse(issuer.notBefore))) + 1,
)
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIONNr2Y1hDSWkLyinTTfdEU1ilmYox3tHunig5bPsrEp
-----END PRIVATE KEY-----
`
const MIRROR_KEYS = generateKeyPairSync('ed25519')
const MIRROR_PUBLIC_KEY_SPKI = MIRROR_KEYS.publicKey.export({ type: 'spki', format: 'der' })
const MIRROR_ADAPTER_SHA256 = 'e'.repeat(64)
const activationInventory = readJson(resolve(dirname(fileURLToPath(import.meta.url)), '../inventory/managed-repos.json'))
function fixtureMirrorReadback() {
  return {
    provider: 'fixture-independent-worm',
    protocolVersion: FLEET_RECONCILE_MIRROR_PROTOCOL.protocolVersion,
    endpoint: 'https://evidence.example.test/v1/fleet-reconcile',
    tenant: 'fixture-tenant',
    container: 'fixture-governance-worm',
    wormMode: 'compliance-object-lock',
    lifecyclePolicyDigest: 'd'.repeat(64),
    minimumRetentionDays: 365,
    writerPrincipal: 'fixture-mirror-writer',
    verifierPrincipal: 'fixture-mirror-verifier',
    adapterCommandSha256: MIRROR_ADAPTER_SHA256,
    receiptSigningKeyId: 'fixture-mirror-receipt-v1',
    receiptSigningPublicKeySpki: MIRROR_PUBLIC_KEY_SPKI.toString('base64'),
    receiptSigningPublicKeySpkiSha256: sha256(MIRROR_PUBLIC_KEY_SPKI),
    signatureAlgorithm: 'ed25519',
    receiptId: 'fixture-activation-receipt',
    eventHeadDigest: '7'.repeat(64),
    retentionUntil: '2030-01-01T00:00:00.000Z',
    appendOnly: true,
    independentAdministration: true,
    receiptSha256: '8'.repeat(64),
  }
}

function validateTransactionJournal(journal, options = {}) {
  return reconcileValidateTransactionJournal(journal, options)
}

function recoverTransaction(journalPath, client, options = {}) {
  return reconcileFixtureTestHarness.recoverTransaction(journalPath, client, options)
}

function rollbackTransaction(journalPath, client, options = {}) {
  return reconcileFixtureTestHarness.rollbackTransaction(journalPath, client, options)
}

function offHostMirror() {
  return {
    adapterCommandSha256: MIRROR_ADAPTER_SHA256,
    append(envelope) {
      const receipt = {
        schemaVersion: 1,
        kind: FLEET_RECONCILE_MIRROR_PROTOCOL.receiptKind,
        protocolVersion: envelope.protocolVersion,
        provider: envelope.provider,
        endpoint: envelope.endpoint,
        tenant: envelope.tenant,
        container: envelope.container,
        principal: envelope.principal,
        receiptId: `${envelope.transactionId}:${envelope.sequence}`,
        transactionId: envelope.transactionId,
        sequence: envelope.sequence,
        eventDigest: envelope.eventDigest,
        eventHeadDigest: envelope.eventHeadDigest,
        idempotencyKey: envelope.idempotencyKey,
        requestNonce: envelope.requestNonce,
        requestDigest: envelope.requestDigest,
        receivedAt: envelope.event.at,
        retainedUntil: '2030-01-01T00:00:00.000Z',
        appendOnly: true,
        independentAdministration: true,
        signingKeyId: 'fixture-mirror-receipt-v1',
        signatureAlgorithm: 'ed25519',
      }
      receipt.signature = sign(null, fleetReconcileMirrorSignedPayload(receipt, {
        digestField: 'receiptSha256',
        domain: FLEET_RECONCILE_MIRROR_PROTOCOL.receiptSignatureDomain,
      }), MIRROR_KEYS.privateKey).toString('base64url')
      receipt.receiptSha256 = fleetReconcileMirrorReceiptDigest(receipt)
      return receipt
    },
    verify(envelope) {
      const verification = {
        schemaVersion: 1,
        kind: FLEET_RECONCILE_MIRROR_PROTOCOL.verificationKind,
        protocolVersion: envelope.protocolVersion,
        provider: envelope.provider,
        endpoint: envelope.endpoint,
        tenant: envelope.tenant,
        container: envelope.container,
        principal: envelope.principal,
        verificationId: `${envelope.transactionId}:${envelope.eventCount}:${envelope.requestedAt}`,
        transactionId: envelope.transactionId,
        eventHeadDigest: envelope.eventHeadDigest,
        eventCount: envelope.eventCount,
        requestNonce: envelope.requestNonce,
        requestDigest: envelope.requestDigest,
        verifiedAt: envelope.requestedAt,
        retainedUntil: '2030-01-01T00:00:00.000Z',
        appendOnly: true,
        independentAdministration: true,
        signingKeyId: 'fixture-mirror-receipt-v1',
        signatureAlgorithm: 'ed25519',
      }
      verification.signature = sign(null, fleetReconcileMirrorSignedPayload(verification, {
        digestField: 'verificationSha256',
        domain: FLEET_RECONCILE_MIRROR_PROTOCOL.verificationSignatureDomain,
      }), MIRROR_KEYS.privateKey).toString('base64url')
      verification.verificationSha256 = fleetReconcileMirrorVerificationDigest(verification)
      return verification
    },
  }
}

function activatedMirrorIdentity() {
  const readback = fixtureMirrorReadback()
  return Object.fromEntries(FLEET_RECONCILE_MIRROR_IDENTITY_KEYS.map(key => [key, structuredClone(readback[key])]))
}

function mirrorProtocolFixture() {
  const mirrorIdentity = activatedMirrorIdentity()
  const event = {
    schemaVersion: 1,
    sequence: 1,
    transactionId: 'github-reconcile-1721433600000-aaaaaaaaaaaa',
    type: 'prepared',
    subjectActionId: null,
    at: NOW.toISOString(),
    previousDigest: '0'.repeat(64),
    authorizationEnvelopeDigest: '1'.repeat(64),
    runtimeState: {},
    stateDigest: '2'.repeat(64),
    mirrorRequestNonce: '00000000-0000-4000-8000-000000000001',
    eventDigest: '3'.repeat(64),
  }
  const journal = {
    mirrorIdentity,
    transactionId: event.transactionId,
    eventHeadDigest: event.eventDigest,
    events: [event],
  }
  const request = buildFleetReconcileEventMirrorRequest(journal, event)
  return { event, journal, mirrorIdentity, request }
}

test('fleet reconcile head-verification request is closed, deterministic, and bound to the complete chain', () => {
  const { journal, mirrorIdentity } = mirrorProtocolFixture()
  const request = buildFleetReconcileHeadVerificationRequest(journal, {
    mirrorIdentity,
    requestNonce: '00000000-0000-4000-8000-000000000002',
    requestedAt: NOW,
  })
  assert.deepEqual(
    request,
    buildFleetReconcileHeadVerificationRequest(journal, {
      mirrorIdentity,
      requestNonce: request.requestNonce,
      requestedAt: NOW,
    }),
  )
  assert.equal(validateFleetReconcileHeadVerificationRequest(request, {
    journal,
    mirrorIdentity,
    at: NOW,
  }), request)
  const verification = offHostMirror().verify(request)
  assert.equal(validateFleetReconcileHeadVerification(verification, {
    journal,
    mirrorIdentity,
    request,
    at: NOW,
  }), verification)

  assert.throws(
    () => validateFleetReconcileHeadVerificationRequest(
      { ...request, untrustedExtension: true },
      { journal, mirrorIdentity, at: NOW },
    ),
    /invalid or open shape/,
  )
  assert.throws(
    () => validateFleetReconcileHeadVerificationRequest(
      { ...request, eventCount: request.eventCount + 1 },
      { journal, mirrorIdentity, at: NOW },
    ),
    /complete event chain/,
  )
  assert.throws(
    () => validateFleetReconcileHeadVerificationRequest(
      { ...request, requestDigest: 'f'.repeat(64) },
      { journal, mirrorIdentity, at: NOW },
    ),
    /request digest mismatch/,
  )
})

test('fleet reconcile mirror protocol has one shared implementation with byte-identical domains', () => {
  assert.deepEqual(FLEET_RECONCILE_MIRROR_PROTOCOL, {
    protocolVersion: 'fleet-reconcile-mirror-v1',
    receiptKind: 'fleet-reconcile-off-host-ack',
    verificationKind: 'fleet-reconcile-off-host-verification',
    requestDigestDomain: 'fleet-reconcile-off-host-request-v1',
    eventIdempotencyDomain: 'fleet-reconcile-event-idempotency-v1',
    receiptDigestDomain: 'fleet-reconcile-off-host-receipt-v1',
    receiptSignatureDomain: 'fleet-reconcile-off-host-receipt-signature-v1',
    verificationDigestDomain: 'fleet-reconcile-off-host-verification-v1',
    verificationSignatureDomain: 'fleet-reconcile-off-host-verification-signature-v1',
    clockSkewMs: 300_000,
  })

  const reconcileSource = readFileSync(resolve(REPO_ROOT, 'infra/governance/bin/reconcile-github.mjs'), 'utf8')
  const protocolSource = readFileSync(resolve(REPO_ROOT, 'infra/governance/lib/fleet-reconcile-mirror.mjs'), 'utf8')
  for (const oldDefinition of [
    'function receiptDigest(',
    'function verificationDigest(',
    'function mirrorRequestDigest(',
    'function validateMirrorIdentity(',
    'function validateOffHostReceipt(',
    'function verifyJournalOffHost(',
  ]) assert.equal(reconcileSource.includes(oldDefinition), false, `reconcile retained duplicate protocol implementation: ${oldDefinition}`)
  for (const domain of [
    FLEET_RECONCILE_MIRROR_PROTOCOL.requestDigestDomain,
    FLEET_RECONCILE_MIRROR_PROTOCOL.eventIdempotencyDomain,
    FLEET_RECONCILE_MIRROR_PROTOCOL.receiptDigestDomain,
    FLEET_RECONCILE_MIRROR_PROTOCOL.receiptSignatureDomain,
    FLEET_RECONCILE_MIRROR_PROTOCOL.verificationDigestDomain,
    FLEET_RECONCILE_MIRROR_PROTOCOL.verificationSignatureDomain,
  ]) {
    assert.equal(reconcileSource.includes(domain), false, `reconcile retained protocol domain bytes: ${domain}`)
    assert.equal(protocolSource.split(domain).length - 1, 1, `shared protocol domain is not unique: ${domain}`)
  }

  const { event, journal, request } = mirrorProtocolFixture()
  assert.deepEqual(request, buildFleetReconcileEventMirrorRequest(journal, event))
  const unsignedRequest = structuredClone(request)
  delete unsignedRequest.requestDigest
  assert.equal(request.requestDigest, sha256(`fleet-reconcile-off-host-request-v1\n${stableStringify(unsignedRequest, 0)}`))
  assert.equal(request.idempotencyKey, sha256(`fleet-reconcile-event-idempotency-v1\n${journal.transactionId}\n${event.sequence}\n${event.eventDigest}`))

  const receipt = offHostMirror().append(request)
  const unsignedReceipt = structuredClone(receipt)
  delete unsignedReceipt.receiptSha256
  assert.equal(receipt.receiptSha256, sha256(`fleet-reconcile-off-host-receipt-v1\n${stableStringify(unsignedReceipt, 0)}`))
  const signingProjection = structuredClone(receipt)
  delete signingProjection.signature
  delete signingProjection.receiptSha256
  assert.equal(
    fleetReconcileMirrorSignedPayload(receipt, {
      digestField: 'receiptSha256',
      domain: FLEET_RECONCILE_MIRROR_PROTOCOL.receiptSignatureDomain,
    }).toString('utf8'),
    `fleet-reconcile-off-host-receipt-signature-v1\n${stableStringify(signingProjection, 0)}`,
  )
})

test('shared mirror validators preserve subject, source, retention, signature, and independent readback binding', () => {
  const { event, journal, mirrorIdentity, request } = mirrorProtocolFixture()
  assert.equal(validateFleetReconcileMirrorIdentity(mirrorIdentity).asymmetricKeyType, 'ed25519')

  const mirror = offHostMirror()
  const receipt = mirror.append(request)
  assert.equal(validateFleetReconcileOffHostReceipt(receipt, {
    journal,
    event,
    mirrorIdentity,
    request,
    at: NOW,
    requireFresh: true,
  }), true)

  const verification = verifyFleetReconcileJournalOffHost(journal, mirror, { at: NOW })
  assert.equal(verification.principal, mirrorIdentity.verifierPrincipal)
  assert.notEqual(verification.principal, receipt.principal)
  const unsignedVerification = structuredClone(verification)
  delete unsignedVerification.verificationSha256
  assert.equal(verification.verificationSha256, sha256(`fleet-reconcile-off-host-verification-v1\n${stableStringify(unsignedVerification, 0)}`))

  const wrongSubject = structuredClone(receipt)
  wrongSubject.principal = mirrorIdentity.verifierPrincipal
  assert.throws(() => validateFleetReconcileOffHostReceipt(wrongSubject, { journal, event, mirrorIdentity, request, at: NOW }), /differs from the activated mirror identity/)

  const wrongSource = structuredClone(receipt)
  wrongSource.eventDigest = '4'.repeat(64)
  assert.throws(() => validateFleetReconcileOffHostReceipt(wrongSource, { journal, event, mirrorIdentity, request, at: NOW }), /event\/request binding mismatch/)

  const shortRetention = structuredClone(receipt)
  shortRetention.retainedUntil = '2026-07-21T00:00:00.000Z'
  assert.throws(() => validateFleetReconcileOffHostReceipt(shortRetention, { journal, event, mirrorIdentity, request, at: NOW }), /receipt retention is invalid/)

  const openReceipt = { ...receipt, mutableLatest: true }
  assert.throws(() => validateFleetReconcileOffHostReceipt(openReceipt, { journal, event, mirrorIdentity, request, at: NOW }), /invalid or open shape/)

  const samePrincipal = { ...mirrorIdentity, verifierPrincipal: mirrorIdentity.writerPrincipal }
  assert.throws(() => validateFleetReconcileMirrorIdentity(samePrincipal), /mirror identity is invalid/)

  const selfReportedMirror = offHostMirror()
  const verify = selfReportedMirror.verify.bind(selfReportedMirror)
  selfReportedMirror.verify = envelope => ({ ...verify(envelope), independentAdministration: false })
  assert.throws(() => verifyFleetReconcileJournalOffHost(journal, selfReportedMirror, { at: NOW }), /not independent append-only evidence/)
})

function generatedRecoveryIssuer(name) {
  const keys = generateKeyPairSync('ed25519')
  return {
    keys,
    record: {
      keyId: `recovery-${name}`,
      subject: `recovery-authority-${name}`,
      publicKeySpki: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      roles: ['privileged-change-authorizer', 'apply-authorizer', 'completion-attestor', 'root-rotator'],
      status: 'active',
      notBefore: '2026-01-01T00:00:00.000Z',
      notAfter: '2030-01-01T00:00:00.000Z',
      revokedAt: null,
    },
  }
}

function registryFor(records) {
  return { $schema: '../schemas/issuer-registry.schema.json', schemaVersion: 1, algorithm: 'ed25519', issuers: records }
}

function verifiedEvidenceFor(rings) {
  const candidate = rings.candidateRelease
  if (candidate === null) return null
  const finalizationReceiptSha256 = 'b'.repeat(64)
  const releaseTrustEvidenceSha256 = 'c'.repeat(64)
  const assets = [
    { id: '451', name: `qijenchen-design-system-${candidate.version}.tgz`, digest: `sha256:${'1'.repeat(64)}`, size: 101 },
    { id: '452', name: `qijenchen-governance-${candidate.version}.tgz`, digest: `sha256:${'2'.repeat(64)}`, size: 102 },
    { id: '453', name: `qijenchen-storybook-config-${candidate.version}.tgz`, digest: `sha256:${'3'.repeat(64)}`, size: 103 },
    { id: '454', name: 'release-bom.json', digest: `sha256:${candidate.bomSha256}`, size: 104 },
    { id: '455', name: 'release.sbom.cdx.json', digest: `sha256:${'4'.repeat(64)}`, size: 105 },
    { id: '456', name: 'product-template-scaffold.lock.json', digest: `sha256:${'5'.repeat(64)}`, size: 106 },
    { id: '457', name: 'npm-finalization-receipt.json', digest: `sha256:${finalizationReceiptSha256}`, size: 107 },
    { id: '458', name: 'release-trust-preflight.json', digest: `sha256:${releaseTrustEvidenceSha256}`, size: 108 },
  ].sort((left, right) => compareUtf8Bytes(left.name, right.name))
  return {
    schemaVersion: 2,
    candidateReleaseDigest: sha256(stableStringify(candidate, 0)),
    repository: 'ajenchen/design-system',
    tag: `v${candidate.version}`,
    version: candidate.version,
    releaseId: '123',
    tagObject: '3'.repeat(40),
    tagVerification: {
      verified: true,
      reason: 'valid',
      verifiedAt: NOW.toISOString(),
      signatureSha256: '6'.repeat(64),
      payloadSha256: '7'.repeat(64),
    },
    sourceCommit: candidate.sourceCommit,
    sourceTree: candidate.sourceTree,
    bomSha256: candidate.bomSha256,
    releaseSetSha256: '8'.repeat(64),
    finalizationReceiptSha256,
    releaseTrustEvidenceSha256,
    assets,
    packages: structuredClone(candidate.packages),
  }
}

function buildPlan(options) {
  const verifiedReleaseEvidence = Object.hasOwn(options, 'verifiedReleaseEvidence')
    ? options.verifiedReleaseEvidence
    : verifiedEvidenceFor(options.rings)
  return reconcileFixtureTestHarness.buildPlan({
    ...options,
    now: options.now ?? NOW,
    runtimeValidationContext: options.runtimeValidationContext ?? runtimeValidationContext,
    verifiedReleaseEvidence,
  })
}

class ReadbackGhApiClient extends GhApiClient {
  constructor(routes) {
    super()
    this.routes = structuredClone(routes)
    this.calls = []
    this.commitReads = new Map()
    this.mutateCommitRead = null
  }

  request(method, path, body, options = {}) {
    this.calls.push({ method, path, body: body === undefined ? undefined : structuredClone(body) })
    const route = this.routes[`${method} ${path}`]
    if (!route && options.allow404) return null
    if (!route) throw new Error(`Live readback fixture has no route for ${method} ${path}`)
    if (route.error) throw new Error(`Live readback fixture error for ${method} ${path}: ${route.error}`)
    const response = structuredClone(route.response ?? null)
    if (method === 'GET' && /\/commits\/[^/?]+$/.test(path)) {
      const read = (this.commitReads.get(path) ?? 0) + 1
      this.commitReads.set(path, read)
      if (this.mutateCommitRead) this.mutateCommitRead(response, { path, read })
    }
    return response
  }
}

function uncertifiedRuntimeLedger() {
  const value = structuredClone(baseCertifications)
  for (const certification of value.certifications) {
    if (certification.status !== 'certified' && certification.status !== 'conditional') continue
    certification.status = 'not-certified'
    certification.limitations = ['Live runtime identity wiring fixture intentionally carries no certified runtime evidence.']
    delete certification.runtimeEvidence
    delete certification.certifiedAt
    delete certification.expiresAt
    certification.platformMatrix = certification.platformMatrix.map(target => ({
      ...target,
      status: 'not-certified',
      limitations: ['Live runtime identity wiring fixture intentionally carries no certified runtime evidence.'],
      runtimeEvidence: undefined,
      certifiedAt: undefined,
      expiresAt: undefined,
    }))
    for (const target of certification.platformMatrix) {
      delete target.runtimeEvidence
      delete target.certifiedAt
      delete target.expiresAt
    }
  }
  return value
}

function certificationsWithoutExternalGitHubTrust() {
  const value = structuredClone(certifications)
  const certification = value.certifications.find(item => item.surface === 'github-actions' && item.repositoryRole === 'product-consumer')
  certification.status = 'not-certified'
  certification.limitations = ['GitHub App identities are unresolved, so external runtime trust is not certified.']
  delete certification.runtimeEvidence
  delete certification.certifiedAt
  delete certification.expiresAt
  certification.platformMatrix = certification.platformMatrix.map(target => ({
    ...target,
    status: 'not-certified',
    limitations: ['GitHub App identities are unresolved, so external runtime trust is not certified.'],
  }))
  return value
}

function validateModel(...args) {
  return reconcileFixtureTestHarness.validatePartialInventoryModel(...args, runtimeValidationContext)
}

function applyPlan(plan, client, options) {
  const verifiedReleaseEvidence = Object.hasOwn(options, 'verifiedReleaseEvidence')
    ? options.verifiedReleaseEvidence
    : verifiedEvidenceFor(options.rings)
  return reconcileFixtureTestHarness.applyPlan(plan, client, {
    certifications,
    waivers,
    runtimeProfile,
    runtimeValidationContext,
    clock: () => options.now ?? NOW,
    ...options,
    verifiedReleaseEvidence,
  })
}

function reloadableGovernance({
  currentInventory = inventory,
  currentDesired = desired,
  currentRings,
  currentCertifications = certifications,
  currentWaivers = waivers,
  currentRuntimeProfile = runtimeProfile,
  currentIssuerRegistry = issuerRegistry,
} = {}) {
  return {
    inventory: structuredClone(currentInventory),
    desired: structuredClone(currentDesired),
    rings: structuredClone(currentRings),
    certifications: structuredClone(currentCertifications),
    waivers: structuredClone(currentWaivers),
    runtimeProfile: structuredClone(currentRuntimeProfile),
    issuerRegistry: structuredClone(currentIssuerRegistry),
  }
}

function clientWithWorkflowRun({
  app = { id: 15368, slug: 'github-actions' },
  event = 'dynamic',
  path = 'dynamic/dependabot/dependabot-updates',
} = {}) {
  const client = alignedFixtureClient()
  const runId = '77'
  client.routes['GET /repos/acme/consumer/commits/2222222222222222222222222222222222222222/check-runs?per_page=100'].response.check_runs.push({
    id: 9077,
    name: 'Dependabot Updates',
    head_sha: '2'.repeat(40),
    details_url: `https://github.com/acme/consumer/actions/runs/${runId}`,
    status: 'completed',
    conclusion: 'success',
    completed_at: '2026-07-20T00:00:00Z',
    app,
  })
  client.routes[`GET /repos/acme/consumer/actions/runs/${runId}`] = {
    response: {
      id: Number(runId),
      path,
      head_sha: '2'.repeat(40),
      event,
      status: 'completed',
      conclusion: 'success',
    },
  }
  return client
}

function fetchWorkflowRunFixture(client) {
  return fetchRepositoryState(client, inventory.repositories[0], {
    requiredChecks: [],
    declaredEnvironments: [],
    tagPolicy: {},
    immutableReleases: false,
  }, desired)
}

class ReadbackClient {
  constructor() {
    this.calls = []
    this.rulesets = new Map()
    this.environments = new Map()
    this.actionsWorkflowPermissions = {
      default_workflow_permissions: 'read',
      can_approve_pull_request_reviews: true,
    }
    this.nextId = 100
    this.fixture = alignConsumerRoutes(readJson(resolve(FIXTURES, 'empty/routes.json')))
  }

  request(method, path, body, options = {}) {
    this.calls.push({ method, path, body })
    if (method === 'GET' && path === '/repos/acme/consumer') return structuredClone(this.fixture['GET /repos/acme/consumer'].response)
    if (method === 'GET' && path === '/repos/acme/consumer/commits/main') return { sha: '2222222222222222222222222222222222222222', commit: { committer: { date: '2026-07-19T23:00:00Z' } } }
    if (method === 'GET' && path === '/repos/acme/consumer/actions/permissions/workflow') return structuredClone(this.actionsWorkflowPermissions)
    if (method === 'PUT' && path === '/repos/acme/consumer/actions/permissions/workflow') {
      this.actionsWorkflowPermissions = structuredClone(body)
      return null
    }
    const checkRuns = path.match(/^\/repos\/acme\/consumer\/commits\/([a-f0-9]{40})\/check-runs\?per_page=100$/)
    if (method === 'GET' && checkRuns) {
      const response = structuredClone(this.fixture['GET /repos/acme/consumer/commits/2222222222222222222222222222222222222222/check-runs?per_page=100'].response)
      for (const run of response.check_runs) {
        run.head_sha = checkRuns[1]
        run.external_id = run.external_id.replaceAll('2222222222222222222222222222222222222222', checkRuns[1])
      }
      return response
    }
    if (method === 'GET' && path.startsWith('/repos/acme/consumer/contents/.github/workflows/')) {
      const route = this.fixture[`GET ${path}`]
      if (route) return structuredClone(route.response)
    }
    if (method === 'GET' && path === '/repos/acme/consumer/actions/runs/42') {
      return structuredClone(this.fixture['GET /repos/acme/consumer/actions/runs/42'].response)
    }
    if (method === 'GET' && (path.endsWith('/rulesets') || path.endsWith('/rulesets?per_page=100'))) {
      return [...this.rulesets.values()].map(item => ({ id: item.id, name: item.name }))
    }
    if (method === 'GET' && path === '/repos/acme/consumer/environments?per_page=100') {
      return { total_count: this.environments.size, environments: [...this.environments.keys()].map(name => ({ name })) }
    }
    if (method === 'POST' && path.endsWith('/rulesets')) {
      const id = ++this.nextId
      this.rulesets.set(String(id), { id, ...structuredClone(body) })
      return { id }
    }
    const ruleset = path.match(/\/rulesets\/(\d+)$/)
    if (method === 'GET' && ruleset) return this.rulesets.get(ruleset[1]) ?? (options.allow404 ? null : undefined)
    if (method === 'PUT' && path.includes('/environments/')) {
      const name = decodeURIComponent(path.split('/').at(-1))
      this.environments.set(name, { name, ...structuredClone(body) })
      return { id: ++this.nextId, name }
    }
    if (method === 'GET' && path.includes('/environments/')) {
      const name = decodeURIComponent(path.split('/').at(-1))
      return this.environments.get(name) ?? (options.allow404 ? null : undefined)
    }
    if (method === 'GET' && path.endsWith('/immutable-releases')) return { enabled: false }
    if (method === 'DELETE' && ruleset) {
      this.rulesets.delete(ruleset[1])
      return null
    }
    if (method === 'DELETE' && path.includes('/environments/')) {
      this.environments.delete(decodeURIComponent(path.split('/').at(-1)))
      return null
    }
    throw new Error(`Unexpected readback route ${method} ${path}`)
  }
}

function privilegedPolicyFor(registry, {
  quorum = 1,
  allowedKeyIds = registry.issuers.map(item => item.keyId),
  profileId = 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM',
} = {}) {
  return {
    $schema: 'schemas/privileged-trust-roots.schema.json',
    schemaVersion: 2,
    repository: 'ajenchen/design-system',
    algorithm: 'ed25519',
    externalActivationPolicyDigest: 'a'.repeat(64),
    authorizationProfileId: profileId,
    authorizationProfileDigest: 'b'.repeat(64),
    maxAuthorizationTtlMinutes: 60,
    clockSkewSeconds: 0,
    authorizationDirectory: 'governance/authorizations',
    issuerRegistryDigest: issuerRegistryDigest(registry),
    allowedKeyIds,
    trustRootQuorum: quorum,
    bootstrap: { schemaVersion: 1, enabled: false, ownerLogins: ['ajenchen'], nonce: 'fixture-bootstrap-closed-v1', maxCommentTtlMinutes: 30 },
    protectedPaths: [],
    protectedPrefixes: [],
  }
}

const defaultRecoveryRoot = generatedRecoveryIssuer('default-root')

function inventoryWithAuthority(value = inventory) {
  if (value.repositories.some(repository => repository.role === 'authority')) return structuredClone(value)
  const result = structuredClone(activationInventory)
  const authority = result.repositories.find(repository => repository.role === 'authority')
  const authorityOwner = authority.github.split('/')[0]
  const consumers = value.repositories.filter(repository => repository.role === 'product-consumer')
  assert.equal(consumers.length, 1, 'authority fixture requires exactly one product consumer')
  const consumer = structuredClone(consumers[0])
  consumer.github = `${authorityOwner}/${consumer.id}`
  consumer.localPathFromGovernanceRoot = `../../../${consumer.id}`
  result.repositories = [
    ...result.repositories.filter(repository => repository.role !== 'product-consumer'),
    consumer,
  ]
  result.certificationCanaries['product-consumer'] = { repositoryId: consumer.id }
  return result
}

function recoveryAuthorizationFor({
  journalPath,
  currentInventory = inventoryWithAuthority(),
  currentDesired = desired,
  currentRings,
  currentIssuerRegistry,
  privilegedPolicy,
  applySigners = [{ keyId: 'fixture-ed25519', subject: 'fixture-governance', privateKey: PRIVATE_KEY }],
  rootSigners,
  issuedAt = NOW.toISOString(),
  expiresAt = '2026-07-20T00:45:00.000Z',
}) {
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  const effectiveIssuerRegistry = currentIssuerRegistry ?? registryFor([...issuerRegistry.issuers, defaultRecoveryRoot.record])
  const effectiveRings = structuredClone(currentRings)
  effectiveRings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(effectiveIssuerRegistry)
  const effectiveRootSigners = rootSigners ?? [{
    keyId: defaultRecoveryRoot.record.keyId,
    subject: defaultRecoveryRoot.record.subject,
    privateKey: defaultRecoveryRoot.keys.privateKey,
  }]
  const effectivePrivilegedPolicy = privilegedPolicy ?? privilegedPolicyFor(effectiveIssuerRegistry, {
    allowedKeyIds: effectiveRootSigners.map(item => item.keyId),
  })
  const authorization = createFleetRecoveryAuthorization({
    transactionId: journal.transactionId,
    historicalControlPlaneDigest: journal.historicalControlPlaneDigest,
    journalAuthorizationEnvelopeDigest: journal.authorizationEnvelopeDigest,
    journalEventHeadDigest: journal.eventHeadDigest,
    rollbackPlanDigest: journal.rollbackPlanDigest,
    inventory: currentInventory,
    desired: currentDesired,
    attestationPolicy: effectiveRings.attestationPolicy,
    privilegedPolicy: effectivePrivilegedPolicy,
    issuerRegistry: effectiveIssuerRegistry,
    issuedAt,
    expiresAt,
  })
  for (const signer of applySigners) signFleetRecoveryAuthorization(authorization, { signerKeyId: signer.keyId, subject: signer.subject, privateKey: signer.privateKey, gates: ['apply'] })
  for (const signer of effectiveRootSigners) signFleetRecoveryAuthorization(authorization, { signerKeyId: signer.keyId, subject: signer.subject, privateKey: signer.privateKey, gates: ['root'] })
  return {
    authorization,
    privilegedPolicy: effectivePrivilegedPolicy,
    issuerRegistry: effectiveIssuerRegistry,
    inventory: currentInventory,
    rings: effectiveRings,
  }
}

test('single-owner fleet recovery may use one honestly governed dual-role signer without claiming independent custody', () => {
  const signer = generatedRecoveryIssuer('single-owner-dual-role')
  const currentIssuerRegistry = registryFor([signer.record])
  const currentInventory = inventoryWithAuthority()
  const currentRings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  currentRings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(currentIssuerRegistry)
  currentRings.attestationPolicy.allowedKeyIds = [signer.record.keyId]
  currentRings.attestationPolicy.applyAuthorizationQuorum = 1
  currentRings.attestationPolicy.completionAttestationQuorum = 1
  const privilegedPolicy = privilegedPolicyFor(currentIssuerRegistry, {
    allowedKeyIds: [signer.record.keyId],
  })
  const journal = {
    transactionId: 'single-owner-recovery',
    historicalControlPlaneDigest: '1'.repeat(64),
    authorizationEnvelopeDigest: '2'.repeat(64),
    eventHeadDigest: '3'.repeat(64),
    rollbackPlanDigest: '4'.repeat(64),
  }
  const authorization = createFleetRecoveryAuthorization({
    transactionId: journal.transactionId,
    historicalControlPlaneDigest: journal.historicalControlPlaneDigest,
    journalAuthorizationEnvelopeDigest: journal.authorizationEnvelopeDigest,
    journalEventHeadDigest: journal.eventHeadDigest,
    rollbackPlanDigest: journal.rollbackPlanDigest,
    inventory: currentInventory,
    desired,
    attestationPolicy: currentRings.attestationPolicy,
    privilegedPolicy,
    issuerRegistry: currentIssuerRegistry,
    issuedAt: '2026-07-20T00:00:00.000Z',
    expiresAt: '2026-07-20T00:45:00.000Z',
  })
  const signerOptions = {
    signerKeyId: signer.record.keyId,
    subject: signer.record.subject,
    privateKey: signer.keys.privateKey,
  }
  signFleetRecoveryAuthorization(authorization, { ...signerOptions, gates: ['apply'] })
  signFleetRecoveryAuthorization(authorization, { ...signerOptions, gates: ['root'] })
  assert.equal(verifyFleetRecoveryAuthorization(authorization, {
    journal,
    inventory: currentInventory,
    desired,
    attestationPolicy: currentRings.attestationPolicy,
    privilegedPolicy,
    issuerRegistry: currentIssuerRegistry,
    now: NOW,
  }), true)
})

test('maximum-assurance fleet recovery preserves disjoint apply and root signer subjects', () => {
  const first = generatedRecoveryIssuer('maximum-overlap-one')
  const second = generatedRecoveryIssuer('maximum-overlap-two')
  const currentIssuerRegistry = registryFor([first.record, second.record])
  const currentInventory = inventoryWithAuthority()
  const currentRings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  currentRings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(currentIssuerRegistry)
  currentRings.attestationPolicy.allowedKeyIds = [first.record.keyId, second.record.keyId]
  currentRings.attestationPolicy.applyAuthorizationQuorum = 1
  currentRings.attestationPolicy.completionAttestationQuorum = 1
  const privilegedPolicy = privilegedPolicyFor(currentIssuerRegistry, {
    quorum: 2,
    allowedKeyIds: [first.record.keyId, second.record.keyId],
    profileId: 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM',
  })
  const journal = {
    transactionId: 'maximum-overlap-recovery',
    historicalControlPlaneDigest: '5'.repeat(64),
    authorizationEnvelopeDigest: '6'.repeat(64),
    eventHeadDigest: '7'.repeat(64),
    rollbackPlanDigest: '8'.repeat(64),
  }
  const authorization = createFleetRecoveryAuthorization({
    transactionId: journal.transactionId,
    historicalControlPlaneDigest: journal.historicalControlPlaneDigest,
    journalAuthorizationEnvelopeDigest: journal.authorizationEnvelopeDigest,
    journalEventHeadDigest: journal.eventHeadDigest,
    rollbackPlanDigest: journal.rollbackPlanDigest,
    inventory: currentInventory,
    desired,
    attestationPolicy: currentRings.attestationPolicy,
    privilegedPolicy,
    issuerRegistry: currentIssuerRegistry,
    issuedAt: '2026-07-20T00:00:00.000Z',
    expiresAt: '2026-07-20T00:45:00.000Z',
  })
  for (const [item, gate] of [[first, 'apply'], [first, 'root'], [second, 'root']]) {
    signFleetRecoveryAuthorization(authorization, {
      signerKeyId: item.record.keyId,
      subject: item.record.subject,
      privateKey: item.keys.privateKey,
      gates: [gate],
    })
  }
  assert.throws(
    () => verifyFleetRecoveryAuthorization(authorization, {
      journal,
      inventory: currentInventory,
      desired,
      attestationPolicy: currentRings.attestationPolicy,
      privilegedPolicy,
      issuerRegistry: currentIssuerRegistry,
      now: NOW,
    }),
    /Maximum-assurance fleet recovery apply and root quorums must use disjoint signer keys and subjects/,
  )
})

test('irreversible mutations are deferred until they form one explicitly signed transaction', () => {
  const reversible = {
    kind: 'create-ruleset',
    resource: 'fleet/test',
    compensation: { safety: 'automatic', method: 'DELETE', pathSource: 'readbackPath' },
  }
  const irreversible = {
    kind: 'enable-immutable-releases',
    resource: 'immutable-releases',
    compensation: { safety: 'blocked', reason: 'no safe inverse' },
  }

  assert.deepEqual(stageActionTransaction([reversible, irreversible]), {
    actions: [reversible],
    deferredActions: [irreversible],
  })
  assert.equal(validateActionTransactionClass([reversible]), true)
  assert.equal(validateActionTransactionClass([irreversible]), true)
  assert.throws(
    () => validateActionTransactionClass([reversible, irreversible]),
    /irreversible action requires an isolated, explicitly signed one-action transaction/,
  )
  assert.throws(
    () => stageActionTransaction([irreversible, structuredClone(irreversible)]),
    /multiple irreversible actions/,
  )
})

test('GitHub desired schema closes repository workflow permissions and fixes least-privilege defaults', () => {
  const schema = readJson(resolve(SCHEMAS, 'github-desired.schema.json'))
  const validate = new Ajv2020({ strict: false }).compile(schema)
  assert.equal(validate(desired), true, JSON.stringify(validate.errors))

  const missing = structuredClone(desired)
  delete missing.profiles['product-consumer'].actionsWorkflowPermissions.can_approve_pull_request_reviews
  assert.equal(validate(missing), false)

  const broad = structuredClone(desired)
  broad.profiles['product-consumer'].actionsWorkflowPermissions.default_workflow_permissions = 'write'
  assert.equal(validate(broad), false)

  const open = structuredClone(desired)
  open.profiles['product-consumer'].actionsWorkflowPermissions.unreviewed = true
  assert.equal(validate(open), false)
  assert.throws(
    () => validateModel(inventory, open, readJson(resolve(FIXTURES, 'rings-hold.json')), certifications, waivers, NOW, issuerRegistry, runtimeProfile),
    /desired schema validation failed:.*actionsWorkflowPermissions must NOT have additional properties/,
  )
})

test('default reconciliation is GET-only and surfaces manual holds as blocking conflicts', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-hold.json'))
  const client = alignedFixtureClient()
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client, now: new Date('2026-07-20T00:00:00Z') })

  assert.equal(plan.readOnly, true)
  assert.equal(plan.summary.registeredInventory.candidateActions, 3)
  assert.equal(plan.summary.registeredInventory.managedChanges, 3)
  assert.equal(plan.summary.registeredInventory.conflicts, 1)
  assert.ok(plan.repoPlans[0].conflicts.includes('fixture hold'))
  assert.equal(plan.repoPlans[0].eligibility.eligible, false)
  assert.equal(plan.scope.coverage, 'registered-opt-in-inventory')
  assert.equal(plan.scope.unregisteredDescendants, 'not-covered')
  assert.ok(client.calls.every(call => call.method === 'GET'))
  const verified = plan.repoPlans[0].candidateActions.find(action => action.resource === 'fleet/verified-main')
  assert.equal(verified.body.enforcement, 'active')
  assert.deepEqual(
    verified.body.rules.find(rule => rule.type === 'required_status_checks').parameters.required_status_checks,
    [{ context: 'Verify consumer', integration_id: 15368 }],
  )
})

test('live runtime validation identity is derived from current Harness bytes and every registered GitHub default branch', () => {
  const repositories = [
    { id: 'authority', github: 'acme/authority', defaultBranch: 'main' },
    { id: 'template', github: 'acme/template', defaultBranch: 'stable' },
    { id: 'consumer', github: 'acme/consumer', defaultBranch: 'main' },
  ]
  const routes = {}
  repositories.forEach((repository, index) => {
    routes[`GET /repos/${repository.github}`] = { response: { full_name: repository.github, default_branch: repository.defaultBranch } }
    routes[`GET /repos/${repository.github}/commits/${repository.defaultBranch}`] = {
      response: {
        sha: String(index + 1).repeat(40),
        commit: { tree: { sha: String(index + 4).repeat(40) } },
      },
    }
  })
  const client = new ReadbackGhApiClient(routes)
  const context = resolveRuntimeValidationContext({
    client,
    inventory: { repositories },
    runtimeProfile: baseRuntimeProfile,
  })

  assert.match(context.runtimeIdentity.profileDigest, /^sha256:[a-f0-9]{64}$/)
  assert.match(context.runtimeIdentity.harnessDigest, /^sha256:[a-f0-9]{64}$/)
  assert.match(context.runtimeIdentity.gitCommit, /^[a-f0-9]{40}$/)
  assert.match(context.runtimeIdentity.gitTree, /^[a-f0-9]{40}$/)
  assert.deepEqual(context.externalRepositoryIdentities, {
    authority: { gitCommit: '1'.repeat(40), gitTree: '4'.repeat(40), subjectProofs: {} },
    template: { gitCommit: '2'.repeat(40), gitTree: '5'.repeat(40), subjectProofs: {} },
    consumer: { gitCommit: '3'.repeat(40), gitTree: '6'.repeat(40), subjectProofs: {} },
  })
  assert.deepEqual(client.calls.map(call => `${call.method} ${call.path}`), repositories.flatMap(repository => [
    `GET /repos/${repository.github}`,
    `GET /repos/${repository.github}/commits/${repository.defaultBranch}`,
  ]))

  const injected = new ReadbackGhApiClient(routes)
  assert.throws(
    () => resolveRuntimeValidationContext({
      client: injected,
      inventory: { repositories },
      runtimeProfile: baseRuntimeProfile,
      runtimeValidationContext: { runtimeIdentity: { profileDigest: 'sha256:attacker' } },
    }),
    /refuses an injected runtime validation identity/,
  )
  assert.equal(injected.calls.length, 0)

  const invalidTreeRoutes = structuredClone(routes)
  delete invalidTreeRoutes['GET /repos/acme/template/commits/stable'].response.commit.tree
  assert.throws(
    () => resolveRuntimeValidationContext({
      client: new ReadbackGhApiClient(invalidTreeRoutes),
      inventory: { repositories },
      runtimeProfile: baseRuntimeProfile,
    }),
    /default-branch tree identity is invalid for template/,
  )
})

test('live certification context proves authority subject ancestry and rejects forbidden carrier changes', () => {
  const repository = { id: 'authority', github: 'acme/authority', role: 'authority', defaultBranch: 'main' }
  const subjectCommit = 'a'.repeat(40)
  const subjectTree = 'b'.repeat(40)
  const carrierCommit = 'c'.repeat(40)
  const carrierTree = 'd'.repeat(40)
  const inventory = {
    certificationCanaries: { authority: { repositoryId: repository.id } },
    repositories: [repository],
  }
  const certifications = {
    certifications: [{
      id: 'authority-proof-fixture',
      status: 'certified',
      repositoryRole: 'authority',
      platformMatrix: [{ status: 'certified' }],
      runtimeEvidence: { gitCommit: subjectCommit },
    }],
  }
  const routes = {
    [`GET /repos/${repository.github}`]: { response: { full_name: repository.github, default_branch: repository.defaultBranch } },
    [`GET /repos/${repository.github}/commits/${repository.defaultBranch}`]: { response: { sha: carrierCommit, commit: { tree: { sha: carrierTree } } } },
    [`GET /repos/${repository.github}/git/commits/${subjectCommit}`]: { response: { sha: subjectCommit, tree: { sha: subjectTree } } },
    [`GET /repos/${repository.github}/compare/${subjectCommit}...${carrierCommit}`]: {
      response: {
        status: 'ahead',
        base_commit: { sha: subjectCommit },
        merge_base_commit: { sha: subjectCommit },
        ahead_by: 1,
        behind_by: 0,
        total_commits: 1,
        files: [{ filename: 'infra/governance/providers/certifications.json', status: 'modified' }],
      },
    },
  }
  const context = resolveRuntimeValidationContext({
    client: new ReadbackGhApiClient(routes),
    inventory,
    certifications,
    runtimeProfile: baseRuntimeProfile,
  })
  assert.equal(context.externalRepositoryIdentities.authority.gitCommit, carrierCommit)
  assert.deepEqual(context.externalRepositoryIdentities.authority.subjectProofs[subjectCommit].changedPaths, [
    'infra/governance/providers/certifications.json',
  ])

  const forbidden = structuredClone(routes)
  forbidden[`GET /repos/${repository.github}/compare/${subjectCommit}...${carrierCommit}`].response.files = [{ filename: 'src/untested-change.ts', status: 'modified' }]
  assert.throws(() => resolveRuntimeValidationContext({
    client: new ReadbackGhApiClient(forbidden),
    inventory,
    certifications,
    runtimeProfile: baseRuntimeProfile,
  }), /changed forbidden path src\/untested-change\.ts/)

  const renamed = structuredClone(routes)
  renamed[`GET /repos/${repository.github}/compare/${subjectCommit}...${carrierCommit}`].response.files = [{
    filename: 'infra/governance/evidence/provider-runtime/allowed.json',
    previous_filename: 'src/forbidden.ts',
    status: 'renamed',
  }]
  assert.throws(() => resolveRuntimeValidationContext({
    client: new ReadbackGhApiClient(renamed),
    inventory,
    certifications,
    runtimeProfile: baseRuntimeProfile,
  }), /unsupported rename\/copy\/status/)

  const missingAncestry = structuredClone(routes)
  missingAncestry[`GET /repos/${repository.github}/compare/${subjectCommit}...${carrierCommit}`].response.merge_base_commit.sha = 'e'.repeat(40)
  assert.throws(() => resolveRuntimeValidationContext({
    client: new ReadbackGhApiClient(missingAncestry),
    inventory,
    certifications,
    runtimeProfile: baseRuntimeProfile,
  }), /not a protected default-branch ancestor/)
})

test('partial inventory validation is confined to the fixture harness while production stays fail closed', () => {
  const rings = readJsonFile(resolve(FIXTURES, 'rings-hold.json'))
  const canonicalIssuerRegistry = readJsonFile(resolve(REPO_ROOT, 'infra/governance/trust/issuers.json'))
  const canonicalNow = issuerValidationTime(canonicalIssuerRegistry)
  rings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(canonicalIssuerRegistry)
  rings.attestationPolicy.allowedKeyIds = []

  assert.equal(
    reconcileFixtureTestHarness.validatePartialInventoryModel(
      inventory,
      desired,
      rings,
      uncertifiedRuntimeLedger(),
      waivers,
      canonicalNow,
      canonicalIssuerRegistry,
      baseRuntimeProfile,
      runtimeValidationContext,
    ),
    true,
  )
  assert.throws(
    () => reconcileValidateModel(
      inventory,
      desired,
      rings,
      uncertifiedRuntimeLedger(),
      waivers,
      canonicalNow,
      canonicalIssuerRegistry,
      baseRuntimeProfile,
      runtimeValidationContext,
    ),
    /Workflow identity source design-system-authority references unknown repository design-system/,
  )

  const routes = readJsonFile(resolve(FIXTURES, 'empty/routes.json'))
  const commitRoute = 'GET /repos/acme/consumer/commits/main'
  routes[commitRoute].response.commit.tree = { sha: '3'.repeat(40) }
  const client = new ReadbackGhApiClient(routes)
  assert.throws(
    () => reconcileBuildPlan({
      inventory,
      desired,
      rings,
      certifications: uncertifiedRuntimeLedger(),
      waivers,
      client,
      verifiedReleaseEvidence: verifiedEvidenceFor(rings),
      issuerRegistry: canonicalIssuerRegistry,
      runtimeProfile: baseRuntimeProfile,
      now: canonicalNow,
    }),
    /Workflow identity source design-system-authority references unknown repository design-system/,
  )
  assert.ok(client.calls.every(call => call.method === 'GET'))
})

test('fixture clients may inject explicit runtime identity, while live plan and apply entrypoints reject it before I/O', () => {
  const fixtureClient = alignedFixtureClient()
  assert.equal(reconcileFixtureTestHarness.resolveRuntimeValidationContext({
    client: fixtureClient,
    inventory,
    runtimeProfile,
    runtimeValidationContext,
  }), runtimeValidationContext)
  assert.equal(fixtureClient.calls.length, 0)

  const plainFakeClient = {
    calls: [],
    request(...args) {
      this.calls.push(args)
      throw new Error('explicit production boundary must reject injection before transport')
    },
  }
  assert.throws(
    () => resolveRuntimeValidationContext({
      client: plainFakeClient,
      inventory,
      runtimeProfile,
      runtimeValidationContext,
      live: false,
      executionBoundary: 'fixture',
    }),
    /refuses an injected runtime validation identity/,
  )
  assert.deepEqual(plainFakeClient.calls, [])

  const livePlanClient = new ReadbackGhApiClient({})
  const livePlanRings = readJsonFile(resolve(FIXTURES, 'rings-hold.json'))
  assert.throws(
    () => reconcileBuildPlan({
      inventory,
      desired,
      rings: livePlanRings,
      certifications: uncertifiedRuntimeLedger(),
      waivers,
      client: livePlanClient,
      verifiedReleaseEvidence: verifiedEvidenceFor(livePlanRings),
      issuerRegistry: baseIssuerRegistry,
      runtimeProfile: baseRuntimeProfile,
      runtimeValidationContext,
      now: NOW,
    }),
    /refuses an injected runtime validation identity/,
  )
  assert.equal(livePlanClient.calls.length, 0)

  const liveApplyClient = new ReadbackGhApiClient({})
  assert.throws(
    () => reconcileApplyPlan({}, liveApplyClient, {
      journalPath: resolve(mkdtempSync(resolve(tmpdir(), 'gov-live-runtime-injection-')), 'journal.json'),
      inventory,
      desired,
      rings: {},
      certifications: {},
      waivers,
      runtimeProfile: baseRuntimeProfile,
      runtimeValidationContext,
      clock: () => NOW,
    }),
    /Live GitHub apply refuses an injected runtime validation identity/,
  )
  assert.equal(liveApplyClient.calls.length, 0)
})

test('workflow-permission drift produces one exact reversible action bound to independent readback', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-hold.json'))
  const client = alignedFixtureClient()
  client.routes['GET /repos/acme/consumer/actions/permissions/workflow'].response = {
    default_workflow_permissions: 'write',
    can_approve_pull_request_reviews: false,
  }
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client, now: NOW })
  const actions = plan.repoPlans[0].candidateActions.filter(action => action.kind === 'update-actions-workflow-permissions')

  assert.equal(actions.length, 1)
  assert.deepEqual(actions[0], {
    kind: 'update-actions-workflow-permissions',
    method: 'PUT',
    path: '/repos/acme/consumer/actions/permissions/workflow',
    body: {
      default_workflow_permissions: 'read',
      can_approve_pull_request_reviews: true,
    },
    resource: 'actions-workflow-permissions',
    beforeImage: {
      state: 'present',
      value: {
        default_workflow_permissions: 'write',
        can_approve_pull_request_reviews: false,
      },
      digest: actions[0].beforeImage.digest,
    },
    expectedApplied: {
      state: 'present',
      value: {
        default_workflow_permissions: 'read',
        can_approve_pull_request_reviews: true,
      },
      digest: actions[0].expectedApplied.digest,
    },
    compensation: {
      safety: 'automatic',
      method: 'PUT',
      path: '/repos/acme/consumer/actions/permissions/workflow',
      body: {
        default_workflow_permissions: 'write',
        can_approve_pull_request_reviews: false,
      },
    },
  })
  assert.ok(client.calls.every(call => call.method === 'GET'))

  const malformed = alignedFixtureClient()
  delete malformed.routes['GET /repos/acme/consumer/actions/permissions/workflow'].response.can_approve_pull_request_reviews
  assert.throws(
    () => buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: malformed, now: NOW }),
    /workflow-permissions response has an invalid or open shape/,
  )

  const openReadback = alignedFixtureClient()
  openReadback.routes['GET /repos/acme/consumer/actions/permissions/workflow'].response.unreviewed = true
  assert.throws(
    () => buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: openReadback, now: NOW }),
    /workflow-permissions response has an invalid or open shape/,
  )
})

test('a consumer profile cannot request authority-only immutable releases', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-hold.json'))
  const immutableDesired = structuredClone(desired)
  immutableDesired.profiles['product-consumer'].immutableReleases = true
  const client = alignedFixtureClient()

  assert.throws(
    () => buildPlan({ issuerRegistry, runtimeProfile, inventory, desired: immutableDesired, rings, certifications, waivers, client, now: NOW }),
    /desired schema validation failed: .*immutableReleases must be equal to constant/,
  )
  assert.deepEqual(client.calls, [])
})

test('apply is refused before mutation when the release ring locks remote writes', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-hold.json'))
  const client = alignedFixtureClient()
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client, now: new Date('2026-07-20T00:00:00Z') })

  assert.throws(() => applyPlan(plan, client, { issuerRegistry, journalPath: resolve(mkdtempSync(resolve(tmpdir(), 'gov-hold-')), 'journal.json'), inventory, desired, rings, now: NOW }), /Apply refused: fleet preflight has conflicts/)
  assert.ok(client.calls.every(call => call.method === 'GET'))
})

test('conflict-free apply executes only the precomputed managed actions', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const client = alignedFixtureClient()
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client, now: NOW })
  const verified = plan.repoPlans[0].candidateActions.find(action => action.resource === 'fleet/verified-main')

  assert.equal(verified.body.enforcement, 'active')
  assert.equal(plan.summary.registeredInventory.conflicts, 0)
  assert.equal(plan.summary.registeredInventory.candidateActions, 3)
  const applyClient = new ReadbackClient()
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-apply-')), 'journal.json')
  const result = applyPlan(plan, applyClient, { issuerRegistry, journalPath, inventory, desired, rings, now: NOW })
  assert.equal(result.actions.length, 3)
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  assert.equal(journal.state, 'verified')
  assert.equal(journal.evidenceDurabilityClass, 'local-content-addressed-fsync-v1')
  assert.equal(journal.events.every(event => event.mirrorRequestNonce === null), true)
  assert.deepEqual(applyClient.calls.filter(call => call.method !== 'GET').map(call => call.method), ['POST', 'POST', 'POST'])
})

test('apply rechecks the default head and refuses drift before any mutation', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: alignedFixtureClient(), now: NOW })
  const base = new ReadbackClient()
  const client = { request(method, path, body, options) {
    if (method === 'GET' && path === '/repos/acme/consumer/commits/main') return { sha: '4'.repeat(40), commit: { committer: { date: '2026-07-19T23:00:00Z' } } }
    return base.request(method, path, body, options)
  } }
  assert.throws(
    () => applyPlan(plan, client, { issuerRegistry, journalPath: resolve(mkdtempSync(resolve(tmpdir(), 'gov-head-drift-')), 'journal.json'), inventory, desired, rings, now: NOW }),
    /default-branch head drift/,
  )
  assert.equal(base.calls.some(call => call.method !== 'GET'), false)
})

test('production mutation entrypoints reject fixture API provenance', async () => {
  await assert.rejects(
    () => reconcileMain(['--fixture-dir', resolve(FIXTURES, 'empty'), '--apply']),
    /Fixture API clients are plan\/test-only/,
  )
  await assert.rejects(
    () => reconcileMain(['--fixture-dir', resolve(FIXTURES, 'empty'), '--recover-journal', '/tmp/untrusted-fixture-journal.json']),
    /Fixture API clients are plan\/test-only/,
  )
})

test('GitHub API transport pins the origin and mutation-boundary API version', () => {
  assert.deepEqual(githubApiRequestDescriptor('GET', '/repos/acme/consumer/rulesets'), {
    method: 'GET',
    path: '/repos/acme/consumer/rulesets',
    url: 'https://api.github.com/repos/acme/consumer/rulesets',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  assert.deepEqual(
    githubApiRequestDescriptor('GET', '/repos/acme/consumer/rulesets?per_page=100'),
    {
      method: 'GET',
      path: '/repos/acme/consumer/rulesets?per_page=100',
      url: 'https://api.github.com/repos/acme/consumer/rulesets?per_page=100',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  )
  for (const path of [
    'https://attacker.example/repos/acme/consumer',
    '/repos/acme',
    '/repos/acme/consumer/../../user',
    '/repos/acme/../user/rulesets',
    '/repos/%2e%2e/%2e%2e/user',
    '/repos/acme%2Fattacker/consumer/rulesets',
    '/repos/acme/consumer/rulesets#outside',
  ]) {
    assert.throws(
      () => githubApiRequestDescriptor('GET', path),
      /outside the closed repository boundary/,
      path,
    )
  }
  assert.throws(
    () => githubApiRequestDescriptor('CONNECT', '/repos/acme/consumer'),
    /GitHub API method is unsupported/,
  )
  const source = readFileSync(resolve(REPO_ROOT, 'infra/governance/bin/reconcile-github.mjs'), 'utf8')
  assert.match(source, /await fetch\('https:\/\/api\.github\.com' \+ path/)
  assert.match(source, /redirect: 'error'/)
  assert.doesNotMatch(source, /\brunClosedGh\b|\bgh api\b/)
})

test('mutation-boundary guards stop on SSOT drift and inter-write fleet drift', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: alignedFixtureClient(), now: NOW })

  const ssotClient = new ReadbackClient()
  let reloads = 0
  assert.throws(
    () => applyPlan(plan, ssotClient, {
      issuerRegistry,
      journalPath: resolve(mkdtempSync(resolve(tmpdir(), 'gov-ssot-drift-')), 'journal.json'),
      inventory,
      desired,
      rings,
      now: NOW,
      reloadCurrentGovernance: () => {
        reloads += 1
        const model = reloadableGovernance({ currentRings: rings })
        if (reloads >= 4) model.waivers.waivers.push({ untrusted: true })
        return model
      },
    }),
    /canonical governance SSOT changed during transaction: waivers/,
  )
  assert.equal(ssotClient.calls.filter(call => call.method !== 'GET').length, 0)

  const base = new ReadbackClient()
  let writes = 0
  const driftClient = { request(method, path, body, options) {
    const response = base.request(method, path, body, options)
    if (method !== 'GET') {
      writes += 1
      if (writes === 1) {
        const id = '9999'
        base.rulesets.set(id, { id: Number(id), ...structuredClone(body), name: 'fleet/inter-write-rogue' })
      }
    }
    return response
  } }
  assert.throws(
    () => applyPlan(plan, driftClient, {
      issuerRegistry,
      journalPath: resolve(mkdtempSync(resolve(tmpdir(), 'gov-inter-write-drift-')), 'journal.json'),
      inventory,
      desired,
      rings,
      now: NOW,
    }),
    /selected fleet full-state drift/,
  )
  assert.equal(writes, 1)
})

test('GitHub collection observation paginates past 100 without truncation', () => {
  const base = new ReadbackClient()
  for (let index = 1; index <= 101; index += 1) {
    const id = String(10_000 + index)
    base.rulesets.set(id, {
      id: Number(id),
      name: `external/ruleset-${index}`,
      target: 'branch',
      enforcement: 'disabled',
      conditions: {},
      bypass_actors: [],
      rules: [],
    })
  }
  const client = { request(method, path, body, options) {
    if (method === 'GET' && path === '/repos/acme/consumer/rulesets?per_page=100') return [...base.rulesets.values()].slice(0, 100).map(({ id, name }) => ({ id, name }))
    if (method === 'GET' && path === '/repos/acme/consumer/rulesets?per_page=100&page=2') return [...base.rulesets.values()].slice(100).map(({ id, name }) => ({ id, name }))
    return base.request(method, path, body, options)
  } }
  const state = fetchRepositoryState(client, inventory.repositories[0], {
    requiredChecks: [],
    declaredEnvironments: [],
    tagPolicy: {},
    immutableReleases: false,
  }, desired)
  assert.equal(state.rulesetSummaries.length, 101)
  assert.equal(state.rulesets.length, 101)
})

test('any GitHub API failure aborts the plan and performs no writes', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const client = new FixtureApiClient(resolve(FIXTURES, 'error'))

  assert.throws(() => buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client }), /HTTP 503/)
  assert.ok(client.calls.every(call => call.method === 'GET'))
})

test('candidate-controlled same-name GitHub Actions checks and stale-head App checks do not satisfy the trust anchor', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  for (const run of [
    { id: 9100, name: 'Immutable consumer snapshot', head_sha: '2'.repeat(40), status: 'completed', conclusion: 'success', completed_at: '2026-07-20T00:00:00Z', app: { id: 15368, slug: 'github-actions' } },
    { id: 9101, name: 'Immutable consumer snapshot', head_sha: '1'.repeat(40), status: 'completed', conclusion: 'success', completed_at: '2026-07-20T00:00:00Z', app: { id: 1001, slug: 'qijenchen-governance-check' } },
  ]) {
    const client = alignedFixtureClient()
    client.routes['GET /repos/acme/consumer/commits/2222222222222222222222222222222222222222/check-runs?per_page=100'].response.check_runs = [run]
    const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client, now: NOW })
    assert.ok(plan.repoPlans[0].conflicts.some(conflict => conflict.includes('current head 2222222222222222222222222222222222222222')))
  }
})

test('GitHub-owned dynamic Dependabot runs are excluded from repository-workflow provenance', () => {
  const observed = fetchWorkflowRunFixture(clientWithWorkflowRun())
  const dependabot = observed.checkRuns.find(run => run.id === 9077)

  assert.ok(dependabot)
  assert.equal(Object.hasOwn(dependabot, 'workflowRun'), false)
})

test('ordinary GitHub Actions workflow runs retain exact repository-workflow provenance', () => {
  const observed = fetchWorkflowRunFixture(clientWithWorkflowRun({
    event: 'pull_request',
    path: '.github/workflows/ci.yml',
  }))
  const repositoryRun = observed.checkRuns.find(run => run.id === 9077)

  assert.equal(repositoryRun.workflowRun.path, '.github/workflows/ci.yml')
  assert.equal(repositoryRun.workflowRun.event, 'pull_request')
})

test('unknown dynamic and forged GitHub Actions App/path/event combinations fail closed', () => {
  const invalid = [
    { label: 'unknown dynamic namespace', path: 'dynamic/codeql/default-setup', event: 'dynamic' },
    { label: 'repository path with dynamic event', path: '.github/workflows/ci.yml', event: 'dynamic' },
    { label: 'Dependabot path with repository event', path: 'dynamic/dependabot/dependabot-updates', event: 'pull_request' },
    { label: 'Dependabot traversal path', path: 'dynamic/dependabot/../ci.yml', event: 'dynamic' },
    { label: 'repository traversal path', path: '.github/workflows/../ci.yml', event: 'pull_request' },
    { label: 'forged GitHub Actions slug', app: { id: 15368, slug: 'not-github-actions' } },
    { label: 'forged GitHub Actions id', app: { id: 999999, slug: 'github-actions' } },
    { label: 'fully unknown App', app: { id: 999999, slug: 'not-github-actions' } },
  ]

  for (const scenario of invalid) {
    assert.throws(
      () => fetchWorkflowRunFixture(clientWithWorkflowRun(scenario)),
      /(?:GitHub (?:workflow-run (?:dynamic identity|path)|Actions check-run App identity) (?:is invalid|mismatch)|Untrusted check-run App claims a GitHub Actions workflow run)/,
      scenario.label,
    )
  }
})

test('a successful check older than the current commit or freshness window fails closed', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const client = alignedFixtureClient()
  client.routes['GET /repos/acme/consumer/commits/2222222222222222222222222222222222222222/check-runs?per_page=100'].response.check_runs[0].completed_at = '2026-07-18T00:00:00Z'
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client, now: NOW })
  assert.ok(plan.repoPlans[0].conflicts.some(conflict => conflict.includes('lacks a fresh successful run')))
})

test('a new candidate release cannot inherit an old completed soak clock', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  rings.candidateRelease = {
    ...rings.candidateRelease,
    id: 'ajenchen/design-system@v1.0.1',
    version: '1.0.1',
    packages: rings.candidateRelease.packages.map(item => ({ ...item, version: '1.0.1' })),
  }
  assert.throws(
    () => buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: alignedFixtureClient(), now: NOW }),
    /candidate digest was not reset/,
  )
})

test('candidate plan materialization requires current verified release evidence before any GitHub read', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const client = alignedFixtureClient()
  assert.throws(
    () => reconcileFixtureTestHarness.buildPlan({ issuerRegistry, runtimeProfile, runtimeValidationContext, inventory, desired, rings, certifications, waivers, client, verifiedReleaseEvidence: null, now: NOW }),
    /verified release evidence must be an object/,
  )
  assert.deepEqual(client.calls, [])
})

test('verified evidence for an older candidate cannot authorize a changed candidate plan', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const oldEvidence = verifiedEvidenceFor(rings)
  rings.candidateRelease.observedAt = '2019-01-01T00:00:01Z'
  rings.assignments.consumer.candidateReleaseDigest = sha256(stableStringify(rings.candidateRelease, 0))
  const client = alignedFixtureClient()
  assert.throws(
    () => reconcileFixtureTestHarness.buildPlan({ issuerRegistry, runtimeProfile, runtimeValidationContext, inventory, desired, rings, certifications, waivers, client, verifiedReleaseEvidence: oldEvidence, now: NOW }),
    /verified release evidence is stale for the current candidate release/,
  )
  assert.deepEqual(client.calls, [])
})

test('an unknown App identity cannot claim a GitHub Actions workflow run', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const client = alignedFixtureClient()
  client.routes['GET /repos/acme/consumer/commits/2222222222222222222222222222222222222222/check-runs?per_page=100'].response.check_runs.push({
    id: 9105,
    name: 'Verify consumer',
    head_sha: '2'.repeat(40),
    details_url: 'https://github.com/acme/consumer/actions/runs/77',
    status: 'completed',
    conclusion: 'success',
    completed_at: '2026-07-20T00:00:00Z',
    app: { id: 999999, slug: 'unknown-app' },
  })
  assert.throws(
    () => buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client, now: NOW }),
    /Untrusted check-run App claims a GitHub Actions workflow run/,
  )
  assert.ok(client.calls.every(call => call.method === 'GET'))
})

function desiredWithDistinctApps() {
  return structuredClone(desired)
}

test('same integration ID cannot collapse the Check and Writer trust domains', () => {
  const split = desiredWithDistinctApps()
  split.integrations.governanceWriterApp.id = split.integrations.governanceCheckApp.id

  assert.throws(
    () => validateModel(inventory, split, readJson(resolve(FIXTURES, 'rings-eligible.json')), certifications, waivers, NOW, issuerRegistry, runtimeProfile),
    /must have distinct integration IDs/,
  )
})

test('App capabilities and secret prefixes fail closed when roles overlap', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const wrongCheckCapability = desiredWithDistinctApps()
  wrongCheckCapability.integrations.governanceCheckApp.capability = 'writer'
  assert.throws(() => validateModel(inventory, wrongCheckCapability, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /must be the check-only external trust anchor|desired schema validation failed/)

  const wrongWriterCapability = desiredWithDistinctApps()
  wrongWriterCapability.integrations.governanceWriterApp.capability = 'check-only'
  assert.throws(() => validateModel(inventory, wrongWriterCapability, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /Writer App must be writer-only|desired schema validation failed/)

  const sharedPrefix = desiredWithDistinctApps()
  sharedPrefix.integrations.governanceWriterApp.secretPrefix = sharedPrefix.integrations.governanceCheckApp.secretPrefix
  assert.throws(() => validateModel(inventory, sharedPrefix, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /desired schema validation failed/)

  const swappedPrefixes = desiredWithDistinctApps()
  swappedPrefixes.integrations.governanceCheckApp.secretPrefix = 'GOVERNANCE_WRITER_APP'
  swappedPrefixes.integrations.governanceWriterApp.secretPrefix = 'GOVERNANCE_CHECK_APP'
  assert.throws(() => validateModel(inventory, swappedPrefixes, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /desired schema validation failed/)
})

test('App slug substitution and base-trusted check ownership fail closed at their canonical layers', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const sharedSlug = desiredWithDistinctApps()
  sharedSlug.integrations.governanceWriterApp.slug = sharedSlug.integrations.governanceCheckApp.slug
  assert.throws(() => validateModel(inventory, sharedSlug, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /desired schema validation failed/)

  const writerAsAnchor = desiredWithDistinctApps()
  writerAsAnchor.profiles['product-consumer'].requiredChecks[0] = {
    ...writerAsAnchor.profiles['product-consumer'].requiredChecks[0],
    integration: 'governanceWriterApp',
    baseTrusted: true,
  }
  assert.throws(() => validateModel(inventory, writerAsAnchor, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /desired schema validation failed/)
})

test('a same-context candidate workflow cannot replace the required base-trusted App verdict', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const spoofable = desiredWithDistinctApps()
  spoofable.profiles['product-consumer'].requiredChecks[0] = {
    ...spoofable.profiles['product-consumer'].requiredChecks[0],
    integration: 'githubActions',
    trustSource: 'repository-workflow',
    requiredEvents: ['pull_request'],
    baseTrusted: false,
  }
  assert.throws(() => validateModel(inventory, spoofable, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /desired schema validation failed/)
})

test('neither Governance App may impersonate the GitHub Actions integration', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const checkCollision = desiredWithDistinctApps()
  checkCollision.integrations.governanceCheckApp.id = checkCollision.integrations.githubActions.id
  assert.throws(() => validateModel(inventory, checkCollision, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /Check App must not reuse the GitHub Actions integration ID/)

  const writerCollision = desiredWithDistinctApps()
  writerCollision.integrations.governanceWriterApp.id = writerCollision.integrations.githubActions.id
  assert.throws(() => validateModel(inventory, writerCollision, rings, certifications, waivers, NOW, issuerRegistry, runtimeProfile), /Writer App must not reuse the GitHub Actions integration ID/)
})

test('partial API failure records recovery truth and never claims rollback', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const planClient = alignedFixtureClient()
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: planClient, now: NOW })
  let writes = 0
  const base = new ReadbackClient()
  const failingClient = {
    request(method, path, body, options) {
      if (method === 'POST' || method === 'PUT') {
        writes += 1
        if (writes === 2) throw new Error('simulated write failure')
      }
      return base.request(method, path, body, options)
    },
  }
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-fail-')), 'journal.json')

  assert.throws(() => applyPlan(plan, failingClient, { issuerRegistry, journalPath, inventory, desired, rings, now: NOW }), /no rollback was claimed or attempted/)
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  assert.equal(journal.state, 'failed-partial-state-possible')
  assert.equal(journal.rollbackAttempted, false)
  assert.equal(journal.actions[0].status, 'verified')
  assert.equal(journal.actions[1].status, 'applying')
  assert.match(journal.rollbackPlanDigest, /^[a-f0-9]{64}$/)
  assert.equal(journal.schemaVersion, 7)
  assert.equal(journal.historicalControlPlaneDigest, historicalControlPlaneDigest(journal.historicalControlPlane))
})

test('single-owner local journal supports exact rollback and forward recovery through fresh plans and journals', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const base = new ReadbackClient()
  const initialPlan = buildPlan({
    issuerRegistry,
    runtimeProfile,
    inventory,
    desired,
    rings,
    certifications,
    waivers,
    client: alignedFixtureClient(),
    now: NOW,
  })
  let writes = 0
  const failingClient = {
    request(method, path, body, options) {
      if (method === 'POST' || method === 'PUT') {
        writes += 1
        if (writes === 3) throw new Error('forward-recovery fixture partial failure')
      }
      return base.request(method, path, body, options)
    },
  }
  const initialJournalPath = resolve(
    mkdtempSync(resolve(tmpdir(), 'gov-local-forward-recovery-initial-')),
    'journal.json',
  )
  assert.throws(
    () => applyPlan(initialPlan, failingClient, {
      issuerRegistry,
      journalPath: initialJournalPath,
      inventory,
      desired,
      rings,
      now: NOW,
    }),
    /no rollback was claimed or attempted/,
  )
  const failedJournal = readJson(initialJournalPath)
  assert.equal(failedJournal.evidenceDurabilityClass, 'local-content-addressed-fsync-v1')
  assert.equal(failedJournal.rollbackAttempted, false)

  const recovery = recoveryAuthorizationFor({
    journalPath: initialJournalPath,
    currentRings: rings,
  })
  const rollback = rollbackTransaction(initialJournalPath, base, {
    issuerRegistry: recovery.issuerRegistry,
    inventory: recovery.inventory,
    desired,
    rings: recovery.rings,
    privilegedPolicy: recovery.privilegedPolicy,
    recoveryAuthorization: recovery.authorization,
    clock: () => NOW,
  })
  assert.equal(rollback.rolledBack, true)
  assert.equal(base.rulesets.size, 0)
  assert.equal(base.environments.size, 0)
  const rolledBackJournal = readJson(initialJournalPath)
  assert.equal(rolledBackJournal.state, 'rolled-back-verified')
  assert.equal(rolledBackJournal.evidenceDurabilityClass, 'local-content-addressed-fsync-v1')

  const forwardAt = new Date('2026-07-20T00:05:00.000Z')
  const forwardPlan = buildPlan({
    issuerRegistry,
    runtimeProfile,
    inventory,
    desired,
    rings,
    certifications,
    waivers,
    client: base,
    now: forwardAt,
  })
  assert.equal(forwardPlan.planDigest, initialPlan.planDigest)
  const forwardJournalPath = resolve(
    mkdtempSync(resolve(tmpdir(), 'gov-local-forward-recovery-next-')),
    'journal.json',
  )
  const forward = applyPlan(forwardPlan, base, {
    issuerRegistry,
    journalPath: forwardJournalPath,
    inventory,
    desired,
    rings,
    now: forwardAt,
    clock: () => forwardAt,
  })
  assert.equal(forward.applied, true)
  const forwardJournal = readJson(forwardJournalPath)
  assert.equal(forwardJournal.state, 'verified')
  assert.equal(forwardJournal.evidenceDurabilityClass, 'local-content-addressed-fsync-v1')
  assert.notEqual(forwardJournal.transactionId, rolledBackJournal.transactionId)
  // Without per-wave signing ceremonies the envelope is a pure content address:
  // an exact rollback followed by an identical forward plan reproduces it exactly.
  assert.equal(forwardJournal.authorizationEnvelopeDigest, rolledBackJournal.authorizationEnvelopeDigest)
  assert.equal(readJson(initialJournalPath).state, 'rolled-back-verified')
})

test('replayable runtime transitions reject local journal tampering', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: alignedFixtureClient(), now: NOW })
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-signed-journal-')), 'journal.json')
  applyPlan(plan, new ReadbackClient(), {
    issuerRegistry, journalPath, inventory, desired, rings, now: NOW,
  })
  const journal = readJson(journalPath)

  const forgedRuntime = structuredClone(journal)
  forgedRuntime.events[1].runtimeState.actions[0].status = 'verified'
  assert.throws(
    () => validateTransactionJournal(forgedRuntime, {
      issuerRegistry, inventory, desired, rings, now: NOW,
    }),
    /event 1 chain binding|state digest|applying transition/,
  )

  const forgedClass = structuredClone(journal)
  forgedClass.evidenceDurabilityClass = 'independent-append-only-off-host-v1'
  assert.throws(
    () => validateTransactionJournal(forgedClass, {
      issuerRegistry, inventory, desired, rings, now: NOW,
    }),
    /Unknown fleet journal evidence durability class|chain binding|latest event does not bind|authorization envelope digest/,
  )
})

test('partial apply remains observable after issuer revocation, rotation, inventory drift, and desired drift; rollback requires fresh current dual quorum', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const plan = buildPlan({
    issuerRegistry,
    runtimeProfile,
    inventory,
    desired,
    rings,
    certifications,
    waivers,
    client: alignedFixtureClient(),
    now: NOW,
  })
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = { request(method, path, body, options) {
    if (method === 'POST' || method === 'PUT') {
      writes += 1
      if (writes === 3) throw new Error('simulated partial rollout')
    }
    return base.request(method, path, body, options)
  } }
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-v5-recovery-')), 'journal.json')
  assert.throws(
    () => applyPlan(plan, failingClient, {
      issuerRegistry, journalPath, inventory, desired, rings, now: NOW,
    }),
    /no rollback was claimed or attempted/,
  )

  const first = generatedRecoveryIssuer('one')
  const second = generatedRecoveryIssuer('two')
  const rootFirst = generatedRecoveryIssuer('root-one')
  const rootSecond = generatedRecoveryIssuer('root-two')
  const revokedOriginal = {
    ...structuredClone(issuerRegistry.issuers[0]),
    status: 'revoked',
    revokedAt: '2026-07-20T00:10:00.000Z',
  }
  const historicalManagedIssuers = structuredClone(issuerRegistry.issuers.slice(1))
  const currentIssuerRegistry = registryFor([
    revokedOriginal,
    ...historicalManagedIssuers,
    first.record,
    second.record,
    rootFirst.record,
    rootSecond.record,
  ])
  const currentInventory = inventoryWithAuthority()
  currentInventory.repositories.find(repository => repository.id === 'consumer').visibility = 'public'
  const currentDesired = { ...structuredClone(desired), checkRunMaxAgeMinutes: desired.checkRunMaxAgeMinutes + 1 }
  const currentRings = structuredClone(rings)
  currentRings.attestationPolicy.issuerRegistryDigest = issuerRegistryDigest(currentIssuerRegistry)
  currentRings.attestationPolicy.allowedKeyIds = [first.record.keyId, second.record.keyId]
  currentRings.attestationPolicy.applyAuthorizationQuorum = 2
  currentRings.attestationPolicy.completionAttestationQuorum = 2
  const privilegedPolicy = privilegedPolicyFor(currentIssuerRegistry, {
    quorum: 2,
    allowedKeyIds: [rootFirst.record.keyId, rootSecond.record.keyId],
    profileId: 'MAXIMUM_ASSURANCE_MULTI_CUSTODIAN_WORM',
  })

  const backdatedIssuerRegistry = registryFor([
    { ...revokedOriginal, revokedAt: '2026-07-19T23:59:59.000Z' },
    ...historicalManagedIssuers,
    first.record,
    second.record,
  ])
  const callsBeforeBackdatedRecovery = base.calls.length
  assert.throws(
    () => recoverTransaction(journalPath, base, { issuerRegistry: backdatedIssuerRegistry, clock: () => NOW }),
    /revoked at or before the historical transaction time/,
  )
  assert.equal(base.calls.length, callsBeforeBackdatedRecovery)

  const observation = recoverTransaction(journalPath, base, { issuerRegistry: currentIssuerRegistry, clock: () => NOW })
  assert.equal(observation.observed, true)
  assert.equal(observation.rolledBack, false)
  assert.equal(JSON.parse(readFileSync(journalPath, 'utf8')).state, 'recovery-observed')

  const callsBeforeUnauthorizedRollback = base.calls.length
  assert.throws(
    () => rollbackTransaction(journalPath, base, {
      issuerRegistry: currentIssuerRegistry,
      inventory: currentInventory,
      desired: currentDesired,
      rings: currentRings,
      privilegedPolicy,
      clock: () => new Date('2026-07-20T00:30:00.000Z'),
      now: new Date('2026-07-20T00:30:00.000Z'),
    }),
    /fresh current profile-bound recovery authorization/,
  )
  assert.equal(base.calls.length, callsBeforeUnauthorizedRollback)

  const signers = [first, second].map(item => ({
    keyId: item.record.keyId,
    subject: item.record.subject,
    privateKey: item.keys.privateKey,
  }))
  const rootSigners = [rootFirst, rootSecond].map(item => ({
    keyId: item.record.keyId,
    subject: item.record.subject,
    privateKey: item.keys.privateKey,
  }))
  const applyOnly = recoveryAuthorizationFor({
    journalPath,
    currentInventory,
    currentDesired,
    currentRings,
    currentIssuerRegistry,
    privilegedPolicy,
    applySigners: signers,
    rootSigners: [],
    issuedAt: '2026-07-20T00:20:00.000Z',
    expiresAt: '2026-07-20T00:50:00.000Z',
  })
  assert.throws(
    () => rollbackTransaction(journalPath, base, {
      issuerRegistry: currentIssuerRegistry,
      inventory: currentInventory,
      desired: currentDesired,
      rings: currentRings,
      privilegedPolicy,
      recoveryAuthorization: applyOnly.authorization,
      clock: () => new Date('2026-07-20T00:30:00.000Z'),
      now: new Date('2026-07-20T00:30:00.000Z'),
    }),
    /rootSignatures lack required current root-rotator quorum 2/,
  )
  assert.equal(base.calls.length, callsBeforeUnauthorizedRollback)

  const dual = recoveryAuthorizationFor({
    journalPath,
    currentInventory,
    currentDesired,
    currentRings,
    currentIssuerRegistry,
    privilegedPolicy,
    applySigners: signers,
    rootSigners,
    issuedAt: '2026-07-20T00:20:00.000Z',
    expiresAt: '2026-07-20T00:50:00.000Z',
  })
  assert.equal(new Set([
    ...dual.authorization.applySignatures.map(item => item.signerKeyId),
    ...dual.authorization.rootSignatures.map(item => item.signerKeyId),
  ]).size, 4, 'rollback quorums must be signer-disjoint')
  const rollback = rollbackTransaction(journalPath, base, {
    issuerRegistry: currentIssuerRegistry,
    inventory: currentInventory,
    desired: currentDesired,
    rings: currentRings,
    privilegedPolicy,
    recoveryAuthorization: dual.authorization,
    clock: () => new Date('2026-07-20T00:30:00.000Z'),
    now: new Date('2026-07-20T00:30:00.000Z'),
  })
  assert.equal(rollback.rolledBack, true)
  assert.equal(base.rulesets.size, 0)
  assert.equal(JSON.parse(readFileSync(journalPath, 'utf8')).state, 'rolled-back-verified')
})

test('rollback rechecks current authorization after the compensating event is journaled', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: alignedFixtureClient(), now: NOW })
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = { request(method, path, body, options) {
    if (method !== 'GET') {
      writes += 1
      if (writes === 3) throw new Error('rollback mutation-boundary fixture failure')
    }
    return base.request(method, path, body, options)
  } }
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-rollback-boundary-')), 'journal.json')
  assert.throws(
    () => applyPlan(plan, failingClient, {
      issuerRegistry, journalPath, inventory, desired, rings, now: NOW,
    }),
    /no rollback was claimed or attempted/,
  )

  const current = recoveryAuthorizationFor({ journalPath, currentRings: rings })
  const expiredAt = new Date('2026-07-20T01:00:00.000Z')
  const result = rollbackTransaction(journalPath, base, {
    issuerRegistry: current.issuerRegistry,
    inventory: current.inventory,
    desired,
    rings: current.rings,
    privilegedPolicy: current.privilegedPolicy,
    recoveryAuthorization: current.authorization,
    clock: () => (JSON.parse(readFileSync(journalPath, 'utf8')).events.some(event => event.type === 'rollback-compensating') ? expiredAt : NOW),
  })
  assert.equal(result.rolledBack, false)
  assert.match(result.blocked.join('\n'), /expired/)
  assert.equal(base.calls.filter(call => call.method === 'DELETE').length, 0)
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  assert.ok(journal.events.some(event => event.type === 'rollback-compensating'))
  assert.ok(journal.events.some(event => event.type === 'rollback-blocked-error'))
})

test('a wholesale historical bundle, registry, authorization, and action replacement fails before recovery observation', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: alignedFixtureClient(), now: NOW })
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = { request(method, path, body, options) {
    if (method === 'POST' || method === 'PUT') {
      writes += 1
      if (writes === 2) throw new Error('simulated write failure')
    }
    return base.request(method, path, body, options)
  } }
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-v5-forged-history-')), 'journal.json')
  assert.throws(() => applyPlan(plan, failingClient, { issuerRegistry, journalPath, inventory, desired, rings, now: NOW }), /no rollback was claimed or attempted/)

  const forged = JSON.parse(readFileSync(journalPath, 'utf8'))
  const attacker = generatedRecoveryIssuer('attacker')
  const attackerRegistry = registryFor([attacker.record])
  const attackerPolicy = {
    ...structuredClone(rings.attestationPolicy),
    issuerRegistryDigest: issuerRegistryDigest(attackerRegistry),
    allowedKeyIds: [attacker.record.keyId],
    applyAuthorizationQuorum: 1,
    completionAttestationQuorum: 1,
  }
  const attackerInventory = structuredClone(inventory)
  attackerInventory.repositories[0].github = 'evil/arbitrary-target'
  const attackerDesired = { ...structuredClone(desired), managedRulesetPrefix: 'evil/' }
  const body = {
    name: 'evil/arbitrary-read-target',
    target: 'branch',
    enforcement: 'active',
    conditions: {},
    bypass_actors: [],
    rules: [{ type: 'deletion' }],
  }
  const absent = { state: 'absent', digest: sha256(stableStringify({ state: 'absent' }, 0)) }
  const expectedApplied = { state: 'present', value: body, digest: sha256(stableStringify({ state: 'present', value: body }, 0)) }
  const fixedAction = {
    kind: 'create-ruleset',
    method: 'POST',
    path: '/repos/evil/arbitrary-target/rulesets',
    body,
    resource: body.name,
    beforeImage: absent,
    expectedApplied,
    compensation: { safety: 'automatic', method: 'DELETE', pathSource: 'readbackPath' },
  }
  forged.actions = [{ ...fixedAction, actionId: 'consumer:001:create-ruleset:evil/arbitrary-read-target', github: 'evil/arbitrary-target', repoId: 'consumer', status: 'pending' }]
  forged.rollbackPlan = [{
    actionId: forged.actions[0].actionId,
    repoId: 'consumer',
    resource: fixedAction.resource,
    beforeImageDigest: absent.digest,
    expectedAppliedDigest: expectedApplied.digest,
    compensation: structuredClone(fixedAction.compensation),
  }]
  forged.rollbackPlanDigest = sha256(stableStringify(forged.rollbackPlan, 0))
  forged.inventoryDigest = sha256(stableStringify(attackerInventory, 0))
  forged.desiredDigest = sha256(stableStringify(attackerDesired, 0))
  forged.attestationPolicyDigest = sha256(stableStringify(attackerPolicy, 0))
  forged.historicalControlPlane = normalizeHistoricalControlPlane({ inventory: attackerInventory, desired: attackerDesired, attestationPolicy: attackerPolicy, issuerRegistry: attackerRegistry })
  forged.historicalControlPlaneDigest = historicalControlPlaneDigest(forged.historicalControlPlane)
  forged.authorizationEnvelopeDigest = journalAuthorizationEnvelopeDigest(forged)
  writeFileSync(journalPath, JSON.stringify(forged))

  const client = { calls: 0, request() { this.calls += 1; throw new Error('forged endpoint must never be observed') } }
  assert.throws(
    () => recoverTransaction(journalPath, client, { issuerRegistry, clock: () => NOW }),
    /event 0 chain binding|latest event does not bind|missing from the append-only current registry/,
  )
  assert.equal(client.calls, 0)
})

test('rollback re-observes remote state and blocks on post-failure drift', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const plan = buildPlan({ issuerRegistry, runtimeProfile,
    inventory, desired, rings, certifications, waivers,
    client: alignedFixtureClient(), now: NOW,
  })
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = {
    request(method, path, body, options) {
      if (method === 'POST' || method === 'PUT') {
        writes += 1
        if (writes === 3) throw new Error('simulated write failure')
      }
      return base.request(method, path, body, options)
    },
  }
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-drift-')), 'journal.json')
  assert.throws(() => applyPlan(plan, failingClient, { issuerRegistry, journalPath, inventory, desired, rings, now: NOW }), /no rollback was claimed or attempted/)
  const firstRuleset = base.rulesets.values().next().value
  firstRuleset.enforcement = 'disabled'

  const fresh = recoveryAuthorizationFor({ journalPath, currentRings: rings })
  const result = rollbackTransaction(journalPath, base, {
    issuerRegistry: fresh.issuerRegistry,
    inventory: fresh.inventory,
    desired,
    rings: fresh.rings,
    privilegedPolicy: fresh.privilegedPolicy,
    recoveryAuthorization: fresh.authorization,
    clock: () => NOW,
  })
  assert.equal(result.rolledBack, false)
  assert.ok(result.blocked.some(blocker => blocker.includes('rollback drift')))
  const blockedJournal = JSON.parse(readFileSync(journalPath, 'utf8'))
  assert.equal(blockedJournal.state, 'rollback-blocked')

  const driftedAction = blockedJournal.actions.find(action => action.resource === firstRuleset.name)
  assert.equal(driftedAction.expectedApplied.state, 'present')
  firstRuleset.enforcement = driftedAction.expectedApplied.value.enforcement
  const retryAuthorization = recoveryAuthorizationFor({ journalPath, currentRings: rings })
  const retry = rollbackTransaction(journalPath, base, {
    issuerRegistry: retryAuthorization.issuerRegistry,
    inventory: retryAuthorization.inventory,
    desired,
    rings: retryAuthorization.rings,
    privilegedPolicy: retryAuthorization.privilegedPolicy,
    recoveryAuthorization: retryAuthorization.authorization,
    clock: () => NOW,
  })
  assert.equal(retry.rolledBack, true)
  assert.equal(JSON.parse(readFileSync(journalPath, 'utf8')).state, 'rolled-back-verified')
})

test('rollback refuses a modified compensating plan before remote observation or mutation', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: alignedFixtureClient(), now: NOW })
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-rollback-digest-')), 'journal.json')
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = { request(method, path, body, options) {
    if (method === 'POST' || method === 'PUT') {
      writes += 1
      if (writes === 2) throw new Error('simulated write failure')
    }
    return base.request(method, path, body, options)
  } }
  assert.throws(() => applyPlan(plan, failingClient, { issuerRegistry, journalPath, inventory, desired, rings, now: NOW }), /no rollback was claimed or attempted/)
  const forged = JSON.parse(readFileSync(journalPath, 'utf8'))
  forged.rollbackPlan[0].resource = 'arbitrary-resource'
  writeFileSync(journalPath, JSON.stringify(forged))
  const client = { request() { throw new Error('remote must not be observed') } }
  assert.throws(() => rollbackTransaction(journalPath, client, {
    issuerRegistry,
    inventory,
    desired,
    rings,
    clock: () => NOW,
  }), /latest event does not bind|rollback plan differs|Rollback plan digest mismatch/)
})

test('an untrusted rollback journal cannot inject an arbitrary repository endpoint', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: alignedFixtureClient(), now: NOW })
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-arbitrary-endpoint-')), 'journal.json')
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = { request(method, path, body, options) {
    if (method === 'POST' || method === 'PUT') {
      writes += 1
      if (writes === 2) throw new Error('simulated write failure')
    }
    return base.request(method, path, body, options)
  } }
  assert.throws(() => applyPlan(plan, failingClient, { issuerRegistry, journalPath, inventory, desired, rings, now: NOW }), /no rollback was claimed or attempted/)
  const forged = JSON.parse(readFileSync(journalPath, 'utf8'))
  forged.actions[0].path = '/repos/acme/unmanaged/contents/README.md'
  assert.throws(
    () => validateTransactionJournal(forged, { issuerRegistry, inventory, desired, rings, now: NOW }),
    /latest event does not bind|endpoint is outside managed scope|Journal readback endpoint differs from the managed action/,
  )
})

test('an untrusted runtime readback path fails before recovery can observe another repository', () => {
  const rings = readJson(resolve(FIXTURES, 'rings-eligible.json'))
  const plan = buildPlan({ issuerRegistry, runtimeProfile, inventory, desired, rings, certifications, waivers, client: alignedFixtureClient(), now: NOW })
  const journalPath = resolve(mkdtempSync(resolve(tmpdir(), 'gov-arbitrary-readback-')), 'journal.json')
  const base = new ReadbackClient()
  let writes = 0
  const failingClient = { request(method, path, body, options) {
    if (method === 'POST' || method === 'PUT') {
      writes += 1
      if (writes === 2) throw new Error('simulated write failure')
    }
    return base.request(method, path, body, options)
  } }
  assert.throws(() => applyPlan(plan, failingClient, { issuerRegistry, journalPath, inventory, desired, rings, now: NOW }), /no rollback was claimed or attempted/)
  const forged = JSON.parse(readFileSync(journalPath, 'utf8'))
  forged.actions[0].readbackPath = '/repos/evil/arbitrary-target/rulesets/123'
  writeFileSync(journalPath, JSON.stringify(forged))

  const client = { calls: 0, request() { this.calls += 1; throw new Error('unmanaged endpoint must never be observed') } }
  assert.throws(
    () => recoverTransaction(journalPath, client, { issuerRegistry, clock: () => NOW }),
    /latest event does not bind|readback endpoint is outside managed scope|Journal readback endpoint differs from the managed action/,
  )
  assert.equal(client.calls, 0)
})
