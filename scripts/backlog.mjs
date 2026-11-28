#!/usr/bin/env node
// backlog.mjs —— 待辦正本(governance/backlog/items.json)的驗證、單一住處防線、給 user 的視圖產生器。
//
// 為什麼(2026-11-28):repo 沒有「待辦唯一住處」的規定也沒有檢查,每批工作在 git 不追蹤的 tmp/ 交接夾
// 自開清單,repo 內另有規劃文件、m22 / dim74 清單、規格裡的「待 user 決定」段;換交接夾時沒有搬遷核對,
// 「表格一次到位升級」(舊 A101 → BL-011)兩度遺失。規則與 user 原話錨:governance/backlog/README.md。
//
// 用法(由 scripts/governance-build-graph.json 的 backlog stage 呼叫):
//   node scripts/backlog.mjs --generate   驗證正本 → 寫 governance/backlog/user-view.md
//   node scripts/backlog.mjs --check      驗證正本 + 單一住處防線 + 視圖是否最新(governance:check)
//   node scripts/backlog.mjs --selftest   對照組:真實內容要綠、每一種弄壞都要紅
// 有 verifyCmd 的項可由 scripts/verify-backlog.mjs 直接重跑(OPEN / RESOLVED)。

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { runClosedGit } from './lib/closed-tool-execution.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const ITEMS_PATH = 'governance/backlog/items.json'
export const VIEW_PATH = 'governance/backlog/user-view.md'
export const SCHEMA_PATH = 'infra/governance/schemas/backlog.schema.json'
const OPEN_STATUSES = new Set(['open', 'in-progress', 'blocked'])
const USER_KINDS = new Set(['user-directed', 'user-decision'])

// 檔名像待辦清單、但已改成歷史 reference(內容指向 BL 編號)或本身是工具的已提交檔。新增一筆要寫理由。
export const ALLOWED_LIST_FILES = new Map([
  ['governance/planning/m22-citation-backlog.md', '歷史優先序快照;未結的驗證債已搬到 BL-025'],
  ['.claude/tracker/m22-citation-backlog.md', '同上一份的舊版鏡像(本機狀態區);檔頭指向 BL-025'],
  ['.claude/logs/dim74-overlay-backlog.md', '2026-07-16 重掃紀錄;未結的 7 檔已搬到 BL-026'],
  ['infra/governance/schemas/backlog.schema.json', '正本自己的欄位規格,不是另開的清單'],
])
// 規格裡含「待決 / 待定」字樣、但不是未決事項的句子(歷史敘述或禁令)。以「路徑 + 句中片段」精確比對。
export const SPEC_PENDING_ALLOWLIST = [
  { path: 'packages/design-system/src/tokens/color/color.spec.md', includes: '又把它列成待決事項', reason: '禁令:不得再把已定案的對比列成待決' },
  { path: 'packages/design-system/src/components/Chart/chart.spec.md', includes: '列為待決,user 沒有回覆這一題', reason: '歷史敘述:AI 推導已定案並標【AI 推導】' },
  { path: 'packages/design-system/src/tokens/token-system.spec.md', includes: '列為待決,user 沒有回覆這一題', reason: '歷史敘述:AI 推導已定案並標【AI 推導】' },
]

