import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  GOVERNANCE_HOOK_SETUP_COMMAND,
  setupGovernanceHooks,
} from './setup-governance-hooks.mjs'
import {
  captureGitVisibleWorktree,
} from './lib/worktree-fingerprint.mjs'

const SYSTEM_GIT = '/usr/bin/git'

function git(root, args) {
  return execFileSync(SYSTEM_GIT, args, { cwd: root, encoding: 'utf8' }).trim()
}

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'governance-hook-setup-')))
  const hookRoot = resolve(root, '.husky')
  const hook = resolve(hookRoot, 'pre-commit')
  mkdirSync(hookRoot)
  writeFileSync(hook, '#!/bin/sh\nexit 0\n')
  chmodSync(hook, 0o755)
  writeFileSync(resolve(root, 'tracked.txt'), 'tracked\n')
  git(root, ['init', '-q'])
  git(root, ['add', '.'])
  git(root, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'])
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, hookRoot, hook }
}

test('authority hook setup migrates arbitrary Husky state to one relative canonical binding without worktree drift', t => {
  const fx = fixture(t)
  git(fx.root, ['config', '--local', '--add', 'core.hooksPath', '.husky/_'])
  git(fx.root, ['config', '--local', '--add', 'core.hooksPath', '/tmp/attacker-hooks'])
  const before = captureGitVisibleWorktree(fx.root)
  const result = setupGovernanceHooks({ root: fx.root })
  const after = captureGitVisibleWorktree(fx.root)
  assert.equal(result.configured, true)
  assert.equal(result.hookRoot, fx.hookRoot)
  assert.deepEqual(result, {
    schemaVersion: 1,
    kind: 'governance-hook-setup-result',
    root: fx.root,
    hookRoot: fx.hookRoot,
    hook: '.husky/pre-commit',
    configured: true,
  })
  assert.deepEqual(before, after)
  // 2026-07-28 contract:canonical binding = RELATIVE '.husky'。絕對路徑會在 worktree /
  // 重新 clone / 路徑搬移後指向舊位置,正是 PROJECT_ROOT_UNVERIFIED 全 session 磚化的根因;
  // 相對值由 git 以 repo root 起算,天生 worktree-safe。attacker/多重 entry 仍必收斂成單一值。
  assert.equal(git(fx.root, ['config', '--local', '--get-all', 'core.hooksPath']), '.husky')
})

test('authority hook setup rejects unrelated executable Git config before changing the hook binding', t => {
  const fx = fixture(t)
  git(fx.root, ['config', '--local', 'core.hooksPath', '.husky/_'])
  git(fx.root, ['config', '--local', 'alias.attacker', '!sh -c attacker'])
  const before = readFileSync(resolve(fx.root, '.git/config'))
  assert.throws(
    () => setupGovernanceHooks({ root: fx.root }),
    /unsupported external commands: alias\.attacker/,
  )
  assert.ok(readFileSync(resolve(fx.root, '.git/config')).equals(before))
})

test('authority hook setup validates canonical hook bytes and mode before mutating Git config', t => {
  const fx = fixture(t)
  git(fx.root, ['config', '--local', 'core.hooksPath', '/tmp/original-attacker-hooks'])
  chmodSync(fx.hook, 0o777)
  const before = readFileSync(resolve(fx.root, '.git/config'))
  assert.throws(
    () => setupGovernanceHooks({ root: fx.root }),
    /not backed by the canonical executable/,
  )
  assert.ok(readFileSync(resolve(fx.root, '.git/config')).equals(before))
})

test('public hook setup command remains the single closed authority entrypoint', () => {
  assert.equal(GOVERNANCE_HOOK_SETUP_COMMAND, 'node scripts/setup-governance-hooks.mjs')
})
