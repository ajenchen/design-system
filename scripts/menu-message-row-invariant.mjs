#!/usr/bin/env node
/**
 * 選單訊息列閘(2026-09-08 user 拍板,不可再開題)
 *
 * 共識:選單(SelectMenu / Command / Select / Combobox / PeoplePicker)裡「不是選項的列」一律走 MenuItem 的列幾何 ——
 *   「沒有選項 / 沒有結果」= 一列 `<MenuItem message>`(非互動、次要色、字級同選項、內容置中),住在 MenuGroup(py-2)裡,
 *   中尺寸 8 + 32 + 8 = 48,與 1 筆結果等高;沒有任何最小高度。
 *   「載入中」分兩處:搜尋列 / 觸發點右側放列圖示尺寸的轉圈(仍可打字);選單內只在清單裡沒有任何選項時,
 *   Empty 槽渲同一種訊息列(前綴轉圈 + 可見文字,role=status)。舊選項不清空、選單不關。選項為 0 的群組不畫。
 *
 * 這支閘把上面每一句量成像素(不看 class;每個 story 逐條印 ✓/✗):
 *   M1 「沒有選項」列高 = 一列選項高(md 32;sm 28 / lg 36),MenuGroup 上下各 8 → 整個 [cmdk-empty] = 48(md),
 *      且與同元件 1 筆結果的 [cmdk-list] 等高(用「保留舊清單」story 打字過濾到 1 筆來量;5 筆 = 8 + 32×5 + 8 = 176)
 *   M2 載入中訊息列同高 48(md),列內轉圈的 layout 寬高 = ICON_SIZE(md 16 / lg 20),文字可見(不是 sr-only)
 *   M3 訊息列內容水平置中:內容(文字,或轉圈 + 文字整組)中心 x 與列中心 x 誤差 ≤ 1px
 *   M4 搜尋列 loading:[cmdk-input-wrapper] 內 16px 轉圈 + aria-busy,input 仍可輸入;舊選項仍在、[cmdk-empty] 不顯示
 *   M5 觸發點 loading:Select / Combobox / PeoplePicker 觸發點內、ChevronDown 左邊有 16px 轉圈(比兩者的 x)
 *   M6 搜尋在觸發點的 Select 0 筆:整個 [cmdk-list] = 48(md),不得多 16(空群組不畫)
 *   M7 訊息列不可互動:pointer-events none、role=presentation(沒有結果)/ role=status(載入中)、
 *      hit-test 打不到它、滑鼠移上去底色不變(等 transition-colors 150ms 過完再量)
 *
 * 數字出處(本檔不新造任何數字):
 *   列高 sm 28 / md 32 / lg 36 = `--field-height-{sm,md,lg}`(packages/design-system/src/tokens/uiSize/uiSize.css:23-26);
 *     訊息列吃 ROW_PADDING_BY_SIZE 的 py = (field-height − 1lh) / 2(patterns/element-anatomy/item-anatomy.tsx:145-149),所以列高 = field-height
 *   群組上下留白 8 = MenuGroup `py-2`(components/Menu/menu-item.tsx MenuGroup)
 *   轉圈 sm/md 16、lg 20 = ICON_SIZE(item-anatomy.tsx ICON_SIZE;components/Command/command.tsx CommandLoading / CommandInput 皆用 ICON_SIZE[size])
 *   置中容差 1px = 任務指定的量測容差(不是設計值)
 *
 * 對照組:`--selftest` 把期望值改成不可能的值(列高 0 / 群組留白 0 / 轉圈 0 / 置中容差 −1)必須紅;
 *   兩種模式都先把 M1 的量測值印出來並要求 > 0 —— 儀器活著才算數(M32「儀器要先有對照組」)。
 * 非同步 story(PeoplePicker 名錄 1.5 秒後才到)用 Playwright 假時鐘凍住再 runFor,不靠 wall-clock 搶拍。
 * 瀏覽器:同一個 page 逐 story `goto`(--single-process 沙箱下不開第二個 context;參 scripts/lib/launch-browser.mjs)。
 */
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const STATIC = process.env.MENU_STATIC || join(REPO, 'storybook-static')
const SELFTEST = process.argv.includes('--selftest')
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }

