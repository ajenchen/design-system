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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')

if (!existsSync(STATIC)) {
  console.error('✗ storybook-static missing. Run `npm run build-storybook` first.')
  process.exit(1)
}
// **stale-build 守衛**(2026-09-03 補;失敗記憶索引既有條目:「storybook-smoke 驗舊 build = 假綠」):
// 只檢查目錄存不存在會讓「改了 src 但沒重建」的情況拿到假綠 —— 量到的是上一版的 DOM。
{
  const SRC_DIR = join(ROOT, 'packages/design-system/src/components/DataTable')
  const newestSrc = readdirSync(SRC_DIR)
    .filter((f) => /\.(tsx?|css)$/.test(f))
    .reduce((max, f) => Math.max(max, statSync(join(SRC_DIR, f)).mtimeMs), 0)
  const builtAt = statSync(join(STATIC, 'index.json')).mtimeMs
  if (newestSrc > builtAt) {
    console.error('✗ storybook-static 比 DataTable 原始碼舊 —— 量到的會是上一版 DOM(假綠)。')
    console.error(`   最新原始碼 ${new Date(newestSrc).toISOString()} > 建置 ${new Date(builtAt).toISOString()}`)
    console.error('   請先跑 `npm run build-storybook`。')
    process.exit(1)
  }
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

// ── I10:右/置中對齊欄的「標題」與「儲存格內容」必須對齊同一邊(2026-09-03 user 抓到)──
// 根因是 header 的點擊區為 flex-1(要撐滿才有夠大的排序點擊範圍),外層 justify-end 因此沒有剩餘空間可分配,
// 標題被推回最左、和右對齊的數字對不齊;TruncatedText 的 text-right 在 flex row 內是收縮寬度,救不了。
// 這條把「對齊」變成可量的像素事實,任何人再把 align class 從內層拿掉就會紅。
await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-展示--with-pagination&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[role="columnheader"]')
const alignReport = await page.evaluate(() => {
  const textRect = (el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n
    while ((n = w.nextNode())) {
      const t = n.textContent.trim()
      if (t) {
        const r = document.createRange()
        r.selectNodeContents(n)
        const b = r.getBoundingClientRect()
        if (b.width > 0) return { text: t.slice(0, 12), left: b.left, right: b.right }
      }
    }
    return null
  }
  const heads = [...document.querySelectorAll('[role="columnheader"]')]
  // **`role="cell"` 不是 `gridcell`**(2026-09-03 抓到:這條寫錯選擇器 → `row` 恆為 undefined →
  // 迴圈零次 → **一條紀錄都不產生,看起來就像通過**)。DataTable 的 body cell 一律是 `role="cell"`;
  // `gridcell` 只出現在 Calendar / DateGrid。下方另加「真的量到欄」守衛,防止再次空轉。
  const row = [...document.querySelectorAll('[role="row"]')].find((r) => r.querySelector('[role="cell"]'))
  const cells = row ? [...row.querySelectorAll('[role="cell"]')] : []
  return heads.slice(0, cells.length).map((h, i) => ({
    just: getComputedStyle(h).justifyContent,
    head: textRect(h),
    cell: textRect(cells[i]),
  }))
})
for (const col of alignReport) {
  if (!col.head || !col.cell) continue
  if (col.just === 'flex-end') {
    const delta = Math.abs(col.head.right - col.cell.right)
    record('I10', `右對齊欄「${col.head.text}」標題與內容右緣一致`, delta <= 1.5, `header right ${col.head.right.toFixed(1)} vs cell right ${col.cell.right.toFixed(1)}, delta ${delta.toFixed(1)}`)
  } else if (col.just === 'center') {
    const delta = Math.abs((col.head.left + col.head.right) / 2 - (col.cell.left + col.cell.right) / 2)
    record('I10', `置中欄「${col.head.text}」標題與內容中線一致`, delta <= 1.5, `delta ${delta.toFixed(1)}`)
  } else {
    const delta = Math.abs(col.head.left - col.cell.left)
    record('I10', `左對齊欄「${col.head.text}」標題與內容左緣一致`, delta <= 1.5, `header left ${col.head.left.toFixed(1)} vs cell left ${col.cell.left.toFixed(1)}, delta ${delta.toFixed(1)}`)
  }
}
// 空轉守衛:選擇器一旦再寫錯就會是「零斷言 = 假綠」,所以明確要求至少量到一欄。
record('I10', '真的量到欄(否則上面的斷言是空轉)', alignReport.length > 0, `量到 ${alignReport.length} 欄`)

// ── I11:欄寬「算一次」——header 與 body 讀同一個整數(2026-09-03 改為 AG Grid v33 模型)──
// 舊模型把分配交給 CSS flex,由瀏覽器在 header 與 body 兩個容器各跑一次,只要可用寬度差一點
// (捲軸、border、取整),`flex-grow:1` 就把差額平均攤到每一欄並逐欄累積(實測 7 欄增量恰為 15/7)。
// 新模型照 AG Grid v33:欄寬由 `distributeColumnWidths` 算一次,header cell 與 body cell 寫**同一個整數**,
// 容器寬差只會變成 header 尾端空白。這條驗的就是那個恆等式,順帶驗兩邊水平捲動範圍相等
// (header 內容尾端補了 `vScrollbarSpacer`,對應 AG Grid `CenterWidthFeature` 的 addSpacer)。
await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-展示--virtual-scroll&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-datatable-header-panel="center"]')
const widthReport = await page.evaluate(() => {
  const hp = document.querySelector('[data-datatable-header-panel="center"]')
  const bp = document.querySelector('[data-datatable-panel="center"]')
  if (!hp || !bp) return null
  const heads = [...hp.querySelectorAll('[role="columnheader"]')]
  const row = [...bp.querySelectorAll('[role="row"]')].find((r) => r.querySelector('[role="gridcell"], [role="cell"]'))
  const cells = row ? [...row.querySelectorAll('[role="gridcell"], [role="cell"]')] : []
  const n = Math.min(heads.length, cells.length)
  let worstWidth = 0
  let worstLeft = 0
  for (let i = 0; i < n; i++) {
    const h = heads[i].getBoundingClientRect()
    const c = cells[i].getBoundingClientRect()
    worstWidth = Math.max(worstWidth, Math.abs(h.width - c.width))
    worstLeft = Math.max(worstLeft, Math.abs(h.left - c.left))
  }
  return {
    columns: n,
    worstWidth,
    worstLeft,
    headerRange: hp.scrollWidth - hp.clientWidth,
    bodyRange: bp.scrollWidth - bp.clientWidth,
    sumWidths: cells.reduce((a, c) => a + c.getBoundingClientRect().width, 0),
    bodyContentWidth: bp.clientWidth,
    hasHorizontalOverflow: bp.scrollWidth > bp.clientWidth,
  }
})
if (!widthReport) {
  record('I11', 'center header/body panel 存在', false, 'panel selector 找不到')
} else {
  record('I11', '真的量到多欄(否則下面的斷言是空轉)', widthReport.columns >= 2, `量到 ${widthReport.columns} 欄`)
  record(
    'I11',
    `${widthReport.columns} 欄的 header 與 cell 寬度是同一個整數`,
    widthReport.worstWidth <= 0.01,
    `worst width delta ${widthReport.worstWidth.toFixed(3)}px`,
  )
  record(
    'I11',
    `${widthReport.columns} 欄的 header 與 cell 左緣全部重合`,
    widthReport.worstLeft <= 0.5,
    `worst left delta ${widthReport.worstLeft.toFixed(2)}px`,
  )
  record(
    'I11',
    'header 與 body 的水平捲動範圍相等(否則捲到最右端 header 會落後一個捲軸寬)',
    Math.abs(widthReport.headerRange - widthReport.bodyRange) <= 0.5,
    `header ${widthReport.headerRange} vs body ${widthReport.bodyRange}`,
  )
  if (!widthReport.hasHorizontalOverflow) {
    record(
      'I11',
      '沒有水平溢出時,欄寬總和正好填滿 body 內容寬',
      Math.abs(widthReport.sumWidths - widthReport.bodyContentWidth) <= 0.5,
      `Σ widths ${widthReport.sumWidths.toFixed(1)} vs body ${widthReport.bodyContentWidth}`,
    )
  }
}

