#!/usr/bin/env node
// Calculate dynamic self-audit thresholds from read-only Git-owned telemetry.
// Aligns with Datadog Watchdog's mean + 2σ outlier-detection philosophy.
// Usage: node scripts/calc-self-audit-baseline.mjs

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveProviderTelemetryStatePath } from './lib/governance-runtime-evidence.mjs'

const DEFAULT_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function stats(values) {
  const n = values.length
  const mean = values.reduce((sum, value) => sum + value, 0) / n
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n
  const stddev = Math.sqrt(variance)
  return { n, mean, stddev, mean_plus_2sigma: mean + 2 * stddev }
}

function main() {
  const repoRoot = process.env.GOVERNANCE_PROJECT_DIR || DEFAULT_REPO_ROOT
  const file = resolveProviderTelemetryStatePath({
    repoRoot,
    runtimeRoot: process.env.GOVERNANCE_RUNTIME_ROOT,
    stateRoot: process.env.GOVERNANCE_STATE_DIR,
    relativePath: 'self-audit-baseline-counts.jsonl',
  })

  if (!existsSync(file)) {
    console.log('No baseline file. Hook will use fixed threshold (Bugsnag/ESLint-aligned).')
    return 0
  }

  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n').filter((line) => line.trim())
  const samples = lines.map((line, index) => {
    let value
    try {
      value = JSON.parse(line)
    } catch {
      throw new Error(`invalid baseline JSON at line ${index + 1}`)
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || !Number.isInteger(value.trigger) || value.trigger < 0
      || !Number.isInteger(value.topic) || value.topic < 0) {
      throw new Error(`invalid baseline sample at line ${index + 1}`)
    }
    return value
  })

  if (samples.length < 100) {
    console.log(`Baseline samples: ${samples.length} / 100 (need ≥ 100 for dynamic threshold). Hook still uses fixed.`)
    return 0
  }

  const triggerStats = stats(samples.map((sample) => sample.trigger))
  const topicStats = stats(samples.map((sample) => sample.topic))

  console.log('Trigger phrase baseline:')
  console.log(triggerStats)
  console.log('\nTopic repeat baseline:')
  console.log(topicStats)
  console.log('\n→ Recommended dynamic thresholds(mean + 2σ outlier detection):')
  console.log(`  Trigger ≥ ${Math.ceil(triggerStats.mean_plus_2sigma)}`)
  console.log(`  Topic > ${Math.ceil(topicStats.mean_plus_2sigma)}`)
  console.log('\nApply: edit packages/design-system/ds-canonical/hooks/stop_self_audit.sh thresholds.')
  return 0
}

try {
  process.exitCode = main()
} catch (error) {
  process.stderr.write(`self-audit baseline calculation failed closed:${error.message}\n`)
  process.exitCode = 2
}
