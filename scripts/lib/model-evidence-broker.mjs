import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { compareUtf8Bytes } from './component-dependency-source-inventory.mjs'

const PLAN_PATH = 'infra/governance/model-evidence-broker.json'
const SCHEMA_PATH = 'infra/governance/schemas/model-evidence-broker.schema.json'
const RESULT_SCHEMA_PATH = 'infra/governance/schemas/model-broker-shard-result.schema.json'
const SHA256 = /^[a-f0-9]{64}$/

function fail(message) {
  throw new Error(`model evidence broker blocked:${message}`)
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort(compareUtf8Bytes).map((key) => [key, normalize(value[key])]))
}

const canonical = (value) => JSON.stringify(normalize(value))

function updateCanonicalHash(hash, value, arrayElement = false) {
  if (value === undefined) {
    if (arrayElement) hash.update('null')
    return
  }
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) {
      if (arrayElement) hash.update('null')
      return
    }
    hash.update(encoded)
    return
  }
  if (Array.isArray(value)) {
    hash.update('[')
    for (let index = 0; index < value.length; index += 1) {
      if (index) hash.update(',')
      updateCanonicalHash(hash, value[index], true)
    }
    hash.update(']')
    return
  }
  hash.update('{')
  let emitted = false
  for (const key of Object.keys(value).filter((key) => value[key] !== undefined).sort(compareUtf8Bytes)) {
    if (emitted) hash.update(',')
    emitted = true
    hash.update(JSON.stringify(key)).update(':')
    updateCanonicalHash(hash, value[key])
  }
  hash.update('}')
}

function canonicalDigest(value) {
  const hash = createHash('sha256')
  updateCanonicalHash(hash, value)
  return hash.digest('hex')
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || canonical(Object.keys(value).sort(compareUtf8Bytes)) !== canonical([...keys].sort(compareUtf8Bytes))) fail(`${label} has an invalid or open shape`)
}

function safeFrozenFile(repoRoot, row) {
  if (!row || typeof row.path !== 'string' || !row.path || row.path.includes('\\') || isAbsolute(row.path)
    || row.path.split('/').some((part) => !part || part === '.' || part === '..')) fail(`frozen content path is unsafe:${String(row?.path)}`)
  const target = resolve(repoRoot, row.path)
  const rel = relative(repoRoot, target)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`frozen content path escapes repository:${row.path}`)
  let cursor = repoRoot
  const segments = rel.split(sep)
  for (const segment of segments.slice(0, -1)) {
    cursor = resolve(cursor, segment)
    if (!existsSync(cursor) || lstatSync(cursor).isSymbolicLink()) fail(`broker content is missing or traverses a symbolic link:${row.path}`)
  }
  const info = lstatSync(target)
  if (!['file', 'symlink'].includes(row.kind)
    || (row.kind === 'file' && (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1))
    || (row.kind === 'symlink' && !info.isSymbolicLink())) fail(`broker content must be a frozen regular file or lexical symlink:${row.path}`)
  const bytes = row.kind === 'symlink' ? Buffer.from(readlinkSync(target)) : readFileSync(target)
  if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) fail(`broker content differs from frozen manifest:${row.path}`)
  return bytes
}

export function loadModelEvidenceBrokerPlan({ repoRoot = process.cwd() } = {}) {
  const root = realpathSync(resolve(repoRoot))
  const bytes = readFileSync(resolve(root, PLAN_PATH))
  const resultSchemaBytes = readFileSync(resolve(root, RESULT_SCHEMA_PATH))
  const plan = JSON.parse(bytes)
  const schemaBytes = readFileSync(resolve(root, SCHEMA_PATH))
  const schema = JSON.parse(schemaBytes)
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  if (!validate(plan)) fail(`plan schema validation failed:${ajv.errorsText(validate.errors)}`)
  const validateExchangeRequestSchema = ajv.compile({
    $ref: `${schema.$id}#/$defs/exchangeRequest`,
  })
  const validateReviewGraphExchangeRequestSchema = ajv.compile({
    $ref: `${schema.$id}#/$defs/reviewGraphExchangeRequest`,
  })
  const validateReviewGraphBatchExchangeRequestSchema = ajv.compile({
    $ref: `${schema.$id}#/$defs/reviewGraphBatchExchangeRequest`,
  })
  const validateGenuineCrossProviderReviewReceiptSchema = ajv.compile({
    $ref: `${schema.$id}#/$defs/genuineCrossProviderReviewReceipt`,
  })
  const limits = plan.limits
  if (limits.maxChunkBytes > limits.maxRawContentBytesPerShard
    || limits.maxRawContentBytesPerShard > limits.maxPromptBytesPerShard
    || Math.ceil(limits.maxPromptBytesPerShard / limits.bytesPerEstimatedToken) > limits.maxEstimatedTokensPerShard) {
    fail('plan context limits are internally inconsistent')
  }
  for (const key of ['maxTotalSourceBytes', 'maxShardCount', 'maxProviderCalls', 'maxCostUnits']) {
    if (plan.budgets.dispatchBatch[key] < plan.budgets.wholeTask[key]) {
      fail(`dispatch-batch budget is smaller than whole-task budget:${key}`)
    }
    if (plan.budgets.fullReview[key] < plan.budgets.dispatchBatch[key]) {
      fail(`full-review budget is smaller than dispatch-batch budget:${key}`)
    }
  }
  if (plan.budgets.wholeTask.maxProviderCalls < plan.budgets.wholeTask.maxShardCount
    || plan.budgets.dispatchBatch.maxProviderCalls < plan.budgets.dispatchBatch.maxShardCount
    || plan.budgets.fullReview.maxProviderCalls < plan.budgets.fullReview.maxShardCount) {
    fail('provider-call budgets cannot be smaller than the corresponding shard budgets')
  }
  return {
    root,
    plan,
    planDigest: sha256(bytes),
    planSchemaDigest: sha256(schemaBytes),
    exchangeRequestSchemaId: 'model-evidence-broker.schema.json#/$defs/exchangeRequest',
    exchangeRequestSchemaDigest: sha256(canonical(schema.$defs.exchangeRequest)),
    validateExchangeRequest(request) {
      if (!validateExchangeRequestSchema(request)) {
        fail(`exchange request schema validation failed:${ajv.errorsText(validateExchangeRequestSchema.errors)}`)
      }
      return true
    },
    reviewGraphExchangeRequestSchemaId: 'model-evidence-broker.schema.json#/$defs/reviewGraphExchangeRequest',
    reviewGraphExchangeRequestSchemaDigest: sha256(canonical(schema.$defs.reviewGraphExchangeRequest)),
    validateReviewGraphExchangeRequest(request) {
      if (!validateReviewGraphExchangeRequestSchema(request)) {
        fail(`review graph exchange request schema validation failed:${ajv.errorsText(validateReviewGraphExchangeRequestSchema.errors)}`)
      }
      return true
    },
    reviewGraphBatchExchangeRequestSchemaId:
      'model-evidence-broker.schema.json#/$defs/reviewGraphBatchExchangeRequest',
    reviewGraphBatchExchangeRequestSchemaDigest:
      sha256(canonical(schema.$defs.reviewGraphBatchExchangeRequest)),
    validateReviewGraphBatchExchangeRequest(request) {
      if (!validateReviewGraphBatchExchangeRequestSchema(request)) {
        fail(`review graph batch exchange request schema validation failed:${ajv.errorsText(validateReviewGraphBatchExchangeRequestSchema.errors)}`)
      }
      return true
    },
    genuineCrossProviderReviewReceiptSchemaId:
      'model-evidence-broker.schema.json#/$defs/genuineCrossProviderReviewReceipt',
    genuineCrossProviderReviewReceiptSchemaDigest:
      sha256(canonical(schema.$defs.genuineCrossProviderReviewReceipt)),
    validateGenuineCrossProviderReviewReceipt(receipt) {
      if (!validateGenuineCrossProviderReviewReceiptSchema(receipt)) {
        fail(`genuine cross-provider review receipt schema validation failed:${ajv.errorsText(validateGenuineCrossProviderReviewReceiptSchema.errors)}`)
      }
      return true
    },
    resultSchemaSha256: sha256(resultSchemaBytes),
  }
}

function isCanonicalUtf8Text(bytes) {
  if (bytes.includes(0)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return true
  } catch {
    return false
  }
}

function textLineBounds(bytes, slices) {
  let line = 1
  return slices.map(({ offset, end }) => {
    if (offset === end) return { lineStart: null, lineEnd: null }
    const lineStart = line
    let lineEnd = line
    for (let index = offset; index < end; index += 1) {
      lineEnd = line
      if (bytes[index] === 0x0d) {
        if (bytes[index + 1] === 0x0a) index += 1
        line += 1
      } else if (bytes[index] === 0x0a) line += 1
    }
    return { lineStart, lineEnd }
  })
}

function safeUtf8Boundary(bytes, start, proposedEnd) {
  let end = proposedEnd
  if (end < bytes.length) {
    while (end > start && (bytes[end] & 0xc0) === 0x80) end -= 1
    if (end > start && bytes[end - 1] === 0x0d && bytes[end] === 0x0a) end -= 1
  }
  if (end <= start) fail('maxChunkBytes cannot contain one complete UTF-8 code point/newline sequence')
  return end
}

function preferredTextBoundary(bytes, start, hardEnd) {
  let preferred = null
  for (let index = start; index < hardEnd; index += 1) {
    if (bytes[index] === 0x0d) {
      if (bytes[index + 1] === 0x0a) {
        if (index + 2 <= hardEnd) {
          preferred = index + 2
          index += 1
        }
      } else preferred = index + 1
    } else if (bytes[index] === 0x0a) preferred = index + 1
  }
  return preferred && preferred > start ? preferred : hardEnd
}

function chunksForSource({
  bytes,
  limits,
  sourceKind,
  sourceId,
  path,
  packageName,
  packageVersion,
  lockfileIntegrity,
  mediaType,
  fileSha256,
}) {
  if (mediaType === 'text' && !isCanonicalUtf8Text(bytes)) fail(`text source is not canonical UTF-8:${path}`)
  const slices = []
  if (bytes.length === 0) slices.push({ offset: 0, end: 0 })
  for (let offset = 0; offset < bytes.length;) {
    const proposedEnd = Math.min(bytes.length, offset + limits.maxChunkBytes)
    let end = mediaType === 'text' ? safeUtf8Boundary(bytes, offset, proposedEnd) : proposedEnd
    if (mediaType === 'text') end = preferredTextBoundary(bytes, offset, end)
    slices.push({ offset, end })
    offset = end
  }
  const lineBounds = mediaType === 'text'
    ? textLineBounds(bytes, slices)
    : slices.map(() => ({ lineStart: null, lineEnd: null }))
  return slices.map(({ offset, end }, chunkIndex) => {
    const content = bytes.subarray(offset, end)
    const { lineStart, lineEnd } = lineBounds[chunkIndex]
    const descriptor = {
      sourceKind,
      sourceId,
      path,
      packageName,
      packageVersion,
      lockfileIntegrity,
      mediaType,
      fileSha256,
      fileBytes: bytes.length,
      chunkIndex,
      chunkCount: slices.length,
      offset,
      bytes: content.length,
      lineStart,
      lineEnd,
      contentSha256: sha256(content),
      encoding: 'base64',
      content: content.toString('base64'),
    }
    descriptor.chunkId = sha256(canonical({ ...descriptor, content: undefined }))
    return descriptor
  })
}

function validateDependencySourceInventoryIdentity(inventory) {
  exactKeys(inventory, [
    'schemaVersion', 'evidenceKind', 'component', 'status', 'lockfileSha256', 'packages',
    'sourceCount', 'dependencySourceInventoryDigest', 'findings', 'dispositionSummary',
    'sourceDispositionDigest', 'sourceDispositions', 'sources',
  ], 'broker dependency source inventory')
  if (inventory.schemaVersion !== 2 || inventory.evidenceKind !== 'component-dependency-source-inventory'
    || typeof inventory.component !== 'string' || !inventory.component
    || !['verified', 'unverifiable'].includes(inventory.status)
    || !Array.isArray(inventory.packages) || !Array.isArray(inventory.findings)
    || !Array.isArray(inventory.sources) || inventory.sourceCount !== inventory.sources.length) {
    fail('broker dependency source inventory identity/collections are invalid')
  }
  if (inventory.lockfileSha256 !== null && !/^[a-f0-9]{64}$/.test(inventory.lockfileSha256)) {
    fail('broker dependency source inventory lockfile digest is invalid')
  }
  const sourcePaths = new Set()
  const sourceIds = new Set()
  let previousSource = null
  for (const source of inventory.sources) {
    const sourceOrder = previousSource
      ? compareUtf8Bytes(previousSource.path, source?.path)
        || compareUtf8Bytes(previousSource.sourceId, source?.sourceId)
      : -1
    if (previousSource && sourceOrder >= 0) {
      fail('broker dependency source inventory must be uniquely and canonically ordered')
    }
    if (sourcePaths.has(source?.path) || sourceIds.has(source?.sourceId)) {
      fail('broker dependency source inventory must be uniquely and canonically ordered')
    }
    sourcePaths.add(source?.path)
    sourceIds.add(source?.sourceId)
    previousSource = source
  }
  if (sourcePaths.size !== inventory.sources.length || sourceIds.size !== inventory.sources.length) {
    fail('broker dependency source inventory must be uniquely and canonically ordered')
  }
  for (const source of inventory.sources) {
    exactKeys(source, [
      'sourceKind', 'path', 'packageName', 'packageVersion', 'lockfileIntegrity', 'mediaType',
      'bytes', 'sha256', 'sourceId', 'encoding', 'content',
    ], 'broker dependency source')
    const bytes = Buffer.from(source.content, 'base64')
    const identity = {
      sourceKind: source.sourceKind,
      path: source.path,
      packageName: source.packageName,
      packageVersion: source.packageVersion,
      lockfileIntegrity: source.lockfileIntegrity,
      mediaType: source.mediaType,
      bytes: source.bytes,
      sha256: source.sha256,
    }
    if (!['claim-source', 'repository-source', 'dependency-source'].includes(source.sourceKind)
      || typeof source.path !== 'string' || !source.path || !['text', 'binary'].includes(source.mediaType)
      || !Number.isSafeInteger(source.bytes) || source.bytes < 0 || source.encoding !== 'base64'
      || bytes.toString('base64') !== source.content || bytes.length !== source.bytes
      || sha256(bytes) !== source.sha256 || source.sourceId !== sha256(canonical(identity))) {
      fail(`broker dependency source identity/content is invalid:${String(source.path)}`)
    }
    if (source.sourceKind === 'dependency-source') {
      if (typeof source.packageName !== 'string' || !source.packageName
        || typeof source.packageVersion !== 'string' || !source.packageVersion) {
        fail(`broker dependency package provenance is incomplete:${source.path}`)
      }
    } else if (source.packageName !== null || source.packageVersion !== null || source.lockfileIntegrity !== null) {
      fail(`broker component-owned source carries dependency provenance:${source.path}`)
    }
  }
  const orderedPackages = [...inventory.packages].sort((left, right) => compareUtf8Bytes(left?.packageName, right?.packageName))
  if (canonical(inventory.packages) !== canonical(orderedPackages)
    || new Set(inventory.packages.map((row) => row?.packageName)).size !== inventory.packages.length) {
    fail('broker dependency packages must be unique and canonically ordered')
  }
  for (const row of inventory.packages) {
    exactKeys(row, ['packageName', 'version', 'integrity', 'sourceCount', 'sourceDigest'], 'broker dependency package')
    const packageRows = inventory.sources
      .filter((source) => source.sourceKind === 'dependency-source' && source.packageName === row.packageName)
    const digestRows = packageRows.map(({ content, ...source }) => source)
    if (typeof row.packageName !== 'string' || !row.packageName || typeof row.version !== 'string' || !row.version
      || (row.integrity !== null && typeof row.integrity !== 'string')
      || row.sourceCount !== packageRows.length || row.sourceDigest !== sha256(canonical(digestRows))
      || packageRows.some((source) => source.packageVersion !== row.version || source.lockfileIntegrity !== row.integrity)) {
      fail(`broker dependency package/source digest is invalid:${String(row.packageName)}`)
    }
  }
  for (const finding of inventory.findings) {
    exactKeys(finding, ['code', 'packageName', 'path', 'reason'], 'broker dependency source finding')
  }
  const orderedFindings = [...inventory.findings].sort((left, right) => compareUtf8Bytes(canonical(left), canonical(right)))
  if (canonical(inventory.findings) !== canonical(orderedFindings)
    || (inventory.status === 'verified') !== (inventory.findings.length === 0)) {
    fail('broker dependency source findings/status are not canonical')
  }
  exactKeys(inventory.dispositionSummary, [
    'universeCount', 'materializedReachableCount', 'notApplicableCount', 'unknownCount',
  ], 'broker dependency source disposition summary')
  if (!Array.isArray(inventory.sourceDispositions)
    || inventory.dispositionSummary.universeCount !== inventory.sourceDispositions.length
    || inventory.dispositionSummary.materializedReachableCount
      + inventory.dispositionSummary.notApplicableCount
      + inventory.dispositionSummary.unknownCount !== inventory.sourceDispositions.length
    || inventory.sourceDispositionDigest !== canonicalDigest(inventory.sourceDispositions)) {
    fail('broker dependency source disposition universe is incomplete or digest-mismatched')
  }
  const materializedDependencyPaths = inventory.sources
    .filter((source) => source.sourceKind === 'dependency-source')
    .map((source) => source.path)
    .sort(compareUtf8Bytes)
  const dispositionMaterializedPaths = []
  const dispositionPaths = new Set()
  let notApplicableCount = 0
  let unknownCount = 0
  let previousDispositionPath = null
  for (const row of inventory.sourceDispositions) {
    exactKeys(row, [
      'path', 'packageName', 'packageVersion', 'kind', 'bytes', 'sha256',
      'disposition', 'reason',
    ], 'broker dependency source disposition')
    if (typeof row.path !== 'string' || !row.path
      || typeof row.packageName !== 'string' || !row.packageName
      || typeof row.packageVersion !== 'string' || !row.packageVersion
      || !['file', 'symlink'].includes(row.kind)
      || !Number.isSafeInteger(row.bytes) || row.bytes < 0
      || !SHA256.test(row.sha256 ?? '')
      || !['materialized-reachable', 'not-applicable', 'unknown'].includes(row.disposition)
      || typeof row.reason !== 'string' || !row.reason) {
      fail(`broker dependency source disposition is invalid:${String(row?.path)}`)
    }
    if ((previousDispositionPath !== null
        && compareUtf8Bytes(previousDispositionPath, row.path) >= 0)
      || dispositionPaths.has(row.path)) {
      fail('broker dependency source dispositions must be unique and canonically ordered')
    }
    previousDispositionPath = row.path
    dispositionPaths.add(row.path)
    if (row.disposition === 'materialized-reachable') dispositionMaterializedPaths.push(row.path)
    else if (row.disposition === 'not-applicable') notApplicableCount += 1
    else unknownCount += 1
  }
  dispositionMaterializedPaths.sort(compareUtf8Bytes)
  if (dispositionPaths.size !== inventory.sourceDispositions.length
    || materializedDependencyPaths.length !== dispositionMaterializedPaths.length
    || materializedDependencyPaths.some((path, index) => path !== dispositionMaterializedPaths[index])
    || inventory.dispositionSummary.materializedReachableCount
      !== dispositionMaterializedPaths.length
    || inventory.dispositionSummary.notApplicableCount !== notApplicableCount
    || inventory.dispositionSummary.unknownCount !== unknownCount
    || (unknownCount > 0 && inventory.status !== 'unverifiable')) {
    fail('broker dependency source disposition sets do not exactly close the materialized package universe')
  }
  const digestRows = inventory.sources.map(({ content, ...source }) => source)
  const expectedDigest = canonicalDigest({
    component: inventory.component,
    packages: inventory.packages,
    rows: digestRows,
    findings: inventory.findings,
    sourceDispositions: inventory.sourceDispositions,
    dispositionSummary: inventory.dispositionSummary,
    sourceDispositionDigest: inventory.sourceDispositionDigest,
  })
  if (inventory.dependencySourceInventoryDigest !== expectedDigest) {
    fail('broker dependency source inventory digest is not reproducible')
  }
  return true
}

function chunksForCoverage({ repoRoot, manifest, coveragePaths, limits, dependencySourceInventory = null }) {
  if (!Array.isArray(coveragePaths) || coveragePaths.length === 0
    || new Set(coveragePaths).size !== coveragePaths.length
    || canonical(coveragePaths) !== canonical([...coveragePaths].sort(compareUtf8Bytes))) fail('broker coverage paths must be non-empty, unique, and sorted')
  const rows = new Map(manifest.inventory.map((row) => [row.path, row]))
  const chunks = []
  for (const path of coveragePaths) {
    const row = rows.get(path)
    if (!row || !['file', 'symlink'].includes(row.kind)) fail(`broker coverage is not frozen readable content:${path}`)
    const bytes = safeFrozenFile(repoRoot, row)
    chunks.push(...chunksForSource({
      bytes,
      limits,
      sourceKind: 'repository-source',
      sourceId: sha256(canonical({ sourceKind: 'repository-source', path, bytes: bytes.length, sha256: row.sha256 })),
      path,
      packageName: null,
      packageVersion: null,
      lockfileIntegrity: null,
      mediaType: isCanonicalUtf8Text(bytes) ? 'text' : 'binary',
      fileSha256: row.sha256,
    }))
  }
  if (dependencySourceInventory !== null) {
    validateDependencySourceInventoryIdentity(dependencySourceInventory)
    for (const source of dependencySourceInventory.sources) {
      // Component-owned claim/implementation bytes are already present in the
      // frozen repository coverage.  Keep their source identity in the bound
      // dependency inventory digest, but do not duplicate the prompt bytes.
      const sourceKeys = [
        'sourceKind', 'path', 'packageName', 'packageVersion', 'lockfileIntegrity', 'mediaType',
        'bytes', 'sha256', 'sourceId', 'encoding', 'content',
      ]
      exactKeys(source, sourceKeys, 'broker dependency source')
      if (!['claim-source', 'repository-source', 'dependency-source'].includes(source.sourceKind)
        || !['text', 'binary'].includes(source.mediaType) || source.encoding !== 'base64') {
        fail(`broker dependency source identity is invalid:${String(source.path)}`)
      }
      const bytes = Buffer.from(source.content, 'base64')
      if (bytes.toString('base64') !== source.content || bytes.length !== source.bytes || sha256(bytes) !== source.sha256) {
        fail(`broker dependency source bytes are not content-addressed:${source.path}`)
      }
      const expectedSourceId = sha256(canonical({
        sourceKind: source.sourceKind,
        path: source.path,
        packageName: source.packageName,
        packageVersion: source.packageVersion,
        lockfileIntegrity: source.lockfileIntegrity,
        mediaType: source.mediaType,
        bytes: source.bytes,
        sha256: source.sha256,
      }))
      if (source.sourceId !== expectedSourceId) fail(`broker dependency sourceId is not reproducible:${source.path}`)
      if (source.sourceKind !== 'dependency-source' && coveragePaths.includes(source.path)) {
        const frozen = rows.get(source.path)
        if (!frozen || frozen.bytes !== source.bytes || frozen.sha256 !== source.sha256) {
          fail(`broker component-owned source differs from frozen repository coverage:${source.path}`)
        }
        continue
      }
      chunks.push(...chunksForSource({
        bytes,
        limits,
        sourceKind: source.sourceKind,
        sourceId: source.sourceId,
        path: source.path,
        packageName: source.packageName,
        packageVersion: source.packageVersion,
        lockfileIntegrity: source.lockfileIntegrity,
        mediaType: source.mediaType,
        fileSha256: source.sha256,
      }))
    }
  }
  return chunks
}

const CHUNK_KEYS = [
  'sourceKind', 'sourceId', 'path', 'packageName', 'packageVersion', 'lockfileIntegrity',
  'mediaType', 'fileSha256', 'fileBytes', 'chunkIndex', 'chunkCount', 'offset', 'bytes',
  'lineStart', 'lineEnd', 'contentSha256', 'encoding', 'content', 'chunkId',
]

const SHARD_IDENTITY_KEYS = [
  'runId', 'manifestSha256', 'head', 'tree', 'indexDigest', 'worktreeFingerprint',
  'inventoryDigest', 'rubricDigest', 'providerIdentityDigest', 'coverageInventoryDigest',
  'taskKind', 'subject', 'brokerPlanDigest', 'modelEvidencePlanDigest', 'resultSchemaSha256',
  'sourceSetDigest', 'sourceChunkCount', 'totalSourceBytes', 'inputArtifactSetDigest',
  'dependencySourceInventoryDigest', 'dependencySourceStatus', 'dependencySourceFindingsDigest',
  'dependencySourceDispositionDigest', 'dependencySourceUniverseCount',
  'dependencySourceMaterializedReachableCount', 'dependencySourceNotApplicableCount',
  'dependencySourceUnknownCount',
  'maxClaimsPerShard',
]

const INPUT_ARTIFACT_SET_KEYS = [
  'schemaVersion', 'evidenceKind', 'manifestSha256', 'head', 'tree', 'indexDigest',
  'worktreeFingerprint', 'inventoryDigest', 'rubricDigest', 'providerIdentityDigest',
  'coverageInventoryDigest', 'taskKind', 'subject', 'brokerPlanDigest',
  'modelEvidencePlanDigest', 'resultSchemaSha256', 'sourceSetDigest', 'sourceChunkCount',
  'totalSourceBytes', 'artifactSetDigest',
]

function digestField(value, label) {
  if (!SHA256.test(value ?? '')) fail(`${label} is not a SHA-256 digest`)
  return value
}

function orderedUniqueSourceChunks(chunks, { taskKind, label = 'broker source set' } = {}) {
  if (!Array.isArray(chunks) || chunks.length === 0 || !['judgment', 'component-a1b'].includes(taskKind)) {
    fail(`${label} inputs are invalid`)
  }
  const unique = new Map()
  for (const chunk of chunks) {
    exactKeys(chunk, CHUNK_KEYS, `${label} chunk`)
    if (!['claim-source', 'repository-source', 'dependency-source'].includes(chunk.sourceKind)
      || typeof chunk.sourceId !== 'string' || !chunk.sourceId
      || typeof chunk.path !== 'string' || !chunk.path
      || !['text', 'binary'].includes(chunk.mediaType)
      || !Number.isSafeInteger(chunk.fileBytes) || chunk.fileBytes < 0
      || !Number.isSafeInteger(chunk.chunkIndex) || chunk.chunkIndex < 0
      || !Number.isSafeInteger(chunk.chunkCount) || chunk.chunkCount <= 0
      || !Number.isSafeInteger(chunk.offset) || chunk.offset < 0
      || !Number.isSafeInteger(chunk.bytes) || chunk.bytes < 0
      || chunk.encoding !== 'base64'
      || !SHA256.test(chunk.fileSha256 ?? '')
      || !SHA256.test(chunk.contentSha256 ?? '')
      || !SHA256.test(chunk.chunkId ?? '')) {
      fail(`${label} chunk identity/range is invalid:${String(chunk?.chunkId)}`)
    }
    const bytes = Buffer.from(chunk.content, 'base64')
    if (bytes.toString('base64') !== chunk.content || bytes.length !== chunk.bytes
      || sha256(bytes) !== chunk.contentSha256) {
      fail(`${label} chunk content digest is invalid:${chunk.chunkId}`)
    }
    const { content, chunkId, ...chunkIdentity } = chunk
    if (chunk.chunkId !== sha256(canonical(chunkIdentity))) {
      fail(`${label} chunkId is not reproducible:${chunk.chunkId}`)
    }
    const previous = unique.get(chunk.chunkId)
    if (previous && canonicalDigest(previous) !== canonicalDigest(chunk)) {
      fail(`${label} substitutes a duplicate chunk identity:${chunk.chunkId}`)
    }
    if (previous && taskKind === 'judgment') {
      fail(`judgment shard set duplicates canonical coverage:${chunk.chunkId}`)
    }
    if (!previous) unique.set(chunk.chunkId, chunk)
  }
  return [...unique.values()].sort((left, right) => (
    compareUtf8Bytes(left.sourceKind, right.sourceKind)
    || compareUtf8Bytes(left.path, right.path)
    || compareUtf8Bytes(left.sourceId, right.sourceId)
    || left.offset - right.offset
    || left.chunkIndex - right.chunkIndex
  ))
}

