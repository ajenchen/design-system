/**
 * @internal — DatePicker 的日期時間文字:Range 檢視模式 `formatRange` 的合併判定、帶時間時的預設寫法、打字解析認上下午 —— 純函式,
 * 供判定表逐格驗(scripts/test-date-range-format.mjs)。不進 barrel / subpath(元件資料夾的 index 只轉出口 .tsx;consumer 用不到它,
 * 只有 DatePicker、TimePicker、Calendar 內部與測試消費)。
 *
 * ── 消費的 SSOT ──
 * - spec: date-picker.spec.md「區間檢視合併(formatRange)」(規則、判定表、世界級出處)、「格式化」;time-picker.spec.md「顯示格式化」;
 *   calendar.spec.md「資料語意」時間顯示
 * - 標準: ECMA-402 `Intl.DateTimeFormat.prototype.formatRange`(§11.5.8 PartitionDateTimeRangePattern:從 Era 往下逐欄比起訖,格式沒顯示的
 *   較粗欄位也比,比到沒有區間樣式的欄位才停;比過的欄位全部相同才只輸出一個值,否則以第一個(最大的)不同欄位選區間樣式,共用的欄位只寫一次。
 *   例:只寫時分的格式比 7/15 10:00 與 7/16 10:00,顯示的欄位一樣,但「日」不同 → 不合併)—— 合併規則全交給它,本檔不自己判斷「同一天」。
 *   「起訖在輸出精度下相同 → 只輸出一個值」是 MDN 的白話說法,不是規格原文。本檔呼叫的是同一段區間拆成一段一段的 `formatRangeToParts`
 * - 日期與時間的預設寫法: user 2026-11-26 決策卡 DATE-TIME(定)—— 點選「時間跟語系(12 / 24)、日期一律補零,兩者都能單獨覆寫」,
 *   同卡留言「補零這件事應該可以不用給覆寫？一律都補零？」(問句;協調者依此回覆「日期一律補零、不另給補零開關」)。
 *   日期 = 數字年月日、兩位數月日(`DATE_RANGE_DEFAULT_DATE_OPTIONS`);時間 = 時(不補)+ 兩位數分,12 / 24 小時不指定、交給語系
 *   (`DEFAULT_TIME_FORMAT_OPTIONS`;CLDR timeData:TW、US 12 小時,GB 24 小時;MDN hour12「the default is locale dependent」
 *   https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat)。
 *   覆寫用既有參數:DatePicker / TimePicker 的 `formatOptions`、Calendar 的 `eventTimeFormat`(寫了時間欄位就照它)。
 *   ICU 在區間裡會把要求兩位數的月日寫成一位數(zh-TW「2026/7/15至2026/7/17」),本檔照請求的 `'2-digit'` 把那幾段補回零再接起來
 *   (`padRangeDateParts`),不改其他字
 * - 語系預設與 formatter 快取: 由呼叫端傳入(`lib/date-locale.ts` `DEFAULT_DATE_LOCALE`、`date-picker.tsx` `getDateTimeFormatter`);
 *   本檔不 import 任何模組,Node 可直接讀、判定表不必經過 React
 *
 * 要保證的性質(逐字):**兩端都有值時輸出一段文字 —— 同一天自動合併、跨日寫兩端;同一頁的日期樣式一致(合併的列與退回兩段的列都算);
 * 合併不了的情況一律回 `null`,呼叫端照兩段版面顯示,每一端用 `formatDateRangeEndpoint`(與合併同一套寫法)。
 * 沒傳寫法時日期一律兩位數月日、時間的 12 / 24 跟語系;打字解析認得該語系寫出來的上下午。**
 */

/** 呼叫端注入的 formatter 工廠(date-picker.tsx 傳它的快取;測試傳 `new Intl.DateTimeFormat`) */
export type DateRangeFormatterFactory = (locale: string, options: Intl.DateTimeFormatOptions) => Intl.DateTimeFormat

