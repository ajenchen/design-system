#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  assertAllControlPlaneGenesisPreservations,
  assertControlPlaneGenesisBaseBinding,
  assertControlPlaneGenesisTransitionClosed,
  CONTROL_PLANE_GENESIS_BASE_COMMIT,
  CONTROL_PLANE_GENESIS_BASE_TREE,
  CONTROL_PLANE_GENESIS_CLOSED_STATE,
  CONTROL_PLANE_GENESIS_OPEN_STATE,
  CONTROL_PLANE_GENESIS_TOMBSTONES,
  controlPlaneGenesisTransitionDigest,
  loadControlPlaneGenesisTransition,
  readAllControlPlaneGenesisBasePreservations,
  readControlPlaneGenesisBasePreservation,
  transitionPreservation,
  transitionTombstone,
  validateControlPlaneGenesisTransition,
} from './lib/control-plane-genesis-transition.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const GRAPH_PATH = join(ROOT, 'scripts/governance-build-graph.json')
const SCHEMA_PATH = join(ROOT, 'scripts/schemas/governance-build-graph.schema.json')
const sha256 = value => createHash('sha256').update(value).digest('hex')

function redigest(transition) {
  transition.contentDigest = '0'.repeat(64)
  transition.contentDigest = controlPlaneGenesisTransitionDigest(transition)
  return transition
}

function mutated(transition, change, { digest = true } = {}) {
  const copy = structuredClone(transition)
  change(copy)
  return digest ? redigest(copy) : copy
}

function modeBits(mode) {
  return mode === '100755' ? 0o755 : 0o644
}

function writeRegular(path, bytes, mode) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, bytes, { mode: modeBits(mode) })
  chmodSync(path, modeBits(mode))
}

function materializePreservations(root, materializations) {
  for (const item of materializations) {
    const path = join(root, item.path)
    if (item.kind === 'tree') {
      mkdirSync(path, { recursive: true })
      for (const leaf of item.leaves) writeRegular(join(path, leaf.relativePath), leaf.bytes, leaf.mode)
    } else if (item.kind === 'file') writeRegular(path, item.bytes, item.mode)
    else {
      mkdirSync(dirname(path), { recursive: true })
      symlinkSync(item.target, path)
    }
  }
}

function closedMaterializationRoot() {
  const root = mkdtempSync(join(tmpdir(), 'control-plane-genesis-closed-'))
  mkdirSync(join(root, 'infra/governance/baseline/visual/targeted'), { recursive: true })
  mkdirSync(join(root, 'infra/governance/baseline/visual/curated'), { recursive: true })
  mkdirSync(join(root, '.claude'), { recursive: true })
  symlinkSync(
    '../infra/governance/baseline/visual/targeted',
    join(root, '.claude/snapshots-baseline'),
  )
  symlinkSync(
    'infra/governance/baseline/visual/curated',
    join(root, 'snapshots-baseline'),
  )
  return root
}

const graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'))
const transition = loadControlPlaneGenesisTransition({ root: ROOT })
const openTransition = mutated(transition, value => {
  value.state = CONTROL_PLANE_GENESIS_OPEN_STATE
  value.releaseAllowed = false
})

test('graph schema carries one closed Genesis transition contract', () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validate = ajv.compile(schema)
  assert.equal(validate(graph), true, ajv.errorsText(validate.errors))
  assert.equal(graph.controlPlaneGenesisTransition.contentDigest, controlPlaneGenesisTransitionDigest(transition))
  assert.equal(transition.state, CONTROL_PLANE_GENESIS_CLOSED_STATE)
  assert.equal(transition.releaseAllowed, true)
  assert.equal(transition.baseCommit, CONTROL_PLANE_GENESIS_BASE_COMMIT)
  assert.equal(transition.baseTree, CONTROL_PLANE_GENESIS_BASE_TREE)
  assert.equal(transition.preservations.length, 5)
  assert.deepEqual(transition.tombstones, CONTROL_PLANE_GENESIS_TOMBSTONES)

  const missingCarrier = structuredClone(graph)
  delete missingCarrier.controlPlaneGenesisTransition
  assert.equal(validate(missingCarrier), false, 'schema accepted a missing transition carrier')
  const openShape = structuredClone(graph)
  openShape.controlPlaneGenesisTransition.unreviewed = true
  assert.equal(validate(openShape), false, 'schema accepted an open transition shape')
  const mismatchedState = structuredClone(graph)
  mismatchedState.controlPlaneGenesisTransition.releaseAllowed = false
  assert.equal(validate(mismatchedState), false, 'schema accepted closed state with releaseAllowed=false')
  const historicalOpenGraph = structuredClone(graph)
  historicalOpenGraph.controlPlaneGenesisTransition = openTransition
  assert.equal(validate(historicalOpenGraph), true, ajv.errorsText(validate.errors))
})

