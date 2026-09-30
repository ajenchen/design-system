#!/usr/bin/env node
/**
 * agent-logo-continuity-invariant — AgentLogo 思考動畫「有始有終、一氣呵成」機械驗證(spec「AgentLogo」節)。
 *
 * 在真實瀏覽器(Playwright Chromium,前景 rAF 可跑)載入 storybook-static 的「標誌:思考起步與減速停止」,
 * 按下「思考 3 秒」後逐影格(rAF)取樣四個通道:本體角度、色場角度、負空間形狀(與定稿形距離)、亮度疊層不透明度,
 * 直到回到靜止。判定:
 *   C1 起點=終點:靜止 → 思考起步(rAF 第一格已是起跑後 ≤1 影格,容差 = 每影格最大位移)、減速停定 → 靜止
 *      (四通道逐一相等:角度 mod 360、形狀距離 0、疊層 0)。
 *   C2 無跳幀:**等速段**相鄰取樣的角度差必須 ≡ ω × 兩格之間經過的動畫時間(mod 360,殘差 ≤ 1.5 格的量)——
 *      雙邊一致性,沒有「取樣間隔太長就看不見」的盲區;**加速 / 減速段**(沒有封閉式的期望角度)只驗上限
 *      (≤ 該對取樣之間該轉的量 × 1.5,上限夾 3 格),間隔超過 3 格的那一對是盲區 → INSTRUMENT-FAIL(儀器失效),
 *      不指控產品。形狀/亮度差 ≤ 容差。ω 由 C8 從原始碼算出,不寫死。時間用 rAF 的影格時間戳(與 SMIL 取樣同一個時鐘),
 *      不用 performance.now()(回呼晚跑幾毫秒就對不上角度)。細節見下方 C2 區塊(2026-09-27)。
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
 *
 * 對照組(M32「儀器要先有對照組」):
 *   --selftest        靜態半邊:轉心偏移 / 627 殘留 / 寫死轉速 → C7+C8 必須同時紅(不開瀏覽器)
 *   --stall=steady    在等速段的一個 rAF 回呼裡同步忙 120ms(重現「機器卡住、掉 7 格」)→ 角度仍 ≡ ω×經過時間,**必須綠**
 *   --stall=exit      同一種卡頓落在減速段 → 那一對取樣是盲區 → **必須 INSTRUMENT-FAIL**(exit 1),不得指控產品也不得放行
 *   (三者由 test-agent-logo-continuity-invariant.mjs 逐一跑;2026-09-27 實測:純 CPU 忙迴圈負載(16 執行緒、load 17)
 *    完全擾動不到 headless 的 rAF,能重現誤紅的只有頁面主執行緒本身的長工作,所以對照組注入在頁內。)
 */
import { openStory, StoryRenderInstrumentError, launchBrowserOrSkip, requireStorybookBuild, INSTRUMENT_FAIL_MARKER } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

/* ── C7 / C8:純原始碼靜態檢查(先跑,任何環境都不跳過)────────────────────────────── */
const findings = []
const record = (id, desc, pass, detail) => { findings.push({ id, desc, pass, detail }); console.log(`${pass ? '✅' : '❌'} ${id} ${desc}${detail ? ` — ${detail}` : ''}`) }
const SELFTEST = process.argv.includes('--selftest')
// 對照組:在頁面主執行緒注入一次 120ms 的同步長工作(見檔頭);只接受 steady / exit 兩個值,寫錯一律丟例外(M37:寫錯的值不得被讀成「不注入」)
const STALL_ARG = process.argv.find((a) => a.startsWith('--stall='))
const STALL = STALL_ARG ? STALL_ARG.slice('--stall='.length) : ''
if (STALL && STALL !== 'steady' && STALL !== 'exit') { console.error(`✗ --stall 只接受 steady / exit,實得 ${JSON.stringify(STALL)}`); process.exit(1) }
const STALL_MS = 120 // > 4.5 格(75ms):舊判準(3 格上限 × 1.5)在這個長度一定誤紅,新判準必須分得出「等速段一致」與「減速段盲區」
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
// 加速段長度(等速段從它結束後才開始;C2 的雙邊一致性只在等速段成立)—— 同樣從原始碼讀,不寫死:
// tsx 寫法是 `SPIN_ACCEL_S = SPIN_PERIOD_S / <整數>`;讀不到就停,不以預設值蒙混。
const accelDivisor = num(/const\s+SPIN_ACCEL_S\s*=\s*SPIN_PERIOD_S\s*\/\s*(\d+)/u, 'SPIN_ACCEL_S(= SPIN_PERIOD_S / n)')
const SPIN_ACCEL_MS = ((breathS / turns) / accelDivisor) * 1000
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
// 沒有建置 → MISSING-BUILD exit 2(缺前置;lib/launch-browser.mjs 的共用標記與退出碼,2026-09-25 統一寫法,待辦總帳 C5)
requireStorybookBuild(join(STATIC, 'index.json'))
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