export interface DateRangeTextInput {
  /** 起點(DatePicker 的 `isoToDate` 結果;undefined = 沒值或解析不了) */
  start: Date | undefined
  /** 終點(含;DatePicker.Range 的結束日本來就是「含」,本檔不做全天換算) */
  end: Date | undefined
  /** 起點的 ISO 字串有沒有時間部分 */
  startHasTime: boolean
  /** 終點的 ISO 字串有沒有時間部分 */
  endHasTime: boolean
  showTime: boolean
  showSeconds: boolean
  /** consumer 的日期寫法;沒傳 = `DATE_RANGE_DEFAULT_DATE_OPTIONS` */
  formatOptions?: Intl.DateTimeFormatOptions
  /** BCP 47;呼叫端已把「沒傳」換成 `DEFAULT_DATE_LOCALE` */
  locale: string
  getFormatter?: DateRangeFormatterFactory
}

/**
 * 日期的預設寫法:數字年月日、**兩位數月日**(`2026/07/15`)—— DATE-TIME(定)2026-11-26「日期一律補零」,不另給補零開關。
 * 與 DatePicker 兩段顯示的預設 `YYYY/MM/DD`(date-picker.tsx `formatDate`)同一組;Calendar 詳情時間欄的日期段也讀這一個。
 * ICU 在只有日期的跨日區間(與帶秒的區間)會丟掉補零 → `formatDateRange` 用 `padRangeDateParts` 補回,同一頁不會一列 07、一列 7。
 * (2026-11-25 版是「不補零」,理由是繞過 ICU 丟零【AI 推導】;已由 user 2026-11-26 的決定取代。)
 */
