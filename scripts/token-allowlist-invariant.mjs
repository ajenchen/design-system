#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 每一類 token 的允許集合只有一個來源 —— 該類規格裡框起來的那一段(scripts/lib/token-allow-sets.mjs 讀);
 *         寫入當下的 hook 讀的 utility-registry.json、隨 npm 出貨的 fork 副本、CSS 宣告、Tailwind 預設刻度都跟它一致,
 *         「其他不准用」由 registry 的擋法真的擋得到來證明(不是靠名單寫得像)。
 *         user 2026-11-15:「確保ssot 難道不是我們的 token 變成只有sm(2px),md(4px),lg(8px)和full,然後其他不准用？」
 *         「所有要用 token的地方在用的時候本來就要動腦想怎樣才符合ds的SSOT」
 *   紅: T1 某一類規格框起來的允許集合 ≠ utility-registry.json 該類的 allow(多一個、少一個都紅,指名)。
 *       T2 允許的名字產生不出來:DS 的 CSS 沒有 `@utility <名>`、也沒有對應的主題變數(DS 或 Tailwind 預設)——
 *          照寫會靜默失效(錨:hook 修正提示叫人改用不存在的 text-helper / text-label);
 *          圓角另驗 radius.css 的 `--radius-*` 宣告逐名逐值等於 radius.spec.md「四檔」。
 *       T3 Tailwind 預設刻度(node_modules/tailwindcss/theme.css 的 --radius-* / --shadow-* / --text-* / --font-weight-* /
 *          --leading-* / --tracking-*)裡不在允許集合的名字,用 hook 同一支比對引擎跑,沒有任何 block 規則擋得到 → 紅
 *         (錨:rounded-4xl、shadow-xs、leading-tight、tracking-normal 2026-11-15 前都放行)。
 *       T4 允許的名字被 registry 的 block 規則擋到(允許與禁止互相矛盾)。
 *       T5 原料色相:tokens/color/primitives.css 的色相 ∪ Tailwind 預設色相,寫成 bg- / text- / border-<色相>-6 沒被擋;
 *          或 hooks/lib/_token_hygiene.sh 的原料色相清單少了 primitives.css 的色相(錨:magenta / turquoise 兩道都放行)。
 *       T6 隨 npm 出貨的副本 ds-canonical/fork/references/utility-registry(.schema).json 與正本不是逐位元組相同
 *          (副本由 governance:generate 產生;落後 = WM 升版拿到的是舊規則)。
 *       → 指名類別 / 名字,exit 1。
 *   綠: T1–T6 都 0 筆。只讀規格、registry、CSS 與 Tailwind 主題檔,比對引擎是 hook 本身那段 Python,沒有時序或抽樣,
 *       同一棵樹重跑結果相同;不是抽籤的證明 = 改動前的 registry(35508c15)跑出 T1 1 筆、T3 9 個名字、T5 14 個色相。
 *   儀器失效(exit 2,印 INSTRUMENT-FAIL): 讀不到規格的框 / 讀不懂判定詞、讀不到 Tailwind 預設主題、從 hook 抽不出比對引擎、
 *       引擎跑不起來或回傳形狀不對 —— 不讀成通過。
 *   `--selftest`: 現況輸入(fork 換成正本)必綠;十種破法各自指名紅(registry 多放行 rounded-xs / 規格少一列(T1、T2 各一面)/ radius.css 值改 4px /
 *       block 拿掉 rounded-4xl / 允許的 rounded-md 被塞進 block / 規格與 registry 一起加不存在的 text-helper /
 *       primitive 色相拿掉 magenta / _token_hygiene 色相拿掉 lime / fork 副本差一個字)。
 *   純讀檔 + 一次次呼叫 python3 跑 hook 的引擎,不開瀏覽器、不量時間。
 *
 * 比對引擎:直接從 packages/design-system/ds-canonical/hooks/check_opacity_token_usage.sh 抽出 `<<'PY' … PY` 那一段 Python 執行
 * —— 跟寫入當下擋人的是同一份程式碼,不另寫一份(M17;兩份平行實作必然漂移)。
 *
 * 用法:node scripts/token-allowlist-invariant.mjs [--selftest]
 */
import { spawnSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALLOW_SET_SOURCES, AllowSetError, parseRadiusPassthrough, parseRadiusScale, specAllowSet } from './lib/token-allow-sets.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const PATHS = Object.freeze({
  registry: 'packages/design-system/src/tokens/utility-registry.json',
  schema: 'packages/design-system/src/tokens/utility-registry.schema.json',
  forkRegistry: 'packages/design-system/ds-canonical/fork/references/utility-registry.json',
  forkSchema: 'packages/design-system/ds-canonical/fork/references/utility-registry.schema.json',
  hook: 'packages/design-system/ds-canonical/hooks/check_opacity_token_usage.sh',
  hygiene: 'packages/design-system/ds-canonical/hooks/lib/_token_hygiene.sh',
  radiusCss: 'packages/design-system/src/tokens/radius/radius.css',
  primitives: 'packages/design-system/src/tokens/color/primitives.css',
  tailwindTheme: 'node_modules/tailwindcss/theme.css',
  cssRoot: 'packages/design-system/src',
})
const OWNER = 'packages/design-system/src/tokens/utility-registry.json'

class InstrumentError extends Error {}

// ── 引擎:hook 裡那一段 Python ─────────────────────────────────────────────────────────────
export function extractEngine(hookText) {
  const m = hookText.match(/python3 - "\$REGISTRY" "\$CANONICAL_REGISTRY_OWNER" 3<<<"\$NEW_CONTENT" <<'PY'\n([\s\S]*?)\nPY\n/)
  if (!m) throw new InstrumentError(`${PATHS.hook}:抽不出 <<'PY' … PY 的比對引擎(hook 改了寫法 → 這支要跟著改,不是放行)`)
  return m[1]
}

/** 用 hook 的引擎掃一段文字;回 { block: [{id,label,hits}], warn: [...] }。registryText 寫到暫存檔再傳路徑(引擎只收路徑)。 */
export function makeEngine(engineCode) {
  const dir = mkdtempSync(join(tmpdir(), 'token-allowlist-'))
  let n = 0
  return (registryText, content) => {
    n += 1
    const reg = join(dir, `registry-${n}.json`)
    const txt = join(dir, `content-${n}.txt`)
    writeFileSync(reg, registryText)
    writeFileSync(txt, content)
    const fd = openSync(txt, 'r')
    let r
    try {
      r = spawnSync('python3', ['-c', engineCode, reg, OWNER], { stdio: ['ignore', 'pipe', 'pipe', fd], encoding: 'utf8' })
    } finally { closeSync(fd) }
    if (r.status !== 0) throw new InstrumentError(`比對引擎失敗(exit ${r.status}):${(r.stderr || r.error?.message || '').trim().split('\n').slice(-1)[0]}`)
    let out
    try { out = JSON.parse(r.stdout) } catch { throw new InstrumentError(`比對引擎回傳不是 JSON:${r.stdout.slice(0, 120)}`) }
    if (!out || !Array.isArray(out.block) || !Array.isArray(out.warn)) throw new InstrumentError('比對引擎回傳形狀不對(要 { block: [], warn: [] })')
    return out
  }
}

