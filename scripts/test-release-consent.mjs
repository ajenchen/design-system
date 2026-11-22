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

  // 5h. 不是同意的兩類(2026-11-21,工作包 RC-LANG-FP;E7 實作者回報、E7 審查實測,先前除「不要發版」外每一句都判 consent,
  //     hook 與手動落地都會寫出有效收據):(a) 只是提到發版 / 發布;(b) 否定 / 延後。
  //     (a) 的兩句是 user 真實原話全文(session 1920833e transcript 的 user 訊息,逐字;時間為 UTC),另附規格給的最小片段。
  const REAL_0926 = '確保所有包括自上次發版後的異動都是追根究柢的增刪改，該SSOT的部分都有確保SSOT,所有內容都有符合我們一致的設計語言且不違背世界級的設計，整個ds沒有漂移,確保所有相關問題都有一併被修正，然後確保沒有改壞任何原本好的地方，都有透過可驗證的方式自行驗證到完整完美，包括視覺稽查，確保所有都合乎我的要求'
  const REAL_1027 = '你繼續處理該處理的任務\n但總覺得關於Q4應該好像還是選‘乙：還原已發布的 Button tertiary xs（24、有框白底）。好處：長相、位置全部回到以前；跟同一列的 ⋯ 列操作同樣是 24。\'\n原因在於cell一般狀態hover時其實本來就跟field control hover時是不同的交互（一個是edit按鈕hover時才出現來確保好點擊，一個是edit按鈕本來就是常駐的），那應該也沒有必要要長得一樣吧,此外標頭用inline action是因為標頭的動作本來就比較次要，但是table body cell是主內容本來就可以比較強調其中的動作吧，而且也可以讓同一個row的action看起來都是視覺一致的'
  const NOT_CONSENT = [
    ['user 2026-09-26T15:06:17Z 全文', REAL_0926, 'mention'],
    ['user 2026-10-27T16:26:13Z 全文', REAL_1027, 'mention'],
    ['最小片段', '確保所有包括自上次發版後的異動', 'mention'],
    ['最小片段', '還原已發布的 Button tertiary xs', 'mention'],
    ['否定', '先不發版', 'withdraw'],
    ['否定', '這次不發版', 'withdraw'],
    ['延後', '延後發版', 'withdraw'],
    ['否定', '還不能發版', 'withdraw'],
    ['否定', '不要發版', 'withdraw'],
  ]
  for (const [label, text, verdict] of NOT_CONSENT) {
    assert.equal(classifyConsentPrompt(text).verdict, verdict, `${label}「${text.slice(0, 40)}」必須判 ${verdict},不得判成同意`)
    assert.throws(() => writeReleaseConsent({ headSha: head, branch, quote: text, source: 'manual-agent' }), /不構成發版同意/,
      `${label}「${text.slice(0, 40)}」不得被手動落地成同意`)
  }
  //     另一面:對發版的明確同意照舊(5e、5f、5g 另有鎖;這裡補單獨一詞與 N1 預期回覆「可以改，發版」,全形 / 半形逗號各一)。
  for (const text of ['發版', '可以改，發版', '可以改,發版']) {
    assert.equal(classifyConsentPrompt(text).verdict, 'consent', `「${text}」是明確同意,不得被這次的修正擋掉`)
  }
  //     否定句帶問號 → 判問句,不撤回(「還不能發版嗎？」是在催,不是在收回同意);A-不-A 照舊。
  for (const text of ['還不能發版嗎？', '為什麼不發版？', '需不需要發版？']) {
    assert.equal(classifyConsentPrompt(text).verdict, 'question', `「${text}」是問句,不得當成撤回`)
  }
  //     刻意保守、已知會擋到的(release-consent-language.mjs 第 7 步寫明):同意詞後面直接接受詞 → mention,hook 會出聲。
  assert.equal(classifyConsentPrompt('發版到 npm').verdict, 'mention')
  //     「發版 謝謝」「發版 OK」這類同意詞後面只接禮貌 / 附和詞的,2026-11-22 起判 consent(下方 5i)。

  //     句尾的引號 / 括號、刪節號、emoji、訊息最後的冒號都算句尾(RC-LANG-FP 規格核對必修 2)。
  //     hook 對 mention 印「若這是要我發版,直接說「發版」即可」;user 照著連引號打「發版」若仍判 mention,就永遠落不了地。
  //     這些 base f87872c8 都判 consent,第一版 RC-LANG-FP 誤改成 mention。
  const CLOSING_CONSENT = ['「發版」', '"發版"', '（發版）', '發版…', '發版🙏', 'OK，發版🚀', '可以改，發版🙏', '發版：']
  for (const text of CLOSING_CONSENT) {
    assert.equal(classifyConsentPrompt(text).verdict, 'consent', `「${text}」是明確同意(收尾符號不是在接受詞),不得判成只是提到`)
  }
  //     另一面:收尾符號後面還接著字、或開括號接受詞,仍是只是提到。
  for (const text of ['「發版」流程', '發版（beta.140）', '發版：beta.140 已上線']) {
    assert.equal(classifyConsentPrompt(text).verdict, 'mention', `「${text}」後面還接著字,不是在指示現在發版`)
  }

  //     會紅的對照組(只在記憶體裡複製判準,不寫檔):
  //     (a) 兩份清單一起拿掉(句尾條件換成「什麼都算」、前綴換成永不命中)→ 提到的句子必須改判回 consent,
  //         證明擋下它們的是第 7 步、不是別的步驟;再逐條拿掉前綴、單獨放寬句尾條件,各自負責的那一句必須改判。
  const NEVER = '(?!)'
  const noMentionStep = { ...livePolicy, mentionPrefixes: [NEVER], directiveEndings: [''] }
  for (const [label, text, verdict] of NOT_CONSENT.filter(([, , v]) => v === 'mention')) {
    assert.equal(classifyConsentPrompt(text, noMentionStep).verdict, 'consent',
      `拿掉第 7 步的兩份清單後 ${label} 沒有改判回 consent = 這格量不到第 7 步`)
  }
  assert.equal(classifyConsentPrompt('發版流程太慢了', { ...livePolicy, directiveEndings: [''] }).verdict, 'consent',
    '句尾條件放寬成「什麼都算」卻沒改判 = directiveEndings 量不到')
  //     換回第一版 RC-LANG-FP 的句尾條件(只收句尾 / 標點 / 語助詞)→ 上面那幾句收尾符號的同意必須改判回 mention,
  //     證明讓它們成立的是這次放寬的收尾符號,不是別的步驟。
  const FIRST_ENDINGS = { ...livePolicy, directiveEndings: ['\\s*([吧啦了囉嘍喔哦唷呀啊咯～~]\\s*)*($|[，,。．.！!；;、\\n])'] }
  for (const text of CLOSING_CONSENT) {
    assert.equal(classifyConsentPrompt(text, FIRST_ENDINGS).verdict, 'mention', `換回第一版句尾條件後「${text}」沒有改判 = 這格量不到收尾符號`)
  }
  const PREFIX_ANCHORS = [
    ['(上|下|前|每)一?(次|回)', '上次發版。'],
    ['已經?', '已經發版了'],
    ['曾經?', '曾經發版。'],
    ['未', '尚未發布。'],
    ['沒有?', '還沒發版。'],
  ]
  for (const [prefix, anchor] of PREFIX_ANCHORS) {
    assert.ok(livePolicy.mentionPrefixes.includes(prefix), `清單裡沒有「${prefix}」—— 這張對照表跟 release-workflow.json 漂移了`)
    assert.equal(classifyConsentPrompt(anchor).verdict, 'mention', `「${anchor}」現在應判 mention`)
    const without = { ...livePolicy, mentionPrefixes: livePolicy.mentionPrefixes.filter((item) => item !== prefix) }
    assert.equal(classifyConsentPrompt(anchor, without).verdict, 'consent', `拿掉「${prefix}」之後「${anchor}」沒有改判 = 這一條量不到`)
  }
  //     (b) 逐條拿掉新補的否定詞,它負責的那一句必須改判(前三條回到 consent;「發版延後」沒有句尾,回到 mention)。
  const DENIAL_ANCHORS = [
    ['(?<![發要能可該需准必])不(發版|發布|發佈)(?![^。！!\\n]*[?？嗎])', '這次不發版', 'consent'],
    ['(?<![發要能可該需准必])不(要先|能|可以|准|該|應該|需要|必)(發版|發布|發佈)(?![^。！!\\n]*[?？嗎])', '還不能發版', 'consent'],
    ['(延後|延遲|推遲|延期|暫緩|取消)(發版|發布|發佈)(?![^。！!\\n]*[?？嗎])', '延後發版', 'consent'],
    ['(發版|發布|發佈)(先|就|要)?(延後|延遲|推遲|延期|暫緩|取消)(?![^。！!\\n]*[?？嗎])', '發版延後', 'mention'],
  ]
  for (const [marker, anchor, fallback] of DENIAL_ANCHORS) {
    assert.ok(livePolicy.denialMarkers.includes(marker), `清單裡沒有「${marker}」—— 這張對照表跟 release-workflow.json 漂移了`)
    assert.equal(classifyConsentPrompt(anchor).verdict, 'withdraw', `「${anchor}」現在應判 withdraw`)
    const without = { ...livePolicy, denialMarkers: livePolicy.denialMarkers.filter((item) => item !== marker) }
    assert.equal(classifyConsentPrompt(anchor, without).verdict, fallback, `拿掉「${marker}」之後「${anchor}」沒有改判 = 這一條量不到`)
  }

  // 5i. 同意詞後面只接空白 / 標點 + 禮貌或附和詞,再到句尾 → consent(2026-11-22,工作包 N1-PREP;帳本 J-b989803a2d)。
  //     RC-LANG-FP 之後這幾句判 mention:hook 不落地、請 user 再說一次「發版」—— user 明說過不要一再要他說
  //     (governance/memory/feedback_solo_dev_workflow.md:12)。詞表住 release-workflow.json 的 courtesyTails,比對不分大小寫;
  //     判準把這些詞當成同意詞與句尾之間的語助詞(release-consent-language.mjs 第 7 步)。前三句是規格給的主線實測句。
  const COURTESY_CONSENT = [
    '可以改，發版 謝謝', '發版 謝謝', '發版 OK', '發版 ok', '發版謝謝', '發版 好的', '發版 好', '發版 Thanks!', '發版 thank you',
    '發版 thx', 'ship it thx', '發版 感謝', '發版 謝了', '發版 謝啦', '發版 謝謝你', '發版 謝謝您', '發版 OK 謝謝', '發版 👍 謝謝', '「發版」 謝謝',
  ]
  for (const text of COURTESY_CONSENT) {
    assert.equal(classifyConsentPrompt(text).verdict, 'consent', `「${text}」同意詞後面只接禮貌 / 附和詞,是明確同意,不得判成只是提到`)
  }
  assert.equal(writeReleaseConsent({ headSha: head, branch, quote: '發版 謝謝', source: 'manual-agent' }).quote, '發版 謝謝',
    '手動落地必須與 hook 同判(同一支判準)')
  //     標點隔開的本來就判 consent(句尾是標點);同意詞後面接 emoji 本來就算句尾(directiveEndings),不靠詞表 —— 照舊。
  for (const text of ['可以改，發版', '可以改，發版，謝謝', '可以改，發版。謝謝', '發版！', '發版 👍']) {
    assert.equal(classifyConsentPrompt(text).verdict, 'consent', `「${text}」是明確同意`)
  }
  //     另一面:同意詞後面接的不只是禮貌詞,或句子另有否定 / 條件 / 問句 / 前綴 → 照舊不是同意。
  const COURTESY_NOT_CONSENT = [
    ['發版 謝謝你們之前的幫忙,但先不要', 'mention'], // 「謝謝」後面還接著字,不是句尾
    ['發版 好像有問題', 'mention'],
    ['發布好的版本', 'mention'],
    ['發版到 npm 謝謝', 'mention'], // 同意詞後面先接受詞(RC-LANG-FP 刻意保守那一類),禮貌詞不改變它
    ['上次發版 謝謝', 'mention'], // 前綴「上次」照舊
    ['上次發版後改了什麼', 'mention'],
    ['發版 謝謝，但先不要發版', 'withdraw'],
    ['發版 謝謝，等我看完再說', 'deferred'],
    ['發版 OK 了嗎', 'question'],
    ['先不發版', 'withdraw'],
    ['還不能發版嗎？', 'question'],
  ]
  for (const [text, verdict] of COURTESY_NOT_CONSENT) {
    assert.equal(classifyConsentPrompt(text).verdict, verdict, `「${text}」必須判 ${verdict}`)
  }
  //     會紅的對照組(只在記憶體裡複製判準,不寫檔):
  //     (a) 詞表清空 → 上面每一句改判回 mention,證明讓它們成立的是這份詞表、不是別的步驟;
  const noCourtesy = { ...livePolicy, courtesyTails: [] }
  for (const text of COURTESY_CONSENT) {
    assert.equal(classifyConsentPrompt(text, noCourtesy).verdict, 'mention', `清空 courtesyTails 後「${text}」沒有改判 = 這格量不到詞表`)
  }
  //     (b) 逐條拿掉詞,它負責的那一句必須改判回 mention(每一條都量得到,不是其中一條就讓整張表恆綠);
  const COURTESY_ANCHORS = [
    ['謝謝', '發版 謝謝'], ['謝謝你', '發版 謝謝你'], ['謝謝您', '發版 謝謝您'], ['感謝', '發版 感謝'], ['謝了', '發版 謝了'],
    ['謝啦', '發版 謝啦'], ['thanks', '發版 Thanks!'], ['thank you', '發版 thank you'], ['thx', 'ship it thx'], ['ok', '發版 OK'],
    ['好', '發版 好'], ['好的', '發版 好的'],
  ]
  for (const [word, anchor] of COURTESY_ANCHORS) {
    assert.ok(livePolicy.courtesyTails.includes(word), `清單裡沒有「${word}」—— 這張對照表跟 release-workflow.json 漂移了`)
    const without = { ...livePolicy, courtesyTails: livePolicy.courtesyTails.filter((item) => item !== word) }
    assert.equal(classifyConsentPrompt(anchor, without).verdict, 'mention', `拿掉「${word}」之後「${anchor}」沒有改判 = 這一條量不到`)
  }
  //     (c) RC-LANG-FP 與先前鎖住的每一句(只是提到 / 否定 / 延後 / 條件 / 問句 / user 原話)在有沒有詞表時判定逐句相同 ——
  //         這次只把「同意詞後面只接禮貌詞」從 mention 改成 consent,沒有動到其他任何一格。
  const LOCKED_BEFORE = [
    ...NOT_CONSENT.map(([, text]) => text), ...BOUNDARY.map(([text]) => text), ...REAL_USER.map(([, text]) => text),
    '「發版」流程', '發版（beta.140）', '發版：beta.140 已上線', '發版到 npm', '還不能發版嗎？', '為什麼不發版？', '需不需要發版？',
    ...CLOSING_CONSENT, AI_SIDE, USER_SIDE_SAME_SHAPE, workflow.releaseConsent.userVerbatim,
  ]
  for (const text of LOCKED_BEFORE) {
    assert.equal(classifyConsentPrompt(text).verdict, classifyConsentPrompt(text, noCourtesy).verdict,
      `「${text.slice(0, 40)}」的判定被 courtesyTails 牽動了 —— 這次只該改「同意詞後面只接禮貌詞」那一類`)
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

  // 2026-11-21 PROC-H:同意第 6 步與 UserPromptSubmit「先回一句」共用 isQuestionText(repo 裡另有兩份問句判斷,見它的註解)。
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
  // `--question` 命令列的端到端(hook 真的呼叫到它)由 hooks/tests/test_check_propose_without_benchmark.sh Test 7–12 跑。

  const urls = previewUrls(workflow, base)
  assert.ok(urls[0].includes('deploy-preview-999--ajenchen-design-system.netlify.app'))
  assert.ok(urls[1].includes('claude-x--ajenchen-design-system.netlify.app'))
  console.log('✅ test-release-consent PASS(同意綁預覽內容;手動落地套用同一判準;撤回真的撤回;全程沙箱)')
} finally {
  rmSync(SANDBOX, { recursive: true, force: true })
  // 對照組:本測試跑完,真實收據必須一個位元都沒動。
  assert.equal(snapshotReal(), realBefore, '本測試不得動到真實的發版同意收據')
}
