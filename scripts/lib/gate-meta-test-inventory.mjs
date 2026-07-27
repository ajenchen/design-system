import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { compareUtf8Bytes } from './provider-lifecycle.mjs'

export const GATE_META_TEST_EXCLUSIONS = 'scripts/gate-meta-test-exclusions.json'
export const GATE_META_TEST_EXECUTION_CLASSES = Object.freeze([
  'deterministic-isolated',
  'environmental-observation',
])

export function isCheckerGateFile(file) {
  const checker = /^(audit|check)-.*\.mjs$/.test(file)
    || /-invariant\.mjs$/.test(file)
    || /-coherence\.mjs$/.test(file)
    || /-invariants\.mjs$/.test(file)
  const exempt = /^gen-/.test(file)
    || /^test-/.test(file)
    || /^sync-/.test(file)
    || /\.baseline\.json$/.test(file)
    || file === 'audit-gate-meta-test-coverage.mjs'
  return checker && !exempt
}

export function discoverCheckerGates(root) {
  return readdirSync(join(resolve(root), 'scripts'))
    .filter(file => file.endsWith('.mjs') && isCheckerGateFile(file))
    .sort()
}

const ENTRY_KEYS = [
  'executionClass',
  'executionOwner',
  'fallback',
  'harness',
  'portabilityPolicy',
  'reason',
  'stem',
]

function fail(message) {
  throw new Error(`invalid gate meta-test exclusion inventory:${message}`)
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} keys must be exactly ${wanted.join(',')};got ${actual.join(',')}`)
  }
}

function readJson(path, label) {
  let value
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`${label} is not readable JSON:${error.message}`)
  }
  return value
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`)
}

export function discoverGateMetaTestPairs(root) {
  const scripts = join(resolve(root), 'scripts')
  return readdirSync(scripts)
    .filter((file) => /^test-.+\.mjs$/.test(file))
    .map((file) => ({ file, stem: file.replace(/^test-/, '').replace(/\.mjs$/, '') }))
    .filter(({ stem }) => existsSync(join(scripts, `${stem}.mjs`)))
    .sort((left, right) => compareUtf8Bytes(left.file, right.file))
}

function validateOwner(root, entry) {
  const owner = entry.executionOwner
  assertNonEmptyString(owner?.kind, `${entry.stem}.executionOwner.kind`)
  assertNonEmptyString(owner?.path, `${entry.stem}.executionOwner.path`)
  if (owner?.kind !== 'harness-registry') {
    assertNonEmptyString(owner?.evidence, `${entry.stem}.executionOwner.evidence`)
  }
  if (isAbsolute(owner.path) || owner.path.includes('\\')) {
    fail(`${entry.stem} execution owner path must be portable and repository-relative:${owner.path}`)
  }
  const ownerPath = resolve(root, owner.path)
  const ownerRelative = relative(root, ownerPath)
  if (ownerRelative === '..' || ownerRelative.startsWith(`..${sep}`) || isAbsolute(ownerRelative)) {
    fail(`${entry.stem} execution owner path escapes the repository:${owner.path}`)
  }
  if (!existsSync(ownerPath)) fail(`${entry.stem} execution owner path does not exist:${owner.path}`)

  if (owner.kind === 'package-script') {
    assertExactKeys(owner, ['kind', 'path', 'script', 'evidence'], `${entry.stem}.executionOwner`)
    assertNonEmptyString(owner.script, `${entry.stem}.executionOwner.script`)
    const packageJson = readJson(ownerPath, `${entry.stem} execution owner`)
    const command = packageJson.scripts?.[owner.script]
    if (typeof command !== 'string') fail(`${entry.stem} owner script is missing:${owner.script}`)
    if (!command.split(/\s*&&\s*/).includes(owner.evidence)) {
      fail(`${entry.stem} owner script ${owner.script} lacks evidence:${owner.evidence}`)
    }
    return
  }

  if (owner.kind === 'source-reference') {
    assertExactKeys(owner, ['kind', 'path', 'evidence'], `${entry.stem}.executionOwner`)
    if (!readFileSync(ownerPath, 'utf8').includes(owner.evidence)) {
      fail(`${entry.stem} owner source lacks evidence:${owner.evidence}`)
    }
    return
  }

  if (owner.kind === 'harness-registry') {
    assertExactKeys(owner, ['kind', 'path', 'command'], `${entry.stem}.executionOwner`)
    if (!Array.isArray(owner.command)
      || owner.command.length < 2
      || owner.command.some(token => typeof token !== 'string' || !token)) {
      fail(`${entry.stem} harness-registry owner command must be a non-empty argv array`)
    }
    const registry = readJson(ownerPath, `${entry.stem} execution owner`)
    const commandKey = JSON.stringify(owner.command)
    const matches = (registry.entries ?? [])
      .flatMap(candidate => candidate.commands ?? [])
      .filter(command => JSON.stringify(command) === commandKey)
    if (matches.length !== 1) {
      fail(`${entry.stem} harness-registry owner must register the exact command once;got ${matches.length}`)
    }
    return
  }

  fail(`${entry.stem} has unsupported execution owner kind:${owner.kind}`)
}