// ── I11c:「算一次」對**三個區**都成立(2026-09-03 補;原本 I11/I11b 只取 panel="center")──
// 對照 AG Grid v33:`HeaderCellCtrl.setupWidth` 與 `CellPositionFeature.onWidthChanged` **不分區**,
// left/center/right 一律寫同一個 `getActualWidth()`;釘選欄只是不參與 flex 分配,不是不走「算一次」。
// 沒有這條斷言時,釘選區可以整區退回舊的 CSS flex 模型而 CI 全綠(那正是 2026-09-03 對照抓到的
// 真缺陷:我先前只把 center 改成算一次)。
await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-展示--pinned-columns&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-datatable-panel="center"]')
const measureRegions = () => {
  const out = []
  for (const region of ['left', 'center', 'right']) {
    const hp = document.querySelector(`[data-datatable-header-panel="${region}"]`)
    const bp = document.querySelector(`[data-datatable-panel="${region}"]`)
    if (!hp || !bp) continue
    const heads = [...hp.querySelectorAll('[role="columnheader"]')]
    const row = [...bp.querySelectorAll('[role="row"]')].find((r) => r.querySelector('[role="gridcell"], [role="cell"]'))
    const cells = row ? [...row.querySelectorAll('[role="gridcell"], [role="cell"]')] : []
    const n = Math.min(heads.length, cells.length)
    let worstWidth = 0
    let worstLeft = 0
    for (let i = 0; i < n; i++) {
      const h = heads[i].getBoundingClientRect()
      const c = cells[i].getBoundingClientRect()
      worstWidth = Math.max(worstWidth, Math.abs(h.width - c.width))
      worstLeft = Math.max(worstLeft, Math.abs(h.left - c.left))
    }
    out.push({ region, columns: n, worstWidth, worstLeft })
  }
  return out
}
const regionReport = await page.evaluate(measureRegions)
// **不能無條件要求每區都有欄**(2026-09-03 抓到會誤紅):`rowActions` 也會產生右區,但那一格
// header 端是沒有 role 的 invisible 佔位 div、body 端才有 `role="cell"` → 右區 `n = 0`。
// 所以改成:有 columnheader 的區才斷言;並用**兩支 story 合起來**保證三區都真的被斷言過
// (`pinned-columns` 給 left+center,`row-drag-interactive` 有 `pinnedRightColumns` 給 right)。
const assertedRegions = new Set()
const recordRegions = (report, storyLabel) => {
  for (const r of report) {
    if (r.columns === 0) continue // 該區只有 rowActions 佔位格,沒有資料欄可比
    assertedRegions.add(r.region)
    record(
      'I11c',
      `${storyLabel} ${r.region} 區 ${r.columns} 欄的 header 與 cell 寬度是同一個整數`,
      r.worstWidth <= 0.01,
      `worst width delta ${r.worstWidth.toFixed(3)}px`,
    )
    record(
      'I11c',
      `${storyLabel} ${r.region} 區 ${r.columns} 欄的 header 與 cell 左緣全部重合`,
      r.worstLeft <= 0.5,
      `worst left delta ${r.worstLeft.toFixed(2)}px`,
    )
  }
}
recordRegions(regionReport, '欄位釘選')

