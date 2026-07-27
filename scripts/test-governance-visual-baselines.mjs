#!/usr/bin/env node
import assert from 'node:assert/strict'
import { linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ensureVisualBaselineDirectory, prepareVisualBaselineFile, resolveVisualBaselinePath } from './lib/governance-visual-baselines.mjs'

const root = mkdtempSync(join(tmpdir(), 'visual-baseline-contract-'))
const outside = mkdtempSync(join(tmpdir(), 'visual-baseline-outside-'))
try {
  mkdirSync(join(root, 'infra/governance/baseline/visual/curated'), { recursive: true })
  mkdirSync(join(root, 'infra/governance/baseline/visual/targeted'), { recursive: true })
  const canonicalRoot = realpathSync(root)
  assert.equal(
    resolveVisualBaselinePath({ repoRoot: root, collection: 'curated' }),
    resolve(canonicalRoot, 'infra/governance/baseline/visual/curated'),
  )
  assert.equal(
    ensureVisualBaselineDirectory({ repoRoot: root, collection: 'targeted', childPath: 'people-picker' }),
    resolve(canonicalRoot, 'infra/governance/baseline/visual/targeted/people-picker'),
  )
  assert.equal(
    prepareVisualBaselineFile({ repoRoot: root, collection: 'targeted', childPath: 'people-picker/single.png' }),
    resolve(canonicalRoot, 'infra/governance/baseline/visual/targeted/people-picker/single.png'),
  )
  for (const childPath of ['../escape', '/tmp/escape', 'one\\two', 'one//two']) {
    assert.throws(() => resolveVisualBaselinePath({ repoRoot: root, collection: 'targeted', childPath }), /blocked/)
  }
  symlinkSync(outside, join(root, 'infra/governance/baseline/visual/targeted/poison'))
  assert.throws(
    () => resolveVisualBaselinePath({ repoRoot: root, collection: 'targeted', childPath: 'poison/image.png' }),
    /symbolic link/,
  )
  const outsideFile = join(outside, 'outside.png')
  const hardlink = join(root, 'infra/governance/baseline/visual/targeted/people-picker/hardlink.png')
  writeFileSync(outsideFile, 'do-not-touch\n')
  linkSync(outsideFile, hardlink)
  assert.throws(
    () => prepareVisualBaselineFile({ repoRoot: root, collection: 'targeted', childPath: 'people-picker/hardlink.png' }),
    /hard-link alias/,
  )
  const previousReadOnly = process.env.GOVERNANCE_READ_ONLY
  process.env.GOVERNANCE_READ_ONLY = '1'
  try {
    assert.throws(
      () => prepareVisualBaselineFile({ repoRoot: root, collection: 'targeted', childPath: 'people-picker/read-only.png' }),
      /READ_ONLY/,
    )
  } finally {
    if (previousReadOnly === undefined) delete process.env.GOVERNANCE_READ_ONLY
    else process.env.GOVERNANCE_READ_ONLY = previousReadOnly
  }
  assert.throws(() => resolveVisualBaselinePath({ repoRoot: root, collection: 'claude' }), /unknown collection/)
} finally {
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
}

console.log('✓ visual baseline authority is neutral, closed, and poison-resistant')