function sourceSetState(chunks, { taskKind, label = 'broker source set' } = {}) {
  const ordered = orderedUniqueSourceChunks(chunks, { taskKind, label })
  const sources = new Map()
  for (const chunk of ordered) {
    const key = canonical({
      sourceKind: chunk.sourceKind,
      sourceId: chunk.sourceId,
      path: chunk.path,
      packageName: chunk.packageName,
      packageVersion: chunk.packageVersion,
      lockfileIntegrity: chunk.lockfileIntegrity,
    })
    if (!sources.has(key)) sources.set(key, [])
    sources.get(key).push(chunk)
  }
  for (const sourceChunks of sources.values()) {
    sourceChunks.sort((left, right) => left.offset - right.offset)
    const first = sourceChunks[0]
    let offset = 0
    const content = []
    for (const [index, chunk] of sourceChunks.entries()) {
      if (chunk.offset !== offset || chunk.chunkIndex !== index
        || chunk.chunkCount !== sourceChunks.length || chunk.fileBytes !== first.fileBytes
        || chunk.fileSha256 !== first.fileSha256 || chunk.mediaType !== first.mediaType) {
        fail(`${label} is missing, overlapping, reordered, or mixed:${first.path}`)
      }
      offset += chunk.bytes
      content.push(Buffer.from(chunk.content, 'base64'))
    }
    const bytes = Buffer.concat(content)
    if (offset !== first.fileBytes || sha256(bytes) !== first.fileSha256) {
      fail(`${label} does not reconstruct every declared source byte:${first.path}`)
    }
  }
  const projection = ordered.map(({ content, ...chunk }) => chunk)
  return {
    sourceSetDigest: sha256(canonical(projection)),
    sourceChunkCount: ordered.length,
    totalSourceBytes: ordered.reduce((sum, chunk) => sum + chunk.bytes, 0),
  }
}

function sameCanonicalChunkSequence(left, right) {
  return left.length === right.length && left.every((chunk, index) => (
    chunk.chunkId === right[index].chunkId
    && chunk.contentSha256 === right[index].contentSha256
    && chunk.bytes === right[index].bytes
  ))
}

function sameCanonicalShardSequence(left, right) {
  return left.length === right.length && left.every((shard, index) => (
    shard.shardId === right[index].shardId
    && shard.batchDigest === right[index].batchDigest
    && shard.promptBytes === right[index].promptBytes
    && shard.estimatedTokens === right[index].estimatedTokens
  ))
}

export function buildBrokerInputArtifactSet({
  manifest,
  manifestSha256,
  coverageInventoryDigest,
  taskKind,
  subject,
  brokerPlanDigest,
  modelEvidencePlanDigest,
  resultSchemaSha256,
  sourceSetDigest,
  sourceChunkCount,
  totalSourceBytes,
} = {}) {
  if (!manifest || !['judgment', 'component-a1b'].includes(taskKind)
    || !Number.isSafeInteger(sourceChunkCount) || sourceChunkCount <= 0
    || !Number.isSafeInteger(totalSourceBytes) || totalSourceBytes < 0) {
    fail('broker input artifact-set inputs are invalid')
  }
  for (const [label, value] of Object.entries({
    manifestSha256,
    indexDigest: manifest.indexDigest,
    worktreeFingerprint: manifest.worktreeFingerprint,
    inventoryDigest: manifest.inventoryDigest,
    rubricDigest: manifest.rubricDigest,
    providerIdentityDigest: manifest.providerIdentityDigest,
    coverageInventoryDigest,
    brokerPlanDigest,
    modelEvidencePlanDigest,
    resultSchemaSha256,
    sourceSetDigest,
  })) digestField(value, `broker input artifact-set ${label}`)
  const projection = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-model-input-artifact-set',
    manifestSha256,
    head: manifest.head,
    tree: manifest.tree,
    indexDigest: manifest.indexDigest,
    worktreeFingerprint: manifest.worktreeFingerprint,
    inventoryDigest: manifest.inventoryDigest,
    rubricDigest: manifest.rubricDigest,
    providerIdentityDigest: manifest.providerIdentityDigest,
    coverageInventoryDigest,
    taskKind,
    subject,
    brokerPlanDigest,
    modelEvidencePlanDigest,
    resultSchemaSha256,
    sourceSetDigest,
    sourceChunkCount,
    totalSourceBytes,
  }
  return { ...projection, artifactSetDigest: sha256(canonical(projection)) }
}

function brokerShardIdentity({
  manifest,
  inputArtifactSet,
  dependencySourceInventory,
  maxClaimsPerShard,
} = {}) {
  return {
    runId: manifest.runId,
    manifestSha256: inputArtifactSet.manifestSha256,
    head: manifest.head,
    tree: manifest.tree,
    indexDigest: manifest.indexDigest,
    worktreeFingerprint: manifest.worktreeFingerprint,
    inventoryDigest: manifest.inventoryDigest,
    rubricDigest: manifest.rubricDigest,
    providerIdentityDigest: manifest.providerIdentityDigest,
    coverageInventoryDigest: inputArtifactSet.coverageInventoryDigest,
    taskKind: inputArtifactSet.taskKind,
    subject: inputArtifactSet.subject,
    brokerPlanDigest: inputArtifactSet.brokerPlanDigest,
    modelEvidencePlanDigest: inputArtifactSet.modelEvidencePlanDigest,
    resultSchemaSha256: inputArtifactSet.resultSchemaSha256,
    sourceSetDigest: inputArtifactSet.sourceSetDigest,
    sourceChunkCount: inputArtifactSet.sourceChunkCount,
    totalSourceBytes: inputArtifactSet.totalSourceBytes,
    inputArtifactSetDigest: inputArtifactSet.artifactSetDigest,
    dependencySourceInventoryDigest: dependencySourceInventory?.dependencySourceInventoryDigest ?? null,
    dependencySourceStatus: dependencySourceInventory?.status ?? null,
    dependencySourceFindingsDigest: dependencySourceInventory
      ? sha256(canonical(dependencySourceInventory.findings))
      : null,
    dependencySourceDispositionDigest: dependencySourceInventory?.sourceDispositionDigest ?? null,
    dependencySourceUniverseCount: dependencySourceInventory?.dispositionSummary.universeCount ?? null,
    dependencySourceMaterializedReachableCount:
      dependencySourceInventory?.dispositionSummary.materializedReachableCount ?? null,
    dependencySourceNotApplicableCount:
      dependencySourceInventory?.dispositionSummary.notApplicableCount ?? null,
    dependencySourceUnknownCount: dependencySourceInventory?.dispositionSummary.unknownCount ?? null,
    maxClaimsPerShard,
  }
}

function validateInputArtifactSet(inputArtifactSet, expected) {
  exactKeys(inputArtifactSet, INPUT_ARTIFACT_SET_KEYS, 'broker input artifact set')
  const { artifactSetDigest, ...projection } = inputArtifactSet
  if (inputArtifactSet.schemaVersion !== 1
    || inputArtifactSet.evidenceKind !== 'deep-audit-model-input-artifact-set'
    || !SHA256.test(artifactSetDigest ?? '')
    || artifactSetDigest !== sha256(canonical(projection))
    || canonical(inputArtifactSet) !== canonical(expected)) {
    fail('broker input artifact set is invalid, stale, or not reproducible')
  }
  return true
}

function claimSourceChunks(claim, chunks) {
  if (!Number.isSafeInteger(claim?.line) || claim.line <= 0) fail(`claim line is invalid:${String(claim?.claimId)}`)
  const matches = chunks.filter((chunk) => chunk.path === claim.path && chunk.mediaType === 'text'
    && Number.isSafeInteger(chunk.lineStart) && claim.line >= chunk.lineStart && claim.line <= chunk.lineEnd)
  if (!matches.length) fail(`claim line is outside its canonical frozen chunks:${claim.claimId}`)
  return matches.sort((left, right) => left.offset - right.offset)
}

function graphDigest(value) {
  const projection = structuredClone(value)
  delete projection.graphDigest
  return sha256(canonical(projection))
}

function claimEvidenceRequirements(fullChunks, allClaims) {
  return {
    requiredEvidenceDigest: sha256(canonical(fullChunks.map(({ content, ...chunk }) => chunk))),
    requiredChunkCount: fullChunks.length,
    requiredRawContentBytes: fullChunks.reduce((sum, chunk) => sum + chunk.bytes, 0),
    claimPaths: new Set(allClaims.map((claim) => claim.path)),
  }
}

function claimEvidenceGraphContext({
  fullChunks,
  availableChunks,
  allClaims,
  status,
  reason,
  requirements = null,
}) {
  const required = requirements ?? claimEvidenceRequirements(fullChunks, allClaims)
  const availableText = availableChunks.filter((chunk) => chunk.mediaType === 'text')
  const implementationChunkIds = availableText
    .filter((chunk) => chunk.sourceKind === 'repository-source' && !required.claimPaths.has(chunk.path))
    .map((chunk) => chunk.chunkId).sort(compareUtf8Bytes)
  const dependencyPackages = [...new Set(availableText
    .filter((chunk) => chunk.sourceKind === 'dependency-source')
    .map((chunk) => chunk.packageName))].sort(compareUtf8Bytes).map((packageName) => ({
    packageName,
    chunkIds: availableText.filter((chunk) => chunk.sourceKind === 'dependency-source'
      && chunk.packageName === packageName).map((chunk) => chunk.chunkId).sort(compareUtf8Bytes),
  }))
  return {
    schemaVersion: 1,
    status,
    reason,
    requiredEvidenceDigest: required.requiredEvidenceDigest,
    requiredChunkCount: required.requiredChunkCount,
    requiredRawContentBytes: required.requiredRawContentBytes,
    allowedSupportingChunkIds: availableText.map((chunk) => chunk.chunkId).sort(compareUtf8Bytes),
    implementationChunkIds,
    dependencyPackages,
  }
}

function buildClaimEvidenceGraph({
  fullChunks,
  availableChunks,
  claims,
  allClaims,
  status,
  reason,
  context = null,
}) {
  const base = context ?? claimEvidenceGraphContext({
    fullChunks,
    availableChunks,
    allClaims,
    status,
    reason,
  })
  const claimBindings = claims.map((claim) => ({
    claimId: claim.claimId,
    line: claim.line,
    claimSourceChunkIds: claimSourceChunks(claim, availableChunks).map((chunk) => chunk.chunkId),
  })).sort((left, right) => compareUtf8Bytes(left.claimId, right.claimId))
  const graph = {
    ...base,
    claimBindings,
  }
  graph.graphDigest = graphDigest(graph)
  return graph
}

function finalizeShard({
  chunks,
  claims,
  claimEvidenceGraph,
  limits,
  identity,
  failOnBudget = true,
  preparedInputReserveBytes = 0,
}) {
  const rawContentBytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)
  const descriptor = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-content-shard',
    identity,
    rawContentBytes,
    chunks,
    claims,
    claimEvidenceGraph,
  }
  const digestMaterial = { ...descriptor, chunks: chunks.map(({ content, ...chunk }) => chunk) }
  descriptor.shardId = sha256(canonical(digestMaterial))
  const promptEnvelope = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-content-shard-prompt',
    shardId: descriptor.shardId,
    identity,
    rawContentBytes,
    chunks,
    claims,
    claimEvidenceGraph,
  }
  const prompt = `${canonical(promptEnvelope)}\n`
  const promptBytes = Buffer.byteLength(prompt)
  const estimatedTokens = Math.ceil(promptBytes / limits.bytesPerEstimatedToken)
  descriptor.batchDigest = sha256(prompt)
  const withinBudget = rawContentBytes <= limits.maxRawContentBytesPerShard
    && chunks.length <= limits.maxChunksPerShard
    && claims.length <= limits.maxClaimsPerShard
    && promptBytes + preparedInputReserveBytes <= limits.maxPromptBytesPerShard
    && Math.ceil(
      (promptBytes + preparedInputReserveBytes) / limits.bytesPerEstimatedToken,
    ) <= limits.maxEstimatedTokensPerShard
  if (!withinBudget) {
    if (failOnBudget) fail(`content shard exceeds canonical context budget:${descriptor.shardId}`)
    return null
  }
  return { ...descriptor, prompt, promptBytes, estimatedTokens }
}

function componentA1bPreparedReviewWorkUnit(
  shard,
  claimInventoryDigest,
  limits,
  reviewGraphPolicy,
) {
  const chunkRefs = shard.chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    sourceId: chunk.sourceId,
    path: chunk.path,
    mediaType: chunk.mediaType,
    offset: chunk.offset,
    bytes: chunk.bytes,
    lineStart: chunk.lineStart,
    lineEnd: chunk.lineEnd,
    contentSha256: chunk.contentSha256,
  }))
  const reviewSemantics = buildShardReviewSemantics(shard, {
    taskKind: 'component-a1b',
    subject: shard.identity.subject,
    claimInventoryDigest,
    judgmentRule: null,
  })
  const shardReference = {
    shardId: shard.shardId,
    chunkRefs,
    claimIds: shard.claims.map((claim) => claim.claimId),
    claimEvidenceGraphDigest: shard.claimEvidenceGraph.graphDigest,
    reviewSemantics,
  }
  const leafIds = chunkRefs.map((chunk) => chunk.chunkId).sort(compareUtf8Bytes)
  const cell = reviewGraphCell(
    shard.claims.length
      ? 'component-claim-review-cell'
      : 'shared-evidence-review-cell',
    taskKey(shard.identity),
    [shardReference],
    shardReference.claimIds,
    leafIds,
  )
  const leaves = new Map(chunkRefs.map((chunk) => [chunk.chunkId, chunk]))
  const unit = reviewGraphWorkUnit(
    shard.claims.length
      ? 'component-claim-review'
      : 'content-addressed-shared-evidence-review',
    [cell],
    leafIds,
    shard.identity.inputArtifactSetDigest,
    leaves,
    reviewGraphPolicy,
  )
  return {
    fits: reviewGraphWorkUnitFits(unit, limits),
    cell,
    unit,
  }
}

function groupChunks(chunks, limits) {
  const groups = []
  let current = []
  let rawBytes = 0
  const flush = () => {
    if (!current.length) return
    groups.push({ chunks: current, claims: [] })
    current = []
    rawBytes = 0
  }
  for (const chunk of chunks) {
    if (current.length && (rawBytes + chunk.bytes > limits.maxRawContentBytesPerShard
      || current.length + 1 > limits.maxChunksPerShard)) flush()
    current.push(chunk)
    rawBytes += chunk.bytes
  }
  flush()
  return groups
}

function packChunks(chunks, limits, identity, claims = []) {
  const groups = groupChunks(chunks, limits)
  for (const claim of claims) {
    const sourceChunkIds = new Set(claimSourceChunks(claim, chunks).map((chunk) => chunk.chunkId))
    const group = groups.find((candidate) => candidate.chunks.some((chunk) => sourceChunkIds.has(chunk.chunkId)))
    if (!group) fail(`claim cannot be assigned to exactly one bounded source shard:${claim.claimId}`)
    group.claims.push(claim)
  }
  const packed = []
  for (const group of groups) {
    group.claims.sort((left, right) => compareUtf8Bytes(left.claimId, right.claimId))
    const batches = []
    for (let index = 0; index < Math.max(1, group.claims.length); index += limits.maxClaimsPerShard) {
      batches.push(group.claims.slice(index, index + limits.maxClaimsPerShard))
    }
    for (const batch of batches) packed.push(finalizeShard({
      chunks: group.chunks,
      claims: batch,
      claimEvidenceGraph: null,
      limits,
      identity,
    }))
  }
  return packed
}

function packA1bClaimBatches({
  chunks,
  orderedClaims,
  fullChunks,
  allClaims,
  status,
  reason,
  limits,
  identity,
  claimInventoryDigest,
  requirements = null,
  preparedInputReserveBytes = 0,
  reviewGraphPolicy,
  failOnUnfit = true,
}) {
  const packed = []
  const context = claimEvidenceGraphContext({
    fullChunks,
    availableChunks: chunks,
    allClaims,
    status,
    reason,
    requirements,
  })
  const build = (claims, failOnBudget = true) => {
    const claimEvidenceGraph = buildClaimEvidenceGraph({
      fullChunks,
      availableChunks: chunks,
      claims,
      allClaims,
      status,
      reason,
      context,
    })
    const shard = finalizeShard({
      chunks,
      claims,
      claimEvidenceGraph,
      limits,
      identity,
      failOnBudget,
      preparedInputReserveBytes,
    })
    if (!shard) return null
    return componentA1bPreparedReviewWorkUnit(
      shard,
      claimInventoryDigest,
      limits,
      reviewGraphPolicy,
    ).fits
      ? shard
      : null
  }
  if (orderedClaims.length === 0) {
    const shard = build([], failOnUnfit)
    return shard ? [shard] : null
  }
  for (let cursor = 0; cursor < orderedClaims.length;) {
    const maximum = Math.min(limits.maxClaimsPerShard, orderedClaims.length - cursor)
    let low = 1
    let high = maximum
    let best = null
    while (low <= high) {
      const size = Math.floor((low + high) / 2)
      const shard = build(orderedClaims.slice(cursor, cursor + size), false)
      if (shard) {
        best = shard
        low = size + 1
      } else high = size - 1
    }
    if (!best) {
      if (!failOnUnfit) return null
      fail(`single A1b claim cannot fit the canonical graph-prepared context budget:${orderedClaims[cursor].claimId}`)
    }
    packed.push(best)
    cursor += best.claims.length
  }
  return packed
}

function packA1bPreparedChunkGroup({
  chunks,
  orderedClaims,
  fullChunks,
  allClaims,
  limits,
  identity,
  claimInventoryDigest,
  requirements,
  preparedInputReserveBytes,
  reviewGraphPolicy,
}) {
  const packed = packA1bClaimBatches({
    chunks,
    orderedClaims,
    fullChunks,
    allClaims,
    status: 'unverifiable-context-budget',
    reason: 'complete-claim-evidence-corpus-exceeds-one-canonical-shard',
    limits,
    identity,
    claimInventoryDigest,
    requirements,
    preparedInputReserveBytes,
    reviewGraphPolicy,
    failOnUnfit: false,
  })
  if (packed) return packed
  if (chunks.length <= 1) {
    fail(`single A1b evidence leaf cannot fit the canonical graph-prepared context budget:${chunks[0]?.chunkId ?? 'missing'}`)
  }
  const midpoint = Math.ceil(chunks.length / 2)
  const childChunks = [chunks.slice(0, midpoint), chunks.slice(midpoint)]
  const childChunkIds = childChunks.map((group) => new Set(
    group.map((chunk) => chunk.chunkId),
  ))
  const childClaims = childChunks.map(() => [])
  for (const claim of orderedClaims) {
    const sourceChunks = claimSourceChunks(claim, chunks)
    const owner = childChunkIds.findIndex((ids) => (
      sourceChunks.some((chunk) => ids.has(chunk.chunkId))
    ))
    if (owner < 0) {
      fail(`A1b prepared chunk refinement loses claim ownership:${claim.claimId}`)
    }
    childClaims[owner].push(claim)
  }
  return childChunks.flatMap((group, ordinal) => packA1bPreparedChunkGroup({
    chunks: group,
    orderedClaims: childClaims[ordinal],
    fullChunks,
    allClaims,
    limits,
    identity,
    claimInventoryDigest,
    requirements,
    preparedInputReserveBytes,
    reviewGraphPolicy,
  }))
}

function packA1bChunks(
  chunks,
  limits,
  identity,
  claims,
  dependencySourceInventory,
  claimInventoryDigest,
  preparedInputReserveBytes = 0,
  reviewGraphPolicy,
) {
  const orderedClaims = [...claims].sort((left, right) => compareUtf8Bytes(left.claimId, right.claimId))
  const requirements = claimEvidenceRequirements(chunks, orderedClaims)
  const sourceTrusted = dependencySourceInventory.status === 'verified'
  const completeCorpusFits = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0) <= limits.maxRawContentBytesPerShard
    && chunks.length <= limits.maxChunksPerShard
  const wholeCorpusStatus = sourceTrusted ? 'self-contained' : 'unverifiable-source-trust'
  const wholeCorpusReason = sourceTrusted ? null : 'dependency-source-inventory-is-not-verified'
  if (completeCorpusFits) {
    const packed = packA1bClaimBatches({
      chunks,
      orderedClaims,
      fullChunks: chunks,
      allClaims: orderedClaims,
      status: wholeCorpusStatus,
      reason: wholeCorpusReason,
      limits,
      identity,
      claimInventoryDigest,
      requirements,
      preparedInputReserveBytes,
      reviewGraphPolicy,
      failOnUnfit: false,
    })
    if (packed
      && packed.flatMap((shard) => shard.claims).length === orderedClaims.length) {
      return packed
    }
  }

  const groups = groupChunks(chunks, limits)
  for (const claim of orderedClaims) {
    const sourceIds = new Set(claimSourceChunks(claim, chunks).map((chunk) => chunk.chunkId))
    const group = groups.find((candidate) => candidate.chunks.some((chunk) => sourceIds.has(chunk.chunkId)))
    if (!group) fail(`A1b oversized claim has no canonical source group:${claim.claimId}`)
    group.claims.push(claim)
  }
  const packed = []
  for (const group of groups) {
    group.claims.sort((left, right) => compareUtf8Bytes(left.claimId, right.claimId))
    packed.push(...packA1bPreparedChunkGroup({
      chunks: group.chunks,
      orderedClaims: group.claims,
      fullChunks: chunks,
      allClaims: orderedClaims,
      limits,
      identity,
      claimInventoryDigest,
      requirements,
      preparedInputReserveBytes,
      reviewGraphPolicy,
    }))
  }
  return packed
}

function shardSetDigest(identity, inputArtifactSet, shards) {
  return sha256(canonical({
    identity,
    inputArtifactSet,
    shards: shards.map((shard) => ({ shardId: shard.shardId, batchDigest: shard.batchDigest })),
  }))
}

function dispatchEstimateForShards(shards, costUnitPromptBytes) {
  if (!Array.isArray(shards) || shards.length === 0 || !Number.isSafeInteger(costUnitPromptBytes) || costUnitPromptBytes <= 0) {
    fail('dispatch estimate inputs are invalid')
  }
  const uniqueChunks = new Map()
  let costUnits = 0
  for (const shard of shards) {
    if (!shard || !Number.isSafeInteger(shard.promptBytes) || shard.promptBytes <= 0 || !Array.isArray(shard.chunks)) {
      fail('dispatch estimate encountered a malformed shard')
    }
    costUnits += Math.max(1, Math.ceil(shard.promptBytes / costUnitPromptBytes))
    for (const chunk of shard.chunks) {
      const previous = uniqueChunks.get(chunk.chunkId)
      if (previous && canonicalDigest(previous) !== canonicalDigest(chunk)) {
        fail(`dispatch estimate encountered a substituted duplicate chunk:${chunk.chunkId}`)
      }
      uniqueChunks.set(chunk.chunkId, chunk)
    }
  }
  return {
    totalSourceBytes: [...uniqueChunks.values()].reduce((sum, chunk) => sum + chunk.bytes, 0),
    shardCount: shards.length,
    providerCalls: shards.length,
    costUnits,
  }
}

function enforceDispatchBudget(estimate, budget, label) {
  exactKeys(budget, ['maxTotalSourceBytes', 'maxShardCount', 'maxProviderCalls', 'maxCostUnits'], `${label} budget`)
  const pairs = [
    ['totalSourceBytes', 'maxTotalSourceBytes'],
    ['shardCount', 'maxShardCount'],
    ['providerCalls', 'maxProviderCalls'],
    ['costUnits', 'maxCostUnits'],
  ]
  const exceeded = pairs.filter(([observed, maximum]) => estimate[observed] > budget[maximum])
  if (exceeded.length) {
    fail(`${label} pre-dispatch budget exceeded without sampling:${exceeded
      .map(([observed, maximum]) => `${observed}=${estimate[observed]}>${budget[maximum]}`).join(',')}`)
  }
}

const BROKER_TASK_DESCRIPTOR_KEYS = [
  'schemaVersion', 'evidenceKind', 'identity', 'inputArtifactSetDigest', 'shardSetDigest',
  'claimInventoryDigest', 'shardCount', 'shards', 'estimate', 'descriptorDigest',
]
const BROKER_SHARD_REFERENCE_KEYS = [
  'ordinal', 'shardId', 'batchDigest', 'promptBytes', 'estimatedTokens',
  'rawContentBytes', 'chunkRefs', 'claimIds', 'claimEvidenceGraphDigest',
  'reviewSemantics',
]
const BROKER_CHUNK_REFERENCE_KEYS = [
  'chunkId', 'sourceId', 'path', 'mediaType', 'offset', 'bytes',
  'lineStart', 'lineEnd', 'contentSha256',
]

function taskKey(identity) {
  return `${identity.taskKind}:${String(identity.subject)}`
}

function compareTaskDescriptors(left, right) {
  if (left.identity.taskKind !== right.identity.taskKind) {
    return left.identity.taskKind === 'judgment' ? -1 : 1
  }
  if (left.identity.taskKind === 'judgment'
    && Number.isSafeInteger(left.identity.subject)
    && Number.isSafeInteger(right.identity.subject)) {
    return left.identity.subject - right.identity.subject
  }
  return compareUtf8Bytes(String(left.identity.subject), String(right.identity.subject))
}

function descriptorProjection(descriptor) {
  const { descriptorDigest, ...projection } = descriptor
  return projection
}

function reviewSemanticsProjection(reviewSemantics) {
  const { semanticsDigest, ...projection } = reviewSemantics
  return projection
}

function buildShardReviewSemantics(shard, {
  taskKind,
  subject,
  claimInventoryDigest,
  judgmentRule,
}) {
  if (taskKind === 'judgment') {
    if (judgmentRule === null) return null
    exactKeys(judgmentRule, ['dim', 'ruleId', 'mechanism'], 'broker judgment review rule')
    if (!Number.isSafeInteger(subject) || judgmentRule.dim !== subject
      || judgmentRule.ruleId !== `DS-DIM-${String(subject).padStart(3, '0')}`
      || typeof judgmentRule.mechanism !== 'string' || !judgmentRule.mechanism.trim()) {
      fail(`broker judgment review rule is invalid:${String(subject)}`)
    }
    const projection = {
      schemaVersion: 1,
      semanticsKind: 'judgment-rule-review',
      rule: structuredClone(judgmentRule),
    }
    return { ...projection, semanticsDigest: canonicalDigest(projection) }
  }
  if (!SHA256.test(claimInventoryDigest ?? '')
    || !Array.isArray(shard.claims) || !shard.claimEvidenceGraph) {
    fail(`broker A1b review semantics are absent:${String(subject)}`)
  }
  if (shard.claims.length === 0) {
    const sharedRule = {
      ruleId: 'component-a1b-shared-evidence',
      mechanism: 'Review every exact bound evidence leaf for component contract, implementation, dependency, and integrity risks without making an unbound claim verdict.',
    }
    const projection = {
      schemaVersion: 1,
      semanticsKind: 'component-shared-evidence-review',
      claimInventoryDigest,
      parentClaimEvidenceGraphDigest: shard.claimEvidenceGraph.graphDigest,
      leafIds: shard.chunks.map((chunk) => chunk.chunkId).sort(compareUtf8Bytes),
      rule: sharedRule,
    }
    return { ...projection, semanticsDigest: canonicalDigest(projection) }
  }
  const projection = {
    schemaVersion: 1,
    semanticsKind: 'component-claim-evidence-review',
    claimInventoryDigest,
    claims: structuredClone(shard.claims),
    claimEvidenceGraph: structuredClone(shard.claimEvidenceGraph),
  }
  return { ...projection, semanticsDigest: canonicalDigest(projection) }
}

