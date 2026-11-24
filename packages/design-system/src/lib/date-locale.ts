/**
 * @internal — DS 日期元件的「預設語系」與「這個語系的一週從哪天開始」的唯一住處(2026-11-24)。
 *
 * 依據(user 2026-11-24 對話裡選的選項,選項文字為 AI 擬,逐字):
 *   - 預設語系:「全 DS 日期元件一起改 zh-TW (Recommended)」(Calendar / DatePicker / TimePicker 沒傳 locale 時 = zh-TW)。
 *   - 週起始日:先問「你確定中文語系的起始通常預設都是週日？世界級的設計是這樣？」,實測 CLDR 後選「跟語系的 CLDR (Recommended)」——
 *     DateGrid / DatePicker / DataTable「本週 / 上週 / 下週」篩選各自保留 `weekStartsOn` 參數可覆寫,沒傳時一律用同一條規則:
 *     語系 → CLDR 週資料。決策總帳更正 #2(AI 判定,後由 WS(定) user 選「跟語系的 CLDR (Recommended)」確認):
 *     date-fns 的 zh-TW 語系物件寫的是週一(`weekStartsOn: 1`,
 *     https://unpkg.com/date-fns@4.1.0/locale/zh-TW.js),CLDR 的 TW 是週日 —— 全 DS 以 CLDR 為準,不讀 date-fns 物件裡的值。
 *
 * 規則(`resolveWeekStartsOn`):
 *   1. 有傳 `override`(元件的 `weekStartsOn` 參數)→ 用它。
 *   2. 否則問執行環境的 CLDR:`Intl.Locale.prototype.getWeekInfo()`(舊版瀏覽器是同名的 `weekInfo` 屬性)。
 *   3. 執行環境沒有週資料 → 查本檔內建的 CLDR 週資料表(下方 `FIRST_DAY_NOT_MONDAY`)。
 * 回傳 0–6,週日 = 0(date-fns / react-day-picker 的 `weekStartsOn` 慣例);Intl 的 `firstDay` 是 1–7(週一 = 1、週日 = 7),取 `% 7`。
 *
 * 世界級同一套做法(先 getWeekInfo、沒有就查 CLDR 表):
 *   - React Aria `getWeekStart`:先 `getWeekInfo()`,再看 `-fw-` / `-ca-iso8601` 擴充,最後 `weekStartData[region]`
 *     (https://github.com/adobe/react-spectrum/blob/main/packages/@internationalized/date/src/queries.ts);元件的
 *     `firstDayOfWeek` 參數覆寫語系推出的預設(https://react-aria.adobe.com/Calendar)。
 *   - Atlassian `@atlaskit/locale`:先 `getWeekInfo()`,不支援時用內建 CLDR 48 例外表(TW / US = 週日,表外一律週一)
 *     (https://unpkg.com/@atlaskit/locale@5.5.0/dist/es2019/internal/localization-provider/get-week-info.js);
 *     Calendar 的 `weekStartDay` 沒給才從 locale 推(https://atlassian.design/components/calendar/code)。
 *   - MUI X Scheduler:從 `dateLocale` 推,先 `getWeekInfo()`,瀏覽器不支援時(文件點名 Firefox)改用地區週資料,也支援 `-u-fw-mon`
 *     (https://mui.com/x/react-scheduler/event-calendar/localization/);`weekStartsOn` 偏好有設就優先
 *     (https://mui.com/x/react-scheduler/event-calendar/preferences/)。
 *   反例(不採):Mantine 寫死週一(https://github.com/mantinedev/mantine/blob/master/packages/@mantine/dates/src/components/DatesProvider/DatesProvider.tsx)、
 *   Fluent 寫死週日(https://github.com/microsoft/fluentui/blob/master/packages/react/src/components/Calendar/Calendar.base.tsx)。
 *
 * 內建表只用在第 3 步,而且必須跟執行環境的 CLDR 逐地區相同:`scripts/test-week-start.mjs` 對每一個地區代碼比對
 * 「原生 getWeekInfo」與「本表」,不同就紅(表是 2026-11-24 用 Node 24.14.0 / ICU 78.2 / CLDR 48.0 逐地區產生的)。
 *
 * 擴充(Unicode locale extension,實測 Node 24.14.0 / ICU 78.2,2026-11-24):
 *   - `-u-fw-sun` … `-u-fw-sat`:原生與後備都認,而且壓過其他一切(`zh-TW-u-fw-mon` = 週一);值不合法(`-u-fw-xyz`)兩邊都忽略。
 *   - `-u-ca-iso8601`:沒有 `-u-rg-` 時原生給週一,後備照做。
 *   - `-u-rg-`(地區覆寫):**只有原生那條認**。ICU 的接受規則沒有公開規格,實測也不規則(`rg-twzz`、`rg-tw0000` 都當 TW,
 *     `rg-zzzzzz`、`rg-xazzzz`、`rg-419zzzz` 都忽略,而且只要帶了 `-u-rg-`,`-u-ca-iso8601` 就失效),後備不猜:
 *     帶 `-u-rg-` 時後備忽略 rg 與 ca、照語系本身的地區查表。這是已知、測試裡明列的差異,不是兩邊同結果的範圍。
 * 不合法的語系代碼(例 `zh_TW`)照 Intl 慣例丟 `RangeError` —— 跟同一個元件裡的 `Intl.DateTimeFormat` 一致,不默默換成別的語系。
 *
 * 消費者(README 本模組那一列):DateGrid、DatePicker(含 Range)、DataTable 日期欄(篩選「本週 / 上週 / 下週」、日期格編輯器、
 * 篩選值的日期選擇器)、DS 日期元件的預設語系(Calendar / DatePicker / TimePicker)。Calendar 的週起始日在月檢視重做時才接。
 */

