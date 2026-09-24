#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 焦點框幾何實測閘 —— 「這個框會不會被裁 / 會不會撞到鄰居」
// ═══════════════════════════════════════════════════════════════════════════
//
// SSOT:`packages/design-system/ds-canonical/references/focus-canonical.md`「問題二」
//
// @gate-contract
//   保證: 每個元件的代表 story 在淺色 / 深色主題下**確實渲染完成後**,焦點框不被裁、不撞鄰居;無框站點有看得見的承擔者;宣告內描邊的站點確實需要往內。沒量到的 story 一律以「儀器失效」紅,不讀成通過
//   紅: 焦點框被裁 / 撞鄰居超過基準線、承擔者零差異、內描邊其實放得下 → 指名該站;story 載不起來(id 不存在、chunk 404、render 出錯)或零量測 → 以儀器失效紅並點名 story。--selftest / --selftest-inset 分別把焦點視覺釘死 / 釘成內描邊,必須紅;每次執行另跑對照組 (a) 不存在的 story id 必判失敗、(b) 刪掉 chunk 的建置副本必判失敗
//   綠: 現況全 DS 兩主題全部載入且量到焦點站、產品清單都在基準線內時綠;對照組 (b) 的綠面是同一則 story 在完整建置必須載得起來 —— 判「載入成功」的那一側也有證據
//
// `focus-geometry-invariant.mjs` 是靜態的(守「只准兩種幾何」),這一支是動態的
// (守「每一站選對了那一種」)。兩支合起來才完整:靜態掃不出「這個元素四周有沒有空間」。
//
// 判準只有一句(user 2026-09-07 逐字):**預設往外;只有當元素可能合法地被塞在四周
// 沒有足夠視覺空間的地方,才往內。** 機械化就是:真的畫出來,量框有沒有越界。
//
// 三類豁免(不是放水,是判準本來就不涵蓋):
//   (a) 已經是內描邊(grow ≤ 0)—— 框畫在元素裡面,不會越界;但**改為反向驗證**:
//       把它當成往外(offset +2 / 寬 2)重算一次,若這樣也不會被裁、不會撞鄰居,
//       就代表這一站根本不需要往內 → 列進「宣告內描邊但其實放得下」。
//       2026-09-10 加:這個豁免原本讓「往內」的宣告永遠不被重驗,行內動作鈕因此帶著
//       一句沒有量過的註解(「往外 +2px 上下各被裁 1px」)整整存活到 user 追問;
//       儀器對自己的綠燈也要有對照組(M32)。
//   (b) 行內元素 —— 瀏覽器原生焦點框壓到相鄰文字是全網慣例
//   (c) 浮層(fixed / absolute)—— 它本來就疊在別的東西上面
//
// 為什麼要真瀏覽器:「四周有沒有 2px」這件事只有排版跑完才知道,原始碼看不出來。
// 2026-09-07 第一版量法把「祖先的內容邊」一律當障礙,結果全 DS 每一站都判成 0 —— 錯在
// **不裁切的祖先根本不會切到框**。修正後 72 站往外、1 站往內,才是合理分佈。
//
// 起不了 Chromium 的受限環境回報 SKIPPED-ENV(同 data-table-invariants 先例)。
//
// **載入失敗 = 儀器失效,不是通過**(2026-09-25):
// 原本一則 story 載不起來時只在報告印一行 ✗、不計入失敗 —— 而更常見的情形連那一行都沒有:
// Storybook 對「找不到這個 story id」「story 的 chunk 404」**不丟例外**,`goto` 照樣成功,
// 畫面換成 Storybook 自己的錯誤頁。Tab 走訪接著就在錯誤頁上量到 4 個說明連結,
// 當成元件的焦點站算進「正常外描邊」。實測(舊版,2026-09-25):一份刪掉 Button / Checkbox
// stories chunk 的建置 → 「合計:正常外描邊 8」+「✓ 焦點框幾何全部正確」、exit 0;
// 只剩一則不存在 story 的索引 → 「正常外描邊 4」、exit 0。全部 58 則都載不起來也一樣是綠的。
// 這是 M37「沒觀察到 ≠ 沒發生」—— 還更糟,量到的是錯誤頁,不是元件。
//
// 現在:
//   (1) 每則 story 先證明「真的渲染完成」才量:Storybook 回報 render phase = finished
//       (含 play 函式)、根節點有內容、沒有關鍵資源 404 / 頁面例外(lib/storybook-render-health.mjs)。
//       任一不成立 → 記成**儀器失效**,訊息點名 story 與原因,並聲明那不是產品裁決。
//   (2) 地板:清單是空的、或某個主題全程量到 0 個焦點站 → 儀器失效。
//       渲染成功但 Tab 走訪一站都沒抵達:畫面上其實有可聚焦元素 → 儀器失效;真的沒有 → 列為「無裁決」。
//   (3) 每次執行(三種模式都一樣)先跑兩面對照組,證明偵測器**此刻**會紅(見 instrumentSelfCheck);
//       自檢沒過就不掃 —— 偵測器不可信時量到的東西也不能當證據。
//   「已渲染」不再用固定睡眠代理(原本 networkidle + 400ms):FileItem 的 play 函式在根節點出現後
//   還要約 450ms 才把焦點移到刪除鈕,固定睡眠在慢機器上會讓 Tab 走訪跟 play 搶焦點。
//
// Run: `node scripts/focus-geometry-browser-audit.mjs [--selftest | --selftest-inset]`
//   除錯 / 對照組用(CI 不用):
//   `--story <id>`          只量指定的 story(可重複)
//   `--static-dir <目錄>`   改量另一份 Storybook 建置(預設 ./storybook-static)

