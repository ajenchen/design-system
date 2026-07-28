import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
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
