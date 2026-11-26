#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DatePicker 的日期時間文字只有一份判定(packages/design-system/src/components/DatePicker/range-format.ts),而且照
 *        date-picker.spec.md「區間檢視合併(formatRange)」「格式化」「Typed input」與 DATE-TIME(定)2026-11-26
 *        (user 點選「時間跟語系(12 / 24)、日期一律補零,兩者都能單獨覆寫」;協調者依同卡留言回覆「日期一律補零、不另給補零開關」)做:
 *        (a) `formatRange`(檢視模式把起訖寫成一段):zh-TW / en-US / en-GB × 同一天有時段 / 同一天下午 / 跨日全天 / 跨日有時段 / 同一刻、
 *            zh-TW / en-US × 一端空,各得規格表寫的那一段字 —— 日期一律兩位數月日(ICU 在區間丟掉的零補回)、時間 12 / 24 跟語系
 *            (zh-TW「上午10:00」、en-US「10:00 AM」、en-GB「10:00」);只有日期的跨月跨年、有秒(ICU 也丟零)、showTime 但兩端都沒時間、
 *            只有一端帶時間、起點晚於終點、Invalid Date、環境沒有 formatRangeToParts、consumer 傳 formatOptions(dateStyle 補 timeStyle、
 *            其餘補預設時間、自己寫了時間就不補、自己寫 month: 'numeric' 就不補零)各一格;呼叫端注入的 formatter 工廠真的被用到。
 *        (b) 合併不了而退回兩段時,每一端(formatDateRangeEndpoint)用合併的同一套寫法:zh-TW / en-US / en-GB × 有時段、
 *            zh-TW / en-US × 只有日期、showTime 但這一端沒時間、沒開 showTime、有秒、個位數月日、沒值 / Invalid Date 回 null、
 *            consumer dateStyle、注入的工廠被用到,各一格。
 *        (c) 打字解析的時間段(parseTimeText):zh-TW「下午2:30」「上午12:00」「下午12:30」、en-US「2:30 PM」「12:05 am」、
 *            en-GB「2:30 pm」、沒有上下午的 24 小時「14:30」、帶秒各得對的時刻;「下午13:00」、認不得的字、前後都有字、24:00、
 *            分 61 各回 null;三個語系 × 0–23 點,預設時間寫法寫出來的字打回去都認得回同一個時刻(往返)。
 *        「同一頁日期樣式一致」這條性質直接量:預設選項在 zh-TW / en-US 一批日期上,DS 合併後的每一段(ICU 的段經 padRangeDateParts)
 *        與退回兩段的每一端的日期樣式(年月日字 / 斜線、補零、星期、括號、上下午)都等於單獨 format 的樣式。退回那一端的樣式從它實際
 *        呼叫的 formatter 錄下的 parts 量(不是假設它用了哪組選項;文字不是那份 parts 拼出來的 = 量不到 = 紅)。
 *        接線:date-picker.tsx 從 ./range-format import formatDateRange 與 formatDateRangeEndpoint;Range 的 view 分支把
 *        `locale ?? DEFAULT_DATE_LOCALE` 與 `getDateTimeFormatter` 收在一份共用選項、以 `formatRange ?` 為閘呼叫 formatDateRange(帶共用選項),
 *        回 null 時仍畫兩段(ArrowRight),兩端都經同一支 helper、開了 formatRange 才呼叫 formatDateRangeEndpoint(帶共用選項);
 *        `formatRange = false` 是預設。帶時間的顯示 formatDateOrDateTime 經 resolveDateRangeFormatOptions、不再接 timePartsToString;
 *        只有日期的 Intl 預設讀 DATE_RANGE_DEFAULT_DATE_OPTIONS(不寫字面);打字解析帶語系呼叫 parseTimeText。
 *        time-picker.tsx 的顯示預設讀 resolveTimeFormatOptions、不寫 hour12 / hourCycle 字面;calendar.tsx 月格時間預設讀
 *        DEFAULT_TIME_FORMAT_OPTIONS;calendar-event-detail.tsx 詳情時間欄平常與編輯中都傳同一份 readFormat。
 *        靜態:range-format.ts 檔頭 10 行內 @internal、帶「── 消費的 SSOT ──」、不 import 任何模組、不開 timeZone;DatePicker/index.ts 不轉出它。
 *   紅: 判定表任一格不符(期望值照規格逐格手寫、非 ASCII 空白寫成 \u 跳脫,不是抄輸出)→ exit 1;樣式性質有任一筆不一致 → exit 1;
 *        靜態或接線任一條不符 → exit 1。
 *        對照組(主判定也跑):同一支樣式檢查換成「區間不補零(ICU 原樣)」「dateStyle: 'full'」、以及「退回兩段不補零(2026-11-25 版)」
 *        必須各抓到不一致 —— 抓不到 = 儀器失效(exit 2)。
 *        `--selftest`:range-format.ts 的行為突變(含「拿掉補零」「時間寫死 h23」「上下午寫死英文」)與靜態突變、date-picker.tsx /
 *        time-picker.tsx / calendar.tsx / calendar-event-detail.tsx 的接線突變(清單見檔尾 MUTANTS / STATIC_MUTANTS / WIRING_MUTANTS),
 *        各自必須讓指定的格紅;沒被抓到 → exit 1。
 *   綠: 全部相符時綠。純函式 + 靜態讀檔;無網路、無亂數、無瀏覽器、不讀時鐘(日期一律以本地時間建構),重複跑結果恆等。
 *   儀器失效(exit 2,印 INSTRUMENT-FAIL): esbuild 打包失敗、取不到出口、執行環境沒有 Intl formatRangeToParts、對照組抓不到、
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
const TIME_PICKER_PATH = 'packages/design-system/src/components/TimePicker/time-picker.tsx'
const CALENDAR_PATH = 'packages/design-system/src/components/Calendar/calendar.tsx'
const DETAIL_PATH = 'packages/design-system/src/components/Calendar/calendar-event-detail.tsx'
const SELFTEST = process.argv.includes('--selftest')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const instrumentFail = (msg) => { console.error(`INSTRUMENT-FAIL: ${msg}`); process.exit(2) }
mkdirSync(join(ROOT, 'scripts/.gate-bundles'), { recursive: true })

