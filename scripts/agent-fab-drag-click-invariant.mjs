#!/usr/bin/env node
/**
 * AgentFab 拖曳 ≠ 點擊不變條件(2026-09-16,user:「拖拉 agent panel 的 fab 很容易一不小心就開啟 panel,但我明明就只是要移動它而已」)。
 *
 * SSOT:agent-panel.spec.md「入口鈕」段「拖曳(≥ 8px)放開不得開面板,且不得依賴事件時序」。
 * 根因:拖曳放開後瀏覽器對同一顆鈕補發 click;舊版用 setTimeout(0) 清「吞下一個 click」旗標,只要 click 比 pointerup 晚一個 task 送達
 *(遠端隔離 / 輸入代理環境),旗標已清、click 漏過去 → 面板被打開。本機 Chromium 兩者同一 task(0ms),所以真滑鼠重現不了;
 * 這支閘用 DOM 事件直接造出「晚到的 click」。
 *
 * 四個情境(Fab story,1600×800):
 *   P  正對照:真點一下 → 面板必開(否則儀器瞎了)
 *   D  真拖 20px(down / 10 步 move / up)→ 面板不開、鈕已移動
 *   L  晚到的 click:真 down / move 20px,**合成** pointerup(同 pointerId)讓引擎收尾,100ms 後**合成** click(detail 1)→ 必被吞、面板不開;
 *      之後把滑鼠移離鈕再真放開(避免真 click 落在鈕上)
 *   K  拖完立刻鍵盤 Enter → 面板必開(鍵盤合成 click 不吞)
 * 對照組(--selftest):情境 L 在晚到的 click 之前先合成一個 pointerdown(新手勢 = 旗標清掉)→ 面板必開 → 儀器判紅。
 * 用法:node scripts/agent-fab-drag-click-invariant.mjs [--static=<dir>] [--selftest]
 */
import fs from 'node:fs'; import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { gotoStory, launchBrowser } from './lib/launch-browser.mjs'
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
const root = path.resolve(REPO, arg('static', 'storybook-static'))
if (!fs.existsSync(path.join(root, 'index.json'))) { console.error(`找不到 ${root}/index.json —— 先 build storybook`); process.exit(2) }
if (fs.statSync(path.join(REPO, 'packages/design-system/src/components/AgentPanel/agent-panel-fab.tsx')).mtimeMs > fs.statSync(path.join(root, 'index.html')).mtimeMs) {
  console.error(`✗ STALE-BUILD:agent-panel-fab.tsx 比 ${root} 新 —— 先重建該 storybook build`); process.exit(2)
}
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
const STORY = 'design-system-components-agentpanel-展示--fab'
const browser = await launchBrowser(); const page = await browser.newPage({ viewport: { width: 1600, height: 800 } })
let failed = 0
const rec = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++ }
const FAB = 'button[aria-label*="開啟智慧代理"]'
const open = () => page.evaluate(() => { const p = document.querySelector('[role="complementary"]'); return !!p && getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().width > 0 })
const fabBox = async () => { const b = await page.locator(FAB).first().boundingBox(); if (!b) throw new Error('找不到入口鈕'); return b }
// 等入口鈕本身出現再量:固定睡眠只是「已渲染」的代理,慢的 runner 上會變成 fabBox() 丟「找不到入口鈕」
// —— 指控一個不存在的問題(2026-09-20 action-bar 閘在 CI 真的這樣假紅過)。
const fresh = async () => { await gotoStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, { waitFor: FAB, settle: 700 }) }
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const dragMoves = async (from, dx, dy, steps = 10) => { for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + dx * i / steps, from.y + dy * i / steps) }

// P 正對照
await fresh(); { const c = center(await fabBox()); await page.mouse.click(c.x, c.y); await page.waitForTimeout(600); rec(await open(), 'P 正對照:真點一下 → 面板開') }
// D 真拖 20px
await fresh(); { const b0 = await fabBox(); const c = center(b0); await page.mouse.move(c.x, c.y); await page.mouse.down(); await dragMoves(c, -20, -20); await page.mouse.up(); await page.waitForTimeout(600)
  const b1 = await fabBox().catch(() => null); const moved = b1 ? Math.hypot(b1.x - b0.x, b1.y - b0.y) : NaN
  rec(!(await open()), `D 真拖 20px 放開 → 面板不開(鈕位移 ${Number.isFinite(moved) ? Math.round(moved) : '?'}px;帶外放開會飛回家 = 0 也正常)`) }
