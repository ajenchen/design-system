#!/usr/bin/env node
/**
 * DataTable 釘選欄拖拉欄寬:面板寬必須跟著欄寬即時變、放開後一致(2026-09-09;user:「釘選欄位的欄寬調整功能被你搞壞了…
 * 拖拉沒有在 ui 上及時反應回饋之外,有時甚至不會生效,實際拖拉的寬度跟視覺上顯示的完全對不起來」)。
 *
 * 根因:f3fe9f2e 把面板寬改成「欄寬相加算出來」,但 memo 依賴沒列入 columnSizing 狀態(欄陣列身分不變)→ 拖拉中與放開後
 * 面板寬停在舊值,長出來的欄被面板裁掉。main 的面板寬 140 → 220 跟著長;分支卡在 140。
 *
 * 量法:在「專案排程全功能整合」拖左釘選面板最後一欄(ID)的把手 +80px(每 20px 量一次):
 *   R1 拖拉中每一步:表頭面板寬 = 左面板欄寬總和;body 面板寬 = 同值;中央表頭 / body 的左緣 = 面板右緣(±1px);
 *   R2 放開後:同上,且表頭格寬 = 起始 + 80。
 *   R3(2026-09-10,AD63)中央區非邊界欄的把手:欄界左 2px 與右 2px 用 elementFromPoint 都要命中把手 —— 7px 命中區
 *     外側 3px 不得被自己格的 overflow:hidden 裁掉、也不得被 DOM 順序在後的鄰格蓋住(main 上右半不可點)。
 * `--selftest`:注入 `[data-datatable-header-panel="left"]{width:140px!important}` 讓面板寬凍住 → R1 / R2 必須紅;R3 的兩種破法
 *   (`[role="columnheader"]{overflow:hidden}` / `[role="separator"]{z-index:auto}`)**分開各注入一次**,各自都必須讓右 2px 打不到把手。
 *   node scripts/data-table-pinned-resize-invariant.mjs [--static=<dir>] [--selftest]
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, dirname, extname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './lib/launch-browser.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const SELFTEST = process.argv.includes('--selftest')
const staticArg = arg('static')
const STATIC = staticArg ? (isAbsolute(staticArg) ? staticArg : join(process.cwd(), staticArg)) : join(REPO, 'storybook-static')
const STORY = arg('story') ?? 'design-system-components-datatable-展示--roadmap-all-in-one'
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
if (!existsSync(join(STATIC, 'index.json'))) { console.error(`找不到 ${STATIC}/index.json —— 先 build storybook`); process.exit(2) }
const srcM = statSync(join(REPO, 'packages/design-system/src/components/DataTable/data-table.tsx')).mtimeMs
if (!staticArg && statSync(join(STATIC, 'index.json')).mtimeMs < srcM) { console.error('✗ storybook-static 比 data-table.tsx 舊,先重建'); process.exit(2) }
const server = createServer((req, res) => {
  const p = join(STATIC, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'iframe.html')
  if (!existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p))
}).listen(0)
const port = server.address().port
let fail = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' | ' + detail : ''}`); if (!ok) fail++ }
const browser = await launchBrowser()
const page = await (await browser.newContext({ viewport: { width: 1400, height: 800 } })).newPage()
await page.goto(`http://localhost:${port}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story`, { waitUntil: 'load' })
await page.waitForSelector('[data-datatable-hscroll] [role="row"]', { timeout: 20000 }); await page.waitForTimeout(600)
if (SELFTEST) await page.addStyleTag({ content: '[data-datatable-header-panel="left"]{width:140px!important}[data-datatable-panel="left"]{width:140px!important}' })
const snap = () => page.evaluate(() => {
  const hp = document.querySelector('[data-datatable-header-panel="left"]'); const bp = document.querySelector('[data-datatable-panel="left"]')
  const heads = [...hp.querySelectorAll('[role="columnheader"]')]; const sum = heads.reduce((a, h) => a + h.getBoundingClientRect().width, 0)
  const last = heads[heads.length - 1]; const sep = last.querySelector('[role="separator"]'); const sr = sep.getBoundingClientRect()
  const ch = document.querySelector('[data-datatable-header-panel="center"]'); const cb = document.querySelector('[data-datatable-panel="center"]')
  return { sx: sr.left + sr.width / 2, sy: sr.top + sr.height / 2, lastW: last.getBoundingClientRect().width, sum, hpW: hp.getBoundingClientRect().width, bpW: bp.getBoundingClientRect().width, hpRight: hp.getBoundingClientRect().right, centerHeaderLeft: ch.getBoundingClientRect().left, centerBodyLeft: cb.getBoundingClientRect().left }
})
const ok = (s) => Math.abs(s.hpW - s.sum) <= 1 && Math.abs(s.bpW - s.sum) <= 1 && Math.abs(s.centerHeaderLeft - s.hpRight) <= 1 && Math.abs(s.centerBodyLeft - s.hpRight) <= 1
const s0 = await snap()
check('R0 起始:面板寬 = 欄寬總和、中央區左緣 = 面板右緣', ok(s0), JSON.stringify({ hpW: s0.hpW, bpW: s0.bpW, sum: s0.sum }))
await page.mouse.move(s0.sx - 2, s0.sy); await page.mouse.down()
const steps = []
for (let i = 1; i <= 4; i++) { await page.mouse.move(s0.sx - 2 + i * 20, s0.sy, { steps: 4 }); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); const s = await snap(); steps.push({ dx: i * 20, lastW: Math.round(s.lastW), sum: Math.round(s.sum), hpW: Math.round(s.hpW), bpW: Math.round(s.bpW), centerLeft: Math.round(s.centerBodyLeft), ok: ok(s) }) }
const liveOk = steps.every((x) => x.ok) && steps[3].lastW >= s0.lastW + 70
check('R1 拖拉中每一步:面板寬與中央區左緣即時跟著欄寬變', SELFTEST ? !liveOk : liveOk, JSON.stringify(steps))
await page.mouse.up(); await page.waitForTimeout(400); const s1 = await snap()
// R3:中央區第一個「右邊還有欄」的可調欄,欄界兩側各 2px 都必須打到把手(或它的 1px 線)
const hitAt = () => page.evaluate(() => {
  const heads = [...document.querySelectorAll('[data-datatable-header-panel="center"] [role="columnheader"]')]
  const i = heads.findIndex((h, k) => h.querySelector('[role="separator"][aria-orientation="vertical"]') && k < heads.length - 1 && heads[k + 1].getBoundingClientRect().width > 0)
  if (i < 0) return { error: '中央區找不到「右邊還有欄」的可調欄' }
  const h = heads[i]; const sep = h.querySelector('[role="separator"]'); const r = sep.getBoundingClientRect(); const edge = Math.round(h.getBoundingClientRect().right)
  const y = r.top + r.height / 2
  const at = (x) => { const el = document.elementFromPoint(x, y); return el === sep || sep.contains(el) }
  return { col: h.textContent.trim().slice(0, 16), edge, left: at(edge - 2), right: at(edge + 2), zone: [Math.round(r.left), Math.round(r.right)] }
})
if (SELFTEST) {
  // 兩種破法分開驗:合在一起注入時任一種失效都會被另一種遮住(多代理審查 P2)
  for (const [name, css] of [['overflow:hidden', '[role="columnheader"]{overflow:hidden!important}'], ['z-index:auto', '[role="separator"]{z-index:auto!important}']]) {
    const tag = await page.addStyleTag({ content: css }); const h = await hitAt(); await tag.evaluate((e) => e.remove())
    check(`R3 對照組:注入 ${name} 時右 2px 必須打不到把手`, !h.error && h.left && !h.right, JSON.stringify(h))
  }
} else {
  const hit = await hitAt()
  check('R3 把手命中區跨欄界兩側皆可點(左 2px / 右 2px 都打到把手)', !hit.error && hit.left && hit.right, JSON.stringify(hit))
}
const finalOk = ok(s1) && Math.abs(s1.lastW - (s0.lastW + 80)) <= 2
check('R2 放開後:欄寬 = 起始 + 80,面板寬與中央區左緣一致', SELFTEST ? !finalOk : finalOk, JSON.stringify({ lastW: s1.lastW, expected: s0.lastW + 80, hpW: s1.hpW, bpW: s1.bpW, sum: s1.sum, centerLeft: s1.centerBodyLeft, hpRight: s1.hpRight }))
await browser.close(); server.close()
console.log(fail ? `\n✗ ${fail} 項未通過` : `\n✓ ${SELFTEST ? '對照組:面板寬凍住 / 把手被裁時 R1 / R2 / R3 如預期變紅(儀器有效)' : '釘選欄拖拉欄寬:面板寬即時跟動、放開後一致;把手兩側可點,全通過'}`)
process.exit(fail ? 1 : 0)
