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
//   requireFreshStorybookBuild(STATIC, ['packages/design-system/src/components/X/x.tsx'])   // 沒有建置 → MISSING-BUILD;建置比原始碼舊 → STALE-BUILD exit 2(唯一實作,見該函式)
//   await openStory(page, url, { … })                            // 開 story 並證明真的渲染完成(見下方 openStory 區塊;含圖片就緒)
//   await openStory(page, url, { demoImages: 'network' })        // 要跟已提交基準圖比 / 寫基準 / 給人看的截圖:示範圖照常向遠端要真圖
//   const ledger = trackImageRequests(page)                      // 互動之後要截圖:互動前開帳本 ……
//   await waitForImages(page, { ledger }); ledger.dispose()       // …… 互動後等每張圖載完、解碼完,再等版面靜止(與 openStory 同一份判定)
//   describeDeterministicImageFailures(r.images.deterministicFailures, { label })   // 拍照 / 寫基準的程式:確定性破圖照拍,但一定印出來
//   await waitForStoryRender(frame, { storyId })                 // 不是導覽觸發的切換(管理介面點側欄)也用同一份判定
//   await settleAfterInteraction(page, { frames: 10 })           // 點開浮層 / 按鍵之後等版面真的停了(取代固定睡眠;ok:false = 儀器失效)
//   await waitForDocsRender(frame, { docsId, timeoutMs })        // docs 頁真的渲染出來(docs 沒有 story 的 render phase,判定見該函式)
//   const at = await ownSurfacePosition(handle)                  // 觸發欄位自己的表面(不在 Tag / 頭像 / 按鈕上);交給 handle.click({ position: at.position })
//   await parkPointer(page)                                      // 開關浮層之後把指標停到中性位置(不留在會滑過開卡片的東西上)

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
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
// requireFreshStorybookBuild —— 「建置存在、而且不比被驗的原始碼舊」的**唯一**實作(2026-09-27,待辦總帳 C5)
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼收成一支**:此前 16 支瀏覽器閘各自寫一份 stale-build 守衛,寫法五花八門 ——
//   · 拿來比的建置檔不同(index.html / index.json / iframe.html 三種);
//   · 有的印 STALE-BUILD exit 2(gate-selftest-meta 認得 → 略過),有的印自己的句子 exit 1(header-tabs-slot、
//     storybook-smoke-test:meta-test 把「建置過時」讀成**閘紅**);
//   · 兩支用 `existsSync(f) && …` 包住 —— 原始碼一改名,守衛就**靜靜關掉**(M37:「守衛存在」被當成「守衛在跑」);
//   · 有的遞迴掃整棵 src、有的只列幾個檔、有的只掃一層目錄。
// 修一份其他十五份不會跟著好,正是 M17 禁止的平行實作。
//
// 判準(要保證的性質逐字):**建置目錄裡最早寫出的那個輸出檔,不早於任何一個被列出的原始碼(檔或整棵目錄下的 .ts/.tsx/.css)的最後修改時間。**
//   · 建置時間取 iframe.html / index.html / index.json 三者中**最早**的 mtime(最保守:建置開始寫輸出之後改的原始碼一律算過時);
//   · 三者都不存在 → MISSING-BUILD exit 2(缺前置);
//   · 列出的原始碼**不存在 → exit 1、印明確訊息**(這是閘自己設定錯,不是缺前置也不是產品;不准用 existsSync 靜默放行);
//   · 任一原始碼比建置新 → STALE-BUILD exit 2(缺前置;點名最新的那個檔)。
// 目錄遞迴時跳過 node_modules / dist。
//
// 用法:
//   requireFreshStorybookBuild(STATIC, ['packages/design-system/src/components/DataTable/data-table.tsx'])
//   requireFreshStorybookBuild(STATIC, ['packages/design-system/src', 'src'], { hint: '先跑 npm run build-storybook' })
//   const { builtAtMs, newest } = requireFreshStorybookBuild(…)   // 過了才回來;newest = { path, mtimeMs }
// 原始碼路徑相對於 repo 根(本檔的上上層),或絕對路徑。
const BUILD_OUTPUT_MARKERS = ['iframe.html', 'index.html', 'index.json']
const SOURCE_FILE_RE = /\.(tsx?|css)$/u
const SOURCE_SKIP_DIRS = new Set(['node_modules', 'dist'])
const REPO_ROOT_FOR_BUILD_CHECK = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function newestSourceUnder(path, acc) {
  const info = statSync(path)
  if (info.isDirectory()) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!SOURCE_SKIP_DIRS.has(entry.name)) newestSourceUnder(join(path, entry.name), acc) }
      else if (SOURCE_FILE_RE.test(entry.name)) { const m = statSync(join(path, entry.name)).mtimeMs; if (m > acc.mtimeMs) { acc.mtimeMs = m; acc.path = join(path, entry.name) } }
    }
  } else if (info.mtimeMs > acc.mtimeMs) { acc.mtimeMs = info.mtimeMs; acc.path = path }
}

/**
 * @param {string} staticDir 建置目錄
 * @param {string[]} sources 被驗的原始碼(檔或目錄;相對 repo 根或絕對路徑)—— 空陣列是 TypeError:沒列原始碼的「新鮮度」守衛守不了任何東西
 * @param {{ hint?: string }} [options]
 * @returns {{ builtAtMs: number, newest: { path: string, mtimeMs: number } }}
 */
export function requireFreshStorybookBuild(staticDir, sources, { hint = '先跑 `npm run build-storybook`' } = {}) {
  if (!Array.isArray(sources) || sources.length === 0) throw new TypeError('requireFreshStorybookBuild:sources 必須是非空陣列(要守哪些原始碼)')
  const outputs = BUILD_OUTPUT_MARKERS.map((name) => join(staticDir, name)).filter((path) => existsSync(path))
  if (outputs.length === 0) requireStorybookBuild(join(staticDir, 'index.json'), hint) // 不會回來(exit 2)
  const builtAtMs = Math.min(...outputs.map((path) => statSync(path).mtimeMs))
  const newest = { path: '', mtimeMs: -Infinity }
  for (const source of sources) {
    const path = isAbsolute(source) ? source : join(REPO_ROOT_FOR_BUILD_CHECK, source)
    if (!existsSync(path)) {
      console.error(`✗ stale-build 守衛設定錯:列出的原始碼不存在 ${source} —— 原始碼改名 / 搬家後守衛等於關掉,這是閘自己的錯(不是缺前置、不是產品裁決)`)
      process.exit(1)
    }
    newestSourceUnder(path, newest)
  }
  if (newest.mtimeMs > builtAtMs) {
    const rel = newest.path.startsWith(REPO_ROOT_FOR_BUILD_CHECK) ? newest.path.slice(REPO_ROOT_FOR_BUILD_CHECK.length + 1) : newest.path
    console.error(`✗ ${STALE_BUILD_MARKER}:${rel} 比 ${staticDir} 新(原始碼 ${new Date(newest.mtimeMs).toISOString()} > 建置 ${new Date(builtAtMs).toISOString()})—— ${hint}(缺前置,不是產品裁決)`)
    process.exit(2)
  }
  return { builtAtMs, newest }
}

