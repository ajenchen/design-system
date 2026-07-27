import { createHash } from 'node:crypto'
import { isIP } from 'node:net'

function fail(message) {
  throw new Error(`model API transport blocked:${message}`)
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]))
}

const stable = (value) => JSON.stringify(normalize(value))
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const RESERVED_STATIC_HEADERS = new Set([
  'authorization', 'connection', 'content-length', 'content-type', 'cookie', 'host',
  'proxy-authorization', 'set-cookie', 'transfer-encoding', 'x-api-key',
])
const CAPABILITY_TOKEN = /(?:^|[_-])(?:agent|agents|assistant|assistants|browser|computer|connector|connectors|extension|extensions|function|functions|mcp|plugin|plugins|remote|server|servers|tool|tools|web[-_]?search|file[-_]?search|code[-_]?interpreter|url|uri|endpoint)(?:$|[_-])/i
const FIXED_PURPOSES = {
  'output-token-limit': (value) => Number.isSafeInteger(value) && value >= 1 && value <= 65536,
  'persistence-disabled': (value) => value === false,
  'structured-output-name': (value) => typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value),
  'structured-output-strict': (value) => value === true,
  'structured-output-type': (value) => value === 'json_schema',
  'user-message-role': (value) => value === 'user',
}

function validateModelSyntax(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value) || !/\d/.test(value)
    || /(?:^|[._:-])(?:latest|default|auto|model|placeholder)(?:$|[._:-])/i.test(value)) {
    fail('model must be an explicit immutable identifier without an alias/placeholder token')
  }
  return value
}

function pointerTokens(pointer, label) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) fail(`${label} is not a JSON pointer`)
  const tokens = pointer.slice(1).split('/').map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'))
  if (tokens.some((token) => !token || ['__proto__', 'prototype', 'constructor'].includes(token))) {
    fail(`${label} contains an unsafe/empty token`)
  }
  return tokens
}

function pointerGet(value, pointer, label) {
  let current = value
  for (const token of pointerTokens(pointer, label)) {
    if (!current || typeof current !== 'object' || !(token in current)) return undefined
    current = current[token]
  }
  return current
}

function pointerSet(root, pointer, value, label) {
  const tokens = pointerTokens(pointer, label)
  let current = root
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index]
    const nextArray = /^(?:0|[1-9][0-9]*)$/.test(tokens[index + 1])
    if (!(token in current)) current[token] = nextArray ? [] : {}
    if (!current[token] || typeof current[token] !== 'object' || Array.isArray(current[token]) !== nextArray) {
      fail(`${label} collides with another request field:${pointer}`)
    }
    current = current[token]
  }
  const final = tokens.at(-1)
  if (Object.hasOwn(current, final)) fail(`${label} duplicates another request field:${pointer}`)
  current[final] = value
}

function pointerRoot(pointer, label) {
  return pointerTokens(pointer, label)[0]
}

function assertCapabilityFreePointer(pointer, label) {
  const tokens = pointerTokens(pointer, label)
  if (tokens.some((token) => CAPABILITY_TOKEN.test(token))) fail(`${label} exposes a tool, remote, or executable capability:${pointer}`)
  return tokens
}

function publicDnsHost(host) {
  if (typeof host !== 'string' || host.length > 253 || isIP(host) !== 0 || !host.includes('.')
    || host !== host.toLowerCase() || host.includes('..')) return false
  const labels = host.split('.')
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    && !/(?:^|\.)(?:localhost|local|internal|home|lan|test)$/.test(host)
}

