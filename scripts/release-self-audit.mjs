#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: AI 向 user 要發版同意之前,手上有一份「機器可讀項目自我稽核」紀錄,而且這份紀錄
 *         (a) 綁的是現在這一份:產品指紋 = 現在 HEAD 的產品指紋(preview-binding),工作樹與 CI 讀回量的是現在的 HEAD
 *             (record.headSha = HEAD,git-worktree / pr-checks 兩項);(b) 未解 0;(c) 由本腳本照機器讀回產生。
 *         stop_self_audit.sh Mechanism 12 每個 Stop 呼叫 `stop-check`:回覆在要同意 + 紀錄缺任一項 → 擋 turn。
 *   紅: 要同意 + 沒有紀錄 / 產品指紋 ≠ 現在 / record.headSha ≠ HEAD(例:紀錄之後只改治理檔把 CI 弄紅)/ 未解 > 0 /
 *       紀錄不是本腳本照來源產生(手改、少項、腳本換版)/ 紀錄路徑是符號連結或硬連結 → exit 2 並逐項說缺什麼。
 *   綠: 回覆沒有在要同意(引述過去的同意、解釋規則、回答「什麼時候會問你」、受理 user 剛說的「發版」)→ exit 0,不讀紀錄;
 *       要同意 + 紀錄三項都成立 → exit 0。兩面對照在 scripts/test-release-self-audit.mjs 與
 *       packages/design-system/ds-canonical/hooks/tests/test_stop_self_audit.sh Tests 80–92。
 *
 * ── 為什麼有這支(2026-11-18 起,工作包 E7)──
 * 2026-11-17 AI 回報只剩 A101、A41 兩件,就請 user 看預覽說「發版」;user 追問後,自查才查出 24 項沒做完或做錯。
 * user 原話(2026-11-17 20:01 台灣時間,逐字):
 *   「你他媽確定沒有遺漏或亂做其他東西了齁？不要每次我還要再三詢問你你他媽才會知道自己錯在哪」
 * 發版同意早就綁產品指紋(release-orchestrator.mjs `consentCoversHead`),但「AI 開口要同意之前有沒有先把自己查乾淨」
 * 沒有任何機械面,只靠 AI 自律 —— 而自律已經失敗過(M20)。這支把「先查機器看得到的那一半再開口」變成 Stop hook 擋得住的條件。
 *
 * ── 名稱照實(2026-11-21,交接 process-audit 根因 9)──
 * 規劃原名「發版前零問題自我稽核」名不副實:清單只有機器讀回的項目,11-17 漏報的 24 項大多它看不到。
 * 所以叫「機器可讀項目自我稽核」,對 user 也只能這樣說:零未解 = 機器看得到的那幾項沒問題,不等於沒有遺漏。
 *
 * ── 三個條件(缺一就擋)──
 *   (a) 綁現在這一份,兩個單位分開驗:
 *       - preview-binding 綁產品指紋(與發版同意同一個單位):直接呼叫 release-orchestrator.mjs 的
 *         productContentDigest / PRODUCT_VISIBLE,不另寫第二份指紋算法。
 *       - git-worktree、pr-checks 量的是「那一刻的 HEAD」:record.headSha 必須等於現在的 HEAD。
 *         產品指紋不夠 —— 之後只改治理檔、把 CI 弄紅,產品指紋不變,拿「CI 全綠」的舊紀錄去要同意就會放行
 *         (交接 process-audit 根因 9 第 1 點;對照組在兩支測試裡)。
 *   (b) 未解 = 0:由紀錄裡的逐項清單**重算**,不信紀錄自己寫的數字。
 *   (c) 由本腳本照可驗證來源產生:紀錄記下產生它的腳本 blob(換版即失效)、整份內容的 sha256(手改即失效),
 *       必備的三個來源一個都不能少,每個「沒問題」都要帶得出機器形狀的證據(例:CI 那一項要有 PR head 與必過檢查清單)。
 *
 * ── 清單來源(全部是機器讀回,沒有任何一項是 AI 寫的一句話)──
 *   git-worktree     `git status --porcelain`:有沒提交 / 沒追蹤的檔 = 未解(做了沒交代,或亂做的殘留)。
 *   preview-binding  upstream 分支的產品指紋 = HEAD 的產品指紋:不相等 = user 在預覽上看到的不是這一份。
 *   pr-checks        release-orchestrator.mjs 的 collectLiveObservation + buildFiveStepStatus(= `release:status` 同一份讀回):
 *                    PR head 必須是這個 HEAD、必過檢查非空且全綠。讀不到(沒網路 / 沒憑證)= 未解,不是沒問題(M37)。
 *   product-visible-changes(只列、不計入未解):merge-base 以來改到的預覽看得見的檔,讓 AI 把清單照實擺給 user 看。
 * 交接檔 OPEN-ITEMS、workflow journal 的 notDone 之類 AI 自己維護的待辦**不是**來源:它們不在 repo、跨不了 provider,
 * 而且 AI 隨手就能改,拿它當來源就是自我證明。帳本「未指派 = 0」是編排層的前置條件,不在這支(process-audit 根因 9 修法)。
 *
 * ── 界線(照實寫)──
 *   - 本機沒有任何秘密,一個**蓄意**手寫整份紀錄、自己算好 sha256 的行為擋不住;擋得住的是「忘了查 / 懶得查 / 查了沒修 /
 *     查完又改」,也就是 11-17 那一種。蓄意偽造會在對話紀錄留下寫 .git/governance-runtime 的指令,不是這支要防的面。
 *   - 機器讀回看不到 AI 記在別處、還沒做的事。紀錄零未解 ≠ 沒有遺漏;另一半仍要 AI 在回覆裡照實列。
 *
 * 用法:
 *   node scripts/release-self-audit.mjs record [--json]   產生紀錄(寫進 <git-dir>/governance-runtime/release-self-audit/current.json)
 *        exit 0 = 零未解;1 = 有未解(紀錄照寫,stop-check 會引用它列的項目);2 = 寫不出紀錄(儀器失效)
 *   node scripts/release-self-audit.mjs verify [--json]   讀現有紀錄、對現在的 HEAD 驗 (a)(b)(c);exit 0 / 1
 *   node scripts/release-self-audit.mjs stop-check        給 Stop hook 用:stdin 一個 JSON
 *        {reply, delivered[], options[], currentUser};exit 0 = 放行、2 = 擋(stdout 帶 reason)、1 = 輸入壞掉
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync,
  renameSync, rmSync, writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyConsentPrompt, loadConsentPolicy } from './lib/release-consent-language.mjs'
