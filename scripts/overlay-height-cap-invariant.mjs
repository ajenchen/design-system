#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 開著的錨定浮層,computed `max-height` = 規格那條公式的結果(`packages/design-system/src/tokens/elevation/elevation.spec.md`
 *         「浮層高度上限」:上限 = 有 maxHeight ? min(可用高, maxHeight) : 可用高;可用高 = Radix popper 在定位外殼上寫的
 *         `--radix-popper-available-height`),而且內容比上限高時真的被夾在上限、在裡面捲:
 *         P / H / D  PopoverContent、HoverCardContent、DropdownMenuContent:不傳 = 可用高;傳數字(px)/ 字串(rem)= 兩者取小;
 *                    傳得比可用高大 = 可用高(只能往更矮調)。實際高 = 上限(夾具內容一律比可用高還高)。
 *         S          DropdownMenuSubContent(修前沒有上限、也沒有捲動區):上限 = 可用高、底邊不超出視窗、捲到底最後一項看得到。
 *         L          CommandList 的捲動區上限 = 300px(command.spec.md「邊界案例」清單捲動上限 18.75rem,根字級 16px),外殼不超過可用高。
 *         C          放在 Popover 裡的 ProfileCard 根元素上限 = 它讀到的可用高。
 *         量的是夾具裡真的渲染出來的浮層(getComputedStyle + getBoundingClientRect),期望值由本檔照規格算、不 import 元件常數 ——
 *         讀元件常數就成了自己驗自己(同 dialog-width-invariant)。
 *   紅: 任一格上限或實際高不符(容差 0.5px / 1px)。
 *       `--selftest` 在同一份夾具的打包檔上做四種破法,各自必須讓指定的格紅、而且破法真的套上了(改寫數 = 1):
 *       (a) available  OVERLAY_AVAILABLE_HEIGHT 改成 100vh(不再讀 popper 的可用高)   → P/H/D 的「不傳」格、P-cap-over 與 C 紅
 *                      (S 不在其中:子選單沒有 collisionPadding、開在右側,可用高本來就 = 視窗高,改成 100vh 量不出差別 —— S 由 (d) 守)
 *       (b) cap        capHeight 不理會 cap(使用端的 maxHeight 失效)               → 所有「傳了 maxHeight」且比可用高小的格紅
 *       (c) list       OVERLAY_LIST_MAX_HEIGHT 改成 30rem                           → L 紅
 *       (d) submenu    DropdownMenuSubContent 拿掉 maxHeight(修前的缺口)           → S 紅
 *       任一種沒改寫到 / 改寫了卻沒紅 = 儀器失效,exit 1。
 *       夾具打包失敗、找不到建置 CSS、浮層沒開起來、可用高讀不到(NaN)= INSTRUMENT-FAIL(exit 1),不是通過也不是產品裁決;
 *       沒有 storybook 建置 = MISSING-BUILD(exit 2)。
 *   綠: 全部格相符。夾具每次從這次 checkout 的原始碼重新打包(lib/storybook-css-fixture.mjs),樣式取指定建置的 preview CSS;
 *       開頁以「浮層本身出現 + 版面連續靜止」為準(openStory),關掉動畫(prefers-reduced-motion)量穩態,不靠固定睡眠。
 *   註: 夾具 = scripts/test-fixtures/overlay-height-cap/fixture.tsx(為什麼不是 story 寫在夾具檔頭)。靜態那一半(高度上限只准從
 *       overlay-geometry.ts 來)在 scripts/overlay-height-ssot-invariant.mjs;Dialog 的高度由 scripts/dialog-height-invariant.mjs 量。
 *
 *   node scripts/overlay-height-cap-invariant.mjs [--build=<storybook 建置目錄>] [--selftest]
 */
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { FixtureInstrumentError, startStorybookCssFixture } from './lib/storybook-css-fixture.mjs'
import { printSelftestLine } from './lib/gate-selftest-meta.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
const buildArg = process.argv.find((a) => a.startsWith('--build='))?.slice('--build='.length)
const STATIC = buildArg ? (isAbsolute(buildArg) ? buildArg : join(process.cwd(), buildArg)) : join(REPO, 'storybook-static')
const FIXTURE_SOURCE = 'scripts/test-fixtures/overlay-height-cap/fixture.tsx'
const VIEWPORT = { width: 1280, height: 600 }
/** 規格值(command.spec.md「清單捲動上限 300px」)—— 刻意不 import 元件常數 */
const LIST_CAP_PX = 300

