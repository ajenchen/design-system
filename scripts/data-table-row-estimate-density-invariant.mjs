#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DataTable 虛擬捲動的列高估計跟著表格所在那一區的密度走 —— 掛載之後,表格的祖先(html 以外的中間層)只寫 data-ui-size、
 *         或才加上 data-density,虛擬高度那一層的總高必須等於「列數 × 畫出來的列高」(容許 1px;數字都是當場量的,閘裡不寫死 40 / 48 / 10000)。
 *         依據 = data-table.tsx「estimate 預設 size-aware 對齊 token」那一段的註解(估計值讀表身實際生效的 --table-row-{size};
 *         2026-11-12 c78b35e1 起盯整份文件的 data-density 與 data-ui-size)。出處 = 稽核 R7-03 / 第四批審查第 7 條;
 *         **user 沒有逐字講過這一件,「列高估計要跟著區塊密度更新」這句規則是【AI 推導】**(規格句住 data-table.spec.md「二、高度模式」)。
 *           M  掛載後(整頁一般密度、什麼都還沒動;每一趟動手前各量一次):總高 = 列數 × 列高;
 *           C  區塊只寫 data-ui-size="lg"(寫在 #storybook-root;html 仍是 data-density="md"):總高 = 列數 × 新的列高;
 *           D  掛載之後才在中間層加 data-density="lg"(寫在 #storybook-root):同上;
 *           E  對照:整頁密度 md → lg(html 的 data-density;2026-09-10 就有的那條路):同上。
 *   紅: 任一格總高與「列數 × 畫出來的列高」差 > 1px → 指名哪一格 / 量到多少 / 應該多少 / 推回去的估計值並 exit 1。
 *       `--selftest`:(a) 判定表(純函式 judge,主跑用的同一支)每一格各有該紅、該綠、量不到;(b) 真建置上先量一趟現況(四格必綠),
 *       再用載入前的 init script 讓「訂了密度屬性的 MutationObserver」收不到某一類變動 ——
 *       X 收不到 data-ui-size → 四格的狀態必須正好是「C 紅、M / D / E 綠」;Y 收不到 html 以外元素的 data-density → 正好「D 紅、M / C / E 綠」
 *       (修前 = c78b35e1 之前只盯最近一個帶 data-density 的祖先,X + Y 合起來就是它);破法讀回「標記到 0 個觀察器 / 該紅的那一趟丟掉 0 筆」
 *       = 產品換了機制、對照組不成立 → 自測失敗;(c) 拿一份只有「無預覽」頁的假建置把主跑跑一次(**經符號連結叫**,同時證明
 *       「是不是被直接執行」比真實路徑 —— lib/direct-run.mjs),必須以儀器失效的標記與 exit 2 結束。
 *       任何一項不符 → exit 1(真建置那幾趟自己量不到 → exit 2)。
 *   綠: 現況四格都等於期望值。讀數之前依序等三件事(都是畫面本身的狀態,沒有固定睡眠):畫出來的列都變成新的同一個高、
 *       列一列接一列(虛擬化器已照新量測重排)、版面連續 10 格靜止;任一件等不到 = 儀器失效,不指控產品。列高是固定行高,與字型、機器速度無關;
 *       紅的那個數字是穩定狀態(2026-11-14 研究時實量:再等 60 格不變),不是「還沒算完」。
 *       量不到的情況(找不到虛擬列 / 列數讀不到 / 列數太少 / 列高不只一種或不是整數 / 列疊在一起 / 捲動位置不是 0 / 整頁密度沒照網址套上 /
 *       「區塊」動手前就帶屬性 / 寫入讀回不符 / 動手後量到的不是這一格要的情境 / 範例自己傳了 estimateRowHeight / story 開不起來 / 建置過時)
 *       一律印 INSTRUMENT-FAIL 標記、exit 2,不是通過也不是指控產品。
 *   量法(M32:量像素): 靜態站開 DataTable 展示「大量資料」(10,000 列;globals density:md),虛擬列 = [role="row"][data-index],
 *         虛擬高度那一層 = 它們共同的父元素(產品在它身上寫 height = getTotalSize()),列數 = 表格根的 aria-rowcount − 1。
 *         「區塊」= 執行時在 #storybook-root 寫屬性(掛載之後才改,正是這兩格的情境;不需要新 story,也不動視覺基準圖)。
 *         期望值用「畫出來的列高」:它由 CSS 固定行高直接決定、跟 JS 的估計值無關,閘不必把 rem 換成 px(那等於照抄產品的算法)。
 *   不在本閘保證內: 捲到中段之後才換密度 —— 2026-11-14 研究時實量總高停在 440,080(應 480,000),整頁密度那條路也一樣;那是另一件
 *         產品修正(主線另外追蹤)。本閘只從頂端量,把「捲動位置 = 0」列為儀器地板,免得有人以為這支涵蓋了它。
 *   `--static=<dir>` 指定建置(自測的假建置用);指定時不跑新鮮度守衛。
 *   node scripts/data-table-row-estimate-density-invariant.mjs [--static=<storybook 建置目錄>] [--selftest]
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDirectRun, runViaSymlink } from './lib/direct-run.mjs'
import {
  BROWSER_REQUIRED_MARKER, INSTRUMENT_FAIL_MARKER, MISSING_BUILD_MARKER, SKIPPED_ENV_MARKER, STALE_BUILD_MARKER,
  launchBrowserOrSkip, openStory, requireFreshStorybookBuild, settleAfterInteraction, StoryRenderInstrumentError,
} from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const SELF = fileURLToPath(import.meta.url)
const REPO = path.resolve(path.dirname(SELF), '..')
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = path.resolve(staticArg ? staticArg.slice('--static='.length) : path.join(REPO, 'storybook-static'))
const STORY = 'design-system-components-datatable-展示--virtual-scroll'
const STORY_SOURCE = 'packages/design-system/src/components/DataTable/data-table.stories.tsx'
const STORY_EXPORT = 'VirtualScroll'
const ROW = '#storybook-root [role="row"][data-index]'
const REGION = '#storybook-root'
const SOURCES = [
  'packages/design-system/src/components/DataTable/data-table.tsx',
  'packages/design-system/src/components/DataTable/data-table.css',
  STORY_SOURCE,
]
/** 總高與「列數 × 畫出來的列高」的容許差(px)。破法造成的差 = 改之前畫出來的列數 × 8(現況 144),與 1 不重疊 */
const ROW_ESTIMATE_TOTAL_TOLERANCE_PX = 1
/** 至少要畫出幾列才量(少於這個數,「每一列同高」「一列接一列」沒有意義) */
const ROW_ESTIMATE_MIN_RENDERED_ROWS = 3
/** 列數至少是畫出來列數的幾倍(不夠多的話,沒畫出來的列決定不了總高,估計值錯了也看不出來) */
const ROW_ESTIMATE_MIN_ROWS_PER_RENDERED = 20
/** 等「列變高」「列排好」各自的上限(毫秒)。只是「等不到」的天花板:到了 = 儀器失效,不是產品紅 */
const ROW_ESTIMATE_WAIT_CAP_MS = 15000
/** 讀數之前版面要連續幾格靜止(判法只有一份:lib/launch-browser.mjs settleAfterInteraction) */
const ROW_ESTIMATE_SETTLE_FRAMES = 10

/**
 * 三趟量測(各自重新載入 story;M 是每一趟動手前的那次讀數)。`scene` = 動手後這一格應該是的情境(屬性現況),
 * 量到的不是這個 = 量錯了東西(例:屬性被重畫洗掉)→ 儀器失效。
 */
const CELLS = [
  { cell: 'C', what: '區塊只寫 data-ui-size="lg"(寫在 #storybook-root;html 仍是 data-density="md")', target: REGION, name: 'data-ui-size', value: 'lg', scene: { htmlDensity: 'md', htmlUiSize: null, regionDensity: null, regionUiSize: 'lg' } },
  { cell: 'D', what: '掛載之後才在中間層加 data-density="lg"(寫在 #storybook-root;掛載時它沒有這個屬性)', target: REGION, name: 'data-density', value: 'lg', scene: { htmlDensity: 'md', htmlUiSize: null, regionDensity: 'lg', regionUiSize: null } },
  { cell: 'E', what: '對照:整頁密度 md → lg(html 的 data-density)', target: 'html', name: 'data-density', value: 'lg', scene: { htmlDensity: 'lg', htmlUiSize: null, regionDensity: null, regionUiSize: null } },
]
const CELL_ORDER = ['M', 'C', 'D', 'E']
const M_WHAT = '掛載後(整頁一般密度、還沒動任何屬性)'
/** --selftest 的兩種破法:各自只該讓一格紅 */
const SABOTAGES = {
  x: { what: '訂了密度屬性的觀察器收不到 data-ui-size 的變動', red: 'C' },
  y: { what: '訂了密度屬性的觀察器收不到 html 以外元素的 data-density 變動', red: 'D' },
}

// ── 判定(純函式;主跑與 --selftest 共用)──────────────────────────────────────────────────────────────────

/** 一次讀數能不能拿來判(動手前、動手後共用)。回 null = 可以;回字串 = 量不到的原因。 */
export function readingProblem(r) {
  if (!r) return '沒有讀數'
  if (r.err) return r.err
  if (!(r.rendered >= ROW_ESTIMATE_MIN_RENDERED_ROWS)) return `畫出來的虛擬列只有 ${r.rendered} 列(至少要 ${ROW_ESTIMATE_MIN_RENDERED_ROWS} 列)`
  if (!r.sameParent) return '虛擬列的父元素不是同一個(認不出「虛擬高度那一層」)'
  if (!Number.isInteger(r.n) || r.n <= 0) return `讀不到列數(表格根的 aria-rowcount − 1 = ${r.n})`
  if (r.n < r.rendered * ROW_ESTIMATE_MIN_ROWS_PER_RENDERED) return `列數 ${r.n} 太少(畫出來 ${r.rendered} 列,要 ≥ ${ROW_ESTIMATE_MIN_ROWS_PER_RENDERED} 倍)—— 沒畫出來的列決定不了總高,不是「大量資料」`
  if (!Array.isArray(r.heights) || r.heights.length !== 1) return `畫出來的列高不只一種(${(r.heights ?? []).join(' / ')})—— 不是固定行高`
  if (!Number.isInteger(r.heights[0]) || r.heights[0] <= 0) return `列高 ${r.heights[0]} 不是正整數 px(瀏覽器縮放、或根字級不是 16?)`
  if (!r.contiguous) return '畫出來的列沒有一列接一列'
  if (r.scrollTop === null || r.scrollTop === undefined) return '找不到捲動容器'
  if (r.scrollTop !== 0) return `捲動位置 ${r.scrollTop} 不是 0(本閘只保證從頂端量;捲到中段才換密度不在保證內)`
  if (!Number.isFinite(r.total)) return `虛擬高度那一層的高讀不到(${r.total})`
  return null
}

/** 動手前的舞台:整頁密度照網址套上了、「區塊」還是乾淨的。回 null = 可以;回字串 = 原因。 */
export function stageProblem(pre) {
  if (pre.htmlDensity !== 'md') return `html 的 data-density 是 ${JSON.stringify(pre.htmlDensity)},不是 "md"(整頁密度沒照網址套上)`
  if (pre.htmlUiSize !== null) return `html 帶了 data-ui-size=${JSON.stringify(pre.htmlUiSize)}(整頁應該只有 data-density)`
  if (!pre.regionExists) return `找不到 ${REGION}(「區塊」)`
  if (!pre.regionContainsTable) return `${REGION} 沒有包著表格`
  if (pre.regionDensity !== null || pre.regionUiSize !== null) return `${REGION} 動手前已經帶 data-density=${JSON.stringify(pre.regionDensity)} / data-ui-size=${JSON.stringify(pre.regionUiSize)}(「掛載之後才加」的前提不成立)`
  return null
}

const impliedEstimate = (r) => {
  const unrendered = r.n - r.rendered
  return unrendered > 0 ? `推回去,沒畫出來的 ${unrendered} 列用約 ${Math.round(((r.total - r.rendered * r.heights[0]) / unrendered) * 100) / 100} 估` : ''
}

/**
 * trips = [{ cell: 'C' | 'D' | 'E', err?, pre, post }](pre / post = probeInPage 的讀數)。
 * 回 { findings: [{ kind: 'red' | 'instrument', cell, text }], status: { M, C, D, E } };
 * status = 'green' | 'red' | 'instrument'(這一格沒量到)| 'unjudged'(M 紅了所以這一趟不往下判;或 M 有哪一趟沒量到)。
 * 少了任何一趟 = 那一格沒量 = instrument(不讓「0 趟 → 0 筆訊息」被讀成通過)。
 */
export function judge(trips) {
  const findings = []
  const status = {}
  let mJudged = 0
  let mRed = false
  for (const spec of CELLS) {
    const who = `[${spec.cell}] ${spec.what}`
    const instrument = (why) => { findings.push({ kind: 'instrument', cell: spec.cell, text: `${who}:${why}` }); status[spec.cell] = 'instrument' }
    const matches = (trips ?? []).filter((t) => t?.cell === spec.cell)
    if (matches.length !== 1) { instrument(`這一格應該剛好量一趟,實得 ${matches.length} 趟`); continue }
    const t = matches[0]
    if (t.err) { instrument(t.err); continue }
    const preProblem = readingProblem(t.pre) ?? stageProblem(t.pre)
    if (preProblem) { instrument(`動手前 —— ${preProblem}`); continue }
    mJudged += 1
    const preRow = t.pre.heights[0]
    if (Math.abs(t.pre.total - t.pre.n * preRow) > ROW_ESTIMATE_TOTAL_TOLERANCE_PX) {
      mRed = true
      findings.push({ kind: 'red', cell: 'M', text: `[M] ${M_WHAT}(${spec.cell} 這一趟動手前):捲動總高 ${t.pre.total},應 ${t.pre.n * preRow}(= ${t.pre.n} 列 × ${preRow})。${impliedEstimate(t.pre)} —— 基準就不對,這一趟的 ${spec.cell} 不往下判` })
      status[spec.cell] = 'unjudged'
      continue
    }
    const postProblem = readingProblem(t.post)
    if (postProblem) { instrument(`動手後 —— ${postProblem}`); continue }
    const off = Object.keys(spec.scene).filter((k) => t.post[k] !== spec.scene[k])
    if (off.length) { instrument(`動手後量到的不是這一格要的情境(${off.map((k) => `${k} = ${JSON.stringify(t.post[k])},應 ${JSON.stringify(spec.scene[k])}`).join(';')})`); continue }
    if (t.post.n !== t.pre.n) { instrument(`動手後列數變了(${t.pre.n} → ${t.post.n})`); continue }
    const postRow = t.post.heights[0]
    if (postRow === preRow) { instrument(`動手後畫出來的列高沒變(仍是 ${preRow})—— 這一區的密度沒有生效,量不到估計值有沒有跟上`); continue }
    if (Math.abs(t.post.total - t.post.n * postRow) > ROW_ESTIMATE_TOTAL_TOLERANCE_PX) {
      findings.push({ kind: 'red', cell: spec.cell, text: `${who}:捲動總高 ${t.post.total},應 ${t.post.n * postRow}(= ${t.post.n} 列 × ${postRow})。畫出來的 ${t.post.rendered} 列都是 ${postRow} 高;${impliedEstimate(t.post)} → 列高估計沒有跟著這一區的密度更新` })
      status[spec.cell] = 'red'
      continue
    }
    status[spec.cell] = 'green'
  }
  status.M = mRed ? 'red' : mJudged === CELLS.length ? 'green' : 'unjudged'
  return { findings, status }
}

/** 靜態地板(純函式):範例自己傳了 estimateRowHeight,產品就不讀 token 了(data-table.tsx 那個 layout effect 直接 return)——
 *  C / D 會紅在「範例改了」而不是產品壞了。回 { err } = 讀不到範例;{ passes } = 有沒有傳。註解裡出現同樣寫法也會被認到(偏向多攔)。 */
export function storyPassesOwnEstimate(source, exportName = STORY_EXPORT) {
  const start = source.indexOf(`export const ${exportName}`)
  if (start < 0) return { err: `${STORY_SOURCE} 裡找不到 export const ${exportName}` }
  const next = source.indexOf('\nexport const ', start + 1)
  return { passes: /\bestimateRowHeight\s*[=:]/.test(source.slice(start, next < 0 ? source.length : next)) }
}

/** 破法有沒有真的打到(純函式)。回 null = 有;回字串 = 對照組不成立的原因。 */
export function sabotageProblem(mode, trips) {
  const { red } = SABOTAGES[mode]
  for (const t of trips) {
    if (!t.sab || t.sab.mode !== mode) return `${t.cell} 那一趟讀不到破法的狀態(init script 沒有裝上)`
    if (!(t.sab.observers >= 1)) return `${t.cell} 那一趟破法沒有標記到任何觀察器 —— 產品不再用 MutationObserver 訂密度屬性?對照組不成立,照新的實作改破法`
  }
  const hit = trips.find((t) => t.cell === red)
  if (!(hit?.sab?.dropped >= 1)) return `${red} 那一趟破法沒有丟掉任何紀錄(丟掉 ${hit?.sab?.dropped ?? '?'} 筆)—— 沒有真的弄壞,${red} 紅不紅都不算證據`
  return null
}

const sameStatus = (a, b) => CELL_ORDER.every((cell) => a[cell] === b[cell])
const showStatus = (s) => CELL_ORDER.map((cell) => `${cell} ${{ green: '綠', red: '紅', instrument: '沒量到', unjudged: '沒判' }[s[cell]] ?? s[cell]}`).join(' / ')

// ── 頁面函式(以 page.evaluate / waitForFunction / addInitScript 序列化傳入,不得引用外部變數)──────────────

/** 量虛擬高度那一層、畫出來的列,以及 html / 區塊的密度屬性現況。 */
const probeInPage = ({ rowSel, regionSel }) => {
  const r2 = (x) => Math.round(x * 100) / 100
  const html = document.documentElement
  const region = document.querySelector(regionSel)
  const stage = {
    htmlDensity: html.getAttribute('data-density'), htmlUiSize: html.getAttribute('data-ui-size'),
    regionExists: !!region, regionDensity: region ? region.getAttribute('data-density') : null, regionUiSize: region ? region.getAttribute('data-ui-size') : null,
  }
  const rows = [...document.querySelectorAll(rowSel)]
  if (!rows.length) return { ...stage, err: `找不到虛擬列 ${rowSel}` }
  const spacer = rows[0].parentElement
  let scroller = spacer.parentElement
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
  const table = spacer.closest('[role="table"], [role="grid"]')
  const box = spacer.getBoundingClientRect()
  const list = rows.map((r) => { const b = r.getBoundingClientRect(); return { i: Number(r.dataset.index), top: r2(b.top - box.top), h: r2(b.height) } }).sort((a, b) => a.i - b.i)
  return {
    ...stage,
    regionContainsTable: !!region && !!table && region.contains(table),
    n: table && table.hasAttribute('aria-rowcount') ? Number(table.getAttribute('aria-rowcount')) - 1 : null,
    total: r2(box.height),
    rendered: list.length,
    heights: [...new Set(list.map((x) => x.h))],
    contiguous: list.every((x, k) => k === 0 || Math.abs(x.top - (list[k - 1].top + list[k - 1].h)) <= 0.5),
    scrollTop: scroller ? Math.round(scroller.scrollTop) : null,
    sameParent: rows.every((r) => r.parentElement === spacer),
  }
}

/** 寫屬性並讀回(target 'html' = 文件根)。找不到目標回 null。 */
const writeAttributeInPage = ({ target, name, value }) => {
  const el = target === 'html' ? document.documentElement : document.querySelector(target)
  if (!el) return null
  el.setAttribute(name, value)
  return el.getAttribute(name)
}

/** waitForFunction 用:畫出來的列都變成跟先前不同的同一個高。 */
const rowsResizedInPage = ({ rowSel, preH, minRows }) => {
  const hs = [...document.querySelectorAll(rowSel)].map((r) => Math.round(r.getBoundingClientRect().height * 100) / 100)
  return hs.length >= minRows && hs.every((h) => h === hs[0]) && hs[0] !== preH
}

/** waitForFunction 用:畫出來的列一列接一列(虛擬化器已經照新的量測值重排 —— 列剛變高、還沒重排的那一瞬間,列是疊在一起的)。 */
const rowsContiguousInPage = ({ rowSel, minRows }) => {
  const list = [...document.querySelectorAll(rowSel)].map((r) => { const b = r.getBoundingClientRect(); return { i: Number(r.dataset.index), top: b.top, h: b.height } }).sort((a, b) => a.i - b.i)
  return list.length >= minRows && list.every((x, k) => k === 0 || Math.abs(x.top - (list[k - 1].top + list[k - 1].h)) <= 0.5)
}

/**
 * init script(--selftest 的破法;在 story 的任何程式之前裝上,因為產品的觀察器是掛載時建立的):把 MutationObserver 換成子類別。
 * 只有「observe() 的 attributeFilter 裡有 data-ui-size 或 data-density」的觀察器會被標記;被標記的觀察器收到紀錄時先過濾 ——
 * mode 'x' 丟掉 data-ui-size 的紀錄;'y' 丟掉 html 以外元素的 data-density 紀錄;過濾完是空的就不叫它的回呼。
 * 其他觀察器照舊(共用的靜止判定那一支沒有 attributeFilter,不受影響)。頁面上留 window.__rowEstimateSabotage 給閘讀回。
 */
const sabotageInPage = (mode) => {
  const Native = window.MutationObserver
  const density = new WeakSet()
  const state = { mode, observers: 0, dropped: 0 }
  window.__rowEstimateSabotage = state
  const keep = (r) => {
    if (mode === 'x') return r.attributeName !== 'data-ui-size'
    if (mode === 'y') return !(r.attributeName === 'data-density' && r.target !== document.documentElement)
    return true
  }
  window.MutationObserver = class extends Native {
    constructor(callback) {
      super((records, observer) => {
        if (!density.has(observer)) return callback(records, observer)
        const kept = records.filter(keep)
        state.dropped += records.length - kept.length
        if (kept.length) callback(kept, observer)
      })
    }
    observe(target, options) {
      const filter = options?.attributeFilter
      if (Array.isArray(filter) && (filter.includes('data-ui-size') || filter.includes('data-density'))) { density.add(this); state.observers += 1 }
      return super.observe(target, options)
    }
  }
}

// ── 量測 ────────────────────────────────────────────────────────────────────────────────────────────────

const firstLine = (error) => String(error?.message ?? error).split('\n')[0]
const isTimeout = (error) => error?.name === 'TimeoutError'

/** 寫完屬性之後等三件事(檔頭「綠」)。回 null = 都到了;回字串 = 等不到哪一件(儀器失效)。逾時以外的錯往外丟。 */
async function waitForNewLayout(page, preH) {
  const arg = { rowSel: ROW, preH, minRows: ROW_ESTIMATE_MIN_RENDERED_ROWS }
  const seconds = ROW_ESTIMATE_WAIT_CAP_MS / 1000
  try { await page.waitForFunction(rowsResizedInPage, arg, { timeout: ROW_ESTIMATE_WAIT_CAP_MS }) } catch (error) {
    if (!isTimeout(error)) throw error
    return `寫完屬性 ${seconds} 秒內,畫出來的列沒有都變成新的同一個高(動手前 ${preH})—— 這一區的密度沒有生效;那是 CSS 那一面,不是本閘量的列高估計`
  }
  try { await page.waitForFunction(rowsContiguousInPage, arg, { timeout: ROW_ESTIMATE_WAIT_CAP_MS }) } catch (error) {
    if (!isTimeout(error)) throw error
    return `列變高之後 ${seconds} 秒內沒有一列接一列(虛擬化器沒有照新的量測重排)`
  }
  const settled = await settleAfterInteraction(page, { frames: ROW_ESTIMATE_SETTLE_FRAMES })
  return settled.ok ? null : `版面等不到連續 ${ROW_ESTIMATE_SETTLE_FRAMES} 格靜止`
}

async function measureTrip(page, url, spec, notFound) {
  const trip = { cell: spec.cell }
  try {
    await openStory(page, url, { waitFor: ROW, settleFrames: ROW_ESTIMATE_SETTLE_FRAMES, label: STORY, notFound })
    trip.pre = await page.evaluate(probeInPage, { rowSel: ROW, regionSel: REGION })
    if (readingProblem(trip.pre) ?? stageProblem(trip.pre)) return trip // 舞台不對就不動手;原因由 judge 用同一支判定說
    const wrote = await page.evaluate(writeAttributeInPage, { target: spec.target, name: spec.name, value: spec.value })
    if (wrote !== spec.value) { trip.err = `在 ${spec.target} 寫 ${spec.name}="${spec.value}" 之後讀回 ${JSON.stringify(wrote)}`; return trip }
    const waited = await waitForNewLayout(page, trip.pre.heights[0])
    trip.sab = await page.evaluate(() => window.__rowEstimateSabotage ?? null)
    if (waited) { trip.err = waited; return trip }
    trip.post = await page.evaluate(probeInPage, { rowSel: ROW, regionSel: REGION })
  } catch (error) {
    trip.err = error instanceof StoryRenderInstrumentError ? `story 開不起來 —— ${error.detail}` : `量測中斷 —— ${firstLine(error)}`
  }
  return trip
}

/** 起伺服器 + 瀏覽器,C / D / E 各載入一次;sabotage = 'x' | 'y' 時先裝破法(一種破法一個瀏覽器:init script 要在載入前裝)。 */
async function measure({ sabotage = null } = {}) {
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    if (sabotage) await page.addInitScript(sabotageInPage, sabotage)
    const url = `${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story&globals=${encodeURIComponent('theme:light;density:md')}`
    const trips = []
    for (const spec of CELLS) trips.push(await measureTrip(page, url, spec, server.notFound))
    return trips
  } finally { await browser.close(); await server.stop() }
}

