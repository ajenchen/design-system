#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 水平溢出的那一排(Chip scroll / menu、Tabs scroll / menu、FileViewer 縮圖列)「選到就露出來」——
 *         horizontal-overflow.spec.md「選到就露出來」對齊 B(user 2026-11-11「都先B」):四種輸入
 *         (滑鼠點半露的項目、方向鍵、⌄ 選單選取、縮放視窗 / 容器變窄)之後,使用者剛動到的那一項
 *         (點的 / 鍵盤焦點 / 選單選的 / 上一次揭露的)完整可讀(不在淡出區、不被箭頭蓋住),而且中心在捲動容器可視寬中心 ±2px;
 *         只有「置中需要捲到 < 0 或 > 最大捲動量」時才接受夾在那一端(另判:項目要落在那一端的半邊、仍完整可讀)。
 *         每次輸入等捲動容器的 scrollLeft 連續靜止若干影格再量(不用固定睡眠)。
 *   紅: 任一格(元件 × 輸入 × 步驟)中心偏離 > 2px 且不是合法夾住(off-center)/ 項目被淡出或箭頭遮住(unreadable)
 *       → 指名哪一排、哪種輸入、哪一項、偏多少並 exit 1。
 *       拿掉 primitive 的呼叫(selftest:每種輸入動作前一刻把捲動容器的 scrollTo 換成空函式 = useRevealSelected 不作用)→ 每一排每種輸入都必須紅;
 *       2026-11-11 修前建置(`--selftest --control-static=<修前建置>`)直接點半露的 Chip / Tab、Tabs scroll 方向鍵、縮放視窗必紅。
 *       零格量測 / 某種輸入一格「非夾住」的量測都沒有 / 點擊找不到半露的項目 / 選單找不到觸發鈕 / 捲動等不到靜止 = 儀器失效(INSTRUMENT-FAIL,exit 1),不當綠燈。
 *   綠: 現況建置全部格子置中或合法夾住且完整可讀;同一份 storybook-static 重複跑結果恆等(輸入順序固定、等靜止用影格)。
 *   量法: 判定抽成純函式 `judge`(幾何 → 結果)與 `maskObstruction`(遮罩字串 → 兩側被淡出的寬度),selftest 判定表兩面;
 *         遮擋寬度從捲動容器實際的 mask-image 讀(不抄 primitive 的常數),箭頭用真實按鈕的 getBoundingClientRect。
 *   幾何不靠字型(2026-11-12): 展示 story 的外框是寫死的寬度,項目多寬卻看這台機器有什麼字型 —— CI runner 沒有中文字型,
 *         Tabs 的 8 個頁籤整排塞得進 320px 外框:9126e95b 那一輪 Tabs scroll 的「點擊 / 方向鍵」因此全是夾住(什麼都沒驗到卻印 ✓),
 *         Tabs menu 則在「選單」那步找不到半露的項目而紅。現在每次開 story 歸零後先問純函式 `overflowPlan`:
 *         這一排有沒有「不是最後一項、又沒有完整可讀」的項目?有 → 照天然排版量(本機與之前完全一樣);
 *         沒有 → 把捲動容器的可視寬調成「中間那一項的中心」(從量到的項目位置算,至少放得下最寬的項目加兩側遮擋)再量,
 *         並在輸出標「自備幾何」。調完仍然沒有 = 儀器失效。
 *         selftest 兩面:把可視寬撐到「整排塞得下」/「只切到最後一項」(= CI 那一輪的兩種可能)——
 *         關掉自備幾何 → 重現當時的紅(儀器失效,訊息同 CI);開著 → 每一格都量到、全綠,而且點擊 / 方向鍵 / 選單 / 縮放都有「需要置中」的格子。
 *
 * Run: node scripts/overflow-reveal-selected-invariant.mjs [--static=<dir>] [--selftest [--control-static=<修前建置>]]
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, requireStorybookBuild,
  StoryRenderInstrumentError,
} from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARGS = process.argv.slice(2)
const arg = (name) => { const hit = ARGS.find((a) => a.startsWith(`${name}=`)); return hit ? hit.slice(name.length + 1) : null }
const STATIC = path.resolve(arg('--static') ?? path.join(REPO, 'storybook-static'))
const CONTROL_STATIC = arg('--control-static') ? path.resolve(arg('--control-static')) : null
const SOURCES = [
  'packages/design-system/src/patterns/horizontal-overflow/horizontal-overflow.tsx',
  'packages/design-system/src/components/Chip/chip.tsx',
  'packages/design-system/src/components/Tabs/tabs.tsx',
  'packages/design-system/src/components/FileViewer/file-viewer.tsx',
  'packages/design-system/src/components/Chip/chip.principles.stories.tsx',
  'packages/design-system/src/components/Tabs/tabs.stories.tsx',
  'packages/design-system/src/components/FileViewer/file-viewer.stories.tsx',
]
// 中心偏離容許值 = horizontal-overflow.spec.md「閘」句的「容器中心 ±2px」(唯一一份規範數字)。原名 TOLERANCE 與
// switch-thumb-ring-invariant.mjs 的 TOLERANCE = 8 撞名被 named-constant-drift 抓到 —— 那支的 8 是截圖每通道色差(/255),
// 與這裡的像素距離無關、不是同一個值的兩份,改名分開(2026-11-12)。
const CENTER_TOLERANCE_PX = 2
// 兩側遮擋最寬的估值(scroll 模式:箭頭 32 + 淡出 16)。只用在「還沒量之前」要先估的兩處 —— 找右側半露的項目、
// 自備幾何的可視寬下限;判定用的遮擋寬度一律從實際的 mask-image 讀(maskObstruction),不用這個數字。
const WIDEST_OBSTRUCTION_PX = 48
// menu 模式右側淡出的寬度:項目右緣超過「可視寬 − 這個值」= 沒有完整可讀
const MENU_FADE_PX = 16

