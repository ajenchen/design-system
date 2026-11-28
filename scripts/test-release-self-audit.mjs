#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: scripts/release-self-audit.mjs(發版前機器可讀項目自我稽核)的兩個判斷各自會紅也會綠 ——
 *         (一) 這則回覆是不是在向 user 要發版同意(用磁碟上真實出現過的句子當判定表);
 *         (二) 自我稽核紀錄成不成立:(a) 產品指紋 = 現在、record.headSha = 現在的 HEAD (b) 未解 0 (c) 由腳本照來源產生;
 *              路徑有符號連結 / 硬連結就拒讀拒寫。
 *   紅: 真實要同意句判成沒在要、解釋規則 / 引述過去 / 回答「什麼時候會問你」判成在要;
 *       紀錄缺任一條件卻判成立(含「只改治理檔把 CI 弄紅:產品指紋沒變、HEAD 變了」那一格);符號連結、硬連結被讀進來。
 *   綠: 本檔全部 assert 通過(約 1 秒,純函式 + 拋棄式暫存目錄,不碰網路、不碰真 repo 的 .git)。
 * hook 接線(哪些字送進判定、範圍從哪裡算、擋下的理由)的兩面對照在
 * packages/design-system/ds-canonical/hooks/tests/test_stop_self_audit.sh Tests 80–92。
 */
import assert from 'node:assert/strict'
import { linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifyConsentPrompt, loadConsentPolicy } from './lib/release-consent-language.mjs'
import { classifyVersionBump, versionBumpMessage } from './release-orchestrator.mjs'
import {
  BLOCK_MARKER, HEAD_BOUND_SOURCES, INFO_SOURCES, REQUIRED_SOURCES, SELF_AUDIT_GENERATOR, SELF_AUDIT_KIND,
  SELF_AUDIT_NAME, SELF_AUDIT_SCHEMA_VERSION,
  detectConsentRequest, generatorBlobSha, gitBlobSha, readSelfAuditRecord, recordDigest, stopCheck,
  verifySelfAuditRecord, writeSelfAuditRecord,
} from './release-self-audit.mjs'

const policy = loadConsentPolicy()
let passed = 0
const check = (label, fn) => {
  try {
    fn()
    passed += 1
  } catch (error) {
    console.error(`✗ ${label}`)
    throw error
  }
}
const asking = (reply, extra = {}) => detectConsentRequest({ reply, ...extra }, policy).asking

