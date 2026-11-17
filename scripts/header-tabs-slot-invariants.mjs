#!/usr/bin/env node
// Header tabsSlot W2 invariants test — 守 header-canonical.spec.md Rule W1/W2 的 render-level 契約
// (契約實體 = chrome-header.tsx HEADER_TABS_SLOT_WRAPPER_CLASS `[&_[data-slot=tabs-list]]:px-[...]`
//  + tabs.tsx 三種 overflow 模式 tablist 自標 data-slot="tabs-list"):
//   (W2-a) tablist computed paddingLeft/paddingRight === 解析後 var(--layout-space-loose)
//   (W2-b) 解析後 --layout-space-loose === '16px'(md 預設 density;把「token 鏈斷」跟
//          「density 環境漂移」分開報錯)
//   (W2-c) 第一個 [role=tab] rect.left − header rect.left === 16 ± 0.5px(M32 pixel-quantified:
//          視覺意圖 = triggers 對齊 header content row,與實作 selector 機制無關)
//   (W1)   分頁列底線連成整條、右端達 header 邊緣(tabs.spec.md「TabsList 容器寬度」),**以像素判定**(2026-11-17):
//          W1-連續 —— 在 tablist 底邊那一列(分隔線所在的像素列)沿 header 全寬截 1px 高的圖,逐點不能是背景色;
//                    「背景」= 同一個 x 往下兩列(header 底下的留白);「是線」= 與背景的差 ≥ 灰線本身對背景差的一半
//                    (灰線本身 = 在同一塊背景上放一個 bg-divider 探針實拍;選中底線的主色差更大,也算有線)。
//                    紅的時候印出斷開的 x 範圍(頁面座標 + 相對 header 左緣)。
//          W1-選中底線 —— 選中 tab 正中那一行,分隔線那一列與它上面一列必須同色且都是強對比:選中的 2px 主色底線
//                    沒有被灰線蓋掉下半(灰線疊在主色上 = 下半變暗 9%,這一條會紅)。前提:選中 tab 不在遮罩範圍內
//                    (有遮罩的那一側,離捲動容器邊緣 ≥ 箭頭 32 + 淡出 16 = 48px),否則記儀器失效,不判產品。
//          W1-寬(輔助,保留原本的寬度量測):none 量 tablist、scroll 量捲動容器、menu 量捲動區 + ⌄ 的整列 = header 寬。
//          **這一條是代理量**:2026-11-17 前 W1 只有它,溢出模式的灰線被淡出遮罩吃掉(scroll 右箭頭底下沒有線、
//          menu 捲動區右端淡掉後才接上 ⌄ 的線)時寬度全對 → 一直綠。判定以 W1-連續 / W1-選中底線的像素為準。
//
// 對照組(`--selftest`;只跑對照,不跑正常量測,正常量測是不帶旗標的那一趟):
//   A「灰線畫回遮罩內」—— 注入 CSS 把 [data-tabs-baseline] 藏起來、把灰線顏色還給捲動容器裡的 TabsList border
//     (= 修法前的根因:線畫在帶 mask-image 的捲動容器裡)→ scroll / menu 兩則的 W1-連續都必須變紅(印出斷開範圍)。
//   B「灰線蓋到選中底線上」—— 注入 CSS 把 [data-tabs-baseline] 的 z-index 拉高 → scroll / menu 兩則的 W1-選中底線都必須變紅。
//   W3「清空 overlay」(見 W3 段)→ W3 兩條都必須變紅。
//   任一組沒有如期變紅 = 那一段的綠燈不算證據,exit 1。
//
// 病根(2026-07-30 F1):beta.86 inlineAction overlay 包 `<div class="relative">` 把 v3
// direct-child selector `[&>[role=tablist]]` 斷鏈 → px-loose 靜默消失(computed 0px),
// source-level gate(layout-space-utility-invariant)抓不到 render 值 → 本 gate 補 render-level 防線。
// 改 HEADER_TABS_SLOT_WRAPPER_CLASS / TabsList overflow DOM 必跑此 script,fail → exit 1 阻 commit。
// Run: `npm run test:header-tabs-slot-invariants` 或 `node scripts/header-tabs-slot-invariants.mjs [--selftest] [--build=<storybook 建置目錄>]`

import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { openStory, StoryRenderInstrumentError, launchBrowserOrSkip, requireStorybookBuild } from './lib/launch-browser.mjs'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const { PNG } = createRequire(join(ROOT, 'package.json'))('pngjs')
// `--build=<dir>`(預設 storybook-static):量另一份建置。給對照組用 —— 在建置的複本上注入違規,不必動工作樹的 storybook-static。
const STATIC = resolve(ROOT, process.argv.find((a) => a.startsWith('--build='))?.slice('--build='.length) ?? 'storybook-static')

