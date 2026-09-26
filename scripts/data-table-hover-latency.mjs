#!/usr/bin/env node
/**
 * 列 hover 反應延遲(2026-09-11;user:「連 hover table row 的反應都是延遲很久」)
 *
 * **為什麼要新的儀器**:既有的閘量的全是捲動(空白帶、殼幀、內容延遲)。hover 的反應速度**一條都沒量**,
 * 所以「捲完之後 hover 要等很久」這個症狀在全綠的 CI 底下可以完全隱形 —— 本輪就是這樣放行了一版有長工回歸的改動。
 *
 * **量什麼**:從「送出 mousemove」到「那一列的底色真的在合成器送出的畫面上變了」之間的時間。
 * 不看 DOM 屬性、不看事件時間戳 —— `data-hovered` 寫下去到畫面上變色之間正是主執行緒被塞住時會拉長的那一段,
 * 只驗屬性等於假綠(M32:DOM-pass ≠ visual-pass)。
 *
 * **怎麼判「變了」**:不需要知道 hover 色票。移動前先存一張基準幀,之後找第一張「該列取樣點的像素與基準不同」的幀。
 * 靜止頁面上除了 hover 沒有別的東西會改那個像素,所以任何變化就是 hover 上色 —— **前提是那個像素真的屬於那一列**。
 * 取樣點(2026-09-25 改,待辦總帳 C12①):該列第一個離表格外框左緣 ≥ 18px 的格子的左側留白(格子左緣 +4,垂直置中),
 * 而且 elementFromPoint 證明點到的是那一列、中間沒有任何自己有底色的元素;hover 之後再證一次。證明不了的樣本記成
 * **看不到**(blind),不拿去判快慢、也不指控產品。`--legacy-sample-point` = 對照組:用舊的「列左緣 +6」,
 * 證明所有權檢查會點名蓋住它的拖曳把手。
 *
 * **取樣點與拖曳把手(2026-09-25,改正本檔先前的「k=9 離群值成因未知」)**—— 兩件事,都跟把手有關,要分開講:
 *   (1) **取樣點被蓋住(已修)**:舊點「列左緣 +6」在左釘選面板的列上落在拖曳把手底下 —— 把手以表格外框左緣為中心、
 *       寬 24(實測 x 4–28,外框 x 16),淺色把手底 `bg-surface-raised` = #FFFFFF 與列靜止同色。【實測】捲動後左面板 4/4 列、
 *       靜止時 k=6 被蓋(`--legacy-sample-point` 對照組現在會點名「被 BUTTON[拖曳重排此列] 蓋住」)。這是 M37 的代理:
 *       「列左緣 +6 的像素」≠「列的顏色」。捲動後那幾次「1.5 秒沒變色」就是這樣來的(同日把把手隱藏後 0/60)。
 *   (2) **k=9 離群值(約 160ms,只出現在左面板列)不是被蓋住造成的**。【實測】換成證明屬於列的新取樣點後仍會出現
 *       (本機 4 輪 8 段中 4 段各有一個 160–167ms,一律是左面板列,每次都是「命中 = hover 後第一張幀」,也就是串流的第一張幀晚到);
 *       【實測】只把把手的 150ms 透明度過渡關掉(`transition:none`),3 輪 6 段 60 個樣本 0 個離群(最大 54ms);
 *       把手整個隱藏時同樣消失(E/repair 6 輪)。【推論,未證】新出現的把手在跑 150ms 淡入時,截圖串流的第一張幀
 *       晚到約「150ms + 一格」,量到的是串流空窗、不是列的反應;為何只在左面板列發生不明。
 *       處理:不改產品、不在閘裡關掉過渡(那會改掉被量的東西);判定本來就用中位數,單一 160ms 只進最大值(門檻 600ms)。
 *   證據:scratchpad `im/W2/misc-controls.md`(本次各輪紀錄)、`im/E/repair.md` §1(隱藏把手的消融表)。
 *
 * **兩段情境**(第二段才是 user 回報的):
 *   A 靜止 hover:頁面靜止數秒後逐列 hover。
 *   B 捲動後 hover:先做一次 6,000px/s 的甩動,放手後立刻 hover —— 主執行緒此時仍在補畫,延遲最容易被看見。
 *
 * **對照組(`--selftest`)**:在 hover 路徑注入 120ms 忙等 → 中位數必須 ≥ 120ms(該紅會紅);
 * 同一支在未注入時中位數必須 < 120ms(不會恆紅)。沒有對照組的綠燈是零證據。
 * **2026-09-13 改判中位數**:原本兩邊都判 p95,但每輪必有一個 157-638ms 的單一離群值
 * (當時寫「成因未知」;2026-09-25 查到與拖曳把手的淡入有關,見上方「取樣點與拖曳把手」段)→ **反對照恆紅**(實測未注入時 p95 = 423ms)。
 * 注入是加在**每一個**取樣上,中位數必然跟著動(實測 128ms vs 未注入 9ms),分離度比 p95 更大。
 *
 * **開 story(2026-09-25 起)**:lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作)——
 * Storybook 回報渲染完成(含 play)+ render-health + 捲動區 `[data-datatable-hscroll]` 本身出現 + 版面連續 10 影格靜止,才進靜置期。
 * `--manager` 走 openStory 的 previewFrame 模式(同一份判定在 preview iframe 裡做,靜止判定同時看管理介面);原本自己寫的
 * render 檢查沒有錯誤頁捷徑(壞掉的 story 要等滿 120 秒),之後還固定睡 6 秒當「外掛背景工作跑完」的代理 —— 兩者都已拿掉。
 * 開不起來 = 儀器失效:點名 story、附同源 404、exit 2 —— 不是「hover 變慢」,也不算通過;`--selftest` 下不算對照組結果。
 * 之後的 `--warmup-ms` 靜置期(兩種模式同一個)**不是**「已渲染」的代理,是刻意的實驗條件(見 WARMUP_MS 說明)。
 *
 *   node scripts/data-table-hover-latency.mjs [--static=<dir>] [--dpr=1] [--rows=16] [--cpu-throttle=1]
 *     [--assert=on --assert-p95=<ms>] [--selftest] [--label=<名>] [--builds=a=<dir>,b=<dir>]
 */