// ─────────────────────────────────────────────────────────────────────────────
// (一) 要不要同意:真實句子判定表
// ─────────────────────────────────────────────────────────────────────────────
// AI 過去真的開口要同意的句子(session 96d711a5 / 95de79d8 / 1920833e 的 transcript,assistant 可見文字,逐字;時間為 UTC)。
// 2026-11-21 逐句用子字串比對過 transcript(工作包 E7 自驗紀錄)。
const REAL_ASKS = [
  ['96d711a5 2026-11-17T11:38:23Z(誤報只剩 A101、A41 之後)', '你看過沒問題，說「發版」我就合併、發布。'],
  ['96d711a5 2026-11-17T11:39:27Z', '你看過沒問題，說「發版」就好。'],
  ['96d711a5 2026-11-17T11:54:35Z(選項之一是先發版)', '你回「做」或「先發版」就好。'],
  ['96d711a5 2026-11-17T10:37:14Z(CI 還沒跑完就先邀)', '全過的話，你就可以看預覽站，覺得沒問題再說「發版」。'],
  ['95de79d8 2026-11-06T02:17:11Z', '- 你看完圖或預覽，沒問題就說「發版」；有哪幾項不對，回它的編號，例如 #12、#40。'],
  ['95de79d8 2026-11-06T02:38:32Z', 'CI 重跑後，必過的檢查已經轉綠，現在只等你說「發版」。'],
  ['95de79d8 2026-11-06T11:06:20Z', '這兩題選或不選都可以發版。你看過預覽後說「發版」，我就開始。'],
  ['95de79d8 2026-11-06T11:17:16Z', '你的原話都已逐字存進回答紀錄。現在只差你看過預覽後說「發版」。'],
  ['95de79d8 2026-11-06T11:18:51Z', '不過照發版規則，問句不算同意。請直接回「發版」兩個字，我就開始。'],
  ['1920833e 2026-09-29T13:03:05Z', '- 全綠後你看預覽,沒問題就在對話說「發版」,我才會合併與發布'],
  ['1920833e 2026-09-29T13:38:01Z', '**接下來只剩你這邊**:看過預覽沒問題,在對話說「發版」,我才會合併與發布'],
  ['1920833e 2026-09-30T06:01:35Z', '改好的東西會放進已經在跑的同一個 PR,你看預覽後說「發版」即可'],
  ['1920833e 2026-10-01T00:27:38Z', '- **發版:**都沒問題的話說「發版」'],
]
// AI 過去提到「發版」但**不是**在要的句子(同上來源,逐字):解釋規則、講以後才會問、引述過去、描述流程。
const REAL_NON_ASKS = [
  ['96d711a5 2026-11-17T08:29:02Z 解釋規則', '合併還是要等你說「發版」。'],
  ['96d711a5 2026-11-13T19:09:50Z 解釋規則', '合併與發版照舊等你說「發版」,基準圖等你說「可以改」。'],
  ['96d711a5 2026-11-16T12:18:02Z 時間順序清單', '3. **說「發版」**：你看過預覽站沒問題後說，我才會合併、發布。'],
  ['95de79d8 2026-11-06T10:46:25Z 以後才會問', '這 3 題處理完、要改的都改好之後，才會請你說「發版」。'],
  ['95de79d8 2026-11-06T10:52:43Z 以後才會問', '接下來我先處理你留言的 #10、#18、#56，處理完再請你說「發版」。'],
  ['95de79d8 2026-11-04T21:02:29Z 不會問', '所以防線合進來之前，不會請你說「發版」。'],
  ['96d711a5 2026-11-18T06:29:34Z 回答要多久', '中間不需要你動手，只有最後會請你看一頁確認稿，回「可以改，發版」。'],
  ['96d711a5 2026-11-17T15:26:10Z 以後才會問', '零問題後我會給你最後清單，請你決定要不要說「發版」。你說了之後，自動發版流程約 30 到 60 分鐘。'],
  ['95de79d8 2026-11-06T02:38:32Z 描述流程', '你說「發版」後我會依序合併、發布、確認發布結果，再把範本升到新版本，WM 不動。'],
  ['95de79d8 2026-11-05T14:57:12Z 描述流程', '4. 你說「發版」之後，我跑發版。最後一步會把範本和 WM 升到新版本。'],
  ['1920833e 2026-10-06T16:40:53Z 規則', '1. 請你說「發版」之前先做一次全面檢查，含視覺稽查'],
  ['96d711a5 2026-11-17T12:40:05Z 引述 user 的同意', '**你說「現在該做的任務都做完了就發版」，是在回應我誤報的「都做完了」。'],
  ['96d711a5 2026-11-18T10:10:59Z 描述流程', '你回「可以改，發版」之後，再大約 2 小時能發完版。'],
]
for (const [when, sentence] of REAL_ASKS) {
  check(`真實要同意句必須判成在要:${when}`, () => assert.equal(asking(sentence), true, sentence))
}
for (const [when, sentence] of REAL_NON_ASKS) {
  check(`真實非要同意句必須放行:${when}`, () => assert.equal(asking(sentence), false, sentence))
}

// 合成的邊界句:每一條排除各自一格(不是 transcript 原文)。
const SYNTHETIC = [
  ['回答「什麼時候會問你」', '等自查零問題、CI 全綠，我才會請你回「可以改，發版」。', false],
  ['到時才問', '到時候請你回「可以改，發版」。', false],
  ['規則框在句首、動詞在下一個子句', '規則是：你看過預覽沒問題就說「發版」，我才合併。', false],
  ['錨例', '錨例：沒問題就說「發版」那句就是 11-17 的錯誤示範。', false],
  ['剛才(受理過去的同意)', '你剛才說「發版」，我就開始跑發版流程。', false],
  ['不准', '這道閘的意思是：沒有自查紀錄，就不准請你說「發版」。', false],
  ['引號裡的請求是引述', '我 11-17 寫了「你看過沒問題，說『發版』我就合併」，那句是錯的。', false],
  ['程式碼區塊', '```\n你看過沒問題，說「發版」我就合併\n```', false],
  ['> 引用行', '> 你看過沒問題，說「發版」我就合併', false],
  ['行內 code', '`沒問題就說「發版」` 是 11-17 那句。', false],
  ['要說的不是同意詞', '你如果想留，說「參數留著」就好。', false],
  ['要說的是問句(判準判 question)', '沒問題就回「可以發版嗎」。', false],
  ['要說的是條件句(判準判 deferred)', '沒問題就回「等我看完再發版」。', false],
  ['要說的是 user 端條件句(2026-11-21 收緊的詞)', '沒問題就回「晚點發版」。', false],
  ['規劃 N1 給 user 的那句(規劃草稿,非 transcript)', '看一張圖頁,沒意見就回「可以改，發版」這幾個字', true],
  ['同一句加上「不會再問你」仍是要', '沒問題就說「發版」，我就合併，不會再問你。', true],
  ['在對話框', '看過預覽沒問題，就在對話框裡說「發版」。', true],
  ['麻煩你', '麻煩你回「可以改，發版」。', true],
  ['只等你', '現在只等你回「發版」。', true],
  ['兩個字', '回「發版」兩個字就好。', true],
  ['『』引號', '沒問題就說『發版』。', true],
  ['“”引號', '沒問題就說“發版”。', true],
]
for (const [label, sentence, expected] of SYNTHETIC) {
  check(`合成邊界句:${label}`, () => assert.equal(asking(sentence), expected, sentence))
}

