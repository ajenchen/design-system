#!/usr/bin/env node
// Converts the latest genuine user message in a provider transcript into bounded,
// machine-readable design-edit authorization evidence. Denial and uncertainty always win.

import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
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

function transcriptState(transcriptPath) {
  const stat = statSync(transcriptPath)
  if (!stat.isFile()) throw new Error('transcript is not a regular file')
  // Bound parsing cost while retaining the latest records. A partial first line is discarded.
  const body = readFileSync(transcriptPath)
  const bounded = body.length > 4 * 1024 * 1024 ? body.subarray(body.length - 4 * 1024 * 1024) : body
  const records = jsonValues(bounded.toString('utf8'))
  const userMessages = []
  let lastUserRecordIndex = -1
  for (const [index, record] of records.entries()) {
    const message = record?.message || record
    if (message?.role !== 'user') continue
    const text = textContent(message.content).trim()
    if (!text) continue
    userMessages.push(text)
    lastUserRecordIndex = index
  }
  return {
    records,
    userMessages,
    latestUserMessage: userMessages.at(-1) ?? '',
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
  const componentIndex = segments.lastIndexOf('components')
  if (componentIndex >= 0 && segments[componentIndex + 1]) {
    aliases.add(segments[componentIndex + 1])
  }
  return [...aliases].filter((alias) => alias.length >= 3)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function exactTargetBinding(message, target) {
  const normalized = normalizeText(message)
  for (const alias of targetAliases(target).sort((left, right) => right.length - left.length)) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(alias)}([^\\p{L}\\p{N}]|$)`, 'iu')
    if (pattern.test(normalized)) return alias
  }
  return null
}

function exactAliasOccurrences(message, alias) {
  const normalized = normalizeText(message)
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${escapeRegExp(alias)})(?=[^\\p{L}\\p{N}]|$)`,
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

const TARGET_DENIAL_PATTERNS = [
  /(?:先|暫時|現在)?\s*(?:不要|別|不准|禁止|停止|暫停|擱置|取消)\s*(?:再|先|直接|馬上|立刻)?\s*(?:改|修改|變更|實作|執行|套用|採用|發布|推送|合併|做)/u,
  /(?:不可以|不能|不可)\s*(?:再|直接)?\s*(?:改|修改|變更|做|執行|實作|採用|套用|發布)/u,
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
  /(?:介面|界面|使用者可感知|產品語意|設計意圖|元件契約|資訊架構|工作流程|導覽|視覺(?:層級)?|外觀|樣式|佈局|布局|間距|留白|顏色|色彩|紅色|藍色|綠色|字體排印|尺寸|大小|寬度|高度|懸停|焦點|動畫|轉場|互動|行為|內容語意|文案|標籤|圖示|圓角|陰影|邊框|透明度|變體|設計 (?:token|規則)|狀態機|無障礙|可及性|鍵盤|停用)/u,
]

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
  /(?:修 bug|修復|修正|除錯|重構|測試|治理|基礎設施|修補|回歸|根因|型別錯誤|編譯|建置|鉤子|解析器|結構描述|漂移|單一來源|原始碼修正|無障礙|可及性|符合|遵循|對齊|同步|機械|還原|恢復|一致性)/u,
]

// Source bytes can look visual even when the requested action is a pure engineering
// remediation (for example, restoring an existing hover token or correcting aria-expanded).
// Only an exact target-bound remediation scope may use that authority; generic engineering
// delegation must never authorize an otherwise-unresolved product/UI/UX choice.
const REMEDIATION_ACTION_PATTERNS = [
  /\b(?:bugfix|fix|repair|correct|refactor|remediat(?:e|ion)|regression|align|alignment|conform|conformance|synchroni[sz]e|restore|mechanical)\b/iu,
  /(?:修 bug|修復|修正|除錯|重構|修補|回歸|對齊|同步|機械|還原|恢復|符合|遵循)/u,
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
  /(?:同意|核可|批准|拍板|採用|採納|選擇|決定|改成|改為|換成|設為|保留|移除|新增|使用)/u,
  /(?:方案|選項|option)\s*[A-Za-z0-9一二三四五六七八九十]+/iu,
  /\b(?:approve|approved|adopt|choose|select|change\s+to|set\s+to|keep|remove|add|use)\b/iu,
]

const OPERATION_SHA256_PATTERN =
  /\boperation(?:\s+evidence)?\s+sha(?:-?256)?\s*[:=]\s*([a-f0-9]{64})\b/iu

const GLOBAL_UI_SCOPE_PATTERN =
  /(?:(?:所有|任何|全部)\s*(?:產品|design-system|DS)?\s*(?:ui|ux|介面|界面|視覺|互動|產品設計)|\b(?:all|every)\s+(?:product\s+|design-system\s+)?(?:ui|ux|visual|interaction)s?\b)/iu

const GLOBAL_REMEDIATION_SCOPE_PATTERN =
  /(?:(?:修復|修正|對齊|同步|還原|恢復).{0,32}(?:所有|任何|全部).{0,48}(?:bug|缺陷|回歸|無障礙|可及性|a11y|accessibility|既有|現有|SSOT|規格)|\b(?:fix|repair|correct|align|synchroni[sz]e|restore)\s+(?:all|every)\b.{0,48}\b(?:bugs?|regressions?|a11y|accessibility|existing|documented|canonical|ssot|spec)\b)/iu

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
  let latest = null
  for (const clause of messageClauses(normalized)) {
    const binding = actionableTargetBinding(clause, target)
      ?? (GLOBAL_REMEDIATION_SCOPE_PATTERN.test(clause)
        ? 'global-engineering-remediation-scope'
        : null)
    if (!binding || !matchesAny(REMEDIATION_ACTION_PATTERNS, clause)) continue
    const scopeIsUiOrExistingRequirement = matchesAny(UI_DECISION_MARKERS, clause)
      || matchesAny(EXISTING_REQUIREMENT_PATTERNS, clause)
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
  for (const clause of clauses) {
    const targetBinding = actionableTargetBinding(clause, target)
    const globalUiBinding = GLOBAL_UI_SCOPE_PATTERN.test(clause) ? 'global-ui-scope' : null
    const binding = targetBinding ?? globalUiBinding
    if (!binding) continue
    const denialText = withoutNoWaitClauses(clause)
    // 「要不要改」contains the bytes「不要改」but is a question, not a revocation.
    if (targetBinding && matchesAny(TARGET_BINARY_QUESTION_PATTERNS, clause)) {
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

function engineeringScopeDecision(message, target) {
  const normalized = normalizeText(message)
  let latest = null
  for (const clause of messageClauses(normalized)) {
    const binding = actionableTargetBinding(clause, target)
    if (!binding || !matchesAny(ENGINEERING_INTENT_PATTERNS, clause)) continue
    latest = { binding, message: normalized, clause }
  }
  return latest
}

function classifyLatestAuthorizationUnscoped(message, {
  target = '',
  operationText = '',
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
  if (activeTargetDecision?.kind === 'discussion') {
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
  const operationHasUiIntent = matchesAny(UI_OPERATION_MARKERS, operationText)
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
  if (matchesAny(UI_OPERATION_MARKERS, normalizedOperation)) {
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

export function authorizationEvidence(transcriptPath, {
  target = '',
  hookInput = null,
} = {}) {
  const state = transcriptState(transcriptPath)
  const operationText = toolOperations(state.turnRecords, hookInput, target)
  const latestNormalized = normalizeText(state.latestUserMessage)
  if (matchesAny(BLANKET_DELEGATION_PATTERNS, latestNormalized)
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
      evidence = {
        schemaVersion: 1,
        kind: 'latest-user-design-authorization',
        ...classifyOperationAuthorization({
          target,
          operationText: toolOperations([], hookInput, target),
        }),
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
