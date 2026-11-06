#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 真的 AppShell 頁面(設計規格「狀態行為」story)在真實視窗寬度、真的按鍵 / 點擊 / 拖曳之下,四區的顯示方式、寬度、可拉上限、
 *         Main 寬、水平捲動距離、Menu 開關的 aria-expanded,逐步都等於可執行模型 `layout-model.ts` 對同一串動作算出的結果;
 *         user 2026-10-14 規格裡的數字例子(1100 要求 Right 關 AI agent、縮到 1100 變浮層不關、1600 上限 240/330/430 全拉滿 Main 600、
 *         2200 → 240/500/700 Main 760、320 浮層 272、600 → 430 → 600、卡住時拖 / 只點一下)在真頁面上逐一成立;另守 AI agent 浮層的遮罩、
 *         另一側 ≥ 48、水平捲動時浮層釘在看得到的範圍、浮層時宿主不可操作、把手外側命中、Esc 依形態、焦點後備與層級 40 < 45 < 50。
 *         另守 S14–S28 的保留斷言(逐條見下方「保留斷言」)。
 *   紅: 任一步頁面與模型不符、任一個數字例子不成立、任一條保留斷言不成立 → exit 1。`--selftest` 兩種對照組:
 *       (a) 用同一批量到的頁面快照,改用 9 個改壞的模型(Right 放不下改浮層、固定 960 門檻、上限不均分、浮層不留 48、細列不先扣、拿掉連帶關閉、
 *           只點一下也寫紀錄、關閉的 Menu 照字面暫藏、捲動時 Main 不守最小寬)重算期望 —— 每一個都必須至少一格不符;
 *       (b) 對頁面注入 21 種破壞(逐條見下方「頁面破壞」)—— 每一種都必須讓指定的斷言紅。
 *       story 開不起來 = 儀器失效,點名 story、exit 1(不當通過)。
 *   綠: 頁面每一步都等於模型、數字例子與保留斷言全部成立時綠;期望值由模型對同一串動作算出,寬度比到 0.75px(瀏覽器以小數 px 排版)。
 *
 * 保留斷言(@gate-contract「保證」的細目):
 *         2026-10-14 審查補(S14–S22):拖過 / 只按過 Menu 浮層的把手之後點浮層外照樣收回暫藏;用滑鼠點進 AI agent 浮層再按 Esc、
 *         載入就是浮層時直接按 Esc,焦點都回入口鈕;沒細列的 Menu 寬 0 時裡面沒有可聚焦的東西;AI agent 變浮層那一刻已開著的 Menu 浮層 /
 *         確認框照樣可點、焦點留在裡面;殼水平捲時按「顯示詳情」打開的 Right 整個在看得到的範圍裡;浮層裡展開的 Menu 群組回到並排仍展開;
 *         AI agent 裡的連結導向 Main 時,浮層收起、焦點回 Main,並排不動(四區版面 story)。
 *         2026-10-15 r1b 複驗補(S23–S25):Menu 浮層深色模式底色不透明(= `--surface-raised`,F2);浮層裡第一個 Tab 停點看得到(不是 sr-only 裡的
 *         「關閉」,N2);焦點在浮層選單項上按一下 Esc 就收回、展開的選單項沒有 aria-describedby / 不開提示(N3);primary-header 叫出 Menu 浮層時
 *         被蓋住的細列不長出標頭、圖示不跳、品牌只在浮層那一份(F4);三顆拖寬把手名稱分得出來、各自以 aria-controls 指向自己那一區(F9)。
 *         2026-10-20 r1b 複核補(S26–S28 + 既有格加斷言):AI agent 浮層開著時,模擬瀏覽器的工具列(不是宿主)不在 inert 裡、網址列聚焦得到也點得到(D3);
 *         兩則「放不下時」示範的殼 = 模擬瀏覽器畫布、浮層與遮罩都在畫布裡(F10);從 AI agent 導到 Insights 時右側詳情一起收起(S21 / S22,F11);
 *         Menu 浮層的無障礙名稱 = 「選單」、不掛描述(S23,N4)。
 *
 * 頁面破壞(@gate-contract「紅」(b) 的細目):
 *       (CSS:浮層貼左、藏遮罩、面板根節點 overflow:hidden、捲動容器不准捲、版面上那份 Menu 的群組內容藏起來;
 *           腳本:Menu 浮層把手擋下 pointerdown、入口鈕一拿到焦點就丟掉、拿掉寬 0 Menu 的 inert、浮層時把上面那層設 inert、
 *           殼一捲就捲回 0、AI agent 裡的連結點了沒反應;2026-10-15 補:Menu 浮層底色改回 `--surface`、浮層頂端塞一顆 sr-only「關閉」、
 *           選單項聚焦時吞掉第一下 Esc 並掛 describedby、浮層開著時細列那份長出 48px 標頭、把手拿掉 aria-controls 並改回同名;
 *           2026-10-20 補:AI agent 浮層把模擬瀏覽器工具列也設 inert、畫布拿掉 transform(浮層改以視窗定位、蓋出畫布)、殼縮成畫布的 70%、
 *           導到 Insights 後又把詳情打開、Menu 浮層名稱改回「Sidebar」並掛描述)—— 每一個都必須讓指定的斷言紅(檔尾 DOM_SABOTAGE)。
 *
 * 為什麼要有這支(取代 2026-10-14 前的 scripts/agent-panel-breakpoint.mjs):舊閘驗「容器 ≥ 960 才並排」「上限 = 容器 × 3/8」「浮層左留 48、不畫把手」,
 * 那套規則被 user 2026-10-14 規格整套取代(app-shell.spec.md「版面規則」;D:30 清單 #38 / #43 / #104)。純函式判定表
 * `scripts/test-app-shell-layout-model.mjs` 證明模型照規格算,但模型對不代表頁面對 —— 本閘證明**頁面真的照模型排**(M37:不拿「模型對」代替「頁面對」)。
 * 舊閘保留的四段(浮層遮罩與點擊關閉、層級 40 < 45 < 50、把手外側 2px 命中、浮層時宿主不可操作)搬進這裡,斷言對象改成 AppShell 裡的 AI agent。
 *
 * Run: `node scripts/app-shell-layout-invariant.mjs [--static=<dir>] [--selftest]`(預設讀 `storybook-static`)
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as realModel from '../packages/design-system/src/components/AppShell/layout-model.ts'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import {
  openStory,
  StoryRenderInstrumentError,
  launchBrowserOrSkip,
  requireFreshStorybookBuild,
  settleAfterInteraction,
  waitForFocusStable,
} from './lib/launch-browser.mjs'

const ROOT = process.cwd()
const MODEL_PATH = join(ROOT, 'packages/design-system/src/components/AppShell/layout-model.ts')
const staticArg = process.argv.find((a) => a.startsWith('--static='))?.slice('--static='.length)
const S = staticArg ? (staticArg.startsWith('/') ? staticArg : join(ROOT, staticArg)) : join(ROOT, 'storybook-static')
const SELFTEST = process.argv.includes('--selftest')
requireFreshStorybookBuild(S, [
  'packages/design-system/src/components/AppShell/app-shell.tsx',
  'packages/design-system/src/components/AppShell/layout-model.ts',
  'packages/design-system/src/components/Sidebar/sidebar.tsx',
  'packages/design-system/src/components/AgentPanel/agent-panel.tsx',
  'packages/design-system/src/components/AppShell/app-shell.anatomy.stories.tsx',
  'packages/design-system/src/components/AppShell/app-shell.stories.tsx',
  'packages/design-system/src/components/AppShell/_demo-helpers.tsx',
  'packages/design-system/src/components/AgentPanel/agent-panel-fab.tsx',
  'packages/design-system/src/patterns/resize-handle/resize-handle.tsx',
  'packages/design-system/src/hooks/use-input-modality.ts',
  'packages/design-system/src/components/Sheet/sheet.tsx',
  'packages/design-system/src/components/Tooltip/tooltip.tsx',
])

const STORY = 'design-system-components-appshell-設計規格--state-behavior'
/** 寬度比對容差:瀏覽器以小數 px 排版(上限不取整,1440 會是 213.33…)。 */
const TOL = 0.75
const SETTLE_FRAMES = 10
/** 單一互動(點擊 / 聚焦)等元素的上限:等不到 = 這一步做不下去(頁面狀態不對),記成這一格紅、跳過這個情境剩下的步驟,不是儀器失效。 */
const ACTION_TIMEOUT = 5000

// ── 設定(與 story 的 args 一一對應)──
// A = user 規格 U:36-39(Main 600、Menu 200–240、Right 250–500、AI agent 350–700);初始寬 220 / 320 / 400 = AI 假設(同判定表 CFG4)
const A = { mainMinWidth: 600, menu: [200, 220, 240], right: [250, 320, 500], agent: [350, 400, 700] }
// B = U:13(Main / Right / AI agent 最小 600 / 300 / 300)
const B = { mainMinWidth: 600, menu: [200, 220, 240], right: [300, 320, 500], agent: [300, 400, 700] }
const CONTENT = { menu: 'default', right: 'issue-detail', agent: 'conversation' }
const rangeOf = ([min, initial, max]) => ({ min, initial, max })

function storyUrl(origin, cfg, rail, open) {
  const a = {
    mainMinWidth: cfg.mainMinWidth,
    menuMin: cfg.menu[0], menuInitial: cfg.menu[1], menuMax: cfg.menu[2],
    rightMin: cfg.right[0], rightInitial: cfg.right[1], rightMax: cfg.right[2],
    agentMin: cfg.agent[0], agentInitial: cfg.agent[1], agentMax: cfg.agent[2],
    rail: rail ? '!true' : '!false',
    menuOpen: open.menu ? '!true' : '!false',
    rightOpen: open.right ? '!true' : '!false',
    agentOpen: open.agent ? '!true' : '!false',
  }
  const args = Object.entries(a).map(([k, v]) => `${k}:${v}`).join(';')
  return `${origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story&args=${args}`
}

// ── 情境:一串真動作,每一步之後量頁面、與模型對同一串動作算出的結果比 ──
// step 種類:{ W } 縮放 / { end: panel } 把手上按 End / { drag: panel, dx } 拖把手 / { click: panel } 只點把手不拖 /
//           { key: 'shortcutRight' | 'shortcutMenu' | 'Escape' } / { trigger: true } 點 Menu 開關 / { focus: 'agent' } / { scrim: true } 點遮罩留白處
const SCENARIOS = [
  { id: 'S1', title: 'U:20-27 縮放序列(三個都開、有細列):Right → AI agent → Menu 依序、放得下就並排、放不下 AI agent 浮層 / Menu 暫藏、捲動、放寬後恢復並排',
    cfg: A, rail: true, open: { menu: true, right: true, agent: true },
    steps: [{ W: 2200 }, { W: 1600 }, { W: 1440 }, { W: 1300 }, { W: 1100 }, { W: 800 }, { W: 700 }, { W: 1300 }, { W: 1600 }, { W: 2200 }] },
  { id: 'S2', title: 'U:33 / U:50 全部拉到上限:1600 → 240 / 330 / 430、Main 剛好 600;2200 → 240 / 500 / 700、Main 760',
    cfg: A, rail: true, open: { menu: true, right: true, agent: true },
    steps: [{ W: 1600 }, { end: 'menu' }, { end: 'right' }, { end: 'agent' }, { W: 2200 }, { end: 'right' }, { end: 'agent' }] },
  { id: 'S3', title: 'U:74 / D:19:設 600 → 縮到最多 430 → 恢復 600;卡在 430 時只點一下不改紀錄、往外拖則紀錄變 430',
    cfg: A, rail: true, open: { menu: true, right: true, agent: true },
    steps: [{ W: 2200 }, { drag: 'agent', dx: -200 }, { W: 1600 }, { W: 2200 }, { W: 1600 }, { click: 'agent' }, { W: 2200 }, { W: 1600 }, { drag: 'agent', dx: -50 }, { W: 2200 }] },
  { id: 'S4', title: 'U:12-13(U1):1100、最小 600 / 300 / 300,AI agent 開著、焦點在它裡面時按 ⌘.(要求 Right)→ 合計 1200 > 1100 → 關閉 AI agent,焦點回 Main(K7)',
    cfg: B, rail: false, open: { menu: false, right: false, agent: true },
    steps: [{ W: 1100 }, { focus: 'agent' }, { key: 'shortcutRight', expectFocus: 'main' }] },
  { id: 'S5', title: 'U:16(U3):兩者原本並排,只因視窗縮到 1100 → AI agent 改右側浮層,不關閉',
    cfg: B, rail: false, open: { menu: false, right: true, agent: true },
    steps: [{ W: 1400 }, { W: 1100 }] },
  { id: 'S6', title: 'D:25 / D:26 / U:26 Menu 開關:1300、Menu 關閉 → 按開關直接出左側浮層 → Esc 收回暫藏 → ⌘B 再叫出 → ⌘B 收回 → 放到 1400 自己回來並排',
    cfg: A, rail: true, open: { menu: false, right: true, agent: true },
    steps: [{ W: 1300 }, { trigger: true }, { key: 'Escape' }, { key: 'shortcutMenu' }, { key: 'shortcutMenu' }, { W: 1400 }] },
  { id: 'S7', title: 'U:61-62(U7):視窗 320、浮層最小 300 → 暫時顯示 272、另一側留 48',
    cfg: { ...A, agent: [300, 400, 700] }, rail: false, open: { menu: false, right: false, agent: true },
    steps: [{ W: 320 }] },
  { id: 'S8', title: 'D:22 Esc:並排時焦點在 AI agent 裡按 Esc 不關;浮層時**用滑鼠點進面板**再按 Esc → 關閉、焦點回入口鈕(上一次輸入是指標,這一下 Esc 仍算鍵盤關閉)',
    cfg: A, rail: true, open: { menu: true, right: true, agent: true },
    steps: [{ W: 2200 }, { focus: 'agent' }, { key: 'Escape' }, { W: 1100 }, { pointerFocus: 'agent' }, { key: 'Escape', expectFocus: 'fab' }] },
  { id: 'S9', title: 'D:24(D10):1230、細列 48、最小 600 / 300 / 300,要求 Right → 600 + 48 + 300 + 300 = 1248 > 1230 → 關閉 AI agent',
    cfg: B, rail: true, open: { menu: false, right: false, agent: true },
    steps: [{ W: 1230 }, { key: 'shortcutRight' }] },
  { id: 'S10', title: '浮層遮罩:1100 AI agent 浮層 —— 遮罩蓋住整個殼、接住留白處的點擊、點了關閉 AI agent;宿主不可操作;捲動時浮層釘在看得到的範圍',
    cfg: A, rail: true, open: { menu: true, right: true, agent: true },
    steps: [{ W: 1100, retained: 'overlay' }, { W: 700, retained: 'scrolled' }, { scrim: true }] },
  { id: 'S11', title: '把手外側命中:2200 AI agent 並排 —— 左緣外側 2px 與內側 2px 都打到把手(resize-handle.spec「命中區」)',
    cfg: A, rail: true, open: { menu: true, right: true, agent: true },
    steps: [{ W: 2200, retained: 'handle' }] },
  { id: 'S12', title: 'D:24 細列一律先扣:1380 三個都開 → Menu 要 600 + 48 + 250 + 350 + 200 − 48 = 1400 才並排,此刻暫藏;1230 → AI agent 要 1248 才並排,此刻浮層',
    cfg: A, rail: true, open: { menu: true, right: true, agent: true },
    steps: [{ W: 1380 }, { W: 1230 }] },
  { id: 'S13', title: 'D:24(D8):1600、Menu 關閉、細列 48 → 細列像 Main 最小寬一樣先扣:Right 上限 426、AI agent 上限 526',
    cfg: A, rail: true, open: { menu: false, right: true, agent: true },
    steps: [{ W: 1600 }] },
  // ── 2026-10-14 審查補(每一格都有對照組,見檔尾 DOM_SABOTAGE)──
  { id: 'S14', title: 'D:26 點浮層外收回(審查缺陷 1):1300 按開關出 Menu 浮層 → 拖浮層把手 +15(紀錄 235)→ 點浮層外 → 暫藏;再叫出 → 只按把手不拖 → 點浮層外 → 暫藏',
    cfg: A, rail: true, open: { menu: false, right: true, agent: true },
    steps: [{ W: 1300 }, { trigger: true }, { drag: 'menu', overlay: true, dx: 15 }, { outside: [500, 400] }, { trigger: true }, { click: 'menu', overlay: true }, { outside: [500, 400] }] },
  { id: 'S15', title: 'D:22 焦點(審查缺陷 2):載入時 AI agent 就是浮層(1100)→ 直接按 Esc → 焦點回入口鈕;點入口鈕重開 → 滑鼠點進輸入盒 → Esc → 焦點回入口鈕',
    cfg: A, rail: true, open: { menu: true, right: true, agent: true },
    steps: [{ W: 1100 }, { key: 'Escape', expectFocus: 'fab' }, { fab: true }, { pointerFocus: 'agent' }, { key: 'Escape', expectFocus: 'fab' }] },
  { id: 'S16', title: 'WCAG 2.4.3 / 2.4.7(審查缺陷 3):沒細列、三個都開、1300 → Menu 暫藏、寬 0,裡面沒有可聚焦的東西;2200 並排後按 ⌘B 關閉 → 寬 0 同樣不可聚焦',
    cfg: A, rail: false, open: { menu: true, right: true, agent: true },
    steps: [{ W: 1300, retained: 'menuInert' }, { W: 2200 }, { key: 'shortcutMenu', retained: 'menuInert' }] },
  { id: 'S17', title: '§9 浮層並存(審查缺陷 4a):1300 叫出 Menu 浮層 → 視窗縮到 1000、AI agent 變浮層 → Menu 浮層仍可點、焦點留在裡面;Esc 收回暫藏',
    cfg: A, rail: true, open: { menu: false, right: true, agent: true },
    steps: [{ W: 1300 }, { trigger: true }, { W: 1000, retained: 'layersAbove' }, { key: 'Escape' }] },
  { id: 'S18', title: '§9 浮層並存(審查缺陷 4b):1700 打開「結束 Sprint 42」確認框 → 視窗縮到 1100、AI agent 變浮層 → 確認框仍可點、焦點留在裡面;Esc 關確認框',
    cfg: A, rail: true, open: { menu: true, right: true, agent: true },
    steps: [{ W: 1700 }, { dialog: true }, { W: 1100, retained: 'layersAbove' }, { key: 'Escape' }] },
  { id: 'S19', title: '§8 使用者要求的 Right 端到眼前(審查缺陷 5):800、只開 Menu → 按「顯示詳情」→ Right 放不下仍並排、殼捲 98 → Right 整個在看得到的範圍裡',
    cfg: A, rail: true, open: { menu: true, right: false, agent: false },
    steps: [{ W: 800 }, { detailsButton: true, retained: 'rightVisible' }] },
  { id: 'S20', title: 'Menu 兩份共用狀態(審查缺陷 6):1300 叫出 Menu 浮層 → 浮層裡展開「專案」→ Esc → 放到 2200 並排 →「專案」仍展開、專案看得到',
    cfg: A, rail: true, open: { menu: false, right: true, agent: true },
    steps: [{ W: 1300 }, { trigger: true }, { groupToggle: true }, { key: 'Escape' }, { W: 2200, retained: 'groupShared' }] },
  { id: 'S21', title: 'D:23 從 AI agent 導向 Main(審查缺陷 7):四區版面 1100(AI agent 浮層)→ 點回覆裡的「Insights」→ AI agent 收起、Main 換到 Insights、焦點回 Main',
    story: 'design-system-components-appshell-展示--four-regions', expectAgentAfterLink: false,
    steps: [{ W: 1100 }, { agentLink: true, retained: 'navigated' }] },
  { id: 'S22', title: 'D:23 並排時不收(審查缺陷 7):四區版面 2200(AI agent 並排)→ 點「Insights」→ Main 換到 Insights、AI agent 維持開著',
    story: 'design-system-components-appshell-展示--four-regions', expectAgentAfterLink: true,
    steps: [{ W: 2200 }, { agentLink: true, retained: 'navigated' }] },
  // ── 2026-10-15 r1b 複驗補(對照組見檔尾 DOM_SABOTAGE 最後五種)──
  { id: 'S23', title: 'F2 / N2 / N3:1300 按開關出 Menu 浮層 → Tab 進選單(第一站看得到、深色底不透明、沒開提示)→ 一下 Esc 收回暫藏 → 2200 並排,聚焦選單項不掛 describedby',
    cfg: A, rail: true, open: { menu: false, right: true, agent: true },
    steps: [{ W: 1300 }, { trigger: true }, { tabInto: true, retained: 'menuOverlay' }, { key: 'Escape' }, { W: 2200 }, { focusMenu: true, retained: 'menuSideBySide' }] },
  { id: 'S24', title: 'F4:主標頭佈局 1000(Menu 暫藏只剩細列)→ 按 globalHeader 的開關叫出 Menu 浮層 → 細列不長出標頭、第一項不跳;品牌與帳號只在浮層那一份',
    story: 'design-system-components-appshell-展示--primary-header',
    steps: [{ W: 1000, retained: 'rail' }, { trigger: true, retained: 'rail' }] },
  { id: 'S25', title: 'F9:2200 三個都開 → Menu / Right / AI agent 三顆拖寬把手名稱分得出來、各自 aria-controls 指向自己那一區',
    cfg: A, rail: true, open: { menu: true, right: true, agent: true },
    steps: [{ W: 2200, retained: 'handles' }] },
  // ── 2026-10-20 r1b 複核補(對照組見檔尾 DOM_SABOTAGE 最後一種)──
  { id: 'S26', title: 'D3:「任務助理放不下時」(畫布 1100,載入就是 AI agent 浮層)→ 模擬瀏覽器工具列不是宿主:不在 inert 裡、網址列聚焦得到、點得到',
    story: 'design-system-components-appshell-展示--agent-overlay',
    steps: [{ W: 1440, retained: 'toolbar' }] },
  { id: 'S27', title: 'F10:「任務助理放不下時」→ 殼 = 模擬瀏覽器畫布(story-rules「整頁情境」),AI agent 浮層與遮罩都在畫布裡',
    story: 'design-system-components-appshell-展示--agent-overlay',
    steps: [{ W: 1440, retained: 'frame' }] },
  { id: 'S28', title: 'F10:「Menu 放不下時」(畫布 1000,play 按開關)→ 殼 = 模擬瀏覽器畫布,Menu 浮層與它的遮罩都在畫布裡(Sheet portalContainer)',
    story: 'design-system-components-appshell-展示--menu-overlay',
    steps: [{ W: 1440, retained: 'frame' }] },
]

// ── 模型這一側:同一串動作 → 期望 ──
function modelActionsFor(step, state, model, measuredRail) {
  const layout = model.deriveLayout(state)
  if (step.W !== undefined) return [{ type: 'resize', availableWidth: step.W }]
  if (step.end) return [{ type: 'user-resize', panel: step.end, width: 1e9, moved: true }]
  if (step.fab) return [{ type: 'open-agent' }]
  if (step.outside) return layout.display.menu === 'overlay' ? [{ type: 'dismiss-menu-overlay' }] : []
  if (step.detailsButton) return state.open.right ? [{ type: 'close-right' }] : [{ type: 'request-right', contentType: CONTENT.right }]
  if (step.drag) {
    const w0 = layout.widths[step.drag]
    // Right panel / AI agent 的把手在左緣(往左 = 變寬);Menu 的在右緣
    const grown = step.drag === 'menu' ? w0 + step.dx : w0 - step.dx
    return [{ type: 'user-resize', panel: step.drag, width: grown, moved: true }]
  }
  if (step.click) return [{ type: 'user-resize', panel: step.click, width: layout.widths[step.click], moved: false }]
  if (step.trigger || step.key === 'shortcutMenu') return [{ type: 'toggle-menu' }]
  if (step.key === 'shortcutRight') return state.open.right ? [{ type: 'close-right' }] : [{ type: 'request-right', contentType: CONTENT.right }]
  if (step.key === 'Escape') {
    if (layout.display.menu === 'overlay') return [{ type: 'dismiss-menu-overlay' }]
    if (step.prevFocus === 'agent' && layout.display.agent === 'overlay') return [{ type: 'close-agent' }]
    return []
  }
  if (step.scrim) return layout.display.agent === 'overlay' ? [{ type: 'close-agent' }] : []
  void measuredRail
  return []
}

function initialState(model, sc, W, rail, gap) {
  return model.createLayoutState({
    availableWidth: W,
    mainMinWidth: sc.cfg.mainMinWidth,
    railWidth: sc.rail ? rail : 0,
    overlayEdgeGap: gap,
    open: { ...sc.open },
    contentType: { ...CONTENT },
    widthConfig: {
      menu: { [CONTENT.menu]: rangeOf(sc.cfg.menu) },
      right: { [CONTENT.right]: rangeOf(sc.cfg.right) },
      agent: { [CONTENT.agent]: rangeOf(sc.cfg.agent) },
    },
  })
}

// ── 頁面這一側:量 ──
const READOUT = { '並排': 'side-by-side', '浮層': 'overlay', '暫藏(開關紀錄仍是開)': 'hidden', '關閉': 'closed' }
function measurePage() {
  const r1 = (n) => Math.round(n * 100) / 100
  const root = document.querySelector('[data-app-shell]')
  const scroller = document.querySelector('[data-app-shell-scroll]')
  const rootRect = root.getBoundingClientRect()
  const probe = (key) => document.querySelector(`[data-token-probe="${key}"]`)?.getBoundingClientRect().width ?? NaN
  const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0
  const flowMenu = document.querySelector('[data-app-shell-panel="menu"]:not([data-menu-overlay])')
  const overlayMenu = document.querySelector('[data-menu-overlay][data-state="open"]')
  const aside = document.querySelector('aside[data-app-shell-panel="right"]')
  const agent = document.querySelector('[data-app-shell-panel="agent"][role="complementary"]')
  const readout = Object.fromEntries([...document.querySelectorAll('[data-readout]')].map((e) => [e.getAttribute('data-readout'), e.textContent]))
  const handleOf = (container) => {
    const h = container?.querySelector(':scope > [role="separator"]')
    return h ? { min: +h.getAttribute('aria-valuemin'), max: +h.getAttribute('aria-valuemax'), now: +h.getAttribute('aria-valuenow') } : null
  }
  const main = document.querySelector('[data-app-shell-main-column]')
  const active = document.activeElement
  const fab = document.querySelector('[data-app-shell] button[aria-label*="代理"]')
  return {
    W: root.clientWidth,
    rail: probe('rail'),
    gap: probe('edgeGap'),
    readout,
    menu: {
      flowState: flowMenu?.getAttribute('data-state') ?? null,
      flowWidth: flowMenu ? r1(flowMenu.getBoundingClientRect().width) : null,
      overlay: !!overlayMenu,
      overlayWidth: overlayMenu ? r1(overlayMenu.getBoundingClientRect().width) : null,
      overlayRight: overlayMenu ? r1(overlayMenu.getBoundingClientRect().right - rootRect.left) : null,
      handle: overlayMenu ? handleOf(overlayMenu) : handleOf(flowMenu),
    },
    right: { present: !!aside, width: aside ? r1(aside.getBoundingClientRect().width) : null, handle: handleOf(aside) },
    agent: {
      visible: visible(agent),
      mode: agent?.getAttribute('data-agent-panel-mode') ?? null,
      width: visible(agent) ? r1(agent.getBoundingClientRect().width) : null,
      leftGap: visible(agent) ? r1(agent.getBoundingClientRect().left - rootRect.left) : null,
      rightGap: visible(agent) ? r1(rootRect.right - agent.getBoundingClientRect().right) : null,
      handle: visible(agent) ? handleOf(agent) : null,
    },
    mainWidth: main ? r1(main.getBoundingClientRect().width) : null,
    overflow: scroller ? scroller.scrollWidth - scroller.clientWidth : null,
    scrollable: scroller ? ['auto', 'scroll'].includes(getComputedStyle(scroller).overflowX) : false,
    triggerExpanded: document.querySelector('[data-sidebar="trigger"]')?.getAttribute('aria-expanded') ?? null,
    focus: !active || active === document.body ? 'body'
      : active.id === 'app-shell-main' ? 'main'
        : fab && fab === active ? 'fab'
          : agent?.contains(active) ? 'agent' : (active.getAttribute('aria-label') || active.tagName.toLowerCase()),
  }
}

/** 頁面量到的 → 四區的顯示方式(Menu 的「暫藏 / 關閉」差在開關紀錄,畫面同為細列,讀 Main 裡的讀數) */
function domDisplay(m) {
  const menu = m.menu.overlay ? 'overlay' : m.menu.flowState === 'expanded' ? 'side-by-side' : (READOUT[m.readout.menu] === 'hidden' ? 'hidden' : 'closed')
  const right = m.right.present ? 'side-by-side' : 'closed'
  const agent = m.agent.visible ? (m.agent.mode === 'overlay' ? 'overlay' : 'side-by-side') : 'closed'
  return { menu, right, agent }
}

/** 一格:頁面 vs 模型。回 [標籤, 實得, 期望, 成立] 的清單 */
function compareStep(m, model, state) {
  const l = model.deriveLayout(state)
  const d = domDisplay(m)
  const out = []
  const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= TOL
  const push = (label, got, want, ok) => out.push({ label, got, want, ok })
  for (const id of ['menu', 'right', 'agent']) push(`${id} 顯示方式`, d[id], l.display[id], d[id] === l.display[id])
  push('Main 開關讀數 = 頁面', m.readout.menu, Object.keys(READOUT).find((k) => READOUT[k] === l.display.menu), READOUT[m.readout.menu] === l.display.menu)
  // 寬度與上限
  if (l.display.menu === 'side-by-side') {
    push('Menu 寬', m.menu.flowWidth, l.widths.menu, near(m.menu.flowWidth, l.widths.menu))
    push('Menu 可拉上限(aria-valuemax)', m.menu.handle?.max, l.caps.menu, near(m.menu.handle?.max, l.caps.menu))
  } else if (l.display.menu === 'overlay') {
    push('Menu 浮層寬', m.menu.overlayWidth, l.widths.menu, near(m.menu.overlayWidth, l.widths.menu))
    push('Menu 浮層上限', m.menu.handle?.max, l.overlayRanges.menu?.max, near(m.menu.handle?.max, l.overlayRanges.menu?.max))
    push('Menu 浮層另一側 ≥ 48', m.W - m.menu.overlayRight, `≥ ${m.gap}`, m.W - m.menu.overlayRight >= m.gap - TOL)
  } else {
    push('Menu 收起後佔的寬(細列或 0)', m.menu.flowWidth, l.railInLayout ? m.rail : 0, near(m.menu.flowWidth, l.railInLayout ? m.rail : 0))
  }
  if (l.display.right === 'side-by-side') {
    push('Right 寬', m.right.width, l.widths.right, near(m.right.width, l.widths.right))
    push('Right 可拉上限(aria-valuemax)', m.right.handle?.max, l.caps.right, near(m.right.handle?.max, l.caps.right))
  }
  if (l.display.agent === 'side-by-side') {
    push('AI agent 寬', m.agent.width, l.widths.agent, near(m.agent.width, l.widths.agent))
    push('AI agent 可拉上限(aria-valuemax)', m.agent.handle?.max, l.caps.agent, near(m.agent.handle?.max, l.caps.agent))
  } else if (l.display.agent === 'overlay') {
    push('AI agent 浮層寬', m.agent.width, l.widths.agent, near(m.agent.width, l.widths.agent))
    push('AI agent 浮層上限', m.agent.handle?.max, l.overlayRanges.agent?.max, near(m.agent.handle?.max, l.overlayRanges.agent?.max))
    push('AI agent 浮層貼右(看得到的範圍)', m.agent.rightGap, 0, near(m.agent.rightGap, 0))
    push('AI agent 浮層另一側 ≥ 48', m.agent.leftGap, `≥ ${m.gap}`, m.agent.leftGap >= m.gap - TOL)
  }
  push('Main 寬', m.mainWidth, l.mainWidth, near(m.mainWidth, l.mainWidth))
  push('水平捲動距離', m.overflow, Math.round(l.horizontalOverflow), Math.abs(m.overflow - l.horizontalOverflow) <= 1)
  if (l.horizontalOverflow > 0) push('殼可以水平捲(overflow-x auto)', m.scrollable, true, m.scrollable === true)
  const expanded = String(model.isPanelExpanded(l.display.menu))
  push('Menu 開關 aria-expanded', m.triggerExpanded, expanded, m.triggerExpanded === expanded)
  return out
}

// ── 保留斷言(舊 agent-panel-breakpoint.mjs 的四段,改在 AppShell 裡量)──
function retainedOverlay() {
  const root = document.querySelector('[data-app-shell]')
  const R = root.getBoundingClientRect()
  const scrim = document.querySelector('[data-agent-panel-scrim]')
  const panel = document.querySelector('[data-app-shell-panel="agent"][role="complementary"]')
  const near = (a, b) => Math.abs(a - b) <= 1
  const S = scrim?.getBoundingClientRect()
  const scs = scrim ? getComputedStyle(scrim) : null
  const probe = document.createElement('div'); probe.className = 'bg-overlay'; document.body.appendChild(probe)
  const overlayBg = getComputedStyle(probe).backgroundColor; probe.remove()
  const P = panel?.getBoundingClientRect()
  const strip = P ? { x: R.left + (P.left - R.left) / 2, y: R.top + R.height / 2 } : null
  const stripHit = strip ? document.elementFromPoint(strip.x, strip.y) : null
  // 宿主不可操作:面板以外、#storybook-root 裡的可聚焦控件全部被 inert 蓋住或不可見
  const rootEl = document.querySelector('#storybook-root') || document.body
  const outside = [...rootEl.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !panel?.contains(el))
  const focusable = outside.filter((el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
    if (el.closest('[inert]')) return false
    return !el.hasAttribute('disabled')
  })
  return {
    scrim: !!scrim,
    covers: !!S && near(S.left, R.left) && near(S.right, R.right) && near(S.top, R.top) && near(S.bottom, R.bottom),
    bg: scs?.backgroundColor ?? null, overlayBg, z: scs?.zIndex ?? null,
    stripHitsScrim: !!scrim && stripHit === scrim,
    hostFocusable: focusable.length, hostTotal: outside.length,
    sample: focusable.slice(0, 3).map((e) => e.tagName + '.' + String(e.getAttribute('aria-label') || e.className).slice(0, 30)),
  }
}

function retainedHandle() {
  const p = document.querySelector('[data-app-shell-panel="agent"][role="complementary"]')
  const handle = p?.querySelector(':scope > [role="separator"]')
  if (!p || !handle) return { err: '找不到並排的 AI agent 或它的把手' }
  const P = p.getBoundingClientRect()
  const midY = P.top + P.height / 2
  const hits = (x) => { const el = document.elementFromPoint(x, midY); return el === handle || handle.contains(el) }
  return { outer2: hits(P.left - 2), inner2: hits(P.left + 2), overflowX: getComputedStyle(p).overflowX }
}

function retainedScrolled() {
  const root = document.querySelector('[data-app-shell]')
  const scroller = document.querySelector('[data-app-shell-scroll]')
  scroller.scrollLeft = scroller.scrollWidth
  const R = root.getBoundingClientRect()
  const panel = document.querySelector('[data-app-shell-panel="agent"][role="complementary"]')
  const scrim = document.querySelector('[data-agent-panel-scrim]')
  const P = panel?.getBoundingClientRect(), Sc = scrim?.getBoundingClientRect()
  return {
    scrolled: scroller.scrollLeft,
    panelRightGap: P ? Math.round((R.right - P.right) * 100) / 100 : null,
    scrimCovers: !!Sc && Math.abs(Sc.left - R.left) <= 1 && Math.abs(Sc.right - R.right) <= 1,
  }
}

/** 審查缺陷 3:寬 0 的 Menu(沒細列、收掉)裡沒有任何可聚焦的東西(被 inert 蓋住或不在無障礙樹以外都不算) */
function retainedMenuInert() {
  const menu = document.querySelector('[data-app-shell-panel="menu"]:not([data-menu-overlay])')
  if (!menu) return { err: '找不到版面上的 Menu' }
  const width = Math.round(menu.getBoundingClientRect().width * 100) / 100
  const all = [...menu.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
  const focusable = all.filter((el) => !el.closest('[inert]') && !el.hasAttribute('disabled'))
  const hiddenFromAt = all.every((el) => !!el.closest('[aria-hidden="true"]'))
  return { width, total: all.length, focusable: focusable.length, hiddenFromAt, sample: focusable.slice(0, 3).map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)) }
}

