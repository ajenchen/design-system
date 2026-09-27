#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DatePicker.Range 停留在某一天時,DateGrid 用單日 hover 圈同一種筆觸(1.5px primary-hover 的 ring / inset 陰影,
 *        不是會被取整的 border)在 td ::after 框出「點下去會變成」的區間:選結束日 → [開始日, 停留日]、選開始日 →
 *        [停留日, 結束日]、同一天 → 單格整圈、順序不合 → 不框;端點 = 整圈內描邊 + 朝外那側圓角 + 朝區間那側用
 *        clip-path 裁掉直邊(半圓,缺口朝區間)、中段只有上下兩條線、停留日的 button 不畫單格圈;鍵盤方向鍵移動
 *        焦點時同樣預覽;showTime 單月也預覽;指標每步 1px 慢慢走出格陣(先停進最外圈的縫或角、再出去)後框收掉(D1);
 *        偏離中線、貼邊、斜穿四格交會處跨到隔壁那天,每一步框都不縮(圓外的角 = 縫,D2);框亮著時在縫或角裡點下去 =
 *        點停留日(值變成那一天、浮層關),游標與日期同為手形;沒有框時縫與角點了沒反應、不是手形。
 *        SSOT date-picker.spec.md「區間預覽」/ date-grid.spec.md「區間預覽框」+「現行機制」+「縫與角裡的點擊」。
 *   紅: 任一格的 ::after 陰影(粗細 / 顏色 / 單邊或整圈)、圓角、clip-path、停留日 button 的 ring、鍵盤 / showTime 路徑
 *        與期望不符即 exit 1,訊息指名哪一格哪一項;--selftest 注入「td::after 陰影歸零」後同一組斷言必須大量紅(對照組),
 *        另攔下「從格陣本身走出去」的 mouseout 後慢慢移出的路必須紅(exit)、把「離開圓進到角」改寫成離開格陣後角落路線
 *        必須紅(corner)、攔下縫與角裡的點擊並把游標蓋回 auto 後點擊段必須紅(gapclick)。
 *   綠: 三則預覽 story(含角落路線、縫與角的點擊)+ 範圍模式 story(沒有框的對照面)+ showTime story + DateGrid range story
 *        的全部斷言相符時綠;同一份 storybook-static 重複跑結果恆等(無時鐘、無取樣;每步 1px 走固定路線)。
 *   儀器失效: 任一則 story 沒渲染完成(不存在的 id / story 檔 404 / play 丟錯 / 等的元素不出現 / 版面不靜止)→ 印 INSTRUMENT-FAIL、
 *        點名 story 與同源 404 帳本、exit 1 —— 不是產品裁決,也不算通過;--selftest 下同樣紅,不得讀成「對照組被抓到」。
 *
 * Run: `node scripts/datepicker-range-preview.mjs [--selftest]`
 */
import { join } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'

const SELFTEST = process.argv.includes('--selftest')
const STATIC = join(process.cwd(), 'storybook-static')
// 沒有建置 → MISSING-BUILD exit 2(缺前置,gate-meta lane 的拋棄式快照裡本來就沒有)
requireStorybookBuild(join(STATIC, 'iframe.html'))
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再用 serveStaticDir 讀活的 storybook-static、固定 6188 埠 ——
// 2026-09-24 別的 agent 同時 build-storybook 清空輸出目錄,讀活目錄的閘就把「儀器沒拿到檔」讀成「元件沒渲染」。
// 快照不完整 / 複製期間被重建 → 這裡丟 INSTRUMENT-FAIL(不是產品裁決)。
const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
// 起不了 Chromium:一般環境 SKIPPED-ENV exit 0;GOVERNANCE_BROWSER_REQUIRED=1 的 CI 瀏覽器 job → exit 1(lib/launch-browser.mjs)
const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const storyUrl = (id) => `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`
const story = (id) => storyUrl(`design-system-components-datepicker-展示--${id}`)
// 開 story:原本是「元素出現 + 固定睡 300ms」—— 固定睡眠是「浮層開好了」的代理(M37),而且 story 檔缺了、
// play 丟錯時只會在後面某一格「找不到格 / 陰影 none」紅,指控一個不存在的產品問題。改由共用的 openStory(M17):
// Storybook 回報渲染完成(含 play:開浮層、標記停留目標)→ 被量的元素出現 → 連續 SETTLE_FRAMES 個影格無 DOM 變動、
// 無進行中的有限長度動畫(浮層開啟動畫跑完才量 ::after 陰影與焦點框)。等不到 = StoryRenderInstrumentError,由最下方統一收。
const SETTLE_FRAMES = 10
const open = (url, waitFor) => openStory(page, url, { waitFor, settleFrames: SETTLE_FRAMES, notFound: server.notFound })

let fail = 0
// 每條斷言標一個「家族」:frame(區間框)/ focus(焦點框幾何)/ crossing(中線跨縫不閃)/ corner(偏離中線、穿過圓外的角不閃,D2)/
// gapclick(縫與角裡點下去 = 點停留日、游標手形)/ outside(兩月不渲染鄰月)/ single(單月鄰月淡字)/ exit(慢慢移出格陣框要收,D1)。
// selftest 的對照組分別弄壞這八樣,必須**每一家都至少紅一條**;只看總數 fail > 0 會讓「框那家紅了、焦點那家其實量不到」混過去
const failedFamilies = new Set()
let checked = 0
const ok = (cond, msg, family = 'frame') => { checked++; if (cond) console.log(`✓ ${msg}`); else { console.log(`✗ ${msg}`); fail++; failedFamilies.add(family) } }

/** 一格的框:td ::after 的陰影字串、兩側圓角、clip-path;button 的 ring 展開量(box-shadow 最大 spread)。
 *  兩月並列時月首月尾的日子會出現兩次(鄰月的 outside 格也掛同一個 data-day),一律量本月那一格。 */
