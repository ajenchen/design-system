#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function run(command, label) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status ?? result.signal ?? result.error?.message})`)
  }
}

const mode = process.argv[2]
if (mode !== '--generate' && mode !== '--check') {
  console.error('Usage: node scripts/governance-snapshot.mjs --generate|--check')
  process.exit(2)
}

try {
  // These repository-owned ledgers influence every provider. Validate their
  // semantics before hashing them into the immutable control-plane snapshot.
  run(['node', 'scripts/validate-memory-contract.mjs'], 'memory authority validation')
  run(['node', 'scripts/validate-planning-registry.mjs'], 'planning authority validation')
  run([
    'node',
    'packages/governance/bin/governance.mjs',
    mode === '--generate' ? 'generate' : 'check',
    '--repo',
    '.',
    '--role',
    'ds-author',
    ...(mode === '--check' ? ['--hooks-off'] : []),
  ], `governance snapshot ${mode.slice(2)}`)
} catch (error) {
  console.error(`❌ ${error.message}`)
  process.exit(1)
}
