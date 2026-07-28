import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  compareUtf8Bytes,
  invariant,
  sha256,
  stableStringify,
} from './common.mjs'
import {
  parseCanonicalExternalOperatorArtifact,
  validateExternalLedgerTransactionHandoff,
} from './external-operator.mjs'
import {
  GITHUB_ACTIONS_RUN_LIFECYCLES,
  resolveGitHubActionsRunArtifacts,
  validateGitHubActionsRunArtifactsApiSnapshot,
} from '../../../scripts/lib/github-actions-artifact-identity.mjs'

const DISPATCH_SCHEMA = '../schemas/external-ledger-writer-dispatch.schema.json'
const PLAN_SCHEMA = '../schemas/external-ledger-writer-plan.schema.json'
const RECEIPT_SCHEMA = '../schemas/external-ledger-writer-receipt.schema.json'
const ARTIFACT_IDENTITY_SCHEMA = '../schemas/external-ledger-artifact-identity.schema.json'
const WORKFLOW_PATH = '.github/workflows/external-ledger-writer.yml'
const WORKFLOW_EVENT = 'repository_dispatch'
const WORKFLOW_BRANCH = 'main'
const EVENT_TYPE = 'external-ledger-write-request'
const SHA256 = /^[a-f0-9]{64}$/
const GIT_OID = /^[a-f0-9]{40}$/
const POSITIVE_INTEGER = /^[1-9][0-9]*$/
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const MAX_HANDOFF_BYTES = 4 * 1024 * 1024
const MAX_DISPATCH_BASE64_BYTES = 50 * 1024
const MAX_ARTIFACT_IDENTITY_AGE_MS = 5 * 60 * 1000
const WRITER_NAME = 'Qijenchen Governance Writer App'
const WRITER_EMAIL = 'qijenchen-governance-writer[bot]@users.noreply.github.com'
const WRITER_LOGIN = 'qijenchen-governance-writer[bot]'
const WRITER_APP_SLUG = 'qijenchen-governance-writer'
const CREATE_APP_TOKEN_ACTION_SHA = 'fee1f7d63c2ff003460e3d139729b119787bc349'
const UTF8 = new TextDecoder('utf-8', { fatal: true })

export const EXTERNAL_LEDGER_WRITER_WORKFLOW_PATH = WORKFLOW_PATH
export const EXTERNAL_LEDGER_WRITER_EVENT_TYPE = EVENT_TYPE
export const EXTERNAL_LEDGER_WRITER_ENVIRONMENT = 'governance-external-ledger'

function clone(value) {
  return structuredClone(value)
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant([Object.prototype, null].includes(Object.getPrototypeOf(value)), `${label} must be a plain object`)
  const actual = Object.keys(value).sort(compareUtf8Bytes)
  const wanted = [...expected].sort(compareUtf8Bytes)
  invariant(
    actual.length === wanted.length && actual.every((key, index) => key === wanted[index]),
    `${label} has an open or incomplete shape`,
  )
}

function positiveIntegerString(value, label) {
  const normalized = String(value ?? '')
  invariant(POSITIVE_INTEGER.test(normalized), `${label} must be a positive integer`)
  invariant(Number.isSafeInteger(Number(normalized)), `${label} is outside the safe integer range`)
  return normalized
}

function digestValue(value) {
  return sha256(stableStringify(value, 0))
}

function digestWithout(value, key) {
  const unsigned = clone(value)
  delete unsigned[key]
  return digestValue(unsigned)
}

function canonicalUtc(value, label) {
  invariant(typeof value === 'string', `${label} must be a canonical UTC timestamp`)
  const parsed = new Date(value)
  invariant(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value,
    `${label} must be a canonical UTC timestamp`)
  return parsed
}

function canonicalHandoffBytes(handoff) {
  return Buffer.from(`${stableStringify(handoff)}\n`, 'utf8')
}

function canonicalLedgerAfterBytes(handoff) {
  invariant(handoff.operation !== 'provider-review-capability-certification',
    'Provider review certification uses an exact ledger after-image set')
  return Buffer.from(`${JSON.stringify(handoff.ledgerAfter, null, 2)}\n`, 'utf8')
}

function canonicalLedgerAfterByteEntries(handoff) {
  if (handoff.operation !== 'provider-review-capability-certification') {
    return [{ ledger: handoff.ledger, bytes: canonicalLedgerAfterBytes(handoff) }]
  }
  return [
    {
      ledger: handoff.ledgers[0],
      bytes: Buffer.from(
        `${JSON.stringify(handoff.ledgerAfters.providerCertifications, null, 2)}\n`,
        'utf8',
      ),
    },
    {
      ledger: handoff.ledgers[1],
      bytes: Buffer.from(
        `${JSON.stringify(handoff.ledgerAfters.reviewCapabilityCertifications, null, 2)}\n`,
        'utf8',
      ),
    },
  ]
}

function decodeEvidenceArtifact(handoff) {
  invariant(handoff.operation === 'external-runtime-certification',
    'Only certification handoffs may carry an external evidence artifact')
  const artifact = handoff.evidenceArtifact
  exactKeys(artifact, ['path', 'sha256', 'canonicalBase64'], 'External certification evidence artifact')
  invariant(artifact.path === handoff.reviewedProposal?.evidence?.reference
    && artifact.sha256 === handoff.reviewedProposal?.evidence?.artifactSha256
    && SHA256.test(artifact.sha256 ?? '')
    && typeof artifact.canonicalBase64 === 'string'
    && artifact.canonicalBase64.length > 0
    && artifact.canonicalBase64.length <= Math.ceil(MAX_HANDOFF_BYTES / 3) * 4
    && /^[A-Za-z0-9+/]+={0,2}$/.test(artifact.canonicalBase64),
  'External certification evidence artifact is detached, malformed, or oversized')
  const bytes = Buffer.from(artifact.canonicalBase64, 'base64')
  invariant(bytes.length > 0
    && bytes.length <= MAX_HANDOFF_BYTES
    && bytes.toString('base64') === artifact.canonicalBase64
    && sha256(bytes) === artifact.sha256,
  'External certification evidence artifact bytes/content address are invalid')
  const parsed = parseCanonicalExternalOperatorArtifact(bytes, 'External certification evidence artifact')
  invariant(canonicalHandoffBytes(parsed).equals(bytes),
    'External certification evidence artifact bytes are not canonical JSON')
  return { path: artifact.path, bytes }
}

function decodeProviderReviewEvidenceArtifacts(handoff) {
  invariant(
    handoff.operation === 'provider-review-capability-certification'
      && Array.isArray(handoff.evidenceArtifacts)
      && handoff.evidenceArtifacts.length === 2,
    'Provider review certification evidence artifact closure is invalid',
  )
  const expectedPatterns = [
    /^infra\/governance\/evidence\/provider-runtime\/[a-f0-9]{64}\.json$/,
    /^infra\/governance\/evidence\/review-capability\/[a-f0-9]{64}\.json$/,
  ]
  return handoff.evidenceArtifacts.map((artifact, index) => {
    exactKeys(artifact, ['path', 'sha256', 'canonicalBase64'],
      `Provider review certification evidence artifact[${index}]`)
    invariant(
      expectedPatterns[index].test(artifact.path ?? '')
        && artifact.path.endsWith(`/${artifact.sha256}.json`)
        && SHA256.test(artifact.sha256 ?? '')
        && typeof artifact.canonicalBase64 === 'string'
        && artifact.canonicalBase64.length > 0
        && artifact.canonicalBase64.length <= Math.ceil(MAX_HANDOFF_BYTES / 3) * 4
        && /^[A-Za-z0-9+/]+={0,2}$/.test(artifact.canonicalBase64),
      `Provider review certification evidence artifact[${index}] is malformed`,
    )
    const bytes = Buffer.from(artifact.canonicalBase64, 'base64')
    invariant(
      bytes.length > 0
        && bytes.length <= MAX_HANDOFF_BYTES
        && bytes.toString('base64') === artifact.canonicalBase64
        && sha256(bytes) === artifact.sha256,
      `Provider review certification evidence artifact[${index}] content address is invalid`,
    )
    const parsed = parseCanonicalExternalOperatorArtifact(
      bytes,
      `Provider review certification evidence artifact[${index}]`,
    )
    invariant(
      canonicalHandoffBytes(parsed).equals(bytes),
      `Provider review certification evidence artifact[${index}] is not canonical JSON`,
    )
    return { path: artifact.path, bytes }
  })
}