// ── 輸出 ────────────────────────────────────────────────────────────────────────────────────────────────

const describeReading = (r) => (!r ? '(沒有讀數)' : r.err ? `(${r.err})` : `總高 ${r.total} / 列高 ${(r.heights ?? []).join('、')} / 畫出 ${r.rendered} 列 / 列數 ${r.n}`)
const describeTrip = (t) => `  ${t.cell} 這一趟:動手前 ${describeReading(t.pre)}${t.post ? ` → 動手後 ${describeReading(t.post)}` : ''}${t.err ? ` —— ${t.err}` : ''}`

/** 主跑的逐格輸出(每格一行;紅與沒量到印原因)。 */
function report(trips, { findings, status }) {
  for (const t of trips) console.log(describeTrip(t))
  const measured = (cell) => trips.find((t) => t.cell === cell)
  for (const cell of CELL_ORDER) {
    const mine = findings.filter((f) => f.cell === cell)
    for (const f of mine) console.log(f.kind === 'red' ? `✗ ${f.text}` : `✗ ${INSTRUMENT_FAIL_MARKER} ${f.text}`)
    if (status[cell] === 'green') {
      if (cell === 'M') console.log(`✓ [M] ${M_WHAT}:${CELLS.length} 趟動手前的捲動總高都 = 列數 × 列高(${CELLS.map((c) => measured(c.cell).pre.total).join(' / ')})`)
      else { const t = measured(cell); console.log(`✓ [${cell}] ${CELLS.find((c) => c.cell === cell).what}:捲動總高 ${t.pre.total} → ${t.post.total}(= ${t.post.n} 列 × ${t.post.heights[0]})`) }
    } else if (status[cell] === 'unjudged') {
      console.log(`– [${cell}] 沒有判(${cell === 'M' ? '有一趟動手前就沒量到' : '這一趟的基準 M 就不對'})`)
    }
  }
}

