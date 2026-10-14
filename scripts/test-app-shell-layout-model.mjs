#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: AppShell 四區版面模型(packages/design-system/src/components/AppShell/layout-model.ts)對 user 2026-10-14 規格寫的每一個數字例子、
 *        10-14 第二則核准的每一條(寬度紀錄、關閉的 Menu 一按出浮層、浮層收回暫藏、浮層 Esc、點連結收起、細列、浮層可疊、沒有固定門檻),
 *        以及 AI 照規格推的走查(小數上限、1050–1199 的 Menu、內容變寬 / 變窄、整段縮放序列、焦點、展開狀態)都算出
 *        `app-shell.spec.md`「版面規則」寫的那個結果。期望值是手寫的(照規格算),不是抄模型輸出。
 *   紅: 判定表任一格不符 → exit 1。`--selftest` 把模型原始碼逐一改壞(Right 放不下改浮層、浮層不留 48、連帶關閉不算細列、拿掉連帶關閉、
 *       到最大寬不停、上限取整、Menu 並排仍扣細列、點一下也寫紀錄、卡住不寫紀錄、關閉的 Menu 照字面暫藏、浮層 Esc 不關、固定 960 門檻、
 *       Menu 浮層再按 = 關閉、系統夾寬寫紀錄、並排看目標寬、用舊內容算連帶關閉、拿掉「已是浮層就維持」、細列不先扣、
 *       展開狀態跟開關紀錄走、焦點不移、並排也收起、浮層低於最小寬時吃掉留白、連帶關閉算進 Menu、內容自動變化也連帶關閉、
 *       Menu 並排時連帶關閉不扣細列),每一個都必須讓它指定的格紅;
 *       改壞版的錨點在原始碼裡找不到或不唯一 = 判定表與實作脫鉤 → exit 1。
 *   綠: 全部相符時綠;純函式無時鐘、無隨機、無 DOM,重複跑結果恆等。
 *
 * 為什麼測序列不只測單格(M37):「已是浮層就維持」「系統夾寬不寫紀錄」「關閉的面板不會自動重開」這幾條只在一串動作裡才看得出來 ——
 * 單格表永遠看不到「縮小 → 放大」之後紀錄是不是還在。所以判定表直接驅動模型的 `reduceLayout`(AppShell 之後也只呼叫這一支),
 * 每一格是一串動作加最後的斷言。
 * 呼叫端消費檢查(檔尾 C1 / C2):app-shell.tsx 真的經 reduceLayout / deriveLayout 排四區、單獨使用的 agent-panel.tsx 真的經
 * computeStandaloneAgentLayout 算自己 —— 兩邊都沒有自己的並排判斷、可拉上限或固定門檻(否則判定表驗的是平行實作);
 * `--selftest` 另把兩支呼叫端的原始碼在記憶體裡改壞(拿掉模型呼叫、塞回固定門檻),C1 / C2 必須紅。
 * C3(2026-10-14 審查抓到 `navigate-main-from-agent` 只有判定表在用、沒有任何執行面派送):模型的每一種動作都必須有 AppShell 派送它
 * (`app-shell.tsx` 裡有 `type: '<動作>'`),或明列在 `OWNER_HELD` —— 開關住在各自主人(Right 在 AppShell、AI agent 在 Dock)、
 * 每次 render 現讀,所以那幾個動作在執行面以「主人改開關」出現,不經派送。判定表綠只證明規則對,不證明有人執行它(M37「閘存在 ≠ 有人呼叫」同一族)。
 * `--selftest` 把派送拿掉,C3 必須紅。
 *
 * 行號:U:n / D:n = user 2026-10-14 第一則 / 第二則原文第 n 行(逐字收錄 governance/planning/2026-10-14-app-shell-layout-user-spec.md)。
 * Run: `node scripts/test-app-shell-layout-model.mjs`(`--selftest` 跑改壞版)
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import * as real from '../packages/design-system/src/components/AppShell/layout-model.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL = join(ROOT, 'packages/design-system/src/components/AppShell/layout-model.ts')
const SELFTEST = process.argv.includes('--selftest')
// selftest 的子行程:只跑一個改壞版(見下方 MUTANT_RUN 區塊)
const MUTANT_RUN = process.argv.includes('--mutant-run')

// ── 設定:最小 / 最大取 user 原文;初始寬 user 沒給的標 AI 假設 ──
// U:36-39:Menu 200–240、Right panel 250–500、AI agent 350–700;初始 220 / 320 / 400 = AI 假設
// report(400 / 480 / 640)、comment(200 / 280 / 400)= AI 假設的另外兩種 Right 內容,用來示範「換一種內容」
const CFG4 = {
  menu: { nav: { min: 200, initial: 220, max: 240 } },
  right: {
    detail: { min: 250, initial: 320, max: 500 },
    report: { min: 400, initial: 480, max: 640 },
    comment: { min: 200, initial: 280, max: 400 },
  },
  agent: { chat: { min: 350, initial: 400, max: 700 } },
}
// U:13:Main / Right / AI agent 最小 600 / 300 / 300;其餘 = AI 假設
const CFG2 = {
  menu: { nav: { min: 200, initial: 220, max: 240 } },
  right: { detail: { min: 300, initial: 320, max: 500 }, other: { min: 300, initial: 300, max: 500 } },
  agent: { chat: { min: 300, initial: 400, max: 700 } },
}
// U:62:浮層最小 300
const AGENT300 = { ...CFG4, agent: { chat: { min: 300, initial: 400, max: 700 } } }
// D16:現行 DS 的 AI agent 最小 360(AGENT_PANEL_WIDTH_MIN)
const AGENT360 = { ...CFG4, agent: { chat: { min: 360, initial: 400, max: 640 } } }

const ALL = { menu: true, right: true, agent: true }
const RA = { right: true, agent: true }

function makeKit(m) {
  const shell = ({ W, cfg = CFG4, rail = 0, main = 600, open = {}, right = 'detail' }) =>
    m.createLayoutState({
      availableWidth: W,
      mainMinWidth: main,
      railWidth: rail,
      overlayEdgeGap: 48, // U:55;= --layout-space-viewport-inset
      open: { menu: !!open.menu, right: !!open.right, agent: !!open.agent },
      contentType: { menu: 'nav', right, agent: 'chat' },
      widthConfig: cfg,
    })
  const act = (s, ...actions) => actions.reduce((st, a) => m.reduceLayout(st, a), s)
  const resize = (W) => ({ type: 'resize', availableWidth: W })
  const drag = (panel, width, moved = true) => ({ type: 'user-resize', panel, width, moved })
  const L = (s) => m.deriveLayout(s)
  return { shell, act, resize, drag, L }
}

const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6
const fmt = (v) => JSON.stringify(v, (_, x) => (x === undefined ? '(無)' : typeof x === 'number' ? Math.round(x * 100) / 100 : x))
/** 數字比到 1e-6(上限不取整,1440 會是 213.33…);其餘逐值全等;陣列逐格比 */
const eq = (got, want) => {
  if (Array.isArray(want)) return Array.isArray(got) && got.length === want.length && got.every((g, i) => eq(g, want[i]))
  if (typeof want === 'number') return near(got, want)
  return got === want
}
/** 一格 = 多個斷言;全部成立才綠 */
const expect = (pairs) => {
  const bad = pairs.filter(([, got, want]) => !eq(got, want))
  return { ok: bad.length === 0, detail: bad.map(([label, got, want]) => `${label}:期望 ${fmt(want)} 實得 ${fmt(got)}`).join(';') }
}

