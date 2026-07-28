#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CONTROL_PLANE_GENESIS_CLOSED_STATE,
  CONTROL_PLANE_GENESIS_OPEN_STATE,
  controlPlaneGenesisTransitionDigest,
} from './lib/control-plane-genesis-transition.mjs'
import { syncBaselineMirrors } from './sync-governance-baseline-mirrors.mjs'

const REPOSITORY_ROOT = realpathSync(join(import.meta.dirname, '..'))
const OPEN_TRANSITION = JSON.parse(readFileSync(
  join(REPOSITORY_ROOT, 'scripts/governance-build-graph.json'),
  'utf8',
)).controlPlaneGenesisTransition
const CURATED_SOURCE = 'infra/governance/baseline/visual/curated/accordion-faq.png'
const CURATED_MIRROR = 'snapshots-baseline/accordion-faq.png'

assert.equal(OPEN_TRANSITION.state, CONTROL_PLANE_GENESIS_OPEN_STATE)
assert.equal(OPEN_TRANSITION.releaseAllowed, false)

function closedTransition() {
  const transition = structuredClone(OPEN_TRANSITION)
  transition.state = CONTROL_PLANE_GENESIS_CLOSED_STATE
  transition.releaseAllowed = true
  transition.contentDigest = controlPlaneGenesisTransitionDigest(transition)
  return transition
}

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

function assertOpenCheckRejects(root, mutate, pattern, cleanup = null) {
  syncBaselineMirrors({ root, transition: OPEN_TRANSITION })
  mutate()
  assert.throws(
    () => syncBaselineMirrors({ root, transition: OPEN_TRANSITION, check: true }),
    pattern,
  )
  cleanup?.()
  syncBaselineMirrors({ root, transition: OPEN_TRANSITION })
  syncBaselineMirrors({ root, transition: OPEN_TRANSITION, check: true })
}

{
  const root = fixture()
  try {
    syncBaselineMirrors({ root, transition: OPEN_TRANSITION })
    syncBaselineMirrors({ root, transition: OPEN_TRANSITION, check: true })
    assert.equal(lstatSync(join(root, 'snapshots-baseline')).isDirectory(), true)
    assert.equal(lstatSync(join(root, 'snapshots-baseline')).isSymbolicLink(), false)
    assert.equal(lstatSync(join(root, '.claude/snapshots-baseline')).isDirectory(), true)
    assert.equal(lstatSync(join(root, '.claude/snapshots-baseline')).isSymbolicLink(), false)
    assert.deepEqual(
      readFileSync(join(root, CURATED_MIRROR)),
      readFileSync(join(root, CURATED_SOURCE)),
    )

    assertOpenCheckRejects(
      root,
      () => writeFileSync(join(root, CURATED_MIRROR), 'tampered\n'),
      /preserved tree digest drift/,
    )
    assertOpenCheckRejects(
      root,
      () => rmSync(join(root, CURATED_MIRROR)),
      /preserved tree leaf count drift/,
    )
    assertOpenCheckRejects(
      root,
      () => writeFileSync(join(root, 'snapshots-baseline/transition-extra.png'), 'extra\n'),
      /preserved tree leaf count drift/,
    )
    assertOpenCheckRejects(
      root,
      () => chmodSync(join(root, CURATED_MIRROR), 0o755),
      /preserved tree digest drift/,
    )
    assertOpenCheckRejects(
      root,
      () => {
        rmSync(join(root, CURATED_MIRROR))
        symlinkSync(join(root, CURATED_SOURCE), join(root, CURATED_MIRROR))
      },
      /preserved tree contains a symbolic link/,
    )
    assertOpenCheckRejects(
      root,
      () => {
        rmSync(join(root, CURATED_MIRROR))
        linkSync(join(root, CURATED_SOURCE), join(root, CURATED_MIRROR))
      },
      /unsupported or hard-linked entry/,
      () => rmSync(join(root, CURATED_MIRROR)),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

{
  const root = fixture()
  const transition = closedTransition()
  try {
    syncBaselineMirrors({ root, transition })
    syncBaselineMirrors({ root, transition, check: true })
    assert.equal(readlinkSync(join(root, 'snapshots-baseline')), 'infra/governance/baseline/visual/curated')
    assert.equal(readlinkSync(join(root, '.claude/snapshots-baseline')), '../infra/governance/baseline/visual/targeted')
    assert.deepEqual(
      readFileSync(join(root, CURATED_MIRROR)),
      readFileSync(join(root, CURATED_SOURCE)),
    )

    rmSync(join(root, '.claude'), { recursive: true })
    assert.throws(
      () => syncBaselineMirrors({ root, transition, check: true }),
      /mirror is missing/,
    )
    syncBaselineMirrors({ root, transition })
    assert.equal(lstatSync(join(root, '.claude/snapshots-baseline')).isSymbolicLink(), true)

    rmSync(join(root, 'snapshots-baseline'))
    symlinkSync('infra/governance/baseline/visual/targeted', join(root, 'snapshots-baseline'))
    assert.throws(
      () => syncBaselineMirrors({ root, transition, check: true }),
      /link text drift|target drift/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

{
  const root = fixture()
  const transition = closedTransition()
  const outside = mkdtempSync(join(tmpdir(), 'baseline-mirror-outside-'))
  try {
    symlinkSync(outside, join(root, '.claude'))
    assert.throws(
      () => syncBaselineMirrors({ root, transition }),
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
  const transition = closedTransition()
  try {
    mkdirSync(join(root, 'snapshots-baseline'))
    assert.throws(
      () => syncBaselineMirrors({ root, transition }),
      /refusing to replace non-symlink/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

console.log('✓ open-tree drift/repair and closed-symlink baseline mirror tests pass')
