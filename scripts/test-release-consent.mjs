#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 發版同意閘真的會擋 —— 沒有有效同意時 merge 停在 awaiting-consent;而**有**同意時
 *         不會因為換了 commit 或換了分支就失效(那正是 user 被迫重講「發版」的原因)
 *   紅: 同意刪掉 / 換成別份產品內容 / 拿問句或否定去手動落地 → 必須被拒絕
 *   綠: 同一份產品內容的同意,在不同分支、不同 commit 上都必須成立;
 *       且本檔全程寫在沙箱,跑完要驗**真 repo 的同意收據一個位元都沒動**
 *
 * 2026-09-20 兩次改版:綁 commit → 綁分支 → 綁 **user 看過並認可的預覽內容**。
 * 前兩者都是 agent 切工作的單位,不是 user 授權的單位;改綁分支之後開一條新分支又要重講,
 * 問題只是換地方發作。理由與判準 SSOT 見 infra/governance/release-workflow.json。
 *
 * 本檔**絕不寫真實收據目錄**:先前版本在 finally 裡 rmSync 整個目錄,加上 hook 測試沒有
 * mktemp 守衛,一天之內把 user 真正的同意收據清掉三次。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REAL_DIR = resolve(ROOT, '.git/governance-runtime/release-consent')
const snapshotReal = () => (existsSync(REAL_DIR)
  ? readdirSync(REAL_DIR).sort().map(f => `${f}:${readFileSync(resolve(REAL_DIR, f), 'utf8').length}`).join('|')
  : '(不存在)')
const realBefore = snapshotReal()

// 沙箱:所有寫入導到這裡。必須在 import orchestrator **之前**設好 —— CONSENT_DIR 在模組載入時決定。
const SANDBOX = mkdtempSync(join(tmpdir(), 'release-consent-test-'))
process.env.GOVERNANCE_RELEASE_CONSENT_DIR = resolve(SANDBOX, 'consent')
mkdirSync(process.env.GOVERNANCE_RELEASE_CONSENT_DIR, { recursive: true })

const {
  buildFiveStepStatus, consentCoversHead, loadReleaseWorkflow, previewUrls,
  productContentDigest, productVisibleFilesChanged, readReleaseConsent,
  consentReleaseLedger, recordConsentRelease, withdrawReleaseConsent, writeReleaseConsent,
} = await import('./release-orchestrator.mjs')
const { classifyConsentPrompt } = await import('./lib/release-consent-language.mjs')

const workflow = loadReleaseWorkflow()
const sha = 'f'.repeat(40)
const other = 'e'.repeat(40)
const CURRENT = resolve(process.env.GOVERNANCE_RELEASE_CONSENT_DIR, 'current.json')
const base = {
  repository: 'ajenchen/design-system', branch: 'claude/x', headSha: sha, protectedMainSha: other, onProtectedMain: false,
  version: '0.1.0-beta.999', tag: 'v0.1.0-beta.999',
  pullRequest: { number: 999, state: 'OPEN', headRefOid: sha, requiredChecks: [{ state: 'SUCCESS', conclusion: 'SUCCESS', status: 'COMPLETED' }] },
  release: null, releaseCommitSha: null, publishRun: null, npmPackages: [], consumers: [],
}
const mergeStatus = over => buildFiveStepStatus(workflow, { ...base, ...over }).find(s => s.id === 'merge').status