const LIST_NAME_RE = /(?:^|[-_. ])(?:todos?|tracker|open-items|backlog)(?:[-_. ]|$)|待辦/i
const LIST_EXT_RE = /\.(?:md|json|jsonl|txt|csv|ya?ml|html)$/i
const SPEC_PENDING_RE = /待\s*user\s*(?:決定|拍板)|待決|待定(?!義)/
const CODE_EXT_RE = /\.(?:[cm]?[jt]sx?|sh|py|css)$/
const CODE_MARKER_RE = /(?:^|\s)(?:\/\/+|#+|\/?\*+|<!--)\s*(?:TODO|FIXME)\b/
const BL_REF_RE = /BL-\d{3}/g
const OPEN_ROW_STATUS_RE = /^(?:\*\*)?\s*(?:待做|待決|待查|待篩|待辦|未開始|研究中|進行中|待\s*user|open\b|todo\b)/i

function fail(errors, message) { errors.push(message) }

export function validateBacklog(doc, schema) {
  const errors = []
  // strictRequired 關掉:schema 的 if / then / not 子句只寫 required(欄位定義在上層 properties)。
  const validate = new Ajv2020({ allErrors: true, strict: true, strictRequired: false }).compile(schema)
  if (!validate(doc)) {
    for (const error of validate.errors || []) fail(errors, `schema ${error.instancePath || '/'} ${error.message}`)
    return errors
  }
  const ids = new Set()
  const oldIds = new Map()
  const openRoots = new Map()
  const openQuotes = new Map()
  const orders = new Map()
  for (const item of doc.items) {
    if (ids.has(item.id)) fail(errors, `${item.id}: id 重複`)
    ids.add(item.id)
    for (const old of item.oldIds) {
      if (oldIds.has(old)) fail(errors, `${item.id}: 舊編號 ${old} 已在 ${oldIds.get(old)}(同一件事只能一項)`)
      oldIds.set(old, item.id)
    }
    if (!OPEN_STATUSES.has(item.status)) continue
    if (openRoots.has(item.rootCause)) fail(errors, `${item.id}: rootCause「${item.rootCause}」與未結項 ${openRoots.get(item.rootCause)} 重複 —— 同根因要合成一項`)
    openRoots.set(item.rootCause, item.id)
    for (const source of item.source || []) {
      const key = source.quote.replace(/\s+/g, '')
      if (openQuotes.has(key)) fail(errors, `${item.id}: 原話「${source.quote.slice(0, 24)}…」已在未結項 ${openQuotes.get(key)} —— 同一句話只能對應一項`)
      openQuotes.set(key, item.id)
    }
    if (USER_KINDS.has(item.kind)) {
      if (orders.has(item.order)) fail(errors, `${item.id}: order ${item.order} 與 ${orders.get(item.order)} 重複`)
      orders.set(item.order, item.id)
    }
  }
  return errors
}

const escapeCell = (value) => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const STATUS_LABEL = { open: '未開始', 'in-progress': '進行中', blocked: '暫停', done: '完成', dropped: '不做' }

export function renderUserView(doc) {
  const userItems = doc.items.filter(item => USER_KINDS.has(item.kind) && OPEN_STATUSES.has(item.status))
    .sort((left, right) => left.order - right.order)
  const engineeringOpen = doc.items.filter(item => !USER_KINDS.has(item.kind) && OPEN_STATUSES.has(item.status))
  const askUser = engineeringOpen.filter(item => item.askUser).length
  const humanOnly = engineeringOpen.filter(item => item.status === 'blocked').length
  const done = doc.items.filter(item => item.status === 'done').length
  const dropped = doc.items.filter(item => item.status === 'dropped').length
  const rows = userItems.map((item) => {
    const latest = item.source[item.source.length - 1]
    const excerpt = latest.quote.length > 60 ? `${latest.quote.slice(0, 60)}…` : latest.quote
    const kind = item.kind === 'user-decision' ? '要你拍板' : '你交代的'
    const status = `${STATUS_LABEL[item.status]}${item.blockedReason ? `:${item.blockedReason}` : ''}(查證 ${item.verifiedAt})`
    return `| ${item.order} | ${item.id} | ${kind} | ${escapeCell(item.title)} | 「${escapeCell(excerpt)}」(${latest.date}) | ${escapeCell(status)} | ${escapeCell(item.orderReason)} |`
  })
  return [
    `<!-- @generated by scripts/backlog.mjs --generate from ${ITEMS_PATH}; DO NOT EDIT -->`,
    '# 待辦:給你看的那份',
    '',
    `正本 \`${ITEMS_PATH}\`(規則與錨見同資料夾 \`README.md\`)。這裡只列你交代過要做的與要你拍板的,照建議順序排;同一個根因只有一項。每次拿給你看之前先重跑查證,已解的先改成完成。`,
    '',
    '| 順序 | 編號 | 類別 | 這件事 | 你的原話(最近一則節錄) | 狀態 | 為什麼排這裡 |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    `AI 自己處理中 ${engineeringOpen.length} 項(不列明細,照價值閘分批自動做)。其中 ${askUser} 項 AI 判定要你拍板、還沒正式問過你(下一份決策頁一次問,問了才進上表);${humanOnly} 項卡在只有你能做的動作(需要時只問一個確切動作)。已完成 ${done} 項、不做 ${dropped} 項。`,
    '',
  ].join('\n')
}

function trackedFiles(root) {
  // 連「還沒 git add、沒被忽略」的新檔一起看:提交前跑 --check 就要抓得到,不能等提交後才紅(2026-11-28 規格核對必修 1)。
  const result = runClosedGit(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, maxOutputBytes: 16 * 1024 * 1024, timeoutMs: 30_000 })
  if (result.error || result.status !== 0) throw new Error(`git ls-files failed (${result.status ?? result.error?.message})`)
  return result.stdout.split('\0').filter(Boolean)
}

