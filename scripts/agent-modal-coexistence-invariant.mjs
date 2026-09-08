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

{
  // 幾何(2026-09-08 user:「modal 整個蓋住了 agent 是要怎樣用」):對話框不與常駐區相交、遮罩 = 舞台、常駐區中心可點
  // 前面的 Esc 對照組已把對話框關掉,重新載入 story 再量
  await page.goto(`http://localhost:${sv.address().port}/iframe.html?id=${encodeURIComponent('design-system-components-agentpanel-展示--modal-coexistence')}&viewMode=story`, { waitUntil: 'load' })
  await page.waitForSelector('[data-coexistence-mask]', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)
  const g = await page.evaluate(GEO)
  ck('G 對話框不與常駐區相交(v14 條 B 並列可操作)', !g.missing && !g.intersects, JSON.stringify(g.missing ?? { D: g.D, P: g.P }))
  ck('G 遮罩 = 舞台矩形(只佔宿主面積)', !g.missing && g.maskEqStage, JSON.stringify(g.missing ?? { M: g.M, S: g.S }))
  ck('G 常駐區中心點點得到自己(沒被遮罩蓋)', !g.missing && g.panelHit)
}

await browser.close(); sv.close()
console.log(out.join('\n'))
console.log(fail ? `\n✗ ${fail} 項未通過` : '\n✓ 全部通過')
process.exit(fail ? 1 : 0)