// 沒有建置 → MISSING-BUILD(缺前置,不是產品裁決;lib/launch-browser.mjs 的共用標記與退出碼)
requireStorybookBuild(join(STATIC, 'iframe.html'))

// ── Stale-build guard(idiom = storybook-smoke-test.mjs 2026-07-05 自抓包 codify)──────────
// 本 script 驗的是 storybook-static/ 靜態 build — 若 build 早於 src 最新改動,整輪量測 =
// 驗舊碼的假綠燈。Guard:storybook-static/iframe.html mtime 必 >= src 最新 tsx/ts/css mtime,
// 否則 fail-loud(fail-closed)。純 Node 實作零 shell。
{
  const { readdirSync: rd, statSync: st } = await import('node:fs')
  const staticMtime = st(join(STATIC, 'iframe.html')).mtimeMs
  const stale = []
  const walk = (dir) => {
    for (const e of rd(dir, { withFileTypes: true })) {
      if (stale.length >= 5) return
      const p = join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(p) }
      else if (/\.(tsx|ts|css)$/.test(e.name) && st(p).mtimeMs > staticMtime) stale.push(p)
    }
  }
  for (const root of [join(ROOT, 'packages/design-system/src'), join(ROOT, 'src')]) {
    if (existsSync(root)) walk(root)
  }
  if (stale.length) {
    console.error('✗ storybook-static/ 比 src 舊(stale build = 假綠燈)。先跑 `npm run build-storybook` 再量測。')
    console.error('  比 build 新的檔案(前 5):')
    for (const p of stale) console.error('  ' + p.replace(ROOT + '/', ''))
    console.error(`  build mtime: ${new Date(staticMtime).toISOString()}`)
    process.exit(1)
  }
}

// 供檔:從本次獨佔的建置快照(lib/a11y-static-server.mjs,2026-09-25 起;全部瀏覽器閘同一支)。
// 原本是 sandboxed-verify-browser 的 serveStaticDir:讀**活的** storybook-static、固定 7501 埠 ——
// 別人同時 build-storybook 清空目錄就全部 404(2026-09-24 data-table 閘踩過),而且沒有 404 帳本可以印。
//
// 啟動:lib/launch-browser.mjs 的 launchBrowserOrSkip(2026-09-25 收斂,M17)。原本這支自己走另一條路 ——
// `resolveProvisionedPlaywrightRuntime` 把 PLAYWRIGHT_BROWSERS_PATH 釘到 lockfile 對應的瀏覽器,再經 sandboxed-verify-browser
// 的 launchVerifyBrowser(先試多程序、失敗再退 `--single-process --no-zygote`)。逐項查過,**本閘不需要那條特殊路徑**:
//   - 量的是 computed padding 字串、token 解析值與 getBoundingClientRect 的 16±0.5px 幾何,不依賴任何 Chromium 版本特有的
//     字型光柵 / 截圖像素(那才是「必須釘死瀏覽器版本」的理由);
//   - 版本本來就釘著:playwright-core 只會去找 browsers.json 裡那一個 revision(本機 / CI 都是 chromium-1217),找不到就啟動失敗;
//     「瀏覽器裝在 repo 的 node_modules(PLAYWRIGHT_BROWSERS_PATH=0)」的 lane(focus-deep-gates 等)在 job 層就設好這個環境變數,
//     gate-meta 與 harness runner 也各自替子行程設好(disposable-repository-snapshot / harness-runner),不需要閘自己再解析一次;
//   - 同一個 CI job(ci.yml verify-browser-field-dialog-steps,2026-10-14 自 verify-browser-interaction 拆出;`npx playwright install chromium` 裝在預設快取)裡其他瀏覽器閘都是
//     launchBrowser 啟動,只有這支例外 = 平行實作(M17)。
// 起不了:一般環境 SKIPPED-ENV exit 0;CI 的瀏覽器 job(GOVERNANCE_BROWSER_REQUIRED=1)BROWSER-REQUIRED exit 1,不准略過。
// 原本起不了是未攔截例外(exit 1、沒有標記),runtime 解析失敗還是一句與瀏覽器無關的 throw —— 兩者都不在共用政策裡。
const served = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
const browser = await launchBrowserOrSkip({}, {
  cleanup: () => served.stop(),
  hint: '請於可開瀏覽器的環境執行 npm run test:header-tabs-slot-invariants 補驗。',
})
console.log('ℹ transport=snapshot-http-server launch=launchBrowser(lib/launch-browser.mjs)')
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const failures = []
const passes = []
/** 儀器失效(story 沒渲染完成 / 缺檔 / 等不到 tablist):沒量到,不是產品裁決 —— 但一律 exit 1,不算通過也不准略過 */
const instrumentFailures = []

