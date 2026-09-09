#!/usr/bin/env node
/**
 * Agent 整頁示範閘(story `AgentPanel/展示/UrlRegistryDemo`)—— 2026-09-09 重寫(舞台改 AppShell 主內容 + 蓋板收成入口鈕)
 *
 * v14 條 A/B:內容只要有自己的 URL 就能跟 agent 並存;沒有 URL 的(確認框)是純 modal,agent 被擋。
 * 本閘把示範真的走一遍,兩個並排寬度(1440 / 1180)+ 一個蓋板寬度(900,容器 866 < 960;2026-09-09 斷點 1080 → 960):
 *   S0 舞台 = AppShell 主內容:page header(專案標題 h1)+ tabsSlot(所有任務 / 我的任務,W1 header 不畫 border、TabsList 畫;
 *      W2 tab 左緣 = 標題左緣)+ TabsContent mt-0 + toolbar(搜尋 + 新增任務 primary 在最右、右緣與表格齊)+ DataTable
 *      + 間距(tabs→toolbar 控件、toolbar→表格 = tight)+ 標題欄連結左緣 = 表頭「標題」左緣(C:Button link 內距根因)
 *      + a11y(tablist / tab aria-selected / tabpanel aria-labelledby 指回 tab、表格 aria-label = tab 名)
 *   S1 清單三列(ID / 標題 / 指派人 / 狀態 / 截止日)+ 點標題連結開有 URL 的 modal + 幾何(modal ∩ 面板 = ∅、遮罩 = 舞台)
 *      + Esc 分區(焦點在 agent 內按 Esc 不得跨區關掉舞台的 modal;對照組:焦點在 modal 內 Esc 該關)
 *   S2 header 一行標題 + 垃圾桶 icon-only 在 actions slot;footer 只有取消 / 儲存,儲存 primary 且最右
 *   S3 四個 Field(標題 / 指派人 / 狀態 / 截止日)存檔 → 清單那一列更新(含截止日欄)
 *   S4 新增任務(toolbar primary、有 URL)→ 清單多一列
 *   S5 刪除 → 沒有 URL 的確認框(primary danger)擋住代理、置中於整個模擬視窗;取消恢復並存;確認 → 清單少一列
 *   S6 tab 與背景位置模式:代理連結「我的任務」→ 切 tab、清單篩成自己的;再點任務 → modal 背景是「我的任務」;
 *      重新整理 = 直接以任務網址進入 → 背景是預設的「所有任務」;上一頁 / 下一頁維持
 *   S7 session:歷史列多個 session、當前有標記、可切換、「+」新 session 空狀態、送出後才進歷史、切回內容仍在
 *   S8 關 agent → 遮罩仍在(根因錨:入口鈕 Dock 的 pointer-events-none 全舞台圖層曾被當成洞,遮罩整張被挖空)
 *   S10 入口鈕拖去貼邊再拖回家 → 遮罩只有一個洞、洞心 = 鈕心(2026-09-09 user 抓「拖回原本的地方會在遮罩上挖出另一個圓形的洞」:
 *       洞是飛回家的 250ms 過渡途中那一幀算的,過渡結束沒人重算 —— AD59)
 *   S11 遮罩在時右鍵入口鈕 → 選單留著、並存對話框不關、遮罩仍在(2026-09-09 user 抓「遮罩上的 fab 右鍵無反應」:portal 出去的右鍵選單
 *       被並存守衛當成 focus-outside → 對話框關、遮罩卸載、選單跟著卸載 —— AD59)
 *   S9 蓋板態:工具列可點、宿主被抑制、上一頁 / 下一頁不收合 agent;**agent 點有 URL 的 modal → agent 收成入口鈕、
 *      modal 顯露可操作、焦點在 modal**(2026-09-09 user 推翻「抽屜保持開啟」);入口鈕重開 → 抽屜蓋回、modal 在後方被抑制、
 *      草稿還在;× → modal 顯露;agent 點「我的任務」→ 收成入口鈕、tab 切換、焦點交給舞台 main
 * `--static=<dir>`:讀哪個 storybook build(預設 storybook-static;並行工作者用自己的 build 目錄)
 * `--shots=<dir>`:存截圖(1440 並排開 modal / 900 蓋板前 / 蓋板收成入口鈕後)
 * `--selftest`:對照組 —— 把 S8 的洞判準餵舊 build 實測抓到的壞 clip-path,必須紅。
 */
import http from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const staticArg = arg('static')
const STATIC = staticArg ? (isAbsolute(staticArg) ? staticArg : join(process.cwd(), staticArg)) : join(REPO, 'storybook-static')
const SHOTS = arg('shots')
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }

const TASKS_URL = '/projects/8821/tasks'
const MINE_URL = '/projects/8821/tasks/mine'
const TASK_4821 = '/projects/8821/tasks/4821'

/**
 * 解析 CoexistenceMask 的 `clip-path: path(evenodd, "M0 0H W V H H0Z M x1 y1 H x2 V y2 H x1 Z …")`:
 * 第一個子路徑是外框,其餘是洞。回傳洞面積佔外框面積的比例 —— 洞跟外框一樣大 = 遮罩整張被挖空。
 */
