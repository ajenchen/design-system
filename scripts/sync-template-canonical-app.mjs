#!/usr/bin/env node
/**
 * sync-template-canonical-app.mjs — single-SSOT guard for the template dashboard App.
 *
 * @gate-contract
 *   保證: 範本本體 apps/template/src/App.tsx 與隨 npm 出貨的副本 ds-canonical/templates/dashboard-app.tsx 逐字相同
 *         (receiver 每次發版 `cp 副本 → App.tsx`,副本落後 = 範本改動被靜默蓋回舊版)
 *   紅: 副本弄壞一行 → --check 指名 DRIFT 並 exit 1;副本不見 → exit 2(儀器失效,不讀成通過);對照組在 scripts/test-sync-template-canonical-app.mjs 的拋棄式小樹
 *   綠: 兩檔逐字相同時 exit 0;純讀檔比對,重複跑結果相同
 *
 * 2026-06-07 C2 fix(deep root-cause investigation):published ds-product-template 的 receiver
 * (sync-design-system.yml「Sync DS canonical template」)每次 release 都 `cp ds-canonical/templates/
 * dashboard-app.tsx → apps/template/src/App.tsx`。但 dashboard-app.tsx 是「手動凍結副本」,跟真正
 * dev 編輯的 `apps/template/src/App.tsx` 漂移(差 6 行 conformance-model 註解)→ receiver 每次把
 * mirror 剛同步的 App.tsx 覆寫回舊版,scaffold 的 App.tsx 改動「每次 release 靜默丟失」。
 *
 * 根因 = dual source of truth。本 script 確立單一 SSOT:
 *   SSOT  = apps/template/src/App.tsx(dev 實際編輯、會前進的版本)
 *   COPY  = packages/design-system/ds-canonical/templates/dashboard-app.tsx(shipped via npm,receiver 消費)
 *
 * 用法:
 *   node scripts/sync-template-canonical-app.mjs           # 同步 SSOT → COPY(寫)
 *   node scripts/sync-template-canonical-app.mjs --check    # 驗 SSOT == COPY,漂移 exit 1(deterministic audit chain gate)
 *   --root=<dir>                                            # 對另一棵樹跑(meta-test 的拋棄式小樹;預設 = 本 repo)
 *
 * 2026-11-04:接進 CI(npm run test:template-canonical-app);對照組在 scripts/test-sync-template-canonical-app.mjs。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootArg = process.argv.find((a) => a.startsWith('--root='))
const ROOT = rootArg ? rootArg.slice('--root='.length) : join(dirname(fileURLToPath(import.meta.url)), '..')
const SSOT = join(ROOT, 'apps/template/src/App.tsx')
const COPY = join(ROOT, 'packages/design-system/ds-canonical/templates/dashboard-app.tsx')
const CHECK = process.argv.includes('--check')

for (const [label, p] of [['SSOT', SSOT], ['COPY', COPY]]) {
  if (!existsSync(p)) {
    console.error(`❌ ${label} not found: ${p}`)
    process.exit(2)
  }
}

const ssot = readFileSync(SSOT, 'utf8')
const copy = readFileSync(COPY, 'utf8')

if (CHECK) {
  if (ssot !== copy) {
    console.error('❌ DRIFT: ds-canonical/templates/dashboard-app.tsx ≠ apps/template/src/App.tsx')
    console.error('   receiver 的 `cp dashboard-app.tsx → App.tsx` 會把 scaffold App.tsx 覆寫回舊版。')
    console.error('   修:node scripts/sync-template-canonical-app.mjs')
    process.exit(1)
  }
  console.log('✓ template canonical App in sync (dashboard-app.tsx == apps/template/src/App.tsx)')
  process.exit(0)
}

if (ssot === copy) {
  console.log('✓ already in sync — no change')
  process.exit(0)
}
writeFileSync(COPY, ssot)
console.log('✓ synced apps/template/src/App.tsx → ds-canonical/templates/dashboard-app.tsx')
