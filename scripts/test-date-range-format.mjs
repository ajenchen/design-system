#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DatePicker.Range 的 `formatRange`(檢視模式把起訖寫成一段)只有一份判定(packages/design-system/src/components/DatePicker/range-format.ts),
 *        而且照 date-picker.spec.md「區間檢視合併(formatRange)」做:zh-TW / en-US × 同一天有時段 / 跨日全天 / 跨日有時段 / 同一刻 / 一端空
 *        各得規格表寫的那一段字(一端空 = null = 照兩段顯示);只有日期的跨月跨年、有秒、showTime 但兩端都沒時間、只有一端帶時間、
 *        起點晚於終點、Invalid Date、環境沒有 formatRange、consumer 傳 formatOptions(dateStyle 補 timeStyle、其餘補時分、自己寫了時間就不補)
 *        各一格;呼叫端注入的 formatter 工廠真的被用到。
 *        「同一頁日期樣式一致」這條性質直接量:預設選項在 zh-TW / en-US 一批日期上,formatRange 每一端的日期樣式(年月日字 / 斜線、補零、
 *        星期、括號、上下午)都等於單獨 format 起點的樣式。
 *        接線:date-picker.tsx 從 ./range-format import formatDateRange;Range 的 view 分支以 `formatRange ?` 為閘呼叫它、傳
 *        `locale ?? DEFAULT_DATE_LOCALE` 與 `getDateTimeFormatter`,回 null 時仍畫原本的兩段(ArrowRight);`formatRange = false` 是預設。
 *        靜態:range-format.ts 檔頭 10 行內 @internal、帶「── 消費的 SSOT ──」、不 import 任何模組、不開 timeZone;DatePicker/index.ts 不轉出它。
 *   紅: 判定表任一格不符(期望值照規格逐格手寫、非 ASCII 空白寫成 \u 跳脫,不是抄輸出)→ exit 1;樣式性質有任一筆不一致 → exit 1;
 *        靜態或接線任一條不符 → exit 1。
 *        對照組(主判定也跑):同一支樣式檢查換成「兩位數月日」與「dateStyle: 'full'」必須各抓到不一致 —— 抓不到 = 儀器失效(exit 2)。
 *        `--selftest`:range-format.ts 14 個行為突變 + 5 個靜態突變、date-picker.tsx 6 個接線突變,各自必須讓指定的格紅;沒被抓到 → exit 1。
 *   綠: 全部相符時綠。純函式 + 靜態讀檔;無網路、無亂數、無瀏覽器、不讀時鐘(日期一律以本地時間建構),重複跑結果恆等。
 *   儀器失效(exit 2,印 INSTRUMENT-FAIL): esbuild 打包失敗、取不到出口、執行環境沒有 Intl formatRange、對照組抓不到、
 *        突變要改的原始碼片段不是剛好一次、`--selftest` 時未突變的那一份本身不綠。
 *
 * 期望值的來源:Node 24.14.0 / ICU 78.2 / CLDR 48.0(CI 同版)。Node 升級導致 CLDR 字面改變時,這支會紅 —— 那正是要人回頭看的時候。
 *
 * Run: `node scripts/test-date-range-format.mjs`(`--selftest` 只跑對照組)
 */
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = 'packages/design-system/src/components/DatePicker'
const SOURCE_PATH = `${DIR}/range-format.ts`
const PICKER_PATH = `${DIR}/date-picker.tsx`
const SELFTEST = process.argv.includes('--selftest')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const instrumentFail = (msg) => { console.error(`INSTRUMENT-FAIL: ${msg}`); process.exit(2) }
mkdirSync(join(ROOT, 'scripts/.gate-bundles'), { recursive: true })

if (typeof new Intl.DateTimeFormat('zh-TW').formatRange !== 'function') instrumentFail('執行環境沒有 Intl.DateTimeFormat.prototype.formatRange')

