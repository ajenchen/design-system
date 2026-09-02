#!/usr/bin/env node
// DataTable invariants test — 守 spec.md L4「不變條件」5 條:
//   (1) cell width = column width(跟 padding/state/mode 無關)
//   (2) display↔edit cell width 0 delta
//   (3) display↔edit cell height 0 delta(textarea field-sizing:content)
//   (4) Field 填滿 cell 高度(1px 容差於 cell.border-r)
//   (5) No-resize column ≥ meta.width
//
// 改 columnSizeStyle / 切 layout 必跑此 script,fail → exit 1 阻 commit。
// Run: `npm run test:datatable-invariants` 或 `node scripts/data-table-invariants.mjs`

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
// 動態取空埠:固定 7500 會被其他 session 的靜態伺服器佔住(EADDRINUSE)而在 pre-commit 誤阻 commit(2026-09-02)。
await new Promise(r => server.listen(0, r))
const BASE = `http://localhost:${server.address().port}`

let browser
try {
  browser = await chromium.launch({ headless: true })
} catch (error) {
  // 受限沙箱(Mach lookup 封閉)裡 Chromium 結構上起不來(bootstrap_check_in Permission
  // denied)——這是「環境開不了瀏覽器」,不是「不變條件失敗」,比照 hooks/tests/run-all.sh 的
  // mktemp 環境守衛先例:明確標記 SKIPPED-ENV 後放行(exit 0),請在可開瀏覽器的環境補驗。
  // 只攔啟動階段;瀏覽器成功啟動後的任何量測失敗仍然 fail closed。
  server.close()
  console.error(`⚠️  SKIPPED-ENV: 無法啟動 Chromium(${String(error?.message || error).split('\n')[0]})`)
  console.error('   此環境(受限沙箱)結構上無法跑 browser invariant;請於可開瀏覽器環境執行 npm run test:datatable-invariants 補驗。')
  process.exit(0)
}
const page = await browser.newPage({ viewport: { width: 2600, height: 800 } })

const failures = []
const passes = []

function record(invariant, label, pass, detail = '') {
  if (pass) passes.push(`✓ ${invariant} | ${label}`)
  else failures.push(`✗ ${invariant} | ${label} | ${detail}`)
}

// ── INVARIANT (5):No-resize column width ≥ meta.width ──
await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-展示--row-auto-height-inline-edit&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(500)

// RowAutoHeightInlineEdit story uses meta.width: SKU 100 / Product 240 / Category 160 / Note 360 / Price 100
// 此 story 沒 selection,沒 __select__ column → idx 從 0 起
const expectedMinWidths = {
  0: { name: 'SKU',      minWidth: 100 },
  1: { name: 'Product',  minWidth: 240 },
  2: { name: 'Category', minWidth: 160 },
  3: { name: 'Note',     minWidth: 360 },
  4: { name: 'Price',    minWidth: 100 },
}
for (const [colIdx, expected] of Object.entries(expectedMinWidths)) {
  const width = await page.evaluate((idx) => {
    const cell = document.querySelectorAll('[role="row"][data-row-index="0"] [role="cell"]')[Number(idx)]
    return cell?.getBoundingClientRect().width ?? null
  }, colIdx)
  record('I5', `${expected.name} ≥ meta.width(${expected.minWidth})`, width !== null && width >= expected.minWidth - 0.5, `actual ${width}`)
}

// ── INVARIANTS (1)(2)(3)(4):display↔edit stability ──
const cellTypes = [
  { row: 0, col: 0, label: 'SKU(string readonly)', skipEdit: true },
  { row: 0, col: 1, label: 'Product(string)' },
  { row: 0, col: 2, label: 'Category(select)' },
  { row: 0, col: 3, label: 'Note(textarea long-wrap)' },
  { row: 0, col: 4, label: 'Price(currency)' },
  { row: 2, col: 3, label: 'Note PRD-0003 long-wrap' },
]
for (const t of cellTypes) {
  if (t.skipEdit) continue
  const display = await page.evaluate(({ row, col }) => {
    const cell = document.querySelectorAll(`[role="row"][data-row-index="${row}"] [role="cell"]`)[col]
    if (!cell) return null
    const r = cell.getBoundingClientRect()
    return { width: r.width, height: r.height, left: r.left, top: r.top }
  }, t)
  if (!display) {
    // I1 真 assertion 路徑未進入 → 不可假綠,record fail
    record('I1', `${t.label} display↔edit cell width 一致`, false, 'cell not found(I1 真測路徑未進入)')
    continue
  }

  await page.mouse.click(display.left + display.width / 2, display.top + 20)
  await page.waitForTimeout(500)

  const edit = await page.evaluate(({ row, col }) => {
    const cell = document.querySelectorAll(`[role="row"][data-row-index="${row}"] [role="cell"]`)[col]
    const field = cell.querySelector('[data-field-mode="edit"], textarea')
    if (!field) return null
    const cr = cell.getBoundingClientRect()
    const fr = field.getBoundingClientRect()
    const cellBorderR = parseFloat(window.getComputedStyle(cell).borderRightWidth) || 0
    return { cellWidth: cr.width, cellHeight: cr.height, fieldWidth: fr.width, fieldHeight: fr.height, cellBorderR }
  }, t)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  if (!edit) {
    // I1 真 assertion 路徑未進入(沒進 edit mode)→ 不可假綠,record fail
    record('I1', `${t.label} display↔edit cell width 一致`, false, 'no edit field — I1 真測路徑未進入(may be intentional pattern e.g. multiPerson Popover)')
    record('I1-4', t.label, false, 'no edit field(may be intentional pattern e.g. multiPerson Popover)')
    continue
  }

  const widthDelta = Math.abs(display.width - edit.cellWidth)
  const heightDelta = Math.abs(display.height - edit.cellHeight)
  const fieldVsCell = Math.abs(edit.cellHeight - edit.fieldHeight)

  // I1:display↔edit cell 寬度一致(cell width = column width,跟 padding/state/mode 無關)
  // 真量 display cell rect.width vs edit cell rect.width,差異 > 1px → fail
  record('I1', `${t.label} display↔edit cell 寬度一致(>1px = fail)`, widthDelta <= 1, `display ${display.width.toFixed(2)} vs edit ${edit.cellWidth.toFixed(2)}, delta ${widthDelta.toFixed(2)}`)

  record('I2', `${t.label} display↔edit width 0 delta`, widthDelta < 0.5, `delta ${widthDelta.toFixed(2)}`)
  record('I3', `${t.label} display↔edit height 0 delta`, heightDelta < 0.5, `delta ${heightDelta.toFixed(2)}`)
  record('I4', `${t.label} Field 填滿 cell 高度`, fieldVsCell < 1, `cell-field delta ${fieldVsCell.toFixed(2)}`)
}

