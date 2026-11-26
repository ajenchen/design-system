#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Calendar 的原始碼在 Node 端渲染(esbuild 打包 + react-dom/server;process.env.NODE_ENV 定成 'development',開發期警告打開)時:
 *         D 三層範例(calendar.stories.tsx / calendar.anatomy.stories.tsx / calendar.principles.stories.tsx)每一則 story 的 render 跑一次,
 *           沒有任何一句 `[Calendar]` 開頭的 console.warn —— 範例資料照 calendar.spec.md「資料語意」:end 一律不含(一天的全天事件寫到隔天,
 *           start = end 的「含」寫法會被當成零長度並警告)、start 不晚於 end、日期解析得了(警告的唯一實作 calendar-layout.ts normalizeEvents)。
 *           為什麼在這裡量:Storybook 建置是 production,`process.env.NODE_ENV !== 'production'` 那幾段警告整段被打包器拿掉,
 *           瀏覽器閘(calendar-month-invariant)開建置好的範例永遠看不到警告;storybook-smoke-test 也只抓 console.error。
 *         T renderEventTile 的第二個參數是版面算出來的那一份(M32 參數邊界:不是元件自己另寫的常數):一筆跨週的全天事件(7/16–7/22,週日起)
 *           被呼叫兩次,第一段 isStart 真、isEnd 假、isSegmentRepeat 假,第二段 isStart 假、isEnd 真、isSegmentRepeat 真,兩段都沒有 continuesBefore / After;
 *           外層是元件自己的(role="button"、data-calendar-tile、data-calendar-covers 列出這一段涵蓋的日子)。
 *         R 可點的月曆裡單筆唯讀(CalendarEvent.readOnly):那一筆的外層沒有 role、沒有 data-calendar-tile;同一個月曆其他筆照樣是按鈕。
 *   紅: 任一則 story 有 `[Calendar]` 警告(指名 story 與那一句)、T / R 任一條不符 → exit 1。
 *   對照組(--selftest): 原始碼突變(esbuild 外掛在載入那一刻改字串,不碰 repo 檔),每一個都必須讓指定的那一格紅、其他照綠 ——
 *       (1) 團隊行事曆留一筆「含」的資料(單筆唯讀的公司假日 end 改回 start 同一天)→ D;
 *       (2) calendar.tsx 交給 renderEventTile 的 segment 寫死(不是版面那一段的旗標)→ T;
 *       (3) calendar.tsx 的唯讀判斷只看 readOnlyEvents(單筆 readOnly 沒接上)→ R。
 *   儀器失效(exit 2,印 INSTRUMENT-FAIL): esbuild 打包失敗、取不到探針出口、任一則 story 渲染丟例外、三支範例檔 0 則可渲染、
 *       範例裡應該有的事件沒渲染出來(團隊行事曆的「Alex 休假」—— 證明量的是真的事件資料,不是空月曆)、對照組要改的片段找不到。
 *   綠: 全部成立 exit 0。純 Node,不需要 storybook 建置與瀏覽器;時區固定 Asia/Taipei(範例的日子是本地日期),重複跑結果相同。
 *       打包檔寫在 scripts/.gate-bundles/(固定檔名、字面 import),去掉註解與空白(不把範例原始碼的註解帶進工作樹)。
 *
 * Run: `node scripts/calendar-render-contract-invariant.mjs`(`--selftest` 只跑對照組)
 */
// 時區要在任何 Date 之前設好(Node 改 process.env.TZ 會重設時區快取)
process.env.TZ = 'Asia/Taipei'

import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CAL = 'packages/design-system/src/components/Calendar'
const SELFTEST = process.argv.includes('--selftest')
const instrumentFail = (msg) => { console.error(`INSTRUMENT-FAIL: ${msg}`); process.exit(2) }
mkdirSync(join(ROOT, 'scripts/.gate-bundles'), { recursive: true })

