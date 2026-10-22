#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 單行 Tag 列(Combobox 文字標籤的檢視 / 唯讀 / 編輯態、PeoplePicker 標籤模式、DataTable 多選格、依內容寬的欄位、AgentPanel 附件列)
 *        **每一格畫出來的畫面**都不會「還有空位卻顯示 +N」,也不會畫出數字對不上的樣子(看得見的 Tag + N ≠ 總數、Tag 全收了卻沒有 +N)——
 *        兩種時序都量:一般(點擊後瀏覽器照常插畫格)與強制「點擊與 React 補畫之間沒有畫格」(React 排程訊息改在同一個工作裡跑;
 *        user 遠端隔離機器、Safari、Firefox 走的就是這條),頁面載入與點進編輯兩段都逐格看,不只看最後停下的樣子;
 *        另有兩段改容器寬逐格看:填滿寬欄位的寬度掃描(0.25px 一步,抓「+N」字寬不同造成的邊界窗)、依內容寬欄位的父層 192 → 400 → 120 → 400px(空間回來要放回去)。
 *   紅: 任一格畫面違反 → 點名 story / 格子 / 第幾格 / 看得見幾顆 / +N / 空位多寬 / 下一顆要多寬,exit 1。
 *        建置裡有單行 Tag 列、卻不在 `STORIES` 清單裡的 story → 紅(清單漏了;清單只是「這些一定要有 Tag 列」的釘子,不是取樣)。
 *        0fe34e2e(修前)實跑:DataTable「專案排程全功能整合」標籤格 RDM-101 / RDM-105 點進編輯 —— 一般時序先畫一格空白、再畫「+2」才變對;
 *        強制時序停在「+2」(兩顆其實都放得下 / backend 放得下)。
 *        2026-10-13 第一版修法(「+N」寬取最壞情況、不看外框父層)實跑 39 格紅:寬度掃描在空位 143.00–144.45px 那幾格顯示「+2」(其實 Electronics +1 要 142.50px);
 *        窄容器 192 → 400px 停在「Electronics +2」、120 → 400px 停在「+3」;DataTable 全功能範例 RDM-104 / 112 / 120 標籤格一載入就是「1 顆 +2」
 *        (空位 102.81px,多放一顆連「+1」只要 102.20px —— 舊判定拿現在的「+2」寬估,這三格也一直是綠的)。
 *   綠: 全部畫面都符合。--selftest:(1) 判定表 —— 正確形狀必綠、空白格 / 數字錯 / 有空位卻 +N(含「+N」字寬不同的邊界、收起數跨位數)必紅、缺量測必判儀器失效;
 *        (2) 真對照組 —— 在修好的建置上,RDM-101 編輯格疊一份修前那個畫面(Tag 區複製一份:收掉 backend、「+1」改成「+2」),逐格取樣必須在那一格紅;
 *        (3) 強制時序真的生效(被改走同一個工作的排程訊息 > 0),沒生效 = 儀器失效,不是綠。
 *        story 沒渲染 / 等不到靜止 / 一格都沒取樣到 / 找不到要量的格子 / 清單裡的 story 沒有 Tag 列 / 掃描沒看到預期的三種狀態
 *        = 儀器失效(INSTRUMENT-FAIL,exit 1),不得讀成通過。
 *
 * owner:`packages/design-system/src/components/Combobox/combobox.spec.md`「單行溢出」(useOverflowCount);
 *   根因與修法:待辦 Q1(2026-10-13 user「…標籤,預設選了 backend spike 的 table cell,一點下去會直接變成+2,但明明空間還足夠…」)、K6(依內容寬縮成只剩 +N)。
 *
 * 看哪些 story(NO-SAMPLE):建置的 index.json 裡,story 檔的 import 圖會走到 `OverflowIndicator/overflow-tag-list.tsx` 的**全部** story
 *   (靜態的上界:沒 import 到就不可能畫出這條列);一般時序逐則開、逐格判,有 Tag 列的就是成員。成員必須都在 `STORIES` 裡、`STORIES` 裡的必須都有 Tag 列;
 *   強制時序只重跑成員。
 *
 * 量法(頁面端,init script 從文件一開始就掛):
 *   - 找 Tag 列:`span.contents` 底下一排 `div`(最後一個是「+N」那一格,其餘每格一顆 Tag),至少一格裡有 `[data-tag-root]`。修前修後同一個結構。
 *   - 取樣點 = 每一格的 ResizeObserver 回呼(每個 rAF 新建一個觀察 <html> 的 observer:它是最晚建立的,回呼排在元件自己的 observer 之後、
 *     畫面之前 —— 量到的就是這一格要畫的樣子;只用 rAF 會看到「元件還沒在同一格改正之前」的 DOM,造成假紅)。
 *   - 每格每列記:總數、看得見幾顆(wrapper 沒 hidden 且 Tag 有寬)、「+N」看不看得見與數字、空位 = 可放 Tag 的右界 − 最後一顆看得見的 Tag 右緣
 *     (右界 = 容器內容右緣;依內容寬的欄位加上「欄位還能長多寬」;欄位內搜尋框的量尺另扣;同一列裡不是 Tag 的東西(唯讀箭頭)擋住的地方不算)、
 *     被收起的 Tag 的自然寬(複製一份放在同一個容器裡、絕對定位看不見,量完即刪)、多放一顆時「+N」會顯示的那個數字的真寬
 *     (複製「+N」那一格、把字改成「+(收起數 − 1)」再量 —— 數字的字寬不一樣,不能拿現在這個數字代替)。只在狀態變了時記一筆。
 *   - 強制時序:MessageChannel 的 postMessage 改成 queueMicrotask(與調查用的 fast-machine.js 同一招),從文件一開始到結束都生效。
 *
 * 用法:node scripts/tag-overflow-room-invariant.mjs [--build=storybook-static] [--selftest] [--only=normal|forced]
 */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync, statSync } from 'node:fs'
