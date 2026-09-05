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
import { inflateSync as zlibInflate } from 'node:zlib'
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
  // **不要讓 Playwright 藏捲軸**(2026-09-05 稽核 2-17 / 3-03 / 1-07 / 2-16 / 2-08 的共同根因):
  // headless 啟動時 Playwright 預設無條件帶 `--hide-scrollbars`
  // (node_modules/playwright-core/lib/server/chromium/chromium.js:288-291,playwright-core 1.59.1),
  // Blink 因此一條捲軸都不建 → gutter 恆 0 → 本檔所有「捲軸佔版面」分支(裝飾軌道 I17a/b、讓位帶 I13b、
  // thin 捲軸 I17e)在 CI 從沒被走到,把修法整段還原也全綠。拿掉這個預設參數後 Linux headless Chromium
  // 就畫 classic 捲軸:Aura 主題預設 15px,`scrollbar-width: thin` 取 2/3 → 10px
  // (chromium/src `third_party/blink/renderer/core/scroll/scrollbar_theme_aura.cc`
  //  `kThinProportion = 2.f / 3.f`、`ScrollbarThickness()`)。
  // 既有的透明邊框模擬全部保留,但期望值一律改寫成「注入前 + 注入量」的相對式,真 gutter 存在時照樣成立。
  browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] })
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
// **覆蓋範圍 2026-09-04 從 4 種型別擴到 13 種**(缺陷 T)。原本只跑 RowAutoHeightInlineEdit 的
// string / select / textarea / currency 四種;date / time / person / multiPerson / boolean / url /
// multiSelect / number / tag 的 0-delta **只有推導、沒有斷言過**。`InlineEdit` story 本來就把 13 種
// 型別全部放進可編輯欄(data-table.stories.tsx:625-637),缺的只是把閘指過去 —— 不必新增 story。
const checkDisplayEditStability = async (storyId, cellTypes, waitSelector = '[role="row"][data-row-index]') => {
  await page.goto(`${BASE}/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: 'networkidle' })
  await page.waitForSelector(waitSelector)
  await page.waitForTimeout(500)
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
      // 沒進 edit mode。**只有 boolean 與 url 是設計上就沒有 in-cell 編輯欄位的**,而且那是
      // 程式碼裡明文排除的兩種:`data-table.tsx` 的鍵盤進 edit 判斷寫死
      // `meta.type !== 'boolean' && meta.type !== 'url'`。這兩種標成 SKIP 並印出來,
      // 讓覆蓋範圍是「明示的」而不是「靜默的」;其餘型別沒進 edit 就是真的壞了,照樣紅。
      // (2026-09-04 逐格實測校正:multiSelect / person / multiPerson / date / time **都有**
      //  in-cell Field —— date 會同時開 Popover,但 cell 內仍有 `data-field-mode="edit"`。
      //  原本我憑印象把這五種標成「走 Popover 不適用」,量過才發現是錯的。)
      if (t.noInCellField) {
        console.log(`⏭  I1-4 ${t.label} — 設計上無 in-cell 編輯欄位(data-table.tsx 鍵盤 edit 判斷明文排除),不適用 0-delta 斷言`)
        continue
      }
      record('I1', `${t.label} display↔edit cell width 一致`, false, 'no edit field — I1 真測路徑未進入')
      record('I1-4', t.label, false, 'no edit field')
      continue
    }

    const widthDelta = Math.abs(display.width - edit.cellWidth)
    const heightDelta = Math.abs(display.height - edit.cellHeight)
    const fieldVsCell = Math.abs(edit.cellHeight - edit.fieldHeight)

    // I1:display↔edit cell 寬度一致(cell width = column width,跟 padding/state/mode 無關)
    record('I1', `${t.label} display↔edit cell 寬度一致(>1px = fail)`, widthDelta <= 1, `display ${display.width.toFixed(2)} vs edit ${edit.cellWidth.toFixed(2)}, delta ${widthDelta.toFixed(2)}`)
    record('I2', `${t.label} display↔edit width 0 delta`, widthDelta < 0.5, `delta ${widthDelta.toFixed(2)}`)
    record('I3', `${t.label} display↔edit height 0 delta`, heightDelta < 0.5, `delta ${heightDelta.toFixed(2)}`)
    record('I4', `${t.label} Field 填滿 cell 高度`, fieldVsCell < 1, `cell-field delta ${fieldVsCell.toFixed(2)}`)
  }
}

// (a) 自動行高 + inline edit:原有四種型別 + 長文換行列
await checkDisplayEditStability('design-system-components-datatable-展示--row-auto-height-inline-edit', [
  { row: 0, col: 0, label: 'SKU(string readonly)', skipEdit: true },
  { row: 0, col: 1, label: 'Product(string)' },
  { row: 0, col: 2, label: 'Category(select)' },
  { row: 0, col: 3, label: 'Note(textarea long-wrap)' },
  { row: 0, col: 4, label: 'Price(currency)' },
  { row: 2, col: 3, label: 'Note PRD-0003 long-wrap' },
])

// (b) 固定行高 + inline edit:補齊其餘九種型別(缺陷 T)。欄序見 data-table.stories.tsx:625-637。
await checkDisplayEditStability('design-system-components-datatable-展示--inline-edit', [
  { row: 0, col: 0, label: 'SKU(string readonly)', skipEdit: true },
  { row: 0, col: 1, label: 'Product(string)' },
  { row: 0, col: 2, label: 'Qty(number)' },
  { row: 0, col: 3, label: 'Category(select)' },
  { row: 0, col: 4, label: 'Stock(select)' },
  { row: 0, col: 5, label: 'Tags(multiSelect)' },
  { row: 0, col: 6, label: 'Owner(person)' },
  { row: 0, col: 7, label: 'Reviewers(multiPerson)' },
  { row: 0, col: 8, label: 'In(boolean)', noInCellField: true },
  { row: 0, col: 9, label: 'URL(url)', noInCellField: true },
  { row: 0, col: 10, label: 'Price(currency)' },
  { row: 0, col: 11, label: 'Release(date)' },
  { row: 0, col: 12, label: 'Reminder(time)' },
])

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

// I9 續:`.dtCellGrid`(inlineEdit 模式的 body 欄間線)。2026-09-04 補 —— 原本 I9 只掃釘選面板,
// 而且載入的是非 inlineEdit 的 PinnedColumns story,`.dtCellGrid` 根本不在畫面上,所以它用陰影畫線
// 這件事一直掃不到:表頭欄間線是真元素、正下方 body 是陰影,非整數縮放下粗細會分家。
await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-展示--inline-edit&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('.dtCellGrid')
const cellGridReport = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.dtCellGrid')]
  const shadowed = cells.filter((c) => getComputedStyle(c).boxShadow !== 'none').length
  const withLine = cells.filter((c) => {
    const a = getComputedStyle(c, '::after')
    return a.content !== 'none' && a.width === '1px' && a.backgroundColor !== 'rgba(0, 0, 0, 0)'
  }).length
  const lastChildren = cells.filter((c) => c.matches(':last-child'))
  const lastWithLine = lastChildren.filter((c) => getComputedStyle(c, '::after').content !== 'none').length
  return { total: cells.length, shadowed, withLine, last: lastChildren.length, lastWithLine }
})
record('I9', `.dtCellGrid 存在(${cellGridReport.total} 個)`, cellGridReport.total > 0, 'inlineEdit story 找不到 .dtCellGrid')
record('I9', '.dtCellGrid 無陰影畫線', cellGridReport.shadowed === 0, `${cellGridReport.shadowed} 個仍用 box-shadow 畫線(禁;表頭同欄位置是真元素,會粗細分家)`)
record('I9', '.dtCellGrid 欄間線 = 1px 偽元素', cellGridReport.withLine === cellGridReport.total - cellGridReport.last, `畫線 ${cellGridReport.withLine} vs 應畫 ${cellGridReport.total - cellGridReport.last}`)
record('I9', '.dtCellGrid 每 panel 最右 cell 不重複畫線', cellGridReport.lastWithLine === 0, `${cellGridReport.lastWithLine} 個最右 cell 仍畫線(會與凍結邊界/外框疊成 2px)`)

// ── I10:**表頭一律靠左**,對齊只作用在儲存格內容(2026-09-04 user 拍板)──
// 「header 的規格就是要一致,只有內容會置右」。表頭是結構標籤,一整列標題要對齊同一條左緣;
// 數值右對齊是為了讓位數在**資料之間**縱向比較,標題不是資料、不參與那個比較。
// 這條 2026-09-03 的第一版守的正好是相反的事(要求標題跟著儲存格跑到右邊),那是我未經拍板的
// 擅自改動,連同它一起撤回。現在拆成兩件各自可量的事實:
//   (a) 所有欄位的**標題左緣**落在同一條線(彼此差 ≤1.5px)—— 任何人再把 align 傳回表頭就會紅;
//   (b) 右對齊欄的**儲存格內容右緣**確實貼齊該 cell 的右內緣 —— 內容的對齊不能被順手拿掉。
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
  return heads.slice(0, cells.length).map((h, i) => {
    const hb = h.getBoundingClientRect()
    const cb = cells[i].getBoundingClientRect()
    const cs = getComputedStyle(h)
    const ccs = getComputedStyle(cells[i])
    return {
      headJustify: cs.justifyContent,
      cellJustify: ccs.justifyContent,
      // 標題文字左緣相對於自己 cell 的左內緣 —— 用相對值才能跨欄比較(各欄起點不同)。
      headPadLeft: parseFloat(cs.paddingLeft) || 0,
      headTextOffset: (() => { const t = textRect(h); return t ? t.left - hb.left : null })(),
      cellPadRight: parseFloat(ccs.paddingRight) || 0,
      cellTextRightGap: (() => { const t = textRect(cells[i]); return t ? cb.right - t.right : null })(),
      text: (textRect(h) || {}).text,
    }
  })
})
for (const col of alignReport) {
  if (col.headTextOffset == null) continue
  // (a) 標題一律靠左 = 文字左緣距 cell 左緣 == 該 cell 的左內距(沒有被 justify 推走)
  const drift = Math.abs(col.headTextOffset - col.headPadLeft)
  record('I10', `表頭「${col.text}」靠左(不跟欄位 align 走)`, drift <= 1.5,
    `標題左緣距 cell 左緣 ${col.headTextOffset.toFixed(1)} vs 左內距 ${col.headPadLeft.toFixed(1)}(差 ${drift.toFixed(1)};>1.5 = 對齊又被傳回表頭)`)
  record('I10', `表頭「${col.text}」不使用 justify 對齊`, col.headJustify === 'normal' || col.headJustify === 'flex-start',
    `justify-content=${col.headJustify}(表頭不得出現 flex-end / center)`)
  // (b) 右對齊欄的內容仍要貼齊右內緣
  if (col.cellJustify === 'flex-end' && col.cellTextRightGap != null) {
    const gap = Math.abs(col.cellTextRightGap - col.cellPadRight)
    record('I10', `右對齊欄「${col.text}」的儲存格內容仍貼齊右內緣`, gap <= 1.5,
      `內容右緣距 cell 右緣 ${col.cellTextRightGap.toFixed(1)} vs 右內距 ${col.cellPadRight.toFixed(1)}(差 ${gap.toFixed(1)})`)
  }
}
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
    // 釘選區每一欄還要帶回「模型事實」(缺陷 B,2026-09-05 稽核 2-02 補):只比「header 與 cell 同寬」抓不到
    // 釘選區退回舊 CSS flex 模型 —— 兩個面板寫同一個寬度時,兩邊 flex 各自分配的結果逐欄相同,寬度恆等式
    // 照樣成立。能區分模型的是 `columnSizeStyle` 的 resolvedWidth 出口寫的那組值:`flex: 0 0 w` + `width`
    // + `maxWidth` 都是同一個整數(舊模型是 `flex: 1 1 base`、沒有 maxWidth)。
    const pinned = []
    for (let i = 0; i < n; i++) {
      const h = heads[i].getBoundingClientRect()
      const c = cells[i].getBoundingClientRect()
      worstWidth = Math.max(worstWidth, Math.abs(h.width - c.width))
      worstLeft = Math.max(worstLeft, Math.abs(h.left - c.left))
      if (region !== 'center') {
        pinned.push({
          id: cells[i].getAttribute('data-column-id') || heads[i].getAttribute('data-column-id') || `#${i}`,
          width: c.width,
          headGrow: getComputedStyle(heads[i]).flexGrow,
          cellGrow: getComputedStyle(cells[i]).flexGrow,
          headW: heads[i].style.width, headMax: heads[i].style.maxWidth,
          cellW: cells[i].style.width, cellMax: cells[i].style.maxWidth,
        })
      }
    }
    out.push({ region, columns: n, worstWidth, worstLeft, pinned })
  }
  return out
}
const regionReport = await page.evaluate(measureRegions)
// 釘選欄的基準寬 = story 宣告的 `meta.width`(data-table.stories.tsx `baseColumns`:sku 100 / updatedAt 120;
// 兩支 story 都用 `columnsWithPrice`)。釘選欄不參與 flex 分配,解析寬就是 `round(meta.width)`(spec 不變條件 (6))。
const PINNED_BASE_WIDTH = { sku: 100, updatedAt: 120 }
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
    for (const p of r.pinned) {
      record(
        'I11c',
        `${storyLabel} ${r.region} 區「${p.id}」header/cell 寫絕對整數、不參與 flex 分配(flex-grow 0 + maxWidth;缺陷 B)`,
        p.headGrow === '0' && p.cellGrow === '0'
          && p.headW !== '' && p.headW === p.headMax && p.cellW === p.cellMax && p.headW === p.cellW
          && Number.isInteger(p.width),
        `flex-grow head ${p.headGrow} / cell ${p.cellGrow};inline width/maxWidth head ${p.headW}/${p.headMax} cell ${p.cellW}/${p.cellMax};量到 ${p.width}(退回 flex 1 1 base 就會少 maxWidth)`,
      )
      const expected = PINNED_BASE_WIDTH[p.id]
      if (expected != null) {
        record(
          'I11c',
          `${storyLabel} ${r.region} 區「${p.id}」寬 === round(meta.width) = ${expected}`,
          Math.abs(p.width - expected) <= 0.01,
          `量到 ${p.width}px(釘選欄不參與分配,解析寬就是宣告值)`,
        )
      }
    }
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
// 這支 story(height auto)自然狀態沒有垂直捲軸;而 Playwright headless 預設還會帶 `--hide-scrollbars`
// 把所有捲軸藏掉(啟動處已拿掉,見上方 launch 註解)。不管哪一種,補償分支都要靠刺激才走得到:
// 用一條 15px 透明右邊框造出與真捲軸同型的內容盒縮減(`clientWidth` 不含 border、`offsetWidth` 含)。
// 期望值一律寫「注入前 + 注入量」,真 gutter 存在時也成立。
const SIM_BORDER = 15
const simulated = await page.evaluate(async (border) => {
  const bp = document.querySelector('[data-datatable-panel="center"]')
  const hp = document.querySelector('[data-datatable-header-panel="center"]')
  if (!bp || !hp) return null
  const baseline = bp.offsetWidth - bp.clientWidth
  // 缺陷 I 的橫軸 spacer:元件量的是 `header.clientWidth − body.clientWidth`,寫進 header 內層 wrapper 的
  // `minWidth = centerColsWidth + vScrollbarSpacer`;body 內層 wrapper 的 `minWidth = centerColsWidth`。
  // 兩個 inline 值相減就是 spacer 本身,注入後必須恰好長出 `border`。
  const headInner = hp.firstElementChild
  const bodyInner = bp.querySelector(':scope > div:not([role="presentation"])')
  const spacerBefore = hp.clientWidth - bp.clientWidth
  bp.style.borderRight = `${border}px solid transparent`
  // **等收斂再量,不要用固定延遲**(2026-09-03:固定 250ms 會量在重排中途,CI 因此拿到
  // 「Σ 780 vs body 531」這種前後不一致的快照而誤紅)。改成輪詢到「欄寬總和連續兩次相同」為止。
  const sumNow = () => {
    const r = [...bp.querySelectorAll('[role="row"]')].find((x) => x.querySelector('[role="cell"]'))
    return r ? [...r.querySelectorAll('[role="cell"]')].reduce((a, c) => a + c.getBoundingClientRect().width, 0) : 0
  }
  // 收斂條件同時看 header 內層 minWidth:欄寬總和在溢出時本來就不會變,只看它會太早判「穩定」。
  let last = ''
  let stable = 0
  for (let i = 0; i < 60 && stable < 2; i++) {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    await new Promise((r) => setTimeout(r, 50))
    const cur = `${Math.round(sumNow())}|${headInner ? headInner.style.minWidth : ''}`
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
    spacerBefore,
    spacerAfter: hp.clientWidth - bp.clientWidth,
    headInnerMin: headInner ? parseFloat(headInner.style.minWidth) : null,
    bodyInnerMin: bodyInner ? parseFloat(bodyInner.style.minWidth) : null,
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
  // **2026-09-05 補回捲動範圍與 spacer 的斷言**(稽核 2-09 / 2-19)。2026-09-03 這裡曾寫「RO 看不到透明
  // 邊框造成的變化,所以元件不可能重量、這兩條恆為 false」而刻意不斷言;那個理由在缺陷 S 的寬度哨兵
  // (`width:100%`、0 高,I16 實測會跟著內容盒縮)進來之後已不成立 —— 哨兵的 border-box 真的變了,
  // RO 一定響,元件會重量、重繪。所以現在可以、也必須斷言:注入後 header 與 body 的水平捲動範圍仍相等
  // (缺陷 I 的橫軸 spacer 在 CI 終於有真閘;拿掉 `+ vScrollbarSpacer` 這裡就紅),且 header 內層 minWidth
  // 比 body 內層恰好多出「注入前的 spacer + 注入量」。
  record(
    'I11b',
    `注入 ${SIM_BORDER}px 後 header 與 body 的水平捲動範圍仍相等(缺陷 I 橫軸 spacer 真閘)`,
    Math.abs(simulated.headerRange - simulated.bodyRange) <= 0.5,
    `header ${simulated.headerRange} vs body ${simulated.bodyRange}(spacer ${simulated.spacerBefore} → ${simulated.spacerAfter})`,
  )
  record(
    'I11b',
    `header 內層 minWidth === centerColsWidth + spacer(spacer 恰好長 ${SIM_BORDER})`,
    simulated.headInnerMin != null && simulated.bodyInnerMin != null
      && Math.abs(simulated.headInnerMin - simulated.bodyInnerMin - (simulated.spacerBefore + SIM_BORDER)) <= 0.5,
    `header inner ${simulated.headInnerMin} − body inner ${simulated.bodyInnerMin} = ${simulated.headInnerMin != null && simulated.bodyInnerMin != null ? (simulated.headInnerMin - simulated.bodyInnerMin).toFixed(1) : 'n/a'}(應 ${simulated.spacerBefore} + ${SIM_BORDER};沒跟上 = 補償停在過期值)`,
  )
}

// ── I13:分隔線必須真的「畫」出來,而且橫貫全表 / 頂天立地(2026-09-04)──
// 為什麼這一組要取像素、不能量版面:第一版 I13 比的是 `getComputedStyle(el, '::after').height`
// 與 border-box 高,兩者都是 255 → 斷言通過,但那條線被面板自己的 `overflow:hidden` 裁掉,
// **一個像素都沒畫出來**;同一版也完全沒有「捲動之後線還在不在」這個維度,而表頭底線當時
// 掛在捲動容器內,捲到底時右側 74% 沒有線。兩個真 bug 各自從版面量測的兩個盲點溜過去。
// 這正是 M32「pixel-quantified verify ≠ attribute existence」禁止的那一類,所以改成:
//   I13a 表頭底線沿底緣逐點取像素,scrollLeft=0 與 scrollLeft=max 兩種狀態都要整條一致
//   I13b 凍結邊界線從表頭頂到列區底(**含讓給水平捲軸的那條帶**)逐點取像素,整條一致
//   I13c 線色必須與旁邊的底色可分辨(擋掉「整條都沒畫,取樣點彼此當然一致」的退化通過)

// 最小 PNG 解碼(Chromium 螢幕擷取固定是 8-bit、非交錯;deviceScaleFactor=1 時 CSS px = 裝置 px)。
function decodePng(buf) {
  let off = 8 // 跳過簽章
  let w = 0, h = 0, colorType = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4)
      if (data[8] !== 8) throw new Error(`只支援 8-bit PNG,收到 ${data[8]}`)
      colorType = data[9]
      if (data[12] !== 0) throw new Error('只支援非交錯 PNG')
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (!ch) throw new Error(`只支援 RGB/RGBA,colorType=${colorType}`)
  const raw = zlibInflate(Buffer.concat(idat))
  const out = Buffer.alloc(w * h * ch)
  const stride = w * ch
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0          // 左
      const b = y > 0 ? out[(y - 1) * stride + x] : 0            // 上
      const c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0 // 左上
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[y * stride + x] = v & 0xff
    }
  }
  return { w, h, ch, data: out }
}
const px = (img, x, y) => {
  const i = (Math.round(y) * img.w + Math.round(x)) * img.ch
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}
const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))

