#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import {
  sha256,
  validateDeepAuditEvidenceContractSchema,
} from './lib/deep-audit-evidence-contract.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PATHS = {
  deep: 'scripts/schemas/deep-audit-evidence-contract.schema.json',
  managed: 'scripts/schemas/managed-ci-sandbox-receipt.schema.json',
  observation: 'scripts/schemas/ci-evidence-observation.schema.json',
  standardObservation: 'scripts/schemas/standard-ci-evidence-observation.schema.json',
  transcript: 'infra/governance/schemas/model-broker-transcript.schema.json',
  shardResult: 'infra/governance/schemas/model-broker-shard-result.schema.json',
  modelReleaseAuthority: 'infra/governance/schemas/managed-ci-model-release-authority-binding.schema.json',
}
const readSchema = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'))
const schemas = Object.fromEntries(Object.entries(PATHS).map(([name, path]) => [name, readSchema(path)]))
const schemasById = new Map(Object.values(schemas).map(schema => [schema.$id, schema]))

function jsonPointer(document, fragment) {
  return fragment.split('/').slice(1).reduce((value, token) => (
    value[token.replaceAll('~1', '/').replaceAll('~0', '~')]
  ), document)
}

function resolveReference(reference, currentDocument) {
  const [id = '', fragment = ''] = reference.split('#')
  const document = id ? schemasById.get(id) : currentDocument
  assert(document, `missing schema dependency:${id}`)
  return { document, schema: fragment ? jsonPointer(document, fragment) : document }
}

function patternSample(pattern = '') {
  if (pattern.includes('sha256:')) return `sha256:${'a'.repeat(64)}`
  if (pattern.includes('_transcripts')) return `judgment/claude/_transcripts/${'a'.repeat(64)}.json`
  if (pattern.includes('infra/governance/evidence/') && pattern.includes('provider-runtime')) {
    return `infra/governance/evidence/provider-runtime/${'a'.repeat(64)}.json`
  }
  if (pattern.includes('{80,120}')) return 'A'.repeat(86)
  if (pattern.includes('{8,256}')) return 'fixture-id'
  if (pattern.includes('{86}')) return 'A'.repeat(86)
  if (pattern.includes('[0-9a-f]{8}-')) return '11111111-1111-4111-8111-111111111111'
  if (pattern.includes('{40,64}') || pattern.includes('{40}')) return 'a'.repeat(40)
  if (pattern.includes('{64}')) return 'a'.repeat(64)
  if (pattern.includes('github')) return 'https://github.com/fixture/repository'
  if (pattern.includes('[a-z][a-z0-9-]*/')) return 'fixture/model-release'
  if (pattern.includes('A-Za-z0-9_.-]+/')) return 'fixture/repository'
  if (pattern.startsWith('^/')) return '/fixture'
  if (pattern.includes('(?:^|/)')) return 'fixture/file.txt'
  if (pattern.includes('[A-Za-z][A-Za-z0-9]*')) return 'Fixture'
  if (pattern.startsWith('^v[0-9]')) return 'v1.0.0'
  if (pattern.includes('[0-9]+\\.[0-9]+') || pattern.includes('\\d+\\.\\d+')) return '1.0.0'
  if (pattern.includes('-v[1-9]')) return 'fixture-v1'
  if (pattern.includes('[1-9][0-9]')) return '1'
  return 'fixture'
}

function schemaSample(schema, document, depth = 0) {
  assert(depth < 100, 'schema sample recursion is unexpectedly deep')
  if (schema === true) return {}
  assert.notEqual(schema, false, 'cannot synthesize a false schema')
  if (schema.$ref) {
    const resolved = resolveReference(schema.$ref, document)
    return schemaSample(resolved.schema, resolved.document, depth + 1)
  }
  if (Object.hasOwn(schema, 'const')) return structuredClone(schema.const)
  if (schema.enum) return structuredClone(schema.enum[0])
  if (schema.oneOf) return schemaSample(schema.oneOf[0], document, depth + 1)
  if (schema.anyOf) return schemaSample(schema.anyOf[0], document, depth + 1)
  let type = schema.type
  if (Array.isArray(type)) type = type.find(value => value !== 'null') ?? 'null'
  if (type === 'object' || schema.properties || schema.required) {
    return Object.fromEntries((schema.required ?? []).map(key => [
      key,
      schemaSample(schema.properties?.[key] ?? {}, document, depth + 1),
    ]))
  }
  if (schema.allOf) return schemaSample(schema.allOf[0], document, depth + 1)
  if (type === 'array') {
    return Array.from({ length: schema.minItems ?? 0 }, () => schemaSample(schema.items ?? {}, document, depth + 1))
  }
  if (type === 'integer' || type === 'number') return schema.minimum ?? 1
  if (type === 'boolean') return true
  if (type === 'null') return null
  if (type === 'string' || schema.pattern || schema.format) {
    if (schema.format === 'date-time') return '2026-07-21T00:00:00.000Z'
    if (schema.format === 'uri') return 'https://github.com/fixture/repository'
    return patternSample(schema.pattern)
  }
  return {}
}

