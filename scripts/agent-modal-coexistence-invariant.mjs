#!/usr/bin/env node
/**
 * 有 URL 的 modal 與 agent 並存 + Esc 分區(2026-09-08)
 *
 * v14 條 A/B:內部內容以自己的 URL 取得協作資格;寬螢幕讓具資格的內容與 agent **並列可操作**。
 * `agent-panel.spec.md:545` 三條表:Esc 的作用域封閉在焦點所在區 ——
 * 焦點在面板內、面板內沒有浮層時**什麼都不關**(不能跨區關掉舞台的 modal)。
 *
 * 為什麼需要這支:Radix 的 `useEscapeKeydown` 在 document 上用 capture 監聽,
 * `dismissable-layer` 只把 Esc 送給「疊最上層」而**不看焦點在哪一區** ——
 * 在 agent 輸入框打字按 Esc 會關掉舞台的 modal。這是「宣稱有分區、實際沒有」,
 * 只有真的按下去才驗得到(M32)。
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
const page = await browser.newPage({ viewport: { width: 1440, height: 800 } })
await page.goto(`http://localhost:${sv.address().port}/iframe.html?id=`
  + encodeURIComponent('design-system-components-agentpanel-展示--modal-coexistence') + '&viewMode=story', { waitUntil: 'load' })
await page.waitForTimeout(900)

const shape = await page.evaluate(() => {
  const panel = document.querySelector('[role="complementary"]')
  const dialog = document.querySelector('[role="dialog"]')
  const stage = document.querySelector('#coexist-stage-btn')
  const input = panel?.querySelector('textarea, input')
  return {
    hasPanel: !!panel, hasDialog: !!dialog,
    panelInert: !!panel?.closest('[inert]'), panelHidden: !!panel?.closest('[aria-hidden="true"]'),
    stageInert: !!stage?.closest('[inert]'),
    hasInput: !!input,
  }
})
ck('前提:面板與對話框同時存在', shape.hasPanel && shape.hasDialog, JSON.stringify(shape))

if (shape.hasPanel && shape.hasDialog) {
  ck('A/B 並列:agent 面板未被抑制(v14 條 B「並列可操作」)',
     !shape.panelInert && !shape.panelHidden, `inert=${shape.panelInert} ariaHidden=${shape.panelHidden}`)
  ck('A/B 並列:舞台其餘內容仍被抑制(並存不等於全開)', shape.stageInert, `stageInert=${shape.stageInert}`)

  // 真的把焦點放進 agent 的輸入框,真的按 Esc
  const focusedInPanel = await page.evaluate(() => {
    const panel = document.querySelector('[role="complementary"]')
    const input = panel?.querySelector('textarea, input')
    input?.focus()
    return !!input && document.activeElement === input
  })
  ck('前提:焦點真的進到 agent 輸入框', focusedInPanel)
  if (focusedInPanel) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const stillOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
    ck('Esc 分區:焦點在 agent 內時按 Esc,舞台的 modal **不得**被關掉(spec:545 第二/三列)',
       stillOpen, `對話框仍在=${stillOpen}`)
  }

  // 對照組:焦點在對話框裡按 Esc,該關的還是要關 —— 不能為了修跨區把 Esc 整個殺掉
  const focusedInDialog = await page.evaluate(() => {
    const btn = document.querySelector('#coexist-modal-btn')
    btn?.focus()
    return !!btn && document.activeElement === btn
  })
  ck('前提:焦點真的進到對話框內', focusedInDialog)
  if (focusedInDialog) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    const closed = await page.evaluate(() => !document.querySelector('[role="dialog"]'))
    ck('對照組:焦點在對話框內按 Esc,對話框**該關**(沒把 Esc 整個殺掉)',
       closed, `對話框已關=${closed}`)
  }
}

await browser.close(); sv.close()
console.log(out.join('\n'))
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 全部通過')
process.exit(fail ? 1 : 0)