/** 一週的第一天:0 = 週日 … 6 = 週六(date-fns / react-day-picker `weekStartsOn` 同一套)。 */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** DS 日期元件(Calendar / DatePicker / TimePicker)沒傳 `locale` 時用的語系。 */
export const DEFAULT_DATE_LOCALE = 'zh-TW'

// CLDR 週資料(supplemental weekData `firstDay`):地區沒列 = 世界預設(001)= 週一,所以表只列不是週一的地區。
// 由 Node 24.14.0 / ICU 78.2 / CLDR 48.0 的 `new Intl.Locale('und-' + 地區).getWeekInfo()` 逐一產生(AA–ZZ,略過別名);
// 執行環境的 CLDR 改了,scripts/test-week-start.mjs 的逐地區比對會紅,照它印的差異更新這裡。
const FIRST_DAY_GROUPS: ReadonlyArray<readonly [WeekStartsOn, string]> = [
  [0, 'AG AS BD BR BS BT BW BZ CA CO DM DO ET GT GU HK HN ID IL IN IS JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW'],
  [5, 'MV'],
  [6, 'AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY'],
]
const FIRST_DAY_NOT_MONDAY: ReadonlyMap<string, WeekStartsOn> = new Map(
  FIRST_DAY_GROUPS.flatMap(([day, regions]) => regions.split(' ').map((region) => [region, day] as const)),
)
const WORLD_FIRST_DAY: WeekStartsOn = 1

// `-u-fw-` 的值 → 0–6(Unicode TR35「fw」key)
const FW_VALUES: Readonly<Record<string, WeekStartsOn>> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

type WeekInfo = { firstDay: number }
type LocaleWithWeekInfo = Intl.Locale & { getWeekInfo?: () => WeekInfo; readonly weekInfo?: WeekInfo }

function toWeekStartsOn(firstDay: number): WeekStartsOn | undefined {
  return Number.isInteger(firstDay) && firstDay >= 1 && firstDay <= 7 ? ((firstDay % 7) as WeekStartsOn) : undefined
}

/** 執行環境自己的 CLDR(Chromium / Safari / Node 有;沒有時回 undefined)。 */
function nativeWeekStart(loc: LocaleWithWeekInfo): WeekStartsOn | undefined {
  const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo
  return info && typeof info.firstDay === 'number' ? toWeekStartsOn(info.firstDay) : undefined
}

/** BCP 47 標籤裡 `-u-` 擴充的某個 key 的值(`-x-` 私用段之後的不算)。 */
function unicodeKeyword(tag: string, key: string): string | undefined {
  const subtags = tag.toLowerCase().split('-')
  const privateUse = subtags.indexOf('x')
  const start = subtags.indexOf('u')
  if (start < 0 || (privateUse >= 0 && privateUse < start)) return undefined
  for (let i = start + 1; i < subtags.length && subtags[i].length > 1; i++) {
    if (subtags[i] !== key) continue
    const value = subtags[i + 1]
    return value && value.length > 2 ? value : ''
  }
  return undefined
}

/** 後備:執行環境沒有週資料時查內建 CLDR 表(擴充的取捨見檔頭)。 */
function tableWeekStart(loc: Intl.Locale): WeekStartsOn {
  const tag = loc.toString()
  const fw = unicodeKeyword(tag, 'fw')
  if (fw && fw in FW_VALUES) return FW_VALUES[fw]
  const hasRegionOverride = unicodeKeyword(tag, 'rg') !== undefined
  if (!hasRegionOverride && loc.calendar === 'iso8601') return 1
  const region = loc.region ?? loc.maximize().region
  return (region ? FIRST_DAY_NOT_MONDAY.get(region) : undefined) ?? WORLD_FIRST_DAY
}

/**
 * 這個語系的一週從哪天開始(0 = 週日)。`override` 有值就用它(元件的 `weekStartsOn` 參數);
 * 否則語系 → CLDR(先原生 `getWeekInfo`,沒有就查內建表)。`locale` 沒傳 = `DEFAULT_DATE_LOCALE`。
 */
export function resolveWeekStartsOn(locale: string = DEFAULT_DATE_LOCALE, override?: WeekStartsOn): WeekStartsOn {
  if (override !== undefined) return override
  const loc = new Intl.Locale(locale) as LocaleWithWeekInfo
  return nativeWeekStart(loc) ?? tableWeekStart(loc)
}
