#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DS 的 story 檔(packages/design-system/src、apps/template/src 的 *.stories.tsx)之間,逐字相同(空白正規化後)的頂層宣告
 *         —— 範例小工具元件、範例資料表、資料產生器、型別,6 行以上 —— 只准減少:同一個用途只有一個住所(要共用就放進
 *         packages/design-system/src/stories-helpers/,各檔 import),不准再抄一份到別的檔。
 *   紅: 出現一組基準沒有的跨檔相同宣告;基準裡的一組多出新的檔;CI 裡某一組變少卻沒在同一個 PR 收緊基準 → 指名 file:line,exit 1;
 *       --selftest 以 2026-10-20 教學頁修正第一版的真實抄本(DataTable 設計原則頁與設計規格頁各一份逐字相同的商品產生器)、
 *       合成正反例與基準比對的四種情形證明會在指定行紅。
 *   綠: 現況等於基準(scripts/story-helper-duplication-baseline.json);只在一個檔、內容有差、export 的 story 本身、少於 6 行、
 *       兩檔都 import 同一份共用 helper → 0 筆。純靜態(TypeScript AST)、不讀時間、不開瀏覽器,重複跑結果相同;
 *       掃到 0 個 story 檔 = 儀器失效(exit 2),不讀成通過。
 *
 * 為什麼有這支(2026-10-20,教學頁修正的獨立複核 R1b-T7):N3 把 DataTable 虛擬捲動範例的亂數資料改成決定性產生器時,
 *   把同一段 CATALOG_BASE / catalogRows 逐字抄進設計原則頁與設計規格頁兩個檔,而展示頁早就有一支真實品名池的產生器 ——
 *   同一個用途三份實作、兩種命名法(M17 / M23(d))。沒有任何閘看得到「同一段程式碼出現在兩個 story 檔」;
 *   建閘時全 DS 還有 20 組這樣的抄本(anatomy 頁的 TkVal 16 份、PropRow 12 份、BpZone 10 份、Swatch 9 份……),
 *   一次收斂超出那次修正的範圍,所以鎖進基準、只准往下(待辦總帳另列收斂)。
 *
 * 判法:每個 story 檔的頂層 statement(不含 import、不含 export 的宣告 —— 那是 story 本身),原始碼 6 行以上;
 *   把連續空白收成一個空白後當鍵;同一個鍵出現在 2 個以上的檔 = 一組抄本。render 函式裡就地把共用資料對應成自己欄位的幾行不算
 *   (那是各頁自己的欄位形狀,不是第二份產生器)。
 *
 *   node scripts/story-helper-duplication-invariant.mjs                  判定(exit 0 綠 / 1 紅 / 2 儀器失效)
 *   node scripts/story-helper-duplication-invariant.mjs --selftest       對照組
 *   node scripts/story-helper-duplication-invariant.mjs --list           列出全部抄本組(不判紅綠)
 *   node scripts/story-helper-duplication-invariant.mjs --root=<樹> --baseline=<基準檔>  拿另一棵樹(例:修正前)對這份基準量
 *   node scripts/story-helper-duplication-invariant.mjs --write-baseline 重寫基準(只在人工確認後本機執行;CI 永不執行)
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const SELF = 'scripts/story-helper-duplication-invariant.mjs'
export const BASELINE_PATH = 'scripts/story-helper-duplication-baseline.json'
const SCAN = ['packages/design-system/src', 'apps/template/src']
export const MIN_LINES = 6
export class InstrumentError extends Error {}

const keyOf = (norm) => createHash('sha1').update(norm).digest('hex').slice(0, 16)

/** 一個檔的候選宣告:[{ key, name, line, lines }] */
export function declarationsOf(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out = []
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) || ts.isExportAssignment(st) || ts.isExportDeclaration(st)) continue
    if (st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue
    const start = st.getStart(sf)
    const body = text.slice(start, st.getEnd())
    const lines = body.split('\n').length
    if (lines < MIN_LINES) continue
    const name = ts.isVariableStatement(st)
      ? st.declarationList.declarations.map((d) => d.name.getText(sf)).join(', ')
      : st.name?.getText(sf) ?? ts.SyntaxKind[st.kind]
    out.push({ key: keyOf(body.replace(/\s+/g, ' ').trim()), name, line: sf.getLineAndCharacterOfPosition(start).line + 1, lines })
  }
  return out
}

