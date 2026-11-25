#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Calendar 月檢視畫出來的骨架與間距照 calendar.spec.md(量像素與讀屏樹,不看 class —— M32):
 *         T 工具列 = ChromeHeader:高 = --chrome-header-height(一般密度 48、大密度 56);‹ / 今天 / › 包在 <nav>,名稱「行事曆月份導覽」;
 *           標題預設 h2、titleAs="h3" 時是 h3。
 *         H 星期列是 role=grid 裡的第一個 row、7 個 columnheader;讀屏名稱 = Intl 完整星期名(zh-TW「星期日」),看得見的字 = short(「週日」);
 *           星期列每格高 32(= 4 + 24 + 4)。
 *         W 各週等高(±0.5);最後一週的格子底線 0、其他週 1。
 *         D 日期框離格左 4、離格頂 4、高 24;每月 1 號顯示「7月1日」「8月1日」,其他日子只寫數字。
 *         E 事件列高 24、列距 4、文字左緣離列左緣 8、日期框到第一列 4;事件列四周最小淨空 ≥ 4(焦點框往外的前提,focus-canonical「問題二」);
 *           F2 進格後事件列的焦點框真的畫在外面(outline-offset ≥ 0)。
 *         A axe aria-required-children / aria-required-parent 0(格陣裡夾著 ScrollArea 的三層 div)。
 *         S 容器太矮(設計原則「事件顏色類別語意」h-84)時:每週 = 格最小高 61(4 + 24 + 4 + 24 + 4 + 格線 1)、滾輪捲得動週列、工具列與星期列不動;
 *           鍵盤走到看不見的那一週,焦點所在的日期框被捲進可視範圍;
 *           S4 最小高的週裡(同一則):有事件的格子(最後一週以外)事件列 = 24、日期框到第一列 = 4、第一列到格線 = 下內距 4
 *           (calendar.spec.md「間距」事件列 / 格子下內距、「每一週等高」格最小高 —— 三條同時成立);
 *           S5 容器再矮(展示「產品上線週」根節點壓到 240,每週都在最小高、至少一格放不下):每一格的每一列(事件列與「+N」列)都是 24,
 *           放不下的列被格子裁掉而不是壓扁(先量「每週 = 61、確實有格子放不下」,證明量的是那個情況)。
 *         K 點日期鈕(程式化 click,Chromium 不給焦點 = Safari 的情況)後焦點與停靠點都到那一天;按「今天」後停靠點到今天、焦點留在「今天」鈕
 *           (兩條都先量「動作前停靠點不在那裡」,證明量的是動作的結果)。
 *         L en-GB 不傳 weekStartsOn → 第一欄是週一(Monday)。
 *         R 今天剛好是 1 號時,實心底包住整段「7月1日」、左右內距 8。
 *         N 讀屏名稱(calendar.spec.md「A11y 預設」;名稱用瀏覽器算好的無障礙樹 CDP Accessibility 與 Playwright getByRole({ name }),不讀屬性):
 *           N1 日期格可點時,日期鈕名稱 = Intl dateStyle full + 筆數(「2026年7月12日 星期日,2 個事件」),今天前面加「今天,」;1 號(畫面「7月1日」)
 *              與溢出日照同一格式;沒有任何日期鈕還是舊念法「2026-07-15,N 個事件」。
 *           N2 只有今天帶 aria-current="date"(日期格可點時在日期鈕上、唯讀時在格子上,兩種模式各量一次)。
 *           N3 日期格唯讀時,格子沒有 aria-label、名稱由內容來:開頭 = 日期 + 今天 + 筆數,接著每個事件標題;看得見的日期數字不重念
 *              (今天那格沒有事件 → 名稱剛好等於「今天,2026年7月15日 星期三,0 個事件」)。事件可點(內容發佈月曆)與事件也唯讀(設計原則
 *              「唯讀的日期格與事件」)各量一次。
 *           N4 labels 覆寫生效(test-only「英文讀屏字串覆寫」):格陣名稱、今天與其他日子的名稱都是 consumer 給的英文,沒有一句預設中文。
 *         HW 隱藏週末(展示「客服排班(只看工作日)」+ Inspector en-IL;calendar.spec.md「Cell 規則」隱藏週末、「A11y 預設」鍵盤表):
 *           HW1 zh-TW 只剩 5 欄、5 個 columnheader(星期一–五)、沒有任何週六日的格;HW2 週五 → 下週一、週一 ← 上週五、Home / End = 該列第一 / 最後一個看得見的日子;
 *           HW3 換到八月(1 號是週六)Tab 停靠點剛好一個、在 8/3;HW4 週末是五六的語系(en-IL)藏的是週五、週六。
 *         WN 週數欄(展示「生產排程(週次)」+ Inspector en-GB / en-US 翻到 12 月):WN1 欄頭「週」在星期列第一格、欄頭寬 = 週數格寬(±0.5)= 2 × 4 + 兩位數實寬;
 *           WN2 每週第一格是 rowheader、0 個可聚焦、zh-TW 7 月 = 第 27–31 週、名稱「第 N 週」;WN3 字樣 fg-secondary、字重 400、上 4 高 24、水平置中;
 *           WN4 2026 年 12 月最後一列(含 2027-01-01)en-GB = 53、en-US = 1。
 *         LD 載入中(展示「切換月份時載入」):LD1 格陣 aria-busy=true;LD2 每格事件區剛好一條高 24、aria-hidden 的骨架、沒有事件列;
 *           LD3 日期名稱不念筆數;LD4 點格內空白仍會開「新增事件」(onDateClick)。
 *         NW 窄寬度(展示「分割畫面側欄(窄寬)」):NW1 欄寬 ≤ 60 時星期一字、1 號「1」、讀屏名稱照舊;NW2 掃 20 個欄寬(51–70),
 *           每個寬度連看 6 幀狀態不變、「窄」⇔ 欄寬 ≤ 60、只在 61 切一次。
 *   紅: --selftest 逐一注入:星期列搬出格陣、週列高改 auto、最後一週留底線、格子內距 6、工具列改回內距撐高、nav 沒名稱、
 *       欄頭名稱改成短字、捲動區變成可聚焦(axe required-children)、捲動區不能捲、事件列高 20、事件列焦點框改回往內、1 號的實心底被壓成 24 寬、
 *       格最小高沒算格線(回到 60)、事件列外層回到可被壓(flex-shrink 1 + min-height 0)、
 *       en-GB 卻寫死週日起(Inspector 傳 weekStartsOn 0)、標題層級不跟 titleAs、日期鈕的 focus() 失效、
 *       日期名稱改回舊念法(yyyy-MM-dd)、拿掉 aria-current、aria-current 掛在每一天、唯讀格的 aria-label 放回去、唯讀格看得見的日期數字沒有 aria-hidden、
 *       labels 覆寫沒生效(名稱是寫死的預設中文)、跳過被藏日子的邏輯不見(焦點落空)、1 號被藏時沒有停靠點、週末寫死週六日(en-IL 照 en-US 藏)、
 *       星期列的週數欄沒讀同一個欄寬、週數格可聚焦、週數字加粗主色、週數第一週天數寫死 1(en-GB 年底變第 1 週)、格陣沒帶 aria-busy、骨架拿掉 aria-hidden、
 *       載入中照念筆數、載入中格子點不到、窄寬沒接上、門檻改看內容寬(內容回授到量測 → 門檻附近每幀來回跳)—— 每一個都必須讓對應的那一格紅。
 *   綠: 全部量到且照規格時 exit 0。開 story 走 lib/launch-browser.mjs openStory(等 Storybook 回報渲染完成與被量的格陣出現,不睡固定時間);
 *       開不起來 / 等不到格陣 = 儀器失效(INSTRUMENT-FAIL,exit 1 並點名),不讀成通過。
 */
// 用法:node scripts/calendar-month-invariant.mjs [--static=<dir>] [--selftest]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { INSTRUMENT_FAIL_MARKER, launchBrowser, openStory, requireFreshStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
const root = path.resolve(REPO, arg('static', 'storybook-static'))
const CAL = 'packages/design-system/src/components/Calendar'
requireFreshStorybookBuild(root, [`${CAL}/calendar.tsx`, `${CAL}/calendar-geometry.ts`, `${CAL}/calendar.stories.tsx`, `${CAL}/calendar.anatomy.stories.tsx`, `${CAL}/calendar.principles.stories.tsx`],
  { hint: '先 build storybook(或用 --static=<dir> 指定)' })
