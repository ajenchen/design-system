import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
  authorityBootstrapJournalDigest,
  materializeAuthorityBootstrapProjection,
  reconcileFixtureTestHarness,
  validateAuthorityBootstrapDurableReplayReceipt,
} from '../../bin/reconcile-github.mjs'
import {
  FLEET_RECONCILE_MIRROR_PROTOCOL,
  buildFleetReconcileEventMirrorRequest,
  buildFleetReconcileHeadVerificationRequest,
  fleetReconcileMirrorReceiptDigest,
  fleetReconcileMirrorSignedPayload,
  fleetReconcileMirrorVerificationDigest,
} from '../../lib/fleet-reconcile-mirror.mjs'
import { candidateActionsDigest } from '../../lib/rollout-state-machine.mjs'
import { sha256, stableStringify } from '../../lib/common.mjs'

const SOURCE_AT = '2026-07-20T00:10:00.000Z'
const ACTIVATED_AT = '2026-07-20T00:15:00.000Z'
const REPLAYED_AT = '2026-07-20T00:20:00.000Z'
const RETAINED_UNTIL = '2027-07-21T00:20:00.000Z'
const BASE_SHA = 'a'.repeat(40)
const BASE_TREE = 'b'.repeat(40)

const clone = value => structuredClone(value)

function genesisReceipt({ inventory, desired }) {
  const changedPaths = ['AGENTS.md']
  const challenge = {
    schemaVersion: 1,
    kind: 'control-plane-genesis-challenge',
    repository: 'ajenchen/design-system',
    pullRequest: 42,
    baseSha: BASE_SHA,
    baseTree: BASE_TREE,
    candidateHeadSha: 'c'.repeat(40),
    candidateHeadTree: 'd'.repeat(40),
    changedPaths,
    changedPathsDigest: sha256(stableStringify(changedPaths, 0)),
    controlPlaneClosureDigest: sha256('fixture-control-plane-closure'),
    controlPlaneStageDigest: sha256('fixture-control-plane-stage'),
    buildGraphDigest: sha256('fixture-build-graph'),
    manifestDigest: sha256('fixture-canonical-manifest'),
    inventoryDigest: sha256(stableStringify(inventory, 0)),
    desiredDigest: sha256(stableStringify(desired, 0)),
    controlPlaneLockDigest: sha256('fixture-control-plane-lock'),
    issuerRegistryDigest: sha256('fixture-issuer-registry'),
  }
  const receipt = {
    schemaVersion: 1,
    kind: 'control-plane-genesis-verification',
    challenge,
    challengeDigest: sha256(
      `qijenchen-control-plane-genesis-challenge-v1\n${stableStringify(challenge, 0)}`,
    ),
    authorization: {
      kind: 'github-owner-comment',
      commentId: '42',
      commentDigest: sha256('fixture-owner-comment'),
      ownerLogin: 'ajenchen',
      createdAt: '2026-07-20T00:00:00.000Z',
    },
    verifiedAt: '2026-07-20T00:05:00.000Z',
    receiptDigest: null,
  }
  const unsigned = clone(receipt)
  delete unsigned.receiptDigest
  receipt.receiptDigest = sha256(
    `qijenchen-control-plane-genesis-receipt-v1\n${stableStringify(unsigned, 0)}`,
  )
  return receipt
}

class AuthorityBootstrapClient {
  constructor(projection, { aligned = false } = {}) {
    this.actionsWorkflowPermissions = aligned
      ? clone(projection.actionsWorkflowPermissions)
      : {
          default_workflow_permissions: 'write',
          can_approve_pull_request_reviews: false,
        }
    this.rulesets = new Map(projection.rulesets.map((ruleset, index) => [
      100 + index,
      { id: 100 + index, ...clone(ruleset) },
    ]))
    this.environments = new Map(projection.environments.map(environment => [
      environment.name,
      clone(environment),
    ]))
    this.nextRulesetId = 100 + this.rulesets.size
  }

