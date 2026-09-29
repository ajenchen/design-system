#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Dialog 與常駐區並存(`persistentElements`)時,**舞台鎖捲動、常駐區自己的捲動照常**;沒傳 persistentElements 的一般 modal
 *         照舊鎖(dialog.spec.md「並存」→「捲動」;待辦總帳 OE13,user 2026-09-29 原話「第二題照你建議」—— 建議由 AI 提出、user 採納)。
 *   紅: 對話框開著時在舞台空白處合成滾輪,舞台捲動容器的 scrollTop 動了 → 指名 Δ 並 exit 1;在常駐區可捲清單上滾了卻不動 → exit 1;
 *       一般 modal 開著時文件捲動了 → exit 1;開關對話框讓常駐側欄位移(跳版)→ exit 1。
 *       修法前(dialog.tsx 傳 persistentElements 即 modal={false},Radix 只在 modal 分支掛 RemoveScroll)舞台會被捲走 —— 本閘 --selftest
 *       的真對照組就是把鎖拆掉重量一次,量到的就是修法前的形狀。
 *   綠: 三次滾輪的 scrollTop 分別 = 不變 / 有動 / 不變,位移 0px。每次滾輪都先確認事件**真的送到頁面**(window 捕獲階段的見證人收到),
 *       再等 scrollTop 連續靜止 N 個影格才讀 —— 機器慢只會等久一點,不會提早取樣;沒送到 / 容器根本不可捲 = 儀器失效(INSTRUMENT-FAIL),不是綠。
 *   量法: 靜態站開並存夾具 story(Dialog/展示 `CoexistencePoc`,test-only)。夾具的舞台是 overflow-hidden、常駐側欄沒有清單,所以
 *         **閘在活的 DOM 裡把舞台改成可捲(overflow-y:auto + 3000px 撐高)、在側欄裡放一份可捲清單**(不改 story 檔;常駐節點 = `<aside>`
 *         本身,清單在它裡面就在 shard 裡)。先 Esc 關掉再點「開啟」重開一次:量常駐側欄左緣(關著 vs 重開)= 跳版,同時讓 shards 走第二次掛載。
 *         然後 `page.mouse.wheel` 三次:舞台空白處(舞台左下角往內,不在對話框矩形裡)/ 側欄清單中心 / 一般 modal(`OpenSnapshot` story,
 *         文件撐高 3000px)遮罩上的空白處;讀對應捲動容器的 scrollTop。判定抽成純函式 judge()。
 *   對照組(--selftest,兩面): (1) 判定表 —— 餵「舞台動了 / 常駐區不動 / 一般 modal 動了 / 跳版」必紅、「事件沒送到 / 容器不可捲」必判儀器失效、
 *         正確形狀必綠;(2) 真對照組 —— 在頁面上把鎖拆掉(document 捕獲階段吞掉 wheel / touchmove,react-remove-scroll 掛在 document 的
 *         監聽收不到事件;同時拿掉 body 的 `data-scroll-locked`,讓它的 overflow:hidden 失效),同一支量測必須量到舞台與文件真的捲動 →
 *         judge 必紅在「舞台」與「一般 modal」兩條。對照組會動、正式量不動,證明「不動」是鎖的功勞、不是儀器看不見捲動。
 *
 * 用法:node scripts/dialog-coexist-scroll-lock-invariant.mjs [--static=<storybook-static dir>] [--selftest]
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, settleAfterInteraction, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = path.resolve(staticArg ? staticArg.slice('--static='.length) : path.join(REPO, 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const COEXIST_STORY = 'design-system-components-dialog-展示--coexistence-poc'
const MODAL_STORY = 'design-system-components-dialog-展示--open-snapshot'
/** 每次合成滾輪的 deltaY(px)。 */
export const WHEEL_DELTA = 300
/** 撐高量(px):把舞台 / 文件撐到一定可捲。 */
const TALL_PX = 3000
/** scrollTop 連續靜止幾個影格才讀(與其他瀏覽器閘同量級)。 */
const SETTLE_FRAMES = 10 // 與其他瀏覽器閘同值(named-constant-drift 閘:同名常數不得有第二個值)
const SOURCES = [
  'packages/design-system/src/components/Dialog/dialog.tsx',
  'packages/design-system/src/components/Dialog/dialog.stories.tsx',
  'packages/design-system/src/lib/overlay-coexistence.ts',
]

// ═══════════════════════════════════════════════════════════════════════════
// 判定(純函式;正式跑與 --selftest 判定表共用)
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @typedef {{ before: number, after: number, delivered: boolean, scrollable: boolean }} WheelProbe
 * @param {{ stage: WheelProbe, persistent: WheelProbe, modal: WheelProbe, asideLeft: { closed: number, reopened: number } }} m
 * @returns {{ instrument: string[], failures: string[] }}  instrument 非空 = 沒量到(不是產品裁決);failures 非空 = 產品紅
 */
export function judge(m) {
  const instrument = []
  const failures = []
  for (const [name, r] of [['舞台', m?.stage], ['常駐區清單', m?.persistent], ['一般 modal 文件', m?.modal]]) {
    if (!r) { instrument.push(`${name}:沒有量測`); continue }
    if (!r.delivered) instrument.push(`${name}:滾輪事件沒有送到頁面(window 捕獲階段的見證人沒收到)—— 不能拿「沒動」當鎖住`)
    if (!r.scrollable) instrument.push(`${name}:捲動容器根本不可捲(scrollHeight ≤ clientHeight)—— 沒撐高就量,「沒動」是零證據`)
  }
  if (!m?.asideLeft || !Number.isFinite(m.asideLeft.closed) || !Number.isFinite(m.asideLeft.reopened)) instrument.push('跳版:沒量到常駐側欄左緣')
  if (instrument.length) return { instrument, failures }
  if (m.stage.after !== m.stage.before) failures.push(`並存:舞台被捲動了 scrollTop ${m.stage.before} → ${m.stage.after}(應鎖住)`)
  if (!(m.persistent.after > m.persistent.before)) failures.push(`並存:常駐區清單沒有捲動 scrollTop ${m.persistent.before} → ${m.persistent.after}(應照常可捲)`)
  if (m.modal.after !== m.modal.before) failures.push(`一般 modal:文件被捲動了 scrollTop ${m.modal.before} → ${m.modal.after}(應照舊鎖住)`)
  const shift = Math.abs(m.asideLeft.reopened - m.asideLeft.closed)
  if (shift > 0.5) failures.push(`並存:開對話框讓常駐側欄位移 ${shift}px(removeScrollBar 補寬應為 0)`)
  return { instrument, failures }
}

function judgeTableSelftest() {
  let ok = true
  const probe = (before, after, extra = {}) => ({ before, after, delivered: true, scrollable: true, ...extra })
  const good = { stage: probe(0, 0), persistent: probe(0, 240), modal: probe(0, 0), asideLeft: { closed: 980, reopened: 980 } }
  const expect = (why, m, pred) => {
    const v = judge(m)
    const pass = pred(v)
    if (!pass) ok = false
    console.log(`${pass ? '✓' : '✗'} 判定表:${why}${pass ? '' : ` —— 實得 ${JSON.stringify(v)}`}`)
  }
  expect('正確形狀必綠', good, (v) => v.failures.length === 0 && v.instrument.length === 0)
  expect('舞台動了必紅(修法前的形狀)', { ...good, stage: probe(0, 300) }, (v) => v.failures.length === 1 && /舞台/.test(v.failures[0]))
  expect('常駐區清單不動必紅', { ...good, persistent: probe(0, 0) }, (v) => v.failures.length === 1 && /常駐區清單/.test(v.failures[0]))
  expect('一般 modal 文件動了必紅', { ...good, modal: probe(0, 300) }, (v) => v.failures.length === 1 && /一般 modal/.test(v.failures[0]))
  expect('開對話框跳版必紅', { ...good, asideLeft: { closed: 980, reopened: 965 } }, (v) => v.failures.length === 1 && /位移 15px/.test(v.failures[0]))
  expect('事件沒送到 = 儀器失效,不是綠也不是產品紅', { ...good, stage: probe(0, 0, { delivered: false }) }, (v) => v.instrument.length === 1 && v.failures.length === 0)
  expect('容器不可捲 = 儀器失效', { ...good, modal: probe(0, 0, { scrollable: false }) }, (v) => v.instrument.length === 1 && v.failures.length === 0)
  expect('沒量到跳版 = 儀器失效', { ...good, asideLeft: { closed: NaN, reopened: 980 } }, (v) => v.instrument.length === 1 && v.failures.length === 0)
  return ok
}

// ═══════════════════════════════════════════════════════════════════════════
// 頁面端函式(以 page.evaluate 序列化傳入,不得引用外部變數)
// ═══════════════════════════════════════════════════════════════════════════
/** 滾輪見證人:window 捕獲階段最早收到(任何 stopPropagation 之前);冒泡階段記 defaultPrevented(react-remove-scroll 在 document 冒泡階段 preventDefault)。 */
function installWheelWitness() {
  const describe = (t) => (t instanceof Element
    ? `${t.tagName.toLowerCase()}${t.id ? `#${t.id}` : ''}${t.hasAttribute('data-coexistence-mask') ? '[data-coexistence-mask]' : ''}${t.hasAttribute('inert') ? '[inert]' : ''}`
    : String(t))
  const w = { count: 0, target: null, defaultPrevented: null }
  window.__scrollLockWitness = w
  window.addEventListener('wheel', (e) => { w.count++; w.target = describe(e.target); w.defaultPrevented = null }, { capture: true, passive: true })
  window.addEventListener('wheel', (e) => { w.defaultPrevented = e.defaultPrevented }, { passive: true })
  return true
}

/** 對照組:把鎖拆掉 —— document 捕獲階段吞掉 wheel / touchmove(react-remove-scroll 掛在 document 的監聽收不到),拿掉 body 的 data-scroll-locked(overflow:hidden 失效)。 */
function disarmScrollLock() {
  document.addEventListener('wheel', (e) => e.stopPropagation(), { capture: true })
  document.addEventListener('touchmove', (e) => e.stopPropagation(), { capture: true })
  document.body.removeAttribute('data-scroll-locked')
  return { bodyOverflow: getComputedStyle(document.body).overflowY }
}

/** 並存夾具:舞台改成可捲 + 撐高;側欄放可捲清單(常駐節點 = aside 本身,清單在它裡面)。 */
function prepareCoexistFixture({ tall }) {
  const mask = document.querySelector('[data-coexistence-mask]')
  const stage = mask?.parentElement
  const aside = document.getElementById('coexist-aside')
  if (!stage || !aside) return { ok: false, reason: `找不到 ${!stage ? '舞台(遮罩的父節點)' : ''}${!aside ? ' 常駐側欄 #coexist-aside' : ''}` }
  stage.style.overflowY = 'auto'
  if (!document.getElementById('scroll-lock-probe-spacer')) {
    const spacer = document.createElement('div')
    spacer.id = 'scroll-lock-probe-spacer'
    spacer.style.cssText = `flex:none;height:${tall}px`
    stage.appendChild(spacer)
  }
  if (!document.getElementById('scroll-lock-probe-list')) {
    const list = document.createElement('ul')
    list.id = 'scroll-lock-probe-list'
    list.setAttribute('aria-label', '評論清單(閘注入)')
    list.style.cssText = 'height:160px;overflow-y:auto;margin:0;padding:0;list-style:none'
    for (let i = 1; i <= 60; i++) {
      const li = document.createElement('li')
      li.style.cssText = 'height:28px;line-height:28px'
      li.textContent = `評論 ${i}`
      list.appendChild(li)
    }
    aside.appendChild(list)
  }
  return { ok: true, stageScrollable: stage.scrollHeight > stage.clientHeight }
}

/** 一般 modal:把 story 根節點撐高,文件才可捲。 */
function prepareModalFixture({ tall }) {
  const root = document.getElementById('storybook-root') || document.body
  if (!document.getElementById('scroll-lock-probe-spacer')) {
    const spacer = document.createElement('div')
    spacer.id = 'scroll-lock-probe-spacer'
    spacer.style.cssText = `height:${tall}px`
    root.appendChild(spacer)
  }
  const se = document.scrollingElement
  return { ok: true, docScrollable: se.scrollHeight > se.clientHeight, bodyLocked: document.body.hasAttribute('data-scroll-locked') }
}

/** 並存:滾輪落點 —— 舞台左下角往內(不在對話框矩形裡)、側欄清單中心;附 elementFromPoint 作證。 */
function pickCoexistPoints() {
  const mask = document.querySelector('[data-coexistence-mask]')
  const stage = mask?.parentElement
  const dialog = document.querySelector('[role="dialog"][data-state="open"]')
  const list = document.getElementById('scroll-lock-probe-list')
  if (!stage || !dialog || !list) return { ok: false, reason: `找不到 ${!stage ? '舞台' : ''}${!dialog ? ' 開著的對話框' : ''}${!list ? ' 注入的清單' : ''}` }
  const S = stage.getBoundingClientRect(), D = dialog.getBoundingClientRect(), L = list.getBoundingClientRect()
  const stagePoint = { x: S.left + 40, y: S.bottom - 40 }
  const inDialog = stagePoint.x >= D.left && stagePoint.x <= D.right && stagePoint.y >= D.top && stagePoint.y <= D.bottom
  const listPoint = { x: L.left + L.width / 2, y: L.top + L.height / 2 }
  const hit = (p) => { const e = document.elementFromPoint(p.x, p.y); return e ? `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${e.hasAttribute('data-coexistence-mask') ? '[data-coexistence-mask]' : ''}` : null }
  return { ok: !inDialog, reason: inDialog ? '舞台落點落在對話框矩形裡' : '', stagePoint, listPoint, stageHit: hit(stagePoint), listHit: hit(listPoint), listInsideAside: !!list.closest('#coexist-aside') }
}

/** 一般 modal:遮罩上的空白處(視窗左下角往內,不在對話框矩形裡)。 */
function pickModalPoint() {
  const dialog = document.querySelector('[role="dialog"][data-state="open"]')
  if (!dialog) return { ok: false, reason: '找不到開著的對話框' }
  const D = dialog.getBoundingClientRect()
  const point = { x: 24, y: innerHeight - 24 }
  const inDialog = point.x >= D.left && point.x <= D.right && point.y >= D.top && point.y <= D.bottom
  const e = document.elementFromPoint(point.x, point.y)
  return { ok: !inDialog, reason: inDialog ? '落點落在對話框矩形裡' : '', point, hit: e ? `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${e.getAttribute('data-state') ? `[data-state=${e.getAttribute('data-state')}]` : ''}` : null }
}

/** 讀捲動容器(which:stage / list / doc)的 scrollTop 與可捲性。 */
function readScroller(which) {
  const el = which === 'stage' ? (document.querySelector('[data-coexistence-mask]')?.parentElement ?? null)
    : which === 'list' ? document.getElementById('scroll-lock-probe-list')
    : which === 'doc' ? document.scrollingElement : null
  if (!el) return null
  return { scrollTop: el.scrollTop, scrollable: el.scrollHeight > el.clientHeight, witnessCount: window.__scrollLockWitness?.count ?? -1 }
}

/** scrollTop 連續 frames 個影格不變才回(捲動不改 DOM,MutationObserver 看不到;逐影格讀);capMs 只是「等不到」的上限。 */
function waitScrollSettled({ which, frames, capMs }) {
  const el = which === 'stage' ? (document.querySelector('[data-coexistence-mask]')?.parentElement ?? null)
    : which === 'list' ? document.getElementById('scroll-lock-probe-list')
    : which === 'doc' ? document.scrollingElement : null
  if (!el) return Promise.resolve({ ok: false, reason: `找不到捲動容器 ${which}` })
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
  return (async () => {
    let last = el.scrollTop, quiet = 0, framesWaited = 0, changes = 0
    const start = performance.now()
    while (quiet < frames) {
      if (performance.now() - start > capMs) return { ok: false, reason: `scrollTop ${capMs}ms 內沒有靜止`, scrollTop: el.scrollTop, framesWaited, changes }
      await frame(); framesWaited++
      const now = el.scrollTop
      if (now !== last) { changes++; quiet = 0; last = now } else quiet++
    }
    return { ok: true, scrollTop: el.scrollTop, scrollable: el.scrollHeight > el.clientHeight, framesWaited, changes, witness: { ...window.__scrollLockWitness } }
  })()
}

// ═══════════════════════════════════════════════════════════════════════════
// 瀏覽器量測
// ═══════════════════════════════════════════════════════════════════════════
class ProbeSetupError extends Error {}
const fail = (reason) => { throw new ProbeSetupError(reason) }

/** 在 point 合成一次滾輪,回 { before, after, delivered, scrollable, witness } —— 先確認事件送到,再等 scrollTop 靜止。 */
async function wheelAndMeasure(page, point, which) {
  const before = await page.evaluate(readScroller, which)
  if (!before) fail(`找不到捲動容器 ${which}`)
  await page.mouse.move(point.x, point.y)
  await page.mouse.wheel(0, WHEEL_DELTA)
  const delivered = await page.waitForFunction((n) => (window.__scrollLockWitness?.count ?? -1) > n, before.witnessCount, { timeout: 5000, polling: 'raf' }).then(() => true, () => false)
  const settled = await page.evaluate(waitScrollSettled, { which, frames: SETTLE_FRAMES, capMs: 4000 })
  if (!settled.ok) fail(`${which}:${settled.reason}(scrollTop ${before.scrollTop} → ${settled.scrollTop},等了 ${settled.framesWaited} 格)`)
  return { before: before.scrollTop, after: settled.scrollTop, delivered, scrollable: settled.scrollable, witness: settled.witness, framesWaited: settled.framesWaited, changes: settled.changes }
}

const describeProbe = (r) => `scrollTop ${r.before} → ${r.after}(事件${r.delivered ? '已送到' : '沒送到'},落在 ${r.witness?.target ?? '?'},defaultPrevented=${r.witness?.defaultPrevented},容器${r.scrollable ? '可捲' : '不可捲'},靜止等了 ${r.framesWaited} 格 / 變動 ${r.changes} 次)`

/**
 * 三處量測。disarm = true 時每個 story 開好之後先把鎖拆掉(對照組)。
 * @returns {Promise<{ stage, persistent, modal, asideLeft, notes: string[] }>}
 */
async function measure(page, origin, notFound, { disarm }) {
  const story = (id) => `${origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`
  const notes = []
  const waitOpen = () => page.waitForFunction(() => !!document.querySelector('[role="dialog"][data-state="open"]'), null, { timeout: 15000, polling: 'raf' }).then(() => true, () => false)
  const settle = async (label) => { const s = await settleAfterInteraction(page, { frames: SETTLE_FRAMES }); if (!s.ok) fail(`${label}:版面 10 秒內沒有連續靜止 ${SETTLE_FRAMES} 個影格`) }

  // ── 並存夾具 ────────────────────────────────────────────────────────────
  await openStory(page, story(COEXIST_STORY), { waitFor: '#coexist-aside-input', settleFrames: SETTLE_FRAMES, notFound })
  await page.evaluate(installWheelWitness)
  const prep = await page.evaluate(prepareCoexistFixture, { tall: TALL_PX })
  if (!prep.ok) fail(`並存夾具改造失敗:${prep.reason}`)
  await settle('並存夾具改造後')
  // 關 → 量側欄左緣 → 重開 → 量(跳版;也讓 shards 走第二次掛載)
  await page.focus('#coexist-inside-input')
  await page.keyboard.press('Escape')
  const closed = await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, { timeout: 15000, polling: 'raf' }).then(() => true, () => false)
  if (!closed) fail('Esc 沒有關掉並存對話框(關閉動畫 15 秒內沒卸載)')
  await settle('關閉後')
  const asideLeftClosed = await page.evaluate(() => document.getElementById('coexist-aside')?.getBoundingClientRect().left ?? NaN)
  await page.evaluate(() => document.getElementById('coexist-background-btn')?.click())
  if (!(await waitOpen())) fail('點「開啟」後 15 秒內沒等到並存對話框重開')
  await settle('重開後')
  const asideLeftReopened = await page.evaluate(() => document.getElementById('coexist-aside')?.getBoundingClientRect().left ?? NaN)
  if (disarm) notes.push(`對照組:並存夾具拆鎖 → body overflow ${JSON.stringify(await page.evaluate(disarmScrollLock))}`)
  const points = await page.evaluate(pickCoexistPoints)
  if (!points.ok) fail(`並存落點:${points.reason}`)
  notes.push(`並存落點:舞台 (${Math.round(points.stagePoint.x)}, ${Math.round(points.stagePoint.y)}) 命中 ${points.stageHit};清單 (${Math.round(points.listPoint.x)}, ${Math.round(points.listPoint.y)}) 命中 ${points.listHit},清單在常駐側欄裡=${points.listInsideAside}`)
  const stage = await wheelAndMeasure(page, points.stagePoint, 'stage')
  const persistent = await wheelAndMeasure(page, points.listPoint, 'list')

  // ── 一般 modal(預設路徑)────────────────────────────────────────────────
  await openStory(page, story(MODAL_STORY), { waitFor: '[role="dialog"][data-state="open"]', settleFrames: SETTLE_FRAMES, notFound })
  await page.evaluate(installWheelWitness)
  const mprep = await page.evaluate(prepareModalFixture, { tall: TALL_PX })
  notes.push(`一般 modal:文件撐高後可捲=${mprep.docScrollable},body[data-scroll-locked]=${mprep.bodyLocked}`)
  await settle('一般 modal 撐高後')
  if (disarm) notes.push(`對照組:一般 modal 拆鎖 → body overflow ${JSON.stringify(await page.evaluate(disarmScrollLock))}`)
  const mp = await page.evaluate(pickModalPoint)
  if (!mp.ok) fail(`一般 modal 落點:${mp.reason}`)
  notes.push(`一般 modal 落點:(${mp.point.x}, ${mp.point.y}) 命中 ${mp.hit}`)
  const modal = await wheelAndMeasure(page, mp.point, 'doc')

  return { stage, persistent, modal, asideLeft: { closed: asideLeftClosed, reopened: asideLeftReopened }, notes }
}

async function withBrowser(run) {
  requireFreshStorybookBuild(STATIC, SOURCES)
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
  if (!browser) return null
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    return await run(page, server.origin, server.notFound)
  } finally {
    await browser.close()
    await server.stop()
    if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', '))
  }
}

