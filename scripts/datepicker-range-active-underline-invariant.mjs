#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: `DatePicker.Range` 起訖兩顆按鈕「現在在選哪一端」的主色底線**畫出來**是完整的 2px(date-picker.spec.md「Active-end 機制」
 *        視覺指示:「active input 加 `decoration-primary underline-offset-4 decoration-2`」—— `decoration-2` = 2px),sm / md / lg 三種尺寸、
 *        兩種出現方式(面板關著用鍵盤 Tab 到那一顆 = focus-visible;點開面板 = `data-active-end`)、起訖兩端,裝置像素比 1 與 2 都量;
 *        而且長日期照樣截斷:文字比按鈕長時 span 的 scrollWidth > clientWidth、`text-overflow: ellipsis`、水平方向有裁切,
 *        按鈕右緣到下一個元素(中間箭頭 / 右側日曆圖示)之間那條縫**零墨點**(字沒有溢出去)。
 *        量的是像素:截圖裡底線所在範圍(文字寬 × 按鈕頂到外框內側下緣,外框邊線不算),逐列數「主色像素佔文字寬一半以上」的列數 ÷ 像素比。
 *   紅: 任一列不符 → 逐列點名(尺寸 / 端點 / 出現方式 / 像素比,畫出幾 px)exit 1。`--selftest` 在 DS 原始碼上造四個單一根因突變(MUTANTS),
 *        每個突變必須**剛好**紅它負責的那幾列,契約列每一條都要被某個突變弄紅過:span 改回雙軸裁切(A50 修前)/ 按鈕改回雙軸裁切
 *        → 14px 字級(sm / md)的底線列紅、lg 不紅;span 水平不裁 → 截斷列紅;`decoration-2` 改 `decoration-1` → 全部底線列紅。
 *        `--root=<修改前的整棵原始碼>` = 天然對照組(2108fdc8 基準樹:sm / md 底線畫出 1px → 紅;lg 2px、截斷列 → 綠)。
 *   綠: 現行原始碼每列都量到且符合;對照列在現行原始碼與每個突變上都綠:還沒聚焦、面板沒開時同一塊範圍裡主色列數 = 0(數到的是底線、
 *        不是外框邊線或別的東西);鍵盤聚焦時同一支量具量外框下緣那條 1px 邊線 = 1px(主色辨認是活的,0 列不會是顏色認錯)。
 *        harness 載不起來 / 焦點沒落到該落的那一顆 / 面板沒開 / 等不到靜止 = 儀器失效(INSTRUMENT-FAIL,exit 1),不得讀成通過(M37)。
 *   註: 2026-11-17 新增(A50)。根因:起訖按鈕與裡面的文字 span 都是 `truncate`(overflow:hidden 雙軸),14px 字級時底線
 *       (`underline-offset-4`、粗 2px)有一半落在 21px 行盒的下緣之外,被裁成 1px;16px(lg)按鈕高 24px,底線畫在第 22–23 列,剛好畫得完整
 *       (本閘 --root=2108fdc8 基準樹實量)。
 *        修法:span 改「只裁水平」(`overflow-x-clip` + `text-ellipsis` + `whitespace-nowrap`,同 combobox.tsx `tagRowOverflowClass` 的理由),
 *        按鈕本身不裁(`overflow-visible` 蓋掉 bareInputStyles 的 truncate)。修前實量(md、range-picker story):按鈕高 21px、
 *        底線畫在按鈕頂下 20.3–22.3px,只剩 1 列;只放開 span 仍 1 列,span 與按鈕都放開才 2 列。
 *        CI:`npm run test:datepicker-range-preview` 會接著跑 `npm run test:datepicker-range-active-underline`(現況 + --selftest)。
 *
 * 用法:
 *   node scripts/datepicker-range-active-underline-invariant.mjs                判定(現行原始碼)
 *   node scripts/datepicker-range-active-underline-invariant.mjs --selftest     對照組(全部單一根因突變)
 *   node scripts/datepicker-range-active-underline-invariant.mjs --root=<dir>   改量另一棵原始碼(例:修改前的基準樹)
 *   node scripts/datepicker-range-active-underline-invariant.mjs --shot=<dir>   另存 md 起始端鍵盤聚焦時的欄位畫面(像素比 2,淺色;前後圖用;不影響判定)
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, parkPointer } from './lib/launch-browser.mjs'
import {
  InstrumentError,
  REPO_ROOT,
  WAIT_CAP_MS,
  bundleDsHarness,
  compileDsCss,
  makeDriver,
  mountHarness,
  mutantFor,
  replaceOnce,
  resolveSourceRoot,
} from './lib/ds-source-harness.mjs'

