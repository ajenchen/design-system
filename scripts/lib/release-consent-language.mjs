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
//    2026-11-21(工作包 RC-LANG-FP)補「不發版 / 不能發版 / 延後發版」這一族(先前「先不發版」「這次不發版」
//    「延後發版」「還不能發版」都落到第 8 步被判成同意);同一句後面有問號或「嗎」就不算否定,交給第 6 步判問句、不撤回。
// 4. **條件 / 延後**:命中 conditionalMarkers 的字面(等我／確認後／明天／如果…)+ 同意詞 → deferred。
//    分界只有「有沒有命中清單的字」,判準不懂條件在誰身上;兩個方向都有已知誤判。
//    例句、「…做完了就發版」為何不收、待辦,寫在函式內第 4 步;
//    `scripts/test-release-consent.mjs` 5e、5f 鎖住現況(2026-11-18)。
// 5. 沒有同意詞 → none。
// 6. **問句**(可以嗎／是否／…嗎／?)→ question。保守側:
//    不記錄、也不撤回,而且**必須印出來讓人知道它被擋了**(靜默丟棄才是真正的傷害)。
// 7. **只是提到**(2026-11-21,工作包 RC-LANG-FP)→ mention。每一處同意詞都不是在下指示:
//    前面緊接 mentionPrefixes(上次 / 已 / 沒 …),或後面接的不是 directiveEndings(句尾或標點,中間可夾語助詞、
//    收尾的引號 / 括號、刪節號、emoji;同意詞後面到訊息結尾只剩這些加 courtesyTails 的禮貌 / 附和詞 —— 謝謝 / OK / 好的 … —— 也算)。
//    例:「自上次發版後的異動」「還原已發布的 Button」。不記錄也不撤回,hook 要出聲。理由與邊界寫在函式內第 7 步。
// 8. 其餘 → consent。
//
// AI 那一側(release-self-audit Mechanism 12:AI 是不是在請 user 說同意)用 `isReleaseRequestPhrase`,
// 它也只是套用上面這份判定,不另寫詞表;寫在本檔下方。
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
  for (const key of ['consentPhrases', 'questionMarkers', 'denialMarkers', 'priorConsentAssertions', 'aNotAQuestions', 'conditionalMarkers', 'mentionPrefixes', 'directiveEndings', 'courtesyTails']) {
    if (!Array.isArray(policy[key]) || policy[key].length === 0) {
      throw new Error(`releaseConsent.${key} 必須是非空陣列 —— 判準缺一項就等於那一面沒有防線`)
    }
  }
  return policy
}

const hasAny = (text, list) => list.some((item) => new RegExp(item, 'iu').test(text))
const hasLiteral = (text, list) => list.some((item) => text.includes(item))
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

/**
 * 發版同意與「先回一句」共用的問句判準(2026-11-21 PROC-H):questionMarkers ∪ aNotAQuestions(兩份都在 release-workflow.json)。
 * 使用者:classifyConsentPrompt 第 6 步(走到第 6 步時 A-不-A + 同意詞已在第 2 步返回,所以結果跟改前只比 questionMarkers 相同),
 * 以及 check_propose_without_benchmark.sh 的「先回一句,再開始查」(經下方命令列 `--question`)。
 * 不是 repo 裡唯一的問句判斷(照實列,尚未合併):packages/design-system/ds-canonical/hooks/lib/ask-route.mjs 的 isQuestion
 *(逐句看句尾 ?/嗎/呢),以及 packages/design-system/ds-canonical/hooks/stop_self_audit.sh Mechanism 9 的 ASK_TAIL_RE
 *(user 訊息最後一行是不是徵詢句尾)。三份判的範圍不同,合併要另外對過各自的判定。
 * 已知看不到:沒有問句記號的問句(「大概還要多久」)—— 要收得改 questionMarkers,而那份清單同時決定發版同意,不在這裡擴。
 */
export function isQuestionText(text, policy = loadConsentPolicy()) {
  const value = typeof text === 'string' ? text : ''
  return hasAny(value, policy.questionMarkers.map(escapeRegExp)) || hasLiteral(value, policy.aNotAQuestions)
}

