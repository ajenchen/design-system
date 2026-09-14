#!/usr/bin/env node
/**
 * 游標**連續移動**時,列的高亮跟不跟得上(2026-09-14)
 *
 * user 逐字:「hover 到 row 上的反應依然很慢很卡頓,**完全跟不上我的滑鼠游標**」。
 * 這跟「跳一次、多久變色」(data-table-hover-after-scroll.mjs)是兩件事:那支量單次延遲,
 * 這支量**連續移動下的吞吐** —— 游標已經到第 N 列,高亮還停在第 N-k 列,k 就是使用者看到的「跟不上」。
 *
 * **量什麼**:不是「事件到達後多久變色」——那在這個元件裡恆為 0,因為 onMouseOver 是同步改 DOM。
 * 使用者看到的「跟不上」來自另一個機制:**主執行緒忙的時候瀏覽器根本不送 pointermove 進來**
 * (會合併),高亮就凍在原地,等主執行緒閒下來才跳一大格。所以量的是**輸入飢餓**:
 * 以固定節奏連續送滑鼠移動,看頁面實際收到幾次、兩次之間最久隔多久。
 * 送 N 次只收到 n 次 = 合併掉 (N−n) 次;最大間隔 = 高亮最久凍住多久。
 *
 * 對照組 `--sabotage`:在 mouseover 處理鏈塞 60ms 忙碌,落後列數必須變大,否則這支不算數。
 *
 *   node scripts/data-table-hover-follow.mjs [--cpu=6] [--step=12] [--gap=8] [--sabotage] <label>=<dir> …
 */
import http from 'node:http'
import { join, extname, resolve } from 'node:path'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { launchBrowser } from './lib/launch-browser.mjs'

const STORY = 'design-system-components-datatable-展示--roadmap-all-in-one'
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const CPU = Number(arg('cpu', '6')); const STEP = Number(arg('step', '12')); const GAP = Number(arg('gap', '8'))
const SAB = process.argv.includes('--sabotage')

const serve = async (dir) => {
  const s = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'
    const f = join(dir, p)
    if (!existsSync(f) || statSync(f).isDirectory()) { r.writeHead(404); r.end(); return }
    r.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f))
  })
  await new Promise((r) => s.listen(0, r))
  return { server: s, base: `http://localhost:${s.address().port}` }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const med = (a) => a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : -1

const run = async (label, dir) => {
  const { server, base } = await serve(resolve(dir))
  const browser = await launchBrowser()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
  await page.goto(`${base}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, { waitUntil: 'load' })
  await page.waitForFunction(() => !!document.querySelector('[data-datatable-hscroll]'), null, { timeout: 30000 })
  await sleep(2500)
  if (SAB) await page.evaluate(() => document.addEventListener('mouseover', () => { const b = performance.now(); while (performance.now() - b < 60) { /* busy */ } }, { capture: true }))

  // document 冒泡階段 = React 委派處理器(掛在 root container)跑完之後
  await page.evaluate(() => {
    window.__f = []
    document.addEventListener('pointermove', (e) => {
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-row-index]')?.getAttribute('data-row-index')
      const hov = document.querySelector('[data-hovered][data-row-index]')?.getAttribute('data-row-index')
      if (under != null) window.__f.push({ t: performance.now(), u: Number(under), h: hov == null ? null : Number(hov) })
    }, { capture: false })
  })
  const box = await page.evaluate(() => {
    const r = document.querySelector('[data-datatable-hscroll]').getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y0: Math.round(r.y + 24), y1: Math.round(r.y + r.height - 24) }
  })
  await page.mouse.move(box.x, box.y0); await sleep(600)
  await page.evaluate(() => { window.__f.length = 0 })
  // **不能用 page.mouse.move 逐步 await** —— 它會等瀏覽器處理完才送下一步,等於同步餵食,
  // 高亮結構上不可能落後(2026-09-14 第一版就是這樣,對照組塞 60ms 忙碌仍量到落後 0 列)。
  // 真實滑鼠每秒送上百次、不等頁面處理;這裡用 CDP 直接連發、不等回應,讓事件真的排隊。
  const sends = []
  let sent = 0
  for (let y = box.y0; y < box.y1; y += STEP) {
    sent++
    sends.push(cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y, button: 'none', buttons: 0 }))
    await sleep(GAP) // 送出的節奏,不是等處理完的節奏
  }
  await Promise.all(sends)
  await sleep(800)
  const f = await page.evaluate(() => window.__f)
  await browser.close(); server.close()

  const ts = f.map((r) => r.t)
  const gaps = []
  for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1])
  const withHov = f.filter((r) => r.h != null)
  const lag = withHov.map((r) => Math.abs(r.u - r.h))
  return {
    label, sent, got: f.length, none: f.length - withHov.length,
    gapMed: Math.round(med(gaps)), gapMax: gaps.length ? Math.round(Math.max(...gaps)) : -1,
    over100: gaps.filter((g) => g > 100).length,
    lagMed: med(lag), lagMax: lag.length ? Math.max(...lag) : -1,
  }
}

const builds = process.argv.slice(2).filter((a) => !a.startsWith('--') && a.includes('=')).map((s) => { const i = s.indexOf('='); return { l: s.slice(0, i), d: s.slice(i + 1) } })
if (!builds.length) { console.error('✗ 需要至少一個 <label>=<dir>'); process.exit(1) }
const out = []
for (const b of builds) {
  const r = await run(b.l, b.d)
  out.push(r)
  console.log(`\n━━ ${r.label}${SAB ? '(對照組:mouseover 塞 60ms 忙碌)' : ''}  CPU×${CPU}、每步 ${STEP}px/${GAP}ms`)
  if (r.got === 0) { console.log('   ✗ 0 筆取樣 —— 樁沒裝上,不得讀成「跟得上」'); continue }
  console.log(`   送出 ${r.sent} 次移動,頁面實際收到 ${r.got} 次(合併掉 ${r.sent - r.got} 次 = ${Math.round((1 - r.got / r.sent) * 100)}%)`)
  console.log(`   **兩次收到之間:中位 ${r.gapMed}ms,最久 ${r.gapMax}ms**;超過 100ms 的空窗 ${r.over100} 次`)
  console.log(`   (事件真的到達時,高亮落後 ${r.lagMed} 列/最多 ${r.lagMax} 列 —— 同步改 DOM,所以這欄恆為 0)`)
}
if (SAB) {
  const worst = Math.max(...out.map((r) => r.gapMax))
  if (worst < 40) { console.log(`\n✗ 對照組:塞了 60ms 忙碌,最大空窗卻只有 ${worst}ms(基線約 16-20ms) —— 該紅沒紅,綠燈不算證據`); process.exit(1) }
  console.log(`\n✓ 對照組:最大空窗 ${worst}ms,量具確實會紅`); process.exit(0)
}
process.exit(0)
