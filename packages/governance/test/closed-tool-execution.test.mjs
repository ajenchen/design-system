import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  assertClosedGitLocalConfiguration,
  materializeClosedHookToolProfile,
  runClosedGit,
} from '../src/closed-tool-execution.mjs'

const SYSTEM_GIT = '/usr/bin/git'

function fixture(t) {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), 'closed-git-local-config-')))
  const hooks = resolve(root, '.husky')
  const precommit = resolve(hooks, 'pre-commit')
  mkdirSync(hooks)
  writeFileSync(precommit, '#!/bin/sh\nexit 0\n')
  chmodSync(precommit, 0o755)
  execFileSync(SYSTEM_GIT, ['init', '-q'], { cwd: root })
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, hooks, precommit }
}

function configure(root, key, value, ...extra) {
  execFileSync(SYSTEM_GIT, ['config', '--local', ...extra, key, value], { cwd: root })
}

// Closed node-executable provenance contract: the hook-child interpreter is bound by
// IDENTITY to the running interpreter (realpath(candidate) == realpath(process.execPath),
// digest-authenticated), never by membership in a blessed ownership/mode class. Managed
// GitHub runners ship node world-writable by image design (actions/runner-images
// `chmod -R 777 /usr/local/bin` and `chmod -R 777 /opt`), so an ownership/mode class can
// never admit the actual interpreter there, and rejecting the binary that is already
// executing the check is incoherent. Foreign candidates keep blessed validation.
test('closed hook tool profile binds child node to the realpath-canonicalized running interpreter', () => {
  const runningInterpreter = realpathSync(process.execPath)
  const profile = materializeClosedHookToolProfile()
  assert.equal(profile.sources.node.path, runningInterpreter)
  assert.equal(
    profile.sources.node.sha256,
    createHash('sha256').update(readFileSync(runningInterpreter)).digest('hex'),
    'closed node provenance must digest-bind exactly the running interpreter bytes',
  )
})

test('a symlink alias of the running interpreter canonicalizes to the same closed node source', t => {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), 'closed-node-alias-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const alias = resolve(root, 'node')
  symlinkSync(process.execPath, alias)
  const profile = materializeClosedHookToolProfile({ nodeExecutable: alias })
  assert.equal(profile.sources.node.path, realpathSync(process.execPath))
})

// 「world-writable 的執行中直譯器仍被 identity 接受」不在本地另開 spawn-副本測試:
// harness source-inventory 的 AST 白名單正確地拒絕測試 spawn 非 allowlist 執行檔,而
// managed CI 的直譯器本來就是 0777(runner image `chmod -R 777`)—— 上方 identity 測試
// 在 CI 執行時就是該分支的真實端到端證明,本地副本測試屬冗餘覆蓋。

test('foreign node candidates that are not the running interpreter keep blessed provenance validation', t => {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), 'closed-node-foreign-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const copy = resolve(root, 'node-copy')
  copyFileSync(process.execPath, copy)
  chmodSync(copy, 0o777)
  assert.throws(
    () => materializeClosedHookToolProfile({ nodeExecutable: copy }),
    /Closed node executable source is unsafe/,
    'a group/other-writable foreign node binary must stay rejected',
  )
  chmodSync(copy, 0o755)
  const profile = materializeClosedHookToolProfile({ nodeExecutable: copy })
  assert.equal(profile.sources.node.path, copy)
})

test('closed Git admits every standard in-repository hook binding shape', t => {
  // Standard husky shapes (absent, absolute inside the repo, relative `.husky`,
  // husky v9 `.husky/_`) are all ordinary; byte-exact absolute equality broke
  // linked worktrees, re-clones, and path renames.
  const fx = fixture(t)
  assert.equal(assertClosedGitLocalConfiguration(fx.root), true)
  configure(fx.root, 'core.hooksPath', fx.hooks)
  assert.equal(assertClosedGitLocalConfiguration(fx.root), true)

  configure(fx.root, 'core.hooksPath', '.husky')
  assert.equal(assertClosedGitLocalConfiguration(fx.root), true)

  configure(fx.root, 'core.hooksPath', `${fx.hooks}/_`)
  assert.equal(assertClosedGitLocalConfiguration(fx.root), true)

  configure(fx.root, 'core.hooksPath', resolve(fx.root, 'other-hooks'))
  assert.equal(assertClosedGitLocalConfiguration(fx.root), true)
})

test('closed Git rejects duplicate and repository-escaping hook bindings', t => {
  const duplicate = fixture(t)
  configure(duplicate.root, 'core.hooksPath', duplicate.hooks)
  configure(duplicate.root, 'core.hooksPath', duplicate.hooks, '--add')
  assert.throws(
    () => assertClosedGitLocalConfiguration(duplicate.root),
    /one exact canonical binding/,
  )

  const escaping = fixture(t)
  configure(escaping.root, 'core.hooksPath', '/tmp/attacker-hooks')
  assert.throws(
    () => assertClosedGitLocalConfiguration(escaping.root),
    /must stay inside the repository/,
  )

  const relativeEscape = fixture(t)
  configure(relativeEscape.root, 'core.hooksPath', '../outside-hooks')
  assert.throws(
    () => assertClosedGitLocalConfiguration(relativeEscape.root),
    /must stay inside the repository/,
  )
})

test('closed Git still rejects every other executable local configuration surface', t => {
  const fx = fixture(t)
  configure(fx.root, 'filter.evil.clean', '/tmp/attacker')
  assert.throws(
    () => assertClosedGitLocalConfiguration(fx.root),
    /unsupported external commands: filter\.evil\.clean/,
  )

  execFileSync(SYSTEM_GIT, ['config', '--local', '--unset-all', 'filter.evil.clean'], { cwd: fx.root })
  configure(fx.root, 'alias.attacker', '!sh -c attacker')
  assert.throws(
    () => assertClosedGitLocalConfiguration(fx.root),
    /unsupported external commands: alias\.attacker/,
  )
})

test('closed Git rejects caller config injection and never executes the repository hook', t => {
  const fx = fixture(t)
  const marker = resolve(fx.root, 'hook-executed')
  writeFileSync(fx.precommit, `#!/bin/sh\n: > '${marker}'\nexit 0\n`)
  chmodSync(fx.precommit, 0o755)
  configure(fx.root, 'core.hooksPath', fx.hooks)
  assert.equal(assertClosedGitLocalConfiguration(fx.root), true)

  for (const args of [
    ['-c', 'core.hooksPath=.husky', 'status'],
    ['-ccore.hooksPath=.husky', 'status'],
    ['--config-env=core.hooksPath=ATTACKER', 'status'],
  ]) {
    assert.throws(
      () => runClosedGit(args, { cwd: fx.root }),
      /may not inject global configuration/,
    )
  }

  const result = runClosedGit(['commit', '--allow-empty', '-m', 'closed hook isolation'], {
    cwd: fx.root,
    gitIdentity: {
      authorDate: '2026-01-01T00:00:00.000Z',
      authorEmail: 'governance@example.invalid',
      authorName: 'Governance Test',
      committerDate: '2026-01-01T00:00:00.000Z',
      committerEmail: 'governance@example.invalid',
      committerName: 'Governance Test',
    },
    output: 'ignore',
  })
  assert.equal(result.status, 0)
  assert.equal(existsSync(marker), false)
})