try {
  assert.equal(workflow.releaseConsent?.required, true)
  assert.equal(workflow.steps.find(s => s.id === 'merge').gate, 'user-release-consent')

  // 1. 沒有 receipt → 擋住(2026-09-02 事故那一格)
  assert.equal(mergeStatus({ releaseConsent: readReleaseConsent({ branch: 'claude/x', headSha: sha }) }), 'awaiting-consent')

  // 固定值,不取真實 repo 的當前分支 —— 那會讓測試的成敗取決於 checkout 狀態
  //(2026-09-20:收尾時切到 main,測試就撞上「不在 main 記錄同意」而紅)。
  // branch 在 v3 只是出處紀錄,測試要的只是「一個不是 main 的分支名」。
  const branch = 'claude/test-fixture-branch'
  const head = execFileSync('git', ['rev-parse', 'HEAD^{commit}'], { cwd: ROOT, encoding: 'utf8' }).trim()

  // 2. 手動落地必須套用與 hook 相同的判準 —— 問句與否定一律拒絕。
  //    先前這條路一條檢查都沒有,而磁碟上 14 筆收據有 10 筆走它 = agent 自我認證。
  for (const bad of ['要不要發版?', '現在可以發版嗎?', '先不要發版', '今天天氣不錯']) {
    assert.throws(() => writeReleaseConsent({ headSha: head, branch, quote: bad, source: 'test' }),
      /不構成發版同意/, `「${bad}」不得被手動落地成同意`)
  }

  // 3. user 明確表示早就同意過(帶問號)→ 必須受理。把它當問句丟掉正是他暴怒的原因。
  const receipt = writeReleaseConsent({ headSha: head, branch, quote: '我他媽到底要講幾次發版?', source: 'test' })
  assert.equal(receipt.schemaVersion, 3)
  assert.match(receipt.productDigest, /^[0-9a-f]{64}$/)
  // 帳本不再存在收據裡(2026-09-21 搬到收據外的 append-only 檔,以 authorizationId 對照),
  // 改驗「這份新授權底下還沒發過任何版本」。
  assert.match(receipt.authorizationId, /^[0-9a-f-]{36}$/)
  assert.deepEqual(consentReleaseLedger(receipt.authorizationId), [])

  // 3b. **detached HEAD**(CI 的常態)必須仍能落地 —— branch 在 v3 只是出處紀錄。
  //     2026-09-20:硬性要求 branch 非空是 v2 殘留,CI 上 `git branch --show-current` 回空字串,
  //     於是收據寫不出來、hooks-linux 六格紅,而本機永遠在一條有名字的分支上所以全綠。
  //     這一格就是「本機測不到的那一面」。
  for (const detached of ['', undefined, null]) {
    const r = writeReleaseConsent({ headSha: head, branch: detached, quote: '發版', source: 'test' })
    assert.equal(r.branch, null, 'detached 時 branch 記成 null,不假裝知道')
    assert.match(r.productDigest, /^[0-9a-f]{64}$/)
    assert.ok(readReleaseConsent({ branch: undefined, headSha: head }), 'detached 落地的同意必須讀得回來')
  }
  // 「不在 main 上記錄同意」這條防線仍在
  assert.throws(() => writeReleaseConsent({ headSha: head, branch: 'main', quote: '發版', source: 'test' }), /never recorded on main/)

  // 4. 同一份預覽內容:**換分支、換 commit 都仍然成立**(本次修正的重點)
  for (const b of ['claude/完全不同的分支', 'main', undefined]) {
    assert.ok(readReleaseConsent({ branch: b, headSha: head }), `分支「${b}」不該讓同意失效`)
  }
  assert.equal(mergeStatus({ releaseConsent: readReleaseConsent({ branch, headSha: head }) }), 'pending')

  // 5. 預覽內容變了 → 必須重新確認(安全面)
  assert.equal(consentCoversHead({ receipt, branch, headSha: head, currentProductDigest: '0'.repeat(64) }).ok, false)
  assert.equal(consentCoversHead({ receipt, branch, headSha: head, currentProductDigest: null }).ok, false, '算不出指紋要保守')

  // 5b. 「一份授權一次發布」的帳本,綁的是**落地當下鑄造的 authorizationId**,
  //     不是原話、也不是產品指紋。我前兩版都用代理,而且第二版**已經上膛**:
  //     user 說的就是 canonical 規定的那兩個字「發版」,磁碟上已有 5 份同雜湊的收據,
  //     他下一次說「發版」帳本不會歸零 → publish 被自己請來的閘擋死。
  //     fixture 就用那兩個字,兩面都要成立:
  const SAME = '發版'
  const first = writeReleaseConsent({ headSha: head, branch, quote: SAME, source: 'test' })
  assert.match(first.authorizationId, /^[0-9a-f-]{36}$/, '每次落地都要鑄一個與文字無關的授權 id')
  recordConsentRelease('0.1.0-beta.998')
  assert.deepEqual(consentReleaseLedger(first.authorizationId), ['0.1.0-beta.998'])
  const second = writeReleaseConsent({ headSha: head, branch, quote: SAME, source: 'test' })
  assert.notEqual(second.authorizationId, first.authorizationId, '再說一次就是新的一次授權')
  assert.deepEqual(consentReleaseLedger(second.authorizationId), [],
    '**同樣的兩個字「發版」,第二次必須歸零** —— 否則 user 會被自己請來的閘擋死')
  assert.deepEqual(consentReleaseLedger(first.authorizationId), ['0.1.0-beta.998'],
    '重寫收據不得清掉別人那份授權的帳')

  // 5c. 用過的授權不能再覆蓋新工作(先前只擋 publish、不擋 merge)
  recordConsentRelease('0.1.0-beta.997', second.authorizationId)
  assert.equal(readReleaseConsent({ branch, headSha: head }), null,
    '這份同意已經用掉了,不該再讓後續完全不同的工作直接合併')

  // 5d. 條件 / 延後的說法不是「現在就發」。最硬的一格:**SSOT 自己存的那句 user 原話**
  //     (2026-09-02 定義這道閘的句子)先前會被判成 consent 並寫出有效收據。
  for (const bad of ['等我看完預覽再發版', '等我確認過沒問題再發版', '如果 CI 全綠就發版', '明天再發版']) {
    assert.equal(classifyConsentPrompt(bad).verdict, 'deferred', `「${bad}」是條件句,不是現在就發`)
    assert.throws(() => writeReleaseConsent({ headSha: head, branch, quote: bad, source: 'test' }), /不構成發版同意/)
  }
  assert.equal(classifyConsentPrompt(workflow.releaseConsent.userVerbatim).verdict, 'deferred',
    'SSOT 自己的 userVerbatim 被判成 consent = 這道閘在自廢')

  // 重新落地一份乾淨的同意,讓後面的格子有東西可用
  writeReleaseConsent({ headSha: head, branch, quote: '發版', source: 'test' })

  // 6. 撤回必須讓**讀取端**真的不認。只刪 current.json、讀取端仍 fallback 到
  //    branch__<分支>.json 的話,印了「已撤回」其實沒撤回(2026-09-20 實際破口)。
  writeFileSync(resolve(process.env.GOVERNANCE_RELEASE_CONSENT_DIR, `branch__${branch.replace(/[^A-Za-z0-9._-]/g, '_')}.json`),
    JSON.stringify({ schemaVersion: 2, branch, consentedHeadSha: head, quote: '發版' }))
  withdrawReleaseConsent({ branch, headSha: head })
  assert.equal(readReleaseConsent({ branch, headSha: head }), null, '撤回後讀取端不得再認任何一份收據')
  assert.ok(!existsSync(CURRENT))

  // 7. 已合併不回頭要 receipt(避免把閘變成永久死鎖)
  assert.equal(mergeStatus({ pullRequest: { ...base.pullRequest, state: 'MERGED' }, releaseConsent: null }), 'complete')

  // 8. 判準只有一份:hook 與手動落地必須得到相同判定
  for (const [text, want] of [['發版', 'consent'], ['要不要發版?', 'question'], ['先不要發版', 'withdraw'], ['今天天氣不錯', 'none'], ['發版吧,但不要發生問題', 'consent']]) {
    assert.equal(classifyConsentPrompt(text).verdict, want, `「${text}」判定不符`)
  }

  // 9. 「預覽看得見」的判定用真實 git 歷史兩面對照 —— 找不到對照組就 fail,不得空跑當綠
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim()
  assert.match(productContentDigest('HEAD') || '', /^[0-9a-f]{64}$/, '產品內容指紋必須算得出來')
  let withProduct = null
  let withoutProduct = null
  for (const s of git('log', '-n', '400', '--no-merges', '--format=%H').split('\n')) {
    if (!s) continue
    let files
    try { files = git('diff', '--name-only', `${s}^`, s).split('\n').filter(Boolean) } catch { continue }
    if (!files.length) continue
    const touches = files.some(f => /^packages\/[^/]+\/src\/.*\.(tsx?|jsx?|css|mdx)$/.test(f)
      || /^\.storybook\/.*\.(tsx?|jsx?|css|mdx)$/.test(f) || /^apps\/.*\.stories\.(tsx?|mdx)$/.test(f))
    if (touches && !withProduct) withProduct = s
    if (!touches && !withoutProduct) withoutProduct = s
    if (withProduct && withoutProduct) break
  }
  assert.ok(withProduct && withoutProduct, '近 400 個 commit 湊不出兩面對照組,本測試無法成立')
  assert.equal(productVisibleFilesChanged(`${withProduct}^`, withProduct), true)
  assert.equal(productVisibleFilesChanged(`${withoutProduct}^`, withoutProduct), false,
    '沒動產品檔卻判成「變了」= 恆為真的壞法,同意會在每個新 commit 失效')

  // 10. run() 回 { ok, stdout, stderr } 沒有 status;讀 .status 恆為真且靜默
  const orch = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  for (const m of orch.matchAll(/(?:const|let)\s+(\w+)\s*=\s*run\(/g)) {
    assert.doesNotMatch(orch, new RegExp(`\\b${m[1]}\\.status\\b`), `run() 沒有 status,但 ${m[1]}.status 被讀`)
  }

  const urls = previewUrls(workflow, base)
  assert.ok(urls[0].includes('deploy-preview-999--ajenchen-design-system.netlify.app'))
  assert.ok(urls[1].includes('claude-x--ajenchen-design-system.netlify.app'))
  console.log('✅ test-release-consent PASS(同意綁預覽內容;手動落地套用同一判準;撤回真的撤回;全程沙箱)')
} finally {
  rmSync(SANDBOX, { recursive: true, force: true })
  // 對照組:本測試跑完,真實收據必須一個位元都沒動。
  assert.equal(snapshotReal(), realBefore, '本測試不得動到真實的發版同意收據')
}