// ── 判定表 ──  [code, 出處, 名稱, (m) => { ok, detail }]
function buildTable(m) {
  const { shell, act, resize, drag, L } = makeKit(m)
  const sides = (l) => ['menu', 'right', 'agent'].map((id) => l.caps[id])
  return [
    // ══ user 第一則原文的例子與規則 ══
    ['U1', 'U:12-13', '視窗 1100、最小 600/300/300,AI agent 開著時使用者打開 Right → 合計 1200 > 1100 → 關閉 AI agent;Right 並排', () => {
      const s = act(shell({ W: 1100, cfg: CFG2, open: { agent: true } }), { type: 'request-right', contentType: 'detail' })
      return expect([['AI agent 開關紀錄', s.open.agent, false], ['Right 顯示', L(s).display.right, 'side-by-side']])
    }],
    ['U2', 'U:15', 'AI agent 開著(已因變窄成浮層)時使用者「切換」Right 內容 → 一樣檢查並關閉 AI agent', () => {
      const s = act(shell({ W: 1300, cfg: CFG2, open: RA }), resize(1100), { type: 'request-right', contentType: 'other' })
      return expect([['AI agent 開關紀錄', s.open.agent, false]])
    }],
    ['U3', 'U:16', '兩者原本並排,只因視窗縮到 1100 → AI agent 改右側浮層,不關閉', () => {
      const s0 = shell({ W: 1300, cfg: CFG2, open: RA })
      const s = act(s0, resize(1100))
      return expect([['1300 時 AI agent', L(s0).display.agent, 'side-by-side'], ['1100 時 AI agent', L(s).display.agent, 'overlay'], ['開關紀錄', s.open.agent, true]])
    }],
    ['U4', 'U:35-49', '視窗 1600、三個都開 → 可拉上限 Menu 240 / Right 330 / AI agent 430;全拉到上限時 Main 剛好 600', () => {
      const l = L(shell({ W: 1600, open: ALL }))
      return expect([['上限', sides(l), [240, 330, 430]], ['全拉滿時 Main(1600 − 模型算出的上限合計)', 1600 - sides(l).reduce((a, b) => a + b, 0), 600], ['上限合計 + Main 最小', sides(l).reduce((a, b) => a + b, 0) + 600, 1600]])
    }],
    ['U5', 'U:50', '視窗 2200 → 三個都到設定最大 240 / 500 / 700;Main 保留剩下的 760(多出 160 留給 Main)', () => {
      const l = L(shell({ W: 2200, open: ALL }))
      return expect([['上限', sides(l), [240, 500, 700]], ['留給 Main', l.surplusToMain, 160], ['全拉滿時 Main(2200 − 模型算出的上限合計)', 2200 - sides(l).reduce((a, b) => a + b, 0), 760]])
    }],
    ['U6', 'U:51', '上限只決定最多能拉多寬:2200、沒調過寬 → 顯示初始寬 220 / 320 / 400,不自動拉到上限', () => {
      const l = L(shell({ W: 2200, open: ALL }))
      return expect([['顯示寬', [l.widths.menu, l.widths.right, l.widths.agent], [220, 320, 400]], ['Main', l.mainWidth, 1260]])
    }],
    ['U7', 'U:61-62', '視窗 320、浮層最小 300 → 扣 48 只剩 272,暫時顯示 272;使用者記住的寬度不變', () => {
      const s = shell({ W: 320, cfg: AGENT300, open: { agent: true } })
      const l = L(s)
      return expect([['顯示', l.display.agent, 'overlay'], ['浮層寬', l.widths.agent, 272], ['低於最小寬', l.overlayRanges.agent?.belowMin, true], ['紀錄', s.records.agent.chat, undefined], ['目標寬仍是初始寬', m.targetWidth(s, 'agent'), 400]])
    }],
    ['U8', 'U:74', '使用者把 AI agent 設為 600 → 視窗縮到最多只能顯示 430 → 暫時 430 → 視窗恢復 → 回到 600', () => {
      const s1 = act(shell({ W: 2200, open: ALL }), drag('agent', 600))
      const s2 = act(s1, resize(1600))
      const s3 = act(s2, resize(2200))
      return expect([['2200 設定後', L(s1).widths.agent, 600], ['縮到 1600', L(s2).widths.agent, 430], ['縮小時紀錄', s2.records.agent.chat, 600], ['恢復後', L(s3).widths.agent, 600]])
    }],
    ['U9', 'U:75', '拖並排面板:寬度差只由 Main 吸收,其他面板寬度與可拉上限不變(1600、Right 往外拖到 600 → 停在上限 330)', () => {
      const s0 = act(shell({ W: 1600, open: ALL }), drag('agent', 600))
      const s1 = act(s0, drag('right', 600))
      const a = L(s0), b = L(s1)
      return expect([['拖之前 Main', a.mainWidth, 630], ['Right 顯示', b.widths.right, 330], ['Right 紀錄', s1.records.right.detail, 330], ['拖之後 Main', b.mainWidth, 620], ['Menu / AI agent 寬', [b.widths.menu, b.widths.agent], [220, 430]], ['Menu / AI agent 上限', [b.caps.menu, b.caps.agent], [240, 430]]])
    }],
    ['U10', 'U:75', '拖浮層:並排區域不受影響(1000、AI agent 浮層拖到 900 → 停在設定最大 700;Right 與 Main 不動)', () => {
      const s0 = shell({ W: 1000, open: RA })
      const s1 = act(s0, drag('agent', 900))
      const a = L(s0), b = L(s1)
      return expect([['AI agent', b.display.agent, 'overlay'], ['浮層寬', b.widths.agent, 700], ['Right 寬', [a.widths.right, b.widths.right], [320, 320]], ['Main', [a.mainWidth, b.mainWidth], [680, 680]]])
    }],
    ['U11', 'U:21', '判斷並排只看最小寬、不看使用者設的寬:1300、AI agent 紀錄 700 → 仍並排(顯示夾到上限 400,紀錄 700 不動)', () => {
      const s = act(shell({ W: 2200, open: RA }), drag('agent', 700), resize(1300))
      const l = L(s)
      return expect([['AI agent', l.display.agent, 'side-by-side'], ['顯示', l.widths.agent, 400], ['紀錄', s.records.agent.chat, 700]])
    }],
    ['U12', 'U:23、U:27', '視窗 700、只開 Right → 放不下仍並排;Main 守最小 600,整個殼水平捲動 150', () => {
      const l = L(shell({ W: 700, open: { right: true } }))
      return expect([['Right', l.display.right, 'side-by-side'], ['Right 寬', l.widths.right, 250], ['Main', l.mainWidth, 600], ['水平捲動', l.horizontalOverflow, 150]])
    }],
    ['U13', 'U:24', 'AI agent 放不下 → 右側浮層(1100、Right + AI agent:剩 250 < 350)', () => {
      return expect([['AI agent', L(shell({ W: 1100, open: RA })).display.agent, 'overlay']])
    }],
    ['U14', 'U:25-26', '1280 三個都開 → Menu 放不下、原本不是浮層 → 暫藏(開關紀錄仍是開);點開關 → 左側浮層', () => {
      const s0 = shell({ W: 1280, open: ALL })
      const s1 = act(s0, { type: 'toggle-menu' })
      return expect([['暫藏', L(s0).display.menu, 'hidden'], ['紀錄', s0.open.menu, true], ['點開關後', L(s1).display.menu, 'overlay']])
    }],
    ['U15', 'U:25', 'Menu 已是浮層、仍放不下 → 維持浮層(放到 1300 仍放不下)', () => {
      const s = act(shell({ W: 1280, open: ALL }), { type: 'toggle-menu' }, resize(1300))
      return expect([['Menu', L(s).display.menu, 'overlay']])
    }],
    ['U16', 'U:26', '已開啟的面板重新放得下 → 恢復並排(浮層 1300 → 放到 1400)', () => {
      const s = act(shell({ W: 1280, open: ALL }), { type: 'toggle-menu' }, resize(1300), resize(1400))
      return expect([['Menu', L(s).display.menu, 'side-by-side'], ['浮層旗標歸零', s.menuOverlayActive, false]])
    }],
    ['U17', 'U:27', '捲動延伸出的空間不算可用寬:700、Right 並排且要捲 150 → 再開 AI agent 仍是浮層', () => {
      const l = L(act(shell({ W: 700, open: { right: true } }), { type: 'open-agent' }))
      return expect([['AI agent', l.display.agent, 'overlay'], ['水平捲動', l.horizontalOverflow, 150]])
    }],
    ['U18', 'U:11', '暫藏不等於關閉(1280 暫藏 → 放到 1400 自己回來);已關閉的面板不會自動重開(被連帶關閉的 AI agent,換回窄內容也不回來)', () => {
      const back = L(act(shell({ W: 1280, open: ALL }), resize(1400))).display.menu
      const s = act(shell({ W: 1280, open: ALL }), { type: 'request-right', contentType: 'report' }, { type: 'request-right', contentType: 'detail' })
      return expect([['暫藏後放寬', back, 'side-by-side'], ['AI agent 紀錄', s.open.agent, false], ['AI agent 顯示', L(s).display.agent, 'closed']])
    }],
    ['U19', 'U:56-59', '浮層可拉上限 = min(設定最大, 視窗 − 48):1100 → 350–700;600 → 350–552', () => {
      const a = L(shell({ W: 1100, open: RA })).overlayRanges.agent
      const b = L(shell({ W: 600, open: RA })).overlayRanges.agent
      return expect([['1100', [a?.min, a?.max], [350, 700]], ['600', [b?.min, b?.max], [350, 552]]])
    }],
    ['U20', 'U:67、U:79', '並排與浮層共用同一份紀錄:2200 設 600 → 1100 浮層仍 600 → 600 時暫時 552 → 2200 並排回 600', () => {
      const s1 = act(shell({ W: 2200, open: ALL }), drag('agent', 600), resize(1100))
      const s2 = act(s1, resize(600))
      const s3 = act(s2, resize(2200))
      return expect([['1100', [L(s1).display.agent, L(s1).widths.agent], ['overlay', 600]], ['600', L(s2).widths.agent, 552], ['2200', [L(s3).display.agent, L(s3).widths.agent], ['side-by-side', 600]]])
    }],
    ['U21', 'U:6', '寬度設定三者皆正數且 最小 ≤ 初始 ≤ 最大,否則報錯', () => {
      const ok = m.validatePanelWidthRange({ min: 200, initial: 220, max: 240 })
      const bad1 = m.validatePanelWidthRange({ min: 300, initial: 200, max: 400 })
      const bad2 = m.validatePanelWidthRange({ min: 0, initial: 200, max: 400 })
      let threw = false
      try { m.createLayoutState({ availableWidth: 1600, mainMinWidth: 600, railWidth: 0, overlayEdgeGap: 48, open: ALL, contentType: { menu: 'nav', right: 'x', agent: 'chat' }, widthConfig: { ...CFG4, right: { x: { min: 500, initial: 300, max: 600 } } } }) } catch { threw = true }
      return expect([['合法', ok, null], ['初始 < 最小', typeof bad1, 'string'], ['非正數', typeof bad2, 'string'], ['建立時擋下', threw, true]])
    }],
    ['U22', 'U:66-67', '每種內容各一份紀錄;切換內容、關閉面板都不清(Right detail 拖到 300 → 換 comment 顯示 280 → 換回 300 → 關掉再開仍 300)', () => {
      const s1 = act(shell({ W: 1600, open: { right: true } }), drag('right', 300))
      const s2 = act(s1, { type: 'request-right', contentType: 'comment' })
      const s3 = act(s2, { type: 'request-right', contentType: 'detail' })
      const s4 = act(s3, { type: 'close-right' }, { type: 'request-right', contentType: 'detail' })
      return expect([['comment', L(s2).widths.right, 280], ['換回 detail', L(s3).widths.right, 300], ['關掉再開', L(s4).widths.right, 300]])
    }],
    ['U23', 'U:12', '連帶關閉的合計只有 Main + Right + AI agent,不含 Menu:1250、Menu 與 AI agent 開著時打開 Right → 600 + 250 + 350 = 1200 ≤ 1250 → AI agent 不關、並排(Menu 放不下 → 暫藏)', () => {
      const s = act(shell({ W: 1250, open: { menu: true, agent: true } }), { type: 'request-right', contentType: 'detail' })
      const l = L(s)
      return expect([['AI agent 開關紀錄', s.open.agent, true], ['顯示', [l.display.menu, l.display.right, l.display.agent], ['hidden', 'side-by-side', 'side-by-side']]])
    }],
    ['U24', 'U:11、U:12', '內容自動變化不是「使用者主動要求」:1280、Right 與 AI agent 開著,Right 內容自己變成最小 400 的 report → AI agent 不關(開關紀錄仍是開,放不下 → 浮層)', () => {
      const s = act(shell({ W: 1280, open: RA }), { type: 'set-content-type', panel: 'right', contentType: 'report' })
      return expect([['AI agent 開關紀錄', s.open.agent, true], ['AI agent 顯示', L(s).display.agent, 'overlay']])
    }],

    // ══ user 第二則(10-14b)核准的各條 ══
    ['D1', 'D:19', '使用者調整寬度 = 記住他當下看到的寬:紀錄 600、目前最多 430、往外拖卡在 430 → 紀錄變 430,視窗恢復仍 430', () => {
      const s1 = act(shell({ W: 2200, open: ALL }), drag('agent', 600), resize(1600), drag('agent', 650))
      const s2 = act(s1, resize(2200))
      return expect([['紀錄', s1.records.agent.chat, 430], ['恢復後', L(s2).widths.agent, 430]])
    }],
    ['D2', 'D:19', '只點一下把手沒有拖不算調整:紀錄維持 600,視窗恢復回到 600', () => {
      const s1 = act(shell({ W: 2200, open: ALL }), drag('agent', 600), resize(1600), drag('agent', 430, false))
      const s2 = act(s1, resize(2200))
      return expect([['紀錄', s1.records.agent.chat, 600], ['恢復後', L(s2).widths.agent, 600]])
    }],
    ['D3', 'D:19', '鍵盤也算調整:卡在上限時按 End(或 →)→ 紀錄 = 當下顯示的 430', () => {
      const s = act(shell({ W: 2200, open: ALL }), drag('agent', 600), resize(1600), drag('agent', 430, true))
      return expect([['紀錄', s.records.agent.chat, 430]])
    }],
    ['D4', 'D:19', '系統自動校正從不寫紀錄:2200 → 1600 → 1100 → 600 → 320 → 2200 一路縮放,紀錄始終 600、其他面板沒有紀錄', () => {
      let s = act(shell({ W: 2200, open: ALL }), drag('agent', 600))
      const seen = []
      for (const W of [1600, 1100, 600, 320, 2200]) { s = act(s, resize(W)); seen.push(s.records.agent.chat) }
      return expect([['每一步的紀錄', seen, [600, 600, 600, 600, 600]], ['Menu / Right 紀錄', [s.records.menu.nav, s.records.right.detail], [undefined, undefined]]])
    }],
    ['D5', 'D:22', 'Esc:浮層的 AI agent 先關裡面最內層、再關 AI agent;並排的不關;組字中不關', () => {
      const e = (display, innerLayerOpen, imeComposing = false) => m.resolveAgentEscape({ display, innerLayerOpen, imeComposing })
      return expect([['浮層、裡面沒東西', e('overlay', false), 'close-agent'], ['浮層、開著選單', e('overlay', true), 'close-inner-layer'], ['並排、裡面沒東西', e('side-by-side', false), 'none'], ['並排、開著選單', e('side-by-side', true), 'close-inner-layer'], ['浮層、輸入法組字中', e('overlay', false, true), 'none']])
    }],
    ['D6', 'D:23', '從 AI agent 導向 Main:浮層時 AI agent 收起;並排時維持開著', () => {
      const a = act(shell({ W: 1100, open: RA }), { type: 'navigate-main-from-agent' })
      const b = act(shell({ W: 1600, open: RA }), { type: 'navigate-main-from-agent' })
      return expect([['浮層', a.open.agent, false], ['並排', b.open.agent, true]])
    }],
    ['D7', 'D:24', '細列:Menu 並排時展開的 Menu 取代細列位置、不另扣 → 1600 上限仍 240 / 330 / 430(細列 48)', () => {
      const l = L(shell({ W: 1600, rail: 48, open: ALL }))
      return expect([['上限', sides(l), [240, 330, 430]], ['細列不在版面上', l.railInLayout, false]])
    }],
    ['D8', 'D:24', '細列:Menu 關閉時細列像 Main 最小寬一樣先扣 → 1600、細列 48:Right 上限 426、AI agent 526;48 + 426 + 526 + 600 = 1600', () => {
      const l = L(shell({ W: 1600, rail: 48, open: RA }))
      return expect([['上限', [l.caps.right, l.caps.agent], [426, 526]], ['細列 + 上限 + Main', 48 + l.caps.right + l.caps.agent + 600, 1600], ['細列在版面上', l.railInLayout, true]])
    }],
    ['D9', 'D:24', '細列 68(寬鬆密度)→ Right 416、AI agent 516', () => {
      const l = L(shell({ W: 1600, rail: 68, open: RA }))
      return expect([['上限', [l.caps.right, l.caps.agent], [416, 516]]])
    }],
    ['D10', 'D:24', '連帶關閉的合計加細列:1100 → 600+48+300+300 = 1248 > 1100 關閉;1230 → 1248 > 1230 也關閉(不加細列的話不關,AI agent 會變浮層蓋住 Right)', () => {
      const a = act(shell({ W: 1100, cfg: CFG2, rail: 48, open: { agent: true } }), { type: 'request-right', contentType: 'detail' })
      const b = act(shell({ W: 1230, cfg: CFG2, rail: 48, open: { agent: true } }), { type: 'request-right', contentType: 'detail' })
      const c = act(shell({ W: 1248, cfg: CFG2, rail: 48, open: { agent: true } }), { type: 'request-right', contentType: 'detail' })
      return expect([['1100', a.open.agent, false], ['1230', b.open.agent, false], ['1248 剛好放得下 → 不關、並排', [c.open.agent, L(c).display.agent], [true, 'side-by-side']]])
    }],
    ['D11', 'D:24', '水平捲動判斷也算細列:880、只開 Right、細列 48 → 600 + 48 + 250 = 898,捲 18', () => {
      return expect([['水平捲動', L(shell({ W: 880, rail: 48, open: { right: true } })).horizontalOverflow, 18]])
    }],
    ['D12', 'D:24', '排 Right、AI agent 前先扣細列:細列 48 時兩者並排要 1248(1247 → AI agent 浮層)', () => {
      return expect([['1247', L(shell({ W: 1247, rail: 48, open: RA })).display.agent, 'overlay'], ['1248', L(shell({ W: 1248, rail: 48, open: RA })).display.agent, 'side-by-side']])
    }],
    ['D13', 'D:25', 'Menu 原本關閉、放不下時按一下開關 → 直接出左側浮層(開關紀錄 = 開),不先變成看不到的暫藏', () => {
      const s = act(shell({ W: 1300, open: RA }), { type: 'toggle-menu' })
      return expect([['Menu', L(s).display.menu, 'overlay'], ['紀錄', s.open.menu, true]])
    }],
    ['D14', 'D:26', 'Menu 浮層開著時再按開關 / Esc / 點浮層外 → 收回暫藏,紀錄仍是開;視窗變寬時自己回來並排', () => {
      const toggled = act(shell({ W: 1300, open: RA }), { type: 'toggle-menu' }, { type: 'toggle-menu' })
      const dismissed = act(shell({ W: 1300, open: RA }), { type: 'toggle-menu' }, { type: 'dismiss-menu-overlay' })
      const widened = act(toggled, resize(1400))
      return expect([['再按開關', [L(toggled).display.menu, toggled.open.menu], ['hidden', true]], ['Esc / 點外面', [L(dismissed).display.menu, dismissed.open.menu], ['hidden', true]], ['放寬', L(widened).display.menu, 'side-by-side']])
    }],
    ['D15', 'D:27', '浮層沒有「同時只能一個」:1000、AI agent 浮層開著時叫出 Menu 浮層 → 兩個都是浮層', () => {
      const l = L(act(shell({ W: 1000, open: ALL }), { type: 'toggle-menu' }))
      return expect([['Menu', l.display.menu, 'overlay'], ['AI agent', l.display.agent, 'overlay']])
    }],
    ['D16', 'D:30', '沒有 960 / 768 / 1280 固定門檻:AI agent 何時變浮層由最小寬現算 —— 最小 360 時 960、改 350 時 950、多開最小 250 的 Right 時 1210', () => {
      const only = (W, cfg) => L(shell({ W, cfg, open: { agent: true } })).display.agent
      const withRight = (W) => L(shell({ W, cfg: AGENT360, open: RA })).display.agent
      return expect([['360:959 / 960', [only(959, AGENT360), only(960, AGENT360)], ['overlay', 'side-by-side']], ['350:949 / 950', [only(949, CFG4), only(950, CFG4)], ['overlay', 'side-by-side']], ['加 Right:1209 / 1210', [withRight(1209), withRight(1210)], ['overlay', 'side-by-side']]])
    }],
    ['D17', 'D:24', '連帶關閉的合計扣細列,不論 Menu 此刻是否並排:1230、細列 48、Menu 與 AI agent 都開、Menu 並排中 → 要求 Right(300)→ 600 + 48 + 300 + 300 = 1248 > 1230 → 關閉 AI agent,Menu 仍並排', () => {
      const s0 = shell({ W: 1230, cfg: CFG2, rail: 48, open: { menu: true, agent: true } })
      const s = act(s0, { type: 'request-right', contentType: 'detail' })
      const l = L(s)
      return expect([['要求前 Menu', L(s0).display.menu, 'side-by-side'], ['AI agent 開關紀錄', s.open.agent, false], ['要求後', [l.display.menu, l.display.right], ['side-by-side', 'side-by-side']]])
    }],

    // ══ AI 照規格推的走查(規格沒逐字寫,結果由規則機械推出)══
    ['A1', 'AI(U:31-33)', '上限不取整:1440 → 213.33 / 263.33 / 363.33,全拉滿時 Main 剛好 600(捨去的話會剩 601)', () => {
      const l = L(shell({ W: 1440, open: ALL }))
      return expect([['上限', sides(l), [640 / 3, 790 / 3, 1090 / 3]], ['全拉滿時 Main', 1440 - sides(l).reduce((a, b) => a + b, 0), 600]])
    }],
    ['A2', 'AI(U:20-26)', '1100 三個都開、AI agent 紀錄 600:AI agent 變浮層讓出空間 → Menu 反而並排(220),Right 275、Main 605', () => {
      const l = L(act(shell({ W: 2200, open: ALL }), drag('agent', 600), resize(1100)))
      return expect([['顯示', [l.display.menu, l.display.right, l.display.agent], ['side-by-side', 'side-by-side', 'overlay']], ['寬', [l.widths.menu, l.widths.right, l.widths.agent], [220, 275, 600]], ['Main', l.mainWidth, 605]])
    }],
    ['A3', 'AI(U:12、U:20)', '一次點擊三件事:1280 三個都開、把 Right 換成最小 400 的內容 → 1350 > 1280 關 AI agent → Menu 放得下回並排 → Right 顯示 440、Main 620', () => {
      const s = act(shell({ W: 1280, open: ALL }), { type: 'request-right', contentType: 'report' })
      const l = L(s)
      return expect([['AI agent', s.open.agent, false], ['Menu', l.display.menu, 'side-by-side'], ['Right 寬', l.widths.right, 440], ['Main', l.mainWidth, 620]])
    }],
    ['A4', 'AI(U:12、U:20)', '換成較窄的內容,浮層的 AI agent 自動回並排(1300、report 換 comment:1150 ≤ 1300 不關,重排後放得下)', () => {
      const s = act(shell({ W: 1400, open: RA, right: 'report' }), resize(1300))
      const before = L(s).display.agent
      const after = act(s, { type: 'request-right', contentType: 'comment' })
      return expect([['換之前', before, 'overlay'], ['換之後', [after.open.agent, L(after).display.agent], [true, 'side-by-side']]])
    }],
    ['A5', 'AI(D:19 + U:70-71)', '浮層低於最小寬時拖:320、浮層 272 → 拖(有位移)→ 紀錄 = 272;視窗放到 2200 → 夾到最近的合法寬 300', () => {
      const s1 = act(shell({ W: 320, cfg: AGENT300, open: { agent: true } }), drag('agent', 200))
      const s2 = act(s1, resize(2200))
      return expect([['紀錄', s1.records.agent.chat, 272], ['放寬後', [L(s2).display.agent, L(s2).widths.agent], ['side-by-side', 300]]])
    }],
    ['A6', 'AI(U:5、U:27)', '視窗比 Main 最小寬還窄(500)、什麼都沒開 → Main 守 600,捲 100', () => {
      const l = L(shell({ W: 500 }))
      return expect([['Main', l.mainWidth, 600], ['水平捲動', l.horizontalOverflow, 100]])
    }],
    ['A7', 'AI(U:20-26)', '沒細列時 1050–1199:AI agent 先變浮層、Menu 回來並排;1049 與 1200 Menu 暫藏', () => {
      const d = (W) => { const l = L(shell({ W, open: ALL })); return [l.display.menu, l.display.agent] }
      return expect([['1049', d(1049), ['hidden', 'overlay']], ['1050', d(1050), ['side-by-side', 'overlay']], ['1199', d(1199), ['side-by-side', 'overlay']], ['1200', d(1200), ['hidden', 'side-by-side']]])
    }],
    ['A8', 'AI(全規則)', '三個都開、AI agent 紀錄 600,視窗 2200 → 320 → 2200 一路縮放(每一步顯示與 Main / 捲動)', () => {
      let s = act(shell({ W: 2200, open: ALL }), drag('agent', 600))
      const snap = () => { const l = L(s); return [l.display.menu, l.widths.menu ?? null, l.widths.right, l.display.agent, l.widths.agent, l.mainWidth, l.horizontalOverflow] }
      const want = {
        2200: ['side-by-side', 220, 320, 'side-by-side', 600, 1060, 0],
        1600: ['side-by-side', 220, 320, 'side-by-side', 430, 630, 0],
        1440: ['side-by-side', 640 / 3, 790 / 3, 'side-by-side', 1090 / 3, 600, 0],
        1280: ['hidden', null, 290, 'side-by-side', 390, 600, 0],
        1200: ['hidden', null, 250, 'side-by-side', 350, 600, 0],
        1100: ['side-by-side', 220, 275, 'overlay', 600, 605, 0],
        960: ['hidden', null, 320, 'overlay', 600, 640, 0],
        700: ['hidden', null, 250, 'overlay', 600, 600, 150],
        500: ['hidden', null, 250, 'overlay', 452, 600, 350],
        320: ['hidden', null, 250, 'overlay', 272, 600, 530],
      }
      const pairs = []
      for (const W of [1600, 1440, 1280, 1200, 1100, 960, 700, 500, 320]) { s = act(s, resize(W)); pairs.push([`${W}`, snap(), want[W]]) }
      s = act(s, resize(2200)); pairs.push(['回到 2200', snap(), want[2200]])
      return expect(pairs)
    }],
    ['A9', 'AI(K7 既有後備、WCAG 2.4.3)', '焦點:焦點所在的面板被版面暫藏或被「要求 Right」連帶關閉 → 回 Main(#app-shell-main,DS 既有後備);沒被收掉 → 不動', () => {
      const after = { menu: 'hidden', right: 'side-by-side', agent: 'closed' }
      const f = (focusedPanel) => m.resolveFocusAfterLayoutChange({ focusedPanel, displayAfter: after })
      return expect([['Menu 暫藏', f('menu'), 'main'], ['AI agent 被連帶關閉', f('agent'), 'main'], ['焦點在 Right', f('right'), null], ['焦點在 Main', f('main'), null]])
    }],
    ['A10', 'AI(W3C APG Disclosure)', '開關鈕 aria-expanded 跟畫面:並排 / 浮層 = true;暫藏 / 關閉 = false', () => {
      return expect([['四態', ['side-by-side', 'overlay', 'hidden', 'closed'].map(m.isPanelExpanded), [true, true, false, false]]])
    }],
    ['A11', 'AI(U:67)', 'Menu 浮層與並排共用紀錄:1280 浮層拖到 235 → 1400 並排(上限 200)顯示 200 → 1700 並排顯示 235', () => {
      const s1 = act(shell({ W: 1280, open: ALL }), { type: 'toggle-menu' }, drag('menu', 235))
      const s2 = act(s1, resize(1400))
      const s3 = act(s2, resize(1700))
      return expect([['浮層', [L(s1).display.menu, L(s1).widths.menu], ['overlay', 235]], ['1400', [L(s2).display.menu, L(s2).widths.menu], ['side-by-side', 200]], ['1700', L(s3).widths.menu, 235], ['紀錄', s3.records.menu.nav, 235]])
    }],

    ['A12', 'AI(U:31-33、U:75)', '上限是替其他面板預留的:1600、三個都開、Right 紀錄 480 → Right 只顯示 330、Main 650;多的 50 留給 Menu(+20)與 AI agent(+30)拉到各自上限', () => {
      const l = L(act(shell({ W: 2200, open: ALL }), drag('right', 480), resize(1600)))
      return expect([['Right', l.widths.right, 330], ['Main', l.mainWidth, 650], ['Menu / AI agent 還能拉', [l.caps.menu - l.widths.menu, l.caps.agent - l.widths.agent], [20, 30]]])
    }],

    // ══ 性質(逐格窮舉,不抽樣、不隨機)══
    ['P1', 'U:33、D:24', '每一種開啟組合 × 視窗 600–2800(每 10px)× 細列 0 / 48 / 68:不捲動時 細列 + 上限合計 + Main 最小 + 留給 Main 的 = 視窗寬,而且只有全部到最大寬時才有留給 Main 的;要捲動時上限 = 最小寬、Main = 最小寬', () => {
      const combos = [ALL, RA, { menu: true, agent: true }, { menu: true, right: true }, { agent: true }, { right: true }, { menu: true }]
      let n = 0
      const bad = []
      for (const open of combos) for (const rail of [0, 48, 68]) for (let W = 600; W <= 2800; W += 10) {
        const l = L(shell({ W, rail, open }))
        const ids = ['menu', 'right', 'agent'].filter((id) => l.display[id] === 'side-by-side')
        const capSum = ids.reduce((a, id) => a + l.caps[id], 0)
        // 細列只在 Menu 沒並排時佔版面(D:24)—— 照規則自己算,不讀模型的 railInLayout
        const railPart = l.display.menu === 'side-by-side' ? 0 : rail
        const cfgOf = (id) => CFG4[id][id === 'menu' ? 'nav' : id === 'right' ? 'detail' : 'chat']
        n++
        if (!ids.every((id) => l.caps[id] >= cfgOf(id).min - 1e-6 && l.caps[id] <= cfgOf(id).max + 1e-6)) { bad.push(`W${W}/細列${rail}/${ids}:上限超出 [最小, 最大]`); continue }
        if (l.horizontalOverflow > 0) {
          if (!(ids.every((id) => near(l.caps[id], CFG4[id][id === 'menu' ? 'nav' : id === 'right' ? 'detail' : 'chat'].min)) && near(l.mainWidth, 600))) bad.push(`W${W}/細列${rail}/${ids}`)
        } else {
          const allMax = ids.every((id) => near(l.caps[id], CFG4[id][id === 'menu' ? 'nav' : id === 'right' ? 'detail' : 'chat'].max))
          if (!near(railPart + capSum + 600 + l.surplusToMain, W) || (l.surplusToMain > 1e-6 && !allMax)) bad.push(`W${W}/細列${rail}/${ids}`)
        }
      }
      return expect([[`${n} 格中違反的格`, bad.slice(0, 5).join(' '), '']])
    }],
    ['P2', 'U:12、D:24', '使用者要求 Right 之後,AI agent 只會並排或被關,不會變成蓋住 Right 的浮層(視窗 900–1600 每 10px × 三種 Right 內容 × 細列 0 / 48 × Menu 開 / 關)', () => {
      let n = 0
      const bad = []
      for (let W = 900; W <= 1600; W += 10) for (const type of ['detail', 'report', 'comment']) for (const rail of [0, 48]) for (const menu of [false, true]) {
        const l = L(act(shell({ W, rail, open: { agent: true, menu } }), { type: 'request-right', contentType: type }))
        n++
        if (l.display.agent === 'overlay') bad.push(`W${W}/${type}/細列${rail}/Menu${menu ? '開' : '關'}`)
      }
      return expect([[`${n} 格中 AI agent 變浮層的格`, bad.slice(0, 5).join(' '), '']])
    }],
  ]
}

