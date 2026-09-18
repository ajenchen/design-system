#!/usr/bin/env node
// Converts the latest genuine user message in a provider transcript into bounded,
// machine-readable design-edit authorization evidence. Denial and uncertainty always win.

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

function textContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((item) => item && typeof item === 'object' && item.type !== 'tool_result')
    .map((item) => typeof item.text === 'string' ? item.text : '')
    .filter(Boolean)
    .join('\n')
}

function jsonValues(text) {
  const values = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') { inString = true; continue }
    if (char === '{' || char === '[') {
      if (depth === 0) start = index
      depth += 1
    } else if (char === '}' || char === ']') {
      if (depth === 0) continue
      depth -= 1
      if (depth === 0 && start >= 0) {
        try { values.push(JSON.parse(text.slice(start, index + 1))) } catch {}
        start = -1
      }
    }
  }
  return values
}

function toolResultText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((item) => item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
}

// 解析視窗:先只看尾端 4MiB(絕大多數 session 夠用),找不到任何真人訊息才逐級放大到整份。
// 2026-09-16 錨(fail-closed-forever):長 session 的 transcript 會長到數百 MB,user 那則指示會被
// 4MiB 硬截斷擠出視窗 → 閘回報 NO_USER_MESSAGE,之後**任何**改動都永久擋住,而且怎麼做都救不回來
// (同一筆操作在訊息還在視窗內時 approved、幾分鐘後就 blocked,判定隨檔案長大而漂移)。
// 放大視窗不放寬任何判準,只是把判準本來就該讀到的輸入還原;檔案本來就整份讀進記憶體,額外成本只有解析。
const TRANSCRIPT_PARSE_WINDOWS = [4, 16, 64, 256].map((mib) => mib * 1024 * 1024)

