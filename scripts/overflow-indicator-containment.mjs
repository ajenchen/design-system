#!/usr/bin/env node
/**
 * 「+N」溢出指示器不得溢出容器(2026-09-08 建)
 *
 * 由來:user 截圖抓到 Reviewers 的「+2」跑出容器(總帳 E2)。量測基準已修
 * (量自己 → 量被分配到的空間),但**猜不到 user 那張截圖的觸發時機**。
 * 溢出是幾何問題,與其猜時機不如**把寬度窮舉一遍** —— 每個有「+N」的 story
 * 都在 6 個容器寬度下量一次,任何一次超出容器右緣就是紅燈。
 *
 * 判準:`+N` 元素的 right 不得超過**最近的裁切祖先**的 right(容差 0.5px 給次像素)。
 * 量的是「有沒有超出可見範圍」,不是「有沒有 overflow:hidden 幫忙藏起來」——
 * 被藏起來的溢出對使用者一樣是壞的(數字看不到)。
 */
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { launchBrowser } from './lib/launch-browser.mjs'

const STATIC = join(process.cwd(), 'storybook-static')
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const sv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'
  const f = join(STATIC, p)
  if (!existsSync(f) || statSync(f).isDirectory()) { s.writeHead(404); s.end(); return }
  s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f))
})
await new Promise((r) => sv.listen(0, r))

const SELFTEST = process.argv.includes('--selftest')
const WIDTHS = [1440, 1100, 900, 720, 560, 420]
const index = JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8'))
// 自動推導:凡是可能出現「+N」的元件全掃,不挑幾個代表(NO-SAMPLE)
const IDS = Object.keys(index.entries).filter((i) => /avatar|peoplepicker|tag|chip|overflow|datatable/i.test(i) && /展示|設計規格/.test(i))

const browser = await launchBrowser()
const page = await browser.newPage()
const bad = []
let scanned = 0, withPlus = 0

for (const id of IDS) {
  let sawPlus = false
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 })
    try {
      await page.goto(`http://localhost:${sv.address().port}/iframe.html?id=` + encodeURIComponent(id), { waitUntil: 'load', timeout: 15000 })
    } catch { continue }
    await page.waitForTimeout(320)
    const hits = await page.evaluate((selftest) => {
      const root = document.querySelector('#storybook-root') || document.body
      // 「+N」的載體:文字剛好是 +數字
      const plus = [...root.querySelectorAll('*')].filter((e) => {
        if (e.children.length) return false
        return /^\+\s*\d+$/.test((e.textContent || '').trim())
      })
      if (selftest && plus.length) plus[0].style.transform = 'translateX(400px)'  // 對照組:硬推出去
      const clippingAncestor = (el) => {
        let p = el.parentElement
        while (p && p !== document.documentElement) {
          const cs = getComputedStyle(p)
          if (/hidden|auto|scroll|clip/.test(cs.overflowX + cs.overflowY)) return p
          p = p.parentElement
        }
        return null
      }
      return plus.map((el) => {
        const anc = clippingAncestor(el)
        const target = anc || el.offsetParent || root
        const a = el.getBoundingClientRect(), b = target.getBoundingClientRect()
        return { text: (el.textContent || '').trim(), overRight: +(a.right - b.right).toFixed(1), overLeft: +(b.left - a.left).toFixed(1),
                 host: anc ? 'clip祖先' : '版面祖先', tag: el.tagName + '.' + (el.className || '').toString().split(' ')[0] }
      })
    }, SELFTEST)
    scanned++
    if (hits.length) { sawPlus = true }
    for (const h of hits) {
      if (h.overRight > 0.5 || h.overLeft > 0.5) {
        bad.push(`${id.replace('design-system-components-', '')} @${w}px  「${h.text}」超出${h.host} 右${h.overRight}px 左${h.overLeft}px  (${h.tag})`)
      }
    }
  }
  if (sawPlus) withPlus++
}

await browser.close(); sv.close()

console.log(`掃了 ${IDS.length} 個 story × ${WIDTHS.length} 個寬度 = ${scanned} 次量測,其中 ${withPlus} 個 story 有「+N」`)
if (SELFTEST) {
  console.log(bad.length ? '\n✓ selftest:把「+N」硬推出去時這支確實會紅(' + bad.length + ' 筆)' : '\n✗ selftest:推出去了卻沒抓到 —— 這支的綠燈不算證據')
  process.exit(bad.length ? 0 : 1)
}
if (bad.length) {
  console.log(`\n✗ ${bad.length} 處「+N」溢出容器:`)
  bad.slice(0, 20).forEach((b) => console.log('  ' + b))
  process.exit(1)
}
console.log('✓ 所有「+N」指示器都在容器內')
