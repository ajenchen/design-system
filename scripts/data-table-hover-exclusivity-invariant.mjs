#!/usr/bin/env node
/**
 * DataTable：同一時間最多一列 hover(2026-09-16,user：「捲動之後很容易會出現一個畫面同時有兩筆 row 呈現 hover 的狀態」)。
 *
 * SSOT：`components/DataTable/data-table.spec.md`「列 hover」段的不變式 ——
 *   **同一時間最多一列被標記,而且是指標底下那一列**。
 * 根因(修前)：標記由三個寫入者各自加減,清除用「瀏覽器記得的舊索引」定址;捲動時瀏覽器的命中點落後畫面 1–4 列,
 *   補正先把標記移到新列,遲來的 mouseout 去刪一個早就清掉的索引(空轉)→ 舊列標記成孤兒 → 遲來的 mouseover 只加不清 → 兩列同時亮。
 *   而且補正的快速略過條件只看「指標底下那列有沒有被標」,髒狀態下永遠成立 → 不會自己好(實測等 10 秒、滑到別列、移出表格都不會好)。
 *
 * **手勢必須是合成器驅動的平滑捲動**(CDP `Input.synthesizeScrollGesture` + speed):
 *   `page.mouse.wheel` 的離散事件不會製造「瀏覽器命中點落後畫面」那段落差,舊版程式在它底下是綠的 —— 用它當手勢
 *   等於假綠(2026-09-16 實測:同一支閘用滾輪跑舊版 build 全綠,換成合成手勢立刻紅)。指標全程不動,只捲動。
 *
 * 量的是**畫面真相**不是屬性(M32)：比對每一列的 computed background,與「多數列的底色」不同者即為亮著;
 * 同時附記屬性與原生 `:hover`,三者不一致時一併印出。
 *
 * 對照組(--selftest)：在取樣前對另一列硬加標記(模擬孤兒),偵測器必須判紅;不紅 = 量具無效。
 * 真對照組:拿修前的 build 跑本閘(`--static=<舊 build>`)必紅 —— 2026-09-16 實測 12 組手勢中 5 組留下兩列。
 * 用法：node scripts/data-table-hover-exclusivity-invariant.mjs [--static=<dir>] [--selftest]
 *
 * **story 沒渲染出來 / 手勢沒送出去 = 儀器失效(exit 1,訊息標 INSTRUMENT-FAIL),不是產品裁決**(2026-09-25,M37):
 * 每一組都經 lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作)開 story —— 等 Storybook 回報渲染完成、
 * 通過 render-health、捲動區出現、版面連續靜止 SETTLE_FRAMES 個影格,才取指標座標。取代原本的 load + 等捲動區 +
 * 固定睡 1000ms(「過了 1 秒」只是「表格已排好版」的代理)。等不到 → 點名 story、附同源 404,兩種模式都 exit 1
 * (不用 2:本閘與它的 meta-test 約定 exit 2 = 沒有 storybook-static → 略過,用 2 等於讓沒量到被當成略過);
 * --selftest 不得把「沒量到」算成對照組結果。合成手勢被 CDP 拒絕也一樣:原本 `.catch(() => {})` 吞掉,
 * 等於沒捲就量「最多一列亮」—— 必然綠。
 * **手勢真的捲動了表格,才算量到**(同日):CDP 的 yDistance 負值 = 往下捲、正值 = 往上捲(實測 -1500 → scrollTop 0→1500)。
 * 原本只有 y<0 的案例先預捲,於是 y=200/600/1200 三組是從頂端往上捲 —— scrollTop 0 → 0,一格都沒動,
 * 「停下後最多一列亮」必然成立;而那三組正是註解說「最容易留下孤兒」的**往回捲**。現在每一組都先往下捲 1500px,
 * 並核對手勢前後 scrollTop 往預期方向變了;沒變 = 儀器失效(不是通過)。改後 8 組照樣全綠、對照組照樣全紅
 * (y>0 三組實測 scrollTop 1500 → 1300 / 900 / 300)。
 */