function runTable(m) {
  return buildTable(m).map(([code, src, name, fn]) => {
    try {
      const { ok, detail } = fn()
      return { code, src, name, ok, detail }
    } catch (error) {
      return { code, src, name, ok: false, detail: `丟出例外:${error.message}` }
    }
  })
}

// ── 改壞版(selftest):每個只改模型原始碼一處,必須讓指定的格紅 ──  [名稱, 找, 換成, 必紅]
const MUTANTS = [
  ['Right 放不下改成浮層(違反 U:23)', "if (fits || id === 'right') {", 'if (fits) {', ['U12', 'A8', 'D11']],
  ['浮層不留 48', 'Math.min(max, availableWidth - edgeGap)', 'Math.min(max, availableWidth)', ['U7', 'U19', 'A8']],
  ['連帶關閉不算細列', 'input.mainMinWidth + input.railWidth + input.rightMinWidth', 'input.mainMinWidth + input.rightMinWidth', ['D10', 'P2']],
  ['拿掉連帶關閉', 'if (!input.agentOpen) return false', 'if (!input.agentOpen || input.agentOpen) return false', ['U1', 'U2', 'A3', 'D10', 'P2']],
  ['到設定最大寬不停(剩餘一直均分)', 'const reachingMax = growing.filter((p) => p.max - (caps[p.id] as number) <= share + EPSILON)', 'const reachingMax = growing.filter(() => false)', ['U4', 'U5', 'P1']],
  ['可拉上限無條件捨去', 'for (const p of growing) caps[p.id] = (caps[p.id] as number) + share', 'for (const p of growing) caps[p.id] = Math.floor((caps[p.id] as number) + share)', ['A1', 'A8', 'P1']],
  ['Menu 並排時仍扣細列', "const railInLayout = railWidth > 0 && display.menu !== 'side-by-side'", 'const railInLayout = railWidth > 0', ['D7', 'P1']],
  ['只點一下也寫紀錄', 'return input.moved ? input.displayedWidth : input.previousRecord', 'return input.displayedWidth', ['D2']],
  ['卡住沒變寬就不寫紀錄(10-14 第二則之前的 AI 預設)', 'displayedWidth, moved: action.moved })', 'displayedWidth, moved: action.moved && displayedWidth !== layout.widths[action.panel] })', ['D1', 'D3']],
  ['關閉的 Menu 放不下時照字面暫藏(按了沒反應)', 'return { ...state, open: { ...state.open, menu: true }, menuOverlayActive: true }', 'return { ...state, open: { ...state.open, menu: true } }', ['D13']],
  ['浮層時 Esc 不關 AI agent(10-14 之前的規則)', "return input.display === 'overlay' ? 'close-agent' : 'none'", "return 'none'", ['D5']],
  ['固定 960 門檻', 'const fits = availableWidth - reserved >= minWidth[id]', "const fits = id === 'agent' ? availableWidth >= 960 : availableWidth - reserved >= minWidth[id]", ['U13', 'D16', 'A2', 'A7']],
  ['Menu 浮層再按開關 = 關閉 Menu', "if (shown === 'overlay') return { ...state, menuOverlayActive: false }", "if (shown === 'overlay') return { ...state, open: { ...state.open, menu: false }, menuOverlayActive: false }", ['D14']],
  ['系統夾寬寫進紀錄', '      return { ...state, availableWidth: action.availableWidth }', '      { const s = { ...state, availableWidth: action.availableWidth }; const l = deriveLayout(s); const records = { ...s.records }; for (const id of PANEL_PLACEMENT_ORDER) { if (l.widths[id] !== undefined) records[id] = { ...records[id], [s.contentType[id]]: l.widths[id] as number } } return { ...s, records } }', ['U8', 'D4', 'U20']],
  ['判斷並排看目標寬不看最小寬(違反 U:21)', 'const minWidth = { menu: widths.menu.min, right: widths.right.min, agent: widths.agent.min }', 'const minWidth = { menu: targets.menu, right: targets.right, agent: targets.agent }', ['U11']],
  ['連帶關閉用 Right 舊內容的最小寬', 'rightMinWidth: rightMin,', "rightMinWidth: currentWidthRange(state, 'right').min,", ['A3']],
  ['拿掉「已是浮層就維持」', "else display.menu = menuOverlayActive ? 'overlay' : 'hidden'", "else display.menu = 'hidden'", ['U14', 'D13', 'D15']],
  ['排 Right、AI agent 前不先扣細列', 'let reserved = mainMinWidth + railWidth', 'let reserved = mainMinWidth', ['D12']],
  ['aria-expanded 跟開關紀錄走(暫藏也算展開)', "return display === 'side-by-side' || display === 'overlay'", "return display !== 'closed'", ['A10']],
  ['被版面收掉時焦點不移', "return 'main' // K7:沿用既有後備", 'return null', ['A9']],
  ['並排時從 AI agent 導向 Main 也收起', "return deriveLayout(state).display.agent === 'overlay' ? { ...state, open: { ...state.open, agent: false } } : state", 'return { ...state, open: { ...state.open, agent: false } }', ['D6']],
  ['浮層放不下最小寬時吃掉留白(維持最小寬)', 'if (hi < min) return { min: hi, max: hi, belowMin: true }', 'if (hi < min) return { min, max: min, belowMin: false }', ['U7', 'A5']],
  ['連帶關閉把 Menu 的最小寬也算進合計(違反 U:12)', 'agentMinWidth: currentWidthRange(state, \'agent\').min,', "agentMinWidth: currentWidthRange(state, 'agent').min + (state.open.menu ? currentWidthRange(state, 'menu').min : 0),", ['U23']],
  ['內容自動變化也走連帶關閉(違反 U:11)', "    case 'set-content-type':\n", "    case 'set-content-type':\n      if (action.panel === 'right') return applyAction(state, { type: 'request-right', contentType: action.contentType })\n", ['U24']],
  ['Menu 並排時連帶關閉不扣細列(§6 舊措辭)', '        railWidth: state.railWidth,\n        rightMinWidth: rightMin,', "        railWidth: deriveLayout(state).display.menu === 'side-by-side' ? 0 : state.railWidth,\n        rightMinWidth: rightMin,", ['D17', 'P2']],
]

