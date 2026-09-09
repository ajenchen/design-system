#!/usr/bin/env node
/**
 * DataTable 列拖曳把手「裁切與所屬列相同」閘(2026-09-09;user:「drag button 出現在 table body 的垂直可視範圍之外是合理的嗎?」)
 *
 * 根因:把手是 fixed portal,列被 body 面板的 overflow 裁掉時把手不受裁切 —— 列滑到表頭底下,把手還畫在表頭上。
 * 規範:data-table.spec.md「捲動定位」—— 列被面板裁掉多少、把手就裁掉多少;把手不得出現在 body 可視範圍之外。
 *
 * 量法(真實 DOM,不是 attribute):hover 第一個可見列 → 把 center body 捲到讓該列一半滑進表頭底下 → 再捲到整列滑出:
 *   P1 部分滑出:把手 clip-path 有上裁量,且「把手矩形 ∩ 未裁區」完全落在所屬 body 面板矩形內;
 *   P2 整列滑出:把手在其座標上不可命中(elementFromPoint 不是把手 / 把手子孫),且未裁區高度 = 0;
 *   P0 未滑出時:無裁切(clip-path 空)、把手中心 = 列中心(±1px)。
 * `--selftest`:注入 `clip-path:none!important` 讓裁切失效,P1 / P2 必須紅(儀器先證明會紅)。
 *   node scripts/data-table-handle-clip-invariant.mjs [--static=<dir>] [--selftest]
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, dirname, extname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const SELFTEST = process.argv.includes('--selftest')
const staticArg = arg('static')
const STATIC = staticArg ? (isAbsolute(staticArg) ? staticArg : join(process.cwd(), staticArg)) : join(REPO, 'storybook-static')
const STORY = arg('story') ?? 'design-system-components-datatable-展示--roadmap-all-in-one'
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
if (!existsSync(join(STATIC, 'index.json'))) { console.error(`找不到 ${STATIC}/index.json —— 先 build storybook`); process.exit(2) }
// stale-build 守衛:build 必須比 data-table.tsx 新
const srcM = statSync(join(REPO, 'packages/design-system/src/components/DataTable/data-table.tsx')).mtimeMs
if (statSync(join(STATIC, 'index.json')).mtimeMs < srcM) { console.error('✗ storybook-static 比 data-table.tsx 舊,先重建'); process.exit(2) }

const server = createServer((req, res) => {
  const p = join(STATIC, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'iframe.html')
  if (!existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p))
}).listen(0)
const port = server.address().port
let fail = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`); if (!ok) fail++ }

const browser = await launchBrowser()
const page = await (await browser.newContext({ viewport: { width: 1400, height: 800 } })).newPage()
await page.goto(`http://localhost:${port}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, { waitUntil: 'load' })
await page.waitForSelector('[data-datatable-hscroll] [role="row"]', { timeout: 20000 })
await page.waitForTimeout(600)
if (SELFTEST) await page.addStyleTag({ content: 'button[aria-label*="拖"]{clip-path:none!important}' })

// 找第一個可見資料列(primary region = left 面板若有,否則 center),hover 它
const setup = await page.evaluate(() => {
  const sc = document.querySelector('[data-datatable-hscroll]')
  const panels = [...document.querySelectorAll('[data-datatable-panel]')]
  const rows = [...document.querySelectorAll('[data-datatable-panel] [role="row"][data-row-index]')]
  const bodyTop = sc.getBoundingClientRect().top
  const row = rows.find((r) => r.getBoundingClientRect().top >= bodyTop - 1)
  const rr = row.getBoundingClientRect()
  return { idx: row.getAttribute('data-row-index'), rowTop: rr.top, rowH: rr.height, bodyTop, panels: panels.length, sx: rr.left + 40, sy: rr.top + rr.height / 2 }
})
await page.mouse.move(setup.sx, setup.sy); await page.waitForTimeout(400)
const handleSel = 'button[aria-label*="拖"]'
const measure = () => page.evaluate((sel) => {
  const hs = [...document.querySelectorAll(sel)].filter((b) => Number(getComputedStyle(b).opacity) > 0)
  const h = hs[0]; if (!h) return { none: true, count: hs.length }
  const r = h.getBoundingClientRect(); const cs = getComputedStyle(h)
  // computed clip-path 是 CSS 縮寫(1–4 值:上 右 下 左;三值 = 上 左右 下),逐一展開
  const m = /inset\(([^)]*)\)/.exec(cs.clipPath || '')
  const v = m ? m[1].trim().split(/\s+/).map((x) => parseFloat(x) || 0) : []
  const [clipTop, clipBottom] = v.length === 1 ? [v[0], v[0]] : v.length === 2 ? [v[0], v[0]] : v.length === 3 ? [v[0], v[2]] : v.length >= 4 ? [v[0], v[2]] : [0, 0]
  const visTop = r.top + clipTop, visBottom = r.bottom - clipBottom
  const rowIdx = h.closest('[data-row-index]')?.getAttribute('data-row-index')
  const panel = document.querySelector('[data-datatable-panel]')?.getBoundingClientRect()
  const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return { clipPath: cs.clipPath, clipTop, clipBottom, top: r.top, bottom: r.bottom, cy: (r.top + r.bottom) / 2, visTop, visBottom, visH: Math.max(0, visBottom - visTop), panelTop: panel.top, panelBottom: panel.bottom, hitIsHandle: !!at && (at === h || h.contains(at)), hitTag: at?.tagName }
}, handleSel)
const rowCenter = () => page.evaluate((idx) => { const r = document.querySelector(`[data-datatable-panel] [role="row"][data-row-index="${idx}"]`); if (!r) return null; const b = r.getBoundingClientRect(); return (b.top + b.bottom) / 2 }, setup.idx)

const m0 = await measure()
check('P0 hover 後把手顯示、無裁切、中心 = 列中心', !m0.none && !(m0.clipTop > 0 || m0.clipBottom > 0) && Math.abs(m0.cy - (await rowCenter())) <= 1, JSON.stringify(m0))
// 讓該列一半滑進表頭底下:捲 rowH/2(+ 列距表頭頂的距離)
const half = Math.round(setup.rowTop - setup.bodyTop + setup.rowH / 2)
// 捲動後只等一個動畫幀(scroll 事件已送達、把手已同步):約 100ms 後瀏覽器會補發滑鼠事件把 hover 換到指標底下的新列,
// 舊把手開始淡出 —— 淡出中的把手同樣必須被裁(規格:淡出期間仍跟隨列),所以量「還畫著的那一刻」。
const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
await page.evaluate((px) => { const sc = document.querySelector('[data-datatable-hscroll]'); sc.scrollTop += px }, half)
await frame()
const m1 = await measure()
const p1ok = !m1.none && m1.clipTop > 0 && m1.visTop >= m1.panelTop - 1 && m1.visBottom <= m1.panelBottom + 1 && m1.visH > 0 && m1.visH < (m1.bottom - m1.top)
const p1bad = !m1.none && m1.clipTop === 0 && m1.top < m1.panelTop - 1 // 裁切失效:把手還畫著、沒裁、卻已伸進表頭
check('P1 列一半滑進表頭底下 → 把手上半被裁、未裁區落在 body 面板內', SELFTEST ? p1bad : p1ok, JSON.stringify({ visible: !m1.none, clip: m1.clipPath, top: m1.top, visTop: m1.visTop, panelTop: m1.panelTop, visH: m1.visH }))
// 整列滑出(同樣只等一幀)
await page.evaluate((px) => { const sc = document.querySelector('[data-datatable-hscroll]'); sc.scrollTop += px }, Math.round(setup.rowH))
await frame()
const m2 = await measure()
const p2ok = !m2.none && m2.visH === 0 && !m2.hitIsHandle
const p2bad = !m2.none && m2.visH > 0 && m2.top < m2.panelTop - 1
check('P2 整列滑出 → 把手全裁、座標上不可命中', SELFTEST ? p2bad : p2ok, JSON.stringify({ visible: !m2.none, visH: m2.visH, top: m2.top, panelTop: m2.panelTop, hit: m2.hitTag, clip: m2.clipPath }))
await browser.close(); server.close()
console.log(fail ? `\n✗ ${fail} 項未通過` : `\n✓ ${SELFTEST ? '對照組:裁切失效時 P1 / P2 如預期變紅(儀器有效)' : '把手裁切與所屬列相同:全通過'}`)
process.exit(fail ? 1 : 0)