// L 晚到的 click(根因路徑)
await fresh(); {
  const c = center(await fabBox()); await page.mouse.move(c.x, c.y); await page.mouse.down(); await dragMoves(c, -20, -20)
  const r = await page.evaluate(async ({ sel, sabotage, x, y }) => {
    const btn = document.querySelector(sel)
    const ev = (type, init) => btn.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 0, ...init }))
    // 合成 pointerup(同 pointerId 1 = Playwright 滑鼠):引擎收尾、旗標上膛;瀏覽器不會因此補發 click
    ev('pointerup', {})
    await new Promise((res) => setTimeout(res, 100))
    if (sabotage) ev('pointerdown', { buttons: 1 }) // 對照組:新手勢開始 = 旗標清掉 → 晚到的 click 會漏過去
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, detail: 1, clientX: x, clientY: y, button: 0 }))
    await new Promise((res) => setTimeout(res, 300))
    const p = document.querySelector('[role="complementary"]')
    return { opened: !!p && getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().width > 0 }
  }, { sel: FAB, sabotage: SELFTEST, x: c.x - 20, y: c.y - 20 })
  // 收尾:把真滑鼠移離鈕再放開,真 click 不落在鈕上
  await page.mouse.move(40, 40); await page.mouse.up(); await page.waitForTimeout(300)
  if (SELFTEST) rec(r.opened, `selftest 對照組:晚到的 click 之前先合成 pointerdown(旗標清掉)→ 面板必開(儀器會紅)| opened=${r.opened}`)
  else rec(!r.opened, `L 拖 20px、pointerup 後 100ms 才到的 click → 被吞、面板不開(舊版 setTimeout(0) 在此漏)| opened=${r.opened}`)
}
// Z 0 個 pointermove、放開在 80px 外(輸入代理把中途事件丟掉的形狀;舊版把它當點擊 → 開面板)
if (!SELFTEST) { await fresh(); {
  const c = center(await fabBox())
  const r = await page.evaluate(async ({ sel, x0, y0 }) => {
    const btn = document.querySelector(sel)
    const ev = (type, x, y, init) => btn.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: 0, ...init }))
    ev('pointerdown', x0, y0, { buttons: 1 })
    await new Promise((res) => setTimeout(res, 50))
    ev('pointerup', x0 - 80, y0 - 80, { buttons: 0 }) // 沒有任何 pointermove
    await new Promise((res) => setTimeout(res, 30))
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, detail: 1, clientX: x0 - 80, clientY: y0 - 80, button: 0 })) // 瀏覽器補發的 click(pointer capture 指回鈕上)
    await new Promise((res) => setTimeout(res, 400))
    const p = document.querySelector('[role="complementary"]')
    return { opened: !!p && getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().width > 0 }
  }, { sel: FAB, x0: c.x, y0: c.y })
  rec(!r.opened, `Z 0 個 pointermove、放開在 80px 外 + 補發 click → 判成拖曳、面板不開 | opened=${r.opened}`) } }
// K 拖完鍵盤 Enter
if (!SELFTEST) { await fresh(); { const c = center(await fabBox()); await page.mouse.move(c.x, c.y); await page.mouse.down(); await dragMoves(c, -20, -20); await page.mouse.up(); await page.waitForTimeout(400)
  await page.locator(FAB).first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(600)
  rec(await open(), 'K 拖完立刻鍵盤 Enter → 面板開(鍵盤合成 click detail 0 不吞)') } }
await browser.close(); await server.stop()
console.log(failed ? `✗ agent-fab-drag-click ${failed} 條失敗` : (SELFTEST ? '✓ selftest:對照組讓儀器紅,量具有效' : '✅ agent-fab-drag-click PASS(拖曳 ≠ 點擊,且不依賴事件時序)'))
process.exit(failed ? 1 : 0)
