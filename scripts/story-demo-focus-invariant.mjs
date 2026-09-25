#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 每一支 story 載入(含 play)之後,若沒有宣告 `parameters.demoFocus = 'keep'`,畫面上不會留著一個被瀏覽器判成
 *        鍵盤焦點(`:focus-visible`)而且真的畫出 outline 的元素 —— 示範 = 滑鼠使用者(user 2026-09-23:「我不要用滑鼠看
 *        範例結果直接就看到鍵盤焦點,我當下明明就沒有用鍵盤操作」)。放掉焦點的事由 storybook-config preview.tsx
 *        `settleDemoFocus` 做,本閘只驗它有做到;它會把當次模式寫在 `<html data-demo-focus>`(mouse | keep),
 *        沒有這個屬性 = 預覽層沒跑到,以儀器失效紅,不當綠燈。SSOT ds-canonical/rules/story-rules.md「示範 = 滑鼠使用者」。
 *   紅: 任一支非 keep 的 story 留著畫得出線的 :focus-visible → exit 1,逐支列出 story id / 焦點元素 / outline;
 *        任一支載入後沒有 data-demo-focus → exit 1(儀器失效);任一支沒渲染完成(共用 openStory 丟 StoryRenderInstrumentError:
 *        story 檔 404 / play 丟錯 / 收尾章等不到 / 版面不靜止)→ 印 INSTRUMENT-FAIL、點名 story、附同源 404 帳本、exit 1
 *        (不是產品裁決,也不算通過);一支都沒量到也是 INSTRUMENT-FAIL。
 *        --selftest:對一支 keep 的 story 量到焦點框、同一份量測改成 mode=mouse 必須判成違規、**真鍵盤** Tab 造出的框必須被判違規、
 *        缺屬性判儀器失效、不存在的 story 必須落進儀器失效(不得被量成 ok)、CPU 節流 30 倍時「固定睡眠」量不到 play 跑完而
 *        共用 openStory 等得到 —— 儀器看得到框、也會因它而紅,而且與機器快慢無關。
 *   綠: 全部 story 逐支載入,零違規、零缺屬性、零儀器失效;同一份 storybook-static 重複跑結果恆等(無取樣、無時鐘)。
 *
 * Run: `node scripts/story-demo-focus-invariant.mjs [--limit=N] [--concurrency=4] [--selftest]`(需先 build-storybook)
 *   --concurrency = 同時開幾個**瀏覽器**(每個瀏覽器只開一個分頁,見下方 runScan 的註解)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import {
  gotoStory, INSTRUMENT_FAIL_MARKER, launchBrowser, launchBrowserOrSkip, openStory, requireStorybookBuild, StoryRenderInstrumentError,
} from './lib/launch-browser.mjs'

const ARGS = process.argv.slice(2)
const SELFTEST = ARGS.includes('--selftest')
const arg = (name, fallback) => { const hit = ARGS.find((a) => a.startsWith(`${name}=`)); return hit ? hit.slice(name.length + 1) : fallback }
const LIMIT = Number(arg('--limit', '0')) || 0
const CONCURRENCY = Math.max(1, Number(arg('--concurrency', '4')) || 4)
const STATIC = join(process.cwd(), 'storybook-static')
const VIEWPORT = { width: 1280, height: 900 }

/** 純判定(供 selftest 兩面對照):量到的焦點狀態 + 預覽層宣告的模式 → 這支 story 算不算違規 */
export function classifyDemoFocus({ mode, focusVisible, painted }) {
  // 'instrument' = 預覽層把這次載入當成儀器關掉了(沒帶 demoFocus=on)—— 對本閘而言等同沒跑到,一樣以儀器失效紅
  if (mode !== 'mouse' && mode !== 'keep') return 'instrument-missing'
  if (mode === 'keep') return 'keep'
  return focusVisible && painted ? 'violation' : 'ok'
}