/** 每個子路徑的外接框(第一個是外框,其餘是洞);圓洞算成外接方框。 */
export function maskSubpaths(clip) {
  // 2026-09-09 洞改成「元素可視形狀」(圓角用 A 弧線),所以不再只認 M/H/V/H/Z 矩形:逐子路徑走 M / H / V / L / A 指令算外接框,
  // 面積以外接框計(圓洞算成外接方框,只用來守「洞不得整張挖空」這條上限,略高估無妨)。
  const body = /path\((?:evenodd\s*,\s*)?["']([^"']*)["']\)/.exec(String(clip))?.[1] ?? String(clip)
  return body.split(/(?=M)/).map((sub) => sub.trim()).filter(Boolean).map((sub) => {
    const tokens = sub.match(/[MHVLAZ]|-?[\d.]+/g) ?? []
    let x = 0, y = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cmd = ''
    const mark = () => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]
      if (/[MHVLAZ]/.test(t)) { cmd = t; continue }
      const n = Number(t)
      if (cmd === 'M' || cmd === 'L') { x = n; y = Number(tokens[++i]); mark() }
      else if (cmd === 'H') { x = n; mark() }
      else if (cmd === 'V') { y = n; mark() }
      else if (cmd === 'A') { i += 4; x = Number(tokens[++i]); y = Number(tokens[++i]); mark() } // rx ry rot large sweep x y
    }
    return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 } : null
  }).filter(Boolean)
}
export function maskHoleRatio(clip) {
  const rects = maskSubpaths(clip)
  if (rects.length === 0) return { outer: 0, holes: 0, ratio: NaN }
  const outer = rects[0].w * rects[0].h
  const holes = rects.slice(1).reduce((sum, r) => sum + r.w * r.h, 0)
  return { outer, holes, ratio: outer ? holes / outer : NaN }
}
/** 洞面積不得超過遮罩的 5%(入口鈕的洞 40×40 ≈ 0.2%;整張被挖空 = 100%)。 */
const MASK_HOLE_MAX_RATIO = 0.05
/** S10 判定:遮罩恰有一個洞,且洞心與鈕心(相對遮罩座標)相距 ≤ tol px。 */
export function holeFollowsButton(clip, btnCenter, tol = 2) {
  const holes = maskSubpaths(clip).slice(1)
  if (holes.length !== 1) return { ok: false, holes: holes.length }
  const d = Math.hypot(holes[0].cx - btnCenter.x, holes[0].cy - btnCenter.y)
  return { ok: d <= tol, holes: 1, d: Math.round(d * 10) / 10, hole: [Math.round(holes[0].cx), Math.round(holes[0].cy)], btn: [Math.round(btnCenter.x), Math.round(btnCenter.y)] }
}
/** S11 判定:右鍵後選單在、並存對話框仍恰一個、遮罩仍在。 */
export const menuSurvives = (st) => !!st && st.menu === true && st.dialogs === 1 && st.mask === true

if (process.argv.includes('--selftest')) {
  // 對照組:舊 build 2026-09-09 實測抓到的壞值(洞 = 外框)必須紅;修好後的值(只有入口鈕的洞)必須綠
  const bad = maskHoleRatio('path(evenodd, "M 0 0 H 1406 V 640 H 0 Z M 0 0 H 1406 V 640 H 0 Z")')
  const good = maskHoleRatio('path(evenodd, "M 0 0 H 1406 V 639 H 0 Z M 1350 583 H 1390 V 623 H 1350 Z")')
  const none = maskHoleRatio('path(evenodd, "M 0 0 H 1006 V 639 H 0 Z")')
  // 圓洞(2026-09-09 之後的真實輸出:四段 A 弧線)外接框 40×40 也要算得出來
  const round = maskHoleRatio("path(evenodd, 'M0 0H1406V639H0ZM1370 583H1370A20 20 0 0 1 1390 603V603A20 20 0 0 1 1370 623H1370A20 20 0 0 1 1350 603V603A20 20 0 0 1 1370 583Z')")
  const ok = bad.ratio > MASK_HOLE_MAX_RATIO && good.ratio <= MASK_HOLE_MAX_RATIO && none.ratio === 0 && Math.abs(round.holes - 1600) < 1
  console.log(`${ok ? '✓' : '✗'} selftest:壞 clip(洞 = 外框)ratio=${bad.ratio.toFixed(3)} 判紅;好 clip ratio=${good.ratio.toFixed(4)} 判綠;無洞 ratio=${none.ratio};圓洞外接框 ${round.holes}`)
  // S10 對照組:2026-09-09 實測的壞值 —— 拖回家後洞心停在 (1364.5, 766)、鈕心在 (1387, 847)→ 必紅;洞心 = 鈕心 → 綠;兩個洞 → 紅
  const roundAt = (cx, cy) => `M${cx - 20} ${cy - 20}H${cx - 20}A20 20 0 0 1 ${cx} ${cy - 20}V${cy - 20}A20 20 0 0 1 ${cx + 20} ${cy}H${cx + 20}A20 20 0 0 1 ${cx} ${cy + 20}V${cy + 20}A20 20 0 0 1 ${cx - 20} ${cy}Z`
  const stale = holeFollowsButton(`path(evenodd, "M0 0H1406V900H0Z${roundAt(1364.5, 766)}")`, { x: 1387, y: 847 })
  const fresh = holeFollowsButton(`path(evenodd, "M0 0H1406V900H0Z${roundAt(1387, 847)}")`, { x: 1387, y: 847 })
  const twoHoles = holeFollowsButton(`path(evenodd, "M0 0H1406V900H0Z${roundAt(1364.5, 766)}${roundAt(1387, 847)}")`, { x: 1387, y: 847 })
  // S11 對照組:選單消失 / 對話框關掉 / 遮罩沒了 → 都必紅
  const s11 = menuSurvives({ menu: true, dialogs: 1, mask: true }) && !menuSurvives({ menu: false, dialogs: 1, mask: true }) && !menuSurvives({ menu: true, dialogs: 0, mask: false }) && !menuSurvives(null)
  const ok2 = !stale.ok && fresh.ok && !twoHoles.ok && s11
  console.log(`${ok2 ? '✓' : '✗'} selftest:S10 舊洞(距 ${stale.d}px)判紅、洞心 = 鈕心判綠、兩個洞判紅;S11 選單消失 / 對話框關 / 遮罩沒了判紅`)
  process.exit(ok && ok2 ? 0 : 1)
}

// (靜態)示範原始碼不得對 <DialogContent> 傳 inline style 覆蓋位置(left / top / transform / inset):
// 置中是 Dialog 的事(dialog.tsx `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` 以 portalContainer 為準),
// 消費端手算位置 = 這次 2026-09-09 確認框跑到舞台中心的根因。
{
  const src = readFileSync(join(REPO, 'packages/design-system/src/components/AgentPanel/agent-panel.stories.tsx'), 'utf8')
  const bad = [...src.matchAll(/<DialogContent\b[^>]*?\bstyle=\{[^}]*\b(left|top|transform|inset)\b/gs)].map((m) => m[0].slice(0, 80))
  if (bad.length) { console.error(`✗ 示範對 <DialogContent> 傳 inline 位置樣式(置中是 Dialog 的事):${bad.join(' | ')}`); process.exit(1) }
  console.log('✓ 靜態:示範沒有對 <DialogContent> 傳 inline 位置樣式(置中由 DS Dialog 決定)')
}
if (!existsSync(join(STATIC, 'index.json'))) { console.error(`找不到 ${STATIC}/index.json —— 先 build storybook(或用 --static=<dir> 指定)`); process.exit(2) }
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