function compile(schema, dependencies) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: false })
  addFormats(ajv)
  for (const dependency of dependencies) ajv.addSchema(dependency)
  return { ajv, validate: ajv.compile(schema) }
}

const deepValidator = compile(schemas.deep, [schemas.managed, schemas.observation, schemas.standardObservation])
const runManifestGolden = schemaSample(schemas.deep.$defs.runManifest, schemas.deep)
runManifestGolden.authorProvider = 'claude'
runManifestGolden.providers.self.id = 'claude'
runManifestGolden.providers.peer.id = 'codex'
runManifestGolden.providers.self.reviewPeerId = 'codex'
runManifestGolden.providers.peer.reviewPeerId = 'claude'
runManifestGolden.reviewSelection.authorProviderId = 'claude'
runManifestGolden.reviewSelection.selfProviderId = 'claude'
runManifestGolden.reviewSelection.selected.providerId = 'codex'
runManifestGolden.reviewSelection.requiredEntitlementId = null
runManifestGolden.reviewSelection.entitlementAvailability = []
runManifestGolden.reviewSelection.selected.entitlementId = null
assert.equal(
  directDeepAccepts(runManifestGolden),
  true,
  `run-manifest v4 selected golden failed direct Ajv:${deepValidator.ajv.errorsText(deepValidator.validate.errors)}`,
)
const blockedRunManifestGolden = structuredClone(runManifestGolden)
blockedRunManifestGolden.reviewSelection = schemaSample(schemas.deep.$defs.blockedReviewSelection, schemas.deep)
blockedRunManifestGolden.reviewSelection.authorProviderId = 'claude'
blockedRunManifestGolden.reviewSelection.selfProviderId = 'claude'
blockedRunManifestGolden.reviewSelection.requiredEntitlementId = null
blockedRunManifestGolden.reviewSelection.entitlementAvailability = []
blockedRunManifestGolden.providers.self.reviewPeerId = null
blockedRunManifestGolden.providers.peer = null
assert.equal(
  directDeepAccepts(blockedRunManifestGolden),
  true,
  `run-manifest v4 blocked golden failed direct Ajv:${deepValidator.ajv.errorsText(deepValidator.validate.errors)}`,
)
const blockedWithInventedPeer = structuredClone(blockedRunManifestGolden)
blockedWithInventedPeer.providers.peer = structuredClone(runManifestGolden.providers.peer)
assert.equal(directDeepAccepts(blockedWithInventedPeer), false, 'Ajv accepted a blocked manifest with an invented peer')
const historicalRunManifestGolden = schemaSample(schemas.deep.$defs.historicalRunManifest, schemas.deep)
historicalRunManifestGolden.authorProvider = 'claude'
historicalRunManifestGolden.providers.self.id = 'claude'
historicalRunManifestGolden.providers.self.reviewPeerId = 'codex'
historicalRunManifestGolden.providers.peer.id = 'codex'
historicalRunManifestGolden.providers.peer.reviewPeerId = 'claude'
assert.equal(
  directDeepAccepts(historicalRunManifestGolden),
  true,
  `run-manifest v3 historical golden failed direct Ajv:${deepValidator.ajv.errorsText(deepValidator.validate.errors)}`,
)
const waivedSelfReviewGolden = schemaSample(schemas.deep.$defs.waivedSelfReview, schemas.deep)
waivedSelfReviewGolden.authorProvider = 'claude'
waivedSelfReviewGolden.provider.id = 'claude'
waivedSelfReviewGolden.provider.reviewPeerId = null
waivedSelfReviewGolden.componentA1bReviews[0].claimsReviewed = 1
assert.equal(
  directDeepAccepts(waivedSelfReviewGolden),
  true,
  `waived self-review golden failed direct Ajv:${deepValidator.ajv.errorsText(deepValidator.validate.errors)}`,
)
assert.equal(validateDeepAuditEvidenceContractSchema(waivedSelfReviewGolden, { repoRoot: ROOT }), true)
for (const [label, mutate] of [
  ['independence-forgery', value => { value.independent = true }],
  ['second-opinion-forgery', value => { value.secondOpinionPerformed = true }],
  ['assurance-upgrade', value => { value.assurance = 'independent' }],
  ['open-model-identity', value => { value.model = 'forbidden' }],
  ['missing-judgment-list', value => { delete value.judgmentReviews }],
  ['unsafe-finding-path', value => {
    value.judgmentReviews[0].status = 'FINDINGS'
    value.judgmentReviews[0].findings = [{
      severity: 'material', path: '../escape', line: 1,
      claim: 'claim', actual: 'actual', recommendation: 'recommendation',
    }]
  }],
]) {
  const poison = structuredClone(waivedSelfReviewGolden)
  mutate(poison)
  assert.equal(directDeepAccepts(poison), false, `Ajv accepted waived self-review poison:${label}`)
}
for (const [label, mutate] of [
  ['author-missing', value => { delete value.authorProvider }],
  ['identity-digest-missing', value => { delete value.providerIdentityDigest }],
  ['legacy-v2-shape', value => { value.schemaVersion = 2 }],
  ['runtime-surface-missing', value => { delete value.providers.self.runtimeSurface }],
  ['runtime-profile-missing', value => { delete value.providers.peer.runtimeProfileId }],
]) {
  const poison = structuredClone(runManifestGolden)
  mutate(poison)
  assert.equal(directDeepAccepts(poison), false, `Ajv accepted run-manifest poison:${label}`)
}
const baseEnvelope = schemaSample(schemas.deep.$defs.evidenceEnvelope, schemas.deep)
const cases = [
  ['deterministic/local', 'deep-audit-deterministic', 'genericProducer', 'deterministicPayload'],
  ['deterministic/unobserved', 'deep-audit-deterministic', 'genericProducer', 'deterministicUnobservedPayload'],
  ['judgment/legacy', 'deep-audit-judgment', 'concreteProducer', 'legacyJudgmentPayload'],
  ['judgment/managed', 'deep-audit-judgment', 'concreteProducer', 'managedJudgmentPayload'],
  ['hook/local', 'deep-audit-hook-residue', 'genericProducer', 'hookPayload'],
  ['ci/signed', 'deep-audit-ci-enforced', 'genericProducer', 'ciPayload'],
  ['a1b/legacy', 'deep-audit-component-a1b', 'concreteProducer', 'legacyA1bPayload'],
  ['a1b/managed', 'deep-audit-component-a1b', 'concreteProducer', 'managedA1bPayload'],
]
const goldens = new Map(cases.map(([label, evidenceKind, producerDefinition, payloadDefinition]) => {
  const envelope = structuredClone(baseEnvelope)
  envelope.evidenceKind = evidenceKind
  envelope.producer = schemaSample(schemas.deep.$defs[producerDefinition], schemas.deep)
  envelope.payload = schemaSample(schemas.deep.$defs[payloadDefinition], schemas.deep)
  return [label, envelope]
}))

