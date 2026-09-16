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
 *   node scripts/data-table-hover-scroll-cost.mjs [--runs=5] [--cpu=4] [--sabotage] <label>=<dir> …
 */
import http from 'node:http'
import { join, extname } from 'node:path'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { launchBrowser } from './lib/launch-browser.mjs'

const STORY = 'design-system-components-datatable-展示--roadmap-all-in-one'
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const RUNS = Number(arg('runs', '5'))
const CPU = Number(arg('cpu', '4'))
const SAB = process.argv.includes('--sabotage')

const targets = process.argv.slice(2).filter((a) => !a.startsWith('--') && a.includes('='))
if (!targets.length) { console.error('✗ 需要至少一個 <label>=<dir>'); process.exit(1) }

const serve = async (dir) => {
  const server = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0])
    if (p === '/') p = '/index.html'
    const f = join(dir, p)
    if (!existsSync(f) || !statSync(f).isFile()) { r.statusCode = 404; r.end(); return }
    r.setHeader('content-type', MIME[extname(f)] || 'application/octet-stream')
    r.end(readFileSync(f))
  })
  await new Promise((res) => server.listen(0, '127.0.0.1', res))
  return { server, port: server.address().port }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const measure = async (label, dir) => {
  if (!existsSync(join(dir, 'index.html'))) { console.error(`✗ ${label}: ${dir} 沒有 index.html`); process.exit(1) }
  const { server, port } = await serve(dir)
  const browser = await launchBrowser()
  const samples = []
  try {
    const page = await browser.newPage()
    await page.setViewportSize({ width: 1440, height: 900 })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
    await page.goto(`http://127.0.0.1:${port}/iframe.html?id=${STORY}&viewMode=story`, { waitUntil: 'load' })
    await page.waitForSelector('[data-row-index]', { timeout: 30_000 })
    await page.waitForTimeout(1200)
    if (SAB) {
      await page.evaluate(() => {
        const burn = () => { const t = performance.now(); while (performance.now() - t < 4) { /* 對照組:每次 scroll 事件燒 4ms */ } }
        document.addEventListener('scroll', burn, { capture: true, passive: true })
      })
    }
    // 指標停在表格中間某一列上,整段手勢期間都不動
    const box = await page.locator('[data-row-index]').first().boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + 240)
    await page.waitForTimeout(400)
    const scriptMs = async () => {
      const { metrics } = await cdp.send('Performance.getMetrics')
      return (metrics.find((m) => m.name === 'ScriptDuration')?.value ?? 0) * 1000
    }
    for (let i = 0; i < RUNS; i += 1) {
      await page.evaluate(() => { document.querySelectorAll('[data-row-index]')[0]?.closest('[data-testid],div')?.scrollTo?.(0, 0) })
      await page.waitForTimeout(500)
      const before = await scriptMs()
      await cdp.send('Input.synthesizeScrollGesture', {
        x: Math.round(box.x + box.width / 2), y: Math.round(box.y + 240),
        yDistance: -2400, speed: 1200, gestureSourceType: 'mouse', repeatCount: 0,
      })
      await page.waitForTimeout(600)
      samples.push(await scriptMs() - before)
    }
  } finally {
    await browser.close()
    server.close()
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