function validateShardReviewSemantics(reviewSemantics, {
  taskKind,
  subject,
  claimInventoryDigest,
  claimEvidenceGraphDigest,
  claimIds,
  chunkRefs,
  allowAbsentJudgment = true,
}) {
  if (reviewSemantics === null) {
    if (taskKind !== 'judgment' || !allowAbsentJudgment) {
      fail(`broker review semantics are absent:${taskKind}:${String(subject)}`)
    }
    return null
  }
  if (!reviewSemantics || typeof reviewSemantics !== 'object' || Array.isArray(reviewSemantics)
    || reviewSemantics.semanticsDigest !== canonicalDigest(
      reviewSemanticsProjection(reviewSemantics),
    )) {
    fail(`broker review semantics are invalid or digest-mismatched:${taskKind}:${String(subject)}`)
  }
  if (taskKind === 'judgment') {
    exactKeys(
      reviewSemantics,
      ['schemaVersion', 'semanticsKind', 'rule', 'semanticsDigest'],
      'broker judgment review semantics',
    )
    exactKeys(reviewSemantics.rule, ['dim', 'ruleId', 'mechanism'], 'broker judgment review rule')
    if (claimEvidenceGraphDigest !== null
      || reviewSemantics.schemaVersion !== 1
      || reviewSemantics.semanticsKind !== 'judgment-rule-review'
      || !Number.isSafeInteger(subject)
      || reviewSemantics.rule.dim !== subject
      || reviewSemantics.rule.ruleId !== `DS-DIM-${String(subject).padStart(3, '0')}`
      || typeof reviewSemantics.rule.mechanism !== 'string'
      || !reviewSemantics.rule.mechanism.trim()) {
      fail(`broker judgment review semantics are invalid:${String(subject)}`)
    }
    return reviewSemantics
  }
  if (claimIds.length === 0) {
    exactKeys(
      reviewSemantics,
      [
        'schemaVersion', 'semanticsKind', 'claimInventoryDigest',
        'parentClaimEvidenceGraphDigest', 'leafIds', 'rule', 'semanticsDigest',
      ],
      'broker A1b shared-evidence review semantics',
    )
    exactKeys(
      reviewSemantics.rule,
      ['ruleId', 'mechanism'],
      'broker A1b shared-evidence review rule',
    )
    const expectedLeafIds = chunkRefs.map((chunk) => chunk.chunkId).sort(compareUtf8Bytes)
    if (reviewSemantics.schemaVersion !== 1
      || reviewSemantics.semanticsKind !== 'component-shared-evidence-review'
      || reviewSemantics.claimInventoryDigest !== claimInventoryDigest
      || reviewSemantics.parentClaimEvidenceGraphDigest !== claimEvidenceGraphDigest
      || canonical(reviewSemantics.leafIds) !== canonical(expectedLeafIds)
      || new Set(reviewSemantics.leafIds).size !== reviewSemantics.leafIds.length
      || reviewSemantics.rule.ruleId !== 'component-a1b-shared-evidence'
      || reviewSemantics.rule.mechanism
        !== 'Review every exact bound evidence leaf for component contract, implementation, dependency, and integrity risks without making an unbound claim verdict.') {
      fail(`broker A1b shared-evidence review semantics are invalid:${String(subject)}`)
    }
    return reviewSemantics
  }
  exactKeys(
    reviewSemantics,
    [
      'schemaVersion', 'semanticsKind', 'claimInventoryDigest', 'claims',
      'claimEvidenceGraph', 'semanticsDigest',
    ],
    'broker A1b review semantics',
  )
  const graph = reviewSemantics.claimEvidenceGraph
  if (reviewSemantics.schemaVersion !== 1
    || reviewSemantics.semanticsKind !== 'component-claim-evidence-review'
    || reviewSemantics.claimInventoryDigest !== claimInventoryDigest
    || !Array.isArray(reviewSemantics.claims)
    || !graph || typeof graph !== 'object' || Array.isArray(graph)
    || graph.graphDigest !== claimEvidenceGraphDigest
    || graph.graphDigest !== graphDigest(graph)) {
    fail(`broker A1b review semantics are invalid:${String(subject)}`)
  }
  const observedClaimIds = reviewSemantics.claims.map((claim) => claim?.claimId)
  for (const claim of reviewSemantics.claims) {
    exactKeys(
      claim,
      [
        'claimId', 'claimClass', 'path', 'line', 'textSha256',
        'supportingSourceSetDigest',
      ],
      'broker A1b exact claim record',
    )
    if (!SHA256.test(claim.claimId ?? '') || claim.claimClass !== 'claim-source-line'
      || typeof claim.path !== 'string' || !claim.path
      || !Number.isSafeInteger(claim.line) || claim.line < 1
      || !SHA256.test(claim.textSha256 ?? '')
      || !SHA256.test(claim.supportingSourceSetDigest ?? '')) {
      fail(`broker A1b exact claim record is invalid:${String(claim?.claimId)}`)
    }
  }
  if (canonical(observedClaimIds) !== canonical(claimIds)
    || new Set(observedClaimIds).size !== observedClaimIds.length
    || !Array.isArray(graph.claimBindings)
    || canonical(graph.claimBindings.map((binding) => binding?.claimId))
      !== canonical([...claimIds].sort(compareUtf8Bytes))) {
    fail(`broker A1b review semantics lose exact claim coverage:${String(subject)}`)
  }
  const allowedLeaves = new Set(chunkRefs.map((chunk) => chunk.chunkId))
  const semanticLeafIds = [
    ...(graph.allowedSupportingChunkIds ?? []),
    ...(graph.implementationChunkIds ?? []),
    ...(graph.dependencyPackages ?? []).flatMap((dependency) => dependency?.chunkIds ?? []),
    ...(graph.claimBindings ?? []).flatMap((binding) => binding?.claimSourceChunkIds ?? []),
  ]
  if (semanticLeafIds.some((leafId) => !allowedLeaves.has(leafId))) {
    fail(`broker A1b review semantics cite evidence outside the shard:${String(subject)}`)
  }
  return reviewSemantics
}

export function buildBrokerTaskDispatchDescriptor(shardSet, {
  planState,
  claimInventoryDigest = null,
  judgmentRule = null,
} = {}) {
  const state = planState ?? loadModelEvidenceBrokerPlan()
  const estimate = validateBrokerShardSetEnvelope(shardSet, { planState: state })
  if ((shardSet.identity.taskKind === 'judgment' && claimInventoryDigest !== null)
    || (shardSet.identity.taskKind === 'component-a1b' && !SHA256.test(claimInventoryDigest ?? ''))) {
    fail('broker task dispatch descriptor claim inventory identity is invalid')
  }
  const projection = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-model-task-dispatch-descriptor',
    identity: structuredClone(shardSet.identity),
    inputArtifactSetDigest: shardSet.inputArtifactSet.artifactSetDigest,
    shardSetDigest: shardSet.shardSetDigest,
    claimInventoryDigest,
    shardCount: shardSet.shardCount,
    shards: shardSet.shards.map((shard, ordinal) => ({
      ordinal,
      shardId: shard.shardId,
      batchDigest: shard.batchDigest,
      promptBytes: shard.promptBytes,
      estimatedTokens: shard.estimatedTokens,
      rawContentBytes: shard.rawContentBytes,
      chunkRefs: shard.chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        sourceId: chunk.sourceId,
        path: chunk.path,
        mediaType: chunk.mediaType,
        offset: chunk.offset,
        bytes: chunk.bytes,
        lineStart: chunk.lineStart,
        lineEnd: chunk.lineEnd,
        contentSha256: chunk.contentSha256,
      })),
      claimIds: shard.claims.map((claim) => claim.claimId),
      claimEvidenceGraphDigest: shard.claimEvidenceGraph?.graphDigest ?? null,
      reviewSemantics: buildShardReviewSemantics(shard, {
        taskKind: shardSet.identity.taskKind,
        subject: shardSet.identity.subject,
        claimInventoryDigest,
        judgmentRule,
      }),
    })),
    estimate,
  }
  return { ...projection, descriptorDigest: canonicalDigest(projection) }
}

export function validateBrokerTaskDispatchDescriptor(descriptor, { planState } = {}) {
  const state = planState ?? loadModelEvidenceBrokerPlan()
  exactKeys(descriptor, BROKER_TASK_DESCRIPTOR_KEYS, 'broker task dispatch descriptor')
  exactKeys(descriptor.identity, SHARD_IDENTITY_KEYS, 'broker task dispatch descriptor identity')
  if (descriptor.schemaVersion !== 1
    || descriptor.evidenceKind !== 'deep-audit-model-task-dispatch-descriptor'
    || descriptor.identity.brokerPlanDigest !== state.planDigest
    || descriptor.identity.resultSchemaSha256 !== state.resultSchemaSha256
    || descriptor.inputArtifactSetDigest !== descriptor.identity.inputArtifactSetDigest
    || (descriptor.identity.taskKind === 'judgment' && descriptor.claimInventoryDigest !== null)
    || (descriptor.identity.taskKind === 'component-a1b' && !SHA256.test(descriptor.claimInventoryDigest ?? ''))
    || descriptor.shardCount !== descriptor.shards?.length
    || descriptor.shardCount <= 0
    || descriptor.descriptorDigest !== canonicalDigest(descriptorProjection(descriptor))) {
    fail('broker task dispatch descriptor identity/content address is invalid')
  }
  const seenShards = new Set()
  const seenClaims = new Set()
  for (const [ordinal, shard] of descriptor.shards.entries()) {
    exactKeys(shard, BROKER_SHARD_REFERENCE_KEYS, 'broker task dispatch shard reference')
    if (shard.ordinal !== ordinal || !SHA256.test(shard.shardId ?? '')
      || !SHA256.test(shard.batchDigest ?? '') || seenShards.has(shard.shardId)
      || !Number.isSafeInteger(shard.promptBytes) || shard.promptBytes <= 0
      || shard.promptBytes > state.plan.limits.maxPromptBytesPerShard
      || !Number.isSafeInteger(shard.estimatedTokens) || shard.estimatedTokens <= 0
      || shard.estimatedTokens > state.plan.limits.maxEstimatedTokensPerShard
      || !Number.isSafeInteger(shard.rawContentBytes) || shard.rawContentBytes < 0
      || !Array.isArray(shard.chunkRefs) || shard.chunkRefs.length === 0
      || !Array.isArray(shard.claimIds)
      || (descriptor.identity.taskKind === 'judgment'
        && shard.claimEvidenceGraphDigest !== null)
      || (descriptor.identity.taskKind === 'component-a1b'
        && !SHA256.test(shard.claimEvidenceGraphDigest ?? ''))) {
      fail(`broker task dispatch shard reference is invalid:${String(shard?.shardId)}`)
    }
    seenShards.add(shard.shardId)
    for (const chunk of shard.chunkRefs) {
      exactKeys(chunk, BROKER_CHUNK_REFERENCE_KEYS, 'broker task dispatch chunk reference')
      if (!SHA256.test(chunk.chunkId ?? '') || !SHA256.test(chunk.sourceId ?? '')
        || !SHA256.test(chunk.contentSha256 ?? '') || typeof chunk.path !== 'string' || !chunk.path
        || !['text', 'binary'].includes(chunk.mediaType)
        || !Number.isSafeInteger(chunk.offset) || chunk.offset < 0
        || !Number.isSafeInteger(chunk.bytes) || chunk.bytes < 0
        || (chunk.mediaType === 'text'
          && !(
            (chunk.bytes === 0 && chunk.lineStart === null && chunk.lineEnd === null)
            || (chunk.bytes > 0
              && Number.isSafeInteger(chunk.lineStart)
              && Number.isSafeInteger(chunk.lineEnd)
              && chunk.lineStart >= 1
              && chunk.lineEnd >= chunk.lineStart)
          ))
        || (chunk.mediaType === 'binary'
          && (chunk.lineStart !== null || chunk.lineEnd !== null))) {
        fail(`broker task dispatch chunk reference is invalid:${String(chunk?.chunkId)}`)
      }
    }
    for (const claimId of shard.claimIds) {
      if (!SHA256.test(claimId ?? '') || seenClaims.has(claimId)) {
        fail(`broker task dispatch claim coverage is duplicate or invalid:${String(claimId)}`)
      }
      seenClaims.add(claimId)
    }
    validateShardReviewSemantics(shard.reviewSemantics, {
      taskKind: descriptor.identity.taskKind,
      subject: descriptor.identity.subject,
      claimInventoryDigest: descriptor.claimInventoryDigest,
      claimEvidenceGraphDigest: shard.claimEvidenceGraphDigest,
      claimIds: shard.claimIds,
      chunkRefs: shard.chunkRefs,
    })
  }
  const observedEstimate = dispatchEstimateForShardReferences(
    descriptor.shards,
    state.plan.budgets.costUnitPromptBytes,
  )
  if (canonical(observedEstimate) !== canonical(descriptor.estimate)) {
    fail('broker task dispatch descriptor estimate is false')
  }
  enforceDispatchBudget(observedEstimate, state.plan.budgets.wholeTask, `whole task ${taskKey(descriptor.identity)}`)
  return descriptor
}

export function exportBrokerShardCarrier(shard) {
  if (!shard || typeof shard !== 'object' || Array.isArray(shard)
    || !Array.isArray(shard.chunks) || shard.chunks.length === 0
    || typeof shard.prompt !== 'string' || !SHA256.test(shard.shardId ?? '')
    || !SHA256.test(shard.batchDigest ?? '')) {
    fail('broker shard carrier export input is invalid')
  }
  const blobsByDigest = new Map()
  const chunks = shard.chunks.map((chunk) => {
    const bytes = Buffer.from(chunk.content, 'base64')
    if (bytes.toString('base64') !== chunk.content || bytes.length !== chunk.bytes
      || sha256(bytes) !== chunk.contentSha256) {
      fail(`broker shard carrier chunk content is invalid:${String(chunk.chunkId)}`)
    }
    const previous = blobsByDigest.get(chunk.contentSha256)
    if (previous && previous.content !== chunk.content) {
      fail(`broker shard carrier substitutes a content digest:${chunk.contentSha256}`)
    }
    if (!previous) {
      blobsByDigest.set(chunk.contentSha256, {
        sha256: chunk.contentSha256,
        bytes: chunk.bytes,
        encoding: 'base64',
        content: chunk.content,
      })
    }
    const { content, ...reference } = chunk
    return reference
  })
  const descriptorProjection = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-content-shard-carrier-descriptor',
    identity: structuredClone(shard.identity),
    rawContentBytes: shard.rawContentBytes,
    chunks,
    claims: structuredClone(shard.claims),
    claimEvidenceGraph: structuredClone(shard.claimEvidenceGraph),
    shardId: shard.shardId,
    batchDigest: shard.batchDigest,
    promptBytes: shard.promptBytes,
    estimatedTokens: shard.estimatedTokens,
  }
  const descriptor = {
    ...descriptorProjection,
    descriptorDigest: sha256(canonical(descriptorProjection)),
  }
  const blobRefs = [...blobsByDigest.values()]
    .map(({ content, ...reference }) => reference)
    .sort((left, right) => compareUtf8Bytes(left.sha256, right.sha256))
  const carrierProjection = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-content-addressed-shard-carrier',
    descriptor,
    blobRefs,
  }
  return {
    carrier: {
      ...carrierProjection,
      carrierDigest: sha256(canonical(carrierProjection)),
    },
    blobs: [...blobsByDigest.values()].sort((left, right) => compareUtf8Bytes(left.sha256, right.sha256)),
  }
}

function reviewGraphMinimalLeafReference(chunk) {
  return {
    chunkId: chunk.chunkId,
    sourceId: chunk.sourceId,
    path: chunk.path,
    mediaType: chunk.mediaType,
    offset: chunk.offset,
    bytes: chunk.bytes,
    lineStart: chunk.lineStart,
    lineEnd: chunk.lineEnd,
    contentSha256: chunk.contentSha256,
  }
}

function reviewGraphCarrierBinding(unit, minimalLeafReferences, blobRefs) {
  const projection = {
    leafSetDigest: sha256(canonical(unit.leafIds)),
    minimalLeafReferenceSetDigest: sha256(canonical(minimalLeafReferences)),
    blobSetDigest: sha256(canonical(blobRefs)),
    rawContentBytes: unit.rawContentBytes,
    reviewSemanticsSetDigest: unit.reviewSemanticsSetDigest,
  }
  return { ...projection, bindingDigest: sha256(canonical(projection)) }
}

export function exportBrokerReviewGraphWorkCarrier({
  graph,
  contentSet,
  requestDigest,
  workUnit,
  chunks,
  expectedBinding,
} = {}) {
  if (graph?.reviewGraphDigest === undefined || contentSet?.contentSetDigest === undefined
    || !SHA256.test(requestDigest ?? '') || !workUnit || !Array.isArray(chunks)) {
    fail('review graph work carrier export inputs are invalid')
  }
  const byLeaf = new Map()
  for (const chunk of chunks) {
    exactKeys(chunk, CHUNK_KEYS, 'review graph work carrier chunk')
    if (byLeaf.has(chunk.chunkId)) fail(`review graph work carrier repeats a leaf:${chunk.chunkId}`)
    const bytes = Buffer.from(chunk.content, 'base64')
    const { content, chunkId, ...chunkIdentity } = chunk
    if (bytes.toString('base64') !== content || bytes.length !== chunk.bytes
      || sha256(bytes) !== chunk.contentSha256
      || chunkId !== sha256(canonical(chunkIdentity))) {
      fail(`review graph work carrier chunk identity/content is invalid:${chunk.chunkId}`)
    }
    byLeaf.set(chunk.chunkId, chunk)
  }
  const orderedChunks = workUnit.leafIds.map((leafId) => {
    const chunk = byLeaf.get(leafId)
    if (!chunk) fail(`review graph work carrier omits an exact leaf:${leafId}`)
    return chunk
  })
  if (byLeaf.size !== orderedChunks.length) {
    fail('review graph work carrier contains a leaf outside the work unit')
  }
  const minimalLeafReferences = orderedChunks.map(reviewGraphMinimalLeafReference)
  const leafReferences = orderedChunks.map(({ content, ...reference }) => reference)
  for (const reference of leafReferences) {
    const referenceBytes = Buffer.byteLength(canonical(reference))
    if (referenceBytes > workUnit.maxEvidenceReferenceBytesPerLeaf) {
      fail(`review graph work carrier leaf reference exceeds its canonical byte budget:${reference.chunkId}:${referenceBytes}>${workUnit.maxEvidenceReferenceBytesPerLeaf}`)
    }
  }
  const blobsByDigest = new Map()
  for (const chunk of orderedChunks) {
    const blob = {
      sha256: chunk.contentSha256,
      bytes: chunk.bytes,
      encoding: 'base64',
      content: chunk.content,
    }
    const previous = blobsByDigest.get(blob.sha256)
    if (previous && canonical(previous) !== canonical(blob)) {
      fail(`review graph work carrier substitutes blob content:${blob.sha256}`)
    }
    if (!previous) blobsByDigest.set(blob.sha256, blob)
  }
  const blobs = [...blobsByDigest.values()]
    .sort((left, right) => compareUtf8Bytes(left.sha256, right.sha256))
  const blobRefs = blobs.map(({ content, ...reference }) => reference)
  const binding = reviewGraphCarrierBinding(workUnit, minimalLeafReferences, blobRefs)
  if (expectedBinding && canonical(binding) !== canonical(expectedBinding)) {
    fail('review graph work carrier differs from its request evidence binding')
  }
  if (orderedChunks.reduce((sum, chunk) => sum + chunk.bytes, 0)
      !== workUnit.rawContentBytes) {
    fail(`review graph work carrier raw byte closure is false:${workUnit.workUnitId}`)
  }
  const projection = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-content-addressed-review-graph-work-carrier',
    protocol: graph.protocol,
    protocolExtension: graph.protocolExtension,
    reviewGraphDigest: graph.reviewGraphDigest,
    contentSetDigest: contentSet.contentSetDigest,
    requestDigest,
    unitId: workUnit.workUnitId,
    unitDigest: workUnit.workUnitDigest,
    leafIds: [...workUnit.leafIds],
    leafReferences,
    fullLeafReferenceSetDigest: sha256(canonical(leafReferences)),
    blobRefs,
    binding,
  }
  return {
    carrier: { ...projection, carrierDigest: sha256(canonical(projection)) },
    blobs,
  }
}

export function materializeBrokerReviewGraphWorkCarrier({
  graph,
  contentSet,
  requestDigest,
  workUnit,
  carrier,
  blobs,
  expectedBinding,
} = {}) {
  exactKeys(carrier, [
    'schemaVersion', 'evidenceKind', 'protocol', 'protocolExtension',
    'reviewGraphDigest', 'contentSetDigest', 'requestDigest', 'unitId', 'unitDigest',
    'leafIds', 'leafReferences', 'fullLeafReferenceSetDigest', 'blobRefs', 'binding',
    'carrierDigest',
  ], 'review graph work carrier')
  const { carrierDigest, ...projection } = carrier
  if (carrier.schemaVersion !== 1
    || carrier.evidenceKind !== 'deep-audit-content-addressed-review-graph-work-carrier'
    || carrier.protocol !== graph?.protocol
    || carrier.protocolExtension !== graph?.protocolExtension
    || carrier.reviewGraphDigest !== graph?.reviewGraphDigest
    || carrier.contentSetDigest !== contentSet?.contentSetDigest
    || carrier.requestDigest !== requestDigest
    || carrier.unitId !== workUnit?.workUnitId
    || carrier.unitDigest !== workUnit?.workUnitDigest
    || canonical(carrier.leafIds) !== canonical(workUnit?.leafIds)
    || !Array.isArray(carrier.leafReferences) || !Array.isArray(carrier.blobRefs)
    || carrier.fullLeafReferenceSetDigest !== canonicalDigest(carrier.leafReferences)
    || carrierDigest !== canonicalDigest(projection)) {
    fail('review graph work carrier is stale, substituted, foreign, or digest-mismatched')
  }
  const minimalLeafReferences = carrier.leafReferences.map((reference) => {
    exactKeys(reference, CHUNK_KEYS.filter((key) => key !== 'content'), 'review graph work carrier leaf reference')
    const referenceBytes = Buffer.byteLength(canonical(reference))
    if (referenceBytes > workUnit.maxEvidenceReferenceBytesPerLeaf) {
      fail(`review graph work carrier leaf reference exceeds its canonical byte budget:${reference.chunkId}:${referenceBytes}>${workUnit.maxEvidenceReferenceBytesPerLeaf}`)
    }
    return reviewGraphMinimalLeafReference(reference)
  })
  const seenBlobRefs = new Set()
  for (const reference of carrier.blobRefs) {
    exactKeys(reference, ['sha256', 'bytes', 'encoding'], 'review graph work carrier blob reference')
    if (!SHA256.test(reference.sha256 ?? '')
      || !Number.isSafeInteger(reference.bytes) || reference.bytes < 0
      || reference.encoding !== 'base64'
      || seenBlobRefs.has(reference.sha256)) {
      fail(`review graph work carrier blob reference is invalid or duplicate:${String(reference?.sha256)}`)
    }
    seenBlobRefs.add(reference.sha256)
  }
  const expectedCarrierBinding = reviewGraphCarrierBinding(
    workUnit,
    minimalLeafReferences,
    carrier.blobRefs,
  )
  if (canonical(carrier.binding) !== canonical(expectedCarrierBinding)
    || (expectedBinding && canonical(carrier.binding) !== canonical(expectedBinding))) {
    fail('review graph work carrier evidence binding is stale or substituted')
  }
  const supplied = new Map()
  for (const blob of blobs ?? []) {
    exactKeys(blob, ['sha256', 'bytes', 'encoding', 'content'], 'review graph work carrier blob')
    const bytes = Buffer.from(blob.content, 'base64')
    if (blob.encoding !== 'base64' || bytes.toString('base64') !== blob.content
      || bytes.length !== blob.bytes || sha256(bytes) !== blob.sha256
      || supplied.has(blob.sha256)) {
      fail(`review graph work carrier blob is invalid, duplicate, or substituted:${blob.sha256}`)
    }
    supplied.set(blob.sha256, blob)
  }
  if (canonical([...supplied.keys()].sort(compareUtf8Bytes))
      !== canonical(carrier.blobRefs.map((ref) => ref.sha256))
    || canonical(carrier.blobRefs) !== canonical(
      [...carrier.blobRefs].sort((left, right) => compareUtf8Bytes(left.sha256, right.sha256)),
    )) {
    fail('review graph work carrier blobs are missing, extra, duplicate, or reordered')
  }
  const chunks = carrier.leafReferences.map((reference, index) => {
    const blob = supplied.get(reference.contentSha256)
    if (!blob || blob.bytes !== reference.bytes) {
      fail(`review graph work carrier leaf lacks its exact content blob:${reference.chunkId}`)
    }
    const chunk = { ...reference, content: blob.content }
    const { content, chunkId, ...chunkIdentity } = chunk
    if (chunkId !== sha256(canonical(chunkIdentity))
      || carrier.leafIds[index] !== chunkId) {
      fail(`review graph work carrier leaf identity is invalid:${chunkId}`)
    }
    return chunk
  })
  if (chunks.reduce((sum, chunk) => sum + chunk.bytes, 0) !== workUnit.rawContentBytes) {
    fail('review graph work carrier materialized byte closure is false')
  }
  return chunks
}

function reviewGraphBatchCarrierBinding(workUnits, minimalLeafReferences, blobRefs) {
  if (!Array.isArray(workUnits) || workUnits.length === 0) {
    fail('review graph batch carrier requires at least one canonical work unit')
  }
  const referenceByLeaf = new Map(
    minimalLeafReferences.map((reference) => [reference.chunkId, reference]),
  )
  const blobRefByDigest = new Map(blobRefs.map((reference) => [reference.sha256, reference]))
  const memberBindings = workUnits.map((unit) => {
    const memberLeafReferences = unit.leafIds.map((leafId) => {
      const reference = referenceByLeaf.get(leafId)
      if (!reference) {
        fail(`review graph batch carrier omits a member leaf reference:${unit.workUnitId}:${leafId}`)
      }
      return reference
    })
    const memberBlobRefs = [...new Map(memberLeafReferences.map((reference) => {
      const blobRef = blobRefByDigest.get(reference.contentSha256)
      if (!blobRef) {
        fail(`review graph batch carrier omits a member content blob:${unit.workUnitId}:${reference.contentSha256}`)
      }
      return [blobRef.sha256, blobRef]
    })).values()].sort((left, right) => compareUtf8Bytes(left.sha256, right.sha256))
    return {
      unitId: unit.workUnitId,
      unitDigest: unit.workUnitDigest,
      binding: reviewGraphCarrierBinding(unit, memberLeafReferences, memberBlobRefs),
    }
  })
  const leafIds = minimalLeafReferences.map((reference) => reference.chunkId)
  const projection = {
    leafSetDigest: sha256(canonical(leafIds)),
    minimalLeafReferenceSetDigest: sha256(canonical(minimalLeafReferences)),
    blobSetDigest: sha256(canonical(blobRefs)),
    rawContentBytes: minimalLeafReferences.reduce(
      (sum, reference) => sum + reference.bytes,
      0,
    ),
    memberBindingSetDigest: sha256(canonical(memberBindings)),
    memberBindings,
  }
  return { ...projection, bindingDigest: sha256(canonical(projection)) }
}

/**
 * Exports one physical, content-addressed carrier for an ordered provider
 * request batch. Canonical review work units remain independent; identical
 * evidence bytes are present once in the batch CAS and each member retains its
 * own exact leaf/result binding.
 */
