#!/usr/bin/env node
// sync-version-to-all-manifests.mjs — Phase 5 sync DS package version to plugin + marketplace
//
// packages/design-system/package.json 是版本 SSOT。governance build graph 在 generate/check 階段
// 呼叫本 script，同步 plugin/marketplace、linked packages、template exact dependencies，以及
// package-lock v3 的三個 workspace entries（只改版本欄位，不接管其餘 manifest/lock 內容）。
// Changesets 保留為未來可手動啟動的替代 authoring surface，不是 standard beta release 前置。

import { chmodSync, constants as fsConstants, copyFileSync, lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { assertNoSymlinkPath, canonicalRepositoryRoot } from './refresh-fork-launchers.mjs'
import {
  deriveProviderProductManagedInventory,
  lifecycleSnapshotSha256,
  providerInventorySha256,
  validateProviderLifecycleLedger,
} from './lib/provider-lifecycle.mjs'

const ROOT = canonicalRepositoryRoot(process.cwd())
const manifestPaths = [
  'packages/design-system/package.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'packages/storybook-config/package.json',
  'packages/governance/package.json',
  'template/ds-product-template/package.json',
  'package-lock.json',
  'packages/governance/canonical/providers.json',
  'packages/governance/canonical/provider-lifecycle.json',
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
// `--last-published <exact version>`:呼叫端把「線上最新已發布是哪一版」這個事實傳進來。
// 允許清單維持白名單制(未知旗標一律拒絕),只多放這一對。
const LAST_PUBLISHED_FLAG = '--last-published'
const rawArguments = process.argv.slice(2)
const unknownArguments = rawArguments.filter((value, index) => {
  if (value === '--check' || value === LAST_PUBLISHED_FLAG) return false
  return rawArguments[index - 1] !== LAST_PUBLISHED_FLAG
})
if (unknownArguments.length) {
  throw new Error(`usage: sync-version-to-all-manifests.mjs [--check] [${LAST_PUBLISHED_FLAG} <exact version>]`)
}

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

const providerRegistryPath = 'packages/governance/canonical/providers.json'
const providerRegistry = manifest(providerRegistryPath)
assertRecord(providerRegistry.canonical, `${providerRegistryPath} canonical`)
if (!Array.isArray(providerRegistry.canonical.retiredProviders)) {
  throw new Error(`${providerRegistryPath} canonical.retiredProviders must be an array`)
}

const providerLifecyclePath = 'packages/governance/canonical/provider-lifecycle.json'
const providerLifecycle = manifest(providerLifecyclePath)
if (!Array.isArray(providerLifecycle.snapshots) || !providerLifecycle.snapshots.length) {
  throw new Error(`${providerLifecyclePath} must contain at least one snapshot`)
}
// **「帳本最後一筆」不等於「上一個已發布的版本」**(2026-09-21,M37 同族,而且付了真實代價)。
//
// 鏈的用途是讓 consumer 從**它裝著的那一版**驗到要裝的這一版:incoming 宣告的 immutableHead
// 必須正好是 consumer 手上那一版。而這支腳本原本無條件把「帳本最後一筆」當成上一版 ——
// 那一筆是上次 bump 寫的,**不管有沒有發成**。
//
// 實際發生的事:beta.141 bump 了、鏈前進了,然後那個版號因為 tag 打在錯的 commit 上而報廢,
// 從來沒有發布。接著 beta.142 的鏈就宣告「前一版是 beta.141」。WM 裝的是 beta.140,
// 於是 beta.142 對它而言**永遠裝不上**(GOV-UPGRADE-007),而這件事要等到發布完、
// consumer 同步失敗才看得見。
//
// `--last-published <version>` 讓呼叫端(release orchestrator 知道線上最新是哪一版)把
// 「已發布」這個事實傳進來:尾端任何**在它之後**的快照都是沒發成的殘留,取代掉而不是疊上去。
// 沒傳就維持原行為(本機手動 bump),但發布路徑上有閘會擋(見 release-orchestrator 的
// publish 步驟:要發的版本,其 immutableHead 必須等於線上最新已發布版)。
const lastPublishedFlagIndex = process.argv.indexOf(LAST_PUBLISHED_FLAG)
const lastPublished = lastPublishedFlagIndex >= 0 ? process.argv[lastPublishedFlagIndex + 1] : null
if (lastPublishedFlagIndex >= 0) {
  assertVersion(lastPublished, '--last-published')
  const keepUntil = providerLifecycle.snapshots.findIndex((item) => item.releaseVersion === lastPublished)
  if (keepUntil < 0) {
    throw new Error(`--last-published ${lastPublished} is not a retained lifecycle snapshot; use an explicit migration`)
  }
  const dropped = providerLifecycle.snapshots.slice(keepUntil + 1).map((item) => item.releaseVersion)
  if (dropped.length) {
    // 只丟「發布過的最新版之後」的殘留。它們描述的是**沒有任何 consumer 到達過**的狀態,
    // 留著只會讓 immutableHead(硬性等於倒數第二筆)指向一個沒人裝得到的版本。
    providerLifecycle.snapshots = providerLifecycle.snapshots.slice(0, keepUntil + 1)
    // immutableHead 硬性等於倒數第二筆,截斷之後必須一起還原成「那一版當時」的樣子,
    // 否則它會指向一筆已經不在帳本裡的快照(下面的 pre-validation 會先擋下來)。
    const restoredHead = providerLifecycle.snapshots.at(-2) ?? providerLifecycle.snapshots.at(-1)
    providerLifecycle.immutableHead = {
      providerInventorySha256: providerInventorySha256(restoredHead.providers),
      releaseVersion: restoredHead.releaseVersion,
      snapshotSha256: lifecycleSnapshotSha256(restoredHead),
    }
    console.log(`↺ 丟棄未發布的尾端快照:${dropped.join(' / ')}(線上最新已發布 = ${lastPublished});immutableHead 還原為 ${restoredHead.releaseVersion}`)
  }
}
const currentProviderSnapshot = providerLifecycle.snapshots.at(-1)
assertRecord(currentProviderSnapshot, `${providerLifecyclePath} current snapshot`)
assertVersion(currentProviderSnapshot.releaseVersion, `${providerLifecyclePath} current snapshot.releaseVersion`)
if (!Array.isArray(currentProviderSnapshot.retiredProviders)) {
  throw new Error(`${providerLifecyclePath} current snapshot.retiredProviders must be an array`)
}
const needsProviderLifecycleAdvance = currentProviderSnapshot.releaseVersion !== newVersion
if (needsProviderLifecycleAdvance && (providerRegistry.canonical.retiredProviders.length || currentProviderSnapshot.retiredProviders.length)) {
  throw new Error('version-only provider lifecycle advance requires empty registry/current retiredProviders; use an explicit provider lifecycle migration')
}
const currentProviderInventory = deriveProviderProductManagedInventory(providerRegistry)
if (JSON.stringify(currentProviderSnapshot.providers) !== JSON.stringify(currentProviderInventory)) {
  throw new Error('provider topology changed since the current lifecycle snapshot; use an explicit provider lifecycle migration')
}
// Validate every retained digest, transition, immutable-head pointer, and registry projection before
// calculating any writes. Pure version sync may advance only an already-valid, unchanged topology.
validateProviderLifecycleLedger({
  ledger: providerLifecycle,
  registry: providerRegistry,
  releaseVersion: currentProviderSnapshot.releaseVersion,
})

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

if (needsProviderLifecycleAdvance) {
  const previousSnapshotSha256 = lifecycleSnapshotSha256(currentProviderSnapshot)
  const nextLifecycle = structuredClone(providerLifecycle)
  nextLifecycle.immutableHead = {
    providerInventorySha256: providerInventorySha256(currentProviderSnapshot.providers),
    releaseVersion: currentProviderSnapshot.releaseVersion,
    snapshotSha256: previousSnapshotSha256,
  }
  nextLifecycle.snapshots.push({
    releaseVersion: newVersion,
    previousSnapshotSha256,
    providers: structuredClone(currentProviderSnapshot.providers),
    retiredProviders: [],
  })
  validateProviderLifecycleLedger({ ledger: nextLifecycle, registry: providerRegistry, releaseVersion: newVersion })
  const content = JSON.stringify(nextLifecycle, null, 2) + '\n'
  if (content !== manifests.get(providerLifecyclePath).source) desired.set(providerLifecyclePath, content)
}

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
//   「version SSOT → template exact dependency」由 governance build graph 機械同步。
// 注:apps/template/package.json 的 DS dep 是 `*`(workspace wildcard,由 mirror transform 處理),不在此動。
if (CHECK_ONLY && desired.size) {
  for (const path of desired.keys()) console.error(`✗ version drift:${path} != ${newVersion}`)
  process.exit(1)
}
if (!CHECK_ONLY) writeTransaction(desired)
for (const path of [pluginPath, mpPath, sbConfigPath, governancePath, tmplPkgPath, lockPath, providerLifecyclePath]) {
  console.log(`✓ ${path} ${desired.has(path) ? (CHECK_ONLY ? 'drift' : `→ ${newVersion}`) : `already ${newVersion}`}`)
}

console.log('')
console.log(CHECK_ONLY ? 'Version SSOT check passed.' : 'Done. Commit through the protected PR flow, then run the canonical release:auto five-step workflow.')
