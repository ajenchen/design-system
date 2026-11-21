#!/usr/bin/env node
// ask-route.mjs —— 「該不該問」判定(stop_self_audit.sh Mechanism 13;2026-11-21 工作包 WP-06,user 2026-11-20 09:23
// 「給我確保這種事情上都有SSOT 沒有漂移」)。
//
// 回覆裡請 user 決定 / 裁決 / 點頭 / 選 / 看 / 動手的句子,同句或同段要寫出合法 scope id(或發版同意)與出處,否則擋;
// 否定句、講過去的句子、引述、描述規則的句子不擋。任何 [交user:…] 標記不論有沒有請求都驗 id 與出處。
//
// 本檔不帶任何清單。合法集合每次執行時讀三處正本(XACML 的 PEP / PDP 分離:這裡只是執行點):
//   ① <root>/AGENTS.md 的 <!-- canonical-decision-authority:start --> … end 區塊:確認區塊在;「出處」可用的
//      AGENTS.md:<行> 只收區塊內的行;區塊第一段「user 拍板」子句(標籤之後到第一個分號)的英文詞對出哪個 scope 是產品取捨。
//   ② 同目錄 approval-evidence.mjs 的 humanOnlyAuthorityScopes()(唯讀匯出入口;命令列 --human-only-scopes 印同一份)。
//   ③ <root>/infra/governance/release-workflow.json:releaseConsent.required 為 true 時,steps[] 裡 id = gateBefore 那一步的 gate;
//      同處 questionMarkers / aNotAQuestions / consentPhrases 用來判問句與「講發版閘本身」的句子。
// 可以送到 user 面前的 = ② ∪ ③ 的 gate 名。讀不到任何一處 = 儀器失效:命令列結束碼 66,呼叫端擋下,不得當成通過。
//
// 判定照交接參考實作 askroute.py 的 draft-check(2026-11-20,含兩面對照與 46 則真實回覆盤點)逐條移植;已知漏網句型
// 記在交接 ASKFIX-MATCH-AID。這是字串比對輔助,不是語意判斷。
//
// 用法:node ask-route.mjs --root <repo>            回覆從 stdin;印一行 JSON。0 通過 / 2 有問題 / 66 量不到 / 64 用法錯
//       node ask-route.mjs --root <repo> --ssot     印讀到的集合與出處
import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { humanOnlyAuthorityScopes } from './approval-evidence.mjs'

const AGENTS_REL = 'AGENTS.md'
const CLASSIFIER_REL = 'packages/design-system/ds-canonical/hooks/lib/approval-evidence.mjs'
const RELEASE_REL = 'infra/governance/release-workflow.json'
const BLOCK_START = '<!-- canonical-decision-authority:start -->'
const BLOCK_END = '<!-- canonical-decision-authority:end -->'
export const POLICY_ANCHOR = 'AGENTS.md#canonical-decision-authority'
const SCOPE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export class AskRouteInstrumentError extends Error {}

function lineOf(text, needle) {
  const index = text.split('\n').findIndex((line) => line.includes(needle))
  return index >= 0 ? index + 1 : null
}

function asciiWords(text) {
  return new Set((text.match(/[A-Za-z][A-Za-z0-9]*/g) || []).map((word) => word.toLowerCase()))
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    throw new AskRouteInstrumentError(`讀不到 ${path}(${error.code || error.message})`)
  }
}

