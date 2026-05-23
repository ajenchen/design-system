// Visual pixel-quantified probe — verify leading-none → leading-none (2026-05-23 Path B 更新:現狀已是 leading-none,本 probe 變 sanity check 而非 migration verification) 視覺零差別 claim
// 用 chromium 量 Avatar / OverflowIndicator / Steps 的 inner text getBoundingClientRect()
// 三點對照:(A) 當前 leading-none (2026-05-23 Path B 更新:現狀已是 leading-none,本 probe 變 sanity check 而非 migration verification) / (B) 模擬 leading-none / (C) 模擬 leading-normal
// 若 A vs B 像素 delta = 0 → 確認視覺零差別,migration 是 token-hygiene rebranding 無視覺影響

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PORT = 6018
const STORYBOOK = path.join(process.cwd(), 'storybook-static')

const server = createServer((req, res) => {
  let p = (req.url || '/').split('?')[0]
  if (p === '/' || p === '') p = '/iframe.html'
  const fp = path.join(STORYBOOK, p)
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) { res.statusCode = 404; res.end(); return }
  const ext = path.extname(fp)
  const ct = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream'
  res.setHeader('Content-Type', ct)
  res.end(fs.readFileSync(fp))
}).listen(PORT)

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })

// 用 default Avatar / OverflowIndicator / Steps stories
const targets = [
  { name: 'Avatar', storyId: 'design-system-components-avatar-展示--default' },
  { name: 'OverflowIndicator', storyId: 'design-system-components-overflowindicator-展示--default' },
  { name: 'Steps', storyId: 'design-system-components-steps-展示--default' },
]

const probe = async (page, leadingValue) => {
  return page.evaluate((lv) => {
    // 找所有可能有 leading 的內部 text element(font-medium + 圓形容器內 text)
    const findElements = () => {
      const els = []
      // Avatar initial:span.font-medium 在 [data-avatar] 內
      document.querySelectorAll('span.font-medium').forEach(el => {
        const text = el.textContent?.trim()
        if (text && text.length <= 4) els.push({ el, role: 'numeric-or-initial' })
      })
      return els
    }
    const els = findElements()
    if (els.length === 0) return { found: 0, samples: [] }
    const samples = els.slice(0, 3).map(({ el }) => {
      const original = el.style.lineHeight
      el.style.lineHeight = lv
      const r = el.getBoundingClientRect()
      const cs = window.getComputedStyle(el)
      const data = {
        text: el.textContent?.trim(),
        box: { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 },
        lineHeight: cs.lineHeight,
        fontSize: cs.fontSize,
        parent: el.parentElement ? {
          w: Math.round(el.parentElement.getBoundingClientRect().width),
          h: Math.round(el.parentElement.getBoundingClientRect().height),
        } : null,
      }
      el.style.lineHeight = original
      return data
    })
    return { found: els.length, samples }
  }, leadingValue)
}

const results = {}
for (const t of targets) {
  const url = `http://localhost:${PORT}/iframe.html?id=${t.storyId}&viewMode=story`
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(500)
    // Probe 3 modes(本身 leading-none (2026-05-23 Path B 更新:現狀已是 leading-none,本 probe 變 sanity check 而非 migration verification) = current state 從 css cascade)
    const current = await probe(page, '')          // 不 override = 現狀(leading-none (2026-05-23 Path B 更新:現狀已是 leading-none,本 probe 變 sanity check 而非 migration verification))
    const none = await probe(page, '1')             // 模擬 leading-none
    const normal = await probe(page, '1.5')          // 模擬 leading-normal(對照)
    results[t.name] = { current, none, normal }
    console.log(`▶ ${t.name}:current vs none box delta = ${current.samples[0]?.box.h - (none.samples[0]?.box.h ?? 0)}px`)
  } catch (e) {
    results[t.name] = { error: e.message }
  }
  await page.close()
}

await ctx.close()
await b.close()
server.close()

console.log('\n═══ Visual probe complete ═══')
console.log(JSON.stringify(results, null, 2))