function record(invariant, label, pass, detail = '') {
  if (pass) passes.push(`✓ ${invariant} | ${label}`)
  else failures.push(`✗ ${invariant} | ${label} | ${detail}`)
}

/**
 * 開一則 story 並證明它真的渲染完成(lib/launch-browser.mjs 的 openStory,全部瀏覽器閘共用)。
 * 原本是 networkidle + 等 tablist 15 秒 + 固定睡 400/500ms:缺 story 檔時只記一條「tablist 未出現」,
 * 說不出是哪個檔 404,也分不出是元件壞了還是儀器沒拿到檔。
 * 現在:Storybook 回報渲染完成 → tablist(量測前提)出現 → beforeSettle → 連續 10 影格靜止才量。
 * 等不到 → 記成儀器失效(點名 story、附 Storybook 錯誤原文與 404),回 false,該段不量。
 */
async function loadStory(id, label, { beforeSettle = null } = {}) {
  try {
    await openStory(page, `${served.origin}/iframe.html?id=${id}&viewMode=story`, {
      waitFor: '[data-slot="tabs-list"]', settleFrames: 10, beforeSettle, notFound: served.notFound,
    })
    return true
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    instrumentFailures.push(`✗ ${label} | ${error.message}`)
    return false
  }
}

// 3 個 tabsSlot × overflow story(story ID = export name;改 export 名 = 此處同步改,
// story 載入失敗 → 儀器失效(exit 1),禁 silent skip 假綠)
const STORIES = [
  { id: 'design-system-patterns-header-anatomy--with-tabs', mode: 'none', label: 'tabsSlot×none' },
  { id: 'design-system-patterns-header-anatomy--with-tabs-overflow-scroll', mode: 'scroll', label: 'tabsSlot×scroll' },
  { id: 'design-system-patterns-header-anatomy--with-tabs-overflow-menu', mode: 'menu', label: 'tabsSlot×menu' },
]

const fmt = (v) => (v == null ? 'null' : typeof v === 'number' ? v.toFixed(2) : String(v))
/** `--selftest`:只跑對照組(檔頭 A / B + W3),每一組都必須如期變紅;正常量測是不帶旗標的那一趟 */
const SELFTEST = process.argv.includes('--selftest')