// 頁面端量測(以原始碼序列化傳進頁面:不得引用外部變數)。主掃描把它當 openStory 的 probe,在最後一個靜止影格的同一個 task 裡量。
const measureInPage = () => {
  const a = document.activeElement
  const mode = document.documentElement.dataset.demoFocus ?? null
  if (!a || a === document.body) return { mode, focusVisible: false, painted: false, tag: 'BODY', text: '' }
  const s = getComputedStyle(a)
  return {
    mode,
    focusVisible: a.matches(':focus-visible'),
    painted: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0,
    tag: a.tagName,
    text: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 40),
    outline: `${s.outlineWidth} ${s.outlineStyle}`,
  }
}
const measure = (page) => page.evaluate(measureInPage)

// 沒有建置 → MISSING-BUILD exit 2(缺前置;夜間 gate-meta lane 的拋棄式快照裡本來就沒有,scripts/lib/gate-selftest-meta.mjs 認這個標記)
requireStorybookBuild(join(STATIC, 'index.json'))
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再用 serveStaticDir 讀活的 storybook-static、固定 6191 埠 ——
// 2026-09-24 別的 agent 同時 build-storybook 清空輸出目錄,讀活目錄的閘把「儀器沒拿到檔」讀成「story 載入失敗」。
// 快照不完整 / 複製期間被重建 → 這裡丟 INSTRUMENT-FAIL(不是產品裁決)。
const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
const stopServer = () => server.stop()
// 直接開 iframe.html 時預覽層把自己當儀器關掉(見 preview.tsx demoFocusEnabled);本閘要看的正是 user 在管理介面看到的畫面 → 帶 on
const storyUrl = (id) => `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&demoFocus=on`

// 開 story 並量:「這則 story 真的渲染完成了」一律交給共用的 openStory(lib/launch-browser.mjs;M17 —— 這裡原本有一支同名的
// 本地 openStory 遮住共用那支,自己等「根節點出現 → 收尾章 → 再睡 300ms」)。等待的訊號:
//   1. Storybook 回報這一則渲染完成(render phase = finished,排在 play 與 afterEach 之後);錯誤頁 / 無預覽 / play 丟錯 → 儀器失效
//   2. waitFor = 示範收尾章 `<html data-demo-focus-settled="<story id>">`(preview.tsx sharedAfterEach 在 settleDemoFocus 之後蓋):
//      直接量本閘依賴的那件事 ——「這一則的示範收尾真的跑過」,不是從 phase 推論(M37)。2026-09-24 main 09d2eaa2 慢 runner 上
//      Toast 朗讀區域 story 的 play 還沒跑完閘就在 900ms 量了 → 假紅;play 丟錯的 story 沒有這個章 → 儀器失效(不放行)。
//   3. settleFrames:收尾之後連續 SETTLE_FRAMES 個影格無 DOM 變動、無進行中的有限長度動畫 —— 取代原本章之後的固定 300ms
//      (給 Radix 還焦點 / Dialog 聚焦捲動區那類收尾後的程式聚焦;監聽器會放掉它們,量的是放掉之後)。用影格不用毫秒:
//      機器慢只會等久一點,不會提早取樣。20 格在 60fps 下 ≈ 333ms,不短於原本的觀察窗。
//   4. probe = measureInPage:在最後一個靜止影格的同一個 task 裡量,量完之前頁面不再跑任何東西。
// 等不到任一項 → StoryRenderInstrumentError(訊息開頭就是 INSTRUMENT-FAIL、點名 story、附 404),呼叫端歸進「儀器失效」。
const SETTLE_FRAMES = 20
const SETTLED_TIMEOUT_MS = 60_000
const settledStamp = (storyId) => document.documentElement.dataset.demoFocusSettled === storyId
async function inspectStory(page, id, extra = {}) {
  const { probe } = await openStory(page, storyUrl(id), {
    waitFor: settledStamp, waitForArg: id,
    settleFrames: SETTLE_FRAMES, probe: measureInPage,
    timeoutMs: SETTLED_TIMEOUT_MS, notFound: server.notFound, ...extra,
  })
  return probe
}

