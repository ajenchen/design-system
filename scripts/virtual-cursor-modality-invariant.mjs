#!/usr/bin/env node
/**
 * 虛擬游標:框只在鍵盤模態下畫,而且游標一律是框、不上底色(2026-09-08 / 2026-09-09)
 *
 * 2026-09-08 user 抓到:滑鼠點開 Select,已選項立刻出現鍵盤焦點框 ——「我明明都還沒開始碰鍵盤」。
 * 根因:cmdk 開啟時把游標放在已選項上,而「已選 + 游標」的畫框規則沒有模態條件。
 * 2026-09-09 user 拍板:「就是基本上都是畫框,唯一不畫框的例外就是…單一狀態控制項」「都不需要上底色」——
 * 未選中的游標列先前用 hover 同色底當游標(舊 D 類),那是 AI 推導不是 user 決定,整類撤回。
 * 現在四處都消費 hooks/use-input-modality.ts(判準 = WICG focus-visible explainer 的啟發式):
 * CommandItem(Select / SelectMenu / AgentPanel 歷史)、DropdownMenu、TreeView。
 *
 * 五段都驗,缺一不可(SSOT:focus-canonical.md 規則二):
 *   (A)  真滑鼠點開 → 已選項**不得**有框
 *   (A2) 指標模態下滑鼠停在未選中列 → **有底色、無框**(底色只屬於 hover)
 *   (B)  接著用鍵盤把游標移開再移回已選項 → **必須**有框(否則就是把框整個殺掉換綠燈)
 *   (B2) 鍵盤模態下游標停在未選中列 → **有框,而且底色 = 其他未選中列**(游標不上底色)
 *   (C)  純鍵盤開啟(Tab 到觸發器、ArrowDown)→ 已選項**立刻**有框
 * 量 outline 前等 700ms(transition-colors 含 outline-color,立刻量會抓到過渡值)。
 *
 * `--selftest` 對照組(M32「儀器要先有對照組」):每頁載入後注入一段 CSS,把游標列釘回舊行為
 *(底色當游標、不畫框),A2 / B / B2 / C 就該整批變紅;沒變紅代表這支閘量的不是它宣稱的東西。
 */
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { launchBrowser } from './lib/launch-browser.mjs'

const SELFTEST = process.argv.includes('--selftest')
const STATIC = join(process.cwd(), 'storybook-static')
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
/** tag='new' 的斷言是對照組要弄壞的那幾條(鍵盤模態的游標長相);其餘(前提、指標模態)對照組不動。 */
const ck = (t, p, d = '', tag = '') => {
  out.push(`${p ? '✓' : '✗'} ${t}${d ? ' | ' + d : ''}`)
  if (!p) fail++
  if (SELFTEST && tag === 'new') { controlledTotal++; if (!p) controlled++ }
}

// 對照組:把游標列釘回「底色當游標、不畫框」的舊行為。
const OLD_BEHAVIOUR_CSS = `
  [cmdk-item][data-selected="true"], [role="menuitem"][data-highlighted], [role="menuitemradio"][data-highlighted],
  [role="menuitemcheckbox"][data-highlighted] {
    outline: none !important; background-color: var(--neutral-hover) !important;
  }`
// TreeView 的游標只從 aria-activedescendant 得知,CSS 釘不到 → 觀察那個屬性,只把游標那一列釘回舊行為
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
const TARGETS = [
  { name: 'Select', id: 'design-system-components-select-展示--modes',
    trigger: '[role="combobox"]:not([disabled])', selectedItem: '[role="option"][aria-selected="true"], [role="option"][data-selected="true"]',
    items: '[cmdk-item]', cursorAttr: '[data-selected="true"]', truly: ':scope > [role="presentation"][data-selected=""]' },
  { name: 'SelectMenu', id: 'design-system-internal-selectmenu-展示--single-select',
    trigger: '[role="combobox"]:not([disabled])', selectedItem: '[role="option"][aria-selected="true"], [role="option"][data-selected="true"]',
    items: '[cmdk-item]', cursorAttr: '[data-selected="true"]', truly: ':scope > [role="presentation"][data-selected=""]' },
  { name: 'DropdownMenu radio', id: 'design-system-components-dropdownmenu-展示--radio-items',
    trigger: 'button[aria-haspopup]:not([disabled])', selectedItem: '[role="menuitemradio"][aria-checked="true"]',
    items: '[role="menuitemradio"], [role="menuitem"], [role="menuitemcheckbox"]', cursorAttr: '[data-highlighted]', truly: ':scope[aria-checked="true"]' },
]

const ringOf = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return { missing: true }
  const cs = getComputedStyle(el)
  return { w: parseFloat(cs.outlineWidth) || 0, style: cs.outlineStyle, color: cs.outlineColor, text: (el.textContent || '').trim().slice(0, 16) }
}, sel)
const drawn = (r) => !r.missing && r.style !== 'none' && r.w > 0

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

const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

