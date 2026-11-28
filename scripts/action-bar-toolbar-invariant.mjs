#!/usr/bin/env node
/**
 * 資料工具列(左搜尋 / 右操作)窄寬度不變條件(2026-09-16,user 抓 AgentPanel 示範的搜尋框把「新增任務」推出表格右緣)。
 *
 * SSOT:`patterns/action-bar/action-bar.spec.md`「七、空間不足時的降級 → 搜尋框」+ `stories-helpers/scene/data-toolbar.tsx`。
 * 根因:搜尋框外層沒有明確下限,瀏覽器排版預設「格子不得比自己的內容窄」讓它卡在原生 input 的 20 字元寬(204px),
 * 列不換行、不裁切 → 空間不夠時整列往右溢出。量的是像素不是 class(M32):每支消費 DataToolbar 的示範 × 五個視窗寬,
 *   (1) 列不溢出:scrollWidth ≤ clientWidth;
 *   (2) 最後一顆操作鈕右緣 = 列的內容右緣(±1);
 *   (3) 搜尋框寬 ≥ 下限(讀 data-toolbar-search 的 computed min-width,不寫死 160);
 *   (4) 搜尋框寬 ≤ 上限(2026-11-26 起,user 畫面確認選「甲:上限改 320px(Tailwind max-w-xs)」)——
 *       上限值**從規格讀**:action-bar.spec.md 七「搜尋框」表格的「| 上限 = Npx」那一列,不在閘裡寫第二份;
 *       不讀 computed max-width 當標準(那是被驗的東西本身:示範改回 384 時它也跟著變 384,閘會跟著綠 —— M37 代理);
 *   (5) 空間放得下上限(內容寬 ≥ 上限 + gap + 操作群寬)的格子,搜尋框要撐到上限(±1)—— 守「撐開到上限」這一半,
 *       而且這種格子至少要量到一格,否則 (5) 從沒被執行過(沒量到 ≠ 沒問題)。
 * 空間夠(內容寬 ≥ 下限 + gap + 操作群寬)時 (1)(2)(3)(4) 全部必成立;空間連下限都放不下時(操作鈕多的列在極窄寬度)
 * 只驗 (3) 下限守住與 (4) 不超過上限,並把該格印成「已知極窄極限」(不算失敗、也不靜默 —— action-bar.spec.md 七:本輪不收合搜尋框)。
 * 對照組(--selftest,兩組各跑一輪、各自必紅):
 *   · 下限:注入 `[data-toolbar-search]{min-width:auto!important}`(拿掉下限 = 修前狀態)→ 空間夠的格子裡至少一格 (1) 或 (2) 必紅;
 *   · 上限:注入 `[data-toolbar-search]{max-width:384px!important}`(改回舊值 384)→ 至少一格 (4) 必紅。
 *
 * 「收合」段(2026-11-27 H31;SSOT:action-bar.spec.md 七「群組溢出的操作列」的「量法 = useOverflowCollapse」):
 *   test-only story「收合量測:群組溢出」(富文字工具列:格式 / 插入 / 段落三群各一顆觸發鈕 + 單一按鈕的「全螢幕」群組)。
 *   把第一個 [data-collapse-frame] 的寬從 COLLAPSE_SWEEP.from 每 1px 改到 .to,每一格(兩個 rAF 之後)量:
 *   (C1) 不溢出:看得見的子項連外距 + 欄距 ≤ 內容寬;
 *   (C2) 收起的 = 依 priority(小的先、同值索引大的先)排出的前 k 個(story 把 priority / group 寫在 data-collapse-*);
 *   (C3) 有觸發鈕的組:觸發鈕看得見 ⇔ 該組有收起的項目;
 *   (C4) **全部放得下(全部攤開的自然寬 ≤ 內容寬)⇒ 一個都不收、沒有任何觸發鈕** —— 「放得下不扣觸發鈕寬」;
 *   (C5) 有收的時候最少:把最後收的那一個放回去就放不下(放回去要的寬 = 它的寬 + 欄距,它是該組唯一收起的就扣掉觸發鈕,
 *        它讓沒有觸發鈕的組重新出現就加回分隔線)。收起的項目量自然寬:複製一份絕對定位、看不見地放進同一個容器量完即刪。
 *   覆蓋(沒量到 ≠ 沒問題):掃描裡必須看到「全部攤開」「只有一組出觸發鈕」「兩組以上出觸發鈕」「全螢幕整組隱藏、分隔線一起藏」四種狀態,
 *   以及至少一格「全部放得下、但連觸發鈕就放不下」(C4 的要害那一段);少一種 = 儀器失效。
 *   對照組(--selftest):攔 story 的程式(assets/*.js),把 decideCollapsedCount 的「k = 0 不算觸發鈕」守門改成
 *   永遠算進收起 1 個時的觸發鈕寬(= 修前 useOverflowIndices「永遠扣觸發鈕寬」);改到 0 處 = 儀器失效。必須至少一格 (C4) 或 (C5) 紅。
 *
 * 開 story(2026-09-25 起):共用的 openStory(lib/launch-browser.mjs)—— Storybook 回報渲染完成、畫面健康、
 * **被量的東西**(搜尋框與它同列的操作群最後一顆鈕)出現、版面連續靜止 10 個影格,並在最後一個靜止影格的
 * 同一個 task 裡量(probe)。取代舊的 gotoStory + 固定睡 900ms(「已渲染」與「版面已穩」的代理)。
 * 開不起來 / 等不到工具列 → INSTRUMENT-FAIL 點名該格(示範 × 寬度)、列同源 404 —— 舊版把同一件事印成
 * 「找不到 data-toolbar-search(示範沒有消費 DataToolbar?)」,在 story 檔 404 時指控示範(實測)。
 * 「等元素而不是睡一段時間」本身的對照組(晚到 3 秒的 story 檔:固定睡眠看不到、openStory 等得到)
 * 跟著共用實作住在 scripts/test-open-story.mjs(M17:一份實作、一份對照組),不在本閘重抄。
 * 用法:node scripts/action-bar-toolbar-invariant.mjs [--static=<dir>] [--selftest]
 */
