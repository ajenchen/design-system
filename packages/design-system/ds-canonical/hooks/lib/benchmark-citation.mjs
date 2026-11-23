#!/usr/bin/env node
// M22「世界級對照要附一手來源」的唯一判定實作。兩個呼叫端讀同一份,不准平行:
//   - 寫入當下:packages/design-system/ds-canonical/hooks/check_benchmark_citation.sh
//     (`node -- <本檔> hook <file_path>`,stdin = 這次寫入的文字)—— 只看這一次寫進去的字,是加速器。
//   - 全樹:scripts/benchmark-citation-invariant.mjs(import 本檔)—— 每支 spec.md / tsx 整檔看,CI 必跑,才算數。
// 名稱 / 網域資料住 ./benchmark-citation-sources.json(2026-11-05 K8 盤點的名稱對網域表)。
//
// 判定(一段 = 原文以空行切開的連續非空行):
//   1. 只在「說明文字」裡認名稱:.tsx 只看註解(// … / /* … */ / {/* … */})與 note="…" / note={`…`};
//      .md 不看 ``` / ~~~ 程式碼框裡的內容。範例資料(label: 'Slack')與範例圖不是對照宣稱。
//   2. 整段以網址開頭(參考清單)→ 跳過。
//   3. 段裡有 `snapshots/` 截圖或 `@benchmark-unverified` 逐句撤回(元件規格不算,見 4)→ 整段放行。
//   4. 逐家比對:段裡**每個**被提到的名稱都要有自己的一手來源 —— 段內某個被認可的來源(網址 / 不寫 https:// 的
//      網域路徑 / `#L` 行號)符合該名稱的 sources 才算。一家有、另一家沒有 = partial(2026-11-05 有 72 段兩版 hook 都放行)。
//   5. 元件規格(packages/design-system/src/components/**/*.spec.md)是零證據債範圍:`@benchmark-unverified`、
//      `@benchmark-unverified-blanket:`、`@benchmark-citation-allow:` 一律不准,也不當撤回;其他範圍檔頭 5 行的
//      檔級豁免照舊(數量與期限由 scripts/exemption-expiry-invariant.mjs 管)。
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const SOURCES_TABLE_PATH = join(HERE, 'benchmark-citation-sources.json')

// 與 2026-05 起的 perl 版同一個「空白」:只認 ASCII 空白(全形空白算字,不會讓一行變成空行)。
const BLANK = '[ \\t\\n\\r\\f\\v]'
const NONBLANK = /[^ \t\n\r\f\v]/
const URL_START_PARAGRAPH = new RegExp(`^${BLANK}*[*-]?${BLANK}*https?:\\/\\/`)
const FENCE = new RegExp(`^${BLANK}*(?:\`\`\`|~~~)`)
const NOTE_ATTR = new RegExp(`\\bnote=(?:\\{${BLANK}*)?(["'\`])(.*?)\\1`, 'g')
const SNAPSHOT_REF = /snapshots\//
const UNVERIFIED_MARKER = /@benchmark-unverified/
const FILE_ESCAPE = /@benchmark-citation-allow:|@benchmark-unverified-blanket:/
const COMPONENT_SPEC_FORBIDDEN = /@benchmark-unverified(?:(?![-A-Za-z0-9])|-blanket:)|@benchmark-citation-allow:/
// 網址 / 路徑在空白、括號、引號、表格線或第一個非 ASCII 字(中文標點)處結束
const URL_TOKEN = /https?:\/\/[^\s)>\]`"'<|\u0080-\uffff]+/g
const LINE_REF_TOKEN = /[\w.@/-]*#L\d+/g

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function loadSourcesTable(path = SOURCES_TABLE_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function compileJudge(table = loadSourcesTable()) {
  if (!Array.isArray(table?.products) || table.products.length === 0) throw new Error('benchmark-citation: sources table has no products')
  if (!Array.isArray(table.citeHosts) || table.citeHosts.length === 0) throw new Error('benchmark-citation: sources table has no citeHosts')
  if (!Array.isArray(table.citeUrlPrefixes)) throw new Error('benchmark-citation: sources table has no citeUrlPrefixes')
  const names = new Set()
  const products = table.products.map((product) => {
    if (typeof product?.name !== 'string' || !product.name || names.has(product.name)) {
      throw new Error(`benchmark-citation: product name missing or duplicated:${product?.name}`)
    }
    names.add(product.name)
    return { name: product.name, mention: new RegExp(product.mention), sources: new RegExp(product.sources, 'i') }
  })
  const host = `(?:${table.citeHosts.map(escapeRegExp).join('|')})`
  const prefix = `(?:${table.citeUrlPrefixes.map(escapeRegExp).join('|')})`
  return {
    products,
    citeUrl: new RegExp(`^https?:\\/\\/(?:(?:www\\.)?${prefix}|(?:[a-z0-9-]+\\.)*${host}\\b)`),
    // 路徑第一個字多收 @(unpkg.com/@atlaskit/… 這種套件路徑;perl 版漏收,整段靠別的網址才放行)
    hostPath: new RegExp(`(?<![\\w.\\/-])(?:[a-z0-9-]+\\.)*${host}\\/[\\w.~%\\/#@-][^\\s)>\\]\`"'<|\\u0080-\\uffff]*`, 'g'),
  }
}