export function validateBrokerApiProfile(profile, { providerId = profile?.providerId } = {}) {
  if (!profile || profile.providerId !== providerId || profile.mode !== 'broker-content-only'
    || profile.transportKind !== 'provider-https-json-api' || profile.repositoryAccess !== 'forbidden'
    || profile.toolAccess !== 'none-tools-field-omitted'
    || profile.workingDirectory !== 'not-applicable-repository-unmounted'
    || profile.modelIdentity?.policy !== 'closed-model-release-registry-response-exact-match'
    || !Array.isArray(profile.modelIdentity?.allowedModelReleaseIds)
    || profile.modelIdentity.allowedModelReleaseIds.length === 0
    || profile.endpoint?.scheme !== 'https' || profile.endpoint?.method !== 'POST'
    || typeof profile.endpoint?.path !== 'string' || !/^\/v[0-9]+\/[a-z][a-z0-9/_-]*$/.test(profile.endpoint.path)
    || profile.endpoint?.redirectPolicy !== 'error' || !publicDnsHost(profile.endpoint?.host)
    || stable(profile.egressAllowedHosts) !== stable([profile.endpoint.host])
    || profile.credential?.mode !== 'managed-oidc-secret-broker'
    || !((profile.credential.header === 'authorization' && profile.credential.scheme === 'bearer')
      || (profile.credential.header === 'x-api-key' && profile.credential.scheme === 'none'))
    || !Array.isArray(profile.staticHeaders)
    || profile.request?.toolsPolicy !== 'field-omitted' || profile.request?.stream !== false
    || !Array.isArray(profile.request?.bodyTopLevelFields) || !Array.isArray(profile.request?.fixedFields)
    || profile.response?.uniqueness !== 'exactly-one-per-level' || !Array.isArray(profile.response?.selection)) {
    fail(`profile is not closed, no-tools, repository-unmounted, redirect-free, public-DNS exact-egress, and broker-credentialed:${String(providerId)}`)
  }
  const staticNames = profile.staticHeaders.map((item) => item.name)
  if (new Set(staticNames).size !== staticNames.length
    || staticNames.some((name) => RESERVED_STATIC_HEADERS.has(name) || name === profile.credential.header)
    || profile.staticHeaders.some((item) => typeof item.value !== 'string' || item.value !== item.value.trim() || /[\0-\x1f\x7f]/.test(item.value))) {
    fail(`profile static headers collide with transport credentials/content framing or contain control bytes:${providerId}`)
  }
  const releaseIds = profile.modelIdentity.allowedModelReleaseIds
  if (new Set(releaseIds).size !== releaseIds.length
    || stable(releaseIds) !== stable([...releaseIds].sort())) {
    fail(`profile model release allowlist must be non-empty, unique, and sorted:${providerId}`)
  }
  for (const releaseId of releaseIds) {
    const prefix = `${providerId}/`
    if (!releaseId.startsWith(prefix) || releaseId === prefix) fail(`profile model release belongs to another provider:${providerId}:${releaseId}`)
    validateModelSyntax(releaseId.slice(prefix.length))
  }
  assertCapabilityFreePointer(profile.modelIdentity.responseModelPointer, 'profile response model pointer')
  const dynamicPointers = [
    profile.request.modelPointer,
    profile.request.instructionPointer,
    profile.request.dataPointer,
    profile.request.resultSchemaPointer,
  ]
  const fixedPointers = profile.request.fixedFields.map((item) => item.pointer)
  for (const [index, pointer] of [...dynamicPointers, ...fixedPointers].entries()) {
    assertCapabilityFreePointer(pointer, `profile request pointer[${index}]`)
  }
  if (new Set(dynamicPointers).size !== dynamicPointers.length || new Set(fixedPointers).size !== fixedPointers.length
    || fixedPointers.some((pointer) => dynamicPointers.includes(pointer))) {
    fail(`profile request pointers are duplicate or ambiguous:${providerId}`)
  }
  for (const [index, item] of profile.request.fixedFields.entries()) {
    let decoded
    try { decoded = JSON.parse(item.canonicalJson) } catch (error) { fail(`profile fixed field is not JSON:${providerId}:${index}:${error.message}`) }
    if (JSON.stringify(decoded) !== item.canonicalJson || !FIXED_PURPOSES[item.purpose]?.(decoded)) {
      fail(`profile fixed field purpose/value is not canonical or safe:${providerId}:${item.purpose}`)
    }
    const tokens = pointerTokens(item.pointer, `profile fixed field[${index}]`)
    if (tokens.at(-1) === 'stream' && decoded !== false) fail(`profile stream body field must be false:${providerId}`)
  }
  const actualRoots = [...new Set([...dynamicPointers, ...fixedPointers].map((pointer) => pointerRoot(pointer, 'profile request pointer')))].sort()
  if (stable(profile.request.bodyTopLevelFields) !== stable(actualRoots)
    || profile.request.bodyTopLevelFields.some((field) => CAPABILITY_TOKEN.test(field))) {
    fail(`profile body top-level field closure is incomplete or capability-bearing:${providerId}`)
  }
  for (const [index, selector] of profile.response.selection.entries()) {
    assertCapabilityFreePointer(selector.collectionPointer, `profile response selector[${index}].collection`)
    assertCapabilityFreePointer(selector.predicatePointer, `profile response selector[${index}].predicate`)
    if (CAPABILITY_TOKEN.test(selector.predicateValue)) fail(`profile response selector exposes a capability:${providerId}`)
  }
  assertCapabilityFreePointer(profile.response.runIdPointer, 'profile response run-id pointer')
  assertCapabilityFreePointer(profile.response.valuePointer, 'profile response value pointer')
  if (!Array.isArray(profile.response.requiredTerminalPredicates)
    || profile.response.requiredTerminalPredicates.length === 0
    || new Set(profile.response.requiredTerminalPredicates.map((item) => item.pointer)).size !== profile.response.requiredTerminalPredicates.length) {
    fail(`profile response terminal predicates are absent or duplicate:${providerId}`)
  }
  for (const [index, predicate] of profile.response.requiredTerminalPredicates.entries()) {
    assertCapabilityFreePointer(predicate.pointer, `profile terminal predicate[${index}]`)
    let decoded
    try { decoded = JSON.parse(predicate.canonicalJson) } catch (error) { fail(`profile terminal predicate is not JSON:${providerId}:${error.message}`) }
    if (JSON.stringify(decoded) !== predicate.canonicalJson) fail(`profile terminal predicate is not canonical JSON:${providerId}:${predicate.pointer}`)
  }
  return profile
}

