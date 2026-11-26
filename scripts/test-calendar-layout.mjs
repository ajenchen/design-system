#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Calendar 月檢視的事件版面只有一份實作(packages/design-system/src/components/Calendar/calendar-layout.ts),而且照
 *        calendar.spec.md「資料語意」「跨日長條」「格內排序」「每格筆數與「+N」」與 Cell 規則「隱藏週末」做:
 *        三種字串格式分開解析(只有日期 = 本地那一天、不帶 offset = 本地時刻、帶 offset / Z = 絕對時間);只有日期又沒寫 allDay →
 *        全天,限兩端都是只有日期的字串,Date 物件不推斷;end 一律不含;Q7(定)標全天或滿 24 小時 = 長條、未滿(含過夜、午夜結束)=
 *        只畫開始那天,「滿 24 小時」量真實時間;日光節約那天(America/New_York 2026-03-08 = 23 小時、2026-11-01 = 25 小時)
 *        天數與欄的相鄰照日曆日算;start 晚於 end → 開始那一刻的零長度事件;全天 end === start → 警告、畫在開始那天;
 *        車道每週各自分配、最低空車道、涵蓋的每一天都要空、同一事件同一週同一車道、只落在被藏日子的事件不佔車道;
 *        被藏的日子把長條切段;每格 m = 最高佔用車道 + 1,m > k → 車道 0…k−2 照畫、第 k 列換「+N」、N = 車道 ≥ k−1 的筆數(看車道不看筆數),
 *        長條在溢出那一格被切開;格內排序五條(開始日期 → 長的在上 → 全天先 → 開始時間 → 標題依 locale),車道與「+N」清單共用;
 *        CalendarEventSegment 五個旗標(isStart / isEnd = 真起訖、continuesBefore / continuesAfter = 可見範圍外、isSegmentRepeat = 不是第一段);
 *        詳情時間欄與全天切換(T1–T5,calendar.spec.md「事件詳情浮層」【Q16(定)】):有時段 → 全天只留日期、記住原時間;切回有記錄就還原(過夜的結束日 = 開始日 + 1)、
 *        沒有就開始日 09:00 起一小時(牆上時間,日光節約那天也是 09:00 – 10:00);全天的 Range 結束日「含」↔ end「不含」換算一個日曆日(25 小時那天也對)。
 *        k 是誰算的(M32 參數邊界):每格放得下幾列的算式住在 calendar-geometry.ts `calendarRowsThatFit`(格高 → k 的判定表,含剛好放滿與
 *        LayoutUnit 取整的邊界);calendar.tsx 交給 layoutMonth 的 maxRows 只有一個來源 = 量到的格高(layoutBorderBoxSize 的 height)經這支算式。
 *        靜態:檔頭 10 行內 @internal、帶「── 消費的 SSOT ──」、不 import calendar.tsx / react、不寫固定毫秒、不開 timeZone、
 *        Calendar/index.ts 不轉出它。
 *   紅: 判定表任一格不符(期望值照規格逐格手寫,不是抄輸出)→ exit 1,逐格印出實得 / 應得;任何月格版面違反全域不變式
 *        (同車道同一欄兩塊重疊、continuesBefore 為真時 isStart 也為真、塊超出這一週)→ exit 1。
 *        `--selftest` 對照組:每條規則一個突變(拿掉排序五條各一、標題改用 < 比、清單不排序、Q7 改用日曆日、滿 24 小時改成超過、
 *        欄的相鄰 / 天數改用固定毫秒、end 當成含、拿掉 start > end 正規化、全天 end === start 不警告、零長度不畫在開始那天、
 *        只有日期不推斷 / Date 也推斷 / 一端就推斷、只有日期走原生解析、本地時刻當 UTC、車道一律往下疊、只看最後一天空不空、
 *        每一天各自從 0 往下排、被藏日子的事件夾到旁邊、被藏的日子不切段、isStart 寫成 !continuesBefore、旗標用整週範圍算、
 *        改用筆數算 +N、整條長條一起藏、continuesBefore 寫成 !isStart、isSegmentRepeat 恆假,
 *        切成全天不記住、沒記錄不給 09:00、全天換算改用固定毫秒、一小時改加 3600000 毫秒(2026-11-26 加四個),共 35 個;另有 5 個靜態突變:
 *        寫固定毫秒、import calendar.tsx、拿掉 @internal、開 timeZone、index.ts 轉出;k 的算式 2 個突變(沒扣格線、不加回 LayoutUnit)與
 *        「k 是誰算的」3 個靜態突變(maxRows 寫死 3、layoutMonth 收常數、量格寬當格高))——
 *        每一種都必須讓它指定的那幾格紅;任何一種沒被抓到 = 判定表沒在驗那一條 → exit 1。
 *   綠: 全部相符時綠。純函式 + 固定時區(本檔把 TZ 設成 America/New_York,有日光節約)+ 靜態讀檔;無網路、無亂數、無瀏覽器,重複跑結果恆等。
 *   儀器失效(exit 2,印 INSTRUMENT-FAIL): TZ 設不進去(2026-03-08 與 03-09 的 UTC 偏移相同)、esbuild 打包失敗、取不到出口、
 *        對照組要改的原始碼片段找不到、`--selftest` 時未突變的那一份本身不綠。
 *
 * Run: `node scripts/test-calendar-layout.mjs`(`--selftest` 只跑對照組)
 */
// 時區要在任何 Date 之前設好:有日光節約的地方,固定毫秒與日曆日的差才量得到(Node 改 process.env.TZ 會重設時區快取)
process.env.TZ = 'America/New_York'

import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CALENDAR_DIR = 'packages/design-system/src/components/Calendar'
const LAYOUT_PATH = `${CALENDAR_DIR}/calendar-layout.ts`
const SELFTEST = process.argv.includes('--selftest')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const instrumentFail = (msg) => { console.error(`INSTRUMENT-FAIL: ${msg}`); process.exit(2) }
mkdirSync(join(ROOT, 'scripts/.gate-bundles'), { recursive: true })

if (new Date(2026, 2, 8).getTimezoneOffset() === new Date(2026, 2, 9).getTimezoneOffset()) {
  instrumentFail('TZ 沒設進去:2026-03-08 與 03-09 的 UTC 偏移相同,量不到日光節約那天')
}

// ── 打包:原始碼(或它的突變版)→ esbuild → 固定檔名(scripts/.gate-bundles/README.md:import() 只准字面字串)────────────
// 多份來源打進同一個檔,各自是一個命名空間 m0、m1…(date-fns 只打包一次)。
async function bundle(file, sources) {
  const entry = sources.map((_, i) => `export * as m${i} from 'calendar-layout-variant:${i}'`).join('\n')
  const result = await build({
    stdin: { contents: entry, resolveDir: join(ROOT, CALENDAR_DIR), loader: 'js', sourcefile: 'calendar-layout-variants.js' },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
    plugins: [{
      name: 'calendar-layout-variants',
      setup(b) {
        b.onResolve({ filter: /^calendar-layout-variant:\d+$/ }, (args) => ({ path: args.path.split(':')[1], namespace: 'variant' }))
        b.onLoad({ filter: /.*/, namespace: 'variant' }, (args) => ({
          contents: sources[Number(args.path)], loader: 'ts', resolveDir: join(ROOT, CALENDAR_DIR),
        }))
      },
    }],
  }).catch((e) => instrumentFail(`esbuild 打包 calendar-layout.ts 失敗:${e.message}`))
  writeFileSync(join(ROOT, 'scripts/.gate-bundles', file), result.outputFiles[0].text)
}
const EXPORTS = ['isDateOnlyString', 'parseEventDate', 'classifyEvent', 'normalizeEvents', 'getTitleCollator', 'createEventComparator', 'layoutMonth', 'layoutDay']
const assertExports = (lib, label) => {
  const missing = EXPORTS.filter((name) => typeof lib?.[name] !== 'function')
  if (missing.length) instrumentFail(`${label} 取不到出口:${missing.join('、')}(出口名稱改了?)`)
}