//  兩月視圖自 2026-09-23 起不渲染鄰月日子;單月(showTime)仍有 outside 格,退回唯一那一格。
const inView = (d) => `[data-day="${d}"]:not([data-outside])`
const anyCell = (d) => `[data-day="${d}"]`
const cell = (day) => page.evaluate(([sel, fallback]) => {
  const td = document.querySelector(sel) ?? document.querySelector(fallback)
  if (!td) return null
  const a = getComputedStyle(td, '::after')
  const b = getComputedStyle(td.querySelector('button'))
  const px = (v) => Math.round(parseFloat(v) * 10) / 10
  const ring = (b.boxShadow.match(/0px 0px 0px ([\d.]+)px/g) || []).map((s) => parseFloat(s.split(' ').pop()))
  return { content: a.content, shadow: a.boxShadow, clip: a.clipPath, rl: px(a.borderTopLeftRadius), rr: px(a.borderTopRightRadius), ringMax: ring.length ? Math.max(...ring) : 0 }
}, [inView(day), anyCell(day)])
const primaryHover = () => page.evaluate(() => {
  const probe = document.createElement('div'); probe.style.color = 'var(--primary-hover)'; document.body.appendChild(probe)
  const c = getComputedStyle(probe).color; probe.remove(); return c
})
const hover = async (day) => {
  const preferred = page.locator(`${inView(day)} > button`)
  const target = (await preferred.count()) > 0 ? preferred : page.locator(`${anyCell(day)} > button`).first()
  await target.hover(); await page.waitForTimeout(80)
}
// 開好浮層後把程式搬過去的焦點放掉,只驗滑鼠這條路(鍵盤那條在下面另驗);焦點不落到別處,浮層不會關
const blurFocus = async () => { await page.evaluate(() => document.activeElement?.blur?.()); await page.waitForTimeout(50) }
// 某一格 button 的焦點框(outline 三件組 + 瀏覽器是否判成看得見的焦點)
const focusRing = (day) => page.evaluate((sel) => {
  const b = document.querySelector(sel)?.querySelector('button'); if (!b) return null
  const s = getComputedStyle(b)
  return { visible: b.matches(':focus-visible'), width: s.outlineWidth, offset: s.outlineOffset, color: s.outlineColor, style: s.outlineStyle }
}, `[data-day="${day}"]:not([data-outside])`)
const tokenColor = (token) => page.evaluate((t) => {
  const probe = document.createElement('div'); probe.style.color = `var(${t})`; document.body.appendChild(probe)
  const c = getComputedStyle(probe).color; probe.remove(); return c
}, token)

// 陰影字串判讀(Chrome 序列化:「<color> x y blur spread inset」)
const hasUniformInset = (c, color) => c.shadow.includes(`${color} 0px 0px 0px 1.5px inset`)
const hasTopBottom = (c, color) => c.shadow.includes(`${color} 0px 1.5px 0px 0px inset`) && c.shadow.includes(`${color} 0px -1.5px 0px 0px inset`)
const noShadow = (c) => c.shadow === 'none'

/** 斷言一段框:起點 = 整圈內描邊 + 左圓角 + 裁右側;中段 = 只有上下線、無圓角、無裁;終點鏡射;單格 = 整圈 + 全圓角 + 無裁 */
async function expectFrame(label, days, { single = false } = {}) {
  const color = await primaryHover()
  for (let i = 0; i < days.length; i++) {
    const c = await cell(days[i])
    if (!c) { ok(false, `${label}:${days[i]} 找不到格`); continue }
    const first = i === 0, last = i === days.length - 1
    if (single) {
      ok(hasUniformInset(c, color) && c.rl > 10 && c.rr > 10 && c.clip === 'none', `${label}:${days[i]} 單格 = 整圈(陰影 ${c.shadow};圓角 ${c.rl}/${c.rr};clip ${c.clip})`)
    } else if (first) {
      ok(hasUniformInset(c, color) && c.rl > 10 && c.rr === 0 && c.clip.startsWith('polygon('), `${label}:${days[i]} 起點 = 整圈內描邊 + 左半圓 + 裁右側(陰影 ${c.shadow};圓角 ${c.rl}/${c.rr};clip ${c.clip.slice(0, 24)})`)
    } else if (last) {
      ok(hasUniformInset(c, color) && c.rr > 10 && c.rl === 0 && c.clip.startsWith('polygon('), `${label}:${days[i]} 終點 = 整圈內描邊 + 右半圓 + 裁左側(陰影 ${c.shadow};圓角 ${c.rl}/${c.rr};clip ${c.clip.slice(0, 24)})`)
    } else {
      ok(hasTopBottom(c, color) && c.rl === 0 && c.rr === 0 && c.clip === 'none', `${label}:${days[i]} 中段 = 只有上下線(陰影 ${c.shadow};圓角 ${c.rl}/${c.rr})`)
    }
  }
}
async function expectNoFrame(label, days) {
  for (const d of days) {
    const c = await cell(d)
    ok(c && noShadow(c), `${label}:${d} 沒有框(陰影 ${c ? c.shadow : '找不到格'})`)
  }
}
async function expectNoRing(label, day) {
  const c = await cell(day)
  ok(c && c.ringMax === 0, `${label}:停留日 ${day} 的 button 不畫單格圈(ring ${c ? c.ringMax : '?'})`)
}

// 本地日期字串(禁 toISOString:它先轉 UTC,UTC+8 的午夜會變成前一天 —— 第一版閘就是這樣把整段期望值往前推了一天)
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const days = (from, to) => { const out = []; const d = new Date(from + 'T00:00:00'); const end = new Date(to + 'T00:00:00'); while (d <= end) { out.push(fmt(d)); d.setDate(d.getDate() + 1) } return out }