const results = runTable(real)
const failed = results.filter((r) => !r.ok)

// ── 呼叫端真的消費模型(C1 / C2;M37:判定表綠只證明模型對,不證明頁面用的是它)──
const APP_SHELL_TSX = join(ROOT, 'packages/design-system/src/components/AppShell/app-shell.tsx')
const AGENT_PANEL_TSX = join(ROOT, 'packages/design-system/src/components/AgentPanel/agent-panel.tsx')
/** 任何一個「自己算版面」的跡象:固定門檻、比例上限、自己的並排判斷 */
const PARALLEL = [/\b960\b/, /\b768\b/, /\b1280\b/, /\* ?3 ?\/ ?8/, /useIsNarrowViewport/, /matchMedia\(/, /SIDE_BY_SIDE_MIN/, /function placePanels|function computeSideBySideCaps|function computeOverlayRange/]
function callerChecks(appShellSrc, agentPanelSrc) {
  const appShell = /from '\.\/layout-model'/.test(appShellSrc) && /reduceLayout\(/.test(appShellSrc) && /deriveLayout\(/.test(appShellSrc)
    && !PARALLEL.some((re) => re.test(appShellSrc.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')))
  const agent = /from '@\/design-system\/components\/AppShell\/layout-model'/.test(agentPanelSrc) && /computeStandaloneAgentLayout\(/.test(agentPanelSrc)
    && /useAppShellPanel\(\s*'agent'/.test(agentPanelSrc)
    && !PARALLEL.some((re) => re.test(agentPanelSrc.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')))
  const unreached = modelActionTypes(readFileSync(MODEL, 'utf8')).filter((type) => !OWNER_HELD[type] && !appShellSrc.includes(`type: '${type}'`))
  return [
    { code: 'C1', ok: appShell, name: 'app-shell.tsx 經 layout-model 的 reduceLayout / deriveLayout 排四區,沒有自己的門檻、比例或並排判斷' },
    { code: 'C2', ok: agent, name: 'agent-panel.tsx 在 AppShell 裡由 AppShell 給版面(useAppShellPanel)、單獨使用時經 computeStandaloneAgentLayout 只算自己,沒有 960 / 3/8' },
    { code: 'C3', ok: unreached.length === 0, name: `模型的每一種動作都有執行面(app-shell.tsx 派送,或主人持有的開關)${unreached.length ? ` —— 沒有人派送:${unreached.join(', ')}` : ''}` },
  ]
}
/** 模型 `LayoutAction` 聯集裡的每一種 `type`。 */
function modelActionTypes(modelSrc) {
  const block = modelSrc.slice(modelSrc.indexOf('export type LayoutAction ='), modelSrc.indexOf('/** 目前內容類型的寬度設定。 */'))
  return [...block.matchAll(/\|\s*\{\s*type:\s*'([a-z-]+)'/g)].map((m) => m[1])
}
/** 不經派送、由開關的主人在執行面直接改的動作(AppShell 每次 render 讀回主人的開關;app-shell-context.ts「開關也各有主人」)。 */
const OWNER_HELD = {
  'close-right': 'Right 的開關住在 AppShell(`asideOpen` / `onAsideOpenChange`),× 與 ⌘. 直接改它',
  'open-agent': 'AI agent 的開關住在 AgentPanelDock,入口鈕直接改它',
  'close-agent': 'AI agent 的開關住在 AgentPanelDock,×、遮罩、Esc 直接改它',
}
const callers = callerChecks(readFileSync(APP_SHELL_TSX, 'utf8'), readFileSync(AGENT_PANEL_TSX, 'utf8'))
const callerFailed = callers.filter((c) => !c.ok)

if (MUTANT_RUN) {
  // 子行程:只跑一個改壞版。改壞的原始碼用 esbuild 打包成固定檔名,再以字面字串 import ——
  // 治理 harness 只允許字面字串的 import()(infra/governance/lib/harness-source-inventory.mjs「forbidden dynamic module loading」;
  // 與 scripts/test-agent-fab-drag-zones.mjs 同一做法)。每個子行程只 import 一次,不會吃到模組快取。
  const index = Number(process.env.APP_SHELL_MUTANT_INDEX)
  const entry = Number.isInteger(index) ? MUTANTS[index] : undefined
  if (!entry) { console.log(`MUTANT_RESULT ${JSON.stringify({ error: `沒有第 ${process.env.APP_SHELL_MUTANT_INDEX} 個改壞版` })}`); process.exit(2) }
  const [, find, replace] = entry
  const { outputFiles } = await build({
    stdin: { contents: readFileSync(MODEL, 'utf8').replace(find, replace), resolveDir: dirname(MODEL), sourcefile: 'layout-model.ts', loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    absWorkingDir: ROOT,
    logLevel: 'silent',
  })
  mkdirSync(join(ROOT, 'scripts/.gate-bundles'), { recursive: true })
  writeFileSync(join(ROOT, 'scripts/.gate-bundles/app-shell-layout-model-mutant.mjs'), outputFiles[0].text)
  const mutant = await import('./.gate-bundles/app-shell-layout-model-mutant.mjs')
  console.log(`MUTANT_RESULT ${JSON.stringify({ red: runTable(mutant).filter((r) => !r.ok).map((r) => r.code) })}`)
  process.exit(0)
}

if (SELFTEST) {
  if (failed.length) {
    for (const r of failed) console.log(`✗ ${r.code} ${r.name} | ${r.detail}`)
    console.log(`\n✗ selftest 前提不成立:現行模型本身就有 ${failed.length} 格不符`)
    process.exit(1)
  }
  const source = readFileSync(MODEL, 'utf8')
  const problems = []
  for (const [index, [name, find, , mustFail]] of MUTANTS.entries()) {
    const hits = source.split(find).length - 1
    if (hits !== 1) { problems.push(`「${name}」的錨點在模型原始碼出現 ${hits} 次(必須剛好 1 次)—— 判定表與實作脫鉤`); continue }
    // 每個改壞版在自己的子行程裡打包、載入、跑判定表(見 MUTANT_RUN 區塊)
    const child = spawnSync(process.execPath, ['--', 'scripts/test-app-shell-layout-model.mjs', '--mutant-run'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, APP_SHELL_MUTANT_INDEX: String(index) },
    })
    const line = (child.stdout ?? '').split('\n').find((l) => l.startsWith('MUTANT_RESULT '))
    const result = line ? JSON.parse(line.slice('MUTANT_RESULT '.length)) : null
    if (child.status !== 0 || !result || !Array.isArray(result.red)) {
      problems.push(`「${name}」的子行程沒有回報判定結果(exit ${child.status}):${(child.stderr ?? '').slice(0, 300)}${result?.error ?? ''}`)
      continue
    }
    const red = new Set(result.red)
    const notRed = mustFail.filter((c) => !red.has(c))
    if (notRed.length) problems.push(`「${name}」沒讓 ${notRed.join(', ')} 紅(實際紅:${[...red].join(', ') || '無'})`)
    else console.log(`✓ 改壞版「${name}」→ ${mustFail.join(', ')} 紅`)
  }
  // 呼叫端的對照組:在記憶體裡把呼叫端改壞,C1 / C2 必須紅
  const appSrc = readFileSync(APP_SHELL_TSX, 'utf8')
  const agentSrc = readFileSync(AGENT_PANEL_TSX, 'utf8')
  if (callerFailed.length) problems.push(`前提不成立:現行呼叫端 ${callerFailed.map((c) => c.code).join(', ')} 就不符`)
  const CALLER_MUTANTS = [
    ['app-shell.tsx 不經 reduceLayout(平行實作)', () => callerChecks(appSrc.replaceAll('reduceLayout(', 'reduceLayoutLocal('), agentSrc), 'C1'],
    ['app-shell.tsx 塞回 768 斷點', () => callerChecks(appSrc + '\nconst NARROW = 768\n', agentSrc), 'C1'],
    ['agent-panel.tsx 單獨使用時塞回 960 門檻', () => callerChecks(appSrc, agentSrc + '\nconst SIDE = 960\n'), 'C2'],
    ['agent-panel.tsx 不經 computeStandaloneAgentLayout', () => callerChecks(appSrc, agentSrc.replaceAll('computeStandaloneAgentLayout(', 'localLayout(')), 'C2'],
    ['app-shell.tsx 不派送「從 AI agent 導向 Main」(模型規則沒有執行面)', () => callerChecks(appSrc.replaceAll("type: 'navigate-main-from-agent'", "type: 'resize'"), agentSrc), 'C3'],
  ]
  for (const [name, run, code] of CALLER_MUTANTS) {
    const red = run().filter((c) => !c.ok).map((c) => c.code)
    if (!red.includes(code)) problems.push(`呼叫端改壞版「${name}」沒讓 ${code} 紅`)
    else console.log(`✓ 呼叫端改壞版「${name}」→ ${code} 紅`)
  }
  if (problems.length) { console.log(`\n✗ selftest:\n  ${problems.join('\n  ')}`); process.exit(1) }
  console.log(`\n✓ selftest:${MUTANTS.length} 個改壞版各自讓指定的格紅了,判定表會紅;${CALLER_MUTANTS.length} 個呼叫端改壞版各自讓 C1 / C2 / C3 紅`)
  process.exit(0)
}

for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.code} [${r.src}] ${r.name}${r.ok ? '' : `\n    ${r.detail}`}`)
for (const c of callers) console.log(`${c.ok ? '✓' : '✗'} ${c.code} [呼叫端] ${c.name}`)
const total = failed.length + callerFailed.length
console.log(total ? `\n✗ ${total} 格不符` : `\n✅ AppShell 版面模型判定表 ${results.length} 格全部相符;呼叫端檢查 ${callers.length} 條全部成立`)
process.exit(total ? 1 : 0)