function plannedChanges(handoff, ledgerAfterEntries) {
  if (handoff.operation === 'provider-review-capability-certification') {
    const artifacts = decodeProviderReviewEvidenceArtifacts(handoff)
    const ledgerByPath = new Map(ledgerAfterEntries.map(entry => [entry.ledger.path, entry]))
    const materializations = [
      { path: artifacts[0].path, baseState: 'absent', bytes: artifacts[0].bytes },
      {
        path: handoff.ledgers[0].path,
        baseState: 'existing-different',
        bytes: ledgerByPath.get(handoff.ledgers[0].path)?.bytes,
      },
      { path: artifacts[1].path, baseState: 'absent', bytes: artifacts[1].bytes },
      {
        path: handoff.ledgers[1].path,
        baseState: 'existing-different',
        bytes: ledgerByPath.get(handoff.ledgers[1].path)?.bytes,
      },
    ]
    invariant(materializations.every(entry => Buffer.isBuffer(entry.bytes)),
      'Provider review certification ledger after-image bytes are incomplete')
    invariant(
      stableStringify(materializations.map(entry => entry.path), 0)
        === stableStringify(handoff.requiredChangedPaths, 0),
      'Provider review certification requiredChangedPaths differs from its exact four materializations',
    )
    return materializations.map(entry => ({
      ...entry,
      mode: '100644',
      type: 'blob',
      bytesSha256: sha256(entry.bytes),
      gitBlobSha: gitBlobSha(entry.bytes),
    }))
  }
  const ledgerAfterBytes = ledgerAfterEntries[0].bytes
  const entries = []
  if (handoff.operation === 'external-runtime-certification') {
    const evidence = decodeEvidenceArtifact(handoff)
    entries.push({
      path: evidence.path,
      baseState: 'absent',
      bytes: evidence.bytes,
    })
  } else invariant(handoff.evidenceArtifact === null,
    'External activation handoff cannot carry certification evidence bytes')
  entries.push({
    path: handoff.ledger.path,
    baseState: 'existing-different',
    bytes: ledgerAfterBytes,
  })
  invariant(stableStringify(entries.map(entry => entry.path), 0)
    === stableStringify(handoff.requiredChangedPaths, 0),
  'External ledger handoff requiredChangedPaths differs from its exact materialized changes')
  return entries.map(entry => ({
    ...entry,
    mode: '100644',
    type: 'blob',
    bytesSha256: sha256(entry.bytes),
    gitBlobSha: gitBlobSha(entry.bytes),
  }))
}

function compressedHandoff(handoff) {
  const bytes = canonicalHandoffBytes(handoff)
  const gzip = gzipSync(bytes, { level: 9, mtime: 0 })
  return {
    bytes,
    gzip,
    gzipSha256: sha256(gzip),
    gzipBase64: gzip.toString('base64'),
  }
}

function resolveCompressedHandoffCarrier(handoff, suppliedCarrier = null) {
  if (suppliedCarrier === null) return compressedHandoff(handoff)
  exactKeys(
    suppliedCarrier,
    ['gzipSha256', 'gzipBase64'],
    'Supplied external ledger compressed handoff carrier',
  )
  invariant(SHA256.test(suppliedCarrier.gzipSha256 ?? '')
    && typeof suppliedCarrier.gzipBase64 === 'string'
    && suppliedCarrier.gzipBase64.length > 0
    && suppliedCarrier.gzipBase64.length <= MAX_DISPATCH_BASE64_BYTES
    && /^[A-Za-z0-9+/]+={0,2}$/.test(suppliedCarrier.gzipBase64),
  'Supplied external ledger compressed handoff carrier is malformed')
  const gzip = Buffer.from(suppliedCarrier.gzipBase64, 'base64')
  invariant(gzip.toString('base64') === suppliedCarrier.gzipBase64
    && sha256(gzip) === suppliedCarrier.gzipSha256,
  'Supplied external ledger compressed handoff carrier digest is invalid')
  let bytes
  try {
    bytes = gunzipSync(gzip, { maxOutputLength: MAX_HANDOFF_BYTES })
  } catch (error) {
    throw new Error(`Supplied external ledger compressed handoff carrier decompression failed: ${error.message}`, { cause: error })
  }
  invariant(bytes.equals(canonicalHandoffBytes(handoff)),
    'Supplied external ledger compressed handoff carrier is detached from the canonical handoff')
  return {
    bytes,
    gzip,
    gzipSha256: suppliedCarrier.gzipSha256,
    gzipBase64: suppliedCarrier.gzipBase64,
  }
}

function gitBlobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

function operationSlug(operation) {
  if (operation === 'external-runtime-certification') return 'certification'
  if (operation === 'provider-review-capability-certification') return 'review-certification'
  if (operation === 'external-activation') return 'activation'
  throw new Error(`Unsupported external ledger operation: ${operation}`)
}

function deterministicBranch(handoff) {
  return `governance/external-ledger/${operationSlug(handoff.operation)}-${handoff.gitTransaction.expectedBaseCommit.slice(0, 12)}-${handoff.handoffDigest.slice(0, 12)}`
}

function deterministicCommitSubject(handoff) {
  return `chore(governance): apply reviewed ${operationSlug(handoff.operation)} ${handoff.handoffDigest.slice(0, 12)}`
}

function deterministicCommitMessage(handoff, carrier) {
  invariant(carrier
    && SHA256.test(carrier.gzipSha256 ?? '')
    && typeof carrier.gzipBase64 === 'string'
    && carrier.gzipBase64.length > 0,
  'External ledger commit carrier is invalid')
  return [
    deterministicCommitSubject(handoff),
    '',
    `External-Ledger-Handoff-Digest: ${handoff.handoffDigest}`,
    `External-Ledger-Handoff-Gzip-SHA256: ${carrier.gzipSha256}`,
    `External-Ledger-Handoff-Gzip-Base64: ${carrier.gzipBase64}`,
  ].join('\n')
}

export function parseExternalLedgerHandoffCommitMessage(message) {
  invariant(typeof message === 'string' && message.length > 0 && message.length <= 100000,
    'External ledger carrier commit message is missing or oversized')
  const lines = message.replace(/\n$/, '').split('\n')
  invariant(lines.length === 5
    && /^chore\(governance\): apply reviewed (?:certification|activation|review-certification) [a-f0-9]{12}$/.test(lines[0])
    && lines[1] === '',
  'External ledger carrier commit message shape is invalid')
  const digest = lines[2].match(/^External-Ledger-Handoff-Digest: ([a-f0-9]{64})$/)?.[1]
  const gzipDigest = lines[3].match(/^External-Ledger-Handoff-Gzip-SHA256: ([a-f0-9]{64})$/)?.[1]
  const gzipBase64 = lines[4].match(/^External-Ledger-Handoff-Gzip-Base64: ([A-Za-z0-9+/]+={0,2})$/)?.[1]
  invariant(digest && gzipDigest && gzipBase64 && gzipBase64.length <= MAX_DISPATCH_BASE64_BYTES,
    'External ledger carrier commit handoff fields are invalid')
  const gzip = Buffer.from(gzipBase64, 'base64')
  invariant(gzip.toString('base64') === gzipBase64 && sha256(gzip) === gzipDigest,
    'External ledger carrier commit compressed handoff binding is invalid')
  let bytes
  try {
    bytes = gunzipSync(gzip, { maxOutputLength: MAX_HANDOFF_BYTES })
  } catch (error) {
    throw new Error(`External ledger carrier commit handoff decompression failed: ${error.message}`, { cause: error })
  }
  const handoff = parseCanonicalExternalOperatorArtifact(bytes, 'External ledger carrier commit handoff')
  invariant(canonicalHandoffBytes(handoff).equals(bytes)
    && handoff.handoffDigest === digest
    && lines[0] === deterministicCommitSubject(handoff),
  'External ledger carrier commit handoff is non-canonical, substituted, or detached')
  return {
    handoff,
    carrier: { gzipSha256: gzipDigest, gzipBase64 },
  }
}

function deterministicPullRequestTitle(handoff) {
  return `chore(governance): apply reviewed ${operationSlug(handoff.operation)} handoff`
}

function deterministicPullRequestBody(handoff, plan) {
  const ledgerLines = handoff.operation === 'provider-review-capability-certification'
    ? handoff.ledgers.flatMap((ledger, index) => [
        `- Ledger ${index + 1}: \`${ledger.path}\``,
        `- Ledger ${index + 1} before: \`${ledger.beforeSha256}\``,
        `- Ledger ${index + 1} after: \`${ledger.afterSha256}\``,
        `- Ledger ${index + 1} after-image bytes: \`${plan.ledgers[index].afterBytesSha256}\``,
      ])
    : [
        `- Ledger: \`${handoff.ledger.path}\``,
        `- Before: \`${handoff.ledger.beforeSha256}\``,
        `- After: \`${handoff.ledger.afterSha256}\``,
        `- Ledger after-image bytes: \`${plan.ledger.afterBytesSha256}\``,
      ]
  return [
    'Applies exactly one externally reviewed governance-ledger after-image.',
    '',
    `- Handoff: \`${handoff.handoffDigest}\``,
    ...ledgerLines,
    `- Protected base: \`${handoff.gitTransaction.expectedBaseCommit}\``,
    `- Dispatch: \`${plan.dispatchDigest}\``,
    `- Plan: \`${plan.planDigest}\``,
    `- Handoff bytes: \`${plan.handoff.bytesSha256}\``,
    '',
    'The same-run artifact identity is recorded in the transient readback receipt, not in this retry-stable PR identity.',
    'This Writer App transaction cannot write the default branch, merge, review, approve, or execute candidate code.',
  ].join('\n')
}

function validateArtifactBinding(artifact) {
  exactKeys(artifact, ['runId', 'runAttempt', 'id', 'digest', 'name'], 'External ledger artifact binding')
  const runId = positiveIntegerString(artifact.runId, 'External ledger artifact run id')
  const runAttempt = positiveIntegerString(artifact.runAttempt, 'External ledger artifact run attempt')
  const id = positiveIntegerString(artifact.id, 'External ledger artifact id')
  invariant(SHA256.test(artifact.digest ?? ''), 'External ledger artifact digest must be a lowercase SHA-256')
  invariant(artifact.name === expectedExternalLedgerArtifactName({ runId, runAttempt }), 'External ledger artifact name is not canonical')
  return { runId, runAttempt, id, digest: artifact.digest, name: artifact.name }
}

