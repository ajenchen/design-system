// Screenshot Steps stories from storybook dev server :6007
// usage: node /tmp/steps-shot.mjs <outdir>
import { chromium } from 'playwright'
import fs from 'node:fs'

const outdir = process.argv[2]
fs.mkdirSync(outdir, { recursive: true })

const index = await (await fetch('http://localhost:6007/index.json')).json()
const wanted = Object.values(index.entries).filter(
  e => e.title === 'Design System/Components/Steps/展示' &&
       ['Horizontal', 'MultipleExpansion', 'Default'].includes(e.name),
)
if (wanted.length !== 3) {
  console.error('expected 3 stories, got', wanted.map(w => w.name))
  process.exit(1)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 })
for (const s of wanted) {
  await page.goto(`http://localhost:6007/iframe.html?id=${s.id}&viewMode=story`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const root = page.locator('#storybook-root')
  await root.screenshot({ path: `${outdir}/${s.name}.png` })
  console.log('shot', s.name)
}
await browser.close()
