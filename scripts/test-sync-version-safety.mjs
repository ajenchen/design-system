#!/usr/bin/env node
import assert from 'node:assert/strict'
import { cpSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SCRIPT = join(ROOT, 'scripts/sync-version-to-all-manifests.mjs')
const SAFETY = join(ROOT, 'scripts/refresh-fork-launchers.mjs')
const PROVIDER_LIFECYCLE = join(ROOT, 'scripts/lib/provider-lifecycle.mjs')
const GOVERNANCE_DEPENDENCY_BOOTSTRAP = join(ROOT, 'scripts/lib/governance-dependency-bootstrap.mjs')
const VERIFIED_EXACT_NPM_RUNTIME = join(ROOT, 'scripts/lib/verified-exact-npm-runtime.mjs')
const CLOSED_TOOL_EXECUTION_ADAPTER = join(ROOT, 'scripts/lib/closed-tool-execution.mjs')
const CLOSED_TOOL_EXECUTION = join(ROOT, 'packages/governance/src/closed-tool-execution.mjs')

function writeJson(root, path, value, mode = 0o644) {
  const target = join(root, path)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, JSON.stringify(value, null, 2) + '\n', { mode })
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'governance-version-sync-'))
  mkdirSync(join(root, 'scripts/lib'), { recursive: true })
  cpSync(SCRIPT, join(root, 'scripts/sync-version-to-all-manifests.mjs'))
  cpSync(SAFETY, join(root, 'scripts/refresh-fork-launchers.mjs'))
  cpSync(PROVIDER_LIFECYCLE, join(root, 'scripts/lib/provider-lifecycle.mjs'))
  cpSync(GOVERNANCE_DEPENDENCY_BOOTSTRAP, join(root, 'scripts/lib/governance-dependency-bootstrap.mjs'))
  cpSync(VERIFIED_EXACT_NPM_RUNTIME, join(root, 'scripts/lib/verified-exact-npm-runtime.mjs'))
  cpSync(CLOSED_TOOL_EXECUTION_ADAPTER, join(root, 'scripts/lib/closed-tool-execution.mjs'))
  mkdirSync(join(root, 'packages/governance/src'), { recursive: true })
  cpSync(CLOSED_TOOL_EXECUTION, join(root, 'packages/governance/src/closed-tool-execution.mjs'))
  writeJson(root, 'packages/design-system/package.json', { name: '@qijenchen/design-system', version: '0.1.0-beta.95' })
  writeJson(root, '.claude-plugin/plugin.json', { name: 'design-system', version: '0.1.0-beta.94' }, 0o600)
  writeJson(root, '.claude-plugin/marketplace.json', { metadata: { version: '0.1.0-beta.94' }, plugins: [{ name: 'design-system', version: '0.1.0-beta.94' }] })
  writeJson(root, 'packages/storybook-config/package.json', { name: '@qijenchen/storybook-config', version: '0.1.0-beta.94' }, 0o640)
  writeJson(root, 'packages/governance/package.json', { name: '@qijenchen/governance', version: '0.1.0-beta.94' })
  writeJson(root, 'template/ds-product-template/package.json', { name: 'ds-product-template', private: true, dependencies: { '@qijenchen/design-system': '0.1.0-beta.94', '@qijenchen/storybook-config': '0.1.0-beta.94' } })
  writeJson(root, 'package-lock.json', {
    name: 'fixture', version: '0.0.0', lockfileVersion: 3, requires: true,
    packages: {
      '': { name: 'fixture', version: '0.0.0' },
      'node_modules/@qijenchen/design-system': { resolved: 'packages/design-system', link: true },
      'node_modules/@qijenchen/storybook-config': { resolved: 'packages/storybook-config', link: true },
      'node_modules/@qijenchen/governance': { resolved: 'packages/governance', link: true },
      'packages/design-system': { name: '@qijenchen/design-system', version: '0.1.0-beta.94', untouched: 'sentinel' },
      'packages/storybook-config': { name: '@qijenchen/storybook-config', version: '0.1.0-beta.94' },
      'packages/governance': { name: '@qijenchen/governance', version: '0.1.0-beta.94' },
    },
  }, 0o640)
  return root
}

function run(root, ...args) {
  return spawnSync(process.execPath, ['scripts/sync-version-to-all-manifests.mjs', ...args], { cwd: root, encoding: 'utf8' })
}

function runInjectedFailure(root, afterRenames) {
  return spawnSync(process.execPath, ['scripts/sync-version-to-all-manifests.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', GOV_VERSION_SYNC_TEST_FAIL_AFTER_RENAMES: String(afterRenames) },
  })
}

function snapshot(root) {
  return [
    'packages/design-system/package.json',
    '.claude-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
    'packages/storybook-config/package.json',
    'packages/governance/package.json',
    'template/ds-product-template/package.json',
    'package-lock.json',
  ].map((path) => [path, readFileSync(join(root, path), 'utf8')])
}

function assertSnapshot(root, before) {
  for (const [path, content] of before) assert.equal(readFileSync(join(root, path), 'utf8'), content, path)
}

