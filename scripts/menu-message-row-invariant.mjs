#!/usr/bin/env node
/**
 * 選單訊息列閘(2026-09-08 user 拍板;2026-09-09 user 拍板改版:兩個字兩件事 / 遠端清舊清單 / 建議群組)
 *
 * 共識:選單(SelectMenu / Command / Select / Combobox / PeoplePicker)裡「不是選項的列」一律走 MenuItem 的列幾何 ——
 *   「沒有選項 / 沒有結果」= 一列 `<MenuItem message>`(非互動、次要色、字級同選項、內容置中),住在 MenuGroup(py-2)裡,
 *   中尺寸 8 + 32 + 8 = 48,與 1 筆結果等高;沒有任何最小高度。
 *   兩個字兩件事(2026-09-09):
 *     `optionsLoading` = 選項清單在抓 → 指示**只在選單內**(清單沒有任何可顯示選項時,Empty 槽渲載入訊息列:前綴轉圈 + 可見文字,
 *       role=status);觸發點 / 搜尋列**不**轉圈。
 *     `loading` = 這個值在讀取 / 驗證 / 儲存(Field 家族)→ 觸發點右側、ChevronDown 左邊的轉圈 + aria-busy,選單關著也在。
 *   遠端搜尋(filterOption=false):關鍵字空 → 建議群組(必有標題「建議」);抓資料中 → 舊清單不顯示、只剩載入列;
 *     後端回來 → 換結果;真的沒有 → 「沒有選項」;沒建議也沒在載入 → 「輸入關鍵字搜尋」提示列。選項為 0 的群組不畫。
 *
 * 這支閘把上面每一句量成像素(不看 class;每個 story 逐條印 ✓/✗):
 *   M1 「沒有選項」列高 = 一列選項高(md 32;sm 28 / lg 36),MenuGroup 上下各 8 → 整個 [cmdk-empty] = 48(md),
 *      且與同元件 1 筆純文字結果的 [cmdk-list] 等高(用遠端搜尋 story 打字到 1 筆來量;人員列有頭像 + 描述比較高,只驗 8 + 列高 + 8)
 *   M2 載入中訊息列同高 48(md),列內轉圈的 layout 寬高 = ICON_SIZE(md 16 / lg 20),文字可見(不是 sr-only)
 *   M3 訊息列內容水平置中:內容(文字,或轉圈 + 文字整組)中心 x 與列中心 x 誤差 ≤ 1px
 *   M4 選項載入中,搜尋列 [cmdk-input-wrapper] **沒有**轉圈、沒有 aria-busy,input 仍可輸入
 *   M5 觸發點:optionsLoading → 觸發點**沒有**轉圈;loading(值處理中)→ 觸發點有 16px 轉圈在 ChevronDown 左邊 + aria-busy(選單關著也在)
 *   M6 搜尋在觸發點的 Select 0 筆:整個 [cmdk-list] = 48(md),不得多 16(空群組不畫)
 *   M7 訊息列不可互動:pointer-events none、role=presentation(沒有選項 / 提示)/ role=status(載入中)、
 *      hit-test 打不到它、滑鼠移上去底色不變(等 transition-colors 150ms 過完再量)
 *   M8 遠端搜尋(Select / Combobox / PeoplePicker 各一):開啟 = 建議群組 → 打字 → 舊清單不見、載入列在轉、觸發點 / 搜尋列不轉圈
 *      → 後端回來換成結果(1 筆)、沒有建議標題 → 打不存在的字 → 後端回來「沒有選項 / 沒有人員」→ 清掉關鍵字 → 建議回來
 *   M9 群組自動分隔線:可見群組之間恰好一條 1px 線(第一個可見群組沒有),搜尋後剩一組就沒有線
 *   M10 建議群組標題:遠端搜尋關鍵字空時恰一個可見群組、標題「建議」、[cmdk-group-heading] 有 id、
 *      [cmdk-group-items][role=group] 的 aria-labelledby 指向它、標題列 role=presentation、字重 medium(≥ 500)
 *   M11 提示列:遠端搜尋、沒有建議、沒在載入 → 一列「輸入關鍵字搜尋」(role=presentation、同幾何),不是「沒有選項」
 *
 * 數字出處(本檔不新造任何數字):
 *   列高 sm 28 / md 32 / lg 36 = `--field-height-{sm,md,lg}`(packages/design-system/src/tokens/uiSize/uiSize.css:23-26);
 *     訊息列吃 ROW_PADDING_BY_SIZE 的 py = (field-height − 1lh) / 2(patterns/element-anatomy/item-anatomy.tsx:145-149),所以列高 = field-height
 *   群組上下留白 8 = MenuGroup `py-2`(components/Menu/menu-item.tsx MenuGroup)
 *   轉圈 sm/md 16、lg 20 = ICON_SIZE(item-anatomy.tsx ICON_SIZE;components/Command/command.tsx CommandLoading 用 ICON_SIZE[size])
 *   群組標題字重 medium = MenuItem header `font-medium`(components/Menu/menu-item.tsx header 分支)
 *   置中容差 1px = 任務指定的量測容差(不是設計值)
 *
 * 對照組:`--selftest` 把期望值改成不可能的值(列高 0 / 群組留白 0 / 轉圈 0 / 置中容差 −1 / 標題與提示文案改成不存在的字 /
 *   「該沒有轉圈」翻成「該有」)必須紅;兩種模式都先把 M1 的量測值印出來並要求 > 0 —— 儀器活著才算數(M32「儀器要先有對照組」)。
 * 非同步 story(PeoplePicker 名錄 1.5 秒後才到;遠端搜尋 800ms 後端)用 Playwright 假時鐘凍住再 runFor,不靠 wall-clock 搶拍。
 * 瀏覽器:同一個 page 逐 story `goto`(--single-process 沙箱下不開第二個 context;參 scripts/lib/launch-browser.mjs)。
 * 靜態站:預設 storybook-static;`--static=<dir>` 或環境變數 MENU_STATIC 指到別的 build(平行工作時不碰主 build)。
 */
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const staticArg = process.argv.find((a) => a.startsWith('--static='))?.slice('--static='.length)
const STATIC = staticArg ? resolve(staticArg) : (process.env.MENU_STATIC || join(REPO, 'storybook-static'))
const SELFTEST = process.argv.includes('--selftest')
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }

// ── 期望值(出處見檔頭)──
const ROW_H = { sm: 28, md: 32, lg: 36 }
const GROUP_PAD = 8
const ICON = { sm: 16, md: 16, lg: 20 }
const CENTER_TOL = 1
// 共識文案(消費端可覆寫;這裡只驗 DS 預設值出現的 story)
const TEXT = { selectEmpty: '沒有選項', peopleEmpty: '沒有人員', loading: '載入選項中', hint: '輸入關鍵字搜尋', suggestions: '建議' }
const EXPECT = SELFTEST
  ? { row: { sm: 0, md: 0, lg: 0 }, pad: 0, icon: { sm: 0, md: 0, lg: 0 }, tol: -1, hint: '不存在的提示', suggestions: '不存在的標題', headingWeight: 9999, spinnerAbsent: false }
  : { row: ROW_H, pad: GROUP_PAD, icon: ICON, tol: CENTER_TOL, hint: TEXT.hint, suggestions: TEXT.suggestions, headingWeight: 500, spinnerAbsent: true }
const emptyH = (size) => EXPECT.pad * 2 + EXPECT.row[size]
const listH = (size, n) => EXPECT.pad * 2 + EXPECT.row[size] * n

const ID = {
  selectNoOptions: 'design-system-components-select-展示--no-options',
  selectLoading: 'design-system-components-select-展示--loading-first-open',
  selectValueLoading: 'design-system-components-select-展示--value-loading',
  selectRemote: 'design-system-components-select-展示--remote-search',
  selectGrouped: 'design-system-components-select-展示--grouped-search',
  comboboxLoading: 'design-system-components-combobox-展示--loading-first-open',
  comboboxValueLoading: 'design-system-components-combobox-展示--value-loading',
  comboboxRemote: 'design-system-components-combobox-展示--remote-search',
  comboboxRemoteHint: 'design-system-components-combobox-展示--remote-search-hint',
  peopleLoading: 'design-system-components-peoplepicker-展示--loading-first-open',
  peopleValueLoading: 'design-system-components-peoplepicker-展示--value-loading',
  peopleRemote: 'design-system-components-peoplepicker-展示--remote-search',
  peopleAsync: 'design-system-components-peoplepicker-展示--async-directory-load',
  commandNoResults: 'design-system-internal-command-展示--no-results',
  commandLoading: 'design-system-internal-command-展示--loading-first-open',
  commandPalette: 'design-system-internal-command-展示--command-palette',
  commandInline: 'design-system-internal-command-展示--inline-command',
  commandAction: 'design-system-internal-command-展示--action-command',
  menuMessages: 'design-system-internal-menu-展示--messages',
}
const NONSENSE = '零零零不存在的關鍵字'

