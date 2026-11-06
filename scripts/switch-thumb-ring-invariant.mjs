#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 掃到的每個 Switch,thumb 外圈的像素 = 同一列 track 裸露處的顏色(light / dark × hover / 不 hover),unchecked + enabled 的白色圓直徑
 *         符合 switch.spec.md 尺寸表;而且覆蓋清單(scripts/switch-thumb-ring-inventory.json,由本閘 --write-inventory 全掃量出)裡每一則 story
 *         這次量到的 Switch 不少於清單記的數 —— 少量就紅,不再「取樣數不是 0 就綠」。
 *   紅: 外圈顏色 ≠ track、白色圓直徑差超過 1px → 指名 story;清單裡任一則少量或不在建置裡 → 指名記幾個、這次幾個;缺清單 / 格式不對 / 空清單 → 紅;
 *       任一則 story 開不起來 → 儀器失效(exit 2)。
 *   綠: 全掃量完、0 違規、清單逐則不少量時綠;--selftest 兩組對照都要被抓到才綠:①外圈塗白(事故二原樣重放)→ 顏色與尺寸都紅;
 *       ②清單排序前 2 則,把 Switch 的 role 拿掉(探針認不出)→ 覆蓋比對必須點名那 2 則,而且破壞至少讓一則真的少量(對照組自己證明有作用)。
 *
 * Switch thumb ring 不變式 —— 「thumb 外圈必須渲染成 track 本身的顏色」。
 *
 * 為什麼要有這支閘(兩次真實事故,同一個位置、不同破法):
 *   1. 2026-07-06 給 track 加 hover 升階時漏了 thumb 邊框 → hover 時白圓浮出一圈灰邊。
 *   2. dark mode 邊框色是白 25%,`background-clip` 預設 border-box 會把 thumb 自己的白底鋪到
 *      邊框下 → 白疊白、整圈消失。像素實測白圓 light 15.5px vs dark 19.5px(spec.md:90 要求 16)。
 *
 * 兩次都**通不過 computed style 檢查**(border-width 恆為 2px、border-color 恆有值),
 * 只有量真實像素才抓得到 —— 所以這支閘一律讀截圖像素,不讀 CSSOM(M32)。
 *
 * 不變式一(顏色):在 thumb 垂直中心那一列,thumb 左緣往內 1px(落在那圈 2px 內)的顏色,
 * 必須等於同一列上 track 裸露處的顏色。這條在 checked / unchecked / disabled /
 * hover / light / dark 全部成立,因為它描述的是「那圈本來就該是 track」。
 *
 * 不變式二(尺寸,2026-09-12 補):`switch.spec.md:99-100` 的尺寸表逐字要求
 * **白色圓 sm/md = 16px、lg = 20px**(thumb 外框 20 / 24,減去兩側各 2px 外圈)。
 * 獨立覆核 2026-09-12 指出:`grep scripts/*.mjs` 找不到任何腳本在斷言這個直徑 ——
 * 事故二(dark mode 白疊白讓白圓從 15.5 變 19.5px)當時就是靠人眼加臨時探針抓到的,
 * 日後尺寸再經由別的機制走鐘不會有任何閘紅。這裡量**渲染出來的連續純白寬度**,
 * 只在 unchecked + enabled 上量(checked 的勾選圖示會把白色段切斷;disabled 套 opacity 後不是純白)。
 *
 * 開 story(2026-09-25 起):lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作)——
 * Storybook 回報渲染完成(含 play)+ render-health + 字型,才數這則 story 有沒有 Switch。
 * **刻意不等版面靜止(settleFrames)**:這裡渲染完成後只數 Switch,幾何要等切 theme + 過渡之後才量。
 * 實測(2026-09-25,164 則):「渲染完成當下」與「再等連續 5 影格靜止」數到的 Switch 數逐則相同;渲染完成後還在變的
 * 只有 agentpanel / chart 的 overview(都沒有 Switch),而等靜止會讓整趟多 25–30 秒(這個 job 釘在 15 分鐘)。
 * 取代原本「load(失敗被 `.catch(() => {})` 吞掉)+ 等根節點有子元素 5 秒(逾時也吞掉)+ 固定睡 80ms」:
 * 舊寫法在 story 開不起來時數到 0 個 Switch → 當成「這則沒有 Switch」靜靜跳過,164 則少掃幾則不會有任何訊號(M37)。
 * 現在任何一則開不起來 = 儀器失效:點名 story、附同源 404、整次 exit 2 —— 不是產品裁決,`--selftest` 下也不算「對照組如預期紅」。
 * 「渲染完成且健康、確實沒有 Switch」照舊跳過:那是確定的事實(這支閘掃全 DS 就是為了蓋到組合 story),不是沒量到。
 *
 * 覆蓋清單(2026-10-28,總帳 G13;做法同 field-text-left-edge 的 G12):原本唯一的地板是「取樣數 0 才紅」——
 * 探針只要少認一半的 Switch(例:之後有人把 role 掛到別層、或 thumb 的 data-state 換名而 geo 回 null)照樣綠(M37:「量到幾個」不是「該量的都量到了」)。
 * 現在逐則記數:清單由本閘 `--write-inventory` 全掃量出(那一趟有違規或儀器失效就拒寫;CI 永不寫),之後任一則少量就紅並點名;
 * 變多不紅、印「清單還沒記」。新 story 要等有人重寫清單才受保護(與 gate-control-group 棘輪同做法)。
 * 記的數 = 這則 story 在 light 主題下量得到幾何(thumb / track 寬 ≥ 8px)的 Switch 個數 —— 跟後面取樣用同一支判定(GEO)。
 */