/** W2 + W1-寬(輔助)+ 結構檢查。story 已由呼叫端載入。 */
async function measureLayout(story) {
  const d = await page.evaluate(() => {
    const header = document.querySelector('header')
    const tl = document.querySelector('[data-slot="tabs-list"]')
    if (!header || !tl) return { error: 'header 或 [data-slot=tabs-list] 不存在' }
    const cs = getComputedStyle(tl)
    const hr = header.getBoundingClientRect()
    const tr = tl.getBoundingClientRect()
    const firstTab = tl.querySelector('[role="tab"]')
    // scroll container = tablist 直接 parent 且 overflow-x auto/scroll(scroll/menu 模式才有)
    const parent = tl.parentElement
    const pOverflowX = parent ? getComputedStyle(parent).overflowX : null
    const sc = pOverflowX === 'auto' || pOverflowX === 'scroll' ? parent : null
    const scr = sc ? sc.getBoundingClientRect() : null
    const rowr = sc?.parentElement ? sc.parentElement.getBoundingClientRect() : null
    return {
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      resolvedLoose: cs.getPropertyValue('--layout-space-loose').trim(),
      headerLeft: hr.left, headerWidth: hr.width,
      tablistWidth: tr.width,
      firstTabLeft: firstTab ? firstTab.getBoundingClientRect().left : null,
      hasScrollContainer: !!sc,
      scLeft: scr ? scr.left : null, scWidth: scr ? scr.width : null,
      rowWidth: rowr ? rowr.width : null,
    }
  })
  if (d.error) {
    record('LOAD', `${story.label} story 量測(${story.id})`, false, d.error)
    return
  }

  // (W2-a) computed padding = 解析後 token(token 鏈通不通)
  record('W2-a', `${story.label} tablist paddingLeft = resolved var(--layout-space-loose)`,
    d.paddingLeft === d.resolvedLoose && d.paddingLeft !== '',
    `paddingLeft ${fmt(d.paddingLeft)} vs resolved '${fmt(d.resolvedLoose)}'(0px/不等 = wrapper 契約斷鏈)`)
  record('W2-a', `${story.label} tablist paddingRight = resolved var(--layout-space-loose)`,
    d.paddingRight === d.resolvedLoose && d.paddingRight !== '',
    `paddingRight ${fmt(d.paddingRight)} vs resolved '${fmt(d.resolvedLoose)}'`)

  // (W2-b) 解析值 = md 預設 16px(density 環境漂移獨立報錯)
  record('W2-b', `${story.label} resolved --layout-space-loose === '16px'(md 預設)`,
    d.resolvedLoose === '16px', `got '${fmt(d.resolvedLoose)}'(density 漂移或 token 改值)`)

  // (W2-c) M32 pixel-quantified:第一個 tab 左緣 − header 左緣 = 16 ± 0.5
  record('W2-c', `${story.label} 第一個 tab 左緣 − header 左緣 = 16±0.5px`,
    d.firstTabLeft !== null && Math.abs(d.firstTabLeft - d.headerLeft - 16) <= 0.5,
    `delta ${d.firstTabLeft === null ? 'no [role=tab]' : fmt(d.firstTabLeft - d.headerLeft)}(應 16;0 = px-loose 靜默消失)`)

  // (W1-寬,輔助)全寬 — 量測對象依 overflow 模式(tablist scroll/menu 是 min-w-full 可比容器寬)。
  // 這是代理量(容器寬對,不代表線畫得出來;2026-11-17 前溢出模式的線被遮罩吃掉時它照綠),判定以下方 W1-連續 的像素為準。
  if (story.mode === 'none') {
    record('W1-寬', `${story.label} 結構:none 模式無 scroll container`, !d.hasScrollContainer,
      'tablist parent 是 overflow-x 容器 — story 疑似 render 錯 overflow 模式')
    record('W1-寬', `${story.label} tablist 全寬 = header 寬 ±0.5`,
      Math.abs(d.tablistWidth - d.headerWidth) <= 0.5,
      `tablist ${fmt(d.tablistWidth)} vs header ${fmt(d.headerWidth)}(w-full 注入斷 = border 沒鋪滿)`)
  } else {
    record('W1-寬', `${story.label} 結構:${story.mode} 模式有 scroll container`, d.hasScrollContainer,
      'tablist parent 非 overflow-x 容器 — story 疑似 render 錯 overflow 模式,禁 silent skip')
    if (story.mode === 'scroll') {
      record('W1-寬', `${story.label} scroll container 全寬 = header 寬 ±0.5`,
        d.scWidth !== null && Math.abs(d.scWidth - d.headerWidth) <= 0.5,
        `container ${fmt(d.scWidth)} vs header ${fmt(d.headerWidth)}(arrows 是 absolute overlay 不佔寬)`)
    } else {
      // menu:⌄ navigator 觸發時 scroll container 讓出右側寬度給按鈕容器,兩者的 flex row
      // 才是「border 連成全寬一條線」的量測對象;未觸發時 row == scroll container(退化同 scroll)。
      record('W1-寬', `${story.label} scroll row(捲動區 + ⌄ 容器)全寬 = header 寬 ±0.5`,
        d.rowWidth !== null && Math.abs(d.rowWidth - d.headerWidth) <= 0.5,
        `row ${fmt(d.rowWidth)} vs header ${fmt(d.headerWidth)}`)
      record('W1-寬', `${story.label} scroll container 左緣貼齊 header 左緣 ±0.5`,
        d.scLeft !== null && Math.abs(d.scLeft - d.headerLeft) <= 0.5,
        `container.left ${fmt(d.scLeft)} vs header.left ${fmt(d.headerLeft)}`)
    }
  }
}

// ── W1 像素(2026-11-17):分頁列底線真的畫成整條,選中底線真的是 2px ─────────────────
// 病根:溢出模式的灰線原本是 TabsList 的 border-b,畫在帶 mask-image 的捲動容器裡 —— 遮罩淡化的是整個內容,
// 連線一起淡掉(scroll 右箭頭底下沒有線;menu 捲動區右端淡掉、⌄ 容器自己的 border 才接上 → 中間斷一格)。
// W1-寬 量容器寬,線被吃掉時寬度全對,所以一直綠。這一段直接看畫面。
/**
 * 一側遮罩最多吃進來的寬(px)= ARROW_BUTTON_WIDTH 32 + FADE_WIDTH 16(horizontal-overflow.tsx)。
 * 那一側**有遮罩**(還沒捲到底,判法同 use-overflow-items.ts 的 atStart / atEnd)時,選中 tab 中心要離該側至少這麼遠,上下兩列才可比
 */
