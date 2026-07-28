import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
} from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { TextDecoder } from 'node:util'
import { runClosedGit } from './closed-tool-execution.mjs'

export const CONTROL_PLANE_GENESIS_TRANSITION_ID = 'control-plane-genesis-am-only-v1'
export const CONTROL_PLANE_GENESIS_BASE_COMMIT = '25b39558cbf352f053948190bb28326a78562f43'
export const CONTROL_PLANE_GENESIS_BASE_TREE = '92e090f9500fb14b8b05895a43c217f604cb5338'
export const CONTROL_PLANE_GENESIS_PROFILE = 'PRODUCTION_GRADE_SINGLE_OWNER_SMALL_TEAM'
export const CONTROL_PLANE_GENESIS_PHASE = 'control-plane-genesis'
export const CONTROL_PLANE_GENESIS_OPEN_STATE = 'open'
export const CONTROL_PLANE_GENESIS_CLOSED_STATE = 'closed'
// Compatibility name for callers that describe the open state by its effect.
export const CONTROL_PLANE_GENESIS_RETAIN_STATE = CONTROL_PLANE_GENESIS_OPEN_STATE

const TRANSITION_KEYS = Object.freeze([
  'baseCommit',
  'baseTree',
  'cleanupRequiresDistinctProtectedPr',
  'contentDigest',
  'deploymentProfile',
  'id',
  'phase',
  'preservations',
  'releaseAllowed',
  'schemaVersion',
  'state',
  'tombstones',
])
const EXPECTED_PRESERVATION_PATHS = Object.freeze([
  '.claude/snapshots-baseline',
  'packages/design-system/ds-canonical/fork/preamble.md',
  'packages/design-system/scripts',
  'snapshots-baseline',
  'template/ds-product-template/.claude/hooks',
])
export const CONTROL_PLANE_GENESIS_TOMBSTONES = Object.freeze([
  Object.freeze({
    path: '.claude/commands/gov-status.md',
    mode: '100644',
    sha256: '3475107aa215446c413498ce22a5908afe4cf9ee0c30c42bb41af72d06a91b83',
  }),
  Object.freeze({
    path: '.claude/hooks/check_post_main_ssot_propagate.sh',
    mode: '100755',
    sha256: 'd91d1d9c36311f1e77d46b387f2f39c0add7b075acf4af8b08f7c6a218ef5676',
  }),
  Object.freeze({
    path: '.github/workflows/ssot-sync-dispatch.yml',
    mode: '100644',
    sha256: '0f3f8000b10e3abad7ace2d73ada9f3fc5deefa885ab4263f7016f69f0161184',
  }),
  Object.freeze({
    path: 'packages/design-system/ds-canonical/commands/gov-status.md',
    mode: '100644',
    sha256: '3475107aa215446c413498ce22a5908afe4cf9ee0c30c42bb41af72d06a91b83',
  }),
  Object.freeze({
    path: 'packages/design-system/ds-canonical/hooks/check_post_main_ssot_propagate.sh',
    mode: '100755',
    sha256: 'd91d1d9c36311f1e77d46b387f2f39c0add7b075acf4af8b08f7c6a218ef5676',
  }),
])
const CONTROL_PLANE_GENESIS_CLOSED_ABSENT_PATHS = Object.freeze([
  ...CONTROL_PLANE_GENESIS_TOMBSTONES.map(item => item.path),
  'packages/design-system/ds-canonical/fork/preamble.md',
  'packages/design-system/scripts',
  'template/ds-product-template/.claude/hooks',
].sort())
const CONTROL_PLANE_GENESIS_CLOSED_BASELINE_LINKS = Object.freeze([
  Object.freeze({
    path: '.claude/snapshots-baseline',
    target: '../infra/governance/baseline/visual/targeted',
    authority: 'infra/governance/baseline/visual/targeted',
  }),
  Object.freeze({
    path: 'snapshots-baseline',
    target: 'infra/governance/baseline/visual/curated',
    authority: 'infra/governance/baseline/visual/curated',
  }),
])
export const CONTROL_PLANE_GENESIS_CLOSED_BASELINE_PATHS = Object.freeze(
  CONTROL_PLANE_GENESIS_CLOSED_BASELINE_LINKS.map(item => item.path),
)

const SHA256 = /^[a-f0-9]{64}$/
const GIT_SHA1 = /^[a-f0-9]{40}$/
const UTF8 = new TextDecoder('utf-8', { fatal: true })
const MAX_GIT_BYTES = 128 * 1024 * 1024

