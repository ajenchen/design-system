#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: AGENTS.md / CLAUDE.md 的 bootstrap 結構完整 —— A1 root→最深 package scope 的指令鏈 ≤ 32KiB(Codex 靜默截斷上限)、
 *         A2 CLAUDE.md 以 `@AGENTS.md` 開頭、A3 Rule Index 路徑存在且 provider view 只出現在明示 adapter 的說明、
 *         A4 兩檔無重複 normative 標題、A5 npm files 含兩檔且 shipped package instructions 來自獨立短 source、
 *         A6 開場固定載入檔(AGENTS.md + CLAUDE.md + 無 paths 的規則檔)總 bytes ≤ 釘住的上限、A7「分診與預算」段與 meta-patterns 優先序那一行還在、
 *         A8「交 user / human-only」集合只住 AGENTS.md#canonical-decision-authority + approval-evidence.mjs + release-workflow.json,
 *         別處的手抄清單(英文、中文、中英混寫,或「標籤 → 交 user」的誰決定清單)/ 寫死的 scope id / 手寫類別數都要引用它
 *         (引了 id 清單就要與它相同),分類器與收據契約的 fork / template 投影逐位元組相同。
 *   紅: 任一斷言不成立 → 印出哪一條與實測數字(例:鏈的 bytes)或 檔:行,exit 1。
 *       A6 的對照組(上限本身綠、多一行紅)答錯 → exit 2;A8 讀不到 SSOT、或每次先跑的對照組(用 SSOT 字彙造的合成文字,
 *       與 scripts/test-fixtures/agents-bootstrap-a8/cases.json 的真實寫法)答錯 → 量具失效 exit 2(不是綠)。
 *   綠: 全部成立。純靜態讀檔,結果不隨時間 / 機器變。A8 只在有 packages/design-system/ds-canonical 的 repo 跑(fixture 小樹沒有就不適用)。
 *   執行面: 2026-09-27 起 verify-static `npm run check:agents-bootstrap`(此前只有 fixture 測試呼叫,真 repo 沒人跑 —— 待辦總帳 N14(a))。
 *
 * check-agents-bootstrap.mjs — PNG P1.3 bootstrap 完整性閘(2026-07-16)。
 *
 * 為何存在:PNG 架構下治理核心 = AGENTS.md(provider-neutral;Codex 原生 discovery),
 *   CLAUDE.md = `@AGENTS.md` import 薄殼(Anthropic 官方共用模式)。此結構一旦漂移
 *   (import 被刪 / root→cwd 指令鏈超過 Codex 32KiB cap / Rule Index 死鏈 / 兩檔重複 normative 段)
 *   = 兩 provider 吃到不同治理 → 本 gate fail-closed。
 *
 * 斷言:
 *   A1 AGENTS.md 存在，且 root 與最深 shipped package scope 的累積鏈 ≤ 32KiB
 *   A2 CLAUDE.md 首個非空行 = `@AGENTS.md`(Claude import 完整)
 *   A3 AGENTS.md canonical repo 路徑存在；provider-view 路徑只准出現在明示 adapter/non-authority 的說明
 *   A4 兩檔無重複 normative 標題(# / ## 級;Claude 段的機制說明豁免清單)
 *   A5 npm files 含 AGENTS/CLAUDE；shipped package instructions 精確來自獨立短 source，且不得複製 root
 *   A6 開場固定載入檔總 bytes ≤ OPENING_FILES_MAX_BYTES(2026-11-22 CG0-SLIM-CAP)
 *   A7 AGENTS.md「分診與預算」段 + meta-patterns 優先序那一行存在(2026-11-22 CG0-THRIFT)
 *   A8 authority 集合不在別處手抄(2026-11-22 WP-AGENTS / ASKFIX-REPO-DRIFT;判法見 A8 段開頭)
 *
 * 用法:node scripts/check-agents-bootstrap.mjs [--check]
 */
import fs from 'node:fs'
import path from 'node:path'
import { askSpans, readAskRouteSsot } from '../packages/design-system/ds-canonical/hooks/lib/ask-route.mjs'

const rootIndex = process.argv.indexOf('--root')
if (rootIndex !== -1 && !process.argv[rootIndex + 1]) {
  console.error('usage: check-agents-bootstrap.mjs [--check] [--root <repo>]')
  process.exit(2)
}
const ROOT = rootIndex === -1 ? process.cwd() : path.resolve(process.argv[rootIndex + 1])
const errors = []
const A = path.join(ROOT, 'AGENTS.md')
const C = path.join(ROOT, 'CLAUDE.md')
const CODEX_PROJECT_DOC_MAX_BYTES = 32 * 1024
const PACKAGE_AGENTS_SOURCE = path.join(ROOT, 'scripts/package-role-sources/AGENTS.package.md')
const PACKAGE_CLAUDE_SOURCE = path.join(ROOT, 'scripts/package-role-sources/CLAUDE.package.md')
const PACKAGE_AGENTS = path.join(ROOT, 'packages/design-system/AGENTS.md')
const PACKAGE_CLAUDE = path.join(ROOT, 'packages/design-system/CLAUDE.md')
const DISCOVERY_SKIP_DIRECTORIES = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', 'storybook-static',
  '.cache', '.next', '.turbo', '.parcel-cache',
])

