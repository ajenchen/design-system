#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadActiveDeepAuditRun, stableStringify } from './lib/deep-audit-evidence-contract.mjs'
import { collectStandardFiveStepLiveObservation } from './lib/standard-ci-evidence-live-observer.mjs'
import { loadStandardCiEvidencePlan } from './lib/standard-ci-evidence.mjs'
import { publishStandardFiveStepCiEvidence } from './lib/standard-ci-evidence-publisher.mjs'

function fail(message) { throw new Error(`standard CI evidence command blocked:${message}`) }

export function parseStandardCiEvidenceArgs(argv) {
  const values = {}
  const allowed = new Set(['--plan', '--check', '--observe', '--allow-network', '--json'])
  for (const raw of argv) {
    if (!allowed.has(raw) || values[raw.slice(2)] !== undefined) fail(`unknown, valued, or duplicate option:${raw}`)
    values[raw.slice(2)] = true
  }
  const modes = ['plan', 'check', 'observe'].filter((name) => values[name])
  if (modes.length === 0) values.plan = true
  else if (modes.length !== 1) fail('choose exactly one of --plan, --check, or --observe')
  if (Boolean(values.observe) !== Boolean(values['allow-network'])) fail('--observe requires --allow-network; network authorization is forbidden otherwise')
  return values
}

export async function runStandardCiEvidenceCommand(argv = process.argv.slice(2), { repoRoot = process.cwd(), collector = collectStandardFiveStepLiveObservation } = {}) {
  const args = parseStandardCiEvidenceArgs(argv)
  const planState = loadStandardCiEvidencePlan({ repoRoot })
  let report
  if (args.plan) {
    report = { mode: 'plan', networkAuthorized: false, writeAuthorized: false, planSha256: planState.planSha256, ...planState.plan }
  } else if (args.check) {
    const active = loadActiveDeepAuditRun({ repoRoot, requireCurrent: true })
    report = { mode: 'check', networkAuthorized: false, writeAuthorized: false, planSha256: planState.planSha256, runId: active.manifest.runId, manifestSha256: active.manifestSha256 }
  } else {
    report = { mode: 'observe', networkAuthorized: true, writeAuthorized: true, ...(await publishStandardFiveStepCiEvidence({ repoRoot, collector })) }
  }
  process.stdout.write(`${stableStringify(report, args.json ? 0 : 2)}\n`)
  return report
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try { await runStandardCiEvidenceCommand() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
