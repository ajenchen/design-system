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
 * 而**選取欄是 `headerCellEl` 裡唯一有自己 early-return 分支的欄**,到不了畫線那一段
 * —— 與可不可調寬無關(進入條件是 `if (!showDivider && !isResizable) return null`,
 * 實測 `with-bulk-actions` 全部欄位不可調寬卻有 5 條線);凍結線由面板畫;
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
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const STATIC = join(ROOT, 'storybook-static')
// 掃多則—— 只掃一則的覆蓋是假的。這五則涵蓋:選取欄 + 格線 + 釘選、選取欄無格線、
// 有格線無選取欄、列動作欄(合法無線的那一欄)、一則兩張表。
const STORIES = process.env.DT_DIVIDER_STORY
  ? [process.env.DT_DIVIDER_STORY]
  : [
    'design-system-components-datatable-展示--roadmap-all-in-one',
    'design-system-components-datatable-展示--with-bulk-actions',
    'design-system-components-datatable-展示--row-actions',
    'design-system-components-datatable-展示--pinned-columns',
    'design-system-components-datatable-展示--inline-edit',
  ]

/**
 * 純判定。輸入是每個「一般欄邊界」量到的線 {col, height, top}(top 相對表頭列頂)。
 * 允差 0.51px:不同來源的線一個畫在 cell 的 ::after、一個畫在 ResizeHandle 的 span,
 * 子像素捨入可能差半格;超過半個像素就是真的不一樣。
 */
export function findDividerDrift(lines, tolerance = 0.51) {
  const problems = []
  // 按表頭列分組:一則故事可能有多張表,不同表的列頂 y 當然不同。
  const rows = new Map()
  for (const l of lines) {
    if (!rows.has(l.row)) rows.set(l.row, [])
    rows.get(l.row).push(l)
  }
  for (const [rowKey, group] of rows) {
    const present = group.filter((l) => l.height > 0)
    // 選取欄是這支閘的原點:它後面還有欄位,就一定要有線。
    for (const l of group) {
      if (l.col === '__select__' && !l.isLastInRow && !(l.height > 0)) {
        problems.push({ kind: 'missing', col: l.col, row: rowKey, detail: '選取欄後面還有欄位卻沒有欄間線' })
      }
    }
    if (present.length < 2) continue
    const counts = new Map()
    for (const l of present) counts.set(l.height.toFixed(2), (counts.get(l.height.toFixed(2)) || 0) + 1)
    const baseH = Number([...counts.entries()].sort((a, b) => b[1] - a[1])[0][0])
    const topCounts = new Map()
    for (const l of present) {
      if (Math.abs(l.height - baseH) > tolerance) continue
      topCounts.set(l.top.toFixed(2), (topCounts.get(l.top.toFixed(2)) || 0) + 1)
    }
    const baseTop = Number([...topCounts.entries()].sort((a, b) => b[1] - a[1])[0][0])
    for (const l of present) {
      if (Math.abs(l.height - baseH) > tolerance) {
        problems.push({ kind: 'height', col: l.col, row: rowKey, detail: `線高 ${l.height.toFixed(2)},同列基準 ${baseH.toFixed(2)}` })
      } else if (Math.abs(l.top - baseTop) > tolerance) {
        problems.push({ kind: 'position', col: l.col, row: rowKey, detail: `線頂 ${l.top.toFixed(2)},同列基準 ${baseTop.toFixed(2)}` })
      }
    }
  }
  return problems
}

function selftest() {
  const L = (col, height, top, row = 0, isLastInRow = false) => ({ col, height, top, row, isLastInRow })
  const ok = [L('__select__', 21, 9.5), L('id', 21, 9.5), L('title', 21, 9.5)]
  const missing = [L('__select__', 0, 0), L('id', 21, 9.5), L('title', 21, 9.5)]
  const tooTall = [L('__select__', 30, 5), L('id', 21, 9.5), L('title', 21, 9.5)]
  const offset = [L('__select__', 21, 6), L('id', 21, 9.5), L('title', 21, 9.5)]
  // 誤紅對照組一:同一則故事兩張表,第二張的列頂當然不同—— 不得報錯。
  const twoTables = [
    L('sku', 21, 9, 0), L('name', 21, 9, 0),
    L('sku', 21, 379.6, 1), L('name', 21, 379.6, 1),
  ]
  // 誤紅對照組二:列動作欄前面那一欄合法沒有線—— 不得報錯。
  const legitNoLine = [L('sku', 21, 9), L('name', 21, 9), L('updatedAt', 0, 0)]
  const cases = [
    ['所有一般欄邊界同高同位 → 必須綠', ok, 0, null],
    ['選取欄整條線缺席(2026-09-24 實況)→ 必須指名它並紅', missing, 1, '__select__'],
    ['選取欄畫成整格高(我第一次修錯的樣子)→ 必須紅', tooTall, 1, '__select__'],
    ['高度對但垂直位置差(撐滿造成的偏移)→ 必須紅', offset, 1, '__select__'],
    ['一則故事兩張表,列頂不同 → **不得誤紅**(第一版就是這樣紅的)', twoTables, 0, null],
    ['列動作欄前一欄合法無線 → **不得誤紅**(第一版就是這樣紅的)', legitNoLine, 0, null],
  ]
  let failed = 0
  for (const [name, input, expected, mustName] of cases) {
    const got = findDividerDrift(input)
    const pass = got.length === expected && (!mustName || got.some((g) => g.col === mustName))
    if (pass) console.log(`  \u2713 ${name}`)
    else { failed += 1; console.error(`  \u2717 ${name} — 實得 ${got.length} 筆: ${JSON.stringify(got)}`) }
  }
  if (failed) { console.error(`\nselftest 失敗 ${failed} 格`); process.exit(1) }
  console.log('\nselftest 全過(綠側、三種紅側、兩種誤紅對照組都驗到)')
}

