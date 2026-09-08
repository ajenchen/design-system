#!/usr/bin/env node
/**
 * DataTable 捲動成本閘 —— 2026-09-08
 *
 * 背景:user 回報「大修之後,專案排程全功能整合的捲動變很慢」。根因(data-table.tsx):
 *   - `measureScrollbarGutters` 掛在無依賴的 useLayoutEffect → 每次 render 都量(每次量都是一次強制排版);
 *   - `syncSharedRowHeights` 每次都全量重量所有列(virtual range 每捲一格就 render 一次)。
 * 修法:量 gutter 只在 mount;列高同步改增量(只量新進 range 的列),全量只在 rows/欄寬/size 變時。
 *
 * 本閘把「每捲一步有多少次強制排版」量出來(monkeypatch getBoundingClientRect 計數),
 * 用**次數**當預算(不用毫秒,CI 機器快慢不一)。修前 roadmap story 量到 ~135 次/步,修後見 BUDGET。
 * 對照組:`--selftest` 把預算設 0,閘必須變紅(證明計數器真的在數)。
 */
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const STATIC = join(REPO, 'storybook-static')
const SELFTEST = process.argv.includes('--selftest')
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
// 每捲一步允許的 getBoundingClientRect 次數(修後實測值的 2 倍,留列高增量量測的空間)
const BUDGET = SELFTEST ? 0 : 80 // 修後實測 47(Combobox 標籤摺疊掛載量測為主),修前 144;留 CI 字型差異造成列數不同的餘裕
const STORIES = ['design-system-components-datatable-展示--roadmap-all-in-one', 'design-system-components-datatable-展示--virtual-scroll']

const server = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'
  const f = join(STATIC, p)
  if (!existsSync(f) || statSync(f).isDirectory()) { s.writeHead(404); s.end(); return }
  s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f))
})
await new Promise((r) => server.listen(0, r))
const BASE = `http://localhost:${server.address().port}`
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
await page.addInitScript(() => {
  window.__gbcr = 0
  const orig = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function () { window.__gbcr++; return orig.call(this) }
})
let failed = 0
for (const id of STORIES) {
  await page.goto(`${BASE}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  const r = await page.evaluate(async () => {
    const el = document.querySelector('[data-datatable-hscroll]')
    if (!el || el.scrollHeight <= el.clientHeight + 1) return null
    const step = Math.max(40, Math.floor(el.clientHeight / 3))
    const steps = 30
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    await frame(); window.__gbcr = 0
    const t0 = performance.now()
    for (let i = 0; i < steps; i++) { el.scrollTop += step; await frame() }
    const ms = (performance.now() - t0) / steps
    return { perStep: window.__gbcr / steps, ms: +ms.toFixed(1), scrolled: el.scrollTop }
  })
  if (!r) { console.log(`⏭  ${id}:沒有垂直溢出,不適用`); continue }
  const ok = r.perStep <= BUDGET // 0 次也合法(固定列高的表不需要量);計數器有沒有在數由 --selftest 證明
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${id.replace('design-system-components-datatable-展示--', '')}:每步 getBoundingClientRect ${r.perStep.toFixed(1)} 次(預算 ${BUDGET}),每步 ${r.ms} ms`)
}
await browser.close(); server.close()
if (SELFTEST) { console.log(failed ? '✓ selftest:預算 0 時閘變紅,計數器有效' : '✗ selftest:預算 0 仍綠 —— 計數器沒在數'); process.exit(failed ? 0 : 1) }
console.log(failed ? `✗ ${failed} 支 story 超出捲動成本預算` : '✓ 捲動成本在預算內')
process.exit(failed ? 1 : 0)
