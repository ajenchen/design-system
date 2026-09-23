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
//  只出現在鄰月 outside 列的日子(例:兩月視圖裡的 4/28)沒有本月格,退回唯一那一格。
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
  if (SELFTEST) await page.addStyleTag({ content: 'td::after{box-shadow:none!important}' })
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

  // ── 正在選開始日 ──
  await gotoStory(page, story('range-preview-start'), { waitFor: '[data-visual-hover-target]', settle: 300 })
  if (SELFTEST) await page.addStyleTag({ content: 'td::after{box-shadow:none!important}' })
  await blurFocus()
  await hover('2026-04-28')
  await expectFrame('重選開始日 4/28→5/12', days('2026-04-28', '2026-05-12'))
  await expectNoFrame('重選開始日:5/13 沒有框', ['2026-05-13'])
  await expectNoRing('重選開始日', '2026-04-28')
  await hover('2026-05-13')
  await expectNoFrame('順序不合(5/13 在結束日之後)不預覽', ['2026-05-12', '2026-05-13'])

  // ── showTime 單月(已選 4/15 09:00–4/20 18:00,開開始日那一端)──
  await gotoStory(page, story('show-time-range-popover-open'), { waitFor: '[data-day="2026-04-18"]', settle: 300 })
  if (SELFTEST) await page.addStyleTag({ content: 'td::after{box-shadow:none!important}' })
  await blurFocus()
  await hover('2026-04-18')
  await expectFrame('showTime 重選開始日 4/18→4/20', days('2026-04-18', '2026-04-20'))
  await expectNoRing('showTime', '2026-04-18')
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