import fs from 'node:fs'; import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
const root = path.resolve(REPO, arg('static', 'storybook-static'))
if (!fs.existsSync(path.join(root, 'index.json'))) { console.error(`找不到 ${root}/index.json —— 先 build storybook`); process.exit(2) }
if (fs.statSync(path.join(REPO, 'packages/design-system/src/components/DataTable/data-table.tsx')).mtimeMs > fs.statSync(path.join(root, 'index.html')).mtimeMs) {
  console.error(`✗ STALE-BUILD：data-table.tsx 比 ${root} 新 —— 先重建該 storybook build`); process.exit(2)
}
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
const printNotFound = () => { if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) }
const STORY = 'design-system-components-datatable-展示--roadmap-all-in-one'
// 開 story 後要求版面連續靜止幾個影格才取指標座標(量的是捲動區中心,要等排版與列的掛載副作用跑完)
const SETTLE_FRAMES = 10
/** 儀器失效:這一組沒量到(不是產品不符)。 */
class GestureInstrumentError extends Error {}

/** 停下後讀「畫面上亮著的列」:底色與多數列不同者。附記屬性與原生 :hover 供診斷。 */
const LIT = ([px, py]) => {
  const rows = [...document.querySelectorAll('[role="row"][data-row-index]')]
  const byBg = new Map()
  for (const r of rows) { const bg = getComputedStyle(r).backgroundColor; byBg.set(bg, (byBg.get(bg) ?? 0) + 1) }
  let base = null, most = -1
  for (const [bg, n] of byBg) if (n > most) { most = n; base = bg }
  const lit = rows.filter((r) => getComputedStyle(r).backgroundColor !== base)
  const under = (() => { const u = document.elementFromPoint(px, py); const ur = u instanceof Element ? u.closest('[data-row-index]') : null; return ur?.getAttribute('data-row-index') ?? null })()
  return {
    base, under,
    idx: [...new Set(lit.map((r) => r.getAttribute('data-row-index')))],
    attr: [...new Set([...document.querySelectorAll('[role="row"][data-hovered]')].map((r) => r.getAttribute('data-row-index')))],
    css: [...new Set(rows.filter((r) => r.matches(':hover')).map((r) => r.getAttribute('data-row-index')))],
  }
}

