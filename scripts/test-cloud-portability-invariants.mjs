#!/usr/bin/env node
// Cloud-portability merge gate. Two shipped-config regressions took down cloud sessions in the
// past: (1) 2026-07 the committed sandbox turned `failIfUnavailable: true`, which is fatal in
// containers without sandbox support — every fresh cloud session died at startup; (2) the plugin
// symlink `hooks/scripts` briefly pointed at a retired mirror. Both lived in committed provider
// config that only ever got exercised on the maintainer's macOS. These tests bind the cloud-safety
// invariants to every PR so no environment-specific breakage can merge unnoticed.
import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  assert.equal(result.status, 0, `git ${args.join(' ')} failed:${result.stderr}`)
  return result.stdout
}

test('committed sandbox policy stays cloud-survivable', () => {
  // Fresh cloud containers cannot honor macOS sandbox enforcement; a fatal flag here kills every
  // cloud session at startup (2026-07 regression class). The canonical adapter is the policy
  // source; the committed settings file is what cloud sessions actually load — both must agree.
  const policy = JSON.parse(readFileSync(resolve(ROOT, 'packages/design-system/ds-canonical/adapters/claude-settings-base.json'), 'utf8'))
  const settings = JSON.parse(readFileSync(resolve(ROOT, '.claude/settings.json'), 'utf8'))
  for (const [label, sandbox] of [['claude-settings-base.json', policy.sandbox], ['.claude/settings.json', settings.sandbox]]) {
    assert.ok(sandbox && typeof sandbox === 'object', `${label} must declare a sandbox object`)
    assert.equal(sandbox.failIfUnavailable, false, `${label} sandbox.failIfUnavailable must stay false — true is fatal in cloud containers`)
    assert.equal(sandbox.allowUnsandboxedCommands, false, `${label} must not allow unsandboxed commands`)
  }
})

test('tracked provider config carries no machine-absolute home paths', () => {
  // A committed /Users/<name> or /home/<name> path only resolves on one machine; in a cloud
  // container it dereferences to nothing and fails at first use. Archival records
  // (.claude/{logs,planning,scratch}) hold historical transcripts and are never loaded as config.
  const archival = ['.claude/logs/', '.claude/planning/', '.claude/scratch/']
  const tracked = git(['ls-files', '-z', '--', '.claude', '.agents', '.codex', '.claude-plugin', 'hooks', '.husky'])
    .split('\0')
    .filter(Boolean)
    .filter((path) => !archival.some((prefix) => path.startsWith(prefix)))
  assert.ok(tracked.length > 0, 'expected tracked provider config surfaces')
  const offenders = []
  for (const path of tracked) {
    const blob = git(['cat-file', '-p', `:${path}`])
    if (/\/Users\/[A-Za-z]|\/home\/chenqiren/u.test(blob)) offenders.push(path)
  }
  assert.deepEqual(offenders, [], `machine-absolute home paths in shipped provider config:${offenders.join(', ')}`)
})

test('plugin hook symlink target matches hygiene policy and stays repo-relative', () => {
  // Read from the index, not the worktree: on sandboxed hosts the live path is deliberately
  // index-authoritative and the worktree copy may lag. The hygiene policy owns the exact target.
  const policy = JSON.parse(readFileSync(resolve(ROOT, 'packages/design-system/ds-canonical/references/repository-hygiene-policy.json'), 'utf8'))
  const declared = JSON.stringify(policy).match(/"hooks\/scripts":\s*"([^"]+)"/u)
  const entry = git(['ls-files', '-s', '--', 'hooks/scripts']).trim()
  assert.match(entry, /^120000 /u, 'hooks/scripts must be a symlink in the index')
  const target = git(['cat-file', '-p', ':hooks/scripts'])
  assert.ok(target.startsWith('../'), `hooks/scripts target must be repo-relative, got:${target}`)
  if (declared) assert.equal(target, declared[1], 'hooks/scripts index target must match repository-hygiene-policy.json')
})
