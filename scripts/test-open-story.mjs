#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的「story 真的渲染完成」唯一實作)只在 Storybook 回報這則 story 渲染完成(含 play)、畫面健康、被等的元素出現、版面靜止之後才回傳;任何一項等不到或不成立都丟 StoryRenderInstrumentError,訊息點名 story id、附 Storybook 錯誤原文與 404 路徑,並聲明不是產品裁決 —— 絕不回成功、絕不靜默略過
 *   紅: 不存在的 story id、被擋的 story 檔(伺服器 404 / 請求被中斷)、永遠渲染不完、play 還沒跑完、渲染完是空畫面、頁面例外、等的元素不出現、版面永遠不靜止 —— 任一題若被 openStory 判成成功(或錯誤種類 / 點名 / 404 清單不對)即 exit 1。把 helper 的副本逐項弄壞(拿掉 render phase 等待、拿掉錯誤頁判定、拿掉 404 清單、靜止判定不看 DOM 變動、改回固定睡眠、拿掉 render-health、忽略 waitFor)各自至少讓一題紅
 *   綠: 正常 story 必須成功;story 檔故意晚 3 秒才到(同一段固定睡 600ms 必然看不到)、play 1.5 秒後才把焦點移走、渲染完成後版面還要長 45 個影格,都必須等到並成功 —— 全部是本機造的合成 Storybook 頁(startA11yStaticServer 供檔 + page.route 攔截),判定只看訊號本身、與機器快慢無關;有 storybook-static 時另在真實建置上驗同樣三題(真實 story 成功、不存在的 id、被擋的 story 檔)
 *
 * 為什麼有這支(2026-09-25):四支閘各自長出一份「等 story 真的畫完」,收斂成 openStory 之後,
 * 原本散在各閘 selftest 裡驗「等待本身」的對照組(focus-geometry 的不存在 id / 刪 chunk、overflow 的晚到 +N /
 * 永遠渲染不完 / 永遠不靜止)跟著共用實作搬到這裡 —— 一份實作、一份對照組(M17)。
 *
 * Run: `node scripts/test-open-story.mjs [--static-dir <Storybook 建置>] [--require-storybook-build]`
 *   預設另驗 ./storybook-static(存在時);`--require-storybook-build`(CI 用)= 沒有建置就紅,不准只跑合成頁。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { gotoStory, launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ARGV = process.argv.slice(2)
const staticDirArg = ARGV.find((a) => a.startsWith('--static-dir='))?.slice('--static-dir='.length)
  ?? (ARGV.includes('--static-dir') ? ARGV[ARGV.indexOf('--static-dir') + 1] : null)
const STORYBOOK_BUILD = resolve(ROOT, staticDirArg ?? 'storybook-static')
const REQUIRE_BUILD = ARGV.includes('--require-storybook-build')

// ── 合成的 Storybook 預覽頁 ─────────────────────────────────────────────────
// 照 Storybook 8 的外觀造:`window.__STORYBOOK_PREVIEW__.currentRender = { id, phase }`、body class
// sb-show-preparing-story → sb-show-main / sb-show-errordisplay、#error-message / #error-stack。
// **load 事件之後**才以動態 import 載入 story 檔(真的 Storybook 也是),所以「load + 固定睡眠」必然早於 story 檔。
// 每則 story 是 assets/<id>.js:default(root) 渲染,可選 play(root);預覽在兩者都跑完後才標 finished。
const KNOWN = ['ok', 'late', 'blocked', 'hang', 'slow-play', 'empty', 'boom', 'restless', 'grow', 'chatty']
const PREVIEW_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>synthetic preview</title></head>
<body class="sb-show-preparing-story">
<div id="storybook-root"></div>
<div class="sb-errordisplay"><h1 id="error-message"></h1><code id="error-stack"></code></div>
<script type="module">
const KNOWN = ${JSON.stringify(KNOWN)}
const id = new URLSearchParams(location.search).get('id')
const preview = window.__STORYBOOK_PREVIEW__ = { currentRender: null }
const fail = (render, error) => {
  if (render) render.phase = 'errored'
  document.getElementById('error-message').textContent = error.message
  document.getElementById('error-stack').textContent = String(error.stack || '')
  document.body.className = 'sb-show-errordisplay'
}
window.addEventListener('load', async () => {
  if (!KNOWN.includes(id)) return fail(null, new Error("Couldn't find story matching '" + id + "'."))
  const render = preview.currentRender = { id, phase: 'loading' }
  let mod
  try { mod = await import('./assets/' + id + '.js') } catch (error) { return fail(render, error) }
  const root = document.getElementById('storybook-root')
  try {
    render.phase = 'rendering'
    await mod.default(root)
    render.phase = 'playing'
    if (mod.play) await mod.play(root)
  } catch (error) { return fail(render, error) }
  render.phase = 'finished'
  document.body.className = 'sb-show-main'
})
</script></body></html>`

const STORIES = {
  ok: `export default (root) => { root.innerHTML = '<button type="button">Save</button>' }`,
  late: `export default (root) => { root.innerHTML = '<p data-late>Quarterly report</p>' }`,
  // blocked:故意不寫檔 → 伺服器 404(模擬「刪掉 story 的 chunk」)
  hang: `export default (root) => { root.innerHTML = '<p>Loading invoices</p>'; return new Promise(() => {}) }`,
  'slow-play': `export default (root) => { root.innerHTML = '<button type="button">Keep</button><button type="button" data-delete>Delete file</button>' }
export const play = (root) => new Promise((resolve) => setTimeout(() => { root.querySelector('[data-delete]').focus(); resolve() }, 1500))`,
  empty: `export default () => {}`,
  boom: `export default (root) => new Promise((resolve) => {
  root.innerHTML = '<p>Sprint board</p>'
  setTimeout(() => { throw new Error('synthetic render exception') }, 0)
  setTimeout(resolve, 50)
})`,
  restless: `export default (root) => {
  root.innerHTML = '<p data-tick="0">Live cursor</p>'
  let n = 0
  const tick = () => { root.firstChild.setAttribute('data-tick', String(++n)); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
}`,
  // 渲染完成後仍不停動態載入 script(每 30ms 一個)—— 換頁時這些請求還在路上,會被導覽中斷
  chatty: `export default (root) => {
  root.innerHTML = '<p>Activity feed</p>'
  let n = 0
  setInterval(() => { import('./ok.js?n=' + (++n)).catch(() => {}) }, 30)
}`,
  // 渲染完成後再經 45 個影格「量寬 → 改樣式」才長出「+3」(overflow-indicator 真實發生過的形狀)
  grow: `export default (root) => {
  root.innerHTML = '<div style="display:flex;width:200px;overflow:hidden"><span>Alice</span><span>Bob</span><span data-plus></span></div>'
  let hops = 45
  const hop = () => requestAnimationFrame(() => {
    root.firstChild.style.maxWidth = (200 - hops) + 'px'
    if (--hops > 0) return hop()
    root.querySelector('[data-plus]').textContent = '+3'
  })
  hop()
}`,
}

const work = mkdtempSync(join(tmpdir(), 'open-story-meta-'))
const fixture = join(work, 'synthetic-preview')
mkdirSync(join(fixture, 'assets'), { recursive: true })
writeFileSync(join(fixture, 'iframe.html'), PREVIEW_HTML)
for (const [id, source] of Object.entries(STORIES)) writeFileSync(join(fixture, 'assets', `${id}.js`), source)

let failures = 0
const results = []
const check = (label, ok, detail = '') => {
  results.push({ label, ok })
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` —— ${detail}` : ''}`)
}
/** 跑一次 openStory:成功回 { ok:true, value },丟 StoryRenderInstrumentError 回 { ok:false, error };其他例外照丟(那是測試本身壞了)。 */
const attempt = async (page, url, options) => {
  try { return { ok: true, value: await openStory(page, url, options) } } catch (error) {
    if (error instanceof StoryRenderInstrumentError) return { ok: false, error }
    throw error
  }
}
const short = (text) => String(text).replace(/\s+/g, ' ').slice(0, 220)
const isInstrument = (r, kind) => !r.ok && r.error.kind === kind && r.error.message.includes('不是產品裁決')

