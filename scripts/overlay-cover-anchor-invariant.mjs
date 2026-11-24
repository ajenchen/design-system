#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: `PopoverContent coverAnchor`(蓋在錨點上 / 展開型;`packages/design-system/src/components/Popover/popover.spec.md`「蓋在錨點上(展開型)」)
 *         的浮層,畫面上:
 *         C  中心 = 錨點中心(水平 + 垂直);碰到視窗邊被推回、離邊 8px —— 推回的量 = 規格公式算出來的量(容差 1px)。
 *            錨點位置 6 種(四個角落、正中間、視窗下緣中間)× 內容 3 種高(短 / 高 / 比視窗還高),全部逐格量。
 *         H  內容比視窗還高時:浮層高 = 視窗高 − 16(可用高 = 視窗高 − 上下各 8,`tokens/elevation/overlay-geometry.ts`
 *            `OVERLAY_COVER_AVAILABLE_HEIGHT`);標題列固定在浮層頂端、內文區自己捲 —— 內文捲 100px 後標題列位置不變、內文區頂邊 = 標題列底邊。
 *         期望值由本檔照規格算(`clamp(錨點中心 − 一半, 8, 視窗 − 8 − 尺寸)`),不 import 元件常數 —— 讀元件常數就成了自己驗自己。
 *   紅: 任一格位置 / 高度不符 → 逐列點名 exit 1。`--selftest` 在 DS 原始碼上各造一個根因突變(MUTANTS),每個突變必須**剛好**紅它負責的那幾列,
 *       契約列每一條都要被某個突變弄紅過;對照列(R:一般 virtualRef 浮層照舊貼在錨點下方 8px、水平置中 —— PopoverAnchor 改交虛擬錨點給 Radix
 *       之後,沒開 coverAnchor 的浮層畫面不得變)在現行原始碼與每個突變上都綠。
 *   綠: 現行原始碼每列都量到且符合。harness 載不起來 / 元素找不到 / 位置等不到靜止 = 儀器失效(INSTRUMENT-FAIL,exit 1),不得讀成通過。
 *   註: 2026-11-24 新增(OVERLAY-CAPABILITIES ①;總帳 Q2b(定)「以格子為中心(水平 + 垂直)」、C9 高度走 capHeight)。不需要 storybook
 *       (DS 原始碼打包進空白頁,`scripts/lib/ds-source-harness.mjs`;樣式用同一棵樹編出來的 DS CSS)。POC 在實作前證明 Radix Popper 做得到:
 *       虛擬錨點的 getBoundingClientRect 在 floating-ui 每次定位時回「算好的左上角」、Content side=bottom / align=start / 間距 0 / 不由 Radix 推回
 *       (popover.tsx `useCoverAwareAnchor` 上方的說明)。
 *
 * 用法:
 *   node scripts/overlay-cover-anchor-invariant.mjs              判定(現行原始碼)
 *   node scripts/overlay-cover-anchor-invariant.mjs --selftest   對照組(全部單一根因突變;基準 = 一趟完整判定)
 *   node scripts/overlay-cover-anchor-invariant.mjs --root=<dir> 改量另一棵原始碼(例:修改前的基準樹 —— 那裡沒有 coverAnchor,C / H 列全紅)
 */
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip } from './lib/launch-browser.mjs'
import { InstrumentError, REPO_ROOT, WAIT_CAP_MS, bundleDsHarness, compileDsCss, mountHarness, mutantFor, replaceOnce, resolveSourceRoot } from './lib/ds-source-harness.mjs'

const SELFTEST = process.argv.includes('--selftest')
const SOURCE_ROOT = resolveSourceRoot()
const VIEWPORT = { width: 1280, height: 720 }
/** 規格值(popover.spec.md「蓋在錨點上(展開型)」:碰邊推回、離邊 8;可用高 = 視窗高 − 上下各 8)—— 刻意不 import 元件常數 */
const PAD = 8
const CELL = { width: 140, height: 110 }
const CELLS = {
  'top-left': [0, 0], 'top-right': [VIEWPORT.width - CELL.width, 0], middle: [570, 300],
  'bottom-left': [0, VIEWPORT.height - CELL.height], 'bottom-mid': [570, VIEWPORT.height - CELL.height], 'bottom-right': [VIEWPORT.width - CELL.width, VIEWPORT.height - CELL.height],
}
/** 列數 → 內容高:短(放得下)/ 高(中間放得下、貼邊要推回)/ 比視窗還高(被可用高夾住) */
const ROWS = { short: 3, tall: 16, over: 60 }