// ── 期望值(出處見檔頭)──
const ROW_H = { sm: 28, md: 32, lg: 36 }
const GROUP_PAD = 8
const ICON = { sm: 16, md: 16, lg: 20 }
const CENTER_TOL = 1
const EXPECT = SELFTEST
  ? { row: { sm: 0, md: 0, lg: 0 }, pad: 0, icon: { sm: 0, md: 0, lg: 0 }, tol: -1 }
  : { row: ROW_H, pad: GROUP_PAD, icon: ICON, tol: CENTER_TOL }
const emptyH = (size) => EXPECT.pad * 2 + EXPECT.row[size]
const listH = (size, n) => EXPECT.pad * 2 + EXPECT.row[size] * n

const ID = {
  selectNoOptions: 'design-system-components-select-展示--no-options',
  selectLoading: 'design-system-components-select-展示--loading-first-open',
  selectStale: 'design-system-components-select-展示--loading-with-stale-options',
  comboboxLoading: 'design-system-components-combobox-展示--loading-first-open',
  comboboxStale: 'design-system-components-combobox-展示--loading-with-stale-options',
  peopleLoading: 'design-system-components-peoplepicker-展示--loading-first-open',
  peopleAsync: 'design-system-components-peoplepicker-展示--async-directory-load',
  commandNoResults: 'design-system-internal-command-展示--no-results',
  commandLoading: 'design-system-internal-command-展示--loading-first-open',
  commandPalette: 'design-system-internal-command-展示--command-palette',
  commandInline: 'design-system-internal-command-展示--inline-command',
  commandAction: 'design-system-internal-command-展示--action-command',
  menuMessages: 'design-system-internal-menu-展示--messages',
}
// 共識文案(消費端可覆寫;這裡只驗 DS 預設值出現的 story)
const TEXT = { selectEmpty: '沒有選項', peopleEmpty: '沒有人員', loading: '載入選項中' }
const NONSENSE = '零零零不存在的關鍵字'

const near = (a, b, tol = 0.5) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol
const fmt = (n) => (typeof n === 'number' ? +n.toFixed(2) : String(n))
let failed = 0, broken = 0
const measured = []
const ck = (name, pass, detail = '') => { console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ':' + detail : ''}`); if (!pass) failed++ }
const bad = (name, detail = '') => { console.log(`✗ ${name}${detail ? ':' + detail : ''} —— 前提失敗(story 沒渲染出要量的東西),閘不能當「不適用」放行`); broken++ }

// ── story 存在性(先於一切)──
const index = JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8')).entries
for (const [key, id] of Object.entries(ID)) if (!index[id]) bad(`story 存在:${key}`, id)
if (broken) { console.log('✗ storybook-static 缺 story,先 build-storybook'); process.exit(1) }

// ── 靜態站 + 瀏覽器 ──
const server = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'
  const f = join(STATIC, p)
  if (!existsSync(f) || statSync(f).isDirectory()) { s.writeHead(404); s.end(); return }
  s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f))
})
await new Promise((r) => server.listen(0, r))
const story = (id) => `http://localhost:${server.address().port}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