import path from 'node:path'
import { PNG } from 'pngjs'
import { fileURLToPath } from 'node:url'
import { launchBrowser, openStory, requireStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { classifySamples, hoverVerdict, isBlindSample, isResolutionBound, MIN_USABLE_SAMPLES } from './lib/hover-latency-policy.mjs'

const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const has = (n) => process.argv.includes(`--${n}`)
// 用 fileURLToPath 而不是 `new URL(...).pathname`:repo 路徑含非 ASCII 字元時後者會留下百分號編碼,fs 找不到檔。
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DPR = Number(arg('dpr', 1))
const ROWS = Number(arg('rows', 16))
const THROTTLE = Number(arg('cpu-throttle', 1))
const SELFTEST = has('selftest')
const DEBUG_SAMPLES = has('debug-samples')
/** 載入後、開始取樣前的靜置時間。用來分辨「固定在第 N 次的離群值」是**迭代**造成的還是
 *  **載入後固定時間的一次性事件**:拉長靜置若讓離群值消失,就是後者。 */
const WARMUP_MS = Number(arg('warmup-ms', 3000))
/** `--manager`:量**使用者真正開的那個網址**(完整 Storybook 介面 + 外掛),不是裸 iframe。
 *  兩者差很多:manager 會載 a11y 外掛等,它們跟表格搶同一條主執行緒。 */
const MANAGER = has('manager')
if (MANAGER && SELFTEST) { console.error('✗ --selftest 只在裸 iframe 模式有效(忙等的 init script 進不到 Storybook 的 preview iframe);對照組請用不加 --manager 的那一組跑'); process.exit(2) }
const ASSERT = arg('assert', 'off') === 'on'
/** 判定用**中位數**不用 p95:舊取樣點每一輪都會出現一個單一離群值(main 與分支都有,實測 157–638ms),
 *  拿 p95 當閘會恆紅。中位數才是「hover 感覺不感覺得到延遲」的正確統計量;真正的卡死另由 `--assert-max` 抓。
 *  **2026-09-13 更正**:原本這裡寫「量測收尾的最後一次取樣」——**位置記錯了**,實測固定落在第 10 個取樣(`k=9`)。
 *  **2026-09-25 再更正**:那個離群值與拖曳把手的 150ms 淡入有關(串流第一張幀晚到),不是列變慢,
 *  見檔頭「取樣點與拖曳把手」段。判定繼續用中位數。 */
const ASSERT_MEDIAN = Number(arg('assert-median', 50))
const ASSERT_MAX = Number(arg('assert-max', 600))
const STORY = 'design-system-components-datatable-展示--roadmap-all-in-one'
const VIEWPORT_W = 1400
/** `--urls=a=https://…,b=https://…`:直接量**線上站台**(排除「本機建置 vs 線上建置」這個變數)。 */
const URLS = arg('urls', '')
const BUILDS = URLS
  ? URLS.split(',').map((s) => { const i = s.indexOf('='); return { label: s.slice(0, i), origin: s.slice(i + 1).replace(/\/$/, '') } })
  : arg('builds', '')
  ? arg('builds', '').split(',').map((s) => { const i = s.indexOf('='); return { label: s.slice(0, i), dir: path.resolve(s.slice(i + 1)) } })
  : [{ label: arg('label', 'build'), dir: path.resolve(arg('static', path.join(REPO, 'storybook-static'))) }]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const q = (a, p) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN)