function validateHandoffAtBase(handoff, {
  currentBaseCommit,
  currentBaseTree,
  baseLedgerSha256,
  baseLedgerSha256s = null,
  now,
  validationOptions = {},
}) {
  invariant(GIT_OID.test(currentBaseCommit ?? ''), 'External ledger current base commit is invalid')
  invariant(GIT_OID.test(currentBaseTree ?? ''), 'External ledger current base tree is invalid')
  if (handoff.operation === 'provider-review-capability-certification') {
    invariant(
      baseLedgerSha256s
        && SHA256.test(baseLedgerSha256s['infra/governance/providers/certifications.json'] ?? '')
        && SHA256.test(baseLedgerSha256s['infra/governance/providers/review-capability-certifications.json'] ?? ''),
      'Provider review certification current base ledger set is invalid',
    )
  } else invariant(SHA256.test(baseLedgerSha256 ?? ''),
    'External ledger current base semantic digest is invalid')
  return validateExternalLedgerTransactionHandoff(handoff, {
    ...validationOptions,
    currentBaseCommit,
    currentBaseTree,
    baseLedgerSha256,
    baseLedgerSha256s,
    now,
  })
}

export function createExternalLedgerWriterDispatch({
  handoff,
  carrier = null,
  currentBaseCommit,
  currentBaseTree,
  baseLedgerSha256,
  baseLedgerSha256s = null,
  now = new Date(),
  validationOptions = {},
} = {}) {
  validateHandoffAtBase(handoff, {
    currentBaseCommit,
    currentBaseTree,
    baseLedgerSha256,
    baseLedgerSha256s,
    now,
    validationOptions,
  })
  const resolvedCarrier = resolveCompressedHandoffCarrier(handoff, carrier)
  const {
    bytes: handoffBytes,
    gzip: compressed,
    gzipBase64: compressedBase64,
  } = resolvedCarrier
  invariant(handoffBytes.length > 0 && handoffBytes.length <= MAX_HANDOFF_BYTES, 'External ledger handoff is missing or oversized')
  invariant(compressedBase64.length <= MAX_DISPATCH_BASE64_BYTES, 'External ledger handoff exceeds the closed repository_dispatch payload budget')
  const payload = {
    $schema: DISPATCH_SCHEMA,
    schemaVersion: 1,
    kind: 'external-ledger-writer-dispatch',
    repository: handoff.repository.github,
    expectedBaseCommit: handoff.gitTransaction.expectedBaseCommit,
    handoffDigest: handoff.handoffDigest,
    handoffSha256: sha256(handoffBytes),
    handoffGzipSha256: sha256(compressed),
    handoffGzipBase64: compressedBase64,
  }
  return {
    event_type: EVENT_TYPE,
    client_payload: {
      ...payload,
      dispatchDigest: digestValue(payload),
    },
  }
}

export function decodeExternalLedgerWriterDispatch(request, {
  repository,
  currentBaseCommit,
  currentBaseTree,
  baseLedgerSha256,
  baseLedgerSha256s = null,
  now = new Date(),
  validationOptions = {},
} = {}) {
  exactKeys(request, ['event_type', 'client_payload'], 'External ledger repository dispatch')
  invariant(request.event_type === EVENT_TYPE, 'External ledger repository dispatch event type is invalid')
  const payload = request.client_payload
  exactKeys(payload, [
    '$schema', 'schemaVersion', 'kind', 'repository', 'expectedBaseCommit',
    'handoffDigest', 'handoffSha256', 'handoffGzipSha256', 'handoffGzipBase64',
    'dispatchDigest',
  ], 'External ledger repository dispatch payload')
  invariant(
    payload.$schema === DISPATCH_SCHEMA
      && payload.schemaVersion === 1
      && payload.kind === 'external-ledger-writer-dispatch',
    'External ledger repository dispatch identity is invalid',
  )
  invariant(REPOSITORY.test(payload.repository ?? '') && payload.repository === repository, 'External ledger repository dispatch targets another repository')
  invariant(GIT_OID.test(payload.expectedBaseCommit ?? '') && payload.expectedBaseCommit === currentBaseCommit, 'External ledger repository dispatch protected base changed')
  invariant(SHA256.test(payload.handoffDigest ?? '')
    && SHA256.test(payload.handoffSha256 ?? '')
    && SHA256.test(payload.handoffGzipSha256 ?? ''), 'External ledger repository dispatch digest field is invalid')
  invariant(payload.dispatchDigest === digestWithout(payload, 'dispatchDigest'), 'External ledger repository dispatch digest is invalid')
  invariant(typeof payload.handoffGzipBase64 === 'string'
    && payload.handoffGzipBase64.length > 0
    && payload.handoffGzipBase64.length <= MAX_DISPATCH_BASE64_BYTES
    && /^[A-Za-z0-9+/]+={0,2}$/.test(payload.handoffGzipBase64), 'External ledger repository dispatch compressed payload is invalid')
  const compressed = Buffer.from(payload.handoffGzipBase64, 'base64')
  invariant(compressed.toString('base64') === payload.handoffGzipBase64, 'External ledger repository dispatch base64 is not canonical')
  invariant(sha256(compressed) === payload.handoffGzipSha256, 'External ledger repository dispatch compressed digest is invalid')
  let bytes
  try {
    bytes = gunzipSync(compressed, { maxOutputLength: MAX_HANDOFF_BYTES })
  } catch (error) {
    throw new Error(`External ledger repository dispatch decompression failed: ${error.message}`, { cause: error })
  }
  invariant(bytes.length > 0 && bytes.length <= MAX_HANDOFF_BYTES, 'External ledger repository dispatch decompressed payload is missing or oversized')
  invariant(sha256(bytes) === payload.handoffSha256, 'External ledger repository dispatch handoff byte digest is invalid')
  const handoff = parseCanonicalExternalOperatorArtifact(bytes, 'External ledger writer handoff')
  invariant(canonicalHandoffBytes(handoff).equals(bytes), 'External ledger writer handoff bytes are not canonical')
  invariant(handoff.handoffDigest === payload.handoffDigest
    && handoff.repository.github === payload.repository
    && handoff.gitTransaction.expectedBaseCommit === payload.expectedBaseCommit,
  'External ledger repository dispatch is detached from its handoff')
  validateHandoffAtBase(handoff, {
    currentBaseCommit,
    currentBaseTree,
    baseLedgerSha256,
    baseLedgerSha256s,
    now,
    validationOptions,
  })
  return {
    request: clone(request),
    payload: clone(payload),
    handoff,
    handoffBytes: bytes,
    carrier: {
      gzipSha256: payload.handoffGzipSha256,
      gzipBase64: payload.handoffGzipBase64,
    },
  }
}

export function createExternalLedgerWriterPlan({
  request,
  repository,
  currentBaseCommit,
  currentBaseTree,
  baseLedgerSha256,
  baseLedgerSha256s = null,
  now = new Date(),
  validationOptions = {},
} = {}) {
  const decoded = decodeExternalLedgerWriterDispatch(request, {
    repository,
    currentBaseCommit,
    currentBaseTree,
    baseLedgerSha256,
    baseLedgerSha256s,
    now,
    validationOptions,
  })
  const { handoff, payload } = decoded
  const ledgerAfterEntries = canonicalLedgerAfterByteEntries(handoff)
  const materializedChanges = plannedChanges(handoff, ledgerAfterEntries)
  const branch = deterministicBranch(handoff)
  const commit = {
    subject: deterministicCommitSubject(handoff),
    handoffDigest: handoff.handoffDigest,
    author: { name: WRITER_NAME, email: WRITER_EMAIL, date: handoff.preparedAt },
    committer: { name: WRITER_NAME, email: WRITER_EMAIL, date: handoff.preparedAt },
  }
  const core = {
    $schema: PLAN_SCHEMA,
    schemaVersion: handoff.operation === 'provider-review-capability-certification' ? 2 : 1,
    kind: 'external-ledger-writer-plan',
    mutationAuthorized: false,
    candidateCodeExecutionAllowed: false,
    directDefaultBranchWriteAllowed: false,
    mergeAllowed: false,
    reviewAllowed: false,
    dispatchDigest: payload.dispatchDigest,
    handoff: {
      digest: handoff.handoffDigest,
      bytesSha256: payload.handoffSha256,
      operation: handoff.operation,
      validUntil: handoff.validUntil,
      validitySemantics: 'writer-materialization-envelope-only-not-merge-authorization',
    },
    repository: clone(handoff.repository),
    gitTransaction: {
      expectedBaseRef: handoff.gitTransaction.expectedBaseRef,
      expectedBaseCommit: handoff.gitTransaction.expectedBaseCommit,
      expectedBaseTree: handoff.gitTransaction.expectedBaseTree,
      expectedOldBranchState: 'absent-or-exact',
      branch,
    },
    ...(handoff.operation === 'provider-review-capability-certification'
      ? {
          ledgers: ledgerAfterEntries.map(({ ledger, bytes }) => ({
            path: ledger.path,
            beforeSha256: ledger.beforeSha256,
            afterSha256: ledger.afterSha256,
            afterBytesSha256: sha256(bytes),
            afterGitBlobSha: gitBlobSha(bytes),
          })),
        }
      : {
          ledger: {
            path: handoff.ledger.path,
            beforeSha256: handoff.ledger.beforeSha256,
            afterSha256: handoff.ledger.afterSha256,
            afterBytesSha256: sha256(ledgerAfterEntries[0].bytes),
            afterGitBlobSha: gitBlobSha(ledgerAfterEntries[0].bytes),
          },
        }),
    changes: materializedChanges.map(({ path, baseState, mode, type, bytesSha256, gitBlobSha: blobSha }) => ({
      path,
      baseState,
      mode,
      type,
      bytesSha256,
      gitBlobSha: blobSha,
    })),
    commit,
    pullRequest: {
      base: handoff.repository.defaultBranch,
      head: branch,
      title: deterministicPullRequestTitle(handoff),
      artifactBindingRequired: true,
      maintainerCanModify: false,
    },
  }
  return {
    handoff,
    handoffBytes: decoded.handoffBytes,
    ledgerAfterBytes: handoff.operation === 'provider-review-capability-certification'
      ? new Map(ledgerAfterEntries.map(entry => [entry.ledger.path, Buffer.from(entry.bytes)]))
      : ledgerAfterEntries[0].bytes,
    changeBytes: new Map(materializedChanges.map(change => [change.path, Buffer.from(change.bytes)])),
    commitMessage: deterministicCommitMessage(handoff, decoded.carrier),
    pullRequestBody: deterministicPullRequestBody(handoff, { ...core, planDigest: digestValue(core) }),
    plan: { ...core, planDigest: digestValue(core) },
  }
}