// 讀三處正本;任何一處讀不到或形狀不對 → AskRouteInstrumentError。
export function readAskRouteSsot(root) {
  const agentsPath = join(root, AGENTS_REL)
  const agentsText = readText(agentsPath)
  const startLine = lineOf(agentsText, BLOCK_START)
  const endLine = lineOf(agentsText, BLOCK_END)
  if (!startLine || !endLine || endLine <= startLine) {
    throw new AskRouteInstrumentError(`${agentsPath} 找不到完整的 canonical-decision-authority 區塊`)
  }
  const block = agentsText.split('\n').slice(startLine - 1, endLine)
  let firstPara = null
  block.forEach((line, offset) => {
    const match = /^\*\*([^*]+)\*\*\s*[:：]?(.*)$/.exec(line.trim())
    if (match && !firstPara) firstPara = { line: startLine + offset, text: match[2] }
  })
  if (!firstPara) throw new AskRouteInstrumentError(`${agentsPath} 的決策區塊裡沒有任何「**標籤**:」段落`)

  let scopes
  try {
    scopes = humanOnlyAuthorityScopes()
  } catch (error) {
    throw new AskRouteInstrumentError(`${CLASSIFIER_REL} 的 humanOnlyAuthorityScopes() 失敗(${error.message})`)
  }
  if (!Array.isArray(scopes) || scopes.length === 0 || !scopes.every((scope) => typeof scope === 'string' && SCOPE_ID_RE.test(scope))) {
    throw new AskRouteInstrumentError(`${CLASSIFIER_REL} 沒有可用的 humanOnlyScopes(${JSON.stringify(scopes)})`)
  }
  // 產品取捨的 scope:決策區塊第一段「user 拍板」子句(標籤之後到第一個分號)的英文詞 ∩ scope id 的詞;不靠 id 名稱寫死。
  const clauseWords = asciiWords(firstPara.text.split(/[;；]/)[0])
  const productScopes = scopes.filter((scope) => scope.split('-').some((part) => clauseWords.has(part)))
  if (productScopes.length === 0) {
    throw new AskRouteInstrumentError(`${AGENTS_REL}:${firstPara.line} 決策區塊第一段的「user 拍板」子句對不到任何 humanOnlyScopes id`)
  }

  const releasePath = join(root, RELEASE_REL)
  let release
  try {
    release = JSON.parse(readText(releasePath))
  } catch (error) {
    if (error instanceof AskRouteInstrumentError) throw error
    throw new AskRouteInstrumentError(`${releasePath} 不是 JSON(${error.message})`)
  }
  const steps = Array.isArray(release?.steps) ? release.steps : null
  if (!steps || steps.length === 0) throw new AskRouteInstrumentError(`${releasePath} 沒有 steps`)
  const consent = release?.releaseConsent
  let releaseGates = []
  let questionMarkers = []
  let aNotAQuestions = []
  let consentPhrases = []
  if (consent && typeof consent === 'object' && consent.required === true) {
    releaseGates = steps
      .filter((step) => step && typeof step === 'object' && step.id === consent.gateBefore)
      .map((step) => step.gate)
      .filter((gate) => typeof gate === 'string' && gate)
    if (releaseGates.length === 0) {
      throw new AskRouteInstrumentError(`${releasePath} releaseConsent.required = true,但 id = ${consent.gateBefore} 的那一步沒有 gate`)
    }
    const strings = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item) : [])
    questionMarkers = strings(consent.questionMarkers)
    aNotAQuestions = strings(consent.aNotAQuestions)
    consentPhrases = strings(consent.consentPhrases)
  }
  const refLines = new Set()
  for (let line = startLine; line <= endLine; line += 1) refLines.add(line)
  return {
    root,
    scopes: [...scopes],
    releaseGates,
    allowed: [...new Set([...scopes, ...releaseGates])].sort(),
    productScopes,
    refLines,
    questionMarkers,
    aNotAQuestions,
    consentPhrases,
    cite: {
      policy: `${AGENTS_REL}:${startLine}-${endLine}(${POLICY_ANCHOR})`,
      classifier: `${CLASSIFIER_REL}(humanOnlyAuthorityScopes)`,
      release: `${RELEASE_REL}(releaseConsent.gateBefore 那一步的 gate)`,
    },
  }
}