import {
  PRODUCT_VISIBLE, buildFiveStepStatus, collectLiveObservation, loadReleaseWorkflow, productContentDigest,
} from './release-orchestrator.mjs'

const SELF_PATH = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(SELF_PATH), '..')

export const SELF_AUDIT_NAME = '發版前機器可讀項目自我稽核'
export const SELF_AUDIT_SCHEMA_VERSION = 1
export const SELF_AUDIT_KIND = 'release-self-audit'
export const SELF_AUDIT_GENERATOR = 'scripts/release-self-audit.mjs'
export const REQUIRED_SOURCES = Object.freeze(['git-worktree', 'preview-binding', 'pr-checks'])
export const INFO_SOURCES = Object.freeze(['product-visible-changes'])
/** 量的是「那一刻的 HEAD」的項目:record.headSha 必須等於現在的 HEAD(產品指紋只給 preview-binding)。 */
export const HEAD_BOUND_SOURCES = Object.freeze(['git-worktree', 'pr-checks'])
export const BLOCK_MARKER = 'RELEASE-SELF-AUDIT BLOCKER'
const MAX_RECORD_BYTES = 1024 * 1024
const MAX_LISTED_PATHS = 200
const USER_VERBATIM_2026_11_17 = '你他媽確定沒有遺漏或亂做其他東西了齁？不要每次我還要再三詢問你你他媽才會知道自己錯在哪'

// ─────────────────────────────────────────────────────────────────────────────
// 一、這則回覆是不是在「向 user 要發版同意」
// ─────────────────────────────────────────────────────────────────────────────
// 什麼字算同意,只有一份判準:release-consent-language.mjs 的 classifyConsentPrompt(與 hook、手動落地共用)。
// 這裡只多回答一件事 —— AI 是不是在**請 user 現在說**那句會被判成同意的話。形狀:
//   說 / 講 / 回 / 回覆 / 回答 / 打 / 輸入 / 留言(+ 一句 / 一聲 / 聲 / 個 / 一下)緊接「X」(或「X」或「Y」…),
//   X 交給 classifyConsentPrompt 判為 consent,而且這個請求是「現在」的:
//     前面緊接 請 / 麻煩 / 沒問題就(再)/ 沒意見就 / 直接 / 只要(中間可夾「在對話(框)」);或同句前面有 只差你 / 只等你;或引號後緊接 就好 / 我就 / 兩個字 / 這幾個字…
//   排除(引號內的字不算):動詞所在的子句有 之後 / 之前 / 才會 / 再請 / 會請 / 不會 / 不准 / 最後會 / 到時 / 剛才 / 已經 …,
//   或整句以 規則是 / 規定: / 例如 / 錨例 / 原話 開頭框住 —— 那些是在講以後才會問、解釋規則、引述過去,不是現在在要。
// 只看送到 user 面前的文字:可見回覆、推播訊息、AskUserQuestion 的題目;選項的 label 直接交給同一支判準。
// 不看:程式碼區塊、> 引用行、行內 `code`、引號裡面的請求(那是在引述,例如引自己 11-17 那句錯誤示範)。
// 本輪真 user 訊息本身判為 consent → 回覆是在受理 user 剛說的「發版」,不是在要。
// 刻意窄:誤擋的代價是 turn 結束不了;已知不涵蓋 —— 英文要同意、不用引號的要法(「你說發版我就合併」)。