if (typeof new Intl.DateTimeFormat('zh-TW').formatRangeToParts !== 'function') instrumentFail('執行環境沒有 Intl.DateTimeFormat.prototype.formatRangeToParts')

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
const EXPORTS = ['formatDateRange', 'formatDateRangeEndpoint', 'resolveDateRangeFormatOptions', 'resolveTimeFormatOptions', 'padRangeDateParts', 'parseTimeText']
const assertExports = (lib, label) => {
  const missing = EXPORTS.filter((name) => typeof lib?.[name] !== 'function')
  if (missing.length) instrumentFail(`${label} 取不到出口:${missing.join('、')}(出口名稱改了?)`)
  if (!lib.DATE_RANGE_DEFAULT_DATE_OPTIONS) instrumentFail(`${label} 取不到 DATE_RANGE_DEFAULT_DATE_OPTIONS`)
  if (!lib.DEFAULT_TIME_FORMAT_OPTIONS) instrumentFail(`${label} 取不到 DEFAULT_TIME_FORMAT_OPTIONS`)
}

// ── 判定表 ────────────────────────────────────────────────────────────────────────────────────────
const d = (y, m, day, h = 0, mi = 0, s = 0) => new Date(y, m - 1, day, h, mi, s)
const THIN = '\u2009' // ICU 在區間分隔號兩側(zh-TW 也在日期與時間之間)放的窄空白 U+2009;寫成跳脫,原始碼裡肉眼看不到它
const NNBSP = '\u202f' // ICU 在 en-US 區間的時間與 AM / PM 之間放的窄不換行空白 U+202F(V8 的單獨 format 換成一般空白,區間沒換)
const NDASH = '–'
const R = `${THIN}${NDASH}${THIN}`
const nativeFactory = (locale, options) => new Intl.DateTimeFormat(locale, options)
/** 一格的輸入:預設 zh-TW、有時段兩端都帶時間;值以本地時間建構,不經被測的解析 */
const timed = (start, end, extra = {}) => ({ start, end, startHasTime: true, endHasTime: true, showTime: true, showSeconds: false, locale: 'zh-TW', getFormatter: nativeFactory, ...extra })
const dated = (start, end, extra = {}) => ({ start, end, startHasTime: false, endHasTime: false, showTime: false, showSeconds: false, locale: 'zh-TW', getFormatter: nativeFactory, ...extra })
const EN = { locale: 'en-US' }
const GB = { locale: 'en-GB' }
/** 退回兩段時一端的輸入:預設 zh-TW、showTime、這一端帶時間 */
const ep = (date, extra = {}) => ({ date, hasTime: true, showTime: true, showSeconds: false, locale: 'zh-TW', getFormatter: nativeFactory, ...extra })
/** 解析結果寫成「時:分:秒」好比對;null 照實寫 */
const parsed = (lib, text, locale) => {
  const t = lib.parseTimeText(text, locale, nativeFactory)
  return t === null ? null : `${t.hours}:${t.minutes}:${t.seconds}`
}
/** 往返:三個語系 × 0–23 點的 :05,用預設時間寫法(含秒)寫出來,再打回去必須認得回同一個時刻;回不一致的那幾筆 */
function roundTrip(lib) {
  const bad = []
  for (const locale of ['zh-TW', 'en-US', 'en-GB']) {
    const f = new Intl.DateTimeFormat(locale, lib.resolveTimeFormatOptions(true))
    for (let hour = 0; hour < 24; hour++) {
      const text = f.format(d(2026, 7, 15, hour, 5, 9))
      const back = parsed(lib, text, locale)
      if (back !== `${hour}:5:9`) bad.push(`${locale}「${text}」→ ${back}`)
    }
  }
  return JSON.stringify(bad)
}

