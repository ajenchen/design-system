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

test('closed Git admits only the exact canonical executable Husky hook root', t => {
  const fx = fixture(t)
  assert.equal(assertClosedGitLocalConfiguration(fx.root), true)
  configure(fx.root, 'core.hooksPath', fx.hooks)
  assert.equal(assertClosedGitLocalConfiguration(fx.root), true)

  configure(fx.root, 'core.hooksPath', resolve(fx.root, 'attacker-hooks'))
  assert.throws(
    () => assertClosedGitLocalConfiguration(fx.root),
    /exact absolute canonical \.husky directory/,
  )

  configure(fx.root, 'core.hooksPath', '.husky')
  assert.throws(
    () => assertClosedGitLocalConfiguration(fx.root),
    /exact absolute canonical \.husky directory/,
  )

  configure(fx.root, 'core.hooksPath', `${fx.hooks}/_`)
  assert.throws(
    () => assertClosedGitLocalConfiguration(fx.root),
    /exact absolute canonical \.husky directory/,
  )
})

test('closed Git rejects duplicate, redirected and non-executable canonical hook bindings', t => {
  const duplicate = fixture(t)
  configure(duplicate.root, 'core.hooksPath', duplicate.hooks)
  configure(duplicate.root, 'core.hooksPath', duplicate.hooks, '--add')
  assert.throws(
    () => assertClosedGitLocalConfiguration(duplicate.root),
    /one exact canonical binding/,
  )

  const redirected = fixture(t)
  const target = resolve(redirected.root, 'attacker-pre-commit')
  writeFileSync(target, '#!/bin/sh\nexit 0\n')
  chmodSync(target, 0o755)
  unlinkSync(redirected.precommit)
  symlinkSync(target, redirected.precommit)
  configure(redirected.root, 'core.hooksPath', redirected.hooks)
  assert.throws(
    () => assertClosedGitLocalConfiguration(redirected.root),
    /not backed by the canonical executable/,
  )

  const nonExecutable = fixture(t)
  chmodSync(nonExecutable.precommit, 0o644)
  configure(nonExecutable.root, 'core.hooksPath', nonExecutable.hooks)
  assert.throws(
    () => assertClosedGitLocalConfiguration(nonExecutable.root),
    /not backed by the canonical executable/,
  )

  const hardLinked = fixture(t)
  const hardLinkTarget = resolve(hardLinked.root, 'hard-linked-hook')
  linkSync(hardLinked.precommit, hardLinkTarget)
  configure(hardLinked.root, 'core.hooksPath', hardLinked.hooks)
  assert.throws(
    () => assertClosedGitLocalConfiguration(hardLinked.root),
    /not backed by the canonical executable/,
  )

  const empty = fixture(t)
  writeFileSync(empty.precommit, '')
  configure(empty.root, 'core.hooksPath', empty.hooks)
  assert.throws(
    () => assertClosedGitLocalConfiguration(empty.root),
    /size is outside the safe range/,
  )

  const writable = fixture(t)
  chmodSync(writable.precommit, 0o775)
  configure(writable.root, 'core.hooksPath', writable.hooks)
  assert.throws(
    () => assertClosedGitLocalConfiguration(writable.root),
    /not backed by the canonical executable/,
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
