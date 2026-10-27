#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: owner 文件寫的事和程式是同一件事(2026-10-21 r1b others 家族六類「文件與程式分家」,每類一條):
 *     C1 color.spec.md「Static Subtle Background」表的 bg-muted / bg-secondary 兩格是消費者登記簿 —— 以 `檔案#頂層宣告` 登記(不收行號),
 *        登記的宣告存在且真的用了該列 token(或用了同格另一個已登記的宣告),DS 原始碼(story 除外)每個用到該 token 的頂層宣告都有登記;
 *     C2 lib/README.md「當前居民」:lib/ 每個模組一列,標的「公開 / @internal / 未出口」與 root barrel(index.ts,產生器輸出)一致;
 *     C3 講 Button `loading` 的句子不說它「自動 disabled」、也不在同一句把它跟「原生 disabled」放一起而不說明不是(button.spec.md「loading」= 可聚焦的停用,焦點留著);
 *     C4 元件 / pattern / token / lib / hooks 原始碼只用 typography.spec.md 宣告的三階字重;typography.spec.md 寫到第四階的句子必須是「文件外框」那一句;
 *     C5 story 裡每個 <Steps> 都有 aria-label / aria-labelledby(steps.spec.md「A11y 預設」root aria-label 命名此流程);
 *     C6 DS(src、ds-canonical)與 scripts/ 裡的「檔名:行號」引用指得到東西:(a) 不指空行、不超出檔尾;(b) 被引用的檔改過之後,
 *        引用寫下時那一行還在原位(位移 / 被刪改且位移 = 紅;基準 = base,這次變更才寫的引用改拿寫下它的 commit);
 *        (c)「檔名#宣告」引用的宣告存在。歷史紀錄寫 `<sha>:路徑:N` / 「當時第 N 行」;合成夾具標 @cite-fixture。
 *   紅: 任一條有違規 → 指名 file:line / 登記項並 exit 1;--selftest 以合成正反例證明六條各在指定處紅(每條至少一組兩面對照)。
 *   綠: 現況六條 0 筆;靜態(TypeScript AST + 文字;C6(b) 另讀 git diff / blame),不讀時間、不開瀏覽器,重複跑結果相同;任一條讀不到它的
 *       owner 段落 / 掃到 0 個檔 / CI 找不到 base = 儀器失效(exit 2),不讀成通過。`--root=<樹>` 對另一棵工作樹跑(例:修前的樹必紅,證明量具會紅);
 *       `--base=<ref>` 指定 C6(b) 的基準(預設同 story-layer-drift 的 resolveBase);`--fix-moved-cites` 只把「原封不動、只是位移」的行號改成新位置。
 *
 * 為什麼有這支(2026-10-21,r1b others 家族):五件事各自有 owner 文件,文件說的和程式做的分家了,而且沒有任何機械面看得到 ——
 *   OTH-02 color.spec 兩格消費者用行號登記,12 筆有 7 筆過期、另漏兩處(Steps 未解鎖的圓、Avatar 中性底);
 *   NEW-04 / OTH-07 lib/README 少列 4 個模組、6 個只給 DS 內部用的新模組沒標 @internal 就進了 npm root;
 *   NEW-03 Button loading 2026-10-01 改成可聚焦的停用,4 處說明還寫「自動 disabled」;
 *   OTH-06 typography.spec 宣告三階字重,同檔另一張表卻教產品標題用 font-semibold;
 *   OTH-04 steps.spec 要 consumer 給 aria-label,DS 自己的 story 20 個 <Steps> 有 19 個沒給;
 *   第三輪審查(OTH-02 同一個病的全 DS 版):本批在 steps.tsx / tree-view.tsx 加一行 import,18 處原本正確的行號引用無聲地
 *   指到空行或別行;全 DS 另有 66 處指空行 / 超出檔尾、這個 PR 前面的 commit 又推走 150 多處 —— 沒有任何機械面看得到。
 *   M37:行號是「那一列」的代理、「有 import」是「有登記」的代理 —— 本閘量的是性質本身(宣告真的用了 token、出口真的是那個狀態)。
 *
 *   node scripts/owner-claims-invariant.mjs                 判定(exit 0 綠 / 1 紅 / 2 儀器失效)
 *   node scripts/owner-claims-invariant.mjs --selftest      對照組
 *   node scripts/owner-claims-invariant.mjs --root=<dir>    對另一棵樹判定
 *   node scripts/owner-claims-invariant.mjs --fix-moved-cites   C6(b) 純位移的行號就地改成新位置(被刪改的仍要人看)
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { resolveBase } from './story-layer-drift-invariant.mjs'

const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DS = 'packages/design-system/src'
export class InstrumentError extends Error {}

// ─── 共用:讀檔 / 走目錄 / 頂層宣告 ────────────────────────────────────────────
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, acc) } else acc.push(p)
  }
  return acc
}
const rel = (root, p) => relative(root, p).split(sep).join('/')
const lineOf = (text, pos) => text.slice(0, pos).split('\n').length
const kindOf = (file) => (file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

/** 頂層宣告的名字(`const X` / `function X` / `class X` / `interface X` / `type X`;一個 const 宣告多個名字時用逗號接) */
function statementName(st, sf) {
  if (ts.isVariableStatement(st)) return st.declarationList.declarations.map((d) => d.name.getText(sf)).join(',')
  if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) return st.name.getText(sf)
  return null
}

/** 一個 TS / TSX 檔裡,字串(含樣板字串、JSX 屬性字串)命中 re 的位置 → 所在頂層宣告。註解不算(TypeScript 不把註解當節點)。 */
export function tokenUsesTs(file, text, re) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOf(file))
  const out = []
  const visit = (n) => {
    let s = null
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) s = n.text
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) s = n.text
    if (s !== null && re.test(s)) {
      const pos = n.getStart(sf)
      const st = sf.statements.find((x) => x.getStart(sf) <= pos && pos < x.getEnd())
      out.push({ line: lineOf(text, pos), decl: st ? statementName(st, sf) : null })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/** 一個 CSS 檔裡命中 re 的自訂屬性宣告(`--x: …`)→ 名字;註解先拿掉(保留行數)。`--color-*` 是 @theme 橋接別名,不算消費者。 */
export function tokenUsesCss(text, re) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const out = []
  clean.split('\n').forEach((l, i) => {
    if (!re.test(l)) return
    const m = l.match(/^\s*(--[\w-]+)\s*:/)
    if (m && m[1].startsWith('--color-')) return
    out.push({ line: i + 1, decl: m ? m[1] : null })
  })
  return out
}

/** 某個登記的宣告的原文(TS:頂層宣告整段;CSS:那一行)。找不到 → null */
export function declarationText(file, text, name) {
  if (file.endsWith('.css')) {
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    const line = clean.split('\n').find((l) => new RegExp(`^\\s*${name.replace(/[$-]/g, '\\$&')}\\s*:`).test(l))
    return line ?? null
  }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOf(file))
  const st = sf.statements.find((x) => (statementName(x, sf) ?? '').split(',').includes(name))
  return st ? st.getText(sf) : null
}

