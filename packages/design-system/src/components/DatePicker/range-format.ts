/**
 * @internal — DatePicker.Range 檢視模式 `formatRange` 的文字判定 —— 純函式,供判定表逐格驗(scripts/test-date-range-format.mjs)。
 * 不進 barrel / subpath(元件資料夾的 index 只轉出口 .tsx;consumer 用不到它,只有 DatePicker 內部與測試消費)。
 *
 * ── 消費的 SSOT ──
 * - spec: date-picker.spec.md「區間檢視合併(formatRange)」(規則、判定表、世界級出處)
 * - 標準: ECMA-402 `Intl.DateTimeFormat.prototype.formatRange`(§11.5.8 PartitionDateTimeRangePattern:從 Era 往下逐欄比起訖,格式沒顯示的
 *   較粗欄位也比,比到沒有區間樣式的欄位才停;比過的欄位全部相同才只輸出一個值,否則以第一個(最大的)不同欄位選區間樣式,共用的欄位只寫一次。
 *   例:只寫時分的格式比 7/15 10:00 與 7/16 10:00,顯示的欄位一樣,但「日」不同 → 不合併)—— 合併規則全交給它,本檔不自己判斷「同一天」。
 *   「起訖在輸出精度下相同 → 只輸出一個值」是 MDN 的白話說法,不是規格原文
 * - 時間寫法: 與兩段顯示同一套 —— 2 位數、24 小時(`TimePicker/time-columns.tsx` `timePartsToString` 的 HH:MM(:SS))
 * - 語系預設與 formatter 快取: 由呼叫端傳入(`lib/date-locale.ts` `DEFAULT_DATE_LOCALE`、`date-picker.tsx` `getDateTimeFormatter`);
 *   本檔不 import 任何模組,Node 可直接讀、判定表不必經過 React
 *
 * 要保證的性質(逐字):**兩端都有值時輸出一段文字 —— 同一天自動合併、跨日寫兩端;同一頁的日期樣式一致(合併的列與退回兩段的列都算);
 * 合併不了的情況一律回 `null`,呼叫端照兩段版面顯示,每一端用 `formatDateRangeEndpoint`(與合併同一套寫法)。**
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
 * 合併顯示的預設日期寫法:數字年月日、**不補零**【AI 推導 2026-11-25,判定表見 spec】。
 * 只有這一組在 zh-TW 與 en-US 的四種情況(同一天有時段 / 跨日全天 / 跨日有時段 / 同一刻)都與單獨 `format` 同一種樣式:
 * - 兩位數月日(兩段顯示的預設 `2026/07/15`):只有日期的跨日區間 ICU 會丟掉補零 → `2026/7/15至2026/7/17`,與 `2026/07/15` 不一致;
 * - 文字月份 / `dateStyle`:zh-TW 只有日期的跨日區間一律換成數字月日(`2026/7/15星期三至2026/7/17星期五`),與 `2026年7月15日 星期三` 不一致。
 */
export const DATE_RANGE_DEFAULT_DATE_OPTIONS: Readonly<Intl.DateTimeFormatOptions> = Object.freeze({
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

const TIME_FIELDS = ['hour', 'minute', 'second', 'fractionalSecondDigits', 'dayPeriod', 'timeStyle'] as const

/**
 * 實際交給 Intl 的選項。日期段 = consumer 的 `formatOptions`(沒傳用預設);要寫時間而日期段沒有任何時間欄位時補上:
 * 用 `dateStyle` 的補 `timeStyle`(Intl 不准 dateStyle 與 hour 混用),其餘補 2 位數 24 小時的時、分(有秒再補秒)。
 * consumer 自己寫了時間欄位 → 照它,不補。
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
  return {
    ...dateOptions,
    hour: '2-digit',
    minute: '2-digit',
    ...(showSeconds ? { second: '2-digit' as const } : {}),
    hourCycle: 'h23',
  }
}

const defaultFactory: DateRangeFormatterFactory = (locale, options) => new Intl.DateTimeFormat(locale, options)

/** `formatRange` 是 ES2021 才進標準的方法;本套件 tsconfig 的 lib 是 ES2020,型別上沒有它,執行環境也要另外判斷有沒有 */
type RangeCapableFormatter = Intl.DateTimeFormat & { formatRange?: (startDate: Date, endDate: Date) => string }

/**
 * 合併後的一段文字;回 `null` = 不合併(呼叫端退回兩段版面,每一端用下方 `formatDateRangeEndpoint`)。不合併的情況(每一條都明寫,不靠 try/catch 兜 —— 判定表才量得到每一條):
 * - 只有一端有值,或任一端解析不了(Invalid Date;formatRange 對它丟 RangeError)
 * - 起點晚於終點:值本身有問題,照兩段讓人看到兩端(舊版引擎的 formatRange 對它丟 RangeError,新版照順序寫,兩種都不採)
 * - `showTime` 但一端有時間、一端沒有(合併會吃掉其中一端的時間)
 * - 執行環境沒有 `formatRange`(舊瀏覽器)
 * 起訖完全相同只輸出一個值、同一天合併、跨日寫兩端 —— 都是 `formatRange` 本身的行為(MDN:「If the start and end dates are
 * equivalent at the precision of the output, the output will only contain a single date.」)。
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
  if (typeof formatter.formatRange !== 'function') return null
  return formatter.formatRange(start, end)
}

/** 退回兩段時一端的輸入:沒值或解析不了的那一端傳 undefined */
export interface DateRangeEndpointInput extends Pick<DateRangeTextInput, 'showTime' | 'showSeconds' | 'formatOptions' | 'locale' | 'getFormatter'> {
  date: Date | undefined
  /** 這一端的 ISO 字串有沒有時間部分 */
  hasTime: boolean
}

/**
 * 開了 `formatRange`、但合併不了而退回兩段時,一端的文字【AI 推導 2026-11-25】:用合併顯示的同一套選項(`resolveDateRangeFormatOptions`)
 * 單獨 `format` —— 同一頁開了 `formatRange` 的列才不會一列是 `2026/7/15`、另一列是兩段顯示預設的 `2026/07/15`(spec 排除兩位數月日的同一個理由)。
 * 時間照這一端自己:`showTime` 且這一端帶時間才寫(與兩段顯示相同,只有一端帶時間時另一端只寫日期)。
 * 回 `null` = 這一端沒值或解析不了,呼叫端照原樣(與不開相同)。
 */
export function formatDateRangeEndpoint(input: DateRangeEndpointInput): string | null {
  const { date, hasTime, showTime, showSeconds, formatOptions, locale } = input
  if (!date || Number.isNaN(date.getTime())) return null
  const endpointOptions = resolveDateRangeFormatOptions(showTime && hasTime, showSeconds, formatOptions)
  return (input.getFormatter ?? defaultFactory)(locale, endpointOptions).format(date)
}