const MASK_REACH = 48
/** 背景列 = 分隔線列往下第幾列(header 底下、TabsContent 的上方留白) */
const BG_ROW_OFFSET = 2
/** 選中底線上下兩列「同色」的容差(每個色版 0–255)。灰線(9% 黑)疊在主色上,下半會差約 20 */
const SAME_COLOR_TOLERANCE = 6
/** 灰線對背景的差小於這個值,就分不出線與背景 → 儀器失效,不判產品 */
const MIN_DIVIDER_CONTRAST = 6

const channelDiff = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
const rgb = (c) => `rgb(${c.join(',')})`

/** 截一塊(CSS px;DPR 1 時 = 裝置像素),回傳 (欄, 列) → [r, g, b] */
async function grab(clip) {
  const png = PNG.sync.read(await page.screenshot({ clip }))
  return (x, row) => {
    const i = (row * png.width + x) * 4
    return [png.data[i], png.data[i + 1], png.data[i + 2]]
  }
}

async function measureBaselinePixels(story, tag = '') {
  const label = `${story.label}${tag}`
  if (story.mode !== 'none') {
    // 前提:溢出模式要真的溢出、而且淡出遮罩已經掛上。遮罩是 useScrollEdges 量到溢出之後才由 React 設上的(非同步),
    // 量得太早,灰線就算畫在遮罩裡也是整條 —— 2026-11-17 CI(5f0c05f8)對照組 A 該紅沒紅、本機卻紅,就是慢機器上量在遮罩之前。
    // 等「那個狀態本身」,不等固定時間(M32 第四題);等不到 = 儀器失效,不是綠。
    const ready = await page.waitForFunction(() => {
      const sc = document.querySelector('[data-slot="tabs-list"]')?.parentElement
      if (!sc) return false
      const cs = getComputedStyle(sc)
      const mask = cs.maskImage && cs.maskImage !== 'none' ? cs.maskImage : cs.webkitMaskImage
      return sc.scrollWidth > sc.clientWidth + 1 && !!mask && mask !== 'none'
    }, null, { timeout: 10000 }).then(() => true, () => false)
    if (!ready) {
      instrumentFailures.push(`✗ ${label} | W1 像素量測前提:10 秒內沒有等到「內容溢出 + 淡出遮罩已掛上」—— 量不到要防的那種斷線`)
      return
    }
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  }
  const g = await page.evaluate(() => {
    const header = document.querySelector('header')
    const tl = document.querySelector('[data-slot="tabs-list"]')
    if (!header || !tl) return { error: 'header 或 [data-slot=tabs-list] 不存在' }
    const hr = header.getBoundingClientRect()
    const tr = tl.getBoundingClientRect()
    const sel = tl.querySelector('[role="tab"][aria-selected="true"]')
    const sr = sel ? sel.getBoundingClientRect() : null
    const parent = tl.parentElement
    const ox = parent ? getComputedStyle(parent).overflowX : null
    const scr = ox === 'auto' || ox === 'scroll' ? parent.getBoundingClientRect() : null
    return {
      dpr: devicePixelRatio, left: hr.left, right: hr.right, bottom: tr.bottom,
      sel: sr ? { left: sr.left, right: sr.right } : null,
      sc: scr ? {
        left: scr.left, right: scr.right,
        atStart: parent.scrollLeft <= 0,
        atEnd: parent.scrollLeft + parent.clientWidth >= parent.scrollWidth - 1,
      } : null,
    }
  })
  if (g.error) { instrumentFailures.push(`✗ ${label} | W1 像素量測前提:${g.error}`); return }
  // 前提:DPR 1、分隔線與 header 左右緣都落在整數像素上 —— 否則「那一列」不是一列,逐點判讀沒有意義
  const offGrid = [g.bottom, g.left, g.right].some((v) => Math.abs(v - Math.round(v)) > 0.01)
  if (g.dpr !== 1 || offGrid) {
    instrumentFailures.push(`✗ ${label} | W1 像素量測前提:DPR=${g.dpr}、tablist 底 ${fmt(g.bottom)}、header ${fmt(g.left)}–${fmt(g.right)} 不在整數像素上`)
    return
  }
  const x0 = Math.round(g.left)
  const width = Math.round(g.right) - x0
  const y = Math.round(g.bottom) - 1 // 分隔線列 = tablist border-box 最下面那一列
  // 列 0 = 選中底線上半(y−1)、列 1 = 分隔線列(y)、列 1+BG_ROW_OFFSET = 背景
  const px = await grab({ x: x0, y: y - 1, width, height: 2 + BG_ROW_OFFSET })
  const LINE = 1
  const BG = 1 + BG_ROW_OFFSET

  // 灰線本身對背景的差:在 header 底下同一塊背景放一個 bg-divider 探針實拍(掛在 header 裡,吃同一套主題 token),拍完拿掉
  const probeTop = y + BG_ROW_OFFSET + 1
  const probe = await page.evaluate(({ left, top }) => {
    const p = document.createElement('div')
    p.setAttribute('data-w1-divider-probe', '')
    p.className = 'bg-divider'
    Object.assign(p.style, { position: 'fixed', left: `${left}px`, top: `${top}px`, width: '8px', height: '1px', pointerEvents: 'none', zIndex: '2147483647' })
    document.querySelector('header').appendChild(p)
    const r = p.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  }, { left: x0 + 2, top: probeTop })
  let contrast = null
  if (probe.left === x0 + 2 && probe.top === probeTop && probe.width === 8 && probe.height === 1) {
    const ref = await grab({ x: x0 + 2, y: probeTop - 1, width: 8, height: 2 }) // 列 0 = 背景、列 1 = 探針
    const ds = Array.from({ length: 8 }, (_, i) => channelDiff(ref(i, 1), ref(i, 0))).sort((a, b) => a - b)
    contrast = ds[4]
  }
  await page.evaluate(() => document.querySelector('[data-w1-divider-probe]')?.remove())
  if (contrast === null || contrast < MIN_DIVIDER_CONTRAST) {
    instrumentFailures.push(`✗ ${label} | W1 像素量測前提:灰線探針${contrast === null ? `沒有落在要求的位置(${JSON.stringify(probe)})` : `對背景只差 ${contrast},分不出線與背景`}`)
    return
  }
  const threshold = contrast / 2
  console.log(`ℹ W1 ${label}:分隔線列 y=${y},header x=${x0}–${x0 + width},灰線對背景差 ${contrast}(低於 ${threshold} 算斷)`)

  // W1-連續:逐點,與同一個 x 的背景差 ≥ 灰線差的一半 = 有線(選中底線的主色差更大,也算)
  const gaps = []
  for (let x = 0; x < width; x++) {
    if (channelDiff(px(x, LINE), px(x, BG)) >= threshold) continue
    const last = gaps[gaps.length - 1]
    if (last && last.to === x - 1) last.to = x
    else gaps.push({ from: x, to: x })
  }
  record('W1-連續', `${label} 分隔線列沿 header 全寬 ${width}px 逐點有線`, gaps.length === 0,
    `斷開 ${gaps.length} 段:${gaps.map((r) => `x=${x0 + r.from}–${x0 + r.to}(相對 header 左緣 ${r.from}–${r.to},${r.to - r.from + 1}px)`).join('、')}`)

  // W1-選中底線:選中 tab 正中,上下兩列都是強對比且同色 = 2px 主色底線沒有被灰線蓋掉下半
  if (!g.sel) { instrumentFailures.push(`✗ ${label} | W1-選中底線前提:沒有 aria-selected=true 的 tab`); return }
  const cxAbs = Math.round((g.sel.left + g.sel.right) / 2)
  if (g.sc && ((!g.sc.atStart && cxAbs - g.sc.left < MASK_REACH) || (!g.sc.atEnd && g.sc.right - cxAbs < MASK_REACH))) {
    instrumentFailures.push(`✗ ${label} | W1-選中底線前提:選中 tab 中心 x=${cxAbs} 落在捲動容器 ${fmt(g.sc.left)}–${fmt(g.sc.right)} 有遮罩那一側的 ${MASK_REACH}px 內(atStart=${g.sc.atStart} atEnd=${g.sc.atEnd}),上下兩列不可比`)
    return
  }
  const cx = cxAbs - x0
  const upper = px(cx, 0), lower = px(cx, LINE), bg = px(cx, BG)
  const ok = channelDiff(upper, bg) >= contrast && channelDiff(lower, bg) >= contrast && channelDiff(upper, lower) <= SAME_COLOR_TOLERANCE
  record('W1-選中底線', `${label} 選中 tab(x=${cxAbs})底線兩列同色、都壓過背景`, ok,
    `上列 ${rgb(upper)} / 分隔線列 ${rgb(lower)} / 背景 ${rgb(bg)};兩列差 ${channelDiff(upper, lower)}(> ${SAME_COLOR_TOLERANCE} = 下半被別的東西蓋過)`)
}