const OPENERS = new Map([['「', '」'], ['『', '』'], ['“', '”']])
const SENTENCE_END = new Set(['。', '！', '？', '!', '?', '；', ';', '\n'])
const CLAUSE_SEP = new Set(['，', ',', '、', '：', ':'])
const SAY_VERBS = ['回覆', '回答', '留言', '輸入', '說', '講', '回', '打']
const VERB_FILLERS = ['一句', '一聲', '一下', '聲', '個']
const BEFORE_POSITIVE_TAIL = [
  /(?:請|麻煩|煩請)(?:你|您)?(?:直接|就)?\s*$/u,
  /(?:沒問題|沒有問題|沒意見|沒有意見|OK|ok|可以的話|確認無誤)(?:的話)?[，,、\s]*(?:就直接|就|直接|再)?\s*$/u,
  /(?:直接|只要|只需要?)\s*$/u,
]
// 「沒問題就在對話說「發版」」:動詞前的「在對話(框)(裡)」是地點,比對前先拿掉。
const IN_CHAT_TAIL = /在對話(?:框)?(?:裡|中)?\s*$/u
const BEFORE_POSITIVE_ANYWHERE = /(?:只差|只等|只剩|就差|就等)(?:你|您)/u
const AFTER_POSITIVE = /^\s*[，,]?\s*(?:就好|就行|就可以了|即可|我就|兩個字|這兩個字|這幾個字|幾個字|這句話|這一句|一句話)/u
const HEAD_EXCLUDE = /之後|以後|之前|以前|才會|才能|才請|再請|會請|不會|不用|不必|不需|無需|無須|毋須|不准|不得|不能|禁止|最後會|最後才|屆時|到時|等到|我會|將會|會再|稍後|晚點|明天|下一輪|剛才|剛剛|已經|上次|那時|當時|曾經|假如/u
// 整句是在解釋規則 / 舉例 / 引述(框在句首,不一定跟動詞同一個子句):「規則是:你看過沒問題就說「發版」」。
const SENTENCE_FRAME_EXCLUDE = /規則是|規定是|流程是|規則[:：]|規定[:：]|流程[:：]|例如|比如|舉例|錨例|原話/u
const AFTER_EXCLUDE = /^\s*(?:之後|以後|之前|以前|後|前|才)/u

/** 程式碼區塊、> 引用行、行內 code 都是在貼東西,不是在對 user 說話 —— 換成空白(保留長度不影響位置)。 */
export function proseOnly(text) {
  const lines = []
  let fenced = false
  for (const line of String(text ?? '').split('\n')) {
    if (/^\s*(?:```|~~~)/.test(line)) { fenced = !fenced; lines.push(''); continue }
    if (fenced || /^\s*>/.test(line)) { lines.push(''); continue }
    lines.push(line.replace(/`[^`\n]*`/g, (match) => ' '.repeat(match.length)))
  }
  return lines.join('\n')
}

/** 以句末標點切句;引號裡的標點不切(「可以改，發版」是一句話)。沒關上的引號遇到換行就重置,不讓它吃掉整段。 */
export function splitSentences(text) {
  const out = []
  let buffer = ''
  let stack = []
  for (const ch of String(text ?? '')) {
    if (OPENERS.has(ch)) stack.push(OPENERS.get(ch))
    else if (stack.length && ch === stack[stack.length - 1]) stack.pop()
    if (ch === '\n' || (!stack.length && SENTENCE_END.has(ch))) {
      if (buffer.trim()) out.push(buffer)
      buffer = ''
      if (ch === '\n') stack = []
      continue
    }
    buffer += ch
  }
  if (buffer.trim()) out.push(buffer)
  return out
}

function quoteDepths(sentence) {
  const depths = new Array(sentence.length)
  const stack = []
  for (let index = 0; index < sentence.length; index += 1) {
    depths[index] = stack.length
    const ch = sentence[index]
    if (OPENERS.has(ch)) stack.push(OPENERS.get(ch))
    else if (stack.length && ch === stack[stack.length - 1]) stack.pop()
  }
  return depths
}

function matchingClose(sentence, openIndex) {
  const stack = [OPENERS.get(sentence[openIndex])]
  for (let index = openIndex + 1; index < sentence.length; index += 1) {
    const ch = sentence[index]
    if (OPENERS.has(ch)) stack.push(OPENERS.get(ch))
    else if (ch === stack[stack.length - 1]) {
      stack.pop()
      if (!stack.length) return index
    }
  }
  return -1
}

/** 句中「說 / 回 …」緊接引號的請求,連同「或「Y」」串起來的選項。只認引號外(深度 0)的動詞。 */
export function findSayRequests(sentence) {
  const depths = quoteDepths(sentence)
  const requests = []
  for (let index = 0; index < sentence.length; index += 1) {
    if (depths[index] !== 0) continue
    const verb = SAY_VERBS.find((candidate) => sentence.startsWith(candidate, index))
    if (!verb) continue
    let cursor = index + verb.length
    const filler = VERB_FILLERS.find((candidate) => sentence.startsWith(candidate, cursor))
    if (filler) cursor += filler.length
    while (sentence[cursor] === ' ') cursor += 1
    if (!OPENERS.has(sentence[cursor])) continue
    const phrases = []
    let chainEnd = cursor
    for (;;) {
      const close = matchingClose(sentence, chainEnd)
      if (close < 0) break
      phrases.push(sentence.slice(chainEnd + 1, close))
      chainEnd = close + 1
      const connector = /^\s*(?:或是|或者|還是|或|、|\/|跟|和)\s*/u.exec(sentence.slice(chainEnd))
      if (connector && OPENERS.has(sentence[chainEnd + connector[0].length])) {
        chainEnd += connector[0].length
        continue
      }
      break
    }
    if (!phrases.length) continue
    requests.push({ verbIndex: index, chainEnd, phrases })
    index = chainEnd - 1
  }
  return requests
}

function blankQuoted(text) {
  const depths = quoteDepths(text)
  let out = ''
  for (let index = 0; index < text.length; index += 1) out += depths[index] > 0 && !OPENERS.has(text[index]) ? '□' : text[index]
  return out
}

function headClause(before) {
  const blanked = blankQuoted(before)
  let start = blanked.length
  while (start > 0 && !CLAUSE_SEP.has(blanked[start - 1])) start -= 1
  return blanked.slice(start)
}

/** 單句判定(抽出來讓判定表可以逐句驗)。回 null = 不是在要同意。 */
export function consentRequestInSentence(sentence, policy = loadConsentPolicy()) {
  for (const request of findSayRequests(sentence)) {
    const consentPhrase = request.phrases.find((phrase) => classifyConsentPrompt(phrase, policy).verdict === 'consent')
    if (!consentPhrase) continue
    const before = sentence.slice(0, request.verbIndex)
    const after = sentence.slice(request.chainEnd)
    const blankedBefore = blankQuoted(before)
    const tail = blankedBefore.replace(IN_CHAT_TAIL, '')
    const positive = BEFORE_POSITIVE_TAIL.some((pattern) => pattern.test(tail))
      || BEFORE_POSITIVE_ANYWHERE.test(blankedBefore)
      || AFTER_POSITIVE.test(after)
    if (!positive) continue
    if (HEAD_EXCLUDE.test(headClause(before)) || SENTENCE_FRAME_EXCLUDE.test(blankedBefore) || AFTER_EXCLUDE.test(after)) continue
    return { sentence: sentence.trim(), phrase: consentPhrase }
  }
  return null
}

/**
 * @param {{reply?: string, delivered?: string[], options?: string[], currentUser?: string}} input
 * @returns {{asking: boolean, acknowledged?: boolean, matches: Array<{channel: string, sentence: string, phrase: string}>}}
 */
export function detectConsentRequest({ reply = '', delivered = [], options = [], currentUser = '' } = {}, policy = loadConsentPolicy()) {
  if (typeof currentUser === 'string' && currentUser.trim()
    && classifyConsentPrompt(currentUser, policy).verdict === 'consent') {
    return { asking: false, acknowledged: true, matches: [] }
  }
  const matches = []
  const scan = (channel, text) => {
    for (const sentence of splitSentences(proseOnly(text))) {
      const hit = consentRequestInSentence(sentence, policy)
      if (hit) matches.push({ channel, ...hit })
    }
  }
  scan('reply', reply)
  for (const text of Array.isArray(delivered) ? delivered : []) if (typeof text === 'string') scan('delivered', text)
  for (const label of Array.isArray(options) ? options : []) {
    if (typeof label === 'string' && classifyConsentPrompt(label, policy).verdict === 'consent') {
      matches.push({ channel: 'option', sentence: label.trim(), phrase: label.trim() })
    }
  }
  return { asking: matches.length > 0, matches }
}

// ─────────────────────────────────────────────────────────────────────────────
// 二、紀錄:產生、寫入、讀取(讀寫都驗路徑)
// ─────────────────────────────────────────────────────────────────────────────

function git(args, { root = ROOT } = {}) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  return { ok: !result.error && result.status === 0, stdout: result.stdout || '', stderr: (result.stderr || '').trim() }
}

