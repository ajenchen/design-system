#!/usr/bin/env node
/**
 * agent-logo-continuity-invariant — AgentLogo 思考動畫「有始有終、一氣呵成」機械驗證(spec「AgentLogo」節)。
 *
 * 在真實瀏覽器(Playwright Chromium,前景 rAF 可跑)載入 storybook-static 的「標誌:思考起步與減速停止」,
 * 按下「思考 3 秒」後逐影格(rAF)取樣四個通道:本體角度、色場角度、負空間形狀(與定稿形距離)、亮度疊層不透明度,
 * 直到回到靜止。判定:
 *   C1 起點=終點:靜止 → 思考起步(rAF 第一格已是起跑後 ≤1 影格,容差 = 每影格最大位移)、減速停定 → 靜止
 *      (四通道逐一相等:角度 mod 360、形狀距離 0、疊層 0)。
 *   C2 無跳幀:相鄰影格的角度差 ≤ 每影格最大位移(ω ÷ 實際 fps)× 1.5;形狀/亮度差 ≤ 容差。ω 由 C8 從原始碼算出,不寫死。
 *   C3 減速起點基底 = 當下角度:SpinDecel 起跑前一影格的 <g transform> 與 <linearGradient gradientTransform> 基底
 *      等於離開思考瞬間的角度(否則會先閃回 0°)。
 *   C4 still ↔ think 交接不掛 agent-logo-enter(淡入只給招喚)。
 *   C5 減速段結束落在正位後才切靜止(最後一個 exit 影格角度 ≡ 0)。
 *   C6 減速段沒有孤兒動畫:減速起跑的第一格,svg 內每個 animate 都有 current interval(getStartTime 不丟例外);
 *      只看這一格 —— fill=freeze 的動畫結束後 getStartTime 也會丟例外,等速中 / 停定後出現「無 interval」是正常的。
 *      2026-09-03 deploy-preview 逐格實測:洞形變 / 亮度淡出 7 個 animate 全未起跑 → 整段減速洞持圓、停定瞬間跳橢圓。
 *
 * C7/C8 是**純原始碼靜態檢查**(不開瀏覽器),所以在任何環境都真的跑,不會被 SKIPPED-ENV 蓋掉:
 *   C7 轉心 = 外輪廓圓心:從定稿 path 的外弧端點反解圓心(SVG 1.1 §F.6.5),必須等於 tsx 的
 *      LOGO_CX/LOGO_CY;且 tsx 內不得再有把 viewBox 中心(627)當旋轉/縮放/波源中心的殘留。
 *      繞錯的點轉 → 外緣每圈進出一圈偏心量(24px 下峰對峰 0.924px),看起來像動畫沒對正。
 *   C8 轉速單一住所:SPIN_OMEGA 必須由 BREATH_S / SPIN_TURNS_PER_BREATH 推出(不得是寫死的數字),
 *      且一息必須切成整數圈 —— 「一息 = N 圈」以前只是註解宣稱,改一息轉速不跟著動。
 *
 * 沙箱起不了 Chromium → C1–C6 標 SKIPPED-ENV(exit 0),C7/C8 照常判定;請在可開瀏覽器的環境(CI)補驗其餘。
 */
import { chromium } from 'playwright'
import http from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

/* ── C7 / C8:純原始碼靜態檢查(先跑,任何環境都不跳過)────────────────────────────── */
const findings = []
const record = (id, desc, pass, detail) => { findings.push({ id, desc, pass, detail }); console.log(`${pass ? '✅' : '❌'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`) }
const LOGO_TSX = readFileSync(join(ROOT, 'packages/design-system/src/components/AgentPanel/agent-panel-logo.tsx'), 'utf8')
const num = (re, what) => {
  const m = LOGO_TSX.match(re)
  if (!m) { console.error(`❌ 讀不到 agent-panel-logo.tsx 的 ${what} —— 不以預設值蒙混。`); process.exit(1) }
  return Number(m[1])
}

/** SVG 1.1 §F.6.5 弧端點參數化反解圓心(此處只用到 rx === ry 的正圓弧)。 */
function arcCenter(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
  const phi = (phiDeg * Math.PI) / 180
  const cp = Math.cos(phi), sp = Math.sin(phi)
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy
  const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  let co = Math.sqrt(Math.max(num2 / den, 0))
  if (fa === fs) co = -co
  const cxp = co * ((rx * y1p) / ry), cyp = co * ((-ry * x1p) / rx)
  return [cp * cxp - sp * cyp + (x1 + x2) / 2, sp * cxp + cp * cyp + (y1 + y2) / 2]
}

