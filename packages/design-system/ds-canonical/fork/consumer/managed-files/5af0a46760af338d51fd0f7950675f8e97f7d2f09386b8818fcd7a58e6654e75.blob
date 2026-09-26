// ═══════════════════════════════════════════════════════════════════════════
// Playwright 啟動參數的單一來源
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼有這個檔**(2026-09-07):
// 全 repo 有 20 支以上的腳本各自寫 `chromium.launch({ headless: true })`,
// 而本 repo 的沙箱**少了 `--single-process --no-sandbox` 就起不了 Chromium**。
// 結果是:有 SKIPPED-ENV 守衛的腳本一路回 exit 0(看起來綠的,其實一條都沒驗);
// 沒有守衛的直接爆掉。實測 `data-table-invariants.mjs` 的 322 條不變條件
// **在本機從來沒有真的執行過** —— 補上參數後才第一次跑起來(而且全過)。
//
// 這是「同一個值散在 20 幾處」的典型(M17):任何一支忘了寫,它就靜靜地不驗任何東西。
//
// `--single-process`:沙箱不給開 zygote / 多程序。
// `--no-sandbox`:外層已經有沙箱,Chromium 自己的那層起不來。
// 實測(2026-09-07)三種組合:只給 `--no-sandbox` 起不來、什麼都不給也起不來,**兩個都要**。
//
// ⚠️ **`--single-process` 的代價:開不了第二個 browser context。**
// 需要多個 context(不同 deviceScaleFactor / 不同權限)的腳本,要**每種情境重開一次瀏覽器**,
// 不能在同一個 browser 上 `newContext()` —— 那會「第一個過、第二個當場崩」,
// 症狀是跑到一半才爆,很容易被誤讀成別的問題(`test-devmode-geometry-invariant.mjs` 踩過)。
// 同一個 context 內開多個 page 也不穩,長流程建議一個 page 走完。
//
// 用法:
//   用法:從 scripts 底下的閘 import 本檔的 launchBrowser(相對路徑 lib/launch-browser.mjs)。
//   (這行刻意不寫成 import 語句:相依閉包掃描器連註解裡的 import 也會算,寫成語句會讓本檔看起來 import 自己。)
//   const browser = await launchBrowser()                       // 起不來會丟例外
//   const browser = await launchBrowser({ headless: false })     // 覆寫任何選項
//   const browser = await launchBrowserOrSkip()                  // 起不來 → SKIPPED-ENV exit 0;必需瀏覽器的 lane → BROWSER-REQUIRED exit 1
//   const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop(), hint: '…' })   // 退出前先收尾
//   requireStorybookBuild(join(STATIC, 'index.json'))            // 沒有建置 → 印 MISSING-BUILD 並 exit 2(缺前置)
//   await openStory(page, url, { … })                            // 開 story 並證明真的渲染完成(見下方 openStory 區塊)
//   await waitForStoryRender(frame, { storyId })                 // 不是導覽觸發的切換(管理介面點側欄)也用同一份判定
//   await settleAfterInteraction(page, { frames: 10 })           // 點開浮層 / 按鍵之後等版面真的停了(取代固定睡眠;ok:false = 儀器失效)
//   await waitForDocsRender(frame, { docsId, timeoutMs })        // docs 頁真的渲染出來(docs 沒有 story 的 render phase,判定見該函式)

import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { createRenderHealthMonitor } from './storybook-render-health.mjs'

/** 本 repo 沙箱起得了 Chromium 的必要參數。 */
export const SANDBOX_ARGS = ['--single-process', '--no-sandbox']

export async function launchBrowser(options = {}) {
  const { args = [], ...rest } = options
  return chromium.launch({ headless: true, ...rest, args: [...SANDBOX_ARGS, ...args] })
}

// ═══════════════════════════════════════════════════════════════════════════
// 「這次沒跑 / 沒量到」的機讀標記 —— 閘印、lib/gate-selftest-meta.mjs 認,兩邊都從這裡取(M17)
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼要有明確標記**(2026-09-25):gate-selftest-meta 原本把「退出碼 2」一律讀成「起不了環境 → 略過」,
// 而 openStory 上線後十支瀏覽器閘在 story 開不起來時(儀器失效)也是 exit 2 —— 於是真正的儀器失效
// 在 meta-test 裡被印成「略過」、exit 0(M37:沒量到被讀成沒發生)。退出碼在各閘之間本來就不一致,
// 能當判據的只有閘**主動、明確**印出的標記:
//   SKIPPED-ENV      起不了 Chromium,而且這個 lane 沒宣告必需瀏覽器 → 略過(誠實地說「沒驗」)
//   BROWSER-REQUIRED 起不了 Chromium,但這個 lane 宣告 GOVERNANCE_BROWSER_REQUIRED=1 → 紅(不准略過)
//   MISSING-BUILD    沒有 storybook 建置(gate-meta lane 的拋棄式快照裡本來就沒有)→ 缺前置,略過
//   STALE-BUILD      建置比原始碼舊 → 缺前置,略過
//   INSTRUMENT-FAIL  儀器失效:開了卻沒量到(StoryRenderInstrumentError / 建置快照不完整)→ 紅,**絕不略過**
export const SKIPPED_ENV_MARKER = 'SKIPPED-ENV'
export const BROWSER_REQUIRED_MARKER = 'BROWSER-REQUIRED'
export const MISSING_BUILD_MARKER = 'MISSING-BUILD'
export const STALE_BUILD_MARKER = 'STALE-BUILD'
export const INSTRUMENT_FAIL_MARKER = 'INSTRUMENT-FAIL'

// **必需瀏覽器的 lane**(2026-09-25):CI 的瀏覽器 job 裝好 Chromium 就是為了跑這些閘,在那裡起不了瀏覽器
// 不是「環境沒有瀏覽器」而是「這個 job 壞了」—— 印 SKIPPED-ENV、exit 0 等於整批閘靜默通過(M37)。
// 這些 job 在 job 層宣告 `GOVERNANCE_BROWSER_REQUIRED: '1'`(.github/workflows/ci.yml;
// infra/governance/test/ci-workflow-scope.test.mjs 斷言「裝 Chromium 的 job 必須宣告、沒瀏覽器的 job 不得宣告」)。
export const BROWSER_REQUIRED_ENV = 'GOVERNANCE_BROWSER_REQUIRED'
/**
 * 目前這個 lane 是否宣告「必需瀏覽器」:'1' = 是;未設 / 空字串 / '0' = 否。
 * **其他值一律丟例外**(例:'true'、'yes')—— 寫錯值卻被當成「否」,等於 CI 以為自己有把關、實際照舊靜默略過(M37)。
 */