test('carrier is content-addressed, ordered, non-overlapping, and exact-scope', () => {
  assert.deepEqual(validateControlPlaneGenesisTransition(transition), transition)
  assert.throws(
    () => validateControlPlaneGenesisTransition(mutated(transition, value => {
      value.preservations[0].sha256 = 'f'.repeat(64)
    }, { digest: false })),
    /content digest is stale or substituted/,
  )
  assert.throws(
    () => validateControlPlaneGenesisTransition(mutated(transition, value => {
      value.preservations.splice(1, 1)
    })),
    /scope differs/,
  )
  assert.throws(
    () => validateControlPlaneGenesisTransition(mutated(transition, value => {
      value.preservations[1].path = `${value.preservations[0].path}/nested`
    })),
    /paths overlap/,
  )
  assert.throws(
    () => validateControlPlaneGenesisTransition(mutated(transition, value => {
      ;[value.preservations[0], value.preservations[1]] = [value.preservations[1], value.preservations[0]]
    })),
    /not canonically ordered/,
  )
  assert.throws(
    () => validateControlPlaneGenesisTransition(mutated(transition, value => {
      value.preservations[1].path = value.preservations[0].path
    })),
    /paths are duplicated/,
  )
  assert.throws(
    () => validateControlPlaneGenesisTransition(mutated(transition, value => {
      value.tombstones[0].sha256 = 'f'.repeat(64)
    })),
    /tombstone identity differs/,
  )
  assert.throws(
    () => validateControlPlaneGenesisTransition({ ...transition, unreviewed: true }),
    /invalid or open shape/,
  )
})

test('exact Genesis base Git objects bind every preservation and expose deterministic bytes', () => {
  const binding = assertControlPlaneGenesisBaseBinding({ root: ROOT, transition })
  assert.equal(binding.baseCommit, CONTROL_PLANE_GENESIS_BASE_COMMIT)
  assert.equal(binding.baseTree, CONTROL_PLANE_GENESIS_BASE_TREE)
  assert.deepEqual(binding.preservations, transition.preservations)

  const first = readAllControlPlaneGenesisBasePreservations({ root: ROOT, transition: openTransition })
  const second = readAllControlPlaneGenesisBasePreservations({ root: ROOT, transition: openTransition })
  assert.deepEqual(first, second, 'base-object materialization changed between identical reads')
  assert.equal(first.length, 5)
  assert.equal(first.find(item => item.path === '.claude/snapshots-baseline').leaves.length, 97)
  assert.equal(first.find(item => item.path === 'snapshots-baseline').leaves.length, 113)
  assert.equal(first.find(item => item.path === 'template/ds-product-template/.claude/hooks').leaves.length, 2)
  assert.equal(
    sha256(first.find(item => item.path.endsWith('/preamble.md')).bytes),
    transitionPreservation(transition, 'packages/design-system/ds-canonical/fork/preamble.md').sha256,
  )
  assert.equal(
    readControlPlaneGenesisBasePreservation({
      root: ROOT,
      transition: openTransition,
      path: 'packages/design-system/scripts',
    }).target,
    '../../scripts',
  )

  const substitutedTree = mutated(transition, value => {
    value.preservations[0].sha256 = 'f'.repeat(64)
  })
  assert.doesNotThrow(() => validateControlPlaneGenesisTransition(substitutedTree))
  assert.throws(
    () => assertControlPlaneGenesisBaseBinding({ root: ROOT, transition: substitutedTree }),
    /differs from the exact Genesis base objects/,
  )
  const substitutedMode = mutated(transition, value => {
    value.preservations[1].mode = '100755'
  })
  assert.throws(
    () => assertControlPlaneGenesisBaseBinding({ root: ROOT, transition: substitutedMode }),
    /differs from the exact Genesis base objects/,
  )
  const substitutedTarget = mutated(transition, value => {
    value.preservations[2].target = '../scripts'
    value.preservations[2].sha256 = sha256('../scripts')
  })
  assert.throws(
    () => assertControlPlaneGenesisBaseBinding({ root: ROOT, transition: substitutedTarget }),
    /differs from the exact Genesis base objects/,
  )
  assert.throws(
    () => validateControlPlaneGenesisTransition(mutated(transition, value => {
      value.baseCommit = binding.head
    })),
    /base commit is stale or substituted/,
  )
})