const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
const index = JSON.parse(fs.readFileSync(path.join(server.snapshot?.dir ?? root, 'index.json'), 'utf8'))
const storyId = (re) => Object.values(index.entries).find((e) => e.type === 'story' && re.test(e.id))?.id
const STORY = {
  team: storyId(/calendar-展示--team-calendar$/u),
  blank: storyId(/calendar-展示--cell-blank-click-moves-keyboard-stop$/u),
  inspector: storyId(/calendar-設計規格--inspector$/u),
  short: storyId(/calendar-設計原則--color-semantic$/u),
  launch: storyId(/calendar-展示--launch-week$/u),
  publish: storyId(/calendar-展示--content-publishing-schedule$/u),
  holiday: storyId(/calendar-設計原則--read-only-rule$/u),
  english: storyId(/calendar-展示--english-labels-override$/u),
  weekdays: storyId(/calendar-展示--customer-support-weekdays$/u),
  weekNumbers: storyId(/calendar-展示--manufacturing-week-numbers$/u),
  loading: storyId(/calendar-展示--loading-while-switching-month$/u),
  narrow: storyId(/calendar-展示--side-panel-narrow$/u),
}

// 規格值(calendar.spec.md「間距」與 header-canonical.spec.md:68);1 號的字是規格寫的 zh-TW 例子
// 格最小高 61 = 上內距 4 + 日期框 24 + 4 + 一列 24 + 下內距 4 + 格線 1(格子 border-box,底線在格高裡;calendar.spec.md「每一週等高」)
const SPEC = { toolbar: { md: 48, lg: 56 }, gap: 4, row: 24, inset: 8, header: 32, cellMin: 61, navName: '行事曆月份導覽' }
// 窄寬度門檻(calendar-geometry.ts CALENDAR_NARROW_COLUMN_MAX_PX;calendar.spec.md「窄寬度」):欄寬 ≤ 60 = 窄。值照規格回寫的數字逐字寫,不 import 元件常數
const NARROW_MAX = 60
/** 窄寬掃描:欄寬 51…70(20 個寬度,跨過門檻),每個寬度連看幾幀 */
const SWEEP_COLS = Array.from({ length: 20 }, (_, i) => 51 + i)
const SWEEP_SAMPLES = 6
/** S5 的情境:把根節點壓到這個高度,週列一定落在最小高(工具列 + 星期列 + 5 × 61 遠大於它) */
const SQUEEZE_PX = 240
const near = (a, b, tol = 0.5) => Number.isFinite(a) && Math.abs(a - b) <= tol

// ── 頁面端量測(以原始碼序列化傳入,不得引用外部變數)────────────────────────────
const GRID_READY = () => Boolean(document.querySelector('[role="grid"] [role="gridcell"] [data-calendar-day]') || document.querySelector('[role="grid"] [role="gridcell"][data-calendar-day]'))
const PROBE = () => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height } }
  const grid = document.querySelector('[role="grid"]')
  if (!grid) return { missing: 'role=grid' }
  const shell = grid.parentElement
  const toolbar = shell.querySelector(':scope > header')
  const nav = toolbar?.querySelector('nav')
  const heading = toolbar?.querySelector('h1, h2, h3, h4, h5, h6')
  const rows = [...grid.querySelectorAll('[role="row"]')]
  const firstRow = rows[0]
  const headers = firstRow ? [...firstRow.querySelectorAll(':scope > [role="columnheader"]')] : []
  const weekRows = rows.filter((row) => row.querySelector('[role="gridcell"]'))
  const cellsOf = (row) => [...row.querySelectorAll(':scope > [role="gridcell"]')]
  const week = weekRows.map((row) => cellsOf(row).map((c) => ({ h: r(c).height, bb: parseFloat(getComputedStyle(c).borderBottomWidth) })))
  const stopOf = (c) => (c.matches('[data-calendar-day]') ? c : c.querySelector('[data-calendar-day]'))
  const cellByDay = (iso) => [...grid.querySelectorAll('[role="gridcell"]')].find((c) => stopOf(c)?.getAttribute('data-calendar-day') === iso)
  const firstCell = weekRows[0] ? cellsOf(weekRows[0])[0] : null
  const firstDay = firstCell ? stopOf(firstCell)?.getAttribute('data-calendar-day') : null
  const textRect = (el) => { const range = document.createRange(); range.selectNodeContents(el); return r(range) }
  const dayBoxes = Object.fromEntries(['2026-07-01', '2026-07-02', '2026-07-08', '2026-08-01'].map((iso) => {
    const cell = cellByDay(iso)
    const box = cell ? stopOf(cell) : null
    if (!cell || !box || box === cell) return [iso, null]
    const c = r(cell), b = r(box), t = textRect(box), cs = getComputedStyle(box)
    return [iso, { text: box.textContent, dx: b.left - c.left, dy: b.top - c.top, h: b.height, w: b.width, padL: parseFloat(cs.paddingLeft), padR: parseFloat(cs.paddingRight),
      bg: cs.backgroundColor, textInside: t.left >= b.left - 0.5 && t.right <= b.right + 0.5, textLeftPad: t.left - b.left, textRightPad: b.right - t.right }]
  }))
  // 事件列:找一格有兩筆以上、而且不是全天(全天帶左側色條,字左緣另算)的事件
  let events = null
  for (const cell of grid.querySelectorAll('[role="gridcell"]')) {
    const tiles = [...cell.querySelectorAll('[data-calendar-tile]')]
    if (tiles.length < 2) continue
    const c = r(cell), cs = getComputedStyle(cell), box = r(stopOf(cell))
    const t0 = r(tiles[0]), t1 = r(tiles[1])
    const span = tiles[0].querySelector('span')
    const tr = span ? textRect(span) : null
    events = { day: stopOf(cell)?.getAttribute('data-calendar-day'), h0: t0.height, h1: t1.height, gap: t1.top - t0.bottom, dateToFirst: t0.top - box.bottom,
      textInset: tr ? tr.left - t0.left : NaN, left: t0.left - c.left, right: c.right - parseFloat(cs.borderRightWidth) - t0.right }
    break
  }
  // 每一格的列(事件列 / 自訂外層 / 「+N」列 = 日期框那一層之後的那一層的子元素):高、第一列離日期框、第一列到格線(下內距)、放不放得下
  const cellRows = weekRows.flatMap((row, w) => cellsOf(row).map((cell) => {
    const list = cell.children[1]
    const rows = list ? [...list.children] : []
    if (!rows.length) return null
    const c = r(cell), cs = getComputedStyle(cell), box = r(stopOf(cell)), first = r(rows[0])
    const innerBottom = c.bottom - parseFloat(cs.borderBottomWidth)
    const contentBottom = innerBottom - parseFloat(cs.paddingBottom)
    return { day: stopOf(cell)?.getAttribute('data-calendar-day'), lastWeek: w === weekRows.length - 1, heights: rows.map((x) => r(x).height),
      dateToFirst: first.top - box.bottom, bottomPad: innerBottom - first.bottom, overflows: rows.some((x) => r(x).bottom > contentBottom + 0.5) }
  })).filter(Boolean)
  const viewport = grid.querySelector('[data-radix-scroll-area-viewport]')
  const v = viewport ? r(viewport) : null
  return {
    toolbarH: toolbar ? r(toolbar).height : NaN,
    toolbarTop: toolbar ? r(toolbar).top : NaN,
    navName: nav?.getAttribute('aria-label') ?? null,
    heading: heading?.tagName ?? null,
    headerRowInGrid: Boolean(firstRow && grid.contains(firstRow) && headers.length > 0),
    headerCount: headers.length,
    headerNames: headers.map((h) => h.getAttribute('aria-label')),
    headerTexts: headers.map((h) => h.textContent.trim()),
    headerHeights: headers.map((h) => r(h).height),
    headerTop: firstRow ? r(firstRow).top : NaN,
    strayHeaders: [...document.querySelectorAll('[role="columnheader"]')].filter((h) => !grid.contains(h)).length,
    firstDay,
    weekHeights: week.map((cells) => cells[0]?.h ?? NaN),
    lastRowBorders: week.length ? week[week.length - 1].map((c) => c.bb) : [],
    otherRowBorders: week.slice(0, -1).flat().map((c) => c.bb),
    firstCellTop: firstCell ? r(firstCell).top : NaN,
    dayBoxes,
    events,
    cellRows,
    viewport: v ? { scrollH: viewport.scrollHeight, clientH: viewport.clientHeight, scrollTop: viewport.scrollTop, top: v.top, bottom: v.bottom } : null,
  }
}

// ── 判定 ────────────────────────────────────────────────────────────────────
const results = [] // { id, ok, msg }
const instrumentFails = []
const check = (id, ok, msg) => { results.push({ id, ok, msg }); console.log(`${ok ? '✓' : '✗'} [${id}] ${msg}`) }

const zhLong = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const zhShort = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

