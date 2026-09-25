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
import { openStory, StoryRenderInstrumentError, launchBrowserOrSkip } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

/* ── C7 / C8:純原始碼靜態檢查(先跑,任何環境都不跳過)────────────────────────────── */
const findings = []
const record = (id, desc, pass, detail) => { findings.push({ id, desc, pass, detail }); console.log(`${pass ? '✅' : '❌'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`) }
const SELFTEST = process.argv.includes('--selftest')
let LOGO_TSX = readFileSync(join(ROOT, 'packages/design-system/src/components/AgentPanel/agent-panel-logo.tsx'), 'utf8')
if (SELFTEST) {
  // 對照組(只動記憶體裡的副本,不碰磁碟):把 C7/C8 各自要守的三件事同時弄壞 ——
  //   1. 轉心偏掉 → 外緣每圈進出一圈偏心量(看起來像動畫沒對正)
  //   2. 把 viewBox 中心 627 當旋轉中心的殘留寫法長回來
  //   3. SPIN_OMEGA 被寫死成字面值 → 改一息轉速不會跟著動
  // C1–C6 要開瀏覽器逐影格取樣,不在這個對照組的範圍內;這裡證明的是**在任何環境都會跑**的靜態半邊。
  LOGO_TSX = LOGO_TSX
    .replace(/const\s+LOGO_CX\s*=\s*([\d.]+)/u, (_, value) => `const LOGO_CX = ${(Number(value) + 5).toFixed(3)}`)
    .replace(/const\s+LOGO_CY\s*=\s*([\d.]+)/u, (match) => `${match}\nconst SELFTEST_STRAY = 'rotate(0 627 627)'`)
    + '\nconst SPIN_OMEGA = 720\n'
}
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

if (SELFTEST) {
  // 兩條都必須紅:只紅一條代表另一條的判定沒有真的在執行。
  const ids = new Set(staticFailed.map((f) => f.id))
  const caught = ids.has('C7') && ids.has('C8')
  console.log(caught
    ? '\n✓ selftest:轉心偏移 / 627 殘留 / 寫死轉速三者都被 C7+C8 抓到,量具會紅'
    : `\n✗ selftest:C7/C8 沒有同時變紅 —— 靜態半邊是假綠(實際紅:${[...ids].join(',') || '無'})`)
  process.exit(caught ? 0 : 1)
}

if (staticFailed.length) { console.log(`✗ agent-logo-continuity 靜態檢查 ${staticFailed.length} 條失敗`); process.exit(1) }

const STATIC = join(ROOT, 'storybook-static')
if (!existsSync(STATIC)) {
  console.error('✗ storybook-static missing. Run `npm run build-storybook` first.')
  process.exit(1)
}
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
const BASE = server.origin

// 起不了 Chromium:一般環境 SKIPPED-ENV exit 0;GOVERNANCE_BROWSER_REQUIRED=1 的 CI 瀏覽器 job → exit 1(lib/launch-browser.mjs)
const browser = await launchBrowserOrSkip({}, {
  cleanup: () => server.stop(),
  hint: '此環境(受限沙箱)結構上無法跑 C1–C6;C7/C8 已於上方靜態判定為綠。請於可開瀏覽器環境執行 npm run test:agent-panel-invariants 補驗其餘。',
})
const page = await browser.newPage({ viewport: { width: 900, height: 600 } })
// 靜止樣本(rest)是 C1 的基準,必須取在「這則 story 真的渲染完成、標誌與『思考』鈕都在、版面已靜止」之後。
// 原本是 networkidle + 等第一個 svg 出現 —— 代理量:story 檔缺檔時只會 30 秒逾時丟一個不點名 story 的 Playwright 例外。
// 改由 openStory(lib/launch-browser.mjs,全部瀏覽器閘共用):等 Storybook 回報渲染完成 → 被量的 svg(含色場)與鈕出現 →
// 連續 10 個影格無 DOM 變動、無進行中的有限動畫。等不到 = 儀器失效(exit 1,點名 story、附 404),不是產品裁決。
try {
  await openStory(page, `${BASE}/iframe.html?id=design-system-components-agentpanel-展示--logo-think-stop&viewMode=story`, {
    waitFor: () => Boolean(document.querySelector('svg linearGradient'))
      && [...document.querySelectorAll('button')].some((b) => b.textContent.includes('思考')),
    settleFrames: 10,
    notFound: server.notFound,
  })
} catch (error) {
  if (!(error instanceof StoryRenderInstrumentError)) throw error
  console.error(`✗ ${error.message}`)
  console.error('✗ agent-logo-continuity:C1–C6 這次沒有量到(儀器失效)—— 不算通過,也不是產品裁決;C7/C8 已於上方判定')
  await browser.close(); await server.stop(); process.exit(1)
}

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
await browser.close(); await server.stop()

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

