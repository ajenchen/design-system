#!/usr/bin/env node
/**
 * 資料工具列(左搜尋 / 右操作)窄寬度不變條件(2026-09-16,user 抓 AgentPanel 示範的搜尋框把「新增任務」推出表格右緣)。
 *
 * SSOT:`patterns/action-bar/action-bar.spec.md`「七、空間不足時的降級 → 搜尋框」+ `stories-helpers/scene/data-toolbar.tsx`。
 * 根因:搜尋框外層沒有明確下限,瀏覽器排版預設「格子不得比自己的內容窄」讓它卡在原生 input 的 20 字元寬(204px),
 * 列不換行、不裁切 → 空間不夠時整列往右溢出。量的是像素不是 class(M32):每支消費 DataToolbar 的示範 × 五個視窗寬,
 *   (1) 列不溢出:scrollWidth ≤ clientWidth;
 *   (2) 最後一顆操作鈕右緣 = 列的內容右緣(±1);
 *   (3) 搜尋框寬 ≥ 下限(讀 data-toolbar-search 的 computed min-width,不寫死 160)。
 * 空間夠(內容寬 ≥ 下限 + gap + 操作群寬)時 (1)(2)(3) 全部必成立;空間連下限都放不下時(操作鈕多的列在極窄寬度)
 * 只驗 (3) 下限守住,並把該格印成「已知極窄極限」(不算失敗、也不靜默 —— action-bar.spec.md 七:本輪不收合搜尋框)。
 * 對照組(--selftest):注入 `[data-toolbar-search]{min-width:auto!important}`(拿掉下限 = 修前狀態)→ 空間夠的格子裡至少一格 (1) 或 (2) 必紅。
 * 用法:node scripts/action-bar-toolbar-invariant.mjs [--static=<dir>] [--selftest]
 */
