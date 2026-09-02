#!/usr/bin/env node
/**
 * agent-logo-continuity-invariant — AgentLogo 思考動畫「有始有終、一氣呵成」機械驗證(spec「AgentLogo」節)。
 *
 * 在真實瀏覽器(Playwright Chromium,前景 rAF 可跑)載入 storybook-static 的「標誌:思考起步與減速停止」,
 * 按下「思考 3 秒」後逐影格(rAF)取樣四個通道:本體角度、色場角度、負空間形狀(與定稿形距離)、亮度疊層不透明度,
 * 直到回到靜止。判定:
 *   C1 起點=終點:靜止 → 思考起步、減速停定 → 靜止,四通道逐一相等(角度 mod 360、形狀距離 0、疊層 0)。
 *   C2 無跳幀:相鄰影格的角度差 ≤ 每影格最大位移(480°/s ÷ 實際 fps)× 1.5;形狀/亮度差 ≤ 容差。
 *   C3 減速起點基底 = 當下角度:SpinDecel 起跑前一影格的 <g transform> 與 <linearGradient gradientTransform> 基底
 *      等於離開思考瞬間的角度(否則會先閃回 0°)。
 *   C4 still ↔ think 交接不掛 agent-logo-enter(淡入只給招喚)。
 *   C6 減速段沒有孤兒動畫:begin="indefinite" 的 animate 掛上後必被 beginElement(getStartTime 不丟例外);
 *      2026-09-03 deploy-preview 逐格實測:洞形變 / 亮度淡出 7 個 animate 全 unresolved → 整段減速洞持圓、停定瞬間跳橢圓。
 * 沙箱起不了 Chromium → SKIPPED-ENV(exit 0),請在可開瀏覽器的環境(CI)補驗。
 */
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const STATIC = join(ROOT, 'storybook-static')
if (!existsSync(STATIC)) {
  console.error('✗ storybook-static missing. Run `npm run build-storybook` first.')
  process.exit(1)
}
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'
  const fp = join(STATIC, p); if (!existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' }); res.end(readFileSync(fp))
})
await new Promise((r) => server.listen(0, r))
const BASE = `http://localhost:${server.address().port}`

let browser
try {
  browser = await chromium.launch({ headless: true })
} catch (error) {
  console.error(`⚠️  SKIPPED-ENV: 無法啟動 Chromium(${String(error?.message || error).split('\n')[0]})`)
  console.error('   此環境(受限沙箱)結構上無法跑 browser invariant;請於可開瀏覽器環境執行 npm run test:agent-panel-invariants 補驗。')
  server.close(); process.exit(0)
}
const page = await browser.newPage({ viewport: { width: 900, height: 600 } })
await page.goto(`${BASE}/iframe.html?id=design-system-components-agentpanel-展示--logo-think-stop&viewMode=story`, { waitUntil: 'networkidle' })
await page.waitForSelector('svg')

