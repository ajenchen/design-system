#!/usr/bin/env node
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIRECTORY = resolve(ROOT, 'governance/planning')
const REGISTRY_PATH = resolve(DIRECTORY, 'registry.json')
const SCHEMA_PATH = resolve(ROOT, 'infra/governance/schemas/planning-registry.schema.json')

const ENGINEERING_OPERATION_RE = /(?:\b(?:commit|push|pull[\s-]?request|pr|release|publish|deploy|dispatch|reconcile|apply|rollout|rollback|fanout|external[\s-]?writes?)\b|(?<!\bdeep[\s-])\bmerge\b|存進版本紀錄|推送|合併|發版|發布|部署|派送|調諧|套用|分批上線|回滾|傳播|外部寫入)/iu
const HUMAN_ACTOR_RE = /(?:\b(?:user|human|owner|maintainer|account[\s-]?holder)\b|使用者|用戶|人類|真人|帳號持有人)/iu
const USER_OR_HUMAN_ACTOR_RE = /(?:\b(?:user|human|account[\s-]?holder)\b|使用者|用戶|人類|真人|帳號持有人)/iu
const APPROVAL_DECISION_RE = /(?:\b(?:approval|approve|confirmation|confirm|decision|decide|trigger|authorization|authorize|sign[\s-]?off|go[\s-]?ahead)\b|拍板|核准|確認|決定|同意|授權|觸發)/iu
const IMPLICIT_APPROVAL_RE = /(?:\b(?:approval|confirmation|sign[\s-]?off)\b|拍板|核准|人類授權)/iu
const CHECKPOINT_RE = /(?:\b(?:awaits?|awaiting|wait(?:s|ing)?|pending|requires?|required|needs?|needed|until|blocked|stop|ask)\b|等待|尚待|需要|需|須|必須|(?:等(?:待|候)?|待)\s*(?:user|owner|human|使用者|用戶|人類|真人))/iu
const HUMAN_ONLY_ACTION_RE = /(?:\b(?:log[\s-]?in|sign[\s-]?in|mfa|2fa|oauth|credential(?:\s+reference)?|secret(?:\s+reference)?|billing|payment|spend|legal|account|organization|org(?:anization)?\s+permission|business\s+commitment)\b|登入|多因素驗證|雙重驗證|憑證|密鑰|機密|付費|帳務|法律|帳號|組織權限|商業承諾)/iu
const PRODUCT_UIUX_P2H_RE = /(?:\bP2H\b.{0,80}(?:product|UI|UX|SSOT)|(?:product|產品)[\s／/]*(?:UI)[\s／/]*(?:UX).{0,80}(?:SSOT|P2H)|(?:visual|視覺).{0,48}(?:baseline|canonical|基線|標準)|(?:baseline|基線).{0,48}(?:visual|視覺))/iu
const NEGATED_HUMAN_CHECKPOINT_RES = [
  /\b(?:does|do|must|should|shall|need)\s+not\s+(?:wait|require|need|ask)\b/iu,
  /\bno\s+(?:additional\s+)?(?:human|user|owner)?\s*(?:approval|confirmation|sign[\s-]?off|approval\s+checkpoint|user\s+trigger)\b/iu,
  /(?:不(?:另|再)?等(?:待)?|無需(?:再)?等(?:待)?|不需要|不用|毋須).{0,40}(?:user|owner|human|使用者|人類|核准|拍板|確認|觸發|trigger)/iu,
  /不.{0,48}(?:或|且|並)(?:另|再)?等(?:待)?.{0,40}(?:user|owner|human|使用者|人類|核准|拍板|確認|觸發|trigger)/iu,
  /(?:不得|禁止).{0,64}(?:當(?:作|成)|視為|要求|等待).{0,48}(?:人類|user|owner|approval|核准|拍板|trigger)/iu,
  /(?:不得|禁止).{0,160}(?:綁(?:定|回)?|依賴|交還|變成|設為|當(?:作|成)|視為|要求|等待).{0,80}(?:人類|user|owner|approval|核准|拍板|trigger)/iu,
  /(?:不是|不屬於|非).{0,40}(?:人類核准|核准關卡|approval\s+checkpoint|user\s+trigger|human\s+approval)/iu,
]

