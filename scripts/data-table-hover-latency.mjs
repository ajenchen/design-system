#!/usr/bin/env node
/**
 * 列 hover 反應延遲(2026-09-11;user:「連 hover table row 的反應都是延遲很久」)
 *
 * **為什麼要新的儀器**:既有的閘量的全是捲動(空白帶、殼幀、內容延遲)。hover 的反應速度**一條都沒量**,
 * 所以「捲完之後 hover 要等很久」這個症狀在全綠的 CI 底下可以完全隱形 —— 本輪就是這樣放行了一版有長工回歸的改動。
 *
 * **量什麼**:從「送出 mousemove」到「那一列的底色真的在合成器送出的畫面上變了」之間的時間。
 * 不看 DOM 屬性、不看事件時間戳 —— `data-hovered` 寫下去到畫面上變色之間正是主執行緒被塞住時會拉長的那一段,
 * 只驗屬性等於假綠(M32:DOM-pass ≠ visual-pass)。
 *
 * **怎麼判「變了」**:不需要知道 hover 色票。移動前先存一張基準幀,之後找第一張「該列取樣點的像素與基準不同」的幀。
 * 靜止頁面上除了 hover 沒有別的東西會改那個像素,所以任何變化就是 hover 上色。取樣點取列左緣內縮 6px、
 * 垂直置中(padding 區,不會踩到文字)。
 *
 * **兩段情境**(第二段才是 user 回報的):
 *   A 靜止 hover:頁面靜止數秒後逐列 hover。
 *   B 捲動後 hover:先做一次 6,000px/s 的甩動,放手後立刻 hover —— 主執行緒此時仍在補畫,延遲最容易被看見。
 *
 * **對照組(`--selftest`)**:在 hover 路徑注入 120ms 忙等 → 兩段的 p95 都必須 ≥ 120ms(該紅會紅);
 * 同一支在未注入時 p95 必須 < 120ms(不會恆紅)。沒有對照組的綠燈是零證據。
 *
 *   node scripts/data-table-hover-latency.mjs [--static=<dir>] [--dpr=1] [--rows=16] [--cpu-throttle=1]
 *     [--assert=on --assert-p95=<ms>] [--selftest] [--label=<名>] [--builds=a=<dir>,b=<dir>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const has = (n) => process.argv.includes(`--${n}`)
// 用 fileURLToPath 而不是 `new URL(...).pathname`:repo 路徑含非 ASCII 字元時後者會留下百分號編碼,fs 找不到檔。
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DPR = Number(arg('dpr', 1))
const ROWS = Number(arg('rows', 16))
const THROTTLE = Number(arg('cpu-throttle', 1))
const SELFTEST = has('selftest')
/** `--manager`:量**使用者真正開的那個網址**(完整 Storybook 介面 + 外掛),不是裸 iframe。
 *  兩者差很多:manager 會載 a11y 外掛等,它們跟表格搶同一條主執行緒。 */
const MANAGER = has('manager')
if (MANAGER && SELFTEST) { console.error('✗ --selftest 只在裸 iframe 模式有效(忙等的 init script 進不到 Storybook 的 preview iframe);對照組請用不加 --manager 的那一組跑'); process.exit(2) }
const ASSERT = arg('assert', 'off') === 'on'
/** 判定用**中位數**不用 p95:量測收尾的最後一次取樣常出現單一離群值(main 與分支都有,實測 176–434ms),
 *  拿 p95 當閘會恆紅。中位數才是「hover 感覺不感覺得到延遲」的正確統計量;真正的卡死另由 `--assert-max` 抓。 */
const ASSERT_MEDIAN = Number(arg('assert-median', 50))
const ASSERT_MAX = Number(arg('assert-max', 600))
const STORY = 'design-system-components-datatable-展示--roadmap-all-in-one'
const VIEWPORT_W = 1400
/** `--urls=a=https://…,b=https://…`:直接量**線上站台**(排除「本機建置 vs 線上建置」這個變數)。 */
const URLS = arg('urls', '')
const BUILDS = URLS
  ? URLS.split(',').map((s) => { const i = s.indexOf('='); return { label: s.slice(0, i), origin: s.slice(i + 1).replace(/\/$/, '') } })
  : arg('builds', '')
  ? arg('builds', '').split(',').map((s) => { const i = s.indexOf('='); return { label: s.slice(0, i), dir: path.resolve(s.slice(i + 1)) } })
  : [{ label: arg('label', 'build'), dir: path.resolve(arg('static', path.join(REPO, 'storybook-static'))) }]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const q = (a, p) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN)

