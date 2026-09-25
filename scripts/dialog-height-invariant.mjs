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
 * 開 story(2026-09-25 起):lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作)——
 *   Storybook 回報渲染完成(含 play)+ render-health(+ 被點的觸發鈕本身 / H5 另等版面連續 5 影格靜止)才開始操作。
 *   取代原本「load + 等根節點有子元素 + 各步 `.catch(() => {})`」:舊寫法在 story 載不起來時 H1–H4 會變成
 *   「前提失敗」—— 而 `--selftest` 把任何 fail 都讀成「對照組如預期紅了」,H5 則把載不起來的 story 靜靜 `continue` 掉。
 *   現在 story 開不起來 = 儀器失效:點名 story、附同源 404、exit 1(不用 2:lib/gate-selftest-meta.mjs 在 2026-09-25 修正前把 exit 2 讀成「環境起不來 → 略過」,沒量到會被 meta-test 當成綠),不是產品裁決,任何模式下都不算對照組成功;
 *   dialog 沒開起來的前提失敗在對照組模式下也不算「紅得對」。H5 裡「前兩顆鈕都開不出 dialog」的 story 照舊不適用,
 *   但改成具名列出(沒量到要看得見)。
 *
 *   node scripts/dialog-height-invariant.mjs [--build=<dir>] [--selftest]
 */
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
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
let routeRetries = 0   // --selftest 轉送 .js 時重送的次數(印在結尾,讓「靠重送才過」看得見)
let h5CheckedTotal = 0
let h5BadTotal = 0
/** story 開不起來(儀器失效,不是產品裁決)的紀錄;任何模式下都 exit 1,而且先於對照組判定。 */
const instrumentFails = []
/** 「兩支 story 的 dialog 都開得起來」前提;對照組模式下前提沒成立 = 什麼都沒驗到,不得算成「紅得對」。 */
let preconditionOk = true
const ck = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`); if (!ok) fail++ }
const storyUrl = (id) => `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`
const recordInstrument = (id, error) => {
  if (!(error instanceof StoryRenderInstrumentError)) throw error
  console.log(`✗ ${error.message}`)
  instrumentFails.push({ id, detail: error.detail })
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: VH } })
  if (SELFTEST && !SELFTEST_H5) {
    // 把兩種模式共用的上限拿掉(`calc(100svh - …)` 換成一個永遠夾不住的值)。
    // **路由所有 .js 不是只路由 dialog-*.js**(2026-09-11):CI 的 chunk 切法跟本機不同,
    // 只比對檔名會整個漏掉 —— 那一跑對照組沒生效、`fail` 是 0,腳本卻印「如預期紅」並 exit 1(訊息與事實相反)。
    await page.route((u) => u.pathname.endsWith('.js'), async (route) => {
      // 轉送請求本身失敗(2026-09-25 本機實測一次 `route.fetch: read ECONNRESET`;成因未證實,推測是靜態站 keep-alive 閒置關閉與重用的競態)時,
      // 原本是未接住的 rejection、整支閘崩掉。GET 重送一次;還是失敗就讓瀏覽器看到這支 script 載入失敗 ——
      // 屬於正在開的 story 時 openStory 會以「關鍵資源失敗」判儀器失效並點名,不會被讀成「對照組紅了」,也不會崩。
      let res, body
      const fetchBody = async () => { res = await route.fetch(); body = await res.text() }
      try { await fetchBody() } catch {
        routeRetries++
        try { await fetchBody() } catch { return route.abort('failed').catch(() => {}) }
      }
      if (body.includes('calc(100svh - ')) { patchedChunks++; body = body.split('calc(100svh - ').join('calc(100000px - ') }
      return route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'application/javascript' } })
        .catch(() => route.abort('failed').catch(() => {}))   // 頁面已換頁 / 請求已取消:同上,交給 openStory 判定,不讓閘崩掉
    })
  }
  /** 開啟指定 story 的 dialog,回傳幾何。story 以 trigger 開啟;openArgs 用 Storybook args 覆寫 DialogContent 的 prop 做不到,
   *  所以 H1/H4 改用「在頁面內直接改 inline style 的對照」——不動元件、只驗上限有沒有效。
   *  dialog 沒開起來回 null(產品前提失敗);story 本身開不起來丟 StoryRenderInstrumentError(儀器失效)。 */
  const open = async (id) => {
    // **等元素,不等 networkidle**(2026-09-22,M32 第四問同族,本輪已修過 action-bar-toolbar /
    // agent-fab-drag-click / overlay-detached-anchor / data-table-fast-scroll 四支)。
    // 這兩支 story 的頭像來自 i.pravatar.cc;CI 上該主機慢或不通時「網路安靜」永遠等不到,
    // 正式車道在第一個 open() 就 120 秒 TimeoutError 崩掉 —— 而 H5 那段早就改成 `load` + 等根節點。
    // 「網路安靜」是「畫面就緒」的代理;直接等要用的元素:openStory 等渲染完成 + render-health + 可見的觸發鈕本身
    // (`button` 的第一個可能是 Storybook 注入的隱藏元素,實測「element is not visible」,所以等 `:visible`),點了再等 dialog 出現。
    await openStory(page, storyUrl(id), { waitFor: '#storybook-root button:visible', navigationTimeoutMs: 60_000, notFound: server.notFound })
    const trigger = page.locator('#storybook-root button:visible').first()
    // 點不動 / dialog 沒出現 → 回 null,由「前提:dialog 開得起來」那條判紅(那是產品側的事,不是儀器)
    await trigger.click({ timeout: 10_000 }).catch(() => {})
    await page.locator('[role="dialog"]').first().waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {})
    // 固定睡眠只留給「元素出現後的版面穩定」(Radix 開啟動畫 + 上限 calc),不是拿來等頁面
    await page.waitForTimeout(300)
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

  const P = 'design-system-components-dialog-展示'
  const tryOpen = async (id) => { try { return { r: await open(id) } } catch (error) { recordInstrument(id, error); return { instrument: true } } }
  const shortOpen = await tryOpen(`${P}--destructive`)     // 確認刪除:一句話 → hug
  const longOpen = await tryOpen(`${P}--long-content`)     // 長內容:30 筆 → fill
  const short = shortOpen.r ?? null, longC = longOpen.r ?? null
  const h1to4 = !shortOpen.instrument && !longOpen.instrument   // 儀器失效時 H1–H4 一條都不判(沒量到 ≠ 產品壞)
  if (h1to4) {
    preconditionOk = !!short && !!longC
    ck('前提:兩支 story 的 dialog 都開得起來', preconditionOk, JSON.stringify({ short: short?.h, long: longC?.h }))
  }

  if (h1to4 && short && longC) {
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
  const h4 = !h1to4 ? null : await page.evaluate((available) => {
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
  const h5NoDialog = []
  for (const id of overlayIds) {
    for (const vh of [240]) { // 240 是最嚴苛的一檔;跑兩檔只是把同一條斷言重跑一次,CI 時間卻加倍
      await page.setViewportSize({ width: 1280, height: vh })
      // 渲染完成(含 play)+ render-health + 版面連續 5 影格靜止(defaultOpen 的 dialog 開啟過渡也要走完才量)。
      // 取代原本「load + 等根節點有子元素(5 秒逾時被吞)+ 固定睡 150ms」:story 載不起來時舊寫法會靜靜 continue 掉。
      try {
        await openStory(page, storyUrl(id), { settleFrames: 5, navigationTimeoutMs: 60_000, notFound: server.notFound })
      } catch (error) { recordInstrument(id, error); continue }
      // H5 的對照組:把 2026-09-12 的兩個修法同時還原 —— 容器 overflow 放開 + Tabs Root 退回裸 block。
      // 少了這一步,H5 的綠燈只證明「現在沒壞」,不證明「壞了會被抓到」。
      if (SELFTEST_H5) await page.addStyleTag({ content: '[role="dialog"]{overflow:visible !important} [data-orientation][dir]{display:block !important}' })
      // 開啟:優先點 story 自己的觸發鈕(排除 Storybook 自身的控制項)
      // 只點 story 根容器裡、有文字的按鈕(Storybook 自己的控制項在根容器外),最多兩顆、逾時 700ms:
      // 原本掃全頁 4 顆 × 1.5s,在「這支沒有 dialog」時純粹是空等,整條 H5 從 1 分鐘變 6 分鐘。
      const triggers = await page.locator('#storybook-root button').all().catch(() => [])
      for (const t of triggers.slice(0, 2)) {
        if (await page.locator('[role="dialog"]').count() > 0) break
        await t.click({ timeout: 700 }).catch(() => {})
        // 180ms:等點擊後 Radix 掛上 [role=dialog] 並開始開啟過渡,下一輪才判斷「開出來了沒」
        await page.waitForTimeout(180)
      }
      let r
      try { r = await page.evaluate(() => {
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
      }) } catch (error) {
        // 量測本身丟例外(頁面在量的途中換掉 / 崩潰)= 沒量到,不是「這支沒有 dialog」
        const detail = `H5 量測丟例外:${String(error?.message ?? error).split('\n')[0]}`
        console.log(`✗ INSTRUMENT-FAIL story「${id}」沒有量到 —— ${detail}。這是儀器失效(沒量到),不是產品裁決`)
        instrumentFails.push({ id, detail })
        continue
      }
      // 前兩顆鈕都開不出 dialog(這支 story 沒有 dialog 觸發鈕)= 不適用;具名記下,不默默略過
      if (!r) { h5NoDialog.push(id); continue }
      h5Checked++
      if (process.env.H5_DEBUG) console.log('   [H5]', id, JSON.stringify(r))
      if (r.溢出數 > 0 || !r.可達 || r.容器overflow === 'visible') h5Bad.push({ id, vh, ...r })
    }
  }
  await page.setViewportSize({ width: 1280, height: VH })
  console.log(`   H5 沒開出 dialog 而不適用的 story(${h5NoDialog.length}):${h5NoDialog.map((x) => x.replace(/^design-system-[a-z]+-/, '')).join(', ') || '(無)'}`)
  h5CheckedTotal = h5Checked; h5BadTotal = h5Bad.length
  ck(`H5 視窗變矮時內容不外溢且搆得到(掃 ${h5Checked} 個 dialog/sheet 場景)`, h5Checked > 0 && h5Bad.length === 0,
     h5Checked === 0 ? '一個 dialog 都沒開起來 —— 這條什麼都沒驗到' : JSON.stringify(h5Bad.slice(0, 4)))
} finally {
  await browser.close()
  await server.stop()
}
if (instrumentFails.length) {
  // 沒量到 ≠ 通過,也 ≠ 對照組紅了:這些 story 一條都沒量(同源 404 帳本見上方各筆訊息)
  console.log(`\n✗ 儀器失效:${instrumentFails.length} 則 story 沒量到 —— 這不是產品裁決,本次不能宣稱通過,對照組也不能宣稱有效:`)
  for (const f of instrumentFails) console.log(`  · ${f.id}:${f.detail}`)
  if (!SELFTEST && !SELFTEST_H5 && fail) console.log(`✗ 另有 ${fail} 項產品斷言未通過`)
  process.exit(1)
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
  if (!preconditionOk) { console.log(`\n✗ 對照組前提失敗:dialog 沒開起來 —— 紅的是前提不是 H2 / H4,什麼都沒驗到`); process.exit(1) }
  if (fail === 0) { console.log(`\n✗ 對照組改寫了 ${patchedChunks} 個 chunk,但斷言全過 —— 儀器該紅卻沒紅`); process.exit(1) }
  console.log(`\n✓ 對照組:改寫 ${patchedChunks} 個 chunk 拿掉上限後,${fail} 條斷言如預期紅(儀器有效)${routeRetries ? `;轉送 .js 重送 ${routeRetries} 次` : ''}`)
  process.exit(0)
}
console.log(fail ? `\n✗ ${fail} 項未通過` : `\n✓ Dialog 高度不變式:全通過`)
process.exit(fail ? 1 : 0)