/** 一次量測:回傳每一列的「送出 mousemove → 該列底色在畫面上變了」的毫秒數。
 *
 * **這個數字是上界,不是真值(2026-09-13 追根究柢的結論)。** 逐取樣比對發現:**每一次**命中的都是
 * `sentAt` 之後的**第一張**幀(16/16,`延遲` 與 `首幀延遲` 逐位元相等:12=12 / 8=8 / 25=25 / 175=175)。
 * 也就是變色在那張幀之前就完成了 —— 量到的其實是**截圖串流送出下一張幀所花的時間**。
 *
 * ~~那個「固定在第 10 次的 157-638ms 離群值」因此有解:串流在那一次停了那麼久沒送幀~~ —— **2026-09-25 撤回**:
 * 把拖曳把手隱藏、或只關掉它的淡入過渡,離群值就消失(見檔頭「取樣點與拖曳把手」段 (2))—— 仍是「串流第一張幀晚到」,
 * 但觸發它的是把手的淡入,不是靜置期的隨機停頓。當時「已逐條排除」的幾條(元件本身、特定面板、記憶體累積、
 * 載入後固定時間、週期性)都沒有把把手拿掉試過,所以漏掉了它。
 *
 * 所以這支儀器的正確用法:
 *   - **`lost`(有幀可看、卻整整 1.5 秒沒變色)是真訊號** —— CI 2026-09-12 抓到的 3 次是真 bug(已修)。
 *     ⚠️ **2026-09-20 更正**:這一行原本寫「與串流間隔無關」,而那是**註解裡的斷言,程式沒有任何地方在執行它**。
 *     實際的 `lost` 是 `樣本數 − 量到數字的樣本數`,所以串流停送幀 ≥ 1.5 秒時會被算成「產品沒變色」。
 *     2026-09-20 main 就是這樣誤紅(送幀間隔最大 1461ms,門檻 1500ms),而同一份內容在分支上剛跑綠。
 *     現在判定走 `lib/hover-latency-policy.mjs`:hover 後**零幀**的樣本記為 `blind`,不得指控產品;
 *     有幀可看卻沒變色才是 `lost`。可用樣本不足則以 `starved`(儀器失效)紅,不會默默放行。
 *   - 中位數只能當**上界**。注入干擾時它仍然有效(忙等會同時卡住主執行緒與送幀,所以上界跟著升),
 *     但**不要拿它宣稱「延遲 9ms」** —— 真值低於本儀器解析度。要更細得換工具(EventTiming / trace)。
 *   - 每行附上串流自己的靜置期間隔,用來判斷某個大數字是不是串流停頓造成的。
  */
