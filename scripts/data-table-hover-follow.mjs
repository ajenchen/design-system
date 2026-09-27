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
 * 這是**量測工具(probe)**,不是 CI 閘:沒有任何 workflow / npm script 呼叫它,由人比較兩份建置時手動跑。
 *
 * **開 story 的等待**(2026-09-25,M37):原本是 `goto(load)` + 等 `[data-datatable-hscroll]` 出現 + **固定睡 2500ms**
 * 當「表格已經渲染穩定」的代理 —— 慢的機器(或 --cpu=6 節流下的冷啟動)睡不夠就開始送滑鼠,量到的是還在掛列的表格。
 * 現在改用 lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作):等 Storybook 回報渲染完成、render-health、
 * 被量的列本身出現、版面連續靜止 SETTLE_FRAMES 個影格。等不到 = 儀器失效(點名 story、附同源 404,exit 1),
 * 不是「跟得上」。建置改由 lib/a11y-static-server.mjs 供檔(Storybook 建置先凍結成本次獨佔的快照,且有 404 帳本)。
 *
 *   node scripts/data-table-hover-follow.mjs [--cpu=6] [--step=12] [--gap=8] [--sabotage] <label>=<dir> …
 */
import { resolve } from 'node:path'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const STORY = 'design-system-components-datatable-展示--roadmap-all-in-one'
// 開 story 後要求版面連續靜止幾個影格才開始送滑鼠(節流下影格變慢,以影格計、不以毫秒計)
const SETTLE_FRAMES = 10
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const CPU = Number(arg('cpu', '6')); const STEP = Number(arg('step', '12')); const GAP = Number(arg('gap', '8'))
const SAB = process.argv.includes('--sabotage')
const VW = Number(arg('vw', '1440')); const VH = Number(arg('vh', '900')); const DPR = Number(arg('dpr', '2'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const med = (a) => a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : -1

const run = async (label, dir) => {
  const server = await startA11yStaticServer({ rootDirectory: resolve(dir), defaultFile: 'iframe.html' })
  const browser = await launchBrowser()
  try {
    return await measure(label, server, browser)
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    return { label, instrument: error.message }
  } finally {
    await browser.close()
    await server.stop()
  }
}

const measure = async (label, server, browser) => {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
  await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, {
    waitFor: '[data-datatable-hscroll] [data-row-index]', settleFrames: SETTLE_FRAMES, notFound: server.notFound,
    // --cpu=6 節流下冷啟動慢數倍:上限放寬,成功與否仍由訊號本身決定
    timeoutMs: 60_000, settleTimeoutMs: 30_000,
  })
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
  // 先把游標放到第一列、等 600ms 讓初次 hover 的高亮與它引發的重畫走完,再清掉這段取樣(不算進連續移動)
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
  // 送完之後等 800ms:讓排隊中的 pointermove 全部被頁面處理完(量的就是它們什麼時候到),再收取樣
  await sleep(800)
  const f = await page.evaluate(() => window.__f)

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
const instrumentFailures = []
for (const b of builds) {
  const r = await run(b.l, b.d)
  if (r.instrument) {
    // 沒量到 ≠ 跟得上:這份建置的 story 沒渲染完成,整組比較不成立
    instrumentFailures.push(r)
    console.log(`\n━━ ${r.label}\n   ✗ ${r.instrument}`)
    continue
  }
  out.push(r)
  console.log(`\n━━ ${r.label}${SAB ? '(對照組:mouseover 塞 60ms 忙碌)' : ''}  CPU×${CPU}、視窗 ${VW}×${VH}@${DPR}x、每步 ${STEP}px/${GAP}ms`)
  // 0 筆取樣 = 樁沒裝上(沒量到),同樣是儀器失效 —— 原本只印一行、照樣 exit 0
  if (r.got === 0) { console.log('   ✗ 0 筆取樣 —— 樁沒裝上,不得讀成「跟得上」'); instrumentFailures.push(r); continue }
  console.log(`   送出 ${r.sent} 次移動,頁面實際收到 ${r.got} 次(合併掉 ${r.sent - r.got} 次 = ${Math.round((1 - r.got / r.sent) * 100)}%)`)
  console.log(`   **兩次收到之間:中位 ${r.gapMed}ms,最久 ${r.gapMax}ms**;超過 100ms 的空窗 ${r.over100} 次`)
  console.log(`   (事件真的到達時,高亮落後 ${r.lagMed} 列/最多 ${r.lagMax} 列 —— 同步改 DOM,所以這欄恆為 0)`)
}
if (instrumentFailures.length) {
  console.log(`\n✗ 儀器失效:${instrumentFailures.map((r) => r.label).join('、')} 沒有量到(story 沒渲染完成,或 0 筆取樣)—— 這不是表格的裁決,但這一趟的數字不能拿來比較`)
  process.exit(1)
}
if (SAB) {
  const worst = Math.max(...out.map((r) => r.gapMax))
  if (worst < 40) { console.log(`\n✗ 對照組:塞了 60ms 忙碌,最大空窗卻只有 ${worst}ms(基線約 16-20ms) —— 該紅沒紅,綠燈不算證據`); process.exit(1) }
  console.log(`\n✓ 對照組:最大空窗 ${worst}ms,量具確實會紅`); process.exit(0)
}
process.exit(0)