import fs from 'node:fs'; import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { INSTRUMENT_FAIL_MARKER, launchBrowser, openStory, requireFreshStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
const root = path.resolve(REPO, arg('static', 'storybook-static'))
// 建置存在、且不比被驗的原始碼舊:lib/launch-browser.mjs requireFreshStorybookBuild(全部瀏覽器閘同一份;2026-09-27,待辦總帳 C5)
requireFreshStorybookBuild(root, [
  'packages/design-system/src/stories-helpers/scene/data-toolbar.tsx',
  // 「收合」段量的是這兩個檔的產物
  'packages/design-system/src/hooks/use-overflow-items.ts',
  'packages/design-system/src/patterns/action-bar/action-bar.stories.tsx',
], { hint: '先 build storybook(或用 --static=<dir> 指定)' })
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
// story 清單也讀同一份快照,不讀活目錄(否則清單與實際供檔可能來自兩份建置)
const index = JSON.parse(fs.readFileSync(path.join(server.snapshot?.dir ?? root, 'index.json'), 'utf8'))
// 上限的規格值(檔頭 (4)):action-bar.spec.md 七「搜尋框」表格「| 上限 = Npx」那一列。讀不到 = 儀器失效(不是通過)。
const SPEC_PATH = 'packages/design-system/src/patterns/action-bar/action-bar.spec.md'
const capRow = fs.readFileSync(path.join(REPO, SPEC_PATH), 'utf8').match(/^\| 上限 = (\d+)px/mu)
if (!capRow) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${SPEC_PATH} 七「搜尋框」找不到「| 上限 = Npx」那一列 —— 讀不到規格的上限值,不能驗 (4)(5)`)
  await server.stop()
  process.exit(1)
}
const CAP = Number(capRow[1])
// 對照組:每組 = 注入的樣式 + 它要讓哪一條紅(兩組各跑一輪,互不混在同一輪裡 —— 各自證明各自的判定會紅)
const SABOTAGES = [
  { name: '拿掉搜尋框下限', css: '[data-toolbar-search]{min-width:auto!important}', expect: '(1) 或 (2)' },
  { name: '上限改回 384', css: '[data-toolbar-search]{max-width:384px!important}', expect: '(4)' },
]
// 四支消費 DataToolbar 的整頁示範(少一支 = 有人把示範改回手抄,閘要紅)
const WANT = [/agentpanel-展示--url-registry-demo$/u, /datatable-展示--with-bulk-actions$/u, /datatable-展示--roadmap-all-in-one$/u, /appshell-展示--primary-sidebar-with-tabs$/u]
const STORIES = WANT.map((re) => Object.values(index.entries).find((e) => e.type === 'story' && re.test(e.id))?.id)
const WIDTHS = [320, 360, 400, 480, 768]
// AppShell 的示範(2026-10-14 起):Main 有最小寬 600(app-shell.spec.md「版面規則」§1、§8),視窗比它窄時整個殼水平捲、工具列寬停在
// Main 最小寬 —— 320–768 這幾格量到的都是同一個寬,量不到想量的情況(D:30 清單 #108)。改取「Main 真的會變寬變窄」的視窗寬:
// 1024(Menu 收成細列、Main 守 600)、1280、1600(Menu 與詳情並排,Main 隨視窗變寬)。
const WIDTHS_FOR = (id) => (/appshell-展示--/u.test(id ?? '') ? [1024, 1280, 1600] : WIDTHS)
// 頁面端(openStory 的 waitFor):**被量的東西**都在了 —— 搜尋框,以及它同一列的操作群裡至少一顆鈕(PROBE 量的就是這兩個)
const TOOLBAR_READY = () => Boolean(document.querySelector('[data-toolbar-search]')?.parentElement?.querySelector('[data-toolbar-actions]')?.lastElementChild)
// 頁面端(openStory 的 probe:最後一個靜止影格的同一個 task 裡執行;以原始碼序列化傳入,不得引用外部變數)
const PROBE = () => {
  const search = document.querySelector('[data-toolbar-search]')
  if (!search) return { missing: 'data-toolbar-search' }
  const toolbar = search.parentElement
  const actions = toolbar.querySelector('[data-toolbar-actions]')
  const last = actions?.lastElementChild
  if (!actions || !last) return { missing: 'data-toolbar-actions' }
  const cs = getComputedStyle(toolbar)
  const T = toolbar.getBoundingClientRect(), A = actions.getBoundingClientRect(), L = last.getBoundingClientRect(), S = search.getBoundingClientRect()
  const padR = parseFloat(cs.paddingRight), padL = parseFloat(cs.paddingLeft), gap = parseFloat(cs.columnGap || cs.gap || '0')
  const minW = parseFloat(getComputedStyle(search).minWidth)
  const contentW = toolbar.clientWidth - padL - padR
  return { clientW: toolbar.clientWidth, scrollW: toolbar.scrollWidth, contentW, searchW: Math.round(S.width), minW, opsW: Math.round(A.width), gap,
    lastRight: Math.round(L.right * 10) / 10, contentRight: Math.round((T.right - padR) * 10) / 10, fits: contentW >= minW + gap + A.width }
}
// ── 「收合」段(檔頭 C1–C5)────────────────────────────────────────────────
const COLLAPSE_ID = Object.values(index.entries).find((e) => e.type === 'story' && /patterns-action-bar--collapse-measure-contract$/u.test(e.id))?.id
const COLLAPSE_SWEEP = { from: 760, to: 120 }
/** 量測容差(px):只吃次像素 */
const COLLAPSE_EPS = 0.5
const COLLAPSE_READY = () => Boolean(document.querySelector('[data-collapse-frame] [data-collapse-toolbar] [data-collapse-item]'))
// 頁面端:把框寬改成 w、等兩個 rAF(hook 的 ResizeObserver 回呼在畫面前跑、flushSync 定案)
const SET_FRAME_WIDTH = async (w) => {
  document.querySelector('[data-collapse-frame]').style.width = `${w}px`
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}
// 頁面端:量此刻的工具列(以原始碼序列化傳入,不得引用外部變數)
const PROBE_COLLAPSE = () => {
  const bar = document.querySelector('[data-collapse-frame] [data-collapse-toolbar]')
  if (!bar) return { missing: 'data-collapse-toolbar' }
  const cs = getComputedStyle(bar)
  const gap = parseFloat(cs.columnGap) || 0
  const outer = (el) => { const s = getComputedStyle(el); return el.getBoundingClientRect().width + (parseFloat(s.marginLeft) || 0) + (parseFloat(s.marginRight) || 0) }
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).position !== 'absolute'
  // 看不見的(收起的項目 / 沒出的觸發鈕 / 藏起的分隔線)量自然寬:複製一份、拿掉 hidden、絕對定位看不見地放進同一個容器,量完即刪
  const natural = (el) => {
    const c = el.cloneNode(true); c.hidden = false; c.style.position = 'absolute'; c.style.visibility = 'hidden'
    bar.appendChild(c); const w = outer(c); c.remove(); return w
  }
  const contentW = bar.getBoundingClientRect().width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
    - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0)
  const kids = Array.from(bar.children).filter(shown)
  const used = kids.reduce((s, el) => s + outer(el), 0) + gap * Math.max(0, kids.length - 1)
  const items = Array.from(bar.querySelectorAll('[data-collapse-item]')).map((el) => ({
    i: Number(el.dataset.collapseItem), priority: Number(el.dataset.collapsePriority), group: el.dataset.collapseGroup,
    hidden: !shown(el), w: shown(el) ? outer(el) : natural(el),
  }))
  const pick = (sel, key) => Object.fromEntries(Array.from(bar.querySelectorAll(sel)).map((el) => [el.dataset[key], { shown: shown(el), w: shown(el) ? outer(el) : natural(el) }]))
  return { contentW, used, gap, items, triggers: pick('[data-collapse-trigger]', 'collapseTrigger'), dividers: pick('[data-collapse-divider]', 'collapseDivider') }
}
/** 一格量到的值 → C1–C5 的判定(現況與對照組共用) */
function judgeCollapse(m, eps = COLLAPSE_EPS) {
  const order = [...m.items].sort((a, b) => a.priority - b.priority || b.i - a.i)
  const k = order.filter((o) => o.hidden).length
  const collapsedIn = (g) => order.filter((o) => o.hidden && o.group === g).length
  const shownTriggers = Object.entries(m.triggers).filter(([, t]) => t.shown).map(([g]) => g)
  // 全部攤開的自然寬:此刻的寬 + 收起項目 − 看得見的觸發鈕 + 藏起的分隔線(各連一個欄距)
  let natural = m.used
  for (const o of order) if (o.hidden) natural += o.w + m.gap
  for (const g of shownTriggers) natural -= m.triggers[g].w + m.gap
  for (const d of Object.values(m.dividers)) if (!d.shown) natural += d.w + m.gap
  const allFit = natural <= m.contentW + eps
  // C4 的要害那一段:全部放得下,但連最先收的那一組的觸發鈕就放不下(修前「永遠扣觸發鈕寬」在這一段會收)
  const firstGroupTrigger = m.triggers[order[0]?.group]
  const tight = allFit && Boolean(firstGroupTrigger) && natural + firstGroupTrigger.w + m.gap > m.contentW + eps
  let minimal = true
  if (k >= 1) {
    const last = order[k - 1]
    let need = last.w + m.gap
    if (m.triggers[last.group] && collapsedIn(last.group) === 1) need -= m.triggers[last.group].w + m.gap
    if (!m.triggers[last.group] && m.dividers[last.group] && !m.dividers[last.group].shown) need += m.dividers[last.group].w + m.gap
    minimal = m.used + need > m.contentW + eps
  }
  const hiddenDividerGroups = Object.entries(m.dividers).filter(([, d]) => !d.shown).map(([g]) => g)
  // 全部都收了還放不下 = 已知極窄極限(剩觸發鈕與分隔線;hook 沒有東西可再收),C1 不判、另外計數印出
  const exhausted = k === order.length && m.used > m.contentW + eps
  return {
    k, allFit, tight, natural, shownTriggers, hiddenDividerGroups, exhausted,
    noOverflow: m.used <= m.contentW + eps || exhausted, // C1
    prefixOk: order.every((o, n) => o.hidden === (n < k)), // C2
    triggerOk: Object.entries(m.triggers).every(([g, t]) => t.shown === collapsedIn(g) > 0), // C3
    allFitNoCollapse: !allFit || (k === 0 && shownTriggers.length === 0), // C4
    minimal, // C5
    detail: `內容寬 ${m.contentW.toFixed(2)} / 此刻 ${m.used.toFixed(2)} / 自然寬 ${natural.toFixed(2)} / 收起 ${k} 個 / 觸發鈕 [${shownTriggers.join(',')}]`,
  }
}
// 對照組:story 程式裡 decideCollapsedCount 的「k = 0 不算觸發鈕」守門(壓縮後識別字會換名,屬性名 triggerWidth 留著)
const COLLAPSE_GUARD = /([A-Za-z_$][\w$]*)\s*===\s*0\s*\|\|\s*([A-Za-z_$][\w$]*)\s*\+\s*([A-Za-z_$][\w$]*)\.triggerWidth\(\s*\1\s*\)/g
let collapsePatched = 0
const collapsePatchRoute = async (route) => {
  const res = await route.fetch()
  const body = await res.text()
  // 改成永遠把「收起 1 個時的觸發鈕寬」算進去 = 修前「全部放得下也照扣觸發鈕寬」
  const next = body.replace(COLLAPSE_GUARD, (_, k, content, input) => { collapsePatched++; return `${content}+${input}.triggerWidth(Math.max(${k},1))` })
  await route.fulfill({ response: res, body: next })
}
const ASSET_JS = /\/assets\/.*\.js(?:\?.*)?$/u
/** 量「收合」一輪(patched = 對照組);回傳每一格的判定,或 { instrument } */
async function measureCollapse(patched) {
  if (!COLLAPSE_ID) return { instrument: '建置裡找不到「收合量測:群組溢出」story(patterns-action-bar--collapse-measure-contract)' }
  collapsePatched = 0
  if (patched) await page.route(ASSET_JS, collapsePatchRoute)
  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    try {
      await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(COLLAPSE_ID)}&viewMode=story`, { waitFor: COLLAPSE_READY, settleFrames: 10, notFound: server.notFound })
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      return { instrument: `收合 story 開不起來:${error.message}` }
    }
    if (patched && collapsePatched === 0) return { instrument: '送到瀏覽器的程式裡找不到 decideCollapsedCount 的「k = 0 不算觸發鈕」守門(改到 0 處)' }
    const cells = []
    for (let w = COLLAPSE_SWEEP.from; w >= COLLAPSE_SWEEP.to; w--) {
      await page.evaluate(SET_FRAME_WIDTH, w)
      const m = await page.evaluate(PROBE_COLLAPSE)
      if (m.missing) return { instrument: `框寬 ${w}px:${m.missing} 不見了` }
      cells.push({ w, ...judgeCollapse(m) })
    }
    return { cells }
  } finally {
    if (patched) await page.unroute(ASSET_JS).catch(() => {})
  }
}
/** 覆蓋:四種狀態 + C4 的要害那一段都要量到(沒量到 ≠ 沒問題) */
function collapseCoverage(cells) {
  const missing = []
  if (!cells.some((c) => c.k === 0 && c.allFit)) missing.push('全部攤開')
  if (!cells.some((c) => c.k >= 1 && c.shownTriggers.length === 1)) missing.push('只有一組出觸發鈕')
  if (!cells.some((c) => c.shownTriggers.length >= 2)) missing.push('兩組以上出觸發鈕')
  if (!cells.some((c) => c.hiddenDividerGroups.length >= 1)) missing.push('單一按鈕的群組整組隱藏、分隔線一起藏')
  if (!cells.some((c) => c.tight)) missing.push('全部放得下、但連觸發鈕就放不下的那一段')
  return missing
}
const COLLAPSE_CHECKS = [['noOverflow', 'C1 列溢出'], ['prefixOk', 'C2 收起的不是 priority 排序的前 k 個'], ['triggerOk', 'C3 觸發鈕與「該組有沒有收」對不上'],
  ['allFitNoCollapse', 'C4 全部放得下卻收了 / 出了觸發鈕'], ['minimal', 'C5 放回最後收的那一個仍放得下(多收了)']]

