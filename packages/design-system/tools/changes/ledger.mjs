// 變更帳本(ds-changes.json)的唯一讀法 —— 隨 npm 出貨(tools/),消費端的升版指令與 DS 端的閘 / 發布說明讀同一支。
//
// 帳本住 `packages/design-system/ds-changes.json`(出貨後 = node_modules/@qijenchen/design-system/ds-changes.json)。
// 每節的鍵 = **含這些變更的那個版本號**(下一次發布的版本);節只加不刪,已發布的節逐位元不再改,寫錯用新節的 errata 更正。
// 呼叫端:
//   - scripts/public-surface-invariant.mjs —— 公開介面比對閘(帳本形狀、與偵測到的差異逐條對應)
//   - tools/codemods/index.mjs —— `qijenchen-ds-codemod upgrade`(選節、套 fix、列剩下的)
//   - scripts/release-github-release.mjs —— GitHub Release「破壞性變更」段(renderReleaseSection + idsMissingFromText)
//   - scripts/build-fork-governance.mjs —— 消費端 hook 的「曾刪除或改名的名字」名單(removedNamesDocument → fork references/ds-removed-names.json)
//   - ds-canonical/hooks/lib/_ds_removed_names.sh —— DS 作者 repo 裡由 CLI `removed-names` 當場投影同一份名單
// 本檔只准用 node 內建模組:Release 的 publish job 沒有 npm install,消費端的升版指令也不該多帶依賴。

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LEDGER_PACKAGE_PATH = 'ds-changes.json'
export const LEDGER_REPO_PATH = 'packages/design-system/ds-changes.json'
export const LEDGER_SURFACES = Object.freeze(['export', 'prop', 'type', 'subpath', 'token', 'class', 'default', 'behavior', 'rule'])
export const LEDGER_CHANGES = Object.freeze(['removed', 'renamed', 'required', 'narrowed', 'default', 'behavior', 'rule'])
/** 這幾種 change 一定對到比對閘偵測到的差異(寫了卻沒發生 = 紅);behavior / rule 是機器看不到、由作者登記的 */
export const LEDGER_DETECTED_CHANGES = Object.freeze(['removed', 'renamed', 'required', 'narrowed', 'default'])
export const LEDGER_FIX_OPS = Object.freeze(['rename-prop', 'rename-export', 'rename-token'])
const ENTRY_KEYS = new Set(['id', 'surface', 'target', 'change', 'to', 'fix', 'do', 'spec'])
const ERRATUM_KEYS = new Set(['supersedes', 'surface', 'target', 'change', 'to', 'fix', 'do', 'spec'])
const SECTION_KEYS = new Set(['changes', 'errata'])
const ID_SLUG = /^[A-Za-z0-9._:-]+$/

export class LedgerError extends Error {}

// ── 版本號 ───────────────────────────────────────────────────────────────────────
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
export function parseVersion(v) {
  const m = typeof v === 'string' ? SEMVER.exec(v.trim().replace(/^v/, '')) : null
  if (!m) throw new LedgerError(`「${v}」不是 semver 版本號`)
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ? m[4].split('.') : [] }
}
/** semver 2.0.0 第 11 條的先後(-1 / 0 / 1) */
export function compareVersions(a, b) {
  const x = parseVersion(a)
  const y = parseVersion(b)
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i += 1) {
    if (i >= x.pre.length) return -1
    if (i >= y.pre.length) return 1
    const p = x.pre[i]
    const q = y.pre[i]
    if (p === q) continue
    const pn = /^\d+$/.test(p)
    const qn = /^\d+$/.test(q)
    if (pn && qn) return Number(p) < Number(q) ? -1 : 1
    if (pn !== qn) return pn ? -1 : 1
    return p < q ? -1 : 1
  }
  return 0
}

// ── 形狀 ─────────────────────────────────────────────────────────────────────────
/** 帳本裡的版本節(依版本排序;不是版本號的鍵 —— 例 $comment —— 略過) */
export function ledgerSections(ledger) {
  if (!ledger || typeof ledger !== 'object' || !ledger.releases || typeof ledger.releases !== 'object' || Array.isArray(ledger.releases)) {
    throw new LedgerError('帳本沒有 releases 物件')
  }
  const out = []
  for (const [version, section] of Object.entries(ledger.releases)) {
    parseVersion(version)
    out.push([version, section])
  }
  return out.sort((a, b) => compareVersions(a[0], b[0]))
}