function judgeLayout(p, density) {
  check(`T1-${density}`, near(p.toolbarH, SPEC.toolbar[density]), `工具列高 ${p.toolbarH}(${density} 規格 ${SPEC.toolbar[density]})`)
  if (density !== 'md') return
  check('T3', p.navName === SPEC.navName, `‹ / 今天 / › 在 <nav>,名稱「${p.navName}」(規格「${SPEC.navName}」)`)
  check('T4', p.heading === 'H2', `月份標題預設 ${p.heading}(規格 h2)`)
  check('H1', p.headerRowInGrid && p.headerCount === 7 && p.strayHeaders === 0,
    `星期列是格陣第一個 row:在格陣裡 ${p.headerRowInGrid}、columnheader ${p.headerCount} 個、格陣外的欄頭 ${p.strayHeaders} 個`)
  check('H2', JSON.stringify(p.headerNames) === JSON.stringify(zhLong), `欄頭讀屏名稱 = 完整星期名:${p.headerNames.join(' ')}`)
  check('H3', JSON.stringify(p.headerTexts) === JSON.stringify(zhShort), `欄頭看得見的字 = short:${p.headerTexts.join(' ')}`)
  check('H4', p.headerHeights.length === 7 && p.headerHeights.every((h) => near(h, SPEC.header)), `星期列每格高 ${[...new Set(p.headerHeights.map((h) => h.toFixed(2)))].join(' / ')}(規格 4 + 24 + 4 = ${SPEC.header})`)
  const wh = p.weekHeights
  check('W1', wh.length >= 4 && Math.max(...wh) - Math.min(...wh) <= 0.5, `各週等高:${wh.map((h) => h.toFixed(2)).join(' / ')}`)
  check('W2', p.lastRowBorders.length === 7 && p.lastRowBorders.every((b) => b === 0) && p.otherRowBorders.every((b) => b === 1),
    `最後一週底線 ${[...new Set(p.lastRowBorders)].join('/')}、其他週 ${[...new Set(p.otherRowBorders)].join('/')}(規格 0 / 1)`)
  const d = p.dayBoxes['2026-07-08']
  check('D1', d && near(d.dx, SPEC.gap) && near(d.dy, SPEC.gap) && near(d.h, SPEC.row) && near(d.w, SPEC.row),
    d ? `日期框離格左 ${d.dx}、離格頂 ${d.dy}、${d.w}×${d.h}(規格 4 / 4、24×24)` : '找不到 7/8 的日期框')
  const one = p.dayBoxes['2026-07-01'], aug = p.dayBoxes['2026-08-01'], two = p.dayBoxes['2026-07-02']
  check('D2', one?.text === '7月1日' && aug?.text === '8月1日' && two?.text === '2' && near(one?.padL, SPEC.inset) && one?.textInside,
    `1 號「${one?.text}」「${aug?.text}」、平日「${two?.text}」;1 號框左右內距 ${one?.padL} / ${one?.padR}(規格 8)、字在框內 ${one?.textInside}`)
  const e = p.events
  if (!e) { check('E1', false, '找不到一格有兩筆非全天事件(範例資料變了,本閘要換格子)'); return }
  check('E1', near(e.h0, SPEC.row) && near(e.h1, SPEC.row) && near(e.gap, SPEC.gap) && near(e.textInset, SPEC.inset) && near(e.dateToFirst, SPEC.gap),
    `${e.day} 事件列高 ${e.h0} / ${e.h1}、列距 ${e.gap}、文字內距 ${e.textInset.toFixed(2)}、日期框到第一列 ${e.dateToFirst}(規格 24 / 4 / 8 / 4)`)
  const clearance = Math.min(e.gap, e.dateToFirst, e.left, e.right)
  check('E2', clearance >= SPEC.gap - 0.01, `事件列四周最小淨空 ${clearance.toFixed(2)}(左 ${e.left} / 右 ${e.right.toFixed(2)} / 上 ${e.dateToFirst} / 列距 ${e.gap};≥ 4 → 焦點框往外)`)
}

// ── 開 story ────────────────────────────────────────────────────────────────
const browser = await launchBrowser()
// AxeBuilder 只收 newContext() 開出來的分頁(@axe-core/playwright 的限制)
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
async function open(id, { args = null, label = id, mutate = null, density = 'md', squeeze = null } = {}) {
  if (!id) { instrumentFails.push({ cell: label, detail: '找不到 story(改名了?)' }); return null }
  const url = `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story${args ? `&args=${args}` : ''}`
  try {
    const opened = await openStory(page, url, {
      waitFor: GRID_READY, settleFrames: 10, notFound: server.notFound, label,
      beforeSettle: async (p) => {
        await p.evaluate((d) => document.documentElement.setAttribute('data-density', d), density)
        // 情境(不是突變):consumer 給 Calendar 一個很矮的容器 —— 正式跑與 selftest 一樣套
        if (squeeze) await p.evaluate((h) => { const root = document.querySelector('[role="grid"]')?.parentElement; if (root) root.style.height = `${h}px` }, squeeze)
        if (mutate?.css) await p.addStyleTag({ content: mutate.css })
        if (mutate?.dom) await p.evaluate(mutate.dom)
      },
      probe: PROBE,
    })
    if (opened.probe?.missing) { instrumentFails.push({ cell: label, detail: `靜止時 ${opened.probe.missing} 不見了` }); return null }
    return opened.probe
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    instrumentFails.push({ cell: label, detail: error.message })
    return null
  }
}

// 瀏覽器算好的讀屏名稱(CDP Accessibility,與讀屏拿到的同一份;M32:不讀 aria-label 屬性當名稱)
let cdp = null
async function axNameOf(expression) {
  cdp ??= await context.newCDPSession(page)
  await cdp.send('Accessibility.enable')
  const { result } = await cdp.send('Runtime.evaluate', { expression })
  if (!result.objectId) return null
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { objectId: result.objectId, fetchRelatives: false })
  return nodes[0]?.name?.value ?? null
}
/** 某一天的格子:計算名稱、aria-label 屬性(沒有 = null)、tabindex */
async function cellName(iso) {
  const sel = `[role="grid"] [role="gridcell"][data-calendar-day="${iso}"]`
  const attrs = await page.evaluate((s) => { const el = document.querySelector(s); return el ? { ariaLabel: el.getAttribute('aria-label'), tab: el.getAttribute('tabindex') } : null }, sel)
  if (!attrs) return null
  return { ...attrs, name: await axNameOf(`document.querySelector(${JSON.stringify(sel)})`) }
}
/** 格陣裡帶 aria-current 的元素(日期停靠點) */
const currentDays = () => page.evaluate(() => [...document.querySelectorAll('[role="grid"] [aria-current]')].map((el) => ({
  day: el.getAttribute('data-calendar-day'), value: el.getAttribute('aria-current'), tag: el.tagName, role: el.getAttribute('role') })))