await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-展示--pinned-columns&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-datatable-panel="center"]')
await page.waitForTimeout(500)

// 幾何:表頭列群組(底線的宿主)、列區外層(邊界線的宿主)、釘選面板寬。
const geom = await page.evaluate(() => {
  const centers = [...document.querySelectorAll('[data-datatable-panel="center"]')]
  return centers.map((c, i) => {
    const bodyWrap = c.parentElement
    const root = bodyWrap.parentElement
    const headRow = root.querySelector('[role="rowgroup"].dtHeaderRowGroup')
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom } }
    const hl = root.querySelector('[data-datatable-header-panel="left"]')
    const hr = root.querySelector('[data-datatable-header-panel="right"]')
    return {
      table: i,
      root: r(root),
      headRow: headRow ? r(headRow) : null,
      bodyWrap: r(bodyWrap),
      leftW: hl ? Math.round(hl.getBoundingClientRect().width) : 0,
      rightW: hr ? Math.round(hr.getBoundingClientRect().width) : 0,
      maxScroll: c.scrollWidth - c.clientWidth,
    }
  })
})

// 沿一條線逐點取像素,回傳「與第一點的最大色差」與「與旁邊底色的最小色差」。
const scanLine = (img, ox, oy, pts, refPts) => {
  const on = pts.map(([x, y]) => px(img, x - ox, y - oy))
  const off = refPts.map(([x, y]) => px(img, x - ox, y - oy))
  const drift = Math.max(...on.map((p) => dist(p, on[0])))
  const contrast = Math.min(...on.map((p, i) => dist(p, off[i])))
  return { drift, contrast, n: on.length }
}