/** 與 `git hash-object` 相同的 blob id:紀錄綁「產生它的那一版腳本」,腳本一改舊紀錄就不算數。 */
export function gitBlobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

export function generatorBlobSha() {
  return gitBlobSha(readFileSync(SELF_PATH))
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value === undefined ? null : value)
}

export function recordDigest(record) {
  const { recordSha256: _ignored, ...body } = record || {}
  return createHash('sha256').update(canonicalJson(body)).digest('hex')
}

/** 紀錄住在 Git 目錄裡(永遠不會變成追蹤檔),與發版同意收據同一個 governance-runtime 根。 */
export function selfAuditPaths({ root = ROOT } = {}) {
  const located = git(['rev-parse', '--absolute-git-dir'], { root })
  if (!located.ok || !located.stdout.trim()) throw new Error(`找不到 Git 目錄(${located.stderr || 'git rev-parse 失敗'})`)
  const gitDir = realpathSync(located.stdout.trim())
  const runtimeDir = join(gitDir, 'governance-runtime')
  const dir = join(runtimeDir, 'release-self-audit')
  return { gitDir, runtimeDir, dir, file: join(dir, 'current.json') }
}

function lstatOrNull(path) {
  try { return lstatSync(path) } catch (error) { if (error?.code === 'ENOENT') return null; throw error }
}

/**
 * 讀紀錄。Git 目錄以下的每一段都不得是符號連結;檔案必須是一般檔、只有一個連結、≤ 1MB;
 * 以 O_NOFOLLOW 開檔再 fstat 一次,防「檢查完才被換掉」。
 * @returns {{record: object|null, problem: null|{code: string, detail: string}}}
 */