// 每一個量測區塊 = 一個函式(selftest 重用同一份,只換突變)
const BLOCKS = {
  async layout(mutate) {
    for (const density of ['md', 'lg']) {
      const p = await open(STORY.team, { label: `團隊行事曆 @${density}`, mutate, density })
      if (p) judgeLayout(p, density)
      if (!p || density !== 'md') continue
      // 事件列的鍵盤焦點框往外(calendar.spec.md「焦點框」):從 7/12 的日期鈕按 F2 進格,量焦點所在事件列的 outline。
      // 往外 = outline-offset ≥ 0(全域 :focus-visible);往內的 focus-ring-inset 是負的 offset(styles/base.css)。
      await page.locator('button[data-calendar-day="2026-07-12"]').focus()
      await page.keyboard.press('F2')
      const ring = await page.evaluate(() => {
        const a = document.activeElement
        if (!a?.hasAttribute('data-calendar-tile')) return null
        const cs = getComputedStyle(a)
        return { offset: parseFloat(cs.outlineOffset), width: parseFloat(cs.outlineWidth), style: cs.outlineStyle }
      })
      check('E3', Boolean(ring) && ring.style !== 'none' && ring.width > 0 && ring.offset >= 0,
        ring ? `F2 進格後事件列焦點框:${ring.style} ${ring.width}px、offset ${ring.offset}px(往外 = offset ≥ 0)` : 'F2 之後焦點沒有落在事件列上')
    }
  },
  async axe(mutate) {
    const p = await open(STORY.team, { label: '團隊行事曆 axe', mutate })
    if (!p) return
    const res = await new AxeBuilder({ page }).withRules(['aria-required-children', 'aria-required-parent']).analyze()
    const bad = res.violations.map((v) => `${v.id} ×${v.nodes.length}`)
    check('A1', bad.length === 0, `axe aria-required-children / aria-required-parent:${bad.join(';') || '0'}`)
  },
  async scroll(mutate) {
    const p = await open(STORY.short, { label: '設計原則 h-84', mutate })
    if (!p) return
    const v = p.viewport
    check('S1', p.weekHeights.length >= 5 && p.weekHeights.every((h) => near(h, SPEC.cellMin)), `容器太矮:每週高 ${[...new Set(p.weekHeights.map((h) => h.toFixed(2)))].join(' / ')}(格最小高 ${SPEC.cellMin})`)
    // 最小高的週:事件列 24、日期框到第一列 4、第一列到格線 4,三條同時成立(最後一週沒有底線、下方多 1px,只要求 ≥ 4)
    const minCells = p.cellRows
    const minBad = minCells.filter((c) => !(c.heights.every((h) => near(h, SPEC.row)) && near(c.dateToFirst, SPEC.gap)
      && (c.lastWeek ? c.bottomPad >= SPEC.gap - 0.5 : near(c.bottomPad, SPEC.gap))))
    const fmt = (c) => `${c.day} 列 ${c.heights.map((h) => h.toFixed(2)).join('/')}、日期框到第一列 ${c.dateToFirst.toFixed(2)}、到格線 ${c.bottomPad.toFixed(2)}`
    check('S4', minCells.filter((c) => !c.lastWeek).length >= 1 && minBad.length === 0,
      minCells.length ? `最小高的週 ${minCells.length} 格有事件:${(minBad.length ? minBad : minCells.slice(0, 3)).map(fmt).join(';')}(規格 24 / 4 / 4)` : '最小高的週裡找不到有事件的格子(範例資料變了,本閘要換範例)')
    // 使用者捲得動:滾輪落在格陣上,週列往上走、工具列與星期列不動
    const box = await page.evaluate(() => { const b = document.querySelector('[role="grid"] [data-radix-scroll-area-viewport]')?.getBoundingClientRect(); return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null })
    if (!box || !v) { check('S2', false, '找不到週列的捲動區'); return }
    await page.mouse.move(box.x, box.y)
    await page.mouse.wheel(0, 120)
    await page.waitForFunction((t) => (document.querySelector('[role="grid"] [data-radix-scroll-area-viewport]')?.scrollTop ?? 0) !== t, v.scrollTop, { timeout: 2000 }).catch(() => {})
    const after = await page.evaluate(PROBE)
    const moved = p.firstCellTop - after.firstCellTop
    check('S2', v.scrollH > v.clientH + 1 && after.viewport.scrollTop > 0 && moved > 0 && near(after.toolbarTop, p.toolbarTop) && near(after.headerTop, p.headerTop),
      `週列可捲:內容 ${v.scrollH} > 可視 ${v.clientH}、滾輪後 scrollTop ${after.viewport.scrollTop}、第一週上移 ${moved.toFixed(1)};工具列 ${p.toolbarTop}→${after.toolbarTop}、星期列 ${p.headerTop}→${after.headerTop}(不動)`)
    // 鍵盤走到看不見的最後一週:焦點所在的日期框要被捲進可視範圍
    await page.evaluate(() => { const vp = document.querySelector('[role="grid"] [data-radix-scroll-area-viewport]'); if (vp) vp.scrollTop = 0 })
    const today = page.locator('[data-calendar-day="2026-07-15"]')
    await today.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    const seen = await page.evaluate(() => {
      const a = document.activeElement, vp = document.querySelector('[role="grid"] [data-radix-scroll-area-viewport]')
      if (!a || !vp) return null
      const b = a.getBoundingClientRect(), c = vp.getBoundingClientRect()
      return { day: a.getAttribute('data-calendar-day'), top: b.top, bottom: b.bottom, vTop: c.top, vBottom: c.bottom, scrollTop: vp.scrollTop }
    })
    check('S3', seen?.day === '2026-07-29' && seen.top >= seen.vTop - 0.5 && seen.bottom <= seen.vBottom + 0.5,
      seen ? `↓↓ 後焦點在 ${seen.day}、日期框 ${seen.top.toFixed(1)}–${seen.bottom.toFixed(1)} 在可視 ${seen.vTop.toFixed(1)}–${seen.vBottom.toFixed(1)} 內(scrollTop ${seen.scrollTop})` : '量不到焦點')
  },
  async keyboardStop(mutate) {
    // test-only「點格內空白帶鍵盤位置」:onDateClick 是空函式(不開對話框),play 跑完後停靠點在 22
    const p = await open(STORY.blank, { label: '點日期鈕 / 今天 搬停靠點', mutate })
    if (!p) return
    const state = (iso) => page.evaluate((d) => {
      const el = document.querySelector(`button[data-calendar-day="${d}"]`)
      return el ? { tab: el.getAttribute('tabindex'), active: document.activeElement === el, activeText: document.activeElement?.textContent ?? null } : null
    }, iso)
    const before10 = await state('2026-07-10')
    // 程式化 click:Chromium 不會因此給焦點(= Safari 點按鈕的情況),元件要自己給
    await page.evaluate(() => document.querySelector('button[data-calendar-day="2026-07-10"]')?.click())
    const after10 = await state('2026-07-10')
    check('K1', before10?.tab === '-1' && !before10.active && after10?.tab === '0' && after10.active,
      `點 7/10 日期鈕:前 tabindex ${before10?.tab}、有焦點 ${before10?.active} → 後 tabindex ${after10?.tab}、有焦點 ${after10?.active}`)
    const before15 = await state('2026-07-15')
    await page.getByRole('button', { name: '今天', exact: true }).click()
    const after15 = await state('2026-07-15')
    const stillOnToday = await page.evaluate(() => document.activeElement?.textContent?.trim() === '今天')
    check('K2', before15?.tab === '-1' && after15?.tab === '0' && stillOnToday,
      `按「今天」:7/15 tabindex ${before15?.tab} → ${after15?.tab}、焦點留在「今天」鈕 ${stillOnToday}`)
  },
  async inspector(mutate) {
    const gb = await open(STORY.inspector, { label: 'Inspector en-GB', args: mutate?.gbArgs ?? 'locale:en-GB', mutate })
    if (gb) {
      const dow = gb.firstDay ? new Date(`${gb.firstDay}T12:00:00`).getDay() : NaN
      check('L1', gb.headerNames[0] === 'Monday' && dow === 1, `en-GB 不傳 weekStartsOn:第一欄「${gb.headerNames[0]}」、第一格 ${gb.firstDay}(星期 ${dow})`)
    }
    const h3 = await open(STORY.inspector, { label: 'Inspector titleAs=h3', args: mutate?.titleArgs ?? 'titleAs:h3', mutate })
    if (h3) check('Q1', h3.heading === 'H3', `titleAs="h3" → 標題 ${h3.heading}`)
  },
  // 容器再矮:事件列與「+N」列不被壓扁(calendar.spec.md「每一週等高」:放不下的列由格子裁掉;放幾列是事件版面那一包的 k)
  async squeeze(mutate) {
    const p = await open(STORY.launch, { label: `產品上線週 根節點 ${SQUEEZE_PX}`, mutate, squeeze: SQUEEZE_PX })
    if (!p) return
    // 先證明情境真的發生了:每週都在最小高、至少一格放不下(否則「列都是 24」可能只是因為格子夠高)
    const atMin = p.weekHeights.length >= 5 && p.weekHeights.every((h) => near(h, SPEC.cellMin))
    const crowded = p.cellRows.filter((c) => c.overflows)
    if (!atMin || crowded.length === 0) {
      instrumentFails.push({ cell: 'S5', detail: `情境沒成立:每週高 ${[...new Set(p.weekHeights.map((h) => h.toFixed(2)))].join(' / ')}、放不下的格 ${crowded.length} 個(要每週 = ${SPEC.cellMin} 且至少一格放不下)` })
      return
    }
    const rows = p.cellRows.flatMap((c) => c.heights)
    const squashed = p.cellRows.filter((c) => !c.heights.every((h) => near(h, SPEC.row)))
    check('S5', rows.length >= 3 && squashed.length === 0,
      `每週 ${SPEC.cellMin}、${crowded.length} 格放不下:${rows.length} 列${squashed.length ? `,被壓扁的格 ${squashed.map((c) => `${c.day}(${c.heights.map((h) => h.toFixed(2)).join('/')})`).join(' ')}` : ' 全是 24'}(規格:列高 24,放不下的列被裁掉、不壓扁)`)
  },
  // 讀屏名稱(N1–N4):日期停靠點、今天、唯讀格、labels 覆寫
  async namesClickable(mutate) {
    const p = await open(STORY.team, { label: '團隊行事曆 讀屏名稱', mutate })
    if (!p) return
    // N1:getByRole + 名稱(exact)各找到剛好一顆 —— 量的是 Playwright 依無障礙樹算出來的名稱,不是 aria-label 屬性字串
    const expected = [
      ['今天,2026年7月15日 星期三,1 個事件', '今天(7/15,1 筆)'],
      ['2026年7月12日 星期日,2 個事件', '7/12(2 筆)'],
      ['2026年7月1日 星期三,0 個事件', '1 號(畫面「7月1日」)'],
      ['2026年8月1日 星期六,0 個事件', '溢出日 8/1'],
    ]
    const found = []
    for (const [name, what] of expected) found.push({ what, name, n: await page.getByRole('button', { name, exact: true }).count() })
    const legacy = await page.getByRole('button', { name: /^\d{4}-\d{2}-\d{2},/ }).count()
    const bad = found.filter((f) => f.n !== 1)
    check('N1', bad.length === 0 && legacy === 0,
      `日期鈕名稱:${(bad.length ? bad : found).map((f) => `${f.what}「${f.name}」×${f.n}`).join(';')};舊念法 yyyy-MM-dd 的日期鈕 ${legacy} 顆(規格:完整日期 + 筆數,今天加「今天,」)`)
    const cur = await currentDays()
    check('N2-click', cur.length === 1 && cur[0].day === '2026-07-15' && cur[0].value === 'date' && cur[0].tag === 'BUTTON',
      `可點模式 aria-current:${cur.map((c) => `${c.day} ${c.tag}=${c.value}`).join('、') || '(沒有)'}(規格:只有今天的日期鈕 = date)`)
  },
  async namesReadOnly(mutate) {
    // 內容發佈月曆:日期格唯讀、事件可點(事件方塊是 role=button,名稱由它自己的 aria-label 接進格子的名稱)
    const pub = await open(STORY.publish, { label: '內容發佈月曆 唯讀格名稱', mutate })
    if (pub) {
      const today = await cellName('2026-07-15')
      const withEvent = await cellName('2026-07-02')
      const head = '2026年7月2日 星期四,1 個事件'
      const rest = withEvent?.name?.startsWith(head) ? withEvent.name.slice(head.length) : null
      check('N3-publish', today?.ariaLabel === null && today.name === '今天,2026年7月15日 星期三,0 個事件' && today.tab === '0'
        && withEvent?.ariaLabel === null && rest !== null && rest.includes('週五電子報') && !/(^|\s)2(\s|$)/u.test(rest),
        `唯讀格名稱:7/15「${today?.name}」(aria-label ${today?.ariaLabel}、tabindex ${today?.tab});7/2「${withEvent?.name}」(aria-label ${withEvent?.ariaLabel})`
        + `(規格:沒有 aria-label;開頭日期 + 今天 + 筆數、接事件標題「週五電子報」、看得見的「2」不重念)`)
      // getByRole 也找得到同一格(Playwright 自己的名稱計算,與 Chromium 的無障礙樹互相對照)
      const byRole = await page.getByRole('gridcell', { name: '今天,2026年7月15日 星期三,0 個事件', exact: true }).count()
      check('N3-byrole', byRole === 1, `getByRole('gridcell', 今天那格的名稱) 找到 ${byRole} 格(規格 1)`)
      const cur = await currentDays()
      check('N2-readonly', cur.length === 1 && cur[0].day === '2026-07-15' && cur[0].value === 'date' && cur[0].role === 'gridcell',
        `唯讀模式 aria-current:${cur.map((c) => `${c.day} ${c.role ?? c.tag}=${c.value}`).join('、') || '(沒有)'}(規格:只有今天的格子 = date)`)
    }
    // 設計原則「唯讀的日期格與事件」:日期格與事件都唯讀(事件是純文字,沒有角色)
    const hol = await open(STORY.holiday, { label: '設計原則 唯讀格名稱', mutate })
    if (hol) {
      const c = await cellName('2026-07-03')
      const head = '2026年7月3日 星期五,1 個事件'
      const rest = c?.name?.startsWith(head) ? c.name.slice(head.length) : null
      check('N3-holiday', c?.ariaLabel === null && rest !== null && rest.includes('公司創立紀念日') && !/(^|\s)3(\s|$)/u.test(rest),
        `事件也唯讀時 7/3 名稱「${c?.name}」(aria-label ${c?.ariaLabel};規格:開頭日期 + 筆數、接純文字的事件標題、看得見的「3」不重念)`)
    }
  },
  async namesEnglish(mutate) {
    const p = await open(STORY.english, { label: '英文讀屏字串覆寫', mutate })
    if (!p) return
    const grid = await page.getByRole('grid', { name: 'Calendar, July 2026', exact: true }).count()
    const today = await page.getByRole('button', { name: 'Today, Wednesday, July 15, 2026, 0 events', exact: true }).count()
    const other = await page.getByRole('button', { name: 'Thursday, July 16, 2026, 0 events', exact: true }).count()
    const leaked = await page.evaluate(() => [document.querySelector('[role="grid"]')?.getAttribute('aria-label') ?? '',
      ...[...document.querySelectorAll('[role="grid"] [data-calendar-day]')].map((el) => el.getAttribute('aria-label') ?? '')].filter((n) => /[\u4e00-\u9fff]/u.test(n)))
    check('N4', grid === 1 && today === 1 && other === 1 && leaked.length === 0,
      `labels 覆寫:格陣「Calendar, July 2026」×${grid}、今天 ×${today}、7/16 ×${other};帶中文的名稱 ${leaked.length} 個${leaked.length ? `(例「${leaked[0]}」)` : ''}(規格:每鍵都用 consumer 給的字)`)
  },
  // ── 隱藏週末(calendar.spec.md「Cell 規則」隱藏週末【Q10(定)】、「A11y 預設」鍵盤表 hideWeekends 那幾條【AI 推導】)──
  async hideWeekends(mutate) {
    const p = await open(STORY.weekdays, { label: '客服排班(只看工作日)', mutate })
    if (p) {
      const shown = await page.evaluate(() => {
        const g = document.querySelector('[role="grid"]')
        const rows = [...g.querySelectorAll('[role="row"]')]
        const weekRows = rows.filter((r) => r.querySelector('[role="gridcell"]'))
        const dows = [...g.querySelectorAll('[data-calendar-day]')].map((d) => new Date(`${d.getAttribute('data-calendar-day')}T12:00:00`).getDay())
        return { heads: [...rows[0].querySelectorAll(':scope > [role="columnheader"]')].map((h) => h.getAttribute('aria-label')),
          perRow: weekRows.map((r) => r.querySelectorAll(':scope > [role="gridcell"]').length), weekend: dows.filter((d) => d === 0 || d === 6).length, cells: dows.length }
      })
      check('HW1', JSON.stringify(shown.heads) === JSON.stringify(zhLong.slice(1, 6)) && shown.perRow.length >= 4 && shown.perRow.every((n) => n === 5) && shown.weekend === 0,
        `zh-TW 隱藏週末:欄頭 ${shown.heads.join(' ')}、每週格數 ${[...new Set(shown.perRow)].join('/')}、${shown.cells} 格裡週六日 ${shown.weekend} 格(規格:藏週六日 → 5 欄、5 個 columnheader)`)
      // 鍵盤落點:往移動方向找最近一個看得見的日子;Home / End = 該列第一 / 最後一個看得見的
      const moves = [['2026-07-17', 'ArrowRight', '2026-07-20'], ['2026-07-20', 'ArrowLeft', '2026-07-17'], ['2026-07-15', 'Home', '2026-07-13'], ['2026-07-15', 'End', '2026-07-17']]
      const got = []
      for (const [from, key, want] of moves) {
        await page.locator(`button[data-calendar-day="${from}"]`).focus()
        await page.keyboard.press(key)
        got.push({ from, key, want, at: await page.evaluate(() => document.activeElement?.getAttribute('data-calendar-day') ?? null) })
      }
      const wrong = got.filter((g) => g.at !== g.want)
      check('HW2', wrong.length === 0, `鍵盤跳過被藏的日子:${(wrong.length ? wrong : got).map((g) => `${g.from} ${g.key} → ${g.at}(規格 ${g.want})`).join(';')}`)
      // 今天不在本月、1 號落在被藏的週末(2026-08-01 週六):Tab 停靠點落在 1 號之後第一個看得見的日子 8/3(critic 1-6)
      await page.getByRole('button', { name: '下個月', exact: true }).click()
      if (mutate?.after) await page.evaluate(mutate.after)
      const stops = await page.evaluate(() => [...document.querySelectorAll('[role="grid"] [data-calendar-day][tabindex="0"]')].map((el) => el.getAttribute('data-calendar-day')))
      check('HW3', stops.length === 1 && stops[0] === '2026-08-03', `八月(1 號是週六)的 Tab 停靠點:${stops.join('、') || '(沒有)'}(規格:1 號之後第一個看得見的日子 2026-08-03,剛好一個)`)
    }
    // 週末是週五、週六的語系(en-IL,CLDR):藏的是五六,週日起
    const il = await open(STORY.inspector, { label: 'Inspector en-IL 隱藏週末', args: mutate?.ilArgs ?? 'locale:en-IL;hideWeekends:!true', mutate })
    if (il) check('HW4', JSON.stringify(il.headerNames) === JSON.stringify(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']),
      `en-IL 隱藏週末:欄頭 ${il.headerNames.join(' ')}(規格:週末跟語系 → 藏週五、週六)`)
  },
  // ── 週數欄(calendar.spec.md「Cell 規則」週數欄【Q10(定)、Q10b(定)】、「間距」週數欄寬、「A11y 預設」週數欄名稱【AI 推導】)──
  async weekNumbers(mutate) {
    const p = await open(STORY.weekNumbers, { label: '生產排程(週次)', mutate })
    if (p) {
      const wn = await page.evaluate(() => {
        const g = document.querySelector('[role="grid"]')
        const rows = [...g.querySelectorAll('[role="row"]')]
        const head = rows[0].querySelector(':scope > [role="columnheader"]')
        const weekRows = rows.filter((r) => r.querySelector('[role="gridcell"]'))
        const rhs = weekRows.map((r) => r.querySelector(':scope > [role="rowheader"]'))
        const first = rhs[0], span = first?.querySelector('span')
        const range = document.createRange(); if (span) range.selectNodeContents(span)
        const t = span ? range.getBoundingClientRect() : null, c = first?.getBoundingClientRect(), b = span?.getBoundingClientRect()
        const cs = first ? getComputedStyle(first) : null
        const ref = document.createElement('span'); ref.className = 'text-fg-secondary'; document.body.appendChild(ref)
        const secondary = getComputedStyle(ref).color; ref.remove()
        const contentRight = c && cs ? c.right - parseFloat(cs.borderRightWidth) : NaN
        return { headText: head?.textContent ?? null, headW: head?.getBoundingClientRect().width ?? NaN, headFirst: rows[0].firstElementChild === head,
          widths: rhs.map((r) => r?.getBoundingClientRect().width ?? NaN), firstInRow: weekRows.every((r) => r.firstElementChild?.getAttribute('role') === 'rowheader'),
          names: rhs.map((r) => r?.getAttribute('aria-label') ?? null), texts: rhs.map((r) => r?.textContent ?? null),
          tabbable: rhs.filter((r) => r && (r.tabIndex >= 0 || r.querySelector('button, a, [tabindex]'))).length,
          digitW: t?.width ?? NaN, centerDiff: t && c ? (t.left - c.left) - (contentRight - t.right) : NaN, top: b && c ? b.top - c.top : NaN, h: b?.height ?? NaN,
          color: cs?.color ?? null, secondary, weight: cs?.fontWeight ?? null }
      })
      const sameW = wn.widths.length >= 4 && wn.widths.every((w) => near(w, wn.headW))
      check('WN1', wn.headFirst && wn.headText === '週' && sameW && near(wn.headW, 2 * SPEC.gap + wn.digitW),
        `週數欄:欄頭「${wn.headText}」在星期列第一格 ${wn.headFirst}、欄頭寬 ${wn.headW?.toFixed(2)} / 週列 ${[...new Set(wn.widths.map((w) => w.toFixed(2)))].join('/')}`
        + `(規格:兩邊同寬 ±0.5,= 2 × 4 + 兩位數寬 ${wn.digitW?.toFixed(2)})`)
      check('WN2', wn.firstInRow && wn.tabbable === 0 && JSON.stringify(wn.texts) === JSON.stringify(['27', '28', '29', '30', '31']) && wn.names.every((n, i) => n === `第 ${27 + i} 週`),
        `週數格:每週第一格是 rowheader ${wn.firstInRow}、可聚焦 ${wn.tabbable} 個、數字 ${wn.texts.join(' ')}、名稱 ${wn.names[0]}…(規格:zh-TW 2026 年 7 月 = 第 27–31 週、不進 Tab 序列、名稱「第 N 週」)`)
      check('WN3', wn.color === wn.secondary && wn.weight === '400' && near(wn.top, SPEC.gap) && near(wn.h, SPEC.row) && Math.abs(wn.centerDiff) <= 1,
        `週數字樣:色 ${wn.color}(fg-secondary ${wn.secondary})、字重 ${wn.weight}、上邊距 ${wn.top}、高 ${wn.h}、左右差 ${wn.centerDiff?.toFixed(2)}(規格:一般字重 fg-secondary、上 4 高 24 同日期框、水平置中)`)
    }
    // 年底那一列(含 2027-01-01):第一週跟語系 —— en-GB(週一起、第一週至少 4 天)= 第 53 週、en-US(週日起、含 1/1)= 第 1 週(date-locale 週數錨點)
    for (const [tag, want] of [['en-GB', '53'], ['en-US', '1']]) {
      const q = await open(STORY.inspector, { label: `Inspector ${tag} 週數欄`, args: `locale:${tag};showWeekNumbers:!true`, mutate })
      if (!q) continue
      for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '下個月', exact: true }).click()
      if (mutate?.after) await page.evaluate(mutate.after)
      const year = await page.evaluate(() => {
        const cell = document.querySelector('[role="grid"] [data-calendar-day="2027-01-01"]')
        const row = cell?.closest('[role="gridcell"]')?.parentElement
        return row ? row.querySelector(':scope > [role="rowheader"]')?.textContent ?? null : null
      })
      check(`WN4-${tag}`, year === want, `${tag} 2026 年 12 月最後一列(含 2027-01-01)週數 ${year}(規格 ${want})`)
    }
  },
  // ── 載入中(calendar.spec.md「狀態與邊界案例」載入中【Q11(定);一條 / 仍可操作 / 名稱不念筆數 = AI 推導】)──
  async loading(mutate) {
    const p = await open(STORY.loading, { label: '切換月份時載入', mutate })
    if (!p) return
    const ld = await page.evaluate(() => {
      const g = document.querySelector('[role="grid"]')
      const cells = [...g.querySelectorAll('[role="gridcell"]')]
      const bad = cells.filter((cell) => {
        const kids = [...(cell.children[1]?.children ?? [])]
        return !(kids.length === 1 && Math.abs(kids[0].getBoundingClientRect().height - 24) <= 0.5 && kids[0].closest('[aria-hidden="true"]') && !cell.querySelector('[data-calendar-tile]'))
      }).map((cell) => cell.querySelector('[data-calendar-day]')?.getAttribute('data-calendar-day'))
      return { busy: g.getAttribute('aria-busy'), cells: cells.length, bad }
    })
    check('LD1', ld.busy === 'true', `載入中格陣 aria-busy=${ld.busy}(規格 true)`)
    check('LD2', ld.cells >= 28 && ld.bad.length === 0, `${ld.cells} 格裡事件區不是「剛好一條高 24、aria-hidden 的骨架、沒有事件列」的:${ld.bad.slice(0, 5).join('、') || '0 格'}`)
    const today = await page.getByRole('button', { name: '今天,2026年7月15日 星期三', exact: true }).count()
    const counted = await page.getByRole('button', { name: /個事件/ }).count()
    check('LD3', today === 1 && counted === 0, `載入中日期名稱:今天「今天,2026年7月15日 星期三」×${today}、念到筆數的日期鈕 ${counted} 顆(規格:載入中不念筆數)`)
    // 點格內空白(骨架下方)仍會在這一天新增:示範殼的 onDateClick 開「新增事件」對話框
    const at = await page.evaluate(() => {
      const cell = document.querySelector('[role="grid"] button[data-calendar-day="2026-07-22"]')?.closest('[role="gridcell"]')
      const b = cell?.getBoundingClientRect()
      return b ? { x: b.left + b.width / 2, y: b.bottom - 8 } : null
    })
    if (!at) { check('LD4', false, '找不到 7/22 的格子'); return }
    await page.mouse.click(at.x, at.y)
    const opened = await page.getByRole('dialog', { name: '新增事件' }).waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)
    check('LD4', opened, `載入中點 7/22 格內空白:「新增事件」對話框 ${opened ? '打開了' : '沒打開'}(規格:載入中仍可點空白新增)`)
    if (opened) await page.keyboard.press('Escape')
  },
  // ── 窄寬度(calendar.spec.md「窄寬度」【Q8(定)、總帳更正 #8;門檻 60 = AI 推導】)──
  async narrow(mutate) {
    const p = await open(STORY.narrow, { label: '分割畫面側欄(窄寬)', mutate })
    if (!p) return
    const look = () => page.evaluate(() => {
      const g = document.querySelector('[role="grid"]')
      return { col: g.querySelector('[role="gridcell"]').getBoundingClientRect().width, heads: [...g.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent),
        firsts: [...g.querySelectorAll('[data-calendar-day$="-01"]')].map((d) => d.textContent) }
    })
    const start = await look()
    const todayName = await page.getByRole('button', { name: '今天,2026年7月15日 星期三,0 個事件', exact: true }).count()
    check('NW1', start.col <= NARROW_MAX && start.heads.every((h) => [...h].length === 1) && start.firsts.length >= 1 && start.firsts.every((t) => t === '1') && todayName === 1,
      `側欄欄寬 ${start.col.toFixed(2)}:星期「${start.heads.join(' ')}」、1 號「${start.firsts.join(' / ')}」、今天的讀屏名稱照舊 ×${todayName}(規格:欄寬 ≤ ${NARROW_MAX} → 星期一字、1 號只寫「1」,名稱不受影響)`)
    // 掃 20 個欄寬(根節點寬 = 7 × 欄寬 + 左右外框 2),每個寬度先等 3 幀再連看 6 幀:狀態不得來回跳,而且「窄」⇔ 欄寬 ≤ 門檻
    const sweep = await page.evaluate(async ({ cols, samples }) => {
      const g = document.querySelector('[role="grid"]'), root = g.parentElement
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      const state = () => {
        const heads = [...g.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent)
        const firsts = [...g.querySelectorAll('[data-calendar-day$="-01"]')].map((d) => d.textContent)
        const narrowHead = heads.every((h) => [...h].length === 1), wideHead = heads.every((h) => [...h].length > 1)
        const narrowFirst = firsts.every((t) => t === '1'), wideFirst = firsts.every((t) => t !== '1')
        return { col: +g.querySelector('[role="gridcell"]').getBoundingClientRect().width.toFixed(3),
          narrow: narrowHead && narrowFirst ? true : wideHead && wideFirst ? false : null, key: `${heads.join('')}|${firsts.join('/')}` }
      }
      const out = []
      for (const col of cols) {
        root.style.width = `${7 * col + 2}px`
        for (let i = 0; i < 3; i++) await frame()
        const seen = []
        for (let i = 0; i < samples; i++) { await frame(); seen.push(state()) }
        out.push({ target: col, seen })
      }
      return out
    }, { cols: SWEEP_COLS, samples: SWEEP_SAMPLES })
    const unstable = sweep.filter((w) => new Set(w.seen.map((x) => `${x.key}@${x.col}`)).size > 1)
    const wrong = sweep.filter((w) => w.seen.some((x) => x.narrow === null || x.narrow !== (x.col <= NARROW_MAX)))
    const flips = sweep.filter((w, i) => i > 0 && w.seen[0].narrow !== sweep[i - 1].seen[0].narrow).map((w) => w.target)
    check('NW2', unstable.length === 0 && wrong.length === 0 && flips.length === 1 && flips[0] === NARROW_MAX + 1,
      `掃 ${sweep.length} 個欄寬(${SWEEP_COLS[0]}–${SWEEP_COLS.at(-1)}):連看 ${SWEEP_SAMPLES} 幀有變動的寬度 ${unstable.map((w) => w.target).join('、') || '0 個'}、`
      + `狀態與欄寬不符 ${wrong.map((w) => `${w.target}(${w.seen.map((x) => `${x.col}:${x.narrow}`).join(',')})`).slice(0, 3).join(';') || '0 個'}、切換點 ${flips.join('、') || '(沒有)'}`
      + `(規格:只看欄寬,≤ ${NARROW_MAX} 窄、${NARROW_MAX + 1} 起寬,只切一次、不來回跳)`)
  },
  // 今天剛好是 1 號:Inspector 拿掉 today 參數(元件改用 new Date()),時鐘釘在 2026-07-01 上午 10 點(本機時區)。
  // 不用網址傳日期:Storybook 的網址參數對 Date 型別的 arg 一律丟掉(實測 !date(...) 沒生效)。
  // 時鐘是整個 context 共用、釘了就回不去 —— 本區塊一律排在最後跑(其他區塊的 story 都明傳 today,本來也不受影響);
  // 不另開 context:沙箱裡的 Chromium 是 --single-process,開第二個 context 會整個崩掉(實測 SIGTRAP)。
  async todayFirst(mutate) {
    await context.clock.setFixedTime(new Date(2026, 6, 1, 10, 0, 0))
    const first = await open(STORY.inspector, { label: 'Inspector 今天 = 7/1', args: 'today:!undefined', mutate })
    if (!first) return
    const one = first.dayBoxes['2026-07-01']
    const filled = one && one.bg !== 'rgba(0, 0, 0, 0)' && one.bg !== 'transparent'
    check('R1', filled && one.text === '7月1日' && one.textInside && near(one.padL, SPEC.inset) && near(one.padR, SPEC.inset) && one.textLeftPad >= SPEC.inset - 0.5 && one.textRightPad >= SPEC.inset - 0.5,
      one ? `今天 = 1 號:「${one.text}」實心底 ${one.bg}、字距框左 ${one.textLeftPad.toFixed(2)} / 右 ${one.textRightPad.toFixed(2)}(規格 ≥ 8)` : '找不到 7/1')
  },
}