// ── 探針(打包進去、在本行程裡跑):三支範例檔每一則 story + 兩個元件情境 ─────────────────────────────
// Storybook 預覽層的 TooltipProvider(packages/storybook-config/preview.tsx)在這裡補上;@storybook/test 換成空殼(只渲染、不跑 play)。
const PROBE = `
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { Calendar } from '@/design-system/components/Calendar/calendar'
import * as showcase from '@/design-system/components/Calendar/calendar.stories'
import * as anatomy from '@/design-system/components/Calendar/calendar.anatomy.stories'
import * as principles from '@/design-system/components/Calendar/calendar.principles.stories'

function capture(fn) {
  const warns = []
  const ow = console.warn, oe = console.error
  console.warn = (...a) => { warns.push(a.map(String).join(' ')) }
  // react-dom/server 對 useLayoutEffect 的提醒走 console.error(伺服器端渲染本來就不跑 layout effect),不是被量的東西
  console.error = () => {}
  try { return { value: fn(), warns } } finally { console.warn = ow; console.error = oe }
}
const Story = ({ render, args }) => render(args, { args })
const html = (node) => renderToStaticMarkup(React.createElement(TooltipProvider, null, node))
const noop = () => {}
const JULY = new Date(2026, 6, 15)

export function run() {
  const stories = []
  for (const [file, mod] of Object.entries({ showcase, anatomy, principles })) {
    const meta = mod.default
    for (const [name, story] of Object.entries(mod)) {
      if (name === 'default' || !story || typeof story !== 'object') continue
      const render = story.render ?? meta.render
      if (typeof render !== 'function') continue
      const id = meta.title + ' › ' + (story.name ?? name)
      const args = { ...(meta.args ?? {}), ...(story.args ?? {}) }
      try {
        const { value, warns } = capture(() => html(React.createElement(Story, { render, args })))
        stories.push({ id, file, warns: warns.filter((w) => w.startsWith('[Calendar]')), markup: value })
      } catch (error) {
        stories.push({ id, file, error: String(error && error.message || error) })
      }
    }
  }
  const calls = []
  const tile = capture(() => html(React.createElement(Calendar, {
    defaultReferenceDate: JULY, today: JULY, locale: 'zh-TW', weekStartsOn: 0,
    events: [{ id: 't', title: '跨週工作', start: '2026-07-16', end: '2026-07-23', allDay: true }],
    onDateClick: noop, onEventClick: noop, onCreateEvent: noop,
    renderEventTile: (event, segment) => { calls.push({ title: event.title, segment: segment === undefined ? null : { ...segment } }); return React.createElement('span', null, event.title) },
  })))
  const readonly = capture(() => html(React.createElement(Calendar, {
    defaultReferenceDate: JULY, today: JULY, locale: 'zh-TW', weekStartsOn: 0,
    events: [
      { id: 'h', title: '公司假日', start: '2026-07-03', end: '2026-07-04', readOnly: true },
      { id: 'm', title: '週會', start: '2026-07-08T10:00', end: '2026-07-08T11:00' },
    ],
    onDateClick: noop, onEventClick: noop, onCreateEvent: noop,
  })))
  return { stories, tile: { calls, markup: tile.value }, readonly: { markup: readonly.value } }
}
`

// ── 打包(固定檔名 + 字面 import,scripts/.gate-bundles/README.md)────────────────────────────────────
// play 只在 Storybook 裡跑,這裡只要 import 解得開:範例用到的每一個名字都要有(2026-11-26 補 waitFor —— 設計規格「+N」清單 / 詳情與設計原則的 play 用它,
// 少了它打包直接失敗、整支閘儀器失效)
const STUB_STORYBOOK_TEST = 'export const fn = () => () => {}\nexport const expect = () => ({})\nexport const userEvent = {}\nexport const within = () => ({})\nexport const waitFor = async () => {}\n'
const replaceOnce = (src, from, to, label) => {
  if (src.split(from).length !== 2) instrumentFail(`對照組「${label}」要改的片段不是剛好出現一次(原始碼改了,對照組要跟著改):${from}`)
  return src.split(from).join(to)
}
/** mutations: { 'repo 相對路徑': (原始碼) => 突變後原始碼 } */
async function bundle(file, mutations = {}) {
  const targets = new Map(Object.entries(mutations).map(([rel, fn]) => [join(ROOT, rel), fn]))
  const result = await build({
    stdin: { contents: PROBE, resolveDir: ROOT, loader: 'tsx', sourcefile: 'calendar-render-probe.tsx' },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent', jsx: 'automatic',
    // 打包檔留在 scripts/.gate-bundles/(gitignore),掃全樹的閘(owner-claims 的「檔名:行號」引用檢查)會讀到它:去掉空白與註解,
    // 範例原始碼裡的註解(例 @example-basis 的 calendar.spec.md 行號)不帶進打包檔(決策總帳 2026-11-25「owner-claims 掃到 gitignore 的
    // scripts/.gate-bundles 誤紅」同一件事)。只壓空白、不改名,丟例外時的堆疊仍讀得懂。
    minifyWhitespace: true, legalComments: 'none',
    tsconfig: join(ROOT, 'tsconfig.app.json'),
    define: { 'process.env.NODE_ENV': '"development"' },
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'empty' },
    // react-dom/server 等 CommonJS 套件 require Node 內建模組:ESM 輸出補一個 require
    banner: { js: "import { createRequire as __calendarProbeRequire } from 'node:module'; const require = __calendarProbeRequire(import.meta.url);" },
    plugins: [{
      name: 'calendar-render-probe',
      setup(b) {
        b.onResolve({ filter: /^@storybook\/test$/ }, () => ({ path: 'storybook-test', namespace: 'stub' }))
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: STUB_STORYBOOK_TEST, loader: 'js' }))
        if (targets.size === 0) return
        b.onLoad({ filter: /components\/Calendar\/[^/]+\.(tsx|ts)$/ }, (args) => {
          const mutate = targets.get(args.path)
          if (!mutate) return undefined
          return { contents: mutate(readFileSync(args.path, 'utf8')), loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: dirname(args.path) }
        })
      },
    }],
  }).catch((e) => instrumentFail(`esbuild 打包 Calendar 原始碼 + 範例失敗:${e.message}`))
  writeFileSync(join(ROOT, 'scripts/.gate-bundles', file), result.outputFiles[0].text)
}