// ── 受測的五排 ─────────────────────────────────────────────────────────────
// scroller = 頁面上第幾個 [data-overflow-scroller];item = 項目選擇器(修前建置也認得,對照組才量得到);
// menu = ⌄ 觸發鈕 aria-label 開頭(沒有 = 這一排沒有選單);keyTarget = 方向鍵之後要揭露的是誰(焦點 / aria-current)
export const STRIPS = Object.freeze([
  { key: 'chip-scroll', label: 'Chip layout="scroll"', story: 'design-system-components-chip-設計原則--layout-rule', scroller: 0, item: 'button[data-state]', menu: null, keyTarget: 'focus', viewport: { width: 1280, height: 900 }, narrowTo: 400 },
  { key: 'chip-menu', label: 'Chip layout="menu"', story: 'design-system-components-chip-設計原則--layout-rule', scroller: 1, item: 'button[data-state]', menu: '選項選單', keyTarget: 'focus', viewport: { width: 1280, height: 900 }, narrowTo: 400 },
  { key: 'tabs-scroll', label: 'Tabs overflow="scroll"', story: 'design-system-components-tabs-展示--overflow-scroll', scroller: 0, item: '[role="tab"]', menu: null, keyTarget: 'focus', viewport: { width: 1280, height: 900 }, narrowTo: 300 },
  { key: 'tabs-menu', label: 'Tabs overflow="menu"', story: 'design-system-components-tabs-展示--overflow-menu', scroller: 0, item: '[role="tab"]', menu: '頁籤選單', keyTarget: 'focus', viewport: { width: 1280, height: 900 }, narrowTo: 300 },
  { key: 'filmstrip', label: 'FileViewer 縮圖列', story: 'design-system-components-fileviewer-展示--event-photos-collection', scroller: 0, item: '[data-thumb-index]', menu: null, keyTarget: 'current', viewport: { width: 390, height: 800 }, narrowTo: 330, open: '檢視活動相集' },
])
export const INPUTS = Object.freeze(['click', 'keys', 'menu', 'resize'])

// ── 純函式:遮罩字串 → 兩側被淡出的寬度(px)──────────────────────────────
// 認 buildFadeMask 的形狀,也認瀏覽器序列化後的形狀(black ↔ rgb(0, 0, 0)、transparent ↔ rgba(0, 0, 0, 0))。
// 左側遮擋 = 第一個不透明色標的位置(若第一個色標不是不透明);右側同理從尾端算。沒有遮罩 = 0。
export function maskObstruction(mask, width) {
  if (!mask || mask === 'none') return { left: 0, right: 0 }
  const re = /(transparent|black|rgba?\([^)]*\))\s+(calc\(\s*100%\s*-\s*[\d.]+px\s*\)|[\d.]+(?:px|%))/g
  const stops = []
  let m
  while ((m = re.exec(mask))) {
    const color = m[1].replace(/\s+/g, '')
    const opaque = color === 'black' || color === 'rgb(0,0,0)' || /^rgba\(0,0,0,1(\.0+)?\)$/.test(color)
    const pos = m[2]
    const px = pos.startsWith('calc') ? width - parseFloat(pos.replace(/^calc\(\s*100%\s*-\s*/, '')) : pos.endsWith('%') ? (parseFloat(pos) * width) / 100 : parseFloat(pos)
    stops.push({ opaque, px })
  }
  if (stops.length === 0) return { left: 0, right: 0, unparsed: true }
  const firstOpaque = stops.find((s) => s.opaque)
  const lastOpaque = [...stops].reverse().find((s) => s.opaque)
  return {
    left: stops[0].opaque || !firstOpaque ? 0 : firstOpaque.px,
    right: stops[stops.length - 1].opaque || !lastOpaque ? 0 : width - lastOpaque.px,
  }
}

// ── 純函式:歸零時這一排的幾何夠不夠驗;不夠 → 該把可視寬調成多少 ─────────────────
// list = listInPage 的結果(每一項相對捲動容器左緣的 left / right,scW = 可視寬),必須在 scrollLeft 0 時量。
// 夠 = 有一個「不是最後一項」的項目沒有完整可讀(右緣超過可視寬 − 淡出寬:伸進淡出區或被切掉)。
// 不夠 → target = 中間那一項的中心,夾在 [最寬的項目 + 兩側最寬遮擋 + 8, 倒數第二項的右緣 + 8]:
//   下限保證任何一項置中時放得進可讀區;上限保證倒數第二項仍然沒有完整可讀。下限 > 上限 = 這一排太短,切不出來。
export function overflowPlan(list) {
  const n = list?.length ?? 0
  if (n === 0) return { enough: false, target: null, why: '量不到任何項目' }
  const scW = list[0].scW
  if (list.some((it, i) => i < n - 1 && it.right > scW - MENU_FADE_PX)) return { enough: true }
  if (n < 3) return { enough: false, target: null, why: `只有 ${n} 項,沒有「中間那一項」可以切` }
  const centre = (it) => (it.left + it.right) / 2
  const mid = (list[0].left + list[n - 1].right) / 2
  let m = 1
  for (let i = 2; i <= n - 2; i += 1) if (Math.abs(centre(list[i]) - mid) < Math.abs(centre(list[m]) - mid)) m = i
  const widest = Math.max(...list.map((it) => it.right - it.left))
  const lo = Math.ceil(widest + 2 * WIDEST_OBSTRUCTION_PX + 8)
  const hi = Math.floor(list[n - 2].right + 8)
  if (lo > hi) return { enough: false, target: null, why: `這一排太短:最寬的項目 ${widest.toFixed(1)}px 加兩側遮擋至少要 ${lo}px 可視寬,但倒數第二項的右緣只到 ${list[n - 2].right.toFixed(1)}px` }
  return { enough: false, target: Math.min(hi, Math.max(lo, Math.round(centre(list[m])))), middle: m }
}

