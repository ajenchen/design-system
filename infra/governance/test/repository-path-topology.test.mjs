import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  githubSlugFromRemote,
  parsePortableRepositoryPath,
  validateRepositoryPathTopology,
  verifyInventoryRepositoryIdentity,
} from '../lib/repository-path-topology.mjs'
import { readJson } from '../lib/common.mjs'

const GOVERNANCE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INVENTORY = readJson(resolve(GOVERNANCE, 'inventory/managed-repos.json'))
const SYSTEM_GIT = '/usr/bin/git'

function poison(mutator) {
  const value = structuredClone(INVENTORY)
  mutator(value)
  return value
}

test('portable path grammar rejects ambiguous, platform-specific and post-name traversal', () => {
  assert.deepEqual(parsePortableRepositoryPath('../..'), {
    value: '../..',
    parentCount: 2,
    segments: [],
    currentDirectory: false,
  })
  for (const value of [
    '',
    '/',
    '/tmp/repo',
    'C:/repo',
    '..\\..\\repo',
    '../../repo/',
    '../.././repo',
    '../../repo/..',
    '../../repo//nested',
    '../../bad:name',
    '../../CON',
    '../../repo\nother',
  ]) {
    assert.throws(() => parsePortableRepositoryPath(value), /relative POSIX|portable|canonical|leading prefix|segment|non-empty/)
  }
})

test('full fleet topology fixes authority root, basename identity and non-overlapping checkout classes', () => {
  assert.equal(validateRepositoryPathTopology(INVENTORY), true)
  const cases = [
    {
      name: 'authority redirected to WM',
      mutate(value) {
        value.repositories.find(repo => repo.role === 'authority').localPathFromGovernanceRoot = '../../../work-management'
      },
      pattern: /exact \.\.\/\.\. checkout/,
    },
    {
      name: 'product redirected into authority',
      mutate(value) {
        value.repositories.find(repo => repo.role === 'product-consumer').localPathFromGovernanceRoot = '../../work-management'
      },
      pattern: /exact \.\.\/\.\.\/\.\.\/work-management sibling/,
    },
    {
      name: 'duplicate authority root',
      mutate(value) {
        value.repositories.find(repo => repo.role === 'product-consumer').localPathFromGovernanceRoot = '../..'
      },
      pattern: /basename|checkout roots overlap/,
    },
    {
      name: 'template redirected outside authority',
      mutate(value) {
        value.repositories.find(repo => repo.role === 'template-mirror').mirrorSourcePathFromGovernanceRoot = '../../../ds-product-template'
      },
      pattern: /exact \.\.\/\.\.\/template/,
    },
    {
      name: 'template renamed behind registered id',
      mutate(value) {
        value.repositories.find(repo => repo.role === 'template-mirror').mirrorSourcePathFromGovernanceRoot = '../../template/attacker'
      },
      pattern: /basename/,
    },
    {
      name: 'product escape to unrelated checkout',
      mutate(value) {
        value.repositories.find(repo => repo.role === 'product-consumer').localPathFromGovernanceRoot = '../../../../tmp/victim'
      },
      pattern: /basename/,
    },
    {
      name: 'product escape preserving basename',
      mutate(value) {
        value.repositories.find(repo => repo.role === 'product-consumer').localPathFromGovernanceRoot = '../../../../tmp/work-management'
      },
      pattern: /exact \.\.\/\.\.\/\.\.\/work-management sibling/,
    },
    {
      name: 'template redirect preserving basename',
      mutate(value) {
        value.repositories.find(repo => repo.role === 'template-mirror').mirrorSourcePathFromGovernanceRoot = '../../attacker/ds-product-template'
      },
      pattern: /exact \.\.\/\.\.\/template\/ds-product-template authority projection/,
    },
  ]
  for (const item of cases) {
    assert.throws(() => validateRepositoryPathTopology(poison(item.mutate)), item.pattern, item.name)
  }
})

test('standalone registration inventory may bind its sole checkout to current directory', () => {
  const inventory = {
    repositories: [{
      id: 'new-product',
      role: 'product-consumer',
      localPathFromGovernanceRoot: '.',
    }],
  }
  assert.equal(validateRepositoryPathTopology(inventory), true)
})

test('GitHub remote parser is closed to canonical GitHub transports', () => {
  for (const remote of [
    'git@github.com:ajenchen/design-system.git',
    'ssh://git@github.com/ajenchen/design-system.git',
    'https://github.com/ajenchen/design-system.git',
  ]) {
    assert.equal(githubSlugFromRemote(remote), 'ajenchen/design-system')
  }
  for (const remote of [
    'https://evil.example/ajenchen/design-system.git',
    'https://github.com.evil.example/ajenchen/design-system.git',
    'file:///tmp/design-system',
    'git://github.com/ajenchen/design-system',
    'ext::sh -c attacker',
  ]) {
    assert.equal(githubSlugFromRemote(remote), null)
  }
})