// ── INVARIANT (6):cell/header 字級隨 size 對齊 Field family — 全 cell-type @lg 必 16px ──
// Q2 機械防呆(2026-06-08 user 問「怎麼避免以後新 field 又漏傳 size」):
// StringCell/NumberCell 曾漏傳 size → naked display fallback 'md' → lg 字卡 14px(commit 84f0c6b6 修)。
// 此 I6 跨「全 cell-type」守門:任何 display cell 內文字載體 @lg computed font-size ≠ 16px(text-body-lg)
// → fail。新增 cell 若漏掉 size 繼承 → 字卡 14px → CI 紅,不靠人 review(mechanical = primary defense)。
// 用 Inspector @size=lg + pinnedLeft=false(全欄在同一 row,涵蓋 string/select/currency/date 多 cell-type)。
await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-設計規格--inspector&viewMode=story&args=size:lg;pinnedLeft:false`, { waitUntil: 'networkidle' })
await page.waitForSelector('[role="columnheader"]')
await page.waitForTimeout(500)
const lgFonts = await page.evaluate(() => {
  const leafFont = (root) => {
    let best = null
    const walk = (el) => { for (const n of el.childNodes) { if (n.nodeType === 3 && n.textContent.trim()) best = el; else if (n.nodeType === 1) walk(n) } }
    walk(root)
    return best ? Math.round(parseFloat(getComputedStyle(best).fontSize)) : null
  }
  const headers = [...document.querySelectorAll('[role="columnheader"]')].map(h => ({ label: (h.textContent || '').trim().slice(0, 10), px: leafFont(h) }))
  const firstRow = document.querySelector('[role="row"][data-row-index="0"]')
  const cells = firstRow ? [...firstRow.children].map(c => ({ label: (c.textContent || '').trim().slice(0, 10), px: leafFont(c) })) : []
  return { headers, cells }
})
const EXPECT_LG_FONT = 16  // text-body-lg(typography.css)
for (const h of lgFonts.headers) {
  if (h.px != null) record('I6', `header "${h.label}" @lg font = 16px(text-body-lg)`, h.px === EXPECT_LG_FONT, `got ${h.px}px(應 16,字級沒隨 size)`)
}
for (const c of lgFonts.cells) {
  if (c.px != null) record('I6', `cell "${c.label}" @lg font = 16px(對齊 Field,防漏傳 size)`, c.px === EXPECT_LG_FONT, `got ${c.px}px(應 16,該 cell 漏繼承 size?)`)
}

// ── INVARIANT (7):fixed-height row 絕對高度 == --table-row-{size} token(2026-07-10 #95 defense)──
// 病根(2026-07-09 campaign root cause):`.h-table-row-${size}` 動態 Tailwind class 模板字串靜默不生成
// → row 塌成內容高度(non-editable 33 / editable 44,而非 token 40)。I1-I4 只驗 display↔edit **一致性**
// (兩態同塌 → 0 delta → 假綠,抓不到「絕對高度崩」)。I7 驗「fixed row 絕對高度 == token 值」補此洞。
// root cause 另有 write-time hook `check_dynamic_tailwind_class.sh` 攔動態 class;I7 = runtime 防線第二層。
// 用 Inspector(設計規格,fixed-height 非 autoRowHeight)@ sm/md/lg 三尺寸;預設密度 token(uiSize.css)。
const ROW_TOKEN = { sm: 32, md: 40, lg: 48 }  // 預設密度 --table-row-{size}(uiSize.css:33-35)
for (const [size, expectPx] of Object.entries(ROW_TOKEN)) {
  await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-設計規格--inspector&viewMode=story&args=size:${size};pinnedLeft:false`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[role="row"][data-row-index="0"]')
  await page.waitForTimeout(400)
  const rowH = await page.evaluate(() => {
    const row = document.querySelector('[role="row"][data-row-index="0"]')
    return row ? row.getBoundingClientRect().height : null
  })
  record('I7', `fixed row 高 @${size} == --table-row-${size}(${expectPx}px)`, rowH !== null && Math.abs(rowH - expectPx) <= 1, `got ${rowH == null ? 'null' : rowH.toFixed(2)}px(應 ${expectPx};防 row 塌陷 regression)`)
}