import { PNG } from 'pngjs'
import { launchBrowser, openStory, requireStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { readServedStorybookIndex, startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { join, dirname, resolve } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const selftest = args.includes('--selftest')
const WRITE_INVENTORY = args.includes('--write-inventory')
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INVENTORY = join(REPO, 'scripts/switch-thumb-ring-inventory.json')
// selftest ②:清單排序後取前幾則做覆蓋對照(一則就足以證明比對分得開,兩則防單一則剛好失效)
const COVERAGE_CONTROL_SAMPLES = 2
// 覆蓋對照組的破壞開關:網址帶這個參數時,初始化腳本把頁面上 Switch 的 role 拿掉(探針就認不出它)。只在這個網址生效,不影響其他 story
const BREAK_PARAM = 'g13break=1'
const root = args.find((a) => a.startsWith('--root='))?.slice(7) ?? 'storybook-static'
const TOLERANCE = 8 // 每通道 /255;截圖有子像素抗鋸齒,取樣點又貼著圓角,留一點餘裕
// `switch.spec.md:99-100` 的尺寸表:thumb 外框 → 白色圓。±1px 容差給子像素抗鋸齒。
const WHITE_DISC_BY_THUMB = { 20: 16, 24: 20 }
const DISC_TOLERANCE = 1

// 沒有建置 → MISSING-BUILD exit 2(缺前置;lib/launch-browser.mjs 的共用標記與退出碼)。原本直接 ENOENT 崩掉(2026-09-25,待辦總帳 C5)
requireStorybookBuild(join(root, 'index.json'))
const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 4 })
// selftest ② 用:只在網址帶 BREAK_PARAM 時,把 role="switch" 一出現就拿掉(探針漏認 Switch 的樣子)
await page.addInitScript((param) => {
  if (!location.search.includes(param)) return
  const strip = () => { for (const n of document.querySelectorAll('[role="switch"]')) n.removeAttribute('role') }
  new MutationObserver(strip).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['role'] })
  document.addEventListener('DOMContentLoaded', strip)
}, BREAK_PARAM)

if (selftest) {
  // 對照組 = 把事故二原樣重放:白底鋪到邊框下,那圈變成白的。閘若還綠就是它什麼都沒驗。
  await page.addStyleTag({ content: '[role="switch"] > *{background-clip:border-box !important;border-color:rgb(255,255,255) !important}' }).catch(() => {})
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style')
      s.textContent = '[role="switch"] > *{background-clip:border-box !important;border-color:rgb(255,255,255) !important}'
      document.head.appendChild(s)
    })
  })
}

