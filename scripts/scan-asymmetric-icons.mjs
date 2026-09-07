import { chromium } from 'playwright'
import { launchBrowser } from './lib/launch-browser.mjs'
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

// Auto-discover all stories via Storybook index
const indexRes = await fetch('http://localhost:6006/index.json')
const indexData = await indexRes.json()
const entries = indexData.entries || {}
// Only Components stories(skip Tokens / Patterns docs / 設計規格 / 設計原則 too verbose)
const STORIES = Object.values(entries).filter(e => 
  e.type === 'story' && 
  e.title?.startsWith('Design System/Components/') &&
  e.title.includes('展示')
).map(e => ({ id: e.id, name: `${e.title.split('/').slice(-1)[0]} / ${e.name}` }))

console.log(`Auto-discovered ${STORIES.length} component 展示 stories`)

let totalIcons = 0, totalAsym = 0
const asymList = []
let scannedCount = 0
for (const s of STORIES) {
  try {
    await page.goto(`http://localhost:6006/?path=/story/${s.id}&viewMode=story`, { waitUntil: 'networkidle', timeout: 6000 }).catch(() => {})
    await page.waitForTimeout(500)
    const svgs = page.frameLocator('#storybook-preview-iframe').locator('#storybook-root svg')
    const cnt = await svgs.count().catch(() => 0)
    if (cnt === 0) continue
    scannedCount++
    for (let i = 0; i < Math.min(cnt, 30); i++) {
      const r = await svgs.nth(i).evaluate(el => {
        const cs = getComputedStyle(el)
        return { w: cs.width, h: cs.height }
      }).catch(() => null)
      if (!r || r.w === 'auto' || r.h === 'auto') continue
      // Filter:icon SVGs are 12-48px;skip chart canvases / illustration SVGs
      // (recharts / d3 / svg illustrations 都不在 icon symmetry scope)
      const wPx = parseFloat(r.w), hPx = parseFloat(r.h)
      if (Number.isNaN(wPx) || Number.isNaN(hPx)) continue
      if (wPx > 64 || hPx > 64) continue
      totalIcons++
      if (r.w !== r.h) {
        totalAsym++
        asymList.push({ story: s.name, w: r.w, h: r.h })
      }
    }
  } catch (e) { /* skip */ }
}
console.log(`\n${scannedCount} stories had SVGs(共 ${totalIcons} 個 icons 量測)`)
console.log(`Asymmetric: ${totalAsym}`)
if (asymList.length > 0) {
  console.log('\n❌ 不對稱清單:')
  asymList.slice(0, 20).forEach(a => console.log(`  ${a.story}: ${a.w}×${a.h}`))
} else {
  console.log('✓ 全 DS 0 個 asymmetric icons')
}
await browser.close()