export function isBrowserRequired(env = process.env) {
  const value = env[BROWSER_REQUIRED_ENV]
  if (value === '1') return true
  if (value === undefined || value === '' || value === '0') return false
  throw new Error(`${BROWSER_REQUIRED_ENV} 只接受 '1'(必需瀏覽器)或 '0' / 未設,實得 ${JSON.stringify(value)} —— 寫錯的值不得被當成「不必需」`)
}

/**
 * 起不了 Chromium 之後的**唯一**政策(launchBrowserOrSkip 與各閘自己 try/catch 的地方都走這裡):
 *   一般環境 → 印 SKIPPED-ENV、exit 0(誠實地說「這次沒驗」);
 *   GOVERNANCE_BROWSER_REQUIRED=1 → 印 BROWSER-REQUIRED、exit 1(必需瀏覽器的 lane 不准略過)。
 * 兩條路都先跑 cleanup(例:停掉靜態伺服器)。**不回傳。**
 * @param {unknown} error launch 丟出的例外
 * @param {{ cleanup?: () => unknown, hint?: string }} [options]
 */
export async function exitOnBrowserLaunchFailure(error, { cleanup = null, hint = '' } = {}) {
  const reason = String(error?.message || error).split('\n')[0]
  try { await cleanup?.() } catch { /* 收尾失敗不改變判定 */ }
  if (isBrowserRequired()) {
    console.error(`✗ ${BROWSER_REQUIRED_MARKER}:無法啟動 Chromium(${reason})`)
    console.error(`  這個 lane 宣告 ${BROWSER_REQUIRED_ENV}=1(CI 的瀏覽器 job):起不了瀏覽器 = 這次什麼都沒驗 = 紅,不得當成略過。`)
    process.exit(1)
  }
  console.error(`⚠️  ${SKIPPED_ENV_MARKER}: 無法啟動 Chromium(${reason})`)
  if (hint) console.error(`   ${hint}`)
  process.exit(0)
}

/**
 * 起不了瀏覽器時交給 exitOnBrowserLaunchFailure:一般環境 SKIPPED-ENV exit 0,必需瀏覽器的 lane exit 1。
 *
 * **只給真的可能在無瀏覽器環境跑的腳本用。** 在一般環境用它就要接受「這次什麼都沒驗」也是 exit 0 ——
 * 所以 CI 裡跑它的 job 必須宣告 GOVERNANCE_BROWSER_REQUIRED=1(不然就會重演上面那個 322 條的狀況)。
 * @param {object} [options] 傳給 launchBrowser(chromium.launch)的選項
 * @param {{ cleanup?: () => unknown, hint?: string }} [onFailure] 起不來時先收尾、再印的補充說明
 */
export async function launchBrowserOrSkip(options = {}, onFailure = {}) {
  try {
    return await launchBrowser(options)
  } catch (error) {
    return exitOnBrowserLaunchFailure(error, onFailure)
  }
}

/**
 * 沒有 storybook 建置 → 印 MISSING-BUILD、exit 2(缺前置,不是產品裁決)。有的話什麼都不做。
 * gate-meta lane 在拋棄式快照裡跑,那裡本來就沒有 storybook-static;meta-test 只在看到這個標記時才准略過
 *(不再認「退出碼 2」—— 那也是儀器失效的退出碼)。CI 的瀏覽器 job 一定先 build,這條在那裡照樣是紅。
 * @param {string} path 建置裡必須存在的檔(通常是 index.json / index.html / iframe.html)
 * @param {string} [hint] 怎麼補(預設:先跑 npm run build-storybook)
 */
export function requireStorybookBuild(path, hint = '先跑 `npm run build-storybook`') {
  if (existsSync(path)) return
  console.error(`✗ ${MISSING_BUILD_MARKER}:找不到 ${path} —— ${hint}(缺前置,不是產品裁決)`)
  process.exit(2)
}

// ═══════════════════════════════════════════════════════════════════════════
// gotoStory —— 2026-09-25 退役(待辦總帳 C5)
// ═══════════════════════════════════════════════════════════════════════════
//
// 2026-09-20 起它是「導覽 + 等某個元素 + 固定睡 settle 毫秒」,之後變成 openStory 的薄包裝(不驗渲染完成 / 健康)。
// 起因:`action-bar-toolbar-invariant.mjs` 用 `waitUntil:'load'` + 固定睡 900ms 當「已渲染」的代理,慢的 runner 上假紅,
// 還指控「示範沒有消費 DataToolbar」—— 拿當時剛好成立的觀察量(過了 900ms)代替要保證的性質(元素在畫面上),M37。
// 最後一個呼叫點是 story-demo-focus-invariant.mjs 的節流對照組(刻意重現那個代理),已改成直接呼叫 openStory +
// 顯式的固定睡眠。現在**全部**瀏覽器閘都走下方的 openStory;不要再加回「等元素 + 固定睡眠」的共用入口。