// ── 判定 ────────────────────────────────────────────────────────────────────────────────────────
const SEGMENT_KEYS = ['isStart', 'isEnd', 'continuesBefore', 'continuesAfter', 'isSegmentRepeat']
const EXPECTED_SEGMENTS = [
  { isStart: true, isEnd: false, continuesBefore: false, continuesAfter: false, isSegmentRepeat: false },
  { isStart: false, isEnd: true, continuesBefore: false, continuesAfter: false, isSegmentRepeat: true },
]
/** 一段的外層開始標籤(依 data-calendar-covers 找) */
const openTagOf = (markup, covers) => new RegExp(`<div[^>]*data-calendar-covers="${covers}"[^>]*>`, 'u').exec(markup)?.[0] ?? null

/** 純判定:探針結果 → { cells: { D, T, R: 不符的說明[] }, instrument: 儀器失效說明[] } */
function judge(result) {
  const instrument = []
  const renderable = result.stories ?? []
  if (renderable.length === 0) instrument.push('三支範例檔 0 則可渲染的 story(出口改了?)')
  for (const s of renderable) if (s.error) instrument.push(`「${s.id}」渲染丟例外:${s.error}`)
  const team = renderable.find((s) => s.file === 'showcase' && /團隊行事曆$/u.test(s.id))
  if (!team || !team.markup?.includes('Alex 休假')) instrument.push('團隊行事曆沒有渲染出「Alex 休假」—— 量的不是有事件的範例(資料或名稱改了?)')
  const D = renderable.filter((s) => s.warns?.length).map((s) => `「${s.id}」:${s.warns.join(' / ')}`)
  const T = []
  const calls = result.tile?.calls ?? []
  const got = calls.map((c) => (c.segment ? Object.fromEntries(SEGMENT_KEYS.map((k) => [k, c.segment[k]])) : null))
  if (JSON.stringify(got) !== JSON.stringify(EXPECTED_SEGMENTS)) T.push(`renderEventTile 收到 ${JSON.stringify(got)},應為 ${JSON.stringify(EXPECTED_SEGMENTS)}`)
  for (const covers of ['2026-07-16 2026-07-17 2026-07-18', '2026-07-19 2026-07-20 2026-07-21 2026-07-22']) {
    const tag = openTagOf(result.tile?.markup ?? '', covers)
    if (!tag || !/role="button"/u.test(tag) || !/data-calendar-tile=""/u.test(tag)) T.push(`涵蓋 ${covers} 的那一段外層不是元件的按鈕外層(role="button" + data-calendar-tile):${tag ?? '找不到'}`)
  }
  const R = []
  const holiday = openTagOf(result.readonly?.markup ?? '', '2026-07-03')
  const meeting = openTagOf(result.readonly?.markup ?? '', '2026-07-08')
  if (!holiday || /role=|data-calendar-tile/u.test(holiday)) R.push(`單筆唯讀的公司假日外層:${holiday ?? '找不到'}(應該沒有 role、沒有 data-calendar-tile)`)
  if (!meeting || !/role="button"/u.test(meeting) || !/data-calendar-tile=""/u.test(meeting)) R.push(`同一個月曆可點的週會外層:${meeting ?? '找不到'}(應該是按鈕、帶 data-calendar-tile)`)
  return { cells: { D, T, R }, instrument }
}

const CELL_TEXT = {
  D: '三層範例載入時沒有任何 [Calendar] 開發期警告(資料照「資料語意」:end 不含)',
  T: 'renderEventTile 的第二個參數 = 版面那一段的延續資訊(跨週兩段)、外層是元件的按鈕外層',
  R: '單筆唯讀在可點的月曆裡不是按鈕、不進格內導覽,其他筆照樣可點',
}

