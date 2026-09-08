#!/usr/bin/env node
/**
 * Agent 整頁示範閘(story `AgentPanel/展示/UrlRegistryDemo`)—— 2026-09-09 重寫
 *
 * v14 條 A/B:內容只要有自己的 URL 就能跟 agent 並存;沒有 URL 的(確認框)是純 modal,agent 被擋。
 * 2026-09-09 把「並存」與「URL 註冊表」兩支示範合併成一支(user:「agent 的並存和示意範例是否可以合而為一?」),
 * 本閘把示範真的走一遍,兩個並排寬度(1440 / 1180)+ 一個蓋板寬度(1000,容器 966 < 1080):
 *   S1 清單三列(DataTable:ID / 標題 / 指派人 / 狀態)+ 點列開有 URL 的 modal + 幾何(modal ∩ 面板 = ∅、遮罩 = 舞台)
 *      + Esc 分區(焦點在 agent 內按 Esc 不得跨區關掉舞台的 modal;對照組:焦點在 modal 內 Esc 該關)
 *   S2 header 一行標題 + 垃圾桶 icon-only 在 actions slot;footer 只有取消 / 儲存,儲存 primary 且最右
 *   S3 四個 Field(標題 / 指派人 / 狀態 / 截止日)存檔 → 清單那一列更新
 *   S4 新增任務(有 URL)→ 清單多一列
 *   S5 刪除 → 沒有 URL 的確認框(primary danger)擋住代理;取消恢復並存;確認 → 清單少一列
 *   S6 背景位置模式:先點衝刺看板再點任務 → modal 背景是看板;重新整理 = 直接以任務網址進入 → 背景是預設頁
 *   S7 session:歷史列多個 session、當前有標記、可切換、「+」新 session 空狀態、送出後才進歷史、切回內容仍在
 *   S8 關 agent → 遮罩仍在(根因錨:入口鈕 Dock 的 pointer-events-none 全舞台圖層曾被當成洞,遮罩整張被挖空)
 *   S9 蓋板態:工具列可點、agent 點有 URL 的 modal → 抽屜保持開啟、modal 在後方且被抑制、× 後顯露可操作
 * `--selftest`:對照組 —— 把 S8 的洞判準餵舊 build 實測抓到的壞 clip-path,必須紅。
 */
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const STATIC = join(REPO, 'storybook-static')
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }

const TASKS_URL = '/projects/8821/tasks'
const BOARD_URL = '/projects/8821/board'
const TASK_4821 = '/projects/8821/tasks/4821'

/**
 * 解析 CoexistenceMask 的 `clip-path: path(evenodd, "M0 0H W V H H0Z M x1 y1 H x2 V y2 H x1 Z …")`:
 * 第一個子路徑是外框,其餘是洞。回傳洞面積佔外框面積的比例 —— 洞跟外框一樣大 = 遮罩整張被挖空。
 */
export function maskHoleRatio(clip) {
  const rects = [...String(clip).matchAll(/M\s*([\d.]+)\s+([\d.]+)\s*H\s*([\d.]+)\s*V\s*([\d.]+)\s*H\s*[\d.]+\s*Z/g)]
    .map((m) => { const [x1, y1, x2, y2] = m.slice(1).map(Number); return { w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) } })
  if (rects.length === 0) return { outer: 0, holes: 0, ratio: NaN }
  const outer = rects[0].w * rects[0].h
  const holes = rects.slice(1).reduce((sum, r) => sum + r.w * r.h, 0)
  return { outer, holes, ratio: outer ? holes / outer : NaN }
}
/** 洞面積不得超過遮罩的 5%(入口鈕的洞 40×40 ≈ 0.2%;整張被挖空 = 100%)。 */
const MASK_HOLE_MAX_RATIO = 0.05

