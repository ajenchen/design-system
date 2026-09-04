#!/usr/bin/env node
// AgentFab 命中區不變條件 —— 守「看得到就點得到,且點得到不代表要長出捲軸」。
//
//   (H1) **可視形狀內的每一點都點得到**(2026-09-04 user 拍板原話:
//        「按鈕的視覺 = 觸發事件的範圍 = 會觸發 tooltip 的範圍」;
//         「當我點擊按鈕的任何地方包括左側靠近邊邊的地方,只要還在按鈕範圍內就應該觸發事件」)。
//        少一點都不行 —— 看得到卻點不到就是使用者說的「難按」。
//
//   (H4) **可視形狀外的點不得點得到**(H1 的另一半,兩條合起來才是「命中 ≡ 視覺」)。
//        容差只給次像素:瀏覽器對圓角的命中測試本身有抗鋸齒,超出形狀邊界 ≤1.5px 不算違規,
//        再多就是隱形帶 —— 它會從底下的內容搶走點擊,而且 Radix 以按鈕為錨、tooltip 會被推遠
//        (2026-09-03 外推到 40 的那版實測:tooltip 離可視形狀 20px 而不是 8px)。
//
//        **這兩條 2026-09-04 取代了舊契約「命中矩形 = 可視形狀的外接矩形 / 四個角落都點得到」。**
//        舊契約的依據是一次誤判:當時記錄「貼邊態 dy=±12 時最左 1–3px 點不到」並歸因於圓角命中,
//        但 D 形左半圓半徑 14、圓心 (14,14),在該高度左緣本來就在 x = 14 − √(14²−12²) ≈ 6.8 ——
//        那幾個點原本就在**可視形狀之外**,不是死區。把「視覺外」誤讀成「死區」,才推導出
//        「命中盒必須是外接矩形」。
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
/** 形狀外仍可點的容差(px):瀏覽器對圓角的命中測試有抗鋸齒,次像素溢出不算違規。 */
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
    // 「在可視形狀內嗎」= 圓角矩形的點內測試。半徑直接讀 computed style,所以這條斷言
    // 對任何形態都成立(在家 rounded-full / 貼邊 rounded-l-full),不必為每個形態各寫一份幾何。
    const cs = getComputedStyle(visual)
    const px = (s) => Math.min(parseFloat(s) || 0, Math.min(v.width, v.height) / 2)
    const rad = {
      tl: px(cs.borderTopLeftRadius), tr: px(cs.borderTopRightRadius),
      br: px(cs.borderBottomRightRadius), bl: px(cs.borderBottomLeftRadius),
    }
    /** 點在圓角矩形內?回傳 [是否在內, 若在外則距形狀邊界多遠(px)]。 */
    const inShape = (x, y) => {
      if (x < v.left || x > v.right || y < v.top || y > v.bottom) return [false, Infinity]
      const cs4 = [
        [v.left + rad.tl, v.top + rad.tl, rad.tl, x < v.left + rad.tl && y < v.top + rad.tl],
        [v.right - rad.tr, v.top + rad.tr, rad.tr, x > v.right - rad.tr && y < v.top + rad.tr],
        [v.right - rad.br, v.bottom - rad.br, rad.br, x > v.right - rad.br && y > v.bottom - rad.br],
        [v.left + rad.bl, v.bottom - rad.bl, rad.bl, x < v.left + rad.bl && y > v.bottom - rad.bl],
      ]
      for (const [cx, cy, r, inCornerBox] of cs4) {
        if (!inCornerBox || r <= 0) continue
        const d = Math.hypot(x - cx, y - cy)
        return d <= r ? [true, 0] : [false, d - r]
      }
      return [true, 0]
    }
    let inMiss = 0, inTotal = 0, outHit = 0, outWorst = 0
    for (let y = Math.floor(v.top); y <= Math.ceil(v.bottom); y++) {
      for (let x = Math.floor(v.left); x <= Math.ceil(v.right); x++) {
        const sx = x + 0.5, sy = y + 0.5
        const [inside, dist] = inShape(sx, sy)
        const hit = h(sx, sy)
        if (inside) { inTotal++; if (!hit) inMiss++ }
        else if (hit) { outHit++; if (dist > outWorst) outWorst = dist }
      }
    }
    const shape = { inTotal, inMiss, outHit, outWorst: +outWorst.toFixed(2), rad }
    const sh = shell.getBoundingClientRect()
    return {
      placement: shell.dataset.placement,
      visual: { l: +v.left.toFixed(1), r: +v.right.toFixed(1), t: +v.top.toFixed(1), b: +v.bottom.toFixed(1), w: +v.width.toFixed(1), h: +v.height.toFixed(1) },
      hit: hitRect(btn, visual),
      shape,
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
    record('H1', `${tag} 可視形狀內每一點都點得到`, false, '命中區完全量不到:整顆鈕都點不到')
    continue
  }
  record(
    'H1',
    `${tag} 可視形狀內每一點都點得到(取樣 ${m.shape.inTotal} 點)`,
    m.shape.inMiss === 0,
    `形狀內有 ${m.shape.inMiss} 點點不到 —— 看得到卻點不到就是使用者說的「難按」`
      + `(圓角半徑 tl${m.shape.rad.tl} tr${m.shape.rad.tr} br${m.shape.rad.br} bl${m.shape.rad.bl})`,
  )
  record(
    'H4',
    `${tag} 可視形狀外不得點得到(只容次像素)`,
    m.shape.outWorst <= EDGE_TOLERANCE,
    `形狀外仍可點 ${m.shape.outHit} 點,最遠超出邊界 ${m.shape.outWorst}px`
      + `(≤${EDGE_TOLERANCE} 是瀏覽器圓角命中的抗鋸齒;再多就是隱形帶,會搶走底下內容的點擊)`,
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