async function runSelftest(browser) {
  const page = await browser.newPage({ viewport: VIEWPORT })
  // 對照組 1:keep 的 story 自己就帶著焦點框(play 裡 .focus());儀器必須量到「有框」
  const kept = await inspectStory(page, 'design-system-components-button-展示--hover-focus-state')
  const seesRing = kept.mode === 'keep' && kept.focusVisible && kept.painted
  console.log(`${seesRing ? '✓' : '✗'} 對照組 keep:儀器量到焦點框(${JSON.stringify(kept)})`)
  // 對照組 2:同一份量測若模式是 mouse,判定必須是違規(閘會因此紅)
  const verdict = classifyDemoFocus({ ...kept, mode: 'mouse' })
  console.log(`${verdict === 'violation' ? '✓' : '✗'} 對照組 mouse:同一個框判成違規(得 ${verdict})`)
  // 對照組 3:真鍵盤 Tab 在一支滑鼠模式的 story 上造出框 → 量得到、判違規。
  // 原本是「根節點出現 + 固定睡 600ms」再按 Tab —— 正是對照組 6 證明不可靠的那種代理;改成先等收尾完成(同一支 inspectStory),
  // 按 Tab 之後等「焦點真的落在某個元素上」,不睡固定毫秒。
  const before = await inspectStory(page, 'design-system-components-button-展示--default')
  const cleanBefore = classifyDemoFocus(before) === 'ok'
  console.log(`${cleanBefore ? '✓' : '✗'} 對照組 Tab(前):收尾完成時沒有框(${JSON.stringify(before)})`)
  await page.keyboard.press('Tab')
  const landed = await page.waitForFunction(() => document.activeElement && document.activeElement !== document.body, null, { timeout: 10_000 })
    .then(() => true, () => false)
  const tabbed = await measure(page)
  const tabVerdict = classifyDemoFocus(tabbed)
  const tabOk = landed && tabbed.focusVisible && tabbed.painted && tabVerdict === 'violation'
  console.log(`${tabOk ? '✓' : '✗'} 對照組 Tab:真鍵盤造出的框被判違規(${JSON.stringify(tabbed)} → ${tabVerdict})`)
  // 對照組 4:沒有 data-demo-focus = 儀器失效
  const missing = classifyDemoFocus({ mode: null, focusVisible: false, painted: false })
  console.log(`${missing === 'instrument-missing' ? '✓' : '✗'} 對照組 缺屬性:判成儀器失效(得 ${missing})`)
  // 對照組 5:不存在的 story → 主掃描用的同一支 inspectStory 必須丟 StoryRenderInstrumentError(點名該 id、聲明不是產品裁決),
  // 不得回一份量測(那會被判成 ok = 假綠)。這裡是**預期中的**儀器失效,只印種類不印標記字 —— 標記字會讓 meta-test 把整個
  // selftest 讀成儀器失效。
  const ghostId = 'design-system-components-button-展示--no-such-story-for-demo-focus-selftest'
  let ghostOk = false; let ghostSaw = ''
  try { ghostSaw = `回了一份量測 ${JSON.stringify(await inspectStory(page, ghostId, { timeoutMs: 20_000 }))}` } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    ghostOk = error.storyId === ghostId && error.message.includes('不是產品裁決')
    ghostSaw = `kind=${error.kind}`
  }
  console.log(`${ghostOk ? '✓' : '✗'} 對照組 不存在的 story:落進儀器失效、點名該 id(${ghostSaw})`)
  // 對照組 6(與機器速度無關的證明,2026-09-24):把 CPU 節流 30 倍再開 Toast 朗讀區域 story —— 它的 play 會點好幾顆按鈕。
  // (a) 舊代理「根節點出現 + 900ms」量到的時候,收尾章還沒蓋(play 還在跑);(b) 共用 openStory 等到渲染完成 + 收尾章 + 靜止再量 → 乾淨。
  // 兩面都成立才算儀器有效。(a) 刻意呼叫共用 gotoStory 的固定睡眠形狀,重現被淘汰的那個代理。
  const toastId = 'design-system-components-toast-展示--live-region-contract'
  let throttled = false
  try { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 30 }); throttled = true } catch { /* 無 CDP 就跳過這組,但要講出來 */ }
  let earlyOk = false; let lateOk = false
  if (throttled) {
    await gotoStory(page, storyUrl(toastId), { waitFor: '#storybook-root > *', settle: 900 })
    const early = await page.evaluate(() => document.documentElement.dataset.demoFocusSettled ?? null)
    earlyOk = early === null
    console.log(`${earlyOk ? '✓' : '✗'} 對照組 節流:根節點出現 + 900ms 時收尾章還沒蓋(章=${early})—— 固定睡眠量不到 play 跑完`)
    // 節流下影格也變慢:把「等不到」的上限放寬(只是上限,成功仍由訊號本身決定)
    const late = await inspectStory(page, toastId, { timeoutMs: 120_000, settleTimeoutMs: 120_000, navigationTimeoutMs: 120_000 })
    lateOk = classifyDemoFocus(late) === 'ok'
    console.log(`${lateOk ? '✓' : '✗'} 對照組 節流:共用 openStory 等到渲染完成 + 收尾章 + 靜止再量 → 乾淨(${JSON.stringify(late)})`)
  } else {
    console.log('✗ 對照組 節流:這個瀏覽器沒有 CDP 節流,無法證明「等訊號」與機器速度無關')
  }
  await page.close()
  return seesRing && verdict === 'violation' && cleanBefore && tabOk && missing === 'instrument-missing' && ghostOk && earlyOk && lateOk ? 0 : 1
}