const browser = await launchBrowser()
const server = await startA11yStaticServer({ rootDirectory: fixture, defaultFile: 'iframe.html', snapshot: false })
const url = (id) => `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`
try {
  const page = await browser.newPage()
  console.log('── 合成 Storybook 頁(本機造、與機器快慢無關)──')

  // 1. 正常 story → 成功,而且回傳時畫面就是渲染完成的樣子
  const ok = await attempt(page, url('ok'), { probe: () => document.querySelector('#storybook-root button')?.textContent ?? null, notFound: server.notFound })
  check('正常 story → 成功(phase = finished,probe 量到渲染結果)', ok.ok && ok.value.phase === 'finished' && ok.value.probe === 'Save',
    ok.ok ? `phase=${ok.value.phase} probe=${ok.value.probe}` : short(ok.error.message))

  // 2. 不存在的 story id → 儀器失效,點名該 id,附 Storybook 錯誤原文
  const missing = await attempt(page, url('no-such-story'), { notFound: server.notFound })
  check('不存在的 story id → 儀器失效並點名、附 Storybook 錯誤原文',
    isInstrument(missing, 'storybook-error') && missing.error.message.includes('「no-such-story」') && missing.error.storybookError.includes("Couldn't find story matching"),
    missing.ok ? '被判成成功(錯)' : short(missing.error.message))

  // 3. story 檔 404(伺服器沒有這個檔)→ 儀器失效,列出 404 路徑
  const blocked = await attempt(page, url('blocked'), { notFound: server.notFound })
  check('story 檔 404 → 儀器失效並列出 404 路徑',
    isInstrument(blocked, 'storybook-error') && blocked.error.message.includes('「blocked」') && blocked.error.failedRequests.some((f) => f.startsWith('404 ') && f.endsWith('/assets/blocked.js')),
    blocked.ok ? '被判成成功(錯)' : short(blocked.error.message))

  // 3b. story 檔的請求被中斷(page.route abort,伺服器根本沒看到)→ 同樣儀器失效,列出失敗的請求
  await page.route(/\/assets\/ok\.js(\?.*)?$/, (route) => route.abort())
  const aborted = await attempt(page, url('ok'), { notFound: server.notFound })
  await page.unroute(/\/assets\/ok\.js(\?.*)?$/)
  check('story 檔請求被中斷(page.route)→ 儀器失效並列出失敗請求',
    isInstrument(aborted, 'storybook-error') && aborted.error.failedRequests.some((f) => f.startsWith('/assets/ok.js')),
    aborted.ok ? '被判成成功(錯)' : short(aborted.error.message))

  // 4. story 檔晚 3 秒才到 → 必須等到並成功;同一段「load + 固定睡 600ms」必然看不到(證明延遲有效)
  let held = 0
  const lateRoute = /\/assets\/late\.js(\?.*)?$/
  await page.route(lateRoute, async (route) => { held++; await new Promise((r) => setTimeout(r, 3000)); await route.continue().catch(() => {}) })
  await page.goto(url('late'), { waitUntil: 'load' })
  await page.waitForTimeout(600)
  const bySleep = await page.evaluate(() => Boolean(document.querySelector('[data-late]')))
  const late = await attempt(page, url('late'), { waitFor: '[data-late]', notFound: server.notFound })
  await page.unroute(lateRoute)
  check('story 檔晚 3 秒到 → openStory 等到並成功;固定睡 600ms 的寫法看不到',
    held >= 2 && !bySleep && late.ok && late.value.phase === 'finished',
    `攔到 ${held} 次;固定睡眠看到=${bySleep};openStory=${late.ok ? `成功(${late.value.ms}ms)` : short(late.error.message)}`)

  // 5. 渲染永遠走不完 → 儀器失效(不是逾時後當成功),訊息說得出停在哪個 phase
  const hang = await attempt(page, url('hang'), { timeoutMs: 1500, notFound: server.notFound })
  check('渲染永遠走不完 → 儀器失效(render-timeout),指出停在哪個 phase',
    isInstrument(hang, 'render-timeout') && hang.error.message.includes('「hang」') && hang.error.reason.includes('hang / rendering'),
    hang.ok ? '被判成成功(錯)' : short(hang.error.message))

  // 6. play 1.5 秒後才把焦點移到刪除鈕(FileItem 真實形狀)→ 回傳當下焦點必須已在刪除鈕(根節點早就有內容,只等「有內容」會提早回)
  const slow = await attempt(page, url('slow-play'), { probe: () => document.activeElement?.hasAttribute('data-delete') ?? false, notFound: server.notFound })
  check('play 還在跑時不回傳 → 回傳當下 play 已完成(焦點已在刪除鈕)',
    slow.ok && slow.value.probe === true,
    slow.ok ? `probe(焦點在刪除鈕)=${slow.value.probe}` : short(slow.error.message))

  // 7. 渲染完成但畫面是空的 → 儀器失效(render-health),不是「沒有東西可量 = 通過」
  const empty = await attempt(page, url('empty'), { notFound: server.notFound })
  check('渲染完成但根節點是空的 → 儀器失效(render-health)',
    isInstrument(empty, 'render-health') && empty.error.reason.includes('empty story root'),
    empty.ok ? '被判成成功(錯)' : short(empty.error.message))

  // 8. 渲染期間拋出頁面例外 → 儀器失效
  const boom = await attempt(page, url('boom'), { notFound: server.notFound })
  check('渲染期間有頁面例外 → 儀器失效(render-health)',
    isInstrument(boom, 'render-health') && boom.error.reason.includes('synthetic render exception'),
    boom.ok ? '被判成成功(錯)' : short(boom.error.message))

  // 9. 等的元素永遠不出現 → 儀器失效(wait-for-timeout);gotoStory(薄包裝)照舊回 false / true
  const never = await attempt(page, url('ok'), { waitFor: '[data-never]', timeoutMs: 1000, notFound: server.notFound })
  const wrapperMissing = await gotoStory(page, url('ok'), { waitFor: '[data-never]', settle: 0, appearTimeout: 1000 })
  const wrapperPresent = await gotoStory(page, url('ok'), { waitFor: '#storybook-root button', settle: 0 })
  check('waitFor 等不到 → 儀器失效(wait-for-timeout);gotoStory 相容:等不到回 false、等得到回 true',
    isInstrument(never, 'wait-for-timeout') && wrapperMissing === false && wrapperPresent === true,
    `${never.ok ? 'openStory 被判成成功(錯)' : never.error.kind};gotoStory=${wrapperMissing}/${wrapperPresent}`)

  // 10. 版面永遠不靜止(每個影格都在改 DOM)→ 要求 settleFrames 時儀器失效;不要求時照常成功(兩面:紅的是靜止判定本身)
  const restless = await attempt(page, url('restless'), { settleFrames: 10, settleTimeoutMs: 1500, notFound: server.notFound })
  const restlessNoSettle = await attempt(page, url('restless'), { notFound: server.notFound })
  check('每個影格都在改 DOM → settleFrames 時儀器失效(dom-not-settled);不要求靜止時照常成功',
    isInstrument(restless, 'dom-not-settled') && restlessNoSettle.ok,
    `${restless.ok ? 'settleFrames 被判成成功(錯)' : short(restless.error.reason)};不要求靜止=${restlessNoSettle.ok ? '成功' : restlessNoSettle.error.kind}`)

  // 11. 渲染完成後版面還要長 45 個影格才出現「+3」→ settleFrames 必須等到(且看得到它等過:lateChanges > 0)
  const countPlus = () => [...document.querySelectorAll('#storybook-root *')].filter((e) => !e.children.length && /^\+\s*\d+$/.test((e.textContent || '').trim())).length
  const grown = await attempt(page, url('grow'), { settleFrames: 10, probe: countPlus, notFound: server.notFound })
  const phaseOnly = await attempt(page, url('grow'), { probe: countPlus, notFound: server.notFound })
  check('渲染完成後還在長的版面 → settleFrames 等到長完才量(抓到「+3」,且記到完成後的變動)',
    grown.ok && grown.value.probe === 1 && grown.value.settle.lateChanges > 0,
    `${grown.ok ? `抓到 ${grown.value.probe} 個,完成後變動 ${grown.value.settle.lateChanges} 次、等了 ${grown.value.settle.framesWaited} 格` : short(grown.error.message)};`
    + `只等渲染完成抓到 ${phaseOnly.ok ? phaseOnly.value.probe : phaseOnly.error.kind} 個(僅供對照)`)

  // 12. 上一則 story 在換頁途中還在發 script 請求(被導覽中斷 → net::ERR_ABORTED)→ 不得算成下一則的關鍵資源失敗
  //     (field-view 對照組 B 在真實建置上踩到:舊文件在「監聽掛上 → 新文件 commit」之間發的請求被記到新的一則頭上)。
  //     確定性:舊文件的請求一律卡住不回(page.route 不放行),新文件的導覽請求延後 500ms 才放行 —— 這 500ms 裡舊文件必然還在發請求。
  const heldImports = /\/assets\/ok\.js\?n=\d+$/
  let chattyHeld = 0
  await page.route(heldImports, () => { chattyHeld++ })
  const chatty = await attempt(page, url('chatty'), { notFound: server.notFound })
  const navHold = /iframe\.html\?id=ok&viewMode=story&after=chatty$/
  await page.route(navHold, async (route) => { await new Promise((r) => setTimeout(r, 500)); await route.continue().catch(() => {}) })
  const heldBefore = chattyHeld
  const afterChatty = await attempt(page, `${url('ok')}&after=chatty`, { notFound: server.notFound })
  await page.unroute(navHold)
  await page.unroute(heldImports)
  check('上一則 story 換頁途中還在發 script 請求 → 被中斷的請求不算到下一則頭上',
    chatty.ok && chattyHeld - heldBefore > 0 && afterChatty.ok,
    `換頁期間舊文件發出 ${chattyHeld - heldBefore} 個請求;下一則=${afterChatty.ok ? '成功' : short(afterChatty.error.message)}`)

  // ── 真實 Storybook 建置:openStory 依賴的訊號(currentRender.phase / sb-show-errordisplay / #error-message)真的存在 ──
  const hasBuild = existsSync(join(STORYBOOK_BUILD, 'index.json')) && existsSync(join(STORYBOOK_BUILD, 'iframe.html'))
  console.log(`\n── 真實 Storybook 建置(${STORYBOOK_BUILD})──`)
  if (!hasBuild) {
    const message = `沒有 Storybook 建置(${STORYBOOK_BUILD}/index.json)—— 真實建置那三題這次沒跑`
    if (REQUIRE_BUILD) check('真實建置存在(--require-storybook-build)', false, `${message};這是儀器失效,不是通過`)
    else console.log(`  · ${message}(合成頁仍已全驗;CI 以 --require-storybook-build 強制)`)
  } else {
    const real = await startA11yStaticServer({ rootDirectory: STORYBOOK_BUILD, defaultFile: 'iframe.html' })
    try {
      const index = JSON.parse(readFileSync(join(real.snapshot?.dir ?? STORYBOOK_BUILD, 'index.json'), 'utf8'))
      const stories = Object.values(index.entries).filter((e) => e.type === 'story' && e.importPath)
      const entry = index.entries['design-system-components-button-展示--default'] ?? stories.find((e) => /\/components\//.test(e.importPath))
      if (!entry) {
        check('真實建置裡找得到可用的 story', false, 'index.json 裡沒有任何元件 story')
      } else {
        const realUrl = (id) => `${real.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`
        const good = await attempt(page, realUrl(entry.id), { notFound: real.notFound })
        check(`真實 story ${entry.id} → 成功`, good.ok && good.value.phase === 'finished',
          good.ok ? `phase=${good.value.phase}(${good.value.ms}ms)` : short(good.error.message))
        const missingId = 'open-story-meta--story-that-does-not-exist'
        const realMissing = await attempt(page, realUrl(missingId), { notFound: real.notFound })
        check('真實建置:不存在的 story id → 儀器失效並點名、附 Storybook 錯誤原文',
          isInstrument(realMissing, 'storybook-error') && realMissing.error.message.includes(`「${missingId}」`) && realMissing.error.storybookError.includes(missingId),
          realMissing.ok ? '被判成成功(錯)' : short(realMissing.error.message))
        // Vite 的 chunk 檔名 = 模組檔名(去副檔名)+ '-' + 雜湊 + '.js'
        const base = basename(entry.importPath).replace(/\.[cm]?[jt]sx?$|\.mdx$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const chunk = new RegExp(`/assets/${base}-[A-Za-z0-9_-]+\\.js(\\?.*)?$`)
        let hits = 0
        await page.route(chunk, (route) => { hits++; return route.abort() })
        const realBlocked = await attempt(page, realUrl(entry.id), { notFound: real.notFound })
        await page.unroute(chunk)
        check('真實建置:story 檔被擋 → 儀器失效並列出失敗請求',
          hits > 0 && isInstrument(realBlocked, 'storybook-error') && realBlocked.error.failedRequests.some((f) => new RegExp(`/assets/${base}-`).test(f)),
          `攔到 ${hits} 次;${realBlocked.ok ? '被判成成功(錯)' : short(realBlocked.error.message)}`)
      }
    } finally { await real.stop() }
  }
} finally {
  await browser.close()
  await server.stop()
  rmSync(work, { recursive: true, force: true })
}

console.log(`\n${failures ? '✗' : '✓'} openStory 對照組 ${results.length - failures}/${results.length} 成立${failures ? ' —— openStory 的判定此刻不可信,依賴它的閘綠燈不算證據' : ''}`)
process.exit(failures ? 1 : 0)