// 右釘選區:`row-drag-interactive`(列拖曳重排(含釘選欄))是全 repo 唯一帶 `pinnedRightColumns` 的 story。
await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-展示--row-drag-interactive&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-datatable-panel="center"]')
recordRegions(await page.evaluate(measureRegions), '列拖曳重排')

// 三區都必須真的被斷言過 —— 少一區就是「該區的欄寬可以整區退回舊模型而 CI 全綠」。
record(
  'I11c',
  'left / center / right 三區都真的被斷言過(否則該區沒人守)',
  ['left', 'center', 'right'].every((r) => assertedRegions.has(r)),
  `已斷言:${[...assertedRegions].sort().join('/') || '無'}`,
)

// ── I11b:造出「捲軸佔版面」後,上面的恆等式仍必須成立 ────────────────────────────
// CI 的 headless Chromium 是 overlay 捲軸(gutter = 0),自然狀態測不到補償分支;
// 用一條 15px 透明右邊框造出與真捲軸同值的量測(`clientWidth` 不含 border、`offsetWidth` 含)。
const SIM_BORDER = 15
const simulated = await page.evaluate(async (border) => {
  const bp = document.querySelector('[data-datatable-panel="center"]')
  const hp = document.querySelector('[data-datatable-header-panel="center"]')
  if (!bp || !hp) return null
  const baseline = bp.offsetWidth - bp.clientWidth
  bp.style.borderRight = `${border}px solid transparent`
  // **等收斂再量,不要用固定延遲**(2026-09-03:固定 250ms 會量在重排中途,CI 因此拿到
  // 「Σ 780 vs body 531」這種前後不一致的快照而誤紅)。改成輪詢到「欄寬總和連續兩次相同」為止。
  const sumNow = () => {
    const r = [...bp.querySelectorAll('[role="row"]')].find((x) => x.querySelector('[role="cell"]'))
    return r ? [...r.querySelectorAll('[role="cell"]')].reduce((a, c) => a + c.getBoundingClientRect().width, 0) : 0
  }
  let last = -1
  let stable = 0
  for (let i = 0; i < 60 && stable < 2; i++) {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    await new Promise((r) => setTimeout(r, 50))
    const cur = Math.round(sumNow())
    stable = cur === last ? stable + 1 : 0
    last = cur
  }
  const heads = [...hp.querySelectorAll('[role="columnheader"]')]
  const row = [...bp.querySelectorAll('[role="row"]')].find((r) => r.querySelector('[role="gridcell"], [role="cell"]'))
  const cells = row ? [...row.querySelectorAll('[role="gridcell"], [role="cell"]')] : []
  const n = Math.min(heads.length, cells.length)
  let worstWidth = 0
  let worstLeft = 0
  for (let i = 0; i < n; i++) {
    const h = heads[i].getBoundingClientRect()
    const c = cells[i].getBoundingClientRect()
    worstWidth = Math.max(worstWidth, Math.abs(h.width - c.width))
    worstLeft = Math.max(worstLeft, Math.abs(h.left - c.left))
  }
  const out = {
    baseline,
    gutter: bp.offsetWidth - bp.clientWidth,
    columns: n,
    worstWidth,
    worstLeft,
    headerRange: hp.scrollWidth - hp.clientWidth,
    bodyRange: bp.scrollWidth - bp.clientWidth,
    sumWidths: cells.reduce((a, c) => a + c.getBoundingClientRect().width, 0),
    bodyContentWidth: bp.clientWidth,
  }
  bp.style.borderRight = ''
  return out
}, SIM_BORDER)
if (!simulated) {
  record('I11b', 'center header/body panel 存在', false, 'panel selector 找不到')
} else {
  record(
    'I11b',
    `造出佔版面的 ${SIM_BORDER}px(捲軸分支確實被走到)`,
    Math.abs(simulated.gutter - (simulated.baseline + SIM_BORDER)) <= 0.5,
    `baseline ${simulated.baseline} + ${SIM_BORDER} → 量到 ${simulated.gutter}`,
  )
  record('I11b', '真的量到多欄(否則下面的斷言是空轉)', simulated.columns >= 2, `量到 ${simulated.columns} 欄`)
  record(
    'I11b',
    '捲軸佔位時 header 與 cell 寬度仍是同一個整數',
    simulated.worstWidth <= 0.01,
    `worst width delta ${simulated.worstWidth.toFixed(3)}px`,
  )
  record(
    'I11b',
    '捲軸佔位時每欄左緣仍全部重合',
    simulated.worstLeft <= 0.5,
    `worst left delta ${simulated.worstLeft.toFixed(2)}px`,
  )
  // **這裡刻意不斷言「Σ 欄寬 == body 內容寬」與「兩邊捲動範圍相等」**(2026-09-03,附實測理由):
  // 這條模擬用的是「加一條透明右邊框」,而 2026-09-03 實測證明 **ResizeObserver 看不到這種變化** ——
  // 在真實 Chrome 上新掛一個 RO 觀察該面板,`clientWidth` 從 1143 → 1128 → 1143 期間它 fire **0 次**
  // (面板的 border-box 一直是 1173 沒變)。所以元件不可能重新量測,Σ 必然停在改動前的值,
  // 這兩條在本模擬下**恆為 false**,斷言它們等於用一個元件看不見的變化去要求它反應。
  // 仍然成立、也仍然被斷言的是上面兩條(header 與 cell 同寬、左緣重合)—— 那才是本模擬要驗的
  // 「兩邊讀同一組整數」不變式,實測 delta 皆為 0。
  // 「捲軸出現/消失卻沒有 React 重繪時補償會過期」這個**產品層**缺陷已登記於
  // `data-table.spec.md` 缺陷表 S,不在這條模擬的職責範圍。
}