import ts from 'typescript'
import { launchBrowser, openStory, requireStorybookBuild, settleAfterInteraction, StoryRenderInstrumentError, INSTRUMENT_FAIL_MARKER } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
const ONLY = arg('only', '')
const SETTLE_FRAMES = 10 // 與其他瀏覽器閘同值(named-constant-drift 閘:同名常數不得有第二個值)
/** 空位要比下一顆多出這麼多才算「放得下」(px):只吃次像素,不吃真的版面差 */
const ROOM_TOLERANCE_PX = 0.5
/** 一段觀測窗至少要取樣到幾格,否則儀器失效 */
const MIN_FRAMES = 5

export const ROADMAP = 'design-system-components-datatable-展示--roadmap-all-in-one'
/** DataTable「專案排程全功能整合」標籤欄:RDM-101 = backend + spike(編輯時 backend + +1)、RDM-105 = backend + qa(兩顆都放得下) */
export const ROADMAP_CELLS = Object.freeze(['RDM-101:tags', 'RDM-105:tags'])
/** 有單行 Tag 列的 story(釘子:每一則都必須找得到至少一條 Tag 列,找不到 = 儀器失效)。**完整性由閘自己驗**:
 *  一般時序把 import 圖走得到 OverflowTagList 的 story 全部開一次,有 Tag 列卻不在這裡的 → 紅(改了範例就要一起改這張清單)。 */
export const STORIES = Object.freeze([
  ROADMAP,
  'design-system-components-datatable-展示--roadmap-perf-budget',
  'design-system-components-datatable-展示--inline-edit',
  'design-system-components-datatable-展示--filter-panel-states',
  'design-system-components-combobox-展示--modes',
  'design-system-components-combobox-展示--modes-remove-focus-contract',
  'design-system-components-combobox-展示--size-alignment',
  'design-system-components-combobox-展示--searchable',
  'design-system-components-combobox-展示--inline-search-focus-contract',
  'design-system-components-combobox-展示--field-keys-contract',
  'design-system-components-combobox-展示--value-loading',
  'design-system-components-combobox-展示--remote-search',
  'design-system-components-combobox-展示--unrestricted-option',
  'design-system-components-combobox-展示--unrestricted-contract',
  'design-system-components-combobox-展示--unrestricted-off-inert',
  'design-system-components-combobox-展示--in-data-table',
  'design-system-components-combobox-設計規格--inspector',
  'design-system-components-combobox-設計規格--color-matrix',
  'design-system-components-combobox-設計規格--size-matrix',
  'design-system-components-combobox-設計規格--state-behavior',
  'design-system-components-combobox-設計原則--overflow-rule',
  'design-system-components-combobox-設計原則--tag-operation-rule',
  'design-system-components-combobox-設計原則--usage-guidance',
  'design-system-components-combobox-設計原則--wrap-rule',
  'design-system-components-peoplepicker-設計原則--usage-guidance',
  // 依內容寬的多選文字標籤(K6):三顆放得下 / 窄容器放不下
  'design-system-components-field-展示--inline-search-yield-width-contract',
  // AgentPanel 輸入盒附件列(與 Combobox 同一份 OverflowTagList)
  'design-system-components-agentpanel-展示--attachments',
  'design-system-components-agentpanel-展示--resizable-width',
  'design-system-components-agentpanel-設計規格--overview',
  // 內部元件層(OverflowIndicator 的 Combobox 範例、SelectMenu 多選)—— 2026-10-13 第一次用 import 圖上界全掃時才找到
  'design-system-internal-overflowindicator-展示--combobox-tag-overflow',
  'design-system-internal-selectmenu-展示--multi-select',
])
/** 寬度掃描(填滿寬):Electronics 105.48 + Food,「+2」34.97 /「+1」33.02px —— 第一版修法在容器 207.5–209.25px 顯示「+2」(其實 Electronics +1 放得下) */
export const SWEEP = Object.freeze({ story: 'design-system-components-combobox-展示--field-keys-contract', label: '商品分類(浮層內搜尋,可清空)', from: 250, to: 100, step: 0.25 })
/** 依內容寬的欄位:父層寬改來改去,空間回來就要放回去(K6;第一版修法 192 → 400 停在「Electronics +2」、120 → 400 停在「+3」) */
export const HUG_RESIZE = Object.freeze({ story: 'design-system-components-field-展示--inline-search-yield-width-contract', label: '商品類別(依內容寬,窄容器)', widths: [192, 400, 120, 400], allFitAt: 400 })
/** 看哪些 story 的上界:import 圖走得到這個檔(OverflowTagList 的唯一實作) */
const TAG_LIST_SOURCE = 'packages/design-system/src/components/OverflowIndicator/overflow-tag-list.tsx'
const ORDERS = ONLY ? [ONLY] : ['normal', 'forced']

// ═══════════════════════════════════════════════════════════════════════════
// 判定(純函式;正式跑與 --selftest 判定表共用)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @param {{ total:number, visible:number, plus:number|null, plusW:number, plusNextW?:number, gap:number, space:number, hiddenW:number[] }} m 一格畫面裡的一列
 *   plusNextW = 多放一顆時「+N」會顯示的那個數字(收起數 − 1)的真寬;收起 ≥ 2 顆時必有
 * @returns {{ ok: boolean, kind: 'ok'|'blank'|'count'|'room'|'instrument', detail: string }}
 */