function gitFixture(t) {
  const container = realpathSync(mkdtempSync(resolve(tmpdir(), 'repository-path-topology-')))
  const authority = resolve(container, 'design-system')
  const governance = resolve(authority, 'infra/governance')
  const template = resolve(authority, 'template/ds-product-template')
  const product = resolve(container, 'work-management')
  mkdirSync(governance, { recursive: true })
  mkdirSync(template, { recursive: true })
  mkdirSync(product, { recursive: true })
  execFileSync(SYSTEM_GIT, ['init', '-q'], { cwd: authority })
  execFileSync(SYSTEM_GIT, ['remote', 'add', 'origin', 'git@github.com:ajenchen/design-system.git'], { cwd: authority })
  execFileSync(SYSTEM_GIT, ['init', '-q'], { cwd: product })
  execFileSync(SYSTEM_GIT, ['remote', 'add', 'origin', 'https://github.com/ajenchen/work-management.git'], { cwd: product })
  t.after(() => rmSync(container, { recursive: true, force: true }))
  return { container, authority, governance, template, product }
}

test('identity verification binds authority, nested template source and product to Git top-level plus origin', t => {
  const fixture = gitFixture(t)
  assert.deepEqual(
    verifyInventoryRepositoryIdentity({
      inventory: INVENTORY,
      repositoryId: 'design-system',
      governanceRoot: fixture.governance,
    }),
    {
      repositoryId: 'design-system',
      role: 'authority',
      sourceRoot: fixture.authority,
      gitTopLevel: fixture.authority,
      github: 'ajenchen/design-system',
    },
  )
  const template = verifyInventoryRepositoryIdentity({
    inventory: INVENTORY,
    repositoryId: 'ds-product-template',
    governanceRoot: fixture.governance,
  })
  assert.equal(template.sourceRoot, fixture.template)
  assert.equal(template.gitTopLevel, fixture.authority)
  assert.equal(template.github, 'ajenchen/design-system')
  assert.equal(
    verifyInventoryRepositoryIdentity({
      inventory: INVENTORY,
      repositoryId: 'work-management',
      governanceRoot: fixture.governance,
    }).github,
    'ajenchen/work-management',
  )
})

test('identity verification rejects a wrong remote and redirected nested mirror before trusted reads', t => {
  const fixture = gitFixture(t)
  execFileSync(SYSTEM_GIT, ['remote', 'set-url', 'origin', 'git@github.com:evil/victim.git'], { cwd: fixture.authority })
  assert.throws(
    () => verifyInventoryRepositoryIdentity({
      inventory: INVENTORY,
      repositoryId: 'design-system',
      governanceRoot: fixture.governance,
    }),
    /origin mismatch/,
  )
  execFileSync(SYSTEM_GIT, ['remote', 'set-url', 'origin', 'git@github.com:ajenchen/design-system.git'], { cwd: fixture.authority })
  rmSync(fixture.template, { recursive: true })
  const redirected = resolve(fixture.container, 'redirected-template')
  mkdirSync(redirected)
  symlinkSync(redirected, fixture.template)
  assert.throws(
    () => verifyInventoryRepositoryIdentity({
      inventory: INVENTORY,
      repositoryId: 'ds-product-template',
      governanceRoot: fixture.governance,
    }),
    /redirected/,
  )
})

test('identity verification rejects duplicate origins and every origin push override', t => {
  const duplicate = gitFixture(t)
  execFileSync(SYSTEM_GIT, ['config', '--local', '--add', 'remote.origin.url', 'git@github.com:ajenchen/design-system.git'], { cwd: duplicate.authority })
  assert.throws(
    () => verifyInventoryRepositoryIdentity({
      inventory: INVENTORY,
      repositoryId: 'design-system',
      governanceRoot: duplicate.governance,
    }),
    /exactly one origin URL/,
  )

  const pushOverride = gitFixture(t)
  execFileSync(SYSTEM_GIT, ['config', '--local', 'remote.origin.pushurl', 'git@github.com:evil/victim.git'], { cwd: pushOverride.authority })
  assert.throws(
    () => verifyInventoryRepositoryIdentity({
      inventory: INVENTORY,
      repositoryId: 'design-system',
      governanceRoot: pushOverride.governance,
    }),
    /may not override the origin push URL/,
  )
})
