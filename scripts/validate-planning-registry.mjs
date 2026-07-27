#!/usr/bin/env node
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIRECTORY = resolve(ROOT, 'governance/planning')
const REGISTRY_PATH = resolve(DIRECTORY, 'registry.json')
const SCHEMA_PATH = resolve(ROOT, 'infra/governance/schemas/planning-registry.schema.json')

function invariant(condition, message) { if (!condition) throw new Error(message) }
function readJson(path, label) {
  const info = lstatSync(path)
  invariant(info.isFile() && !info.isSymbolicLink(), `${label} must be a regular no-symlink file`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function validatePlanningDocumentAuthority(document) {
  if (document.status === 'awaiting-approval') {
    invariant(
      /\bP2H\b/.test(document.reason)
        && /product\/UI\/UX SSOT/i.test(document.reason),
      `${document.path} awaiting-approval is reserved for a genuine product/UI/UX SSOT P2H decision`,
    )
  }
  return document
}

export function validatePlanningRegistry({ root = ROOT } = {}) {
  const directory = resolve(root, 'governance/planning')
  const registry = readJson(resolve(directory, 'registry.json'), 'planning registry')
  const schema = readJson(resolve(root, 'infra/governance/schemas/planning-registry.schema.json'), 'planning registry schema')
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  invariant(validate(registry), `planning registry schema failure:${(validate.errors || []).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`)
  const paths = registry.documents.map(document => document.path)
  invariant(new Set(paths).size === paths.length, 'planning registry paths must be unique')
  const actual = readdirSync(directory).filter(name => name !== 'README.md' && name !== 'registry.json').sort().map(name => `governance/planning/${name}`)
  invariant(JSON.stringify([...paths].sort()) === JSON.stringify(actual), `planning registry inventory drift: expected=${paths.length} actual=${actual.length}`)
  for (const document of registry.documents) {
    validatePlanningDocumentAuthority(document)
    invariant(document.executable === (document.status === 'active'), `${document.path} executable must be true exactly for active status`)
    if (document.path.includes('.completed.')) invariant(document.status === 'completed', `${document.path} filename requires completed status`)
    if (document.path.includes('.rejected.')) invariant(document.status === 'rejected', `${document.path} filename requires rejected status`)
    const absolute = resolve(root, document.path)
    invariant(absolute.startsWith(`${directory}/`), `planning registry path escapes directory:${document.path}`)
    const info = lstatSync(absolute)
    invariant(info.isFile() && !info.isSymbolicLink(), `planning document must be a regular no-symlink file:${document.path}`)
    if (document.path.endsWith('.md')) {
      const content = readFileSync(absolute, 'utf8')
      invariant(content.includes('governance/planning/registry.json'), `planning document lacks authority registry pointer:${document.path}`)
    } else {
      const content = readJson(absolute, document.path)
      invariant(content._authority === 'governance/planning/registry.json', `planning JSON lacks authority registry pointer:${document.path}`)
    }
  }
  return { documents: registry.documents.length, active: registry.documents.filter(document => document.status === 'active').map(document => document.path) }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    const result = validatePlanningRegistry()
    console.log(`Planning registry PASS: ${result.documents} document(s), ${result.active.length} active`)
  } catch (error) {
    console.error(`Planning registry FAIL: ${error.message}`)
    process.exit(1)
  }
}