// 焦點框「會不會被裁 / 會不會撞到鄰居」偵測器
// 決定每一站該用外描邊(全域)還是內描邊(focus-ring-inset)。判準 SSOT:focus-canonical 問題二。
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { gotoStory, launchBrowser } from './lib/launch-browser.mjs'
import { createStorybookRenderHealthMonitor } from './lib/storybook-render-health.mjs'

const ARGV = process.argv.slice(2)
const SELFTEST = ARGV.includes('--selftest')
const SELFTEST_INSET = ARGV.includes('--selftest-inset')
const optionValues = (name) => ARGV.flatMap((arg, i) => {
  if (arg.startsWith(`${name}=`)) return [arg.slice(name.length + 1)]
  return arg === name && ARGV[i + 1] && !ARGV[i + 1].startsWith('--') ? [ARGV[i + 1]] : []
})
for (const name of ['--story', '--static-dir']) {
  if (ARGV.some((a) => a === name || a.startsWith(`${name}=`)) && !optionValues(name).length) {
    console.error(`✗ ${name} 後面要接值`); process.exit(1)
  }
}
const ONLY_STORIES = optionValues('--story')
const STATIC = resolve(optionValues('--static-dir').at(-1) ?? join(process.cwd(), 'storybook-static'))
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server=await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
const B=server.origin
// story 索引也從同一份快照讀(元件清單與實際供檔的建置必須是同一份)
const SERVED_ROOT = server.snapshot?.dir ?? STATIC
const INDEX=join(SERVED_ROOT,'index.json')
// 失敗時一併印同源 404 帳本:不讓「儀器沒拿到檔」被讀成「元件沒渲染」
const report404=()=>{ if(server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) }
let br
try { br = await launchBrowser() }
catch (e) { await server.stop(); console.error('⚠️  SKIPPED-ENV: 無法啟動 Chromium(' + String(e.message).split('\n')[0] + ')'); process.exit(0) }

// ── 「這則 story 真的渲染完成了嗎」────────────────────────────────────────
// 要保證的性質是「量的是這則 story 渲染完成後的畫面」,所以直接等那個性質(M37):
//   先等根節點(或 Storybook 的錯誤頁 / 無預覽頁)出現 —— 元素本身,不是睡幾毫秒(lib/launch-browser.mjs gotoStory);
//   再等 Storybook 回報這次渲染走完(render phase = finished,含 play 函式;errored / aborted 也是終點);
//   最後由 render-health 判:錯誤頁文字、根節點是否有內容、關鍵資源 404、頁面例外。
// 等不到「走完」也算失敗(訊息會說是等不到),**不退回固定睡眠** —— Storybook 升級改了這個訊號時,
// 這裡會紅而且說得出原因,而不是悄悄回到「睡夠久應該好了」。
const STORY_SHELL = '#storybook-root > *, body > [data-radix-portal] > *, body.sb-show-errordisplay, body.sb-show-nopreview'
const oneLine = (s) => String(s).split('\n')[0].slice(0, 240)
async function loadStory(pg, origin, storyId, ledger) {
  const from = ledger.length
  const health = createStorybookRenderHealthMonitor(pg)
  try {
    await gotoStory(pg, `${origin}/iframe.html?id=${storyId}&viewMode=story`, { waitFor: STORY_SHELL, settle: 0, timeout: 30000, appearTimeout: 20000 })
    const phase = await pg.waitForFunction(() => {
      const cls = document.body.classList
      if (cls.contains('sb-show-errordisplay')) return 'error-display'
      if (cls.contains('sb-show-nopreview')) return 'no-preview'
      const p = window.__STORYBOOK_PREVIEW__?.currentRender?.phase
      return p === 'finished' || p === 'errored' || p === 'aborted' ? p : false
    }, null, { timeout: 20000 }).then((handle) => handle.jsonValue(), () => 'timeout')
    // 錯誤頁的原文(例:Couldn't find story matching …)由 render-health 讀出來,比 phase 名稱更有用,所以先判它
    await health.assertHealthy({ label: storyId, timeoutMs: 5000 })
    if (phase === 'timeout') throw new Error('20 秒內等不到 Storybook 回報渲染完成(render phase 沒走到 finished)')
    if (phase !== 'finished') throw new Error(`Storybook 回報渲染結果 = ${phase}`)
    // 字型載完才量:字寬會改幾何(原本由 networkidle 順帶涵蓋)
    await pg.evaluate(() => document.fonts.ready.then(() => true))
    return { ok: true }
  } catch (error) {
    const missing = [...new Set(ledger.slice(from))]
    // render-health 的訊息前綴是「render health:<story id>:」—— 呼叫端本來就會點名 story,去掉重複的那段
    const message = oneLine(error?.message ?? error).replace(`render health:${storyId}:`, '')
    return { ok: false, reason: message + (missing.length ? `(同源 404:${missing.join(', ')})` : '') }
  } finally {
    health.dispose()
  }
}

// 畫面上「Tab 應該走得到」的元素數。只在 Tab 走訪一站都沒抵達時用來分辨兩種情形:
// 真的沒有可聚焦元素(本閘對這則 story 無裁決)vs. 有元素卻沒走到(儀器沒在量 → 失效)。
const countTabbable = () => [...document.querySelectorAll('a[href],area[href],button,input,select,textarea,iframe,summary,[tabindex],[contenteditable]')]
  .filter((e) => e.tabIndex >= 0 && !e.disabled && e.type !== 'hidden' && !e.closest('[inert]') &&
    e.getClientRects().length > 0 && getComputedStyle(e).visibility === 'visible').length