/** cap:undefined = 不傳;數字 = px;'<n>rem' = n × 根字級 */
const CASES = [
  { id: 'P-available', q: { case: 'popover' }, what: 'PopoverContent 不傳 maxHeight → 上限 = 可用高' },
  { id: 'P-cap-px', q: { case: 'popover', cap: '200' }, cap: 200, what: 'PopoverContent maxHeight={200} → min(可用高, 200)' },
  { id: 'P-cap-string', q: { case: 'popover', cap: '12rem' }, cap: '12rem', what: 'PopoverContent maxHeight="12rem" → min(可用高, 192)' },
  { id: 'P-cap-over', q: { case: 'popover', cap: '5000' }, cap: 5000, what: 'PopoverContent maxHeight={5000}(比可用高大)→ 可用高(只能往更矮調)' },
  { id: 'H-available', q: { case: 'hover-card' }, what: 'HoverCardContent 不傳 maxHeight → 上限 = 可用高' },
  { id: 'H-cap', q: { case: 'hover-card', cap: '160' }, cap: 160, what: 'HoverCardContent maxHeight={160} → min(可用高, 160)' },
  { id: 'D-available', q: { case: 'dropdown' }, what: 'DropdownMenuContent 不傳 maxHeight → 上限 = 可用高' },
  { id: 'D-cap-px', q: { case: 'dropdown', cap: '150' }, cap: 150, what: 'DropdownMenuContent maxHeight={150} → min(可用高, 150)' },
  { id: 'D-cap-string', q: { case: 'dropdown', cap: '10rem' }, cap: '10rem', what: 'DropdownMenuContent maxHeight="10rem"(2026-11-24 起收字串)→ min(可用高, 160)' },
  { id: 'S-available', q: { case: 'submenu' }, sub: true, what: 'DropdownMenuSubContent 60 項 → 上限 = 可用高、底邊不出視窗、捲到底最後一項看得到' },
  { id: 'L-list', q: { case: 'command-list' }, list: true, what: `CommandList 40 項 → 清單捲動區上限 ${LIST_CAP_PX}px、外殼不超過可用高` },
  { id: 'C-profile', q: { case: 'profile-card' }, standalone: true, what: 'Popover 裡的 ProfileCard 根元素上限 = 它讀到的可用高' },
]