/** 審查缺陷 4:AI agent 變浮層那一刻已開著、疊在上面的層(Menu 浮層 / 確認框)照樣可操作 */
function retainedLayersAbove() {
  const agent = document.querySelector('[data-app-shell-panel="agent"][role="complementary"]')
  const layer = document.querySelector('[data-menu-overlay][data-state="open"]') ?? document.querySelector('[role="dialog"][data-state="open"]:not([data-menu-overlay])')
  if (!layer) return { err: '找不到開著的 Menu 浮層或確認框' }
  // 這一層裡要點得到的控件:Menu 浮層的第一個選單項 / 確認框的主要按鈕
  const control = layer.hasAttribute('data-menu-overlay')
    ? layer.querySelector('[data-sidebar="menu-button"]')
    : [...layer.querySelectorAll('button')].find((b) => b.textContent.trim() === '結束 Sprint')
  const r = control?.getBoundingClientRect()
  const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null
  const active = document.activeElement
  return {
    kind: layer.hasAttribute('data-menu-overlay') ? 'menu-overlay' : 'dialog',
    agentMode: agent?.getAttribute('data-agent-panel-mode') ?? null,
    layerInert: !!layer.closest('[inert]'),
    controlHit: !!control && !!hit && (hit === control || control.contains(hit)),
    hitTag: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 30)}` : null,
    focusInLayer: !!active && active !== document.body && layer.contains(active),
  }
}

/** 審查缺陷 5:使用者要求的 Right 整個在看得到的範圍裡(殼水平捲時) */
function retainedRightVisible() {
  const root = document.querySelector('[data-app-shell]')
  const scroller = document.querySelector('[data-app-shell-scroll]')
  const aside = document.querySelector('aside[data-app-shell-panel="right"]')
  if (!aside) return { err: '找不到 Right panel' }
  const R = root.getBoundingClientRect(), A = aside.getBoundingClientRect()
  const r1 = (n) => Math.round(n * 100) / 100
  return { overflow: scroller.scrollWidth - scroller.clientWidth, scrollLeft: r1(scroller.scrollLeft), asideLeft: r1(A.left - R.left), asideRight: r1(A.right - R.left), viewWidth: r1(R.width) }
}

/** 審查缺陷 6:Menu 浮層裡展開的群組,回到版面上那一份仍展開、內容看得到 */
function retainedGroupShared() {
  const flow = document.querySelector('[data-app-shell-panel="menu"]:not([data-menu-overlay])')
  // 收合箭頭 = 標題列裡帶 aria-expanded 的那顆;2026-10-27 起群組動作也住標題列的列尾槽(排在箭頭前),「標題列裡第一顆 button」不再是箭頭
  const toggle = flow?.querySelector('[data-sidebar="group-label"] button[aria-expanded]')
  const project = flow ? [...flow.querySelectorAll('[data-sidebar="menu-button"]')].find((b) => b.textContent.includes('Q4 結帳改版')) : null
  const box = project?.getBoundingClientRect()
  return { flowState: flow?.getAttribute('data-state') ?? null, expanded: toggle?.getAttribute('aria-expanded') ?? null, projectVisible: !!box && box.width > 0 && box.height > 0 }
}

/** 審查缺陷 7:AI agent 裡的連結導向 Main 之後 */
function retainedNavigated() {
  const agent = document.querySelector('[data-app-shell-panel="agent"][role="complementary"]')
  const agentVisible = !!agent && getComputedStyle(agent).display !== 'none' && agent.getBoundingClientRect().width > 0
  const title = document.querySelector('[data-app-shell-main-column] header h1')?.textContent?.trim() ?? null
  const active = document.activeElement
  // F11(示範產品的導航邏輯):Insights 是自己的一頁,右側的議題詳情跟它無關 → 換過去時一起收起
  const aside = document.querySelector('aside[data-app-shell-panel="right"]')
  const asideVisible = !!aside && aside.getBoundingClientRect().width > 0
  return { agentVisible, asideVisible, title, focus: !active || active === document.body ? 'body' : active.id === 'app-shell-main' ? 'main' : agent?.contains(active) ? 'agent' : active.tagName.toLowerCase() }
}

/** 一個焦點停點的樣子(Tab 走查用):看得到 = 盒子至少 1×1 且不在 .sr-only 裡 */
function describeFocus() {
  const a = document.activeElement
  if (!a || a === document.body) return { tag: 'body' }
  const r = a.getBoundingClientRect()
  return {
    tag: a.tagName.toLowerCase(),
    label: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 20),
    inOverlay: !!a.closest('[data-menu-overlay]'),
    menuButton: a.matches('[data-sidebar="menu-button"]'),
    visible: r.width >= 1 && r.height >= 1 && !a.closest('.sr-only'),
  }
}

/** 2026-10-15(F2 / N3):Menu 浮層開著、焦點在浮層的選單項上 —— 深色模式底色、提示、describedby */
function retainedMenuOverlay() {
  const overlay = document.querySelector('[data-menu-overlay][data-state="open"]')
  if (!overlay) return { err: '找不到開著的 Menu 浮層' }
  const html = document.documentElement
  const prev = html.getAttribute('data-theme')
  // 換主題會觸發底色的 CSS 過渡(Sheet 帶 `transition`):不等過渡就量 = 量到過渡起點(AGENTS.md 失敗記憶索引「量 focus 顏色不等 transition」)→ 先讓過渡跑完再量
  const finishTransitions = () => { getComputedStyle(overlay).backgroundColor; for (const an of overlay.getAnimations()) an.finish() }
  html.setAttribute('data-theme', 'dark')
  finishTransitions()
  const probe = document.createElement('div'); probe.className = 'bg-surface-raised'; document.body.appendChild(probe)
  const bg = getComputedStyle(overlay).backgroundColor
  const raised = getComputedStyle(probe).backgroundColor
  probe.remove()
  if (prev === null) html.removeAttribute('data-theme'); else html.setAttribute('data-theme', prev)
  finishTransitions()
  const alpha = (c) => { const m = c.match(/\/\s*([\d.]+%?)\s*\)$/) || c.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)$/); if (!m) return 1; return m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1]) }
  const a = document.activeElement
  const describedby = a?.getAttribute('aria-describedby') ?? null
  // N4:浮層 dialog 的無障礙名稱(aria-labelledby 指向的文字;沒有就看 aria-label)與描述
  const labelledby = overlay.getAttribute('aria-labelledby')
  const dialogName = (labelledby ? labelledby.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : overlay.getAttribute('aria-label') ?? '').trim()
  return {
    dialogName, dialogDescribedby: overlay.getAttribute('aria-describedby'),
    darkBg: bg, darkRaised: raised, darkAlpha: alpha(bg),
    focusOnOverlayItem: !!a?.closest('[data-menu-overlay]') && a.matches('[data-sidebar="menu-button"]'),
    describedby,
    tooltips: document.querySelectorAll('[role="tooltip"]').length,
  }
}

/** 2026-10-15(N3):並排展開的 Menu,焦點在選單項上 —— 不開提示、不掛 describedby(展開看得到字) */
function retainedMenuSideBySide() {
  const a = document.activeElement
  const flow = document.querySelector('[data-app-shell-panel="menu"]:not([data-menu-overlay])')
  return {
    flowState: flow?.getAttribute('data-state') ?? null,
    focusOnFlowItem: !!a && !!flow?.contains(a) && a.matches('[data-sidebar="menu-button"]'),
    describedby: a?.getAttribute('aria-describedby') ?? null,
    tooltips: document.querySelectorAll('[role="tooltip"]').length,
  }
}

/** 2026-10-15(F4):細列(版面上那一份)第一項的位置、細列有沒有標頭 / 品牌;浮層那一份有沒有品牌與帳號入口 */
function retainedRail() {
  const flow = document.querySelector('[data-app-shell-panel="menu"]:not([data-menu-overlay])')
  const overlay = document.querySelector('[data-menu-overlay][data-state="open"]')
  const first = flow?.querySelector('[data-sidebar="menu-button"]')
  const brandIn = (root) => root ? [...root.querySelectorAll('span')].filter((el) => el.textContent.trim() === 'Acme Inc').length : 0
  return {
    flowState: flow?.getAttribute('data-state') ?? null,
    firstY: first ? Math.round(first.getBoundingClientRect().top * 100) / 100 : null,
    flowHeader: !!flow?.querySelector('[data-sidebar="header"]'),
    flowBrand: brandIn(flow),
    overlayOpen: !!overlay,
    overlayBrand: brandIn(overlay),
    overlayAccount: !!overlay?.querySelector('[data-sidebar="header"] button[aria-haspopup="menu"]'),
  }
}

/** 2026-10-15(F9):三顆拖寬把手 —— 名稱、aria-controls 指向的元素存在且就是那一區 */
function retainedHandles() {
  const handles = [...document.querySelectorAll('[data-app-shell] [role="separator"]')]
  return handles.map((h) => {
    const id = h.getAttribute('aria-controls')
    const target = id ? document.getElementById(id) : null
    const panel = h.closest('[data-app-shell-panel]')
    const region = panel?.getAttribute('data-app-shell-panel') ?? null
    // 指向的就是那一區:Menu 的把手指向 Menu(版面上那一份,id 在外框);Right / AI agent 的把手指向它所在的面板根節點
    const targetsOwnRegion = !!target && (target === panel || target.contains(h) || target.getAttribute('data-app-shell-panel') === region)
    return { region, name: h.getAttribute('aria-label'), controls: id, targetsOwnRegion }
  })
}

/** S27 / S28(F10):殼撐滿模擬瀏覽器畫布(畫布 = 這個示範的「視窗」),浮層與遮罩都畫在畫布範圍裡 */
function retainedFrame() {
  const canvas = document.querySelector('[data-simulated-canvas]')
  const shell = document.querySelector('[data-app-shell]')
  if (!canvas || !shell) return { err: !canvas ? '沒有模擬瀏覽器畫布([data-simulated-canvas])' : '找不到 AppShell' }
  const c = canvas.getBoundingClientRect()
  const inner = { left: c.left + canvas.clientLeft, top: c.top + canvas.clientTop, right: c.left + canvas.clientLeft + canvas.clientWidth, bottom: c.top + canvas.clientTop + canvas.clientHeight }
  const r = (b) => ({ left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom) })
  const s = shell.getBoundingClientRect()
  const menuOverlay = document.querySelector('[data-menu-overlay][data-state="open"]')
  const sheetScrim = menuOverlay?.previousElementSibling?.getAttribute('data-state') === 'open' ? menuOverlay.previousElementSibling : null
  const layers = [
    ['Menu 浮層', menuOverlay], ['Menu 浮層的遮罩', sheetScrim],
    ['AI agent 浮層', document.querySelector('[data-app-shell-panel="agent"][data-agent-panel-mode="overlay"]')], ['AI agent 遮罩', document.querySelector('[data-agent-panel-scrim]')],
  ].filter(([, el]) => !!el).map(([name, el]) => { const b = el.getBoundingClientRect(); return { name, ...r(b), inside: b.left >= inner.left - 1 && b.top >= inner.top - 1 && b.right <= inner.right + 1 && b.bottom <= inner.bottom + 1 } })
  const fills = Math.abs(s.left - inner.left) <= 1 && Math.abs(s.top - inner.top) <= 1 && Math.abs(s.right - inner.right) <= 1 && Math.abs(s.bottom - inner.bottom) <= 1
  return { canvas: r(inner), shell: r(s), fills, layers }
}

/** S26:模擬瀏覽器工具列(`stories-helpers/scene/simulated-browser.tsx`)不是宿主 —— AI agent 浮層開著時仍可操作(檔頭契約:story 把 toolbarRef 傳進 persistentElements) */
function retainedToolbar() {
  const bar = document.querySelector('[role="group"][aria-label^="模擬瀏覽器工具列"]')
  const url = bar?.querySelector('input')
  const agentMode = document.querySelector('[data-app-shell-panel="agent"][role="complementary"]')?.getAttribute('data-agent-panel-mode') ?? null
  if (!bar || !url) return { err: '找不到模擬瀏覽器工具列 / 網址列', agentMode }
  const r = url.getBoundingClientRect()
  const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  url.focus()
  return { agentMode, inert: !!bar.closest('[inert]'), focused: document.activeElement === url, hit: !!at && (at === url || url.contains(at)) }
}

// ── 跑真頁面 ──
const sv = await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && sv.notFound.length) console.error('同源 404:', [...new Set(sv.notFound)].join(', ')) })
const br = await launchBrowserOrSkip({}, { cleanup: () => sv.stop() })
const page = await br.newPage({ viewport: { width: 1600, height: 800 } })

async function open(url, label, sabotage) {
  try {
    await openStory(page, url, {
      settleFrames: SETTLE_FRAMES,
      notFound: sv.notFound,
      waitFor: '[data-app-shell]',
      // 破壞:CSS 走 style tag;腳本走 script tag(story 已畫出來之後才掛,只碰之後的事件與 DOM 變化)
      beforeSettle: sabotage ? async (p) => {
        if (sabotage.css) await p.addStyleTag({ content: sabotage.css })
        if (sabotage.script) await p.addScriptTag({ content: sabotage.script })
      } : null,
    })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    console.error(`\n✗ ${label}:${error.message}`)
    await br.close(); await sv.stop(); process.exit(1)
  }
}

const settle = async (label) => {
  const r = await settleAfterInteraction(page, { frames: SETTLE_FRAMES })
  if (!r.ok) throw new Error(`${label}:等不到版面靜止(儀器失效)`)
}

async function perform(step, label) {
  if (step.W !== undefined) {
    await page.setViewportSize({ width: step.W, height: 800 })
  } else if (step.end) {
    await page.focus(`[data-app-shell-panel="${step.end}"]:not([data-menu-overlay]) > [role="separator"]`, { timeout: ACTION_TIMEOUT })
    await page.keyboard.press('End')
  } else if (step.drag || step.click) {
    const panel = step.drag || step.click
    const handleSelector = step.overlay
      ? `[data-app-shell-panel="${panel}"][data-menu-overlay] > [role="separator"]`
      : `[data-app-shell-panel="${panel}"]:not([data-menu-overlay]) > [role="separator"]`
    const box = await page.locator(handleSelector).first().boundingBox()
    if (!box) throw new Error(`${label}:找不到 ${panel}${step.overlay ? ' 浮層' : ''} 的把手`)
    const x = box.x + box.width / 2, y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    if (step.drag) {
      // 一路拖過去再放開(中途多格 pointermove);放開點與按下點的距離 = dx
      for (let i = 1; i <= 8; i++) await page.mouse.move(x + (step.dx * i) / 8, y)
    }
    await page.mouse.up()
  } else if (step.trigger) {
    await page.click('[data-sidebar="trigger"]', { timeout: ACTION_TIMEOUT })
  } else if (step.key === 'shortcutRight') {
    await page.keyboard.press('Control+.')
  } else if (step.key === 'shortcutMenu') {
    await page.keyboard.press('Control+b')
  } else if (step.key === 'Escape') {
    await page.keyboard.press('Escape')
  } else if (step.focus === 'agent') {
    // 程式聚焦(沒有任何使用者輸入事件)
    await page.focus('[data-app-shell-panel="agent"] textarea', { timeout: ACTION_TIMEOUT })
  } else if (step.pointerFocus === 'agent') {
    // 用滑鼠點進輸入盒(真的 pointerdown):之後那一下 Esc 之前,最近一次輸入是指標
    await page.click('[data-app-shell-panel="agent"] textarea', { timeout: ACTION_TIMEOUT })
  } else if (step.fab) {
    await page.click('[data-app-shell] button[aria-label*="代理"]', { timeout: ACTION_TIMEOUT })
  } else if (step.outside) {
    await page.mouse.click(step.outside[0], step.outside[1])
  } else if (step.detailsButton) {
    await page.click('[data-app-shell] header button:has-text("詳情")', { timeout: ACTION_TIMEOUT })
  } else if (step.dialog) {
    await page.click('[data-app-shell] main button:has-text("結束 Sprint 42")', { timeout: ACTION_TIMEOUT })
    await page.waitForSelector('[role="dialog"][data-state="open"]', { timeout: ACTION_TIMEOUT })
  } else if (step.groupToggle) {
    await page.click('[data-menu-overlay] [data-sidebar="group-label"] button[aria-expanded]', { timeout: ACTION_TIMEOUT })
  } else if (step.agentLink) {
    await page.click('[data-app-shell-panel="agent"] [data-agent-link="insights"]', { timeout: ACTION_TIMEOUT })
  } else if (step.tabInto) {
    // 浮層剛開:從浮層殼一路按 Tab,記下每一站,直到停在浮層的選單項(最多 6 下)
    lastTabStops = []
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab')
      await waitForFocusStable(page, { frames: SETTLE_FRAMES })
      const d = await page.evaluate(describeFocus)
      lastTabStops.push(d)
      if (d.menuButton && d.inOverlay) break
    }
  } else if (step.focusMenu) {
    await page.focus('[data-app-shell-panel="menu"]:not([data-menu-overlay]) [data-sidebar="menu-button"]', { timeout: ACTION_TIMEOUT })
  } else if (step.scrim) {
    const strip = await page.evaluate(() => {
      const R = document.querySelector('[data-app-shell]').getBoundingClientRect()
      const P = document.querySelector('[data-app-shell-panel="agent"][role="complementary"]').getBoundingClientRect()
      return { x: R.left + (P.left - R.left) / 2, y: R.top + R.height / 2 }
    })
    await page.mouse.click(strip.x, strip.y)
  }
  await settle(label)
  if (step.expectFocus) await waitForFocusStable(page, { frames: SETTLE_FRAMES })
}

/** S23 Tab 走查記下的停點(perform 寫、capture 讀) */
let lastTabStops = []

/** 跑完情境(預設全部;頁面破壞只跑會碰到那條斷言的情境),回每一步量到的頁面快照(之後用真模型與改壞的模型分別算期望) */
async function capture(sabotage = null, only = null) {
  const snaps = []
  for (const sc of SCENARIOS.filter((x) => !only || only.includes(x.id))) {
    const W0 = sc.steps[0].W
    await page.setViewportSize({ width: W0, height: 800 })
    const url = sc.story ? `${sv.origin}/iframe.html?id=${encodeURIComponent(sc.story)}&viewMode=story` : storyUrl(sv.origin, sc.cfg, sc.rail, sc.open)
    await open(url, `${sc.id} 開頁`, sabotage)
    let prevFocus = null
    for (const [i, raw] of sc.steps.entries()) {
      const step = { ...raw, prevFocus }
      const label = `${sc.id}.${i + 1}`
      if (i > 0) {
        // 這一步做不下去(例:浮層沒收起、蓋住了下一步要點的開關)= 頁面狀態不對 → 這一格紅、這個情境剩下的步驟不再做
        let failure = null
        try { await perform(step, label) } catch (error) { failure = String(error?.message ?? error).split('\n')[0].slice(0, 240) }
        if (failure) { snaps.push({ sc, i, step, m: null, extra: {}, failure }); break }
      }
      const m = await page.evaluate(measurePage)
      const extra = {}
      if (step.retained === 'overlay') extra.overlay = await page.evaluate(retainedOverlay)
      if (step.retained === 'handle') extra.handle = await page.evaluate(retainedHandle)
      if (step.retained === 'scrolled') extra.scrolled = await page.evaluate(retainedScrolled)
      if (step.retained === 'menuInert') extra.menuInert = await page.evaluate(retainedMenuInert)
      if (step.retained === 'layersAbove') extra.layersAbove = await page.evaluate(retainedLayersAbove)
      if (step.retained === 'rightVisible') extra.rightVisible = await page.evaluate(retainedRightVisible)
      if (step.retained === 'groupShared') extra.groupShared = await page.evaluate(retainedGroupShared)
      if (step.retained === 'navigated') extra.navigated = await page.evaluate(retainedNavigated)
      if (step.retained === 'menuOverlay') extra.menuOverlay = { ...(await page.evaluate(retainedMenuOverlay)), tabStops: lastTabStops }
      if (step.retained === 'menuSideBySide') extra.menuSideBySide = await page.evaluate(retainedMenuSideBySide)
      if (step.retained === 'rail') extra.rail = await page.evaluate(retainedRail)
      if (step.retained === 'handles') extra.handles = await page.evaluate(retainedHandles)
      if (step.retained === 'toolbar') extra.toolbar = await page.evaluate(retainedToolbar)
      if (step.retained === 'frame') extra.frame = await page.evaluate(retainedFrame)
      snaps.push({ sc, i, step, m, extra })
      prevFocus = step.focus ?? m.focus
    }
  }
  return snaps
}

/** 用某一個模型重播同一串動作,逐步與快照比;回不符的格 */
function evaluate(snaps, model) {
  const results = []
  let state = null
  for (const snap of snaps) {
    const { sc, i, step, m } = snap
    if (snap.failure) {
      results.push({ code: `${sc.id}.${i + 1}`, title: i === 0 ? sc.title : null, step, ok: false, detail: `這一步做不下去:${snap.failure}` })
      continue
    }
    if (sc.story) continue // 別的 story(四區版面):沒有讀數與可調設定,只驗保留斷言
    if (i === 0) state = initialState(model, sc, step.W, m.rail, m.gap)
    else for (const action of modelActionsFor(step, state, model, m.rail)) state = model.reduceLayout(state, action)
    const checks = compareStep(m, model, state)
    if (step.expectFocus) checks.push({ label: `焦點落點(${step.expectFocus === 'main' ? 'K7 回 #app-shell-main' : '回入口鈕'})`, got: m.focus, want: step.expectFocus, ok: m.focus === step.expectFocus })
    const bad = checks.filter((c) => !c.ok)
    results.push({ code: `${sc.id}.${i + 1}`, title: i === 0 ? sc.title : null, step, ok: bad.length === 0, detail: bad.map((c) => `${c.label}:期望 ${JSON.stringify(c.want)} 實得 ${JSON.stringify(c.got)}`).join(';') })
  }
  return results
}

function retainedResults(snaps) {
  const out = []
  const railBefore = new Map()
  for (const { sc, i, extra } of snaps) {
    const code = `${sc.id}.${i + 1}`
    if (extra.menuOverlay) {
      const x = extra.menuOverlay
      const first = x.tabStops?.[0]
      out.push({ code, key: 'overlayBg', name: 'Menu 浮層深色模式底色不透明、= --surface-raised(遮蓋型浮層;F2)', ok: !x.err && x.darkAlpha === 1 && x.darkBg === x.darkRaised, detail: JSON.stringify({ err: x.err, bg: x.darkBg, raised: x.darkRaised, alpha: x.darkAlpha }) })
      out.push({ code, key: 'overlayFirstTab', name: 'Menu 浮層裡第一個 Tab 停點看得到(不是 sr-only 裡的「關閉」;N2)', ok: !x.err && !!first && first.visible === true && first.inOverlay === true, detail: JSON.stringify(x.tabStops) })
      out.push({ code, key: 'overlayName', name: 'Menu 浮層的無障礙名稱 = 「選單」、不掛描述(N4)', ok: !x.err && x.dialogName === '選單' && !x.dialogDescribedby, detail: JSON.stringify({ name: x.dialogName, describedby: x.dialogDescribedby }) })
      out.push({ code, key: 'overlayNoTooltip', name: '浮層選單項聚焦時不開提示、不掛 aria-describedby(展開看得到字;N3)', ok: !x.err && x.focusOnOverlayItem && x.describedby === null && x.tooltips === 0, detail: JSON.stringify({ focus: x.focusOnOverlayItem, describedby: x.describedby, tooltips: x.tooltips }) })
    }
    if (extra.menuSideBySide) {
      const x = extra.menuSideBySide
      out.push({ code, key: 'sideBySideNoTooltip', name: '並排展開的 Menu 聚焦選單項:不開提示、不掛 aria-describedby(N3)', ok: x.flowState === 'expanded' && x.focusOnFlowItem && x.describedby === null && x.tooltips === 0, detail: JSON.stringify(x) })
    }
    if (extra.rail) {
      const x = extra.rail
      if (!x.overlayOpen) railBefore.set(sc.id, x)
      else {
        const before = railBefore.get(sc.id)
        out.push({ code, key: 'railStable', name: 'primary-header 叫出 Menu 浮層:細列第一項不跳、細列不長出標頭 / 品牌;品牌與帳號只在浮層那一份(F4)',
          ok: !!before && before.firstY !== null && Math.abs(x.firstY - before.firstY) <= 0.5 && !x.flowHeader && x.flowBrand === 0 && x.overlayBrand === 1 && x.overlayAccount,
          detail: JSON.stringify({ before, after: x }) })
      }
    }
    if (extra.handles) {
      const hs = extra.handles
      const names = hs.map((h) => h.name)
      const regions = hs.map((h) => h.region).sort().join(',')
      out.push({ code, key: 'handles', name: '三顆拖寬把手名稱分得出來、各自 aria-controls 指向自己那一區(F9)',
        ok: regions === 'agent,menu,right' && new Set(names).size === names.length && hs.every((h) => h.controls && h.targetsOwnRegion),
        detail: JSON.stringify(hs) })
    }
    if (extra.frame) {
      const x = extra.frame
      out.push({ code, key: 'frame', name: '「放不下時」示範:殼 = 模擬瀏覽器畫布,浮層與遮罩都在畫布裡(F10;story-rules「整頁情境」)',
        ok: !x.err && x.fills && x.layers.length >= 2 && x.layers.every((l) => l.inside), detail: JSON.stringify(x) })
    }
    if (extra.toolbar) {
      const x = extra.toolbar
      out.push({ code, key: 'toolbar', name: 'AI agent 浮層開著時,模擬瀏覽器工具列(不是宿主)不在 inert 裡、網址列聚焦得到、點得到(D3)',
        ok: !x.err && x.agentMode === 'overlay' && !x.inert && x.focused && x.hit, detail: JSON.stringify(x) })
    }
    if (extra.overlay) {
      const o = extra.overlay
      out.push({ code, key: 'scrim', name: '浮層底下有遮罩:蓋住整個殼、底色 = --overlay、z-30、留白處命中的是遮罩本身', ok: o.scrim && o.covers && o.bg === o.overlayBg && o.z === '30' && o.stripHitsScrim, detail: JSON.stringify(o) })
      out.push({ code, key: 'inert', name: '浮層時宿主不可操作(v14 條 B):面板以外沒有可聚焦的控件', ok: o.hostTotal > 0 && o.hostFocusable === 0, detail: `宿主可聚焦 ${o.hostFocusable}/${o.hostTotal}${o.sample.length ? ':' + o.sample.join(', ') : ''}` })
    }
    if (extra.handle) {
      const h = extra.handle
      out.push({ code, key: 'handle', name: '並排 AI agent 的把手:左緣外側 2px 與內側 2px 都命中(面板根節點 overflow-x 不裁把手)', ok: !h.err && h.outer2 === true && h.inner2 === true && h.overflowX === 'visible', detail: JSON.stringify(h) })
    }
    if (extra.menuInert) {
      const x = extra.menuInert
      out.push({ code, key: 'menuInert', name: '寬 0 的 Menu 裡沒有可聚焦的東西、也不在無障礙樹(WCAG 2.4.3 / 2.4.7)', ok: !x.err && x.width === 0 && x.total > 0 && x.focusable === 0 && x.hiddenFromAt, detail: JSON.stringify(x) })
    }
    if (extra.layersAbove) {
      const x = extra.layersAbove
      out.push({ code, key: 'layersAbove', name: `AI agent 變浮層前已開著的${x.kind === 'dialog' ? '確認框' : ' Menu 浮層'}照樣可操作:不 inert、控件點得到、焦點留在裡面`, ok: !x.err && x.agentMode === 'overlay' && !x.layerInert && x.controlHit && x.focusInLayer, detail: JSON.stringify(x) })
    }
    if (extra.rightVisible) {
      const x = extra.rightVisible
      out.push({ code, key: 'rightVisible', name: '殼水平捲時,使用者要求的 Right 整個在看得到的範圍裡(§8,D:31)', ok: !x.err && x.overflow > 0 && x.asideLeft >= -1 && x.asideRight <= x.viewWidth + 1, detail: JSON.stringify(x) })
    }
    if (extra.groupShared) {
      const x = extra.groupShared
      out.push({ code, key: 'groupShared', name: 'Menu 浮層裡展開的「專案」回到並排仍展開、專案看得到(兩份共用狀態)', ok: x.flowState === 'expanded' && x.expanded === 'true' && x.projectVisible, detail: JSON.stringify(x) })
    }
    if (extra.navigated) {
      const x = extra.navigated
      const wantAgent = sc.expectAgentAfterLink
      out.push({ code, key: 'navigated', name: wantAgent ? '並排時從 AI agent 導向 Main:Main 換到 Insights、AI agent 維持開著' : '浮層時從 AI agent 導向 Main:AI agent 收起、Main 換到 Insights、焦點回 Main', ok: x.title === 'Insights' && x.agentVisible === wantAgent && (wantAgent || x.focus === 'main'), detail: JSON.stringify(x) })
      out.push({ code, key: 'insightsAside', name: '換到 Insights 時右側議題詳情一起收起(示範產品的導航;F11)', ok: x.title === 'Insights' && x.asideVisible === false, detail: JSON.stringify(x) })
    }
    if (extra.scrolled) {
      const s = extra.scrolled
      out.push({ code, key: 'pinned', name: '殼水平捲到底時 AI agent 浮層仍貼著看得到的右緣、遮罩仍蓋住看得到的範圍(§8 浮層不跟著捲走)', ok: s.scrolled > 0 && Math.abs(s.panelRightGap) <= 1 && s.scrimCovers, detail: JSON.stringify(s) })
    }
  }
  return out
}

/** 層級:並存面(z-40)< AI agent 浮層(z-[45])< 一般確認框(z-50)(v14 條 A + 推導第 4 題;靜態讀原始碼) */
function zOrder() {
  const panelSrc = readFileSync(join(ROOT, 'packages/design-system/src/components/AgentPanel/agent-panel.tsx'), 'utf8')
  const dialogSrc = readFileSync(join(ROOT, 'packages/design-system/src/components/Dialog/dialog.tsx'), 'utf8')
  const pz = +(panelSrc.match(/isOverlay && '[^']*?z-\[?(\d+)\]?/)?.[1] ?? NaN)
  const coexist = +(dialogSrc.match(/persistentElements \? "fixed[^"]*?z-\[?(\d+)\]?/)?.[1] ?? NaN)
  const stock = +(dialogSrc.match(/: "fixed left-1\/2 top-1\/2 z-\[?(\d+)\]?/)?.[1] ?? NaN)
  return { code: 'Z', key: 'z', name: '層級:並存面 < AI agent 浮層 < 一般確認框', ok: coexist < pz && pz < stock, detail: `並存面 z=${coexist} / AI agent z=${pz} / 確認框 z=${stock}` }
}

// ── 改壞的模型(對照組 a):錨點必須在原始碼剛好出現一次 ──
const MODEL_MUTANTS = [
  ['Right 放不下改成浮層', "    if (fits || id === 'right') {", '    if (fits) {'],
  ['AI agent 用固定 960 門檻', '    const fits = availableWidth - reserved >= minWidth[id]', "    const fits = id === 'agent' ? availableWidth >= 960 : availableWidth - reserved >= minWidth[id]"],
  ['上限不均分(剩餘全給每一個)', '      for (const p of growing) caps[p.id] = (caps[p.id] as number) + share', '      for (const p of growing) caps[p.id] = (caps[p.id] as number) + remaining'],
  ['浮層不留 48', '  const hi = Math.max(0, Math.min(max, availableWidth - edgeGap))', '  const hi = Math.max(0, Math.min(max, availableWidth))'],
  ['細列不先扣', '  let reserved = mainMinWidth + railWidth', '  let reserved = mainMinWidth'],
  ['拿掉連帶關閉', '  return input.mainMinWidth + input.railWidth + input.rightMinWidth + input.agentMinWidth > input.availableWidth', '  return false'],
  ['只點一下也寫紀錄', '  return input.moved ? input.displayedWidth : input.previousRecord', '  return input.displayedWidth'],
  ['關閉的 Menu 放不下時照字面暫藏', '      return { ...state, open: { ...state.open, menu: true }, menuOverlayActive: true }', '      return { ...state, open: { ...state.open, menu: true }, menuOverlayActive: false }'],
  ['捲動時 Main 不守最小寬', '  const mainWidth = horizontalOverflow > EPSILON ? mainMinWidth : availableWidth - railWidthInLayout - sideSum', '  const mainWidth = availableWidth - railWidthInLayout - sideSum'],
]

// ── DOM 破壞(對照組 b):每一種都必須讓指定的斷言紅 ──
// [名稱, 注入的 { css } 或 { script }, 只跑哪幾個情境(要碰得到那條斷言), 指定的斷言紅了沒]
// 腳本破壞把審查抓到的缺陷造回頁面上(2026-10-14):能造回原因的造原因(把手擋 pointerdown、AI agent 浮層把上面那層設 inert、
// 寬 0 的 Menu 拿掉 inert),造不回原因的造症狀(焦點沒落在入口鈕、Right 被捲出去、連結點了沒反應)—— 都是量具「該紅時會紅」的證明。
const DOM_SABOTAGE = [
  ['AI agent 浮層貼左(不留 48)', { css: '[data-agent-panel-mode="overlay"]{left:0!important;width:auto!important}' }, ['S10'], (res) => res.some((r) => !r.ok && /AI agent 浮層/.test(r.detail))],
  ['藏起浮層遮罩', { css: '[data-agent-panel-scrim]{display:none!important}' }, ['S10'], (res, ret) => ret.some((r) => r.key === 'scrim' && !r.ok)],
  ['AI agent 根節點 overflow:hidden(裁把手外側)', { css: '[data-app-shell-panel="agent"]{overflow:hidden!important}' }, ['S11'], (res, ret) => ret.some((r) => r.key === 'handle' && !r.ok)],
  ['殼不准水平捲', { css: '[data-app-shell-scroll]{overflow-x:hidden!important}' }, ['S7'], (res) => res.some((r) => !r.ok && /殼可以水平捲/.test(r.detail))],
  // 缺陷 1 的原因:把手擋下 pointerdown(在把手自己身上 stopPropagation —— Radix 的 React 捕獲已設「按在層裡」,document 上那一下到不了、旗標不歸零)
  ['Menu 浮層把手擋下 pointerdown(審查缺陷 1 的原因)', { script: `document.addEventListener('pointerdown', (e) => {
      const h = e.target instanceof Element ? e.target.closest('[data-menu-overlay] > [role="separator"]') : null
      if (h) h.addEventListener('pointerdown', (ev) => ev.stopPropagation(), { once: true })
    }, true)` }, ['S14'], (res) => res.some((r) => !r.ok && /menu 顯示方式/.test(r.detail))],
  // 缺陷 2 的症狀:入口鈕一拿到焦點就丟掉(= 焦點沒回入口鈕)
  ['入口鈕拿到焦點就丟掉(審查缺陷 2 的症狀)', { script: `document.addEventListener('focusin', (e) => {
      if (e.target instanceof Element && e.target.matches('[data-app-shell] button[aria-label*="代理"]')) setTimeout(() => e.target.blur(), 0)
    }, true)` }, ['S15'], (res) => res.some((r) => !r.ok && /焦點落點/.test(r.detail))],
  // 缺陷 3 的原因:寬 0 的 Menu 沒有 inert
  ['寬 0 的 Menu 拿掉 inert(審查缺陷 3 的原因)', { script: `const strip = () => document.querySelectorAll('[data-app-shell-panel="menu"]:not([data-menu-overlay]) [inert]').forEach((el) => el.removeAttribute('inert'))
    strip(); new MutationObserver(strip).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['inert'] })` }, ['S16'], (res, ret) => ret.some((r) => r.key === 'menuInert' && !r.ok)],
  // 缺陷 4 的原因:AI agent 浮層把疊在上面的層也設成 inert
  ['AI agent 浮層把上面那層設 inert(審查缺陷 4 的原因)', { script: `const lock = () => { if (!document.querySelector('[data-agent-panel-mode="overlay"]')) return
      document.querySelectorAll('[data-menu-overlay][data-state="open"], [role="dialog"][data-state="open"]').forEach((el) => { if (!el.hasAttribute('inert')) el.setAttribute('inert', '') }) }
    new MutationObserver(lock).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-agent-panel-mode', 'data-state'] })` }, ['S17', 'S18'], (res, ret) => ret.filter((r) => r.key === 'layersAbove' && !r.ok).length === 2],
  // 缺陷 5 的症狀:殼一捲就捲回 0(Right 留在看得到的範圍外)
  ['殼一捲就捲回 0(審查缺陷 5 的症狀)', { script: `document.addEventListener('scroll', (e) => {
      if (e.target instanceof Element && e.target.matches('[data-app-shell-scroll]') && e.target.scrollLeft !== 0) e.target.scrollLeft = 0
    }, true)` }, ['S19'], (res, ret) => ret.some((r) => r.key === 'rightVisible' && !r.ok)],
  // 缺陷 6 的症狀:版面上那一份的群組內容看不到
  ['版面上那份 Menu 的群組內容藏起來(審查缺陷 6 的症狀)', { css: '[data-app-shell-panel="menu"]:not([data-menu-overlay]) [data-sidebar="group-content"]{display:none!important}' }, ['S20'], (res, ret) => ret.some((r) => r.key === 'groupShared' && !r.ok)],
  // 缺陷 7 的症狀:AI agent 裡的連結點了沒反應(React 收不到)
  ['AI agent 裡的連結點了沒反應(審查缺陷 7 的症狀)', { script: `document.addEventListener('click', (e) => {
      if (e.target instanceof Element && e.target.closest('[data-agent-link]')) { e.preventDefault(); e.stopImmediatePropagation() }
    }, true)` }, ['S21', 'S22'], (res, ret) => ret.filter((r) => r.key === 'navigated' && !r.ok).length === 2],
  // ── 2026-10-15 r1b 複驗補:每一種都把當天的缺陷造回來 ──
  // F2 的原因:浮層底色寫回 --surface(深色半透明)
  ['Menu 浮層底色改回 --surface(F2 的原因)', { css: '[data-menu-overlay]{background-color:var(--surface)!important}' }, ['S23'], (res, ret) => ret.some((r) => r.key === 'overlayBg' && !r.ok)],
  // N2 的原因:浮層頂端有一顆包在 sr-only 裡的「關閉」(SheetHeader 內建的 ×)
  ['浮層頂端塞一顆 sr-only「關閉」(N2 的原因)', { script: `new MutationObserver(() => {
      const o = document.querySelector('[data-menu-overlay][data-state="open"]')
      if (o && !o.querySelector('[data-sabotage-close]')) { const w = document.createElement('div'); w.className = 'sr-only'; w.innerHTML = '<button type="button" data-sabotage-close aria-label="關閉">×</button>'; o.prepend(w) }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] })` }, ['S23'], (res, ret) => ret.some((r) => r.key === 'overlayFirstTab' && !r.ok)],
  // N3 的症狀:選單項聚焦就掛 describedby(隱藏提示)、而且第一下 Esc 被吃掉
  ['選單項聚焦時掛 describedby 並吞掉第一下 Esc(N3 的症狀)', { script: `let eaten = false
    document.addEventListener('focusin', (e) => { if (e.target instanceof Element && e.target.matches('[data-sidebar="menu-button"]')) { e.target.setAttribute('aria-describedby', 'sabotage-tip'); eaten = false } }, true)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !eaten && document.activeElement?.matches?.('[data-menu-overlay] [data-sidebar="menu-button"]')) { eaten = true; e.stopImmediatePropagation(); e.preventDefault() }
    }, true)` }, ['S23'], (res, ret) => ret.some((r) => r.key === 'overlayNoTooltip' && !r.ok) && ret.some((r) => r.key === 'sideBySideNoTooltip' && !r.ok) && res.some((r) => !r.ok && /menu 顯示方式/.test(r.detail))],
  // F4 的症狀:浮層開著時,細列那一份也長出一列標頭(48px)
  ['浮層開著時細列那份長出 48px 標頭(F4 的症狀)', { script: `new MutationObserver(() => {
      const open = document.querySelector('[data-menu-overlay][data-state="open"]')
      const rail = document.querySelector('[data-app-shell-panel="menu"]:not([data-menu-overlay]) [data-sidebar="sidebar"]')
      if (open && rail && !rail.querySelector('[data-sabotage-header]')) { const h = document.createElement('div'); h.setAttribute('data-sabotage-header', ''); h.setAttribute('data-sidebar', 'header'); h.style.height = '48px'; h.style.flexShrink = '0'; rail.prepend(h) }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] })` }, ['S24'], (res, ret) => ret.some((r) => r.key === 'railStable' && !r.ok)],
  // F9 的原因:Right 與 AI agent 的把手同名、沒有 aria-controls
  ['把手拿掉 aria-controls、Right / AI agent 改回同名(F9 的原因)', { script: `const strip = () => document.querySelectorAll('[data-app-shell-panel="right"] [role="separator"], [data-app-shell-panel="agent"] [role="separator"]').forEach((h) => { if (h.hasAttribute('aria-controls')) h.removeAttribute('aria-controls'); if (h.getAttribute('aria-label') !== '調整面板寬度') h.setAttribute('aria-label', '調整面板寬度') })
    strip(); new MutationObserver(strip).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-controls', 'aria-label'] })` }, ['S25'], (res, ret) => ret.some((r) => r.key === 'handles' && !r.ok)],
  // ── 2026-10-20 r1b 複核補 ──
  // D3 的症狀:AI agent 浮層把模擬瀏覽器工具列也一起設 inert(story 沒把 toolbarRef 傳進 persistentElements 時就是這樣)
  ['AI agent 浮層把模擬瀏覽器工具列也設 inert(D3 的症狀)', { script: `const lock = () => { if (!document.querySelector('[data-agent-panel-mode="overlay"]')) return
      const t = document.querySelector('[role="group"][aria-label^="模擬瀏覽器工具列"]'); if (t && !t.hasAttribute('inert')) t.setAttribute('inert', '') }
    lock(); new MutationObserver(lock).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-agent-panel-mode', 'inert'] })` }, ['S26'], (res, ret) => ret.some((r) => r.key === 'toolbar' && !r.ok)],
  // F10 的原因:Menu 浮層沒有傳送進畫布(畫布拿掉 transform 時 fixed 的 Sheet 與遮罩改以整個視窗定位 = 2026-10-14 傳送到 body 的樣子)
  ['畫布拿掉 transform:Menu 浮層與遮罩改以視窗定位(F10 的原因)', { css: '[data-simulated-canvas]{transform:none!important}' }, ['S28'], (res, ret) => ret.some((r) => r.key === 'frame' && !r.ok)],
  // F10 的症狀:殼沒有撐滿畫布(2026-10-14 裸 div 釘寬時右側一大片空白)
  ['殼縮成畫布的 70%(F10 的症狀)', { css: '[data-simulated-canvas] [data-app-shell]{width:70%!important;flex:none!important}' }, ['S27'], (res, ret) => ret.some((r) => r.key === 'frame' && !r.ok)],
  // F11 的症狀:導到 Insights 之後右側詳情還開著(連結點下去後再按一次 ⌘. 把詳情打開)
  ['導到 Insights 後詳情又打開(F11 的症狀)', { script: `document.addEventListener('click', (e) => {
      if (e.target instanceof Element && e.target.closest('[data-agent-link="insights"]')) setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '.', ctrlKey: true, bubbles: true })), 50)
    }, true)` }, ['S21', 'S22'], (res, ret) => ret.filter((r) => r.key === 'insightsAside' && !r.ok).length === 2],
  // N4 的原因:浮層名稱「Sidebar」、掛英文描述(照抄舊窄版 Sheet)
  ['Menu 浮層名稱改回「Sidebar」並掛描述(N4 的原因)', { script: `new MutationObserver(() => {
      const o = document.querySelector('[data-menu-overlay][data-state="open"]'); if (!o || o.hasAttribute('data-sabotage-name')) return
      o.setAttribute('data-sabotage-name', ''); o.removeAttribute('aria-labelledby'); o.setAttribute('aria-label', 'Sidebar'); o.setAttribute('aria-describedby', 'sabotage-desc')
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] })` }, ['S23'], (res, ret) => ret.some((r) => r.key === 'overlayName' && !r.ok)],
]