export function judge(m) {
  const num = (v) => typeof v === 'number' && Number.isFinite(v)
  if (!m || !num(m.total) || !num(m.visible) || !num(m.gap) || !num(m.space) || !Array.isArray(m.hiddenW)) {
    return { ok: false, kind: 'instrument', detail: `量測缺欄位:${JSON.stringify(m)}` }
  }
  if (m.total === 0) return { ok: true, kind: 'ok', detail: '沒有 Tag' }
  const hidden = m.total - m.visible
  if (m.plus == null) {
    if (m.visible === m.total) return { ok: true, kind: 'ok', detail: `${m.visible} 顆全顯示` }
    return { ok: false, kind: m.visible === 0 ? 'blank' : 'count', detail: `看得見 ${m.visible}/${m.total} 顆、沒有 +N(${m.visible === 0 ? '整列空白' : '有 Tag 不見了也沒有 +N'})` }
  }
  if (m.visible + m.plus !== m.total) return { ok: false, kind: 'count', detail: `看得見 ${m.visible} 顆 + 「+${m.plus}」≠ 總數 ${m.total}` }
  if (hidden !== m.hiddenW.length || m.hiddenW.some((w) => !num(w) || w <= 0)) {
    return { ok: false, kind: 'instrument', detail: `被收起的 Tag 量不到寬:${JSON.stringify(m.hiddenW)}` }
  }
  if (hidden >= 2 && !(num(m.plusNextW) && m.plusNextW > 0)) {
    return { ok: false, kind: 'instrument', detail: `量不到「+${hidden - 1}」的寬(多放一顆時要顯示的數字):${JSON.stringify(m.plusNextW)}` }
  }
  const lead = m.visible > 0 ? m.gap : 0
  // 收起來的全部攤開(不要 +N)放得下嗎
  const allNeed = lead + m.hiddenW.reduce((s, w, i) => s + w + (i > 0 ? m.gap : 0), 0)
  // 多放一顆、其餘仍收在 +N 裡放得下嗎 —— 「+N」用多放一顆之後真的會顯示的那個數字的寬(2026-10-13 前用現在這顆的寬當「保守估計」,
  // 正好看不到「+2 比 +1 寬 1.95px」那段窗:第一版修法在那段窗裡顯示「+2」,這支閘照樣綠)
  const oneMoreNeed = hidden >= 2 ? lead + m.hiddenW[0] + m.gap + m.plusNextW : allNeed
  const need = Math.min(allNeed, oneMoreNeed)
  if (need <= m.space - ROOM_TOLERANCE_PX) {
    return { ok: false, kind: 'room', detail: `還有空位卻顯示「+${m.plus}」:看得見 ${m.visible}/${m.total} 顆,空位 ${m.space.toFixed(2)}px,下一顆只要 ${need.toFixed(2)}px` }
  }
  return { ok: true, kind: 'ok', detail: `看得見 ${m.visible} 顆 +${m.plus}(空位 ${m.space.toFixed(2)}px < 下一顆 ${need.toFixed(2)}px)` }
}

// ═══════════════════════════════════════════════════════════════════════════
// 頁面端(init script;序列化注入,不得引用外部變數)
// ═══════════════════════════════════════════════════════════════════════════
/** 網址帶這個參數 = 這一頁走強制時序(single-process 沙箱開第二個 page / context 會 SIGTRAP,所以兩種時序共用一個 page、以網址切換) */
const FORCE_PARAM = 'tagRoomForceSync'
const FORCE_SCRIPT = `(() => {
  // 強制時序:React 排程訊息(MessageChannel)改在同一個工作裡跑 —— 點擊 / 掛載與 React 補畫之間不會插進畫格
  if (!new URLSearchParams(location.search).has('${FORCE_PARAM}')) return
  const Orig = window.MessageChannel
  const desc = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage')
  window.__forced = { count: 0 }
  window.MessageChannel = class extends Orig {
    constructor() {
      super()
      const p1 = this.port1, p2 = this.port2
      let handler = null
      Object.defineProperty(p1, 'onmessage', { configurable: true, get() { return handler }, set(fn) { handler = fn; desc.set.call(this, fn) } })
      const post = p2.postMessage.bind(p2)
      p2.postMessage = function (msg, ...rest) {
        if (handler) { window.__forced.count++; queueMicrotask(() => handler.call(p1, new MessageEvent('message', { data: msg }))); return }
        return post(msg, ...rest)
      }
    }
  }
})()`

