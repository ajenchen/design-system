import { stableJson } from './common.mjs'

export const PROVIDER_CERTIFICATION_CARRIER_PATH = 'infra/governance/providers/certifications.json'
export const REVIEW_CAPABILITY_CERTIFICATION_CARRIER_PATH = 'infra/governance/providers/review-capability-certifications.json'

export const GOVERNANCE_CARRIER_PROJECTION_IDS = Object.freeze([
  'provider-certification-state-v1',
  'review-capability-certification-state-v1',
])

export const GOVERNANCE_CARRIER_MAX_BYTES = 8 * 1024 * 1024
const UTF8 = new TextDecoder('utf-8', { fatal: true })
const CERTIFICATION_RECORD_KEYS = new Set([
  'id',
  'provider',
  'runtimeKind',
  'providerVersion',
  'adapterVersion',
  'surface',
  'repositoryRole',
  'status',
  'platformMatrix',
  'certifiedAt',
  'expiresAt',
  'runtimeEvidence',
  'checks',
  'limitations',
])
const CERTIFICATION_TARGET_KEYS = new Set([
  'id',
  'operatingSystem',
  'platform',
  'arch',
  'executionEnvironment',
  'distributionVersion',
  'pathClass',
  'status',
  'limitations',
  'certifiedAt',
  'expiresAt',
  'runtimeEvidence',
])
const REVIEW_CAPABILITY_CERTIFICATION_KEYS = new Set([
  'id',
  'reviewProfileId',
  'reviewProfileDigest',
  'providerId',
  'modelReleaseId',
  'entitlementId',
  'status',
  'assuranceTier',
  'reasoningTier',
  'computeTier',
  'certifiedAt',
  'expiresAt',
  'evidence',
])
const TARGET_AXES = Object.freeze([
  'id',
  'operatingSystem',
  'platform',
  'arch',
  'executionEnvironment',
  'distributionVersion',
  'pathClass',
])

function invariant(condition, message) {
  if (!condition) throw new Error(`governance carrier projection blocked:${message}`)
}

function plainObject(value, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant([Object.prototype, null].includes(Object.getPrototypeOf(value)), `${label} must be a plain object`)
  return value
}