// ── --selftest ─────────────────────────────────────────────────────────────────────────────────────────

/** 不准出現在 --selftest 成功輸出裡的機讀標記(lib/gate-selftest-meta.mjs 看到就把這次自測讀成儀器失效 / 起不了瀏覽器 / 缺建置) */
const MACHINE_MARKERS = [INSTRUMENT_FAIL_MARKER, BROWSER_REQUIRED_MARKER, MISSING_BUILD_MARKER, STALE_BUILD_MARKER, SKIPPED_ENV_MARKER, 'storybook-static missing']
/** --selftest 的成功行一律經這裡:混進任何機讀標記就丟例外(寫錯當場現形,不用等夜間 lane 把綠的自測讀成紅)。 */
function say(line) {
  const index = MACHINE_MARKERS.findIndex((marker) => line.includes(marker))
  if (index >= 0) throw new Error(`selftest 的成功行混進了機讀標記(MACHINE_MARKERS 第 ${index + 1} 個)—— 故意造出來的失敗只拿來比對,不原樣印`)
  console.log(line)
}

/** (a) 判定表:不開瀏覽器,餵合成讀數。回不符的清單。 */
function selftestTable() {
  const problems = []
  const expect = (ok, message) => { if (!ok) problems.push(message) }
  const reading = (over = {}) => ({
    n: 10000, total: 400000, rendered: 18, heights: [40], contiguous: true, scrollTop: 0, sameParent: true,
    htmlDensity: 'md', htmlUiSize: null, regionExists: true, regionContainsTable: true, regionDensity: null, regionUiSize: null, ...over,
  })
  const after = (cell, over = {}) => reading({ total: 480000, rendered: 16, heights: [48], ...CELLS.find((c) => c.cell === cell).scene, ...over })
  const trip = (cell, over = {}) => ({ cell, pre: reading(), post: after(cell), ...over })
  const trips = (overByCell = {}) => CELLS.map(({ cell }) => trip(cell, overByCell[cell]))
  const GREEN = { M: 'green', C: 'green', D: 'green', E: 'green' }
  let rows = 0
  const check = (name, input, wantStatus, extra = () => true) => {
    rows += 1
    const verdict = judge(input)
    expect(sameStatus(verdict.status, wantStatus) && extra(verdict), `判定表「${name}」:應 ${showStatus(wantStatus)},實得 ${showStatus(verdict.status)}(${verdict.findings.map((f) => `${f.kind}@${f.cell}`).join('、') || '沒有訊息'})`)
  }
  const onlyRed = (cell) => (v) => v.findings.length === 1 && v.findings[0].kind === 'red' && v.findings[0].cell === cell
  const noRed = (v) => !v.findings.some((f) => f.kind === 'red')

  check('現況的形狀', trips(), GREEN, (v) => v.findings.length === 0)
  // 每一格各自「總高停在 400,144」→ 只紅那一格,訊息帶量到的與應該的數字
  for (const cell of ['C', 'D', 'E']) {
    check(`${cell} 的總高停在 400144`, trips({ [cell]: { post: after(cell, { total: 400144 }) } }), { ...GREEN, [cell]: 'red' },
      (v) => onlyRed(cell)(v) && v.findings[0].text.includes('400144') && v.findings[0].text.includes('480000') && v.findings[0].text.startsWith(`[${cell}]`))
  }
  // 容許差的邊界:差 1 綠、差 2 紅(兩個方向)
  check('C 多 1px', trips({ C: { post: after('C', { total: 480001 }) } }), GREEN)
  check('C 多 2px', trips({ C: { post: after('C', { total: 480002 }) } }), { ...GREEN, C: 'red' }, onlyRed('C'))
  check('C 少 2px', trips({ C: { post: after('C', { total: 479998 }) } }), { ...GREEN, C: 'red' }, onlyRed('C'))
  // M:掛載後就不對(估 36、列高 40)→ 只紅 M,那一趟的格不往下判(不是綠也不是紅)
  check('C 那一趟動手前總高 360000', trips({ C: { pre: reading({ total: 360000 }) } }), { M: 'red', C: 'unjudged', D: 'green', E: 'green' },
    (v) => onlyRed('M')(v) && v.findings[0].text.startsWith('[M]') && v.findings[0].text.includes('360000') && v.findings[0].text.includes('400000'))
  check('三趟動手前都不對', trips({ C: { pre: reading({ total: 360000 }) }, D: { pre: reading({ total: 360000 }) }, E: { pre: reading({ total: 360000 }) } }),
    { M: 'red', C: 'unjudged', D: 'unjudged', E: 'unjudged' }, (v) => v.findings.length === 3 && v.findings.every((f) => f.kind === 'red' && f.cell === 'M'))
  // 量不到:每一種各一筆,都落在 D 那一趟 —— D = 沒量到(不是紅也不是綠),C / E 照綠,沒有任何一筆紅
  const dPre = (over) => ({ D: { pre: reading(over) } })
  const dPost = (over) => ({ D: { post: after('D', over) } })
  const beforeActing = { M: 'unjudged', C: 'green', D: 'instrument', E: 'green' } // 動手前就量不到:那一趟的 M 也沒判
  const afterActing = { ...GREEN, D: 'instrument' }
  for (const [name, input, want] of [
    ['量測中斷', { D: { err: '量測中斷 —— 假的' } }, beforeActing],
    ['找不到虛擬列', { D: { pre: { ...reading(), err: '找不到虛擬列' } } }, beforeActing],
    ['畫出來的列只有 2 列', dPre({ rendered: 2 }), beforeActing],
    ['列的父元素不是同一個', dPre({ sameParent: false }), beforeActing],
    ['列數讀不到', dPre({ n: null }), beforeActing],
    ['列數太少(100 列、畫出 18 列)', dPre({ n: 100, total: 4000 }), beforeActing],
    ['列高兩種', dPre({ heights: [40, 44] }), beforeActing],
    ['列高不是整數', dPre({ heights: [40.5], total: 405000 }), beforeActing],
    ['列疊在一起', dPre({ contiguous: false }), beforeActing],
    ['找不到捲動容器', dPre({ scrollTop: null }), beforeActing],
    ['動手前捲動位置不是 0', dPre({ scrollTop: 200000 }), beforeActing],
    ['整頁密度不是 md', dPre({ htmlDensity: 'lg' }), beforeActing],
    ['html 帶了 data-ui-size', dPre({ htmlUiSize: 'lg' }), beforeActing],
    ['找不到 #storybook-root', dPre({ regionExists: false, regionContainsTable: false }), beforeActing],
    ['#storybook-root 沒有包著表格', dPre({ regionContainsTable: false }), beforeActing],
    ['區塊動手前就帶 data-density', dPre({ regionDensity: 'lg' }), beforeActing],
    ['區塊動手前就帶 data-ui-size', dPre({ regionUiSize: 'lg' }), beforeActing],
    ['動手後沒有讀數', { D: { post: undefined } }, afterActing],
    ['動手後列數變了', dPost({ n: 9999, total: 9999 * 48 }), afterActing],
    ['動手後列高沒變', { D: { post: reading({ regionDensity: 'lg' }) } }, afterActing],
    ['動手後列高兩種', dPost({ heights: [40, 48] }), afterActing],
    ['動手後列疊在一起', dPost({ contiguous: false }), afterActing],
    ['動手後屬性被洗掉(量到的不是這一格要的情境)', dPost({ regionDensity: null }), afterActing],
    // 捲到中段才換密度(2026-11-14 研究時實量 440,080):不在本閘保證內 —— 判成沒量到,不指控產品
    ['動手後捲動位置不是 0、總高 440080', dPost({ total: 440080, scrollTop: 104 }), afterActing],
  ]) check(`量不到:${name}`, trips(input), want, noRed)
  // 少一趟 / 多一趟 / 一趟都沒有 → 那一格沒量到(0 趟不得被讀成通過)
  check('一趟都沒有', [], { M: 'unjudged', C: 'instrument', D: 'instrument', E: 'instrument' }, noRed)
  check('少了 E 那一趟', trips().slice(0, 2), { M: 'unjudged', C: 'green', D: 'green', E: 'instrument' }, noRed)
  check('C 量了兩趟', [...trips(), trip('C')], { M: 'unjudged', C: 'instrument', D: 'green', E: 'green' }, noRed)

  // 靜態地板:範例自己傳了 estimateRowHeight
  const story = (body) => `export const NestedRows: Story = {}\n\nexport const VirtualScroll: Story = {\n  render: () => (\n    <DataTable columns={columns} data={largeData} height="500px" overscan={10}${body} />\n  ),\n}\n\nexport const WithBulkActions: Story = { args: { estimateRowHeight: 36 } }\n`
  expect(storyPassesOwnEstimate(story('')).passes === false, '靜態地板:範例沒傳 estimateRowHeight 應放行(下一則 story 傳了不算)')
  expect(storyPassesOwnEstimate(story(' estimateRowHeight={36}')).passes === true, '靜態地板:範例傳了 estimateRowHeight={36} 應攔下')
  expect(typeof storyPassesOwnEstimate('export const Other: Story = {}\n').err === 'string', '靜態地板:找不到範例應回 err')
  rows += 3

  // 破法有沒有打到
  const sab = (mode, dropped, observers = 1) => CELLS.map(({ cell }) => ({ cell, sab: { mode, observers, dropped: dropped[cell] ?? 0 } }))
  expect(sabotageProblem('x', sab('x', { C: 1 })) === null, '破法 X:標記到 1 個觀察器、C 丟掉 1 筆 應成立')
  expect(sabotageProblem('y', sab('y', { D: 1 })) === null, '破法 Y:標記到 1 個觀察器、D 丟掉 1 筆 應成立')
  expect(typeof sabotageProblem('x', sab('x', { C: 1 }, 0)) === 'string', '破法 X:標記到 0 個觀察器 應不成立')
  expect(typeof sabotageProblem('x', sab('x', { D: 1 })) === 'string', '破法 X:C 那一趟丟掉 0 筆 應不成立(丟在別趟不算)')
  expect(typeof sabotageProblem('y', sab('x', { D: 1 })) === 'string', '破法 Y:頁面上裝的是 X 應不成立')
  expect(typeof sabotageProblem('y', CELLS.map(({ cell }) => ({ cell, sab: null }))) === 'string', '破法 Y:讀不到破法狀態 應不成立')
  rows += 6

  // 成功行的守門
  let threw = false
  const realLog = console.log
  console.log = () => {}
  try { say(`假的成功行 ${INSTRUMENT_FAIL_MARKER}`) } catch { threw = true } finally { console.log = realLog }
  expect(threw, 'say():成功行混進機讀標記應丟例外')
  rows += 1
  return { problems, rows }
}

