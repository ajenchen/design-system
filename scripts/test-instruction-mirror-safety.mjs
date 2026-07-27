#!/usr/bin/env node
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkInstructionMirrors, writeInstructionMirrors } from './lib/instruction-mirrors.mjs'

const mirrors = [
  ['scripts/package-role-sources/AGENTS.package.md', 'packages/design-system/AGENTS.md'],
  ['scripts/package-role-sources/CLAUDE.package.md', 'packages/design-system/CLAUDE.md'],
]
const makeRepo = () => {
  const root = mkdtempSync(join(tmpdir(), 'instruction-mirror-safety-'))
  mkdirSync(join(root, 'packages/design-system'), { recursive: true })
  mkdirSync(join(root, 'scripts/package-role-sources'), { recursive: true })
  writeFileSync(join(root, 'scripts/package-role-sources/AGENTS.package.md'), 'package agents\n', { mode: 0o640 })
  writeFileSync(join(root, 'scripts/package-role-sources/CLAUDE.package.md'), 'package claude\n', { mode: 0o644 })
  writeFileSync(join(root, 'packages/design-system/AGENTS.md'), 'stale\n')
  writeFileSync(join(root, 'packages/design-system/CLAUDE.md'), 'stale\n')
  return root
}

{
  const root = makeRepo()
  try {
    assert.equal(checkInstructionMirrors(root, mirrors).drift.length, 2)
    writeInstructionMirrors(root, mirrors)
    assert.deepEqual(checkInstructionMirrors(root, mirrors).drift, [])
    chmodSync(join(root, 'packages/design-system/AGENTS.md'), 0o600)
    assert.deepEqual(checkInstructionMirrors(root, mirrors).drift.map((item) => item.kind), ['mode'])
  } finally { rmSync(root, { recursive: true, force: true }) }
}

for (const attack of ['source-file', 'target-file', 'target-parent']) {
  const root = makeRepo()
  const external = mkdtempSync(join(tmpdir(), 'instruction-mirror-external-'))
  const sentinel = join(external, 'sentinel.txt')
  writeFileSync(sentinel, 'do-not-mutate\n')
  try {
    if (attack === 'source-file') {
      rmSync(join(root, 'scripts/package-role-sources/AGENTS.package.md'))
      symlinkSync(sentinel, join(root, 'scripts/package-role-sources/AGENTS.package.md'))
    } else if (attack === 'target-file') {
      rmSync(join(root, 'packages/design-system/AGENTS.md'))
      symlinkSync(sentinel, join(root, 'packages/design-system/AGENTS.md'))
    } else {
      rmSync(join(root, 'packages/design-system'), { recursive: true, force: true })
      symlinkSync(external, join(root, 'packages/design-system'))
    }
    assert.throws(() => checkInstructionMirrors(root, mirrors), /symlink/)
    assert.throws(() => writeInstructionMirrors(root, mirrors), /symlink/)
    assert.equal(readFileSync(sentinel, 'utf8'), 'do-not-mutate\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(external, { recursive: true, force: true })
  }
}

console.log('✓ instruction mirror content/mode parity and source/target/ancestor symlink sentinels')