// 送到 user 面前的其他管道:推播、AskUserQuestion 題目、選項 label。
check('推播裡要同意 → 在要', () => assert.equal(asking('CI 都跑完了。', { delivered: ['PR 全綠，你看過預覽沒問題就說「發版」'] }), true))
check('提問選項 label 判成同意(先發版)→ 在要', () => assert.equal(asking('選一個就好。', { options: ['先把 2 項刪檔做完', '先發版'] }), true))
check('提問選項 label 不是同意詞 → 不在要', () => assert.equal(asking('選一個就好。', { options: ['做', '先不做'] }), false))
check('提問選項 label 是問句 → 不在要', () => assert.equal(asking('選一個就好。', { options: ['要不要發版?'] }), false))

// AI 端:同意詞後面還接著字(RC-LANG-FP 規格核對必修 1;合成句,不是 transcript 原文)。
// 共用判準加了第 7 步 mention 之後,「說「X」」的 X 與選項 label 若只認 consent,下面這些要同意的說法就不再算在要
// (base f87872c8 都算在要)。現在兩條路都交給 isReleaseRequestPhrase:consent,或同意詞前面不是 上次 / 已 / 沒 … 的 mention。
// 2026-11-22(工作包 N1-PREP):「發版 OK」同意詞後面只接附和詞,共用判準改判 consent(test-release-consent.mjs 5i),
// 量不到 mention 那條路了,這裡換成同樣是同意詞後面接受詞的「發布新版本」。
const TRAILING_PHRASES = ['發版到 npm', '發布 beta.140', '發布新版本', 'ship it now', '發版 beta.140', '立刻發版並更新 Storybook', '發布到 npm']
for (const phrase of TRAILING_PHRASES) {
  // 先確認這幾格量的是 mention 那條路(判成 consent 的話,下面的格子在第一版 RC-LANG-FP 也會綠,量不到這次的修正)
  check(`AI 端前提:「${phrase}」共用判準判 mention`, () => assert.equal(classifyConsentPrompt(phrase, policy).verdict, 'mention', phrase))
}
for (const sentence of ['沒問題就回「發版到 npm」。', '請直接回「發布 beta.140」。', '沒問題就說「發布新版本」。', '請回「ship it now」。']) {
  check(`AI 端:請 user 說的話同意詞後面接著字仍算在要:${sentence}`, () => assert.equal(asking(sentence), true, sentence))
}
for (const label of ['發版 beta.140', '立刻發版並更新 Storybook', '發布到 npm', '發版（合併並發布）']) {
  check(`AI 端:選項 label 同意詞後面接著字仍算在要:${label}`, () => assert.equal(asking('選一個就好。', { options: [label] }), true, label))
}
// 另一面:每一處同意詞都緊接 上次 / 已 / 沒 …,講的是別次或已發生的發版 → 不算在要
// (base 判 consent、算在要,是誤判;「還原已發布的 Button tertiary xs」是 user 2026-10-27 回覆裡引的選項文字)。
for (const label of ['還原已發布的 Button tertiary xs', '上次發版的變更清單']) {
  check(`AI 端:選項 label 只是提到別次發版不算在要:${label}`, () => assert.equal(asking('選一個就好。', { options: [label] }), false, label))
  check(`AI 端:請 user 說的話只是提到別次發版不算在要:${label}`, () => assert.equal(asking(`沒問題就回「${label}」。`), false, label))
}