// 頁內量尺(全部走 getBoundingClientRect / offsetWidth / elementFromPoint,不看 class)
await page.addInitScript(() => {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 } }
  // 訊息列 = MenuGroup 直接子層的非互動列,而且內容置中(header 列是 flex-start;選項列 role=option 不在此列)
  const isMessageRow = (el) => { const cs = getComputedStyle(el); return cs.display === 'flex' && cs.justifyContent === 'center' }
  // 轉圈在 animate-spin 旋轉中,getBoundingClientRect 是旋轉後的外框(16px 轉到 45° 變 22.6);
  // layout 尺寸用 offsetWidth/offsetHeight,位置則先把動畫關掉量、量完還原。
  const spinBox = (sp) => {
    if (!sp) return null
    const prev = sp.style.animation; sp.style.animation = 'none'
    const b = rect(sp); const out = { w: sp.offsetWidth, h: sp.offsetHeight, left: b.left, right: b.right, cx: b.cx }
    sp.style.animation = prev
    return out
  }
  window.__mm = {
    rows: () => [...document.querySelectorAll('[role="group"] > [role="presentation"], [role="group"] > [role="status"]')].filter(isMessageRow),
    info(el, size) {
      const cs = getComputedStyle(el); const r = rect(el)
      const kids = [...el.children].map(rect).filter((k) => k.width > 0)
      const union = kids.length ? { left: Math.min(...kids.map((k) => k.left)), right: Math.max(...kids.map((k) => k.right)) } : null
      const spinner = spinBox(el.querySelector('.animate-spin'))
      const textEl = [...el.querySelectorAll('span')].find((s) => s.textContent.trim() && !s.closest('.animate-spin'))
      const tcs = textEl ? getComputedStyle(textEl) : null; const tr = textEl ? rect(textEl) : null
      const group = el.closest('[role="group"]'); const gr = group ? rect(group) : null
      const empty = el.closest('[cmdk-empty]')
      // 該列所在 density 的 field-height 實測(儀器對照:期望值 32 必須等於 token 在這裡解析出來的值)
      const probe = document.createElement('div'); probe.style.cssText = `position:absolute;width:1px;height:var(--field-height-${size})`
      el.appendChild(probe); const fieldHeight = probe.getBoundingClientRect().height; probe.remove()
      const hit = document.elementFromPoint(r.cx, r.cy)
      return {
        height: r.height, cx: r.cx, cy: r.cy, contentCx: union ? (union.left + union.right) / 2 : NaN,
        padTop: gr ? r.top - gr.top : NaN, padBottom: gr ? gr.bottom - r.bottom : NaN, groupHeight: gr ? gr.height : NaN,
        emptyHeight: empty ? rect(empty).height : null,
        role: el.getAttribute('role'), pointerEvents: cs.pointerEvents, bg: cs.backgroundColor, color: cs.color, fontWeight: cs.fontWeight, fontSize: cs.fontSize,
        text: (el.textContent || '').trim(), spinner, fieldHeight,
        textW: tr ? tr.width : 0, textH: tr ? tr.height : 0,
        textVisible: !!textEl && tr.width > 4 && tr.height > 4 && tcs.position !== 'absolute' && tcs.visibility !== 'hidden' && tcs.opacity !== '0' && tcs.clipPath === 'none',
        hitIsRow: !!hit && (hit === el || el.contains(hit)), hitTag: hit ? `${hit.tagName.toLowerCase()}[role=${hit.getAttribute('role')}]` : 'none',
      }
    },
    list() {
      const l = document.querySelector('[cmdk-list]')
      return l ? { height: rect(l).height, items: document.querySelectorAll('[cmdk-item]').length, empty: !!document.querySelector('[cmdk-empty]') } : null
    },
    spinnerIn(sel) {
      const scope = document.querySelector(sel); if (!scope) return { scope: false }
      const chevron = scope.querySelector('svg.lucide-chevron-down')
      return { scope: true, spinner: spinBox(scope.querySelector('.animate-spin')), chevron: chevron ? rect(chevron) : null, busy: scope.getAttribute('aria-busy') }
    },
  }
})

async function open(id, waitSel = '[cmdk-list]') {
  await page.goto(story(id), { waitUntil: 'load' })
  const ok = await page.waitForSelector(waitSel, { timeout: 15000 }).then(() => true).catch(() => false)
  // Popover / Dialog 開啟動畫(zoom-in-95)結束後才量:動畫中量到的 rect 是 0.95 倍(實測 45.6 而非 48)
  await page.waitForTimeout(600)
  return ok
}
const rows = (size = 'md') => page.evaluate((s) => window.__mm.rows().map((el) => window.__mm.info(el, s)), size)
const list = () => page.evaluate(() => window.__mm.list())
const triggerSpin = () => page.evaluate(() => window.__mm.spinnerIn('#storybook-root [role="combobox"]'))

