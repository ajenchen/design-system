import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'

export const DEFAULT_HOOK_EVIDENCE_PLAN = 'infra/governance/hook-evidence-plan.json'
export const DEFAULT_HOOK_EVIDENCE_PLAN_SCHEMA = 'infra/governance/schemas/hook-evidence-plan.schema.json'
const COVERAGE_MATRIX = 'scripts/audit-coverage-matrix.mjs'
const HOOK_REGISTRATIONS = 'packages/design-system/ds-canonical/hooks/registrations.json'
const HOOK_ROOT = 'packages/design-system/ds-canonical/hooks'
const FILE_EVENTS = new Set(['PreToolUse', 'PostToolUse'])
const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit'])
const ENFORCEMENT_OUTPUT_MODES = new Set(['blocking', 'governance-context', 'governance-decision', 'governance-context-or-block'])

function fail(message) {
  throw new Error(`hook evidence plan blocked:${message}`)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function repositoryPath(value, label, { directory = false } = {}) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || isAbsolute(value) || /\p{Cc}/u.test(value)) {
    fail(`${label} must be a safe repository-relative POSIX path`)
  }
  const trimmed = value.endsWith('/') ? value.slice(0, -1) : value
  if (!trimmed || trimmed.split('/').some(segment => !segment || segment === '.' || segment === '..')) fail(`${label} contains an unsafe segment`)
  if (directory !== value.endsWith('/')) fail(`${label} ${directory ? 'must' : 'must not'} end with slash`)
  return value
}

function contained(root, path, label) {
  const absoluteRoot = resolve(root)
  const absolute = resolve(absoluteRoot, path)
  const rel = relative(absoluteRoot, absolute)
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`${label} escapes the repository`)
  return absolute
}

function regularFile(root, path, label) {
  const absolute = contained(root, repositoryPath(path, label), label)
  let cursor = resolve(root)
  for (const segment of relative(resolve(root), absolute).split(sep)) {
    cursor = resolve(cursor, segment)
    if (!existsSync(cursor)) fail(`${label} is missing:${path}`)
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) fail(`${label} crosses a symbolic link:${path}`)
    if (cursor !== absolute && !info.isDirectory()) fail(`${label} crosses a non-directory:${path}`)
    if (cursor === absolute && (!info.isFile() || info.nlink !== 1)) fail(`${label} must be a regular non-aliased file:${path}`)
  }
  return absolute
}

function readJson(root, path, label) {
  const absolute = regularFile(root, path, label)
  const bytes = readFileSync(absolute)
  if (bytes.length === 0) fail(`${label} is empty`)
  try {
    return { value: JSON.parse(bytes.toString('utf8')), bytes }
  } catch (error) {
    fail(`${label} is invalid JSON:${error.message}`)
  }
}

function coverageHookDimensions(root) {
  const path = regularFile(root, COVERAGE_MATRIX, 'audit coverage matrix')
  const bytes = readFileSync(path)
  const entries = [...bytes.toString('utf8').matchAll(/^\s*(\d+):\s*\{\s*tier:\s*'([^']+)',\s*mechanism:\s*(.+?)\s*\},?\s*$/gm)]
    .map(match => {
      const mechanismExpression = match[3]
      const literal = mechanismExpression.match(/^'((?:\\.|[^'])*)'$/)
      return {
        dim: Number(match[1]),
        tier: match[2],
        mechanism: literal ? literal[1] : mechanismExpression,
      }
    })
  if (entries.length !== 91
    || entries.some((entry, index) => entry.dim !== index + 1)
    || new Set(entries.map(entry => entry.dim)).size !== 91) {
    fail('audit coverage matrix must enumerate ordered dimensions 1..91 exactly once')
  }
  const hookDimensions = entries.filter(entry => entry.tier === 'HOOK-ENFORCED')
  if (hookDimensions.length !== 39) fail(`audit coverage matrix HOOK-ENFORCED count differs from 39:${hookDimensions.length}`)
  return { hookDimensions, bytes }
}