const snaps = await capture()
const results = evaluate(snaps, realModel)
const retained = [...retainedResults(snaps), zOrder()]

if (!SELFTEST) {
  for (const r of results) {
    if (r.title) console.log(`\n${r.code.split('.')[0]} ${r.title}`)
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.code} ${JSON.stringify(r.step)}${r.ok ? '' : `\n      ${r.detail}`}`)
  }
  console.log('')
  for (const r of retained) console.log(`${r.ok ? '✓' : '✗'} ${r.code} ${r.name}${r.ok ? '' : ` | ${r.detail}`}`)
  const failed = results.filter((r) => !r.ok).length + retained.filter((r) => !r.ok).length
  console.log(failed ? `\n✗ ${failed} 格不符` : `\n✅ AppShell 版面:真頁面 ${results.length} 步都等於模型、${retained.length} 條保留斷言成立`)
  await br.close(); await sv.stop()
  process.exit(failed ? 1 : 0)
}

// ── selftest ──
const problems = []
const baseFailed = [...results.filter((r) => !r.ok), ...retained.filter((r) => !r.ok)]
if (baseFailed.length) {
  for (const r of baseFailed) console.log(`✗ ${r.code} ${r.detail}`)
  problems.push(`前提不成立:真模型 + 未破壞頁面本身就有 ${baseFailed.length} 格不符`)
}
const source = readFileSync(MODEL_PATH, 'utf8')
const dir = mkdtempSync(join(tmpdir(), 'app-shell-layout-invariant-'))
if (!dir || !existsSync(dir)) { console.log('✗ selftest:暫存資料夾建立失敗'); process.exit(1) }
try {
  for (const [index, [name, find, replace]] of MODEL_MUTANTS.entries()) {
    const hits = source.split(find).length - 1
    if (hits !== 1) { problems.push(`改壞的模型「${name}」錨點出現 ${hits} 次(必須剛好 1 次)—— 閘與模型脫鉤`); continue }
    const file = join(dir, `mutant-${index}.ts`)
    writeFileSync(file, source.replace(find, replace))
    const mutant = await import(pathToFileURL(file).href)
    const red = evaluate(snaps, mutant).filter((r) => !r.ok)
    if (red.length === 0) problems.push(`改壞的模型「${name}」:頁面快照全部「相符」—— 閘看不出這種偏離`)
    else console.log(`✓ 改壞的模型「${name}」→ ${red.length} 格不符(例:${red[0].code})`)
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
for (const [name, sabotage, only, isRed] of DOM_SABOTAGE) {
  const bad = await capture(sabotage, only)
  const res = evaluate(bad, realModel)
  const ret = retainedResults(bad)
  if (isRed(res, ret)) console.log(`✓ 頁面破壞「${name}」→ 指定的斷言紅`)
  else problems.push(`頁面破壞「${name}」沒讓指定的斷言紅 —— 量具無效`)
}
await br.close(); await sv.stop()
if (problems.length) { console.log(`\n✗ selftest:\n  ${problems.join('\n  ')}`); process.exit(1) }
console.log(`\n✓ selftest:${MODEL_MUTANTS.length} 個改壞的模型與 ${DOM_SABOTAGE.length} 種頁面破壞各自讓閘紅了 —— 量具會紅`)
process.exit(0)