export function validateExternalLedgerWriterPlan(plan, {
  request,
  repository,
  currentBaseCommit,
  currentBaseTree,
  baseLedgerSha256,
  baseLedgerSha256s = null,
  now = new Date(),
  validationOptions = {},
} = {}) {
  exactKeys(plan, [
    '$schema', 'schemaVersion', 'kind', 'mutationAuthorized',
    'candidateCodeExecutionAllowed', 'directDefaultBranchWriteAllowed',
    'mergeAllowed', 'reviewAllowed', 'dispatchDigest', 'handoff', 'repository',
    'gitTransaction',
    ...(plan.handoff?.operation === 'provider-review-capability-certification'
      ? ['ledgers']
      : ['ledger']),
    'changes', 'commit', 'pullRequest', 'planDigest',
  ], 'External ledger writer plan')
  invariant(plan.$schema === PLAN_SCHEMA
    && plan.schemaVersion
      === (plan.handoff?.operation === 'provider-review-capability-certification' ? 2 : 1)
    && plan.kind === 'external-ledger-writer-plan'
    && plan.mutationAuthorized === false
    && plan.candidateCodeExecutionAllowed === false
    && plan.directDefaultBranchWriteAllowed === false
    && plan.mergeAllowed === false
    && plan.reviewAllowed === false,
  'External ledger writer plan identity or mutation boundary is invalid')
  invariant(plan.planDigest === digestWithout(plan, 'planDigest'), 'External ledger writer plan digest is invalid')
  const expected = createExternalLedgerWriterPlan({
    request,
    repository,
    currentBaseCommit,
    currentBaseTree,
    baseLedgerSha256,
    baseLedgerSha256s,
    now,
    validationOptions,
  })
  invariant(stableStringify(plan, 0) === stableStringify(expected.plan, 0), 'External ledger writer plan is stale, substituted, or non-canonical')
  return expected
}

export function expectedExternalLedgerArtifactName({ runId, runAttempt }) {
  return `external-ledger-${positiveIntegerString(runId, 'External ledger run id')}-${positiveIntegerString(runAttempt, 'External ledger run attempt')}`
}

function externalLedgerArtifactContract(expected) {
  const runId = positiveIntegerString(expected.runId, 'External ledger run id')
  const runAttempt = positiveIntegerString(expected.runAttempt, 'External ledger run attempt')
  invariant(REPOSITORY.test(expected.repository ?? ''), 'External ledger artifact repository is invalid')
  invariant(GIT_OID.test(expected.headSha ?? ''), 'External ledger artifact workflow head SHA is invalid')
  invariant(SHA256.test(expected.artifactDigest ?? ''), 'External ledger artifact upload digest is invalid')
  return {
    expected: {
      repository: expected.repository,
      workflowPath: WORKFLOW_PATH,
      workflowEvent: WORKFLOW_EVENT,
      headBranch: WORKFLOW_BRANCH,
      headSha: expected.headSha,
      runId,
      runAttempt,
    },
    artifactExpectations: [{
      label: 'external ledger handoff artifact',
      name: expectedExternalLedgerArtifactName({ runId, runAttempt }),
      digest: expected.artifactDigest,
    }],
    runLabel: 'external ledger writer run',
    artifactSetLabel: 'external ledger writer artifact',
    runLifecycle: GITHUB_ACTIONS_RUN_LIFECYCLES.SAME_RUN_IN_PROGRESS,
  }
}

function projectArtifactIdentity(identity, expected) {
  invariant(identity.artifacts.length === 1, 'External ledger writer run must resolve exactly one expected handoff artifact')
  const artifact = identity.artifacts[0]
  invariant(artifact.id === positiveIntegerString(expected.artifactId, 'External ledger artifact id'), 'External ledger artifact id differs from the upload output')
  return {
    repository: identity.repository,
    workflow: identity.workflow,
    artifact,
  }
}

export function validateExternalLedgerRunArtifactApiSnapshot({ run, artifacts, expected, now = new Date() }) {
  const identity = validateGitHubActionsRunArtifactsApiSnapshot({
    run,
    artifacts,
    now,
    ...externalLedgerArtifactContract(expected),
  })
  return projectArtifactIdentity(identity, expected)
}

export async function resolveExternalLedgerRunArtifactIdentity({
  repository,
  headSha,
  runId,
  runAttempt,
  artifactId,
  artifactDigest,
  requestJson,
  now = new Date(),
}) {
  invariant(typeof requestJson === 'function', 'External ledger artifact GitHub request function is required')
  const expected = { repository, headSha, runId, runAttempt, artifactId, artifactDigest }
  const identity = await resolveGitHubActionsRunArtifacts({
    requestJson,
    now,
    ...externalLedgerArtifactContract(expected),
  })
  return projectArtifactIdentity(identity, expected)
}

export function createExternalLedgerRunArtifactIdentityReceipt(identity, { now = new Date() } = {}) {
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'External ledger artifact identity receipt time is invalid')
  exactKeys(identity, ['repository', 'workflow', 'artifact'], 'External ledger resolved artifact identity')
  const core = {
    $schema: ARTIFACT_IDENTITY_SCHEMA,
    schemaVersion: 1,
    kind: 'external-ledger-run-artifact-identity',
    verifiedAt: now.toISOString(),
    repository: identity.repository,
    workflow: clone(identity.workflow),
    artifact: clone(identity.artifact),
  }
  const receipt = { ...core, identityDigest: digestValue(core) }
  validateExternalLedgerRunArtifactIdentityReceipt(receipt, {
    repository: identity.repository,
    headSha: identity.workflow.headSha,
    runId: identity.workflow.runId,
    runAttempt: identity.workflow.runAttempt,
    artifactId: identity.artifact.id,
    artifactDigest: String(identity.artifact.digest).replace(/^sha256:/, ''),
    now,
  })
  return receipt
}

export function validateExternalLedgerRunArtifactIdentityReceipt(receipt, {
  repository,
  headSha,
  runId,
  runAttempt,
  artifactId,
  artifactDigest,
  now = new Date(),
} = {}) {
  invariant(now instanceof Date && Number.isFinite(now.getTime()), 'External ledger artifact identity validation time is invalid')
  exactKeys(receipt, [
    '$schema', 'schemaVersion', 'kind', 'verifiedAt', 'repository',
    'workflow', 'artifact', 'identityDigest',
  ], 'External ledger run artifact identity receipt')
  invariant(receipt.$schema === ARTIFACT_IDENTITY_SCHEMA
    && receipt.schemaVersion === 1
    && receipt.kind === 'external-ledger-run-artifact-identity',
  'External ledger run artifact identity receipt identity is invalid')
  invariant(receipt.identityDigest === digestWithout(receipt, 'identityDigest'),
    'External ledger run artifact identity receipt digest is invalid')
  invariant(REPOSITORY.test(repository ?? '') && receipt.repository === repository,
    'External ledger run artifact identity receipt repository mismatch')
  exactKeys(receipt.workflow, [
    'path', 'event', 'headBranch', 'runId', 'runAttempt', 'headSha', 'status', 'conclusion',
  ], 'External ledger run workflow identity')
  const expectedRunId = positiveIntegerString(runId, 'External ledger expected run id')
  const expectedRunAttempt = positiveIntegerString(runAttempt, 'External ledger expected run attempt')
  invariant(receipt.workflow.path === WORKFLOW_PATH
    && receipt.workflow.event === WORKFLOW_EVENT
    && receipt.workflow.headBranch === WORKFLOW_BRANCH
    && receipt.workflow.headSha === headSha
    && receipt.workflow.runId === expectedRunId
    && String(receipt.workflow.runAttempt) === expectedRunAttempt
    && receipt.workflow.status === 'in_progress'
    && receipt.workflow.conclusion === null,
  'External ledger run artifact identity receipt workflow/run/head boundary is invalid')
  exactKeys(receipt.artifact, [
    'id', 'name', 'digest', 'sizeInBytes', 'createdAt', 'expiresAt',
  ], 'External ledger run artifact identity')
  const expectedArtifactId = positiveIntegerString(artifactId, 'External ledger expected artifact id')
  invariant(receipt.artifact.id === expectedArtifactId
    && receipt.artifact.name === expectedExternalLedgerArtifactName({
      runId: expectedRunId,
      runAttempt: expectedRunAttempt,
    })
    && receipt.artifact.digest === `sha256:${artifactDigest}`
    && SHA256.test(artifactDigest ?? '')
    && Number.isSafeInteger(receipt.artifact.sizeInBytes)
    && receipt.artifact.sizeInBytes > 0,
  'External ledger run artifact identity receipt artifact binding is invalid')
  const verifiedAt = canonicalUtc(receipt.verifiedAt, 'External ledger artifact identity verifiedAt')
  const createdAt = canonicalUtc(receipt.artifact.createdAt, 'External ledger artifact identity createdAt')
  const expiresAt = canonicalUtc(receipt.artifact.expiresAt, 'External ledger artifact identity expiresAt')
  invariant(createdAt <= verifiedAt
    && verifiedAt <= now
    && now.getTime() - verifiedAt.getTime() <= MAX_ARTIFACT_IDENTITY_AGE_MS
    && now < expiresAt,
    'External ledger run artifact identity receipt is future-dated, stale, or expired')
  return {
    receipt: clone(receipt),
    artifact: {
      runId: expectedRunId,
      runAttempt: expectedRunAttempt,
      id: expectedArtifactId,
      digest: artifactDigest,
      name: receipt.artifact.name,
    },
  }
}

