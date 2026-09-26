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
 *
 * 開 story(2026-09-25 起):共用的 openStory(lib/launch-browser.mjs)—— Storybook 回報渲染完成、畫面健康、
 * **被量的東西**(搜尋框與它同列的操作群最後一顆鈕)出現、版面連續靜止 10 個影格,並在最後一個靜止影格的
 * 同一個 task 裡量(probe)。取代舊的 gotoStory + 固定睡 900ms(「已渲染」與「版面已穩」的代理)。
 * 開不起來 / 等不到工具列 → INSTRUMENT-FAIL 點名該格(示範 × 寬度)、列同源 404 —— 舊版把同一件事印成
 * 「找不到 data-toolbar-search(示範沒有消費 DataToolbar?)」,在 story 檔 404 時指控示範(實測)。
 * 「等元素而不是睡一段時間」本身的對照組(晚到 3 秒的 story 檔:固定睡眠看不到、openStory 等得到)
 * 跟著共用實作住在 scripts/test-open-story.mjs(M17:一份實作、一份對照組),不在本閘重抄。
 * 用法:node scripts/action-bar-toolbar-invariant.mjs [--static=<dir>] [--selftest]
 */
import fs from 'node:fs'; import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { INSTRUMENT_FAIL_MARKER, launchBrowser, openStory, requireStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
const root = path.resolve(REPO, arg('static', 'storybook-static'))
requireStorybookBuild(path.join(root, 'index.json'), '先 build storybook(或用 --static=<dir> 指定)')
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
// 頁面端(openStory 的 waitFor):**被量的東西**都在了 —— 搜尋框,以及它同一列的操作群裡至少一顆鈕(PROBE 量的就是這兩個)
const TOOLBAR_READY = () => Boolean(document.querySelector('[data-toolbar-search]')?.parentElement?.querySelector('[data-toolbar-actions]')?.lastElementChild)
// 頁面端(openStory 的 probe:最後一個靜止影格的同一個 task 裡執行;以原始碼序列化傳入,不得引用外部變數)
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
/** 沒量到的格子(story 開不起來 / 等不到工具列):儀器失效,不是產品裁決,也絕不算通過 */
const instrumentFails = []
const rec = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++ }
for (const [i, id] of STORIES.entries()) {
  if (!id) { rec(false, `找不到示範 story:${WANT[i]}`); continue }
  const name = id.replace(/^design-system-components-/u, '')
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 })
    let r
    let floor = NaN
    try {
      const opened = await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, {
        waitFor: TOOLBAR_READY,
        // 對照組:在靜止判定**之前**拿掉搜尋框下限,量到的是拿掉之後的穩態(取代舊的「注入後固定睡 100ms」)。
        // 「空間夠不夠」要用**拿掉前**的下限算(拿掉後 computed min-width 變回 auto = NaN,每格都會被判成極窄、對照組永遠不紅);
        // 下限是樣式表給的值,元素一出現就定了,不隨版面變動,所以在這裡讀。
        beforeSettle: SELFTEST ? async (p) => {
          floor = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-toolbar-search]')).minWidth))
          await p.addStyleTag({ content: '[data-toolbar-search]{min-width:auto!important}' })
        } : null,
        settleFrames: 10, probe: PROBE, notFound: server.notFound,
      })
      r = opened.probe
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      console.log(`✗ ${name} @${w}:${error.message}`)
      if (error.kind === 'wait-for-timeout') {
        console.log('  (Storybook 已回報渲染完成、畫面健康,但等不到搜尋框 + 操作群:示範若真的不再消費 DataToolbar,改示範或改本閘的 WANT 清單;這不是「睡不夠久」)')
      }
      instrumentFails.push({ cell: `${name} @${w}`, detail: error.detail })
      continue
    }
    // 等到之後、靜止當下又不見 = 工具列在渲染完成後被拿掉(不是還沒畫出來)—— 照實報,不猜原因
    if (r.missing) { rec(false, `${name} @${w}:等到工具列之後,版面靜止時 ${r.missing} 又不見了`); continue }
    if (SELFTEST) { r.minW = floor; r.fits = r.contentW >= floor + r.gap + r.opsW }
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
await browser.close()
await server.stop()
if (instrumentFails.length) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFails.length} 格沒量到 —— 不是產品裁決,但這次不能宣稱工具列合規:`)
  for (const f of instrumentFails) console.log(`  · ${f.cell}:${f.detail}`)
}
if (SELFTEST) {
  // 有格子沒量到時,對照組「紅了」不全是注入造成的,不能宣稱量具有效
  const ok = sabotageReds >= 1 && instrumentFails.length === 0
  console.log(sabotageReds >= 1 ? `✓ selftest:對照組(拿掉搜尋框下限)讓 ${sabotageReds} 格溢出 / 錯位,量具會紅` : '✗ selftest:對照組沒有任何一格紅 —— 量具無效')
  if (instrumentFails.length) console.log(`✗ selftest:${instrumentFails.length} 格沒量到 —— 紅的不全是對照組造成的,不能宣稱「紅得對」`)
  process.exit(ok ? 0 : 1)
}
// 每一格都要有下落:量到,或以儀器失效記名(上方已紅)—— 兩者都沒有的格子才是這裡要抓的「靜默消失」
rec(measured + instrumentFails.length === STORIES.length * WIDTHS.length, `取樣:${measured} 格${instrumentFails.length ? `(另 ${instrumentFails.length} 格沒量到,已記儀器失效)` : ''}(需 ${STORIES.length} 支示範 × ${WIDTHS.length} 個寬度)`)
if (tight) console.log(`  · ${tight} 格是空間連下限都放不下的極窄組合(只驗下限守住;action-bar.spec.md 七:本輪不收合搜尋框)`)
console.log(failed || instrumentFails.length ? `✗ action-bar-toolbar ${failed} 條失敗、${instrumentFails.length} 格沒量到(SSOT:action-bar.spec.md 七「搜尋框」)` : `✅ action-bar-toolbar PASS(${measured} 格)`)
process.exit(failed || instrumentFails.length ? 1 : 0)
