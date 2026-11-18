// ═══════════════════════════════════════════════════════════════════════════
// 「這句話算不算發版同意」的**唯一**判準
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼有這個檔**(2026-09-20,對抗性稽核抓出來的 blocker):
// 判準原本有三份,彼此不一致:
//   1. `infra/governance/release-workflow.json` 的 consentPhrases / questionMarkers /
//      denialMarkers —— **沒有任何執行面讀它**,只有測試斷言其中一個字串(裝飾性 SSOT)
//   2. `record_release_consent.sh` 自己寫的三條 regex —— 與上面那份不同
//   3. `writeReleaseConsent()`(agent 手動落地那條路)—— **一條都沒有**
// 而磁碟上 14 筆收據裡 10 筆走第 3 條路,也就是 agent 自己寫的。canonical 白紙黑字寫
// 「問句／否定不算同意」,實際上那句話只在第 2 條路上被執行,第 3 條路完全繞過。
// 等於 agent 在自我認證 —— M36(a)「禁把自己的推論寫成 user 的決定」被機制本身破壞。
//
// 現在:判準只住在 release-workflow.json(SSOT),實作只有這一支,hook 與手動落地共同消費。
//
// ── 判定順序(順序本身就是規則)────────────────────────────────────────────
// 1. **主張自己早就同意過** → consent。這一類**贏過問號**:
//    「我他媽到底要講幾次發版?」「我不是老早就說滿足我的要求就發版了嗎?」
//    句子裡有問號,但沒有任何讀法是在問我要不要發 —— 它在陳述「我早就說過了」。
//    把它當問句丟掉,正是 user 連續兩天暴怒的直接原因。
// 2. **A-不-A 問句**(要不要／可不可以／能不能／該不該)+ 同意詞 → question。
//    中文的 A-不-A 問句**字面上內嵌否定詞**:「要不要發版」裡面就有「不要發版」。
//    不先攔下來,一句在問我的話會被當成撤回而把同意刪掉(2026-09-20 實測)。
// 3. **否定** → withdraw。否定詞一律**要帶發版受詞**:裸的「不要發」會命中
//    「不要發生問題」而把同意刪掉(實測),裸的「先不要」會命中「先不要管那個」。
// 4. **條件 / 延後**:命中 conditionalMarkers 的字面(等我／確認後／明天／如果…)+ 同意詞 → deferred。
//    分界只有「有沒有命中清單的字」,判準不懂條件在誰身上;兩個方向都有已知誤判。
//    例句、「…做完了就發版」為何不收、待辦,寫在函式內第 4 步;
//    `scripts/test-release-consent.mjs` 5e、5f 鎖住現況(2026-11-18)。
// 5. 沒有同意詞 → none。
// 6. **問句**(可以嗎／是否／…嗎／?)→ question。保守側:
//    不記錄、也不撤回,而且**必須印出來讓人知道它被擋了**(靜默丟棄才是真正的傷害)。
// 7. 其餘 → consent。
//
// 任何一邊的修改都要同時更新 SSOT 與兩面對照測試(`scripts/test-release-consent.mjs`),
// 對照組必須用磁碟上真實出現過的原話當 fixture —— 不會紅的對照組是零證據。

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const WORKFLOW_PATH = resolve(ROOT, 'infra/governance/release-workflow.json')

/** 判準只有一個來源:release-workflow.json 的 releaseConsent 區塊。 */
export function loadConsentPolicy(path = WORKFLOW_PATH) {
  const policy = JSON.parse(readFileSync(path, 'utf8')).releaseConsent
  if (!policy) throw new Error('release-workflow.json 缺 releaseConsent 判準')
  for (const key of ['consentPhrases', 'questionMarkers', 'denialMarkers', 'priorConsentAssertions', 'aNotAQuestions', 'conditionalMarkers']) {
    if (!Array.isArray(policy[key]) || policy[key].length === 0) {
      throw new Error(`releaseConsent.${key} 必須是非空陣列 —— 判準缺一項就等於那一面沒有防線`)
    }
  }
  return policy
}

