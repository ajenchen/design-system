#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 每支 DataTable story 裡每個有溢出的捲動區,在 Windows 傳統捲軸幾何下完整落在每層裁切祖先內、捲軸沒被蓋住、外側半條像素是捲軸色;
 *         而且每則 story 量到的捲動區不少於覆蓋清單 scripts/data-table-scrollbar-visibility-inventory.json(由本閘從建置量出來寫入)
 *   紅: 捲動區被裁 / 捲軸被蓋 / 外側像素不是捲軸色;任一則 story 量到的捲動區比清單少(點名哪個 [data-datatable-hscroll] 被哪條規則略過);
 *       清單裡的 story 不在建置裡;清單缺、格式不對或是空的;--selftest 的三組對照組任一組沒有紅在該紅的地方,或對照組自己沒有作用
 *   綠: 每個捲動區三項斷言都過、每則 story 量到的不少於清單時綠;比清單多只印「清單還沒記」不紅;一個捲動區都沒量到或任一則 story 開不起來
 *       = 儀器失效(不算通過)
 *
 * DataTable 捲軸完整可見閘(Windows 幾何)—— 2026-09-08(Codex R4 補強版)
 *
 * 背景:Bug H(2026-04/05,治理帳 `2026-05-18-phaseB-codex-reply.md:2507`)「Windows 上水平/垂直捲軸
 * 各有一半溢出圓角外框」。當年的 interim 修法沒被實機驗過;macOS 的覆蓋式捲軸厚度 0,本機永遠看不到。
 * 本閘把 Windows 的幾何搬到任何機器上重現:
 *   1. 拿掉 Playwright headless 預設的 `--hide-scrollbars`(有它就永遠是 0px);
 *   2. 用不帶方向偽類的根規則 `::-webkit-scrollbar{width/height:N}` 建立佔版面的自繪捲軸
 *      (Chromium 在 `scrollbar-width`/`scrollbar-color` 非 auto 時忽略 webkit 規則,所以一併蓋回 auto);
 *   3. N = 17(Windows 傳統預設)與 11(`thin` = 2/3,Blink `kThinProportion = 2.f/3.f`),DPR 1 / 1.25 / 1.5;
 *   4. 另跑一組**原生 CSS**(DS 現行 `thin` + `scrollbar-color`、不強制任何 webkit 規則):Linux CI 的原生
 *      傳統捲軸會有厚度、macOS 覆蓋式為 0 → 後者明報「未覆蓋」而不是假綠。
 *
 * 斷言(每支 DataTable story、每個真的有溢出的捲動區,且在頂/中/底三個捲動位置各驗一次):
 *   A. 儀器有開:有溢出但捲軸厚度 0 → 強制組判紅、原生組記「未覆蓋」;
 *   B. 捲動區 border-box 落在每一層會裁切的祖先(overflow ≠ visible / contain paint)的 padding-box 內(容差 0.5px);
 *   C. 捲軸外側 3px / 內側 3px 用 elementFromPoint 打點,命中的必須是捲動區自己;
 *   D. 像素:捲軸**外側一半**的長條截圖,≥ 95% 像素是軌道色或拇指色(抓 `pointer-events:none` 的遮蓋物——
 *      hit-test 會放行、像素不會);
 *   E. 動態縮高(fill-height 的 story):slot 縮小 1 / 2 / 3px 後 350ms,B 仍成立(針對 compute() 舊 `<4px` 守衛)。
 *      「是不是填滿高度」直接讀表格根節點的 `data-dt-fill-height`(isFillHeight 的標記)。2026-11-06 之前用「捲動盒有 inline
 *      maxHeight」代認 —— 固定 px 的上限也掛 inline maxHeight,E 因此量到固定高度的表(契約外:格子比固定高度小時被裁是
 *      consumer 給的格子不夠,不是 compute() 沒跟上)。修前(中央表身當捲動盒)剛好被 scrollIntoView 把 overflow:hidden 的
 *      外框捲 2px、裁切移到沒量的表頭上而沒紅;f2ecd9e1 表頭進捲動盒後這 1–3px 就量到了(PR #169 dd7fd2cd 深掃 36 條紅)。
 *      E 一則都沒量到(沒有任何表格帶這個標記)= 儀器失效(--only 除外),不准靜默變成空閘。
 *
 * 對照組(M32「儀器要先有對照組」,`--selftest`):(i) 捲動區加高 2px → B 必紅;(ii) 用 `pointer-events:none`
 * 的遮蓋物蓋住垂直捲軸外側一半 → C 仍綠、D 必紅。
 *
 * 載入(2026-09-25):每則 story 由共用的 openStory(lib/launch-browser.mjs)開 —— 等 Storybook 回報渲染完成(含 play)、
 * 畫面健康,強制捲軸 CSS 在靜止判定之前注入,再等版面連續靜止 10 個影格(fill-height 的 compute() / 虛擬列量測收斂、
 * 捲軸厚度改變引起的重排都算在內)才量;取代舊的 load + 固定睡 900ms。**不等 `[data-datatable-hscroll]`**:
 * 有些 DataTable story(原則 / 解剖)本來就沒有捲動區,量到 0 個是正確結果,不是等不到。
 * story 開不起來 → 儀器失效(點名 story、列同源 404,exit 2,不是產品裁決,也不算通過;selftest 亦同)。
 *
 * 覆蓋清單(2026-10-28,G13):原本只擋「一個捲動區都沒量到」—— 每則 story 只要有一個捲動區沒溢出、選擇器對不到或
 * overflow 被改掉,那一個就靜默略過,其餘照樣綠(M37:沒觀察到 ≠ 沒發生;G12 欄位左緣閘同一個病,地板 40、量到 140 / 264 仍綠)。
 * 現在每則 story 在 Windows 預設幾何(17px、DPR 1)、中段捲動位置量到幾個捲動區,記在
 * `scripts/data-table-scrollbar-visibility-inventory.json`(`--write-inventory` 從建置量出來寫入,不是手寫):
 *   - 任一則比清單少 → 紅,逐個列出頁面上每個沒被量的 `[data-datatable-hscroll]` 被哪條規則略過(沒溢出 / overflow 不是 auto、scroll);
 *   - 清單裡的 story 不在建置裡 → 紅;比清單多(新 story、新捲動區)→ 印「清單還沒記」,不紅;
 *   - 清單缺、格式不對、空的 → 紅。PR 閘(--quick)只比它開的那 6 支,排程閘全比。
 *   - `--write-inventory` 只能全掃(不能搭 --quick / --only / --selftest),只跑 Windows 預設幾何的三個捲動位置;那一趟有任何紅或
 *     儀器失效就拒寫;寫入讓某則變少時逐則印出。
 * 對照組 (iii)(`--selftest`):把清單裡那則 story 第一個被量的捲動區改成 overflow:visible → 用跟正式比對同一支函式比清單,
 * 必須點名那則 story 而且原因寫的是 overflow;並且自己證明有作用(改之後量到的個數真的變少,否則判「對照組沒有作用」紅)。
 * 已知限制(刻意的取捨):清單只記個數,同一則裡一個捲動區被誤跳、同時又多一個,個數不變看不出來;新 story 要等有人跑
 * `--write-inventory` 才受保護。
 *
 *   node scripts/data-table-scrollbar-visibility.mjs [--quick] [--selftest] [--write-inventory] [--only=<id 片段>] [--static-dir <Storybook 建置>]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { INSTRUMENT_FAIL_MARKER, launchBrowser, openStory, requireStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const { PNG } = createRequire(join(REPO, 'package.json'))('pngjs')
const staticDirArg = process.argv.find((a) => a.startsWith('--static-dir='))?.slice('--static-dir='.length)
  ?? (process.argv.includes('--static-dir') ? process.argv[process.argv.indexOf('--static-dir') + 1] : null)
const STATIC = resolve(staticDirArg ?? join(REPO, 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const QUICK = process.argv.includes('--quick') // PR 閘:6 支代表 story、Windows 預設幾何、中段位置;全矩陣(43 story × 5 幾何 × 3 位置)在排程閘 focus-deep-gates.yml
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
const WRITE_INVENTORY = process.argv.includes('--write-inventory')
const TRACK = 0xee, THUMB = 0x99
const INVENTORY = join(REPO, 'scripts/data-table-scrollbar-visibility-inventory.json')
const INVENTORY_REL = relative(REPO, INVENTORY)
if (WRITE_INVENTORY && (QUICK || ONLY || SELFTEST)) {
  console.error('✗ --write-inventory 只能全掃(不能搭 --quick / --only / --selftest):清單要記的是整份建置')
  process.exit(1)
}

/** 讀覆蓋清單;不能用就回 { error }(缺檔、解析不了、不是 story → 正整數、空的)。 */
function readInventory() {
  if (!existsSync(INVENTORY)) return { error: `找不到 ${INVENTORY_REL}` }
  let data
  try { data = JSON.parse(readFileSync(INVENTORY, 'utf8')) } catch (error) { return { error: `${INVENTORY_REL} 解析不了:${error.message}` } }
  const stories = data?.stories
  if (!stories || typeof stories !== 'object' || Array.isArray(stories)) return { error: `${INVENTORY_REL} 沒有 stories 物件` }
  const malformed = Object.entries(stories).filter(([, v]) => !Number.isInteger(v) || v < 1)
  if (malformed.length) return { error: `${INVENTORY_REL} 有 ${malformed.length} 筆不是正整數(例:${malformed.slice(0, 3).map(([k, v]) => `${k}=${v}`).join('、')})` }
  if (Object.keys(stories).length === 0) return { error: `${INVENTORY_REL} 是空的 —— 空清單等於什麼都不守` }
  return { stories }
}
const inventory = readInventory()
if (inventory.error && !WRITE_INVENTORY) {
  console.error(`✗ 覆蓋清單不能用:${inventory.error}。先跑 \`node scripts/data-table-scrollbar-visibility.mjs --write-inventory\`(全掃一次、從建置量出來寫入)`)
  process.exit(1)
}
const recorded = inventory.stories ?? {}

/**
 * 比清單:這次量到的(id → { now, skips })逐則對清單。正式比對與對照組 (iii) 共用這一支(對照組驗的就是它)。
 * 回傳 { fewer: [{ id, was, now, skips }], unrecorded: [{ id, was, now }] }。
 */
function compareInventory(measured, recordedStories) {
  const fewer = [], unrecorded = []
  for (const [id, { now, skips }] of measured) {
    const was = recordedStories[id] ?? 0
    if (now < was) fewer.push({ id, was, now, skips })
    else if (now > was) unrecorded.push({ id, was, now })
  }
  return { fewer, unrecorded }
}

// 沒有建置 → 共用的 MISSING-BUILD 標記 + exit 2(缺前置,不是產品裁決)。原本自印一句沒有標記的訊息再 exit 2,
// lib/gate-selftest-meta.mjs 只認標記,不認退出碼 → 會被讀成「現況紅」(2026-09-25 收斂)
requireStorybookBuild(join(STATIC, 'index.json'))
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
// story 清單也從同一份快照讀,受測的 story 與供檔的建置是同一份(M37)。
const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
const BASE = server.origin
const index = JSON.parse(readFileSync(join(server.snapshot?.dir ?? STATIC, 'index.json'), 'utf8'))
const allIds = Object.values(index.entries).filter((e) => e.type === 'story' && /datatable/i.test(e.id)).map((e) => e.id)
let ids = allIds
if (ONLY) ids = ids.filter((i) => i.includes(ONLY))
// PR 閘只跑 6 支代表性 story(填滿高度雙軸 / 虛擬捲動 / 釘選欄雙表 / 容器高度 / 自動列高 / 基本);
// 43 支全量在排程閘。2026-09-08 CI 實測:全量 --quick 讓瀏覽器閘那一步從 326s 漲到 660s,整個 job 撞 15 分鐘逾時。
const QUICK_STORIES = ['roadmap-all-in-one', 'virtual-scroll', 'pinned-columns', 'container-height', 'row-auto-height', '--basic']
if (QUICK && !ONLY) ids = ids.filter((i) => QUICK_STORIES.some((q) => i.endsWith(q) || i.includes(q + '-') || i.includes(q)))
// 對照組開清單裡有記的那則(roadmap 優先):(iii) 要拿清單比,清單沒記的 story 比不出「變少」
if (SELFTEST) ids = [ids.find((i) => i.includes('roadmap-all-in-one') && recorded[i]) ?? ids.find((i) => recorded[i]) ?? ids[0]]

const FULL = [{ sb: 17, dpr: 1 }, { sb: 11, dpr: 1 }, { sb: 17, dpr: 1.25 }, { sb: 17, dpr: 1.5 }, { native: true, dpr: 1 }]
const MATRIX = SELFTEST || QUICK || WRITE_INVENTORY ? [{ sb: 17, dpr: 1 }] : FULL // PR 閘只跑 Windows 預設幾何、只在中段位置驗(≈25s);原生組與頂/底位置在排程閘
/** 覆蓋清單量的那一格:Windows 預設幾何(PR 閘與排程閘都有)的中段位置 */
const isCoverageCell = (geo, pos) => !geo.native && geo.sb === 17 && geo.dpr === 1 && pos === 'mid'

// `--single-process` 沙箱:一個 browser 只能開一個 context(launch-browser.mjs 註解),每組幾何重開;
// 起來但第一頁就掛的偶發,重試最多 3 次。
async function openPage(dpr) {
  let last
  for (let i = 0; i < 3; i++) {
    const b = await launchBrowser({ ignoreDefaultArgs: ['--hide-scrollbars'] })
    try { return { b, page: await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr }) } }
    catch (e) { last = e; await b.close().catch(() => {}) }
  }
  throw last
}

/** 在頁面裡量一個捲動位置下的所有捲動區(B / C + 像素長條的座標)。 */
const INSPECT = `(() => {
  const out = []
  const box = (e) => e.getBoundingClientRect()
  const scrollers = [...document.querySelectorAll('[data-datatable-hscroll]')].filter((e) => {
    const c = getComputedStyle(e)
    return /auto|scroll/.test(c.overflowY + c.overflowX) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)
  })
  for (const el of scrollers) {
    el.scrollIntoView({ block: 'center', inline: 'nearest' }) // elementFromPoint / 截圖只認視窗內
    const sbV = el.offsetWidth - el.clientWidth, sbH = el.offsetHeight - el.clientHeight
    const hasV = el.scrollHeight > el.clientHeight + 1, hasH = el.scrollWidth > el.clientWidth + 1
    const r = box(el)
    // Playwright 非全頁截圖的 clip 是**視窗**座標(它自己加 scroll 位移),跟 getBoundingClientRect 同座標系
    const item = { index: scrollers.indexOf(el), sbV, sbH, hasV, hasH, rect: [r.left, r.top, r.right, r.bottom].map((n) => +n.toFixed(1)), clips: [], cover: {}, strips: {}, scroll: [scrollX, scrollY],
      fill: !!el.closest('[data-data-table-outer]')?.hasAttribute('data-dt-fill-height'), instrumentOff: (hasV && sbV === 0) || (hasH && sbH === 0) }
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const c = getComputedStyle(a)
      if (c.overflowX === 'visible' && c.overflowY === 'visible' && !/paint|content|strict/.test(c.contain)) continue
      const ar = box(a)
      const pad = { left: ar.left + parseFloat(c.borderLeftWidth), top: ar.top + parseFloat(c.borderTopWidth), right: ar.right - parseFloat(c.borderRightWidth), bottom: ar.bottom - parseFloat(c.borderBottomWidth) }
      const over = { right: +(r.right - pad.right).toFixed(2), bottom: +(r.bottom - pad.bottom).toFixed(2), left: +(pad.left - r.left).toFixed(2), top: +(pad.top - r.top).toFixed(2) }
      if (Object.values(over).some((v) => v > 0.5)) item.clips.push({ ancestor: a.tagName.toLowerCase() + '.' + [...a.classList].slice(0, 3).join('.'), over })
    }
    // 2026-11-05(待辦總帳 Q2b):捲軸佔版面的平台上,看得見的那條捲軸是**同一張表自己的**代理捲軸 / 裝飾軌道 / 表頭墊片
    // (data-dt-scrollbar-* 那幾個,正好蓋在原生捲軸上);它們命中也算「沒被別的東西蓋住」。要擋的仍是外來的遮蓋物。
    const root = el.closest('[role="table"], [role="grid"]') ?? el.parentElement
    const own = (e) => e === el || el.contains(e) || (!!root && root.contains(e) && !!e.closest('[data-dt-scrollbar-proxy], [data-dt-scrollbar-trough], [data-dt-scrollbar-header-filler]'))
    const who = (x, y) => { const e = document.elementFromPoint(x, y); return e && own(e) ? 'self' : (e ? e.tagName.toLowerCase() + '.' + [...e.classList].slice(0, 2).join('.') : 'NONE') }
    // 垂直捲軸從表頭下方開始(表頭在捲動盒裡時;上方那一段是表頭色的墊片,不是捲軸)
    const head = el.querySelector('.dtHeaderRowGroup')
    const vTop = head ? Math.max(r.top, head.getBoundingClientRect().bottom) : r.top
    const midY = vTop + Math.min(120, (r.bottom - vTop) / 2), midX = r.left + Math.min(120, r.width / 2)
    const vw = innerWidth, vh = innerHeight
    if (hasV && sbV > 0) {
      item.cover.vOuter = who(r.right - 2, midY); item.cover.vInner = who(r.right - sbV + 2, midY)
      // 外側一半的長條,避開兩端圓角(8px)與 V/H 交會方塊,且裁到視窗內
      const x = r.right - sbV / 2, y0 = Math.max(0, vTop + 8), y1 = Math.min(vh, r.bottom - (hasH ? sbH : 0) - 8)
      if (y1 - y0 >= 20) item.strips.v = { x, y: y0, width: sbV / 2 - 1, height: y1 - y0 }
    }
    if (hasH && sbH > 0) {
      item.cover.hOuter = who(midX, r.bottom - 2); item.cover.hInner = who(midX, r.bottom - sbH + 2)
      const y = r.bottom - sbH / 2, x0 = Math.max(0, r.left + 8), x1 = Math.min(vw, r.right - (hasV ? sbV : 0) - 8)
      if (x1 - x0 >= 20 && y < vh) item.strips.h = { x: x0, y, width: x1 - x0, height: sbH / 2 - 1 }
    }
    out.push(item)
  }
  return out
})()`

/** 頁面上每個沒被量的 `[data-datatable-hscroll]` 與原因(與 INSPECT 同一個篩選條件,反過來列) */
const SKIPS = `(() => [...document.querySelectorAll('[data-datatable-hscroll]')].map((e, i) => {
  const c = getComputedStyle(e)
  const scrollable = /auto|scroll/.test(c.overflowY + c.overflowX)
  const overflowing = e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1
  if (scrollable && overflowing) return null
  return { index: i, why: !scrollable ? 'overflow 是 ' + c.overflowX + ' / ' + c.overflowY + '(不是 auto、scroll)' : '沒有溢出(內容 ' + e.scrollWidth + '×' + e.scrollHeight + ',可視 ' + e.clientWidth + '×' + e.clientHeight + ')' }
}).filter(Boolean))()`

/** 截圖前一刻:把第 i 個捲動區捲進視窗,回傳它此刻的視窗座標長條(同頁多表時不能沿用 INSPECT 的舊座標)。 */
const STRIPS_NOW = `((i) => {
  const scrollers = [...document.querySelectorAll('[data-datatable-hscroll]')].filter((e) => {
    const c = getComputedStyle(e)
    return /auto|scroll/.test(c.overflowY + c.overflowX) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)
  })
  const el = scrollers[i]; if (!el) return {}
  el.scrollIntoView({ block: 'center', inline: 'nearest' })
  const r = el.getBoundingClientRect(), sbV = el.offsetWidth - el.clientWidth, sbH = el.offsetHeight - el.clientHeight
  const hasV = el.scrollHeight > el.clientHeight + 1, hasH = el.scrollWidth > el.clientWidth + 1
  const strips = {}
  const head = el.querySelector('.dtHeaderRowGroup'), vTop = head ? Math.max(r.top, head.getBoundingClientRect().bottom) : r.top
  if (hasV && sbV > 0) { const x = r.right - sbV / 2, y0 = Math.max(0, vTop + 8), y1 = Math.min(innerHeight, r.bottom - (hasH ? sbH : 0) - 8); if (y1 - y0 >= 20) strips.v = { x, y: y0, width: sbV / 2 - 1, height: y1 - y0 } }
  if (hasH && sbH > 0) { const y = r.bottom - sbH / 2, x0 = Math.max(0, r.left + 8), x1 = Math.min(innerWidth, r.right - (hasV ? sbV : 0) - 8); if (x1 - x0 >= 20 && y < innerHeight) strips.h = { x: x0, y, width: x1 - x0, height: sbH / 2 - 1 } }
  return strips
})`

/** 像素:外側一半長條 ≥ 95% 是軌道色或拇指色。 */
async function stripOk(page, strip, dumpName) {
  const buf = await page.screenshot({ clip: strip, scale: 'css' })
  const png = PNG.sync.read(buf)
  if (dumpName) { const f = join(tmpdir(), `dt-scrollbar-${dumpName}.png`); writeFileSync(f, buf); console.log(`  (長條截圖:${f})`) }
  let ok = 0, total = 0
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2]
    const near = (v) => Math.abs(r - v) <= 6 && Math.abs(g - v) <= 6 && Math.abs(b - v) <= 6
    total++; if (near(TRACK) || near(THUMB)) ok++
  }
  return { ratio: ok / total, total }
}

