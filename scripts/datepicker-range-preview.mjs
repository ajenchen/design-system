#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DatePicker.Range 停留在某一天時,DateGrid 用單日 hover 圈同一種筆觸(1.5px primary-hover 的 ring / inset 陰影,
 *        不是會被取整的 border)在 td ::after 框出「點下去會變成」的區間:選結束日 → [開始日, 停留日]、選開始日 →
 *        [停留日, 結束日]、同一天 → 單格整圈、順序不合 → 不框;端點 = 整圈內描邊 + 朝外那側圓角 + 朝區間那側用
 *        clip-path 裁掉直邊(半圓,缺口朝區間)、中段只有上下兩條線、停留日的 button 不畫單格圈;鍵盤方向鍵移動
 *        焦點時同樣預覽;showTime 單月也預覽。SSOT date-picker.spec.md「區間預覽」/ date-grid.spec.md「區間預覽框」。
 *   紅: 任一格的 ::after 陰影(粗細 / 顏色 / 單邊或整圈)、圓角、clip-path、停留日 button 的 ring、鍵盤 / showTime 路徑
 *        與期望不符即 exit 1,訊息指名哪一格哪一項;--selftest 注入「td::after 陰影歸零」後同一組斷言必須大量紅(對照組)。
 *   綠: 三則預覽 story + showTime story 的全部斷言相符時綠;同一份 storybook-static 重複跑結果恆等(無時鐘、無取樣)。
 *
 * Run: `node scripts/datepicker-range-preview.mjs [--selftest]`
 */
import { resolve } from 'node:path'
import { launchBrowserOrSkip, gotoStory } from './lib/launch-browser.mjs'
import { serveStaticDir, attachStaticRoute } from './lib/sandboxed-verify-browser.mjs'

const SELFTEST = process.argv.includes('--selftest')
const ROOT = process.cwd()
const served = await serveStaticDir(resolve(ROOT, 'storybook-static'), { port: 6188 })
const browser = await launchBrowserOrSkip()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await attachStaticRoute(page, served)
const story = (id) => `${served.origin}/iframe.html?id=${encodeURIComponent(`design-system-components-datepicker-展示--${id}`)}&viewMode=story`

