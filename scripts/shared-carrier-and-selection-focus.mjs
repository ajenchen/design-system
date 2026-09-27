#!/usr/bin/env node
/**
 * 兩題的真瀏覽器取證(2026-09-08):
 *
 * H2c — DatePicker 範圍模式的起訖兩顆 button 罩在同一圈欄位邊框裡。
 *   邊框只說「焦點在這個欄位」,不說「在起日還是迄日」。修法是把元件自己既有的
 *   那條主色底線(對照 Ant Design RangePicker 的 -active-bar)也套到鍵盤焦點上。
 *   這裡驗:Tab 到起日 → 只有起日有底線;再 Tab → 只有迄日有。
 *
 * A4 — 純選取模式(非 spreadsheet)有沒有「列游標沒有指示」的問題。
 *   先確認方向鍵在該模式下**不移動任何游標**(沒有游標就沒有「指示不了」的問題),
 *   再確認 Tab 進表格時捲動區真的畫框、Tab 到列的核取方塊時它自己畫框。
 *
 * 判準一律量 pixel / computed style,不看 class 字串(M32)。
 *
 * 開 story(2026-09-25 起):lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作)——
 * Storybook 回報渲染完成(含 play)+ render-health + 被量的元件本身出現 + 版面連續 10 影格靜止,才開始 Tab。
 * 取代原本「load + 固定睡 1200ms + 等元素」與兩次「reload + 固定睡 1200ms」(reload 之後連元素都沒等,
 * 慢的機器上 Tab 走在還沒掛好的表格上)。A4 需要「重設 Tab 起點」的兩處改成重新 openStory 同一個網址(同樣是新文件)。
 * 開不起來 = 儀器失效:點名 story、附同源 404、exit 2 —— 不是產品裁決,也不算通過。
 *
 * Run: `node scripts/shared-carrier-and-selection-focus.mjs`(讀 `<cwd>/storybook-static`)
 */
import { join } from 'node:path'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

// file:// 會被 CORS 擋掉模組載入(story 整個不渲染,而且不報錯只留空 root),
// 所以跟其他瀏覽器閘一樣起一個本機靜態站。
const STATIC = join(process.cwd(), 'storybook-static')
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
const report404 = () => { if (server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) }
const BASE = `${server.origin}/iframe.html?id=`
const story = (id) => BASE + encodeURIComponent(id)
const fail = []
const ok = (m) => console.log('  ✓ ' + m)
const bad = (m) => { console.log('  ✗ ' + m); fail.push(m) }
/** story 開不起來(StoryRenderInstrumentError):儀器失效,結尾 exit 2 */
let instrumentFailure = null
/** 開 story、等被量的元素本身與版面靜止;開不起來丟 StoryRenderInstrumentError(由下方 catch 轉成儀器失效) */
const open = (page, id, waitFor) => openStory(page, story(id), { waitFor, settleFrames: 10, notFound: server.notFound })
const A4_STORY = 'design-system-components-datatable-展示--selection-keyboard-and-shift'
const A4_TABLE = '[role="table"], [role="grid"]'

const underlineOf = (el) => {
  const cs = getComputedStyle(el)
  return { line: cs.textDecorationLine, color: cs.textDecorationColor, thick: cs.textDecorationThickness }
}