/** 一列訊息列的全部斷言(M1/M2 高度、M3 置中、M7 不可互動;hover 另外量,要動滑鼠) */
function assertRow(label, r, { kind, size = 'md', text, role }) {
  const M = kind === 'loading' ? 'M2' : 'M1'
  const rowH = EXPECT.row[size]
  const box = r.emptyHeight ?? r.groupHeight
  measured.push(r.height, r.groupHeight, box)
  console.log(`   ${label} 量測:列高 ${fmt(r.height)} / 群組 ${fmt(r.groupHeight)} / ${r.emptyHeight != null ? '[cmdk-empty]' : '容器'} ${fmt(box)} / 留白 ${fmt(r.padTop)}+${fmt(r.padBottom)} / 字級 ${r.fontSize} 字重 ${r.fontWeight} 色 ${r.color}`)
  ck(`${label} ${M} 訊息列高 = 一列選項高(${size} ${rowH})`, near(r.height, rowH), `${fmt(r.height)};--field-height-${size} 實測 ${fmt(r.fieldHeight)}`)
  ck(`${label} ${M} MenuGroup 上下留白各 ${EXPECT.pad}`, near(r.padTop, EXPECT.pad) && near(r.padBottom, EXPECT.pad), `上 ${fmt(r.padTop)} / 下 ${fmt(r.padBottom)}`)
  ck(`${label} ${M} 整個 ${r.emptyHeight != null ? '[cmdk-empty]' : 'MenuGroup'} = ${EXPECT.pad} + ${rowH} + ${EXPECT.pad} = ${emptyH(size)}`, near(box, emptyH(size)), `${fmt(box)}`)
  if (kind === 'loading') {
    ck(`${label} M2 列內轉圈 layout 寬高 = ICON_SIZE.${size} = ${EXPECT.icon[size]}`, !!r.spinner && near(r.spinner.w, EXPECT.icon[size]) && near(r.spinner.h, EXPECT.icon[size]), r.spinner ? `${fmt(r.spinner.w)}×${fmt(r.spinner.h)}` : '列內沒有轉圈')
    ck(`${label} M2 載入文字可見(不是 sr-only)`, r.textVisible, `「${r.text}」文字框 ${fmt(r.textW)}×${fmt(r.textH)}`)
  }
  if (text) ck(`${label} 文案 = 「${text}」(共識預設)`, r.text === text, `實際「${r.text}」`)
  ck(`${label} M3 內容水平置中(誤差 ≤ ${EXPECT.tol}px)`, Math.abs(r.contentCx - r.cx) <= EXPECT.tol, `內容中心 ${fmt(r.contentCx)} vs 列中心 ${fmt(r.cx)},差 ${fmt(Math.abs(r.contentCx - r.cx))}`)
  const wantRole = role ?? (kind === 'loading' ? 'status' : 'presentation')
  ck(`${label} M7 pointer-events none`, r.pointerEvents === 'none', r.pointerEvents)
  ck(`${label} M7 role = ${wantRole}`, r.role === wantRole, String(r.role))
  ck(`${label} M7 hit-test 打不到訊息列`, !r.hitIsRow, `列中心點打到 ${r.hitTag}`)
}

/** M7 hover:滑鼠移到第 i 列訊息列上,等 transition-colors(150ms)過完再量底色 */
async function hoverCheck(label, i = 0) {
  await page.mouse.move(2, 2); await page.waitForTimeout(250)
  const a = await page.evaluate((k) => { const r = window.__mm.rows()[k]; if (!r) return null; const b = r.getBoundingClientRect(); return { bg: getComputedStyle(r).backgroundColor, x: b.left + b.width / 2, y: b.top + b.height / 2 } }, i)
  if (!a) { bad(`${label} M7 hover 前提:找得到訊息列`); return }
  await page.mouse.move(a.x, a.y); await page.waitForTimeout(300)
  const after = await page.evaluate((k) => getComputedStyle(window.__mm.rows()[k]).backgroundColor, i)
  ck(`${label} M7 滑鼠移上去沒有 hover 底色`, a.bg === after, `${a.bg} → ${after}`)
}

/** M5:觸發點內 16px 轉圈在 ChevronDown 左邊 */
function assertTrigger(label, t, size = 'md') {
  if (!t.scope) { bad(`${label} M5 前提:找得到觸發點 [role=combobox]`); return }
  ck(`${label} M5 觸發點內有 ${EXPECT.icon[size]}px 轉圈`, !!t.spinner && near(t.spinner.w, EXPECT.icon[size]) && near(t.spinner.h, EXPECT.icon[size]), t.spinner ? `${fmt(t.spinner.w)}×${fmt(t.spinner.h)}` : '觸發點內沒有轉圈')
  ck(`${label} M5 轉圈在 ChevronDown 左邊`, !!t.spinner && !!t.chevron && t.spinner.right <= t.chevron.left + 0.5, t.spinner && t.chevron ? `轉圈右緣 ${fmt(t.spinner.right)} ≤ 箭頭左緣 ${fmt(t.chevron.left)}(箭頭 ${fmt(t.chevron.width)}px)` : '缺轉圈或箭頭')
}