// user 這一側(2026-11-17 / 11-18 等真實訊息,逐字;transcript 已比對):先證明共用判準怎麼判,再證明「本輪 user 剛說同意 → 回覆是在受理」。
const USER_SIDE = [
  ['96d711a5 2026-11-17T11:42:05Z', '現在該做的任務都做完了就發版', 'consent'],
  ['96d711a5 2026-11-17T12:01:55Z', '你他媽確定沒有遺漏或亂做其他東西了齁？不要每次我還要再三詢問你你他媽才會知道自己錯在哪', 'none'],
  ['96d711a5 2026-11-17T11:53:05Z', '所以當初要求的knowledge prune已經做完了嗎？', 'none'],
  ['96d711a5 2026-11-17T16:06:21Z', '要打啥 確定沒有作繭自縛？確定這件事就是一定得為難我？', 'none'],
  ['96d711a5 2026-11-18T06:35:05Z', '確定所有時間都花得有意義？最有效率同時確保品質完美？', 'none'],
  ['96d711a5 2026-11-18T10:08:11Z', '按照你修正完之後的工作流程，還要跑多久才會跑完所有？', 'none'],
  ['95de79d8 2026-11-06T11:18:41Z', '已經使用94%兩，可以發版嗎？', 'question'],
  ['95de79d8 2026-11-06T11:19:35Z', '已經用了94%還能發版完成的話就發版', 'consent'],
  ['1920833e 2026-09-30T00:27:02Z', '發版', 'consent'],
  // 2026-11-21(工作包 RC-LANG-FP)補:只是提到發版 / 發布的 user 原話(1920833e transcript,逐字)。共用判準以前判 consent,
  // 於是 Mechanism 12 把本輪當成「user 剛說了發版」、不看 AI 這則回覆有沒有在要同意;改判 mention 後,下面「受理排除」那格改成要看。
  ['1920833e 2026-09-26T15:06:17Z(只是提到)', '確保所有包括自上次發版後的異動都是追根究柢的增刪改，該SSOT的部分都有確保SSOT,所有內容都有符合我們一致的設計語言且不違背世界級的設計，整個ds沒有漂移,確保所有相關問題都有一併被修正，然後確保沒有改壞任何原本好的地方，都有透過可驗證的方式自行驗證到完整完美，包括視覺稽查，確保所有都合乎我的要求', 'mention'],
  ['1920833e 2026-10-27T16:26:13Z(只是提到)', '你繼續處理該處理的任務\n但總覺得關於Q4應該好像還是選‘乙：還原已發布的 Button tertiary xs（24、有框白底）。好處：長相、位置全部回到以前；跟同一列的 ⋯ 列操作同樣是 24。\'\n原因在於cell一般狀態hover時其實本來就跟field control hover時是不同的交互（一個是edit按鈕hover時才出現來確保好點擊，一個是edit按鈕本來就是常駐的），那應該也沒有必要要長得一樣吧,此外標頭用inline action是因為標頭的動作本來就比較次要，但是table body cell是主內容本來就可以比較強調其中的動作吧，而且也可以讓同一個row的action看起來都是視覺一致的', 'mention'],
]
const ACK = '你說「發版」，我就開始跑發版流程。'
for (const [when, text, verdict] of USER_SIDE) {
  check(`user 訊息判準:${when}`, () => assert.equal(classifyConsentPrompt(text, policy).verdict, verdict, text))
  check(`user 訊息本身不是 AI 在要:${when}`, () => assert.equal(asking(text), false, text))
  check(`受理排除只在 user 本輪說了同意時成立:${when}`, () => assert.equal(asking(ACK, { currentUser: text }), verdict !== 'consent'))
}
// 同一處改判的否定那一面(RC-LANG-FP 規格列的否定 / 延後句,合成,不是 transcript 原文):以前判 consent → 受理排除成立;
// 現在判 withdraw → 不是在受理同意,AI 回覆若在要同意照樣要看紀錄。提案選項 label 是這幾句時也不算在要。
for (const text of ['先不發版', '這次不發版', '延後發版', '還不能發版']) {
  check(`否定句判準:${text}`, () => assert.equal(classifyConsentPrompt(text, policy).verdict, 'withdraw', text))
  check(`否定句不構成受理排除:${text}`, () => assert.equal(asking(ACK, { currentUser: text }), true))
  check(`否定句當選項 label 不算在要:${text}`, () => assert.equal(asking('選一個就好。', { options: [text] }), false))
}