// ── 對照組 ──────────────────────────────────────────────────────────────────
// 每個突變:套在哪個區塊、預期哪幾格紅(其他格紅不算數,也不要求綠)
const MUTANTS = [
  { name: '星期列搬出格陣', block: 'layout', expect: ['H1'], dom: () => { const g = document.querySelector('[role="grid"]'); const row = g?.querySelector('[role="row"]'); if (g && row) g.parentElement.insertBefore(row, g) } },
  { name: '週列高改 auto', block: 'layout', expect: ['W1'], css: '[role="grid"] [data-radix-scroll-area-viewport] > div > div { grid-template-rows: none !important; }' },
  { name: '最後一週留底線', block: 'layout', expect: ['W2'], css: '[role="gridcell"] { border-bottom-width: 1px !important; }' },
  { name: '格子內距 6(p-1.5)', block: 'layout', expect: ['D1'], css: '[role="gridcell"] { padding: 6px !important; }' },
  { name: '工具列改回內距撐高', block: 'layout', expect: ['T1-md', 'T1-lg'], css: '[role="grid"] { } header { height: auto !important; padding-block: 12px !important; }' },
  { name: 'nav 沒有名稱', block: 'layout', expect: ['T3'], dom: () => document.querySelector('header nav')?.removeAttribute('aria-label') },
  { name: '欄頭名稱改成短字', block: 'layout', expect: ['H2'], dom: () => document.querySelectorAll('[role="columnheader"]').forEach((h) => h.setAttribute('aria-label', h.textContent)) },
  { name: '事件列高 20', block: 'layout', expect: ['E1'], css: '[data-calendar-tile] { height: 20px !important; }' },
  { name: '事件列焦點框改回往內', block: 'layout', expect: ['E3'], css: '[data-calendar-tile]:focus-visible { outline-offset: -2px !important; }' },
  { name: '捲動區可聚焦(viewportTabIndex 沒傳 null)', block: 'axe', expect: ['A1'], dom: () => document.querySelector('[role="grid"] [data-radix-scroll-area-viewport]')?.setAttribute('tabindex', '0') },
  { name: '週列捲動區不能捲', block: 'scroll', expect: ['S2'], css: '[role="grid"] [data-radix-scroll-area-viewport] { overflow: hidden !important; }' },
  // 回到 2026-11-25 首版的 60(沒算格線):最小高的週裡內容少 1px → 列不被壓就吃掉下內距(S4),週高也不是 61(S1)
  { name: '格最小高沒算格線(60)', block: 'scroll', expect: ['S1', 'S4'], css: '[role="grid"] { --calendar-cell-min-h: 60px !important; }' },
  // 回到首版的 min-h-0:事件列那一層可以被壓,格子放不下時裡面的列跟著縮
  { name: '事件列外層可被壓(min-h-0)', block: 'squeeze', expect: ['S5'], css: '[role="gridcell"] > :nth-child(2) { flex-shrink: 1 !important; min-height: 0 !important; }' },
  { name: '日期鈕的 focus() 失效', block: 'keyboardStop', expect: ['K1'], dom: () => { HTMLButtonElement.prototype.focus = function noop() {} } },
  { name: 'en-GB 卻寫死週日起', block: 'inspector', expect: ['L1'], gbArgs: 'locale:en-GB;weekStartsOn:0' },
  { name: '標題層級不跟 titleAs', block: 'inspector', expect: ['Q1'], titleArgs: 'titleAs:h2' },
  // 讀屏名稱:每個突變模擬一種退步(改 DOM 屬性 = 元件改錯時讀屏拿到的東西)
  { name: '日期名稱改回舊念法(yyyy-MM-dd,N 個事件)', block: 'namesClickable', expect: ['N1'], dom: () => document.querySelectorAll('button[data-calendar-day]').forEach((b) => b.setAttribute('aria-label', `${b.getAttribute('data-calendar-day')},0 個事件`)) },
  { name: '今天沒有 aria-current', block: 'namesClickable', expect: ['N2-click'], dom: () => document.querySelectorAll('[aria-current]').forEach((el) => el.removeAttribute('aria-current')) },
  { name: 'aria-current 掛在每一天', block: 'namesClickable', expect: ['N2-click'], dom: () => document.querySelectorAll('button[data-calendar-day]').forEach((b) => b.setAttribute('aria-current', 'date')) },
  { name: '唯讀格的 aria-label 放回去', block: 'namesReadOnly', expect: ['N3-publish', 'N3-holiday'], dom: () => document.querySelectorAll('[role="gridcell"][data-calendar-day]').forEach((c) => c.setAttribute('aria-label', `${c.getAttribute('data-calendar-day')},0 個事件`)) },
  { name: '唯讀格看得見的日期數字沒有 aria-hidden', block: 'namesReadOnly', expect: ['N3-publish', 'N3-holiday'], dom: () => document.querySelectorAll('[role="gridcell"][data-calendar-day] [aria-hidden]').forEach((el) => el.removeAttribute('aria-hidden')) },
  { name: '唯讀格沒有 aria-current', block: 'namesReadOnly', expect: ['N2-readonly'], dom: () => document.querySelectorAll('[aria-current]').forEach((el) => el.removeAttribute('aria-current')) },
  // labels 沒接上 = 元件裡寫死預設中文:名稱回到預設字串
  { name: 'labels 覆寫沒生效(寫死預設中文)', block: 'namesEnglish', expect: ['N4'], dom: () => {
    const fmt = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'full' })
    document.querySelector('[role="grid"]')?.setAttribute('aria-label', '月行事曆,2026年7月')
    document.querySelectorAll('button[data-calendar-day]').forEach((b) => { const [y, m, d] = b.getAttribute('data-calendar-day').split('-').map(Number); b.setAttribute('aria-label', `${fmt.format(new Date(y, m - 1, d))},0 個事件`) })
  } },
  // 隱藏週末:跳過被藏日子的邏輯不見時,落點是沒畫出來的日子 → 焦點落空(模擬:方向鍵 / Home / End 一按焦點就離開格陣)
  { name: '跳過被藏日子的邏輯不見(焦點落空)', block: 'hideWeekends', expect: ['HW2'], dom: () => document.addEventListener('keydown', (e) => {
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key) && document.activeElement?.hasAttribute('data-calendar-day')) { e.preventDefault(); e.stopImmediatePropagation(); document.activeElement.blur() }
  }, true) },
  // 1 號被藏時停靠點仍落在 1 號(沒畫出來)→ 格陣 0 個 Tab 停靠點(模擬:換月後每一天都被設成 -1)
  { name: '1 號被藏時沒有停靠點', block: 'hideWeekends', expect: ['HW3'], after: () => document.querySelectorAll('[role="grid"] [data-calendar-day][tabindex="0"]').forEach((el) => el.setAttribute('tabindex', '-1')) },
  { name: '週末寫死週六日(en-IL 照 en-US 藏)', block: 'hideWeekends', expect: ['HW4'], ilArgs: 'locale:en-US;hideWeekends:!true' },
  // 週數欄
  { name: '星期列的週數欄沒讀同一個欄寬(寫死 2rem)', block: 'weekNumbers', expect: ['WN1'], dom: () => {
    const head = document.querySelector('[role="grid"] [role="row"]')
    if (head) head.style.gridTemplateColumns = head.style.gridTemplateColumns.replace('var(--calendar-week-number-w)', '2rem')
  } },
  { name: '週數格可聚焦(進了 Tab 序列)', block: 'weekNumbers', expect: ['WN2'], dom: () => document.querySelectorAll('[role="rowheader"]').forEach((r) => r.setAttribute('tabindex', '0')) },
  { name: '週數字加粗、主色', block: 'weekNumbers', expect: ['WN3'], css: '[role="rowheader"] { font-weight: 500 !important; color: var(--color-foreground, #000) !important; }' },
  // firstWeekContainsDate 寫死 1:en-GB 年底那一列(含 1/1)變成第 1 週(模擬元件算錯時畫出來的數字)
  { name: '週數第一週天數寫死 1(en-GB 年底那列變第 1 週)', block: 'weekNumbers', expect: ['WN4-en-GB'], after: () => {
    const row = document.querySelector('[role="grid"] [data-calendar-day="2027-01-01"]')?.closest('[role="gridcell"]')?.parentElement
    const rh = row?.querySelector(':scope > [role="rowheader"] span')
    if (rh) rh.textContent = '1'
  } },
  // 載入中
  { name: '格陣沒帶 aria-busy', block: 'loading', expect: ['LD1'], dom: () => document.querySelector('[role="grid"]')?.removeAttribute('aria-busy') },
  { name: '骨架拿掉 aria-hidden', block: 'loading', expect: ['LD2'], dom: () => document.querySelectorAll('[role="gridcell"] [aria-hidden="true"]').forEach((el) => { if (!el.hasAttribute('data-calendar-day')) el.removeAttribute('aria-hidden') }) },
  { name: '載入中日期名稱照念筆數', block: 'loading', expect: ['LD3'], dom: () => document.querySelectorAll('button[data-calendar-day]').forEach((b) => b.setAttribute('aria-label', `${b.getAttribute('aria-label')},0 個事件`)) },
  { name: '載入中格子點不到(停用操作)', block: 'loading', expect: ['LD4'], css: '[role="gridcell"] { pointer-events: none !important; }' },
  // 窄寬度
  { name: '窄寬沒接上(星期字不縮、1 號照寫月份)', block: 'narrow', expect: ['NW1', 'NW2'], dom: () => {
    const g = document.querySelector('[role="grid"]')
    const undo = () => {
      g.querySelectorAll('[role="columnheader"] span').forEach((s) => { if ([...s.textContent].length === 1) s.textContent = `週${s.textContent}` })
      g.querySelectorAll('[data-calendar-day$="-01"]').forEach((d) => { if (d.textContent === '1') d.textContent = `${Number(d.getAttribute('data-calendar-day').slice(5, 7))}月1日` })
    }
    new MutationObserver(undo).observe(g, { subtree: true, childList: true, characterData: true }); undo()
  } },
  // 門檻改看內容寬 = 量到的寬跟著畫出來的內容變:寬版的字讓格陣窄 28、窄版的字讓它回來 → 門檻附近每幀來回跳(模擬「內容回授到量測」)
  { name: '門檻改看內容寬(內容回授到量測 → 來回跳)', block: 'narrow', expect: ['NW2'], dom: () => {
    const g = document.querySelector('[role="grid"]')
    const apply = () => { const head = g.querySelector('[role="columnheader"] span')?.textContent ?? ''; g.style.marginRight = [...head].length === 1 ? '0px' : '28px' }
    new MutationObserver(apply).observe(g, { subtree: true, childList: true, characterData: true }); apply()
  } },
  // 必須最後一個(todayFirst 會釘住時鐘,見該區塊註解)
  { name: '1 號的實心底被壓成 24 寬', block: 'todayFirst', expect: ['R1'], css: '[data-calendar-day="2026-07-01"] { padding: 0 !important; max-width: var(--tag-height-md) !important; }' },
]