// 掃全 DS 的「設計規格」三支固定 story(跟 hover-color-pair 同一套列舉),
// 不預先過濾元件名 —— Switch 出現在 form / field / settings 等組合 story 裡也要蓋到。
// story 清單讀**正在服務的那一份**建置(快照),不讀活目錄 —— 清單與頁面必須出自同一份建置
//(2026-09-25,待辦總帳 C5;lib/a11y-static-server.mjs 的 readServedStorybookIndex)
const index = readServedStorybookIndex(server)
const allIds = Object.entries(index.entries)
  .filter(([id, e]) => e.type === 'story' && /--(state-behavior|overview|size-matrix)$/.test(id))
  .map(([id]) => id)
// 對照組只跑「注入破壞後一定會紅」的目標(有 Switch 的那幾支),否則會為了驗 3 秒的事情跑 5 分鐘。
// 正常掃仍然是全 DS —— Switch 會出現在 form / settings / dialog 等組合 story 裡,不能只掃 switch 目錄。
const ids = selftest ? allIds.filter((id) => /switch|field|form|setting/i.test(id)) : allIds
const violations = []
const discViolations = []
/** 開不起來的 story(儀器失效,不是產品裁決);任何一則都讓整次 exit 2 */
const instrumentFails = []
let sampled = 0
let discSampled = 0

/** 量得到幾何的 Switch:thumb = 第一個帶 data-state 的子元素(或第一個子元素),track / thumb 寬都 ≥ 8px。取樣與覆蓋記數共用這一支 */
const GEO = (n) => {
  const t = n.querySelector('[data-state]') ?? n.firstElementChild
  if (!t) return null
  const tr = n.getBoundingClientRect(); const th = t.getBoundingClientRect()
  if (tr.width < 8 || th.width < 8) return null
  return { track: { x: tr.x, y: tr.y, w: tr.width, h: tr.height }, thumb: { x: th.x, y: th.y, w: th.width, h: th.height },
           state: n.getAttribute('data-state'), disabled: n.disabled || n.getAttribute('data-disabled') != null }
}
/** 這一頁量得到幾何的 Switch 有幾個(覆蓋記數;與上面取樣同一支 GEO) */
const countMeasurable = async () => {
  let n = 0
  for (const el of await page.locator('[role="switch"]').all()) if (await el.evaluate(GEO)) n += 1
  return n
}
/** 每則 story 量得到幾個 Switch(light 主題那一趟) */
const perStory = {}

/** 讀覆蓋清單:{ ok, stories, why } —— 缺檔、格式不對、空清單都不是 ok */
function readInventory() {
  if (!existsSync(INVENTORY)) return { ok: false, why: `讀不到覆蓋清單 scripts/switch-thumb-ring-inventory.json(先在本機跑 --write-inventory)` }
  try {
    const j = JSON.parse(readFileSync(INVENTORY, 'utf8'))
    const stories = j && typeof j.stories === 'object' && j.stories ? j.stories : null
    if (!stories) return { ok: false, why: '覆蓋清單格式不對(缺 stories 物件)' }
    const bad = Object.entries(stories).filter(([, n]) => !Number.isInteger(n) || n <= 0)
    if (bad.length) return { ok: false, why: `覆蓋清單格式不對(記數不是正整數:${bad.map(([k]) => k).slice(0, 5).join(', ')})` }
    if (!Object.keys(stories).length) return { ok: false, why: '覆蓋清單是空的' }
    return { ok: true, stories }
  } catch (error) {
    return { ok: false, why: `覆蓋清單讀不懂:${String(error?.message || error)}` }
  }
}

/** 覆蓋比對(純函式):清單裡的 story 這次少量 / 不在建置裡 → 列出;只比這次真的掃到的 */
function compareCoverage(recorded, measured, { scannedIds, buildIds }) {
  const missing = []; const fewer = []; const more = []
  for (const [id, n] of Object.entries(recorded)) {
    if (!buildIds.has(id)) { missing.push({ story: id, recorded: n }); continue }
    if (!scannedIds.has(id)) continue
    const got = measured[id] ?? 0
    if (got < n) fewer.push({ story: id, recorded: n, measured: got })
  }
  for (const [id, n] of Object.entries(measured)) if ((recorded[id] ?? 0) < n) more.push({ story: id, recorded: recorded[id] ?? 0, measured: n })
  return { missing, fewer, more }
}