const SELFTEST = process.argv.includes('--selftest')
const SHOT_DIR = process.argv.find((a) => a.startsWith('--shot='))?.slice('--shot='.length)
const SOURCE_ROOT = resolveSourceRoot()

/** 規格值:date-picker.spec.md「Active-end 機制」視覺指示的 `decoration-2` */
const SPEC_THICKNESS_PX = 2
const DPRS = [1, 2]
/** 主色像素:與按鈕 computed text-decoration-color 每個色版差 ≤ 此值 */
const COLOR_TOLERANCE = 40
/** 一列算「底線列」:主色像素 ≥ 文字寬的這個比例(數字之間有 skip-ink 留白,不要求整列) */
const ROW_COVERAGE = 0.5
/** 「墨點」:亮度低於此值(白底上的字;外框邊線不在量的範圍裡) */
const INK_LUMA = 200

const CASES = [
  { id: 'sm', size: 'sm', width: 360 },
  { id: 'md', size: 'md', width: 360 },
  { id: 'lg', size: 'lg', width: 400 },
  // 長日期:showTime + 秒,欄位故意窄 —— 兩端都必須截斷,而且底線照樣完整
  { id: 'md-long', size: 'md', width: 260, long: true },
]
const ENDS = ['start', 'end']
const PLACEHOLDER = ['入住日期', '退房日期']

const SPAN_CLASS_ANCHOR = /const RANGE_END_TEXT_CLASS = 'block overflow-x-clip text-ellipsis whitespace-nowrap'/
const BUTTON_OVERFLOW_ANCHOR = /'overflow-visible text-left cursor-pointer focus-visible:outline-none'/g
const DECORATION_ANCHOR = /'data-\[active-end=true\]:underline focus-visible:underline decoration-primary underline-offset-4 decoration-2'/g
/** 同一字串在起訖兩顆各出現一次:兩處一起換(錨點必須剛好兩處,否則儀器失效) */
const replaceBoth = (src, pattern, replacement) => {
  const hits = src.match(pattern)?.length ?? 0
  if (hits !== 2) throw new InstrumentError(`突變錨點命中 ${hits} 次(應為起訖兩顆各 1 次):${pattern} —— 原始碼改了,selftest 的突變要跟著改`)
  return src.replace(pattern, replacement)
}

const isUnderlineRow = (row) => row.kind === 'underline'
const MUTANTS = [
  {
    id: 'span-clips-both-axes',
    what: '文字 span 改回 `block truncate`(雙軸 overflow:hidden,A50 修前)',
    redWhen: (row) => isUnderlineRow(row) && row.size !== 'lg',
    apply: (src) => replaceOnce(src, SPAN_CLASS_ANCHOR, "const RANGE_END_TEXT_CLASS = 'block truncate'"),
  },
  {
    id: 'button-clips-both-axes',
    what: '起訖按鈕改回 `truncate`(雙軸 overflow:hidden,A50 修前)',
    redWhen: (row) => isUnderlineRow(row) && row.size !== 'lg',
    apply: (src) => replaceBoth(src, BUTTON_OVERFLOW_ANCHOR, "'truncate text-left cursor-pointer focus-visible:outline-none'"),
  },
  {
    id: 'span-no-horizontal-clip',
    what: '文字 span 水平也不裁(只剩 block + nowrap)—— 長日期溢出按鈕',
    redWhen: (row) => row.kind === 'truncate',
    apply: (src) => replaceOnce(src, SPAN_CLASS_ANCHOR, "const RANGE_END_TEXT_CLASS = 'block whitespace-nowrap'"),
  },
  {
    id: 'decoration-1px',
    what: '底線粗細 `decoration-2` 改 `decoration-1`',
    redWhen: (row) => isUnderlineRow(row),
    apply: (src) => replaceBoth(src, DECORATION_ANCHOR, "'data-[active-end=true]:underline focus-visible:underline decoration-primary underline-offset-4 decoration-1'"),
  },
]
const MUTANT_FILE = 'components/DatePicker/date-picker.tsx'