/** files: [{ file, text }] → { occurrences: Map<key, [{file,line,name,lines}]>, groups: [{key,name,lines,sites}] }(groups = 2 個以上的檔) */
export function findDuplicates(files) {
  const occurrences = new Map()
  for (const { file, text } of files) {
    for (const d of declarationsOf(file, text)) {
      const arr = occurrences.get(d.key) ?? []
      arr.push({ file, line: d.line, name: d.name, lines: d.lines })
      occurrences.set(d.key, arr)
    }
  }
  const groups = []
  for (const [key, sites] of occurrences) {
    const distinct = [...new Set(sites.map((s) => s.file))]
    if (distinct.length >= 2) groups.push({ key, name: sites[0].name, lines: sites[0].lines, sites: [...sites].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line) })
  }
  groups.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
  return { occurrences, groups }
}

/**
 * 與基準比:increases(新的一組 / 一組多了檔)= 紅;decreases(基準裡的一組少了檔)= 本機提示、CI 紅。
 * baseline: { groups: [{ key, name, files: [] }] }
 */
export function compareToBaseline({ occurrences, groups }, baseline) {
  const base = new Map((baseline?.groups ?? []).map((g) => [g.key, g]))
  const increases = []
  const decreases = []
  for (const g of groups) {
    const b = base.get(g.key)
    const files = [...new Set(g.sites.map((s) => s.file))]
    if (!b) { increases.push({ kind: 'new', group: g, files }); continue }
    const extra = files.filter((f) => !b.files.includes(f))
    if (extra.length) increases.push({ kind: 'spread', group: g, files: extra })
  }
  for (const b of base.values()) {
    const now = new Set((occurrences.get(b.key) ?? []).map((s) => s.file))
    const gone = b.files.filter((f) => !now.has(f))
    if (gone.length) decreases.push({ group: b, files: gone })
  }
  return { increases, decreases }
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== 'dist') walk(p, acc) } else acc.push(p)
  }
  return acc
}

export function readTree(root = ROOT) {
  const files = []
  for (const d of SCAN) {
    if (!existsSync(join(root, d))) continue
    for (const abs of walk(join(root, d))) {
      const rel = relative(root, abs).split(sep).join('/')
      if (rel.endsWith('.stories.tsx')) files.push({ file: rel, text: readFileSync(abs, 'utf8') })
    }
  }
  if (!files.length) throw new InstrumentError('掃到 0 個 story 檔 —— 儀器讀不到東西,不是通過')
  return files
}