export function exportBrokerReviewGraphBatchCarrier({
  graph,
  contentSet,
  requestDigest,
  requestBatch,
  workUnits,
  chunks,
  expectedBinding,
} = {}) {
  if (graph?.reviewGraphDigest === undefined || contentSet?.contentSetDigest === undefined
    || !SHA256.test(requestDigest ?? '') || !requestBatch
    || !SHA256.test(requestBatch.requestBatchId ?? '')
    || !SHA256.test(requestBatch.requestBatchDigest ?? '')
    || !Array.isArray(workUnits) || workUnits.length === 0
    || !Array.isArray(chunks)) {
    fail('review graph batch carrier export inputs are invalid')
  }
  const expectedUnitIds = requestBatch.memberUnitIds
  if (canonical(workUnits.map((unit) => unit.workUnitId)) !== canonical(expectedUnitIds)
    || canonical(workUnits.map((unit) => unit.workUnitDigest))
      !== canonical(requestBatch.memberUnitDigests)) {
    fail('review graph batch carrier work units differ from the frozen request batch')
  }
  const unionLeafIds = [...new Set(workUnits.flatMap((unit) => unit.leafIds))]
    .sort(compareUtf8Bytes)
  if (canonical(unionLeafIds) !== canonical(requestBatch.leafIds)) {
    fail('review graph batch carrier leaf union differs from the frozen request batch')
  }
  const byLeaf = new Map()
  for (const chunk of chunks) {
    exactKeys(chunk, CHUNK_KEYS, 'review graph batch carrier chunk')
    if (byLeaf.has(chunk.chunkId)) {
      fail(`review graph batch carrier repeats a leaf:${chunk.chunkId}`)
    }
    const bytes = Buffer.from(chunk.content, 'base64')
    const { content, chunkId, ...chunkIdentity } = chunk
    if (bytes.toString('base64') !== content || bytes.length !== chunk.bytes
      || sha256(bytes) !== chunk.contentSha256
      || chunkId !== sha256(canonical(chunkIdentity))) {
      fail(`review graph batch carrier chunk identity/content is invalid:${chunk.chunkId}`)
    }
    byLeaf.set(chunk.chunkId, chunk)
  }
  const orderedChunks = unionLeafIds.map((leafId) => {
    const chunk = byLeaf.get(leafId)
    if (!chunk) fail(`review graph batch carrier omits an exact leaf:${leafId}`)
    return chunk
  })
  if (byLeaf.size !== orderedChunks.length) {
    fail('review graph batch carrier contains a leaf outside the request batch')
  }
  const maxReferenceBytes = Math.min(
    ...workUnits.map((unit) => unit.maxEvidenceReferenceBytesPerLeaf),
  )
  const minimalLeafReferences = orderedChunks.map(reviewGraphMinimalLeafReference)
  const leafReferences = orderedChunks.map(({ content, ...reference }) => reference)
  for (const reference of leafReferences) {
    const referenceBytes = Buffer.byteLength(canonical(reference))
    if (referenceBytes > maxReferenceBytes) {
      fail(`review graph batch carrier leaf reference exceeds its canonical byte budget:${reference.chunkId}:${referenceBytes}>${maxReferenceBytes}`)
    }
  }
  const blobsByDigest = new Map()
  for (const chunk of orderedChunks) {
    const blob = {
      sha256: chunk.contentSha256,
      bytes: chunk.bytes,
      encoding: 'base64',
      content: chunk.content,
    }
    const previous = blobsByDigest.get(blob.sha256)
    if (previous && canonical(previous) !== canonical(blob)) {
      fail(`review graph batch carrier substitutes blob content:${blob.sha256}`)
    }
    if (!previous) blobsByDigest.set(blob.sha256, blob)
  }
  const blobs = [...blobsByDigest.values()]
    .sort((left, right) => compareUtf8Bytes(left.sha256, right.sha256))
  const blobRefs = blobs.map(({ content, ...reference }) => reference)
  const binding = reviewGraphBatchCarrierBinding(
    workUnits,
    minimalLeafReferences,
    blobRefs,
  )
  if (expectedBinding && canonical(binding) !== canonical(expectedBinding)) {
    fail('review graph batch carrier differs from its request evidence binding')
  }
  const projection = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-content-addressed-review-graph-batch-carrier',
    protocol: graph.protocol,
    protocolExtension: graph.protocolExtension,
    reviewGraphDigest: graph.reviewGraphDigest,
    contentSetDigest: contentSet.contentSetDigest,
    requestDigest,
    requestBatchId: requestBatch.requestBatchId,
    requestBatchDigest: requestBatch.requestBatchDigest,
    memberUnitIds: [...requestBatch.memberUnitIds],
    memberUnitDigests: [...requestBatch.memberUnitDigests],
    leafIds: unionLeafIds,
    leafReferences,
    fullLeafReferenceSetDigest: sha256(canonical(leafReferences)),
    blobRefs,
    binding,
  }
  return {
    carrier: { ...projection, carrierDigest: sha256(canonical(projection)) },
    blobs,
  }
}

export function materializeBrokerReviewGraphBatchCarrier({
  graph,
  contentSet,
  requestDigest,
  requestBatch,
  workUnits,
  carrier,
  blobs,
  expectedBinding,
} = {}) {
  exactKeys(carrier, [
    'schemaVersion', 'evidenceKind', 'protocol', 'protocolExtension',
    'reviewGraphDigest', 'contentSetDigest', 'requestDigest',
    'requestBatchId', 'requestBatchDigest', 'memberUnitIds', 'memberUnitDigests',
    'leafIds', 'leafReferences', 'fullLeafReferenceSetDigest', 'blobRefs',
    'binding', 'carrierDigest',
  ], 'review graph batch carrier')
  const { carrierDigest, ...projection } = carrier
  if (carrier.schemaVersion !== 1
    || carrier.evidenceKind !== 'deep-audit-content-addressed-review-graph-batch-carrier'
    || carrier.protocol !== graph?.protocol
    || carrier.protocolExtension !== graph?.protocolExtension
    || carrier.reviewGraphDigest !== graph?.reviewGraphDigest
    || carrier.contentSetDigest !== contentSet?.contentSetDigest
    || carrier.requestDigest !== requestDigest
    || carrier.requestBatchId !== requestBatch?.requestBatchId
    || carrier.requestBatchDigest !== requestBatch?.requestBatchDigest
    || canonical(carrier.memberUnitIds) !== canonical(requestBatch?.memberUnitIds)
    || canonical(carrier.memberUnitDigests) !== canonical(requestBatch?.memberUnitDigests)
    || canonical(workUnits?.map((unit) => unit.workUnitId))
      !== canonical(requestBatch?.memberUnitIds)
    || canonical(workUnits?.map((unit) => unit.workUnitDigest))
      !== canonical(requestBatch?.memberUnitDigests)
    || !Array.isArray(carrier.leafReferences) || !Array.isArray(carrier.blobRefs)
    || carrier.fullLeafReferenceSetDigest !== canonicalDigest(carrier.leafReferences)
    || carrierDigest !== canonicalDigest(projection)) {
    fail('review graph batch carrier is stale, substituted, foreign, or digest-mismatched')
  }
  const unionLeafIds = [...new Set(workUnits.flatMap((unit) => unit.leafIds))]
    .sort(compareUtf8Bytes)
  if (canonical(carrier.leafIds) !== canonical(unionLeafIds)
    || canonical(carrier.leafIds) !== canonical(requestBatch.leafIds)) {
    fail('review graph batch carrier leaf union is missing, duplicated, or reordered')
  }
  const maxReferenceBytes = Math.min(
    ...workUnits.map((unit) => unit.maxEvidenceReferenceBytesPerLeaf),
  )
  const minimalLeafReferences = carrier.leafReferences.map((reference) => {
    exactKeys(
      reference,
      CHUNK_KEYS.filter((key) => key !== 'content'),
      'review graph batch carrier leaf reference',
    )
    const referenceBytes = Buffer.byteLength(canonical(reference))
    if (referenceBytes > maxReferenceBytes) {
      fail(`review graph batch carrier leaf reference exceeds its canonical byte budget:${reference.chunkId}:${referenceBytes}>${maxReferenceBytes}`)
    }
    return reviewGraphMinimalLeafReference(reference)
  })
  const seenBlobRefs = new Set()
  for (const reference of carrier.blobRefs) {
    exactKeys(reference, ['sha256', 'bytes', 'encoding'], 'review graph batch carrier blob reference')
    if (!SHA256.test(reference.sha256 ?? '')
      || !Number.isSafeInteger(reference.bytes) || reference.bytes < 0
      || reference.encoding !== 'base64'
      || seenBlobRefs.has(reference.sha256)) {
      fail(`review graph batch carrier blob reference is invalid or duplicate:${String(reference?.sha256)}`)
    }
    seenBlobRefs.add(reference.sha256)
  }
  const expectedCarrierBinding = reviewGraphBatchCarrierBinding(
    workUnits,
    minimalLeafReferences,
    carrier.blobRefs,
  )
  if (canonical(carrier.binding) !== canonical(expectedCarrierBinding)
    || (expectedBinding && canonical(carrier.binding) !== canonical(expectedBinding))) {
    fail('review graph batch carrier evidence binding is stale or substituted')
  }
  const supplied = new Map()
  for (const blob of blobs ?? []) {
    exactKeys(blob, ['sha256', 'bytes', 'encoding', 'content'], 'review graph batch carrier blob')
    const bytes = Buffer.from(blob.content, 'base64')
    if (blob.encoding !== 'base64' || bytes.toString('base64') !== blob.content
      || bytes.length !== blob.bytes || sha256(bytes) !== blob.sha256
      || supplied.has(blob.sha256)) {
      fail(`review graph batch carrier blob is invalid, duplicate, or substituted:${blob.sha256}`)
    }
    supplied.set(blob.sha256, blob)
  }
  if (canonical([...supplied.keys()].sort(compareUtf8Bytes))
      !== canonical(carrier.blobRefs.map((reference) => reference.sha256))
    || canonical(carrier.blobRefs) !== canonical(
      [...carrier.blobRefs].sort((left, right) => compareUtf8Bytes(left.sha256, right.sha256)),
    )) {
    fail('review graph batch carrier blobs are missing, extra, duplicate, or reordered')
  }
  const chunks = carrier.leafReferences.map((reference, index) => {
    const blob = supplied.get(reference.contentSha256)
    if (!blob || blob.bytes !== reference.bytes) {
      fail(`review graph batch carrier leaf lacks its exact content blob:${reference.chunkId}`)
    }
    const chunk = { ...reference, content: blob.content }
    const { content, chunkId, ...chunkIdentity } = chunk
    if (chunkId !== sha256(canonical(chunkIdentity))
      || carrier.leafIds[index] !== chunkId) {
      fail(`review graph batch carrier leaf identity is invalid:${chunkId}`)
    }
    return chunk
  })
  return chunks
}

export function validateBrokerReviewGraphBatchPortablePayloadBudget({
  requestBatch,
  requestEnvelopeBytes,
  resultSchema,
  evidenceCarrier,
  evidenceBlobs,
  capabilityBudget,
} = {}) {
  if (!requestBatch || !capabilityBudget
    || (!Buffer.isBuffer(requestEnvelopeBytes)
      && !(requestEnvelopeBytes instanceof Uint8Array))
    || !resultSchema || typeof resultSchema !== 'object' || Array.isArray(resultSchema)
    || !evidenceCarrier || typeof evidenceCarrier !== 'object' || Array.isArray(evidenceCarrier)
    || !Array.isArray(evidenceBlobs)) {
    fail('portable review batch payload budget inputs are invalid')
  }
  const requestEnvelopeByteCount = requestEnvelopeBytes.byteLength
  const resultSchemaBytes = Buffer.byteLength(canonical(resultSchema))
  const evidenceCarrierBytes = Buffer.byteLength(canonical(evidenceCarrier))
  const evidenceBlobBytes = evidenceBlobs.reduce(
    (sum, blob) => sum + Buffer.byteLength(canonical(blob)),
    0,
  )
  const actualInputBytes = requestEnvelopeByteCount
    + resultSchemaBytes
    + evidenceCarrierBytes
    + evidenceBlobBytes
  const plannedInputBytes = requestBatch.plannedInputBytes
  const plannedOutputBytes = requestBatch.plannedOutputBytes
  const plannedPayloadBytes = requestBatch.plannedPayloadBytes
  const actualPayloadUpperBoundBytes = actualInputBytes + plannedOutputBytes
  if (!Number.isSafeInteger(actualInputBytes) || actualInputBytes <= 0
    || !Number.isSafeInteger(plannedInputBytes) || plannedInputBytes <= 0
    || !Number.isSafeInteger(plannedOutputBytes) || plannedOutputBytes <= 0
    || !Number.isSafeInteger(plannedPayloadBytes) || plannedPayloadBytes <= 0
    || plannedPayloadBytes !== plannedInputBytes + plannedOutputBytes
    || actualInputBytes > plannedInputBytes
    || actualPayloadUpperBoundBytes > plannedPayloadBytes
    || plannedInputBytes > capabilityBudget.maxInputBytes
    || plannedOutputBytes > capabilityBudget.maxOutputBytes
    || plannedPayloadBytes > capabilityBudget.maxPayloadBytes
    || requestBatch.capabilityBudgetDigest !== capabilityBudget.capabilityBudgetDigest) {
    fail(`portable review batch exceeds its exact capability-bound serialized transport budget:${String(requestBatch?.requestBatchId)}:actualInput=${actualInputBytes}:plannedInput=${plannedInputBytes}:plannedOutput=${plannedOutputBytes}:actualPayloadUpperBound=${actualPayloadUpperBoundBytes}:plannedPayload=${plannedPayloadBytes}:maxInput=${capabilityBudget.maxInputBytes}:maxOutput=${capabilityBudget.maxOutputBytes}:maxPayload=${capabilityBudget.maxPayloadBytes}`)
  }
  return {
    requestEnvelopeBytes: requestEnvelopeByteCount,
    resultSchemaBytes,
    evidenceCarrierBytes,
    evidenceBlobBytes,
    actualInputBytes,
    plannedInputBytes,
    plannedOutputBytes,
    actualPayloadUpperBoundBytes,
    plannedPayloadBytes,
    maxInputBytes: capabilityBudget.maxInputBytes,
    maxOutputBytes: capabilityBudget.maxOutputBytes,
    maxPayloadBytes: capabilityBudget.maxPayloadBytes,
  }
}

export function validateBrokerReviewGraphPortablePayloadBudget({
  workUnit,
  requestEnvelopeBytes,
  resultSchema,
  evidenceCarrier,
  evidenceBlobs,
  prerequisiteResultPayloads = [],
  planState = null,
} = {}) {
  const state = planState ?? loadModelEvidenceBrokerPlan()
  if (!workUnit || !Number.isSafeInteger(workUnit.preparedTransportBytes)
    || workUnit.preparedTransportBytes <= 0
    || (!Buffer.isBuffer(requestEnvelopeBytes)
      && !(requestEnvelopeBytes instanceof Uint8Array))
    || !resultSchema || typeof resultSchema !== 'object' || Array.isArray(resultSchema)
    || !evidenceCarrier || typeof evidenceCarrier !== 'object' || Array.isArray(evidenceCarrier)
    || !Array.isArray(evidenceBlobs) || !Array.isArray(prerequisiteResultPayloads)) {
    fail('portable review payload budget inputs are invalid')
  }
  const requestEnvelopeByteCount = requestEnvelopeBytes.byteLength
  const resultSchemaBytes = Buffer.byteLength(canonical(resultSchema))
  const evidenceCarrierBytes = Buffer.byteLength(canonical(evidenceCarrier))
  const evidenceBlobBytes = evidenceBlobs.reduce(
    (sum, blob) => sum + Buffer.byteLength(canonical(blob)),
    0,
  )
  const prerequisitePayloadBytes = prerequisiteResultPayloads.reduce(
    (sum, payload) => sum + Buffer.byteLength(canonical(payload)),
    0,
  )
  const totalPreparedPayloadBytes = requestEnvelopeByteCount
    + resultSchemaBytes
    + evidenceCarrierBytes
    + evidenceBlobBytes
    + prerequisitePayloadBytes
  if (workUnit.preparedTransportBytes > state.plan.limits.maxPromptBytesPerShard
    || totalPreparedPayloadBytes > workUnit.preparedTransportBytes
    || totalPreparedPayloadBytes > state.plan.limits.maxPromptBytesPerShard
    || Math.ceil(
      totalPreparedPayloadBytes / state.plan.limits.bytesPerEstimatedToken,
    ) > state.plan.limits.maxEstimatedTokensPerShard) {
    fail(`portable review request exceeds its canonical exact serialized transport budget:${workUnit.workUnitId}`)
  }
  return {
    requestEnvelopeBytes: requestEnvelopeByteCount,
    resultSchemaBytes,
    evidenceCarrierBytes,
    evidenceBlobBytes,
    prerequisitePayloadBytes,
    totalPreparedPayloadBytes,
    preparedTransportBytes: workUnit.preparedTransportBytes,
    maxPreparedPayloadBytes: state.plan.limits.maxPromptBytesPerShard,
  }
}

export function materializeBrokerShardCarrier({
  carrier,
  blobs = [],
  blobResolver = null,
  planState = null,
} = {}) {
  const state = planState ?? loadModelEvidenceBrokerPlan()
  exactKeys(carrier, [
    'schemaVersion', 'evidenceKind', 'descriptor', 'blobRefs', 'carrierDigest',
  ], 'broker shard carrier')
  exactKeys(carrier.descriptor, [
    'schemaVersion', 'evidenceKind', 'identity', 'rawContentBytes', 'chunks', 'claims',
    'claimEvidenceGraph', 'shardId', 'batchDigest', 'promptBytes', 'estimatedTokens',
    'descriptorDigest',
  ], 'broker shard carrier descriptor')
  const { descriptorDigest, ...descriptorProjection } = carrier.descriptor
  const { carrierDigest, ...carrierProjection } = carrier
  if (carrier.schemaVersion !== 1
    || carrier.evidenceKind !== 'deep-audit-content-addressed-shard-carrier'
    || carrier.descriptor.schemaVersion !== 1
    || carrier.descriptor.evidenceKind !== 'deep-audit-content-shard-carrier-descriptor'
    || descriptorDigest !== sha256(canonical(descriptorProjection))
    || carrierDigest !== sha256(canonical(carrierProjection))
    || !Array.isArray(carrier.blobRefs) || !Array.isArray(blobs)
    || (blobResolver !== null && typeof blobResolver !== 'function')) {
    fail('broker shard carrier identity/content address is invalid')
  }
  const expectedBlobRefsByDigest = new Map()
  for (const chunk of carrier.descriptor.chunks) {
    exactKeys(
      chunk,
      CHUNK_KEYS.filter((key) => key !== 'content'),
      'broker shard carrier chunk reference',
    )
    if (!SHA256.test(chunk.contentSha256 ?? '')
      || !Number.isSafeInteger(chunk.bytes) || chunk.bytes < 0) {
      fail(`broker shard carrier chunk reference is invalid:${String(chunk?.chunkId)}`)
    }
    const expectedReference = {
      sha256: chunk.contentSha256,
      bytes: chunk.bytes,
      encoding: 'base64',
    }
    const previous = expectedBlobRefsByDigest.get(chunk.contentSha256)
    if (previous && canonical(previous) !== canonical(expectedReference)) {
      fail(`broker shard carrier chunk metadata substitutes a content digest:${chunk.contentSha256}`)
    }
    expectedBlobRefsByDigest.set(chunk.contentSha256, expectedReference)
  }
  const expectedBlobRefs = [...expectedBlobRefsByDigest.values()]
    .sort((left, right) => compareUtf8Bytes(left.sha256, right.sha256))
  const supplied = new Map()
  for (const blob of blobs) {
    exactKeys(blob, ['sha256', 'bytes', 'encoding', 'content'], 'broker shard carrier blob')
    const bytes = Buffer.from(blob.content, 'base64')
    if (blob.encoding !== 'base64' || bytes.toString('base64') !== blob.content
      || bytes.length !== blob.bytes || sha256(bytes) !== blob.sha256
      || supplied.has(blob.sha256)) {
      fail(`broker shard carrier blob is duplicate, substituted, or invalid:${String(blob.sha256)}`)
    }
    supplied.set(blob.sha256, bytes)
  }
  const declaredBlobRefs = [...carrier.blobRefs]
  if (canonical(declaredBlobRefs) !== canonical(
    [...declaredBlobRefs].sort((left, right) => compareUtf8Bytes(left.sha256, right.sha256)),
  ) || new Set(declaredBlobRefs.map((row) => row.sha256)).size !== declaredBlobRefs.length) {
    fail('broker shard carrier blob references are duplicate or reordered')
  }
  const declared = new Map()
  for (const row of declaredBlobRefs) {
    exactKeys(row, ['sha256', 'bytes', 'encoding'], 'broker shard carrier blob reference')
    if (!SHA256.test(row.sha256 ?? '') || !Number.isSafeInteger(row.bytes) || row.bytes < 0
      || row.encoding !== 'base64') {
      fail(`broker shard carrier blob reference is invalid:${String(row.sha256)}`)
    }
    declared.set(row.sha256, row)
  }
  if (canonical(declaredBlobRefs) !== canonical(expectedBlobRefs)) {
    fail('broker shard carrier blob references do not exactly close the descriptor content set')
  }
  const declaredDigests = declaredBlobRefs.map((row) => row.sha256)
  const suppliedDigests = blobs.map((blob) => blob.sha256)
  if ((blobResolver === null && canonical(suppliedDigests) !== canonical(declaredDigests))
    || (blobResolver !== null && suppliedDigests.length !== 0
      && canonical(suppliedDigests) !== canonical(declaredDigests))) {
    fail('broker shard carrier supplied blobs are missing, extra, or reordered')
  }
  const chunks = carrier.descriptor.chunks.map((chunk) => {
    const reference = declared.get(chunk.contentSha256)
    let bytes = supplied.get(chunk.contentSha256)
    if (!bytes && blobResolver) {
      const resolved = blobResolver(chunk.contentSha256)
      bytes = Buffer.isBuffer(resolved) ? resolved : Buffer.from(resolved ?? [])
    }
    if (!reference || !bytes || bytes.length !== reference.bytes || bytes.length !== chunk.bytes
      || sha256(bytes) !== chunk.contentSha256) {
      fail(`broker shard carrier is missing or substitutes content:${chunk.contentSha256}`)
    }
    return { ...chunk, content: bytes.toString('base64') }
  })
  const shardProjection = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-content-shard',
    identity: carrier.descriptor.identity,
    rawContentBytes: carrier.descriptor.rawContentBytes,
    chunks,
    claims: carrier.descriptor.claims,
    claimEvidenceGraph: carrier.descriptor.claimEvidenceGraph,
  }
  const digestMaterial = {
    ...shardProjection,
    chunks: chunks.map(({ content, ...chunk }) => chunk),
  }
  const shardId = sha256(canonical(digestMaterial))
  const promptEnvelope = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-content-shard-prompt',
    shardId,
    identity: carrier.descriptor.identity,
    rawContentBytes: carrier.descriptor.rawContentBytes,
    chunks,
    claims: carrier.descriptor.claims,
    claimEvidenceGraph: carrier.descriptor.claimEvidenceGraph,
  }
  const prompt = `${canonical(promptEnvelope)}\n`
  const promptBytes = Buffer.byteLength(prompt)
  const estimatedTokens = Math.ceil(promptBytes / state.plan.limits.bytesPerEstimatedToken)
  if (shardId !== carrier.descriptor.shardId
    || sha256(prompt) !== carrier.descriptor.batchDigest
    || promptBytes !== carrier.descriptor.promptBytes
    || estimatedTokens !== carrier.descriptor.estimatedTokens
    || promptBytes > state.plan.limits.maxPromptBytesPerShard
    || estimatedTokens > state.plan.limits.maxEstimatedTokensPerShard) {
    fail('broker shard carrier materialization is stale, substituted, or non-canonical')
  }
  return {
    ...shardProjection,
    shardId,
    batchDigest: carrier.descriptor.batchDigest,
    prompt,
    promptBytes,
    estimatedTokens,
  }
}

export function serializeBrokerShardCarrierBundle(bundle, { planState = null } = {}) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    fail('broker shard carrier bundle is invalid')
  }
  exactKeys(bundle, ['carrier', 'blobs'], 'broker shard carrier bundle')
  materializeBrokerShardCarrier({ ...bundle, planState })
  return Buffer.from(`${canonical(bundle)}\n`)
}

export function parseBrokerShardCarrierBundle(bytes, { planState = null } = {}) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    fail('broker shard carrier bundle bytes are invalid')
  }
  let bundle
  try { bundle = JSON.parse(Buffer.from(bytes).toString('utf8')) } catch (error) {
    fail(`broker shard carrier bundle is invalid JSON:${error.message}`)
  }
  if (`${canonical(bundle)}\n` !== Buffer.from(bytes).toString('utf8')) {
    fail('broker shard carrier bundle is not canonical JSON')
  }
  exactKeys(bundle, ['carrier', 'blobs'], 'broker shard carrier bundle')
  materializeBrokerShardCarrier({ ...bundle, planState })
  return bundle
}

function dispatchEstimateForShardReferences(shards, costUnitPromptBytes) {
  const uniqueChunks = new Map()
  let costUnits = 0
  for (const shard of shards) {
    costUnits += Math.max(1, Math.ceil(shard.promptBytes / costUnitPromptBytes))
    for (const chunk of shard.chunkRefs) {
      const previous = uniqueChunks.get(chunk.chunkId)
      if (previous && canonical(previous) !== canonical(chunk)) {
        fail(`dispatch schedule substitutes a duplicate chunk identity:${chunk.chunkId}`)
      }
      uniqueChunks.set(chunk.chunkId, chunk)
    }
  }
  return {
    totalSourceBytes: [...uniqueChunks.values()].reduce((sum, chunk) => sum + chunk.bytes, 0),
    shardCount: shards.length,
    providerCalls: shards.length,
    costUnits,
  }
}

function withinDispatchBudget(estimate, budget) {
  return estimate.totalSourceBytes <= budget.maxTotalSourceBytes
    && estimate.shardCount <= budget.maxShardCount
    && estimate.providerCalls <= budget.maxProviderCalls
    && estimate.costUnits <= budget.maxCostUnits
}

function scheduleRunIdentity(identity) {
  return {
    runId: identity.runId,
    manifestSha256: identity.manifestSha256,
    head: identity.head,
    tree: identity.tree,
    indexDigest: identity.indexDigest,
    worktreeFingerprint: identity.worktreeFingerprint,
    inventoryDigest: identity.inventoryDigest,
    rubricDigest: identity.rubricDigest,
    providerIdentityDigest: identity.providerIdentityDigest,
    brokerPlanDigest: identity.brokerPlanDigest,
    modelEvidencePlanDigest: identity.modelEvidencePlanDigest,
    resultSchemaSha256: identity.resultSchemaSha256,
  }
}

const BROKER_TASK_SET_SCOPE_KINDS = new Set([
  'registered-full-review',
  'fixture',
  'scoped',
])
const BROKER_TASK_SET_KEYS = [
  'schemaVersion', 'evidenceKind', 'scopeKind', 'brokerPlanDigest', 'runIdentity',
  'expectedTaskCount', 'expectedTaskKeys', 'taskDescriptorDigests', 'taskSetDigest',
]
const SCHEDULE_RUN_IDENTITY_KEYS = [
  'runId', 'manifestSha256', 'head', 'tree', 'indexDigest', 'worktreeFingerprint',
  'inventoryDigest', 'rubricDigest', 'providerIdentityDigest', 'brokerPlanDigest',
  'modelEvidencePlanDigest', 'resultSchemaSha256',
]

function validateOrderedTaskDescriptors(taskDescriptors, planState) {
  if (!Array.isArray(taskDescriptors) || taskDescriptors.length === 0 || !planState?.plan?.budgets) {
    fail('broker task set requires task descriptors and the canonical broker plan')
  }
  const descriptors = taskDescriptors.map((descriptor) => (
    validateBrokerTaskDispatchDescriptor(descriptor, { planState })
  ))
  for (let index = 1; index < descriptors.length; index += 1) {
    if (compareTaskDescriptors(descriptors[index - 1], descriptors[index]) > 0) {
      fail('broker task set descriptors are reordered')
    }
  }
  const keys = descriptors.map((descriptor) => taskKey(descriptor.identity))
  if (new Set(keys).size !== keys.length) fail('broker task set descriptors contain a duplicate task')
  const runIdentity = scheduleRunIdentity(descriptors[0].identity)
  if (descriptors.some((descriptor) => (
    canonical(scheduleRunIdentity(descriptor.identity)) !== canonical(runIdentity)
  ))) {
    fail('broker task set mixes frozen run identities')
  }
  return { descriptors, keys, runIdentity }
}

