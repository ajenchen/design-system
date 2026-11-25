#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 「這個語系的一週從哪天開始」只有一條規則(lib/date-locale.ts `resolveWeekStartsOn`;user 2026-11-24 選「跟語系的 CLDR (Recommended)」):
 *        有傳 weekStartsOn 就用它,沒傳時語系 → CLDR —— 先 Intl.Locale `getWeekInfo()`(舊版的 `weekInfo` 屬性也認),沒有就查內建 CLDR 表,
 *        `-u-fw-xxx` 兩條路都認;回 0–6、週日 = 0。三條路(getWeekInfo / 只有舊屬性 / 都沒有)對判定表每一格答案相同,
 *        內建表對每一個地區代碼都跟執行環境的 CLDR 相同。消費端真的用它:DateGrid(不再讀 date-fns 語系物件的 weekStartsOn)、
 *        DatePicker 與 DatePicker.Range、DataTable「本週 / 上週 / 下週」篩選(condition 帶這一欄的值,寫入點與 datePrecision 同一組)、
 *        日期格編輯器、篩選值的日期選擇器;Calendar / DatePicker / TimePicker 的預設語系 = DEFAULT_DATE_LOCALE = 'zh-TW'。
 *        Calendar(2026-11-25 月檢視重做接上):週起始日 `resolveWeekStartsOn(locale, weekStartsOn)`、隱藏週末 `resolveWeekend(locale)`、
 *        週數 `getWeek` 帶解析後的週起始日與 `resolveFirstWeekMinDays(locale)`、每一個 startOfWeek / endOfWeek 都讀解析後的週起始日,
 *        不讀 date-fns 語系物件、不寫死數字(畫出來的結果另由 scripts/calendar-month-invariant.mjs 在瀏覽器量:en-GB 週一起、en-IL 藏週五六、年底週數)。
 *        同一支檔的另外兩條(2026-11-25,calendar.spec.md「隱藏週末」「週數欄」):
 *        「週末是哪幾天」`resolveWeekend` —— 三條路同上、回 0–6 的集合,內建週末表對每一個地區代碼都跟執行環境的 CLDR 相同,
 *        原生那條真的被問到(`-u-rg-` 只有原生認,判定表逐路寫出兩種答案);
 *        「第一週至少幾天」`resolveFirstWeekMinDays` —— 沒有原生那一步,三條路答案相同;內建 minDays 表對內嵌的 CLDR 48 快照
 *        (unicode-org/cldr-json cldr-core 48.0.0 supplemental/weekData.json)逐地區相同;拿它與 resolveWeekStartsOn 餵 date-fns getWeek 的週數錨點
 *        (de-DE 2027-01-01 = 第 53 週、en-US = 第 1 週)相符。
 *   紅: 判定表任一格(期望值照總帳 Q9(定)/ WS(定)/ 更正 #2(AI 判定,後由 WS(定) user 選「跟語系的 CLDR (Recommended)」確認)與 CLDR 逐格寫,不是抄輸出)在任一條路上不符 → exit 1;內建表與原生 CLDR 有任一地區不同
 *        → exit 1 並印出差異;篩選判定表(固定「今天」= 2026-11-25 週三,週日起 / 週一起 / 週六起 / 沒帶)任一格不符 → exit 1;
 *        消費端少了一處、或舊形狀(寫死週一、讀 date-fns 物件、'en-US' 預設)還在 → exit 1;週末 / 第一週判定表任一格在任一條路上不符、
 *        內建週末表與原生有任一地區不同、minDays 表與 CLDR 48 快照有任一地區不同、週數錨點任一格不符 → exit 1 並印出差異。
 *        `--selftest` 對照組:把內建表的 TW 拿掉、拿掉 -u-fw- 解析、拿掉 `% 7` 換算、忽略 weekStartsOn 參數、篩選改回寫死週一(2026-11-24 前的形狀)、
 *        消費端各拿掉一處(含 Calendar 週起始日寫死、週末寫死六日、週數第一週天數寫死 1、Home 寫死週一)、週末表拿掉 IN、週末不問原生、後備不補地區(語言碼沒寫地區時不照 likely subtags 補)、minDays 表拿掉 DE、
 *        iso8601 不回 4 —— 每一種都必須讓指定的格紅;任何一種沒被抓到 = 判定表沒在驗那一條 → exit 1。
 *   綠: 全部相符時綠;純函式 + 固定時鐘 + 靜態讀檔,無網路、無亂數、無瀏覽器,重複跑結果恆等(執行環境的 ICU / CLDR 升版改了週資料時,
 *        逐地區比對會指名哪個地區變了 —— 那是要更新內建表的訊號,不是噪音)。
 *   儀器失效(exit 2,印 INSTRUMENT-FAIL): 執行環境沒有 Intl.Locale getWeekInfo(量不到原生那條路)、原生 getWeekInfo 沒有 weekend 陣列、
 *        對照組要改的原始碼片段找不到、esbuild 打包失敗、取不到 date-fns getWeek。
 *   提示(不算紅): 執行環境的 CLDR 不是 48 時印一行 —— minDays 沒有原生可比,只能對內嵌的 CLDR 48 快照,換版時要人工對新版的 minDays。
 *
 * Run: `node scripts/test-week-start.mjs`(`--selftest` 只跑對照組)
 */
import { getWeek } from 'date-fns'
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
if (!Array.isArray(new Intl.Locale('ar-EG').getWeekInfo().weekend)) instrumentFail('這個 Node 的 getWeekInfo() 沒有 weekend 陣列,量不到原生週末')
if (typeof getWeek !== 'function') instrumentFail('取不到 date-fns 的 getWeek(週數錨點要用)')

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

// ── 週末判定表(期望值照 CLDR 48 weekendStart / weekendEnd 逐格寫,0 = 週日 … 6 = 週六,由小到大)────────────────────
// 三條路答案相同的格;只有 `-u-rg-` 那一格三條路答案不同(只有原生認 rg),另列在 WEEKEND_NATIVE_ONLY。
const WEEKEND_TABLE = [
  ['zh-TW', [0, 6]], ['zh-CN', [0, 6]], ['en-US', [0, 6]], ['de-DE', [0, 6]],
  // 週末不是六日:週五六(埃及、以色列、沙烏地)、只有週五(伊朗)、週四五(阿富汗)、只有週日(印度、烏干達)
  ['ar-EG', [5, 6]], ['he-IL', [5, 6]], ['ar-SA', [5, 6]], ['fa-IR', [5]], ['ps-AF', [4, 5]], ['hi-IN', [0]], ['en-IN', [0]], ['en-UG', [0]],
  // 阿聯:CLDR 48 不列(= 世界預設六日);React Aria 3.12.4 的週末表還寫週五六 —— 本表照執行環境的 CLDR,不照抄別家的表
  ['ar-AE', [0, 6]],
  // 沒有地區:照 likely subtags 補(ar → EG、fa → IR、he → IL、und → US)
  ['ar', [5, 6]], ['fa', [5]], ['he', [5, 6]], ['und', [0, 6]],
  // -u-fw- 與 -u-ca-iso8601 不改週末(實測原生同)
  ['ar-EG-u-fw-mon', [5, 6]], ['ar-EG-u-ca-iso8601', [5, 6]], ['en-US-u-fw-mon', [0, 6]],
  // 世界預設
  ['en-150', [0, 6]], ['es-419', [0, 6]],
]
const WEEKEND_OVERRIDE_TABLE = [
  ['沒傳語系 = DEFAULT_DATE_LOCALE(zh-TW)= 週六、週日', (r) => r(), [0, 6]],
  ['傳 undefined 語系同上', (r) => r(undefined), [0, 6]],
]
// 原生那條真的被問到:`-u-rg-eg` 只有原生認(檔頭寫明的取捨)—— 原生 / 舊屬性 = 埃及的週五六,內建表 = 語系本身(US)的六日
const WEEKEND_NATIVE_ONLY = { tag: 'en-US-u-rg-egzzzz', native: [5, 6], legacy: [5, 6], table: [0, 6] }

// ── 第一週至少幾天判定表(期望值照 CLDR 48 minDays 逐格寫;三條路答案相同 —— 這一條沒有原生那一步)────────────────
const MIN_DAYS_TABLE = [
  ['de-DE', 4], ['en-GB', 4], ['fr-FR', 4], ['sv-SE', 4], ['es-ES', 4], ['ru-RU', 4], ['pt-PT', 4],
  ['en-US', 1], ['zh-TW', 1], ['zh-CN', 1], ['ja-JP', 1], ['ar-EG', 1], ['pt-BR', 1], ['en-150', 1],
  // 沒有地區:照 likely subtags 補(de → DE、en → US、und → US)
  ['de', 4], ['en', 1], ['und', 1],
  // CLDR 快照裡的 AN 是停用地區碼:Intl.Locale 把它正規化成 CW,CW 沒列 = 1
  ['nl-AN', 1],
  // -u-ca-iso8601(沒有 -u-rg-)= ISO 8601 第一週 = 4;-u-fw- 不影響
  ['en-US-u-ca-iso8601', 4], ['zh-TW-u-ca-iso8601', 4], ['de-DE-u-fw-sun', 4], ['en-US-u-fw-mon', 1],
  // 帶 -u-rg- 時不讀 rg、也不套 iso8601(與週起始日的後備同一條取捨,檔頭寫明)
  ['en-US-u-ca-iso8601-rg-uszzzz', 1],
]
const MIN_DAYS_OVERRIDE_TABLE = [
  ['沒傳語系 = DEFAULT_DATE_LOCALE(zh-TW)= 1', (r) => r(), 1],
  ['傳 undefined 語系同上', (r) => r(undefined), 1],
]

// ── CLDR 48 minDays 一手快照(不是抄程式輸出;內建表要逐地區等於它)────────────────────────────────────────
// 來源:https://unpkg.com/cldr-core@48.0.0/supplemental/weekData.json(unicode-org/cldr-json,_cldrVersion "48")的
// supplemental.weekData.minDays 原樣;2026-11-25 下載,整份檔 sha256 b28ea2cedf6da29e9b93d7492e0f0a8a6852fe49f7990c58f9fc57531bf7c6b3。
const CLDR48_MIN_DAYS = {"001": "1", "AD": "4", "AN": "4", "AT": "4", "AX": "4", "BE": "4", "BG": "4", "CH": "4", "CZ": "4", "DE": "4", "DK": "4", "EE": "4", "ES": "4", "FI": "4", "FJ": "4", "FO": "4", "FR": "4", "GB": "4", "GF": "4", "GG": "4", "GI": "4", "GP": "4", "GR": "4", "GU": "1", "HU": "4", "IE": "4", "IM": "4", "IS": "4", "IT": "4", "JE": "4", "LI": "4", "LT": "4", "LU": "4", "MC": "4", "MQ": "4", "NL": "4", "NO": "4", "PL": "4", "PT": "4", "RE": "4", "RU": "4", "SE": "4", "SJ": "4", "SK": "4", "SM": "4", "UM": "1", "US": "1", "VA": "4", "VI": "1"}
if (CLDR48_MIN_DAYS['001'] !== '1' || !Object.values(CLDR48_MIN_DAYS).every((v) => v === '1' || v === '4')) instrumentFail('CLDR 48 minDays 快照不是只有 1 / 4(date-fns firstWeekContainsDate 只收 1 | 4)或少了 001')

// ── 週數錨點:lib 算出的週起始日 + 第一週天數 → date-fns getWeek(期望值照 ISO 8601 / 美式週數逐格手算)──────────────────
// 2027-01-01 是週五:週一起 + 至少 4 天 → 1/1–1/3 只有 3 天,算 2026 年的第 53 週(2026 年從週四開始,有 53 週);週日起 + 1 天 → 第 1 週。
const WEEK_NUMBER_ANCHORS = [
  ['de-DE', [2027, 1, 1], 53], ['de-DE', [2027, 1, 4], 1], ['en-GB', [2027, 1, 1], 53],
  ['en-US', [2027, 1, 1], 1], ['en-US', [2026, 12, 26], 52], ['zh-TW', [2027, 1, 1], 1],
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

const sortedDays = (set) => [...set].sort((a, b) => a - b).join(',')

/** 週末判定表 → 不符的格 */
function checkWeekend(lib) {
  const bad = []
  if (typeof lib.resolveWeekend !== 'function') return ['resolveWeekend 不是函式(出口名稱改了?)']
  for (const path of PATHS) {
    for (const [tag, want] of WEEKEND_TABLE) {
      let got
      try { got = sortedDays(withPath(path, () => lib.resolveWeekend(tag))) } catch (e) { got = `THROW ${e.name}` }
      if (got !== want.join(',')) bad.push(`[${path}] 週末 ${tag}:期望 ${want} 實得 ${got}`)
    }
    for (const [name, call, want] of WEEKEND_OVERRIDE_TABLE) {
      const got = sortedDays(withPath(path, () => call(lib.resolveWeekend)))
      if (got !== want.join(',')) bad.push(`[${path}] 週末 ${name}:期望 ${want} 實得 ${got}`)
    }
    const { tag } = WEEKEND_NATIVE_ONLY
    const got = sortedDays(withPath(path, () => lib.resolveWeekend(tag)))
    if (got !== WEEKEND_NATIVE_ONLY[path].join(',')) bad.push(`[${path}] 週末 ${tag}(原生那條有沒有被問到):期望 ${WEEKEND_NATIVE_ONLY[path]} 實得 ${got}`)
    let threw = null
    try { withPath(path, () => lib.resolveWeekend('zh_TW')) } catch (e) { threw = e.name }
    if (threw !== 'RangeError') bad.push(`[${path}] 週末 zh_TW(不合法):期望丟 RangeError 實得 ${threw ?? '沒丟'}`)
  }
  return bad
}

/** 第一週判定表 → 不符的格 */
function checkMinDays(lib) {
  const bad = []
  if (typeof lib.resolveFirstWeekMinDays !== 'function') return ['resolveFirstWeekMinDays 不是函式(出口名稱改了?)']
  for (const path of PATHS) {
    for (const [tag, want] of MIN_DAYS_TABLE) {
      let got
      try { got = withPath(path, () => lib.resolveFirstWeekMinDays(tag)) } catch (e) { got = `THROW ${e.name}` }
      if (got !== want) bad.push(`[${path}] 第一週 ${tag}:期望 ${want} 實得 ${got}`)
    }
    for (const [name, call, want] of MIN_DAYS_OVERRIDE_TABLE) {
      const got = withPath(path, () => call(lib.resolveFirstWeekMinDays))
      if (got !== want) bad.push(`[${path}] 第一週 ${name}:期望 ${want} 實得 ${got}`)
    }
    let threw = null
    try { withPath(path, () => lib.resolveFirstWeekMinDays('zh_TW')) } catch (e) { threw = e.name }
    if (threw !== 'RangeError') bad.push(`[${path}] 第一週 zh_TW(不合法):期望丟 RangeError 實得 ${threw ?? '沒丟'}`)
  }
  return bad
}

/** 逐地區:內建 minDays 表 vs CLDR 48 快照。地區碼 AA–ZZ(略過 Intl 正規化掉的別名)+ 每個合法的兩字母語言碼(照 likely subtags 補地區)。 */
function sweepMinDays(lib) {
  const expectFor = (region) => Number(CLDR48_MIN_DAYS[region] ?? CLDR48_MIN_DAYS['001'])
  const diffs = []
  let count = 0
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (const a of A) for (const b of A) {
    const region = a + b
    let canonical
    try { canonical = new Intl.Locale(`und-${region}`).region } catch { continue }
    if (canonical !== region) continue
    count++
    const got = lib.resolveFirstWeekMinDays(`und-${region}`)
    if (got !== expectFor(region)) diffs.push(`und-${region}:CLDR 48 ${expectFor(region)} / 內建表 ${got}`)
  }
  for (const a of 'abcdefghijklmnopqrstuvwxyz') for (const b of 'abcdefghijklmnopqrstuvwxyz') {
    let loc
    try { loc = new Intl.Locale(a + b) } catch { continue }
    count++
    const want = expectFor(loc.maximize().region)
    const got = lib.resolveFirstWeekMinDays(a + b)
    if (got !== want) diffs.push(`${a + b}(補成 ${loc.maximize().region}):CLDR 48 ${want} / 內建表 ${got}`)
  }
  // 快照裡被 Intl 正規化掉的別名(查表時拿不到,只印出來讓人看見)
  const aliases = Object.keys(CLDR48_MIN_DAYS).filter((r) => r !== '001' && new Intl.Locale(`und-${r}`).region !== r)
    .map((r) => `${r} → ${new Intl.Locale(`und-${r}`).region}`)
  return { count, diffs, aliases }
}

/** 週數錨點:週起始日與第一週天數都由 lib 算(不是測試自己寫),餵 date-fns getWeek。 */
function checkWeekNumbers(lib) {
  const bad = []
  for (const path of PATHS) {
    for (const [tag, [y, m, d], want] of WEEK_NUMBER_ANCHORS) {
      const got = withPath(path, () => getWeek(new Date(y, m - 1, d, 12), {
        weekStartsOn: lib.resolveWeekStartsOn(tag), firstWeekContainsDate: lib.resolveFirstWeekMinDays(tag),
      }))
      if (got !== want) bad.push(`[${path}] 週數 ${tag} ${y}-${m}-${d}:期望第 ${want} 週 實得第 ${got} 週`)
    }
  }
  return bad
}

/** 逐地區:內建表(table 路)vs 執行環境的 CLDR(native 路)。回不同的那些標籤(週起始日 diffs、週末 weekendDiffs)。 */
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
  const weekendDiffs = []
  for (const tag of tags) {
    const native = withPath('native', () => lib.resolveWeekStartsOn(tag))
    const table = withPath('table', () => lib.resolveWeekStartsOn(tag))
    if (native !== table) diffs.push(`${tag}:原生 ${native} / 內建表 ${table}`)
    const nativeWeekend = sortedDays(withPath('native', () => lib.resolveWeekend(tag)))
    const tableWeekend = sortedDays(withPath('table', () => lib.resolveWeekend(tag)))
    if (nativeWeekend !== tableWeekend) weekendDiffs.push(`${tag}:原生週末 ${nativeWeekend} / 內建表 ${tableWeekend}`)
  }
  return { count: tags.length, diffs, weekendDiffs }
}

// 已知、檔頭寫明的差異:-u-rg- 只有原生那條認(ICU 的接受規則不規則,後備不猜)。這裡只印出來讓人看見範圍,不算紅也不算綠。
function knownRgDivergence(lib) {
  return [
    ...['en-GB-u-rg-uszzzz', 'en-US-u-rg-gbzzzz', 'en-GB-u-ca-iso8601-rg-twzzzz'].map((tag) =>
      `週起始日 ${tag}:原生 ${withPath('native', () => lib.resolveWeekStartsOn(tag))} / 內建表 ${withPath('table', () => lib.resolveWeekStartsOn(tag))}`),
    ...['en-US-u-rg-egzzzz', 'ar-EG-u-rg-uszzzz'].map((tag) =>
      `週末 ${tag}:原生 ${sortedDays(withPath('native', () => lib.resolveWeekend(tag)))} / 內建表 ${sortedDays(withPath('table', () => lib.resolveWeekend(tag)))}`),
    // minDays 沒有原生那條:rg 一律不讀(en-US-u-rg-gbzzzz 的原生週起始日是 GB 的週一,第一週天數仍是 US 的 1)
    ...['en-US-u-rg-gbzzzz'].map((tag) => `第一週 ${tag}:三條路都 ${lib.resolveFirstWeekMinDays(tag)}(rg 不讀)`),
  ]
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
  // Calendar(calendar.spec.md「資料語意」週起始日【WS(定)】、「Cell 規則」隱藏週末 / 週數欄):三件事都經 lib/date-locale,不各自判
  if (!/resolveWeekStartsOn\(\s*locale\s*,\s*weekStartsOn\s*\)/.test(code.calendar)) bad.push('Calendar 沒有用 resolveWeekStartsOn(locale, weekStartsOn)')
  if (!/resolveWeekend\(\s*locale\s*\)/.test(code.calendar)) bad.push('Calendar 的隱藏週末沒有用 resolveWeekend(locale)')
  if (!/resolveFirstWeekMinDays\(\s*locale\s*\)/.test(code.calendar)) bad.push('Calendar 的週數沒有用 resolveFirstWeekMinDays(locale)')
  const weekCalls = [...code.calendar.matchAll(/\bgetWeek\(([^)]*)\)/g)]
  if (weekCalls.length === 0 || weekCalls.some((m) => !/weekStartsOn:\s*resolvedWeekStartsOn\s*,\s*firstWeekContainsDate:\s*firstWeekMinDays\b/.test(m[1]))) {
    bad.push(`Calendar 的週數 getWeek 有 ${weekCalls.length} 處,沒有每一處都帶解析後的週起始日與第一週天數(weekStartsOn: resolvedWeekStartsOn, firstWeekContainsDate: firstWeekMinDays)`)
  }
  const weekBounds = [...code.calendar.matchAll(/\b(startOfWeek|endOfWeek)\(([^)]*)\)/g)]
  const unresolved = weekBounds.filter((m) => !/weekStartsOn:\s*resolvedWeekStartsOn\b/.test(m[2]))
  if (weekBounds.length === 0 || unresolved.length) bad.push(`Calendar 的 startOfWeek / endOfWeek 有 ${unresolved.length} 處沒讀解析後的週起始日:${unresolved.map((m) => m[0]).join(';')}`)
  if (/options\??\.weekStartsOn|weekStartsOn:\s*\d/.test(code.calendar)) bad.push('Calendar 又在讀 date-fns 語系物件的週起始日或寫死 weekStartsOn: <數字>')
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
    [`週末判定表(${WEEKEND_TABLE.length} 個語系 + ${WEEKEND_OVERRIDE_TABLE.length} 格預設 + 原生 rg 一格 + 不合法代碼)× 三條路`, checkWeekend(lib)],
    [`第一週判定表(${MIN_DAYS_TABLE.length} 個語系 + ${MIN_DAYS_OVERRIDE_TABLE.length} 格預設 + 不合法代碼)× 三條路`, checkMinDays(lib)],
  ]
  const sweep = sweepLib(lib)
  sections.push([`內建 CLDR 週起始日表 vs 執行環境 CLDR(ICU ${process.versions.icu} / CLDR ${process.versions.cldr}),${sweep.count} 個標籤逐一比對`, sweep.diffs])
  sections.push([`內建 CLDR 週末表 vs 執行環境 CLDR(同一批 ${sweep.count} 個標籤,getWeekInfo 拿掉時後備 = 原生)`, sweep.weekendDiffs])
  const minDaysSweep = sweepMinDays(lib)
  sections.push([`內建 minDays 表 vs CLDR 48 快照(${minDaysSweep.count} 個地區碼與語言碼逐一比對;快照裡被 Intl 正規化掉的別名:${minDaysSweep.aliases.join('、') || '無'})`, minDaysSweep.diffs])
  sections.push([`週數錨點(${WEEK_NUMBER_ANCHORS.length} 格 × 三條路,date-fns getWeek ← lib 的週起始日 + 第一週天數)`, checkWeekNumbers(lib)])
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
  if (process.versions.cldr !== '48.0') console.log(`\n(提示)執行環境的 CLDR 是 ${process.versions.cldr},不是 48:minDays 沒有原生可比、只對內嵌的 CLDR 48 快照,換版時要人工對新版的 weekData.json minDays`)
  if (fail) { console.log(`\n✗ ${fail} 處不符`); process.exit(1) }
  console.log('\n✓ 週起始日 / 週末 / 第一週:規則、內建表、快照、週數錨點、篩選、消費端全部相符')
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
    name: '原生 firstDay / weekend 不換算(週日回 7)',
    lib: replaceOnce(libSource, '((firstDay % 7) as WeekStartsOn)', '(firstDay as WeekStartsOn)', '拿掉 % 7'),
    expect: (bad) => bad.lib.some((b) => b.startsWith('[native] zh-TW:')) && bad.lib.some((b) => b.startsWith('[legacy] en-US:'))
      && bad.weekend.some((b) => b.startsWith('[native] 週末 zh-TW:')) && bad.weekendSweep.some((b) => b.startsWith('und-US:')),
  },
  {
    name: '忽略 weekStartsOn 參數',
    lib: replaceOnce(libSource, '  if (override !== undefined) return override\n', '', '忽略參數'),
    expect: (bad) => bad.lib.some((b) => b.includes('weekStartsOn 參數壓過語系')),
  },
  // (a) 週末表與原生逐地區相同:表裡改掉一個地區 → 沒有 getWeekInfo 的瀏覽器上印度的週末變成六日
  {
    name: '週末表拿掉 IN(hi-IN 在沒有 getWeekInfo 的瀏覽器變成週六、週日)',
    lib: replaceOnce(libSource, "[[0], 'IN UG']", "[[0], 'UG']", '週末拿掉 IN'),
    expect: (bad) => bad.weekend.some((b) => b.startsWith('[table] 週末 hi-IN:')) && !bad.weekend.some((b) => b.startsWith('[native] 週末 hi-IN:'))
      && bad.weekendSweep.some((b) => b.startsWith('und-IN:')),
  },
  // (c) getWeekInfo 拿掉時後備 = 原生:後備不照 likely subtags 補地區 → 只寫語言碼的語系(ar / fa / hi)週末回世界預設
  {
    name: '後備不補地區(ar 在沒有 getWeekInfo 時週末變成六日)',
    lib: replaceOnce(libSource, 'return loc.region ?? loc.maximize().region', 'return loc.region', '不補地區'),
    expect: (bad) => bad.weekend.some((b) => b.startsWith('[table] 週末 ar:')) && bad.weekendSweep.some((b) => b.startsWith('ar:'))
      && !bad.weekend.some((b) => b.startsWith('[native] 週末 ar:')),
  },
  // (c) 原生那條真的被問到:週末一律查表 → 只有原生認的 rg 那格三條路答案變成一樣
  {
    name: '週末不問原生(一律查內建表)',
    lib: replaceOnce(libSource, 'return new Set(nativeWeekend(loc) ?? tableWeekend(loc))', 'return new Set(tableWeekend(loc))', '週末不問原生'),
    expect: (bad) => bad.weekend.some((b) => b.startsWith('[native] 週末 en-US-u-rg-egzzzz')) && bad.weekend.some((b) => b.startsWith('[legacy] 週末 en-US-u-rg-egzzzz')),
  },
  // (b) minDays 表與 CLDR 48 快照逐地區相同 + 週數錨點
  {
    name: 'minDays 表拿掉 DE(德國週數從 ISO 變成含 1/1 那週算第 1 週)',
    lib: replaceOnce(libSource, ' CZ DE DK ', ' CZ DK ', 'minDays 拿掉 DE'),
    expect: (bad) => bad.minDays.some((b) => b.startsWith('[table] 第一週 de-DE:')) && bad.minDaysSweep.some((b) => b.startsWith('und-DE:'))
      && bad.anchors.some((b) => b.startsWith('[native] 週數 de-DE 2027-1-1:')) && !bad.anchors.some((b) => b.includes('en-US')),
  },
  {
    name: 'iso8601 不回 4(en-US-u-ca-iso8601 的週數不是 ISO)',
    lib: replaceOnce(libSource, "if (!hasRegionOverride && loc.calendar === 'iso8601') return 4", 'if (false) return 4', 'iso8601 不回 4'),
    expect: (bad) => bad.minDays.some((b) => b.startsWith('[native] 第一週 en-US-u-ca-iso8601:')) && bad.minDaysSweep.length === 0,
  },
]
const FILTER_MUTANT = replaceOnce(filterTreeSource, 'const week = { weekStartsOn }', 'const week = { weekStartsOn: 1 as const }', '篩選寫死週一')
const CONSUMER_MUTANTS = [
  ['DateGrid 改回讀 date-fns 物件', 'dateGrid', (s) => replaceOnce(s, 'weekStartsOn={resolvedWeekStartsOn}', 'weekStartsOn={locale?.options?.weekStartsOn}', 'DateGrid 讀物件'), /DateGrid/],
  ['DatePicker 區間的 <DateGrid 沒帶週起始日', 'datePicker', (s) => replaceOnce(s, '                  weekStartsOn={resolvedWeekStartsOn}\n', '', 'Range 不帶'), /<DateGrid 沒帶/],
  ['TimePicker 預設語系改回 en-US', 'timePicker', (s) => replaceOnce(s, 'locale = DEFAULT_DATE_LOCALE,', "locale = 'en-US',", 'TimePicker en-US'), /time-picker\.tsx 還有寫死的 'en-US'/],
  ['Calendar 預設語系改回 en-US', 'calendar', (s) => replaceOnce(s, 'locale = DEFAULT_DATE_LOCALE,', "locale = 'en-US',", 'Calendar en-US'), /calendar\.tsx 還有寫死的 'en-US'/],
  ['Calendar 週起始日寫死週日(不經語系)', 'calendar', (s) => replaceOnce(s, 'resolveWeekStartsOn(locale, weekStartsOn)', '(weekStartsOn ?? 0)', 'Calendar 寫死週日'), /Calendar 沒有用 resolveWeekStartsOn/],
  ['Calendar 隱藏週末寫死週六日', 'calendar', (s) => replaceOnce(s, 'resolveWeekend(locale)', 'new Set([0, 6])', 'Calendar 週末寫死'), /Calendar 的隱藏週末沒有用 resolveWeekend/],
  ['Calendar 週數的第一週天數寫死 1', 'calendar', (s) => replaceOnce(s, 'firstWeekContainsDate: firstWeekMinDays', 'firstWeekContainsDate: 1', 'Calendar 第一週寫死'), /Calendar 的週數 getWeek/],
  ['Calendar Home 寫死週一', 'calendar', (s) => replaceOnce(s, 'startOfWeek(current, { weekStartsOn: resolvedWeekStartsOn })', 'startOfWeek(current, { weekStartsOn: 1 })', 'Calendar Home 寫死'), /startOfWeek \/ endOfWeek 有 1 處/],
  ['篩選寫死週一(2026-11-24 前的形狀)', 'filterTree', (s) => replaceOnce(s, 'const week = { weekStartsOn }', 'const week = { weekStartsOn: 1 }', '寫死週一'), /寫死了 weekStartsOn/],
  ['新增條件(newCondition)漏寫週起始日', 'filterPanel', (s) => replaceOnce(s, '  weekStartsOn: weekStartsOnOf(firstCol),\n', '', 'newCondition 漏寫'), /datePrecisionOf\(firstCol\) 卻沒寫/],
  ['日期格編輯器沒帶這一欄的週起始日', 'cellRegistry', (s) => replaceOnce(s, 'weekStartsOn={resolveWeekStartsOn(meta?.locale, meta?.weekStartsOn)}', '', '格編輯器漏帶'), /日期格編輯器/],
  ['篩選值的區間日期選擇器漏一個', 'valuePicker', (s) => replaceOnce(s, '          showTime\n          weekStartsOn={colInfo?.weekStartsOn}\n', '          showTime\n', '值選擇器漏帶'), /篩選值的日期選擇器/],
]