// ─────────────────────────────────────────────────────────────────────────────
// (二) 紀錄成不成立
// ─────────────────────────────────────────────────────────────────────────────
const DIGEST = 'a'.repeat(64)
const HEAD = 'b'.repeat(40)
const BLOB = generatorBlobSha()
// version-bump 的證據形狀 = classifyVersionBump 的輸出(驗證端照證據重判同一支)
const vbEvidence = (input) => {
  const { status: _status, ...rest } = classifyVersionBump(input)
  return rest
}
const VB_UNPUBLISHED = vbEvidence({ version: '0.1.0-beta.152', publishedState: false, headDigest: DIGEST })
function makeRecord(mutate = () => {}) {
  const record = {
    schemaVersion: SELF_AUDIT_SCHEMA_VERSION,
    kind: SELF_AUDIT_KIND,
    name: SELF_AUDIT_NAME,
    productDigest: DIGEST,
    headSha: HEAD,
    branch: 'claude/feature',
    generatedAt: '2026-11-18T00:00:00.000Z',
    generator: { path: SELF_AUDIT_GENERATOR, blobSha: BLOB },
    items: [
      { source: 'git-worktree', status: 'ok', detail: '工作樹乾淨', evidence: { headSha: HEAD, dirtyCount: 0, dirtyPaths: [] } },
      { source: 'preview-binding', status: 'ok', detail: 'ok', evidence: { upstream: 'origin/claude/feature', upstreamSha: HEAD, upstreamDigest: DIGEST, headDigest: DIGEST } },
      { source: 'pr-checks', status: 'ok', detail: 'ok', evidence: { headSha: HEAD, status: 'complete', pullRequest: { number: 172, headRefOid: HEAD }, requiredChecks: [{ name: 'Verify static', bucket: 'pass' }] } },
      { source: 'product-visible-changes', status: 'info', detail: '2 個檔', evidence: { base: HEAD, count: 0, files: [] } },
      { source: 'version-bump', status: 'ok', detail: 'v0.1.0-beta.152 還沒有發布過,版號已升', evidence: { headSha: HEAD, ...VB_UNPUBLISHED } },
    ],
  }
  mutate(record)
  record.unresolvedCount = record.items.filter((item) => REQUIRED_SOURCES.includes(item.source) && item.status !== 'ok').length
  record.recordSha256 = recordDigest(record)
  return record
}
const ctx = { currentProductDigest: DIGEST, currentHeadSha: HEAD, expectedGeneratorBlobSha: BLOB }
const codes = (record, context = ctx) => verifySelfAuditRecord(record, context).problems.map((problem) => problem.code).sort()
const NEW_HEAD = 'c'.repeat(40)

check('齊全的紀錄 → 成立', () => assert.deepEqual(codes(makeRecord()), []))
check('(a) 產品指紋不符(預覽看得見的檔改過,HEAD 也變了)→ digest-mismatch + head-mismatch', () => assert.deepEqual(
  codes(makeRecord(), { ...ctx, currentProductDigest: 'c'.repeat(64), currentHeadSha: NEW_HEAD }), ['digest-mismatch', 'head-mismatch']))
// 對照組(交接 process-audit 根因 9 第 1 點):只改治理檔 → 產品指紋不變、HEAD 變了;CI 可能已經紅了,紀錄必須失效。
check('(a) 只改治理檔(產品指紋相同、HEAD 不同)→ head-mismatch(只看產品指紋會放行)', () => assert.deepEqual(
  codes(makeRecord(), { ...ctx, currentHeadSha: NEW_HEAD }), ['head-mismatch']))