// ── 儀器判定(純函式;判定表在 instrumentSelfCheck 每次執行都跑)──────────────
// 儀器失效優先於任何產品裁決:沒量到的東西不能被讀成「沒問題」,也不能被讀成「元件壞了」。
function instrumentVerdict({ planned, failures, stations }) {
  const problems = []
  if (planned === 0) problems.push('要量的 story 清單是空的 —— 一則都沒量,不能說「全部正確」')
  for (const f of failures) problems.push(`${f.label} [${f.theme}] story=${f.storyId}:${f.reason}`)
  if (planned > 0) {
    for (const [theme, n] of Object.entries(stations)) {
      if (n === 0) problems.push(`${theme} 主題全程量到 0 個焦點站 —— 儀器沒有量到任何東西`)
    }
  }
  return problems
}

// ── 兩面對照組:偵測器此刻真的會紅嗎 ─────────────────────────────────────
// 每次執行都跑(一般 / --selftest / --selftest-inset 三種模式都一樣),不靠 CI 另外記得呼叫:
//   判定表:全部載入失敗 / 一則失敗 / 零量測 / 清單為空 → 必紅;正常 → 必綠
//   (a) 一個不存在的 story id → 必須被判成載入失敗
//   (b) 同一則真 story:從受測建置載得起來(綠的那一面),從「刪掉它的 chunk」的副本載 → 必須被判失敗,
//       而且 404 帳本要記到那個 chunk(紅的那一面)。兩面都成立,「載入成功」這個判斷才算證據。
const PROBE_MISSING_ID = 'focus-geometry-instrument-probe--story-that-does-not-exist'
async function instrumentSelfCheck(pg, probeStory) {
  const problems = [], lines = []
  const fake = (n) => Array.from({ length: n }, (_, i) => ({ label: `假${i}`, theme: 'light', storyId: `fake-${i}`, reason: '對照' }))
  const table = [
    ['全部 story 載入失敗', { planned: 2, failures: fake(4), stations: { light: 0, dark: 0 } }, true],
    ['一則 story 載入失敗', { planned: 2, failures: fake(1), stations: { light: 5, dark: 5 } }, true],
    ['全部載入但零量測', { planned: 2, failures: [], stations: { light: 0, dark: 0 } }, true],
    ['清單為空', { planned: 0, failures: [], stations: { light: 0, dark: 0 } }, true],
    ['正常', { planned: 2, failures: [], stations: { light: 5, dark: 5 } }, false],
  ]
  const wrong = table.filter(([, input, red]) => (instrumentVerdict(input).length > 0) !== red).map(([name]) => name)
  if (wrong.length) problems.push(`判定表不成立:${wrong.join('、')}`)
  else lines.push(`✓ 判定表 ${table.length}/${table.length}(載入失敗 / 零量測 / 空清單必紅,正常必綠)`)

  const a = await loadStory(pg, B, PROBE_MISSING_ID, server.notFound)
  if (a.ok) problems.push(`(a) 不存在的 story「${PROBE_MISSING_ID}」被判成載入成功 —— 載入失敗偵測器沒有作用`)
  else lines.push(`✓ (a) 不存在的 story → 判成載入失敗:${a.reason}`)

  // 綠的那一面先做:受測建置本身載不起來時,原因(錯誤頁原文 + 404)直接就是答案
  const intact = probeStory?.importPath ? await loadStory(pg, B, probeStory.id, server.notFound) : null
  if (!probeStory?.importPath) {
    problems.push('(b) 對照組建不起來:索引裡找不到任何元件 story')
  } else if (!intact.ok) {
    problems.push(`(b) 對照組建不起來:${probeStory.id} 在受測建置本身就載不起來 —— ${intact.reason}`)
  } else {
    // Vite 的 chunk 檔名 = 模組檔名(去副檔名)+ '-' + 8 碼雜湊 + '.js'
    const base = basename(probeStory.importPath).replace(/\.(tsx|ts|jsx|js|mdx)$/, '')
    const escaped = base.replace(/[.*+?^$|()[\]{}\\]/g, '\\$&')
    const chunkPattern = new RegExp('^' + escaped + '-[A-Za-z0-9_-]{8}\\.js$')
    const chunks = readdirSync(join(SERVED_ROOT, 'assets')).filter((f) => chunkPattern.test(f))
    if (chunks.length !== 1) {
      problems.push(`(b) 對照組建不起來:${probeStory.id} 的 chunk 在 assets/ 對到 ${chunks.length} 個檔(要剛好 1 個)`)
    } else {
      const copyDir = mkdtempSync(join(tmpdir(), 'focus-geometry-control-'))
      let broken = { ok: true, reason: '', missing: [] }
      try {
        cpSync(SERVED_ROOT, copyDir, { recursive: true })
        rmSync(join(copyDir, 'assets', chunks[0]))
        // 副本已經是本次獨佔的,不用再凍結一次
        const control = await startA11yStaticServer({ rootDirectory: copyDir, defaultFile: 'iframe.html', snapshot: false })
        try {
          broken = { ...(await loadStory(pg, control.origin, probeStory.id, control.notFound)), missing: [...new Set(control.notFound)] }
        } finally { await control.stop() }
      } finally { rmSync(copyDir, { recursive: true, force: true }) }
      if (broken.ok) problems.push(`(b) 刪掉 ${chunks[0]} 之後 ${probeStory.id} 仍被判成載入成功 —— 缺檔偵測器沒有作用`)
      else if (!broken.missing.some((p) => p.endsWith(`/${chunks[0]}`))) problems.push(`(b) 刪掉 ${chunks[0]} 後判成失敗,但 404 帳本沒記到它(記到:${broken.missing.join(', ') || '無'})`)
      else lines.push(`✓ (b) ${probeStory.id}:受測建置載得起來;刪掉 ${chunks[0]} 的副本 → 判成載入失敗`)
    }
  }
  return { problems, lines }
}

