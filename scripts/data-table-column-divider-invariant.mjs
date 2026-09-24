#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 表格裡每一條「一般非 frozen 欄邊界」的表頭短線,長度與垂直位置彼此完全一致;任何一條缺席或長度不同就紅
 *   紅: 把選取欄的 dtHeaderColDivider 拿掉(缺線)、或把線高改成整格高(長度不同)→ 本閘必須指名該欄並紅
 *   綠: 所有一般欄邊界的短線同高同位時必須綠;--selftest 以合成幾何雙向驗(缺一條 / 長一條 各一格)
 *
 * ── 為什麼有這支 ──
 *
 * 2026-09-24:選取欄在「有格線」的表格裡**整條欄間線都不存在**,勾選框跟第一個資料欄在視覺上
 * 併成同一個盒。實測當時全表 325 個格有格線,選取格是唯一沒有的那一個。
 *
 * **Root cause 不是漏寫一行 class,是畫線的責任掛錯地方**:
 * 規格用「這是哪一種邊界」定義線(`data-table.spec.md`「Header vs Body 的視覺區隔」),
 * 程式卻用「這裡剛好渲染了哪個元件」畫線 —— 表頭短線是 `ResizeHandle` 附帶畫的,
 * 而系統欄(選取 / 拖曳 / 列動作)不可調寬、根本不渲染它;凍結線由面板畫;
 * 列身線由 cell 自己的 class 畫,而選取欄的 render 分支在套上那個 class 之前就 early-return。
 * **三種線三個主人,選取欄三個都碰不到,於是靜默沒有線。**
 * 這是 M37:要保證的是「這是一個欄邊界」,實際判的是「這裡有沒有 ResizeHandle」。
 *
 * 同一天修這條線時我自己又踩了三次(整高 / 撐滿 / 內縮量算錯),三次都是**照抄隔壁而不是先讀規格**。
 * 所以這支閘不驗「class 有沒有寫」(那又是一個代理),直接量**渲染出來的線**:
 * 所有一般欄邊界的線必須同高、同垂直位置。缺一條 → 高度 0 → 紅;畫成整高 → 高度不同 → 紅。
 *
 * 用法: node scripts/data-table-column-divider-invariant.mjs [--selftest]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const STATIC = join(ROOT, 'storybook-static')
const STORY = 'design-system-components-datatable-展示--roadmap-all-in-one'

/**
 * 純判定。輸入是每個「一般欄邊界」量到的線 {col, height, top}(top 相對表頭列頂)。
 * 允差 0.51px:不同來源的線一個畫在 cell 的 ::after、一個畫在 ResizeHandle 的 span,
 * 子像素捨入可能差半格;超過半個像素就是真的不一樣。
 */