const HARNESS = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'

const CASES = ${JSON.stringify(CASES)}
function Case({ c }) {
  const [range, setRange] = React.useState(c.long ? ['2026-04-15T14:30:59', '2026-04-20T09:05:00'] : ['2026-04-15', '2026-04-20'])
  return (
    <div data-case={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, width: c.width }}>
      <button type="button" data-before={c.id} style={{ alignSelf: 'flex-start', fontSize: 12 }}>上一欄</button>
      <DatePicker.Range size={c.size} value={range} onChange={setRange} placeholder={${JSON.stringify(PLACEHOLDER)}} showTime={!!c.long} showSeconds={!!c.long} />
    </div>
  )
}
function App() {
  return (
    <TooltipProvider>
      <main data-scene style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 120, background: 'var(--canvas)', minHeight: '100vh' }}>
        {CASES.map((c) => <Case key={c.id} c={c} />)}
      </main>
    </TooltipProvider>
  )
}
createRoot(document.getElementById('root')).render(<App />)
`

/** 頁面端:這一個案例的幾何(按鈕、文字、外框內側下緣、下一個元素)與 span 的截斷狀態 */
const GEOMETRY = ({ caseId, end, placeholder }) => {
  const box = document.querySelector(`[data-case="${caseId}"]`)
  const btn = box?.querySelector(`button[aria-label="${placeholder[end === 'start' ? 0 : 1]}"]`)
  if (!btn) return { missing: `找不到 ${end} 端按鈕` }
  const wrap = btn.closest('[data-field-mode]')
  const span = btn.querySelector('span')
  const r = (el) => { const x = el.getBoundingClientRect(); return { left: x.left, top: x.top, right: x.right, bottom: x.bottom } }
  const range = document.createRange(); range.selectNodeContents(span)
  const text = range.getBoundingClientRect()
  const wcs = getComputedStyle(wrap); const scs = getComputedStyle(span); const bcs = getComputedStyle(btn)
  const next = btn.nextElementSibling
  // computed 顏色可能是 oklch() / color() —— 交給 canvas 換成 sRGB 的 0–255(截圖量的就是 sRGB)
  const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1
  const cx = cv.getContext('2d'); cx.fillStyle = bcs.textDecorationColor; cx.fillRect(0, 0, 1, 1)
  const rgb = [...cx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
  return {
    button: r(btn), wrap: r(wrap), span: r(span),
    text: { left: text.left, right: text.right },
    wrapInnerBottom: wrap.getBoundingClientRect().bottom - parseFloat(wcs.borderBottomWidth),
    next: next ? r(next) : null,
    color: bcs.textDecorationColor, rgb, styleThickness: bcs.textDecorationThickness, decorationLine: bcs.textDecorationLine,
    activeEnd: btn.getAttribute('data-active-end'), focused: document.activeElement === btn,
    scrollWidth: span.scrollWidth, clientWidth: span.clientWidth, textOverflow: scs.textOverflow, overflowX: scs.overflowX,
  }
}

/**
 * 截圖數「主色列」:文字寬 × [y0, y1) 範圍裡,主色像素佔文字寬一半以上的列。回傳 { rows(裝置像素列 y), thickness(CSS px) }。
 * 預設範圍 = 底線會出現的地方:按鈕頂 → 外框內側下緣(外框邊線不算 —— 聚焦時它也是主色)。
 */
async function countUnderline(page, g, dpr, { y0 = g.button.top, y1 = g.wrapInnerBottom } = {}) {
  const x0 = Math.max(g.text.left, g.button.left), x1 = Math.min(g.text.right, g.button.right)
  if (x1 - x0 < 4 || y1 - y0 < 0.5) throw new InstrumentError(`量測範圍太小(${(x1 - x0).toFixed(1)} × ${(y1 - y0).toFixed(1)})`)
  const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
  const png = PNG.sync.read(await page.screenshot({ clip }))
  const [cr, cg, cb] = g.rgb
  const rows = []
  for (let y = 0; y < png.height; y++) {
    let n = 0
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4
      if (Math.abs(png.data[i] - cr) <= COLOR_TOLERANCE && Math.abs(png.data[i + 1] - cg) <= COLOR_TOLERANCE && Math.abs(png.data[i + 2] - cb) <= COLOR_TOLERANCE) n++
    }
    if (n >= png.width * ROW_COVERAGE) rows.push(y)
  }
  return { rows, thickness: rows.length / dpr, clipTop: y0 }
}

/** 截圖數「按鈕右緣 → 下一個元素左緣」那條縫裡的墨點 */
async function countSpill(page, g) {
  if (!g.next) throw new InstrumentError('按鈕後面沒有下一個元素,量不到溢出縫')
  const x0 = g.button.right + 1, x1 = g.next.left - 1
  if (x1 - x0 < 2) throw new InstrumentError(`溢出縫太窄(${(x1 - x0).toFixed(1)}px)`)
  const png = PNG.sync.read(await page.screenshot({ clip: { x: x0, y: g.button.top, width: x1 - x0, height: g.button.bottom - g.button.top } }))
  let ink = 0
  for (let i = 0; i < png.data.length; i += 4) if (0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2] < INK_LUMA) ink++
  return ink
}

const STYLE = await compileDsCss({ root: SOURCE_ROOT, extraSources: [HARNESS] })

async function runOnce(dpr, mutate) {
  const browser = await launchBrowserOrSkip({}, { hint: '這支閘不需要 storybook 建置,只需要 Chromium' })
  try {
    const context = await browser.newContext({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: dpr, colorScheme: 'light', reducedMotion: 'reduce' })
    const page = await context.newPage()
    const code = await bundleDsHarness({ root: SOURCE_ROOT, harness: HARNESS, harnessName: 'datepicker-range-active-underline-harness.tsx', mutate })
    mutate?.assertApplied?.()
    const { pageErrors, dispose } = await mountHarness(page, code, 'main[data-scene] [data-case] [data-field-mode]')
    try {
      await page.addStyleTag({ content: STYLE })
      await page.evaluate(() => document.fonts.ready)
      const d = makeDriver(page)
      await d.settle()
      const checks = []
      const geo = async (caseId, end) => {
        const g = await page.evaluate(GEOMETRY, { caseId, end, placeholder: PLACEHOLDER })
        if (g.missing) throw new InstrumentError(`${caseId}:${g.missing}`)
        return g
      }
      const tag = (id) => `d${dpr}-${id}`
      for (const c of CASES) {
        // 對照:還沒聚焦、面板沒開 —— 同一塊範圍裡沒有底線列(數到的是底線,不是外框邊線)
        await parkPointer(page)
        for (const end of ENDS) {
          const g = await geo(c.id, end)
          const u = await countUnderline(page, g, dpr)
          checks.push({ id: tag(`C-${c.id}-${end}-idle`), kind: 'control', pass: u.rows.length === 0, detail: `沒聚焦時主色列 ${u.rows.length}(應 0)` })
        }
        // 鍵盤:從前一個控件 Tab 進來 = 起始端;再 Tab = 結束端(面板關著,底線來自 focus-visible)
        await d.focus(`[data-before="${c.id}"]`)
        for (const end of ENDS) {
          await d.press('Tab')
          const g = await geo(c.id, end)
          if (!g.focused) throw new InstrumentError(`${c.id}:Tab 之後焦點不在 ${end} 端`)
          const u = await countUnderline(page, g, dpr)
          // 對照:同一支量具量外框下緣那條邊線(聚焦時轉主色、1px)—— 主色辨認是活的,底線列數 0 不會是顏色認錯
          const border = await countUnderline(page, g, dpr, { y0: g.wrapInnerBottom, y1: g.wrap.bottom })
          checks.push({ id: tag(`C-${c.id}-${end}-border-seen`), kind: 'control', pass: border.thickness === 1, detail: `聚焦時外框下緣主色 ${border.thickness}px(應 1)` })
          checks.push({ id: tag(`U-${c.id}-${end}-keyboard`), kind: 'underline', size: c.size, pass: u.thickness === SPEC_THICKNESS_PX,
            detail: `畫出 ${u.thickness}px(裝置像素列 ${JSON.stringify(u.rows)};樣式值 ${g.styleThickness}、${g.decorationLine};按鈕下緣在範圍內第 ${((g.button.bottom - u.clipTop) * dpr).toFixed(1)} 列)` })
          if (SHOT_DIR && dpr === 2 && c.id === 'md' && end === 'start') {
            mkdirSync(SHOT_DIR, { recursive: true })
            const file = resolve(SHOT_DIR, 'datepicker-range-active-underline.png')
            const pad = 12
            await page.screenshot({ path: file, clip: { x: g.wrap.left - pad, y: g.wrap.top - pad, width: g.wrap.right - g.wrap.left + pad * 2, height: g.wrap.bottom - g.wrap.top + pad * 2 } })
            console.log(`  (畫面:${file};欄位在圖裡的左上角 = (${pad * dpr}, ${pad * dpr}) 裝置像素)`)
          }
        }
        // 點開面板:底線來自 data-active-end(滑鼠點,不是 focus-visible)
        if (!c.long) {
          for (const end of ENDS) {
            await page.click(`[data-case="${c.id}"] button[aria-label="${PLACEHOLDER[end === 'start' ? 0 : 1]}"]`, { timeout: WAIT_CAP_MS })
            await d.settle()
            await parkPointer(page)
            await d.settle()
            const g = await geo(c.id, end)
            if (g.activeEnd !== 'true') throw new InstrumentError(`${c.id}:點 ${end} 端之後面板沒開在這一端(data-active-end=${g.activeEnd})`)
            const u = await countUnderline(page, g, dpr)
            checks.push({ id: tag(`U-${c.id}-${end}-open`), kind: 'underline', size: c.size, pass: u.thickness === SPEC_THICKNESS_PX,
              detail: `畫出 ${u.thickness}px(裝置像素列 ${JSON.stringify(u.rows)};樣式值 ${g.styleThickness})` })
            await d.press('Escape')
          }
        }
        // 長日期:兩端都截斷、沒有溢出
        if (c.long) {
          for (const end of ENDS) {
            const g = await geo(c.id, end)
            const ink = await countSpill(page, g)
            const truncated = g.scrollWidth > g.clientWidth + 1
            const clipsX = g.overflowX !== 'visible'
            const pass = truncated && g.textOverflow === 'ellipsis' && clipsX && ink === 0
            checks.push({ id: tag(`T-${c.id}-${end}`), kind: 'truncate', size: c.size, pass,
              detail: `scrollWidth ${g.scrollWidth} / clientWidth ${g.clientWidth}、text-overflow ${g.textOverflow}、overflow-x ${g.overflowX}、按鈕外那條縫墨點 ${ink}` })
          }
        }
      }
      if (pageErrors.length) throw new InstrumentError(`頁面例外:${pageErrors.join(' | ')}`)
      return checks
    } finally {
      dispose()
    }
  } finally {
    await browser.close()
  }
}

async function runVariant(label, mutateFactory) {
  const checks = []
  for (const dpr of DPRS) checks.push(...await runOnce(dpr, mutateFactory?.()))
  return { label, checks }
}

function report({ label, checks }) {
  console.log(`\n── ${label} ──`)
  for (const c of checks) {
    if (c.kind === 'control' && c.pass) continue
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.id.padEnd(26)} ${c.kind === 'control' ? '[對照] ' : ''}${c.detail}`)
  }
  const controls = checks.filter((c) => c.kind === 'control')
  console.log(`  ${controls.every((c) => c.pass) ? '✓' : '✗'} [對照] 沒聚焦時底線範圍主色列 = 0、聚焦時外框下緣主色 = 1px:${controls.filter((c) => c.pass).length}/${controls.length}`)
}
const redIds = (checks) => checks.filter((c) => !c.pass).map((c) => c.id).sort()

