#!/usr/bin/env node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFlags, stableStringify } from '../lib/common.mjs'
import { runRuntimeConformance, runtimeConformancePaths } from '../lib/provider-runtime-conformance.mjs'

const GOVERNANCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = resolve(GOVERNANCE_ROOT, '../..')

function usage() {
  return `Usage: node infra/governance/bin/conform-provider-runtime.mjs [options]

Options:
  --provider <all|provider-id>   Local-probe fleet or one local provider (default: all)
  --allow-model                  Permit bounded Claude/Codex model-backed lifecycle probes
  --json                         Print the complete redacted evidence JSON
  --help                         Show this help

The all selector emits scope=local-fleet and never claims cloud, remote-control,
desktop, or GitHub Actions external-attested coverage.

Fresh, uniquely identified staging evidence is always rewritten at:
  infra/governance/runtime/provider-runtime-conformance.json

This command never edits certifications, source files, GitHub, or npm state.
`
}

async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv, {
    provider: 'string',
    'allow-model': 'boolean',
    json: 'boolean',
    help: 'boolean',
  })
  if (flags.help) {
    process.stdout.write(usage())
    return 0
  }
  if (flags._.length) throw new Error(`Unexpected positional argument: ${flags._[0]}`)
  const provider = flags.provider || 'all'
  if (provider !== 'all' && !/^[a-z][a-z0-9-]*$/.test(provider)) throw new Error(`Invalid provider id: ${provider}`)

  const { evidence, outputPath } = await runRuntimeConformance({
    repoRoot: REPO_ROOT,
    profilePath: runtimeConformancePaths.defaultProfilePath,
    providerFilter: provider,
    allowModel: Boolean(flags['allow-model']),
  })
  if (flags.json) process.stdout.write(`${stableStringify(evidence)}\n`)
  else process.stdout.write(`provider runtime conformance: ${evidence.status}; scope=${evidence.scope}; evidence=${outputPath}\n`)
  return evidence.status === 'pass' ? 0 : 2
}

try {
  process.exitCode = await main()
} catch (error) {
  process.stderr.write(`provider runtime conformance failed closed: ${error.message}\n`)
  process.exitCode = 2
}