// [id, 說明, (lib) => 實得, 應得]
const ROWS = [
  // 規格表的情況 × 三個語系:日期一律兩位數月日、時間 12 / 24 跟語系
  ['T1zh', 'zh-TW 同一天有時段 → 日期只寫一次、12 小時', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 11))), '2026/07/15 上午10:00至11:00'],
  ['T1en', 'en-US 同一天有時段 → 日期只寫一次、12 小時', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 11), EN)), `07/15/2026, 10:00${R}11:00${NNBSP}AM`],
  ['T1gb', 'en-GB 同一天有時段 → 日期只寫一次、24 小時', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 11), GB)), `15/07/2026, 10:00${NDASH}11:00`],
  ['H1zh', 'zh-TW 同一天下午 → 下午2:30至4:00(決策卡例字)', (lib) => lib.formatDateRange(timed(d(2026, 7, 5, 14, 30), d(2026, 7, 5, 16))), '2026/07/05 下午2:30至4:00'],
  ['H1en', 'en-US 同一天下午 → 2:30 – 4:00 PM', (lib) => lib.formatDateRange(timed(d(2026, 7, 5, 14, 30), d(2026, 7, 5, 16), EN)), `07/05/2026, 2:30${R}4:00${NNBSP}PM`],
  ['H1gb', 'en-GB 同一天下午 → 14:30–16:00', (lib) => lib.formatDateRange(timed(d(2026, 7, 5, 14, 30), d(2026, 7, 5, 16), GB)), `05/07/2026, 14:30${NDASH}16:00`],
  ['T2zh', 'zh-TW 跨日全天 → 兩端兩位數月日(ICU 丟掉的零補回)', (lib) => lib.formatDateRange(dated(d(2026, 7, 15), d(2026, 7, 17))), '2026/07/15至2026/07/17'],
  ['T2en', 'en-US 跨日全天 → 兩端兩位數月日(ICU 丟掉的零補回)', (lib) => lib.formatDateRange(dated(d(2026, 7, 15), d(2026, 7, 17), EN)), `07/15/2026${R}07/17/2026`],
  ['T2gb', 'en-GB 跨日全天 → 兩端兩位數日月', (lib) => lib.formatDateRange(dated(d(2026, 7, 15), d(2026, 7, 17), GB)), `15/07/2026${R}17/07/2026`],
  ['T3zh', 'zh-TW 跨日有時段 → 兩端日期加時間', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 22), d(2026, 7, 16, 1))), `2026/07/15${THIN}下午10:00${R}2026/07/16${THIN}上午1:00`],
  ['T3en', 'en-US 跨日有時段 → 兩端日期加時間', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 22), d(2026, 7, 16, 1), EN)), `07/15/2026, 10:00${NNBSP}PM${R}07/16/2026, 1:00${NNBSP}AM`],
  ['T3gb', 'en-GB 跨日有時段 → 兩端日期加時間(24 小時)', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 22), d(2026, 7, 16, 1), GB)), `15/07/2026, 22:00${R}16/07/2026, 01:00`],
  ['T4zh', 'zh-TW 同一刻 → 只寫一個值', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 10))), `2026/07/15${THIN}上午10:00`],
  ['T4en', 'en-US 同一刻 → 只寫一個值', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 10), EN)), `07/15/2026, 10:00${NNBSP}AM`],
  ['T4gb', 'en-GB 同一刻 → 只寫一個值', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 10), GB)), '15/07/2026, 10:00'],
  ['T5zh', 'zh-TW 一端空(沒有結束)→ null = 照兩段顯示', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), undefined)), null],
  ['T5en', 'en-US 一端空(沒有結束)→ null = 照兩段顯示', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), undefined, EN)), null],
  // 其他列
  ['X1', '同一天全天 → 只寫一個日期', (lib) => lib.formatDateRange(dated(d(2026, 7, 15), d(2026, 7, 15))), '2026/07/15'],
  ['X2', '跨月全天(個位數月日補零)', (lib) => lib.formatDateRange(dated(d(2026, 7, 30), d(2026, 8, 2))), '2026/07/30至2026/08/02'],
  ['X3', '跨年全天(個位數月日補零)', (lib) => lib.formatDateRange(dated(d(2026, 12, 30), d(2027, 1, 2))), '2026/12/30至2027/01/02'],
  ['X4', 'showSeconds → 補秒(帶秒的區間 ICU 也丟零,補回)', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10, 0, 5), d(2026, 7, 15, 11, 0, 30), { showSeconds: true })), `2026/07/15 上午10:00:05${R}上午11:00:30`],
  ['X5', 'showTime 但兩端都只有日期 → 只寫日期(同兩段顯示不寫 00:00)', (lib) => lib.formatDateRange(dated(d(2026, 7, 15), d(2026, 7, 17), { showTime: true })), '2026/07/15至2026/07/17'],
  ['X6', 'showTime 但只有起點帶時間 → null(合併會吃掉一端的時間)', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 17), { endHasTime: false })), null],
  ['X7', '起點空 → null', (lib) => lib.formatDateRange(timed(undefined, d(2026, 7, 15, 11))), null],
  ['X8', 'Invalid Date → null', (lib) => lib.formatDateRange(timed(new Date(Number.NaN), d(2026, 7, 15, 11))), null],
  ['X9', '起點晚於終點 → null(照兩段原樣)', (lib) => lib.formatDateRange(dated(d(2026, 7, 17), d(2026, 7, 15))), null],
  ['X10', '環境沒有 formatRangeToParts → null', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 11), { getFormatter: () => ({ format: () => 'x' }) })), null],
  ['X11', 'consumer dateStyle: full + showTime → 補 timeStyle(語系自己的時間寫法)', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 11), { formatOptions: { dateStyle: 'full' } })), `2026年7月15日 星期三 上午10:00${NDASH}11:00`],
  ['X12', 'consumer dateStyle: full 只有日期跨日 → zh-TW 換成數字月日(陷阱 (a) 原貌,DS 不改寫)', (lib) => lib.formatDateRange(dated(d(2026, 7, 15), d(2026, 7, 17), { formatOptions: { dateStyle: 'full' } })), '2026/7/15星期三至2026/7/17星期五'],
  ['X13', 'consumer 月份縮寫 + showTime → 補預設時間(12 / 24 跟語系)', (lib) => lib.formatDateRange(timed(d(2026, 7, 15, 10), d(2026, 7, 15, 11), { locale: 'en-US', formatOptions: { year: 'numeric', month: 'short', day: 'numeric' } })), `Jul 15, 2026, 10:00${R}11:00${NNBSP}AM`],
  ['X14', 'consumer 自己寫了時間欄位 → 照它、不補', (lib) => JSON.stringify(lib.resolveDateRangeFormatOptions(true, true, { month: 'short', day: 'numeric', hour: 'numeric' })), JSON.stringify({ month: 'short', day: 'numeric', hour: 'numeric' })],
  ['X15', '預設選項(有時段、有秒)= 數字年月日兩位數月日 + 時(不指定 12 / 24)兩位數分秒', (lib) => JSON.stringify(lib.resolveDateRangeFormatOptions(true, true)), JSON.stringify({ year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', second: '2-digit' })],
  ['X16', '呼叫端注入的 formatter 工廠真的被用到(拿到 locale 與選項)', (lib) => {
    const calls = []
    const spy = (locale, options) => { calls.push([locale, options]); return new Intl.DateTimeFormat(locale, options) }
    lib.formatDateRange(dated(d(2026, 7, 15), d(2026, 7, 17), { getFormatter: spy, locale: 'en-US' }))
    return JSON.stringify(calls)
  }, JSON.stringify([['en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }]])],
  ['X17', "consumer 寫 month / day: 'numeric' → 照它、不補零(補零只補請求了兩位數的欄位)", (lib) => lib.formatDateRange(dated(d(2026, 7, 5), d(2026, 7, 7), { formatOptions: { year: 'numeric', month: 'numeric', day: 'numeric' } })), '2026/7/5至2026/7/7'],
  ['X18', "consumer 自己寫 hourCycle: 'h23' → 24 小時(覆寫 12 / 24 用既有參數)", (lib) => lib.formatDateRange(timed(d(2026, 7, 5, 14, 30), d(2026, 7, 5, 16), { formatOptions: { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } })), `2026/07/05 14:30 ${NDASH} 16:00`],
  // 退回兩段時的每一端(formatDateRangeEndpoint):與合併同一套寫法
  ['F1zh', 'zh-TW 退回兩段的一端(有時段)→ 兩位數月日 + 12 小時', (lib) => lib.formatDateRangeEndpoint(ep(d(2026, 7, 15, 10))), `2026/07/15${THIN}上午10:00`],
  ['F1en', 'en-US 退回兩段的一端(有時段)→ 兩位數月日 + 12 小時', (lib) => lib.formatDateRangeEndpoint(ep(d(2026, 7, 15, 10), EN)), '07/15/2026, 10:00 AM'],
  ['F1gb', 'en-GB 退回兩段的一端(有時段)→ 兩位數日月 + 24 小時', (lib) => lib.formatDateRangeEndpoint(ep(d(2026, 7, 15, 14, 30), GB)), '15/07/2026, 14:30'],
  ['F2zh', 'zh-TW 退回兩段的一端(只有日期)→ 兩位數月日', (lib) => lib.formatDateRangeEndpoint(ep(d(2026, 7, 17), { hasTime: false, showTime: false })), '2026/07/17'],
  ['F2en', 'en-US 退回兩段的一端(只有日期)→ 兩位數月日', (lib) => lib.formatDateRangeEndpoint(ep(d(2026, 7, 17), { hasTime: false, showTime: false, ...EN })), '07/17/2026'],
  ['F3', 'showTime 但這一端沒帶時間(只有一端帶時間的另一端)→ 只寫日期', (lib) => lib.formatDateRangeEndpoint(ep(d(2026, 7, 17), { hasTime: false })), '2026/07/17'],
  ['F4', '沒開 showTime、值帶時間 → 只寫日期(同兩段顯示)', (lib) => lib.formatDateRangeEndpoint(ep(d(2026, 7, 15, 10), { showTime: false })), '2026/07/15'],
  ['F5', 'showSeconds → 補秒', (lib) => lib.formatDateRangeEndpoint(ep(d(2026, 7, 15, 10, 0, 5), { showSeconds: true })), `2026/07/15${THIN}上午10:00:05`],
  ['F6', '個位數月日 → 補零(07 與 7 會不會混用就看這一格)', (lib) => lib.formatDateRangeEndpoint(ep(d(2026, 3, 5, 6, 5))), `2026/03/05${THIN}上午6:05`],
  ['F7', '這一端沒值 → null(呼叫端顯示 placeholder)', (lib) => lib.formatDateRangeEndpoint(ep(undefined)), null],
  ['F8', '這一端 Invalid Date → null(呼叫端照原樣)', (lib) => lib.formatDateRangeEndpoint(ep(new Date(Number.NaN))), null],
  ['F9', "consumer dateStyle: 'full' + showTime → 補 timeStyle(與合併同一套)", (lib) => lib.formatDateRangeEndpoint(ep(d(2026, 7, 15, 10), { formatOptions: { dateStyle: 'full' } })), '2026年7月15日 星期三 上午10:00'],
  ['F10', '退回兩段的一端也用呼叫端注入的 formatter 工廠(拿到 locale 與選項)', (lib) => {
    const calls = []
    const spy = (locale, options) => { calls.push([locale, options]); return new Intl.DateTimeFormat(locale, options) }
    lib.formatDateRangeEndpoint(ep(d(2026, 7, 15, 10), { getFormatter: spy, locale: 'en-US' }))
    return JSON.stringify(calls)
  }, JSON.stringify([['en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' }]])],
  // 打字解析的時間段(parseTimeText):顯示跟語系之後輸入框裡的寫法要打得回去
  ['Q1', 'zh-TW「下午2:30」→ 14:30', (lib) => parsed(lib, '下午2:30', 'zh-TW'), '14:30:0'],
  ['Q2', 'zh-TW「上午12:00」→ 0:00(午夜)', (lib) => parsed(lib, '上午12:00', 'zh-TW'), '0:0:0'],
  ['Q3', 'zh-TW「下午12:30」→ 12:30(中午)', (lib) => parsed(lib, '下午12:30', 'zh-TW'), '12:30:0'],
  ['Q4', 'zh-TW 沒有上下午「14:30」→ 24 小時照收', (lib) => parsed(lib, '14:30', 'zh-TW'), '14:30:0'],
  ['Q5', 'en-US「2:30 PM」→ 14:30', (lib) => parsed(lib, '2:30 PM', 'en-US'), '14:30:0'],
  ['Q6', 'en-US「12:05 am」(小寫)→ 0:05', (lib) => parsed(lib, '12:05 am', 'en-US'), '0:5:0'],
  ['Q7', 'en-GB「2:30 pm」→ 14:30(24 小時語系也認 12 小時寫法)', (lib) => parsed(lib, '2:30 pm', 'en-GB'), '14:30:0'],
  ['Q8', 'en-GB「14:30」→ 14:30', (lib) => parsed(lib, '14:30', 'en-GB'), '14:30:0'],
  ['Q9', 'zh-TW「下午13:00」→ null(上下午底下沒有 13 點)', (lib) => parsed(lib, '下午13:00', 'zh-TW'), null],
  ['Q10', 'zh-TW「中午2:30」→ null(這個語系 12 小時制寫不出「中午」)', (lib) => parsed(lib, '中午2:30', 'zh-TW'), null],
  ['Q11', '前後都有上下午字「下午2:30 PM」→ null', (lib) => parsed(lib, '下午2:30 PM', 'zh-TW'), null],
  ['Q12', '沒有上下午「24:00」→ null', (lib) => parsed(lib, '24:00', 'zh-TW'), null],
  ['Q13', 'en-US「2:61 PM」→ null(分 0–59)', (lib) => parsed(lib, '2:61 PM', 'en-US'), null],
  ['Q14', 'zh-TW 帶秒「下午2:30:15」→ 14:30:15', (lib) => parsed(lib, '下午2:30:15', 'zh-TW'), '14:30:15'],
  ['Q15', '往返:zh-TW / en-US / en-GB × 0–23 點,預設時間寫法寫出來的字打回去認得回同一個時刻', (lib) => roundTrip(lib), '[]'],
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
/** 錄下 formatter 每一次 format 實際寫出的 parts —— 退回兩段那一端的寫法從它實際呼叫的 formatter 量,不假設它用了哪組選項 */
function recordingFactory(log) {
  return (locale, options) => {
    const real = new Intl.DateTimeFormat(locale, options)
    return { format: (x) => { log.push(real.formatToParts(x)); return real.format(x) } }
  }
}
/**
 * 回不一致的那幾筆;resolveOptions(withTime) 給出要量的選項,rangeParts(formatter, options, a, b) 給出「畫面上那一段」的 parts
 * (DS 的合併 = ICU 的段經 padRangeDateParts;對照組換成 ICU 原樣)。
 * 「同一頁」的基準 = 這一批日期每一端單獨 format 的記號聯集;每一段合併的記號都必須落在基準裡、合起來也不能有同族兩種寫法;
 * 有時段與只有日期兩種寫法的日期部分(拿掉上下午)也要同一套。
 * endpoint(選填)= 退回兩段時一端的寫法(formatDateRangeEndpoint 或對照組的替身):同一批日期的每一端也必須落在同一個基準裡 ——
 * 開了 formatRange 的一頁上,合併的列與退回兩段的列並排出現。
 */
function styleMismatches(resolveOptions, rangeParts, endpoint) {
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
      const options = resolveOptions(withTime)
      const parts = rangeParts(new Intl.DateTimeFormat(locale, options), options, a, b)
      const tokens = styleTokens(parts)
      const outside = [...tokens].filter((t) => !base[withTime].has(t))
      const c = conflicts(new Set([...base[withTime], ...tokens]))
      if (outside.length || c.length) bad.push(`${locale} ${name}「${parts.map((p) => p.value).join('')}」出現單獨 format 沒有的寫法 ${outside.join(' ') || c.join('、')}(單獨 format:${show(base[withTime])})`)
    }
    if (!endpoint) continue
    for (const [name, a, b, withTime] of STYLE_PAIRS) for (const x of [a, b]) {
      const log = []
      let text
      try { text = endpoint({ date: x, hasTime: withTime, showTime: true, showSeconds: false, locale, getFormatter: recordingFactory(log) }) } catch (e) { bad.push(`${locale} ${name} 退回兩段的一端丟例外:${e.message}`); continue }
      const parts = log.at(-1)
      // V8 的單獨 format() 把 ICU 的 U+202F(時間與 AM / PM 之間)換成一般空白,formatToParts 沒換(Node 24.14.0 實測):比對前兩邊統一,
      // 只放過這一個已知差異 —— 其他任何字不同照舊算「不是注入的 formatter 寫出來的」
      const sameText = (x) => x.replace(/\u202f/g, ' ')
      if (!parts || sameText(parts.map((p) => p.value).join('')) !== sameText(text)) { bad.push(`${locale} ${name} 退回兩段的一端「${text}」不是注入的 formatter 寫出來的(量不到它用了哪一套寫法)`); continue }
      const tokens = styleTokens(parts)
      const outside = [...tokens].filter((t) => !base[withTime].has(t))
      const c = conflicts(new Set([...base[withTime], ...tokens]))
      if (outside.length || c.length) bad.push(`${locale} ${name} 退回兩段的一端「${text}」出現合併顯示沒有的寫法 ${outside.join(' ') || c.join('、')}(單獨 format:${show(base[withTime])})`)
    }
  }
  return bad
}
/** DS 畫面上的合併 = ICU 的段經 padRangeDateParts(與 formatDateRange 同一支) */
const dsRangeParts = (lib) => (formatter, options, a, b) => lib.padRangeDateParts(formatter.formatRangeToParts(a, b), options)
const rawRangeParts = (formatter, _options, a, b) => formatter.formatRangeToParts(a, b)

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
/** 切出一支頂層函式的本體(從 `function name(` 到下一個行首的 `}`) */
function functionBody(src, name) {
  const at = src.indexOf(`function ${name}(`)
  if (at === -1) return null
  const end = src.indexOf('\n}\n', at)
  return end === -1 ? null : src.slice(at, end)
}
function checkWiring(picker) {
  const bad = []
  if (!/import \{[^}]*\bformatDateRange\b[^}]*\bformatDateRangeEndpoint\b[^}]*\} from '\.\/range-format'/.test(picker)) bad.push("[W1] date-picker.tsx 沒有從 './range-format' import formatDateRange 與 formatDateRangeEndpoint")
  const branch = rangeViewBranch(picker)
  if (branch === null) { bad.push('[W2] 找不到 DatePickerRange 的 view 分支(結構改了,接線檢查要跟著改)'); return bad }
  if (!/formatRange\s*\?\s*formatDateRange\(\{/.test(branch)) bad.push('[W2] Range 的 view 分支沒有以 `formatRange ?` 為閘呼叫 formatDateRange')
  if (!/^\s+formatRange = false,$/m.test(picker)) bad.push('[W3] DatePickerRange 沒有把 formatRange 預設成 false')
  const shared = branch.match(/const rangeTextOptions = \{[^}]*\}/)?.[0] ?? ''
  if (!/locale: locale \?\? DEFAULT_DATE_LOCALE,/.test(shared)) bad.push('[W4] 共用選項 rangeTextOptions 沒傳 locale ?? DEFAULT_DATE_LOCALE')
  if (!/getFormatter: getDateTimeFormatter,/.test(shared)) bad.push('[W5] 共用選項 rangeTextOptions 沒傳 getDateTimeFormatter(formatter 快取)')
  if (!/if \(mergedText !== null\)/.test(branch) || !/<ArrowRight/.test(branch)) bad.push('[W6] 回 null 時沒有退回兩段版面(mergedText !== null 判斷 + ArrowRight 兩段)')
  const usesHelper = /formatRange \? formatDateRangeEndpoint\(\{[^}]*\.\.\.rangeTextOptions[^}]*\}\)/.test(branch)
    && /viewEndpointText\(startIso, startDate\)/.test(branch) && /viewEndpointText\(endIso, endDate\)/.test(branch)
    && (branch.match(/formatDateOrDateTime\(/g) ?? []).length === 1
  if (!usesHelper) bad.push('[W7] 退回兩段時沒有兩端都經 viewEndpointText(開了 formatRange 才以共用選項呼叫 formatDateRangeEndpoint;formatDateOrDateTime 只留在 helper 裡當沒開 / 解析不了的退路)')
  if (!/formatDateRange\(\{[^}]*\.\.\.rangeTextOptions[^}]*\}\)/.test(branch)) bad.push('[W8] 呼叫 formatDateRange 沒帶共用選項 rangeTextOptions(合併與退回兩段不是同一套寫法)')
  // 帶時間的顯示(單日、Range 兩段、edit 觸發文字、可打字輸入框的字):日期與時間一次交給 Intl,選項與合併同一支
  const dateTime = functionBody(picker, 'formatDateOrDateTime') ?? ''
  if (!/resolveDateRangeFormatOptions\(true, showSeconds, options\.formatOptions\)/.test(dateTime) || /timePartsToString\(/.test(dateTime)) bad.push('[W9] formatDateOrDateTime 沒有經 resolveDateRangeFormatOptions(true, showSeconds, options.formatOptions),或仍接 timePartsToString(時間寫死 24 小時)')
  const dateOnly = functionBody(picker, 'formatDate') ?? ''
  if (!/options\.formatOptions \?\? DATE_RANGE_DEFAULT_DATE_OPTIONS/.test(dateOnly) || /month: '2-digit'/.test(dateOnly)) bad.push('[W10] formatDate 的 Intl 預設沒讀 DATE_RANGE_DEFAULT_DATE_OPTIONS(另寫了一份字面)')
  const parse = functionBody(picker, 'parseDateInput') ?? ''
  if (!/parseTimeText\(timeText, opts\.locale, getDateTimeFormatter\)/.test(parse) || !/parseDateInput\(raw, \{ allowTime: showTime, locale: locale \?\? DEFAULT_DATE_LOCALE \}\)/.test(picker)) bad.push('[W11] 打字解析沒有帶語系呼叫 parseTimeText(輸入框顯示的上下午打不回去)')
  return bad
}
function checkConsumers({ timePicker, calendar, detail }) {
  const bad = []
  const formatTime = functionBody(timePicker, 'formatTime') ?? ''
  if (!/from '@\/design-system\/components\/DatePicker\/range-format'/.test(timePicker) || !/formatOptions = resolveTimeFormatOptions\(options\.showSeconds\)/.test(formatTime)) bad.push('[C1] time-picker.tsx 的顯示預設沒讀 range-format.ts resolveTimeFormatOptions(showSeconds)')
  if (/hour12\s*:|hourCycle\s*:/.test(timePicker.replace(/\/\/.*$|^\s*\*.*$/gm, ''))) bad.push('[C2] time-picker.tsx 程式碼裡寫了 hour12 / hourCycle 字面(12 / 24 應交給語系)')
  if (!/import \{[^}]*\bDEFAULT_TIME_FORMAT_OPTIONS\b[^}]*\} from '@\/design-system\/components\/DatePicker\/range-format'/.test(calendar) || !/const DEFAULT_EVENT_TIME_FORMAT: Readonly<Intl\.DateTimeFormatOptions> = DEFAULT_TIME_FORMAT_OPTIONS$/m.test(calendar)) bad.push('[C3] calendar.tsx 月格時間預設沒讀 DEFAULT_TIME_FORMAT_OPTIONS(另寫了一份)')
  if ((detail.match(/formatOptions=\{showTime \? readFormat\.timed : readFormat\.allDay\}/g) ?? []).length !== 2) bad.push('[C4] calendar-event-detail.tsx 詳情時間欄平常與編輯中沒有都傳同一份 readFormat(看和改會是兩種寫法)')
  return bad
}