// ═══════════════════════════════════════════════════════════════════════════
// 圖片就緒 —— 「量到 / 拍到的畫面裡每張圖都載完、解碼完」的**唯一**實作(2026-10-14,待辦總帳 R1e / R3)
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼有這段**:openStory 原本的「渲染完成」只證明 Storybook 回報 finished、DOM 連續 N 影格沒變 —— 而圖片下載完成
// **不改 DOM**,影格靜止判定看不到它。遠端示範圖(picsum.photos / i.pravatar.cc)一慢,兩種症狀其實是同一個病根(M37):
//   · visual-audit 只靠「DOM 不動」:PR 分支重拍 run 38502930713 的穩定性複拍,fileviewer-open-snapshot.png 差 68.7% ——
//     第二張拍到 FileViewer 的灰底舞台(picsum 的圖還沒到、fit-to-page 還沒算,縮放停在 100%;基準圖是 94% 的小狗);
//   · 效能閘改用 requestsSettled(「渲染期間的請求全部結束」= 網路層的代理)等頭像:roadmap story 唯一的外部請求就是
//     6 張 i.pravatar.cc 頭像,每趟量測跟著那台第三方主機的快慢走(R1e:CI 431 趟裡 229 趟多等約 30 秒)。
// 「圖已經畫在畫面上」從沒被直接量過:一個用「DOM 不動」代理、一個用「請求結束」代理。
//
// 要保證的性質(逐字):**量測 / 截圖當下,畫面範圍內每一張 <img> 與 CSS 背景圖(含 ::before / ::after)都
// complete、naturalWidth > 0、decode() 完成;本文件發出的每一個圖片請求都已有結果。** 等不到 → 儀器失效(image-timeout),
// 載入失敗 → 儀器失效(image-failed),兩者都點名網址 —— 絕不靜默拍成灰底,也絕不變成假差異。
// 「畫面範圍」= 與視窗相交、checkVisibility() 為真;載入中的 <img> 還沒有尺寸(0×0),只要左上角落在視窗內就算。
// 帳本(trackImageRequests)補 DOM 看不到的兩種:載入失敗後元件自己把 <img> 拆掉(Avatar onError 退回縮寫)、
// 以及不掛進 DOM 的 new Image() 預載。帳本只記「本文件發出的 image 類請求」,不是「網路閒置」。
//
// 失敗分兩類(判準:**換一個環境,結果會不會變**):
//   · 環境性 → 儀器失效:遠端主機連不到 / DNS 失敗 / 逾時 / 回 4xx、5xx、同源請求連線層失敗 ——
//     拍下來的是這台機器這一刻的網路,不是 story 的樣子;
//   · 確定性 → 照拍,列在回傳的 deterministicFailures:RFC 2606 / 6761 / 6762 保留名稱(.invalid / .test / .example /
//     .local、example.com/.net/.org —— 任何環境都解析不到,Avatar「圖片失敗退回縮寫」的示範刻意用它)、同源 HTTP 錯誤
//    (靜態建置本身沒有那個檔,每個環境都一樣 —— avatar.stories.tsx 的 __avatar-fallback-missing__.jpg)、data: / blob:、
//     示範圖主機上**真站沒有這種網址**的圖(demoImageRoute 回 missing,見下)。確定性失敗不擋,但拍照 / 寫基準的程式
//     必須把它印出來(describeDeterministicImageFailures)—— 照拍不等於靜默拍下。
//
// **示範圖主機**(DEMO_IMAGE_HOSTS)有兩種取法(openStory 的 demoImages):
//   · 'local'(預設):在瀏覽器裡把這些主機的 Image 請求就地換成**同尺寸**的本機合成圖(尺寸照網址:picsum 的 /W/H、
//     pravatar 的 /S)。用 CDP Fetch、**只攔這幾個主機的 Image 請求**:不關 HTTP 快取、不攔其他請求 —— Playwright 的
//     page.route 兩件都會做(實測:有 route 時 roadmap 捲動期間每一列新頭像都重新請求一次,361 次;沒有 route 時 0 次)。
//     自然尺寸與 CI 載到真圖時相同、與任何網路無關 —— 給一切**不跟已提交基準圖比**的閘(幾何、行為、效能、同一跑之內的前後比對);
//   · 'network':照常向遠端要真圖 —— 給**跟已提交基準圖比、寫基準、或給人看**的截圖(visual-audit、story-screenshots、
//     peoplepicker-baseline):基準圖裡是真圖,換成合成圖等於改基準(R3:要 user 逐張核准)。連不到就是儀器失效,點名網址。
// 本機代換只模仿**真站本來就會給的圖**(網址 → 真站行為的模型 demoImageRoute,2026-10-14 逐一以 curl 實測):
//   · image  → 真站回這個尺寸的圖 → 'local' 回同尺寸合成圖;
//   · missing → 真站對這種網址回不出圖(404 / 400 / 不是圖)→ 'local' 就地回 404(不放行到網路),兩種取法都判確定性 ——
//     每個環境都一樣破,不能替它捏造一張圖(否則同一則 story 兩種取法判定相反:本機「載到了」、遠端「破圖」);
//   · null   → 真站行為不在模型裡(例:/id/<n> 要看站上圖庫有沒有那張、尺寸 0 = 原圖尺寸)→ 照常走網路、照上面的規則判。
// 不在表裡的遠端主機一律照常走網路(新增示範圖主機 → 加進表,並附實測過的網址 → 真站行為模型)。

/** RFC 2606 §2 / RFC 6761 §6.2、§6.4 / RFC 6762:任何環境都解析不到的頂層名稱(.local 是鏈路本地 mDNS,不是可路由的公開主機)。 */
export const UNREACHABLE_IMAGE_TLDS = Object.freeze(['invalid', 'test', 'example', 'local'])
/** RFC 2606 §3:保留給文件範例的網域(含子網域)。 */
export const RESERVED_EXAMPLE_DOMAINS = Object.freeze(['example.com', 'example.net', 'example.org'])

/** 主機名是否在任何環境都不會有真的圖(RFC 保留名稱)。 */
export function isReservedImageHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '')
  if (!host) return false
  const tld = host.slice(host.lastIndexOf('.') + 1)
  return UNREACHABLE_IMAGE_TLDS.includes(tld) || RESERVED_EXAMPLE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

/**
 * 一筆圖片失敗是「確定性」(每個環境都一樣 → 照拍)還是「環境性」(取決於這台機器的網路 → 儀器失效),附理由。純函式。
 * @param {string} url
 * @param {{ origin?: string|null, how?: 'http'|'network'|'broken' }} context  how:http = 有 HTTP 回應(≥ 400);network = 連線層失敗;broken = 頁面端看到壞圖
 * @returns {{ verdict: 'deterministic'|'environmental', because: string }}
 */
export function explainImageFailure(url, { origin = null, how = 'broken' } = {}) {
  let parsed
  try { parsed = new URL(url) } catch { return { verdict: 'environmental', because: '網址解析不了' } }
  if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return { verdict: 'deterministic', because: `${parsed.protocol} 內嵌圖本身壞了` }
  if (isReservedImageHost(parsed.hostname)) return { verdict: 'deterministic', because: 'RFC 保留名稱,任何環境都解析不到' }
  // 示範圖主機上真站沒有這種網址:每個環境都破(連線層失敗也一樣 —— 連得上也只會拿到 404 / 400)
  const route = demoImageRoute(url)
  if (route?.kind === 'missing') return { verdict: 'deterministic', because: `示範圖主機沒有這種網址的圖 —— ${route.why}` }
  // 同源:HTTP 錯誤 / 壞圖 = 建置本身就是這樣;連線層失敗 = 伺服器這一刻出事(環境)
  if (origin && parsed.origin === origin) {
    return how === 'network' ? { verdict: 'environmental', because: '同源請求連線層失敗' } : { verdict: 'deterministic', because: '同源:建置裡沒有這個檔' }
  }
  return { verdict: 'environmental', because: '遠端圖載不到(取決於這台機器這一刻的網路)' }
}
/** explainImageFailure 的裁決部分。純函式。 @returns {'deterministic'|'environmental'} */
export function classifyImageFailure(url, context = {}) {
  return explainImageFailure(url, context).verdict
}

