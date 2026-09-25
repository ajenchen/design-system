// Probe — Windows-like persistent scrollbar 在 DataTable rounded outer 是否仍溢出
//
// **量測工具,不是閘**(沒有任何 workflow / npm script 呼叫它;gate-reachability-baseline.json 列為已知無呼叫端)。
//
// 環境:macOS overlay scrollbar(0px),不能直接看 Windows 17px persistent。
// 策略:Playwright + Chromium + 注入 CSS 強制 17px persistent V+H scrollbar(關 -webkit-appearance: none),
//       模擬 Win/Linux native 視覺,截圖 + 量 bounding rect 偵測溢出。
//
// 跑法:
//   node scripts/probe-windows-scrollbar.mjs [--static=<dir>]     // 預設從 storybook-static 的本次獨佔快照供檔
//   STORYBOOK_URL=http://localhost:6006 node scripts/probe-windows-scrollbar.mjs   // 改量執行中的 Storybook(dev server)
//
// 2026-09-25 改寫(全部瀏覽器閘同一套):
//   - 啟動改用 lib/launch-browser.mjs 的 launchBrowser:原本 `chromium.launch` 少了沙箱必要參數,在本 repo 沙箱根本起不來。
//     另拿掉 Playwright headless 預設的 `--hide-scrollbars`(ignoreDefaultArgs)—— 帶著它任何捲軸厚度永遠量到 0
//     (meta-patterns M32(e);data-table-scrollbar-visibility.mjs 等同做法),這支 probe 的量測值才有意義。
//   - 開 story 改用 lib/launch-browser.mjs 的 openStory:渲染完成(含 play)+ render-health + 被量的 DataTable 捲動區本身 +
//     版面連續 10 影格靜止。取代原本「networkidle + 固定睡 1000ms」(兩者都是「畫面就緒」的代理)。
//   - 原本 story 不存在 / 沒渲染出捲動區時印「⚠ … skip」、例外被 catch 後照樣印「✓ probe complete」並 exit 0。
//     現在 story 開不起來 = 儀器失效:點名 story、附同源 404,結尾 exit 1(量測途中丟例外同樣 exit 1)—— 沒量到不是「沒溢出」。
//
// 輸出:
//   - tmp/scrollbar-probe/{story-label}-baseline.png       — DS 原樣(macOS overlay)
//   - tmp/scrollbar-probe/{story-label}-windows-sim.png    — 強制 17px 後
//   - tmp/scrollbar-probe/{story-label}-corner-zoom.png    — 右下角 zoom(scrollbar corner 區)
//   - tmp/scrollbar-probe/report.json                      — 數值報告(含沒量到的 story 與原因)

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const staticArg = process.argv.find((a) => a.startsWith('--static='))?.slice('--static='.length)
const OUT_DIR = resolve('tmp/scrollbar-probe')

// 4 個有 V+H scroll 的 story（涵蓋 type 多樣 / 多 size / pinned / virtual)
const STORIES = [
  { id: 'design-system-components-datatable-展示--column-types', label: 'column-types' },
  { id: 'design-system-components-datatable-展示--all-sizes', label: 'all-sizes' },
  { id: 'design-system-components-datatable-展示--pinned-columns', label: 'pinned-columns' },
  { id: 'design-system-components-datatable-展示--virtual-scroll', label: 'virtual-scroll' },
]

// 注入「Windows 風格」scrollbar CSS（chromium webkit pseudo-elements）
const WIN_SCROLLBAR_CSS = `
  * {
    /* 強制顯持久 17px V/H scrollbar（取消 macOS overlay） */
    scrollbar-width: auto !important;
  }
  *::-webkit-scrollbar {
    width: 17px !important;
    height: 17px !important;
    -webkit-appearance: none !important;
    background: #f0f0f0;
  }
  *::-webkit-scrollbar-thumb {
    background: #888;
  }
  *::-webkit-scrollbar-corner {
    background: #f0f0f0;
  }
`

