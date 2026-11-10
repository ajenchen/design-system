#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 一塊用 data-density / data-ui-size / data-layout-space 換了密度的區塊,裡面每一顆 token 的值
 *        = 整頁直接設成那個密度時的值(逐 token 相等)。兩個方向都驗:大密度頁面裡鎖回一般密度、一般密度頁面裡局部放大。
 *   紅: 任一組合裡任一顆 token 跟「整頁該密度」的值不同 → 指名 token、組合、兩邊的值,exit 1。
 *   綠: 12 種組合(整頁 2 種 × 屬性 3 種 × 區塊 2 種)× 對外彙總檔宣告的全部 token 都相等。
 *   註: 純 CSS 計算,不開 storybook、不量時間;機器快慢不影響結果。
 *
 * 為什麼要有這支(2026-11-11):
 *   `uiSize.css`「鎖回一般密度」段寫著「md-lock subtree 必須與 root md 逐 token 相等」,
 *   但守它的 `token-creation-invariant.mjs` C5 只看「有大密度覆寫的名字有沒有出現在回復段」—— 那是代理,不是性質本身(M37)。
 *   實測兩種它看不到的缺口:
 *   (1) `--sidebar-menu-icon-size` 有大密度覆寫、回復段沒有它(C5 已知名單裡登記著);
 *   (2) 用 var() 組出來、只宣告在 `:root` 的值(例:`--sidebar-width-icon`)—— 瀏覽器在「宣告它的那個元素」上就把 var()
 *       代換掉,子孫繼承代換後的結果(W3C CSS Custom Properties Level 1:custom property 的 Computed value =
 *       「specified value with variables substituted」,https://www.w3.org/TR/css-variables-1/#defining-variables ;
 *       「custom properties resolve any var() functions in their values at computed-value time」,同文件 #cycles)。
 *       所以區塊換了密度,它的輸入跟著變、它自己不會重算 —— C5 根本不會檢查它,因為它沒有大密度覆寫。
 *   這支直接量性質:在真的瀏覽器裡,區塊裡的值 vs 整頁該密度的值。
 *
 * 跑法:
 *   node scripts/test-density-subtree-token-parity.mjs              現況(要綠)
 *   node scripts/test-density-subtree-token-parity.mjs --selftest   對照組:四種注入的缺陷各自必紅且指名(衍生值那一種要同時指名側欄與多行輸入框兩組;含「在主人根元素上量」那條),現況必綠
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowserOrSkip } from './lib/launch-browser.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const DS = join(REPO, 'packages/design-system/src')
const AGGREGATOR = join(DS, 'styles/tokens.css')
const UI_SIZE = join(DS, 'tokens/uiSize/uiSize.css')

/** 已知、還沒修的名字(只能變短:名單裡的名字已經不違規 → 紅,要刪掉)。 */
const KNOWN = new Set([])

/**
 * 主人自己在「自己的根元素」上重算的值:讀者全在那個根元素底下,所以在那裡量,不在空白區塊量。
 * `--table-cell-py`:DataTable 根元素一定帶 `data-table-size`(`data-table.tsx`),`data-table.css` 在
 * `[data-table-size="sm|md|lg"]` 上各寫一份公式 —— 換密度的區塊裡放表格,表格根元素會用區塊的列高重算。
 * `:root` 那一份只是表格外的備用值(唯一的表格外讀者是 resize-handle 的展示頁)。
 */
const OWNER_SCOPE = { '--table-cell-py': 'data-table-size="md"' }
const SCOPES = [...new Set(Object.values(OWNER_SCOPE))]

/** 把對外彙總檔的相對 @import 展開成一份;套件 import(tw-animate-css)不含 token,略過。overrides:路徑 → 替換內容(對照組用)。 */
export function bundleCss(entry, overrides = new Map(), seen = new Set()) {
  if (seen.has(entry)) return ''
  seen.add(entry)
  const text = overrides.get(entry) ?? readFileSync(entry, 'utf8')
  return text.replace(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]\s*\)?\s*;/g, (_, spec) =>
    spec.startsWith('.') ? bundleCss(resolve(dirname(entry), spec), overrides, seen) : '')
}

/** 宣告過的 token 名(去掉註解;`@theme` 裡的 Tailwind 轉接名不是執行期變數,不算)。 */
export function declaredNames(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@theme[^{]*\{[^}]*\}/g, '')
  return [...new Set([...src.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]))].sort()
}