const outer = LOGO_TSX.match(/'M\s*([\d.]+),([\d.]+)\s*A\s*([\d.]+),([\d.]+)\s+0\s+([01])\s+([01])\s+([\d.]+),([\d.]+)/u)
if (!outer) { console.error('❌ 讀不到定稿 path 的外弧 —— C7 無法反解圓心。'); process.exit(1) }
const [cx, cy] = arcCenter(+outer[1], +outer[2], +outer[3], +outer[4], 0, +outer[5], +outer[6], +outer[7], +outer[8])
const logoCx = num(/const\s+LOGO_CX\s*=\s*([\d.]+)/u, 'LOGO_CX')
const logoCy = num(/const\s+LOGO_CY\s*=\s*([\d.]+)/u, 'LOGO_CY')
// 容差 0.01 單位:1254 的 viewBox 下 = 24px 時的 0.0002px,足以擋住任何有感偏移,又容得下四捨五入。
const centerOk = Math.abs(cx - logoCx) <= 0.01 && Math.abs(cy - logoCy) <= 0.01
// 殘留掃描:先把註解整段拿掉(註解裡本來就要提 627 說明為什麼不能用),剩下的**任何** 627 都是殘留。
// 用「扣掉註解再全掃」而不是列舉 translate/rotate/scale 的寫法 —— 列舉會漏掉
// `rotate(${angle} 627 627)` 這種中心不在括號第一個參數的形式(M10:掃描不得只覆蓋想得到的形狀)。
const stray = [...LOGO_TSX.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '').matchAll(/627/gu)].length
record('C7', `轉心 = 外輪廓圓心(反解 ${cx.toFixed(3)}, ${cy.toFixed(3)};viewBox 中心殘留 ${stray} 處)`, centerOk && stray === 0, `LOGO_CX/CY ${logoCx}, ${logoCy}`)

const breathS = num(/const\s+BREATH_S\s*=\s*([\d.]+)/u, 'BREATH_S')
const turns = num(/const\s+SPIN_TURNS_PER_BREATH\s*=\s*([\d.]+)/u, 'SPIN_TURNS_PER_BREATH')
const omegaHardcoded = /const\s+SPIN_OMEGA\s*=\s*[\d.]+\s*$/mu.test(LOGO_TSX)
const SPIN_OMEGA = 360 / (breathS / turns)
record('C8', `轉速單一住所(一息 ${breathS}s ÷ ${turns} 圈 → ${SPIN_OMEGA}°/s = ${(breathS / turns).toFixed(3)}s/圈)`, !omegaHardcoded && Number.isInteger(turns) && turns > 0, omegaHardcoded ? 'SPIN_OMEGA 被寫死成字面值 —— 改一息轉速不會跟著動' : '由 BREATH_S / SPIN_TURNS_PER_BREATH 推出')

const staticFailed = findings.filter((f) => !f.pass)
if (staticFailed.length) { console.log(`✗ agent-logo-continuity 靜態檢查 ${staticFailed.length} 條失敗`); process.exit(1) }

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
  console.error('   此環境(受限沙箱)結構上無法跑 C1–C6;C7/C8 已於上方靜態判定為綠。請於可開瀏覽器環境執行 npm run test:agent-panel-invariants 補驗其餘。')
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
const { rest, frames } = result
const first = frames.find((f) => f.state === 'think')
const lastThink = [...frames].reverse().find((f) => f.state === 'think' && f.phase !== 'exit')
const firstExit = frames.find((f) => f.phase === 'exit')
const lastExit = [...frames].reverse().find((f) => f.phase === 'exit')
const finalStill = [...frames].reverse().find((f) => f.state === 'still')
const fps = frames.length / ((frames[frames.length - 1].t - frames[0].t) / 1000)
// 容差用的 ω 來自上方 C8 的靜態推導(單一住所);這裡不再有第二個數字住所。
const maxStep = (SPIN_OMEGA / fps) * 1.5

record('C1a', `靜止 → 思考起步:第一格與靜止差 ≤ 一影格(角度 ≤ ${maxStep.toFixed(1)}°、形狀 ≤ 60、疊層 ≤ 0.02)`, !!first && wrapDelta(first.body, rest.body) <= maxStep && wrapDelta(first.grad, rest.grad) <= maxStep && first.holeDist <= 60 && first.overlay < 0.02, first ? `body ${first.body.toFixed(1)} grad ${first.grad.toFixed(1)} hole ${first.holeDist.toFixed(0)} overlay ${first.overlay.toFixed(3)}` : 'no think frame')
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
record('C6', '減速起跑第一格無孤兒動畫(每個 animate 都有 current interval)', !!firstExit && firstExit.unresolved === 0, `unresolved@exit-start ${firstExit?.unresolved}(等速中 ${lastThink?.unresolved} / 停定後 ${lastExit?.unresolved} 為 freeze 結束,屬正常)`)
record('C5', '減速段結束落在正位後才切靜止(最後一個 exit 影格角度 ≡ 0)', !!lastExit && wrapDelta(lastExit.body, 0) <= maxStep && wrapDelta(lastExit.grad, 0) <= maxStep, lastExit ? `last exit body ${lastExit.body.toFixed(1)} grad ${lastExit.grad.toFixed(1)}` : 'no exit frame')
const failed = findings.filter((f) => !f.pass)
console.log(failed.length ? `✗ agent-logo-continuity ${failed.length} 條失敗` : `✅ agent-logo-continuity-invariant PASS(${frames.length} 影格)`)
process.exit(failed.length ? 1 : 0)