// ═══════════════════════════════════════════════════════════════════════════
// openStory —— 「這則 story 真的渲染完成了」的**唯一**實作(全部瀏覽器閘共用)
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼有這個**(2026-09-25):同一天四支閘各自長出一份「等 story 真的畫完」——
// focus-geometry-browser-audit(loadStory)、overflow-indicator-containment(settleAndProbe)、
// field-size-regression-diff(shot 裡的四步等待)、field-view-typography-invariant(gotoStory + waitForFunction)。
// 四份判準各不相同(有的看 render phase、有的看 DOM 靜止幾毫秒、有的看影格、有的只看元素出現),
// 修一份其他三份不會跟著好 —— 正是 M17 禁止的平行實作。現在收成這一支,四支閘都呼叫它。
//
// 要保證的性質(M37,逐字):**被量的是「這則 story 在 Storybook 回報渲染完成(含 play / afterEach)之後」的畫面,
// 而且那個畫面不是 Storybook 的錯誤頁、不是空的、沒有關鍵資源缺檔、沒有頁面例外。**
// 任何一項等不到或不成立 → 丟 StoryRenderInstrumentError(儀器失效:沒量到,不是產品裁決),
// 訊息點名 story id、附 Storybook 錯誤頁原文與同源 404 / 失敗請求。**絕不回「成功」、也絕不靜默略過。**
//
// 依序:
//   1. 導覽前先掛好監聽(關鍵資源失敗、頁面例外、進行中請求)—— 事後才掛會漏掉最早的那一筆;只算**本次導覽之後發出**的請求
//      (上一則 story 被導覽中斷的請求會晚到,不能算到這一則頭上);opts.notFound 可併入伺服器端的 404 帳本
//   2. goto(load);導覽本身失敗 → kind 'navigation'
//      opts.previewFrame(管理介面)→ 等那個 iframe 元素、之後 3–9 步都在它的內容框架裡做;等不到 → kind 'preview-frame'
//   3. Storybook iframe(網址是 …/iframe.html,或 opts.storybook = true)且 requireRenderFinished:
//      等 `__STORYBOOK_PREVIEW__.currentRender` 是**這一則**(知道 id 時 render.id 必須相等)且 phase 走到 finished
//     (或 opts.finishedPhases 允許的 play 之後的 phase);錯誤頁(sb-show-errordisplay)/ 無預覽頁(sb-show-nopreview)
//      也是終點 → 各自丟對應 kind。這一步的本體 awaitStorybookRender 也由 waitForStoryRender 輸出(不是導覽觸發的切換用)
//   4. render-health(lib/storybook-render-health.mjs):根節點有內容(或 portal)、無關鍵資源失敗、無頁面例外
//   5. requestsSettled:渲染期間發出的請求全部結束(遠端頭像圖等)
//   6. waitFor:選擇器(attached)或頁面函式(回 truthy 為止)—— 等**被量的元素本身**
//   7. beforeSettle(page):呼叫端在「靜止判定」之前要做的事(例:截圖前 blur)
//   8. fonts:document.fonts.ready(字寬會改幾何)
//   9. settleFrames:**連續 N 個影格**沒有任何 DOM 變動、也沒有進行中的有限長度動畫(無限動畫不算,它永遠不停)。
//      用影格不用毫秒:元件「量寬 → setState → 重畫」是一格一格推進的,機器慢只是等久一點,不會提早取樣。
//      probe(可選):在最後一個靜止影格的**同一個 task** 裡執行,回傳前不讓頁面再跑任何東西
//  10. 有做 5–9 任一步時再驗一次 render-health(等待期間冒出的例外也要算)
// 逾時(timeoutMs / settleTimeoutMs / navigationTimeoutMs)只是「等不到」的上限,不是「已渲染」的代理 ——
// 成功一律由上面的訊號本身決定;慢的機器只會等久一點。
//
// 用法:
//   const r = await openStory(page, url)                                   // 渲染完成 + 健康 + 字型
//   const r = await openStory(page, url, { settleFrames: 10, probe: countPlus })   // r.probe = 靜止當下的量測
//   try { await openStory(page, url, { waitFor: '[data-x]' }) }
//   catch (e) { if (e instanceof StoryRenderInstrumentError) … e.kind / e.storyId / e.detail … }
// 回傳 { storyId, storybook, phase, ms, settle: { framesWaited, lateChanges, longestBrokenQuiet } | null, probe, frame }
//
// requireRenderFinished 只適用 viewMode=story(docs 頁沒有同一套 render phase);非 Storybook 頁會略過第 3 步。
//
// **管理介面(index.html)裡的 story**(2026-09-25 加,取代 data-table-hover-latency 的私有副本):
//   openStory(page, `${origin}/index.html?path=/story/${id}`, { previewFrame: '#storybook-preview-iframe', waitFor: '[data-x]' })
//   導覽的是管理介面,第 3–9 步(渲染完成 / render-health / waitFor / 字型 / 靜止 / probe)改在那個 iframe 的內容框架裡做;
//   story id 取 opts.storyId,沒給就從網址的 path=/story/<id> 取(兩者都沒有 → TypeError:「有某一則渲染完成」≠「這一則」)。
//   settleFrames 在這個模式下**同時**看 preview 與外層管理介面兩份文件(外掛面板收到結果後的重畫、iframe 位置的位移也要停)。
//   回傳的 frame = 量測所在的 Frame(呼叫端之後的量測用它)。beforeSettle 仍收到最外層 page。
//   **不是導覽觸發的切換**(管理介面裡點側欄換 story:Storybook channel 驅動,沒有網址可以交給 openStory)→ 用下方的 waitForStoryRender。
//
// **哪些 phase 算「渲染完成」**(opts.finishedPhases,預設 ['finished']):Storybook 8.6 的 phase 依序是
//   preparing → loading → rendering → playing → played → completed → afterEach → finished(@storybook/core preview-api StoryRender.render)。
//   只准額外接受 play 跑完之後才會走到的 'completed' / 'afterEach' —— 給「afterEach 靠計時器推進、在假時鐘暫停下永遠走不到 finished」的閘用
//  (menu-message-row:a11y addon 在 afterEach 跑 axe)。更早的 phase 代表 story 或 play 還沒跑完,傳進來一律 TypeError。

/** openStory 等不到或判不健康時丟的例外:**儀器失效(沒量到),不是產品裁決**。 */
export class StoryRenderInstrumentError extends Error {
  constructor({ storyId, url = '', kind, reason, storybookError = '', failedRequests = [], phase = null, cause } = {}) {
    const parts = [reason]
    if (storybookError) parts.push(`Storybook 錯誤:${storybookError}`)
    if (failedRequests.length) parts.push(`同源 404 / 載入失敗:${failedRequests.join(', ')}`)
    const detail = parts.join(';')
    super(`${INSTRUMENT_FAIL_MARKER} story「${storyId}」沒有量到 —— ${detail}。這是儀器失效(沒量到),不是產品裁決:元件不一定有問題,但這次不能算通過`,
      cause ? { cause } : undefined)
    this.name = 'StoryRenderInstrumentError'
    this.storyId = storyId
    this.url = url
    /** navigation | preview-frame | render-timeout | render-wait-failed | storybook-error | no-preview | render-errored | not-story | render-health | requests-timeout | wait-for-timeout | dom-not-settled */
    this.kind = kind
    this.reason = reason
    /** 不含 story id 與「不是產品裁決」那句的原因全文(呼叫端自己點名 story 時用) */
    this.detail = detail
    this.storybookError = storybookError
    this.failedRequests = failedRequests
    this.phase = phase
  }
}

const firstLine = (value) => String(value?.message ?? value).split('\n')[0]

function storyIdOf(url) {
  try { return new URL(url).searchParams.get('id') } catch { return null }
}

function isStorybookIframe(url) {
  try { return /\/iframe\.html$/.test(new URL(url).pathname) } catch { return false }
}