const source = read(SOURCE_PATH)
const indexSource = read(`${DIR}/index.ts`)
const picker = read(PICKER_PATH)
const consumers = { timePicker: read(TIME_PICKER_PATH), calendar: read(CALENDAR_PATH), detail: read(DETAIL_PATH) }

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
  const mismatches = styleMismatches((withTime) => lib.resolveDateRangeFormatOptions(withTime, false), dsRangeParts(lib), lib.formatDateRangeEndpoint)
  if (mismatches.length === 0) console.log(`✓ P1 同一頁日期樣式一致:預設選項 × zh-TW / en-US × ${STYLE_PAIRS.length} 組日期,DS 合併的每一段與退回兩段的每一端都與單獨 format 同一種樣式`)
  else { console.log('✗ P1 同一頁日期樣式一致'); for (const x of mismatches) console.log(`   - ${x}`); fail += mismatches.length }
  // 對照組:同一支樣式檢查,換成被排除的寫法必須抓到不一致(抓不到 = 這支檢查量不到它要量的東西)
  // 第一組 = 拿掉補零:合併照 ICU 原樣(只有日期的跨日區間丟零),正是補零規則要擋的畫面
  // 第三組:合併照預設,退回兩段那一端換成 2026-11-25 版的不補零寫法 —— 同一頁一列 07、一列 7
  const unpaddedEndpoint = ({ date, hasTime, showTime, locale, getFormatter }) => getFormatter(locale, { year: 'numeric', month: 'numeric', day: 'numeric', ...(showTime && hasTime ? lib.resolveTimeFormatOptions(false) : {}) }).format(date)
  const CONTROLS = [
    ['區間不補零(ICU 原樣,拿掉 padRangeDateParts)', (withTime) => lib.resolveDateRangeFormatOptions(withTime, false), rawRangeParts],
    ["dateStyle: 'full'", (withTime) => (withTime ? { dateStyle: 'full', timeStyle: 'short' } : { dateStyle: 'full' }), dsRangeParts(lib)],
    ['退回兩段不補零(2026-11-25 版)', (withTime) => lib.resolveDateRangeFormatOptions(withTime, false), dsRangeParts(lib), unpaddedEndpoint],
  ]
  for (const [name, options, rangeParts, endpoint] of CONTROLS) {
    const found = styleMismatches(options, rangeParts, endpoint)
    if (found.length === 0) instrumentFail(`對照組「${name}」沒被樣式檢查抓到 —— 儀器量不到同一頁混用兩種日期寫法`)
    console.log(`✓ 對照組「${name}」被抓到 ${found.length} 筆不一致(例:${found[0]})`)
  }
  const staticBad = [...checkStatic(source, indexSource), ...checkWiring(picker), ...checkConsumers(consumers)]
  if (staticBad.length === 0) console.log('✓ S / W / C 靜態與接線:@internal + 消費的 SSOT、不 import、不開 timeZone、index 不轉出;date-picker.tsx 以 formatRange 為閘呼叫、預設 false、共用選項帶預設語系與快取、null 退回兩段且兩端用同一套寫法、帶時間的顯示與打字解析經 range-format;TimePicker / Calendar / 詳情讀同一份寫法')
  else { console.log('✗ S / W / C 靜態與接線'); for (const x of staticBad) console.log(`   - ${x}`); fail += staticBad.length }
  if (fail) { console.log(`\n✗ ${fail} 處不符`); process.exit(1) }
  console.log(`\n✓ DatePicker 日期時間文字:${ROWS.length} 格判定表、樣式性質、${CONTROLS.length} 個對照組與靜態接線全部相符`)
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
  ['環境沒有 formatRangeToParts 不退回', (s, n) => replaceOnce(s, "  if (typeof formatter.formatRangeToParts !== 'function') return null\n", '', n), ['X10']],
  ['預設日期改回不補零(2026-11-25 版)', (s, n) => replaceOnce(s, "  month: '2-digit',\n  day: '2-digit',\n", "  month: 'numeric',\n  day: 'numeric',\n", n), ['T1zh', 'T2zh', 'T2en', 'X1', 'F2zh', 'F6']],
  ["預設日期改成 dateStyle: 'full'", (s, n) => replaceOnce(s, "  year: 'numeric',\n  month: '2-digit',\n  day: '2-digit',\n", "  dateStyle: 'full',\n", n), ['T1zh', 'T2zh', 'P1']],
  ['區間不補零(拿掉 padRangeDateParts 的補回)', (s, n) => replaceOnce(s, 'padded.has(part.type) && /^[0-9]$/.test(part.value)', 'false && /^[0-9]$/.test(part.value)', n), ['T2zh', 'T2en', 'X2', 'X3', 'X4', 'P1']],
  ['補零不看請求(consumer 寫 numeric 也補)', (s, n) => replaceOnce(s, "options[field] === '2-digit'", 'true', n), ['X17']],
  ['時間寫死 24 小時(h23,不跟語系)', (s, n) => replaceOnce(s, "  hour: 'numeric',\n  minute: '2-digit',\n})", "  hour: 'numeric',\n  minute: '2-digit',\n  hourCycle: 'h23',\n})", n), ['T1zh', 'T1en', 'H1zh', 'H1en', 'F1zh']],
  ['showTime 但兩端沒時間也寫時間', (s, n) => replaceOnce(s, '  const withTime = showTime && startHasTime && endHasTime\n', '  const withTime = showTime\n', n), ['X5']],
  ['有秒不補秒', (s, n) => replaceOnce(s, "...(showSeconds ? { second: '2-digit' as const } : {})", '', n), ['X4', 'X15', 'F5']],
  ['dateStyle 也補時分(拿掉 timeStyle 那條)', (s, n) => replaceOnce(s, "  if ('dateStyle' in dateOptions) return { ...dateOptions, timeStyle: showSeconds ? 'medium' : 'short' }\n", '', n), ['X11']],
  ['consumer 寫了時間欄位仍補', (s, n) => replaceOnce(s, '  if (TIME_FIELDS.some((field) => field in dateOptions)) return dateOptions\n', '', n), ['X14']],
  ['不用 formatRange、自己把兩端各寫一次接起來', (s, n) => replaceOnce(s, "  return padRangeDateParts(formatter.formatRangeToParts(start, end), options).map((part) => part.value).join('')\n", "  return `${formatter.format(start)} – ${formatter.format(end)}`\n", n), ['T1zh', 'T4zh', 'X1']],
  ['不用呼叫端注入的工廠(一律 new Intl.DateTimeFormat)', (s, n) => replaceOnce(s, '(input.getFormatter ?? defaultFactory)(locale, options)', 'defaultFactory(locale, options)', n), ['X10', 'X16']],
  ['退回兩段的一端不補零(2026-11-25 版的畫面)', (s, n) => replaceOnce(s, '(locale, endpointOptions).format(date)', "(locale, { ...endpointOptions, month: 'numeric', day: 'numeric' }).format(date)", n), ['F1zh', 'F2zh', 'F6', 'P1']],
  ['退回兩段的一端不寫時間', (s, n) => replaceOnce(s, 'resolveDateRangeFormatOptions(showTime && hasTime, showSeconds, formatOptions)', 'resolveDateRangeFormatOptions(false, showSeconds, formatOptions)', n), ['F1zh', 'F1en', 'F1gb', 'F5', 'F6', 'F9']],
  ['退回兩段的一端不看自己有沒有時間', (s, n) => replaceOnce(s, 'resolveDateRangeFormatOptions(showTime && hasTime,', 'resolveDateRangeFormatOptions(showTime,', n), ['F3']],
  ['退回兩段的一端沒值 / 解析不了不回 null', (s, n) => replaceOnce(s, '  if (!date || Number.isNaN(date.getTime())) return null\n', '', n), ['F7', 'F8']],
  ['退回兩段的一端不用注入的工廠', (s, n) => replaceOnce(s, '(input.getFormatter ?? defaultFactory)(locale, endpointOptions)', 'defaultFactory(locale, endpointOptions)', n), ['F10', 'P1']],
  ['上下午的字寫死英文(不從這個語系反推)', (s, n) => replaceOnce(s, "getFormatter(locale, { hour: 'numeric', hourCycle: 'h12' })", "getFormatter('en-US', { hour: 'numeric', hourCycle: 'h12' })", n), ['Q1', 'Q2', 'Q3', 'Q14', 'Q15']],
  ['上下午的字大小寫要相同', (s, n) => replaceOnce(s, '${markers[0].toLocaleLowerCase(locale)}', '${markers[0]}', n), ['Q5', 'Q15']],
  ['沒有上下午時不限 0–23', (s, n) => replaceOnce(s, 'shownHour <= 23 ?', 'true ?', n), ['Q12']],
  ['認不得的上下午字照數字收', (s, n) => replaceOnce(s, '  return hours === undefined ? null : { hours, minutes, seconds }\n', '  return { hours: hours ?? shownHour, minutes, seconds }\n', n), ['Q9', 'Q10']],
  ['前後都有字也收', (s, n) => replaceOnce(s, '  if (markers.length > 1) return null\n', '', n), ['Q11']],
  ['分秒不驗 0–59', (s, n) => replaceOnce(s, '  if (minutes > 59 || seconds > 59) return null\n', '', n), ['Q13']],
]
const STATIC_MUTANTS = [
  ['檔頭拿掉 @internal', (s) => s.replace('@internal — ', ''), /\[S1\]/],
  ['拿掉「── 消費的 SSOT ──」段', (s) => s.replace('── 消費的 SSOT ──', '── 依據 ──'), /\[S2\]/],
  ['import 語系模組', (s) => `import { DEFAULT_DATE_LOCALE } from '../../lib/date-locale'\n${s}`, /\[S3\]/],
  ['開 timeZone 參數', (s) => s.replace('  locale: string\n  getFormatter?', '  locale: string\n  timeZone?: string\n  getFormatter?'), /\[S4\]/],
]
const RANGE_IMPORT = "import { formatDateRange, formatDateRangeEndpoint, DATE_RANGE_DEFAULT_DATE_OPTIONS, resolveDateRangeFormatOptions, parseTimeText } from './range-format'\n"
const WIRING_MUTANTS = [
  ['date-picker.tsx 拿掉 import', (p) => p.replace(RANGE_IMPORT, ''), /\[W1\]/],
  ['view 分支不呼叫(永遠兩段)', (p) => p.replace('const mergedText = formatRange\n        ? formatDateRange({', 'const mergedText = false\n        ? formatDateRange({'), /\[W2\]/],
  ['formatRange 預設改成 true', (p) => p.replace('      formatRange = false,\n', '      formatRange = true,\n'), /\[W3\]/],
  ['不傳預設語系', (p) => p.replace('locale: locale ?? DEFAULT_DATE_LOCALE,\n        getFormatter', "locale: locale ?? 'en-US',\n        getFormatter"), /\[W4\]/],
  ['不傳 formatter 快取', (p) => p.replace('        getFormatter: getDateTimeFormatter,\n', ''), /\[W5\]/],
  ['回 null 也不退回兩段', (p) => p.replace('if (mergedText !== null) {', 'if (true) {'), /\[W6\]/],
  ['退回兩段不呼叫 formatDateRangeEndpoint', (p) => p.replace('formatRange ? formatDateRangeEndpoint({', 'false ? formatDateRangeEndpoint({'), /\[W7\]/],
  ['退回兩段的結束端繞過 helper', (p) => p.replace('{endIso ? viewEndpointText(endIso, endDate) : resolvedPlaceholder[1]}', '{endIso ? formatDateOrDateTime(endIso, showTime, showSeconds, { formatOptions, locale }) : resolvedPlaceholder[1]}'), /\[W7\]/],
  ['合併不帶共用選項(自己另寫一份)', (p) => p.replace('            ...rangeTextOptions,\n          })', "            showTime,\n            showSeconds,\n            formatOptions,\n            locale: 'zh-TW',\n          })"), /\[W8\]/],
  ['帶時間的顯示改回接 24 小時 HH:MM(修正前)', (p) => p.replace('resolveDateRangeFormatOptions(true, showSeconds, options.formatOptions),\n  ).format(date)', 'resolveDateRangeFormatOptions(true, showSeconds, options.formatOptions),\n  ).format(date) + timePartsToString({ hours: 0, minutes: 0, seconds: 0 })'), /\[W9\]/],
  ['只有日期的 Intl 預設另寫字面', (p) => p.replace('options.formatOptions ?? DATE_RANGE_DEFAULT_DATE_OPTIONS', "options.formatOptions ?? { year: 'numeric', month: '2-digit', day: '2-digit' }"), /\[W10\]/],
  ['打字解析不帶語系', (p) => p.replace('parseDateInput(raw, { allowTime: showTime, locale: locale ?? DEFAULT_DATE_LOCALE })', "parseDateInput(raw, { allowTime: showTime, locale: 'zh-TW' })"), /\[W11\]/],
]
const CONSUMER_MUTANTS = [
  ['TimePicker 顯示預設改回寫死 24 小時', (c) => ({ ...c, timePicker: c.timePicker.replace('formatOptions = resolveTimeFormatOptions(options.showSeconds),', "formatOptions = { hour: '2-digit', minute: '2-digit', hour12: false },") }), /\[C1\]/],
  ['TimePicker 程式碼另寫 hourCycle', (c) => ({ ...c, timePicker: c.timePicker.replace('    locale = DEFAULT_DATE_LOCALE,\n  } = options', "    locale = DEFAULT_DATE_LOCALE,\n  } = { ...options, hourCycle: 'h23' }") }), /\[C2\]/],
  ['Calendar 月格時間預設另寫一份', (c) => ({ ...c, calendar: c.calendar.replace('const DEFAULT_EVENT_TIME_FORMAT: Readonly<Intl.DateTimeFormatOptions> = DEFAULT_TIME_FORMAT_OPTIONS', "const DEFAULT_EVENT_TIME_FORMAT: Readonly<Intl.DateTimeFormatOptions> = { hour: 'numeric', minute: '2-digit' }") }), /\[C3\]/],
  ['詳情編輯中不傳 readFormat(看和改兩種寫法)', (c) => ({ ...c, detail: c.detail.replace('              locale={locale}\n              formatOptions={showTime ? readFormat.timed : readFormat.allDay}\n', '              locale={locale}\n') }), /\[C4\]/],
]

