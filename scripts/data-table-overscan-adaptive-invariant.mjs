#!/usr/bin/env node
/**
 * 預掛緩衝必須隨機器能力自適應(2026-09-12)
 *
 * ## 背景
 *
 * TanStack Virtual 的 `defaultRangeExtractor` 只渲染 `[start − overscan, end + overscan]`
 * (`@tanstack/virtual-core/dist/esm/index.js:7-14`),範圍外的列一 commit 就卸載,
 * **沒有任何「保留舊列直到新列就緒」的機制**。緩衝原本固定 5 列 × 40px = 200px,
 * 而一次普通滾輪就是 1000px —— 結構上差 5 倍,所以快速捲動一定會露出背景。
 *
 * AG Grid 的 `rowBuffer` 預設每側 **10 列**,文件逐字:「This is to act as a buffer as
 * **on some slower machines and browsers, a blank space can be seen as the user scrolls**」
 * (ag-grid.com/javascript-data-grid/dom-virtualisation)。連它都不宣稱能消除空白,
 * 而是用兩倍於我們的緩衝壓到看不見。
 *
 * 我們比 AG Grid 多一樣東西:**實測的每列成本**。所以緩衝按機器付得起的量給 ——
 * 快機器加到 10(實測 1× 的空白從 30 幀 / 67ms 變成 0–2 幀 / 0–17ms),
 * 慢機器縮回下限讓列殼機制接手(固定 10 在 4× 反而把最長空白從 451ms 惡化到 566ms)。
 *
 * ## 這支閘驗什麼
 *
 * A1 快機器(不節流)的緩衝要達到 AG Grid 的 10
 * A2 慢機器(4× 節流)的緩衝要縮回去(< 10)
 * A3 兩者必須**不同** —— 相同就代表機制根本沒在自適應,兩條各自的門檻可能只是碰巧成立
 *
 * 對照組(`--selftest`):兩次都用 4× 跑,自適應無從表現 → A3 必須紅。
 * 少了這一步,A3 的綠燈只證明「這次剛好不同」,不證明比較邏輯有效。
 *
 *   node scripts/data-table-overscan-adaptive-invariant.mjs [--build=<dir>] [--selftest]
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = arg('build', join(REPO, 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const AG_GRID_ROW_BUFFER = 10
const STORY = 'design-system-components-datatable-展示--roadmap-all-in-one'

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
let fail = 0
const ck = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`); if (!ok) fail++ }

// 每次取樣各自啟動瀏覽器:沙箱參數帶 `--single-process`,關掉一個 page 會把整個瀏覽器帶走
// (實測 `browser.newPage: Target page, context or browser has been closed`)。
const sample = async (cpu) => {
  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
  await page.addInitScript(() => { window.__DT_DEBUG_SHELL = true })
  const cdp = await page.context().newCDPSession(page)
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
  await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelectorAll('[data-index]').length > 5, { timeout: 90_000 })
  await page.waitForTimeout(2000)
  // 要先捲過幾步,costPerRow 才會從初始種子收斂到這台機器的實測值
  await page.mouse.move(700, 400)
  for (let i = 0; i < 10; i += 1) { await page.mouse.wheel(0, 500); await page.waitForTimeout(24) }
  await page.waitForTimeout(600)
  const state = await page.evaluate(() => document.querySelector('[data-shell-state]')?.getAttribute('data-shell-state') ?? '')
  await browser.close()
  const kv = Object.fromEntries(state.split(' ').filter(Boolean).map((s) => s.split('=')))
  return { overscan: Number(kv.overscan), costPerRow: Number(kv.costPerRow) }
}

try {
  const fast = await sample(1)
  const slow = await sample(SELFTEST ? 1 : 4) // 對照組:兩次都用同一檔位,自適應無從表現
  console.log(`  快機器:overscan=${fast.overscan} costPerRow=${fast.costPerRow}`)
  console.log(`  ${SELFTEST ? '對照組(同檔位)' : '慢機器(4×)'}:overscan=${slow.overscan} costPerRow=${slow.costPerRow}`)
  if (!Number.isFinite(fast.overscan) || !Number.isFinite(slow.overscan)) {
    console.error('✗ 讀不到 data-shell-state 的 overscan —— 這次什麼都沒驗到')
    process.exit(1)
  }
  ck(`A1 快機器的緩衝達到 AG Grid 的 ${AG_GRID_ROW_BUFFER} 列`, fast.overscan === AG_GRID_ROW_BUFFER, `得 ${fast.overscan}`)
  if (!SELFTEST) ck('A2 慢機器(4×)的緩衝縮回去', slow.overscan < AG_GRID_ROW_BUFFER, `得 ${slow.overscan}(costPerRow ${slow.costPerRow}）`)
  ck('A3 兩種機器的緩衝不同(證明真的在自適應)', fast.overscan !== slow.overscan, `快 ${fast.overscan} / 慢 ${slow.overscan}`)
} finally {
  await server.stop()
}

if (SELFTEST) {
  if (fail === 0) { console.error('\n✗ 對照組:兩次都用同一檔位,A3 卻沒紅 —— 比較邏輯失效'); process.exit(1) }
  console.log(`\n✓ 對照組:如預期紅(${fail} 條)`)
  process.exit(0)
}
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 預掛緩衝隨機器能力自適應')
process.exit(fail ? 1 : 0)