function invariant(condition, message) {
  if (!condition) throw new Error(`control-plane genesis transition blocked:${message}`)
}

function exactKeys(value, keys, label) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  invariant(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()),
    `${label} has an invalid or open shape`,
  )
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

function repositoryPath(value, label) {
  invariant(
    typeof value === 'string'
      && value.length > 0
      && !value.includes('\0')
      && !value.includes('\\')
      && !isAbsolute(value)
      && value.split('/').every(segment => segment && segment !== '.' && segment !== '..'),
    `${label} must be a repository-relative POSIX path`,
  )
  return value
}

function canonicalRoot(root, label) {
  invariant(typeof root === 'string' && root.length > 0, `${label} is required`)
  const absolute = resolve(root)
  const canonical = realpathSync(absolute)
  const info = lstatSync(canonical)
  invariant(info.isDirectory() && !info.isSymbolicLink(), `${label} must be one real directory`)
  return canonical
}

function contained(root, path, label) {
  const repositoryRelative = repositoryPath(path, label)
  const absolute = resolve(root, repositoryRelative)
  const rel = relative(root, absolute)
  invariant(rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${label} escapes the repository`)
  return absolute
}

function assertRealAncestors(root, absolute, label) {
  const rel = relative(root, absolute)
  let cursor = root
  for (const segment of rel.split(sep).slice(0, -1)) {
    cursor = resolve(cursor, segment)
    invariant(existsSync(cursor), `${label} ancestor is missing:${relative(root, cursor).split(sep).join('/')}`)
    const info = lstatSync(cursor)
    invariant(info.isDirectory() && !info.isSymbolicLink(), `${label} crosses a non-directory or symbolic-link ancestor`)
  }
}

function assertPathAbsent(root, path, label) {
  const segments = repositoryPath(path, label).split('/')
  let cursor = root
  for (let index = 0; index < segments.length; index += 1) {
    cursor = resolve(cursor, segments[index])
    let info
    try {
      info = lstatSync(cursor)
    } catch (error) {
      if (error?.code === 'ENOENT') return true
      throw error
    }
    invariant(index < segments.length - 1, `${label} remains present:${path}`)
    invariant(info.isDirectory() && !info.isSymbolicLink(), `${label} crosses a non-directory or symbolic-link ancestor:${path}`)
  }
  invariant(false, `${label} remains present:${path}`)
}

function assertClosedBaselineLinks(root) {
  for (const descriptor of CONTROL_PLANE_GENESIS_CLOSED_BASELINE_LINKS) {
    const absolute = contained(root, descriptor.path, 'closed baseline link')
    assertRealAncestors(root, absolute, `closed baseline link ${descriptor.path}`)
    const info = lstatSync(absolute)
    invariant(info.isSymbolicLink(), `closed baseline is not an exact symbolic link:${descriptor.path}`)
    invariant(readlinkSync(absolute) === descriptor.target, `closed baseline link text drift:${descriptor.path}`)
    const authority = contained(root, descriptor.authority, 'closed baseline authority')
    assertRealAncestors(root, authority, `closed baseline authority ${descriptor.authority}`)
    const authorityInfo = lstatSync(authority)
    invariant(authorityInfo.isDirectory() && !authorityInfo.isSymbolicLink(), `closed baseline authority is not a real directory:${descriptor.authority}`)
    invariant(realpathSync(absolute) === realpathSync(authority), `closed baseline target drift:${descriptor.path}`)
  }
  return CONTROL_PLANE_GENESIS_CLOSED_BASELINE_LINKS.map(item => ({ ...item }))
}

function fileMode(info) {
  invariant(info.isFile() && !info.isSymbolicLink(), 'file preservation is not a regular file')
  return (info.mode & 0o111) === 0 ? '100644' : '100755'
}

function treeDescriptor(leaves) {
  const ordered = [...leaves].sort((left, right) => compareUtf8(left.relativePath, right.relativePath))
  const records = ordered.map(leaf => (
    `file:${leaf.relativePath}:${leaf.mode}:${leaf.sha256}`
  ))
  return {
    leafCount: ordered.length,
    sha256: sha256(`${records.join('\n')}\n`),
  }
}

function worktreeTreeLeaves(root) {
  const leaves = []
  const visit = (directory, prefix = '') => {
    for (const name of readdirSync(directory).sort(compareUtf8)) {
      const absolute = resolve(directory, name)
      const relativePath = prefix ? `${prefix}/${name}` : name
      const info = lstatSync(absolute)
      invariant(!info.isSymbolicLink(), `preserved tree contains a symbolic link:${relativePath}`)
      if (info.isDirectory()) visit(absolute, relativePath)
      else {
        invariant(info.isFile() && info.nlink === 1, `preserved tree contains an unsupported or hard-linked entry:${relativePath}`)
        leaves.push({
          relativePath,
          mode: fileMode(info),
          sha256: sha256(readFileSync(absolute)),
        })
      }
    }
  }
  visit(root)
  return leaves
}

function closedGit(repository, args, {
  input,
  output = 'capture',
  timeoutMs = 30_000,
} = {}) {
  const result = runClosedGit(args, {
    cwd: repository,
    input,
    maxInputBytes: MAX_GIT_BYTES,
    maxOutputBytes: MAX_GIT_BYTES,
    output,
    timeoutMs,
  })
  invariant(
    !result.error && result.signal === null && result.status === 0,
    `closed Git ${args.join(' ')} failed:${String(result.stderr ?? '').trim()}`,
  )
  return result.stdout
}

function decodeUtf8(bytes, label) {
  try {
    return UTF8.decode(bytes)
  } catch {
    invariant(false, `${label} is not canonical UTF-8`)
  }
}

function nulRows(bytes, label) {
  invariant(Buffer.isBuffer(bytes), `${label} did not return bytes`)
  if (bytes.length === 0) return []
  invariant(bytes[bytes.length - 1] === 0, `${label} is not NUL terminated`)
  return bytes.subarray(0, -1).toString('binary').split('\0').map(row => Buffer.from(row, 'binary'))
}

function parseLsTreeRow(row, label) {
  const tab = row.indexOf(0x09)
  invariant(tab > 0, `${label} is malformed`)
  const metadata = row.subarray(0, tab).toString('ascii').match(/^([0-7]{6}) (blob|tree|commit) ([a-f0-9]{40,64})$/)
  invariant(metadata, `${label} metadata is malformed`)
  const path = decodeUtf8(row.subarray(tab + 1), `${label} path`)
  repositoryPath(path, `${label} path`)
  return { mode: metadata[1], type: metadata[2], oid: metadata[3], path }
}

function readBlobBatch(repository, objectIds) {
  const unique = [...new Set(objectIds)]
  if (unique.length === 0) return new Map()
  const output = closedGit(repository, ['cat-file', '--batch'], {
    input: Buffer.from(`${unique.join('\n')}\n`),
    output: 'buffer',
  })
  const blobs = new Map()
  let offset = 0
  for (const expectedOid of unique) {
    const newline = output.indexOf(0x0a, offset)
    invariant(newline >= offset, `Git blob header is missing:${expectedOid}`)
    const header = output.subarray(offset, newline).toString('ascii').match(/^([a-f0-9]{40,64}) blob ([0-9]+)$/)
    invariant(header && header[1] === expectedOid, `Git blob identity is stale or substituted:${expectedOid}`)
    const size = Number(header[2])
    invariant(Number.isSafeInteger(size) && size >= 0, `Git blob size is invalid:${expectedOid}`)
    const start = newline + 1
    const end = start + size
    invariant(end < output.length && output[end] === 0x0a, `Git blob payload is truncated:${expectedOid}`)
    blobs.set(expectedOid, Buffer.from(output.subarray(start, end)))
    offset = end + 1
  }
  invariant(offset === output.length, 'Git blob batch returned unexpected trailing output')
  return blobs
}

function readBasePreservation(repository, transition, preservation) {
  const rootRows = nulRows(
    closedGit(repository, ['ls-tree', '-z', '--full-tree', transition.baseCommit, '--', preservation.path], { output: 'buffer' }),
    `Git preservation root ${preservation.path}`,
  )
  invariant(rootRows.length === 1, `base preservation root is missing or ambiguous:${preservation.path}`)
  const rootEntry = parseLsTreeRow(rootRows[0], `Git preservation root ${preservation.path}`)
  invariant(rootEntry.path === preservation.path, `base preservation root path was substituted:${preservation.path}`)

  if (preservation.kind === 'tree') {
    invariant(rootEntry.type === 'tree' && rootEntry.mode === '040000', `base preservation is not a tree:${preservation.path}`)
    const entries = nulRows(
      closedGit(
        repository,
        ['ls-tree', '-r', '-z', '--full-tree', transition.baseCommit, '--', preservation.path],
        { output: 'buffer' },
      ),
      `Git preservation tree ${preservation.path}`,
    ).map((row, index) => parseLsTreeRow(row, `Git preservation tree ${preservation.path} row ${index}`))
    invariant(entries.length > 0, `base preservation tree is empty:${preservation.path}`)
    for (const entry of entries) {
      invariant(
        entry.type === 'blob' && (entry.mode === '100644' || entry.mode === '100755'),
        `base preservation tree contains an unsupported entry:${entry.path}:${entry.mode}:${entry.type}`,
      )
      invariant(entry.path.startsWith(`${preservation.path}/`), `base preservation tree escaped its root:${entry.path}`)
    }
    const blobs = readBlobBatch(repository, entries.map(entry => entry.oid))
    const leaves = entries.map(entry => {
      const bytes = blobs.get(entry.oid)
      const relativePath = entry.path.slice(preservation.path.length + 1)
      repositoryPath(relativePath, `base preservation tree leaf ${entry.path}`)
      return {
        relativePath,
        mode: entry.mode,
        sha256: sha256(bytes),
        bytes: Buffer.from(bytes),
      }
    }).sort((left, right) => compareUtf8(left.relativePath, right.relativePath))
    const descriptor = {
      kind: 'tree',
      path: preservation.path,
      ...treeDescriptor(leaves),
    }
    return { ...descriptor, leaves }
  }

  invariant(rootEntry.type === 'blob', `base preservation is not a blob:${preservation.path}`)
  const bytes = readBlobBatch(repository, [rootEntry.oid]).get(rootEntry.oid)
  if (preservation.kind === 'file') {
    invariant(rootEntry.mode === '100644' || rootEntry.mode === '100755', `base preservation file mode is invalid:${preservation.path}`)
    return {
      kind: 'file',
      path: preservation.path,
      mode: rootEntry.mode,
      sha256: sha256(bytes),
      bytes: Buffer.from(bytes),
    }
  }

  invariant(rootEntry.mode === '120000', `base preservation is not a symbolic link:${preservation.path}`)
  const target = decodeUtf8(bytes, `base preservation symlink ${preservation.path}`)
  invariant(target.length > 0 && !target.includes('\0'), `base preservation symlink target is invalid:${preservation.path}`)
  return {
    kind: 'symlink',
    path: preservation.path,
    mode: '120000',
    sha256: sha256(bytes),
    target,
  }
}

function preservationDescriptor(materialization) {
  if (materialization.kind === 'tree') {
    return {
      kind: 'tree',
      leafCount: materialization.leafCount,
      path: materialization.path,
      sha256: materialization.sha256,
    }
  }
  if (materialization.kind === 'file') {
    return {
      kind: 'file',
      mode: materialization.mode,
      path: materialization.path,
      sha256: materialization.sha256,
    }
  }
  return {
    kind: 'symlink',
    mode: materialization.mode,
    path: materialization.path,
    sha256: materialization.sha256,
    target: materialization.target,
  }
}

function cloneMaterialization(materialization) {
  if (materialization.kind === 'tree') {
    return {
      ...preservationDescriptor(materialization),
      leaves: materialization.leaves.map(leaf => ({ ...leaf, bytes: Buffer.from(leaf.bytes) })),
    }
  }
  if (materialization.kind === 'file') {
    return { ...preservationDescriptor(materialization), bytes: Buffer.from(materialization.bytes) }
  }
  return preservationDescriptor(materialization)
}

function validatePreservation(item, index) {
  invariant(item && typeof item === 'object' && !Array.isArray(item), `preservation ${index} must be an object`)
  const path = repositoryPath(item.path, `preservation ${index} path`)
  if (item.kind === 'tree') {
    exactKeys(item, ['kind', 'leafCount', 'path', 'sha256'], `tree preservation ${path}`)
    invariant(Number.isSafeInteger(item.leafCount) && item.leafCount > 0, `tree preservation ${path} leafCount is invalid`)
    invariant(SHA256.test(item.sha256), `tree preservation ${path} digest is invalid`)
  } else if (item.kind === 'file') {
    exactKeys(item, ['kind', 'mode', 'path', 'sha256'], `file preservation ${path}`)
    invariant(item.mode === '100644' || item.mode === '100755', `file preservation ${path} mode is invalid`)
    invariant(SHA256.test(item.sha256), `file preservation ${path} digest is invalid`)
  } else if (item.kind === 'symlink') {
    exactKeys(item, ['kind', 'mode', 'path', 'sha256', 'target'], `symlink preservation ${path}`)
    invariant(item.mode === '120000', `symlink preservation ${path} mode is invalid`)
    invariant(typeof item.target === 'string' && item.target.length > 0 && !item.target.includes('\0'), `symlink preservation ${path} target is invalid`)
    invariant(SHA256.test(item.sha256) && item.sha256 === sha256(Buffer.from(item.target, 'utf8')), `symlink preservation ${path} digest is invalid`)
  } else invariant(false, `preservation ${path} kind is invalid`)
  return path
}

function validateOrderedClosedPaths(paths, expected, label) {
  invariant(
    JSON.stringify(paths) === JSON.stringify([...paths].sort(compareUtf8)),
    `${label} paths are not canonically ordered`,
  )
  invariant(new Set(paths).size === paths.length, `${label} paths are duplicated`)
  for (let left = 0; left < paths.length; left += 1) for (let right = left + 1; right < paths.length; right += 1) {
    invariant(
      !paths[right].startsWith(`${paths[left]}/`) && !paths[left].startsWith(`${paths[right]}/`),
      `${label} paths overlap:${paths[left]}:${paths[right]}`,
    )
  }
  invariant(JSON.stringify(paths) === JSON.stringify(expected), `${label} scope differs from the one-time reviewed closure`)
}

export function controlPlaneGenesisTransitionDigest(transition) {
  exactKeys(transition, TRANSITION_KEYS, 'transition')
  const unsigned = { ...transition }
  delete unsigned.contentDigest
  return sha256(`qijenchen-control-plane-genesis-transition-v1\n${stable(unsigned)}\n`)
}

export function validateControlPlaneGenesisTransition(transition) {
  exactKeys(transition, TRANSITION_KEYS, 'transition')
  invariant(transition.schemaVersion === 1, 'transition schemaVersion is invalid')
  invariant(transition.id === CONTROL_PLANE_GENESIS_TRANSITION_ID, 'transition ID is invalid')
  invariant(transition.baseCommit === CONTROL_PLANE_GENESIS_BASE_COMMIT && GIT_SHA1.test(transition.baseCommit), 'transition base commit is stale or substituted')
  invariant(transition.baseTree === CONTROL_PLANE_GENESIS_BASE_TREE && GIT_SHA1.test(transition.baseTree), 'transition base tree is stale or substituted')
  invariant(transition.deploymentProfile === CONTROL_PLANE_GENESIS_PROFILE, 'transition deployment profile is invalid')
  invariant(transition.phase === CONTROL_PLANE_GENESIS_PHASE, 'transition phase is invalid')
  invariant(transition.cleanupRequiresDistinctProtectedPr === true, 'transition cleanup must require a distinct protected PR')
  invariant(
    transition.state === CONTROL_PLANE_GENESIS_OPEN_STATE
      || transition.state === CONTROL_PLANE_GENESIS_CLOSED_STATE,
    'transition state is invalid',
  )
  invariant(
    transition.releaseAllowed === (transition.state === CONTROL_PLANE_GENESIS_CLOSED_STATE),
    'transition releaseAllowed disagrees with its state',
  )

  invariant(Array.isArray(transition.preservations), 'transition preservations must be an array')
  const preservationPaths = transition.preservations.map(validatePreservation)
  validateOrderedClosedPaths(preservationPaths, EXPECTED_PRESERVATION_PATHS, 'transition preservation')

  invariant(Array.isArray(transition.tombstones), 'transition tombstones must be an array')
  const tombstonePaths = transition.tombstones.map((item, index) => {
    exactKeys(item, ['mode', 'path', 'sha256'], `tombstone ${index}`)
    const path = repositoryPath(item.path, `tombstone ${index} path`)
    invariant(item.mode === '100644' || item.mode === '100755', `tombstone ${path} mode is invalid`)
    invariant(SHA256.test(item.sha256), `tombstone ${path} digest is invalid`)
    return path
  })
  validateOrderedClosedPaths(
    tombstonePaths,
    CONTROL_PLANE_GENESIS_TOMBSTONES.map(item => item.path),
    'transition tombstone',
  )
  invariant(
    stable(transition.tombstones) === stable(CONTROL_PLANE_GENESIS_TOMBSTONES),
    'transition tombstone identity differs from the reviewed inert closure',
  )
  invariant(
    SHA256.test(transition.contentDigest)
      && transition.contentDigest === controlPlaneGenesisTransitionDigest(transition),
    'transition content digest is stale or substituted',
  )
  return structuredClone(transition)
}

export function loadControlPlaneGenesisTransition({
  root,
  graphPath = 'scripts/governance-build-graph.json',
} = {}) {
  const repository = canonicalRoot(root, 'repository root')
  const absolute = contained(repository, graphPath, 'build graph path')
  assertRealAncestors(repository, absolute, 'build graph')
  const before = lstatSync(absolute, { bigint: true })
  invariant(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n, 'build graph must be one regular file')
  const document = JSON.parse(readFileSync(absolute, 'utf8'))
  const after = lstatSync(absolute, { bigint: true })
  invariant(
    before.dev === after.dev
      && before.ino === after.ino
      && before.mode === after.mode
      && before.nlink === after.nlink
      && before.size === after.size
      && before.mtimeNs === after.mtimeNs
      && before.ctimeNs === after.ctimeNs,
    'build graph changed while it was read',
  )
  return validateControlPlaneGenesisTransition(document.controlPlaneGenesisTransition)
}

function assertGitBaseIdentity(repository, transition) {
  const result = closedGit(repository, [
    'rev-parse',
    `${transition.baseCommit}^{commit}`,
    `${transition.baseCommit}^{tree}`,
    'HEAD^{commit}',
  ])
  const [baseCommit, baseTree, head, ...extra] = result.trim().split('\n')
  invariant(extra.length === 0, 'transition Git identity readback returned unexpected output')
  invariant(
    baseCommit === transition.baseCommit
      && baseTree === transition.baseTree
      && GIT_SHA1.test(head || ''),
    'transition Git base identity is stale or substituted',
  )
  closedGit(repository, ['merge-base', '--is-ancestor', transition.baseCommit, head], { output: 'ignore' })
  return { baseCommit, baseTree, head }
}

function readVerifiedBasePreservations(repository, transition) {
  const identity = assertGitBaseIdentity(repository, transition)
  const materializations = transition.preservations.map(preservation => (
    readBasePreservation(repository, transition, preservation)
  ))
  const actual = materializations.map(preservationDescriptor)
  invariant(
    stable(actual) === stable(transition.preservations),
    'transition preservation identity differs from the exact Genesis base objects',
  )
  return { identity, materializations }
}

export function assertControlPlaneGenesisBaseBinding({
  root,
  transition,
} = {}) {
  const repository = canonicalRoot(root, 'repository root')
  const value = validateControlPlaneGenesisTransition(transition)
  const { identity, materializations } = readVerifiedBasePreservations(repository, value)
  return {
    ...identity,
    preservations: materializations.map(preservationDescriptor),
  }
}

// Pure authenticated read API for existing graph producers. It never writes,
// never consults the worktree bytes as an authority, and returns the exact
// regular-file bytes/modes or symlink target from the transition base commit.
export function readAllControlPlaneGenesisBasePreservations({
  root,
  transition,
} = {}) {
  const repository = canonicalRoot(root, 'repository root')
  const value = validateControlPlaneGenesisTransition(transition)
  invariant(value.state === CONTROL_PLANE_GENESIS_OPEN_STATE, 'base preservation materialization is unavailable after transition closure')
  const { materializations } = readVerifiedBasePreservations(repository, value)
  return materializations.map(cloneMaterialization)
}

export function readControlPlaneGenesisBasePreservation({
  root,
  transition,
  path,
} = {}) {
  const normalized = repositoryPath(path, 'preservation lookup')
  const materialization = readAllControlPlaneGenesisBasePreservations({ root, transition })
    .find(item => item.path === normalized)
  invariant(materialization, `path is outside the transition preservation closure:${normalized}`)
  return materialization
}

export function transitionPreservation(transition, path) {
  const value = validateControlPlaneGenesisTransition(transition)
  const normalized = repositoryPath(path, 'preservation lookup')
  return value.preservations.find(item => item.path === normalized) ?? null
}

export function transitionTombstone(transition, path) {
  const value = validateControlPlaneGenesisTransition(transition)
  const normalized = repositoryPath(path, 'tombstone lookup')
  return value.tombstones.find(item => item.path === normalized) ?? null
}

function assertMaterializedPreservation(materializationRoot, preservation) {
  const absolute = contained(materializationRoot, preservation.path, 'preservation path')
  assertRealAncestors(materializationRoot, absolute, `preservation ${preservation.path}`)
  let info
  try {
    info = lstatSync(absolute)
  } catch (error) {
    if (error?.code === 'ENOENT') invariant(false, `preservation is missing:${preservation.path}`)
    throw error
  }
  if (preservation.kind === 'tree') {
    invariant(info.isDirectory() && !info.isSymbolicLink(), `preservation is not a real directory:${preservation.path}`)
    const descriptor = treeDescriptor(worktreeTreeLeaves(absolute))
    invariant(descriptor.leafCount === preservation.leafCount, `preserved tree leaf count drift:${preservation.path}`)
    invariant(descriptor.sha256 === preservation.sha256, `preserved tree digest drift:${preservation.path}`)
  } else if (preservation.kind === 'file') {
    invariant(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, `preservation is not one regular file:${preservation.path}`)
    invariant(fileMode(info) === preservation.mode, `preserved file mode drift:${preservation.path}`)
    invariant(sha256(readFileSync(absolute)) === preservation.sha256, `preserved file digest drift:${preservation.path}`)
  } else {
    invariant(info.isSymbolicLink(), `preservation is not an exact symlink:${preservation.path}`)
    const target = readlinkSync(absolute)
    invariant(target === preservation.target && sha256(Buffer.from(target, 'utf8')) === preservation.sha256, `preserved symlink target drift:${preservation.path}`)
  }
  return preservationDescriptor(preservation)
}

export function assertControlPlaneGenesisPreservation({
  root,
  materializationRoot = root,
  transition,
  path,
} = {}) {
  const source = readControlPlaneGenesisBasePreservation({ root, transition, path })
  const materialized = canonicalRoot(materializationRoot, 'materialization root')
  return assertMaterializedPreservation(materialized, source)
}

export function assertAllControlPlaneGenesisPreservations({
  root,
  materializationRoot = root,
  transition,
} = {}) {
  const source = readAllControlPlaneGenesisBasePreservations({ root, transition })
  const materialized = canonicalRoot(materializationRoot, 'materialization root')
  return source.map(item => assertMaterializedPreservation(materialized, item))
}

export function assertControlPlaneGenesisTombstones({
  root,
  materializationRoot = root,
  transition,
} = {}) {
  const materialized = canonicalRoot(materializationRoot, 'materialization root')
  const value = validateControlPlaneGenesisTransition(transition)
  invariant(value.state === CONTROL_PLANE_GENESIS_OPEN_STATE, 'legacy tombstones are unavailable after transition closure')
  return value.tombstones.map(tombstone => {
    const absolute = contained(materialized, tombstone.path, 'tombstone path')
    assertRealAncestors(materialized, absolute, `tombstone ${tombstone.path}`)
    invariant(existsSync(absolute), `tombstone is missing:${tombstone.path}`)
    const info = lstatSync(absolute)
    invariant(
      info.isFile() && !info.isSymbolicLink() && info.nlink === 1,
      `tombstone is not one regular file:${tombstone.path}`,
    )
    invariant(fileMode(info) === tombstone.mode, `tombstone mode drift:${tombstone.path}`)
    invariant(sha256(readFileSync(absolute)) === tombstone.sha256, `tombstone digest drift:${tombstone.path}`)
    return structuredClone(tombstone)
  })
}

export function assertControlPlaneGenesisTransitionClosed({
  root,
  materializationRoot = root,
  transition = null,
} = {}) {
  const value = transition
    ? validateControlPlaneGenesisTransition(transition)
    : loadControlPlaneGenesisTransition({ root })
  invariant(
    value.state === CONTROL_PLANE_GENESIS_CLOSED_STATE && value.releaseAllowed === true,
    'candidate freeze/release is forbidden until the distinct protected cleanup PR closes the Genesis transition',
  )
  assertControlPlaneGenesisBaseBinding({ root, transition: value })
  const materialized = canonicalRoot(materializationRoot, 'materialization root')
  for (const path of CONTROL_PLANE_GENESIS_CLOSED_ABSENT_PATHS) {
    assertPathAbsent(materialized, path, 'closed transition legacy path')
  }
  assertClosedBaselineLinks(materialized)
  return value
}
