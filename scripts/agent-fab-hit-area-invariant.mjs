#!/usr/bin/env node
// AgentFab 命中區不變條件 —— 守「看得到就點得到,且點得到不代表要長出捲軸」。
//
//   (H1) 任一形態下,入口鈕的**命中矩形** ≥ 40×40(= FAB_PX,DS 的最小點擊尺寸;
//        Material 48dp / Apple HIG 44pt / WCAG 2.5.5 AAA 44 CSS px 都在這之上,40 是本 DS
//        既有的 --field-height-lg,兩態同一個數)。
//        貼邊態只露 28,若命中區跟著縮成 28,鈕左邊就會出現一條**指標穿透的縫**;那條縫底下
//        往往正是被鈕蓋住的容器捲軸 → 真滑鼠點下去命中捲軸軌道,內容翻頁、面板不開。
//        (2026-09-03 實測:鈕命中起點 x=1252、表格捲軸帶 x∈[1248,1262] → 4px 縫全落在軌道上。)
//
//   (H2) 命中矩形不得越過舞台右緣/下緣 —— 越過會讓文件變寬變高而生出視窗捲軸
//        (user 明確要求:各種 fab 狀態都不該讓視窗突然出現水平或垂直捲軸)。
//
//   (H3) 舞台本身不得因為入口鈕而溢出(scrollWidth/scrollHeight 不超過 clientWidth/Height)。
//
// 掃法刻意用 `document.elementFromPoint(...).closest('button')`:量的是**瀏覽器真正的命中測試**,
// 不是 class 或 rect 的字面值 —— rect 對了但被 pointer-events-none / overflow-clip / portal 吃掉
// 的情況只有這樣掃得出來(M32:pixel-quantified verify ≠ attribute existence)。
//
// Run: `node scripts/agent-fab-hit-area-invariant.mjs`(併在 `npm run test:agent-panel-invariants`)

import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')

if (!existsSync(STATIC)) {
  console.error('✗ storybook-static missing. Run `npm run build-storybook` first.')
  process.exit(1)
}

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise(r => server.listen(0, r))
const BASE = `http://localhost:${server.address().port}`

let browser
try {
  browser = await chromium.launch({ headless: true })
} catch (error) {
  // 受限沙箱結構上起不了 Chromium = 環境問題不是不變條件失敗(同 data-table-invariants 先例)。
  server.close()
  console.error(`⚠️  SKIPPED-ENV: 無法啟動 Chromium(${String(error?.message || error).split('\n')[0]})`)
  process.exit(0)
}

const failures = []
const passes = []
const record = (id, label, pass, detail = '') =>
  pass ? passes.push(`✓ ${id} | ${label}`) : failures.push(`✗ ${id} | ${label} | ${detail}`)

/** DS 最小點擊尺寸(= agent-panel-fab.tsx 的 FAB_PX / --field-height-lg)。 */
const MIN_TARGET = 40

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto(`${BASE}/iframe.html?id=design-system-components-agentpanel-設計規格--fab-placements&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-placement]')
// 形態過渡(width/height/right/top)跑完再量,否則量到動畫中途的尺寸。
await page.waitForTimeout(600)

const measured = await page.evaluate((MIN) => {
  const hitRect = (btn, shell) => {
    const b = btn.getBoundingClientRect()
    const s = shell.getBoundingClientRect()
    // 掃描窗:比殼再外擴 MIN,才看得到「命中區比殼還大」與「比殼還小」兩種情形。
    const x0 = Math.floor(Math.min(s.left, b.left) - MIN)
    const x1 = Math.ceil(Math.max(s.right, b.right) + MIN)
    const y0 = Math.floor(Math.min(s.top, b.top) - MIN)
    const y1 = Math.ceil(Math.max(s.bottom, b.bottom) + MIN)
    const hits = (x, y) => {
      const el = document.elementFromPoint(x, y)
      return !!el && el.closest('button') === btn
    }
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!hits(x, y)) continue
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
    return Number.isFinite(left)
      ? { left, right, top, bottom, w: right - left + 1, h: bottom - top + 1 }
      : null
  }
  return [...document.querySelectorAll('[data-placement]')].map((shell) => {
    const btn = shell.querySelector('button')
    const stage = shell.offsetParent
    const st = stage.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    return {
      placement: shell.dataset.placement,
      visible: { l: +b.left.toFixed(1), r: +b.right.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) },
      hit: hitRect(btn, shell),
      stage: {
        r: +(st.left + stage.clientLeft + stage.clientWidth).toFixed(1),
        b: +(st.top + stage.clientTop + stage.clientHeight).toFixed(1),
        overflowX: stage.scrollWidth - stage.clientWidth,
        overflowY: stage.scrollHeight - stage.clientHeight,
      },
    }
  })
}, MIN_TARGET)

record('H0', '找得到入口鈕', measured.length > 0, `找到 ${measured.length} 顆`)

for (const m of measured) {
  const tag = `placement=${m.placement}`
  if (!m.hit) {
    record('H1', `${tag} 命中矩形 ≥ ${MIN_TARGET}×${MIN_TARGET}`, false, '命中矩形量不到:整顆鈕都點不到')
    continue
  }
  record(
    'H1',
    `${tag} 命中矩形 ≥ ${MIN_TARGET}×${MIN_TARGET}`,
    m.hit.w >= MIN_TARGET && m.hit.h >= MIN_TARGET,
    `可視 ${m.visible.w}×${m.visible.h} / 命中 ${m.hit.w}×${m.hit.h}(命中區小於最小點擊尺寸 → 鈕左緣會有指標穿透的縫)`,
  )
  record(
    'H2',
    `${tag} 命中矩形不越過舞台右/下緣`,
    m.hit.right <= Math.ceil(m.stage.r) && m.hit.bottom <= Math.ceil(m.stage.b),
    `命中右緣 ${m.hit.right} vs 舞台 ${m.stage.r} / 命中下緣 ${m.hit.bottom} vs 舞台 ${m.stage.b}`,
  )
  record(
    'H3',
    `${tag} 舞台不因入口鈕溢出`,
    m.stage.overflowX <= 0 && m.stage.overflowY <= 0,
    `overflowX=${m.stage.overflowX} overflowY=${m.stage.overflowY}`,
  )
}

await browser.close()
server.close()

console.log(passes.join('\n'))
if (failures.length) {
  console.error('\n' + failures.join('\n'))
  console.error(`\n✗ AgentFab 命中區不變條件:${failures.length} 條失敗`)
  process.exit(1)
}
console.log(`\n✓ AgentFab 命中區不變條件全過(${passes.length} 條)`)