// 範圍:跟 hook 註冊的路徑同一組(packages/design-system/src 底下的 *.spec.md 與 *.tsx)
export function scopeOf(path) {
  const match = /(?:^|\/)packages\/design-system\/src\/(.+)$/.exec(String(path).replace(/\\/g, '/'))
  if (!match) return null
  const rest = match[1]
  if (/\.spec\.md$/.test(rest)) return /^components\/.+/.test(rest) ? 'component-spec' : 'other-spec'
  if (/\.tsx$/.test(rest)) return 'tsx'
  return null
}

const headLines = (text, count = 5) => String(text).split('\n').slice(0, count).join('\n')

// 每一行只留「要檢查宣稱」的文字;行數與空行不變(段落切法看原文)。
export function claimLines(lines, tsx) {
  const scan = []
  if (!tsx) {
    let inFence = false
    for (const line of lines) {
      if (FENCE.test(line)) { inFence = !inFence; scan.push('.'); continue }
      scan.push(inFence ? (NONBLANK.test(line) ? '.' : '') : line)
    }
    return scan
  }
  let inBlock = false
  for (const line of lines) {
    if (!NONBLANK.test(line)) { scan.push(''); continue }
    let keep = ''
    let rest = line
    while (rest.length) {
      if (inBlock) {
        const end = rest.indexOf('*/')
        if (end >= 0) { keep += ` ${rest.slice(0, end)}`; rest = rest.slice(end + 2); inBlock = false } else { keep += ` ${rest}`; rest = '' }
        continue
      }
      // 網址裡的 `://` 不是註解開頭(perl 版把 href="https://…">Zendesk 這種範例資料當成註解,誤擋)
      const opener = /\/\*|(?<!:)\/\//.exec(rest)
      if (!opener) { rest = ''; continue }
      rest = rest.slice(opener.index + 2)
      if (opener[0] === '//') { keep += ` ${rest}`; rest = '' } else inBlock = true
    }
    for (const note of line.matchAll(NOTE_ATTR)) keep += ` ${note[2]}`
    scan.push(NONBLANK.test(keep) ? keep : '.')
  }
  return scan
}

export function paragraphs(text, tsx) {
  const lines = String(text).split('\n')
  const scan = claimLines(lines, tsx)
  const out = []
  let current = null
  lines.forEach((line, index) => {
    if (!NONBLANK.test(line)) { if (current) out.push(current); current = null; return }
    if (!current) current = { start: index + 1, end: index + 1, scan: '', orig: '' }
    current.end = index + 1
    current.scan += `${scan[index]}\n`
    current.orig += `${line}\n`
  })
  if (current) out.push(current)
  return out
}