let fail = 0
const ok = (cond, msg) => { if (cond) console.log(`✓ ${msg}`); else { console.log(`✗ ${msg}`); fail++ } }

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
  await gotoStory(page, story('range-preview-extend'), { waitFor: '[data-visual-hover-target]', settle: 300 })
  // 對照組把框、焦點線、跨縫命中區、鄰月隱藏都弄壞:框歸零、焦點框改回往外畫、button ::before 縮回 0(縫隙重現)、
  // 往一個鄰月格塞一顆 button → 框 / 焦點 / 跨格 / 鄰月 四類斷言都必須紅
  if (SELFTEST) {
    await page.addStyleTag({ content: 'td::after{box-shadow:none!important} td>button:focus-visible{outline-offset:2px!important} td[data-day]>button::before{inset:0!important}' })
    await page.evaluate(() => { const td = document.querySelector('td[data-outside]'); if (td) td.appendChild(document.createElement('button')) })
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
    `焦點:非藍底(中段)5/7 = 往內 2px 藍線(${JSON.stringify(plain)})`)
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(250)
  const filled = await focusRing('2026-05-04')
  ok(filled?.visible && filled.width === '1px' && filled.offset === '-3px' && filled.color === (await tokenColor('--on-emphasis')),
    `焦點:藍底端點 5/4 = 1px 白線退 3px(${JSON.stringify(filled)})`)

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
  await page.mouse.move(2, 2); await page.waitForTimeout(120)
  await expectFrame('互搶:滑鼠離開格子 → 回到鍵盤焦點 5/5', days('2026-05-04', '2026-05-05'))
  await expectNoFrame('互搶:滑鼠離開後 5/6、5/7 沒有框', ['2026-05-06', '2026-05-07'])

  // ── 跨格不閃(user 2026-09-23:「從某日水平移動到其隔日,藍色的區間框線都會閃動一下」)──
  // 停留日掛在 button 的 enter / leave,格與格之間 4px 縫隙屬於 table:指標經過縫隙先 leave(整條框卸掉)再 enter(補回)。
  // 修法是 button ::before 命中區外擴 2px 補滿縫隙(與框跨縫的 −2px 同數字)。單步 hover 永遠看不到(React 把同一個
  // mouseout 的 leave+enter 批成一次 commit),所以這裡走 30 小步、每一步量「還有幾格有框」,最少一格都不能掉到 0。
  // 對照組:selftest 把 ::before 縮回 0 → 縫隙重現 → 最少幾格掉到 0。
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
    ok(min > 0, `${label}:30 小步跨格,框最少仍有 ${min} 格(0 = 縫隙裡整條框消失)`)
  }
  await crossing('2026-05-20', '2026-05-21', '水平跨格 5/20→5/21')
  await crossing('2026-05-20', '2026-05-27', '垂直跨列 5/20→5/27')

  // ── 兩月時鄰月日子不渲染(user 2026-09-23 拍板;MUI / Polaris / flatpickr / RDP 預設同款)──
  const outside = await page.evaluate(() => {
    const tds = [...document.querySelectorAll('td[data-outside]')]
    return { cells: tds.length, buttons: tds.filter((td) => td.querySelector('button')).length, visible: tds.filter((td) => getComputedStyle(td).visibility !== 'hidden').length }
  })
  ok(outside.cells > 0 && outside.buttons === 0 && outside.visible === 0, `兩月:鄰月格 ${outside.cells} 個全部不渲染日子(有 button ${outside.buttons};可見 ${outside.visible})`)

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

  // ── 正在選開始日 ──
  await gotoStory(page, story('range-preview-start'), { waitFor: '[data-visual-hover-target]', settle: 300 })
  if (SELFTEST) await page.addStyleTag({ content: 'td::after{box-shadow:none!important}' })
  await blurFocus()
  await hover('2026-05-01')
  await expectFrame('重選開始日 5/1→5/12', days('2026-05-01', '2026-05-12'))
  await expectNoFrame('重選開始日:5/13 沒有框', ['2026-05-13'])
  await expectNoRing('重選開始日', '2026-05-01')
  await hover('2026-05-13')
  await expectNoFrame('順序不合(5/13 在結束日之後)不預覽', ['2026-05-12', '2026-05-13'])

  // ── showTime 單月(已選 4/15 09:00–4/20 18:00,開開始日那一端)──
  await gotoStory(page, story('show-time-range-popover-open'), { waitFor: '[data-day="2026-04-18"]', settle: 300 })
  if (SELFTEST) await page.addStyleTag({ content: 'td::after{box-shadow:none!important}' })
  await blurFocus()
  await hover('2026-04-18')
  await expectFrame('showTime 重選開始日 4/18→4/20', days('2026-04-18', '2026-04-20'))
  await expectNoRing('showTime', '2026-04-18')
  // 單月:鄰月日子照舊顯示、淡字(spec「outside」列);selftest 把它染紅
  if (SELFTEST) await page.addStyleTag({ content: 'td[data-outside]>button{color:red!important}' })
  const single = await page.evaluate(() => { const b = document.querySelector('td[data-outside]:not([data-disabled]):not([data-selected]) > button:not(:disabled)'); return b ? getComputedStyle(b).color : null })
  ok(single !== null && single === (await tokenColor('--fg-muted')), `單月:鄰月日子顯示且淡字(${single};token ${await tokenColor('--fg-muted')})`)

  // ── 對照組:沒上膛(兩端都空)→ 停留沒有框,單格 hover 圈照畫(壓制不是無條件的)──
  await gotoStory(page, story('range-picker'), { waitFor: 'button[aria-haspopup="dialog"]', settle: 300 })
  await page.locator('button[aria-haspopup="dialog"]').nth(2).click() // 第二個 Range(「Empty 初始狀態」)的開始欄
  // 兩月視圖的第一個 td 是不渲染的鄰月格(data-hidden,visibility hidden),waitForSelector 等「第一個可見」會逾時 → 明確等可見格
  await page.waitForSelector('td[data-day]:not([data-hidden])', { timeout: 5000 }); await page.waitForTimeout(200)
  await blurFocus()
  const bareDay = await page.evaluate(() => document.querySelector('td[data-day]:not([data-outside]) > button:not(:disabled)')?.closest('td')?.getAttribute('data-day'))
  await hover(bareDay)
  const bare = await cell(bareDay)
  ok(bare && bare.ringMax === 1.5 && noShadow(bare), `沒上膛:${bareDay} 停留只有單格圈、沒有框(ring ${bare ? bare.ringMax : '?'};陰影 ${bare ? bare.shadow : '?'})`)

  // ── DateGrid 自己的 mode="range"(RDP 把中段也標成 selected):端點 = 白線退 3px、中段要壓回一般 2px 藍線 ──
  await gotoStory(page, `${served.origin}/iframe.html?id=${encodeURIComponent('design-system-internal-dategrid-展示--range')}&viewMode=story`, { waitFor: 'td[data-day][data-selected]', settle: 300 })
  if (SELFTEST) await page.addStyleTag({ content: 'td>button:focus-visible{outline-offset:2px!important}' })
  const [gridStart, gridMiddle] = await page.evaluate(() => [...document.querySelectorAll('td[data-day][data-selected]:not([data-outside])')].map((td) => td.getAttribute('data-day')))
  await page.focus(`[data-day="${gridStart}"]:not([data-outside]) > button`); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250)
  const gridMid = await focusRing(gridMiddle)
  ok(gridMid?.visible && gridMid.width === '2px' && gridMid.offset === '-2px' && gridMid.color === (await tokenColor('--ring')),
    `DateGrid range:中段 ${gridMiddle}(RDP 也標 selected)焦點壓回往內 2px 藍線(${JSON.stringify(gridMid)})`)
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(250)
  const gridEnd = await focusRing(gridStart)
  ok(gridEnd?.visible && gridEnd.width === '1px' && gridEnd.offset === '-3px' && gridEnd.color === (await tokenColor('--on-emphasis')),
    `DateGrid range:端點 ${gridStart} 焦點 = 1px 白線退 3px(${JSON.stringify(gridEnd)})`)
}

try {
  await runSuite()
} finally {
  await browser.close(); await served.close()
}

if (SELFTEST) {
  // 對照組:注入「陰影歸零」後,上面的斷言必須大量紅 —— 綠就代表這支閘量不到框
  if (fail === 0) { console.log('✗ 對照組:td::after 陰影歸零後閘仍全綠 —— 這支閘量不到框'); process.exit(1) }
  console.log(`✓ 對照組:陰影歸零後 ${fail} 項紅(閘會紅)`)
  process.exit(0)
}
console.log(fail ? `✗ ${fail} 項未通過` : '✅ DatePicker.Range 區間預覽框 PASS')
process.exit(fail ? 1 : 0)