// files:[{ path, text }],text 只在需要內容的檔才讀(呼叫端用 getter 延遲讀)。
export function scanSingleHome({ files, registry, knownIds }) {
  const errors = []
  for (const file of files) {
    const base = file.path.split('/').pop()
    if (LIST_EXT_RE.test(base) && LIST_NAME_RE.test(base.replace(LIST_EXT_RE, ''))
      && !file.path.startsWith('governance/backlog/') && !file.path.startsWith('governance/archive/')
      && !ALLOWED_LIST_FILES.has(file.path)) {
      fail(errors, `${file.path}: 檔名像待辦清單 —— 待辦只住 ${ITEMS_PATH}(歷史 reference 才進 scripts/backlog.mjs 的允許清單)`)
    }
    const isSpec = file.path.endsWith('.spec.md')
    const isCode = CODE_EXT_RE.test(file.path) && !file.path.includes('/node_modules/')
    if (!isSpec && !isCode) continue
    const lines = file.text.split('\n')
    lines.forEach((line, index) => {
      const at = `${file.path}:${index + 1}`
      if (isSpec && SPEC_PENDING_RE.test(line) && !/BL-\d{3}/.test(line)
        && !SPEC_PENDING_ALLOWLIST.some(entry => entry.path === file.path && line.includes(entry.includes))) {
        fail(errors, `${at}: 規格的「待 user 決定 / 待決 / 待定」必須帶 BL 編號(題目與狀態只住 ${ITEMS_PATH})`)
      }
      if (isCode && CODE_MARKER_RE.test(line) && !/BL-\d{3}/.test(line)) {
        fail(errors, `${at}: 程式的 TODO / FIXME 註解必須帶 BL 編號(先在 ${ITEMS_PATH} 開一項)`)
      }
      for (const ref of line.match(BL_REF_RE) || []) {
        if (!knownIds.has(ref)) fail(errors, `${at}: 指向不存在的 ${ref}`)
      }
    })
  }
  for (const document of registry.documents) {
    if (document.status !== 'active' || !document.text) continue
    const openRows = document.text.split('\n').filter((line) => {
      if (!line.startsWith('|') || /^\|\s*-/.test(line)) return false
      const cells = line.split('|').map(cell => cell.trim()).filter(Boolean)
      return cells.length >= 2 && OPEN_ROW_STATUS_RE.test(cells[cells.length - 1])
    })
    if (openRows.length) fail(errors, `${document.path}: 登記為 active 的規劃文件含 ${openRows.length} 列未結表 —— 待辦只住 ${ITEMS_PATH},規劃文件只寫 BL 編號`)
  }
  return errors
}

function readJson(root, path) { return JSON.parse(readFileSync(resolve(root, path), 'utf8')) }

function repositorySnapshot(root) {
  const paths = trackedFiles(root)
  const files = paths
    .filter(path => !path.startsWith('node_modules/'))
    .map(path => ({
      path,
      get text() {
        try { return readFileSync(resolve(root, path), 'utf8') } catch { return '' }
      },
    }))
  const registryDoc = readJson(root, 'governance/planning/registry.json')
  const registry = {
    documents: registryDoc.documents.map(document => ({
      ...document,
      text: document.status === 'active' ? readFileSync(resolve(root, document.path), 'utf8') : '',
    })),
  }
  return { files, registry }
}

