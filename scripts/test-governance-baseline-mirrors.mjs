#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncBaselineMirrors } from './sync-governance-baseline-mirrors.mjs'

const REPOSITORY_ROOT = realpathSync(join(import.meta.dirname, '..'))
const CURATED_SOURCE = 'infra/governance/baseline/visual/curated/accordion-faq.png'
const CURATED_MIRROR = 'snapshots-baseline/accordion-faq.png'

function runGit(args, cwd = REPOSITORY_ROOT) {
  const result = spawnSync('/usr/bin/git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      HOME: '/dev/null',
      LANG: 'C',
      LC_ALL: 'C',
      PATH: '/usr/bin:/bin',
    },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  assert.equal(
    result.status,
    0,
    `Git fixture command failed:${args.join(' ')}:${result.stderr || result.error?.message || ''}`,
  )
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'baseline-mirrors-'))
  runGit(['clone', '--quiet', '--shared', '--no-checkout', REPOSITORY_ROOT, root])
  runGit([
    '-C',
    root,
    'checkout',
    '--quiet',
    'HEAD',
    '--',
    'infra/governance/baseline/visual',
  ])
  return root
}

// The control-plane genesis transition closed and its retained-tree machinery
// retired 2026-08-04 (baton §8.5); the mirrors are plain authenticated
// symlinks onto the provider-neutral visual baseline collections.
{
  const root = fixture()
  try {
    syncBaselineMirrors({ root })
    syncBaselineMirrors({ root, check: true })
    assert.equal(readlinkSync(join(root, 'snapshots-baseline')), 'infra/governance/baseline/visual/curated')
    assert.equal(readlinkSync(join(root, '.claude/snapshots-baseline')), '../infra/governance/baseline/visual/targeted')
    assert.deepEqual(
      readFileSync(join(root, CURATED_MIRROR)),
      readFileSync(join(root, CURATED_SOURCE)),
    )

    rmSync(join(root, '.claude'), { recursive: true })
    assert.throws(
      () => syncBaselineMirrors({ root, check: true }),
      /mirror is missing/,
    )
    syncBaselineMirrors({ root })
    assert.equal(lstatSync(join(root, '.claude/snapshots-baseline')).isSymbolicLink(), true)

    rmSync(join(root, 'snapshots-baseline'))
    symlinkSync('infra/governance/baseline/visual/targeted', join(root, 'snapshots-baseline'))
    assert.throws(
      () => syncBaselineMirrors({ root, check: true }),
      /link text drift|target drift/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

{
  const root = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'baseline-mirror-outside-'))
  try {
    symlinkSync(outside, join(root, '.claude'))
    assert.throws(
      () => syncBaselineMirrors({ root }),
      /symbolic-link ancestor/,
    )
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
    assert.throws(
      () => syncBaselineMirrors({ root }),
      /refusing to replace non-symlink/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

console.log('✓ symlink baseline mirror generation, drift detection, and containment tests pass')