// 舞台形狀(S0):header / tabs / toolbar / 表格 的結構、間距、對齊、a11y 一次量完
const SHAPE = `(() => {
  const px = (v) => Number.parseFloat(v) || 0
  const R = (e) => e.getBoundingClientRect()
  const root = getComputedStyle(document.documentElement)
  const tight = px(root.getPropertyValue('--layout-space-tight'))
  const loose = px(root.getPropertyValue('--layout-space-loose'))
  const header = document.querySelector('header')
  const h1 = header?.querySelector('h1')
  const tablist = document.querySelector('[role="tablist"]')
  const tabs = tablist ? [...tablist.querySelectorAll('[role="tab"]')] : []
  const selected = tabs.find((t) => t.getAttribute('aria-selected') === 'true')
  // Radix 把上一個 tab 的 panel 留在 DOM(hidden、無子節點),要挑目前顯示的那個
  const panel = document.querySelector('[role="tabpanel"]:not([hidden])')
  const toolbar = document.querySelector('[data-demo-toolbar]')
  const search = toolbar?.querySelector('input')
  const newBtn = document.querySelector('#demo-new-task')
  const toolbarButtons = toolbar ? [...toolbar.querySelectorAll('button')] : []
  const table = document.querySelector('[role="table"], [role="grid"]')
  const headerCells = [...document.querySelectorAll('[role="columnheader"]')]
  const titleHeader = headerCells.find((c) => c.textContent?.trim() === '標題')
  // 表頭「標題」的文字盒(最深的、文字就是「標題」的元素)
  const deepest = (el) => { let n = el; while (n && n.children.length === 1 && n.children[0].textContent?.trim() === n.textContent?.trim()) n = n.children[0]; return n }
  const titleText = titleHeader ? deepest(titleHeader) : null
  const link = document.querySelector('[role="row"] a[href$="/tasks/4821"]')
  const textLeft = (el) => { if (!el) return NaN; const range = document.createRange(); range.selectNodeContents(el); const r = range.getBoundingClientRect(); return r.left }
  return {
    h1: h1?.textContent?.trim(), h1Tag: h1?.tagName,
    headerBorder: header ? px(getComputedStyle(header).borderBottomWidth) : NaN,
    tablistBorder: tablist ? px(getComputedStyle(tablist).borderBottomWidth) : NaN,
    tabs: tabs.map((t) => t.textContent?.trim()), selected: selected?.textContent?.trim(),
    tabControlsPanel: !!selected && !!panel && selected.getAttribute('aria-controls') === panel.id && panel.getAttribute('aria-labelledby') === selected.id,
    tabLeftEqH1Left: !!tabs[0] && !!h1 && Math.abs(R(tabs[0]).left - R(h1).left) <= 1,
    panelFlushUnderTabs: !!panel && !!tablist && Math.abs(R(panel).top - R(tablist).bottom) <= 1,
    // 間距 owner = toolbar 自帶 py-tight(WithBulkActions 同款):toolbar 上緣貼 TabsList、下緣貼表格,py 就是那兩段 tight
    toolbarPadTop: toolbar ? px(getComputedStyle(toolbar).paddingTop) : NaN,
    toolbarPadBottom: toolbar ? px(getComputedStyle(toolbar).paddingBottom) : NaN,
    toolbarFlushTabs: !!toolbar && !!tablist && Math.abs(R(toolbar).top - R(tablist).bottom) <= 1,
    tableFlushToolbar: !!toolbar && !!table && Math.abs(R(table).top - R(toolbar).bottom) <= 1,
    tight, loose,
    newBtnInToolbar: !!newBtn && !!toolbar && toolbar.contains(newBtn),
    newBtnAboveTable: !!newBtn && !!table && R(newBtn).bottom <= R(table).top + 0.5,
    newBtnRightmost: !!newBtn && toolbarButtons.every((b) => R(b).right <= R(newBtn).right + 0.5),
    newBtnRightEqTableRight: !!newBtn && !!table && Math.abs(R(newBtn).right - R(table).right) <= 1,
    newBtnRightEqH1Right: !!newBtn && !!h1 && Math.abs(R(newBtn).right - R(h1).right) <= 1,
    newBtnBg: newBtn ? getComputedStyle(newBtn).backgroundColor : null,
    searchBg: search ? getComputedStyle(search).backgroundColor : null,
    tableLabel: table?.getAttribute('aria-label'),
    linkIsAnchor: !!link && link.tagName === 'A',
    linkLeft: textLeft(link), titleHeaderLeft: textLeft(titleText),
    headers: headerCells.map((c) => c.textContent?.trim()),
  }
})()`

