#!/usr/bin/env node
// sync-version-to-all-manifests.mjs — Phase 5 sync DS package version to plugin + marketplace
//
// changesets/cli `changeset version` 只 bump packages/* package.json。此 script 以 DS package version
// 為唯一版本 SSOT，同步 plugin/marketplace、linked packages、template exact dependencies，以及
// package-lock v3 的三個 workspace entries（只改版本欄位，不接管其餘 manifest/lock 內容）。
//
// 此 script 跑在 `npm run changeset:version` 之後,讀 packages/design-system/package.json 新 version
// → 同步寫進 plugin 3 處。release.yml version-sync BLOCKER 步驟才不會擋 publish。

import { chmodSync, constants as fsConstants, copyFileSync, lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { assertNoSymlinkPath, canonicalRepositoryRoot } from './refresh-fork-launchers.mjs'

const ROOT = canonicalRepositoryRoot(process.cwd())
const manifestPaths = [
  'packages/design-system/package.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'packages/storybook-config/package.json',
  'packages/governance/package.json',
  'template/ds-product-template/package.json',
  'package-lock.json',
]

function readManifest(path) {
  const absolute = join(ROOT, path)
  assertNoSymlinkPath(ROOT, absolute, `version surface ${path}`, { allowMissing: false })
  const info = lstatSync(absolute)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`version surface must be a regular file:${path}`)
  const source = readFileSync(absolute, 'utf8')
  return { absolute, mode: info.mode & 0o777, source, value: JSON.parse(source) }
}

// Preflight every source/target before the first mutation. A malicious worktree symlink therefore
// cannot redirect one of the later writes after earlier manifests have already been changed.
const manifests = new Map(manifestPaths.map((path) => [path, readManifest(path)]))
function manifest(path) { return manifests.get(path).value }
const RELEASE_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:beta|next|rc)\.(?:0|[1-9]\d*))?$/
const CHECK_ONLY = process.argv.includes('--check')
const unknownArguments = process.argv.slice(2).filter((value) => value !== '--check')
if (unknownArguments.length) throw new Error(`usage: sync-version-to-all-manifests.mjs [--check]`)

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
}

function assertVersion(value, label) {
  if (typeof value !== 'string' || !RELEASE_VERSION.test(value)) throw new Error(`${label} has an invalid release-train version:${String(value)}`)
}

// Validate the complete shape before calculating or writing a single target. Besides preventing
// partial repair, this makes a missing marketplace entry or dependency a contract failure rather
// than silently accepting a surface that can no longer be governed.
for (const path of manifestPaths) assertRecord(manifest(path), path)
const dsPkg = manifest('packages/design-system/package.json')
if (dsPkg.name !== '@qijenchen/design-system') throw new Error('packages/design-system/package.json has an invalid package name')
assertVersion(dsPkg.version, 'packages/design-system/package.json')
const newVersion = dsPkg.version

const pluginPath = '.claude-plugin/plugin.json'
const plugin = manifest(pluginPath)
if (plugin.name !== 'design-system') throw new Error(`${pluginPath} has an invalid plugin name`)
assertVersion(plugin.version, pluginPath)

const mpPath = '.claude-plugin/marketplace.json'
const mp = manifest(mpPath)
assertRecord(mp.metadata, `${mpPath} metadata`)
assertVersion(mp.metadata.version, `${mpPath} metadata.version`)
if (!Array.isArray(mp.plugins)) throw new Error(`${mpPath} plugins must be an array`)
const dsPlugins = mp.plugins.filter((item) => item?.name === 'design-system')
if (dsPlugins.length !== 1) throw new Error(`${mpPath} must contain exactly one design-system plugin`)
const dsPlugin = dsPlugins[0]
assertVersion(dsPlugin.version, `${mpPath} plugins[design-system].version`)

const sbConfigPath = 'packages/storybook-config/package.json'
const sbConfig = manifest(sbConfigPath)
if (sbConfig.name !== '@qijenchen/storybook-config') throw new Error(`${sbConfigPath} has an invalid package name`)
assertVersion(sbConfig.version, sbConfigPath)

const governancePath = 'packages/governance/package.json'
const governance = manifest(governancePath)
if (governance.name !== '@qijenchen/governance') throw new Error(`${governancePath} has an invalid package name`)
assertVersion(governance.version, governancePath)

const tmplPkgPath = 'template/ds-product-template/package.json'
const tmplPkg = manifest(tmplPkgPath)
if (tmplPkg.name !== 'ds-product-template' || tmplPkg.private !== true) throw new Error(`${tmplPkgPath} must be the private ds-product-template package`)
assertRecord(tmplPkg.dependencies, `${tmplPkgPath} dependencies`)
for (const dep of ['@qijenchen/design-system', '@qijenchen/storybook-config']) assertVersion(tmplPkg.dependencies[dep], `${tmplPkgPath} dependencies.${dep}`)