const DETECT = `(() => {
  const el = document.activeElement
  if (!el || el === document.body || el === document.documentElement) return null
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return null
  const cs = getComputedStyle(el)
  const desc = el.tagName.toLowerCase() + (el.getAttribute('role')?'['+el.getAttribute('role')+']':'') + '.' + String(el.className).split(/\\s+/).filter(Boolean).slice(0,2).join('.')
  const off = parseFloat(cs.outlineOffset) || 0
  const w = parseFloat(cs.outlineWidth) || 0
  const drawn = cs.outlineStyle !== 'none' && w > 0
  // 框實際佔到的外框(往外為正)
  const grow = off + w
  const box = { top: r.top - grow, right: r.right + grow, bottom: r.bottom + grow, left: r.left - grow }
  const EPS = 0.5
  const problems = []
  // 三類不算「框的問題」:
  //  (a) grow <= 0 —— 框完全畫在元素內,任何超出都是**元素自己**早就超出去,與焦點框無關
  //  (b) 行內元素 —— 瀏覽器原生焦點框壓到相鄰文字是全網慣例,不視為碰撞
  //  (c) 浮層(fixed / absolute 且脫離文件流)—— 它本來就疊在別的東西上面
  const inline = cs.display === 'inline'
  const floating = cs.position === 'fixed' || cs.position === 'absolute'
  // 無框的先做記號,承擔者證明留到走訪結束後**非同步**做 ——
  // 因為要等 transition 跑完才能量。2026-09-08 第一版寫成同步(blur 後立刻取樣),
  // 量到的是過渡中間值:NumberInput 的欄位外框明明會轉主色,卻被判成「零差異」。
  // 同一個坑本輪已經踩第二次(見 AD6),所以這裡把「等穩態」寫死在流程裡。
  let carrier = null, flIdx = null
  if (!drawn && cs.boxShadow === 'none') {
    // 只在還沒編號時才編:Tab 走訪會重複經過同一個元素(列有去重,DETECT 沒有),
    // 重編會讓列裡存的舊號碼對不到任何元素,證明迴圈就整批 continue 掉
    // → 報告變成一片「零差異」。(2026-09-08 改成編號配對時當場踩到)
    if (!el.hasAttribute('data-fl-idx')) {
      window.__fl = (window.__fl || 0) + 1
      el.setAttribute('data-fl-idx', String(window.__fl))
    }
    carrier = 'pending'
    flIdx = Number(el.getAttribute('data-fl-idx'))
  }
  const insetSite = drawn && grow <= 0
  const exempt = inline || floating
  if (exempt) return { desc, drawn, style: cs.outlineStyle+' '+cs.outlineWidth+' @'+cs.outlineOffset,
    color: cs.outlineColor, size: r.width.toFixed(0)+'x'+r.height.toFixed(0), problems: [],
    exempt: inline?'行內':'浮層', boxShadow: cs.boxShadow==='none'?'':'有', carrier, flIdx }
  if (!drawn && !insetSite) return { desc, drawn, style: cs.outlineStyle+' '+cs.outlineWidth+' @'+cs.outlineOffset,
    color: cs.outlineColor, size: r.width.toFixed(0)+'x'+r.height.toFixed(0), problems: [],
    boxShadow: cs.boxShadow==='none'?'':'有', carrier, flIdx }
  // 內描邊的站點:改用**往外**的幾何(全域規則的 offset 2 + 寬 2)重算,問「如果往外畫會不會出事」
  if (insetSite) { const g = 4
    box.top = r.top - g; box.right = r.right + g; box.bottom = r.bottom + g; box.left = r.left - g }
  // (1) 會裁切的祖先:框有沒有超出它的 padding box
  let p = el.parentElement
  while (p && p !== document.documentElement) {
    const pcs = getComputedStyle(p)
    if (pcs.overflowX !== 'visible' || pcs.overflowY !== 'visible') {
      const pr = p.getBoundingClientRect()
      const inner = {
        top: pr.top + parseFloat(pcs.borderTopWidth), bottom: pr.bottom - parseFloat(pcs.borderBottomWidth),
        left: pr.left + parseFloat(pcs.borderLeftWidth), right: pr.right - parseFloat(pcs.borderRightWidth) }
      const clipX = pcs.overflowX !== 'visible', clipY = pcs.overflowY !== 'visible'
      const cut = []
      // **元素自己已經越過那條邊時不算**(與豁免 (a) 同一個道理):可捲動容器裡被捲到一半的東西,
      // 它的文字本來就被裁掉了,框跟著被裁不是「框選錯畫法」。只有元素整個在裡面、框才凸出去,才是框的問題。
      // (2026-09-10 加:DataTable 排序表頭改回外描邊後,AppShell story 裡被水平捲掉一半的那一欄會誤報。)
      const selfIn = { top: r.top >= inner.top - EPS, bottom: r.bottom <= inner.bottom + EPS,
                       left: r.left >= inner.left - EPS, right: r.right <= inner.right + EPS }
      if (clipY && selfIn.top && box.top < inner.top - EPS) cut.push('上' + (inner.top - box.top).toFixed(1))
      if (clipY && selfIn.bottom && box.bottom > inner.bottom + EPS) cut.push('下' + (box.bottom - inner.bottom).toFixed(1))
      if (clipX && selfIn.left && box.left < inner.left - EPS) cut.push('左' + (inner.left - box.left).toFixed(1))
      if (clipX && selfIn.right && box.right > inner.right + EPS) cut.push('右' + (box.right - inner.right).toFixed(1))
      if (cut.length) problems.push({ kind: '被裁', by: p.tagName.toLowerCase()+'.'+String(p.className).split(/\\s+/).filter(Boolean).slice(0,2).join('.'), detail: cut.join(' ') })
    }
    p = p.parentElement
  }
  // (2) 鄰居碰撞:框有沒有壓到不重疊的**真的畫得出東西**的鄰居
  //     「畫得出東西」= 有不透明底色 / 有可見邊框 / 自己有文字 / 是圖片類 / 有陰影。
  //     透明的排版盒(collapsible 外框、truncate wrapper、grid 格子)**不算障礙** ——
  //     focus-canonical「正當障礙」那節講的是「會碰撞的鄰居」,不是「任何一個矩形」。
  //     2026-09-10 補:沒有這一條時,AgentPanel 的「思考過程」標題被它下方**全透明**的收合盒
  //     判成撞鄰居,於是一句沒量過的註解(「往外會壓到展開內容」)在閘裡永遠是綠的。
  const paints = (o, cs) => {
    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') return true
    for (const side of ['Top','Right','Bottom','Left']) {
      if (parseFloat(cs['border'+side+'Width']) > 0 && cs['border'+side+'Color'] !== 'rgba(0, 0, 0, 0)') return true
    }
    if (cs.boxShadow && cs.boxShadow !== 'none') return true
    if (cs.outlineStyle && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) return true
    if (['IMG','SVG','CANVAS','VIDEO','INPUT','TEXTAREA','HR'].includes(o.tagName)) return true
    for (const n of o.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true
    return false
  }
  for (const o of document.querySelectorAll('*')) {
    if (o === el || el.contains(o) || o.contains(el)) continue
    const ocs = getComputedStyle(o)
    if (ocs.display==='none' || ocs.visibility==='hidden' || parseFloat(ocs.opacity)===0) continue
    if (!paints(o, ocs)) continue
    const b = o.getBoundingClientRect()
    if (b.width < 1 || b.height < 1) continue
    // 疊層的不算鄰居(user 2026-09-07:疊起來的徽章不算)
    const already = b.left < r.right-EPS && b.right > r.left+EPS && b.top < r.bottom-EPS && b.bottom > r.top+EPS
    if (already) continue
    const hit = b.left < box.right-EPS && b.right > box.left+EPS && b.top < box.bottom-EPS && b.bottom > box.top+EPS
    if (hit) { problems.push({ kind: '撞鄰居', by: o.tagName.toLowerCase()+'.'+String(o.className).split(/\\s+/).filter(Boolean).slice(0,2).join('.'), detail: '' }); break }
  }
  return { desc, drawn, style: cs.outlineStyle+' '+cs.outlineWidth+' @'+cs.outlineOffset, color: cs.outlineColor,
    size: r.width.toFixed(0)+'x'+r.height.toFixed(0), problems, insetSite, boxShadow: cs.boxShadow==='none'?'':'有', carrier, flIdx }
})()`