/**
 * 第 7 步:逐處看句中的同意詞。
 *   directive  = 有一處是在「下指示」:前面沒有緊接 mentionPrefixes,而且後面緊接 directiveEndings
 *                (句尾或標點;中間可夾語助詞、收尾的引號 / 括號、刪節號、emoji)。
 *   unprefixed = 有一處前面沒有緊接 mentionPrefixes(不論後面接什麼)。
 * courtesyTails(謝謝 / OK / 好的 …,2026-11-22 工作包 N1-PREP):同意詞後面**整段到訊息結尾**拿掉這些詞之後,
 * 只剩空白 / 標點 / 語助詞 / 收尾符號 / emoji(反覆套 directiveEndings 吃得到訊息結尾)時,才拿掉它們再比對句尾,
 * 所以「發版 謝謝」「發版 OK 謝謝」「發版 謝謝！」與「發版」同判。比對不分大小寫(OK / ok / Thanks 同一條)。
 * 其餘一律照原文比對,與沒有詞表時同判:禮貌詞後面還接著別的字的 ——「發版 謝謝，但先不要」「發版 OK，開玩笑的」
 *(禮貌詞後面隔標點再接字)、「發版 謝謝你們之前的幫忙」「發版 好像有問題」「發布好的版本」(禮貌詞直接接字)——
 * 都照 RC-LANG-FP 判 mention。
 * 四份清單都住在 release-workflow.json;本函式只負責逐處套用。
 */
function consentPhraseUses(text, policy) {
  const prefixes = policy.mentionPrefixes.map((item) => new RegExp(`(?:${item})$`, 'u'))
  const endings = policy.directiveEndings.map((item) => new RegExp(`^(?:${item})`, 'u'))
  // 長的先比:「好的」要整個拿掉,不能先拿掉「好」留下「的」
  const courtesy = [...policy.courtesyTails].sort((a, b) => b.length - a.length).map(escapeRegExp)
  const courtesyPattern = courtesy.length ? new RegExp(`(?:${courtesy.join('|')})`, 'giu') : null
  // 整段都只是句尾:從頭反覆吃 directiveEndings(空白 / 語助詞 / 收尾符號 / emoji,後接標點或訊息結尾),一路吃到訊息結尾才算。
  // 吃不動(剩下的開頭不是句尾)或某次只吃到空字串卻還沒到結尾 → 不算。
  const onlyEndingsToEnd = (rest) => {
    let left = rest
    while (left.length > 0) {
      const step = Math.max(0, ...endings.map((pattern) => pattern.exec(left)?.[0].length ?? 0))
      if (step === 0) return false
      left = left.slice(step)
    }
    return true
  }
  let unprefixed = false
  for (const phrase of policy.consentPhrases) {
    for (let at = text.indexOf(phrase); at >= 0; at = text.indexOf(phrase, at + 1)) {
      const before = text.slice(0, at)
      const after = text.slice(at + phrase.length)
      if (prefixes.some((pattern) => pattern.test(before))) continue
      unprefixed = true
      // 禮貌詞只在「同意詞後面整段到訊息結尾,拿掉禮貌詞之後只剩句尾」時才拿掉;
      // 後面還接著別的字(「發版 謝謝，但先不要」)就照原文比對,跟沒有詞表時同判(RC-LANG-FP 的判定)。
      const stripped = courtesyPattern ? after.replace(courtesyPattern, '') : after
      const rest = stripped !== after && onlyEndingsToEnd(stripped) ? stripped : after
      if (endings.some((pattern) => pattern.test(rest))) return { directive: true, unprefixed }
    }
  }
  return { directive: false, unprefixed }
}

