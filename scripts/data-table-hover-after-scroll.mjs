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
 * **量測工具,不是 CI 閘**(沒有任何 workflow / npm script 呼叫它;`--assert-max-ms` 給人手動當閘用)。
 *
 * 供檔與開 story(2026-09-25 起,全部瀏覽器閘同一套):
 *   - 靜態站改用 lib/a11y-static-server.mjs(原本自己寫一支 http server,讀活目錄):建置有 build-info.json 時從本次獨佔的快照供檔,
 *     另有同源 404 帳本 —— 比兩份建置時,別人同時重建其中一份不會讓量測讀到半套檔案。
 *   - 開 story 改用 lib/launch-browser.mjs 的 openStory:渲染完成(含 play)+ render-health + 被量的捲動區本身 + 版面連續
 *     10 影格靜止。取代原本「load + 等捲動區 + 固定睡 2500ms」(固定睡眠是「版面已穩定」的代理)。
 *   - story 開不起來 = 儀器失效:點名 story 與建置、附同源 404,該建置不出任何延遲數字,結尾 exit 1 —— 不是產品裁決,
 *     `--sabotage` 下也不會被讀成「量具會紅」(原本等不到捲動區是 30 秒後整支崩掉、訊息只有 Playwright 的 TimeoutError)。
 *
 *   node scripts/data-table-hover-after-scroll.mjs [--cpu=6] [--sabotage] [--assert-max-ms=N] <label>=<dir> …
 */
import { resolve } from 'node:path'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const STORY = 'design-system-components-datatable-展示--roadmap-all-in-one'
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const CPU = Number(arg('cpu', '6'))
const SAB = process.argv.includes('--sabotage')
const MAXMS = arg('assert-max-ms', null)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const run = async (label, dir) => {
  const server = await startA11yStaticServer({ rootDirectory: resolve(dir), defaultFile: 'iframe.html' })
  // 每個建置一支全新瀏覽器、只開一個 context(--single-process 沙箱下第二個 context 會崩;launch-browser.mjs 檔頭)
  const browser = await launchBrowser()
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
    try {
      // 渲染完成(含 play)+ render-health + 被量的捲動區本身 + 版面連續 10 影格靜止(下一步就量捲動區座標放游標)
      await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, {
        waitFor: '[data-datatable-hscroll]', settleFrames: 10, notFound: server.notFound,
      })
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      console.log(`\n━━ ${label}\n✗ ${error.message}(建置:${dir})`)
      return { label, instrument: error.detail, out: [] }
    }
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
      // 1200ms 是量測窗:移動後這段時間內 data-hovered 換列的時間點才被記下(沒換 = 「1.2 秒內沒反應」),不是等渲染
      await sleep(1200)
      const r = await page.evaluate(() => ({ n: window.__c.n, last: window.__c.last }))
      const after = await rowAt(box.x, y)
      const changedRow = before !== null && after !== null && before !== after
      const ms = r.n > n0 ? Math.round(r.last - t0) : null
      out.push({ tag, ms, changedRow, fired: r.n - n0 })
      console.log(`   ${tag}:${ms === null ? ' 1.2 秒內沒反應' : ` ${ms}ms`}(data-hovered 變 ${r.n - n0} 次;第 ${before} → ${after} 列${changedRow ? '' : ' ⚠ 沒換列,本次作廢'})`)
    }
    console.log(`\n━━ ${label}${SAB ? '(對照組:pointermove 塞 120ms 忙碌)' : ''}  CPU×${CPU}`)
    // 600 / 400ms:游標回到起點後,等起點那一列的 hover 派送與底色過渡在 CPU×N 下走完,下一次取樣的「換列」才從乾淨狀態開始
    await page.mouse.move(box.x, box.y); await sleep(600)
    await probe('A 沒捲動,往下移 2 列  ', box.y + 88)
    await probe('A 沒捲動,再往下移 2 列', box.y + 176)
    await page.mouse.move(box.x, box.y); await sleep(400)
    // 每 32ms 一格滾輪(約兩影格一格):模擬連續捲動的手勢節奏,不是等待
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 110); await sleep(32) }
    await probe('B 捲完後,往下移 2 列  ', box.y + 88)
    await probe('B 捲完後,再往下移 2 列', box.y + 176)
    return { label, out }
  } finally {
    await browser.close()
    await server.stop()
  }
}

const builds = process.argv.slice(2).filter((a) => !a.startsWith('--') && a.includes('=')).map((s) => { const i = s.indexOf('='); return { l: s.slice(0, i), d: s.slice(i + 1) } })
if (!builds.length) { console.error('✗ 需要至少一個 <label>=<dir>'); process.exit(1) }
let fail = 0
const results = []
for (const b of builds) results.push(await run(b.l, b.d))

const instrumentFails = results.filter((r) => r.instrument)
for (const r of results) {
  if (r.instrument) continue // 沒量到:不出任何延遲數字,也不做下面的判定(結尾 exit 1)
  const valid = r.out.filter((o) => o.changedRow)
  if (valid.length !== r.out.length) { console.log(`✗ ${r.label}:有 ${r.out.length - valid.length} 次游標底下的列根本沒換 —— 那幾次量到的不是 hover 反應`); fail++ }
  if (r.out.every((o) => o.fired === 0)) { console.log(`✗ ${r.label}:data-hovered 一次都沒變 —— 樁沒裝上,不得讀成「沒有延遲」`); fail++ }
  if (MAXMS != null) {
    const worst = Math.max(...valid.map((o) => o.ms ?? 99999))
    if (worst > Number(MAXMS)) { console.log(`✗ ${r.label}:最慢一次 ${worst}ms > 上限 ${MAXMS}ms`); fail++ }
    else console.log(`✓ ${r.label}:最慢一次 ${worst}ms ≤ 上限 ${MAXMS}ms`)
  }
}
if (instrumentFails.length) {
  // 沒量到 ≠ 沒有延遲,也 ≠ 對照組紅了
  console.log(`\n✗ 儀器失效:${instrumentFails.map((r) => r.label).join(', ')} 的 story「${STORY}」沒有量到 —— 這不是產品裁決,這些建置本次沒有任何延遲數字`)
  process.exit(1)
}
if (SAB) {
  const worst = Math.max(...results.flatMap((r) => r.out.map((o) => o.ms ?? 0)))
  if (worst < 100) { console.log(`\n✗ 對照組:塞了 120ms 忙碌,最慢卻只有 ${worst}ms —— 這支量具該紅沒紅,它的綠燈不算證據`); process.exit(1) }
  console.log(`\n✓ 對照組:最慢 ${worst}ms,量具確實會紅`); process.exit(0)
}
process.exit(fail ? 1 : 0)