/** `--selftest` 的 W1 對照組(檔頭 A / B):只對溢出模式,每一組指定哪一條必須變紅 */
const BASELINE_CONTROLS = [
  {
    tag: '〔對照 A:灰線畫回遮罩內〕',
    css: '[data-tabs-baseline]{display:none!important}[data-slot="tabs-list"]{border-bottom-color:var(--divider)!important}',
    expectRed: 'W1-連續',
  },
  { tag: '〔對照 B:灰線蓋到選中底線上〕', css: '[data-tabs-baseline]{z-index:30!important}', expectRed: 'W1-選中底線' },
  // 對照 C:灰線畫回遮罩內,而且遮罩永遠不掛上 = 「量在遮罩之前」那種慢機器狀態。必須是儀器失效(沒量到),不准是綠:
  // 前提沒等到就量,這一組會量到整條線而判綠(2026-11-17 CI 5f0c05f8 對照組 A 該紅沒紅的成因)。
  {
    tag: '〔對照 C:遮罩沒掛上〕',
    css: '[data-tabs-baseline]{display:none!important}[data-slot="tabs-list"]{border-bottom-color:var(--divider)!important}[data-overflow-scroller]{mask-image:none!important;-webkit-mask-image:none!important}',
    expectInstrument: true,
  },
]
const OVERFLOW_STORIES = STORIES.filter((s) => s.mode !== 'none')
const expectedInstrument = []