function validateExclusion(root, entry, discoverableByStem) {
  assertExactKeys(entry, ENTRY_KEYS, `entry ${entry?.stem ?? '<unknown>'}`)
  if (typeof entry.stem !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(entry.stem)) {
    fail(`entry stem is invalid:${entry.stem}`)
  }
  const pair = discoverableByStem.get(entry.stem)
  if (!pair) fail(`${entry.stem} is inert:there is no scripts/${entry.stem}.mjs + scripts/test-${entry.stem}.mjs pair`)
  if (entry.harness !== `scripts/${pair.file}`) {
    fail(`${entry.stem} harness must identify its discovered pair:scripts/${pair.file}`)
  }
  assertNonEmptyString(entry.reason, `${entry.stem}.reason`)
  if (!GATE_META_TEST_EXECUTION_CLASSES.includes(entry.executionClass)) {
    fail(`${entry.stem} has unsupported execution class:${entry.executionClass}`)
  }

  if (entry.executionClass === 'deterministic-isolated') {
    if (entry.portabilityPolicy !== 'required' || entry.fallback !== null) {
      fail(`${entry.stem} deterministic exclusion must be portability-required with no fallback`)
    }
    if (entry.executionOwner?.kind !== 'harness-registry') {
      fail(`${entry.stem} deterministic exclusion must name the canonical harness-registry execution owner`)
    }
    if (JSON.stringify(entry.executionOwner?.command) !== JSON.stringify(['node', entry.harness])) {
      fail(`${entry.stem} deterministic owner command must execute exactly node ${entry.harness}`)
    }
  } else {
    if (entry.portabilityPolicy !== 'excluded' || typeof entry.fallback !== 'string' || !entry.fallback.trim()) {
      fail(`${entry.stem} environmental observation must be portability-excluded with an explicit fallback`)
    }
    if (entry.executionOwner?.kind !== 'source-reference') {
      fail(`${entry.stem} environmental observation must name a source-reference owner`)
    }
  }
  validateOwner(root, entry)
}

export function createGateMetaTestInventory({
  root,
  exclusionDocument,
  exclusionPath,
} = {}) {
  assertNonEmptyString(root, 'repository root')
  const repositoryRoot = resolve(root)
  const discoverable = discoverGateMetaTestPairs(repositoryRoot)
  const inventoryPath = exclusionPath ?? join(repositoryRoot, GATE_META_TEST_EXCLUSIONS)
  const document = exclusionDocument ?? readJson(inventoryPath, GATE_META_TEST_EXCLUSIONS)
  assertExactKeys(document, ['entries', 'schemaVersion'], 'inventory document')
  if (document.schemaVersion !== 2) fail(`schemaVersion must be 2;got ${document.schemaVersion}`)
  if (!Array.isArray(document.entries)) fail('entries must be an array')

  const discoverableByStem = new Map(discoverable.map((pair) => [pair.stem, pair]))
  const entries = [...document.entries].sort((left, right) => compareUtf8Bytes(left.stem, right.stem))
  const seen = new Set()
  for (const entry of entries) {
    if (seen.has(entry?.stem)) fail(`duplicate exclusion stem:${entry.stem}`)
    seen.add(entry?.stem)
    validateExclusion(repositoryRoot, entry, discoverableByStem)
  }

  const excludedByStem = new Map(entries.map((entry) => [entry.stem, entry]))
  const runnable = discoverable.filter(({ stem }) => !excludedByStem.has(stem))
  const excludedByClass = Object.fromEntries(GATE_META_TEST_EXECUTION_CLASSES.map((name) => [name, []]))
  for (const entry of entries) excludedByClass[entry.executionClass].push(entry)

  return {
    discoverable,
    runnable,
    excluded: entries,
    excludedByClass,
  }
}
