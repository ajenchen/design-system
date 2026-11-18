#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 一輪 /knowledge-prune 真的照 SKILL.md 走完 —— Phase 5 報告有範本規定的每一段、Metric delta 五列有數字、
 *         Retire rate 的 N / M 與百分比算得對、D1–D10 每維恰好一個判定、Retired 每項附 grep、metric snapshot 與報告一致、
 *         Phase 1 每個 ID 都有結局(區間內、Prune-Items 列了這個 ID 的 commit,或「沒做 + 理由」),
 *         而且每個 prune commit 都記了 Prune-Items 與 Phase0-After
 *   紅: (a)–(i) 任一項拿掉一段 —— 少一段、少一列數字、百分比算錯、某維兩個判定、Retired 某項沒附 grep、snapshot 對不上、
 *       某個 ID 沒有結局或理由寫「下次再做 / 時間不夠」、sha 不在區間、引用的 commit 的 Prune-Items 沒有這個 ID(或根本不是
 *       prune commit)、prune commit 缺 trailer、Prune-Items 不是 ID 清單,
 *       或把兩個 P2 項塞進同一個 commit(不論 ID 之間用逗號、空白還是斜線)
 *       → 印出「❌ (字母)」並點名那一段 / 那個 ID / 那個 commit,exit 1;範本讀不到、缺代號、git 失敗、區間是空的 → exit 2(不是綠)
 *   綠: 齊全的 fixture exit 0。scripts/test-validate-knowledge-prune-run.mjs 每次先用同一份齊全 fixture 證綠,再逐項拿掉一段證紅、
 *       並把範本段名改掉證明段名真的是從範本讀的;純讀檔與讀 git,不看時鐘,同一份輸入重複跑結果相同
 *
 * ── 為什麼有這支 ──
 *
 * 2026-11-17 第二輪 knowledge-prune 的 Phase 5 報告(scratchpad prune2/prune-report.md「Self-improvement capture」)自己查出:
 * 上一輪沒照 SKILL.md 走完 —— Phase 1 沒有逐維結論、19 項只做 9 項其餘沒交代、沒有 Phase 5、被擋的指令沒告訴 user,
 * 而收尾用的是「推上去 + CI 綠」。CI 驗的是 repo 內容彼此一致,不驗流程有沒有走完;拿 CI 綠當 prune 完成,
 * 就是 meta-patterns M37 說的「拿當下剛好成立的觀察量代替要保證的性質」。共同根因是 SKILL.md 每一步都只是散文,
 * 沒有任何東西會在「沒照做」時變紅。本檔把 Phase 5 的完成條件變成可以紅的東西。
 *
 * ── 讀什麼、不讀什麼 ──
 *
 * 段名、Metric delta 的列名、Self-improvement 的小項、D1–D10 的維度清單,全部從
 * skills/knowledge-prune/references/phase5-report-template.md 讀(範本只有一個住所,M17)。
 * 本檔只認範本標題尾端的代號(`<!-- id: … -->`),用來知道「哪一段要做哪種檢查」。
 * markdown 只比標題列與列首文字,不解析排版:太嚴會誤紅,誤紅比沒有閘更糟。
 *
 * 用法:
 *   node scripts/validate-knowledge-prune-run.mjs --report <md> --findings <md> --snapshot <jsonl> --base <commit> [--template <md>]
 *   node scripts/validate-knowledge-prune-run.mjs --commits-only <base>..<head>
 * 結束碼:0 綠 / 1 紅 / 2 量具讀不到東西(範本、git、參數、空區間)
 */
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SELF_PATH = 'scripts/validate-knowledge-prune-run.mjs'
const TEMPLATE_PATH = 'packages/design-system/ds-canonical/skills/knowledge-prune/references/phase5-report-template.md'
const EXIT = Object.freeze({ green: 0, red: 1, instrument: 2 })
const FLAGS = Object.freeze(['report', 'findings', 'snapshot', 'base', 'commits-only', 'template'])

// 範本標題的代號 → 這一段做哪種檢查。段名本身不寫在這裡。
const SECTION = Object.freeze({
  report: 'report',
  metricDelta: 'metric-delta',
  retired: 'retired',
  rationale: 'rationale',
  dimensions: 'dimensions',
  outcomes: 'outcomes',
  humanOnly: 'human-only',
  blocked: 'blocked',
  selfImprovement: 'self-improvement',
})