const sentenceCount = (text) => text.split(/[。!?!?]/).map((s) => s.trim()).filter(Boolean).length

function fixProblems(fix, where) {
  const problems = []
  if (!fix || typeof fix !== 'object' || Array.isArray(fix)) return [`${where}:fix 要是物件`]
  if (!LEDGER_FIX_OPS.includes(fix.op)) return [`${where}:fix.op「${fix.op}」不在三種內(${LEDGER_FIX_OPS.join(' / ')})`]
  const str = (k) => typeof fix[k] === 'string' && fix[k].trim()
  if (!str('from') || !str('to')) problems.push(`${where}:fix 要有 from / to`)
  if (fix.op === 'rename-prop') {
    if (!Array.isArray(fix.components) || !fix.components.length || !fix.components.every((c) => typeof c === 'string' && /^[A-Z]\w*$/.test(c))) problems.push(`${where}:rename-prop 要列出 components(元件名)`)
    if (fix.values !== undefined && (typeof fix.values !== 'object' || Array.isArray(fix.values) || !Object.values(fix.values).every((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null))) problems.push(`${where}:rename-prop 的 values 要是「舊值 → 新值」對照(新值 = 字串 / 數字 / 布林;null = 拿掉這個屬性)`)
    if (fix.pxToNumber !== undefined && typeof fix.pxToNumber !== 'boolean') problems.push(`${where}:pxToNumber 要是布林`)
    for (const k of Object.keys(fix)) if (!['op', 'components', 'from', 'to', 'values', 'pxToNumber'].includes(k)) problems.push(`${where}:rename-prop 不認得 fix.${k}`)
  } else if (fix.op === 'rename-export') {
    for (const k of Object.keys(fix)) if (!['op', 'from', 'to'].includes(k)) problems.push(`${where}:rename-export 不認得 fix.${k}`)
  } else if (fix.op === 'rename-token') {
    if (str('from') && !fix.from.startsWith('--')) problems.push(`${where}:rename-token 的 from 要是 CSS 變數(--x)`)
    if (fix.classes !== undefined) {
      const c = fix.classes
      if (!c || typeof c !== 'object' || !Array.isArray(c.prefixes) || !c.prefixes.length || typeof c.from !== 'string' || typeof c.to !== 'string') problems.push(`${where}:rename-token 的 classes 要是 { prefixes: [...], from, to }`)
    }
    for (const k of Object.keys(fix)) if (!['op', 'from', 'to', 'classes'].includes(k)) problems.push(`${where}:rename-token 不認得 fix.${k}`)
  }
  return problems
}

function entryShapeProblems(e, where, { erratum = false } = {}) {
  const problems = []
  if (!e || typeof e !== 'object' || Array.isArray(e)) return [`${where}:不是物件`]
  const allowed = erratum ? ERRATUM_KEYS : ENTRY_KEYS
  for (const k of Object.keys(e)) if (!allowed.has(k)) problems.push(`${where}:不認得欄位「${k}」`)
  const has = (k) => typeof e[k] === 'string' && e[k].trim()
  if (!erratum) {
    for (const k of ['id', 'surface', 'target', 'change', 'do', 'spec']) if (!has(k)) problems.push(`${where}:${k} 空白`)
  }
  if (e.surface !== undefined && !LEDGER_SURFACES.includes(e.surface)) problems.push(`${where}:surface「${e.surface}」不在 ${LEDGER_SURFACES.join(' / ')}`)
  if (e.change !== undefined && !LEDGER_CHANGES.includes(e.change)) problems.push(`${where}:change「${e.change}」不在 ${LEDGER_CHANGES.join(' / ')}`)
  if (!erratum && e.change === 'renamed' && !has('to')) problems.push(`${where}:change = renamed 一定要寫 to(新名字,與 target 同一套鍵)`)
  if (e.to !== undefined && !has('to')) problems.push(`${where}:to 空白`)
  if (has('do')) {
    const n = sentenceCount(e.do)
    if (n < 1 || n > 3) problems.push(`${where}:do 要一到三句(實得 ${n} 句)`)
  }
  if (has('spec') && !/^[^「」\s]+「[^「」]+」$/.test(e.spec.trim())) problems.push(`${where}:spec 要寫成「出貨檔路徑「段名」」(例 src/components/Dialog/dialog.spec.md「寬度檔位」)`)
  if (e.fix !== undefined) problems.push(...fixProblems(e.fix, where))
  return problems
}

/** 解析 spec 欄:「src/x.spec.md「段名」」→ { path, section } */
export function parseSpecRef(spec) {
  const m = /^([^「」\s]+)「([^「」]+)」$/.exec(String(spec ?? '').trim())
  return m ? { path: m[1], section: m[2] } : null
}

/**
 * 帳本自己的形狀(不需要知道公開介面):節的鍵是版本號、依版本排序、欄位齊全、id 全帳本唯一且以節的版本開頭、
 * errata 指到更早一節的 id。回 problems(字串陣列)。
 */
export function ledgerShapeProblems(ledger) {
  const problems = []
  let sections
  try { sections = ledgerSections(ledger) } catch (e) { return [e.message] }
  const keys = Object.keys(ledger.releases)
  if (keys.join('\n') !== sections.map(([v]) => v).join('\n')) problems.push('releases 的節要依版本由舊到新排')
  const ids = new Map()
  for (const [version, section] of sections) {
    const at = `releases["${version}"]`
    if (!section || typeof section !== 'object' || Array.isArray(section)) { problems.push(`${at} 要是 { changes: [...], errata?: [...] }`); continue }
    for (const k of Object.keys(section)) if (!SECTION_KEYS.has(k)) problems.push(`${at}:不認得「${k}」`)
    if (!Array.isArray(section.changes)) { problems.push(`${at}.changes 要是陣列`); continue }
    section.changes.forEach((e, i) => {
      const where = `${at}.changes[${i}]${e?.id ? `(${e.id})` : ''}`
      problems.push(...entryShapeProblems(e, where))
      if (typeof e?.id === 'string') {
        if (!e.id.startsWith(`${version}/`) || !ID_SLUG.test(e.id.slice(version.length + 1))) problems.push(`${where}:id 要寫成「${version}/<英數 . _ : ->」`)
        if (ids.has(e.id)) problems.push(`${where}:id「${e.id}」重複(${ids.get(e.id)} 已用)`)
        ids.set(e.id, version)
      }
    })
    if (section.errata !== undefined) {
      if (!Array.isArray(section.errata)) { problems.push(`${at}.errata 要是陣列`); continue }
      section.errata.forEach((e, i) => {
        const where = `${at}.errata[${i}]`
        problems.push(...entryShapeProblems(e, where, { erratum: true }))
        const target = typeof e?.supersedes === 'string' ? ids.get(e.supersedes) : undefined
        if (!target) problems.push(`${where}:supersedes「${e?.supersedes}」不是更早一節的條目 id`)
        else if (compareVersions(target, version) >= 0) problems.push(`${where}:supersedes 只能更正更早的節(${e.supersedes} 在 ${target})`)
        if (Object.keys(e ?? {}).length < 2) problems.push(`${where}:勘誤沒有更正任何欄位`)
      })
    }
  }
  return problems
}

// ── 選節 / 套勘誤 ─────────────────────────────────────────────────────────────────
/**
 * 升版用:from(不含)之後、到 to(含)為止各節的條目,已套用 to 以前所有節的 errata。
 * from 省略 = 從頭。回 [{ version, entry }](entry 是套完勘誤的副本,多一個 corrected: [勘誤所在版本])。
 */
export function entriesBetween(ledger, { from = null, to }) {
  if (!to) throw new LedgerError('沒有目標版本(已裝的版本)')
  const sections = ledgerSections(ledger)
  const errata = new Map()
  for (const [version, section] of sections) {
    if (compareVersions(version, to) > 0) break
    for (const e of section.errata ?? []) {
      if (!errata.has(e.supersedes)) errata.set(e.supersedes, [])
      errata.get(e.supersedes).push({ version, e })
    }
  }
  const out = []
  for (const [version, section] of sections) {
    if (from && compareVersions(version, from) <= 0) continue
    if (compareVersions(version, to) > 0) break
    for (const raw of section.changes ?? []) {
      const entry = structuredClone(raw)
      const corrected = []
      for (const { version: ev, e } of errata.get(raw.id) ?? []) {
        for (const [k, v] of Object.entries(e)) if (k !== 'supersedes') entry[k] = structuredClone(v)
        corrected.push(ev)
      }
      if (corrected.length) entry.corrected = corrected
      out.push({ version, entry })
    }
  }
  return out
}

// ── 發布說明 ──────────────────────────────────────────────────────────────────────
const oneLine = (s) => String(s ?? '').trim().replace(/\s*\n\s*/g, ' ')
const CHANGE_LABEL = Object.freeze({ removed: '移除', renamed: '改名', required: '改必填', narrowed: '收窄', default: '預設值', behavior: '行為', rule: '規則' })

/** GitHub Release「破壞性變更」段:帳本那一節(含 errata)→ markdown。節不存在或沒有條目 → 空字串。 */
export function renderReleaseSection(ledger, version) {
  const problems = ledgerShapeProblems(ledger)
  if (problems.length) throw new LedgerError(`帳本形狀不對:${problems.slice(0, 3).join(';')}`)
  const section = ledger.releases[version]
  if (!section || (!section.changes?.length && !section.errata?.length)) return ''
  const fixable = section.changes.filter((e) => e.fix).length
  const lines = [
    `## 破壞性變更(${section.changes.length} 條)`,
    '',
    `來源:套件內 \`${LEDGER_PACKAGE_PATH}\` 的「${version}」節(唯一來源,本段由它產生)。升版:開專用分支、裝這個 exact 版本,再跑 \`npx qijenchen-ds-codemod upgrade\` —— 帶 fix 的 ${fixable} 條會自動改,其餘列出檔案:行號、做法與規格段落。`,
    '',
    ...section.changes.map((e) => `- \`${e.id}\` ${CHANGE_LABEL[e.change] ?? e.change} \`${e.target}\`${e.to ? ` → \`${e.to}\`` : ''}${e.fix ? '(可自動改)' : ''}:${oneLine(e.do)}(規格:${oneLine(e.spec)})`),
  ]
  if (section.errata?.length) {
    lines.push('', '### 勘誤(更正更早版本的條目)', '')
    for (const e of section.errata) lines.push(`- 更正 \`${e.supersedes}\`:${Object.entries(e).filter(([k]) => k !== 'supersedes').map(([k, v]) => `${k} = ${typeof v === 'string' ? oneLine(v) : JSON.stringify(v)}`).join(';')}`)
  }
  return lines.join('\n')
}