async function runSuite() {
  // ── 正在選結束日(已選 5/4–5/12)──
  await open(story('range-preview-extend'), '[data-visual-hover-target]')
  // 對照組把框、焦點線、跨縫機制、鄰月隱藏都弄壞:框歸零、焦點框改回往外畫、
  // 拔掉 `data-day-grid` 錨點(DateGrid 判斷「指標還在不在格陣裡」就是靠它;拔掉 = 縫隙裡照舊清掉停留日 → 框閃)、
  // 往一個鄰月格塞一顆 button → 框 / 焦點 / 跨格 / 鄰月 四類斷言都必須紅。
  //
  // 2026-09-24 換過一次機制:先前跨縫是靠 `td[data-day]>button::before{inset:-2px}` 的隱形命中帶,
  // 對照組因此是「把 ::before 縮回 0」。那條帶讓命中區(32 方)大於可視形狀(28 圓),違反
  // hit-area-canonical,已改成「只在指標真的離開整張格陣時才清停留日」(MUI 同款)。
  // **對照組必須跟著換** —— 舊那行 CSS 現在打在一個不存在的 ::before 上,會變成一個永遠不紅的假對照組。
  if (SELFTEST) {
    await page.addStyleTag({ content: 'td::after{box-shadow:none!important} td>button:focus-visible{outline-offset:2px!important}' })
    await page.evaluate(() => {
      document.querySelectorAll('[data-day-grid]').forEach((el) => el.removeAttribute('data-day-grid'))
      const td = document.querySelector('td[data-outside]'); if (td) td.appendChild(document.createElement('button'))
    })
  }
  await blurFocus()
  await hover('2026-05-20')
  await expectFrame('延長 5/4→5/20', days('2026-05-04', '2026-05-20'))
  await expectNoFrame('延長:區間外', ['2026-05-03', '2026-05-21'])
  await expectNoRing('延長', '2026-05-20')
  await hover('2026-05-07')
  await expectFrame('縮小 5/4→5/7', days('2026-05-04', '2026-05-07'))
  await expectNoFrame('縮小:5/8 起沒有框(只剩灰色軌道)', ['2026-05-08', '2026-05-12'])
  await expectNoRing('縮小', '2026-05-07')
  await hover('2026-05-04')
  await expectFrame('同一天 = 單格', ['2026-05-04'], { single: true })
  await expectNoFrame('單格:5/5 沒有框', ['2026-05-05'])
  await hover('2026-05-03')
  await expectNoFrame('順序不合(5/3 在開始日之前)不預覽', days('2026-05-03', '2026-05-12'))
  // 鍵盤:滑鼠移開,焦點放在 5/4,方向鍵右三下 → 焦點 5/7,框 5/4→5/7
  await page.mouse.move(2, 2); await page.waitForTimeout(80)
  await page.focus('[data-day="2026-05-04"] > button')
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(120)
  const focused = await page.evaluate(() => document.activeElement?.closest('[data-day]')?.getAttribute('data-day'))
  ok(focused === '2026-05-07', `鍵盤:方向鍵三下後焦點在 5/7(得 ${focused})`)
  await expectFrame('鍵盤焦點 5/4→5/7', days('2026-05-04', '2026-05-07'))
  await expectNoFrame('鍵盤:5/8 沒有框', ['2026-05-08'])

  // ── 鍵盤焦點框(user 2026-09-23:「date 的鍵盤焦點感覺要改成往內畫的那種」;藍底格 = 1px 白線退 3px,user 拍板 D)──
  // 量 outline 顏色前先等過渡:transition-colors 的 transition-property 含 outline-color,聚焦後立刻量會量到過渡中間值
  await page.waitForTimeout(250)
  const plain = await focusRing('2026-05-07')
  ok(plain?.visible && plain.width === '2px' && plain.offset === '-2px' && plain.color === (await tokenColor('--ring')),
    `焦點:非藍底(中段)5/7 = 往內 2px 藍線(${JSON.stringify(plain)})`, 'focus')
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(250)
  const filled = await focusRing('2026-05-04')
  ok(filled?.visible && filled.width === '1px' && filled.offset === '-3px' && filled.color === (await tokenColor('--on-emphasis')),
    `焦點:藍底端點 5/4 = 1px 白線退 3px(${JSON.stringify(filled)})`, 'focus')

  // ── 滑鼠與鍵盤互搶:最後一個輸入贏(user 2026-09-23:「滑鼠和鍵盤沒有搶走彼此的焦點」)──
  // 滑鼠停在 5/20 不動、鍵盤把焦點移到 5/5 → 框跟鍵盤;滑鼠再動到 5/7 → 框跟滑鼠;滑鼠離開格子 → 回到鍵盤焦點 5/5(不是消失)。
  // 第一版是「滑鼠恆優先」:滑鼠停著時方向鍵怎麼按框都不動 —— 第二段斷言在那版會紅(對照)。
  await hover('2026-05-20')
  await expectFrame('互搶:滑鼠停 5/20', days('2026-05-04', '2026-05-20'))
  await page.focus('[data-day="2026-05-04"] > button'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120)
  await expectFrame('互搶:滑鼠不動、鍵盤移到 5/5 → 框跟鍵盤', days('2026-05-04', '2026-05-05'))
  await expectNoFrame('互搶:5/6 與滑鼠所在的 5/20 都沒有框', ['2026-05-06', '2026-05-20'])
  await hover('2026-05-07')
  await expectFrame('互搶:滑鼠再動到 5/7 → 框跟滑鼠', days('2026-05-04', '2026-05-07'))
  await expectNoFrame('互搶:5/8 沒有框', ['2026-05-08'])
  // 框不是游標:滑鼠停在 5/7 時,鍵盤焦點框仍留在 5/5(focus-canonical 規則一:日期格是常駐清單,hover 不搬、不抹鍵盤焦點;
  // user 2026-09-24 問「鍵盤焦點不是應該要消失嗎?」—— 只有 cmdk / Radix Menu 那類反白 = 唯一游標的選單才搶)。
  // 對照組:selftest 把焦點框改回往外 → offset 斷言紅;真要抹掉焦點(blur)則 visible 變 false,也紅。
  const stay = await focusRing('2026-05-05')
  ok(stay?.visible && stay.width === '2px' && stay.offset === '-2px', `互搶:滑鼠停 5/7 時 5/5 的鍵盤焦點框仍在、不被 hover 抹掉(${JSON.stringify(stay)})`, 'focus')
  await page.mouse.move(2, 2); await page.waitForTimeout(120)
  await expectFrame('互搶:滑鼠離開格子 → 回到鍵盤焦點 5/5', days('2026-05-04', '2026-05-05'))
  await expectNoFrame('互搶:滑鼠離開後 5/6、5/7 沒有框', ['2026-05-06', '2026-05-07'])

  // ── 跨格不閃(user 2026-09-23:「從某日水平移動到其隔日,藍色的區間框線都會閃動一下」)──
  // 停留日掛在 button 的 enter / leave,格與格之間 4px 縫隙屬於 table:指標經過縫隙先 leave(整條框卸掉)再 enter(補回)。
  // 修法(2026-09-24 改版):DateGrid 只在**指標真的離開整張格陣**時才把 leave 轉發給消費端
  //(`date-grid.tsx` 的 handleDayMouseLeave + `[data-day-grid]` 錨點;MUI DateRangeCalendar 同款)。
  // 先前是靠 button ::before 外擴 2px 的隱形命中帶,已撤 —— 那讓命中區大於可視形狀,違反 hit-area-canonical。
  // 單步 hover 永遠看不到(React 把同一個 mouseout 的 leave+enter 批成一次 commit),所以這裡走 30 小步、
  // 每一步量「還有幾格有框」,最少一格都不能掉到 0。
  // 對照組:selftest 拔掉 `data-day-grid` 錨點 → 縫隙重現 → 最少幾格掉到 0(2026-09-24 實測兩條跨法都真的掉到 0)。
  const framedCount = () => page.evaluate(() => [...document.querySelectorAll('td[data-day]')].filter((td) => getComputedStyle(td, '::after').boxShadow !== 'none').length)
  const crossing = async (fromDay, toDay, label) => {
    const a = await page.locator(`${inView(fromDay)} > button`).boundingBox()
    const b = await page.locator(`${inView(toDay)} > button`).boundingBox()
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.waitForTimeout(80)
    let min = Infinity
    for (let i = 1; i <= 30; i++) {
      await page.mouse.move(a.x + a.width / 2 + (b.x - a.x) * (i / 30), a.y + a.height / 2 + (b.y - a.y) * (i / 30))
      await page.waitForTimeout(20)
      min = Math.min(min, await framedCount())
    }
    ok(min > 0, `${label}:30 小步跨格,框最少仍有 ${min} 格(0 = 縫隙裡整條框消失)`, 'crossing')
  }
  // 先把鍵盤焦點放掉、指標移出格區:上一段留著鍵盤焦點 5/5,指標一離開格子框就退回 5/4→5/5(兩格),「最少幾格」永遠 ≥ 2,
  // 縫隙裡整條框消失的那一幀根本量不到(2026-09-24 審查抓到:對照組把 ::before 縮回 0 也不會紅)。沒有鍵盤焦點時 leave → null → 0 格
  await blurFocus(); await page.mouse.move(2, 2); await page.waitForTimeout(80)
  await expectNoFrame('跨格前:焦點放掉、指標移開後沒有任何框', ['2026-05-04', '2026-05-05'])
  await crossing('2026-05-20', '2026-05-21', '水平跨格 5/20→5/21')
  await crossing('2026-05-20', '2026-05-27', '垂直跨列 5/20→5/27')

  // ── 兩月時鄰月日子不渲染(user 2026-09-23 拍板;MUI / Polaris / flatpickr / RDP 預設同款)──
  const outside = await page.evaluate(() => {
    const tds = [...document.querySelectorAll('td[data-outside]')]
    return { cells: tds.length, buttons: tds.filter((td) => td.querySelector('button')).length, visible: tds.filter((td) => getComputedStyle(td).visibility !== 'hidden').length }
  })
  ok(outside.cells > 0 && outside.buttons === 0 && outside.visible === 0, `兩月:鄰月格 ${outside.cells} 個全部不渲染日子(有 button ${outside.buttons};可見 ${outside.visible})`, 'outside')

  // ── 上膛(對面那端已有值):單格 hover 圈的壓制是**靜態**的 —— 停留之前就掛在每一個「停留會有框」的格上,不等 React 慢一幀
  //(user 2026-09-23:「hover 到日期都會先看到一圈圓形藍色外框,閃了一下,才會變成半圓」)。
  // 看 class 只為了驗「靜態」(停留前就在);圈有沒有真的消失由 expectNoRing 量 box-shadow。
  // DatePicker.Range 選結束日時,開始日之前的日子是 disabled(不可點,自己就不畫圈、也帶同一串壓制 class)——
  // 所以「停留會有框」= 每一個可點的格;disabled 格不算進來,「不是無條件壓制」由下面「沒上膛」對照組證明。
  await blurFocus(); await page.mouse.move(2, 2); await page.waitForTimeout(80)
  const armed = await page.evaluate(() => [...document.querySelectorAll('td[data-day]:not([data-outside]):not([data-disabled])')]
    .map((td) => ({ day: td.getAttribute('data-day'), armed: td.className.includes('hover:!ring-0') })))
  const notArmed = armed.filter(({ armed: a }) => !a).map(({ day }) => day)
  ok(armed.length > 0 && notArmed.length === 0, `上膛:每一個可點的格(${armed.length} 格)在任何停留之前就已壓制單格圈(漏掉:${notArmed.join(',') || '無'})`)
  const before = await page.evaluate(() => document.querySelector('[data-day="2026-05-03"]:not([data-outside])')?.hasAttribute('data-disabled'))
  ok(before === true, '上膛:順序不合的 5/3 在選結束日時是 disabled(不可點),沒有框也沒有圈')

  // ── 慢慢移出格陣:框要收(D1,2026-09-26,待辦總帳 N54;date-grid.spec.md「現行機制」第 4 條)──
  // 上面「互搶」段的離開是一次跳到 (2,2):不經過縫,day button 的 leave 直接落在格陣外、照常轉發 → 一定會清,量不到 D1。
  // D1 只在「指標先停進最外圈那道縫(leave 被吞)、再從縫走出格陣」時發作 —— 所以這裡每步 1px 走
  //(修之前實測每步 1–4、8px 都卡住,6、12、20px 才會清:快慢決定指標有沒有「停」在縫裡)。
  // 兩條路:(a) 從六月最右一欄的 6/13 往右走到浮層外 20px;(b) 從五月最右一欄的 5/16 往右走到兩張月曆之間的空白正中。
  // 兩面對照(M32 / M37):同一條路上,指標還在格陣裡(縫)的最後一步必須**還有框** —— 證明這支量得到框、也證明縫的行為沒被改
  //(縫裡照亮屬「預覽類元件」規則,user 未同意改);走出格陣之後必須 0 格(沒有鍵盤焦點可退回)。
  // selftest 對照組:攔下「從格陣本身走出去」的那一個 mouseout(React 靠它合成 table 的 onMouseLeave)→ 欠著的 leave 補送不了 →
  // 兩條路都必須紅。只攔 target 是格陣本身的那一個:day button 的 leave(target = button)照常,crossing 等其他家族不受影響。
  await open(story('range-preview-extend'), '[data-visual-hover-target]')
  if (SELFTEST) {
    await page.evaluate(() => document.addEventListener('mouseout', (e) => {
      const t = e.target
      if (t instanceof Element && t.hasAttribute('data-day-grid') && !(e.relatedTarget instanceof Node && t.contains(e.relatedTarget))) e.stopImmediatePropagation()
    }, true))
  }
  await blurFocus(); await page.mouse.move(2, 2); await page.waitForTimeout(80)
  const gridBoxOf = (day) => page.evaluate((sel) => {
    const td = document.querySelector(sel)
    const grid = td?.closest('[data-day-grid]')?.getBoundingClientRect()
    const panel = td?.closest('[role="dialog"]')?.getBoundingClientRect()
    return grid && panel ? { gridLeft: grid.left, gridRight: grid.right, panelRight: panel.right } : null
  }, inView(day))
  // dy:離格子正中線的垂直偏移。(c) 走貼上緣 2px 那一條 —— 先穿過圓外的角(2026-09-26 起算「還在上一天」)、再從最外圈出去,
  // 驗「角」與 D1 的補送是同一條路:角裡框要在、出去之後要收。
  const slowExit = async (fromDay, endX, label, dy = 0) => {
    const b = await page.locator(`${inView(fromDay)} > button`).boundingBox()
    const box = await gridBoxOf(fromDay)
    if (!b || !box) { ok(false, `${label}:找不到起點 ${fromDay} 或它的格陣 / 浮層`, 'exit'); return }
    const y = b.y + b.height / 2 + dy
    let x = b.x + b.width / 2
    await page.mouse.move(x, y); await page.waitForTimeout(80)
    let lastInside = null
    while (x < endX) {
      x += 1
      await page.mouse.move(x, y)
      // 格陣盒內的最後一步(縫):量一次,之後再也不在格陣裡
      if (x < box.gridRight && x + 1 >= box.gridRight) { await page.waitForTimeout(20); lastInside = await framedCount() }
    }
    await page.waitForTimeout(150)
    const after = await framedCount()
    ok(lastInside !== null && lastInside > 0, `${label}:還在格陣裡的最後一步(縫)框仍在(${lastInside} 格;0 / null = 量不到框,這條路的「離開後 0 格」不算證據)`, 'exit')
    ok(after === 0, `${label}:每步 1px 慢慢走出格陣後框收掉(剩 ${after} 格;> 0 = 框卡在上一天,D1)`, 'exit')
  }
  const june = await gridBoxOf('2026-06-13')
  if (june) await slowExit('2026-06-13', june.panelRight + 20, '慢慢移出 (a) 6/13 → 浮層外 20px')
  else ok(false, '慢慢移出 (a):找不到 6/13 的格陣 / 浮層', 'exit')
  await page.mouse.move(2, 2); await page.waitForTimeout(80)
  const may = await gridBoxOf('2026-05-16')
  if (may && june) await slowExit('2026-05-16', (may.gridRight + june.gridLeft) / 2, '慢慢移出 (b) 5/16 → 兩張月曆之間')
  else ok(false, '慢慢移出 (b):找不到 5/16 或 6/13 的格陣', 'exit')
  await page.mouse.move(2, 2); await page.waitForTimeout(80)
  const juneBtn = await page.locator(`${inView('2026-06-13')} > button`).boundingBox()
  if (june && juneBtn) await slowExit('2026-06-13', june.panelRight + 20, '慢慢移出 (c) 6/13 貼上緣 2px(先穿過圓外的角)→ 浮層外 20px', -(juneBtn.height / 2 - 2))
  else ok(false, '慢慢移出 (c):找不到 6/13 的格陣 / 浮層', 'exit')

  // ── 偏離中線跨格不閃:圓外的四個角也算「還在上一天」(D2,2026-09-26;date-grid.spec.md「現行機制」第 2 條)──
  // 上面「跨格不閃」只走兩格中心的連線:那條線從圓直接進縫、再直接進下一顆圓,**一步都不經過圓外的角**,所以角落會清框的那一版
  // 在它眼裡永遠是綠的(2026-09-26 實測:偏 1/4 格、貼上緣、貼左緣、斜向四條路整條框 17 → 0 各 6 / 14 / 14 / 12 步,中線 0 步)。
  // 這裡照 R21 量具的四條路(每步 1px):偏上 1/4 格、貼上緣 2px、貼左緣 2px 往下、斜穿四格交會處。
  // 判定:每一步框的格數都不得少於起點(停在 5/20,17 格);兩面對照 ——
  //   (1) 走到終點那天框必須變長(量得到框在變,不是一路讀到同一個數);
  //   (2) 路線上必須真的有幾步停在「格子裡、圓外」的角(不然這條路沒有在驗角)。
  // selftest 對照組:把「離開圓、進到角」的那一個 mouseout 改寫成「離開到格陣外」(= 舊版把角當成離開)→ 四條路都必須紅;
  // 中線那條不經過角,不受這個對照組影響 —— 這正是本段存在的理由。
  await open(story('range-preview-extend'), '[data-visual-hover-target]')
  if (SELFTEST) {
    await page.evaluate(() => document.addEventListener('mouseout', (e) => {
      const t = e.target, r = e.relatedTarget
      if (e.isTrusted && t instanceof Element && t.matches('td[data-day] > button') && r instanceof Element && r.matches('td[data-day]')) {
        e.stopImmediatePropagation()
        t.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: document.body, clientX: e.clientX, clientY: e.clientY }))
      }
    }, true))
  }
  await blurFocus(); await page.mouse.move(2, 2); await page.waitForTimeout(80)
  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const whereAt = (x, y) => page.evaluate(([px, py]) => {
    const el = document.elementFromPoint(px, py)
    if (!el) return null
    if (el.closest('td[data-day] > button')) return 'button'
    if (el.closest('td[data-day]')) return 'corner'
    return el.tagName.toLowerCase()
  }, [x, y])
  const btnBox = async (day) => page.locator(`${inView(day)} > button`).boundingBox()
  const cornerWalk = async (label, p0, p1) => {
    const home = await btnBox('2026-05-20')
    if (!home) { ok(false, `${label}:找不到 5/20`, 'corner'); return }
    await page.mouse.move(home.x + home.width / 2, home.y + home.height / 2, { steps: 3 }); await settle()
    await page.mouse.move(p0.x, p0.y, { steps: 2 }); await settle()
    const n = Math.round(Math.max(Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y)))
    const steps = []
    for (let i = 0; i <= n; i++) {
      const x = p0.x + ((p1.x - p0.x) * i) / n, y = p0.y + ((p1.y - p0.y) * i) / n
      await page.mouse.move(x, y); await settle()
      steps.push({ count: await framedCount(), where: await whereAt(x, y) })
    }
    const start = steps[0].count, end = steps.at(-1).count
    const dropped = steps.filter((s) => s.count < start)
    const corners = steps.filter((s) => s.where === 'corner').length
    ok(start > 0 && end > start, `${label}:起點框 ${start} 格、走到終點 ${end} 格(對照:終點必須比起點長,證明量得到框在變)`, 'corner')
    ok(corners > 0, `${label}:路線上有 ${corners} 步停在格子裡、圓外的角(0 = 這條路沒有在驗角)`, 'corner')
    ok(dropped.length === 0, `${label}:${steps.length} 步(每步 1px)框都不少於起點 ${start} 格(縮掉 ${dropped.length} 步,最少 ${Math.min(...steps.map((s) => s.count))} 格;縮掉時指標在 ${[...new Set(dropped.map((s) => s.where))].join('、') || '—'})`, 'corner')
  }
  const d20 = await btnBox('2026-05-20'), d21 = await btnBox('2026-05-21'), d27 = await btnBox('2026-05-27'), d28 = await btnBox('2026-05-28')
  if (d20 && d21 && d27 && d28) {
    const c = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
    const q = d20.height / 4
    await cornerWalk('角落路線 橫向偏上 1/4 格 5/20→5/21', { x: c(d20).x, y: c(d20).y - q }, { x: c(d21).x, y: c(d20).y - q })
    await cornerWalk('角落路線 橫向貼上緣 2px 5/20→5/21', { x: c(d20).x, y: d20.y + 2 }, { x: c(d21).x, y: d20.y + 2 })
    await cornerWalk('角落路線 直向貼左緣 2px 5/20→5/27', { x: d20.x + 2, y: c(d20).y }, { x: d20.x + 2, y: c(d27).y })
    await cornerWalk('角落路線 斜穿四格交會處 5/20→5/28', c(d20), c(d28))
  } else ok(false, '角落路線:找不到 5/20 / 5/21 / 5/27 / 5/28', 'corner')

  // ── 縫與角裡點下去 = 點停留日;游標與日期同為手形(2026-09-26,待辦總帳 N54 ①;date-grid.spec.md「縫與角裡的點擊」)──
  // 每一格都重開 story:點下去會選定、浮層會關。先停在 5/20 正中(框 5/4→5/20),再小步移進縫或角裡點一下。
  // 兩面對照 —— 該有反應的:框亮著時,角(5/20 右上)與縫(5/20 右邊那 4px 中點)點下去,結束日變 5/20、浮層關;
  // 不該有反應的:兩端都空(沒有框)時,角裡點下去什麼都不變、游標不是手形(`hit-area-canonical`「懸停回饋的形狀 ≡ 命中區」)。
  // 每一格先驗「指標真的在縫 / 角裡」「框還亮著」—— 不然「點了有反應」可能只是點到了日子本身。
  // selftest 對照組:攔下格陣裡、不在 button 上的 click,並把格陣的游標蓋回 auto → 「該有反應」那兩格必須紅。
  const rangeTexts = () => page.evaluate(() => [...document.querySelectorAll('button[aria-haspopup="dialog"]')].map((b) => b.textContent?.trim() ?? ''))
  const gridIsOpen = () => page.evaluate(() => !!document.querySelector('[data-day-grid]'))
  const cursorAt = (x, y) => page.evaluate(([px, py]) => { const el = document.elementFromPoint(px, py); return el ? getComputedStyle(el).cursor : null }, [x, y])
  const breakGapClick = async () => {
    if (!SELFTEST) return
    await page.addStyleTag({ content: '[data-day-grid], [data-day-grid] td { cursor: auto !important }' })
    await page.evaluate(() => document.addEventListener('click', (e) => {
      const t = e.target
      if (t instanceof Element && t.closest('[data-day-grid]') && !t.closest('button')) e.stopImmediatePropagation()
    }, true))
  }
  const gapClick = async (label, spot, expectWhere) => {
    await open(story('range-preview-extend'), '[data-visual-hover-target]')
    await breakGapClick()
    await blurFocus()
    const b = await btnBox('2026-05-20')
    if (!b) { ok(false, `${label}:找不到 5/20`, 'gapclick'); return }
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 3 }); await settle()
    const p = spot(b)
    await page.mouse.move(p.x, p.y, { steps: 8 }); await settle()
    const where = await whereAt(p.x, p.y), lit = await framedCount(), cursor = await cursorAt(p.x, p.y), before = await rangeTexts()
    await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(150); await settle()
    const after = await rangeTexts(), open_ = await gridIsOpen()
    ok(where === expectWhere && lit > 0, `${label}:指標在${expectWhere === 'corner' ? '角' : '縫'}裡(${where})、框亮著(${lit} 格)—— 不成立就不是在驗縫 / 角`, 'gapclick')
    ok(cursor === 'pointer', `${label}:游標與日期同為手形(${cursor})`, 'gapclick')
    ok(after[1] === '2026/05/20' && after[0] === before[0] && !open_, `${label}:點下去 = 點 5/20 —— 結束日 ${before[1]} → ${after[1]}、開始日 ${after[0]}、浮層${open_ ? '仍開著' : '已關'}`, 'gapclick')
  }
  await gapClick('縫與角的點擊 角(5/20 右上)', (b) => ({ x: b.x + b.width - 2, y: b.y + 2 }), 'corner')
  await gapClick('縫與角的點擊 縫(5/20 右側 4px 的中點)', (b) => ({ x: b.x + b.width + 2, y: b.y + b.height / 2 }), 'table')
  // 不該有反應的那一面:兩端都空 → 沒有框 → 角裡點下去不選、游標不是手形
  await open(story('range-picker'), 'button[aria-haspopup="dialog"]')
  await page.locator('button[aria-haspopup="dialog"]').nth(2).click() // 第二個 Range(「Empty 初始狀態」)的開始欄
  await page.waitForSelector('td[data-day]:not([data-hidden])', { timeout: 5000 }); await settle()
  await blurFocus()
  const emptyBefore = await rangeTexts()
  const bareBtn = await page.evaluate(() => {
    const b = document.querySelector('td[data-day]:not([data-outside]) > button:not(:disabled)')?.getBoundingClientRect()
    return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : null
  })
  if (bareBtn) {
    await page.mouse.move(bareBtn.x + bareBtn.width / 2, bareBtn.y + bareBtn.height / 2, { steps: 3 }); await settle()
    const p = { x: bareBtn.x + bareBtn.width - 2, y: bareBtn.y + 2 }
    await page.mouse.move(p.x, p.y, { steps: 8 }); await settle()
    const where = await whereAt(p.x, p.y), lit = await framedCount(), cursor = await cursorAt(p.x, p.y)
    await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(150); await settle()
    const after = await rangeTexts(), open_ = await gridIsOpen()
    ok(where === 'corner' && lit === 0, `沒有框時:指標在角裡(${where})、沒有任何框(${lit} 格)`, 'gapclick')
    ok(cursor !== 'pointer', `沒有框時:角裡的游標不是手形(${cursor})—— 點了不會有反應的地方不給手形`, 'gapclick')
    ok(open_ && JSON.stringify(after) === JSON.stringify(emptyBefore), `沒有框時:角裡點下去什麼都不變(浮層${open_ ? '仍開著' : '被關了'};值 ${JSON.stringify(after)})`, 'gapclick')
  } else ok(false, '沒有框時:找不到可點的日子', 'gapclick')

  // ── 正在選開始日 ──
  await open(story('range-preview-start'), '[data-visual-hover-target]')
  if (SELFTEST) await page.addStyleTag({ content: 'td::after{box-shadow:none!important}' })
  await blurFocus()
  await hover('2026-05-01')
  await expectFrame('重選開始日 5/1→5/12', days('2026-05-01', '2026-05-12'))
  await expectNoFrame('重選開始日:5/13 沒有框', ['2026-05-13'])
  await expectNoRing('重選開始日', '2026-05-01')
  await hover('2026-05-13')
  await expectNoFrame('順序不合(5/13 在結束日之後)不預覽', ['2026-05-12', '2026-05-13'])

  // ── showTime 單月(已選 4/15 09:00–4/20 18:00,開開始日那一端)──
  await open(story('show-time-range-popover-open'), '[data-day="2026-04-18"]')
  if (SELFTEST) await page.addStyleTag({ content: 'td::after{box-shadow:none!important}' })
  await blurFocus()
  await hover('2026-04-18')
  await expectFrame('showTime 重選開始日 4/18→4/20', days('2026-04-18', '2026-04-20'))
  await expectNoRing('showTime', '2026-04-18')
  // 單月:鄰月日子照舊顯示、淡字(spec「outside」列);selftest 把它染紅
  if (SELFTEST) await page.addStyleTag({ content: 'td[data-outside]>button{color:red!important}' })
  const single = await page.evaluate(() => { const b = document.querySelector('td[data-outside]:not([data-disabled]):not([data-selected]) > button:not(:disabled)'); return b ? getComputedStyle(b).color : null })
  ok(single !== null && single === (await tokenColor('--fg-muted')), `單月:鄰月日子顯示且淡字(${single};token ${await tokenColor('--fg-muted')})`, 'single')

  // ── 對照組:沒上膛(兩端都空)→ 停留沒有框,單格 hover 圈照畫(壓制不是無條件的)──
  await open(story('range-picker'), 'button[aria-haspopup="dialog"]')
  await page.locator('button[aria-haspopup="dialog"]').nth(2).click() // 第二個 Range(「Empty 初始狀態」)的開始欄
  // 兩月視圖的第一個 td 是不渲染的鄰月格(data-hidden,visibility hidden),waitForSelector 等「第一個可見」會逾時 → 明確等可見格
  await page.waitForSelector('td[data-day]:not([data-hidden])', { timeout: 5000 }); await page.waitForTimeout(200)
  await blurFocus()
  const bareDay = await page.evaluate(() => document.querySelector('td[data-day]:not([data-outside]) > button:not(:disabled)')?.closest('td')?.getAttribute('data-day'))
  await hover(bareDay)
  const bare = await cell(bareDay)
  ok(bare && bare.ringMax === 1.5 && noShadow(bare), `沒上膛:${bareDay} 停留只有單格圈、沒有框(ring ${bare ? bare.ringMax : '?'};陰影 ${bare ? bare.shadow : '?'})`)

  // ── DateGrid 自己的 mode="range"(RDP 把中段也標成 selected):端點 = 白線退 3px、中段要壓回一般 2px 藍線 ──
  await open(storyUrl('design-system-internal-dategrid-展示--range'), 'td[data-day][data-selected]')
  if (SELFTEST) await page.addStyleTag({ content: 'td>button:focus-visible{outline-offset:2px!important}' })
  const [gridStart, gridMiddle] = await page.evaluate(() => [...document.querySelectorAll('td[data-day][data-selected]:not([data-outside])')].map((td) => td.getAttribute('data-day')))
  await page.focus(`[data-day="${gridStart}"]:not([data-outside]) > button`); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250)
  const gridMid = await focusRing(gridMiddle)
  ok(gridMid?.visible && gridMid.width === '2px' && gridMid.offset === '-2px' && gridMid.color === (await tokenColor('--ring')),
    `DateGrid range:中段 ${gridMiddle}(RDP 也標 selected)焦點壓回往內 2px 藍線(${JSON.stringify(gridMid)})`, 'focus')
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(250)
  const gridEnd = await focusRing(gridStart)
  ok(gridEnd?.visible && gridEnd.width === '1px' && gridEnd.offset === '-3px' && gridEnd.color === (await tokenColor('--on-emphasis')),
    `DateGrid range:端點 ${gridStart} 焦點 = 1px 白線退 3px(${JSON.stringify(gridEnd)})`, 'focus')
}