// AGENTS.md「# 自主執行 canonical」把延後列為反 pattern;「時間不夠」是 2026-11-17 報告「沒做的與理由」P1 段點名的無效理由。
const BANNED_REASONS = Object.freeze(['下次再做', '時間不夠', '下個 session'])
const ID_SOURCE = '[A-Z][A-Za-z0-9]*(?:[-#][A-Za-z0-9]+)+'
const LEADING_ID = new RegExp(`^\\s*(?:[-*+]|\\d+[.)]|\\|)\\s*\\**\`?(${ID_SOURCE})\`?\\**(?![A-Za-z0-9#-])(.*)$`)
// Prune-Items 只能是 ID 清單:ID 之間只准空白、逗號、頓號、斜線。只認逗號拆的話,「D9-01 D9-02」「D9-01 / D9-02」會被當成 1 個 ID。
const ID_IN_LIST = new RegExp(`(?<![A-Za-z0-9#-])${ID_SOURCE}(?![A-Za-z0-9#-])`, 'g')
const ID_LIST_SEPARATORS = /[\s,,、//]+/g
const SHA_TOKEN = /\b[0-9a-f]{7,40}\b/g
const LEADING_SKIP = /^[\s::*`|—–-]*(?:沒做|未做|不做)(.*)$/
const ARROW_WITH_NUMBERS = /\d[^\n]*?(?:→|->)[^\n]*?\d/
const PHASE0_FORMAT = /^\d[\d,]*\s*\/\s*\d[\d,]*\s*\/\s*\d[\d,]*/

class InstrumentError extends Error {}

// ─────────────────────────────── 文字工具 ───────────────────────────────

function stripDecor(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '').replace(/\*\*/g, '').replace(/`/g, '').trim()
}

function stripNumbering(text) {
  return text.replace(/^(?:§\s*)?\d+(?:\.\d+)*[.、)]?\s+/, '')
}

/** 範本段名 = 標題去掉代號、編號與尾端括號說明(全形或半形)。 */
function headingKey(text) {
  let key = stripNumbering(stripDecor(text))
  for (let previous = ''; previous !== key;) {
    previous = key
    key = key.replace(/\s*[(（][^()（）]*[)）]\s*$/, '').trim()
  }
  return key
}

