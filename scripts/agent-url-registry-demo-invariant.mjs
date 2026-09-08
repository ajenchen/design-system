#!/usr/bin/env node
/**
 * Agent 原則「URL 註冊表」示範閘 —— 2026-09-08
 *
 * v14 條 A:內容只要有自己的 URL 就能跟 agent 並存;沒有 URL 的(確認框)就是純 modal,agent 被擋。
 * 這在 DS 裡沒有真的路由,story `UrlRegistryDemo` 用**明標假資料**的目的地清單 + 模擬網址列來示範。
 * 本閘把示範真的走一遍:
 *   A. 面板能打字;
 *   B. 點「有 URL 的 modal 目的地」→ 網址列變、modal 開,**modal 內與 agent 面板都能打字**(並存);
 *   C. 點「沒 URL 的確認」→ 網址列不變,agent 面板被擋(打字無效);取消 → 面板恢復;
 *   D. 「未確認」的目的地不是連結、不能聚焦;
 *   E. 草稿跨導覽與關閉/重開都還在(條 F:初始關閉,但草稿不丟)。
 */
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const STATIC = join(REPO, 'storybook-static')
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
if (!existsSync(join(STATIC, 'index.json'))) { console.error('先 npm run build-storybook'); process.exit(2) }
const index = JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8'))
const id = Object.values(index.entries).find((e) => e.type === 'story' && /agentpanel/i.test(e.id) && /url-registry-demo/.test(e.id))?.id
if (!id) { console.error('找不到 UrlRegistryDemo story'); process.exit(2) }

const server = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'
  const f = join(STATIC, p)
  if (!existsSync(f) || statSync(f).isDirectory()) { s.writeHead(404); s.end(); return }
  s.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); s.end(readFileSync(f))
})
await new Promise((r) => server.listen(0, r))
const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto(`http://localhost:${server.address().port}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: 'load' })
await page.waitForTimeout(800)

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`) }
const $ = (sel) => page.evaluate((s) => !!document.querySelector(s), sel)
const location = () => page.evaluate(() => document.querySelector('#demo-location')?.textContent ?? '')
const panelInput = () => page.evaluate(() => { const p = document.querySelector('[role="complementary"]'); const i = p?.querySelector('textarea, input'); return i ? { value: i.value, inert: !!p.closest('[inert]') || p.getAttribute('aria-hidden') === 'true' } : null })
async function typeIntoPanel(text) {
  await page.evaluate(() => { const i = document.querySelector('[role="complementary"]')?.querySelector('textarea, input'); i?.focus() })
  await page.keyboard.type(text)
  await page.waitForTimeout(80)
}

