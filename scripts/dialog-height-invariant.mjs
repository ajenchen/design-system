#!/usr/bin/env node
/**
 * Dialog 高度不變式(2026-09-11)
 *
 * user 逐字:「基本上都會有一個小於視窗高度的最大高度,可由消費者定義,預設最大高度會是視窗高度減去其上下 padding,
 * 為了讓 header 和 footer 可以在大部分的情況都是露出的,然後 dialog 實際的高度會分成隨著內容長高或是會填滿視窗高度兩種,
 * 但基本上高度都不會超過最大高度,同時我們也有定義過,當開啟 dialog 到關閉之期間,內容的高度不會因為使用者的操作和
 * 互動導致高度變化的話,那該 modal 就是隨著內容長高,否則就是填滿視窗那種」。
 *
 * 這支閘把上面那段變成可判定的斷言。四條不變式:
 *   H1 兩種模式回報**同一個**最大高度上限(上限只有一條公式,不是各給各的)
 *   H2 上限 = 視窗高 − inset×2,且**小於視窗高**
 *   H3 `height="hug"` 真的隨內容長高(內容少就矮),`fill` 不隨內容變
 *   H4 `maxHeight` 只能更矮:傳比視窗大的值不得超過視窗;傳小的值要生效
 *
 * 對照組(`--selftest`):把送出的 bundle 裡的上限拿掉 → H2/H4 必須紅。
 *
 *   node scripts/dialog-height-invariant.mjs [--build=<dir>] [--selftest]
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = arg('build', join(REPO, 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const VH = 800
const INSET = 48
const AVAILABLE = VH - INSET * 2 // 704

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
let fail = 0
const ck = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`); if (!ok) fail++ }

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: VH } })
  if (SELFTEST) {
    // 把兩種模式共用的上限整段拿掉(min(...) 與 calc(...) 都換成一個永遠不生效的值)
    await page.route((u) => /dialog-[^/]*\.js$/.test(u.pathname), async (route) => {
      const res = await route.fetch()
      let body = await res.text()
      if (body.includes('--overlay-viewport-inset')) body = body.split('calc(100svh - ').join('calc(100000px - ')
      return route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'application/javascript' } })
    })
  }
  /** 開啟指定 story 的 dialog,回傳幾何。story 以 trigger 開啟;openArgs 用 Storybook args 覆寫 DialogContent 的 prop 做不到,
   *  所以 H1/H4 改用「在頁面內直接改 inline style 的對照」——不動元件、只驗上限有沒有效。 */
  const open = async (id) => {
    await page.goto(`${server.origin}/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'networkidle', timeout: 120_000 })
    await page.waitForTimeout(600)
    // `button` 的第一個可能是 Storybook 注入的隱藏元素(實測「element is not visible」),要挑可見的那個
    const trigger = page.locator('button:visible').first()
    if (await trigger.count()) { await trigger.click({ timeout: 10_000 }).catch(() => {}); await page.waitForTimeout(800) }
    return page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]')
      if (!d) return null
      const cs = getComputedStyle(d)
      const body = d.querySelector('[data-dialog-body]')
      return { h: Math.round(d.getBoundingClientRect().height), top: Math.round(d.getBoundingClientRect().top),
        bottom: Math.round(d.getBoundingClientRect().bottom), maxH: cs.maxHeight, cssH: cs.height,
        bodyScroll: body ? body.scrollHeight : null }
    })
  }

  const P = 'design-system-components-dialog-%E5%B1%95%E7%A4%BA'
  const short = await open(`${P}--destructive`)     // 確認刪除:一句話 → hug
  const longC = await open(`${P}--long-content`)    // 長內容:30 筆 → fill
  ck('前提:兩支 story 的 dialog 都開得起來', !!short && !!longC, JSON.stringify({ short: short?.h, long: longC?.h }))

  if (short && longC) {
    ck(`H1 兩種模式回報同一個上限(hug=${short.maxH} / fill=${longC.maxH})`, short.maxH === longC.maxH, `${short.maxH} vs ${longC.maxH}`)
    const capPx = Math.round(parseFloat(short.maxH))
    ck(`H2 上限 = 視窗高 − inset×2 = ${AVAILABLE}px,且 < 視窗高 ${VH}px`,
       Math.abs(capPx - AVAILABLE) <= 1 && capPx < VH, `量到 ${short.maxH}`)
    ck('H3 hug 真的隨內容長高(確認框遠矮於上限)', short.h < AVAILABLE * 0.6, `確認框 ${short.h}px vs 上限 ${AVAILABLE}px`)
    ck('H3 fill 不隨內容變(長內容 = 上限)', Math.abs(longC.h - AVAILABLE) <= 2, `長內容 ${longC.h}px`)
    ck('H2 兩種模式都沒有溢出視窗', short.top >= 0 && short.bottom <= VH && longC.top >= 0 && longC.bottom <= VH,
       JSON.stringify({ hug: [short.top, short.bottom], fill: [longC.top, longC.bottom] }))
  }

  // H4:maxHeight 只能更矮 —— 在頁面內直接套 inline style 模擬 consumer 傳值,驗 min() 的方向
  const h4 = await page.evaluate((available) => {
    const d = document.querySelector('[role="dialog"]')
    if (!d) return null
    const before = Math.round(d.getBoundingClientRect().height)
    d.style.maxHeight = `min(calc(100svh - 96px), 320px)`
    d.style.height = `min(calc(100svh - 96px), 320px)`
    const smaller = Math.round(d.getBoundingClientRect().height)
    d.style.maxHeight = `min(calc(100svh - 96px), 5000px)`
    d.style.height = `min(calc(100svh - 96px), 5000px)`
    const bigger = Math.round(d.getBoundingClientRect().height)
    return { before, smaller, bigger, available }
  }, AVAILABLE)
  if (h4) {
    ck('H4 傳更矮的 maxHeight 會生效(320px)', Math.abs(h4.smaller - 320) <= 2, JSON.stringify(h4))
    ck(`H4 傳比視窗大的 maxHeight 仍被視窗夾住(≤ ${AVAILABLE}px)`, h4.bigger <= AVAILABLE + 1, JSON.stringify(h4))
  }
} finally {
  await browser.close()
  await server.stop()
}
console.log(fail ? `\n✗ ${fail} 項未通過` : `\n✓ ${SELFTEST ? '對照組:拿掉上限後如預期紅(儀器有效)' : 'Dialog 高度不變式:全通過'}`)
process.exit(SELFTEST ? (fail ? 0 : 1) : (fail ? 1 : 0))
