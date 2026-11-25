/**
 * @internal — DS 日期元件的「預設語系」與「這個語系的一週從哪天開始」的唯一住處(2026-11-24);
 * 2026-11-25 起「這個語系的週末是哪幾天」與「一年的第一週至少要有幾天」也住這裡(見下方「週末」「第一週」兩段)。
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
 * 「原生 getWeekInfo」與「本表」,不同就紅(表是 2026-11-24 用 Node 24.14.0 / ICU 78.2 / CLDR 48.0 逐地區產生的;週末表同法,2026-11-25)。
 * 第一週的 `minDays` 表沒有原生可比,改對測試內嵌的 CLDR 48 快照逐地區比對。
 *
 * 擴充(Unicode locale extension,實測 Node 24.14.0 / ICU 78.2,2026-11-24):
 *   - `-u-fw-sun` … `-u-fw-sat`:原生與後備都認,而且壓過其他一切(`zh-TW-u-fw-mon` = 週一);值不合法(`-u-fw-xyz`)兩邊都忽略。
 *   - `-u-ca-iso8601`:沒有 `-u-rg-` 時原生給週一,後備照做。
 *   - `-u-rg-`(地區覆寫):**只有原生那條認**。ICU 的接受規則沒有公開規格,實測也不規則(`rg-twzz`、`rg-tw0000` 都當 TW,
 *     `rg-zzzzzz`、`rg-xazzzz`、`rg-419zzzz` 都忽略,而且只要帶了 `-u-rg-`,`-u-ca-iso8601` 就失效),後備不猜:
 *     帶 `-u-rg-` 時後備忽略 rg 與 ca、照語系本身的地區查表。這是已知、測試裡明列的差異,不是兩邊同結果的範圍。
 * 不合法的語系代碼(例 `zh_TW`)照 Intl 慣例丟 `RangeError` —— 跟同一個元件裡的 `Intl.DateTimeFormat` 一致,不默默換成別的語系。
 *
 * 週末(`resolveWeekend`,2026-11-25):依據 calendar.spec.md「隱藏週末 `hideWeekends`」的【AI 推導】「週末」= 語系的週末(`Intl` weekInfo)。
 *   三步與 `resolveWeekStartsOn` 相同:先原生 `getWeekInfo().weekend`(舊版的 `weekInfo` 屬性也認),沒有就查內建表(下方 `WEEKEND_GROUPS`),
 *   地區沒列 = 世界預設週六、週日。回 0–6 的集合(週日 = 0,與 `Date.prototype.getDay()` / date-fns `getDay` 同一套;Intl 的 1–7 取 `% 7`)。
 *   週末只跟地區走:`-u-fw-` 與 `-u-ca-iso8601` 都不改它(實測原生 `ar-EG-u-fw-mon`、`ar-EG-u-ca-iso8601` 仍是週五、週六),後備照做;
 *   `-u-rg-` 與週起始日同一條取捨(只有原生那條認,後備照語系本身的地區查表)。
 *   世界級同派:MUI X Scheduler 先 `getWeekInfo()`,沒有就查地區週末表,週末不跟 `fw` 與曆法走
 *   (https://unpkg.com/@mui/x-scheduler-internals@9.0.0-beta.16/internals/utils/date-locale.mjs 的 `getRegionWeekend` 與 `getLocaleWeekInfo`);
 *   React Aria `isWeekend(date, locale)` 依地區查週末表(https://unpkg.com/@internationalized/date@3.12.4/src/queries.ts 的 `WEEKEND_DATA`)——
 *   它那張表與 CLDR 48 不同(還列 AE 週五六、沒有 IN / UG),所以本檔不抄別家的表:表由執行環境逐地區產生、測試逐地區比對。
 *
 * 第一週(`resolveFirstWeekMinDays`,2026-11-25):依據 calendar.spec.md「週數欄 `showWeekNumbers`」「第一週怎麼算跟語系走,資料來源由工程定
 * (`Intl` weekInfo 沒有『第一週最少幾天』,不得自編規則)」。【AI 推導】資料來源 = CLDR supplemental weekData 的 `minDays`
 * (一年的第一週至少要有幾天落在那一年),回 1 或 4,直接當 date-fns 的 `firstWeekContainsDate` 用(兩者同義:至少 4 天 = 那一週含 1 月 4 日)。
 *   沒有「先問原生」那一步:現行 `getWeekInfo()` 只回 `{ firstDay, weekend }`(TC39 提案範例,https://github.com/tc39/proposal-intl-locale-info;
 *   實測 Node 24.14.0 的 `de-DE` 得 `{ firstDay: 1, weekend: [6, 7] }`);就算執行環境多回 `minimalDays` 也不讀 —— 有的回、有的不回,
 *   同一個語系在不同瀏覽器週數就會不同。MUI X 同一個理由用內建表(同上網址 `FOUR_MINIMAL_DAYS_REGIONS` 的註解「Browsers dropped the
 *   `minimalDays` of `getWeekInfo()`, so the table keeps the week numbers the same in all of them」)。
 *   `-u-ca-iso8601`(沒有 `-u-rg-`)= 4:ISO 8601 的第一週,與週起始日「iso8601 = 週一」合起來就是 ISO 週數(MUI X 對 iso8601 也回 4,
 *   同上網址 `getLocaleWeekInfo` 的 `minimalDays`;它帶 rg 時仍回 4,本檔不套,理由見下一句)。
 *   `-u-fw-` 不影響(它只改一週的第一天)。`-u-rg-` 不讀、帶了 rg 也不套 iso8601 —— 與 `tableWeekStart` 同一條取捨(ICU 的 rg 接受規則不規則,
 *   這一條又沒有原生可對照,不猜);測試把它列成已知限制。
 *
 * 消費者(README 本模組那一列):DateGrid、DatePicker(含 Range)、DataTable 日期欄(篩選「本週 / 上週 / 下週」、日期格編輯器、
 * 篩選值的日期選擇器)、DS 日期元件的預設語系(Calendar / DatePicker / TimePicker);Calendar 月檢視(2026-11-25 起)另消費
 * resolveWeekStartsOn(週起始日)、resolveWeekend(`hideWeekends`)與 resolveFirstWeekMinDays(`showWeekNumbers` 的週數)。
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

// CLDR 週資料(supplemental weekData `weekendStart` / `weekendEnd`):地區沒列 = 世界預設(001)= 週六、週日,所以表只列週末不是六日的地區。
// 值是 0–6(週日 = 0)。產生法與 FIRST_DAY_GROUPS 相同:Node 24.14.0 / ICU 78.2 / CLDR 48.0 的
// `new Intl.Locale('und-' + 地區).getWeekInfo().weekend` 逐一產生(AA–ZZ,略過別名);執行環境的 CLDR 改了,
// scripts/test-week-start.mjs 的逐地區比對會紅,照它印的差異更新這裡。
// 這張表與下面的 minDays 表都寫成字面值、用到才查(不在模組載入時建 Map / Set):只用 resolveWeekStartsOn / DEFAULT_DATE_LOCALE 的元件
// (DateGrid、DatePicker、DataTable、Calendar)打包時整段被拿掉,size-limit 不因這兩張表變大(2026-11-25 實測)。
const WEEKEND_GROUPS: ReadonlyArray<readonly [readonly number[], string]> = [
  [[4, 5], 'AF'],
  [[5, 6], 'BH DZ EG IL IQ JO KW LY OM QA SA SD SY YE'],
  [[5], 'IR'],
  [[0], 'IN UG'],
]
const WORLD_WEEKEND: readonly number[] = [6, 0]

// CLDR 週資料 `minDays`(一年的第一週至少要有幾天落在那一年):地區沒列 = 世界預設(001)= 1,所以表只列 4 天的地區。
// 一手來源:unicode-org/cldr-json 的 cldr-core 48.0.0 supplemental/weekData.json
// (https://unpkg.com/cldr-core@48.0.0/supplemental/weekData.json,與上面兩張表同一版 CLDR 48)。該檔的 `AN`(荷屬安地列斯,已停用的地區碼)
// 不列:Intl.Locale 把 `und-AN` 正規化成 `CW`,查表時永遠拿不到 AN。scripts/test-week-start.mjs 內嵌同一份快照逐地區比對。
const FIRST_WEEK_FOUR_DAYS = 'AD AT AX BE BG CH CZ DE DK EE ES FI FJ FO FR GB GF GG GI GP GR HU IE IM IS IT JE LI LT LU MC MQ NL NO PL PT RE RU SE SJ SK SM VA'

// `-u-fw-` 的值 → 0–6(Unicode TR35「fw」key)
const FW_VALUES: Readonly<Record<string, WeekStartsOn>> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

type WeekInfo = { firstDay: number; weekend?: unknown }
type LocaleWithWeekInfo = Intl.Locale & { getWeekInfo?: () => WeekInfo; readonly weekInfo?: WeekInfo }

/** Intl 的星期 1–7(週一 = 1、週日 = 7)→ 0–6(週日 = 0);不是 1–7 的整數回 undefined。週起始日與週末共用這一個換算。 */
function toWeekStartsOn(firstDay: number): WeekStartsOn | undefined {
  return Number.isInteger(firstDay) && firstDay >= 1 && firstDay <= 7 ? ((firstDay % 7) as WeekStartsOn) : undefined
}