const FORCED_CSS = (sb) => `*{scrollbar-width:auto!important;scrollbar-color:auto!important} *::-webkit-scrollbar{width:${sb}px;height:${sb}px} *::-webkit-scrollbar-thumb{background:#999} *::-webkit-scrollbar-track{background:#eee}`
const failures = []
const instrumentFailures = []
let checked = 0, uncovered = 0
/** E(動態縮高)實際量了哪幾則 × 幾何;一則都沒有 = 儀器失效(--only 除外) */
const eMeasured = []
/** 覆蓋清單那一格量到的:id → { now, skips } */
const coverage = new Map()
/** 開一則 story、注入(強制組的)捲軸 CSS、等版面靜止;開不起來丟 StoryRenderInstrumentError。 */
const open = (page, id, geo) => openStory(page, `${BASE}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, {
  beforeSettle: geo.native ? null : (p) => p.addStyleTag({ content: FORCED_CSS(geo.sb) }),
  settleFrames: 10, notFound: server.notFound,
})
const selftest = { clipRed: false, coverStillGreen: false, pixelRed: false, inventoryNamed: false, inventoryEffective: false, inventoryDetail: '' }

for (const geo of MATRIX) {
  const { b, page } = await openPage(geo.dpr)
  for (const id of ids) {
    const tag = geo.native ? 'native' : `sb=${geo.sb} dpr=${geo.dpr}`
    try { await open(page, id, geo) } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      instrumentFailures.push({ tag, error })
      continue
    }
    const positions = QUICK ? ['mid'] : ['top', 'mid', 'end']
    for (const pos of positions) {
      await page.evaluate((pos) => {
        for (const el of document.querySelectorAll('[data-datatable-hscroll]')) {
          const f = pos === 'top' ? 0 : pos === 'mid' ? 0.5 : 1
          el.scrollTop = (el.scrollHeight - el.clientHeight) * f
          el.scrollLeft = (el.scrollWidth - el.clientWidth) * f
        }
      }, pos)
      // 元素早已在畫面上;給捲動觸發的虛擬列重畫 / sticky 重排一小段時間再量
      await page.waitForTimeout(150)
      const report = await page.evaluate(INSPECT)
      if (isCoverageCell(geo, pos)) coverage.set(id, { now: report.length, skips: await page.evaluate(SKIPS) })
      for (const it of report) {
        checked++
        const bad = []
        if (it.instrumentOff) { if (geo.native) { uncovered++; continue } bad.push('儀器沒開:有溢出但捲軸厚度 0') }
        if (it.clips.length) bad.push('被裁切 ' + JSON.stringify(it.clips))
        for (const [k, v] of Object.entries(it.cover)) if (v !== 'self') bad.push(`${k} 被 ${v} 蓋住`)
        const stripsNow = (!geo.native && pos === 'mid') ? await page.evaluate(`${STRIPS_NOW}(${it.index})`) : {}
        for (const [k, strip] of Object.entries(stripsNow)) {
          let { ratio } = await stripOk(page, strip)
          if (ratio < 0.95) ({ ratio } = await stripOk(page, strip, `${id.split('--').pop()}-${k}`)) // 失敗時存檔供人眼核對
          if (ratio < 0.95) bad.push(`${k} 軸外側一半只有 ${(ratio * 100).toFixed(0)}% 像素是捲軸色(文件捲動 ${it.scroll.join(',')})`)
        }
        if (bad.length) failures.push({ id, tag, pos, rect: it.rect, bad })
      }
    }
    // E. 動態縮高:fill-height 的 story,slot 縮 1/2/3px 後區塊不得再溢出
    if (!geo.native) {
      // 填滿高度直接讀標記(見檔頭 E);E 縮的是第一張表的格子,所以也只認第一張表
      const fill = await page.evaluate(() => !!document.querySelector('[data-data-table-outer]')?.hasAttribute('data-dt-fill-height'))
      if (fill) eMeasured.push(`${id.split('--').pop()}@${tag}`)
      if (fill) for (const k of [1, 2, 3]) {
        const rep = await page.evaluate(async (k) => {
          const outer = document.querySelector('[data-data-table-outer]'); const slot = outer?.parentElement
          if (!slot) return 'noslot'
          slot.style.height = `${slot.getBoundingClientRect().height - k}px`
          // 等 ResizeObserver → compute() 把新高度套回捲動區(E 要驗的就是這一輪重算之後的結果)
          await new Promise((r) => setTimeout(r, 350)); return 'shrunk'
        }, k)
        if (rep === 'shrunk') {
          const report = await page.evaluate(INSPECT)
          for (const it of report) if (it.clips.length) failures.push({ id, tag, pos: `slot−${k}px`, rect: it.rect, bad: ['縮高後仍被裁切 ' + JSON.stringify(it.clips)] })
          await page.evaluate(async () => { const slot = document.querySelector('[data-data-table-outer]')?.parentElement; if (slot) slot.style.height = ''; await new Promise((r) => setTimeout(r, 350)) })
        }
      }
    }
    if (SELFTEST) {
      // (i) 加高 2px → B 必紅
      await page.evaluate(() => { const el = [...document.querySelectorAll('[data-datatable-hscroll]')].find((e) => e.scrollHeight > e.clientHeight + 1); if (el) { const h = el.getBoundingClientRect().height + 2; el.style.maxHeight = `${h}px`; el.style.height = `${h}px`; el.style.flex = 'none' } })
      selftest.clipRed = (await page.evaluate(INSPECT)).some((it) => it.clips.length)
      // 重新開一次(同一套等待:渲染完成 → 注入捲軸 CSS → 靜止),取代舊的 reload + 固定睡 900ms
      try { await open(page, id, geo) } catch (error) {
        if (!(error instanceof StoryRenderInstrumentError)) throw error
        instrumentFailures.push({ tag: `${tag} selftest 重開`, error })
        continue
      }
      // (ii) pointer-events:none 遮蓋垂直捲軸外側一半 → C 仍綠、D 必紅
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('[data-datatable-hscroll]')].find((e) => e.scrollHeight > e.clientHeight + 1); if (!el) return
        el.scrollIntoView({ block: 'center' })
        const r = el.getBoundingClientRect(), sbV = el.offsetWidth - el.clientWidth
        const d = document.createElement('div'); d.id = 'selftest-overlay'
        Object.assign(d.style, { position: 'fixed', left: `${r.right - sbV / 2}px`, top: `${r.top}px`, width: `${sbV / 2}px`, height: `${r.height}px`, background: '#fff', pointerEvents: 'none', zIndex: 2147483647 })
        document.body.appendChild(d)
      })
      const rep = await page.evaluate(INSPECT)
      selftest.coverStillGreen = rep.every((it) => Object.values(it.cover).every((v) => v === 'self'))
      selftest.pixelRed = false
      for (const it of rep) { const st = await page.evaluate(`${STRIPS_NOW}(${it.index})`); if (st.v) { const { ratio } = await stripOk(page, st.v); if (ratio < 0.95) selftest.pixelRed = true } }
      // (iii) 覆蓋清單會點名:第一個被量的捲動區改成 overflow:visible(被「overflow 不是 auto、scroll」規則略過)→
      // 用正式比對同一支 compareInventory 比清單,必須點名這則 story、原因寫 overflow;改之後量到的個數必須真的變少(對照組自己有作用)
      try { await open(page, id, geo) } catch (error) {
        if (!(error instanceof StoryRenderInstrumentError)) throw error
        instrumentFailures.push({ tag: `${tag} selftest (iii) 重開`, error })
        continue
      }
      await page.evaluate((pos) => { for (const el of document.querySelectorAll('[data-datatable-hscroll]')) { el.scrollTop = (el.scrollHeight - el.clientHeight) * pos; el.scrollLeft = (el.scrollWidth - el.clientWidth) * pos } }, 0.5)
      await page.waitForTimeout(150)
      const before = (await page.evaluate(INSPECT)).length
      await page.evaluate(() => {
        const el = [...document.querySelectorAll('[data-datatable-hscroll]')].find((e) => /auto|scroll/.test(getComputedStyle(e).overflowY + getComputedStyle(e).overflowX) && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1))
        if (el) el.style.overflow = 'visible'
      })
      const after = (await page.evaluate(INSPECT)).length
      const { fewer } = compareInventory(new Map([[id, { now: after, skips: await page.evaluate(SKIPS) }]]), recorded)
      const named = fewer.find((f) => f.id === id)
      selftest.inventoryEffective = after < before
      selftest.inventoryNamed = !!named && named.skips.some((k) => /overflow/.test(k.why))
      selftest.inventoryDetail = `改之前量到 ${before} 個、改之後 ${after} 個,清單記 ${recorded[id] ?? 0} 個;${named ? `點名 ${id}:${named.skips.map((k) => `#${k.index} ${k.why}`).join(';')}` : '沒有點名'}`
    }
  }
  await b.close()
}
await server.stop()

