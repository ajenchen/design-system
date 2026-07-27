#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { runGateMetaTests } from './run-gate-meta-tests.mjs'
import {
  captureFrozenRepositoryManifest,
  createDisposableRepositorySnapshot,
  removeDisposableRepositorySnapshot,
  verifySnapshotAgainstManifest,
} from './lib/disposable-repository-snapshot.mjs'
import { captureDeepAuditSnapshot } from './lib/deep-audit-evidence-contract.mjs'

const NO_EXCLUSIONS = Object.freeze({ schemaVersion: 2, entries: [] })

function withBrowserlessNestedFixtureEnvironment(callback) {
  const hadExplicitRuntime = Object.hasOwn(process.env, 'PLAYWRIGHT_BROWSERS_PATH')
  const explicitRuntime = process.env.PLAYWRIGHT_BROWSERS_PATH
  delete process.env.PLAYWRIGHT_BROWSERS_PATH
  assert.equal(Object.hasOwn(process.env, 'PLAYWRIGHT_BROWSERS_PATH'), false)
  try {
    return callback()
  } finally {
    if (hadExplicitRuntime) process.env.PLAYWRIGHT_BROWSERS_PATH = explicitRuntime
    else delete process.env.PLAYWRIGHT_BROWSERS_PATH
    assert.equal(Object.hasOwn(process.env, 'PLAYWRIGHT_BROWSERS_PATH'), hadExplicitRuntime)
    assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH, explicitRuntime)
  }
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
}

function write(root, path, value, mode = 0o644) {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, value)
  chmodSync(target, mode)
}