const result = await page.evaluate(async () => {
  const svg = () => document.querySelector('svg')
  const norm = (s) => (s || '').replace(/path\("|"\)/g, '').replace(/[^\d.\- ]/g, ' ').trim().split(/\s+/).map(Number)
  const dist = (x, y) => { let s = 0; for (let i = 0; i < Math.min(x.length, y.length); i++) s += Math.abs(x[i] - y[i]); return s }
  const angM = (m) => Math.atan2(m.b, m.a) * 180 / Math.PI
  const listAngle = (list) => { if (!list || list.numberOfItems === 0) return 0; let m = list.getItem(0).matrix; for (let i = 1; i < list.numberOfItems; i++) m = m.multiply(list.getItem(i).matrix); return angM(m) }
  const spinG = (S) => [...S.querySelectorAll('g')].find((g) => g.querySelector(':scope > animateTransform'))
  const sample = () => {
    const S = svg()
    const g = spinG(S)
    const lg = S.querySelector('linearGradient')
    const overlay = [...S.querySelectorAll('g[opacity]')].filter((x) => x.querySelector('animate[attributeName="opacity"]'))
    let ov = 0
    if (overlay.length) { ov = overlay.reduce((acc, el) => acc * Number(getComputedStyle(el).opacity), 1) }
    return {
      t: performance.now(),
      state: S.getAttribute('data-state'), phase: S.getAttribute('data-phase'),
      body: g ? listAngle(g.transform.animVal) : 0,
      bodyBase: g ? listAngle(g.transform.baseVal) : 0,
      grad: listAngle(lg.gradientTransform.animVal),
      gradBase: listAngle(lg.gradientTransform.baseVal),
      hole: norm(getComputedStyle(S.querySelector('path')).d),
      overlay: ov,
      enter: !!S.querySelector('svg > g.agent-logo-enter'),
      unresolved: [...S.querySelectorAll('animate,animateTransform')].filter((a) => { try { a.getStartTime(); return false } catch { return true } }).length,
    }
  }
  const rest = sample()
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('思考'))
  btn.click()
  const frames = []
  await new Promise((resolve) => {
    const start = performance.now()
    const tick = () => {
      const s = sample(); s.holeDist = dist(s.hole, rest.hole); delete s.hole; frames.push(s)
      if (s.state === 'still' && frames.length > 30 && performance.now() - start > 3500) return resolve()
      if (performance.now() - start > 9000) return resolve()
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  return { rest: { body: rest.body, grad: rest.grad, overlay: rest.overlay, enter: rest.enter }, frames }
})
await browser.close(); server.close()

const norm360 = (a) => ((a % 360) + 360) % 360
const wrapDelta = (a, b) => { let d = norm360(a) - norm360(b); if (d > 180) d -= 360; if (d < -180) d += 360; return Math.abs(d) }
const findings = []
const record = (id, desc, pass, detail) => { findings.push({ id, desc, pass, detail }); console.log(`${pass ? '✅' : '❌'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`) }
const { rest, frames } = result
const first = frames.find((f) => f.state === 'think')
const lastThink = [...frames].reverse().find((f) => f.state === 'think' && f.phase !== 'exit')
const firstExit = frames.find((f) => f.phase === 'exit')
const lastExit = [...frames].reverse().find((f) => f.phase === 'exit')
const finalStill = [...frames].reverse().find((f) => f.state === 'still')
const fps = frames.length / ((frames[frames.length - 1].t - frames[0].t) / 1000)
const maxStep = (480 / fps) * 1.5

record('C1a', '靜止 → 思考起步:角度/色場/形狀/疊層相等', !!first && wrapDelta(first.body, rest.body) < 1 && wrapDelta(first.grad, rest.grad) < 1 && first.holeDist < 1 && first.overlay < 0.02, first ? `body ${first.body.toFixed(1)} grad ${first.grad.toFixed(1)} hole ${first.holeDist.toFixed(0)} overlay ${first.overlay.toFixed(3)}` : 'no think frame')
record('C1b', '減速停定 → 靜止:角度 ≡ 0、色場 ≡ 0、形狀 = 定稿、疊層 0', !!finalStill && wrapDelta(finalStill.body, 0) < 1 && wrapDelta(finalStill.grad, 0) < 1 && finalStill.holeDist < 1 && finalStill.overlay < 0.02, finalStill ? `body ${finalStill.body.toFixed(1)} grad ${finalStill.grad.toFixed(1)} hole ${finalStill.holeDist.toFixed(0)} overlay ${finalStill.overlay.toFixed(3)}` : 'no still frame')
let worst = { body: 0, grad: 0, hole: 0, overlay: 0, at: -1 }
for (let i = 1; i < frames.length; i++) {
  const a = frames[i - 1], b = frames[i]
  const db = wrapDelta(b.body, a.body), dg = wrapDelta(b.grad, a.grad), dh = Math.abs(b.holeDist - a.holeDist), dov = Math.abs(b.overlay - a.overlay)
  if (db > worst.body) worst = { ...worst, body: db, at: i }
  if (dg > worst.grad) worst.grad = dg
  if (dh > worst.hole) worst.hole = dh
  if (dov > worst.overlay) worst.overlay = dov
}
record('C2', `無跳幀(fps≈${fps.toFixed(0)},角度每影格 ≤ ${maxStep.toFixed(1)}°、形狀 ≤ 60、疊層 ≤ 0.08)`, worst.body <= maxStep && worst.grad <= maxStep && worst.hole <= 60 && worst.overlay <= 0.08, `worst body ${worst.body.toFixed(1)}° grad ${worst.grad.toFixed(1)}° hole ${worst.hole.toFixed(0)} overlay ${worst.overlay.toFixed(3)}`)
record('C3', '減速起點基底 = 離開思考瞬間角度(本體與色場)', !!firstExit && !!lastThink && wrapDelta(firstExit.bodyBase, lastThink.body) <= maxStep && wrapDelta(-firstExit.gradBase, lastThink.body) <= maxStep, firstExit && lastThink ? `bodyBase ${firstExit.bodyBase.toFixed(1)} vs ${lastThink.body.toFixed(1)}; gradBase ${firstExit.gradBase.toFixed(1)}` : 'no exit frame')
record('C4', 'still ↔ think 交接不掛淡入 class', !!first && !first.enter && !!finalStill && !finalStill.enter, `enter@think ${first?.enter} enter@still ${finalStill?.enter}`)
record('C6', '減速段無孤兒動畫(每個 animate 都已 beginElement)', !!firstExit && firstExit.unresolved === 0 && !!lastExit && lastExit.unresolved === 0 && !!lastThink && lastThink.unresolved === 0, `unresolved think ${lastThink?.unresolved} exit-start ${firstExit?.unresolved} exit-end ${lastExit?.unresolved}`)
record('C5', '減速段結束落在正位後才切靜止(最後一個 exit 影格角度 ≡ 0)', !!lastExit && wrapDelta(lastExit.body, 0) <= maxStep && wrapDelta(lastExit.grad, 0) <= maxStep, lastExit ? `last exit body ${lastExit.body.toFixed(1)} grad ${lastExit.grad.toFixed(1)}` : 'no exit frame')
const failed = findings.filter((f) => !f.pass)
console.log(failed.length ? `✗ agent-logo-continuity ${failed.length} 條失敗` : `✅ agent-logo-continuity-invariant PASS(${frames.length} 影格)`)
process.exit(failed.length ? 1 : 0)