export function readSelfAuditRecord(paths = selfAuditPaths()) {
  for (const directory of [paths.runtimeDir, paths.dir]) {
    const info = lstatOrNull(directory)
    if (!info) return { record: null, problem: { code: 'record-missing', detail: paths.file } }
    if (info.isSymbolicLink() || !info.isDirectory()) {
      return { record: null, problem: { code: 'record-path-unsafe', detail: `${directory} 不是一般目錄(符號連結或別的東西)` } }
    }
  }
  const info = lstatOrNull(paths.file)
  if (!info) return { record: null, problem: { code: 'record-missing', detail: paths.file } }
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1) {
    return { record: null, problem: { code: 'record-path-unsafe', detail: `${paths.file} 是符號連結 / 不是一般檔 / 有多個硬連結` } }
  }
  const noFollow = Number.isInteger(fsConstants.O_NOFOLLOW) ? fsConstants.O_NOFOLLOW : 0
  let descriptor
  try {
    descriptor = openSync(paths.file, fsConstants.O_RDONLY | noFollow)
  } catch (error) {
    return { record: null, problem: { code: 'record-path-unsafe', detail: `${paths.file} 開不起來(${error.code || error.message})` } }
  }
  try {
    const opened = fstatSync(descriptor)
    if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== info.ino) {
      return { record: null, problem: { code: 'record-path-unsafe', detail: `${paths.file} 在檢查與開檔之間被換掉` } }
    }
    if (opened.size > MAX_RECORD_BYTES) {
      return { record: null, problem: { code: 'record-unreadable', detail: `${paths.file} 超過 1MB` } }
    }
    const bytes = Buffer.alloc(opened.size)
    let offset = 0
    while (offset < bytes.length) {
      const read = readSync(descriptor, bytes, offset, bytes.length - offset, offset)
      if (read <= 0) break
      offset += read
    }
    try {
      return { record: JSON.parse(bytes.subarray(0, offset).toString('utf8')), problem: null }
    } catch {
      return { record: null, problem: { code: 'record-unreadable', detail: `${paths.file} 不是 JSON` } }
    }
  } finally {
    closeSync(descriptor)
  }
}

function ensureRealDirectory(path) {
  const before = lstatOrNull(path)
  if (!before) mkdirSync(path, { mode: 0o700 })
  const after = lstatOrNull(path)
  if (!after || after.isSymbolicLink() || !after.isDirectory()) throw new Error(`${path} 不是一般目錄(符號連結或別的東西),拒寫`)
}

/** 寫紀錄:路徑規則同讀取;先寫同目錄暫存檔(O_EXCL)再 rename,不會寫穿到別的 inode。 */
export function writeSelfAuditRecord(record, paths = selfAuditPaths()) {
  ensureRealDirectory(paths.runtimeDir)
  ensureRealDirectory(paths.dir)
  const existing = lstatOrNull(paths.file)
  if (existing && (existing.isSymbolicLink() || !existing.isFile() || existing.nlink !== 1)) {
    throw new Error(`${paths.file} 是符號連結 / 不是一般檔 / 有多個硬連結,拒寫(先移除它)`)
  }
  const temporary = join(paths.dir, `.current.json.${process.pid}.${Date.now()}.tmp`)
  try {
    writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    renameSync(temporary, paths.file)
  } finally {
    rmSync(temporary, { force: true })
  }
  return paths.file
}

/** 正式讀回:與 `npm run release:status` 同一支 collectLiveObservation + buildFiveStepStatus。 */
export function readPullRequestChecksLive() {
  const workflow = loadReleaseWorkflow()
  const observation = collectLiveObservation(workflow)
  const status = buildFiveStepStatus(workflow, observation).find((step) => step.id === 'pr-checks')?.status || 'unknown'
  const pullRequest = observation.pullRequest
  return {
    status,
    pullRequest: pullRequest
      ? { number: pullRequest.number ?? null, headRefOid: pullRequest.headRefOid ?? null, url: pullRequest.url ?? null, mergeable: pullRequest.mergeable ?? null }
      : null,
    requiredChecks: (pullRequest?.requiredChecks || []).map((row) => ({
      name: row.name ?? null, bucket: row.bucket ?? null, state: row.state ?? null, workflow: row.workflow ?? null,
    })),
  }
}

function defaultBranchName() {
  try { return loadReleaseWorkflow().automation?.defaultBranch || 'main' } catch { return 'main' }
}

function statusEntries(root) {
  const result = git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], { root })
  if (!result.ok) throw new Error(`git status 失敗:${result.stderr}`)
  return result.stdout.split('\0').filter(Boolean).filter((entry) => /^[ MADRCU?!]{2} /.test(entry)).map((entry) => entry.slice(3))
}

/** 現在的 HEAD(commit sha);讀不到回 null。 */
export function currentHeadSha({ root = ROOT } = {}) {
  const head = git(['rev-parse', 'HEAD^{commit}'], { root })
  return head.ok && /^[0-9a-f]{40,64}$/.test(head.stdout.trim()) ? head.stdout.trim() : null
}

/**
 * 依可驗證來源收集逐項清單並組出紀錄(不寫檔)。readPullRequestChecks 可注入:測試用合成讀回,
 * 正式一律走 readPullRequestChecksLive。
 */