for (const g of geom) {
  if (!g.headRow) continue
  const shot = async () => decodePng(await page.screenshot({ clip: { x: Math.floor(g.root.x), y: Math.floor(g.root.y), width: Math.ceil(g.root.w), height: Math.ceil(g.root.h) } }))
  const ox = Math.floor(g.root.x), oy = Math.floor(g.root.y)
  const N = 40
  const lerp = (a, b, i) => a + ((b - a) * i) / (N - 1)

  // 沒有水平捲動量時下面的 `scrollLeft=max` 那一態會被 `continue` 掉 —— 那正是表頭底線缺陷現形的狀態,
  // 不能靜默消失(2026-09-05 稽核 1-06 補;同 I11 / I11b 的「真的量到」守衛)。
  record('I13a', `表格 ${g.table} 真的有水平捲動量(否則 scrollLeft=max 那一態是空轉)`, g.maxScroll > 0, `maxScroll ${g.maxScroll}(story 在 2600px 視窗下已不溢出?)`)
  for (const state of ['scrollLeft=0', 'scrollLeft=max']) {
    if (state === 'scrollLeft=max' && g.maxScroll > 0) {
      await page.evaluate((i) => { const c = [...document.querySelectorAll('[data-datatable-panel="center"]')][i]; c.scrollLeft = c.scrollWidth - c.clientWidth }, g.table)
      await page.waitForTimeout(120)
    } else if (state === 'scrollLeft=max') continue
    const img = await shot()
    // I13a 表頭底線:底緣那一列像素,從表格內緣左到內緣右(避開圓角 4px)
    const yLine = g.headRow.bottom - 1
    const onPts = [], offPts = []
    for (let i = 0; i < N; i++) {
      const x = lerp(g.headRow.x + 4, g.headRow.right - 5, i)
      onPts.push([x, yLine]); offPts.push([x, yLine - 4]) // 參照:表頭底色
    }
    const a = scanLine(img, ox, oy, onPts, offPts)
    record('I13a', `表格 ${g.table} 表頭底線整條畫得出來(${state},${a.n} 點)`, a.drift <= 12, `取樣點最大色差 ${a.drift}(>12 = 有一段沒畫;捲動時線若跟著內容走,右側會整段缺)`)
    record('I13c', `表格 ${g.table} 表頭底線與表頭底色可分辨(${state})`, a.contrast >= 4, `最小對比 ${a.contrast}(<4 = 整條都沒畫,取樣點當然彼此一致)`)
  }
  await page.evaluate((i) => { const c = [...document.querySelectorAll('[data-datatable-panel="center"]')][i]; c.scrollLeft = 0 }, g.table)
  await page.waitForTimeout(120)

  // I13b 凍結邊界線:從表頭頂掃到列區底(含捲軸讓位帶),整條必須同色
  // **先把讓位帶造出來再掃**(2026-09-05 稽核 1-07 / 2-16):這條「含讓位帶」的宣稱先前只在有 classic 捲軸的
  // 機器上成立 —— Playwright 預設 `--hide-scrollbars` 下 gutter = 0,釘選面板沒有透明下邊框,線只要畫到
  // padding box 底就過,把宿主搬回會裁切的面板也全綠。做法比照 I11b / I12:在兩個釘選面板既有的
  // 透明下邊框上**再加** 15px(自然狀態有真 gutter 時就是 gutter + 15),列區外層跟著長高,線必須跟到新的
  // 底緣;取樣最後一點落在讓位帶裡,面板宿主的 `::after bottom:0` 在那裡是被裁掉的 → 會紅。
  const SIM_BAND_BORDER = 15
  const band = await page.evaluate(({ i, extra }) => {
    const c = [...document.querySelectorAll('[data-datatable-panel="center"]')][i]
    const wrap = c.parentElement
    const root = wrap.parentElement
    const panels = ['left', 'right'].map((s) => wrap.querySelector(`:scope > [data-datatable-panel="${s}"]`)).filter(Boolean)
    const natural = panels.map((p) => parseFloat(getComputedStyle(p).borderBottomWidth) || 0)
    panels.forEach((p, k) => {
      p.dataset.i13bPrevBorder = p.style.borderBottom
      p.style.borderBottom = `${natural[k] + extra}px solid transparent`
    })
    void wrap.offsetHeight
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom } }
    return {
      natural,
      injected: panels.map((p) => parseFloat(getComputedStyle(p).borderBottomWidth) || 0),
      root: r(root),
      bodyWrap: r(wrap),
    }
  }, { i: g.table, extra: SIM_BAND_BORDER })
  // 非空轉守衛:讓位帶必須真的存在(面板 border-bottom ≥ 注入量),否則「含讓位帶」那段掃的是空氣。
  record('I13b', `表格 ${g.table} 讓位帶真的存在(釘選面板 border-bottom ≥ ${SIM_BAND_BORDER}px)`,
    band.injected.length > 0 && band.injected.every((v) => v >= SIM_BAND_BORDER - 0.5),
    `自然 gutter ${JSON.stringify(band.natural)} → 注入後 ${JSON.stringify(band.injected)}`)
  const img2 = decodePng(await page.screenshot({ clip: { x: Math.floor(band.root.x), y: Math.floor(band.root.y), width: Math.ceil(band.root.w), height: Math.ceil(band.root.h) } }))
  const ox2 = Math.floor(band.root.x), oy2 = Math.floor(band.root.y)
  const top = g.headRow.y + 2, bot = band.bodyWrap.bottom - 2
  for (const [side, lineX, refDx] of [
    ['left', band.bodyWrap.x + g.leftW - 1, -3],
    ['right', band.bodyWrap.right - g.rightW, 3],
  ]) {
    if ((side === 'left' ? g.leftW : g.rightW) === 0) continue
    const onPts = [], offPts = []
    for (let i = 0; i < N; i++) {
      const y = lerp(top, bot, i)
      onPts.push([lineX, y]); offPts.push([lineX + refDx, y])
    }
    const b = scanLine(img2, ox2, oy2, onPts, offPts)
    record('I13b', `表格 ${g.table} ${side} 凍結邊界線從表頭頂畫到列區底(含 ${SIM_BAND_BORDER}px 模擬讓位帶,${b.n} 點)`, b.drift <= 12, `取樣點最大色差 ${b.drift}(>12 = 底部捲軸帶那一段沒畫出來 —— 面板自己 overflow:hidden 會在 padding box 裁掉)`)
    record('I13c', `表格 ${g.table} ${side} 凍結邊界線與相鄰底色可分辨`, b.contrast >= 4, `最小對比 ${b.contrast}`)
  }
  // 還原注入,不讓後面的閘(I12)量到被動過的面板。
  await page.evaluate((i) => {
    const wrap = [...document.querySelectorAll('[data-datatable-panel="center"]')][i].parentElement
    for (const p of wrap.querySelectorAll(':scope > [data-datatable-panel="left"], :scope > [data-datatable-panel="right"]')) {
      p.style.borderBottom = p.dataset.i13bPrevBorder || ''
      delete p.dataset.i13bPrevBorder
    }
  }, g.table)
  await page.waitForTimeout(120)
}

// ── I12:水平捲軸只吃掉 center 的高度,pinned 區必須補等高(2026-09-03,同一根因的縱軸孿生)──
// center body 自己有 overflow-x:auto,捲軸佔掉它 15px 高;pinned 區沒有捲軸 →
// 不補的話 pinned 會比 center 多露出一條列(實測 300 vs 285)。AG Grid 是把水平捲軸放到
// 三個 row container 之外(ag-fake-horizontal-scroll 是 .ag-root 的 flex 子項),達成同一個結果;
// 我們留在 center 內、改用等高 padding-bottom 補平(對照 MUI X 的 scrollbar filler 思路)。
// 與 I11b 同樣用透明邊框造出「捲軸佔位」:啟動已拿掉 Playwright 的 `--hide-scrollbars`,CI 現在有真 gutter,
// 這條注入在真 gutter 之上再加 15px,期望值寫成「注入前 + 注入量」(真 gutter 10 → 25),兩種環境都成立。
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
  const hGutterBefore = center.offsetHeight - center.clientHeight
  center.style.borderBottom = `${border}px solid transparent`
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  await new Promise((r) => setTimeout(r, 200))
  // clientHeight 已排除 border,所以它就是「裁切邊以內的可視高」——這正是要比的量。
  // (padding 版本量不到:overflow 裁在 padding box,clientHeight 含 padding,列會畫進去。)
  const out = {
    hGutterBefore,
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
  record('I12', `造出佔版面的水平捲軸高度(hGutter = 注入前 + ${SIM_H_BORDER};補償分支確實被走到)`,
    Math.abs(pinnedReport.hGutter - (pinnedReport.hGutterBefore + SIM_H_BORDER)) <= 0.5,
    `注入前 ${pinnedReport.hGutterBefore} + ${SIM_H_BORDER} → 量到 ${pinnedReport.hGutter}px`)
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
// ── I14:**自動行高的單行列高 == token**(2026-09-04 補;先前完全沒有閘門)──
// I7 只驗「固定行高 == token」,而自動行高是由內容反推高度,是另一條路徑 —— 它一路靜默多 2px:
// cell 垂直內距的公式假設「內容高 = 1lh」,但 view 態的內容載體(Field / Textarea 的 view × naked)
// 自帶 1px 透明上下框(read↔edit 零跳的幾何佔位),實際內容高是 1lh + 2px。固定行高把它吸收掉
// (高度被 h-table-row-* 釘死 + overflow-hidden),自動行高沒有可吸收的地方,於是 md 單行量到 42 而非 40。
// 公式補上 `- 1px` 後,這條把「單行 = token」變成可量的事實,任何人再把它拿掉就會紅。
await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-展示--row-auto-height-inline-edit&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[role="cell"]')
for (const size of ['sm', 'md', 'lg']) {
  const r = await page.evaluate((sz) => {
    const t = document.querySelector('[role="table"]')
    const host = t.closest('[data-table-size]') || t
    const prev = host.getAttribute('data-table-size')
    host.setAttribute('data-table-size', sz)
    // token 是 rem,要先讓瀏覽器解析成 px,不能直接 parseFloat 字面值。
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden'
    probe.style.height = getComputedStyle(t).getPropertyValue(`--table-row-${sz}`)
    t.appendChild(probe)
    const tokenPx = probe.getBoundingClientRect().height
    probe.remove()
    const rows = [...t.querySelectorAll('[role="row"]')].filter((x) => x.querySelector('[role="cell"]'))
    const heights = rows.map((x) => x.getBoundingClientRect().height)
    const single = Math.min(...heights) // 單行列 = 最矮那列(多行列更高;末列無下分隔線)
    if (prev) host.setAttribute('data-table-size', prev)
    return { tokenPx: +tokenPx.toFixed(2), single: +single.toFixed(2), all: heights.map((h) => +h.toFixed(1)) }
  }, size)
  record('I14', `自動行高單行列高 @${size} == --table-row-${size}(${r.tokenPx}px)`,
    Math.abs(r.single - r.tokenPx) <= 1,
    `got ${r.single}px(應 ${r.tokenPx};列高分佈 ${r.all.join('/')}。多出來的 2px = 內容載體的透明框沒被 cell-py 公式扣掉)`)
}

/* ── I15:列高單一真相來源(缺陷 F)—— 同一列在三區必須等高 ────────────────────────
 * 兩容器架構下同一列是三個獨立 DOM row;auto-height 時每區只看得到自己那幾欄。
 * 撐高的 Note 欄在 center、釘選的 SKU 在 left、Row Actions 在 right —— 這是缺陷唯一會現形的組合。
 * 量的是 `getBoundingClientRect().height`(不是 offsetHeight:後者取整會把 0.5px 的錯位抹成「已對齊」)。
 */
await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-展示--row-auto-height&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-datatable-panel="left"]')
const rowHeightReport = await page.evaluate(() => {
  // 掃**每一張**有三個區的表(第 3 個 pane 是非虛擬、第 4 個是虛擬 50 筆),不是只看第一張。
  const tables = [...document.querySelectorAll('[data-datatable-panel="center"]')].map((c) => c.parentElement)
  const out = []
  for (const w of tables) {
    const byIndex = new Map()
    let regions = 0
    for (const side of ['left', 'center', 'right']) {
      const p = w.querySelector(`:scope > [data-datatable-panel="${side}"]`)
      if (!p) continue
      regions += 1
      for (const row of p.querySelectorAll('[data-row-auto][data-row-index]')) {
        const i = Number(row.getAttribute('data-row-index'))
        // getBoundingClientRect 不是 offsetHeight:後者取整,三區各差 0.5px 時會被抹成「已對齊」的假象。
        const h = row.getBoundingClientRect().height
        if (!byIndex.has(i)) byIndex.set(i, {})
        byIndex.get(i)[side] = +h.toFixed(2)
      }
    }
    if (regions < 2 || byIndex.size === 0) continue
    const rows = [...byIndex.entries()].map(([i, m]) => {
      const hs = Object.values(m)
      return { i, ...m, spread: +(Math.max(...hs) - Math.min(...hs)).toFixed(2), n: hs.length }
    })
    const allH = rows.flatMap((r) => ['left', 'center', 'right'].map((k) => r[k]).filter((v) => v != null))
    out.push({
      regions,
      nRows: rows.length,
      distinctHeights: [...new Set(allH)].length,
      worst: rows.reduce((a, r) => (r.spread > a.spread ? r : a), { spread: -1 }),
    })
  }
  return out
})
record('I15', '真的有多區 × auto-height 的表可量(否則下面的斷言是空轉)', rowHeightReport.length >= 2,
  `量到 ${rowHeightReport.length} 張(story 第 3 pane 非虛擬 + 第 4 pane 虛擬 50 筆)`)
rowHeightReport.forEach((t, i) => {
  record('I15', `表 ${i + 1}:量到 ${t.regions} 個區、${t.nRows} 列 auto-height 列`, t.regions === 3 && t.nRows > 0,
    JSON.stringify({ regions: t.regions, nRows: t.nRows }))
  record('I15', `表 ${i + 1}:真的有被撐高的列(否則全表同高,對齊斷言恆真)`, t.distinctHeights >= 2,
    `列高種類 ${t.distinctHeights}(全部一樣 = wrap 沒生效,這張表沒在測它該測的東西)`)
  record('I15', `表 ${i + 1}:同一列在三區等高(最差 ${t.worst.spread}px)`, t.worst.spread <= 0.5,
    `最差在第 ${t.worst.i} 列:${JSON.stringify(t.worst)}(>0.5 = 三區各算各的高度,同一列在左右釘選區與中段錯開)`)
})

/* ── I16:缺陷 S 的寬度觀測點 —— 它必須真的跟著「內容盒」走 ──────────────────────────
 * 垂直捲軸出現時 center body 的 border-box 一點都沒變(捲軸從內部吃掉空間),所以觀察 body 本身的
 * ResizeObserver 一次都不會響(2026-09-03 實測 fire 0 次)。補償因此只剩「React 重繪後量一次」,
 * 圖片載入撐高列 / 字體 swap / 動畫結束這些不經 React 的變化會讓它停在過期值。
 *
 * 解法是放一個 `width:100%` 的哨兵 —— 它的 border-box **就是** clientWidth,所以捲軸一出現它就變。
 * 這條閘驗的是那個等式本身,不是「有沒有加那個 class」。
 *
 * **不依賴真捲軸**:Playwright headless 預設帶 `--hide-scrollbars`(啟動處已拿掉),等真垂直捲軸出現才驗
 * 在沒有垂直溢出的表上也會變成空轉。改成注入一條 20px 的透明右邊框 —— `clientWidth` 不含 border,所以它
 * 造出的是與捲軸**同型**的內容盒縮減(這也是本檔 I11b / I12 既有的模擬手法)。
 *
 * **驗的是結果,不是 CSS 前提**(2026-09-05 稽核 2-19):第一版只在同一個同步 task 裡「注入 → 量 → 還原 → 量」,
 * 哨兵寬 === clientWidth 這種 `width:100%` 的 CSS 事實在有沒有 `ro.observe(sentinel)` 時都成立,RO 回呼根本
 * 沒機會在兩次量測之間跑 —— 把整條機制拿掉也全綠。現在注入後**等到 RO → 重量 → 重繪收斂**,斷言 header
 * 內層 wrapper 的 `minWidth`(= centerColsWidth + vScrollbarSpacer)不經任何 React 事件(列數不變)就恰好長
 * 20px,還原後回到原值;補償停在過期值就紅。
 */
