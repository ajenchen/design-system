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
const { classifyConsentPrompt, isQuestionText, loadConsentPolicy } = await import('./lib/release-consent-language.mjs')

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

  // 5c. 用過的授權不能再覆蓋新工作(先前只擋 publish、不擋 merge)。
  //
  //     **2026-09-21 修正語意**:「帳本有一行」不等於「那一版真的發出去了」。
  //     實測那天:帳本寫著 beta.141,而線上既沒有 release、npm 上也沒有東西 —— 發布被中斷。
  //     照帳本算 → 一次失敗的嘗試就燒掉一份授權,使用者得為同一份沒出貨的工作再說一次
  //     「發版」,正是 2026-09-20 要修掉的那件事。所以帳本的每一筆都要對線上實況。
  //     「不同的工作」那一面不靠帳本擋,靠產品指紋擋(上面 5. 已驗)。
  recordConsentRelease('0.1.0-beta.997', second.authorizationId)
  //     注入點回的是**三值狀態**(true / false / null),不是布林 —— 2026-09-22 稽核抓到前一版
  //     的第三面注入 `version => !/^0\.0\.0/.test(version)` 對 beta.997 回 true,跟第一面同一格,
  //     「讀不到」那一面根本沒被表達過。
  assert.equal(
    readReleaseConsent({ branch, headSha: head, releaseLookup: () => true }),
    null,
    '那一版真的發出去了 → 這份授權用掉了,不得再覆蓋後續工作',
  )
  const resumable = readReleaseConsent({ branch, headSha: head, releaseLookup: () => false })
  assert.ok(resumable, '那一版明確沒發出去(被中斷)→ 同一份授權必須還能續,不得逼使用者再說一次')
  assert.equal(resumable.authorizationId, second.authorizationId)
  // 「讀不到」不得當成「沒發出去」:方向必須 fail closed,否則同一份授權可以發第二次。
  assert.equal(
    readReleaseConsent({ branch, headSha: head, releaseLookup: () => null }),
    null,
    '查不到(null)就當成已發(保守)—— 這一面錯了會讓一份授權發兩次',
  )

  // 5d. 條件 / 延後的說法不是「現在就發」。最硬的一格:**SSOT 自己存的那句 user 原話**
  //     (2026-09-02 定義這道閘的句子)先前會被判成 consent 並寫出有效收據。
  for (const bad of ['等我看完預覽再發版', '等我確認過沒問題再發版', '如果 CI 全綠就發版', '明天再發版']) {
    assert.equal(classifyConsentPrompt(bad).verdict, 'deferred', `「${bad}」是條件句,不是現在就發`)
    assert.throws(() => writeReleaseConsent({ headSha: head, branch, quote: bad, source: 'test' }), /不構成發版同意/)
  }
  assert.equal(classifyConsentPrompt(workflow.releaseConsent.userVerbatim).verdict, 'deferred',
    'SSOT 自己的 userVerbatim 被判成 consent = 這道閘在自廢')

  // 5e. 「…做完了就發版」這一類 → **刻意不收進 conditionalMarkers,判 consent**(2026-11-18,規劃 ND1)。
  //     判 consent 的原因只是清單裡沒有它的字,判準不懂條件在誰身上(見 5f)。
  //     fixture 是磁碟上真實出現過的原話:2026-11-17 落地的發版同意收據(授權 ec9208b7)的 quote。
  //     理由與哪些是 AI 推導,寫在 release-consent-language.mjs 函式內第 4 步;保護靠產品指紋(上面 5.)
  //     而不是再問。這格擋的是「依稽核建議改判 → 改回來」的來回,要改判先改這格並寫出新證據。
  const AI_SIDE = '現在該做的任務都做完了就發版'
  assert.equal(classifyConsentPrompt(AI_SIDE).verdict, 'consent',
    `「${AI_SIDE}」不在 conditionalMarkers 裡(ND1 刻意不收),必須判 consent`)
  assert.equal(writeReleaseConsent({ headSha: head, branch, quote: AI_SIDE, source: 'manual-agent' }).quote, AI_SIDE,
    '手動落地(當初那份收據走的路)必須與 hook 同判')
  //     同一格的另一面:句型一樣是「…就發版」、但條件在 user 身上而且命中清單 → deferred(與 5d 同一份判準)。
  //     2026-11-21(工作包 E7,E1 驗證 minor):原本這裡用「等我看完預覽再發版」,和 5d 第一句一字不差,新增覆蓋是零;
  //     換成同句型的「我確認後就發版」,才對照得出「同一句型,條件換到 user 身上就改判」。
  const USER_SIDE_SAME_SHAPE = '我確認後就發版'
  assert.equal(classifyConsentPrompt(USER_SIDE_SAME_SHAPE).verdict, 'deferred',
    `「${USER_SIDE_SAME_SHAPE}」與 5e 同句型(…就發版),條件在 user 身上而且命中清單,不得被一起放寬`)
  //     會紅的對照組:判準若多一條「做完了就」,同一句必須改判 —— 證明這句真的走到條件那一步、
  //     這格量得到判準變動,不是恆綠。只在記憶體裡複製判準,不寫任何檔。
  const livePolicy = loadConsentPolicy()
  const tightened = { ...livePolicy, conditionalMarkers: [...livePolicy.conditionalMarkers, '做完了就'] }
  assert.equal(classifyConsentPrompt(AI_SIDE, tightened).verdict, 'deferred',
    '判準多一條「做完了就」卻沒改判 = 這格量不到判準變動,綠燈是零證據')

  // 5f. 第 4 步「邊界」段列的例句,逐句鎖住**現況**(2026-11-18 起;2026-11-21 工作包 E7 收緊兩面後改期望)。
  //     分界是「有沒有命中 conditionalMarkers 的字面」。這張表斷言的是現況:改了清單,這格會紅 ——
  //     意思是「同步改第 4 步邊界段與這張表」,不是「把清單改回去」(M32:文字宣稱 ≠ 程式真實)。
  const BOUNDARY = [
    // 2026-11-21 收緊:條件在 user 身上或在時間上 → deferred(原本 consent,hook 會寫出有效收據)
    ['改完給我看,我說可以再發版', 'deferred'],
    ['你部署好讓我看,沒問題就發版', 'deferred'],
    ['看完沒問題就發版', 'deferred'],
    ['我看一下沒問題就發版', 'deferred'],
    ['確認沒問題才發版', 'deferred'],
    ['晚點發版', 'deferred'],
    ['下午再發版', 'deferred'],
    ['過兩天發版', 'deferred'],
    // 2026-11-21 放寬:已經看過(「了」)不是條件 → consent(原本 deferred,user 得再講一次)
    ['我看過了,發版', 'consent'],
    ['我看完了，發版', 'consent'],
    // 收緊刻意不吃的已看過說法 → 仍是 consent(E1 驗證提醒:加「沒問題就」會把第一句誤擋)
    ['預覽我看了沒問題就發版', 'consent'],
    ['你給我看的那版沒問題，發版', 'consent'],
    ['我下午看過了，發版', 'consent'],
    ['我說可以就是可以，發版', 'consent'],
    // 這次不動的已知分界(理由在第 4 步邊界段)
    ['CI 綠了就發版', 'consent'], // 與 5d「如果 CI 全綠就發版」意思相同、判定相反
    ['先把剩下的做完再發版', 'deferred'],
    ['如果都做完了就發版', 'deferred'],
  ]
  for (const [text, now] of BOUNDARY) {
    assert.equal(classifyConsentPrompt(text).verdict, now,
      `「${text}」的判定與 release-consent-language.mjs 第 4 步邊界段寫的不同 —— 改了清單就要一起改那段與這張表`)
  }
  //     會紅的對照組(只在記憶體裡複製判準,不寫檔):每一條新補的詞拿掉,它負責的那一句必須改判回 consent ——
  //     證明這張表量得到每一條詞,不是其中一條就讓整張表恆綠;5e 那句在每一種拿掉的版本下都必須仍是 consent(ND1)。
  const withoutMarker = (marker) => ({ ...livePolicy, conditionalMarkers: livePolicy.conditionalMarkers.filter((item) => item !== marker) })
  const MARKER_ANCHORS = [
    ['給我看(?!的|過)', '改完給我看,發版'],
    ['讓我看(?!的|過)', '你部署好讓我看,沒問題就發版'],
    ['我說(可以|OK|ok|好)(再|才|之後|後|就發)', '改好我說可以再發版'],
    ['看(完|一下)(?!了).{0,4}(沒問題|沒有問題|OK|ok).{0,2}(就|再|才)', '看完沒問題就發版'],
    ['沒(有)?問題才', '確認沒問題才發版'],
    ['(下午|晚上|今晚|明早|晚點|晚一點|待會|稍後|等一下|改天|下週|下禮拜|過兩天|過幾天).{0,3}(發版|發布|發佈)', '晚點發版'],
  ]
  for (const [marker, anchor] of MARKER_ANCHORS) {
    assert.ok(livePolicy.conditionalMarkers.includes(marker), `清單裡沒有「${marker}」—— 這張對照表跟 release-workflow.json 漂移了`)
    assert.equal(classifyConsentPrompt(anchor).verdict, 'deferred', `「${anchor}」現在應判 deferred`)
    assert.equal(classifyConsentPrompt(anchor, withoutMarker(marker)).verdict, 'consent',
      `拿掉「${marker}」之後「${anchor}」沒有改判 = 這一條詞量不到,綠燈是零證據`)
    assert.equal(classifyConsentPrompt(AI_SIDE, withoutMarker(marker)).verdict, 'consent', '5e 那一類不得被任何一條詞牽動(ND1)')
  }
  //     「了」那一面的對照:換回沒有 (?!了) 的舊寫法,「我看過了,發版」必須改判回 deferred。
  const looseSeen = { ...livePolicy, conditionalMarkers: livePolicy.conditionalMarkers.map((item) => (item === '我看過(?!了)' ? '我看過' : item)) }
  assert.equal(classifyConsentPrompt('我看過了,發版', looseSeen).verdict, 'deferred',
    '換回舊的「我看過」卻沒改判 = 這格量不到「已看過」那一面')

  // 5g. 磁碟上 user 真的說過、與「要不要發版」同形狀的話(2026-09-27 到 11-20 的 session transcript,逐字;時間為 UTC)。
  //     2026-11-21 收緊兩面時,掃出的 17 則含發版 / 發布字樣的 user 訊息判定全部沒變;這 10 句逐句鎖住,
  //     之後再改清單,任何一句被改判都會紅(要改先拿新證據改這張表)。
  const REAL_USER = [
    ['2026-09-27T05:45:24Z(末句)', '我猜上述可能你都已經確認好了，總之確保確認好之後就發版', 'consent'],
    ['2026-09-30T00:27:02Z', '發版', 'consent'],
    ['2026-11-05T14:48:56Z', '到底為何會這麼久？以前都不需要這麼久啊\n而且我他媽因為額度的關係已經好幾個禮拜都沒有發版\n就是因為你消耗了超多token每次都沒有把事情做完就用光了\n到底是什麼毛病？', 'question'],
    ['2026-11-05T15:14:47Z', '所以確定這樣的流程修正之後真的有發版的可能？', 'question'],
    ['2026-11-06T11:18:41Z', '已經使用94%兩，可以發版嗎？', 'question'],
    ['2026-11-06T11:19:35Z', '已經用了94%還能發版完成的話就發版', 'consent'],
    ['2026-11-06T11:21:07Z', '所有下週該做的事情都有整理好？等發版完之後下週就能夠無縫接軌？', 'question'],
    ['2026-11-17T11:42:05Z', '現在該做的任務都做完了就發版', 'consent'],
    ['2026-11-19T00:44:45Z', '另外想確認，之前跟你提到的發版 release note的部分已經做了嗎？還是在待辦？', 'question'],
    ['2026-11-20T01:44:11Z', '大概還要多久才可以做完全部的東西並發版', 'deferred'],
  ]
  for (const [when, text, verdict] of REAL_USER) {
    assert.equal(classifyConsentPrompt(text).verdict, verdict, `user ${when} 的原話判定變了:「${text}」`)
  }

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

  // ── 出處:hook 落地 vs agent 落地必須分得出來(2026-09-21)──────────────────────
  // 兩條路以前都寫死 'manual',收據上看不出哪一條。前者是 user 當場打進對話的字,
  // 後者是 agent **宣稱** user 說過 —— 可信度天差地遠,而磁碟上 14 筆有 10 筆是後者。
  {
    const fromHook = writeReleaseConsent({ headSha: head, branch, quote: '發版', source: 'hook-user-prompt' })
    assert.equal(fromHook.source, 'hook-user-prompt', 'hook 落地要記成 hook 落地')
    const fromAgent = writeReleaseConsent({ headSha: head, branch, quote: '發版', source: 'manual-agent' })
    assert.equal(fromAgent.source, 'manual-agent', 'agent 落地要記成 agent 落地')
    // 不指明、亂指明,一律降級成可信度較低的那一種 —— 不得冒充成 user 親手打的
    for (const bogus of [undefined, null, '', 'manual', 'test', 'hook', '我自己掰的']) {
      const r = writeReleaseConsent({ headSha: head, branch, quote: '發版', source: bogus })
      assert.equal(r.source, 'manual-agent', `來源 ${JSON.stringify(bogus)} 不得被當成 hook 落地`)
    }
    // 執行面對照:hook 真的有把出處傳下去,否則上面全是空談
    const hookSource = readFileSync(resolve(ROOT, 'packages/design-system/ds-canonical/hooks/record_release_consent.sh'), 'utf8')
    assert.match(hookSource, /consent --quote "\$PROMPT" --branch "\$BRANCH" --source hook-user-prompt/,
      'hook 必須自報出處,否則它落地的收據會被降級成 agent 落地')
    const orchSource = readFileSync(resolve(ROOT, 'scripts/release-orchestrator.mjs'), 'utf8')
    assert.match(orchSource, /source: options\.source/, 'CLI 必須把 --source 傳給 writeReleaseConsent')
    assert.doesNotMatch(orchSource, /source: 'manual'/, "不得再寫死 'manual' —— 那正是兩條路分不出來的原因")
  }

  // 2026-11-21 PROC-H:問句判準只有 isQuestionText 一份(同意第 6 步與 UserPromptSubmit「先回一句」共用)。
  // 兩面對照:問句記號 / A-不-A 要認得;陳述句不能誤認;沒有記號的問句是已知缺口(鎖住現況,改要連同意判準一起看)。
  for (const q of ['確定所有時間都花得有意義?', '這樣可以嗎', '要不要先跑測試', '能不能先停一下', '是否要重跑？']) {
    assert.equal(isQuestionText(q), true, `「${q}」是問句`)
  }
  for (const statement of ['把 sidebar 的間距改成 16', '發版', '全部做完再回報']) {
    assert.equal(isQuestionText(statement), false, `「${statement}」不是問句`)
  }
  assert.equal(isQuestionText('大概還要多久'), false, '沒有問句記號的問句目前認不到(已知缺口,見 isQuestionText 註解)')
  // 第 6 步改用 isQuestionText 之後,同意判定不變:問號 + 同意詞仍是 question,A-不-A + 同意詞仍在第 2 步攔下
  assert.equal(classifyConsentPrompt('可以發版了嗎?').verdict, 'question')
  assert.equal(classifyConsentPrompt('要不要發版').verdict, 'question')
  {
    const cli = (args, input) => execFileSync(process.execPath, [resolve(ROOT, 'scripts/lib/release-consent-language.mjs'), ...args], { input, encoding: 'utf8' })
    assert.equal(cli(['--question'], '這樣可以嗎'), 'question\n')
    assert.equal(cli(['--question'], '把間距改成 16'), 'statement\n')
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