/** 碰到視窗邊、要推回的那幾格 = 正中間的短 / 高內容以外全部(正中間 × 比視窗還高:內容 704 > 錨點中心到頂 355 × 2,也要推回 5) */
const PUSHED = Object.keys(CELLS).flatMap((c) => Object.keys(ROWS).map((r) => `C-${c}-${r}`)).filter((id) => id !== 'C-middle-short' && id !== 'C-middle-tall')
const MUTANTS = [
  {
    id: 'cover-not-computed',
    what: '虛擬錨點不算位置(PopoverContent 不把自己交給 PopoverAnchor 的虛擬錨點 —— 浮層落在 Radix 預設的錨點下方、左緣對齊)',
    file: 'components/Popover/popover.tsx',
    expectRed: Object.keys(CELLS).flatMap((c) => Object.keys(ROWS).map((r) => `C-${c}-${r}`)),
    apply: (src) => replaceOnce(src, /anchorRegistry\.coverContent\.current = node && coverRef\.current \? node : null/, 'anchorRegistry.coverContent.current = null'),
  },
  {
    id: 'cover-no-clamp',
    what: '只置中、不推回(碰到視窗邊的浮層超出畫面)',
    file: 'tokens/elevation/overlay-geometry.ts',
    expectRed: PUSHED,
    apply: (src) => replaceOnce(src, /Math\.max\(padding, Math\.min\(start \+ length \/ 2 - own \/ 2, limit - padding - own\)\)/, 'start + length / 2 - own / 2'),
  },
  {
    id: 'cover-padding-zero',
    what: '推回時不留 8px(貼死視窗邊)',
    file: 'tokens/elevation/overlay-geometry.ts',
    expectRed: PUSHED,
    apply: (src) => replaceOnce(src, /padding: number = OVERLAY_COLLISION_PADDING/, 'padding: number = 0'),
  },
  {
    id: 'cover-radix-available',
    what: '高度上限照錨定浮層的可用高(Radix 算的「觸發點那一側剩多少」)—— 蓋在錨點上的浮層沒有「哪一側」',
    file: 'components/Popover/popover.tsx',
    expectRed: ['H-over-viewport'],
    apply: (src) => replaceOnce(src, /capHeight\(coverAnchor \? OVERLAY_COVER_AVAILABLE_HEIGHT : OVERLAY_AVAILABLE_HEIGHT, maxHeight\)/, 'capHeight(OVERLAY_AVAILABLE_HEIGHT, maxHeight)'),
  },
  {
    id: 'cover-no-scroll-chain',
    what: 'PopoverContent 外殼拿掉 flex 鏈(標題列跟著內容一起捲走 / 內文區不自己捲)',
    file: 'components/Popover/popover.tsx',
    expectRed: ['H-over-viewport'],
    apply: (src) => replaceOnce(src, /"flex flex-col overflow-hidden min-h-0",/, '"",'),
  },
]

const HARNESS = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { Popover, PopoverAnchor, PopoverContent, PopoverHeader, PopoverTitle, PopoverBody } from '@/design-system/components/Popover/popover'

