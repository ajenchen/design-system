#!/usr/bin/env node
/**
 * consumer-fullsnapshot-upgrade.mjs — 當 ordinary sync 被受保護路徑擋下時的自動接手。
 *
 * ## 為什麼需要它
 *
 * 受保護 control-plane 路徑的前綴含整個 `scripts/`(scripts/lib/consumer-control-plane-policy.mjs),
 * 而那正是所有 consumer 腳本的所在。於是**任何一次改到 consumer 腳本的發版,都會讓每個 consumer 的
 * ordinary sync 撞上 GOV-UPGRADE-BOOTSTRAP-001**(verify-upgrade-evidence.mjs:279)。WM 從
 * beta.113 一路卡到 beta.116 就是這個結構性原因,不是 WM 特有。
 *
 * 那條錯誤訊息指向「reviewed control-plane update」,但那條 lane 要求 profile 在
 * `reviewedControlPlaneUpdate.entryProfiles` 內;legacy profile 的 consumer 進不去,而要進去得先
 * 完成 promotion,promotion 又要求一個「非作者」的獨立簽署 —— 單人 fleet 結構上不可能滿足。
 * 結果是:**受保護路徑一變,legacy consumer 就永遠升不上去**。
 *
 * 但 legacy profile 自己的 entry mode 就是 one-time reviewed full-snapshot PR,那條路一直是通的
 * (WM PR #47 從 111 升到 115、PR #56 從 116 升到 118 都走它)。本腳本把那條路的手動步驟固化成
 * 一個指令,安全姿態完全不變 —— 仍然是 full-snapshot plan + 獨立重算 materialization 驗證 +
 * 受保護 PR + required check,只是不再需要人工逐步敲。
 *
 * ## 用法
 *
 *   node scripts/consumer-fullsnapshot-upgrade.mjs \
 *     --repo-id work-management --consumer-root <path> \
 *     --base <上一版 template tree> --incoming <本版 template tree> \
 *     --release-bom <release-bom.json> --required-checks-digest <sha256> \
 *     [--acknowledge-consumer-owned a,b,c] [--output <materialize 目錄>] [--apply]
 *
 * 預設只做 plan + materialize + 獨立驗證並印出摘要;加 --apply 才把已驗證的 snapshot 寫進
 * consumer 工作區並對齊版本面(manifest / lock / README)。推分支與開 PR 交給呼叫者,
 * 因為那需要憑證,不該藏在這支腳本裡。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}
const required = name => {
  const value = arg(name)
  if (!value) {
    console.error(`missing ${name}`)
    process.exit(2)
  }
  return value
}

const repoId = required('--repo-id')
const consumerRoot = resolve(required('--consumer-root'))
const base = resolve(required('--base'))
const incoming = resolve(required('--incoming'))
const releaseBom = resolve(required('--release-bom'))
const requiredChecksDigest = required('--required-checks-digest')
const acknowledge = arg('--acknowledge-consumer-owned', '')
const output = resolve(arg('--output') || join(consumerRoot, '..', `.fullsnapshot-${repoId}`))
const apply = process.argv.includes('--apply')

const consumerctl = join(ROOT, 'infra/governance/bin/consumerctl.mjs')
const run = (args, label) => {
  try {
    return JSON.parse(execFileSync(process.execPath, [consumerctl, ...args], { encoding: 'utf8', maxBuffer: 1e8 }))
  } catch (error) {
    console.error(`✗ ${label} 失敗:\n${error.stderr || error.message}`)
    process.exit(1)
  }
}

const sourceArgs = [
  '--repo-id', repoId,
  '--root', consumerRoot,
  '--base', base,
  '--incoming', incoming,
  '--release-bom', releaseBom,
  '--required-checks-digest', requiredChecksDigest,
  ...(acknowledge ? ['--acknowledge-consumer-owned', acknowledge] : []),
  '--json',
]

console.log('── 1. plan-bootstrap')
const plan = run(['plan-bootstrap', ...sourceArgs], 'plan-bootstrap')
console.log(`   planDigest ${plan.planDigest}`)
console.log(`   reviewReady=${plan.reviewReady} conflicts=${(plan.conflicts || []).length} actions=${(plan.actions || []).length} preserved=${(plan.preserved || []).length}`)
if (!plan.reviewReady || (plan.conflicts || []).length) {
  console.error('✗ plan 未 reviewReady —— 未解的 conflict 必須逐條具名確認,不得整批放行')
  for (const conflict of (plan.conflicts || []).slice(0, 20)) {
    console.error(`   - ${typeof conflict === 'string' ? conflict : conflict.path || JSON.stringify(conflict)}`)
  }
  process.exit(1)
}
mkdirSync(dirname(output), { recursive: true })
const planFile = join(dirname(output), `plan-${repoId}.json`)
writeFileSync(planFile, `${JSON.stringify(plan, null, 2)}\n`)

console.log('── 2. materialize-bootstrap')
const materialized = run([
  'materialize-bootstrap', ...sourceArgs,
  '--plan-file', planFile,
  '--expected-plan-digest', plan.planDigest,
  '--output', output,
], 'materialize-bootstrap')
console.log(`   entries=${materialized.entryCount} tree=${materialized.materializedSnapshotTreeSha256}`)

console.log('── 3. check-bootstrap-materialization(獨立重算)')
const verified = run([
  'check-bootstrap-materialization',
  '--plan-file', planFile,
  '--expected-plan-digest', plan.planDigest,
  '--materialized-root', output,
  '--json',
], 'check-bootstrap-materialization')
const treeMatches = verified.materializedSnapshotTreeSha256 === verified.expectedSnapshotTreeSha256
console.log(`   tree 相符=${treeMatches} readOnly=${verified.readOnly} candidateCodeExecuted=${verified.candidateCodeExecuted}`)
console.log(`   verificationDigest ${verified.verificationDigest}`)
if (!treeMatches || verified.readOnly !== true || verified.candidateCodeExecuted !== false) {
  console.error('✗ 獨立重算未通過,拒絕套用')
  process.exit(1)
}

if (!apply) {
  console.log('\n✅ plan + materialize + 獨立驗證全過。加 --apply 才會寫進 consumer 工作區。')
  process.exit(0)
}

console.log('── 4. 套用 snapshot 到 consumer 工作區')
// rsync 必須 --checksum:等長同秒的檔案會被 -a 靜默跳過(失敗記憶索引 2026-07-28 錨例)。
execFileSync('rsync', ['-a', '--checksum', '--exclude', '.git/', `${output}/`, `${consumerRoot}/`], { stdio: 'inherit' })

console.log('── 5. 對齊版本面(manifest / lock / README)')
const bom = JSON.parse(readFileSync(releaseBom, 'utf8'))
const version = bom.releaseVersion
const inConsumer = args => execFileSync(process.execPath, args, { cwd: consumerRoot, encoding: 'utf8' })
inConsumer([join(consumerRoot, 'scripts/sync-exact-workspace-dependencies.mjs'), '--set', version])

const lockPath = join(consumerRoot, 'package-lock.json')
if (existsSync(lockPath)) {
  // npm install --package-lock-only 只補缺的東西,不會清「已被滿足但多餘」的 nested node;
  // 升級交易留下的舊版 nested entry 因此會活到 exact-version 檢查(2026-08-06 事故)。
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  const stale = Object.keys(lock.packages || {}).filter(path => (
    /\/node_modules\/@qijenchen\/[^/]+$/.test(path) && lock.packages[path].version !== version
  ))
  for (const path of stale) delete lock.packages[path]
  if (stale.length) writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  console.log(`   清掉過期 nested entry:${stale.length} 筆`)
}

const readmePath = join(consumerRoot, 'README.md')
if (existsSync(readmePath)) {
  const before = readFileSync(readmePath, 'utf8')
  const after = before.replace(
    /(@qijenchen\/(?:design-system|storybook-config)@)\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g,
    `$1${version}`,
  )
  if (after !== before) writeFileSync(readmePath, after)
  console.log(`   README 版本改寫:${after !== before}`)
}

inConsumer([join(consumerRoot, 'scripts/sync-exact-workspace-dependencies.mjs'), '--check', version])
console.log(`\n✅ ${repoId} 已套用 ${version} 的 full-snapshot 並通過 exact-version 檢查。`)
console.log('   接下來由呼叫者推分支 + 開受保護 PR(需要憑證,刻意不放在本腳本內)。')