  request(method, path, body, options = {}) {
    if (method === 'GET' && path === '/repos/ajenchen/design-system') {
      return {
        full_name: 'ajenchen/design-system',
        default_branch: 'main',
        visibility: 'public',
      }
    }
    if (method === 'GET' && path === '/repos/ajenchen/design-system/commits/main') {
      return {
        sha: BASE_SHA,
        commit: {
          tree: { sha: BASE_TREE },
          committer: { date: '2026-07-20T00:00:00.000Z' },
        },
      }
    }
    if (
      method === 'GET'
      && /^\/repos\/ajenchen\/design-system\/commits\/[a-f0-9]+\/check-runs\?per_page=100$/.test(path)
    ) return { total_count: 0, check_runs: [] }
    if (path === '/repos/ajenchen/design-system/actions/permissions/workflow') {
      if (method === 'GET') return clone(this.actionsWorkflowPermissions)
      if (method === 'PUT') {
        this.actionsWorkflowPermissions = clone(body)
        return clone(this.actionsWorkflowPermissions)
      }
    }
    if (
      method === 'GET'
      && (
        path === '/repos/ajenchen/design-system/rulesets'
        || path === '/repos/ajenchen/design-system/rulesets?per_page=100'
      )
    ) {
      return [...this.rulesets.entries()]
        .map(([id, value]) => ({ id, name: value.name }))
        .sort((left, right) => left.id - right.id)
    }
    if (method === 'POST' && path === '/repos/ajenchen/design-system/rulesets') {
      const id = this.nextRulesetId
      this.nextRulesetId += 1
      this.rulesets.set(id, { id, ...clone(body) })
      return { id }
    }
    const ruleset = /^\/repos\/ajenchen\/design-system\/rulesets\/([0-9]+)$/.exec(path)
    if (ruleset) {
      const id = Number(ruleset[1])
      if (method === 'GET') return this.rulesets.has(id) ? clone(this.rulesets.get(id)) : null
      if (method === 'PUT') {
        this.rulesets.set(id, { id, ...clone(body) })
        return clone(this.rulesets.get(id))
      }
    }
    if (method === 'GET' && path === '/repos/ajenchen/design-system/environments?per_page=100') {
      const environments = [...this.environments.values()]
        .map(value => ({ name: value.name }))
        .sort((left, right) => left.name.localeCompare(right.name))
      return { total_count: environments.length, environments }
    }
    const environment = /^\/repos\/ajenchen\/design-system\/environments\/(.+)$/.exec(path)
    if (environment) {
      const name = decodeURIComponent(environment[1])
      if (method === 'GET') {
        if (this.environments.has(name)) return clone(this.environments.get(name))
        if (options.allow404) return null
        throw new Error(`fixture environment is absent: ${name}`)
      }
      if (method === 'PUT') {
        this.environments.set(name, { name, ...clone(body) })
        return clone(this.environments.get(name))
      }
    }
    if (options.allow404) return null
    throw new Error(`authority bootstrap fixture has no route for ${method} ${path}`)
  }
}

function mirrorFixture() {
  const keys = generateKeyPairSync('ed25519')
  const publicKeySpki = keys.publicKey.export({ format: 'der', type: 'spki' })
  const mirrorIdentity = {
    protocolVersion: FLEET_RECONCILE_MIRROR_PROTOCOL.protocolVersion,
    provider: 'fixture-independent-worm',
    endpoint: 'https://evidence.example.test/v1/fleet-reconcile',
    tenant: 'fixture-tenant',
    container: 'fixture-governance-worm',
    wormMode: 'compliance-object-lock',
    lifecyclePolicyDigest: sha256('fixture-lifecycle-policy'),
    minimumRetentionDays: 365,
    writerPrincipal: 'fixture-mirror-writer',
    verifierPrincipal: 'fixture-mirror-verifier',
    adapterCommandSha256: sha256('fixture-mirror-adapter'),
    receiptSigningKeyId: 'fixture-mirror-receipt-v1',
    receiptSigningPublicKeySpki: publicKeySpki.toString('base64'),
    receiptSigningPublicKeySpkiSha256: sha256(publicKeySpki),
    signatureAlgorithm: 'ed25519',
  }
  return { keys, mirrorIdentity }
}