export function validateImmutableModelForProfile(profile, value) {
  validateBrokerApiProfile(profile)
  validateModelSyntax(value)
  const releaseId = `${profile.providerId}/${value}`
  if (!profile.modelIdentity.allowedModelReleaseIds.includes(releaseId)) {
    fail(`model release is not in the reviewed closed allowlist:${releaseId}`)
  }
  return value
}

export function buildBrokerApiRequest({ profile, model, instructions, data, resultSchema } = {}) {
  validateBrokerApiProfile(profile)
  validateImmutableModelForProfile(profile, model)
  if (typeof instructions !== 'string' || !instructions || typeof data !== 'string' || !data
    || !resultSchema || typeof resultSchema !== 'object' || Array.isArray(resultSchema)) {
    fail('broker API request dynamic inputs are invalid')
  }
  const body = {}
  for (const item of profile.request.fixedFields) pointerSet(body, item.pointer, JSON.parse(item.canonicalJson), 'broker API fixed field')
  pointerSet(body, profile.request.modelPointer, model, 'broker API model field')
  pointerSet(body, profile.request.instructionPointer, instructions, 'broker API authority instruction field')
  pointerSet(body, profile.request.dataPointer, data, 'broker API untrusted data field')
  pointerSet(body, profile.request.resultSchemaPointer, resultSchema, 'broker API result-schema field')
  if (Object.hasOwn(body, 'tools')) fail('broker API request unexpectedly contains a tools field')
  const staticHeaders = Object.fromEntries(profile.staticHeaders.map((item) => [item.name, item.value]))
  if (Object.hasOwn(staticHeaders, profile.credential.header)) fail('broker API request cannot materialize a credential in its public request plan')
  return {
    transportKind: profile.transportKind,
    method: profile.endpoint.method,
    url: `${profile.endpoint.scheme}://${profile.endpoint.host}${profile.endpoint.path}`,
    redirectPolicy: profile.endpoint.redirectPolicy,
    egressAllowedHosts: [...profile.egressAllowedHosts],
    staticHeaders: { 'content-type': 'application/json', ...staticHeaders },
    credential: { ...profile.credential },
    body,
    instructionSha256: sha256(instructions),
    dataSha256: sha256(data),
    requestSha256: sha256(stable(body)),
  }
}

