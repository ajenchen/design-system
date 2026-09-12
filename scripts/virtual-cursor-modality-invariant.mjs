#!/usr/bin/env node
/**
 * 虛擬游標:框只在鍵盤模態下畫,而且游標一律是框、不上底色(2026-09-08 / 2026-09-09)
 * + 會搶反白的浮層選單:反白只有一個主人,滑鼠與鍵盤搶的是同一個東西(2026-09-09 下午)
 *
 * 2026-09-08 user 抓到:滑鼠點開 Select,已選項立刻出現鍵盤焦點框 ——「我明明都還沒開始碰鍵盤」。
 * 根因:cmdk 開啟時把游標放在已選項上,而「已選 + 游標」的畫框規則沒有模態條件。
 * 2026-09-09 user 拍板:「就是基本上都是畫框,唯一不畫框的例外就是…單一狀態控制項」「都不需要上底色」——
 * 未選中的游標列先前用 hover 同色底當游標(舊 D 類),那是 AI 推導不是 user 決定,整類撤回。
 * 2026-09-09 user 再問:「滑鼠會搶反白的元件,搶完之後,那鍵盤是否可以再搶回?且搶回去之後原本滑鼠的 hover 樣式
 * 即會消失直到滑鼠又搶回來才會再出現,且滑鼠的搶應該是包括鍵盤焦點一起搶吧?」—— 三題答案(SSOT:focus-canonical.md
 * 規則一「兩類元件」+ 規則二疊加表):會搶反白的元件裡**反白就是唯一的游標**,誰最後搬動它就用誰的畫法
 *(滑鼠移過 → 底色;鍵盤 → 框),兩種畫法永遠不同時出現;滑鼠停著不算搶(pointer move 才算)。
 * 常駐清單(TreeView / Sidebar / Tabs / DataTable / TimePicker 欄)不搶反白:hover 底色與鍵盤框是兩個獨立狀態,可同時出現。
 *
 * 機械載體:hooks/use-input-modality.ts —— `useInputModality`(WICG 啟發式,給常駐清單的虛擬游標)/
 * `useCursorMover` + `markPointerGrab`(反白來歷,給 cmdk / Radix Menu)。
 *
 * 五段(原有)+ 兩組(2026-09-09 下午)都驗,缺一不可:
 *   (A)  真滑鼠點開 → 已選項**不得**有框
 *   (A2) 指標模態下滑鼠停在未選中列 → **有底色、無框**(底色只屬於 hover)
 *   (B)  接著用鍵盤把游標移開再移回已選項 → **必須**有框(否則就是把框整個殺掉換綠燈)
 *   (B2) 鍵盤模態下游標停在未選中列 → **有框,而且底色 = 其他未選中列**(游標不上底色)
 *   (C)  純鍵盤開啟(Tab 到觸發器、ArrowDown)→ 已選項**立刻**有框
 *   (D)  會搶反白的元件「搶來搶去」四步(Select / SelectMenu / Combobox / PeoplePicker / Command inline+dialog /
 *        DropdownMenu 四種項目 / AgentPanel 歷史):滑鼠移到 A(底色)→ ↓ 到 B(B 框、B 無底色、**A 底色消失**)
 *        → 滑鼠移到 C(**B 框消失**、C 底色無框)→ 滑鼠停在 C 不動再按 ↑(**C 底色消失**、B 框)
 *   (E)  常駐清單(TreeView / Sidebar / Tabs / DataTable / TimePicker 欄):鍵盤框在時滑鼠 hover → **底色與框同時存在**
 *   (F)  在文字輸入框裡打字不算搬游標(2026-09-10 user 抓到「滑鼠點輸入框、輸入 a、Backspace → 選單出現鍵盤焦點框」):
 *        滑鼠點進搜尋列 → 打一個字 → Backspace → 自動落點的反白**無框**(底色 = 開啟那一下的指標來歷);接著 ↓ → **有框**(對照:儀器看得到框)
 *   (G)  Field 家族關閉觸發器只用邊框轉色、不畫外框(2026-09-10 下午 user:「Combobox 和 select 這兩大類的鍵盤焦點是否設計不一致?」):
 *        Select / SelectMenu / PeoplePicker 選完後輸入框卸載、焦點回觸發器 —— ↓ Enter 選完 → 觸發器**無外框、邊框轉主色**;滑鼠點選項選完 → 同樣無外框、邊框主色
 *   (H)  同一條規則的其他成員:DatePicker / TimePicker / Combobox 的 div 觸發器,Tab 進來(鍵盤模態)→ **無外框、邊框轉主色**
 * 量 outline 前等 700ms(transition-colors 含 outline-color,立刻量會抓到過渡值)。
 *
 * `--selftest` 對照組(M32「儀器要先有對照組」):每頁載入後注入一段 CSS,把游標列釘回舊行為
 *(底色當游標、不畫框;會搶反白的列另外保留獨立的 :hover 底色與「鍵盤留下的框」;常駐清單 hover 時抹掉框),
 * 所有 tag='new' 的斷言就該整批變紅;沒變紅代表這支閘量的不是它宣稱的東西。
 *
 * `--static=<dir>`:不讀 repo 根的 storybook-static,改讀指定目錄(給不想覆蓋主 build 的旁支驗證用)。
 */
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { launchBrowser } from './lib/launch-browser.mjs'

const SELFTEST = process.argv.includes('--selftest')
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = staticArg ? staticArg.slice('--static='.length) : join(process.cwd(), 'storybook-static')
// stale-build 守衛(同 focus-indicator-invariants):build 比被驗的原始碼舊 = 驗到舊 CSS/JS(假綠)
const SRCS = [
  'packages/design-system/src/hooks/use-input-modality.ts',
  'packages/design-system/src/components/Command/command.tsx',
  'packages/design-system/src/components/DropdownMenu/dropdown-menu.tsx',
  'packages/design-system/src/components/Menu/menu-item.tsx',
  'packages/design-system/src/components/TreeView/tree-view.tsx',
  'packages/design-system/src/components/Sidebar/sidebar.tsx',
  'packages/design-system/src/components/TimePicker/time-columns.tsx',
]
if (!existsSync(join(STATIC, 'index.html'))) { console.error(`✗ 找不到 ${STATIC}/index.html —— 先 build storybook(或用 --static=<dir>)`); process.exit(2) }
const buildMtime = statSync(join(STATIC, 'index.html')).mtimeMs
for (const f of SRCS) { if (existsSync(f) && statSync(f).mtimeMs > buildMtime) { console.error(`✗ STALE-BUILD:${f} 比 ${STATIC} 新 —— 先重新 build storybook`); process.exit(2) } }

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const sv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'
  const f = join(STATIC, p)
  if (!existsSync(f) || statSync(f).isDirectory()) { s.writeHead(404); s.end(); return }
  s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f))
})
await new Promise((r) => sv.listen(0, r))
const story = (id) => `http://localhost:${sv.address().port}/iframe.html?id=` + encodeURIComponent(id) + '&viewMode=story'