if (!SELFTEST) {
  for (const story of STORIES) {
    if (!(await loadStory(story.id, story.label))) continue
    await measureLayout(story)
    await measureBaselinePixels(story)
  }
} else {
  for (const control of BASELINE_CONTROLS) {
    for (const story of OVERFLOW_STORIES) {
      // 在靜止判定之前注入(beforeSettle),量的就是注入之後穩定下來的畫面
      if (!(await loadStory(story.id, `${story.label}${control.tag}`, { beforeSettle: (p) => p.addStyleTag({ content: control.css }) }))) continue
      const before = { inst: instrumentFailures.length, pass: passes.length, fail: failures.length }
      await measureBaselinePixels(story, control.tag)
      if (control.expectInstrument) {
        // 預期中的儀器失效:移到對照紀錄,不算這趟的儀器失效;同時確認它沒有留下任何綠 / 紅判定
        const got = instrumentFailures.splice(before.inst)
        expectedInstrument.push({ key: `${story.label}${control.tag}`, ok: got.length > 0 && passes.length === before.pass && failures.length === before.fail })
      }
    }
  }
}

// ── W3:分頁的 inlineAction 必須真的渲染在 overlay 裡(2026-09-10)────────────────
// 病根:`resolveTabsInlineActionPosition` 對傳進來的活 DOMRect 做 `{ ...overlay }`,
// 而 DOMRect 的 left/top/right/bottom 都在**原型**上 → 展出來是 `{}` → 每一項比較都是
// `undefined > undefined` = false → 永遠回 null。從 2026-07-18 改成 overlay portal 起,
// Tabs 的 inlineAction **一次都沒有渲染過**,而單元測試的 fixture 全是普通物件所以一直綠。
// 這一段是 render-level 防線:帶 inlineAction 的 story,overlay 裡就必須有那顆鈕,且位置對齊 tab 右緣。
{
  const story = { id: 'design-system-components-tabs-展示--with-suffix', label: 'Tabs×inlineAction' }
  // 對照組(`--selftest`):重現這個 bug 當時的可觀測狀態 —— overlay 裡什麼都沒有 ——
  // W3 必須因此變紅。不跑這一步的話,「W3 綠」不算證據(儀器要先證明它該紅的時候會紅)。
  // 在靜止判定**之前**掛上(beforeSettle),靜止判定就會一併等到「overlay 被清空之後」的畫面。
  // 注意 waitFor 是 tablist(量測前提)而不是 overlay 的鈕 —— 鈕沒渲染正是 W3 要抓的產品缺陷,等它會把產品紅改寫成儀器紅。
  const strip = SELFTEST ? (p) => p.evaluate(() => {
    const clear = () => { const o = document.querySelector('.pointer-events-none.absolute'); if (o) o.replaceChildren() }
    clear(); new MutationObserver(clear).observe(document.body, { childList: true, subtree: true })
  }) : null
  if (await loadStory(story.id, story.label, { beforeSettle: strip })) {
    const a = await page.evaluate(() => {
      const list = document.querySelector('[data-slot="tabs-list"]')
      const scope = list?.parentElement
      const overlay = scope?.querySelector('.pointer-events-none.absolute')
      const action = overlay?.querySelector('button')
      const tabs = [...document.querySelectorAll('[role="tab"]')]
      // 帶 inlineAction 的那個 tab:paddingRight 有預留(icon 16 + gap 8 = 24px)
      const host = tabs.find((t) => Math.round(parseFloat(getComputedStyle(t).paddingRight)) === 24)
      const ar = action?.getBoundingClientRect(), hr = host?.getBoundingClientRect()
      return { hasOverlay: !!overlay, overlayChildren: overlay?.childElementCount ?? null, hasAction: !!action,
        label: action?.getAttribute('aria-label') ?? null,
        rightAligned: ar && hr ? Math.abs(ar.right - hr.right) : null,
        insideTab: ar && hr ? (ar.top >= hr.top - 0.5 && ar.bottom <= hr.bottom + 0.5) : null }
    })
    record('W3-a', `${story.label} overlay 裡有 inlineAction 鈕`, a.hasOverlay && a.hasAction,
      `overlay=${a.hasOverlay} 子節點=${fmt(a.overlayChildren)} 鈕=${a.hasAction}(null = resolver 回 null,portal 從未渲染)`)
    record('W3-b', `${story.label} 鈕的右緣對齊 tab 右緣(±1px)且垂直在 tab 內`,
      a.rightAligned != null && Math.abs(a.rightAligned) <= 1 && a.insideTab === true,
      `右緣差 ${fmt(a.rightAligned)}px / 垂直在內=${fmt(a.insideTab)}`)
  }
}