function directDeepAccepts(document) {
  return deepValidator.validate(document)
}

function assertPoisonRejected(label, golden, mutate) {
  const poison = structuredClone(golden)
  mutate(poison)
  assert.equal(directDeepAccepts(poison), false, `Ajv accepted poison:${label}`)
  assert.throws(
    () => validateDeepAuditEvidenceContractSchema(poison, { repoRoot: ROOT }),
    /deep-audit contract schema failed/,
    `runtime schema gate accepted poison:${label}`,
  )
}

for (const [label, golden] of goldens) {
  assert.equal(
    directDeepAccepts(golden),
    true,
    `${label} golden failed direct Ajv:${deepValidator.ajv.errorsText(deepValidator.validate.errors)}`,
  )
  assert.equal(validateDeepAuditEvidenceContractSchema(golden, { repoRoot: ROOT }), true)
  assertPoisonRejected(`${label}:producer-open`, golden, value => { value.producer.unexpected = true })
  assertPoisonRejected(`${label}:producer-surface-missing`, golden, value => { delete value.producer.runtimeSurface })
  assertPoisonRejected(`${label}:producer-profile-missing`, golden, value => { delete value.producer.runtimeProfileId })
  assertPoisonRejected(`${label}:command-open`, golden, value => { value.command.unexpected = true })
  assertPoisonRejected(`${label}:coverage-open`, golden, value => { value.coverage.unexpected = true })
  assertPoisonRejected(`${label}:payload-open`, golden, value => { value.payload.unexpected = true })
  assertPoisonRejected(`${label}:payload-missing`, golden, value => { value.payload = {} })
}