// ── 示範圖主機的真站行為模型(2026-10-14 以 curl 逐一實測;改模型前先實測,不准推定)──────────────────────────────
// 本機合成圖的尺寸上限(記憶體):picsum 真站接受到 5000(5000 → 200、5001 → 400),4001–5000 真站有圖但本機不合成 → 照常走網路
const DEMO_IMAGE_MAX_EDGE = 4000
const PICSUM_MAX_EDGE = 5000
const routeMissing = (why) => Object.freeze({ kind: 'missing', why })
const routeImage = (width, height) => Object.freeze({ kind: 'image', width, height })
// picsum.photos(實測):有圖的只有 /<w>[/<h>]、/seed/<一段>/<w>[/<h>]、/id/<n>/<w>[/<h>]、/g/<w>[/<h>],最後一段可帶
// .jpg / .webp(大小寫皆可),可有結尾斜線、尺寸可有前導零;其餘一律回不出圖 ——
//   /seed/inspector-16/9/800/600(seed 帶「/」多一段)404、/seed/<s>(沒尺寸)404、/seed/a/b/200 404、/id/abc/200 404、
//   /SEED/…、/G/… 404、.png / .jpeg 400、任一邊 > 5000 400、/v2/list 與 /id/<n>/info 是 JSON(不是圖)。
// 真站有圖但本機不模仿(→ null,照常走網路):/id/<n>(實測 /id/99999 404 —— 有沒有那張要看站上圖庫)、
// 尺寸 0(實測 /seed/x/0/100 → 5000×100,0 = 原圖尺寸)、4001–5000(超過本機合成上限)。
// fastly.picsum.photos 不在表裡:它只接受 picsum 轉址時簽的網址(實測不帶有效 hmac → 400、其他形狀 → 404),
// 頁面只會經 picsum.photos 的轉址到它,而 'local' 取法直接回圖、不轉址。
function picsumRoute(url) {
  const parts = url.pathname.split('/').filter(Boolean)
  let dims
  let catalogue = false
  if (parts[0] === 'seed') dims = parts.slice(2)
  else if (parts[0] === 'id') {
    if (!/^\d+$/.test(parts[1] ?? '')) return routeMissing('/id/ 後面不是數字')
    dims = parts.slice(2)
    catalogue = true
  } else if (parts[0] === 'g') dims = parts.slice(1)
  else dims = parts
  if (dims.length < 1 || dims.length > 2) return routeMissing(dims.length < 1 ? '沒有尺寸段' : `路徑多了 ${dims.length - 2} 段`)
  const last = dims.length - 1
  const extension = /\.([^./]+)$/.exec(dims[last])
  if (extension && !/^(jpg|webp)$/i.test(extension[1])) return routeMissing(`副檔名 .${extension[1]} 不支援`)
  const edges = dims.map((part, i) => (i === last && extension ? part.slice(0, -extension[0].length) : part))
  if (!edges.every((part) => /^\d+$/.test(part))) return routeMissing('尺寸段不是數字')
  const [width, height = width] = edges.map(Number)
  if (width > PICSUM_MAX_EDGE || height > PICSUM_MAX_EDGE) return routeMissing(`尺寸超過 ${PICSUM_MAX_EDGE}`)
  if (catalogue || width === 0 || height === 0 || width > DEMO_IMAGE_MAX_EDGE || height > DEMO_IMAGE_MAX_EDGE) return null
  return routeImage(width, height)
}
// i.pravatar.cc(實測):/<S> → S×S 正方形,S > 1000 或 S = 0 一律 1000×1000(/1001、/2000、/0 皆 1000×1000);
// 它對任何路徑都回圖(/、/abc、/128/128 皆 200),所以沒有 missing;不是單一數字段的形狀不在模型裡 → 照常走網路
const PRAVATAR_MAX_EDGE = 1000
function pravatarRoute(url) {
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length !== 1 || !/^\d+$/.test(parts[0])) return null
  const requested = Number(parts[0])
  const edge = requested === 0 || requested > PRAVATAR_MAX_EDGE ? PRAVATAR_MAX_EDGE : requested
  return routeImage(edge, edge)
}
/** stories 用來當真實感示範圖的遠端主機 → 「網址 → 真站行為」模型(見上方區塊註解)。 */
export const DEMO_IMAGE_HOSTS = Object.freeze({ 'picsum.photos': picsumRoute, 'i.pravatar.cc': pravatarRoute })

/**
 * 示範圖網址在真站上會得到什麼。純函式。
 * @returns {{ kind: 'image', width: number, height: number } | { kind: 'missing', why: string } | null}
 *   image = 真站回這個尺寸的圖(本機可代換);missing = 真站回不出圖(每個環境都一樣);null = 不是示範圖主機或不在模型裡
 */
export function demoImageRoute(url) {
  let parsed
  try { parsed = new URL(url) } catch { return null }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  const route = DEMO_IMAGE_HOSTS[parsed.hostname]
  return route ? route(parsed) : null
}
/** 示範圖網址的自然尺寸;不是示範圖主機、真站沒有這種網址、或不在模型裡 → null。純函式。 */
export function demoImageSize(url) {
  const route = demoImageRoute(url)
  return route?.kind === 'image' ? { width: route.width, height: route.height } : null
}

// 最小 PNG 編碼(RGB、無交錯):只用 node 內建 —— launch-browser 會被鏡像到 consumer repo(build-published-template-mirror),不新增套件依賴
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0 }
  return table
})()
function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function pngChunk(type, data) {
  const head = Buffer.alloc(4); head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(body))
  return Buffer.concat([head, body, tail])
}
/**
 * 示範圖網址的本機合成圖:自然尺寸 = 網址指定的尺寸,內容 = 由網址雜湊決定的兩色 16px 棋盤格(同一網址每次位元組相同;
 * 有墨跡,不會被「空白偵測」當成白底)。純函式。
 * @returns {Buffer} PNG
 */
export function demoImagePng(url, { width, height }) {
  const digest = createHash('sha256').update(String(url)).digest()
  const a = [digest[0], digest[1], digest[2]]
  const b = a.map((v) => (v + 112) % 256)
  const stride = 1 + width * 3
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = ((x >> 4) + (y >> 4)) & 1 ? b : a
      const at = y * stride + 1 + x * 3
      raw[at] = color[0]; raw[at + 1] = color[1]; raw[at + 2] = color[2]
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(raw, { level: 1 })), pngChunk('IEND', Buffer.alloc(0))])
}
const demoImageBodies = new Map()
function demoImageBody(url, size) {
  let body = demoImageBodies.get(url)
  if (!body) {
    body = demoImagePng(url, size).toString('base64')
    if (demoImageBodies.size > 512) demoImageBodies.clear()
    demoImageBodies.set(url, body)
  }
  return body
}
const DEMO_IMAGE_HEADERS = Object.freeze([
  { name: 'Content-Type', value: 'image/png' },
  { name: 'Cache-Control', value: 'public, max-age=86400' },
  { name: 'Access-Control-Allow-Origin', value: '*' },
])
const DEMO_IMAGE_MISSING_HEADERS = Object.freeze([
  { name: 'Content-Type', value: 'text/plain; charset=utf-8' },
  { name: 'Access-Control-Allow-Origin', value: '*' },
])
const demoImageServers = new WeakMap()
// 每個分頁只能有一種取法:本機代換裝上之後整個分頁生命期都有效,同一頁再要 'network' 會拿到合成圖(或 HTTP 快取裡的),
// 反過來先 'network' 再 'local' 也會讓快取裡的真圖混進來 —— 兩種都是「以為量了 A、其實量了 B」,所以同一頁換取法 = 程式錯誤
const demoImageModes = new WeakMap()

/**
 * 在這個分頁上把示範圖主機的 Image 請求就地換成同尺寸的本機合成圖(語意見區塊註解)。每個分頁只裝一次(重複呼叫回同一份),
 * 之後整個分頁的生命期都有效(互動後才出現的頭像也一樣)。只攔 DEMO_IMAGE_HOSTS 的 Image 請求:真站有圖 → 合成圖;
 * 真站沒有這種網址 → 就地回 404(與真站同樣破,不放行到網路);不在模型裡 → 照常放行。
 * 只支援 Chromium(全部閘都是);裝不起來會丟例外(openStory 把它當儀器失效)。
 * @param {import('playwright').Page} page
 * @returns {Promise<{ served: () => string[], missing: () => string[] }>} served = 已代換的網址;missing = 就地回 404 的網址(皆依序,含重複)
 */