function base64File(response, expectedPath, label) {
  invariant(response && typeof response === 'object' && !Array.isArray(response), `${label} response is invalid`)
  invariant(response.type === 'file' && response.path === expectedPath && GIT_OID.test(response.sha ?? ''), `${label} file identity is invalid`)
  invariant(response.encoding === 'base64'
    && typeof response.content === 'string'
    && response.content.length <= Math.ceil(MAX_HANDOFF_BYTES / 3) * 4 + 4096,
  `${label} base64 content is invalid or oversized`)
  const compact = response.content.replace(/\s/g, '')
  invariant(/^[A-Za-z0-9+/]*={0,2}$/.test(compact), `${label} base64 content is malformed`)
  const bytes = Buffer.from(compact, 'base64')
  invariant(bytes.length > 0 && bytes.length <= MAX_HANDOFF_BYTES, `${label} bytes are missing or oversized`)
  invariant(gitBlobSha(bytes) === response.sha, `${label} Git blob readback is invalid`)
  return { bytes, blobSha: response.sha }
}

function repositoryPath(repository, suffix) {
  return suffix ? `/repos/${repository}/${suffix}` : `/repos/${repository}`
}

function refPath(repository, branch) {
  return repositoryPath(repository, `git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`)
}

function contentsPath(repository, path, ref) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  return repositoryPath(repository, `contents/${encodedPath}?ref=${encodeURIComponent(ref)}`)
}

async function observeRepository({ requestJson, repository, defaultBranch }) {
  const observed = await requestJson(repositoryPath(repository, ''))
  invariant(observed?.full_name === repository
    && observed?.default_branch === defaultBranch
    && observed?.owner?.login === repository.split('/')[0],
  'External ledger writer repository/default-branch identity changed')
  return {
    fullName: observed.full_name,
    owner: observed.owner.login,
    defaultBranch: observed.default_branch,
  }
}

async function observeRef({ requestJson, repository, branch, allow404 = false }) {
  const response = await requestJson(refPath(repository, branch), { allow404 })
  if (response === null && allow404) return null
  invariant(response?.ref === `refs/heads/${branch}`
    && response?.object?.type === 'commit'
    && GIT_OID.test(response.object.sha ?? ''),
  `External ledger writer ref readback is invalid: ${branch}`)
  return response.object.sha
}

function gitIdentityMatches(actual, expected) {
  return actual?.name === expected.name
    && actual?.email === expected.email
    && actual?.date === expected.date
}

async function observeCommit({
  requestJson,
  repository,
  commit,
  expectedTree = null,
  expectedParent = undefined,
  expectedMetadata = null,
}) {
  const response = await requestJson(repositoryPath(repository, `git/commits/${commit}`))
  invariant(response?.sha === commit && GIT_OID.test(response?.tree?.sha ?? '') && Array.isArray(response?.parents),
    `External ledger writer commit readback is invalid: ${commit}`)
  if (expectedTree !== null) invariant(response.tree.sha === expectedTree, 'External ledger writer commit tree differs from the expected tree')
  if (expectedParent !== undefined) {
    invariant(response.parents.length === 1 && response.parents[0]?.sha === expectedParent,
      'External ledger writer head commit is not an exact one-parent child of the reviewed protected base')
  }
  if (expectedMetadata !== null) {
    const parsed = parseExternalLedgerHandoffCommitMessage(response.message)
    invariant(response.message === expectedMetadata.message
      && stableStringify(parsed.handoff, 0) === stableStringify(expectedMetadata.handoff, 0)
      && parsed.handoff.handoffDigest === expectedMetadata.handoffDigest
      && response.message.split('\n', 1)[0] === expectedMetadata.subject
      && gitIdentityMatches(response.author, expectedMetadata.author)
      && gitIdentityMatches(response.committer, expectedMetadata.committer),
    'External ledger head commit message/author/committer identity differs from the reviewed deterministic commit')
  }
  return {
    commit: response.sha,
    tree: response.tree.sha,
    parents: response.parents.map(parent => parent.sha),
    messageSha256: sha256(response.message),
    author: response.author ? clone(response.author) : null,
    committer: response.committer ? clone(response.committer) : null,
  }
}

function treeEntries(response, expectedSha, label) {
  invariant(response?.sha === expectedSha
    && response.truncated === false
    && Array.isArray(response.tree)
    && response.tree.length < 100000,
  `${label} Git tree readback is invalid, truncated, or oversized`)
  const entries = new Map()
  for (const entry of response.tree) {
    invariant(entry && typeof entry === 'object' && !Array.isArray(entry)
      && typeof entry.path === 'string'
      && entry.path.length > 0
      && !entry.path.includes('/')
      && /^(?:040000|100644|100755|120000|160000)$/.test(entry.mode ?? '')
      && ['tree', 'blob', 'commit'].includes(entry.type)
      && GIT_OID.test(entry.sha ?? '')
      && !entries.has(entry.path),
    `${label} Git tree entry is malformed or duplicated`)
    entries.set(entry.path, {
      path: entry.path,
      mode: entry.mode,
      type: entry.type,
      sha: entry.sha,
    })
  }
  return entries
}

function changeTree(changes) {
  const root = { children: new Map(), change: null }
  for (const change of changes) {
    const segments = change.path.split('/')
    invariant(segments.length > 1 && segments.every(segment => segment && segment !== '.' && segment !== '..'),
      'External ledger changed path cannot be represented as a closed Git tree traversal')
    let current = root
    for (const segment of segments) {
      if (!current.children.has(segment)) current.children.set(segment, { children: new Map(), change: null })
      current = current.children.get(segment)
    }
    invariant(current.change === null && current.children.size === 0,
      'External ledger changed paths overlap or duplicate one another')
    current.change = change
  }
  return root
}

