import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  assertRepositoryPath,
  compareUtf8Bytes,
  validateHookRegistrationSemantics,
  validateProviderRegistrySemantics,
} from './provider-runtime-contract.mjs'

export {
  assertAdapterOutputPath,
  assertRepositoryPath,
  buildProviderDiscoveryPolicy,
  buildProviderLifecycle,
  compareUtf8Bytes,
  hasUsableVersionedTranscript,
  projectProviderNativeEvent,
  resolveProviderMaterializer,
} from './provider-runtime-contract.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function assertNoSymlinkContractPath(root, relativePath, label) {
  if (typeof relativePath !== 'string' || !relativePath || isAbsolute(relativePath) || relativePath.includes('\\') || relativePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${label} must be a repository-relative POSIX path`)
  }
  const base = resolve(root)
  if (!existsSync(base)) throw new Error(`${label} repository root is missing`)
  const baseInfo = lstatSync(base)
  if (baseInfo.isSymbolicLink() || !baseInfo.isDirectory()) {
    throw new Error(`${label} repository root must be a real directory`)
  }
  const path = resolve(base, relativePath)
  const rel = relative(base, path)
  if (!rel || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
    throw new Error(`${label} escapes or aliases the repository root`)
  }
  let cursor = base
  for (const segment of rel.split(/[\\/]/).filter(Boolean)) {
    cursor = join(cursor, segment)
    if (!existsSync(cursor)) throw new Error(`${label} is missing:${relativePath}`)
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`${label} crosses a symbolic link:${relativePath}`)
  }
  const info = lstatSync(path)
  if (!info.isFile() || info.nlink !== 1) {
    throw new Error(`${label} must be one regular unaliased no-symlink file:${relativePath}`)
  }
  return path
}

export function readJsonContract(relativePath, label) {
  const path = assertNoSymlinkContractPath(ROOT, relativePath, label)
  return JSON.parse(readFileSync(path, 'utf8'))
}

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true })
const providerValidator = ajv.compile(readJsonContract('packages/governance/canonical/schemas/providers.schema.json', 'provider registry schema'))
const registrationValidator = ajv.compile(readJsonContract('packages/design-system/ds-canonical/hooks/registrations.schema.json', 'hook registrations schema'))
const skillSemanticsValidator = ajv.compile(readJsonContract('scripts/schemas/provider-skill-semantics.schema.json', 'provider skill semantics schema'))

function schemaError(label, validator) {
  const failures = (validator.errors || []).map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ')
  return new Error(`${label} violates its committed JSON Schema:${failures}`)
}

const WRITE_TRANSPORT_PAYLOAD_FIELD_COUNTS = Object.freeze({
  'full-file-v1': 2,
  'exact-replace-v1': 4,
  'exact-replace-list-v1': 5,
  'codex-apply-patch-v1': 1,
  'unified-diff-v1': 1,
})
const WRITE_TRANSPORT_ID_PATTERN = /^[a-z][a-z0-9-]*-v[1-9][0-9]*$/
const RAW_TOOL_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/
const PAYLOAD_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/

export function validateProviderWriteTransports(provider) {
  const providerId = typeof provider?.id === 'string' && provider.id ? provider.id : '<unknown-provider>'
  const normalization = provider?.normalization
  if (!normalization || !Array.isArray(normalization.writeTools) || !Array.isArray(normalization.writeTransports) || !normalization.writeTransports.length) {
    throw new Error(`${providerId}.normalization requires a non-empty declarative writeTransports registry`)
  }

  const declaredWriteTools = new Set(normalization.writeTools)
  const ids = new Set()
  const rawTools = new Set()
  let previousId = ''
  for (const [index, transport] of normalization.writeTransports.entries()) {
    const label = `${providerId}.normalization.writeTransports[${index}]`
    if (!transport || typeof transport !== 'object' || Array.isArray(transport)) {
      throw new Error(`${label} must be an object`)
    }
    if (typeof transport.id !== 'string' || !WRITE_TRANSPORT_ID_PATTERN.test(transport.id)) {
      throw new Error(`${label}.id must be a versioned write transport id`)
    }
    if (ids.has(transport.id)) throw new Error(`${providerId}:write transport id is duplicated:${transport.id}`)
    if (previousId && compareUtf8Bytes(previousId, transport.id) >= 0) {
      throw new Error(`${providerId}.normalization.writeTransports must be sorted by id`)
    }
    ids.add(transport.id)
    previousId = transport.id

    const expectedFieldCount = WRITE_TRANSPORT_PAYLOAD_FIELD_COUNTS[transport.engine]
    if (!expectedFieldCount) throw new Error(`${label}.engine is unsupported:${transport.engine}`)
    if (!Array.isArray(transport.payloadFields) || transport.payloadFields.length !== expectedFieldCount) {
      throw new Error(`${label}.payloadFields must contain ${expectedFieldCount} fields for ${transport.engine}`)
    }
    const seenFields = new Set()
    for (const field of transport.payloadFields) {
      if (typeof field !== 'string' || !PAYLOAD_FIELD_PATTERN.test(field)) {
        throw new Error(`${label}.payloadFields contains an invalid field path`)
      }
      if (seenFields.has(field)) throw new Error(`${label}.payloadFields contains a duplicate field path:${field}`)
      seenFields.add(field)
    }

    if (!Array.isArray(transport.rawTools) || !transport.rawTools.length) {
      throw new Error(`${label}.rawTools must be a non-empty array`)
    }
    const sortedRawTools = [...transport.rawTools].sort(compareUtf8Bytes)
    if (JSON.stringify(transport.rawTools) !== JSON.stringify(sortedRawTools)) {
      throw new Error(`${label}.rawTools must be sorted`)
    }
    for (const rawTool of transport.rawTools) {
      if (typeof rawTool !== 'string' || !RAW_TOOL_PATTERN.test(rawTool)) {
        throw new Error(`${label}.rawTools contains an invalid raw tool name`)
      }
      if (!declaredWriteTools.has(rawTool)) {
        throw new Error(`${label}.rawTools is not declared by normalization.writeTools:${rawTool}`)
      }
      if (rawTools.has(rawTool)) {
        throw new Error(`${providerId}:raw write tool is mapped by multiple transports:${rawTool}`)
      }
      rawTools.add(rawTool)
    }
  }
  return normalization.writeTransports
}

export function validateProviderRegistryDocument(registry) {
  if (!providerValidator(registry)) throw schemaError('provider adapter registry', providerValidator)
  for (const provider of registry.providers) validateProviderWriteTransports(provider)
  return validateProviderRegistrySemantics(registry)
}

export function validateHookRegistrations(registrations) {
  if (!registrationValidator(registrations)) throw schemaError('provider hook registrations', registrationValidator)
  return validateHookRegistrationSemantics(registrations)
}

export function validateProviderSkillSemanticsDocument(semantics) {
  if (!skillSemanticsValidator(semantics)) throw schemaError('provider skill semantics', skillSemanticsValidator)
  for (const [index, skill] of semantics.skills.entries()) {
    assertRepositoryPath(skill.sourceWorkflow, `skills[${index}].sourceWorkflow`)
    for (const [referenceIndex, reference] of (skill.requiredReferences || []).entries()) {
      assertRepositoryPath(reference, `skills[${index}].requiredReferences[${referenceIndex}]`)
    }
  }
  return semantics
}