// ── I12:水平捲軸只吃掉 center 的高度,pinned 區必須補等高(2026-09-03,同一根因的縱軸孿生)──
// center body 自己有 overflow-x:auto,捲軸佔掉它 15px 高;pinned 區沒有捲軸 →
// 不補的話 pinned 會比 center 多露出一條列(實測 300 vs 285)。AG Grid 是把水平捲軸放到
// 三個 row container 之外(ag-fake-horizontal-scroll 是 .ag-root 的 flex 子項),達成同一個結果;
// 我們留在 center 內、改用等高 padding-bottom 補平(對照 MUI X 的 scrollbar filler 思路)。
// 與 I11b 同樣用透明邊框造出「捲軸佔位」,CI 的 overlay 捲軸環境才走得到補償分支。
await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-展示--pinned-columns&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-datatable-panel="left"]')
const SIM_H_BORDER = 15
const pinnedReport = await page.evaluate(async (border) => {
  const bodies = [...document.querySelectorAll('[data-datatable-panel="center"]')]
  const idx = bodies.length > 1 ? 1 : 0
  const center = bodies[idx]
  const left = [...document.querySelectorAll('[data-datatable-panel="left"]')][idx]
  const right = [...document.querySelectorAll('[data-datatable-panel="right"]')][idx]
  if (!center || !left) return null
  center.style.borderBottom = `${border}px solid transparent`
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  await new Promise((r) => setTimeout(r, 200))
  // clientHeight 已排除 border,所以它就是「裁切邊以內的可視高」——這正是要比的量。
  // (padding 版本量不到:overflow 裁在 padding box,clientHeight 含 padding,列會畫進去。)
  const out = {
    hGutter: center.offsetHeight - center.clientHeight,
    leftPadding: parseFloat(getComputedStyle(left).borderBottomWidth || '0'),
    rightPadding: right ? parseFloat(getComputedStyle(right).borderBottomWidth || '0') : null,
    centerVisible: center.clientHeight,
    leftVisible: left.clientHeight,
    rightVisible: right ? right.clientHeight : null,
    maxScroll: [
      left.scrollHeight - left.clientHeight,
      center.scrollHeight - center.clientHeight,
      right ? right.scrollHeight - right.clientHeight : null,
    ],
  }
  center.style.borderBottom = ''
  return out
}, SIM_H_BORDER)
if (!pinnedReport) {
  record('I12', 'pinned + center body panel 存在', false, 'panel selector 找不到')
} else {
  record('I12', '造出佔版面的水平捲軸高度(補償分支確實被走到)', pinnedReport.hGutter >= SIM_H_BORDER, `量到 ${pinnedReport.hGutter}px`)
  record(
    'I12',
    'pinned 區補的透明下邊框等於 center 被水平捲軸吃掉的高度',
    Math.abs(pinnedReport.leftPadding - pinnedReport.hGutter) <= 0.5,
    `left border-bottom ${pinnedReport.leftPadding} vs hGutter ${pinnedReport.hGutter}`,
  )
  record(
    'I12',
    'pinned 與 center 的裁切邊以內可視列高一致(否則 pinned 會多露出一條列)',
    Math.abs(pinnedReport.leftVisible - pinnedReport.centerVisible) <= 0.5
      && (pinnedReport.rightVisible == null || Math.abs(pinnedReport.rightVisible - pinnedReport.centerVisible) <= 0.5),
    `left ${pinnedReport.leftVisible} / center ${pinnedReport.centerVisible} / right ${pinnedReport.rightVisible}`,
  )
  record(
    'I12',
    '三區可捲動量一致(補的空間不能藏住最後一列)',
    Math.abs(pinnedReport.maxScroll[0] - pinnedReport.maxScroll[1]) <= 0.5
      && (pinnedReport.maxScroll[2] == null || Math.abs(pinnedReport.maxScroll[2] - pinnedReport.maxScroll[1]) <= 0.5),
    `maxScroll ${JSON.stringify(pinnedReport.maxScroll)}`,
  )
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