/** 執行環境自己的週資料(Chromium / Safari / Node 有 `getWeekInfo()`,舊版 Chromium 是 `weekInfo` 屬性;都沒有回 undefined)。 */
function nativeWeekInfo(loc: LocaleWithWeekInfo): WeekInfo | undefined {
  return typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo
}

/** 執行環境自己的 CLDR(Chromium / Safari / Node 有;沒有時回 undefined)。 */
function nativeWeekStart(loc: LocaleWithWeekInfo): WeekStartsOn | undefined {
  const info = nativeWeekInfo(loc)
  return info && typeof info.firstDay === 'number' ? toWeekStartsOn(info.firstDay) : undefined
}

/** 原生週末(1–7 → 0–6);不是「全由 1–7 整數組成的陣列」就回 undefined、改查表。 */
function nativeWeekend(loc: LocaleWithWeekInfo): number[] | undefined {
  const weekend = nativeWeekInfo(loc)?.weekend
  if (!Array.isArray(weekend)) return undefined
  const days = weekend.map((day) => (typeof day === 'number' ? toWeekStartsOn(day) : undefined))
  return days.every((day) => day !== undefined) ? (days as number[]) : undefined
}

/** 查表用的地區:語系自己的地區,沒寫就照 likely subtags 補(zh → CN、en → US、ar → EG)。`-u-rg-` 不讀(取捨見檔頭)。 */
function localeRegion(loc: Intl.Locale): string | undefined {
  return loc.region ?? loc.maximize().region
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
  const region = localeRegion(loc)
  return (region ? FIRST_DAY_NOT_MONDAY.get(region) : undefined) ?? WORLD_FIRST_DAY
}

