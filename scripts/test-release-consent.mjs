#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 發版同意閘真的會擋 —— 沒有 receipt(或 receipt 不屬於當前分支)時 merge 停在 awaiting-consent
 *   紅: 把 receipt 刪掉、或換成別的分支的 receipt → merge 必須是 awaiting-consent 而不是 pending
 *   綠: receipt 屬於當前分支時必須 pending;本檔同時驗「已合併不回頭要 receipt」,避免誤擋成永久死鎖
 *   綠(第二面,2026-09-20 加): productVisibleFilesChanged 必須在**真實 git 歷史**上分得出兩種 commit。
 *       只驗「該紅會紅」不夠 —— 這支的實際故障是**恆為真**(永遠說預覽變了),那種壞法在
 *       單面測試下全綠。故本檔強制找出「有動 src」與「沒動 src」各一個真 commit,兩邊都要對;
 *       找不到對照組 = 測試自己失格(fail),不得空跑當綠。
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
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { buildFiveStepStatus, loadReleaseWorkflow, previewUrls, productVisibleFilesChanged, readReleaseConsent } from './release-orchestrator.mjs'

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
  // ── 真實 git 歷史上的兩面驗證 ────────────────────────────────────────────
  // 上面 1-6 驗的是「拿到 productFilesChanged 之後怎麼判」;這一段驗的是**那個值本身算得對不對**。
  // 2026-09-20 的故障正卡在這條縫:判定表 8 格全綠,但餵給它的值恆為 true,整個修正是死的。
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim()
  const PRODUCT = /^packages\/[^/]+\/src\/.*\.(tsx?|jsx?|css)$/
  let withProduct = null
  let withoutProduct = null
  for (const sha of git('log', '-n', '400', '--no-merges', '--format=%H').split('\n')) {
    if (!sha) continue
    let files
    try { files = git('diff', '--name-only', `${sha}^`, sha).split('\n').filter(Boolean) } catch { continue }
    if (!files.length) continue
    const touches = files.some(f => PRODUCT.test(f))
    if (touches && !withProduct) withProduct = sha
    if (!touches && !withoutProduct) withoutProduct = sha
    if (withProduct && withoutProduct) break
  }
  // 對照組必須真的存在 —— 少任何一邊,這個測試就分不出「恆真 / 恆假 / 正確」三者,等於零證據。
  assert.ok(withProduct, '近 400 個 commit 找不到「有動 packages/<pkg>/src」的對照組,本測試無法成立')
  assert.ok(withoutProduct, '近 400 個 commit 找不到「沒動 packages/<pkg>/src」的對照組,本測試無法成立')
  assert.equal(productVisibleFilesChanged(`${withProduct}^`, withProduct), true,
    `動了 src 的 commit ${withProduct.slice(0, 8)} 必須判為「預覽變了」`)
  assert.equal(productVisibleFilesChanged(`${withoutProduct}^`, withoutProduct), false,
    `沒動 src 的 commit ${withoutProduct.slice(0, 8)} 必須判為「預覽沒變」—— 恆為 true 的壞法就是卡在這格`)
  assert.equal(productVisibleFilesChanged('abc', 'abc'), false, '同一個 commit 不算變')

  // 同族掃描:release orchestrator 自己的 run() 回的是 { ok, stdout, stderr },沒有 status。
  // 任何地方把它的結果讀成 .status 都會拿到 undefined,判斷恆為真且**完全不報錯**。
  // 掃描前先剝掉註解:解說這個 bug 的註解本身就含 `diff.status`,不剝會永遠紅在自己的說明上。
  const orch = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  for (const m of orch.matchAll(/(?:const|let)\s+(\w+)\s*=\s*run\(/g)) {
    assert.doesNotMatch(orch, new RegExp(`\\b${m[1]}\\.status\\b`),
      `run() 沒有 status 欄位,但 ${m[1]}.status 被讀 —— 這種比較恆為真且靜默`)
  }
  // 對照組:證明這支掃描「該紅的時候會紅」。少了它,上面的迴圈就算永遠找不到變數名也全綠。
  const poisoned = "const diff = run('git', ['x'])\nif (diff.status !== 0) return true"
  let caught = false
  for (const m of poisoned.matchAll(/(?:const|let)\s+(\w+)\s*=\s*run\(/g)) {
    if (new RegExp(`\\b${m[1]}\\.status\\b`).test(poisoned)) caught = true
  }
  assert.ok(caught, '同族掃描對「刻意下毒」的樣本必須紅 —— 不會紅的掃描是零證據')

  console.log('✅ test-release-consent PASS(9 cases + 真實 git 兩面對照 + run() 回傳形狀同族掃描)')
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