// ─── C1:color.spec「Static Subtle Background」消費者登記簿 ─────────────────────
const COLOR_SPEC = `${DS}/tokens/color/color.spec.md`
export const SUBTLE_ROWS = [
  { token: 'bg-muted', rowStart: '| `bg-muted`(neutral-2) |', re: /(?<![\w-])bg-muted(?![\w-])|var\(--muted\)/ },
  { token: 'bg-secondary', rowStart: '| `bg-secondary`(neutral-3) |', re: /(?<![\w-])bg-secondary(?![\w-])|var\(--secondary\)/ },
]
const ANCHOR = /`([\w./-]+\.(?:tsx|ts|css))#([\w$-]+)`/g
const LINE_CITE = /`[\w./-]+\.(?:tsx|ts|css):\d+/g

/** 一格的登記項:[{ file, decl }] + 用行號登記的那幾筆 */
export function parseRegistry(cell) {
  return {
    entries: [...cell.matchAll(ANCHOR)].map((m) => ({ file: m[1], decl: m[2] })),
    lineCites: [...cell.matchAll(LINE_CITE)].map((m) => m[0].slice(1)),
  }
}

/**
 * C1 判定(純函式):spec 原文 + 讀檔函式 + DS 原始碼清單(src 相對路徑)。
 * read(srcRel) → 檔案原文或 null;sources = 要掃完整性的檔(已排除 story / probe)。
 */
export function checkSubtleRegistry(specText, read, sources) {
  const problems = []
  const specLines = specText.split('\n')
  for (const row of SUBTLE_ROWS) {
    const idx = specLines.findIndex((l) => l.startsWith(row.rowStart))
    if (idx < 0) throw new InstrumentError(`color.spec.md 找不到「${row.rowStart}」那一列(登記簿讀不到)`)
    const cells = specLines[idx].split(' | ')
    const cell = cells.slice(3).join(' | ')
    const { entries, lineCites } = parseRegistry(cell)
    if (entries.length === 0 && lineCites.length === 0) throw new InstrumentError(`color.spec.md「${row.token}」那一格一筆登記都讀不到(既沒有 \`檔案#宣告\` 也沒有行號登記)`)
    for (const c of lineCites) problems.push({ where: `${COLOR_SPEC}:${idx + 1}`, msg: `「${row.token}」用行號登記 ${c} —— 行號一改檔就過期,改成 \`檔案#頂層宣告\`` })
    const names = new Set(entries.map((e) => e.decl))
    const registered = new Set(entries.map((e) => `${e.file}#${e.decl}`))
    for (const e of entries) {
      const text = read(e.file)
      if (text === null) { problems.push({ where: `${COLOR_SPEC}:${idx + 1}`, msg: `「${row.token}」登記的 ${e.file} 不存在` }); continue }
      const decl = declarationText(e.file, text, e.decl)
      if (decl === null) { problems.push({ where: `${COLOR_SPEC}:${idx + 1}`, msg: `「${row.token}」登記的 ${e.file}#${e.decl} 找不到這個頂層宣告(改名或刪了?)` }); continue }
      const borrows = [...names].some((n) => n !== e.decl && new RegExp(`(?<![\\w$])${n.replace(/[$]/g, '\\$&')}\\(`).test(decl))
      if (!row.re.test(decl) && !borrows) problems.push({ where: `${COLOR_SPEC}:${idx + 1}`, msg: `「${row.token}」登記的 ${e.file}#${e.decl} 裡沒有用到 ${row.token}(也沒借用同格登記的宣告)—— 登記過期` })
    }
    for (const f of sources) {
      const text = read(f)
      if (text === null) continue
      const uses = f.endsWith('.css') ? tokenUsesCss(text, row.re) : tokenUsesTs(f, text, row.re)
      for (const u of uses) {
        const decls = (u.decl ?? '').split(',').filter(Boolean)
        if (decls.some((d) => /Meta$/.test(d))) continue // 元件 meta 的 tokens 清單(稽核用),不是畫面消費者
        if (decls.length && decls.some((d) => registered.has(`${f}#${d}`))) continue
        problems.push({ where: `${DS}/${f}:${u.line}`, msg: `用了 ${row.token}(${u.decl ? `宣告 ${u.decl}` : '不在任何頂層宣告裡'})卻沒登記在 color.spec.md「Static Subtle Background」${row.token} 那一格` })
      }
    }
  }
  return problems
}

// ─── C2:lib/README「當前居民」 ─────────────────────────────────────────────────
const LIB_README = `${DS}/lib/README.md`
const STATUS = [['公開', 'public'], ['`@internal`', 'internal'], ['未出口', 'unexported']]
export function parseResidents(readmeText) {
  const lines = readmeText.split('\n')
  const start = lines.findIndex((l) => /^##\s+當前居民/.test(l))
  if (start < 0) throw new InstrumentError('lib/README.md 找不到「## 當前居民」')
  const rows = []
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]) && !/^---/.test(lines[i]); i += 1) {
    const m = lines[i].match(/^\|\s*`([\w./-]+)`(?:\(([^)]*)\))?/)
    if (!m || m[1] === 'Module') continue
    const raw = m[2] ?? ''
    const hit = STATUS.find(([word]) => raw.startsWith(word))
    rows.push({ line: i + 1, module: m[1], status: hit ? hit[1] : null, raw, text: lines[i] })
  }
  return rows
}
/** index.ts → lib 模組的實際狀態:public(有出口)/ internal(產生器排除清單裡)/ unexported */
export function barrelStatus(indexText, mod) {
  const base = mod.replace(/\.tsx?$/, '').replace(/\/$/, '')
  if (new RegExp(`^export (?:\\*|\\{[^}]*\\}|type \\{[^}]*\\}) from '\\./lib/${base}(?:/[\\w-]+)?'`, 'm').test(indexText)) return 'public'
  if (new RegExp(`^//\\s+- lib/${base}(?:\\.tsx?)?\\(`, 'm').test(indexText)) return 'internal'
  return 'unexported'
}
export function checkLibResidents(readmeText, indexText, libEntries) {
  const problems = []
  const rows = parseResidents(readmeText)
  if (rows.length === 0) throw new InstrumentError('lib/README.md「當前居民」一列都讀不到')
  for (const entry of libEntries) {
    if (entry === 'utils.ts') { if (!readmeText.includes('utils.ts')) problems.push({ where: LIB_README, msg: 'utils.ts(cn())沒在 README 交代' }); continue }
    const row = rows.find((r) => r.module === entry)
    if (!row) { problems.push({ where: LIB_README, msg: `lib/${entry} 沒有列在「當前居民」(新增 lib 模組的第 2 條:README 必列 consumers)` }); continue }
    if (!row.status) { problems.push({ where: `${LIB_README}:${row.line}`, msg: `lib/${entry} 那一列沒寫「公開 / \`@internal\` / 未出口」(寫的是「${row.raw}」)` }); continue }
    const actual = barrelStatus(indexText, entry)
    if (actual !== row.status) problems.push({ where: `${LIB_README}:${row.line}`, msg: `lib/${entry} README 寫 ${row.status},root barrel 實際是 ${actual}` })
  }
  for (const r of rows) if (!libEntries.includes(r.module)) problems.push({ where: `${LIB_README}:${r.line}`, msg: `「當前居民」列了 ${r.module},lib/ 裡沒有這個模組` })
  return problems
}

/** 發布時公開、現在不公開的 lib 模組:那一列必須寫明「公開 API 移除」(純函式)。publishedIndexText = 最近一次發布的 root barrel */
export const PUBLIC_REMOVAL_MARK = '公開 API 移除'
export function findPublishedLibRemovals(readmeText, publishedIndexText, indexText, libEntries, tag) {
  const rows = parseResidents(readmeText)
  const problems = []
  const published = [...publishedIndexText.matchAll(/^export (?:\*|\{[^}]*\}|type \{[^}]*\}) from '\.\/lib\/([\w-]+)(?:\/[\w-]+)?'/gm)].map((m) => m[1])
  for (const base of [...new Set(published)]) {
    const entry = libEntries.find((e) => e.replace(/\.tsx?$/, '').replace(/\/$/, '') === base) ?? null
    const now = entry ? barrelStatus(indexText, entry) : 'deleted'
    if (now === 'public') continue
    const row = rows.find((r) => r.module.replace(/\.tsx?$/, '').replace(/\/$/, '') === base)
    if (!row || !row.text.includes(PUBLIC_REMOVAL_MARK)) {
      problems.push({ where: row ? `${LIB_README}:${row.line}` : LIB_README, msg: `lib/${base} 在 ${tag} 是公開出口,現在是 ${now} —— 這是公開 API 移除(破壞相容):那一列要寫明「${PUBLIC_REMOVAL_MARK}」、起點 commit、${tag} 出口了哪些符號、WM / template 用到幾處,並寫進發布說明` })
    }
  }
  return problems
}

// ─── C3:Button loading 的說明 ─────────────────────────────────────────────────
const LOADING_CLAIM = /自動\s*(?:設為\s*)?`?disabled`?/
const HISTORY = /之前|前走|前的|曾|退役|不轉/
/**
 * 兩種寫法都紅:
 *   (1) 該行(或它上面三行內,例:argTypes 的 `loading: {` 與 description 分行)講到 loading,且該行說「自動 disabled」;
 *   (2) 同一句(以「。」或換行斷句)同時講 `loading` 與「原生 disabled / disabled 屬性」、卻沒說它**不是**原生停用 ——
 *       第三輪審查抓到 button.anatomy 無障礙摘要「原生 disabled 屬性讓輔助技術讀出「已停用」;loading 中額外帶 aria-busy」
 *       沒有「自動」兩個字,(1) 量不到(M37:拿一個說法當代理)。
 */