/** 12 種組合:整頁密度 × 區塊用哪個屬性 × 區塊設成哪一檔。expected = 整頁直接設成「區塊該有的兩個維度」。 */
export function densityCases() {
  const TIERS = ['md', 'lg']
  const AXES = { density: ['ui', 'ls'], 'ui-size': ['ui'], 'layout-space': ['ls'] }
  const out = []
  for (const page of TIERS) {
    for (const [attr, axes] of Object.entries(AXES)) {
      for (const tier of TIERS) {
        const ui = axes.includes('ui') ? tier : page
        const ls = axes.includes('ls') ? tier : page
        out.push({
          label: `整頁 data-density="${page}"、區塊 data-${attr}="${tier}"`,
          actual: { html: `data-density="${page}"`, block: `data-${attr}="${tier}"` },
          expected: { html: ui === ls ? `data-density="${ui}"` : `data-ui-size="${ui}" data-layout-space="${ls}"`, block: '' },
          expectedLabel: ui === ls ? `整頁 ${ui}` : `整頁 ui-size ${ui} / layout-space ${ls}`,
        })
      }
    }
  }
  return out
}

const doc = (css, { html, block }) => `<!doctype html><html ${html}><head><style>${css}</style></head>` +
  `<body><div id="probe" ${block}><i id="len" style="position:absolute;visibility:hidden"></i>` +
  SCOPES.map((s, i) => `<div id="scope-${i}" ${s}></div>`).join('') + '</div></body></html>'

/** 在區塊上讀每顆 token 的計算值(主人自己重算的,在主人根元素上讀);能當長度的另外換成 px(寫法不同、長度相同不算違規)。 */
async function readTokens(page, css, ctx, names) {
  await page.setContent(doc(css, ctx))
  return page.evaluate(({ list, scopeOf, scopes }) => {
    const probe = document.getElementById('probe')
    const len = document.getElementById('len')
    const out = {}
    for (const n of list) {
      const host = scopeOf[n] ? document.getElementById(`scope-${scopes.indexOf(scopeOf[n])}`) : probe
      const raw = getComputedStyle(host).getPropertyValue(n).trim()
      let px = null
      if (raw && CSS.supports('width', raw)) { len.style.width = raw; px = len.getBoundingClientRect().width }
      out[n] = { raw, px }
    }
    return out
  }, { list: names, scopeOf: OWNER_SCOPE, scopes: SCOPES })
}

const same = (a, b) => a.raw === b.raw || (a.px != null && b.px != null && Math.abs(a.px - b.px) < 0.01)
const show = (v) => `${v.raw || '(空)'}${v.px != null ? `(${Math.round(v.px * 100) / 100}px)` : ''}`

/** 回傳 { failures: [{case, name, actual, expected}], combo: 大密度頁面裡鎖回一般密度那一格的側欄值 } */
export async function checkParity(page, css) {
  const names = declaredNames(css)
  const failures = []
  let combo = null
  for (const c of densityCases()) {
    const a = await readTokens(page, css, c.actual, names)
    const e = await readTokens(page, css, c.expected, names)
    for (const n of names) if (!same(a[n], e[n])) failures.push({ case: c, name: n, actual: a[n], expected: e[n] })
    if (c.actual.html === 'data-density="lg"' && c.actual.block === 'data-density="md"') {
      combo = { menuIcon: a['--sidebar-menu-icon-size'], rail: a['--sidebar-width-icon'], expectedRail: e['--sidebar-width-icon'] }
    }
  }
  return { failures, combo, nameCount: names.length }
}

function report({ failures, combo, nameCount }) {
  let fail = 0
  const byCase = new Map()
  for (const f of failures) {
    if (!byCase.has(f.case.label)) byCase.set(f.case.label, [])
    byCase.get(f.case.label).push(f)
  }
  for (const c of densityCases()) {
    const list = byCase.get(c.label) ?? []
    const real = list.filter((f) => !KNOWN.has(f.name))
    console.log(`${real.length ? '✗' : '✓'} ${c.label} 對 ${c.expectedLabel}${list.length - real.length ? `(已知 ${list.length - real.length} 筆)` : ''}`)
    for (const f of real) console.log(`    ${f.name}:區塊裡 ${show(f.actual)} ≠ ${c.expectedLabel} ${show(f.expected)}`)
    fail += real.length
  }
  const stillBad = new Set(failures.map((f) => f.name))
  for (const k of KNOWN) if (!stillBad.has(k)) { console.log(`✗ 已知名單裡的 ${k} 已經不違規了 —— 從 KNOWN 刪掉(名單只能變短)`); fail++ }
  if (combo) console.log(`\n大密度頁面裡鎖回一般密度的區塊:--sidebar-menu-icon-size = ${show(combo.menuIcon)}、側欄收合寬 --sidebar-width-icon = ${show(combo.rail)}(整頁 md = ${show(combo.expectedRail)})`)
  console.log(`比對 ${nameCount} 顆 token × ${densityCases().length} 種組合`)
  console.log(fail ? `✗ ${fail} 項不相等` : '✓ 局部密度 = 整頁該密度,逐 token 相等')
  return fail
}

