import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  digestInventorySelection,
  sha256,
  stableStringify,
} from './deep-audit-evidence-contract.mjs'

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_REPO_ROOT = resolve(SCRIPT_ROOT, '..')
export const DEFAULT_DETERMINISTIC_PLAN_PATH = resolve(SCRIPT_ROOT, 'deep-audit-deterministic-plan.json')
const DEFAULT_SCHEMA_PATH = resolve(SCRIPT_ROOT, 'schemas/deep-audit-deterministic-plan.schema.json')
export const DETERMINISTIC_CAPABILITY_ORDER = Object.freeze(['local', 'build', 'network', 'published-release'])

function fail(message) {
  throw new Error(`deterministic deep-audit plan blocked:${message}`)
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} has an open or incomplete shape:${actual.join(',')}`)
  }
}

function safePattern(pattern, label) {
  if (typeof pattern !== 'string' || !pattern || pattern.includes('\0') || pattern.includes('\\') || isAbsolute(pattern)) {
    fail(`${label} is not a safe repository-relative POSIX glob`)
  }
  if (pattern.split('/').some((part) => part === '.' || part === '..' || part === '')) fail(`${label} has an unsafe segment:${pattern}`)
  try { new RegExp(pattern) } catch {}
  return pattern
}

function expandBraces(pattern) {
  const match = /\{([^{}]+)\}/.exec(pattern)
  if (!match) return [pattern]
  const choices = match[1].split(',')
  if (choices.length < 2 || choices.some((choice) => !choice)) fail(`invalid brace glob:${pattern}`)
  return choices.flatMap((choice) => expandBraces(`${pattern.slice(0, match.index)}${choice}${pattern.slice(match.index + match[0].length)}`))
}

function globRegExp(pattern) {
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index += 1
        if (pattern[index + 1] === '/') {
          index += 1
          source += '(?:.*/)?'
        } else source += '.*'
      } else source += '[^/]*'
    } else if (char === '?') source += '[^/]'
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
  }
  return new RegExp(`${source}$`)
}

export function matchesDeterministicCoveragePattern(path, pattern) {
  return expandBraces(pattern).some((expanded) => globRegExp(expanded).test(path))
}

function validateCommandArgv(command, repoRoot, packageScripts) {
  const [executable, ...args] = command.argv
  if (!['node', 'npm', 'npx'].includes(executable)) fail(`command ${command.id} executable is not admitted:${executable}`)
  if (command.argv.some((token) => typeof token !== 'string' || !token || /[\0\r\n]/.test(token))) fail(`command ${command.id} argv contains an unsafe token`)
  if (executable === 'node') {
    const script = args[0]
    if (!/^scripts\/[a-zA-Z0-9._/-]+\.mjs$/.test(script) || script.split('/').includes('..')) fail(`command ${command.id} node script is unsafe:${script}`)
    if (!existsSync(resolve(repoRoot, script))) fail(`command ${command.id} node script is missing:${script}`)
  } else if (executable === 'npm') {
    if (args.length !== 3 || args[0] !== 'run' || args[1] !== '--silent' || !packageScripts[args[2]]) fail(`command ${command.id} npm argv is not an exact local package script`)
  } else if (args.length !== 2 || args[0] !== '--no-install' || args[1] !== 'size-limit') {
    fail(`command ${command.id} npx may only invoke the installed size-limit binary with --no-install`)
  }
}

export function validateDeterministicDeepAuditPlan(plan, { repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const schema = JSON.parse(readFileSync(DEFAULT_SCHEMA_PATH, 'utf8'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validate = ajv.compile(schema)
  if (!validate(plan)) fail(`schema validation failed:${ajv.errorsText(validate.errors, { separator: '; ' })}`)
  exactKeys(plan, ['$schema', 'schemaVersion', 'evidenceKind', 'capabilityOrder', 'commands', 'dimensions'], 'plan')
  if (stableStringify(plan.capabilityOrder) !== stableStringify(DETERMINISTIC_CAPABILITY_ORDER)) fail('capability order is not canonical')

  const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
  const commandById = new Map()
  for (const command of plan.commands) {
    exactKeys(command, ['id', 'argv', 'cwd', 'outputRoots', 'capabilities', 'timeoutSeconds', 'completion'], `command ${command.id}`)
    if (commandById.has(command.id)) fail(`duplicate command id:${command.id}`)
    if (command.capabilities[0] !== 'local') fail(`command ${command.id} must explicitly include local capability first`)
    const ordered = [...command.capabilities].sort((left, right) => DETERMINISTIC_CAPABILITY_ORDER.indexOf(left) - DETERMINISTIC_CAPABILITY_ORDER.indexOf(right))
    if (stableStringify(ordered) !== stableStringify(command.capabilities)) fail(`command ${command.id} capabilities are not canonical-order`)
    if (command.capabilities.includes('published-release') && !command.capabilities.includes('network')) fail(`command ${command.id} published-release requires network`)
    if (stableStringify(command.completion.acceptedExitCodes) !== '[0]') fail(`command ${command.id} may only issue completion receipts for exit 0`)
    for (const outputRoot of command.outputRoots) safePattern(outputRoot, `command ${command.id} output root`)
    if (stableStringify([...command.outputRoots].sort()) !== stableStringify(command.outputRoots)) fail(`command ${command.id} output roots must be canonical-order`)
    for (const root of command.outputRoots) {
      if (command.outputRoots.some((other) => other !== root && (root.startsWith(`${other}/`) || other.startsWith(`${root}/`)))) fail(`command ${command.id} output roots overlap:${root}`)
    }
    for (const { pattern } of command.completion.minimumOutputMatches) {
      try { new RegExp(pattern, 'gu') } catch (error) { fail(`command ${command.id} has invalid completion regex:${error.message}`) }
    }
    for (const pattern of command.completion.rejectOutputPatterns) {
      try { new RegExp(pattern, 'u') } catch (error) { fail(`command ${command.id} has invalid reject regex:${error.message}`) }
    }
    validateCommandArgv(command, repoRoot, pkg.scripts ?? {})
    commandById.set(command.id, command)
  }

  const dimensionByNumber = new Map()
  const referencedCommands = new Set()
  for (const dimension of plan.dimensions) {
    exactKeys(dimension, ['dim', 'name', 'commandIds', 'coverage'], `dimension ${dimension.dim}`)
    if (dimensionByNumber.has(dimension.dim)) fail(`duplicate dimension:${dimension.dim}`)
    for (const commandId of dimension.commandIds) {
      if (!commandById.has(commandId)) fail(`dimension ${dimension.dim} references unknown command:${commandId}`)
      referencedCommands.add(commandId)
    }
    for (const pattern of [...dimension.coverage.include, ...dimension.coverage.exclude]) safePattern(pattern, `dimension ${dimension.dim} coverage`)
    dimensionByNumber.set(dimension.dim, dimension)
  }
  const orphanCommands = [...commandById.keys()].filter((id) => !referencedCommands.has(id))
  if (orphanCommands.length) fail(`unreferenced commands:${orphanCommands.join(',')}`)
  if (plan.dimensions.length !== 24) fail(`plan must enumerate exactly 24 deterministic dimensions, found ${plan.dimensions.length}`)
  return { plan, commandById, dimensionByNumber, planDigest: sha256(stableStringify(plan)) }
}

export function loadDeterministicDeepAuditPlan({ repoRoot = DEFAULT_REPO_ROOT, planPath = null } = {}) {
  const root = resolve(repoRoot)
  const path = resolve(planPath ?? resolve(root, 'scripts/deep-audit-deterministic-plan.json'))
  const plan = JSON.parse(readFileSync(path, 'utf8'))
  return { ...validateDeterministicDeepAuditPlan(plan, { repoRoot: root }), path, repoRoot: root }
}

export function deterministicCapabilitiesForDimension(planState, dim) {
  const dimension = planState.dimensionByNumber.get(Number(dim))
  if (!dimension) fail(`unknown deterministic dimension:${dim}`)
  const required = new Set(dimension.commandIds.flatMap((id) => planState.commandById.get(id).capabilities))
  return DETERMINISTIC_CAPABILITY_ORDER.filter((capability) => required.has(capability))
}

export function expandDeterministicCoverage(planState, manifest, dim) {
  const dimension = planState.dimensionByNumber.get(Number(dim))
  if (!dimension) fail(`unknown deterministic dimension:${dim}`)
  if (!manifest || !Array.isArray(manifest.inventory)) fail('run manifest inventory is unavailable')
  const includeMatches = new Map(dimension.coverage.include.map((pattern) => [pattern, 0]))
  const selected = []
  for (const row of manifest.inventory) {
    if (!row || typeof row.path !== 'string') fail('run manifest contains an invalid inventory row')
    const matchedIncludes = dimension.coverage.include.filter((pattern) => matchesDeterministicCoveragePattern(row.path, pattern))
    if (!matchedIncludes.length) continue
    for (const pattern of matchedIncludes) includeMatches.set(pattern, includeMatches.get(pattern) + 1)
    if (dimension.coverage.exclude.some((pattern) => matchesDeterministicCoveragePattern(row.path, pattern))) continue
    // A tracked deletion remains frozen in the run manifest but is not a file a
    // deterministic command can truthfully claim to have scanned. The command
    // itself still observes the deletion and must exit 0 before any receipt.
    if (row.kind === 'missing') continue
    selected.push(row.path)
  }
  const emptySelectors = [...includeMatches].filter(([, count]) => count === 0).map(([pattern]) => pattern)
  if (emptySelectors.length) fail(`dimension ${dim} coverage selector matched no manifest path:${emptySelectors.join(',')}`)
  const paths = [...new Set(selected)].sort()
  if (!paths.length) fail(`dimension ${dim} coverage is vacuous`)
  return {
    inventoryPaths: paths,
    inventoryDigest: digestInventorySelection(manifest, paths),
    filesScanned: paths.length,
  }
}

export function assertDeterministicMatrixParity(planState, { repoRoot = planState.repoRoot ?? DEFAULT_REPO_ROOT } = {}) {
  const source = readFileSync(resolve(repoRoot, 'scripts/audit-coverage-matrix.mjs'), 'utf8')
  const matrixDims = [...source.matchAll(/(\d+):\s*\{\s*tier:\s*'DETERMINISTIC'/g)].map((match) => Number(match[1])).sort((a, b) => a - b)
  const planDims = [...planState.dimensionByNumber.keys()].sort((a, b) => a - b)
  if (stableStringify(matrixDims) !== stableStringify(planDims)) {
    fail(`matrix/plan deterministic dimensions differ:matrix=${matrixDims.join(',')} plan=${planDims.join(',')}`)
  }
  return true
}

export function canonicalDeterministicRunnerArgv({ dims, allowBuild = false, allowNetwork = false, allowPublishedRelease = false } = {}) {
  const normalizedDims = [...new Set((dims ?? []).map(Number))].sort((a, b) => a - b)
  if (!normalizedDims.length || normalizedDims.some((dim) => !Number.isInteger(dim) || dim <= 0)) fail('canonical runner argv requires dimensions')
  const argv = ['node', 'scripts/run-deterministic-deep-audit.mjs', '--execute', `--dims=${normalizedDims.join(',')}`]
  if (allowBuild) argv.push('--allow-build')
  if (allowNetwork) argv.push('--allow-network')
  if (allowPublishedRelease) argv.push('--allow-published-release')
  return argv
}