/** 管理介面網址(index.html?path=/story/<id>)裡的 story id;不是這種網址回 null。 */
function managerStoryIdOf(url) {
  try { return new URL(url).searchParams.get('path')?.match(/^\/story\/([^/?#]+)$/)?.[1] ?? null } catch { return null }
}

// play 跑完之後才會走到的 phase(見 openStory 區塊註解);'finished' 恆算完成
const FINISHED_PHASE_CHOICES = ['completed', 'afterEach', 'finished']
function normalizeFinishedPhases(finishedPhases) {
  if (!Array.isArray(finishedPhases) || finishedPhases.length === 0 || finishedPhases.some((phase) => !FINISHED_PHASE_CHOICES.includes(phase))) {
    throw new TypeError(`finishedPhases 只接受 ${FINISHED_PHASE_CHOICES.join(' / ')} 組成的非空陣列(play 跑完之後才會走到的 phase),實得 ${JSON.stringify(finishedPhases)} —— 更早的 phase 代表 story 或 play 還沒跑完,不能當「渲染完成」`)
  }
  return [...new Set([...finishedPhases, 'finished'])]
}

// 頁面端:這一則 story 的渲染走到終點了沒(waitForFunction 用;回 false = 還沒)
function storybookRenderState({ storyId, finished }) {
  const cls = document.body?.classList
  if (cls?.contains('sb-show-errordisplay')) return { state: 'error-display' }
  if (cls?.contains('sb-show-nopreview')) return { state: 'no-preview' }
  const render = window.__STORYBOOK_PREVIEW__?.currentRender
  if (!render || (storyId && render.id !== storyId)) return false
  if (finished.includes(render.phase) || render.phase === 'errored' || render.phase === 'aborted') {
    return { state: render.phase, main: Boolean(cls?.contains('sb-show-main')), bodyClass: document.body.className }
  }
  return false
}

// 頁面端:等不到終點時,最後看到的是什麼(寫進訊息,讓「等不到」說得出停在哪)
function storybookLastSeen() {
  const render = window.__STORYBOOK_PREVIEW__?.currentRender
  if (!window.__STORYBOOK_PREVIEW__) return '頁面上沒有 Storybook 預覽(__STORYBOOK_PREVIEW__ 不存在:預覽腳本沒載起來)'
  if (!render) return '預覽已起來但沒有 currentRender(story 還沒開始渲染)'
  return `currentRender = ${render.id ?? '(無 id)'} / ${render.phase ?? '(無 phase)'};body class = ${document.body.className || '(無)'}`
}

// 頁面端:Storybook 錯誤頁的原文
function storybookErrorText() {
  const message = (document.getElementById('error-message')?.textContent || '').trim()
  const stack = (document.getElementById('error-stack')?.textContent || '').trim().split('\n')[0]
  return [message, stack && !message.includes(stack) ? stack : ''].filter(Boolean).join(' | ').slice(0, 300)
}

// 頁面端:連續 frames 個影格沒有 DOM 變動、也沒有進行中的有限長度動畫。**以 page.evaluate 序列化傳入,不得引用外部變數。**
// includeParent(previewFrame 模式):同時看外層的管理介面文件 —— 外掛面板收到結果後的重畫、版面位移(iframe 位置)也要停,
// 兩份文件在**同一段**連續影格裡都沒動才算靜止;讀不到外層文件(跨來源)回 parentUnreadable,不得當成「外層沒動」。
function waitForQuietFrames({ frames, capMs, includeParent = false }) {
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))
  const docs = [document]
  if (includeParent && window.parent !== window) {
    try { docs.push(window.parent.document) } catch { return Promise.resolve({ ok: false, parentUnreadable: true, framesWaited: 0, lateChanges: 0, longestBrokenQuiet: 0 }) }
  }
  // 無限動畫(載入中轉圈)不算「還在動」—— 它永遠不會停,而且不改版面
  const finiteAnimationRunning = () => docs.some((doc) => doc.getAnimations().some((animation) => {
    if (animation.playState !== 'running') return false
    const end = animation.effect?.getComputedTiming?.().endTime
    return Number.isFinite(end)
  }))
  return (async () => {
    let quiet = 0, longestBrokenQuiet = 0, lateChanges = 0, framesWaited = 0
    if (frames <= 0) return { ok: true, framesWaited, lateChanges, longestBrokenQuiet }
    const reset = () => { if (quiet > longestBrokenQuiet) longestBrokenQuiet = quiet; quiet = 0; lateChanges++ }
    const observer = new MutationObserver(reset)
    for (const doc of docs) observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true })
    const start = performance.now()
    try {
      while (quiet < frames) {
        if (performance.now() - start > capMs) return { ok: false, framesWaited, lateChanges, longestBrokenQuiet }
        await frame()
        framesWaited++
        if (finiteAnimationRunning()) reset(); else quiet++
      }
    } finally { observer.disconnect() }
    return { ok: true, framesWaited, lateChanges, longestBrokenQuiet }
  })()
}

/**
 * **互動之後**等「版面真的停了」(2026-09-25,待辦總帳 C5)—— 與 openStory 第 9 步同一份靜止判定(waitForQuietFrames:
 * 連續 frames 個影格沒有任何 DOM 變動、也沒有進行中的有限長度動畫 / CSS 過渡)。
 *
 * 取代「點開浮層後固定睡 N 毫秒」:那是「浮層已開、開啟動畫已停」的代理(M37)。慢的機器上固定睡眠會提早量,
 * 把「還沒開」讀成「這裡沒有浮層 / 不適用」—— 覆蓋率在沒有任何訊號的情況下縮水(overlay-footer-gutter 的點開下拉、
 * dialog-height H5 的點開 dialog、focus-indicator 的點開檢視器都是這個形狀)。
 * 用影格不用毫秒:點擊觸發的 React 更新與開啟動畫是一格一格推進的,主執行緒忙時影格也不跑,所以機器慢只會等久一點;
 * 點擊若什麼都沒觸發,版面本來就靜止,等滿 frames 格就回來 —— 「這一下沒開出任何東西」因此也是可靠的結論,不是提早放棄。
 * 限制:靠計時器延後才開的東西(例:有 openDelay 的 HoverCard / Tooltip)不在這個保證裡,那種要等元素本身。
 * @param {object} target  Playwright 的 Page 或 Frame
 * @param {{ frames?: number, capMs?: number }} [options]  capMs 只是「等不到」的天花板
 * @returns {Promise<{ ok: boolean, framesWaited: number, lateChanges: number, longestBrokenQuiet: number }>}
 *   ok:false = capMs 內等不到靜止 —— 呼叫端必須當**儀器失效**,不得當成「沒開」也不得當成「已開」
 */