const px = (png, x, y) => { const i = ((y * png.width) + x) << 2; return [png.data[i], png.data[i + 1], png.data[i + 2]] }
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= TOLERANCE)

for (const id of ids) {
  // 不用 `networkidle`(164 支 2分23秒)也不用「load + 根節點有子節點」(代理):等 Storybook 自己的渲染完成訊號 ——
  // 快,而且在較慢的機器上只會等久一點,不會量到空頁面而假裝沒有 Switch。
  try {
    await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { notFound: server.notFound })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    console.error(`✗ ${error.message}`)
    instrumentFails.push({ id, detail: error.detail })
    continue
  }
  // 這支 story 沒有 Switch 就直接跳過:切 theme + 等過渡每支要 ~0.5s,164 支裡只有少數有 Switch,
  // 不跳過的話光等待就多花 ~1.5 分鐘,CI 的 15 分鐘 job 會被撐爆(2026-09-12 實際被 cancel 過一次)。
  // (此時 story 已確定渲染完成且健康,0 個是事實不是沒量到)
  if (await page.locator('[role="switch"]').count() === 0) continue
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    // 等切 theme 之後的 transition-colors 走完(Switch 早已在畫面上,等的是顏色過渡,別量到中間值)
    await page.waitForTimeout(250)
    let measurable = 0
    for (const el of await page.locator('[role="switch"]').all()) {
      const geo = await el.evaluate(GEO)
      if (!geo) continue
      measurable += 1
      for (const hovered of [false, true]) {
        if (hovered) await page.mouse.move(geo.track.x + geo.track.w / 2, geo.track.y + geo.track.h / 2)
        else await page.mouse.move(2, 2)
        await page.waitForTimeout(hovered ? 420 : 200) // 等 transition-colors 走完,別量到過渡中間值
        const clip = { x: geo.track.x, y: geo.track.y + geo.track.h / 2 - 0.5, width: geo.track.w, height: 1 }
        if (clip.x < 0 || clip.y < 0) continue
        const png = PNG.sync.read(await page.screenshot({ clip }))
        const scale = png.width / geo.track.w
        const rel = (cssX) => Math.round((cssX - geo.track.x) * scale)
        // 那圈:thumb 左緣往內 1px。裸 track:thumb 對側、離 track 邊 3px 處。
        const ringX = rel(geo.thumb.x + 1)
        const thumbOnLeft = geo.thumb.x - geo.track.x < geo.track.w / 2
        const trackX = thumbOnLeft ? rel(geo.track.x + geo.track.w - 3) : rel(geo.track.x + 3)
        if (ringX < 0 || ringX >= png.width || trackX < 0 || trackX >= png.width) continue
        const ring = px(png, ringX, 0); const track = px(png, trackX, 0)
        sampled += 1
        if (!near(ring, track)) violations.push({ id, theme, state: geo.state, disabled: geo.disabled, hovered, ring: ring.join(','), track: track.join(',') })
        // 尺寸:量這一列上最長的連續「幾乎純白」段 = 視覺上的白色圓直徑。
        // 只在 unchecked + enabled 量(checked 有勾選圖示切斷白段;disabled 套 opacity 後不是純白)。
        const expectDisc = WHITE_DISC_BY_THUMB[Math.round(geo.thumb.w)]
        if (expectDisc != null && geo.state === 'unchecked' && !geo.disabled) {
          let best = 0, run = 0
          for (let x = 0; x < png.width; x += 1) {
            const q = px(png, x, 0)
            if (q[0] >= 250 && q[1] >= 250 && q[2] >= 250) { run += 1; if (run > best) best = run } else run = 0
          }
          const discPx = best / scale
          discSampled += 1
          if (Math.abs(discPx - expectDisc) > DISC_TOLERANCE) {
            discViolations.push({ id, theme, hovered, thumb: Math.round(geo.thumb.w), 實際: +discPx.toFixed(1), 期望: expectDisc })
          }
        }
      }
    }
    if (theme === 'light' && measurable > 0) perStory[id] = measurable
  }
}
// selftest ②:覆蓋對照組 —— 清單裡抽幾則,原樣數一次、再用帶 BREAK_PARAM 的網址(Switch 的 role 被拿掉)數一次;
// 數到的必須變少,而且下方的覆蓋比對必須點名它們。只在 selftest 跑;抽的是清單裡的 story,不受 selftest 的 ids 過濾。
const coverageControl = []
if (selftest) {
  const inv = readInventory()
  const sample = inv.ok ? Object.keys(inv.stories).sort().slice(0, COVERAGE_CONTROL_SAMPLES) : []
  for (const cid of sample) {
    try {
      const url = `${server.origin}/iframe.html?id=${encodeURIComponent(cid)}&viewMode=story`
      await openStory(page, url, { notFound: server.notFound })
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
      const intact = await countMeasurable()
      await openStory(page, `${url}&${BREAK_PARAM}`, { notFound: server.notFound })
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
      const broken = await countMeasurable()
      coverageControl.push({ story: cid, recorded: inv.stories[cid], intact, broken })
    } catch (error) {
      if (!(error instanceof StoryRenderInstrumentError)) throw error
      instrumentFails.push({ id: cid, detail: `覆蓋對照組開不起來:${error.detail}` })
    }
  }
}
await page.mouse.move(2, 2)
await browser.close(); await server.stop()
const buildIds = new Set(Object.entries(index.entries).filter(([, e]) => e.type === 'story').map(([sid]) => sid))

