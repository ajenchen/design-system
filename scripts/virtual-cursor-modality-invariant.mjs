#!/usr/bin/env node
/**
 * 虛擬游標的框只在鍵盤模態下畫(2026-09-08)
 *
 * user 抓到:滑鼠點開 Select,已選項立刻出現鍵盤焦點框 ——「我明明都還沒開始碰鍵盤」。
 * 根因:cmdk 開啟時把游標放在已選項上,而「已選 + 游標」的畫框規則沒有模態條件。
 * 同款在 SelectMenu / DropdownMenu / AgentPanel 歷史清單各一份;TreeView 自帶 isKeyboardRef。
 * 現在四處都消費 hooks/use-input-modality.ts(判準 = WICG focus-visible explainer 的啟發式)。
 *
 * 三段都驗,缺一不可:
 *   (A) 真滑鼠點開 → 已選項**不得**有框
 *   (B) 接著用鍵盤把游標移開再移回已選項 → **必須**有框(否則就是把框整個殺掉換綠燈)
 *   (C) 純鍵盤開啟(Tab 到觸發器、ArrowDown)→ 已選項**立刻**有框
 * 量 outline 前等 700ms(transition-colors 含 outline-color,立刻量會抓到過渡值)。
 */
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { launchBrowser } from './lib/launch-browser.mjs'

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

const out = []; let fail = 0
const ck = (t, p, d = '') => { out.push(`${p ? '✓' : '✗'} ${t}${d ? ' | ' + d : ''}`); if (!p) fail++ }

// 「已選項」= 各元件語意上的選中項;「游標項」= cmdk data-selected / Radix data-highlighted
const TARGETS = [
  { name: 'Select', id: 'design-system-components-select-展示--modes',
    trigger: '[role="combobox"]:not([disabled])', selectedItem: '[role="option"][aria-selected="true"], [role="option"][data-selected="true"]' },
  { name: 'SelectMenu', id: 'design-system-internal-selectmenu-展示--single-select',
    trigger: '[role="combobox"]:not([disabled])', selectedItem: '[role="option"][aria-selected="true"], [role="option"][data-selected="true"]' },
  { name: 'DropdownMenu radio', id: 'design-system-components-dropdownmenu-展示--radio-items',
    trigger: 'button[aria-haspopup]:not([disabled])', selectedItem: '[role="menuitemradio"][aria-checked="true"]' },
]

const ringOf = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return { missing: true }
  const cs = getComputedStyle(el)
  return { w: parseFloat(cs.outlineWidth) || 0, style: cs.outlineStyle, color: cs.outlineColor, text: (el.textContent || '').trim().slice(0, 16) }
}, sel)
const drawn = (r) => !r.missing && r.style !== 'none' && r.w > 0

const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

