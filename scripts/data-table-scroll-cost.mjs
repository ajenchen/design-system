#!/usr/bin/env node
/**
 * DataTable 捲動成本閘 —— 2026-09-08
 *
 * 背景:user 回報「大修之後,專案排程全功能整合的捲動變很慢」。三個根因(data-table.tsx)全是**每次 render 都做**的事:
 *   - `syncSharedRowHeights` 掛在無依賴的 useLayoutEffect → 每次 render 全量重量所有列;
 *   - `RowDragHandle` 的 effect 依賴整個 ctx 物件 → 每列每步重跑、各量兩次;
 *   - dnd-kit `MeasuringStrategy.Always` → 不拖曳也每步重量全部 droppable。
 *
 * 量法(2026-09-08 第二版):用 **1px 步進**(不會有新列掛載)量「每次 render 的捲動成本」——
 * monkeypatch getBoundingClientRect 數次數。第一版用 1/3 視窗高的大步,把新掛載儲存格的標籤摺疊量測
 * (Combobox `[data-tag-root]`,ResizeObserver 驅動、隨機器快慢與字型載入時序變動)也算進去,
 * 本機 47/步、CI 200/步,同一份程式碼兩個數字 —— 那是掛載成本不是捲動回歸(Codex R5 也點出這個量法的意義要縮限)。
 * 大步的數字改成資訊列印,不當斷言。用**次數**當預算(毫秒受機器影響)。
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
// 每捲 1px 一步允許的 getBoundingClientRect 次數:修前(把手 effect 每列重跑)實測 ~4/步且隨可見列數線性成長,修後 0–2
const BUDGET = SELFTEST ? 0 : 12
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
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const run = async (step, steps) => {
      await frame(); window.__gbcr = 0
      const t0 = performance.now()
      for (let i = 0; i < steps; i++) { el.scrollTop += step; await frame() }
      return { perStep: window.__gbcr / steps, ms: +((performance.now() - t0) / steps).toFixed(1) }
    }
    // 先跳到中段,讓兩種步進都在同一段資料上量
    el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 3); await frame(); await frame()
    const fine = await run(1, 30)                                   // 斷言:每次 render 的成本
    const coarse = await run(Math.max(40, Math.floor(el.clientHeight / 3)), 12) // 資訊:含新列掛載
    return { fine, coarse, scrolled: el.scrollTop }
  })
  if (!r) { console.log(`⏭  ${id}:沒有垂直溢出,不適用`); continue }
  // 對照組用大步(必有掛載量測、必 > 0)證明計數器在數;正式斷言用 1px 步進(可以是 0)
  const ok = SELFTEST ? r.coarse.perStep <= BUDGET : r.fine.perStep <= BUDGET
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${id.replace('design-system-components-datatable-展示--', '')}:1px 步進每步 getBoundingClientRect ${r.fine.perStep.toFixed(1)} 次(預算 ${BUDGET}),${r.fine.ms} ms;大步含掛載(資訊)${r.coarse.perStep.toFixed(1)} 次 / ${r.coarse.ms} ms`)
}
await browser.close(); server.close()
if (SELFTEST) { console.log(failed ? '✓ selftest:預算 0 時閘變紅,計數器有效' : '✗ selftest:預算 0 仍綠 —— 計數器沒在數'); process.exit(failed ? 0 : 1) }
console.log(failed ? `✗ ${failed} 支 story 超出捲動成本預算` : '✓ 捲動成本在預算內')
process.exit(failed ? 1 : 0)