// ── Output ──
console.log(`\n=== Header tabsSlot W1 / W2 / W3 Invariants Test ===`)
console.log(`PASS: ${passes.length}`)
console.log(`FAIL: ${failures.length}`)
// 計數列不印 INSTRUMENT-FAIL 標記字:那是「真的發生儀器失效」的機讀標記(lib/launch-browser.mjs),
// 印「INSTRUMENT-FAIL: 0」會讓讀標記的一方(meta-test)把乾淨的一趟誤判成儀器失效;真的失效時每一筆的訊息本身就帶著標記。
console.log(`儀器失效(沒量到): ${instrumentFailures.length}\n`)
if (passes.length > 0) console.log(passes.join('\n'))
if (failures.length > 0) {
  console.log('\n--- FAILURES ---')
  console.log(failures.join('\n'))
}
if (instrumentFailures.length > 0) {
  console.log('\n--- 儀器失效(沒量到,不是產品裁決;但這次不能算通過)---')
  console.log(instrumentFailures.join('\n'))
}

await browser.close()
await served.stop()

if (instrumentFailures.length > 0) {
  console.error(`\n✗ ${instrumentFailures.length} 則 story 沒有量到(儀器失效)—— ${SELFTEST ? '對照組不成立' : '不變條件未驗'},exit 1。`)
  process.exit(1)
}
if (SELFTEST) {
  const missing = []
  for (const control of BASELINE_CONTROLS) {
    for (const story of OVERFLOW_STORIES) {
      if (control.expectInstrument) {
        const e = expectedInstrument.find((x) => x.key === `${story.label}${control.tag}`)
        if (!e || !e.ok) missing.push(`儀器失效 | ${story.label}${control.tag}(遮罩沒掛上卻量了、或留下判定)`)
        continue
      }
      const key = `${control.expectRed} | ${story.label}${control.tag}`
      if (!failures.some((f) => f.startsWith(`✗ ${key}`))) missing.push(key)
    }
  }
  const w3 = failures.filter((f) => f.includes('W3-'))
  if (w3.length < 2) missing.push(`W3-a / W3-b | 清空 overlay(只紅了 ${w3.length} 條)`)
  if (missing.length === 0) {
    console.log(`\n✓ selftest:灰線畫回遮罩內 → W1-連續 兩則都紅;灰線蓋到選中底線上 → W1-選中底線 兩則都紅;遮罩沒掛上 → 兩則都是儀器失效(不是綠);清空 overlay → W3 兩條都紅 —— 儀器有效`)
    process.exit(0)
  }
  console.log(`\n✗ selftest:下列對照組該紅卻沒紅 —— 那一段的綠燈不算證據:\n  ${missing.join('\n  ')}`)
  process.exit(1)
}
if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} invariant(s) failed. Block commit.`)
  process.exit(1)
}
console.log(`\n✓ All ${passes.length} invariants pass.`)
process.exit(0)