const variants = [source, ...MUTANTS.map(([name, mutate]) => mutate(source, name))]
await bundle('date-range-format-mutants.mjs', variants)
const loaded = await import('./.gate-bundles/date-range-format-mutants.mjs')
assertExports(loaded.m0, '未突變的那一份')
const redOf = (lib) => {
  const red = [...runRows(lib)].filter(([, bad]) => bad.length > 0).map(([id]) => id)
  let mismatches
  try { mismatches = styleMismatches((withTime) => lib.resolveDateRangeFormatOptions(withTime, false), dsRangeParts(lib), lib.formatDateRangeEndpoint) } catch (e) { mismatches = [`例外:${e.message}`] }
  if (mismatches.length) red.push('P1')
  return red
}
const baselineRed = redOf(loaded.m0)
if (baselineRed.length) instrumentFail(`未突變的那一份本身就紅(${baselineRed.join('、')}),對照組無從比較 —— 先跑不帶 --selftest 的那一次`)
const baselineStatic = [...checkStatic(source, indexSource), ...checkWiring(picker), ...checkConsumers(consumers)]
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
for (const [name, mutate, pattern] of CONSUMER_MUTANTS) {
  const mutated = mutate(consumers)
  if (Object.keys(consumers).every((k) => mutated[k] === consumers[k])) instrumentFail(`消費端對照組「${name}」沒改到原始碼(片段找不到)`)
  const bad = checkConsumers(mutated)
  const caught = bad.some((b) => pattern.test(b))
  console.log(`${caught ? '✓' : '✗'} 消費端對照組「${name}」${caught ? '被抓到' : `沒被抓到(實得:${bad.join(' / ') || '0 筆'})`}`)
  if (!caught) missed++
}
const total = MUTANTS.length + STATIC_MUTANTS.length + 1 + WIRING_MUTANTS.length + CONSUMER_MUTANTS.length
if (missed) { console.log(`\n✗ selftest:${missed} / ${total} 個對照組沒被抓到 —— 判定表沒在驗那一條`); process.exit(1) }
console.log(`\n✓ selftest:${total} 個對照組都被指定的格抓到`)