async function observeExactChangedTreeClosure({
  requestJson,
  repository,
  baseTree,
  headTree,
  changes,
}) {
  const root = changeTree(changes)
  const onlyAbsentChanges = node => (
    (node.change === null || node.change.baseState === 'absent')
      && [...node.children.values()].every(onlyAbsentChanges)
  )
  async function observeAddedSubtree(head, node, prefix) {
    invariant(onlyAbsentChanges(node), `External ledger added subtree has a non-absent reviewed path: ${prefix.join('/')}`)
    const response = await requestJson(repositoryPath(repository, `git/trees/${head}`))
    const entries = treeEntries(response, head, `External ledger added subtree ${prefix.join('/')}`)
    invariant(entries.size === node.children.size
      && [...entries.keys()].every(name => node.children.has(name)),
    `External ledger added subtree contains an unauthorized sibling: ${prefix.join('/')}`)
    for (const [name, child] of node.children) {
      const target = entries.get(name)
      const path = prefix.concat(name).join('/')
      invariant(target, `External ledger added subtree is missing ${path}`)
      if (child.change !== null) {
        invariant(child.children.size === 0
          && child.change.baseState === 'absent'
          && target.mode === child.change.mode
          && target.type === child.change.type
          && target.sha === child.change.gitBlobSha,
        `External ledger added subtree blob differs from the reviewed evidence: ${path}`)
      } else {
        invariant(target.mode === '040000' && target.type === 'tree',
          `External ledger added subtree ancestor is invalid: ${path}`)
        await observeAddedSubtree(target.sha, child, prefix.concat(name))
      }
    }
  }
  async function compareLevel(base, head, node, prefix) {
    const [baseResponse, headResponse] = await Promise.all([
      requestJson(repositoryPath(repository, `git/trees/${base}`)),
      requestJson(repositoryPath(repository, `git/trees/${head}`)),
    ])
    const label = prefix.length ? prefix.join('/') : '<root>'
    const baseEntries = treeEntries(baseResponse, base, `External ledger base tree ${label}`)
    const headEntries = treeEntries(headResponse, head, `External ledger head tree ${label}`)
    const names = [...new Set([...baseEntries.keys(), ...headEntries.keys()])]
    for (const name of names) {
      if (node.children.has(name)) continue
      invariant(stableStringify(baseEntries.get(name), 0) === stableStringify(headEntries.get(name), 0),
        `External ledger head changes an unauthorized tree entry: ${prefix.concat(name).join('/')}`)
    }
    for (const [name, child] of node.children) {
      const baseTarget = baseEntries.get(name)
      const headTarget = headEntries.get(name)
      const path = prefix.concat(name).join('/')
      invariant(headTarget, `External ledger exact tree closure is missing head path ${path}`)
      if (child.change !== null) {
        const change = child.change
        invariant(child.children.size === 0
          && headTarget.mode === change.mode
          && headTarget.type === change.type
          && headTarget.sha === change.gitBlobSha,
        `External ledger head blob identity/mode differs from the reviewed change: ${path}`)
        if (change.baseState === 'absent') invariant(baseTarget === undefined,
          `External ledger content-addressed evidence path already exists at the reviewed base: ${path}`)
        else invariant(change.baseState === 'existing-different'
          && baseTarget?.mode === change.mode
          && baseTarget?.type === change.type
          && baseTarget.sha !== headTarget.sha,
        `External ledger reviewed existing path base state is invalid: ${path}`)
      } else {
        invariant(headTarget.mode === '040000' && headTarget.type === 'tree',
          `External ledger head ancestor tree identity is invalid at ${path}`)
        if (baseTarget === undefined) {
          await observeAddedSubtree(headTarget.sha, child, prefix.concat(name))
        } else {
          invariant(baseTarget.mode === '040000'
            && baseTarget.type === 'tree'
            && baseTarget.sha !== headTarget.sha,
          `External ledger ancestor tree identity is invalid at ${path}`)
          await compareLevel(baseTarget.sha, headTarget.sha, child, prefix.concat(name))
        }
      }
    }
  }
  await compareLevel(baseTree, headTree, root, [])
  return {
    baseTree,
    headTree,
    changes: changes.map(change => ({
      path: change.path,
      baseState: change.baseState,
      mode: change.mode,
      type: change.type,
      blobSha: change.gitBlobSha,
    })),
    changedPathCount: changes.length,
  }
}

async function observeLedger({ requestJson, repository, path, ref, expectedSemanticSha256, expectedBytes = null }) {
  const response = await requestJson(contentsPath(repository, path, ref))
  const source = base64File(response, path, `External ledger ${ref} readback`)
  let value
  try {
    value = JSON.parse(UTF8.decode(source.bytes))
  } catch (error) {
    throw new Error(`External ledger ${ref} readback is not UTF-8 JSON: ${error.message}`, { cause: error })
  }
  invariant(digestValue(value) === expectedSemanticSha256, `External ledger ${ref} semantic digest changed`)
  if (expectedBytes !== null) invariant(source.bytes.equals(expectedBytes), `External ledger ${ref} bytes differ from the reviewed after-image`)
  return {
    blobSha: source.blobSha,
    bytesSha256: sha256(source.bytes),
    semanticSha256: expectedSemanticSha256,
  }
}

async function observeChangedFiles({ requestJson, repository, ref, plan }) {
  const files = []
  const ledgers = plan.plan.ledgers ?? [plan.plan.ledger]
  const ledgerByPath = new Map(ledgers.map(ledger => [ledger.path, ledger]))
  for (const change of plan.plan.changes) {
    const expectedBytes = plan.changeBytes.get(change.path)
    invariant(Buffer.isBuffer(expectedBytes), `External ledger expected changed bytes are missing: ${change.path}`)
    const plannedLedger = ledgerByPath.get(change.path)
    if (plannedLedger) {
      const ledger = await observeLedger({
        requestJson,
        repository,
        path: change.path,
        ref,
        expectedSemanticSha256: plannedLedger.afterSha256,
        expectedBytes,
      })
      files.push({
        path: change.path,
        mode: change.mode,
        blobSha: ledger.blobSha,
        bytesSha256: ledger.bytesSha256,
        semanticSha256: ledger.semanticSha256,
      })
    } else {
      const response = await requestJson(contentsPath(repository, change.path, ref))
      const source = base64File(response, change.path, `External certification evidence ${ref} readback`)
      invariant(source.bytes.equals(expectedBytes)
        && source.blobSha === change.gitBlobSha
        && sha256(source.bytes) === change.bytesSha256,
      `External certification evidence ${change.path} differs from the reviewed content-addressed bytes`)
      files.push({
        path: change.path,
        mode: change.mode,
        blobSha: source.blobSha,
        bytesSha256: change.bytesSha256,
        semanticSha256: null,
      })
    }
  }
  return files
}

async function observeBase({
  requestJson,
  repository,
  defaultBranch,
  expectedCommit,
  expectedTree,
  ledgerPath,
  expectedLedgerSha256,
}) {
  const commit = await observeRef({ requestJson, repository, branch: defaultBranch })
  invariant(commit === expectedCommit, 'External ledger writer live protected base differs from the reviewed expected-old commit')
  const commitReadback = await observeCommit({ requestJson, repository, commit, expectedTree })
  const ledger = await observeLedger({
    requestJson,
    repository,
    path: ledgerPath,
    ref: commit,
    expectedSemanticSha256: expectedLedgerSha256,
  })
  return { ref: `refs/heads/${defaultBranch}`, commit, tree: commitReadback.tree, ledger }
}

async function observeBaseLedgerSet({
  requestJson,
  repository,
  defaultBranch,
  expectedCommit,
  expectedTree,
  ledgers,
}) {
  invariant(Array.isArray(ledgers) && ledgers.length > 0,
    'External ledger writer protected-base ledger set is empty')
  const commit = await observeRef({ requestJson, repository, branch: defaultBranch })
  invariant(commit === expectedCommit,
    'External ledger writer live protected base differs from the reviewed expected-old commit')
  const commitReadback = await observeCommit({ requestJson, repository, commit, expectedTree })
  const readbacks = []
  for (const ledger of ledgers) {
    readbacks.push({
      path: ledger.path,
      ...(await observeLedger({
        requestJson,
        repository,
        path: ledger.path,
        ref: commit,
        expectedSemanticSha256: ledger.beforeSha256,
      })),
    })
  }
  return {
    ref: `refs/heads/${defaultBranch}`,
    commit,
    tree: commitReadback.tree,
    ledgers: readbacks,
  }
}

function mutationBodyPlan(plan, tree) {
  const body = deterministicPullRequestBody(plan.handoffValue, plan.plan)
  const treeEntries = plan.plan.changes.map(change => {
    const bytes = plan.changeBytes.get(change.path)
    invariant(Buffer.isBuffer(bytes) && sha256(bytes) === change.bytesSha256,
      `External ledger materialized bytes changed for ${change.path}`)
    return {
      path: change.path,
      mode: change.mode,
      type: change.type,
      content: bytes.toString('utf8'),
    }
  })
  return {
    branch: plan.plan.gitTransaction.branch,
    treeRequest: {
      base_tree: plan.plan.gitTransaction.expectedBaseTree,
      tree: treeEntries,
    },
    commitRequest: {
      message: plan.commitMessage,
      tree,
      parents: [plan.plan.gitTransaction.expectedBaseCommit],
      author: clone(plan.plan.commit.author),
      committer: clone(plan.plan.commit.committer),
    },
    pullRequestBody: body,
  }
}

function validateMutationTransport(requestMutation, method, path) {
  invariant(typeof requestMutation === 'function', 'External ledger Writer App mutation transport is required')
  const allowed = [
    ['POST', /\/git\/trees$/],
    ['POST', /\/git\/commits$/],
    ['POST', /\/git\/refs$/],
    ['POST', /\/pulls$/],
  ]
  invariant(allowed.some(([allowedMethod, pattern]) => method === allowedMethod && pattern.test(path)),
    `External ledger writer mutation endpoint is forbidden: ${method} ${path}`)
}