// C1a 的容差按**實際經過的時間**算,不按影格序號(2026-09-10 修)。
// 舊寫法用「平均 fps 的 1.5 倍影格」當上限,隱含假設「切換到第一個 think 取樣之間沒有掉格」——
// 共享 runner 掉一格,第一個取樣就變成兩格的旋轉量,量到 25.4° > 17.9° 而紅(本機同一支永遠是 12°、綠)。
// 要驗的不變式是「起步從靜止位接上、沒有跳一段」,那本來就該用「轉了多少 ÷ 過了多久」判定:
// 上限 = 角速度 × 這兩個取樣之間真正經過的時間 × 1.5,掉格時上限跟著放大,語意不變、也不會放過真的跳段。
const firstIdx = frames.indexOf(first)
const beforeFirst = firstIdx > 0 ? frames[firstIdx - 1] : null
// 上限再夾 100ms:掉格可以放寬容差,但不能無限放寬 —— 100ms 對應 72°,遠小於「從隨機角度起跑」的跳段(可到 180°),
// 所以夾住之後仍抓得到真的不連續。
const c1aSpanMs = Math.min(100, first && beforeFirst ? Math.max(1, first.t - beforeFirst.t) : 1000 / Math.max(1, fps))
const c1aTol = (SPIN_OMEGA * c1aSpanMs) / 1000 * 1.5
record('C1a', `靜止 → 思考起步:第一格與靜止差 ≤ 經過時間該轉的量(${c1aSpanMs.toFixed(1)}ms → ≤ ${c1aTol.toFixed(1)}°、形狀 ≤ 60、疊層 ≤ 0.02)`, !!first && wrapDelta(first.body, rest.body) <= c1aTol && wrapDelta(first.grad, rest.grad) <= c1aTol && first.holeDist <= 60 && first.overlay < 0.02, first ? `body ${first.body.toFixed(1)} grad ${first.grad.toFixed(1)} hole ${first.holeDist.toFixed(0)} overlay ${first.overlay.toFixed(3)}` : 'no think frame')
record('C1b', '減速停定 → 靜止:角度 ≡ 0、色場 ≡ 0、形狀 = 定稿、疊層 0', !!finalStill && wrapDelta(finalStill.body, 0) < 1 && wrapDelta(finalStill.grad, 0) < 1 && finalStill.holeDist < 1 && finalStill.overlay < 0.02, finalStill ? `body ${finalStill.body.toFixed(1)} grad ${finalStill.grad.toFixed(1)} hole ${finalStill.holeDist.toFixed(0)} overlay ${finalStill.overlay.toFixed(3)}` : 'no still frame')
// C2/C3 的容差按**這一對取樣之間隔了幾個動畫影格**算,不按平均 fps(2026-09-15 修)。
// C1a 在 2026-09-10 已經改成不吃平均值,C2/C3 是同一個 bug 的兄弟位置,當時沒一起改(M10 掃描漏網):
// 共享 runner 掉一格,相鄰兩個取樣之間就變成兩格的旋轉量 —— CI 實測 worst 35.7° > 上限 18.1° 而紅,
// 本機同一支永遠是 12°、綠。要驗的不變式是「有沒有跳一段」,判準該是「轉的量對不對得上中間經過的影格數」。
//
// 為什麼不是直接用毫秒:取樣有時相隔不到 1 毫秒(狀態交接處會連record兩筆),而角度是**按影格**跳的,
// 兩個相隔 1ms 的取樣仍可能跨過一個影格邊界、看到一整格的轉動量。所以下限一律至少一格。
// 上限夾 3 格(60fps ≈ 53°):掉格可以放寬,但「從隨機角度重新起跑」那種真跳段動輒 90-180°,夾住後仍抓得到。
const oneFrameMs = 1000 / Math.max(1, fps)
const stepTol = (a, b) => {
  const gapFrames = Math.min(3, Math.max(1, Math.ceil(Math.max(0, b.t - a.t) / oneFrameMs)))
  return (SPIN_OMEGA * oneFrameMs * gapFrames) / 1000 * 1.5
}
const worstStep = (fs) => {
  let w = { body: 0, grad: 0, hole: 0, overlay: 0, at: -1, tol: 0, ratio: 0 }
  for (let i = 1; i < fs.length; i++) {
    const a = fs[i - 1], b = fs[i]
    const tol = stepTol(a, b)
    const db = wrapDelta(b.body, a.body), dg = wrapDelta(b.grad, a.grad)
    const dh = Math.abs(b.holeDist - a.holeDist), dov = Math.abs(b.overlay - a.overlay)
    const ratio = Math.max(db, dg) / tol
    if (ratio > w.ratio) w = { ...w, ratio, body: db, grad: dg, at: i, tol }
    if (dh > w.hole) w.hole = dh
    if (dov > w.overlay) w.overlay = dov
  }
  return w
}
const worst = worstStep(frames)