/** 逐行標記是否在 ``` / ~~~ 區塊裡:區塊裡的 `# …` 不是標題。 */
function toLines(text) {
  const out = []
  let fence = null
  text.split(/\r?\n/).forEach((raw, index) => {
    const opener = raw.match(/^\s*(`{3,}|~{3,})/)
    if (opener && (fence === null || opener[1][0] === fence)) {
      fence = fence === null ? opener[1][0] : null
      out.push({ text: raw, number: index + 1, fence: true })
      return
    }
    out.push({ text: raw, number: index + 1, fence: fence !== null })
  })
  return out
}

/** 列首文字:去掉條列符號 / 表格的第一根直線 / 粗體 / 反引號。 */
function rowText(text) {
  return stripDecor(text.replace(/^\s*(?:[-*+]|\d+[.)]|\|)\s*/, ''))
}

function splitCells(text) {
  return text.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((cell) => cell.trim())
}

function decimals(numberText) {
  return (String(numberText).split('.')[1] ?? '').length
}

/** 照寫出來的小數位四捨五入容許誤差。fraction=true 時至少看到小數第 2 位(0 不得冒充 0.011)。 */
function consistent(written, exact, { fraction = false } = {}) {
  const places = fraction ? Math.max(decimals(written), 2) : decimals(written)
  return Math.abs(Number(written) - exact) <= 0.5 * 10 ** -places + 1e-9
}

function short(text, length = 30) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > length ? `${flat.slice(0, length)}…` : flat
}

// ─────────────────────────────── 範本 ───────────────────────────────

function parseTemplate(path) {
  if (!existsSync(path)) throw new InstrumentError(`讀不到範本檔:${path}`)
  const text = readFileSync(path, 'utf8')
  const block = text.match(/^```markdown[^\n]*\n([\s\S]*?)^```[ \t]*$/m)
  if (!block) throw new InstrumentError(`範本檔裡找不到 \`\`\`markdown 報告範本區塊:${path}`)
  const sections = []
  let current = null
  for (const line of block[1].split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const id = heading[2].match(/<!--\s*id:\s*([a-z0-9-]+)\s*-->/)?.[1]
      if (!id) throw new InstrumentError(`範本標題沒有代號(<!-- id: … -->):${line.trim()}`)
      if (sections.some((section) => section.id === id)) throw new InstrumentError(`範本代號重複:${id}`)
      const key = headingKey(heading[2])
      if (!key) throw new InstrumentError(`範本標題去掉說明後是空的:${line.trim()}`)
      current = { id, key, lines: [] }
      sections.push(current)
      continue
    }
    if (current) current.lines.push(line)
  }
  for (const id of Object.values(SECTION)) {
    if (!sections.some((section) => section.id === id)) throw new InstrumentError(`範本缺代號 ${id} 的段落`)
  }
  for (const section of sections) {
    section.rows = section.lines
      .map((line) => line.match(/^-\s+([^*{\s][^:\n]*?):\s*(.*)$/))
      .filter(Boolean)
      .map((match) => ({ label: match[1].trim(), numeric: /\bB\s*→\s*A\b/.test(match[2]) }))
  }
  const byId = Object.fromEntries(sections.map((section) => [section.id, section]))
  const dims = byId[SECTION.dimensions].lines.map((line) => line.match(/^\|\s*\**(D\d+)(?!\d)/)?.[1]).filter(Boolean)
  if (!dims.length) throw new InstrumentError('範本「逐維三選一」表格沒有任何維度列')
  if (!byId[SECTION.metricDelta].rows.some((row) => row.numeric)) throw new InstrumentError('範本 Metric delta 沒有任何「B → A」列')
  const target = block[1].match(/target\s*≥\s*(\d+(?:\.\d+)?)\s*%/)?.[1]
  if (!target) throw new InstrumentError('範本的 Retire rate 行讀不到「target ≥ N%」')
  return { path, sections, byId, dims, target: Number(target) }
}

// ─────────────────────────────── 報告 ───────────────────────────────

function parseReport(text) {
  const lines = toLines(text)
  const headings = []
  lines.forEach((line, index) => {
    if (line.fence) return
    const match = line.text.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (match) headings.push({ index, level: match[1].length, title: match[2], norm: stripNumbering(stripDecor(match[2])).toLowerCase() })
  })
  headings.forEach((heading, position) => {
    const next = headings.slice(position + 1).find((candidate) => candidate.level <= heading.level)
    heading.body = lines.slice(heading.index + 1, next ? next.index : lines.length)
  })
  return { lines, headings }
}

function findSection(report, key) {
  return report.headings.find((heading) => heading.norm.startsWith(key.toLowerCase())) ?? null
}

function substantive(body) {
  return body
    .filter((line) => !line.fence)
    .map((line) => rowText(line.text))
    .filter((text) => text && !/^[-|:\s]+$/.test(text))
}

function findRow(body, label) {
  const wanted = label.toLowerCase()
  return body.filter((line) => !line.fence && rowText(line.text).toLowerCase().startsWith(wanted))
}

function parseRetireRates(report) {
  const found = []
  for (const line of report.lines) {
    if (line.fence || !/retire rate/i.test(line.text)) continue
    const text = stripDecor(line.text)
    const percent = text.match(/(\d+(?:\.\d+)?)\s*%/)
    const ratio = text.match(/(\d+)\s*\/\s*(?:total\s+)?(\d+)/i)
    if (!percent || !ratio) continue
    found.push({ number: line.number, percent: percent[1], retired: Number(ratio[1]), total: Number(ratio[2]) })
  }
  return found
}

// ─────────────────────────────── findings 與 git ───────────────────────────────

function parseFindings(text) {
  const ids = new Map()
  for (const line of toLines(text)) {
    if (line.fence) continue
    const match = line.text.match(LEADING_ID)
    if (!match || ids.has(match[1])) continue
    ids.set(match[1], { id: match[1], priority: match[2].match(/\[(P0|P1|P2E|P2H|P2)\]/)?.[1] ?? null })
  }
  return [...ids.values()]
}

function git(args) {
  const result = spawnSync('git', args, { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (result.error || result.status !== 0) {
    throw new InstrumentError(`git ${args.join(' ')} 失敗:${(result.stderr || result.error?.message || '').trim()}`)
  }
  return result.stdout
}

function listCommits(range) {
  return git(['log', '--reverse', '--format=%H%x1f%B%x1e', range, '--'])
    .split('\x1e')
    .map((chunk) => chunk.replace(/^\n+/, ''))
    .filter((chunk) => chunk.trim())
    .map((chunk) => {
      const [sha, ...rest] = chunk.split('\x1f')
      const message = rest.join('\x1f')
      return { sha: sha.trim(), message, subject: message.split('\n')[0].trim() }
    })
}

function isPruneSubject(subject) {
  const header = subject.match(/^([A-Za-z]+)(?:\(([^)]*)\))?!?:/)
  return Boolean(header) && (header[1].toLowerCase() === 'prune' || /knowledge-prune/i.test(header[2] ?? ''))
}

const inForceCache = new Map()

/** 規則生效 = 那個 commit 自己的 tree 已經有本檔。看的是 commit 的內容,不是日期。 */
function ruleInForce(sha) {
  if (!inForceCache.has(sha)) inForceCache.set(sha, git(['ls-tree', '--name-only', sha, '--', SELF_PATH]).trim() !== '')
  return inForceCache.get(sha)
}

/** 不靠 git 的 trailer 解析:派工格式在 Phase0-After 與 Co-Authored-By 之間隔了空行,git 只認最後一段。 */
function lastLine(message, key) {
  let value = null
  for (const match of message.matchAll(new RegExp(`^${key}:[ \\t]*(.*)$`, 'gim'))) value = match[1].trim()
  return value
}

/** 從 Prune-Items 抽出不重複的 ID;拿掉 ID 與分隔符之後還剩的字 = leftover(不得有)。 */
function parseIdList(text) {
  const ids = [...new Set([...text.matchAll(ID_IN_LIST)].map((match) => match[0]))]
  const leftover = text.replace(ID_IN_LIST, ' ').replace(ID_LIST_SEPARATORS, ' ').trim()
  return { ids, leftover }
}

// ─────────────────────────────── 各項檢查 ───────────────────────────────

function checkCommits(commits, { findingsPriority = new Map() } = {}) {
  const problems = []
  const notes = []
  const itemsBySha = new Map()
  let checked = 0
  let grandfathered = 0
  let pruneCount = 0
  for (const commit of commits) {
    if (!isPruneSubject(commit.subject)) continue
    pruneCount += 1
    const tag = `${commit.sha.slice(0, 8)}「${short(commit.subject, 40)}」`
    if (!ruleInForce(commit.sha)) {
      grandfathered += 1
      notes.push(`· ${tag} 早於本規則(那個 commit 的 tree 沒有 ${SELF_PATH}),不檢查`)
      continue
    }
    checked += 1
    const items = lastLine(commit.message, 'Prune-Items')
    const { ids, leftover } = parseIdList(items ?? '')
    itemsBySha.set(commit.sha, new Set(ids))
    if (!items) problems.push(`${tag} 缺 Prune-Items(這個 commit 處理了哪幾個 Phase 1 ID)`)
    else {
      if (!ids.length) problems.push(`${tag} 的 Prune-Items「${short(items)}」裡沒有任何 ID(要寫 Phase 1 的 ID,例 D4-02)`)
      if (leftover) problems.push(`${tag} 的 Prune-Items「${short(items)}」不是 ID 清單:除了 ID 與分隔符(空白、逗號、頓號、斜線)還有「${short(leftover)}」`)
    }
    const phase0 = lastLine(commit.message, 'Phase0-After')
    if (!phase0) problems.push(`${tag} 缺 Phase0-After(<bootstrap 行數>/<hook 數>/<meta-patterns 字數>)`)
    else if (!PHASE0_FORMAT.test(phase0)) problems.push(`${tag} 的 Phase0-After「${short(phase0)}」不是 <bootstrap 行數>/<hook 數>/<meta-patterns 字數>`)
    const declared = /\bP2[EH]?\b/i.test(lastLine(commit.message, 'Prune-Priority') ?? '')
    const fromFindings = ids.filter((id) => /^P2/.test(findingsPriority.get(id) ?? ''))
    if ((declared || fromFindings.length) && ids.length > 1) {
      const why = declared ? 'Prune-Priority 宣告 P2' : `findings 把 ${fromFindings.join('、')} 標成 P2`
      problems.push(`${tag} 是 P2 項(${why}),只准 1 個 ID,卻有 ${ids.length} 個:${ids.join(', ')}`)
    }
  }
  const summary = `區間 ${commits.length} 個 commit;prune commit ${pruneCount} 個(檢查 ${checked}、早於本規則 ${grandfathered})`
  return { problems, notes, summary, itemsBySha }
}

function validateReport({ template, report, findings, findingsError, snapshot, snapshotError, commits }) {
  const results = []
  const add = (letter, title, problems, detail = '') => results.push({ letter, title, problems, detail })
  const sectionOf = (id) => findSection(report, template.byId[id].key)

  // (c) 先算:(a) 的 rationale 段要不要必備、(e)(g) 要比對的 N / M 都看它
  const rates = parseRetireRates(report)
  const rate = rates[0] ?? null
  const cProblems = []
  if (!rate) cProblems.push('找不到 Retire rate 行(同一行要寫 Retire rate、N / M 與百分比)')
  for (const entry of rates) {
    if (entry.total <= 0 || entry.retired > entry.total) cProblems.push(`第 ${entry.number} 行 ${entry.retired} / ${entry.total} 不是合理的比例`)
    else if (!consistent(entry.percent, (entry.retired / entry.total) * 100)) {
      cProblems.push(`第 ${entry.number} 行 Retire rate ${entry.percent}% ≠ ${entry.retired} / ${entry.total} = ${((entry.retired / entry.total) * 100).toFixed(2)}%`)
    }
    if (rate && (entry.retired !== rate.retired || entry.total !== rate.total)) {
      cProblems.push(`Retire rate 前後不一致:第 ${rate.number} 行 ${rate.retired} / ${rate.total},第 ${entry.number} 行 ${entry.retired} / ${entry.total}`)
    }
  }
  const belowTarget = !rate || Number(rate.percent) < template.target
  const rationaleKey = template.byId[SECTION.rationale].key
  if (rate && belowTarget) {
    const rationale = sectionOf(SECTION.rationale)
    const body = rationale ? substantive(rationale.body).filter((text) => !/^(無|不適用|n\/?a)[。.]?$/i.test(text)) : []
    if (!body.length) cProblems.push(`Retire rate ${rate.percent}% 低於 target ${template.target}%,但「${rationaleKey}」段是空的(SKILL.md Phase 5:不可空白)`)
  }

  // (a) 必備段落與必填小項
  const aProblems = []
  for (const section of template.sections) {
    if (section.id === SECTION.rationale && !belowTarget) continue
    const found = findSection(report, section.key)
    if (!found) {
      aProblems.push(`缺必備段落「${section.key}」`)
      continue
    }
    for (const row of section.rows.filter((candidate) => !candidate.numeric)) {
      if (!findRow(found.body, row.label).length) aProblems.push(`「${section.key}」缺小項「${row.label}」`)
    }
  }
  add('a', `必備段落(範本 ${template.sections.length} 段,從 ${relative(ROOT, template.path) || template.path} 讀)`, aProblems)

  // (b) Metric delta 五列都有「前 → 後」數字
  const bProblems = []
  const metricSection = sectionOf(SECTION.metricDelta)
  const metricRows = template.byId[SECTION.metricDelta].rows.filter((row) => row.numeric)
  if (!metricSection) bProblems.push(`缺「${template.byId[SECTION.metricDelta].key}」段`)
  else {
    for (const row of metricRows) {
      const lines = findRow(metricSection.body, row.label)
      if (!lines.length) bProblems.push(`Metric delta 缺「${row.label}」列`)
      else if (!lines.some((line) => ARROW_WITH_NUMBERS.test(rowText(line.text).slice(row.label.length)))) {
        bProblems.push(`Metric delta「${row.label}」沒有「前 → 後」的數字(第 ${lines[0].number} 行)`)
      }
    }
  }
  add('b', `Metric delta ${metricRows.length} 列`, bProblems)

  add('c', 'Retire rate 的 N / M 與百分比', cProblems, rate ? `${rate.retired} / ${rate.total} = ${rate.percent}%` : '')

  // (d) D1–D10 每一維恰好一個判定
  const dProblems = []
  const dimSection = sectionOf(SECTION.dimensions)
  if (!dimSection) dProblems.push(`缺「${template.byId[SECTION.dimensions].key}」段`)
  else {
    const body = dimSection.body.filter((line) => !line.fence)
    const separator = body.findIndex((line) => /^\s*\|?\s*:?-{3,}/.test(line.text))
    const header = separator > 0 ? splitCells(body[separator - 1].text) : []
    const judgmentColumn = Math.max(header.findIndex((cell) => cell.includes('判定')), 1)
    const judgments = new Map()
    for (const line of body) {
      let code = null
      let judgment = ''
      if (/^\s*\|/.test(line.text)) {
        const cells = splitCells(line.text)
        code = stripDecor(cells[0] ?? '').match(/^(D\d+)(?!\d)/)?.[1]
        judgment = cells[judgmentColumn] ?? ''
      } else {
        const bullet = line.text.match(/^\s*(?:[-*+]|\d+[.)])\s+\**(D\d+)(?!\d)\**\s*[::]?\s*(.*)$/)
        if (bullet) [, code, judgment] = bullet
      }
      if (!code) continue
      judgments.set(code, [...(judgments.get(code) ?? []), stripDecor(judgment)])
    }
    for (const dim of template.dims) {
      const texts = judgments.get(dim)
      if (!texts) {
        dProblems.push(`缺 ${dim} 的判定`)
        continue
      }
      const joined = texts.join(' ')
      const has = [...joined.matchAll(/有候選(\s*\d+)?/g)]
      if (has.some((match) => !match[1])) dProblems.push(`${dim} 寫了「有候選」但沒有數字 N`)
      const none = (joined.match(/無候選/g) ?? []).length
      const blind = (joined.match(/儀器全盲/g) ?? []).length
      // SKILL.md D2 的寫法「儀器全盲、無候選」= 全盲所以無從提名,視同一個判定
      const total = blind === 1 && none === 1 && has.length === 0 ? 1 : has.length + none + blind
      if (total !== 1) dProblems.push(`${dim} 的判定有 ${total} 個(要恰好一個:有候選 N / 無候選 / 儀器全盲):「${short(joined, 50)}」`)
    }
  }
  add('d', `逐維三選一(${template.dims[0]}–${template.dims.at(-1)})`, dProblems)

  // (e) Retired 每一項附 grep 指令
  const eProblems = []
  const retiredKey = template.byId[SECTION.retired].key
  const retiredSection = sectionOf(SECTION.retired)
  if (!retiredSection) eProblems.push(`缺「${retiredKey}」段`)
  else {
    const items = []
    for (const line of retiredSection.body) {
      if (!line.fence && /^(?:[-*+]|\d+[.)])\s+/.test(line.text)) items.push({ head: line, lines: [line] })
      else if (!line.fence && /^\S/.test(line.text) && items.length) items.push(null)
      else if (items.length && items.at(-1)) items.at(-1).lines.push(line)
    }
    const real = items.filter(Boolean).filter((item) => !/^無[。.]?$/.test(rowText(item.head.text)))
    if (!real.length && rate && rate.retired > 0) eProblems.push(`「${retiredKey}」沒有列出任何項目,但 Retire rate 說 retired ${rate.retired}`)
    real.forEach((item, index) => {
      const hasGrep = item.lines.some((line) =>
        (line.fence && /\b(?:git\s+grep|grep|rg)\s/.test(line.text)) || /`[^`\n]*\b(?:git\s+grep|grep|rg)\s[^`\n]*`/.test(line.text))
      if (!hasGrep) eProblems.push(`「${retiredKey}」第 ${index + 1} 項「${short(rowText(item.head.text))}」沒有附 grep 指令(第 ${item.head.number} 行)`)
    })
  }
  add('e', 'Retired 每項附 grep', eProblems)

  // (f) 被擋的指令、Human-only pending 兩段不得缺、不得空
  const fProblems = []
  for (const id of [SECTION.blocked, SECTION.humanOnly]) {
    const key = template.byId[id].key
    const found = sectionOf(id)
    if (!found) fProblems.push(`缺「${key}」段(沒有就寫「無」)`)
    else if (!substantive(found.body).length) fProblems.push(`「${key}」段是空的(沒有就寫「無」)`)
  }
  add('f', '被擋的指令 / Human-only pending', fProblems)

  // (g) metric snapshot 與報告一致
  const gProblems = []
  const reportHeading = sectionOf(SECTION.report)
  const reportDate = reportHeading?.title.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null
  let snapshotDetail = ''
  if (snapshotError) gProblems.push(snapshotError)
  else {
    const entries = []
    snapshot.split('\n').forEach((raw, index) => {
      if (!raw.trim()) return
      try { entries.push({ number: index + 1, value: JSON.parse(raw) }) } catch { gProblems.push(`snapshot 第 ${index + 1} 行不是 JSON`) }
    })
    const prune = entries.filter((entry) => entry.value?.tag === 'knowledge-prune' || entry.value?.source === 'knowledge-prune').at(-1)
    if (!prune) gProblems.push('snapshot 沒有任何 "tag":"knowledge-prune" 的行(只看檔案最後一行會拿到 stop hook 每天寫的 auto-daily)')
    else {
      const value = prune.value
      snapshotDetail = `第 ${prune.number} 行`
      const date = String(value.ts ?? '').slice(0, 10)
      if (!reportDate) gProblems.push('報告標題沒有日期(YYYY-MM-DD),無法比對 snapshot')
      else if (date !== reportDate) gProblems.push(`snapshot 日期 ${date || '(沒有 ts)'} ≠ 報告日期 ${reportDate}(snapshot ${snapshotDetail})`)
      if (!rate) gProblems.push('報告沒有可比對的 Retire rate 行')
      else {
        if (value.retired !== rate.retired) gProblems.push(`snapshot retired=${value.retired} ≠ 報告 ${rate.retired}`)
        if (value.total_before !== rate.total) gProblems.push(`snapshot total_before=${value.total_before} ≠ 報告 ${rate.total}`)
        if (typeof value.retire_rate !== 'number' || !consistent(value.retire_rate, rate.retired / rate.total, { fraction: true })) {
          gProblems.push(`snapshot retire_rate=${value.retire_rate} ≠ ${rate.retired} / ${rate.total}`)
        }
      }
    }
  }
  add('g', 'metric snapshot 與報告一致', gProblems, snapshotDetail)

  // (i) 先算:(h) 要拿每個 prune commit 的 Prune-Items 交叉比對
  const commitCheck = checkCommits(commits, { findingsPriority: new Map(findings.map((finding) => [finding.id, finding.priority])) })

  // (h) Phase 1 每個 ID 都有結局
  const hProblems = []
  const hNotes = []
  const outcomesKey = template.byId[SECTION.outcomes].key
  const outcomesSection = sectionOf(SECTION.outcomes)
  if (findingsError) hProblems.push(findingsError)
  else if (!findings.length) hProblems.push('findings 讀不到任何 ID(每列開頭要是 ID,例 `- D4-02:…`;回 0 筆要先證明量具拿得到資料)')
  else if (!outcomesSection) hProblems.push(`缺「${outcomesKey}」段,${findings.length} 個 ID 都沒有結局`)
  else {
    const outcomes = new Map()
    for (const line of outcomesSection.body) {
      if (line.fence) continue
      const match = line.text.match(LEADING_ID)
      if (match) outcomes.set(match[1], [...(outcomes.get(match[1]) ?? []), { text: match[2], number: line.number }])
    }
    const checkReason = (id, reason, entry) => {
      if (!reason.replace(/[\s::,,。.;;、—–\-()()]/g, '')) hProblems.push(`${id} 寫了沒做,但沒有理由(第 ${entry.number} 行)`)
    }
    for (const { id } of findings) {
      const entries = outcomes.get(id)
      if (!entries) {
        hProblems.push(`${id} 在「${outcomesKey}」沒有一列`)
        continue
      }
      for (const entry of entries) {
        const banned = BANNED_REASONS.find((phrase) => entry.text.includes(phrase))
        if (banned) {
          hProblems.push(`${id} 的理由是「${banned}」(第 ${entry.number} 行)—— 這不是理由`)
          continue
        }
        // 開頭就寫「沒做」= 這列是「沒做 + 理由」;理由裡順帶提到的 sha 只是參考,不當成結局去核對
        const declaredSkip = entry.text.match(LEADING_SKIP)
        if (declaredSkip) {
          checkReason(id, declaredSkip[1], entry)
          continue
        }
        const tokens = entry.text.match(SHA_TOKEN) ?? []
        const cited = tokens.flatMap((token) => commits.filter((commit) => commit.sha.startsWith(token)).map((commit) => ({ token, commit })))
        if (cited.length) {
          // 「sha 在區間裡」只是代理;要保證的是「那個 commit 處理了這個 ID」,所以拿它的 Prune-Items 交叉比對
          for (const { token, commit } of cited) {
            if (!ruleInForce(commit.sha)) {
              hNotes.push(`· ${id} 引用的 ${token} 早於本規則(那個 commit 沒有 Prune-Items 可對),只核對它在 base..HEAD 裡`)
              continue
            }
            const listed = commitCheck.itemsBySha.get(commit.sha)
            if (!listed) hProblems.push(`${id} 引用的 ${token} 不是 prune commit(「${short(commit.subject, 40)}」),沒有 Prune-Items 能證明它處理了 ${id}(第 ${entry.number} 行)`)
            else if (!listed.has(id)) hProblems.push(`${id} 引用的 ${token} 的 Prune-Items 沒有 ${id}(它列的是 ${[...listed].join(', ') || '空的'};第 ${entry.number} 行)`)
          }
          continue
        }
        const skipped = entry.text.match(/(?:沒做|未做|不做)(.*)$/)
        if (skipped) {
          checkReason(id, skipped[1], entry)
          continue
        }
        if (tokens.length) hProblems.push(`${id} 的 ${tokens.join('、')} 不在 base..HEAD(第 ${entry.number} 行)`)
        else hProblems.push(`${id} 沒有 commit sha,也沒有「沒做 + 理由」(第 ${entry.number} 行)`)
      }
    }
  }
  add('h', 'Phase 1 每個 ID 都有結局', hProblems, findings.length ? `findings ${findings.length} 個 ID` : '')

  // (i) 區間內每個 prune commit 都帶 Prune-Items 與 Phase0-After
  add('i', 'prune commit 的 Prune-Items / Phase0-After', commitCheck.problems, commitCheck.summary)
  return { results, notes: [...commitCheck.notes, ...hNotes] }
}

// ─────────────────────────────── 輸出與入口 ───────────────────────────────

function print(results, notes = []) {
  for (const note of notes) console.log(note)
  let red = false
  for (const { letter, title, problems, detail } of results) {
    if (!problems.length) {
      console.log(`✅ (${letter}) ${title}${detail ? `:${detail}` : ''}`)
      continue
    }
    red = true
    for (const problem of problems) console.log(`❌ (${letter}) ${problem}`)
    if (detail) console.log(`   (${letter}) ${detail}`)
  }
  return red ? EXIT.red : EXIT.green
}

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const match = argv[index].match(/^--([a-z-]+)(?:=(.*))?$/)
    if (!match || !FLAGS.includes(match[1])) throw new InstrumentError(`看不懂的參數:${argv[index]}`)
    const value = match[2] ?? argv[index + 1]
    if (match[2] === undefined) index += 1
    if (value === undefined || value === '' || value.startsWith('--')) throw new InstrumentError(`--${match[1]} 後面要接值`)
    args[match[1]] = value
  }
  return args
}