if (instrumentFailures.length) {
  // 沒量到 ≠ 沒問題:任何一則開不起來,這次的綠燈(或 selftest 的「抓到了」)就不成立
  console.log(`✗ 儀器失效 ${instrumentFailures.length} 次 —— 這些 story × 幾何這次沒有量到(exit 2,不是產品裁決,也不算通過):`)
  for (const { tag, error } of instrumentFailures.slice(0, 20)) console.log(`  [${tag}] ${error.message}`)
  for (const f of failures) console.log(`✗ ${f.id} [${f.tag} ${f.pos}] rect=${f.rect.join(',')} → ${f.bad.join(';')}`)
  process.exit(2)
}
if (SELFTEST) {
  const ok = selftest.clipRed && selftest.coverStillGreen && selftest.pixelRed && selftest.inventoryNamed && selftest.inventoryEffective
  console.log(`${ok ? '✓' : '✗'} selftest:加高 2px → 裁切紅=${selftest.clipRed};pointer-events:none 遮蓋 → hit-test 仍綠=${selftest.coverStillGreen}、像素紅=${selftest.pixelRed}`)
  console.log(`  (iii) overflow:visible → 清單點名=${selftest.inventoryNamed}、對照組有作用=${selftest.inventoryEffective}(${selftest.inventoryDetail})`)
  if (!selftest.inventoryEffective) console.log('  ✗ 對照組沒有作用:改成 overflow:visible 之後量到的捲動區沒有變少 —— 這組證明不了清單會點名')
  process.exit(ok ? 0 : 1)
}
// 一個捲動區都沒量到 ≠「全部捲動區完整」(M37:沒觀察到 ≠ 沒發生)。story 清單空了(改名 / --only 對不到)、
// 或捲動區選擇器 / 溢出條件失效時,修前印「檢查 0 個捲動區 ✓」exit 0(2026-09-25 以 --only=<不存在> 實測重現)
if (checked === 0) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${ids.length} 支 story × ${MATRIX.length} 組幾何,一個有溢出的捲動區都沒量到 —— 這是儀器失效(沒量到),不是產品裁決,也不算通過`)
  process.exit(1)
}
// E 一則都沒量到 ≠ E 全過(M37):標記改名 / 填滿高度的 story 被刪,E 就變成空閘。--only 只開指定的 story,不適用。
if (!ONLY && MATRIX.some((g) => !g.native) && eMeasured.length === 0) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:E(格子縮 1–3px)一則都沒量到 —— 沒有任何表格帶 data-dt-fill-height(標記改名?填滿高度的 story 不見了?),不是產品裁決,也不算通過`)
  process.exit(1)
}
console.log(`E 動態縮高量了 ${eMeasured.length} 則 × 幾何:${eMeasured.join('、') || '(--only,無填滿高度的表)'}`)
console.log(`DataTable 捲軸可見閘:${ids.length} 支 story × ${MATRIX.length} 組幾何(${MATRIX.map((g) => g.native ? '原生' : `${g.sb}px@${g.dpr}`).join(' / ')}),檢查 ${checked} 個捲動區×位置${uncovered ? `;原生組 ${uncovered} 個為覆蓋式捲軸(厚度 0)未覆蓋` : ''}`)
for (const f of failures) console.log(`✗ ${f.id} [${f.tag} ${f.pos}] rect=${f.rect.join(',')} → ${f.bad.join(';')}`)