function registeredHooks(registrations) {
  if (!registrations || registrations.schemaVersion !== 1 || !registrations.hooks || typeof registrations.hooks !== 'object') fail('canonical hook registrations are invalid')
  const records = []
  for (const [event, groups] of Object.entries(registrations.hooks)) {
    if (!Array.isArray(groups)) fail(`hook registration event must be an array:${event}`)
    for (const group of groups) {
      if (!group || typeof group.matcher !== 'string' || !Array.isArray(group.hooks)) fail(`hook registration group is invalid:${event}`)
      for (const descriptor of group.hooks) {
        if (descriptor?.kind === 'hook') records.push({ event, matcher: group.matcher, descriptor })
      }
    }
  }
  return records
}

function registrationFor(records, invocation, label) {
  const matches = records.filter(record => record.event === invocation.event
    && record.descriptor.hook === invocation.hook
    && (record.matcher === '' ? invocation.tool === '' : record.matcher.split('|').includes(invocation.tool)))
  if (matches.length !== 1) fail(`${label} hook is unregistered or event/tool is ambiguous:${invocation.hook}:${invocation.event}:${invocation.tool || '<empty>'}`)
  if (!['bash', 'node', 'python3'].includes(matches[0].descriptor.runtime)) fail(`${label} hook runtime is unsupported:${matches[0].descriptor.runtime}`)
  if (matches[0].descriptor.transcript !== undefined
    && !['none', 'optional', 'stable-required'].includes(matches[0].descriptor.transcript)) {
    fail(`${label} hook transcript contract is unsupported:${matches[0].descriptor.transcript}`)
  }
  if (!ENFORCEMENT_OUTPUT_MODES.has(matches[0].descriptor.outputMode)) {
    fail(`${label} hook outputMode is diagnostic-only and cannot count as native enforcement:${matches[0].descriptor.hook}`)
  }
  return matches[0]
}

function canonicalHookTest(hook) {
  return `test_${hook.replace(/\.(?:sh|py|mjs|js)$/, '')}.sh`
}

function validatePlanSemantics({ root, plan, coverage, registrations }) {
  const expected = coverage.hookDimensions.map(entry => entry.dim)
  const actual = plan.dimensions.map(dimension => dimension.dim)
  if (actual.length !== 39 || actual.some((dim, index) => dim !== expected[index])) {
    fail(`dimensions must exactly cover ordered HOOK-ENFORCED matrix:${expected.join(',')}`)
  }
  if (new Set(actual).size !== actual.length) fail('dimensions contain duplicates')
  if (new Set(plan.dimensions.map(dimension => dimension.capability)).size !== plan.dimensions.length) fail('dimension capabilities must be unique')

  const testsRoot = repositoryPath(plan.enforcementSuite.testsRoot, 'enforcementSuite.testsRoot', { directory: true })
  const expectedRunner = `${testsRoot}run-all.sh`
  if (plan.enforcementSuite.command.length !== 2
    || plan.enforcementSuite.command[0] !== 'bash'
    || plan.enforcementSuite.command[1] !== expectedRunner) {
    fail(`enforcementSuite.command must invoke the canonical full suite:${expectedRunner}`)
  }
  regularFile(root, expectedRunner, 'canonical hook enforcement suite')
  for (const prefix of plan.inventory.includePrefixes) repositoryPath(prefix, 'inventory include prefix', { directory: true })

  const coverageByDim = new Map(coverage.hookDimensions.map(entry => [entry.dim, entry]))
  const descriptors = registeredHooks(registrations)
  const boundRegistrations = []
  for (const dimension of plan.dimensions) {
    const matrix = coverageByDim.get(dimension.dim)
    const expectedRuleId = `DS-DIM-${String(dimension.dim).padStart(3, '0')}`
    if (dimension.ruleId !== expectedRuleId) fail(`dimension ${dimension.dim} ruleId mismatches:${dimension.ruleId}`)
    for (const reference of dimension.mechanismRefs) {
      if (!matrix.mechanism.includes(reference)) fail(`dimension ${dimension.dim} mechanism reference is absent from canonical matrix:${reference}`)
    }
    const testSet = new Set(dimension.enforcementTests)
    for (const test of testSet) regularFile(root, `${testsRoot}${test}`, `dimension ${dimension.dim} enforcement test`)
    if (dimension.fileReplays.length === 0 && dimension.focusedContracts.length === 0) fail(`dimension ${dimension.dim} has no executable evidence route`)

    for (const replay of dimension.fileReplays) {
      if (!FILE_EVENTS.has(replay.event) || !FILE_TOOLS.has(replay.tool)) fail(`dimension ${dimension.dim} file replay is not a file event/tool`)
      const registration = registrationFor(descriptors, replay, `dimension ${dimension.dim} file replay`)
      const hookTest = canonicalHookTest(replay.hook)
      if (!testSet.has(hookTest)) fail(`dimension ${dimension.dim} file replay lacks its canonical hook test:${hookTest}`)
      regularFile(root, `${HOOK_ROOT}/${replay.hook}`, `dimension ${dimension.dim} canonical hook`)
      boundRegistrations.push({ dim: dimension.dim, mode: 'file-replay', ...replay, descriptor: registration.descriptor })
    }
    for (const contract of dimension.focusedContracts) {
      if (FILE_EVENTS.has(contract.event) && FILE_TOOLS.has(contract.tool)) fail(`dimension ${dimension.dim} focused contract must be behavioral rather than a file replay`)
      if (!testSet.has(contract.test)) fail(`dimension ${dimension.dim} focused contract test is not bound to enforcementTests:${contract.test}`)
      const hookTest = canonicalHookTest(contract.hook)
      if (contract.test !== hookTest) fail(`dimension ${dimension.dim} focused contract must use its canonical hook test:${hookTest}`)
      const registration = registrationFor(descriptors, contract, `dimension ${dimension.dim} focused contract`)
      regularFile(root, `${HOOK_ROOT}/${contract.hook}`, `dimension ${dimension.dim} focused canonical hook`)
      boundRegistrations.push({ dim: dimension.dim, mode: 'focused-contract', ...contract, descriptor: registration.descriptor })
    }
  }
  return boundRegistrations
}