async function selftest(page) {
  const DATA_TABLE = join(DS, 'components/DataTable/data-table.css')
  const mutate = (file, label, re, to) => {
    const base = readFileSync(file, 'utf8')
    const next = base.replace(re, to)
    if (next === base) throw new Error(`對照組「${label}」的注入沒有改到 ${file}(寫法變了,先修對照組)—— INSTRUMENT-FAIL`)
    return new Map([[file, next]])
  }
  const cases = [
    ['現況', null, new Map()],
    ['拿掉 --sidebar-menu-icon-size 的回復', '--sidebar-menu-icon-size', mutate(UI_SIZE, '拿掉回復', /(\[data-density="md"\]\s*\{[\s\S]*?)--sidebar-menu-icon-size:[^;]*;/, '$1')],
    ['衍生值只宣告在 :root(不在區塊上重算)', '--sidebar-width-icon', mutate(UI_SIZE, '只留 :root', /:root,\s*\[data-density\],\s*\[data-ui-size\],\s*\[data-layout-space\]\s*\{/, ':root {')],
    ['衍生值只宣告在 :root —— 多行輸入框內距那組也要被指名', '--field-control-py-md', mutate(UI_SIZE, '只留 :root', /:root,\s*\[data-density\],\s*\[data-ui-size\],\s*\[data-layout-space\]\s*\{/, ':root {')],
    // 列高 2026-11-11 搬到 data-table.css(token「2甲」第四批):注入點跟著住處走,否則 mutate 找不到而 INSTRUMENT-FAIL
    ['拿掉 --table-row-sm 的回復', '--table-row-sm', mutate(DATA_TABLE, '拿掉 table-row 回復', /(\[data-density="md"\]\s*\{[\s\S]*?)--table-row-sm:[^;]*;/, '$1')],
    // 「在主人根元素上量」不是恆綠:表格根元素不再重算 → 繼承整頁的值 → 必紅
    ['表格根元素不再重算 --table-cell-py', '--table-cell-py', mutate(DATA_TABLE, '表格只留 :root', /:root,\s*\[data-table-size="md"\]\s*\{/, ':root {')],
  ]
  let ok = true
  for (const [label, name, overrides] of cases) {
    const css = bundleCss(AGGREGATOR, overrides)
    const { failures } = await checkParity(page, css)
    const real = failures.filter((f) => !KNOWN.has(f.name))
    const pass = name == null ? real.length === 0 : real.some((f) => f.name === name)
    console.log(`${pass ? '✓' : '✗'} ${name == null ? '該綠' : '該紅'}:${label}${name ? `(要指名 ${name})` : ''} —— 實得 ${real.length} 筆不相等${real.length ? `:${[...new Set(real.map((f) => f.name))].join(' / ')}` : ''}`)
    if (!pass) ok = false
  }
  console.log(ok ? '✓ 對照組:注入的缺陷各自紅且指名、現況綠(儀器有效)' : '✗ 對照組有一條沒照預期 —— 儀器無效')
  return ok
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const browser = await launchBrowserOrSkip({}, { hint: '這支只需要 Chromium,不需要 storybook 建置' })
  const page = await browser.newPage()
  let code = 0
  try {
    if (process.argv.includes('--selftest')) code = (await selftest(page)) ? 0 : 1
    else code = report(await checkParity(page, bundleCss(AGGREGATOR))) ? 1 : 0
  } catch (e) {
    console.error(`✗ INSTRUMENT-FAIL ${String(e?.message ?? e).split('\n')[0]}`)
    code = 1
  } finally {
    await browser.close()
  }
  process.exit(code)
}