function discoveredProjectDocs(directory = ROOT, found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      if (entry.name === 'AGENTS.md' || entry.name === 'AGENTS.override.md') errors.push(`A1: instruction file 不得是 symlink:${path.relative(ROOT, path.join(directory, entry.name))}`)
      continue
    }
    if (entry.isDirectory()) {
      if (!DISCOVERY_SKIP_DIRECTORIES.has(entry.name)) discoveredProjectDocs(path.join(directory, entry.name), found)
    } else if (entry.isFile() && (entry.name === 'AGENTS.md' || entry.name === 'AGENTS.override.md')) found.push(path.join(directory, entry.name))
  }
  return found
}

function projectDocChain(targetDirectory) {
  const relative = path.relative(ROOT, targetDirectory)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return []
  const directories = [ROOT]
  if (relative) {
    let cursor = ROOT
    for (const segment of relative.split(path.sep)) {
      cursor = path.join(cursor, segment)
      directories.push(cursor)
    }
  }
  const chain = []
  for (const directory of directories) {
    const candidates = ['AGENTS.override.md', 'AGENTS.md']
    const selected = candidates.map((name) => path.join(directory, name))
      .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile() && fs.statSync(candidate).size > 0)
    if (selected) chain.push(selected)
  }
  return chain
}

// A1
if (!fs.existsSync(A)) errors.push('A1: AGENTS.md 不存在')
else {
  const bytes = fs.statSync(A).size
  if (bytes > CODEX_PROJECT_DOC_MAX_BYTES) errors.push(`A1: AGENTS.md ${bytes} bytes > 32KiB(Codex project_doc_max_bytes 預設 cap)— 拆分或瘦身`)
}
for (const instruction of fs.existsSync(ROOT) ? discoveredProjectDocs() : []) {
  const chain = projectDocChain(path.dirname(instruction))
  const chainBytes = chain.reduce((sum, file) => sum + fs.statSync(file).size, 0) + Math.max(0, chain.length - 1) * 2
  if (chainBytes > CODEX_PROJECT_DOC_MAX_BYTES) {
    errors.push(`A1: root→${path.relative(ROOT, path.dirname(instruction)) || '.'} project-doc chain ${chainBytes} bytes > 32KiB(${chain.map((file) => path.relative(ROOT, file)).join(' + ')})`)
  }
}

// A2
if (!fs.existsSync(C)) errors.push('A2: CLAUDE.md 不存在')
else {
  const first = fs.readFileSync(C, 'utf8').split('\n').find((l) => l.trim() !== '')
  if (first?.trim() !== '@AGENTS.md') errors.push(`A2: CLAUDE.md 首個非空行必須是 "@AGENTS.md"(實際:"${(first || '').slice(0, 40)}")— Claude 治理 import 斷`)
}

// A3:Rule Index + 全文 canonical repo 路徑引用存在性。Generated provider homes may be
// described as delivery/adapters, but must never be the path readers are told to consult as SSOT.
if (fs.existsSync(A)) {
  const src = fs.readFileSync(A, 'utf8')
  const paths = [...src.matchAll(/`((?:scripts|packages|governance|infra)\/[^`*]+?\.(?:md|mjs|sh|json))`/g)].map((m) => m[1]).filter((p) => !p.includes('{'))
  for (const p of new Set(paths)) {
    if (!fs.existsSync(path.join(ROOT, p))) errors.push(`A3: AGENTS.md 引用不存在路徑 ${p}`)
  }
  const adapterDisclosure = /adapter|generated|可重建|非.{0,12}(?:authority|SSOT|owner|信任邊界)|不得手改|專屬加速器|delivery/i
  src.split('\n').forEach((line, index) => {
    const providerPaths = [...line.matchAll(/`((?:\.claude|\.codex|\.agents)(?:\/[^`]+)?)`/g)].map((match) => match[1])
    if (providerPaths.length && !adapterDisclosure.test(line)) {
      errors.push(`A3: AGENTS.md:${index + 1} 把 generated provider view 當讀取指標(${providerPaths.join(', ')})；改指 canonical owner，或同行明示 adapter/non-authority`)
    }
  })
}