export function serveDemoImagesLocally(page) {
  if (!page || typeof page.context !== 'function') throw new TypeError('serveDemoImagesLocally:page 必須是 Playwright 的 Page')
  const existing = demoImageServers.get(page)
  if (existing) return existing
  if (demoImageModes.get(page) === 'network') throw new TypeError("serveDemoImagesLocally:這個分頁已用 demoImages='network' 開過(HTTP 快取裡有真圖),不能再改成本機代換 —— 換一個瀏覽器 / 分頁")
  demoImageModes.set(page, 'local')
  const installing = (async () => {
    const session = await page.context().newCDPSession(page)
    const served = []
    const missed = []
    session.on('Fetch.requestPaused', async ({ requestId, request }) => {
      try {
        const route = demoImageRoute(request.url)
        if (route?.kind === 'image') {
          served.push(request.url)
          await session.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: DEMO_IMAGE_HEADERS, body: demoImageBody(request.url, route) })
        } else if (route?.kind === 'missing') {
          // 真站對這種網址回不出圖:回 404,不替它捏造一張圖,也不放行到網路(結果與真站相同、與網路無關)
          missed.push(request.url)
          await session.send('Fetch.fulfillRequest', { requestId, responseCode: 404, responseHeaders: DEMO_IMAGE_MISSING_HEADERS, body: '' })
        } else {
          await session.send('Fetch.continueRequest', { requestId })
        }
      } catch { /* 分頁已關或請求已取消:沒有可回應的對象 */ }
    })
    await session.send('Fetch.enable', {
      patterns: Object.keys(DEMO_IMAGE_HOSTS).map((host) => ({ urlPattern: `*://${host}/*`, resourceType: 'Image', requestStage: 'Request' })),
    })
    return Object.freeze({ served: () => [...served], missing: () => [...missed] })
  })()
  demoImageServers.set(page, installing)
  installing.catch(() => demoImageServers.delete(page))
  return installing
}

/**
 * 圖片請求帳本:記下 page 上**之後**發出的 image 類請求(data: / blob: 不算)各自的結果。openStory 內建一份(只算新文件發出的);
 * 互動之後要截圖的呼叫端在互動前開一份,交給 waitForImages。用完一定要 dispose()。
 * @param {import('playwright').Page} page
 * @param {{ accept?: (request: import('playwright').Request) => boolean }} [options]  只記 accept 回真的請求(預設全記)
 */
export function trackImageRequests(page, { accept = () => true } = {}) {
  if (!page || typeof page.on !== 'function') throw new TypeError('trackImageRequests:page 必須是 Playwright 的 Page')
  const pending = new Map()
  const failures = []
  const waiters = new Set()
  const settle = (request) => {
    if (!pending.delete(request)) return
    if (pending.size === 0) for (const wake of waiters) wake()
  }
  const onRequest = (request) => {
    if (request.resourceType() !== 'image' || !accept(request)) return
    const url = request.url()
    if (url.startsWith('data:') || url.startsWith('blob:')) return
    pending.set(request, url)
  }
  const onResponse = (response) => {
    const request = response.request()
    if (pending.has(request) && response.status() >= 400) failures.push({ url: request.url(), how: 'http', why: `HTTP ${response.status()}` })
  }
  const onFinished = (request) => settle(request)
  const onFailed = (request) => {
    if (!pending.has(request)) return
    const errorText = request.failure()?.errorText ?? ''
    // 被中斷 = 頁面不要這張圖了(換 src、元素被拆、換頁),不是載入失敗;還要它的話,畫面上那張 <img> 會由頁面端那半等
    if (!/ERR_ABORTED/.test(errorText)) failures.push({ url: request.url(), how: 'network', why: errorText || '載入失敗' })
    settle(request)
  }
  page.on('request', onRequest)
  page.on('response', onResponse)
  page.on('requestfinished', onFinished)
  page.on('requestfailed', onFailed)
  return Object.freeze({
    pending: () => [...pending.values()],
    failures: () => failures.slice(),
    /** 等到沒有進行中的圖片請求,最多 ms 毫秒;回 true = 都有結果了 */
    whenSettled(ms) {
      if (pending.size === 0) return Promise.resolve(true)
      return new Promise((resolve) => {
        const wake = () => { clearTimeout(timer); waiters.delete(wake); resolve(true) }
        const timer = setTimeout(() => { waiters.delete(wake); resolve(pending.size === 0) }, Math.max(0, ms))
        waiters.add(wake)
      })
    },
    dispose() {
      page.off('request', onRequest)
      page.off('response', onResponse)
      page.off('requestfinished', onFinished)
      page.off('requestfailed', onFailed)
      for (const wake of waiters) wake()
    },
  })
}

// 頁面端:畫面範圍內的每張 <img> 與 CSS 背景圖都載完、解碼完(或確定失敗)。**以 evaluate 序列化傳入,不得引用外部變數。**
// 回 { checked, loaded, items: [{ url, state: 'loaded'|'broken'|'pending', why? }] };不丟例外(判定在節點端)。
function awaitFrameImages({ capMs }) {
  const t0 = performance.now()
  const remaining = () => Math.max(0, capMs - (performance.now() - t0))
  const later = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms))
  const inFrame = (el) => {
    if (!el.isConnected) return false
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true })) return false
    const r = el.getBoundingClientRect()
    return r.right >= 0 && r.bottom >= 0 && r.left <= innerWidth && r.top <= innerHeight
  }
  const isSvg = (url) => /^data:image\/svg\+xml|\.svg(?:[?#]|$)/i.test(url)
  const settleImg = async (img) => {
    const url = img.currentSrc || img.src
    if (!img.complete) {
      const outcome = await Promise.race([
        new Promise((resolve) => {
          img.addEventListener('load', () => resolve('load'), { once: true })
          img.addEventListener('error', () => resolve('error'), { once: true })
        }),
        later(remaining(), 'timeout'),
      ])
      if (outcome === 'timeout' && !img.complete) return { url, state: 'pending', why: `${capMs / 1000} 秒內沒載完` }
    }
    if (img.naturalWidth === 0 && !isSvg(url)) return { url, state: 'broken', why: '載入結束但沒有像素(naturalWidth 0)' }
    try {
      const decoded = await Promise.race([img.decode().then(() => 'ok'), later(remaining(), 'timeout')])
      if (decoded === 'timeout') return { url, state: 'pending', why: '解碼逾時' }
    } catch (error) { return { url, state: 'broken', why: `解碼失敗(${error?.name || 'EncodingError'})` } }
    return { url, state: 'loaded' }
  }
  const settleBackground = async (url) => {
    const probe = new Image()
    probe.src = url
    try {
      const decoded = await Promise.race([probe.decode().then(() => 'ok'), later(remaining(), 'timeout')])
      if (decoded === 'timeout') return { url, state: 'pending', why: `背景圖 ${capMs / 1000} 秒內沒載完` }
    } catch { return { url, state: 'broken', why: '背景圖載入 / 解碼失敗' } }
    return { url, state: 'loaded' }
  }
  return (async () => {
    const imgs = [...document.images].filter((img) => (img.currentSrc || img.getAttribute('src')) && inFrame(img))
    const backgrounds = new Set()
    for (const el of document.querySelectorAll('*')) {
      if (!inFrame(el)) continue
      for (const pseudo of [null, '::before', '::after']) {
        const value = getComputedStyle(el, pseudo).backgroundImage
        if (!value || !value.includes('url(')) continue
        for (const match of value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/g)) {
          const raw = match[1] ?? match[2] ?? match[3]
          if (raw) backgrounds.add(new URL(raw, document.baseURI).href)
        }
      }
    }
    const items = await Promise.all([...imgs.map(settleImg), ...[...backgrounds].map(settleBackground)])
    return { checked: items.length, loaded: items.filter((item) => item.state === 'loaded').length, items }
  })()
}

// 頁面端(同步):畫面範圍內還沒載完的 <img>(靜止判定最後一格用:這時候還有圖在路上 = 還沒到可以量的時候)
function framePendingImages() {
  const inFrame = (el) => {
    if (!el.isConnected) return false
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true })) return false
    const r = el.getBoundingClientRect()
    return r.right >= 0 && r.bottom >= 0 && r.left <= innerWidth && r.top <= innerHeight
  }
  return [...document.images].filter((img) => (img.currentSrc || img.getAttribute('src')) && !img.complete && inFrame(img)).map((img) => img.currentSrc || img.src)
}

/**
 * 頁面端 + 帳本的合併判定(openStory 第 8b 步與 waitForImages 共用,**唯一實作**)。不丟例外,回裁決讓呼叫端用自己的 instrument() 丟。
 * @returns {Promise<{ checked: number, loaded: number, failed: {url:string,why:string}[], pending: {url:string,why:string}[], deterministicFailures: {url:string,why:string}[] }>}
 */