let instrumentError = null
try {
  await runSuite()
} catch (error) {
  if (!(error instanceof StoryRenderInstrumentError)) throw error
  instrumentError = error
} finally {
  await browser.close(); await server.stop()
}

// 儀器失效:這次沒量完 —— 不是產品裁決,也不算通過;selftest 下也不得讀成「對照組被抓到」(已紅的那幾條不算數)
if (instrumentError) {
  const missing = [...new Set(server.notFound)]
  console.error(`✗ ${instrumentError.message}`)
  if (missing.length) console.error(`  同源 404 帳本:${missing.join(', ')}`)
  console.error(`  中斷前已量 ${checked} 項${SELFTEST ? '(對照組)' : ''}:沒量完的閘不給裁決 —— exit 1`)
  process.exit(1)
}
// 一條都沒量到 ≠ 全部相符(M37)
if (checked === 0) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:一條斷言都沒有執行 —— 沒量到不是通過`); process.exit(1) }

if (SELFTEST) {
  // 對照組:注入「陰影歸零」後,上面的斷言必須大量紅 —— 綠就代表這支閘量不到框
  if (fail === 0) { console.log('✗ 對照組:td::after 陰影歸零後閘仍全綠 —— 這支閘量不到框'); process.exit(1) }
  // 八個家族各自被弄壞、各自必須紅:哪一家綠,就是那一家的量具是假的
  const families = ['frame', 'focus', 'crossing', 'corner', 'gapclick', 'outside', 'single', 'exit']
  const silent = families.filter((f) => !failedFamilies.has(f))
  for (const f of families) console.log(`${failedFamilies.has(f) ? '✓' : '✗'} 對照組 ${f}:弄壞後${failedFamilies.has(f) ? '有紅' : '仍全綠 —— 量不到'}`)
  if (silent.length) { console.log(`✗ 對照組:${silent.join(' / ')} 弄壞後沒有任何一條紅`); process.exit(1) }
  console.log(`✓ 對照組:${families.length} 個家族全部會紅(共 ${fail} 項)`)
  process.exit(0)
}
console.log(fail ? `✗ ${fail} 項未通過` : '✅ DatePicker.Range 區間預覽框 PASS')
process.exit(fail ? 1 : 0)