function Scene() {
  const [s, setS] = React.useState(null)
  window.__scene = setS
  const cellRef = React.useRef(null)
  if (!s) return <p id="idle">待命</p>
  return (
    <div>
      <div ref={cellRef} id="cell" style={{ position: 'fixed', left: s.x, top: s.y, width: ${CELL.width}, height: ${CELL.height}, outline: '1px solid' }}>7月15日</div>
      <Popover open>
        <PopoverAnchor virtualRef={cellRef} />
        <PopoverContent id="content" coverAnchor={s.cover} onOpenAutoFocus={(e) => e.preventDefault()}>
          <PopoverHeader><PopoverTitle>7月15日週三</PopoverTitle></PopoverHeader>
          <PopoverBody data-body>
            {Array.from({ length: s.rows }, (_, i) => <div key={i} style={{ height: 24 }}>第 {i + 1} 個事件</div>)}
          </PopoverBody>
        </PopoverContent>
      </Popover>
    </div>
  )
}
createRoot(document.getElementById('root')).render(<TooltipProvider><main id="ready"><Scene /></main></TooltipProvider>)
`

async function runChecks(page) {
  const checks = []
  const check = (id, kind, title, pass, detail) => checks.push({ id, kind, title, pass: !!pass, detail })
  /** 換場景:先清空、再掛新場景,等浮層位置連續 3 個影格不動(不用固定睡眠) */
  const scene = async (s) => {
    await page.evaluate(() => window.__scene(null))
    await page.waitForSelector('#idle', { state: 'attached', timeout: WAIT_CAP_MS }).catch(() => { throw new InstrumentError('場景清不掉') })
    await page.evaluate((x) => window.__scene(x), s)
    await page.waitForSelector('#content', { state: 'attached', timeout: WAIT_CAP_MS }).catch(() => { throw new InstrumentError('浮層沒有打開') })
    const ok = await page.waitForFunction(() => new Promise((res) => {
      const el = document.getElementById('content'); let last = '', same = 0
      const tick = () => {
        const r = el.getBoundingClientRect()
        const k = [r.left, r.top, r.width, r.height, getComputedStyle(el.parentElement).visibility].join()
        same = k === last ? same + 1 : 0; last = k
        same >= 3 ? res(true) : requestAnimationFrame(tick)
      }
      tick()
    }), null, { timeout: WAIT_CAP_MS }).then(() => true, () => false)
    if (!ok) throw new InstrumentError(`浮層位置 ${WAIT_CAP_MS}ms 內等不到靜止`)
  }
  const measure = () => page.evaluate(() => {
    const el = document.getElementById('content')
    const box = (n) => { const r = n.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, b: r.bottom } }
    const header = el.querySelector('[data-slot="surface-header"], header, [data-popover-header]') ?? el.firstElementChild
    const body = el.querySelector('[data-body]')
    return { c: box(el), cell: box(document.getElementById('cell')), header: header ? box(header) : null, body: body ? { ...box(body), sh: body.scrollHeight, ch: body.clientHeight } : null, visible: getComputedStyle(el.parentElement).visibility !== 'hidden' }
  })
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi))

  for (const [cname, [x, y]] of Object.entries(CELLS)) {
    for (const [rname, rows] of Object.entries(ROWS)) {
      await scene({ cover: true, x, y, rows })
      const m = await measure()
      const cx = m.cell.l + m.cell.w / 2, cy = m.cell.t + m.cell.h / 2
      const want = { l: clamp(cx - m.c.w / 2, PAD, VIEWPORT.width - PAD - m.c.w), t: clamp(cy - m.c.h / 2, PAD, VIEWPORT.height - PAD - m.c.h) }
      const push = { x: +(want.l - (cx - m.c.w / 2)).toFixed(1), y: +(want.t - (cy - m.c.h / 2)).toFixed(1) }
      const err = { x: +(m.c.l - want.l).toFixed(2), y: +(m.c.t - want.t).toFixed(2) }
      check(`C-${cname}-${rname}`, 'contract', `蓋在錨點上:錨點 ${cname} × 內容 ${rname} → 中心 = 錨點中心、碰邊推回離邊 ${PAD}(應推回 x ${push.x} / y ${push.y})`,
        m.visible && Math.abs(err.x) <= 1 && Math.abs(err.y) <= 1, { want, got: { l: m.c.l, t: m.c.t, w: m.c.w, h: m.c.h }, push, err, visible: m.visible })
    }
  }

  // H:比視窗還高 → 高 = 視窗高 − 16;標題列固定、內文區自己捲(捲 100 之後標題列不動、內文頂邊 = 標題列底邊)
  await scene({ cover: true, x: 570, y: 300, rows: ROWS.over })
  const before = await measure()
  await page.evaluate(() => { document.querySelector('[data-body]').scrollTop = 100 })
  await page.waitForFunction(() => document.querySelector('[data-body]').scrollTop === 100, null, { timeout: WAIT_CAP_MS }).catch(() => {})
  const after = await measure()
  const scrolled = await page.evaluate(() => document.querySelector('[data-body]').scrollTop)
  const hOk = Math.abs(before.c.h - (VIEWPORT.height - 2 * PAD)) <= 1
  const headerFixed = !!before.header && !!after.header && Math.abs(after.header.t - before.header.t) <= 0.5 && Math.abs(after.header.t - before.c.t - 1) <= 1.5
  const bodyScrolls = scrolled === 100 && !!after.body && after.body.sh > after.body.ch && Math.abs(after.body.t - after.header.b) <= 0.5
  check('H-over-viewport', 'contract', `內容比視窗還高 → 浮層高 = 視窗高 − ${2 * PAD}、標題列固定在頂端、內文區自己捲(捲 100 後標題列不動、內文頂邊 = 標題列底邊)`,
    hOk && headerFixed && bodyScrolls, { height: before.c.h, want: VIEWPORT.height - 2 * PAD, header: [before.header, after.header], body: after.body, scrolled })

  // R(對照):沒開 coverAnchor 的 virtualRef 浮層照舊 —— 貼在錨點下方 8、水平置中(PopoverAnchor 改交穩定的虛擬錨點給 Radix,畫面不得變)
  await scene({ cover: false, x: 570, y: 300, rows: ROWS.short })
  const r = await measure()
  const rx = r.cell.l + r.cell.w / 2
  check('R-plain-virtual', 'control', '沒開 coverAnchor 的 virtualRef 浮層:頂邊 = 錨點底邊 + 8、水平置中於錨點',
    r.visible && Math.abs(r.c.t - (r.cell.b + 8)) <= 1 && Math.abs(r.c.l + r.c.w / 2 - rx) <= 1, { got: r.c, cell: r.cell })
  return checks
}

async function runVariant(page, label, mutate) {
  const code = await bundleDsHarness({ root: SOURCE_ROOT, harness: HARNESS, harnessName: 'overlay-cover-anchor-harness.tsx', mutate })
  mutate?.assertApplied?.()
  const { pageErrors, dispose } = await mountHarness(page, code, '#ready')
  try {
    await page.addStyleTag({ content: STYLE })
    const checks = await runChecks(page)
    if (pageErrors.length) throw new InstrumentError(`頁面例外:${pageErrors.join(' | ')}`)
    return { label, checks }
  } finally {
    dispose()
  }
}

function report({ label, checks }) {
  console.log(`\n── ${label} ──`)
  for (const c of checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.id.padEnd(22)} ${c.kind === 'control' ? '[對照] ' : ''}${c.title}`)
    if (!c.pass) console.log(`      實得:${JSON.stringify(c.detail)}`)
  }
}
const redIds = (checks) => checks.filter((c) => !c.pass).map((c) => c.id).sort()