export async function settleAfterInteraction(target, { frames = 10, capMs = 10_000 } = {}) {
  if (!target || typeof target.evaluate !== 'function') throw new TypeError('settleAfterInteraction:target 必須是 Playwright 的 Page 或 Frame')
  if (!Number.isInteger(frames) || frames < 1) throw new TypeError(`settleAfterInteraction:frames 必須是 ≥ 1 的整數,實得 ${JSON.stringify(frames)}`)
  return target.evaluate(waitForQuietFrames, { frames, capMs })
}

// 頁面端:docs 頁渲染到哪了(waitForDocsRender 用;回 false = 還沒)。**以 waitForFunction 序列化傳入,不得引用外部變數。**
function docsRenderState({ docsId }) {
  const cls = document.body?.classList
  if (cls?.contains('sb-show-errordisplay')) return { state: 'error-display' }
  if (cls?.contains('sb-show-nopreview')) return { state: 'no-preview' }
  const render = window.__STORYBOOK_PREVIEW__?.currentRender
  if (!render || render.type !== 'docs' || (docsId && render.id !== docsId)) return false
  if (typeof render.isPreparing === 'function' && render.isPreparing()) return false
  const docs = document.getElementById('storybook-docs')
  // 被 Storybook 藏起來的 docs 容器(切去看 story 時的 `hidden`)有內容也不算:那正是 docs 競態閘要抓的殭屍
  if (!docs || docs.hasAttribute('hidden') || docs.childElementCount === 0) return false
  return { state: 'rendered', id: render.id }
}

/**
 * **docs 頁**(viewMode=docs,或管理介面裡點開元件節點)真的渲染出來了 —— 全部閘共用的唯一判定(2026-09-25,待辦總帳 C5;
 * 取代 storybook-docs-race-invariant 的私有輪詢與 verify-published-deploy 的 DOCS_SETTLED,M17)。
 * docs 頁沒有 story 那一套 render phase(`@storybook/core` preview-api 的 CsfDocsRender 只有 preparing 旗標、渲染完 emit DOCS_RENDERED),
 * 所以判定是:Storybook 的 currentRender 是 **docs**(給 docsId 時必須是這一則)、不在 preparing、`#storybook-docs` 沒被藏起來而且有內容;
 * 錯誤頁 / 無預覽頁當場停。可選 settleFrames:之後再等版面連續 N 個影格靜止(docs 裡的 story 是陸續畫出來的)。
 * 等不到 / 錯誤頁 / 無預覽 / 不靜止 → 丟 StoryRenderInstrumentError(儀器失效,不是產品裁決)。
 * @param {object} target  Playwright 的 Page 或 Frame(管理介面 → preview iframe 的內容框架)
 * @param {{ docsId?: string, timeoutMs?: number, settleFrames?: number, label?: string, url?: string, notFound?: string[] }} [options]
 * @returns {Promise<{ docsId: string, ms: number }>}
 */
export async function waitForDocsRender(target, options = {}) {
  const { docsId = null, timeoutMs = 30_000, settleFrames = 0, url = '', notFound = null } = options
  if (!target || typeof target.waitForFunction !== 'function' || typeof target.evaluate !== 'function') {
    throw new TypeError('waitForDocsRender:target 必須是 Playwright 的 Page 或 Frame')
  }
  const label = options.label ?? docsId ?? '(docs 頁)'
  const from = Array.isArray(notFound) ? notFound.length : 0
  const t0 = Date.now()
  const instrument = (kind, reason, extra = {}) => new StoryRenderInstrumentError({
    storyId: label, url, kind, reason, ...extra,
    failedRequests: Array.isArray(notFound) ? [...new Set(notFound.slice(from))].map((path) => `404 ${path}`).slice(0, 8) : [],
  })
  let done = null
  try {
    const handle = await target.waitForFunction(docsRenderState, { docsId }, { timeout: timeoutMs, polling: 'raf' })
    done = await handle.jsonValue()
  } catch (error) {
    if (error?.name !== 'TimeoutError') throw instrument('render-wait-failed', `等 docs 頁渲染時等待本身中斷:${firstLine(error)}`, { cause: error })
    const lastSeen = await target.evaluate(() => {
      const render = window.__STORYBOOK_PREVIEW__?.currentRender
      const docs = document.getElementById('storybook-docs')
      return `currentRender = ${render ? `${render.type ?? '?'} / ${render.id ?? '(無 id)'}` : '(無)'};#storybook-docs ${docs ? `${docs.hasAttribute('hidden') ? 'hidden、' : ''}子節點 ${docs.childElementCount}` : '(不存在)'}`
    }).catch(() => '讀不到頁面狀態')
    throw instrument('render-timeout', `${timeoutMs / 1000} 秒內等不到 docs 頁渲染出來(最後看到:${lastSeen})`)
  }
  if (done.state === 'error-display') {
    throw instrument('storybook-error', 'Storybook 顯示錯誤頁(docs 渲染拋錯或模組載入失敗)', { storybookError: await target.evaluate(storybookErrorText).catch(() => '') })
  }
  if (done.state === 'no-preview') throw instrument('no-preview', 'Storybook 顯示「無預覽」頁(索引裡沒有這一則 docs)')
  if (settleFrames > 0) {
    const settled = await target.evaluate(waitForQuietFrames, { frames: settleFrames, capMs: timeoutMs })
    if (!settled.ok) throw instrument('dom-not-settled', `docs 頁渲染出來後 ${timeoutMs / 1000} 秒內版面沒有連續靜止 ${settleFrames} 個影格(等了 ${settled.framesWaited} 格,期間變動 ${settled.lateChanges} 次)`)
  }
  return { docsId: done.id, ms: Date.now() - t0 }
}

/**
 * 第 3 步本體(openStory 與 waitForStoryRender 共用,**唯一實作**):在 target(Page 或 Frame)裡等 Storybook 回報**這一則**
 * 渲染走到 finished(或 finishedPhases 允許的 play 之後的 phase),錯誤頁 / 無預覽頁 / errored / 不是 story 畫面各自丟對應 kind。
 * target 在等待期間重新載入(管理介面的 preview 離開渲染完整的 docs 頁時會整個 reload)不影響:Playwright 的 waitForFunction
 * 會在新的執行環境裡續等(playwright-core frames.js retryWithProgressAndTimeouts);輪詢用的是 Playwright 自己保存的 rAF,假時鐘暫停也照跑。
 * @returns {Promise<string>} 終點的 phase
 */