function invariant(condition, message) { if (!condition) throw new Error(message) }
function readJson(path, label) {
  const info = lstatSync(path)
  invariant(info.isFile() && !info.isSymbolicLink(), `${label} must be a regular no-symlink file`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function validatePlanningDocumentAuthority(document) {
  if (document.status === 'awaiting-approval') {
    invariant(
      /\bP2H\b/.test(document.reason)
        && /product\/UI\/UX SSOT/i.test(document.reason),
      `${document.path} awaiting-approval is reserved for a genuine product/UI/UX SSOT P2H decision`,
    )
  }
  return document
}

function hasHumanApprovalCheckpoint(value) {
  const humanActor = HUMAN_ACTOR_RE.test(value)
  const userOrHumanActor = USER_OR_HUMAN_ACTOR_RE.test(value)
  const approvalDecision = APPROVAL_DECISION_RE.test(value)
  const checkpoint = CHECKPOINT_RE.test(value)
  const explicitOwnerCheckpoint = /(?:\bowner\b.{0,40}(?:approval|decision|required|needed|trigger)|(?:requires?|needs?|awaits?|waits?\s+for).{0,24}\bowner\b|由\s*owner\s*(?:拍板|核准|確認|決定)|(?:需|等)待?\s*owner)/iu.test(value)
  return (userOrHumanActor && approvalDecision && checkpoint)
    || (humanActor && approvalDecision && checkpoint)
    || explicitOwnerCheckpoint
    || (IMPLICIT_APPROVAL_RE.test(value) && checkpoint)
}

function explicitlyRejectsHumanCheckpoint(value) {
  return NEGATED_HUMAN_CHECKPOINT_RES.some(pattern => pattern.test(value))
}

function previousNonEmptyLine(lines, index) {
  for (let candidate = index - 1; candidate >= Math.max(0, index - 2); candidate -= 1) {
    if (lines[candidate].trim()) return lines[candidate]
  }
  return ''
}

export function validateActivePlanningDocumentContent(document, content) {
  if (document.status !== 'active' || document.executable !== true) return document
  invariant(typeof content === 'string', `${document.path} active planning content must be text`)
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const prior = previousNonEmptyLine(lines, index)
    const candidate = ENGINEERING_OPERATION_RE.test(line)
      ? line
      : hasHumanApprovalCheckpoint(line) && ENGINEERING_OPERATION_RE.test(prior)
        ? `${prior} ${line}`
        : ''
    if (!candidate || !hasHumanApprovalCheckpoint(candidate)) continue
    if (explicitlyRejectsHumanCheckpoint(candidate)) continue
    const classificationContext = lines.slice(Math.max(0, index - 3), Math.min(lines.length, index + 2)).join(' ')
    if (PRODUCT_UIUX_P2H_RE.test(classificationContext) || HUMAN_ONLY_ACTION_RE.test(classificationContext)) continue
    throw new Error(
      `${document.path}:${index + 1} active engineering operation must not depend on a human approval checkpoint; `
      + 'use Standing Authorization AUTO or classify a genuine product/UI/UX SSOT P2H or precise human-only platform action',
    )
  }
  return document
}

export function validatePlanningRegistry({ root = ROOT } = {}) {
  const directory = resolve(root, 'governance/planning')
  const registry = readJson(resolve(directory, 'registry.json'), 'planning registry')
  const schema = readJson(resolve(root, 'infra/governance/schemas/planning-registry.schema.json'), 'planning registry schema')
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
  invariant(validate(registry), `planning registry schema failure:${(validate.errors || []).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')}`)
  const paths = registry.documents.map(document => document.path)
  invariant(new Set(paths).size === paths.length, 'planning registry paths must be unique')
  const actual = readdirSync(directory).filter(name => name !== 'README.md' && name !== 'registry.json').sort().map(name => `governance/planning/${name}`)
  invariant(JSON.stringify([...paths].sort()) === JSON.stringify(actual), `planning registry inventory drift: expected=${paths.length} actual=${actual.length}`)
  for (const document of registry.documents) {
    validatePlanningDocumentAuthority(document)
    invariant(document.executable === (document.status === 'active'), `${document.path} executable must be true exactly for active status`)
    if (document.path.includes('.completed.')) invariant(document.status === 'completed', `${document.path} filename requires completed status`)
    if (document.path.includes('.rejected.')) invariant(document.status === 'rejected', `${document.path} filename requires rejected status`)
    const absolute = resolve(root, document.path)
    invariant(absolute.startsWith(`${directory}/`), `planning registry path escapes directory:${document.path}`)
    const info = lstatSync(absolute)
    invariant(info.isFile() && !info.isSymbolicLink(), `planning document must be a regular no-symlink file:${document.path}`)
    if (document.path.endsWith('.md')) {
      const content = readFileSync(absolute, 'utf8')
      invariant(content.includes('governance/planning/registry.json'), `planning document lacks authority registry pointer:${document.path}`)
      validateActivePlanningDocumentContent(document, content)
    } else {
      const content = readFileSync(absolute, 'utf8')
      const parsed = JSON.parse(content)
      invariant(parsed._authority === 'governance/planning/registry.json', `planning JSON lacks authority registry pointer:${document.path}`)
      validateActivePlanningDocumentContent(document, content)
    }
  }
  return { documents: registry.documents.length, active: registry.documents.filter(document => document.status === 'active').map(document => document.path) }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    const result = validatePlanningRegistry()
    console.log(`Planning registry PASS: ${result.documents} document(s), ${result.active.length} active`)
  } catch (error) {
    console.error(`Planning registry FAIL: ${error.message}`)
    process.exit(1)
  }
}
