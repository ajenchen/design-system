#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 發版同意閘真的會擋 —— 沒有 receipt(或 receipt 不屬於當前分支)時 merge 停在 awaiting-consent
 *   紅: 把 receipt 刪掉、或換成別的分支的 receipt → merge 必須是 awaiting-consent 而不是 pending
 *   綠: receipt 屬於當前分支時必須 pending;本檔同時驗「已合併不回頭要 receipt」,避免誤擋成永久死鎖
 *
 * 2026-09-20:同意由綁 commit 改為綁**分支**(= 該 PR)。發版必然產生新 commit(版號 bump、
 * CI 修正),綁 commit 會讓 user 為同一份工作被迫一再重講「發版」。
 * 「同分支新 commit 仍有效 / 預覽內容變了要重新確認」那組純判定在
 * `infra/governance/test/release-workflow.test.mjs` 的 consentCoversHead 判定表(8 格),
 * 本檔負責的是**檔案系統 + 五步狀態**的整合面。
 *
 * 本檔只清自己建立的檔案:先前的版本在 finally 裡 `rmSync(DIR, {recursive:true})`,
 * 在本機跑會把**真實的同意 receipt 一起刪掉**。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFiveStepStatus, loadReleaseWorkflow, previewUrls, readReleaseConsent } from './release-orchestrator.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = resolve(ROOT, '.git/governance-runtime/release-consent')
const workflow = loadReleaseWorkflow()
const sha = 'f'.repeat(40)
const other = 'e'.repeat(40)
const branch = 'claude/x'
const base = {
  repository: 'ajenchen/design-system', branch, headSha: sha, protectedMainSha: other, onProtectedMain: false,
  version: '0.1.0-beta.999', tag: 'v0.1.0-beta.999',
  pullRequest: { number: 999, state: 'OPEN', headRefOid: sha, requiredChecks: [{ state: 'SUCCESS', conclusion: 'SUCCESS', status: 'COMPLETED' }] },
  release: null, releaseCommitSha: null, publishRun: null, npmPackages: [], consumers: [],
}
const branchFile = resolve(DIR, 'branch__claude_x.json')
const legacyFile = resolve(DIR, `${sha}.json`)
const dirExistedBefore = existsSync(DIR)
const filesBefore = dirExistedBefore ? new Set(readdirSync(DIR)) : new Set()
const mergeStatus = (over) => buildFiveStepStatus(workflow, { ...base, ...over }).find(s => s.id === 'merge').status

try {
  rmSync(branchFile, { force: true })
  rmSync(legacyFile, { force: true })
  assert.equal(workflow.releaseConsent?.required, true, 'workflow must require release consent')
  assert.equal(workflow.steps.find(s => s.id === 'merge').gate, 'user-release-consent')

  // 1. 完全沒有 receipt → 擋住(這是 2026-09-02 事故的那一格)
  assert.equal(mergeStatus({ releaseConsent: readReleaseConsent({ branch, headSha: sha }) }), 'awaiting-consent', '無 receipt → awaiting-consent')

  mkdirSync(DIR, { recursive: true })

  // 2. receipt 屬於**別的分支** → 仍然擋住(換一份工作要重新同意)
  writeFileSync(branchFile, JSON.stringify({ schemaVersion: 2, branch: 'claude/other', consentedHeadSha: sha, quote: '發版' }))
  assert.equal(readReleaseConsent({ branch, headSha: sha }), null, 'receipt 屬於別的分支 → 視為無')

  // 3. 缺 user 逐字原話 → 視為無(receipt 的意義就是那句話)
  writeFileSync(branchFile, JSON.stringify({ schemaVersion: 2, branch, consentedHeadSha: sha, quote: '   ' }))
  assert.equal(readReleaseConsent({ branch, headSha: sha }), null, '空 quote → 視為無')

  // 4. receipt 屬於當前分支且 head 未變 → 放行
  writeFileSync(branchFile, JSON.stringify({ schemaVersion: 2, branch, consentedHeadSha: sha, quote: '可以發版了' }))
  assert.equal(mergeStatus({ releaseConsent: readReleaseConsent({ branch, headSha: sha }) }), 'pending', '有本分支 receipt → pending(可合併)')

  // 5. 舊格式(綁 commit)仍相容,但只認它自己那一個 commit
  rmSync(branchFile, { force: true })
  writeFileSync(legacyFile, JSON.stringify({ schemaVersion: 1, headSha: sha, branch, quote: '發版', source: 'test' }))
  assert.equal(mergeStatus({ releaseConsent: readReleaseConsent({ branch, headSha: sha }) }), 'pending', '舊格式 receipt 綁對 commit → pending')
  assert.equal(readReleaseConsent({ branch, headSha: other }), null, '舊格式 receipt 綁錯 commit → 視為無')

  // 6. 已合併不回頭要 receipt(避免把閘變成永久死鎖)
  assert.equal(mergeStatus({ pullRequest: { ...base.pullRequest, state: 'MERGED' }, releaseConsent: null }), 'complete', '已合併不回頭要 receipt')

  const urls = previewUrls(workflow, base)
  assert.ok(urls[0].includes('deploy-preview-999--ajenchen-design-system.netlify.app'), 'PR 預覽 URL')
  assert.ok(urls[1].includes('claude-x--ajenchen-design-system.netlify.app'), '分支預覽 URL')
  console.log('✅ test-release-consent PASS(9 cases;同意綁分支,舊格式相容)')
} finally {
  // 只清自己建立的,絕不整個目錄刪掉 —— 那會連使用者真實的同意 receipt 一起清掉。
  rmSync(branchFile, { force: true })
  rmSync(legacyFile, { force: true })
  if (!dirExistedBefore && existsSync(DIR) && readdirSync(DIR).length === 0) rmSync(DIR, { recursive: true, force: true })
  if (dirExistedBefore) {
    const now = new Set(readdirSync(DIR))
    for (const f of filesBefore) assert.ok(now.has(f), `本測試不得刪掉既有的同意 receipt:${f}`)
  }
}