const SAMPLER_SCRIPT = `(() => {
  const S = (window.__tagRoom = { frames: 0, records: [], last: new Map(), widthCache: new WeakMap(), plusCache: new WeakMap(), errors: [] })
  const num = (v) => parseFloat(v) || 0
  const keyOf = (list, i) => {
    const cell = list.closest('[data-cell-id]')
    if (cell) return 'cell:' + cell.getAttribute('data-cell-id')
    const field = list.closest('[role="combobox"], [data-field-mode]')
    const label = field && (field.getAttribute('aria-label') || field.getAttribute('aria-labelledby'))
    return (label ? 'field:' + label : 'list') + '#' + i
  }
  const naturalWidth = (wrapper, container) => {
    const root = wrapper.querySelector('[data-tag-root]')
    if (!root) return 0
    const sig = root.textContent + '|' + root.className + '|' + root.querySelectorAll('button').length
    const cached = S.widthCache.get(wrapper)
    if (cached && cached.sig === sig) return cached.w
    const clone = root.cloneNode(true)
    clone.removeAttribute('id')
    clone.style.position = 'absolute'; clone.style.visibility = 'hidden'; clone.style.left = '0'; clone.style.top = '0'
    clone.setAttribute('aria-hidden', 'true')
    container.appendChild(clone)
    const w = clone.getBoundingClientRect().width
    clone.remove()
    S.widthCache.set(wrapper, { sig, w })
    return w
  }
  // 「+N」那一格若顯示的是「+n」會多寬:複製那一格、把數字改成 n、絕對定位看不見放進同一個容器量,量完即刪
  const plusWidthAs = (ofWrap, n, container) => {
    // 快取以「這一格」為單位(同樣的 class 在不同密度的子樹裡字寬不同),內容 / class / 現在的寬任一變了就重量
    const sig = ofWrap.className + '|' + (ofWrap.firstElementChild ? ofWrap.firstElementChild.className : '') + '|' + ofWrap.textContent + '|' + ofWrap.getBoundingClientRect().width.toFixed(2) + '|' + n
    const hit = S.plusCache.get(ofWrap)
    if (hit && hit.sig === sig) return hit.w
    const clone = ofWrap.cloneNode(true)
    clone.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'))
    clone.removeAttribute('data-overflow-measure')
    const numLeaf = [...clone.querySelectorAll('*')].find((e) => !e.children.length && /^\\+\\s*\\d+$/.test((e.textContent || '').trim()))
    if (!numLeaf) return undefined
    numLeaf.textContent = '+' + n
    clone.style.position = 'absolute'; clone.style.visibility = 'hidden'; clone.style.left = '0'; clone.style.top = '0'
    clone.setAttribute('aria-hidden', 'true')
    container.appendChild(clone)
    const w = clone.getBoundingClientRect().width
    clone.remove()
    S.plusCache.set(ofWrap, { sig, w })
    return w
  }
  const measureList = (list) => {
    const container = list.parentElement
    const kids = [...list.children]
    if (kids.length < 2) return null
    const ofWrap = kids[kids.length - 1]
    const wrappers = kids.slice(0, -1)
    if (!wrappers.some((w) => w.querySelector('[data-tag-root]'))) return null
    const shownRoot = (w) => { if (w.hidden || !w.getClientRects().length) return null; const r = w.querySelector('[data-tag-root]'); return r && r.getBoundingClientRect().width > 0 ? r : null }
    const visibleRoots = wrappers.map(shownRoot)
    const visible = visibleRoots.filter(Boolean).length
    const leaf = [...ofWrap.querySelectorAll('*')].find((e) => !e.children.length && /^\\+\\s*\\d+$/.test((e.textContent || '').trim())
      && e.getClientRects().length && getComputedStyle(e).visibility === 'visible' && e.getBoundingClientRect().width > 0)
    const plus = leaf ? parseInt(leaf.textContent.trim().slice(1), 10) : null
    const cs = getComputedStyle(container)
    const gap = num(cs.columnGap)
    const cr = container.getBoundingClientRect()
    let limit = cr.right - num(cs.paddingRight) - num(cs.borderRightWidth)
    const contentLeft = cr.left + num(cs.paddingLeft) + num(cs.borderLeftWidth)
    let reserve = 0
    for (const sib of container.children) {
      if (sib === list || !sib.getClientRects().length) continue
      const pos = getComputedStyle(sib).position
      if (pos === 'absolute' || pos === 'fixed') continue
      const mirror = sib.querySelector('[data-inline-search-mirror]')
      if (mirror) { const w = mirror.getBoundingClientRect().width; reserve = w > 0 ? gap + w : 0; continue }
      limit = Math.min(limit, sib.getBoundingClientRect().left - gap)
    }
    // 依內容寬的欄位(w-fit):右界可以一直長到欄位的父層內容右緣
    const field = container.closest('[data-field-mode]')
    if (field && /(^|\\s)w-fit(\\s|$)/.test(String(field.className)) && field.parentElement) {
      const p = field.parentElement, ps = getComputedStyle(p), pr = p.getBoundingClientRect()
      const ext = (pr.right - num(ps.paddingRight) - num(ps.borderRightWidth)) - field.getBoundingClientRect().right
      if (ext > 0) limit += ext
    }
    const lastRight = Math.max(contentLeft, ...visibleRoots.filter(Boolean).map((r) => r.getBoundingClientRect().right))
    const hiddenW = wrappers.filter((w, i) => !visibleRoots[i]).map((w) => naturalWidth(w, container))
    const hidden = wrappers.length - visible
    const plusNextW = leaf && hidden >= 2 ? plusWidthAs(ofWrap, hidden - 1, container) : undefined
    return { total: wrappers.length, visible, plus, plusW: leaf ? ofWrap.getBoundingClientRect().width : 0, plusNextW, gap, space: limit - lastRight - reserve, hiddenW }
  }
  const sample = () => {
    S.frames++
    try {
      const lists = [...document.querySelectorAll('span.contents')]
      const seen = new Map()
      lists.forEach((list) => {
        const m = measureList(list)
        if (!m) return
        let key = keyOf(list, 0)
        if (seen.has(key)) { seen.set(key, seen.get(key) + 1); key = keyOf(list, seen.get(key)) } else seen.set(key, 0)
        const sig = m.total + '|' + m.visible + '|' + m.plus + '|' + m.space.toFixed(1) + '|' + m.hiddenW.map((w) => w.toFixed(1)).join(',')
        if (S.last.get(key) === sig) return
        S.last.set(key, sig)
        if (S.records.length < 20000) S.records.push({ frame: S.frames, t: +performance.now().toFixed(1), key, m })
      })
    } catch (e) { S.errors.push(String(e && e.message || e)) }
  }
  // 每個 rAF 新建一個 observer:最晚建立 → 回呼排在元件自己的 ResizeObserver 之後、畫面之前(= 這一格要畫的樣子)
  const tick = () => {
    const ro = new ResizeObserver(() => { ro.disconnect(); sample() })
    ro.observe(document.documentElement)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()`

// ═══════════════════════════════════════════════════════════════════════════
// 量測
// ═══════════════════════════════════════════════════════════════════════════
class InstrumentError extends Error {}