const idx = JSON.parse(readFileSync(INDEX,'utf8'))
// **元件清單從 storybook 索引自動推導,不寫死。**
// 2026-09-07:原本是一份手寫的 39 個名字,而 DS 有 67 個元件 —— 漏了 Input / Select /
// Textarea / Dialog / Sheet / Pagination 等 29 個,卻在報告裡宣稱「全 DS」。
// 寫死的清單還有個更糟的性質:**新元件不會自動進來**,漏了也不會有人發現。
const compOf = (entry) => entry?.title?.replace(/\s/g, '').match(/Components\/([^/]+)/)?.[1]
const COMPS = [...new Set(Object.values(idx.entries).map(compOf).filter(Boolean))]
const pickStory = (comp) => {
  const cands = Object.values(idx.entries).filter(e=>e.title.replace(/\s/g,'').includes(`/${comp}/`) && !/--docs$/.test(e.id) && !/usage-guidance|inspector|-rule$/.test(e.id))
  return cands.find(e=>/展示/.test(e.title)) || cands.find(e=>/state-behavior|overview|accessibility/.test(e.id)) || cands[0]
}
// 對照組只需要證明「儀器該紅時會紅」,不需要全掃 —— 全掃要 5 分鐘,
// 為了證明儀器讓 CI 多花 5 分鐘不划算。取前 4 個元件足夠(實測仍會紅十幾處)。
const SWEEP = SELFTEST ? COMPS.slice(0, 4) : COMPS
// 要量的每一則 story。`--story` 只給除錯與對照組用:指定的 id 不在索引裡也照樣去載 —— 由載入判定點名它。
const TARGETS = ONLY_STORIES.length
  ? ONLY_STORIES.map((id) => ({ label: compOf(idx.entries[id]) ?? id, storyId: id, inIndex: Boolean(idx.entries[id]) }))
  : SWEEP.map((comp) => ({ label: comp, storyId: pickStory(comp)?.id ?? null, inIndex: true }))
{ const seenLabels = new Set(); for (const t of TARGETS) { t.key = seenLabels.has(t.label) ? `${t.label}#${t.storyId}` : t.label; seenLabels.add(t.label) } }
console.log(ONLY_STORIES.length
  ? `只量指定的 ${TARGETS.length} 則 story(--story)\n`
  : `涵蓋 ${SWEEP.length} 個元件(清單自 storybook 索引推導,新元件自動納入)\n`)