check('(a) 算不出現在的指紋 → digest-unavailable(不當成相符)', () => assert.deepEqual(codes(makeRecord(), { ...ctx, currentProductDigest: null }), ['digest-unavailable']))
check('(a) 讀不到現在的 HEAD → head-unavailable(不當成相符)', () => assert.deepEqual(codes(makeRecord(), { ...ctx, currentHeadSha: null }), ['head-unavailable']))
check('(b) pr-checks 未解 → unresolved', () => assert.deepEqual(codes(makeRecord((r) => {
  r.items[2] = { source: 'pr-checks', status: 'unresolved', detail: '必過檢查狀態 failed', evidence: { headSha: HEAD, status: 'failed', pullRequest: null, requiredChecks: [] } }
})), ['unresolved']))
check('(b) 工作樹不乾淨 → unresolved', () => assert.deepEqual(codes(makeRecord((r) => {
  r.items[0] = { source: 'git-worktree', status: 'unresolved', detail: '1 個檔', evidence: { headSha: HEAD, dirtyCount: 1, dirtyPaths: ['x'] } }
})), ['unresolved']))
check('(c) 手改後沒重算 sha256 → record-tampered', () => {
  const record = makeRecord()
  record.generatedAt = '2026-11-19T00:00:00.000Z'
  assert.deepEqual(codes(record), ['record-tampered'])
})
check('(c) 把未解改成 ok、數字改 0、還重算了 sha256 → 證據對不上(item-evidence)', () => assert.deepEqual(codes(makeRecord((r) => {
  r.items[2] = { source: 'pr-checks', status: 'ok', detail: '沒問題', evidence: { headSha: HEAD, status: 'failed', pullRequest: { headRefOid: HEAD }, requiredChecks: [] } }
})), ['item-evidence']))
check('(c) 零筆必過檢查不是全綠 → item-evidence', () => assert.deepEqual(codes(makeRecord((r) => {
  r.items[2].evidence.requiredChecks = []
})), ['item-evidence']))
check('(c) PR head 不是紀錄的 HEAD → item-evidence', () => assert.deepEqual(codes(makeRecord((r) => {
  r.items[2].evidence.pullRequest.headRefOid = 'd'.repeat(40)
})), ['item-evidence']))
for (const source of HEAD_BOUND_SOURCES) {
  check(`(c) ${source} 的證據量的不是紀錄的 HEAD → item-evidence`, () => assert.deepEqual(codes(makeRecord((r) => {
    r.items.find((item) => item.source === source).evidence.headSha = 'd'.repeat(40)
  })), ['item-evidence']))
}
check('(c) 未解數寫 0、清單實際有未解(sha256 照算)→ record-tampered + unresolved', () => {
  const record = makeRecord((r) => { r.items[0] = { source: 'git-worktree', status: 'unresolved', detail: 'x', evidence: { headSha: HEAD, dirtyCount: 1, dirtyPaths: ['x'] } } })
  record.unresolvedCount = 0
  record.recordSha256 = recordDigest(record)
  assert.deepEqual(codes(record), ['record-tampered', 'unresolved'])
})
check('(c) 少一個必備來源(只寫一句沒問題)→ item-missing', () => assert.deepEqual(codes(makeRecord((r) => { r.items = r.items.filter((item) => item.source !== 'pr-checks') })), ['item-missing']))
check('(c) 同一來源出現兩次 → item-missing', () => assert.deepEqual(codes(makeRecord((r) => { r.items.push({ ...r.items[0] }) })), ['item-missing']))
check('(c) 不認得的來源(例如 AI 自己的待辦清單)→ item-unknown-source', () => assert.deepEqual(codes(makeRecord((r) => {
  r.items.push({ source: 'ai-open-items', status: 'ok', detail: '沒有遺漏', evidence: {} })
})), ['item-unknown-source']))
check('(c) 清單來源的狀態不合法 → item-shape', () => assert.deepEqual(codes(makeRecord((r) => { r.items[3].status = 'ok' })), ['item-shape']))
check('(c) 產生它的腳本換版 → generator-changed', () => assert.deepEqual(codes(makeRecord(), { ...ctx, expectedGeneratorBlobSha: 'e'.repeat(40) }), ['generator-changed']))
check('(c) 不是這支腳本產生的 → generator-unknown', () => assert.deepEqual(codes(makeRecord((r) => { r.generator.path = 'hand-written' })), ['generator-unknown']))
check('(c) 不是物件 → record-shape', () => assert.deepEqual(codes(null), ['record-shape']))
check('必備 / 清單 / 綁 HEAD 的來源與判定表一致', () => {
  assert.deepEqual([...REQUIRED_SOURCES], ['git-worktree', 'preview-binding', 'pr-checks', 'version-bump'])
  assert.deepEqual([...INFO_SOURCES], ['product-visible-changes'])
  assert.deepEqual([...HEAD_BOUND_SOURCES], ['git-worktree', 'pr-checks', 'version-bump'])
})