await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-展示--pinned-columns&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-datatable-hscroll]')
await page.waitForTimeout(400)
const SIM_V_BORDER = 20
const sentinelReport = await page.evaluate(async (simPx) => {
  // rAF 在被隱藏/節流的頁籤裡不會觸發,所以跟計時器賽跑:哪個先到算哪個。
  // (只用 rAF 會在隱藏頁籤裡永遠掛住;只用計時器則在可見頁籤裡可能量在重繪之前。)
  const frames = () => new Promise((r) => {
    let done = false
    const fin = () => { if (!done) { done = true; r() } }
    requestAnimationFrame(() => requestAnimationFrame(fin))
    setTimeout(fin, 120)
  })
  // 等「header 內層 minWidth 連續兩次相同」—— RO 回呼 → setState → 重繪不是同步的,固定延遲會量在中途。
  const settle = async (read) => {
    let last = null, stable = 0
    for (let i = 0; i < 40 && stable < 2; i++) {
      await frames(); await new Promise((r) => setTimeout(r, 30))
      const cur = read(); stable = cur === last ? stable + 1 : 0; last = cur
    }
  }
  const out = []
  for (const b of document.querySelectorAll('[data-datatable-hscroll]')) {
    const sen = b.querySelector(':scope > [role="presentation"]')
    if (!sen) { out.push({ hasSentinel: false }); continue }
    const headInner = b.closest('[role="table"]')?.querySelector('[data-datatable-header-panel="center"]')?.firstElementChild
    const headMin = () => (headInner ? parseFloat(headInner.style.minWidth) || 0 : null)
    const rows = () => b.querySelectorAll('[role="row"]').length
    const senW = () => +sen.getBoundingClientRect().width.toFixed(2)
    const natural = { sen: senW(), client: b.clientWidth, h: sen.getBoundingClientRect().height, headMin: headMin(), rows: rows() }
    // 造出與「垂直捲軸出現」同型的內容盒縮減
    const prev = b.style.borderRight
    b.style.borderRight = `${simPx}px solid transparent`
    void b.offsetWidth
    // 同步那一刻:CSS 事實(哨兵寬跟著 clientWidth)
    const shrunk = { sen: senW(), client: b.clientWidth }
    // 等 RO → 重量 → 重繪收斂:結果(header 內層 minWidth 跟上)
    await settle(headMin)
    const settled = { headMin: headMin(), rows: rows() }
    b.style.borderRight = prev
    void b.offsetWidth
    const restored = { sen: senW(), client: b.clientWidth }
    await settle(headMin)
    restored.headMin = headMin()
    out.push({ hasSentinel: true, ariaHidden: sen.getAttribute('aria-hidden') !== null, hasHeader: headInner != null, natural, shrunk, settled, restored })
  }
  return out
}, SIM_V_BORDER)

record('I16', `真的量到 center body(否則下面的斷言是空轉)`, sentinelReport.length > 0, `量到 ${sentinelReport.length} 個`)
sentinelReport.forEach((r, i) => {
  record('I16', `表 ${i + 1}:寬度哨兵存在、0 高、不進無障礙樹`, r.hasSentinel && r.natural?.h === 0 && r.ariaHidden,
    JSON.stringify({ hasSentinel: r.hasSentinel, h: r.natural?.h, ariaHidden: r.ariaHidden }))
  if (!r.hasSentinel) return
  record('I16', `表 ${i + 1}:哨兵寬 === 內容盒寬(自然狀態)`, Math.abs(r.natural.sen - r.natural.client) <= 0.5,
    `sentinel ${r.natural.sen} vs clientWidth ${r.natural.client}`)
  record('I16', `表 ${i + 1}:內容盒縮 ${SIM_V_BORDER}px 時哨兵跟著縮(= 捲軸出現時 RO 會響)`,
    Math.abs(r.shrunk.sen - r.shrunk.client) <= 0.5 && Math.abs(r.natural.sen - r.shrunk.sen - SIM_V_BORDER) <= 0.5,
    `${r.natural.sen} → ${r.shrunk.sen}(clientWidth ${r.natural.client} → ${r.shrunk.client})`)
  record('I16', `表 ${i + 1}:還原後回到原值(哨兵不會卡住)`, Math.abs(r.restored.sen - r.natural.sen) <= 0.5,
    `${r.shrunk.sen} → ${r.restored.sen}(原 ${r.natural.sen})`)
  // 缺陷 S 的結果本身:補償要不經 React 事件就跟上(列數不變 = 沒有任何 React 狀態變化推動重量)。
  record('I16', `表 ${i + 1}:內容盒縮 ${SIM_V_BORDER}px 後 header 內層 minWidth 不經 React 事件就長 ${SIM_V_BORDER}(缺陷 S 結果)`,
    r.hasHeader && Math.abs(r.settled.headMin - r.natural.headMin - SIM_V_BORDER) <= 0.5 && r.settled.rows === r.natural.rows,
    `header inner minWidth ${r.natural.headMin} → ${r.settled.headMin}(應 +${SIM_V_BORDER});列數 ${r.natural.rows} → ${r.settled.rows}(沒跟上 = RO 沒響、補償停在過期值)`)
  record('I16', `表 ${i + 1}:還原後 header 內層 minWidth 回到原值`,
    r.hasHeader && Math.abs(r.restored.headMin - r.natural.headMin) <= 0.5,
    `${r.settled.headMin} → ${r.restored.headMin}(原 ${r.natural.headMin})`)
})

/* ── I17:捲軸帶與釘選欄滾輪(2026-09-05)────────────────────────────────────────
 * 兩個都是實測抓到、而且都是「看起來有做、其實沒作用」的那一類:
 *   (a) 裝飾軌道原本掛在釘選面板**裡面** → `absolute; bottom:0` 解析到 padding box,而讓位用的
 *       border 在 padding box 外面 → 軌道畫在真捲軸上方 11px;面板又是捲動盒 → 一捲就飄。
 *       搬到不裁切也不捲動的外層之後兩個成因同時消失。
 *   (b) 釘選欄是 `overflow:hidden`,滾輪事件在它身上什麼都不會發生 → 使用者把游標放在
 *       SKU / 名稱 / ⋮ 上滾輪,表格完全不動。轉發到 center body。
 * 滾輪那半(I17c/d)不依賴真捲軸;**軌道那半(I17a/b)需要 classic 捲軸環境** —— Playwright headless 預設
 * `--hide-scrollbars` 會讓 gutter 恆 0、軌道不渲染,先前這裡只印一行 ⏭ 靜默跳過,CI 從沒真的斷言過
 * (2026-09-05 稽核 2-17 / 3-03)。啟動處已拿掉該參數,CI 一定走得到;gutter = 0 只剩本機 overlay 捲軸機器,
 * 改記成 `SKIPPED-ENV` 的一條紀錄而不是 console.log,報表看得見「這半沒驗」。
 * 順帶守缺陷 H(I17e):center body 的捲軸必須是 `scrollbar-width: thin`、佔位 < 15px —— 把從未生效的
 * `::-webkit-scrollbar` 客製加回去、或改回 `auto`,這裡就紅(Chromium Aura:預設 15 × 2/3 = 10)。
 */
await page.goto(`${BASE}/iframe.html?id=design-system-components-datatable-展示--pinned-columns&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('[data-datatable-panel="left"]')
await page.waitForTimeout(400)
const scrollUxReport = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const out = []
  for (const cb of document.querySelectorAll('[data-datatable-hscroll]')) {
    const wrap = cb.parentElement
    const left = wrap.querySelector(':scope > [data-datatable-panel="left"]')
    const troughs = [...wrap.querySelectorAll(':scope > [aria-hidden]')].filter((e) => String(e.className).includes('overflow-x-scroll'))
    const gutter = cb.offsetHeight - cb.clientHeight
    const scrollbarWidth = getComputedStyle(cb).scrollbarWidth
    const bandTop = cb.getBoundingClientRect().bottom - gutter
    cb.scrollTop = 0; cb.dispatchEvent(new Event('scroll')); await sleep(30)
    const before = troughs.map((t) => +t.getBoundingClientRect().top.toFixed(2))
    cb.scrollTop = 200; cb.dispatchEvent(new Event('scroll')); await sleep(60)
    const after = troughs.map((t) => +t.getBoundingClientRect().top.toFixed(2))
    cb.scrollTop = 0; cb.dispatchEvent(new Event('scroll')); await sleep(30)
    // 滾輪轉發:只有 center 真的能垂直捲時才該生效(捲不動時要讓事件冒泡給頁面)
    const canScrollY = cb.scrollHeight > cb.clientHeight
    const canScrollX = cb.scrollWidth > cb.clientWidth
    const right = wrap.querySelector(':scope > [data-datatable-panel="right"]')
    let wheelDelta = null, wheelRight = null, wheelShift = null
    if (left && canScrollY) {
      cb.scrollTop = 0
      left.dispatchEvent(new WheelEvent('wheel', { deltaY: 180, bubbles: true, cancelable: true }))
      await sleep(50)
      wheelDelta = cb.scrollTop
      cb.scrollTop = 0; cb.dispatchEvent(new Event('scroll'))
    }
    // 右側面板是另一個監聽,不能只驗左側(2026-09-05 稽核:先前只驗左側 = 右側監聽拿掉也全綠)
    if (right && canScrollY) {
      cb.scrollTop = 0
      right.dispatchEvent(new WheelEvent('wheel', { deltaY: 180, bubbles: true, cancelable: true }))
      await sleep(50)
      wheelRight = cb.scrollTop
      cb.scrollTop = 0; cb.dispatchEvent(new Event('scroll'))
    }
    // Shift+滾輪 = 橫向(Firefox / Windows 給 deltaY + shiftKey):要跟 center body 原生與 v33 一致
    if (left && canScrollX) {
      cb.scrollLeft = 0; cb.scrollTop = 0
      left.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, deltaX: 0, shiftKey: true, bubbles: true, cancelable: true }))
      await sleep(50)
      wheelShift = { x: cb.scrollLeft, y: cb.scrollTop }
      cb.scrollLeft = 0; cb.scrollTop = 0; cb.dispatchEvent(new Event('scroll'))
    }
    out.push({
      gutter, scrollbarWidth, troughs: troughs.length,
      aligned: troughs.every((t) => Math.abs(t.getBoundingClientRect().top - bandTop) <= 0.5),
      stable: JSON.stringify(before) === JSON.stringify(after),
      canScrollY, canScrollX, wheelDelta, wheelRight, wheelShift,
    })
  }
  return out
})
record('I17', `真的量到 center body(否則下面的斷言是空轉)`, scrollUxReport.length > 0, `量到 ${scrollUxReport.length} 張表`)
scrollUxReport.forEach((r, i) => {
  if (r.gutter > 0) {
    record('I17a', `表 ${i + 1}:裝飾軌道與真捲軸帶同一條線(gutter ${r.gutter}px)`, r.troughs > 0 && r.aligned,
      `軌道 ${r.troughs} 條,對齊 ${r.aligned}(掛錯層會差一個 gutter 的高度)`)
    record('I17b', `表 ${i + 1}:捲動後軌道不飄`, r.stable, '掛在會捲動的盒子裡就會跟著跑掉')
    record('I17e', `表 ${i + 1}:center body 捲軸 = scrollbar-width:thin 且佔位 < 15px(缺陷 H)`,
      r.scrollbarWidth === 'thin' && r.gutter < 15,
      `computed scrollbar-width=${r.scrollbarWidth},gutter ${r.gutter}px(thin 應 < 15;=15 表示 webkit 客製或 auto 回來了)`)
  } else {
    // 只剩本機 overlay 捲軸機器會走到這裡(CI 已拿掉 --hide-scrollbars)。記成看得見的 SKIPPED-ENV,不靜默。
    record('I17a', `SKIPPED-ENV 表 ${i + 1}:本環境捲軸不佔版面(gutter 0),軌道不渲染 —— 軌道對齊未驗,請在 classic 捲軸環境補驗`, true)
    record('I17b', `SKIPPED-ENV 表 ${i + 1}:同上,捲動後軌道不飄未驗`, true)
    record('I17e', `SKIPPED-ENV 表 ${i + 1}:同上,thin 捲軸佔位未驗`, true)
  }
  if (r.canScrollY) {
    record('I17c', `表 ${i + 1}:左釘選欄滾輪轉發到 center`, r.wheelDelta === 180,
      `wheel(0,180) 之後 center scrollTop = ${r.wheelDelta}(0 = 釘選欄吃不到滾輪)`)
    if (r.wheelRight !== null) {
      record('I17c', `表 ${i + 1}:右釘選欄滾輪轉發到 center`, r.wheelRight === 180,
        `wheel(0,180) 之後 center scrollTop = ${r.wheelRight}`)
    }
  } else {
    console.log(`⏭  I17c 表 ${i + 1} — center 沒有垂直溢出,滾輪本來就該冒泡給頁面,不適用`)
  }
  if (r.wheelShift) {
    record('I17d', `表 ${i + 1}:釘選欄 Shift+滾輪 = 橫向(與 center 原生、v33 gridBodyCtrl.ts#L394-L411 同義)`,
      r.wheelShift.x === 120 && r.wheelShift.y === 0,
      `shift+wheel(0,120) 之後 center scrollLeft = ${r.wheelShift.x} / scrollTop = ${r.wheelShift.y}(應 120 / 0)`)
  }
})

