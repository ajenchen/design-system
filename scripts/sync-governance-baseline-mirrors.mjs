#!/usr/bin/env node
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertControlPlaneGenesisPreservation,
  CONTROL_PLANE_GENESIS_RETAIN_STATE,
  loadControlPlaneGenesisTransition,
  readControlPlaneGenesisBasePreservation,
  validateControlPlaneGenesisTransition,
} from './lib/control-plane-genesis-transition.mjs'
import { resolveVisualBaselinePath } from './lib/governance-visual-baselines.mjs'

const DEFAULT_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))

export const BASELINE_MIRRORS = Object.freeze([
  Object.freeze({
    collection: 'curated',
    destination: 'snapshots-baseline',
    linkTarget: 'infra/governance/baseline/visual/curated',
  }),
  Object.freeze({
    collection: 'targeted',
    destination: '.claude/snapshots-baseline',
    linkTarget: '../infra/governance/baseline/visual/targeted',
  }),
])

function fail(message) {
  throw new Error(`governance baseline mirror blocked:${message}`)
}

function contained(root, target, { allowRoot = true } = {}) {
  const rel = relative(root, target)
  if (!rel) return allowRoot
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

function assertNoSymlinkAncestors(root, target, label) {
  if (!contained(root, target)) fail(`${label} escapes repository root`)
  const rel = relative(root, target)
  let cursor = root
  for (const segment of rel ? rel.split(sep) : []) {
    cursor = resolve(cursor, segment)
    if (!existsSync(cursor)) break
    const info = lstatSync(cursor)
    if (info.isSymbolicLink()) fail(`${label} crosses a symbolic-link ancestor:${cursor}`)
    if (cursor !== target && !info.isDirectory()) fail(`${label} crosses a non-directory:${cursor}`)
  }
}

function verifyRetainedMirror(root, descriptor, transition) {
  const source = resolveVisualBaselinePath({ repoRoot: root, collection: descriptor.collection })
  if (!existsSync(source)) fail(`canonical ${descriptor.collection} collection is missing`)
  const sourceInfo = lstatSync(source)
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) fail(`canonical ${descriptor.collection} collection is not a real directory`)
  assertControlPlaneGenesisPreservation({
    root,
    transition,
    path: descriptor.destination,
  })
}

function materializeRetainedTree(root, destination, descriptor, transition) {
  const preservation = readControlPlaneGenesisBasePreservation({
    root,
    transition,
    path: descriptor.destination,
  })
  if (preservation.kind !== 'tree') fail(`retained compatibility output is not an authenticated tree:${descriptor.destination}`)
  mkdirSync(destination, { recursive: true })
  for (const leaf of preservation.leaves) {
    const target = resolve(destination, leaf.relativePath)
    if (!contained(destination, target)) fail(`retained tree leaf escapes destination:${leaf.relativePath}`)
    assertNoSymlinkAncestors(destination, dirname(target), `retained tree leaf ${leaf.relativePath}`)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, leaf.bytes, {
      flag: 'wx',
      mode: leaf.mode === '100755' ? 0o755 : 0o644,
    })
  }
}

function generateRetainedMirror(root, descriptor, transition) {
  const source = resolveVisualBaselinePath({ repoRoot: root, collection: descriptor.collection })
  if (!existsSync(source) || !lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink()) {
    fail(`canonical ${descriptor.collection} collection must exist as a real directory`)
  }
  const destination = resolve(root, descriptor.destination)
  const parent = dirname(destination)
  assertNoSymlinkAncestors(root, parent, `${descriptor.destination} parent`)
  mkdirSync(parent, { recursive: true })
  if (existsSync(destination)) {
    const info = lstatSync(destination)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      fail(`retained compatibility output must be a real directory:${descriptor.destination}`)
    }
  }
  const suffix = `${process.pid}-${descriptor.collection}`
  const temporary = resolve(parent, `.${basename(destination)}.genesis-${suffix}`)
  const backup = resolve(parent, `.${basename(destination)}.previous-${suffix}`)
  if (existsSync(temporary) || existsSync(backup)) fail(`retained mirror temporary path collision:${descriptor.destination}`)
  materializeRetainedTree(root, temporary, descriptor, transition)
  let movedPrevious = false
  try {
    if (existsSync(destination)) {
      renameSync(destination, backup)
      movedPrevious = true
    }
    renameSync(temporary, destination)
    verifyRetainedMirror(root, descriptor, transition)
    if (movedPrevious) rmSync(backup, { recursive: true })
  } catch (error) {
    if (existsSync(destination)) rmSync(destination, { recursive: true, force: true })
    if (movedPrevious && existsSync(backup)) renameSync(backup, destination)
    throw error
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
    if (existsSync(backup)) rmSync(backup, { recursive: true, force: true })
  }
}