// story 為了示範一載入就把面板打開(consumer 控制 `open`);元件預設「初始關閉」(v14 條 F)由
// `agent-panel-breakpoint.mjs` 的 initial-closed 案例驗,這裡不重驗。
check('A0 面板一開始就在(story 示範用)', await $('[role="complementary"]'))
// A. 打字
await typeIntoPanel('hello')
check('A 面板開啟後能打字', (await panelInput())?.value === 'hello', JSON.stringify(await panelInput()))
// B. 有 URL 的 modal 目的地:網址列變、modal 開、兩邊都能打字
const loc0 = await location()
const links = await page.evaluate(() => [...document.querySelectorAll('[role="complementary"] a[id^="demo-link-"]')].map((a) => a.id))
let modalLink = null, hostLink = null
for (const l of links) {
  await page.click(`#${l}`); await page.waitForTimeout(400)
  if (await $('[role="dialog"]')) { modalLink = l; break }
  hostLink = l
}
hostLink = links.find((l) => l !== modalLink) ?? null
check('B1 目的地清單裡有一個是「有 URL 的 modal」、一個是宿主導覽', !!modalLink && !!hostLink, `links=${links.join(',')} modal=${modalLink} host=${hostLink}`)
const locModal = await location()
check('B2 開 modal 後模擬網址列變成 modal 自己的 URL', locModal !== loc0 && locModal.length > 0, `${loc0} → ${locModal}`)
await page.click('#demo-modal-input'); await page.keyboard.type('abc')
const modalVal = await page.evaluate(() => document.querySelector('#demo-modal-input')?.value)
check('B3 modal 內能打字', modalVal === 'abc', String(modalVal))
await typeIntoPanel(' world')
check('B4 modal 開著時 agent 面板仍能打字(並存)', (await panelInput())?.value === 'hello world', JSON.stringify(await panelInput()))
// Esc 分派(v14 條 D):焦點在 agent 面板內按 Esc 是面板的事,不得順手關掉並存中的 modal;
// 焦點在 modal 內按 Esc 才關 modal。
await page.keyboard.press('Escape'); await page.waitForTimeout(300)
check('B5a 焦點在面板內按 Esc → modal 不關(Esc 分派給面板)', (await $('[role="dialog"]')) && (await location()) === locModal, await location())
await page.click('#demo-modal-input'); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
check('B5b 焦點在 modal 內按 Esc → modal 關、網址列回宿主', !(await $('[role="dialog"]')) && (await location()) === loc0, await location())
// C. 沒 URL 的確認框:擋 agent
await page.click('#demo-open-confirm'); await page.waitForTimeout(400)
check('C1 確認框開了、網址列不變', (await $('[role="dialog"]')) && (await location()) === loc0, await location())
await typeIntoPanel('X')
const during = await panelInput()
check('C2 確認框開著時 agent 面板被擋(打字無效)', during?.value === 'hello world', JSON.stringify(during))
await page.click('#demo-confirm-cancel'); await page.waitForTimeout(400)
await typeIntoPanel('!')
check('C3 取消後面板恢復', (await panelInput())?.value === 'hello world!', JSON.stringify(await panelInput()))
// D. 未確認的目的地不是連結
const unconfirmed = await page.evaluate(() => { const e = document.querySelector('#demo-unconfirmed'); return e ? { tag: e.tagName, href: e.getAttribute('href'), tabIndex: e.tabIndex, isA: !!e.closest('a,button') } : null })
check('D 「未確認」目的地不是連結也不能聚焦', unconfirmed && !unconfirmed.isA && unconfirmed.tabIndex < 0, JSON.stringify(unconfirmed))
// E. 草稿跨導覽與關閉/重開
const locBefore = await location()
if (hostLink) { await page.click(`#${hostLink}`); await page.waitForTimeout(400) }
check('E1 宿主導覽(網址列變、沒有 modal)後草稿還在', hostLink && (await location()) !== locBefore && !(await $('[role="dialog"]')) && (await panelInput())?.value === 'hello world!', `host=${hostLink} ${locBefore} → ${await location()}`)
await page.click('[role="complementary"] button[aria-label="關閉面板"]'); await page.waitForTimeout(600)
// 面板關閉 = FAB 回來、面板看不見(可能還掛著做收合動畫,所以看「可見」不看「存在」)
const panelVisible = await page.evaluate(() => { const p = document.querySelector('[role="complementary"]'); if (!p) return false; const r = p.getBoundingClientRect(); return r.width > 0 && r.height > 0 && p.getAttribute('aria-hidden') !== 'true' && !p.closest('[inert]') && getComputedStyle(p).visibility !== 'hidden' })
check('E2 關閉面板後 FAB 回來、面板不可見', (await $('button[aria-label="開啟智慧代理"]')) && !panelVisible, `panelVisible=${panelVisible}`)
await page.click('button[aria-label="開啟智慧代理"]'); await page.waitForTimeout(400)
check('E3 重開後草稿還在', (await panelInput())?.value === 'hello world!', JSON.stringify(await panelInput()))

await browser.close(); server.close()
const failed = results.filter((r) => !r.ok).length
console.log(failed ? `✗ ${failed} 條失敗` : '✓ URL 註冊表示範全部通過')
process.exit(failed ? 1 : 0)