async function measure(server, story) {
  const { launchBrowser, gotoStory } = await import('./lib/launch-browser.mjs')
  const base = server.origin
  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await gotoStory(page, `${base}/iframe.html?id=${story}&viewMode=story`, { waitFor: '[data-column-id="__select__"]', settle: 900 })
  const lines = await page.evaluate(() => {
    const headers = [...document.querySelectorAll('[role="columnheader"]')]
    const rows = new Map()
    for (const h of headers) {
      const parent = h.parentElement
      if (!rows.has(parent)) rows.set(parent, [])
      rows.get(parent).push(h)
    }
    const out = []
    let rowIndex = 0
    for (const [parent, cells] of rows) {
      // 每一列自己的頂 —— 一則故事可能有多張表,拿第一張的頂當全場基準會讓第二張整排誤紅。
      const rowTop = parent.getBoundingClientRect().top
      cells.forEach((h, i) => {
        if (h.hasAttribute('data-dt-last-col')) return
        const col = h.getAttribute('data-column-id') || '?'
        const isLastInRow = i === cells.length - 1
        const hr = h.getBoundingClientRect()
        const a = getComputedStyle(h, '::after')
        if (a.content && a.content !== 'none') {
          const hgt = parseFloat(a.height)
          if (hgt > 0) {
            out.push({ col, row: rowIndex, isLastInRow, height: hgt, top: hr.top - rowTop + (hr.height - hgt) / 2 })
            return
          }
        }
        const span = [...h.querySelectorAll('span,div')].find((e) => {
          const r = e.getBoundingClientRect()
          return r.width > 0 && r.width <= 2 && r.height > 4
        })
        if (span) {
          const r = span.getBoundingClientRect()
          out.push({ col, row: rowIndex, isLastInRow, height: r.height, top: r.top - rowTop })
        } else {
          out.push({ col, row: rowIndex, isLastInRow, height: 0, top: 0 })
        }
      })
      rowIndex += 1
    }
    return out
  })
  await browser.close()
  return lines
}

if (process.argv.includes('--selftest')) {
  selftest()
} else {
  // 缺前置 ≠ 產品壞了:gate-meta lane 的拋棄式快照裡沒有 storybook-static,
  // 沒有這道守衛時 baseline 會卡在 gotoStory 逾時,被共用跑法誤判成「現況紅」。
  if (!existsSync(join(STATIC, 'iframe.html'))) {
    console.error('✗ storybook-static missing. Run `npm run build-storybook` first.')
    process.exit(2)
  }
  // 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
  // 五則故事共用同一台伺服器 = 同一份快照(原本每則各起一台、各讀活目錄,五則可能量到不同的建置)。
  const { startA11yStaticServer } = await import('./lib/a11y-static-server.mjs')
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
  let total = 0
  let failed = 0
  try {
    for (const story of STORIES) {
      const lines = await measure(server, story)
      const problems = findDividerDrift(lines)
      const label = story.split('--').pop()
      if (!problems.length) {
        const present = lines.filter((l) => l.height > 0)
        console.log(`  \u2713 ${label}: ${present.length} \u689d\u7dda\u5168\u90e8\u540c\u9ad8\u540c\u4f4d`)
        total += present.length
        continue
      }
      failed += 1
      console.error(`  \u2717 ${label}:`)
      for (const p of problems) console.error(`      [${p.kind}] ${p.col ?? ''} ${p.detail}`)
      console.error(`      \u91cf\u5230\u7684\u5168\u90e8: ${JSON.stringify(lines)}`)
    }
  } finally {
    await server.stop()
  }
  if (!failed) {
    console.log(`\n\u8868\u982d\u6b04\u9593\u7dda\u4e00\u81f4\u6027: ${STORIES.length} \u5247\u6545\u4e8b\u3001\u5171 ${total} \u689d\u7dda\u5168\u90e8\u5408\u898f`)
    process.exit(0)
  }
  console.error('\n\u898f\u683c `data-table.spec.md`\u300cHeader vs Body \u7684\u8996\u89ba\u5340\u9694\u300d\u8981\u6c42\u4e00\u822c\u975e frozen \u6b04\u908a\u754c\u662f\u540c\u4e00\u7a2e\u77ed\u7dda\u3002')
  console.error('\u8868\u982d\u77ed\u7dda\u7531 `ResizeHandle` \u9644\u5e36\u756b,\u800c\u7cfb\u7d71\u6b04(\u9078\u53d6 / \u62d6\u62c9 / \u5217\u52d5\u4f5c)\u4e0d\u6e32\u67d3\u5b83 ——')
  console.error('\u9019\u6b63\u662f 2026-09-24 \u9078\u53d6\u6b04\u6574\u689d\u7dda\u6d88\u5931\u7684\u6839\u56e0\u3002\u7cfb\u7d71\u6b04\u8981\u81ea\u5df1\u639b `dtHeaderColDivider`\u3002')
  process.exit(1)
}
