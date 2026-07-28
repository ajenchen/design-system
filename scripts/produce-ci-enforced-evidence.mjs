#!/usr/bin/env node

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertCiPlanCoverage,
  loadCanonicalCiModels,
  loadCiEvidencePlan,
} from './lib/ci-evidence-plan.mjs'
import { importCiEvidence } from './lib/ci-evidence-pipeline.mjs'
import { observeLiveCiObservationToStaging } from './lib/ci-evidence-live-observer.mjs'
import { loadActiveDeepAuditRun, stableStringify } from './lib/deep-audit-evidence-contract.mjs'

function fail(message) {
  throw new Error(`CI evidence command blocked:${message}`)
}

export function parseCiEvidenceArgs(argv) {
  const values = {}
  const valueFlags = new Set(['--staging-dir', '--observation', '--attestation'])
  const booleanFlags = new Set(['--plan', '--check', '--observe', '--allow-network', '--import', '--json'])
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index]
    const equals = raw.indexOf('=')
    const name = equals >= 0 ? raw.slice(0, equals) : raw
    if (booleanFlags.has(name)) {
      if (equals >= 0 || values[name.slice(2)] !== undefined) fail(`invalid or duplicate option:${raw}`)
      values[name.slice(2)] = true
      continue
    }
    if (!valueFlags.has(name)) fail(`unknown option:${raw}`)
    if (values[name.slice(2)] !== undefined) fail(`duplicate option:${name}`)
    const value = equals >= 0 ? raw.slice(equals + 1) : argv[++index]
    if (!value || value.startsWith('--')) fail(`${name} requires a value`)
    values[name.slice(2)] = value
  }
  const modes = ['plan', 'check', 'observe', 'import'].filter((name) => values[name])
  if (modes.length === 0) values.plan = true
  else if (modes.length !== 1) fail('choose exactly one of --plan, --check, --observe, or --import')
  if (values.observe) {
    if (!values['allow-network'] || !values['staging-dir']) fail('--observe requires --allow-network and --staging-dir')
    if (values.observation || values.attestation) fail('--observe cannot accept import paths')
  } else if (values['allow-network'] || values['staging-dir']) fail('--allow-network/--staging-dir are only valid with --observe')
  if (values.import) {
    if (!values.observation || !values.attestation) fail('--import requires --observation and --attestation')
  } else if (values.observation || values.attestation) fail('--observation/--attestation are only valid with --import')
  return values
}

export async function runCiEvidenceCommand(argv = process.argv.slice(2), { repoRoot = process.cwd() } = {}) {
  const args = parseCiEvidenceArgs(argv)
  const planState = loadCiEvidencePlan({ repoRoot })
  let report
  if (args.plan) {
    report = {
      mode: 'plan',
      writeAuthorized: false,
      networkAuthorized: false,
      planDigest: planState.planDigest,
      dimensions: planState.plan.dimensions.map((item) => ({ dim: item.dim, capability: item.capability, mechanism: item.mechanism })),
      canonicalInputs: planState.plan.observation.canonicalInputs,
      consumerChecks: planState.plan.observation.consumerChecks,
    }
  } else if (args.check) {
    const activeRun = loadActiveDeepAuditRun({ repoRoot, requireCurrent: true })
    assertCiPlanCoverage(planState, activeRun.manifest)
    const canonical = loadCanonicalCiModels(planState, { repoRoot })
    report = {
      mode: 'check',
      writeAuthorized: false,
      networkAuthorized: false,
      planDigest: planState.planDigest,
      runId: activeRun.manifest.runId,
      manifestSha256: activeRun.manifestSha256,
      canonicalModels: canonical.bindings,
    }
  } else if (args.observe) {
    const { staged } = await observeLiveCiObservationToStaging({
      repoRoot,
      stagingDirectory: resolve(args['staging-dir']),
    })
    report = { mode: 'observe', writeAuthorized: true, networkAuthorized: true, ...staged }
  } else {
    const imported = await importCiEvidence({
      repoRoot,
      observationPath: resolve(args.observation),
      attestationPath: resolve(args.attestation),
    })
    report = { mode: 'import', writeAuthorized: true, networkAuthorized: false, ...imported }
  }
  process.stdout.write(`${args.json ? stableStringify(report) : stableStringify(report, 2)}\n`)
  return report
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try { await runCiEvidenceCommand() } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