const NATIVE_DISABLED = /原生\s*`?disabled`?|`?disabled`?\s*屬性/
const NOT_NATIVE = /不是原生|非原生|不轉(?:成)?原生|不再是原生|可聚焦的停用|focusable-disabled/
export function findLoadingClaims(file, text) {
  const lines = text.split('\n')
  const out = lines.flatMap((l, i) => {
    if (!LOADING_CLAIM.test(l) || HISTORY.test(l)) return []
    const near = lines.slice(Math.max(0, i - 3), i + 1).join('\n')
    return /\bloading\b/.test(near) ? [{ where: `${file}:${i + 1}`, msg: `說 Button loading「自動 disabled」—— 2026-10-01 起是可聚焦的停用(焦點留著、Tab 走得到),見 button.spec.md「loading」` }] : []
  })
  lines.forEach((l, i) => {
    for (const sentence of l.split(/。|\\n/)) {
      if (/\bloading\b/.test(sentence) && NATIVE_DISABLED.test(sentence) && !NOT_NATIVE.test(sentence) && !HISTORY.test(sentence) && !out.some((o) => o.where === `${file}:${i + 1}`)) {
        out.push({ where: `${file}:${i + 1}`, msg: `同一句把 Button loading 跟「原生 disabled」放在一起、卻沒說 loading 不是原生停用 —— 2026-10-01 起 loading = 可聚焦的停用(aria-disabled + data-disabled-focusable + aria-busy),見 button.spec.md「loading」` })
      }
    }
  })
  return out
}

// ─── C4:字重刻度 ──────────────────────────────────────────────────────────────
const TYPO_SPEC = `${DS}/tokens/typography/typography.spec.md`
const OFF_SCALE = /(?<![\w-])font-(?:thin|extralight|light|semibold|extrabold|black)(?![\w-])|(?<![\w-])font-\[\d+\]/
const DOC_CHROME_MARK = '文件外框'
export function findOffScaleWeights(file, text) {
  if (file.endsWith('.css')) {
    return tokenUsesCss(text, /font-weight\s*:\s*(?:[1-36-9]00|thin|light|semibold|black)/).map((u) => ({ where: `${file}:${u.line}`, msg: 'CSS 用了三階以外的字重' }))
  }
  return tokenUsesTs(file, text, OFF_SCALE).map((u) => ({ where: `${file}:${u.line}`, msg: '用了 typography.spec.md 三階(400 / 500 / 700)以外的字重 class —— font-semibold 只給文件外框(stories / stories-helpers)' }))
}
export function findSpecWeightAdvice(specText) {
  if (!/font-medium/.test(specText)) throw new InstrumentError('typography.spec.md 讀不到字重段落(連 font-medium 都沒有)')
  return specText.split('\n').flatMap((l, i) => (OFF_SCALE.test(l) && !l.includes(DOC_CHROME_MARK) ? [{ where: `${TYPO_SPEC}:${i + 1}`, msg: '字重 owner 的句子寫到三階以外的字重,卻不是「文件外框」那一句(產品指引只准三階)' }] : []))
}