if (process.argv.includes('--selftest')) {
  // 對照組:舊 build 2026-09-09 實測抓到的壞值(洞 = 外框)必須紅;修好後的值(只有入口鈕的洞)必須綠
  const bad = maskHoleRatio('path(evenodd, "M 0 0 H 1406 V 640 H 0 Z M 0 0 H 1406 V 640 H 0 Z")')
  const good = maskHoleRatio('path(evenodd, "M 0 0 H 1406 V 639 H 0 Z M 1350 583 H 1390 V 623 H 1350 Z")')
  const none = maskHoleRatio('path(evenodd, "M 0 0 H 1006 V 639 H 0 Z")')
  const ok = bad.ratio > MASK_HOLE_MAX_RATIO && good.ratio <= MASK_HOLE_MAX_RATIO && none.ratio === 0
  console.log(`${ok ? '✓' : '✗'} selftest:壞 clip(洞 = 外框)ratio=${bad.ratio.toFixed(3)} 判紅;好 clip ratio=${good.ratio.toFixed(4)} 判綠;無洞 ratio=${none.ratio}`)
  process.exit(ok ? 0 : 1)
}

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

// 幾何:對話框不與常駐區相交、遮罩 = 舞台矩形、常駐區中心可點、對話框置中於舞台
const GEO = `(() => {
  const mask = document.querySelector('[data-coexistence-mask]')
  const dialog = [...document.querySelectorAll('[role="dialog"]')].find((d) => !d.querySelector('[data-coexistence-mask]')) || document.querySelector('[role="dialog"]')
  const panel = document.querySelector('[role="complementary"]')
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

function bind(page) {
  const $ = (sel) => page.evaluate((s) => !!document.querySelector(s), sel)
  const location = () => page.evaluate(() => { const el = document.querySelector('#demo-location'); return el ? (el.value ?? el.textContent ?? '') : '' })
  const stageTitle = () => page.evaluate(() => document.querySelector('#demo-stage-title')?.textContent ?? '')
  const dialogs = () => page.evaluate(() => document.querySelectorAll('[role="dialog"]').length)
  const panelInput = () => page.evaluate(() => { const p = document.querySelector('[role="complementary"]'); const i = p?.querySelector('textarea, input'); return i ? { value: i.value, inert: !!p.closest('[inert]') || p.getAttribute('aria-hidden') === 'true' } : null })
  const typeIntoPanel = async (text) => { await page.evaluate(() => { document.querySelector('[role="complementary"]')?.querySelector('textarea, input')?.focus() }); await page.keyboard.type(text); await page.waitForTimeout(80) }
  const click = async (sel) => { await page.click(sel); await page.waitForTimeout(450) }
  const rows = () => page.evaluate(() => [...document.querySelectorAll('[id^="demo-task-link-"]')].map((a) => a.closest('[role="row"]')?.textContent ?? ''))
  const panelTitle = () => page.evaluate(() => document.querySelector('[role="complementary"] button[aria-haspopup="dialog"]')?.textContent?.trim() ?? '')
  const inert = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return el ? (!!el.closest('[inert]') || !!el.closest('[aria-hidden="true"]')) : null }, sel)
  const bg = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).backgroundColor : null }, sel)
  const mask = () => page.evaluate(() => { const m = document.querySelector('[data-coexistence-mask]'); return m ? { clip: m.style.clipPath, bg: getComputedStyle(m).backgroundColor } : null })
  const alpha = (color) => { const m = /\/\s*([\d.]+)\)$/.exec(color ?? ''); return m ? Number(m[1]) : (/^rgba?\(/.test(color ?? '') ? (color.match(/[\d.]+/g)?.[3] ?? 1) : 0) }
  /** 歷史浮層:開 → 讀列與當前標記 → 關(Esc)。 */
  const history = async () => {
    await click('[role="complementary"] button[aria-haspopup="dialog"]')
    const data = await page.evaluate(() => {
      const pop = document.querySelector('[role="dialog"][aria-label="歷史對話"]')
      const items = pop ? [...pop.querySelectorAll('[cmdk-item]')] : []
      return { open: !!pop, rows: items.map((i) => i.textContent?.trim() ?? ''), current: items.filter((i) => i.querySelector('[role="presentation"][data-selected]')).map((i) => i.textContent?.trim() ?? '') }
    })
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    return data
  }
  const pickOption = async (comboSel, optionText) => {
    await click(comboSel)
    await page.click(`[role="option"]:has-text("${optionText}")`); await page.waitForTimeout(350)
  }
  return { $, location, stageTitle, dialogs, panelInput, typeIntoPanel, click, rows, panelTitle, inert, bg, mask, alpha, history, pickOption }
}

async function openStory(width, height = 900) {
  // `--single-process` 沙箱:一個 browser 只能開一個 context → 每個寬度重開(launch-browser.mjs 註解)
  const browser = await launchBrowser()
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto(`http://localhost:${server.address().port}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitUntil: 'load' })
  await page.waitForSelector('[role="complementary"]', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)
  return { browser, page }
}