// ── 打包:原始碼(或它的突變版)→ esbuild → 固定檔名(scripts/.gate-bundles/README.md:import() 只准字面字串)──────────
async function bundle(file, sources) {
  const entry = sources.map((_, i) => `export * as m${i} from 'range-format-variant:${i}'`).join('\n')
  const result = await build({
    stdin: { contents: entry, resolveDir: join(ROOT, DIR), loader: 'js', sourcefile: 'range-format-variants.js' },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
    plugins: [{
      name: 'range-format-variants',
      setup(b) {
        b.onResolve({ filter: /^range-format-variant:\d+$/ }, (args) => ({ path: args.path.split(':')[1], namespace: 'variant' }))
        b.onLoad({ filter: /.*/, namespace: 'variant' }, (args) => ({ contents: sources[Number(args.path)], loader: 'ts', resolveDir: join(ROOT, DIR) }))
      },
    }],
  }).catch((e) => instrumentFail(`esbuild 打包 range-format.ts 失敗:${e.message}`))
  writeFileSync(join(ROOT, 'scripts/.gate-bundles', file), result.outputFiles[0].text)
}
const EXPORTS = ['formatDateRange', 'resolveDateRangeFormatOptions']
const assertExports = (lib, label) => {
  const missing = EXPORTS.filter((name) => typeof lib?.[name] !== 'function')
  if (missing.length) instrumentFail(`${label} 取不到出口:${missing.join('、')}(出口名稱改了?)`)
  if (!lib.DATE_RANGE_DEFAULT_DATE_OPTIONS) instrumentFail(`${label} 取不到 DATE_RANGE_DEFAULT_DATE_OPTIONS`)
}

// ── 判定表 ────────────────────────────────────────────────────────────────────────────────────────
const d = (y, m, day, h = 0, mi = 0, s = 0) => new Date(y, m - 1, day, h, mi, s)
const THIN = ' ' // ICU 在區間分隔號兩側放的窄空白
const NDASH = '–'
const R = `${THIN}${NDASH}${THIN}`
const nativeFactory = (locale, options) => new Intl.DateTimeFormat(locale, options)
/** 一格的輸入:預設 zh-TW、有時段兩端都帶時間;值以本地時間建構,不經被測的解析 */
const timed = (start, end, extra = {}) => ({ start, end, startHasTime: true, endHasTime: true, showTime: true, showSeconds: false, locale: 'zh-TW', getFormatter: nativeFactory, ...extra })
const dated = (start, end, extra = {}) => ({ start, end, startHasTime: false, endHasTime: false, showTime: false, showSeconds: false, locale: 'zh-TW', getFormatter: nativeFactory, ...extra })
const EN = { locale: 'en-US' }