async function judgeImages(target, { ledger, timeoutMs, origin }) {
  const deadline = Date.now() + timeoutMs
  const frame = await target.evaluate(awaitFrameImages, { capMs: timeoutMs })
  const ledgerSettled = ledger ? await ledger.whenSettled(deadline - Date.now()) : true
  const failed = []
  const deterministicFailures = []
  const sort = (url, how, why) => {
    const { verdict, because } = explainImageFailure(url, { origin, how })
    if (verdict === 'deterministic') deterministicFailures.push({ url, why: `${why};${because}` })
    else failed.push({ url, why })
  }
  for (const item of frame.items) if (item.state === 'broken') sort(item.url, 'broken', item.why)
  for (const failure of ledger ? ledger.failures() : []) sort(failure.url, failure.how, failure.why)
  const pending = frame.items.filter((item) => item.state === 'pending').map(({ url, why }) => ({ url, why }))
  if (!ledgerSettled) for (const url of ledger.pending()) pending.push({ url, why: `請求 ${timeoutMs / 1000} 秒內沒有結果` })
  const unique = (list) => [...new Map(list.map((item) => [item.url, item])).values()]
  return { checked: frame.checked, loaded: frame.loaded, failed: unique(failed), pending: unique(pending), deterministicFailures: unique(deterministicFailures) }
}
const describeImages = (list) => list.slice(0, 5).map(({ url, why }) => `${String(url).slice(0, 160)}(${why})`).join('、') + (list.length > 5 ? ` 等 ${list.length} 張` : '')

/**
 * 確定性破圖(照拍、不擋)的一行提示;沒有 → null。拍照 / 寫基準的程式一律印出來(照拍 ≠ 靜默拍下)。純函式。
 * @param {{url:string,why:string}[]|null|undefined} failures  openStory 回傳的 images.deterministicFailures,或 waitForImages 回傳的同名欄位
 * @param {{ label?: string }} [options]
 * @returns {string|null}
 */
export function describeDeterministicImageFailures(failures, { label = '' } = {}) {
  if (!Array.isArray(failures) || failures.length === 0) return null
  return `⚠ ${label ? `${label}:` : ''}畫面裡有 ${failures.length} 張圖在任何環境都載不到(確定性,照拍、不算儀器失效):${describeImages(failures)}`
}

/**
 * 圖片就緒 → 版面靜止 → (可選)同一個 task 裡的量測 —— openStory 第 8b + 9 步與 waitForImages 共用的**唯一實作**。
 * 圖片在前:圖到了才會觸發的版面變動(FileViewer onLoad → fit-to-page → 縮放比例與 transform)要落在靜止判定的觀測窗裡。
 * 靜止的最後一格若還有畫面內的 <img> 沒載完、或帳本又有新的圖片請求在路上(靜止期間才掛上的圖、「先 new Image() 預載、
 * 載完才掛上」的圖)→ 回頭再等、再靜止一次,共用同一個圖片上限;probe 只在「靜止 + 沒有圖在路上」的那一格執行。
 * 不認識呼叫端:失敗一律以 fail(kind, reason) 造出的例外丟出(openStory 附 story / 404 / phase,waitForImages 附 label)。
 * @returns {Promise<{ verdict: object|null, settle: object|null, probe: unknown }>}
 */
async function settleImagesAndFrames(target, { images, ledger, origin, imagesTimeoutMs, settleFrames, settleTimeoutMs, includeParent = false, probe = null, probeArg = null, stage, fail }) {
  const deadline = Date.now() + imagesTimeoutMs
  let verdict = null
  for (;;) {
    if (images) {
      verdict = await judgeImages(target, { ledger, timeoutMs: Math.max(1, deadline - Date.now()), origin })
      if (verdict.failed.length) {
        throw fail('image-failed', `圖片載入失敗(環境性 —— 拍下來的會是這台機器這一刻的網路,不是 story 的樣子):${describeImages(verdict.failed)}`)
      }
      if (verdict.pending.length) throw fail('image-timeout', `${imagesTimeoutMs / 1000} 秒內圖片等不到:${describeImages(verdict.pending)}`)
    }
    if (!(settleFrames > 0 || probe)) return { verdict, settle: null, probe: undefined }
    const args = { frames: settleFrames, capMs: settleTimeoutMs, includeParent }
    // 把頁面函式接成同一個運算式,probe 才會在最後一個靜止影格的同一個 task 裡執行(Playwright 本身也是以原始碼序列化頁面函式)
    const pendingCheck = images ? `const pendingImages = (${framePendingImages.toString()})(); if (pendingImages.length) return { ...s, pendingImages };` : ''
    const finish = probe ? `{ ...s, probe: await (${probe.toString()})(${JSON.stringify(probeArg ?? null)}) }` : 's'
    const result = await target.evaluate(`(${waitForQuietFrames.toString()})(${JSON.stringify(args)}).then(async (s) => { if (!s.ok) return s; ${pendingCheck} return ${finish} })`)
    if (result.parentUnreadable) {
      throw fail('dom-not-settled', `讀不到 preview iframe 外層的管理介面文件(跨來源?)—— 證明不了管理介面已靜止,不能當成「它沒動」`)
    }
    if (!result.ok) {
      throw fail('dom-not-settled', `${stage} ${settleTimeoutMs / 1000} 秒內版面沒有連續靜止 ${settleFrames} 個影格(等了 ${result.framesWaited} 格,期間變動 ${result.lateChanges} 次)`)
    }
    const stillLoading = images ? [...new Set([...(result.pendingImages ?? []), ...(ledger ? ledger.pending() : [])])] : []
    if (stillLoading.length) {
      if (Date.now() >= deadline) {
        throw fail('image-timeout', `${imagesTimeoutMs / 1000} 秒內圖片等不到(版面靜止了,圖還在路上):${describeImages(stillLoading.map((u) => ({ url: u, why: '還沒載完' })))}`)
      }
      continue
    }
    const settle = settleFrames > 0 ? { framesWaited: result.framesWaited, lateChanges: result.lateChanges, longestBrokenQuiet: result.longestBrokenQuiet } : null
    return { verdict, settle, probe: result.probe }
  }
}

/**
 * 互動之後(開浮層、滑過)要截圖 / 量測時用:與 openStory 第 8b + 9 步**同一份**判定(settleImagesAndFrames)——
 * 畫面範圍內每張圖載完、解碼完 → 連續 settleFrames 個影格靜止(圖到了才觸發的版面變化落在觀測窗裡)→
 * 最後一格還有圖在路上(先預載再掛上、靜止期間才掛上)就回頭再等,共用同一個 timeoutMs 上限(語意見「圖片就緒」區塊)。
 * 失敗 / 逾時 → 丟 StoryRenderInstrumentError(kind image-failed / image-timeout / dom-not-settled),訊息點名網址。
 * 限制同 settleAfterInteraction:靠計時器延後超過 settleFrames 個影格才掛上的圖不在保證裡,那種要等元素本身。
 * @param {object} target  Playwright 的 Page 或 Frame
 * @param {{ ledger?: ReturnType<typeof trackImageRequests>, timeoutMs?: number, settleFrames?: number, settleTimeoutMs?: number, label?: string, url?: string }} [options]
 *   ledger:互動前開的帳本(沒給就只看畫面上的元素 —— 看不到「失敗後被拆掉的 <img>」與不掛進 DOM 的預載);
 *   settleFrames:預設 10(同 openStory);0 = 只判圖、不等版面靜止(呼叫端自己證明版面已停時才用)
 * @returns {Promise<{ checked: number, loaded: number, deterministicFailures: {url:string,why:string}[], settle: object|null }>}
 */