const measuredTotal = [...coverage.values()].reduce((n, c) => n + c.now, 0)
if (WRITE_INVENTORY) {
  if (failures.length) { console.log(`✗ 這一趟有 ${failures.length} 條失敗,拒寫覆蓋清單(清單只收全綠那一趟量到的)`); process.exit(1) }
  const next = Object.fromEntries([...coverage].filter(([, c]) => c.now > 0).sort(([a], [b]) => a.localeCompare(b)).map(([id, c]) => [id, c.now]))
  for (const [id, was] of Object.entries(recorded)) if ((next[id] ?? 0) < was) console.log(`· 寫入讓 ${id} 變少:${was} → ${next[id] ?? 0}`)
  writeFileSync(INVENTORY, `${JSON.stringify({
    note: 'data-table-scrollbar-visibility 的覆蓋清單:每則 DataTable story 在 Windows 預設幾何(17px、DPR 1)、中段捲動位置量到幾個有溢出的捲動區。由 `node scripts/data-table-scrollbar-visibility.mjs --write-inventory` 從建置好的 Storybook 全掃量出來寫入,不要手改。任一則量到的比這裡少 = 紅(有捲動區被略過了,點名原因);變多不紅,重寫收進來。',
    generatedBy: 'scripts/data-table-scrollbar-visibility.mjs --write-inventory',
    stories: next,
  }, null, 2)}\n`)
  console.log(`已寫入 ${INVENTORY_REL}:${Object.keys(next).length} 則 story、${measuredTotal} 個捲動區`)
  process.exit(0)
}

