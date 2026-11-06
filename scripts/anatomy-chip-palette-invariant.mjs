#!/usr/bin/env node
/**
 * 結構圖色塊:同一列裡**不同的色名**,畫出來必須是**不同的顏色**。
 *
 * 為什麼要這支(2026-10-21,r1b fields 複驗 D2):Combobox 設計規格「元件總覽」結構圖補上「搜尋框(searchIn='trigger')」色塊時用了 `primary`,
 * 理由寫「這張圖沒用過的顏色」—— 但 semantic.css 的 `--primary` 與 `--info` 都是 `--color-blue-6`(`-subtle` 都是 `--color-blue-1`),
 * 畫出來與同一列的 chevron(`info`)一模一樣,讀者分不出兩個零件。換了名字不等於換了顏色(M37:拿「名字不同」當「顏色不同」的代理)。
 *
 * 判準:packages/design-system/src 底下 *.stories.tsx 裡,用 `.map(...)` 畫成色塊、而且 callback 以 `var(--${x.color}…)` 取色的陣列 = 一列;
 * 每一項是 `{ name, color }`,或 `{ name, hue }`(categorical 色相,callback 經 tokens/categorical-color.ts 的 CAT_SUBTLE_TOKENS 取色)。
 * 每一項照 callback 實際用到的 token(`var(--${x.color})`、`var(--${x.color}-subtle)`…;hue 取 CAT_SUBTLE_TOKENS 的 text / bg)
 * 在 semantic.css + primitives.css 裡展開到底(淺色 = `:root` 各段;深色 = 再疊 `[data-theme="dark"]`)後比較:
 *   - 色名(或色相)不同、淺色或深色任一個展開結果相同 → 紅(作者用了兩個名字,畫面上只有一個顏色)
 *   - 同一個色名重複(例:兩個 Tag 都是 error)→ 不判(刻意同色)
 *   - callback 自己特判的色名(例:`s.color === 'neutral' ? 'var(--border)' : …`)→ 該名自成一色
 *   - token 檔裡沒定義的色名 → 畫面上 var() 失效(字色、框色照繼承,底透明),兩個不同的未定義色名彼此算同色 —— 畫出來確實一樣
 * 量不了的寫法(色名不是字面字串、hue 列的 callback 沒經 CAT_SUBTLE_TOKENS)→ 儀器失效,exit 2,不是通過。
 *
 * @gate-contract
 *   保證: 結構圖同一列裡,作者用不同色名(或色相)標的零件,畫出來的字色與底色真的不同(淺色、深色都是)
 *   紅: 任一列有兩個不同色名在淺色或深色展開成同一組顏色 → 指名檔案:行號、兩個色名與展開結果,exit 1;
 *       複驗前的 combobox.anatomy.stories.tsx「搜尋框(primary)」vs「chevron(info)」紅
 *   綠: 每一列的不同色名都展開成不同的顏色;--selftest 的對照組(以 cases 為準:primary 對 info 紅 / 色相對 info 綠 / 同名重複綠 /
 *       兩個未定義色名紅 / callback 特判的色名對未定義色名綠 / 不經 var(--${x.color}) 取色的陣列不判)每次都跑,
 *       並要求這一趟至少讀到 MIN_ROWS 列色塊(量具真的在讀,不是空掃)
 *
 * 用法:node scripts/anatomy-chip-palette-invariant.mjs [--selftest]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'packages/design-system/src')
const TOKEN_CSS = ['tokens/color/primitives.css', 'tokens/color/semantic.css'].map((p) => join(SRC, p))
const CATEGORICAL_TS = join(SRC, 'tokens/categorical-color.ts')
const MIN_ROWS = 15

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p, out) } else if (e.endsWith('.stories.tsx')) out.push(p)
  }
  return out
}

/** primitives.css + semantic.css → 淺色 / 深色兩張「--token → 原始值」表(`@theme` / `@utility` 不是 token 宣告,略過) */
export function parseTokenThemes(cssSources) {
  const light = new Map()
  const darkOnly = new Map()
  for (const css of cssSources) {
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim()
      if (selector.startsWith('@')) continue
      const target = /\[data-theme="dark"\]/.test(selector) ? darkOnly : /^:root\b/.test(selector) ? light : null
      if (!target) continue
      for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) target.set(d[1], d[2].trim())
    }
  }
  return { light, dark: new Map([...light, ...darkOnly]) }
}

/** 把值裡的 var(--x) 一路展開;沒定義的 token → UNRESOLVED(畫面上該屬性失效) */
export function expand(value, table, depth = 0) {
  if (depth > 20) return 'CYCLE'
  return value.replace(/var\((--[\w-]+)\)/g, (_, name) => (table.has(name) ? expand(table.get(name), table, depth + 1) : 'UNRESOLVED'))
}

