#!/usr/bin/env node
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// ajv 只在完整驗證時才載入:SessionStart Check 8 經 --index-budget 叫本檔時,不該依賴 node_modules。
const require = createRequire(import.meta.url)
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

// memory 索引條目的數法(M17)。拿條數去比 contract.json maxIndexEntries 的呼叫端(session_start Check 8 的註解指回這裡、不重列):
//   - CI:本檔 validateMemoryContract(無參數執行)
//   - SessionStart Check 8:`--index-budget`(test_session_start_governance_check.sh Test 16 的 (a)(d) 兩格,換回數檔就紅)
//   - scripts/score-infra-best-practice.mjs D3:readMemoryIndexBudget(test-score-infra-best-practice.mjs 的 D3 那格,換回數檔就紅)
// 另有一處數 memory、但不比上限:stop_passive_logging.sh 遙測欄位 memory_entries 數內容檔(扣 MEMORY.md / README.md);
// 本檔 validateMemoryContract 的 inventory 檢查要求索引連結 = 內容檔,所以在 CI 綠的樹上兩者相等。
// 2026-11-18 之前 D3 自己數檔(連 README.md 也算)、上限寫死 20,和 CI 差 1(19 對 18)。
export function memoryIndexLinks(indexText) {
  return [...indexText.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)].map(match => match[1])
}

// SessionStart Check 8(經 --index-budget)與 score-infra D3 用:只讀 contract.json 的 index / maxIndexEntries 與索引本身,
// 數條目;其餘契約由 CI 的完整驗證判。
export function readMemoryIndexBudget({ root = ROOT } = {}) {
  const directory = resolve(root, 'governance/memory')
  const contract = json(resolve(directory, 'contract.json'), 'memory contract')
  invariant(Number.isInteger(contract.maxIndexEntries) && contract.maxIndexEntries >= 1, 'memory contract maxIndexEntries must be a positive integer')
  invariant(typeof contract.index === 'string' && contract.index === basename(contract.index), 'memory contract index must be a bare file name')
  const indexPath = resolve(directory, contract.index)
  regular(indexPath, 'memory index')
  return { entries: memoryIndexLinks(readFileSync(indexPath, 'utf8')).length, maxIndexEntries: contract.maxIndexEntries }
}

export function validateMemoryContract({ root = ROOT } = {}) {
  const directory = resolve(root, 'governance/memory')
  const contract = json(resolve(directory, 'contract.json'), 'memory contract')
  const schema = json(resolve(root, 'infra/governance/schemas/memory-contract.schema.json'), 'memory contract schema')
  const Ajv2020 = require('ajv/dist/2020.js')
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  invariant(validate(contract), `memory contract schema failure:${(validate.errors || []).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`)
  const names = readdirSync(directory).sort()
  invariant(names.every(name => name === 'contract.json' || name.endsWith('.md')), `memory directory contains an unsupported top-level artifact:${names.filter(name => name !== 'contract.json' && !name.endsWith('.md')).join(',')}`)
  const indexPath = resolve(directory, contract.index)
  const readmePath = resolve(directory, contract.readme)
  regular(indexPath, 'memory index')
  regular(readmePath, 'memory README')
  const index = readFileSync(indexPath, 'utf8')
  const linkMatches = memoryIndexLinks(index)
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
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--index-budget') {
    try {
      console.log(JSON.stringify(readMemoryIndexBudget()))
    } catch (error) {
      console.error(`Memory index budget FAIL: ${error.message}`)
      process.exit(1)
    }
  } else if (args.length === 0) {
    try {
      const result = validateMemoryContract()
      console.log(`Memory contract PASS: ${result.entries} indexed file(s), ${result.planningPointers.length} active plan pointer(s)`)
    } catch (error) {
      console.error(`Memory contract FAIL: ${error.message}`)
      process.exit(1)
    }
  } else {
    console.error('usage: node scripts/validate-memory-contract.mjs [--index-budget]')
    process.exit(2)
  }
}