/** 發布說明讀回驗收:那一節每個條目 id(與勘誤指到的 id)都要出現在說明裡(整個 id 比對,不比子字串) */
export function idsMissingFromText(ledger, version, text) {
  if (typeof text !== 'string' || !text.trim()) throw new LedgerError('發布說明是空的 —— 沒驗到不是通過')
  const section = ledger?.releases?.[version]
  if (!section) return []
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const ids = [...(section.changes ?? []).map((e) => e.id), ...(section.errata ?? []).map((e) => e.supersedes)]
  return ids.filter((id) => !new RegExp(`(?<![A-Za-z0-9._:/-])${esc(id)}(?![A-Za-z0-9_:/-]|\\.[A-Za-z0-9])`).test(text))
}

// ── 消費端名單 ────────────────────────────────────────────────────────────────────
/**
 * 「曾刪除或改名、目前不存在」的名字 → 消費端寫入當下擋的名單(fork/references/ds-removed-names.json 的內容;
 * 讀者 = hooks/lib/_ds_removed_names.sh,由 check_consumer_code_quality.sh 呼叫)。
 * 「目前不存在」由帳本自己判:removed / renamed 條目之後,沒有更新的節對同一個 target 寫 behavior 條目(同名換義:名字回來了,
 * 比對閘 public-surface-invariant 會要求這一條),而且條目的 to 不是它自己(to = target 表示名字照用、由別處提供 ——
 * 例:DS 不再自己宣告的 animate-accordion-down 由 tw-animate-css 提供)。
 * 只收消費端程式 / 文件裡寫得出來的名字:出口名、CSS 變數、@utility class、元件參數(元件 + 參數)、子路徑。
 */