export function validateProviderResponseSelector({
  providerId,
  modelIdentity,
  responseSelector,
} = {}) {
  if (!/^[a-z][a-z0-9-]*$/.test(providerId ?? '')
    || modelIdentity?.policy !== 'closed-model-release-registry-response-exact-match'
    || !Array.isArray(modelIdentity.allowedModelReleaseIds)
    || modelIdentity.allowedModelReleaseIds.length === 0
    || !responseSelector || typeof responseSelector !== 'object' || Array.isArray(responseSelector)
    || responseSelector.schemaVersion !== 1
    || responseSelector.kind !== 'provider-review-result-response-selector'
    || !['provider-native-managed-api-response-v1', 'content-addressed-provider-review-result-v1'].includes(responseSelector.carrierShape)
    || responseSelector.uniqueness !== 'exactly-one-per-level'
    || responseSelector.resultEncoding !== 'json-string'
    || !Array.isArray(responseSelector.requiredTerminalPredicates)
    || responseSelector.requiredTerminalPredicates.length === 0
    || !Array.isArray(responseSelector.selection)
    || responseSelector.selection.length === 0) {
    fail(`provider response selector contract is invalid:${String(providerId)}`)
  }
  const exactSelectorKeys = [
    'schemaVersion',
    'kind',
    'carrierShape',
    'responseModelPointer',
    'runIdPointer',
    'requiredTerminalPredicates',
    'selection',
    'valuePointer',
    'uniqueness',
    'resultEncoding',
  ]
  if (stable(Object.keys(responseSelector).sort()) !== stable(exactSelectorKeys.sort())) {
    fail(`provider response selector contract has an open shape:${providerId}`)
  }
  const releaseIds = modelIdentity.allowedModelReleaseIds
  if (new Set(releaseIds).size !== releaseIds.length || stable(releaseIds) !== stable([...releaseIds].sort())) {
    fail(`provider response selector model releases are duplicate or unordered:${providerId}`)
  }
  for (const releaseId of releaseIds) {
    if (!releaseId.startsWith(`${providerId}/`) || releaseId === `${providerId}/`) {
      fail(`provider response selector model release belongs to another provider:${providerId}:${releaseId}`)
    }
    validateModelSyntax(releaseId.slice(providerId.length + 1))
  }
  assertCapabilityFreePointer(responseSelector.responseModelPointer, 'provider response model pointer')
  assertCapabilityFreePointer(responseSelector.runIdPointer, 'provider response run-id pointer')
  assertCapabilityFreePointer(responseSelector.valuePointer, 'provider response value pointer')
  if (new Set(responseSelector.requiredTerminalPredicates.map((item) => item?.pointer)).size
    !== responseSelector.requiredTerminalPredicates.length) {
    fail(`provider response selector terminal predicates are duplicate:${providerId}`)
  }
  for (const [index, predicate] of responseSelector.requiredTerminalPredicates.entries()) {
    assertCapabilityFreePointer(predicate?.pointer, `provider response terminal predicate[${index}]`)
    let decoded
    try { decoded = JSON.parse(predicate?.canonicalJson) } catch (error) {
      fail(`provider response terminal predicate is not JSON:${providerId}:${error.message}`)
    }
    if (JSON.stringify(decoded) !== predicate.canonicalJson) {
      fail(`provider response terminal predicate is not canonical JSON:${providerId}:${predicate.pointer}`)
    }
  }
  for (const [index, selector] of responseSelector.selection.entries()) {
    assertCapabilityFreePointer(selector?.collectionPointer, `provider response selector[${index}].collection`)
    assertCapabilityFreePointer(selector?.predicatePointer, `provider response selector[${index}].predicate`)
    if (typeof selector?.predicateValue !== 'string' || !selector.predicateValue
      || CAPABILITY_TOKEN.test(selector.predicateValue)) {
      fail(`provider response selector predicate is invalid or capability-bearing:${providerId}:${index}`)
    }
  }
  return responseSelector
}

