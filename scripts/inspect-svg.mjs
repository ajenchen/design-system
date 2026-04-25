import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

console.log('── 1. iconOnly story ──')
await page.goto(
  'http://localhost:6006/?path=/story/design-system-components-button-%E5%B1%95%E7%A4%BA--icon-only&viewMode=story',
  { waitUntil: 'networkidle' }
)
await page.waitForTimeout(1500)
const svgs = page.frameLocator('#storybook-preview-iframe').locator('#storybook-root button svg')
const cnt = await svgs.count()
let allSquare = true
for (let i = 0; i < cnt; i++) {
  const r = await svgs.nth(i).evaluate(el => {
    const cs = getComputedStyle(el)
    return { w: cs.width, h: cs.height }
  })
  const square = r.w === r.h
  console.log(`  Icon[${i}] ${r.w} × ${r.h} ${square ? '✓ 正方形' : '✗ 不對稱!'}`)
  if (!square) allSquare = false
}
console.log(`  iconOnly 全部正方形: ${allSquare}`)

console.log('\n── 2. AllVariants story (非 iconOnly,有 label)──')
await page.goto(
  'http://localhost:6006/?path=/story/design-system-components-button-%E5%B1%95%E7%A4%BA--all-variants&viewMode=story',
  { waitUntil: 'networkidle' }
)
await page.waitForTimeout(1500)
const buttons = page.frameLocator('#storybook-preview-iframe').locator('#storybook-root button')
const bCnt = await buttons.count()
console.log(`  found ${bCnt} buttons (label only,no icons)`)
const sampleBtnSize = await buttons.first().evaluate(el => {
  const r = el.getBoundingClientRect()
  return { w: Math.round(r.width), h: Math.round(r.height) }
})
console.log(`  sample button dim: ${sampleBtnSize.w} × ${sampleBtnSize.h}(label-only,正常 != 正方形)`)

console.log('\n── 3. endIcon / badge stories(找含 icon 的非 iconOnly)──')
await page.goto(
  'http://localhost:6006/?path=/story/design-system-components-button-%E5%B1%95%E7%A4%BA--endicon-badge&viewMode=story',
  { waitUntil: 'networkidle' }
).catch(() => {})
await page.waitForTimeout(1500)
const svgs3 = page.frameLocator('#storybook-preview-iframe').locator('#storybook-root button svg')
const cnt3 = await svgs3.count()
for (let i = 0; i < Math.min(cnt3, 3); i++) {
  const r = await svgs3.nth(i).evaluate(el => {
    const cs = getComputedStyle(el)
    return { w: cs.width, h: cs.height }
  })
  console.log(`  Button[${i}] icon ${r.w} × ${r.h} ${r.w === r.h ? '✓' : '✗'}`)
}

await browser.close()