// 段內被認可的一手來源(網址 / 網域路徑 / #L 行號),與沒被認可的網址主機(只用來提示)
export function citationTokens(text, judge) {
  const recognized = []
  const unrecognizedHosts = []
  for (const [url] of text.matchAll(URL_TOKEN)) {
    if (judge.citeUrl.test(url)) recognized.push(url)
    else unrecognizedHosts.push(url.replace(/^https?:\/\//, '').split(/[/?#]/)[0])
  }
  for (const [path] of text.matchAll(judge.hostPath)) recognized.push(path)
  for (const [ref] of text.matchAll(LINE_REF_TOKEN)) recognized.push(ref)
  return { recognized, unrecognizedHosts: [...new Set(unrecognizedHosts)] }
}

// 一段 → null(沒宣稱或宣稱都有來源)或一筆違規
export function judgeParagraph(paragraph, judge, { allowUnverifiedMarker }) {
  const mentioned = judge.products.filter((product) => product.mention.test(paragraph.scan))
  if (mentioned.length === 0) return null
  if (URL_START_PARAGRAPH.test(paragraph.orig)) return null
  if (SNAPSHOT_REF.test(paragraph.orig)) return null
  if (allowUnverifiedMarker && UNVERIFIED_MARKER.test(paragraph.orig)) return null
  const { recognized, unrecognizedHosts } = citationTokens(paragraph.orig, judge)
  // 逐家比對:每個被提到的名稱都要有「自己的」來源
  const missing = mentioned.filter((product) => !recognized.some((token) => product.sources.test(token)))
  if (missing.length === 0) return null
  const firstLineOffset = paragraph.scan.split('\n').findIndex((line) => missing.some((product) => product.mention.test(line)))
  const line = paragraph.start + Math.max(0, firstLineOffset)
  return {
    kind: recognized.length ? 'partial' : 'no-source',
    line,
    paragraphLines: [paragraph.start, paragraph.end],
    text: String(paragraph.orig.split('\n')[line - paragraph.start] ?? '').trim(),
    products: mentioned.map((product) => product.name),
    missing: missing.map((product) => product.name),
    ...(unrecognizedHosts.length ? { unrecognizedHosts } : {}),
  }
}

// 單一入口:一段文字(整檔或這次寫入的片段)+ 它的路徑
//   status: out-of-scope / empty / forbidden-marker / allowlisted / clean / violations
export function analyzeText(text, { path, onDiskHead = '', judge = compileJudge() }) {
  const scope = scopeOf(path)
  if (!scope) return { status: 'out-of-scope', scope: null, violations: [] }
  const body = String(text)
  if (!NONBLANK.test(body)) return { status: 'empty', scope, violations: [] }
  const componentSpec = scope === 'component-spec'
  const markers = componentSpec
    ? body.split('\n').flatMap((line, index) => (COMPONENT_SPEC_FORBIDDEN.test(line) ? [{ line: index + 1, text: line.trim() }] : []))
    : []
  if (!componentSpec && (FILE_ESCAPE.test(headLines(body)) || FILE_ESCAPE.test(headLines(onDiskHead)))) {
    return { status: 'allowlisted', scope, violations: [] }
  }
  const violations = paragraphs(body, scope === 'tsx')
    .map((paragraph) => judgeParagraph(paragraph, judge, { allowUnverifiedMarker: !componentSpec }))
    .filter(Boolean)
  const status = markers.length ? 'forbidden-marker' : violations.length ? 'violations' : 'clean'
  return { status, scope, markers, violations }
}

// CLI(hook 用):node -- benchmark-citation.mjs hook <file_path>,stdin = 這次寫入的文字 → stdout 一行 JSON
const realPathOf = (path) => { try { return realpathSync(resolve(path)) } catch { return resolve(path) } }
const invokedDirectly = Boolean(process.argv[1]) && realPathOf(fileURLToPath(import.meta.url)) === realPathOf(process.argv[1])
if (invokedDirectly) {
  const [mode, filePath, ...extra] = process.argv.slice(2)
  if (mode !== 'hook' || !filePath || extra.length) {
    process.stderr.write('usage: benchmark-citation.mjs hook <file_path>  (stdin = new text)\n')
    process.exit(64)
  }
  const text = readFileSync(0, 'utf8')
  let onDiskHead = ''
  try { if (existsSync(filePath)) onDiskHead = headLines(readFileSync(filePath, 'utf8')) } catch { onDiskHead = '' }
  process.stdout.write(`${JSON.stringify(analyzeText(text, { path: filePath, onDiskHead }))}\n`)
}