export function removedNamesProjection(ledger) {
  const sections = ledgerSections(ledger)
  const latest = sections.at(-1)?.[0]
  if (!latest) return []
  const selected = entriesBetween(ledger, { to: latest })
  const reintroduced = new Map()
  for (const { version, entry } of selected) {
    if (entry.change !== 'behavior') continue
    if (!reintroduced.has(entry.target)) reintroduced.set(entry.target, [])
    reintroduced.get(entry.target).push(version)
  }
  const stillExists = (entry, version) => entry.to === entry.target || (reintroduced.get(entry.target) ?? []).some((v) => compareVersions(v, version) > 0)
  const names = []
  const seen = new Set()
  for (const { version, entry } of selected) {
    if (!['removed', 'renamed'].includes(entry.change) || stillExists(entry, version)) continue
    const base = { since: version, id: entry.id, to: entry.to ?? null, do: entry.do, spec: entry.spec }
    let row = null
    if (entry.surface === 'export' && /^[A-Za-z_$][\w$]*$/.test(entry.target)) row = { kind: 'export', name: entry.target }
    else if (entry.surface === 'token' && /^--[\w-]+$/.test(entry.target)) row = { kind: 'token', name: entry.target }
    else if (entry.surface === 'class' && /^[\w-]+$/.test(entry.target)) row = { kind: 'class', name: entry.target }
    else if (entry.surface === 'subpath' && entry.target.startsWith('./')) row = { kind: 'subpath', name: `@qijenchen/design-system${entry.target.slice(1)}` }
    else if (entry.surface === 'prop') {
      // 元件參數:fix 列了元件就用它;沒有 fix 時從 target 推(`ChromeHeaderProps.lockDensity` → ChromeHeader;Labels 的鍵不收 —— 寫在物件字面值裡,
      // 名字太泛,「元件 + 參數」比不到)
      const m = /^([A-Z][A-Za-z0-9]*?)(?:OwnProps|Props)?\.([A-Za-z_$][\w$]*)$/.exec(entry.target)
      const components = entry.fix?.op === 'rename-prop' ? entry.fix.components : m && !/Labels$/.test(m[1]) ? [m[1]] : []
      const prop = entry.fix?.op === 'rename-prop' ? entry.fix.from : m?.[2]
      if (entry.fix?.op === 'rename-prop' && entry.fix.from === entry.fix.to) continue
      for (const component of components) {
        const key = `prop:${component}.${prop}`
        if (!prop || seen.has(key)) continue
        seen.add(key)
        // 參數的新名字寫成元件上要寫的那個參數名(`DialogContentProps.width` → width)
        const to = entry.fix?.op === 'rename-prop' ? entry.fix.to : entry.to ? entry.to.slice(entry.to.lastIndexOf('.') + 1) : null
        names.push({ kind: 'prop', name: prop, component, ...base, to })
      }
      continue
    }
    if (!row) continue
    const key = `${row.kind}:${row.name}`
    if (seen.has(key)) continue
    seen.add(key)
    names.push({ ...row, ...base })
  }
  return names.sort((a, b) => (a.kind + (a.component ?? '') + a.name).localeCompare(b.kind + (b.component ?? '') + b.name))
}