function printMeasurement(m) {
  for (const line of m.notes) console.log(`  · ${line}`)
  console.log(`  舞台(並存)      ${describeProbe(m.stage)}`)
  console.log(`  常駐區清單(並存) ${describeProbe(m.persistent)}`)
  console.log(`  文件(一般 modal) ${describeProbe(m.modal)}`)
  console.log(`  常駐側欄左緣:關著 ${m.asideLeft.closed} / 重開 ${m.asideLeft.reopened}(位移 ${Math.abs(m.asideLeft.reopened - m.asideLeft.closed)}px)`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    if (SELFTEST) {
      const tableOk = judgeTableSelftest()
      if (!tableOk) { console.error('❌ dialog-coexist-scroll-lock selftest FAIL:判定表對照組沒過'); process.exit(1) }
      // 真對照組:拆掉鎖之後,同一支量測必須看到舞台與文件捲動
      const m = await withBrowser((page, origin, notFound) => measure(page, origin, notFound, { disarm: true }))
      if (m === null) process.exit(0) // launchBrowserOrSkip 已印 SKIPPED-ENV / BROWSER-REQUIRED
      printMeasurement(m)
      const v = judge(m)
      if (v.instrument.length) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:對照組沒量到 —— ${v.instrument.join(';')}`); process.exit(1) }
      const stageRed = v.failures.some((f) => /舞台被捲動/.test(f))
      const modalRed = v.failures.some((f) => /文件被捲動/.test(f))
      if (!stageRed || !modalRed) {
        console.error(`❌ dialog-coexist-scroll-lock selftest FAIL:把鎖拆掉後閘應該紅在「舞台」與「一般 modal」,實得 ${JSON.stringify(v.failures)} —— 這支閘的綠燈是零證據`)
        process.exit(1)
      }
      console.log(`✅ dialog-coexist-scroll-lock selftest PASS(判定表 8 題 + 真對照組:拆鎖後舞台 ${m.stage.before}→${m.stage.after}、文件 ${m.modal.before}→${m.modal.after} 都被抓到)`)
      process.exit(0)
    }
    const m = await withBrowser((page, origin, notFound) => measure(page, origin, notFound, { disarm: false }))
    if (m === null) process.exit(0)
    printMeasurement(m)
    const v = judge(m)
    if (v.instrument.length) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:沒量到 —— ${v.instrument.join(';')}(儀器失效,不是產品裁決)`); process.exit(1) }
    if (v.failures.length) { console.error('❌ dialog-coexist-scroll-lock FAIL:\n  ' + v.failures.join('\n  ')); process.exit(1) }
    console.log('✅ dialog-coexist-scroll-lock PASS(並存:舞台鎖住、常駐區清單照常可捲、開關無跳版;一般 modal 照舊鎖住)')
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}`); process.exit(1) }
    if (error instanceof ProbeSetupError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}(儀器失效,不是產品裁決)`); process.exit(1) }
    throw error
  }
}