// ── INVARIANT (8):全 cell 型別 view 態內容垂直置中(2026-08-20 user 拍板「所有 table-cell
//    內容都要合規,閘門要夠通用」;錨例:beta.100 da3 批修把多選人員外殼改純 block →
//    基線行盒把頭像串推頂 6.4px,一個月無人抓 — 因像素閘只掛 DataTable 自家檔)──
//    量法:每個 body cell 取「可見內容子樹聯集框」中心 vs cell 中心,|Δ| ≤ 1.5px。
await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-展示--inline-edit&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"]')
await page.waitForTimeout(400)
const centeringReport = await page.evaluate(() => {
  const headers = [...document.querySelectorAll('[role="columnheader"]')].map(h => (h.textContent || '').trim().slice(0, 18))
  const rows = [...document.querySelectorAll('[role="row"]')].slice(1, 4) // 前 3 個 body rows
  const out = []
  rows.forEach((row, ri) => {
    ;[...row.children].forEach((cell, ci) => {
      const cr = cell.getBoundingClientRect()
      if (cr.height < 8 || cr.width < 8) return
      let top = Infinity, bottom = -Infinity
      for (const el of cell.querySelectorAll('*')) {
        const cs = getComputedStyle(el)
        if (cs.position === 'absolute' || cs.visibility === 'hidden' || cs.display === 'none') continue
        const r = el.getBoundingClientRect()
        if (r.height === 0 || r.width === 0) continue
        // 只取葉層可見內容(圖、文字載體),避免高度=cell 的佈局容器稀釋量測
        const isLeafContent = el.tagName === 'IMG' || (el.children.length === 0 && (el.textContent || '').trim())
        if (!isLeafContent) continue
        top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom)
      }
      if (top === Infinity) return // 空 cell
      const delta = ((top + bottom) / 2) - ((cr.top + cr.bottom) / 2)
      out.push({ col: headers[ci] || `col${ci}`, row: ri, delta: +delta.toFixed(2) })
    })
  })
  return out
})
for (const c of centeringReport) {
  record('I8', `cell 內容垂直置中 [${c.col}] row${c.row}`, Math.abs(c.delta) <= 1.5, `中心偏移 ${c.delta}px(>±1.5 = 內容被行盒/對齊鏈推離,防 beta.100 類迴歸)`)
}

// ── INVARIANT (9):1px 線畫法機制統一(2026-08-20 user 拍板)——凍結邊界必為 1px 偽元素,
//    禁陰影畫線(非整數縮放下陰影與背景盒柵格化取整不同 → 粗細分家 1 vs 2 實體像素)──
await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-展示--pinned-columns&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-datatable-header-panel]')
const lineReport = await page.evaluate(() => {
  const panels = [...document.querySelectorAll('.dtPanelBoundaryRight, .dtPanelBoundaryLeft')]
  return panels.map(p => {
    const after = getComputedStyle(p, '::after')
    return {
      cls: p.className.includes('Right') ? 'Right' : 'Left',
      afterW: after.width,
      afterBg: after.backgroundColor,
      shadow: getComputedStyle(p).boxShadow,
    }
  })
})
record('I9', `凍結邊界 panel 存在(${lineReport.length} 個)`, lineReport.length > 0, 'pinned story 找不到 boundary panel')
for (const p of lineReport) {
  record('I9', `boundary ${p.cls} = 1px 偽元素`, p.afterW === '1px' && p.afterBg !== 'rgba(0, 0, 0, 0)', `::after width=${p.afterW} bg=${p.afterBg}`)
  record('I9', `boundary ${p.cls} 無陰影畫線`, p.shadow === 'none', `box-shadow=${p.shadow}(禁陰影畫線)`)
}

// ── Output ──
console.log(`\n=== DataTable Invariants Test ===`)
console.log(`PASS: ${passes.length}`)
console.log(`FAIL: ${failures.length}\n`)
if (passes.length > 0) console.log(passes.join('\n'))
if (failures.length > 0) {
  console.log('\n--- FAILURES ---')
  console.log(failures.join('\n'))
}

await browser.close()
server.close()

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} invariant(s) failed. Block commit.`)
  process.exit(1)
}
console.log(`\n✓ All ${passes.length} invariants pass.`)
process.exit(0)