/* ── I18 / I19:次要區導回 center、程式化同步不回彈(2026-09-05 稽核補閘)────────────────
 * 缺陷 C(次要區被瀏覽器捲動要導回 center)與缺陷 γ(程式化寫入不得回推 center)先前都只有
 * 手動 Chrome 實測 —— 把 onSecondaryScroll 或 writtenRef 整段拿掉,所有既有閘照樣全綠。
 * 這裡量 scrollLeft / scrollTop 的數值,不看屬性。頁籤隱藏時瀏覽器不派發 scroll 事件,所以每次寫入後
 * 手動 dispatch,並等兩幀讓 React 的 onScroll 跑完。
 */
const syncReport = await page.evaluate(async () => {
  // rAF 在被隱藏/節流的頁籤裡不會觸發,所以跟計時器賽跑:哪個先到算哪個。
  // (只用 rAF 會在隱藏頁籤裡永遠掛住;只用計時器則在可見頁籤裡可能量在重繪之前。)
  const frames = () => new Promise((r) => {
    let done = false
    const fin = () => { if (!done) { done = true; r() } }
    requestAnimationFrame(() => requestAnimationFrame(fin))
    setTimeout(fin, 120)
  })
  // **只有在瀏覽器沒有自己送 scroll 事件時才補送一顆**(2026-09-05 CI 紅燈修正)。
  // 隱藏頁籤不派發 scroll 事件,所以本檔原本一律手動補送;但 CI 的頁籤是可見的,瀏覽器**會**送 ——
  // 兩顆疊起來就變成同一次寫入產生兩個事件。元件的防回彈守衛用「一次性紀錄」擋第一顆(正確),
  // 第二顆就沒有紀錄可比對,於是把 header 被夾過的值推回 center,造出一個現實中不存在的失敗
  // (CI job 101317387250:I19b center 382 應 392)。真實瀏覽器一次寫入只會有一個事件。
  const kick = async (el) => {
    let saw = false
    const mark = () => { saw = true }
    el.addEventListener('scroll', mark, { once: true })
    await frames()
    if (!saw) el.dispatchEvent(new Event('scroll'))
    el.removeEventListener('scroll', mark)
    await frames()
  }
  const out = []
  for (const cb of document.querySelectorAll('[data-datatable-hscroll]')) {
    const wrap = cb.parentElement
    const left = wrap.querySelector(':scope > [data-datatable-panel="left"]')
    const right = wrap.querySelector(':scope > [data-datatable-panel="right"]')
    const header = cb.closest('[role="table"]')?.querySelector('[data-datatable-header-panel="center"]')
    const r = { canX: cb.scrollWidth > cb.clientWidth, canY: cb.scrollHeight > cb.clientHeight }
    if (r.canX && header) {
      cb.scrollLeft = 0; await kick(cb)
      header.scrollLeft = 200; await kick(header)
      r.headerRedirect = { center: cb.scrollLeft, header: header.scrollLeft }
      const max = cb.scrollWidth - cb.clientWidth
      cb.scrollLeft = max; await kick(cb); await kick(header)
      r.noBounce = { max, center: cb.scrollLeft, header: header.scrollLeft }
      // 把 header 的可捲範圍縮小 40px(縮它的內容盒,不碰 body,才不會被補償邏輯抵消):
      // center 捲到 max → header 被夾在 max−40 → 那一筆事件值 = 被夾後的值 → 必須被認出並吞掉,center 不得被推回
      const inner = header.firstElementChild
      const prevMin = inner.style.minWidth
      inner.style.minWidth = `${inner.getBoundingClientRect().width - 40}px`
      cb.scrollLeft = 0; await kick(cb)
      cb.scrollLeft = max; await kick(cb); await kick(header)
      r.mismatch = { center: cb.scrollLeft, expected: max, header: header.scrollLeft }
      inner.style.minWidth = prevMin
      cb.scrollLeft = 0; await kick(cb)
    }
    if (r.canY && left) {
      cb.scrollTop = 0; await kick(cb)
      left.scrollTop = 300; await kick(left)
      // 導回後 center 自己的 scroll 事件由瀏覽器派發(隱藏頁籤不派發,故手動補一次),右側才會跟上
      await kick(cb)
      r.leftRedirect = { center: cb.scrollTop, left: left.scrollTop, right: right ? right.scrollTop : null }
      cb.scrollTop = 0; await kick(cb)
    }
    out.push(r)
  }
  return out
})
record('I18', `真的量到 center body(否則下面的斷言是空轉)`, syncReport.length > 0, `量到 ${syncReport.length} 張表`)
syncReport.forEach((r, i) => {
  if (r.headerRedirect) {
    record('I18a', `表 ${i + 1}:header 被捲動 200 → 導回 center(缺陷 C)`,
      r.headerRedirect.center === 200 && r.headerRedirect.header === 200,
      `center ${r.headerRedirect.center} / header ${r.headerRedirect.header}(應 200 / 200)`)
    record('I19a', `表 ${i + 1}:center 捲到最右不回彈,header 跟上`,
      r.noBounce.center === r.noBounce.max && r.noBounce.header === r.noBounce.max,
      `max ${r.noBounce.max}:center ${r.noBounce.center} / header ${r.noBounce.header}`)
    record('I19b', `表 ${i + 1}:header 可捲範圍被縮小時,被夾過的那一筆被吞掉、center 不被推回(缺陷 γ)`,
      r.mismatch.center === r.mismatch.expected,
      `center ${r.mismatch.center}(應停在 ${r.mismatch.expected};header 被夾在 ${r.mismatch.header})`)
  } else {
    console.log(`⏭  I18a/I19 表 ${i + 1} — center 沒有水平溢出,不適用`)
  }
  if (r.leftRedirect) {
    record('I18b', `表 ${i + 1}:左釘選欄被捲動 300 → 導回 center 並校準右側(缺陷 C)`,
      r.leftRedirect.center === 300 && (r.leftRedirect.right === null || r.leftRedirect.right === 300),
      `center ${r.leftRedirect.center} / right ${r.leftRedirect.right}(應 300 / 300)`)
  } else {
    console.log(`⏭  I18b 表 ${i + 1} — center 沒有垂直溢出,不適用`)
  }
})

/* ── I20–I26:2026-09-05 對抗式稽核補閘(缺陷 E / A / N / L / T + 一-04 / 一-05)────────────
 * 共同背景:這七條「已修」的修正本身都在 invariant 層,但**沒有任何一條有 runtime 閘**——把修正整段
 * revert,既有 I1–I19 全綠(稽核 verdict:unverified-or-vacuous-test)。以下每條都量 rect / computed
 * style 的數值(M32:pixel-quantified ≠ attribute existence),並各帶「真的量到目標」守衛防空轉。
 * 共用工具:`--neutral-hover` 等 token 的期望值不寫死,改用同一 scope 內的 probe 元素解析出 rgb 再比。
 */
const I20_PLUS_STORY = (name) => `${BASE}/iframe.html?id=design-system-components-datatable-展示--${name}&viewMode=story`
const rectMid = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })

/* ── I20:釘選欄 header 的 hover ⌄ / 排序箭頭**不得**改變面板寬與 center 欄位版面(缺陷 E)──
 * 根 invariant:釘選面板寬是「Σ 該區解析欄寬」算出來的常數(data-table.tsx `panelWidth`,對照 AG Grid
 * v33.3.2 `pinnedColumnService.ts#L166-L190` `setupHeaderPinnedWidth` 由 `leftWidth`/`rightWidth` 寫常數:
 * https://raw.githubusercontent.com/ag-grid/ag-grid/v33.3.2/packages/ag-grid-community/src/pinnedColumns/pinnedColumnService.ts),
 * header 內容的固有寬(含 hover 才出現的 ⌄、排序後才出現的箭頭)不得參與版面。修前是「量 header 面板
 * offsetWidth → 灌給 body」,hover 一下 center 每欄就重排。這裡真的 hover、真的排序,前後逐欄比 rect。
 * 守衛:⌄ 必須真的顯出來(rect 寬 > 0)、排序箭頭 svg 必須真的出現,否則量到的只是靜止狀態(= I11c 已有)。
 */
const snapPinnedRegion = (sideArg) => {
  const hp = document.querySelector(`[data-datatable-header-panel="${sideArg}"]`)
  if (!hp) return null
  const root = hp.closest('[role="table"]')
  const bp = root.querySelector(`[data-datatable-panel="${sideArg}"]`)
  const chp = root.querySelector('[data-datatable-header-panel="center"]')
  const cbp = root.querySelector('[data-datatable-panel="center"]')
  const rects = (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [+r.left.toFixed(2), +r.width.toFixed(2)] })
  const row = [...cbp.querySelectorAll('[role="row"]')].find((r) => r.querySelector('[role="cell"]'))
  const firstHead = hp.querySelector('[role="columnheader"]')
  const menuBtn = firstHead?.querySelector('[aria-label$="欄位選單"]')
  const sortIcon = firstHead?.querySelector('[role="button"] svg')
  const hr = firstHead?.getBoundingClientRect()
  const sortZone = firstHead?.querySelector('[role="button"]')?.getBoundingClientRect()
  return {
    panelHeaderW: +hp.getBoundingClientRect().width.toFixed(2),
    panelBodyW: +bp.getBoundingClientRect().width.toFixed(2),
    centerHeadLeft: +chp.getBoundingClientRect().left.toFixed(2),
    heads: rects([...chp.querySelectorAll('[role="columnheader"]')]),
    cells: rects(row ? [...row.querySelectorAll('[role="cell"]')] : []),
    firstHead: hr ? { left: hr.left, top: hr.top, width: hr.width, height: hr.height } : null,
    sortZone: sortZone ? { left: sortZone.left, top: sortZone.top, width: sortZone.width, height: sortZone.height } : null,
    menuW: menuBtn ? +menuBtn.getBoundingClientRect().width.toFixed(2) : 0,
    sortIconW: sortIcon ? +sortIcon.getBoundingClientRect().width.toFixed(2) : 0,
    ariaSort: firstHead?.getAttribute('aria-sort') ?? null,
  }
}
const worstDelta = (a, b) => {
  if (a.length !== b.length) return Infinity
  let worst = 0
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i][0] - b[i][0]), Math.abs(a[i][1] - b[i][1]))
  return worst
}
const assertPinnedHeaderStable = async (storyName, side, label) => {
  await page.goto(I20_PLUS_STORY(storyName), { waitUntil: 'networkidle' })
  await page.waitForSelector(`[data-datatable-header-panel="${side}"]`)
  await page.waitForTimeout(400)
  // 先把游標停到表格外,確保 baseline 是「沒有 hover」的靜止狀態
  await page.mouse.move(5, 5)
  await page.waitForTimeout(150)
  const base = await page.evaluate(snapPinnedRegion, side)
  if (!base || !base.firstHead) {
    record('I20', `${label}:${side} 釘選 header 存在`, false, 'header panel / columnheader 找不到(I20 真測路徑未進入)')
    return
  }
  record('I20', `${label}:真的量到 center 多欄(否則下面的斷言是空轉)`, base.heads.length >= 2 && base.cells.length >= 2, `heads ${base.heads.length} / cells ${base.cells.length}`)
  // (1) hover 第一個釘選 columnheader → ⌄ 顯出來 → 面板寬與 center 每欄 rect 必須一個像素都不動
  const m = rectMid(base.firstHead)
  await page.mouse.move(m.x, m.y)
  await page.waitForTimeout(250)
  const hovered = await page.evaluate(snapPinnedRegion, side)
  record('I20', `${label}:hover 後 ⌄ 真的顯示出來(否則沒測到 hover 元素)`, hovered.menuW > 0, `⌄ rect 寬 ${hovered.menuW}(0 = 沒顯示 / 選擇器沒命中)`)
  record('I20', `${label}:hover ⌄ 時 ${side} header 面板寬不變`, Math.abs(hovered.panelHeaderW - base.panelHeaderW) <= 0.5, `${base.panelHeaderW} → ${hovered.panelHeaderW}`)
  record('I20', `${label}:hover ⌄ 時 ${side} body 面板寬不變`, Math.abs(hovered.panelBodyW - base.panelBodyW) <= 0.5, `${base.panelBodyW} → ${hovered.panelBodyW}`)
  record('I20', `${label}:hover ⌄ 時 center 每欄 header / cell 的 left 與 width 全部不動`,
    worstDelta(base.heads, hovered.heads) <= 0.5 && worstDelta(base.cells, hovered.cells) <= 0.5 && Math.abs(base.centerHeadLeft - hovered.centerHeadLeft) <= 0.5,
    `worst head Δ ${worstDelta(base.heads, hovered.heads).toFixed(2)} / cell Δ ${worstDelta(base.cells, hovered.cells).toFixed(2)} / center 左緣 Δ ${Math.abs(base.centerHeadLeft - hovered.centerHeadLeft).toFixed(2)}(>0.5 = header 固有寬又參與版面)`)
  // (2) 點排序區 → 排序箭頭出現(header 內容又多一個 icon)→ 版面仍不得動
  if (base.sortZone) {
    const s = rectMid(base.sortZone)
    await page.mouse.click(s.x, s.y)
    await page.waitForTimeout(350)
    const sorted = await page.evaluate(snapPinnedRegion, side)
    record('I20', `${label}:排序箭頭真的畫出來(否則沒測到排序態)`, sorted.sortIconW > 0 && sorted.ariaSort !== 'none', `箭頭 svg 寬 ${sorted.sortIconW} / aria-sort=${sorted.ariaSort}`)
    record('I20', `${label}:排序後 ${side} header / body 面板寬不變`,
      Math.abs(sorted.panelHeaderW - base.panelHeaderW) <= 0.5 && Math.abs(sorted.panelBodyW - base.panelBodyW) <= 0.5,
      `header ${base.panelHeaderW} → ${sorted.panelHeaderW} / body ${base.panelBodyW} → ${sorted.panelBodyW}`)
    record('I20', `${label}:排序後 center 每欄 header 的 left 與 width 全部不動`,
      worstDelta(base.heads, sorted.heads) <= 0.5 && Math.abs(base.centerHeadLeft - sorted.centerHeadLeft) <= 0.5,
      `worst head Δ ${worstDelta(base.heads, sorted.heads).toFixed(2)}(列會重排所以不比 cell 的內容,但欄位 rect 仍由 header 決定)`)
    // 還原排序(asc → desc → none 三態,再點兩次),避免殘留狀態影響同 story 的後續量測
    await page.mouse.click(s.x, s.y); await page.waitForTimeout(150)
    await page.mouse.click(s.x, s.y); await page.waitForTimeout(150)
  } else {
    record('I20', `${label}:第一個釘選欄可排序(否則排序那半沒測到)`, false, 'sort zone 找不到')
  }
  await page.mouse.move(5, 5)
}
// 左釘選:`pinned-columns`(第一張表,SKU 釘左 + rowActions);右釘選:`row-drag-interactive`(Updated 釘右)
await assertPinnedHeaderStable('pinned-columns', 'left', '欄位釘選')
await assertPinnedHeaderStable('row-drag-interactive', 'right', '列拖曳重排')