export function collectSelfAudit({ readPullRequestChecks = readPullRequestChecksLive, now = () => new Date() } = {}) {
  // 產品指紋一律由 release-orchestrator.mjs 在它自己的 repo 根算(同一份算法),所以這裡也只看本 repo 根。
  const root = ROOT
  const headSha = currentHeadSha({ root })
  if (!headSha) throw new Error('讀不到 HEAD')
  const productDigest = productContentDigest(headSha)
  if (!productDigest) throw new Error('算不出 HEAD 的產品指紋(預覽看得見的檔一個都沒有,或 git 失敗)—— 沒有它就無法把紀錄綁在 user 要看的那一份上')
  const items = []

  // git-worktree(量的是這個 HEAD 上的工作樹)
  const dirty = statusEntries(root)
  items.push({
    source: 'git-worktree',
    status: dirty.length === 0 ? 'ok' : 'unresolved',
    detail: dirty.length === 0 ? '工作樹乾淨' : `${dirty.length} 個檔沒提交或沒追蹤:${dirty.slice(0, 10).join('、')}${dirty.length > 10 ? ' …' : ''}`,
    evidence: { headSha, dirtyCount: dirty.length, dirtyPaths: dirty.slice(0, MAX_LISTED_PATHS) },
  })

  // preview-binding(綁產品指紋)
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { root })
  const upstreamSha = upstream.ok ? git(['rev-parse', '@{upstream}^{commit}'], { root }) : { ok: false, stdout: '' }
  const upstreamDigest = upstreamSha.ok ? productContentDigest(upstreamSha.stdout.trim()) : null
  const previewOk = Boolean(upstreamDigest) && upstreamDigest === productDigest
  items.push({
    source: 'preview-binding',
    status: previewOk ? 'ok' : 'unresolved',
    detail: !upstream.ok
      ? '這條分支沒有 upstream(沒推上去),預覽沒有這份內容'
      : previewOk
        ? `${upstream.stdout.trim()} 的產品指紋 = HEAD`
        : `${upstream.stdout.trim()} 的產品指紋 ≠ HEAD:預覽看得見的改動還沒推上去,user 在預覽上看到的不是這一份`,
    evidence: {
      upstream: upstream.ok ? upstream.stdout.trim() : null,
      upstreamSha: upstreamSha.ok ? upstreamSha.stdout.trim() : null,
      upstreamDigest,
      headDigest: productDigest,
    },
  })

  // pr-checks(量的是這個 HEAD 的 CI)
  let prItem
  try {
    const readback = readPullRequestChecks({ headSha })
    const checks = Array.isArray(readback?.requiredChecks) ? readback.requiredChecks : []
    const coversHead = readback?.pullRequest?.headRefOid === headSha
    const ok = readback?.status === 'complete' && coversHead && checks.length > 0
    const notGreen = checks.filter((row) => !['pass', 'skipping'].includes(String(row.bucket || '').toLowerCase())
      && String(row.state || '').toLowerCase() !== 'success').map((row) => row.name).filter(Boolean)
    prItem = {
      source: 'pr-checks',
      status: ok ? 'ok' : 'unresolved',
      detail: ok
        ? `PR #${readback.pullRequest.number} 在這個 HEAD 上必過檢查 ${checks.length} 項全綠`
        : !readback?.pullRequest
          ? '找不到這條分支的 PR'
          : !coversHead
            ? `PR head ${String(readback.pullRequest.headRefOid).slice(0, 8)} ≠ HEAD ${headSha.slice(0, 8)}(還沒推,或 PR 講的是別份內容)`
            : checks.length === 0
              ? '必過檢查一筆都還沒有(零筆不是全綠)'
              : `必過檢查狀態 ${readback.status}${notGreen.length ? `:${notGreen.slice(0, 8).join('、')}` : ''}`,
      evidence: {
        headSha,
        status: readback?.status ?? null,
        pullRequest: readback?.pullRequest ?? null,
        requiredChecks: checks.slice(0, MAX_LISTED_PATHS),
      },
    }
  } catch (error) {
    prItem = {
      source: 'pr-checks',
      status: 'unresolved',
      detail: `讀不到 CI 讀回(${String(error?.message || error).split('\n')[0].slice(0, 400)})—— 讀不到不等於沒問題`,
      evidence: { headSha, status: null, pullRequest: null, requiredChecks: [] },
    }
  }
  items.push(prItem)

  // product-visible-changes(info)
  const mainRef = `origin/${defaultBranchName()}`
  const base = git(['merge-base', 'HEAD', mainRef], { root })
  let changed = null
  if (base.ok) {
    const diff = git(['diff', '--name-only', `${base.stdout.trim()}..HEAD`], { root })
    if (diff.ok) changed = diff.stdout.split('\n').map((line) => line.trim()).filter((path) => path && PRODUCT_VISIBLE.some((pattern) => pattern.test(path)))
  }
  items.push({
    source: 'product-visible-changes',
    status: 'info',
    detail: changed === null
      ? `讀不到與 ${mainRef} 的分岔點,無法列出預覽看得見的改動`
      : `與 ${mainRef} 分岔以來改到 ${changed.length} 個預覽看得見的檔(向 user 要同意時照實列出)`,
    evidence: { base: base.ok ? base.stdout.trim() : null, count: changed ? changed.length : null, files: changed ? changed.slice(0, MAX_LISTED_PATHS) : [] },
  })

  const branch = git(['branch', '--show-current'], { root })
  const record = {
    schemaVersion: SELF_AUDIT_SCHEMA_VERSION,
    kind: SELF_AUDIT_KIND,
    name: SELF_AUDIT_NAME,
    productDigest,
    headSha,
    branch: branch.ok && branch.stdout.trim() ? branch.stdout.trim() : null,
    generatedAt: now().toISOString(),
    generator: { path: SELF_AUDIT_GENERATOR, blobSha: generatorBlobSha() },
    items,
    unresolvedCount: items.filter((item) => item.status === 'unresolved').length,
  }
  return { ...record, recordSha256: recordDigest(record) }
}

// ─────────────────────────────────────────────────────────────────────────────
// 三、驗紀錄:(a) 綁現在這一份 (b) 未解 = 0 (c) 由本腳本照來源產生
// ─────────────────────────────────────────────────────────────────────────────