/** M4:搜尋列右側 16px 轉圈 + aria-busy;input 仍可輸入(輸入後清掉) */
async function assertInputLoading(label, size = 'md') {
  const w = await page.evaluate(() => window.__mm.spinnerIn('[cmdk-input-wrapper]'))
  if (!w.scope) { bad(`${label} M4 前提:找得到 [cmdk-input-wrapper]`); return }
  ck(`${label} M4 搜尋列右側 ${EXPECT.icon[size]}px 轉圈`, !!w.spinner && near(w.spinner.w, EXPECT.icon[size]) && near(w.spinner.h, EXPECT.icon[size]), w.spinner ? `${fmt(w.spinner.w)}×${fmt(w.spinner.h)}` : '搜尋列沒有轉圈')
  ck(`${label} M4 搜尋列 aria-busy`, w.busy === 'true', String(w.busy))
  const inp = page.locator('[cmdk-input]')
  await inp.fill('a'); await page.waitForTimeout(150)
  const v = await inp.inputValue()
  ck(`${label} M4 載入中 input 仍可輸入`, v === 'a', `打「a」後 value=「${v}」`)
  await inp.fill(''); await page.waitForTimeout(150)
}

/** 過濾到 n 筆後量 [cmdk-list] */
async function typeAndList(locatorSel, text) {
  const inp = page.locator(locatorSel)
  await inp.fill(text); await page.waitForTimeout(250)
  return { value: await inp.inputValue(), list: await list(), rows: await rows() }
}

let selectEmptyList = null, comboboxEmptyList = null

// ═══ Select ═══
{
  const L = 'Select 沒有選項'
  if (!(await open(ID.selectNoOptions))) bad(`${L} 前提:選單有打開([cmdk-list])`)
  else {
    const rs = await rows()
    if (rs.length !== 1) bad(`${L} 前提:恰好 1 列訊息列`, `${rs.length} 列`)
    else { assertRow(L, rs[0], { kind: 'empty', text: TEXT.selectEmpty }); await hoverCheck(L) }
    const l = await list(); measured.push(l.height); selectEmptyList = l.height
    ck(`${L} M6 整個 [cmdk-list] = ${emptyH('md')}(空群組不畫,不得多 16)`, near(l.height, emptyH('md')), `${fmt(l.height)};選項 ${l.items} 筆`)
  }
}
{
  const L = 'Select 載入中(首次開啟)'
  if (!(await open(ID.selectLoading))) bad(`${L} 前提:選單有打開`)
  else {
    const rs = await rows()
    if (rs.length !== 1) bad(`${L} 前提:恰好 1 列訊息列`, `${rs.length} 列`)
    else { assertRow(L, rs[0], { kind: 'loading', text: TEXT.loading }); await hoverCheck(L) }
    assertTrigger(L, await triggerSpin())
    const l = await list(); measured.push(l.height)
    ck(`${L} M6 整個 [cmdk-list] = ${emptyH('md')}`, near(l.height, emptyH('md')), `${fmt(l.height)}`)
  }
}
{
  const L = 'Select 載入中(保留舊清單,搜尋在觸發點)'
  if (!(await open(ID.selectStale))) bad(`${L} 前提:選單有打開`)
  else {
    const l0 = await list(); measured.push(l0.height)
    ck(`${L} 舊選項仍在、[cmdk-empty] 不顯示`, l0.items > 0 && !l0.empty, `${l0.items} 筆,empty=${l0.empty}`)
    ck(`${L} M1 ${l0.items} 筆結果 [cmdk-list] = ${EXPECT.pad} + ${EXPECT.row.md}×${l0.items} + ${EXPECT.pad} = ${listH('md', l0.items)}`, near(l0.height, listH('md', l0.items)), `${fmt(l0.height)}`)
    assertTrigger(L, await triggerSpin())
    const inputSel = '#storybook-root [role="combobox"] input:not([aria-hidden="true"])'
    const one = await typeAndList(inputSel, 'TWD')
    ck(`${L} 觸發點搜尋輸入可打字`, one.value === 'TWD', `value=「${one.value}」`)
    if (!one.list || one.list.items !== 1) bad(`${L} 前提:打「TWD」過濾到 1 筆`, `${one.list?.items} 筆`)
    else {
      measured.push(one.list.height)
      ck(`${L} M1 1 筆結果 [cmdk-list] = 沒有選項時的 [cmdk-list](${fmt(selectEmptyList)})`, near(one.list.height, selectEmptyList) && near(one.list.height, emptyH('md')), `${fmt(one.list.height)} vs ${fmt(selectEmptyList)}(期望 ${emptyH('md')})`)
    }
    const zero = await typeAndList(inputSel, NONSENSE)
    if (!zero.list || zero.list.items !== 0 || zero.rows.length !== 1) bad(`${L} 前提:打不存在的字過濾到 0 筆、1 列載入訊息列`, `${zero.list?.items} 筆 / ${zero.rows.length} 列`)
    else {
      measured.push(zero.list.height)
      ck(`${L} M6 0 筆時整個 [cmdk-list] = ${emptyH('md')}(不得多 16 = 空群組)`, near(zero.list.height, emptyH('md')), `${fmt(zero.list.height)}`)
      assertRow(`${L} 0 筆`, zero.rows[0], { kind: 'loading', text: TEXT.loading })
    }
  }
}