if (!SELFTEST) {
  for (const block of Object.values(BLOCKS)) await block(null)
} else {
  let caught = 0
  for (const m of MUTANTS) {
    const from = results.length, fromFails = instrumentFails.length
    console.log(`── 突變:${m.name}(預期 ${m.expect.join(' / ')} 紅)`)
    await BLOCKS[m.block]({ css: m.css, dom: m.dom, gbArgs: m.gbArgs, titleArgs: m.titleArgs, ilArgs: m.ilArgs, after: m.after })
    const red = new Set(results.slice(from).filter((x) => !x.ok).map((x) => x.id))
    const ok = m.expect.every((id) => red.has(id)) && instrumentFails.length === fromFails
    if (ok) caught++
    console.log(`${ok ? '✓' : '✗'} selftest「${m.name}」:紅的格 ${[...red].join(' / ') || '(無)'}`)
  }
  await browser.close(); await server.stop()
  const ok = caught === MUTANTS.length && instrumentFails.length === 0
  if (instrumentFails.length) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFails.length} 格沒量到 —— 紅的不全是對照組造成的`); for (const f of instrumentFails) console.log(`  · ${f.cell}:${f.detail}`) }
  console.log(ok ? `✅ calendar-month selftest:${MUTANTS.length} 個突變全被抓到` : `✗ calendar-month selftest:${MUTANTS.length - caught} 個突變沒讓預期的格紅 —— 量具無效`)
  process.exit(ok ? 0 : 1)
}

await browser.close()
await server.stop()
const failed = results.filter((x) => !x.ok)
if (instrumentFails.length) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFails.length} 格沒量到 —— 不是產品裁決,但這次不能宣稱月格合規:`)
  for (const f of instrumentFails) console.log(`  · ${f.cell}:${f.detail}`)
}
console.log(failed.length || instrumentFails.length
  ? `✗ calendar-month ${failed.length} 格失敗(${failed.map((x) => x.id).join(' / ')})、${instrumentFails.length} 格沒量到(SSOT:calendar.spec.md「工具列」「Cell 規則」「間距」「A11y 預設」)`
  : `✅ calendar-month PASS(${results.length} 格)`)
process.exit(failed.length || instrumentFails.length ? 1 : 0)