async function createOrReuseHead({
  requestJson,
  requestMutation,
  repository,
  plan,
  liveNow,
}) {
  const branch = plan.plan.gitTransaction.branch
  const existing = await observeRef({ requestJson, repository, branch, allow404: true })
  if (existing !== null) {
    const existingCommit = await observeCommit({
      requestJson,
      repository,
      commit: existing,
      expectedParent: plan.plan.gitTransaction.expectedBaseCommit,
      expectedMetadata: {
        ...plan.plan.commit,
        message: plan.commitMessage,
        handoff: plan.handoffValue,
      },
    })
    const files = await observeChangedFiles({ requestJson, repository, ref: existing, plan })
    invariant(existingCommit.tree !== plan.plan.gitTransaction.expectedBaseTree,
      'External ledger deterministic branch does not change the reviewed ledger')
    const treeClosure = await observeExactChangedTreeClosure({
      requestJson,
      repository,
      baseTree: plan.plan.gitTransaction.expectedBaseTree,
      headTree: existingCommit.tree,
      changes: plan.plan.changes,
    })
    return {
      branchCreated: false,
      head: {
        ref: `refs/heads/${branch}`,
        commit: existingCommit.commit,
        tree: existingCommit.tree,
        parent: existingCommit.parents[0],
        commitMessageSha256: existingCommit.messageSha256,
        author: existingCommit.author,
        committer: existingCommit.committer,
        treeClosure,
        files,
      },
    }
  }

  let path = repositoryPath(repository, 'git/trees')
  validateMutationTransport(requestMutation, 'POST', path)
  liveNow('tree-object')
  const createdTree = await requestMutation('POST', path, {
    base_tree: plan.plan.gitTransaction.expectedBaseTree,
    tree: mutationBodyPlan(plan, null).treeRequest.tree,
  })
  invariant(GIT_OID.test(createdTree?.sha ?? '') && createdTree.sha !== plan.plan.gitTransaction.expectedBaseTree,
    'External ledger Writer App tree creation failed or produced the unchanged base tree')
  const createdTreeClosure = await observeExactChangedTreeClosure({
    requestJson,
    repository,
    baseTree: plan.plan.gitTransaction.expectedBaseTree,
    headTree: createdTree.sha,
    changes: plan.plan.changes,
  })

  path = repositoryPath(repository, 'git/commits')
  validateMutationTransport(requestMutation, 'POST', path)
  liveNow('commit-object')
  const commitRequest = mutationBodyPlan(plan, createdTree.sha).commitRequest
  const createdCommit = await requestMutation('POST', path, commitRequest)
  invariant(GIT_OID.test(createdCommit?.sha ?? ''), 'External ledger Writer App commit creation returned an invalid object id')

  const baseBeforeCas = await observeRef({
    requestJson,
    repository,
    branch: plan.plan.repository.defaultBranch,
  })
  invariant(baseBeforeCas === plan.plan.gitTransaction.expectedBaseCommit,
    'External ledger protected base advanced before the branch expected-old CAS')

  path = repositoryPath(repository, 'git/refs')
  validateMutationTransport(requestMutation, 'POST', path)
  liveNow('branch-ref')
  const createdRef = await requestMutation('POST', path, {
    ref: `refs/heads/${branch}`,
    sha: createdCommit.sha,
  })
  invariant(createdRef?.ref === `refs/heads/${branch}`
    && createdRef?.object?.type === 'commit'
    && createdRef.object.sha === createdCommit.sha,
  'External ledger Writer App branch CAS readback is invalid')

  const headCommit = await observeCommit({
    requestJson,
    repository,
    commit: createdCommit.sha,
    expectedTree: createdTree.sha,
    expectedParent: plan.plan.gitTransaction.expectedBaseCommit,
    expectedMetadata: {
      ...plan.plan.commit,
      message: plan.commitMessage,
      handoff: plan.handoffValue,
    },
  })
  const files = await observeChangedFiles({ requestJson, repository, ref: createdCommit.sha, plan })
  return {
    branchCreated: true,
    head: {
      ref: `refs/heads/${branch}`,
      commit: headCommit.commit,
      tree: headCommit.tree,
      parent: headCommit.parents[0],
      commitMessageSha256: headCommit.messageSha256,
      author: headCommit.author,
      committer: headCommit.committer,
      treeClosure: createdTreeClosure,
      files,
    },
  }
}

function pullListPath(repository) {
  const query = new URLSearchParams({
    state: 'open',
    per_page: '100',
  })
  return repositoryPath(repository, `pulls?${query}`)
}

async function observeOpenExternalLedgerPullRequests({
  requestJson,
  repository,
  plan,
}) {
  const base = plan.plan.repository.defaultBranch
  const branch = plan.plan.gitTransaction.branch
  const list = await requestJson(pullListPath(repository))
  invariant(Array.isArray(list) && list.length < 100,
    'External ledger open pull-request list is invalid or may be paginated')
  const externalLedgerPullRequests = list.filter(item => (
    item?.head?.repo?.full_name === repository
      && typeof item?.head?.ref === 'string'
      && item.head.ref.startsWith('governance/external-ledger/')
  ))
  invariant(
    externalLedgerPullRequests.length <= 1
      && externalLedgerPullRequests.every(item => item.head.ref === branch && item.base?.ref === base),
    'A different external-ledger pull request is still open; merge and independently read back each handoff before preparing the next one',
  )
  const matches = list.filter(item => item?.head?.ref === branch
    && item?.base?.ref === base
    && item?.head?.repo?.full_name === repository)
  invariant(matches.length <= 1,
    'External ledger deterministic branch has multiple open pull requests')
  return { list, matches }
}

function validatePullRequestReadback(response, {
  repository,
  owner,
  base,
  baseCommit,
  branch,
  headCommit,
  title,
  body,
}) {
  invariant(response && typeof response === 'object' && !Array.isArray(response), 'External ledger pull request readback is invalid')
  invariant(Number.isSafeInteger(response.number) && response.number > 0
    && response.state === 'open'
    && response.draft === false
    && response.title === title
    && response.body === body
    && response.maintainer_can_modify === false,
  'External ledger pull request state/title/body boundary is invalid')
  invariant(response.base?.ref === base
    && response.base?.sha === baseCommit
    && response.base?.repo?.full_name === repository
    && response.head?.ref === branch
    && response.head?.sha === headCommit
    && response.head?.repo?.full_name === repository
    && response.head?.user?.login === owner,
  'External ledger pull request base/head/repository identity is invalid')
  invariant(response.user?.login === WRITER_LOGIN && response.user?.type === 'Bot',
    'External ledger pull request was not authored by the dedicated Governance Writer App')
  invariant(typeof response.html_url === 'string'
    && response.html_url === `https://github.com/${repository}/pull/${response.number}`,
  'External ledger pull request URL is non-canonical')
  return {
    number: response.number,
    url: response.html_url,
    state: response.state,
    draft: response.draft,
    author: response.user.login,
    baseRef: `refs/heads/${response.base.ref}`,
    baseCommit: response.base.sha,
    headRef: `refs/heads/${response.head.ref}`,
    headCommit: response.head.sha,
    repository: response.head.repo.full_name,
    owner: response.head.user.login,
    crossRepository: false,
    maintainerCanModify: response.maintainer_can_modify,
    titleSha256: sha256(response.title),
    bodySha256: sha256(response.body),
  }
}

async function createOrReusePullRequest({
  requestJson,
  requestMutation,
  repository,
  owner,
  plan,
  liveNow,
  headCommit,
  observedPullRequests,
}) {
  const base = plan.plan.repository.defaultBranch
  const branch = plan.plan.gitTransaction.branch
  const title = plan.plan.pullRequest.title
  const body = deterministicPullRequestBody(plan.handoffValue, plan.plan)
  invariant(observedPullRequests && Array.isArray(observedPullRequests.matches),
    'External ledger pull-request preflight readback is missing')
  const { matches } = observedPullRequests
  let response
  let pullRequestCreated = false
  if (matches.length === 1) response = await requestJson(repositoryPath(repository, `pulls/${matches[0].number}`))
  else {
    liveNow('pull-request')
    const path = repositoryPath(repository, 'pulls')
    validateMutationTransport(requestMutation, 'POST', path)
    response = await requestMutation('POST', path, {
      title,
      head: branch,
      base,
      body,
      draft: false,
      maintainer_can_modify: false,
    })
    pullRequestCreated = true
  }
  return {
    pullRequestCreated,
    pullRequest: validatePullRequestReadback(response, {
      repository,
      owner,
      base,
      baseCommit: plan.plan.gitTransaction.expectedBaseCommit,
      branch,
      headCommit,
      title,
      body,
    }),
  }
}

function assertWriterAppAuthorityCurrent(identity, now, label) {
  invariant(now instanceof Date && Number.isFinite(now.getTime()),
    `External ledger Writer App ${label} authority clock is invalid`)
  const observedAt = canonicalUtc(
    identity.signedActivationObservedAt,
    'External ledger Writer App signed activation observedAt',
  )
  const expiresAt = canonicalUtc(
    identity.signedActivationExpiresAt,
    'External ledger Writer App signed activation expiresAt',
  )
  invariant(observedAt <= now && now < expiresAt,
    `External ledger Writer App signed activation authority is future-dated or expired at ${label}`)
}

async function observeWriterAppIdentity({ requestJson, repository, identity, now }) {
  exactKeys(identity, [
    'appId', 'appSlug', 'installationId', 'actionSha', 'desiredAppId',
    'signedProbeAppId', 'signedProbeInstallationId',
    'signedActivationEvidenceSha256', 'signedActivationObservedAt',
    'signedActivationExpiresAt',
  ], 'External ledger Writer App identity')
  const appId = positiveIntegerString(identity.appId, 'External ledger Writer App id')
  const installationId = positiveIntegerString(identity.installationId, 'External ledger Writer App installation id')
  invariant(appId === positiveIntegerString(identity.desiredAppId, 'Protected desired Governance Writer App id')
    && appId === positiveIntegerString(identity.signedProbeAppId, 'Signed Governance Writer App probe id')
    && installationId === positiveIntegerString(
      identity.signedProbeInstallationId,
      'Signed Governance Writer App installation probe id',
    )
    && SHA256.test(identity.signedActivationEvidenceSha256 ?? ''),
  'External ledger Writer App runtime identity differs from protected desired/signed activation authority')
  invariant(identity.appSlug === WRITER_APP_SLUG,
    'External ledger writer token was not minted for the canonical Governance Writer App slug')
  invariant(identity.actionSha === CREATE_APP_TOKEN_ACTION_SHA,
    'External ledger writer token was not minted by the reviewed create-github-app-token action')
  assertWriterAppAuthorityCurrent(identity, now, 'identity-readback')
  const installation = await requestJson('/installation/repositories?per_page=100')
  invariant(installation
    && Number.isSafeInteger(installation.total_count)
    && installation.total_count === 1
    && Array.isArray(installation.repositories)
    && installation.repositories.length === 1
    && installation.repositories[0]?.full_name === repository
    && installation.repositories[0]?.owner?.login === repository.split('/')[0],
  'External ledger Writer App installation token is not restricted to the exact authority repository')
  return {
    appId,
    appSlug: identity.appSlug,
    installationId,
    desiredAppId: identity.desiredAppId,
    signedProbeAppId: identity.signedProbeAppId,
    signedProbeInstallationId: identity.signedProbeInstallationId,
    signedActivationEvidenceSha256: identity.signedActivationEvidenceSha256,
    signedActivationObservedAt: identity.signedActivationObservedAt,
    signedActivationExpiresAt: identity.signedActivationExpiresAt,
    actionSha: identity.actionSha,
    tokenRepositorySelection: [repository],
    requestedPermissions: {
      contents: 'write',
      pullRequests: 'write',
    },
  }
}

