#!/usr/bin/env node
// Header tabsSlot W2 invariants test — 守 header-canonical.spec.md Rule W1/W2 的 render-level 契約
// (契約實體 = chrome-header.tsx HEADER_TABS_SLOT_WRAPPER_CLASS `[&_[data-slot=tabs-list]]:px-[...]`
//  + tabs.tsx 三種 overflow 模式 tablist 自標 data-slot="tabs-list"):
//   (W2-a) tablist computed paddingLeft/paddingRight === 解析後 var(--layout-space-loose)
//   (W2-b) 解析後 --layout-space-loose === '16px'(md 預設 density;把「token 鏈斷」跟
//          「density 環境漂移」分開報錯)
//   (W2-c) 第一個 [role=tab] rect.left − header rect.left === 16 ± 0.5px(M32 pixel-quantified:
//          視覺意圖 = triggers 對齊 header content row,與實作 selector 機制無關)
//   (W1)   border 全寬一條線:none 模式 tablist rect.width === header 寬;scroll 模式量 scroll
//          container(tablist 是 min-w-full 可比容器寬,量錯對象 false-fail);menu 模式量
//          scroll container 的 flex row(scroll 區 + ⌄ navigator 容器共同鋪滿 header 寬,
//          兩者各自 border-b 連成全寬一條線;⌄ 未觸發時 row == scroll container 退化同 scroll)
//
// 病根(2026-07-30 F1):beta.86 inlineAction overlay 包 `<div class="relative">` 把 v3
// direct-child selector `[&>[role=tablist]]` 斷鏈 → px-loose 靜默消失(computed 0px),
// source-level gate(layout-space-utility-invariant)抓不到 render 值 → 本 gate 補 render-level 防線。
// 改 HEADER_TABS_SLOT_WRAPPER_CLASS / TabsList overflow DOM 必跑此 script,fail → exit 1 阻 commit。
// Run: `npm run test:header-tabs-slot-invariants` 或 `node scripts/header-tabs-slot-invariants.mjs [--selftest] [--build=<storybook 建置目錄>]`

import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { openStory, StoryRenderInstrumentError, launchBrowserOrSkip, requireStorybookBuild } from './lib/launch-browser.mjs'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
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
//   - 同一個 CI job(ci.yml verify-browser-interaction,`npx playwright install chromium` 裝在預設快取)裡其他瀏覽器閘都是
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
/** `--selftest` 只影響 W3(見該段):把 overlay 清空,重現「那顆鈕從未渲染」的狀態,W3 必須變紅 */
const SELFTEST = process.argv.includes('--selftest')

for (const story of STORIES) {
  if (!(await loadStory(story.id, story.label))) continue

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
    continue
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

  // (W1) 全寬契約 — 量測對象依 overflow 模式(tablist scroll/menu 是 min-w-full 可比容器寬):
  if (story.mode === 'none') {
    record('W1', `${story.label} 結構:none 模式無 scroll container`, !d.hasScrollContainer,
      'tablist parent 是 overflow-x 容器 — story 疑似 render 錯 overflow 模式')
    record('W1', `${story.label} tablist 全寬 = header 寬 ±0.5`,
      Math.abs(d.tablistWidth - d.headerWidth) <= 0.5,
      `tablist ${fmt(d.tablistWidth)} vs header ${fmt(d.headerWidth)}(w-full 注入斷 = border 沒鋪滿)`)
  } else {
    record('W1', `${story.label} 結構:${story.mode} 模式有 scroll container`, d.hasScrollContainer,
      'tablist parent 非 overflow-x 容器 — story 疑似 render 錯 overflow 模式,禁 silent skip')
    if (story.mode === 'scroll') {
      record('W1', `${story.label} scroll container 全寬 = header 寬 ±0.5`,
        d.scWidth !== null && Math.abs(d.scWidth - d.headerWidth) <= 0.5,
        `container ${fmt(d.scWidth)} vs header ${fmt(d.headerWidth)}(arrows 是 absolute overlay 不佔寬)`)
    } else {
      // menu:⌄ navigator 觸發時 scroll container 讓出右側寬度給按鈕容器,兩者的 flex row
      // 才是「border 連成全寬一條線」的量測對象;未觸發時 row == scroll container(退化同 scroll)。
      record('W1', `${story.label} scroll row(捲動區 + ⌄ 容器)全寬 = header 寬 ±0.5`,
        d.rowWidth !== null && Math.abs(d.rowWidth - d.headerWidth) <= 0.5,
        `row ${fmt(d.rowWidth)} vs header ${fmt(d.headerWidth)}`)
      record('W1', `${story.label} scroll container 左緣貼齊 header 左緣 ±0.5`,
        d.scLeft !== null && Math.abs(d.scLeft - d.headerLeft) <= 0.5,
        `container.left ${fmt(d.scLeft)} vs header.left ${fmt(d.headerLeft)}`)
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
console.log(`\n=== Header tabsSlot W2 Invariants Test ===`)
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
  const w3 = failures.filter((f) => f.includes('W3-'))
  console.log(w3.length >= 2
    ? `\n✓ selftest:清空 overlay 後 W3 兩條都變紅(${w3.length} 條)—— 儀器有效`
    : '\n✗ selftest:overlay 都清空了 W3 還是綠 —— 這一段的綠燈不算證據')
  process.exit(w3.length >= 2 ? 0 : 1)
}
if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} invariant(s) failed. Block commit.`)
  process.exit(1)
}
console.log(`\n✓ All ${passes.length} invariants pass.`)
process.exit(0)
