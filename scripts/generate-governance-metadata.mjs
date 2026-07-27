#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')

function run(script, extra = []) {
  const result = spawnSync('node', [script, ...extra], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.status !== 0) throw new Error(`${script} failed (${result.status ?? result.signal ?? result.error?.message})`)
}

try {
  run('scripts/audit-coverage-matrix.mjs', check ? ['--check'] : [])
  run('scripts/sync-governance-counters.mjs', check ? ['--check'] : [])
  console.log(`✓ deterministic governance metadata ${check ? 'matches canonical inputs' : 'generated'}`)
} catch (error) {
  console.error(`❌ ${error.message}`)
  process.exit(1)
}