// ── 判定表用的小工具 ───────────────────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ymdhm = (d) => `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
const md = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** 'YYYY-MM-DD' → 本地午夜(測試自己建日子,不經被測的解析) */
const day = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
/** 從某一天起連續 count 天,略過 skip 裡的星期(0 = 週日)—— 隱藏週末時格陣看得見的那幾天 */
const days = (firstIso, count, skip = []) => {
  const first = day(firstIso)
  const out = []
  for (let i = 0; i < count; i++) {
    const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i)
    if (!skip.includes(d.getDay())) out.push(d)
  }
  return out
}
const ev = (title, start, end, allDay) => (allDay === undefined ? { title, start, end } : { title, start, end, allDay })
/** 旗標寫法:起 = isStart、迄 = isEnd、< = continuesBefore、> = continuesAfter、重 = isSegmentRepeat;全假寫 · */
const flags = (s) => [s.isStart && '起', s.isEnd && '迄', s.continuesBefore && '<', s.continuesAfter && '>', s.isSegmentRepeat && '重'].filter(Boolean).join('') || '·'
const pieceStr = (p) => `${p.entry.event.title}|L${p.lane}|${p.startCol}+${p.span}|${flags(p.segment)}`
const cellStr = (c) => `m${c.rowsNeeded}+${c.moreCount}`
const entryStr = (n) => `${n.kind} ${md(n.firstDay)}~${md(n.lastDay)} ×${n.dayCount}`
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const expectEq = (bad, label, actual, expected) => { if (!same(actual, expected)) bad.push(`${label}:實得 ${JSON.stringify(actual)},應得 ${JSON.stringify(expected)}`) }
/** 開發期警告:跑 fn 期間收下 console.warn */
function captureWarnings(fn) {
  const original = console.warn
  const warnings = []
  console.warn = (...args) => { warnings.push(args.join(' ')) }
  try { return { result: fn(), warnings } } finally { console.warn = original }
}
/** 月格版面的全域不變式(每一張版面都要成立,不只判定表寫到的那幾格) */
function layoutInvariants(layout, label) {
  const bad = []
  layout.weeks.forEach((week, w) => {
    const taken = new Map()
    for (const p of week.pieces) {
      if (p.span < 1 || p.startCol < 0 || p.startCol + p.span > week.days.length) bad.push(`${label} 第 ${w} 週「${pieceStr(p)}」超出這一週(${week.days.length} 欄)`)
      if (p.segment.continuesBefore && p.segment.isStart) bad.push(`${label} 第 ${w} 週「${pieceStr(p)}」continuesBefore 與 isStart 同時為真`)
      if (p.segment.continuesAfter && p.segment.isEnd) bad.push(`${label} 第 ${w} 週「${pieceStr(p)}」continuesAfter 與 isEnd 同時為真`)
      for (let c = p.startCol; c < p.startCol + p.span; c++) {
        const key = `${p.lane}:${c}`
        if (taken.has(key)) bad.push(`${label} 第 ${w} 週車道 ${p.lane} 第 ${c} 欄重疊:「${taken.get(key)}」與「${pieceStr(p)}」`)
        taken.set(key, pieceStr(p))
      }
    }
    const lanesOf = new Map()
    for (const p of week.pieces) lanesOf.set(p.entry, [...(lanesOf.get(p.entry) ?? []), p.lane])
    for (const [entry, lanes] of lanesOf) if (new Set(lanes).size > 1) bad.push(`${label} 第 ${w} 週「${entry.event.title}」同一週用了不同車道 ${lanes.join(' / ')}`)
  })
  return bad
}
function month(lib, { weeks, events, maxRows = Infinity, locale = 'zh-TW' }) {
  const normalized = lib.normalizeEvents(events)
  return lib.layoutMonth({ weeks, events: normalized, maxRows, locale })
}
/** 一張月格版面對期望值:每週的塊與格(期望值逐週手寫) */
function expectMonth(lib, label, input, expectedWeeks) {
  const bad = []
  const layout = captureWarnings(() => month(lib, input)).result
  bad.push(...layoutInvariants(layout, label))
  expectedWeeks.forEach((exp, w) => {
    const week = layout.weeks[w]
    if (!week) { bad.push(`${label} 第 ${w} 週不見了`); return }
    if (exp.pieces) expectEq(bad, `${label} 第 ${w} 週的塊`, week.pieces.map(pieceStr), exp.pieces)
    if (exp.cells) expectEq(bad, `${label} 第 ${w} 週的格(m+N)`, week.cells.map(cellStr), exp.cells)
  })
  return bad
}
/** 「+N」清單(一天):標題順序 + 旗標 */
const dayEntries = (lib, { on, events, locale = 'zh-TW' }) =>
  captureWarnings(() => lib.layoutDay({ day: day(on), events: lib.normalizeEvents(events), locale })).result
const dayList = (lib, input) => dayEntries(lib, input).map((x) => `${x.entry.event.title} ${flags(x.segment)}`)
const dayTitles = (lib, input) => dayEntries(lib, input).map((x) => x.entry.event.title)
const normalizeOne = (lib, event) => captureWarnings(() => lib.normalizeEvents([event])).result[0]
/** 這一天那一格的塊,依車道由上而下(格內順序) */
const cellTitles = (layout, w, col) => layout.weeks[w].cells[col].pieces.map((p) => p.entry.event.title)

// 週日起的一週(2026-07-19 週日 … 07-25 週六);欄 0 = 週日
const WEEK_0719 = [days('2026-07-19', 7)]
// 2026 年 7 月的格陣(週日起):06-28 … 08-01,五週
const JULY_GRID = [0, 1, 2, 3, 4].map((w) => days(['2026-06-28', '2026-07-05', '2026-07-12', '2026-07-19', '2026-07-26'][w], 7))