/** 一次量測:回傳每一列的「送出 mousemove → 該列底色在畫面上變了」的毫秒數。 */
async function measure(build, { afterScroll, sabotage }) {
  const server = build.origin
    ? { origin: build.origin, stop: async () => {} }
    : await startA11yStaticServer({ rootDirectory: build.dir, defaultFile: 'iframe.html' })
  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: DPR })
  const cdp = await page.context().newCDPSession(page)
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  if (sabotage) {
    // 對照組:把忙等塞進 hover 事件路徑(capture 階段,早於元件自己的 handler)。
    await page.addInitScript(() => {
      document.addEventListener('mouseover', () => { const t = performance.now(); while (performance.now() - t < 120) {} }, true)
    })
  }
  let scope = page   // 量測用的 frame(manager 模式下是 preview iframe)
  let frameOffset = { x: 0, y: 0 }
  if (MANAGER) {
    await page.goto(`${server.origin}/index.html?path=/story/${encodeURIComponent(STORY)}`, { waitUntil: 'load', timeout: 120000 })
    const handle = await page.waitForSelector('#storybook-preview-iframe', { timeout: 120000 })
    scope = await handle.contentFrame()
    await scope.waitForSelector('[data-datatable-hscroll]', { timeout: 120000 })
    const r = await handle.boundingBox()
    frameOffset = { x: r.x, y: r.y }
    // manager 的外掛(a11y 等)會在 story 載入後繼續跑,多等一下讓它們跑完再量
    await sleep(6000)
  } else {
    await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, { waitUntil: 'load', timeout: 120000 })
    await page.waitForSelector('[data-datatable-hscroll]', { timeout: 60000 })
    await sleep(3000)
  }

  const frames = []
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ ts: f.metadata.timestamp * 1000, data: f.data })
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }) } catch {}
  })
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })

  const innerBox = await (MANAGER ? scope.locator('[data-datatable-hscroll]') : page.locator('[data-datatable-hscroll]')).boundingBox()
  // frame 內回的座標是相對 frame 的;滑鼠事件走的是最外層文件,要加上 iframe 的位移。
  const box = { x: innerBox.x + frameOffset.x, y: innerBox.y + frameOffset.y, width: innerBox.width, height: innerBox.height }
  if (afterScroll) {
    // 甩一下再放手:主執行緒此時仍在補畫(user 回報的情境)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 200); await sleep(8) }
    await sleep(120)
  }

  const samples = []
  for (let k = 0; k < ROWS; k++) {
    const target0 = await scope.evaluate(({ k }) => {
      const rows = [...document.querySelectorAll('[data-row-index]')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter((x) => x.r.height > 8 && x.r.top > 120 && x.r.bottom < window.innerHeight - 8)
        .sort((a, b) => a.r.top - b.r.top)
      const pick = rows[k % Math.max(1, rows.length)]
      if (!pick) return null
      return { x: Math.round(pick.r.left + 6), y: Math.round(pick.r.top + pick.r.height / 2) }
    }, { k })
    if (!target0) continue
    const target = { x: target0.x + frameOffset.x, y: target0.y + frameOffset.y }
    // 先把指標移開這一列(移到表格上緣外),等畫面靜止,再存基準
    await page.mouse.move(box.x + box.width / 2, box.y - 20)
    await sleep(260)
    const baseline = frames.length ? frames[frames.length - 1] : null
    if (!baseline) continue
    const t0 = performance.timeOrigin + performance.now()
    const sentAt = await page.evaluate(() => performance.timeOrigin + performance.now())
    await page.mouse.move(target.x + 40, target.y)
    const deadline = Date.now() + 1500
    let hit = null
    const basePx = pixelAt(baseline.data, target.x, target.y)
    while (Date.now() < deadline && !hit) {
      for (const f of frames) {
        if (f.ts <= sentAt) continue
        const px = pixelAt(f.data, target.x, target.y)
        if (px && basePx && (Math.abs(px[0] - basePx[0]) + Math.abs(px[1] - basePx[1]) + Math.abs(px[2] - basePx[2])) > 12) { hit = f; break }
      }
      if (!hit) await sleep(16)
    }
    void t0
    samples.push(hit ? hit.ts - sentAt : NaN)
    await sleep(120)
  }
  await cdp.send('Page.stopScreencast').catch(() => {})
  await browser.close(); await server.stop()
  return samples
}

