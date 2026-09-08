#!/usr/bin/env node
/**
 * 浮層快捷鍵的作用域必須限定在自己那一區(2026-09-08)
 *
 * FileViewer 的 window keydown 舊版只排除 input / textarea / contentEditable,其餘一律接手。
 * 在「檢視器是唯一可聚焦的東西」的年代看不出問題 —— 但那是**被 modal 遮住而剛好沒事**,
 * 不是真的有作用域。一旦有東西與它並存(agent 原則 v14 條 A/B),在旁邊那一區的**按鈕**上
 * 按方向鍵就會操作到這個檢視器,而使用者的視線根本不在這裡。
 *
 * 兩條都驗,缺一不可:
 *   (A) 焦點在檢視器**外**的可聚焦元素 → 快捷鍵**不得**生效
 *   (B) 焦點在檢視器**內** → 快捷鍵**仍然**要生效(否則就是把功能弄壞來換綠燈)
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

const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`http://localhost:${sv.address().port}/iframe.html?id=`
  + encodeURIComponent('design-system-components-fileviewer-展示--coexistence-contract') + '&viewMode=story', { waitUntil: 'load' })
await page.waitForTimeout(1000)

// 檢視器目前顯示哪一個檔案 —— 用標題文字當指紋
const title = () => page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]')
  return dialog?.querySelector('h1,h2,[data-slot="title"],header')?.textContent?.trim().slice(0, 40) ?? null
})

const before = await title()
ck('前提:檢視器已開且讀得到目前檔名', !!before, `目前=${before}`)

if (before) {
  // ── (A) 焦點在檢視器外 ────────────────────────────────────────────────
  // 造一個檢視器外、非輸入框的可聚焦元素(這正是舊版判準漏掉的形狀)
  // 用 story 裡真的常駐區按鈕,不自己 append 一個 —— 自己 append 的節點不在保留集合裡,
  // 會被 `suppressOthers` inert 掉而聚焦不了,那樣測到的是「探針壞了」不是「作用域對了」。
  // 送出鈕在輸入空白時停用(story 依規格),先打字讓它可聚焦
  await page.focus('#fv-aside-input').catch(() => {}); await page.keyboard.type('x')
  await page.evaluate(() => {
    (document.querySelector('#fv-aside-btn'))?.focus()
  })
  const focusedOutside = await page.evaluate(() => document.activeElement?.id === 'fv-aside-btn')
  ck('前提:焦點真的在檢視器外的按鈕上', focusedOutside)
  if (focusedOutside) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(350)
    const after = await title()
    ck('A 焦點在檢視器外時,方向鍵**不得**切換檔案', after === before, `前=${before} 後=${after}`)
  }

  // ── (B) 對照組:焦點在檢視器內時仍然要能切 ──────────────────────────
  const focusedInside = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    const btn = dialog?.querySelector('button:not([disabled])')
    btn?.focus()
    return !!btn && dialog?.contains(document.activeElement)
  })
  ck('前提:焦點真的進到檢視器內', !!focusedInside)
  if (focusedInside) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(350)
    const after = await title()
    ck('B 對照組:焦點在檢視器內時,方向鍵**仍然**要切換檔案(沒把功能弄壞換綠燈)',
       after !== before, `前=${before} 後=${after}`)
  }
}

await browser.close(); sv.close()
console.log(out.join('\n'))
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 全部通過')
process.exit(fail ? 1 : 0)
