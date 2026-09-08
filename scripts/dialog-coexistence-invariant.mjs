#!/usr/bin/env node
/**
 * Dialog 並存契約:兩條路都要驗(2026-09-08)
 *
 * agent 原則 v14 條 A/B 要求「有 URL 的內容與 agent 並列可操作」。Radix 只給兩個極端:
 * modal 分支寫死 `hideOthers(content)`(只保留 content,無白名單),
 * `modal={false}` 則三件全關。DS 加的是中間那個狀態:`persistentElements`。
 *
 * **兩條路都驗,缺一不可**:
 *   (A) 預設路徑(沒傳 persistentElements)—— 行為必須跟過去完全一樣:背景被抑制。
 *   (B) 並存路徑 —— 指定的區域仍可聚焦、可打字;其餘仍被抑制。
 * 只驗 (B) 的話,「把預設路徑一起弄壞」不會被發現 —— 那正是 user 說的「不要改壞既有東西」。
 *
 * 判準用「真的能不能聚焦」而不是「有沒有 aria-hidden 屬性」:
 * `suppressOthers` 在支援 inert 的瀏覽器用原生 inert、不支援才用 aria-hidden,
 * 驗屬性會綁死實作;驗行為才是驗契約(M32)。
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

const out = []; let fail = 0
const ck = (t, p, d = '') => { out.push(`${p ? '✓' : '✗'} ${t}${d ? ' | ' + d : ''}`); if (!p) fail++ }
const story = (id) => `http://localhost:${sv.address().port}/iframe.html?id=` + encodeURIComponent(id) + '&viewMode=story'

const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

// 真的去點、真的去打字 —— 「可聚焦」不等於「可操作」
const probe = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return { missing: true }
  el.focus()
  const focused = document.activeElement === el
  let typed = null
  if (el.tagName === 'INPUT') {
    el.value = ''
    el.dispatchEvent(new Event('focus'))
    // 真的送鍵盤事件會被 inert 擋掉;這裡量的是「焦點進不進得去」+ 元素自身狀態
    typed = !el.matches(':disabled')
  }
  return { focused, typed, inert: !!el.closest('[inert]'), ariaHidden: !!el.closest('[aria-hidden="true"]') }
}, sel)

// ── (B) 並存路徑 ────────────────────────────────────────────────────────
await page.goto(story('design-system-components-dialog-展示--coexistence-contract'), { waitUntil: 'load' })
await page.waitForTimeout(900)
const asideInput = await probe('#coexist-aside-input')
const bgBtn = await probe('#coexist-background-btn')

if (asideInput.missing) ck('B 並存路徑:story 有渲染', false, '找不到 #coexist-aside-input')
else {
  ck('B 常駐區域的輸入框仍可聚焦', asideInput.focused && !asideInput.inert,
     `focused=${asideInput.focused} inert=${asideInput.inert}`)
  // 真的打字:「可聚焦」不等於「可操作」(R3 指出只 .focus() 不夠)
  await page.focus('#coexist-aside-input'); await page.keyboard.type('hello')
  const typed = await page.evaluate(() => document.querySelector('#coexist-aside-input')?.value)
  ck('B 常駐區域的輸入框真的能打字', typed === 'hello', `value=${JSON.stringify(typed)}`)
  // 送出 / 儲存 在輸入空白時停用(story 依規格),所以先打字再驗按鈕可聚焦
  const asideBtn = await probe('#coexist-aside-btn')
  ck('B 常駐區域的按鈕仍可聚焦(v14 條 B「並列可操作」)', asideBtn.focused && !asideBtn.inert && !asideBtn.ariaHidden,
     `focused=${asideBtn.focused} inert=${asideBtn.inert} ariaHidden=${asideBtn.ariaHidden}`)
  await page.focus('#coexist-inside-input'); await page.keyboard.type('x')
  const insideBtn = await probe('#coexist-inside-btn')
  ck('B 對話框自己的按鈕仍可聚焦', insideBtn.focused && !insideBtn.inert,
     `focused=${insideBtn.focused} inert=${insideBtn.inert}`)
  ck('B **其餘背景仍被抑制**(並存不等於全開)', bgBtn.inert || bgBtn.ariaHidden || !bgBtn.focused,
     `focused=${bgBtn.focused} inert=${bgBtn.inert} ariaHidden=${bgBtn.ariaHidden}`)
}

// ── (A) 預設路徑:沒傳 persistentElements 的 Dialog 必須照舊隔離 ──────────
await page.goto(story('design-system-components-dialog-展示--default'), { waitUntil: 'load' }).catch(() => {})
await page.waitForTimeout(600)
const defaultPath = await page.evaluate(async () => {
  // 只挑 story 根節點內的觸發鈕:iframe 裡還有 storybook 自己的「Set string」按鈕,
  // 抓第一個 button 會抓到它然後什麼都沒發生(2026-09-08 當場踩到)
  const root = document.querySelector('#storybook-root') || document.body
  const trigger = [...root.querySelectorAll('button')].find((b) => !b.closest('[role="dialog"]'))
  if (!trigger) return { skip: '找不到觸發鈕' }
  trigger.click()
  await new Promise((r) => setTimeout(r, 700))
  const dialog = document.querySelector('[role="dialog"]')
  if (!dialog) return { skip: '對話框沒開' }
  const outside = [...root.querySelectorAll('button')].filter((b) => !dialog.contains(b))
  const stillUsable = outside.filter((b) => !b.closest('[inert]') && !b.closest('[aria-hidden="true"]'))
  return { total: outside.length, stillUsable: stillUsable.length }
})
if (defaultPath.skip) ck('A 預設路徑:背景照舊被隔離', false, defaultPath.skip)
else ck('A 預設路徑:背景照舊被隔離(沒傳 persistentElements 就是原本的 modal)',
        defaultPath.stillUsable === 0, `框外仍可用 ${defaultPath.stillUsable}/${defaultPath.total}`)

const GEO = `(() => {
  const mask = document.querySelector('[data-coexistence-mask]')
  const dialog = [...document.querySelectorAll('[role="dialog"]')].find((d) => !d.querySelector('[data-coexistence-mask]')) || document.querySelector('[role="dialog"]')
  const panel = document.querySelector('[role="complementary"]') || document.querySelector('aside#coexist-aside, aside#fv-aside')
  if (!mask || !dialog || !panel) return { missing: { mask: !mask, dialog: !dialog, panel: !panel } }
  const stage = mask.parentElement
  const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } }
  const D = R(dialog), M = R(mask), P = R(panel), S = R(stage)
  const intersects = !(D.r <= P.l + 0.5 || D.l >= P.r - 0.5 || D.b <= P.t + 0.5 || D.t >= P.b - 0.5)
  const eq = (a, b) => Math.abs(a - b) <= 1
  const cx = (P.l + P.r) / 2, cy = (P.t + P.b) / 2
  const hit = document.elementFromPoint(cx, cy)
  const centered = Math.abs((D.l + D.r) / 2 - (S.l + S.r) / 2) <= 1
  return { intersects, maskEqStage: eq(M.l, S.l) && eq(M.r, S.r) && eq(M.t, S.t) && eq(M.b, S.b), panelHit: !!hit && panel.contains(hit), centered, D, M, P, S }
})()`

// 幾何(2026-09-08 user:「modal 整個蓋住了 agent 是要怎樣用」):對話框不與常駐區相交、遮罩 = 舞台、常駐區中心可點
{
  await page.goto(story('design-system-components-dialog-展示--coexistence-contract'), { waitUntil: 'load' }).catch(() => {})
  await page.waitForSelector('[data-coexistence-mask]', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)
  const g = await page.evaluate(GEO)
  ck('G 對話框不與常駐側欄相交(v14 條 B 並列可操作)', !g.missing && !g.intersects, JSON.stringify(g.missing ?? { D: g.D, P: g.P }))
  ck('G 遮罩 = 舞台矩形(只佔宿主面積)', !g.missing && g.maskEqStage, JSON.stringify(g.missing ?? { M: g.M, S: g.S }))
  ck('G 側欄中心點點得到自己(沒被遮罩蓋)', !g.missing && g.panelHit)
}
await browser.close(); sv.close()
console.log(out.join('\n'))
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 兩條路都通過')
process.exit(fail ? 1 : 0)