async function runScan(firstBrowser) {
  const index = JSON.parse(readFileSync(join(server.snapshot.dir, 'index.json'), 'utf8'))
  let ids = Object.values(index.entries ?? {}).filter((e) => e.type === 'story').map((e) => e.id)
  if (LIMIT) ids = ids.slice(0, LIMIT)
  // 0 支 story = index 壞了,不是「沒有違規」(M37:沒觀察到 ≠ 沒發生)
  if (ids.length === 0) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:storybook-static/index.json 裡沒有任何 story —— 儀器失效,不當綠燈`); return 1 }
  const violations = []; const missing = []; const instrument = []; let kept = 0; let clean = 0; let done = 0
  const queue = ids.slice()
  // 一個瀏覽器只開一個分頁(lib/launch-browser.mjs:沙箱下 Chromium 以 --single-process 啟動,開不了第二個 context,
  // 同一個 context 內開多個分頁也不穩)。原本是一個 context 裡同時開 4 個分頁;要並行就開多個瀏覽器,各自一個分頁。
  // 第一個瀏覽器已由 launchBrowserOrSkip 起好(起不來的政策在那裡);其餘起不來就少一個 worker —— 佇列照樣由其他 worker 全部量完,
  // 完整性由最後的「量到 + 儀器失效 = 全部」把關,不靠 worker 數。
  const browsers = [firstBrowser]
  for (let k = 1; k < CONCURRENCY; k++) {
    try { browsers.push(await launchBrowser()) } catch (error) {
      console.log(`  · 第 ${k + 1} 個瀏覽器起不來(${String(error?.message || error).split('\n')[0]}),以 ${browsers.length} 個 worker 繼續`)
      break
    }
  }
  const worker = async (browser, k) => {
    let page
    try { page = await browser.newPage({ viewport: VIEWPORT }) } catch (error) {
      // 開不了分頁 = 這個 worker 沒有量任何東西;佇列留給其他 worker,最後的完整性檢查會抓到沒輪到的
      console.log(`  · 第 ${k + 1} 個瀏覽器開不了分頁(${String(error?.message || error).split('\n')[0]}),這個 worker 不量`)
      return
    }
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        const m = await inspectStory(page, id)
        const verdict = classifyDemoFocus(m)
        if (verdict === 'violation') violations.push({ id, ...m })
        else if (verdict === 'instrument-missing') missing.push(id)
        else if (verdict === 'keep') kept += 1
        else clean += 1
      } catch (error) {
        if (error instanceof StoryRenderInstrumentError) instrument.push({ id, message: error.message })
        else instrument.push({ id, message: `${INSTRUMENT_FAIL_MARKER} story「${id}」沒有量到 —— ${String(error?.message || error).split('\n')[0].slice(0, 200)}` })
        // 分頁 / 瀏覽器掛了(--single-process 下分頁崩 = 整個瀏覽器崩):這個 worker 停手,不再把佇列裡的 story 一支支吃成失敗
        if (page.isClosed() || !browser.isConnected()) break
      }
      done += 1
      if (done % 100 === 0) console.log(`  … ${done}/${ids.length}`)
    }
    if (!page.isClosed()) await page.close().catch(() => {})
  }
  try {
    await Promise.all(browsers.map(worker))
  } finally {
    await Promise.all(browsers.slice(1).map((b) => b.close().catch(() => {})))
  }
  const measured = violations.length + missing.length + kept + clean
  const unmeasured = ids.length - measured - instrument.length
  console.log(`掃了 ${ids.length} 支(${browsers.length} 個瀏覽器):乾淨 ${clean} / keep ${kept} / 違規 ${violations.length} / 缺 data-demo-focus ${missing.length} / 儀器失效 ${instrument.length}${unmeasured ? ` / 沒輪到 ${unmeasured}` : ''}`)
  for (const v of violations) console.log(`✗ ${v.id}:留著鍵盤焦點框 <${v.tag}>「${v.text}」outline ${v.outline}`)
  for (const id of missing) console.log(`✗ ${id}:載入後沒有 <html data-demo-focus>(預覽層 settleDemoFocus 沒跑到 —— 儀器失效)`)
  for (const f of instrument) console.log(`✗ ${f.message}`)
  if (instrument.length || unmeasured) {
    const notFound = [...new Set(server.notFound)]
    console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrument.length + unmeasured} 支 story 沒量到(儀器失效:沒量到,不是產品裁決,也不算通過)${notFound.length ? `;同源 404 帳本:${notFound.join(', ')}` : ''}`)
  }
  // 一支都沒量到 ≠ 沒有違規(M37)
  if (measured === 0) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${ids.length} 支 story 一支都沒量到 —— 不當綠燈`); return 1 }
  const exitCode = violations.length || missing.length || instrument.length || unmeasured ? 1 : 0
  if (exitCode === 0) console.log('✅ 示範 = 滑鼠使用者:沒有任何 story 在沒用鍵盤時留著鍵盤焦點框')
  return exitCode
}

// 起不了 Chromium:一般環境 SKIPPED-ENV exit 0;GOVERNANCE_BROWSER_REQUIRED=1 的 CI 瀏覽器 job → exit 1(lib/launch-browser.mjs)
const browser = await launchBrowserOrSkip({}, { cleanup: stopServer })
let exitCode = 1
try {
  if (!server.snapshot) throw new Error(`${INSTRUMENT_FAIL_MARKER}: ${STATIC} 沒有被凍結成建置快照 —— 無法證明量的是單一建置`)
  exitCode = SELFTEST ? await runSelftest(browser) : await runScan(browser)
} catch (error) {
  // selftest 裡預期之外的 openStory 失敗(例:keep / default / Toast story 開不起來)也是儀器失效:不得讀成「對照組被抓到」
  if (!(error instanceof StoryRenderInstrumentError)) throw error
  const notFound = [...new Set(server.notFound)]
  console.log(`✗ ${error.message}${notFound.length ? `;同源 404 帳本:${notFound.join(', ')}` : ''}`)
  exitCode = 1
} finally {
  await browser.close(); await stopServer()
}
process.exit(exitCode)