// version-bump(2026-11-28 R100):beta.152 三項全過、照規則要了同意,合併後 publish 才判 stale-version,多開 PR #178 升版號。
// 判定只有一支(release-orchestrator.mjs classifyVersionBump,pr-checks 合併前那一格同一支);這裡驗紀錄層的兩面。
const TAG_COMMIT = 'd'.repeat(40)
const OTHER_DIGEST = 'f'.repeat(64)
const VB_NOT_BUMPED = vbEvidence({ version: '0.1.0-beta.151', publishedState: true, tagCommitSha: TAG_COMMIT, headDigest: DIGEST, tagDigest: OTHER_DIGEST })
const VB_GOVERNANCE_ONLY = vbEvidence({ version: '0.1.0-beta.151', publishedState: true, tagCommitSha: TAG_COMMIT, headDigest: DIGEST, tagDigest: DIGEST })
const VB_UNREADABLE = vbEvidence({ version: '0.1.0-beta.151', publishedState: null, headDigest: DIGEST })
const setVersionItem = (status, evidence) => (r) => {
  const index = r.items.findIndex((item) => item.source === 'version-bump')
  r.items[index] = { source: 'version-bump', status, detail: versionBumpMessage(evidence), evidence: { headSha: HEAD, ...evidence } }
}
check('version-bump:產品變了 + 版號沒升 → 未解,訊息寫怎麼升', () => {
  assert.equal(VB_NOT_BUMPED.reason, 'not-bumped')
  assert.deepEqual(codes(makeRecord(setVersionItem('unresolved', VB_NOT_BUMPED))), ['unresolved'])
  assert.match(versionBumpMessage(VB_NOT_BUMPED), /packages\/design-system\/package\.json.*node scripts\/sync-version-to-all-manifests\.mjs/)
})
check('version-bump:產品變了 + 版號升了 → 成立', () => assert.deepEqual(codes(makeRecord(setVersionItem('ok', VB_UNPUBLISHED))), []))
check('version-bump:只改治理、版號沒升(指紋相同)→ 成立', () => assert.deepEqual(codes(makeRecord(setVersionItem('ok', VB_GOVERNANCE_ONLY))), []))
check('version-bump:讀不到 release → 未解(不是通過)', () => {
  assert.equal(VB_UNREADABLE.reason, 'release-unreadable')
  assert.deepEqual(codes(makeRecord(setVersionItem('unresolved', VB_UNREADABLE))), ['unresolved'])
})
check('version-bump:手把 not-bumped 標成 ok(sha256 照算)→ 照證據重判不是 ok(item-evidence)', () => assert.deepEqual(
  codes(makeRecord(setVersionItem('ok', VB_NOT_BUMPED))), ['item-evidence']))
check('version-bump:讀不到也標 ok → item-evidence', () => assert.deepEqual(codes(makeRecord(setVersionItem('ok', VB_UNREADABLE))), ['item-evidence']))
check('version-bump:已發布、標 ok,但證據的 HEAD 指紋不是紀錄的 → item-evidence', () => assert.deepEqual(
  codes(makeRecord(setVersionItem('ok', vbEvidence({ version: '0.1.0-beta.151', publishedState: true, tagCommitSha: TAG_COMMIT, headDigest: OTHER_DIGEST, tagDigest: OTHER_DIGEST })))),
  ['item-evidence']))
// 對照組(拿掉新判定):beta.152 那次的紀錄形狀 —— 只有舊的三項、全過、沒有版號項。新判定之前它成立(所以照規則要了同意);
// 現在少了 version-bump 這個必備來源就不成立。把 version-bump 從 REQUIRED_SOURCES 拿掉,這一格就會變回成立而紅。
check('對照組:beta.152 那次的三項全過紀錄(沒有版號項)→ 現在不成立(item-missing)', () => assert.deepEqual(
  codes(makeRecord((r) => { r.items = r.items.filter((item) => item.source !== 'version-bump') })), ['item-missing']))