const out = []; let fail = 0; let controlled = 0; let controlledTotal = 0
/** tag='new' 的斷言是對照組要弄壞的那幾條(鍵盤游標的長相 / 反白唯一主人 / 常駐清單框不被 hover 抹掉);其餘(前提、指標模態)對照組不動。 */
const ck = (t, p, d = '', tag = '') => {
  out.push(`${p ? '✓' : '✗'} ${t}${d ? ' | ' + d : ''}`)
  if (!p) fail++
  if (SELFTEST && tag === 'new') { controlledTotal++; if (!p) controlled++ }
}

// 對照組:把游標列釘回「底色當游標、不畫框」的舊行為;會搶反白的列另外保留獨立 :hover 底色(A 停留處不消失)
// 與「鍵盤留下的框」(不是反白的列也畫框 = 滑鼠搶走後框沒消失);常駐清單 hover 時抹掉框(hover 與框不能共存)。
const GRAB = '[cmdk-item], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'
const GRAB_CURSOR = '[cmdk-item][data-selected="true"], [role="menuitem"][data-highlighted], [role="menuitemradio"][data-highlighted], [role="menuitemcheckbox"][data-highlighted]'
const GRAB_IDLE = '[cmdk-item]:not([data-selected="true"]):not(:hover), [role="menuitem"]:not([data-highlighted]):not(:hover), [role="menuitemradio"]:not([data-highlighted]):not(:hover), [role="menuitemcheckbox"]:not([data-highlighted]):not(:hover)'
const OLD_BEHAVIOUR_CSS = `
  ${GRAB_CURSOR} { outline: none !important; background-color: var(--neutral-hover) !important; }
  ${GRAB.split(', ').map((s) => s + ':hover').join(', ')} { background-color: var(--neutral-hover) !important; }
  ${GRAB_IDLE} { outline: 2px solid var(--ring) !important; outline-offset: -2px !important; }
  [data-sidebar="menu-button"]:hover, [role="tab"]:hover, [role="row"]:hover [role="checkbox"], [data-tree-row]:hover { outline: none !important; }
  [role="listbox"].group\\/listbox [role="option"]:hover { background-color: transparent !important; }`
// TreeView 的游標只從 aria-activedescendant 得知,CSS 釘不到 → 觀察那個屬性,只把游標那一列釘回舊行為
// F 的對照組:舊行為「打字後自動落點的反白畫框」—— 把游標列釘成永遠有框(蓋過 gotoStory 注入的 A–E 對照 CSS,後加者勝),F 的 'new' 斷言必紅
const OLD_BEHAVIOUR_TYPING_CSS = `${GRAB_CURSOR} { outline: 2px solid var(--ring) !important; outline-offset: -2px !important; background-color: transparent !important; }`
const OLD_BEHAVIOUR_TREE_JS = `(() => {
  const pin = () => {
    const tree = document.querySelector('[role="tree"]'); if (!tree) return
    const id = tree.getAttribute('aria-activedescendant')
    document.querySelectorAll('[data-tree-row][data-selftest-pinned]').forEach((r) => { r.style.outline = ''; r.style.backgroundColor = ''; r.removeAttribute('data-selftest-pinned') })
    const row = id && document.getElementById(id)?.querySelector('[data-tree-row]')
    if (row) { row.style.setProperty('outline', 'none', 'important'); row.style.setProperty('background-color', 'var(--neutral-hover)', 'important'); row.setAttribute('data-selftest-pinned', '') }
  }
  new MutationObserver(pin).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['aria-activedescendant', 'class'] })
  pin()
})()`
const gotoStory = async (page, id, waitSel) => {
  await page.goto(story(id), { waitUntil: 'load' })
  if (waitSel) await page.waitForSelector(waitSel, { timeout: 15000 }).catch(() => {})
  if (SELFTEST) { await page.addStyleTag({ content: OLD_BEHAVIOUR_CSS }); await page.addScriptTag({ content: OLD_BEHAVIOUR_TREE_JS }) }
  await page.waitForTimeout(300)
}

// 「已選項」= 各元件語意上的選中項;「游標項」= cmdk data-selected / Radix data-highlighted
// `items` 列出所有可當游標的列;`isTrulySelected(el)` 分辨「選中」與「游標」——cmdk 把游標寫成 aria-selected,
// 真選中在內層 MenuItem 的 data-selected=""(menu-item.tsx)或 Radix 的 aria-checked。
const CMDK = { items: '[cmdk-item]', cursorAttr: '[data-selected="true"]', truly: ':scope > [role="presentation"][data-selected=""]' }
const RADIX = { cursorAttr: '[data-highlighted]', truly: ':scope[aria-checked="true"]' }
const TARGETS = [
  { name: 'Select', id: 'design-system-components-select-展示--modes',
    trigger: '[role="combobox"]:not([disabled])', selectedItem: '[role="option"][aria-selected="true"], [role="option"][data-selected="true"]', ...CMDK },
  { name: 'SelectMenu', id: 'design-system-internal-selectmenu-展示--single-select',
    trigger: '[role="combobox"]:not([disabled])', selectedItem: '[role="option"][aria-selected="true"], [role="option"][data-selected="true"]', ...CMDK },
  { name: 'DropdownMenu radio', id: 'design-system-components-dropdownmenu-展示--radio-items',
    trigger: 'button[aria-haspopup]:not([disabled])', selectedItem: '[role="menuitemradio"][aria-checked="true"]',
    items: '[role="menuitemradio"], [role="menuitem"], [role="menuitemcheckbox"]', ...RADIX },
]

/** (D) 會搶反白的元件:每個都做同一支「搶來搶去」舞步。`focusFirst`:inline Command 沒有觸發器,要先把焦點放進搜尋列。 */
const COMBOBOX_TRIGGER = '#storybook-root [role="combobox"]:not([disabled]):not([aria-disabled="true"])'
const GRAB_TARGETS = [
  // modes / single-select 只有 3 個選項且 1 個已選,湊不出三個相鄰未選中列 → 用 searchable 那支(多選項)
  { name: 'Select', id: 'design-system-components-select-展示--searchable', trigger: COMBOBOX_TRIGGER, ...CMDK },
  { name: 'SelectMenu', id: 'design-system-internal-selectmenu-展示--searchable', trigger: COMBOBOX_TRIGGER, ...CMDK },
  { name: 'Combobox', id: 'design-system-components-combobox-展示--modes', trigger: COMBOBOX_TRIGGER, ...CMDK },
  { name: 'PeoplePicker', id: 'design-system-components-peoplepicker-展示--single', trigger: COMBOBOX_TRIGGER, ...CMDK },
  { name: 'Command inline', id: 'design-system-internal-command-展示--inline-command', focusFirst: 'input[cmdk-input]', ...CMDK },
  { name: 'Command dialog', id: 'design-system-internal-command-展示--command-palette', trigger: '#storybook-root button', ...CMDK },
  { name: 'AgentPanel 歷史', id: 'design-system-components-agentpanel-展示--history-open', focusFirst: 'input[cmdk-input]', ...CMDK },
  { name: 'DropdownMenu item', id: 'design-system-components-dropdownmenu-展示--default', trigger: 'button[aria-haspopup="menu"]:not([disabled])', items: '[role="menuitem"]:not([aria-haspopup])', ...RADIX },
  { name: 'DropdownMenu checkbox', id: 'design-system-components-dropdownmenu-展示--checkbox-items', trigger: 'button[aria-haspopup="menu"]:not([disabled])', items: '[role="menuitemcheckbox"]', cursorAttr: '[data-highlighted]', truly: ':scope[data-never]' },
  { name: 'DropdownMenu radio', id: 'design-system-components-dropdownmenu-展示--radio-items', trigger: 'button[aria-haspopup="menu"]:not([disabled])', items: '[role="menuitemradio"]', ...RADIX },
  { name: 'DropdownMenu sub-trigger', id: 'design-system-components-dropdownmenu-展示--sub-menu', trigger: 'button[aria-haspopup="menu"]:not([disabled])', items: '[role="menuitem"]', subTrigger: '[role="menuitem"][aria-haspopup="menu"]', ...RADIX },
]