function okEvidenceProblem(item, record) {
  const evidence = item.evidence
  if (!evidence || typeof evidence !== 'object') return '沒有證據欄'
  if (HEAD_BOUND_SOURCES.includes(item.source) && evidence.headSha !== record.headSha) {
    return '標 ok 但證據量的 HEAD 不是紀錄的 HEAD'
  }
  if (item.source === 'git-worktree') {
    return evidence.dirtyCount === 0 && Array.isArray(evidence.dirtyPaths) && evidence.dirtyPaths.length === 0
      ? null : '標 ok 但證據裡有未提交的檔'
  }
  if (item.source === 'preview-binding') {
    return evidence.upstreamDigest === record.productDigest && evidence.headDigest === record.productDigest && typeof evidence.upstream === 'string'
      ? null : '標 ok 但 upstream 指紋與紀錄的產品指紋對不上'
  }
  if (item.source === 'pr-checks') {
    return evidence.status === 'complete' && evidence.pullRequest?.headRefOid === record.headSha
      && Array.isArray(evidence.requiredChecks) && evidence.requiredChecks.length > 0
      ? null : '標 ok 但沒有「PR head = 紀錄的 HEAD、狀態 complete、必過檢查非空」這組讀回'
  }
  return null
}

/**
 * @param {object} record
 * @param {{currentProductDigest: string|null, currentHeadSha: string|null, expectedGeneratorBlobSha: string}} context
 * @returns {{ok: boolean, problems: Array<{code: string, clause: 'a'|'b'|'c', detail: string}>}}
 */
export function verifySelfAuditRecord(record, { currentProductDigest, currentHeadSha: headNow, expectedGeneratorBlobSha }) {
  const problems = []
  const add = (code, clause, detail) => problems.push({ code, clause, detail })
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    add('record-shape', 'c', '紀錄不是物件')
    return { ok: false, problems }
  }
  if (record.schemaVersion !== SELF_AUDIT_SCHEMA_VERSION || record.kind !== SELF_AUDIT_KIND) add('record-shape', 'c', 'schemaVersion / kind 不對')
  if (record.recordSha256 !== recordDigest(record)) add('record-tampered', 'c', '整份內容的 sha256 對不上(產生後被改過)')
  if (record.generator?.path !== SELF_AUDIT_GENERATOR) add('generator-unknown', 'c', `產生者不是 ${SELF_AUDIT_GENERATOR}`)
  else if (record.generator?.blobSha !== expectedGeneratorBlobSha) add('generator-changed', 'c', '產生它的腳本版本與現在不同(腳本改過,要重跑)')

  const items = Array.isArray(record.items) ? record.items : []
  if (!Array.isArray(record.items)) add('record-shape', 'c', '沒有逐項清單')
  const known = new Set([...REQUIRED_SOURCES, ...INFO_SOURCES])
  for (const item of items) {
    if (!item || typeof item !== 'object' || !known.has(item.source)) {
      add('item-unknown-source', 'c', `清單裡有不認得的來源:${String(item?.source)}`)
      continue
    }
    const allowed = INFO_SOURCES.includes(item.source) ? ['info'] : ['ok', 'unresolved']
    if (!allowed.includes(item.status)) add('item-shape', 'c', `${item.source} 的狀態 ${String(item.status)} 不合法`)
    if (item.status === 'ok') {
      const problem = okEvidenceProblem(item, record)
      if (problem) add('item-evidence', 'c', `${item.source}:${problem}`)
    }
  }
  for (const source of REQUIRED_SOURCES) {
    const count = items.filter((item) => item?.source === source).length
    if (count !== 1) add('item-missing', 'c', `必備來源 ${source} 出現 ${count} 次(要正好一次)`)
  }
  const unresolved = items.filter((item) => REQUIRED_SOURCES.includes(item?.source) && item?.status !== 'ok')
  if (record.unresolvedCount !== unresolved.length) add('record-tampered', 'c', `紀錄寫未解 ${String(record.unresolvedCount)},清單實算 ${unresolved.length}`)
  if (unresolved.length) {
    add('unresolved', 'b', `未解 ${unresolved.length} 項 —— ${unresolved.map((item) => `${item.source}:${item.detail}`).join(';')}`)
  }

  // (a) 綁現在這一份:產品指紋給 preview-binding;HEAD 給 git-worktree / pr-checks。
  if (!currentProductDigest) add('digest-unavailable', 'a', '算不出現在 HEAD 的產品指紋(儀器失效,不當成相符)')
  else if (record.productDigest !== currentProductDigest) {
    add('digest-mismatch', 'a', `紀錄綁的產品指紋 ${String(record.productDigest).slice(0, 8)} ≠ 現在的 ${currentProductDigest.slice(0, 8)}:紀錄之後預覽看得見的內容又改過(preview-binding 失效)`)
  }
  if (!headNow) add('head-unavailable', 'a', '讀不到現在的 HEAD(儀器失效,不當成相符)')
  else if (record.headSha !== headNow) {
    add('head-mismatch', 'a', `紀錄量的 HEAD ${String(record.headSha).slice(0, 8)} ≠ 現在的 ${headNow.slice(0, 8)}:之後又有新 commit(只改治理檔也算 —— 工作樹與 CI 讀回量的是舊 HEAD,git-worktree / pr-checks 失效),重跑 record`)
  }
  return { ok: problems.length === 0, problems }
}