{
  const root = fixture()
  const result = run(root)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(readFileSync(join(root, 'packages/governance/package.json'))).version, '0.1.0-beta.95')
  assert.equal(JSON.parse(readFileSync(join(root, 'template/ds-product-template/package.json'))).dependencies['@qijenchen/design-system'], '0.1.0-beta.95')
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json')))
  assert.equal(lock.packages['packages/design-system'].version, '0.1.0-beta.95')
  assert.equal(lock.packages['packages/storybook-config'].version, '0.1.0-beta.95')
  assert.equal(lock.packages['packages/governance'].version, '0.1.0-beta.95')
  assert.equal(lock.packages['packages/design-system'].untouched, 'sentinel')
  assert.equal(lstatSync(join(root, 'package-lock.json')).mode & 0o777, 0o640)
  assert.equal(lstatSync(join(root, 'packages/storybook-config/package.json')).mode & 0o777, 0o640)
  assert.equal(lstatSync(join(root, '.claude-plugin/plugin.json')).mode & 0o777, 0o600)
  assert.equal(run(root, '--check').status, 0)
  assert.equal(run(root, '--unknown').status, 1)
}

{
  const root = fixture()
  const before = snapshot(root)
  const result = runInjectedFailure(root, 2)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /injected version transaction failure/)
  assertSnapshot(root, before)
  for (const directory of ['.claude-plugin', 'packages/storybook-config', 'packages/governance', 'template/ds-product-template', '.']) {
    assert.equal(readdirSync(join(root, directory)).some((name) => /\.(?:tmp|bak)-version-/.test(name)), false, directory)
  }
}

{
  const root = fixture()
  const before = snapshot(root)
  const result = run(root, '--check')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /version drift/)
  assertSnapshot(root, before)
}

{
  const root = fixture()
  const sentinel = join(mkdtempSync(join(tmpdir(), 'governance-version-sentinel-')), 'plugin.json')
  writeFileSync(sentinel, 'sentinel\n')
  unlinkSync(join(root, '.claude-plugin/plugin.json'))
  symlinkSync(sentinel, join(root, '.claude-plugin/plugin.json'))
  const before = readFileSync(join(root, 'packages/storybook-config/package.json'), 'utf8')
  const result = run(root)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /symlink/)
  assert.equal(readFileSync(sentinel, 'utf8'), 'sentinel\n')
  assert.equal(readFileSync(join(root, 'packages/storybook-config/package.json'), 'utf8'), before)
}

{
  const root = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'governance-version-parent-'))
  writeJson(outside, 'marketplace.json', { sentinel: true })
  rmSync(join(root, '.claude-plugin'), { recursive: true })
  symlinkSync(outside, join(root, '.claude-plugin'))
  const result = run(root)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /symlink/)
  assert.deepEqual(JSON.parse(readFileSync(join(outside, 'marketplace.json'))), { sentinel: true })
}

for (const corrupt of [
  (root) => writeJson(root, '.claude-plugin/marketplace.json', { metadata: {}, plugins: [] }),
  (root) => writeJson(root, 'template/ds-product-template/package.json', { name: 'ds-product-template', private: true, dependencies: { '@qijenchen/design-system': '0.1.0-beta.94' } }),
  (root) => writeJson(root, 'packages/design-system/package.json', { name: '@qijenchen/design-system', version: 'v0.1.0' }),
  (root) => writeJson(root, 'packages/design-system/package.json', { name: '@qijenchen/design-system', version: '0.01.0-beta.95' }),
  (root) => {
    const value = JSON.parse(readFileSync(join(root, 'package-lock.json')))
    value.packages['packages/design-system'].name = '@qijenchen/wrong'
    writeJson(root, 'package-lock.json', value)
  },
  (root) => {
    const value = JSON.parse(readFileSync(join(root, 'package-lock.json')))
    value.packages['node_modules/@qijenchen/governance'].resolved = 'packages/wrong'
    writeJson(root, 'package-lock.json', value)
  },
]) {
  const root = fixture()
  corrupt(root)
  const before = snapshot(root)
  const result = run(root)
  assert.notEqual(result.status, 0)
  assertSnapshot(root, before)
}

{
  const root = fixture()
  const outside = mkdtempSync(join(tmpdir(), 'governance-version-source-'))
  const sentinel = join(outside, 'package.json')
  writeFileSync(sentinel, '{"name":"@qijenchen/design-system","version":"0.1.0-beta.95"}\n')
  unlinkSync(join(root, 'packages/design-system/package.json'))
  symlinkSync(sentinel, join(root, 'packages/design-system/package.json'))
  const result = run(root)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /symlink/)
  assert.equal(readFileSync(sentinel, 'utf8'), '{"name":"@qijenchen/design-system","version":"0.1.0-beta.95"}\n')
}

console.log('✓ version SSOT sync validates shapes/lock links first, preserves mode, blocks symlinks, checks without writes, and rolls back mid-transaction')