const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`) }

function bind(page) {
  const $ = (sel) => page.evaluate((s) => !!document.querySelector(s), sel)
  const location = () => page.evaluate(() => { const el = document.querySelector('#demo-location'); return el ? (el.value ?? el.textContent ?? '') : '' })
  const selectedTab = () => page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() ?? '')
  const dialogs = () => page.evaluate(() => document.querySelectorAll('[role="dialog"]').length)
  const panelInput = () => page.evaluate(() => { const p = document.querySelector('[role="complementary"]'); const i = p?.querySelector('textarea, input'); return i ? { value: i.value, inert: !!p.closest('[inert]') || p.getAttribute('aria-hidden') === 'true' } : null })
  const panelOpen = () => page.evaluate(() => { const p = document.querySelector('[role="complementary"]'); return !!p && getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().width > 0 })
  const typeIntoPanel = async (text) => { await page.evaluate(() => { document.querySelector('[role="complementary"]')?.querySelector('textarea, input')?.focus() }); await page.keyboard.type(text); await page.waitForTimeout(80) }
  const click = async (sel) => { await page.click(sel); await page.waitForTimeout(450) }
  const rows = () => page.evaluate(() => [...document.querySelectorAll('[role="row"] a[href*="/tasks/"]')].map((a) => a.closest('[role="row"]')?.textContent ?? ''))
  const panelTitle = () => page.evaluate(() => document.querySelector('[role="complementary"] button[aria-haspopup="dialog"]')?.textContent?.trim() ?? '')
  const inert = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return el ? (!!el.closest('[inert]') || !!el.closest('[aria-hidden="true"]')) : null }, sel)
  const bg = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).backgroundColor : null }, sel)
  const mask = () => page.evaluate(() => { const m = document.querySelector('[data-coexistence-mask]'); return m ? { clip: m.style.clipPath, bg: getComputedStyle(m).backgroundColor } : null })
  const alpha = (color) => { const m = /\/\s*([\d.]+)\)$/.exec(color ?? ''); return m ? Number(m[1]) : (/^rgba?\(/.test(color ?? '') ? (color.match(/[\d.]+/g)?.[3] ?? 1) : 0) }
  const shape = () => page.evaluate(SHAPE)
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
  const shot = async (name) => { if (SHOTS) { const file = join(SHOTS, name); await page.screenshot({ path: file, fullPage: false }); console.log(`  📷 ${file}`) } }
  return { $, location, selectedTab, dialogs, panelInput, panelOpen, typeIntoPanel, click, rows, panelTitle, inert, bg, mask, alpha, shape, history, pickOption, shot }
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

  // ── S0 舞台 = AppShell 主內容 ──
  const s0 = await h.shape()
  check(`${W} S0 header:專案標題 h1「結帳流程改版」(PageHeader = ChromeHeader + tabsSlot)`, s0.h1 === '結帳流程改版' && s0.h1Tag === 'H1', JSON.stringify({ h1: s0.h1, tag: s0.h1Tag }))
  check(`${W} S0 tabs:所有任務 / 我的任務,預設選「所有任務」`, JSON.stringify(s0.tabs) === JSON.stringify(['所有任務', '我的任務']) && s0.selected === '所有任務', JSON.stringify({ tabs: s0.tabs, selected: s0.selected }))
  check(`${W} S0 W1:header 不畫 border-b(0)、TabsList 畫(1)—— 視覺同一條線`, s0.headerBorder === 0 && s0.tablistBorder === 1, JSON.stringify({ header: s0.headerBorder, tablist: s0.tablistBorder }))
  check(`${W} S0 W2:第一個 tab 左緣 = 標題左緣(px-loose 對齊)`, s0.tabLeftEqH1Left)
  check(`${W} S0 W4 / TabsContent mt-0:tabpanel 緊貼 TabsList 下緣`, s0.panelFlushUnderTabs)
  check(`${W} S0 a11y:tablist / tab / aria-selected;選中 tab 的 aria-controls 指向 tabpanel、tabpanel aria-labelledby 指回 tab`, s0.tabControlsPanel)
  check(`${W} S0 toolbar:「新增任務」在 toolbar 內、表格上方、業務層最右(action-bar §二 靠右對齊,primary 最右)`, s0.newBtnInToolbar && s0.newBtnAboveTable && s0.newBtnRightmost, JSON.stringify({ inToolbar: s0.newBtnInToolbar, above: s0.newBtnAboveTable, rightmost: s0.newBtnRightmost }))
  check(`${W} S0 toolbar:「新增任務」是 primary(底色 ≠ 搜尋框)、右緣與表格右緣、標題右緣三者齊(px-loose / mx-loose)`, s0.newBtnBg !== s0.searchBg && s0.newBtnRightEqTableRight && s0.newBtnRightEqH1Right, JSON.stringify({ btn: s0.newBtnBg, search: s0.searchBg, eqTable: s0.newBtnRightEqTableRight, eqH1: s0.newBtnRightEqH1Right }))
  check(`${W} S0 間距:toolbar 上緣貼 TabsList、下緣貼表格,toolbar 自帶 py = tight(${s0.tight})= tabs→toolbar、toolbar→table 兩段(layoutSpace 規則 2 / 3:toolbar↔table 直接功能依賴)`, s0.toolbarFlushTabs && s0.tableFlushToolbar && s0.toolbarPadTop === s0.tight && s0.toolbarPadBottom === s0.tight, JSON.stringify({ flushTabs: s0.toolbarFlushTabs, flushTable: s0.tableFlushToolbar, padTop: s0.toolbarPadTop, padBottom: s0.toolbarPadBottom, tight: s0.tight }))
  check(`${W} S0 C:標題欄是 <a> 連結,文字左緣 = 表頭「標題」文字左緣(DS url 欄同一支 LinkInput view;不是 Button link 的內距)`, s0.linkIsAnchor && Math.abs(s0.linkLeft - s0.titleHeaderLeft) <= 1, JSON.stringify({ isAnchor: s0.linkIsAnchor, linkLeft: s0.linkLeft, headerLeft: s0.titleHeaderLeft }))
  check(`${W} S0 a11y:表格 aria-label = 目前 tab 名(所有任務)`, s0.tableLabel === '所有任務', String(s0.tableLabel))

  // ── S1 清單三列 + 點列開有 URL 的 modal + 幾何 + Esc 分區 ──
  const rows0 = await h.rows()
  check(`${W} S1 清單是 DataTable,三列、五欄 ID / 標題 / 指派人 / 狀態 / 截止日`, rows0.length === 3 && ['ID', '標題', '指派人', '狀態', '截止日'].every((x) => s0.headers.includes(x)), JSON.stringify({ rows: rows0, headers: s0.headers }))
  await h.click('[role="row"] a[href$="/tasks/4821"]')
  check(`${W} S1 點標題連結開了有 URL 的 modal(本分頁,不是 anchor 預設的新分頁),網址列 = 任務 URL`, (await h.dialogs()) === 1 && (await h.location()) === TASK_4821 && page.context().pages().length === 1, await h.location())
  let g = await page.evaluate(GEO)
  check(`${W} S1 對話框不與代理面板相交(v14 條 B 並列可操作)`, !g.missing && !g.intersects, JSON.stringify(g.missing ?? { D: g.D, P: g.P }))
  check(`${W} S1 遮罩 = 舞台矩形(modal 與遮罩只佔宿主面積)`, !g.missing && g.maskEqStage, JSON.stringify(g.missing ?? { M: g.M, S: g.S }))
  check(`${W} S1 對話框置中於舞台`, !g.missing && g.centered)
  check(`${W} S1 面板中心點真的點得到面板(沒被遮罩蓋)`, !g.missing && g.panelHit)
  check(`${W} S1 瀏覽器工具列不被抑制(並存 modal 開著時)`, (await h.inert('button[aria-label="上一頁"]')) === false)
  await h.typeIntoPanel(' world')
  check(`${W} S1 modal 開著時代理面板仍能打字(並存)`, (await h.panelInput())?.value === 'hello world', JSON.stringify(await h.panelInput()))
  if (width === 1440) await h.shot('1440-side-by-side-modal.png')
  await page.evaluate(() => { document.querySelector('[role="complementary"]')?.querySelector('textarea, input')?.focus() })
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  check(`${W} S1 焦點在面板內按 Esc → modal 不關(agent-panel.spec.md 三條表)`, (await h.dialogs()) === 1)
  await page.click('#demo-task-title'); await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  check(`${W} S1 對照組:焦點在 modal 內按 Esc → modal 關`, (await h.dialogs()) === 0 && (await h.location()) === TASKS_URL, await h.location())

  // ── S2 header / footer 形狀 ──
  await h.click('[role="row"] a[href$="/tasks/4821"]')
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
  check(`${W} S3 儲存後 modal 關、網址列回清單、那一列更新(標題 / 指派人 / 狀態 / 截止日)`, (await h.dialogs()) === 0 && (await h.location()) === TASKS_URL && rows1.length === 3 && /修正登入逾時\(含 SSO\)/.test(rows1[0]) && /Alan Chen/.test(rows1[0]) && /進行中/.test(rows1[0]) && /2026-09-20/.test(rows1[0]), JSON.stringify({ rows1, loc: await h.location() }))
  await h.click('[role="row"] a[href$="/tasks/4821"]')
  const reopened = await page.evaluate(() => ({
    title: document.querySelector('#demo-task-title')?.value,
    assignee: document.querySelector('[role="combobox"][aria-label="指派人"]')?.textContent?.trim(),
    status: document.querySelector('[role="combobox"][aria-label="狀態"]')?.textContent?.trim(),
    due: document.querySelector('input[role="combobox"][aria-label="截止日"]')?.value,
  }))
  check(`${W} S3 再開同一張,四個欄位都是存檔後的值(含截止日)`, reopened.title === '修正登入逾時(含 SSO)' && /Alan Chen/.test(reopened.assignee ?? '') && reopened.status === '進行中' && /2026.09.20/.test(reopened.due ?? ''), JSON.stringify({ reopened, dueTyped }))
  await h.click('#demo-task-cancel')

  // ── S4 新增任務(toolbar primary)→ 清單多一列 ──
  await h.click('#demo-new-task')
  const newShape = await page.evaluate(() => ({ title: document.querySelector('[role="dialog"] h2')?.textContent?.trim(), del: !!document.querySelector('#demo-task-delete'), saveDisabled: document.querySelector('#demo-task-save')?.disabled }))
  check(`${W} S4 新增任務:網址 /tasks/new、header 一行「新增任務」、沒有垃圾桶、標題空白時儲存停用`, (await h.location()) === '/projects/8821/tasks/new' && newShape.title === '新增任務' && !newShape.del && newShape.saveDisabled === true, JSON.stringify(newShape))
  await page.click('#demo-task-title'); await page.keyboard.type('補 QA 環境資訊')
  await h.click('#demo-task-save')
  const rows2 = await h.rows()
  check(`${W} S4 儲存後清單多一列(#4836 補 QA 環境資訊)`, rows2.length === 4 && /#4836/.test(rows2[3]) && /補 QA 環境資訊/.test(rows2[3]) && (await h.location()) === TASKS_URL, JSON.stringify(rows2))

  // ── S5 刪除:確認框(沒有 URL)擋代理;取消恢復;確認少一列 ──
  await h.click('[role="row"] a[href$="/tasks/4836"]')
  await h.click('#demo-task-delete')
  check(`${W} S5 垃圾桶開出確認框,疊在任務 modal 上(兩層)`, (await h.dialogs()) === 2)
  // 2026-09-09 user 抓到確認框沒照 Dialog 規格:標題兩行、沒有 body。斷言:標題一行、body 有那筆任務。
  // 同日第二次 user 抓到位置:「他應該在整個模擬視窗中水平垂直置中才對吧?」—— 前一版閘寫「確認框中心 = 任務對話框中心」是我把
  // 「為何會偏移」推導成「對齊任務對話框」的結果(AI 推導,非 user 原話),還加了手算 left 蓋掉 DS 置中。現在:確認框由 DS Dialog
  // 自己置中於它被傳送進的容器 = 整個模擬視窗(`[data-simulated-canvas]`),閘量 x / y 中心都 = 視窗中心(≤ 1px)。
  const cshape = await page.evaluate(() => {
    const ds = [...document.querySelectorAll('[role="dialog"]')]; const confirm = ds[ds.length - 1]
    const canvas = document.querySelector('[data-simulated-canvas]')
    const h2 = confirm.querySelector('h2'); const cs = h2 ? getComputedStyle(h2) : null
    const lh = cs ? parseFloat(cs.lineHeight) : 0; const th = h2 ? h2.getBoundingClientRect().height : 0
    const R = (e) => e.getBoundingClientRect(); const c = R(confirm), v = canvas ? R(canvas) : null
    const mid = (r) => [(r.left + r.right) / 2, (r.top + r.bottom) / 2]
    const [cx, cy] = mid(c); const [vx, vy] = v ? mid(v) : [NaN, NaN]
    return { title: h2?.textContent?.trim() ?? '', titleLines: lh ? Math.round(th / lh) : 0, body: confirm.textContent ?? '', hasCanvas: !!v, dx: +(cx - vx).toFixed(2), dy: +(cy - vy).toFixed(2), inlineLeft: confirm.style.left || '', inlineTop: confirm.style.top || '' }
  })
  check(`${W} S5 確認框標題一行問句(不塞任務名)`, cshape.titleLines === 1 && /確定要刪除這個任務/.test(cshape.title), JSON.stringify(cshape))
  check(`${W} S5 確認框 body 寫明是哪一筆(#4836)與後果`, /#4836/.test(cshape.body) && /無法復原/.test(cshape.body), cshape.body.slice(0, 80))
  check(`${W} S5 確認框水平 + 垂直置中於整個模擬視窗(≤ 1px;遮罩蓋整張畫布含代理)`, cshape.hasCanvas && Math.abs(cshape.dx) <= 1 && Math.abs(cshape.dy) <= 1, `dx=${cshape.dx} dy=${cshape.dy} hasCanvas=${cshape.hasCanvas}`)
  check(`${W} S5 確認框位置由 DS Dialog 決定,消費端沒有 inline left / top 覆蓋`, cshape.inlineLeft === '' && cshape.inlineTop === '', JSON.stringify({ left: cshape.inlineLeft, top: cshape.inlineTop }))
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
  await h.click('[role="row"] a[href$="/tasks/4821"]')
  const maskOpen = await h.mask()
  await h.click('[role="complementary"] button[aria-label="關閉面板"]'); await page.waitForTimeout(300)
  const maskClosed = await h.mask()
  const ratioClosed = maskHoleRatio(maskClosed?.clip)
  check(`${W} S8 關 agent 後遮罩仍在:底色不透明、洞面積 ≤ ${MASK_HOLE_MAX_RATIO * 100}%(舊 bug:入口鈕 Dock 的全舞台圖層被當成洞,ratio=1)`, !!maskClosed && h.alpha(maskClosed.bg) > 0 && ratioClosed.ratio <= MASK_HOLE_MAX_RATIO, JSON.stringify({ open: maskOpen?.clip, closed: maskClosed?.clip, ratio: ratioClosed }))
  check(`${W} S8 關 agent 後 modal 仍開著、可操作(標題欄能聚焦)`, (await h.dialogs()) === 1 && (await page.evaluate(() => { const i = document.querySelector('#demo-task-title'); i?.focus(); return document.activeElement === i })))
  // 2026-09-09 user:「dialog 遮罩不能在視覺上沿著 fab 的形狀?而是切出一個正方形放 fab?」—— 洞要 = 入口鈕的可視形狀(圓),
  // 不是外接方形。斷言用命中測試(clip-path 也裁命中區):方框四角命中的是遮罩(不是鈕)、圓心命中的是鈕;clip 路徑含弧線。
  const hole = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="開啟智慧代理"]'); const mask = document.querySelector('[data-coexistence-mask]')
    if (!btn || !mask) return { missing: true }
    const r = btn.getBoundingClientRect(); const inBtn = (x, y) => { const el = document.elementFromPoint(x, y); return !!el && (btn === el || btn.contains(el)) }
    const corners = [[r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]]
    // 遮罩自己不吃指標(洞外點擊要落到被抑制的宿主 = 「外部點擊」關 modal),所以「洞外」的判準 = 命中的東西跟遠離鈕的對照點一樣。
    const far = document.elementFromPoint(r.left - 80, r.top - 80)
    return { w: r.width, h: r.height, radius: getComputedStyle(btn).borderTopLeftRadius, cornersHitButton: corners.map(([x, y]) => inBtn(x, y)), cornersSameAsFar: corners.map(([x, y]) => document.elementFromPoint(x, y) === far), farIsButton: inBtn(r.left - 80, r.top - 80), centerHitButton: inBtn(r.left + r.width / 2, r.top + r.height / 2), arcs: (mask.style.clipPath.match(/A/g) || []).length }
  })
  check(`${W} S8 遮罩的洞沿著入口鈕的圓形(方框四角 = 洞外,命中與遠處對照點相同、不是鈕;圓心命中鈕;clip 含 4 段弧線)`, !hole.missing && hole.cornersHitButton.every((v) => !v) && hole.cornersSameAsFar.every(Boolean) && !hole.farIsButton && hole.centerHitButton && hole.arcs >= 4, JSON.stringify(hole))
  if (width === 1440) await h.shot('1440-fab-hole.png')

  // ── S10 拖去貼邊再拖回家 → 洞跟著回家(AD59:洞是飛回家的過渡途中算的,過渡結束要重算)──
  const fabCenter = () => page.evaluate(() => { const b = document.querySelector('button[aria-label="開啟智慧代理"]'); const m = document.querySelector('[data-coexistence-mask]'); if (!b || !m) return null; const r = b.getBoundingClientRect(); const mr = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, rx: r.left + r.width / 2 - mr.left, ry: r.top + r.height / 2 - mr.top } })
  const canvas = await page.evaluate(() => document.querySelector('[data-simulated-canvas]')?.getBoundingClientRect().toJSON() ?? null)
  const home = await fabCenter()
  const dragTo = async (from, to) => { await page.mouse.move(from.x, from.y); await page.mouse.down(); for (let i = 1; i <= 12; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / 12, from.y + (to.y - from.y) * i / 12, { steps: 2 }); await page.waitForTimeout(16) } await page.mouse.up(); await page.waitForTimeout(700) }
  let s10 = { skipped: 'no fab / mask / canvas' }
  if (home && canvas) {
    await dragTo(home, { x: canvas.right - 4, y: home.y - 120 })
    const docked = await fabCenter()
    const dockedHole = docked ? holeFollowsButton((await h.mask())?.clip, { x: docked.rx, y: docked.ry }, 3) : { ok: false }
    await dragTo(docked ?? home, home)
    const back = await fabCenter()
    const backHole = back ? holeFollowsButton((await h.mask())?.clip, { x: back.rx, y: back.ry }, 3) : { ok: false }
    s10 = { docked: dockedHole, back: backHole, movedBack: back ? Math.hypot(back.x - home.x, back.y - home.y) <= 4 : false }
  }
  check(`${W} S10 入口鈕貼邊再拖回家:遮罩恰一個洞、洞心 = 鈕心(貼邊時與回家後皆然;舊 bug:回家後洞停在過渡途中、多一個洞)`, !!s10.docked?.ok && !!s10.back?.ok && s10.movedBack === true, JSON.stringify(s10))
  if (width === 1440) await h.shot('1440-fab-hole-after-dock-undock.png')

  // ── S11 遮罩在時右鍵入口鈕 → 選單留著、對話框不關、遮罩仍在(AD59:portal 出去的浮層要被並存守衛認成保留區)──
  const fabNow = await fabCenter()
  let s11 = null
  if (fabNow) {
    await page.mouse.click(fabNow.x, fabNow.y, { button: 'right' }); await page.waitForTimeout(600)
    s11 = await page.evaluate(() => { const m = document.querySelector('[role="menu"]'); return { menu: !!m && getComputedStyle(m).visibility !== 'hidden' && m.getBoundingClientRect().width > 0, items: m ? m.querySelectorAll('[role="menuitem"]').length : 0, dialogs: document.querySelectorAll('[role="dialog"]').length, mask: !!document.querySelector('[data-coexistence-mask]') } })
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  }
  check(`${W} S11 遮罩在時右鍵入口鈕:選單留著(600ms 後)、並存對話框仍開、遮罩仍在(舊 bug:選單一聚焦就被當成點到框外,對話框與選單一起消失)`, menuSurvives(s11) && (await h.dialogs()) === 1, JSON.stringify(s11))

  await h.click('button[aria-label="開啟智慧代理"]')
  await h.typeIntoPanel('?')
  check(`${W} S8 由入口鈕重開 agent,並存恢復(草稿仍在、可打字)`, (await h.panelInput())?.value === 'hello world!?', JSON.stringify(await h.panelInput()))
  await h.click('#demo-task-cancel')

  // ── S6 tab + 背景位置模式 ──
  await h.click('#demo-link-mine')
  const mineRows = await h.rows()
  const s6 = await h.shape()
  check(`${W} S6 代理連結「我的任務」→ 切 tab(aria-selected)、網址列 /tasks/mine、清單只剩指派給自己的(#4835)、表格 aria-label 跟著換、草稿還在(條 C / E;並排態代理維持開啟)`, (await h.location()) === MINE_URL && (await h.selectedTab()) === '我的任務' && mineRows.length === 1 && /#4835/.test(mineRows[0]) && s6.tableLabel === '我的任務' && s6.tabControlsPanel && (await h.panelInput())?.value === 'hello world!?' && (await h.panelOpen()), JSON.stringify({ loc: await h.location(), tab: await h.selectedTab(), mineRows, label: s6.tableLabel, tabControlsPanel: s6.tabControlsPanel, panel: await h.panelInput(), open: await h.panelOpen() }))
  // 2026-09-09 user:「agent 給的任務要包括 #4830,這樣我才能驗證我在我的任務開啟它的時候,背景是否仍停留在我的任務」—— #4830 是 Alan 的,不在「我的任務」清單裡
  await h.click('#demo-link-task-4830')
  const mineUnder4830 = await h.rows()
  check(`${W} S6 「我的任務」上點代理的「任務 #4830」(不在這個清單裡)→ modal 疊在**我的任務**上、網址 /tasks/4830、底下清單仍是自己的(沒有 #4830 列)`, (await h.dialogs()) === 1 && (await h.location()) === '/projects/8821/tasks/4830' && (await h.selectedTab()) === '我的任務' && !mineUnder4830.some((r) => /#4830/.test(r)), JSON.stringify({ loc: await h.location(), tab: await h.selectedTab(), rows: mineUnder4830 }))
  await page.keyboard.press('Escape')
  check(`${W} S6 關掉 #4830 後回到「我的任務」`, (await h.dialogs()) === 0 && (await h.location()) === MINE_URL, await h.location())
  await h.click('#demo-link-task-4821')
  check(`${W} S6 「我的任務」上再點「任務 #4821」→ modal 疊在**我的任務**上(有來源頁 → 保留來源頁作背景)`, (await h.dialogs()) === 1 && (await h.location()) === TASK_4821 && (await h.selectedTab()) === '我的任務', JSON.stringify({ loc: await h.location(), tab: await h.selectedTab() }))
  await h.click('button[aria-label="重新整理"]')
  const afterReload = { loc: await h.location(), tab: await h.selectedTab(), dialogs: await h.dialogs(), fab: await h.$('button[aria-label="開啟智慧代理"]') }
  check(`${W} S6 重新整理 = 直接以任務網址進入(沒有來源頁)→ modal 疊在**預設背景頁**(所有任務)上;代理回到初始關閉(條 F)`, afterReload.loc === TASK_4821 && afterReload.tab === '所有任務' && afterReload.dialogs === 1 && afterReload.fab, JSON.stringify(afterReload))
  await h.click('button[aria-label="上一頁"]')
  check(`${W} S6 上一頁回到「我的任務」(歷史保留)`, (await h.location()) === MINE_URL && (await h.selectedTab()) === '我的任務' && (await h.dialogs()) === 0, await h.location())
  await h.click('button[aria-label="下一頁"]')
  check(`${W} S6 下一頁回到任務網址,仍以預設背景頁承載(重新整理已丟掉來源頁)`, (await h.location()) === TASK_4821 && (await h.selectedTab()) === '所有任務' && (await h.dialogs()) === 1, JSON.stringify({ loc: await h.location(), tab: await h.selectedTab() }))
  await h.click('button[aria-label="開啟智慧代理"]')
  check(`${W} S6 重新整理後再開代理是空的新對話(條 F),歷史仍列舊 session`, (await h.panelInput())?.value === '' && (await h.panelTitle()) === '新對話' && (await h.history()).rows.length >= 3, JSON.stringify({ panel: await h.panelInput(), title: await h.panelTitle() }))
  await browser.close()
}

// ── S9 蓋板態(容器 < 1080):工具列可點、從代理導向舞台 → 收成入口鈕、重開蓋回、× 顯露 ──
{
  const width = 900
  const { browser, page } = await openStory(width)
  const W = `[${width}px 蓋板]`
  const h = bind(page)
  const mode = await page.evaluate(() => document.querySelector('[role="complementary"]')?.getAttribute('data-agent-panel-mode'))
  check(`${W} S9 面板是蓋板態(data-agent-panel-mode=overlay)`, mode === 'overlay', String(mode))
  check(`${W} S9 蓋板時瀏覽器工具列不被抑制(上一頁 / 網址列)`, (await h.inert('button[aria-label="上一頁"]')) === false && (await h.inert('#demo-location')) === false)
  check(`${W} S9 蓋板時宿主被抑制(新增任務鈕 inert)`, (await h.inert('#demo-new-task')) === true)
  await h.typeIntoPanel('draft')
  await h.shot('900-overlay-before.png')
  // 瀏覽器 chrome 的上一頁 / 下一頁不是「代理內的動作」:宿主依歷史導航、agent 維持開啟(v14 推導表「同分頁在宿主內按上一頁 / 下一頁」)
  await h.click('#demo-link-mine')
  const collapsedByPage = { open: await h.panelOpen(), fab: await h.$('button[aria-label="開啟智慧代理"]'), loc: await h.location(), tab: await h.selectedTab(), focusMain: await page.evaluate(() => document.activeElement?.id === 'demo-stage-main'), mainInert: await h.inert('#demo-stage-main') }
  check(`${W} S9 agent 點內部另一頁(我的任務)→ agent 收成入口鈕、tab 切換、宿主解除抑制、焦點交給舞台 main(v14 推導表「窄螢幕(蓋板),agent 點內部另一頁」)`, !collapsedByPage.open && collapsedByPage.fab && collapsedByPage.loc === MINE_URL && collapsedByPage.tab === '我的任務' && collapsedByPage.focusMain && collapsedByPage.mainInert === false, JSON.stringify(collapsedByPage))
  await h.click('button[aria-label="開啟智慧代理"]')
  check(`${W} S9 入口鈕重開 → 蓋板回來、草稿還在(收成不是卸載)`, (await h.panelOpen()) && (await h.panelInput())?.value === 'draft' && (await page.evaluate(() => document.querySelector('[role="complementary"]')?.getAttribute('data-agent-panel-mode'))) === 'overlay', JSON.stringify(await h.panelInput()))
  await h.click('button[aria-label="上一頁"]')
  check(`${W} S9 蓋板時上一頁真的點得動(網址列回清單),且 agent 不因瀏覽器 chrome 導航收合`, (await h.location()) === TASKS_URL && (await h.panelOpen()), await h.location())
  await h.click('#demo-link-task-4821')
  const collapsedByModal = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]'); const p = document.querySelector('[role="complementary"]')
    const fab = document.querySelector('button[aria-label="開啟智慧代理"]')
    if (!d || !p) return { d: !!d, p: !!p }
    const r = d.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 20)
    return { d: true, p: true, panelOpen: getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().width > 0, fab: !!fab, fabInert: !!fab?.closest('[inert]'), dialogInert: !!d.closest('[inert]'), hitInDialog: !!hit && d.contains(hit), focusInDialog: !!document.activeElement && d.contains(document.activeElement), tab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim() }
  })
  check(`${W} S9 agent 點有 URL 的 modal → agent 收成入口鈕,modal 顯露、可操作(命中 modal、不 inert、焦點在 modal 內)、入口鈕不 inert、背景 = 所有任務(v14 推導表「窄螢幕,agent 點有 URL 的 Modal」,2026-09-09)`, collapsedByModal.d && collapsedByModal.p && !collapsedByModal.panelOpen && collapsedByModal.fab && !collapsedByModal.fabInert && !collapsedByModal.dialogInert && collapsedByModal.hitInDialog && collapsedByModal.focusInDialog && collapsedByModal.tab === '所有任務' && (await h.location()) === TASK_4821, JSON.stringify(collapsedByModal))
  await h.shot('900-overlay-after-collapse.png')
  await h.click('button[aria-label="開啟智慧代理"]')
  const reopened = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]'); const p = document.querySelector('[role="complementary"]')
    if (!d || !p) return { d: !!d, p: !!p }
    const r = d.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 20)
    return { d: true, p: true, inert: !!d.closest('[inert]'), hitInPanel: !!hit && p.contains(hit), panelZ: getComputedStyle(p).zIndex, dialogZ: getComputedStyle(d).zIndex, panelOpen: getComputedStyle(p).display !== 'none' }
  })
  check(`${W} S9 入口鈕重開 → 抽屜蓋回舞台,modal 在後方(命中面板、z 面板 > modal)且被抑制;草稿還在(v14 推導表「接上題,點入口鈕重開 agent」)`, reopened.d && reopened.p && reopened.panelOpen && reopened.hitInPanel && reopened.inert && Number(reopened.panelZ) > Number(reopened.dialogZ) && (await h.panelInput())?.value === 'draft', JSON.stringify(reopened))
  await h.click('[role="complementary"] button[aria-label="關閉面板"]')
  const revealed = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]'); if (!d) return { d: false }
    const r = d.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 20)
    const i = document.querySelector('#demo-task-title'); i?.focus()
    return { d: true, inert: !!d.closest('[inert]'), hitInDialog: !!hit && d.contains(hit), focused: document.activeElement === i }
  })
  check(`${W} S9 再按 × 收起 agent → modal 顯露、可操作(命中 modal、可聚焦、不 inert)`, revealed.d && !revealed.inert && revealed.hitInDialog && revealed.focused, JSON.stringify(revealed))
  await browser.close()
}

server.close()
const failed = results.filter((r) => !r.ok).length
console.log(failed ? `✗ ${failed} 條失敗` : `✓ 代理整頁示範全部通過(${results.length} 條;1440 / 1180 並排 + 900 蓋板)`)
process.exit(failed ? 1 : 0)