const pngCache = new Map()
function pixelAt(b64, x, y) {
  let png = pngCache.get(b64)
  if (!png) { try { png = PNG.sync.read(Buffer.from(b64, 'base64')) } catch { return null }; if (pngCache.size > 400) pngCache.clear(); pngCache.set(b64, png) }
  // **比例用幀寬反推,不可假設等於 dpr**(2026-09-11 實測:CDP screencast 在 dpr2 下送出的仍是 1400×900,
  // 乘 dpr 會讓取樣點全部落到畫面外、量出「全部沒變色」的假訊號)。
  const k = png.width / VIEWPORT_W
  const px = Math.round(x * k), py = Math.round(y * k)
  if (px < 0 || py < 0 || px >= png.width || py >= png.height) return null
  const o = (py * png.width + px) * 4
  return [png.data[o], png.data[o + 1], png.data[o + 2]]
}

let fail = 0
const report = (label, mode, s) => {
  const ok = s.filter((x) => Number.isFinite(x))
  const lost = s.length - ok.length
  const line = ok.length
    ? `${label}/${mode}:n=${ok.length} 中位 ${q(ok, 0.5).toFixed(0)}ms p95 ${q(ok, 0.95).toFixed(0)}ms 最大 ${Math.max(...ok).toFixed(0)}ms${lost ? ` (${lost} 次 1.5s 內沒變色)` : ''} | 逐次 ${s.map((x) => (Number.isFinite(x) ? x.toFixed(0) : '—')).join(' ')}`
    : `${label}/${mode}:全部 ${s.length} 次都沒量到變色`
  console.log('  ' + line)
  // **把「沒變色」的次數一起回傳**(2026-09-12)。舊版只回 `ok`,於是 1.5 秒內沒變色的樣本
  // 從中位數與最大值裡一起被剔除、只在括號裡印個註記 —— 也就是**最糟的那種卡死對這支閘完全隱形**,
  // 而那正是 user 抱怨的「游標到了卻要等好一陣子」。獨立覆核 2026-09-12 指出這個洞。
  return { ok, lost }
}

for (const b of BUILDS) {
  if (!b.origin && !fs.existsSync(path.join(b.dir, 'iframe.html'))) { console.error(`✗ ${b.label}:${b.dir} 沒有 iframe.html`); process.exit(1) }
}
console.log(`列 hover 反應延遲(dpr${DPR}${THROTTLE > 1 ? ` / ${THROTTLE}× 節流` : ''},每段 ${ROWS} 列)`)
for (const b of BUILDS) {
  const stillR = report(b.label, '靜止 hover', await measure(b, { afterScroll: false, sabotage: false }))
  const afterR = report(b.label, '捲動後 hover', await measure(b, { afterScroll: true, sabotage: false }))
  const still = stillR.ok
  const after = afterR.ok
  if (SELFTEST) {
    // `report()` 2026-09-12 改成回傳 `{ ok, lost }`(讓「沒變色」的次數不再隱形),這裡要跟著取 `.ok` ——
    // 沒跟著改的那一版在 CI 上把對照組判成 `p95 = NaN` 而紅,等於自己把儀器弄壞。
    const sab = report(b.label, '對照組(注入 120ms 忙等)', await measure(b, { afterScroll: false, sabotage: true })).ok
    const caught = sab.length > 0 && q(sab, 0.95) >= 120
    const cleanOk = still.length > 0 && q(still, 0.95) < 120
    console.log(`${caught ? '✓' : '✗'} 對照組:注入 120ms 忙等時 p95 必須 ≥ 120ms(得 ${q(sab, 0.95).toFixed(0)}ms)`)
    console.log(`${cleanOk ? '✓' : '✗'} 反對照:未注入時 p95 必須 < 120ms(得 ${q(still, 0.95).toFixed(0)}ms)`)
    if (!caught || !cleanOk) fail++
  }
  if (ASSERT) {
    for (const [mode, r] of [['靜止 hover', stillR], ['捲動後 hover', afterR]]) {
      const s = r.ok
      const med = s.length ? q(s, 0.5) : NaN
      const mx = s.length ? Math.max(...s) : NaN
      // `r.lost` = 1.5 秒內完全沒變色的次數。那是比任何毫秒數都嚴重的失敗態,
      // 不能只在中位數/最大值之外靜靜消失 —— 它一出現就該紅。
      const bad = !s.length || r.lost > 0 || med > ASSERT_MEDIAN || mx > ASSERT_MAX
      console.log(`${bad ? '✗' : '✓'} ${b.label}/${mode} 中位 ≤ ${ASSERT_MEDIAN}ms、最大 ≤ ${ASSERT_MAX}ms、且 0 次沒變色(得 中位 ${s.length ? med.toFixed(0) : 'n/a'} / 最大 ${s.length ? mx.toFixed(0) : 'n/a'} / 沒變色 ${r.lost}）`)
      if (bad) fail++
    }
  }
}
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 量測完成')
process.exit(fail ? 1 : 0)