export function baselineOf({ groups }) {
  return {
    note: `story 檔之間逐字相同的頂層宣告(${MIN_LINES} 行以上)的棘輪基準(${SELF})。每一組只准減少:新的一組 / 一組多了檔 = 紅;`
      + '少了檔要在同一個 PR 本機跑 --write-baseline 收緊(CI 永遠不跑 --write-baseline)。2026-10-20 建閘時鎖進的 20 組是既有的抄本'
      + '(收斂另排,見待辦總帳 R1b-T10);同一個用途要共用就放進 packages/design-system/src/stories-helpers/。',
    generatedBy: `node ${SELF} --write-baseline`,
    groups: groups.map((g) => ({ key: g.key, name: g.name, lines: g.lines, files: [...new Set(g.sites.map((s) => s.file))] })),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// --selftest
// ═══════════════════════════════════════════════════════════════════════════

/** 2026-10-20 教學頁修正第一版(fix.patch,複核前)兩個檔裡逐字相同的那一段 —— data-table.principles.stories.tsx 當時第 162–187 行與
 *  data-table.anatomy.stories.tsx 當時第 293–318 行的原文,一字不改(兩段 cmp 相同) */
export const R1_CATALOG_COPY = `const CATALOG_BASE: { name: string; category: string; price: number }[] = [
  { name: 'Wireless Headphones', category: 'electronics', price: 2490 },
  { name: 'Office Chair', category: 'furniture', price: 8900 },
  { name: 'Green Tea 100 Bags', category: 'food', price: 350 },
  { name: 'USB-C Hub', category: 'electronics', price: 1290 },
  { name: 'Standing Desk', category: 'furniture', price: 15900 },
  { name: 'Espresso Beans 1kg', category: 'food', price: 780 },
  { name: 'Mechanical Keyboard', category: 'electronics', price: 3290 },
  { name: 'Bookshelf', category: 'furniture', price: 4590 },
  { name: 'Oolong Tea Gift Box', category: 'food', price: 1280 },
  { name: '27" 4K Monitor', category: 'electronics', price: 11900 },
]
const CATALOG_VARIANTS = ['Black', 'White', 'Gray', 'Navy', 'Sand']
const catalogRows = (count: number): Product[] =>
  Array.from({ length: count }, (_, i) => {
    const base = CATALOG_BASE[i % CATALOG_BASE.length]
    const round = Math.floor(i / CATALOG_BASE.length)
    return {
      name: \`\${base.name} — \${CATALOG_VARIANTS[round % CATALOG_VARIANTS.length]} (Lot \${Math.floor(round / CATALOG_VARIANTS.length) + 1})\`,
      category: base.category,
      stock: 'in_stock',
      price: base.price + (round % 7) * 50,
      available: i % 3 !== 0,
      launchDate: '2026-04-18',
    }
  })
`
const P = 'packages/design-system/src/components/DataTable/data-table.principles.stories.tsx'
const A = 'packages/design-system/src/components/DataTable/data-table.anatomy.stories.tsx'
const S = 'packages/design-system/src/components/DataTable/data-table.stories.tsx'
const HEAD = "import type { Meta, StoryObj } from '@storybook/react'\n"

export function runSelftest() {
  const ok = []
  const fails = []
  const expect = (cond, msg) => (cond ? ok.push(msg) : fails.push(msg))
  const groupsOf = (files) => findDuplicates(files).groups
  const lineOfIn = (text, needle) => text.split('\n').findIndex((l) => l.startsWith(needle)) + 1

  // 1. R1 的真實抄本:兩檔各一份 → 兩組(CATALOG_BASE、catalogRows),各指名兩個檔的行號
  const pText = `${HEAD}\n// 設計原則頁\n${R1_CATALOG_COPY}`
  const aText = `${HEAD}\n\n\n// 設計規格頁\n${R1_CATALOG_COPY}`
  const r1 = groupsOf([{ file: P, text: pText }, { file: A, text: aText }])
  const names = r1.map((g) => g.name).sort()
  expect(names.join(',') === 'CATALOG_BASE,catalogRows', `R1 兩檔各抄一份商品產生器 → 兩組(CATALOG_BASE、catalogRows;6 行以下的 CATALOG_VARIANTS 不算)(實得 ${names.join(', ') || '0 組'})`)
  const cb = r1.find((g) => g.name === 'CATALOG_BASE')
  expect(cb && cb.sites.some((s) => s.file === P && s.line === lineOfIn(pText, 'const CATALOG_BASE')) && cb.sites.some((s) => s.file === A && s.line === lineOfIn(aText, 'const CATALOG_BASE')),
    `指名兩個檔各自的行號(實得 ${cb ? cb.sites.map((s) => `${s.file.split('/').pop()}:${s.line}`).join(' / ') : '—'})`)
  // 2. 空白 / 縮排不同仍是同一份
  const reindented = R1_CATALOG_COPY.replace(/\n {2}/g, '\n    ')
  expect(groupsOf([{ file: P, text: R1_CATALOG_COPY }, { file: A, text: reindented }]).length === 2, '只差縮排 → 照樣算抄本')
  // 3. 綠的情形
  expect(groupsOf([{ file: P, text: R1_CATALOG_COPY }]).length === 0, '只在一個檔 → 0 組')
  expect(groupsOf([{ file: P, text: R1_CATALOG_COPY }, { file: A, text: R1_CATALOG_COPY.replace("'Office Chair'", "'Ergonomic Office Chair'") }]).every((g) => g.name !== 'CATALOG_BASE'), '內容有差(品名不同)→ 不算同一份')
  const story = `export const Big: Story = {\n  name: '大量資料',\n  render: () => (\n    <DataTable\n      data={rows}\n      height="400px"\n    />\n  ),\n}\n`
  expect(groupsOf([{ file: P, text: story }, { file: A, text: story }]).length === 0, 'export 的 story 本身 → 不算')
  const short = "const OPTIONS = [\n  { value: 'a', label: 'A' },\n  { value: 'b', label: 'B' },\n]\n"
  expect(groupsOf([{ file: P, text: short }, { file: A, text: short }]).length === 0, `少於 ${MIN_LINES} 行 → 不算`)
  const shared = "import { productCatalog } from '@/design-system/stories-helpers/data/product-catalog'\nconst rows = productCatalog(500)\n"
  expect(groupsOf([{ file: P, text: shared }, { file: A, text: shared }, { file: S, text: shared }]).length === 0, '三檔都 import 同一份共用 helper → 0 組')

  // 4. 與基準比
  const files = [{ file: P, text: R1_CATALOG_COPY }, { file: A, text: R1_CATALOG_COPY }]
  const found = findDuplicates(files)
  const base = baselineOf(found)
  const same = compareToBaseline(found, base)
  expect(!same.increases.length && !same.decreases.length, '現況 = 基準 → 綠')
  const spread = findDuplicates([...files, { file: S, text: R1_CATALOG_COPY }])
  const sp = compareToBaseline(spread, base)
  expect(sp.increases.length === 2 && sp.increases.every((x) => x.kind === 'spread' && x.files.join() === S), `基準裡的一組多抄到第三個檔 → 紅(實得 ${sp.increases.map((x) => `${x.kind}:${x.files.join()}`).join(' / ') || '0 筆'})`)
  const fresh = compareToBaseline(found, { groups: [] })
  expect(fresh.increases.length === 2 && fresh.increases.every((x) => x.kind === 'new'), '基準沒有的一組 → 紅')
  const shrunk = compareToBaseline(findDuplicates([{ file: P, text: R1_CATALOG_COPY }, { file: A, text: shared }]), base)
  expect(!shrunk.increases.length && shrunk.decreases.length === 2 && shrunk.decreases.every((x) => x.files.join() === A), '其中一檔改成 import 共用 helper → 不紅,列成可收緊')
  return { ok, fails }
}

function main() {
  const args = process.argv.slice(2)
  const rootArg = args.find((a) => a.startsWith('--root='))
  const root = rootArg ? resolve(rootArg.slice('--root='.length)) : ROOT
  try {
    if (args.includes('--selftest')) {
      const { ok, fails } = runSelftest()
      if (fails.length) { console.error('✗ story-helper-duplication-invariant --selftest 失敗:'); for (const f of fails) console.error(`  ✗ ${f}`); process.exit(1) }
      console.log(`✓ story-helper-duplication-invariant --selftest:${ok.length} 題全過`)
      for (const o of ok) console.log(`  · ${o}`)
      return
    }
    const files = readTree(root)
    const found = findDuplicates(files)
    if (args.includes('--list')) {
      for (const g of found.groups) console.log(`${g.name}(${g.lines} 行,${new Set(g.sites.map((s) => s.file)).size} 檔)\n${g.sites.map((s) => `    ${s.file}:${s.line}`).join('\n')}`)
    }
    if (args.includes('--write-baseline')) {
      if (process.env.CI === 'true') throw new InstrumentError('CI 不准重寫基準(只在人工確認後本機執行)')
      writeFileSync(join(root, BASELINE_PATH), `${JSON.stringify(baselineOf(found), null, 2)}\n`)
      console.log(`✓ 基準已重寫:${found.groups.length} 組 → ${BASELINE_PATH}`)
      return
    }
    const baseArg = args.find((a) => a.startsWith('--baseline='))
    const basePath = baseArg ? resolve(baseArg.slice('--baseline='.length)) : join(root, BASELINE_PATH)
    if (!existsSync(basePath)) throw new InstrumentError(`讀不到基準 ${BASELINE_PATH}`)
    const { increases, decreases } = compareToBaseline(found, JSON.parse(readFileSync(basePath, 'utf8')))
    let red = false
    if (increases.length) {
      red = true
      console.error(`✗ story 檔之間出現新的逐字相同宣告 ${increases.length} 處 —— 同一個用途只有一個住所:要共用就放進 packages/design-system/src/stories-helpers/,各檔 import(M17):`)
      for (const x of increases) {
        const at = (list) => list.map((s) => `${s.file}:${s.line}`).join('  ')
        if (x.kind === 'new') console.error(`  新的一組 ${x.group.name}(${x.group.lines} 行)  ${at(x.group.sites)}`)
        else console.error(`  多抄一檔 ${x.group.name}(${x.group.lines} 行)  ${at(x.group.sites.filter((s) => x.files.includes(s.file)))}  ←  原本就有:${at(x.group.sites.filter((s) => !x.files.includes(s.file)))}`)
      }
    }
    if (decreases.length) {
      const ci = process.env.CI === 'true'
      if (ci) red = true
      ;(ci ? console.error : console.log)(`${ci ? '✗' : '✓'} ${decreases.length} 組比基準少${ci ? ' —— 在這個 PR 裡本機跑 --write-baseline 收緊基準再提交(CI 不准留鬆的基準)' : '(可在本機跑 --write-baseline 收緊;CI 裡變少而基準沒收緊會紅)'}:`)
      for (const x of decreases) (ci ? console.error : console.log)(`  ${x.group.name}:${x.files.join('、')} 已不再是抄本`)
    }
    if (red) process.exit(1)
    console.log(`✓ story-helper-duplication-invariant:${files.length} 個 story 檔;跨檔逐字相同的頂層宣告 ${found.groups.length} 組,都在基準內(只准減少)`)
  } catch (error) {
    if (error instanceof InstrumentError) { console.error(`INSTRUMENT-FAIL story-helper-duplication-invariant:${error.message}`); process.exit(2) }
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