/** 對照組:同一份夾具打包檔上的四種破法(esbuild 未壓縮的 IIFE;regex 打在常數 / 函式上;改寫數必須正好 1) */
const MUTATIONS = [
  { name: 'available', what: 'OVERLAY_AVAILABLE_HEIGHT 改成 100vh', re: /(OVERLAY_AVAILABLE_HEIGHT\d*\s*=\s*)"var\(--radix-popper-available-height, 100vh\)"/g, to: '$1"100vh"', mustFail: ['P-available', 'P-cap-over', 'H-available', 'D-available', 'C-profile'] },
  { name: 'cap', what: 'capHeight 不理會使用端的 cap', re: /(function capHeight\d*\((\w+), (\w+)\) \{\s*)if \(\3 == null \|\| \3 === ""\) return \2;/g, to: '$1return $2;', mustFail: ['P-cap-px', 'P-cap-string', 'H-cap', 'D-cap-px', 'D-cap-string'] },
  { name: 'list', what: 'OVERLAY_LIST_MAX_HEIGHT 改成 30rem', re: /(OVERLAY_LIST_MAX_HEIGHT\d*\s*=\s*)"18\.75rem"/g, to: '$1"30rem"', mustFail: ['L-list'] },
  { name: 'submenu', what: 'DropdownMenuSubContent 拿掉 maxHeight(修前的缺口)', re: /(minWidth: 180), maxHeight: capHeight\d*\(OVERLAY_AVAILABLE_HEIGHT\d*\)/g, to: '$1', mustFail: ['S-available'] },
]

requireStorybookBuild(join(STATIC, 'index.json'))

let fx
try {
  fx = await startStorybookCssFixture(STATIC, { source: FIXTURE_SOURCE, label: '浮層高度上限夾具', title: '浮層高度上限夾具' })
} catch (error) {
  if (!(error instanceof FixtureInstrumentError)) throw error
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER} ${error.message}(${FIXTURE_SOURCE})`)
  process.exit(1)
}
const browser = await launchBrowserOrSkip({}, { cleanup: () => fx.stop() })
const urlOf = (q) => `${fx.url}?${new URLSearchParams(q).toString()}`
const near = (a, b, tol) => Math.abs(a - b) <= tol
// 整支閘只開一個分頁:沙箱參數 --single-process 下關掉最後一個分頁會連瀏覽器一起收掉(同 dialog-width-invariant);各輪之間換路由攔截,不換分頁
const page = await browser.newPage({ viewport: VIEWPORT, reducedMotion: 'reduce' })

const MEASURE = () => {
  const c = document.getElementById('oh-content')
  if (!c) return null
  const cs = getComputedStyle(c)
  const r = c.getBoundingClientRect()
  const px = (v) => parseFloat(v)
  const list = (() => {
    const sa = c.querySelector('[cmdk-list]')?.closest('[data-layout-region="unbounded"]')
    if (!sa) return null
    return { maxH: px(getComputedStyle(sa).maxHeight), h: sa.getBoundingClientRect().height }
  })()
  const standalone = (() => {
    const p = document.getElementById('oh-standalone')
    if (!p) return null
    const s = getComputedStyle(p)
    return { maxH: px(s.maxHeight), avail: px(s.getPropertyValue('--radix-popper-available-height')), h: p.getBoundingClientRect().height }
  })()
  return { avail: px(cs.getPropertyValue('--radix-popper-available-height')), maxH: px(cs.maxHeight), maxHraw: cs.maxHeight, h: r.height, inner: c.clientHeight, top: r.top, bottom: r.bottom,
    vh: window.innerHeight, rootFs: px(getComputedStyle(document.documentElement).fontSize), list, standalone }
}
/** 子選單捲到底,回傳最後一項與內容框的位置 */
const SCROLL_TO_END = () => {
  const c = document.getElementById('oh-content')
  const v = c?.querySelector('[data-radix-scroll-area-viewport]')
  if (!v) return { viewport: false }
  v.scrollTop = v.scrollHeight
  const items = c.querySelectorAll('[role="menuitem"]')
  const last = items[items.length - 1]
  const lr = last.getBoundingClientRect()
  const cr = c.getBoundingClientRect()
  return { viewport: true, scrollable: v.scrollHeight > v.clientHeight + 1, lastTop: lr.top, lastBottom: lr.bottom, boxTop: cr.top, boxBottom: cr.bottom }
}

const capPx = (cap, rootFs) => (cap == null ? null : typeof cap === 'number' ? cap : parseFloat(cap) * rootFs)

/** 跑一輪全部格;mutation 有給時改寫夾具打包檔。回傳每格判定與改寫數。儀器失效直接丟 StoryRenderInstrumentError。 */
async function runAll(mutation = null) {
  await page.unrouteAll({ behavior: 'wait' })
  let rewrites = 0
  if (mutation) {
    await page.route((u) => u.pathname.endsWith('/fixture.js'), async (route) => {
      const res = await route.fetch()
      const body = await res.text()
      rewrites = (body.match(mutation.re) ?? []).length
      return route.fulfill({ response: res, body: body.replace(mutation.re, mutation.to), headers: { ...res.headers(), 'content-type': 'application/javascript' } })
    })
  }
  const rows = []
  for (const c of CASES) {
    await openStory(page, urlOf(c.q), { waitFor: '#oh-content', settleFrames: 5, notFound: fx.notFound, label: `夾具 ${c.id}` })
    const m = await page.evaluate(MEASURE)
    if (!m) throw new StoryRenderInstrumentError({ storyId: `夾具 ${c.id}`, url: urlOf(c.q), kind: 'missing-overlay', reason: '等到 #oh-content 之後量測當下它不在了', failedRequests: [] })
    if (!Number.isFinite(m.avail) || m.avail <= 0) {
      throw new StoryRenderInstrumentError({ storyId: `夾具 ${c.id}`, url: urlOf(c.q), kind: 'no-available-height', reason: `浮層上讀不到 --radix-popper-available-height(實得 ${m.avail})—— 不在 Radix popper 裡,量不到「可用高」`, failedRequests: [] })
    }
    const problems = []
    const cp = capPx(c.cap, m.rootFs)
    const want = cp == null ? m.avail : Math.min(m.avail, cp)
    if (!near(m.maxH, want, 0.5)) problems.push(`上限 ${m.maxHraw} ≠ ${want.toFixed(1)}px(可用高 ${m.avail}${cp == null ? '' : `、maxHeight ${cp}px`})`)
    if (c.list) {
      if (!m.list) problems.push('找不到 CommandList 的捲動區')
      else {
        if (!near(m.list.maxH, LIST_CAP_PX, 0.5)) problems.push(`清單捲動區上限 ${m.list.maxH}px ≠ ${LIST_CAP_PX}`)
        if (!near(m.list.h, LIST_CAP_PX, 1)) problems.push(`清單捲動區實際高 ${m.list.h.toFixed(1)} ≠ ${LIST_CAP_PX}(40 項應被夾住)`)
      }
      if (m.h > m.avail + 0.5) problems.push(`外殼高 ${m.h.toFixed(1)} 超過可用高 ${m.avail}`)
    } else if (c.standalone) {
      if (!m.standalone) problems.push('找不到 ProfileCard 根元素')
      else {
        if (!near(m.standalone.maxH, m.standalone.avail, 0.5)) problems.push(`ProfileCard 上限 ${m.standalone.maxH} ≠ 它讀到的可用高 ${m.standalone.avail}`)
        // 實際高 = min(自己的上限, 外殼內框高)—— Popover 外殼上下各 1px 框線,內框比可用高少 2px
        const fit = Math.min(m.standalone.maxH, m.inner)
        if (!near(m.standalone.h, fit, 1)) problems.push(`ProfileCard 實際高 ${m.standalone.h.toFixed(1)} ≠ min(上限 ${m.standalone.maxH}, 外殼內框 ${m.inner})(30 個欄位應被夾住)`)
      }
    } else if (!near(m.h, want, 1)) problems.push(`實際高 ${m.h.toFixed(1)} ≠ 上限 ${want.toFixed(1)}(內容比上限高,應被夾住)`)
    if (c.sub) {
      if (m.bottom > m.vh + 0.5) problems.push(`子選單底 ${m.bottom.toFixed(1)} 超出視窗 ${m.vh}`)
      const s = await page.evaluate(SCROLL_TO_END)
      if (!s.viewport) problems.push('子選單沒有捲動區')
      else {
        if (!s.scrollable) problems.push('子選單捲動區捲不動(60 項應超出上限)')
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        const s2 = await page.evaluate(SCROLL_TO_END)
        if (!(s2.lastBottom <= s2.boxBottom + 0.5 && s2.lastTop >= s2.boxTop - 0.5)) problems.push(`捲到底最後一項 ${s2.lastTop.toFixed(1)}–${s2.lastBottom.toFixed(1)} 不在子選單框 ${s2.boxTop.toFixed(1)}–${s2.boxBottom.toFixed(1)} 內`)
      }
    }
    rows.push({ id: c.id, what: c.what, ok: problems.length === 0, detail: problems.join(';') || `上限 ${m.maxHraw}、實際高 ${m.h.toFixed(1)}、可用高 ${m.avail}${m.list ? `、清單 ${m.list.maxH}/${m.list.h.toFixed(1)}` : ''}${m.standalone ? `、ProfileCard ${m.standalone.maxH}/${m.standalone.h.toFixed(1)}` : ''}` })
  }
  return { rows, rewrites }
}

let exitCode = 0
try {
  if (!SELFTEST) {
    const { rows } = await runAll()
    for (const r of rows) console.log(`${r.ok ? '✓' : '✗'} ${r.id} ${r.what} | ${r.detail}`)
    const bad = rows.filter((r) => !r.ok)
    console.log(bad.length ? `\n✗ overlay-height-cap-invariant:${bad.length} / ${rows.length} 格不符(規格:packages/design-system/src/tokens/elevation/elevation.spec.md「浮層高度上限」)` : `\n✓ overlay-height-cap-invariant:${rows.length} 格全部相符`)
    exitCode = bad.length ? 1 : 0
  } else {
    const verdicts = []
    for (const mutation of MUTATIONS) {
      const { rows, rewrites } = await runAll(mutation)
      const red = rows.filter((r) => !r.ok).map((r) => r.id)
      const missed = mutation.mustFail.filter((id) => !red.includes(id))
      const applied = rewrites === 1
      verdicts.push({ mutation, red, missed, applied })
      console.log(`${applied && !missed.length ? '✓' : '✗'} 破法 ${mutation.name}(${mutation.what}):改寫 ${rewrites} 處;紅 ${red.length} 格 [${red.join(', ')}]${missed.length ? `;該紅沒紅:${missed.join(', ')}` : ''}`)
    }
    const broken = verdicts.filter((v) => !v.applied || v.missed.length)
    if (broken.length) {
      console.error(`\n✗ overlay-height-cap-invariant --selftest:${broken.length} 種破法沒有套上或沒讓該紅的格紅 —— 這支閘量的不是它宣稱的東西`)
      exitCode = 1
    } else {
      printSelftestLine(`\n✓ overlay-height-cap-invariant --selftest:${MUTATIONS.length} 種破法(可用高改 100vh / 不理會 cap / 清單上限改 30rem / 子選單拿掉上限)各自讓指定的格紅`)
    }
  }
} catch (error) {
  if (!(error instanceof StoryRenderInstrumentError)) throw error
  console.error(`✗ ${error.message}`)
  exitCode = 1
} finally {
  await browser.close()
  await fx.stop()
}
process.exit(exitCode)