const STYLE = await compileDsCss({ root: SOURCE_ROOT, extraSources: [HARNESS] })
let browser
try {
  browser = await launchBrowserOrSkip({}, { hint: '這支閘不需要 storybook 建置,只需要 Chromium' })
  const page = await (await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' })).newPage()
  const rootLabel = SOURCE_ROOT === REPO_ROOT ? '本 repo' : SOURCE_ROOT
  if (!SELFTEST) {
    const result = await runVariant(page, `原始碼 = ${rootLabel}`, null)
    report(result)
    const red = redIds(result.checks)
    if (red.length) {
      console.log(`\n✗ 蓋在錨點上的浮層:${red.length} 條不符(${red.join(' / ')})—— SSOT popover.spec.md「蓋在錨點上(展開型)」`)
      process.exitCode = 1
    } else {
      console.log(`\n✓ 蓋在錨點上的浮層:${result.checks.length} 條全綠(含 ${result.checks.filter((c) => c.kind === 'control').length} 條對照)`)
    }
  } else {
    const baseline = await runVariant(page, '現行原始碼(selftest 基準 = 一趟完整判定,必須全綠)', null)
    report(baseline)
    const problems = []
    if (redIds(baseline.checks).length) problems.push(`現行原始碼本身就紅(${redIds(baseline.checks).join(' / ')}),突變的紅燈無法歸因`)
    const contractIds = baseline.checks.filter((c) => c.kind === 'contract').map((c) => c.id)
    const covered = new Set()
    for (const m of MUTANTS) {
      const result = await runVariant(page, `突變 ${m.id}:${m.what}`, mutantFor(SOURCE_ROOT, m.file, m.apply))
      report(result)
      const red = redIds(result.checks)
      const want = [...m.expectRed].sort()
      const controlRed = result.checks.filter((c) => c.kind === 'control' && !c.pass).map((c) => c.id)
      if (controlRed.length) problems.push(`${m.id}:對照列 ${controlRed.join(' / ')} 紅了 —— 突變弄壞的是量具,不是契約`)
      if (!red.length) problems.push(`${m.id}:一條都沒紅 —— 量具看不到這個根因`)
      if (JSON.stringify(red) !== JSON.stringify(want)) problems.push(`${m.id}:紅的是 [${red.join(', ')}],應剛好是 [${want.join(', ')}]`)
      for (const id of red) covered.add(id)
    }
    const uncovered = contractIds.filter((id) => !covered.has(id))
    if (uncovered.length) problems.push(`契約列 ${uncovered.join(' / ')} 沒有任何突變能讓它紅 —— 它的綠燈是零證據`)
    if (problems.length) {
      console.log('\n✗ selftest:量具不可信 ——')
      for (const p of problems) console.log(`  - ${p}`)
      process.exitCode = 1
    } else {
      console.log(`\n✓ selftest:${MUTANTS.length} 個根因突變各自剛好紅了該紅的列(契約 ${contractIds.length} 條全被覆蓋),對照列全程綠 —— 量具會紅`)
    }
  }
} catch (error) {
  if (error instanceof InstrumentError) {
    console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}:${error.message} —— 不是產品裁決,但這一趟不能算通過`)
    process.exitCode = 1
  } else {
    throw error
  }
} finally {
  await browser?.close()
}