let browser
let failed = 0
let instrumentFailure = null
// 合成器驅動的平滑捲動:距離 × 速度(2026-09-16 重現矩陣;正負皆測 —— 往回捲最容易留下孤兒)
const CASES = [
  { y: -200, speed: 3000 }, { y: -200, speed: 6000 },
  { y: -600, speed: 3000 }, { y: -600, speed: 6000 },
  { y: -1200, speed: 6000 },
  { y: 200, speed: 3000 }, { y: 600, speed: 6000 }, { y: 1200, speed: 6000 },
]
try {
  browser = await launchBrowser(); const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
  const cdp = await page.context().newCDPSession(page)
  const rec = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++ }
  let sampled = 0
  for (const c of CASES) {
    await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, {
      waitFor: '[data-datatable-hscroll]', settleFrames: SETTLE_FRAMES, notFound: server.notFound,
      navigationTimeoutMs: 90000, timeoutMs: 60000,
    })
    const point = await page.evaluate(() => {
      const cc = document.querySelector('[data-datatable-panel="center"]') || document.querySelector('[data-datatable-hscroll]')
      const b = cc.getBoundingClientRect()
      return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }
    })
    // 手勢被 CDP 拒絕 = 這一組沒捲 → 儀器失效(不得讓「沒捲」量出「最多一列亮」)
    const gesture = (params) => cdp.send('Input.synthesizeScrollGesture', params).catch((error) => {
      throw new GestureInstrumentError(`合成捲動手勢被拒絕(y=${params.yDistance} speed=${params.speed}):${String(error?.message || error).split('\n')[0]}`)
    })
    const scrollTop = () => page.evaluate(() => document.querySelector('[data-datatable-hscroll]')?.scrollTop ?? null)
    // 每一組都先往下捲一段(yDistance 負值 = 往下),讓往回捲(y>0)的案例有空間 —— 從頂端往上捲一格都不會動
    await gesture({ x: point.x, y: point.y, yDistance: -1500, speed: 8000 }); await page.waitForTimeout(700) // 等預捲的慣性停下、虛擬列重畫
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
    await page.waitForTimeout(400) // 等指標移入後的 hover 標記寫上
    const primed = await page.evaluate(() => document.querySelectorAll('[role="row"][data-hovered]').length > 0)
    if (!sampled) rec(primed, '前提：指標停在列上時該列已亮(否則這支閘空轉)')
    const topBefore = await scrollTop()
    await gesture({ x: point.x, y: point.y, yDistance: c.y, speed: c.speed })
    await page.waitForTimeout(1600) // 不變式本身的定義:手勢停下 1.6 秒後讀(遲到的 mouseover / 補正都在這段內發生)
    const topAfter = await scrollTop()
    // 手勢要真的把表格往預期方向捲動(y<0 往下 → scrollTop 變大;y>0 往上 → 變小),否則這一組量的是靜止的表格
    if (topBefore === null || topAfter === null || Math.sign(topAfter - topBefore) !== -Math.sign(c.y)) {
      throw new GestureInstrumentError(`y=${c.y} speed=${c.speed} 的手勢沒有把表格往${c.y < 0 ? '下' : '上'}捲(scrollTop ${topBefore} → ${topAfter}),這一組沒量到`)
    }
    if (SELFTEST) {
      // 注入時機在**量測前一刻**:這一段只驗「偵測器看不看得見兩列亮著」。
      // 早一點注入會被修好的 `setHoveredRow` 在下一次捲動 commit 掃掉(那正是修正生效的證明,但會讓對照組空轉)。
      // 真正證明「這支閘會在該紅的時候紅」的是**拿修前的 build 跑它**:2026-09-16 實測 y=-200/-600 speed=6000 兩組留下
      // [47,51] / [47,61](指標在 51 / 61,47 是孤兒),與 user 回報一致。
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll('[role="row"][data-row-index]')].filter((r) => r.getBoundingClientRect().height > 0 && !r.hasAttribute('data-hovered'))
        if (rows[0]) rows[0].dataset.hovered = ''
      })
      await page.waitForTimeout(60) // 等硬加的標記重算樣式
    }
    const st = await page.evaluate(LIT, [point.x, point.y])
    sampled++
    const detail = `亮著的列 [${st.idx.join(',')}] / 屬性 [${st.attr.join(',')}] / 原生 :hover [${st.css.join(',')}];指標底下 row${st.under}`
    if (SELFTEST) rec(st.idx.length >= 2 || st.attr.length >= 2, `對照組 y=${c.y} speed=${c.speed}：硬加孤兒後必須量到 ≥2 列 | ${detail}`)
    else rec(st.idx.length <= 1 && st.attr.length <= 1, `y=${c.y} speed=${c.speed}(合成手勢,指標不動)→ 停下 1.6 秒後最多一列亮 | ${detail}`)
  }
} catch (error) {
  if (!(error instanceof StoryRenderInstrumentError) && !(error instanceof GestureInstrumentError)) { printNotFound(); throw error }
  instrumentFailure = error
} finally {
  await browser?.close()
  await server.stop()
}
// 儀器失效優先於任何判定(兩種模式都是):沒量到的那一組不是「最多一列亮」,也不是「對照組判紅」
if (instrumentFailure) {
  console.error(`✗ ${instrumentFailure instanceof StoryRenderInstrumentError ? instrumentFailure.message : `INSTRUMENT-FAIL story「${STORY}」${instrumentFailure.message} —— 這是儀器失效(沒量到),不是產品裁決`}`)
  printNotFound()
  process.exit(1)
}
if (failed) printNotFound()
if (SELFTEST) { const ok = failed === 0; console.log(ok ? `✓ selftest：對照組讓 ${CASES.length} 組手勢全判紅,量具有效` : '✗ selftest：對照組沒有全紅 —— 量具無效'); process.exit(ok ? 0 : 1) }
console.log(failed ? `✗ data-table-hover-exclusivity ${failed}/${CASES.length} 組失敗(SSOT：data-table.spec.md「列 hover」互斥不變式)` : `✅ data-table-hover-exclusivity PASS(${CASES.length} 組合成捲動手勢,停下後都最多一列亮)`)
process.exit(failed ? 1 : 0)