const browser = await launchBrowser(); const page = await browser.newPage({ viewport: { width: 768, height: 900 } })
let failed = 0
/** 沒量到的格子(story 開不起來 / 等不到工具列):儀器失效,不是產品裁決,也絕不算通過 */
const instrumentFails = []
const rec = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++ }
/** 一格量到的值 → (1)–(5) 各條的判定(現況與對照組共用同一份判定,對照組才證明得了「這份判定會紅」) */
const judge = (label, r) => {
  const floorDefined = Number.isFinite(r.minW) && r.minW > 0
  return {
    label, fits: r.fits,
    noOverflow: r.scrollW <= r.clientW, // (1)
    aligned: Math.abs(r.lastRight - r.contentRight) <= 1, // (2)
    floorDefined, floorHeld: floorDefined && r.searchW >= r.minW - 1, // (3)
    capHeld: r.searchW <= CAP + 1, // (4)
    roomy: r.contentW >= CAP + r.gap + r.opsW, reachedCap: r.searchW >= CAP - 1, // (5)
    detail: `內容寬 ${r.contentW} / 搜尋 ${r.searchW}(下限 ${r.minW}、上限 ${CAP}) / 操作群 ${r.opsW} / 鈕右 ${r.lastRight} vs 內容右 ${r.contentRight}`,
  }
}
/** 量一輪(sabotage = null 是現況,否則是 SABOTAGES 其中一組);回傳量到的每一格,沒量到的記進 instrumentFails */
async function measurePass(sabotage) {
  const cells = []
  for (const [i, id] of STORIES.entries()) {
    if (!id) { rec(false, `找不到示範 story:${WANT[i]}`); continue }
    const name = id.replace(/^design-system-components-/u, '')
    for (const w of WIDTHS_FOR(id)) {
      await page.setViewportSize({ width: w, height: 900 })
      let r
      let floor = NaN
      try {
        const opened = await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, {
          waitFor: TOOLBAR_READY,
          // 對照組:在靜止判定**之前**注入,量到的是注入之後的穩態(取代舊的「注入後固定睡 100ms」)。
          // 「空間夠不夠」要用**注入前**的下限算(拿掉下限後 computed min-width 變回 auto = NaN,每格都會被判成極窄、對照組永遠不紅);
          // 下限是樣式表給的值,元素一出現就定了,不隨版面變動,所以在這裡讀。上限不讀 computed 值(檔頭 (4):標準是規格的 CAP)。
          beforeSettle: sabotage ? async (p) => {
            floor = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-toolbar-search]')).minWidth))
            await p.addStyleTag({ content: sabotage.css })
          } : null,
          settleFrames: 10, probe: PROBE, notFound: server.notFound,
        })
        r = opened.probe
      } catch (error) {
        if (!(error instanceof StoryRenderInstrumentError)) throw error
        console.log(`✗ ${name} @${w}:${error.message}`)
        if (error.kind === 'wait-for-timeout') {
          console.log('  (Storybook 已回報渲染完成、畫面健康,但等不到搜尋框 + 操作群:示範若真的不再消費 DataToolbar,改示範或改本閘的 WANT 清單;這不是「睡不夠久」)')
        }
        instrumentFails.push({ cell: `${sabotage ? `[對照組:${sabotage.name}] ` : ''}${name} @${w}`, detail: error.detail })
        continue
      }
      // 等到之後、靜止當下又不見 = 工具列在渲染完成後被拿掉(不是還沒畫出來)—— 照實報,不猜原因
      if (r.missing) { rec(false, `${name} @${w}:等到工具列之後,版面靜止時 ${r.missing} 又不見了`); continue }
      if (sabotage) { r.minW = floor; r.fits = r.contentW >= floor + r.gap + r.opsW }
      cells.push(judge(`${name} @${w}`, r))
    }
  }
  return cells
}
// 對照組各自「紅」的定義 = 它要證明會紅的那幾條(與 SABOTAGES 同序)
const SABOTAGE_RED = [(c) => c.fits && !(c.noOverflow && c.aligned), (c) => !c.capHeld]
if (SELFTEST) {
  const reds = []
  for (const [k, s] of SABOTAGES.entries()) {
    console.log(`— 對照組「${s.name}」:注入 ${s.css} → 預期 ${s.expect} 紅`)
    let n = 0
    for (const c of await measurePass(s)) {
      const red = SABOTAGE_RED[k](c)
      if (red) n++
      console.log(`  · ${c.label}:${red ? '紅(對照組預期)' : c.fits ? '仍綠' : '極窄'} | ${c.detail}`)
    }
    reds.push(n)
  }
  // 「收合」段的對照組:改寫 decideCollapsedCount 的「k = 0 不算觸發鈕」守門 → 至少一格 C4 或 C5 紅
  console.log('— 對照組「收合:全部放得下也扣觸發鈕寬」:改寫 story 程式的 decideCollapsedCount 守門 → 預期 C4 或 C5 紅')
  const sab = await measureCollapse(true)
  let collapseReds = 0
  if (sab.instrument) instrumentFails.push({ cell: '[對照組:收合] 掃描', detail: sab.instrument })
  else {
    for (const c of sab.cells) if (!c.allFitNoCollapse || !c.minimal) {
      collapseReds++
      if (collapseReds <= 5) console.log(`  · 框寬 ${c.w}px:紅(對照組預期)| ${c.detail}`)
    }
    console.log(`  改寫 ${collapsePatched} 處;${sab.cells.length} 格裡 ${collapseReds} 格紅`)
  }
  await browser.close()
  await server.stop()
  if (instrumentFails.length) {
    console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFails.length} 格沒量到 —— 紅的不全是對照組造成的,不能宣稱「紅得對」:`)
    for (const f of instrumentFails) console.log(`  · ${f.cell}:${f.detail}`)
  }
  for (const [k, s] of SABOTAGES.entries()) {
    console.log(reds[k] >= 1 ? `✓ selftest:對照組「${s.name}」讓 ${reds[k]} 格 ${s.expect} 紅,量具會紅` : `✗ selftest:對照組「${s.name}」沒有任何一格 ${s.expect} 紅 —— 量具無效`)
  }
  console.log(collapseReds >= 1 ? `✓ selftest:對照組「收合:全部放得下也扣觸發鈕寬」讓 ${collapseReds} 格 C4 / C5 紅,量具會紅` : '✗ selftest:對照組「收合:全部放得下也扣觸發鈕寬」沒有任何一格紅 —— 量具無效')
  process.exit(reds.every((n) => n >= 1) && collapseReds >= 1 && instrumentFails.length === 0 ? 0 : 1)
}
const cells = await measurePass(null)
const collapse = await measureCollapse(false)
await browser.close()
await server.stop()
// 「收合」段(檔頭 C1–C5):逐格判,只印失敗的格子與總結(掃描 600 多格)
if (collapse.instrument) instrumentFails.push({ cell: '收合 掃描', detail: collapse.instrument })
else {
  let bad = 0
  for (const c of collapse.cells) {
    const problems = COLLAPSE_CHECKS.filter(([key]) => !c[key]).map(([, label]) => label)
    if (problems.length) { bad++; if (bad <= 10) rec(false, `收合 框寬 ${c.w}px:${problems.join(';')} | ${c.detail}`); else failed++ }
  }
  const missing = collapseCoverage(collapse.cells)
  if (missing.length) instrumentFails.push({ cell: '收合 覆蓋', detail: `掃描沒看到:${missing.join('、')}(沒量到 ≠ 沒問題)` })
  const tightCells = collapse.cells.filter((c) => c.tight).length
  const exhaustedCells = collapse.cells.filter((c) => c.exhausted).length
  if (exhaustedCells) console.log(`  · 收合:${exhaustedCells} 格是全部收起仍放不下的極窄寬度(只剩觸發鈕與分隔線,C1 不判;第七節「空間極端不足」以下由消費端自己定義)`)
  rec(bad === 0, `收合:${collapse.cells.length} 格(框寬 ${COLLAPSE_SWEEP.from}→${COLLAPSE_SWEEP.to}px)全部不溢出、依 priority 收、觸發鈕只在該組有收時出現、全部放得下不收(其中「放得下但連觸發鈕就放不下」${tightCells} 格)、不多收${bad ? `(${bad} 格失敗)` : ''}`)
}
let tight = 0, roomy = 0
for (const c of cells) {
  if (!c.floorDefined) { rec(false, `${c.label}:搜尋框沒有明確下限(computed min-width = auto)—— 這正是修前的病 | ${c.detail}`); continue }
  const problems = []
  if (c.fits && !c.noOverflow) problems.push('(1) 列溢出')
  if (c.fits && !c.aligned) problems.push('(2) 最後一顆操作鈕右緣 ≠ 內容右緣')
  if (!c.floorHeld) problems.push('(3) 搜尋框比下限窄')
  if (!c.capHeld) problems.push(`(4) 搜尋框比規格上限 ${CAP}px 寬`)
  if (c.roomy && !c.reachedCap) problems.push(`(5) 空間放得下上限,搜尋框卻沒撐到 ${CAP}px`)
  if (c.roomy) roomy++
  if (!c.fits) tight++
  const claim = c.fits
    ? `列不溢出、最後一顆操作鈕右緣 = 內容右緣、下限 ≤ 搜尋框 ≤ 上限${c.roomy ? '、空間夠所以撐到上限' : ''}`
    : '空間連下限都放不下(已知極窄極限,操作鈕收合另案),搜尋框仍守住下限、不超過上限'
  rec(problems.length === 0, `${c.label}:${claim}${problems.length ? `(失敗:${problems.join(';')})` : ''} | ${c.detail}`)
}
if (instrumentFails.length) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFails.length} 格沒量到 —— 不是產品裁決,但這次不能宣稱工具列合規:`)
  for (const f of instrumentFails) console.log(`  · ${f.cell}:${f.detail}`)
}
// 每一格都要有下落:量到,或以儀器失效記名(上方已紅)—— 兩者都沒有的格子才是這裡要抓的「靜默消失」
const CELLS = STORIES.reduce((sum, id) => sum + WIDTHS_FOR(id).length, 0)
rec(cells.length + instrumentFails.length === CELLS, `取樣:${cells.length} 格${instrumentFails.length ? `(另 ${instrumentFails.length} 格沒量到,已記儀器失效)` : ''}(需 ${STORIES.length} 支示範 × 各自的寬度 = ${CELLS} 格)`)
// (5) 至少量到一格:沒有任何一格放得下上限時,「撐到上限」這一半從沒被驗過 —— 沒量到 ≠ 沒問題(M37)
rec(roomy >= 1, `空間放得下上限 ${CAP}px 的格子量到 ${roomy} 格(至少要 1 格,(5)「撐到上限」才算驗過)`)
if (tight) console.log(`  · ${tight} 格是空間連下限都放不下的極窄組合(只驗下限守住、不超過上限;action-bar.spec.md 七:本輪不收合搜尋框)`)
console.log(failed || instrumentFails.length ? `✗ action-bar-toolbar ${failed} 條失敗、${instrumentFails.length} 格沒量到(SSOT:action-bar.spec.md 七「搜尋框」「群組溢出的操作列」)` : `✅ action-bar-toolbar PASS(${cells.length} 格,上限 ${CAP}px 讀自規格;收合 ${collapse.cells?.length ?? 0} 格)`)
process.exit(failed || instrumentFails.length ? 1 : 0)