/** 讀一段觀測窗的取樣並判定;回傳 { frames, findings[], lists } */
async function collect(page, { label, sinceFrame = 0, sinceRecord = 0, requireKeys = [] }) {
  const s = await page.evaluate(() => ({ frames: window.__tagRoom?.frames ?? -1, records: window.__tagRoom?.records ?? null, errors: window.__tagRoom?.errors ?? [] }))
  if (!s.records) throw new InstrumentError(`${label}:取樣器沒有掛上`)
  if (s.errors.length) throw new InstrumentError(`${label}:取樣器出錯:${s.errors.slice(0, 3).join(' / ')}`)
  const frames = s.frames - sinceFrame
  if (frames < MIN_FRAMES) throw new InstrumentError(`${label}:只取樣到 ${frames} 格(< ${MIN_FRAMES})—— 沒看到畫面就不能說畫面對`)
  const records = s.records.slice(sinceRecord)
  const keys = new Set(records.map((r) => r.key))
  for (const k of requireKeys) {
    if (!keys.has(k) && !s.records.some((r) => r.key === k)) throw new InstrumentError(`${label}:找不到要量的 Tag 列「${k}」`)
  }
  const findings = []
  for (const r of records) {
    const v = judge(r.m)
    if (v.kind === 'instrument') throw new InstrumentError(`${label} ${r.key} 第 ${r.frame} 格:${v.detail}`)
    if (!v.ok) findings.push(`${label} · ${r.key} · 第 ${r.frame} 格(${r.t}ms):${v.detail}`)
  }
  return { frames, findings, lists: keys.size, records: records.length }
}

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
  await page.addInitScript({ content: FORCE_SCRIPT })
  await page.addInitScript({ content: SAMPLER_SCRIPT })
  return page
}
const storyUrl = (origin, id, order) => `${origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story${order === 'forced' ? `&${FORCE_PARAM}=1` : ''}`

async function openAndSettle(page, url, id, notFound) {
  try {
    await openStory(page, url, { settleFrames: SETTLE_FRAMES, notFound })
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) throw new InstrumentError(`${id}:${error.detail ?? error.message}`)
    throw error
  }
}

/** 點進一格編輯,逐格看到靜止;回傳該段的 findings。forced 時要求強制時序真的生效 */
async function clickCell(page, cellId, order, label) {
  const sel = `[data-cell-id="${cellId}"]`
  const cell = page.locator(sel)
  if (!(await cell.count())) throw new InstrumentError(`${label}:找不到格子 ${cellId}`)
  await cell.scrollIntoViewIfNeeded()
  const settled0 = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
  if (!settled0.ok) throw new InstrumentError(`${label}:捲到 ${cellId} 之後版面不靜止`)
  const before = await page.evaluate(() => ({ frames: window.__tagRoom.frames, records: window.__tagRoom.records.length, forced: window.__forced?.count ?? 0 }))
  const box = await cell.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const settled = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
  if (!settled.ok) throw new InstrumentError(`${label}:點 ${cellId} 之後版面不靜止`)
  const edit = await page.evaluate((s) => !!document.querySelector(`${s} [role="combobox"]`), sel)
  if (!edit) throw new InstrumentError(`${label}:點 ${cellId} 沒有進入編輯(找不到觸發欄位)`)
  const forced = (await page.evaluate(() => window.__forced?.count ?? 0)) - before.forced
  if (order === 'forced' && forced <= 0) throw new InstrumentError(`${label}:強制時序沒有生效(這段沒有任何排程訊息被改走同一個工作)`)
  const out = await collect(page, { label: `${label} 點 ${cellId}`, sinceFrame: before.frames, sinceRecord: before.records, requireKeys: [`cell:${cellId}`] })
  // 回到檢視態(Esc 可能只收起清單)
  for (let i = 0; i < 2 && await page.evaluate((s) => !!document.querySelector(`${s} [role="combobox"]`), sel); i++) {
    await page.keyboard.press('Escape')
    await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
  }
  return { ...out, forced }
}

/**
 * 要開哪些 story 的上界:index.json 裡 story 檔的 import 圖(TypeScript 的 preProcessFile,不吃註解與字串裡的範例碼)走得到 OverflowTagList 的全部 story。
 * 沒 import 到就不可能畫出這條列,所以這是上界;本地路徑(相對 / `@/design-system/` / `@qijenchen/design-system`)解析不到 = 儀器失效 ——
 * 建置能過代表真的 import 都解析得到,解析不到只會是這裡的對照表缺了一種寫法,那時上界就不可信。
 */
export function storyCandidates(index) {
  const target = resolve(ROOT, TAG_LIST_SOURCE)
  const aliases = [['@qijenchen/design-system', 'packages/design-system/src/index'], ['@/design-system/', 'packages/design-system/src/']]
  const resolveSpec = (from, spec) => {
    let base = null
    if (spec.startsWith('.')) base = resolve(dirname(from), spec)
    else {
      const a = aliases.find(([k]) => spec === k || spec.startsWith(k.endsWith('/') ? k : `${k}/`))
      if (!a) return { local: false }
      if (a[0] === '@qijenchen/design-system' && spec !== a[0]) return { local: false } // 子路徑(樣式等)不是元件模組
      base = resolve(ROOT, a[1] + spec.slice(a[0].length))
    }
    for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts', '']) {
      const p = base + ext
      if (existsSync(p) && statSync(p).isFile()) return { local: true, path: p }
    }
    return { local: true, path: null }
  }
  const memo = new Map()
  const reaches = (file, stack) => {
    if (file === target) return true
    if (memo.has(file)) return memo.get(file)
    if (stack.has(file) || !/\.(tsx?|jsx?|mjs)$/.test(file)) return false
    stack.add(file)
    let hit = false
    for (const { fileName } of ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles) {
      const r = resolveSpec(file, fileName)
      if (!r.local) continue
      if (!r.path) throw new InstrumentError(`找 story 上界時解析不到 ${file.slice(ROOT.length + 1)} 的 import「${fileName}」(對照表缺這種寫法,上界不可信)`)
      if (reaches(r.path, stack)) { hit = true; break }
    }
    stack.delete(file)
    // 只快取「走得到」;走不到的結果可能是被正在走的環截斷的,不能當定論
    if (hit) memo.set(file, true)
    return hit
  }
  const out = []
  for (const entry of Object.values(index.entries)) {
    if (entry.type !== 'story') continue
    const file = resolve(ROOT, entry.importPath)
    if (!existsSync(file)) throw new InstrumentError(`index.json 的 ${entry.id} 指向不存在的檔 ${entry.importPath}(建置與工作樹不同版)`)
    if (reaches(file, new Set())) out.push(entry.id)
  }
  return out.sort()
}