// ── 純函式:視窗縮放碰不到捲動容器時,可視寬該改成多少 ───────────────────────────
// g = { width(目前可視寬), itemWidth / itemCentre(剛點的那一項;centre 是內容座標 = 含 scrollLeft), content(scrollWidth) }
// 依序試 縮 64 / 放寬 64 / 縮 32 / 放寬 32(都 ≥ 16px:呼叫端「寬度沒變 = 儀器失效」的門檻),取第一個同時滿足:
//   (a) 放得下那一項加兩側最寬遮擋(置中時完整可讀);(b) 改完之後那一項置中所需的 scrollLeft 不在兩端(差 ≥ 2px)——
//   這樣這一格量到的是「真的留在中心」,不是合法夾住。都不滿足 (b) → 退而取第一個滿足 (a) 的(那一格會是夾住,
//   有沒有任何一格縮放量到置中由 instrumentProblems 把關);連 (a) 都沒有 → null(呼叫端當儀器失效)。
export function resizePlan(g) {
  const fits = (w) => w >= g.itemWidth + 2 * WIDEST_OBSTRUCTION_PX + 8
  const centres = (w) => { const want = g.itemCentre - w / 2; return want >= 2 && want <= g.content - w - 2 }
  const candidates = [g.width - 64, g.width + 64, g.width - 32, g.width + 32].map(Math.round)
  const best = candidates.find((w) => fits(w) && centres(w))
  if (best != null) return { width: best, centres: true }
  const fallback = candidates.find(fits)
  return fallback != null ? { width: fallback, centres: false } : null
}

// ── 純函式:一格量測 → 判定 ─────────────────────────────────────────────────
// g = { left, right(項目相對捲動容器可視區左緣), width(可視寬), scrollLeft, maxScroll, obstruction:{left,right}, arrowOverlap }
export function judge(g, where = '') {
  const center = (g.left + g.right) / 2
  const offset = Math.round((center - g.width / 2) * 10) / 10
  const readable = g.left >= g.obstruction.left - 0.5 && g.right <= g.width - g.obstruction.right + 0.5 && !g.arrowOverlap
  const clampedStart = g.scrollLeft <= 1 && offset < 0
  const clampedEnd = g.scrollLeft >= g.maxScroll - 1 && offset > 0
  const centered = Math.abs(offset) <= CENTER_TOLERANCE_PX
  const how = centered ? 'centered' : clampedStart ? 'clamped-start' : clampedEnd ? 'clamped-end' : 'off-center'
  if (!readable) {
    const why = g.arrowOverlap ? '被箭頭蓋住' : `落在淡出區(項目 ${g.left.toFixed(1)}..${g.right.toFixed(1)},可讀區 ${g.obstruction.left.toFixed(1)}..${(g.width - g.obstruction.right).toFixed(1)})`
    return { ok: false, how, kind: 'unreadable', offset, text: `${where}:選到的項目沒有完整可讀 —— ${why}` }
  }
  if (how === 'off-center') return { ok: false, how, kind: 'off-center', offset, text: `${where}:選到的項目中心偏離容器中心 ${offset}px(> ±${CENTER_TOLERANCE_PX};scrollLeft ${g.scrollLeft.toFixed(1)} / 最大 ${g.maxScroll},不是兩端夾住)` }
  return { ok: true, how, offset, text: `${where}:${how} ${offset}px` }
}

// ── 頁面端:量指定項目(以原始碼序列化傳進頁面:不得引用外部變數)────────────
const measureInPage = ([scIndex, itemSel, targetIndex]) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  if (!sc) return null
  const items = [...sc.querySelectorAll(itemSel)]
  const el = items[targetIndex]
  if (!el) return null
  const s = sc.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const left = r.left - s.left - sc.clientLeft
  const arrows = [...(sc.parentElement?.querySelectorAll('[data-overflow-arrow] button') ?? [])].map((b) => b.getBoundingClientRect())
  const arrowOverlap = arrows.some((a) => Math.min(a.right, r.right) - Math.max(a.left, r.left) > 0.5 && Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top) > 0.5)
  return {
    label: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24),
    left, right: left + r.width, width: sc.clientWidth, scrollLeft: sc.scrollLeft, maxScroll: sc.scrollWidth - sc.clientWidth,
    mask: sc.style.maskImage || sc.style.webkitMaskImage || getComputedStyle(sc).maskImage || 'none',
    arrowOverlap,
  }
}

// 每一項的可見比例(找「右側半露」的那一項用)
const listInPage = ([scIndex, itemSel]) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  if (!sc) return null
  const s = sc.getBoundingClientRect()
  return [...sc.querySelectorAll(itemSel)].map((el) => {
    const r = el.getBoundingClientRect()
    const vis = Math.max(0, Math.min(r.right, s.right) - Math.max(r.left, s.left))
    return { ratio: vis / r.width, left: r.left - s.left, right: r.right - s.left, scW: s.width, label: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24) }
  })
}

// 把捲動容器的可視寬往 targetW 推一步:改它父層(flex 外殼)的寬度,差多少補多少。
// ⌄ 觸發鈕只在有溢出時才渲染,出現 / 消失會吃掉一段寬度 → 呼叫端等靜止後再量、沒到位就再推一步。
const nudgeScrollerWidthInPage = ([scIndex, targetW]) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  const host = sc?.parentElement
  if (!sc || !host) return null
  const now = sc.getBoundingClientRect().width
  const hostW = host.getBoundingClientRect().width
  host.style.maxWidth = 'none'
  host.style.flex = '0 0 auto' // 父層若是橫向 flex,寫死的寬度會被壓縮 / 撐開 → 鎖住
  host.style.width = `${Math.max(1, Math.round(hostW + (targetW - now)))}px`
  return { from: now }
}
const scrollerWidthInPage = (scIndex) => document.querySelectorAll('[data-overflow-scroller]')[scIndex]?.getBoundingClientRect().width ?? null

