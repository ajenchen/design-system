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
 *           S5 容器再矮(展示「產品上線週」根節點壓到 240,每週都在最小高、k = 1、至少一格出現「+N」):每一格的每一列(事件列與「+N」列)都是 24、
 *           都在格子內容框裡 —— 放不下的由「+N」取代,不壓扁也不被裁(先量「每週 = 61、確實有格子出現「+N」」,證明量的是那個情況)。
 *         K 點日期鈕(程式化 click,Chromium 不給焦點 = Safari 的情況)後焦點與停靠點都到那一天;按「今天」後停靠點到今天、焦點留在「今天」鈕
 *           (兩條都先量「動作前停靠點不在那裡」,證明量的是動作的結果)。
 *         L en-GB 不傳 weekStartsOn → 第一欄是週一(Monday)。
 *         R 今天剛好是 1 號時,實心底包住整段「7月1日」、左右內距 8。
 *         B 事件版面(calendar.spec.md「跨日長條」【C1、Q3(定)】、「每格筆數與「+N」」【C3】、Cell 規則「命中區」【Q6(定)、總帳更正 #3】;2026-11-25 事件版面那一包):
 *           B1 團隊行事曆「Alex 休假」7/20–7/22 是一個元素,從 7/20 內容左緣畫到 7/22 內容右緣(±0.5)。
 *           B2 斷開那一端 computed border-radius = 0、真起訖那一端 > 0:B2-week 季度規劃(「設計衝刺」換週切兩段、「Q3 規劃週」延續到下個月那一端);
 *              B2-hidden 元件檢閱器週三起 + 隱藏週末(「機房搬遷」週五、週一在同一列相鄰兩欄,中間被藏的週末切開);B2-weekend 客服排班(週五收、週一起)。
 *           B3 產品上線週 7/15(7 筆)把格高掃過 k = 1…7 的每個邊界:B3-k 畫出來的筆數與 N 照規格算式由量到的格高推(元件傳進版面的 k = 量到的格高算出的值,
 *              M32 參數邊界)、每個格高連看 4 幀不變;B3-fit 每一列 24、都在格子內容框裡,出現「+N」的格下面放不下另一列;B3-exact 格高 229(剛好放滿 7 列)沒有「+N」。
 *           B4 真滑鼠點「Alex 休假」7/22 那一段:命中長條、開的是這個事件、沒有「新增事件」(阻止冒泡;長條 DOM 在 7/20 那格);點單筆唯讀的公司假日:什麼都不開。
 *           B6 從長條涵蓋的第 2 天(7/21)按 F2,焦點落在同一條長條上(格內 widget 依日子查,data-calendar-covers)。
 *           B7 深色與淺色主題,長條蓋在格線上的那一 px 與旁邊 3px 同色(差 ≤ 2;深色淡底半透明,長條要墊不透明的格子底)—— 前提:長條下方同一條格線看得到。
 *         N 讀屏名稱(calendar.spec.md「A11y 預設」;名稱用瀏覽器算好的無障礙樹 CDP Accessibility 與 Playwright getByRole({ name }),不讀屬性):
 *           N1 日期格可點時,日期鈕名稱 = Intl dateStyle full + 筆數(「2026年7月12日 星期日,2 個事件」),今天前面加「今天,」;1 號(畫面「7月1日」)
 *              與溢出日照同一格式;沒有任何日期鈕還是舊念法「2026-07-15,N 個事件」。
 *           N2 只有今天帶 aria-current="date"(日期格可點時在日期鈕上、唯讀時在格子上,兩種模式各量一次)。
 *           N3 日期格唯讀時,格子沒有 aria-label、名稱由內容來:開頭 = 日期 + 今天 + 筆數,接著每個事件標題;看得見的日期數字不重念
 *              (今天那格沒有事件 → 名稱剛好等於「今天,2026年7月15日 星期三,0 個事件」)。事件可點(內容發佈月曆)與事件也唯讀(設計原則
 *              「唯讀的日期格與事件」)各量一次;後者另量長條涵蓋的第 2 天(年中盤點 7/23–7/24 的 7/24,長條 DOM 在 7/23)也念得到標題(N3-bar)。
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
 *           每個寬度連看 6 幀狀態不變、「窄」⇔ 欄寬 ≤ 60、只在 61 切一次;NW3 掛載當下祖先在縮放(Dialog / Popover 開場 zoom-in-95):
 *           欄寬 62 在 scale(0.95) 下重新掛載(Storybook forceRemount),拿掉縮放後必須是寬版 —— 先量前提(真的重新掛載、掛載時比例 0.95、
 *           日期格畫面寬 ≤ 60),前提不成立 = 儀器失效。斷點看的是版面上的欄寬,不是畫面上被縮放後的寬。
 *   紅: --selftest 逐一注入:星期列搬出格陣、週列高改 auto、最後一週留底線、格子內距 6、工具列改回內距撐高、nav 沒名稱、
 *       欄頭名稱改成短字、捲動區變成可聚焦(axe required-children)、捲動區不能捲、事件列高 20、事件列焦點框改回往內、1 號的實心底被壓成 24 寬、
 *       格最小高沒算格線(回到 60)、
 *       en-GB 卻寫死週日起(Inspector 傳 weekStartsOn 0)、標題層級不跟 titleAs、日期鈕的 focus() 失效、
 *       日期名稱改回舊念法(yyyy-MM-dd)、拿掉 aria-current、aria-current 掛在每一天、唯讀格的 aria-label 放回去、唯讀格看得見的日期數字沒有 aria-hidden、唯讀格念不到橫跨過來的長條、
 *       labels 覆寫沒生效(名稱是寫死的預設中文)、跳過被藏日子的邏輯不見(焦點落空)、1 號被藏時沒有停靠點、週末寫死週六日(en-IL 照 en-US 藏)、
 *       星期列的週數欄沒讀同一個欄寬、週數格可聚焦、週數字加粗主色、週數第一週天數寫死 1(en-GB 年底變第 1 週)、格陣沒帶 aria-busy、骨架拿掉 aria-hidden、
 *       載入中照念筆數、載入中格子點不到、窄寬沒接上、門檻改看內容寬(內容回授到量測 → 門檻附近每幀來回跳)、
 *       量欄寬改量畫面寬(祖先縮放時讀到縮小後的寬 → 卡在窄版)、
 *       k 不隨格高變(ResizeObserver 換成不做事的版本再重新掛載;最小高與掃格高各一次)、長條改回逐日方塊、事件列 / 長條沒阻止冒泡(點擊冒到它所在的格子)、
 *       格子是定位元素(後面的格子蓋住長條)、F2 只查格子自己的子孫、斷開那一端也圓角、被藏的日子不切段、k 少算一列 / 多算一列(日期框到事件區差一列的空間)、
 *       長條沒墊不透明的格子底(深色透出格線)—— 每一個都必須讓對應的那一格紅。
 *   綠: 全部量到且照規格時 exit 0。開 story 走 lib/launch-browser.mjs openStory(等 Storybook 回報渲染完成與被量的格陣出現,不睡固定時間);
 *       開不起來 / 等不到格陣 = 儀器失效(INSTRUMENT-FAIL,exit 1 並點名),不讀成通過。
 */
// 用法:node scripts/calendar-month-invariant.mjs [--static=<dir>] [--selftest]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { PNG } from 'pngjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { INSTRUMENT_FAIL_MARKER, launchBrowser, openStory, requireFreshStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
const root = path.resolve(REPO, arg('static', 'storybook-static'))
const CAL = 'packages/design-system/src/components/Calendar'
requireFreshStorybookBuild(root, [`${CAL}/calendar.tsx`, `${CAL}/calendar-geometry.ts`, `${CAL}/calendar-layout.ts`, `${CAL}/_calendar-demo.tsx`, `${CAL}/calendar.stories.tsx`, `${CAL}/calendar.anatomy.stories.tsx`, `${CAL}/calendar.principles.stories.tsx`],
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
  quarter: storyId(/calendar-展示--quarter-planning$/u),
}

// 規格值(calendar.spec.md「間距」與 header-canonical.spec.md:68);1 號的字是規格寫的 zh-TW 例子
// 格最小高 61 = 上內距 4 + 日期框 24 + 4 + 一列 24 + 下內距 4 + 格線 1(格子 border-box,底線在格高裡;calendar.spec.md「每一週等高」)
const SPEC = { toolbar: { md: 48, lg: 56 }, gap: 4, row: 24, inset: 8, header: 32, cellMin: 61, navName: '行事曆月份導覽' }
// 窄寬度門檻(calendar-geometry.ts CALENDAR_NARROW_COLUMN_MAX_PX;calendar.spec.md「窄寬度」):欄寬 ≤ 60 = 窄。值照規格回寫的數字逐字寫,不 import 元件常數
const NARROW_MAX = 60
/** 窄寬掃描:欄寬 51…70(20 個寬度,跨過門檻),每個寬度連看幾幀 */
const SWEEP_COLS = Array.from({ length: 20 }, (_, i) => 51 + i)
const SWEEP_SAMPLES = 6
/** NW3:Dialog / Popover 開場的縮放(zoom-in-95 = 0.95 倍)與一個「版面上寬、畫面上窄」的欄寬(62 × 0.95 = 58.9 ≤ 60 < 62) */
const MOUNT_SCALE = 0.95
const MOUNT_SCALE_COL = NARROW_MAX + 2
/** S5 的情境:把根節點壓到這個高度,週列一定落在最小高(工具列 + 星期列 + 5 × 61 遠大於它) */
const SQUEEZE_PX = 240
/**
 * 每格放得下幾列 k(calendar.spec.md「每格筆數與「+N」」算式,照規格逐字寫、不 import 元件的 calendarRowsThatFit):
 * k = max(1, ⌊(格高 − 格線 1 − 上內距 4 − 日期框 24 − 日期到第一列 4 − 下內距 4 + 列距 4) ÷ (列高 24 + 列距 4)⌋)。
 * 量到的格高是 LayoutUnit(1/64 px)取整後的值,加回一個 LayoutUnit 再取整(剛好放滿那一格不因取整少一列)。
 */
const specRows = (cellH) => Math.max(1, Math.floor((cellH - 1 - SPEC.gap - SPEC.row - SPEC.gap - SPEC.gap + SPEC.gap + 1 / 64) / (SPEC.row + SPEC.gap)))
/** B3 掃的格高:跨過 k = 1…7 的每個邊界(⌊…⌋ 的兩側各一格),229 = 剛好放滿 7 列 */
const ROW_SWEEP = [61, 88, 89, 116, 117, 144, 145, 172, 173, 200, 201, 228, 229, 230]
/** 產品上線週 7/15 那一格的事件筆數(範例資料:7/13 起的「程式碼凍結」+ 當天 6 件事;車道 0…6) */
const LAUNCH_DAY = '2026-07-15'
const LAUNCH_DAY_TOTAL = 7
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
      dateToFirst: first.top - box.bottom, bottomPad: innerBottom - first.bottom, overflows: rows.some((x) => r(x).bottom > contentBottom + 0.5),
      hasMore: Boolean(list.querySelector('[data-calendar-more]')) }
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
async function open(id, { args = null, label = id, mutate = null, density = 'md', squeeze = null, theme = null } = {}) {
  if (!id) { instrumentFails.push({ cell: label, detail: '找不到 story(改名了?)' }); return null }
  const url = `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story${args ? `&args=${args}` : ''}`
  try {
    const opened = await openStory(page, url, {
      waitFor: GRID_READY, settleFrames: 10, notFound: server.notFound, label,
      beforeSettle: async (p) => {
        await p.evaluate((d) => document.documentElement.setAttribute('data-density', d), density)
        if (theme) await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
        // 突變要在情境套上之前做的(例:換掉 ResizeObserver 後重新掛載,再壓矮容器)
        if (mutate?.early) await p.evaluate(mutate.early)
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
  // 容器再矮:事件列與「+N」列不被壓扁(calendar.spec.md「每一週等高」:事件列不被壓扁;「每格筆數與「+N」」:放不下的由「+N」取代)。
  // 最小高的週 k = 1:每一格只放一列(一筆事件或「+N」),那一列 24、在格子內容框裡、沒有任何一列被裁。
  async squeeze(mutate) {
    const p = await open(STORY.launch, { label: `產品上線週 根節點 ${SQUEEZE_PX}`, mutate, squeeze: SQUEEZE_PX })
    if (!p) return
    // 先證明情境真的發生了:每週都在最小高、至少一格放不下(出現「+N」)—— 否則「列都是 24」可能只是因為格子夠高
    const atMin = p.weekHeights.length >= 5 && p.weekHeights.every((h) => near(h, SPEC.cellMin))
    const crowded = p.cellRows.filter((c) => c.hasMore)
    if (!atMin || crowded.length === 0) {
      instrumentFails.push({ cell: 'S5', detail: `情境沒成立:每週高 ${[...new Set(p.weekHeights.map((h) => h.toFixed(2)))].join(' / ')}、出現「+N」的格 ${crowded.length} 個(要每週 = ${SPEC.cellMin} 且至少一格放不下)` })
      return
    }
    const rows = p.cellRows.flatMap((c) => c.heights)
    const squashed = p.cellRows.filter((c) => !c.heights.every((h) => near(h, SPEC.row)) || c.overflows)
    check('S5', rows.length >= 3 && squashed.length === 0,
      `每週 ${SPEC.cellMin}、${crowded.length} 格出現「+N」:${rows.length} 列${squashed.length ? `,被壓扁或被裁的格 ${squashed.map((c) => `${c.day}(${c.heights.map((h) => h.toFixed(2)).join('/')}${c.overflows ? '、超出格子' : ''})`).join(' ')}` : ' 全是 24、都在格子裡'}(規格:列高 24,放不下的由「+N」取代、不壓扁也不被裁)`)
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
      // 長條涵蓋的第 2 天:年中盤點 7/23–7/24 是一條長條、DOM 在 7/23 那格 —— 7/24 的格子名稱照樣要念到它的標題(事件版面那一包起)
      const carried = await cellName('2026-07-24')
      const head2 = '2026年7月24日 星期五,1 個事件'
      const rest2 = carried?.name?.startsWith(head2) ? carried.name.slice(head2.length) : null
      check('N3-bar', carried?.ariaLabel === null && rest2 !== null && rest2.includes('年中盤點(辦公室關閉)') && !/(^|\s)24(\s|$)/u.test(rest2),
        `長條涵蓋的第 2 天 7/24 名稱「${carried?.name}」(規格:開頭日期 + 筆數,接著念得到從 7/23 橫跨過來的「年中盤點(辦公室關閉)」、看得見的「24」不重念)`)
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
    // NW3 掛載當下祖先在縮放(Dialog / Popover 開場 zoom-in-95):欄寬 MOUNT_SCALE_COL(> 門檻 = 寬)在 scale(MOUNT_SCALE) 下重新掛載,
    // 縮放留幾幀(ResizeObserver 第一次回報落在縮放期間,同開場動畫)再拿掉 → 狀態必須是寬版。縮放拿掉後版面尺寸沒變、觀察者不會再叫,
    // 所以量畫面寬的實作會一直卡在窄版。前提先量(量不到 = 儀器失效,不是產品裁決):真的重新掛載(新的格陣節點)、
    // 掛載那一刻格陣的畫面寬 / 版面寬 ≈ MOUNT_SCALE、日期格畫面寬 ≤ 門檻(量畫面寬的實作在這裡一定讀成窄)。
    const mounted = await page.evaluate(async ({ storyId, col, scale }) => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      const channel = window.__STORYBOOK_ADDONS_CHANNEL__
      if (!channel) return { missing: 'window.__STORYBOOK_ADDONS_CHANNEL__(Storybook 預覽的頻道)' }
      const host = document.querySelector('#storybook-root')
      const before = document.querySelector('[role="grid"]')
      if (!host || !before) return { missing: '#storybook-root 或格陣' }
      // 欄寬寫在樣式表(重新掛載後的新根節點也吃得到),不寫在舊根節點的 style
      const sheet = document.createElement('style')
      sheet.textContent = `:has(> [role="grid"] [data-calendar-day]) { width: ${7 * col + 2}px !important; }`
      document.head.append(sheet)
      host.style.transformOrigin = '0 0'
      host.style.transform = `scale(${scale})`
      for (let i = 0; i < 3; i++) await frame()
      const atMount = new Promise((resolve) => {
        const mo = new MutationObserver(() => {
          const g = document.querySelector('[role="grid"]'), cell = g?.querySelector('[role="gridcell"]')
          if (!g || g === before || !cell) return
          mo.disconnect()
          resolve({ ratio: g.getBoundingClientRect().width / g.offsetWidth, cellVisual: cell.getBoundingClientRect().width })
        })
        mo.observe(document.body, { subtree: true, childList: true })
        setTimeout(() => { mo.disconnect(); resolve(null) }, 5000)
      })
      channel.emit('forceRemount', { storyId })
      const at = await atMount
      for (let i = 0; i < 6; i++) await frame()
      host.style.transform = ''
      host.style.transformOrigin = ''
      for (let i = 0; i < 10; i++) await frame()
      const g = document.querySelector('[role="grid"]')
      const heads = [...g.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent)
      const firsts = [...g.querySelectorAll('[data-calendar-day$="-01"]')].map((d) => d.textContent)
      const narrow = heads.every((h) => [...h].length === 1) && firsts.every((t) => t === '1') ? true
        : heads.every((h) => [...h].length > 1) && firsts.every((t) => t !== '1') ? false : null
      const result = { remounted: g !== before, at, col: g.querySelector('[role="gridcell"]').getBoundingClientRect().width, heads, firsts, narrow }
      sheet.remove()
      return result
    }, { storyId: STORY.narrow, col: MOUNT_SCALE_COL, scale: MOUNT_SCALE })
    if (mounted.missing) { instrumentFails.push({ cell: 'NW3', detail: `頁面上沒有 ${mounted.missing}` }); return }
    if (!mounted.remounted || !mounted.at || !near(mounted.at.ratio, MOUNT_SCALE, 0.01) || !(mounted.at.cellVisual <= NARROW_MAX)) {
      instrumentFails.push({ cell: 'NW3', detail: `前提沒成立:重新掛載 ${mounted.remounted}、掛載時畫面寬 / 版面寬 ${mounted.at?.ratio?.toFixed(3) ?? '(沒等到新格陣)'}`
        + `(要 ${MOUNT_SCALE})、日期格畫面寬 ${mounted.at?.cellVisual?.toFixed(2) ?? '-'}(要 ≤ ${NARROW_MAX})` })
      return
    }
    check('NW3', near(mounted.col, MOUNT_SCALE_COL) && mounted.narrow === false,
      `欄寬 ${mounted.col.toFixed(2)} 在 scale(${MOUNT_SCALE}) 下掛載(當下畫面寬 ${mounted.at.cellVisual.toFixed(2)}、比例 ${mounted.at.ratio.toFixed(3)}),拿掉縮放後:`
      + `星期「${mounted.heads.join(' ')}」、1 號「${mounted.firsts.join(' / ')}」→ ${mounted.narrow === false ? '寬版' : mounted.narrow ? '窄版' : '混雜'}`
      + `(規格:斷點看版面上的欄寬,${MOUNT_SCALE_COL} > ${NARROW_MAX} = 寬版,掛載時祖先縮放不得讓它變窄)`)
  },
  // ── 跨日長條(calendar.spec.md「跨日長條」【C1、Q3(定)】、Cell 規則「命中區」【Q6(定)、總帳更正 #3】、「A11y 預設」格內那段)──
  // B1 團隊行事曆「Alex 休假」7/20–7/22 是一個元素,左緣 = 7/20 內容左緣、右緣 = 7/22 內容右緣(≈ 3 欄);
  // B4 點長條第 3 天(7/22)那一段:命中長條、開的是這個事件(示範殼的事件浮層,日期寫「7 月 20 日 – 7 月 22 日 · 全天」)、不會開「新增事件」;
  //    點單筆唯讀的公司假日(7/3):什麼都不開;B6 從長條涵蓋的第 2 天(7/21)按 F2,焦點落在同一條長條上(DOM 在第 1 天那格)。
  async bars(mutate) {
    const p = await open(STORY.team, { label: '團隊行事曆 跨日長條', mutate })
    if (!p) return
    const geo = await page.evaluate(() => {
      const g = document.querySelector('[role="grid"]')
      const r = (el) => el.getBoundingClientRect()
      const cell = (iso) => g.querySelector(`[data-calendar-day="${iso}"]`)?.closest('[role="gridcell"]')
      const els = [...g.querySelectorAll('[data-calendar-covers]')].filter((el) => el.textContent.trim() === 'Alex 休假')
      const c0 = cell('2026-07-20'), c2 = cell('2026-07-22'), hol = [...g.querySelectorAll('[data-calendar-covers]')].find((el) => el.textContent.trim() === '公司創立紀念日')
      if (!els[0] || !c0 || !c2 || !hol) return null
      const b = r(els[0]), cs0 = getComputedStyle(c0), cs2 = getComputedStyle(c2), r2 = r(c2), h = r(hol)
      const at = { x: (r2.left + r2.right) / 2, y: b.top + b.height / 2 }
      const hit = document.elementFromPoint(at.x, at.y)
      return { count: els.length, left: b.left, right: b.right, colW: r(c0).width,
        expLeft: r(c0).left + parseFloat(cs0.borderLeftWidth) + parseFloat(cs0.paddingLeft), expRight: r2.right - parseFloat(cs2.borderRightWidth) - parseFloat(cs2.paddingRight),
        at, hitIsBar: Boolean(hit && els[0].contains(hit)), hitWhat: hit ? `${hit.tagName}[${hit.getAttribute('role') ?? ''}]` : null,
        holiday: { x: (h.left + h.right) / 2, y: h.top + h.height / 2 } }
    })
    if (!geo) { instrumentFails.push({ cell: 'B1', detail: '團隊行事曆找不到「Alex 休假」長條、7/20 / 7/22 的格子或公司假日(範例資料改了?)' }); return }
    check('B1', geo.count === 1 && near(geo.left, geo.expLeft) && near(geo.right, geo.expRight),
      `「Alex 休假」${geo.count} 個元素、左緣 ${geo.left.toFixed(2)} / 右緣 ${geo.right.toFixed(2)}(規格:一個元素,從 7/20 內容左緣 ${geo.expLeft.toFixed(2)} 畫到 7/22 內容右緣 ${geo.expRight.toFixed(2)};一欄 ${geo.colW.toFixed(2)})`)
    // 點擊:真的滑鼠點在 7/22 那一段的正中(不是程式化 click —— 量的是命中與冒泡)
    const newEvent = () => page.getByRole('dialog', { name: '新增事件' }).count()
    const eventPopover = () => page.getByRole('dialog').filter({ hasText: 'Alex 休假' }).filter({ hasText: '7 月 20 日 – 7 月 22 日 · 全天' }).count()
    const settle = () => page.evaluate(() => new Promise((res) => { let n = 0; const f = () => (++n >= 10 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f) }))
    await page.mouse.click(geo.at.x, geo.at.y)
    await page.getByRole('dialog').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
    await settle()
    const barResult = { popover: await eventPopover(), create: await newEvent() }
    check('B4-bar', geo.hitIsBar && barResult.popover === 1 && barResult.create === 0,
      `點「Alex 休假」7/22 那一段:命中 ${geo.hitIsBar ? '長條' : geo.hitWhat}、事件浮層 ${barResult.popover} 個、「新增事件」${barResult.create} 個(規格:開這個事件、阻止冒泡,不會在 7/20 或 7/22 新增)`)
    // 關掉剛開的(對照組可能兩個都開了),等收起動畫走完、對話框 / 浮層都不在了再點下一個
    for (let i = 0; i < 2; i++) await page.keyboard.press('Escape')
    const cleared = await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 3000 }).then(() => true, () => false)
    if (!cleared) { instrumentFails.push({ cell: 'B4-readonly', detail: '按 Esc 後對話框 / 浮層 3 秒內沒收起,量不到「點唯讀事件什麼都不開」' }); return }
    await page.mouse.click(geo.holiday.x, geo.holiday.y)
    await settle()
    const ro = { dialogs: await page.getByRole('dialog').count() }
    check('B4-readonly', ro.dialogs === 0, `點單筆唯讀的「公司創立紀念日」:開了 ${ro.dialogs} 個對話框 / 浮層(規格:什麼都不發生 —— 不開事件、也不在 7/3 新增)`)
    // F2 從長條涵蓋的第 2 天進格
    await page.locator('button[data-calendar-day="2026-07-21"]').focus()
    await page.keyboard.press('F2')
    const f2 = await page.evaluate(() => {
      const a = document.activeElement
      return { tile: Boolean(a?.hasAttribute('data-calendar-tile')), title: a?.textContent?.trim() ?? null, at: a?.getAttribute('data-calendar-day') ?? null }
    })
    check('B6', f2.tile && f2.title === 'Alex 休假', `7/21 按 F2:焦點在 ${f2.tile ? `事件「${f2.title}」` : `日期 ${f2.at}`}(規格:從長條涵蓋的每一天進格都走得到它)`)
  },
  // ── 斷開端直角(【Q3(定)】;斷開 = 換週、可見範圍外、被藏起來的日子;calendar-layout.ts CalendarEventSegment)──
  // 量 computed border-radius 四個角:斷開那一端 = 0、真起訖那一端 > 0。三則:季度規劃(換週 + 延續到下個月)、元件檢閱器週三起 + 隱藏週末
  //(週末在一列中間 → 週五、週一相鄰兩欄,中間切開)、客服排班(週日起、週五收週一起)。
  async segments(mutate) {
    const radiiOf = (title) => page.evaluate((t) => [...document.querySelectorAll('[role="grid"] [data-calendar-covers]')]
      .filter((el) => el.textContent.trim() === t)
      .map((el) => { const cs = getComputedStyle(el), b = el.getBoundingClientRect(); return { covers: el.getAttribute('data-calendar-covers'), left: b.left, right: b.right, top: b.top,
        tl: parseFloat(cs.borderTopLeftRadius), bl: parseFloat(cs.borderBottomLeftRadius), tr: parseFloat(cs.borderTopRightRadius), br: parseFloat(cs.borderBottomRightRadius) } })
      .sort((a, b) => a.covers.localeCompare(b.covers)), title)
    const ends = (x) => `${x.covers.split(' ')[0]}…${x.covers.split(' ').at(-1)} 左 ${x.tl}/${x.bl} 右 ${x.tr}/${x.br}`
    const shape = (x, left, right) => x && (left ? x.tl > 0 && x.bl > 0 : x.tl === 0 && x.bl === 0) && (right ? x.tr > 0 && x.br > 0 : x.tr === 0 && x.br === 0)
    const q = await open(STORY.quarter, { label: '季度規劃 斷開端', mutate })
    if (q) {
      const sprint = await radiiOf('設計衝刺'), plan = await radiiOf('Q3 規劃週'), budget = await radiiOf('年度預算編列'), single = await radiiOf('預算定稿會議')
      check('B2-week', sprint.length === 2 && shape(sprint[0], true, false) && shape(sprint[1], false, true) && plan.length === 1 && shape(plan[0], true, false)
        && budget.length === 1 && shape(budget[0], true, true) && single.length === 1 && shape(single[0], true, true),
        `「設計衝刺」${sprint.map(ends).join(';')};「Q3 規劃週」${plan.map(ends).join(';')};「年度預算編列」${budget.map(ends).join(';')};單日「預算定稿會議」${single.map(ends).join(';')}`
        + '(規格:換週切成兩段、內側兩端直角;延續到下個月那一端直角;真起訖圓角)')
    }
    const insp = await open(STORY.inspector, { label: 'Inspector 週三起 + 隱藏週末', args: 'weekStartsOn:3;hideWeekends:!true', mutate })
    if (insp) {
      const move = await radiiOf('機房搬遷')
      const sameRow = move.length === 2 && near(move[0].top, move[1].top) && near(move[1].left - move[0].right, 2 * SPEC.gap + 1, 1)
      check('B2-hidden', move.length === 2 && sameRow && shape(move[0], true, false) && shape(move[1], false, true),
        `「機房搬遷」週五–週一、週末在一列中間:${move.map(ends).join(';')}、同一列相鄰兩欄 ${sameRow}(規格:被藏的週末把長條切成兩段,週五收、週一起,內側兩端直角)`)
    }
    const wk = await open(STORY.weekdays, { label: '客服排班 跨週末長條', mutate })
    if (wk) {
      const phone = await radiiOf('電話系統移轉')
      check('B2-weekend', phone.length === 2 && shape(phone[0], true, false) && shape(phone[1], false, true),
        `「電話系統移轉」週五–週一(隱藏週末、週日起):${phone.map(ends).join(';')}(規格:週五收、週一起,兩端直角)`)
    }
  },
  // ── 每格放幾列依格高(calendar.spec.md「每格筆數與「+N」」【C3、總帳更正 #7】;k 的算式【AI 推導】)──
  // 產品上線週 7/15(7 筆、車道 0…6):把週列的格高逐一設成 ROW_SWEEP,每個格高等 3 幀、連看 4 幀,量 ——
  // B3-k:畫出來的筆數與「+N」照規格算式(本閘自己照規格寫的 specRows)由量到的格高推:k ≥ 7 全畫、沒有「+N」;否則畫 k − 1 筆、N = 8 − k(元件傳進版面的 k
  //       是不是「量到的格高算出來的那個值」—— M32 參數邊界);4 幀狀態不變(不來回跳)。
  // B3-fit:每一格畫出來的列都是 24、都在格子內容框裡(沒有被裁);出現「+N」的格,「+N」下面放不下另一列(k 沒有少算)。
  // B3-exact:剛好放滿(格高 229 = 7 列)時不出現「+N」。
  // 前提(量不到 = 儀器失效):每個格高真的設進去了(±0.5)、掃描裡同時有出現「+N」與沒有「+N」的格高。
  async rowsFit(mutate) {
    const p = await open(STORY.launch, { label: '產品上線週 格高掃描', mutate })
    if (!p) return
    const sweep = await page.evaluate(async ({ targets, day, weeks }) => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
      const g = document.querySelector('[role="grid"]'), root = g.parentElement
      const cells = () => [...g.querySelectorAll('[role="gridcell"]')]
      const cellOf = (iso) => g.querySelector(`[data-calendar-day="${iso}"]`)?.closest('[role="gridcell"]')
      const area = g.querySelector('[data-radix-scroll-area-viewport]')
      const base = { root: root.getBoundingClientRect().height, area: area.getBoundingClientRect().height }
      const state = () => {
        const c = cellOf(day)
        const more = c?.querySelector('[data-calendar-more]')
        const bad = []
        for (const cell of cells()) {
          const list = cell.children[1]
          if (!list) continue
          const cs = getComputedStyle(cell), cr = cell.getBoundingClientRect()
          const contentBottom = cr.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom)
          for (const row of list.children) {
            const rr = row.getBoundingClientRect()
            if (Math.abs(rr.height - 24) > 0.5 || rr.bottom > contentBottom + 0.5) bad.push(`${cell.querySelector('[data-calendar-day]')?.getAttribute('data-calendar-day')} 列高 ${rr.height.toFixed(1)}、底 ${rr.bottom.toFixed(1)} > 內容底 ${contentBottom.toFixed(1)}`)
          }
          const m = list.querySelector('[data-calendar-more]')
          if (m) {
            const room = contentBottom - m.getBoundingClientRect().bottom
            if (room >= 28 - 0.5) bad.push(`${cell.querySelector('[data-calendar-day]')?.getAttribute('data-calendar-day')}「+N」下面還有 ${room.toFixed(1)}`)
          }
        }
        return { h: parseFloat(getComputedStyle(c).height), drawn: g.querySelectorAll(`[data-calendar-covers~="${day}"]`).length,
          n: more ? Number(/\d+/.exec(more.textContent)?.[0] ?? NaN) : 0, bad }
      }
      const out = []
      for (const t of targets) {
        root.style.height = `${base.root - base.area + weeks * t}px`
        for (let i = 0; i < 3; i++) await frame()
        const seen = []
        for (let i = 0; i < 4; i++) { await frame(); seen.push(state()) }
        out.push({ target: t, seen })
      }
      return out
    }, { targets: ROW_SWEEP, day: LAUNCH_DAY, weeks: p.weekHeights.length })
    // 依規格算式,這一 7 筆的格在每個格高該畫幾筆、N 是多少
    const expect = (h) => { const k = specRows(h); return k >= LAUNCH_DAY_TOTAL ? { k, drawn: LAUNCH_DAY_TOTAL, n: 0 } : { k, drawn: k - 1, n: LAUNCH_DAY_TOTAL - (k - 1) } }
    // 前提(儀器):每個格高真的設進去了;掃描的格高照規格同時涵蓋「該出現「+N」」與「剛好放滿、不該出現」兩種(看期望值,不看量到的 —— 量到的是被驗的東西)
    const set = sweep.filter((s) => s.seen.every((x) => near(x.h, s.target)))
    const withMore = ROW_SWEEP.some((t) => expect(t).n > 0), without = ROW_SWEEP.some((t) => expect(t).n === 0)
    if (set.length !== sweep.length || !withMore || !without) {
      instrumentFails.push({ cell: 'B3', detail: `前提沒成立:格高設進去的 ${set.length}/${sweep.length}(${sweep.filter((s) => !set.includes(s)).map((s) => `${s.target}→${s.seen[0].h}`).join('、')})、掃描涵蓋該有「+N」${withMore}、該沒有「+N」${without}` })
      return
    }
    const kBad = sweep.filter((s) => s.seen.some((x) => { const e = expect(x.h); return x.drawn !== e.drawn || x.n !== e.n }) || new Set(s.seen.map((x) => `${x.drawn}/${x.n}`)).size > 1)
    const fmt = (s) => { const x = s.seen[0], e = expect(x.h); return `格高 ${x.h}:k ${e.k}、畫 ${s.seen.map((y) => y.drawn).join('/')}(應 ${e.drawn})、N ${s.seen.map((y) => y.n).join('/')}(應 ${e.n})` }
    check('B3-k', kBad.length === 0, `${sweep.length} 個格高:${(kBad.length ? kBad : sweep.filter((_, i) => i % 4 === 0)).map(fmt).join(';')}(規格:k 由量到的格高算,m > k 時畫 k − 1 筆、第 k 列換「+N」)`)
    const fitBad = sweep.flatMap((s) => s.seen[0].bad.map((b) => `@${s.target} ${b}`))
    check('B3-fit', fitBad.length === 0, `每格的列都在格子裡、「+N」下面放不下另一列:${fitBad.slice(0, 3).join(';') || '全部成立'}(規格:列高 24、不裁不壓;剛好放不下才換「+N」)`)
    const exact = sweep.find((s) => s.target === 229)
    check('B3-exact', Boolean(exact) && exact.seen.every((x) => x.n === 0 && x.drawn === LAUNCH_DAY_TOTAL),
      `格高 229(剛好放滿 7 列):畫 ${exact?.seen[0].drawn}、N ${exact?.seen[0].n}(規格:剛好放滿不出現「+N」)`)
  },
  // ── 深色主題長條不透出格線(決策總帳 2026-11-25 已定 (9);研究 BARM-X1:深色類別淡底 step-1 半透明)──
  // 「Alex 休假」長條在 7/20 與 7/21 交界那條格線上:格線那一個 px 的顏色 = 旁邊 3px 長條內的顏色(每個色版差 ≤ 2);兩個主題都量。
  // 前提:長條下方(列與列的縫)同一條格線看得到(跟旁邊的格子底差 ≥ 4)—— 證明量的那個 x 真的是格線。
  async underlay(mutate) {
    for (const theme of ['light', 'dark']) {
      const p = await open(STORY.team, { label: `團隊行事曆 長條底 ${theme}`, mutate, theme })
      if (!p) continue
      const geo = await page.evaluate(() => {
        const g = document.querySelector('[role="grid"]')
        const bar = [...g.querySelectorAll('[data-calendar-covers]')].find((el) => el.textContent.trim() === 'Alex 休假')
        const c0 = g.querySelector('[data-calendar-day="2026-07-20"]')?.closest('[role="gridcell"]')
        if (!bar || !c0) return null
        const b = bar.getBoundingClientRect(), c = c0.getBoundingClientRect()
        return { lineX: Math.floor(c.right - 0.5), inY: Math.floor(b.top + 3), outY: Math.floor(b.bottom + 2) }
      })
      if (!geo) { instrumentFails.push({ cell: `B7-${theme}`, detail: '找不到「Alex 休假」長條或 7/20 的格子' }); continue }
      const px = async (y) => {
        const png = PNG.sync.read(await page.screenshot({ clip: { x: geo.lineX - 3, y, width: 7, height: 1 } }))
        const at = (i) => [png.data[i * 4], png.data[i * 4 + 1], png.data[i * 4 + 2]]
        return { left: at(0), line: at(3), right: at(6) }
      }
      const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])))
      const inBar = await px(geo.inY), below = await px(geo.outY)
      if (diff(below.line, below.left) < 4) { instrumentFails.push({ cell: `B7-${theme}`, detail: `長條下方的格線看不到(格線 ${below.line} / 旁邊 ${below.left})—— 量的 x 不是格線` }); continue }
      const d = Math.max(diff(inBar.line, inBar.left), diff(inBar.line, inBar.right))
      check(`B7-${theme}`, d <= 2, `${theme} 長條裡格線那一 px ${inBar.line}、左右 3px ${inBar.left} / ${inBar.right}(差 ${d});長條下方格線 ${below.line} vs 格子底 ${below.left}(規格:長條蓋住格線,差 ≤ 2)`)
    }
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
// 「k 不隨格高變」:把 ResizeObserver 換成不做事的版本再重新掛載(Storybook forceRemount)—— 元件只在掛載當下量一次格高,
// 之後容器變矮 / 變高 k 都不跟(= 量格高沒接上觀察者,或 k 寫死)。以原始碼序列化傳進頁面,不得引用外部變數。
const REMOUNT_WITHOUT_RESIZE_OBSERVER = async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  const before = document.querySelector('[role="grid"]')
  window.__STORYBOOK_ADDONS_CHANNEL__?.emit('forceRemount', { storyId: new URLSearchParams(location.search).get('id') })
  for (let i = 0; i < 300 && document.querySelector('[role="grid"]') === before; i++) await frame()
  for (let i = 0; i < 5; i++) await frame()
}
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
  // 每格放幾列沒有跟著格高(2026-11-25 前寫死每格 3 筆、事件版面那一包前列被壓扁的情況):掛載時格子高,壓到最小高後 k 不變 → 列超出格子被裁
  //(首版那個「事件列外層可被壓(min-h-0)」對照組在 k 依格高之後量不到東西 —— 最小高的週 k = 1、一列剛好放得下,沒有東西可壓;改成這一個)
  { name: 'k 不隨格高變(ResizeObserver 沒接上)— 最小高', block: 'squeeze', expect: ['S5'], early: REMOUNT_WITHOUT_RESIZE_OBSERVER },
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
  // 長條只在 DOM 所在那一格念得到:拿掉橫跨過來的長條補給讀屏的標題(= 只靠 DOM 位置,第 2 天起的唯讀格念不到)
  { name: '唯讀格念不到橫跨過來的長條', block: 'namesReadOnly', expect: ['N3-bar'], dom: () => document.querySelectorAll('[data-calendar-carried]').forEach((el) => el.remove()) },
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
  // 量欄寬改回量畫面寬(getBoundingClientRect,2026-11-25 首版):日期格的 width 讀到的是祖先縮放後的寬。沒有縮放時兩者相同(NW1 / NW2 照綠),
  // 掛載當下有縮放就讀成窄、拿掉縮放後觀察者不再回報 → 卡在窄版
  { name: '量欄寬改量畫面寬(祖先縮放時讀到縮小後的寬)', block: 'narrow', expect: ['NW3'], dom: () => {
    const real = window.getComputedStyle
    const visualWidth = (el) => `${el.getBoundingClientRect().width}px`
    window.getComputedStyle = function visualWidthComputedStyle(el, pseudo) {
      const style = real.call(window, el, pseudo)
      if (!(el instanceof Element) || el.getAttribute('role') !== 'gridcell') return style
      return new Proxy(style, { get(target, key) {
        if (key === 'width') return visualWidth(el)
        if (key === 'getPropertyValue') return (name) => (name === 'width' ? visualWidth(el) : target.getPropertyValue(name))
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      } })
    }
  } },
  // 跨日長條(B1 / B4 / B6)
  { name: '長條改回逐日方塊(每涵蓋一天各一塊)', block: 'bars', expect: ['B1'], dom: () => {
    const g = document.querySelector('[role="grid"]')
    const bar = [...g.querySelectorAll('[data-calendar-covers]')].find((el) => el.textContent.trim() === 'Alex 休假')
    if (!bar) return
    for (const iso of bar.getAttribute('data-calendar-covers').split(' ')) {
      const area = g.querySelector(`[data-calendar-day="${iso}"]`)?.closest('[role="gridcell"]')?.children[1]
      const copy = bar.cloneNode(true)
      copy.style.width = ''
      copy.setAttribute('data-calendar-covers', iso)
      area?.append(copy)
    }
    bar.remove()
  } },
  // 沒阻止冒泡 = 點擊冒到長條 DOM 所在的那一格(長條在第一格 → 在 7/20 新增;唯讀列 → 在 7/3 新增)
  { name: '事件列 / 長條沒阻止冒泡(點擊冒到它所在的格子)', block: 'bars', expect: ['B4-bar', 'B4-readonly'], dom: () => document.addEventListener('click', (e) => {
    const piece = e.target instanceof Element ? e.target.closest('[data-calendar-covers]') : null
    if (piece) piece.closest('[role="gridcell"]')?.click()
  }, true) },
  // 格子是定位元素:後面的格子(DOM 在長條之後)蓋在長條上,點第 3 天那段落到第 3 格
  { name: '格子是定位元素(後面的格子蓋住長條)', block: 'bars', expect: ['B4-bar'], css: '[role="gridcell"] { position: relative !important; }' },
  // 格內 widget 只查格子自己(長條只認它所在的第一天)
  { name: 'F2 只查格子自己的子孫(從長條的第 2 天進不了格)', block: 'bars', expect: ['B6'], dom: () => document.querySelectorAll('[data-calendar-covers]').forEach((el) => el.setAttribute('data-calendar-covers', el.getAttribute('data-calendar-covers').split(' ')[0])) },
  // 斷開端(B2)
  { name: '斷開那一端也圓角(一律 rounded)', block: 'segments', expect: ['B2-week', 'B2-hidden', 'B2-weekend'], css: '[data-calendar-covers] { border-radius: 4px !important; }' },
  // 被藏的週末不切段:週五、週一兩段連成一條(模擬版面沒在被藏的日子切開時畫出來的樣子)
  { name: '被藏的日子不切段(週五、週一連成一條)', block: 'segments', expect: ['B2-hidden'], dom: () => {
    const two = [...document.querySelectorAll('[role="grid"] [data-calendar-covers]')].filter((el) => el.textContent.trim() === '機房搬遷')
    if (two.length !== 2) return
    const [a, b] = two.sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left)
    a.style.width = `${b.getBoundingClientRect().right - a.getBoundingClientRect().left}px`
    b.remove()
  } },
  // 每格放幾列(B3)
  { name: 'k 不隨格高變(ResizeObserver 沒接上)— 掃格高', block: 'rowsFit', expect: ['B3-k', 'B3-fit'], early: REMOUNT_WITHOUT_RESIZE_OBSERVER },
  // k 與格子的幾何對不上:日期框到事件區多 / 少一列的空間(= 算式多扣 / 少扣一段)
  { name: 'k 少算一列(「+N」下面還放得下一列)', block: 'rowsFit', expect: ['B3-fit'], css: '[role="gridcell"] > :first-child { margin-bottom: -28px !important; }' },
  { name: 'k 多算一列(列超出格子被裁)', block: 'rowsFit', expect: ['B3-fit'], css: '[role="gridcell"] > :first-child { margin-bottom: 28px !important; }' },
  // 深色主題長條底(B7):拿掉不透明的格子底 → 深色的半透明淡底透出格線(淺色的淡底不透明,照綠)
  { name: '長條沒墊不透明的格子底', block: 'underlay', expect: ['B7-dark'], css: '[data-calendar-covers] { background: none !important; }' },
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
    await BLOCKS[m.block](m)
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