/** 改容器寬、每一格畫面都判:寬度掃描(SWEEP)與依內容寬父層來回(HUG_RESIZE)共用。回傳 findings 與看到的狀態 */
async function resizeRow(page, { label, field, widths, holdFrames, order }) {
  const before = await page.evaluate(() => ({ frames: window.__tagRoom.frames, records: window.__tagRoom.records.length }))
  const res = await page.evaluate(async ({ field, widths, holdFrames }) => {
    const host = document.querySelector(`[aria-label="${field}"]`)
    if (!host) return { err: `找不到欄位「${field}」` }
    const frame = host.closest('[data-field-mode]') ?? host
    const parent = frame.parentElement
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()))
    const shown = () => {
      const tags = [...frame.querySelectorAll('[data-tag-root]')].filter((t) => t.getClientRects().length && !t.closest('[hidden]')).length
      const plus = [...frame.querySelectorAll('[data-overflow-indicator]')].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility === 'visible').map((e) => e.textContent.trim())
      return { tags, plus: plus[0] ?? null }
    }
    const states = new Set()
    const at = []
    for (const w of widths) {
      parent.style.width = `${w}px`
      for (let i = 0; i < holdFrames; i++) { await raf(); const s = shown(); states.add(`${s.tags}|${s.plus}`) }
      at.push({ w, ...shown() })
    }
    parent.style.width = ''
    return { states: [...states], at, total: frame.querySelectorAll('[data-tag-root]').length }
  }, { field, widths, holdFrames })
  if (res.err) throw new InstrumentError(`${label}:${res.err}`)
  await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
  const out = await collect(page, { label, sinceFrame: before.frames, sinceRecord: before.records })
  if (out.frames < widths.length * holdFrames) throw new InstrumentError(`${label}:${widths.length * holdFrames} 步只取樣到 ${out.frames} 格 —— 有些寬度沒被看到`)
  return { ...out, ...res }
}

async function run({ build }) {
  requireStorybookBuild(build)
  const server = await startA11yStaticServer({ rootDirectory: build, defaultFile: 'iframe.html' })
  const index = JSON.parse(readFileSync(join(server.snapshot?.dir ?? build, 'index.json'), 'utf8'))
  for (const id of STORIES) if (!index.entries[id]) throw new InstrumentError(`${id}:建置裡沒有這則 story(改名了就要一起改這張清單)`)
  const candidates = storyCandidates(index)
  const outside = STORIES.filter((id) => !candidates.includes(id))
  if (outside.length) throw new InstrumentError(`清單裡的 ${outside.join('、')} 不在 import 圖的上界裡 —— 上界算錯了,不能拿它驗清單完整`)
  const browser = await launchBrowser()
  const findings = []
  const lines = []
  try {
    const page = await newPage(browser)
    for (const order of ORDERS) {
      // 一般時序:上界裡每一則都開、逐格判,順便點名成員;強制時序:只重跑成員(STORIES,上面已驗它等於成員)
      const ids = order === 'normal' ? [ROADMAP, ...candidates.filter((id) => id !== ROADMAP)] : STORIES
      const members = []
      for (const id of ids) {
        const url = storyUrl(server.origin, id, order)
        await openAndSettle(page, url, id, server.notFound)
        const label = `[${order}] ${id.replace(/^design-system-components-/, '')}`
        const load = await collect(page, { label: `${label} 載入`, requireKeys: id === ROADMAP ? ROADMAP_CELLS.map((c) => `cell:${c}`) : [] })
        const listed = STORIES.includes(id)
        if (listed && load.lists === 0) throw new InstrumentError(`${label}:一條單行 Tag 列都沒找到(清單裡的 story 應該都有)`)
        if (load.lists > 0) members.push(id)
        if (load.lists > 0 && !listed) findings.push(`${label}:有 ${load.lists} 條單行 Tag 列,卻不在 STORIES 清單裡(清單漏了 —— 加進去,強制時序才會重跑它)`)
        if (order === 'forced') {
          const forced = await page.evaluate(() => window.__forced?.count ?? 0)
          if (forced <= 0) throw new InstrumentError(`${label}:強制時序沒有生效`)
        }
        findings.push(...load.findings)
        if (load.lists > 0) lines.push(`  ${load.findings.length ? '✗' : '✓'} ${label} 載入:${load.lists} 條 Tag 列、${load.frames} 格、${load.records} 筆變化`)
        if (id === ROADMAP) {
          for (const cellId of ROADMAP_CELLS) {
            const c = await clickCell(page, cellId, order, label)
            findings.push(...c.findings)
            lines.push(`  ${c.findings.length ? '✗' : '✓'} ${label} 點 ${cellId} 進編輯:${c.frames} 格、${c.records} 筆變化${order === 'forced' ? `、改走同一工作的排程訊息 ${c.forced} 則` : ''}`)
          }
        }
      }
      if (order === 'normal') {
        const unlisted = members.filter((id) => !STORIES.includes(id)).length
        lines.push(`  ${unlisted ? '✗' : '✓'} [normal] import 圖上界 ${candidates.length} 則 story 全開過:${members.length} 則有單行 Tag 列(清單 ${STORIES.length} 則${unlisted ? `,漏了 ${unlisted} 則` : ''})`)
      }
      // 改容器寬的兩段:決定只由 ResizeObserver → flushSync 這條路做,與 React 排程訊息無關,所以只跑一般時序
      if (order !== 'normal') continue
      {
        const label = `[normal] 寬度掃描 ${SWEEP.label}`
        await openAndSettle(page, storyUrl(server.origin, SWEEP.story, order), SWEEP.story, server.notFound)
        const widths = []
        for (let w = SWEEP.from; w >= SWEEP.to; w -= SWEEP.step) widths.push(w)
        for (let w = SWEEP.to + SWEEP.step; w <= SWEEP.from; w += SWEEP.step) widths.push(w)
        const r = await resizeRow(page, { label, field: SWEEP.label, widths, holdFrames: 1, order })
        // 儀器要看得到它要抓的事:掃描範圍必須涵蓋「全顯示」「部分 + N」「只剩 +N」三種狀態,否則邊界窗可能不在範圍裡
        const kinds = new Set(r.states.map((st) => { const [tags, plus] = st.split('|'); return plus === 'null' ? 'all' : Number(tags) > 0 ? 'some' : 'none' }))
        if (kinds.size < 3) throw new InstrumentError(`${label}:${SWEEP.from} → ${SWEEP.to}px 只看到 ${[...kinds].join(' / ')} —— 範圍沒有跨過全部邊界`)
        findings.push(...r.findings)
        lines.push(`  ${r.findings.length ? '✗' : '✓'} ${label}:${SWEEP.from} → ${SWEEP.to} → ${SWEEP.from}px、每 ${SWEEP.step}px 一步,${r.frames} 格、${r.records} 筆變化`)
      }
      {
        const label = `[normal] 依內容寬父層來回 ${HUG_RESIZE.label}`
        await openAndSettle(page, storyUrl(server.origin, HUG_RESIZE.story, order), HUG_RESIZE.story, server.notFound)
        const r = await resizeRow(page, { label, field: HUG_RESIZE.label, widths: HUG_RESIZE.widths, holdFrames: SETTLE_FRAMES, order })
        // 逐格判之外再直接看結果:父層 400px 時三顆都要在、沒有 +N(判定的「空位」依內容寬時用父層右緣算;這裡不靠它也要紅)
        for (const a of r.at) if (a.w === HUG_RESIZE.allFitAt && (a.tags !== r.total || a.plus)) findings.push(`${label}:父層 ${a.w}px 時只顯示 ${a.tags}/${r.total} 顆${a.plus ? ` + 「${a.plus}」` : ''}(放得下卻沒放回去)`)
        findings.push(...r.findings)
        lines.push(`  ${r.findings.length ? '✗' : '✓'} ${label}:${r.at.map((a) => `${a.w}px → ${a.tags} 顆${a.plus ? ` ${a.plus}` : ''}`).join(' · ')}`)
      }
    }
  } finally {
    await browser.close()
    await server.stop?.()
  }
  return { findings, lines }
}