// 覆蓋清單:清單裡的 story 不在建置裡 → 紅;這次開的 story 量到的比清單少 → 紅並點名
const gone = Object.keys(recorded).filter((id) => !allIds.includes(id))
const { fewer, unrecorded } = compareInventory(coverage, recorded)
const recordedHere = [...coverage.keys()].reduce((n, id) => n + (recorded[id] ?? 0), 0)
console.log(`覆蓋清單(${INVENTORY_REL}):這次開的 ${coverage.size} 則 story 清單記 ${recordedHere} 個捲動區,這次量到 ${measuredTotal} 個`)
if (unrecorded.length) console.log(`· 清單還沒記的覆蓋:${unrecorded.length} 則 story(${unrecorded.map((u) => `${u.id} ${u.was}→${u.now}`).join('、')});不紅,跑 --write-inventory 收進清單,之後掉了才擋得到`)
for (const id of gone) console.log(`✗ 清單裡的 ${id} 不在這份建置裡(story 改名 / 刪了?改名就跑 --write-inventory 重寫,並在 commit 說明)`)
for (const f of fewer) {
  console.log(`✗ ${f.id}:清單記 ${f.was} 個捲動區,這次只量到 ${f.now} 個 —— 沒被量的:${f.skips.length ? f.skips.map((k) => `#${k.index} ${k.why}`).join(';') : '頁面上找不到 [data-datatable-hscroll](選擇器對不到或表格沒渲染)'}`)
}
if (fewer.length) console.log('  是量具把捲動區誤判成「不歸它管」→ 修量具;捲動區真的該變少 → 跑 --write-inventory 重寫清單,並在 commit 說明')
const red = failures.length + gone.length + fewer.length
console.log(red ? `✗ ${failures.length} 條斷言失敗、${gone.length} 則清單 story 不在建置、${fewer.length} 則量少了` : '✓ 全部捲動區完整在裁切框內、捲軸沒被蓋住、外側像素完整;每則 story 量到的不少於覆蓋清單')
process.exit(red ? 1 : 0)