for (const t of TARGETS) {
  // ── (A) 真滑鼠點開 ───────────────────────────────────────────────────
  await page.goto(story(t.id), { waitUntil: 'load' }); await page.waitForSelector(t.trigger, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(300)
  const box = await page.evaluate((s) => { const el = document.querySelector('#storybook-root ' + s) || document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, t.trigger)
  if (!box) { ck(`${t.name} 前提:找得到觸發器`, false, t.trigger); continue }
  await page.mouse.click(box.x, box.y); await page.waitForTimeout(700)
  const a = await ringOf(page, t.selectedItem)
  if (a.missing) { ck(`${t.name} 前提:滑鼠點開後找得到已選項`, false, t.selectedItem); continue }
  ck(`${t.name} A 滑鼠點開:已選項**不得**有框(還沒碰鍵盤)`, !drawn(a), `「${a.text}」outline=${a.style} ${a.w}px`)

  // ── (B) 鍵盤把游標移開再移回 → 該有框 ─────────────────────────────────
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80)
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(700)
  const b = await ringOf(page, t.selectedItem)
  ck(`${t.name} B 對照組:鍵盤把游標移回已選項 → **必須**有框(沒把框整個殺掉)`, drawn(b), `「${b.text}」outline=${b.style} ${b.w}px ${b.color}`)

  // ── (C) 純鍵盤開啟 → 立刻有框 ───────────────────────────────────────
  await page.goto(story(t.id), { waitUntil: 'load' }); await page.waitForSelector(t.trigger, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(300)
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
  ck(`${t.name} C 純鍵盤開啟並走到已選項:**必須**有框`, onSelected && drawn(c2), c2.missing ? '鍵盤開不了' : `游標在已選項=${onSelected}「${c2.text}」outline=${c2.style} ${c2.w}px`)
}

// ── TreeView:常駐清單,三態都在同一頁驗 ─────────────────────────────────
{
  const idx = JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8'))
  const tid = Object.keys(idx.entries).find((i) => /treeview-展示--/.test(i))
  if (!tid) ck('TreeView 前提:找得到 story', false, '找不到 treeview-展示 story —— 沒東西可驗不能算綠')
  if (tid) {
    await page.goto(story(tid), { waitUntil: 'load' }); await page.waitForSelector('[role="treeitem"]', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(300)
    const rowBox = await page.evaluate(() => { const el = document.querySelector('[role="treeitem"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + 24, y: r.top + r.height / 2 } })
    if (rowBox) {
      await page.mouse.click(rowBox.x, rowBox.y); await page.waitForTimeout(700)
      // 指到的 treeitem 是外層 wrapper,`focus-ring-inset` 畫在它裡面的那層列上(tree-view.tsx:1394);
      // 只量 wrapper 本身會永遠 false(A/C 假綠、B 假紅,2026-09-08 抓到)—— 量目標與其子孫。
      const cursorRing = () => page.evaluate(() => { const tree = document.querySelector('[role="tree"]'); const id = tree?.getAttribute('aria-activedescendant'); const el = id ? document.getElementById(id) : null; if (!el) return null; const drawn = (e) => { const c = getComputedStyle(e); return c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 }; return drawn(el) || [...el.querySelectorAll('*')].some(drawn) })
      const ringed = await cursorRing()
      ck('TreeView A 滑鼠點列:游標列(aria-activedescendant 指到的)不得有框', ringed === false, `ring=${ringed}`)
      await page.keyboard.press('ArrowDown'); await page.waitForTimeout(700)
      const ringed2 = await cursorRing()
      ck('TreeView B 對照組:ArrowDown 後游標列必須有框', ringed2 === true, `ring=${ringed2}`)
      await page.mouse.click(rowBox.x, rowBox.y); await page.waitForTimeout(700)
      const ringed3 = await cursorRing()
      ck('TreeView C 再用滑鼠點:框必須消失(模態回到指標)', ringed3 === false, `ring=${ringed3}`)
    }
  }
}

// ── AgentPanel 歷史清單(第五個消費者)──────────────────────────────────
{
  const hid = 'design-system-components-agentpanel-展示--history-open'
  await page.goto(story(hid), { waitUntil: 'load' }); await page.waitForTimeout(700)
  const sel = '[role="option"][aria-selected="true"], [role="option"][data-selected="true"], [cmdk-item][data-selected="true"]'
  const a = await ringOf(page, sel)
  if (a.missing) ck('AgentPanel 歷史前提:找得到已選/游標項', false, sel)
  else {
    ck('AgentPanel 歷史 A 開啟時(無鍵盤):已選項不得有框', !drawn(a), `「${a.text}」outline=${a.style} ${a.w}px`)
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(700)
    const b = await ringOf(page, sel)
    ck('AgentPanel 歷史 B 對照組:鍵盤移回已選項必須有框', drawn(b), `「${b.text}」outline=${b.style} ${b.w}px`)
  }
}

await browser.close(); sv.close()
console.log(out.join('\n'))
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 全部通過')
process.exit(fail ? 1 : 0)