export async function waitForImages(target, options = {}) {
  const { ledger = null, timeoutMs = 30_000, settleFrames = 10, settleTimeoutMs = 10_000, url = '' } = options
  if (!target || typeof target.evaluate !== 'function') throw new TypeError('waitForImages:target 必須是 Playwright 的 Page 或 Frame')
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError(`waitForImages:timeoutMs 必須是正整數,實得 ${JSON.stringify(timeoutMs)}`)
  if (!Number.isInteger(settleFrames) || settleFrames < 0) throw new TypeError(`waitForImages:settleFrames 必須是 ≥ 0 的整數,實得 ${JSON.stringify(settleFrames)}`)
  if (!Number.isInteger(settleTimeoutMs) || settleTimeoutMs <= 0) throw new TypeError(`waitForImages:settleTimeoutMs 必須是正整數,實得 ${JSON.stringify(settleTimeoutMs)}`)
  const pageUrl = typeof target.url === 'function' ? target.url() : url
  const origin = (() => { try { return new URL(pageUrl).origin } catch { return null } })()
  const label = options.label ?? (pageUrl || '(畫面)')
  const { verdict, settle } = await settleImagesAndFrames(target, {
    images: true, ledger, origin, imagesTimeoutMs: timeoutMs, settleFrames, settleTimeoutMs, stage: '圖片就緒後',
    fail: (kind, reason) => new StoryRenderInstrumentError({ storyId: label, url: pageUrl, kind, reason }),
  })
  return { checked: verdict.checked, loaded: verdict.loaded, deterministicFailures: verdict.deterministicFailures, settle }
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
// 而且那個畫面不是 Storybook 的錯誤頁、不是空的、沒有關鍵資源缺檔、沒有頁面例外,畫面裡每張圖都載完、解碼完。**
// (最後一句 2026-10-14 加,見上方「圖片就緒」區塊;opts.images = false 才不驗)
// 任何一項等不到或不成立 → 丟 StoryRenderInstrumentError(儀器失效:沒量到,不是產品裁決),
// 訊息點名 story id、附 Storybook 錯誤頁原文與同源 404 / 失敗請求。**絕不回「成功」、也絕不靜默略過。**
//
// 依序:
//   1. 導覽前先掛好監聽(關鍵資源失敗、頁面例外、進行中請求)—— 事後才掛會漏掉最早的那一筆;只算**本次導覽之後發出**的請求
//      (上一則 story 被導覽中斷的請求會晚到,不能算到這一則頭上);opts.notFound 可併入伺服器端的 404 帳本;
//      opts.images(預設 true)另開一份圖片請求帳本(trackImageRequests,只記新文件發出的)
//   1b. opts.demoImages = 'local'(預設):示範圖主機的圖片在瀏覽器裡就地換成同尺寸的本機合成圖、真站沒有這種網址的就地回 404
//      (serveDemoImagesLocally,每個分頁裝一次、整個分頁生命期有效);'network' = 照常向遠端要真圖(跟已提交基準圖比 /
//      寫基準 / 給人看的截圖)。裝不起來 → kind 'demo-images'
//   2. goto(load);導覽本身失敗 → kind 'navigation'
//      opts.previewFrame(管理介面)→ 等那個 iframe 元素、之後 3–9 步都在它的內容框架裡做;等不到 → kind 'preview-frame'
//   3. Storybook iframe(網址是 …/iframe.html,或 opts.storybook = true)且 requireRenderFinished:
//      等 `__STORYBOOK_PREVIEW__.currentRender` 是**這一則**(知道 id 時 render.id 必須相等)且 phase 走到 finished
//     (或 opts.finishedPhases 允許的 play 之後的 phase);錯誤頁(sb-show-errordisplay)/ 無預覽頁(sb-show-nopreview)
//      也是終點 → 各自丟對應 kind。這一步的本體 awaitStorybookRender 也由 waitForStoryRender 輸出(不是導覽觸發的切換用)
//   4. render-health(lib/storybook-render-health.mjs):根節點有內容(或 portal)、無關鍵資源失敗、無頁面例外
//   5. requestsSettled:渲染期間發出的請求全部結束(document 模式的資料請求用;**圖片不靠這一步**,見 8b —— 「請求結束」
//      是「圖已畫上」的網路層代理,R1e 的每趟多等 30 秒就是它跟著第三方主機的快慢走)
//   6. waitFor:選擇器(attached)或頁面函式(回 truthy 為止)—— 等**被量的元素本身**
//   7. beforeSettle(page):呼叫端在「靜止判定」之前要做的事(例:截圖前 blur)
//   8. fonts:document.fonts.ready(字寬會改幾何)
//   8b. images(預設 true):畫面範圍內每張 <img> / CSS 背景圖 complete、naturalWidth > 0、decode() 完成,且帳本裡的圖片請求
//      都有結果(上限 opts.imagesTimeoutMs,預設 = timeoutMs)。環境性失敗 → kind 'image-failed'、等不到 → 'image-timeout',
//      都點名網址;確定性失敗(RFC 保留名稱、同源 404)照拍,列在回傳的 images.deterministicFailures。判定見「圖片就緒」區塊
//   9. settleFrames:**連續 N 個影格**沒有任何 DOM 變動、也沒有進行中的有限長度動畫(無限動畫不算,它永遠不停)。
//      用影格不用毫秒:元件「量寬 → setState → 重畫」是一格一格推進的,機器慢只是等久一點,不會提早取樣。
//      probe(可選):在最後一個靜止影格的**同一個 task** 裡執行,回傳前不讓頁面再跑任何東西
//      images 開著時,最後一個靜止影格裡若還有畫面內的 <img> 沒載完(靜止期間才掛上的圖)或帳本又有新的圖片請求 →
//      回到 8b 再等、再靜止一次(同一個 imagesTimeoutMs 上限),probe 只在「靜止 + 沒有圖在路上」的那一格執行。
//      8b + 9 的本體 settleImagesAndFrames 也由 waitForImages 呼叫(互動之後才截圖用,同一份判定)
//  10. 有做 5–9 任一步時再驗一次 render-health(等待期間冒出的例外也要算)
// 逾時(timeoutMs / settleTimeoutMs / navigationTimeoutMs)只是「等不到」的上限,不是「已渲染」的代理 ——
// 成功一律由上面的訊號本身決定;慢的機器只會等久一點。
//
// 用法:
//   const r = await openStory(page, url)                                   // 渲染完成 + 健康 + 字型
//   const r = await openStory(page, url, { settleFrames: 10, probe: countPlus })   // r.probe = 靜止當下的量測
//   try { await openStory(page, url, { waitFor: '[data-x]' }) }
//   catch (e) { if (e instanceof StoryRenderInstrumentError) … e.kind / e.storyId / e.detail … }
// 回傳 { storyId, storybook, phase, ms, settle: { framesWaited, lateChanges, longestBrokenQuiet } | null, probe, images: { checked, loaded, deterministicFailures } | null, frame }
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
    // 帳上的失敗請求含遠端(圖片等),不只同源。原因裡已逐字點名的**完整網址**不再重印一次;同源條目(「404 /路徑」)一律保留 ——
    // 呼叫端與測試靠它認出是哪個檔缺了(this.failedRequests 仍是完整清單)
    const unnamed = failedRequests.filter((entry) => {
      const named = String(entry).replace(/^\d{3} /, '').replace(/\([^()]*\)$/, '')
      return !(/^[a-z][a-z0-9+.-]*:\/\//i.test(named) && String(reason).includes(named))
    })
    if (unnamed.length) parts.push(`404 / 載入失敗的請求:${unnamed.join(', ')}`)
    const detail = parts.join(';')
    super(`${INSTRUMENT_FAIL_MARKER} story「${storyId}」沒有量到 —— ${detail}。這是儀器失效(沒量到),不是產品裁決:元件不一定有問題,但這次不能算通過`,
      cause ? { cause } : undefined)
    this.name = 'StoryRenderInstrumentError'
    this.storyId = storyId
    this.url = url
    /** navigation | preview-frame | render-timeout | render-wait-failed | storybook-error | no-preview | render-errored | not-story | render-health | requests-timeout | wait-for-timeout | dom-not-settled | demo-images | image-failed | image-timeout */
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
 * 圖片也不在這個保證裡(下載完成不改 DOM):互動之後要截圖 / 量圖片的,互動前開 trackImageRequests、互動後再 waitForImages(「圖片就緒」區塊)。
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

// 頁面端:焦點連續 frames 個影格落在同一個元素上。**以 page.evaluate 序列化傳入,不得引用外部變數。**
// 焦點搬家不改 DOM(`.focus()` 不產生 mutation record),所以 waitForQuietFrames 看不到它 —— 這裡逐影格讀 activeElement。
function waitForStableFocus({ frames, capMs }) {
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))
  const describe = (el) => {
    if (!el || el === document.body || el === document.documentElement) return 'BODY'
    const role = el.getAttribute('role')
    const name = el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 24)
    return `${el.tagName.toLowerCase()}${role ? `[${role}]` : ''}${el.id ? `#${el.id}` : ''}「${name}」`
  }
  return (async () => {
    let quiet = 0, changes = 0, framesWaited = 0
    let last = document.activeElement
    const start = performance.now()
    while (quiet < frames) {
      if (performance.now() - start > capMs) return { ok: false, framesWaited, changes, active: describe(last) }
      await frame()
      framesWaited++
      const now = document.activeElement
      if (now !== last) { changes++; quiet = 0; last = now } else quiet++
    }
    return { ok: true, framesWaited, changes, active: describe(last) }
  })()
}