// ── 判定表(期望值照規格逐格手寫;每格一個代號,對照組用代號指定該紅的格)──────────────────────────────────
const ROWS = [
  // A. 三種字串格式(calendar.spec.md「資料語意」時區那條)
  ['A1', '只有日期 = 本地那一天的午夜(不是 UTC 午夜)', (lib) => { const b = []; expectEq(b, '解析', ymdhm(lib.parseEventDate('2026-07-15')), '2026-07-15 00:00'); return b }],
  ['A2', '不帶 offset 的時刻 = 本地時間', (lib) => { const b = []; expectEq(b, '解析', ymdhm(lib.parseEventDate('2026-07-15T10:00')), '2026-07-15 10:00'); return b }],
  ['A3', '不帶 offset、有秒與毫秒', (lib) => { const b = []; const d = lib.parseEventDate('2026-07-15T10:00:30.5'); expectEq(b, '解析', [ymdhm(d), d.getSeconds(), d.getMilliseconds()], ['2026-07-15 10:00', 30, 500]); return b }],
  ['A4', '帶 offset = 絕對時間(23:30+08:00 = 紐約 11:30)', (lib) => { const b = []; const d = lib.parseEventDate('2026-07-14T23:30+08:00'); expectEq(b, '解析', [d.toISOString(), ymdhm(d)], ['2026-07-14T15:30:00.000Z', '2026-07-14 11:30']); return b }],
  ['A5', '帶 Z = 絕對時間', (lib) => { const b = []; expectEq(b, '解析', lib.parseEventDate('2026-07-15T10:00Z').toISOString(), '2026-07-15T10:00:00.000Z'); return b }],
  ['A6', 'Date 物件複製一份(不改到 consumer 的物件)', (lib) => { const b = []; const src = new Date(2026, 6, 15, 9); const d = lib.parseEventDate(src); expectEq(b, '同一刻、不同物件', [d.getTime() === src.getTime(), d !== src], [true, true]); return b }],
  ['A7', '只有日期的判定:字串 YYYY-MM-DD 才算,帶時刻 / 少補零 / Date 物件都不算', (lib) => {
    const b = []
    expectEq(b, 'isDateOnlyString', ['2026-07-15', '2026-07-15T00:00', '2026-7-15', new Date(2026, 6, 15)].map((v) => lib.isDateOnlyString(v)), [true, false, false, false])
    return b
  }],

  // B. 只有日期、沒寫 allDay → 全天;限兩端都是只有日期的字串;Date 物件不推斷(主線工程決定 (6))
  ['B1', '兩端都只有日期、沒寫 allDay → 全天', (lib) => { const b = []; const n = normalizeOne(lib, ev('公司年假', '2026-07-20', '2026-07-21')); expectEq(b, 'allDay / kind', [n.allDay, n.kind], [true, 'bar']); return b }],
  ['B2', '一端有時刻 → 不推斷全天', (lib) => { const b = []; const n = normalizeOne(lib, ev('半天研討會', '2026-07-20', '2026-07-20T12:00')); expectEq(b, 'allDay / kind', [n.allDay, n.kind], [false, 'timed']); return b }],
  ['B3', 'Date 物件(午夜)不推斷全天 —— 滿 24 小時所以是有時段的長條', (lib) => { const b = []; const n = normalizeOne(lib, ev('資料同步', new Date(2026, 6, 20), new Date(2026, 6, 21))); expectEq(b, 'allDay / kind', [n.allDay, n.kind], [false, 'bar']); return b }],
  ['B4', '明寫 allDay: false 照舊', (lib) => { const b = []; const n = normalizeOne(lib, ev('系統維運', '2026-07-20', '2026-07-21', false)); expectEq(b, 'allDay', n.allDay, false); return b }],
  ['B5', '明寫 allDay: true 照寫(有時刻也是全天)', (lib) => { const b = []; const n = normalizeOne(lib, ev('外部稽核', '2026-07-20T09:00', '2026-07-20T18:00', true)); expectEq(b, 'allDay / 版面', [n.allDay, entryStr(n)], [true, 'bar 07-20~07-20 ×1']); return b }],

  // C. Q7(定):長條 or 只畫開始那天;end 不含(C:159 例:20 → 23 = 20、21、22)
  ...[
    ['C1', '全天一天', ev('公司年假', '2026-07-20', '2026-07-21'), 'bar 07-20~07-20 ×1'],
    ['C2', '全天三天(end 不含:20 → 23 = 20、21、22)', ev('團隊建立活動', '2026-07-20', '2026-07-23'), 'bar 07-20~07-22 ×3'],
    ['C3', '有時段 10:00–11:00', ev('設計審查', '2026-07-15T10:00', '2026-07-15T11:00'), 'timed 07-15~07-15 ×1'],
    ['C4', '過夜未滿 24 小時(22:00 → 隔天 01:00)只畫開始那天', ev('夜間部署', '2026-07-15T22:00', '2026-07-16T01:00'), 'timed 07-15~07-15 ×1'],
    ['C5', '午夜結束(22:00 → 隔天 00:00)只畫開始那天、不當全天', ev('午夜收單', '2026-07-15T22:00', '2026-07-16T00:00'), 'timed 07-15~07-15 ×1'],
    ['C6', '剛好滿 24 小時 = 長條', ev('異地備援演練', '2026-07-20T10:00', '2026-07-21T10:00'), 'bar 07-20~07-21 ×2'],
    ['C7', '差一分鐘滿 24 小時 = 只畫開始那天', ev('跨夜壓力測試', '2026-07-20T10:00', '2026-07-21T09:59'), 'timed 07-20~07-20 ×1'],
    ['C8', '午夜到隔天午夜(24 小時)= 一天的長條(end 不含)', ev('全日停機', '2026-07-20T00:00', '2026-07-21T00:00'), 'bar 07-20~07-20 ×1'],
    ['C9', '有時段跨三天', ev('年度展會', '2026-07-20T10:00', '2026-07-22T09:00'), 'bar 07-20~07-22 ×3'],
    // D. 日光節約(America/New_York;POC 實測 2026-03-08 = 23 小時、2026-11-01 = 25 小時)
    ['D1', '03-08 00:00 → 03-09 00:00 只有 23 小時 → 不是長條', ev('機房切換', '2026-03-08T00:00', '2026-03-09T00:00'), 'timed 03-08~03-08 ×1'],
    ['D2', '03-08 00:00 → 03-09 01:00 才滿 24 小時', ev('機房切換', '2026-03-08T00:00', '2026-03-09T01:00'), 'bar 03-08~03-09 ×2'],
    ['D3', '11-01 00:00 → 23:30 是 24.5 小時 → 一天的長條', ev('年度結算', '2026-11-01T00:00', '2026-11-01T23:30'), 'bar 11-01~11-01 ×1'],
    ['D4', '全天 11-01 → 11-03(25 小時那天)= 2 天', ev('秋季盤點', '2026-11-01', '2026-11-03'), 'bar 11-01~11-02 ×2'],
    ['D5', '全天 03-08 → 03-10(23 小時那天)= 2 天', ev('春季盤點', '2026-03-08', '2026-03-10'), 'bar 03-08~03-09 ×2'],
  ].map(([id, desc, event, expected]) => [id, desc, (lib) => { const b = []; expectEq(b, '版面', entryStr(normalizeOne(lib, event)), expected); return b }]),
  ['D6', '日光節約那一週(11-01 週日起)長條連成一段(欄的相鄰照日曆日)', (lib) =>
    expectMonth(lib, 'D6', { weeks: [days('2026-11-01', 7)], events: [ev('秋季盤點', '2026-11-01', '2026-11-04')] }, [{ pieces: ['秋季盤點|L0|0+3|起迄'] }])],
  ['D7', '23 小時那天「長的在上」照日曆天數', (lib) => {
    const b = []
    expectEq(b, '03-08 的清單', dayList(lib, { on: '2026-03-08', events: [ev('1 號倉盤點', '2026-03-08', '2026-03-09'), ev('2 號倉盤點', '2026-03-08', '2026-03-10')] }), ['2 號倉盤點 起>', '1 號倉盤點 起迄'])
    return b
  }],

  // E. 異常資料 + 開發期警告(C:159、C:164;全天 end === start 怎麼畫比照 C:164【AI 推導】)
  ['E1', '有時段 start 晚於 end → 開始那一刻的零長度,警告一次', (lib) => {
    const b = []
    const { result, warnings } = captureWarnings(() => lib.normalizeEvents([ev('臨時會議', '2026-07-15T10:00', '2026-07-15T09:00')]))
    const n = result[0]
    expectEq(b, '正規化', n && [ymdhm(n.start), ymdhm(n.end), entryStr(n)], ['2026-07-15 10:00', '2026-07-15 10:00', 'timed 07-15~07-15 ×1'])
    expectEq(b, '警告', warnings.map((w) => /^\[Calendar\] .*start 晚於 end/.test(w)), [true])
    return b
  }],
  ['E2', '全天 start 晚於 end → 畫在開始那天,只警告「晚於」那一條', (lib) => {
    const b = []
    const { result, warnings } = captureWarnings(() => lib.normalizeEvents([ev('展場布置', '2026-07-16', '2026-07-14')]))
    expectEq(b, '正規化', result[0] && entryStr(result[0]), 'bar 07-16~07-16 ×1')
    expectEq(b, '警告', warnings.map((w) => (/start 晚於 end/.test(w) ? '晚於' : /end 與 start 相同/.test(w) ? '相同' : w)), ['晚於'])
    return b
  }],
  ['E3', '全天 end === start → 警告,當零長度畫在開始那天', (lib) => {
    const b = []
    const { result, warnings } = captureWarnings(() => lib.normalizeEvents([ev('國定假日', '2026-07-20', '2026-07-20')]))
    expectEq(b, '正規化', result[0] && entryStr(result[0]), 'bar 07-20~07-20 ×1')
    expectEq(b, '警告', warnings.map((w) => /^\[Calendar\] 全天事件「國定假日」的 end 與 start 相同/.test(w)), [true])
    return b
  }],
  ['E4', '正常的全天資料不警告', (lib) => { const b = []; expectEq(b, '警告筆數', captureWarnings(() => lib.normalizeEvents([ev('團隊建立活動', '2026-07-20', '2026-07-23')])).warnings.length, 0); return b }],
  ['E5', '有時段零長度(截止時刻)照畫、不警告', (lib) => {
    const b = []
    const { result, warnings } = captureWarnings(() => lib.normalizeEvents([ev('報名截止', '2026-07-15T17:00', '2026-07-15T17:00')]))
    expectEq(b, '版面 / 警告筆數', [result[0] && entryStr(result[0]), warnings.length], ['timed 07-15~07-15 ×1', 0])
    return b
  }],
  ['E6', '解析不了的日期:這一筆不畫,警告一次', (lib) => {
    const b = []
    const { result, warnings } = captureWarnings(() => lib.normalizeEvents([ev('格式錯誤的事件', '2026-07-xx', '2026-07-21'), ev('設計審查', '2026-07-15T10:00', '2026-07-15T11:00')]))
    expectEq(b, '留下來的 / 警告', [result.map((n) => n.event.title), warnings.map((w) => /^\[Calendar\] .*解析不了/.test(w))], [['設計審查'], [true]])
    return b
  }],
  ['E7', '正式環境(NODE_ENV=production)不警告,正規化照做', (lib) => {
    const b = []
    const before = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const { result, warnings } = captureWarnings(() => lib.normalizeEvents([ev('臨時會議', '2026-07-15T10:00', '2026-07-15T09:00'), ev('國定假日', '2026-07-20', '2026-07-20')]))
      expectEq(b, '警告筆數 / 正規化', [warnings.length, result.map(entryStr)], [0, ['timed 07-15~07-15 ×1', 'bar 07-20~07-20 ×1']])
    } finally {
      if (before === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = before
    }
    return b
  }],
  ['E8', 'start 晚於 end 的事件在月格裡照樣畫在開始那天(不消失)', (lib) =>
    expectMonth(lib, 'E8', { weeks: [days('2026-07-12', 7)], events: [ev('展場布置', '2026-07-16', '2026-07-14')] }, [{ pieces: ['展場布置|L0|4+1|起迄'] }])],

  // F. 車道(calendar.spec.md「跨日長條」車道分配那條):週 07-19 週日 … 07-25 週六,欄 0 = 週日
  ['F1', '最低空車道:單日事件補進空著的車道', (lib) => expectMonth(lib, 'F1', {
    weeks: WEEK_0719,
    events: [ev('季度規劃', '2026-07-20', '2026-07-23'), ev('設計審查', '2026-07-21', '2026-07-22'), ev('上線檢查', '2026-07-23', '2026-07-24')],
  }, [{ pieces: ['季度規劃|L0|1+3|起迄', '設計審查|L1|2+1|起迄', '上線檢查|L0|4+1|起迄'], cells: ['m0+0', 'm1+0', 'm2+0', 'm1+0', 'm1+0', 'm0+0', 'm0+0'] }])],
  ['F2', '涵蓋的每一天都要空著(週二被佔 → 整段放車道 1)', (lib) => expectMonth(lib, 'F2', {
    weeks: WEEK_0719,
    events: [ev('客戶拜訪', '2026-07-20', '2026-07-22'), ev('供應商稽核', '2026-07-21', '2026-07-24')],
  }, [{ pieces: ['客戶拜訪|L0|1+2|起迄', '供應商稽核|L1|2+3|起迄'], cells: ['m0+0', 'm1+0', 'm2+0', 'm2+0', 'm2+0', 'm0+0', 'm0+0'] }])],
  ['F3', '同一事件同一週同一車道(週三、週四車道 0 雖空著也不往下掉)', (lib) => {
    const b = []
    const layout = captureWarnings(() => month(lib, { weeks: WEEK_0719, events: [ev('客戶拜訪', '2026-07-20', '2026-07-22'), ev('供應商稽核', '2026-07-21', '2026-07-24')] })).result
    expectEq(b, '供應商稽核的塊', layout.weeks[0].pieces.filter((p) => p.entry.event.title === '供應商稽核').map(pieceStr), ['供應商稽核|L1|2+3|起迄'])
    expectEq(b, '週三那一格由上而下', cellTitles(layout, 0, 3), ['供應商稽核'])
    return b
  }],
  ['F4', '車道照格內排序放(全天先於有時段)', (lib) => expectMonth(lib, 'F4', {
    weeks: WEEK_0719,
    events: [ev('晨會', '2026-07-21T09:00', '2026-07-21T09:30'), ev('全員大會', '2026-07-21', '2026-07-22')],
  }, [{ pieces: ['全員大會|L0|2+1|起迄', '晨會|L1|2+1|起迄'] }])],

  // G. 隱藏週末(Cell 規則「隱藏週末」):輸入看得見的日子;只落在週末的事件不畫、不佔車道;跨過週末的長條週五收、週一起,兩端直角
  ['G1', '週日起、藏六日:週五 → 週一的長條在兩週各一段,內側兩端斷開;只在週六的事件不佔車道', (lib) => expectMonth(lib, 'G1', {
    weeks: [days('2026-07-19', 7, [0, 6]), days('2026-07-26', 7, [0, 6])],
    events: [ev('機房搬遷', '2026-07-24', '2026-07-28'), ev('週末值班', '2026-07-25', '2026-07-26'), ev('週會', '2026-07-24T10:00', '2026-07-24T11:00')],
  }, [
    { pieces: ['機房搬遷|L0|4+1|起', '週會|L1|4+1|起迄'], cells: ['m0+0', 'm0+0', 'm0+0', 'm0+0', 'm2+0'] },
    { pieces: ['機房搬遷|L0|0+1|迄重'], cells: ['m1+0', 'm0+0', 'm0+0', 'm0+0', 'm0+0'] },
  ])],
  ['G2', '週三起、藏六日(週末在一列中間):長條在週末切成兩段、同一車道;只在週六的事件不佔週一的車道', (lib) => expectMonth(lib, 'G2', {
    weeks: [days('2026-07-22', 7, [0, 6])],
    events: [ev('跨週末出差', '2026-07-23', '2026-07-28'), ev('週六加班', '2026-07-25', '2026-07-26'), ev('週一例會', '2026-07-27T10:00', '2026-07-27T11:00')],
  }, [{ pieces: ['跨週末出差|L0|1+2|起', '跨週末出差|L0|3+1|迄重', '週一例會|L1|3+1|起迄'], cells: ['m0+0', 'm1+0', 'm1+0', 'm2+0', 'm0+0'] }])],

  // H. 每格筆數與「+N」(看最高佔用車道、不看筆數;總帳更正 #7)+ 逐格切
  ['H1', 'k = 2:長條在溢出那一格被「+N」切開,前後兩段照畫、靠那一格的兩端斷開,第二段標重複', (lib) => expectMonth(lib, 'H1', {
    weeks: WEEK_0719, maxRows: 2,
    events: [ev('1 號產線保養', '2026-07-20', '2026-07-25'), ev('2 號產線保養', '2026-07-20', '2026-07-25'), ev('品管抽檢', '2026-07-22', '2026-07-23')],
  }, [{ pieces: ['1 號產線保養|L0|1+5|起迄', '2 號產線保養|L1|1+2|起', '2 號產線保養|L1|4+2|迄重'], cells: ['m0+0', 'm2+0', 'm2+0', 'm3+2', 'm2+0', 'm2+0', 'm0+0'] }])],
  ['H2', 'k = 2:被換掉的那一列本來空著 → 「+1」;那一列有事件 → N ≥ 2', (lib) => expectMonth(lib, 'H2', {
    weeks: WEEK_0719, maxRows: 2,
    events: [ev('1 組交接', '2026-07-19', '2026-07-21'), ev('2 組交接', '2026-07-19', '2026-07-21'), ev('設備巡檢', '2026-07-20', '2026-07-23')],
  }, [{ pieces: ['1 組交接|L0|0+2|起迄', '2 組交接|L1|0+1|起'], cells: ['m2+0', 'm3+2', 'm3+1', 'm3+1', 'm0+0', 'm0+0', 'm0+0'] }])],
  ['H3', 'k = 3:剛好放滿不出現「+N」', (lib) => expectMonth(lib, 'H3', {
    weeks: WEEK_0719, maxRows: 3,
    events: [ev('1 組交接', '2026-07-19', '2026-07-21'), ev('2 組交接', '2026-07-19', '2026-07-21'), ev('設備巡檢', '2026-07-20', '2026-07-23')],
  }, [{ pieces: ['1 組交接|L0|0+2|起迄', '2 組交接|L1|0+2|起迄', '設備巡檢|L2|1+3|起迄'], cells: ['m2+0', 'm3+0', 'm3+0', 'm3+0', 'm0+0', 'm0+0', 'm0+0'] }])],
  ['H4', 'k = 1:一列都畫不下時那一列就是「+N」(N = 這一格全部)', (lib) => expectMonth(lib, 'H4', {
    weeks: WEEK_0719, maxRows: 1,
    events: [ev('1 組交接', '2026-07-19', '2026-07-21'), ev('2 組交接', '2026-07-19', '2026-07-21'), ev('設備巡檢', '2026-07-20', '2026-07-23')],
  }, [{ pieces: [], cells: ['m2+2', 'm3+3', 'm3+1', 'm3+1', 'm0+0', 'm0+0', 'm0+0'] }])],
  ['H5', 'k 的邊界:NaN / 0 / 負數當 1,小數取整,Infinity = 不限', (lib) => {
    const b = []
    const k = (maxRows) => captureWarnings(() => month(lib, { weeks: WEEK_0719, maxRows, events: [ev('設計審查', '2026-07-21T10:00', '2026-07-21T11:00')] })).result.maxRows
    expectEq(b, 'maxRows', [NaN, 0, -3, 2.7, Infinity].map(k), [1, 1, 1, 2, Infinity])
    return b
  }],

  // I. 格內排序五條(calendar.spec.md「格內排序」):「+N」清單(layoutDay)與車道(layoutMonth)用同一支,兩邊都驗;那一天 = 07-22 週三(欄 3)
  ...[
    ['I1', '(1) 開始日期早的在上(比自己長的晚開始事件還上面)', [ev('季度規劃週', '2026-07-20', '2026-07-23'), ev('年度盤點', '2026-07-22', '2026-07-27')], ['季度規劃週', '年度盤點']],
    ['I2', '(2) 同一天開始的,長的在上', [ev('1 號倉盤點', '2026-07-22', '2026-07-23'), ev('2 號倉盤點', '2026-07-22', '2026-07-25')], ['2 號倉盤點', '1 號倉盤點']],
    ['I3', '(3) 全天在有時段之前(00:00 開始的也一樣)', [ev('1 號機房維護', '2026-07-22T00:00', '2026-07-22T02:00'), ev('2 號機房盤點', '2026-07-22', '2026-07-23')], ['2 號機房盤點', '1 號機房維護']],
    ['I4', '(4) 有時段的依開始時間', [ev('1 號會議室預約', '2026-07-22T14:00', '2026-07-22T15:00'), ev('2 號會議室預約', '2026-07-22T09:00', '2026-07-22T10:00')], ['2 號會議室預約', '1 號會議室預約']],
    ['I5', '(5) 最後依標題(與傳入順序無關)', [ev('2 號產線保養', '2026-07-22', '2026-07-23'), ev('1 號產線保養', '2026-07-22', '2026-07-23')], ['1 號產線保養', '2 號產線保養']],
  ].map(([id, desc, events, expected]) => [id, desc, (lib) => {
    const b = []
    expectEq(b, '「+N」清單的順序', dayTitles(lib, { on: '2026-07-22', events }), expected)
    const layout = captureWarnings(() => month(lib, { weeks: WEEK_0719, events })).result
    expectEq(b, '週三那一格由上而下(車道)', cellTitles(layout, 0, 3), expected)
    return b
  }]),
  ['I6', '標題依 locale 的排序(de-DE:Ä 跟 A 排,不照字碼)', (lib) => {
    const b = []
    const events = [ev('Zahlungslauf', '2026-07-22', '2026-07-23'), ev('Änderungsstopp', '2026-07-22', '2026-07-23')]
    expectEq(b, '「+N」清單的順序', dayTitles(lib, { on: '2026-07-22', events, locale: 'de-DE' }), ['Änderungsstopp', 'Zahlungslauf'])
    return b
  }],
  ['I7', 'Collator 依 locale 只建一次', (lib) => {
    const b = []
    expectEq(b, '同 locale 同一個 / 不同 locale 不同', [lib.getTitleCollator('zh-TW') === lib.getTitleCollator('zh-TW'), lib.getTitleCollator('zh-TW') === lib.getTitleCollator('de-DE')], [true, false])
    return b
  }],

  // J. 延續旗標(calendar.spec.md「跨日長條」換週切段 / 斷開端;CalendarEventSegment 的五個欄位):2026 年 7 月格陣 06-28 … 08-01
  ['J1', '換週切段:第一段真起點、第二段真終點 + 重複標題;都在可見範圍內(沒有 < >)', (lib) => expectMonth(lib, 'J1', {
    weeks: JULY_GRID, events: [ev('產品上線週', '2026-07-23', '2026-07-29')],
  }, [{ pieces: [] }, { pieces: [] }, { pieces: [] }, { pieces: ['產品上線週|L0|4+3|起'] }, { pieces: ['產品上線週|L0|0+3|迄重'] }])],
  ['J2', '起點在可見範圍之前:continuesBefore,第一塊不算重複', (lib) => expectMonth(lib, 'J2', {
    weeks: JULY_GRID, events: [ev('年中盤點', '2026-06-25', '2026-07-03')],
  }, [{ pieces: ['年中盤點|L0|0+5|迄<'] }])],
  ['J3', '終點在可見範圍之後:continuesAfter', (lib) => expectMonth(lib, 'J3', {
    weeks: JULY_GRID, events: [ev('暑期實習', '2026-07-30', '2026-08-06')],
  }, [{ pieces: [] }, { pieces: [] }, { pieces: [] }, { pieces: [] }, { pieces: ['暑期實習|L0|4+3|起>'] }])],
  ['J4', '橫跨整個格陣:每週一段,兩端都延續到畫面外,第二段起重複', (lib) => expectMonth(lib, 'J4', {
    weeks: JULY_GRID, events: [ev('系統凍結期', '2026-06-20', '2026-08-10')],
  }, [{ pieces: ['系統凍結期|L0|0+7|<>'] }, { pieces: ['系統凍結期|L0|0+7|<>重'] }, { pieces: ['系統凍結期|L0|0+7|<>重'] }, { pieces: ['系統凍結期|L0|0+7|<>重'] }, { pieces: ['系統凍結期|L0|0+7|<>重'] }])],

  // K. 「+N」清單的延續資訊以「這一天」為範圍算(calendar.spec.md「「+N」清單浮層」內容那段)
  ['K1', '跨三天的事件:第一天只有後面還有、中間兩邊都有、最後一天只有前面有', (lib) => {
    const b = []
    const events = [ev('季度規劃週', '2026-07-20', '2026-07-23')]
    expectEq(b, '三天的清單', ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23'].map((on) => dayList(lib, { on, events })), [['季度規劃週 起>'], ['季度規劃週 <>'], ['季度規劃週 迄<'], []])
    return b
  }],
  ['K2', '過夜與午夜結束的有時段事件只出現在開始那天的清單', (lib) => {
    const b = []
    const events = [ev('夜間部署', '2026-07-15T22:00', '2026-07-16T01:00'), ev('午夜收單', '2026-07-15T23:00', '2026-07-16T00:00')]
    expectEq(b, '兩天的清單', ['2026-07-15', '2026-07-16'].map((on) => dayList(lib, { on, events })), [['夜間部署 起迄', '午夜收單 起迄'], []])
    return b
  }],

  // T. 詳情時間欄與「全天」切換(calendar.spec.md「事件詳情浮層」時間欄、切換全天【Q16(定)】;calendar-layout.ts detailRangeOf / rangeToTimePatch / toggleAllDayPatch)
  ['T1', '有時段 → 全天:只留日期、記住原時間', (lib) => {
    const b = []
    const { patch, remember } = lib.toggleAllDayPatch(normalizeOne(lib, ev('設計審查', '2026-07-15T10:00', '2026-07-15T11:00')), true, null)
    expectEq(b, 'patch / 記住', [patch, remember], [{ start: '2026-07-15', end: '2026-07-16', allDay: true }, { startTime: '10:00', endTime: '11:00', endDayOffset: 0 }])
    return b
  }],
  ['T2', '全天 → 有時段:記得 → 開始日 + 記得的時間(過夜的結束日 = 開始日 + 1)', (lib) => {
    const b = []
    const entry = normalizeOne(lib, ev('夜間部署', '2026-07-15T22:00', '2026-07-16T01:00'))
    const off = lib.toggleAllDayPatch(entry, true, null)
    expectEq(b, '記住過夜', off.remember, { startTime: '22:00', endTime: '01:00', endDayOffset: 1 })
    const allDay = normalizeOne(lib, { title: '夜間部署', ...off.patch })
    expectEq(b, '切回', lib.toggleAllDayPatch(allDay, false, off.remember).patch, { start: '2026-07-15T22:00', end: '2026-07-16T01:00', allDay: false })
    return b
  }],
  ['T3', '原本就是全天、沒有記錄 → 開始日 09:00 起一小時(牆上時間)', (lib) => {
    const b = []
    expectEq(b, '多天全天切成有時段', lib.toggleAllDayPatch(normalizeOne(lib, ev('程式碼凍結', '2026-07-13', '2026-07-16')), false, null).patch, { start: '2026-07-13T09:00', end: '2026-07-13T10:00', allDay: false })
    return b
  }],
  ['T4', '日光節約那天(2026-03-08 只有 23 小時)也是 09:00 – 10:00;跨過 02:00 的時段原樣還原', (lib) => {
    const b = []
    expectEq(b, '沒記錄', lib.toggleAllDayPatch(normalizeOne(lib, ev('季度盤點', '2026-03-08', '2026-03-09')), false, null).patch, { start: '2026-03-08T09:00', end: '2026-03-08T10:00', allDay: false })
    const off = lib.toggleAllDayPatch(normalizeOne(lib, ev('機房維護', '2026-03-08T01:30', '2026-03-08T03:30')), true, null)
    expectEq(b, '記住', off.remember, { startTime: '01:30', endTime: '03:30', endDayOffset: 0 })
    expectEq(b, '還原', lib.toggleAllDayPatch(normalizeOne(lib, { title: '機房維護', ...off.patch }), false, off.remember).patch, { start: '2026-03-08T01:30', end: '2026-03-08T03:30', allDay: false })
    return b
  }],
  ['T5', '時間欄的值:全天的結束日「含」↔ end「不含」換算一天(日光節約 25 小時那天也是加一個日曆日)', (lib) => {
    const b = []
    expectEq(b, '全天 → 時間欄', lib.detailRangeOf(normalizeOne(lib, ev('Alex 休假', '2026-07-20', '2026-07-23'))), ['2026-07-20', '2026-07-22'])
    expectEq(b, '有時段 → 時間欄', lib.detailRangeOf(normalizeOne(lib, ev('設計審查', '2026-07-15T10:00', '2026-07-15T11:00'))), ['2026-07-15T10:00', '2026-07-15T11:00'])
    expectEq(b, '時間欄 → 全天(11-01 = 25 小時)', lib.rangeToTimePatch(['2026-11-01', '2026-11-01'], true), { start: '2026-11-01', end: '2026-11-02', allDay: true })
    expectEq(b, '時間欄 → 有時段', lib.rangeToTimePatch(['2026-07-15T10:00', '2026-07-15T11:30'], false), { start: '2026-07-15T10:00', end: '2026-07-15T11:30', allDay: false })
    return b
  }],
]

// ── 靜態(原始碼文字):住處、出口、禁寫固定毫秒、第一段不開 timeZone ─────────────────────────────────
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
function checkStatic(source, indexSource) {
  const bad = []
  const head = source.split('\n').slice(0, 10).join('\n')
  if (!head.includes('@internal')) bad.push('[L1] 檔頭 10 行內沒有 @internal(不進出口的標記)')
  if (!source.includes('── 消費的 SSOT ──')) bad.push('[L1] 沒有「── 消費的 SSOT ──」段')
  const code = stripComments(source)
  if (/from\s+['"](?:\.\/calendar|@\/design-system\/components\/Calendar\/calendar)['"]/.test(code)) bad.push('[L2] import 了 calendar.tsx(輸入要用結構型別,免循環 import)')
  if (/from\s+['"]react['"]/.test(code)) bad.push('[L2] import 了 react(純函式檔)')
  if (/86400000|864e5|24\s*\*\s*60\s*\*\s*60/.test(code)) bad.push('[L3] 原始碼寫了固定一天的毫秒(逐日一律日曆日,calendar.spec.md「資料語意」時區那條)')
  if (/\btimeZone\b/.test(code)) bad.push('[L4] 出現 timeZone(第一段不開,主線工程決定 (1))')
  if (/calendar-layout/.test(indexSource)) bad.push('[L5] components/Calendar/index.ts 轉出了 calendar-layout(它是 @internal)')
  return bad
}

// ── 跑 ────────────────────────────────────────────────────────────────────────────────────────────
function runRows(lib) {
  const result = new Map()
  for (const [id, , fn] of ROWS) {
    let bad
    try { bad = fn(lib) } catch (e) { bad = [`丟出例外:${e.message}`] }
    result.set(id, bad)
  }
  return result
}
const source = read(LAYOUT_PATH)
const indexSource = read(`${CALENDAR_DIR}/index.ts`)

// ── M. k 是誰算的(M32 參數邊界;calendar.spec.md「每格筆數與「+N」」算式【AI 推導】)─────────────────────────────
// layoutMonth 收的 maxRows 是參數:它算得對不對,取決於傳進來的值是誰算的。算式住在 calendar-geometry.ts calendarRowsThatFit
//(與 CSS 讀同一批常數,M17);calendar.tsx 量到格高(layoutBorderBoxSize 的 height,版面尺寸)後只經這一支設 maxRows,再原樣交給 layoutMonth。
const GEOMETRY_PATH = `${CALENDAR_DIR}/calendar-geometry.ts`
const CALENDAR_PATH = `${CALENDAR_DIR}/calendar.tsx`
const geometrySource = read(GEOMETRY_PATH)
const calendarSource = read(CALENDAR_PATH)
// 格高 → k。期望值照規格算式逐格手寫:k = max(1, ⌊(格高 − 格線 1 − 上內距 4 − 日期框 24 − 日期到第一列 4 − 下內距 4 + 列距 4) ÷ 28⌋),
// 量到的格高是 LayoutUnit(1/64 px)取整的值:差一個 LayoutUnit 還算放得下(116.984375 → 3),差兩個就不算(116.96875 → 2)
const K_TABLE = [[40, 1], [61, 1], [88, 1], [89, 2], [116.96875, 2], [116.984375, 3], [117, 3], [157, 4], [228, 6], [229, 7]]
const K_ROWS = [
  ['M1', '格高 → 每格放得下幾列(含格最小高 61 = 1 列、剛好放滿、LayoutUnit 取整的邊界)', (geo) => {
    const b = []
    expectEq(b, 'calendarRowsThatFit', K_TABLE.map(([h]) => geo.calendarRowsThatFit(h)), K_TABLE.map(([, k]) => k))
    return b
  }],
]
function runKRows(geo) {
  const result = new Map()
  for (const [id, , fn] of K_ROWS) {
    let bad
    try { bad = fn(geo) } catch (e) { bad = [`丟出例外:${e.message}`] }
    result.set(id, bad)
  }
  return result
}
/** calendar.tsx 的接線:maxRows 只有一個寫入點 = calendarRowsThatFit(量到的格高),原樣交給 layoutMonth */
function checkKWiring(src) {
  const bad = []
  const code = stripComments(src)
  const writes = code.match(/setMaxRows\(/g) ?? []
  const fromHeight = /setMaxRows\(calendarRowsThatFit\((\w+)\.height\)\)/.exec(code)
  if (writes.length !== 1 || !fromHeight) bad.push(`[M2] maxRows 的寫入點不是剛好一個「setMaxRows(calendarRowsThatFit(<量到的尺寸>.height))」(找到 ${writes.length} 個寫入點)`)
  else if (!new RegExp(`const ${fromHeight[1]} = layoutBorderBoxSize\\(`).test(code)) bad.push(`[M2] 交給 calendarRowsThatFit 的 ${fromHeight[1]}.height 不是 layoutBorderBoxSize 量到的版面尺寸`)
  if (!/const \[maxRows, setMaxRows\] = React\.useState/.test(code)) bad.push('[M3] 找不到 maxRows 狀態(const [maxRows, setMaxRows] = React.useState)')
  const call = /layoutMonth\(\{([^}]*)\}\)/.exec(code)
  if (!call || !/(^|[\s,{])maxRows(\s*[,}]|\s*$)/.test(call[1])) bad.push(`[M3] layoutMonth 收的 maxRows 不是那個狀態原樣:${call ? call[1].trim() : '找不到 layoutMonth({ … }) 呼叫'}`)
  return bad
}

if (!SELFTEST) {
  await bundle('calendar-layout.mjs', [source])
  const { m0: lib } = await import('./.gate-bundles/calendar-layout.mjs')
  assertExports(lib, 'calendar-layout.ts')
  const result = runRows(lib)
  let fail = 0
  for (const [id, desc] of ROWS) {
    const bad = result.get(id)
    if (bad.length === 0) { console.log(`✓ ${id} ${desc}`); continue }
    fail += bad.length
    console.log(`✗ ${id} ${desc}`)
    for (const x of bad) console.log(`   - ${x}`)
  }
  const staticBad = checkStatic(source, indexSource)
  if (staticBad.length === 0) console.log('✓ L 靜態:@internal + 消費的 SSOT、不 import calendar.tsx / react、不寫固定毫秒、不開 timeZone、index 不轉出')
  else { console.log('✗ L 靜態'); for (const x of staticBad) console.log(`   - ${x}`); fail += staticBad.length }
  // M:k 是誰算的
  await bundle('calendar-geometry-k.mjs', [geometrySource])
  const { m0: geo } = await import('./.gate-bundles/calendar-geometry-k.mjs')
  if (typeof geo?.calendarRowsThatFit !== 'function') instrumentFail('calendar-geometry.ts 取不到出口 calendarRowsThatFit(出口名稱改了?)')
  for (const [id, desc] of K_ROWS) {
    const bad = runKRows(geo).get(id)
    if (bad.length === 0) { console.log(`✓ ${id} ${desc}`); continue }
    fail += bad.length
    console.log(`✗ ${id} ${desc}`)
    for (const x of bad) console.log(`   - ${x}`)
  }
  const wiringBad = checkKWiring(calendarSource)
  if (wiringBad.length === 0) console.log('✓ M2 / M3 靜態:calendar.tsx 的 maxRows 只有一個寫入點 = calendarRowsThatFit(layoutBorderBoxSize 量到的格高),原樣交給 layoutMonth')
  else { console.log('✗ M2 / M3 靜態'); for (const x of wiringBad) console.log(`   - ${x}`); fail += wiringBad.length }
  if (fail) { console.log(`\n✗ ${fail} 處不符`); process.exit(1) }
  console.log(`\n✓ Calendar 事件版面:${ROWS.length} 格判定表、k 的算式與接線、靜態檢查全部相符`)
  process.exit(0)
}

// ── --selftest:每一條規則一個突變,必須讓指定的格紅 ───────────────────────────────────────────────
const replaceOnce = (src, from, to, label) => {
  if (src.split(from).length !== 2) instrumentFail(`對照組「${label}」要改的片段不是剛好出現一次(原始碼改了,對照組要跟著改):${from}`)
  return src.replace(from, to)
}
/** 把整個具名函式換掉(大括號配對;函式本體裡沒有字串大括號) */
const replaceFunction = (src, name, replacement, label) => {
  const at = src.indexOf(`function ${name}`)
  if (at === -1) instrumentFail(`對照組「${label}」找不到 function ${name}`)
  let i = src.indexOf('{', src.indexOf(')', at))
  let depth = 0
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) break
  }
  return src.slice(0, at) + replacement + src.slice(i + 1)
}
const PER_DAY_STACKING = `function placeWeek<E extends CalendarLayoutEvent>(dayMs: readonly number[], sorted: readonly NormalizedCalendarEvent<E>[]): Placement<E>[] {
  const placements: Placement<E>[] = []
  dayMs.forEach((ms, col) => {
    let lane = 0
    for (const entry of sorted) if (entry.firstDayMs <= ms && ms <= entry.lastDayMs) placements.push({ entry, lane: lane++, from: col, to: col })
  })
  return placements
}`

const MUTANTS = [
  ['拿掉排序 (1)「開始日期早的在上」', (s) => replaceOnce(s, '    a.firstDayMs - b.firstDayMs ||\n', '', '排序 1'), ['I1']],
  ['拿掉排序 (2)「長的在上」', (s) => replaceOnce(s, '    b.dayCount - a.dayCount ||\n', '', '排序 2'), ['I2', 'D7']],
  ['拿掉排序 (3)「全天在有時段之前」', (s) => replaceOnce(s, '    Number(b.allDay) - Number(a.allDay) ||\n', '', '排序 3'), ['I3']],
  ['拿掉排序 (4)「依開始時間」', (s) => replaceOnce(s, '    a.start.getTime() - b.start.getTime() ||\n', '', '排序 4'), ['I4']],
  ['拿掉排序 (5)「最後依標題」', (s) => replaceOnce(s, ' ||\n    collator.compare(a.event.title, b.event.title)', '', '排序 5'), ['I5']],
  ['標題改用 < 比(不依 locale)', (s) => replaceOnce(s, 'collator.compare(a.event.title, b.event.title)', '(a.event.title < b.event.title ? -1 : a.event.title > b.event.title ? 1 : 0)', '標題 <'), ['I6']],
  ['「+N」清單不排序(只照傳入順序)', (s) => replaceOnce(s, '    .sort(createEventComparator(options.locale))\n', '', '清單不排序'), ['I5']],
  ['Q7「滿 24 小時」改用日曆日(加一天)', (s) => replaceOnce(s, 'addHours(start, 24)', 'new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, start.getHours(), start.getMinutes())', 'Q7 日曆日'), ['D1']],
  ['Q7「滿 24 小時」改成「超過 24 小時」', (s) => replaceOnce(s, "return !isBefore(end, addHours(start, 24)) ? 'bar' : 'timed'", "return isBefore(addHours(start, 24), end) ? 'bar' : 'timed'", '超過 24'), ['C6', 'C8']],
  ['欄與欄相不相鄰改用固定毫秒', (s) => replaceOnce(s, 'differenceInCalendarDays(day, days[col - 1]) === 1', '(day.getTime() - days[col - 1].getTime()) / (24 * 3600 * 1000) === 1', '相鄰毫秒'), ['D6']],
  ['天數(長的在上)改用固定毫秒', (s) => replaceOnce(s, 'dayCount: differenceInCalendarDays(lastDay, firstDay) + 1', 'dayCount: Math.floor((lastDay.getTime() - firstDay.getTime()) / (24 * 3600 * 1000)) + 1', '天數毫秒'), ['D5', 'D7']],
  ['把 end 當成含', (s) => replaceOnce(s, 'startOfDay(subMilliseconds(end, 1))', 'startOfDay(end)', 'end 含'), ['C1', 'C2', 'C8']],
  ['拿掉 start 晚於 end 的正規化', (s) => replaceOnce(s, '      end = start\n', '', '正規化'), ['E1', 'E2', 'E8']],
  ['全天 end === start 不警告', (s) => replaceOnce(s, '    } else if (allDay && end.getTime() === start.getTime()) {', '    } else if (false) {', '不警告'), ['E3']],
  ['零長度不畫在開始那天', (s) => replaceOnce(s, "kind === 'timed' || end.getTime() === start.getTime() ? firstDay", "kind === 'timed' ? firstDay", '零長度'), ['E3']],
  ['只有日期不推斷全天', (s) => replaceOnce(s, 'event.allDay ?? (isDateOnlyString(event.start) && isDateOnlyString(event.end))', 'event.allDay ?? false', '不推斷'), ['B1', 'E3']],
  ['Date 物件(午夜)也推斷全天', (s) => replaceOnce(s, "return typeof value === 'string' && DATE_ONLY.test(value)", "return typeof value === 'string' ? DATE_ONLY.test(value) : value.getHours() === 0 && value.getMinutes() === 0", 'Date 推斷'), ['B3', 'A7']],
  ['一端只有日期就推斷全天(「都」改成「任一」)', (s) => replaceOnce(s, '(isDateOnlyString(event.start) && isDateOnlyString(event.end))', '(isDateOnlyString(event.start) || isDateOnlyString(event.end))', '任一'), ['B2']],
  ['只有日期改走原生解析(UTC 午夜)', (s) => replaceOnce(s, 'if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))', 'if (dateOnly) return new Date(value)', '原生解析'), ['A1']],
  ['不帶 offset 的時刻當 UTC', (s) => replaceOnce(s, '  const local = LOCAL_DATE_TIME.exec(value)\n', "  const local = null; if (LOCAL_DATE_TIME.test(value)) return new Date(value + 'Z')\n", '本地當 UTC'), ['A2', 'A3']],
  ['車道一律往下疊(不找最低空車道)', (s) => replaceOnce(s, '    if (free) return lane\n', '', '往下疊'), ['F1']],
  ['車道只看最後一天空不空', (s) => replaceOnce(s, '    for (let col = from; col <= to; col++) {\n      if (row[col]) {', '    for (let col = to; col <= to; col++) {\n      if (row[col]) {', '只看最後一天'), ['F2']],
  ['每一天各自從 0 往下排(舊的逐日分桶)', (s) => replaceFunction(s, 'placeWeek', PER_DAY_STACKING, '逐日分桶'), ['F1', 'F3']],
  ['只落在被藏日子的事件夾到旁邊那一格', (s) => replaceOnce(s, '    if (from > to) continue\n', '    if (from > to) to = from\n', '夾到旁邊'), ['G2']],
  ['被藏的日子不切段(看得見的欄相鄰就連成一段)', (s) => replaceOnce(s, 'col > 0 && differenceInCalendarDays(day, days[col - 1]) === 1', 'col > 0', '不切段'), ['G2']],
  ['斷開端不標:isStart 寫成 !continuesBefore', (s) => replaceOnce(s, 'isStart: dayMs[a] === p.entry.firstDayMs,', 'isStart: !(p.entry.firstDayMs < rangeFirstMs),', 'isStart'), ['J1', 'G1', 'H1']],
  ['旗標用整週範圍算(被「+N」切開那端不標)', (s) => replaceOnce(replaceOnce(s, 'isStart: dayMs[a] === p.entry.firstDayMs,', 'isStart: dayMs[p.from] === p.entry.firstDayMs,', '整週起'), 'isEnd: dayMs[b] === p.entry.lastDayMs,', 'isEnd: dayMs[p.to] === p.entry.lastDayMs,', '整週迄'), ['H1', 'H2']],
  ['改用筆數算 +N(m = 這一格的事件筆數)', (s) => replaceOnce(s, 'rowsNeeded[col] = Math.max(rowsNeeded[col], p.lane + 1)', 'rowsNeeded[col] += 1', '筆數'), ['H2']],
  ['整條長條一起藏(不逐格切)', (s) => replaceOnce(s, 'const isDrawn = (col: number, lane: number) => rowsNeeded[col] <= k || lane <= k - 2', 'const isDrawn = (_col: number, lane: number) => lane <= k - 2 || Math.max(...rowsNeeded) <= k', '整條藏'), ['H1']],
  ['continuesBefore 寫成 !isStart', (s) => replaceOnce(s, 'continuesBefore: p.entry.firstDayMs < rangeFirstMs,', 'continuesBefore: dayMs[a] !== p.entry.firstDayMs,', 'continuesBefore'), ['J1', 'G1']],
  ['isSegmentRepeat 恆為假', (s) => replaceOnce(s, 'const isSegmentRepeat = drawnBefore.has(p.entry)', 'const isSegmentRepeat = false', 'repeat'), ['J1', 'J4', 'H1']],
  // T. 詳情時間欄與全天切換
  ['切成全天時不記住原時間', (s) => replaceOnce(s, "    const remember = entry.allDay\n      ? null\n", "    const remember = true\n      ? null\n", '不記住'), ['T1', 'T2', 'T4']],
  ['沒有記錄時不給 09:00(給開始那一刻的時間)', (s) => replaceOnce(s, '      start: `${day}T${hourString(CALENDAR_DEFAULT_START_HOUR)}`,', '      start: minuteString(entry.start),', '不給 09'), ['T3', 'T4']],
  ['全天的結束日換算改用固定毫秒(+ 一天的毫秒)', (s) => replaceOnce(s, 'end: dayString(addDays(lastDay, 1)), allDay: true', 'end: dayString(new Date(lastDay.getTime() + 24 * 3600 * 1000)), allDay: true', '換算毫秒'), ['T5']],
  ['一小時改成加 3600000 毫秒(從開始那一刻算)', (s) => replaceOnce(s, '      end: `${day}T${hourString(CALENDAR_DEFAULT_START_HOUR + CALENDAR_DEFAULT_DURATION_HOURS)}`,', '      end: minuteString(new Date(parseEventDate(day).getTime() + (CALENDAR_DEFAULT_START_HOUR + CALENDAR_DEFAULT_DURATION_HOURS) * 3600000)),', '加毫秒'), ['T4']],
]
const STATIC_MUTANTS = [
  ['原始碼寫固定一天的毫秒', (s) => `${s}\nexport const DAY_MS = 86400000\n`, /\[L3\]/],
  ['import calendar.tsx 的型別', (s) => s.replace("import { addDays, addHours", "import type { CalendarEvent } from './calendar'\nimport { addDays, addHours"), /\[L2\]/],
  ['檔頭拿掉 @internal', (s) => s.replace('@internal — ', ''), /\[L1\]/],
  ['開 timeZone 參數', (s) => s.replace('  locale: string\n}): CalendarMonthLayout<E> {', '  locale: string\n  timeZone?: string\n}): CalendarMonthLayout<E> {'), /\[L4\]/],
]

const variants = [source, ...MUTANTS.map(([name, mutate]) => mutate(source, name))]
await bundle('calendar-layout-mutants.mjs', variants)
const loaded = await import('./.gate-bundles/calendar-layout-mutants.mjs')
assertExports(loaded.m0, '未突變的那一份')
const baseline = runRows(loaded.m0)
const baselineRed = [...baseline].filter(([, bad]) => bad.length > 0).map(([id]) => id)
if (baselineRed.length) instrumentFail(`未突變的那一份本身就紅(${baselineRed.join('、')}),對照組無從比較 —— 先跑不帶 --selftest 的那一次`)
const baselineStatic = checkStatic(source, indexSource)
if (baselineStatic.length) instrumentFail(`未突變的原始碼靜態檢查本身就紅:${baselineStatic.join(' / ')}`)

let missed = 0
for (const [i, [name, , expectRed]] of MUTANTS.entries()) {
  const lib = loaded[`m${i + 1}`]
  let red
  try {
    assertExports(lib, `對照組「${name}」`)
    red = [...runRows(lib)].filter(([, bad]) => bad.length > 0).map(([id]) => id)
  } catch (e) {
    red = [`例外:${e.message}`]
  }
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
const indexBad = checkStatic(source, `${indexSource}export * from './calendar-layout'\n`)
const indexCaught = indexBad.some((b) => /\[L5\]/.test(b))
console.log(`${indexCaught ? '✓' : '✗'} 靜態對照組「index.ts 轉出 calendar-layout」${indexCaught ? '被抓到' : '沒被抓到'}`)
if (!indexCaught) missed++
// M:k 的算式突變(打進同一個檔,m0 = 原樣)與接線的靜態突變
const K_MUTANTS = [
  ['k 的算式沒扣格線(格最小高回到 60 的算法)', (s) => replaceOnce(s, 'cellHeightPx - CALENDAR_GRID_LINE_PX - CALENDAR_GAP_PX', 'cellHeightPx - CALENDAR_GAP_PX', '沒扣格線'), ['M1']],
  ['k 的算式不加回 LayoutUnit(剛好放滿那一格因取整少一列)', (s) => replaceOnce(s, ' + LAYOUT_UNIT_PX)', ')', 'LayoutUnit'), ['M1']],
]
await bundle('calendar-geometry-k-mutants.mjs', [geometrySource, ...K_MUTANTS.map(([name, mutate]) => mutate(geometrySource, name))])
const geoLoaded = await import('./.gate-bundles/calendar-geometry-k-mutants.mjs')
const geoBaselineRed = [...runKRows(geoLoaded.m0)].filter(([, bad]) => bad.length).map(([id]) => id)
if (geoBaselineRed.length) instrumentFail(`k 的算式未突變的那一份本身就紅(${geoBaselineRed.join('、')})`)
for (const [i, [name, , expectRed]] of K_MUTANTS.entries()) {
  const red = [...runKRows(geoLoaded[`m${i + 1}`])].filter(([, bad]) => bad.length).map(([id]) => id)
  const caught = expectRed.every((id) => red.includes(id))
  console.log(`${caught ? '✓' : '✗'} 對照組「${name}」${caught ? '被抓到' : '沒被抓到'}(應紅 ${expectRed.join('、')};實紅 ${red.join('、') || '無'})`)
  if (!caught) missed++
}
if (checkKWiring(calendarSource).length) instrumentFail(`calendar.tsx 的 k 接線未突變時本身就紅:${checkKWiring(calendarSource).join(' / ')}`)
const K_WIRING_MUTANTS = [
  ['maxRows 寫死 3(不看格高)', (s) => replaceOnce(s, 'setMaxRows(calendarRowsThatFit(size.height))', 'setMaxRows(3)', '寫死 3'), /\[M2\]/],
  ['layoutMonth 收常數(不收量到的那個 k)', (s) => replaceOnce(s, 'events: normalizedEvents, maxRows, locale', 'events: normalizedEvents, maxRows: 3, locale', '收常數'), /\[M3\]/],
  ['量格寬當格高', (s) => replaceOnce(s, 'calendarRowsThatFit(size.height)', 'calendarRowsThatFit(size.width)', '寬當高'), /\[M2\]/],
]
for (const [name, mutate, pattern] of K_WIRING_MUTANTS) {
  const bad = checkKWiring(mutate(calendarSource))
  const caught = bad.some((b) => pattern.test(b))
  console.log(`${caught ? '✓' : '✗'} 靜態對照組「${name}」${caught ? '被抓到' : `沒被抓到(實得:${bad.join(' / ') || '0 筆'})`}`)
  if (!caught) missed++
}
if (missed) { console.log(`\n✗ selftest:${missed} 個對照組沒被抓到 —— 判定表沒在驗那一條`); process.exit(1) }
console.log(`\n✓ selftest:${MUTANTS.length + STATIC_MUTANTS.length + 1 + K_MUTANTS.length + K_WIRING_MUTANTS.length} 個對照組都被指定的格抓到`)