try {
  const rootLabel = SOURCE_ROOT === REPO_ROOT ? '本 repo' : SOURCE_ROOT
  if (!SELFTEST) {
    const result = await runVariant(`原始碼 = ${rootLabel}`, null)
    report(result)
    const red = redIds(result.checks)
    if (red.length) {
      console.log(`\n✗ 日期區間作用端底線:${red.length} 列不符(${red.join(' / ')})—— SSOT date-picker.spec.md「Active-end 機制」視覺指示(decoration-2)`)
      process.exitCode = 1
    } else {
      const contract = result.checks.filter((c) => c.kind !== 'control')
      console.log(`\n✓ 日期區間作用端底線:${contract.length} 列全綠(底線 ${contract.filter((c) => c.kind === 'underline').length} 列畫出 ${SPEC_THICKNESS_PX}px、長日期截斷 ${contract.filter((c) => c.kind === 'truncate').length} 列;像素比 ${DPRS.join(' / ')}),對照 ${result.checks.length - contract.length} 列綠`)
    }
  } else {
    const baseline = await runVariant('現行原始碼(selftest 基準,必須全綠)', null)
    report(baseline)
    const problems = []
    if (redIds(baseline.checks).length) problems.push(`現行原始碼本身就紅(${redIds(baseline.checks).join(' / ')}),突變的紅燈無法歸因`)
    const contract = baseline.checks.filter((c) => c.kind !== 'control')
    const covered = new Set()
    for (const m of MUTANTS) {
      let result
      try {
        result = await runVariant(`突變 ${m.id}:${m.what}`, () => mutantFor(SOURCE_ROOT, MUTANT_FILE, m.apply))
      } catch (error) {
        if (error instanceof InstrumentError) error.message = `突變 ${m.id}:${error.message}`
        throw error
      }
      report(result)
      const red = redIds(result.checks)
      const want = contract.filter(m.redWhen).map((c) => c.id).sort()
      const controlRed = result.checks.filter((c) => c.kind === 'control' && !c.pass).map((c) => c.id)
      if (controlRed.length) problems.push(`${m.id}:對照列 ${controlRed.join(' / ')} 紅了 —— 突變弄壞的是量具,不是契約`)
      if (JSON.stringify(red) !== JSON.stringify(want)) {
        const extra = red.filter((id) => !want.includes(id)); const lack = want.filter((id) => !red.includes(id))
        problems.push(`${m.id}:紅了 ${red.length} 列、應剛好 ${want.length} 列(多紅:${extra.join(', ') || '無'};該紅沒紅:${lack.join(', ') || '無'})`)
      } else {
        console.log(`  → 突變 ${m.id} 剛好紅了該紅的 ${want.length} 列`)
      }
      for (const id of red) covered.add(id)
    }
    const uncovered = contract.map((c) => c.id).filter((id) => !covered.has(id))
    if (uncovered.length) problems.push(`契約列 ${uncovered.join(' / ')} 沒有任何突變能讓它紅 —— 它的綠燈是零證據`)
    if (problems.length) {
      console.log('\n✗ selftest:量具不可信 ——')
      for (const p of problems) console.log(`  - ${p}`)
      process.exitCode = 1
    } else {
      console.log(`\n✓ selftest:${MUTANTS.length} 個根因突變各自剛好紅了該紅的列(契約 ${contract.length} 列全被覆蓋),對照列全程綠 —— 量具會紅`)
    }
  }
} catch (error) {
  if (error instanceof InstrumentError) {
    console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}:${error.message} —— 不是產品裁決,但這一趟不能算通過`)
    process.exitCode = 1
  } else {
    throw error
  }
}
