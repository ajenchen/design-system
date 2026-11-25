#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: `PopoverContent coverAnchor`(蓋在錨點上 / 展開型;`packages/design-system/src/components/Popover/popover.spec.md`「蓋在錨點上(展開型)」)
 *         的浮層,畫面上:
 *         C  中心 = 錨點中心(水平 + 垂直);碰到視窗邊被推回、離邊 8px —— 推回的量 = 規格公式算出來的量(容差 1px)。
 *            錨點位置 6 種(四個角落、正中間、視窗下緣中間)× 內容 3 種高(短 / 高 / 比視窗還高),全部逐格量。
 *         H  內容比視窗還高時:浮層高 = 視窗高 − 16(可用高 = 視窗高 − 上下各 8,`tokens/elevation/overlay-geometry.ts`
 *            `OVERLAY_COVER_AVAILABLE_HEIGHT`);標題列固定在浮層頂端、內文區自己捲 —— 內文捲 100px 後標題列位置不變、內文區頂邊 = 標題列底邊。
 *         M  換錨點(2026-11-24 審查必修):**不開減少動態**(收起時浮層還掛著播收起動畫),浮層開著時 consumer 把 virtualRef 改指另一格
 *            → 浮層跟到新的那一格(沒開 coverAnchor:頂邊 = 新錨點底邊 + 8、水平置中;開了:中心 = 新錨點中心)。兩種順序 × 開不開 coverAnchor 共 4 列:
 *            一直開著就換(open)/ 收起動畫中又打開、同時換(closing —— Calendar 示範殼開著時點另一個事件、「+N」浮層開著時點另一格的 +N 的實際順序,
 *            `_calendar-demo.tsx` onEventClick 先把 virtualRef.current 改成 Calendar 交出的 `{ anchor }` 再 setState)。closing 列的前提「重新打開時還是同一個浮層節點(沒卸載)」
 *            沒成立 = 儀器失效,不是通過(減少動態下浮層一收起就卸載,量不到這件事 —— 其他列都在減少動態下量,這 4 列另外切成不減少)。
 *         期望值由本檔照規格算(`clamp(錨點中心 − 一半, 8, 視窗 − 8 − 尺寸)`),不 import 元件常數 —— 讀元件常數就成了自己驗自己。
 *   紅: 任一格位置 / 高度不符 → 逐列點名 exit 1。`--selftest` 在 DS 原始碼上各造一個根因突變(MUTANTS),每個突變必須**剛好**紅它負責的那幾列,
 *       契約列每一條都要被某個突變弄紅過;對照列(R:一般 virtualRef 浮層照舊貼在錨點下方 8px、水平置中 —— PopoverAnchor 改交虛擬錨點給 Radix
 *       之後,沒開 coverAnchor 的浮層畫面不得變)在現行原始碼與每個突變上都綠。M 列的對照突變 = 266ec7ae 的寫法原文(交給 Radix 一個永遠不變的
 *       包裝,Radix 看不到錨點換了;`reanchor-stable-wrapper`)。
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
/**
 * M 列的兩格:相隔夠遠(浮層停在舊格時不可能碰巧符合新格的期望),而且短內容在兩格都不碰視窗邊 —— 這 4 列只量「有沒有跟過去」,推回由 C 列管。
 * 浮層 288 寬、短內容 144 高(2026-11-24 實測):舊格中心 (170, 155) → 蓋上時左 26 / 上 83;新格中心 (970, 455) → 蓋上時右 1114 / 下 527;
 * 沒開 coverAnchor 時貼在新格下方 → 下 662。全都離視窗邊 8 以上。
 */