/** fork/references/ds-removed-names.json 的整份內容(build-fork-governance 與 CLI 共用,同一份序列化) */
export function removedNamesDocument(ledger) {
  return {
    $comment: `generated from ${LEDGER_REPO_PATH} (packages/design-system/tools/changes/ledger.mjs removedNamesProjection) — do not edit; read by hooks/lib/_ds_removed_names.sh (check_consumer_code_quality.sh)`,
    schemaVersion: 1,
    source: LEDGER_REPO_PATH,
    names: removedNamesProjection(ledger),
  }
}

// CLI:`node ledger.mjs removed-names [帳本路徑]` → 印出名單 JSON(預設讀同一包的 ds-changes.json)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, path] = process.argv.slice(2)
  if (command !== 'removed-names') {
    console.error('usage: node ledger.mjs removed-names [path/to/ds-changes.json]')
    process.exit(2)
  }
  const file = path ?? fileURLToPath(new URL(`../../${LEDGER_PACKAGE_PATH}`, import.meta.url))
  let ledger
  try { ledger = JSON.parse(readFileSync(file, 'utf8')) } catch (error) { console.error(`INSTRUMENT-FAIL ledger: ${file}: ${error.message}`); process.exit(2) }
  process.stdout.write(`${JSON.stringify(removedNamesDocument(ledger), null, 2)}\n`)
}
