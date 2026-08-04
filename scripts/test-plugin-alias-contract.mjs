import assert from 'node:assert/strict'
import { cpSync, linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { assertExactPluginAlias, resolvePluginAliasContracts, resolvePluginAliasPlan } from './lib/plugin-alias-contract.mjs'
import { compareUtf8Bytes } from './lib/provider-lifecycle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'plugin-alias-contract-'))
  mkdirSync(join(root, '.claude', 'skills'), { recursive: true })
  writeFileSync(join(root, '.claude', 'skills', 'README.md'), 'fixture\n')
  symlinkSync('.claude/skills', join(root, 'skills'))
  return root
}

function registryFixture() {
  const root = mkdtempSync(join(tmpdir(), 'plugin-alias-registry-'))
  mkdirSync(join(root, 'packages', 'governance'), { recursive: true })
  cpSync(join(ROOT, 'packages', 'governance', 'canonical'), join(root, 'packages', 'governance', 'canonical'), { recursive: true })
  return root
}

function mutateJson(path, mutate) {
  const value = JSON.parse(readFileSync(path, 'utf8'))
  mutate(value)
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

test('exact plugin alias resolves only to the declared real directory', t => {
  const root = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const result = assertExactPluginAlias(root, {
    alias: 'skills',
    target: '.claude/skills',
    requiredEntries: ['README.md'],
  })
  assert.equal(result.destination, '.claude/skills')
})

test('regular directory, retargeted link, dangling link, and symlink destination fail closed', t => {
  const roots = []
  t.after(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })))

  const regular = mkdtempSync(join(tmpdir(), 'plugin-alias-regular-')); roots.push(regular)
  mkdirSync(join(regular, 'skills'))
  assert.throws(() => assertExactPluginAlias(regular, { alias: 'skills', target: '.claude/skills' }), /must be a symbolic link/)

  const wrong = fixture(); roots.push(wrong)
  rmSync(join(wrong, 'skills'))
  mkdirSync(join(wrong, '.claude', 'commands'))
  symlinkSync('.claude/commands', join(wrong, 'skills'))
  assert.throws(() => assertExactPluginAlias(wrong, { alias: 'skills', target: '.claude/skills' }), /target drifted/)

  const dangling = fixture(); roots.push(dangling)
  rmSync(join(dangling, '.claude', 'skills'), { recursive: true })
  assert.throws(() => assertExactPluginAlias(dangling, { alias: 'skills', target: '.claude/skills' }))

  const indirect = mkdtempSync(join(tmpdir(), 'plugin-alias-indirect-')); roots.push(indirect)
  mkdirSync(join(indirect, 'real-skills'))
  writeFileSync(join(indirect, 'real-skills', 'README.md'), 'fixture\n')
  mkdirSync(join(indirect, '.claude'))
  symlinkSync('../real-skills', join(indirect, '.claude', 'skills'))
  symlinkSync('.claude/skills', join(indirect, 'skills'))
  assert.throws(() => assertExactPluginAlias(indirect, { alias: 'skills', target: '.claude/skills' }), /destination crosses a symbolic link/)
})

test('canonical aliases derive targets from the provider registry without a second target map', () => {
  assert.deepEqual(resolvePluginAliasContracts(ROOT).map(({ id, alias, target, destination }) => ({ id, alias, target, destination })), [
    { id: 'commands', alias: 'commands', target: '.claude/commands', destination: '.claude/commands' },
    { id: 'hooks-scripts', alias: 'hooks/scripts', target: '../packages/design-system/ds-canonical/hooks', destination: 'packages/design-system/ds-canonical/hooks' },
    { id: 'skills', alias: 'skills', target: '.claude/skills', destination: '.claude/skills' },
  ])
})

test('retired marketplace provider keeps alias paths managed but emits no aliases', () => {
  const providers = JSON.parse(readFileSync(join(ROOT, 'packages/governance/canonical/providers.json'), 'utf8'))
  const removed = providers.providers.find((provider) => provider.id === 'claude')
  providers.providers = providers.providers.filter((provider) => provider.id !== removed.id)
  for (const provider of providers.providers) for (const binding of Object.values(provider.adapter.skillBindings || {})) {
    if (binding.peer === removed.id) binding.peer = 'generic'
  }
  providers.canonical.retiredProviders = [{
    id: removed.id,
    replacementProviderId: null,
    retiredInVersion: '1.0.0',
    reasonCode: 'PROVIDER_REMOVED',
    discovery: removed.adapter.discovery,
    surfaces: [
      { path: removed.instructionEntry, kind: 'file' },
      { path: removed.hookConfig, kind: 'file' },
      { path: removed.skillDirectory, kind: 'tree' },
    ].sort((left, right) => compareUtf8Bytes(left.path, right.path)),
  }]
  const plan = resolvePluginAliasPlan(ROOT, { providersDocument: providers })
  assert.equal(plan.active, false)
  assert.deepEqual(plan.aliases, ['commands', 'hooks/scripts', 'skills'])
  assert.deepEqual(plan.contracts, [])
})

test('registry and schema authority cannot cross a parent symlink', t => {
  const root = mkdtempSync(join(tmpdir(), 'plugin-alias-registry-root-'))
  const external = mkdtempSync(join(tmpdir(), 'plugin-alias-registry-external-'))
  t.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true }) })
  mkdirSync(join(external, 'packages', 'governance'), { recursive: true })
  cpSync(join(ROOT, 'packages', 'governance', 'canonical'), join(external, 'packages', 'governance', 'canonical'), { recursive: true })
  symlinkSync(join(external, 'packages'), join(root, 'packages'))
  assert.throws(() => resolvePluginAliasContracts(root), /crosses a symbolic link/)
})

test('required entries must be regular unaliased files', t => {
  const root = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  rmSync(join(root, '.claude', 'skills', 'README.md'))
  writeFileSync(join(root, '.claude', 'skills', 'authority.md'), 'fixture\n')
  symlinkSync('authority.md', join(root, '.claude', 'skills', 'README.md'))
  assert.throws(() => assertExactPluginAlias(root, { alias: 'skills', target: '.claude/skills', requiredEntries: ['README.md'] }), /regular unaliased file/)
  rmSync(join(root, '.claude', 'skills', 'README.md'))
  linkSync(join(root, '.claude', 'skills', 'authority.md'), join(root, '.claude', 'skills', 'README.md'))
  assert.throws(() => assertExactPluginAlias(root, { alias: 'skills', target: '.claude/skills', requiredEntries: ['README.md'] }), /regular unaliased file/)
})

test('registry rejects trailing, VCS-reserved, and destination-overlapping aliases', t => {
  const roots = []
  t.after(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })))

  const trailing = registryFixture(); roots.push(trailing)
  mutateJson(join(trailing, 'packages/governance/canonical/plugin-aliases.json'), value => { value.aliases[2].alias = 'skills/' })
  assert.throws(() => resolvePluginAliasContracts(trailing), /schema failure/)

  const reserved = registryFixture(); roots.push(reserved)
  mutateJson(join(reserved, 'packages/governance/canonical/plugin-aliases.json'), value => { value.aliases[2].alias = '.git/skills' })
  assert.throws(() => resolvePluginAliasContracts(reserved), /VCS-reserved path/)

  const overlap = registryFixture(); roots.push(overlap)
  mutateJson(join(overlap, 'packages/governance/canonical/plugin-aliases.json'), value => { value.aliases[2].alias = '.claude' })
  assert.throws(() => resolvePluginAliasContracts(overlap), /alias and canonical destination overlap/)
})
