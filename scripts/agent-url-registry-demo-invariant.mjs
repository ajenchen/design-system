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

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`) }
// `--single-process` 沙箱:一個 browser 只能開一個 context → 每個寬度重開(launch-browser.mjs 註解)
for (const width of [1440, 1180]) {
  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  const W = `[${width}px]`
  const $ = (sel) => page.evaluate((s) => !!document.querySelector(s), sel)
  const location = () => page.evaluate(() => { const el = document.querySelector('#demo-location'); return el ? (el.value ?? el.textContent ?? '') : '' })
  const panelInput = () => page.evaluate(() => { const p = document.querySelector('[role="complementary"]'); const i = p?.querySelector('textarea, input'); return i ? { value: i.value, inert: !!p.closest('[inert]') || p.getAttribute('aria-hidden') === 'true' } : null })
  const dialogs = () => page.evaluate(() => document.querySelectorAll('[role="dialog"]').length)
  const typeIntoPanel = async (text) => { await page.evaluate(() => { const i = document.querySelector('[role="complementary"]')?.querySelector('textarea, input'); i?.focus() }); await page.keyboard.type(text); await page.waitForTimeout(80) }
  const click = async (sel) => { await page.click(sel); await page.waitForTimeout(400) }
  await page.goto(`http://localhost:${server.address().port}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: 'load' })
  await page.waitForSelector('[role="complementary"]', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)

  check(`${W} A0 面板一開始就在(story 示範用)`, await $('[role="complementary"]'))
  await typeIntoPanel('hello')
  check(`${W} A 面板能打字`, (await panelInput())?.value === 'hello', JSON.stringify(await panelInput()))
  const loc0 = await location()

  // S1 舞台上的觸發(有 URL 的 modal)→ 網址列變、modal 只佔舞台、代理沒被蓋
  await click('#demo-open-task-4821')
  check(`${W} S1 舞台觸發開了有 URL 的 modal,網址列 = 任務 URL`, (await dialogs()) === 1 && (await location()) === '/projects/8821/tasks/4821', `${loc0} → ${await location()}`)
  let g = await page.evaluate(GEO)
  check(`${W} S1 對話框不與代理面板相交(v14 條 B 並列可操作)`, !g.missing && !g.intersects, JSON.stringify(g.missing ?? { D: g.D, P: g.P }))
  check(`${W} S1 遮罩 = 舞台矩形(modal 與遮罩只佔宿主面積)`, !g.missing && g.maskEqStage, JSON.stringify(g.missing ?? { M: g.M, S: g.S }))
  check(`${W} S1 對話框置中於舞台`, !g.missing && g.centered)
  check(`${W} S1 面板中心點真的點得到面板(沒被遮罩蓋)`, !g.missing && g.panelHit)
  const toolbar = await page.evaluate(() => { const b = document.querySelector('button[aria-label="上一頁"]'); return b ? { inert: !!b.closest('[inert]') || !!b.closest('[aria-hidden="true"]'), disabled: b.disabled } : null })
  check(`${W} S1 瀏覽器工具列不被抑制、上一頁可用`, toolbar && !toolbar.inert && !toolbar.disabled, JSON.stringify(toolbar))
  // S2 modal 內與面板都能打字;儲存空白時停用、打字後可按
  const saveDisabledBefore = await page.evaluate(() => document.querySelector('#demo-modal-save')?.disabled)
  await page.click('#demo-modal-input'); await page.keyboard.type('補了 QA 環境資訊')
  const saveDisabledAfter = await page.evaluate(() => document.querySelector('#demo-modal-save')?.disabled)
  check(`${W} S2 modal 內能打字;儲存鈕空白時停用、有字後可按`, saveDisabledBefore === true && saveDisabledAfter === false, `before=${saveDisabledBefore} after=${saveDisabledAfter}`)
  await typeIntoPanel(' world')
  check(`${W} S2 modal 開著時代理面板仍能打字(並存)`, (await panelInput())?.value === 'hello world', JSON.stringify(await panelInput()))
  const primaryBg = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('#demo-modal-save')); const c = getComputedStyle(document.querySelector('#demo-modal-cancel')); return { save: s.backgroundColor, cancel: c.backgroundColor } })
  check(`${W} S2 儲存是 primary(底色 ≠ 取消)`, primaryBg.save !== primaryBg.cancel, JSON.stringify(primaryBg))
  // Esc 分派
  await page.evaluate(() => { document.querySelector('[role="complementary"]')?.querySelector('textarea, input')?.focus() })
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  check(`${W} S2 焦點在面板內按 Esc → modal 不關`, (await dialogs()) === 1)
  await page.click('#demo-modal-save'); await page.waitForTimeout(400)
  check(`${W} S2 儲存後 modal 關、網址列回宿主`, (await dialogs()) === 0 && (await location()) === loc0, await location())
  await click('#demo-open-task-4821')
  const saved = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] ul[aria-label="留言"] li')].map((li) => li.textContent))
  check(`${W} S2 再開同一張任務,剛才的留言在`, saved.some((t) => t.includes('補了 QA 環境資訊')), JSON.stringify(saved))
  // S3 任務裡的「刪除任務」= 沒有 URL 的確認框,蓋住代理;取消後恢復並存(v14 第 9 題)
  await click('#demo-task-delete')
  check(`${W} S3 確認框疊在任務 modal 上(兩層)`, (await dialogs()) === 2)
  await typeIntoPanel('X')
  check(`${W} S3 確認框開著時代理被擋(打字無效)`, (await panelInput())?.value === 'hello world', JSON.stringify(await panelInput()))
  const delBg = await page.evaluate(() => { const d = getComputedStyle(document.querySelector('#demo-task-confirm-delete')); const c = getComputedStyle(document.querySelector('#demo-task-confirm-cancel')); return { del: d.backgroundColor, cancel: c.backgroundColor } })
  check(`${W} S3 確認框的「刪除」是 primary + danger(底色 ≠ 取消)`, delBg.del !== delBg.cancel, JSON.stringify(delBg))
  await click('#demo-task-confirm-cancel')
  await typeIntoPanel('!')
  check(`${W} S3 取消後任務 modal 還在、代理恢復`, (await dialogs()) === 1 && (await panelInput())?.value === 'hello world!', JSON.stringify(await panelInput()))
  await page.click('#demo-modal-cancel'); await page.waitForTimeout(400)
  // S4 代理回覆裡的連結:同一個 modal 入口;外部連結另開、未確認的只是文字
  await click('#demo-link-task-4821')
  check(`${W} S4 代理連結開同一個有 URL 的 modal`, (await dialogs()) === 1 && (await location()) === '/projects/8821/tasks/4821')
  await page.click('#demo-modal-input'); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  check(`${W} S4 焦點在 modal 內按 Esc → modal 關`, (await dialogs()) === 0)
  const ext = await page.evaluate(() => { const a = document.querySelector('#demo-link-zendesk'); return a ? { target: a.getAttribute('target'), rel: a.getAttribute('rel') } : null })
  check(`${W} S4 外部連結另開分頁(target=_blank + rel)`, ext?.target === '_blank' && /noopener/.test(ext?.rel ?? ''), JSON.stringify(ext))
  const unconfirmed = await page.evaluate(() => { const e = document.querySelector('#demo-unconfirmed'); return e ? { isA: !!e.closest('a,button'), tabIndex: e.tabIndex } : null })
  check(`${W} S4 系統沒確認過的網址不是連結、不能聚焦(條 D)`, unconfirmed && !unconfirmed.isA && unconfirmed.tabIndex < 0, JSON.stringify(unconfirmed))
  // S5 宿主導覽 + 歷史:網址列變、草稿在;上一頁回來
  await click('#demo-link-sprint-board')
  check(`${W} S5 宿主換頁、網址列變、草稿還在(條 C / E)`, (await location()) === '/projects/8821/board' && (await panelInput())?.value === 'hello world!', await location())
  await page.click('button[aria-label="上一頁"]'); await page.waitForTimeout(400)
  check(`${W} S5 上一頁回到專案總覽`, (await location()) === loc0, await location())
  // S6 刪除專案(沒 URL)→ 擋代理;確認後宿主到專案列表,代理不動
  await click('#demo-open-confirm')
  await typeIntoPanel('Y')
  check(`${W} S6 刪除專案確認框擋住代理`, (await dialogs()) === 1 && (await panelInput())?.value === 'hello world!')
  await click('#demo-confirm-delete')
  const title = await page.evaluate(() => document.querySelector('#demo-stage-title')?.textContent)
  check(`${W} S6 確認刪除後宿主到專案列表、代理草稿仍在`, (await location()) === '/projects' && /專案列表/.test(title ?? '') && (await panelInput())?.value === 'hello world!', `${await location()} ${title}`)
  // S7 關掉再開草稿保留(條 E);重新整理則回初始關閉、草稿清空(條 F)
  await page.click('[role="complementary"] button[aria-label="關閉面板"]'); await page.waitForTimeout(500)
  await page.click('button[aria-label="開啟智慧代理"]'); await page.waitForTimeout(500)
  check(`${W} S7 關閉再開,草稿保留(條 E)`, (await panelInput())?.value === 'hello world!', JSON.stringify(await panelInput()))
  await page.click('button[aria-label="重新整理"]'); await page.waitForTimeout(500)
  const fabAfterReload = await $('button[aria-label="開啟智慧代理"]')
  await page.click('button[aria-label="開啟智慧代理"]').catch(() => {}); await page.waitForTimeout(500)
  check(`${W} S7 重新整理後代理回到初始關閉(FAB),再開是空的新對話(條 F)`, fabAfterReload && (await panelInput())?.value === '', JSON.stringify({ fabAfterReload, panel: await panelInput() }))
  await browser.close()
}
server.close()
const failed = results.filter((r) => !r.ok).length
console.log(failed ? `✗ ${failed} 條失敗` : '✓ URL 註冊表示範全部通過(兩個寬度)')
process.exit(failed ? 1 : 0)