function tree(root, current = root) {
  const rows = []
  for (const name of readdirSync(current).sort()) {
    const path = join(current, name)
    const rel = relative(root, path).split('\\').join('/')
    const info = lstatSync(path)
    const mode = (info.mode & 0o7777).toString(8)
    if (info.isSymbolicLink()) rows.push(['link', rel, mode, readlinkSync(path)])
    else if (info.isDirectory()) rows.push(['dir', rel, mode], ...tree(root, path))
    else if (info.isFile()) rows.push(['file', rel, mode, readFileSync(path).toString('base64')])
    else rows.push(['special', rel, mode])
  }
  return rows
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gate-meta-caller-'))
  git(root, ['init', '-q'])
  git(root, ['config', 'user.name', 'Gate Meta Test'])
  git(root, ['config', 'user.email', 'gate-meta@example.invalid'])
  write(root, '.gitignore', 'node_modules/\nignored-secret/\n')
  mkdirSync(join(root, 'ignored-secret'), { recursive: true })
  write(root, 'ignored-secret/credential.txt', 'must-never-enter-snapshot\n')
  symlinkSync('/definitely-not-a-snapshot-input', join(root, 'ignored-secret', 'escape-link'))
  execFileSync('mkfifo', [join(root, 'ignored-secret', 'special-pipe')])
  write(root, 'target.txt', 'committed\n')
  write(root, 'authority-baseline/visual.txt', 'canonical-authority-bytes\n')
  write(root, 'mirror-baseline/visual.txt', 'legacy-mirror-bytes-must-not-be-read-through-link\n')
  write(root, 'packages/workspace/workspace.txt', 'workspace-caller\n')
  write(root, 'packages/workspace/node_modules/workspace-only/sentinel.txt', 'workspace-dependency-caller\n')
  write(root, 'node_modules/probe/sentinel.txt', 'dependency-caller\n')
  write(root, 'node_modules/probe/node_modules/nested-cli/bin.mjs', 'nested-cli-caller\n')
  mkdirSync(join(root, 'node_modules/probe/node_modules/.bin'), { recursive: true })
  symlinkSync('../nested-cli/bin.mjs', join(root, 'node_modules/probe/node_modules/.bin/nested-cli'))
  write(root, 'node_modules/.package-lock.json', JSON.stringify({
    lockfileVersion: 3,
    packages: {
      'node_modules/probe': { version: '1.0.0' },
      'node_modules/probe/node_modules/nested-cli': { version: '1.0.0' },
      'node_modules/@fixture/workspace': { link: true, resolved: 'packages/workspace' },
      'packages/workspace/node_modules/workspace-only': { version: '1.0.0' },
    },
  }))
  mkdirSync(join(root, 'node_modules/@fixture'), { recursive: true })
  symlinkSync('../../packages/workspace', join(root, 'node_modules/@fixture/workspace'))
  write(root, 'scripts/crash-probe.mjs', 'process.exit(0)\n')
  write(root, 'scripts/test-crash-probe.mjs', `
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
const callerHome = ${JSON.stringify(process.env.HOME ?? '')}
assert.equal(process.env.INIT_CWD, process.env.GOVERNANCE_DISPOSABLE_SNAPSHOT_ROOT)
const runtimeParent = dirname(process.env.GOVERNANCE_DISPOSABLE_SNAPSHOT_ROOT)
assert.notEqual(process.env.HOME ?? '', callerHome)
assert.notEqual(process.env.HOME, process.env.GOVERNANCE_DISPOSABLE_SNAPSHOT_ROOT)
assert.equal(resolve(process.env.HOME), join(runtimeParent, 'runtime', 'home'))
for (const key of ['TMPDIR', 'TMP', 'TEMP', 'XDG_CACHE_HOME', 'npm_config_cache', 'NPM_CONFIG_CACHE', 'COREPACK_HOME']) {
  const target = resolve(process.env[key])
  const rel = relative(runtimeParent, target)
  assert.equal(isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep), false, key + ' escaped disposable runtime')
}
assert.equal(readFileSync('target.txt', 'utf8'), 'working\\n')
assert.equal(execFileSync('git', ['show', ':target.txt'], { encoding: 'utf8' }), 'staged\\n')
assert.equal(execFileSync('git', ['show', 'HEAD:target.txt'], { encoding: 'utf8' }), 'committed\\n')
assert.match(execFileSync('git', ['ls-files', '-s', '--', 'target.txt'], { encoding: 'utf8' }), /^100644 /)
assert.equal(lstatSync('target.txt').mode & 0o777, 0o755)
assert.equal(existsSync('untracked.txt'), true)
assert.equal(existsSync('ignored-secret'), false)
assert.equal(readFileSync('node_modules/probe/sentinel.txt', 'utf8'), 'dependency-caller\\n')
assert.equal(readFileSync('node_modules/probe/node_modules/.bin/nested-cli', 'utf8'), 'nested-cli-caller\\n')
assert.equal(readFileSync('packages/workspace/node_modules/workspace-only/sentinel.txt', 'utf8'), 'workspace-dependency-caller\\n')
assert.equal(realpathSync('node_modules/@fixture/workspace'), realpathSync('packages/workspace'))
writeFileSync('target.txt', 'MUTATED-IN-SNAPSHOT\\n')
chmodSync('target.txt', 0o644)
writeFileSync('node_modules/probe/sentinel.txt', 'MUTATED-DEPENDENCY-VIEW\\n')
writeFileSync('node_modules/probe/node_modules/nested-cli/bin.mjs', 'MUTATED-NESTED-DEPENDENCY\\n')
writeFileSync('packages/workspace/node_modules/workspace-only/sentinel.txt', 'MUTATED-WORKSPACE-DEPENDENCY\\n')
writeFileSync('node_modules/@fixture/workspace/workspace.txt', 'MUTATED-WORKSPACE-VIA-DEPENDENCY\\n')
writeFileSync('crash-residue.txt', 'must die with snapshot\\n')
writeFileSync(join(tmpdir(), 'crash-temp-residue.txt'), 'must die with snapshot runtime\\n')
process.kill(process.pid, 'SIGKILL')
`)
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'fixture'])
  write(root, 'target.txt', 'staged\n')
  git(root, ['add', 'target.txt'])
  write(root, 'target.txt', 'working\n')
  chmodSync(join(root, 'target.txt'), 0o755)
  write(root, 'untracked.txt', 'untracked-current-bytes\n', 0o600)
  rmSync(join(root, 'mirror-baseline'), { recursive: true, force: true })
  symlinkSync('authority-baseline', join(root, 'mirror-baseline'))
  return root
}