export async function executeExternalLedgerWriterTransaction({
  plan,
  handoff,
  dispatch,
  artifactIdentity,
  expectedArtifact,
  writerIdentity,
  requestJson,
  requestMutation,
  clock = () => new Date(),
  validationOptions = {},
} = {}) {
  invariant(typeof requestJson === 'function', 'External ledger readback transport is required')
  invariant(typeof clock === 'function', 'External ledger Writer App live clock is required')
  let previousTime = null
  const readClock = label => {
    const current = clock()
    invariant(current instanceof Date && Number.isFinite(current.getTime()), `External ledger Writer App ${label} time is invalid`)
    invariant(previousTime === null || current >= previousTime, 'External ledger Writer App clock moved backwards')
    previousTime = current
    return current
  }
  const initialNow = readClock('initial')
  const identity = validateExternalLedgerRunArtifactIdentityReceipt(artifactIdentity, {
    repository: handoff?.repository?.github,
    headSha: handoff?.gitTransaction?.expectedBaseCommit,
    runId: expectedArtifact?.runId,
    runAttempt: expectedArtifact?.runAttempt,
    artifactId: expectedArtifact?.id,
    artifactDigest: expectedArtifact?.digest,
    now: initialNow,
  })
  const artifactBinding = validateArtifactBinding(identity.artifact)
  const repository = plan?.repository?.github
  invariant(REPOSITORY.test(repository ?? '') && repository === handoff?.repository?.github,
    'External ledger Writer App repository is invalid or detached')
  const multiLedger = handoff.operation === 'provider-review-capability-certification'
  const baseLedgerSha256 = multiLedger ? null : handoff.ledger.beforeSha256
  const baseLedgerSha256s = multiLedger
    ? Object.fromEntries(handoff.ledgers.map(ledger => [ledger.path, ledger.beforeSha256]))
    : null
  const validatedPlan = validateExternalLedgerWriterPlan(plan, {
    request: dispatch,
    repository,
    currentBaseCommit: handoff.gitTransaction.expectedBaseCommit,
    currentBaseTree: handoff.gitTransaction.expectedBaseTree,
    baseLedgerSha256,
    baseLedgerSha256s,
    now: initialNow,
    validationOptions,
  })
  validatedPlan.handoffValue = handoff
  invariant(stableStringify(plan, 0) === stableStringify(validatedPlan.plan, 0),
    'External ledger Writer App plan differs from the reviewed artifact plan')

  const repositoryReadback = await observeRepository({
    requestJson,
    repository,
    defaultBranch: handoff.repository.defaultBranch,
  })
  const writerApp = await observeWriterAppIdentity({
    requestJson,
    repository,
    identity: writerIdentity,
    now: initialNow,
  })
  const observeProtectedBase = () => multiLedger
    ? observeBaseLedgerSet({
        requestJson,
        repository,
        defaultBranch: handoff.repository.defaultBranch,
        expectedCommit: handoff.gitTransaction.expectedBaseCommit,
        expectedTree: handoff.gitTransaction.expectedBaseTree,
        ledgers: handoff.ledgers,
      })
    : observeBase({
        requestJson,
        repository,
        defaultBranch: handoff.repository.defaultBranch,
        expectedCommit: handoff.gitTransaction.expectedBaseCommit,
        expectedTree: handoff.gitTransaction.expectedBaseTree,
        ledgerPath: handoff.ledger.path,
        expectedLedgerSha256: handoff.ledger.beforeSha256,
      })
  const baseBefore = await observeProtectedBase()
  validateHandoffAtBase(handoff, {
    currentBaseCommit: baseBefore.commit,
    currentBaseTree: baseBefore.tree,
    baseLedgerSha256: multiLedger ? null : baseBefore.ledger.semanticSha256,
    baseLedgerSha256s: multiLedger
      ? Object.fromEntries(baseBefore.ledgers.map(ledger => [
          ledger.path,
          ledger.semanticSha256,
        ]))
      : null,
    now: initialNow,
    validationOptions,
  })
  const liveNow = label => {
    const current = readClock(label)
    assertWriterAppAuthorityCurrent(writerApp, current, label)
    validateHandoffAtBase(handoff, {
      currentBaseCommit: handoff.gitTransaction.expectedBaseCommit,
      currentBaseTree: handoff.gitTransaction.expectedBaseTree,
      baseLedgerSha256,
      baseLedgerSha256s,
      now: current,
      validationOptions,
    })
    return current
  }

  const observedPullRequests = await observeOpenExternalLedgerPullRequests({
    requestJson,
    repository,
    plan: validatedPlan,
  })
  const headResult = await createOrReuseHead({
    requestJson,
    requestMutation,
    repository,
    plan: validatedPlan,
    liveNow,
  })
  const branchReadback = await observeRef({
    requestJson,
    repository,
    branch: plan.gitTransaction.branch,
  })
  invariant(branchReadback === headResult.head.commit, 'External ledger deterministic branch changed after expected-old CAS')
  const baseBeforePullRequest = await observeProtectedBase()
  const pullResult = await createOrReusePullRequest({
    requestJson,
    requestMutation,
    repository,
    owner: repositoryReadback.owner,
    plan: validatedPlan,
    liveNow,
    headCommit: headResult.head.commit,
    observedPullRequests,
  })
  const baseAfter = await observeProtectedBase()
  const headAfter = await observeRef({
    requestJson,
    repository,
    branch: plan.gitTransaction.branch,
  })
  invariant(headAfter === headResult.head.commit, 'External ledger deterministic branch changed after pull-request creation')
  const prAfter = await requestJson(repositoryPath(repository, `pulls/${pullResult.pullRequest.number}`))
  const prReadback = validatePullRequestReadback(prAfter, {
    repository,
    owner: repositoryReadback.owner,
    base: handoff.repository.defaultBranch,
    baseCommit: baseAfter.commit,
    branch: plan.gitTransaction.branch,
    headCommit: headAfter,
    title: plan.pullRequest.title,
    body: deterministicPullRequestBody(handoff, plan),
  })
  const completedAt = liveNow('final-readback')

  const core = {
    $schema: RECEIPT_SCHEMA,
    schemaVersion: multiLedger ? 2 : 1,
    kind: 'external-ledger-writer-pr-readback',
    completedAt: completedAt.toISOString(),
    mutationBoundary: {
      credential: 'dedicated-governance-writer-app',
      environment: EXTERNAL_LEDGER_WRITER_ENVIRONMENT,
      directDefaultBranchWritePerformed: false,
      mergePerformed: false,
      reviewPerformed: false,
      candidateCodeExecuted: false,
      branchCreated: headResult.branchCreated,
      pullRequestCreated: pullResult.pullRequestCreated,
    },
    evidenceRole: {
      transientRunArtifact: true,
      retentionDays: 30,
      canonicalAuthority: false,
      mutationAuthority: false,
      mergeAuthority: false,
      reconstructableFromProtectedGit: true,
      durableTruth: 'protected-git-commit-pr-and-merged-ledger',
    },
    artifact: artifactBinding,
    artifactIdentityDigest: artifactIdentity.identityDigest,
    writerApp,
    handoff: {
      digest: handoff.handoffDigest,
      bytesSha256: sha256(canonicalHandoffBytes(handoff)),
      operation: handoff.operation,
      validUntil: handoff.validUntil,
      validitySemantics: 'writer-materialization-envelope-only-not-merge-authorization',
    },
    planDigest: plan.planDigest,
    repository: repositoryReadback,
    base: baseAfter,
    head: headResult.head,
    pullRequest: prReadback,
  }
  invariant(stableStringify(baseBefore, 0) === stableStringify(baseBeforePullRequest, 0)
    && stableStringify(baseBefore, 0) === stableStringify(baseAfter, 0),
  'External ledger protected base changed during the Writer App transaction')
  return { ...core, receiptDigest: digestValue(core) }
}

export const externalLedgerWriterTestHarness = Object.freeze({
  canonicalHandoffBytes,
  canonicalLedgerAfterBytes,
  canonicalLedgerAfterByteEntries,
  deterministicBranch,
  deterministicCommitMessage,
  deterministicPullRequestBody,
  digestValue,
  gitBlobSha,
  plannedChanges,
})