async function measure(build, { afterScroll, sabotage }) {
  const server = build.origin
    ? { origin: build.origin, stop: async () => {} }
    : await startA11yStaticServer({ rootDirectory: build.dir, defaultFile: 'iframe.html' })
  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: DPR })
  const cdp = await page.context().newCDPSession(page)
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  if (sabotage) {
    // 對照組:把忙等塞進 hover 事件路徑(capture 階段,早於元件自己的 handler)。
    await page.addInitScript(() => {
      document.addEventListener('mouseover', () => { const t = performance.now(); while (performance.now() - t < 120) {} }, true)
    })
  }
  let scope = page   // 量測用的 frame(manager 模式下是 preview iframe)
  let frameOffset = { x: 0, y: 0 }
  try {
    if (MANAGER) {
      // 管理介面:openStory 的 previewFrame 模式(同一份實作,不再自己寫一份 render 判定)—— 在 preview iframe 裡等**這一則**
      // 渲染完成(含 play 與 afterEach;錯誤頁 / 無預覽頁當場以儀器失效停,不再等滿 120 秒)、render-health、捲動區本身出現,
      // 再等 preview 與管理介面**兩份文件同時**連續 10 影格靜止(外掛面板收到結果後的重畫、iframe 位置的位移都算在內)。
      const opened = await openStory(page, `${server.origin}/index.html?path=/story/${encodeURIComponent(STORY)}`, {
        previewFrame: '#storybook-preview-iframe', storyId: STORY, label: `管理介面(${STORY})`,
        waitFor: '[data-datatable-hscroll]', settleFrames: 10,
        navigationTimeoutMs: 120000, timeoutMs: 120000, notFound: server.notFound,
      })
      scope = opened.frame
      const r = await (await page.$('#storybook-preview-iframe')).boundingBox()
      frameOffset = { x: r.x, y: r.y }
      // 原本這裡固定睡 6000ms,理由是「等 manager 外掛(a11y 等)的背景工作跑完,它們沒有『做完了』的訊號可等」。
      // 2026-09-25 查證那是代理量:a11y addon 8.6 的 axe 在 preview 的 afterEach 裡跑(@storybook/addon-a11y dist/preview.mjs),
      // 而 phase 要走完 afterEach 才到 finished —— 訊號本來就有;外掛面板之後的重畫由上面「兩份文件同時靜止」接住。
      // 實測 openStory 回傳後再看 8 秒:管理介面與 preview 兩份文件 0 次 DOM 變動、0 個長任務 —— 那 6 秒裡沒有任何要等的事。
    } else {
      await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, {
        waitFor: '[data-datatable-hscroll]', settleFrames: 10,
        navigationTimeoutMs: 120000, timeoutMs: 60000, notFound: server.notFound,
      })
    }
    // 刻意的靜置期(--warmup-ms,兩種模式同一個):渲染完成與版面靜止已由 openStory 證明,這段**不是**「已渲染」的代理,
    // 是實驗條件(分辨離群值是迭代造成還是載入後固定時間的事件)
    await sleep(WARMUP_MS)
  } catch (error) {
    // 開不起來:收掉這一輪的瀏覽器與伺服器,把儀器失效交給呼叫端(不回傳任何樣本 —— 空樣本會被讀成「沒變色」)
    await browser.close(); await server.stop()
    throw error
  }

  const frames = []
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ ts: f.metadata.timestamp * 1000, data: f.data })
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }) } catch {}
  })
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })

  const innerBox = await (MANAGER ? scope.locator('[data-datatable-hscroll]') : page.locator('[data-datatable-hscroll]')).boundingBox()
  // frame 內回的座標是相對 frame 的;滑鼠事件走的是最外層文件,要加上 iframe 的位移。
  const box = { x: innerBox.x + frameOffset.x, y: innerBox.y + frameOffset.y, width: innerBox.width, height: innerBox.height }
  if (afterScroll) {
    // 甩一下再放手:主執行緒此時仍在補畫(user 回報的情境)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 200); await sleep(8) }
    await sleep(120)
  }

  const samples = []
  const idleGaps = []
  // 取樣點證明不了屬於那一列的樣本(逐筆原因;這些樣本同時記成 blind)
  const occluded = []
  // 逐樣本:這一次取樣在 hover 之後有沒有拿到任何一張幀(false = 看得到,true = 全盲)
  const blindness = []
  const unresolved = []
  let resolutionBound = 0
  for (let k = 0; k < ROWS; k++) {
    // 取樣點(2026-09-25 改,待辦總帳 C12①):**證明這個像素屬於那一列**才拿來量,不再用「列左緣 +6」這個代理。
    // 舊點落在左釘選面板列的拖曳把手底下(把手以表格外框左緣為中心 ±12px,淺色把手 #FFFFFF 與列靜止同色),
    // 把手 150ms 淡入後蓋住取樣點 —— 見檔頭「取樣點與拖曳把手」段 (1)。證明不了(被別的東西蓋住 / 找不到可量的格)的樣本
    // 記成**看不到**(blind),不得讀成「沒變色」指控產品,也不准默默跳過(可用樣本不足 → starved 紅)。
    const target0 = await scope.evaluate(pickSamplePoint, { k, legacy: LEGACY_POINT, clearPx: HANDLE_CLEAR_PX })
    if (!target0?.ok) {
      samples.push(NaN); blindness.push(isBlindSample({ owned: false })); unresolved.push(false)
      occluded.push(`k=${k}:${target0?.reason ?? '找不到可量的列'}`)
      continue
    }
    const target = { x: target0.x + frameOffset.x, y: target0.y + frameOffset.y }
    const pointer = { x: target0.pointerX + frameOffset.x, y: target0.pointerY + frameOffset.y }
    // `--debug-samples`:逐取樣印出座標 / 面板 / 命中元素 / 該次延遲,用來追「固定在第 N 次的離群值」。
    const dbg = DEBUG_SAMPLES
      ? await scope.evaluate(({ x, y }) => {
        const at = document.elementFromPoint(x, y)
        const row = at?.closest('[data-row-index]')
        return {
          panel: row?.closest('[data-datatable-panel]')?.getAttribute('data-datatable-panel') ?? '?',
          rowIndex: row?.getAttribute('data-row-index') ?? '?',
          hit: at ? `${at.tagName}.${String(at.className).slice(0, 34)}` : null,
          shells: document.querySelectorAll('[data-row-shell]').length,
          bands: document.querySelectorAll('[data-row-shell-band]').length,
          scrollTop: Math.round(document.querySelector('[data-datatable-hscroll]')?.scrollTop ?? -1),
        }
      }, { x: target0.x, y: target0.y })
      : null
    // 先把指標移開這一列(移到表格上緣外),等畫面靜止,再存基準
    await page.mouse.move(box.x + box.width / 2, box.y - 20)
    await sleep(260)
    // **只留最後一張當基準,其餘丟掉**(2026-09-13)。下面只用得到「移動前的最後一張」與
    // 「`sentAt` 之後的那些」,但原本 `frames` 把每一張 screencast 的 base64 PNG 全留著
    // (16 取樣 × 每個等 260ms、60fps → 數百張全頁 PNG),搭配下方 `pngCache` 原本上限 400 張
    // 解碼後點陣(1400×800×4 ≈ 4.5MB/張 → 約 1.8GB)是明顯過量。兩處都已收斂。
    //
    // **但這沒有修掉離群值,原本的假說被推翻**:靜止 hover 每輪固定在**第 10 個取樣**出現
    // 157-638ms(CPU×1/×4/×6 都一樣),收斂記憶體之後仍在同一個位置 —— 成因不是累積造成的垃圾回收。
    // **2026-09-25 查到**:與拖曳把手的 150ms 淡入有關(關掉過渡或隱藏把手就消失),不是記憶體或元件;
    // 當時的「(b) 特定面板只有左面板慢」其實正是線索(見檔頭「取樣點與拖曳把手」段 (2))。
    // 靜置期(主執行緒閒著)的送幀間隔 —— 這是**串流自己的抖動**。
    // 有了它才分辨得出「某次取樣量到 175ms」是產品慢還是串流本來就會停那麼久。
    for (let i = 1; i < frames.length; i++) idleGaps.push(Math.round(frames[i].ts - frames[i - 1].ts))
    if (frames.length > 1) frames.splice(0, frames.length - 1)
    const baseline = frames.length ? frames[frames.length - 1] : null
    if (!baseline) continue
    const t0 = performance.timeOrigin + performance.now()
    const sentAt = await page.evaluate(() => performance.timeOrigin + performance.now())
    // 指標落點:取樣點右側 40px、夾在同一列裡(pickSamplePoint 已確認落點屬於同一列);指標本身不在截圖裡
    await page.mouse.move(pointer.x, pointer.y)
    const deadline = Date.now() + 1500
    let hit = null
    const basePx = pixelAt(baseline.data, target.x, target.y)
    while (Date.now() < deadline && !hit) {
      for (const f of frames) {
        if (f.ts <= sentAt) continue
        const px = pixelAt(f.data, target.x, target.y)
        if (px && basePx && (Math.abs(px[0] - basePx[0]) + Math.abs(px[1] - basePx[1]) + Math.abs(px[2] - basePx[2])) > 12) { hit = f; break }
      }
      if (!hit) await sleep(16)
    }
    void t0
    const took = hit ? hit.ts - sentAt : NaN
    // **「沒觀察到」不等於「沒發生」**(2026-09-20,main 因此紅一次):
    // `took = NaN` 只代表「1.5 秒內沒抓到變色的幀」。若這段時間截圖串流**一張幀都沒送**,
    // 那是看不到,不是沒變色 —— 而那次 CI 的送幀間隔最大 1461ms,門檻正好是 1500ms。
    // 下面的 `after` 本來就算好了,只是先前只拿去印 debug、沒有參與判定。
    // 有幀可看卻沒變色 → 仍然是真訊號(2026-09-12 抓到的真 bug 屬於這一類,判定不變)。
    // **分辨「列真的慢」vs「截圖串流沒送幀」**:若 `sentAt` 之後的第一張幀本身就晚了 N 毫秒,
    // 那 N 毫秒是串流的空窗,不是列的反應時間 —— 這是 M32「儀器要先有對照組」的同一類問題。
    const after = frames.filter((f) => f.ts > sentAt)
    const firstGap = after.length ? Math.round(after[0].ts - sentAt) : NaN
    const gaps = after.slice(1).map((f, i) => Math.round(f.ts - after[i].ts))
    // **解析度受限**:命中的就是 `sentAt` 之後的第一張幀 → 變色在那張幀之前就完成了,
    // 真值只知道「≤ 這個數字」,量到的其實是**截圖串流的送幀間隔**。
    const firstFrameIsHit = Boolean(hit) && after.length > 0 && hit === after[0]
    if (firstFrameIsHit) resolutionBound += 1
    if (DEBUG_SAMPLES) console.log(`   k=${String(k).padStart(2)} ${String(Math.round(took)).padStart(5)}ms  首幀延遲=${String(firstGap).padStart(4)}ms 幀距=[${gaps.slice(0, 6).join(',')}] 幀數=${after.length}  面板=${dbg?.panel} 列=${dbg?.rowIndex}`)
    // hover 之後再證一次取樣點仍屬於那一列(2026-09-25,C12①):這時把手已淡入,若取樣點被它(或任何浮層)蓋住,
    // 這一次量到的是蓋住它的東西,不是列 —— 記成看不到(blind),不拿去判快慢、也不指控產品。
    const stillOwned = await scope.evaluate(ownsSamplePixel, { x: target0.x, y: target0.y, panel: target0.panel, rowIndex: target0.rowIndex })
    if (!stillOwned.owned) occluded.push(`k=${k}:hover 後取樣點被 ${stillOwned.hit} 蓋住(面板 ${target0.panel} 列 ${target0.rowIndex})`)
    samples.push(stillOwned.owned ? took : NaN)
    // 判定用的兩個旗標都由政策檔的純函式算 —— 先前 `!hit && after.length === 0` 直接寫在這裡,
    // 判定表只吃它的結果,所以「這個值怎麼算出來的」從來沒被測過(2026-09-21 對抗稽核)。
    // 2026-09-23:有幀但串流在視窗內停頓(首幀晚到 / 幀距)超過 STREAM_STALL_MS 也算看不到 —— 停頓期間主執行緒同在停,
    // hover 事件沒被處理不是產品沒變色。首幀延遲與幀距本來就算好了(上方 firstGap / gaps),只是先前沒進判定。
    blindness.push(isBlindSample({ owned: stillOwned.owned, hit, framesAfter: after.length, firstGap, maxGap: gaps.length ? Math.max(...gaps) : NaN }))
    unresolved.push(isResolutionBound({ hit, firstFrameIsHit, firstGap, assertMax: ASSERT_MAX }))
    // 解碼後的 PNG 每張 = 寬 × 高 × 4 bytes(1400×800 約 4.5MB);原本上限 400 張 ≈ 1.8GB,
    // 那必然在某個累積量觸發一次大型垃圾回收(當時據此推測是那個固定位置的離群值,已被推翻,見上)。
    // 一個取樣用完就整個清掉:跨取樣沒有任何重用價值(每次都是新的一批幀)。
    pngCache.clear()
    await sleep(120)
  }
  await cdp.send('Page.stopScreencast').catch(() => {})
  await browser.close(); await server.stop()
  samples.resolutionBound = resolutionBound
  samples.idleGaps = idleGaps
  samples.blindness = blindness
  samples.unresolved = unresolved
  samples.occluded = occluded
  return samples
}