{
  const root = fixture()
  try {
    const before = tree(root)
    const frozen = captureDeepAuditSnapshot(root)
    assert.equal(frozen.inventory.find((row) => row.path === 'target.txt')?.mode, '100755')
    assert.equal(frozen.inventory.find((row) => row.path === 'mirror-baseline')?.kind, 'symlink')
    const shadowed = frozen.inventory.find((row) => row.path === 'mirror-baseline/visual.txt')
    assert.deepEqual(shadowed, {
      path: 'mirror-baseline/visual.txt',
      kind: 'missing',
      mode: '100644',
      bytes: 0,
      sha256: shadowed.sha256,
    })
    assert.notEqual(shadowed.sha256, frozen.inventory.find((row) => row.path === 'authority-baseline/visual.txt')?.sha256)
    const result = withBrowserlessNestedFixtureEnvironment(() => runGateMetaTests({
      root,
      dependencyRoot: root,
      exclusionDocument: NO_EXCLUSIONS,
      timeoutMs: 30_000,
    }))
    assert.equal(result.total, 1)
    assert.equal(result.discoverable, 1)
    assert.equal(result.ran, 1)
    assert.deepEqual(result.excludedByClass, {
      'deterministic-isolated': [],
      'environmental-observation': [],
    })
    assert.equal(result.pass, 0)
    assert.equal(result.failed.length, 1)
    assert.match(String(result.failed[0].code), /SIGKILL|unknown/)
    assert.deepEqual(result.callerDrift, [])
    assert.equal(result.cleaned, true)
    assert.deepEqual(tree(root), before, 'crashed mutation probe changed caller bytes/modes/types or Git state')
    assert.equal(readFileSync(join(root, 'target.txt'), 'utf8'), 'working\n')
    assert.equal((lstatSync(join(root, 'target.txt')).mode & 0o777), 0o755)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

{
  const root = fixture()
  let snapshot = null
  try {
    const frozen = captureFrozenRepositoryManifest(root)
    assert.equal(frozen.inventory.find((row) => row.path === 'target.txt')?.mode, '100755')
    chmodSync(join(root, 'target.txt'), 0o644)
    assert.throws(
      () => {
        snapshot = createDisposableRepositorySnapshot({ root, dependencyRoot: root, manifest: frozen })
      },
      /manifest path executable mode changed before materialization:target\.txt/,
    )
    assert.equal(snapshot, null)
  } finally {
    removeDisposableRepositorySnapshot(snapshot)
    rmSync(root, { recursive: true, force: true })
  }
}

{
  const root = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'dependency-root-outside-'))
  let snapshot = null
  try {
    const frozen = captureFrozenRepositoryManifest(root)
    snapshot = createDisposableRepositorySnapshot({ root, dependencyRoot: root, manifest: frozen })
    const dependencyRoots = snapshot.dependencyViews.map(({ label }) => label)
    assert.deepEqual(dependencyRoots, ['node_modules', 'packages/workspace/node_modules'])
    assert.throws(
      () => verifySnapshotAgainstManifest(snapshot.snapshotRoot, frozen, { dependencyRoots: ['node_modules'] }),
      /snapshot contains a path outside the frozen manifest:packages\/workspace\/node_modules/,
    )
    const verified = verifySnapshotAgainstManifest(snapshot.snapshotRoot, frozen, { dependencyRoots })
    assert.equal(verified.inventoryEntries, frozen.inventory.length)

    write(outside, 'sentinel.txt', 'outside-unchanged\n')
    const workspaceDependencies = join(snapshot.snapshotRoot, 'packages/workspace/node_modules')
    rmSync(workspaceDependencies, { recursive: true, force: true })
    symlinkSync(relative(dirname(workspaceDependencies), outside), workspaceDependencies)
    assert.throws(
      () => verifySnapshotAgainstManifest(snapshot.snapshotRoot, frozen, { dependencyRoots }),
      /dependency root is not a real directory:packages\/workspace\/node_modules/,
    )
    assert.equal(readFileSync(join(outside, 'sentinel.txt'), 'utf8'), 'outside-unchanged\n')
  } finally {
    removeDisposableRepositorySnapshot(snapshot)
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
}

{
  const root = mkdtempSync(join(tmpdir(), 'snapshot-invalid-shadow-topology-'))
  try {
    symlinkSync('target', join(root, 'alias'))
    assert.throws(() => verifySnapshotAgainstManifest(root, {
      inventory: [
        { path: 'alias', kind: 'symlink', mode: '120000', bytes: 6, sha256: '0'.repeat(64) },
        { path: 'alias/child', kind: 'file', mode: '100644', bytes: 1, sha256: '1'.repeat(64) },
      ],
    }), /non-missing descendant below symlink leaf/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

{
  const root = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'gate-meta-outside-'))
  try {
    write(outside, 'sentinel.txt', 'outside-unchanged\n')
    symlinkSync(relative(join(root, 'node_modules'), outside), join(root, 'node_modules/escape-parent'))
    const before = tree(root)
    assert.throws(
      () => withBrowserlessNestedFixtureEnvironment(() => runGateMetaTests({
        root,
        dependencyRoot: root,
        exclusionDocument: NO_EXCLUSIONS,
        timeoutMs: 30_000,
      })),
      /symbolic link escapes repository/,
    )
    assert.deepEqual(tree(root), before)
    assert.equal(readFileSync(join(outside, 'sentinel.txt'), 'utf8'), 'outside-unchanged\n')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
}

{
  const root = mkdtempSync(join(tmpdir(), 'snapshot-missing-symlink-'))
  try {
    symlinkSync('does-not-exist', join(root, 'expected-missing'))
    assert.throws(() => verifySnapshotAgainstManifest(root, {
      inventory: [{ path: 'expected-missing', kind: 'missing', mode: '100644', bytes: 0, sha256: '0'.repeat(64) }],
    }), /tracked-missing path materialized unexpectedly/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

console.log('✓ disposable gate meta-test snapshot preserves Git/worktree/dependencies, nested .bin links and crash containment')
