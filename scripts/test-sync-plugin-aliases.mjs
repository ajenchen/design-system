import assert from 'node:assert/strict'
import { lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { retirePluginAliases, syncPluginAliases } from './sync-plugin-aliases.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sync-plugin-aliases-'))
  mkdirSync(join(root, '.git'))
  mkdirSync(join(root, '.claude', 'skills'), { recursive: true })
  mkdirSync(join(root, '.claude', 'commands'), { recursive: true })
  writeFileSync(join(root, '.claude', 'skills', 'README.md'), 'fixture\n')
  writeFileSync(join(root, '.claude', 'commands', 'README.md'), 'fixture\n')
  return root
}

const contract = {
  id: 'skills',
  alias: 'skills',
  target: '.claude/skills',
  destination: '.claude/skills',
  requiredEntries: ['README.md'],
}

const commandsContract = {
  id: 'commands',
  alias: 'commands',
  target: '.claude/commands',
  destination: '.claude/commands',
  requiredEntries: ['README.md'],
}

test('generate is deterministic/idempotent and retargets a stale alias atomically', t => {
  const root = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  assert.equal(syncPluginAliases(root, [contract])[0].changed, true)
  assert.equal(lstatSync(join(root, 'skills')).isSymbolicLink(), true)
  assert.equal(readlinkSync(join(root, 'skills')), '.claude/skills')
  assert.equal(syncPluginAliases(root, [contract])[0].changed, false)
  // A registry-driven retarget converges the stale link to the contract instead of refusing:
  // refusal froze legitimate governed changes (2026-08-04 hooks/scripts retarget). The replacement
  // is applied via exclusive temp create + rename, so the path never has a missing window.
  rmSync(join(root, 'skills'))
  symlinkSync('.claude', join(root, 'skills'))
  assert.equal(syncPluginAliases(root, [contract])[0].changed, true)
  assert.equal(readlinkSync(join(root, 'skills')), '.claude/skills')
  assert.equal(syncPluginAliases(root, [contract])[0].changed, false)
})

test('generator never clobbers regular user content', t => {
  const root = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(join(root, 'skills'), 'user content\n')
  assert.throws(() => syncPluginAliases(root, [contract]), /refusing to replace/)
})

test('full preflight prevents a later conflict from leaving an earlier alias behind', t => {
  const root = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(join(root, 'commands'), 'user content\n')
  assert.throws(() => syncPluginAliases(root, [contract, commandsContract]), /refusing to replace/)
  assert.throws(() => lstatSync(join(root, 'skills')), { code: 'ENOENT' })
})

test('transaction failure rolls back only aliases created by this invocation', t => {
  const root = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  let calls = 0
  const createSymlink = (target, alias) => {
    calls += 1
    if (calls === 2) throw Object.assign(new Error('injected failure'), { code: 'EIO' })
    symlinkSync(target, alias)
  }
  assert.throws(() => syncPluginAliases(root, [contract, commandsContract], { createSymlink }), /injected failure/)
  assert.throws(() => lstatSync(join(root, 'skills')), { code: 'ENOENT' })
  assert.throws(() => lstatSync(join(root, 'commands')), { code: 'ENOENT' })
  assert.throws(() => lstatSync(join(root, '.git', 'governance-plugin-aliases.lock')), { code: 'ENOENT' })
})

test('same-target EEXIST is accepted only after exact desired-state revalidation', t => {
  const root = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const createSymlink = (target, alias) => {
    symlinkSync(target, alias)
    throw Object.assign(new Error('concurrent winner'), { code: 'EEXIST' })
  }
  const [result] = syncPluginAliases(root, [contract], { createSymlink })
  assert.equal(result.changed, false)
  assert.equal(readlinkSync(join(root, 'skills')), '.claude/skills')
})

test('an existing transaction lock fails closed unless all aliases already match', t => {
  const root = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, '.git', 'governance-plugin-aliases.lock'))
  assert.throws(() => syncPluginAliases(root, [contract]), /transaction lock already exists/)
  symlinkSync('.claude/skills', join(root, 'skills'))
  assert.equal(syncPluginAliases(root, [contract])[0].changed, false)
})

test('provider retirement removes only generated symlinks and check mode reports residue', t => {
  const root = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  symlinkSync('.claude/skills', join(root, 'skills'))
  assert.throws(() => retirePluginAliases(root, ['skills'], { check: true }), /stale plugin alias/)
  assert.equal(retirePluginAliases(root, ['skills'])[0].changed, true)
  assert.equal(retirePluginAliases(root, ['skills'], { check: true })[0].changed, false)
  writeFileSync(join(root, 'skills'), 'user content\n')
  assert.throws(() => retirePluginAliases(root, ['skills']), /user-owned regular content/)
})

test('retirement preflight prevents partial deletion when a later alias is user-owned', t => {
  const root = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  symlinkSync('.claude/skills', join(root, 'skills'))
  writeFileSync(join(root, 'commands'), 'user content\n')
  assert.throws(() => retirePluginAliases(root, ['skills', 'commands']), /user-owned regular content/)
  assert.equal(lstatSync(join(root, 'skills')).isSymbolicLink(), true)
})
