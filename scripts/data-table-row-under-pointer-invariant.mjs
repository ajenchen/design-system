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
 *   對照組(`--selftest`):把送出的 bundle 裡殼列那條 hover class 拿掉 → 必須紅(證明這支閘在該紅時會紅)。
 *
 *   node scripts/data-table-row-under-pointer-invariant.mjs [--build=<dir>] [--cpu=4] [--selftest]
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = arg('build', join(REPO, 'storybook-static'))
const CPU = Number(arg('cpu', '4'))
const SELFTEST = process.argv.includes('--selftest')
const SHELL_HOVER_CLASS = 'data-[hovered]:bg-neutral-hover'
const STORY = 'design-system-components-datatable-%E5%B1%95%E7%A4%BA--roadmap-all-in-one'

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
let fail = 0
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
  let patched = 0
  if (SELFTEST) {
    // 只動殼列那一條(殼列的 class 串以 `group/row flex relative items-center overflow-hidden ` 起頭)
    await page.route((u) => /data-table-[^/]*\.js$/.test(u.pathname), async (route) => {
      const res = await route.fetch()
      let body = await res.text()
      const needle = `overflow-hidden ${SHELL_HOVER_CLASS}`
      if (body.includes(needle)) { patched++; body = body.split(needle).join('overflow-hidden') }
      return route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'application/javascript' } })
    })
  }
  const cdp = await page.context().newCDPSession(page)
  await page.goto(`${server.origin}/iframe.html?id=${STORY}&viewMode=story`, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForSelector('[data-datatable-hscroll]', { timeout: 60_000 })
  await page.waitForTimeout(1500)
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })

  const box = await page.locator('[data-datatable-hscroll]').first().boundingBox()
  const X = Math.round(box.x + box.width / 2)
  const Y = Math.round(box.y + box.height / 2)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: X, y: Y })
  await page.waitForTimeout(400)

  // 逐幀取樣裝在頁面內(每次 evaluate 的往返會把殼的存活期整段跳過去)
  await page.evaluate(([px, py]) => {
    const S = (window.__RUP = { rows: [], t0: performance.now() })
    const tick = () => {
      const row = document.elementFromPoint(px, py)?.closest('[role="row"]')
      S.rows.push(row
        ? { t: Math.round(performance.now() - S.t0), shell: row.hasAttribute('data-row-shell'), hovered: row.hasAttribute('data-hovered'), bg: getComputedStyle(row).backgroundColor }
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
  await page.waitForTimeout(2500)
  const samples = await page.evaluate(() => window.__RUP.rows)

  const transparent = (bg) => !bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent'
  const dead = samples.filter((s) => s.row !== null && (!s.hovered || transparent(s.bg)))
  const shellFrames = samples.filter((s) => s.shell).length
  const ck = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`); if (!ok) fail++ }

  ck('前提:指標放上去先有 hover 底色(否則後面量的不是這件事)', !!before && before.hovered && !transparent(before.bg), JSON.stringify(before))
  ck(`前提:取樣涵蓋整段手勢(≥ 20 幀)且真的出現過殼(否則這支閘空轉)`, samples.length >= 20 && shellFrames > 0, `取樣 ${samples.length} 幀、其中殼 ${shellFrames} 幀`)
  const detail = `沒有 hover 反應的幀 ${dead.length}/${samples.length}` + (dead.length ? `;最後一次在 ${dead[dead.length - 1].t}ms(${JSON.stringify(dead[dead.length - 1])})` : '')
  if (SELFTEST) {
    ck(`對照組(把殼列的 ${SHELL_HOVER_CLASS} 拿掉):必須量到「游標在上面卻沒反應」`, patched > 0 && dead.length > 0, `改寫 ${patched} 個 chunk;${detail}`)
  } else {
    ck('指標完全不動時,底下那一列在整段捲動與補齊期間都有 hover 反應(底色 + data-hovered)', dead.length === 0, detail)
  }
} finally {
  await browser.close()
  await server.stop()
}
console.log(fail ? `\n✗ ${fail} 項未通過` : `\n✓ ${SELFTEST ? '對照組:拿掉殼列 hover class 後如預期量到沒反應(儀器有效)' : '指標底下的列:全程有 hover 反應'}`)
process.exit(fail ? 1 : 0)
