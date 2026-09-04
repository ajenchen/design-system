#!/usr/bin/env node
/**
 * pagination-narrow-ladder-invariant — Pagination 窄容器階梯的機械驗證(pagination.spec.md「窄容器階梯」)。
 *
 * 載入 storybook-static 的「窄容器階梯」story —— 它把同一份分頁列放進五個固定寬度的容器,
 * 所以每一份都在**掛載時**由 layout effect 收斂到自己的階,不依賴 ResizeObserver
 * (背景分頁不送 RO callback,靠 RO 的驗證在很多環境會是空轉)。
 *
 * 判定:
 *   P1 資訊文字永遠不超過一行(2026-09-04 user:「希望 rwd 可以讓資訊文字幾乎完全不會超過一行」)。
 *      量的是 `rect.height / lineHeight`,不是「有沒有 nowrap class」—— class 存在不等於沒換行。
 *   P2 階梯單調:容器由寬到窄,四個特徵(每頁筆數 / 格位數 / 資訊文字 / 是否橫捲)只能往「更省」的
 *      方向走,不得回頭。回頭 = 門檻算錯或量測抖動。
 *   P3 瀏覽模式不變:**每一階都必須還是數字頁碼**(至少一顆數字鈕 + 上下頁鈕),
 *      不得在任何寬度退化成純上下頁或 `n / N` 文字 —— 那是 2026-07-05 拍板排除的另一種導覽模式。
 *   P4 階梯真的有動:五個容器至少要走過 3 個不同的階,否則這條閘是空轉
 *      (全部同一階時 P1/P2/P3 恆真,測不到東西)。
 *   P5 收斂不抖:同一份量兩次(中間隔一個 rAF)結果必須相同 —— 抓「量測 → setState → 再量 → 又改」的來回跳。
 *
 * 沙箱起不了 Chromium → SKIPPED-ENV(exit 0),請在可開瀏覽器的環境(CI)補驗。
 */
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
await new Promise((r) => server.listen(0, r))
const BASE = `http://localhost:${server.address().port}`

let browser
try {
  browser = await chromium.launch({ headless: true })
} catch (error) {
  console.error(`⚠️  SKIPPED-ENV: 無法啟動 Chromium(${String(error?.message || error).split('\n')[0]})`)
  console.error('   請於可開瀏覽器環境執行 npm run test:pagination-invariants 補驗。')
  server.close(); process.exit(0)
}
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
await page.goto(`${BASE}/iframe.html?id=design-system-components-pagination-展示--narrow-ladder&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('nav[aria-label="Pagination"]')

const snap = () => page.evaluate(() => {
  const navs = [...document.querySelectorAll('nav[aria-label="Pagination"]')]
  return navs.map((nav) => {
    const span = nav.querySelector('span')
    const ul = nav.querySelector('ul')
    const sel = nav.querySelector('[role="combobox"],button[aria-haspopup],select')
    const rect = span ? span.getBoundingClientRect() : null
    const lh = span ? (parseFloat(getComputedStyle(span).lineHeight) || 20) : 20
    const items = ul ? [...ul.querySelectorAll('li')] : []
    // 頁碼格位 = 扣掉頭尾兩顆上下頁鈕
    const slots = Math.max(0, items.length - 2)
    const numeric = items.filter((li) => /^\d+$/.test((li.textContent || '').trim())).length
    return {
      container: +nav.parentElement.getBoundingClientRect().width.toFixed(0),
      infoLines: rect && rect.height > 0 ? Math.round(rect.height / lh) : 0,
      hasInfo: !!(span && (span.textContent || '').trim()),
      slots,
      numericButtons: numeric,
      hasPrevNext: items.length >= 2,
      hasSizer: !!sel,
      scrolls: nav.scrollWidth > nav.clientWidth + 0.5,
    }
  })
})

const first = await snap()
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
const second = await snap()

const findings = []
const record = (id, desc, pass, detail) => { findings.push({ id, pass }); console.log(`${pass ? '✅' : '❌'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`) }

record('P0', `找到 ${first.length} 個分頁列(story 應有 5 個)`, first.length >= 5, JSON.stringify(first.map((f) => f.container)))

const wrapped = first.filter((f) => f.infoLines > 1)
record('P1', '資訊文字永遠不超過一行', wrapped.length === 0,
  wrapped.length ? `容器 ${wrapped.map((w) => `${w.container}px(${w.infoLines} 行)`).join(' / ')}` : `最多 ${Math.max(...first.map((f) => f.infoLines))} 行`)

// 由寬到窄排序後,四個特徵只能單調變「省」
const byWidth = [...first].sort((a, b) => b.container - a.container)
const rank = (f) => [f.hasSizer ? 1 : 0, f.slots, f.hasInfo ? 1 : 0, f.scrolls ? 0 : 1]
let monoBad = null
for (let i = 1; i < byWidth.length; i++) {
  const prev = rank(byWidth[i - 1]), cur = rank(byWidth[i])
  if (cur.some((v, k) => v > prev[k])) { monoBad = { at: byWidth[i].container, prev, cur }; break }
}
record('P2', '階梯單調(愈窄只會愈省,不回頭)', monoBad === null, monoBad ? JSON.stringify(monoBad) : `${byWidth.map((f) => f.container).join(' → ')}`)

const degraded = first.filter((f) => f.numericButtons === 0 || !f.hasPrevNext)
record('P3', '每一階都還是數字頁碼(不退化成純上下頁 / n-of-N)', degraded.length === 0,
  degraded.length ? `容器 ${degraded.map((d) => d.container).join('/')} 沒有數字鈕` : `最少 ${Math.min(...first.map((f) => f.numericButtons))} 顆數字鈕`)

const distinct = new Set(first.map((f) => JSON.stringify(rank(f)))).size
record('P4', '階梯真的有動(否則本閘空轉)', distinct >= 3, `走過 ${distinct} 個不同的階`)

const unstable = first.map((f, i) => JSON.stringify(rank(f)) !== JSON.stringify(rank(second[i])) ? f.container : null).filter(Boolean)
record('P5', '收斂不抖(隔一個 rAF 再量結果相同)', unstable.length === 0, unstable.length ? `容器 ${unstable.join('/')} 在兩次量測間改變` : 'stable')

await browser.close()
server.close()
const failed = findings.filter((f) => !f.pass)
console.log(failed.length ? `\n✗ pagination-narrow-ladder ${failed.length} 條失敗` : `\n✅ pagination-narrow-ladder-invariant PASS`)
process.exit(failed.length ? 1 : 0)