function signEventReceipt(journal, mirrorIdentity, privateKey, event) {
  const request = buildFleetReconcileEventMirrorRequest(
    { ...journal, mirrorIdentity },
    event,
  )
  const receipt = {
    schemaVersion: 1,
    kind: FLEET_RECONCILE_MIRROR_PROTOCOL.receiptKind,
    protocolVersion: request.protocolVersion,
    provider: request.provider,
    endpoint: request.endpoint,
    tenant: request.tenant,
    container: request.container,
    principal: request.principal,
    receiptId: `${request.transactionId}:${request.sequence}:ack`,
    transactionId: request.transactionId,
    sequence: request.sequence,
    eventDigest: request.eventDigest,
    eventHeadDigest: request.eventHeadDigest,
    idempotencyKey: request.idempotencyKey,
    requestNonce: request.requestNonce,
    requestDigest: request.requestDigest,
    receivedAt: event.at,
    retainedUntil: RETAINED_UNTIL,
    appendOnly: true,
    independentAdministration: true,
    signingKeyId: mirrorIdentity.receiptSigningKeyId,
    signatureAlgorithm: 'ed25519',
  }
  receipt.signature = sign(
    null,
    fleetReconcileMirrorSignedPayload(receipt, {
      digestField: 'receiptSha256',
      domain: FLEET_RECONCILE_MIRROR_PROTOCOL.receiptSignatureDomain,
    }),
    privateKey,
  ).toString('base64url')
  receipt.receiptSha256 = fleetReconcileMirrorReceiptDigest(receipt)
  return receipt
}

function signHeadVerification(journal, mirrorIdentity, privateKey, replayedAt) {
  const request = buildFleetReconcileHeadVerificationRequest(
    { ...journal, mirrorIdentity },
    {
      requestNonce: '00000000-0000-4000-8000-000000000999',
      requestedAt: new Date(replayedAt),
    },
  )
  const verification = {
    schemaVersion: 1,
    kind: FLEET_RECONCILE_MIRROR_PROTOCOL.verificationKind,
    protocolVersion: request.protocolVersion,
    provider: request.provider,
    endpoint: request.endpoint,
    tenant: request.tenant,
    container: request.container,
    principal: request.principal,
    verificationId: `${request.transactionId}:${request.eventCount}:head`,
    transactionId: request.transactionId,
    eventHeadDigest: request.eventHeadDigest,
    eventCount: request.eventCount,
    requestNonce: request.requestNonce,
    requestDigest: request.requestDigest,
    verifiedAt: request.requestedAt,
    retainedUntil: RETAINED_UNTIL,
    appendOnly: true,
    independentAdministration: true,
    signingKeyId: mirrorIdentity.receiptSigningKeyId,
    signatureAlgorithm: 'ed25519',
  }
  verification.signature = sign(
    null,
    fleetReconcileMirrorSignedPayload(verification, {
      digestField: 'verificationSha256',
      domain: FLEET_RECONCILE_MIRROR_PROTOCOL.verificationSignatureDomain,
    }),
    privateKey,
  ).toString('base64url')
  verification.verificationSha256 = fleetReconcileMirrorVerificationDigest(verification)
  return { request, verification }
}