// ───────────── 標記與出處 ─────────────
const MARK_ANY_RE = /\[\s*交\s*user\s*[:：]\s*([^\]\n]*?)\s*\]/g
const PLACEHOLDER_RE = /^(?:<[^>]*>|…+|\.\.\.+|scope id|id)$/i
const SSOT_REF_RE = /AGENTS\.md#canonical-decision-authority|approval-evidence\.mjs|release-workflow\.json/

export function markers(text) {
  return [...(text || '').matchAll(MARK_ANY_RE)].map((match) => match[1].trim()).filter((mark) => !PLACEHOLDER_RE.test(mark))
}

function markerRanges(text) {
  return [...(text || '').matchAll(MARK_ANY_RE)].map((match) => [match.index, match.index + match[0].length])
}

function citesSsot(text, ssot) {
  if (SSOT_REF_RE.test(text || '')) return true
  return [...(text || '').matchAll(/AGENTS\.md:(\d+)/g)].some((match) => ssot.refLines.has(Number(match[1])))
}

// ───────────── 寬判定:這段文字是不是把事送到 user 面前 ─────────────
// kind:'view' = 只是請 user 看 / 過目,'decide' = 請 user 決定 / 動手;null = 依命中字結尾判。
const U = '(?:user|你)'
const VERB = '(?:決定|拍板|裁決|定奪|點頭|選擇|選|挑|確認|核准|同意|看|過目|回覆|回|說|按|輸入|動手|執行|授權|放行|允許|處理)'
const VIEW_VERB_RE = /(?:看|過目)$/
const ASK_RES = [
  ['需要user決定', /需要\s*user\s*決定/g, 'decide'],
  ['交user', /交\s*(?:給|由)?\s*user(?![A-Za-z_-])/g, 'decide'],
  ['對user的請求', new RegExp(`(?:請|等|問|待|要|讓|由|需|需要|用|麻煩|煩請)\\s*${U}\\s*(?:本人|自己|親自|親口|先|再|一句話|逐字|在網頁|在終端機|對[^,，。;；\\n]{0,10})?\\s*${VERB}`, 'g'), null],
  // 「給 user 看」是給 user 讀(每則回覆都是),不是請 user 決定;「給 user 拍板 / 決定」才算
  ['給user決定', new RegExp(`給\\s*${U}\\s*(?:決定|拍板|裁決|定奪|點頭|選|挑|確認|核准|同意)`, 'g'), 'decide'],
  ['請/問user', /(?:請|問)\s*user(?![A-Za-z_-])/g, 'decide'],
  ['要你/請你/等你/麻煩你', /要你(?!們)|請你|等你|麻煩你|煩請你/g, 'decide'],
  ['跟我說/回我', /跟我說|跟我講|告訴我要不要|讓我知道|回我(?:一聲|一句|一下)?|你看要不要|你如果要|你同意的話|你回「/g, 'decide'],
  ['確認頁決策區', /決策區|「要你(?:裁決|決定|選)」/g, 'decide'],
  ['「要你看」頁', /「要你(?:看|過目)」/g, 'view'],
  // 「說『發版』」只在請求的寫法才算;「在你說「發版」之後」這種時間先後的描述不算
  ['說「發版」/「可以改」', /說\s*「(?:發版|可以改)」\s*(?:就好|就行|即可|我就|我才|吧|[。.!！]|$)/g, 'decide'],
  // 裸「你 + 決定 / 選 / 挑」;「你選的 A1」「你決定過」這種講已發生的不算
  ['你決定/你選/你挑', /(?<![給由讓等請要問待需])你\s*(?:來|自己|親自)?\s*(?:決定|拍板|裁決|定奪|選擇|選|挑)(?![的了過出好完])/g, 'decide'],
  ['看你', /看\s*你(?=\s*(?:$|[。.!！?？,，;；:：]|要不要|怎麼|的意思|決定|選|挑|方便|意見|想))/g, 'decide'],
  ['你作主/交給你', /你\s*(?:看著辦|作主|做主|說了算)|聽你的|(?<![給由讓等請要問待需])你\s*(?:來|自己)?\s*(?:判斷|定)(?![的了過出好完時期義位案稿型])|交給你\s*(?:處理|決定|判斷|定奪|拍板|裁決|選|挑|看著辦|作主|了)/g, 'decide'],
  ['你說呢/你覺得', /你(?:覺得|認為|看|說)(?:呢|怎麼樣|如何)|你覺得(?:要不要|該不該|可不可以|是否|好不好|如何|呢)/g, 'decide'],
  ['你若同意', /你\s*(?:若|如果|要是|假如)\s*(?:同意|點頭|確認|決定|說|OK|ok|沒意見)|你(?:同意|點頭|說可以)的話/g, 'decide'],
  ['要我…嗎/要不要我', /(?:要不要|需不需要|是否要|要)\s*我[^。！？!?\n]{0,30}?(?:嗎|呢)\s*[?？]?|(?:要不要|需不需要|是否要)\s*我/g, 'decide'],
  ['請回覆/請確認', /(?<![申邀聲])(?:請|煩請)\s*(?:回覆|回答|回|確認|決定|選|挑|拍板|裁決|說|告訴|過目|核准|同意|點頭|放行|允許|按|輸入)/g, 'decide'],
  ['英文請求', /\b(?:I need (?:you|from you)|one thing I need|please (?:confirm|decide|choose|approve|tell me|let me know|reply|pick)|let me know|your call|up to you|do you want me to|should I\b|shall I\b|can you (?:confirm|decide|tell|approve))/gi, 'decide'],
]
// 否定:命中處前面同一個子句 6 字內有否定詞 → 不算。判之前先把問句記號拿掉(A 不 A、「是否」、SSOT 的 aNotAQuestions)。
const NEG_RE = /(?:不|沒有|沒|無|免|非|別|勿|毋)[^,，。;；:：!！?？\n()（）]{0,6}$/
const ANOTA_RE = /([一-鿿A-Za-z])不\1(?:以)?/g
// 過去式:同一個子句前面有「當時 / 之前 / 上次 / 曾」→ 在講已經發生過的事
const PAST_RE = /(?:當時|那時|之前|先前|上次|上一次|曾經?|過去)[^,，。;；:：!！?？\n()（）]{0,6}$/
const CLAUSE_BREAK = /[,，。;；:：!！?？\n()（）、]/g
// 「…」裡的字是引述;只有區名與說「發版」照算
const QUOTED_OK = new Set(['確認頁決策區', '「要你看」頁', '說「發版」/「可以改」'])
const Q_ADDRESS_RE = /你|user|我|可以|可不可以|行不行|好不好|OK|ok|對不對|要不要|是否|還是|該不該|you\b|I\b/i
const Q_ANSWER_RE = /^\s*(?:不是|是的|是|沒有|對|不會|會|答案|因為|結論|不用|沒錯|No\b|Yes\b)/
// 描述規則 / 機制的句子(不是請求);有強請求記號就不豁免
const DESC_GATE_RE = /(?:就|才|會)\s*(?:被)?\s*(?:擋下|擋住|擋|不准|放行)/
const DESC_RELEASE_RE = /(?:還|仍|也|都|才|必須|須)\s*要\s*你\s*(?:親口|親自|本人)?\s*說/
const STRONG_RE = /等你|請你|麻煩你|看你|(?<![給由讓等請要問待需])你\s*(?:來)?\s*(?:決定|選|挑)|回我|跟我說|[?？]|嗎/
// 把請求句型當名詞提到(「這種寫法」):在講句型,不是在請 user
const MENTION_RE = /混在一起|混為一談|這種寫法|這類寫法|的寫法|這種句型|的句型|這類句子|的句子/