/** CAT_SUBTLE_TOKENS(categorical 淡底配對)→ { hue: { bg, text } } */
export function parseCatSubtle(tsSource) {
  const block = tsSource.match(/export const CAT_SUBTLE_TOKENS[^=]*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  const out = {}
  for (const m of block.matchAll(/'?([\w-]+)'?\s*:\s*\{\s*bg:\s*'([^']+)'\s*,\s*text:\s*'([^']+)'\s*\}/g)) out[m[1]] = { bg: m[2], text: m[3] }
  return out
}

const unwrap = (n) => { while (n && (ts.isAsExpression(n) || ts.isParenthesizedExpression(n) || ts.isSatisfiesExpression(n))) n = n.expression; return n }
const literal = (n) => { n = unwrap(n); return n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null }
const prop = (obj, key) => obj.properties.find((p) => ts.isPropertyAssignment(p) && p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === key)

/**
 * 一支檔裡的色塊列。回傳 { rows, bad, blind }:rows = 讀到的列數;bad = 不同色名同色;blind = 量不了的寫法(儀器失效)
 */
export function checkSource(file, source, themes, catSubtle) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const bad = []
  const blind = []
  let rows = 0
  const at = (n) => `${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'map') {
      const arr = unwrap(node.expression.expression)
      const cb = node.arguments[0]
      const cbText = cb ? cb.getText(sf) : ''
      const suffixes = [...new Set([...cbText.matchAll(/var\(--\$\{\s*\w+\.color\s*\}([\w-]*)\)/g)].map((m) => m[1]))]
      if (arr && ts.isArrayLiteralExpression(arr) && suffixes.length) {
        rows += 1
        const special = new Set([...cbText.matchAll(/\.color\s*===\s*'([\w-]+)'/g)].map((m) => m[1]))
        const viaCat = /CAT_SUBTLE_TOKENS\s*\[/.test(cbText)
        const items = []
        for (const el of arr.elements) {
          const obj = unwrap(el)
          if (!obj || !ts.isObjectLiteralExpression(obj)) { blind.push(`${at(el)} 色塊項不是物件字面值`); continue }
          const name = literal(prop(obj, 'name')?.initializer) ?? '(無名)'
          const color = literal(prop(obj, 'color')?.initializer)
          const hue = literal(prop(obj, 'hue')?.initializer)
          if (hue) {
            if (!viaCat || !catSubtle[hue]) { blind.push(`${at(el)} 「${name}」的 hue '${hue}' 量不了(callback 沒經 CAT_SUBTLE_TOKENS 取色,或色相不在 CAT_SUBTLE_TOKENS)`); continue }
            const key = (t) => `fg=${expand(catSubtle[hue].text, t)} bg=${expand(catSubtle[hue].bg, t)}`
            items.push({ el, name, id: `hue:${hue}`, light: key(themes.light), dark: key(themes.dark) })
          } else if (color) {
            if (special.has(color)) { items.push({ el, name, id: `color:${color}`, light: `special:${color}`, dark: `special:${color}` }); continue }
            const key = (t) => suffixes.map((s) => `${s || 'base'}=${expand(`var(--${color}${s})`, t)}`).join(' ')
            items.push({ el, name, id: `color:${color}`, light: key(themes.light), dark: key(themes.dark) })
          } else {
            blind.push(`${at(el)} 「${name}」沒有字面的 color / hue`)
          }
        }
        for (let i = 0; i < items.length; i += 1) {
          for (let j = i + 1; j < items.length; j += 1) {
            const a = items[i]
            const b = items[j]
            if (a.id === b.id) continue
            const theme = a.light === b.light ? '淺色' : a.dark === b.dark ? '深色' : null
            if (theme) bad.push(`${at(b.el)} 「${b.name}」(${b.id})與「${a.name}」(${a.id})在${theme}畫成同一個顏色:${theme === '淺色' ? a.light : a.dark}`)
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { rows, bad, blind }
}

function loadInputs() {
  return {
    themes: parseTokenThemes(TOKEN_CSS.map((p) => readFileSync(p, 'utf8'))),
    catSubtle: parseCatSubtle(readFileSync(CATEGORICAL_TS, 'utf8')),
  }
}

function selftest() {
  const { themes, catSubtle } = loadInputs()
  const head = "import { CAT_SUBTLE_TOKENS } from '@/design-system/tokens/categorical-color'\n"
  const row = (items, cb = '(s) => <span style={{ borderColor: `var(--${s.color})`, backgroundColor: `var(--${s.color}-subtle)`, color: `var(--${s.color})` }}>{s.name}</span>') =>
    `${head}export const X = () => <div>{[${items}].map(${cb})}</div>\n`
  const catCb = '(s) => { const fg = s.hue ? CAT_SUBTLE_TOKENS[s.hue].text : `var(--${s.color})`; const bg = s.hue ? CAT_SUBTLE_TOKENS[s.hue].bg : `var(--${s.color}-subtle)`; return <span style={{ borderColor: fg, backgroundColor: bg, color: fg }}>{s.name}</span> }'
  const neutralCb = "(s) => <span style={{ color: s.color === 'neutral' ? 'var(--fg-muted)' : `var(--${s.color})`, backgroundColor: s.color === 'neutral' ? 'var(--neutral-hover)' : `var(--${s.color}-subtle)` }}>{s.name}</span>"
  const cases = [
    { why: 'primary 與 info 是同一個藍(複驗 D2 的形狀)→ 必須紅', src: row("{ name: '搜尋框', color: 'primary' }, { name: 'chevron', color: 'info' }"), expectBad: true },
    { why: 'categorical 色相(CAT_SUBTLE_TOKENS)對 info → 綠', src: row("{ name: '搜尋框', hue: 'purple' as const }, { name: 'chevron', color: 'info' }", catCb), expectBad: false },
    { why: '同一個色名重複(兩個 Tag 都是 error)= 刻意同色 → 綠', src: row("{ name: 'Tag', color: 'error' }, { name: 'Tag', color: 'error' }, { name: '+N', color: 'warning' }"), expectBad: false },
    { why: '兩個不同的未定義色名(var() 都失效、畫出來一樣)→ 必須紅', src: row("{ name: 'clear', color: 'zz-missing-a' }, { name: 'chevron', color: 'zz-missing-b' }"), expectBad: true },
    { why: 'callback 特判的色名(neutral)自成一色,對未定義色名 → 綠', src: row("{ name: 'Label', color: 'neutral' }, { name: 'clear', color: 'zz-missing-a' }", neutralCb), expectBad: false },
    { why: '不經 var(--${x.color}) 取色的陣列(人員資料)→ 不判', src: `export const X = () => <div>{[{ name: 'Ada', color: 'primary' }, { name: 'Ben', color: 'info' }].map((p) => <span key={p.name}>{p.name}</span>)}</div>\n`, expectBad: false, expectRows: 0 },
  ]
  let ok = true
  for (const c of cases) {
    const r = checkSource('selftest.stories.tsx', c.src, themes, catSubtle)
    const got = r.bad.length > 0
    const rowsOk = c.expectRows === undefined ? r.rows === 1 : r.rows === c.expectRows
    const pass = got === c.expectBad && rowsOk && r.blind.length === 0
    if (!pass) ok = false
    console.log(`${pass ? '✓' : '✗'} 對照組:${c.why}(預期${c.expectBad ? '紅' : '綠'},實得${got ? '紅' : '綠'};讀到 ${r.rows} 列${r.blind.length ? `;量不了 ${r.blind.length}` : ''})`)
  }
  const blindCase = checkSource('selftest.stories.tsx', row("{ name: '搜尋框', hue: 'purple' as const }, { name: 'chevron', color: 'info' }"), themes, catSubtle)
  const blindOk = blindCase.blind.length > 0
  if (!blindOk) ok = false
  console.log(`${blindOk ? '✓' : '✗'} 對照組:hue 列的 callback 沒經 CAT_SUBTLE_TOKENS → 量不了(儀器失效,不是通過)`)
  return ok
}

function main() {
  const { themes, catSubtle } = loadInputs()
  if (!themes.light.has('--info') || Object.keys(catSubtle).length === 0) {
    console.error('✗ anatomy-chip-palette:讀不到 token 表(semantic.css --info / CAT_SUBTLE_TOKENS)—— 儀器失效,不是通過')
    return 2
  }
  let rows = 0
  const bad = []
  const blind = []
  for (const file of walk(SRC)) {
    const r = checkSource(relative(ROOT, file), readFileSync(file, 'utf8'), themes, catSubtle)
    rows += r.rows
    bad.push(...r.bad)
    blind.push(...r.blind)
  }
  if (blind.length) {
    console.error(`✗ anatomy-chip-palette:${blind.length} 個色塊量不了(儀器失效,不是通過)`)
    for (const b of blind) console.error(`  ${b}`)
    return 2
  }
  if (rows < MIN_ROWS) {
    console.error(`✗ anatomy-chip-palette:只讀到 ${rows} 列色塊(下限 ${MIN_ROWS})—— 量具沒在讀(儀器失效,不是通過)`)
    return 2
  }
  if (bad.length) {
    console.error(`✗ anatomy-chip-palette:${bad.length} 處不同色名畫成同一個顏色(換一個這一列沒用過、展開後真的不同的色;零件分類用 categorical 色相,tokens/categorical-color.ts)`)
    for (const b of bad) console.error(`  ${b}`)
    return 1
  }
  console.log(`✓ anatomy-chip-palette:${rows} 列結構圖色塊,不同色名都畫成不同的顏色(淺色、深色)`)
  return 0
}

if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1)
process.exit(main())