export function findDividerDrift(lines, tolerance = 0.51) {
  if (lines.length < 2) return [{ kind: 'too-few', detail: `只量到 ${lines.length} 條線,無從比較` }]
  const problems = []
  const missing = lines.filter((l) => !(l.height > 0))
  for (const m of missing) problems.push({ kind: 'missing', col: m.col, detail: '這個欄邊界沒有線(高度 0)' })
  const present = lines.filter((l) => l.height > 0)
  if (present.length < 2) return problems
  // 以出現最多次的高度為基準,任何偏離都報出來
  const counts = new Map()
  for (const l of present) {
    const key = l.height.toFixed(2)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const baseH = Number([...counts.entries()].sort((a, b) => b[1] - a[1])[0][0])
  // 基準位置同樣取**多數**,不能取「第一個符合高度的」—— 那樣少數派會把多數派判成偏離
  // (selftest 第四格就是這樣抓到的:偏移的那一條剛好排第一,結果另外兩條被報成問題)。
  const topCounts = new Map()
  for (const l of present) {
    if (Math.abs(l.height - baseH) > tolerance) continue
    const key = l.top.toFixed(2)
    topCounts.set(key, (topCounts.get(key) || 0) + 1)
  }
  const baseTop = Number([...topCounts.entries()].sort((a, b) => b[1] - a[1])[0][0])
  for (const l of present) {
    if (Math.abs(l.height - baseH) > tolerance) {
      problems.push({ kind: 'height', col: l.col, detail: `線高 ${l.height.toFixed(2)},基準 ${baseH.toFixed(2)}` })
    } else if (Math.abs(l.top - baseTop) > tolerance) {
      problems.push({ kind: 'position', col: l.col, detail: `線頂 ${l.top.toFixed(2)},基準 ${baseTop.toFixed(2)}` })
    }
  }
  return problems
}

function selftest() {
  const ok = [
    { col: '__select__', height: 21, top: 9.5 },
    { col: 'id', height: 21, top: 9.5 },
    { col: 'title', height: 21, top: 9.5 },
  ]
  const missing = [
    { col: '__select__', height: 0, top: 0 },
    { col: 'id', height: 21, top: 9.5 },
    { col: 'title', height: 21, top: 9.5 },
  ]
  const tooTall = [
    { col: '__select__', height: 30, top: 5 },
    { col: 'id', height: 21, top: 9.5 },
    { col: 'title', height: 21, top: 9.5 },
  ]
  const offset = [
    { col: '__select__', height: 21, top: 6 },
    { col: 'id', height: 21, top: 9.5 },
    { col: 'title', height: 21, top: 9.5 },
  ]
  const cases = [
    ['所有一般欄邊界同高同位 → 必須綠', ok, 0, null],
    ['選取欄整條線缺席(2026-09-24 實況)→ 必須指名它並紅', missing, 1, '__select__'],
    ['選取欄畫成整格高(我第一次修錯的樣子)→ 必須紅', tooTall, 1, '__select__'],
    ['高度對但垂直位置差(撐滿造成的偏移)→ 必須紅', offset, 1, '__select__'],
  ]
  let failed = 0
  for (const [name, input, expected, mustName] of cases) {
    const got = findDividerDrift(input)
    const pass = got.length === expected && (!mustName || got.some((g) => g.col === mustName))
    if (pass) console.log(`  ✓ ${name}`)
    else { failed += 1; console.error(`  ✗ ${name} — 實得 ${got.length} 筆: ${JSON.stringify(got)}`) }
  }
  if (failed) { console.error(`\nselftest 失敗 ${failed} 格`); process.exit(1) }
  console.log('\nselftest 全過(綠側與三種紅側都驗到)')
}

async function measure() {
  const { launchBrowser, gotoStory } = await import('./lib/launch-browser.mjs')
  const { createServer } = await import('node:http')
  const { stat } = await import('node:fs/promises')
  const { extname } = await import('node:path')
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.map': 'application/json' }
  const server = createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent(req.url.split('?')[0])
      if (rel.endsWith('/')) rel += 'index.html'
      const f = join(STATIC, rel)
      if ((await stat(f)).isDirectory()) throw new Error('dir')
      res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' })
      res.end(readFileSync(f))
    } catch { res.writeHead(404); res.end('nf') }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await gotoStory(page, `${base}/iframe.html?id=${STORY}&viewMode=story`, { waitFor: '[data-column-id="__select__"]', settle: 900 })
  const lines = await page.evaluate(() => {
    const headers = [...document.querySelectorAll('[role="columnheader"]')]
    if (!headers.length) return []
    const rowTop = headers[0].parentElement.getBoundingClientRect().top
    const out = []
    for (const h of headers) {
      // 本區最後一欄由凍結邊界線 / 外框接管,不在本閘範圍
      if (h.hasAttribute('data-dt-last-col')) continue
      const col = h.getAttribute('data-column-id') || '?'
      const hr = h.getBoundingClientRect()
      // 來源一:cell 自己的 ::after(系統欄走這條)
      const a = getComputedStyle(h, '::after')
      if (a.content && a.content !== 'none') {
        const hgt = parseFloat(a.height)
        if (hgt > 0) { out.push({ col, height: hgt, top: hr.top - rowTop + (hr.height - hgt) / 2 }); continue }
      }
      // 來源二:ResizeHandle 畫的 1px 線(一般欄走這條)
      const span = [...h.querySelectorAll('span,div')].find((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.width <= 2 && r.height > 4
      })
      if (span) {
        const r = span.getBoundingClientRect()
        out.push({ col, height: r.height, top: r.top - rowTop })
      } else {
        out.push({ col, height: 0, top: 0 })
      }
    }
    return out
  })
  await browser.close()
  server.close()
  return lines
}

if (process.argv.includes('--selftest')) {
  selftest()
} else {
  const lines = await measure()
  const problems = findDividerDrift(lines)
  if (!problems.length) {
    console.log(`表頭欄間線一致性: ${lines.length} 條一般欄邊界全部同高同位 — ${lines.map((l) => `${l.col}=${l.height.toFixed(1)}`).join(' ')}`)
    process.exit(0)
  }
  console.error('🚨 表頭欄間線不一致 —— 規格 `data-table.spec.md`「Header vs Body 的視覺區隔」要求一般非 frozen 欄邊界是同一種短線:\n')
  for (const p of problems) console.error(`  [${p.kind}] ${p.col ?? ''} ${p.detail}`)
  console.error('\n量到的全部:', JSON.stringify(lines))
  console.error('\n注意:表頭短線由 `ResizeHandle` 附帶畫,而系統欄(選取 / 拖曳 / 列動作)不可調寬、不渲染它 ——')
  console.error('這正是 2026-09-24 選取欄整條線消失的根因。系統欄要自己掛 `dtHeaderColDivider`。')
  process.exit(1)
}