const report = {}
const failures = []            // 儀器失效:這則 story 沒有被量到(不是產品裁決)
const noStations = []          // 渲染成功、但畫面上沒有任何可聚焦元素 → 本閘對它無裁決(也不是通過)
const stations = { light: 0, dark: 0 }
let selfCheck = { problems: [], lines: [] }
try {
  const pg = await br.newPage({ viewport:{width:1440,height:900} })
  selfCheck = await instrumentSelfCheck(pg, COMPS.length ? pickStory(COMPS[0]) : null)
  console.log('儀器自檢(兩面對照組,每次執行都跑):')
  selfCheck.lines.forEach((l) => console.log('  ' + l))
  selfCheck.problems.forEach((p) => console.log('  ✗ ' + p))
  console.log('')
  // 自檢沒過 = 偵測器此刻不可信,量了也不能當證據 —— 不掃。也順帶擋住「整批 story 各等 20 秒逾時」
  // 把 job 撐爆(例:Storybook 升級改了 render phase 訊號,58 × 2 則會各自逾時)。
  const themes = selfCheck.problems.length ? [] : ['light', 'dark']
  if (!themes.length) console.log('儀器自檢沒過 → 不掃(偵測器此刻不可信,量到的東西也不能當證據)\n')
  for (const theme of themes) {
    for (const target of TARGETS) {
      const { key, label, storyId } = target
      if (!storyId) {
        if (theme === 'light') failures.push({ label, theme: '兩個主題', storyId: '(無)', reason: '索引裡這個元件沒有可量測的 story(全是 docs / usage-guidance / inspector / rule)' })
        continue
      }
      const loaded = await loadStory(pg, B, storyId, server.notFound)
      if (!loaded.ok) {
        failures.push({ label, theme, storyId, reason: (target.inIndex ? '' : '索引裡沒有這個 id;') + loaded.reason })
        continue
      }
      try {
        // DS 的主題是 <html data-theme>,不是 prefers-color-scheme(semantic.css:424 / primitives.css:259)
        await pg.evaluate(t => { document.documentElement.dataset.theme = t }, theme)
        // 對照組(--selftest):把所有焦點視覺全部釘死,承擔者證明就該全部變「零差異」。
        // 綠燈要能證明它「該紅的時候會紅」,否則這一段的通過不算證據(M32 sub-invariant)。
        if (SELFTEST) {
          await pg.addStyleTag({ content: `*,*::before,*::after{transition:none!important;border-color:#f00!important;background-color:transparent!important;text-decoration-color:#f00!important;box-shadow:none!important}*:focus,*:focus-visible{outline:none!important}` })
        }
        if (SELFTEST_INSET) {
          await pg.addStyleTag({ content: `*:focus-visible{outline:2px solid var(--ring)!important;outline-offset:-2px!important}` })
        }
        // 這 400ms **不再是**「已渲染」的代理(渲染完成已由 loadStory 直接等到);留下的用途只剩
        // 切主題 / 注入樣式之後讓顏色過渡跑完(沿用原值;gotoStory 的 settle 同一個用途)。
        await pg.waitForTimeout(400)
        const seen=new Set(), rows=[]
        for (let i=0;i<45;i++) {
          await pg.keyboard.press('Tab')
          const m = await pg.evaluate(DETECT)
          if (!m) continue
          const k = m.desc+'|'+m.size
          if (seen.has(k)) continue
          seen.add(k); rows.push(m)
          if (rows.length>=14) break
        }
        // ── 承擔者證明(非同步,等 transition 穩態)────────────────────────
        // 無框元素在原始碼裡宣告了「承擔者是誰」,但宣告是人寫的。這裡去現場證明:
        // 聚焦前後,自己或鄰域(往上 5 層 + 往下 30 個後代)的**可見**樣式差異必須非空。
        // 「可見」要濾掉兩種假差異:(a) outline-style 是 none 時的 color/width 變化畫不出來;
        // (b) 過渡進行中的同色不同序列化(oklch ↔ oklab)。所以每次取樣前都等 700ms。
        const flCount = await pg.evaluate(() => window.__fl || 0)
        for (let n = 1; n <= flCount; n++) {
          const sel = `[data-fl-idx="${n}"]`
          const exists = await pg.$(sel)
          if (!exists) continue
          await pg.evaluate((q) => {
            const e = document.querySelector(q); if (!e) return
            window.__chain = []; let m = e
            for (let k = 0; k < 5 && m; k++) { window.__chain.push(m); m = m.parentElement }
            let c = 0; for (const d of e.querySelectorAll('*')) { if (c++ >= 30) break; window.__chain.push(d) }
            window.__target = e
          }, sel)
          const PROPS = ['outlineStyle','outlineWidth','outlineColor','borderColor','borderWidth','backgroundColor','boxShadow','textDecorationLine','textDecorationColor']
          const snap = () => pg.evaluate((props) => window.__chain.map((e) => {
            const c = getComputedStyle(e); return props.map((k) => c[k])
          }), PROPS)
          await pg.evaluate(() => window.__target.blur()); await pg.waitForTimeout(700)
          const before = await snap()
          await pg.evaluate(() => window.__target.focus()); await pg.waitForTimeout(700)
          const after = await snap()
          const names = await pg.evaluate(() => window.__chain.map((e) =>
            (e === window.__target ? '自己' : window.__target.contains(e) ? '後代' : '祖先') + ':' +
            e.tagName.toLowerCase() + '.' + String(e.className).split(/\s+/).filter(Boolean).slice(0, 2).join('.')))
          const changed = []
          for (let k = 0; k < before.length; k++) {
            const diff = []
            for (let q = 0; q < PROPS.length; q++) {
              if (before[k][q] === after[k][q]) continue
              if ((PROPS[q] === 'outlineColor' || PROPS[q] === 'outlineWidth') && before[k][0] === 'none' && after[k][0] === 'none') continue
              diff.push(PROPS[q])
            }
            if (diff.length) changed.push(names[k] + '(' + diff.join(',') + ')')
          }
          const hasAD = await pg.evaluate((q) => !!document.querySelector(q)?.hasAttribute('aria-activedescendant'), sel)
          // **用編號配對,不用順序** —— 走訪會去重(seen),順序對不上就會把甲的承擔者
          // 安到乙頭上(2026-09-08 第一版就這樣把選單鈕的承擔者安給了 AppShell 的 input)。
          const row = rows.find((x) => x.flIdx === n)
          if (row) row.carrier = hasAD ? ['(虛擬游標,另由 H1f 驗)'] : changed
        }
        for (const r of rows) if (r.carrier === 'pending') r.carrier = []

        // 一站都沒走到:先問「畫面上有沒有 Tab 該走得到的東西」,不直接當成「沒有問題」
        if (!rows.length) {
          const tabbable = await pg.evaluate(countTabbable)
          if (tabbable > 0) {
            failures.push({ label, theme, storyId, reason: `Tab 走訪 45 次沒抵達任何元素,但畫面上有 ${tabbable} 個可聚焦元素 —— 儀器沒在量` })
            continue
          }
          if (theme === 'light') noStations.push(`${label}(${storyId})`)
        }
        stations[theme] += rows.length
        report[key] = report[key] || { story: storyId }
        report[key][theme] = rows
      } catch (e) {
        failures.push({ label, theme, storyId, reason: '量測途中出錯:' + oneLine(e?.message ?? e) })
      }
    }
  }
  await pg.close()
} catch (e) { report404(); await br.close(); await server.stop(); throw e }
// Linux runner 沒有 TMPDIR 這個環境變數(只有 macOS 一定有),
// 直接串接會寫到字面上的 `undefined/clipdetect.json` 而整支掛掉 ——
// 這支被接進 CI 的第一次執行就是這樣紅的(2026-09-08)。用 os.tmpdir() 才可攜。
writeFileSync(join(tmpdir(), 'clipdetect.json'), JSON.stringify({ report, failures, noStations, stations }, null, 1))