// [id, 說明, (lib) => 實得, 應得]
const ROWS = [
  // 規格表五種情況 × 兩個語系
  ['T1zh', 'zh-TW 同一天有時段 → 日期只寫一次', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 11))), `2026/7/15 10:00 ${NDASH} 11:00`],
  ['T1en', 'en-US 同一天有時段 → 日期只寫一次', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 11), EN)), `7/15/2026, 10:00${R}11:00`],
  ['T2zh', 'zh-TW 跨日全天 → 兩端數字年月日', (lib) => lib.formatDateRange(dated(d(2026, 7, 15), d(2026, 7, 17))), '2026/7/15至2026/7/17'],
  ['T2en', 'en-US 跨日全天 → 兩端數字年月日', (lib) => lib.formatDateRange(dated(d(2026, 7, 15), d(2026, 7, 17), EN)), `7/15/2026${R}7/17/2026`],
  ['T3zh', 'zh-TW 跨日有時段 → 兩端日期加時間', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 22), d(2026, 7, 16, 1))), `2026/7/15${THIN}22:00${R}2026/7/16${THIN}01:00`],
  ['T3en', 'en-US 跨日有時段 → 兩端日期加時間', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 22), d(2026, 7, 16, 1), EN)), `7/15/2026, 22:00${R}7/16/2026, 01:00`],
  ['T4zh', 'zh-TW 同一刻 → 只寫一個值', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 10))), `2026/7/15${THIN}10:00`],
  ['T4en', 'en-US 同一刻 → 只寫一個值', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 10), EN)), '7/15/2026, 10:00'],
  ['T5zh', 'zh-TW 一端空(沒有結束)→ null = 照兩段顯示', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), undefined)), null],
  ['T5en', 'en-US 一端空(沒有結束)→ null = 照兩段顯示', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), undefined, EN)), null],
  // 其他列
  ['X1', '同一天全天 → 只寫一個日期', (lib) => lib.formatDateRange(dated(d(2026, 7, 15), d(2026, 7, 15))), '2026/7/15'],
  ['X2', '跨月全天', (lib) => lib.formatDateRange(dated(d(2026, 7, 30), d(2026, 8, 2))), '2026/7/30至2026/8/2'],
  ['X3', '跨年全天', (lib) => lib.formatDateRange(dated(d(2026, 12, 30), d(2027, 1, 2))), '2026/12/30至2027/1/2'],
  ['X4', 'showSeconds → 補秒', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10, 0, 5), d(2026, 7, 15, 11, 0, 30), { showSeconds: true })), `2026/7/15 10:00:05${R}11:00:30`],
  ['X5', 'showTime 但兩端都只有日期 → 只寫日期(同兩段顯示不寫 00:00)', (lib) => lib.formatDateRange(dated(d(2026, 7, 15), d(2026, 7, 17), { showTime: true })), '2026/7/15至2026/7/17'],
  ['X6', 'showTime 但只有起點帶時間 → null(合併會吃掉一端的時間)', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 17), { endHasTime: false })), null],
  ['X7', '起點空 → null', (lib) => lib.formatDateRange(timed(undefined, d(2026, 7, 15, 11))), null],
  ['X8', 'Invalid Date → null', (lib) => lib.formatDateRange(timed(new Date(Number.NaN), d(2026, 7, 15, 11))), null],
  ['X9', '起點晚於終點 → null(照兩段原樣)', (lib) => lib.formatDateRange(dated(d(2026, 7, 17), d(2026, 7, 15))), null],
  ['X10', '環境沒有 formatRange → null', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 11), { getFormatter: () => ({ format: () => 'x' }) })), null],
  ['X11', 'consumer dateStyle: full + showTime → 補 timeStyle(語系自己的時間寫法)', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 11), { formatOptions: { dateStyle: 'full' } })), `2026年7月15日 星期三 上午10:00${NDASH}11:00`],
  ['X12', 'consumer dateStyle: full 只有日期跨日 → zh-TW 換成數字月日(陷阱 (a) 原貌,DS 不改寫)', (lib) => lib.formatDateRange(dated(d(2026, 7, 15), d(2026, 7, 17), { formatOptions: { dateStyle: 'full' } })), '2026/7/15星期三至2026/7/17星期五'],
  ['X13', 'consumer 月份縮寫 + showTime → 補 2 位數 24 小時時分', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 11), { locale: 'en-US', formatOptions: { year: 'numeric', month: 'short', day: 'numeric' } })), `Jul 15, 2026, 10:00${R}11:00`],
  ['X14', 'consumer 自己寫了時間欄位 → 照它、不補', (lib) => JSON.stringify(lib.resolveDateRangeFormatOptions(true, true, { month: 'short', day: 'numeric', hour: 'numeric' })), JSON.stringify({ month: 'short', day: 'numeric', hour: 'numeric' })],
  ['X15', '預設選項(有時段、有秒)= 數字年月日 + 2 位數 24 小時時分秒', (lib) => JSON.stringify(lib.resolveDateRangeFormatOptions(true, true)), JSON.stringify({ year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })],
  ['X16', '呼叫端注入的 formatter 工廠真的被用到(拿到 locale 與選項)', (lib) => {
    const calls = []
    const spy = (locale, options) => { calls.push([locale, options]); return new Intl.DateTimeFormat(locale, options) }
    lib.formatDateRange(dated(d(2026, 7, 15), d(2026, 7, 17), { getFormatter: spy, locale: 'en-US' }))
    return JSON.stringify(calls)
  }, JSON.stringify([['en-US', { year: 'numeric', month: 'numeric', day: 'numeric' }]])],
]

