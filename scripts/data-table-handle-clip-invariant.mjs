#!/usr/bin/env node
/**
 * DataTable 列拖曳把手「可視帶 + 捲動閂鎖」閘(2026-09-10 取代 2026-09-09 的 clip-path 閘;檔名沿用,CI 已接)
 *
 * user 2026-09-09:「drag button 出現在 table body 的垂直可視範圍之外是合理的嗎?」→ 把手不得出現在 body 可視帶之外。
 * user 2026-09-10:「這樣的效果看起來好醜,drag button會直接被裁掉…jira在捲動table的時候會把drag button藏起來直到滑鼠再次滑到其他table row」
 *   → 不再用 clip-path 把 24px chip 切成殘片;捲動即藏、指標真的移動才顯;整顆放得進可視帶才顯示。
 * 規範:data-table.spec.md「捲動與可視帶」。
 *
 * 量法(真實 DOM,不是 attribute):
 *   P0 hover 一條完整可見的列 → 把手顯示、無 clip-path、中心 = 列中心(±1px)、整顆在可視帶內
 *   P1a 捲到該列一半滑進表頭底下、指標不動 → 沒有任何把手在畫(閂鎖)
 *   P1b 指標移 1px(仍在那條半露的列上)→ 仍沒有把手(放不進可視帶)
 *   P1c 指標移到一條完整可見的列 → 把手回來、中心 = 該列中心
 *   P2 捲到整列滑出、指標不動 → 沒有把手
 *   P3 傳統 17px 捲軸幾何(Windows;headless 預設 --hide-scrollbars 量不到,要拿掉再用根規則造捲軸):
 *      把列捲到「列中心在 client 底上方 6px」→ 指標移過去 → 沒有把手(chip 會坐到捲軌上);再捲 10px 讓它放得進 → 有把手且底 ≤ client 底
 * `--selftest`:注入 `opacity:1 / pointer-events:auto !important` 讓所有把手強制顯示 → P1a / P1b / P2 / P3 必須紅(儀器先證明會紅)。
 *   node scripts/data-table-handle-clip-invariant.mjs [--static=<dir>] [--selftest]
 *
 * 開 story(2026-09-25 起)走 lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作):Storybook 回報渲染完成(含 play)
 * + render-health + 列出現 + 注入 17px 捲軸之後版面連續靜止 N 個影格才開始量。原本是 `load` + 等列 + 固定睡 600ms。
 * story 開不起來(chunk 404、渲染拋錯、等不到列)→ **儀器失效**:點名 story、附 Storybook 錯誤原文與同源 404 帳本,exit 1;
 * 不是產品裁決,也不會被當成通過(不用 exit 2:lib/gate-selftest-meta.mjs 在 2026-09-25 修正前把 2 讀成「缺前置 → 略過」)。
 * 量測中途的固定等待(捲動後 250ms、移動指標後 450ms)不是「已渲染」的代理,是等互動本身的後果(見各處註解),保留。
 */
import { statSync } from 'node:fs'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, StoryRenderInstrumentError, requireStorybookBuild, STALE_BUILD_MARKER } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const SELFTEST = process.argv.includes('--selftest')
const staticArg = arg('static')
const STATIC = staticArg ? (isAbsolute(staticArg) ? staticArg : join(process.cwd(), staticArg)) : join(REPO, 'storybook-static')
const STORY = arg('story') ?? 'design-system-components-datatable-展示--roadmap-all-in-one'
requireStorybookBuild(join(STATIC, 'index.json'))
// stale-build 守衛:預設目錄的 build 必須比 data-table.tsx 新(指定 --static 的並行工作者自己負責)
const srcM = statSync(join(REPO, 'packages/design-system/src/components/DataTable/data-table.tsx')).mtimeMs
if (!staticArg && statSync(join(STATIC, 'index.json')).mtimeMs < srcM) { console.error(`✗ ${STALE_BUILD_MARKER}:storybook-static 比 data-table.tsx 舊,先重建`); process.exit(2) }

// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
const printNotFound = () => { if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) }
let fail = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`); if (!ok) fail++ }
// 期望值在對照組反轉:對照組把把手全部強制顯示,「不該有把手」的斷言必須紅
const expect = (name, ok, flipInSelftest, detail) => check(name, SELFTEST && flipInSelftest ? !ok : ok, detail)

let browser
let instrumentFailure = null
try {
  browser = await launchBrowser({ ignoreDefaultArgs: ['--hide-scrollbars'] })
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 800 } })).newPage()
  await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, {
    waitFor: '[data-datatable-hscroll] [role="row"]',
    // 靜止判定之前注入:捲軸幾何改變 → 表格重量 → 重畫,由同一個靜止判定涵蓋(原本注入後固定睡 600ms)
    beforeSettle: async (p) => {
      // 傳統捲軸幾何(Windows / macOS 接滑鼠):17px;overlay 捲軸下 clientHeight = offsetHeight,P3 量不到差異
      await p.addStyleTag({ content: '::-webkit-scrollbar{width:17px;height:17px}::-webkit-scrollbar-thumb{background:#999}' })
      if (SELFTEST) await p.addStyleTag({ content: 'button[aria-label*="拖"]{opacity:1!important;pointer-events:auto!important}' })
    },
    settleFrames: 10, notFound: server.notFound,
  })

  const handleSel = 'button[aria-label*="拖"]'
  const sc = () => page.evaluate(() => { const e = document.querySelector('[data-datatable-hscroll]'); return { top: e.scrollTop, left: e.scrollLeft } })
  // 捲動後的 250ms 不是「已渲染」的代理:等的是捲動事件把閂鎖閂上、虛擬列重排,以及把手 150ms 的 opacity 過渡走完
  const scrollBy = async (px) => { await page.evaluate((d) => { document.querySelector('[data-datatable-hscroll]').scrollTop += d }, px); await page.waitForTimeout(250) }
  /** 所屬 body 面板(primary = center)的可視帶(client box)與所有列的中心。 */
  const geometry = () => page.evaluate(() => {
    const panel = document.querySelector('[data-datatable-panel="center"]')
    const pr = panel.getBoundingClientRect()
    const bandTop = pr.top + panel.clientTop, bandBottom = bandTop + panel.clientHeight
    // 只取有把手錨點的列(depth 0;巢狀子列不可拖、沒有把手 —— roadmap story 有 4 列子任務)
    const rows = [...panel.querySelectorAll('[role="row"][data-row-index]')].filter((r) => r.querySelector(':scope > span[aria-hidden][style*="width: 0"]')).map((r) => { const b = r.getBoundingClientRect(); return { idx: r.getAttribute('data-row-index'), top: b.top, bottom: b.bottom, cy: (b.top + b.bottom) / 2, h: b.height, x: b.left + 60 } })
    return { bandTop, bandBottom, offsetBottom: pr.bottom, scrollbar: Math.round(pr.height - panel.clientHeight), rows }
  })
  /** 正在畫的把手(computed opacity > 0)。 */
  const painted = () => page.evaluate((sel) => {
    const hs = [...document.querySelectorAll(sel)].filter((b) => Number(getComputedStyle(b).opacity) > 0)
    return hs.map((h) => { const r = h.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { top: r.top, bottom: r.bottom, cy: (r.top + r.bottom) / 2, opacity: Number(getComputedStyle(h).opacity), clip: getComputedStyle(h).clipPath, hit: !!at && (at === h || h.contains(at)), row: h.closest('[data-row-index]')?.getAttribute('data-row-index') ?? null } })
  }, handleSel)
  const fullyVisibleRow = (g, skip = 0) => g.rows.filter((r) => r.top >= g.bandTop - 0.5 && r.bottom <= g.bandBottom + 0.5)[skip]

  // ── P0 ──
  let g = await geometry()
  const r0 = fullyVisibleRow(g, 1)
  // 移動指標後的 450ms(本檔各處同):等 hover 追蹤把把手掛上 / 放開閂鎖,以及把手 150ms 的 opacity 過渡走完 —— 元素早已在畫面上,不是「已渲染」的代理
  await page.mouse.move(r0.x, r0.cy); await page.waitForTimeout(450)
  let hs = await painted()
  check('P0 hover 完整可見的列 → 把手顯示、無 clip-path、中心 = 列中心、整顆在可視帶內', hs.length === 1 && hs[0].opacity === 1 && hs[0].clip === 'none' && Math.abs(hs[0].cy - r0.cy) <= 1 && hs[0].top >= g.bandTop - 0.5 && hs[0].bottom <= g.bandBottom + 0.5 && hs[0].hit, JSON.stringify({ hs, row: r0.cy, band: [g.bandTop, g.bandBottom] }))

  // ── P1a 列一半滑進表頭底下、指標不動 ──
  await scrollBy(Math.round(r0.top - g.bandTop + r0.h / 2))
  hs = await painted()
  expect('P1a 捲到該列一半滑進表頭底下、指標不動 → 沒有任何把手在畫(捲動閂鎖)', hs.length === 0, true, JSON.stringify(hs))
  // ── P1b 指標動了,停在半露的列露出的那一段上 ──
  g = await geometry()
  const half = g.rows.find((r) => r.idx === r0.idx)
  await page.mouse.move(half.x, Math.min(half.bottom - 4, g.bandTop + (half.bottom - g.bandTop) / 2)); await page.waitForTimeout(450)
  hs = await painted()
  expect('P1b 指標移到半露的列露出的那一段 → 仍沒有把手(24px 放不進可視帶)', hs.length === 0 && half.top < g.bandTop - 1 && half.bottom > g.bandTop + 1, true, JSON.stringify({ hs, half, bandTop: g.bandTop }))
  // ── P1c 指標移到完整可見的列 ──
  const r1 = fullyVisibleRow(g, 1)
  await page.mouse.move(r1.x, r1.cy); await page.waitForTimeout(450)
  hs = await painted()
  // 對照組把所有把手都強制顯示,這裡只看「有一顆在該列中心」(P1c / P3b 不是對照組要驗的斷言)
  check('P1c 指標移到完整可見的列 → 把手回來、中心 = 該列中心', SELFTEST ? hs.some((h) => Math.abs(h.cy - r1.cy) <= 1) : hs.length === 1 && hs[0].opacity === 1 && Math.abs(hs[0].cy - r1.cy) <= 1, JSON.stringify({ hs, row: r1.cy }))

  // ── P2 整列滑出、指標不動 ──
  await scrollBy(Math.round(r1.h * 2))
  hs = await painted()
  expect('P2 捲到整列滑出、指標不動 → 沒有把手', hs.length === 0, true, JSON.stringify(hs))

  // ── P3 傳統捲軸幾何:chip 不得坐到水平捲軌上 ──
  g = await geometry()
  const last = [...g.rows].reverse().find((r) => r.cy < g.bandBottom)   // 最靠近 client 底的列
  // 讓它的中心停在 client 底上方 6px(chip 會超出 6px)
  await scrollBy(Math.round(last.cy - (g.bandBottom - 6)))
  g = await geometry()
  const near = g.rows.find((r) => r.idx === last.idx)
  await page.mouse.move(near.x, near.cy - 3); await page.waitForTimeout(450)
  hs = await painted()
  expect(`P3a 傳統捲軸(${g.scrollbar}px)幾何:列中心在 client 底上方 6px → 沒有把手(否則 chip 坐在捲軌上)`, g.scrollbar >= 15 && hs.length === 0, true, JSON.stringify({ hs, near: near.cy, bandBottom: g.bandBottom, offsetBottom: g.offsetBottom }))
  await scrollBy(10)
  await page.mouse.move(near.x, near.cy - 13); await page.waitForTimeout(450)
  g = await geometry(); hs = await painted()
  const nearB = g.rows.find((r) => r.idx === last.idx)
  check('P3b 再捲 10px 讓 chip 放得進 → 有把手且底 ≤ client 底(不越過捲軌)', SELFTEST ? hs.some((h) => Math.abs(h.cy - nearB.cy) <= 1 && h.bottom <= g.bandBottom + 0.5) : hs.length === 1 && hs[0].bottom <= g.bandBottom + 0.5 && Math.abs(hs[0].cy - nearB.cy) <= 1, JSON.stringify({ hs, near: nearB?.cy, bandBottom: g.bandBottom }))

} catch (error) {
  if (!(error instanceof StoryRenderInstrumentError)) { printNotFound(); throw error }
  instrumentFailure = error
} finally {
  await browser?.close()
  await server.stop()
}
if (instrumentFailure) {
  // 沒量到 ≠ 通過,也 ≠ 產品壞了:點名 story、附 404 帳本,exit 1(不是 2 —— 2 會被 meta-test 讀成「缺前置 → 略過」)
  console.error(`\n✗ ${instrumentFailure.message}`)
  printNotFound()
  process.exit(1)
}
if (fail) printNotFound()
console.log(fail ? `\n✗ ${fail} 項未通過` : `\n✓ ${SELFTEST ? '對照組:把手強制顯示時 P1a / P1b / P2 / P3a 如預期變紅(儀器有效)' : '把手可視帶 + 捲動閂鎖:全通過'}`)
process.exit(fail ? 1 : 0)