/**
 * **負向主張的觀測窗**(2026-09-27,M37):「焦點沒被搶回 / 沒被搬走」這種主張不能靠固定睡 N 毫秒再讀一次 ——
 * 睡得比搶焦點的那一步短就假綠(慢的機器上關閉動畫還沒跑完、Radix FocusScope 卸載後的 setTimeout 0 還沒到),
 * 睡得長只是把同一個賭注押大一點。改成:先等**該事件的證據**(浮層卸載、版面靜止 —— settleAfterInteraction),
 * 再用這支證明「相反證據穩定 N 個影格」:焦點連續 frames 個影格都落在同一個元素上,之後呼叫端才讀落點。
 * 焦點搬家不改 DOM,settleAfterInteraction 看不到它,所以要另外逐影格讀 activeElement。
 * 用影格不用毫秒:主執行緒忙時影格也不跑,機器慢只會等久一點;搶焦點是同步或下一個 macrotask 的事,一格之內就看得到。
 * @param {object} target  Playwright 的 Page 或 Frame
 * @param {{ frames?: number, capMs?: number }} [options]  capMs 只是「等不到」的天花板
 * @returns {Promise<{ ok: boolean, framesWaited: number, changes: number, active: string }>}
 *   ok:false = capMs 內焦點一直在跳 —— 呼叫端必須當**儀器失效**,不得當成「沒被搶」也不得當成「被搶了」;
 *   changes = 觀測期間焦點換了幾次(呼叫端可用它說明「搶焦點發生在等待期間」);active = 最後落點的描述(只供訊息)
 */
export async function waitForFocusStable(target, { frames = 10, capMs = 10_000 } = {}) {
  if (!target || typeof target.evaluate !== 'function') throw new TypeError('waitForFocusStable:target 必須是 Playwright 的 Page 或 Frame')
  if (!Number.isInteger(frames) || frames < 1) throw new TypeError(`waitForFocusStable:frames 必須是 ≥ 1 的整數,實得 ${JSON.stringify(frames)}`)
  return target.evaluate(waitForStableFocus, { frames, capMs })
}

// ═══════════════════════════════════════════════════════════════════════════
// 指標落點 —— 「點觸發欄位自己的表面」與「把指標停到中性位置」的**唯一**實作(2026-10-01)
// ═══════════════════════════════════════════════════════════════════════════
//
// **為什麼有這兩支**:掃全部 story、逐一點開每個 `[role="combobox"]` 的閘(overlay-footer-gutter、select-all-footer)原本用
// Playwright 的預設點法 —— 點元素**正中央**,點完指標就停在那裡。那是「點開這個下拉」的代理(M37):正中央剛好是欄位空白處時成立,
// 正中央落在欄位裡的 Tag 頭像 / 頭像堆疊 / Tag × 上時就不成立 —— 2026-09-30 欄位內搜尋框改成與 Tag 同列後,PeoplePicker
// 「多人 × 欄位內搜尋」第 3 格高度 60 → 32,正中央變成「Eric Tsai」那顆頭像:按下去焦點與指標都落在頭像上,名片卡(322×374)
// 打開並蓋住第 4 格,第 4 格點不到(overlay-footer-gutter 兩次全掃都紅在 Timeout;select-all-footer 9 次紅 4 次)。
// 同一天另一則(「+N 浮出清單移除驗證」)正中央是頭像堆疊的「+N」,指標停在那裡 → 名單卡打開蓋住第 2 格,被默默算成「被遮罩蓋住」而沒量。
// 產品在 main 上點頭像本來就會開名片卡(實測 main 與分支同一個行為)—— 錯的是量具:點的不是「欄位」,而是欄位裡另一個有自己行為的東西。
//
// 要保證的性質(逐字):**按下去的那一點,elementFromPoint 是觸發欄位自己(或它裡面沒有自己行為的部分:空白、文字、欄位內輸入框);
// 不在它裡面任何一個自有行為的東西上(按鈕、連結、Tag、頭像、頭像堆疊 / +N、任何 Radix 觸發點)**;
// 以及**每次開關之後,指標不停在任何一個會因滑過而打開東西的元素上**。
//
// 用法:
//   const at = await ownSurfacePosition(handle)                    // { ok, position, why } —— position 相對元素 padding box 左上角(Playwright click 的 position 同義)
//   await handle.click({ position: at.position, timeout })          // 由 Playwright 自己做可操作性檢查(被蓋住照樣會失敗)
//   const at = await ownSurfacePosition(handle, { prefer: 'end' }) // 從右端往左找(箭頭那一側;預設 'center' = 離正中央最近的點)
//   await parkPointer(page)                                         // { ok, x, y, neutral } —— 已經移過去了;neutral:false = 整個畫面找不到中性位置(停在最後一個候選)
// 兩支的判準都在頁面端函式裡,也匯出給必須在自己的 page.evaluate 裡用同一份判準的閘(OWN_SURFACE_EXCLUDE)。

/** 觸發欄位裡「有自己行為」的東西:按在這些上面不算按在欄位上。刻意包含 `[data-state]`(Radix 的 Tooltip / HoverCard / Popover 觸發點都帶它)。 */
export const OWN_SURFACE_EXCLUDE = 'button, a[href], [role="button"], [data-collection-remove], [data-tag-root], [data-avatar-size], [data-avatar-stack], [data-overflow-indicator], [data-state]'
/** 滑過會有反應的東西:指標不得停在這些上面。 */
const HOVER_REACTIVE = 'a[href], button, [role="button"], [data-state], [tabindex], input, textarea, select, [data-radix-popper-content-wrapper], [role="dialog"], [data-tag-root], [data-avatar-size], [data-overflow-indicator], [title]'

// 頁面端:在 el 上找一個自己的表面點。**以 evaluate 序列化傳入,不得引用外部變數。**
function ownSurfacePointInPage(el, { prefer, exclude }) {
  if (!el || !el.isConnected || el.getClientRects().length === 0) return { ok: false, why: '看不見或不在文件裡' }
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const xs = []
  for (let x = r.left + 3; x <= r.right - 3; x += 6) xs.push(x)
  xs.push(cx)
  const ys = [cy, r.top + Math.min(r.height / 2, 14)]
  for (let y = r.top + 4; y <= r.bottom - 4; y += 8) ys.push(y)
  const points = []
  for (const y of ys) for (const x of xs) points.push([x, y])
  if (prefer === 'end') points.sort((a, b) => (Math.abs(a[1] - cy) - Math.abs(b[1] - cy)) || (b[0] - a[0]))
  else points.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))
  const own = (hit) => {
    if (!hit || !el.contains(hit)) return false
    for (let n = hit; n && n !== el; n = n.parentElement) if (n.matches(exclude)) return false
    return true
  }
  for (const [x, y] of points) {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue
    const hit = document.elementFromPoint(x, y)
    if (own(hit)) {
      return { ok: true, x, y, position: { x: x - (r.left + el.clientLeft), y: y - (r.top + el.clientTop) }, hit: hit === el ? 'self' : hit.tagName.toLowerCase() }
    }
  }
  return { ok: false, why: '整個觸發欄位上找不到自己的表面(被蓋住,或全被 Tag / 頭像 / 按鈕佔滿)' }
}