function readInput(path, label) {
  const absolute = resolve(process.cwd(), path)
  if (!existsSync(absolute)) return { error: `讀不到${label}:${path}` }
  return { text: readFileSync(absolute, 'utf8') }
}

function runCommitsOnly(range) {
  if (!range.includes('..')) throw new InstrumentError(`--commits-only 要給區間 <base>..<head>,收到「${range}」`)
  const commits = listCommits(range)
  console.log(`=== knowledge-prune commit 檢查(${range})===`)
  if (!commits.length) throw new InstrumentError(`區間 ${range} 是空的 —— 沒拿到任何 commit,無法判定(不是綠)`)
  const { problems, notes, summary } = checkCommits(commits)
  return print([{ letter: 'i', title: 'prune commit 的 Prune-Items / Phase0-After', problems, detail: summary }], notes)
}

function runFull(args) {
  const missing = ['report', 'findings', 'snapshot', 'base'].filter((name) => !args[name])
  if (missing.length) throw new InstrumentError(`完整模式缺參數:${missing.map((name) => `--${name}`).join(' ')}`)
  const template = parseTemplate(resolve(process.cwd(), args.template ?? join(ROOT, TEMPLATE_PATH)))
  const reportInput = readInput(args.report, '報告檔')
  if (reportInput.error) {
    console.log(`❌ (a) ${reportInput.error}`)
    return EXIT.red
  }
  const findingsInput = readInput(args.findings, ' findings 檔')
  const snapshotInput = readInput(args.snapshot, ' snapshot 檔')
  const commits = listCommits(`${args.base}..HEAD`)
  console.log(`=== knowledge-prune 一輪的完成檢查(報告 ${args.report};${args.base}..HEAD)===`)
  const { results, notes } = validateReport({
    template,
    report: parseReport(reportInput.text),
    findings: findingsInput.error ? [] : parseFindings(findingsInput.text),
    findingsError: findingsInput.error,
    snapshot: snapshotInput.text,
    snapshotError: snapshotInput.error,
    commits,
  })
  return print(results, notes)
}

function main(argv) {
  try {
    const args = parseArgs(argv)
    return args['commits-only'] ? runCommitsOnly(args['commits-only']) : runFull(args)
  } catch (error) {
    if (!(error instanceof InstrumentError)) throw error
    console.error(`INSTRUMENT-FAIL ${error.message}`)
    console.error('用法:--report <md> --findings <md> --snapshot <jsonl> --base <commit> [--template <md>] | --commits-only <base>..<head>')
    return EXIT.instrument
  }
}

process.exitCode = main(process.argv.slice(2))