const REANCHOR = { from: { x: 100, y: 100 }, to: { x: 900, y: 400 } }
const REANCHOR_IDS = ['M-open-plain', 'M-closing-plain', 'M-open-cover', 'M-closing-cover']
/** 266ec7ae 的 useCoverAwareAnchor 原文(M 列的對照組 = 「現行寫法」):交給 Radix 的 ref 永遠是同一個包裝,consumer 換錨點時 Radix 看不到 */
const STABLE_WRAPPER_266EC7AE = `function useCoverAwareAnchor(virtualRef: React.RefObject<unknown> | undefined, registry: ReturnType<typeof useOverlayAnchorRegistry>) {
  const latest = React.useRef(virtualRef)
  latest.current = virtualRef
  const stable = React.useRef<{ current: CoverAwareAnchor } | null>(null)
  if (!stable.current) {
    const source = () => latest.current?.current as { getBoundingClientRect?: () => DOMRect } | null | undefined
    stable.current = { current: {
      get contextElement() { return elementOfVirtual(source()) ?? undefined },
      getBoundingClientRect() {
        const rect = source()?.getBoundingClientRect?.() ?? new DOMRect()
        const content = registry?.coverContent.current
        if (!content?.isConnected) return rect
        const root = content.ownerDocument.documentElement
        const viewport = { width: root.clientWidth, height: root.clientHeight }
        const detached = (rect.width === 0 && rect.height === 0) || rect.bottom <= 0 || rect.right <= 0 || rect.top >= viewport.height || rect.left >= viewport.width
        if (detached) return rect
        const { x, y } = coverAnchorPosition(rect, { width: content.offsetWidth, height: content.offsetHeight }, viewport)
        return new DOMRect(x, y, rect.width, 0)
      },
    } }
  }
  return virtualRef ? stable.current : undefined
}`
const MUTANTS = [
  {
    id: 'cover-not-computed',
    what: '虛擬錨點不算位置(PopoverContent 不把自己交給 PopoverAnchor 的虛擬錨點 —— 浮層落在 Radix 預設的錨點下方、左緣對齊)',
    file: 'components/Popover/popover.tsx',
    expectRed: [...Object.keys(CELLS).flatMap((c) => Object.keys(ROWS).map((r) => `C-${c}-${r}`)), 'M-open-cover', 'M-closing-cover'],
    apply: (src) => replaceOnce(src, /anchorRegistry\.coverContent\.current = node && coverRef\.current \? node : null/, 'anchorRegistry.coverContent.current = null'),
  },
  {
    id: 'reanchor-stable-wrapper',
    what: '換錨點時交給 Radix 的還是同一個包裝(266ec7ae 的寫法原文 —— Radix 只在 virtualRef.current 換了物件時才重算,浮層停在舊錨點)',
    file: 'components/Popover/popover.tsx',
    expectRed: REANCHOR_IDS,
    // 函式寫成回呼:原文裡若有 $ 不會被當成替換樣式
    apply: (src) => replaceOnce(src, /function useCoverAwareAnchor\([\s\S]*?\n {2}return virtualRef \? handle\.current : undefined\n\}/, () => STABLE_WRAPPER_266EC7AE),
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

const cellStyle = (x, y) => ({ position: 'fixed', left: x, top: y, width: ${CELL.width}, height: ${CELL.height}, outline: '1px solid' })
function Scene() {
  const [s, setS] = React.useState(null)
  window.__scene = setS
  const cellRef = React.useRef(null)
  // M 列:換錨點 —— 同 _calendar-demo.tsx onEventClick 的順序:先把 virtualRef.current 換成另一格(示範殼換成 Calendar 交出的 anchor),再 setState 重畫
  // (cellRef 是同一個 ref 物件,重畫時 React 不會把它改回 #cell)
  window.__reanchor = (id, open) => { cellRef.current = document.getElementById(id); setS((p) => ({ ...p, open })) }
  window.__setOpen = (open) => setS((p) => ({ ...p, open }))
  if (!s) return <p id="idle">待命</p>
  return (
    <div>
      <div ref={cellRef} id="cell" style={cellStyle(s.x, s.y)}>7月15日</div>
      {s.other ? <div id="other" style={cellStyle(s.other.x, s.other.y)}>7月25日</div> : null}
      <Popover open={s.open ?? true}>
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
  /** 等浮層位置連續 3 個影格不動、而且自己身上沒有還在播的動畫(M 列不減少動態,開合動畫的縮放會改量到的矩形;不用固定睡眠) */
  const settle = async () => {
    const ok = await page.waitForFunction(() => new Promise((res) => {
      const el = document.getElementById('content'); let last = '', same = 0
      const tick = () => {
        const r = el.getBoundingClientRect()
        const moving = el.getAnimations().some((a) => a.playState === 'running')
        const k = [r.left, r.top, r.width, r.height, getComputedStyle(el.parentElement).visibility].join()
        same = k === last && !moving ? same + 1 : 0; last = k
        same >= 3 ? res(true) : requestAnimationFrame(tick)
      }
      tick()
    }), null, { timeout: WAIT_CAP_MS }).then(() => true, () => false)
    if (!ok) throw new InstrumentError(`浮層位置 ${WAIT_CAP_MS}ms 內等不到靜止`)
  }
  /** 換場景:先清空、再掛新場景,等浮層靜止 */
  const scene = async (s) => {
    await page.evaluate(() => window.__scene(null))
    await page.waitForSelector('#idle', { state: 'attached', timeout: WAIT_CAP_MS }).catch(() => { throw new InstrumentError('場景清不掉') })
    await page.evaluate((x) => window.__scene(x), s)
    await page.waitForSelector('#content', { state: 'attached', timeout: WAIT_CAP_MS }).catch(() => { throw new InstrumentError('浮層沒有打開') })
    await settle()
  }
  /** anchorId = 這一列的錨點那一格(C / H / R 列 = #cell;M 列換錨點之後 = #other) */
  const measure = (anchorId = 'cell') => page.evaluate((id) => {
    const el = document.getElementById('content')
    const box = (n) => { const r = n.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, b: r.bottom } }
    const header = el.querySelector('[data-slot="surface-header"], header, [data-popover-header]') ?? el.firstElementChild
    const body = el.querySelector('[data-body]')
    return { c: box(el), cell: box(document.getElementById(id)), header: header ? box(header) : null, body: body ? { ...box(body), sh: body.scrollHeight, ch: body.clientHeight } : null, visible: getComputedStyle(el.parentElement).visibility !== 'hidden' }
  }, anchorId)
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

  // R(對照):沒開 coverAnchor 的 virtualRef 浮層照舊 —— 貼在錨點下方 8、水平置中(PopoverAnchor 改交包過一層的虛擬錨點給 Radix,畫面不得變)
  await scene({ cover: false, x: 570, y: 300, rows: ROWS.short })
  const r = await measure()
  const rx = r.cell.l + r.cell.w / 2
  check('R-plain-virtual', 'control', '沒開 coverAnchor 的 virtualRef 浮層:頂邊 = 錨點底邊 + 8、水平置中於錨點',
    r.visible && Math.abs(r.c.t - (r.cell.b + 8)) <= 1 && Math.abs(r.c.l + r.c.w / 2 - rx) <= 1, { got: r.c, cell: r.cell })

  // M:換錨點 —— 不開減少動態(收起時浮層還掛著播收起動畫;減少動態下一收起就卸載,重新打開是新的浮層,量不到這件事)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  try {
    for (const cover of [false, true]) {
      for (const how of ['open', 'closing']) {
        const id = `M-${how}-${cover ? 'cover' : 'plain'}`
        await scene({ cover, ...REANCHOR.from, rows: ROWS.short, other: REANCHOR.to, open: true })
        const before = await measure('cell')
        if (how === 'open') {
          // 一直開著:改指另一格 + 重畫
          await page.evaluate(() => { window.__openNode = document.getElementById('content'); window.__reanchor('other', true) })
        } else {
          // 收起動畫中又打開:先關(等到這個節點變 closed —— 它還掛著播收起動畫),同一個影格裡改指另一格 + 打開
          const pre = await page.evaluate(() => new Promise((res) => {
            const node = document.getElementById('content')
            window.__openNode = node
            window.__setOpen(false)
            const deadline = performance.now() + 2000
            const tick = () => {
              const el = document.getElementById('content')
              if (el !== node) return res({ ok: false, why: el ? '浮層換了一個節點' : '浮層一收起就卸載了(沒有收起動畫 —— 減少動態沒切掉?)' })
              if (el.getAttribute('data-state') === 'closed') {
                const exiting = el.getAnimations().some((a) => a.playState === 'running')
                window.__reanchor('other', true)
                return res({ ok: true, exiting })
              }
              if (performance.now() > deadline) return res({ ok: false, why: '2 秒內等不到 data-state=closed' })
              requestAnimationFrame(tick)
            }
            tick()
          }))
          if (!pre.ok) throw new InstrumentError(`${id} 前提沒成立:${pre.why}`)
          if (!pre.exiting) throw new InstrumentError(`${id} 前提沒成立:收起時浮層沒有在播收起動畫 —— 量的不是「收起動畫中又打開」`)
        }
        await page.waitForFunction(() => document.getElementById('content')?.getAttribute('data-state') === 'open', null, { timeout: WAIT_CAP_MS })
          .catch(() => { throw new InstrumentError(`${id}:重新打開後 ${WAIT_CAP_MS}ms 內浮層沒有回到 open`) })
        await settle()
        const sameNode = await page.evaluate(() => window.__openNode === document.getElementById('content'))
        if (!sameNode) throw new InstrumentError(`${id} 前提沒成立:換錨點時浮層被卸載又重掛 —— 這一列量的是「浮層還掛著時換錨點」`)
        const m = await measure('other')
        const cx = m.cell.l + m.cell.w / 2, cy = m.cell.t + m.cell.h / 2
        const want = cover
          ? { l: clamp(cx - m.c.w / 2, PAD, VIEWPORT.width - PAD - m.c.w), t: clamp(cy - m.c.h / 2, PAD, VIEWPORT.height - PAD - m.c.h) }
          : { l: cx - m.c.w / 2, t: m.cell.b + 8 }
        const err = { x: +(m.c.l - want.l).toFixed(2), y: +(m.c.t - want.t).toFixed(2) }
        check(id, 'contract',
          `換錨點(不減少動態;${how === 'open' ? '一直開著就換' : '收起動畫中又打開、同時換'}${cover ? ';coverAnchor' : ''})→ 浮層跟到新的那一格:${cover ? '中心 = 新錨點中心' : '頂邊 = 新錨點底邊 + 8、水平置中'}`,
          m.visible && Math.abs(err.x) <= 1 && Math.abs(err.y) <= 1, { want, got: { l: m.c.l, t: m.c.t, w: m.c.w, h: m.c.h }, err, before: { l: before.c.l, t: before.c.t }, anchor: m.cell, visible: m.visible })
      }
    }
  } finally {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  }
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
