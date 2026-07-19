#!/usr/bin/env node
/**
 * check-clean-install-safety.mjs — PNG §14-17/§31:published packages 必須 clean-install 安全。
 *
 * 為何存在(codex 規格 §14-17 clean install 家族 + §31 offline-after-install):
 *   consumer 用 `npm install --ignore-scripts`(供應鏈防護常見設定)或離線(`--offline` / 快取)安裝時,
 *   任何 **consumer-install lifecycle script**(preinstall / install / postinstall)都會被跳過或無法連網 →
 *   若套件依賴這些 script 產生檔案 / 下載 binary,consumer 端就會拿到半殘安裝(silent breakage)。
 *   本 gate 機械保證:每個 published package 的 package.json **沒有** consumer-install lifecycle script,
 *   從而 `--ignore-scripts` 與離線安裝**恆等於**普通安裝(無 script 步驟可跳過)。這比跑一次性的慢速
 *   install 探針更強:它把「clean-install 安全」變成每次 release 都驗的不變式,而非某次抽測。
 *
 * 註:`prepare` / `prepublishOnly` 是 **publish/pack 時**跑(在 DS repo,非 consumer 端),不在本檢查範圍。
 *   pnpm 為非官方支援 PM(certified-surfaces.md 標 Unsupported),不在本 gate 斷言範圍。
 *
 * 用法:node scripts/check-clean-install-safety.mjs [--check]
 *   (--check 與 bare 行為相同;統一 preflight 慣例保留旗標)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// published packages(private:false / 有 publishConfig)。以 workspace 的兩個 npm-shipped 套件為準。
const PUBLISHED = ['packages/design-system', 'packages/storybook-config']
const CONSUMER_INSTALL_HOOKS = ['preinstall', 'install', 'postinstall']

const violations = []
for (const pkgDir of PUBLISHED) {
  const pkgPath = join(ROOT, pkgDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (pkg.private) continue // 非發佈套件跳過
  const scripts = pkg.scripts || {}
  const offending = CONSUMER_INSTALL_HOOKS.filter((h) => scripts[h])
  if (offending.length) {
    violations.push(`  - ${pkg.name}(${pkgDir}/package.json)含 consumer-install lifecycle script:${offending.map((h) => `${h}="${scripts[h]}"`).join(', ')}`)
  }
}

if (violations.length) {
  console.error('❌ clean-install 不安全:published package 含 consumer-install lifecycle script')
  console.error(violations.join('\n'))
  console.error('   修:移除 preinstall/install/postinstall(這些在 --ignore-scripts / 離線安裝會被跳過 → consumer 拿到半殘安裝)。')
  console.error('   若確有必要 → 改成 consumer 自行執行的顯式 setup step,並在 certified-surfaces.md 記錄 clean-install 降級。')
  process.exit(1)
}

console.log(`✓ clean-install-safety:${PUBLISHED.length} published package 皆無 consumer-install lifecycle script(--ignore-scripts / 離線安裝 == 普通安裝,§14-17/§31)`)