let browser
try {
  browser = await launchBrowser()
  const page = await browser.newPage()

  // ── H2c ──────────────────────────────────────────────────────────────
  console.log('\nH2c DatePicker 範圍:起訖兩顆要分得出來')
  await open(page, 'design-system-components-datepicker-展示--range-picker', 'button[aria-haspopup="dialog"]')

  const readEnds = () => page.evaluate(() => {
    const btns = [...document.querySelectorAll('button[aria-haspopup="dialog"]')]
    return btns.map((b) => {
      const cs = getComputedStyle(b)
      return {
        label: b.getAttribute('aria-label'),
        focused: b === document.activeElement,
        line: cs.textDecorationLine,
        color: cs.textDecorationColor,
        thick: cs.textDecorationThickness,
      }
    })
  })

  // 用鍵盤走進去(不是 .focus(),要走真的 Tab 才會有 :focus-visible)
  await page.evaluate(() => document.body.focus())
  let guard = 0
  while (guard++ < 25) {
    await page.keyboard.press('Tab')
    const st = await readEnds()
    if (st.some((s) => s.focused)) break
  }
  const first = await readEnds()
  const firstFocused = first.find((s) => s.focused)
  if (!firstFocused) bad('Tab 25 次都沒走到起訖任一顆 button')
  else {
    const underlined = first.filter((s) => s.line.includes('underline'))
    if (underlined.length === 1 && underlined[0].focused) ok(`焦點在「${firstFocused.label}」,底線只有它一條(${underlined[0].color} / ${underlined[0].thick})`)
    else bad(`焦點在「${firstFocused.label}」,但有底線的是 ${underlined.length} 顆:${underlined.map((u) => u.label).join(' / ') || '(無)'}`)

    await page.keyboard.press('Tab')
    const second = await readEnds()
    const secondFocused = second.find((s) => s.focused)
    if (!secondFocused) {
      bad('再 Tab 一次就離開了兩顆 button,量不到第二顆')
    } else {
      const u2 = second.filter((s) => s.line.includes('underline'))
      if (u2.length === 1 && u2[0].focused && u2[0].label !== underlined[0]?.label) {
        ok(`Tab 之後焦點移到「${secondFocused.label}」,底線跟著移過去(前一顆已無底線)`)
      } else {
        bad(`Tab 之後焦點在「${secondFocused.label}」,底線卻在 ${u2.map((u) => u.label).join(' / ') || '(無)'}`)
      }
    }
  }

  // ── A4 ───────────────────────────────────────────────────────────────
  console.log('\nA4 純選取模式:先問「有沒有游標」,再問「指示夠不夠」')
  await open(page, A4_STORY, A4_TABLE)

  const roleNow = await page.evaluate(() => document.querySelector('[role="table"],[role="grid"]')?.getAttribute('role'))
  if (roleNow === 'table') ok('此模式的 role 是 table(不是 grid)—— 依 APG,table 是靜態結構,不帶方向鍵游標')
  else bad(`預期 role=table,實得 ${roleNow}`)

  // 方向鍵真的不動任何東西?(沒有游標,就不存在「游標指示不了」)
  await page.evaluate(() => document.querySelector('[role="table"],[role="grid"]').setAttribute('data-probe', '1'))
  await page.focus('[data-probe]')
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowRight']) await page.keyboard.press(k)
  const moved = await page.evaluate(() => ({
    cursors: document.querySelectorAll('[data-selected-cell],[aria-selected="true"],[data-cell-cursor]').length,
    activedesc: document.querySelector('[data-probe]')?.getAttribute('aria-activedescendant') || null,
  }))
  if (moved.cursors === 0 && !moved.activedesc) ok('連按方向鍵後沒有任何游標出現(cursors=0, aria-activedescendant=null)—— 沒有游標,就不存在「游標指示不了」')
  else bad(`方向鍵造出了游標:cursors=${moved.cursors} activedescendant=${moved.activedesc}`)

  // 表格根節點是 tab stop(它同時是可橫捲區),取得焦點時要畫框。
  // 坑:`document.body.focus()` **不會**把 tab 起點重設(body 預設不可聚焦),
  // 於是 Tab 會從「上一步聚焦的表格根節點」繼續往後走,再也回不到它身上。要重設只能重新載入(重新 openStory 同一個網址 = 新文件)。
  await open(page, A4_STORY, A4_TABLE)
  await page.evaluate(() => document.querySelector('[role="table"],[role="grid"]').setAttribute('data-probe', '1'))
  let g2 = 0, onTable = false
  while (g2++ < 40) {
    await page.keyboard.press('Tab')
    onTable = await page.evaluate(() => document.activeElement?.getAttribute('data-probe') === '1')
    if (onTable) break
  }
  if (!onTable) bad('Tab 40 次沒走到表格根節點')
  else {
    // 等聚焦後 transition-colors(含 outline-color)走完再量框,別量到過渡中間值(同下方核取方塊那段)
    await page.waitForTimeout(600)
    const o = await page.evaluate(() => {
      const el = document.activeElement, cs = getComputedStyle(el), r = el.getBoundingClientRect()
      return { w: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor, offset: cs.outlineOffset,
               box: `${Math.round(r.width)}×${Math.round(r.height)}`, scrollable: el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight }
    })
    if (parseFloat(o.w) > 0 && o.style !== 'none') ok(`表格根節點取得焦點時有框:${o.box}, ${o.w} ${o.style} ${o.color} offset ${o.offset}(可捲動=${o.scrollable})`)
    else bad(`表格根節點取得焦點但沒有框:${JSON.stringify(o)}`)
  }

  // 列的核取方塊要是 tab stop 且自己畫框(那才是鍵盤選取的真路徑)—— 同樣要新文件重設 Tab 起點
  await open(page, A4_STORY, A4_TABLE)
  const marked = await page.evaluate(() => {
    // 全選那顆在 columnheader 列,要挑 body 列裡的
    const boxes = [...document.querySelectorAll('[role="row"] [role="checkbox"], [role="row"] input[type="checkbox"]')]
      .filter((b) => !b.closest('[role="columnheader"]') && !/全選/.test(b.getAttribute('aria-label') || ''))
    if (!boxes.length) return 0
    boxes[0].setAttribute('data-rowcb', '1')
    return boxes.length
  })
  if (!marked) bad('找不到 body 列的核取方塊')
  else {
    let g3 = 0, hit = false
    while (g3++ < 80) {
      await page.keyboard.press('Tab')
      hit = await page.evaluate(() => document.activeElement?.getAttribute('data-rowcb') === '1')
      if (hit) break
    }
    if (!hit) bad(`Tab 80 次沒走到列的核取方塊(共 ${marked} 顆)—— 那才是真的沒有鍵盤選取路徑`)
    else {
      // 坑:元件多半掛 `transition-colors`,而它的 transition-property **含 outline-color**。
      // 聚焦後立刻量會抓到過渡中間值(量到 currentColor,看起來像「焦點框顏色壞了」)。
      // 2026-09-08 就是這樣一度誤判成全 DS 焦點框失效;等 600ms 後三個元件都回主色。
      await page.waitForTimeout(600)
      const o = await page.evaluate(() => {
        const cs = getComputedStyle(document.activeElement), r = document.activeElement.getBoundingClientRect()
        return { w: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor, box: `${Math.round(r.width)}×${Math.round(r.height)}` }
      })
      if (parseFloat(o.w) > 0 && o.style !== 'none') ok(`列的核取方塊是 tab stop 且自己畫框:${o.box}, ${o.w} ${o.style} ${o.color}`)
      else bad(`核取方塊取得焦點但沒有框:${JSON.stringify(o)}`)
    }
  }
} catch (error) {
  if (!(error instanceof StoryRenderInstrumentError)) { report404(); throw error }
  instrumentFailure = error
} finally {
  await browser?.close()
  await server.stop()
}

console.log('')
if (instrumentFailure) {
  // 沒量到 ≠ 沒問題:story 開不起來是儀器失效(exit 2),不是產品裁決,也絕不算通過
  console.error(`✗ ${instrumentFailure.message}`)
  report404()
  console.error('✗ shared-carrier-and-selection-focus:儀器失效 —— 其後的段落沒有量到')
  process.exit(2)
}
if (fail.length) { console.log(`✗ ${fail.length} 項未通過`); report404(); process.exit(1) }
console.log('✓ 全部通過')