const result = await page.evaluate(async ({ STALL, STALL_MS, SPIN_ACCEL_MS }) => {
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
      // ft:這一格的動畫時間戳(rAF 回呼的 timestamp;靜止樣本取 document.timeline.currentTime)。SMIL 用同一個時鐘取樣,
      // 所以「角度差 ÷ Δft」才是 ω;performance.now() 是回呼**跑到**的時刻,主執行緒忙時會晚幾毫秒到幾十毫秒,對不上角度。
      ft: document.timeline.currentTime,
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
  let stalledAt = null, firstThinkFt = null
  await new Promise((resolve) => {
    const start = performance.now()
    const tick = (ts) => {
      const s = sample(); s.ft = ts; s.holeDist = dist(s.hole, rest.hole); delete s.hole; frames.push(s)
      if (s.state === 'think' && firstThinkFt === null) firstThinkFt = ts
      // 對照組:在指定相位的一個回呼裡同步忙 STALL_MS(只做一次)。等速段要等加速段結束再過 300ms,確定落在等速;
      // 減速段取第 5 個 exit 影格(交接處已過、還沒停定)。
      const inSteady = STALL === 'steady' && s.state === 'think' && !s.phase && firstThinkFt !== null && ts - firstThinkFt > SPIN_ACCEL_MS + 300
      const inExit = STALL === 'exit' && s.phase === 'exit' && frames.filter((f) => f.phase === 'exit').length === 5
      if (stalledAt === null && (inSteady || inExit)) { stalledAt = frames.length - 1; const end = performance.now() + STALL_MS; while (performance.now() < end) { /* 同步長工作 */ } }
      if (s.state === 'still' && frames.length > 30 && performance.now() - start > 3500) return resolve()
      if (performance.now() - start > 9000) return resolve()
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  return { rest: { body: rest.body, grad: rest.grad, overlay: rest.overlay, enter: rest.enter }, frames, stalledAt }
}, { STALL, STALL_MS, SPIN_ACCEL_MS })
await browser.close(); await server.stop()

const norm360 = (a) => ((a % 360) + 360) % 360
const wrapDelta = (a, b) => { let d = norm360(a) - norm360(b); if (d > 180) d -= 360; if (d < -180) d += 360; return Math.abs(d) }
const { rest, frames, stalledAt } = result
const first = frames.find((f) => f.state === 'think')
const lastThink = [...frames].reverse().find((f) => f.state === 'think' && f.phase !== 'exit')
const firstExit = frames.find((f) => f.phase === 'exit')
const lastExit = [...frames].reverse().find((f) => f.phase === 'exit')
const finalStill = [...frames].reverse().find((f) => f.state === 'still')
const fps = frames.length / ((frames[frames.length - 1].t - frames[0].t) / 1000)
// 一格多長:取相鄰影格時間戳差的**中位數**,不取平均 —— 一次 120ms 的卡頓會把平均拉長、讓所有容差一起變鬆(2026-09-27)。
const ftGaps = frames.slice(1).map((f, i) => f.ft - frames[i].ft).sort((a, b) => a - b)
const oneFrameMs = ftGaps.length ? ftGaps[Math.floor(ftGaps.length / 2)] : 1000 / Math.max(1, fps)
// 容差用的 ω 來自上方 C8 的靜態推導(單一住所);這裡不再有第二個數字住所。
const maxStep = (SPIN_OMEGA * oneFrameMs) / 1000 * 1.5
// 盲區帳本:儀器沒看到的那幾段(取樣間隔超過上限、而且那一段沒有封閉式的期望角度可以對)。
// 有盲區 → INSTRUMENT-FAIL(沒量到 ≠ 沒發生,也不得指控產品;M37)。
const blind = []

// C1a 的容差按**實際經過的時間**算,不按影格序號(2026-09-10 修)。
// 舊寫法用「平均 fps 的 1.5 倍影格」當上限,隱含假設「切換到第一個 think 取樣之間沒有掉格」——
// 共享 runner 掉一格,第一個取樣就變成兩格的旋轉量,量到 25.4° > 17.9° 而紅(本機同一支永遠是 12°、綠)。
// 要驗的不變式是「起步從靜止位接上、沒有跳一段」,那本來就該用「轉了多少 ÷ 過了多久」判定:
// 上限 = 角速度 × 這兩個取樣之間真正經過的時間 × 1.5,掉格時上限跟著放大,語意不變、也不會放過真的跳段。
const firstIdx = frames.indexOf(first)
const beforeFirst = firstIdx > 0 ? frames[firstIdx - 1] : null
// 上限夾 100ms:掉格可以放寬容差,但不能無限放寬 —— 100ms 對應 72°,遠小於「從隨機角度起跑」的跳段(可到 180°),
// 所以夾住之後仍抓得到真的不連續。**超過 100ms 的那一段是盲區**(起跑落在加速段,沒有封閉式期望角度可對):
// 2026-09-27 起記進盲區帳本 → INSTRUMENT-FAIL,不再拿夾住的上限去指控產品。
const c1aRawSpanMs = first && beforeFirst ? Math.max(1, first.ft - beforeFirst.ft) : oneFrameMs
if (c1aRawSpanMs > 100) blind.push(`C1a 起跑那一對取樣相隔 ${c1aRawSpanMs.toFixed(1)}ms(> 100ms)`)
const c1aSpanMs = Math.min(100, c1aRawSpanMs)
const c1aTol = (SPIN_OMEGA * c1aSpanMs) / 1000 * 1.5
const c1aObservable = c1aRawSpanMs <= 100
record('C1a', `靜止 → 思考起步:第一格與靜止差 ≤ 經過時間該轉的量(${c1aSpanMs.toFixed(1)}ms → ≤ ${c1aTol.toFixed(1)}°、形狀 ≤ 60、疊層 ≤ 0.02)`, !!first && (!c1aObservable || (wrapDelta(first.body, rest.body) <= c1aTol && wrapDelta(first.grad, rest.grad) <= c1aTol)) && first.holeDist <= 60 && first.overlay < 0.02, first ? `body ${first.body.toFixed(1)} grad ${first.grad.toFixed(1)} hole ${first.holeDist.toFixed(0)} overlay ${first.overlay.toFixed(3)}${c1aObservable ? '' : '(角度那一項是盲區,見下方 INSTRUMENT-FAIL)'}` : 'no think frame')
record('C1b', '減速停定 → 靜止:角度 ≡ 0、色場 ≡ 0、形狀 = 定稿、疊層 0', !!finalStill && wrapDelta(finalStill.body, 0) < 1 && wrapDelta(finalStill.grad, 0) < 1 && finalStill.holeDist < 1 && finalStill.overlay < 0.02, finalStill ? `body ${finalStill.body.toFixed(1)} grad ${finalStill.grad.toFixed(1)} hole ${finalStill.holeDist.toFixed(0)} overlay ${finalStill.overlay.toFixed(3)}` : 'no still frame')
// C2/C3 的容差按**這一對取樣之間隔了幾個動畫影格**算,不按平均 fps(2026-09-15 修)。
// C1a 在 2026-09-10 已經改成不吃平均值,C2/C3 是同一個 bug 的兄弟位置,當時沒一起改(M10 掃描漏網):
// 共享 runner 掉一格,相鄰兩個取樣之間就變成兩格的旋轉量 —— CI 實測 worst 35.7° > 上限 18.1° 而紅,
// 本機同一支永遠是 12°、綠。要驗的不變式是「有沒有跳一段」,判準該是「轉的量對不對得上中間經過的影格數」。
//
// **2026-09-15 那一版沒有根治(2026-09-27 實測,待辦總帳 N39)**:它把上限夾在 3 格(× 1.5 = 4.5 格 ≈ 75ms),
// 所以任何一次 > 75ms 的主執行緒卡頓(與 storybook 建置同時跑就會有)仍然誤紅 —— 對照組 `--stall=steady` 注入 120ms
// 同步長工作:Δft 116.7ms、角度差 84.0°、ω×Δft 也是 84.0°(殘差 0),舊判準卻因上限 55.1° 判「跳幀」指控產品。
// 純 CPU 忙迴圈(16 執行緒、load 17)反而完全擾動不到 headless 的 rAF(兩次都 231 影格、12.1°)—— 會誤紅的只有
// 頁面主執行緒自己的長工作,所以上限夾幾格都不是根治,根治是**換判準**:
//
//   等速段(think、非 exit、加速段結束之後):角度是時間的線性函數,期望值有封閉式 ω×Δft ——
//     判「角度差 ≡ ω×Δft(mod 360),殘差 ≤ 1.5 格的量」。雙邊一致,**取樣間隔多長都判得了**:
//     卡頓 120ms 也是 84°=84°;真跳段(角度差 ≠ 該轉的量)不論間隔多長都露餡,唯一看不見的是剛好 360k° 的跳
//     (任何取樣方案都看不見)。時間用影格時間戳 ft(與 SMIL 同時鐘),不用 performance.now()。
//   加速段 / 減速段(spline 曲線,沒有封閉式期望值):維持上限判(≤ 該對之間該轉的量 × 1.5,夾 3 格),
//     但**間隔超過 3 格的那一對是盲區** → 記進盲區帳本 → INSTRUMENT-FAIL(儀器失效),不指控產品、也不放行。
//
// 為什麼不是直接用毫秒:取樣有時相隔不到 1 毫秒(狀態交接處會連 record 兩筆),而角度是**按影格**跳的,
// 兩個相隔 1ms 的取樣仍可能跨過一個影格邊界、看到一整格的轉動量。所以下限一律至少一格。
const STEP_CAP_FRAMES = 3
const steadyFromFt = first ? first.ft + SPIN_ACCEL_MS + oneFrameMs : Infinity
const isSteady = (f) => f.state === 'think' && !f.phase && f.ft >= steadyFromFt
const slackDeg = (SPIN_OMEGA * oneFrameMs) / 1000 * 1.5 // 1.5 格的量:等速段殘差上限,也是非等速段每格容差的係數
const stepTol = (a, b) => {
  const gapFrames = Math.min(STEP_CAP_FRAMES, Math.max(1, Math.ceil(Math.max(0, b.ft - a.ft) / oneFrameMs)))
  return slackDeg * gapFrames
}
const isBlindPair = (a, b) => !(isSteady(a) && isSteady(b)) && (b.ft - a.ft) > STEP_CAP_FRAMES * oneFrameMs
// 回傳最糟的一對(ratio = 觀測量 ÷ 容差)+ 形狀/疊層最大差 + 盲區清單
const worstStep = (fs) => {
  let w = { body: 0, grad: 0, hole: 0, overlay: 0, at: -1, tol: 0, ratio: 0, kind: '-', blind: [] }
  for (let i = 1; i < fs.length; i++) {
    const a = fs[i - 1], b = fs[i]
    const dft = Math.max(0, b.ft - a.ft)
    let db, dg, tol, kind
    if (isSteady(a) && isSteady(b)) {
      // 等速段:殘差 = |觀測角度差 − 期望角度差|(mod 360);本體正轉、色場反轉
      const expected = (SPIN_OMEGA * dft) / 1000
      db = wrapDelta(b.body - a.body, expected); dg = wrapDelta(b.grad - a.grad, -expected); tol = slackDeg; kind = 'steady'
    } else {
      if (isBlindPair(a, b)) { w.blind.push(`#${i} ${a.state}/${a.phase || '-'}→${b.state}/${b.phase || '-'} 相隔 ${dft.toFixed(1)}ms(> ${STEP_CAP_FRAMES} 格)`); continue }
      db = wrapDelta(b.body, a.body); dg = wrapDelta(b.grad, a.grad); tol = stepTol(a, b); kind = 'ramp'
    }
    const dh = Math.abs(b.holeDist - a.holeDist), dov = Math.abs(b.overlay - a.overlay)
    const ratio = Math.max(db, dg) / tol
    if (ratio > w.ratio) w = { ...w, ratio, body: db, grad: dg, at: i, tol, kind }
    if (dh > w.hole) w.hole = dh
    if (dov > w.overlay) w.overlay = dov
  }
  return w
}
const worst = worstStep(frames)
blind.push(...worst.blind)

// 對照組(純函式,每次都跑):證明判準在該紅的時候會紅、該放的時候會放(M32 —— 沒被證明會紅的綠燈是零證據)。
// 等速段三案:相隔 7 格的正常轉動(卡頓)要放行、次影格取樣要放行、真跳段(+120°)必須紅;
// 減速段兩案:掉一格放行、相隔 7 格記為盲區(不判、不放行)。
const steadyPair = (dtMs, deg) => [
  { ft: steadyFromFt + 1000, state: 'think', phase: null, body: 0, grad: 0, holeDist: 0, overlay: 0 },
  { ft: steadyFromFt + 1000 + dtMs, state: 'think', phase: null, body: deg, grad: -deg, holeDist: 0, overlay: 0 },
]
const rampPair = (dtMs, deg) => [
  { ft: 0, state: 'think', phase: 'exit', body: 0, grad: 0, holeDist: 0, overlay: 0 },
  { ft: dtMs, state: 'think', phase: 'exit', body: deg, grad: deg, holeDist: 0, overlay: 0 },
]
const perFrameDeg = (SPIN_OMEGA * oneFrameMs) / 1000
const passes = (fs) => { const r = worstStep(fs); return r.blind.length === 0 && r.ratio <= 1 }
const stallOk = passes(steadyPair(oneFrameMs * 7, perFrameDeg * 7))
const subFrameOk = passes(steadyPair(0.5, perFrameDeg))
const jumpCaught = !passes(steadyPair(oneFrameMs, perFrameDeg + 120))
const rampDroppedOk = passes(rampPair(oneFrameMs * 2, perFrameDeg * 2))
const rampBlind = worstStep(rampPair(oneFrameMs * 7, perFrameDeg * 7)).blind.length === 1
record('C2-ctl', '對照組:等速段卡 7 格放行、次影格取樣放行、真跳段 +120° 仍紅;減速段掉一格放行、卡 7 格記盲區', stallOk && subFrameOk && jumpCaught && rampDroppedOk && rampBlind, `等速卡頓 ${stallOk} / 次影格 ${subFrameOk} / 跳段抓到 ${jumpCaught} / 減速掉格 ${rampDroppedOk} / 減速盲區 ${rampBlind}`)
record('C2', `無跳幀(等速段:角度差 ≡ ω×Δft、殘差 ≤ ${slackDeg.toFixed(1)}°;加速/減速段:≤ 該對之間該轉的量 × 1.5;形狀 ≤ 60、疊層 ≤ 0.08)`, worst.ratio <= 1 && worst.hole <= 60 && worst.overlay <= 0.08, `worst(${worst.kind}) body ${worst.body.toFixed(1)}° grad ${worst.grad.toFixed(1)}°(當時上限 ${worst.tol.toFixed(1)}°,一格 ${oneFrameMs.toFixed(1)}ms、fps≈${fps.toFixed(0)}${stalledAt !== null ? `、對照組在 #${stalledAt} 注入 ${STALL_MS}ms 卡頓` : ''})hole ${worst.hole.toFixed(0)} overlay ${worst.overlay.toFixed(3)}`)
const c3Blind = firstExit && lastThink && (firstExit.ft - lastThink.ft) > STEP_CAP_FRAMES * oneFrameMs
if (c3Blind) blind.push(`C3 離開思考 → 減速起跑那一對取樣相隔 ${(firstExit.ft - lastThink.ft).toFixed(1)}ms(> ${STEP_CAP_FRAMES} 格)`)
const c3Tol = firstExit && lastThink ? stepTol(lastThink, firstExit) : maxStep
record('C3', `減速起點基底 = 離開思考瞬間角度(本體與色場,容差 ${c3Tol.toFixed(1)}°)`, !!firstExit && !!lastThink && (c3Blind || (wrapDelta(firstExit.bodyBase, lastThink.body) <= c3Tol && wrapDelta(-firstExit.gradBase, lastThink.body) <= c3Tol)), firstExit && lastThink ? `bodyBase ${firstExit.bodyBase.toFixed(1)} vs ${lastThink.body.toFixed(1)}; gradBase ${firstExit.gradBase.toFixed(1)}${c3Blind ? '(盲區,見下方 INSTRUMENT-FAIL)' : ''}` : 'no exit frame')
record('C4', 'still ↔ think 交接不掛淡入 class', !!first && !first.enter && !!finalStill && !finalStill.enter, `enter@think ${first?.enter} enter@still ${finalStill?.enter}`)
record('C6', '減速起跑第一格無孤兒動畫(每個 animate 都有 current interval)', !!firstExit && firstExit.unresolved === 0, `unresolved@exit-start ${firstExit?.unresolved}(等速中 ${lastThink?.unresolved} / 停定後 ${lastExit?.unresolved} 為 freeze 結束,屬正常)`)
record('C5', '減速段結束落在正位後才切靜止(最後一個 exit 影格角度 ≡ 0)', !!lastExit && wrapDelta(lastExit.body, 0) <= maxStep && wrapDelta(lastExit.grad, 0) <= maxStep, lastExit ? `last exit body ${lastExit.body.toFixed(1)} grad ${lastExit.grad.toFixed(1)}` : 'no exit frame')
const failed = findings.filter((f) => !f.pass)
if (failed.length) console.log(`✗ agent-logo-continuity ${failed.length} 條失敗`)
// 盲區:儀器在加速 / 減速段沒看到的那幾段。不是產品裁決、也不算通過(M37:沒量到 ≠ 沒發生);跟產品失敗並列印出,
// 讓「這次紅是機器卡住」與「這次紅是產品跳幀」在輸出上分得開。
if (blind.length) {
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${blind.length} 段取樣間隔超過 ${STEP_CAP_FRAMES} 格、又落在沒有封閉式期望角度的加速 / 減速段 —— 儀器沒看到這幾段(機器負載 / 主執行緒長工作),不得指控產品,也不算通過;請在負載較低時重跑`)
  for (const line of blind) console.error(`   · ${line}`)
}
if (!failed.length && !blind.length) console.log(`✅ agent-logo-continuity-invariant PASS(${frames.length} 影格${stalledAt !== null ? `,對照組卡頓落在 ${STALL} 段` : ''})`)
process.exit(failed.length || blind.length ? 1 : 0)