/* ── I21:rowActions 佔位格 —— header 佔位與 body 操作格必須同寬同左緣(缺陷 A)──
 * 根 invariant:header 與 body 是兩個各跑一次 CSS flex 的容器(spec 六之二不變條件 (6)),右區的參與者
 * 集合與 flex 因子必須兩邊一致(header 佔位 `flex-1` = body 操作格 `flex-1`,data-table.tsx `renderHeaderRow`
 * / `renderBodyRows`),剩餘空間才會分到同一格。AG Grid v33 沒有佔位格(操作欄是有寬度的 column),
 * 這是 DS 自己的殘留(spec 缺陷表 A / :206)。I11c 遇到「右區 0 個 columnheader」會直接 continue,
 * 所以佔位格從來沒被比過 —— 把 header 的 `flex-1` 拿掉,CI 照樣全綠。
 * 目前全 repo 沒有「pinnedRightColumns + rowActions」同時成立的 story;先對 `pinned-columns`(右區只有
 * rowActions)量佔位格本身;有欄位的右區組合待該 story 補上後再把它加進下面的 story 清單即可。
 */
const measureActionsPlaceholder = () => {
  const hp = document.querySelector('[data-datatable-header-panel="right"]')
  if (!hp) return null
  const root = hp.closest('[role="table"]')
  const bp = root.querySelector('[data-datatable-panel="right"]')
  // header 佔位 = 右 header 列裡唯一 `aria-hidden` 的 invisible div(裡面渲染一份假 actions)
  const placeholder = [...hp.querySelectorAll('div[aria-hidden="true"]')].find((d) => d.children.length > 0) ?? hp.querySelector('div[aria-hidden="true"]')
  const row = [...bp.querySelectorAll('[role="row"]')].find((r) => r.querySelector('[role="cell"]'))
  const cells = row ? [...row.querySelectorAll('[role="cell"]')] : []
  const actionsCell = cells[cells.length - 1] ?? null
  const r = (el) => { const b = el.getBoundingClientRect(); return { left: +b.left.toFixed(2), width: +b.width.toFixed(2) } }
  return {
    placeholder: placeholder ? { ...r(placeholder), children: placeholder.children.length } : null,
    actionsCell: actionsCell ? r(actionsCell) : null,
    headerPanelW: +hp.getBoundingClientRect().width.toFixed(2),
    bodyPanelW: +bp.getBoundingClientRect().width.toFixed(2),
  }
}
await page.goto(I20_PLUS_STORY('pinned-columns'), { waitUntil: 'networkidle' })
await page.waitForSelector('[data-datatable-header-panel="right"]')
await page.waitForTimeout(300)
const placeholderReport = await page.evaluate(measureActionsPlaceholder)
if (!placeholderReport || !placeholderReport.placeholder || !placeholderReport.actionsCell) {
  record('I21', 'rowActions 的 header 佔位與 body 操作格都存在', false, `placeholder ${JSON.stringify(placeholderReport?.placeholder)} / cell ${JSON.stringify(placeholderReport?.actionsCell)}(I21 真測路徑未進入)`)
} else {
  const p = placeholderReport
  record('I21', '佔位格真的渲染了假 actions 而且有寬(否則下面的比較是空轉)', p.placeholder.children > 0 && p.placeholder.width > 0, `children ${p.placeholder.children} / width ${p.placeholder.width}`)
  record('I21', 'header 佔位格與 body 操作格同寬', Math.abs(p.placeholder.width - p.actionsCell.width) <= 0.5, `header ${p.placeholder.width} vs body ${p.actionsCell.width}(>0.5 = 兩邊 flex 因子分家,剩餘空間分給不同的格)`)
  record('I21', 'header 佔位格與 body 操作格左緣重合', Math.abs(p.placeholder.left - p.actionsCell.left) <= 0.5, `header ${p.placeholder.left} vs body ${p.actionsCell.left}`)
  record('I21', 'hasRowActions 時右 header 面板(量測來源)與右 body 面板同寬', Math.abs(p.headerPanelW - p.bodyPanelW) <= 0.5, `header ${p.headerPanelW} vs body ${p.bodyPanelW}`)
}

/* ── I22:中段總寬只有一個住所 —— header 內層與 body 內層的 minWidth 讀同一個數字(缺陷 N)──
 * 根 invariant:決定 header / body 水平捲動範圍的中段 wrapper `minWidth` 只能有一份計算(`centerColsWidth`),
 * header 那份只多加 `vScrollbarSpacer`(垂直捲軸 gutter)。AG Grid v33.3.2 的單一來源是**資料欄位**
 * `visibleCols.bodyWidth`(visibleColsService.ts#L53),由 header / body **各自的** `CenterWidthFeature`
 * 實例讀取(centerWidthFeature.ts#L33-L57,header 端 addSpacer=true:
 * https://raw.githubusercontent.com/ag-grid/ag-grid/v33.3.2/packages/ag-grid-community/src/gridBodyComp/centerWidthFeature.ts)
 * —— 兩個實例、一個資料欄位,與這裡「兩個 wrapper、一個 `centerColsWidth`」同構。
 * I11 只比 scrollWidth − clientWidth(整體捲動範圍),`renderBodyRows` 內若再長出第二份公式而且在 CI(spacer=0)
 * 下數值巧合相同,I11 不會紅;這裡直接讀兩個 wrapper 的 computed `min-width`,並在水平溢出的 story 上
 * 驗它就是 Σ 欄寬(溢出時 Σ resolved = Σ base,column-widths.ts:36-37)。
 */