// ═══ Combobox ═══
{
  const L = 'Combobox 載入中(首次開啟)'
  if (!(await open(ID.comboboxLoading))) bad(`${L} 前提:選單有打開`)
  else {
    const rs = await rows()
    if (rs.length !== 1) bad(`${L} 前提:恰好 1 列訊息列`, `${rs.length} 列`)
    else { assertRow(L, rs[0], { kind: 'loading', text: TEXT.loading }); await hoverCheck(L) }
    assertTrigger(L, await triggerSpin())
    const l = await list(); measured.push(l.height); comboboxEmptyList = l.height
    ck(`${L} 整個 [cmdk-list] = ${emptyH('md')}`, near(l.height, emptyH('md')), `${fmt(l.height)}`)
    await assertInputLoading(L)
  }
}
{
  const L = 'Combobox 載入中(保留舊清單,搜尋在選單)'
  if (!(await open(ID.comboboxStale))) bad(`${L} 前提:選單有打開`)
  else {
    const l0 = await list(); measured.push(l0.height)
    ck(`${L} M4 舊選項仍在、[cmdk-empty] 不顯示`, l0.items > 0 && !l0.empty, `${l0.items} 筆,empty=${l0.empty}`)
    ck(`${L} M1 ${l0.items} 筆結果 [cmdk-list] = ${listH('md', l0.items)}`, near(l0.height, listH('md', l0.items)), `${fmt(l0.height)}`)
    assertTrigger(L, await triggerSpin())
    await assertInputLoading(L)
    const one = await typeAndList('[cmdk-input]', 'CRM')
    if (!one.list || one.list.items !== 1) bad(`${L} 前提:打「CRM」過濾到 1 筆`, `${one.list?.items} 筆`)
    else {
      measured.push(one.list.height)
      ck(`${L} M1 1 筆結果 [cmdk-list] = 載入訊息列時的 [cmdk-list](${fmt(comboboxEmptyList)})`, near(one.list.height, comboboxEmptyList) && near(one.list.height, emptyH('md')), `${fmt(one.list.height)} vs ${fmt(comboboxEmptyList)}(期望 ${emptyH('md')})`)
    }
    const zero = await typeAndList('[cmdk-input]', NONSENSE)
    if (!zero.list || zero.list.items !== 0 || zero.rows.length !== 1) bad(`${L} 前提:打不存在的字過濾到 0 筆、1 列載入訊息列`, `${zero.list?.items} 筆 / ${zero.rows.length} 列`)
    else {
      measured.push(zero.list.height)
      ck(`${L} 0 筆時整個 [cmdk-list] = ${emptyH('md')}`, near(zero.list.height, emptyH('md')), `${fmt(zero.list.height)}`)
      assertRow(`${L} 0 筆`, zero.rows[0], { kind: 'loading', text: TEXT.loading })
    }
  }
}