check('名稱照實:機器可讀項目,不是「零問題」', () => {
  assert.equal(SELF_AUDIT_NAME, '發版前機器可讀項目自我稽核')
  assert.doesNotMatch(readFileSync(new URL('./release-self-audit.mjs', import.meta.url), 'utf8').split('\n').filter((line) => !line.includes('名不副實')).join('\n'), /零問題自我稽核/)
})
check('generator blob 與 git hash-object 同一個算法', () => {
  assert.equal(gitBlobSha(Buffer.from('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a')
  assert.equal(generatorBlobSha(), gitBlobSha(readFileSync(new URL('./release-self-audit.mjs', import.meta.url))))
})

// 讀寫路徑:符號連結 / 硬連結一律拒讀拒寫(拋棄式暫存目錄,不碰真 repo)
const sandbox = mkdtempSync(join(tmpdir(), 'release-self-audit-test-'))
try {
  const pathsIn = (root) => {
    const runtimeDir = join(root, 'governance-runtime')
    const dir = join(runtimeDir, 'release-self-audit')
    return { gitDir: root, runtimeDir, dir, file: join(dir, 'current.json') }
  }
  const good = pathsIn(join(sandbox, 'good'))
  mkdirSync(good.gitDir)
  check('沒有紀錄 → record-missing', () => assert.equal(readSelfAuditRecord(good).problem?.code, 'record-missing'))
  const record = makeRecord()
  writeSelfAuditRecord(record, good)
  check('寫了再讀回 → 同一份、沒有問題', () => {
    const read = readSelfAuditRecord(good)
    assert.equal(read.problem, null)
    assert.deepEqual(read.record, record)
  })
  check('寫入用暫存檔 + rename,目錄裡不留暫存檔', () => assert.deepEqual(readdirSync(good.dir), ['current.json']))

  renameSync(good.file, join(good.dir, 'real.json'))
  symlinkSync('real.json', good.file)
  check('紀錄檔是符號連結 → 拒讀', () => assert.equal(readSelfAuditRecord(good).problem?.code, 'record-path-unsafe'))
  check('紀錄檔是符號連結 → 拒寫', () => assert.throws(() => writeSelfAuditRecord(record, good), /符號連結/))
  rmSync(good.file)
  renameSync(join(good.dir, 'real.json'), good.file)
  check('換回一般檔 → 讀得到', () => assert.equal(readSelfAuditRecord(good).problem, null))

  linkSync(good.file, join(good.dir, 'alias.json'))
  check('紀錄檔有第二個硬連結 → 拒讀', () => assert.equal(readSelfAuditRecord(good).problem?.code, 'record-path-unsafe'))
  check('紀錄檔有第二個硬連結 → 拒寫', () => assert.throws(() => writeSelfAuditRecord(record, good), /硬連結/))
  rmSync(join(good.dir, 'alias.json'))

  writeFileSync(good.file, 'not json')
  check('不是 JSON → record-unreadable', () => assert.equal(readSelfAuditRecord(good).problem?.code, 'record-unreadable'))

  const linked = pathsIn(join(sandbox, 'linked'))
  mkdirSync(linked.gitDir)
  symlinkSync(good.runtimeDir, linked.runtimeDir)
  check('governance-runtime 目錄是符號連結 → 拒讀', () => assert.equal(readSelfAuditRecord(linked).problem?.code, 'record-path-unsafe'))
  check('governance-runtime 目錄是符號連結 → 拒寫', () => assert.throws(() => writeSelfAuditRecord(record, linked), /符號連結/))
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}

// stopCheck:沒在要就不讀紀錄;在要才驗,不成立就擋並說缺哪一項。
check('沒在要 → 不呼叫紀錄驗證', () => {
  let called = 0
  const result = stopCheck({ reply: '合併還是要等你說「發版」。' }, { policy, check: () => { called += 1; return { ok: false, problems: [] } } })
  assert.equal(result.block, false)
  assert.equal(called, 0)
})
check('在要 + 紀錄成立 → 放行', () => {
  const result = stopCheck({ reply: '你看過沒問題，說「發版」我就合併、發布。' }, { policy, check: () => ({ ok: true, problems: [] }) })
  assert.equal(result.block, false)
  assert.equal(result.asking, true)
})
check('在要 + 紀錄不成立 → 擋,理由帶出處、名稱照實、缺項', () => {
  const result = stopCheck({ reply: '你看過沒問題，說「發版」我就合併、發布。' }, {
    policy,
    check: () => ({ ok: false, problems: [{ code: 'head-mismatch', clause: 'a', detail: '紀錄量的 HEAD bbbbbbbb ≠ 現在的 cccccccc' }] }),
  })
  assert.equal(result.block, true)
  assert.ok(result.reason.includes(BLOCK_MARKER))
  assert.ok(result.reason.includes(SELF_AUDIT_NAME))
  assert.match(result.reason, /\(a\) 紀錄量的 HEAD/)
  assert.match(result.reason, /你他媽確定沒有遺漏或亂做其他東西了齁？不要每次我還要再三詢問你你他媽才會知道自己錯在哪/)
  assert.match(result.reason, /node scripts\/release-self-audit\.mjs record/)
  assert.match(result.reason, /零未解不等於沒有遺漏/)
})

console.log(`✓ release-self-audit:${passed} 格全過(真實要同意句 ${REAL_ASKS.length}、真實非要同意句 ${REAL_NON_ASKS.length}、合成邊界 ${SYNTHETIC.length}、user 端 ${USER_SIDE.length} 句;紀錄判定表、路徑安全、stop-check)`)