if (!SELFTEST) {
  await bundle('calendar-render-contract.mjs')
  const probe = await import('./.gate-bundles/calendar-render-contract.mjs')
  if (typeof probe.run !== 'function') instrumentFail('探針沒有 run 出口')
  const result = probe.run()
  const { cells, instrument } = judge(result)
  if (instrument.length) instrumentFail(instrument.join(';'))
  let fail = 0
  console.log(`  渲染了 ${result.stories.length} 則 story(${[...new Set(result.stories.map((s) => s.file))].join(' / ')})`)
  for (const [id, bad] of Object.entries(cells)) {
    console.log(`${bad.length ? '✗' : '✓'} [${id}] ${CELL_TEXT[id]}`)
    for (const b of bad) console.log(`   - ${b}`)
    fail += bad.length
  }
  if (fail) { console.log(`\n✗ calendar-render-contract:${fail} 處不符(SSOT:calendar.spec.md「資料語意」「renderEventTile 的鍵盤責任歸屬」「日期格與事件方塊:可點或唯讀」)`); process.exit(1) }
  console.log('\n✅ calendar-render-contract PASS')
  process.exit(0)
}

// ── --selftest:每一個突變必須讓它指定的那一格紅、其他格照綠 ─────────────────────────────────────────
const MUTANTS = [
  {
    name: '團隊行事曆留一筆「含」的資料(公司假日 end 改回 start 同一天)',
    file: 'calendar-render-contract-m1.mjs',
    expect: 'D',
    mutations: { [`${CAL}/calendar.stories.tsx`]: (src) => replaceOnce(src, "title: '公司創立紀念日', start: `${thisMonth}-03`, end: `${thisMonth}-04`", "title: '公司創立紀念日', start: `${thisMonth}-03`, end: `${thisMonth}-03`", '含') },
  },
  {
    name: 'calendar.tsx 交給 renderEventTile 的 segment 寫死(不是版面那一段的旗標)',
    file: 'calendar-render-contract-m2.mjs',
    expect: 'T',
    // 2026-11-26 更正片段:MonthEventPiece 收到的參數名是 segment(不是 piece.segment;事件版面那一包起就是這樣,舊片段找不到 → 整支 selftest 儀器失效)
    mutations: { [`${CAL}/calendar.tsx`]: (src) => replaceOnce(src, 'renderEventTile(event, segment)', 'renderEventTile(event, { isStart: true, isEnd: true, continuesBefore: false, continuesAfter: false, isSegmentRepeat: false })', 'segment 寫死') },
  },
  {
    name: 'calendar.tsx 的唯讀判斷只看 readOnlyEvents(單筆 readOnly 沒接上)',
    file: 'calendar-render-contract-m3.mjs',
    expect: 'R',
    // 2026-11-26 事件方塊改三擇一後 eventModeOf 換成兩行(唯讀那一支在第一行)
    mutations: { [`${CAL}/calendar.tsx`]: (src) => replaceOnce(src, 'readOnlyEvents || event.readOnly\n      ? { readOnly: true }', 'readOnlyEvents\n      ? { readOnly: true }', '單筆唯讀') },
  },
]
await bundle('calendar-render-contract.mjs')
for (const m of MUTANTS) await bundle(m.file, m.mutations)
// import() 只准字面字串(scripts/.gate-bundles/README.md)
const loaded = [
  await import('./.gate-bundles/calendar-render-contract.mjs'),
  await import('./.gate-bundles/calendar-render-contract-m1.mjs'),
  await import('./.gate-bundles/calendar-render-contract-m2.mjs'),
  await import('./.gate-bundles/calendar-render-contract-m3.mjs'),
]
if (loaded.length !== MUTANTS.length + 1) instrumentFail('對照組的打包數與突變數不符(新增突變要同時加一行字面 import)')
const baseline = judge(loaded[0].run())
if (baseline.instrument.length) instrumentFail(`未突變的那一份:${baseline.instrument.join(';')}`)
const baselineRed = Object.entries(baseline.cells).filter(([, bad]) => bad.length).map(([id]) => id)
if (baselineRed.length) instrumentFail(`未突變的那一份本身就紅(${baselineRed.join('、')}),對照組無從比較 —— 先跑不帶 --selftest 的那一次`)
let missed = 0
for (const [i, m] of MUTANTS.entries()) {
  const { cells, instrument } = judge(loaded[i + 1].run())
  const red = Object.entries(cells).filter(([, bad]) => bad.length).map(([id]) => id)
  const ok = instrument.length === 0 && red.length === 1 && red[0] === m.expect
  console.log(`${ok ? '✓' : '✗'} 對照組「${m.name}」:紅的格 ${red.join(' / ') || '(無)'}(應只紅 ${m.expect})${instrument.length ? `;儀器失效 ${instrument.join(';')}` : ''}`)
  if (ok) console.log(`   ${cells[m.expect][0]}`)
  else missed++
}
if (missed) { console.log(`\n✗ calendar-render-contract selftest:${missed} 個對照組沒照預期紅 —— 量具無效`); process.exit(1) }
console.log(`\n✅ calendar-render-contract selftest:${MUTANTS.length} 個對照組各自只讓指定的格紅`)
