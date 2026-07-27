#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncBaselineMirrors } from './sync-governance-baseline-mirrors.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'baseline-mirrors-'))
  mkdirSync(join(root, 'infra/governance/baseline/visual/curated'), { recursive: true })
  mkdirSync(join(root, 'infra/governance/baseline/visual/targeted'), { recursive: true })
  writeFileSync(join(root, 'infra/governance/baseline/visual/curated/curated.png'), 'curated\n')
  writeFileSync(join(root, 'infra/governance/baseline/visual/targeted/targeted.png'), 'targeted\n')
  return root
}

{
  const root = fixture()
  try {
    syncBaselineMirrors({ root })
    syncBaselineMirrors({ root, check: true })
    assert.equal(readlinkSync(join(root, 'snapshots-baseline')), 'infra/governance/baseline/visual/curated')
    assert.equal(readlinkSync(join(root, '.claude/snapshots-baseline')), '../infra/governance/baseline/visual/targeted')
    assert.equal(readFileSync(join(root, 'snapshots-baseline/curated.png'), 'utf8'), 'curated\n')
    assert.equal(readFileSync(join(root, '.claude/snapshots-baseline/targeted.png'), 'utf8'), 'targeted\n')

    rmSync(join(root, '.claude'), { recursive: true })
    assert.throws(() => syncBaselineMirrors({ root, check: true }), /mirror is missing/)
    syncBaselineMirrors({ root })
    assert.equal(lstatSync(join(root, '.claude/snapshots-baseline')).isSymbolicLink(), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

{
  const root = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'baseline-mirror-outside-'))
  try {
    symlinkSync(outside, join(root, '.claude'))
    assert.throws(() => syncBaselineMirrors({ root }), /symbolic-link ancestor/)
    assert.equal(existsSync(join(outside, 'snapshots-baseline')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
}

{
  const root = fixture()
  try {
    mkdirSync(join(root, 'snapshots-baseline'))
    assert.throws(() => syncBaselineMirrors({ root }), /refusing to replace non-symlink/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

console.log('✓ clean-room/delete-.claude/poison baseline mirror tests pass')
