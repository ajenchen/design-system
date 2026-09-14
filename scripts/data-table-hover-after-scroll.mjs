#!/usr/bin/env node
/**
 * 列 hover 的反應延遲 —— 特別是**捲完之後第一次移動游標**那一下(2026-09-14)
 *
 * user 逐字:「游標明明到了,table row 的反應卻要等好一陣子」。
 * 既有的 `data-table-hover-latency.mjs` 每次取樣前會把游標**移出表格**再等 260ms,等於先讓狀態歸零,
 * 結構上量不到這一刻;它量的又是 CDP 螢幕串流的送幀間隔(該檔檔頭已自承是上界)。
 *
 * 這支只量一件事,而且完全在頁內:
 *   游標移動事件抵達 → `data-hovered` 換到新的那一列,中間隔了多久。
 * 兩種情境各量兩次:
 *   A 沒捲動,單純往下移 2 列(基準:正常 hover 該有的反應)
 *   B 先捲一段,停下後立刻往下移 2 列(user 描述的那一刻)
 *
 * **量具自檢**:每次移動都先確認游標底下的列真的換了(沒換就不該有任何變化,量到的會是別的東西);
 * `data-hovered` 一次都沒變就當場失敗,不得把「樁沒裝上」讀成「沒有延遲」。
 * 對照組 `--sabotage`:在 pointermove 處理鏈塞 120ms 忙碌,B 的延遲必須跟著變大。
 *
 *   node scripts/data-table-hover-after-scroll.mjs [--cpu=6] [--sabotage] [--assert-max-ms=N] <label>=<dir> …
 */
import http from 'node:http'
import { join, extname, resolve } from 'node:path'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { launchBrowser } from './lib/launch-browser.mjs'

const STORY = 'design-system-components-datatable-展示--roadmap-all-in-one'
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const CPU = Number(arg('cpu', '6'))
const SAB = process.argv.includes('--sabotage')
const MAXMS = arg('assert-max-ms', null)

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
  // 對照組要拖慢**真正設 data-hovered 的那個事件**。2026-09-14 第一版只拖慢 pointermove,
  // 對照組因此該紅沒紅 —— 同一次輸入裡 `pointerover` 先於 `pointermove` 派送,而 hover 是 pointerover 設的。
  if (SAB) await page.evaluate(() => {
    for (const ev of ['pointerover', 'pointermove', 'mouseover']) {
      document.addEventListener(ev, () => { const b = performance.now(); while (performance.now() - b < 120) { /* busy */ } }, { capture: true })
    }
  })
  await page.evaluate(() => {
    window.__c = { n: 0, last: 0 }
    new MutationObserver(() => { window.__c.n++; window.__c.last = performance.now() })
      .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-hovered'] })
  })
  const box = await page.evaluate(() => {
    const r = document.querySelector('[data-datatable-hscroll]').getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + 80) }
  })
  const rowAt = (x, y) => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-row-index]')?.getAttribute('data-row-index') ?? null, { x, y })
  const out = []
  const probe = async (tag, y) => {
    const before = await rowAt(box.x, box.y)
    const n0 = await page.evaluate(() => window.__c.n)
    const t0 = await page.evaluate(() => performance.now())
    await page.mouse.move(box.x, y)
    await sleep(1200)
    const r = await page.evaluate(() => ({ n: window.__c.n, last: window.__c.last }))
    const after = await rowAt(box.x, y)
    const changedRow = before !== null && after !== null && before !== after
    const ms = r.n > n0 ? Math.round(r.last - t0) : null
    out.push({ tag, ms, changedRow, fired: r.n - n0 })
    console.log(`   ${tag}:${ms === null ? ' 1.2 秒內沒反應' : ` ${ms}ms`}(data-hovered 變 ${r.n - n0} 次;第 ${before} → ${after} 列${changedRow ? '' : ' ⚠ 沒換列,本次作廢'})`)
  }
  console.log(`\n━━ ${label}${SAB ? '(對照組:pointermove 塞 120ms 忙碌)' : ''}  CPU×${CPU}`)
  await page.mouse.move(box.x, box.y); await sleep(600)
  await probe('A 沒捲動,往下移 2 列  ', box.y + 88)
  await probe('A 沒捲動,再往下移 2 列', box.y + 176)
  await page.mouse.move(box.x, box.y); await sleep(400)
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 110); await sleep(32) }
  await probe('B 捲完後,往下移 2 列  ', box.y + 88)
  await probe('B 捲完後,再往下移 2 列', box.y + 176)
  await browser.close(); server.close()
  return { label, out }
}

const builds = process.argv.slice(2).filter((a) => !a.startsWith('--') && a.includes('=')).map((s) => { const i = s.indexOf('='); return { l: s.slice(0, i), d: s.slice(i + 1) } })
if (!builds.length) { console.error('✗ 需要至少一個 <label>=<dir>'); process.exit(1) }
let fail = 0
const results = []
for (const b of builds) results.push(await run(b.l, b.d))

for (const r of results) {
  const valid = r.out.filter((o) => o.changedRow)
  if (valid.length !== r.out.length) { console.log(`✗ ${r.label}:有 ${r.out.length - valid.length} 次游標底下的列根本沒換 —— 那幾次量到的不是 hover 反應`); fail++ }
  if (r.out.every((o) => o.fired === 0)) { console.log(`✗ ${r.label}:data-hovered 一次都沒變 —— 樁沒裝上,不得讀成「沒有延遲」`); fail++ }
  if (MAXMS != null) {
    const worst = Math.max(...valid.map((o) => o.ms ?? 99999))
    if (worst > Number(MAXMS)) { console.log(`✗ ${r.label}:最慢一次 ${worst}ms > 上限 ${MAXMS}ms`); fail++ }
    else console.log(`✓ ${r.label}:最慢一次 ${worst}ms ≤ 上限 ${MAXMS}ms`)
  }
}
if (SAB) {
  const worst = Math.max(...results.flatMap((r) => r.out.map((o) => o.ms ?? 0)))
  if (worst < 100) { console.log(`\n✗ 對照組:塞了 120ms 忙碌,最慢卻只有 ${worst}ms —— 這支量具該紅沒紅,它的綠燈不算證據`); process.exit(1) }
  console.log(`\n✓ 對照組:最慢 ${worst}ms,量具確實會紅`); process.exit(0)
}
process.exit(fail ? 1 : 0)