const near = (a, b, tol = 0.5) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol
const fmt = (n) => (typeof n === 'number' ? +n.toFixed(2) : String(n))
let failed = 0, broken = 0
const measured = []
const ck = (name, pass, detail = '') => { console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ':' + detail : ''}`); if (!pass) failed++ }
const bad = (name, detail = '') => { console.log(`✗ ${name}${detail ? ':' + detail : ''} —— 前提失敗(story 沒渲染出要量的東西),閘不能當「不適用」放行`); broken++ }

// ── story 存在性(先於一切)──
if (!existsSync(join(STATIC, 'index.json'))) { console.log(`✗ 找不到 ${join(STATIC, 'index.json')},先 build storybook(或 --static=<dir>)`); process.exit(1) }
const index = JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8')).entries
for (const [key, id] of Object.entries(ID)) if (!index[id]) bad(`story 存在:${key}`, id)
if (broken) { console.log('✗ 靜態站缺 story,先 build storybook'); process.exit(1) }

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
      // 訊息列(CommandEmpty)住在 listbox 外面(a11y:listbox 裡不得有非 option 子元素,MUI 同構),所以「清單區高度」= 清單 + 訊息列
      const e = document.querySelector('[cmdk-empty]')
      return l ? { height: rect(l).height + (e ? rect(e).height : 0), items: document.querySelectorAll('[cmdk-item]').length, empty: !!e, busy: l.getAttribute('aria-busy') } : null
    },
    spinnerIn(sel) {
      const scope = document.querySelector(sel); if (!scope) return { scope: false }
      const chevron = scope.querySelector('svg.lucide-chevron-down')
      return { scope: true, spinner: spinBox(scope.querySelector('.animate-spin')), chevron: chevron ? rect(chevron) : null, busy: scope.getAttribute('aria-busy') }
    },
    // 可見群組:標題文字 / 標題 id / 群組容器 aria-labelledby / 標題列 role 與字重 / 上邊線
    groups() {
      return [...document.querySelectorAll('[cmdk-group]')].filter((g) => !g.hasAttribute('hidden')).map((g) => {
        const heading = g.querySelector('[cmdk-group-heading]')
        const headingRow = heading ? heading.firstElementChild : null
        const items = g.querySelector('[cmdk-group-items]')
        return {
          heading: heading?.textContent?.trim() ?? '', headingId: heading?.id ?? '',
          itemsRole: items?.getAttribute('role') ?? '', labelledBy: items?.getAttribute('aria-labelledby') ?? '',
          headingRole: headingRow?.getAttribute('role') ?? '', headingWeight: headingRow ? parseInt(getComputedStyle(headingRow).fontWeight, 10) : NaN,
          headingHeight: headingRow ? rect(headingRow).height : NaN,
          bt: parseFloat(getComputedStyle(g).borderTopWidth), items: g.querySelectorAll('[cmdk-item]').length,
        }
      })
    },
  }
})

async function open(id, waitSel = '[cmdk-list]') {
  await page.goto(story(id), { waitUntil: 'load' })
  await page.waitForSelector('#storybook-root [role="combobox"]', { timeout: 15000, state: 'attached' }).catch(() => {})
  // 訊息列在 listbox 外,0 筆時 [cmdk-list] 高度 0 → Playwright 預設等「可見」會逾時;改等「掛上 DOM」
  let ok = await page.waitForSelector(waitSel, { timeout: 1500, state: 'attached' }).then(() => true).catch(() => false)
  if (!ok) {
    // 2026-09-09 user:「為何遠端搜尋名錄的範例預設要打開選單?」→ 互動示範不再 defaultOpen(只有「載入中 / 沒有選項 /
    // 值讀取中」這種開啟態快照才預設開);閘改成像使用者一樣點觸發器打開,再量。
    await page.locator('#storybook-root [role="combobox"]').first().click()
    ok = await page.waitForSelector(waitSel, { timeout: 15000, state: 'attached' }).then(() => true).catch(() => false)
  }
  // Popover / Dialog 開啟動畫(zoom-in-95)結束後才量:動畫中量到的 rect 是 0.95 倍(實測 45.6 而非 48)
  await page.waitForTimeout(600)
  return ok
}
const rows = (size = 'md') => page.evaluate((s) => window.__mm.rows().map((el) => window.__mm.info(el, s)), size)
const list = () => page.evaluate(() => window.__mm.list())
const groups = () => page.evaluate(() => window.__mm.groups())
const triggerSpin = () => page.evaluate(() => window.__mm.spinnerIn('#storybook-root [role="combobox"]'))
const inputSpin = () => page.evaluate(() => window.__mm.spinnerIn('[cmdk-input-wrapper]'))
const TRIGGER_INPUT = '#storybook-root [role="combobox"] input:not([aria-hidden="true"])'

/** 一列訊息列的全部斷言(M1/M2 高度、M3 置中、M7 不可互動;hover 另外量,要動滑鼠) */
function assertRow(label, r, { kind, size = 'md', text, role }) {
  const M = kind === 'loading' ? 'M2' : kind === 'hint' ? 'M11' : 'M1'
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
  if (kind === 'hint') ck(`${label} M11 提示列文案 = 「${EXPECT.hint}」(不是「${TEXT.selectEmpty}」)`, r.text === EXPECT.hint, `實際「${r.text}」`)
  else if (text) ck(`${label} 文案 = 「${text}」(共識預設)`, r.text === text, `實際「${r.text}」`)
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

/** M5(值處理中 loading):觸發點內 16px 轉圈在 ChevronDown 左邊 + aria-busy */
function assertTriggerValueLoading(label, t, size = 'md') {
  if (!t.scope) { bad(`${label} M5 前提:找得到觸發點 [role=combobox]`); return }
  ck(`${label} M5 值處理中 → 觸發點內有 ${EXPECT.icon[size]}px 轉圈`, !!t.spinner && near(t.spinner.w, EXPECT.icon[size]) && near(t.spinner.h, EXPECT.icon[size]), t.spinner ? `${fmt(t.spinner.w)}×${fmt(t.spinner.h)}` : '觸發點內沒有轉圈')
  ck(`${label} M5 轉圈在 ChevronDown 左邊`, !!t.spinner && !!t.chevron && t.spinner.right <= t.chevron.left + 0.5, t.spinner && t.chevron ? `轉圈右緣 ${fmt(t.spinner.right)} ≤ 箭頭左緣 ${fmt(t.chevron.left)}(箭頭 ${fmt(t.chevron.width)}px)` : '缺轉圈或箭頭')
  ck(`${label} M5 觸發點 aria-busy`, t.busy === 'true', String(t.busy))
}
/** M5(選項載入中 optionsLoading):觸發點**沒有**轉圈、沒有 aria-busy */
async function assertTriggerNoSpinner(label) {
  const t = await triggerSpin()
  if (!t.scope) { bad(`${label} M5 前提:找得到觸發點 [role=combobox]`); return }
  ck(`${label} M5 選項載入中 → 觸發點沒有轉圈(指示只在選單內)`, (!t.spinner) === EXPECT.spinnerAbsent, t.spinner ? '觸發點還有轉圈' : '沒有')
  ck(`${label} M5 選項載入中 → 觸發點沒有 aria-busy`, (t.busy !== 'true') === EXPECT.spinnerAbsent, String(t.busy))
}
/** M4(選項載入中):搜尋列**沒有**轉圈、沒有 aria-busy;input 仍可輸入(輸入後清掉) */
async function assertInputNoSpinner(label, { type = true } = {}) {
  const w = await inputSpin()
  if (!w.scope) { bad(`${label} M4 前提:找得到 [cmdk-input-wrapper]`); return }
  ck(`${label} M4 選項載入中 → 搜尋列沒有轉圈`, (!w.spinner) === EXPECT.spinnerAbsent, w.spinner ? `搜尋列還有 ${fmt(w.spinner.w)}px 轉圈` : '沒有')
  ck(`${label} M4 搜尋列沒有 aria-busy`, (w.busy !== 'true') === EXPECT.spinnerAbsent, String(w.busy))
  if (!type) return
  const inp = page.locator('[cmdk-input]')
  await inp.fill('a'); await page.waitForTimeout(150)
  const v = await inp.inputValue()
  ck(`${label} M4 載入中 input 仍可輸入`, v === 'a', `打「a」後 value=「${v}」`)
  await inp.fill(''); await page.waitForTimeout(150)
}

/** M10:建議群組 —— 恰一個可見群組、標題「建議」、id ↔ aria-labelledby、標題列 role=presentation、字重 medium、標題列高 = 一列 */
function assertSuggestionGroup(label, gs, expectItems) {
  ck(`${label} M10 關鍵字空 → 恰一個可見群組`, gs.length === 1, `${gs.length} 組(${gs.map((g) => g.heading || '(無標題)').join(' / ')})`)
  const g = gs[0]
  if (!g) return
  ck(`${label} M10 群組標題 = 「${EXPECT.suggestions}」`, g.heading === EXPECT.suggestions, `實際「${g.heading}」`)
  ck(`${label} M10 標題有 id 且 [role=group] aria-labelledby 指向它`, !!g.headingId && g.itemsRole === 'group' && g.labelledBy === g.headingId, `id=${g.headingId || '(無)'} / role=${g.itemsRole} / labelledby=${g.labelledBy || '(無)'}`)
  ck(`${label} M10 標題列 role=presentation、字重 ≥ ${EXPECT.headingWeight}(medium 是群組標題的辨識訊號)`, g.headingRole === 'presentation' && g.headingWeight >= EXPECT.headingWeight, `role=${g.headingRole} / 字重 ${g.headingWeight}`)
  ck(`${label} M10 標題列高 = 一列選項高(${EXPECT.row.md})`, near(g.headingHeight, EXPECT.row.md), `${fmt(g.headingHeight)}`)
  measured.push(g.headingHeight)
  if (expectItems != null) ck(`${label} M10 建議 ${expectItems} 筆`, g.items === expectItems, `${g.items} 筆`)
}

/** M8:遠端搜尋完整流程(建議 → 打字 → 清舊 + 載入列 → 結果 → 沒有 → 清掉關鍵字回建議)。假時鐘必須已安裝。 */
async function remoteFlow(label, { inputSel, hit, hitLabel, emptyText, suggestionCount, plainRow = true }) {
  const gs0 = await groups()
  assertSuggestionGroup(label, gs0, suggestionCount)
  const before = await list()
  const inp = page.locator(inputSel)
  await inp.fill(hit); await page.waitForTimeout(200)
  const during = await list(); const rs = await rows()
  ck(`${label} M8 打「${hit}」抓資料中 → 舊清單(建議 ${before?.items} 筆)不顯示`, !!during && during.items === 0 && during.empty, `${during?.items} 筆,empty=${during?.empty}`)
  ck(`${label} M8 抓資料中 listbox aria-busy`, during?.busy === 'true', String(during?.busy))
  if (rs.length !== 1) bad(`${label} M8 前提:抓資料中恰好 1 列訊息列`, `${rs.length} 列`)
  else assertRow(`${label} 抓資料中`, rs[0], { kind: 'loading', text: TEXT.loading })
  await assertTriggerNoSpinner(`${label} 抓資料中`)
  { const w = await inputSpin(); if (w.scope) ck(`${label} M4 抓資料中 → 搜尋列沒有轉圈`, (!w.spinner) === EXPECT.spinnerAbsent, w.spinner ? '搜尋列還有轉圈' : '沒有') }
  await page.clock.runFor(900); await page.waitForTimeout(250)
  const after = await list(); const gs1 = await groups()
  ck(`${label} M8 後端回來 → 1 筆「${hitLabel}」`, !!after && after.items === 1 && !after.empty, `${after?.items} 筆,empty=${after?.empty}`)
  ck(`${label} M8 結果不是部分清單 → 沒有「${TEXT.suggestions}」標題`, gs1.length === 1 && gs1[0].heading === '', `${gs1.map((g) => g.heading || '(無標題)').join(' / ')}`)
  if (after) {
    // 1 筆結果的清單高 = 8 + 該列實際高 + 8(人員列有頭像 + 描述,比純文字列高;純文字列 = 32 → 48,與沒有選項時等高)
    const itemH = await page.evaluate(() => document.querySelector('[cmdk-item]')?.getBoundingClientRect().height ?? NaN)
    measured.push(after.height, itemH)
    ck(`${label} M1 1 筆結果 [cmdk-list] = ${EXPECT.pad} + 列高 + ${EXPECT.pad}`, near(after.height, EXPECT.pad * 2 + itemH), `${fmt(after.height)}(列高 ${fmt(itemH)})`)
    if (plainRow) ck(`${label} M1 純文字列 1 筆結果 [cmdk-list] = ${emptyH('md')}(= 沒有選項時的 [cmdk-list])`, near(after.height, emptyH('md')), `${fmt(after.height)}`)
  }
  await inp.fill(NONSENSE); await page.waitForTimeout(200)
  await page.clock.runFor(900); await page.waitForTimeout(250)
  const none = await list(); const rs2 = await rows()
  ck(`${label} M8 後端回空 → 0 筆、訊息列`, !!none && none.items === 0 && none.empty, `${none?.items} 筆,empty=${none?.empty}`)
  if (rs2.length !== 1) bad(`${label} M8 前提:後端回空恰好 1 列訊息列`, `${rs2.length} 列`)
  else assertRow(`${label} 後端回空`, rs2[0], { kind: 'empty', text: emptyText })
  await inp.fill(''); await page.waitForTimeout(250)
  const back = await list(); const gs2 = await groups()
  ck(`${label} M8 清掉關鍵字 → 建議回來(${suggestionCount} 筆 + 標題)`, !!back && back.items === suggestionCount && !back.empty && gs2.length === 1 && gs2[0].heading === EXPECT.suggestions, `${back?.items} 筆,標題「${gs2[0]?.heading ?? ''}」`)
}

let selectEmptyList = null

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
  const L = 'Select 選項載入中(首次開啟)'
  if (!(await open(ID.selectLoading))) bad(`${L} 前提:選單有打開`)
  else {
    const rs = await rows()
    if (rs.length !== 1) bad(`${L} 前提:恰好 1 列訊息列`, `${rs.length} 列`)
    else { assertRow(L, rs[0], { kind: 'loading', text: TEXT.loading }); await hoverCheck(L) }
    await assertTriggerNoSpinner(L)
    const l = await list(); measured.push(l.height)
    ck(`${L} M6 整個 [cmdk-list] = ${emptyH('md')}`, near(l.height, emptyH('md')), `${fmt(l.height)}`)
    ck(`${L} listbox aria-busy`, l.busy === 'true', String(l.busy))
  }
}
{
  const L = 'Select 值處理中(選單關著)'
  if (!(await open(ID.selectValueLoading, '#storybook-root [role="combobox"]'))) bad(`${L} 前提:觸發點有渲染`)
  else assertTriggerValueLoading(L, await triggerSpin())
}

// ═══ Combobox ═══
{
  const L = 'Combobox 選項載入中(首次開啟)'
  if (!(await open(ID.comboboxLoading))) bad(`${L} 前提:選單有打開`)
  else {
    const rs = await rows()
    if (rs.length !== 1) bad(`${L} 前提:恰好 1 列訊息列`, `${rs.length} 列`)
    else { assertRow(L, rs[0], { kind: 'loading', text: TEXT.loading }); await hoverCheck(L) }
    await assertTriggerNoSpinner(L)
    await assertInputNoSpinner(L)
    const l = await list(); measured.push(l.height)
    ck(`${L} 整個 [cmdk-list] = ${emptyH('md')}`, near(l.height, emptyH('md')), `${fmt(l.height)}`)
  }
}
{
  const L = 'Combobox 值處理中(選單關著)'
  if (!(await open(ID.comboboxValueLoading, '#storybook-root [role="combobox"]'))) bad(`${L} 前提:觸發點有渲染`)
  else assertTriggerValueLoading(L, await triggerSpin())
}
{
  const L = 'Combobox 遠端搜尋(還沒打字、沒有建議)'
  if (!(await open(ID.comboboxRemoteHint))) bad(`${L} 前提:選單有打開`)
  else {
    const rs = await rows()
    if (rs.length !== 1) bad(`${L} 前提:恰好 1 列訊息列`, `${rs.length} 列`)
    else { assertRow(L, rs[0], { kind: 'hint' }); await hoverCheck(L) }
    const l = await list(); measured.push(l.height)
    ck(`${L} 整個 [cmdk-list] = ${emptyH('md')}`, near(l.height, emptyH('md')), `${fmt(l.height)}`)
    await assertInputNoSpinner(L, { type: false })
  }
}

// ═══ PeoplePicker ═══
{
  const L = 'PeoplePicker 選項載入中(首次開啟)'
  if (!(await open(ID.peopleLoading))) bad(`${L} 前提:選單有打開`)
  else {
    const rs = await rows()
    if (rs.length !== 1) bad(`${L} 前提:恰好 1 列訊息列`, `${rs.length} 列`)
    else { assertRow(L, rs[0], { kind: 'loading', text: TEXT.loading }); await hoverCheck(L) }
    await assertTriggerNoSpinner(L)
    const l = await list(); measured.push(l.height)
    ck(`${L} 整個 [cmdk-list] = ${emptyH('md')}`, near(l.height, emptyH('md')), `${fmt(l.height)}`)
  }
}
{
  const L = 'PeoplePicker 值處理中(選單關著)'
  if (!(await open(ID.peopleValueLoading, '#storybook-root [role="combobox"]'))) bad(`${L} 前提:觸發點有渲染`)
  else assertTriggerValueLoading(L, await triggerSpin())
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
    const inp = page.locator('[cmdk-input]'); await inp.fill(''); await page.waitForTimeout(250)
    const back = await list()
    ck(`${L} 清掉關鍵字 → 結果回來、[cmdk-empty] 不顯示`, back.items > 0 && !back.empty, `${back.items} 筆,empty=${back.empty}`)
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
    await assertInputNoSpinner(L)
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
  const inp = page.locator('[cmdk-input]'); await inp.fill(NONSENSE); await page.waitForTimeout(250)
  const zero = { list: await list(), rows: await rows() }
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

// ═══ M9 群組自動分隔線(Select 分組 + 搜尋;不吃時鐘,放假時鐘之前)═══
{
  const L = 'Select 分組搜尋'
  if (!(await open(ID.selectGrouped))) bad(`${L} 前提:選單有打開`)
  else {
    const g0 = await groups()
    ck(`${L} M9 兩個可見群組`, g0.length === 2, `${g0.length} 組(${g0.map((g) => g.heading).join(' / ')})`)
    ck(`${L} M9 第一個可見群組沒有上邊線、第二個有 1px`, g0.length === 2 && g0[0].bt === 0 && g0[1].bt === 1, g0.map((g) => g.bt).join(','))
    await page.keyboard.type('日圓')
    await page.waitForTimeout(200)
    const g1 = await groups()
    ck(`${L} M9 搜尋只剩「亞洲」一組 → 沒有線`, g1.length === 1 && g1[0].bt === 0, `${g1.length} 組,線 ${g1.map((g) => g.bt).join(',')}`)
    for (let i = 0; i < 2; i++) await page.keyboard.press('Backspace')
    await page.keyboard.type('元')
    await page.waitForTimeout(200)
    const g2 = await groups()
    ck(`${L} M9 「元」同時命中兩組 → 恰好一條線在第二組`, g2.length === 2 && g2[0].bt === 0 && g2[1].bt === 1, `${g2.length} 組,線 ${g2.map((g) => g.bt).join(',')}`)
  }
}

// ═══ 假時鐘段(install 之後的導覽都吃假時鐘;非同步 story 全放這裡)═══
const T0 = new Date('2026-09-09T00:00:00Z').getTime()
await page.clock.install({ time: T0 })
await page.clock.pauseAt(T0 + 1000)

// PeoplePicker 名錄非同步載入(前 1.5 秒 optionsLoading:觸發點不轉圈、選單裡「載入選項中」;名錄到了長出人員列)
{
  const L = 'PeoplePicker 名錄非同步載入'
  await page.goto(story(ID.peopleAsync), { waitUntil: 'load' })
  const ok = await page.waitForSelector('#storybook-root [role="combobox"]', { timeout: 15000 }).then(() => true).catch(() => false)
  if (!ok) bad(`${L} 前提:觸發點有渲染`)
  else {
    await assertTriggerNoSpinner(`${L}(名錄未到)`)
    const box = await page.evaluate(() => { const r = document.querySelector('#storybook-root [role="combobox"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    await page.mouse.click(box.x, box.y)
    const opened = await page.waitForSelector('[cmdk-list]', { timeout: 5000, state: 'attached' }).then(() => true).catch(() => false)
    await page.waitForTimeout(600)
    if (!opened) bad(`${L} 前提:點觸發點後選單有打開`)
    else {
      const rs = await rows()
      if (rs.length !== 1) bad(`${L} 前提:名錄未到時恰好 1 列訊息列`, `${rs.length} 列`)
      else assertRow(`${L}(名錄未到)`, rs[0], { kind: 'loading', text: TEXT.loading })
      await assertInputNoSpinner(`${L}(名錄未到)`, { type: false })
      // 名錄抵達(story 的 1.5 秒 setTimeout 由假時鐘撥過去)
      await page.clock.runFor(1600); await page.waitForTimeout(300)
      const after = await list()
      ck(`${L}(名錄到了)訊息列消失、人員列長出來`, !!after && !after.empty && after.items > 0, `${after?.items} 筆,empty=${after?.empty}`)
    }
  }
}

// M8 / M10 遠端搜尋 ×3(Select:搜尋在觸發點 / Combobox:搜尋在浮層 / PeoplePicker single:搜尋在觸發點)
{
  const L = 'Select 遠端搜尋'
  if (!(await open(ID.selectRemote))) bad(`${L} 前提:選單有打開`)
  else await remoteFlow(L, { inputSel: TRIGGER_INPUT, hit: 'roadmap', hitLabel: '產品路線圖', emptyText: TEXT.selectEmpty, suggestionCount: 3 })
}
{
  const L = 'Combobox 遠端搜尋'
  if (!(await open(ID.comboboxRemote))) bad(`${L} 前提:選單有打開`)
  else await remoteFlow(L, { inputSel: '[cmdk-input]', hit: 'customer', hitLabel: 'CRM 客戶名單', emptyText: TEXT.selectEmpty, suggestionCount: 2 })
}
{
  const L = 'PeoplePicker 遠端搜尋名錄'
  if (!(await open(ID.peopleRemote))) bad(`${L} 前提:選單有打開`)
  else await remoteFlow(L, { inputSel: TRIGGER_INPUT, hit: 'bob', hitLabel: 'Bob Lin', emptyText: TEXT.peopleEmpty, suggestionCount: 2, plainRow: false })
}

await browser.close(); server.close()
const alive = measured.length > 0 && measured.every((v) => typeof v === 'number' && v > 0)
console.log(`\nM1 量測值(儀器活著檢查,${measured.length} 筆):${measured.map(fmt).join(', ')} → ${alive ? '全部 > 0' : '有 0 / 缺值'}`)
if (SELFTEST) {
  const ok = failed > 0 && broken === 0 && alive
  console.log(ok
    ? `✓ selftest:期望值改成不可能的值(列高 0 / 留白 0 / 轉圈 0 / 容差 −1 / 文案與標題改成不存在的字 / 「該沒有轉圈」翻成「該有」)後 ${failed} 條變紅,量測值都不是 0 —— 紅得對`
    : `✗ selftest:${failed ? '' : '期望值不可能仍全綠;'}${broken ? `前提失敗 ${broken} 條(紅得不對);` : ''}${alive ? '' : '量測值有 0'}`)
  process.exit(ok ? 0 : 1)
}
if (!alive) { console.log('✗ 儀器對照失敗:M1 量測值有 0,綠燈不算數'); process.exit(1) }
console.log(failed || broken ? `✗ ${failed} 條斷言失敗、${broken} 條前提失敗` : '✓ 選單訊息列:列幾何 / 置中 / 載入指示只在選單內 / 值處理中轉圈 / 遠端清舊清單 / 建議群組標題 / 提示列 / 不可互動 全部符合 2026-09-09 共識')
process.exit(failed || broken ? 1 : 0)
