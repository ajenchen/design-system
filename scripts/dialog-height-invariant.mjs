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
 *   H5 視窗變矮時「內容溢出走 body 捲動」(`dialog.spec.md:128` 逐字)——**每一支 dialog story** 都要
 *      (a) 沒有任何後代畫到容器外(容器自己 `overflow: hidden`,對齊 `overlay-surface.tsx:180-182`
 *          明文要求的父層契約:「parent…是 flex flex-col + max-h + overflow-hidden」)
 *      (b) 內容搆得到:捲動區 `scrollHeight > clientHeight` 時,捲到底之後最後一個互動元素要完整可見
 *      H5 是 2026-09-12 user 截圖「dialog body 內容超出容器」的防線。當時 H1-H4 全綠 ——
 *      因為它們只測 dialog **自己**的高度,沒測「dialog 與 body 之間夾了別的 wrapper」的情形。
 *      根因:Tabs Root 是裸 `display:block` + `min-height:auto`,在受限的 flex column 裡收縮不了。
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
// H5 需要**自己的**對照組:上面那個 --selftest 會把高度上限拿掉,dialog 變成 99904px 高,
// 那樣任何內容都不會溢出,H5 的條件永遠觸發不了(2026-09-12 實測 溢出數 恆為 0)。
// --selftest-h5 保留上限,只還原本次的兩個修法(容器 overflow + Tabs Root 的 flex),
// 讓 H5 面對的是 bug 當時的真實形狀。兩個對照組在 CI 都要跑。
const SELFTEST_H5 = process.argv.includes('--selftest-h5')
const VH = 800
const INSET = 48
const AVAILABLE = VH - INSET * 2 // 704

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
let fail = 0
let patchedChunks = 0
let h5CheckedTotal = 0
let h5BadTotal = 0
const ck = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`); if (!ok) fail++ }

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: VH } })
  if (SELFTEST && !SELFTEST_H5) {
    // 把兩種模式共用的上限拿掉(`calc(100svh - …)` 換成一個永遠夾不住的值)。
    // **路由所有 .js 不是只路由 dialog-*.js**(2026-09-11):CI 的 chunk 切法跟本機不同,
    // 只比對檔名會整個漏掉 —— 那一跑對照組沒生效、`fail` 是 0,腳本卻印「如預期紅」並 exit 1(訊息與事實相反)。
    await page.route((u) => u.pathname.endsWith('.js'), async (route) => {
      const res = await route.fetch()
      let body = await res.text()
      if (body.includes('calc(100svh - ')) { patchedChunks++; body = body.split('calc(100svh - ').join('calc(100000px - ') }
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
  // ── H5:視窗變矮 → body 內捲,不外溢、不失聯 ──
  // 掃全部 dialog / sheet story(不是只掃幾支範例):這個 bug 的形狀就是「某個 consumer 的組合
  // 在中間夾了一層不能收縮的 wrapper」,只有全掃才抓得到。
  const index = JSON.parse(await (await fetch(`${server.origin}/index.json`)).text())
  const overlayIds = Object.entries(index.entries)
    .filter(([id, e]) => e.type === 'story' && /(dialog|sheet)/i.test(id))
    .map(([id]) => id)
  let h5Checked = 0
  const h5Bad = []
  for (const id of overlayIds) {
    for (const vh of [240]) { // 240 是最嚴苛的一檔;跑兩檔只是把同一條斷言重跑一次,CI 時間卻加倍
      await page.setViewportSize({ width: 1280, height: vh })
      await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {})
      // H5 的對照組:把 2026-09-12 的兩個修法同時還原 —— 容器 overflow 放開 + Tabs Root 退回裸 block。
      // 少了這一步,H5 的綠燈只證明「現在沒壞」,不證明「壞了會被抓到」。
      if (SELFTEST_H5) await page.addStyleTag({ content: '[role="dialog"]{overflow:visible !important} [data-orientation][dir]{display:block !important}' }).catch(() => {})
      await page.waitForTimeout(150)
      // 開啟:優先點 story 自己的觸發鈕(排除 Storybook 自身的控制項)
      // 只點 story 根容器裡、有文字的按鈕(Storybook 自己的控制項在根容器外),最多兩顆、逾時 700ms:
      // 原本掃全頁 4 顆 × 1.5s,在「這支沒有 dialog」時純粹是空等,整條 H5 從 1 分鐘變 6 分鐘。
      const triggers = await page.locator('#storybook-root button').all().catch(() => [])
      for (const t of triggers.slice(0, 2)) {
        if (await page.locator('[role="dialog"]').count() > 0) break
        await t.click({ timeout: 700 }).catch(() => {})
        await page.waitForTimeout(180)
      }
      const r = await page.evaluate(() => {
        const c = document.querySelector('[role="dialog"]')
        if (!c) return null
        const cr = c.getBoundingClientRect()
        const outside = [...c.querySelectorAll('*')].filter((n) => {
          const b = n.getBoundingClientRect()
          if (b.height <= 0 || b.width <= 0) return false
          // 捲動區「裡面」的內容捲出視野是正常的,只算畫在**容器外**又沒有祖先在裁切的
          let p = n.parentElement
          while (p && p !== c) { if (getComputedStyle(p).overflowY !== 'visible') return false; p = p.parentElement }
          return b.bottom > cr.bottom + 1 || b.top < cr.top - 1
        })
        const vp = c.querySelector('[data-radix-scroll-area-viewport]')
        let reachable = true
        if (vp && vp.scrollHeight > vp.clientHeight + 1) {
          vp.scrollTop = vp.scrollHeight
          const last = [...c.querySelectorAll('input,button,label,a')].pop()
          if (last) { const lb = last.getBoundingClientRect(); reachable = lb.bottom <= cr.bottom + 1 }
        }
        return { 溢出數: outside.length, 可達: reachable, 容器overflow: getComputedStyle(c).overflowY }
      }).catch(() => null)
      if (!r) continue
      h5Checked++
      if (process.env.H5_DEBUG) console.log('   [H5]', id, JSON.stringify(r))
      if (r.溢出數 > 0 || !r.可達 || r.容器overflow === 'visible') h5Bad.push({ id, vh, ...r })
    }
  }
  await page.setViewportSize({ width: 1280, height: VH })
  h5CheckedTotal = h5Checked; h5BadTotal = h5Bad.length
  ck(`H5 視窗變矮時內容不外溢且搆得到(掃 ${h5Checked} 個 dialog/sheet 場景)`, h5Checked > 0 && h5Bad.length === 0,
     h5Checked === 0 ? '一個 dialog 都沒開起來 —— 這條什麼都沒驗到' : JSON.stringify(h5Bad.slice(0, 4)))
} finally {
  await browser.close()
  await server.stop()
}
if (SELFTEST_H5) {
  if (h5CheckedTotal === 0) { console.log(`\n✗ H5 對照組:一個 dialog 都沒開起來 —— 什麼都沒驗到`); process.exit(1) }
  if (h5BadTotal === 0) { console.log(`\n✗ H5 對照組:還原了容器 overflow 與 Tabs 的 flex,H5 卻沒紅 —— 儀器失效`); process.exit(1) }
  console.log(`\n✓ H5 對照組:還原兩個修法後,${h5BadTotal} 個場景如預期紅(儀器有效)`)
  process.exit(0)
}
if (SELFTEST) {
  // 對照組要能宣稱「儀器有效」,必須同時成立:(a) 真的改寫到了 chunk (b) 改寫之後真的紅了。
  // 少了 (a) 就只是「什麼都沒做所以沒紅」,那不是證據。
  if (patchedChunks === 0) { console.log(`\n✗ 對照組沒有生效:沒有任何 chunk 含 \`calc(100svh - \`(chunk 切法變了?)——這次什麼都沒驗到`); process.exit(1) }
  if (fail === 0) { console.log(`\n✗ 對照組改寫了 ${patchedChunks} 個 chunk,但斷言全過 —— 儀器該紅卻沒紅`); process.exit(1) }
  console.log(`\n✓ 對照組:改寫 ${patchedChunks} 個 chunk 拿掉上限後,${fail} 條斷言如預期紅(儀器有效)`)
  process.exit(0)
}
console.log(fail ? `\n✗ ${fail} 項未通過` : `\n✓ Dialog 高度不變式:全通過`)
process.exit(fail ? 1 : 0)