export function buildBrokerTaskSet({
  scopeKind,
  expectedTaskKeys,
  taskDescriptors,
  planState,
} = {}) {
  if (!BROKER_TASK_SET_SCOPE_KINDS.has(scopeKind)
    || !Array.isArray(expectedTaskKeys) || expectedTaskKeys.length === 0
    || expectedTaskKeys.some((key) => typeof key !== 'string' || !key)) {
    fail('broker task set scope/expected keys are invalid')
  }
  const { descriptors, keys, runIdentity } = validateOrderedTaskDescriptors(taskDescriptors, planState)
  if (new Set(expectedTaskKeys).size !== expectedTaskKeys.length
    || canonical(expectedTaskKeys) !== canonical(keys)) {
    fail('broker task set expected task keys do not exactly match descriptor order')
  }
  const projection = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-model-task-set',
    scopeKind,
    brokerPlanDigest: planState.planDigest,
    runIdentity,
    expectedTaskCount: expectedTaskKeys.length,
    expectedTaskKeys: [...expectedTaskKeys],
    taskDescriptorDigests: descriptors.map((descriptor) => descriptor.descriptorDigest),
  }
  return { ...projection, taskSetDigest: sha256(canonical(projection)) }
}

export function validateBrokerTaskSet(taskSet, { taskDescriptors, planState } = {}) {
  exactKeys(taskSet, BROKER_TASK_SET_KEYS, 'broker task set')
  exactKeys(taskSet.runIdentity, SCHEDULE_RUN_IDENTITY_KEYS, 'broker task set run identity')
  const expected = buildBrokerTaskSet({
    scopeKind: taskSet.scopeKind,
    expectedTaskKeys: taskSet.expectedTaskKeys,
    taskDescriptors,
    planState,
  })
  if (canonical(taskSet) !== canonical(expected)) {
    fail('broker task set is stale, substituted, incomplete, duplicated, or reordered')
  }
  return taskSet
}

function validateBrokerTaskSetAfterDescriptorValidation(
  taskSet,
  descriptors,
  keys,
  runIdentity,
  planState,
) {
  exactKeys(taskSet, BROKER_TASK_SET_KEYS, 'broker task set')
  exactKeys(taskSet.runIdentity, SCHEDULE_RUN_IDENTITY_KEYS, 'broker task set run identity')
  const projection = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-model-task-set',
    scopeKind: taskSet.scopeKind,
    brokerPlanDigest: planState.planDigest,
    runIdentity,
    expectedTaskCount: keys.length,
    expectedTaskKeys: keys,
    taskDescriptorDigests: descriptors.map((descriptor) => descriptor.descriptorDigest),
  }
  const expected = { ...projection, taskSetDigest: sha256(canonical(projection)) }
  if (canonical(taskSet) !== canonical(expected)) {
    fail('broker task set is stale, substituted, incomplete, duplicated, or reordered')
  }
  return taskSet
}

function reviewGraphCell(kind, taskKeyValue, shards, claimIds, leafIds) {
  if (!Array.isArray(shards) || shards.length === 0
    || shards.some((shard) => !shard?.reviewSemantics)) {
    fail(`review graph cell lacks canonical review semantics:${taskKeyValue}`)
  }
  const refsByLeaf = new Map()
  for (const shard of shards) {
    const taskKind = taskKeyValue.startsWith('judgment:') ? 'judgment' : 'component-a1b'
    const rawSubject = taskKeyValue.slice(taskKeyValue.indexOf(':') + 1)
    validateShardReviewSemantics(shard.reviewSemantics, {
      taskKind,
      subject: taskKind === 'judgment' ? Number(rawSubject) : rawSubject,
      claimInventoryDigest: shard.reviewSemantics.claimInventoryDigest ?? null,
      claimEvidenceGraphDigest: shard.claimEvidenceGraphDigest,
      claimIds: shard.claimIds,
      chunkRefs: shard.chunkRefs,
      allowAbsentJudgment: false,
    })
    for (const reference of shard.chunkRefs) {
      const previous = refsByLeaf.get(reference.chunkId)
      if (previous && canonical(previous) !== canonical(reference)) {
        fail(`review graph cell substitutes a leaf citation binding:${reference.chunkId}`)
      }
      if (!previous) refsByLeaf.set(reference.chunkId, reference)
    }
  }
  const leafBindings = leafIds.map((leafId) => {
    const reference = refsByLeaf.get(leafId)
    if (!reference) fail(`review graph cell lacks a leaf citation binding:${leafId}`)
    return structuredClone(reference)
  })
  const reviewSemanticsBindings = shards.map((shard) => ({
    shardId: shard.shardId,
    reviewSemantics: structuredClone(shard.reviewSemantics),
  }))
  const reviewSemanticsSetDigest = sha256(canonical(reviewSemanticsBindings))
  const projection = {
    schemaVersion: 1,
    cellKind: kind,
    taskKey: taskKeyValue,
    shardIds: shards.map((shard) => shard.shardId),
    claimIds: [...claimIds],
    leafIds: [...leafIds],
    leafBindings,
    reviewSemanticsBindings,
    reviewSemanticsSetDigest,
  }
  return { ...projection, cellId: sha256(canonical(projection)) }
}

function reviewGraphCoverageFragment(sourceCell, fragmentLeafIds, fragmentOrdinal, fragmentCount) {
  if (!sourceCell || sourceCell.claimIds.length !== 0
    || !Array.isArray(fragmentLeafIds) || fragmentLeafIds.length === 0
    || !Number.isSafeInteger(fragmentOrdinal) || fragmentOrdinal < 0
    || !Number.isSafeInteger(fragmentCount) || fragmentCount < 2
    || fragmentOrdinal >= fragmentCount) {
    fail(`review graph coverage fragment inputs are invalid:${String(sourceCell?.cellId)}`)
  }
  const sourceLeafIds = [...sourceCell.leafIds].sort(compareUtf8Bytes)
  const orderedFragmentLeafIds = [...fragmentLeafIds].sort(compareUtf8Bytes)
  if (new Set(orderedFragmentLeafIds).size !== orderedFragmentLeafIds.length
    || orderedFragmentLeafIds.some((leafId) => !sourceLeafIds.includes(leafId))) {
    fail(`review graph coverage fragment substitutes or overlaps source leaves:${sourceCell.cellId}`)
  }
  const sourceLeafBindings = new Map(
    sourceCell.leafBindings.map((binding) => [binding.chunkId, binding]),
  )
  const leafBindings = orderedFragmentLeafIds.map((leafId) => {
    const binding = sourceLeafBindings.get(leafId)
    if (!binding) {
      fail(`review graph coverage fragment lacks a source leaf binding:${sourceCell.cellId}:${leafId}`)
    }
    return structuredClone(binding)
  })
  const fragmentLeafSet = new Set(orderedFragmentLeafIds)
  const reviewSemanticsBindings = sourceCell.reviewSemanticsBindings.map((binding) => {
    const next = structuredClone(binding)
    const semantics = next.reviewSemantics
    if (semantics.semanticsKind === 'component-shared-evidence-review') {
      const projectedLeafIds = semantics.leafIds
        .filter((leafId) => fragmentLeafSet.has(leafId))
        .sort(compareUtf8Bytes)
      next.reviewSemantics = {
        ...semantics,
        leafIds: projectedLeafIds,
      }
      next.reviewSemantics.semanticsDigest = canonicalDigest(
        reviewSemanticsProjection(next.reviewSemantics),
      )
    }
    return next
  })
  const reviewSemanticsSetDigest = sha256(canonical(reviewSemanticsBindings))
  const projection = {
    schemaVersion: 1,
    cellKind: sourceCell.cellKind,
    taskKey: sourceCell.taskKey,
    shardIds: [...sourceCell.shardIds],
    claimIds: [],
    leafIds: orderedFragmentLeafIds,
    leafBindings,
    reviewSemanticsBindings,
    reviewSemanticsSetDigest,
    sourceCellId: sourceCell.cellId,
    sourceLeafSetDigest: sha256(canonical(sourceLeafIds)),
    fragmentOrdinal,
    fragmentCount,
    fragmentLeafSetDigest: sha256(canonical(orderedFragmentLeafIds)),
  }
  return { ...projection, cellId: sha256(canonical(projection)) }
}

function reviewGraphPartitionOversizedCell(
  kind,
  sourceCell,
  taskSetDigest,
  leaves,
  limits,
  reviewGraphPolicy,
) {
  const buildUnit = (cell) => reviewGraphWorkUnit(
    kind,
    [cell],
    cell.leafIds,
    taskSetDigest,
    leaves,
    reviewGraphPolicy,
  )
  if (reviewGraphWorkUnitFits(buildUnit(sourceCell), limits)) {
    return { cells: [sourceCell], partition: null }
  }
  if (sourceCell.claimIds.length !== 0) {
    fail(`review graph claim-bearing cell requires canonical native shard refinement:${sourceCell.cellId}`)
  }
  const sourceLeafIds = [...sourceCell.leafIds].sort(compareUtf8Bytes)
  if (sourceLeafIds.length <= 1) {
    const unit = buildUnit(sourceCell)
    fail([
      'single review graph evidence leaf cannot fit the canonical prepared request budget',
      `sourceCellId=${sourceCell.cellId}`,
      `leafId=${sourceLeafIds[0]}`,
      `preparedTransportBytes=${unit.preparedTransportBytes}`,
      `limit=${limits.maxPromptBytesPerShard}`,
    ].join(':'))
  }
  const initialMidpoint = Math.ceil(sourceLeafIds.length / 2)
  let leafPartitions = [
    sourceLeafIds.slice(0, initialMidpoint),
    sourceLeafIds.slice(initialMidpoint),
  ]
  for (;;) {
    const fragmentCount = leafPartitions.length
    const fragments = leafPartitions.map((leafIds, ordinal) => (
      reviewGraphCoverageFragment(sourceCell, leafIds, ordinal, fragmentCount)
    ))
    const unfitOrdinal = fragments.findIndex(
      (fragment) => !reviewGraphWorkUnitFits(buildUnit(fragment), limits),
    )
    if (unfitOrdinal < 0) {
      const partitionProjection = {
        schemaVersion: 1,
        partitionKind: 'deterministic-content-addressed-coverage-cell-fragments',
        sourceCellId: sourceCell.cellId,
        sourceTaskKey: sourceCell.taskKey,
        sourceCellKind: sourceCell.cellKind,
        sourceShardIds: [...sourceCell.shardIds],
        sourceClaimIds: [],
        sourceLeafIds: [...sourceCell.leafIds].sort(compareUtf8Bytes),
        sourceLeafSetDigest: sha256(canonical(
          [...sourceCell.leafIds].sort(compareUtf8Bytes),
        )),
        sourceReviewSemanticsSetDigest: sourceCell.reviewSemanticsSetDigest,
        fragmentCount,
        fragmentCellIds: fragments.map((fragment) => fragment.cellId),
        fragmentLeafSetDigests:
          fragments.map((fragment) => fragment.fragmentLeafSetDigest),
      }
      return {
        cells: fragments,
        partition: {
          ...partitionProjection,
          partitionDigest: sha256(canonical(partitionProjection)),
        },
      }
    }
    const unfitLeafIds = leafPartitions[unfitOrdinal]
    if (unfitLeafIds.length <= 1) {
      const unit = buildUnit(fragments[unfitOrdinal])
      fail([
        'single review graph evidence leaf cannot fit the canonical prepared request budget',
        `sourceCellId=${sourceCell.cellId}`,
        `fragmentCellId=${fragments[unfitOrdinal].cellId}`,
        `leafId=${unfitLeafIds[0]}`,
        `preparedTransportBytes=${unit.preparedTransportBytes}`,
        `limit=${limits.maxPromptBytesPerShard}`,
      ].join(':'))
    }
    const midpoint = Math.ceil(unfitLeafIds.length / 2)
    leafPartitions = [
      ...leafPartitions.slice(0, unfitOrdinal),
      unfitLeafIds.slice(0, midpoint),
      unfitLeafIds.slice(midpoint),
      ...leafPartitions.slice(unfitOrdinal + 1),
    ]
  }
}

function reviewGraphCoveragePartitionProof(sourceCells, coverageCells, partitions) {
  const sourceIds = sourceCells.map((cell) => cell.cellId)
  if (new Set(sourceIds).size !== sourceIds.length) {
    fail('review graph source coverage identities are duplicated')
  }
  const coverageById = new Map(coverageCells.map((cell) => [cell.cellId, cell]))
  if (coverageById.size !== coverageCells.length) {
    fail('review graph coverage fragment identities are duplicated')
  }
  const fragmentedSourceIds = new Set()
  const fragmentIds = new Set()
  let partitionedLeafCount = 0
  for (const partition of partitions) {
    const sourceCell = sourceCells.find((cell) => cell.cellId === partition.sourceCellId)
    const { partitionDigest, ...partitionProjection } = partition
    if (!sourceCell || fragmentedSourceIds.has(partition.sourceCellId)
      || partition.partitionKind
        !== 'deterministic-content-addressed-coverage-cell-fragments'
      || partitionDigest !== sha256(canonical(partitionProjection))
      || partition.sourceTaskKey !== sourceCell.taskKey
      || partition.sourceCellKind !== sourceCell.cellKind
      || canonical(partition.sourceShardIds) !== canonical(sourceCell.shardIds)
      || partition.sourceClaimIds.length !== 0
      || sourceCell.claimIds.length !== 0
      || canonical(partition.sourceLeafIds)
        !== canonical([...sourceCell.leafIds].sort(compareUtf8Bytes))
      || partition.sourceLeafSetDigest !== sha256(canonical(partition.sourceLeafIds))
      || partition.sourceReviewSemanticsSetDigest !== sourceCell.reviewSemanticsSetDigest
      || partition.fragmentCount !== partition.fragmentCellIds.length
      || partition.fragmentCount !== partition.fragmentLeafSetDigests.length
      || partition.fragmentCount < 2) {
      fail(`review graph coverage partition identity is invalid:${String(partition?.sourceCellId)}`)
    }
    fragmentedSourceIds.add(partition.sourceCellId)
    const observedLeafIds = []
    for (const [ordinal, fragmentCellId] of partition.fragmentCellIds.entries()) {
      const fragment = coverageById.get(fragmentCellId)
      if (!fragment || fragmentIds.has(fragmentCellId)
        || fragment.sourceCellId !== sourceCell.cellId
        || fragment.fragmentOrdinal !== ordinal
        || fragment.fragmentCount !== partition.fragmentCount
        || fragment.sourceLeafSetDigest !== partition.sourceLeafSetDigest
        || fragment.fragmentLeafSetDigest !== partition.fragmentLeafSetDigests[ordinal]
        || fragment.fragmentLeafSetDigest !== sha256(canonical(fragment.leafIds))
        || canonical(fragment.shardIds) !== canonical(sourceCell.shardIds)
        || fragment.taskKey !== sourceCell.taskKey
        || fragment.cellKind !== sourceCell.cellKind
        || fragment.claimIds.length !== 0) {
        fail(`review graph coverage fragment is missing, reordered, or substituted:${fragmentCellId}`)
      }
      fragmentIds.add(fragmentCellId)
      observedLeafIds.push(...fragment.leafIds)
    }
    const canonicalObservedLeafIds = [...observedLeafIds].sort(compareUtf8Bytes)
    if (observedLeafIds.length !== new Set(observedLeafIds).size
      || canonical(canonicalObservedLeafIds) !== canonical(partition.sourceLeafIds)) {
      fail(`review graph coverage fragments are missing, duplicated, or overlapping:${sourceCell.cellId}`)
    }
    partitionedLeafCount += observedLeafIds.length
  }
  for (const cell of coverageCells) {
    const isFragment = Object.hasOwn(cell, 'sourceCellId')
    if (isFragment !== fragmentIds.has(cell.cellId)
      || (!isFragment && fragmentedSourceIds.has(cell.cellId))) {
      fail(`review graph coverage partition leaves a fragment foreign or a source double-scheduled:${cell.cellId}`)
    }
  }
  const expectedCoverageCount =
    sourceCells.length - partitions.length + fragmentIds.size
  if (coverageCells.length !== expectedCoverageCount) {
    fail('review graph coverage partition count is incomplete')
  }
  const projection = {
    sourceCoverageCellCount: sourceCells.length,
    sourceCoverageCellSetDigest: sha256(canonical(sourceIds)),
    fragmentedSourceCoverageCellCount: partitions.length,
    coverageFragmentCount: fragmentIds.size,
    partitionedLeafCount,
    missingCount: 0,
    duplicateCount: 0,
    overlapCount: 0,
    sampling: false,
    complete: true,
  }
  return {
    ...projection,
    coveragePartitionDigest: sha256(canonical({
      projection,
      partitionDigests: partitions.map((partition) => partition.partitionDigest),
    })),
  }
}

function reviewGraphEvidenceBlobBytes(leafIds, leaves) {
  const blobsByDigest = new Map()
  for (const leafId of leafIds) {
    const leaf = leaves.get(leafId)
    if (!leaf) fail(`review graph references an unknown evidence leaf:${leafId}`)
    const previous = blobsByDigest.get(leaf.contentSha256)
    if (previous !== undefined && previous !== leaf.bytes) {
      fail(`review graph content digest has conflicting byte lengths:${leaf.contentSha256}`)
    }
    blobsByDigest.set(leaf.contentSha256, leaf.bytes)
  }
  return [...blobsByDigest.entries()].reduce((sum, [contentSha256, bytes]) => (
    sum
    + Buffer.byteLength(canonical({
      sha256: contentSha256,
      bytes,
      encoding: 'base64',
      content: '',
    }))
    + reviewGraphEncodedEvidenceBytes(bytes)
  ), 0)
}

function reviewGraphWorkUnit(kind, cells, leafIds, taskSetDigest, leaves, reviewGraphPolicy) {
  const uniqueLeafIds = [...new Set(leafIds)].sort(compareUtf8Bytes)
  const taskKeys = [...new Set(cells.map((cell) => cell.taskKey))].sort(compareUtf8Bytes)
  const orderedCells = [...cells].sort(
    (left, right) => compareUtf8Bytes(left.cellId, right.cellId),
  )
  const coverageCellIds = orderedCells.map((cell) => cell.cellId)
  const rawContentBytes = uniqueLeafIds.reduce((sum, leafId) => sum + leaves.get(leafId).bytes, 0)
  const reviewSemanticsBindings = orderedCells
    .map((cell) => ({
      cellId: cell.cellId,
      reviewSemanticsSetDigest: cell.reviewSemanticsSetDigest,
    }))
  const reviewSemanticsBytes = Buffer.byteLength(canonical(
    orderedCells.flatMap((cell) => cell.reviewSemanticsBindings),
  ))
  const reviewInstructionCellBytes = Buffer.byteLength(JSON.stringify(canonical(orderedCells)))
  const requestBindingBytes = Buffer.byteLength(canonical({
    taskKeys,
    coverageCellIds,
    leafIds: uniqueLeafIds,
  }))
  const evidenceReferenceBudgetBytes =
    uniqueLeafIds.length * reviewGraphPolicy.maxEvidenceReferenceBytesPerLeaf
  const evidenceBlobBytes = reviewGraphEvidenceBlobBytes(uniqueLeafIds, leaves)
  const preparedTransportBytes = reviewGraphPolicy.maxPreparedRequestFixedBytes
    + reviewInstructionCellBytes
    + requestBindingBytes
    + evidenceReferenceBudgetBytes
    + evidenceBlobBytes
  const projection = {
    schemaVersion: 1,
    unitKind: kind,
    taskSetDigest,
    taskKeys,
    coverageCellIds,
    leafIds: uniqueLeafIds,
    rawContentBytes,
    reviewSemanticsBytes,
    reviewSemanticsSetDigest: sha256(canonical(reviewSemanticsBindings)),
    reviewInstructionCellBytes,
    requestBindingBytes,
    maxEvidenceReferenceBytesPerLeaf: reviewGraphPolicy.maxEvidenceReferenceBytesPerLeaf,
    evidenceReferenceBudgetBytes,
    evidenceBlobBytes,
    preparedTransportBytes,
  }
  const workUnitDigest = sha256(canonical(projection))
  return { ...projection, workUnitId: workUnitDigest, workUnitDigest }
}

function reviewGraphSynthesisUnit(taskKeyValue, stage, inputKind, inputIds, taskSetDigest) {
  const projection = {
    schemaVersion: 1,
    unitKind: 'task-hierarchical-synthesis',
    taskSetDigest,
    taskKey: taskKeyValue,
    stage,
    inputKind,
    inputIds: [...inputIds],
  }
  const synthesisUnitDigest = sha256(canonical(projection))
  return { ...projection, synthesisUnitId: synthesisUnitDigest, synthesisUnitDigest }
}

function reviewGraphEncodedEvidenceBytes(rawBytes) {
  return Math.ceil(rawBytes / 3) * 4
}

function reviewGraphWorkUnitFits(unit, limits) {
  const estimatedPromptBytes = unit.preparedTransportBytes
  return unit.rawContentBytes <= limits.maxRawContentBytesPerShard
    && unit.leafIds.length <= limits.maxChunksPerShard
    && estimatedPromptBytes <= limits.maxPromptBytesPerShard
    && Math.ceil(estimatedPromptBytes / limits.bytesPerEstimatedToken)
      <= limits.maxEstimatedTokensPerShard
}

function reviewGraphPackCells(
  kind,
  cells,
  taskSetDigest,
  leaves,
  limits,
  reviewGraphPolicy,
  { fixedLeafIds = null } = {},
) {
  if (!Array.isArray(cells) || cells.length === 0) {
    fail(`review graph cannot pack an empty cell set:${kind}`)
  }
  const orderedCells = [...cells].sort(
    (left, right) => compareUtf8Bytes(left.cellId, right.cellId),
  )
  const fixedLeaves = fixedLeafIds === null
    ? null
    : [...new Set(fixedLeafIds)].sort(compareUtf8Bytes)
  if (fixedLeaves && orderedCells.some(
    (cell) => cell.leafIds.some((leafId) => !fixedLeaves.includes(leafId)),
  )) {
    fail(`review graph fixed evidence capsule omits a cell leaf:${kind}`)
  }
  const units = []
  let current = []
  const build = (candidateCells) => reviewGraphWorkUnit(
    kind,
    candidateCells,
    fixedLeaves ?? [...new Set(candidateCells.flatMap((cell) => cell.leafIds))]
      .sort(compareUtf8Bytes),
    taskSetDigest,
    leaves,
    reviewGraphPolicy,
  )
  const cellBudgetFailure = (cell, unit) => [
    'review graph cell cannot fit the canonical prepared request budget',
    `cellId=${cell.cellId}`,
    `kind=${kind}`,
    `taskKey=${cell.taskKey}`,
    `claimCount=${cell.claimIds.length}`,
    `leafCount=${unit.leafIds.length}`,
    `rawContentBytes=${unit.rawContentBytes}`,
    `preparedTransportBytes=${unit.preparedTransportBytes}`,
    `limit=${limits.maxPromptBytesPerShard}`,
  ].join(':')
  const flush = () => {
    if (!current.length) return
    const unit = build(current)
    if (!reviewGraphWorkUnitFits(unit, limits)) {
      fail(cellBudgetFailure(current[0], unit))
    }
    units.push(unit)
    current = []
  }
  for (const cell of orderedCells) {
    const candidate = build([...current, cell])
    if (current.length && !reviewGraphWorkUnitFits(candidate, limits)) {
      flush()
    }
    current.push(cell)
    const currentUnit = build(current)
    if (!reviewGraphWorkUnitFits(currentUnit, limits)) {
      fail(cellBudgetFailure(cell, currentUnit))
    }
  }
  flush()
  const packedCellIds = units.flatMap((unit) => unit.coverageCellIds)
  const expectedCellIds = orderedCells.map((cell) => cell.cellId)
  if (canonical(packedCellIds) !== canonical(expectedCellIds)
    || new Set(packedCellIds).size !== packedCellIds.length) {
    fail(`review graph cell packing is missing, duplicated, or reordered:${kind}`)
  }
  return units
}

function reviewGraphDispatchBatches(workUnits, synthesisUnits, logicalTaskCount, planState) {
  const items = workUnits.map((unit) => ({
    dispatchKind: 'review-work',
    dispatchId: unit.workUnitId,
    rawContentBytes: unit.rawContentBytes,
    estimatedPromptBytes: unit.preparedTransportBytes,
  }))
  for (const item of items) {
    if (item.estimatedPromptBytes > planState.plan.limits.maxPromptBytesPerShard
      || Math.ceil(item.estimatedPromptBytes / planState.plan.limits.bytesPerEstimatedToken)
        > planState.plan.limits.maxEstimatedTokensPerShard) {
      fail(`review graph work unit exceeds the canonical prompt budget:${item.dispatchId}`)
    }
    item.costUnits = Math.max(1, Math.ceil(
      item.estimatedPromptBytes / planState.plan.budgets.costUnitPromptBytes,
    ))
  }
  const batches = []
  let current = []
  let currentBytes = 0
  let currentCost = 0
  const limit = planState.plan.budgets.dispatchBatch
  const flush = () => {
    if (!current.length) return
    const projection = {
      schemaVersion: 1,
      batchOrdinal: batches.length,
      dispatchIds: current.map((item) => item.dispatchId),
      reviewWorkUnitCount:
        current.filter((item) => item.dispatchKind === 'review-work').length,
      synthesisCount: 0,
      totalSourceBytes: currentBytes,
      providerCallUpperBound: current.length,
      costUnits: currentCost,
    }
    batches.push({ ...projection, batchId: sha256(canonical(projection)) })
    current = []
    currentBytes = 0
    currentCost = 0
  }
  for (const item of items) {
    const exceeds = current.length > 0 && (
      current.length + 1 > limit.maxProviderCalls
      || current.length + 1 > limit.maxShardCount
      || currentBytes + item.rawContentBytes > limit.maxTotalSourceBytes
      || currentCost + item.costUnits > limit.maxCostUnits
    )
    if (exceeds) flush()
    current.push(item)
    currentBytes += item.rawContentBytes
    currentCost += item.costUnits
    if (current.length > limit.maxProviderCalls || current.length > limit.maxShardCount
      || currentBytes > limit.maxTotalSourceBytes || currentCost > limit.maxCostUnits) {
      fail(`review graph dispatch item cannot fit a canonical batch:${item.dispatchId}`)
    }
  }
  flush()
  const totals = {
    totalSourceBytes: items.reduce((sum, item) => sum + item.rawContentBytes, 0),
    shardCount: items.length,
    reviewWorkUnitCount: items.length,
    providerCallUpperBound: items.length,
    providerCallAccounting: 'capability-bounded-exchange-schedule',
    costUnits: items.reduce((sum, item) => sum + item.costUnits, 0),
    synthesisProviderCalls: 0,
    deterministicReductionUnits: synthesisUnits.length,
  }
  const budgetEstimate = {
    totalSourceBytes: totals.totalSourceBytes,
    shardCount: totals.shardCount,
    providerCalls: totals.providerCallUpperBound,
    costUnits: totals.costUnits,
  }
  enforceFullReviewBudget(
    logicalTaskCount,
    budgetEstimate,
    planState.plan.budgets.fullReview,
    'no-sample review graph',
  )
  return { batches, totals }
}

function reviewGraphSynthesisTree(
  taskKeyValue,
  cellIds,
  taskSetDigest,
) {
  if (!cellIds.length) fail(`review graph task has no applicability cells:${taskKeyValue}`)
  return [reviewGraphSynthesisUnit(
    taskKeyValue,
    0,
    'coverage-cells',
    [...cellIds].sort(compareUtf8Bytes),
    taskSetDigest,
  )]
}

const CANONICALLY_BUILT_REVIEW_GRAPH = Symbol('canonically-built-review-graph')

/**
 * Builds the provider-neutral no-sample execution graph over the existing
 * canonical task descriptors.  Logical tasks and their frozen raw corpus are
 * preserved; only identical content-addressed model work is multiplexed.
 */