const hasAny = (text, list) => list.some((item) => new RegExp(item, 'iu').test(text))
const hasLiteral = (text, list) => list.some((item) => text.includes(item))

/**
 * @returns {{verdict: 'consent'|'withdraw'|'question'|'deferred'|'none', reason: string}}
 *   consent  = 記錄同意
 *   withdraw = 撤回既有同意
 *   question = 偵測到同意詞但判為問句;**不記錄也不撤回**,呼叫端必須把這件事說出來
 *   deferred = 條件/延後的說法(等我看完再發版);同樣不記錄也不撤回,必須出聲
 *   none     = 與發版無關
 */
export function classifyConsentPrompt(text, policy = loadConsentPolicy()) {
  const value = typeof text === 'string' ? text : ''
  if (!value.trim()) return { verdict: 'none', reason: '空內容' }

  // 1. 主張早就同意過 —— 贏過問號
  if (hasAny(value, policy.priorConsentAssertions) && hasLiteral(value, policy.consentPhrases)) {
    return { verdict: 'consent', reason: 'user 明確表示自己早就同意過(問號只是語氣,不是在問我)' }
  }
  // 2. 中文 A-不-A 問句**字面上內嵌否定詞**:「要不要發版」裡面就有「不要發版」。
  //    不先攔下來的話,一句在問我的話會被當成撤回而刪掉同意(2026-09-20 實測)。
  //    必須排在否定之前,而且只在同時出現同意詞時才算 —— 「要不要吃飯」與發版無關。
  if (hasLiteral(value, policy.aNotAQuestions) && hasLiteral(value, policy.consentPhrases)) {
    return { verdict: 'question', reason: 'A-不-A 問句(在問我,不是在指示我)' }
  }
  // 3. 否定(一律要帶發版受詞)—— 明確說不要,勝過任何條件句
  if (hasAny(value, policy.denialMarkers)) {
    return { verdict: 'withdraw', reason: 'user 明確說不要發' }
  }
  // 4. **條件 / 延後**:「等我看完預覽再發版」「確認完再發版」—— 那是在描述條件,不是現在就發。
  //    2026-09-21 對抗稽核抓到:先前這類一律落到最後的 catch-all 判成 consent,
  //    **連 release-workflow.json 自己存的 userVerbatim(2026-09-02 user 定義這道閘的那句話)
  //    餵回判準都會被判成「現在就發版」並寫出有效收據** —— 那正是這道閘要防的事。
  //    **必須排在否定之後**:「先不要發版,我再看看」同時命中「先…再」與「不要發版」,
  //    明確的否定要贏(2026-09-21 當場被 hook 測試抓到)。
  //    與 question 同樣:不記錄、也不撤回,但一定要出聲。
  //
  //    **實際的分界是「有沒有命中 conditionalMarkers 的字面」**(2026-11-18 照實補記;判準沒有改):
  //    命中清單 + 有同意詞 → deferred;沒命中就往下走,有同意詞又不是問句 → consent。
  //    程式不分辨條件在誰身上(要等 user 看、等時間、還是等 AI 做完),也不分辨時態。
  //    455f1583(2026-09-21)加這份清單的理由是「條件句不是現在就發」,連機器那一側的
  //    「如果 CI 全綠就發版」判成 consent 也算 bug(5d 鎖住);清單是這個意圖的字面實作,沒列到的說法照舊判 consent。
  //
  //    **「…做完了就發版」這一類判 consent,原因只是清單裡沒有它的字**(例:「現在該做的任務都做完了就發版」)。
  //    2026-11-17 自查(交接 logs/self-audit-2026-11-17.json)提議把它加進清單,不採
  //    (該次工作交接 OPEN-ITEMS B1、規劃 ND1),5e 鎖住。查得到的依據只有一句 user 原話,
  //    governance/memory/feedback_solo_dev_workflow.md:12(同句在 scripts/release-orchestrator.mjs:102):
  //    「你他媽我從頭到尾就這樣要求,也沒有新增任何設計需求?你他媽到底是要我說發版說到何時?」
  //    —— 那句是 2026-09-20 針對「同意綁 commit／分支、切一次工作就要重講」說的;
  //    拿來套到這一類(改判 deferred 會逼 user 再講一次「發版」)是 AI 推導。
  //    以下也是 AI 推導:這類說法是 user 把「做完」交給 AI 判;保護不靠再問 user,而是同意綁產品指紋
  //    (scripts/release-orchestrator.mjs `consentCoversHead`),預覽看得見的檔一動就失效、要重新確認,
  //    合併前 required CI 仍要全綠;AI 誤報「做完」是回報誠實的問題,改判準修不到它。
  //    照 455f1583 的意圖,這一類也算條件句;不收是 ND1 只對這一類的刻意例外,不是放過其他條件句的理由。
  //    (本檔判定順序第 1 點的例句「我不是老早就說滿足我的要求就發版了嗎?」沒標出處、對不到原始對話,
  //    不作依據;本段前一版曾把它寫成 user 原話,已撤回。)
  //
  //    **邊界(2026-11-18 實測現況;5f 逐句鎖住,改清單就要一起改這段與 5f)**
  //    偏放行(既有缺口,直接落在發版同意閘上 —— hook 會寫出有效收據):
  //      條件在 user 身上或在時間上,但清單沒有那幾個字 → consent:
  //      「改完給我看,我說可以再發版」「你部署好讓我看,沒問題就發版」「看完沒問題就發版」
  //      「我看一下沒問題就發版」「確認沒問題才發版」「晚點發版」「下午再發版」「過兩天發版」;
  //      意思相同卻判定相反:「CI 綠了就發版」consent,5d 的「如果 CI 全綠就發版」deferred。
  //    偏保守(user 得再講一次):清單的字出現在已看過的同意、或 5e 同一類的句子裡 → deferred:
  //      「我看過了,發版」(命中「我看過」)、「先把剩下的做完再發版」(命中「先…再」)、
  //      「如果都做完了就發版」(命中「如果」)。
  //    **工程待辦(未排程)**:把 user 那一側的檢視條件(給我看／我說可以／看一下沒問題)與時間詞
  //    (晚點／下午／過兩天)補進清單,並處理「我看過了」這種已看過的說法被誤擋。收緊偏放行那一面
  //    與 ND1 不衝突(ND1 只說不把「做完了就」那一類改判)。做的時候先改 5f 的期望值、
  //    用磁碟上真實出現過的原話做兩面對照,並確認 5e 那句仍是 consent。
  if (hasAny(value, policy.conditionalMarkers) && hasLiteral(value, policy.consentPhrases)) {
    return { verdict: 'deferred', reason: '這是條件或延後的說法(等/確認後/才/如果…),不是現在就發' }
  }
  // 5. 沒有同意詞
  if (!hasLiteral(value, policy.consentPhrases)) {
    return { verdict: 'none', reason: '沒有同意詞' }
  }
  // 6. 問句 ≠ 同意(M36)
  if (hasAny(value, policy.questionMarkers.map((m) => m.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')))) {
    return { verdict: 'question', reason: '有同意詞但判為問句(保守側:不記錄也不撤回)' }
  }
  return { verdict: 'consent', reason: '明確同意' }
}

// 直接執行時當成小 CLI:從 stdin 讀整段原話,印出判定。
// hook(bash)靠它消費同一份判準 —— 不讓 bash 再自己寫一套 regex(那正是三方漂移的來源)。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const chunks = []
  process.stdin.on('data', (c) => chunks.push(c))
  process.stdin.on('end', () => {
    const { verdict, reason } = classifyConsentPrompt(Buffer.concat(chunks).toString('utf8'))
    process.stdout.write(`${verdict}\t${reason}\n`)
  })
}
