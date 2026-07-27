import {
  canonicalize,
  diagnostic,
  humanResult,
  readStdin,
  result,
  stableJson,
} from './common.mjs'
import { inspectContract } from './contract.mjs'
import { normalizeProviderHookInput, providerHookIssueMessage } from './provider-hook-normalization.mjs'

export function normalizeProviderEvent(contract, providerId, input) {
  const provider = contract.providers.find((item) => item.id === providerId)
  if (!provider) return canonicalize({ provider: null, event: '', tool: '', operation: 'read', paths: [], blocked: true, evidence: [] })
  return canonicalize(normalizeProviderHookInput({ provider, input, repoRoot: contract.repoRoot }).normalized)
}

export async function evaluateHook({
  provider,
  input,
  repoRoot = process.cwd(),
  manifestPath,
  role,
  outputDirectory,
  lockFile,
} = {}) {
  const inspected = await inspectContract({ repoRoot, manifestPath, role, outputDirectory, lockFile, verifySources: false })
  const diagnostics = [...inspected.diagnostics]
  if (!inspected.contract || diagnostics.some((item) => ['FAIL', 'BLOCK', 'ERROR'].includes(item.outcome))) return { result: result('hook', diagnostics), exitCode: 2, normalized: null }
  const contract = inspected.contract
  const providerContract = contract.providers.find((item) => item.id === provider)
  if (!providerContract) {
    diagnostics.push(diagnostic({ ruleId: 'GOV-PROVIDER-001', severity: 'critical', kind: 'provider-unknown', path: provider || '', outcome: 'BLOCK', message: 'Hook provider is not registered.' }))
    return { result: result('hook', diagnostics), exitCode: 2, normalized: null }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    diagnostics.push(diagnostic({ ruleId: 'GOV-PROVIDER-001', severity: 'critical', kind: 'hook-input-invalid', path: provider, outcome: 'BLOCK', message: 'Hook input must be a JSON object.' }))
    return { result: result('hook', diagnostics), exitCode: providerContract.blockingExitCode || 2, normalized: null }
  }

  const hookInput = normalizeProviderHookInput({ provider: providerContract, input, repoRoot: contract.repoRoot })
  let normalized = canonicalize(hookInput.normalized)
  for (const issue of hookInput.issues) {
    diagnostics.push(diagnostic({
      ruleId: 'GOV-PROVIDER-001',
      severity: 'critical',
      ...issue.evidence,
      outcome: 'BLOCK',
      message: providerHookIssueMessage(issue),
    }))
  }
  if (normalized.operation === 'write') {
    const protectedPaths = [contract.lockFile, contract.outputDirectory]
    const generatedRule = contract.rules.find((rule) => rule.ruleId === 'GOV-GENERATED-001')
    for (const path of normalized.paths) {
      const protectedPath = protectedPaths.find((candidate) => path === candidate || path.startsWith(`${candidate}/`))
      if (!protectedPath) continue
      diagnostics.push(diagnostic({
        ruleId: generatedRule?.ruleId || 'GOV-GENERATED-001',
        severity: generatedRule?.severity || 'critical',
        kind: 'generated-artifact-write',
        path,
        expected: 'edit canonical source then regenerate',
        actual: normalized.tool || normalized.event,
        outcome: 'BLOCK',
        message: 'Direct writes to generated governance artifacts are blocked.',
      }))
    }
  }

  if (!diagnostics.length) diagnostics.push(diagnostic({ ruleId: 'GOV-GENERATED-001', severity: 'info', kind: 'hook-pass', path: normalized.paths.join(',') || '<none>', outcome: 'PASS', message: 'Normalized provider operation does not write a protected generated artifact.' }))
  const blocked = diagnostics.some((item) => ['BLOCK', 'FAIL', 'ERROR'].includes(item.outcome))
  const ordered = result('hook', diagnostics).diagnostics
  normalized = canonicalize({
    ...normalized,
    blocked,
    evidence: ordered
      .filter((item) => ['BLOCK', 'FAIL', 'ERROR'].includes(item.outcome))
      .map((item) => item.evidence),
  })
  const value = result('hook', diagnostics, { provider, normalized })
  return { result: value, exitCode: blocked ? (providerContract.blockingExitCode || 2) : 0, normalized }
}

export function nativeHookStreams(evaluated) {
  if (evaluated.exitCode === 0) return { stdout: '', stderr: '' }
  return { stdout: '', stderr: `${humanResult(evaluated.result)}\n` }
}

export async function runHookCli({ provider, repoRoot, manifestPath, role, outputDirectory, lockFile, json = false } = {}) {
  let input
  try {
    const raw = await readStdin()
    input = raw.trim() ? JSON.parse(raw) : {}
  } catch (error) {
    input = null
  }
  const evaluated = await evaluateHook({ provider, input, repoRoot, manifestPath, role, outputDirectory, lockFile })
  if (json) process.stdout.write(stableJson(evaluated.result))
  else {
    const streams = nativeHookStreams(evaluated)
    if (streams.stdout) process.stdout.write(streams.stdout)
    if (streams.stderr) process.stderr.write(streams.stderr)
  }
  process.exitCode = evaluated.exitCode
  return evaluated
}