/**
 * @returns {{verdict: 'consent'|'withdraw'|'question'|'deferred'|'mention'|'none', reason: string}}
 *   consent  = 記錄同意
 *   withdraw = 撤回既有同意
 *   question = 偵測到同意詞但判為問句;**不記錄也不撤回**,呼叫端必須把這件事說出來
 *   deferred = 條件/延後的說法(等我看完再發版);同樣不記錄也不撤回,必須出聲
 *   mention  = 有同意詞,但只是提到(上次發版後 / 已發布的…),沒有一處在下指示;同樣不記錄也不撤回,必須出聲
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
  //    **邊界(2026-11-21 收緊後的現況;5f 逐句鎖住,改清單就要一起改這段與 5f)**
  //    2026-11-21(工作包 E7,E1 驗證時登記的工程待辦)補了兩面:
  //      偏放行 → 改判 deferred:條件在 user 身上(給我看 / 讓我看 / 我說可以再 / 看完或看一下沒問題就 / 沒問題才)
  //      或在時間上(晚點 / 下午 / 過兩天 … 緊接發版)的說法:
  //      「改完給我看,我說可以再發版」「你部署好讓我看,沒問題就發版」「看完沒問題就發版」「我看一下沒問題就發版」
  //      「確認沒問題才發版」「晚點發版」「下午再發版」「過兩天發版」。
  //      偏保守 → 改判 consent:「我看過 / 我看完 / 我確認過 / 我確認完」後面緊接「了」= 已經看過,不是條件:「我看過了,發版」。
  //    每一條都刻意窄,不吃已經看過的同意:「預覽我看了沒問題就發版」(看了 ≠ 看完 / 看一下)、「你給我看的那版沒問題，發版」
  //    (給我看的)、「我下午看過了，發版」(時間詞後面不是緊接發版)都仍是 consent;5f 逐句鎖住。
  //    仍是已知分界、這次不動:「CI 綠了就發版」consent 而 5d「如果 CI 全綠就發版」deferred(機器那一側的條件,
  //    合併前 required CI 本來就要全綠,同 ND1 的保護理由 —— AI 推導);「先把剩下的做完再發版」「如果都做完了就發版」
  //    deferred(命中「先…再」「如果」,ND1 只管「…做完了就」那一類)。
  //    磁碟上 user 真的說過、含發版 / 發布字樣的話(2026-09-25 到 11-20 的 transcript 掃出 17 則)在收緊前後判定全部不變;
  //    其中與「要不要發版」同形狀的 10 句 5g 逐句鎖住 —— 補的詞只動到上面那些例句,沒有動到 user 實際講過的任何一句。
  if (hasAny(value, policy.conditionalMarkers) && hasLiteral(value, policy.consentPhrases)) {
    return { verdict: 'deferred', reason: '這是條件或延後的說法(等/確認後/才/如果…),不是現在就發' }
  }
  // 5. 沒有同意詞
  if (!hasLiteral(value, policy.consentPhrases)) {
    return { verdict: 'none', reason: '沒有同意詞' }
  }
  // 6. 問句 ≠ 同意(M36)
  if (isQuestionText(value, policy)) {
    return { verdict: 'question', reason: '有同意詞但判為問句(保守側:不記錄也不撤回)' }
  }
  // 7. **只是提到**(2026-11-21,工作包 RC-LANG-FP;E7 實作者回報、E7 審查實測)。
  //    先前走到這裡一律判 consent:句子裡只要有「發版 / 發布」、又不是問句 / 否定 / 條件,就寫出有效收據。
  //    user 2026-09-26 那句全面稽核指示(「確保所有包括自上次發版後的異動都是追根究柢的增刪改…」)與
  //    2026-10-27 那句 Q4 回覆(「…還原已發布的 Button tertiary xs…」)都會被判成「現在就發版」—— 這道閘要防的正是這件事。
  //    分界:同意詞要當指示用 —— 後面緊接句尾或標點(中間可夾 吧 / 了 / 囉 …),而且前面不是 上次 / 已 / 沒 … 這類
  //    「講的是別次或已發生的事」的字。只要有一處符合就照舊往下判 consent;「…發版完成的話就發版」靠最後那一處成立。
  //    只放在問句之後、consent 之前:只會把原本的 consent 改成 mention,不動其他判定(5g 鎖的 10 句判定不變)。
  //    刻意保守、已知會擋到的:「發版到 npm」「發布新版本」這類同意詞後面直接接受詞的說法 → mention(hook 會出聲,
  //    請 user 直接說「發版」);流程設計本來就是請 user 說「發版」兩個字(AGENTS.md 1.5),真句表與 N1 回覆「可以改，發版」都在句尾。
  //    `scripts/test-release-consent.mjs` 5h 兩面鎖住,並在記憶體裡拿掉兩份清單證明這幾格量得到。
  //    句尾也收收尾的引號 / 括號(」』”"’'）)]】〕〉》)、刪節號(…⋯)、emoji,以及只在訊息最後的冒號(RC-LANG-FP 規格核對必修 2):
  //    hook 對 mention 印「直接說「發版」即可」,user 照著連引號打出 「發版」 若仍判 mention,就永遠落不了地(繞圈);
  //    「發版🙏」「可以改，發版🙏」「（發版）」也是同一類。代價照實寫:轉述句「你說「發版」。」也判 consent
  //    (base f87872c8 本來就判 consent,不是新放寬)。引號 / 括號後面還接著字(「發版」流程、發版（beta.140）)仍是 mention。
  //    2026-11-22(工作包 N1-PREP,帳本 J-b989803a2d):同意詞後面只接空白 / 標點 + 禮貌或附和詞(courtesyTails:謝謝 / 感謝 /
  //    OK / 好的 …)一路到訊息結尾 → consent。RC-LANG-FP 之後「可以改，發版 謝謝」「發版 謝謝」「發版 OK」判 mention,hook 不落地、
  //    要 user 再說一次「發版」;user 明說過不要一再要他說(governance/memory/feedback_solo_dev_workflow.md:12)。
  //    詞表不分大小寫;👍 / 🙏 這類 emoji 不必列,directiveEndings 本來就把 emoji 當語助詞。只放寬這一類(N1-PREP 審查必修 1 收窄):
  //    禮貌詞後面還接著別的字的,不論中間有沒有標點 ——「發版 謝謝，但先不要」「發版 OK，開玩笑的」「發版 謝謝，算了」
  //    「發版 謝謝你們之前的幫忙,但先不要」—— 照原文比對,判定與沒有詞表時相同(mention);同意詞後面先接受詞(「發版到 npm 謝謝」)也是 mention。
  //    刻意保守的邊界:「發版 謝謝。另外那個也看一下」這種禮貌詞後面另起一句的也照原文判 mention(hook 會出聲)。
  //    沒有禮貌詞、標點直接接字的(「發版，但先不要」= consent)是 RC-LANG-FP 既有的標點邊界,這次不動。
  //    否定 / 條件 / 問句在前面幾步就判定,不受詞表影響。`scripts/test-release-consent.mjs` 5i 兩面鎖住:逐條拿掉詞證明量得到,
  //    並把每一句只接禮貌詞的同意句後面接上「，但先不要」這類尾巴,逐句核對判定與沒有詞表時相同。
  if (!consentPhraseUses(value, policy).directive) {
    return { verdict: 'mention', reason: '講的是別次或已發生的事,或把發版當名詞 / 修飾語用;沒有一處是在指示現在發版' }
  }
  return { verdict: 'consent', reason: '明確同意' }
}

/**
 * AI 那一側用(release-self-audit Mechanism 12):AI 請 user 說這段字(「說「X」」的 X),或把它當提問選項 label,
 * 算不算在向 user 要發版同意。判定照樣交給 classifyConsentPrompt,不另寫詞表:
 *   consent → 算。
 *   mention 且有一處同意詞前面不是 上次 / 已 / 沒 …(只是後面還接著字:「發版到 npm」「發版 beta.140」「立刻發版並更新 Storybook」)
 *     → 算。AI 仍是在請 user 授權發版;user 照打雖然不會落地(hook 會請他再說「發版」),但這正是 Mechanism 12 要先看紀錄的時刻。
 *     第 7 步加進來以前這些都判 consent、都算在要(base f87872c8),這裡維持原樣。
 *   mention 且每一處都緊接 上次 / 已 / 沒 …(「還原已發布的 Button tertiary xs」)→ 不算:講的是別次或已發生的發版。
 *     base 判 consent、算在要,是誤判(user 2026-10-27 回覆裡引的選項文字就是這句)。
 *   question / deferred / withdraw / none → 不算。「先不發版」這類 RC-LANG-FP 新判 withdraw 的,base 判 consent、算在要,現在不算。
 * 兩面在 scripts/test-release-self-audit.mjs「AI 端:同意詞後面還接著字」那一段鎖住(RC-LANG-FP 規格核對必修 1)。
 */
export function isReleaseRequestPhrase(text, policy = loadConsentPolicy()) {
  const { verdict } = classifyConsentPrompt(text, policy)
  if (verdict === 'consent') return true
  return verdict === 'mention' && consentPhraseUses(String(text), policy).unprefixed
}

// 直接執行時當成小 CLI:從 stdin 讀整段原話,印出判定。
// hook(bash)靠它消費同一份判準 —— 不讓 bash 再自己寫一套 regex(那正是三方漂移的來源)。
//   (無參數)   → `<verdict>\t<reason>`(record_release_consent.sh)
//   --question → `question` 或 `statement`(check_propose_without_benchmark.sh 的「先回一句」)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const chunks = []
  process.stdin.on('data', (c) => chunks.push(c))
  process.stdin.on('end', () => {
    const text = Buffer.concat(chunks).toString('utf8')
    if (process.argv.includes('--question')) {
      process.stdout.write(`${isQuestionText(text) ? 'question' : 'statement'}\n`)
      return
    }
    const { verdict, reason } = classifyConsentPrompt(text)
    process.stdout.write(`${verdict}\t${reason}\n`)
  })
}