function runRows(lib) {
  const result = new Map()
  for (const [id, , run, expected] of ROWS) {
    let actual
    try { actual = run(lib) } catch (e) { result.set(id, [`例外:${e.name}: ${e.message}`]); continue }
    result.set(id, actual === expected ? [] : [`實得 ${JSON.stringify(actual)},應得 ${JSON.stringify(expected)}`])
  }
  return result
}

// ── 性質:同一頁的日期樣式一致(預設選項;zh-TW / en-US × 一批日期)──────────────────────────────────
// 樣式記號只看「日期欄位」長什麼樣:月 / 日是數字還是文字、補不補零、星期長度、日期欄位後面的字面字(年月日 vs / . -)、括號、上下午。
// 補零只在個位數時看得出來(15 補不補零都是 15),所以兩位數的值不出記號;區間分隔號(起訖兩段之間那個字面字)不算 —— 它只有區間才有。
const DATE_TYPES = new Set(['year', 'month', 'day', 'weekday'])
function styleTokens(parts) {
  const out = new Set()
  parts.forEach((p, i) => {
    const prev = parts[i - 1]
    const next = parts[i + 1]
    if (p.type === 'month' || p.type === 'day') {
      if (/^0\d$/.test(p.value)) out.add(`${p.type}:pad`)
      else if (/^\d$/.test(p.value)) out.add(`${p.type}:num`)
      else if (!/^\d+$/.test(p.value)) out.add(`${p.type}:text`)
    }
    if (p.type === 'weekday') out.add(`weekday:${p.value.length}`)
    if (p.type === 'dayPeriod') out.add('dayPeriod')
    if (p.type !== 'literal') return
    if (prev && next && prev.source && next.source && prev.source !== next.source) return // 區間分隔號
    if (/[（(]/.test(p.value)) out.add('paren')
    if (prev && DATE_TYPES.has(prev.type)) for (const ch of p.value) if (/[年月日/.-]/.test(ch)) out.add(`lit:${ch}`)
  })
  return out
}
const FAMILIES = ['month:', 'day:', 'weekday:']
/** 同一族(例 month:)出現兩種以上的寫法 = 不一致 */
const conflicts = (tokens) => FAMILIES.filter((f) => [...tokens].filter((t) => t.startsWith(f)).length > 1)
const show = (tokens) => [...tokens].sort().join(' ')
const STYLE_PAIRS = [
  ['同一天有時段', d(2026, 7, 15, 10), d(2026, 7, 15, 11), true],
  ['同一天跨上下午', d(2026, 7, 15, 11), d(2026, 7, 15, 13, 30), true],
  ['同一天清晨(個位數月日)', d(2026, 3, 5, 6, 5), d(2026, 3, 5, 9), true],
  ['跨日有時段', d(2026, 7, 15, 22), d(2026, 7, 16, 1), true],
  ['跨月有時段', d(2026, 7, 31, 23), d(2026, 8, 1, 2), true],
  ['同一刻', d(2026, 7, 15, 10), d(2026, 7, 15, 10), true],
  ['跨日全天', d(2026, 7, 15), d(2026, 7, 17), false],
  ['個位數月日跨日', d(2026, 3, 5), d(2026, 3, 9), false],
  ['跨月全天', d(2026, 7, 30), d(2026, 8, 2), false],
  ['跨年全天', d(2026, 12, 30), d(2027, 1, 2), false],
  ['同一天全天', d(2026, 7, 15), d(2026, 7, 15), false],
]
/**
 * 回不一致的那幾筆;resolveOptions(withTime) 給出要量的選項。
 * 「同一頁」的基準 = 這一批日期每一端單獨 format 的記號聯集;每一段 formatRange 的記號都必須落在基準裡、合起來也不能有同族兩種寫法;
 * 有時段與只有日期兩種寫法的日期部分(拿掉上下午)也要同一套。
 */
function styleMismatches(resolveOptions) {
  const bad = []
  for (const locale of ['zh-TW', 'en-US']) {
    const base = {}
    for (const withTime of [true, false]) {
      const f = new Intl.DateTimeFormat(locale, resolveOptions(withTime))
      base[withTime] = new Set()
      for (const [, a, b, kind] of STYLE_PAIRS) if (kind === withTime) for (const x of [a, b]) for (const t of styleTokens(f.formatToParts(x))) base[withTime].add(t)
      const c = conflicts(base[withTime])
      if (c.length) bad.push(`${locale} 單獨 format 自己就有兩種寫法(${c.join('、')}):${show(base[withTime])}`)
    }
    const timedDate = new Set([...base[true]].filter((t) => t !== 'dayPeriod'))
    if (show(timedDate) !== show(base[false])) bad.push(`${locale} 有時段的日期樣式「${show(timedDate)}」≠ 只有日期的「${show(base[false])}」`)
    for (const [name, a, b, withTime] of STYLE_PAIRS) {
      const f = new Intl.DateTimeFormat(locale, resolveOptions(withTime))
      const tokens = styleTokens(f.formatRangeToParts(a, b))
      const outside = [...tokens].filter((t) => !base[withTime].has(t))
      const c = conflicts(new Set([...base[withTime], ...tokens]))
      if (outside.length || c.length) bad.push(`${locale} ${name}「${f.formatRange(a, b)}」出現單獨 format 沒有的寫法 ${outside.join(' ') || c.join('、')}(單獨 format:${show(base[withTime])})`)
    }
  }
  return bad
}

// ── 靜態 + 接線 ────────────────────────────────────────────────────────────────────────────────────
function checkStatic(src, indexSrc) {
  const bad = []
  if (!src.split('\n').slice(0, 10).some((line) => line.includes('@internal'))) bad.push('[S1] range-format.ts 檔頭 10 行內沒有 @internal')
  if (!src.includes('── 消費的 SSOT ──')) bad.push('[S2] range-format.ts 沒有「── 消費的 SSOT ──」段')
  if (/^\s*import\s/m.test(src)) bad.push('[S3] range-format.ts import 了模組(純函式不得 import;語系預設與 formatter 快取由呼叫端傳)')
  if (/timeZone/.test(src)) bad.push('[S4] range-format.ts 出現 timeZone(第一段不開時區)')
  if (/range-format/.test(indexSrc)) bad.push('[S5] DatePicker/index.ts 轉出了 range-format(@internal 不進出口)')
  return bad
}
/** 從 date-picker.tsx 切出 DatePickerRange 的 view 分支(到 readonly / disabled 那段為止) */
function rangeViewBranch(picker) {
  const at = picker.indexOf('const DatePickerRange = React.forwardRef')
  if (at === -1) return null
  const from = picker.indexOf("if (resolvedMode === 'view') {", at)
  const to = picker.indexOf('// readonly / disabled view', from)
  return from === -1 || to === -1 ? null : picker.slice(from, to)
}
function checkWiring(picker) {
  const bad = []
  if (!/import \{ formatDateRange \} from '\.\/range-format'/.test(picker)) bad.push("[W1] date-picker.tsx 沒有 import { formatDateRange } from './range-format'")
  const branch = rangeViewBranch(picker)
  if (branch === null) { bad.push('[W2] 找不到 DatePickerRange 的 view 分支(結構改了,接線檢查要跟著改)'); return bad }
  if (!/formatRange\s*\?\s*formatDateRange\(\{/.test(branch)) bad.push('[W2] Range 的 view 分支沒有以 `formatRange ?` 為閘呼叫 formatDateRange')
  if (!/^\s+formatRange = false,$/m.test(picker)) bad.push('[W3] DatePickerRange 沒有把 formatRange 預設成 false')
  if (!/locale: locale \?\? DEFAULT_DATE_LOCALE/.test(branch)) bad.push('[W4] 呼叫 formatDateRange 沒傳 locale ?? DEFAULT_DATE_LOCALE')
  if (!/getFormatter: getDateTimeFormatter/.test(branch)) bad.push('[W5] 呼叫 formatDateRange 沒傳 getDateTimeFormatter(formatter 快取)')
  if (!/if \(mergedText !== null\)/.test(branch) || !/<ArrowRight/.test(branch)) bad.push('[W6] 回 null 時沒有退回原本的兩段顯示(mergedText !== null 判斷 + ArrowRight 兩段)')
  return bad
}

const source = read(SOURCE_PATH)
const indexSource = read(`${DIR}/index.ts`)
const picker = read(PICKER_PATH)

if (!SELFTEST) {
  await bundle('date-range-format.mjs', [source])
  const { m0: lib } = await import('./.gate-bundles/date-range-format.mjs')
  assertExports(lib, 'range-format.ts')
  let fail = 0
  const result = runRows(lib)
  for (const [id, desc] of ROWS) {
    const bad = result.get(id)
    if (bad.length === 0) { console.log(`✓ ${id} ${desc}`); continue }
    fail += bad.length
    console.log(`✗ ${id} ${desc}`)
    for (const x of bad) console.log(`   - ${x}`)
  }
  const mismatches = styleMismatches((withTime) => lib.resolveDateRangeFormatOptions(withTime, false))
  if (mismatches.length === 0) console.log(`✓ P1 同一頁日期樣式一致:預設選項 × zh-TW / en-US × ${STYLE_PAIRS.length} 組日期,formatRange 每一端都與單獨 format 同一種樣式`)
  else { console.log('✗ P1 同一頁日期樣式一致'); for (const x of mismatches) console.log(`   - ${x}`); fail += mismatches.length }
  // 對照組:同一支樣式檢查,換成兩種被排除的寫法必須抓到不一致(抓不到 = 這支檢查量不到它要量的東西)
  const CONTROLS = [
    ['兩位數月日(兩段顯示的預設)', (withTime) => ({ year: 'numeric', month: '2-digit', day: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}) })],
    ["dateStyle: 'full'", (withTime) => (withTime ? { dateStyle: 'full', timeStyle: 'short' } : { dateStyle: 'full' })],
  ]
  for (const [name, options] of CONTROLS) {
    const found = styleMismatches(options)
    if (found.length === 0) instrumentFail(`對照組「${name}」沒被樣式檢查抓到 —— 儀器量不到 zh-TW 跨日只有日期的樣式陷阱`)
    console.log(`✓ 對照組「${name}」被抓到 ${found.length} 筆不一致(例:${found[0]})`)
  }
  const staticBad = [...checkStatic(source, indexSource), ...checkWiring(picker)]
  if (staticBad.length === 0) console.log('✓ S / W 靜態與接線:@internal + 消費的 SSOT、不 import、不開 timeZone、index 不轉出;date-picker.tsx 以 formatRange 為閘呼叫、預設 false、傳預設語系與快取、null 退回兩段')
  else { console.log('✗ S / W 靜態與接線'); for (const x of staticBad) console.log(`   - ${x}`); fail += staticBad.length }
  if (fail) { console.log(`\n✗ ${fail} 處不符`); process.exit(1) }
  console.log(`\n✓ DatePicker.Range formatRange:${ROWS.length} 格判定表、樣式性質、2 個對照組與靜態接線全部相符`)
  process.exit(0)
}

// ── --selftest:每一條規則一個突變,必須讓指定的格紅 ───────────────────────────────────────────────
const replaceOnce = (src, from, to, label) => {
  if (src.split(from).length !== 2) instrumentFail(`對照組「${label}」要改的片段不是剛好出現一次(原始碼改了,對照組要跟著改):${from}`)
  return src.replace(from, to)
}
const MUTANTS = [
  ['一端空也合併(拿掉「兩端都要有值」)', (s, n) => replaceOnce(s, '  if (!start || !end) return null\n', '', n), ['T5zh', 'T5en', 'X7']],
  ['Invalid Date 不退回', (s, n) => replaceOnce(s, '  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null\n', '', n), ['X8']],
  ['起點晚於終點不退回', (s, n) => replaceOnce(s, '  if (start.getTime() > end.getTime()) return null\n', '', n), ['X9']],
  ['showTime 只有一端帶時間不退回', (s, n) => replaceOnce(s, '  if (showTime && startHasTime !== endHasTime) return null\n', '', n), ['X6']],
  ['環境沒有 formatRange 不退回', (s, n) => replaceOnce(s, "  if (typeof formatter.formatRange !== 'function') return null\n", '', n), ['X10']],
  ['預設日期改回兩位數月日', (s, n) => replaceOnce(s, "  month: 'numeric',\n  day: 'numeric',\n", "  month: '2-digit',\n  day: '2-digit',\n", n), ['T1zh', 'T1en', 'X1', 'P1']],
  ["預設日期改成 dateStyle: 'full'", (s, n) => replaceOnce(s, "  year: 'numeric',\n  month: 'numeric',\n  day: 'numeric',\n", "  dateStyle: 'full',\n", n), ['T1zh', 'T2zh', 'P1']],
  ['時間不指定 24 小時(拿掉 hourCycle)', (s, n) => replaceOnce(s, "    hourCycle: 'h23',\n", '', n), ['T1zh', 'T1en', 'T3zh']],
  ['showTime 但兩端沒時間也寫時間', (s, n) => replaceOnce(s, '  const withTime = showTime && startHasTime && endHasTime\n', '  const withTime = showTime\n', n), ['X5']],
  ['有秒不補秒', (s, n) => replaceOnce(s, "    ...(showSeconds ? { second: '2-digit' as const } : {}),\n", '', n), ['X4', 'X15']],
  ['dateStyle 也補時分(拿掉 timeStyle 那條)', (s, n) => replaceOnce(s, "  if ('dateStyle' in dateOptions) return { ...dateOptions, timeStyle: showSeconds ? 'medium' : 'short' }\n", '', n), ['X11']],
  ['consumer 寫了時間欄位仍補', (s, n) => replaceOnce(s, '  if (TIME_FIELDS.some((field) => field in dateOptions)) return dateOptions\n', '', n), ['X14']],
  ['不用 formatRange、自己把兩端各寫一次接起來', (s, n) => replaceOnce(s, '  return formatter.formatRange(start, end)\n', "  return `${formatter.format(start)} – ${formatter.format(end)}`\n", n), ['T1zh', 'T4zh', 'X1']],
  ['不用呼叫端注入的工廠(一律 new Intl.DateTimeFormat)', (s, n) => replaceOnce(s, '(input.getFormatter ?? defaultFactory)(locale, options)', 'defaultFactory(locale, options)', n), ['X10', 'X16']],
]
const STATIC_MUTANTS = [
  ['檔頭拿掉 @internal', (s) => s.replace('@internal — ', ''), /\[S1\]/],
  ['拿掉「── 消費的 SSOT ──」段', (s) => s.replace('── 消費的 SSOT ──', '── 依據 ──'), /\[S2\]/],
  ['import 語系模組', (s) => `import { DEFAULT_DATE_LOCALE } from '../../lib/date-locale'\n${s}`, /\[S3\]/],
  ['開 timeZone 參數', (s) => s.replace('  locale: string\n  getFormatter?', '  locale: string\n  timeZone?: string\n  getFormatter?'), /\[S4\]/],
]
const WIRING_MUTANTS = [
  ['date-picker.tsx 拿掉 import', (p) => p.replace("import { formatDateRange } from './range-format'\n", ''), /\[W1\]/],
  ['view 分支不呼叫(永遠兩段)', (p) => p.replace('const mergedText = formatRange\n        ? formatDateRange({', 'const mergedText = false\n        ? formatDateRange({'), /\[W2\]/],
  ['formatRange 預設改成 true', (p) => p.replace('      formatRange = false,\n', '      formatRange = true,\n'), /\[W3\]/],
  ['不傳預設語系', (p) => p.replace('locale: locale ?? DEFAULT_DATE_LOCALE,\n            getFormatter', "locale: locale ?? 'en-US',\n            getFormatter"), /\[W4\]/],
  ['不傳 formatter 快取', (p) => p.replace('            getFormatter: getDateTimeFormatter,\n', ''), /\[W5\]/],
  ['回 null 也不退回兩段', (p) => p.replace('if (mergedText !== null) {', 'if (true) {'), /\[W6\]/],
]

const variants = [source, ...MUTANTS.map(([name, mutate]) => mutate(source, name))]
await bundle('date-range-format-mutants.mjs', variants)
const loaded = await import('./.gate-bundles/date-range-format-mutants.mjs')
assertExports(loaded.m0, '未突變的那一份')
const redOf = (lib) => {
  const red = [...runRows(lib)].filter(([, bad]) => bad.length > 0).map(([id]) => id)
  let mismatches
  try { mismatches = styleMismatches((withTime) => lib.resolveDateRangeFormatOptions(withTime, false)) } catch (e) { mismatches = [`例外:${e.message}`] }
  if (mismatches.length) red.push('P1')
  return red
}
const baselineRed = redOf(loaded.m0)
if (baselineRed.length) instrumentFail(`未突變的那一份本身就紅(${baselineRed.join('、')}),對照組無從比較 —— 先跑不帶 --selftest 的那一次`)
const baselineStatic = [...checkStatic(source, indexSource), ...checkWiring(picker)]
if (baselineStatic.length) instrumentFail(`未突變的原始碼靜態 / 接線檢查本身就紅:${baselineStatic.join(' / ')}`)

let missed = 0
for (const [i, [name, , expectRed]] of MUTANTS.entries()) {
  const lib = loaded[`m${i + 1}`]
  let red
  try { assertExports(lib, `對照組「${name}」`); red = redOf(lib) } catch (e) { red = [`例外:${e.message}`] }
  const caught = expectRed.every((id) => red.includes(id))
  console.log(`${caught ? '✓' : '✗'} 對照組「${name}」${caught ? '被抓到' : '沒被抓到'}(應紅 ${expectRed.join('、')};實紅 ${red.join('、') || '無'})`)
  if (!caught) missed++
}
for (const [name, mutate, pattern] of STATIC_MUTANTS) {
  const mutated = mutate(source)
  if (mutated === source) instrumentFail(`靜態對照組「${name}」沒改到原始碼(片段找不到)`)
  const bad = checkStatic(mutated, indexSource)
  const caught = bad.some((b) => pattern.test(b))
  console.log(`${caught ? '✓' : '✗'} 靜態對照組「${name}」${caught ? '被抓到' : `沒被抓到(實得:${bad.join(' / ') || '0 筆'})`}`)
  if (!caught) missed++
}
const indexBad = checkStatic(source, `${indexSource}export * from './range-format'\n`)
const indexCaught = indexBad.some((b) => /\[S5\]/.test(b))
console.log(`${indexCaught ? '✓' : '✗'} 靜態對照組「index.ts 轉出 range-format」${indexCaught ? '被抓到' : '沒被抓到'}`)
if (!indexCaught) missed++
for (const [name, mutate, pattern] of WIRING_MUTANTS) {
  const mutated = mutate(picker)
  if (mutated === picker) instrumentFail(`接線對照組「${name}」沒改到 date-picker.tsx(片段找不到)`)
  const bad = checkWiring(mutated)
  const caught = bad.some((b) => pattern.test(b))
  console.log(`${caught ? '✓' : '✗'} 接線對照組「${name}」${caught ? '被抓到' : `沒被抓到(實得:${bad.join(' / ') || '0 筆'})`}`)
  if (!caught) missed++
}
const total = MUTANTS.length + STATIC_MUTANTS.length + 1 + WIRING_MUTANTS.length
if (missed) { console.log(`\n✗ selftest:${missed} / ${total} 個對照組沒被抓到 —— 判定表沒在驗那一條`); process.exit(1) }
console.log(`\n✓ selftest:${total} 個對照組都被指定的格抓到`)