export function selectBrokerResultWithSelector({
  providerId,
  modelIdentity,
  responseSelector,
  response,
  requestedModel,
} = {}) {
  validateProviderResponseSelector({ providerId, modelIdentity, responseSelector })
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    fail('provider response selection input is invalid')
  }
  validateModelSyntax(requestedModel)
  if (!modelIdentity.allowedModelReleaseIds.includes(`${providerId}/${requestedModel}`)) {
    fail(`model release is not in the reviewed closed allowlist:${providerId}/${requestedModel}`)
  }
  const providerRunId = pointerGet(response, responseSelector.runIdPointer, 'provider response run-id pointer')
  if (typeof providerRunId !== 'string' || !providerRunId.trim()) fail('provider response omits its provider run identity')
  const resolvedModel = pointerGet(response, responseSelector.responseModelPointer, 'provider response model pointer')
  if (typeof resolvedModel !== 'string' || resolvedModel !== requestedModel) {
    fail(`provider response model does not exactly match the reviewed requested model:${String(resolvedModel)}`)
  }
  const terminalObservations = responseSelector.requiredTerminalPredicates.map((predicate, index) => {
    const observed = pointerGet(response, predicate.pointer, `provider response terminal predicate[${index}]`)
    if (stable(observed) !== predicate.canonicalJson) {
      fail(`provider response is not terminal-success at ${predicate.pointer}; observed:${stable(observed)}`)
    }
    return { pointer: predicate.pointer, canonicalJson: predicate.canonicalJson }
  })
  let selected = response
  for (const [index, selector] of responseSelector.selection.entries()) {
    const collection = pointerGet(selected, selector.collectionPointer, `provider response selector[${index}].collection`)
    if (!Array.isArray(collection)) fail(`provider response selector[${index}] collection is absent/non-array`)
    const matches = collection.filter((item) => pointerGet(item, selector.predicatePointer, `provider response selector[${index}].predicate`) === selector.predicateValue)
    if (matches.length !== 1) fail(`provider response selector[${index}] must match exactly once; observed:${matches.length}`)
    selected = matches[0]
  }
  const encoded = pointerGet(selected, responseSelector.valuePointer, 'provider result value pointer')
  if (responseSelector.resultEncoding !== 'json-string' || typeof encoded !== 'string' || !encoded.trim()) {
    fail('provider response result is absent or has an unsupported encoding')
  }
  let result
  try { result = JSON.parse(encoded) } catch (error) { fail(`provider result is invalid JSON:${error.message}`) }
  if (!result || typeof result !== 'object' || Array.isArray(result)) fail('provider result must decode to an object')
  return {
    providerRunId,
    requestedModelId: requestedModel,
    observedResponseModelId: resolvedModel,
    terminalObservations,
    result,
    responseSha256: sha256(stable(response)),
  }
}

export function selectBrokerApiResult({ profile, response, requestedModel } = {}) {
  if (!profile || profile.mode !== 'broker-content-only') {
    fail('broker API response selection inputs are invalid')
  }
  validateImmutableModelForProfile(profile, requestedModel)
  return selectBrokerResultWithSelector({
    providerId: profile.providerId,
    modelIdentity: profile.modelIdentity,
    responseSelector: {
      schemaVersion: 1,
      kind: 'provider-review-result-response-selector',
      carrierShape: 'provider-native-managed-api-response-v1',
      responseModelPointer: profile.modelIdentity.responseModelPointer,
      ...profile.response,
    },
    response,
    requestedModel,
  })
}
