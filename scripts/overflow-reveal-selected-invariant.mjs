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
// neutralize:'none' | 'before-action'(每種輸入動作前一刻注入)。回傳 { cells, totals }
async function scanBuild(staticDir, { fresh = true, neutralize = 'none', log = console.log } = {}) {
  if (fresh) requireFreshStorybookBuild(staticDir, SOURCES)
  const server = await startA11yStaticServer({ rootDirectory: staticDir, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip()
  if (!browser) { await server.stop(); return null }
  const cells = []
  const totals = { cells: 0, nonClamped: Object.fromEntries(INPUTS.map((i) => [i, 0])) }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    for (const strip of STRIPS) {
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
        await page.evaluate((i) => { const sc = document.querySelectorAll('[data-overflow-scroller]')[i]; sc.scrollLeft = 0 }, strip.scroller)
        await still('歸零')
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
      await open()
      const hitPick = await page.evaluate(([scIndex, itemSel]) => {
        const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
        const s = sc.getBoundingClientRect()
        const items = [...sc.querySelectorAll(itemSel)]
        for (let i = 0; i < items.length; i += 1) {
          const r = items[i].getBoundingClientRect()
          if (r.right <= s.right - 48 || r.left >= s.right) continue // 完整在可讀區(以最寬的 48px 遮擋估)或整顆在外
          const y = (r.top + r.bottom) / 2
          for (let x = Math.min(r.right, s.right) - 2; x > Math.max(r.left, s.left); x -= 2) {
            const hit = document.elementFromPoint(x, y)
            if (hit && (hit === items[i] || items[i].contains(hit))) return { i, x, y }
          }
        }
        return null
      }, [strip.scroller, strip.item])
      if (!hitPick) throw fail(strip.story, `${strip.label} 歸零後找不到右側沒有完整可讀、又點得到的項目(這一排沒有溢出?)`)
      const pi = hitPick.i
      const pt = { x: hitPick.x, y: hitPick.y }
      await before()
      await page.mouse.click(pt.x, pt.y)
      await still('點擊')
      await record('click', '', pi)
      const clickedIndex = pi

      // 2. 縮放視窗(承上:剛點的那一項是上一次揭露的項目)
      const w0 = await page.evaluate((i) => document.querySelectorAll('[data-overflow-scroller]')[i].clientWidth, strip.scroller)
      await before()
      await page.setViewportSize({ width: strip.narrowTo, height: strip.viewport.height })
      await still('縮放視窗')
      let w1 = await page.evaluate((i) => document.querySelectorAll('[data-overflow-scroller]')[i].clientWidth, strip.scroller)
      let how = `視窗 ${strip.viewport.width} → ${strip.narrowTo}`
      if (Math.abs(w1 - w0) < 16) {
        // 展示 story 的外框寫死寬度,視窗縮放碰不到捲動容器 → 直接縮捲動容器的父層(同一個觸發:容器尺寸改變)
        await page.evaluate(([i, w]) => { const sc = document.querySelectorAll('[data-overflow-scroller]')[i]; sc.parentElement.style.width = `${w}px` }, [strip.scroller, Math.round(w0 - 64)])
        await still('縮容器')
        w1 = await page.evaluate((i) => document.querySelectorAll('[data-overflow-scroller]')[i].clientWidth, strip.scroller)
        how = `外框寫死寬度 → 父層 ${Math.round(w0 - 64)}px`
      }
      if (Math.abs(w1 - w0) < 16) throw fail(strip.story, `${strip.label} 縮放後捲動容器寬度沒變(${w0} → ${w1})`)
      await record('resize', `(${how},容器 ${w0} → ${w1})`, clickedIndex)

      // 3. 方向鍵:Tab 進入這一排(或檢視器)後連按 → 每一步都量
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

      // 4. ⌄ 選單選取:第一個沒有完整可讀的項目(伸進右側淡出區或在容器外;不是最後一項)、最後一項
      if (strip.menu) {
        for (const which of ['partial', 'last']) {
          await open()
          const list = await page.evaluate(listInPage, [strip.scroller, strip.item])
          const ti = which === 'last' ? list.length - 1 : list.findIndex((it, i) => i < list.length - 1 && it.right > it.scW - 16)
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
      log(`  ${strip.label}:${cells.filter((c) => c.strip === strip.key).map((c) => `${c.input}${c.ok ? '✓' : '✗'}`).join(' ')}`)
    }
  } finally { await browser.close(); await server.stop() }
  return { cells, totals }
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
    console.log(`✅ overflow-reveal-selected PASS(${result.cells.length} 格:${STRIPS.length} 排 × 點擊 / 方向鍵 / 選單 / 縮放;需要置中的 點擊 ${n.click}、方向鍵 ${n.keys}、選單 ${n.menu}、縮放 ${n.resize} 格全在中心 ±${CENTER_TOLERANCE_PX}px,其餘合法夾住且完整可讀)`)
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${error.message}`); process.exit(1) }
    throw error
  }
}
