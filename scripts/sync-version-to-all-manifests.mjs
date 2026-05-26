#!/usr/bin/env node
// sync-version-to-all-manifests.mjs — Phase 5 sync DS package version to plugin + marketplace
//
// changesets/cli `changeset version` 只 bump packages/* package.json。但本 repo 還有 3 處 version
// 需同步:
//   - .claude-plugin/plugin.json
//   - .claude-plugin/marketplace.json metadata.version + plugins[design-system].version
//
// 此 script 跑在 `npm run changeset:version` 之後,讀 packages/design-system/package.json 新 version
// → 同步寫進 plugin 3 處。release.yml version-sync BLOCKER 步驟才不會擋 publish。

import { readFileSync, writeFileSync } from 'node:fs'

const dsPkg = JSON.parse(readFileSync('packages/design-system/package.json', 'utf8'))
const newVersion = dsPkg.version
console.log(`📦 DS version: ${newVersion}`)

// plugin.json
const pluginPath = '.claude-plugin/plugin.json'
const plugin = JSON.parse(readFileSync(pluginPath, 'utf8'))
if (plugin.version !== newVersion) {
  plugin.version = newVersion
  writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + '\n')
  console.log(`✓ ${pluginPath} → ${newVersion}`)
} else {
  console.log(`✓ ${pluginPath} already ${newVersion}`)
}

// marketplace.json — 2 places: metadata.version + plugins[design-system].version
const mpPath = '.claude-plugin/marketplace.json'
const mp = JSON.parse(readFileSync(mpPath, 'utf8'))
let mpChanged = false
if (mp.metadata?.version !== newVersion) {
  mp.metadata.version = newVersion
  mpChanged = true
}
const dsPlugin = mp.plugins?.find((p) => p.name === 'design-system')
if (dsPlugin && dsPlugin.version !== newVersion) {
  dsPlugin.version = newVersion
  mpChanged = true
}
if (mpChanged) {
  writeFileSync(mpPath, JSON.stringify(mp, null, 2) + '\n')
  console.log(`✓ ${mpPath} → ${newVersion}(metadata + plugins[design-system])`)
} else {
  console.log(`✓ ${mpPath} already ${newVersion}`)
}

// storybook-config(2026-05-26 fix:plugin-structure-validate 5-manifest check 含 storybook-config,
// 漏 sync 會 BLOCKER release。version 跟 DS 同步,monorepo 共版本 canonical)
const sbConfigPath = 'packages/storybook-config/package.json'
const sbConfig = JSON.parse(readFileSync(sbConfigPath, 'utf8'))
if (sbConfig.version !== newVersion) {
  sbConfig.version = newVersion
  writeFileSync(sbConfigPath, JSON.stringify(sbConfig, null, 2) + '\n')
  console.log(`✓ ${sbConfigPath} → ${newVersion}`)
} else {
  console.log(`✓ ${sbConfigPath} already ${newVersion}`)
}

console.log('')
console.log('Done. Commit + tag + push to trigger release.yml.')