let missed = 0
const mutantFiles = [
  'week-start-lib-no-tw.mjs', 'week-start-lib-no-fw.mjs', 'week-start-lib-iso-day.mjs', 'week-start-lib-ignore-override.mjs',
  'week-start-lib-weekend-no-in.mjs', 'week-start-lib-no-likely-region.mjs', 'week-start-lib-weekend-no-native.mjs',
  'week-start-lib-min-days-no-de.mjs', 'week-start-lib-min-days-no-iso.mjs',
]
if (mutantFiles.length !== MUTANTS.length) instrumentFail(`對照組 ${MUTANTS.length} 個、打包檔名 ${mutantFiles.length} 個,對不上`)
for (const [i, m] of MUTANTS.entries()) await writeLib(mutantFiles[i], m.lib)
const loaded = [
  await import('./.gate-bundles/week-start-lib-no-tw.mjs'),
  await import('./.gate-bundles/week-start-lib-no-fw.mjs'),
  await import('./.gate-bundles/week-start-lib-iso-day.mjs'),
  await import('./.gate-bundles/week-start-lib-ignore-override.mjs'),
  await import('./.gate-bundles/week-start-lib-weekend-no-in.mjs'),
  await import('./.gate-bundles/week-start-lib-no-likely-region.mjs'),
  await import('./.gate-bundles/week-start-lib-weekend-no-native.mjs'),
  await import('./.gate-bundles/week-start-lib-min-days-no-de.mjs'),
  await import('./.gate-bundles/week-start-lib-min-days-no-iso.mjs'),
]
for (const [i, m] of MUTANTS.entries()) {
  const sweep = sweepLib(loaded[i])
  const bad = {
    lib: checkLib(loaded[i]), sweep: sweep.diffs, weekend: checkWeekend(loaded[i]), weekendSweep: sweep.weekendDiffs,
    minDays: checkMinDays(loaded[i]), minDaysSweep: sweepMinDays(loaded[i]).diffs, anchors: checkWeekNumbers(loaded[i]),
  }
  const caught = m.expect(bad)
  const tally = `週起始日 ${bad.lib.length} 格 / 逐地區 ${bad.sweep.length};週末 ${bad.weekend.length} 格 / 逐地區 ${bad.weekendSweep.length};第一週 ${bad.minDays.length} 格 / 快照 ${bad.minDaysSweep.length};週數錨點 ${bad.anchors.length}`
  console.log(`${caught ? '✓' : '✗'} 對照組「${m.name}」${caught ? '被抓到' : '沒被抓到'}(${tally})`)
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