const ringOf = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return { missing: true }
  const cs = getComputedStyle(el)
  return { w: parseFloat(cs.outlineWidth) || 0, style: cs.outlineStyle, color: cs.outlineColor, text: (el.textContent || '').trim().slice(0, 16) }
}, sel)
const drawn = (r) => !r.missing && r.style !== 'none' && r.w > 0
const centerOf = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector('#storybook-root ' + s) || document.querySelector(s); if (!el) return null
  const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}, sel)

/**
 * 量「游標列 vs 其他未選中列」:回傳游標列有沒有框、游標列底色、對照列底色。
 * 對照列 = 不是游標、不是真選中、沒停用的任一列。
 */
const cursorVsOthers = (page, t) => page.evaluate(({ items, cursorAttr, truly }) => {
  // cmdk 對**可用**的列也寫 data-disabled="false",只看屬性存在會把全部濾掉(2026-09-09 首跑抓到)
  const all = [...document.querySelectorAll(items)].filter((e) => !e.matches('[aria-disabled="true"],[data-disabled="true"],[data-disabled=""]'))
  const cursor = all.find((e) => e.matches(cursorAttr))
  if (!cursor) return { error: '找不到游標列' }
  const cursorTruly = !!cursor.querySelector(truly) || cursor.matches(truly)
  const other = all.find((e) => e !== cursor && !(e.querySelector(truly) || e.matches(truly)))
  if (!other) return { error: '找不到對照列' }
  const cs = getComputedStyle(cursor)
  return { text: (cursor.textContent || '').trim().slice(0, 16), cursorTruly,
    ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, ringDesc: `${cs.outlineStyle} ${cs.outlineWidth}`,
    bg: cs.backgroundColor, otherBg: getComputedStyle(other).backgroundColor }
}, t)

/** 找一個未選中、沒停用、且不是目前游標的列,回它的中心座標 */
const unselectedItemBox = (page, t) => page.evaluate(({ items, cursorAttr, truly }) => {
  const all = [...document.querySelectorAll(items)].filter((e) => !e.matches('[aria-disabled="true"],[data-disabled="true"],[data-disabled=""]'))
  const el = all.find((e) => !e.matches(cursorAttr) && !(e.querySelector(truly) || e.matches(truly)))
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}, t)

// ── 靜態前置:會搶反白的項目上不得有 `hover:bg-*`(反白只有一個主人;內層 MenuItem 的 `hover:!bg-transparent` 是中和,不算)──
// 這條用 grep 就能守,不必等瀏覽器;瀏覽器段負責「畫出來真的是那樣」。
for (const f of ['packages/design-system/src/components/Command/command.tsx', 'packages/design-system/src/components/DropdownMenu/dropdown-menu.tsx']) {
  if (!existsSync(f)) continue
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '')
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
    if (/\bhover:bg-/.test(code) && !/hover:!bg-transparent/.test(code)) ck(`靜態 ${f}:${i + 1} 會搶反白的項目不得有 hover:bg-*`, false, code.trim().slice(0, 100), 'new')
  })
}

const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

for (const t of TARGETS) {
  // ── (A) 真滑鼠點開 ───────────────────────────────────────────────────
  await gotoStory(page, t.id, t.trigger)
  const box = await centerOf(page, t.trigger)
  if (!box) { ck(`${t.name} 前提:找得到觸發器`, false, t.trigger); continue }
  await page.mouse.click(box.x, box.y); await page.waitForTimeout(700)
  const a = await ringOf(page, t.selectedItem)
  if (a.missing) { ck(`${t.name} 前提:滑鼠點開後找得到已選項`, false, t.selectedItem); continue }
  ck(`${t.name} A 滑鼠點開:已選項**不得**有框(還沒碰鍵盤)`, !drawn(a), `「${a.text}」outline=${a.style} ${a.w}px`)

  // ── (A2) 指標模態:滑鼠停在未選中列 → 有底色、無框 ─────────────────────
  const hoverBox = await unselectedItemBox(page, t)
  if (!hoverBox) ck(`${t.name} A2 前提:找得到可 hover 的未選中列`, false)
  else {
    await page.mouse.move(hoverBox.x, hoverBox.y); await page.waitForTimeout(700)
    const h = await cursorVsOthers(page, t)
    if (h.error) ck(`${t.name} A2 前提:hover 後找得到游標列與對照列`, false, h.error)
    else {
      ck(`${t.name} A2 指標模態 hover:游標跟到滑鼠、**有底色**(≠ 其他列)`, !h.cursorTruly && h.bg !== h.otherBg, `「${h.text}」bg=${h.bg} vs ${h.otherBg}`)
      ck(`${t.name} A2 指標模態 hover:**無框**`, !h.ring, `「${h.text}」outline=${h.ringDesc}`)
    }
    // 滑鼠移回觸發器上(不在清單上),後面的鍵盤段才量得到「沒有 hover」的游標列
    await page.mouse.move(box.x, box.y); await page.waitForTimeout(100)
  }

  // ── (B) 鍵盤把游標移開再移回已選項 → 該有框 ─────────────────────────────
  // A2 已經把游標移到 hover 的那一列,先用方向鍵走回已選項(最多一輪),再做「移開再移回」。
  for (let i = 0; i < 12; i++) {
    const onSel = await page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.matches('[data-selected="true"],[data-highlighted]') }, t.selectedItem)
    if (onSel) break
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(60)
  }
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80)
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(700)
  const b = await ringOf(page, t.selectedItem)
  ck(`${t.name} B 對照組:鍵盤把游標移回已選項 → **必須**有框(沒把框整個殺掉)`, drawn(b), `「${b.text}」outline=${b.style} ${b.w}px ${b.color}`, 'new')

  // ── (B2) 鍵盤模態:游標停在未選中列 → 有框、底色 = 其他未選中列 ─────────
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80)
  let b2 = await cursorVsOthers(page, t)
  if (!b2.error && b2.cursorTruly) { await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(80); b2 = await cursorVsOthers(page, t) }
  await page.waitForTimeout(700); b2 = b2.error ? b2 : await cursorVsOthers(page, t)
  if (b2.error) ck(`${t.name} B2 前提:方向鍵能把游標停在未選中列`, false, b2.error)
  else {
    ck(`${t.name} B2 鍵盤模態游標停在未選中列:**有框**`, !b2.cursorTruly && b2.ring, `「${b2.text}」truly=${b2.cursorTruly} outline=${b2.ringDesc}`, 'new')
    ck(`${t.name} B2 鍵盤模態游標列**不上底色**(底色 = 其他未選中列)`, b2.bg === b2.otherBg, `bg=${b2.bg} vs ${b2.otherBg}`, 'new')
  }

  // ── (C) 純鍵盤開啟 → 立刻有框 ───────────────────────────────────────
  await gotoStory(page, t.id, t.trigger)
  let onTrigger = false
  for (let i = 0; i < 25 && !onTrigger; i++) {
    await page.keyboard.press('Tab')
    onTrigger = await page.evaluate((s) => document.activeElement?.matches(s) ?? false, t.trigger)
  }
  if (!onTrigger) { ck(`${t.name} C 前提:Tab 走得到觸發器`, false); continue }
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(400)
  if ((await ringOf(page, t.selectedItem)).missing) { await page.keyboard.press('Enter'); await page.waitForTimeout(400) }
  // 游標開啟時落在哪一項是各套件自己的規則:cmdk 用 defaultValue 落在已選項;
  // Radix Menu 依 APG 落在**第一項**。所以這裡不假設落點 —— 用方向鍵把游標走到已選項上再驗
  //(最多走一輪),驗的不變式是「鍵盤模態 + 已選 + 游標 → 必有框」。
  let onSelected = false
  for (let i = 0; i < 12 && !onSelected; i++) {
    onSelected = await page.evaluate((s) => { const el = document.querySelector(s); return !!el && (el.matches('[data-selected="true"],[data-highlighted]')) }, t.selectedItem)
    if (!onSelected) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(60) }
  }
  await page.waitForTimeout(700)
  const c2 = await ringOf(page, t.selectedItem)
  ck(`${t.name} C 純鍵盤開啟並走到已選項:**必須**有框`, onSelected && drawn(c2), c2.missing ? '鍵盤開不了' : `游標在已選項=${onSelected}「${c2.text}」outline=${c2.style} ${c2.w}px`, 'new')
}

