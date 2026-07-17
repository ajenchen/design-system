#!/usr/bin/env node
// probe-inline-edit-align.mjs — 量 InlineEdit view 態內容左緣 vs label 左緣(對齊 SSOT 驗證,2026-07-17)
// 驗證 root cause 修:委派控件(tag/plain/date)+ 純值 view 左緣都應落 label 左緣(Δ≈0)。
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.cwd()
const STATIC = join(ROOT, 'storybook-static')
if (!existsSync(join(STATIC, 'index.json'))) { console.error('✗ storybook-static missing. build-storybook first.'); process.exit(2) }
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p)
  if (!existsSync(fp)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise((r) => server.listen(7519, r))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
const TOL = 1.5 // px 容差(1px 透明 border 等)
let fail = 0
const results = []

async function probe(storyId, label) {
  await page.goto(`http://localhost:7519/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  // 對每個 Field(有 label 的),量 label 左 vs 該 field InlineEdit view 內容最左緣
  const rows = await page.evaluate(() => {
    const out = []
    // 找所有 FieldLabel(label 元素)+ 其後的 InlineEdit view 內容
    const labels = [...document.querySelectorAll('label')]
    for (const lab of labels) {
      const field = lab.closest('[data-field-orientation],div') || lab.parentElement
      // InlineEdit view root = [data-editing="false"](本身帶 -mx alignBleed → 邊緣在 label 左 field-px)
      const ieView = field?.querySelector('[data-editing="false"]')
      if (!ieView) continue
      // 內容起點 = 值載體(fieldViewGeometry 容器 / Tag / span)的 content-box 左緣。
      // 該容器有 px-[--field-px] padding → 其 rect.left(22)+ paddingLeft(12)= 內容起點(33)= 應對齊 label。
      // 排除 absolute Pressable。找有 text 且 paddingLeft>0 的最內層值容器;無 padding 者取 rect.left。
      const cands = [...ieView.querySelectorAll('*')].filter((el) => {
        const cs = getComputedStyle(el)
        return cs.position !== 'absolute' && (el.textContent || '').trim().length > 0 && el.getBoundingClientRect().width > 0
      })
      if (!cands.length) continue
      // 值內容起點 = 每個候選的 content-box 左緣(rect.left + paddingLeft)取最小(最左的可視值起點)
      const contentLeft = Math.min(...cands.map((el) => {
        const r = el.getBoundingClientRect(); const pl = parseFloat(getComputedStyle(el).paddingLeft) || 0
        return r.left + pl
      }))
      out.push({ label: lab.textContent.trim(), labelLeft: +lab.getBoundingClientRect().left.toFixed(1), contentLeft: +contentLeft.toFixed(1) })
    }
    return out
  })
  for (const r of rows) {
    const delta = +(r.contentLeft - r.labelLeft).toFixed(1)
    const ok = Math.abs(delta) <= TOL
    if (!ok) fail++
    results.push(`  [${label}] ${r.label}: label.left=${r.labelLeft} content.left=${r.contentLeft} Δ=${delta} ${ok ? '✅' : '❌ 未對齊'}`)
  }
  if (!rows.length) results.push(`  [${label}] ⚠️ 找不到 label+view 對(story 無 FieldLabel?)`)
}

await probe('design-system-components-inlineedit-展示--vertical-field-form', 'VerticalFieldForm(圖三:plain+tag+多行)')

// ── blur exit 驗證:點 Status(Select)進 edit → 點別處 blur → 應回 display(無殘留 chrome)──
async function probeBlurExit() {
  await page.goto('http://localhost:7519/iframe.html?id=design-system-components-inlineedit-展示--vertical-field-form&viewMode=story', { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  // 進 edit:點 Status 欄的 view Pressable(第 2 個 field,Status)
  const statusBtn = page.locator('label:has-text("Status")').locator('..').locator('[data-editing="false"] button')
  await statusBtn.click()
  await page.waitForTimeout(400)
  const editingCount1 = await page.locator('[data-editing]:not([data-editing="false"])').count()
  // blur:點表單外空白處(body 頂端)
  await page.mouse.click(10, 10)
  await page.waitForTimeout(500)
  const editingCount2 = await page.locator('[data-editing]:not([data-editing="false"])').count()
  const enteredEdit = editingCount1 >= 1
  const exitedOnBlur = editingCount2 === 0
  results.push(`  [blur-exit] 點 Status 進 edit(editing 元素=${editingCount1})→ ${enteredEdit ? '✅ 進 edit' : '❌ 沒進 edit'}`)
  results.push(`  [blur-exit] blur 後 editing 元素=${editingCount2} → ${exitedOnBlur ? '✅ 回 display 無殘留' : '❌ chrome 殘留(bug 未修)'}`)
  if (!enteredEdit || !exitedOnBlur) fail++
}
await probeBlurExit()

console.log('\n=== InlineEdit 對齊量測(content.left vs label.left,Δ≤%s 容差)==='.replace('%s', TOL))
console.log(results.join('\n'))
console.log(fail === 0 ? '\n✅ 全部對齊(Δ≈0)' : `\n❌ ${fail} 欄未對齊`)

await browser.close()
server.close()
process.exit(fail === 0 ? 0 : 1)
