#!/usr/bin/env node
/**
 * 「指標底下那一列永遠有 hover 反應」不變式(2026-09-11)
 *
 * user 原話:「連 hover table row 的反應都是延遲很久,游標明明到了,table row 的反應卻要等好一陣子」。
 *
 * 根因(兩層,都實測過):
 *   1. **殼列沒有 hover 可供性**。`renderShellRow` 原本不帶 `data-[hovered]:bg-neutral-hover`,
 *      而殼列是帶 `data-row-index` 的 —— hover 代理會把 `data-hovered` 標上去,卻什麼都不顯示。
 *      指標停著不動、底下那列在捲動中被套殼,看到的就是「游標在上面、整列沒反應」。
 *      4× 節流實測:殼存活 505ms,期間 6 幀完全沒有 hover 反應。
 *   2. **捲動中瀏覽器不重新派送 hover**。整段合成手勢期間指標底下那一列一次 `mouseover` 都沒收到,
 *      `data-hovered` 留在早已捲出視窗的舊列上。CSS `:hover` 沒這問題(瀏覽器每幀自己算),
 *      AG Grid(`.ag-row:hover`)/ MUI X 都走 CSS;本表為了跨三個捲動區同步同一「邏輯列」才用代理,
 *      所以得自己補上瀏覽器免費提供的那一半 → `syncHoverUnderPointer` 在每次捲動 commit 後對一次。
 *
 * 量法:指標放在中央捲動區正中央後**完全不動**,逐幀用 `elementFromPoint` 取指標底下那一列,
 *   記錄它有沒有 `data-hovered` 以及背景色是不是透明。不變式 = **沒有任何一幀是「沒有 hover 反應」**。
 *   對照組(`--selftest`):注入 CSS 把 `[data-hovered]` 的底色改透明 → 必須紅(證明這支閘在該紅時會紅)。
 *
 * **2026-09-14 兩處修正**(列殼機制停用後,這支閘的前提與對照組雙雙失效):
 *   - 舊前提要求「真的出現過殼」,列殼停用後殼恆為 0,前提結構上不可能成立。改成
 *     「殼出現過 **或** 指標底下那一列真的換過(≥3 個不同的 data-row-index)」—— 兩種機制下都不會空轉。
 *   - 舊對照組改寫 bundle 裡殼列的 class 串,實測**改寫了 1 個 chunk 但 hover 照樣正常**
 *     (0/159 幀沒反應)—— 它打不到這支閘實際觀測的那個元素,是「該紅不會紅」的假對照。
 *     改成注入 CSS,直接讓觀測到的底色變透明,與實作寫法無關。
 *
 * **開 story(2026-09-25)**:改用 lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作)——
 *   Storybook 回報渲染完成(含 play)+ render-health + 被量的捲動區本身 + 版面連續 10 影格靜止,才開始放指標。
 *   取代原本的 `networkidle` + 固定睡 1500ms(兩者都是「畫面就緒」的代理)。story 開不起來 = 儀器失效:
 *   點名 story、附同源 404、exit 1(不用 2:lib/gate-selftest-meta.mjs 在 2026-09-25 修正前把 exit 2 讀成「環境起不來 → 略過」,沒量到會被 meta-test 當成綠)—— 不是產品裁決,**--selftest 下也不會被算成「對照組如預期紅了」**。
 *
 *   node scripts/data-table-row-under-pointer-invariant.mjs [--build=<dir>] [--cpu=4] [--selftest]
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = arg('build', join(REPO, 'storybook-static'))
const CPU = Number(arg('cpu', '4'))
const SELFTEST = process.argv.includes('--selftest')
const STORY = 'design-system-components-datatable-%E5%B1%95%E7%A4%BA--roadmap-all-in-one'

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
let fail = 0
let instrument = null
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
  const cdp = await page.context().newCDPSession(page)
  try {
    // 渲染完成(含 play)+ render-health + 被量的捲動區本身 + 版面連續 10 影格靜止(下一步就量捲動區的幾何放指標)
    await openStory(page, `${server.origin}/iframe.html?id=${STORY}&viewMode=story`, {
      waitFor: '[data-datatable-hscroll]', settleFrames: 10, navigationTimeoutMs: 120_000, timeoutMs: 60_000, notFound: server.notFound,
    })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    instrument = error
  }
  if (!instrument) {
    // 對照組:直接讓這支閘**觀測到的那個底色**變透明。與實作寫的是哪一條 class 無關,
    // 所以不會像舊版那樣「改寫了 bundle 卻打不到觀測對象」。
    if (SELFTEST) await page.addStyleTag({ content: '[data-hovered]{background-color:transparent !important}' })
    if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })

    const box = await page.locator('[data-datatable-hscroll]').first().boundingBox()
    const X = Math.round(box.x + box.width / 2)
    const Y = Math.round(box.y + box.height / 2)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X, y: Y })
    // 400ms:等指標移入後的 hover 派送(mouseover → data-hovered)與底色 transition 走完,再量「放上去先有 hover 底色」這個前提
    await page.waitForTimeout(400)

    // 逐幀取樣裝在頁面內(每次 evaluate 的往返會把殼的存活期整段跳過去)
    await page.evaluate(([px, py]) => {
      const S = (window.__RUP = { rows: [], t0: performance.now() })
      const tick = () => {
        const row = document.elementFromPoint(px, py)?.closest('[role="row"]')
        S.rows.push(row
          ? { t: Math.round(performance.now() - S.t0), shell: row.hasAttribute('data-row-shell'), idx: row.getAttribute('data-row-index'), hovered: row.hasAttribute('data-hovered'), bg: getComputedStyle(row).backgroundColor }
          : { t: Math.round(performance.now() - S.t0), row: null })
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, [X, Y])

    const before = await page.evaluate(([px, py]) => {
      const row = document.elementFromPoint(px, py)?.closest('[role="row"]')
      return row ? { shell: row.hasAttribute('data-row-shell'), hovered: row.hasAttribute('data-hovered'), bg: getComputedStyle(row).backgroundColor } : null
    }, [X, Y])

    await cdp.send('Input.synthesizeScrollGesture', { x: X, y: Y, yDistance: -4000, speed: 6000 })
    // 2500ms 是取樣窗:手勢結束後頁內逐幀取樣繼續跑,涵蓋捲動停下後的列補齊期間(不變式要求「整段捲動與補齊期間」)
    await page.waitForTimeout(2500)
    const samples = await page.evaluate(() => window.__RUP.rows)

    const transparent = (bg) => !bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent'
    const dead = samples.filter((s) => s.row !== null && (!s.hovered || transparent(s.bg)))
    const shellFrames = samples.filter((s) => s.shell).length
    const ck = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`); if (!ok) fail++ }

    // 這條是**正式跑**的前提。對照組刻意把底色改透明,它必然紅 —— 那是預期行為不是失敗,所以跳過。
    if (!SELFTEST) ck('前提:指標放上去先有 hover 底色(否則後面量的不是這件事)', !!before && before.hovered && !transparent(before.bg), JSON.stringify(before))
    const idxSeen = new Set(samples.map((s) => s.idx).filter((v) => v != null)).size
    ck(`前提:取樣涵蓋整段手勢(≥ 20 幀),且指標底下真的換過列或出現過殼(否則這支閘空轉)`,
      samples.length >= 20 && (shellFrames > 0 || idxSeen >= 3),
      `取樣 ${samples.length} 幀、其中殼 ${shellFrames} 幀、指標底下出現過 ${idxSeen} 個不同的列`)
    const detail = `沒有 hover 反應的幀 ${dead.length}/${samples.length}` + (dead.length ? `;最後一次在 ${dead[dead.length - 1].t}ms(${JSON.stringify(dead[dead.length - 1])})` : '')
    if (SELFTEST) {
      ck('對照組(注入 CSS 讓 [data-hovered] 底色透明):必須量到「游標在上面卻沒反應」', dead.length > 0, detail)
    } else {
      ck('指標完全不動時,底下那一列在整段捲動與補齊期間都有 hover 反應(底色 + data-hovered)', dead.length === 0, detail)
    }
  }
} finally {
  await browser.close()
  await server.stop()
}
if (instrument) {
  // 沒量到 ≠ 通過,也 ≠ 對照組紅了:一幀都沒取樣,本次不下任何判定
  console.log(`✗ ${instrument.message}`)
  process.exit(1)
}
if (SELFTEST) {
  // 對照組的成功條件 = 那條斷言**紅了**(fail === 0 代表破壞之後還是全綠 = 儀器該紅沒紅)。
  if (fail > 0) { console.log('\n✗ 對照組:破壞之後仍有斷言沒紅 —— 儀器無效'); process.exit(1) }
  console.log('\n✓ 對照組:底色改透明後如預期量到沒反應(儀器有效)')
  process.exit(0)
}
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 指標底下的列:全程有 hover 反應')
process.exit(fail ? 1 : 0)