// ─── C5:<Steps> 命名 ──────────────────────────────────────────────────────────
export function findUnnamedSteps(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out = []
  const visit = (n) => {
    const el = ts.isJsxSelfClosingElement(n) ? n : ts.isJsxElement(n) ? n.openingElement : null
    if (el && el.tagName.getText(sf) === 'Steps') {
      const names = el.attributes.properties.filter(ts.isJsxAttribute).map((a) => a.name.getText(sf))
      if (!names.includes('aria-label') && !names.includes('aria-labelledby')) out.push({ where: `${file}:${lineOf(text, el.getStart(sf))}`, msg: '<Steps> 沒有 aria-label / aria-labelledby(steps.spec.md「A11y 預設」:consumer 命名此流程)' })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

// ─── C6:「檔名:行號」引用與「檔名#宣告」引用 ─────────────────────────────────────
// 2026-10-21 r1b others 第三輪審查:本批在 steps.tsx / tree-view.tsx 加一行 import,18 處原本正確的行號引用就無聲地指到
// 空行或別的行(OTH-02 同一個病:行號是「那一段」的代理,M37)。三條:
//   (a) 引用指到空行或超出檔尾 = 一定壞了(不論誰改的);
//   (b) 被引用的檔在 base 之後改過:base 那一行原封不動、只是位置變了,或那一行被刪 / 改寫且位置變了 → 紅,
//       除非引用那一行本身也在這次變更裡寫過(作者對著新內容寫的);原地改寫同一行不算(仍是同一列)。
//       base = 與 story-layer-drift 同一支 resolveBase(PR = origin/<GITHUB_BASE_REF> 的 merge-base、CI push = HEAD^、本機 origin/main)。
//   (c) `檔名#宣告` 引用:那個檔裡要有這個具名宣告(任何深度,含 interface 成員與 import 進來的名字;CSS = 宣告的自訂屬性 / class)—— 否則改成宣告名
//       只是把無聲過期從行號搬到名字。
// 範圍:DS 原始碼與文件(src、ds-canonical,不含產生的 fork / 執行期 .claude)與 scripts/ 的閘。governance/planning 是當天的紀錄,不掃。
export const CITE_ROOTS = ['packages/design-system/src', 'packages/design-system/ds-canonical', 'scripts']
const CITE_RESOLVE_ROOTS = [...CITE_ROOTS, '.github/workflows']
const CITE_SKIP_DIRS = new Set(['node_modules', 'dist', 'storybook-static', 'coverage', 'generated', '.claude', 'fork'])
const CITE_EXT = /\.(?:md|css|tsx|ts|mjs|js|cjs|sh)$/
const GENERIC_BASENAMES = new Set(['index.ts', 'index.tsx', 'index.js', 'index.mjs', 'README.md', 'package.json', 'CHANGELOG.md', 'AGENTS.md', 'CLAUDE.md', 'SKILL.md'])
export const LINE_CITE_RE = /((?:[\w.@-]+\/)*[\w.@-]+\.(?:md|tsx|ts|css|mjs|js|cjs|json|ya?ml|sh))`?[ \t]*:[ \t]*L?(\d+)(?:[ \t]*[-–][ \t]*L?(\d+))?(?![\d%A-Za-z])/g
export const ANCHOR_CITE_RE = /((?:[\w.@-]+\/)*[\w.@-]+\.(?:tsx|ts|css|mjs|js))`?#((?:--)?[A-Za-z_$][\w$-]*)/g
export const CITE_FIXTURE_MARK = '@cite-fixture'
/**
 * 釘在某個 commit 的歷史引用不追:`<sha>:<路徑>:N`(git 原生寫法,`git show` 驗得到)或「<sha> 檔名:N」。
 * 歷史紀錄寫的是「當時」的那一行,拿現在的檔去比只會誤紅;要寫現況就用宣告名 / 段名。
 */
const HISTORICAL_PIN = /\b[0-9a-f]{7,40}`?(?::|[ \t]+`?)$/
/** 合成夾具:同一行、或往上 3 行內有 @cite-fixture(夾具常是多行字串,標記只能放在字串外) */
function isFixtureLine(text, index) {
  const lineStart = text.lastIndexOf('\n', index) + 1
  const lineEnd = text.indexOf('\n', index)
  let from = lineStart
  for (let k = 0; k < 3 && from > 0; k += 1) from = text.lastIndexOf('\n', from - 2) + 1
  return text.slice(from, lineEnd < 0 ? undefined : lineEnd).includes(CITE_FIXTURE_MARK)
}

function walkCiteRoot(root, dir, acc) {
  const abs = join(root, dir)
  if (!existsSync(abs)) return acc
  for (const name of readdirSync(abs)) {
    if (CITE_SKIP_DIRS.has(name)) continue
    const relPath = dir ? `${dir}/${name}` : name
    const st = statSync(join(abs, name))
    if (st.isDirectory()) walkCiteRoot(root, relPath, acc)
    else if (st.isFile()) acc.push(relPath)
  }
  return acc
}

/** 引用路徑 → repo 相對路徑:相對引用檔 → 相對 DS src → 相對 packages/design-system → 相對 repo 根 → 範圍內唯一同名檔(通用檔名不猜) */
export function resolveCitePath(fromRel, p, exists, byBase) {
  for (const c of [posix.join(posix.dirname(fromRel), p), posix.join(DS, p), posix.join('packages/design-system', p), posix.normalize(p)]) {
    const n = posix.normalize(c)
    if (n.startsWith('..') || n.split('/').some((seg) => CITE_SKIP_DIRS.has(seg) && seg !== '.claude')) continue
    if (exists(n)) return n
  }
  const base = posix.basename(p)
  if (GENERIC_BASENAMES.has(base)) return null
  const hits = (byBase.get(base) ?? []).filter((f) => f === p || f.endsWith(`/${p}`))
  return hits.length === 1 ? hits[0] : null
}

/** 一個檔裡的「檔名:行號」引用(純函式)。URL 裡的、日期(`x.ts:2026-09`)、標了 @cite-fixture 的那一行(合成夾具)不算。 */
/** 只在「看起來有引用」的行上跑完整的 regex(路徑那段有巢狀量詞,整檔逐位置試在幾千行的檔上很慢);m.index 換回全文位置 */
function* matchesByLine(text, cheap, re) {
  let start = 0
  for (const line of text.split('\n')) {
    if (cheap.test(line)) for (const m of line.matchAll(re)) { m.index += start; yield m }
    start += line.length + 1
  }
}
const CHEAP_LINE_CITE = /\.(?:md|tsx|ts|css|mjs|js|cjs|json|ya?ml|sh)`?[ \t]*:[ \t]*L?\d/
const CHEAP_ANCHOR_CITE = /\.(?:tsx|ts|css|mjs|js)`?#/

export function extractLineCites(fromRel, text, resolveTarget) {
  const out = []
  for (const m of matchesByLine(text, CHEAP_LINE_CITE, LINE_CITE_RE)) {
    const before = text.slice(Math.max(0, m.index - 300), m.index)
    if (/https?:\/\/\S*$/.test(before) || /[/~]$/.test(before) || HISTORICAL_PIN.test(before)) continue
    const n = Number(m[2])
    const end = m[3] === undefined ? null : Number(m[3])
    if (n < 1 || (/^(?:19|20)\d\d$/.test(m[2]) && m[3] !== undefined && m[3].length === 2)) continue
    if (isFixtureLine(text, m.index)) continue
    const target = resolveTarget(fromRel, m[1])
    if (!target) continue
    out.push({ from: fromRel, line: lineOf(text, m.index), index: m.index, raw: m[0], target, n, end: end !== null && end > n ? end : null })
  }
  return out
}

/** (a) 指到空行 / 超出檔尾(純函式)。linesOf(target) → 不含結尾換行的行陣列 */
export function findBrokenLineCites(cites, linesOf) {
  const problems = []
  for (const c of cites) {
    const L = linesOf(c.target)
    if (!L) continue
    const last = c.end ?? c.n
    if (last > L.length) problems.push({ where: `${c.from}:${c.line}`, msg: `「${c.raw}」超出 ${c.target} 檔尾(只有 ${L.length} 行)` })
    else if (!L[c.n - 1].trim()) problems.push({ where: `${c.from}:${c.line}`, msg: `「${c.raw}」指到 ${c.target} 的空行` })
  }
  return problems
}

/** `git diff -U0` 原文 → Map<檔, { hunks:[{a,b,c,d}], added:Set<新行號> }>(純函式) */
export function parseUnifiedDiff(text) {
  const files = new Map()
  let cur = null
  for (const line of text.split('\n')) {
    const head = line.match(/^\+\+\+ (?:b\/(.+)|\/dev\/null)$/)
    if (head) { cur = head[1] ? { hunks: [], added: new Set() } : null; if (cur) files.set(head[1], cur); continue }
    const h = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (h && cur) {
      const hunk = { a: Number(h[1]), b: h[2] === undefined ? 1 : Number(h[2]), c: Number(h[3]), d: h[4] === undefined ? 1 : Number(h[4]) }
      cur.hunks.push(hunk)
      for (let i = 0; i < hunk.d; i += 1) cur.added.add(hunk.c + i)
    }
  }
  return files
}

/** base 的第 n 行在新檔的位置(純函式):kept(原封不動,to = 新行號)/ in-place(同一列原地改寫)/ rewritten(被刪或改寫且位置變了) */
export function mapBaseLine(hunks, n) {
  let delta = 0
  for (const h of hunks) {
    if (h.b > 0 && n >= h.a && n < h.a + h.b) {
      const k = n - h.a
      if (k < h.d && h.c + k === n) return { kind: 'in-place' }
      return { kind: 'rewritten', to: h.d > 0 ? h.c + Math.min(k, h.d - 1) : h.c }
    }
    if (h.b === 0 ? h.a < n : h.a + h.b <= n) delta += h.d - h.b
    else break
  }
  return { kind: 'kept', to: n + delta }
}

/**
 * (b) 引用寫下之後,被引用的檔改過、引用卻沒跟著改(純函式)。
 * refOf(cite) → { hunks, label } | null:這個引用該拿哪一版當基準 ——
 *   引用那一行在 base 之前就有 → base 那一版;這次變更(PR 的某個 commit)才寫的 → 寫下它的那個 commit(git blame);
 *   還沒提交的 → null(作者對著工作樹寫的,不比)。hunks = 基準版 → 工作樹的 `git diff -U0`;沒改過 → hunks 空陣列。
 * 2026-10-21 第三輪:只拿 base 比、遇到「這次變更寫的引用」一律放行,會漏掉同一個 PR 前面的 commit 寫、後面的 commit
 * 推走的引用(審查列的 18 處有 10 處是這種:steps.spec.md 的引用 09-24 才寫,本批加 import 才推走)。
 */
export function findMovedLineCites(cites, refOf) {
  const problems = []
  for (const c of cites) {
    const ref = refOf(c)
    if (!ref || ref.hunks.length === 0) continue
    const ends = [c.n, ...(c.end ? [c.end] : [])].map((n) => ({ n, r: mapBaseLine(ref.hunks, n) }))
    const bad = ends.find((e) => !(e.r.kind === 'in-place' || (e.r.kind === 'kept' && e.r.to === e.n)))
    if (!bad) continue
    const fix = ends.every((e) => e.r.kind === 'kept') ? ends.map((e) => e.r.to) : null
    problems.push({
      where: `${c.from}:${c.line}`,
      msg: bad.r.kind === 'kept'
        ? `「${c.raw}」:${ref.label} 時 ${c.target}:${bad.n} 那一行原封不動,現在在第 ${bad.r.to} 行 —— 引用沒跟著改(改成宣告名 / 段名,或 --fix-moved-cites 改成新行號)`
        : `「${c.raw}」:${ref.label} 時 ${c.target}:${bad.n} 那一行被刪或改寫、而且位置變了 —— 引用要重新確認指的是什麼`,
      cite: c, fix,
    })
  }
  return problems
}

/** `git blame --porcelain` 原文 → Map<工作樹行號, commit sha>(純函式);全 0 = 還沒提交 */
export function parseBlamePorcelain(text) {
  const out = new Map()
  for (const line of text.split('\n')) {
    const m = line.match(/^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/)
    if (m) out.set(Number(m[2]), m[1])
  }
  return out
}

/** 一個 TS / JS 檔裡具名的宣告(任何深度)+ import 進來的名字;CSS 檔:宣告的自訂屬性與 class 名 */
export function declaredNames(file, text) {
  const names = new Set()
  if (file.endsWith('.css')) {
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, ' ')
    for (const m of clean.matchAll(/(--[\w-]+)\s*:/g)) names.add(m[1])
    for (const m of clean.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) names.add(m[1])
    for (const m of clean.matchAll(/@keyframes\s+([\w-]+)/g)) names.add(m[1])
    return names
  }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  // 任何深度的具名宣告(頂層宣告、函式內的 const / function、interface / type 的成員)+ import 進來的名字 ——
  // 大函式(例:DataTableInner 幾千行)只錨頂層名太粗,錨裡面的 `onCenterBodyScroll` 才指得準;名字在不在仍可機械驗。
  const visit = (n) => {
    if ((ts.isVariableDeclaration(n) || ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)
      || ts.isEnumDeclaration(n) || ts.isPropertySignature(n) || ts.isMethodSignature(n) || ts.isMethodDeclaration(n) || ts.isPropertyDeclaration(n)
      || ts.isImportSpecifier(n) || ts.isImportClause(n) || ts.isExportSpecifier(n)) && n.name && ts.isIdentifier(n.name)) names.add(n.name.text)
    if (ts.isVariableDeclaration(n) && n.name && ts.isObjectBindingPattern(n.name)) for (const e of n.name.elements) if (ts.isIdentifier(e.name)) names.add(e.name.text)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return names
}

/** (c) `檔名#宣告` 引用的宣告不存在(純函式)。`#L42` 是行號、`#${…}` 是樣板、TS 目標的名字含 `-` 不是識別字 → 都不算這一類 */
export function findBrokenAnchors(fromRel, text, resolveTarget, namesOf) {
  const problems = []
  for (const m of matchesByLine(text, CHEAP_ANCHOR_CITE, ANCHOR_CITE_RE)) {
    const name = m[2]
    const after = text[m.index + m[0].length] ?? ''
    if (/^L\d+$/.test(name) || after === '{' || after === '-') continue
    const isCss = m[1].endsWith('.css')
    if (!isCss && !/^[A-Za-z_$][\w$]*$/.test(name)) continue
    const before = text.slice(Math.max(0, m.index - 300), m.index)
    if (/https?:\/\/\S*$/.test(before) || /[/~]$/.test(before) || HISTORICAL_PIN.test(before)) continue
    if (isFixtureLine(text, m.index)) continue
    const target = resolveTarget(fromRel, m[1])
    if (!target) continue
    const names = namesOf(target)
    if (names && !names.has(name)) problems.push({ where: `${fromRel}:${lineOf(text, m.index)}`, msg: `「${m[0]}」:${target} 裡沒有這個宣告(改名或刪了?)` })
  }
  return problems
}

/** --fix-moved-cites:只改「原封不動、只是位置變了」那一類(新行號由 diff 算出、內容逐字相同);被刪 / 改寫的不自動改 */
export function applyMovedCiteFixes(text, problems) {
  let out = text
  for (const p of [...problems].filter((x) => x.fix).sort((x, y) => y.cite.index - x.cite.index)) {
    const { raw, index, n, end } = p.cite
    if (out.slice(index, index + raw.length) !== raw) continue
    let next = raw.replace(new RegExp(`(:[ \\t]*L?)${n}(?!\\d)`), `$1${p.fix[0]}`)
    if (end) next = next.replace(new RegExp(`([-–][ \\t]*L?)${end}$`), `$1${p.fix[1]}`)
    out = out.slice(0, index) + next + out.slice(index + raw.length)
  }
  return out
}

/** C6 全樹:讀檔、解析引用、(a)(c) 對工作樹判,(b) 對 base 判 */
export function scanCites(root, { argv = [], env = process.env, fix = false } = {}) {
  const files = CITE_ROOTS.flatMap((r) => walkCiteRoot(root, r, []))
  const scope = files.filter((f) => CITE_EXT.test(f))
  if (scope.length < 500) throw new InstrumentError(`C6 只掃到 ${scope.length} 個檔(DS + scripts 至少上千個)`)
  const byBase = new Map()
  for (const f of CITE_RESOLVE_ROOTS.flatMap((r) => (CITE_ROOTS.includes(r) ? files.filter((x) => x.startsWith(`${r}/`)) : walkCiteRoot(root, r, [])))) {
    const b = posix.basename(f)
    byBase.set(b, [...(byBase.get(b) ?? []), f])
  }
  const existsCache = new Map()
  const exists = (p) => { if (!existsCache.has(p)) { const abs = join(root, p); existsCache.set(p, existsSync(abs) && statSync(abs).isFile()) } return existsCache.get(p) }
  const resolveCite = (from, p) => resolveCitePath(from, p, exists, byBase)
  const textCache = new Map()
  const textOf = (p) => { if (!textCache.has(p)) textCache.set(p, exists(p) ? readFileSync(join(root, p), 'utf8') : null); return textCache.get(p) }
  const linesOf = (p) => { const t = textOf(p); if (t === null) return null; const L = t.split('\n'); if (t.endsWith('\n')) L.pop(); return L }
  const namesCache = new Map()
  const namesOf = (p) => { if (!namesCache.has(p)) { const t = textOf(p); namesCache.set(p, t === null ? null : declaredNames(p, t)) } return namesCache.get(p) }
  const cites = scope.flatMap((f) => extractLineCites(f, textOf(f), resolveCite))
  if (cites.length < 200) throw new InstrumentError(`C6 只讀到 ${cites.length} 個「檔名:行號」引用(DS 有上千個)—— 解析壞了`)
  const broken = findBrokenLineCites(cites, linesOf)
  const anchors = scope.flatMap((f) => findBrokenAnchors(f, textOf(f), resolveCite, namesOf))
  let moved = []
  let baseNote = '(本機沒有可比對的 base,(b) 略過;CI 一定會比)'
  let base = null
  try { base = resolveBase(root, argv, env) } catch (e) { throw new InstrumentError(`C6(b) ${e.message}`) }
  if (base) {
    const r = spawnSync('git', ['diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', base.mergeBase], { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
    if (r.error || r.status !== 0) throw new InstrumentError(`C6(b) git diff ${base.mergeBase.slice(0, 8)} 失敗:${String(r.stderr ?? r.error?.message).trim().slice(0, 160)}`)
    const diff = parseUnifiedDiff(r.stdout)
    const baseLabel = `${base.ref}(${base.mergeBase.slice(0, 8)})`
    const git = (args) => {
      const out = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
      if (out.error || out.status !== 0) throw new InstrumentError(`C6(b) git ${args.slice(0, 3).join(' ')} 失敗:${String(out.stderr ?? out.error?.message).trim().slice(0, 160)}`)
      return out.stdout
    }
    // 只 blame 需要的行(被引用的檔在 base 之後改過、而引用那一行是這次變更寫的),一個檔一次 `-L` 全帶;
    // 歷史只走 base.. 這一段(那幾行本來就是 base 之後才寫的,不必翻整部歷史);`--contents` 讓工作樹裡還沒提交的行算 0000(不比),
    // 沒有它的話 `<base>..` 會拿 HEAD 那一版的同一行號去 blame,剛改過的行被當成別人寫的(2026-10-21 自己踩到)
    const needBlame = new Map()
    for (const c of cites) if (diff.has(c.target) && diff.get(c.from)?.added.has(c.line)) needBlame.set(c.from, [...(needBlame.get(c.from) ?? []), c.line])
    const blameCache = new Map()
    const blameOf = (file) => {
      if (!blameCache.has(file)) {
        const lines = [...new Set(needBlame.get(file) ?? [])]
        blameCache.set(file, lines.length ? parseBlamePorcelain(git(['blame', '--porcelain', ...lines.flatMap((n) => ['-L', `${n},${n}`]), '--contents', file, `${base.mergeBase}..`, '--', file])) : new Map())
      }
      return blameCache.get(file)
    }
    // 同一個 commit 要比的檔一次 diff 完(一個 commit 一次 git diff,不是一個引用一次)
    const targetsBySha = new Map()
    for (const c of cites) {
      if (!diff.has(c.target) || !diff.get(c.from)?.added.has(c.line)) continue
      const sha = blameOf(c.from).get(c.line)
      if (sha && !/^0+$/.test(sha)) targetsBySha.set(sha, new Set([...(targetsBySha.get(sha) ?? []), c.target]))
    }
    const refDiffs = new Map()
    for (const [sha, targets] of targetsBySha) refDiffs.set(sha, parseUnifiedDiff(git(['diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', sha, '--', ...targets])))
    const hunksSince = (sha, target) => refDiffs.get(sha)?.get(target)?.hunks ?? []
    let blamed = 0
    const refOf = (c) => {
      if (!diff.has(c.target)) return null
      if (!diff.get(c.from)?.added.has(c.line)) return { hunks: diff.get(c.target).hunks, label: baseLabel }
      const sha = blameOf(c.from).get(c.line)
      if (!sha || /^0+$/.test(sha)) return null
      blamed += 1
      return { hunks: hunksSince(sha, c.target), label: `寫下這個引用的 ${sha.slice(0, 8)}` }
    }
    moved = findMovedLineCites(cites, refOf)
    baseNote = `(b) 對 ${baseLabel}:${diff.size} 個檔改過;這次變更才寫的引用 ${blamed} 個改拿寫下它的 commit 比`
  }
  if (fix) {
    const byFile = new Map()
    for (const p of moved) if (p.fix) byFile.set(p.cite.from, [...(byFile.get(p.cite.from) ?? []), p])
    for (const [f, ps] of byFile) writeFileSync(join(root, f), applyMovedCiteFixes(textOf(f), ps))
    // 改完重量一次:位移改好之後,原本「指到空行」的同一筆通常也一起好了 —— 回報的是改完之後真的還剩的
    const after = scanCites(root, { argv, env, fix: false })
    return { problems: after.problems, fixed: [...byFile.values()].reduce((n, v) => n + v.length, 0), cites: after.cites, baseNote }
  }
  return { problems: [...broken, ...anchors, ...moved], fixed: 0, cites: cites.length, baseNote }
}

// ─── 全樹 ────────────────────────────────────────────────────────────────────
const isStory = (f) => f.endsWith('.stories.tsx')
const isProbeOrHelper = (f) => /(^|\/)_[^/]+\.tsx?$/.test(f) || f.startsWith('stories-helpers/')

export function scanTree(root = SELF_ROOT, { argv = [], env = process.env } = {}) {
  const dsAbs = join(root, DS)
  if (!existsSync(dsAbs)) throw new InstrumentError(`${DS} 不存在於 ${root}`)
  const all = walk(dsAbs).map((p) => rel(dsAbs, p))
  if (all.length < 100) throw new InstrumentError(`${DS} 只掃到 ${all.length} 個檔(儀器讀不到東西)`)
  const read = (f) => { const p = join(dsAbs, f); return existsSync(p) ? readFileSync(p, 'utf8') : null }
  const results = {}
  // C1:story 以外的 DS 原始碼(anatomy 的 Th 等 stories-helpers 照登記簿列,也算消費者;probe 不算)
  const c1Sources = all.filter((f) => /\.(tsx|ts|css)$/.test(f) && !isStory(f) && !/(^|\/)_[^/]+\.tsx?$/.test(f) && !f.endsWith('.d.ts'))
  results.C1 = checkSubtleRegistry(read('tokens/color/color.spec.md') ?? '', read, c1Sources)
  // C2
  const libEntries = readdirSync(join(dsAbs, 'lib')).filter((n) => n !== 'README.md').map((n) => (statSync(join(dsAbs, 'lib', n)).isDirectory() ? `${n}/` : n)).filter((n) => n.endsWith('/') || /\.tsx?$/.test(n))
  results.C2 = checkLibResidents(read('lib/README.md') ?? '', read('index.ts') ?? '', libEntries)
  // C2 續:最近一次發布(release tag)時公開的 lib 模組,現在不公開 → README 那一列要寫明「公開 API 移除」
  const tagOut = spawnSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD'], { cwd: root, encoding: 'utf8' })
  const tag = tagOut.status === 0 ? tagOut.stdout.trim() : null
  let releaseNote = '(找不到 release tag,略過「已發布模組被收回」;CI 一定會比)'
  if (tag) {
    const pub = spawnSync('git', ['show', `${tag}:${DS}/index.ts`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    if (pub.status !== 0) throw new InstrumentError(`C2 讀不到 ${tag} 的 root barrel(${String(pub.stderr).trim().slice(0, 120)})`)
    results.C2.push(...findPublishedLibRemovals(read('lib/README.md') ?? '', pub.stdout, read('index.ts') ?? '', libEntries, tag))
    releaseNote = `C2 已發布模組對 ${tag} 比過`
  } else if (env.CI) throw new InstrumentError('C2 CI 找不到任何 release tag(v*)—— 沒比到「已發布模組被收回」不是通過')
  // C3:DS 的規格、story、原始碼註解 + ds-canonical 的文件
  const canonAbs = join(root, 'packages/design-system/ds-canonical')
  const c3Files = [
    ...all.filter((f) => /\.(md|tsx|ts)$/.test(f)).map((f) => [`${DS}/${f}`, read(f)]),
    ...(existsSync(canonAbs) ? walk(canonAbs).filter((p) => p.endsWith('.md')).map((p) => [rel(root, p), readFileSync(p, 'utf8')]) : []),
  ]
  results.C3 = c3Files.flatMap(([f, t]) => findLoadingClaims(f, t ?? ''))
  // C4
  const c4Files = all.filter((f) => /^(components|patterns|tokens|lib|hooks)\//.test(f) && /\.(tsx|ts|css)$/.test(f) && !isStory(f) && !isProbeOrHelper(f))
  if (c4Files.length < 50) throw new InstrumentError(`C4 只掃到 ${c4Files.length} 個元件原始碼檔`)
  results.C4 = [...c4Files.flatMap((f) => findOffScaleWeights(`${DS}/${f}`, read(f))), ...findSpecWeightAdvice(read('tokens/typography/typography.spec.md') ?? '')]
  // C5
  const stepsStories = all.filter((f) => isStory(f) && /<Steps\b/.test(read(f)))
  if (stepsStories.length === 0) throw new InstrumentError('沒有任何 story 用到 <Steps>(C5 讀不到東西)')
  results.C5 = stepsStories.flatMap((f) => findUnnamedSteps(`${DS}/${f}`, read(f)))
  // C6
  const c6 = scanCites(root, { argv, env })
  results.C6 = c6.problems
  Object.defineProperty(results, 'notes', { value: { C2: releaseNote, C6: `讀到 ${c6.cites} 個「檔名:行號」引用;${c6.baseNote}` }, enumerable: false })
  return results
}

// ─── selftest:每條至少一組兩面對照 ───────────────────────────────────────────
export function runSelftest() {
  const ok = []
  const fails = []
  const expect = (cond, msg) => (cond ? ok.push(msg) : fails.push(msg))
  // C1
  const spec = (muted, secondary) => `x\n| Token | 答 |\n| \`bg-muted\`(neutral-2) | **是** | 語意 | ${muted} |\n| \`bg-secondary\`(neutral-3) | **否** | 語意 | ${secondary} |\n`
  const files = {
    'components/A/a.tsx': "export function A() { return <div className=\"bg-muted p-2\" /> }\nexport const aMeta = { tokens: { bg: ['bg-muted'] } }\n",
    'components/B/b.tsx': "export const bVariants = cva('', { variants: { c: { n: 'bg-secondary' } } })\nexport const tag = () => cn(bVariants({ c: 'n' }), 'x')\n",
    'components/C/c.tsx': "// bg-muted 只出現在註解\nexport const C = 'bg-secondary-hover'\n",
    'tokens/t.css': '/* bg-muted */\n:root {\n  --scrollbar-track: var(--muted);\n  --color-muted: var(--muted);\n}\n',
  }
  const read = (f) => files[f] ?? null
  const srcs = Object.keys(files)
  const good = spec('A(`components/A/a.tsx#A`)/ 捲軸(`tokens/t.css#--scrollbar-track`)', 'B(`components/B/b.tsx#bVariants`)/ 借用(`components/B/b.tsx#tag`)')
  expect(checkSubtleRegistry(good, read, srcs).length === 0, 'C1:登記齊、宣告真的用 token、借用同格宣告、meta 與註解與 --color-* 別名與 -hover 不算 → 0 筆')
  const byLine = spec('A(`a.tsx:1`)/ A(`components/A/a.tsx#A`)/ 捲軸(`tokens/t.css#--scrollbar-track`)', 'B(`components/B/b.tsx#bVariants`)/ 借用(`components/B/b.tsx#tag`)')
  expect(checkSubtleRegistry(byLine, read, srcs).some((p) => p.msg.includes('用行號登記')), 'C1:用行號登記 → 紅')
  const missing = spec('捲軸(`tokens/t.css#--scrollbar-track`)', 'B(`components/B/b.tsx#bVariants`)/ 借用(`components/B/b.tsx#tag`)')
  expect(checkSubtleRegistry(missing, read, srcs).some((p) => p.where.endsWith('components/A/a.tsx:1') && p.msg.includes('沒登記')), 'C1:用了 token 卻沒登記 → 紅且指名 a.tsx:1')
  const stale = spec('A(`components/A/a.tsx#A`)/ 捲軸(`tokens/t.css#--scrollbar-track`)/ 舊(`components/C/c.tsx#C`)', 'B(`components/B/b.tsx#bVariants`)/ 借用(`components/B/b.tsx#tag`)')
  expect(checkSubtleRegistry(stale, read, srcs).some((p) => p.msg.includes('c.tsx#C') && p.msg.includes('登記過期')), 'C1:登記的宣告沒用 token(bg-secondary-hover 不算 bg-secondary)→ 登記過期')
  const gone = spec('A(`components/A/a.tsx#A`)/ 捲軸(`tokens/t.css#--scrollbar-track`)/ 沒了(`components/A/a.tsx#Gone`)', 'B(`components/B/b.tsx#bVariants`)/ 借用(`components/B/b.tsx#tag`)')
  expect(checkSubtleRegistry(gone, read, srcs).some((p) => p.msg.includes('找不到這個頂層宣告')), 'C1:登記的宣告不存在 → 紅')
  let threw = false
  try { checkSubtleRegistry('沒有表', read, srcs) } catch (e) { threw = e instanceof InstrumentError }
  expect(threw, 'C1:讀不到登記簿那一列 → 儀器失效,不是 0 筆')
  // C2
  const readme = '## 當前居民\n\n| Module | 提供什麼 |\n|---|---|\n| `a.ts`(公開)| x |\n| `b.ts`(`@internal`)| y |\n| `i18n/`(未出口:……)| z |\n\n---\n不收 `utils.ts`\n'
  const index = "//   - lib/b.ts(檔頭標模組層 @internal;lib 沒有 subpath)\nexport * from './lib/a'\nexport * from './lib/utils'\n"
  expect(checkLibResidents(readme, index, ['a.ts', 'b.ts', 'i18n/', 'utils.ts']).length === 0, 'C2:每個模組一列、狀態與 barrel 一致 → 0 筆')
  expect(checkLibResidents(readme, index, ['a.ts', 'b.ts', 'i18n/', 'utils.ts', 'c.ts']).some((p) => p.msg.includes('lib/c.ts 沒有列')), 'C2:lib 多一個模組沒列 → 紅')
  expect(checkLibResidents(readme, "export * from './lib/a'\nexport * from './lib/b'\n", ['a.ts', 'b.ts', 'i18n/', 'utils.ts']).some((p) => p.msg.includes('lib/b.ts README 寫 internal,root barrel 實際是 public')), 'C2:README 寫 @internal、barrel 卻出口 → 紅')
  expect(checkLibResidents(readme.replace('(公開)', '(看起來公開)'), index, ['a.ts', 'b.ts', 'i18n/', 'utils.ts']).some((p) => p.msg.includes('沒寫「公開')), 'C2:沒寫狀態 → 紅')
  const pubIndex = "export * from './lib/a'\nexport * from './lib/b'\n"
  expect(findPublishedLibRemovals(readme, pubIndex, index, ['a.ts', 'b.ts', 'i18n/', 'utils.ts'], 'v9').some((p) => p.msg.includes('lib/b 在 v9 是公開出口,現在是 internal')), 'C2:發布時公開、現在 @internal、那一列沒寫明 → 紅')
  expect(findPublishedLibRemovals(readme.replace('(`@internal`)', '(`@internal`;公開 API 移除:v9 出口 2 個符號,consumer 0 處)'), pubIndex, index, ['a.ts', 'b.ts', 'i18n/', 'utils.ts'], 'v9').length === 0, 'C2:那一列寫明「公開 API 移除」→ 0 筆')
  expect(findPublishedLibRemovals(readme, pubIndex, index, ['a.ts', 'i18n/', 'utils.ts'], 'v9').some((p) => p.msg.includes('現在是 deleted')), 'C2:發布時公開、現在模組整個刪掉 → 紅')
  // C3
  expect(findLoadingClaims('x.tsx', "    loading: {\n      control: 'boolean',\n      description: '載入中狀態：左側顯示 spinner，自動設為 `disabled`，同時設定 `aria-busy`。',\n").length === 1, 'C3:argTypes 的 loading 說「自動設為 `disabled`」→ 紅(NEW-03 原句,key 與說明分行)')
  expect(findLoadingClaims('x.md', '對應 action Button 傳 `loading`(既有 API,spinner + 自動 disabled)').length === 1, 'C3:「spinner + 自動 disabled」→ 紅(bulk-action-bar 原句)')
  expect(findLoadingClaims('x.md', '忙碌(`loading`)一律 → 不轉成原生 `disabled`,改 `aria-disabled`').length === 0, 'C3:正確句(不轉原生 disabled)→ 0 筆')
  expect(findLoadingClaims('x.md', 'Slider 被 <Field mode="disabled"> 包裹時自動 disabled').length === 0, 'C3:沒講 loading 的「自動 disabled」(Slider / TimePicker)→ 0 筆')
  expect(findLoadingClaims('x.tsx', '{"停用狀態  :disabled 時回到停用色,原生 disabled 屬性讓輔助技術讀出「已停用」;loading 中額外帶 aria-busy 告知處理中。\\n\\n  驗證  :a11y 面板 0 項違規。"}').length === 1, 'C3:同一句 loading + 原生 disabled、沒說不是原生 → 紅(第三輪審查 button.anatomy 原句)')
  expect(findLoadingClaims('x.tsx', '{"停用狀態  :原生 disabled 屬性讓輔助技術讀出「已停用」;loading 不是原生停用:可聚焦的停用 + aria-busy。"}').length === 0, 'C3:同一句講明 loading 不是原生停用 → 0 筆')
  expect(findLoadingClaims('x.md', '原生 disabled 屬性讓輔助技術讀出「已停用」。\nloading 期間顯示轉圈。').length === 0, 'C3:loading 與原生 disabled 在不同句 → 0 筆(只判同一句)')
  // C4
  expect(findOffScaleWeights('components/X/x.tsx', 'export const X = () => <h3 className="text-h6 font-semibold">標題</h3>\n').length === 1, 'C4:元件原始碼 font-semibold → 紅')
  expect(findOffScaleWeights('components/X/x.tsx', 'export const X = () => <h3 className="text-h6 font-medium">標題</h3>\n// font-semibold 只在註解\n').length === 0, 'C4:font-medium + 註解提到 font-semibold → 0 筆')
  expect(findSpecWeightAdvice('`font-medium`\n| 16px | `text-h5`(加 `font-medium`/`font-semibold`) |\n').length === 1, 'C4:typography.spec 產品指引寫 font-semibold → 紅(OTH-06 :87 原句)')
  expect(findSpecWeightAdvice('`font-medium`\n`font-semibold`(600)只用在文件外框的標題\n').length === 0, 'C4:「文件外框」那一句 → 0 筆')
  // C5
  expect(findUnnamedSteps('s.stories.tsx', 'export const A = () => <Steps value="a"><StepItem value="a" /></Steps>\n').length === 1, 'C5:<Steps> 沒名字 → 紅')
  expect(findUnnamedSteps('s.stories.tsx', 'export const A = () => <><Steps aria-label="結帳進度" value="a" /><Steps aria-labelledby="t" /></>\n').length === 0, 'C5:aria-label / aria-labelledby → 0 筆')
  // C6(檔名一律用 x / y 這種範圍內不存在的名字,免得被 C6 自己當成真引用掃到)
  const tree = { 'packages/design-system/src/components/X/x.tsx': 'import { Y } from "./y"\nexport const A = 1\n\nfunction outer() { const inner = 2; return inner }\ninterface P { size?: number }\n', 'packages/design-system/src/components/X/x.spec.md': '# x\n\nrow\n', 'packages/design-system/src/tokens/t.css': ':root {\n  --tok-a: 1px;\n}\n' }
  const exists = (q) => q in tree
  const byBase = new Map([['x.tsx', ['packages/design-system/src/components/X/x.tsx']], ['x.spec.md', ['packages/design-system/src/components/X/x.spec.md']], ['index.ts', ['a/index.ts']]])
  const resolveX = (from, q) => resolveCitePath(from, q, exists, byBase)
  const from = 'packages/design-system/src/components/Z/z.tsx'
  const lines = (t) => extractLineCites(from, t, resolveX).map((c) => `${c.target.split('/').pop()}:${c.n}${c.end ? `-${c.end}` : ''}`)
  expect(lines('見 `../X/x.tsx:2` 與 components/X/x.spec.md:3-4 與 x.tsx:5').join() === 'x.tsx:2,x.spec.md:3-4,x.tsx:5', 'C6:相對路徑 / 相對 DS src / 範圍內唯一同名檔 都解析得到,範圍照讀')
  expect(lines('index.ts:3 / https://github.com/o/r/blob/main/x.tsx:9 / x.tsx:200ms / x.tsx:2026-09 / x.tsx:0').length === 0, 'C6:通用檔名不猜、URL、時長(:200ms)、日期(:2026-09)、行號 0 都不算引用')
  expect(lines('`9935caf9:packages/design-system/src/components/X/x.tsx:2` 與 1ef86547 x.tsx:2').length === 0, 'C6:釘在 commit 的歷史引用(`<sha>:路徑:N`、`<sha> 檔名:N`)不追')
  expect(lines('// @cite-fixture\nconst a = 1\nconst f = "x.tsx:9"').length === 0 && lines('const f = "x.tsx:9" // @cite-fixture').length === 0 && lines('// @cite-fixture\n\n\n\nconst f = "x.tsx:9"').length === 1, 'C6:@cite-fixture 管同一行與往上 3 行,再遠就不管')
  const linesOf = (q) => { const t = tree[q]; const L = t.split('\n'); if (t.endsWith('\n')) L.pop(); return L }
  const brokenOf = (t) => findBrokenLineCites(extractLineCites(from, t, resolveX), linesOf).map((p) => p.msg)
  expect(brokenOf('x.tsx:3').some((m) => m.includes('空行')) && brokenOf('x.tsx:9').some((m) => m.includes('檔尾')) && brokenOf('x.tsx:4-9').some((m) => m.includes('檔尾')) && brokenOf('x.tsx:2 / x.tsx:4-5').length === 0, 'C6(a):指到空行 / 超出檔尾(含範圍尾)紅,指得到的不紅')
  const diff = parseUnifiedDiff('diff --git a/t b/t\n--- a/t\n+++ b/t\n@@ -2,0 +3 @@\n+import x\n@@ -10,2 +11,2 @@\n-a\n-b\n+A\n+B\n@@ -20 +20,0 @@\n-gone\n')
  const hunks = diff.get('t').hunks
  expect(mapBaseLine(hunks, 1).kind === 'kept' && mapBaseLine(hunks, 1).to === 1 && mapBaseLine(hunks, 5).to === 6 && mapBaseLine(hunks, 10).kind === 'rewritten' && mapBaseLine(hunks, 20).kind === 'rewritten' && mapBaseLine(hunks, 30).to === 30, 'C6(b):插入之前的行不動、之後的行 +1、被改寫且位移的行 = rewritten、刪除的行 = rewritten、前後增減抵銷的行回到原號')
  const inPlace = parseUnifiedDiff('+++ b/t\n@@ -7 +7 @@\n-old\n+new\n').get('t').hunks
  expect(mapBaseLine(inPlace, 7).kind === 'in-place', 'C6(b):同一列原地改寫 = in-place(仍是同一列,不紅)')
  const cite = (n, end = null, line = 1) => ({ from: 'f.md', line, index: 0, raw: end ? `t.tsx:${n}-${end}` : `t.tsx:${n}`, target: 't', n, end })
  const moved = findMovedLineCites([cite(5), cite(1), cite(5, null, 2), cite(10), cite(5, 6, 3)], (c) => (c.line === 2 ? null : { hunks, label: 'base' }))
  expect(moved.length === 3 && moved[0].fix?.[0] === 6 && moved[1].cite.n === 10 && moved[1].fix === null && moved[2].fix?.join() === '6,7', 'C6(b):位移紅且算出新行號、沒動的不紅、還沒提交的引用不比、被改寫的紅但不自動修、範圍兩端一起修')
  expect(applyMovedCiteFixes('見 t.tsx:5 與 t.tsx:5-6', [{ cite: { raw: 't.tsx:5-6', index: 12, n: 5, end: 6 }, fix: [6, 7] }, { cite: { raw: 't.tsx:5', index: 2, n: 5, end: null }, fix: [6] }]) === '見 t.tsx:6 與 t.tsx:6-7', 'C6 --fix-moved-cites:只改數字,範圍兩端都改,同一行兩處各改各的')
  expect(parseBlamePorcelain('0123456789abcdef0123456789abcdef01234567 3 5 1\nauthor a\n' + '0'.repeat(40) + ' 9 9\n').get(5) === '0123456789abcdef0123456789abcdef01234567' && /^0+$/.test(parseBlamePorcelain('0'.repeat(40) + ' 9 9\n').get(9)), 'C6(b):blame porcelain 讀得到「工作樹第幾行 → 哪個 commit 寫的」(全 0 = 還沒提交)')
  const namesOf = (q) => declaredNames(q, tree[q])
  const anchorsOf = (t) => findBrokenAnchors(from, t, resolveX, namesOf).length
  expect(anchorsOf('x.tsx#A / x.tsx#Y / x.tsx#inner / x.tsx#size / x.tsx#L42 / x.tsx#${k} / ../../tokens/t.css#--tok-a') === 0 && anchorsOf('x.tsx#Gone') === 1 && anchorsOf('../../tokens/t.css#--tok-gone') === 1, 'C6(c):頂層 / import / 函式內 / interface 成員 / CSS 自訂屬性都算宣告;#L42、樣板不算錨點;找不到的名字紅')
  return { ok, fails }
}

function main() {
  const args = process.argv.slice(2)
  const rootArg = args.find((a) => a.startsWith('--root='))
  const root = rootArg ? resolve(rootArg.slice('--root='.length)) : SELF_ROOT
  try {
    if (args.includes('--selftest')) {
      const { ok, fails } = runSelftest()
      if (fails.length) { console.error('✗ owner-claims-invariant --selftest 失敗(量具不會紅):'); for (const f of fails) console.error(`  ✗ ${f}`); process.exit(1) }
      console.log(`✓ owner-claims-invariant --selftest:${ok.length} 題全過`)
      for (const o of ok) console.log(`  · ${o}`)
      return
    }
    if (args.includes('--fix-moved-cites')) {
      const r = scanCites(root, { argv: args, env: process.env, fix: true })
      console.log(`C6 --fix-moved-cites:${r.baseNote};改了 ${r.fixed} 個「原封不動、只是位置變了」的行號引用`)
      if (r.problems.length) { console.error(`還有 ${r.problems.length} 處要人工看(空行 / 超出檔尾 / 宣告不存在 / 那一行被刪或改寫):`); for (const p of r.problems) console.error(`    ${p.where}  ${p.msg}`); process.exit(1) }
      return
    }
    const results = scanTree(root, { argv: args, env: process.env })
    const total = Object.values(results).reduce((n, v) => n + v.length, 0)
    if (total) {
      const label = { C1: 'color.spec 消費者登記簿', C2: 'lib/README 當前居民', C3: 'Button loading 說明', C4: '字重刻度', C5: '<Steps> 命名', C6: '檔名:行號 / 檔名#宣告 引用' }
      console.error(`✗ owner-claims-invariant:owner 文件與程式分家 ${total} 處`)
      for (const [k, v] of Object.entries(results)) {
        if (!v.length) continue
        console.error(`  ${k} ${label[k]}(${v.length})`)
        for (const p of v) console.error(`    ${p.where}  ${p.msg}`)
      }
      console.error(`  ${results.notes.C2};${results.notes.C6}`)
      process.exit(1)
    }
    console.log('✓ owner-claims-invariant:C1 color 登記簿 / C2 lib 居民 / C3 Button loading 說明 / C4 字重刻度 / C5 <Steps> 命名 / C6 引用 全部與 owner 一致')
    console.log(`  ${results.notes.C2};C6 ${results.notes.C6}`)
  } catch (error) {
    if (error instanceof InstrumentError) { console.error(`INSTRUMENT-FAIL owner-claims-invariant:${error.message}`); process.exit(2) }
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