// ═══ PeoplePicker ═══
{
  const L = 'PeoplePicker 載入中(首次開啟)'
  if (!(await open(ID.peopleLoading))) bad(`${L} 前提:選單有打開`)
  else {
    const rs = await rows()
    if (rs.length !== 1) bad(`${L} 前提:恰好 1 列訊息列`, `${rs.length} 列`)
    else { assertRow(L, rs[0], { kind: 'loading', text: TEXT.loading }); await hoverCheck(L) }
    assertTrigger(L, await triggerSpin())
    const l = await list(); measured.push(l.height)
    ck(`${L} 整個 [cmdk-list] = ${emptyH('md')}`, near(l.height, emptyH('md')), `${fmt(l.height)}`)
  }
}

// ═══ Command(inline / dialog)═══
{
  const L = 'Command 無結果'
  if (!(await open(ID.commandNoResults))) bad(`${L} 前提:清單有渲染`)
  else {
    const rs = await rows()
    if (rs.length !== 1) bad(`${L} 前提:恰好 1 列訊息列`, `${rs.length} 列`)
    else { assertRow(L, rs[0], { kind: 'empty' }); await hoverCheck(L) }
    const l = await list(); measured.push(l.height)
    ck(`${L} 整個 [cmdk-list] = ${emptyH('md')}`, near(l.height, emptyH('md')), `${fmt(l.height)}`)
    const back = await typeAndList('[cmdk-input]', '')
    ck(`${L} 清掉關鍵字 → 結果回來、[cmdk-empty] 不顯示`, back.list.items > 0 && !back.list.empty, `${back.list.items} 筆,empty=${back.list.empty}`)
  }
}
{
  const L = 'Command 載入中(首次開啟)'
  if (!(await open(ID.commandLoading))) bad(`${L} 前提:清單有渲染`)
  else {
    const rs = await rows()
    if (rs.length !== 1) bad(`${L} 前提:恰好 1 列訊息列`, `${rs.length} 列`)
    else { assertRow(L, rs[0], { kind: 'loading' }); await hoverCheck(L) }
    const l = await list(); measured.push(l.height)
    ck(`${L} 整個 [cmdk-list] = ${emptyH('md')}`, near(l.height, emptyH('md')), `${fmt(l.height)}`)
    await assertInputLoading(L)
  }
}
for (const [key, L] of [['commandInline', 'Command 行內搜尋清單'], ['commandAction', 'Command 純動作指令'], ['commandPalette', 'Command 全域指令面板']]) {
  if (!(await open(ID[key], key === 'commandPalette' ? '#storybook-root button' : '[cmdk-list]'))) { bad(`${L} 前提:story 有渲染`); continue }
  if (key === 'commandPalette') {
    await page.locator('#storybook-root button').first().click()
    const ok = await page.waitForSelector('[cmdk-list]', { timeout: 5000 }).then(() => true).catch(() => false)
    await page.waitForTimeout(600)
    if (!ok) { bad(`${L} 前提:點按鈕後指令面板有打開`); continue }
  }
  const l0 = await list()
  ck(`${L} 有結果時 [cmdk-empty] 不顯示`, l0.items > 0 && !l0.empty, `${l0.items} 筆,empty=${l0.empty}`)
  const zero = await typeAndList('[cmdk-input]', NONSENSE)
  if (!zero.list || zero.list.items !== 0 || zero.rows.length !== 1) { bad(`${L} 前提:打不存在的字 → 0 筆、1 列訊息列`, `${zero.list?.items} 筆 / ${zero.rows.length} 列`); continue }
  assertRow(L, zero.rows[0], { kind: 'empty' }); await hoverCheck(L)
  measured.push(zero.list.height)
  ck(`${L} 整個 [cmdk-list] = ${emptyH('md')}`, near(zero.list.height, emptyH('md')), `${fmt(zero.list.height)}`)
}