const lockPath = 'package-lock.json'
const lock = manifest(lockPath)
if (lock.lockfileVersion !== 3) throw new Error(`${lockPath} must use lockfileVersion 3`)
assertRecord(lock.packages, `${lockPath} packages`)
const workspacePackages = new Map([
  ['packages/design-system', '@qijenchen/design-system'],
  ['packages/storybook-config', '@qijenchen/storybook-config'],
  ['packages/governance', '@qijenchen/governance'],
])
for (const [workspacePath, packageName] of workspacePackages) {
  const workspace = lock.packages[workspacePath]
  assertRecord(workspace, `${lockPath} packages.${workspacePath}`)
  if (workspace.name !== packageName) throw new Error(`${lockPath} ${workspacePath} has an invalid package name`)
  assertVersion(workspace.version, `${lockPath} ${workspacePath}.version`)
  const linkPath = `node_modules/${packageName}`
  const link = lock.packages[linkPath]
  assertRecord(link, `${lockPath} packages.${linkPath}`)
  if (link.link !== true || link.resolved !== workspacePath) throw new Error(`${lockPath} ${linkPath} must link to ${workspacePath}`)
}

const desired = new Map()
function update(path, mutate) {
  const value = structuredClone(manifest(path))
  mutate(value)
  const content = JSON.stringify(value, null, 2) + '\n'
  if (content !== manifests.get(path).source) desired.set(path, content)
}

update(pluginPath, (value) => { value.version = newVersion })
update(mpPath, (value) => {
  value.metadata.version = newVersion
  value.plugins.find((item) => item.name === 'design-system').version = newVersion
})
update(sbConfigPath, (value) => { value.version = newVersion })
update(governancePath, (value) => { value.version = newVersion })
update(tmplPkgPath, (value) => {
  value.dependencies['@qijenchen/design-system'] = newVersion
  value.dependencies['@qijenchen/storybook-config'] = newVersion
})
update(lockPath, (value) => {
  for (const workspacePath of workspacePackages.keys()) value.packages[workspacePath].version = newVersion
})

function writeTransaction(changes) {
  const staged = []
  let renameCount = 0
  const failAfterRenames = process.env.NODE_ENV === 'test' ? Number(process.env.GOV_VERSION_SYNC_TEST_FAIL_AFTER_RENAMES || 0) : 0
  try {
    // Prepare every replacement and portable same-directory recovery copy before the first rename.
    // copyFile avoids relying on hard-link support in CloudStorage/File Provider workspaces.
    for (const [path, content] of changes) {
      const entry = manifests.get(path)
      const nonce = `${process.pid}-${randomUUID()}`
      const temporary = `${entry.absolute}.tmp-version-${nonce}`
      const backup = `${entry.absolute}.bak-version-${nonce}`
      assertNoSymlinkPath(ROOT, temporary, `version surface temporary ${path}`)
      assertNoSymlinkPath(ROOT, backup, `version surface recovery ${path}`)
      const item = { path, entry, temporary, backup, renamed: false }
      staged.push(item)
      writeFileSync(temporary, content, { flag: 'wx', mode: entry.mode })
      chmodSync(temporary, entry.mode)
      copyFileSync(entry.absolute, backup, fsConstants.COPYFILE_EXCL)
      chmodSync(backup, entry.mode)
    }
    for (const item of staged) {
      renameSync(item.temporary, item.entry.absolute)
      item.renamed = true
      renameCount += 1
      if (failAfterRenames === renameCount) throw new Error(`injected version transaction failure after ${renameCount} renames`)
    }
  } catch (error) {
    // A normal runtime failure rolls every completed rename back to the exact original inode.
    for (const item of [...staged].reverse()) {
      try {
        if (item.renamed) renameSync(item.backup, item.entry.absolute)
        else unlinkSync(item.backup)
      } catch { /* Preserve the primary failure; --check/build graph will expose any residual drift. */ }
      try { unlinkSync(item.temporary) } catch { /* already renamed or absent */ }
    }
    throw error
  }
  for (const item of staged) unlinkSync(item.backup)
}

console.log(`📦 DS version: ${newVersion}`)

// template/ds-product-template consumer dep sync(2026-06-08 fix — 根治「為何落後 28 版」)
// 原 in-monorepo template 的 DS dep 釘死 ^beta.32:不在 version sync 範圍、無 preflight gate、無 hook 守
//   → 三道網全漏 → 無人 bump → DS 到 beta.60 它還停 beta.32。下游靠 mirror 重寫 + semver 容錯掩蓋,
//   但 source 字串本身違反 SSOT(且 DS 一旦 bump 0.2.0,caret 容錯失效 → 本地 dogfood 裝到 stale)。
// 此處跟著 DS version 改寫 root template 的 DS + storybook-config consumer dep,讓
//   「ds push main → template 版本自動 SSOT」機械成立(release-preflight.mjs 第一步即跑本 script)。
// 注:apps/template/package.json 的 DS dep 是 `*`(workspace wildcard,由 mirror transform 處理),不在此動。
if (CHECK_ONLY && desired.size) {
  for (const path of desired.keys()) console.error(`✗ version drift:${path} != ${newVersion}`)
  process.exit(1)
}
if (!CHECK_ONLY) writeTransaction(desired)
for (const path of [pluginPath, mpPath, sbConfigPath, governancePath, tmplPkgPath, lockPath]) {
  console.log(`✓ ${path} ${desired.has(path) ? (CHECK_ONLY ? 'drift' : `→ ${newVersion}`) : `already ${newVersion}`}`)
}

console.log('')
console.log(CHECK_ONLY ? 'Version SSOT check passed.' : 'Done. Commit through the protected PR flow, then dispatch the protected-default release workflow with the exact attested tag.')