test('historical open-state preservation bytes fail closed on drift', t => {
  const source = readAllControlPlaneGenesisBasePreservations({ root: ROOT, transition: openTransition })
  const materialized = mkdtempSync(join(tmpdir(), 'control-plane-genesis-open-'))
  t.after(() => rmSync(materialized, { recursive: true, force: true }))
  materializePreservations(materialized, source)
  assert.deepEqual(
    assertAllControlPlaneGenesisPreservations({
      root: ROOT,
      materializationRoot: materialized,
      transition: openTransition,
    }),
    openTransition.preservations,
  )
  const preamble = join(materialized, 'packages/design-system/ds-canonical/fork/preamble.md')
  writeFileSync(preamble, Buffer.concat([readFileSync(preamble), Buffer.from('\n')]))
  assert.throws(
    () => assertAllControlPlaneGenesisPreservations({
      root: ROOT,
      materializationRoot: materialized,
      transition: openTransition,
    }),
    /preserved file digest drift/,
  )
  const preambleSource = source.find(item => item.path.endsWith('/preamble.md'))
  writeRegular(preamble, preambleSource.bytes, preambleSource.mode)
  chmodSync(preamble, 0o755)
  assert.throws(
    () => assertAllControlPlaneGenesisPreservations({
      root: ROOT,
      materializationRoot: materialized,
      transition: openTransition,
    }),
    /preserved file mode drift/,
  )
  writeRegular(preamble, preambleSource.bytes, preambleSource.mode)

  const treeSource = source.find(item => item.path === 'template/ds-product-template/.claude/hooks')
  const treeLeaf = join(materialized, treeSource.path, treeSource.leaves[0].relativePath)
  writeFileSync(treeLeaf, Buffer.concat([readFileSync(treeLeaf), Buffer.from('\n')]))
  assert.throws(
    () => assertAllControlPlaneGenesisPreservations({
      root: ROOT,
      materializationRoot: materialized,
      transition: openTransition,
    }),
    /preserved tree digest drift/,
  )
  writeRegular(treeLeaf, treeSource.leaves[0].bytes, treeSource.leaves[0].mode)

  const alias = join(materialized, 'packages/design-system/scripts')
  unlinkSync(alias)
  symlinkSync('../scripts', alias)
  assert.throws(
    () => assertAllControlPlaneGenesisPreservations({
      root: ROOT,
      materializationRoot: materialized,
      transition: openTransition,
    }),
    /preserved symlink target drift/,
  )
  unlinkSync(alias)
  symlinkSync('../../scripts', alias)
})

test('open and closed states have disjoint fail-closed completion semantics', t => {
  assert.throws(
    () => assertControlPlaneGenesisTransitionClosed({ root: ROOT, transition: openTransition }),
    /candidate freeze\/release is forbidden/,
  )
  const closed = structuredClone(transition)
  assert.deepEqual(validateControlPlaneGenesisTransition(closed), closed)
  assert.throws(
    () => readAllControlPlaneGenesisBasePreservations({ root: ROOT, transition: closed }),
    /unavailable after transition closure/,
  )

  const materialized = closedMaterializationRoot()
  t.after(() => rmSync(materialized, { recursive: true, force: true }))
  assert.deepEqual(
    assertControlPlaneGenesisTransitionClosed({
      root: ROOT,
      materializationRoot: materialized,
      transition: closed,
    }),
    closed,
  )
  assert.equal(readlinkSync(join(materialized, '.claude/snapshots-baseline')), '../infra/governance/baseline/visual/targeted')

  writeRegular(
    join(materialized, transition.tombstones[0].path),
    Buffer.from('not a closed transition\n'),
    transition.tombstones[0].mode,
  )
  assert.throws(
    () => assertControlPlaneGenesisTransitionClosed({
      root: ROOT,
      materializationRoot: materialized,
      transition: closed,
    }),
    /legacy path remains present/,
  )
  unlinkSync(join(materialized, transition.tombstones[0].path))
  const legacyPreamble = join(materialized, 'packages/design-system/ds-canonical/fork/preamble.md')
  writeRegular(legacyPreamble, Buffer.from('legacy\n'), '100644')
  assert.throws(
    () => assertControlPlaneGenesisTransitionClosed({
      root: ROOT,
      materializationRoot: materialized,
      transition: closed,
    }),
    /legacy path remains present/,
  )
  unlinkSync(legacyPreamble)
  unlinkSync(join(materialized, '.claude/snapshots-baseline'))
  symlinkSync('../infra/governance/baseline/visual/curated', join(materialized, '.claude/snapshots-baseline'))
  assert.throws(
    () => assertControlPlaneGenesisTransitionClosed({
      root: ROOT,
      materializationRoot: materialized,
      transition: closed,
    }),
    /closed baseline link text drift/,
  )
})

test('canonical repository carries the closed transition without legacy paths', () => {
  assert.deepEqual(validateControlPlaneGenesisTransition(transition), transition)
  assert.equal(transition.state, CONTROL_PLANE_GENESIS_CLOSED_STATE)
  assert.equal(transition.releaseAllowed, true)
  for (const tombstone of transition.tombstones) {
    assert.equal(transitionTombstone(transition, tombstone.path).sha256, tombstone.sha256)
    assert.equal(existsSync(join(ROOT, tombstone.path)), false, `closed tombstone remains:${tombstone.path}`)
  }
  for (const path of [
    'packages/design-system/ds-canonical/fork/preamble.md',
    'packages/design-system/scripts',
    'template/ds-product-template/.claude/hooks',
  ]) {
    assert.equal(existsSync(join(ROOT, path)), false, `closed preservation remains:${path}`)
  }
})
