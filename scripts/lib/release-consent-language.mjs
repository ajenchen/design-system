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
// 4. 沒有同意詞 → none。
// 5. **問句**(可以嗎／是否／…嗎／?)→ question。保守側:
//    不記錄、也不撤回,而且**必須印出來讓人知道它被擋了**(靜默丟棄才是真正的傷害)。
// 6. 其餘 → consent。
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
  for (const key of ['consentPhrases', 'questionMarkers', 'denialMarkers', 'priorConsentAssertions', 'aNotAQuestions']) {
    if (!Array.isArray(policy[key]) || policy[key].length === 0) {
      throw new Error(`releaseConsent.${key} 必須是非空陣列 —— 判準缺一項就等於那一面沒有防線`)
    }
  }
  return policy
}

const hasAny = (text, list) => list.some((item) => new RegExp(item, 'iu').test(text))
const hasLiteral = (text, list) => list.some((item) => text.includes(item))

/**
 * @returns {{verdict: 'consent'|'withdraw'|'question'|'none', reason: string}}
 *   consent  = 記錄同意
 *   withdraw = 撤回既有同意
 *   question = 偵測到同意詞但判為問句;**不記錄也不撤回**,呼叫端必須把這件事說出來
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
  // 3. 否定(一律要帶發版受詞)
  if (hasAny(value, policy.denialMarkers)) {
    return { verdict: 'withdraw', reason: 'user 明確說不要發' }
  }
  // 4. 沒有同意詞
  if (!hasLiteral(value, policy.consentPhrases)) {
    return { verdict: 'none', reason: '沒有同意詞' }
  }
  // 5. 問句 ≠ 同意(M36)
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