function quotedRanges(text) {
  const ranges = []
  let depth = 0
  let start = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '「') {
      if (depth === 0) start = index
      depth += 1
    } else if (char === '」' && depth) {
      depth -= 1
      if (depth === 0) ranges.push([start, index])
    }
  }
  return ranges
}

function neutralizeQuestions(pre, ssot) {
  let text = pre.replace(ANOTA_RE, '··')
  for (const word of ['是否', ...(ssot?.aNotAQuestions || [])]) text = text.split(word).join('·'.repeat(word.length))
  return text
}

// 每一句的 [start, end)(句號、問號、驚嘆號、換行斷句;斷句符號算進前一句)
function sentences(text) {
  const ranges = []
  let start = 0
  for (const match of text.matchAll(/[。！？!?]+|\n/g)) {
    ranges.push([start, match.index + match[0].length])
    start = match.index + match[0].length
  }
  if (start < text.length) ranges.push([start, text.length])
  return ranges
}

function isQuestion(sentence) {
  const trimmed = sentence.replace(/[\s*_`」』)）]+$/, '')
  return /[?？]$/.test(trimmed) || /(?:嗎|呢)[。.!！]?$/.test(trimmed)
}

function breaksIn(text, from, to) {
  const out = []
  for (const match of text.slice(from, to).matchAll(CLAUSE_BREAK)) out.push([from + match.index, from + match.index + match[0].length])
  return out
}

// 回 [{start, end, name, word, kind}];已排除否定、過去式、引述、描述規則的句子。
export function askSpans(text, ssot) {
  text = text || ''
  const out = []
  const quoted = quotedRanges(text)
  const marks = markerRanges(text)
  const sents = sentences(text)
  const sentenceOf = (pos) => sents.find(([a, b]) => a <= pos && pos < b) || [0, text.length]
  const described = (pos) => {
    const [a, b] = sentenceOf(pos)
    const sentence = text.slice(a, b)
    const before = breaksIn(text, a, pos)
    const clauseStart = before.length ? before[before.length - 1][1] : a
    const after = breaksIn(text, pos, b)
    const clauseEnd = after.length ? after[0][0] : b
    if (MENTION_RE.test(text.slice(clauseStart, clauseEnd))) return true
    if (STRONG_RE.test(sentence)) return false
    if (DESC_GATE_RE.test(sentence)) return true
    const phrases = ssot?.consentPhrases?.length ? ssot.consentPhrases : ['發版']
    if (DESC_RELEASE_RE.test(sentence) && phrases.some((word) => sentence.includes(`「${word}」`))) return true
    return false
  }
  for (const [name, re, kind] of ASK_RES) {
    for (const match of text.matchAll(re)) {
      const start = match.index
      const end = start + match[0].length
      if (!QUOTED_OK.has(name) && quoted.some(([a, b]) => a < start && end <= b + 1)) continue
      if (marks.some(([a, b]) => a <= start && end <= b)) continue
      let pre = text.slice(Math.max(0, start - 12), start)
      const cuts = [...pre.matchAll(CLAUSE_BREAK)]
      if (cuts.length) {
        const last = cuts[cuts.length - 1]
        pre = pre.slice(last.index + last[0].length)
      }
      pre = neutralizeQuestions(pre, ssot)
      if (NEG_RE.test(pre) || PAST_RE.test(pre)) continue
      if (described(start)) continue
      out.push({ start, end, name, word: match[0], kind: kind || (VIEW_VERB_RE.test(match[0]) ? 'view' : 'decide') })
    }
  }
  // 問句尾:把決定交給 user 的問句(「要我直接刪掉嗎?」「這樣可以嗎?」)
  for (const [a, b] of sents) {
    const sentence = text.slice(a, b)
    if (!sentence.trim() || !isQuestion(sentence)) continue
    const qpos = Math.max(sentence.lastIndexOf('?'), sentence.lastIndexOf('？'), sentence.lastIndexOf('嗎'), sentence.lastIndexOf('呢'))
    if (qpos >= 0 && quoted.some(([x, y]) => x < a + qpos && a + qpos <= y)) continue
    if (quoted.some(([x, y]) => x <= a && b <= y + 1)) continue
    if (!Q_ADDRESS_RE.test(sentence)) continue
    if (Q_ANSWER_RE.test(text.slice(b, b + 12))) continue
    out.push({ start: a, end: b, name: '問句交user', word: sentence.trim().slice(0, 40), kind: 'decide' })
  }
  return out.sort((left, right) => left.start - right.start || left.end - right.end)
}

function scopeTokens(text, ssot) {
  const allowed = new Set(ssot.allowed)
  const tokens = new Set(text.match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) || [])
  return {
    good: [...tokens].filter((token) => allowed.has(token)),
    bad: markers(text).filter((mark) => !allowed.has(mark)),
  }
}

// 回 [{paragraph, sentence, hit, why}]。請 user 的句子同句或同段要有合法 scope id(或發版同意的說明)+ 出處。
export function draftProblems(draft, ssot) {
  const problems = []
  const paragraphs = (draft || '').split(/\n\s*\n/).filter((paragraph) => paragraph.trim())
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const spansAll = askSpans(paragraph, ssot)
    for (const [a, b] of sentences(paragraph)) {
      const sentence = paragraph.slice(a, b)
      if (!sentence.trim()) continue
      const spans = spansAll.filter((span) => a <= span.start && span.start < b)
      const marks = markers(sentence)
      if (!spans.length && !marks.length) continue
      let ok = false
      const why = []
      for (const unit of [sentence, paragraph]) {
        const { good, bad } = scopeTokens(unit, ssot)
        if (bad.length) {
          why.push(`標記的 scope id 不在 SSOT 集合:${[...new Set(bad)].sort().join(', ')}`)
          break
        }
        const releaseOk = ssot.releaseGates.length > 0 && unit.includes('發版') && (
          ssot.releaseGates.some((gate) => unit.includes(gate)) || unit.includes('release-workflow.json')
          || [...unit.matchAll(/AGENTS\.md:(\d+)/g)].some((match) => ssot.refLines.has(Number(match[1]))))
        if ((good.length || releaseOk) && citesSsot(unit, ssot)) {
          ok = true
          break
        }
      }
      if (marks.length && !ok && !why.length) {
        why.push(`有 [交user:…] 標記,但同句同段沒有出處(要指到 ${POLICY_ANCHOR} / approval-evidence.mjs / release-workflow.json)`)
      }
      if (!ok) {
        if (!why.length) why.push(`請 user 決定 / 裁決 / 點頭 / 選 / 看,但同句同段沒有合法 scope id(${ssot.allowed.join(' / ')})加出處`)
        problems.push({
          paragraph: paragraphIndex + 1,
          sentence: sentence.trim(),
          hit: spans.map((span) => span.word).join('、') || `標記 ${marks.join(',')}`,
          why: why.join(';'),
        })
      }
    }
  })
  return problems
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}

function invokedAsCli() {
  if (!process.argv[1]) return false
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}

if (invokedAsCli()) {
  const root = argument('--root')
  if (!root) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: 'usage: ask-route.mjs --root <repo> [--ssot]' })}\n`)
    process.exit(64)
  }
  let ssot
  try {
    ssot = readAskRouteSsot(root)
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, instrument: true, error: error.message })}\n`)
    process.exit(66)
  }
  const view = { allowed: ssot.allowed, scopes: ssot.scopes, releaseGates: ssot.releaseGates, productScopes: ssot.productScopes, cite: ssot.cite }
  if (process.argv.includes('--ssot')) {
    process.stdout.write(`${JSON.stringify(view)}\n`)
    process.exit(0)
  }
  const draft = readFileSync(0, 'utf8')
  const problems = draftProblems(draft, ssot)
  process.stdout.write(`${JSON.stringify({ ok: problems.length === 0, problems, ...view })}\n`)
  process.exit(problems.length === 0 ? 0 : 2)
}