export function buildBrokerNoSampleReviewGraph({
  taskSet,
  taskDescriptors,
  planState,
} = {}) {
  if (!planState?.plan?.reviewGraph
    || planState.plan.reviewGraph.protocolExtension !== 'no-sample-multiplexed-review-graph-v1') {
    fail('canonical no-sample review graph policy is absent')
  }
  const { descriptors, keys, runIdentity } = validateOrderedTaskDescriptors(taskDescriptors, planState)
  validateBrokerTaskSetAfterDescriptorValidation(
    taskSet,
    descriptors,
    keys,
    runIdentity,
    planState,
  )

  const leaves = new Map()
  const tasks = new Map()
  for (const [ordinal, descriptor] of descriptors.entries()) {
    const key = keys[ordinal]
    const taskLeaves = new Map()
    for (const shard of descriptor.shards) {
      for (const chunk of shard.chunkRefs) {
        const previous = leaves.get(chunk.chunkId)
        if (previous && canonical(previous) !== canonical(chunk)) {
          fail(`review graph substitutes a content-addressed evidence leaf:${chunk.chunkId}`)
        }
        leaves.set(chunk.chunkId, chunk)
        taskLeaves.set(chunk.chunkId, chunk)
      }
    }
    tasks.set(key, {
      key,
      descriptor,
      taskLeaves,
      claimBoundLeafIds: new Set(),
      cells: [],
    })
  }

  const cells = []
  const sourceCoverageCells = []
  const coveragePartitions = []
  const workUnitDrafts = []
  const judgmentGroups = new Map()
  for (const state of tasks.values()) {
    if (state.descriptor.identity.taskKind !== 'judgment') continue
    for (const shard of state.descriptor.shards) {
      const leafIds = shard.chunkRefs.map((chunk) => chunk.chunkId)
      const cell = reviewGraphCell(
        'judgment-applicability-cell',
        state.key,
        [shard],
        [],
        leafIds,
      )
      sourceCoverageCells.push(cell)
      const partitioned = reviewGraphPartitionOversizedCell(
        'multiplexed-judgment-review',
        cell,
        taskSet.taskSetDigest,
        leaves,
        planState.plan.limits,
        planState.plan.reviewGraph,
      )
      if (partitioned.partition) coveragePartitions.push(partitioned.partition)
      cells.push(...partitioned.cells)
      state.cells.push(...partitioned.cells)
      for (const coverageCell of partitioned.cells) {
        const fragmentCapsuleDigest = sha256(canonical(coverageCell.leafIds))
        if (!judgmentGroups.has(fragmentCapsuleDigest)) {
          judgmentGroups.set(fragmentCapsuleDigest, {
            leafIds: coverageCell.leafIds,
            cells: [],
          })
        }
        const group = judgmentGroups.get(fragmentCapsuleDigest)
        if (canonical(group.leafIds) !== canonical(coverageCell.leafIds)) {
          fail(`review graph judgment capsule digest collision:${fragmentCapsuleDigest}`)
        }
        group.cells.push(coverageCell)
      }
    }
  }
  for (const capsuleDigest of [...judgmentGroups.keys()].sort(compareUtf8Bytes)) {
    const group = judgmentGroups.get(capsuleDigest)
    workUnitDrafts.push(...reviewGraphPackCells(
      'multiplexed-judgment-review',
      group.cells,
      taskSet.taskSetDigest,
      leaves,
      planState.plan.limits,
      planState.plan.reviewGraph,
      { fixedLeafIds: group.leafIds },
    ))
  }

  for (const state of tasks.values()) {
    if (state.descriptor.identity.taskKind !== 'component-a1b') continue
    for (const shard of state.descriptor.shards) {
      if (shard.claimIds.length === 0) continue
      const leafIds = [...new Set(shard.chunkRefs.map((chunk) => chunk.chunkId))].sort(compareUtf8Bytes)
      for (const leafId of leafIds) state.claimBoundLeafIds.add(leafId)
      const cell = reviewGraphCell(
        'component-claim-review-cell',
        state.key,
        [shard],
        shard.claimIds,
        leafIds,
      )
      sourceCoverageCells.push(cell)
      cells.push(cell)
      state.cells.push(cell)
      workUnitDrafts.push(...reviewGraphPackCells(
        'component-claim-review',
        [cell],
        taskSet.taskSetDigest,
        leaves,
        planState.plan.limits,
        planState.plan.reviewGraph,
      ))
    }
  }

  const sharedGroups = new Map()
  for (const state of tasks.values()) {
    if (state.descriptor.identity.taskKind !== 'component-a1b') continue
    for (const shard of state.descriptor.shards) {
      if (shard.claimIds.length !== 0) continue
      const leafIds = shard.chunkRefs.map((chunk) => chunk.chunkId)
        .sort(compareUtf8Bytes)
      const cell = reviewGraphCell(
        'shared-evidence-review-cell',
        state.key,
        [shard],
        [],
        leafIds,
      )
      sourceCoverageCells.push(cell)
      const partitioned = reviewGraphPartitionOversizedCell(
        'content-addressed-shared-evidence-review',
        cell,
        taskSet.taskSetDigest,
        leaves,
        planState.plan.limits,
        planState.plan.reviewGraph,
      )
      if (partitioned.partition) coveragePartitions.push(partitioned.partition)
      cells.push(...partitioned.cells)
      state.cells.push(...partitioned.cells)
      for (const coverageCell of partitioned.cells) {
        const fragmentCapsuleDigest = sha256(canonical(coverageCell.leafIds))
        if (!sharedGroups.has(fragmentCapsuleDigest)) {
          sharedGroups.set(fragmentCapsuleDigest, {
            leafIds: coverageCell.leafIds,
            cells: [],
          })
        }
        const group = sharedGroups.get(fragmentCapsuleDigest)
        if (canonical(group.leafIds) !== canonical(coverageCell.leafIds)) {
          fail(`review graph shared-evidence capsule digest collision:${fragmentCapsuleDigest}`)
        }
        group.cells.push(coverageCell)
      }
    }
  }
  for (const capsuleDigest of [...sharedGroups.keys()].sort(compareUtf8Bytes)) {
    const group = sharedGroups.get(capsuleDigest)
    workUnitDrafts.push(...reviewGraphPackCells(
      'content-addressed-shared-evidence-review',
      group.cells,
      taskSet.taskSetDigest,
      leaves,
      planState.plan.limits,
      planState.plan.reviewGraph,
      { fixedLeafIds: group.leafIds },
    ))
  }

  const cellIds = cells.map((cell) => cell.cellId)
  if (new Set(cellIds).size !== cellIds.length) fail('review graph contains a duplicate applicability cell')
  const coveragePartitionProof = reviewGraphCoveragePartitionProof(
    sourceCoverageCells,
    cells,
    coveragePartitions,
  )
  const workUnits = workUnitDrafts.map((unit, ordinal) => ({ ...unit, ordinal }))
  if (new Set(workUnits.map((unit) => unit.workUnitId)).size !== workUnits.length) {
    fail('review graph contains duplicate model work rather than multiplexing it')
  }
  const cellToWork = new Map()
  for (const unit of workUnits) {
    for (const cellId of unit.coverageCellIds) {
      if (cellToWork.has(cellId)) fail(`review graph schedules a coverage cell more than once:${cellId}`)
      cellToWork.set(cellId, unit.workUnitId)
    }
  }
  if (cellToWork.size !== cells.length) fail('review graph omits applicability cells from model work')

  const rawCorpusTasks = []
  const rawDispositionHash = createHash('sha256')
  let rawCorpusDispositionCount = 0
  const shardDispositions = []
  for (const state of tasks.values()) {
    const applicableLeafIds = [...state.taskLeaves.keys()].sort(compareUtf8Bytes)
    const boundLeafIds = [...new Set(state.cells.flatMap((cell) => cell.leafIds))].sort(compareUtf8Bytes)
    if (canonical(boundLeafIds) !== canonical(applicableLeafIds)) {
      fail(`review graph has missing or unexpected applicable evidence leaves:${state.key}`)
    }
    const cellsByLeaf = new Map(applicableLeafIds.map((leafId) => [leafId, []]))
    for (const cell of state.cells) {
      for (const leafId of cell.leafIds) cellsByLeaf.get(leafId)?.push(cell.cellId)
    }
    const taskDispositionHash = createHash('sha256')
    for (const [leafId, reviewCellIds] of cellsByLeaf) {
      if (!reviewCellIds.length) fail(`review graph leaves applicable evidence unreviewed:${state.key}:${leafId}`)
      const row = {
        taskKey: state.key,
        leafId,
        disposition: 'applicable',
        reviewCellIds: [...new Set(reviewCellIds)].sort(compareUtf8Bytes),
      }
      const bytes = canonical(row)
      taskDispositionHash.update(bytes).update('\n')
      rawDispositionHash.update(bytes).update('\n')
      rawCorpusDispositionCount += 1
    }
    rawCorpusTasks.push({
      taskKey: state.key,
      sourceSetDigest: state.descriptor.identity.sourceSetDigest,
      rawLeafCount: applicableLeafIds.length,
      rawLeafSetDigest: sha256(canonical(applicableLeafIds)),
      applicableLeafCount: applicableLeafIds.length,
      applicableLeafSetDigest: sha256(canonical(applicableLeafIds)),
      notApplicableLeafCount: 0,
      notApplicableLeafSetDigest: sha256(canonical([])),
      unknownLeafCount: 0,
      unknownLeafSetDigest: sha256(canonical([])),
      reviewBindingDigest: taskDispositionHash.digest('hex'),
    })
    for (const shard of state.descriptor.shards) {
      const shardLeafIds = new Set(shard.chunkRefs.map((chunk) => chunk.chunkId))
      const coveringCellIds = [...new Set([...shardLeafIds]
        .flatMap((leafId) => cellsByLeaf.get(leafId) ?? []))].sort(compareUtf8Bytes)
      const coveredLeafIds = [...shardLeafIds]
        .filter((leafId) => (cellsByLeaf.get(leafId) ?? []).length > 0)
        .sort(compareUtf8Bytes)
      const expectedLeafIds = [...shardLeafIds].sort(compareUtf8Bytes)
      if (canonical(coveredLeafIds) !== canonical(expectedLeafIds)) {
        fail(`review graph shard disposition is incomplete:${state.key}:${shard.shardId}`)
      }
      shardDispositions.push({
        taskKey: state.key,
        shardId: shard.shardId,
        claimCount: shard.claimIds.length,
        disposition: shard.claimIds.length ? 'claim-review' : (
          state.descriptor.identity.taskKind === 'judgment' ? 'judgment-review' : 'shared-review'
        ),
        coverageCellIds: coveringCellIds,
      })
    }
  }

  const synthesisUnits = [...tasks.values()].flatMap((state) => (
    reviewGraphSynthesisTree(
      state.key,
      state.cells.map((cell) => cell.cellId),
      taskSet.taskSetDigest,
    )
  )).map((unit, ordinal) => ({ ...unit, ordinal }))
  const { batches, totals } = reviewGraphDispatchBatches(
    workUnits,
    synthesisUnits,
    tasks.size,
    planState,
  )
  const expectedClaims = descriptors.flatMap((descriptor) => descriptor.shards.flatMap((shard) => (
    shard.claimIds.map((claimId) => `${taskKey(descriptor.identity)}\0${claimId}`)
  )))
  const actualClaims = cells.flatMap((cell) => cell.claimIds.map((claimId) => `${cell.taskKey}\0${claimId}`))
  const claimOwnershipDuplicateCount = actualClaims.length - new Set(actualClaims).size
  const claimContextLeafUses = cells
    .filter((cell) => cell.cellKind === 'component-claim-review-cell')
    .flatMap((cell) => cell.leafIds.map((leafId) => `${cell.taskKey}\0${leafId}`))
  const claimContextUniqueLeafUseCount = new Set(claimContextLeafUses).size
  const claimContextReuseCount =
    claimContextLeafUses.length - claimContextUniqueLeafUseCount
  const expectedJudgmentShards = descriptors
    .filter((descriptor) => descriptor.identity.taskKind === 'judgment')
    .flatMap((descriptor) => descriptor.shards.map((shard) => `${taskKey(descriptor.identity)}\0${shard.shardId}`))
  const actualJudgmentShards = sourceCoverageCells
    .filter((cell) => cell.cellKind === 'judgment-applicability-cell')
    .flatMap((cell) => cell.shardIds.map((shardId) => `${cell.taskKey}\0${shardId}`))
  const expectedSharedLeaves = [...tasks.values()]
    .filter((state) => state.descriptor.identity.taskKind === 'component-a1b')
    .flatMap((state) => [...state.taskLeaves.keys()]
      .filter((leafId) => !state.claimBoundLeafIds.has(leafId))
      .map((leafId) => `${state.key}\0${leafId}`))
    .sort(compareUtf8Bytes)
  const actualSharedLeaves = cells
    .filter((cell) => cell.cellKind === 'shared-evidence-review-cell')
    .flatMap((cell) => cell.leafIds.map((leafId) => `${cell.taskKey}\0${leafId}`))
    .sort(compareUtf8Bytes)
  const exactSet = (expected, actual) => (
    expected.length === new Set(expected).size
    && actual.length === new Set(actual).size
    && canonical([...expected].sort(compareUtf8Bytes)) === canonical([...actual].sort(compareUtf8Bytes))
  )
  if (!exactSet(expectedClaims, actualClaims)
    || !exactSet(expectedJudgmentShards, actualJudgmentShards)
    || !exactSet(expectedSharedLeaves, actualSharedLeaves)
    || rawCorpusTasks.some((row) => row.unknownLeafCount !== 0)) {
    fail('review graph exact coverage, uniqueness, or applicability closure failed')
  }
  const logicalSourceBytes = [...tasks.values()].reduce((sum, state) => (
    sum + [...state.taskLeaves.values()].reduce((taskSum, leaf) => taskSum + leaf.bytes, 0)
  ), 0)
  const uniqueLeafBytes = [...leaves.values()].reduce((sum, leaf) => sum + leaf.bytes, 0)
  const proofProjection = {
    expectedTaskCount: taskSet.expectedTaskCount,
    actualTaskCount: tasks.size,
    expectedShardCount: descriptors.reduce((sum, descriptor) => sum + descriptor.shardCount, 0),
    actualShardDispositionCount: shardDispositions.length,
    expectedClaimCount: expectedClaims.length,
    actualClaimCount: actualClaims.length,
    claimCoverageOwnershipCount: actualClaims.length,
    claimCoverageOwnershipDuplicateCount: claimOwnershipDuplicateCount,
    claimContextLeafUseCount: claimContextLeafUses.length,
    claimContextUniqueLeafUseCount,
    claimContextReuseCount,
    claimContextReuseIsCoverageOverlap: false,
    claimContextReusePolicy:
      'content-addressed-identical-evidence-context-reuse-not-claim-coverage-ownership',
    expectedJudgmentShardCount: expectedJudgmentShards.length,
    actualJudgmentShardCount: actualJudgmentShards.length,
    expectedSharedLeafUseCount: expectedSharedLeaves.length,
    actualSharedLeafUseCount: actualSharedLeaves.length,
    rawCorpusTaskCount: rawCorpusTasks.length,
    rawCorpusDispositionCount,
    applicableLeafUseCount: rawCorpusDispositionCount,
    notApplicableLeafUseCount: 0,
    unknownApplicabilityCount: 0,
    missingCount: 0,
    unexpectedCount: 0,
    duplicateCount: 0,
    overlapCount: 0,
    sourceCoverageCellCount: coveragePartitionProof.sourceCoverageCellCount,
    sourceCoverageCellSetDigest: coveragePartitionProof.sourceCoverageCellSetDigest,
    fragmentedSourceCoverageCellCount:
      coveragePartitionProof.fragmentedSourceCoverageCellCount,
    coverageFragmentCount: coveragePartitionProof.coverageFragmentCount,
    partitionedLeafCount: coveragePartitionProof.partitionedLeafCount,
    coveragePartitionDigest: coveragePartitionProof.coveragePartitionDigest,
    coveragePartitionMissingCount: coveragePartitionProof.missingCount,
    coveragePartitionDuplicateCount: coveragePartitionProof.duplicateCount,
    coveragePartitionOverlapCount: coveragePartitionProof.overlapCount,
    zeroClaimStandaloneWorkUnitCount: 0,
    modelReviewWorkUnitCount: workUnits.length,
    judgmentReviewWorkUnitCount: workUnits.filter(
      (unit) => unit.unitKind === 'multiplexed-judgment-review',
    ).length,
    componentClaimReviewWorkUnitCount: workUnits.filter(
      (unit) => unit.unitKind === 'component-claim-review',
    ).length,
    sharedEvidenceReviewWorkUnitCount: workUnits.filter(
      (unit) => unit.unitKind === 'content-addressed-shared-evidence-review',
    ).length,
    taskSynthesisProviderCallCount: 0,
    deterministicTaskReductionCount: synthesisUnits.length,
    sampling: false,
    complete: true,
  }
  const proof = {
    ...proofProjection,
    expectedClaimSetDigest: sha256(canonical([...expectedClaims].sort(compareUtf8Bytes))),
    actualClaimSetDigest: sha256(canonical([...actualClaims].sort(compareUtf8Bytes))),
    rawCorpusDispositionDigest: rawDispositionHash.digest('hex'),
    coverageCompletenessDigest: sha256(canonical(proofProjection)),
  }
  const projection = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-provider-neutral-no-sample-review-graph',
    protocol: planState.plan.executionMode,
    protocolExtension: planState.plan.reviewGraph.protocolExtension,
    synthesisExecution: planState.plan.reviewGraph.synthesisExecution,
    brokerPlanDigest: planState.planDigest,
    taskSetDigest: taskSet.taskSetDigest,
    runIdentity,
    taskCount: tasks.size,
    taskDescriptorDigests: descriptors.map((descriptor) => descriptor.descriptorDigest),
    uniqueEvidenceLeafCount: leaves.size,
    uniqueEvidenceLeafSetDigest: sha256(canonical([...leaves.keys()].sort(compareUtf8Bytes))),
    uniqueEvidenceLeafBytes: uniqueLeafBytes,
    logicalSourceBytes,
    rawCorpus: {
      dispositionPolicy: planState.plan.reviewGraph.rawCorpusPolicy,
      unknownApplicability: planState.plan.reviewGraph.unknownApplicability,
      tasks: rawCorpusTasks,
    },
    sourceCoverageCellCount: sourceCoverageCells.length,
    sourceCoverageCellSetDigest:
      coveragePartitionProof.sourceCoverageCellSetDigest,
    coveragePartitionCount: coveragePartitions.length,
    coveragePartitions,
    coverageCellCount: cells.length,
    coverageCells: cells,
    shardDispositionCount: shardDispositions.length,
    shardDispositions,
    reviewWorkUnitCount: workUnits.length,
    reviewWorkUnits: workUnits,
    synthesisUnitCount: synthesisUnits.length,
    synthesisUnits,
    deterministicReductionUnitCount: synthesisUnits.length,
    dispatchBatchCount: batches.length,
    dispatchBatches: batches,
    dispatchTotals: totals,
    proof,
    structuralOnly: true,
    genuineCrossProviderReview: false,
    promotionEligible: false,
  }
  const reviewGraph = { ...projection, reviewGraphDigest: canonicalDigest(projection) }
  Object.defineProperty(reviewGraph, CANONICALLY_BUILT_REVIEW_GRAPH, {
    enumerable: false,
    value: reviewGraph.reviewGraphDigest,
  })
  return reviewGraph
}

export function validateBrokerNoSampleReviewGraph(graph, options = {}) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    fail('no-sample review graph is invalid')
  }
  const { reviewGraphDigest, ...projection } = graph
  if (!SHA256.test(reviewGraphDigest ?? '')
    || reviewGraphDigest !== canonicalDigest(projection)) {
    fail('no-sample review graph digest is invalid or stale')
  }
  if (graph[CANONICALLY_BUILT_REVIEW_GRAPH] === reviewGraphDigest) return graph
  const expected = buildBrokerNoSampleReviewGraph(options)
  if (canonicalDigest(graph) !== canonicalDigest(expected)) {
    fail('no-sample review graph is stale, substituted, incomplete, duplicated, or reordered')
  }
  return graph
}

function structuralReviewGraphResultProjection(graph, unit) {
  if (unit.unitKind === 'task-hierarchical-synthesis') {
    return {
      schemaVersion: 1,
      evidenceKind: 'deep-audit-review-graph-synthesis-result',
      attestationState: 'structural-unattested',
      reviewGraphDigest: graph.reviewGraphDigest,
      taskSetDigest: graph.taskSetDigest,
      unitKind: unit.unitKind,
      unitId: unit.synthesisUnitId,
      unitDigest: unit.synthesisUnitDigest,
      ordinal: unit.ordinal,
      taskKey: unit.taskKey,
      stage: unit.stage,
      inputKind: unit.inputKind,
      inputIds: [...unit.inputIds],
      status: 'structurally-reviewed',
    }
  }
  return {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-review-graph-work-result',
    attestationState: 'structural-unattested',
    reviewGraphDigest: graph.reviewGraphDigest,
    taskSetDigest: graph.taskSetDigest,
    unitKind: unit.unitKind,
    unitId: unit.workUnitId,
    unitDigest: unit.workUnitDigest,
    ordinal: unit.ordinal,
    coveredCellIds: [...unit.coverageCellIds],
    reviewedLeafIds: [...unit.leafIds],
    status: 'structurally-reviewed',
  }
}

export function buildBrokerStructuralReviewGraphResult(graph, unit) {
  if (!graph || !unit) fail('structural review graph result inputs are invalid')
  const projection = structuralReviewGraphResultProjection(graph, unit)
  return { ...projection, resultDigest: sha256(canonical(projection)) }
}

function validateStructuralReviewGraphResults(graph, units, results, label) {
  if (!Array.isArray(results) || results.length !== units.length) {
    fail(`${label} is partial or contains unexpected completion`)
  }
  const seen = new Set()
  return results.map((result, ordinal) => {
    const expected = buildBrokerStructuralReviewGraphResult(graph, units[ordinal])
    if (seen.has(result?.unitId) || canonical(result) !== canonical(expected)) {
      fail(`${label} is duplicated, reordered, stale, or substituted:${String(result?.unitId)}`)
    }
    seen.add(result.unitId)
    return result
  })
}

export function closeBrokerNoSampleReviewGraph({
  graph,
  workResults,
  synthesisResults,
  taskSet,
  taskDescriptors,
  planState,
} = {}) {
  validateBrokerNoSampleReviewGraph(graph, { taskSet, taskDescriptors, planState })
  const reviewed = validateStructuralReviewGraphResults(
    graph,
    graph.reviewWorkUnits,
    workResults,
    'review graph work results',
  )
  const reviewedCellIds = reviewed.flatMap((result) => result.coveredCellIds)
  const expectedCellIds = graph.coverageCells.map((cell) => cell.cellId)
  if (reviewedCellIds.length !== new Set(reviewedCellIds).size
    || canonical([...reviewedCellIds].sort(compareUtf8Bytes))
      !== canonical([...expectedCellIds].sort(compareUtf8Bytes))) {
    fail('review graph work results do not close every applicability cell exactly once')
  }
  const synthesized = validateStructuralReviewGraphResults(
    graph,
    graph.synthesisUnits,
    synthesisResults,
    'review graph synthesis results',
  )
  const completedSynthesisIds = new Set()
  for (const result of synthesized) {
    const available = result.inputKind === 'coverage-cells'
      ? new Set(reviewedCellIds)
      : completedSynthesisIds
    if (result.inputIds.some((inputId) => !available.has(inputId))) {
      fail(`review graph aggregation occurred before all prerequisite inputs completed:${result.taskKey}`)
    }
    completedSynthesisIds.add(result.unitId)
  }
  for (const taskKeyValue of graph.rawCorpus.tasks.map((row) => row.taskKey)) {
    const roots = graph.synthesisUnits.filter((unit) => unit.taskKey === taskKeyValue)
    const dependedOn = new Set(roots.flatMap((unit) => (
      unit.inputKind === 'synthesis-units' ? unit.inputIds : []
    )))
    const terminal = roots.filter((unit) => !dependedOn.has(unit.synthesisUnitId))
    if (terminal.length !== 1 || !completedSynthesisIds.has(terminal[0].synthesisUnitId)) {
      fail(`review graph task synthesis lacks exactly one completed root:${taskKeyValue}`)
    }
  }
  const projection = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-provider-neutral-no-sample-review-closure',
    reviewGraphDigest: graph.reviewGraphDigest,
    taskSetDigest: graph.taskSetDigest,
    coverageCompletenessDigest: graph.proof.coverageCompletenessDigest,
    workResultCount: reviewed.length,
    workResultSetDigest: sha256(canonical(reviewed.map((result) => result.resultDigest))),
    synthesisResultCount: synthesized.length,
    synthesisResultSetDigest: sha256(canonical(synthesized.map((result) => result.resultDigest))),
    deterministicReductionCount: synthesized.length,
    synthesisProviderCallCount: 0,
    taskCount: graph.taskCount,
    coverageCellCount: graph.coverageCellCount,
    fullNoSampleStructuralClosure: true,
    aggregateVerdict: 'structural-no-sample-complete-unattested',
    structuralOnly: true,
    genuineCrossProviderReview: false,
    managedEvidence: false,
    promotionEligible: false,
  }
  return { ...projection, closureDigest: sha256(canonical(projection)) }
}

function sumDispatchEstimates(estimates, label) {
  const total = {
    totalSourceBytes: 0,
    shardCount: 0,
    providerCalls: 0,
    costUnits: 0,
  }
  for (const estimate of estimates) {
    exactKeys(
      estimate,
      ['totalSourceBytes', 'shardCount', 'providerCalls', 'costUnits'],
      `${label} estimate`,
    )
    for (const key of Object.keys(total)) {
      if (!Number.isSafeInteger(estimate[key]) || estimate[key] < 0
        || !Number.isSafeInteger(total[key] + estimate[key])) {
        fail(`${label} estimate is invalid or exceeds safe integer range:${key}`)
      }
      total[key] += estimate[key]
    }
  }
  return total
}

function enforceFullReviewBudget(taskCount, estimate, budget, label) {
  exactKeys(budget, [
    'maxTaskCount', 'maxTotalSourceBytes', 'maxShardCount', 'maxProviderCalls', 'maxCostUnits',
  ], `${label} budget`)
  if (!Number.isSafeInteger(taskCount) || taskCount <= 0 || taskCount > budget.maxTaskCount) {
    fail(`${label} pre-dispatch budget exceeded without sampling:taskCount=${taskCount}>${budget.maxTaskCount}`)
  }
  const { maxTaskCount, ...dispatchBudget } = budget
  enforceDispatchBudget(estimate, dispatchBudget, label)
}