// ═══════════════════════════════════════════════════════════════════════════
// --selftest
// ═══════════════════════════════════════════════════════════════════════════
const TABLE = [
  { name: '全顯示', m: { total: 2, visible: 2, plus: null, plusW: 0, gap: 4, space: 20, hiddenW: [] }, expect: 'ok' },
  { name: 'backend +1(spike 放不下)', m: { total: 2, visible: 1, plus: 1, plusW: 33, gap: 4, space: 50, hiddenW: [67.84] }, expect: 'ok' },
  { name: '修前「+2」:backend 放得下(RDM-101,編輯態可用 150px)', m: { total: 2, visible: 0, plus: 2, plusW: 35, plusNextW: 33, gap: 4, space: 150, hiddenW: [89.14, 67.84] }, expect: 'room' },
  { name: '修前「+2」:兩顆都放得下(RDM-105)', m: { total: 2, visible: 0, plus: 2, plusW: 35, plusNextW: 33, gap: 4, space: 150, hiddenW: [89.14, 49.97] }, expect: 'room' },
  { name: '修前一般時序的空白格(Tag 收了、+N 還沒畫)', m: { total: 2, visible: 0, plus: null, plusW: 0, gap: 4, space: 150, hiddenW: [89.14, 67.84] }, expect: 'blank' },
  { name: '數字錯(backend 看得見、+N 寫 2)', m: { total: 2, visible: 1, plus: 2, plusW: 35, gap: 4, space: 20, hiddenW: [67.84] }, expect: 'count' },
  { name: '多放一顆差 0.2px(次像素,不算有空位)', m: { total: 3, visible: 1, plus: 2, plusW: 35, plusNextW: 35, gap: 4, space: 104.6, hiddenW: [61.3, 50] }, expect: 'ok' },
  { name: '多放一顆還多 1px(有空位)', m: { total: 3, visible: 1, plus: 2, plusW: 35, plusNextW: 35, gap: 4, space: 105.3, hiddenW: [61.3, 50] }, expect: 'room' },
  // 「+N」字寬不一樣(2026-10-13 獨立驗證):Electronics 105.48 + Food 66.56,「+2」34.97 /「+1」33.02;容器 209.25px 時空位 144.25 ——
  // 第一版修法顯示「+2」,舊判定拿現在的「+2」寬估多放一顆(105.48 + 4 + 34.97 = 144.45 > 143.75)判綠;用「+1」的真寬(142.5)必紅
  { name: '「+N」字寬不同的邊界窗:+2 時空位夠放 Electronics +1', m: { total: 2, visible: 0, plus: 2, plusW: 34.97, plusNextW: 33.02, gap: 4, space: 144.25, hiddenW: [105.48, 66.56] }, expect: 'room' },
  { name: '同一格差 0.25px(剛好放不下)', m: { total: 2, visible: 0, plus: 2, plusW: 34.97, plusNextW: 33.02, gap: 4, space: 142.25, hiddenW: [105.48, 66.56] }, expect: 'ok' },
  // 收起數跨位數:「+10」41.69 →「+9」約 35.5,窗口 6px 起跳
  { name: '收起數跨位數(+10 → +9)的邊界窗', m: { total: 11, visible: 1, plus: 10, plusW: 41.69, plusNextW: 35.5, gap: 4, space: 108, hiddenW: [60, 50, 50, 50, 50, 50, 50, 50, 50, 50] }, expect: 'room' },
  { name: '缺量測', m: { total: 2, visible: 1, plus: 1, gap: 4, hiddenW: [] }, expect: 'instrument' },
  { name: '收起 ≥ 2 顆卻量不到「+(N−1)」的寬', m: { total: 3, visible: 1, plus: 2, plusW: 35, gap: 4, space: 104.6, hiddenW: [61.3, 50] }, expect: 'instrument' },
  { name: '收起的 Tag 量不到寬', m: { total: 2, visible: 1, plus: 1, plusW: 33, gap: 4, space: 10, hiddenW: [0] }, expect: 'instrument' },
]

