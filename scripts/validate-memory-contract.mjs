#!/usr/bin/env node
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bgh[opusr]_[A-Za-z0-9]{20,}\b/,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
  /\bsk-[A-Za-z0-9]{32,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
]

function invariant(condition, message) { if (!condition) throw new Error(message) }
function regular(path, label) {
  const info = lstatSync(path)
  invariant(info.isFile() && !info.isSymbolicLink(), `${label} must be a regular no-symlink file`)
  return info
}
function json(path, label) { regular(path, label); return JSON.parse(readFileSync(path, 'utf8')) }
const lines = content => content.length === 0 ? 0 : content.replace(/\n$/, '').split('\n').length

export function validateMemoryContract({ root = ROOT } = {}) {
  const directory = resolve(root, 'governance/memory')
  const contract = json(resolve(directory, 'contract.json'), 'memory contract')
  const schema = json(resolve(root, 'infra/governance/schemas/memory-contract.schema.json'), 'memory contract schema')
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  invariant(validate(contract), `memory contract schema failure:${(validate.errors || []).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`)
  const names = readdirSync(directory).sort()
  invariant(names.every(name => name === 'contract.json' || name.endsWith('.md')), `memory directory contains an unsupported top-level artifact:${names.filter(name => name !== 'contract.json' && !name.endsWith('.md')).join(',')}`)
  const indexPath = resolve(directory, contract.index)
  const readmePath = resolve(directory, contract.readme)
  regular(indexPath, 'memory index')
  regular(readmePath, 'memory README')
  const index = readFileSync(indexPath, 'utf8')
  const linkMatches = [...index.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)].map(match => match[1])
  invariant(new Set(linkMatches).size === linkMatches.length, 'memory index contains duplicate Markdown links')
  invariant(linkMatches.length <= contract.maxIndexEntries, `memory index exceeds ${contract.maxIndexEntries} entries:${linkMatches.length}`)
  const contentFiles = names.filter(name => name.endsWith('.md') && ![contract.index, contract.readme].includes(name))
  invariant(JSON.stringify([...linkMatches].sort()) === JSON.stringify(contentFiles), `memory index inventory drift: links=${linkMatches.length} files=${contentFiles.length}`)
  const planningRegistry = json(resolve(root, 'governance/planning/registry.json'), 'planning registry')
  const planningByPath = new Map(planningRegistry.documents.map(document => [document.path, document]))
  const planningPointers = [...new Set([...index.matchAll(/governance\/planning\/[^\s)`]+/g)].map(match => match[0]))].sort()
  for (const pointer of planningPointers) {
    const document = planningByPath.get(pointer)
    invariant(document, `memory index points to an unregistered plan:${pointer}`)
    invariant(document.status === 'active' && document.executable === true, `memory index points to a non-active plan:${pointer}:${document.status}`)
  }
  for (const name of [contract.index, ...contentFiles]) {
    const path = resolve(directory, name)
    regular(path, `memory ${name}`)
    const content = readFileSync(path, 'utf8')
    invariant(lines(content) <= contract.maxLinesPerMemory, `memory file exceeds ${contract.maxLinesPerMemory} lines:${name}:${lines(content)}`)
    for (const pattern of SECRET_PATTERNS) invariant(!pattern.test(content), `memory file contains a secret-shaped value:${name}:${pattern}`)
  }
  return { entries: linkMatches.length, files: contentFiles.length, planningPointers }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    const result = validateMemoryContract()
    console.log(`Memory contract PASS: ${result.entries} indexed file(s), ${result.planningPointers.length} active plan pointer(s)`)
  } catch (error) {
    console.error(`Memory contract FAIL: ${error.message}`)
    process.exit(1)
  }
}