async function awaitStorybookRender(target, storyId, { timeoutMs, finished, instrument }) {
  const deadline = Date.now() + timeoutMs
  let done = null
  for (;;) {
    try {
      const handle = await target.waitForFunction(storybookRenderState, { storyId, finished }, { timeout: Math.max(1, deadline - Date.now()), polling: 'raf' })
      done = await handle.jsonValue()
      break
    } catch (error) {
      if (error?.name === 'TimeoutError') break
      // 拿結果的那一瞬間 preview 剛好重新載入(執行環境被換掉)→ 還有時間就續等同一個訊號;其他錯(頁面關了、frame 被拆掉)= 儀器失效
      if (/Execution context was destroyed|Cannot find context/i.test(String(error?.message)) && Date.now() < deadline) continue
      throw instrument('render-wait-failed', `等 Storybook 回報渲染完成時等待本身中斷:${firstLine(error)}`, { cause: error })
    }
  }
  if (!done) {
    const lastSeen = await target.evaluate(storybookLastSeen).catch(() => '讀不到頁面狀態')
    throw instrument('render-timeout', `${timeoutMs / 1000} 秒內等不到 Storybook 回報這則 story 渲染完成(最後看到:${lastSeen})`)
  }
  const phase = done.state
  if (phase === 'error-display') {
    throw instrument('storybook-error', 'Storybook 顯示錯誤頁(story 不存在、模組載入失敗或渲染拋錯)',
      { storybookError: await target.evaluate(storybookErrorText).catch(() => ''), phase })
  }
  if (phase === 'no-preview') {
    throw instrument('no-preview', 'Storybook 顯示「無預覽」頁(索引裡沒有這則 story,或沒有任何 story 被選到)', { phase })
  }
  if (!finished.includes(phase)) {
    throw instrument('render-errored', `Storybook 回報渲染結果 = ${phase}`,
      { storybookError: await target.evaluate(storybookErrorText).catch(() => ''), phase })
  }
  if (!done.main) throw instrument('not-story', `渲染完成但畫面不是 story(body class:${done.bodyClass || '(無)'})`, { phase })
  return phase
}

/**
 * **不是由導覽觸發的** story 切換用的「這一則真的渲染完成了」—— 與 openStory 第 3 步同一份實作(awaitStorybookRender)。
 * 例:管理介面裡點側欄換 story(Storybook channel 驅動,preview iframe 不一定重新導覽,沒有網址可以交給 openStory)。
 * 等不到 / 錯誤頁 / 無預覽頁 / errored → 丟 StoryRenderInstrumentError(儀器失效,不是產品裁決),附伺服器 404 帳本裡本次新增的路徑。
 * 只做第 3 步:要 render-health / waitFor / 靜止的,請用 openStory(導覽觸發,含 previewFrame 模式)。
 * @param {object} target  Playwright Page 或 Frame(例:(await page.$('#storybook-preview-iframe')).contentFrame())
 * @param {object} options
 * @param {string} options.storyId                  必填 ——「有某一則渲染完成」不等於「這一則渲染完成」(M37)
 * @param {string} [options.label]                  訊息裡點名用(預設 = storyId)
 * @param {string} [options.url]                    寫進例外的網址(僅供訊息)
 * @param {number} [options.timeoutMs]              等不到的上限(預設 30000;不是「已渲染」的代理)
 * @param {string[]} [options.finishedPhases]       見 openStory(預設 ['finished'])
 * @param {string[]} [options.notFound]             伺服器端 404 帳本(startA11yStaticServer().notFound)
 * @param {number} [options.notFoundFrom]           帳本從第幾筆起算(預設 = 呼叫當下的長度;切換前先記下長度再傳,切換途中的 404 才算得到)
 * @returns {Promise<{ storyId: string, phase: string, ms: number }>}
 */
export async function waitForStoryRender(target, options = {}) {
  const { storyId, url = '', timeoutMs = 30_000, finishedPhases = ['finished'], notFound = null } = options
  if (!target || typeof target.waitForFunction !== 'function' || typeof target.evaluate !== 'function') {
    throw new TypeError('waitForStoryRender:target 必須是 Playwright 的 Page 或 Frame')
  }
  if (typeof storyId !== 'string' || !storyId) {
    throw new TypeError('waitForStoryRender:storyId 必填 ——「有某一則渲染完成」不等於「這一則渲染完成」')
  }
  const finished = normalizeFinishedPhases(finishedPhases)
  const label = options.label ?? storyId
  const from = Number.isInteger(options.notFoundFrom) ? options.notFoundFrom : (Array.isArray(notFound) ? notFound.length : 0)
  const t0 = Date.now()
  const instrument = (kind, reason, extra = {}) => new StoryRenderInstrumentError({
    storyId: label, url, kind, reason, ...extra,
    failedRequests: Array.isArray(notFound) ? [...new Set(notFound.slice(from))].map((path) => `404 ${path}`).slice(0, 8) : [],
  })
  const phase = await awaitStorybookRender(target, storyId, { timeoutMs, finished, instrument })
  return { storyId: label, phase, ms: Date.now() - t0 }
}

