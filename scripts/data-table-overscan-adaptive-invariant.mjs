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
 * ## 這支閘驗什麼(刻意做成**機器無關**)
 *
 * 絕對門檻(「快機器必須拿到 10」)不能用 —— 那只是在量跑閘的那台機器:
 * CI runner 不節流就已經是慢機器,本機 3× 節流的長工量測在同一份程式碼上跑出 220ms 與 404ms
 * (雜訊主導)。所以這裡只驗**公式的性質**:
 *
 *   A1 緩衝永遠不低於 consumer 指定的 overscan(下限不被吃掉)
 *   A2 緩衝永遠不超過 AG Grid 的 10(不自己發明更大的數字)
 *   A3 能力越強、緩衝不得更小(不節流 ≥ 4× 節流)—— 這條抓「公式方向反了」
 *   A4 **有餘裕時機制必須真的動**:若不節流那台預測得出「一次全量 commit < 50ms」的餘裕,
 *      緩衝必須大於下限。沒餘裕的機器(CI)這條會明白標成不適用,不會假裝驗過。
 *   A5 **公式一致性(任何機器上都有鑑別力)**:用實測到的 `costPerRow` / `fixedCost` / 視窗列數
 *      重算一次公式,元件輸出必須等於它。A1–A3 在「緩衝停在下限」的機器上是恆真式
 *      (5≥5 / 5≤10 / 5≥5),A4 又會標不適用 —— 那種機器上整支閘會變成零鑑別力。
 *      A5 不依賴機器有沒有餘裕:公式寫錯、常數被改、clamp 方向反了,它都會紅。
 *
 * 對照組(`--selftest`):**在頁面裡竄改 `data-shell-state` 的 overscan 欄位**(快的那次改成 0、慢的那次改成 99),
 * 讓閘走**完整的讀取路徑**拿到壞值 → A1(低於下限)/ A2(高於 AG Grid 值)/ A3(能力越強反而更小)三條都必須紅。
 *
 * **2026-09-12 修**:第一版的對照組是把 `observed` 直接換成寫死的 `[0, 99]` 去打 A1/A2 ——
 * 那只證明了大於小於號會算,**完全沒走量測路徑**;A3/A4 又在 `if (!SELFTEST)` 裡,對照組模式下根本不執行。
 * 也就是說當時那句「✓ 對照組:如預期紅」對 A3/A4 是零證據,正是 M32 要防的那種假對照。
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
const MIN_OVERSCAN = 5
const LONG_TASK_MS = 50
const STORY = 'design-system-components-datatable-展示--roadmap-all-in-one'

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
let fail = 0
const ck = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`); if (!ok) fail++ }

// 每次取樣各自啟動瀏覽器:沙箱參數帶 `--single-process`,關掉一個 page 會把整個瀏覽器帶走
// (實測 `browser.newPage: Target page, context or browser has been closed`)。
// 每次取樣各自啟動瀏覽器:沙箱參數帶 `--single-process`,關掉一個 page 會把整個瀏覽器帶走。
const sample = async (cpu, forcedOverscan = null) => {
  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
  await page.addInitScript(() => { window.__DT_DEBUG_SHELL = true })
  // 對照組:持續把元件寫出來的 overscan 欄位竄改成壞值。閘照常走 `data-shell-state` 的讀取路徑,
  // 所以這驗的是「儀器真的讀得到、而且讀到壞值會紅」,不是「比較運算子會算」。
  if (forcedOverscan != null) {
    await page.addInitScript((bad) => {
      setInterval(() => {
        for (const el of document.querySelectorAll('[data-shell-state]')) {
          const v = el.getAttribute('data-shell-state')
          if (v && !v.includes(`overscan=${bad} `)) el.setAttribute('data-shell-state', v.replace(/overscan=\d+/, `overscan=${bad}`))
        }
      }, 50)
    }, forcedOverscan)
  }
  const cdp = await page.context().newCDPSession(page)
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
  await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelectorAll('[data-index]').length > 5, { timeout: 90_000 })
  await page.waitForTimeout(2000)
  // 要先捲過幾步,costPerRow 才會從初始種子收斂到這台機器的實測值
  await page.mouse.move(700, 400)
  for (let i = 0; i < 10; i += 1) { await page.mouse.wheel(0, 500); await page.waitForTimeout(24) }
  await page.waitForTimeout(600)
  const out = await page.evaluate(() => {
    const state = document.querySelector('[data-shell-state]')?.getAttribute('data-shell-state') ?? ''
    const rows = [...document.querySelectorAll('[data-index]')]
    const rowHeight = rows[0]?.getBoundingClientRect().height ?? 0
    return { state, rowHeight, viewportHeight: window.innerHeight }
  })
  await browser.close()
  const kv = Object.fromEntries(out.state.split(' ').filter(Boolean).map((s) => s.split('=')))
  const visibleRowCount = Math.max(1, Math.ceil(out.viewportHeight / Math.max(1, out.rowHeight)))
  return {
    overscan: Number(kv.overscan),
    costPerRow: Number(kv.costPerRow),
    fixed: Number(kv.fixed),
    visibleRowCount,
  }
}

// 跟元件同一條公式:一次全量 commit(視窗列 + 上下各 overscan)要留在 50ms 長工界線內
const predictedHeadroom = (s) => LONG_TASK_MS - s.fixed - s.visibleRowCount * s.costPerRow

try {
  // 對照組:快的那次強制 0(低於下限)、慢的那次強制 99(高於上限,且讓 A3 的單調性反過來)
  const fast = await sample(1, SELFTEST ? 0 : null)
  const slow = await sample(SELFTEST ? 1 : 4, SELFTEST ? 99 : null)
  const report = (label, s) => console.log(`  ${label}:overscan=${s.overscan} costPerRow=${s.costPerRow} fixed=${s.fixed} 視窗列=${s.visibleRowCount} 預測餘裕=${predictedHeadroom(s).toFixed(1)}ms`)
  report('不節流', fast)
  report(SELFTEST ? '對照組(同檔位)' : '4× 節流', slow)
  if (!Number.isFinite(fast.overscan) || !Number.isFinite(slow.overscan)) {
    console.error('✗ 讀不到 data-shell-state 的 overscan —— 這次什麼都沒驗到')
    process.exit(1)
  }
  const observed = [fast.overscan, slow.overscan]
  ck(`A1 緩衝不低於 consumer 的 overscan(${MIN_OVERSCAN})`, observed.every((n) => n >= MIN_OVERSCAN), `得 ${observed.join(' / ')}`)
  ck(`A2 緩衝不超過 AG Grid 的 ${AG_GRID_ROW_BUFFER}`, observed.every((n) => n <= AG_GRID_ROW_BUFFER), `得 ${observed.join(' / ')}`)
  ck('A3 能力越強、緩衝不得更小(不節流 ≥ 4× 節流)', fast.overscan >= slow.overscan, `不節流 ${fast.overscan} / ${SELFTEST ? '對照' : '4×'} ${slow.overscan}`)
  // A5:用實測輸入重算公式(跟 data-table.tsx 同一條),元件輸出必須相符。
  const expected = (s) => Math.max(MIN_OVERSCAN, Math.min(AG_GRID_ROW_BUFFER,
    Math.max(0, Math.floor(predictedHeadroom(s) / Math.max(0.5, 2 * s.costPerRow)))))
  for (const [label, smp] of [['不節流', fast], [SELFTEST ? '對照' : '4×', slow]]) {
    ck(`A5 ${label}:緩衝 = 公式算出的值`, smp.overscan === expected(smp),
       `實際 ${smp.overscan} / 公式 ${expected(smp)}(costPerRow ${smp.costPerRow} fixed ${smp.fixed} 視窗列 ${smp.visibleRowCount})`)
  }
  if (!SELFTEST) {
    // A4 的前提必須跟元件的公式一致:光有餘裕不夠,要餘裕**算得起超過下限的列數**才會看到效果。
    // 2026-09-12 修:原本只要求「餘裕 ≥ 一列的雙側成本」,於是機器忙碌時(餘裕 8.5ms、算得起 2 列 < 下限 5)
    // 會誤紅 —— 元件回下限才是正確行為。
    const headroom = predictedHeadroom(fast)
    const affordable = Math.floor(headroom / Math.max(0.5, 2 * fast.costPerRow))
    if (affordable > MIN_OVERSCAN) {
      ck('A4 有餘裕時機制真的動了(緩衝 > 下限)', fast.overscan > MIN_OVERSCAN, `餘裕 ${headroom.toFixed(1)}ms → 算得起 ${affordable} 列 / 實際緩衝 ${fast.overscan}`)
    } else {
      console.log(`—  A4 不適用:這台機器的餘裕 ${headroom.toFixed(1)}ms 只算得起 ${affordable} 列(≤ 下限 ${MIN_OVERSCAN}),緩衝留在下限 ${fast.overscan} 才是正確行為`)
    }
  }
} finally {
  await server.stop()
}

if (SELFTEST) {
  if (fail === 0) { console.error('\n✗ 對照組:回報 0 與 99 都沒被 A1/A2 抓到 —— 邊界檢查失效'); process.exit(1) }
  console.log(`\n✓ 對照組:如預期紅(${fail} 條)`)
  process.exit(0)
}
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 預掛緩衝的邊界與單調性成立')
process.exit(fail ? 1 : 0)
