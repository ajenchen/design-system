#!/usr/bin/env node
/**
 * 不變式:**多選選單的「不限」列必須是「不設限」,不是「一個選項」**。
 *
 * owner:`packages/design-system/src/components/SelectMenu/select-menu.spec.md`「「不限」選項」段
 *(2026-09-18 user 拍板:消費端自行開啟、預設關閉 —— 「消費端要自行判斷到底選單的內容是否要出現
 * 不限這個選項啊,我們又不知道消費端的選單內容,直接開啟反而容易變成怪設計」)。
 *
 * 它跟一般選項長得像,但語意相反,所以四個地方都要跟一般選項分開,而且四個都會**靜默**壞掉:
 *   A 位置與分隔線 —— 自成一組排在最上面,它頭上不畫線、下一組頭上要畫線。
 *                     擺錯不會報錯,只會看起來像「第一個選項」。
 *   B 互斥三條     —— 勾它 → 其他全退;勾其他 → 它退;取消它 → 什麼都不剩。
 *                     壞掉會變成「不限 + 三個選項」這種自相矛盾的值,而且畫面上完全合理。
 *   C 欄位顯示     —— 只選「不限」時欄位是**純文字**(跟一般填值的 select 一樣),不是一顆 Tag。
 *                     退化成 Tag 不會報錯,只是語意變成「不限是一個被選中的項目」。
 *   D 三態訊息列   —— 搜尋中 / 載入中 / 0 筆選項時不出現「不限」,而且原本的訊息列照常出現。
 *                     壞掉會變成「載入中,但你已經可以選不限了」。
 *   E 關著時惰性   —— `unrestrictedValue` 有預設值(`__unrestricted__`),關著時若消費端剛好
 *                     有個選項叫這個名字,選別的選項 / 按全選都不可以把它吃掉。
 *                     這條沒有畫面,只會讓某個值無聲消失。
 *
 * 量的都是幾何與 DOM 狀態(座標、`data-state`、`data-tag-text` 的有無),不是 class 字串(M32)。
 *
 * 對照組 `--selftest`:逐條把上面五件事各弄壞一次,**每一條都必須各自被抓到**(不是「有紅就算」——
 * 那樣只要一條會紅就能掩護其他幾條假綠)。全中 = exit 0,任何一條沒抓到 = exit 1。
 */
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { launchBrowser } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const BUILD = resolve(ROOT, arg('build', 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const EDGE_TOLERANCE_PX = 1

const STORY_MAIN = 'design-system-components-combobox-展示--unrestricted-option'
const STORY_MSG = 'design-system-components-combobox-展示--unrestricted-message-states'
const STORY_OFF = 'design-system-components-combobox-展示--unrestricted-off-inert'

if (!existsSync(join(BUILD, 'index.json'))) {
  console.error(`✗ 找不到 ${join(BUILD, 'index.json')} —— 先跑 npm run build-storybook`)
  process.exit(2)
}

// 面板狀態:群組、列、勾選、訊息列。只認開著的 popper 裡的 cmdk 根。
const PANEL = () => {
  const root = document.querySelector('[data-radix-popper-content-wrapper] [cmdk-root]')
  if (!root) return { 開著: false }
  const groups = [...root.querySelectorAll('[cmdk-group]')].filter((g) => g.getClientRects().length)
  const rows = [...root.querySelectorAll('[role="option"]')]
  const bt = (el) => (el ? getComputedStyle(el).borderTopWidth : null)
  return {
    開著: true,
    群組數: groups.length,
    第一組列數: groups[0] ? groups[0].querySelectorAll('[role="option"]').length : null,
    第一組上邊線: bt(groups[0]),
    第二組上邊線: bt(groups[1]),
    列: rows.map((r) => ({
      字: (r.textContent || '').trim().slice(0, 16),
      不限: r.hasAttribute('data-unrestricted'),
      勾: !!r.querySelector('[data-state="checked"]'),
    })),
    空訊息: (() => { const e = root.querySelector('[cmdk-empty]'); return e ? (e.textContent || '').trim() : null })(),
    載入訊息: (() => { const e = root.querySelector('[cmdk-loading]'); return e ? (e.textContent || '').trim() : null })(),
  }
}

// 欄位:用 h3 標題定位每一格,量「最裡層那個有字的 span」相對欄位框左緣的位移、顏色、是否在 Tag 裡。
// Tag 的身分證是 `data-tag-text`(tag.tsx:234),不是 class 字串。
const FIELDS = () => {
  const headings = [...document.querySelectorAll('h3')]
  const panel = (prefix) => {
    const h = headings.find((x) => (x.textContent || '').startsWith(prefix))
    return h ? h.nextElementSibling : null
  }
  const read = (wrap) => {
    if (!wrap) return null
    // **參照盒一定要是欄位本身的 border box**。2026-09-18 錯誤紀錄:原本寫
    // `wrap.querySelector('[role="combobox"]') || wrap.firstElementChild`,而 story 裡 wrap 自己
    // 就是那顆 combobox(querySelector 只找後代 → null)→ 退到 firstElementChild = 內層的
    // tag area / span,於是「字相對它自己的爸爸」恆等於 0,兩格都量到 0 而判成一致 ——
    // 實際上「不限」比一般填值少 9px,user 一眼看出來。假相等比沒量還糟。
    // view 模式的欄位**整個就是一個 <span>**,沒有子 span 也沒有 role=combobox,所以退回 wrap 自己。
    const field = (wrap.getAttribute && wrap.getAttribute('role') === 'combobox')
      ? wrap
      : (wrap.querySelector('[role="combobox"]') || wrap)
    const box = field.getBoundingClientRect()
    const el = [wrap, ...wrap.querySelectorAll('span')]
      .find((s) => s.tagName === 'SPAN' && s.childElementCount === 0 && (s.textContent || '').trim())
    if (!box || !el) return null
    const cs = getComputedStyle(field)
    const ruler = document.createElement('div')
    ruler.style.cssText = 'position:absolute;visibility:hidden;height:0;width:var(--field-px)'
    field.appendChild(ruler)
    const fieldPx = parseFloat(getComputedStyle(ruler).width) // token 原文是 rem,要解析成 px
    ruler.remove()
    return {
      字: (el.textContent || '').trim(),
      左偏移: Math.round((el.getBoundingClientRect().left - box.left) * 100) / 100,
      應為: Math.round((parseFloat(cs.borderLeftWidth || '0') + fieldPx) * 100) / 100,
      顏色: getComputedStyle(el).color,
      Tag數: wrap.querySelectorAll('[data-tag-text]').length,
    }
  }
  return {
    關著: read(panel('關著')),
    只選不限: read(panel('只選「不限」—— 欄')),
    只選不限唯讀: read(panel('只選「不限」· 唯讀')),
    只選不限檢視: read(panel('只選「不限」· 檢視')),
    佔位: read(panel('自訂文字')),
  }
}

// ── 對照組:一條一條弄壞 ───────────────────────────────────────
const BREAK = {
  // A:把「不限」搬進下一組(等同沒有自成一組),分隔線跟著消失
  位置: () => {
    const root = document.querySelector('[data-radix-popper-content-wrapper] [cmdk-root]')
    const groups = [...root.querySelectorAll('[cmdk-group]')]
    const row = root.querySelector('[role="option"][data-unrestricted]')
    const target = groups[1]?.querySelector('[cmdk-group-items]') || groups[1]
    if (!row || !target) return false
    target.insertBefore(row, target.firstChild)
    groups[0]?.remove()
    return true
  },
  // B:把「不限」的勾釘住不讓它退(互斥第二條壞掉)
  互斥: () => {
    const row = document.querySelector('[data-radix-popper-content-wrapper] [cmdk-root] [role="option"][data-unrestricted]')
    if (!row) return false
    const mark = row.querySelector('[data-state]')
    if (!mark) return false
    setInterval(() => { mark.setAttribute('data-state', 'checked') }, 10)
    return true
  },
  // C:讓只選「不限」的欄位長出一顆 Tag(退化成「不限是一個被選中的項目」)
  欄位: () => {
    const h = [...document.querySelectorAll('h3')].find((x) => (x.textContent || '').startsWith('只選「不限」—— 欄'))
    const wrap = h?.nextElementSibling
    const el = wrap && [...wrap.querySelectorAll('span')].find((s) => s.childElementCount === 0 && (s.textContent || '').trim())
    if (!el) return false
    el.setAttribute('data-tag-text', '')
    // 推欄位的左內距 —— 這才會讓「站在那條線上」那條紅(加 margin 只動元素與它爸爸的相對位置,
    // 正是舊版量錯參照盒時唯一抓得到的那種破壞,對照組太弱)。
    const field = el.closest('[role="combobox"]')
    if (field) field.style.paddingLeft = `${parseFloat(getComputedStyle(field).paddingLeft || '0') + 8}px`
    return true
  },
  // E:把那個剛好叫 `__unrestricted__` 的選項的勾拔掉(等同關著時還去濾它)
  關著: () => {
    const rows = [...document.querySelectorAll('[data-radix-popper-content-wrapper] [cmdk-root] [role="option"]')]
    const row = rows.find((r) => (r.textContent || '').trim() === 'Unassigned')
    if (!row) return false
    // 一列上有**不只一個** `data-state="checked"`(按鈕 + 內層 span),只改第一個的話
    // 讀取端還是找得到另一個 —— 2026-09-18 對照組就是這樣沒被抓到,全部一起改。
    const marks = () => [...row.querySelectorAll('[data-state="checked"]')]
    if (marks().length === 0) return false
    setInterval(() => { for (const m of marks()) m.setAttribute('data-state', 'unchecked') }, 10)
    return true
  },
  // D:在訊息列狀態下硬塞一列「不限」進去
  訊息: () => {
    const root = document.querySelector('[data-radix-popper-content-wrapper] [cmdk-root]')
    const list = root?.querySelector('[cmdk-list-sizer]') || root?.querySelector('[cmdk-list]')
    if (!list) return false
    const row = document.createElement('div')
    row.setAttribute('role', 'option')
    row.setAttribute('data-unrestricted', '')
    row.textContent = '不限'
    list.insertBefore(row, list.firstChild)
    return true
  },
}

const server = await startA11yStaticServer({ rootDirectory: BUILD, defaultFile: 'iframe.html' })
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } })
page.on('pageerror', () => {})

