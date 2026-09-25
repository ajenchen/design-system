#!/usr/bin/env node
/**
 * 量「指標停在表格上時,捲動一次手勢要花多少腳本執行時間」——hover 互斥機制的實際成本。
 *
 * 為什麼不是用 `data-table-scroll-cost.mjs`:那支從頭到尾不送任何指標事件,
 * 所以 `rowPointerPos` 恆為 NaN,`syncHoverUnderPointer` 會在第一個判斷就 return —— 它看不到這條路徑。
 * 要量到,指標必須真的停在表格上,而且捲動必須走合成器(`Input.synthesizeScrollGesture`);
 * `page.mouse.wheel` 觸發的是離散 wheel,重現不了逐幀 commit。
 *
 * 量的是 CDP `Performance.getMetrics` 的 `ScriptDuration` 差值(手勢前後),單位秒 → 毫秒。
 * 每個版本重複 N 次取中位數;版本之間同一台機器、同一個 server、同一組參數(跨機器/跨網域比較無效,
 * 見 `governance/memory/reference_perf_validation_same_host.md`)。
 *
 * 對照組 `--sabotage`:在每次 commit 後硬塞一段忙迴圈,數字必須明顯變大,否則這支量具不算數(M32)。
 *
 * **這是量測工具,不是閘**(不在 CI;只印數字、不判紅綠)。
 * 載入(2026-09-25):每個版本的 story 由共用的 openStory(lib/launch-browser.mjs)開 —— 等 Storybook 回報渲染完成、
 * 畫面健康、表格列出現、版面連續靜止 10 個影格才開始量(取代舊的 load + 等列 + 固定睡 1200ms)。
 * 供檔改用共用的 startA11yStaticServer(有 build-info.json 的建置會先凍結成本次獨佔的快照,並留同源 404 帳本)。
 * story 開不起來 → 儀器失效:點名版本與 story、列同源 404,exit 2 —— 那個版本**沒有數字**,不是「成本 0」。
 *
 *   node scripts/data-table-hover-scroll-cost.mjs [--runs=5] [--cpu=4] [--sabotage] <label>=<dir> …
 */
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const STORY = 'design-system-components-datatable-展示--roadmap-all-in-one'
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const RUNS = Number(arg('runs', '5'))
const CPU = Number(arg('cpu', '4'))
const SAB = process.argv.includes('--sabotage')

const targets = process.argv.slice(2).filter((a) => !a.startsWith('--') && a.includes('='))
if (!targets.length) { console.error('✗ 需要至少一個 <label>=<dir>'); process.exit(1) }

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const measure = async (label, dir) => {
  if (!existsSync(join(dir, 'index.html'))) { console.error(`✗ ${label}: ${dir} 沒有 index.html`); process.exit(1) }
  const server = await startA11yStaticServer({ rootDirectory: dir, defaultFile: 'iframe.html' })
  const browser = await launchBrowser()
  const samples = []
  try {
    const page = await browser.newPage()
    await page.setViewportSize({ width: 1440, height: 900 })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
    try {
      // 降速 CPU×N 下渲染較慢:成功只由渲染完成 / 列出現 / 靜止這三個訊號決定,上限放寬到 60 秒(只是等不到的上限)
      await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, {
        waitFor: '[data-row-index]', settleFrames: 10, notFound: server.notFound,
        timeoutMs: 60_000, settleTimeoutMs: 30_000,
      })
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      console.error(`✗ 版本「${label}」(${dir}):${error.message}`)
      console.error('✗ 儀器失效 —— 這個版本沒有量到任何數字(exit 2),不是「成本 0」')
      await browser.close().catch(() => {})
      await server.stop()
      process.exit(2)
    }
    if (SAB) {
      await page.evaluate(() => {
        const burn = () => { const t = performance.now(); while (performance.now() - t < 4) { /* 對照組:每次 scroll 事件燒 4ms */ } }
        document.addEventListener('scroll', burn, { capture: true, passive: true })
      })
    }
    // 指標停在表格中間某一列上,整段手勢期間都不動
    const box = await page.locator('[data-row-index]').first().boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + 240)
    // 元素早已在畫面上;給指標進場後的列 hover 同步與背景色過渡落定,再開始量
    await page.waitForTimeout(400)
    const scriptMs = async () => {
      const { metrics } = await cdp.send('Performance.getMetrics')
      return (metrics.find((m) => m.name === 'ScriptDuration')?.value ?? 0) * 1000
    }
    for (let i = 0; i < RUNS; i += 1) {
      await page.evaluate(() => { document.querySelectorAll('[data-row-index]')[0]?.closest('[data-testid],div')?.scrollTo?.(0, 0) })
      // 捲回頂端觸發的虛擬列重畫做完,這段成本才不會算進下一次手勢
      await page.waitForTimeout(500)
      const before = await scriptMs()
      await cdp.send('Input.synthesizeScrollGesture', {
        x: Math.round(box.x + box.width / 2), y: Math.round(box.y + 240),
        yDistance: -2400, speed: 1200, gestureSourceType: 'mouse', repeatCount: 0,
      })
      // 量測窗的定義:手勢結束後再收 600ms 的尾端腳本工作(捲動結束後的 hover 重新同步等)
      await page.waitForTimeout(600)
      samples.push(await scriptMs() - before)
    }
  } finally {
    await browser.close()
    await server.stop()
  }
  return samples
}

const results = []
for (const t of targets) {
  const eq = t.indexOf('=')
  const label = t.slice(0, eq)
  const samples = await measure(label, t.slice(eq + 1))
  results.push({ label, samples })
}

console.log(`\n指標停在表格上、CDP 合成捲動、CPU×${CPU}、每個版本 ${RUNS} 次${SAB ? '(對照組:每次 scroll 燒 4ms)' : ''}`)
console.log('量的是手勢前後 ScriptDuration 差值(毫秒),數字越小越好\n')
for (const { label, samples } of results) {
  const shown = samples.map((s) => s.toFixed(1)).join(' / ')
  console.log(`${label.padEnd(10)} 中位 ${median(samples).toFixed(2)} ms   (各次:${shown})`)
}
console.log('')