let noFrame=0, clipped=0, ok=0
const noCarrier=[]
console.log('══ 沒有畫框的(可能是 WCAG 違規,也可能指示器在別的元素上)══')
for (const [c,v] of Object.entries(report)) {
  for (const r of (v.light||[])) if (!r.drawn && !r.boxShadow) {
    const who = Array.isArray(r.carrier) ? r.carrier : []
    const okCarrier = who.length > 0
    if (!okCarrier) noCarrier.push(`${c} ${r.desc.slice(0,50)} ${r.size}`)
    console.log(`  ${c.padEnd(18)} ${r.desc.slice(0,46)} ${r.size}  承擔者:${okCarrier ? who.slice(0,2).join(' / ') : '✗ 聚焦前後鄰域零差異'}`)
    noFrame++
  }
}
console.log('\n══ 框會被裁 / 會撞到鄰居 → 應改內描邊 ══')
for (const [c,v] of Object.entries(report)) {
  for (const r of (v.light||[])) if (r.drawn && !r.insetSite && r.problems.length) {
    console.log(`  ${c.padEnd(18)} ${r.desc.slice(0,44).padEnd(44)} ${r.style.padEnd(20)} ${r.problems.map(p=>p.kind+'('+p.detail+')←'+p.by.slice(0,26)).join(' ')}`); clipped++ }
}
// 反向:宣告了內描邊,但用往外的幾何重算也不會被裁 / 不會撞鄰居 → 這一站不需要往內
//
// **例外註冊表**:canonical 的判準是「這個元件在**規格允許的所有位置**裡有沒有一種是貼邊的」,
// 而這支閘一個 story 只看得到一種位置。所以「在這個 story 裡放得下」不必然是錯 ——
// 但必須在這裡寫下**另一個位置的實測數字**,否則就是憑印象翻內(行內動作鈕就是這樣錯了兩個月)。
const JUSTIFIED_INSET = [
  { comp: 'Tabs', match: /^button\[tab\]/, why:
    'TabsList 的 overflow=scroll / menu 兩種模式下,tab 高 = 可捲視窗高 → 實測上 0 / 下 1 / 左 0(2026-09-10,' +
    'overflow-scroll 與 overflow-menu 兩個 story);預設模式下四周有餘(最小 13)但同一個元件只有一種畫法' },
]
console.log('\n══ 宣告內描邊、但往外也放得下 → 應改回外描邊(判準:淨空 ≥ 4px)══')
const insetUnjustified = []
for (const [c,v] of Object.entries(report)) {
  for (const r of (v.light||[])) if (r.insetSite && !r.problems.length) {
    const waiver = JUSTIFIED_INSET.find((w) => w.comp === c && w.match.test(r.desc))
    if (waiver) { console.log(`  ${c.padEnd(18)} ${r.desc.slice(0,46)} ${r.size}  ← 已登記:${waiver.why.slice(0,60)}…`); continue }
    insetUnjustified.push(`${c} ${r.desc.slice(0,46)} ${r.size}`)
    console.log(`  ${c.padEnd(18)} ${r.desc.slice(0,46)} ${r.size}`)
  }
}
console.log('\n══ 深色主題下有無殘留白間隙(box-shadow 通道)══')
for (const [c,v] of Object.entries(report)) {
  for (const r of (v.dark||[])) if (r.boxShadow) console.log(`  ${c.padEnd(18)} ${r.desc.slice(0,44)} boxShadow=${r.boxShadow}`)
}
for (const v of Object.values(report)) for (const r of (v.light||[])) if (r.drawn && !r.problems.length) ok++
console.log(`\n合計:正常外描邊 ${ok} / 需改內描邊 ${clipped} / 無框 ${noFrame}`)
await br.close(); await server.stop()
// ── 儀器判定優先:沒量到的不准被讀成通過(三種模式一律)────────────────────
// 「量到」= 兩個主題都真的載入並走訪完(有結果才算),不是「沒有失敗紀錄」—— 沒掃也不會有失敗紀錄
const measured = TARGETS.filter((t) => Array.isArray(report[t.key]?.light) && Array.isArray(report[t.key]?.dark)).length
console.log(`量測涵蓋:${measured}/${TARGETS.length} 則 story 兩個主題都載入並走訪完;焦點站 light ${stations.light} / dark ${stations.dark}`)
if (noStations.length) console.log(`  渲染成功但畫面上沒有任何可聚焦元素(本閘對它們無裁決,不是通過):${noStations.join('、')}`)
const instrumentProblems = selfCheck.problems.length
  ? [...selfCheck.problems.map((p) => `儀器自檢 ${p}`), `全部 ${TARGETS.length} 則 story 未量(自檢沒過就不掃)`]
  : instrumentVerdict({ planned: TARGETS.length, failures, stations })
