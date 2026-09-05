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
//        掃描窗 = 可視外接矩形再外擴 24px(`SCAN_PAD`),所以「命中區比可視大」是這條直接量到的,
//        不是只靠 H5 殼寬間接推:2026-09-05 稽核抓到舊版只掃外接矩形內,外接矩形之外的隱形帶
//        (例如舊殼 `w-10` 多出來的 12px 若真吃指標)H4 根本看不見,spec 寫的比量的強。
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
//   (H6) **開著的 tooltip,本體與 Radix popper 外殼的 computed `pointer-events` 都不得是 `none`**。
//        tooltip.tsx 2026-09-04 一天內翻了三次(加穿透 → 改 → 撤回),最後定案「刻意不設」並寫進註解與
//        hover-card.spec.md,但沒有任何閘守它 —— 震盪(A → ¬A → A)= 必配 invariant test(M12)。
//        穿透會命中 WCAG F95(SC 1.4.13 Hoverable:content shown on hover 必須能把指標移上去)。
//   (H7) **真指標從鈕移進 tooltip 內容,tooltip 仍開著**(Radix grace area 真的在,不是只有 CSS 沒穿透;
//        `disableHoverableContent` 被加回來這條就紅)。
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

/** 掃描窗外擴量(px):可視外接矩形四周各多掃這麼多,H4 才量得到外接矩形之外的隱形帶(H1/H4/H2 共用同一次掃描)。 */
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
    /**
     * 點到圓角矩形邊界的有號距離(px):≤ 0 在形狀內,> 0 就是在形狀外幾 px。
     * 四個角各用自己的半徑(依象限選半徑的 rounded-box 距離場),對外接矩形**之外**的點一樣給真實幾何距離。
     * **外接矩形之外必須算真實距離,不能回 Infinity**(2026-09-05 修:H4 從 2026-09-04 起在 CI 一直紅,
     * 根因不是鈕有隱形帶 —— 實測按鈕盒 = 可視形狀盒(359–399 × 254.594–294.594)—— 而是 rect 的 top 帶小數,
     * 掃描在 floor(top)+0.5 = 254.5 取樣,比 rect 高 0.094px,瀏覽器命中測試照四捨五入算「點得到」,
     * 舊版卻把「在矩形外」一律回 Infinity,於是 0.094px 的次像素被判成無限遠)。同一支距離場也讓掃描窗
     * 得以外擴到外接矩形之外(舊版根本不掃那裡,「比可視大」的隱形帶只能靠 H5 殼寬間接抓)。
     */
    const shapeDist = (x, y) => {
      const cx = (v.left + v.right) / 2
      const cy = (v.top + v.bottom) / 2
      const r = x < cx ? (y < cy ? rad.tl : rad.bl) : (y < cy ? rad.tr : rad.br)
      const qx = Math.abs(x - cx) - (v.width / 2 - r)
      const qy = Math.abs(y - cy) - (v.height / 2 - r)
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
    }
    // 一次掃描同時餵三條斷言:H1(形狀內漏點)/ H4(形狀外命中,含外接矩形之外)/ H2(真實命中矩形的外緣)。
    let inMiss = 0, inTotal = 0, outHit = 0, outWorst = 0
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
    for (let y = Math.floor(v.top - PAD); y <= Math.ceil(v.bottom + PAD); y++) {
      for (let x = Math.floor(v.left - PAD); x <= Math.ceil(v.right + PAD); x++) {
        const sx = x + 0.5, sy = y + 0.5
        const hit = h(sx, sy)
        if (hit) {
          if (x < left) left = x
          if (x > right) right = x
          if (y < top) top = y
          if (y > bottom) bottom = y
        }
        const d = shapeDist(sx, sy)
        if (d <= 0) { inTotal++; if (!hit) inMiss++ }
        else if (hit) { outHit++; if (d > outWorst) outWorst = d }
      }
    }
    const shape = { inTotal, inMiss, outHit, outWorst: +outWorst.toFixed(2), rad }
    const hit = Number.isFinite(left)
      ? { left, right, top, bottom, w: right - left + 1, h: bottom - top + 1 }
      : null
    const sh = shell.getBoundingClientRect()
    return {
      placement: shell.dataset.placement,
      visual: { l: +v.left.toFixed(1), r: +v.right.toFixed(1), t: +v.top.toFixed(1), b: +v.bottom.toFixed(1), w: +v.width.toFixed(1), h: +v.height.toFixed(1) },
      hit,
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
    `${tag} 可視形狀外不得點得到(掃可視外接矩形外擴 ${SCAN_PAD}px,只容次像素)`,
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

// (H6)(H7) 逐顆鈕:真滑鼠 hover 開 tooltip → 量本體與 popper 外殼的 computed pointer-events →
// 指標移進 tooltip 內容 → 仍開著。放在幾何掃描之後,hover 的微放大(`hover:scale-[1.04]`)才不會混進 H1/H4 的量測。
// Radix Tooltip.Content 的 `data-state` 是 delayed-open / instant-open / closed;popper 外殼是它的父層。
const TOOLTIP_OPEN = '[data-radix-popper-content-wrapper] > [data-state]:not([data-state="closed"])'
const parkPointer = async () => {
  await page.mouse.move(2, 2)
  await page.waitForSelector('[data-radix-popper-content-wrapper]', { state: 'detached', timeout: 5000 }).catch(() => {})
}
for (const btn of await page.locator('[data-placement] button').all()) {
  const tag = `placement=${await btn.evaluate((b) => b.closest('[data-placement]').dataset.placement)}`
  const box = await btn.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
  let content
  try {
    content = await page.waitForSelector(TOOLTIP_OPEN, { state: 'attached', timeout: 5000 })
  } catch {
    record('H6', `${tag} hover 鈕中心開得出 tooltip`, false, '5s 內沒有 tooltip 開啟(Provider delay 500ms)')
    await parkPointer()
    continue
  }
  const pe = await content.evaluate((el) => ({
    content: getComputedStyle(el).pointerEvents,
    wrapper: getComputedStyle(el.closest('[data-radix-popper-content-wrapper]')).pointerEvents,
  }))
  record(
    'H6',
    `${tag} 開著的 tooltip 本體與 popper 外殼都承接指標(computed pointer-events ≠ none)`,
    pe.content !== 'none' && pe.wrapper !== 'none',
    `content=${pe.content} wrapper=${pe.wrapper}(none = 穿透 = WCAG F95;tooltip.tsx 明寫「刻意不設」)`,
  )
  const cb = await content.boundingBox()
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 8 })
  await page.waitForTimeout(250)
  record(
    'H7',
    `${tag} 指標從鈕移進 tooltip 內容後 tooltip 仍開著(Radix grace area)`,
    await page.evaluate((sel) => !!document.querySelector(sel), TOOLTIP_OPEN),
    '指標一進 tooltip 就關 = hoverable content 不成立(F95);`disableHoverableContent` 被加回來就是這個症狀',
  )
  await parkPointer()
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