const measureCenterMinWidth = () => {
  const out = []
  for (const hp of document.querySelectorAll('[data-datatable-header-panel="center"]')) {
    const root = hp.closest('[role="table"]')
    const bp = root?.querySelector('[data-datatable-panel="center"]')
    if (!bp) continue
    const hInner = hp.firstElementChild
    const bInner = [...bp.children].find((c) => c.getAttribute('role') !== 'presentation' && c.style.minWidth)
    if (!hInner || !bInner) { out.push({ missing: true }); continue }
    const spacer = bp.offsetWidth - bp.clientWidth // 垂直捲軸 gutter(CI overlay 捲軸 = 0)
    const heads = [...hp.querySelectorAll('[role="columnheader"]')]
    const sumHeads = heads.reduce((a, h) => a + h.getBoundingClientRect().width, 0)
    out.push({
      headMin: parseFloat(getComputedStyle(hInner).minWidth) || 0,
      bodyMin: parseFloat(getComputedStyle(bInner).minWidth) || 0,
      headInnerW: +hInner.getBoundingClientRect().width.toFixed(2),
      bodyInnerW: +bInner.getBoundingClientRect().width.toFixed(2),
      spacer,
      sumHeads: +sumHeads.toFixed(2),
      overflow: bp.scrollWidth > bp.clientWidth,
      columns: heads.length,
    })
  }
  return out
}
for (const [storyName, label] of [['virtual-scroll', '大量資料'], ['pinned-columns', '欄位釘選']]) {
  await page.goto(I20_PLUS_STORY(storyName), { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-datatable-panel="center"]')
  await page.waitForTimeout(300)
  const minWidthReport = await page.evaluate(measureCenterMinWidth)
  record('I22', `${label}:真的量到 center wrapper(否則下面的斷言是空轉)`, minWidthReport.length > 0 && minWidthReport.every((r) => !r.missing), `量到 ${minWidthReport.length} 張表`)
  minWidthReport.forEach((r, i) => {
    if (r.missing) return
    record('I22', `${label} 表 ${i + 1}:body 內層 minWidth 有值且量到多欄`, r.bodyMin > 0 && r.columns >= 2, `minWidth ${r.bodyMin} / ${r.columns} 欄`)
    record('I22', `${label} 表 ${i + 1}:header 內層 minWidth − 垂直捲軸 spacer === body 內層 minWidth(同一個 centerColsWidth)`,
      Math.abs(r.headMin - r.spacer - r.bodyMin) <= 0.5, `header ${r.headMin} − spacer ${r.spacer} vs body ${r.bodyMin}(≠ = 中段總寬有第二份計算)`)
    record('I22', `${label} 表 ${i + 1}:兩個內層 wrapper 的實際寬也只差 spacer`,
      Math.abs(r.headInnerW - r.spacer - r.bodyInnerW) <= 0.5, `header ${r.headInnerW} − ${r.spacer} vs body ${r.bodyInnerW}`)
    if (r.overflow) {
      record('I22', `${label} 表 ${i + 1}:水平溢出時 body 內層 minWidth === Σ 欄寬(minWidth 真的在管捲動範圍)`,
        Math.abs(r.bodyMin - r.sumHeads) <= 0.5, `minWidth ${r.bodyMin} vs Σ header 寬 ${r.sumHeads}`)
    }
  })
}

/* ── I23:「自動調整寬度」必須量到內容真正需要的寬(缺陷 L)──
 * 根 invariant:auto-fit 量的是 header 與 cell 內容在**不受目前欄寬限制**的排版脈絡下的 max-content 寬
 * (data-table.tsx `measureNaturalWidth`:clone 進離畫面 dummy、`width:max-content`),對照 AG Grid v33.3.2
 * `autoWidthCalculator.ts#L95-L99`(`cloneNode(true)` + `style.width = ''`)、#L31-L36(header 一併量,
 * `skipHeaderOnAutoSize` 預設 false):
 * https://raw.githubusercontent.com/ag-grid/ag-grid/v33.3.2/packages/ag-grid-community/src/rendering/autoWidthCalculator.ts
 * 修前量的是已被裁字的元素(scrollWidth 只回「現在的寬」)、只量 firstElementChild、不量 header ——
 * 這條路徑在一天內修了三次(fa2541ed → 7a8a2c3a → b38bb5d3),每次都是手動抓到,沒有任何閘。
 * 這裡真的打開欄位選單、點「自動調整寬度」,然後:
 *   (a) 該欄每個 cell 與 header 內任何 `text-overflow: ellipsis` 載體都 `scrollWidth <= clientWidth`
 *       (與 hooks/use-truncated.ts:63 的截斷判準同一條式子)—— 前提守衛:調整前至少一格是真的被截斷;
 *   (b) 新欄寬與內容右緣之間的餘裕落在 [0, AUTO_FIT_BUFFER + 6](+6 = view×naked 載體 1px 透明框 + 取整):上限擋「把 hover ⌄ / 開著的選單也算進去」
 *       (7a8a2c3a 那類 +24px),下限擋「還是被裁」;
 *   (c) 新欄寬 ≤ center body 可視寬 + buffer(b38bb5d3 的 pre-wrap 上限);
 *   (d) 再按一次結果相同(選單開著時量與關著時量同值)。
 * 只有 `column-resize` story 開了 enableColumnResize(選單項只在 resize 模式渲染);它沒有 wrap 欄與樹狀欄,
 * 也沒有「標題比所有 cell 長」的欄,這三個路徑待對應 story 補上後把 (a)–(d) 套過去即可。
 */
const AUTO_FIT_BUFFER_EXPECTED = 8 // data-table.tsx `AUTO_FIT_BUFFER`
const measureAutoFitColumn = (colId) => {
  const root = document.querySelector('[data-datatable-header-panel="center"]')?.closest('[role="table"]')
  if (!root) return null
  const head = root.querySelector(`[role="columnheader"][data-column-id="${colId}"]`)
  const cells = [...root.querySelectorAll(`[role="cell"][data-column-id="${colId}"]`)]
  if (!head || cells.length === 0) return null
  const centerBody = root.querySelector('[data-datatable-panel="center"]')
  // 截斷判準 = hooks/use-truncated.ts:63 `el.scrollWidth > el.clientWidth`,套在每個 ellipsis 載體上
  const truncatedIn = (el) => [...el.querySelectorAll('*')].some((e) => {
    const cs = getComputedStyle(e)
    return cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth
  })
  // 內容右緣:走文字節點的 Range(不被 overflow 裁切),取最右的那一個
  const textRight = (el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let right = -Infinity
    let n
    while ((n = w.nextNode())) {
      if (!n.textContent.trim()) continue
      const r = document.createRange(); r.selectNodeContents(n)
      const b = r.getBoundingClientRect()
      if (b.width > 0) right = Math.max(right, b.right)
    }
    return right
  }
  const padR = parseFloat(getComputedStyle(cells[0]).paddingRight) || 0
  const all = [head, ...cells]
  const occupied = Math.max(...all.map((el) => textRight(el) - el.getBoundingClientRect().left + padR))
  const widths = all.map((el) => +el.getBoundingClientRect().width.toFixed(2))
  return {
    headW: widths[0],
    worstCellVsHead: Math.max(...widths.slice(1).map((w) => Math.abs(w - widths[0]))),
    truncatedCells: cells.filter(truncatedIn).length,
    headTruncated: truncatedIn(head),
    occupied: +occupied.toFixed(2),
    centerClientW: centerBody?.clientWidth ?? null,
    headLabel: (head.textContent || '').trim(),
  }
}
const runAutoFit = async (colId, headLabel) => {
  const headSel = `[data-datatable-header-panel="center"] [role="columnheader"][data-column-id="${colId}"]`
  await page.locator(headSel).first().hover()
  await page.waitForTimeout(200)
  await page.locator(`${headSel} [aria-label="${headLabel} 欄位選單"]`).first().click()
  const item = page.getByRole('menuitem', { name: '自動調整寬度' })
  await item.waitFor({ state: 'visible', timeout: 3000 })
  await item.click()
  await page.waitForTimeout(400)
  await page.mouse.move(5, 5)
}
await page.goto(I20_PLUS_STORY('column-resize'), { waitUntil: 'networkidle' })
await page.waitForSelector('[role="columnheader"][data-column-id="name"]')
await page.waitForTimeout(300)
const AUTO_FIT_COL = 'name' // ColumnResize 第一張表:Product 欄 meta.width 280,長品名被截斷
const beforeFit = await page.evaluate(measureAutoFitColumn, AUTO_FIT_COL)
if (!beforeFit) {
  record('I23', 'auto-fit 目標欄存在', false, 'column-resize story 找不到 name 欄(I23 真測路徑未進入)')
} else {
  record('I23', '調整前至少一格真的被截斷(否則 auto-fit 沒東西可修,斷言空轉)', beforeFit.truncatedCells >= 1, `截斷 ${beforeFit.truncatedCells} 格 / 欄寬 ${beforeFit.headW}`)
  let afterFit = null
  let againFit = null
  try {
    await runAutoFit(AUTO_FIT_COL, beforeFit.headLabel)
    afterFit = await page.evaluate(measureAutoFitColumn, AUTO_FIT_COL)
    await runAutoFit(AUTO_FIT_COL, beforeFit.headLabel)
    againFit = await page.evaluate(measureAutoFitColumn, AUTO_FIT_COL)
  } catch (error) {
    record('I23', '欄位選單 →「自動調整寬度」真的能點到', false, String(error?.message || error).split('\n')[0])
  }
  if (afterFit && againFit) {
    const slack = afterFit.headW - afterFit.occupied
    record('I23', '按下後欄寬真的變了(否則後面的斷言是空轉)', afterFit.headW > beforeFit.headW + 0.5, `${beforeFit.headW} → ${afterFit.headW}`)
    record('I23', '按下後該欄 header 與每個 cell 仍是同一個整數', afterFit.worstCellVsHead <= 0.01, `worst Δ ${afterFit.worstCellVsHead.toFixed(3)}`)
    record('I23', '(a) 按下後該欄沒有任何 cell 還被截斷', afterFit.truncatedCells === 0, `仍截斷 ${afterFit.truncatedCells} 格(>0 = 量的是「現在的寬」不是「需要的寬」)`)
    record('I23', '(a) 按下後 header 標題沒被截斷(header 也要量,v33 skipHeaderOnAutoSize 預設 false)', !afterFit.headTruncated, `headTruncated=${afterFit.headTruncated}`)
    record('I23', `(b) 新欄寬與內容右緣的餘裕落在 [0, ${AUTO_FIT_BUFFER_EXPECTED} + 6]`, slack >= 0 && slack <= AUTO_FIT_BUFFER_EXPECTED + 6,
      `欄寬 ${afterFit.headW} − 內容佔用 ${afterFit.occupied} = ${slack.toFixed(2)}(<0 = 還在裁;>${AUTO_FIT_BUFFER_EXPECTED + 6} = 把 hover ⌄ / 開著的選單也算進去了)`)
    record('I23', '(c) 新欄寬 ≤ center body 可視寬 + buffer(不會 auto-fit 到比看得見的表還寬)',
      afterFit.centerClientW != null && afterFit.headW <= afterFit.centerClientW + AUTO_FIT_BUFFER_EXPECTED, `${afterFit.headW} vs 可視寬 ${afterFit.centerClientW}`)
    record('I23', '(d) 再按一次結果相同(選單開著量與關著量同值,量測不受 UI 狀態影響)', Math.abs(againFit.headW - afterFit.headW) <= 0.01, `${afterFit.headW} → ${againFit.headW}`)
  }
}

/* ── I24:url 型別的 view↔edit 0-delta(缺陷 T 的漏網型別)──
 * I1–I4 的 harness 把 url 標成 `noInCellField`(「設計上沒有 in-cell 編輯欄位」)—— 那句只對 boolean 成立。
 * url 只是**進入路徑**不同:cell click 走連結、Enter/F2 被排除(data-table.tsx `NON_EDIT_TYPES`),但 hover
 * 出現的 Pencil(`aria-label="編輯連結"`,cell-registry.tsx UrlCell)按下去就渲染 `<Input variant="naked">`,
 * wrapper 帶 `data-field-mode="edit"`;spec 第十二段 url 列與 navigate-valued 通用類別第 4 條都要求「edit
 * 觸發後 = 一般 field 行為契約,與其他型別零特例」,所以 (2)(3)(4) 三條不變條件對 url 同樣成立、也同樣可量。
 * 這裡走真正的入口(hover cell → click Pencil),量的三個 delta 與 I1–I4 同門檻。
 */
await page.goto(I20_PLUS_STORY('inline-edit'), { waitUntil: 'networkidle' })
await page.waitForSelector('[role="row"][data-row-index]')
await page.waitForTimeout(400)
const URL_CELL = { row: 0, col: 9 } // 欄序見 data-table.stories.tsx InlineEdit editableColumns(col 9 = url)
const urlDisplay = await page.evaluate(({ row, col }) => {
  const cell = document.querySelectorAll(`[role="row"][data-row-index="${row}"] [role="cell"]`)[col]
  if (!cell) return null
  const r = cell.getBoundingClientRect()
  return { width: r.width, height: r.height, left: r.left, top: r.top }
}, URL_CELL)
if (!urlDisplay) {
  record('I24', 'URL(url) display↔edit cell 寬度一致', false, 'cell not found(I24 真測路徑未進入)')
} else {
  const c = rectMid(urlDisplay)
  await page.mouse.move(c.x, c.y)
  await page.waitForTimeout(200)
  let urlEdit = null
  try {
    const pencil = page.locator(`[role="row"][data-row-index="${URL_CELL.row}"] [role="cell"]`).nth(URL_CELL.col).locator('[aria-label="編輯連結"]')
    await pencil.click({ timeout: 3000 })
    await page.waitForTimeout(400)
    urlEdit = await page.evaluate(({ row, col }) => {
      const cell = document.querySelectorAll(`[role="row"][data-row-index="${row}"] [role="cell"]`)[col]
      const field = cell?.querySelector('[data-field-mode="edit"], textarea')
      if (!field) return null
      const cr = cell.getBoundingClientRect()
      const fr = field.getBoundingClientRect()
      return { cellWidth: cr.width, cellHeight: cr.height, fieldHeight: fr.height }
    }, URL_CELL)
  } catch (error) {
    record('I24', 'URL(url) hover 後 Pencil 真的能點到', false, String(error?.message || error).split('\n')[0])
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.mouse.move(5, 5)
  if (!urlEdit) {
    record('I24', 'URL(url) 經 Pencil 進 edit 後 cell 內有 data-field-mode="edit" 的 Field', false, 'no edit field — url 有 in-cell Field(cell-registry UrlCell edit 分支),沒進 = 真的壞了')
  } else {
    const widthDelta = Math.abs(urlDisplay.width - urlEdit.cellWidth)
    const heightDelta = Math.abs(urlDisplay.height - urlEdit.cellHeight)
    const fieldVsCell = Math.abs(urlEdit.cellHeight - urlEdit.fieldHeight)
    record('I24', 'URL(url) display↔edit cell 寬度一致(>1px = fail)', widthDelta <= 1, `display ${urlDisplay.width.toFixed(2)} vs edit ${urlEdit.cellWidth.toFixed(2)}, delta ${widthDelta.toFixed(2)}`)
    record('I24', 'URL(url) display↔edit width 0 delta', widthDelta < 0.5, `delta ${widthDelta.toFixed(2)}`)
    record('I24', 'URL(url) display↔edit height 0 delta', heightDelta < 0.5, `delta ${heightDelta.toFixed(2)}`)
    record('I24', 'URL(url) Field 填滿 cell 高度', fieldVsCell < 1, `cell-field delta ${fieldVsCell.toFixed(2)}`)
  }
}

/* ── I25:巢狀列展開箭頭 = ItemPrefix + ItemInlineActionButton 的幾何(一-04)──
 * 根 invariant:同目的行內圖示按鈕與 prefix 槽必消費 item-anatomy primitive:按鈕盒 = `ICON_SIZE[size]`
 * (item-anatomy.tsx:67-71,md 16)、hover 底色 overlay = `INLINE_ACTION_HOVER_BG_SIZE[size]`(:128-132,md 18)
 * 且置中於按鈕;槽寬 + `mr-2` 必與 `--tree-indent-{size}`(uiSize.css:108-110)同源,子列的箭頭 / 文字
 * 因此每深一層剛好位移一個 indent。修前是手刻 `w-4 h-4 mr-2` 的 button,三個常數與 token 分家。
 * 唯一的像素證據是 2026-08-01 的 curated baseline(早於修正、非 required check)。這裡對 `nested-rows`
 * (md)量按鈕 rect、真 hover 後 overlay 的 rect 與 computed 底色、相鄰兩層的箭頭 / 文字左緣差、以及
 * 葉節點列(空槽)的文字左緣是否仍與同層有箭頭的列對齊。sm / lg 與 autoRowHeight 的巢狀 story 尚不存在
 * (render 不吃 args),補上後把 size 對應的期望值(16/16/20、18/18/22、24/24/28)套過去即可。
 */
const CHEVRON_EXPECT_MD = { box: 16, hoverBg: 18 } // ICON_SIZE.md / INLINE_ACTION_HOVER_BG_SIZE.md
await page.goto(I20_PLUS_STORY('nested-rows'), { waitUntil: 'networkidle' })
await page.waitForSelector('[role="cell"] button[aria-expanded]')
await page.waitForTimeout(400)
const nestedGeom = await page.evaluate(() => {
  const root = document.querySelector('[role="table"]')
  const t = root.closest('[data-table-size]') || root
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden'
  probe.style.width = getComputedStyle(t).getPropertyValue('--tree-indent-md')
  root.appendChild(probe)
  const indentPx = probe.getBoundingClientRect().width
  probe.remove()
  const textLeft = (el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let n
    while ((n = w.nextNode())) {
      if (!n.textContent.trim()) continue
      const r = document.createRange(); r.selectNodeContents(n)
      const b = r.getBoundingClientRect()
      if (b.width > 0) return b.left
    }
    return null
  }
  const cellByText = (needle) => [...root.querySelectorAll('[role="cell"]')].find((c) => (c.textContent || '').includes(needle))
  const info = (needle) => {
    const cell = cellByText(needle)
    if (!cell) return null
    const btn = cell.querySelector('button[aria-expanded]')
    const br = btn?.getBoundingClientRect()
    return {
      rowIndex: cell.closest('[data-row-index]')?.getAttribute('data-row-index') ?? null,
      textLeft: textLeft(cell),
      btn: br ? { left: br.left, top: br.top, width: +br.width.toFixed(2), height: +br.height.toFixed(2) } : null,
    }
  }
  return {
    indentPx,
    d0: info('Q1 行銷活動'),      // depth 0,可展開
    d1: info('社群素材設計'),      // depth 1,可展開
    d1leaf: info('KOL 合作協調'),  // depth 1,葉節點(空槽)
    d2leaf: info('Instagram post 設計'), // depth 2,葉節點
  }
})
if (!nestedGeom.d0?.btn || !nestedGeom.d1?.btn || !nestedGeom.d1leaf || !nestedGeom.d2leaf) {
  record('I25', '巢狀列 depth 0 / 1 / 2 都真的渲染出來(否則下面的斷言是空轉)', false, JSON.stringify({ d0: !!nestedGeom.d0?.btn, d1: !!nestedGeom.d1?.btn, d1leaf: !!nestedGeom.d1leaf, d2leaf: !!nestedGeom.d2leaf }))
} else {
  const g = nestedGeom
  record('I25', `--tree-indent-md 解析成 px(${g.indentPx})`, g.indentPx > 0, `probe 量到 ${g.indentPx}`)
  for (const [k, v] of [['depth 0', g.d0.btn], ['depth 1', g.d1.btn]]) {
    record('I25', `${k} 箭頭按鈕盒 = ICON_SIZE.md(${CHEVRON_EXPECT_MD.box}×${CHEVRON_EXPECT_MD.box})`,
      Math.abs(v.width - CHEVRON_EXPECT_MD.box) <= 0.5 && Math.abs(v.height - CHEVRON_EXPECT_MD.box) <= 0.5, `${v.width}×${v.height}`)
  }
  record('I25', 'depth 1 箭頭左緣 − depth 0 箭頭左緣 === --tree-indent-md(每深一層剛好一個 indent)',
    Math.abs((g.d1.btn.left - g.d0.btn.left) - g.indentPx) <= 0.5, `Δ ${(g.d1.btn.left - g.d0.btn.left).toFixed(2)} vs token ${g.indentPx}`)
  record('I25', 'depth 1 文字左緣 − depth 0 文字左緣 === --tree-indent-md', Math.abs((g.d1.textLeft - g.d0.textLeft) - g.indentPx) <= 0.5, `Δ ${(g.d1.textLeft - g.d0.textLeft).toFixed(2)} vs ${g.indentPx}`)
  record('I25', 'depth 2 葉節點文字左緣 − depth 1 文字左緣 === --tree-indent-md(空槽仍鎖寬)', Math.abs((g.d2leaf.textLeft - g.d1.textLeft) - g.indentPx) <= 0.5, `Δ ${(g.d2leaf.textLeft - g.d1.textLeft).toFixed(2)} vs ${g.indentPx}`)
  record('I25', 'depth 1 葉節點(空槽)文字左緣 === depth 1 有箭頭列的文字左緣', Math.abs(g.d1leaf.textLeft - g.d1.textLeft) <= 0.5, `${g.d1leaf.textLeft.toFixed(2)} vs ${g.d1.textLeft.toFixed(2)}`)
  // 箭頭右緣到文字左緣 = mr-2(8)+ 文字載體(view×naked)的 1px 透明框 → 落在 [8, 10],且兩層相同
  const gap0 = g.d0.textLeft - (g.d0.btn.left + g.d0.btn.width)
  const gap1 = g.d1.textLeft - (g.d1.btn.left + g.d1.btn.width)
  record('I25', '箭頭右緣到文字左緣落在 [mr-2, mr-2 + 2](槽寬 = 盒寬,沒有多出來的補償空白)', gap0 >= 8 - 0.5 && gap0 <= 10 + 0.5,
    `gap ${gap0.toFixed(2)}(indent ${g.indentPx} − 盒 ${CHEVRON_EXPECT_MD.box} = ${g.indentPx - CHEVRON_EXPECT_MD.box} 為 mr-2 期望值)`)
  record('I25', 'depth 0 與 depth 1 的箭頭→文字間距相同', Math.abs(gap0 - gap1) <= 0.5, `${gap0.toFixed(2)} vs ${gap1.toFixed(2)}`)
  // 真 hover:overlay span 的 rect 與 computed 底色(不是看 class 有沒有掛)
  const m = rectMid(g.d0.btn)
  await page.mouse.move(m.x, m.y)
  await page.waitForTimeout(250)
  const hov = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('[role="cell"]')].find((c) => (c.textContent || '').includes('Q1 行銷活動'))
    const btn = cell?.querySelector('button[aria-expanded]')
    const overlay = btn?.firstElementChild
    if (!btn || !overlay) return null
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;background-color:var(--neutral-hover)'
    btn.closest('[role="table"]').appendChild(probe)
    const expected = getComputedStyle(probe).backgroundColor
    probe.remove()
    const b = btn.getBoundingClientRect(); const o = overlay.getBoundingClientRect()
    return {
      w: +o.width.toFixed(2), h: +o.height.toFixed(2),
      centerDx: +((o.left + o.width / 2) - (b.left + b.width / 2)).toFixed(2),
      centerDy: +((o.top + o.height / 2) - (b.top + b.height / 2)).toFixed(2),
      bg: getComputedStyle(overlay).backgroundColor, expected,
    }
  })
  if (!hov) record('I25', 'hover overlay span 存在', false, '按鈕或 overlay 找不到')
  else {
    record('I25', `hover 後 overlay = INLINE_ACTION_HOVER_BG_SIZE.md(${CHEVRON_EXPECT_MD.hoverBg}×${CHEVRON_EXPECT_MD.hoverBg})並置中於按鈕`,
      Math.abs(hov.w - CHEVRON_EXPECT_MD.hoverBg) <= 0.5 && Math.abs(hov.h - CHEVRON_EXPECT_MD.hoverBg) <= 0.5 && Math.abs(hov.centerDx) <= 0.5 && Math.abs(hov.centerDy) <= 0.5,
      `${hov.w}×${hov.h},中心偏移 (${hov.centerDx}, ${hov.centerDy})`)
    record('I25', 'hover 後 overlay 底色 = --neutral-hover(computed 值,非 transparent)', hov.bg === hov.expected && hov.bg !== 'rgba(0, 0, 0, 0)', `got ${hov.bg} / expected ${hov.expected}`)
  }
  await page.mouse.move(5, 5)
}