async function selftest({ build }) {
  const bad = []
  for (const row of TABLE) {
    const v = judge(row.m)
    const kind = v.kind
    if (kind !== row.expect) bad.push(`判定表「${row.name}」:期望 ${row.expect},得到 ${kind}(${v.detail})`)
  }
  console.log(`(1) 判定表 ${TABLE.length} 列:${bad.length ? '✗' : '✓'}`)
  // (2) 真對照組:修好的建置上把 RDM-101 編輯格改成修前畫的樣子 → 逐格取樣必須在那一格紅
  requireStorybookBuild(build)
  const server = await startA11yStaticServer({ rootDirectory: build, defaultFile: 'iframe.html' })
  const browser = await launchBrowser()
  try {
    const page = await newPage(browser)
    for (const order of ['normal', 'forced']) {
      {
        await openAndSettle(page, storyUrl(server.origin, ROADMAP, order), ROADMAP, server.notFound)
        const c = await clickCell(page, 'RDM-101:tags', order, `[selftest ${order}]`)
        // (3) 強制時序生效:clickCell 在 forced 時已要求 > 0;這裡另記一行
        if (order === 'forced') console.log(`(3) 強制時序:點擊後 ${c.forced} 則排程訊息改走同一個工作 ✓`)
        // 進編輯,在那一格上疊一份「修前畫面」:Tag 區複製一份(backend 收掉、「+1」寫成「+2」),絕對定位疊在原處、透明、點不到。
        // 不直接改元件自己的 DOM:修好的元件看得到「+N」變寬(它比對每個數字的真寬),同一格就改回來 —— 改它只會量到它的自我修正,不是儀器。
        // 複製的那一份沒有任何元件在管,取樣器看到的就是修前那個畫面、同一個幾何。
        const sel = '[data-cell-id="RDM-101:tags"]'
        await cellToEdit(page, sel)
        const before = await page.evaluate(() => ({ frames: window.__tagRoom.frames, records: window.__tagRoom.records.length }))
        const done = await page.evaluate((s) => {
          const list = [...document.querySelectorAll(`${s} span.contents`)][0]
          const container = list?.parentElement
          if (!container) return false
          const fake = container.cloneNode(true)
          fake.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'))
          fake.setAttribute('data-selftest-fake', '')
          const kids = [...fake.querySelector('span.contents').children]
          const leaf = [...kids[kids.length - 1].querySelectorAll('*')].find((e) => !e.children.length && /^\+\d+$/.test(e.textContent.trim()))
          if (!kids[0] || !leaf) return false
          kids[0].hidden = true
          leaf.textContent = '+2'
          Object.assign(fake.style, { position: 'absolute', left: `${container.offsetLeft}px`, top: `${container.offsetTop}px`, width: `${container.getBoundingClientRect().width}px`, opacity: '0', pointerEvents: 'none' })
          container.after(fake)
          return true
        }, sel)
        if (!done) throw new InstrumentError(`[selftest ${order}] 找不到要改的 Tag 或 +N`)
        await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
        const out = await collect(page, { label: `[selftest ${order}] 改成修前畫面`, sinceFrame: before.frames, sinceRecord: before.records })
        await page.evaluate(() => document.querySelectorAll('[data-selftest-fake]').forEach((e) => e.remove()))
        const hit = out.findings.find((f) => f.includes('cell:RDM-101:tags') && f.includes('還有空位'))
        if (!hit) bad.push(`(2) [${order}] 把 RDM-101 改成修前「+2」之後沒紅(${out.findings.length} 筆:${out.findings.slice(0, 2).join(' / ')})`)
        else console.log(`(2) [${order}] 改成修前畫面 → 紅:${hit}`)
      }
    }
  } finally {
    await browser.close()
    await server.stop?.()
  }
  return bad
}

async function cellToEdit(page, sel) {
  if (await page.evaluate((s) => !!document.querySelector(`${s} [role="combobox"]`), sel)) return
  const box = await page.locator(sel).boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const settled = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
  if (!settled.ok || !(await page.evaluate((s) => !!document.querySelector(`${s} [role="combobox"]`), sel))) throw new InstrumentError('點不進編輯')
}

// ═══════════════════════════════════════════════════════════════════════════
const build = resolve(ROOT, arg('build', 'storybook-static'))
try {
  if (SELFTEST) {
    const bad = await selftest({ build })
    if (bad.length) { console.log(`\n✗ --selftest 失敗:\n  ${bad.join('\n  ')}`); process.exit(1) }
    console.log('\n✓ --selftest:判定表全對、疊上修前畫面兩種時序都紅、強制時序有生效')
  } else {
    const { findings, lines } = await run({ build })
    console.log(lines.join('\n'))
    if (findings.length) {
      console.log(`\n✗ ${findings.length} 格畫面「還有空位卻顯示 +N」或數字對不上(combobox.spec.md「單行溢出」):`)
      for (const f of findings.slice(0, 60)) console.log('  · ' + f)
      if (findings.length > 60) console.log(`  …另 ${findings.length - 60} 筆`)
      process.exit(1)
    }
    console.log(`\n✓ ${ORDERS.join(' / ')} 時序、上界內全部 story(清單 ${STORIES.length} 則有 Tag 列)與兩段改寬的每一格畫面都沒有「還有空位卻顯示 +N」`)
  }
} catch (error) {
  if (error instanceof InstrumentError) {
    console.log(`\n✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}(沒量到,不是產品裁決,也不算通過)`)
    process.exit(1)
  }
  throw error
}