/**
 * 開一則 story,證明它真的渲染完成才回傳;證明不了就丟 StoryRenderInstrumentError。語意見上方區塊註解。
 * @param {object} page  Playwright Page
 * @param {string} url
 * @param {object} [options]
 * @param {string|Function|null} [options.waitFor]  選擇器(attached)或頁面函式(回 truthy 為止)
 * @param {*} [options.waitForArg]                  waitFor 是函式時傳給它的參數
 * @param {number|'raf'} [options.waitForPolling]   waitFor 是函式時的輪詢方式(預設 'raf')
 * @param {number} [options.settleFrames]           連續幾個影格無 DOM 變動才算靜止(0 = 不等)
 * @param {Function} [options.probe]                在靜止當下同一個 task 裡執行的頁面函式(箭頭函式或 function 運算式)
 * @param {*} [options.probeArg]                    傳給 probe 的參數(須可 JSON 序列化)
 * @param {boolean} [options.requireRenderFinished] Storybook iframe 時等 render phase 走到終點(預設 true)
 * @param {boolean} [options.health]                跑 render-health(預設 true)
 * @param {boolean} [options.fonts]                 等 document.fonts.ready(預設 true)
 * @param {boolean} [options.requestsSettled]       等渲染期間發出的請求全部結束(預設 false)
 * @param {Function} [options.beforeSettle]         async (page) => {},在字型 / 靜止判定之前執行
 * @param {boolean} [options.storybook]             覆寫「這是不是 Storybook iframe」(預設看網址是否為 …/iframe.html;有 previewFrame 時預設 true)
 * @param {string[]} [options.finishedPhases]       哪些 phase 算渲染完成(預設 ['finished'];只准加 'completed' / 'afterEach',見區塊註解)
 * @param {string} [options.previewFrame]           導覽的是管理介面時,preview iframe 的選擇器(例 '#storybook-preview-iframe');第 3–9 步改在它的內容框架裡做
 * @param {string} [options.storyId]                第 3 步要等的 story id(預設 = 網址的 id 參數;previewFrame 模式再退到 path=/story/<id>)
 * @param {string[]} [options.notFound]           伺服器端 404 帳本(startA11yStaticServer().notFound);本次新增的列進失敗訊息
 * @param {string} [options.label]                  訊息裡點名用(預設 = story id,沒有則用網址)
 * @param {number} [options.timeoutMs]              等渲染完成 / waitFor / 請求結束各自的上限(預設 30000)
 * @param {number} [options.navigationTimeoutMs]    goto 的上限(預設 60000)
 * @param {number} [options.settleTimeoutMs]        等靜止的上限(預設 10000)
 * @param {number} [options.healthTimeoutMs]        render-health 等根節點有內容的上限(預設 5000;previewFrame 模式 30000,理由見解構處)
 */