// 對照組:證明「放寬掉格」之後,真的跳段還是會紅(M32 —— 沒被證明會紅的綠燈是零證據)。
// 三個案例:掉一格的正常轉動要放行、相隔不到一格的取樣要放行、真跳段(120°)必須紅。
const probe = (dtMs, deg) => worstStep([
  { t: 0, body: 0, grad: 0, holeDist: 0, overlay: 0 },
  { t: dtMs, body: deg, grad: deg, holeDist: 0, overlay: 0 },
]).ratio <= 1
const perFrameDeg = (SPIN_OMEGA * oneFrameMs) / 1000
const droppedOk = probe(oneFrameMs * 2, perFrameDeg * 2)
const subFrameOk = probe(0.5, perFrameDeg)
const jumpCaught = !probe(oneFrameMs, 120)
record('C2-ctl', '對照組:掉一格放行、次影格取樣放行、真跳段 120° 仍紅', droppedOk && subFrameOk && jumpCaught, `掉格 ${droppedOk} / 次影格 ${subFrameOk} / 跳段抓到 ${jumpCaught}`)
record('C2', `無跳幀(角度差 ≤ 該對取樣之間該轉的量 × 1.5、形狀 ≤ 60、疊層 ≤ 0.08)`, worst.ratio <= 1 && worst.hole <= 60 && worst.overlay <= 0.08, `worst body ${worst.body.toFixed(1)}° grad ${worst.grad.toFixed(1)}°(當時上限 ${worst.tol.toFixed(1)}°,fps≈${fps.toFixed(0)})hole ${worst.hole.toFixed(0)} overlay ${worst.overlay.toFixed(3)}`)
const c3Tol = firstExit && lastThink ? stepTol(lastThink, firstExit) : maxStep
record('C3', `減速起點基底 = 離開思考瞬間角度(本體與色場,容差 ${c3Tol.toFixed(1)}°)`, !!firstExit && !!lastThink && wrapDelta(firstExit.bodyBase, lastThink.body) <= c3Tol && wrapDelta(-firstExit.gradBase, lastThink.body) <= c3Tol, firstExit && lastThink ? `bodyBase ${firstExit.bodyBase.toFixed(1)} vs ${lastThink.body.toFixed(1)}; gradBase ${firstExit.gradBase.toFixed(1)}` : 'no exit frame')
record('C4', 'still ↔ think 交接不掛淡入 class', !!first && !first.enter && !!finalStill && !finalStill.enter, `enter@think ${first?.enter} enter@still ${finalStill?.enter}`)
record('C6', '減速起跑第一格無孤兒動畫(每個 animate 都有 current interval)', !!firstExit && firstExit.unresolved === 0, `unresolved@exit-start ${firstExit?.unresolved}(等速中 ${lastThink?.unresolved} / 停定後 ${lastExit?.unresolved} 為 freeze 結束,屬正常)`)
record('C5', '減速段結束落在正位後才切靜止(最後一個 exit 影格角度 ≡ 0)', !!lastExit && wrapDelta(lastExit.body, 0) <= maxStep && wrapDelta(lastExit.grad, 0) <= maxStep, lastExit ? `last exit body ${lastExit.body.toFixed(1)} grad ${lastExit.grad.toFixed(1)}` : 'no exit frame')
const failed = findings.filter((f) => !f.pass)
console.log(failed.length ? `✗ agent-logo-continuity ${failed.length} 條失敗` : `✅ agent-logo-continuity-invariant PASS(${frames.length} 影格)`)
process.exit(failed.length ? 1 : 0)