export const DATE_RANGE_DEFAULT_DATE_OPTIONS: Readonly<Intl.DateTimeFormatOptions> = Object.freeze({
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * 時間的預設寫法:時(不補零)+ 兩位數分,**不指定 12 / 24 小時** —— 交給語系(DATE-TIME(定)「時間跟語系(12 / 24)」):
 * zh-TW「下午2:30」、en-US「2:30 PM」、en-GB「14:30」。DatePicker 帶時間的顯示與合併顯示、TimePicker 的顯示、Calendar 月格的開始時間
 * 都讀這一個(與 Calendar 先前的預設 `{ hour: 'numeric', minute: '2-digit' }` 同值;FullCalendar eventTimeFormat 的預設也是這兩欄,
 * https://fullcalendar.io/docs/eventTimeFormat)。要固定 24 小時:呼叫端傳寫了時間欄位的 `formatOptions` / `eventTimeFormat`(例 `hourCycle: 'h23'`)。
 */
export const DEFAULT_TIME_FORMAT_OPTIONS: Readonly<Intl.DateTimeFormatOptions> = Object.freeze({
  hour: 'numeric',
  minute: '2-digit',
})

/** 預設時間寫法;帶秒(DatePicker / TimePicker 的 `showSeconds`)時補兩位數秒 */
export function resolveTimeFormatOptions(showSeconds: boolean): Intl.DateTimeFormatOptions {
  return { ...DEFAULT_TIME_FORMAT_OPTIONS, ...(showSeconds ? { second: '2-digit' as const } : {}) }
}

const TIME_FIELDS = ['hour', 'minute', 'second', 'fractionalSecondDigits', 'dayPeriod', 'timeStyle'] as const

/**
 * 實際交給 Intl 的選項(合併顯示、退回兩段的每一端、DatePicker 帶時間的顯示共用這一支)。日期段 = consumer 的 `formatOptions`(沒傳用預設);
 * 要寫時間而日期段沒有任何時間欄位時補上:用 `dateStyle` 的補 `timeStyle`(Intl 不准 dateStyle 與 hour 混用),其餘補預設時間寫法
 * (`resolveTimeFormatOptions`:12 / 24 跟語系,有秒再補秒)。consumer 自己寫了時間欄位 → 照它,不補。
 */
export function resolveDateRangeFormatOptions(
  withTime: boolean,
  showSeconds: boolean,
  formatOptions?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  const dateOptions: Intl.DateTimeFormatOptions = { ...(formatOptions ?? DATE_RANGE_DEFAULT_DATE_OPTIONS) }
  if (!withTime) return dateOptions
  if (TIME_FIELDS.some((field) => field in dateOptions)) return dateOptions
  if ('dateStyle' in dateOptions) return { ...dateOptions, timeStyle: showSeconds ? 'medium' : 'short' }
  return { ...dateOptions, ...resolveTimeFormatOptions(showSeconds) }
}

/** ICU 在區間裡可能丟掉補零的日期欄位(年本來就是 4 位數;時分秒照語系,不在「日期一律補零」的範圍) */
const PADDED_DATE_FIELDS = ['month', 'day'] as const

/** `formatRangeToParts` 的一段(`source` = startRange / endRange / shared) */
export interface DateRangePart {
  type: string
  value: string
  source?: string
}

/**
 * 把區間各段裡被 ICU 丟掉的日期補零補回:選項要求 `'2-digit'` 的月 / 日,值是一位數(ASCII 0–9)時前面補 0;其他段原樣(回新陣列,不改傳入的段)。
 * 只補請求了兩位數的欄位 —— consumer 傳 `month: 'numeric'` 照它、文字月份不是數字也不動。單獨 `format` 本來就照 `'2-digit'` 寫,不經過這裡。
 */
export function padRangeDateParts(parts: ReadonlyArray<DateRangePart>, options: Intl.DateTimeFormatOptions): DateRangePart[] {
  const padded = new Set<string>(PADDED_DATE_FIELDS.filter((field) => options[field] === '2-digit'))
  return parts.map((part) => (padded.has(part.type) && /^[0-9]$/.test(part.value) ? { ...part, value: `0${part.value}` } : part))
}

const defaultFactory: DateRangeFormatterFactory = (locale, options) => new Intl.DateTimeFormat(locale, options)

/** `formatRangeToParts` 是 ES2021 才進標準的方法;本套件 tsconfig 的 lib 是 ES2020,型別上沒有它,執行環境也要另外判斷有沒有 */
type RangeCapableFormatter = Intl.DateTimeFormat & {
  formatRangeToParts?: (startDate: Date, endDate: Date) => DateRangePart[]
}

/**
 * 合併後的一段文字;回 `null` = 不合併(呼叫端退回兩段版面,每一端用下方 `formatDateRangeEndpoint`)。不合併的情況(每一條都明寫,不靠 try/catch 兜 —— 判定表才量得到每一條):
 * - 只有一端有值,或任一端解析不了(Invalid Date;formatRange 對它丟 RangeError)
 * - 起點晚於終點:值本身有問題,照兩段讓人看到兩端(舊版引擎的 formatRange 對它丟 RangeError,新版照順序寫,兩種都不採)
 * - `showTime` 但一端有時間、一端沒有(合併會吃掉其中一端的時間)
 * - 執行環境沒有 `formatRangeToParts`(舊瀏覽器;與 `formatRange` 同一版 ES2021 進標準)
 * 起訖完全相同只輸出一個值、同一天合併、跨日寫兩端 —— 都是 `formatRange` 本身的行為(MDN:「If the start and end dates are
 * equivalent at the precision of the output, the output will only contain a single date.」;`formatRangeToParts` 是同一段字拆開)。
 * 本檔只把被丟掉的日期補零補回(`padRangeDateParts`)。
 * 語系代碼不合法時與兩段顯示一樣由 Intl 丟 RangeError(不在這裡吞掉,兩條路行為相同)。
 */
export function formatDateRange(input: DateRangeTextInput): string | null {
  const { start, end, startHasTime, endHasTime, showTime, showSeconds, formatOptions, locale } = input
  if (!start || !end) return null
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  if (start.getTime() > end.getTime()) return null
  if (showTime && startHasTime !== endHasTime) return null
  const withTime = showTime && startHasTime && endHasTime
  const options = resolveDateRangeFormatOptions(withTime, showSeconds, formatOptions)
  const formatter: RangeCapableFormatter = (input.getFormatter ?? defaultFactory)(locale, options)
  if (typeof formatter.formatRangeToParts !== 'function') return null
  return padRangeDateParts(formatter.formatRangeToParts(start, end), options).map((part) => part.value).join('')
}

/** 退回兩段時一端的輸入:沒值或解析不了的那一端傳 undefined */
export interface DateRangeEndpointInput extends Pick<DateRangeTextInput, 'showTime' | 'showSeconds' | 'formatOptions' | 'locale' | 'getFormatter'> {
  date: Date | undefined
  /** 這一端的 ISO 字串有沒有時間部分 */
  hasTime: boolean
}

/**
 * 開了 `formatRange`、但合併不了而退回兩段時,一端的文字【AI 推導 2026-11-25】:用合併顯示的同一套選項(`resolveDateRangeFormatOptions`)
 * 單獨 `format` —— 合併的列與退回兩段的列同一套日期與時間寫法(2026-11-26 起兩者都是兩位數月日、時間跟語系)。
 * 時間照這一端自己:`showTime` 且這一端帶時間才寫(與兩段顯示相同,只有一端帶時間時另一端只寫日期)。
 * 回 `null` = 這一端沒值或解析不了,呼叫端照原樣(與不開相同)。
 */
export function formatDateRangeEndpoint(input: DateRangeEndpointInput): string | null {
  const { date, hasTime, showTime, showSeconds, formatOptions, locale } = input
  if (!date || Number.isNaN(date.getTime())) return null
  const endpointOptions = resolveDateRangeFormatOptions(showTime && hasTime, showSeconds, formatOptions)
  return (input.getFormatter ?? defaultFactory)(locale, endpointOptions).format(date)
}

/** 一天中的時刻(與 TimePicker/time-columns.tsx `TimeParts` 同形狀;本檔不 import,所以另寫一份型別) */
export interface TimeOfDay {
  hours: number
  minutes: number
  seconds: number
}

/** 時間文字:前或後可帶一段非數字(上下午的字),中間是 時:分(:秒) */
const TIME_TEXT = /^(\D*?)\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(\D*)$/

/**
 * 這個語系 12 小時制寫出來的「上下午字 + 時」→ 24 小時的時:0–23 點逐一交給 Intl(`hourCycle: 'h12'`)寫一次,從 `formatToParts`
 * 讀回 dayPeriod 與 hour 兩段。上下午的字全部來自執行環境的 CLDR,本檔不寫死任何語言的字(zh-TW 上午 / 下午、en-US AM / PM、en-GB am / pm)。
 */
function dayPeriodHours(locale: string, getFormatter: DateRangeFormatterFactory): Map<string, number> {
  const formatter = getFormatter(locale, { hour: 'numeric', hourCycle: 'h12' })
  const table = new Map<string, number>()
  for (let hour = 0; hour < 24; hour++) {
    const parts = formatter.formatToParts(new Date(2000, 0, 1, hour))
    const period = parts.find((part) => part.type === 'dayPeriod')?.value
    const shown = Number(parts.find((part) => part.type === 'hour')?.value)
    if (period && Number.isInteger(shown)) table.set(`${period.toLocaleLowerCase(locale)}|${shown}`, hour)
  }
  return table
}

/**
 * 打字解析的時間段(DatePicker `typeable` 的輸入框:顯示跟語系之後,框裡是「下午2:30」「2:30 PM」這種寫法)【AI 推導 2026-11-26】:
 * - 沒有上下午的字 → 24 小時(0–23),與改前相同(「14:30」照舊打得進去);
 * - 有上下午的字 → 只認這個語系 12 小時制寫得出來的字(大小寫不分),時必須是那個字底下真的會出現的值(「下午13:00」不收);
 * - 分、秒 0–59;認不得的字、前後都有字 → `null`(呼叫端標 aria-invalid)。
 */
export function parseTimeText(text: string, locale: string, getFormatter: DateRangeFormatterFactory = defaultFactory): TimeOfDay | null {
  const match = text.trim().match(TIME_TEXT)
  if (!match) return null
  const [, before, hourText, minuteText, secondText, after] = match
  const markers = [before.trim(), after.trim()].filter(Boolean)
  if (markers.length > 1) return null
  const minutes = Number(minuteText)
  const seconds = Number(secondText ?? 0)
  if (minutes > 59 || seconds > 59) return null
  const shownHour = Number(hourText)
  if (markers.length === 0) return shownHour <= 23 ? { hours: shownHour, minutes, seconds } : null
  const hours = dayPeriodHours(locale, getFormatter).get(`${markers[0].toLocaleLowerCase(locale)}|${shownHour}`)
  return hours === undefined ? null : { hours, minutes, seconds }
}
