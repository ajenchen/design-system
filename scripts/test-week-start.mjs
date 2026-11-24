#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 「這個語系的一週從哪天開始」只有一條規則(lib/date-locale.ts `resolveWeekStartsOn`;user 2026-11-24 選「跟語系的 CLDR (Recommended)」):
 *        有傳 weekStartsOn 就用它,沒傳時語系 → CLDR —— 先 Intl.Locale `getWeekInfo()`(舊版的 `weekInfo` 屬性也認),沒有就查內建 CLDR 表,
 *        `-u-fw-xxx` 兩條路都認;回 0–6、週日 = 0。三條路(getWeekInfo / 只有舊屬性 / 都沒有)對判定表每一格答案相同,
 *        內建表對每一個地區代碼都跟執行環境的 CLDR 相同。消費端真的用它:DateGrid(不再讀 date-fns 語系物件的 weekStartsOn)、
 *        DatePicker 與 DatePicker.Range、DataTable「本週 / 上週 / 下週」篩選(condition 帶這一欄的值,寫入點與 datePrecision 同一組)、
 *        日期格編輯器、篩選值的日期選擇器;Calendar / DatePicker / TimePicker 的預設語系 = DEFAULT_DATE_LOCALE = 'zh-TW'。
 *   紅: 判定表任一格(期望值照總帳 Q9(定)/ WS(定)/ 更正 #2(AI 判定,後由 WS(定) user 選「跟語系的 CLDR (Recommended)」確認)與 CLDR 逐格寫,不是抄輸出)在任一條路上不符 → exit 1;內建表與原生 CLDR 有任一地區不同
 *        → exit 1 並印出差異;篩選判定表(固定「今天」= 2026-11-25 週三,週日起 / 週一起 / 週六起 / 沒帶)任一格不符 → exit 1;
 *        消費端少了一處、或舊形狀(寫死週一、讀 date-fns 物件、'en-US' 預設)還在 → exit 1。
 *        `--selftest` 對照組:把內建表的 TW 拿掉、拿掉 -u-fw- 解析、拿掉 `% 7` 換算、忽略 weekStartsOn 參數、篩選改回寫死週一(2026-11-24 前的形狀)、
 *        消費端各拿掉一處 —— 每一種都必須讓指定的格紅;任何一種沒被抓到 = 判定表沒在驗那一條 → exit 1。
 *   綠: 全部相符時綠;純函式 + 固定時鐘 + 靜態讀檔,無網路、無亂數、無瀏覽器,重複跑結果恆等(執行環境的 ICU / CLDR 升版改了週資料時,
 *        逐地區比對會指名哪個地區變了 —— 那是要更新內建表的訊號,不是噪音)。
 *   儀器失效(exit 2,印 INSTRUMENT-FAIL): 執行環境沒有 Intl.Locale getWeekInfo(量不到原生那條路)、對照組要改的原始碼片段找不到、esbuild 打包失敗。
 *
 * Run: `node scripts/test-week-start.mjs`(`--selftest` 只跑對照組)
 */
import { build, transform } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DS = 'packages/design-system/src'
const LIB_PATH = `${DS}/lib/date-locale.ts`
const FILTER_TREE_PATH = `${DS}/components/DataTable/filter-tree.ts`
const SELFTEST = process.argv.includes('--selftest')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const instrumentFail = (msg) => { console.error(`INSTRUMENT-FAIL: ${msg}`); process.exit(2) }
mkdirSync(join(ROOT, 'scripts/.gate-bundles'), { recursive: true })

if (typeof Intl.Locale?.prototype?.getWeekInfo !== 'function') instrumentFail('這個 Node 沒有 Intl.Locale.prototype.getWeekInfo,量不到原生那條路(CI 用 Node 24.14.0)')

// ── 載入:原始碼 → esbuild → 固定檔名(scripts/.gate-bundles/README.md:import() 只准字面字串)──────────────
const replaceOnce = (src, from, to, label) => {
  if (!src.includes(from)) instrumentFail(`對照組「${label}」要改的片段找不到(原始碼改了,對照組要跟著改):${from}`)
  return src.replace(from, to)
}
async function writeLib(file, source) {
  const { code } = await transform(source, { loader: 'ts', format: 'esm' })
  writeFileSync(join(ROOT, 'scripts/.gate-bundles', file), code)
}
async function writeFilterTree(file, source) {
  const result = await build({
    stdin: { contents: source, resolveDir: join(ROOT, DS, 'components/DataTable'), loader: 'ts', sourcefile: 'filter-tree.ts' },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
    tsconfig: join(ROOT, 'packages/design-system/tsconfig.json'),
  }).catch((e) => instrumentFail(`esbuild 打包 filter-tree.ts 失敗:${e.message}`))
  writeFileSync(join(ROOT, 'scripts/.gate-bundles', file), result.outputFiles[0].text)
}

// ── 判定表(期望值逐格寫;0 = 週日、1 = 週一、5 = 週五、6 = 週六)──────────────────────────────────────
// 必列(任務規格):zh-TW / zh-Hant-TW / zh-HK / zh-SG = 週日、zh-CN / zh-Hans-CN = 週一、en-US = 週日、en-GB / de-DE = 週一、zh-TW-u-fw-mon = 週一。
const LOCALE_TABLE = [
  ['zh-TW', 0], ['zh-Hant-TW', 0], ['zh-HK', 0], ['zh-SG', 0],
  ['zh-CN', 1], ['zh-Hans-CN', 1],
  ['en-US', 0], ['en-GB', 1], ['de-DE', 1],
  ['zh-TW-u-fw-mon', 1],
  // 沒有地區:照 likely subtags 補(zh → zh-Hans-CN、zh-Hant → zh-Hant-TW、en → en-Latn-US、de → de-Latn-DE)
  ['zh', 1], ['zh-Hant', 0], ['en', 0], ['de', 1],
  // 週一 / 週日以外:CLDR 的週六起(埃及)、週五起(馬爾地夫,語言 dv 補到 MV)
  ['ar-EG', 6], ['dv', 5],
  // -u-fw-:任何一天都壓過地區;不合法的值忽略
  ['en-GB-u-fw-sun', 0], ['en-US-u-fw-sat', 6], ['zh-TW-u-fw-xyz', 0],
  // -u-ca-iso8601(沒有 -u-rg-)= 週一
  ['en-US-u-ca-iso8601', 1],
  // 世界預設(地區沒列在 CLDR 表 = 001 = 週一)
  ['en-150', 1], ['es-419', 1],
]
const OVERRIDE_TABLE = [
  ['沒傳語系 = DEFAULT_DATE_LOCALE(zh-TW)= 週日', (r) => r(), 0],
  ['傳 undefined 語系同上', (r) => r(undefined), 0],
  ['weekStartsOn 參數壓過語系(zh-TW + 1 → 週一)', (r) => r('zh-TW', 1), 1],
  ['weekStartsOn 參數 0 也算有傳(de-DE + 0 → 週日)', (r) => r('de-DE', 0), 0],
  ['weekStartsOn 參數壓過 -u-fw-(zh-TW-u-fw-mon + 6 → 週六)', (r) => r('zh-TW-u-fw-mon', 6), 6],
]

/** 三條路:原生 getWeekInfo / 只有舊版 weekInfo 屬性 / 兩個都沒有(Firefox 形狀) */
const PROTO = Intl.Locale.prototype
const GET_WEEK_INFO = Object.getOwnPropertyDescriptor(PROTO, 'getWeekInfo')
const WEEK_INFO = Object.getOwnPropertyDescriptor(PROTO, 'weekInfo')
function withPath(path, fn) {
  if (path !== 'native') delete PROTO.getWeekInfo
  if (path === 'table') delete PROTO.weekInfo
  if (path === 'legacy' && !WEEK_INFO) {
    // 執行環境只有 getWeekInfo、沒有舊屬性時,用 getWeekInfo 的結果造一個舊屬性(形狀同 Chromium 99–129)
    Object.defineProperty(PROTO, 'weekInfo', { configurable: true, get() { return GET_WEEK_INFO.value.call(this) } })
  }
  try { return fn() } finally {
    Object.defineProperty(PROTO, 'getWeekInfo', GET_WEEK_INFO)
    if (WEEK_INFO) Object.defineProperty(PROTO, 'weekInfo', WEEK_INFO)
    else delete PROTO.weekInfo
  }
}
const PATHS = ['native', 'legacy', 'table']

/** 判定表 → 不符的格(字串陣列) */
function checkLib(lib) {
  const bad = []
  if (lib.DEFAULT_DATE_LOCALE !== 'zh-TW') bad.push(`DEFAULT_DATE_LOCALE 期望 'zh-TW' 實得 ${JSON.stringify(lib.DEFAULT_DATE_LOCALE)}`)
  for (const path of PATHS) {
    for (const [tag, want] of LOCALE_TABLE) {
      let got
      try { got = withPath(path, () => lib.resolveWeekStartsOn(tag)) } catch (e) { got = `THROW ${e.name}` }
      if (got !== want) bad.push(`[${path}] ${tag}:期望 ${want} 實得 ${got}`)
    }
    for (const [name, call, want] of OVERRIDE_TABLE) {
      const got = withPath(path, () => call(lib.resolveWeekStartsOn))
      if (got !== want) bad.push(`[${path}] ${name}:期望 ${want} 實得 ${got}`)
    }
    // 不合法的語系代碼:照 Intl 慣例丟 RangeError(三條路一致,不默默換成別的語系)
    let threw = null
    try { withPath(path, () => lib.resolveWeekStartsOn('zh_TW')) } catch (e) { threw = e.name }
    if (threw !== 'RangeError') bad.push(`[${path}] zh_TW(不合法):期望丟 RangeError 實得 ${threw ?? '沒丟'}`)
  }
  return bad
}

/** 逐地區:內建表(table 路)vs 執行環境的 CLDR(native 路)。回不同的那些標籤。 */
function sweepLib(lib) {
  const tags = []
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (const a of A) for (const b of A) {
    const region = a + b
    let canonical
    try { canonical = new Intl.Locale(`und-${region}`).region } catch { continue }
    if (canonical !== region) continue // 別名(UK → GB 等)由 Intl.Locale 自己正規化,兩條路看到的是同一個地區
    tags.push(`und-${region}`, `en-${region}`, `zh-${region}`, `ar-${region}-u-fw-sun`)
  }
  for (const a of 'abcdefghijklmnopqrstuvwxyz') for (const b of 'abcdefghijklmnopqrstuvwxyz') {
    try { new Intl.Locale(a + b); tags.push(a + b) } catch { /* 不是合法語言碼 */ }
  }
  for (const fw of ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']) tags.push(`zh-TW-u-fw-${fw}`, `ar-EG-u-fw-${fw}`)
  tags.push('zh-Hant', 'zh-Hans', 'sr-Latn', 'uz-Arab', 'pa-Arab', 'ms-Arab', 'und', 'en-ZZ', 'en-001', 'ar-EG-u-ca-iso8601', 'zh-TW-u-ca-iso8601', 'en-US-u-ca-iso8601-fw-sun')
  const diffs = []
  for (const tag of tags) {
    const native = withPath('native', () => lib.resolveWeekStartsOn(tag))
    const table = withPath('table', () => lib.resolveWeekStartsOn(tag))
    if (native !== table) diffs.push(`${tag}:原生 ${native} / 內建表 ${table}`)
  }
  return { count: tags.length, diffs }
}

// 已知、檔頭寫明的差異:-u-rg- 只有原生那條認(ICU 的接受規則不規則,後備不猜)。這裡只印出來讓人看見範圍,不算紅也不算綠。
function knownRgDivergence(lib) {
  return ['en-GB-u-rg-uszzzz', 'en-US-u-rg-gbzzzz', 'en-GB-u-ca-iso8601-rg-twzzzz'].map((tag) =>
    `${tag}:原生 ${withPath('native', () => lib.resolveWeekStartsOn(tag))} / 內建表 ${withPath('table', () => lib.resolveWeekStartsOn(tag))}`)
}

// ── DataTable「本週 / 上週 / 下週」:固定「今天」= 2026-11-25(週三)10:00 本地時間 ─────────────────────
const RealDate = Date
const NOW = new RealDate(2026, 10, 25, 10, 0, 0).getTime()
class FixedDate extends RealDate {
  constructor(...args) { if (args.length === 0) super(NOW); else super(...args) }
  static now() { return NOW }
}
const day = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00` // 本地正午,不受時區把日期推到隔天
// [名稱, key, weekStartsOn(undefined = condition 沒帶), 該在範圍內的日子, 不該在的日子]
const FILTER_TABLE = [
  ['本週 · 週日起:11/22(日)– 11/28(六)', 'this_week', 0, [day(11, 22), day(11, 28)], [day(11, 21), day(11, 29)]],
  ['本週 · 週一起:11/23(一)– 11/29(日)', 'this_week', 1, [day(11, 23), day(11, 29)], [day(11, 22), day(11, 30)]],
  ['本週 · 週六起:11/21(六)– 11/27(五)', 'this_week', 6, [day(11, 21), day(11, 27)], [day(11, 20), day(11, 28)]],
  ['本週 · condition 沒帶 = zh-TW = 週日起', 'this_week', undefined, [day(11, 22), day(11, 28)], [day(11, 21), day(11, 29)]],
  ['上週 · 週日起:11/15 – 11/21', 'last_week', 0, [day(11, 15), day(11, 21)], [day(11, 14), day(11, 22)]],
  ['上週 · 週一起:11/16 – 11/22', 'last_week', 1, [day(11, 16), day(11, 22)], [day(11, 15), day(11, 23)]],
  ['下週 · 週日起:11/29 – 12/5', 'next_week', 0, [day(11, 29), day(12, 5)], [day(11, 28), day(12, 6)]],
  ['下週 · 週一起:11/30 – 12/6', 'next_week', 1, [day(11, 30), day(12, 6)], [day(11, 29), day(12, 7)]],
  ['下週 · condition 沒帶 = 週日起', 'next_week', undefined, [day(11, 29), day(12, 5)], [day(11, 28), day(12, 6)]],
]
function checkFilter(evaluateTree) {
  const bad = []
  globalThis.Date = FixedDate
  try {
    for (const [name, key, weekStartsOn, inside, outside] of FILTER_TABLE) {
      const cond = { kind: 'cond', id: 'c', field: 'due', op: 'is_relative', value: key, datePrecision: 'day' }
      if (weekStartsOn !== undefined) cond.weekStartsOn = weekStartsOn
      const tree = { mode: 'flat', conjunction: 'and', children: [cond] }
      for (const d of inside) if (!evaluateTree(tree, { due: d })) bad.push(`${name}:${d.slice(0, 10)} 應該在範圍內`)
      for (const d of outside) if (evaluateTree(tree, { due: d })) bad.push(`${name}:${d.slice(0, 10)} 不該在範圍內`)
    }
  } finally { globalThis.Date = RealDate }
  return bad
}

// ── 消費端:真的呼叫這一支、舊形狀不在 ────────────────────────────────────────────────────────────────
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const count = (src, needle) => src.split(needle).length - 1
const IMPORT_FROM_LIB = /from '@\/design-system\/lib\/date-locale'/
const CONSUMER_FILES = {
  dateGrid: `${DS}/components/DateGrid/date-grid.tsx`,
  datePicker: `${DS}/components/DatePicker/date-picker.tsx`,
  timePicker: `${DS}/components/TimePicker/time-picker.tsx`,
  calendar: `${DS}/components/Calendar/calendar.tsx`,
  filterTree: FILTER_TREE_PATH,
  filterPanel: `${DS}/components/DataTable/data-table-filter-panel.tsx`,
  filterGroup: `${DS}/components/DataTable/data-table-filter-group.tsx`,
  valuePicker: `${DS}/components/DataTable/data-table-filter-value-picker.tsx`,
  cellRegistry: `${DS}/components/DataTable/cell-registry.tsx`,
  columnTypes: `${DS}/components/DataTable/column-types.ts`,
}
function checkConsumers(files) {
  const bad = []
  const code = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, stripComments(v)]))
  for (const key of ['dateGrid', 'datePicker', 'timePicker', 'calendar', 'filterTree', 'filterPanel', 'cellRegistry']) {
    if (!IMPORT_FROM_LIB.test(code[key])) bad.push(`${CONSUMER_FILES[key]} 沒有 import lib/date-locale`)
  }
  // DateGrid:週起始日由語系代碼經 resolveWeekStartsOn 推,傳給 DayPicker;不讀 date-fns 物件裡的 weekStartsOn
  if (!/resolveWeekStartsOn\(\s*localeCode\s*,\s*weekStartsOn\s*\)/.test(code.dateGrid)) bad.push('DateGrid 沒有用 resolveWeekStartsOn(localeCode, weekStartsOn)')
  if (!/weekStartsOn=\{resolvedWeekStartsOn\}/.test(code.dateGrid)) bad.push('DateGrid 沒有把解析後的週起始日傳給 DayPicker')
  if (/options\??\.weekStartsOn/.test(code.dateGrid)) bad.push('DateGrid 又在讀 date-fns 語系物件的 options.weekStartsOn')
  // DatePicker:單日與區間各一份解析、每一個 <DateGrid 都帶
  if (count(code.datePicker, 'resolveWeekStartsOn(locale, weekStartsOn)') !== 2) bad.push(`DatePicker 的 resolveWeekStartsOn(locale, weekStartsOn) 應有 2 處(單日 / 區間),實得 ${count(code.datePicker, 'resolveWeekStartsOn(locale, weekStartsOn)')}`)
  if (count(code.datePicker, '<DateGrid') !== count(code.datePicker, 'weekStartsOn={resolvedWeekStartsOn}')) bad.push('DatePicker 有 <DateGrid 沒帶 weekStartsOn={resolvedWeekStartsOn}')
  // 預設語系:三個元件都讀 DEFAULT_DATE_LOCALE,不再寫死 'en-US'
  for (const key of ['datePicker', 'timePicker', 'calendar']) {
    if (!code[key].includes('DEFAULT_DATE_LOCALE')) bad.push(`${CONSUMER_FILES[key]} 的預設語系沒有讀 DEFAULT_DATE_LOCALE`)
    if (/'en-US'/.test(code[key])) bad.push(`${CONSUMER_FILES[key]} 還有寫死的 'en-US'`)
  }
  // DataTable 篩選:不寫死週一;relativeKeyToRange 收 weekStartsOn、condition 的值傳進去
  if (/weekStartsOn:\s*\d/.test(code.filterTree)) bad.push('filter-tree.ts 又寫死了 weekStartsOn: <數字>')
  if (count(code.filterTree, 'relativeKeyToRange(String(filterValue)') !== count(code.filterTree, ', weekStartsOn)')) bad.push('filter-tree.ts 有一處 relativeKeyToRange 沒帶 condition 的 weekStartsOn')
  if (!/matchOperator\([^)]*cond\.weekStartsOn\)/.test(code.filterTree)) bad.push('filter-tree.ts evaluateCondition 沒把 cond.weekStartsOn 傳進 matchOperator')
  // 寫入點:每個寫 datePrecision: datePrecisionOf(x) 的地方,同一個物件也寫 weekStartsOn: weekStartsOnOf(x)
  for (const key of ['filterPanel', 'filterGroup']) {
    const writes = [...code[key].matchAll(/datePrecision:\s*datePrecisionOf\((\w+)\)/g)]
    for (const m of writes) {
      const tail = code[key].slice(m.index, m.index + 160)
      if (!new RegExp(`weekStartsOn:\\s*weekStartsOnOf\\(${m[1]}\\)`).test(tail)) bad.push(`${CONSUMER_FILES[key]} 有一處寫了 datePrecisionOf(${m[1]}) 卻沒寫 weekStartsOnOf(${m[1]})`)
    }
  }
  if (!/weekStartsOn:\s*type === 'date' \? resolveWeekStartsOn\(meta\?\.locale, meta\?\.weekStartsOn\)/.test(code.filterPanel)) bad.push('篩選面板 extractColumns 沒有用 resolveWeekStartsOn(meta?.locale, meta?.weekStartsOn) 解析這一欄的週起始日')
  // 同一欄:日期格編輯器與篩選值的日期選擇器用同一個值
  if (!/weekStartsOn=\{resolveWeekStartsOn\(meta\?\.locale, meta\?\.weekStartsOn\)\}/.test(code.cellRegistry)) bad.push('日期格編輯器沒有用這一欄的週起始日')
  const pickers = count(code.valuePicker, '<DatePicker') // 含 <DatePickerRange
  if (pickers === 0 || pickers !== count(code.valuePicker, 'weekStartsOn={colInfo?.weekStartsOn}')) bad.push(`篩選值的日期選擇器有 ${pickers} 個,帶這一欄週起始日的只有 ${count(code.valuePicker, 'weekStartsOn={colInfo?.weekStartsOn}')} 個`)
  if (!/weekStartsOn\?:\s*WeekStartsOn/.test(code.columnTypes)) bad.push('ColumnMeta 沒有 weekStartsOn')
  return bad
}

// ── 跑 ────────────────────────────────────────────────────────────────────────────────────────────
const libSource = read(LIB_PATH)
const filterTreeSource = read(FILTER_TREE_PATH)
const consumerSources = Object.fromEntries(Object.entries(CONSUMER_FILES).map(([k, rel]) => [k, read(rel)]))

if (!SELFTEST) {
  await writeLib('week-start-lib.mjs', libSource)
  const lib = await import('./.gate-bundles/week-start-lib.mjs')
  await writeFilterTree('week-start-filter-tree.mjs', filterTreeSource)
  const { evaluateTree } = await import('./.gate-bundles/week-start-filter-tree.mjs')
  if (typeof lib.resolveWeekStartsOn !== 'function' || typeof evaluateTree !== 'function') instrumentFail('取不到 resolveWeekStartsOn / evaluateTree(出口名稱改了?)')

  const sections = [
    [`判定表(${LOCALE_TABLE.length} 個語系 + ${OVERRIDE_TABLE.length} 格參數 + 不合法代碼)× 三條路(getWeekInfo / 舊 weekInfo / 內建表)`, checkLib(lib)],
  ]
  const sweep = sweepLib(lib)
  sections.push([`內建 CLDR 表 vs 執行環境 CLDR(ICU ${process.versions.icu} / CLDR ${process.versions.cldr}),${sweep.count} 個標籤逐一比對`, sweep.diffs])
  sections.push([`DataTable 本週 / 上週 / 下週(${FILTER_TABLE.length} 格,今天 = 2026-11-25 週三)`, checkFilter(evaluateTree)])
  sections.push(['消費端真的呼叫、舊形狀不在', checkConsumers(consumerSources)])
  let fail = 0
  for (const [name, bad] of sections) {
    if (bad.length === 0) { console.log(`✓ ${name}`); continue }
    fail += bad.length
    console.log(`✗ ${name}`)
    for (const b of bad) console.log(`   - ${b}`)
  }
  console.log(`\n(已知差異,檔頭寫明、不在「兩條路同結果」範圍)-u-rg- 只有原生那條認:\n   ${knownRgDivergence(lib).join('\n   ')}`)
  if (fail) { console.log(`\n✗ ${fail} 處不符`); process.exit(1) }
  console.log('\n✓ 週起始日:規則、內建表、篩選、消費端全部相符')
  process.exit(0)
}

// ── --selftest:每一種改壞都必須被指定的那一段抓到 ──────────────────────────────────────────────────────
const MUTANTS = [
  {
    name: '內建表拿掉 TW(zh-TW 在沒有 getWeekInfo 的瀏覽器變週一)',
    lib: replaceOnce(libSource, ' TT TW UM ', ' TT UM ', '拿掉 TW'),
    expect: (bad) => bad.lib.some((b) => b.startsWith('[table] zh-TW:')) && bad.sweep.some((b) => b.startsWith('und-TW:')),
  },
  {
    name: '後備不解析 -u-fw-(zh-TW-u-fw-mon 在沒有 getWeekInfo 時變週日)',
    lib: replaceOnce(libSource, "const fw = unicodeKeyword(tag, 'fw')", 'const fw = undefined as string | undefined', '拿掉 fw'),
    expect: (bad) => bad.lib.some((b) => b.startsWith('[table] zh-TW-u-fw-mon:')) && bad.sweep.some((b) => b.startsWith('zh-TW-u-fw-mon:')),
  },
  {
    name: '原生 firstDay 不換算(週日回 7)',
    lib: replaceOnce(libSource, '((firstDay % 7) as WeekStartsOn)', '(firstDay as WeekStartsOn)', '拿掉 % 7'),
    expect: (bad) => bad.lib.some((b) => b.startsWith('[native] zh-TW:')) && bad.lib.some((b) => b.startsWith('[legacy] en-US:')),
  },
  {
    name: '忽略 weekStartsOn 參數',
    lib: replaceOnce(libSource, '  if (override !== undefined) return override\n', '', '忽略參數'),
    expect: (bad) => bad.lib.some((b) => b.includes('weekStartsOn 參數壓過語系')),
  },
]
const FILTER_MUTANT = replaceOnce(filterTreeSource, 'const week = { weekStartsOn }', 'const week = { weekStartsOn: 1 as const }', '篩選寫死週一')
const CONSUMER_MUTANTS = [
  ['DateGrid 改回讀 date-fns 物件', 'dateGrid', (s) => replaceOnce(s, 'weekStartsOn={resolvedWeekStartsOn}', 'weekStartsOn={locale?.options?.weekStartsOn}', 'DateGrid 讀物件'), /DateGrid/],
  ['DatePicker 區間的 <DateGrid 沒帶週起始日', 'datePicker', (s) => replaceOnce(s, '                  weekStartsOn={resolvedWeekStartsOn}\n', '', 'Range 不帶'), /<DateGrid 沒帶/],
  ['TimePicker 預設語系改回 en-US', 'timePicker', (s) => replaceOnce(s, 'locale = DEFAULT_DATE_LOCALE,', "locale = 'en-US',", 'TimePicker en-US'), /time-picker\.tsx 還有寫死的 'en-US'/],
  ['Calendar 預設語系改回 en-US', 'calendar', (s) => replaceOnce(s, 'locale = DEFAULT_DATE_LOCALE,', "locale = 'en-US',", 'Calendar en-US'), /calendar\.tsx 還有寫死的 'en-US'/],
  ['篩選寫死週一(2026-11-24 前的形狀)', 'filterTree', (s) => replaceOnce(s, 'const week = { weekStartsOn }', 'const week = { weekStartsOn: 1 }', '寫死週一'), /寫死了 weekStartsOn/],
  ['新增條件(newCondition)漏寫週起始日', 'filterPanel', (s) => replaceOnce(s, '  weekStartsOn: weekStartsOnOf(firstCol),\n', '', 'newCondition 漏寫'), /datePrecisionOf\(firstCol\) 卻沒寫/],
  ['日期格編輯器沒帶這一欄的週起始日', 'cellRegistry', (s) => replaceOnce(s, 'weekStartsOn={resolveWeekStartsOn(meta?.locale, meta?.weekStartsOn)}', '', '格編輯器漏帶'), /日期格編輯器/],
  ['篩選值的區間日期選擇器漏一個', 'valuePicker', (s) => replaceOnce(s, '          showTime\n          weekStartsOn={colInfo?.weekStartsOn}\n', '          showTime\n', '值選擇器漏帶'), /篩選值的日期選擇器/],
]

let missed = 0
const mutantFiles = ['week-start-lib-no-tw.mjs', 'week-start-lib-no-fw.mjs', 'week-start-lib-iso-day.mjs', 'week-start-lib-ignore-override.mjs']
for (const [i, m] of MUTANTS.entries()) await writeLib(mutantFiles[i], m.lib)
const loaded = [
  await import('./.gate-bundles/week-start-lib-no-tw.mjs'),
  await import('./.gate-bundles/week-start-lib-no-fw.mjs'),
  await import('./.gate-bundles/week-start-lib-iso-day.mjs'),
  await import('./.gate-bundles/week-start-lib-ignore-override.mjs'),
]
for (const [i, m] of MUTANTS.entries()) {
  const bad = { lib: checkLib(loaded[i]), sweep: sweepLib(loaded[i]).diffs }
  const caught = m.expect(bad)
  console.log(`${caught ? '✓' : '✗'} 對照組「${m.name}」${caught ? `被抓到(判定表 ${bad.lib.length} 格、逐地區 ${bad.sweep.length} 個不符)` : '沒被抓到'}`)
  if (!caught) missed++
}
await writeFilterTree('week-start-filter-tree-monday.mjs', FILTER_MUTANT)
const mondayTree = await import('./.gate-bundles/week-start-filter-tree-monday.mjs')
const filterBad = checkFilter(mondayTree.evaluateTree)
const filterCaught = filterBad.some((b) => b.startsWith('本週 · 週日起')) && filterBad.some((b) => b.startsWith('本週 · condition 沒帶')) && !filterBad.some((b) => b.startsWith('本週 · 週一起'))
console.log(`${filterCaught ? '✓' : '✗'} 對照組「篩選寫死週一」${filterCaught ? `被抓到(${filterBad.length} 格不符,週一起那幾格照舊綠)` : '沒被抓到'}`)
if (!filterCaught) missed++
const consumerBaseline = checkConsumers(consumerSources)
if (consumerBaseline.length) instrumentFail(`現況的消費端檢查本身就紅,對照組無從比較:${consumerBaseline.join(' / ')}`)
for (const [name, key, mutate, pattern] of CONSUMER_MUTANTS) {
  const bad = checkConsumers({ ...consumerSources, [key]: mutate(consumerSources[key]) })
  const caught = bad.some((b) => pattern.test(b))
  console.log(`${caught ? '✓' : '✗'} 對照組「${name}」${caught ? '被抓到' : `沒被抓到(實得:${bad.join(' / ') || '0 筆'})`}`)
  if (!caught) missed++
}
if (missed) { console.log(`\n✗ selftest:${missed} 個對照組沒被抓到 —— 判定表沒在驗那一條`); process.exit(1) }
console.log('\n✓ selftest:每一種改壞都被指定的格抓到')