// ── (D) 會搶反白的元件:滑鼠 → 鍵盤 → 滑鼠 → 鍵盤,反白只有一個主人 ────────────
/**
 * 三個相鄰、可用、未選中的列(cmdk / Radix 的 ↓↑ 都照 DOM 順序走到下一個可用列,所以在「可用列」序列裡相鄰即可);
 * 湊不到三個(勾選項 / 單選 story 各只有 2 個可用未選中列)就退成兩個 —— C 由 A 代打、閒置參考改用透明(DS 閒置列就是透明)。
 */
const pickRun = (page, t) => page.evaluate(({ items, truly }) => {
  const all = [...document.querySelectorAll(items)].filter((e) => !e.matches('[aria-disabled="true"],[data-disabled="true"],[data-disabled=""]'))
  const isTruly = (e) => !!(e.querySelector(truly) || e.matches(truly))
  for (const size of [3, 2]) {
    for (let i = 0; i + size - 1 < all.length; i++) {
      const run = all.slice(i, i + size)
      if (run.every((e) => !isTruly(e))) return { start: i, size, count: all.length, texts: run.map((e) => (e.textContent || '').trim().slice(0, 12)) }
    }
  }
  return null
}, t)
const runState = (page, t, start, size) => page.evaluate(({ items, cursorAttr, start, size }) => {
  const all = [...document.querySelectorAll(items)].filter((e) => !e.matches('[aria-disabled="true"],[data-disabled="true"],[data-disabled=""]'))
  return [...Array(size).keys()].map((k) => {
    const e = all[start + k]; if (!e) return null
    const cs = getComputedStyle(e); const r = e.getBoundingClientRect()
    return { cursor: e.matches(cursorAttr), ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, bg: cs.backgroundColor, x: r.left + r.width / 2, y: r.top + r.height / 2, text: (e.textContent || '').trim().slice(0, 12) }
  })
}, { ...t, start, size })
const IDLE_BG = 'rgba(0, 0, 0, 0)'
const openGrabTarget = async (t) => {
  await gotoStory(page, t.id, t.trigger || t.items)
  if (t.trigger) {
    const box = await centerOf(page, t.trigger)
    if (!box) { ck(`${t.name} D 前提:找得到觸發器`, false, t.trigger); return false }
    await page.mouse.click(box.x, box.y)
    await page.waitForSelector(t.items, { timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(500)
  }
  if (t.focusFirst) {
    const box = await centerOf(page, t.focusFirst)
    if (!box) { ck(`${t.name} D 前提:找得到搜尋列`, false, t.focusFirst); return false }
    await page.mouse.click(box.x, box.y); await page.waitForTimeout(300)
  }
  return true
}
for (const t of GRAB_TARGETS) {
  if (!(await openGrabTarget(t))) continue
  const run = await pickRun(page, t)
  if (!run) { ck(`${t.name} D 前提:找得到至少兩個相鄰、可用、未選中的列`, false, `items=${t.items}`); continue }
  const n = t.name
  const st = () => runState(page, t, run.start, run.size)
  const three = run.size === 3
  const cIdx = three ? 2 : 0                       // 兩列時 C 由 A 代打
  const idle = (s, notIdx) => three ? s[[0, 1, 2].find((k) => k !== notIdx && k !== 1)].bg : IDLE_BG  // 閒置參考:三列時取當下沒被碰的那列
  // 1. 滑鼠移到 A → A 是反白、有底色、無框(指標搶)
  let s = await st(); await page.mouse.move(s[0].x, s[0].y); await page.waitForTimeout(700); s = await st()
  if (!s[0].cursor) { ck(`${n} D1 前提:滑鼠移到 A 後反白跟到 A`, false, `A「${s[0].text}」cursor=false`); continue }
  ck(`${n} D1 滑鼠搶到 A:有底色、無框`, s[0].bg !== idle(s, 0) && !s[0].ring, `A「${s[0].text}」bg=${s[0].bg} vs 閒置=${idle(s, 0)}${three ? '' : '(兩列 story)'}`)
  // 2. 按 ↓ → 反白到 B:B 框、B 無底色、A 的 hover 底色消失(鍵盤搶回去,滑鼠仍停在 A)
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(700); s = await st()
  if (!s[1].cursor) { ck(`${n} D2 前提:↓ 把反白搬到 B`, false, `B「${s[1].text}」cursor=false`); continue }
  ck(`${n} D2 鍵盤搶回:B(反白)**有框**`, s[1].ring, `B「${s[1].text}」`, 'new')
  ck(`${n} D2 鍵盤搶回:B **不上底色**(= 閒置)`, s[1].bg === idle(s, 0), `B=${s[1].bg} vs 閒置=${idle(s, 0)}`, 'new')
  ck(`${n} D2 鍵盤搶回:滑鼠停留處 A 的 hover 底色**消失**(= 閒置)`, s[0].bg === idle(s, 0), `A=${s[0].bg} vs 閒置=${idle(s, 0)}`, 'new')
  ck(`${n} D2 A 無框`, !s[0].ring)
  // 3. 滑鼠移到 C → 反白到 C:B 的框消失、C 有底色無框(滑鼠連鍵盤焦點一起搶)
  //    兩列 story 的 C 就是 A、滑鼠本來就停在那裡 —— 要真的「動」才是搶(座標不變的 pointermove 不算,那是捲動後瀏覽器補發的那種),
  //    所以往右挪 12px(仍在同一列上)。
  await page.mouse.move(s[cIdx].x + (three ? 0 : 12), s[cIdx].y); await page.waitForTimeout(700); s = await st()
  if (!s[cIdx].cursor) { ck(`${n} D3 前提:滑鼠移到 C 後反白跟到 C`, false, `C「${s[cIdx].text}」cursor=false`); continue }
  ck(`${n} D3 滑鼠再搶:B 的框**消失**`, !s[1].ring, `B「${s[1].text}」`, 'new')
  ck(`${n} D3 滑鼠再搶:B 無底色(= 閒置)`, s[1].bg === idle(s, cIdx), `B=${s[1].bg} vs 閒置=${idle(s, cIdx)}`)
  ck(`${n} D3 滑鼠再搶:C 有底色、無框`, s[cIdx].bg !== idle(s, cIdx) && !s[cIdx].ring, `C=${s[cIdx].bg} vs 閒置=${idle(s, cIdx)} ring=${s[cIdx].ring}`)
  // 4. 滑鼠停在 C 不動,按方向鍵把反白搬回 B(三列:↑;兩列 C=A:↓)→ C 底色消失(停著不算搶)、B 框
  await page.keyboard.press(three ? 'ArrowUp' : 'ArrowDown'); await page.waitForTimeout(700); s = await st()
  if (!s[1].cursor) { ck(`${n} D4 前提:方向鍵把反白搬回 B`, false, `B「${s[1].text}」cursor=false`); continue }
  ck(`${n} D4 滑鼠停著不算搶:C 的底色**消失**(= 閒置)`, s[cIdx].bg === idle(s, cIdx), `C=${s[cIdx].bg} vs 閒置=${idle(s, cIdx)}`, 'new')
  ck(`${n} D4 C 無框`, !s[cIdx].ring)
  ck(`${n} D4 B 有框、無底色`, s[1].ring && s[1].bg === idle(s, cIdx), `B ring=${s[1].ring} bg=${s[1].bg} vs 閒置=${idle(s, cIdx)}`, 'new')
  // SubTrigger:滑鼠移上去(子選單開)→ 有底色無框;↑ 走到上一列 → 框在上一列、SubTrigger 無框
  if (t.subTrigger) {
    const sub = await page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, t.subTrigger)
    if (!sub) ck(`${n} D5 前提:找得到 SubTrigger`, false, t.subTrigger)
    else {
      await page.mouse.move(sub.x, sub.y); await page.waitForTimeout(700)
      const st1 = await page.evaluate((sel) => { const e = document.querySelector(sel); const cs = getComputedStyle(e); return { cursor: e.matches('[data-highlighted]'), ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, bg: cs.backgroundColor, idle: getComputedStyle(document.querySelector('[role="menuitem"]:not([aria-haspopup]):not([data-highlighted])')).backgroundColor } }, t.subTrigger)
      ck(`${n} D5 滑鼠搶到 SubTrigger:有底色、無框`, st1.cursor && st1.bg !== st1.idle && !st1.ring, `bg=${st1.bg} idle=${st1.idle} ring=${st1.ring}`)
      await page.keyboard.press('ArrowUp'); await page.waitForTimeout(700)
      const st2 = await page.evaluate((sel) => { const e = document.querySelector(sel); const cs = getComputedStyle(e); const cur = document.querySelector('[role="menu"] [data-highlighted]'); const cc = cur && getComputedStyle(cur); return { ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, cursorRing: !!cc && cc.outlineStyle !== 'none' && parseFloat(cc.outlineWidth) > 0, cursorIsSub: cur === e } }, t.subTrigger)
      ck(`${n} D5 ↑ 後:反白在上一列且有框、SubTrigger **無框**`, !st2.cursorIsSub && st2.cursorRing && !st2.ring, `cursorIsSub=${st2.cursorIsSub} cursorRing=${st2.cursorRing} subRing=${st2.ring}`, 'new')
    }
  }
}

// ── TreeView:常駐清單,三態都在同一頁驗 + (E) hover 與框可同時存在 ─────────
{
  const idx = JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8'))
  const tid = Object.keys(idx.entries).find((i) => /treeview-展示--/.test(i))
  if (!tid) ck('TreeView 前提:找得到 story', false, '找不到 treeview-展示 story —— 沒東西可驗不能算綠')
  if (tid) {
    await gotoStory(page, tid, '[role="treeitem"]')
    const rowBox = await page.evaluate(() => { const el = document.querySelector('[role="treeitem"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + 24, y: r.top + r.height / 2 } })
    if (rowBox) {
      await page.mouse.click(rowBox.x, rowBox.y); await page.waitForTimeout(700)
      // 指到的 treeitem 是外層 wrapper,`focus-ring-inset` 畫在它裡面的那層列上(tree-view.tsx:1394);
      // 只量 wrapper 本身會永遠 false(A/C 假綠、B 假紅,2026-09-08 抓到)—— 量目標與其子孫。
      const cursorRing = () => page.evaluate(() => { const tree = document.querySelector('[role="tree"]'); const id = tree?.getAttribute('aria-activedescendant'); const el = id ? document.getElementById(id) : null; if (!el) return null; const drawn = (e) => { const c = getComputedStyle(e); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 }; return drawn(el) || [...el.querySelectorAll('*')].some(drawn) })
      // 游標列 vs 其他未選中列的底色(底色住在 [data-tree-row] 那層)
      const cursorRowVsOthers = () => page.evaluate(() => {
        const tree = document.querySelector('[role="tree"]'); const id = tree?.getAttribute('aria-activedescendant')
        const cur = id ? document.getElementById(id) : null; if (!cur) return { error: '無 aria-activedescendant' }
        const row = cur.querySelector('[data-tree-row]'); if (!row) return { error: '游標 treeitem 內找不到 [data-tree-row]' }
        const others = [...document.querySelectorAll('[role="treeitem"]')].filter((e) => e !== cur && e.getAttribute('aria-selected') !== 'true' && !e.matches('[aria-disabled="true"]')).map((e) => e.querySelector('[data-tree-row]')).filter(Boolean)
        if (!others.length) return { error: '找不到對照列' }
        const o = others[0]; const o2 = others[1] || o
        const rr = o2.getBoundingClientRect(); const cr = row.getBoundingClientRect()
        return { text: (row.textContent || '').trim().slice(0, 16), selected: cur.getAttribute('aria-selected') === 'true', bg: getComputedStyle(row).backgroundColor, otherBg: getComputedStyle(o).backgroundColor,
          other2: { x: rr.left + rr.width / 2, y: rr.top + rr.height / 2, text: (o2.textContent || '').trim().slice(0, 16) }, cursorBox: { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2 } }
      })
      const ringed = await cursorRing()
      ck('TreeView A 滑鼠點列:游標列(aria-activedescendant 指到的)不得有框', ringed === false, `ring=${ringed}`)
      await page.keyboard.press('ArrowDown'); await page.waitForTimeout(700)
      const ringed2 = await cursorRing()
      ck('TreeView B 對照組:ArrowDown 後游標列必須有框', ringed2 === true, `ring=${ringed2}`, 'new')
      const tb2 = await cursorRowVsOthers()
      if (tb2.error) ck('TreeView B2 前提:量得到游標列與對照列', false, tb2.error)
      else {
        ck('TreeView B2 鍵盤模態游標停在未選中列:**不上底色**(底色 = 其他未選中列)', !tb2.selected && tb2.bg === tb2.otherBg, `「${tb2.text}」selected=${tb2.selected} bg=${tb2.bg} vs ${tb2.otherBg}`, 'new')
        // (E) 常駐清單不搶反白:鍵盤框在時滑鼠 hover 別列 → 那列底色、框仍在原列;hover 游標列本身 → 底色 + 框都在
        await page.mouse.move(tb2.other2.x, tb2.other2.y); await page.waitForTimeout(700)
        const e1 = await cursorRowVsOthers(); const e1ring = await cursorRing()
        const hoveredBg = await page.evaluate(({ x, y }) => { const row = document.elementFromPoint(x, y)?.closest('[data-tree-row]'); return row ? getComputedStyle(row).backgroundColor : null }, tb2.other2)
        ck('TreeView E1 常駐清單:滑鼠 hover 別列時,鍵盤游標列的框**仍在**(hover 不搶游標)', e1ring === true && !e1.error && e1.text === tb2.text, `ring=${e1ring} cursor=「${e1.error || e1.text}」`, 'new')
        ck('TreeView E1 hover 到的那一列有底色(≠ 游標列底色)', hoveredBg != null && hoveredBg !== e1.bg, `hovered=${hoveredBg} cursor=${e1.bg}`)
        await page.mouse.move(tb2.cursorBox.x, tb2.cursorBox.y); await page.waitForTimeout(700)
        const e2 = await cursorRowVsOthers(); const e2ring = await cursorRing()
        ck('TreeView E2 常駐清單:滑鼠停在游標列上 → **底色 + 框都在**', e2ring === true && !e2.error && e2.bg !== e2.otherBg, `ring=${e2ring} bg=${e2.error || e2.bg} vs ${e2.otherBg}`, 'new')
        await page.mouse.move(5, 5); await page.waitForTimeout(100)
      }
      await page.mouse.click(rowBox.x, rowBox.y); await page.waitForTimeout(700)
      const ringed3 = await cursorRing()
      ck('TreeView C 再用滑鼠點:框必須消失(模態回到指標)', ringed3 === false, `ring=${ringed3}`)
      // (A2) 指標模態 hover 另一列:有底色、無框
      const hoverBox = await page.evaluate(() => {
        const el = [...document.querySelectorAll('[role="treeitem"]')].find((e) => e.getAttribute('aria-selected') !== 'true' && !e.matches('[aria-disabled="true"]'))
        const row = el?.querySelector('[data-tree-row]'); if (!row) return null; const r = row.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })
      if (!hoverBox) ck('TreeView A2 前提:找得到未選中列', false)
      else {
        await page.mouse.move(hoverBox.x, hoverBox.y); await page.waitForTimeout(700)
        const hv = await page.evaluate(({ x, y }) => {
          const row = document.elementFromPoint(x, y)?.closest('[data-tree-row]'); if (!row) return { error: '滑鼠下沒有列' }
          const cur = row.closest('[role="treeitem"]')
          const other = [...document.querySelectorAll('[role="treeitem"]')].find((e) => e !== cur && e.getAttribute('aria-selected') !== 'true' && !e.matches('[aria-disabled="true"]'))?.querySelector('[data-tree-row]')
          const drawn = (e) => { const c = getComputedStyle(e); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 }
          return { text: (row.textContent || '').trim().slice(0, 16), bg: getComputedStyle(row).backgroundColor, otherBg: other ? getComputedStyle(other).backgroundColor : null, ring: drawn(row) || [...row.querySelectorAll('*')].some(drawn) }
        }, hoverBox)
        if (hv.error) ck('TreeView A2 前提:hover 得到列', false, hv.error)
        else {
          ck('TreeView A2 指標模態 hover:**有底色**(≠ 其他列)', hv.otherBg != null && hv.bg !== hv.otherBg, `「${hv.text}」bg=${hv.bg} vs ${hv.otherBg}`)
          ck('TreeView A2 指標模態 hover:**無框**', !hv.ring, `「${hv.text}」`)
        }
      }
    }
  }
}

// ── (F) 在文字輸入框裡打字不算搬游標:有搜尋列的會搶反白目標各做一次 ──
// 目標 = 有文字搜尋列的會搶反白元件(Combobox「四模式」沒有文字輸入,改用「搜尋」story);DropdownMenu 的打字跳選目標不是文字輸入框,仍算鍵盤,不在此段
const TYPING_TARGETS = [
  ...GRAB_TARGETS.filter((t) => /^(Select|SelectMenu|PeoplePicker|Command inline|Command dialog|AgentPanel 歷史)$/.test(t.name)),
  { name: 'Combobox', id: 'design-system-components-combobox-展示--searchable', trigger: COMBOBOX_TRIGGER, ...CMDK },
]
for (const t of TYPING_TARGETS) {
  if (!(await openGrabTarget(t))) continue
  if (SELFTEST) await page.addStyleTag({ content: OLD_BEHAVIOUR_TYPING_CSS })
  const n = t.name
  // 搜尋列 = 開啟後拿到焦點的文字輸入框(Select / SelectMenu 的搜尋列在觸發器裡、PeoplePicker 的輸入框就是觸發器、cmdk 的在浮層裡)
  await page.evaluate(() => { const a = document.activeElement; const isText = a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && !/^(checkbox|radio|range|color|file|image|button|submit|reset|hidden)$/.test(a.type)); if (isText) a.setAttribute('data-f-input', '') })
  const inputBox = await centerOf(page, '[data-f-input], input[cmdk-input], input[role="combobox"]')
  if (!inputBox) { ck(`${n} F 前提:找得到搜尋列`, false, 'activeElement 不是文字輸入框,也沒有 input[cmdk-input] / input[role=combobox]'); continue }
  // 滑鼠點進搜尋列(指標來歷),打一個保得住至少一列的字(取第一個可用列的第一個字),再 Backspace
  const firstChar = await page.evaluate(({ items }) => { const el = [...document.querySelectorAll(items)].find((e) => !e.matches('[aria-disabled="true"],[data-disabled="true"],[data-disabled=""]')); return (el?.textContent || '').trim().charAt(0) }, t)
  // 搜尋列若就是觸發器(Select / SelectMenu 的搜尋列在觸發器裡、PeoplePicker 的輸入框就是觸發器),開啟時已聚焦,再點一次會把浮層收起 → 已聚焦就不再點
  const alreadyFocused = await page.evaluate(() => !!document.activeElement?.matches('[data-f-input]'))
  if (!alreadyFocused) { await page.mouse.click(inputBox.x, inputBox.y); await page.waitForTimeout(300) }
  if (firstChar) await page.keyboard.type(firstChar)
  await page.waitForTimeout(700)
  await page.keyboard.press('Backspace'); await page.waitForTimeout(700)
  const f = await cursorVsOthers(page, t)
  if (f.error) { ck(`${n} F 前提:打字 + Backspace 後找得到自動落點的反白`, false, f.error); continue }
  ck(`${n} F 滑鼠點進搜尋列、打字、Backspace → 自動落點的反白**無框**(打字不是鍵盤搬游標)`, !f.ring, `「${f.text}」ring=${f.ringDesc} bg=${f.bg}`, 'new')
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(700)
  const g = await cursorVsOthers(page, t)
  ck(`${n} F 接著 ↓ → 反白**有框**(對照:儀器看得到框)`, !g.error && g.ring, g.error || `「${g.text}」ring=${g.ringDesc}`)
}
// F 結束把滑鼠停到角落:Playwright 的指標位置跨頁保留,留在原處會讓下一段(E)的「hover 前」量到已經 hover 的底色
await page.mouse.move(2, 2)

// ── (G) Field 家族關閉觸發器:選完(Enter / 滑鼠)焦點回到觸發器 → 只有邊框轉色、沒有外框 ──
// 對照組 = 舊行為(全域 :focus-visible 外框疊在觸發器上)
const OLD_BEHAVIOUR_TRIGGER_CSS = `#storybook-root [role="combobox"]:focus-visible { outline: 2px solid var(--ring) !important; outline-offset: 2px !important; }`
const triggerFocus = () => page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { tag: a.tagName, role: a.getAttribute('role'), ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, ringDesc: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineOffset}`, border: cs.borderColor } })
const primaryColor = () => page.evaluate(() => { const d = document.createElement('div'); d.style.color = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(); document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c })
for (const t of TYPING_TARGETS.filter((x) => /^(Select|SelectMenu|PeoplePicker)$/.test(x.name))) {
  const n = t.name
  // 鍵盤路徑:滑鼠點開 → ↓ Enter → 焦點回關閉的觸發器,鍵盤模態 → 外框 + 邊框主色
  if (!(await openGrabTarget(t))) continue
  if (SELFTEST) await page.addStyleTag({ content: OLD_BEHAVIOUR_TRIGGER_CSS })
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(200); await page.keyboard.press('Enter'); await page.waitForTimeout(700)
  const k = await triggerFocus(); const prim = await primaryColor()
  ck(`${n} G1 滑鼠點開 → ↓ Enter 選完:焦點回關閉的觸發器、鍵盤模態 → **無外框**(Field 家族只用邊框轉色;舊行為疊全域外框)`, k.role === 'combobox' && !k.ring, `${k.tag}[${k.role}] ring=${k.ringDesc}`, 'new')
  ck(`${n} G1 觸發器邊框轉主色(Field wrapper focus-within)`, k.role === 'combobox' && k.border === prim, `border=${k.border} vs primary=${prim}`)
  // 滑鼠路徑:重新點開 → 滑鼠點選項 → 焦點回觸發器但指標模態 → 無外框
  await page.mouse.move(2, 2); await page.waitForTimeout(100)
  const trig = await centerOf(page, t.trigger); if (!trig) continue
  await page.mouse.click(trig.x, trig.y); await page.waitForSelector(t.items, { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(500)
  const item = await unselectedItemBox(page, t)
  if (!item) { ck(`${n} G2 前提:找得到可點的未選中列`, false, ''); continue }
  await page.mouse.click(item.x, item.y); await page.waitForTimeout(700)
  const m = await triggerFocus()
  ck(`${n} G2 滑鼠點選項選完:焦點回觸發器、指標模態 → **無外框**(邊框仍主色)`, m.role === 'combobox' && !m.ring && m.border === prim, `${m.tag}[${m.role}] ring=${m.ringDesc} border=${m.border}`)
}
await page.mouse.move(2, 2)

// ── (H) 同一條規則的其他 Field 家族成員:Tab 進 div 觸發器(鍵盤模態)→ 無外框、邊框轉主色 ──
for (const t of [
  { name: 'DatePicker', id: 'design-system-components-datepicker-展示--default' },
  { name: 'TimePicker', id: 'design-system-components-timepicker-展示--modes' },
  { name: 'Combobox(div 觸發器)', id: 'design-system-components-combobox-展示--modes' },
]) {
  await gotoStory(page, t.id, '#storybook-root [role="combobox"]')
  if (SELFTEST) await page.addStyleTag({ content: OLD_BEHAVIOUR_TRIGGER_CSS })
  await page.mouse.move(2, 2)
  let hit = null
  for (let i = 0; i < 8 && !hit; i++) {
    await page.keyboard.press('Tab'); await page.waitForTimeout(250)
    hit = await page.evaluate(() => { const a = document.activeElement; return a && a.matches('#storybook-root [role="combobox"]:not(input)') ? true : null })
  }
  if (!hit) { ck(`${t.name} H 前提:Tab 進得了 div 觸發器`, false, 'activeElement 不是 [role=combobox] div'); continue }
  await page.waitForTimeout(500)
  const h = await triggerFocus(); const prim = await primaryColor()
  ck(`${t.name} H Tab 進關閉的觸發器(鍵盤模態)→ **無外框**、邊框轉主色(Field 家族一致)`, !h.ring && h.border === prim, `${h.tag}[${h.role}] ring=${h.ringDesc} border=${h.border}`, 'new')
}
await page.mouse.move(2, 2)

// ── (E) 其他常駐清單:真焦點 + hover 獨立(Sidebar / Tabs / DataTable / TimePicker 欄)────────
const drawnAt = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 }, sel)
/** Tab 到第一個符合 `match` 的元素(最多 40 次),回傳它的中心與樣式 */
const tabTo = async (match) => {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const hit = await page.evaluate((m) => { const a = document.activeElement; if (!a || !a.matches(m)) return null; a.setAttribute('data-vc-probe', ''); const r = a.getBoundingClientRect(); const c = getComputedStyle(a); return { x: r.left + r.width / 2, y: r.top + r.height / 2, bg: c.backgroundColor, color: c.color, text: (a.textContent || '').trim().slice(0, 16) } }, match)
    if (hit) return hit
  }
  return null
}
const probeState = () => page.evaluate(() => { const e = document.querySelector('[data-vc-probe]'); if (!e) return null; const c = getComputedStyle(e); return { ring: c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0, bg: c.backgroundColor, color: c.color } })
const PERSISTENT = [
  { name: 'Sidebar 選單鈕', id: 'design-system-components-sidebar-展示--icon-collapse', match: '[data-sidebar="menu-button"]:not([data-active="true"])', hoverChanges: 'bg' },
  // Radix Tabs 只有當前 tab 在 Tab 順序裡(roving),而當前 tab 已是 text-foreground,hover 沒有可量的改變 → 只驗框不被 hover 抹掉
  { name: 'Tabs', id: 'design-system-components-tabs-展示--default', match: '[role="tab"]', hoverChanges: null },
]
for (const p of PERSISTENT) {
  await gotoStory(page, p.id, p.match.split(':')[0])
  const hit = await tabTo(p.match)
  if (!hit) { ck(`${p.name} E 前提:Tab 走得到 ${p.match}`, false); continue }
  await page.waitForTimeout(700)
  const before = await probeState()
  ck(`${p.name} E 前提:Tab 到後有框`, before?.ring === true, `「${hit.text}」`)
  await page.mouse.move(hit.x - 30, hit.y - 30); await page.mouse.move(hit.x, hit.y, { steps: 4 }); await page.waitForTimeout(700)
  const after = await probeState()
  ck(`${p.name} E 常駐清單:滑鼠 hover 到鍵盤焦點所在的元素 → 框**仍在**`, after?.ring === true, `ring=${after?.ring}`, 'new')
  if (p.hoverChanges) ck(`${p.name} E hover 樣式照常出現(${p.hoverChanges} 改變)`, after && after[p.hoverChanges] !== before[p.hoverChanges], `${p.hoverChanges}: ${before?.[p.hoverChanges]} → ${after?.[p.hoverChanges]}`)
}
// DataTable:Tab 到列的核取方塊(真焦點,框在方塊上),滑鼠移到同一列 → 列有 hover 底色、方塊的框仍在
{
  const id = 'design-system-components-datatable-展示--selection-keyboard-and-shift'
  await gotoStory(page, id, '[role="row"]')
  // 只認資料列(data-row-index):表頭列的全選框 Tab 順序更前,而表頭沒有 hover 底色(2026-09-09 首跑抓到)
  const hit = await tabTo('[role="row"][data-row-index] [role="checkbox"], [role="row"][data-row-index] input[type="checkbox"]')
  if (!hit) ck('DataTable E 前提:Tab 走得到資料列的核取方塊', false)
  else {
    await page.waitForTimeout(700)
    const before = await probeState()
    const rowBox = await page.evaluate(() => { const row = document.querySelector('[data-vc-probe]')?.closest('[role="row"]'); if (!row) return null; const r = row.getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + r.height / 2, bg: getComputedStyle(row).backgroundColor } })
    ck('DataTable E 前提:核取方塊聚焦後有框', before?.ring === true)
    if (rowBox) {
      // DataTable 的 hover 是表格層 onMouseOver 委派寫 data-hovered,要真的「移進來」(先在列外,再分段移入)才會觸發
      await page.mouse.move(rowBox.x - 40, rowBox.y - 60); await page.waitForTimeout(100)
      await page.mouse.move(rowBox.x, rowBox.y, { steps: 4 }); await page.waitForTimeout(700)
      const after = await probeState()
      const rowAfter = await page.evaluate(() => { const row = document.querySelector('[data-vc-probe]')?.closest('[role="row"]'); return row ? getComputedStyle(row).backgroundColor : null })
      ck('DataTable E 常駐清單:滑鼠 hover 同一列 → 核取方塊的框**仍在**', after?.ring === true, `ring=${after?.ring}`, 'new')
      ck('DataTable E 列的 hover 底色照常出現', rowAfter != null && rowAfter !== rowBox.bg, `${rowBox.bg} → ${rowAfter}`)
    }
  }
}
// TimePicker 欄:不搶反白(游標永遠 = 選中,滑鼠 hover 不搬它)。滑鼠停在別格 → 按 ↓ → 那格 hover 底色仍在、選中格有框
// (modes 那支的 onChange 是 no-op、值不會動;用 meeting-slot,有 state)
{
  await gotoStory(page, 'design-system-components-timepicker-展示--meeting-slot', COMBOBOX_TRIGGER)
  const box = await centerOf(page, COMBOBOX_TRIGGER)
  if (!box) ck('TimePicker E 前提:找得到觸發器', false)
  else {
    await page.mouse.click(box.x, box.y); await page.waitForSelector('[role="listbox"] [role="option"]', { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(500)
    // 第一欄裡一個看得見、未選中、與選中格不相鄰的 option
    const pick = await page.evaluate(() => {
      const lb = document.querySelector('[role="listbox"]'); if (!lb) return null
      const vp = lb.closest('[data-radix-scroll-area-viewport]') || lb; const vr = vp.getBoundingClientRect()
      const opts = [...lb.querySelectorAll('[role="option"]')]
      const selIdx = opts.findIndex((o) => o.getAttribute('aria-selected') === 'true')
      const i = opts.findIndex((o, k) => Math.abs(k - selIdx) >= 2 && !o.disabled && (() => { const r = o.getBoundingClientRect(); return r.top >= vr.top && r.bottom <= vr.bottom })())
      if (i < 0) return null
      opts[i].setAttribute('data-vc-probe', ''); const r = opts[i].getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, idleBg: getComputedStyle(opts[i]).backgroundColor, text: opts[i].textContent }
    })
    if (!pick) ck('TimePicker E 前提:找得到可 hover 的未選中格', false)
    else {
      await page.mouse.move(pick.x, pick.y); await page.waitForTimeout(700)
      const h = await probeState()
      ck('TimePicker E 滑鼠 hover 未選中格:有底色、無框', h && h.bg !== pick.idleBg && !h.ring, `bg=${h?.bg} idle=${pick.idleBg}`)
      // ↓ 之後選中格會 scrollIntoView(center),整欄捲動、滑鼠底下換成另一格 —— 所以量「此刻滑鼠底下那一格」而不是原本那一格,
      // 並把滑鼠挪 1px 讓 :hover 重算(捲動後瀏覽器是否補發 mousemove 不能靠賭)。
      await page.keyboard.press('ArrowDown'); await page.waitForTimeout(700)
      await page.mouse.move(pick.x + 1, pick.y); await page.waitForTimeout(300)
      const selRing = await page.evaluate(() => { const lb = document.querySelector('[role="listbox"]'); const id = lb?.getAttribute('aria-activedescendant'); const e = id && document.getElementById(id); if (!e) return null; const c = getComputedStyle(e); return { ring: c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0, isProbe: e.hasAttribute('data-vc-probe') } })
      const under = await page.evaluate(({ x, y }) => { const o = document.elementFromPoint(x, y)?.closest('[role="option"]'); if (!o) return null; const c = getComputedStyle(o); return { text: o.textContent, bg: c.backgroundColor, selected: o.getAttribute('aria-selected') === 'true', ring: c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 } }, { x: pick.x + 1, y: pick.y })
      ck('TimePicker E 前提:↓ 後選中格(aria-activedescendant)有框且不是滑鼠停留格', selRing?.ring === true && selRing?.isProbe === false, JSON.stringify(selRing))
      ck('TimePicker E 常駐清單:鍵盤動了之後,滑鼠底下那一格的 hover 底色**仍在**、框在選中格(兩個狀態並存)', !!under && !under.selected && under.bg !== pick.idleBg && !under.ring && selRing?.ring === true, `under=「${under?.text}」bg=${under?.bg} idle=${pick.idleBg} selected=${under?.selected} ring=${under?.ring}`, 'new')
    }
  }
}

await browser.close(); sv.close()
console.log(out.join('\n'))
if (SELFTEST) {
  // 對照組要求:每一條「鍵盤模態游標長相 / 反白唯一主人 / 常駐清單框不被 hover 抹掉」斷言都變紅,
  // 而且至少要有 80 條真的跑到(前提失敗會讓斷言沒跑,不算;2026-09-09 下午前提全過時實跑 = 12 + 66 + 1 + 4 + 4 = 87)
  const ok = controlledTotal >= 80 && controlled === controlledTotal
  console.log(ok
    ? `\n✓ selftest:把游標列釘回舊行為時,${controlled}/${controlledTotal} 條游標長相斷言確實變紅`
    : `\n✗ selftest:游標列都釘回舊行為了,卻只有 ${controlled}/${controlledTotal} 條變紅(需 ≥80 條且全紅)—— 這支閘量的不是它宣稱的東西`)
  process.exit(ok ? 0 : 1)
}
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 全部通過')
process.exit(fail ? 1 : 0)