function buildBrokerDispatchScheduleInternal(taskSet, taskDescriptors, planState) {
  const { descriptors, keys, runIdentity } = validateOrderedTaskDescriptors(taskDescriptors, planState)
  validateBrokerTaskSet(taskSet, { taskDescriptors: descriptors, planState })
  const logicalTotals = sumDispatchEstimates(
    descriptors.map((descriptor) => descriptor.estimate),
    'full review',
  )
  enforceFullReviewBudget(
    descriptors.length,
    logicalTotals,
    planState.plan.budgets.fullReview,
    'full review',
  )

  const batchesWithPrivateDescriptors = []
  let currentDescriptors = []
  const flushBatch = () => {
    if (!currentDescriptors.length) return
    const estimate = sumDispatchEstimates(
      currentDescriptors.map((descriptor) => descriptor.estimate),
      `dispatch batch ${batchesWithPrivateDescriptors.length}`,
    )
    enforceDispatchBudget(
      estimate,
      planState.plan.budgets.dispatchBatch,
      `dispatch batch ${batchesWithPrivateDescriptors.length}`,
    )
    const taskAssignments = currentDescriptors.map((descriptor) => ({
      taskKey: taskKey(descriptor.identity),
      taskDescriptorDigest: descriptor.descriptorDigest,
      shardIds: descriptor.shards.map((shard) => shard.shardId),
    }))
    const projection = {
      schemaVersion: 1,
      batchOrdinal: batchesWithPrivateDescriptors.length,
      taskAssignments,
      taskKeys: taskAssignments.map((assignment) => assignment.taskKey),
      taskDescriptorDigests: taskAssignments.map((assignment) => assignment.taskDescriptorDigest),
      shardIds: taskAssignments.flatMap((assignment) => assignment.shardIds),
      estimate,
    }
    batchesWithPrivateDescriptors.push({
      ...projection,
      batchId: sha256(canonical({
        taskSetDigest: taskSet.taskSetDigest,
        runIdentity,
        ...projection,
      })),
      _descriptors: currentDescriptors,
    })
    currentDescriptors = []
  }
  for (const descriptor of descriptors) {
    const candidateEstimate = sumDispatchEstimates(
      [...currentDescriptors, descriptor].map((item) => item.estimate),
      `dispatch batch ${batchesWithPrivateDescriptors.length}`,
    )
    if (currentDescriptors.length
      && !withinDispatchBudget(candidateEstimate, planState.plan.budgets.dispatchBatch)) {
      flushBatch()
    }
    currentDescriptors.push(descriptor)
    const currentEstimate = sumDispatchEstimates(
      currentDescriptors.map((item) => item.estimate),
      `dispatch batch ${batchesWithPrivateDescriptors.length}`,
    )
    if (!withinDispatchBudget(currentEstimate, planState.plan.budgets.dispatchBatch)) {
      enforceDispatchBudget(
        currentEstimate,
        planState.plan.budgets.dispatchBatch,
        `whole-task dispatch batch ${batchesWithPrivateDescriptors.length}`,
      )
    }
  }
  flushBatch()

  const batches = batchesWithPrivateDescriptors.map(({ _descriptors, ...batch }) => batch)
  const expectedUnits = descriptors.flatMap((descriptor) => descriptor.shards.map((shard) => (
    `${taskKey(descriptor.identity)}\0${shard.shardId}`
  )))
  const actualAssignments = batches.flatMap((batch) => batch.taskAssignments)
  const actualTaskKeys = actualAssignments.map((assignment) => assignment.taskKey)
  const actualUnits = actualAssignments.flatMap((assignment) => (
    assignment.shardIds.map((shardId) => `${assignment.taskKey}\0${shardId}`)
  ))
  const expectedSet = new Set(expectedUnits)
  const actualSet = new Set(actualUnits)
  const missing = expectedUnits.filter((unit) => !actualSet.has(unit))
  const unexpected = actualUnits.filter((unit) => !expectedSet.has(unit))
  const duplicateCount = actualUnits.length - actualSet.size
  const taskOccurrences = new Map()
  for (const key of actualTaskKeys) taskOccurrences.set(key, (taskOccurrences.get(key) ?? 0) + 1)
  const overlapCount = [...taskOccurrences.values()]
    .reduce((sum, count) => sum + Math.max(0, count - 1), 0)
  const sampling = missing.length > 0 || actualUnits.length < expectedUnits.length
  const complete = missing.length === 0
    && unexpected.length === 0
    && duplicateCount === 0
    && overlapCount === 0
    && !sampling
    && canonical(actualTaskKeys) === canonical(taskSet.expectedTaskKeys)
    && canonical(actualUnits) === canonical(expectedUnits)
  const coverageProjection = {
    expectedTaskCount: taskSet.expectedTaskCount,
    actualTaskCount: new Set(actualTaskKeys).size,
    expectedShardCount: expectedUnits.length,
    actualShardCount: actualUnits.length,
    expectedCoverageDigest: sha256(canonical(expectedUnits)),
    actualCoverageDigest: sha256(canonical(actualUnits)),
    missingCount: missing.length,
    unexpectedCount: unexpected.length,
    duplicateCount,
    overlapCount,
    sampling,
    complete,
  }
  if (!complete) fail('run pre-dispatch schedule lacks ordered exact-once whole-task/shard coverage')
  const coverageProof = {
    ...coverageProjection,
    coverageCompletenessDigest: sha256(canonical(coverageProjection)),
  }
  const scheduleProjection = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-provider-neutral-dispatch-schedule',
    protocol: planState.plan.executionMode,
    brokerPlanDigest: planState.planDigest,
    taskSetDigest: taskSet.taskSetDigest,
    taskSetScopeKind: taskSet.scopeKind,
    runIdentity,
    budgetSemantics: {
      perShard: 'canonical-context-limits',
      wholeTask: 'each-logical-task-is-indivisible',
      dispatchBatch: 'ordered-whole-task-packing-with-summed-logical-estimates',
      fullReview: 'all-expected-tasks-required-no-sampling',
    },
    taskCount: descriptors.length,
    tasks: descriptors.map((descriptor) => {
      const key = taskKey(descriptor.identity)
      const batch = batches.find((candidate) => (
        candidate.taskAssignments.some((assignment) => assignment.taskKey === key)
      ))
      return {
        taskKey: key,
        taskKind: descriptor.identity.taskKind,
        subject: descriptor.identity.subject,
        descriptorDigest: descriptor.descriptorDigest,
        shardSetDigest: descriptor.shardSetDigest,
        inputArtifactSetDigest: descriptor.inputArtifactSetDigest,
        coverageInventoryDigest: descriptor.identity.coverageInventoryDigest,
        sourceSetDigest: descriptor.identity.sourceSetDigest,
        claimInventoryDigest: descriptor.claimInventoryDigest,
        shardCount: descriptor.shardCount,
        estimate: descriptor.estimate,
        batchId: batch?.batchId ?? null,
      }
    }),
    batchCount: batches.length,
    batches,
    logicalTotals,
    coverageProof,
    structuralCoverageAuthorized: true,
    executionAuthorized: false,
  }
  return {
    ...scheduleProjection,
    scheduleDigest: sha256(canonical(scheduleProjection)),
  }
}

export function buildBrokerDispatchSchedule({
  shardSets = null,
  taskDescriptors = null,
  taskSet,
  planState,
} = {}) {
  if (!planState?.plan?.budgets || !taskSet || (shardSets === null) === (taskDescriptors === null)) {
    fail('dispatch schedule requires a task set, exactly one of shardSets or taskDescriptors, and the canonical broker plan')
  }
  const descriptors = taskDescriptors ?? shardSets.map((shardSet) => (
    buildBrokerTaskDispatchDescriptor(shardSet, { planState })
  ))
  return buildBrokerDispatchScheduleInternal(taskSet, descriptors, planState)
}

export function validateBrokerDispatchSchedule(schedule, {
  shardSets = null,
  taskDescriptors = null,
  taskSet,
  planState,
} = {}) {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    fail('broker dispatch schedule is invalid')
  }
  const expected = buildBrokerDispatchSchedule({
    shardSets,
    taskDescriptors,
    taskSet,
    planState,
  })
  if (canonical(schedule) !== canonical(expected)) {
    fail('broker dispatch schedule is stale, substituted, incomplete, duplicated, or reordered')
  }
  return true
}

const BROKER_GLOBAL_CONTENT_SET_KEYS = [
  'schemaVersion', 'evidenceKind', 'protocol', 'brokerPlanDigest', 'taskSetDigest',
  'runIdentity', 'taskCount', 'shardCount', 'tasks', 'carrierCount',
  'orderedCarrierSetDigest', 'blobUseCount', 'orderedBlobUseDigest',
  'uniqueBlobCount', 'uniqueBlobSetDigest', 'uniqueBlobBytes',
  'storageDeduplicationOnly', 'sampling', 'contentSetDigest',
]
const CANONICALLY_BUILT_GLOBAL_CONTENT_SET = Symbol('canonically-built-global-content-set')
const BROKER_SHARD_CARRIER_METADATA_KEYS = [
  'schemaVersion', 'evidenceKind', 'taskKey', 'ordinal', 'shardId', 'batchDigest',
  'descriptorDigest', 'carrierDigest', 'blobRefs', 'metadataDigest',
]

function digestCanonicalRows(rows) {
  const hash = createHash('sha256')
  for (const row of rows) hash.update(canonical(row)).update('\n')
  return hash.digest('hex')
}

function brokerShardCarrierMetadataProjection(bundle, shard, expectedTaskKey, ordinal) {
  if (typeof expectedTaskKey !== 'string' || !expectedTaskKey
    || !Number.isSafeInteger(ordinal) || ordinal < 0) {
    fail('broker shard carrier metadata task identity is invalid')
  }
  if (taskKey(shard.identity) !== expectedTaskKey) {
    fail('broker shard carrier metadata task key mismatches carrier identity')
  }
  const projection = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-model-shard-carrier-metadata',
    taskKey: expectedTaskKey,
    ordinal,
    shardId: shard.shardId,
    batchDigest: shard.batchDigest,
    descriptorDigest: bundle.carrier.descriptor.descriptorDigest,
    carrierDigest: bundle.carrier.carrierDigest,
    blobRefs: structuredClone(bundle.carrier.blobRefs),
  }
  return { ...projection, metadataDigest: sha256(canonical(projection)) }
}

export function buildBrokerShardCarrierMetadata(bundle, {
  taskKey: expectedTaskKey,
  ordinal,
  planState,
} = {}) {
  exactKeys(bundle, ['carrier', 'blobs'], 'broker shard carrier metadata bundle')
  const shard = materializeBrokerShardCarrier({ ...bundle, planState })
  return brokerShardCarrierMetadataProjection(bundle, shard, expectedTaskKey, ordinal)
}

export function exportBrokerShardCarrierWithMetadata(shard, {
  taskKey: expectedTaskKey,
  ordinal,
} = {}) {
  const bundle = exportBrokerShardCarrier(shard)
  return {
    ...bundle,
    metadata: brokerShardCarrierMetadataProjection(bundle, shard, expectedTaskKey, ordinal),
  }
}

export function validateBrokerShardCarrierMetadata(metadata) {
  exactKeys(metadata, BROKER_SHARD_CARRIER_METADATA_KEYS, 'broker shard carrier metadata')
  const { metadataDigest, ...projection } = metadata
  if (metadata.schemaVersion !== 1
    || metadata.evidenceKind !== 'deep-audit-model-shard-carrier-metadata'
    || typeof metadata.taskKey !== 'string' || !metadata.taskKey
    || !Number.isSafeInteger(metadata.ordinal) || metadata.ordinal < 0
    || !SHA256.test(metadata.shardId ?? '')
    || !SHA256.test(metadata.batchDigest ?? '')
    || !SHA256.test(metadata.descriptorDigest ?? '')
    || !SHA256.test(metadata.carrierDigest ?? '')
    || !Array.isArray(metadata.blobRefs)
    || metadata.blobRefs.length === 0
    || metadataDigest !== sha256(canonical(projection))) {
    fail('broker shard carrier metadata identity/content address is invalid')
  }
  for (const reference of metadata.blobRefs) {
    exactKeys(reference, ['sha256', 'bytes', 'encoding'], 'broker shard carrier metadata blob reference')
    if (!SHA256.test(reference.sha256 ?? '')
      || !Number.isSafeInteger(reference.bytes) || reference.bytes < 0
      || reference.encoding !== 'base64') {
      fail(`broker shard carrier metadata blob reference is invalid:${String(reference?.sha256)}`)
    }
  }
  if (canonical(metadata.blobRefs) !== canonical(
    [...metadata.blobRefs].sort((left, right) => compareUtf8Bytes(left.sha256, right.sha256)),
  ) || new Set(metadata.blobRefs.map((reference) => reference.sha256)).size !== metadata.blobRefs.length) {
    fail('broker shard carrier metadata blob references are duplicate or reordered')
  }
  return metadata
}

export function buildBrokerGlobalContentSet({
  taskSet,
  taskDescriptors,
  carrierMetadata,
  planState,
} = {}) {
  if (!Array.isArray(carrierMetadata) || carrierMetadata.length === 0) {
    fail('broker global content set requires ordered shard carrier metadata')
  }
  const { descriptors, runIdentity } = validateOrderedTaskDescriptors(taskDescriptors, planState)
  validateBrokerTaskSet(taskSet, { taskDescriptors: descriptors, planState })
  const expectedShardCount = descriptors.reduce((sum, descriptor) => sum + descriptor.shardCount, 0)
  if (carrierMetadata.length !== expectedShardCount) {
    fail('broker global content set carrier metadata count does not exactly match task descriptors')
  }
  const globalBlobRefsByDigest = new Map()
  let carrierCursor = 0
  const tasks = descriptors.map((descriptor) => {
    for (const [ordinal, shardReference] of descriptor.shards.entries()) {
      const metadata = validateBrokerShardCarrierMetadata(carrierMetadata[carrierCursor])
      carrierCursor += 1
      const expectedBlobRefsByDigest = new Map()
      for (const chunk of shardReference.chunkRefs) {
        const reference = {
          sha256: chunk.contentSha256,
          bytes: chunk.bytes,
          encoding: 'base64',
        }
        const previous = expectedBlobRefsByDigest.get(reference.sha256)
        if (previous && canonical(previous) !== canonical(reference)) {
          fail(`broker global content set descriptor substitutes blob metadata:${reference.sha256}`)
        }
        expectedBlobRefsByDigest.set(reference.sha256, reference)
      }
      const expectedBlobRefs = [...expectedBlobRefsByDigest.values()]
        .sort((left, right) => compareUtf8Bytes(left.sha256, right.sha256))
      if (metadata.taskKey !== taskKey(descriptor.identity)
        || metadata.ordinal !== ordinal
        || metadata.shardId !== shardReference.shardId
        || metadata.batchDigest !== shardReference.batchDigest
        || canonical(metadata.blobRefs) !== canonical(expectedBlobRefs)) {
        fail(`broker global content set substitutes or reorders shard carrier metadata:${taskKey(descriptor.identity)}:${ordinal}`)
      }
      for (const blobReference of metadata.blobRefs) {
        const previous = globalBlobRefsByDigest.get(blobReference.sha256)
        if (previous && canonical(previous) !== canonical(blobReference)) {
          fail(`broker global content set substitutes blob metadata:${blobReference.sha256}`)
        }
        globalBlobRefsByDigest.set(blobReference.sha256, structuredClone(blobReference))
      }
    }
    return {
      taskKey: taskKey(descriptor.identity),
      taskDescriptorDigest: descriptor.descriptorDigest,
      shardSetDigest: descriptor.shardSetDigest,
      shardCount: descriptor.shardCount,
    }
  })
  if (carrierCursor !== carrierMetadata.length) {
    fail('broker global content set contains unused carrier metadata')
  }
  const uniqueBlobRefs = [...globalBlobRefsByDigest.values()]
    .sort((left, right) => compareUtf8Bytes(left.sha256, right.sha256))
  const blobUseCount = carrierMetadata.reduce((sum, metadata) => sum + metadata.blobRefs.length, 0)
  const blobUseRows = function * () {
    for (const metadata of carrierMetadata) {
      for (const reference of metadata.blobRefs) {
        yield {
          taskKey: metadata.taskKey,
          ordinal: metadata.ordinal,
          sha256: reference.sha256,
          bytes: reference.bytes,
        }
      }
    }
  }
  const projection = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-model-global-content-set',
    protocol: planState.plan.executionMode,
    brokerPlanDigest: planState.planDigest,
    taskSetDigest: taskSet.taskSetDigest,
    runIdentity,
    taskCount: descriptors.length,
    shardCount: expectedShardCount,
    tasks,
    carrierCount: carrierMetadata.length,
    orderedCarrierSetDigest: digestCanonicalRows(carrierMetadata),
    blobUseCount,
    orderedBlobUseDigest: digestCanonicalRows(blobUseRows()),
    uniqueBlobCount: uniqueBlobRefs.length,
    uniqueBlobSetDigest: digestCanonicalRows(uniqueBlobRefs),
    uniqueBlobBytes: uniqueBlobRefs.reduce((sum, reference) => sum + reference.bytes, 0),
    storageDeduplicationOnly: true,
    sampling: false,
  }
  const contentSet = { ...projection, contentSetDigest: canonicalDigest(projection) }
  Object.defineProperty(contentSet, CANONICALLY_BUILT_GLOBAL_CONTENT_SET, {
    enumerable: false,
    value: contentSet.contentSetDigest,
  })
  return contentSet
}

export function validateBrokerGlobalContentSet(contentSet, {
  taskSet,
  taskDescriptors,
  carrierMetadata,
  planState,
} = {}) {
  exactKeys(contentSet, BROKER_GLOBAL_CONTENT_SET_KEYS, 'broker global content set')
  exactKeys(contentSet.runIdentity, SCHEDULE_RUN_IDENTITY_KEYS, 'broker global content-set run identity')
  const { contentSetDigest, ...projection } = contentSet
  if (!SHA256.test(contentSetDigest ?? '')
    || contentSetDigest !== canonicalDigest(projection)) {
    fail('broker global content set digest is invalid or stale')
  }
  if (contentSet[CANONICALLY_BUILT_GLOBAL_CONTENT_SET] === contentSetDigest) {
    return true
  }
  const expected = buildBrokerGlobalContentSet({
    taskSet,
    taskDescriptors,
    carrierMetadata,
    planState,
  })
  if (canonicalDigest(contentSet) !== canonicalDigest(expected)) {
    fail('broker global content set is stale, substituted, incomplete, duplicated, or reordered')
  }
  return true
}

export function validateBrokerShardSetEnvelope(shardSet, { planState } = {}) {
  const state = planState ?? loadModelEvidenceBrokerPlan()
  exactKeys(shardSet, [
    'schemaVersion', 'evidenceKind', 'identity', 'inputArtifactSet',
    'shardCount', 'shardIds', 'shardSetDigest', 'shards',
  ], 'broker shard set')
  exactKeys(shardSet.identity, SHARD_IDENTITY_KEYS, 'broker shard-set identity')
  if (shardSet.schemaVersion !== 1 || shardSet.evidenceKind !== 'deep-audit-content-shard-set'
    || shardSet.identity.brokerPlanDigest !== state.planDigest
    || shardSet.identity.resultSchemaSha256 !== state.resultSchemaSha256
    || shardSet.shardCount !== shardSet.shards?.length
    || shardSet.shardCount !== shardSet.shardIds?.length
    || shardSet.shardCount <= 0
    || new Set(shardSet.shardIds).size !== shardSet.shardCount
    || canonical(shardSet.shardIds) !== canonical(shardSet.shards.map((shard) => shard.shardId))) {
    fail('broker shard-set identity/count/order is invalid')
  }
  for (const key of [
    'manifestSha256', 'indexDigest', 'worktreeFingerprint', 'inventoryDigest', 'rubricDigest',
    'providerIdentityDigest', 'coverageInventoryDigest', 'brokerPlanDigest', 'modelEvidencePlanDigest',
    'resultSchemaSha256', 'sourceSetDigest', 'inputArtifactSetDigest',
  ]) digestField(shardSet.identity[key], `broker shard-set identity ${key}`)
  if (!['judgment', 'component-a1b'].includes(shardSet.identity.taskKind)
    || !Number.isSafeInteger(shardSet.identity.sourceChunkCount) || shardSet.identity.sourceChunkCount <= 0
    || !Number.isSafeInteger(shardSet.identity.totalSourceBytes) || shardSet.identity.totalSourceBytes < 0) {
    fail('broker shard-set task/source identity is invalid')
  }
  exactKeys(shardSet.inputArtifactSet, INPUT_ARTIFACT_SET_KEYS, 'broker shard-set input artifact set')
  const { artifactSetDigest, ...artifactProjection } = shardSet.inputArtifactSet
  if (artifactSetDigest !== sha256(canonical(artifactProjection))
    || artifactSetDigest !== shardSet.identity.inputArtifactSetDigest) {
    fail('broker shard-set input artifact-set digest is invalid')
  }
  for (const key of [
    'manifestSha256', 'head', 'tree', 'indexDigest', 'worktreeFingerprint', 'inventoryDigest',
    'rubricDigest', 'providerIdentityDigest', 'coverageInventoryDigest', 'taskKind', 'subject',
    'brokerPlanDigest', 'modelEvidencePlanDigest', 'resultSchemaSha256', 'sourceSetDigest',
    'sourceChunkCount', 'totalSourceBytes',
  ]) {
    if (canonical(shardSet.inputArtifactSet[key]) !== canonical(shardSet.identity[key])) {
      fail(`broker shard-set input artifact binding mismatches identity:${key}`)
    }
  }
  for (const shard of shardSet.shards) {
    exactKeys(shard, [
      'schemaVersion', 'evidenceKind', 'identity', 'rawContentBytes', 'chunks', 'claims', 'shardId',
      'claimEvidenceGraph', 'batchDigest', 'prompt', 'promptBytes', 'estimatedTokens',
    ], 'broker shard-set shard')
    if (shard.schemaVersion !== 1 || shard.evidenceKind !== 'deep-audit-content-shard'
      || canonical(shard.identity) !== canonical(shardSet.identity)
      || !Array.isArray(shard.chunks) || shard.chunks.length === 0
      || !Array.isArray(shard.claims)
      || shard.rawContentBytes !== shard.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)
      || shard.rawContentBytes > state.plan.limits.maxRawContentBytesPerShard
      || shard.chunks.length > state.plan.limits.maxChunksPerShard
      || shard.claims.length > state.plan.limits.maxClaimsPerShard) {
      fail(`broker shard-set shard identity/context budget is invalid:${String(shard?.shardId)}`)
    }
    const digestMaterial = {
      schemaVersion: 1,
      evidenceKind: 'deep-audit-content-shard',
      identity: shard.identity,
      rawContentBytes: shard.rawContentBytes,
      chunks: shard.chunks.map(({ content, ...chunk }) => chunk),
      claims: shard.claims,
      claimEvidenceGraph: shard.claimEvidenceGraph,
    }
    const promptEnvelope = {
      schemaVersion: 1,
      evidenceKind: 'deep-audit-content-shard-prompt',
      shardId: shard.shardId,
      identity: shard.identity,
      rawContentBytes: shard.rawContentBytes,
      chunks: shard.chunks,
      claims: shard.claims,
      claimEvidenceGraph: shard.claimEvidenceGraph,
    }
    const prompt = `${canonical(promptEnvelope)}\n`
    const promptBytes = Buffer.byteLength(prompt)
    if (shard.shardId !== sha256(canonical(digestMaterial))
      || shard.prompt !== prompt || shard.batchDigest !== sha256(prompt)
      || shard.promptBytes !== promptBytes
      || shard.estimatedTokens !== Math.ceil(promptBytes / state.plan.limits.bytesPerEstimatedToken)
      || promptBytes > state.plan.limits.maxPromptBytesPerShard
      || shard.estimatedTokens > state.plan.limits.maxEstimatedTokensPerShard) {
      fail(`broker shard-set shard content address/prompt is invalid:${String(shard?.shardId)}`)
    }
  }
  const sourceState = sourceSetState(shardSet.shards.flatMap((shard) => shard.chunks), {
    taskKind: shardSet.identity.taskKind,
    label: 'broker shard-set source closure',
  })
  if (shardSet.identity.taskKind === 'judgment') {
    const canonicalChunks = orderedUniqueSourceChunks(
      shardSet.shards.flatMap((shard) => shard.chunks),
      { taskKind: 'judgment', label: 'broker judgment canonical order' },
    )
    const expectedShards = packChunks(canonicalChunks, state.plan.limits, shardSet.identity)
    if (!sameCanonicalShardSequence(shardSet.shards, expectedShards)) {
      fail('broker judgment shard set is not the deterministic canonical grouping/order')
    }
  }
  if (sourceState.sourceSetDigest !== shardSet.identity.sourceSetDigest
    || sourceState.sourceChunkCount !== shardSet.identity.sourceChunkCount
    || sourceState.totalSourceBytes !== shardSet.identity.totalSourceBytes
    || sourceState.sourceSetDigest !== shardSet.inputArtifactSet.sourceSetDigest
    || sourceState.sourceChunkCount !== shardSet.inputArtifactSet.sourceChunkCount
    || sourceState.totalSourceBytes !== shardSet.inputArtifactSet.totalSourceBytes
    || shardSet.shardSetDigest !== shardSetDigest(
      shardSet.identity,
      shardSet.inputArtifactSet,
      shardSet.shards,
    )) {
    fail('broker shard-set source/artifact/content-address closure is invalid')
  }
  const estimate = dispatchEstimateForShards(
    shardSet.shards,
    state.plan.budgets.costUnitPromptBytes,
  )
  enforceDispatchBudget(estimate, state.plan.budgets.wholeTask, `whole task ${taskKey(shardSet.identity)}`)
  return estimate
}

export function estimateBrokerShardSetDispatch(shardSet, { planState } = {}) {
  const state = planState ?? loadModelEvidenceBrokerPlan()
  const estimate = validateBrokerShardSetEnvelope(shardSet, { planState: state })
  return {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-model-dispatch-estimate',
    taskKind: shardSet.identity.taskKind,
    subject: shardSet.identity.subject,
    ...estimate,
  }
}

export function preflightBrokerDispatch({
  shardSets = null,
  taskDescriptors = null,
  taskSet,
  planState,
} = {}) {
  return buildBrokerDispatchSchedule({
    shardSets,
    taskDescriptors,
    taskSet,
    planState,
  })
}

export function buildContentAddressedBrokerShards({
  repoRoot,
  manifest,
  manifestSha256,
  coveragePaths,
  coverageInventoryDigest,
  taskKind,
  subject,
  modelEvidencePlanDigest,
  dependencySourceInventory = null,
  claimInventory = null,
  planState = loadModelEvidenceBrokerPlan({ repoRoot }),
} = {}) {
  if (!['judgment', 'component-a1b'].includes(taskKind)) fail(`broker task kind is invalid:${String(taskKind)}`)
  if (taskKind === 'component-a1b') {
    if (!dependencySourceInventory || dependencySourceInventory.component !== subject
      || !claimInventory || claimInventory.component !== subject
      || claimInventory.supportingSourceSetDigest !== dependencySourceInventory.dependencySourceInventoryDigest
      || claimInventory.claimCount !== claimInventory.claims?.length) {
      fail('A1b broker requires the exact frozen claim/dependency-source inventories')
    }
    validateDependencySourceInventoryIdentity(dependencySourceInventory)
    if (dependencySourceInventory.dispositionSummary.unknownCount !== 0) {
      fail('A1b broker refuses an unresolved dependency applicability universe')
    }
  } else if (dependencySourceInventory !== null || claimInventory !== null) {
    fail('judgment broker cannot receive component claim/dependency inventories')
  }
  const contentRoot = realpathSync(resolve(repoRoot))
  const expectedCoverageDigest = sha256(canonical(coveragePaths.map((path) => {
    const row = manifest.inventory.find((item) => item.path === path)
    if (!row) fail(`broker coverage path is absent from frozen manifest:${path}`)
    return row
  })))
  if (coverageInventoryDigest !== expectedCoverageDigest) fail('broker coverage inventory digest is not derived from frozen manifest rows')
  const chunks = chunksForCoverage({
    repoRoot: contentRoot,
    manifest,
    coveragePaths,
    limits: planState.plan.limits,
    dependencySourceInventory,
  })
  const sourceState = sourceSetState(chunks, {
    taskKind,
    label: `broker task source set:${taskKind}:${String(subject)}`,
  })
  const inputArtifactSet = buildBrokerInputArtifactSet({
    manifest,
    manifestSha256,
    coverageInventoryDigest,
    taskKind,
    subject,
    brokerPlanDigest: planState.planDigest,
    modelEvidencePlanDigest,
    resultSchemaSha256: planState.resultSchemaSha256,
    ...sourceState,
  })
  const identity = brokerShardIdentity({
    manifest,
    inputArtifactSet,
    dependencySourceInventory,
    maxClaimsPerShard: planState.plan.limits.maxClaimsPerShard,
  })
  const shards = taskKind === 'component-a1b'
    ? packA1bChunks(
        chunks,
        planState.plan.limits,
        identity,
        claimInventory.claims,
        dependencySourceInventory,
        claimInventory.claimInventoryDigest,
        planState.plan.reviewGraph.maxPreparedRequestFixedBytes,
        planState.plan.reviewGraph,
      )
    : packChunks(chunks, planState.plan.limits, identity)
  validateBrokerShardClosure({
    manifest,
    manifestSha256,
    coveragePaths,
    coverageInventoryDigest,
    taskKind,
    subject,
    modelEvidencePlanDigest,
    inputArtifactSet,
    dependencySourceInventory,
    claimInventory,
    planState,
    shards,
  })
  const shardSet = {
    schemaVersion: 1,
    evidenceKind: 'deep-audit-content-shard-set',
    identity,
    inputArtifactSet,
    shardCount: shards.length,
    shardIds: shards.map((shard) => shard.shardId),
    shardSetDigest: shardSetDigest(identity, inputArtifactSet, shards),
    shards,
  }
  estimateBrokerShardSetDispatch(shardSet, { planState })
  return shardSet
}