// A4:normative 標題重複(# 級,允許 CLAUDE.md 的 provider 機制標題)
if (fs.existsSync(A) && fs.existsSync(C)) {
  const heads = (f) => new Set(fs.readFileSync(f, 'utf8').split('\n').filter((l) => /^#{1,2} /.test(l)).map((l) => l.replace(/^#+ /, '').trim()))
  const ALLOW = new Set(['Claude Code 專屬機制層(provider adapter)'])
  const dup = [...heads(A)].filter((h) => heads(C).has(h) && !ALLOW.has(h))
  if (dup.length) errors.push(`A4: 重複 normative 標題(兩檔同段 = 雙 SSOT):${dup.join(' / ')}`)
}

// A5:npm files + concise package-scope projections. Codex concatenates project docs from
// repository root to cwd under one default 32KiB budget, so a nested package must augment the
// root instead of copying it. Claude receives the same separation through the local @AGENTS import.
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/design-system/package.json'), 'utf8'))
  if (!pkg.files?.includes('AGENTS.md')) errors.push('A5: packages/design-system/package.json files 缺 AGENTS.md')
  if (!pkg.files?.includes('CLAUDE.md')) errors.push('A5: packages/design-system/package.json files 缺 CLAUDE.md')
  for (const [label, source, shipped] of [
    ['AGENTS.md', PACKAGE_AGENTS_SOURCE, PACKAGE_AGENTS],
    ['CLAUDE.md', PACKAGE_CLAUDE_SOURCE, PACKAGE_CLAUDE],
  ]) {
    if (!fs.existsSync(source)) errors.push(`A5: package instruction source ${path.relative(ROOT, source)} 不存在`)
    if (!fs.existsSync(shipped)) errors.push(`A5: shipped package instruction ${path.relative(ROOT, shipped)} 不存在(跑 npm run sync:ds-canonical)`)
    if (fs.existsSync(source) && fs.existsSync(shipped)
      && !fs.readFileSync(shipped).equals(fs.readFileSync(source))) errors.push(`A5: shipped ${label} 與 package-scope source 不同步(跑 npm run sync:ds-canonical)`)
  }
  if (fs.existsSync(A) && fs.existsSync(PACKAGE_AGENTS)
    && fs.readFileSync(A).equals(fs.readFileSync(PACKAGE_AGENTS))) errors.push('A5: nested package AGENTS.md 不得複製 root AGENTS.md(重複 SSOT/context)')
  if (fs.existsSync(C) && fs.existsSync(PACKAGE_CLAUDE)
    && fs.readFileSync(C).equals(fs.readFileSync(PACKAGE_CLAUDE))) errors.push('A5: nested package CLAUDE.md 不得複製 root CLAUDE.md')
  if (fs.existsSync(PACKAGE_CLAUDE)) {
    const first = fs.readFileSync(PACKAGE_CLAUDE, 'utf8').split('\n').find((line) => line.trim() !== '')
    if (first?.trim() !== '@AGENTS.md') errors.push('A5: packages/design-system/CLAUDE.md 首個非空行必須是 "@AGENTS.md"')
  }
} catch (e) { errors.push(`A5: package.json 讀取失敗 ${e.message}`) }

// A6:開場固定載入的檔總 bytes 有上限(CG0-SLIM-CAP;logs/efficiency/synthesis.md §2 F4「釘在瘦身後的數字,要變大必須在 PR 裡明改上限」)。
// 開場固定載入 = AGENTS.md + CLAUDE.md + rules/ 底下沒有 paths 前置設定的規則檔(Claude 每次對話都載入;目前 meta-patterns.md、
// work-process.md)—— 名單從目錄機械算,新增一支常駐規則檔自動算進來,不必改本檔。上限 = 2026-11-22 WP-AGENTS 收尾時的實量,
// 只在確定要讓開場變大時才改這個數字(改了 PR diff 看得到)。量的是正本;.claude/rules 是逐位元組投影(governance:check 管)。
const OPENING_FILES_MAX_BYTES = 76_151
const RULES_DIR = path.join(ROOT, 'packages/design-system/ds-canonical/rules')
const alwaysLoadedRules = fs.existsSync(RULES_DIR)
  ? fs.readdirSync(RULES_DIR).filter((name) => name.endsWith('.md')).sort().filter((name) => {
    const head = fs.readFileSync(path.join(RULES_DIR, name), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)
    return !(head && /^paths\s*:/m.test(head[1]))
  }).map((name) => path.join(RULES_DIR, name))
  : []
const openingFiles = [A, C, ...alwaysLoadedRules].filter((file) => fs.existsSync(file))
const openingBytes = openingFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0)
const openingOver = (bytes) => bytes > OPENING_FILES_MAX_BYTES
// 兩面對照(每次執行):剛好等於上限 → 不紅;多一行 → 紅。答錯 = 量具失效。
if (openingOver(OPENING_FILES_MAX_BYTES) || !openingOver(OPENING_FILES_MAX_BYTES + '\n'.length)) {
  console.error('❌ agents-bootstrap 閘 INSTRUMENT:A6 對照組答錯(上限本身應綠、多一行應紅)')
  process.exit(2)
}
if (openingOver(openingBytes)) {
  errors.push(`A6: 開場固定載入 ${openingBytes} bytes > 上限 ${OPENING_FILES_MAX_BYTES}(${openingFiles.map((file) => path.relative(ROOT, file)).join(' + ')})—— 先瘦身;確定要變大就在本檔明改 OPENING_FILES_MAX_BYTES`)
}