// ── 讀主題變數 / CSS ─────────────────────────────────────────────────────────────────────────
/** Tailwind 預設主題某個命名空間的名字(--<ns>-<名>:)。 */
export function themeNames(themeText, ns) {
  const out = []
  for (const m of themeText.matchAll(new RegExp(`--${ns}-([a-z0-9]+):`, 'g'))) if (!out.includes(m[1])) out.push(m[1])
  return out
}
/** 色相:--color-<色相>-<數字>: */
export function colorHues(cssText) {
  const out = []
  for (const m of cssText.matchAll(/--color-([a-z]+(?:-[a-z]+)*)-[0-9]+:/g)) if (!out.includes(m[1])) out.push(m[1])
  return out
}
/** radius.css 的 @theme 宣告 → Map(名字 → 值字串) */
export function radiusDecls(cssText) {
  const out = new Map()
  for (const m of cssText.matchAll(/(--radius-[a-z0-9]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim())
  return out
}

/** 一個允許的 class 產生得出來嗎(DS 的 @utility / 主題變數,或 Tailwind 預設主題變數 / 靜態數字)。 */
function resolvable(cls, { dsCss, themeText }) {
  if (/^rounded-\[[a-z]+\]$/.test(cls)) return true // passthrough(inherit 等關鍵字)
  const v = cls.match(/^shadow-\[var\((--[a-z0-9-]+)\)\]$/)
  if (v) return new RegExp(`${v[1]}\\s*:`).test(dsCss)
  if (new RegExp(`@utility ${cls.replace(/[-]/g, '\\-')}\\s*\\{`).test(dsCss)) return true
  const ns = [['rounded-', 'radius-'], ['text-', 'text-'], ['font-', 'font-weight-'], ['leading-', 'leading-'], ['tracking-', 'tracking-']]
  for (const [prefix, theme] of ns) {
    if (!cls.startsWith(prefix)) continue
    const name = `--${theme}${cls.slice(prefix.length)}`
    if (new RegExp(`${name}\\s*:`).test(dsCss) || new RegExp(`${name}\\s*:`).test(themeText)) return true
  }
  if (/^opacity-(?:0|100)$/.test(cls)) return true // Tailwind 靜態數字 utility
  return false
}

/** 從 _token_hygiene.sh 的 PRIMITIVE_PATTERN 抽出色相清單 */
export function hygieneHues(text) {
  const m = text.match(/PRIMITIVE_PATTERN='[^']*?-\(([a-z|-]+)\)-\[0-9\]\+/)
  if (!m) throw new InstrumentError(`${PATHS.hygiene}:讀不到 PRIMITIVE_PATTERN 的色相清單`)
  return m[1].split('|')
}

// ── 判定(純函式;輸入都是文字,selftest 直接餵改過的版本)─────────────────────────────────────
export function check(input, engine) {
  const P = { T1: [], T2: [], T3: [], T4: [], T5: [], T6: [] }
  let registry
  try { registry = JSON.parse(input.registryText) } catch (e) { throw new InstrumentError(`${PATHS.registry} 不是 JSON:${e.message}`) }
  const dsCss = input.dsCss
  const allowOf = (cat) => {
    const a = registry?.[cat]?.allow
    if (!Array.isArray(a)) throw new InstrumentError(`${PATHS.registry} 沒有 ${cat}.allow`)
    return a
  }

  // T1 規格 ↔ registry
  const allows = {}
  for (const cat of Object.keys(ALLOW_SET_SOURCES)) {
    const spec = specAllowSet(cat, input.specs[ALLOW_SET_SOURCES[cat].spec])
    const reg = allowOf(cat)
    allows[cat] = spec
    const extra = reg.filter((x) => !spec.includes(x))
    const missing = spec.filter((x) => !reg.includes(x))
    if (extra.length) P.T1.push(`${cat}:utility-registry 放行了規格沒有的 ${extra.join('、')} —— 允許集合的唯一來源是 ${ALLOW_SET_SOURCES[cat].spec} 框起來那一段;要用就先改規格,不用就從 registry 拿掉`)
    if (missing.length) P.T1.push(`${cat}:規格允許的 ${missing.join('、')} 不在 utility-registry 的 ${cat}.allow`)
  }

  // T2 允許的名字產生得出來 + 圓角宣告逐名逐值
  for (const [cat, list] of Object.entries(allows)) {
    for (const cls of list) if (!resolvable(cls, { dsCss, themeText: input.themeText })) P.T2.push(`${cat}:允許的 ${cls} 產生不出來(DS 的 CSS 沒有 @utility ${cls}、也沒有對應的主題變數)—— 照寫會靜默失效`)
  }
  const scale = parseRadiusScale(input.specs[ALLOW_SET_SOURCES.radius.spec])
  const decls = radiusDecls(input.radiusCss)
  for (const row of scale) {
    const got = decls.get(row.token)
    if (got === undefined) P.T2.push(`radius:radius.spec.md「四檔」有 ${row.token}(${row.px}px),${PATHS.radiusCss} 沒有宣告`)
    else if (got !== `${row.px}px` && !(row.px === 9999 && got === '9999px')) P.T2.push(`radius:${row.token} 規格是 ${row.px}px,${PATHS.radiusCss} 寫 ${got}`)
  }
  for (const name of decls.keys()) if (!scale.some((r) => r.token === name)) P.T2.push(`radius:${PATHS.radiusCss} 宣告了 ${name},radius.spec.md「四檔」沒有這一檔 —— 不在表上的名字不准存在`)

  // T3 / T4 用 hook 的引擎
  const NS = [['radius', 'rounded-', 'radius'], ['elevation', 'shadow-', 'shadow'], ['typography', 'text-', 'text'], ['typography', 'font-', 'font-weight'], ['typography', 'leading-', 'leading'], ['typography', 'tracking-', 'tracking']]
  const candidates = []
  for (const [cat, prefix, ns] of NS) {
    const names = themeNames(input.themeText, ns)
    if (!names.length) throw new InstrumentError(`${PATHS.tailwindTheme}:讀不到任何 --${ns}-* —— Tailwind 主題換了寫法,這支要跟著改`)
    for (const n of names) {
      const cls = `${prefix}${n}`
      if (!allows[cat].includes(cls)) candidates.push({ cat, cls })
    }
  }
  const blockedSet = (classes) => {
    const out = engine(input.registryText, classes.map((c) => `<div className="${c}" />`).join('\n'))
    const hits = new Set(out.block.flatMap((r) => r.hits))
    return hits
  }
  const hit3 = blockedSet(candidates.map((c) => c.cls))
  for (const c of candidates) if (!hit3.has(c.cls)) P.T3.push(`${c.cat}:Tailwind 預設的 ${c.cls} 不在允許集合,utility-registry 也沒有任何 block 規則擋得到 —— 照寫會拿到 Tailwind 的值、不歸設計系統管(加進該類 block 清單)`)
  const allAllowed = Object.values(allows).flat()
  for (const cls of allAllowed) {
    const out = engine(input.registryText, `<div className="${cls}" />`)
    const by = out.block.filter((r) => r.hits.includes(cls)).map((r) => r.id)
    if (by.length) P.T4.push(`允許的 ${cls} 被 registry 的 block 規則 ${by.join('、')} 擋下 —— 允許與禁止互相矛盾`)
  }

  // T5 原料色相
  const dsHues = colorHues(input.primitivesText)
  const twHues = colorHues(input.themeText)
  if (!dsHues.length) throw new InstrumentError(`${PATHS.primitives}:讀不到任何 --color-<色相>-<數字>`)
  if (!twHues.length) throw new InstrumentError(`${PATHS.tailwindTheme}:讀不到任何 --color-<色相>-<數字>`)
  const hues = [...new Set([...dsHues, ...twHues])]
  const huesClasses = hues.flatMap((h) => ['bg', 'text', 'border'].map((p) => `${p}-${h}-6`))
  const hit5 = blockedSet(huesClasses)
  const leak = huesClasses.filter((c) => !hit5.has(c))
  if (leak.length) P.T5.push(`原料色相當 utility 沒被 utility-registry 擋:${leak.join('、')} —— 補進 enforcement primitive-color-family 的色相(色相 ⊇ ${PATHS.primitives} ∪ Tailwind 預設)`)
  const hyg = hygieneHues(input.hygieneText)
  const hygMissing = dsHues.filter((h) => !hyg.includes(h))
  if (hygMissing.length) P.T5.push(`${PATHS.hygiene} 的 PRIMITIVE_PATTERN 少了 ${PATHS.primitives} 的色相 ${hygMissing.join('、')}`)

  // T6 fork 副本
  if (input.forkRegistryText !== input.registryText) P.T6.push(`${PATHS.forkRegistry} 與正本 ${PATHS.registry} 不同 —— 副本由 npm run governance:generate 產生(不手改),跑完再驗`)
  if (input.forkSchemaText !== input.schemaText) P.T6.push(`${PATHS.forkSchema} 與正本 ${PATHS.schema} 不同 —— 同上`)
  return { problems: P, info: { allows, candidates: candidates.length, hues: hues.length } }
}

// ── 讀現況 ─────────────────────────────────────────────────────────────────────────────────
function readRel(p) { return readFileSync(join(ROOT, p), 'utf8') }
function allCss(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') allCss(p, acc) } else if (e.name.endsWith('.css')) acc.push(readFileSync(p, 'utf8'))
  }
  return acc
}
export function readInputs() {
  const specs = {}
  for (const src of Object.values(ALLOW_SET_SOURCES)) specs[src.spec] = readRel(src.spec)
  let themeText
  try { themeText = readRel(PATHS.tailwindTheme) } catch { throw new InstrumentError(`讀不到 ${PATHS.tailwindTheme}(先 npm ci)`) }
  return {
    specs,
    registryText: readRel(PATHS.registry),
    schemaText: readRel(PATHS.schema),
    forkRegistryText: readRel(PATHS.forkRegistry),
    forkSchemaText: readRel(PATHS.forkSchema),
    radiusCss: readRel(PATHS.radiusCss),
    primitivesText: readRel(PATHS.primitives),
    hygieneText: readRel(PATHS.hygiene),
    dsCss: allCss(join(ROOT, PATHS.cssRoot)).join('\n'),
    themeText,
  }
}