export function createAuthorityBootstrapReplayFixture({
  inventory,
  desired,
  stagedRolloutPlan,
  freezeAt = new Date('2026-07-20T00:45:00.000Z'),
  replayedAt = REPLAYED_AT,
  aligned = false,
} = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), 'authority-bootstrap-replay-fixture-'))
  try {
    const { projection } = materializeAuthorityBootstrapProjection({
      inventory,
      desired,
      stagedRolloutPlan,
    })
    const client = new AuthorityBootstrapClient(projection, { aligned })
    const authorityPolicyDigest = sha256('fixture-decision-authority-policy')
    const plan = reconcileFixtureTestHarness.buildAuthorityBootstrapPlan({
      inventory,
      desired,
      stagedRolloutPlan,
      client,
      genesisReceipt: genesisReceipt({ inventory, desired }),
      authorityPolicyDigest,
      canonicalInventoryBytesDigest: sha256(stableStringify(inventory, 0)),
      canonicalDesiredBytesDigest: sha256(stableStringify(desired, 0)),
    })
    const journalPath = resolve(directory, 'authority-bootstrap-journal.json')
    reconcileFixtureTestHarness.applyAuthorityBootstrapPlan(plan, client, {
      journalPath,
      inventory,
      desired,
      stagedRolloutPlan,
      authorityPolicyDigest,
      clock: () => new Date(SOURCE_AT),
    })
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
    const { keys, mirrorIdentity } = mirrorFixture()
    const activationRequirement = {
      id: 'activate-off-host-append-only-reconcile-evidence-mirror',
      kind: 'durable-evidence-mirror',
      repository: 'ajenchen/design-system',
      desiredPath: 'infra/governance/bin/reconcile-github.mjs',
      requiredFor: ['release', 'fleet-rollout', 'objective-completion'],
      status: 'activated',
      observedAt: ACTIVATED_AT,
      expiresAt: '2026-08-20T00:15:00.000Z',
      condition: 'Mirror every GitHub reconcile transaction journal, recovery observation, rollback authorization, compensation result, and exact read-back receipt to an independently administered append-only off-host durable store; bind the approved adapter, HTTPS endpoint, tenant/container, WORM lifecycle, distinct writer/verifier principals, nonce, idempotent transaction/sequence/event key, and Ed25519 receipt key; then verify signed content digests and minimum retention by live read-back.',
      reason: 'Local fsync and atomic rename protect a workstation crash boundary but do not survive host loss, operator compromise, or local evidence deletion.',
      evidence: {
        sha256: sha256(`fixture-mirror-activation\n${stableStringify(mirrorIdentity, 0)}`),
        payload: { observedResource: clone(mirrorIdentity) },
      },
    }
    const eventReceipts = journal.events.map(event => (
      signEventReceipt(journal, mirrorIdentity, keys.privateKey, event)
    ))
    const { request: headVerificationRequest, verification: headVerification } = (
      signHeadVerification(journal, mirrorIdentity, keys.privateKey, replayedAt)
    )
    const convergenceReadback = {
      repository: journal.plan.repository,
      defaultBranchHeadSha: journal.plan.defaultBranchHeadSha,
      defaultBranchTreeSha: journal.plan.defaultBranchTreeSha,
      observedStateDigest: sha256('fixture-authority-bootstrap-converged-state'),
      remainingActionsDigest: candidateActionsDigest([]),
      eventHeadDigest: journal.eventHeadDigest,
      genesisReadbackDigest: journal.plan.genesisReadbackDigest,
    }
    const receipt = {
      schemaVersion: 1,
      kind: 'github-authority-policy-bootstrap-durable-replay',
      protocolVersion: mirrorIdentity.protocolVersion,
      purpose: 'candidate-freeze-durability-prerequisite',
      promotionEligible: false,
      managedEvidence: true,
      managedEvidenceScope: 'signed-mirror-event-chain-and-head-only',
      requirementId: activationRequirement.id,
      activationRequirementDigest: sha256(
        `qijenchen-authority-policy-bootstrap-mirror-activation-v1\n${stableStringify(activationRequirement, 0)}`,
      ),
      sourceJournal: clone(journal),
      sourceJournalDigest: authorityBootstrapJournalDigest(journal),
      mirrorIdentity: clone(mirrorIdentity),
      mirrorIdentityDigest: sha256(
        `qijenchen-authority-policy-bootstrap-mirror-identity-v1\n${stableStringify(mirrorIdentity, 0)}`,
      ),
      eventReceipts,
      eventReceiptsDigest: sha256(
        `qijenchen-authority-policy-bootstrap-event-receipts-v1\n${stableStringify(eventReceipts, 0)}`,
      ),
      headVerificationRequest,
      headVerification,
      replayedAt: headVerification.verifiedAt,
      convergenceReadback,
      convergenceReadbackDigest: sha256(
        `qijenchen-authority-policy-bootstrap-convergence-readback-v1\n${stableStringify(convergenceReadback, 0)}`,
      ),
      receiptDigest: null,
    }
    const unsigned = clone(receipt)
    delete unsigned.receiptDigest
    receipt.receiptDigest = sha256(
      `qijenchen-authority-policy-bootstrap-durable-replay-v1\n${stableStringify(unsigned, 0)}`,
    )
    validateAuthorityBootstrapDurableReplayReceipt(receipt, {
      activationRequirement,
      requiredRetentionAt: freezeAt,
      requireTrustedActivation: true,
    })
    return {
      receipt,
      activationRequirement,
      sourceJournal: journal,
      replayedAt,
      retainedUntil: RETAINED_UNTIL,
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