async function probeStory(page, story, base, notFound) {
  const url = `${base}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`
  console.log(`\n── ${story.label} ──`)
  console.log(`url: ${url}`)
  // 渲染完成(含 play)+ render-health + DataTable 捲動區本身 + 版面連續 10 影格靜止;開不起來丟 StoryRenderInstrumentError(呼叫端記成沒量到)
  await openStory(page, url, { waitFor: '[data-datatable-hscroll]', settleFrames: 10, notFound })

  // baseline (macOS overlay)
  await page.screenshot({ path: resolve(OUT_DIR, `${story.label}-baseline.png`), fullPage: false })

  // 注入 Windows-sim CSS
  await page.addStyleTag({ content: WIN_SCROLLBAR_CSS })
  // 500ms:等捲軸變成 17px 之後 DataTable 的 ResizeObserver 重新量寬、重畫(被等的元素早已在畫面上,不是等渲染)
  await page.waitForTimeout(500)
  // 強制 reflow
  await page.evaluate(() => document.body.getBoundingClientRect())

  // 拿關鍵 element rect
  const measurements = await page.evaluate(() => {
    const datatable = document.querySelector('[data-datatable-hscroll]')
    if (!datatable) return null
    const outer = datatable.closest('.rounded-md, [class*="rounded-md"]') || datatable.parentElement
    const dRect = datatable.getBoundingClientRect()
    const oRect = outer.getBoundingClientRect()
    const scrollbarBoxV = {
      // V scrollbar 視覺 box（內 padding-box right edge → outer right edge）
      right: dRect.right,
      bottom: dRect.bottom,
      width: datatable.offsetWidth - datatable.clientWidth,   // V scrollbar 真實寬
      height: datatable.offsetHeight - datatable.clientHeight, // H scrollbar 真實高
    }
    const outerStyles = window.getComputedStyle(outer)
    return {
      datatable: { left: dRect.left, top: dRect.top, right: dRect.right, bottom: dRect.bottom, w: dRect.width, h: dRect.height },
      outer: { left: oRect.left, top: oRect.top, right: oRect.right, bottom: oRect.bottom, w: oRect.width, h: oRect.height, borderRadius: outerStyles.borderRadius, overflow: outerStyles.overflow },
      scrollbar: scrollbarBoxV,
      // 關鍵指標:scrollbar 物理位置是否在 outer rounded corner 之內
      gapToOuterRight: oRect.right - dRect.right,
      gapToOuterBottom: oRect.bottom - dRect.bottom,
    }
  })

  console.log('  measurements:', JSON.stringify(measurements, null, 2))

  // Windows-sim screenshot
  await page.screenshot({ path: resolve(OUT_DIR, `${story.label}-windows-sim.png`), fullPage: false })

  // 右下角 corner zoom(scrollbar corner 區)
  const cornerClip = measurements ? {
    x: Math.max(0, measurements.outer.right - 60),
    y: Math.max(0, measurements.outer.bottom - 60),
    width: 120,
    height: 120,
  } : null
  if (cornerClip) {
    await page.screenshot({ path: resolve(OUT_DIR, `${story.label}-corner-zoom.png`), clip: cornerClip })
  }

  return { story: story.label, ...measurements }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  // STORYBOOK_URL 指定時量執行中的 Storybook(沒有伺服器端 404 帳本);否則從 --static(預設 storybook-static)的快照供檔
  const server = process.env.STORYBOOK_URL
    ? null
    : await startA11yStaticServer({ rootDirectory: resolve(staticArg ?? 'storybook-static'), defaultFile: 'iframe.html' })
  const base = server ? server.origin : process.env.STORYBOOK_URL
  const browser = await launchBrowser({
    // 拿掉 headless 預設的 --hide-scrollbars:帶著它捲軸厚度永遠是 0(M32(e)),下面注入的 17px 捲軸量不到
    ignoreDefaultArgs: ['--hide-scrollbars'],
    // 關 macOS Chromium overlay scrollbar → 強制 always-visible 17px persistent bar
    // 模擬 Windows / Linux native(同 Chromium engine,scrollbar 視覺接近 Win)
    args: [
      '--disable-features=OverlayScrollbar',
      '--disable-features=OverlayScrollbars',
      '--enable-features=ForceWebContentsDarkMode=false',
    ],
  })
  const report = []
  const notMeasured = []
  const errored = []
  try {
    // 縮小 viewport(900×600)強迫 column-types(內容寬 ~1400)+ virtual(高 500+) overflow
    // 從而真的看到 V+H scrollbar 一起出現的 corner 區
    // 只開一個 context、一個 page 逐 story 導覽(--single-process 沙箱下不開第二個 context;launch-browser.mjs 檔頭)
    const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    for (const story of STORIES) {
      try {
        report.push(await probeStory(page, story, base, server?.notFound ?? null))
      } catch (e) {
        if (e instanceof StoryRenderInstrumentError) {
          console.log(`  ✗ ${e.message}`)
          notMeasured.push({ story: story.label, id: story.id, reason: e.detail })
        } else {
          console.error(`  ✗ ${story.label} 量測途中丟例外:`, e.message)
          errored.push({ story: story.label, id: story.id, error: String(e.message).split('\n')[0] })
        }
      }
    }
  } finally {
    await browser.close()
    await server?.stop()
  }

  await writeFile(resolve(OUT_DIR, 'report.json'), JSON.stringify({ measured: report, notMeasured, errored }, null, 2))
  console.log(`\noutput: ${OUT_DIR}/`)
  if (notMeasured.length || errored.length) {
    // 沒量到 ≠ 沒溢出:列出每一則,不印「complete」
    console.log(`✗ probe 不完整:量到 ${report.length}/${STORIES.length} 則;沒量到(儀器失效,不是產品裁決)${notMeasured.length} 則${notMeasured.length ? `:${notMeasured.map((n) => n.story).join(', ')}` : ''};量測途中丟例外 ${errored.length} 則`)
    if (server?.notFound.length) console.log(`同源 404:${[...new Set(server.notFound)].join(', ')}`)
    process.exit(1)
  }
  console.log(`✓ probe complete — ${report.length}/${STORIES.length} stories captured`)
}

main().catch((e) => { console.error(e); process.exit(1) })
