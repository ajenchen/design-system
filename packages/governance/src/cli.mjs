import { resolve } from 'node:path'
import {
  diagnostic,
  humanResult,
  readStdin,
  result,
  stableJson,
} from './common.mjs'
import { evaluateHook } from './hook-api.mjs'
import {
  applyUpgrade,
  attestRepository,
  checkRepository,
  doctorRepository,
  generateRepository,
  planUpgrade,
} from './snapshot.mjs'
import { assertArtifactSchema, inspectContract } from './contract.mjs'

const commands = new Set(['generate', 'check', 'doctor', 'hook', 'attest', 'upgrade'])

function usage(message = 'A command is required.') {
  return result('usage', [diagnostic({
    ruleId: 'GOV-CONTRACT-001',
    severity: 'critical',
    kind: 'usage',
    outcome: 'ERROR',
    message: `${message} Commands: generate, check, doctor, hook, attest, upgrade plan, upgrade apply.`,
  })])
}

function parse(argv, fixedCommand) {
  const args = [...argv]
  const command = fixedCommand || args.shift()
  if (!commands.has(command)) return { error: usage(command ? `Unknown command: ${command}.` : undefined) }
  let upgradeAction
  if (command === 'upgrade') upgradeAction = args.shift()
  const options = {}
  const booleanOptions = new Set(['json', 'hooks-off', 'help'])
  const keyMap = new Map([
    ['repo', 'repoRoot'],
    ['manifest', 'manifestPath'],
    ['role', 'role'],
    ['output', 'outputDirectory'],
    ['lock', 'lockFile'],
    ['provider', 'provider'],
    ['plan-file', 'planFile'],
    ['attestation-file', 'attestationFile'],
    ['at', 'issuedAt'],
    ['git-head', 'gitHead'],
  ])
  while (args.length) {
    const token = args.shift()
    if (!token.startsWith('--')) return { error: usage(`Unexpected argument: ${token}.`) }
    const rawKey = token.slice(2)
    if (booleanOptions.has(rawKey)) {
      options[rawKey === 'hooks-off' ? 'hooksOff' : rawKey] = true
      continue
    }
    const key = keyMap.get(rawKey)
    if (!key) return { error: usage(`Unknown option: ${token}.`) }
    const value = args.shift()
    if (value == null || value.startsWith('--')) return { error: usage(`${token} requires a value.`) }
    options[key] = value
  }
  if (options.repoRoot) options.repoRoot = resolve(options.repoRoot)
  if (options.manifestPath) options.manifestPath = resolve(options.manifestPath)
  return { command, upgradeAction, options }
}

async function hookCommand(options) {
  let input
  try {
    const raw = await readStdin()
    input = raw.trim() ? JSON.parse(raw) : {}
  } catch {
    input = null
  }
  const evaluated = await evaluateHook({ ...options, input })
  return { value: evaluated.result, exitCode: evaluated.exitCode }
}

async function execute(parsed) {
  const { command, upgradeAction, options } = parsed
  if (options.help) return { value: usage(), exitCode: 1 }
  if (command === 'generate') return { value: await generateRepository(options) }
  if (command === 'check') return { value: await checkRepository(options) }
  if (command === 'doctor') return { value: await doctorRepository(options) }
  if (command === 'hook') {
    if (!options.provider) return { value: usage('hook requires --provider.'), exitCode: 2 }
    return hookCommand(options)
  }
  if (command === 'attest') return { value: await attestRepository(options) }
  if (command === 'upgrade') {
    if (upgradeAction === 'plan') return { value: await planUpgrade(options) }
    if (upgradeAction === 'apply') return { value: await applyUpgrade(options) }
    return { value: usage('upgrade requires plan or apply.') }
  }
  return { value: usage() }
}

export async function runCli({ argv = process.argv.slice(2), fixedCommand } = {}) {
  const parsed = parse(argv, fixedCommand)
  const executed = parsed.error ? { value: parsed.error } : await execute(parsed)
  const value = executed.value
  if (!parsed.error) {
    const inspected = await inspectContract(parsed.options)
    if (inspected.contract) await assertArtifactSchema(inspected.contract, 'diagnostic', value)
  }
  process.stdout.write(parsed.options?.json ? stableJson(value) : `${humanResult(value)}\n`)
  const successful = ['PASS', 'PLAN', 'APPLIED'].includes(value.outcome)
  process.exitCode = executed.exitCode ?? (successful ? 0 : 1)
  return value
}
