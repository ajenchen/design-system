#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DS 的 story(packages/design-system/src/**\/*.stories.tsx、stories-helpers、apps/template 的 story)渲染出來的內容每次載入都一樣 ——
 *         不呼叫亂數(Math.random / crypto.randomUUID / crypto.getRandomValues)產生畫面上的資料;範例資料用決定性的產生器。
 *   紅: 任何 story 檔在程式碼(不是註解 / 字串)裡呼叫 Math.random()、crypto.randomUUID()、crypto.getRandomValues() → 指名 file:line,exit 1;
 *       --selftest 以 be2f1324 的 data-table.principles(git blob 驗明正身,:169 Math.random 價格)與合成違規證明在指定行紅。
 *   綠: 現況 0 筆;註解或字串裡提到 Math.random、以索引算出的決定性資料、元件原始碼(不是 story)0 筆。純靜態(TypeScript AST)、
 *       不讀時間、不開瀏覽器,重複跑結果相同;掃到 0 個 story 檔 = 儀器失效(exit 2),不讀成通過。
 *
 * 為什麼有這支(2026-10-20,教學頁稽核 N3):DataTable 虛擬捲動的教學範例用 `Product 0001…0500` + Math.random 價格,
 *   同一份建置兩次載入,Product 0001 一次 $65、一次 $2,336 —— 畫面截圖、像素比對與視覺基準圖都無法重現,而且是佔位內容
 *   (example-selection.md:19)。同族另兩處(data-table.anatomy、data-table.stories 的價格)一併改成決定性產生器;
 *   sidebar.stories.tsx:152 早在 2026-06-02 就因同一個理由改成固定值,但一直只靠紀律,沒有任何閘。
 *
 *   node scripts/story-determinism-invariant.mjs              判定(exit 0 綠 / 1 紅 / 2 儀器失效)
 *   node scripts/story-determinism-invariant.mjs --selftest   對照組
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCAN = ['packages/design-system/src', 'apps/template/src']
const RANDOM = new Set(['Math.random', 'crypto.randomUUID', 'crypto.getRandomValues', 'window.crypto.randomUUID', 'globalThis.crypto.randomUUID'])
export class InstrumentError extends Error {}

const isStoryFile = (rel) => rel.endsWith('.stories.tsx') || rel.includes('/stories-helpers/')

/** 一個檔裡的亂數呼叫:[{ line, call }] */
export function findRandomCalls(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out = []
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText(sf).replace(/\s+/g, '')
      if (RANDOM.has(callee)) out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, call: `${callee}()` })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, acc) } else acc.push(p)
  }
  return acc
}

export function scanTree(root = ROOT) {
  const files = []
  for (const d of SCAN) if (existsSync(join(root, d))) files.push(...walk(join(root, d)).map((p) => relative(root, p).split(sep).join('/')).filter((f) => /\.tsx?$/.test(f) && isStoryFile(f)))
  if (!files.some((f) => f.endsWith('.stories.tsx'))) throw new InstrumentError('掃到 0 個 story 檔 —— 儀器讀不到東西,不是通過')
  const hits = []
  for (const f of files) for (const h of findRandomCalls(f, readFileSync(join(root, f), 'utf8'))) hits.push({ file: f, ...h })
  return { hits, scanned: files.length }
}

const gitBlobId = (buf) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex')
export const BASE_FIXTURE = {
  file: 'packages/design-system/src/components/DataTable/data-table.principles.stories.tsx',
  fixture: 'scripts/test-fixtures/story-determinism/data-table.principles.be2f1324.tsx.txt',
  blob: '4ecce8016e5c7063d27faced93d951712b24a0d4',
  expect: [169],
}
/** [名稱, 內容, 預期行(空陣列 = 0 筆)] */
export const CASES = [
  ['Math.random 價格', "const rows = Array.from({ length: 3 }, (_, i) => ({\n  price: Math.round(Math.random() * 100),\n}))\n", [2]],
  ['crypto.randomUUID 當 id', 'const id = crypto.randomUUID()\n', [1]],
  ['window.crypto.randomUUID', 'export const A = () => <div key={window.crypto.randomUUID()} />\n', [1]],
  ['crypto.getRandomValues', 'const a = crypto.getRandomValues(new Uint8Array(4))\n', [1]],
  ['註解與字串裡提到 Math.random 不算', "// 原本用 Math.random() 產生價格\nconst note = 'Math.random() 會讓畫面每次不同'\n", []],
  ['以索引算出的決定性資料不算', 'const price = (i: number) => 100 + ((i * 7919) % 9900)\n', []],
]

export function runSelftest(root = ROOT) {
  const ok = []
  const fails = []
  const expect = (cond, msg) => (cond ? ok.push(msg) : fails.push(msg))
  for (const [name, text, want] of CASES) {
    const got = findRandomCalls('packages/design-system/src/components/Demo/demo.stories.tsx', text).map((h) => h.line)
    expect(JSON.stringify(got) === JSON.stringify(want), `${name} → ${want.length ? `:${want.join(' :')}` : '0 筆'}(實得 ${got.length ? got.map((l) => `:${l}`).join(' ') : '0 筆'})`)
  }
  const raw = readFileSync(join(root, BASE_FIXTURE.fixture))
  if (gitBlobId(raw) !== BASE_FIXTURE.blob) throw new InstrumentError(`對照組 fixture ${BASE_FIXTURE.fixture} 不是 be2f1324 的原檔`)
  const got = findRandomCalls(BASE_FIXTURE.file, raw.toString('utf8')).map((h) => h.line)
  expect(JSON.stringify(got) === JSON.stringify(BASE_FIXTURE.expect), `be2f1324 data-table.principles → :${BASE_FIXTURE.expect.join(' :')}(實得 ${got.map((l) => `:${l}`).join(' ') || '0 筆'})`)
  expect(!isStoryFile('packages/design-system/src/components/Toast/toast.tsx'), '元件原始碼不在範圍(只管 story)')
  return { ok, fails }
}

function main() {
  const args = process.argv.slice(2)
  try {
    if (args.includes('--selftest')) {
      const { ok, fails } = runSelftest()
      if (fails.length) { console.error('✗ story-determinism-invariant --selftest 失敗:'); for (const f of fails) console.error(`  ✗ ${f}`); process.exit(1) }
      console.log(`✓ story-determinism-invariant --selftest:${ok.length} 題全過`)
      for (const o of ok) console.log(`  · ${o}`)
      return
    }
    const { hits, scanned } = scanTree()
    if (hits.length) {
      console.error(`✗ story 用亂數產生畫面資料 ${hits.length} 處(每次載入畫面都不同,截圖 / 像素比對無法重現;範例改用決定性產生器):`)
      for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.call}`)
      process.exit(1)
    }
    console.log(`✓ story-determinism-invariant:${scanned} 個 story 檔沒有用亂數產生畫面資料`)
  } catch (error) {
    if (error instanceof InstrumentError) { console.error(`INSTRUMENT-FAIL story-determinism-invariant:${error.message}`); process.exit(2) }
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