for (const [label, mutate] of [
  ['reason', value => { value.payload.reasonCode = 'CREDENTIAL_UNKNOWN' }],
  ['dimension', value => { value.payload.dim = 84 }],
  ['observed-reference', value => { value.payload.credentialReferences.observed = ['NETLIFY_PREVIEW_PASSWORD'] }],
  ['commands-forgery', value => { value.payload.commands = [] }],
  ['sandbox-forgery', value => { value.payload.sandboxReceipt = {} }],
]) {
  assertPoisonRejected(`deterministic/unobserved:${label}`, goldens.get('deterministic/unobserved'), mutate)
}

const frozenSchemaManifest = {
  inventory: ['deep', 'managed', 'observation', 'standardObservation'].map(name => ({
    path: PATHS[name],
    kind: 'file',
    sha256: sha256(readFileSync(resolve(ROOT, PATHS[name]))),
  })),
}
assert.equal(validateDeepAuditEvidenceContractSchema(goldens.get('deterministic/local'), {
  repoRoot: ROOT,
  manifest: frozenSchemaManifest,
}), true)
const substitutedManifest = structuredClone(frozenSchemaManifest)
substitutedManifest.inventory[0].sha256 = 'f'.repeat(64)
assert.throws(() => validateDeepAuditEvidenceContractSchema(goldens.get('deterministic/local'), {
  repoRoot: ROOT,
  manifest: substitutedManifest,
}), /schema dependency differs from frozen manifest/)

for (const label of ['judgment/legacy', 'judgment/managed', 'a1b/legacy', 'a1b/managed']) {
  assertPoisonRejected(`${label}:generic-producer`, goldens.get(label), value => {
    value.producer = schemaSample(schemas.deep.$defs.genericProducer, schemas.deep)
  })
}
for (const label of ['judgment/managed', 'a1b/managed']) {
  assertPoisonRejected(`${label}:sandbox-signature-open`, goldens.get(label), value => {
    value.payload.sandboxReceipt.attestation.signatures[0].unexpected = true
  })
  assertPoisonRejected(`${label}:sandbox-ref-open`, goldens.get(label), value => {
    value.payload.sandboxReceipt.unexpected = true
  })
}
assertPoisonRejected('ci/signed:receipt-signature-open', goldens.get('ci/signed'), value => {
  value.payload.receipt.attestation.signatures[0].unexpected = true
})

assert.equal(
  schemas.deep.$defs.managedSandbox.$ref,
  'https://qijenchen.dev/schemas/managed-ci-sandbox-receipt-v1.json',
)
const expectedPayloadRefs = {
  'deep-audit-deterministic': '#/$defs/deterministicPayload',
  'deep-audit-judgment': '#/$defs/judgmentPayload',
  'deep-audit-hook-residue': '#/$defs/hookPayload',
  'deep-audit-ci-enforced': '#/$defs/ciPayload',
  'deep-audit-component-a1b': '#/$defs/a1bPayload',
}
for (const branch of schemas.deep.$defs.evidenceEnvelope.allOf) {
  const kind = branch.if.properties.evidenceKind.const
  assert.equal(branch.then.properties.payload.$ref, expectedPayloadRefs[kind])
  if (['deep-audit-judgment', 'deep-audit-component-a1b'].includes(kind)) {
    assert.equal(branch.then.properties.producer.$ref, '#/$defs/concreteProducer')
  }
}

const transcriptValidator = compile(schemas.transcript, [schemas.shardResult, schemas.modelReleaseAuthority])
const transcriptGolden = schemaSample(schemas.transcript, schemas.transcript)
assert.equal(
  transcriptValidator.validate(transcriptGolden),
  true,
  `transcript golden failed strict Ajv:${transcriptValidator.ajv.errorsText(transcriptValidator.validate.errors)}`,
)
for (const [label, mutate] of [
  ['exchange-open', value => { value.exchanges[0].unexpected = true }],
  ['request-open', value => { value.exchanges[0].request.unexpected = true }],
  ['response-open', value => { value.exchanges[0].response.unexpected = true }],
  ['result-open', value => { value.exchanges[0].result.unexpected = true }],
  ['result-missing', value => { delete value.exchanges[0].result }],
]) {
  const poison = structuredClone(transcriptGolden)
  mutate(poison)
  assert.equal(transcriptValidator.validate(poison), false, `transcript schema accepted poison:${label}`)
}
assert.equal(schemas.transcript.$defs.exchange.properties.result.$ref, schemas.shardResult.$id)
for (const definition of ['exchange', 'request', 'response']) {
  assert.equal(schemas.transcript.$defs[definition].additionalProperties, false)
  assert.deepEqual(
    [...schemas.transcript.$defs[definition].required].sort(),
    Object.keys(schemas.transcript.$defs[definition].properties).sort(),
  )
}

console.log('✅ deep-audit evidence/transcript strict-schema golden + poison runtime parity PASS')