for (const width of [1440, 1180]) {
  const { browser, page } = await openStory(width)
  const W = `[${width}px]`
  const h = bind(page)

  check(`${W} A0 面板一開始就在(story 示範用)`, await h.$('[role="complementary"]'))
  await h.typeIntoPanel('hello')
  check(`${W} A 面板能打字`, (await h.panelInput())?.value === 'hello', JSON.stringify(await h.panelInput()))

  // ── S1 清單三列 + 點列開有 URL 的 modal + 幾何 + Esc 分區 ──
  const rows0 = await h.rows()
  const headers = await page.evaluate(() => [...document.querySelectorAll('[role="columnheader"]')].map((c) => c.textContent?.trim()))
  check(`${W} S1 清單是 DataTable,三列、四欄 ID / 標題 / 指派人 / 狀態`, rows0.length === 3 && ['ID', '標題', '指派人', '狀態'].every((x) => headers.includes(x)), JSON.stringify({ rows: rows0, headers }))
  check(`${W} S1 清單列不縮排(表格第一欄左緣 = 表頭左緣)`, await page.evaluate(() => { const c = document.querySelector('[id^="demo-task-link-"]')?.closest('[role="row"]')?.firstElementChild; const hd = document.querySelector('[role="columnheader"]'); return !!c && !!hd && Math.abs(c.getBoundingClientRect().left - hd.getBoundingClientRect().left) <= 1 }))
  await h.click('#demo-task-link-4821')
  check(`${W} S1 點列開了有 URL 的 modal,網址列 = 任務 URL`, (await h.dialogs()) === 1 && (await h.location()) === TASK_4821, await h.location())
  let g = await page.evaluate(GEO)
  check(`${W} S1 對話框不與代理面板相交(v14 條 B 並列可操作)`, !g.missing && !g.intersects, JSON.stringify(g.missing ?? { D: g.D, P: g.P }))
  check(`${W} S1 遮罩 = 舞台矩形(modal 與遮罩只佔宿主面積)`, !g.missing && g.maskEqStage, JSON.stringify(g.missing ?? { M: g.M, S: g.S }))
  check(`${W} S1 對話框置中於舞台`, !g.missing && g.centered)
  check(`${W} S1 面板中心點真的點得到面板(沒被遮罩蓋)`, !g.missing && g.panelHit)
  check(`${W} S1 瀏覽器工具列不被抑制(並存 modal 開著時)`, (await h.inert('button[aria-label="上一頁"]')) === false)
  await h.typeIntoPanel(' world')
  check(`${W} S1 modal 開著時代理面板仍能打字(並存)`, (await h.panelInput())?.value === 'hello world', JSON.stringify(await h.panelInput()))
  await page.evaluate(() => { document.querySelector('[role="complementary"]')?.querySelector('textarea, input')?.focus() })
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  check(`${W} S1 焦點在面板內按 Esc → modal 不關(agent-panel.spec.md:545 三條表)`, (await h.dialogs()) === 1)
  await page.click('#demo-task-title'); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  check(`${W} S1 對照組:焦點在 modal 內按 Esc → modal 關`, (await h.dialogs()) === 0 && (await h.location()) === TASKS_URL, await h.location())

  // ── S2 header / footer 形狀 ──
  await h.click('#demo-task-link-4821')
  const shape = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    const title = d?.querySelector('h2')
    const del = d?.querySelector('#demo-task-delete')
    const footer = d?.querySelector('[data-dialog-footer]')
    const fbtns = footer ? [...footer.querySelectorAll('button')] : []
    return {
      title: title?.textContent?.trim(), describedBy: d?.getAttribute('aria-describedby'),
      headerRows: title ? Math.round(title.getBoundingClientRect().height / 24) : 0,
      delInHeader: !!del && !!title && Math.abs(del.getBoundingClientRect().top + del.getBoundingClientRect().height / 2 - (title.getBoundingClientRect().top + title.getBoundingClientRect().height / 2)) <= 8,
      delIconOnly: !!del && del.textContent?.trim() === '' && !!del.querySelector('svg') && del.getAttribute('aria-label') === '刪除任務',
      delLeftOfClose: !!del && (() => { const x = d.querySelector('button[aria-label="關閉"]'); return !!x && del.getBoundingClientRect().right < x.getBoundingClientRect().left })(),
      footer: fbtns.map((b) => b.textContent?.trim()), saveRightmost: fbtns.length > 0 && fbtns.every((b) => b.getBoundingClientRect().right <= document.querySelector('#demo-task-save').getBoundingClientRect().right + 0.5),
    }
  })
  check(`${W} S2 header 一行:「任務 #4821 修正登入逾時」、沒有副標(aria-describedby 空)`, shape.title === '任務 #4821 修正登入逾時' && !shape.describedBy && shape.headerRows === 1, JSON.stringify(shape))
  check(`${W} S2 垃圾桶是 icon-only(aria-label「刪除任務」)、在 header 與關閉 × 同列、在 × 左側(dialog.spec.md「Header actions slot」)`, shape.delIconOnly && shape.delInHeader && shape.delLeftOfClose, JSON.stringify(shape))
  const saveBg = await h.bg('#demo-task-save'), cancelBg = await h.bg('#demo-task-cancel')
  check(`${W} S2 footer 只有「取消」「儲存」;儲存是 primary(底色 ≠ 取消)且最右`, JSON.stringify(shape.footer) === JSON.stringify(['取消', '儲存']) && saveBg !== cancelBg && shape.saveRightmost, JSON.stringify({ footer: shape.footer, saveBg, cancelBg }))

  // ── S3 四個 Field 存檔 → 清單那一列更新 ──
  await page.fill('#demo-task-title', '修正登入逾時(含 SSO)')
  await h.pickOption('[role="combobox"][aria-label="指派人"]', 'Alan Chen')
  await h.pickOption('[role="combobox"][aria-label="狀態"]', '進行中')
  await page.fill('input[role="combobox"][aria-label="截止日"]', '2026-09-20'); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
  const dueTyped = await page.evaluate(() => document.querySelector('input[role="combobox"][aria-label="截止日"]')?.value)
  await h.click('#demo-task-save')
  const rows1 = await h.rows()
  check(`${W} S3 儲存後 modal 關、網址列回清單、那一列更新(標題 / 指派人 / 狀態)`, (await h.dialogs()) === 0 && (await h.location()) === TASKS_URL && rows1.length === 3 && /修正登入逾時\(含 SSO\)/.test(rows1[0]) && /Alan Chen/.test(rows1[0]) && /進行中/.test(rows1[0]), JSON.stringify({ rows1, loc: await h.location() }))
  await h.click('#demo-task-link-4821')
  const reopened = await page.evaluate(() => ({
    title: document.querySelector('#demo-task-title')?.value,
    assignee: document.querySelector('[role="combobox"][aria-label="指派人"]')?.textContent?.trim(),
    status: document.querySelector('[role="combobox"][aria-label="狀態"]')?.textContent?.trim(),
    due: document.querySelector('input[role="combobox"][aria-label="截止日"]')?.value,
  }))
  check(`${W} S3 再開同一張,四個欄位都是存檔後的值(含截止日)`, reopened.title === '修正登入逾時(含 SSO)' && /Alan Chen/.test(reopened.assignee ?? '') && reopened.status === '進行中' && /2026.09.20/.test(reopened.due ?? ''), JSON.stringify({ reopened, dueTyped }))
  await h.click('#demo-task-cancel')

  // ── S4 新增任務 → 清單多一列 ──
  await h.click('#demo-new-task')
  const newShape = await page.evaluate(() => ({ title: document.querySelector('[role="dialog"] h2')?.textContent?.trim(), del: !!document.querySelector('#demo-task-delete'), saveDisabled: document.querySelector('#demo-task-save')?.disabled }))
  check(`${W} S4 新增任務:網址 /tasks/new、header 一行「新增任務」、沒有垃圾桶、標題空白時儲存停用`, (await h.location()) === '/projects/8821/tasks/new' && newShape.title === '新增任務' && !newShape.del && newShape.saveDisabled === true, JSON.stringify(newShape))
  await page.click('#demo-task-title'); await page.keyboard.type('補 QA 環境資訊')
  await h.click('#demo-task-save')
  const rows2 = await h.rows()
  check(`${W} S4 儲存後清單多一列(#4836 補 QA 環境資訊)`, rows2.length === 4 && /#4836/.test(rows2[3]) && /補 QA 環境資訊/.test(rows2[3]) && (await h.location()) === TASKS_URL, JSON.stringify(rows2))

  // ── S5 刪除:確認框(沒有 URL)擋代理;取消恢復;確認少一列 ──
  await h.click('#demo-task-link-4836')
  await h.click('#demo-task-delete')
  check(`${W} S5 垃圾桶開出確認框,疊在任務 modal 上(兩層)`, (await h.dialogs()) === 2)
  await h.typeIntoPanel('X')
  check(`${W} S5 確認框開著時代理被擋(打字無效)`, (await h.panelInput())?.value === 'hello world', JSON.stringify(await h.panelInput()))
  const delBg = await h.bg('#demo-confirm-delete'), delCancelBg = await h.bg('#demo-confirm-cancel')
  check(`${W} S5 確認框「刪除」是 primary + danger(底色 ≠ 取消、≠ 一般 primary 儲存)`, delBg !== delCancelBg && delBg !== saveBg, JSON.stringify({ delBg, delCancelBg, saveBg }))
  await h.click('#demo-confirm-cancel')
  await h.typeIntoPanel('!')
  check(`${W} S5 取消後任務 modal 還在、代理恢復並存、清單不變`, (await h.dialogs()) === 1 && (await h.panelInput())?.value === 'hello world!' && (await h.rows()).length === 4, JSON.stringify(await h.panelInput()))
  await h.click('#demo-task-delete'); await h.click('#demo-confirm-delete')
  const rows3 = await h.rows()
  check(`${W} S5 確認刪除後 modal 全關、清單少一列、網址回清單`, (await h.dialogs()) === 0 && rows3.length === 3 && !rows3.some((r) => /#4836/.test(r)) && (await h.location()) === TASKS_URL, JSON.stringify(rows3))

  // ── S7 session:切換 / 新 session 空狀態 / 歷史當前標記 ──
  const hist0 = await h.history()
  check(`${W} S7 歷史列出 3 個 session,當前標記 = 「登入逾時追蹤」`, hist0.open && hist0.rows.length === 3 && hist0.current.length === 1 && /登入逾時追蹤/.test(hist0.current[0]), JSON.stringify(hist0))
  await h.click('[role="complementary"] button[aria-haspopup="dialog"]')
  await page.click('[role="dialog"][aria-label="歷史對話"] [cmdk-item]:has-text("Q3 客訴分類")'); await page.waitForTimeout(400)
  const switched = { title: await h.panelTitle(), body: await page.evaluate(() => document.querySelector('[role="complementary"]')?.textContent ?? ''), link: await h.$('#demo-link-task-4821') }
  check(`${W} S7 切到「Q3 客訴分類」:標題換、訊息換成該 session 的、原 session 的連結不在`, /Q3 客訴分類/.test(switched.title) && /物流延遲 41%/.test(switched.body) && !switched.link, JSON.stringify({ title: switched.title, link: switched.link }))
  const hist1 = await h.history()
  check(`${W} S7 歷史當前標記跟著移到「Q3 客訴分類」`, hist1.current.length === 1 && /Q3 客訴分類/.test(hist1.current[0]), JSON.stringify(hist1.current))
  await h.click('[role="complementary"] button[aria-label="新對話"]')
  const fresh = await page.evaluate(() => ({ title: document.querySelector('[role="complementary"] button[aria-haspopup="dialog"]')?.textContent?.trim(), empty: /開始第一個對話/.test(document.querySelector('[role="complementary"]')?.textContent ?? ''), plusDisabled: document.querySelector('[role="complementary"] button[aria-label="新對話"]')?.disabled }))
  const hist2 = await h.history()
  check(`${W} S7 「+」開新 session:標題「新對話」、空狀態「開始第一個對話」、+ 停用、歷史仍 3 筆且無當前標記`, fresh.title === '新對話' && fresh.empty && fresh.plusDisabled === true && hist2.rows.length === 3 && hist2.current.length === 0, JSON.stringify({ fresh, hist2 }))
  await h.typeIntoPanel('排 Sprint 25 回顧會'); await page.keyboard.press('Enter'); await page.waitForTimeout(400)
  const hist3 = await h.history()
  check(`${W} S7 送出第一則後才有標題並進歷史(4 筆、當前 = 新標題)`, (await h.panelTitle()).includes('排 Sprint 25 回顧會') && hist3.rows.length === 4 && hist3.current.length === 1 && /排 Sprint 25 回顧會/.test(hist3.current[0]), JSON.stringify({ title: await h.panelTitle(), hist3 }))
  await h.click('[role="complementary"] button[aria-haspopup="dialog"]')
  await page.click('[role="dialog"][aria-label="歷史對話"] [cmdk-item]:has-text("登入逾時追蹤")'); await page.waitForTimeout(400)
  check(`${W} S7 切回舊 session,內容仍在(代理回覆裡的連結回來了)`, (await h.$('#demo-link-task-4821')) && /登入逾時追蹤/.test(await h.panelTitle()))

  // ── S8 關 agent → 遮罩仍在(根因錨) ──
  await h.click('#demo-task-link-4821')
  const maskOpen = await h.mask()
  await h.click('[role="complementary"] button[aria-label="關閉面板"]'); await page.waitForTimeout(300)
  const maskClosed = await h.mask()
  const ratioClosed = maskHoleRatio(maskClosed?.clip)
  check(`${W} S8 關 agent 後遮罩仍在:底色不透明、洞面積 ≤ ${MASK_HOLE_MAX_RATIO * 100}%(舊 bug:入口鈕 Dock 的全舞台圖層被當成洞,ratio=1)`, !!maskClosed && h.alpha(maskClosed.bg) > 0 && ratioClosed.ratio <= MASK_HOLE_MAX_RATIO, JSON.stringify({ open: maskOpen?.clip, closed: maskClosed?.clip, ratio: ratioClosed }))
  check(`${W} S8 關 agent 後 modal 仍開著、可操作(標題欄能聚焦)`, (await h.dialogs()) === 1 && (await page.evaluate(() => { const i = document.querySelector('#demo-task-title'); i?.focus(); return document.activeElement === i })))
  await h.click('button[aria-label="開啟智慧代理"]')
  await h.typeIntoPanel('?')
  check(`${W} S8 由入口鈕重開 agent,並存恢復(草稿仍在、可打字)`, (await h.panelInput())?.value === 'hello world!?', JSON.stringify(await h.panelInput()))
  await h.click('#demo-task-cancel')

  // ── S6 背景位置模式 ──
  await h.click('#demo-link-board')
  check(`${W} S6 代理連結「衝刺看板」→ 宿主切到看板、網址列變、草稿還在(條 C / E)`, (await h.location()) === BOARD_URL && /衝刺看板/.test(await h.stageTitle()) && (await h.panelInput())?.value === 'hello world!?', JSON.stringify({ loc: await h.location(), title: await h.stageTitle() }))
  await h.click('#demo-link-task-4821')
  check(`${W} S6 看板上再點「任務 #4821」→ modal 疊在**看板**上(有來源頁 → 保留來源頁作背景)`, (await h.dialogs()) === 1 && (await h.location()) === TASK_4821 && /衝刺看板/.test(await h.stageTitle()), JSON.stringify({ loc: await h.location(), title: await h.stageTitle() }))
  await h.click('button[aria-label="重新整理"]')
  const afterReload = { loc: await h.location(), title: await h.stageTitle(), dialogs: await h.dialogs(), fab: await h.$('button[aria-label="開啟智慧代理"]') }
  check(`${W} S6 重新整理 = 直接以任務網址進入(沒有來源頁)→ modal 疊在**預設背景頁**(任務清單)上;代理回到初始關閉(條 F)`, afterReload.loc === TASK_4821 && /任務 — 結帳流程改版/.test(afterReload.title) && afterReload.dialogs === 1 && afterReload.fab, JSON.stringify(afterReload))
  await h.click('button[aria-label="上一頁"]')
  check(`${W} S6 上一頁回到看板(歷史保留)`, (await h.location()) === BOARD_URL && /衝刺看板/.test(await h.stageTitle()) && (await h.dialogs()) === 0, await h.location())
  await h.click('button[aria-label="下一頁"]')
  check(`${W} S6 下一頁回到任務網址,仍以預設背景頁承載(重新整理已丟掉來源頁)`, (await h.location()) === TASK_4821 && /任務 — 結帳流程改版/.test(await h.stageTitle()) && (await h.dialogs()) === 1, JSON.stringify({ loc: await h.location(), title: await h.stageTitle() }))
  await h.click('button[aria-label="開啟智慧代理"]')
  check(`${W} S6 重新整理後再開代理是空的新對話(條 F),歷史仍列舊 session`, (await h.panelInput())?.value === '' && (await h.panelTitle()) === '新對話' && (await h.history()).rows.length >= 3, JSON.stringify({ panel: await h.panelInput(), title: await h.panelTitle() }))
  await browser.close()
}

// ── S9 蓋板態(容器 < 1080):工具列可點、Modal 在後方、× 後顯露 ──
{
  const width = 1000
  const { browser, page } = await openStory(width)
  const W = `[${width}px 蓋板]`
  const h = bind(page)
  const mode = await page.evaluate(() => document.querySelector('[role="complementary"]')?.getAttribute('data-agent-panel-mode'))
  check(`${W} S9 面板是蓋板態(data-agent-panel-mode=overlay)`, mode === 'overlay', String(mode))
  check(`${W} S9 蓋板時瀏覽器工具列不被抑制(上一頁 / 網址列)`, (await h.inert('button[aria-label="上一頁"]')) === false && (await h.inert('#demo-location')) === false)
  check(`${W} S9 蓋板時宿主被抑制(新增任務鈕 inert)`, (await h.inert('#demo-new-task')) === true)
  await h.click('#demo-link-board')
  await h.click('button[aria-label="上一頁"]')
  check(`${W} S9 蓋板時上一頁真的點得動(網址列回清單)`, (await h.location()) === TASKS_URL, await h.location())
  await h.click('button[aria-label="下一頁"]')
  await h.click('#demo-link-task-4821')
  const behind = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]'); const p = document.querySelector('[role="complementary"]')
    if (!d || !p) return { d: !!d, p: !!p }
    const r = d.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 20)
    return { d: true, p: true, inert: !!d.closest('[inert]'), hitInPanel: !!hit && p.contains(hit), panelZ: getComputedStyle(p).zIndex, dialogZ: getComputedStyle(d).zIndex, panelOpen: getComputedStyle(p).display !== 'none' }
  })
  check(`${W} S9 agent 點有 URL 的 modal → 抽屜保持開啟,modal 在後方(命中面板、z 面板 > modal)且被抑制(v14 推導第 4 題)`, behind.d && behind.p && behind.panelOpen && behind.hitInPanel && behind.inert && Number(behind.panelZ) > Number(behind.dialogZ) && (await h.location()) === TASK_4821, JSON.stringify(behind))
  await h.click('[role="complementary"] button[aria-label="關閉面板"]')
  const revealed = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]'); if (!d) return { d: false }
    const r = d.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 20)
    const i = document.querySelector('#demo-task-title'); i?.focus()
    return { d: true, inert: !!d.closest('[inert]'), hitInDialog: !!hit && d.contains(hit), focused: document.activeElement === i }
  })
  check(`${W} S9 按 × 收起 agent → modal 顯露、可操作(命中 modal、可聚焦、不 inert)(v14 推導第 5 題)`, revealed.d && !revealed.inert && revealed.hitInDialog && revealed.focused, JSON.stringify(revealed))
  await browser.close()
}

server.close()
const failed = results.filter((r) => !r.ok).length
console.log(failed ? `✗ ${failed} 條失敗` : `✓ 代理整頁示範全部通過(${results.length} 條;1440 / 1180 並排 + 1000 蓋板)`)
process.exit(failed ? 1 : 0)