if (instrumentProblems.length) {
  console.error(`\n✗ 儀器失效 —— 以下 ${instrumentProblems.length} 項本閘沒有量到該量的東西。這不是產品裁決(元件不一定有問題),`)
  console.error('  但「沒量到」不等於「沒問題」,所以這次不能算通過(上面的清單與合計只涵蓋量到的部分):')
  instrumentProblems.forEach((p) => console.error('  ' + p))
  report404()
  process.exit(1)
}
// 基準線:1 站 —— Combobox story 裡那顆與欄位相鄰的 <Button>。它是共用 primitive,
// 外描邊壓到鄰接控件外緣 2px 是各家(Material / Atlassian)都接受的,不是元件缺陷。
if (SELFTEST) {
  console.log(noCarrier.length
    ? `\n✓ selftest:把焦點視覺全部釘死時,${noCarrier.length} 處承擔者證明確實變紅`
    : '\n✗ selftest:焦點視覺都釘死了卻還說找得到承擔者 —— 這一段的綠燈不算證據')
  if (!noCarrier.length) report404()
  process.exit(noCarrier.length ? 0 : 1)
}
// 反向檢查的對照組:把每一站都釘成內描邊,四周有空的那些就該被指名(否則這段的綠燈不算證據)
if (SELFTEST_INSET) {
  console.log(insetUnjustified.length
    ? `\n✓ selftest-inset:把所有焦點框釘成內描邊時,${insetUnjustified.length} 處被指名「其實放得下」`
    : '\n✗ selftest-inset:全部釘成內描邊了卻一處都沒指名 —— 反向檢查沒有在跑')
  if (!insetUnjustified.length) report404()
  process.exit(insetUnjustified.length ? 0 : 1)
}
if (noCarrier.length) {
  console.error(`\n✗ ${noCarrier.length} 處沒有框、而且聚焦前後鄰域零差異 —— 宣告的承擔者其實沒在畫:`)
  noCarrier.forEach((n) => console.error('  ' + n))
  report404()
  process.exit(1)
}
const BASELINE = 1
if (clipped > BASELINE) { console.error(`\n✗ 有 ${clipped} 站的焦點框會被裁或撞到鄰居(基準線 ${BASELINE})`); report404(); process.exit(1) }
// 反向門檻:2026-09-10 起 0 —— 行內動作鈕 / DataTable 排序表頭 / Calendar 日期格改回外描邊、Tabs 登記例外之後,
// DS 內每一處 `focus-ring-inset` 都是真的貼邊(選單項 / 事件方塊 / Tag 移除鈕 / 捲動模式的 tab…)。
// 有新的一站被指名而且不在 JUSTIFIED_INSET,就是又有人憑印象翻內。
const BASELINE_INSET = 0
if (insetUnjustified.length > BASELINE_INSET) {
  console.error(`\n✗ 有 ${insetUnjustified.length} 站宣告內描邊、但四周其實放得下(基準線 ${BASELINE_INSET})——` +
    ' 依 focus-canonical「問題二」預設往外;真的貼邊請附實測數字')
  insetUnjustified.forEach((n) => console.error('  ' + n))
  report404()
  process.exit(1)
}
console.log('✓ 焦點框幾何全部正確(含「宣告內描邊是否必要」的反向驗證)')