export function validateBrokerShardClosure({
  manifest,
  manifestSha256,
  coveragePaths,
  coverageInventoryDigest,
  taskKind,
  subject,
  modelEvidencePlanDigest,
  inputArtifactSet,
  dependencySourceInventory = null,
  claimInventory = null,
  planState,
  shards,
} = {}) {
  if (!Array.isArray(shards) || shards.length === 0) fail('broker shard set is empty')
  if (!Array.isArray(coveragePaths) || coveragePaths.length === 0
    || new Set(coveragePaths).size !== coveragePaths.length
    || canonical(coveragePaths) !== canonical([...coveragePaths].sort(compareUtf8Bytes))) {
    fail('broker closure coverage paths must be non-empty, unique, and sorted')
  }
  if (taskKind === 'component-a1b' && (!dependencySourceInventory || !claimInventory
    || claimInventory.supportingSourceSetDigest !== dependencySourceInventory.dependencySourceInventoryDigest)) {
    fail('A1b broker closure lacks its claim/dependency-source inventories')
  }
  if (dependencySourceInventory !== null) validateDependencySourceInventoryIdentity(dependencySourceInventory)
  if (new Set(shards.map((shard) => shard.shardId)).size !== shards.length
    || new Set(shards.map((shard) => shard.batchDigest)).size !== shards.length) fail('broker shard set contains duplicate shard/batch identities')
  const initialSourceState = sourceSetState(shards.flatMap((shard) => shard.chunks), {
    taskKind,
    label: `broker closure source set:${taskKind}:${String(subject)}`,
  })
  const expectedInputArtifactSet = buildBrokerInputArtifactSet({
    manifest,
    manifestSha256,
    coverageInventoryDigest,
    taskKind,
    subject,
    brokerPlanDigest: planState.planDigest,
    modelEvidencePlanDigest,
    resultSchemaSha256: planState.resultSchemaSha256,
    ...initialSourceState,
  })
  validateInputArtifactSet(inputArtifactSet, expectedInputArtifactSet)
  const expectedIdentity = brokerShardIdentity({
    manifest,
    inputArtifactSet: expectedInputArtifactSet,
    dependencySourceInventory,
    maxClaimsPerShard: planState.plan.limits.maxClaimsPerShard,
  })
  const expectedCoverageDigest = sha256(canonical(coveragePaths.map((path) => {
    const row = manifest.inventory.find((item) => item.path === path)
    if (!row) fail(`broker coverage path is absent from frozen manifest:${path}`)
    return row
  })))
  if (coverageInventoryDigest !== expectedCoverageDigest) fail('broker coverage digest mismatches frozen manifest rows')
  const manifestRows = new Map(manifest.inventory.map((row) => [row.path, row]))
  const sourceExpectations = new Map(coveragePaths.map((path) => {
    const row = manifestRows.get(path)
    if (!row || !['file', 'symlink'].includes(row.kind)) fail(`broker closure path is absent from frozen readable content:${path}`)
    return [path, {
      path,
      sourceKind: 'repository-source',
      sourceId: sha256(canonical({ sourceKind: 'repository-source', path, bytes: row.bytes, sha256: row.sha256 })),
      bytes: row.bytes,
      sha256: row.sha256,
      packageName: null,
      packageVersion: null,
      lockfileIntegrity: null,
      mediaType: null,
    }]
  }))
  for (const source of dependencySourceInventory?.sources ?? []) {
    exactKeys(source, [
      'sourceKind', 'path', 'packageName', 'packageVersion', 'lockfileIntegrity', 'mediaType',
      'bytes', 'sha256', 'sourceId', 'encoding', 'content',
    ], 'broker closure dependency source')
    const sourceBytes = Buffer.from(source.content, 'base64')
    const expectedSourceId = sha256(canonical({
      sourceKind: source.sourceKind,
      path: source.path,
      packageName: source.packageName,
      packageVersion: source.packageVersion,
      lockfileIntegrity: source.lockfileIntegrity,
      mediaType: source.mediaType,
      bytes: source.bytes,
      sha256: source.sha256,
    }))
    if (!['claim-source', 'repository-source', 'dependency-source'].includes(source.sourceKind)
      || !['text', 'binary'].includes(source.mediaType) || source.encoding !== 'base64'
      || sourceBytes.toString('base64') !== source.content || sourceBytes.length !== source.bytes
      || sha256(sourceBytes) !== source.sha256 || source.sourceId !== expectedSourceId) {
      fail(`broker closure dependency source identity/content is invalid:${String(source.path)}`)
    }
    if (source.sourceKind !== 'dependency-source' && coveragePaths.includes(source.path)) {
      const frozen = manifestRows.get(source.path)
      if (!frozen || frozen.bytes !== source.bytes || frozen.sha256 !== source.sha256) {
        fail(`broker closure component-owned source differs from frozen repository coverage:${source.path}`)
      }
      continue
    }
    if (sourceExpectations.has(source.path)) fail(`broker dependency/repository source path collides:${source.path}`)
    sourceExpectations.set(source.path, source)
  }
  const observedByPath = new Map([...sourceExpectations].map(([path]) => [path, []]))
  const uniqueChunks = new Map()
  const observedClaims = []
  for (const shard of shards) {
    exactKeys(shard, [
      'schemaVersion', 'evidenceKind', 'identity', 'rawContentBytes', 'chunks', 'claims', 'shardId',
      'claimEvidenceGraph', 'batchDigest', 'prompt', 'promptBytes', 'estimatedTokens',
    ], 'broker shard')
    if (shard.schemaVersion !== 1 || shard.evidenceKind !== 'deep-audit-content-shard') {
      fail(`broker shard schema/evidence kind is invalid:${String(shard.shardId)}`)
    }
    if (canonical(shard.identity) !== canonical(expectedIdentity)) fail(`broker shard mixes a different run/provider task:${shard.shardId}`)
    if (shard.rawContentBytes > planState.plan.limits.maxRawContentBytesPerShard
      || shard.promptBytes > planState.plan.limits.maxPromptBytesPerShard
      || shard.estimatedTokens > planState.plan.limits.maxEstimatedTokensPerShard
      || shard.chunks.length > planState.plan.limits.maxChunksPerShard) fail(`broker shard exceeds context budget:${shard.shardId}`)
    if (!Array.isArray(shard.claims) || shard.claims.length > planState.plan.limits.maxClaimsPerShard) {
      fail(`broker shard claim batch exceeds context budget:${shard.shardId}`)
    }
    if (taskKind === 'component-a1b') {
      exactKeys(shard.claimEvidenceGraph, [
        'schemaVersion', 'status', 'reason', 'requiredEvidenceDigest', 'requiredChunkCount',
        'requiredRawContentBytes', 'allowedSupportingChunkIds', 'implementationChunkIds',
        'dependencyPackages', 'claimBindings', 'graphDigest',
      ], 'A1b claim-evidence graph')
      if (shard.claimEvidenceGraph.schemaVersion !== 1
        || !['self-contained', 'unverifiable-source-trust', 'unverifiable-context-budget'].includes(shard.claimEvidenceGraph.status)
        || shard.claimEvidenceGraph.graphDigest !== graphDigest(shard.claimEvidenceGraph)) {
        fail(`A1b claim-evidence graph is invalid:${shard.shardId}`)
      }
      if (!Array.isArray(shard.claimEvidenceGraph.allowedSupportingChunkIds)
        || !Array.isArray(shard.claimEvidenceGraph.implementationChunkIds)
        || !Array.isArray(shard.claimEvidenceGraph.dependencyPackages)
        || !Array.isArray(shard.claimEvidenceGraph.claimBindings)) {
        fail(`A1b claim-evidence graph collections are invalid:${shard.shardId}`)
      }
      for (const item of shard.claimEvidenceGraph.dependencyPackages) {
        exactKeys(item, ['packageName', 'chunkIds'], 'A1b claim-evidence dependency package')
      }
      for (const item of shard.claimEvidenceGraph.claimBindings) {
        exactKeys(item, ['claimId', 'line', 'claimSourceChunkIds'], 'A1b claim-evidence binding')
      }
    } else if (shard.claimEvidenceGraph !== null) {
      fail(`judgment shard cannot contain an A1b claim-evidence graph:${shard.shardId}`)
    }
    for (const claim of shard.claims) {
      const expected = claimInventory?.claims?.find((item) => item.claimId === claim?.claimId)
      if (!expected || canonical(claim) !== canonical(expected)) fail(`broker shard contains a fabricated/mutated claim:${String(claim?.claimId)}`)
      observedClaims.push(claim.claimId)
    }
    let shardRawBytes = 0
    const shardChunkIds = new Set()
    for (const chunk of shard.chunks) {
      exactKeys(chunk, [
        'sourceKind', 'sourceId', 'path', 'packageName', 'packageVersion', 'lockfileIntegrity',
        'mediaType', 'fileSha256', 'fileBytes', 'chunkIndex', 'chunkCount', 'offset', 'bytes',
        'lineStart', 'lineEnd', 'contentSha256', 'encoding', 'content', 'chunkId',
      ], 'broker shard chunk')
      if (shardChunkIds.has(chunk.chunkId)) fail(`broker shard repeats a chunk identity:${chunk.chunkId}`)
      shardChunkIds.add(chunk.chunkId)
      if (!observedByPath.has(chunk.path)) fail(`broker shard contains content outside canonical applicability:${chunk.path}`)
      const expectedSource = sourceExpectations.get(chunk.path)
      if (chunk.sourceKind !== expectedSource.sourceKind || chunk.sourceId !== expectedSource.sourceId
        || chunk.packageName !== expectedSource.packageName || chunk.packageVersion !== expectedSource.packageVersion
        || chunk.lockfileIntegrity !== expectedSource.lockfileIntegrity
        || (expectedSource.mediaType !== null && chunk.mediaType !== expectedSource.mediaType)) {
        fail(`broker shard chunk source provenance is invalid:${chunk.path}`)
      }
      if (!['text', 'binary'].includes(chunk.mediaType) || chunk.encoding !== 'base64'
        || !Number.isSafeInteger(chunk.offset) || chunk.offset < 0
        || !Number.isSafeInteger(chunk.bytes) || chunk.bytes < 0) {
        fail(`broker shard chunk encoding/range is invalid:${chunk.chunkId}`)
      }
      if ((chunk.mediaType === 'binary' && (chunk.lineStart !== null || chunk.lineEnd !== null))
        || (chunk.mediaType === 'text' && chunk.bytes === 0 && (chunk.lineStart !== null || chunk.lineEnd !== null))
        || (chunk.mediaType === 'text' && chunk.bytes > 0
          && (!Number.isSafeInteger(chunk.lineStart) || chunk.lineStart <= 0
            || !Number.isSafeInteger(chunk.lineEnd) || chunk.lineEnd < chunk.lineStart))) {
        fail(`broker shard chunk line bounds are invalid:${chunk.chunkId}`)
      }
      const bytes = Buffer.from(chunk.content, 'base64')
      if (bytes.toString('base64') !== chunk.content || bytes.length !== chunk.bytes || sha256(bytes) !== chunk.contentSha256) {
        fail(`broker shard chunk content digest is invalid:${chunk.chunkId}`)
      }
      const { content, chunkId, ...chunkIdentity } = chunk
      if (chunk.chunkId !== sha256(canonical(chunkIdentity))) fail(`broker shard chunkId is not reproducible:${chunk.chunkId}`)
      shardRawBytes += chunk.bytes
      const previous = uniqueChunks.get(chunk.chunkId)
      if (previous && canonical(previous) !== canonical(chunk)) fail(`broker shard substitutes a duplicate chunk identity:${chunk.chunkId}`)
      if (!previous) {
        uniqueChunks.set(chunk.chunkId, chunk)
        observedByPath.get(chunk.path).push(chunk)
      }
    }
    if (shardRawBytes !== shard.rawContentBytes) fail(`broker shard raw byte total is false:${shard.shardId}`)
    const digestMaterial = {
      schemaVersion: 1,
      evidenceKind: 'deep-audit-content-shard',
      identity: shard.identity,
      rawContentBytes: shard.rawContentBytes,
      chunks: shard.chunks.map(({ content, ...chunk }) => chunk),
      claims: shard.claims,
      claimEvidenceGraph: shard.claimEvidenceGraph,
    }
    if (shard.shardId !== sha256(canonical(digestMaterial))) fail(`broker shardId is not reproducible:${shard.shardId}`)
    const promptEnvelope = {
      schemaVersion: 1,
      evidenceKind: 'deep-audit-content-shard-prompt',
      shardId: shard.shardId,
      identity: shard.identity,
      rawContentBytes: shard.rawContentBytes,
      chunks: shard.chunks,
      claims: shard.claims,
      claimEvidenceGraph: shard.claimEvidenceGraph,
    }
    const expectedPrompt = `${canonical(promptEnvelope)}\n`
    const expectedPromptBytes = Buffer.byteLength(expectedPrompt)
    if (shard.prompt !== expectedPrompt || shard.batchDigest !== sha256(expectedPrompt)
      || shard.promptBytes !== expectedPromptBytes
      || shard.estimatedTokens !== Math.ceil(expectedPromptBytes / planState.plan.limits.bytesPerEstimatedToken)) {
      fail(`broker shard prompt/digest/budget is not reproducible:${shard.shardId}`)
    }
  }
  const expectedClaimIds = claimInventory?.claims?.map((claim) => claim.claimId).sort(compareUtf8Bytes) ?? []
  const sortedObservedClaims = [...observedClaims].sort(compareUtf8Bytes)
  if (new Set(observedClaims).size !== observedClaims.length
    || canonical(sortedObservedClaims) !== canonical(expectedClaimIds)) {
    fail('broker shard set does not include every canonical claim exactly once')
  }
  const canonicalFlat = []
  for (const [path, chunks] of observedByPath) {
    const row = sourceExpectations.get(path)
    chunks.sort((left, right) => left.offset - right.offset)
    let offset = 0
    const ids = new Set()
    const content = []
    for (const chunk of chunks) {
      if (ids.has(chunk.chunkId) || chunk.offset !== offset || chunk.fileSha256 !== row.sha256
        || chunk.fileBytes !== row.bytes || chunk.chunkIndex !== ids.size || chunk.chunkCount !== chunks.length) {
        fail(`broker shard closure is missing, duplicate, reordered, or mixed:${path}`)
      }
      ids.add(chunk.chunkId)
      offset += chunk.bytes
      content.push(Buffer.from(chunk.content, 'base64'))
    }
    const bytes = Buffer.concat(content)
    if (offset !== row.bytes || sha256(bytes) !== row.sha256) fail(`broker shard closure does not cover/reconstruct every frozen byte:${path}`)
    const mediaType = row.mediaType ?? (isCanonicalUtf8Text(bytes) ? 'text' : 'binary')
    const expectedChunks = chunksForSource({
      bytes,
      limits: planState.plan.limits,
      sourceKind: row.sourceKind,
      sourceId: row.sourceId,
      path,
      packageName: row.packageName,
      packageVersion: row.packageVersion,
      lockfileIntegrity: row.lockfileIntegrity,
      mediaType,
      fileSha256: row.sha256,
    })
    if (!sameCanonicalChunkSequence(chunks, expectedChunks)) {
      fail(`broker shard chunks do not use canonical UTF-8/newline-safe boundaries:${path}`)
    }
    canonicalFlat.push(...expectedChunks)
  }
  const expectedShards = taskKind === 'component-a1b'
    ? packA1bChunks(
        canonicalFlat,
        planState.plan.limits,
        expectedIdentity,
        claimInventory.claims,
        dependencySourceInventory,
        claimInventory.claimInventoryDigest,
        planState.plan.reviewGraph.maxPreparedRequestFixedBytes,
        planState.plan.reviewGraph,
      )
    : packChunks(canonicalFlat, planState.plan.limits, expectedIdentity)
  if (!sameCanonicalShardSequence(shards, expectedShards)) {
    fail('broker shard set is not the deterministic canonical grouping/claim-evidence graph')
  }
  enforceDispatchBudget(
    dispatchEstimateForShards(shards, planState.plan.budgets.costUnitPromptBytes),
    planState.plan.budgets.wholeTask,
    `whole task ${taskKey(expectedIdentity)}`,
  )
  return true
}

export function reduceBrokerShardResults({
  shardSet,
  results,
  providerId,
  requestModelId,
  modelReleaseId,
  modelReleaseBindingDigest,
  modelReleaseRegistryDigest,
  selectedProfileDigest,
  claimInventory = null,
  planState = null,
} = {}) {
  if (!shardSet || !Array.isArray(results)
    || typeof providerId !== 'string' || !providerId
    || typeof requestModelId !== 'string' || !requestModelId
    || modelReleaseId !== `${providerId}/${requestModelId}`
    || !/^[a-f0-9]{64}$/.test(modelReleaseBindingDigest ?? '')
    || !/^[a-f0-9]{64}$/.test(modelReleaseRegistryDigest ?? '')
    || !/^[a-f0-9]{64}$/.test(selectedProfileDigest ?? '')) fail('broker reducer inputs/model release identity are invalid')
  validateBrokerShardSetEnvelope(shardSet, { planState: planState ?? undefined })
  const expected = shardSet.shardIds
  const resultByShard = new Map()
  for (const result of results) {
    if (!result || resultByShard.has(result.shardId)) {
      fail('broker reducer lacks exact once-only shard closure')
    }
    resultByShard.set(result.shardId, result)
  }
  if (resultByShard.size !== expected.length || expected.some((shardId) => !resultByShard.has(shardId))) {
    fail('broker reducer lacks exact once-only shard closure')
  }
  const ordered = expected.map((shardId) => resultByShard.get(shardId))
  const shardById = new Map(shardSet.shards.map((shard) => [shard.shardId, shard]))
  for (const result of ordered) {
    const shard = shardById.get(result.shardId)
    const a1b = shardSet.identity.taskKind === 'component-a1b'
    exactKeys(result, a1b
      ? ['schemaVersion', 'evidenceKind', 'runId', 'providerId', 'requestModelId', 'modelReleaseId', 'modelReleaseBindingDigest', 'modelReleaseRegistryDigest', 'selectedProfileDigest', 'taskKind', 'subject', 'shardId', 'batchDigest', 'chunkVerdicts', 'claimVerdicts', 'findings', 'summary']
      : ['schemaVersion', 'evidenceKind', 'runId', 'providerId', 'requestModelId', 'modelReleaseId', 'modelReleaseBindingDigest', 'modelReleaseRegistryDigest', 'selectedProfileDigest', 'taskKind', 'subject', 'shardId', 'batchDigest', 'chunkVerdicts', 'findings', 'summary'], 'broker shard result')
    if (!result || result.schemaVersion !== 1 || result.evidenceKind !== 'deep-audit-model-shard-result'
      || result.providerId !== providerId || result.requestModelId !== requestModelId
      || result.modelReleaseId !== modelReleaseId
      || result.modelReleaseBindingDigest !== modelReleaseBindingDigest
      || result.modelReleaseRegistryDigest !== modelReleaseRegistryDigest
      || result.selectedProfileDigest !== selectedProfileDigest
      || result.batchDigest !== shard.batchDigest
      || result.runId !== shard.identity.runId || result.taskKind !== shard.identity.taskKind
      || result.subject !== shard.identity.subject || !Array.isArray(result.findings)
      || typeof result.summary !== 'string' || !result.summary.trim()) {
      fail(`broker shard result identity/schema is invalid:${String(result?.shardId)}`)
    }
    if (!Array.isArray(result.chunkVerdicts)
      || result.chunkVerdicts.some((item) => !item || canonical(Object.keys(item).sort(compareUtf8Bytes)) !== canonical(['chunkId', 'status']) || item.status !== 'reviewed')) {
      fail(`broker shard result chunk verdict shape is invalid:${result.shardId}`)
    }
    const expectedChunkIds = shard.chunks.map((chunk) => chunk.chunkId).sort(compareUtf8Bytes)
    const observedChunkIds = result.chunkVerdicts.map((item) => item.chunkId).sort(compareUtf8Bytes)
    if (new Set(observedChunkIds).size !== observedChunkIds.length || canonical(observedChunkIds) !== canonical(expectedChunkIds)) {
      fail(`broker shard result does not verdict every chunk exactly once:${result.shardId}`)
    }
    const chunkById = new Map(shard.chunks.map((chunk) => [chunk.chunkId, chunk]))
    const graph = a1b ? shard.claimEvidenceGraph : null
    if (a1b) {
      exactKeys(graph, [
        'schemaVersion', 'status', 'reason', 'requiredEvidenceDigest', 'requiredChunkCount',
        'requiredRawContentBytes', 'allowedSupportingChunkIds', 'implementationChunkIds',
        'dependencyPackages', 'claimBindings', 'graphDigest',
      ], 'A1b claim-evidence graph')
      if (graph.schemaVersion !== 1 || graph.graphDigest !== graphDigest(graph)
        || !['self-contained', 'unverifiable-source-trust', 'unverifiable-context-budget'].includes(graph.status)) {
        fail(`A1b shard result is bound to an invalid claim-evidence graph:${result.shardId}`)
      }
      if (!Array.isArray(graph.allowedSupportingChunkIds) || !Array.isArray(graph.implementationChunkIds)
        || !Array.isArray(graph.dependencyPackages) || !Array.isArray(graph.claimBindings)) {
        fail(`A1b shard result claim-evidence graph collections are invalid:${result.shardId}`)
      }
      for (const dependency of graph.dependencyPackages) {
        exactKeys(dependency, ['packageName', 'chunkIds'], 'A1b claim-evidence dependency package')
        if (typeof dependency.packageName !== 'string' || !dependency.packageName || !Array.isArray(dependency.chunkIds)) {
          fail(`A1b claim-evidence dependency package is invalid:${result.shardId}`)
        }
      }
      for (const binding of graph.claimBindings) {
        exactKeys(binding, ['claimId', 'line', 'claimSourceChunkIds'], 'A1b claim-evidence binding')
        if (typeof binding.claimId !== 'string' || !Number.isSafeInteger(binding.line)
          || !Array.isArray(binding.claimSourceChunkIds) || binding.claimSourceChunkIds.length === 0) {
          fail(`A1b claim-evidence binding is invalid:${result.shardId}`)
        }
      }
    }
    const graphBindings = new Map((graph?.claimBindings ?? []).map((binding) => [binding.claimId, binding]))
    const allowedSupportingChunkIds = new Set(graph?.allowedSupportingChunkIds ?? [])
    for (const finding of result.findings) {
      const findingKeys = a1b
        ? ['chunkId', 'claimId', 'path', 'line', 'severity', 'claim', 'actual', 'recommendation']
        : ['chunkId', 'path', 'line', 'severity', 'rule', 'problem', 'recommendation']
      exactKeys(finding, findingKeys, 'broker shard finding')
      const chunk = chunkById.get(finding.chunkId)
      if (!chunk || chunk.mediaType !== 'text' || finding.path !== chunk.path
        || !Number.isSafeInteger(finding.line)
        || !Number.isSafeInteger(chunk.lineStart) || !Number.isSafeInteger(chunk.lineEnd)
        || finding.line < chunk.lineStart || finding.line > chunk.lineEnd
        || !['blocking', 'material', 'marginal'].includes(finding.severity)) fail(`broker shard finding is not bound to a reviewed chunk:${finding.chunkId}`)
      if (a1b && (!graphBindings.has(finding.claimId) || !allowedSupportingChunkIds.has(finding.chunkId))) {
        fail(`A1b broker finding is not bound to its shard claim-evidence graph:${finding.claimId}`)
      }
    }
    if (a1b) {
      if (!Array.isArray(result.claimVerdicts) || result.claimVerdicts.length > shard.identity.maxClaimsPerShard) {
        fail('A1b broker claim verdict batch exceeds plan')
      }
      const expectedShardClaims = shard.claims.map((claim) => claim.claimId).sort(compareUtf8Bytes)
      const observedShardClaims = result.claimVerdicts.map((verdict) => verdict?.claimId).sort(compareUtf8Bytes)
      if (new Set(observedShardClaims).size !== observedShardClaims.length
        || canonical(observedShardClaims) !== canonical(expectedShardClaims)) {
        fail(`A1b shard result lacks exact claim closure:${result.shardId}`)
      }
      for (const verdict of result.claimVerdicts) {
        exactKeys(verdict, ['claimId', 'status', 'supportingChunkIds'], 'A1b broker claim verdict')
        if (!['verified', 'false', 'unverifiable'].includes(verdict.status)
          || !Array.isArray(verdict.supportingChunkIds) || verdict.supportingChunkIds.length === 0
          || new Set(verdict.supportingChunkIds).size !== verdict.supportingChunkIds.length
          || canonical(verdict.supportingChunkIds) !== canonical([...verdict.supportingChunkIds].sort(compareUtf8Bytes))) {
          fail(`A1b broker claim verdict shape/citations are invalid:${verdict.claimId}`)
        }
        const binding = graphBindings.get(verdict.claimId)
        if (!binding) fail(`A1b claim lacks its deterministic claim-evidence binding:${verdict.claimId}`)
        if (verdict.supportingChunkIds.some((chunkId) => !allowedSupportingChunkIds.has(chunkId))) {
          fail(`A1b claim cites an unrelated chunk outside its claim-evidence graph:${verdict.claimId}`)
        }
        const claimRelevantChunkIds = new Set([
          ...binding.claimSourceChunkIds,
          ...graph.implementationChunkIds,
          ...graph.dependencyPackages.flatMap((dependency) => dependency.chunkIds),
        ])
        if (verdict.supportingChunkIds.some((chunkId) => !claimRelevantChunkIds.has(chunkId))) {
          fail(`A1b claim cites an unrelated chunk outside its deterministic claim binding:${verdict.claimId}`)
        }
        const cited = verdict.supportingChunkIds.map((chunkId) => chunkById.get(chunkId))
        if (cited.some((chunk) => !chunk)) fail(`A1b claim cites content outside its exact prompt shard:${verdict.claimId}`)
        if (!binding.claimSourceChunkIds.every((chunkId) => verdict.supportingChunkIds.includes(chunkId))) {
          fail(`A1b claim verdict does not cite its canonical claim-source line:${verdict.claimId}`)
        }
        if (graph.status !== 'self-contained' && verdict.status !== 'unverifiable') {
          fail(`A1b claim must be explicitly unverifiable when its bounded evidence graph is incomplete:${verdict.claimId}`)
        }
        if (verdict.status === 'verified') {
          if (shardSet.identity.dependencySourceStatus !== 'verified' || graph.status !== 'self-contained') {
            fail(`A1b claim cannot be verified from untrusted/missing/opaque dependency sources:${verdict.claimId}`)
          }
          if (!graph.implementationChunkIds.every((chunkId) => verdict.supportingChunkIds.includes(chunkId))) {
            fail(`A1b verified claim lacks a relevant repository implementation citation:${verdict.claimId}`)
          }
          for (const dependency of graph.dependencyPackages) {
            if (!dependency.chunkIds.every((chunkId) => verdict.supportingChunkIds.includes(chunkId))) {
              fail(`A1b wrapper claim lacks its relevant trusted dependency citation:${verdict.claimId}:${dependency.packageName}`)
            }
          }
        }
      }
    }
  }
  if (shardSet.identity.taskKind === 'component-a1b') {
    if (!claimInventory || !Array.isArray(claimInventory.claims)) fail('A1b broker reduction requires frozen claim inventory')
    const expectedClaims = claimInventory.claims.map((claim) => claim.claimId).sort(compareUtf8Bytes)
    if (claimInventory.supportingSourceSetDigest !== shardSet.identity.dependencySourceInventoryDigest) {
      fail('A1b broker reducer claim inventory does not bind the sharded dependency-source corpus')
    }
    const verdicts = ordered.flatMap((result) => result.claimVerdicts)
    const observedClaims = verdicts.map((item) => item.claimId).sort(compareUtf8Bytes)
    if (new Set(observedClaims).size !== observedClaims.length || canonical(observedClaims) !== canonical(expectedClaims)) fail('A1b broker reducer lacks exact claim verdict closure')
  }
  const dependencyFindings = shardSet.identity.taskKind === 'component-a1b'
    ? (claimInventory?.dependencySourceInventory?.findings ?? []).map((finding) => ({
        evidenceKind: 'dependency-source-unverifiable',
        ...finding,
      }))
    : []
  return {
    shardCount: ordered.length,
    shardResultDigest: sha256(canonical(ordered)),
    findings: [...dependencyFindings, ...ordered.flatMap((result) => result.findings)],
    dependencySourceStatus: shardSet.identity.dependencySourceStatus,
    claimStatus: shardSet.identity.taskKind === 'component-a1b'
      ? (ordered.flatMap((result) => result.claimVerdicts).some((verdict) => verdict.status === 'unverifiable')
          || dependencyFindings.length ? 'unverifiable' : 'closed')
      : null,
  }
}