import fs from 'node:fs'; import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { gotoStory, launchBrowser } from './lib/launch-browser.mjs'
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
const root = path.resolve(REPO, arg('static', 'storybook-static'))
if (!fs.existsSync(path.join(root, 'index.json'))) { console.error(`找不到 ${root}/index.json —— 先 build storybook(或用 --static=<dir> 指定)`); process.exit(2) }
const helperMtime = fs.statSync(path.join(REPO, 'packages/design-system/src/stories-helpers/scene/data-toolbar.tsx')).mtimeMs
if (helperMtime > fs.statSync(path.join(root, 'index.html')).mtimeMs) { console.error(`✗ STALE-BUILD:data-toolbar.tsx 比 ${root} 新 —— 先重建該 storybook build`); process.exit(2) }
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
// story 清單也讀同一份快照,不讀活目錄(否則清單與實際供檔可能來自兩份建置)
const index = JSON.parse(fs.readFileSync(path.join(server.snapshot?.dir ?? root, 'index.json'), 'utf8'))
// 四支消費 DataToolbar 的整頁示範(少一支 = 有人把示範改回手抄,閘要紅)
const WANT = [/agentpanel-展示--url-registry-demo$/u, /datatable-展示--with-bulk-actions$/u, /datatable-展示--roadmap-all-in-one$/u, /appshell-展示--primary-sidebar-with-tabs$/u]
const STORIES = WANT.map((re) => Object.values(index.entries).find((e) => e.type === 'story' && re.test(e.id))?.id)
const WIDTHS = [320, 360, 400, 480, 768]
const PROBE = () => {
  const search = document.querySelector('[data-toolbar-search]')
  if (!search) return { missing: 'data-toolbar-search' }
  const toolbar = search.parentElement
  const actions = toolbar.querySelector('[data-toolbar-actions]')
  const last = actions?.lastElementChild
  if (!actions || !last) return { missing: 'data-toolbar-actions' }
  const cs = getComputedStyle(toolbar)
  const T = toolbar.getBoundingClientRect(), A = actions.getBoundingClientRect(), L = last.getBoundingClientRect(), S = search.getBoundingClientRect()
  const padR = parseFloat(cs.paddingRight), padL = parseFloat(cs.paddingLeft), gap = parseFloat(cs.columnGap || cs.gap || '0')
  const minW = parseFloat(getComputedStyle(search).minWidth)
  const contentW = toolbar.clientWidth - padL - padR
  return { clientW: toolbar.clientWidth, scrollW: toolbar.scrollWidth, contentW, searchW: Math.round(S.width), minW, opsW: Math.round(A.width), gap,
    lastRight: Math.round(L.right * 10) / 10, contentRight: Math.round((T.right - padR) * 10) / 10, fits: contentW >= minW + gap + A.width }
}
const browser = await launchBrowser(); const page = await browser.newPage({ viewport: { width: 768, height: 900 } })
let failed = 0, measured = 0, tight = 0, sabotageReds = 0
const rec = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++ }
for (const [i, id] of STORIES.entries()) {
  if (!id) { rec(false, `找不到示範 story:${WANT[i]}`); continue }
  const name = id.replace(/^design-system-components-/u, '')
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 })
    // 等**搜尋框本身**出現,不用固定睡眠當「已渲染」的代理(2026-09-20 CI 真的因此假紅一次:
    // 每支示範的第一個寬度是冷啟動,900ms 在慢的 runner 上不夠 → 閘指控「示範沒有消費 DataToolbar」)。
    // 等不到才走下面原本的缺元素路徑判紅 —— 真的沒消費時訊息一樣會紅,而且那時才是真的。
    await gotoStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`,
      { waitFor: '[data-toolbar-search]', settle: 900 })
    let r = await page.evaluate(PROBE)
    if (r.missing) { rec(false, `${name} @${w}:找不到 ${r.missing}(示範沒有消費 DataToolbar?)`); continue }
    if (SELFTEST) {
      // 對照組:拿掉下限之後 computed min-width 變回 auto(NaN),「空間夠不夠」要用**拿掉前**讀到的下限算,否則每格都被判成極窄、對照組永遠不紅
      const floor = r.minW
      await page.addStyleTag({ content: '[data-toolbar-search]{min-width:auto!important}' }); await page.waitForTimeout(100)
      r = await page.evaluate(PROBE)
      r.minW = floor; r.fits = r.contentW >= floor + r.gap + r.opsW
    }
    measured++
    const noOverflow = r.scrollW <= r.clientW
    const aligned = Math.abs(r.lastRight - r.contentRight) <= 1
    const floorDefined = Number.isFinite(r.minW) && r.minW > 0
    const floorHeld = floorDefined && r.searchW >= r.minW - 1
    const detail = `內容寬 ${r.contentW} / 搜尋 ${r.searchW}(下限 ${r.minW}) / 操作群 ${r.opsW} / 鈕右 ${r.lastRight} vs 內容右 ${r.contentRight}`
    if (SELFTEST) { if (r.fits && !(noOverflow && aligned)) sabotageReds++; console.log(`  · ${name} @${w}:${r.fits ? (noOverflow && aligned ? '仍對齊' : '溢出 / 錯位(對照組預期)') : '極窄'} | ${detail}`); continue }
    if (!floorDefined) { rec(false, `${name} @${w}:搜尋框沒有明確下限(computed min-width = auto)—— 這正是修前的病 | ${detail}`); continue }
    if (r.fits) {
      rec(noOverflow && aligned && floorHeld, `${name} @${w}:列不溢出、最後一顆操作鈕右緣 = 內容右緣、搜尋框 ≥ 下限 | ${detail}`)
    } else {
      tight++
      rec(floorHeld, `${name} @${w}:空間連下限都放不下(已知極窄極限,操作鈕收合另案),搜尋框仍守住下限 | ${detail}`)
    }
  }
}
// selftest 的晚到對照組需要瀏覽器還活著(--single-process 開不了第二個 browser,所以沿用同一個)
if (!SELFTEST) { await browser.close() }
await server.stop()
if (SELFTEST) {
  // ── 對照組 B:證明「等元素」真的在等,而不是換個寫法的固定睡眠 ──────────────
  // 本機夠快,所以真跑在本機**兩種寫法都會綠** —— 那不構成證據。這一組讓元素故意晚到 2.5 秒
  // (模擬 CI 慢 runner 的冷啟動),與機器速度無關:
  //   · 固定睡眠 300ms、不等元素 → 必須抓不到(= 2026-09-20 CI 假紅的那一格)
  //   · 等元素、settle 只有 100ms → 必須抓得到
  // 兩邊都成立,才證明修正是「等到東西出現」而不是「睡久一點」。
  const late = 'data:text/html,' + encodeURIComponent(
    '<body><script>setTimeout(function(){var d=document.createElement("div");'
    + 'd.setAttribute("data-toolbar-search","");document.body.appendChild(d)},2500)<\/script></body>')
  const probe = () => Boolean(document.querySelector('[data-toolbar-search]'))
  // 沿用同一個 page:`--single-process` 下 `browser.newPage()` 會開第二個 context 而當場崩,
  // 這在 lib/launch-browser.mjs 檔頭已有警告(2026-09-20 我自己又踩一次)。
  await gotoStory(page, late, { settle: 300 })
  const withSleepOnly = await page.evaluate(probe)
  await gotoStory(page, late, { waitFor: '[data-toolbar-search]', settle: 100 })
  const withWait = await page.evaluate(probe)
  const waitProven = withSleepOnly === false && withWait === true
  console.log(waitProven
    ? '✓ selftest:晚到 2.5 秒的元素 —— 固定睡眠 300ms 抓不到、等元素抓得到(修正確實在等,不是睡久一點)'
    : `✗ selftest:等待對照組失效(固定睡眠抓到=${withSleepOnly} / 等元素抓到=${withWait})—— 這組不成立就無法證明修的是競態`)

  const ok = sabotageReds >= 1 && waitProven
  console.log(sabotageReds >= 1 ? `✓ selftest:對照組(拿掉搜尋框下限)讓 ${sabotageReds} 格溢出 / 錯位,量具會紅` : '✗ selftest:對照組沒有任何一格紅 —— 量具無效')
  await browser.close()
  process.exit(ok ? 0 : 1)
}
rec(measured === STORIES.length * WIDTHS.length, `取樣:${measured} 格(需 ${STORIES.length} 支示範 × ${WIDTHS.length} 個寬度)`)
if (tight) console.log(`  · ${tight} 格是空間連下限都放不下的極窄組合(只驗下限守住;action-bar.spec.md 七:本輪不收合搜尋框)`)
console.log(failed ? `✗ action-bar-toolbar ${failed} 條失敗(SSOT:action-bar.spec.md 七「搜尋框」)` : `✅ action-bar-toolbar PASS(${measured} 格)`)
process.exit(failed ? 1 : 0)