export function validateHookEvidencePlanDocument({ repoRoot = process.cwd(), plan }) {
  const root = resolve(repoRoot)
  const schemaRead = readJson(root, DEFAULT_HOOK_EVIDENCE_PLAN_SCHEMA, 'hook evidence plan schema')
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schemaRead.value)
  if (!validate(plan)) {
    fail(`schema failure:${(validate.errors || []).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`)
  }
  const coverage = coverageHookDimensions(root)
  const registrationsRead = readJson(root, HOOK_REGISTRATIONS, 'canonical hook registrations')
  const boundRegistrations = validatePlanSemantics({ root, plan, coverage, registrations: registrationsRead.value })
  return {
    plan,
    hookDimensions: coverage.hookDimensions,
    boundRegistrations,
    digests: {
      schemaSha256: sha256(schemaRead.bytes),
      coverageMatrixSha256: sha256(coverage.bytes),
      registrationsSha256: sha256(registrationsRead.bytes),
    },
  }
}

export function loadHookEvidencePlan({ repoRoot = process.cwd(), planPath = DEFAULT_HOOK_EVIDENCE_PLAN } = {}) {
  const root = resolve(repoRoot)
  const normalizedPlanPath = repositoryPath(planPath, 'hook evidence plan path')
  const planRead = readJson(root, normalizedPlanPath, 'hook evidence plan')
  const validated = validateHookEvidencePlanDocument({ repoRoot: root, plan: planRead.value })
  return {
    ...validated,
    planPath: normalizedPlanPath,
    digests: { ...validated.digests, planSha256: sha256(planRead.bytes) },
  }
}

export function selectFrozenHookInventory(manifest, inventoryPlan) {
  if (!manifest || !Array.isArray(manifest.inventory)) fail('active run frozen inventory is unavailable')
  const paths = manifest.inventory
    .filter(row => inventoryPlan.includePrefixes.some(prefix => row.path.startsWith(prefix)))
    .map(row => row.path)
  if (paths.length < inventoryPlan.minimumFiles) fail(`frozen DS inventory has ${paths.length} files; minimum is ${inventoryPlan.minimumFiles}`)
  const selected = new Set(paths)
  for (const row of manifest.inventory) {
    if (!selected.has(row.path)) continue
    if (row.kind !== 'file') fail(`frozen DS inventory contains unsupported or missing entry:${row.path}:${row.kind}`)
  }
  if (new Set(paths).size !== paths.length || paths.some((path, index) => index > 0 && path <= paths[index - 1])) {
    fail('frozen DS inventory selection is not unique and sorted')
  }
  return paths
}
