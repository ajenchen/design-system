#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的「story 真的渲染完成」唯一實作)只在 Storybook 回報這則 story 渲染完成(含 play)、畫面健康、被等的元素出現、版面靜止之後才回傳;任何一項等不到或不成立都丟 StoryRenderInstrumentError,訊息點名 story id、附 Storybook 錯誤原文與 404 路徑,並聲明不是產品裁決 —— 絕不回成功、絕不靜默略過
 *   紅: 不存在的 story id、被擋的 story 檔(伺服器 404 / 請求被中斷)、永遠渲染不完、play 還沒跑完、渲染完是空畫面、頁面例外、等的元素不出現、版面永遠不靜止、卡在 afterEach 卻沒允許、允許 afterEach 時卡在 rendering、管理介面 iframe 裡是錯誤頁 / 404 / 找不到 iframe、iframe 裡完成的是別的 story —— 任一題若被 openStory / waitForStoryRender 判成成功(或錯誤種類 / 點名 / 404 清單不對)即 exit 1;寫錯選項(finishedPhases 給 play 之前的 phase、沒有 story id)必須丟 TypeError。把 helper 的副本逐項弄壞(拿掉 render phase 等待、拿掉錯誤頁判定、拿掉 404 清單、靜止判定不看 DOM 變動、改回固定睡眠、拿掉 render-health、忽略 waitFor、忽略 finishedPhases、previewFrame 不換量測對象、previewFrame 的靜止判定不看外層管理介面、不比對 story id)各自至少讓一題紅
 *   綠: 正常 story 必須成功;story 檔故意晚 3 秒才到(同一段固定睡 600ms 必然看不到)、play 1.5 秒後才把焦點移走、渲染完成後版面還要長 45 個影格、允許 afterEach 時卡在 afterEach 的 story、管理介面 iframe 裡的 story、preview 靜止但管理介面還要重畫 45 個影格、preview 等待途中自己重新載入一次,都必須等到並成功 —— 全部是本機造的合成 Storybook 頁(startA11yStaticServer 供檔 + page.route 攔截),判定只看訊號本身、與機器快慢無關;有 storybook-static 時另在真實建置上驗同樣三題(真實 story 成功、不存在的 id、被擋的 story 檔)
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
import { launchBrowser, openStory, settleAfterInteraction, StoryRenderInstrumentError, waitForDocsRender, waitForStoryRender } from './lib/launch-browser.mjs'

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
// 每則 story 是 assets/<id>.js:default(root) 渲染,可選 play(root)、afterEach(root)。phase 照 Storybook 8.6 的順序走
// loading → rendering → playing → played → completed → afterEach → finished(@storybook/core preview-api StoryRender.render),
// 而且跟真的一樣,畫出來就是 sb-show-main(renderToCanvas 呼叫 showMain),不等 finished。
const KNOWN = ['ok', 'late', 'blocked', 'hang', 'slow-play', 'empty', 'boom', 'restless', 'grow', 'chatty', 'stuck-after-each', 'reload-once']
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
    document.body.className = 'sb-show-main'
    render.phase = 'playing'
    if (mod.play) { await mod.play(root); render.phase = 'played' }
    render.phase = 'completed'
    render.phase = 'afterEach'
    if (mod.afterEach) await mod.afterEach(root)
  } catch (error) { return fail(render, error) }
  render.phase = 'finished'
})
</script></body></html>`

// 合成的管理介面(index.html 的外觀):側欄 + #storybook-preview-iframe,iframe 開 path=/story/<id> 那一則
const MANAGER_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>synthetic manager</title></head>
<body><nav id="sidebar"><p>Sidebar</p></nav>
<iframe id="storybook-preview-iframe" title="preview" style="width:800px;height:600px;border:0"></iframe>
<script>
const path = new URLSearchParams(location.search).get('path') || ''
const match = path.match(/^\\/story\\/(.+)$/)
const frameEl = document.getElementById('storybook-preview-iframe')
frameEl.src = 'iframe.html?id=' + encodeURIComponent(match ? match[1] : '') + '&viewMode=story'
// busy=1:preview 回報 finished 之後,管理介面自己還要再重畫 45 個影格(外掛面板收到結果後更新的形狀)才標 data-manager-ready
if (new URLSearchParams(location.search).get('busy') === '1') {
  const poll = () => {
    if (frameEl.contentWindow?.__STORYBOOK_PREVIEW__?.currentRender?.phase !== 'finished') return requestAnimationFrame(poll)
    let hops = 45
    const hop = () => requestAnimationFrame(() => {
      document.getElementById('sidebar').style.width = (200 + hops) + 'px'
      if (--hops > 0) return hop()
      document.body.setAttribute('data-manager-ready', '')
    })
    hop()
  }
  requestAnimationFrame(poll)
}
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
  // afterEach 永遠不結束(假時鐘暫停下 a11y addon 的 afterEach 就是這樣:靠計時器推進)
  'stuck-after-each': `export default (root) => { root.innerHTML = '<p data-stuck>Audit log</p>' }