// 頁面端:找一個中性的指標停放點(命中的是 html / body / 沒有任何滑過反應的祖先)。**以 evaluate 序列化傳入,不得引用外部變數。**
function neutralPointInPage({ reactive }) {
  const w = innerWidth, h = innerHeight
  const candidates = [[w - 2, h - 2], [2, h - 2], [w - 2, 2], [2, 2], [w / 2, h - 2], [w - 2, h / 2], [2, h / 2], [w / 2, 2]]
  for (const [x, y] of candidates) {
    const hit = document.elementFromPoint(x, y)
    if (!hit || hit === document.documentElement || hit === document.body || !hit.closest(reactive)) return { x, y, neutral: true }
  }
  return { x: candidates[0][0], y: candidates[0][1], neutral: false }
}

/**
 * 觸發欄位(或任何會被點開的元素)上「自己的表面」的點,相對它的 padding box 左上角 —— 直接交給 Playwright 的 `click({ position })`。
 * 會先把元素捲到畫面中央(Playwright 之後再捲也不影響相對位置)。
 * @param {import('playwright').ElementHandle} handle
 * @param {{ prefer?: 'center' | 'end' }} [options]  center(預設)= 離正中央最近的點;end = 同一列從右端往左(箭頭那一側)
 * @returns {Promise<{ ok: boolean, position?: { x: number, y: number }, x?: number, y?: number, hit?: string, why?: string }>}
 *   ok:false = 找不到自己的表面(被蓋住或全被佔滿)—— 呼叫端**不得**退回點正中央(那正是這支要取代的代理),要照「被蓋住」計數並印出
 */
export async function ownSurfacePosition(handle, { prefer = 'center' } = {}) {
  if (!handle || typeof handle.evaluate !== 'function') throw new TypeError('ownSurfacePosition:handle 必須是 Playwright 的 ElementHandle')
  if (prefer !== 'center' && prefer !== 'end') throw new TypeError(`ownSurfacePosition:prefer 只能是 'center' 或 'end',實得 ${JSON.stringify(prefer)}`)
  return handle.evaluate(ownSurfacePointInPage, { prefer, exclude: OWN_SURFACE_EXCLUDE }).catch((error) => ({ ok: false, why: `量不到(${String(error?.message || error).split('\n')[0]})` }))
}

/**
 * 把指標停到畫面上一個中性的位置(滑過不會打開任何東西),並回傳停在哪。每次開關浮層之後呼叫,免得指標留在剛才點的地方,
 * 把那裡的名片卡 / 名單卡 / Tooltip 打開、蓋住下一個要點的東西。
 * @param {import('playwright').Page} page
 * @returns {Promise<{ x: number, y: number, neutral: boolean }>}  neutral:false = 候選位置都有反應(仍停在第一個候選,呼叫端可印出)
 */
export async function parkPointer(page) {
  if (!page || typeof page.evaluate !== 'function' || !page.mouse) throw new TypeError('parkPointer:page 必須是 Playwright 的 Page')
  const spot = await page.evaluate(neutralPointInPage, { reactive: HOVER_REACTIVE })
  await page.mouse.move(spot.x, spot.y)
  return spot
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
 * @param {boolean} [options.requestsSettled]       等渲染期間發出的請求全部結束(預設 false;document 模式的資料請求用,圖片看 images)
 * @param {boolean} [options.images]                畫面內每張圖載完、解碼完、帳本裡的圖片請求都有結果(預設 true;見「圖片就緒」區塊)
 * @param {number} [options.imagesTimeoutMs]        等圖片的上限(預設 = timeoutMs)
 * @param {'local'|'network'} [options.demoImages]  示範圖主機的取法(預設 'local' = 本機同尺寸合成圖;'network' = 遠端真圖,給跟基準圖比 / 給人看的截圖)
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
    images = true, imagesTimeoutMs = timeoutMs, demoImages = 'local',
    // previewFrame 模式預設 30 秒(render-health 的上限):管理介面與 preview 同源、共用同一條主執行緒,story finished 之後
    // 管理介面自己的外掛面板重畫會把它塞住好幾秒 —— 2026-09-25 實測 CPU ×6 下 story 已 finished、根節點有內容,
    // 5 秒上限卻因為檢查本身排不到執行而被判成「empty story root」(誤紅);30 秒下同一趟通過、之後 0 次版面變動。
    // 上限只是「等不到」的天花板,成功仍由訊號本身決定,放寬不會造成假綠。
    healthTimeoutMs = previewFrame ? 30_000 : 5_000,
  } = options
  // 呼叫端寫錯選項 = 程式錯誤,導覽前就丟(不是儀器失效,也不能默默退回預設)
  const finished = normalizeFinishedPhases(options.finishedPhases ?? ['finished'])
  if (previewFrame != null && (typeof previewFrame !== 'string' || !previewFrame)) throw new TypeError('openStory:previewFrame 必須是 preview iframe 的選擇器字串')
  if (typeof images !== 'boolean') throw new TypeError(`openStory:images 必須是 true / false,實得 ${JSON.stringify(images)}`)
  if (demoImages !== 'local' && demoImages !== 'network') throw new TypeError(`openStory:demoImages 只能是 'local' 或 'network',實得 ${JSON.stringify(demoImages)}`)
  if (!Number.isInteger(imagesTimeoutMs) || imagesTimeoutMs <= 0) throw new TypeError(`openStory:imagesTimeoutMs 必須是正整數,實得 ${JSON.stringify(imagesTimeoutMs)}`)
  const priorDemoImages = demoImageModes.get(page)
  if (priorDemoImages && priorDemoImages !== demoImages) {
    throw new TypeError(`openStory:這個分頁先前用 demoImages='${priorDemoImages}' 開過,不能改成 '${demoImages}'(本機代換裝上後整個分頁有效、HTTP 快取也會混進另一種圖)—— 換一個瀏覽器 / 分頁`)
  }
  demoImageModes.set(page, demoImages)
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
  // 圖片請求帳本(8b 用):只記新文件發出的(同上方 seen 的界線)—— DOM 看不到「失敗後被拆掉的 <img>」與不掛進 DOM 的預載
  const imageLedger = images ? trackImageRequests(page, { accept: (request) => committed || request.isNavigationRequest() }) : null
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
    // 1b. 示範圖主機 → 本機同尺寸合成圖(每個分頁裝一次;'network' = 照常向遠端要真圖)
    if (demoImages === 'local') {
      try { await serveDemoImagesLocally(page) } catch (error) {
        throw instrument('demo-images', `裝不起示範圖的本機代換(CDP Fetch):${firstLine(error)} —— 量下去會改向遠端要圖,結果取決於網路`, { cause: error })
      }
    }

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

    // 8b + 9. 圖片就緒 → 版面靜止(影格)+ 同一個 task 裡的量測 —— 與 waitForImages 共用 settleImagesAndFrames(唯一實作):
    // 圖到了才會觸發的版面變動(FileViewer onLoad → fit-to-page)落在靜止判定的觀測窗裡;最後一格還有圖在路上就回頭再等。
    const { verdict: imagesVerdict, settle, probe: probed } = await settleImagesAndFrames(target, {
      images, ledger: imageLedger, origin, imagesTimeoutMs, settleFrames, settleTimeoutMs,
      includeParent: Boolean(previewFrame), probe, probeArg, stage: '渲染完成後',
      fail: (kind, reason) => instrument(kind, reason, { phase }),
    })

    // 10. 等待期間冒出的例外 / 失敗也要算
    if (waitFor || beforeSettle || settleFrames > 0 || requestsSettled || images) await assertHealthy()

    // frame = 量測所在的 Frame(previewFrame 模式是 preview iframe 的內容框架;一般是主框架)
    // images = 圖片就緒的摘要(checked / loaded = 畫面內檢查 / 載完的張數;deterministicFailures = 照拍的確定性失敗)
    const imageSummary = imagesVerdict ? { checked: imagesVerdict.checked, loaded: imagesVerdict.loaded, deterministicFailures: imagesVerdict.deterministicFailures } : null
    return { storyId: label, storybook, phase, ms: Date.now() - t0, settle, probe: probed, images: imageSummary, frame: target === page ? page.mainFrame() : target }
  } finally {
    page.off('framenavigated', onFrameNavigated)
    page.off('request', onRequest)
    page.off('response', onResponse)
    page.off('requestfailed', onRequestFailed)
    page.off('requestfinished', onRequestFinished)
    imageLedger?.dispose()
    monitor?.dispose()
  }
}