// 視窗夠不夠,要看的是「有沒有**真人**訊息」,不是「有沒有 role=user 的 record」——
// harness 的背景通知、工具結果、壓縮摘要都是 role=user 卻不是使用者說的話(判準與下方主迴圈同一組)。
function hasGenuineUserRecord(records) {
  return records.some((record) => {
    const message = record?.message || record
    if (message?.role !== 'user') return false
    if (record?.isMeta === true || typeof record?.sourceToolUseID === 'string') return false
    const text = textContent(message.content).trim()
    if (!text) return false
    if (/^\[SYSTEM NOTIFICATION\b/u.test(text) || text.includes('<task-notification>')) return false
    return !/^This session is being continued from a previous conversation/u.test(text)
  })
}

function transcriptState(transcriptPath) {
  const stat = statSync(transcriptPath)
  if (!stat.isFile()) throw new Error('transcript is not a regular file')
  // A partial first line is discarded by jsonValues.
  const body = readFileSync(transcriptPath)
  let records = []
  for (const window of [...TRANSCRIPT_PARSE_WINDOWS, Number.POSITIVE_INFINITY]) {
    const bounded = body.length > window ? body.subarray(body.length - window) : body
    records = jsonValues(bounded.toString('utf8'))
    if (hasGenuineUserRecord(records)) break
    if (bounded.length === body.length) break
  }
  const userMessages = []
  let lastUserRecordIndex = -1
  // AskUserQuestion selections are genuine user decisions delivered as harness-authored
  // tool_result records (role:user), which `textContent` rightly excludes from user speech for
  // every ORDINARY tool (tool output is data, not the user's voice). The selection event itself,
  // however, is the user's — the assistant cannot author user-role records — so it is collected
  // here as a distinct evidence channel. The approval bytes come only from the harness result
  // text; the assistant-authored proposal text that preceded the question is captured separately
  // and may contribute TARGET BINDING only, never approval semantics (canon: the user approves
  // 「當下 pending 的 exact 提案」, and the pending proposal is what the assistant just presented).
  const askUserQuestionToolUseIds = new Set()
  const assistantTexts = []
  for (const [index, record] of records.entries()) {
    const message = record?.message || record
    if (message?.role !== 'assistant' || !Array.isArray(message.content)) continue
    for (const item of message.content) {
      if (item && typeof item === 'object' && item.type === 'tool_use'
        && item.name === 'AskUserQuestion' && typeof item.id === 'string') {
        askUserQuestionToolUseIds.add(item.id)
      }
    }
    const text = message.content
      .filter((item) => item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('\n')
      .trim()
    if (text) assistantTexts.push({ index, text })
  }
  const plainUserRecordIndexes = []
  let latestSelection = null
  for (const [index, record] of records.entries()) {
    const message = record?.message || record
    if (message?.role !== 'user') continue
    if (Array.isArray(message.content)) {
      for (const item of message.content) {
        if (item && typeof item === 'object' && item.type === 'tool_result'
          && askUserQuestionToolUseIds.has(item.tool_use_id)) {
          const answerText = toolResultText(item.content).trim()
          if (answerText) latestSelection = { index, answerText }
        }
      }
    }
    const text = textContent(message.content).trim()
    if (!text) continue
    // Harness-authored background events (task/monitor notifications) are recorded as
    // user-role text but are explicitly NOT user input — their own banner says so. They must
    // never count as user speech: as "latest user message" they would displace a genuine
    // pending decision, and their free-form summaries could pattern-match approval or denial.
    if (/^\[SYSTEM NOTIFICATION\b/u.test(text) || text.includes('<task-notification>')) continue
    // Harness-injected meta records (skill / reference text loaded by a tool call: `isMeta` +
    // `sourceToolUseID`) are likewise not the user's voice — 2026-09-02 anchor: a loaded
    // workflow-authoring reference displaced the user's real directive as "latest user message".
    if (record?.isMeta === true || typeof record?.sourceToolUseID === 'string') continue
    // Context-compaction summaries are recorded as user-role text but are written by the
    // ASSISTANT, not the user — 2026-09-12 anchor: after a compaction the summary became the
    // "latest user message", so every later substantive edit was judged against AI-authored
    // prose instead of the user's actual directive (observed reasonCode:
    // TARGET_BOUND_DISCUSSION_OR_QUESTION, while the user's real message sat two records above).
    // Excluding them is a TIGHTENING, and that is the point: a summary quoting or paraphrasing
    // earlier approval ("the user approved X") would otherwise let the assistant's own words
    // authorize the assistant's own edit. M36(a): 引用 ≠ 決定,AI 轉述永遠不是 user 權威。
    if (/^This session is being continued from a previous conversation/u.test(text)) continue
    userMessages.push(text)
    lastUserRecordIndex = index
    plainUserRecordIndexes.push(index)
  }
  let latestAskUserSelection = null
  // A later plain user message normally supersedes the selection. The one exception is a message
  // that merely RESTATES the same delegation ("照你建議", "我不是說了嗎") — 2026-09-12 anchor: the
  // user answered an AskUserQuestion with 同意,照這個做, the assistant still blocked, and the user's
  // next message was an angry restatement of the very same delegation. Treating that restatement as
  // "supersedes" threw away the target binding the user had just given and demanded the approval a
  // third time. Restating an instruction is not withdrawing it.
  // Deliberately narrow: it carries forward only while EVERY later plain message is a bare
  // delegation/affirmation with no denial. A denial, a new directive, or a follow-up question all
  // still supersede — those are the cases the original rule exists for.
  const carriesSelectionForward = (text) => {
    const normalized = normalizeText(text)
    if (!normalized) return false
    if (matchesAny(TARGET_DENIAL_PATTERNS, withoutNoWaitClauses(normalized))) return false
    if (matchesAny(TARGETLESS_SCOPE_DENIAL_PATTERNS, normalized)) return false
    return matchesAny(UI_DELEGATED_RESEARCH_PATTERNS, normalized)
      || matchesAny(SELECTION_RESTATEMENT_PATTERNS, normalized)
  }
  if (latestSelection) {
    const laterPlain = plainUserRecordIndexes
      .map((index, order) => ({ index, text: userMessages[order] }))
      .filter((entry) => entry.index > latestSelection.index)
    if (laterPlain.length && laterPlain.every((entry) => carriesSelectionForward(entry.text))) {
      lastUserRecordIndex = Math.min(lastUserRecordIndex, latestSelection.index - 1)
    }
  }
  if (latestSelection && latestSelection.index > lastUserRecordIndex) {
    // Valid only while it is the newest user event: any later plain user message (a follow-up
    // question, a denial, a new directive) supersedes the selection and flows through the
    // ordinary classifier instead.
    const plainBefore = plainUserRecordIndexes.filter((index) => index < latestSelection.index)
    const proposalFloor = plainBefore.length ? plainBefore.at(-1) : -1
    const proposalText = assistantTexts
      .filter((entry) => entry.index > proposalFloor && entry.index < latestSelection.index)
      .map((entry) => entry.text)
      .join('\n')
    latestAskUserSelection = { answerText: latestSelection.answerText, proposalText }
  }
  return {
    records,
    userMessages,
    latestUserMessage: userMessages.at(-1) ?? '',
    latestAskUserSelection,
    turnRecords: lastUserRecordIndex >= 0 ? records.slice(lastUserRecordIndex + 1) : [],
  }
}

function normalizedUnicodeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replaceAll(/\p{Default_Ignorable_Code_Point}+/gu, '')
}

function normalizeText(value) {
  return normalizedUnicodeText(value).replaceAll(/\s+/g, ' ').trim()
}

function messageClauses(value) {
  return normalizedUnicodeText(value)
    .replaceAll(/([。！？!?；;，,]+)/gu, '$1\n')
    .split(/\r?\n/u)
    .map((clause) => clause.replaceAll(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function messageBlocks(value) {
  return normalizedUnicodeText(value)
    .split(/\r?\n/u)
    .map((block) => block.replaceAll(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function normalizeTarget(value) {
  const raw = String(value || '').normalize('NFKC').replaceAll('\\', '/').replace(/^\.\/+/, '')
  const roots = ['packages/', 'apps/', 'node_modules/']
  const offsets = roots.map((root) => raw.indexOf(root)).filter((offset) => offset >= 0)
  return offsets.length ? raw.slice(Math.min(...offsets)) : raw.replace(/^\/+/, '')
}

function targetAliases(target) {
  const normalized = normalizeTarget(target)
  const segments = normalized.split('/').filter(Boolean)
  const basename = segments.at(-1) ?? ''
  const stem = basename.replace(/\.[^.]+$/, '')
  const aliases = new Set([normalized, basename, stem])
  // 2026-09-02 詞彙缺口:user 口語寫「agent logo」「AgentLogo」而非檔名 `agent-logo` → 同一 exact target。
  const stemTokens = stem.split(/[-_.]+/u).filter(Boolean)
  if (stemTokens.length > 1) {
    aliases.add(stemTokens.join(' '))
    aliases.add(stemTokens.join(''))
  }
  const componentIndex = segments.lastIndexOf('components')
  const componentDir = componentIndex >= 0 ? segments[componentIndex + 1] ?? '' : ''
  if (componentDir) {
    aliases.add(componentDir)
    // 家族檔(components/AgentPanel/agent-fab.tsx):檔名的家族前綴 = 目錄前綴 → 其餘 token
    // (「fab」「logo」)就是 user 對該檔的日常稱呼;非家族檔不放寬(避免泛用字誤綁)。
    const family = stemTokens[0] ?? ''
    if (family && componentDir.toLowerCase().startsWith(family.toLowerCase()) && stemTokens.length > 1) {
      const rest = stemTokens.slice(1)
      // `rest.join(' ')` 在 rest 只有一個 token 時就等於那個 token 本身(`data-table` → 「table」),
      // 所以這條也要走同一道泛用字檢查,否則下面的過濾等於白做(2026-09-12 CI 實測 11b 仍紅)。
      // 多個 token 的片語(「panel logo」)夠具體,不受限。
      if (rest.length > 1 || !componentDir.toLowerCase().includes(rest[0]?.toLowerCase() ?? '')) {
        aliases.add(rest.join(' '))
      }
      // 單一 token 只有在它**不是元件目錄名的一部分**時才夠格單獨當別名(2026-09-12 收緊)。
      // 理由:目錄已經含有的字不提供任何辨識資訊 ——「table」之於 `DataTable`、「panel」之於
      // `AgentPanel` 都是泛用字,放進別名等於「任何一句提到 table 的話都能授權改 data-table.tsx」
      // (CI 實測:「metadata table的排序箭頭改成跟 label 連動」直接綁定成功)。
      // 「fab」「logo」不在 `AgentPanel` 裡,才是 user 真的在指那一個檔 —— 本規則原本要收的就是這種,
      // 上面的註解也寫著「避免泛用字誤綁」,只是沒有實際擋住。
      const dirKey = componentDir.toLowerCase()
      for (const token of rest) {
        if (!dirKey.includes(token.toLowerCase())) aliases.add(token)
      }
    }
  }
  return [...aliases].filter((alias) => alias.length >= 3)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 中英夾雜的詞界(2026-09-12)。原本前後都只認「非字母數字」當邊界,但中文**不會**在英文詞後面
// 加空格 —— user 寫「data table整體互動和體驗越順暢越好」時,`table` 後面的「整」是 `\p{L}`,
// 於是別名 `data table` 判成「詞還沒結束」而綁定失敗,已授權的 exact target 被當成沒綁定
// (實測 reasonCode = EXACT_UI_UX_TARGET_BINDING_MISSING)。
// **刻意寫窄**:只有「別名邊緣是 ASCII 英數、相鄰字是 CJK」才算詞界 —— 換字集就是換詞。
// 同字集內一律不放寬,所以 `metadata table` 仍不會綁到 `data-table`(前面是拉丁字母)。
const CJK_CLASS = '\\p{sc=Han}\\p{sc=Hiragana}\\p{sc=Katakana}\\p{sc=Hangul}'
const isAsciiAlnum = (ch) => /[A-Za-z0-9]/u.test(ch || '')
const aliasBoundaries = (alias) => ({
  before: isAsciiAlnum(alias.at(0)) ? `(?:^|[^\\p{L}\\p{N}]|[${CJK_CLASS}])` : '(?:^|[^\\p{L}\\p{N}])',
  after: isAsciiAlnum(alias.at(-1)) ? `(?:[^\\p{L}\\p{N}]|[${CJK_CLASS}]|$)` : '(?:[^\\p{L}\\p{N}]|$)',
})

function exactTargetBinding(message, target) {
  const normalized = normalizeText(message)
  for (const alias of targetAliases(target).sort((left, right) => right.length - left.length)) {
    const b = aliasBoundaries(alias)
    const pattern = new RegExp(`${b.before}${escapeRegExp(alias)}${b.after}`, 'iu')
    if (pattern.test(normalized)) return alias
  }
  return null
}

function exactAliasOccurrences(message, alias) {
  const normalized = normalizeText(message)
  const b = aliasBoundaries(alias)
  const pattern = new RegExp(
    `${b.before}(${escapeRegExp(alias)})(?=${b.after})`,
    'giu',
  )
  return [...normalized.matchAll(pattern)].length
}

function referenceOnlyTargetBinding(clause, binding) {
  if (exactAliasOccurrences(clause, binding) !== 1) return false
  const alias = escapeRegExp(binding)
  return [
    new RegExp(`(?:參考|對照|比照|仿照)\\s*(?:這個|該)?\\s*${alias}(?:\\b|$)`, 'iu'),
    new RegExp(`${alias}.{0,20}(?:僅供參考|作為參考|作為範例|當作參考|當作範例|當成參考|當成範例|是參考|是範例|是基準)`, 'iu'),
    new RegExp(`\\b(?:refer(?:ring)?\\s+to|compare(?:d)?\\s+(?:to|with))\\s+(?:the\\s+)?${alias}\\b`, 'iu'),
    new RegExp(`\\buse\\s+(?:the\\s+)?${alias}\\s+as\\s+(?:a\\s+)?(?:reference|example|baseline|guide)\\b`, 'iu'),
    new RegExp(`\\b${alias}\\s+(?:is|as)\\s+(?:a\\s+)?(?:reference|example|baseline|guide)\\b`, 'iu'),
    new RegExp(`(?:以|把)?\\s*${alias}\\s*(?:作為|當作|當成|視為|為)\\s*(?:一個)?\\s*(?:參考|範例|基準)`, 'iu'),
  ].some((pattern) => pattern.test(clause))
}

function actionableTargetBinding(clause, target) {
  const binding = exactTargetBinding(clause, target)
  return binding && !referenceOnlyTargetBinding(clause, binding) ? binding : null
}

const NO_WAIT_FOR_APPROVAL_PATTERNS = [
  /(?:不要|無需|不必|不用|不需要)\s*(?:再)?\s*(?:等待|等)\s*(?:我|使用者|user)?\s*(?:的)?\s*(?:核准|批准|同意|確認|授權|回覆)/giu,
  /\b(?:do\s+not|don't|dont|no\s+need\s+to)\s+wait\s+for\s+(?:my\s+|user\s+)?(?:approval|authorization|confirmation)\b/giu,
]

function withoutNoWaitClauses(message) {
  return NO_WAIT_FOR_APPROVAL_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, ' '),
    normalizeText(message),
  )
}

// 「不要改壞 / 別改錯」是「別弄壞」的要求,不是禁止修改 —— `改` 後面接 壞/錯/爛 不算 denial(2026-09-15:
// user 的常態叮嚀「確保不要改壞目前好的東西」把他剛選的核准判成撤回)。
const TARGET_DENIAL_PATTERNS = [
  /(?:先|暫時|現在)?\s*(?:不要|別|不准|禁止|停止|暫停|擱置|取消)\s*(?:再|先|直接|馬上|立刻)?\s*(?:改(?![壞錯爛])|修改|變更|實作|執行|套用|採用|發布|推送|合併|做)/u,
  /(?:不可以|不能|不可)\s*(?:再|直接)?\s*(?:改(?![壞錯爛])|修改|變更|做|執行|實作|採用|套用|發布)/u,
  /(?:不|不要|別|不可|不准|禁止)\s*(?:再)?\s*(?:採用|使用)/u,
  /(?:不要|別|不可|不准)\s*(?:再)?\s*(?:碰|動|觸碰)/u,
  /(?:保持|維持|保留).{0,24}(?:不變|原樣)/u,
  /(?:撤銷|撤回|取消).{0,16}(?:核准|批准|同意|決定|決策|授權|approval|authorization)/iu,
  /(?:不同意|不核可|不批准|拒絕|駁回).{0,16}(?:方案|方向|修改|變更|決策)?/u,
  /(?:方案|方向|做法).{0,8}(?:不好|不採用|不要|拒絕)/u,
  /\b(?:do\s+not|don't|dont|must\s+not|stop|pause|hold|cancel|reject|revoke)\b.{0,24}\b(?:change|edit|modify|implement|apply|adopt|ship|release|decision|approval|authorization)\b/iu,
  /\b(?:do\s+not|don't|dont|must\s+not|never)\s+(?:use|adopt)\b/iu,
  /\b(?:do\s+not|don't|dont)\s+(?:touch|alter)\b/iu,
  /\b(?:keep|leave|must\s+remain)\b.{0,24}\b(?:unchanged|as[-\s]+is)\b/iu,
]

const TARGET_DISCUSSION_PATTERNS = [
  /(?:是否|要不要|該不該|能不能|可不可以|怎麼想|先討論|先評估|提案|比稿)/u,
  /[?？]\s*$/u,
  /\b(?:should\s+we|can\s+we|could\s+we|proposal|discuss|evaluate)\b/iu,
]

/**
 * 委託研究:user 先問「是否可以 X?」再說「仔細研究看怎樣最完美 / 照你建議」= 把該題交給 agent 依證據
 * 收斂,不是等 user 拍板的未決題(2026-09-02;AGENTS.md「純工程不確定性由最高 certified model 收斂」)。
 * 只有同一則訊息含委託語句時,問句 clause 才不算 discussion;單獨問句仍 fail closed(問句 ≠ 同意)。
 */
const UI_DELEGATED_RESEARCH_PATTERNS = [
  /(?:研究|評估|判斷)(?:看|一下)?.{0,40}(?:最完美|最美觀|最好|最佳|最有質感|最合適|最自然|怎樣|如何|怎麼做)/u,
  /(?:照|依|按)\s*(?:你|妳)(?:的)?\s*(?:建議|判斷|專業)/u,
  /反正\s*(?:你|妳).{0,12}(?:研究|處理|決定|判斷)/u,
  /\b(?:research|figure\s+out|decide)\b.{0,32}\b(?:best|optimal|most\s+(?:polished|natural|refined))\b/iu,
  // 2026-09-12:這裡曾加過「你只要…就是沒問題的」這類**附條件委派** pattern,已撤回。
  // 撤回理由(兩個,都是實測):
  //   (1) **不生效**:`messageClauses`(本檔上方)在逗號斷句,「你只要確保…」與「就是沒問題的」
  //       會被切成兩個 clause,跨逗號的 pattern 永遠不成立 —— 加了等於死碼。
  //   (2) **動機不對**:它是 AI 在「自己的編輯被自家核准閘擋住」時加的。擴充核准語彙來讓
  //       自己通過,是自己批改自己的考卷;真正的核准通道是 AskUserQuestion(結構化選擇,
  //       target 綁定來自 user 選的那個選項本身)。
  // 若未來要收這類語意,必須先改 clause 切分的粒度(委派是句子層級屬性),而且由 user 發動,
  // 不是由被擋住的那一方發動。
]

/**
 * 重申 ≠ 收回(2026-09-12)。user 在 AskUserQuestion 選了「同意,照這個做」之後,若下一則訊息只是
 * **把同一個委派再講一次**(「我就跟你說照你建議了」「不要作繭自縛」),那不是新指令也不是否決。
 * 原本任何後續訊息都會讓前一個選擇失效 → 等於把 user 剛給的 target 綁定丟掉、再要一次核准。
 * 刻意只收「光是重申/肯定、沒有新內容」的句型;帶新指令、問句或否決的訊息一律照舊 supersede。
 */
const SELECTION_RESTATEMENT_PATTERNS = [
  /(?:我)?\s*(?:不是|就)?\s*(?:跟|對|同)\s*(?:你|妳)\s*(?:說|講)\s*(?:過)?.{0,16}(?:了|嗎)/u,
  /(?:照|依|按)\s*(?:這個|那個|你說的|我說的)\s*(?:做|改|來|處理)/u,
  /(?:不要|別|可不可以不要|可以不要)\s*作繭自縛/u,
  /^(?:同意|可以|好|沒錯|對|OK|ok)[,，。!！~\s]*$/u,
  /\b(?:i\s+(?:already\s+)?(?:said|told\s+you)|go\s+ahead|just\s+do\s+it|as\s+you\s+suggested)\b/iu,
]

const TARGET_BINARY_QUESTION_PATTERNS = [
  /(?:是否|要不要|該不該|能不能|可不可以)/u,
  /\b(?:should\s+we|can\s+we|could\s+we)\b/iu,
]

const TARGETLESS_SCOPE_DENIAL_PATTERNS = [
  /^(?:actually\s*[,，]?\s*)?(?:stop|cancel|hold|pause)(?:\s+(?:that|it))?[.!。！]*$/iu,
  /\b(?:actually\s*[,，]?\s*)?(?:do\s+not|don't|dont)\s+(?:do|proceed\s+with)\s+(?:that|it)\b/iu,
  /^(?:先|暫時|現在)?\s*(?:不要了|別做了|不要做了|停止|暫停|取消)[。！!]*$/u,
]

const UI_DECISION_MARKERS = [
  /\b(?:ui|ux|user-visible|product\s+semantics?|design\s+intent|component\s+contract|information\s+architecture|workflow|navigation|visual(?:\s+hierarchy)?|layout|spacing|padding|margin|gap|color|colour|typography|width|height|size|hover|focus|active|animation|transition|interaction|behavior|behaviour|content\s+semantics?|copy|label|icon|radius|shadow|border|opacity|variant|design\s+(?:token|rule)|state\s+machine|a11y|accessibility|wcag|aria|keyboard|disabled)\b/iu,
  /(?:介面|界面|使用者可感知|產品語意|設計意圖|元件契約|資訊架構|工作流程|導覽|視覺(?:層級)?|外觀|樣式|佈局|布局|間距|留白|顏色|色彩|配色|色系|紅色|藍色|綠色|紫色|漸層|漣漪|光圈|字體排印|尺寸|大小|寬度|高度|懸停|焦點|動畫|節奏|轉場|互動|行為|內容語意|文案|標籤|圖示|標誌|logo|圓角|陰影|邊框|透明度|變體|設計 (?:token|規則)|狀態機|無障礙|可及性|鍵盤|停用)/u,
]

/**
 * 判「這次改動是不是視覺/UI」時,**註解不算**(2026-09-12)。
 * 註解是在解釋「為什麼這樣改」,不是被執行的東西;拿它判授權分類會把純行為修正誤判成產品決策。
 * 錨:修「捲動停下後指標底下那一列不會被標記」這個 bug 時,改動的程式碼本身沒有任何視覺 token,
 * 但我在註解裡寫了「hover」二字,整個 edit 就被判成 product-ui-ux 而擋下 ——
 * 於是變成「為了解釋清楚而被罰」,也逼得 agent 去問 user 一個本來就該自主執行的工程修正
 * (user 2026-09-12 原話:「不是說過只有跟 ssot 相關的 ui/ux 需要我拍版決策嗎…其餘不要作繭自縛」)。
 * **這不是放寬**:真的改到樣式的程式碼照樣命中,只是不再因為文字說明而誤判。
 * 只剝 `//` 行註解與 `/* *​/` 區塊註解;JSX 文字、字串字面值都不動(那些是真的會被使用者看到的東西)。
 */
const stripCodeComments = (value) => String(value || '')
  .replaceAll(/\/\*[\s\S]*?\*\//gu, ' ')
  .replaceAll(/(^|[^:])\/\/[^\r\n]*/gu, '$1 ')

/**
 * 純註解操作(2026-09-15):把上面「註解不算」推到底。
 * old / new 剝掉註解與空白後一模一樣的 Edit,執行結果零差異,不可能是產品/UI/UX 決策 ——
 * 它唯一能改的是說明文字。這種操作不需要 exact target binding,也不需要 user 在最新訊息裡再授權一次;
 * 否則收尾階段每一句「把過期註解對齊現況」都會因為最新訊息含「設計語言」「視覺」而被判成 UI 決策擋下
 *(2026-09-15 錨:DataTable 結案 docblock 4 處過期敘述、PeoplePicker 舊公式註解,user 已要求
 * 「確保所有內容都有 ssot 沒有漂移」仍被 EXACT_UI_UX_TARGET_BINDING_MISSING 擋住)。
 *
 * 兩道檢查缺一不可,各擋一個混入口(都在「整檔套用改動後」的 before / after 上比,不在片段上比 ——
 * Edit 的 old_string 常是區塊註解的中段,片段本身沒有 `/*` `*​/`,逐片段剝註解會誤判成非註解):
 *   (1) 整檔剝註解、壓空白後相同 —— 擋型別、識別字、任何非註解字元的改動;
 *   (2) 整檔 TypeScript 去註解轉譯(transpileModule + removeComments)位元相同 ——
 *       擋 (1) 的盲點:字串或模板字面值裡的 `//` 會被 regex 當註解,真的字串改動就混過去;轉譯器不會。
 * `.css` 只有 `/* *​/` 註解、沒有轉譯器,只做 (1)。拿不到 typescript(消費者 repo 未安裝)→ 不算純註解(fail closed)。
 * Write / 找不到檔案 / old 不存在或不唯一 / old === new → 一律不算。
 */
let typescriptModule = null
try {
  typescriptModule = createRequire(import.meta.url)('typescript')
} catch {
  typescriptModule = null
}
const stripCssComments = (value) => String(value || '').replaceAll(/\/\*[\s\S]*?\*\//gu, ' ')
const collapseWhitespace = (value) => String(value || '').replace(/\s+/gu, ' ').trim()

function commentOnlyOperation(hookInput, target) {
  const toolName = hookInput?.tool_name
  const input = hookInput?.tool_input
  if (!input || typeof input !== 'object') return false
  const edits = toolName === 'Edit'
    ? [input]
    : toolName === 'MultiEdit' && Array.isArray(input.edits) && input.edits.length
      ? input.edits
      : null
  if (!edits) return false
  const filePath = String(input.file_path ?? input.path ?? '')
  if (!filePath || normalizeTarget(filePath) !== normalizeTarget(target)) return false
  const isCss = /\.css$/iu.test(filePath)
  const isScript = /\.(?:tsx|ts|jsx|js|mts|cts|mjs|cjs)$/iu.test(filePath)
  if (!isCss && !isScript) return false
  let before
  try {
    before = readFileSync(resolvePath(filePath), 'utf8')
  } catch {
    return false
  }
  const strip = isCss ? stripCssComments : stripCodeComments
  let after = before
  for (const edit of edits) {
    const oldString = String(edit?.old_string ?? '')
    const newString = String(edit?.new_string ?? '')
    if (!oldString || oldString === newString) return false
    const first = after.indexOf(oldString)
    if (first < 0) return false
    if (edit?.replace_all) {
      after = after.split(oldString).join(newString)
    } else {
      if (after.indexOf(oldString, first + 1) >= 0) return false
      after = after.slice(0, first) + newString + after.slice(first + oldString.length)
    }
  }
  if (after === before) return false
  if (collapseWhitespace(strip(before)) !== collapseWhitespace(strip(after))) return false
  if (isCss) return true
  if (!typescriptModule) return false
  const emit = (source) => typescriptModule.transpileModule(source, {
    fileName: filePath,
    reportDiagnostics: false,
    compilerOptions: {
      removeComments: true,
      jsx: typescriptModule.JsxEmit.Preserve,
      target: typescriptModule.ScriptTarget.ESNext,
      module: typescriptModule.ModuleKind.ESNext,
      sourceMap: false,
    },
  }).outputText
  try {
    return emit(before) === emit(after)
  } catch {
    return false
  }
}

function commentOnlyEvidence(target, { latestNormalized = null, operationText = '' } = {}) {
  return {
    schemaVersion: 1,
    kind: 'latest-user-design-authorization',
    decision: 'approved',
    reasonCode: 'COMMENT_ONLY_OPERATION_NO_RUNTIME_EFFECT',
    decisionDomain: 'engineering-remediation',
    target: target ? normalizeTarget(target) : null,
    targetBinding: 'comment-only-operation',
    latestUserMessageSha256: latestNormalized == null
      ? null
      : createHash('sha256').update(latestNormalized).digest('hex'),
    decisionMessageSha256: null,
    operationEvidenceSha256: createHash('sha256').update(operationText).digest('hex'),
  }
}

const UI_OPERATION_MARKERS = [
  /\b(?:className|style|css|tailwind|padding|margin|gap|color|background|width|height|hover|focus|animation|transition|opacity|border|shadow|radius|variant|disabled|tabIndex|role)\b/iu,
  /\b(?:onClick|onChange|onSubmit|onKeyDown|onKeyUp|onPointerDown|onPointerUp|onDrag|onDrop|navigate|router|route|href|placeholder|aria-[a-z-]+|label|copy|textContent)\b/iu,
  /\b(?:navigation|navigationFlow|workflow|informationArchitecture|visualHierarchy|typography|fontFamily|fontSize|fontWeight|lineHeight|letterSpacing|userVisible|userFacingStatus|statusLabel|contentSemantics|componentContract|designToken|designRule)\b/iu,
  />[^<>{}\r\n][^<>{}\r\n]*</u,
  /(?:使用者可感知|產品語意|設計意圖|元件契約|資訊架構|工作流程|導覽|視覺層級|樣式|顏色|字體排印|間距|留白|佈局|布局|尺寸|懸停|動畫|互動|內容語意|文案|圖示|圓角|陰影|邊框|設計規則)/u,
]

const HUMAN_ONLY_OPERATION_MARKERS = [
  /\b(?:complete|perform|approve|confirm)\b.{0,32}\b(?:interactive\s+login|mfa|2fa|oauth\s+consent|organization\s+owner\s+confirmation|billing\s+confirmation)\b/iu,
  /(?:完成|執行|核准|確認).{0,24}(?:互動式登入|登入驗證|MFA|2FA|OAuth\s*同意|組織擁有者確認|帳務確認)/iu,
  /\b(?:paste|reveal|print|extract|provide)\b.{0,32}\b(?:secret|credential|token|api\s+key|private\s+key)\b/iu,
  /(?:貼上|揭露|輸出|擷取|提供).{0,24}(?:秘密|憑證內容|token|API\s*key|私鑰)/iu,
  /\b(?:purchase|buy|enable)\b.{0,32}\b(?:paid\s+api|extra\s+credits?|additional\s+spend|new\s+subscription)\b/iu,
  /(?:購買|啟用).{0,24}(?:付費 API|額外 credits?|額外費用|新訂閱)/iu,
  /\b(?:accept|sign|make)\b.{0,32}\b(?:legal\s+terms|contract|business\s+commitment)\b/iu,
  /(?:接受|簽署|做出).{0,24}(?:法律條款|合約|商業承諾)/u,
]

const DESTRUCTIVE_OR_BYPASS_OPERATION_MARKERS = [
  /\bgit\s+push\b[^\r\n]*\s--force(?:-with-lease)?\b/iu,
  /\bgit\s+(?:reset\s+--hard|clean\s+-[a-z]*f[a-z]*)\b/iu,
  /\b(?:bypass|disable|weaken|lower|remove)\b.{0,48}\b(?:required\s+checks?|branch\s+protection|rulesets?|hard\s+gates?)\b/iu,
  /(?:繞過|停用|削弱|降低|移除).{0,32}(?:required checks?|branch protection|ruleset|hard gate|必要檢查|分支保護)/iu,
]

const ENGINEERING_INTENT_PATTERNS = [
  /\b(?:bug|bugfix|fix|repair|correct|refactor|test|testing|governance|infra|infrastructure|remediation|regression|root\s+cause|type\s+error|typescript|compile|build|ci|hook|parser|schema|drift|ssot|source-level|a11y|accessibility|wcag|conformance|alignment|mechanical|synchroni[sz]e|restore|parity)\b/iu,
  // 效能是 AGENTS.md:129「Bug fix / clean / refactor / 命名一致 / **perf** / a11y / test / audit / verify | **AUTO**」
  // 明列的自主類別,但詞彙表漏了它(2026-09-16 錨:user「要確保效能有最佳化過吧?但不要改壞原本好的東西」被判 UI 取捨擋下)。
  /(?:效能|最佳化|優化|加速|變慢|卡頓|延遲|記憶體|洩漏)/u,
  /\b(?:perf(?:ormance)?|optimi[sz](?:e|ation)|latency|throughput|memory\s+leak)\b/iu,
  /(?:修 bug|修復|修正|除錯|重構|測試|治理|基礎設施|修補|回歸|根因|型別錯誤|編譯|建置|鉤子|解析器|結構描述|漂移|單一來源|原始碼修正|無障礙|可及性|符合|遵循|對齊|同步|機械|還原|恢復|一致性)/u,
]

// Source bytes can look visual even when the requested action is a pure engineering
// remediation (for example, restoring an existing hover token or correcting aria-expanded).
// Only an exact target-bound remediation scope may use that authority; generic engineering
// delegation must never authorize an otherwise-unresolved product/UI/UX choice.
const REMEDIATION_ACTION_PATTERNS = [
  /\b(?:bugfix|fix|repair|correct|refactor|remediat(?:e|ion)|regression|align|alignment|conform|conformance|synchroni[sz]e|restore|mechanical|implement)\b/iu,
  /(?:修 bug|修復|修正|除錯|重構|修補|回歸|對齊|同步|機械|還原|恢復|符合|遵循|實作|落地|最佳化|優化)/u,
]

const EXISTING_REQUIREMENT_PATTERNS = [
  /\b(?:existing|current|canonical|ssot|spec(?:ification)?|contract|baseline|documented|defined|approved|established)\b/iu,
  /(?:既有|現有|目前|canonical|SSOT|規格|契約|基準|已記錄|已定義|已核准|已拍板|已確立)/u,
]

const UNRESOLVED_UI_CHOICE_PATTERNS = [
  /(?:還是|二選一|選哪(?:個|一個|種)|哪(?:個|一個|種).{0,12}(?:比較好|較好|更好)|何者)/u,
  /(?:由你|你來|自行|agent).{0,16}(?:選擇|決定|拍板|判斷)/iu,
  /(?:請|讓)?\s*(?:你|agent).{0,16}(?:選|挑|決定|拍板).{0,16}(?:最佳|最好|最適合)/iu,
  /(?:選|挑).{0,12}(?:最佳|最好|最適合).{0,12}(?:顏色|色彩|方案|選項|樣式|版型)/u,
  /\b(?:which|versus|vs\.?|trade-?off|choose\s+for\s+me|decide\s+for\s+me)\b/iu,
  /\b(?:choose|select|pick|decide).{0,20}\b(?:best|optimal|most\s+suitable)\b/iu,
]

const UI_HUMAN_DECISION_RESERVATION_PATTERNS = [
  /(?:未經|除非).{0,16}(?:我|使用者).{0,16}(?:拍板|核准|批准|同意|決定|選擇)/u,
  /(?:不得|禁止|不准|不可).{0,16}(?:由)?(?:你|agent|自行).{0,16}(?:選擇|決定|拍板|判斷)/iu,
  /(?:不得|禁止|不准|不可|不要).{0,24}(?:改變|修改|變更|重寫).{0,16}(?:ui|ux|產品語意|設計語意|ssot)/iu,
  /\b(?:unless|without)\b.{0,24}\b(?:my|user|human)\b.{0,24}\b(?:approval|decision|choice|sign[-\s]*off)\b/iu,
  /\b(?:must\s+not|may\s+not|cannot)\b.{0,24}\b(?:you|agent)\b.{0,24}\b(?:choose|select|decide)\b/iu,
  /\b(?:must\s+not|may\s+not|do\s+not)\b.{0,24}\b(?:change|modify|rewrite)\b.{0,24}\b(?:ui|ux|product\s+semantics?|ssot)\b/iu,
]

function uiHumanReservedClauses(message) {
  const reserved = new Set()
  let listIsHumanReserved = false
  for (const rawLine of normalizedUnicodeText(message).split(/\r?\n/u)) {
    const line = rawLine.replaceAll(/\s+/g, ' ').trim()
    if (!line) continue
    const isListItem = /^[-*]\s+/u.test(line)
    if (isListItem) {
      if (listIsHumanReserved) {
        for (const clause of messageClauses(line)) reserved.add(clause)
      }
      continue
    }
    listIsHumanReserved = /[:：]\s*$/u.test(line)
      && matchesAny(UI_HUMAN_DECISION_RESERVATION_PATTERNS, line)
    if (listIsHumanReserved) {
      for (const clause of messageClauses(line)) reserved.add(clause)
    }
  }
  return reserved
}

const NON_AUTHORITATIVE_UI_STATEMENT_PATTERNS = [
  /(?:不代表|並非|不是).{0,20}(?:我的)?\s*(?:決定|決策|核准|批准|同意|授權|選擇)/u,
  /(?:僅|只)\s*(?:是)?\s*(?:引用|引述|轉述|參考|別人(?:的)?建議|他人(?:的)?建議)/u,
  /(?:下面|以下).{0,16}(?:別人|他人|第三方|reviewer|審查者).{0,16}(?:建議|提案|說法)/iu,
  /(?:reviewer|審查者|別人|他人|第三方).{0,16}(?:說|表示|寫道|建議|提議|said|says?|wrote|suggested|proposed)/iu,
  /\b(?:not\s+my\s+(?:decision|approval|authorization)|not\s+an?\s+(?:decision|approval|authorization)|someone\s+else'?s\s+(?:suggestion|proposal))\b/iu,
]

// AskUserQuestion 的 tool_result 是 harness 寫的 `The user answered: "<題目>"="<回答>"`(多題以換行串接)。
// 判「猶豫 / 拒絕 / 討論」只能看 user 回答的那段,題目是 assistant 寫的;沒有分隔符就整段當回答(舊格式)。
function selectionAnswerOnly(text) {
  const raw = String(text || '')
  if (!/^\s*The user answered:/u.test(raw)) return raw
  const answers = raw.split(/(?=The user answered:)/u).map((chunk) => {
    const at = chunk.indexOf('"="')
    return at >= 0 ? chunk.slice(at + 3).replace(/"\s*$/u, '') : ''
  }).filter(Boolean)
  return answers.length ? answers.join('\n') : raw
}
// 「照 / 依 / 按 / 就(你的)建議|提議|推薦」是接受建議,不是「還在建議」—— 判 tentative 前先換成中性詞。
const withoutAcceptancePhrases = (text) => String(text || '')
  .replace(/(?:照|依|按|就)\s*(?:你|您)?\s*(?:的)?\s*(?:建議|提議|推薦)/gu, '照辦')

const TENTATIVE_OR_CONDITIONAL_UI_PATTERNS = [
  /(?:還在|正在|先)?\s*(?:考慮|評估|思考|猶豫|未決定|尚未決定|暫定|提議|建議)/u,
  /(?:也許|或許|可能|大概|傾向)/u,
  /(?:如果|若|假如|倘若|除非|只要|等到).{0,64}(?:就|才|再|則)/u,
  /(?:等|待).{0,32}(?:同意|核准|批准|確認|完成|發生|到位)(?:後|之後|再)/u,
  /\b(?:considering|still\s+considering|thinking\s+about|maybe|perhaps|tentative|proposed|if|unless|provided\s+that|subject\s+to)\b/iu,
]

const GENERIC_CONTINUATION_PATTERNS = [
  /^(?:go\s+ahead|continue|proceed|carry\s+on|do\s+it|繼續|繼續做|照做|開始吧|執行吧|做吧|全部做完)[.!。！]*$/iu,
]

const ENGINEERING_TARGET_PATTERNS = [
  /(?:^|\/)(?:hooks?|tests?|scripts?|infra|governance)(?:\/|$)/iu,
  /(?:^|\/)[^/]*\.(?:test|spec)\.[^/]+$/iu,
]

const GOVERNANCE_ACTION_FAMILIES = [
  'protected-git-delivery',
  'external-activation',
  'github-reconciliation',
  'release-train',
  'consumer-bootstrap',
  'consumer-control-plane-update',
  'fleet-rollout',
  'runtime-certification',
  'rollback-recovery',
]
const GOVERNANCE_ACTION_TARGET = new RegExp(
  `^governance-action/v1/(${GOVERNANCE_ACTION_FAMILIES.join('|')})/sha256:([a-f0-9]{64})/sha256:([a-f0-9]{64})$`,
  'u',
)

function governanceActionTarget(target, operationEvidenceSha256) {
  if (!target.startsWith('governance-action/')) return null
  const match = target.match(GOVERNANCE_ACTION_TARGET)
  if (!match) return { status: 'invalid' }
  if (match[3] !== operationEvidenceSha256) {
    return { status: 'operation-digest-mismatch' }
  }
  return {
    status: 'valid',
    family: match[1],
    authorityDigest: match[2],
  }
}

const STANDING_ENGINEERING_DELEGATION_PATTERNS = [
  /(?:所有|任何|一切|全部).{0,48}(?:engineering|bug|refactor|test|governance|infra|工程|修復|重構|測試|治理|基礎設施)/iu,
  /\b(?:all|any)\b.{0,48}\b(?:engineering|bugs?|refactors?|tests?|governance|infra(?:structure)?|remediation)\b/iu,
]

const DELEGATED_AUTHORITY_SCOPES = Object.freeze([
  'consumer-template-adoption',
  'engineering-execution',
  'external-activation',
  'github-configuration',
  'mechanical-approved-ssot-projection',
  'package-release',
  'protected-git-delivery',
  'rollback-recovery',
  'rollout',
  'runtime-certification',
  'testing-and-harness',
])
const HUMAN_ONLY_AUTHORITY_SCOPES = Object.freeze([
  'account-holder-platform-action',
  'credential-reference-required',
  'legal-account-organization-business-decision',
  'plan-external-spend',
  'product-ui-ux-decision',
])
const CURRENT_OPERATION_SCOPE = 'current-target-operation'
const PRODUCT_UI_UX_CHANGE_SCOPE = 'product-ui-ux-change'
const AUTHORITY_SCOPE_PATTERNS = Object.freeze([
  ['consumer-template-adoption', [
    /\b(?:consumer|template|wm\s+onboarding|bootstrap|adoption)\b/iu,
    /(?:消費者|範本|模板|WM\s*導入|採用)/u,
  ]],
  ['engineering-execution', [
    /\b(?:source|code|implementation|refactor|bug\s*fix|adapter|hook|rule|schema|runner)\b/iu,
    /(?:原始碼|程式碼|實作|重構|修復|轉接器|鉤子|規則|結構描述|執行器)/u,
  ]],
  ['external-activation', [
    /\b(?:external\s+activation|managed\s+activation)\b/iu,
    /(?:外部啟用|受管啟用)/u,
  ]],
  ['github-configuration', [
    /\b(?:github\s+apps?|rulesets?|branch\s+protection|required\s+checks?|github\s+environments?|repository\s+settings?)\b/iu,
    /(?:GitHub\s*應用程式|分支保護|必要檢查|儲存庫設定)/u,
  ]],
  ['mechanical-approved-ssot-projection', [
    /\b(?:mechanical(?:ly)?|generation|generate|projection|sync(?:hroni[sz]e)?)\b.{0,64}\b(?:approved|existing|canonical|ssot)\b/iu,
    /(?:機械式|生成|投影|同步).{0,48}(?:已核准|既有|現有|canonical|SSOT)/u,
  ]],
  ['package-release', [
    /\b(?:release|publish|npm|package|tag)\b/iu,
    /(?:發布|發佈|套件|標籤)/u,
  ]],
  ['protected-git-delivery', [
    /\b(?:push|pull\s+request|pr|merge|protected[-\s]+git[-\s]+delivery)\b/iu,
    /(?:推送|合併請求|拉取請求|合併)/u,
  ]],
  ['rollback-recovery', [
    /\b(?:rollback|forward\s+recovery|recovery)\b/iu,
    /(?:回滾|復原|恢復)/u,
  ]],
  ['rollout', [
    /\b(?:rollout|fleet|canary|soak)\b/iu,
    /(?:推出|全量|灰度|金絲雀)/u,
  ]],
  ['runtime-certification', [
    /\b(?:runtime\s+certification|certif(?:y|ication))\b/iu,
    /(?:執行環境認證|運行環境認證)/u,
  ]],
  ['testing-and-harness', [
    /\b(?:tests?|testing|harness|clean-room)\b/iu,
    /(?:測試|驗證框架|乾淨環境)/u,
  ]],
])
const EXCLUSIVE_ENGINEERING_DELEGATION_PATTERNS = [
  /(?:只|僅|僅限)\s*(?:委派|授權)/u,
  /\b(?:only\s+delegate|delegate\s+only|only\s+authori[sz]e|authori[sz]e\s+only)\b/iu,
]
const ENGINEERING_SCOPE_DENIAL_PATTERNS = [
  /(?:不授權|未授權|沒有授權)/u,
  /(?:不得|禁止|不准|不可|不要)\s*(?:再|自行|直接|開始|啟動)?\s*(?:執行|進行|建立|修改|變更|發布|發佈|推送|合併|回滾|推出|使用|採用)/u,
  /\b(?:not\s+authori[sz]ed|not\s+delegated|deny|denied)\b/iu,
  /\b(?:do\s+not|don't|dont|must\s+not)\s+(?:execute|perform|start|create|modify|change|publish|push|merge|roll\s*out|use|adopt)\b/iu,
]

const ENGINEERING_SAFETY_GUARDRAIL_PATTERNS = [
  /(?:不得|禁止|不准|不可|不要).{0,48}(?:覆蓋既有版本|重發同一版本|違反\s*npm\s*immutable[-\s]*version)/iu,
  /\b(?:must\s+not|do\s+not|don't|dont)\b.{0,48}\b(?:overwrite\s+an?\s+existing\s+version|republish\s+the\s+same\s+version|violate\s+npm\s+immutable[-\s]*version)\b/iu,
]

const ENGINEERING_NON_REVOCATION_PATTERNS = [
  /(?:不得|禁止|不准|不可|不要).{0,40}(?:描述|標記|視為|宣稱).{0,40}(?:尚未發布|未發布|不可使用|不可用|未完成|被阻擋)/iu,
  /(?:不得|禁止|不准|不可|不要).{0,40}(?:阻止|阻擋|延後|推遲).{0,64}(?:發布|發佈|使用|採用|setup:all|sync-all|template|consumer|WM)/iu,
  /\b(?:must\s+not|do\s+not|don't|dont)\b.{0,40}\b(?:describe|label|mark|treat|claim)\b.{0,40}\b(?:unreleased|unavailable|incomplete|blocked)\b/iu,
  /\b(?:must\s+not|do\s+not|don't|dont)\b.{0,40}\b(?:block|delay|defer)\b.{0,64}\b(?:release|publish|use|adoption|setup:all|sync-all|template|consumer)\b/iu,
]

const UI_DIRECTIVE_PATTERNS = [
  /(?:同意|核可|批准|拍板|採用|採納|選擇|決定|改成|改為|換成|換掉|替換|改掉|調整|更新|設為|保留|移除|新增|使用)/u,
  /(?:方案|選項|option)\s*[A-Za-z0-9一二三四五六七八九十]+/iu,
  /\b(?:approve|approved|adopt|choose|select|change\s+to|set\s+to|keep|remove|add|use)\b/iu,
]

const OPERATION_SHA256_PATTERN =
  /\boperation(?:\s+evidence)?\s+sha(?:-?256)?\s*[:=]\s*([a-f0-9]{64})\b/iu

const GLOBAL_UI_SCOPE_PATTERN =
  /(?:(?:所有|任何|全部)\s*(?:產品|design-system|DS)?\s*(?:ui|ux|介面|界面|視覺|互動|產品設計)|\b(?:all|every)\s+(?:product\s+|design-system\s+)?(?:ui|ux|visual|interaction)s?\b)/iu

const GLOBAL_REMEDIATION_SCOPE_PATTERN =
  // 「確保效能有最佳化過」這種沒點名 target 的工程指示 = 全域 remediation scope(AGENTS.md:129 perf = AUTO);
  // 2026-09-16 錨:它原本連 scope 都綁不到,被判 EXACT_UI_UX_TARGET_BINDING_MISSING。
  /(?:(?:效能|perf(?:ormance)?)\s*(?:有|要|已)?\s*(?:被)?\s*(?:最佳化|優化|optimi[sz]ed?)|(?:最佳化|優化)\s*(?:一下)?\s*(?:效能|perf(?:ormance)?)|(?:修復|修正|對齊|同步|還原|恢復|實作|落地).{0,32}(?:所有|任何|全部).{0,48}(?:bug|缺陷|回歸|無障礙|可及性|a11y|accessibility|既有|現有|SSOT|規格)|(?:所有|全部|任何).{0,24}(?:規格書|規格|SSOT|既有|現有|已拍板|已核准|相關問題|問題|缺陷|bug).{0,64}(?:實作|落地|修復|修正|對齊|同步)|\b(?:fix|repair|correct|align|synchroni[sz]e|restore|implement)\s+(?:all|every)\b.{0,48}\b(?:bugs?|regressions?|a11y|accessibility|existing|documented|canonical|ssot|spec)\b|\b(?:implement|build)\s+(?:the\s+)?(?:entire|whole|full|all\s+of\s+the)\s+(?:approved\s+|ratified\s+)?spec(?:ification)?\b)/iu

const RESOLVED_UI_CHOICE_PATTERNS = [
  /(?:顏色|色彩|樣式|版型|間距|尺寸|大小|文案|標籤|圖示|互動|行為).{0,24}(?:改成|改為|換成|設為|採用|選擇|決定|統一)/u,
  /(?:改成|改為|換成|設為|採用|選擇|決定|統一).{0,24}(?:顏色|色彩|紅色|藍色|綠色|樣式|版型|間距|尺寸|大小|文案|標籤|圖示|互動|行為)/u,
  /\b(?:change|set|switch|standardi[sz]e|choose|select|adopt)\b.{0,32}\b(?:color|colour|style|layout|spacing|size|copy|label|icon|interaction|behavio(?:u)?r)\b/iu,
  /\b(?:color|colour|style|layout|spacing|size|copy|label|icon|interaction|behavio(?:u)?r)\b.{0,32}\b(?:change|set|switch|standardi[sz]e|choose|select|adopt)\b/iu,
]

function matchesAny(patterns, text) {
  return patterns.some((pattern) => pattern.test(text))
}

function containsUnsafeAuthorityUnicode(value) {
  return /[\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(String(value || ''))
}

function mentionedAuthorityScopes(clause) {
  const forcePushOnly = /\bforce(?:d)?[-\s]+push\b/iu.test(clause)
    || /(?:強制推送|強推)/u.test(clause)
  return AUTHORITY_SCOPE_PATTERNS
    .filter(([scope, patterns]) => (
      !(scope === 'protected-git-delivery' && forcePushOnly)
      && matchesAny(patterns, clause)
    ))
    .map(([scope]) => scope)
}

function engineeringScopeDelegation(message) {
  const clauses = messageBlocks(message).flatMap((block) => messageClauses(block))
  const exclusiveClauses = clauses.filter((clause) => (
    matchesAny(EXCLUSIVE_ENGINEERING_DELEGATION_PATTERNS, clause)
  ))
  const explicitlyAllowed = new Set(
    exclusiveClauses.flatMap((clause) => mentionedAuthorityScopes(clause)),
  )
  const explicitlyDenied = new Set()
  for (const clause of clauses) {
    const denialText = withoutNoWaitClauses(clause)
    if (matchesAny(ENGINEERING_SAFETY_GUARDRAIL_PATTERNS, denialText)) continue
    if (matchesAny(ENGINEERING_NON_REVOCATION_PATTERNS, denialText)) continue
    if (!matchesAny(ENGINEERING_SCOPE_DENIAL_PATTERNS, denialText)) continue
    for (const scope of mentionedAuthorityScopes(denialText)) explicitlyDenied.add(scope)
  }
  const allowed = new Set(
    exclusiveClauses.length ? explicitlyAllowed : DELEGATED_AUTHORITY_SCOPES,
  )
  for (const scope of explicitlyDenied) allowed.delete(scope)
  const denied = new Set(explicitlyDenied)
  if (exclusiveClauses.length) {
    for (const scope of DELEGATED_AUTHORITY_SCOPES) {
      if (!allowed.has(scope)) denied.add(scope)
    }
  }
  return {
    allowedScopes: [...allowed].sort(),
    deniedOrAmbiguousScopes: [...denied].sort(),
  }
}

function requestedAuthorityScope(classification, operationText = '') {
  if (classification.decisionDomain === 'product-ui-ux') return PRODUCT_UI_UX_CHANGE_SCOPE
  const governanceAction = String(classification.target || '').match(GOVERNANCE_ACTION_TARGET)
  if (governanceAction) {
    return {
      'consumer-bootstrap': 'consumer-template-adoption',
      'consumer-control-plane-update': 'consumer-template-adoption',
      'external-activation': 'external-activation',
      'fleet-rollout': 'rollout',
      'github-reconciliation': 'github-configuration',
      'protected-git-delivery': 'protected-git-delivery',
      'release-train': 'package-release',
      'rollback-recovery': 'rollback-recovery',
      'runtime-certification': 'runtime-certification',
    }[governanceAction[1]]
  }
  if (matchesAny(
    AUTHORITY_SCOPE_PATTERNS.find(([scope]) => (
      scope === 'mechanical-approved-ssot-projection'
    ))[1],
    operationText,
  )) {
    return 'mechanical-approved-ssot-projection'
  }
  if (/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:test|spec)\.[^/]+$/iu.test(
    String(classification.target || ''),
  ) || /\b(?:tests?|testing|harness|clean-room)\b/iu.test(operationText)
    || /(?:測試|驗證框架|乾淨環境)/u.test(operationText)) {
    return 'testing-and-harness'
  }
  return 'engineering-execution'
}

function scopedClassification(classification, { message = '', operationText = '' } = {}) {
  const delegation = engineeringScopeDelegation(message)
  const allowedScopes = [...delegation.allowedScopes]
  const requestedScope = requestedAuthorityScope(classification, operationText)
  if (classification.decision === 'approved'
    && classification.reasonCode === 'TARGET_BOUND_UI_UX_DECISION_APPROVED') {
    allowedScopes.unshift('approved-ui-ux-implementation')
  }
  const deniedOrAmbiguousScopes = new Set(delegation.deniedOrAmbiguousScopes)
  let decision = classification.decision
  let decisionDomain = classification.decisionDomain
  let reasonCode = classification.reasonCode
  if (decision === 'approved'
    && requestedScope !== PRODUCT_UI_UX_CHANGE_SCOPE
    && !delegation.allowedScopes.includes(requestedScope)) {
    decision = 'blocked'
    decisionDomain = 'engineering-remediation'
    reasonCode = 'ENGINEERING_SCOPE_DENIED_OR_NOT_DELEGATED'
    deniedOrAmbiguousScopes.add(requestedScope)
  }
  if (decision === 'blocked') {
    deniedOrAmbiguousScopes.add(
      classification.reasonCode === 'TARGET_BOUND_DENIAL_OR_REVOCATION'
        ? CURRENT_OPERATION_SCOPE
        : classification.decisionDomain === 'product-ui-ux'
          ? PRODUCT_UI_UX_CHANGE_SCOPE
          : requestedScope || CURRENT_OPERATION_SCOPE,
    )
  }
  const finalAllowedScopes = allowedScopes.filter((scope) => (
    !deniedOrAmbiguousScopes.has(scope)
  ))
  return {
    ...classification,
    decision,
    decisionDomain,
    reasonCode,
    allowedScopes: [...new Set(finalAllowedScopes)].sort(),
    humanOnlyScopes: [...HUMAN_ONLY_AUTHORITY_SCOPES],
    deniedOrAmbiguousScopes: [...deniedOrAmbiguousScopes].sort(),
  }
}

function remediationDecision(message, target) {
  const normalized = normalizeText(message)
  // 問句/暫定/轉述不構成授權(M36:問句 ≠ 同意;引用 ≠ 決定)。
  if (matchesAny(NON_AUTHORITATIVE_UI_STATEMENT_PATTERNS, normalized)) return null
  let latest = null
  for (const clause of messageClauses(normalized)) {
    if (matchesAny(TARGET_DISCUSSION_PATTERNS, clause)) continue
    const binding = actionableTargetBinding(clause, target)
      ?? (GLOBAL_REMEDIATION_SCOPE_PATTERN.test(clause)
        ? 'global-engineering-remediation-scope'
        : null)
    if (!binding || !matchesAny(REMEDIATION_ACTION_PATTERNS, clause)) continue
    // 全域修復授權(「確保所有相關問題都有一併被修正」)常與「該 SSOT 的部分都有確保 SSOT / 符合設計語言」分在不同句:
    // binding 是全域範圍時,UI / 既有需求的語彙看整則訊息(2026-09-16 錨:最終驗證抓到蓋板底色 token 錯,修正被擋)。
    const scopeIsUiOrExistingRequirement = matchesAny(UI_DECISION_MARKERS, clause)
      || matchesAny(EXISTING_REQUIREMENT_PATTERNS, clause)
      || (binding === 'global-engineering-remediation-scope'
        && (matchesAny(UI_DECISION_MARKERS, normalized) || matchesAny(EXISTING_REQUIREMENT_PATTERNS, normalized)))
    if (!scopeIsUiOrExistingRequirement) continue
    if (matchesAny(UNRESOLVED_UI_CHOICE_PATTERNS, clause)) continue
    latest = { binding, message: normalized, clause }
  }
  return latest
}

function toolOperations(records, hookInput, target) {
  const operations = []
  const add = (toolName, input) => {
    if (!['Edit', 'Write', 'MultiEdit'].includes(toolName) || !input || typeof input !== 'object') return
    const candidates = [input, ...(Array.isArray(input.edits) ? input.edits : [])]
    for (const candidate of candidates) {
      const path = candidate?.file_path ?? candidate?.path ?? input.file_path ?? input.path ?? ''
      if (normalizeTarget(path) !== normalizeTarget(target)) continue
      operations.push(JSON.stringify(candidate))
    }
  }
  for (const record of records) {
    const message = record?.message || record
    for (const item of Array.isArray(message?.content) ? message.content : []) {
      if (item?.type === 'tool_use') add(item.name, item.input)
    }
  }
  if (hookInput) add(hookInput.tool_name, hookInput.tool_input)
  return operations.join('\n')
}

function targetDecision(message, target, operationEvidenceSha256 = '') {
  const normalized = normalizeText(message)
  const clauses = messageClauses(message)
  const humanReservedClauses = uiHumanReservedClauses(message)
  const messageCannotAuthorizeProduct =
    matchesAny(NON_AUTHORITATIVE_UI_STATEMENT_PATTERNS, normalized)
    || matchesAny(TENTATIVE_OR_CONDITIONAL_UI_PATTERNS, normalized)
  const candidates = []
  const delegatedResearch = clauses.some((clause) => matchesAny(UI_DELEGATED_RESEARCH_PATTERNS, clause))
  for (const clause of clauses) {
    const targetBinding = actionableTargetBinding(clause, target)
    const globalUiBinding = GLOBAL_UI_SCOPE_PATTERN.test(clause) ? 'global-ui-scope' : null
    const binding = targetBinding ?? globalUiBinding
    if (!binding) continue
    const denialText = withoutNoWaitClauses(clause)
    // 「要不要改」contains the bytes「不要改」but is a question, not a revocation.
    if (targetBinding && matchesAny(TARGET_BINARY_QUESTION_PATTERNS, clause)) {
      // 同訊息已委託研究 → 問句是交辦題,不是未決題;不成為 discussion 也不成為 approval。
      if (delegatedResearch && !matchesAny(TARGET_DENIAL_PATTERNS, denialText)) continue
      candidates.push({ kind: 'discussion', binding, message: normalized, clause })
      continue
    }
    if (matchesAny(TARGET_DENIAL_PATTERNS, denialText)) {
      if (!targetBinding
        && globalUiBinding
        && (matchesAny(UI_HUMAN_DECISION_RESERVATION_PATTERNS, clause)
          || humanReservedClauses.has(clause))) continue
      candidates.push({ kind: 'denied', binding, message: normalized, clause })
      continue
    }
    if (matchesAny(UI_DECISION_MARKERS, clause)
      && matchesAny(UNRESOLVED_UI_CHOICE_PATTERNS, clause)
      && !matchesAny(UI_HUMAN_DECISION_RESERVATION_PATTERNS, clause)
      && !humanReservedClauses.has(clause)) {
      candidates.push({ kind: 'discussion', binding, message: normalized, clause })
      continue
    }
    if (targetBinding && matchesAny(TARGET_DISCUSSION_PATTERNS, clause)) {
      if (delegatedResearch && !matchesAny(TARGET_DENIAL_PATTERNS, denialText)) continue
      candidates.push({ kind: 'discussion', binding, message: normalized, clause })
      continue
    }
    if (targetBinding
      && matchesAny(UI_DECISION_MARKERS, clause)
      && matchesAny(UI_DIRECTIVE_PATTERNS, clause)) {
      if (messageCannotAuthorizeProduct) {
        candidates.push({
          kind: 'discussion',
          binding,
          message: normalized,
          clause,
        })
        continue
      }
      const declaredOperationSha256 = clause.match(OPERATION_SHA256_PATTERN)?.[1]?.toLowerCase() ?? ''
      // 2026-08-04 user verbatim「我在這裡說可以就是可以,就是授權給你」: an in-chat clause that
      // names the exact target and says yes IS the approval. Requiring the user to also quote an
      // operation digest was the same removed-ceremony family as the per-PR Ed25519 signature
      // (torn out in 835b519e) — cryptographic ritual with no consumer, punishing the owner for
      // approving in plain language. A digest is now optional corroboration: absent → approved on
      // the target-bound directive alone; present but wrong → still fails closed as an explicit
      // mismatch, because quoting a digest that does not match the pending operation is a real
      // contradiction, not a missing formality.
      candidates.push({
        kind: !declaredOperationSha256
          || declaredOperationSha256 === operationEvidenceSha256.toLowerCase()
          ? 'approved'
          : 'operation-binding-mismatch',
        binding,
        message: normalized,
        clause,
        declaredOperationSha256,
      })
    }
  }
  const messageScopeBinding = clauses
    .map((clause) => actionableTargetBinding(clause, target))
    .find(Boolean)
    ?? (GLOBAL_REMEDIATION_SCOPE_PATTERN.test(normalized) ? 'open-global-remediation-scope' : null)
  let activeChoiceDomain = null
  let messageHasUnresolvedUiChoice = false
  for (const block of messageBlocks(message)) {
    for (const clause of messageClauses(block)) {
      const clauseHasUiIntent = matchesAny(UI_DECISION_MARKERS, clause)
      const clauseHasExplicitUiScope = clauseHasUiIntent
        && (
          actionableTargetBinding(clause, target)
          || GLOBAL_UI_SCOPE_PATTERN.test(clause)
        )
      const clauseHasEngineeringScope = matchesAny(ENGINEERING_INTENT_PATTERNS, clause)
        || matchesAny(STANDING_ENGINEERING_DELEGATION_PATTERNS, clause)
      if (clauseHasExplicitUiScope) activeChoiceDomain = 'product-ui-ux'
      else if (clauseHasEngineeringScope) activeChoiceDomain = 'engineering-remediation'
      if (matchesAny(UNRESOLVED_UI_CHOICE_PATTERNS, clause)
        && !matchesAny(UI_HUMAN_DECISION_RESERVATION_PATTERNS, clause)
        && !humanReservedClauses.has(clause)
        && (clauseHasUiIntent || activeChoiceDomain === 'product-ui-ux')) {
        messageHasUnresolvedUiChoice = true
        break
      }
    }
    if (messageHasUnresolvedUiChoice) break
  }
  const globalRemediationCarriesResolvedUiChoice =
    GLOBAL_REMEDIATION_SCOPE_PATTERN.test(normalized)
    && matchesAny(UI_DECISION_MARKERS, normalized)
    && matchesAny(RESOLVED_UI_CHOICE_PATTERNS, normalized)
  if (matchesAny(TARGETLESS_SCOPE_DENIAL_PATTERNS, withoutNoWaitClauses(normalized))) {
    return {
      kind: 'denied',
      binding: messageScopeBinding ?? 'active-scope',
      message: normalized,
      clause: normalized,
    }
  }
  if (messageHasUnresolvedUiChoice || globalRemediationCarriesResolvedUiChoice) {
    return {
      kind: 'discussion',
      binding: messageScopeBinding ?? 'active-scope',
      message: normalized,
      clause: normalized,
    }
  }
  return candidates.find((candidate) => candidate.kind === 'denied')
    ?? candidates.find((candidate) => candidate.kind === 'discussion')
    ?? candidates.find((candidate) => candidate.kind === 'operation-binding-mismatch')
    ?? candidates.at(-1)
    ?? null
}

// bug 回報語彙(2026-09-16):user 說「壞掉 / 改壞 / 一不小心就 / 本來好好的 / root cause」是在報缺陷、要求修回既有行為,
// 依 AGENTS.md「Bug fix → AUTO」屬工程 remediation,不是 UI/UX 取捨。root cause 容錯常見誤拼(cuase / casue)。
const BUG_REPORT_PATTERNS = [
  // 「不要改壞 / 別弄壞」是 user 的常態叮嚀,不是回報 → 否定詞後的「改壞 / 弄壞」不算
  /(?:壞掉|壞了|(?<!不要|不能|不可|不會|不得|別|禁止|避免)改壞|(?<!不要|不能|不可|不會|不得|別|禁止|避免)弄壞|失效|誤觸|誤開|一不小心就|明明(?:就)?只是|本來好好的|原本好好的|退化|報錯|閃退|崩潰|卡死|卡住)/u,
  /\b(?:broke|broken|regress(?:ed|ion)?|root\s*c[aus]{3}e|misfir(?:e|es|ing)|accidental(?:ly)?)\b/iu,
]

function engineeringScopeDecision(message, target) {
  const normalized = normalizeText(message)
  let latest = null
  for (const clause of messageClauses(normalized)) {
    const binding = actionableTargetBinding(clause, target)
    if (!binding || !matchesAny(ENGINEERING_INTENT_PATTERNS, clause)) continue
    latest = { binding, message: normalized, clause }
  }
  if (latest) return latest
  // 2026-09-16 對稱性修補(量到的閘反向缺口):`remediationDecision` 已接受「沒點名 target 的全域修復範圍」,
  // 但只在該訊息同時帶 UI / 既有需求語彙時成立。結果是——
  //   「要確保效能有最佳化過,但不要改壞原本好的東西」            → 擋(UNKNOWN)
  //   「要確保效能有最佳化過,但不要改壞原本好的東西。hover 底色維持原樣」 → 放行
  // 加上 UI 字眼反而變鬆,方向與 fail-closed 相反。純工程的全域指示風險**低於**混了 UI 的版本,
  // 依 AGENTS.md:129(Bug fix / refactor / perf / a11y / test → AUTO)本來就該是 AUTO。
  // 這裡只補上缺的那一半:子句本身要有工程語彙、要落在全域修復範圍,且**該子句不得帶任何 UI 取捨語彙或選擇問句**
  // (帶了就走既有的 UI 路徑照舊 fail closed),不放寬 (d)(e) 既有行為。
  for (const clause of messageClauses(normalized)) {
    if (!GLOBAL_REMEDIATION_SCOPE_PATTERN.test(clause)) continue
    if (!matchesAny(ENGINEERING_INTENT_PATTERNS, clause)) continue
    if (matchesAny(UI_DECISION_MARKERS, clause)
      || matchesAny(UNRESOLVED_UI_CHOICE_PATTERNS, clause)
      || matchesAny(CHOICE_ASK_PATTERNS, clause)
      || matchesAny(TARGET_DENIAL_PATTERNS, withoutNoWaitClauses(clause))) continue
    latest = { binding: 'global-engineering-remediation-scope', message: normalized, clause }
  }
  if (latest) return latest
  // bug 回報的 target 與「壞了」常分在不同句(2026-09-16 錨:「為何現在拖拉 agent panel 的 fab / 很容易一不小心就開啟 panel /
  // 所以感覺就是你改壞了他啊 / 請你仔細查證看看到底 root cuase 是甚麼」),同句配對抓不到 → 整則訊息有 bug 回報語彙、
  // 沒有任何 UI 取捨語彙與未決選擇時,該 target 的修復是工程 remediation。有 UI 取捨字眼就不走這條(fail closed 照舊)。
  if (!matchesAny(BUG_REPORT_PATTERNS, normalized)) return null
  // bug 回報常以問句出現(「為何點擊遮罩會關掉 modal??」「root cause 是甚麼??」)—— 那是在問**原因**,不是在問許可;
  // 真正要擋的是把選擇丟回來的句子(要不要 / 是否 / 該不該 / 選哪個)與任何 UI 取捨字眼 → 那些照舊 fail closed。
  if (matchesAny(CHOICE_ASK_PATTERNS, normalized)
    || matchesAny(UI_DECISION_MARKERS, normalized)
    || matchesAny(UNRESOLVED_UI_CHOICE_PATTERNS, normalized)
    // 「fab 壞掉了嗎?」是在問存在與否、不是報缺陷;「把 fab 做大一點 / 改成方形」是改設計的要求、不是報缺陷 → 都不走這條
    || messageClauses(normalized).some((clause) => /(?:嗎|吗)\s*[?？]*\s*$/u.test(clause) || /^\s*(?:is|are|does|did|has|have|was|were)\b.*\?\s*$/iu.test(clause))
    || matchesAny(CHANGE_REQUEST_PATTERNS, normalized)) return null
  for (const clause of messageClauses(normalized)) {
    const binding = actionableTargetBinding(clause, target)
    if (binding) latest = { binding, message: normalized, clause, bugReport: true }
  }
  if (latest) return latest
  // 修 X 的 bug 可以動 X 直接依賴的共用模組(src/lib/*):target 沒被點名,但被點名的元件 import 了它 → 綁到那個元件。
  // 2026-09-16 錨:代理蓋板遮罩讓點擊穿到 modal,修法一半在 agent-panel.tsx、一半在它 import 的 lib/overlay-coexistence.ts。
  const viaDependent = dependentComponentBinding(normalized, target)
  return viaDependent ? { ...viaDependent, bugReport: true } : null
}

// 「要不要 / 是否 / 選哪個」= 把選擇丟回來;單純問號結尾不算(bug 回報的「為何…??」是問原因)。
// 改設計的要求(不是報缺陷):bug 回報路徑一律不放行,回到一般 UI 取捨判定
const CHANGE_REQUEST_PATTERNS = [
  /(?:改成|改為|換成|設為|移到|搬到|做大|做小|放大|縮小|加大|調成|調整成|改個|換個)/u,
  /\b(?:make\s+it|change\s+(?:it\s+)?to|move\s+(?:it\s+)?to|resize|enlarge|shrink)\b/iu,
]
const CHOICE_ASK_PATTERNS = [
  /(?:是否|要不要|該不該|能不能|可不可以|怎麼想|先討論|先評估|提案|比稿|選哪|哪(?:個|一個|種).{0,12}(?:比較好|較好|更好))/u,
  /\b(?:should\s+we|can\s+we|could\s+we|proposal|discuss|evaluate|which\s+one)\b/iu,
]

// authorizationEvidence 把 hook 傳進來的絕對路徑記在這裡,讓依賴掃描找得到 src 根(測試用假路徑時掃不到 → 自然不放行)。
let lastAbsoluteTargetPath = ''
function srcRootFor() {
  const marker = 'packages/design-system/src/'
  const abs = String(lastAbsoluteTargetPath || '').replaceAll('\\', '/')
  const at = abs.indexOf(marker)
  if (at >= 0) {
    const root = abs.slice(0, at + marker.length)
    return existsSync(root) ? root : null
  }
  const fallback = `${resolvePath(process.cwd(), marker)}/`
  return existsSync(fallback) ? fallback : null
}
function dependentComponentBinding(normalized, target) {
  const lib = /packages\/design-system\/src\/lib\/([^/]+)\.(?:ts|tsx)$/u.exec(target)
  if (!lib) return null
  const root = srcRootFor()
  if (!root) return null
  const needles = [`lib/${lib[1]}'`, `lib/${lib[1]}"`] // 單、雙引號的 import 都算(dialog.tsx 用雙引號)
  const files = []
  const walk = (dir, depth) => {
    if (depth > 4) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(path, depth + 1)
      else if (/\.tsx?$/u.test(entry.name) && !/\.(?:stories|test|spec)\./u.test(entry.name)) files.push(path)
    }
  }
  for (const sub of ['components', 'patterns']) walk(`${root}${sub}`, 0)
  for (const file of files) {
    let text
    try { text = readFileSync(file, 'utf8') } catch { continue }
    if (!needles.some((needle) => text.includes(needle))) continue
    const dependent = normalizeTarget(file)
    for (const clause of messageClauses(normalized)) {
      const binding = actionableTargetBinding(clause, dependent)
      if (binding) return { binding: `${binding} (${dependent.split('/').pop()} imports lib/${lib[1]})`, message: normalized, clause }
    }
  }
  return null
}

function classifyLatestAuthorizationUnscoped(message, {
  target = '',
  operationText = '',
  // 待授權的那一筆操作(hook input)。`operationText` 是「本回合對同一檔案的所有操作」的串接,
  // 供 digest 佐證與 binding 用;判「這筆操作是不是 UI 改動」只能看這一筆。
  // 2026-09-16 錨(單向棘輪):同一回合裡只要有過一次**被閘拒絕**的嘗試帶了 UI 字眼,
  // 那個字眼就永久留在串接裡,之後同一檔案**任何**乾淨的工程改動都再也過不了,而且無法自解 ——
  // 被拒絕的嘗試不是已發生的事實,更不該成為加嚴後續判定的證據。預設回落 `operationText`,舊呼叫端行為不變。
  pendingOperationText = null,
  userMessages = [message],
} = {}) {
  const rawMessage = String(message || '')
  const normalized = normalizeText(message)
  const latestUserMessageSha256 = createHash('sha256').update(normalized).digest('hex')
  const normalizedTarget = normalizeTarget(target)
  const operationEvidenceSha256 = createHash('sha256').update(operationText).digest('hex')
  const latestHasEngineeringIntent = matchesAny(ENGINEERING_INTENT_PATTERNS, normalized)
  const latestHasUiIntent = matchesAny(UI_DECISION_MARKERS, normalized)
  const latestIsGenericContinuation = matchesAny(GENERIC_CONTINUATION_PATTERNS, normalized)
    && !latestHasEngineeringIntent
    && !latestHasUiIntent
  let activeScopeRawMessage = rawMessage
  let activeScopeMessage = normalized
  if (latestIsGenericContinuation) {
    activeScopeRawMessage = ''
    activeScopeMessage = ''
    for (const item of userMessages.slice(0, -1).reverse()) {
      const candidate = normalizeText(item)
      if (matchesAny(GENERIC_CONTINUATION_PATTERNS, candidate)) continue
      activeScopeRawMessage = String(item || '')
      activeScopeMessage = candidate
      break
    }
  }
  const activeTargetDecision = targetDecision(
    activeScopeRawMessage,
    normalizedTarget,
    operationEvidenceSha256,
  )
  const activeRemediationDecision = remediationDecision(activeScopeMessage, normalizedTarget)
  const activeEngineeringScope = engineeringScopeDecision(activeScopeMessage, normalizedTarget)
  const activeTargetBinding = activeTargetDecision?.binding
    ?? activeRemediationDecision?.binding
    ?? activeEngineeringScope?.binding
    ?? null
  const activeDecisionMessageSha256 = activeScopeMessage
    ? createHash('sha256').update(activeScopeMessage).digest('hex')
    : null
  const base = {
    decisionDomain: 'unknown',
    target: normalizedTarget || null,
    targetBinding: activeTargetBinding,
    latestUserMessageSha256,
    decisionMessageSha256: activeTargetBinding ? activeDecisionMessageSha256 : null,
    operationEvidenceSha256,
  }
  if (!normalized) {
    return { ...base, decision: 'blocked', reasonCode: 'NO_USER_MESSAGE' }
  }
  if (!normalizedTarget) {
    return { ...base, decision: 'blocked', reasonCode: 'NO_EXACT_DECISION_TARGET' }
  }
  if (containsUnsafeAuthorityUnicode(target)) {
    return {
      ...base,
      targetBinding: null,
      decision: 'blocked',
      reasonCode: 'UNSAFE_UNICODE_DECISION_TARGET',
    }
  }
  if (containsUnsafeAuthorityUnicode(activeScopeRawMessage)) {
    return {
      ...base,
      decisionDomain: 'product-ui-ux',
      targetBinding: null,
      decision: 'blocked',
      reasonCode: 'UNSAFE_UNICODE_AUTHORITY_TEXT',
    }
  }
  // A generic continuation inherits exactly the most recent non-generic scope. It never searches
  // farther back for an older target after a denial, revocation, or move to another target.
  if (activeTargetDecision?.kind === 'denied') {
    return {
      ...base,
      decisionDomain: 'product-ui-ux',
      decision: 'blocked',
      reasonCode: 'TARGET_BOUND_DENIAL_OR_REVOCATION',
    }
  }
  // bug 回報的「為何…??」是問原因不是問許可(engineeringScopeDecision 已排除「要不要 / 是否」與 UI 取捨字眼),
  // 不走這條「問句 = 討論」短路;其他問句照舊 fail closed。
  if (activeTargetDecision?.kind === 'discussion' && !activeEngineeringScope?.bugReport) {
    return {
      ...base,
      decisionDomain: 'product-ui-ux',
      decision: 'blocked',
      reasonCode: 'TARGET_BOUND_DISCUSSION_OR_QUESTION',
    }
  }
  if (activeTargetDecision?.kind === 'operation-binding-mismatch') {
    return {
      ...base,
      decisionDomain: 'product-ui-ux',
      decision: 'blocked',
      reasonCode: 'EXACT_UI_UX_OPERATION_BINDING_MISSING_OR_MISMATCH',
    }
  }
  const targetIsEngineering = matchesAny(ENGINEERING_TARGET_PATTERNS, normalizedTarget)
  const hasOperationEvidence = normalizeText(operationText).length > 0
  const operationHasUiIntent = matchesAny(
    UI_OPERATION_MARKERS,
    stripCodeComments(pendingOperationText ?? operationText),
  )
  const operationRequiresHumanAction = matchesAny(HUMAN_ONLY_OPERATION_MARKERS, operationText)
  const operationIsDestructiveOrBypass = matchesAny(
    DESTRUCTIVE_OR_BYPASS_OPERATION_MARKERS,
    operationText,
  )
  const governanceAction = governanceActionTarget(normalizedTarget, operationEvidenceSha256)
  const activeHasUiIntent = matchesAny(UI_DECISION_MARKERS, activeScopeMessage)
  const activeHasStandingEngineeringDelegation =
    matchesAny(STANDING_ENGINEERING_DELEGATION_PATTERNS, activeScopeMessage)
  if (operationRequiresHumanAction) {
    return {
      ...base,
      decision: 'blocked',
      reasonCode: 'HUMAN_ONLY_ACTION_REQUIRED',
    }
  }
  if (operationIsDestructiveOrBypass) {
    return {
      ...base,
      decisionDomain: 'engineering-remediation',
      decision: 'blocked',
      reasonCode: 'ENGINEERING_SAFETY_GATE_REQUIRED',
    }
  }
  if (governanceAction?.status === 'invalid') {
    return {
      ...base,
      decisionDomain: 'engineering-remediation',
      decision: 'blocked',
      reasonCode: 'EXTERNAL_ENGINEERING_TARGET_INVALID',
    }
  }
  if (governanceAction?.status === 'operation-digest-mismatch') {
    return {
      ...base,
      decisionDomain: 'engineering-remediation',
      decision: 'blocked',
      reasonCode: 'EXTERNAL_ENGINEERING_OPERATION_DIGEST_MISMATCH',
    }
  }
  // A product decision is operation-specific. Remediation authority is deliberately separate:
  // it grants the engineering domain but does not attest that the operation conforms to SSOT.
  if (hasOperationEvidence && activeTargetDecision?.kind === 'approved') {
    return {
      ...base,
      decisionDomain: 'product-ui-ux',
      decision: 'approved',
      reasonCode: 'TARGET_BOUND_UI_UX_DECISION_APPROVED',
    }
  }
  if (hasOperationEvidence && activeRemediationDecision) {
    return {
      ...base,
      decisionDomain: 'engineering-remediation',
      targetBinding: activeRemediationDecision.binding,
      decisionMessageSha256: activeDecisionMessageSha256,
      decision: 'approved',
      reasonCode: 'ENGINEERING_UI_LOOKING_REMEDIATION_AUTHORITY',
    }
  }
  if ((targetIsEngineering || governanceAction?.status === 'valid')
    && hasOperationEvidence
    && !operationHasUiIntent) {
    return {
      ...base,
      decisionDomain: 'engineering-remediation',
      targetBinding: activeEngineeringScope?.binding ?? null,
      decisionMessageSha256: activeDecisionMessageSha256,
      decision: 'approved',
      reasonCode: 'ENGINEERING_REMEDIATION_NO_HUMAN_APPROVAL',
    }
  }
  // bug 回報綁定的 target(或其直接依賴的 lib):修 UI bug 的程式本來就會碰到 width / z-index / pointer 這類字眼,
  // 不能拿「操作看起來像 UI」再擋一次 —— 訊息層已排除 UI 取捨字眼與選擇問句,這裡只剩工程 remediation。
  if (hasOperationEvidence && activeEngineeringScope?.bugReport) {
    return {
      ...base,
      decisionDomain: 'engineering-remediation',
      targetBinding: activeEngineeringScope.binding,
      decisionMessageSha256: activeDecisionMessageSha256,
      decision: 'approved',
      reasonCode: 'ENGINEERING_BUG_REPORT_REMEDIATION',
    }
  }
  if (hasOperationEvidence
    && !operationHasUiIntent
    && (activeEngineeringScope || activeHasStandingEngineeringDelegation)) {
    return {
      ...base,
      decisionDomain: 'engineering-remediation',
      targetBinding: activeEngineeringScope?.binding ?? null,
      decisionMessageSha256: activeDecisionMessageSha256,
      decision: 'approved',
      reasonCode: 'ENGINEERING_OPERATION_STANDING_AUTHORIZATION',
    }
  }
  if (activeHasUiIntent || operationHasUiIntent) {
    return {
      ...base,
      decisionDomain: 'product-ui-ux',
      decision: 'blocked',
      reasonCode: activeTargetBinding
        ? 'TARGET_BOUND_UI_UX_CHOICE_MISSING'
        : 'EXACT_UI_UX_TARGET_BINDING_MISSING',
    }
  }
  return {
    ...base,
    decision: 'blocked',
    reasonCode: 'UNKNOWN_POTENTIAL_UI_UX_DECISION',
  }
}

function classifyOperationAuthorizationUnscoped({
  target = '',
  operationText = '',
} = {}) {
  const normalizedTarget = normalizeTarget(target)
  const normalizedOperation = normalizeText(operationText)
  const operationEvidenceSha256 = createHash('sha256').update(operationText).digest('hex')
  const base = {
    decisionDomain: 'unknown',
    target: normalizedTarget || null,
    targetBinding: null,
    latestUserMessageSha256: createHash('sha256').update('').digest('hex'),
    decisionMessageSha256: null,
    operationEvidenceSha256,
  }
  if (!normalizedTarget) {
    return { ...base, decision: 'blocked', reasonCode: 'NO_EXACT_DECISION_TARGET' }
  }
  if (containsUnsafeAuthorityUnicode(target)) {
    return {
      ...base,
      targetBinding: null,
      decision: 'blocked',
      reasonCode: 'UNSAFE_UNICODE_DECISION_TARGET',
    }
  }
  if (!normalizedOperation) {
    return { ...base, decision: 'blocked', reasonCode: 'NO_OPERATION_EVIDENCE' }
  }
  if (matchesAny(HUMAN_ONLY_OPERATION_MARKERS, normalizedOperation)) {
    return {
      ...base,
      decision: 'blocked',
      reasonCode: 'HUMAN_ONLY_ACTION_REQUIRED',
    }
  }
  if (matchesAny(DESTRUCTIVE_OR_BYPASS_OPERATION_MARKERS, normalizedOperation)) {
    return {
      ...base,
      decisionDomain: 'engineering-remediation',
      decision: 'blocked',
      reasonCode: 'ENGINEERING_SAFETY_GATE_REQUIRED',
    }
  }
  if (matchesAny(UI_OPERATION_MARKERS, stripCodeComments(normalizedOperation))) {
    return {
      ...base,
      decisionDomain: 'product-ui-ux',
      decision: 'blocked',
      reasonCode: 'EXACT_UI_UX_TARGET_BINDING_MISSING',
    }
  }
  const governanceAction = governanceActionTarget(normalizedTarget, operationEvidenceSha256)
  if (governanceAction?.status === 'invalid') {
    return {
      ...base,
      decisionDomain: 'engineering-remediation',
      decision: 'blocked',
      reasonCode: 'EXTERNAL_ENGINEERING_TARGET_INVALID',
    }
  }
  if (governanceAction?.status === 'operation-digest-mismatch') {
    return {
      ...base,
      decisionDomain: 'engineering-remediation',
      decision: 'blocked',
      reasonCode: 'EXTERNAL_ENGINEERING_OPERATION_DIGEST_MISMATCH',
    }
  }
  if (matchesAny(ENGINEERING_TARGET_PATTERNS, normalizedTarget)
    || governanceAction?.status === 'valid') {
    return {
      ...base,
      decisionDomain: 'engineering-remediation',
      decision: 'approved',
      reasonCode: 'ENGINEERING_OPERATION_STANDING_AUTHORIZATION',
    }
  }
  return {
    ...base,
    decision: 'blocked',
    reasonCode: 'PROVIDER_AUTHORITY_EVIDENCE_REQUIRED',
  }
}

export function classifyLatestAuthorization(message, options = {}) {
  return scopedClassification(
    classifyLatestAuthorizationUnscoped(message, options),
    { message, operationText: options.operationText },
  )
}

export function classifyOperationAuthorization(options = {}) {
  return scopedClassification(
    classifyOperationAuthorizationUnscoped(options),
    { operationText: options.operationText },
  )
}

// 2026-08-04 user verbatim「我在這裡說可以就是可以,就是授權給你」: when the owner's LATEST message
// is an explicit blanket delegation, it authorizes the pending operation without re-stating the
// target — the owner is answering the assistant's immediately-pending exact ask. Scoped to the
// latest message only, so a stale delegation never lingers as standing authority; any later denial
// or question supersedes it through the normal classifier.
const BLANKET_DELEGATION_PATTERNS = [
  /說\s*可以\s*就是\s*可以/u,
  /可以\s*就是\s*可以/u,
  /就是\s*授權(?:給你)?/u,
  /授權\s*給\s*你/u,
]

// 2026-08-11 recognizer gap fix: a LATEST user message that OPENS with a bare approval token
// (「可以，做到完整完美並自行驗證…」) is the same delegation speech-act as「說可以就是可以」——
// the owner is answering the assistant's immediately-pending exact ask. Canonical authority:
// AGENTS.md Decision Authority「最新一則 user 訊息的明確 blanket 授權即核准當下 pending 的
// exact 提案」. Recognized ONLY when the message opens with the approval token AND contains no
// denial, no question/discussion marker, and no tentative/conditional hedge (fail-closed on all).
// 2026-09-16:「照你建議開工」「照你的建議做」也是對 pending 提案的直答 —— 接受建議 ≠ 還在建議。比對前先以
// withoutAcceptancePhrases 把「照 / 依 / 按 / 就(你的)建議」換成中性詞「照辦」,後面可接「做 / 開工 / 進行 / 執行 / 處理 / 改」。
// 錨:user 對兩個已提案、已逐題回答的 UI 改動說「照你建議開工，確保上述所有更動都有追根究柢的修…不要改壞任何原本好的地方…」,
// 卻被 EXACT_UI_UX_TARGET_BINDING_MISSING 擋下:舊版「建議」二字命中 tentative、「開工」不在直答清單。
// 不是放寬:問句、「是否 / 要不要」、「如果…就」等討論與猶豫語仍然照樣擋;泛用完成語(全部做完)也仍不在清單裡(Test 7d / 17 契約)。
const LEADING_BARE_APPROVAL_PATTERN = /^(?:可以|好的|沒問題|就這樣做|照做|照辦(?:做|開工|進行|執行|處理|改)?)(?:$|[\s,，。!！、;;])/u
// 2026-08-12 勘誤:曾短暫加入「完成祈使句」型(把所有任務全部做完…),旋即被測試庫
// Test 7d / Test 17 打回 —— 該測試契約是刻意防線:泛用完成語**不得**回溯授權任意 UI 修改
//(無 pending 提案時它就是空白支票)。維持嚴格:UI 授權要嘛 exact target 綁定,要嘛
// 「可以」型直答 pending 提案;完成祈使句只授權「續跑已授權的事」。

function isLeadingBareApprovalDelegation(latestNormalized) {
  const accepted = withoutAcceptancePhrases(latestNormalized)
  return LEADING_BARE_APPROVAL_PATTERN.test(accepted)
    && !matchesAny(TARGET_DISCUSSION_PATTERNS, accepted)
    && !matchesAny(TENTATIVE_OR_CONDITIONAL_UI_PATTERNS, accepted)
}

export function authorizationEvidence(transcriptPath, {
  target = '',
  hookInput = null,
} = {}) {
  const state = transcriptState(transcriptPath)
  lastAbsoluteTargetPath = String(hookInput?.tool_input?.file_path || hookInput?.tool_input?.path || target || '')
  const operationText = toolOperations(state.turnRecords, hookInput, target)
  const latestNormalized = normalizeText(state.latestUserMessage)
  // 純註解操作不看訊息:它沒有任何執行差異,沒有東西可以拍板(定義與兩道檢查見 commentOnlyOperation)。
  if (commentOnlyOperation(hookInput, target)) {
    return commentOnlyEvidence(target, { latestNormalized, operationText })
  }
  const selection = state.latestAskUserSelection
  if (selection) {
    // A structured AskUserQuestion selection is the user saying yes to one exact presented
    // choice. Approval semantics come exclusively from the harness-authored answer text
    // (a decline, an "Other" answer that questions or forbids, or any tentative phrasing
    // falls through to the ordinary fail-closed flow). Target binding may come from the
    // answer or from the assistant proposal the question was attached to — binding alone
    // grants nothing without the genuine selection event.
    // 只判 user 自己回答的那段:harness 把 assistant 的題目原文也寫進 tool_result(`The user answered: "題目"="回答"`),
    // 題目裡的「要怎麼處理?」「(Recommended)」不是 user 的猶豫。「照你建議做」是接受建議,不是「還在建議」
    //(2026-09-15:user 選了「對齊規格(Recommended)」並寫「照你建議做…確保不要改壞既有」,卻被判成 tentative + denial 擋下)。
    const answerNormalized = normalizeText(selectionAnswerOnly(selection.answerText))
    const answerForIntent = withoutAcceptancePhrases(answerNormalized)
    const answerIsClean = answerNormalized
      && !matchesAny(TARGET_DENIAL_PATTERNS, withoutNoWaitClauses(answerForIntent))
      && !matchesAny(TARGET_DISCUSSION_PATTERNS, answerForIntent)
      && !matchesAny(TENTATIVE_OR_CONDITIONAL_UI_PATTERNS, answerForIntent)
    const bindingAlias = answerIsClean
      ? exactTargetBinding(`${selection.answerText}\n${selection.proposalText}`, target)
      : null
    if (bindingAlias) {
      return {
        schemaVersion: 1,
        kind: 'latest-user-design-authorization',
        decision: 'approved',
        reasonCode: 'ASK_USER_QUESTION_SELECTION',
        decisionDomain: 'product-ui-ux',
        target: target ? normalizeTarget(target) : null,
        targetBinding: `ask-user-question-selection:${bindingAlias}`,
        latestUserMessageSha256: createHash('sha256').update(latestNormalized).digest('hex'),
        decisionMessageSha256: createHash('sha256').update(answerNormalized).digest('hex'),
        operationEvidenceSha256: createHash('sha256').update(operationText).digest('hex'),
      }
    }
  }
  if ((matchesAny(BLANKET_DELEGATION_PATTERNS, latestNormalized)
    || isLeadingBareApprovalDelegation(latestNormalized))
    && !matchesAny(TARGET_DENIAL_PATTERNS, withoutNoWaitClauses(latestNormalized))) {
    return {
      schemaVersion: 1,
      kind: 'latest-user-design-authorization',
      decision: 'approved',
      reasonCode: 'USER_BLANKET_DELEGATION',
      decisionDomain: 'product-ui-ux',
      target: target ? normalizeTarget(target) : null,
      targetBinding: 'user-blanket-delegation',
      latestUserMessageSha256: createHash('sha256').update(latestNormalized).digest('hex'),
      decisionMessageSha256: createHash('sha256').update(latestNormalized).digest('hex'),
      operationEvidenceSha256: createHash('sha256').update(operationText).digest('hex'),
    }
  }
  return {
    schemaVersion: 1,
    kind: 'latest-user-design-authorization',
    ...classifyLatestAuthorization(state.latestUserMessage, {
      target,
      operationText,
      // 只有這一筆待授權的操作才決定「是不是 UI 改動」(見 classifyLatestAuthorizationUnscoped 的 pendingOperationText)。
      // `|| null` 不可省:沒有 hook input(例如 Stop hook 的事後判定)或這一筆不是打在本 target 時,
      // 它會是空字串 —— 空字串代表「這裡沒有待授權的操作可看」,必須回落到整體證據,
      // 否則等於把 UI 判定整段跳過(2026-09-16 CI 對照:Test 18「常設工程授權 + UI 操作必須擋」因此漏接)。
      pendingOperationText: toolOperations([], hookInput, target) || null,
      userMessages: state.userMessages,
    }),
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const transcriptPath = argument('--transcript')
  const target = argument('--target')
  const readHookInput = process.argv.includes('--hook-input-stdin')
  const operationOnly = process.argv.includes('--operation-only')
  let evidence
  try {
    if (!target) throw new Error('missing --target')
    let hookInput = null
    if (readHookInput) {
      hookInput = JSON.parse(readFileSync(0, 'utf8'))
      if (!hookInput || typeof hookInput !== 'object' || Array.isArray(hookInput)) {
        throw new Error('hook input is invalid')
      }
    }
    if (operationOnly) {
      if (!hookInput) throw new Error('operation-only classification requires --hook-input-stdin')
      const operationText = toolOperations([], hookInput, target)
      evidence = commentOnlyOperation(hookInput, target)
        ? commentOnlyEvidence(target, { operationText })
        : {
          schemaVersion: 1,
          kind: 'latest-user-design-authorization',
          ...classifyOperationAuthorization({ target, operationText }),
        }
    } else {
      if (!transcriptPath) throw new Error('missing --transcript')
      evidence = authorizationEvidence(transcriptPath, { target, hookInput })
    }
  } catch (error) {
    evidence = {
      schemaVersion: 1,
      kind: 'latest-user-design-authorization',
      decision: 'blocked',
      reasonCode: 'TRANSCRIPT_UNAVAILABLE_OR_INVALID',
      decisionDomain: 'unknown',
      target: target ? normalizeTarget(target) : null,
      targetBinding: null,
      latestUserMessageSha256: null,
      decisionMessageSha256: null,
      operationEvidenceSha256: null,
      error: error.message,
    }
  }
  process.stdout.write(`${JSON.stringify(evidence)}\n`)
  process.exit(evidence.decision === 'approved' ? 0 : 2)
}