/* ── I26:整列 hover 底色在指標停到 SVG(圖示)上時不得消失,三區同步(一-05)──
 * 根 invariant:事件委派的 target 守衛必以 `Element` 判定(lucide 圖示是 `SVGElement`,`instanceof
 * HTMLElement` 恆 false → onMouseOut 誤判「離開列」刪掉 data-hovered、onMouseOver 又 early return)。
 * AG Grid v33 走 per-row mouseenter/mouseleave(rowCtrl.ts#L1486-L1522),沒有這個坑;本 DS 三區同步
 * hover 是已記載的模型差異,所以要自己守。spec:整列 hover = neutral-hover(data-table.spec.md:276)。
 * 用 Playwright 真實 `page.mouse.move` 依序停在 (a) center cell 文字 (b) rowActions 的 Pencil svg
 * (c) 左釘選 cell,每步斷言該列在三區都有 data-hovered **而且** computed 背景 === --neutral-hover 的解析值
 * (probe 同 scope 解析,不是看屬性有沒有);移出表格後底色回到透明。
 */
const measureRowHover = (rowIdx) => {
  const root = document.querySelector('[role="table"]')
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden;background-color:var(--neutral-hover)'
  root.appendChild(probe)
  const expected = getComputedStyle(probe).backgroundColor
  probe.remove()
  const regions = root.querySelectorAll('[data-datatable-panel]').length
  const rows = [...root.querySelectorAll(`[data-row-index="${rowIdx}"]`)]
  const bgs = rows.map((r) => getComputedStyle(r).backgroundColor)
  const otherIdx = rowIdx === 0 ? 1 : 0
  const other = [...root.querySelectorAll(`[data-row-index="${otherIdx}"]`)].map((r) => getComputedStyle(r).backgroundColor)
  return {
    regions,
    rowsFound: rows.length,
    hovered: rows.filter((r) => r.hasAttribute('data-hovered')).length,
    allHoverBg: rows.length > 0 && bgs.every((b) => b === expected),
    noneHoverBg: bgs.every((b) => b !== expected),
    otherClean: other.every((b) => b !== expected),
    expected, bgs,
  }
}
const hoverTargetPoint = ({ kind, rowIdx }) => {
  const root = document.querySelector('[role="table"]')
  const el = (() => {
    if (kind === 'center-text') return root.querySelector(`[data-datatable-panel="center"] [data-row-index="${rowIdx}"] [role="cell"]`)
    if (kind === 'actions-svg') return root.querySelector(`[data-datatable-panel="right"] [data-row-index="${rowIdx}"] button svg`)
    if (kind === 'left-cell') return root.querySelector(`[data-datatable-panel="left"] [data-row-index="${rowIdx}"] [role="cell"]`)
    if (kind === 'chevron-svg') return root.querySelector(`[data-row-index="${rowIdx}"] button[aria-expanded] svg`)
    return null
  })()
  if (!el) return null
  const r = el.getBoundingClientRect()
  const table = root.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName.toLowerCase(), outside: { x: table.left + 10, y: table.top - 15 } }
}
const HOVER_ROW = 1
for (const [storyName, label, steps] of [
  ['pinned-columns', '欄位釘選', ['center-text', 'actions-svg', 'left-cell']],
  ['nested-rows', '巢狀列', ['center-text', 'chevron-svg']],
]) {
  await page.goto(I20_PLUS_STORY(storyName), { waitUntil: 'networkidle' })
  await page.waitForSelector(`[data-row-index="${HOVER_ROW}"]`)
  await page.waitForTimeout(400)
  await page.mouse.move(5, 5)
  await page.waitForTimeout(150)
  const idle = await page.evaluate(measureRowHover, HOVER_ROW)
  record('I26', `${label}:真的量到多區 × 該列(否則下面的斷言是空轉)`, idle.regions >= 2 && idle.rowsFound === idle.regions, `regions ${idle.regions} / 該列 DOM ${idle.rowsFound}`)
  record('I26', `${label}:未 hover 時該列底色不是 --neutral-hover`, idle.hovered === 0 && idle.noneHoverBg, `hovered ${idle.hovered} / bgs ${JSON.stringify(idle.bgs)}`)
  let lastPoint = null
  for (const kind of steps) {
    const pt = await page.evaluate(hoverTargetPoint, { kind, rowIdx: HOVER_ROW })
    if (!pt) { record('I26', `${label}:hover 目標 ${kind} 存在`, false, '選擇器找不到'); continue }
    lastPoint = pt
    await page.mouse.move(pt.x, pt.y)
    await page.waitForTimeout(200)
    const r = await page.evaluate(measureRowHover, HOVER_ROW)
    if (kind.endsWith('-svg')) record('I26', `${label}:${kind} 的目標真的是 <svg>(否則沒測到 SVGElement 路徑)`, pt.tag === 'svg', `tag=${pt.tag}`)
    record('I26', `${label}:指標停在 ${kind} 時該列在 ${r.regions} 區都有 data-hovered`, r.hovered === r.regions, `hovered ${r.hovered} / regions ${r.regions}`)
    record('I26', `${label}:指標停在 ${kind} 時該列 ${r.regions} 區 computed 底色 === --neutral-hover`, r.allHoverBg, `bgs ${JSON.stringify(r.bgs)} / expected ${r.expected}`)
    record('I26', `${label}:指標停在 ${kind} 時其他列沒有 hover 底色`, r.otherClean, '其他列也亮 = 委派範圍錯')
  }
  if (lastPoint) {
    await page.mouse.move(lastPoint.outside.x, lastPoint.outside.y)
    await page.waitForTimeout(200)
    const out = await page.evaluate(measureRowHover, HOVER_ROW)
    record('I26', `${label}:移出表格後該列 data-hovered 歸零且底色回透明`, out.hovered === 0 && out.noneHoverBg, `hovered ${out.hovered} / bgs ${JSON.stringify(out.bgs)}`)
  }
}

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