for (const t of TARGETS) {
  // ── (A) 真滑鼠點開 ───────────────────────────────────────────────────
  await gotoStory(page, t.id, t.trigger)
  const box = await page.evaluate((s) => { const el = document.querySelector('#storybook-root ' + s) || document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, t.trigger)
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

// ── TreeView:常駐清單,三態都在同一頁驗 ─────────────────────────────────
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
        const other = [...document.querySelectorAll('[role="treeitem"]')].find((e) => e !== cur && e.getAttribute('aria-selected') !== 'true' && !e.matches('[aria-disabled="true"]'))?.querySelector('[data-tree-row]')
        if (!other) return { error: '找不到對照列' }
        return { text: (row.textContent || '').trim().slice(0, 16), selected: cur.getAttribute('aria-selected') === 'true', bg: getComputedStyle(row).backgroundColor, otherBg: getComputedStyle(other).backgroundColor }
      })
      const ringed = await cursorRing()
      ck('TreeView A 滑鼠點列:游標列(aria-activedescendant 指到的)不得有框', ringed === false, `ring=${ringed}`)
      await page.keyboard.press('ArrowDown'); await page.waitForTimeout(700)
      const ringed2 = await cursorRing()
      ck('TreeView B 對照組:ArrowDown 後游標列必須有框', ringed2 === true, `ring=${ringed2}`, 'new')
      const tb2 = await cursorRowVsOthers()
      if (tb2.error) ck('TreeView B2 前提:量得到游標列與對照列', false, tb2.error)
      else ck('TreeView B2 鍵盤模態游標停在未選中列:**不上底色**(底色 = 其他未選中列)', !tb2.selected && tb2.bg === tb2.otherBg, `「${tb2.text}」selected=${tb2.selected} bg=${tb2.bg} vs ${tb2.otherBg}`, 'new')
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

// ── AgentPanel 歷史清單(經 CommandItem)──────────────────────────────────
{
  const hid = 'design-system-components-agentpanel-展示--history-open'
  const t = { items: '[cmdk-item]', cursorAttr: '[data-selected="true"]', truly: ':scope > [role="presentation"][data-selected=""]' }
  await gotoStory(page, hid, '[cmdk-item]'); await page.waitForTimeout(400)
  const sel = '[role="option"][aria-selected="true"], [role="option"][data-selected="true"], [cmdk-item][data-selected="true"]'
  const a = await ringOf(page, sel)
  if (a.missing) ck('AgentPanel 歷史前提:找得到已選/游標項', false, sel)
  else {
    ck('AgentPanel 歷史 A 開啟時(無鍵盤):已選項不得有框', !drawn(a), `「${a.text}」outline=${a.style} ${a.w}px`)
    // (A2) 指標模態 hover 未選中列 → 有底色、無框
    const hoverBox = await unselectedItemBox(page, t)
    if (!hoverBox) ck('AgentPanel 歷史 A2 前提:找得到未選中列', false)
    else {
      await page.mouse.move(hoverBox.x, hoverBox.y); await page.waitForTimeout(700)
      const h = await cursorVsOthers(page, t)
      if (h.error) ck('AgentPanel 歷史 A2 前提:hover 後量得到', false, h.error)
      else {
        ck('AgentPanel 歷史 A2 指標模態 hover:**有底色**(≠ 其他列)', !h.cursorTruly && h.bg !== h.otherBg, `「${h.text}」bg=${h.bg} vs ${h.otherBg}`)
        ck('AgentPanel 歷史 A2 指標模態 hover:**無框**', !h.ring, `「${h.text}」outline=${h.ringDesc}`)
      }
      await page.mouse.move(5, 5); await page.waitForTimeout(100)
    }
    // (B) 鍵盤:走回已選項 → 有框
    for (let i = 0; i < 12; i++) {
      const onSel = await page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.matches('[data-selected="true"]') }, '[cmdk-item]:has(> [role="presentation"][data-selected=""])')
      if (onSel) break
      await page.keyboard.press('ArrowDown'); await page.waitForTimeout(60)
    }
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(700)
    const b = await ringOf(page, sel)
    ck('AgentPanel 歷史 B 對照組:鍵盤移回已選項必須有框', drawn(b), `「${b.text}」outline=${b.style} ${b.w}px`, 'new')
    // (B2) 鍵盤模態游標停在未選中列 → 有框、不上底色
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(700)
    const b2 = await cursorVsOthers(page, t)
    if (b2.error) ck('AgentPanel 歷史 B2 前提:量得到游標列', false, b2.error)
    else {
      ck('AgentPanel 歷史 B2 鍵盤模態游標停在未選中列:**有框**', !b2.cursorTruly && b2.ring, `「${b2.text}」truly=${b2.cursorTruly} outline=${b2.ringDesc}`, 'new')
      ck('AgentPanel 歷史 B2 鍵盤模態游標列**不上底色**', b2.bg === b2.otherBg, `bg=${b2.bg} vs ${b2.otherBg}`, 'new')
    }
  }
}

await browser.close(); sv.close()
console.log(out.join('\n'))
if (SELFTEST) {
  // 對照組要求:每一條「鍵盤模態游標長相」斷言都變紅,而且至少要有 15 條真的跑到(前提失敗會讓斷言沒跑,不算)
  const ok = controlledTotal >= 15 && controlled === controlledTotal
  console.log(ok
    ? `\n✓ selftest:把游標列釘回「底色當游標、不畫框」時,${controlled}/${controlledTotal} 條游標長相斷言確實變紅`
    : `\n✗ selftest:游標列都釘回舊行為了,卻只有 ${controlled}/${controlledTotal} 條變紅 —— 這支閘量的不是它宣稱的東西`)
  process.exit(ok ? 0 : 1)
}
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 全部通過')
process.exit(fail ? 1 : 0)