const results = []
const ck = (組, 名, 通過, 細節 = '') => { results.push({ 組, 名, 通過, 細節 }) }
const goto = async (id) => {
  await page.goto(`${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForFunction(() => document.querySelector('#storybook-root')?.children.length > 0, null, { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(400)
}
const 第幾個觸發點 = 1 // 「開啟」那一格

try {
  // ── A. 位置與分隔線 ────────────────────────────────────────
  await goto(STORY_MAIN)
  await page.locator('[role="combobox"]').nth(第幾個觸發點).click({ timeout: 5_000 })
  await page.waitForTimeout(500)
  if (SELFTEST) { await page.evaluate(BREAK.位置); await page.waitForTimeout(60) }
  const a = await page.evaluate(PANEL)
  ck('A', '選單真的開著(防假綠)', a.開著 === true)
  ck('A', '第一列就是「不限」', a.開著 && a.列?.[0]?.不限 === true, a.列?.[0]?.字)
  ck('A', '「不限」自成一組(該組只有一列)', a.第一組列數 === 1, String(a.第一組列數))
  ck('A', '「不限」那組頭上不畫線', a.第一組上邊線 === '0px', a.第一組上邊線)
  ck('A', '下一組頭上畫 1px 線', a.第二組上邊線 === '1px', a.第二組上邊線)

  // ── B. 互斥三條 ───────────────────────────────────────────
  const 點 = async (n) => { await page.locator('[cmdk-root] [role="option"]').nth(n).click({ timeout: 5_000 }); await page.waitForTimeout(400) }
  if (SELFTEST) { await page.evaluate(BREAK.互斥); await page.waitForTimeout(60) }
  await 點(0)
  const b1 = await page.evaluate(PANEL)
  ck('B', '勾「不限」→ 其他全退', b1.列?.[0]?.勾 === true && b1.列.slice(1).every((r) => !r.勾), JSON.stringify(b1.列?.map((r) => r.勾)))
  await 點(2)
  const b2 = await page.evaluate(PANEL)
  ck('B', '勾一般選項 →「不限」退掉', b2.列?.[0]?.勾 === false && b2.列?.[2]?.勾 === true, JSON.stringify(b2.列?.map((r) => r.勾)))
  await 點(0); await 點(0)
  const b3 = await page.evaluate(PANEL)
  ck('B', '取消「不限」→ 一個都不剩', b3.列?.every((r) => !r.勾) === true, JSON.stringify(b3.列?.map((r) => r.勾)))
  await page.keyboard.press('Escape').catch(() => null)
  await page.waitForTimeout(200)

  // ── C. 欄位顯示 ───────────────────────────────────────────
  if (SELFTEST) { await page.evaluate(BREAK.欄位); await page.waitForTimeout(60) }
  const f = await page.evaluate(FIELDS)
  ck('C', '一般選項用 Tag 呈現(對照:關著那格)', (f.關著?.Tag數 ?? 0) > 0, `Tag=${f.關著?.Tag數}`)
  for (const [名, v] of [['編輯', f.只選不限], ['唯讀', f.只選不限唯讀], ['檢視', f.只選不限檢視]]) {
    ck('C', `只選「不限」(${名})不渲 Tag`, v?.Tag數 === 0 && (v?.字 || '').includes('不限'), `Tag=${v?.Tag數} 字=${v?.字}`)
  }
  // 跟「佔位字」互相比較是不夠的(兩邊都錯就會一起錯過);直接對那條線:邊框 + `--field-px`。
  // 全 DS 的同一條線另有 `scripts/field-text-left-edge-invariant.mjs` 在守,這裡是就近再釘一次。
  const line = f.只選不限?.應為
  const dx = Math.abs((f.只選不限?.左偏移 ?? -99) - (line ?? 99))
  ck('C', '只選「不限」的字站在「邊框 + --field-px」那條線上', dx <= EDGE_TOLERANCE_PX, `量到 ${f.只選不限?.左偏移}px / 應為 ${line}px`)
  const dp = Math.abs((f.佔位?.左偏移 ?? -99) - (f.佔位?.應為 ?? 99))
  ck('C', '對照:一般填值的佔位字也在同一條線上', dp <= EDGE_TOLERANCE_PX, `量到 ${f.佔位?.左偏移}px / 應為 ${f.佔位?.應為}px`)
  ck('C', '只選「不限」不是佔位灰', f.只選不限?.顏色 !== f.佔位?.顏色, `不限=${f.只選不限?.顏色} 佔位=${f.佔位?.顏色}`)

  // ── D. 三態訊息列 ─────────────────────────────────────────
  await goto(STORY_MSG)
  if (SELFTEST) { await page.evaluate(BREAK.訊息); await page.waitForTimeout(60) }
  const d1 = await page.evaluate(PANEL)
  ck('D', '0 筆那格的選單真的開著(防假綠)', d1.開著 === true)
  ck('D', '0 筆選項時不出現「不限」', d1.開著 && !d1.列.some((r) => r.不限), JSON.stringify(d1.列?.map((r) => r.字)))
  ck('D', '0 筆選項時空訊息照常出現', !!d1.空訊息, String(d1.空訊息))
  // 先關掉前一格的面板再點下一格 —— 開著的 popper 會擋住下一個觸發點的點擊
  //(2026-09-18 對照組實測:塞進去的假列直接 intercept pointer events,整支當場 timeout)。
  await page.keyboard.press('Escape').catch(() => null)
  await page.waitForTimeout(250)
  await page.locator('[role="combobox"]').nth(1).click({ timeout: 5_000 })
  await page.waitForTimeout(700)
  if (SELFTEST) { await page.evaluate(BREAK.訊息); await page.waitForTimeout(60) }
  const d2 = await page.evaluate(PANEL)
  ck('D', '載入中那格的選單真的開著(防假綠)', d2.開著 === true)
  ck('D', '載入中時不出現「不限」', d2.開著 && !d2.列.some((r) => r.不限), JSON.stringify(d2.列?.map((r) => r.字)))
  ck('D', '載入中時載入訊息照常出現', !!(d2.載入訊息 || d2.空訊息), String(d2.載入訊息 || d2.空訊息))
  // ── E. 關著時完全惰性 ────────────────────────────────────
  // `unrestricted` 關著 + 某個選項的值剛好是 `__unrestricted__`(預設值)。
  // 這支 story 開場就選著它;選別的選項、按全選,它都必須還在。
  await goto(STORY_OFF)
  await page.waitForTimeout(400)
  if (SELFTEST) { await page.evaluate(BREAK.關著); await page.waitForTimeout(60) }
  const 撞名還在 = async () => {
    const p = await page.evaluate(PANEL)
    const row = p.列?.find((r) => r.字 === 'Unassigned')
    return { 開著: p.開著, 勾: row?.勾 === true, 列: p.列?.map((r) => `${r.字}${r.勾 ? '✓' : ''}`) }
  }
  const e0 = await 撞名還在()
  ck('E', '關著那支的選單真的開著(防假綠)', e0.開著 === true)
  ck('E', '開場就選著撞名的那個選項', e0.勾, JSON.stringify(e0.列))
  await page.locator('[cmdk-root] [role="option"]').nth(2).click({ timeout: 5_000 })
  await page.waitForTimeout(400)
  const e1 = await 撞名還在()
  ck('E', '選別的選項之後,撞名的那個沒被吃掉', e1.勾, JSON.stringify(e1.列))
  await page.locator('[cmdk-root] [data-slot="surface-footer"] button').first().click({ timeout: 5_000 }).catch(() => null)
  await page.waitForTimeout(400)
  const e2 = await 撞名還在()
  ck('E', '按全選之後,撞名的那個沒被吃掉', e2.勾, JSON.stringify(e2.列))
} finally {
  await page.close().catch(() => null)
  await browser.close().catch(() => null)
  await Promise.race([server.stop(), new Promise((r) => setTimeout(r, 3_000).unref?.())]).catch(() => null)
}

for (const r of results) console.log(`${r.通過 ? '✓' : '✗'} ${r.組} ${r.名}${r.細節 ? ' | ' + r.細節 : ''}`)
const 失敗 = results.filter((r) => !r.通過)

if (SELFTEST) {
  // 四條各自要被抓到 —— 只看「有沒有紅」會讓一條紅掩護其他三條假綠
  const 組別 = ['A', 'B', 'C', 'D', 'E']
  const 缺 = 組別.filter((g) => !失敗.some((r) => r.組 === g))
  console.log(`\nselftest:被弄壞的 ${組別.length} 件事,抓到 ${組別.length - 缺.length}/${組別.length} 件`)
  if (缺.length === 0) { console.log('✓ selftest:每一條都各自紅了,這把量具會紅'); process.exit(0) }
  console.log(`✗ selftest:${缺.join(' / ')} 這幾條弄壞了也沒被抓到 —— 假綠,不能當證據`)
  process.exit(1)
}
if (失敗.length > 0) { console.log(`\n✗ ${失敗.length} 條不符`); process.exit(1) }
console.log('\n✓「不限」列:自成一組排最上、互斥三條成立、欄位是純文字、三態訊息列不受影響、關著時完全惰性')
process.exit(0)