export const afterEach = () => new Promise(() => {})`,
  // 第一次載入時 preview 自己重新載入一次(管理介面離開渲染完整的 docs 頁時 Storybook 會這樣做),第二次才畫完
  'reload-once': `export default (root) => {
  if (!sessionStorage.getItem('open-story-reload-once')) {
    sessionStorage.setItem('open-story-reload-once', '1')
    root.innerHTML = '<p>Reconnecting</p>'
    return new Promise(() => setTimeout(() => location.reload(), 300))
  }
  root.innerHTML = '<p data-reloaded>Inbox synced</p>'
}`,
}

const work = mkdtempSync(join(tmpdir(), 'open-story-meta-'))
const fixture = join(work, 'synthetic-preview')
mkdirSync(join(fixture, 'assets'), { recursive: true })
writeFileSync(join(fixture, 'iframe.html'), PREVIEW_HTML)
writeFileSync(join(fixture, 'manager.html'), MANAGER_HTML)
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
/** 同 attempt,給 waitForStoryRender(不導覽,只等 target 裡這一則渲染完成) */
const attemptWait = async (target, options) => {
  try { return { ok: true, value: await waitForStoryRender(target, options) } } catch (error) {
    if (error instanceof StoryRenderInstrumentError) return { ok: false, error }
    throw error
  }
}
/** 呼叫端寫錯選項必須當場丟 TypeError(程式錯誤),不得被當成儀器失效、也不得默默退回預設 */
const throwsTypeError = async (fn) => { try { await fn(); return false } catch (error) { return error instanceof TypeError } }
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

  // 9. 等的元素永遠不出現 → 儀器失效(wait-for-timeout);等得到時照常成功(兩面)
  //    (2026-09-25:gotoStory 薄包裝已退役,原本這一題順帶驗它的相容回傳值,改驗 openStory 自己的兩面)
  const never = await attempt(page, url('ok'), { waitFor: '[data-never]', timeoutMs: 1000, notFound: server.notFound })
  const present = await attempt(page, url('ok'), { waitFor: '#storybook-root button', timeoutMs: 5000, notFound: server.notFound })
  check('waitFor 等不到 → 儀器失效(wait-for-timeout);等得到 → 成功',
    isInstrument(never, 'wait-for-timeout') && present.ok,
    `${never.ok ? 'openStory 被判成成功(錯)' : never.error.kind};等得到=${present.ok ? '成功' : present.error.kind}`)

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

  // 13. finishedPhases(給「afterEach 靠計時器推進、假時鐘暫停下走不到 finished」的閘,例 menu-message-row):
  //     預設只認 finished → 卡在 afterEach 必須儀器失效;允許 afterEach 才成功並回報停在 afterEach。
  //     允許 afterEach 也**不得提早接受 play 之前的 phase**:卡在 rendering 照樣儀器失效、play 1.5 秒照樣等完;
  //     寫成更早的 phase(或空陣列)→ 呼叫當下 TypeError(程式錯誤,不是儀器失效)。
  const lateFocus = () => document.activeElement?.hasAttribute('data-delete') ?? false
  const stuckDefault = await attempt(page, url('stuck-after-each'), { timeoutMs: 1500, notFound: server.notFound })
  const stuckAllowed = await attempt(page, url('stuck-after-each'), { finishedPhases: ['afterEach', 'finished'], notFound: server.notFound })
  const hangAllowed = await attempt(page, url('hang'), { finishedPhases: ['afterEach', 'finished'], timeoutMs: 1500, notFound: server.notFound })
  const slowAllowed = await attempt(page, url('slow-play'), { finishedPhases: ['afterEach', 'finished'], probe: lateFocus, notFound: server.notFound })
  const earlyPhase = await throwsTypeError(() => openStory(page, url('ok'), { finishedPhases: ['playing'] }))
  const noPhase = await throwsTypeError(() => openStory(page, url('ok'), { finishedPhases: [] }))
  check('finishedPhases:卡在 afterEach → 預設儀器失效、允許 afterEach 才成功;允許了也不提早接受 play 之前的 phase;寫成更早的 phase → TypeError',
    isInstrument(stuckDefault, 'render-timeout') && stuckDefault.error.reason.includes('stuck-after-each / afterEach')
      && stuckAllowed.ok && stuckAllowed.value.phase === 'afterEach'
      && isInstrument(hangAllowed, 'render-timeout') && hangAllowed.error.reason.includes('hang / rendering')
      && slowAllowed.ok && slowAllowed.value.probe === true
      && earlyPhase && noPhase,
    `預設=${stuckDefault.ok ? '成功(錯)' : stuckDefault.error.kind};允許 afterEach=${stuckAllowed.ok ? stuckAllowed.value.phase : short(stuckAllowed.error.message)};`
    + `卡在 rendering=${hangAllowed.ok ? '成功(錯)' : hangAllowed.error.kind};play 未完=${slowAllowed.ok ? `焦點已移 ${slowAllowed.value.probe}` : slowAllowed.error.kind};['playing'] / [] 丟 TypeError=${earlyPhase}/${noPhase}`)

  // 14. previewFrame(管理介面):導覽 manager.html,3–9 步在 #storybook-preview-iframe 的內容框架裡做
  const mgr = (id) => `${server.origin}/manager.html?path=${encodeURIComponent(`/story/${id}`)}`
  const PREVIEW = '#storybook-preview-iframe'
  const framed = await attempt(page, mgr('ok'), {
    previewFrame: PREVIEW, waitFor: '#storybook-root button', settleFrames: 5,
    probe: () => document.querySelector('#storybook-root button')?.textContent ?? null, notFound: server.notFound,
  })
  check('previewFrame:管理介面裡的 story → 在 preview iframe 裡等到渲染完成,waitFor / 靜止 / probe 都在 iframe 裡做,回傳的 frame 就是那個 iframe',
    framed.ok && framed.value.phase === 'finished' && framed.value.storyId === 'ok' && framed.value.probe === 'Save'
      && framed.value.frame !== page.mainFrame() && framed.value.frame.parentFrame() === page.mainFrame(),
    framed.ok ? `phase=${framed.value.phase} storyId=${framed.value.storyId} probe=${framed.value.probe}` : short(framed.error.message))
  // 14b. preview 已 finished 且自己靜止,但**管理介面**還要重畫 45 個影格 → 靜止判定必須連外層一起等(probe 看得到外層的 data-manager-ready,且記到變動)
  const managerReady = () => window.parent.document.body.hasAttribute('data-manager-ready')
  const busyManager = await attempt(page, `${mgr('ok')}&busy=1`, { previewFrame: PREVIEW, settleFrames: 10, probe: managerReady, notFound: server.notFound })
  check('previewFrame:preview 靜止但管理介面還在重畫 → 靜止判定等到兩份文件都停(抓到 data-manager-ready,且記到外層的變動)',
    busyManager.ok && busyManager.value.probe === true && busyManager.value.settle.lateChanges > 0,
    busyManager.ok ? `外層就緒=${busyManager.value.probe},等待期間變動 ${busyManager.value.settle.lateChanges} 次、等了 ${busyManager.value.settle.framesWaited} 格` : short(busyManager.error.message))

  // 15. previewFrame 的失敗面:iframe 裡是錯誤頁 → storybook-error(逾時給 60 秒:kind 是錯誤頁而不是 render-timeout / wait-for-timeout,
  //     就證明它沒有等到逾時 —— 與機器快慢無關);story 檔 404 → 列出 404;iframe 本身不存在 → preview-frame;不知道等哪一則 → TypeError
  const framedMissing = await attempt(page, mgr('no-such-story'), { previewFrame: PREVIEW, waitFor: '#storybook-root button', timeoutMs: 60_000, notFound: server.notFound })
  const framedBlocked = await attempt(page, mgr('blocked'), { previewFrame: PREVIEW, timeoutMs: 60_000, notFound: server.notFound })
  const noFrame = await attempt(page, url('ok'), { previewFrame: '#no-such-iframe', timeoutMs: 1000, notFound: server.notFound })
  const noStoryId = await throwsTypeError(() => openStory(page, `${server.origin}/manager.html`, { previewFrame: PREVIEW }))
  check('previewFrame:錯誤頁不等到逾時(storybook-error)、404 列出路徑、找不到 iframe → preview-frame、不知道等哪一則 → TypeError',
    isInstrument(framedMissing, 'storybook-error') && framedMissing.error.storybookError.includes("Couldn't find story matching 'no-such-story'")
      && isInstrument(framedBlocked, 'storybook-error') && framedBlocked.error.failedRequests.some((f) => f.startsWith('404 ') && f.endsWith('/assets/blocked.js'))
      && isInstrument(noFrame, 'preview-frame') && noStoryId,
    `不存在的 id=${framedMissing.ok ? '成功(錯)' : framedMissing.error.kind};404=${framedBlocked.ok ? '成功(錯)' : framedBlocked.error.failedRequests.join(',') || framedBlocked.error.kind};`
    + `沒有 iframe=${noFrame.ok ? '成功(錯)' : noFrame.error.kind};沒有 story id 丟 TypeError=${noStoryId}`)

  // 16. waitForStoryRender:**不是導覽觸發的**切換(管理介面點側欄;storybook-docs-race 用)—— 與 openStory 第 3 步同一份判定
  //   a. preview 在等待中自己重新載入一次(離開渲染完整的 docs 頁時 Storybook 會這樣做)→ 仍在新的執行環境裡等到
  //   b. iframe 裡渲染完成的是**別的** story → 儀器失效並說出最後看到哪一則(「有某一則渲染完成」≠「這一則」)
  //   c. 切到 404 的 story 檔 / 不存在的 id → storybook-error,404 取自伺服器帳本(切換前記下的長度起算)
  //   d. 沒給 storyId / target 不是 Page 或 Frame → TypeError
  const base = await attempt(page, mgr('ok'), { previewFrame: PREVIEW, notFound: server.notFound })
  if (!base.ok) {
    check('waitForStoryRender 的前置:管理介面開得起來', false, short(base.error.message))
  } else {
    const frame = base.value.frame
    const switchTo = (id) => frame.evaluate((target) => { location.href = target }, `iframe.html?id=${encodeURIComponent(id)}&viewMode=story`).catch(() => {})
    let frameNavigations = 0
    const countNavigations = (f) => { if (f === frame) frameNavigations++ }
    page.on('framenavigated', countNavigations)
    await switchTo('reload-once')
    const reloaded = await attemptWait(frame, { storyId: 'reload-once', notFound: server.notFound })
    page.off('framenavigated', countNavigations)
    const reloadedShown = await frame.evaluate(() => Boolean(document.querySelector('[data-reloaded]'))).catch(() => false)
    const wrong = await attemptWait(frame, { storyId: 'grow', timeoutMs: 1000, notFound: server.notFound })
    const ledger = server.notFound.length
    await switchTo('blocked')
    const blockedWait = await attemptWait(frame, { storyId: 'blocked', notFound: server.notFound, notFoundFrom: ledger })
    await switchTo('no-such-story')
    const missingWait = await attemptWait(frame, { storyId: 'no-such-story', notFound: server.notFound })
    const noId = await throwsTypeError(() => waitForStoryRender(frame, {}))
    const noTarget = await throwsTypeError(() => waitForStoryRender(null, { storyId: 'ok' }))
    check('waitForStoryRender:preview 途中重新載入仍等到、別的 story 完成不算、404 / 不存在的 id → storybook-error、寫錯參數 → TypeError',
      reloaded.ok && reloaded.value.phase === 'finished' && frameNavigations >= 2 && reloadedShown
        && isInstrument(wrong, 'render-timeout') && wrong.error.message.includes('「grow」') && wrong.error.reason.includes('reload-once / finished')
        && isInstrument(blockedWait, 'storybook-error') && blockedWait.error.failedRequests.includes('404 /assets/blocked.js')
        && isInstrument(missingWait, 'storybook-error') && missingWait.error.storybookError.includes("Couldn't find story matching 'no-such-story'")
        && noId && noTarget,
      `重新載入=${reloaded.ok ? `成功(frame 導覽 ${frameNavigations} 次,畫面${reloadedShown ? '是' : '不是'}第二次載入)` : short(reloaded.error.message)};`
      + `別的 story=${wrong.ok ? '成功(錯)' : wrong.error.kind};404=${blockedWait.ok ? '成功(錯)' : blockedWait.error.failedRequests.join(',') || blockedWait.error.kind};`
      + `不存在的 id=${missingWait.ok ? '成功(錯)' : missingWait.error.kind};TypeError=${noId}/${noTarget}`)
  }

  // ── settleAfterInteraction:互動之後等靜止(2026-09-25,待辦總帳 C5)──────────────────────────────
  // 取代「點開浮層後固定睡 N 毫秒」。兩面都要成立才算這支 helper 有用(M32:對照組要打在真的判準上):
  //   (a) 點了之後浮層要**好幾個影格**才出現(每格都在改 DOM,模擬慢機器上一格一格推進的更新):固定睡 260ms 看不到浮層
  //       —— 這正是 overlay-footer-gutter / dialog-height 把「還沒開」讀成「不適用」的形狀;helper 等得到。
  //   (b) 浮層出現後跑 400ms 開啟過渡:固定睡 260ms 量到過渡中途的值;helper 等到過渡跑完。
  //   (c) 點了什麼都沒發生:helper 很快回來、ok,頁面上沒有浮層(「這一下沒開出東西」是可靠結論)。
  //   (d) 版面永遠不靜止:helper 回 ok:false(呼叫端當儀器失效),不得回 ok。
  //   (e) 寫錯參數 → TypeError。
  {
    // 沿用同一個分頁(--single-process 下不開第二個 context / 分頁,見 lib/launch-browser.mjs);setContent 不走網路
    const interactionPage = page
    const INTERACTION_HTML = `<!doctype html><html><head><style>
      #ov { transition: opacity 400ms linear; opacity: 0 } #ov.on { opacity: 1 }
    </style></head><body>
      <button id="late">慢慢開</button><button id="fade">淡入</button><button id="noop">沒反應</button><button id="busy">一直變</button>
      <div id="progress"></div>
      <script>
      // IIFE:setContent 以 document.write 換內容、全域物件沿用,頂層 const 第二次宣告會讓整段腳本拋錯(按鈕全沒反應)
      (() => {
        const mount = () => { const d = document.createElement('div'); d.id = 'ov'; d.textContent = 'overlay'; document.body.appendChild(d); requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('on'))) }
        document.getElementById('late').onclick = () => { let n = 0; const step = () => { document.getElementById('progress').textContent = String(++n); if (n < 45) requestAnimationFrame(step); else mount() }; requestAnimationFrame(step) }
        document.getElementById('fade').onclick = mount
        document.getElementById('busy').onclick = () => { const tick = () => { document.body.dataset.t = String(performance.now()); requestAnimationFrame(tick) }; tick() }
      })()
      </script></body></html>`
    const reset = () => interactionPage.setContent(INTERACTION_HTML)
    const overlayState = () => interactionPage.evaluate(() => { const d = document.getElementById('ov'); return d ? Number(getComputedStyle(d).opacity) : null })
    // (a)
    await reset(); await interactionPage.click('#late'); await interactionPage.waitForTimeout(260)
    const lateBySleep = await overlayState()
    await reset(); await interactionPage.click('#late')
    const lateSettle = await settleAfterInteraction(interactionPage, { frames: 10, capMs: 10_000 })
    const lateByHelper = await overlayState()
    // (b)
    await reset(); await interactionPage.click('#fade'); await interactionPage.waitForTimeout(260)
    const fadeBySleep = await overlayState()
    await reset(); await interactionPage.click('#fade')
    const fadeSettle = await settleAfterInteraction(interactionPage, { frames: 10, capMs: 10_000 })
    const fadeByHelper = await overlayState()
    // (c)
    await reset(); await interactionPage.click('#noop')
    const noopSettle = await settleAfterInteraction(interactionPage, { frames: 10, capMs: 10_000 })
    const noopState = await overlayState()
    // (d)
    await reset(); await interactionPage.click('#busy')
    const busySettle = await settleAfterInteraction(interactionPage, { frames: 10, capMs: 1500 })
    // (e)
    const badTarget = await throwsTypeError(() => settleAfterInteraction(null))
    const badFrames = await throwsTypeError(() => settleAfterInteraction(interactionPage, { frames: 0 }))
    await interactionPage.goto('about:blank') // 收掉「一直變」的 rAF 迴圈,不留給後面的題目
    check('settleAfterInteraction:慢慢開的浮層固定睡 260ms 看不到、helper 等得到;淡入過渡固定睡量到中途、helper 等到跑完;沒反應 → ok 且沒有浮層;永遠在變 → ok:false;寫錯參數 → TypeError',
      lateBySleep === null && lateSettle.ok && lateByHelper === 1
        && fadeBySleep !== null && fadeBySleep < 1 && fadeSettle.ok && fadeByHelper === 1
        && noopSettle.ok && noopState === null
        && busySettle.ok === false
        && badTarget && badFrames,
      `慢慢開:睡=${lateBySleep} helper=${lateByHelper}(${lateSettle.ok ? `ok,等 ${lateSettle.framesWaited} 格` : 'ok:false'});`
      + `淡入:睡=${fadeBySleep} helper=${fadeByHelper};沒反應:${noopSettle.ok ? 'ok' : 'ok:false'} 浮層=${noopState};`
      + `一直變:${busySettle.ok ? 'ok(錯)' : 'ok:false'};TypeError=${badTarget}/${badFrames}`)
  }

  // ── waitForDocsRender:docs 頁真的渲染出來(2026-09-25,待辦總帳 C5;取代兩份私有判定)──────────────────
  // 合成頁照 Storybook 8.6 的 docs 外觀造:currentRender = { type: 'docs', id, isPreparing() },#storybook-docs 之後才有內容。
  //   (a) 600ms 後才有內容 → 等得到、回傳那一則的 id;(b) 容器被藏起來(殭屍 docs)有內容也不算 → 逾時;
  //   (c) 錯誤頁 → storybook-error;(d) currentRender 是別一則 docs → 逾時;(e) 寫錯參數 → TypeError。
  {
    const docsPage = page
    const DOCS_HTML = (mode) => `<!doctype html><html><body class="sb-show-preparing-docs"><div id="storybook-docs"${mode === 'hidden' ? ' hidden' : ''}></div>
      <div class="sb-errordisplay"><h1 id="error-message"></h1></div>
      <script>(() => {
        const mode = ${JSON.stringify(mode)}
        let preparing = true
        window.__STORYBOOK_PREVIEW__ = { currentRender: { type: 'docs', id: mode === 'other' ? 'other--docs' : 'button--docs', isPreparing: () => preparing } }
        setTimeout(() => {
          preparing = false
          if (mode === 'error') { document.getElementById('error-message').textContent = 'synthetic docs failure'; document.body.className = 'sb-show-errordisplay'; return }
          document.body.className = 'sb-show-main'
          document.getElementById('storybook-docs').innerHTML = '<div class="sbdocs">Button docs</div>'
        }, 600)
      })()</script></body></html>`
    const attemptDocs = async (mode, options) => {
      // 先換到新的空白文件:setContent 沿用同一個 window,上一段「一直變」留下的 rAF 迴圈會繼續改 DOM(新文件的 body)
      await docsPage.goto('about:blank')
      await docsPage.setContent(DOCS_HTML(mode))
      try { return { ok: true, value: await waitForDocsRender(docsPage, options) } } catch (error) {
        if (error instanceof StoryRenderInstrumentError) return { ok: false, error }
        throw error
      }
    }
    const rendered = await attemptDocs('ok', { docsId: 'button--docs', timeoutMs: 5000, settleFrames: 5 })
    const zombie = await attemptDocs('hidden', { docsId: 'button--docs', timeoutMs: 1500 })
    const errored = await attemptDocs('error', { docsId: 'button--docs', timeoutMs: 5000 })
    const other = await attemptDocs('other', { docsId: 'button--docs', timeoutMs: 1500 })
    const badTarget = await throwsTypeError(() => waitForDocsRender(null))
    check('waitForDocsRender:晚到的 docs 等得到且點名那一則;藏起來的殭屍 docs 不算;錯誤頁 → storybook-error;別一則 docs 不算;寫錯參數 → TypeError',
      rendered.ok && rendered.value.docsId === 'button--docs'
        && isInstrument(zombie, 'render-timeout') && zombie.error.reason.includes('hidden')
        && isInstrument(errored, 'storybook-error') && errored.error.storybookError.includes('synthetic docs failure')
        && isInstrument(other, 'render-timeout') && other.error.reason.includes('other--docs')
        && badTarget,
      `晚到=${rendered.ok ? `成功(${rendered.value.docsId},${rendered.value.ms}ms)` : short(rendered.error.message)};`
      + `殭屍=${zombie.ok ? '成功(錯)' : zombie.error.kind};錯誤頁=${errored.ok ? '成功(錯)' : errored.error.kind};`
      + `別一則=${other.ok ? '成功(錯)' : other.error.kind};TypeError=${badTarget}`)
  }

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