console.log(`掃過 ${ids.length} 個 story,取樣 ${sampled} 個 (switch × theme × hover) 組合;其中 ${discSampled} 個量了白色圓直徑`)
if (instrumentFails.length > 0) {
  // 沒量到 ≠ 沒問題:有 story 開不起來,這次的綠 / 對照組的紅都不成立 —— 儀器失效(exit 2),不是產品裁決
  console.error(`✗ 儀器失效:${instrumentFails.length} / ${ids.length} 個 story 開不起來(沒量到,不是產品裁決,也不算通過${selftest ? ';對照組結果不成立' : ''}):`)
  for (const f of instrumentFails.slice(0, 20)) console.error(`  ${f.id}:${f.detail}`)
  if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', '))
  process.exit(2)
}
if (sampled === 0) { console.error('✗ 取樣數 0 —— 這支閘什麼都沒驗到,視同紅燈(不是綠燈)'); process.exit(1) }
if (selftest) {
  // 對照組把外圈塗白 → 顏色不變式必紅,而且白色圓會從 16 脹到 20(外圈也變白)→ 尺寸不變式也必紅。
  if (violations.length === 0) { console.error('✗ 對照組:把那圈改成白色後顏色不變式仍然綠 —— 閘失效'); process.exit(1) }
  if (discSampled > 0 && discViolations.length === 0) { console.error('✗ 對照組:外圈塗白後白色圓應該脹大,尺寸不變式卻沒紅 —— 那半邊失效'); process.exit(1) }
  console.log(`✓ 對照組 ①:如預期紅(顏色 ${violations.length} 組 / 尺寸 ${discViolations.length} 組)`)
  const inv = readInventory()
  if (!inv.ok) { console.error(`✗ 對照組 ②:${inv.why}`); process.exit(1) }
  if (!coverageControl.length) { console.error('✗ 對照組 ②:覆蓋對照組一則都沒量到 —— 對照組沒有作用'); process.exit(1) }
  const ids2 = new Set(coverageControl.map((c) => c.story))
  const { fewer } = compareCoverage(Object.fromEntries(coverageControl.map((c) => [c.story, c.recorded])), Object.fromEntries(coverageControl.map((c) => [c.story, c.broken])), { scannedIds: ids2, buildIds })
  const named = new Set(fewer.map((x) => x.story))
  for (const c of coverageControl) console.log(`  ② ${c.story}:清單記 ${c.recorded},原樣量到 ${c.intact},拿掉 role 後 ${c.broken} → ${named.has(c.story) ? '覆蓋比對點名 ✓' : '覆蓋比對沒點名 ✗'}`)
  const effective = coverageControl.filter((c) => c.broken < c.intact)
  if (!effective.length) { console.error('✗ 對照組 ②:破壞沒有讓任何一則真的少量 —— 對照組沒有作用'); process.exit(1) }
  if (!coverageControl.every((c) => named.has(c.story))) { console.error('✗ 對照組 ②:覆蓋清單少量卻沒被點名 —— 覆蓋比對失效'); process.exit(1) }
  console.log('✓ 對照組 ②:覆蓋清單少量時點得出是哪一則,量具有效'); process.exit(0)
}
// --write-inventory:全掃、0 違規、0 儀器失效才寫(儀器失效上面已 exit 2);CI 永不寫
if (WRITE_INVENTORY) {
  if (process.env.CI) { console.error('✗ CI 不准寫覆蓋清單(--write-inventory 只在本機,寫完隨 PR 送審)'); process.exit(1) }
  if (violations.length || discViolations.length) { console.error('✗ 這一趟有違規,拒寫覆蓋清單(先修)'); process.exit(1) }
  const old = readInventory()
  const sorted = Object.fromEntries(Object.entries(perStory).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(INVENTORY, JSON.stringify({
    note: 'switch-thumb-ring-invariant 的覆蓋清單:每則 story 在 light 主題量得到幾何的 Switch 個數。只准由本閘 --write-inventory 全掃重寫;少量就紅。',
    generatedBy: 'node scripts/switch-thumb-ring-invariant.mjs --write-inventory',
    storyCount: Object.keys(sorted).length,
    switchCount: Object.values(sorted).reduce((a, b) => a + b, 0),
    stories: sorted,
  }, null, 2) + '\n')
  if (old.ok) {
    const { fewer } = compareCoverage(old.stories, sorted, { scannedIds: new Set(ids), buildIds })
    for (const x of fewer) console.log(`  ! 重寫讓記數變少:${x.story} ${x.recorded} → ${x.measured}`)
  }
  console.log(`已寫覆蓋清單:${Object.keys(sorted).length} 則 story、${Object.values(sorted).reduce((a, b) => a + b, 0)} 個 Switch`)
  process.exit(0)
}
// 覆蓋比對(取代原本「取樣數 0 才紅」的地板)
{
  const inv = readInventory()
  if (!inv.ok) { console.error(`✗ 覆蓋清單:${inv.why} —— 這一趟沒有覆蓋基準,不能當綠燈`); process.exit(1) }
  const { missing, fewer, more } = compareCoverage(inv.stories, perStory, { scannedIds: new Set(ids), buildIds })
  const recordedTotal = Object.values(inv.stories).reduce((a, b) => a + b, 0)
  console.log(`覆蓋清單:記 ${Object.keys(inv.stories).length} 則 / ${recordedTotal} 個 Switch`)
  for (const m of more) console.log(`  · 清單還沒記:${m.story} 記 ${m.recorded},這次 ${m.measured}`)
  if (missing.length || fewer.length) {
    for (const m of missing) console.error(`  ✗ 清單裡的 story 不在建置裡:${m.story}(記 ${m.recorded})`)
    for (const x of fewer) console.error(`  ✗ 少量:${x.story} 清單記 ${x.recorded} 個,這次量到 ${x.measured} 個 —— Switch 被探針漏掉或 story 改了;真的少了就跑 --write-inventory 並在 PR 說明`)
    process.exit(1)
  }
}
if (discViolations.length > 0) {
  console.error(`✗ ${discViolations.length} 個組合的白色圓直徑不符 switch.spec.md 尺寸表:`)
  for (const v of discViolations.slice(0, 12)) console.error(`  ${v.id} [${v.theme}] hover=${v.hovered} thumb ${v.thumb}px → 白圓 ${v.實際}px(期望 ${v.期望}px)`)
}
if (violations.length > 0) {
  console.error(`✗ ${violations.length} 個組合的 thumb 外圈顏色 ≠ track:`)
  for (const v of violations.slice(0, 20)) console.error(`  ${v.id} [${v.theme}] state=${v.state} disabled=${v.disabled} hover=${v.hovered}  圈=${v.ring}  track=${v.track}`)
  process.exit(1)
}
if (violations.length > 0 || discViolations.length > 0) process.exit(1)
console.log('✓ 所有 Switch 的 thumb 外圈都等於 track(含 hover / disabled / dark),且白色圓直徑符合 spec 尺寸表')
