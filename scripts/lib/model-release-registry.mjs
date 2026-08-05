import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

export const DEFAULT_MODEL_RELEASE_REGISTRY = 'infra/governance/providers/model-release-registry.json'
export const DEFAULT_MODEL_RELEASE_REGISTRY_SCHEMA = 'infra/governance/schemas/model-release-registry.schema.json'
export const DEFAULT_MODEL_RELEASE_EVIDENCE_SCHEMA = 'infra/governance/schemas/model-release-documentation-assertion.schema.json'

function fail(message) {
  throw new Error(`model release registry blocked:${message}`)
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]))
}

const stable = (value) => JSON.stringify(normalize(value))
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function repositoryFile(root, path, label) {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes('\0') || isAbsolute(path)
    || path.split('/').some((part) => !part || part === '.' || part === '..')) fail(`${label} path is unsafe`)
  const absoluteRoot = realpathSync(resolve(root))
  const absolute = resolve(absoluteRoot, path)
  const rel = relative(absoluteRoot, absolute)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`${label} escapes repository`)
  let cursor = absoluteRoot
  for (const segment of rel.split(sep)) {
    cursor = resolve(cursor, segment)
    if (!existsSync(cursor)) fail(`${label} is missing:${path}`)
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) fail(`${label} crosses a symbolic link:${path}`)
    if (cursor === absolute && (!info.isFile() || info.nlink !== 1)) fail(`${label} must be a unique regular file:${path}`)
  }
  return absolute
}

function readJson(root, path, label) {
  const bytes = readFileSync(repositoryFile(root, path, label))
  if (bytes.length === 0) fail(`${label} is empty`)
  try { return { value: JSON.parse(bytes), bytes } } catch (error) { fail(`${label} is invalid JSON:${error.message}`) }
}

function compile(schema, label) {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  try { return { validate: ajv.compile(schema), ajv } } catch (error) { fail(`${label} cannot compile:${error.message}`) }
}

function validateWith(compiled, value, label) {
  if (!compiled.validate(value)) fail(`${label} schema failed:${compiled.ajv.errorsText(compiled.validate.errors, { separator: '; ' })}`)
}

export function loadModelReleaseRegistry({
  repoRoot = process.cwd(),
  registryPath = DEFAULT_MODEL_RELEASE_REGISTRY,
} = {}) {
  const root = realpathSync(resolve(repoRoot))
  const registryRead = readJson(root, registryPath, 'model release registry')
  const registrySchemaRead = readJson(root, DEFAULT_MODEL_RELEASE_REGISTRY_SCHEMA, 'model release registry schema')
  const evidenceSchemaRead = readJson(root, DEFAULT_MODEL_RELEASE_EVIDENCE_SCHEMA, 'model release documentation assertion schema')
  validateWith(compile(registrySchemaRead.value, 'model release registry schema'), registryRead.value, 'model release registry')
  const evidenceSchema = compile(evidenceSchemaRead.value, 'model release documentation assertion schema')
  const ids = registryRead.value.records.map((record) => record.id)
  if (new Set(ids).size !== ids.length || stable(ids) !== stable([...ids].sort())) {
    fail('records must be unique and sorted by id')
  }
  const providerModels = new Set()
  const evidenceCache = new Map()
  for (const record of registryRead.value.records) {
    const expectedId = `${record.providerId}/${record.requestModelId}`
    if (record.id !== expectedId || record.responseModelPolicy.expectedModelId !== record.requestModelId) {
      fail(`record identity/response policy is not exact:${record.id}`)
    }
    const providerModel = `${record.providerId}\0${record.requestModelId}`
    if (providerModels.has(providerModel)) fail(`provider/model is duplicated:${record.id}`)
    providerModels.add(providerModel)
    if (record.promotionEligible !== false || record.identityAssurance !== 'reviewed-provider-documentation-assertion') {
      fail(`canonical record must remain a fail-closed reviewed documentation assertion:${record.id}`)
    }
    if (record.validUntil !== null && Date.parse(record.validUntil) <= Date.parse(record.validFrom)) {
      fail(`release validity interval is empty or reversed:${record.id}`)
    }
    const evidencePath = record.reviewedDocumentationAssertion.artifactPath
    let evidence = evidenceCache.get(evidencePath)
    if (!evidence) {
      evidence = readJson(root, evidencePath, `model release documentation assertion:${evidencePath}`)
      validateWith(evidenceSchema, evidence.value, `model release documentation assertion:${evidencePath}`)
      evidenceCache.set(evidencePath, evidence)
    }
    if (sha256(evidence.bytes) !== record.reviewedDocumentationAssertion.artifactSha256
      || evidence.value.providerId !== record.providerId
      || evidence.value.sourceUrl !== record.reviewedDocumentationAssertion.reference
      || evidence.value.weightArtifactAvailable !== false) {
      fail(`release primary evidence is detached or overclaims weight proof:${record.id}`)
    }
  }
  return {
    root,
    registry: registryRead.value,
    records: registryRead.value.records,
    byId: new Map(registryRead.value.records.map((record) => [record.id, record])),
    registryDigest: sha256(registryRead.bytes),
    registrySchemaDigest: sha256(registrySchemaRead.bytes),
    evidenceSchemaDigest: sha256(evidenceSchemaRead.bytes),
  }
}

// resolvePromotionEligibleModelRelease and the managed-CI model-release
// authority chain (policy, signed four-document binding, external replay
// ledger) retired 2026-08-05: the promotion route had zero live callers and
// its authority endpoint machinery was retired with the activation cluster.
// Registry records remain identity-only, fail-closed claims.
