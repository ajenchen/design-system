#!/usr/bin/env node
// AgentFab 命中區不變條件 —— 守「看得到就點得到,且點得到不代表要長出捲軸」。
//
//   (H1) 任一形態下,入口鈕的**命中矩形 = 可視形狀的外接矩形**(2026-09-04 user 拍板:
//        「只要觸控範圍跟視覺範圍是對齊的話,此問題就解決了」)。不多也不少:
//        - 少了 → 看得到卻點不到(最早的死區:貼邊態是左側半圓,靠近左緣但偏離垂直中心的點
//          落在圓外,實測 dy=±12 時最左 1–3px 點不到);
//        - 多了 → 隱形帶會從底下的內容搶走點擊,而且 Radix 以按鈕為錨,tooltip 會被推遠
//          (2026-09-03 外推到 40 的那版實測:tooltip 離可視形狀 20px 而不是 8px)。
//        桌機慣例就是命中貼齊視覺(滑鼠指標夠精細),不做 mobile 那種放大。
//
//   (H4) **四個角落都點得到**:圓角只畫在內層,按鈕本身是矩形 —— 這是 H1「等於外接矩形」
//        真正要保住的東西,單看外框極值看不出角落有沒有被圓角切掉。
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

/** 掃描窗外擴量(px):要能看出「命中區比可視大」與「比可視小」兩種偏差。 */
const SCAN_PAD = 24
/** 命中矩形與可視外接矩形的容差(px):整數取樣本身就有 1px 量化。 */
const EDGE_TOLERANCE = 1.5

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto(`${BASE}/iframe.html?id=design-system-components-agentpanel-設計規格--fab-placements&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-placement]')
// 形態過渡(width/height/right/top)跑完再量,否則量到動畫中途的尺寸。
await page.waitForTimeout(600)

const measured = await page.evaluate((PAD) => {
  const hits = (btn) => (x, y) => {
    const el = document.elementFromPoint(x, y)
    return !!el && el.closest('button') === btn
  }
  const hitRect = (btn, visual) => {
    const v = visual.getBoundingClientRect()
    const x0 = Math.floor(v.left - PAD)
    const x1 = Math.ceil(v.right + PAD)
    const y0 = Math.floor(v.top - PAD)
    const y1 = Math.ceil(v.bottom + PAD)
    const h = hits(btn)
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!h(x, y)) continue
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
    // 可視形狀 = 按鈕的內層(帶圓角、漸層環的那一片)。命中契約以它為準,不是以按鈕的 class 為準。
    const visual = btn.firstElementChild
    const stage = shell.offsetParent
    const st = stage.getBoundingClientRect()
    const v = visual.getBoundingClientRect()
    const h = hits(btn)
    // 角落:從可視外接矩形的四角往內縮 1px 取樣(縮 1 是為了避開邊界的半像素)。
    const corners = [
      ['左上', v.left + 1, v.top + 1],
      ['右上', v.right - 1, v.top + 1],
      ['左下', v.left + 1, v.bottom - 1],
      ['右下', v.right - 1, v.bottom - 1],
    ].map(([name, x, y]) => ({ name, hit: h(Math.round(x), Math.round(y)) }))
    const sh = shell.getBoundingClientRect()
    return {
      placement: shell.dataset.placement,
      visual: { l: +v.left.toFixed(1), r: +v.right.toFixed(1), t: +v.top.toFixed(1), b: +v.bottom.toFixed(1), w: +v.width.toFixed(1), h: +v.height.toFixed(1) },
      hit: hitRect(btn, visual),
      corners,
      // 殼比鈕大出來的部分 = 看不見、不吃指標,卻仍在 tooltip 覆蓋範圍內的死區(H5)。
      shellSlack: { w: +(sh.width - v.width).toFixed(1), h: +(sh.height - v.height).toFixed(1) },
      stage: {
        r: +(st.left + stage.clientLeft + stage.clientWidth).toFixed(1),
        b: +(st.top + stage.clientTop + stage.clientHeight).toFixed(1),
        overflowX: stage.scrollWidth - stage.clientWidth,
        overflowY: stage.scrollHeight - stage.clientHeight,
      },
    }
  })
}, SCAN_PAD)

record('H0', '找得到入口鈕', measured.length > 0, `找到 ${measured.length} 顆`)

// (H5) **定位殼不得大於鈕** —— 2026-09-04 user 回報「hover 出現 tooltip 的地方點下去打不開」的根因之一。
// 舊版把殼釘在 40 寬(`w-10`),貼邊時鈕只有 28,左側就多出 12px:看不見、`pointer-events-none` 不吃指標,
// 但貼邊態的 tooltip 正好開在鈕的**左邊**,於是那條帶子同時滿足「tooltip 開著」與「點不到」。
// 實測重現(修正前):hover 鈕中心 → tooltip 開;往左 6px → `elementFromPoint` 回底下的表格、tooltip 仍開;
// 在那裡點下去面板不開。殼 = 鈕之後,這個帶子在結構上不存在。
for (const m of measured) {
  const tag = `[${m.placement}]`
  record('H5', `${tag} 定位殼沒有比鈕大(不留看不見的死區)`,
    Math.abs(m.shellSlack.w) <= 1 && Math.abs(m.shellSlack.h) <= 1,
    `殼比鈕寬 ${m.shellSlack.w}px、高 ${m.shellSlack.h}px(>1 = 有一條看得到 tooltip 卻點不到的帶子)`)
}

for (const m of measured) {
  const tag = `placement=${m.placement}`
  if (!m.hit) {
    record('H1', `${tag} 命中矩形 = 可視外接矩形`, false, '命中矩形量不到:整顆鈕都點不到')
    continue
  }
  const dl = Math.abs(m.hit.left - m.visual.l)
  const dr = Math.abs(m.hit.right - (m.visual.r - 1))
  const dt = Math.abs(m.hit.top - m.visual.t)
  const db = Math.abs(m.hit.bottom - (m.visual.b - 1))
  record(
    'H1',
    `${tag} 命中矩形 = 可視外接矩形(不多不少)`,
    dl <= EDGE_TOLERANCE && dr <= EDGE_TOLERANCE && dt <= EDGE_TOLERANCE && db <= EDGE_TOLERANCE,
    `可視 [${m.visual.l},${m.visual.t}]–[${m.visual.r},${m.visual.b}] / 命中 [${m.hit.left},${m.hit.top}]–[${m.hit.right},${m.hit.bottom}] `
      + `→ 四邊差 L${dl.toFixed(1)} R${dr.toFixed(1)} T${dt.toFixed(1)} B${db.toFixed(1)}`
      + `(偏小 = 看得到卻點不到;偏大 = 隱形帶搶走底下內容的點擊,且 tooltip 會被推遠)`,
  )
  const missedCorners = m.corners.filter((c) => !c.hit).map((c) => c.name)
  record(
    'H4',
    `${tag} 可視形狀的四個角落都點得到(圓角不得切掉命中)`,
    missedCorners.length === 0,
    `點不到的角:${missedCorners.join('、') || '無'}`,
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