function exactKeys(value, expected, label) {
  plainObject(value, label)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  invariant(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has an invalid or open shape`)
}

function allowedKeys(value, allowed, required, label) {
  plainObject(value, label)
  const keys = Object.keys(value)
  invariant(required.every(key => keys.includes(key)) && keys.every(key => allowed.has(key)), `${label} has an invalid or open shape`)
}

function assertNoDuplicateJsonObjectKeys(text, label) {
  const stack = []
  let rootConsumed = false
  const expectsValue = () => {
    if (stack.length === 0) return !rootConsumed
    const frame = stack.at(-1)
    return frame.kind === 'array' ? frame.state === 'value-or-end' : frame.state === 'value'
  }
  const consumeValue = () => {
    invariant(expectsValue(), `${label} has an invalid JSON token position`)
    if (stack.length === 0) rootConsumed = true
    else stack.at(-1).state = 'comma-or-end'
  }
  const stringEnd = start => {
    let escaped = false
    for (let index = start + 1; index < text.length; index += 1) {
      const character = text[index]
      if (escaped) {
        escaped = false
        continue
      }
      if (character === '\\') {
        escaped = true
        continue
      }
      if (character === '"') return index
    }
    return -1
  }

  for (let index = 0; index < text.length;) {
    const character = text[index]
    if (/\s/u.test(character)) {
      index += 1
      continue
    }
    const frame = stack.at(-1)
    if (character === '{' || character === '[') {
      consumeValue()
      stack.push(character === '{'
        ? { kind: 'object', state: 'key-or-end', keys: new Set() }
        : { kind: 'array', state: 'value-or-end' })
      index += 1
      continue
    }
    if (character === '}' || character === ']') {
      invariant(frame && ((character === '}') === (frame.kind === 'object')), `${label} has mismatched JSON delimiters`)
      invariant(
        frame.kind === 'object'
          ? ['key-or-end', 'comma-or-end'].includes(frame.state)
          : ['value-or-end', 'comma-or-end'].includes(frame.state),
        `${label} has an incomplete JSON container`,
      )
      stack.pop()
      index += 1
      continue
    }
    if (character === ',') {
      invariant(frame?.state === 'comma-or-end', `${label} has an invalid JSON comma`)
      frame.state = frame.kind === 'object' ? 'key-or-end' : 'value-or-end'
      index += 1
      continue
    }
    if (character === ':') {
      invariant(frame?.kind === 'object' && frame.state === 'colon', `${label} has an invalid JSON colon`)
      frame.state = 'value'
      index += 1
      continue
    }
    if (character === '"') {
      const end = stringEnd(index)
      invariant(end > index, `${label} has an unterminated JSON string`)
      const token = text.slice(index, end + 1)
      if (frame?.kind === 'object' && frame.state === 'key-or-end') {
        const key = JSON.parse(token)
        invariant(!frame.keys.has(key), `${label} contains duplicate object key:${key}`)
        frame.keys.add(key)
        frame.state = 'colon'
      } else {
        consumeValue()
      }
      index = end + 1
      continue
    }
    let end = index + 1
    while (end < text.length && !/[\s,\]}]/u.test(text[end])) end += 1
    consumeValue()
    index = end
  }
  invariant(rootConsumed && stack.length === 0, `${label} has an incomplete JSON document`)
}

function parseCarrierJson(bytes, label) {
  invariant(Buffer.isBuffer(bytes), `${label} bytes must be a Buffer`)
  invariant(bytes.length > 0 && bytes.length <= GOVERNANCE_CARRIER_MAX_BYTES, `${label} byte length is outside the closed bound`)
  invariant(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `${label} must not contain a UTF-8 BOM`)
  let text
  try {
    text = UTF8.decode(bytes)
  } catch (error) {
    throw new Error(`governance carrier projection blocked:${label} is not canonical UTF-8`, { cause: error })
  }
  assertNoDuplicateJsonObjectKeys(text, label)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`governance carrier projection blocked:${label} is invalid JSON:${error.message}`, { cause: error })
  }
}

function projectedCertificationTarget(target, recordId, targetIds) {
  allowedKeys(
    target,
    CERTIFICATION_TARGET_KEYS,
    [...TARGET_AXES, 'status', 'limitations'],
    `certification ${recordId} target`,
  )
  invariant(typeof target.id === 'string' && target.id.length > 0 && !targetIds.has(target.id), `certification ${recordId} target id is invalid or duplicated:${String(target.id)}`)
  invariant(['certified', 'not-certified', 'unsupported'].includes(target.status), `certification ${recordId}/${target.id} status is invalid`)
  invariant(Array.isArray(target.limitations), `certification ${recordId}/${target.id} limitations must be an array`)
  const projection = Object.fromEntries(TARGET_AXES.map(axis => {
    invariant(typeof target[axis] === 'string' && target[axis].length > 0, `certification ${recordId}/${target.id} ${axis} is invalid`)
    return [axis, target[axis]]
  }))
  if (target.status === 'unsupported') {
    invariant(target.limitations.length > 0 && target.limitations.every(item => typeof item === 'string' && item.length > 0), `certification ${recordId}/${target.id} unsupported limitations are invalid`)
    projection.certificationClass = 'unsupported'
    projection.limitations = structuredClone(target.limitations)
  } else {
    projection.certificationClass = 'certifiable'
  }
  targetIds.add(target.id)
  return projection
}

function providerCertificationProjection(bytes) {
  const ledger = parseCarrierJson(bytes, 'provider certification ledger')
  exactKeys(ledger, ['$schema', 'schemaVersion', 'certifications'], 'provider certification ledger')
  invariant(ledger.$schema === '../schemas/provider-surface-certification.schema.json' && ledger.schemaVersion === 2, 'provider certification ledger identity/version is invalid')
  invariant(Array.isArray(ledger.certifications), 'provider certifications must be an array')
  const ids = new Set()
  const projected = {
    $schema: ledger.$schema,
    schemaVersion: ledger.schemaVersion,
    certifications: ledger.certifications.map((certification, index) => {
      allowedKeys(
        certification,
        CERTIFICATION_RECORD_KEYS,
        [
          'id',
          'provider',
          'runtimeKind',
          'providerVersion',
          'adapterVersion',
          'surface',
          'repositoryRole',
          'status',
          'platformMatrix',
          'checks',
          'limitations',
        ],
        `certification[${index}]`,
      )
      invariant(typeof certification.id === 'string' && certification.id.length > 0 && !ids.has(certification.id), `certification id is invalid or duplicated:${String(certification.id)}`)
      for (const key of ['provider', 'runtimeKind', 'providerVersion', 'adapterVersion', 'surface', 'repositoryRole']) {
        invariant(typeof certification[key] === 'string' && certification[key].length > 0, `certification ${certification.id} ${key} is invalid`)
      }
      invariant(Array.isArray(certification.platformMatrix) && certification.platformMatrix.length > 0, `certification ${certification.id} platformMatrix is empty`)
      const record = {
        id: certification.id,
        provider: certification.provider,
        runtimeKind: certification.runtimeKind,
        providerVersion: certification.providerVersion,
        adapterVersion: certification.adapterVersion,
        surface: certification.surface,
        repositoryRole: certification.repositoryRole,
        platformMatrix: [],
      }
      if (Object.hasOwn(certification, 'certifiedAt')) record.certifiedAt = certification.certifiedAt
      if (Object.hasOwn(certification, 'expiresAt')) record.expiresAt = certification.expiresAt
      const targetIds = new Set()
      record.platformMatrix = certification.platformMatrix.map(target => projectedCertificationTarget(target, certification.id, targetIds))
      ids.add(certification.id)
      return record
    }),
  }
  return Buffer.from(stableJson(projected))
}

function reviewCapabilityCertificationProjection(bytes) {
  const ledger = parseCarrierJson(bytes, 'review capability certification ledger')
  exactKeys(
    ledger,
    ['$schema', 'schemaVersion', 'kind', 'certifications'],
    'review capability certification ledger',
  )
  invariant(
    ledger.$schema === '../schemas/review-capability-certifications.schema.json'
      && ledger.schemaVersion === 1
      && ledger.kind === 'review-capability-certification-ledger',
    'review capability certification ledger identity/version is invalid',
  )
  invariant(Array.isArray(ledger.certifications),
    'review capability certifications must be an array')
  const ids = new Set()
  for (const [index, certification] of ledger.certifications.entries()) {
    allowedKeys(
      certification,
      REVIEW_CAPABILITY_CERTIFICATION_KEYS,
      [...REVIEW_CAPABILITY_CERTIFICATION_KEYS],
      `review capability certification[${index}]`,
    )
    invariant(
      typeof certification.id === 'string'
        && certification.id.length > 0
        && !ids.has(certification.id),
      `review capability certification id is invalid or duplicated:${String(certification.id)}`,
    )
    ids.add(certification.id)
  }
  return Buffer.from(stableJson({
    $schema: ledger.$schema,
    schemaVersion: ledger.schemaVersion,
    kind: ledger.kind,
    certifications: [],
  }))
}

const PROJECTIONS = Object.freeze({
  'provider-certification-state-v1': Object.freeze({
    path: PROVIDER_CERTIFICATION_CARRIER_PATH,
    project: providerCertificationProjection,
  }),
  'review-capability-certification-state-v1': Object.freeze({
    path: REVIEW_CAPABILITY_CERTIFICATION_CARRIER_PATH,
    project: reviewCapabilityCertificationProjection,
  }),
})

export function projectGovernanceCarrierBytes({ path, projectionId, bytes } = {}) {
  const definition = PROJECTIONS[projectionId]
  invariant(definition, `unknown projection id:${String(projectionId)}`)
  invariant(path === definition.path, `projection ${projectionId} is not registered for path:${String(path)}`)
  return definition.project(bytes)
}

export function governanceCarrierProjectionMap(sources) {
  invariant(Array.isArray(sources), 'manifest sources must be an array')
  const bindings = new Map()
  for (const source of sources) {
    if (source?.carrierProjection === undefined) continue
    const definition = PROJECTIONS[source.carrierProjection]
    invariant(definition, `manifest source ${String(source?.id)} uses an unknown carrier projection:${String(source?.carrierProjection)}`)
    invariant(source.path === definition.path, `manifest source ${String(source?.id)} projection/path pair is not registered`)
    invariant(!Array.isArray(source.excludes) || source.excludes.length === 0, `projected manifest source ${String(source?.id)} cannot declare directory exclusions`)
    invariant(!bindings.has(source.path), `manifest carrier projection path is duplicated:${source.path}`)
    bindings.set(source.path, Object.freeze({ path: source.path, projection: source.carrierProjection }))
  }
  return bindings
}

export function assertCanonicalGovernanceCarrierProjectionMap(bindings) {
  invariant(bindings instanceof Map, 'carrier projection bindings must be a Map')
  const expected = Object.values(PROJECTIONS)
    .map(definition => definition.path)
    .sort()
  const actual = [...bindings.keys()].sort()
  invariant(actual.length === expected.length && actual.every((path, index) => path === expected[index]), 'canonical carrier projection closure is incomplete or contains extra paths')
  return true
}

function excludedBySource(sourcePath, excludes, path) {
  for (const raw of excludes ?? []) {
    const exclusion = raw.replace(/\/+$/, '')
    invariant(exclusion.startsWith(`${sourcePath}/`), `source exclusion escapes projected source:${raw}`)
    if (path === exclusion || path.startsWith(`${exclusion}/`)) return true
  }
  return false
}

export function governanceCarrierProjectionsForSource(source, bindings) {
  invariant(bindings instanceof Map, 'carrier projection bindings must be a Map')
  const sourcePath = String(source?.path ?? '').replace(/\/+$/, '')
  invariant(sourcePath.length > 0, 'source path is empty')
  return [...bindings.values()]
    .filter(binding => (
      (binding.path === sourcePath || binding.path.startsWith(`${sourcePath}/`))
      && !excludedBySource(sourcePath, source?.excludes, binding.path)
    ))
    .sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)))
    .map(binding => ({ path: binding.path, projection: binding.projection }))
}