// A7:「分診與預算」段還在(CG0-THRIFT;synthesis.md §2 F3「刪掉會紅」),meta-patterns 開頭的優先序那一行也指向它。
// 只在 DS 作者 repo(有 packages/design-system/ds-canonical)檢查;fixture 小樹不適用。
const DS_CANONICAL = path.join(ROOT, 'packages/design-system/ds-canonical')
if (fs.existsSync(DS_CANONICAL) && fs.existsSync(A) && !/^\*\*分診與預算\*\*/m.test(fs.readFileSync(A, 'utf8'))) {
  errors.push('A7: AGENTS.md 缺「**分診與預算**」段 —— 省錢規則與它的優先序只住這裡,每個代理(含 Codex)開場都讀')
}
const META_PATTERNS = path.join(RULES_DIR, 'meta-patterns.md')
if (fs.existsSync(DS_CANONICAL) && fs.existsSync(META_PATTERNS) && !/^\*\*優先序\*\*.*「分診與預算」/m.test(fs.readFileSync(META_PATTERNS, 'utf8'))) {
  errors.push('A7: meta-patterns.md 開頭缺指向 AGENTS.md「分診與預算」的優先序那一行')
}

// A8:「交 user / human-only」集合不得在別處手抄(ASKFIX-REPO-DRIFT;user 2026-11-20 09:23「給我確保這種事情上都有SSOT 沒有漂移」)。
// SSOT = AGENTS.md#canonical-decision-authority 區塊 + approval-evidence.mjs humanOnlyAuthorityScopes() + release-workflow.json 發版同意,
// 執行時經 hooks/lib/ask-route.mjs 的 readAskRouteSsot 讀(同一支讀法,不另寫;靜態 import,不動態載入模組)。偵測字彙全部由 SSOT 衍生、本檔不帶清單:
//   A8a 同一段寫了 ≥ 2 個 humanOnlyScopes id → 那一段要引用 SSOT,而且列的 id 集合要等於 SSOT(引了出處卻抄舊集合也紅);
//       [交user:<id>] 是逐筆宣告,不算列舉。
//   A8b 連續幾行(每行至少一個)寫到 ≥ 3 個 human-only 動作詞;或 ≥ 2 個、而同一串行寫了 human-only / ASK / 交 user → 同一段要引用 SSOT。
//       動作詞 = 決策區塊「**Human-only boundaries**」第一句(括號內的補充除外)裡,以 / ／ 、 , 分開的每一項的英文詞,
//       以及每一項裡 ≥ 2 字的中文詞(回指前文的「上述…」那一項除外)—— 中文、中英混寫的清單一樣抓(2026-11-22 審查必修 1)。
//   A8c 寫「交 user 的只有 N 種 / 類」這種類別數 → 同一段要引用 SSOT,且 N = SSOT 集合大小。
//   A8d approval-evidence.mjs、authority-decision-evidence.mjs 的 fork / template 投影與正本逐位元組相同。
//   A8e「誰決定」清單(結構判定,照交接參考實作 drift-scan.py):一行一筆的「標籤 → 去處」(條列、表格列、程式裡一行一筆的鍵值)
//       有 ≥ 2 個不同標籤交 user;或 markdown 條列裡 ≥ 2 筆用箭頭分流、其中有一筆交 user → 清單本身或它前一行要引用 SSOT。
//       「交 user」= ask-route.mjs 的 askSpans(Stop hook 同一份寬判定),再加 human-only / ASK 字樣。
// 掃的範圍 = 會被讀來決定下一步的正本(根目錄 .md、ds-canonical、scripts、infra、packages/governance、governance/memory、docs);
// 生成檔(provider views、fork、template、generated)、歷史與證據(governance/planning、governance/archive、fixtures)不掃。
// 豁免:標記區塊本身、SSOT 檔本身(approval-evidence.mjs、ask-route.mjs、release-workflow.json)。
// 每次執行先跑對照組,答錯 = 量具失效 exit 2:(1) 用 SSOT 讀到的字彙造合成文字;(2) scripts/test-fixtures/agents-bootstrap-a8/cases.json
// 的真實寫法(規格點名 4 支 skill 在 68c260ee 的手抄原文與現行引用寫法、中文 / 混寫清單)—— 該紅的要紅、該綠的要綠。
if (fs.existsSync(DS_CANONICAL)) {
  const CLASSIFIER_REL = 'packages/design-system/ds-canonical/hooks/lib/approval-evidence.mjs'
  const RECEIPT_REL = 'packages/governance/src/authority-decision-evidence.mjs'
  const SSOT_FILES = new Set([CLASSIFIER_REL, 'packages/design-system/ds-canonical/hooks/lib/ask-route.mjs', 'infra/governance/release-workflow.json'])
  const PROJECTIONS = [
    [CLASSIFIER_REL, 'packages/design-system/ds-canonical/fork/launchers/approval-evidence.mjs'],
    [CLASSIFIER_REL, 'template/ds-product-template/governance/bin/approval-evidence.mjs'],
    [RECEIPT_REL, 'packages/design-system/ds-canonical/fork/launchers/authority-decision-evidence.mjs'],
    [RECEIPT_REL, 'template/ds-product-template/governance/bin/authority-decision-evidence.mjs'],
  ]
  const CITE = /canonical-decision-authority|approval-evidence\.mjs|release-workflow\.json|humanOnlyAuthorityScopes/
  const INCLUDE = [/^[^/]+\.md$/, /^packages\/design-system\/ds-canonical\//, /^scripts\//, /^infra\//, /^packages\/governance\//, /^governance\/memory\//, /^docs\//]
  const EXCLUDE = [/^packages\/design-system\/ds-canonical\/fork\//, /^governance\/(?:planning|archive|generated)\//, /(?:^|\/)(?:test-)?fixtures\//,
    /^infra\/governance\/(?:evidence|runtime|baseline)\//, /^CHANGELOG/, /(?:^|\/)package-lock\.json$/]
  const TEXT = /\.(?:md|mjs|js|cjs|ts|sh|py|json|ya?ml|txt)$/
  const MD = /\.md$/
  const MARKER = /\[\s*交\s*user\s*[:：][^\]\n]*\]/g
  const CN_NUM = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  const N = '([0-9]+|[一二兩三四五六七八九十])'
  const ROUTE = '(?:ASK|human[-\\s]?only|交\\s*(?:給\\s*)?user|問\\s*user|要你決定|請你決定|user\\s*(?:決定|拍板))'
  const COUNT_RES = [
    new RegExp(`${ROUTE}[^。\\n]{0,10}?(?:只有|只限|只准|只能|僅限?|就是|共)\\s*${N}\\s*(?:種|類)`, 'iu'),
    new RegExp(`(?:只有|只限|只准|只能|僅限?)[^。\\n]{0,16}?${N}\\s*(?:種|類)\\s*(?:的\\s*)?${ROUTE}`, 'iu'),
    new RegExp(`(?:分成?|共)\\s*${N}\\s*(?:種|類)(?=[^。\\n]{0,24}${ROUTE})`, 'iu'),
  ]
  const instrument = []
  let ssot = null
  let terms = []
  let cnTerms = []
  try {
    ssot = readAskRouteSsot(ROOT)
    const agentsLines = fs.readFileSync(A, 'utf8').split('\n')
    const boundary = [...ssot.refLines].map((n) => agentsLines[n - 1]).find((l) => /^\*\*Human-only boundaries\*\*/.test(l.trim()))
    if (!boundary) throw new Error('決策區塊裡沒有「**Human-only boundaries**」段')
    const first = boundary.trim().replace(/^\*\*Human-only boundaries\*\*\s*[:：]?/, '').split('。')[0].replace(/[(（][^)）]*[)）]/g, ' ')
    const items = first.split(/[/／、,，;；]/)
    terms = [...new Set(items.map((item) => (item.match(/[A-Za-z]{2,}(?:\s+[A-Za-z]{2,})*/g) || []).join(' ').toLowerCase()).filter(Boolean))]
    if (terms.length < 3) throw new Error(`Human-only boundaries 只讀到 ${terms.length} 個英文動作詞(${terms.join(', ')})`)
    // 中文動作詞:每一項裡 ≥ 2 字的中文詞(中英混寫的項只取中文那段);含「上述」的項是回指前文、不是新的一類,不收。
    cnTerms = [...new Set(items.filter((item) => !/上述/.test(item)).flatMap((item) => item.match(/[一-鿿]{2,}/g) || []))]
    if (cnTerms.length < 3) throw new Error(`Human-only boundaries 只讀到 ${cnTerms.length} 個中文動作詞(${cnTerms.join('、')})`)
  } catch (e) {
    instrument.push(`A8 量具失效:讀不到 SSOT(${e.message})`)
  }
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const termRe = [
    ...terms.map((t) => [t, new RegExp(`(?<![A-Za-z])${t.split(' ').map(escapeRe).join('[\\s_-]+')}(?![A-Za-z])`, 'i')]),
    ...cnTerms.map((t) => [t, new RegExp(escapeRe(t))]),
  ]
  // 「交 user」:窄判定 ROUTE_HINT(A8b 用)與寬判定(A8e 每筆的去處 = ROUTE_HINT + askSpans;askSpans 的「問句」那一類不算 ——
  // 規則表、程式裡的問號不是把事交給 user)。「user 拍板」這種講出處的標註不是分流,交給 askSpans 判(它只認「由 / 請 / 等 user 拍板」)。
  const ROUTE_HINT = /(?<![A-Za-z])ASK(?![A-Za-z])|(?<![A-Za-z])human[-\s_]?only(?![A-Za-z])|交\s*(?:給|由)?\s*user|(?:問|請)\s*user/i
  const routesToUser = (text) => ROUTE_HINT.test(text) || askSpans(text, ssot).some((span) => span.name !== '問句交user')
  const idRe = (ssot?.scopes || []).map((id) => [id, new RegExp(`(?<![A-Za-z0-9-])${id}(?![A-Za-z0-9-])`)])
  const paragraphs = (lines, md) => {
    // 段落 = 連續非空行;markdown 再從條列項、表格列、標題切開。回 [起, 迄](0 起算、含迄)。
    const out = []
    const head = (l) => /^\s*(?:[-*+]|\d+[.)])\s|^\s*\||^\s*#{1,6}\s/.test(l)
    let i = 0
    while (i < lines.length) {
      if (!lines[i].trim()) { i += 1; continue }
      let j = i + 1
      while (j < lines.length && lines[j].trim() && !(md && (head(lines[j]) || /^\s*\|/.test(lines[i])))) j += 1
      out.push([i, j - 1])
      i = j
    }
    return out
  }
  const scan = (rel, text, skip = () => false) => {
    const found = []
    const md = MD.test(rel)
    const lines = text.split('\n')
    const paras = paragraphs(lines, md)
    const paraOf = new Array(lines.length)
    paras.forEach((p, k) => { for (let i = p[0]; i <= p[1]; i += 1) paraOf[i] = k })
    const windowText = (a, b) => {
      const s = Math.max(paras[paraOf[a]]?.[0] ?? a, a - 12)
      const e = Math.min(paras[paraOf[b]]?.[1] ?? b, b + 12)
      return lines.slice(s, e + 1).join('\n')
    }
    // A8a 清單形狀:同一行 ≥ 2 個 id,或連續幾行(每行有 id,或是一個單獨的 kebab 字串 / 條列項,例 `'x-y',`)合起來 ≥ 2 個 id
    const idHits = lines.map((l, i) => (skip(i) ? [] : idRe.filter(([, re]) => re.test(l.replace(MARKER, ' '))).map(([id]) => id)))
    const element = (l) => /^\s*(?:[-*+]\s+`?[a-z0-9]+(?:-[a-z0-9]+)*`?\s*$|['"`][a-z0-9]+(?:-[a-z0-9]+)*['"`],?\s*$)/.test(l)
    for (let i = 0; i < lines.length;) {
      if (!idHits[i].length) { i += 1; continue }
      let j = i
      const ids = new Set()
      while (j < lines.length && !skip(j) && (idHits[j].length || element(lines[j]))) { idHits[j].forEach((id) => ids.add(id)); j += 1 }
      if (ids.size >= 2) {
        const listed = [...ids]
        if (!CITE.test(windowText(i, j - 1))) found.push(`A8a ${rel}:${i + 1} 寫死 ${listed.length} 個 humanOnlyScopes id(${listed.join(', ')})卻沒引用 SSOT(AGENTS.md#canonical-decision-authority / approval-evidence.mjs)`)
        else if (listed.length !== ssot.scopes.length) found.push(`A8a ${rel}:${i + 1} 引了 SSOT 卻只列 ${listed.length} / ${ssot.scopes.length} 個 id(${listed.join(', ')})—— 抄本與正本不符`)
      }
      i = j
    }
    // A8b
    const hits = lines.map((l, i) => (skip(i) ? [] : termRe.filter(([, re]) => re.test(l)).map(([t]) => t)))
    for (let i = 0; i < lines.length;) {
      if (!hits[i].length) { i += 1; continue }
      let j = i
      const union = new Set()
      while (j < lines.length && hits[j].length) { hits[j].forEach((t) => union.add(t)); j += 1 }
      // ≥ 2 個也算:同一句(句號 / 分號斷句,跨行照接)裡另寫了 human-only / ASK / 交 user —— 那一句就是在列交給人的類別。
      const routed = union.size >= 2 && lines.slice(i, j).join('\n').split(/[。！？!?；;]/)
        .some((sentence) => ROUTE_HINT.test(sentence) && termRe.filter(([, re]) => re.test(sentence)).length >= 2)
      if ((union.size >= 3 || routed) && !CITE.test(windowText(i, j - 1))) {
        found.push(`A8b ${rel}:${i + 1} 自訂 human-only 清單(${[...union].join(' / ')})卻沒引用 SSOT(AGENTS.md#canonical-decision-authority)`)
      }
      i = j
    }
    // A8e「誰決定」清單:一行一筆「標籤 → 去處」。markdown 認條列項與表格列(表格的標籤 = 第一格,≤ 12 字且不含空白);
    // 其他檔認一行一筆的鍵值(`鍵: 值`)。去處只看前 40 字(參考實作同一個長度;長段說明不是分流)。
    const LIST_ITEM = /^\s*(?:[-*+•]|\d+[.)、])\s+(.*)$/
    const entryOf = (line) => {
      if (md && /^\s*\|/.test(line)) {
        const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
        if (cells.length < 2 || cells[0].length > 12 || /\s/.test(cells[0]) || /^[:\s-]*$/.test(cells[0])) return null
        const routedCell = cells.slice(1).find((c) => c.length <= 40 && routesToUser(c))
        return { label: cells[0], dest: routedCell || cells[1], toUser: Boolean(routedCell), arrow: false }
      }
      if (md) {
        const item = LIST_ITEM.exec(line)
        if (!item) return null
        const body = item[1].trim()
        const arrow = /^(.{1,40}?)\s*(?:→|=>|->)\s*(.+)$/.exec(body)
        const colon = arrow ? null : /^([^\s:：→|=()]{1,12})\s*[:：)]\s*(.+)$/.exec(body)
        const m = arrow || colon
        return m ? { label: m[1], dest: m[2], toUser: routesToUser(m[2].slice(0, 40)), arrow: Boolean(arrow) } : null
      }
      const kv = /^\s*['"`]?([^\s'"`:：]{1,40})['"`]?\s*[:：]\s*(.+)$/.exec(line)
      return kv ? { label: kv[1], dest: kv[2], toUser: routesToUser(kv[2].slice(0, 40)), arrow: false } : null
    }
    const entries = lines.map((l, i) => (skip(i) ? null : entryOf(l)))
    for (let i = 0; i < lines.length;) {
      if (!entries[i]) { i += 1; continue }
      // 一個清單 = 連續的「一筆」行;markdown 條列中間夾的縮排續行不打斷清單。
      let j = i
      const unit = []
      while (j < lines.length && !skip(j) && (entries[j] || (md && unit.length && /^\s{2,}\S/.test(lines[j]) && !LIST_ITEM.test(lines[j])))) {
        if (entries[j]) unit.push(entries[j])
        j += 1
      }
      const toUser = unit.filter((e) => e.toUser)
      const labels = new Set(toUser.map((e) => e.label.replace(/[*`'"]/g, '').trim()))
      const custom = labels.size >= 2 || (unit.filter((e) => e.arrow).length >= 2 && toUser.some((e) => e.arrow))
      if (custom && !CITE.test(`${lines[i - 1] || ''}\n${windowText(i, j - 1)}`)) {
        found.push(`A8e ${rel}:${i + 1} 自訂「誰決定」清單(${toUser.map((e) => `${e.label.trim()} → ${e.dest.trim().slice(0, 24)}`).join(' | ')})卻沒引用 SSOT(AGENTS.md#canonical-decision-authority)`)
      }
      i = j
    }
    // A8c
    lines.forEach((l, i) => {
      if (skip(i)) return
      const plain = l.replace(/「[^「」]*」/g, '「」')
      for (const sentence of plain.split(/[。!！?？]/)) {
        for (const re of COUNT_RES) {
          const m = re.exec(sentence)
          if (!m) continue
          const n = /^\d+$/.test(m[1]) ? Number(m[1]) : CN_NUM[m[1]]
          if (!CITE.test(windowText(i, i)) || n !== ssot.allowed.length) {
            found.push(`A8c ${rel}:${i + 1} 手寫「交 user」類別數「${m[0]}」(SSOT 集合 ${ssot.allowed.length} 個;要引用 SSOT 且數字一致,或改成指向)`)
          }
        }
      }
    })
    return found
  }
  let controlCount = 0
  if (!instrument.length) {
    // 對照組 (1):字彙取自 SSOT,本檔不寫任何類別清單。
    const [t1, t2, t3] = terms
    const [c1, c2, c3] = cnTerms
    const ids = ssot.scopes
    const allIdsCode = `const X = [\n${ids.map((id) => `  '${id}',`).join('\n')}\n]\n`
    const cite = '(見 AGENTS.md#canonical-decision-authority)'
    const controls = [
      ['a.md', `只有 ${t1} / ${t2} / ${t3} 要交給人。\n`, 'A8b'],
      ['a.md', `只有 ${t1} / ${t2} / ${t3} 要交給人${cite}。\n`, null],
      ['a.mjs', `const ROUTES = {\n  '${t1}': 1,\n  '${t2}': 2,\n  '${t3}': 3,\n}\n`, 'A8b'],
      ['a.mjs', allIdsCode, 'A8a'],
      ['a.mjs', `// 出處 approval-evidence.mjs\n${allIdsCode}`, null],
      ['a.mjs', `// 出處 approval-evidence.mjs\nconst X = ['${ids[0]}', '${ids[1]}']\n`, 'A8a'],
      ['a.md', `第一段 ${ids[0]}。\n\n第二段 ${ids[1]}。\n`, null],
      ['a.md', `[交user:${ids[0]}] 與 [交user:${ids[1]}]\n`, null],
      ['a.md', `交 user 的只有 ${ssot.allowed.length + 1} 種。\n`, 'A8c'],
      // 中文清單(2026-11-22 審查必修 1)
      ['a.md', `只有${c1}、${c2}、${c3}要交給人。\n`, 'A8b'],
      ['a.md', `只有${c1}、${c2}、${c3}要交給人${cite}。\n`, null],
      ['a.md', `${t1}、${c1} 是 human-only。\n`, 'A8b'],
      ['a.md', `${t1}、${c1} 各寫一次,兩者無關。\n`, null],
      // 「誰決定」結構(2026-11-22 審查必修 1;參考實作 drift-scan.py)
      ['a.md', `- 甲類 → 交 user\n- 乙類 → 交 user\n`, 'A8e'],
      ['a.md', `類別照 AGENTS.md#canonical-decision-authority:\n- 甲類 → 交 user\n- 乙類 → 交 user\n`, null],
      ['a.md', `- 甲類 → AUTO\n- 乙類 → 交 user\n`, 'A8e'],
      ['a.md', `- 甲類 → AUTO\n- 乙類 → AUTO\n`, null],
    ]
    controls.forEach(([rel, text, want], k) => {
      const got = scan(rel, text)
      const ok = want ? got.length > 0 && got.every((f) => f.startsWith(want)) : got.length === 0
      if (!ok) instrument.push(`A8 量具失效:對照組第 ${k + 1} 格應${want ? `紅在 ${want}` : '綠'},實際 ${JSON.stringify(got)}`)
    })
    // 對照組 (2):真實寫法(規格點名 4 支 skill 的手抄原文 / 現行引用寫法、中文 / 混寫清單);讀檔失敗 = 量具失效。
    let cases = []
    try {
      cases = JSON.parse(fs.readFileSync(new URL('./test-fixtures/agents-bootstrap-a8/cases.json', import.meta.url), 'utf8')).cases
      if (!Array.isArray(cases) || !cases.some((c) => c.want === 'red') || !cases.some((c) => c.want === 'green')) throw new Error('cases 要同時有 red 與 green')
    } catch (e) {
      instrument.push(`A8 量具失效:讀不到 test-fixtures/agents-bootstrap-a8/cases.json(${e.message})`)
    }
    for (const c of cases) {
      const got = scan(c.rel, c.text)
      if ((got.length > 0) !== (c.want === 'red')) instrument.push(`A8 量具失效:對照組「${c.name}」應${c.want === 'red' ? '紅' : '綠'},實際 ${JSON.stringify(got)}`)
    }
    controlCount = controls.length + cases.length
  }
  if (instrument.length) {
    console.error('❌ agents-bootstrap 閘 INSTRUMENT:')
    for (const e of instrument) console.error('   - ' + e)
    process.exit(2)
  }
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) { if (!DISCOVERY_SKIP_DIRECTORIES.has(entry.name)) walk(abs, out) } else if (entry.isFile()) out.push(path.relative(ROOT, abs).split(path.sep).join('/'))
    }
    return out
  }
  const corpus = walk(ROOT).filter((rel) => TEXT.test(rel) && INCLUDE.some((re) => re.test(rel)) && !EXCLUDE.some((re) => re.test(rel)) && !SSOT_FILES.has(rel))
  const blockLines = ssot.refLines
  for (const rel of corpus) {
    const skip = rel === 'AGENTS.md' ? (i) => blockLines.has(i + 1) : undefined
    errors.push(...scan(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'), skip))
  }
  for (const [source, projection] of PROJECTIONS) {
    const a = path.join(ROOT, source)
    const b = path.join(ROOT, projection)
    if (!fs.existsSync(a) || !fs.existsSync(b)) errors.push(`A8d 缺檔:${!fs.existsSync(a) ? source : projection}`)
    else if (!fs.readFileSync(a).equals(fs.readFileSync(b))) errors.push(`A8d ${projection} 與正本 ${source} 位元組不同(跑 npm run governance:generate)`)
  }
  console.log(`A8 掃了 ${corpus.length} 個正本文字檔;動作詞 英文 ${terms.length} 個 + 中文 ${cnTerms.length} 個、scope id ${ssot.scopes.length} 個、SSOT 集合 ${ssot.allowed.length} 個(皆由 SSOT 讀);對照組 ${controlCount} 格答對`)
}

if (errors.length) {
  console.error('❌ agents-bootstrap 閘 FAIL:')
  for (const e of errors) console.error('   - ' + e)
  process.exit(1)
}
console.log(`A6 開場固定載入 ${openingBytes} / ${OPENING_FILES_MAX_BYTES} bytes(${openingFiles.length} 檔)`)
console.log('✅ agents-bootstrap 閘 PASS(root→cwd AGENTS chain ≤32KiB / Claude @import / Rule Index 零死鏈 / 無雙 SSOT / scoped npm instructions 同步 / 開場 bytes 上限 / 分診段 / authority 集合不手抄)')