/** 後備:執行環境沒有週末資料時查內建 CLDR 表(`-u-fw-` / `-u-ca-` 不影響週末,`-u-rg-` 不讀)。 */
function tableWeekend(loc: Intl.Locale): readonly number[] {
  const region = localeRegion(loc)
  const group = region ? WEEKEND_GROUPS.find(([, regions]) => regions.split(' ').includes(region)) : undefined
  return group ? group[0] : WORLD_WEEKEND
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

/**
 * 這個語系的週末是哪幾天:0 = 週日 … 6 = 週六(與 `Date.prototype.getDay()` / date-fns `getDay` 同一套,所以 `has(getDay(date))` 直接可用)。
 * 語系 → CLDR(先原生 `getWeekInfo().weekend`,沒有就查內建表);`-u-fw-` 與 `-u-ca-iso8601` 不影響。每次回一個新的集合。
 * `locale` 沒傳 = `DEFAULT_DATE_LOCALE`;不合法的代碼丟 `RangeError`。
 */
export function resolveWeekend(locale: string = DEFAULT_DATE_LOCALE): ReadonlySet<number> {
  const loc = new Intl.Locale(locale) as LocaleWithWeekInfo
  return new Set(nativeWeekend(loc) ?? tableWeekend(loc))
}

/**
 * 這個語系一年的第一週至少要有幾天落在那一年(CLDR `minDays`):1 = 含 1 月 1 日的那一週就是第一週;4 = 至少 4 天(歐洲多數地區,
 * 配週一起 = ISO 8601 週數)。直接當 date-fns `getWeek` 的 `firstWeekContainsDate` 用,週起始日另由 `resolveWeekStartsOn` 給。
 * 沒有原生那一步(取捨見檔頭);`-u-ca-iso8601`(沒有 `-u-rg-`)= 4。`locale` 沒傳 = `DEFAULT_DATE_LOCALE`;不合法的代碼丟 `RangeError`。
 */
export function resolveFirstWeekMinDays(locale: string = DEFAULT_DATE_LOCALE): 1 | 4 {
  const loc = new Intl.Locale(locale)
  const hasRegionOverride = unicodeKeyword(loc.toString(), 'rg') !== undefined
  if (!hasRegionOverride && loc.calendar === 'iso8601') return 4
  const region = localeRegion(loc)
  return region !== undefined && FIRST_WEEK_FOUR_DAYS.split(' ').includes(region) ? 4 : 1
}