export function checkRepository(root = ROOT) {
  const doc = readJson(root, ITEMS_PATH)
  const schema = readJson(root, SCHEMA_PATH)
  const errors = validateBacklog(doc, schema)
  if (errors.length) return errors
  const { files, registry } = repositorySnapshot(root)
  errors.push(...scanSingleHome({ files, registry, knownIds: new Set(doc.items.map(item => item.id)) }))
  let view = ''
  try { view = readFileSync(resolve(root, VIEW_PATH), 'utf8') } catch { /* 缺檔 = 過期 */ }
  if (view !== renderUserView(doc)) fail(errors, `${VIEW_PATH} 不是最新:跑 npm run governance:generate`)
  return errors
}

function selftest(root = ROOT) {
  const doc = readJson(root, ITEMS_PATH)
  const schema = readJson(root, SCHEMA_PATH)
  const snapshot = repositorySnapshot(root)
  const materialized = snapshot.files.map(file => ({ path: file.path, text: (file.path.endsWith('.spec.md') || CODE_EXT_RE.test(file.path)) ? file.text : '' }))
  const knownIds = new Set(doc.items.map(item => item.id))
  const clone = () => JSON.parse(JSON.stringify(doc))
  const results = []
  // 弄壞的格只看「比原樣多出來的錯」:原樣若本來就紅,不能讓既有的錯冒充這一格抓到了。
  const baseline = new Set([
    ...validateBacklog(doc, schema),
    ...scanSingleHome({ files: materialized, registry: snapshot.registry, knownIds }),
  ])
  const expect = (label, allErrors, shouldFail) => {
    const errors = shouldFail === null ? allErrors : allErrors.filter(error => !baseline.has(error))
    const ok = shouldFail ? errors.length > 0 : errors.length === 0
    results.push(ok)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} → ${errors.length ? `紅(${errors[0]})` : '綠'}`)
  }
  const firstOpen = (predicate) => doc.items.findIndex(item => OPEN_STATUSES.has(item.status) && predicate(item))
  expect('原樣:正本驗證', validateBacklog(doc, schema), null)
  expect('原樣:單一住處防線', scanSingleHome({ files: materialized, registry: snapshot.registry, knownIds }), null)
  expect('原樣:視圖與正本一致', renderUserView(doc) === readFileSync(resolve(root, VIEW_PATH), 'utf8') ? [] : ['視圖過期'], null)
  let broken = clone(); delete broken.items[firstOpen(item => item.kind === 'user-directed')].source
  expect('弄壞:user-directed 拿掉原話', validateBacklog(broken, schema), true)
  broken = clone(); const doneIndex = broken.items.findIndex(item => item.status === 'done'); delete broken.items[doneIndex].doneRef
  expect('弄壞:done 拿掉 doneRef', validateBacklog(broken, schema), true)
  broken = clone(); delete broken.items[firstOpen(item => item.kind === 'engineering')].evidence
  expect('弄壞:未結項拿掉查證證據', validateBacklog(broken, schema), true)
  broken = clone(); delete broken.items[firstOpen(item => item.kind === 'engineering')].valueGate
  expect('弄壞:engineering 拿掉 valueGate', validateBacklog(broken, schema), true)
  broken = clone(); broken.items[1].id = broken.items[0].id
  expect('弄壞:id 重複', validateBacklog(broken, schema), true)
  broken = clone(); { const a = firstOpen(item => USER_KINDS.has(item.kind)); const b = doc.items.findIndex((item, index) => index > a && OPEN_STATUSES.has(item.status) && USER_KINDS.has(item.kind)); broken.items[b].source = [...broken.items[b].source, broken.items[a].source[0]] }
  expect('弄壞:同一句原話出現在兩個未結項', validateBacklog(broken, schema), true)
  broken = clone(); { const a = firstOpen(() => true); const b = doc.items.findIndex((item, index) => index > a && OPEN_STATUSES.has(item.status)); broken.items[b].rootCause = broken.items[a].rootCause }
  expect('弄壞:兩個未結項同一個 rootCause', validateBacklog(broken, schema), true)
  broken = clone(); { const index = firstOpen(item => item.kind === 'engineering' && !item.source); broken.items[index].kind = 'user-directed'; delete broken.items[index].valueGate; delete broken.items[index].suggestion; delete broken.items[index].askUser; broken.items[index].order = 99; broken.items[index].orderReason = '沒有原話的冒充' }
  expect('弄壞:沒有原話卻標 user-directed', validateBacklog(broken, schema), true)
  const scan = (extra, registry = snapshot.registry) => scanSingleHome({ files: [...materialized, ...extra], registry, knownIds })
  expect('弄壞:提交一份 tmp/notes/TRACKER.md', scan([{ path: 'tmp/notes/TRACKER.md', text: '' }]), true)
  expect('弄壞:提交一份 docs/MASTER-TODO.md', scan([{ path: 'docs/MASTER-TODO.md', text: '' }]), true)
  expect('弄壞:規格加一句沒帶編號的「待 user 決定」', scan([{ path: 'packages/design-system/src/components/X/x.spec.md', text: '- 鈕要不要停用,待 user 決定。' }]), true)
  expect('對照:同一句帶 BL 編號', scan([{ path: 'packages/design-system/src/components/X/x.spec.md', text: '- 鈕要不要停用,待 user 決定(BL-001)。' }]), false)
  // 夾具字串用拼接,免得本檔自己的原始碼被同一條規則掃到。
  const marker = ['//', 'TO' + 'DO'].join(' ')
  expect('弄壞:程式加註解標記沒帶編號', scan([{ path: 'packages/design-system/src/components/X/x.tsx', text: `const a = 1 ${marker}: 之後改` }]), true)
  expect('對照:註解標記帶 BL 編號', scan([{ path: 'packages/design-system/src/components/X/x.tsx', text: `const a = 1 ${marker}(BL-012): 之後改` }]), false)
  expect('弄壞:指向不存在的編號', scan([{ path: 'packages/design-system/src/components/X/x.tsx', text: `// 見 ${'BL-'}${'999'}` }]), true)
  expect('弄壞:active 規劃文件含未結表', scan([], { documents: [...snapshot.registry.documents, { path: 'governance/planning/x.md', status: 'active', text: '| id | 項目 | 狀態 |\n|---|---|---|\n| A1 | 某事 | 待做(工程) |' }] }), true)
  const staleView = renderUserView({ ...doc, items: doc.items.slice(1) })
  expect('弄壞:視圖過期(少一項)', staleView === renderUserView(doc) ? [] : ['視圖過期'], true)
  const failed = results.filter(ok => !ok).length
  console.log(`\n═══ backlog selftest ${results.length - failed}/${results.length} PASS ═══`)
  return failed === 0
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  const mode = process.argv[2]
  const rootArg = process.argv.indexOf('--root')
  const root = rootArg > 0 ? resolve(process.argv[rootArg + 1]) : ROOT
  try {
    if (mode === '--generate') {
      const doc = readJson(root, ITEMS_PATH)
      const errors = validateBacklog(doc, readJson(root, SCHEMA_PATH))
      if (errors.length) throw new Error(errors.join('\n  '))
      writeFileSync(resolve(root, VIEW_PATH), renderUserView(doc))
      console.log(`Backlog view generated: ${VIEW_PATH}`)
    } else if (mode === '--check') {
      const errors = checkRepository(root)
      if (errors.length) throw new Error(`${errors.length} problem(s):\n  ${errors.join('\n  ')}`)
      console.log('Backlog PASS: 正本、單一住處、視圖皆一致')
    } else if (mode === '--selftest') {
      if (!selftest(root)) process.exit(1)
    } else {
      console.error('用法: node scripts/backlog.mjs --generate|--check|--selftest [--root <dir>]')
      process.exit(2)
    }
  } catch (error) {
    console.error(`Backlog FAIL: ${error.message}`)
    process.exit(1)
  }
}