function verifyMirror(root, descriptor) {
  const source = resolveVisualBaselinePath({ repoRoot: root, collection: descriptor.collection })
  if (!existsSync(source)) fail(`canonical ${descriptor.collection} collection is missing`)
  const sourceInfo = lstatSync(source)
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) fail(`canonical ${descriptor.collection} collection is not a real directory`)

  const destination = resolve(root, descriptor.destination)
  assertNoSymlinkAncestors(root, dirname(destination), `${descriptor.destination} parent`)
  if (!existsSync(destination)) fail(`generated mirror is missing:${descriptor.destination}`)
  const info = lstatSync(destination)
  if (!info.isSymbolicLink()) fail(`generated mirror must be an exact symbolic link:${descriptor.destination}`)
  if (readlinkSync(destination) !== descriptor.linkTarget) fail(`generated mirror link text drift:${descriptor.destination}`)
  if (realpathSync(destination) !== realpathSync(source)) fail(`generated mirror target drift:${descriptor.destination}`)
}

function generateMirror(root, descriptor) {
  const source = resolveVisualBaselinePath({ repoRoot: root, collection: descriptor.collection })
  if (!existsSync(source) || !lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink()) {
    fail(`canonical ${descriptor.collection} collection must exist as a real directory`)
  }
  const destination = resolve(root, descriptor.destination)
  const parent = dirname(destination)
  assertNoSymlinkAncestors(root, parent, `${descriptor.destination} parent`)
  mkdirSync(parent, { recursive: true })
  assertNoSymlinkAncestors(root, parent, `${descriptor.destination} prepared parent`)
  if (existsSync(destination) && !lstatSync(destination).isSymbolicLink()) {
    fail(`refusing to replace non-symlink compatibility path:${descriptor.destination}`)
  }
  if (existsSync(destination)
    && readlinkSync(destination) === descriptor.linkTarget
    && realpathSync(destination) === realpathSync(source)) return

  const temporary = resolve(parent, `.${basename(destination)}.tmp-${process.pid}`)
  if (existsSync(temporary)) rmSync(temporary)
  symlinkSync(descriptor.linkTarget, temporary)
  try {
    renameSync(temporary, destination)
  } finally {
    if (existsSync(temporary)) rmSync(temporary)
  }
}

export function syncBaselineMirrors({
  root = DEFAULT_ROOT,
  check = false,
  transition = null,
} = {}) {
  const repository = realpathSync(resolve(root))
  const lifecycle = transition
    ? validateControlPlaneGenesisTransition(transition)
    : loadControlPlaneGenesisTransition({ root: repository })
  if (lifecycle.state === CONTROL_PLANE_GENESIS_RETAIN_STATE) {
    if (check) for (const descriptor of BASELINE_MIRRORS) verifyRetainedMirror(repository, descriptor, lifecycle)
    else {
      for (const descriptor of BASELINE_MIRRORS) generateRetainedMirror(repository, descriptor, lifecycle)
      for (const descriptor of BASELINE_MIRRORS) verifyRetainedMirror(repository, descriptor, lifecycle)
    }
    return
  }
  if (check) {
    for (const descriptor of BASELINE_MIRRORS) verifyMirror(repository, descriptor)
  } else {
    for (const descriptor of BASELINE_MIRRORS) generateMirror(repository, descriptor)
    for (const descriptor of BASELINE_MIRRORS) verifyMirror(repository, descriptor)
  }
}

const IS_MAIN = (() => {
  if (!process.argv[1]) return false
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
})()
if (IS_MAIN) {
  try {
    syncBaselineMirrors({ check: process.argv.includes('--check') })
    console.log(`✓ governance visual baseline compatibility mirrors ${process.argv.includes('--check') ? 'match' : 'generated from'} the Genesis transition or neutral authority`)
  } catch (error) {
    console.error(`✗ ${error.message}`)
    process.exit(1)
  }
}