// 等捲動容器 scrollLeft 連續 frames 格不變(smooth 捲動跑完);上限內等不到 = 儀器失效
const waitScrollStill = ([scIndex, frames, capMs]) => new Promise((resolve) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  if (!sc) return resolve({ ok: false, reason: 'no-scroller' })
  const t0 = performance.now(); let last = sc.scrollLeft; let still = 0
  const tick = () => {
    const cur = sc.scrollLeft
    if (cur === last) still += 1; else { still = 0; last = cur }
    if (still >= frames) return resolve({ ok: true })
    if (performance.now() - t0 > capMs) return resolve({ ok: false, reason: 'not-still' })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

// selftest 注入:拿掉 primitive 的作用 —— 捲動容器的 scrollTo 變成空函式(useRevealSelected 只透過它捲)
const neutralizeRevealInPage = () => {
  if (window.__revealNeutralized) return
  window.__revealNeutralized = true
  const orig = Element.prototype.scrollTo
  Element.prototype.scrollTo = function (...a) { if (this.hasAttribute && this.hasAttribute('data-overflow-scroller')) return undefined; return orig.apply(this, a) }
}

class Instrument extends StoryRenderInstrumentError {}
const fail = (storyId, reason) => new Instrument({ storyId, kind: 'dom-not-settled', reason })

// ── 主量測 ─────────────────────────────────────────────────────────────────
// neutralize:'none' | 'before-action'(每種輸入動作前一刻注入)。回傳 { cells, totals, selfCuts }
// 以下四個只給 selftest 的對照組用:
//   only   = 只跑這幾排(STRIPS 的 key);inputs = 只跑這幾種輸入(縮放承接點擊,要一起給)
//   starve = 開 story 歸零後先把可視寬撐成「整排塞得下」('fit')或「只切到最後一項」('last-only')—— CI 沒有中文字型時的兩種幾何
//   selfCut= false 關掉「幾何不夠就自備」(重現修之前的行為)
async function scanBuild(staticDir, { fresh = true, neutralize = 'none', log = console.log, only = null, inputs = INPUTS, starve = null, selfCut = true } = {}) {
  if (fresh) requireFreshStorybookBuild(staticDir, SOURCES)
  const server = await startA11yStaticServer({ rootDirectory: staticDir, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip()
  if (!browser) { await server.stop(); return null }
  const cells = []
  const totals = { cells: 0, nonClamped: Object.fromEntries(INPUTS.map((i) => [i, 0])) }
  const selfCuts = []
  const runs = (input) => inputs.includes(input)
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    for (const strip of STRIPS) {
      if (only && !only.includes(strip.key)) continue
      const url = `${server.origin}/iframe.html?id=${encodeURIComponent(strip.story)}&viewMode=story`
      const open = async () => {
        await page.setViewportSize(strip.viewport)
        await page.mouse.move(1, 1)
        await openStory(page, url, { waitFor: strip.open ? 'button' : '[data-overflow-scroller]', settleFrames: 10, notFound: server.notFound })
        if (strip.open) {
          await page.getByRole('button', { name: strip.open }).click()
          await page.waitForSelector(strip.item, { state: 'visible' })
        }
        await page.waitForSelector(`[data-overflow-scroller] ${strip.item}`, { state: 'attached' })
        await still('載入')
        await zero('歸零')
        if (starve) {
          const list = await page.evaluate(listInPage, [strip.scroller, strip.item])
          const last = list[list.length - 1]
          await setVisibleWidth(Math.round(starve === 'fit' ? last.right + 64 : last.right - 4), `對照組幾何(${starve})`)
        }
        if (!selfCut) return
        const plan = overflowPlan(await page.evaluate(listInPage, [strip.scroller, strip.item]))
        if (plan.enough) return
        if (plan.target == null) throw fail(strip.story, `${strip.label} 歸零後沒有可以驗的溢出,也切不出自備幾何 —— ${plan.why}`)
        const got = await setVisibleWidth(plan.target, '自備幾何')
        if (!overflowPlan(await page.evaluate(listInPage, [strip.scroller, strip.item])).enough) throw fail(strip.story, `${strip.label} 把可視寬調成 ${plan.target}px(實得 ${got}px)之後,仍然沒有「不是最後一項、又沒有完整可讀」的項目`)
        if (!selfCuts.some((c) => c.strip === strip.key)) selfCuts.push({ strip: strip.key, label: strip.label, width: got })
      }
      const zero = async (what) => {
        await page.evaluate((i) => { const sc = document.querySelectorAll('[data-overflow-scroller]')[i]; sc.scrollLeft = 0 }, strip.scroller)
        await still(what)
      }
      // 把可視寬調到 targetW(±1px;最多推 4 步)再歸零。回傳實得的寬度
      const setVisibleWidth = async (targetW, what) => {
        let got = null
        for (let k = 0; k < 4; k += 1) {
          if (!(await page.evaluate(nudgeScrollerWidthInPage, [strip.scroller, targetW]))) throw fail(strip.story, `${strip.label} ${what}:找不到捲動容器或它的父層`)
          await still(what)
          got = await page.evaluate(scrollerWidthInPage, strip.scroller)
          if (Math.abs(got - targetW) <= 1) break
        }
        if (Math.abs(got - targetW) > 1) throw fail(strip.story, `${strip.label} ${what}:可視寬調不到 ${targetW}px(停在 ${got}px)`)
        await zero(`${what}後歸零`)
        return Math.round(got)
      }
      const still = async (what) => {
        const r = await page.evaluate(waitScrollStill, [strip.scroller, 12, 6000])
        if (!r.ok) throw fail(strip.story, `${strip.label} ${what}之後捲動容器${r.reason === 'no-scroller' ? '不見了' : '在上限內沒有靜止'}`)
      }
      const before = async () => { if (neutralize === 'before-action') await page.evaluate(neutralizeRevealInPage) }
      const record = async (input, step, targetIndex) => {
        const g = await page.evaluate(measureInPage, [strip.scroller, strip.item, targetIndex])
        if (!g) throw fail(strip.story, `${strip.label} ${input} 量不到第 ${targetIndex + 1} 項`)
        const obstruction = maskObstruction(g.mask, g.width)
        if (obstruction.unparsed) throw fail(strip.story, `${strip.label} 讀不懂遮罩:${g.mask}`)
        const res = judge({ ...g, obstruction }, `${strip.label} × ${input}${step ? ` ${step}` : ''}「${g.label}」`)
        cells.push({ strip: strip.key, input, step, label: g.label, ...res })
        totals.cells += 1
        if (res.how === 'centered' && res.ok) totals.nonClamped[input] += 1
        return res
      }
      // 1. 滑鼠點右側「沒有完整可讀」的項目(伸進右側淡出 / 箭頭區或被容器切掉,而且有點得到的可見部分 —— 使用者真的點得到的那一顆)
      if (runs('click')) {
      await open()
      const hitPick = await page.evaluate(([scIndex, itemSel, widest]) => {
        const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
        const s = sc.getBoundingClientRect()
        const items = [...sc.querySelectorAll(itemSel)]
        for (let i = 0; i < items.length; i += 1) {
          const r = items[i].getBoundingClientRect()
          if (r.right <= s.right - widest || r.left >= s.right) continue // 完整在可讀區(以最寬的遮擋估)或整顆在外
          const y = (r.top + r.bottom) / 2
          for (let x = Math.min(r.right, s.right) - 2; x > Math.max(r.left, s.left); x -= 2) {
            const hit = document.elementFromPoint(x, y)
            if (hit && (hit === items[i] || items[i].contains(hit))) return { i, x, y }
          }
        }
        return null
      }, [strip.scroller, strip.item, WIDEST_OBSTRUCTION_PX])
      if (!hitPick) throw fail(strip.story, `${strip.label} 歸零後找不到右側沒有完整可讀、又點得到的項目(這一排沒有溢出?)`)
      const pi = hitPick.i
      const pt = { x: hitPick.x, y: hitPick.y }
      await before()
      await page.mouse.click(pt.x, pt.y)
      await still('點擊')
      await record('click', '', pi)
      const clickedIndex = pi

      // 2. 縮放視窗(承上:剛點的那一項是上一次揭露的項目)
      if (runs('resize')) {
      const w0 = await page.evaluate((i) => document.querySelectorAll('[data-overflow-scroller]')[i].clientWidth, strip.scroller)
      await before()
      await page.setViewportSize({ width: strip.narrowTo, height: strip.viewport.height })
      await still('縮放視窗')
      let w1 = await page.evaluate((i) => document.querySelectorAll('[data-overflow-scroller]')[i].clientWidth, strip.scroller)
      let how = `視窗 ${strip.viewport.width} → ${strip.narrowTo}`
      if (Math.abs(w1 - w0) < 16) {
        // 展示 story 的外框寫死寬度(或已經是自備幾何),視窗縮放碰不到捲動容器 → 直接改捲動容器的可視寬(同一個觸發:容器尺寸改變)。
        // 改成多少由純函式 resizePlan 從量到的幾何算:縮或放寬都算尺寸改變,選「改完之後那一項仍然需要置中」的那個寬度。
        const geo = await page.evaluate(([i, sel, idx]) => {
          const sc = document.querySelectorAll('[data-overflow-scroller]')[i]
          const s = sc.getBoundingClientRect()
          const r = sc.querySelectorAll(sel)[idx].getBoundingClientRect()
          return { width: sc.clientWidth, itemWidth: r.width, itemCentre: r.left + r.width / 2 - s.left - sc.clientLeft + sc.scrollLeft, content: sc.scrollWidth, scrollLeft: sc.scrollLeft }
        }, [strip.scroller, strip.item, clickedIndex])
        const plan = resizePlan(geo)
        if (!plan) throw fail(strip.story, `${strip.label} 縮放:外框寫死寬度,而可視寬 ${geo.width}px 縮或放寬都放不下剛點的那一項(${geo.itemWidth.toFixed(1)}px)加兩側遮擋`)
        for (let k = 0; k < 4 && Math.abs(w1 - plan.width) > 1; k += 1) {
          await page.evaluate(nudgeScrollerWidthInPage, [strip.scroller, plan.width])
          await still('改容器寬度')
          w1 = Math.round(await page.evaluate(scrollerWidthInPage, strip.scroller))
        }
        how = `外框寫死寬度 → 可視寬 ${plan.width > w0 ? '放寬' : '縮'}到 ${plan.width}px(改寬度前 scrollLeft ${geo.scrollLeft.toFixed(1)}${plan.centres ? '' : ';這個幾何下那一項只能夾在端點'})`
      }
      if (Math.abs(w1 - w0) < 16) throw fail(strip.story, `${strip.label} 縮放後捲動容器寬度沒變(${w0} → ${w1})`)
      await record('resize', `(${how},容器 ${w0} → ${w1})`, clickedIndex)
      }
      }

      // 3. 方向鍵:Tab 進入這一排(或檢視器)後連按 → 每一步都量
      if (runs('keys')) {
      await open()
      const total = (await page.evaluate(listInPage, [strip.scroller, strip.item])).length
      if (strip.keyTarget === 'focus') {
        await page.evaluate(([scIndex]) => {
          const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
          const a = document.createElement('button'); a.textContent = 'probe'; a.id = '__reveal_probe'
          a.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0'
          sc.parentElement.insertBefore(a, sc)
        }, [strip.scroller])
        await page.focus('#__reveal_probe')
        await page.keyboard.press('Tab')
      }
      const steps = Math.min(total - 1, 6)
      for (let k = 0; k < steps; k += 1) {
        await before()
        await page.keyboard.press('ArrowRight')
        await still(`方向鍵第 ${k + 1} 下`)
        const ti = await page.evaluate(([scIndex, itemSel, mode]) => {
          const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
          const items = [...sc.querySelectorAll(itemSel)]
          return mode === 'focus' ? items.indexOf(document.activeElement) : items.findIndex((el) => el.getAttribute('aria-current') === 'true')
        }, [strip.scroller, strip.item, strip.keyTarget])
        if (ti < 0) throw fail(strip.story, `${strip.label} 方向鍵第 ${k + 1} 下之後找不到${strip.keyTarget === 'focus' ? '焦點所在的項目' : '目前那一項(aria-current)'}`)
        await record('keys', `第 ${k + 1} 下`, ti)
      }
      }

      // 4. ⌄ 選單選取:第一個沒有完整可讀的項目(伸進右側淡出區或在容器外;不是最後一項)、最後一項
      if (strip.menu && runs('menu')) {
        for (const which of ['partial', 'last']) {
          await open()
          const list = await page.evaluate(listInPage, [strip.scroller, strip.item])
          const ti = which === 'last' ? list.length - 1 : list.findIndex((it, i) => i < list.length - 1 && it.right > it.scW - MENU_FADE_PX)
          if (ti < 0) throw fail(strip.story, `${strip.label} 選單:找不到${which === 'last' ? '最後一項' : '沒有完整可讀的項目'}`)
          const trigger = page.locator(`button[aria-label^="${strip.menu}"]`).first()
          if (await trigger.count() === 0) throw fail(strip.story, `${strip.label} 找不到 ⌄ 觸發鈕(aria-label 開頭「${strip.menu}」)`)
          await trigger.click()
          const option = page.locator('[role="menu"] [role^="menuitem"]', { hasText: list[ti].label }).first()
          await option.waitFor({ state: 'visible', timeout: 5000 })
          await before()
          await option.click()
          await page.locator('[role="menu"]').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
          await still('選單選取')
          await record('menu', which === 'last' ? '(最後一項)' : '(第一個沒有完整可讀的項目)', ti)
        }
      }
      const cut = selfCuts.find((c) => c.strip === strip.key)
      log(`  ${strip.label}:${cells.filter((c) => c.strip === strip.key).map((c) => `${c.input}${c.ok ? '✓' : '✗'}`).join(' ')}${cut ? `  〔自備幾何:這台機器的字寬下這一排沒有溢出到中間的項目,可視寬改成 ${cut.width}px 再量〕` : ''}`)
    }
  } finally { await browser.close(); await server.stop() }
  return { cells, totals, selfCuts }
}

export function instrumentProblems(totals) {
  const problems = []
  if (totals.cells === 0) problems.push('一格都沒量到')
  for (const input of INPUTS) if (!totals.nonClamped[input]) problems.push(`輸入「${input}」沒有任何一格「需要置中」的量測(全是夾住或沒量到 —— 置中這條從沒被驗過)`)
  return problems
}

// ── selftest ───────────────────────────────────────────────────────────────
async function selftest() {
  let ok = true
  const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) ok = false }
  const G = (o) => ({ left: 100, right: 160, width: 260, scrollLeft: 50, maxScroll: 300, obstruction: { left: 48, right: 48 }, arrowOverlap: false, ...o })
  // 判定表
  check(judge(G({})).ok && judge(G({})).how === 'centered', '判定表:中心正好在容器中心 → 綠(centered)')
  check(judge(G({ left: 101.5, right: 161.5 })).ok, '判定表:偏 1.5px(容差內)→ 綠')
  check(judge(G({ left: 103, right: 163 })).kind === 'off-center', '判定表:偏 3px、不在兩端 → off-center')
  check(judge(G({ left: 10, right: 70, scrollLeft: 0, obstruction: { left: 0, right: 48 } })).how === 'clamped-start', '判定表:在起點(scrollLeft 0)、項目在左半邊、完整可讀 → 合法夾住')
  check(judge(G({ left: 190, right: 250, scrollLeft: 300, obstruction: { left: 48, right: 0 } })).how === 'clamped-end', '判定表:在終點、項目在右半邊 → 合法夾住')
  check(judge(G({ left: 190, right: 250, scrollLeft: 120 })).kind === 'unreadable', '判定表:右側淡出區裡(修前 Tabs 方向鍵:落在箭頭 + 淡出底下)→ unreadable')
  check(judge(G({ arrowOverlap: true })).kind === 'unreadable', '判定表:被箭頭蓋住 → unreadable')
  check(judge(G({ left: 190, right: 250, scrollLeft: 0, obstruction: { left: 0, right: 0 } })).kind === 'off-center', '判定表:在起點但項目在右半邊(本來就該往右捲)→ 不算夾住、off-center')
  // 遮罩解析
  const M = (s) => maskObstruction(s, 300)
  check(JSON.stringify(M('linear-gradient(to right, transparent 0, transparent 32px, black 48px, black calc(100% - 48px), transparent calc(100% - 32px), transparent 100%)')) === JSON.stringify({ left: 48, right: 48 }), '遮罩:scroll 模式兩側 32 + 16 → 48 / 48')
  check(JSON.stringify(M('linear-gradient(to right, black 0, black calc(100% - 16px), transparent 100%)')) === JSON.stringify({ left: 0, right: 16 }), '遮罩:menu 模式在起點 → 0 / 16')
  check(JSON.stringify(M('linear-gradient(to right, rgba(0, 0, 0, 0) 0px, rgb(0, 0, 0) 16px, rgb(0, 0, 0) calc(100% - 16px), rgba(0, 0, 0, 0) 100%)')) === JSON.stringify({ left: 16, right: 16 }), '遮罩:瀏覽器序列化成 rgb / rgba 也認得')
  check(JSON.stringify(M('none')) === JSON.stringify({ left: 0, right: 0 }), '遮罩:沒有遮罩 → 0 / 0')
  check(M('linear-gradient(to right, red, blue)').unparsed === true, '遮罩:讀不懂的形狀 → unparsed(呼叫端當儀器失效)')
  // 幾何夠不夠驗(overflowPlan):L(右緣陣列, 可視寬) 造一排等寬 40、間距 8 的項目
  const L = (n, scW, w = 40, gap = 8) => Array.from({ length: n }, (_, i) => ({ left: i * (w + gap), right: i * (w + gap) + w, scW }))
  check(overflowPlan(L(8, 200)).enough === true, '幾何:8 項、可視寬 200(第 5 項被切)→ 夠,照天然排版量')
  check(overflowPlan(L(8, 400)).enough === false && overflowPlan(L(8, 400)).target === 164, '幾何:整排 376px 塞得進 400(CI 沒有中文字型的 Tabs)→ 不夠,可視寬改成 164(第 4 項的中心:它剛好被切一半)')
  check(overflowPlan(L(8, 372)).enough === false && overflowPlan(L(8, 372)).target === 164, '幾何:只切到最後一項 → 不夠(最後一項被選時本來就夾在終點,驗不到置中),一樣改成 164')
  check(overflowPlan(L(8, 371)).enough === false && overflowPlan(L(8, 345)).enough === false && overflowPlan(L(8, 343)).enough === true, '幾何:邊界 —— 倒數第二項右緣 328,可視寬 345(328 > 345−16 不成立)不夠、343 夠')
  check(overflowPlan(L(4, 1000, 120)).target === 224, '幾何:4 項 × 120px → 中間那一項的中心 188 不夠寬,下限 = 最寬的項目 120 + 兩側遮擋 96 + 8 = 224')
  check(overflowPlan(L(3, 400, 100)).target === 204, '幾何:3 項 × 100px → 下限 204 ≤ 上限(倒數第二項右緣 208 + 8)→ 204')
  check(overflowPlan(L(3, 400, 60)).target === null && /太短/.test(overflowPlan(L(3, 400, 60)).why), '幾何:3 項 × 60px(下限 164 > 上限 136)→ 切不出來,原因講明')
  check(overflowPlan(L(2, 400)).target === null && overflowPlan([]).target === null, '幾何:只有 2 項 / 量不到項目 → 切不出來(呼叫端當儀器失效)')
  // 縮放退路的寬度(resizePlan)
  const natural = resizePlan({ width: 286, itemWidth: 70, itemCentre: 300, content: 520 })
  check(natural?.width === 222 && natural.centres === true, '縮放寬度:天然排版(可視寬 286)→ 縮 64 到 222,那一項仍需置中')
  check(resizePlan({ width: 174, itemWidth: 62, itemCentre: 116, content: 420 })?.width === 206, '縮放寬度:自備幾何 174 —— 縮 64 / 32 放不下那一項加遮擋、放寬 64 會夾在起點(116 − 119 < 0)→ 放寬 32 到 206(116 − 103 = 13,在中心)')
  const pinned = resizePlan({ width: 174, itemWidth: 62, itemCentre: 80, content: 420 })
  check(pinned?.centres === false && pinned.width === 238, '縮放寬度:那一項太靠起點、怎麼改都夾住 → 退而取第一個放得下的寬度,標明不是置中')
  check(resizePlan({ width: 120, itemWidth: 200, itemCentre: 300, content: 900 }) === null, '縮放寬度:縮或放寬都放不下那一項 → null(呼叫端當儀器失效)')
  const cutAt = (list, w) => list.map((it) => ({ ...it, scW: w }))
  check([L(8, 400), L(8, 372), L(4, 1000, 120), L(3, 400, 100)].every((l) => overflowPlan(cutAt(l, overflowPlan(l).target)).enough === true), '幾何:照回傳的可視寬切完再問一次 → 都夠(回傳值自己滿足自己的條件)')
  check(instrumentProblems({ cells: 0, nonClamped: { click: 0, keys: 0, menu: 0, resize: 0 } }).length === 5, '儀器失效:零格 + 四種輸入都沒有置中量測 → 五條')
  check(instrumentProblems({ cells: 20, nonClamped: { click: 3, keys: 9, menu: 2, resize: 4 } }).length === 0, '儀器失效:四種輸入都有置中量測 → 不報')
  // 真建置
  requireStorybookBuild(path.join(STATIC, 'index.json'))
  requireFreshStorybookBuild(STATIC, SOURCES)
  const clean = await scanBuild(STATIC, { fresh: false, log: () => {} })
  if (clean === null) return ok
  check(clean.cells.every((c) => c.ok) && instrumentProblems(clean.totals).length === 0, `現況:${clean.cells.length} 格全綠、四種輸入都有置中量測`)
  // 對照組:每種輸入動作前一刻拿掉 primitive 的作用 → 每一排每種輸入都要紅
  const broken = await scanBuild(STATIC, { fresh: false, neutralize: 'before-action', log: () => {} })
  const want = STRIPS.flatMap((s) => INPUTS.filter((i) => i !== 'menu' || s.menu).map((i) => `${s.key}|${i}`))
  const red = new Set(broken.cells.filter((c) => !c.ok).map((c) => `${c.strip}|${c.input}`))
  const missed = want.filter((k) => !red.has(k))
  check(missed.length === 0, `對照組(拿掉 primitive 呼叫):${want.length} 個「排 × 輸入」應紅,${want.length - missed.length} 個紅${missed.length ? `(沒紅:${missed.join(', ')})` : ''}`)
  // 對照組(幾何不靠字型):把可視寬撐成 CI 沒有中文字型時的兩種樣子,自備幾何關 / 開各跑一次
  const quiet = { fresh: false, log: () => {} }
  const instrumentRed = async (opts) => { try { await scanBuild(STATIC, { ...quiet, ...opts }); return null } catch (e) { if (e instanceof StoryRenderInstrumentError) return e.message; throw e } }
  const redMenu = await instrumentRed({ only: ['tabs-menu'], inputs: ['menu'], starve: 'last-only', selfCut: false })
  check(redMenu !== null && redMenu.includes('找不到沒有完整可讀的項目'), `對照組(只切到最後一項、自備幾何關):Tabs menu 的選單那步重現 9126e95b 在 CI 的紅${redMenu ? '' : '(沒紅)'}`)
  const redClick = await instrumentRed({ only: ['tabs-scroll'], inputs: ['click'], starve: 'fit', selfCut: false })
  check(redClick !== null && redClick.includes('找不到右側沒有完整可讀'), `對照組(整排塞得下、自備幾何關):Tabs scroll 的點擊找不到半露的項目 → 儀器失效${redClick ? '' : '(沒紅)'}`)
  const lastOnly = await scanBuild(STATIC, { ...quiet, only: ['chip-menu', 'tabs-menu'], inputs: ['menu'], starve: 'last-only' })
  const partial = lastOnly.cells.filter((c) => c.step.includes('第一個'))
  check(lastOnly.cells.length === 4 && lastOnly.cells.every((c) => c.ok) && partial.length === 2 && partial.every((c) => c.how === 'centered') && lastOnly.selfCuts.length === 2,
    `對照組(只切到最後一項、自備幾何開):Chip menu / Tabs menu 的選單 4 格都量到、全綠,兩格「第一個沒有完整可讀的項目」在中心(實得 ${lastOnly.cells.map((c) => `${c.strip}:${c.how}${c.ok ? '' : '✗'}`).join(' ')};自備幾何 ${lastOnly.selfCuts.length} 排)`)
  const fit = await scanBuild(STATIC, { ...quiet, only: ['tabs-scroll', 'tabs-menu'], starve: 'fit' })
  const fitBad = fit.cells.filter((c) => !c.ok)
  const fitGaps = INPUTS.filter((i) => !fit.totals.nonClamped[i])
  check(fitBad.length === 0 && fitGaps.length === 0 && fit.selfCuts.length === 2,
    `對照組(整排塞得下、自備幾何開):Tabs scroll / Tabs menu ${fit.cells.length} 格全綠,四種輸入都有「需要置中」的格子(${INPUTS.map((i) => `${i} ${fit.totals.nonClamped[i]}`).join('、')})${fitBad.length ? `;紅:${fitBad.map((c) => c.text).join(' / ')}` : ''}${fitGaps.length ? `;沒有置中量測:${fitGaps.join('、')}` : ''}`)
  if (CONTROL_STATIC) {
    const before = await scanBuild(CONTROL_STATIC, { fresh: false, log: () => {} })
    const r = new Set(before.cells.filter((c) => !c.ok).map((c) => `${c.strip}|${c.input}`))
    const expect = ['chip-scroll|click', 'chip-menu|click', 'tabs-scroll|click', 'tabs-menu|click', 'tabs-scroll|keys', 'chip-scroll|resize', 'tabs-scroll|resize']
    const miss = expect.filter((k) => !r.has(k))
    check(miss.length === 0, `對照組(修前建置 ${path.basename(CONTROL_STATIC)}):紅 ${[...r].sort().join(' / ')}${miss.length ? `;該紅沒紅:${miss.join(', ')}` : ''}`)
  } else {
    console.log('  (沒有 --control-static:修前建置的對照組略過;CI 靠判定表與「拿掉 primitive 呼叫」注入兩面)')
  }
  return ok
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    if (ARGS.includes('--selftest')) {
      const ok = await selftest()
      console.log(ok ? '✅ overflow-reveal-selected selftest PASS' : '❌ overflow-reveal-selected selftest FAIL')
      process.exit(ok ? 0 : 1)
    }
    const result = await scanBuild(STATIC)
    if (result === null) process.exit(0) // launchBrowserOrSkip 已印 SKIPPED-ENV / BROWSER-REQUIRED 判定
    const problems = instrumentProblems(result.totals)
    if (problems.length) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${problems.join(';')} —— 儀器失效,不當綠燈`); process.exit(1) }
    const bad = result.cells.filter((c) => !c.ok)
    if (bad.length) {
      console.error(`❌ overflow-reveal-selected FAIL(${bad.length} / ${result.cells.length} 格):\n  ${bad.map((c) => c.text).join('\n  ')}`)
      process.exit(1)
    }
    const n = result.totals.nonClamped
    console.log(`✅ overflow-reveal-selected PASS(${result.cells.length} 格:${STRIPS.length} 排 × 點擊 / 方向鍵 / 選單 / 縮放;需要置中的 點擊 ${n.click}、方向鍵 ${n.keys}、選單 ${n.menu}、縮放 ${n.resize} 格全在中心 ±${CENTER_TOLERANCE_PX}px,其餘合法夾住且完整可讀${result.selfCuts.length ? `;${result.selfCuts.map((c) => c.label).join('、')} 用自備幾何量` : ''})`)
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${error.message}`); process.exit(1) }
    throw error
  }
}