const LABEL = {
  T1: 'T1 規格框起來的允許集合 = utility-registry 的 allow',
  T2: 'T2 允許的名字產生得出來;radius.css 宣告 = radius.spec.md「四檔」',
  T3: 'T3 Tailwind 預設名字不在允許集合 → 一定被 registry 擋',
  T4: 'T4 允許的名字不被 block 規則擋',
  T5: 'T5 原料色相全部被擋(registry 與 _token_hygiene)',
  T6: 'T6 fork 副本與正本逐位元組相同',
}

function report({ problems, info }) {
  let n = 0
  for (const [k, list] of Object.entries(problems)) {
    if (!list.length) { console.log(`✓ ${LABEL[k]}`); continue }
    n += list.length
    console.log(`✗ ${LABEL[k]}(${list.length})`)
    for (const p of list) console.log(`   - ${p}`)
  }
  console.log(`(允許集合:${Object.entries(info.allows).map(([k, v]) => `${k} ${v.length}`).join(' / ')};Tailwind 預設名字待擋 ${info.candidates} 個;色相 ${info.hues} 個)`)
  return n
}

// ── 對照組 ─────────────────────────────────────────────────────────────────────────────────
function selftest(engine) {
  const base = readInputs()
  base.forkRegistryText = base.registryText
  base.forkSchemaText = base.schemaText
  const failures = []
  const run = (over) => check({ ...base, ...over, specs: { ...base.specs, ...(over.specs ?? {}) } }, engine)
  const reg = () => JSON.parse(base.registryText)
  const regText = (mut) => { const r = reg(); mut(r); return JSON.stringify(r, null, 2) }
  const RSPEC = ALLOW_SET_SOURCES.radius.spec
  const TSPEC = ALLOW_SET_SOURCES.typography.spec
  const green = run({})
  const greenCount = Object.values(green.problems).flat().length
  if (greenCount) failures.push(`現況(fork 換成正本)應該綠,實得 ${greenCount} 筆:${Object.values(green.problems).flat().slice(0, 3).join(' | ')}`)
  const cases = [
    ['T1', 'rounded-xs', 'registry 多放行 rounded-xs', { registryText: regText((r) => { r.radius.allow.push('rounded-xs'); r.radius.block.out_of_range = r.radius.block.out_of_range.filter((x) => x !== 'rounded-xs') }) }],
    ['T1', 'rounded-sm', '規格「四檔」少了 sm 那一列(registry 照舊放行)', { specs: { [RSPEC]: base.specs[RSPEC].replace(/\n\| `rounded-sm` [^\n]*/, '') } }],
    ['T2', '--radius-sm', '規格「四檔」少了 sm 那一列(radius.css 照舊宣告)', { specs: { [RSPEC]: base.specs[RSPEC].replace(/\n\| `rounded-sm` [^\n]*/, '') } }],
    ['T2', '--radius-sm', 'radius.css 把 sm 寫回 4px', { radiusCss: base.radiusCss.replace(/--radius-sm:\s*2px/, '--radius-sm: 4px') }],
    ['T3', 'rounded-4xl', 'block 拿掉 rounded-4xl', { registryText: regText((r) => { r.radius.block.out_of_range = r.radius.block.out_of_range.filter((x) => x !== 'rounded-4xl') }) }],
    ['T4', 'rounded-md', '允許的 rounded-md 被塞進 block', { registryText: regText((r) => { r.radius.block.out_of_range.push('rounded-md') }) }],
    ['T2', 'text-helper', '規格與 registry 一起加不存在的 text-helper', {
      specs: { [TSPEC]: base.specs[TSPEC].replace('<!-- typography-allow-size:end -->', '| `text-helper` | 12px | 1.3 | 假的 |\n<!-- typography-allow-size:end -->') },
      registryText: regText((r) => { r.typography.allow.push('text-helper') }),
    }],
    ['T5', 'bg-magenta-6', 'primitive 色相拿掉 magenta', { registryText: regText((r) => { const rule = r.enforcement.block.find((x) => x.id === 'primitive-color-family'); rule.pattern = rule.pattern.replace('|magenta', '') }) }],
    ['T5', 'lime', '_token_hygiene 色相拿掉 lime', { hygieneText: base.hygieneText.replace('|lime', '') }],
    ['T6', 'utility-registry.json', 'fork 副本差一個字', { forkRegistryText: `${base.registryText} ` }],
  ]
  for (const [key, needle, what, over] of cases) {
    let res
    try { res = run(over) } catch (e) { failures.push(`[${what}] 丟例外 ${e.message}`); continue }
    const hit = res.problems[key].some((p) => p.includes(needle))
    if (!hit) failures.push(`[${what}] 應該 ${key} 紅並指名 ${needle},實得 ${JSON.stringify(res.problems[key]).slice(0, 200)}`)
    else console.log(`  ✓ ${what} → ${key} 紅(指名 ${needle})`)
  }
  // 讀不懂 = 儀器失效,不是放行
  for (const [what, over] of [
    ['規格的「四檔」框被拿掉', { specs: { [RSPEC]: base.specs[RSPEC].replace('<!-- radius-scale:start -->', '') } }],
    ['判定詞「浮層外殼」被改掉', { specs: { [RSPEC]: base.specs[RSPEC].replace('| 浮層外殼(Tooltip 除外) |', '| 浮起來的 |') } }],
  ]) {
    try { run(over); failures.push(`[${what}] 應該丟儀器失效,實得正常回傳`) } catch (e) {
      if (e instanceof AllowSetError || e instanceof InstrumentError) console.log(`  ✓ ${what} → 儀器失效(${e.message.slice(0, 60)}…)`)
      else failures.push(`[${what}] 丟了非預期例外 ${e.message}`)
    }
  }
  if (failures.length) { console.log('✗ token-allowlist selftest'); for (const f of failures) console.log(`   - ${f}`); return 1 }
  console.log('✓ token-allowlist selftest:現況綠;十種破法各自指名紅;框不見 / 判定詞讀不懂 = 儀器失效')
  return 0
}

function main() {
  let engine
  try {
    engine = makeEngine(extractEngine(readRel(PATHS.hook)))
    if (process.argv.includes('--selftest')) process.exit(selftest(engine))
    const n = report(check(readInputs(), engine))
    if (n) { console.log(`\n✗ token 允許集合不一致 ${n} 筆`); process.exit(1) }
    console.log('\n✓ token 允許集合:規格 = registry = fork 副本 = CSS;Tailwind 預設名字全部被擋')
  } catch (e) {
    if (e instanceof InstrumentError || e instanceof AllowSetError) { console.log(`✗ INSTRUMENT-FAIL ${e.message}`); process.exit(2) }
    throw e
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