/** 取樣點離表格外框左緣至少這麼遠:拖曳把手以外框左緣為中心、寬 24(±12),再留 6px 邊(實測把手 x 4–28、外框 x 16)。 */
const HANDLE_CLEAR_PX = 18
/** `--legacy-sample-point`:對照組 —— 用舊的「列左緣 +6」取樣點,證明所有權檢查會點名蓋住它的把手(不是給正式量測用的)。 */
const LEGACY_POINT = has('legacy-sample-point')

/**
 * 頁面端(以 scope.evaluate 序列化,不得引用外部變數):挑第 k 個取樣列,回傳一個**屬於那一列**的取樣點。
 * 取樣點 = 該列第一個「左緣 +4 離表格外框左緣 ≥ clearPx」的格子的左側留白(格子內距 12px,+4 不會踩到字)、垂直置中;
 * 所有權 = elementFromPoint 點到的是那一列的子孫,而且從它到列之間沒有任何元素自己有底色(= 那個像素畫的是列的底)。
 * 指標落點 = 取樣點右側 40px,夾在列內,並確認落點仍在同一列。
 */
function pickSamplePoint({ k, legacy, clearPx }) {
  const rows = [...document.querySelectorAll('[data-row-index]')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter((x) => x.r.height > 8 && x.r.top > 120 && x.r.bottom < window.innerHeight - 8)
    .sort((a, b) => a.r.top - b.r.top)
  const pick = rows[k % Math.max(1, rows.length)]
  if (!pick) return { ok: false, reason: '畫面上沒有可量的列' }
  const row = pick.el
  const panel = row.closest('[data-datatable-panel]')?.getAttribute('data-datatable-panel') ?? '?'
  const rowIndex = row.getAttribute('data-row-index')
  const y = Math.round(pick.r.top + pick.r.height / 2)
  const describe = (el) => { const l = el?.closest?.('[aria-label]'); return el ? `${l ? `${l.tagName}[${l.getAttribute('aria-label')}]` : el.tagName}` : '(無)' }
  const owns = (x) => {
    const at = document.elementFromPoint(x, y)
    if (!at || !row.contains(at)) return { owned: false, hit: describe(at) }
    for (let el = at; el && el !== row; el = el.parentElement) {
      const cs = getComputedStyle(el)
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none') return { owned: false, hit: `${describe(el)}(自己有底色)` }
    }
    return { owned: true }
  }
  let x = null
  if (legacy) {
    x = Math.round(pick.r.left + 6)
  } else {
    const outer = row.closest('[data-data-table-outer]') ?? row.closest('[class*="rounded-md"]')
    const tableLeft = outer ? outer.getBoundingClientRect().left : pick.r.left
    const cells = [...row.children].filter((c) => /^(grid)?cell$/.test(c.getAttribute('role') || ''))
    for (const c of cells) {
      const b = c.getBoundingClientRect()
      const cx = Math.round(b.left + 4)
      if (cx - tableLeft < clearPx || b.width < 12 || cx >= pick.r.right - 2) continue
      if (owns(cx).owned) { x = cx; break }
    }
    if (x == null) return { ok: false, reason: `面板 ${panel} 列 ${rowIndex} 找不到離把手夠遠、又屬於列本身的取樣點` }
  }
  const own = owns(x)
  if (!own.owned) return { ok: false, reason: `靜止時取樣點(${x},${y})被 ${own.hit} 蓋住(面板 ${panel} 列 ${rowIndex})` }
  let pointerX = Math.min(x + 40, Math.round(pick.r.right) - 2)
  const pAt = document.elementFromPoint(pointerX, y)
  if (!pAt || !row.contains(pAt)) pointerX = x
  return { ok: true, x, y, pointerX, pointerY: y, panel, rowIndex }
}

/** 頁面端:hover 之後再證一次取樣點屬於那一列(同 pickSamplePoint 的所有權判準)。 */
function ownsSamplePixel({ x, y, panel, rowIndex }) {
  const describe = (el) => { const l = el?.closest?.('[aria-label]'); return el ? `${l ? `${l.tagName}[${l.getAttribute('aria-label')}]` : el.tagName}` : '(無)' }
  const row = [...document.querySelectorAll(`[data-row-index="${rowIndex}"]`)]
    .find((r) => (r.closest('[data-datatable-panel]')?.getAttribute('data-datatable-panel') ?? '?') === panel)
  const at = document.elementFromPoint(x, y)
  if (!row) return { owned: false, hit: '(列已不在畫面上)' }
  if (!at || !row.contains(at)) return { owned: false, hit: describe(at) }
  for (let el = at; el && el !== row; el = el.parentElement) {
    const cs = getComputedStyle(el)
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none') return { owned: false, hit: `${describe(el)}(自己有底色)` }
  }
  return { owned: true }
}

const pngCache = new Map()
function pixelAt(b64, x, y) {
  let png = pngCache.get(b64)
  if (!png) { try { png = PNG.sync.read(Buffer.from(b64, 'base64')) } catch { return null }; if (pngCache.size > 64) pngCache.clear(); pngCache.set(b64, png) }
  // **比例用幀寬反推,不可假設等於 dpr**(2026-09-11 實測:CDP screencast 在 dpr2 下送出的仍是 1400×900,
  // 乘 dpr 會讓取樣點全部落到畫面外、量出「全部沒變色」的假訊號)。
  const k = png.width / VIEWPORT_W
  const px = Math.round(x * k), py = Math.round(y * k)
  if (px < 0 || py < 0 || px >= png.width || py >= png.height) return null
  const o = (py * png.width + px) * 4
  return [png.data[o], png.data[o + 1], png.data[o + 2]]
}

let fail = 0
const report = (label, mode, s) => {
  // 分類走 lib/hover-latency-policy.mjs 的同一支 —— 印出的數字與判定用的數字必須是同一份,
  // 各自數一遍就是兩份實作(2026-09-20 我自己在修這個 bug 的時候順手造出來的)。
  //   `lost`  = 有幀可看、但整整 1.5 秒都沒變色 → 真訊號
  //   `blind` = hover 之後串流一張幀都沒送 → 儀器看不到,不得當成產品沒變色
  const { ok, lost, blind } = classifySamples({ samples: Array.from(s), blindness: Array.from(s.blindness || []), unresolved: Array.from(s.unresolved || []) })
  // blind 含兩種「看不到」:串流沒送幀,以及取樣點被蓋住(2026-09-25,C12①)。印的時候分開說,判定照舊一起算。
  const occl = s.occluded?.length || 0
  const streamBlind = blind - occl
  const line = ok.length
    ? `${label}/${mode}:n=${ok.length} 中位 ${q(ok, 0.5).toFixed(0)}ms p95 ${q(ok, 0.95).toFixed(0)}ms 最大 ${Math.max(...ok).toFixed(0)}ms${lost ? ` (${lost} 次 1.5s 內沒變色)` : ''}${streamBlind ? ` (${streamBlind} 次串流全盲:hover 後零幀,看不到不等於沒變色)` : ''}${occl ? ` (${occl} 次取樣點被蓋住)` : ''}${s.idleGaps?.length ? ` [串流靜置期送幀間隔 中位 ${q(s.idleGaps, 0.5)}ms 最大 ${Math.max(...s.idleGaps)}ms]` : ''} | 逐次 ${s.map((x) => (Number.isFinite(x) ? x.toFixed(0) : '—')).join(' ')}`
    : `${label}/${mode}:全部 ${s.length} 次都沒量到變色`
  console.log('  ' + line)
  // 取樣點證明不了屬於列的樣本逐筆點名(2026-09-25,C12①):它們已計入「看不到」,這裡說清楚是被什麼蓋住
  if (s.occluded?.length) console.log(`   ↳ ${s.occluded.length} 次取樣點不屬於列(記成看不到,不拿去判快慢):${s.occluded.join(';')}`)
  // **把「沒變色」的次數一起回傳**(2026-09-12)。舊版只回 `ok`,於是 1.5 秒內沒變色的樣本
  // 從中位數與最大值裡一起被剔除、只在括號裡印個註記 —— 也就是**最糟的那種卡死對這支閘完全隱形**,
  // 而那正是 user 抱怨的「游標到了卻要等好一陣子」。獨立覆核 2026-09-12 指出這個洞。
  return { ok, lost, blind, streamBlind, occluded: occl, samples: s }
}

// 沒有建置 → MISSING-BUILD exit 2(缺前置;lib/launch-browser.mjs 的共用標記)。原本印自己的「沒有 iframe.html」並 exit 1 ——
// gate-selftest-meta 認不得那句,會把缺前置讀成一般紅(2026-09-25,待辦總帳 C5)。
for (const b of BUILDS) {
  if (!b.origin) requireStorybookBuild(path.join(b.dir, 'iframe.html'), `${b.label}:先跑 \`npm run build-storybook\`(或 --builds / --static 指向完整建置)`)
}
/** measure() 的呼叫端:表格沒開起來(StoryRenderInstrumentError)= 儀器失效,當場 exit 2 —— 不回傳空樣本(空樣本會被讀成「沒變色」)。 */
async function measureOrInstrumentFail(build, options) {
  try {
    return await measure(build, options)
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    // 沒量到 ≠ 沒問題:這一輪沒有任何 hover 樣本 —— 不是「hover 變慢」,也不算通過;
    // --selftest 下同樣不算對照組結果(對照組要的是「注入忙等後中位數升高」,不是「什麼都沒量到」)
    console.error(`✗ ${error.message}`)
    console.error('✗ data-table-hover-latency:儀器失效 —— 這一輪沒有量到任何 hover 樣本')
    process.exit(2)
  }
}

console.log(`列 hover 反應延遲(dpr${DPR}${THROTTLE > 1 ? ` / ${THROTTLE}× 節流` : ''},每段 ${ROWS} 列)`)
for (const b of BUILDS) {
  const stillR = report(b.label, '靜止 hover', await measureOrInstrumentFail(b, { afterScroll: false, sabotage: false }))
  const afterR = report(b.label, '捲動後 hover', await measureOrInstrumentFail(b, { afterScroll: true, sabotage: false }))
  const still = stillR.ok
  const after = afterR.ok
  if (SELFTEST) {
    // `report()` 2026-09-12 改成回傳 `{ ok, lost }`(讓「沒變色」的次數不再隱形),這裡要跟著取 `.ok` ——
    // 沒跟著改的那一版在 CI 上把對照組判成 `p95 = NaN` 而紅,等於自己把儀器弄壞。
    const sab = report(b.label, '對照組(注入 120ms 忙等)', await measureOrInstrumentFail(b, { afterScroll: false, sabotage: true })).ok
    // **對照組改判中位數,不判 p95**(2026-09-13)。本檔判定本來就用中位數(理由見檔頭),
    // 對照組卻還在用 p95 —— 而舊取樣點每一輪必有一個 157-638ms 的單一離群值(固定在第 10 個取樣;2026-09-25 查明是
    // 與拖曳把手的淡入有關,見檔頭「取樣點與拖曳把手」段),於是**反對照恆紅**(實測未注入時 p95 = 423ms > 120)。
    // 改中位數不會削弱偵測力:注入 120ms 是加在**每一個**取樣的 hover 路徑上,中位數必然跟著 ≥ 120
    //(實測注入後中位數遠超門檻),而未注入時中位數是 9-10ms —— 兩邊的分離度比用 p95 更大。
    const caught = sab.length > 0 && q(sab, 0.5) >= 120
    const cleanOk = still.length > 0 && q(still, 0.5) < 120
    console.log(`${caught ? '✓' : '✗'} 對照組:注入 120ms 忙等時中位數必須 ≥ 120ms(得 ${q(sab, 0.5).toFixed(0)}ms)`)
    console.log(`${cleanOk ? '✓' : '✗'} 反對照:未注入時中位數必須 < 120ms(得 ${q(still, 0.5).toFixed(0)}ms)`)
    if (!caught || !cleanOk) fail++
  }
  if (ASSERT) {
    for (const [mode, r] of [['靜止 hover', stillR], ['捲動後 hover', afterR]]) {
      const s = r.ok
      const med = s.length ? q(s, 0.5) : NaN
      const mx = s.length ? Math.max(...s) : NaN
      // `r.lost` = **有幀可看**卻整整 1.5 秒沒變色。那是比任何毫秒數都嚴重的失敗態,一出現就該紅。
      // `r.blind` = hover 之後串流一張幀都沒送 → 儀器看不到。**看不到不等於沒變色**,
      // 不得拿它指控產品(2026-09-20:main 因此紅一次,當時送幀間隔最大 1461ms、門檻 1500ms)。
      // 但也不能默默放行:樣本被吃掉太多時這一輪就證明不了任何事,要以**儀器失效**的名義紅。
      // 判定一律走 lib/hover-latency-policy.mjs(純函式,有真實 CI 數字的判定表 +
      // 對照組把關)。這裡只負責印,不再自己寫一份判斷式 —— 兩份實作必然漂移。
      const v = hoverVerdict({
        samples: Array.from(r.samples),
        blindness: Array.from(r.samples.blindness || []),
        unresolved: Array.from(r.samples.unresolved || []),
        assertMedian: ASSERT_MEDIAN,
        assertMax: ASSERT_MAX,
      })
      const usable = v.usable
      const starved = v.verdict === 'starved'
      const bad = v.verdict !== 'pass'
      console.log(`${bad ? '✗' : '✓'} ${b.label}/${mode} 中位 ≤ ${ASSERT_MEDIAN}ms、最大 ≤ ${ASSERT_MAX}ms、且 0 次沒變色(得 中位 ${usable ? med.toFixed(0) : 'n/a'} / 最大 ${usable ? mx.toFixed(0) : 'n/a'} / 沒變色 ${r.lost}${r.streamBlind ? ` / 串流全盲 ${r.streamBlind}` : ''}${r.occluded ? ` / 取樣點被蓋住 ${r.occluded}` : ''}）`)
      if (v.bounded) console.log(`   ↳ ${v.bounded} 次的數字只是**串流空窗的上界**(命中的就是 hover 後第一張幀,而那張幀本身就晚於 ${ASSERT_MAX}ms)—— 變色在它之前就完成了,不拿來判列的快慢。`)
      if (starved) console.log(`   ↳ 可用樣本只有 ${usable} 個(需 ≥ ${MIN_USABLE_SAMPLES})—— 這是**儀器失效**,不是產品變慢;串流全盲 ${r.streamBlind} 次、取樣點被蓋住 ${r.occluded} 次、解析度受限 ${v.bounded} 次。`)
      if (bad) fail++
    }
  }
}
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 量測完成')
process.exit(fail ? 1 : 0)