export async function openStory(page, url, options = {}) {
  const {
    waitFor = null, waitForArg, waitForPolling = 'raf',
    settleFrames = 0, probe = null, probeArg = null,
    requireRenderFinished = true, health = true, fonts = true, requestsSettled = false,
    beforeSettle = null, previewFrame = null, storybook = previewFrame ? true : isStorybookIframe(url), notFound = null,
    timeoutMs = 30_000, navigationTimeoutMs = 60_000, settleTimeoutMs = 10_000,
    // previewFrame 模式預設 30 秒(render-health 的上限):管理介面與 preview 同源、共用同一條主執行緒,story finished 之後
    // 管理介面自己的外掛面板重畫會把它塞住好幾秒 —— 2026-09-25 實測 CPU ×6 下 story 已 finished、根節點有內容,
    // 5 秒上限卻因為檢查本身排不到執行而被判成「empty story root」(誤紅);30 秒下同一趟通過、之後 0 次版面變動。
    // 上限只是「等不到」的天花板,成功仍由訊號本身決定,放寬不會造成假綠。
    healthTimeoutMs = previewFrame ? 30_000 : 5_000,
  } = options
  // 呼叫端寫錯選項 = 程式錯誤,導覽前就丟(不是儀器失效,也不能默默退回預設)
  const finished = normalizeFinishedPhases(options.finishedPhases ?? ['finished'])
  if (previewFrame != null && (typeof previewFrame !== 'string' || !previewFrame)) throw new TypeError('openStory:previewFrame 必須是 preview iframe 的選擇器字串')
  const storyId = options.storyId ?? storyIdOf(url) ?? (previewFrame ? managerStoryIdOf(url) : null)
  if (previewFrame && storybook && requireRenderFinished && !storyId) {
    throw new TypeError('openStory:previewFrame 模式要知道等哪一則(opts.storyId 或網址 path=/story/<id>)——「有某一則渲染完成」不等於「這一則渲染完成」')
  }
  const label = options.label ?? storyId ?? String(url).slice(0, 120)
  const t0 = Date.now()
  // 第 3–9 步的量測對象:一般是 page 本身;previewFrame 模式在導覽後換成 preview iframe 的內容框架
  let target = page

  // 1. 導覽前掛監聽
  const origin = (() => { try { return new URL(url).origin } catch { return null } })()
  const failed = []
  const describe = (requestUrl) => {
    try { const u = new URL(requestUrl); return u.origin === origin ? u.pathname : requestUrl.slice(0, 160) } catch { return String(requestUrl).slice(0, 160) }
  }
  // 只記**新文件發出**的請求(加上導覽請求本身):上一則 story 的文件在新文件 commit 之前還活著、還會發請求,
  // 那些請求隨即被導覽中斷(net::ERR_ABORTED)並在這之後才回報 —— 不是這一則的問題。以主框架 commit(framenavigated)
  // 為界,而不是「監聽掛上之後」:掛上監聽到 commit 之間那一段,舊文件照樣在發請求(field-view 對照組 B 實際踩到)。
  const seen = new Set()
  const inflight = new Set()
  let committed = false
  const onFrameNavigated = (frame) => { if (frame === page.mainFrame()) committed = true }
  const onRequest = (request) => {
    if (!committed && !request.isNavigationRequest()) return
    seen.add(request)
    if (requestsSettled) inflight.add(request)
  }
  const onResponse = (response) => {
    if (response.status() >= 400 && seen.has(response.request())) failed.push(`${response.status()} ${describe(response.url())}`)
  }
  const onRequestFailed = (request) => {
    inflight.delete(request)
    if (seen.has(request)) failed.push(`${describe(request.url())}(${request.failure()?.errorText ?? '失敗'})`)
  }
  const onRequestFinished = (request) => inflight.delete(request)
  page.on('framenavigated', onFrameNavigated)
  page.on('request', onRequest)
  page.on('response', onResponse)
  page.on('requestfailed', onRequestFailed)
  page.on('requestfinished', onRequestFinished)
  // 伺服器端的 404 帳本(startA11yStaticServer().notFound)是最確定的來源:瀏覽器事件可能晚到,伺服器記的不會
  const ledgerStart = Array.isArray(notFound) ? notFound.length : 0
  // render-health 監聽的是整個 page:上一則 story 被本次導覽中斷的 script 請求(net::ERR_ABORTED)會在這之後才回報,
  // 被它算成「這一則的關鍵資源失敗」而誤判儀器失效(test-open-story.mjs 的「晚到的 story 檔」與「上一則還在發請求」兩題實際踩到)。
  // 不改 render-health 本身(其他閘也用它),只給它一個「只轉送新文件發出的請求」的 page 視圖(同上方 seen 的界線)。
  const scoped = new Map()
  const currentOnly = (event, handler) => (payload) => {
    if (event === 'requestfailed' && !seen.has(payload)) return
    if (event === 'response' && !seen.has(payload.request())) return
    handler(payload)
  }
  // 事件(請求 / 例外)聽的是整個 page(含 preview iframe 發的請求);檢查畫面的 evaluate / waitForFunction 走量測對象(target)
  const scopedPage = {
    on(event, handler) { const wrapped = currentOnly(event, handler); scoped.set(handler, wrapped); page.on(event, wrapped) },
    off(event, handler) { page.off(event, scoped.get(handler) ?? handler); scoped.delete(handler) },
    evaluate: (...args) => target.evaluate(...args),
    waitForFunction: (...args) => target.waitForFunction(...args),
  }
  const monitor = health ? createRenderHealthMonitor(scopedPage, { mode: storybook ? 'storybook' : 'document' }) : null

  const instrument = (kind, reason, extra = {}) => new StoryRenderInstrumentError({
    storyId: label, url, kind, reason, ...extra,
    failedRequests: [...new Set([
      ...(Array.isArray(notFound) ? notFound.slice(ledgerStart).map((path) => `404 ${path}`) : []),
      ...failed,
    ])].slice(0, 8),
  })
  const assertHealthy = async () => {
    if (!monitor) return
    try {
      await monitor.assertHealthy({ label, timeoutMs: healthTimeoutMs })
    } catch (error) {
      const storybookError = storybook ? await target.evaluate(storybookErrorText).catch(() => '') : ''
      // render-health 的訊息前綴是「render health:<label>:」—— 例外本身會點名 story,去掉重複的那段
      const reason = firstLine(error).replace(`render health:${label}:`, '').replace(/^render health:/, '')
      throw instrument('render-health', reason, { storybookError: reason.includes(storybookError) ? '' : storybookError })
    }
  }

  try {
    // 2. 導覽
    try {
      await page.goto(url, { waitUntil: 'load', timeout: navigationTimeoutMs })
    } catch (error) {
      throw instrument('navigation', `導覽失敗:${firstLine(error)}`, { cause: error })
    }

    // 2b. 管理介面:量測對象換成 preview iframe 的內容框架(iframe 元素本身等不到 = 儀器失效)
    if (previewFrame) {
      const handle = await page.waitForSelector(previewFrame, { state: 'attached', timeout: timeoutMs }).catch(() => null)
      const frame = await handle?.contentFrame().catch(() => null)
      if (!frame) throw instrument('preview-frame', `${timeoutMs / 1000} 秒內在頁面上等不到 preview iframe「${previewFrame}」(或它沒有內容框架)`)
      target = frame
    }

    // 3. Storybook 自己的渲染完成訊號(含 play / afterEach)—— 與 waitForStoryRender 同一份實作
    let phase = null
    if (storybook && requireRenderFinished) phase = await awaitStorybookRender(target, storyId, { timeoutMs, finished, instrument })

    // 4. 錯誤頁文字 / 空畫面 / 關鍵資源失敗 / 頁面例外
    await assertHealthy()

    // 5. 渲染期間發出的請求全部結束
    if (requestsSettled) {
      const deadline = Date.now() + timeoutMs
      while (inflight.size) {
        if (Date.now() > deadline) {
          throw instrument('requests-timeout', `請求 ${timeoutMs / 1000} 秒未結束:${[...inflight].slice(0, 3).map((r) => describe(r.url())).join(', ')}`)
        }
        await page.waitForTimeout(50)
      }
    }

    // 6. 被量的元素本身
    if (waitFor) {
      const appeared = typeof waitFor === 'string'
        ? await target.waitForSelector(waitFor, { timeout: timeoutMs, state: 'attached' }).then(() => true, () => false)
        : await target.waitForFunction(waitFor, waitForArg, { timeout: timeoutMs, polling: waitForPolling }).then(() => true, () => false)
      if (!appeared) {
        const what = typeof waitFor === 'string' ? `「${waitFor}」` : '呼叫端指定的元素(waitFor 函式)'
        throw instrument('wait-for-timeout', `${timeoutMs / 1000} 秒內沒等到${what}`, { phase })
      }
    }

    // 7. 呼叫端在靜止判定前要做的事
    if (beforeSettle) await beforeSettle(page)

    // 8. 字型
    if (fonts) await target.evaluate(() => document.fonts.ready.then(() => true))

    // 9. 版面靜止(影格)+ 同一個 task 裡的量測
    let settle = null
    let probed
    if (settleFrames > 0 || probe) {
      const args = { frames: settleFrames, capMs: settleTimeoutMs, includeParent: Boolean(previewFrame) }
      const result = probe
        // 把兩支頁面函式接成同一個運算式,probe 才會在最後一個靜止影格的同一個 task 裡執行(Playwright 本身也是以原始碼序列化頁面函式)
        ? await target.evaluate(`(${waitForQuietFrames.toString()})(${JSON.stringify(args)}).then(async (s) => s.ok ? { ...s, probe: await (${probe.toString()})(${JSON.stringify(probeArg ?? null)}) } : s)`)
        : await target.evaluate(waitForQuietFrames, args)
      if (result.parentUnreadable) {
        throw instrument('dom-not-settled', `讀不到 preview iframe 外層的管理介面文件(跨來源?)—— 證明不了管理介面已靜止,不能當成「它沒動」`, { phase })
      }
      if (!result.ok) {
        throw instrument('dom-not-settled', `渲染完成後 ${settleTimeoutMs / 1000} 秒內版面沒有連續靜止 ${settleFrames} 個影格(等了 ${result.framesWaited} 格,期間變動 ${result.lateChanges} 次)`, { phase })
      }
      settle = settleFrames > 0 ? { framesWaited: result.framesWaited, lateChanges: result.lateChanges, longestBrokenQuiet: result.longestBrokenQuiet } : null
      probed = result.probe
    }

    // 10. 等待期間冒出的例外 / 失敗也要算
    if (waitFor || beforeSettle || settleFrames > 0 || requestsSettled) await assertHealthy()

    // frame = 量測所在的 Frame(previewFrame 模式是 preview iframe 的內容框架;一般是主框架)
    return { storyId: label, storybook, phase, ms: Date.now() - t0, settle, probe: probed, frame: target === page ? page.mainFrame() : target }
  } finally {
    page.off('framenavigated', onFrameNavigated)
    page.off('request', onRequest)
    page.off('response', onResponse)
    page.off('requestfailed', onRequestFailed)
    page.off('requestfinished', onRequestFinished)
    monitor?.dispose()
  }
}