/** 讀 + 驗,一次回答「這份紀錄現在還算不算數」。任何讀取 / git 失敗都算不通過(fail closed)。 */
export function checkCurrentRecord() {
  let paths
  try {
    paths = selfAuditPaths()
  } catch (error) {
    return { ok: false, problems: [{ code: 'instrument', clause: 'a', detail: `儀器失效:${error.message}` }], file: null }
  }
  const { record, problem } = readSelfAuditRecord(paths)
  if (problem) {
    const detail = problem.code === 'record-missing' ? `找不到紀錄(${paths.file})` : problem.detail
    return { ok: false, problems: [{ code: problem.code, clause: problem.code === 'record-missing' ? 'abc' : 'c', detail }], file: paths.file }
  }
  let currentProductDigest = null
  try { currentProductDigest = productContentDigest('HEAD') } catch { currentProductDigest = null }
  return {
    ...verifySelfAuditRecord(record, {
      currentProductDigest,
      currentHeadSha: currentHeadSha(),
      expectedGeneratorBlobSha: generatorBlobSha(),
    }),
    file: paths.file,
    record,
  }
}

function describeProblems(problems) {
  return problems.map((problem) => `(${problem.clause}) ${problem.detail}`).join(';')
}

/** Stop hook 入口的純邏輯:偵測 → (要同意才)讀紀錄驗證 → 給 hook 的判定。 */
export function stopCheck(input, { check = () => checkCurrentRecord(), policy = loadConsentPolicy() } = {}) {
  const detection = detectConsentRequest(input || {}, policy)
  if (!detection.asking) return { block: false, asking: false, acknowledged: Boolean(detection.acknowledged) }
  const verdict = check()
  if (verdict.ok) return { block: false, asking: true, matches: detection.matches }
  const first = detection.matches[0]
  const reason = [
    `🚨 ${BLOCK_MARKER}(${SELF_AUDIT_NAME};user 2026-11-17 原話「${USER_VERBATIM_2026_11_17}」):`,
    `這一回合在向 user 要發版同意 ——「${first.sentence.slice(0, 120)}」——`,
    `但自我稽核紀錄不成立:${describeProblems(verdict.problems)}。`,
    '補法:跑 `node scripts/release-self-audit.mjs record`,把它列的未解項修完(提交、推上去、等 CI 讀回)後再跑一次,印出零未解才可以開口;',
    '還沒查乾淨就照實回報還差什麼,先不要請 user 說「發版」(已經送出去的推播 / 提問,在回覆裡講明那一則先不算)。',
    '紀錄只涵蓋機器讀得到的項目,零未解不等於沒有遺漏;AI 記在別處的待辦仍要在回覆裡照實列出。',
  ].join('')
  return { block: true, asking: true, matches: detection.matches, problems: verdict.problems, reason }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function printRecordSummary(record, file) {
  const lines = [
    `${SELF_AUDIT_NAME}紀錄:${file}`,
    `  產品指紋 ${record.productDigest.slice(0, 12)}…  HEAD ${record.headSha.slice(0, 12)}  產生於 ${record.generatedAt}`,
    ...record.items.map((item) => `  [${item.status === 'ok' ? '通過' : item.status === 'info' ? '清單' : '未解'}] ${item.source}:${item.detail}`),
    record.unresolvedCount === 0
      ? '機器可讀項目未解 0 項:可以向 user 要發版同意(記得把上面的預覽改動清單照實列給 user;這不代表沒有遺漏,記在別處的待辦另外照實列)。'
      : `未解 ${record.unresolvedCount} 項:修完、推上去、CI 讀回後重跑本指令;在那之前不要請 user 說「發版」。`,
    '紀錄綁這個 HEAD:之後任何新 commit(只改治理檔也算)都要重跑。',
  ]
  console.log(lines.join('\n'))
}

function readStdin() {
  return readFileSync(0, 'utf8')
}

function main(argv) {
  const [command, ...flags] = argv
  const json = flags.includes('--json')
  if (command === 'record') {
    let record
    let file
    try {
      record = collectSelfAudit()
      file = writeSelfAuditRecord(record)
    } catch (error) {
      console.error(`寫不出${SELF_AUDIT_NAME}紀錄(儀器失效,不是沒問題):${error.message}`)
      return 2
    }
    if (json) console.log(JSON.stringify({ file, ...record }, null, 2))
    else printRecordSummary(record, file)
    return record.unresolvedCount === 0 ? 0 : 1
  }
  if (command === 'verify') {
    const verdict = checkCurrentRecord()
    if (json) console.log(JSON.stringify({ ok: verdict.ok, file: verdict.file, problems: verdict.problems }, null, 2))
    else console.log(verdict.ok ? `紀錄成立:${verdict.file}` : `紀錄不成立:${describeProblems(verdict.problems)}`)
    return verdict.ok ? 0 : 1
  }
  if (command === 'stop-check') {
    let input
    try {
      input = JSON.parse(readStdin())
    } catch {
      console.error('stop-check 需要 stdin 一個 JSON 物件')
      return 1
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      console.error('stop-check 需要 stdin 一個 JSON 物件')
      return 1
    }
    const result = stopCheck(input)
    console.log(JSON.stringify(result))
    return result.block ? 2 : 0
  }
  console.error('用法:node scripts/release-self-audit.mjs <record|verify|stop-check> [--json]')
  return 1
}

if (process.argv[1] && resolve(process.argv[1]) === SELF_PATH) process.exitCode = main(process.argv.slice(2))