/**
 * (c) 假建置:只有「無預覽」頁的 iframe.html → 主跑必須以儀器失效的標記與 exit 2 結束。回不符的原因或 null。
 * 子行程**經符號連結**叫自己(lib/direct-run.mjs runViaSymlink):同一格順便證明「是不是被直接執行」比的是真實路徑 ——
 * 只比字串的寫法經連結叫會什麼都不跑、exit 0,這一格就紅。
 */
function fakeBuildProblem() {
  const dir = mkdtempSync(path.join(tmpdir(), 'row-estimate-fake-build-'))
  try {
    writeFileSync(path.join(dir, 'iframe.html'), '<!doctype html><html><head><meta charset="utf-8"><title>fake build</title></head><body class="sb-show-nopreview"></body></html>\n')
    const run = runViaSymlink(import.meta.url, [`--static=${dir}`], { timeoutMs: 180000 })
    if (!run.made) return `假建置:經符號連結叫主跑的對照組沒有跑成(${run.why})`
    if (!run.naiveSkips || !run.helperRuns) return `假建置:連結路徑的判定不符(只比字串會判成被 import:${run.naiveSkips};isDirectRun:${run.helperRuns})—— 對照組不成立`
    const marked = run.text.includes(INSTRUMENT_FAIL_MARKER)
    const silent = run.status === 0 && !run.text.trim()
    return run.status === 2 && marked ? null : `假建置(只有「無預覽」頁、經符號連結叫)下主跑應以儀器失效的標記與結束碼 2 結束,實得結束碼 ${run.status}、${marked ? '有' : '沒有'}標記${silent ? ' —— 什麼都沒跑(「是不是被直接執行」是不是又只比字串?)' : ''}`
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

/** 靜態地板(讀這次 checkout 的範例原始碼)。回 null = 過;回字串 = 儀器失效的原因。 */
function staticFloorProblem() {
  let source
  try { source = readFileSync(path.join(REPO, STORY_SOURCE), 'utf8') } catch (error) { return `讀不到 ${STORY_SOURCE}(${firstLine(error)})` }
  const floor = storyPassesOwnEstimate(source)
  if (floor.err) return floor.err
  return floor.passes ? `${STORY_SOURCE} 的 ${STORY_EXPORT} 自己傳了 estimateRowHeight —— 產品就不讀列高 token 了,這則量不到「估計值跟著密度」;把範例改回不傳,或換一則` : null
}

const instrumentExit = (lines) => {
  for (const line of lines) console.error(`✗ ${INSTRUMENT_FAIL_MARKER} ${line}`)
  console.error(`\n✗ data-table-row-estimate-density:${INSTRUMENT_FAIL_MARKER} —— 有東西沒有真的量到(見上),不當成通過,也不指控產品`)
  return 2
}

async function selftest() {
  const failures = []
  // (a) 判定表
  const table = selftestTable()
  if (table.problems.length) {
    for (const problem of table.problems) console.error(`✗ selftest:${problem}`)
    console.error('❌ data-table-row-estimate-density selftest FAIL(判定表就不對,後面的真建置對照不跑)')
    return 1
  }
  say(`✓ 判定表 ${table.rows} 筆:每一格各有該紅 / 該綠 / 量不到,容許差邊界、少一趟、範例自己傳估計值、破法沒打到、成功行守門都如預期`)
  const floor = staticFloorProblem()
  if (floor) return instrumentExit([floor])
  if (!staticArg) requireFreshStorybookBuild(STATIC, SOURCES)

  // (b) 真建置:現況必綠,再各裝一種破法
  const GREEN = { M: 'green', C: 'green', D: 'green', E: 'green' }
  const runs = [[null, '現況(不裝破法)', GREEN], ...Object.entries(SABOTAGES).map(([mode, s]) => [mode, `破法 ${mode.toUpperCase()}(${s.what})`, { ...GREEN, [s.red]: 'red' }])]
  for (const [mode, name, want] of runs) {
    const trips = await measure({ sabotage: mode })
    const verdict = judge(trips)
    const unmeasured = verdict.findings.filter((f) => f.kind === 'instrument')
    if (unmeasured.length) return instrumentExit([`selftest ${name}:沒量到不能讀成「對照組被抓到」`, ...unmeasured.map((f) => f.text)])
    const hit = mode ? sabotageProblem(mode, trips) : null
    const reds = verdict.findings.filter((f) => f.kind === 'red').map((f) => f.text)
    if (!sameStatus(verdict.status, want)) failures.push(`${name}:四格應 ${showStatus(want)},實得 ${showStatus(verdict.status)}${reds.length ? `\n    ${reds.join('\n    ')}` : ''}${mode ? '' : '\n    基準不乾淨,對照組沒有意義'}`)
    else if (hit) failures.push(`${name}:${hit}`)
    else say(`✓ ${name}:${showStatus(verdict.status)}${mode ? `;標記到 ${trips[0].sab.observers} 個觀察器、${SABOTAGES[mode].red} 那一趟丟掉 ${trips.find((t) => t.cell === SABOTAGES[mode].red).sab.dropped} 筆紀錄\n    ${reds.join('\n    ')}` : ''}`)
  }

  // (c) 假建置:主跑的儀器失效出口
  const fake = fakeBuildProblem()
  if (fake) failures.push(fake)
  else say('✓ 假建置(只有「無預覽」頁、經符號連結叫):主跑以儀器失效的標記與結束碼 2 結束(不是通過,也不是指控產品;經連結叫也真的跑了)')

  if (failures.length) {
    for (const failure of failures) console.error(`✗ selftest:${failure}`)
    console.error('❌ data-table-row-estimate-density selftest FAIL')
    return 1
  }
  say('✅ data-table-row-estimate-density selftest PASS(判定表 + 現況四格綠 + 破法 X 只紅 C、Y 只紅 D + 假建置走儀器失效出口)')
  return 0
}

async function main() {
  const floor = staticFloorProblem()
  if (floor) return instrumentExit([floor])
  if (!staticArg) requireFreshStorybookBuild(STATIC, SOURCES)
  const trips = await measure()
  const verdict = judge(trips)
  report(trips, verdict)
  if (verdict.findings.some((f) => f.kind === 'instrument')) return instrumentExit([])
  if (verdict.findings.some((f) => f.kind === 'red')) { console.error('\n❌ data-table-row-estimate-density FAIL'); return 1 }
  console.log('\n✅ data-table-row-estimate-density PASS(大量資料那則掛載後 / 區塊只寫 data-ui-size / 掛載後才在中間層加 data-density / 整頁密度切換:捲動總高 = 列數 × 畫出來的列高)')
  return 0
}

// 「是不是被直接執行」比真實路徑(lib/direct-run.mjs;本閘先用的寫法,2026-11-14 抽成共用):經符號連結的目錄執行時(/tmp → /private/tmp),
// 只比字串會判成「被 import」→ 什麼都不跑、exit 0(靜默通過)
if (isDirectRun(import.meta.url)) {
  let code
  try {
    code = await (process.argv.includes('--selftest') ? selftest() : main())
  } catch (error) {
    // 量測以外的地方丟出來的儀器失效(例:建置快照不完整)照樣走儀器失效出口;其餘是程式錯,照實往外丟
    if (!(error instanceof StoryRenderInstrumentError) && !String(error?.message ?? '').includes(INSTRUMENT_FAIL_MARKER)) throw error
    console.error(`✗ ${firstLine(error)}`)
    code = 2
  }
  process.exit(code)
}