// ═══ Menu 訊息列(primitive 本尊:兩列都是手組的 MenuItem message,role 都是 presentation)═══
{
  const L = 'Menu 訊息列'
  if (!(await open(ID.menuMessages, '[role="group"]'))) bad(`${L} 前提:story 有渲染`)
  else {
    const rs = await rows()
    if (rs.length !== 2) bad(`${L} 前提:恰好 2 列訊息列(沒有人員 / 載入中)`, `${rs.length} 列`)
    else {
      assertRow(`${L}「沒有人員」`, rs[0], { kind: 'empty', text: TEXT.peopleEmpty }); await hoverCheck(`${L}「沒有人員」`, 0)
      assertRow(`${L}「載入中」`, rs[1], { kind: 'loading', text: TEXT.loading, role: 'presentation' }); await hoverCheck(`${L}「載入中」`, 1)
    }
  }
}

// ═══ PeoplePicker 名錄非同步載入(假時鐘;放最後,install 之後的導覽都會吃到假時鐘)═══
// 首跑(2026-09-08)這段全紅:名錄未到的 1.5 秒內觸發點沒轉圈、搜尋列沒轉圈、選單裡是「沒有人員」不是「載入選項中」——
// PeoplePicker multi 預設的 stack 分支沒把 loading 轉發給 Combobox(pill 分支有)。這是產品缺口,不是量法問題;story 文字承諾的就是這 1.5 秒。
{
  const L = 'PeoplePicker 名錄非同步載入'
  const T0 = new Date('2026-09-08T00:00:00Z').getTime()
  await page.clock.install({ time: T0 })
  await page.clock.pauseAt(T0 + 1000)
  await page.goto(story(ID.peopleAsync), { waitUntil: 'load' })
  const ok = await page.waitForSelector('#storybook-root [role="combobox"]', { timeout: 15000 }).then(() => true).catch(() => false)
  if (!ok) bad(`${L} 前提:觸發點有渲染`)
  else {
    assertTrigger(`${L}(名錄未到)`, await triggerSpin())
    const box = await page.evaluate(() => { const r = document.querySelector('#storybook-root [role="combobox"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    await page.mouse.click(box.x, box.y)
    const opened = await page.waitForSelector('[cmdk-list]', { timeout: 5000 }).then(() => true).catch(() => false)
    await page.waitForTimeout(600)
    if (!opened) bad(`${L} 前提:點觸發點後選單有打開`)
    else {
      const rs = await rows()
      if (rs.length !== 1) bad(`${L} 前提:名錄未到時恰好 1 列訊息列`, `${rs.length} 列`)
      else assertRow(`${L}(名錄未到)`, rs[0], { kind: 'loading', text: TEXT.loading })
      await assertInputLoading(`${L}(名錄未到)`)
      // 名錄抵達(story 的 1.5 秒 setTimeout 由假時鐘撥過去)
      await page.clock.runFor(1600); await page.waitForTimeout(300)
      const after = await list(); const t = await triggerSpin()
      ck(`${L}(名錄到了)訊息列消失、人員列長出來`, !!after && !after.empty && after.items > 0, `${after?.items} 筆,empty=${after?.empty}`)
      ck(`${L}(名錄到了)觸發點轉圈消失`, t.scope && !t.spinner, t.spinner ? '還在轉' : '已消失')
    }
  }
}

await browser.close(); server.close()
const alive = measured.length > 0 && measured.every((v) => typeof v === 'number' && v > 0)
console.log(`\nM1 量測值(儀器活著檢查,${measured.length} 筆):${measured.map(fmt).join(', ')} → ${alive ? '全部 > 0' : '有 0 / 缺值'}`)
if (SELFTEST) {
  const ok = failed > 0 && broken === 0 && alive
  console.log(ok
    ? `✓ selftest:期望值改成不可能的值(列高 0 / 留白 0 / 轉圈 0 / 容差 −1)後 ${failed} 條變紅,量測值都不是 0 —— 紅得對`
    : `✗ selftest:${failed ? '' : '期望值不可能仍全綠;'}${broken ? `前提失敗 ${broken} 條(紅得不對);` : ''}${alive ? '' : '量測值有 0'}`)
  process.exit(ok ? 0 : 1)
}
if (!alive) { console.log('✗ 儀器對照失敗:M1 量測值有 0,綠燈不算數'); process.exit(1) }
console.log(failed || broken ? `✗ ${failed} 條斷言失敗、${broken} 條前提失敗` : '✓ 選單訊息列:列幾何 / 置中 / 載入指示 / 不可互動 全部符合 2026-09-08 共識')
process.exit(failed || broken ? 1 : 0)
