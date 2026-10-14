#!/usr/bin/env node
// Dynamic self-audit thresholds from read-only Git-owned telemetry — the ONE implementation.
// Aligns with Datadog Watchdog's mean + 2σ outlier-detection philosophy, over the latest 10000
// samples once ≥ 100 exist. stop_self_audit.sh calls `--thresholds` and applies
// max(consensus floor, value); the report mode below is for humans.
// Usage: node scripts/calc-self-audit-baseline.mjs [--thresholds]
//   --thresholds  print "<samples> <trigger> <topic>" (dynamic mean + 2σ, ceiled) or nothing when
//                 fewer than 100 samples / no telemetry; malformed data still fails closed (exit 2).

const SAMPLE_WINDOW = 10000
const MINIMUM_SAMPLES = 100
const TRIGGER_FLOOR = 5
const TOPIC_FLOOR = 10
const MACHINE_THRESHOLDS = process.argv.includes('--thresholds')

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
    if (!MACHINE_THRESHOLDS) console.log('No baseline file. Hook will use fixed threshold (Bugsnag/ESLint-aligned).')
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

  const windowed = samples.slice(-SAMPLE_WINDOW)
  if (windowed.length < MINIMUM_SAMPLES) {
    if (!MACHINE_THRESHOLDS) console.log(`Baseline samples: ${windowed.length} / ${MINIMUM_SAMPLES} (need ≥ ${MINIMUM_SAMPLES} for dynamic threshold). Hook still uses fixed.`)
    return 0
  }

  const triggerStats = stats(windowed.map((sample) => sample.trigger))
  const topicStats = stats(windowed.map((sample) => sample.topic))
  const dynamicTrigger = Math.ceil(triggerStats.mean_plus_2sigma)
  const dynamicTopic = Math.ceil(topicStats.mean_plus_2sigma)
  if (MACHINE_THRESHOLDS) {
    console.log(`${windowed.length} ${dynamicTrigger} ${dynamicTopic}`)
    return 0
  }

  console.log('Trigger phrase baseline:')
  console.log(triggerStats)
  console.log('\nTopic repeat baseline:')
  console.log(topicStats)
  console.log(`\n→ Dynamic thresholds over the latest ${windowed.length} samples(mean + 2σ outlier detection):`)
  console.log(`  Trigger ≥ ${dynamicTrigger}`)
  console.log(`  Topic > ${dynamicTopic}`)
  console.log('\n→ Applied automatically by packages/design-system/ds-canonical/hooks/stop_self_audit.sh(never below the consensus floor):')
  console.log(`  Trigger ≥ ${Math.max(TRIGGER_FLOOR, dynamicTrigger)}`)
  console.log(`  Topic > ${Math.max(TOPIC_FLOOR, dynamicTopic)}`)
  return 0
}

try {
  process.exitCode = main()
} catch (error) {
  process.stderr.write(`self-audit baseline calculation failed closed:${error.message}\n`)
  process.exitCode = 2
}
