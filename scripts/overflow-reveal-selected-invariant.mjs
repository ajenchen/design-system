#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 水平溢出的那一排(Chip scroll / menu、Tabs scroll / menu、FileViewer 縮圖列)「選到就露出來」——
 *         horizontal-overflow.spec.md「選到就露出來」對齊 B(user 2026-11-11「都先B」):四種輸入
 *         (滑鼠點半露的項目、方向鍵、⌄ 選單選取、縮放視窗 / 容器變窄)之後,使用者剛動到的那一項
 *         (點的 / 鍵盤焦點 / 選單選的 / 上一次揭露的)完整可讀(不在淡出區、不被箭頭蓋住),而且中心在捲動容器可視寬中心 ±2px;
 *         只有「置中需要捲到 < 0 或 > 最大捲動量」時才接受夾在那一端(另判:項目要落在那一端的半邊、仍完整可讀)。
 *         「什麼時候量」看因果、不數影格(2026-11-14 換掉「scrollLeft 連續 12 格不變」—— 那在 headless 下就是固定約 0.2 秒,
 *         而「捲過不搶回」這種格的正確結果是**沒有捲**,拿一段時間沒看到捲動當「沒捲」正是 M37 第八種形狀):
 *         開頁前裝「揭露探針」記下產品對捲動容器的每一次 scrollTo(產品只透過它捲,horizontal-overflow.spec.md「只捲這個容器」);
 *         每次動作之後 (a) 等我們自己掛在同一個捲動容器上的觀察器 / 監聽也收到這次觸發(選中屬性 / 新項目、容器尺寸、鍵盤焦點)
 *         → (b) 再過一個影格(產品的揭露在同一批觀察器回呼 / 同一次事件派發裡**同步**呼叫 scrollTo,這時一定呼叫完了)
 *         → (c) 這段時間產品沒呼叫 = 它決定不捲,立刻量 → (d) 有呼叫就等 scrollLeft 到它最後一次傳的位置(目標讀產品自己傳的值,
 *         閘不重寫公式;量到的對不對仍由 judge 判)→ (e) 那次呼叫真的會動到位置,再等一個比動作前新的 scrollend(smooth 的 scrollend 比位置晚到)
 *         → 等遮罩 / 箭頭 / ⌄ 跟上捲動位置、連續兩次讀值之間沒有新的尺寸通知或產品呼叫。
 *         夾具那一段(A7 ②,2026-11-14;量的是夾具頁 scripts/test-fixtures/overflow-reveal/fixture.tsx,不是 story:每一項寬度寫死、
 *         元件行為是這次 checkout 的原始碼)五排 × 六種格,共 28 格:M1 掛載時選在中間 → 置中;M2 掛載時選最後一項 → 夾在終點、完整可讀;
 *         N 新出現的已選項目(同一次狀態更新就是選中)→ 置中;U1 滾輪捲過 → 容器變窄 → 位置不動(不搶回);U2 箭頭翻頁捲過 → 同 U1(只有三排有箭頭);
 *         U3 捲過之後再選一項 → 容器變窄 → 照樣置中。這幾格守的是規格觸發表裡【AI 推導】的那幾句(規格自己標的;user 2026-11-11 定的只有
 *         「都先B」= 一律置中、兩端夾住),不是 user 的決定 —— user 之後若對「捲過不搶回」有不同答案,U1 / U2 的期望要翻面。
 *   紅: 任一格(元件 × 輸入 × 步驟)中心偏離 > 2px 且不是合法夾住(off-center)/ 項目被淡出或箭頭遮住(unreadable)
 *       → 指名哪一排、哪種輸入、哪一項、偏多少並 exit 1。夾具格:M1 / N / U3 沒置中、M2 沒夾在終點、U1 / U2 位置被拉回(產品有呼叫 scrollTo)→ exit 1。
 *       拿掉 primitive 的呼叫(selftest:每種輸入動作前一刻讓揭露探針把產品對捲動容器的 scrollTo 吞掉 = useRevealSelected 不作用)→ 每一排每種輸入都必須紅;
 *       2026-11-11 修前建置(`--selftest --control-static=<修前建置>`)直接點半露的 Chip / Tab、Tabs scroll 方向鍵、縮放視窗必紅。
 *       夾具三種破法(selftest;每一格被哪一種打紅、其餘破法下必須綠,比的是「紅的集合 = 期望」,破法打到 0 次 = 對照組不成立):
 *       swallow(吞掉 scrollTo)→ 只紅 M1 / M2 / N / U3;no-childlist(產品觀察器不看 childList = 1df095f1 之前)→ 只紅 N;
 *       mute-user-scroll(滾輪 / 箭頭翻頁訊號到不了產品 = 1df095f1 之前沒有旗標)→ 只紅 U1 / U2。
 *       「觸發晚到」兩面(selftest):第 30 個影格才按新增 —— 舊判準(連續 12 格不動,與排點擊寫在同一次頁面函式)回來時項目數必須還沒變,
 *       新判準回來時多 1 項而且新項目置中;缺一面就紅。
 *       產品要求的位置整體少 40px、照常捲到位(selftest 對照組 bias;2026-11-14 審查 A 的 b05)→ Chip menu 四種輸入都必須紅,
 *       而且結論必須是產品紅(exit 1),不是儀器失效 —— 「量到了而且錯」不得被說成「沒量到」。
 *       經符號連結叫自己、給不存在的建置(selftest)→ 必須以缺建置標記 + 結束碼 2 結束(「是不是被直接執行」比真實路徑,lib/direct-run.mjs)。
 *       零格量測 / 某種輸入一格「非夾住」的量測都沒有(數的是沒被兩端夾住的格 = needsCentring,不看量到的對不對)/ 點擊找不到半露的項目 /
 *       選單找不到觸發鈕 / 動作沒有造成預期的觸發 /
 *       產品要求的位置上限內沒到 / 到位卻等不到 scrollend / 遮罩箭頭 ⌄ 沒跟上捲動位置 / 夾具打包失敗 / 夾具幾何分不出「捲對了」與「沒捲」/
 *       使用者的捲動沒發生(沒有 scroll、等不到 scrollend、捲不到 24px、wheel / 箭頭翻頁訊號沒送到這一排)/ 位置變了但產品沒呼叫 /
 *       需要置中的夾具格全部 0 次 scrollTo(產品換了捲動方式)= 儀器失效(印 INSTRUMENT-FAIL、exit 2),不當綠燈、也不指控產品。
 *       結論的先後(純函式 overflowRunVerdict,主跑與 selftest 判定表共用):量到任何一格產品紅 → exit 1,儀器地板沒過的條目照印、不帶機讀標記;
 *       沒有產品紅才看地板 → exit 2。(中途丟出的儀器失效 —— story 開不起來、探針等不到 —— 照舊直接 exit 2,那時什麼都還沒判。)
 *   綠: 現況建置全部格子置中或合法夾住且完整可讀、夾具 28 格全綠;同一份 storybook-static 重複跑結果恆等(輸入順序固定、等的是觸發與產品要求的位置,不數影格)。
 *   量法: 判定抽成純函式 `judge`(幾何 → 結果)與 `maskObstruction`(遮罩字串 → 兩側被淡出的寬度),selftest 判定表兩面;
 *         遮擋寬度從捲動容器實際的 mask-image 讀(不抄 primitive 的常數),箭頭用真實按鈕的 getBoundingClientRect。
 *   幾何不靠字型(2026-11-12): 展示 story 的外框是寫死的寬度,項目多寬卻看這台機器有什麼字型 —— CI runner 沒有中文字型,
 *         Tabs 的 8 個頁籤整排塞得進 320px 外框:9126e95b 那一輪 Tabs scroll 的「點擊 / 方向鍵」因此全是夾住(什麼都沒驗到卻印 ✓),
 *         Tabs menu 則在「選單」那步找不到半露的項目而紅。現在每次開 story 歸零後先問純函式 `overflowPlan`:
 *         這一排有沒有「不是最後一項、又沒有完整可讀」的項目?有 → 照天然排版量(本機與之前完全一樣);
 *         沒有 → 把捲動容器的可視寬調成「中間那一項的中心」(從量到的項目位置算,至少放得下最寬的項目加兩側遮擋)再量,
 *         並在輸出標「自備幾何」。調完仍然沒有 = 儀器失效。
 *         selftest 兩面:把可視寬撐到「整排塞得下」/「只切到最後一項」(= CI 那一輪的兩種可能)——
 *         關掉自備幾何 → 重現當時的紅(儀器失效,訊息同 CI);開著 → 每一格都量到、全綠,而且點擊 / 方向鍵 / 選單 / 縮放都有「需要置中」的格子。
 *   自備幾何要讓每一步都有鑑別力(2026-11-12 第二次): c55c3786 在 CI runner 上自備幾何切在 136px、滑鼠點到的那一項太靠起點,
 *         縮放那一格怎麼改寬度都只能夾在起點 —— 主量測照樣綠,但「拿掉 primitive」的對照組那兩格也綠(沒捲與捲對了落進同一個判定),
 *         selftest 因此紅。現在 `overflowPlan` 挑寬度時就保證:預計點到的那一項置中後離兩端各 ≥ 8px、縮放切得出「改完仍然置中」的寬度;
 *         `resizePlan` 切不出來就回 null(不再退而回一個只能夾住的寬度)。天然排版下縮放切不出來 → 這一排改用自備幾何整圈重量;
 *         還是切不出來 = 儀器失效。selftest 多一面:「整排塞得下、自備幾何開、拿掉 primitive」Tabs 兩排每種輸入都必須紅(runner 上沒紅的那個幾何)。
 *
 * Run: node scripts/overflow-reveal-selected-invariant.mjs [--static=<dir>] [--dump=<檔>] [--selftest [--control-static=<修前建置>]]
 *      --dump:主跑把每一格寫成 JSON —— story 那一段「排 / 輸入 / 步驟 / 項目 / 判定 / 偏移」、夾具那一段「排 / 格 / 判定 / 偏移 / 產品呼叫次數」
 *      (工程比對用:換量法前後、本機對 CI)。
 * 結束碼:0 綠 / 1 紅 / 2 儀器失效(一律同時印 INSTRUMENT-FAIL 標記;lib/gate-selftest-meta.mjs 看標記不看結束碼)。
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, requireStorybookBuild,
  StoryRenderInstrumentError,
} from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { isDirectRun, missingBuildViaSymlinkControl } from './lib/direct-run.mjs'
import { FixtureInstrumentError, startStorybookCssFixture } from './lib/storybook-css-fixture.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARGS = process.argv.slice(2)
const arg = (name) => { const hit = ARGS.find((a) => a.startsWith(`${name}=`)); return hit ? hit.slice(name.length + 1) : null }
const STATIC = path.resolve(arg('--static') ?? path.join(REPO, 'storybook-static'))
const CONTROL_STATIC = arg('--control-static') ? path.resolve(arg('--control-static')) : null
const SOURCES = [
  'packages/design-system/src/patterns/horizontal-overflow/horizontal-overflow.tsx',
  'packages/design-system/src/hooks/use-overflow-items.ts',
  'packages/design-system/src/components/Chip/chip.tsx',
  'packages/design-system/src/components/Tabs/tabs.tsx',
  'packages/design-system/src/components/FileViewer/file-viewer.tsx',
  'packages/design-system/src/components/Chip/chip.principles.stories.tsx',
  'packages/design-system/src/components/Tabs/tabs.stories.tsx',
  'packages/design-system/src/components/FileViewer/file-viewer.stories.tsx',
  // 夾具那一段另外用到的元件:夾具量到的是「這次 checkout 的元件原始碼 + 那一份建置的 CSS」,元件比建置新 = 兩半對不上
  'packages/design-system/src/components/Button/button.tsx',
  'packages/design-system/src/components/Tooltip',
  'packages/design-system/src/components/DropdownMenu',
]
// 中心偏離容許值 = horizontal-overflow.spec.md「閘」句的「容器中心 ±2px」(唯一一份規範數字)。原名 TOLERANCE 與
// switch-thumb-ring-invariant.mjs 的 TOLERANCE = 8 撞名被 named-constant-drift 抓到 —— 那支的 8 是截圖每通道色差(/255),
// 與這裡的像素距離無關、不是同一個值的兩份,改名分開(2026-11-12)。
const CENTER_TOLERANCE_PX = 2
// 兩側遮擋最寬的估值(scroll 模式:箭頭 32 + 淡出 16)。只用在「還沒量之前」要先估的兩處 —— 找右側半露的項目、
// 自備幾何的可視寬下限;判定用的遮擋寬度一律從實際的 mask-image 讀(maskObstruction),不用這個數字。
const WIDEST_OBSTRUCTION_PX = 48
// menu 模式右側淡出的寬度:項目右緣超過「可視寬 − 這個值」= 沒有完整可讀
const MENU_FADE_PX = 16
// 「不是兩端夾住」的餘量:置中所需的 scrollLeft 離兩端至少這麼遠,這一格才算量到「真的在中心」。
// 必須 > CENTER_TOLERANCE_PX:這樣拿掉 primitive(scrollLeft 留在 0)時,項目中心離容器中心至少這麼遠 → 對照組必紅。
// 餘量 ≤ 容許值的話「沒捲」與「捲對了」會落進同一個判定(c55c3786 在 CI runner 上兩格縮放對照組沒紅的根因,見 resizePlan)。
const CLAMP_MARGIN_PX = 8
// 縮放那一格:可視寬至少要變這麼多才算「寬度真的變了」(比這少 = 視窗縮放沒碰到捲動容器,或自己改的寬度沒生效)
const RESIZE_MIN_DELTA_PX = 16
// 自備幾何挑寬度時「右側半露的是哪一項」不能卡在邊界上:改寬度的實際結果容許 ±1px(setVisibleWidth),邊界多留這麼多才不會換人
const PICK_STABILITY_PX = 2
// 揭露探針的上限(只是「等不到」的天花板,綠的路徑都是條件成立就回;design-horizontal-scroll.md 5.4):
// 動作之後等觸發送達;觸發送達之後等產品要求的位置 / scrollend / 遮罩箭頭跟上
const REVEAL_TRIGGER_CAP_MS = 5000
const REVEAL_ARRIVE_CAP_MS = 6000
// selftest 對照組 bias:產品要求的揭露位置整體少這麼多(審查 A 2026-11-14 b05 用的 40)。要遠大於 CENTER_TOLERANCE_PX 與
// CLAMP_MARGIN_PX,偏完的格才一定判 off-center / unreadable,不會落回容差內
const REVEAL_BIAS_PX = 40

// ── 受測的五排 ─────────────────────────────────────────────────────────────
// scroller = 頁面上第幾個 [data-overflow-scroller];item = 項目選擇器(修前建置也認得,對照組才量得到);
// menu = ⌄ 觸發鈕 aria-label 開頭(沒有 = 這一排沒有選單);keyTarget = 方向鍵之後要揭露的是誰(焦點 / aria-current);
// attr = 選中寫在項目的哪個屬性(= 產品 useRevealSelected 的 selectedAttribute;揭露探針的觀察器看它);arrows = 這一排有左右箭頭
export const STRIPS = Object.freeze([
  { key: 'chip-scroll', label: 'Chip layout="scroll"', story: 'design-system-components-chip-設計原則--layout-rule', scroller: 0, item: 'button[data-state]', attr: 'data-state', arrows: true, menu: null, keyTarget: 'focus', viewport: { width: 1280, height: 900 }, narrowTo: 400 },
  { key: 'chip-menu', label: 'Chip layout="menu"', story: 'design-system-components-chip-設計原則--layout-rule', scroller: 1, item: 'button[data-state]', attr: 'data-state', arrows: false, menu: '選項選單', keyTarget: 'focus', viewport: { width: 1280, height: 900 }, narrowTo: 400 },
  { key: 'tabs-scroll', label: 'Tabs overflow="scroll"', story: 'design-system-components-tabs-展示--overflow-scroll', scroller: 0, item: '[role="tab"]', attr: 'aria-selected', arrows: true, menu: null, keyTarget: 'focus', viewport: { width: 1280, height: 900 }, narrowTo: 300 },
  { key: 'tabs-menu', label: 'Tabs overflow="menu"', story: 'design-system-components-tabs-展示--overflow-menu', scroller: 0, item: '[role="tab"]', attr: 'aria-selected', arrows: false, menu: '頁籤選單', keyTarget: 'focus', viewport: { width: 1280, height: 900 }, narrowTo: 300 },
  { key: 'filmstrip', label: 'FileViewer 縮圖列', story: 'design-system-components-fileviewer-展示--event-photos-collection', scroller: 0, item: '[data-thumb-index]', attr: 'aria-current', arrows: true, menu: null, keyTarget: 'current', viewport: { width: 390, height: 800 }, narrowTo: 330, open: '檢視活動相集' },
])
export const INPUTS = Object.freeze(['click', 'keys', 'menu', 'resize'])

// ── 純函式:遮罩字串 → 兩側被淡出的寬度(px)──────────────────────────────
// 認 buildFadeMask 的形狀,也認瀏覽器序列化後的形狀(black ↔ rgb(0, 0, 0)、transparent ↔ rgba(0, 0, 0, 0))。
// 左側遮擋 = 第一個不透明色標的位置(若第一個色標不是不透明);右側同理從尾端算。沒有遮罩 = 0。
export function maskObstruction(mask, width) {
  if (!mask || mask === 'none') return { left: 0, right: 0 }
  const re = /(transparent|black|rgba?\([^)]*\))\s+(calc\(\s*100%\s*-\s*[\d.]+px\s*\)|[\d.]+(?:px|%))/g
  const stops = []
  let m
  while ((m = re.exec(mask))) {
    const color = m[1].replace(/\s+/g, '')
    const opaque = color === 'black' || color === 'rgb(0,0,0)' || /^rgba\(0,0,0,1(\.0+)?\)$/.test(color)
    const pos = m[2]
    const px = pos.startsWith('calc') ? width - parseFloat(pos.replace(/^calc\(\s*100%\s*-\s*/, '')) : pos.endsWith('%') ? (parseFloat(pos) * width) / 100 : parseFloat(pos)
    stops.push({ opaque, px })
  }
  if (stops.length === 0) return { left: 0, right: 0, unparsed: true }
  const firstOpaque = stops.find((s) => s.opaque)
  const lastOpaque = [...stops].reverse().find((s) => s.opaque)
  return {
    left: stops[0].opaque || !firstOpaque ? 0 : firstOpaque.px,
    right: stops[stops.length - 1].opaque || !lastOpaque ? 0 : width - lastOpaque.px,
  }
}

// ── 純函式:某一項要「置中、而且不是兩端夾住」,可視寬可以落在哪個範圍 ────────────────────
// g = { itemWidth, itemCentre(內容座標 = 含 scrollLeft), content(scrollWidth) }
// 下限:放得下那一項加兩側最寬遮擋(置中時完整可讀)。
// 上限:置中所需的 scrollLeft = itemCentre − W/2 離起點、終點各 ≥ CLAMP_MARGIN_PX。沒有這樣的寬度 → null。
// 為什麼上限重要:在這個範圍裡,就算完全沒捲(scrollLeft 0),那一項的中心也離容器中心 ≥ CLAMP_MARGIN_PX、
// 而且不算起點夾住(它在右半邊)—— 所以「有捲到中心」與「沒捲」一定判成不同結果,對照組才紅得起來。
export function centringWindow(g) {
  const lo = Math.ceil(g.itemWidth + 2 * WIDEST_OBSTRUCTION_PX + 8)
  const hi = Math.floor(2 * Math.min(g.itemCentre - CLAMP_MARGIN_PX, g.content - g.itemCentre - CLAMP_MARGIN_PX))
  return lo <= hi ? { lo, hi } : null
}

// ── 純函式:視窗縮放碰不到捲動容器時,可視寬該改成多少 ───────────────────────────
// g = { width(目前可視寬), itemWidth / itemCentre(剛點的那一項), content(scrollWidth) }
// 只回「改完之後那一項仍然置中、不是夾住」的寬度(centringWindow 裡),而且跟現在差 ≥ RESIZE_MIN_DELTA_PX:
// 依序試 縮 64 / 放寬 64 / 縮 32 / 放寬 32,都不在範圍裡再試範圍的兩個端點(離現在近的先)。沒有 → null。
// 2026-11-12 之前沒有的話會退而回一個「只能夾在端點」的寬度 —— 那一格對「有沒有捲」沒有鑑別力:CI runner 的字比較窄,
// Tabs 兩排自備幾何切到 136px、點到第 3 項(中心 80),縮放只能夾在起點 → 拿掉 primitive 那一格照樣綠(c55c3786 selftest 紅的兩行)。
// 現在沒有就是沒有,呼叫端改用自備幾何重切(overflowPlan force),還是沒有才當儀器失效。
export function resizePlan(g) {
  const win = centringWindow(g)
  if (!win) return null
  const far = (w) => Math.abs(w - g.width) >= RESIZE_MIN_DELTA_PX
  const stepped = [g.width - 64, g.width + 64, g.width - 32, g.width + 32].map(Math.round).find((w) => w >= win.lo && w <= win.hi)
  if (stepped != null) return { width: stepped }
  const edge = [win.lo, win.hi].filter(far).sort((x, y) => Math.abs(x - g.width) - Math.abs(y - g.width))[0]
  return edge != null ? { width: edge } : null
}

// ── 純函式:歸零時這一排的幾何夠不夠驗;不夠 → 該把可視寬調成多少 ─────────────────
// list = listInPage 的結果(每一項相對捲動容器左緣的 left / right,scW = 可視寬),必須在 scrollLeft 0 時量。
// 夠 = 有一個「不是最後一項」的項目沒有完整可讀(右緣超過可視寬 − 淡出寬:伸進淡出區或被切掉)。force = 不管夠不夠都自己切。
// 不夠 → 可視寬的範圍 [最寬的項目 + 兩側最寬遮擋 + 8, 倒數第二項的右緣 + 8]:
//   下限保證任何一項置中時放得進可讀區;上限保證倒數第二項仍然沒有完整可讀。下限 > 上限 = 這一排太短,切不出來。
// 在範圍裡從「中間那一項的中心」往兩邊找,取第一個讓後面每一步都量得到「真的置中」的寬度(anchor = 預計會被點到的那一項):
//   (1) 滑鼠會點到的那一項(第一個右緣超過 可視寬 − 最寬遮擋 的)不卡在邊界上、有點得到的部分、不是最後一項;
//   (2) 點它之後置中所需的 scrollLeft 離兩端各 ≥ CLAMP_MARGIN_PX;
//   (3) 承上縮放切得出寬度(resizePlan 不是 null;改寬度的實際結果容許 ±1px,所以這個寬度與左右各 1px 都要切得出);
//   (4) ⌄ 選單會選的那一項(第一個右緣超過 可視寬 − 淡出寬 的)置中時不會夾在終點。
// 四條都滿足的沒有 → 退而取滿足 (1)–(3) 的;還是沒有 → 回中間那一項的中心、anchor = null(縮放那一格由呼叫端判儀器失效)。
export function overflowPlan(list, { force = false } = {}) {
  const n = list?.length ?? 0
  if (n === 0) return { enough: false, target: null, why: '量不到任何項目' }
  const scW = list[0].scW
  if (!force && list.some((it, i) => i < n - 1 && it.right > scW - MENU_FADE_PX)) return { enough: true }
  if (n < 3) return { enough: false, target: null, why: `只有 ${n} 項,沒有「中間那一項」可以切` }
  const centre = (it) => (it.left + it.right) / 2
  const mid = (list[0].left + list[n - 1].right) / 2
  let m = 1
  for (let i = 2; i <= n - 2; i += 1) if (Math.abs(centre(list[i]) - mid) < Math.abs(centre(list[m]) - mid)) m = i
  const widest = Math.max(...list.map((it) => it.right - it.left))
  const lo = Math.ceil(widest + 2 * WIDEST_OBSTRUCTION_PX + 8)
  const hi = Math.floor(list[n - 2].right + 8)
  if (lo > hi) return { enough: false, target: null, why: `這一排太短:最寬的項目 ${widest.toFixed(1)}px 加兩側遮擋至少要 ${lo}px 可視寬,但倒數第二項的右緣只到 ${list[n - 2].right.toFixed(1)}px` }
  const preferred = Math.min(hi, Math.max(lo, Math.round(centre(list[m]))))
  const content = list[n - 1].right
  const S = PICK_STABILITY_PX
  const anchorAt = (W, withMenu) => {
    const edge = W - WIDEST_OBSTRUCTION_PX
    const p = list.findIndex((it) => it.right > edge - S)
    if (p < 0 || p >= n - 1) return -1
    const it = list[p]
    if (!(it.left < edge - S && it.right > edge + S)) return -1
    const want = centre(it) - W / 2
    if (want < CLAMP_MARGIN_PX || want > content - W - CLAMP_MARGIN_PX) return -1
    if (![W - 1, W, W + 1].every((w) => resizePlan({ width: w, itemWidth: it.right - it.left, itemCentre: centre(it), content }))) return -1
    if (withMenu) {
      const q = list.findIndex((x, i) => i < n - 1 && x.right > W - MENU_FADE_PX)
      if (q < 0 || centre(list[q]) - W / 2 > content - W - CLAMP_MARGIN_PX) return -1
    }
    return p
  }
  for (const withMenu of [true, false]) {
    for (let d = 0; d <= hi - lo; d += 1) {
      for (const W of d === 0 ? [preferred] : [preferred - d, preferred + d]) {
        if (W < lo || W > hi) continue
        const p = anchorAt(W, withMenu)
        if (p >= 0) return { enough: false, target: W, middle: m, anchor: p }
      }
    }
  }
  return { enough: false, target: preferred, middle: m, anchor: null }
}

// ── 純函式:一格量測 → 判定 ─────────────────────────────────────────────────
// g = { left, right(項目相對捲動容器可視區左緣), width(可視寬), scrollLeft, maxScroll, obstruction:{left,right}, arrowOverlap }
export function judge(g, where = '') {
  const center = (g.left + g.right) / 2
  const offset = Math.round((center - g.width / 2) * 10) / 10
  const readable = g.left >= g.obstruction.left - 0.5 && g.right <= g.width - g.obstruction.right + 0.5 && !g.arrowOverlap
  const clampedStart = g.scrollLeft <= 1 && offset < 0
  const clampedEnd = g.scrollLeft >= g.maxScroll - 1 && offset > 0
  const centered = Math.abs(offset) <= CENTER_TOLERANCE_PX
  const how = centered ? 'centered' : clampedStart ? 'clamped-start' : clampedEnd ? 'clamped-end' : 'off-center'
  if (!readable) {
    const why = g.arrowOverlap ? '被箭頭蓋住' : `落在淡出區(項目 ${g.left.toFixed(1)}..${g.right.toFixed(1)},可讀區 ${g.obstruction.left.toFixed(1)}..${(g.width - g.obstruction.right).toFixed(1)})`
    return { ok: false, how, kind: 'unreadable', offset, text: `${where}:選到的項目沒有完整可讀 —— ${why}` }
  }
  if (how === 'off-center') return { ok: false, how, kind: 'off-center', offset, text: `${where}:選到的項目中心偏離容器中心 ${offset}px(> ±${CENTER_TOLERANCE_PX};scrollLeft ${g.scrollLeft.toFixed(1)} / 最大 ${g.maxScroll},不是兩端夾住)` }
  return { ok: true, how, offset, text: `${where}:${how} ${offset}px` }
}

// ── 純函式:這一格算不算「需要置中」的量測(儀器地板數的就是它)──────────────────────
// = 沒被兩端夾住(judge 的 how 是 centered 或 off-center),**不看 ok**:地板要回答的是「置中這條有沒有被量到」,不是「量到的對不對」。
// 2026-11-14 審查 A:原本數「判成 centered 而且 ok」的格 —— 產品把揭露位置整體算錯時,需要置中的格全部變成 off-center,
// 這個數字歸零、整支以儀器失效結束,同一次量到的產品紅一行都沒印(量到了而且錯,被說成沒量到;M37:拿結果當幾何的代理)。
export const needsCentring = (res) => res.how === 'centered' || res.how === 'off-center'

// ── 純函式:產品要求的位置到了沒 ─────────────────────────────────────────────
// left = 產品最後一次傳給 scrollTo 的值(瀏覽器會夾在 0..最大);差 < 1px 算到。
// **這一份原始碼同時送進頁面**(揭露探針的 d 步,evalWith 序列化傳入)—— 判定表與頁面端是同一段文字,不得引用外部變數。
export function revealArrived({ scrollLeft, max, left }) {
  const target = Math.min(Math.max(0, max), Math.max(0, Number(left)))
  return Math.abs(scrollLeft - target) < 1
}

// ── 純函式:遮罩 / 箭頭 / ⌄ 跟上目前的捲動位置了沒 ──────────────────────────────
// judge 的「完整可讀」讀容器上的遮罩與箭頭,它們是 React 收到 scroll / 尺寸通知之後重畫才更新的 —— 量之前要等它們跟上。
// 門檻與 hooks/use-overflow-items.ts useScrollEdges 同一組(可捲 = scrollWidth > clientWidth + 1;起點 = scrollLeft ≤ 0;
// 終點 = scrollLeft ≥ 最大 − 1);在這裡只當「等待條件」,對不上只會變成儀器失效(等不到),不會變假綠。
// s = edgeStateInPage 的回傳;strip.arrows = 這一排有左右箭頭。另看「產品最後一次要求的位置到了沒」(吞掉 scrollTo 的對照組不看)。
export function edgesConsistent(s, { arrows = false } = {}) {
  const o = maskObstruction(s.mask, s.width)
  if (o.unparsed) return { ok: false, why: `讀不懂遮罩 ${s.mask}` }
  const canScroll = s.maxScroll > 1
  const wantLeft = canScroll && s.scrollLeft > 0
  const wantRight = canScroll && s.scrollLeft < s.maxScroll - 1
  const problems = []
  if ((o.left > 0) !== wantLeft) problems.push(`左側淡出 ${o.left}px,捲動位置 ${s.scrollLeft} 應${wantLeft ? '有' : '無'}`)
  if ((o.right > 0) !== wantRight) problems.push(`右側淡出 ${o.right}px,捲動位置 ${s.scrollLeft} / 最大 ${s.maxScroll} 應${wantRight ? '有' : '無'}`)
  if (arrows && (s.arrows.left !== wantLeft || s.arrows.right !== wantRight)) problems.push(`箭頭 左${s.arrows.left ? '有' : '無'} / 右${s.arrows.right ? '有' : '無'},應 左${wantLeft ? '有' : '無'} / 右${wantRight ? '有' : '無'}`)
  if (s.menu !== null && s.menu !== canScroll) problems.push(`⌄ ${s.menu ? '有' : '無'},可捲 ${canScroll ? '是' : '否'}`)
  if (s.lastLeft !== null && !s.swallow && !revealArrived({ scrollLeft: s.scrollLeft, max: s.maxScroll, left: s.lastLeft })) problems.push(`產品要求捲到 ${s.lastLeft},目前 ${s.scrollLeft}`)
  return { ok: problems.length === 0, why: problems.join('、') }
}

// ── 頁面端:量指定項目(以原始碼序列化傳進頁面:不得引用外部變數)────────────
const measureInPage = ([scIndex, itemSel, targetIndex]) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  if (!sc) return null
  const items = [...sc.querySelectorAll(itemSel)]
  const el = items[targetIndex]
  if (!el) return null
  const s = sc.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const left = r.left - s.left - sc.clientLeft
  const arrows = [...(sc.parentElement?.querySelectorAll('[data-overflow-arrow] button') ?? [])].map((b) => b.getBoundingClientRect())
  const arrowOverlap = arrows.some((a) => Math.min(a.right, r.right) - Math.max(a.left, r.left) > 0.5 && Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top) > 0.5)
  return {
    // aria-label 優先(縮圖列的縮圖:圖片版沒有文字、檔案圖示版的文字只有副檔名;Chip / Tab 沒有 aria-label,照舊讀文字)
    label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
    left, right: left + r.width, width: sc.clientWidth, scrollLeft: sc.scrollLeft, maxScroll: sc.scrollWidth - sc.clientWidth,
    mask: sc.style.maskImage || sc.style.webkitMaskImage || getComputedStyle(sc).maskImage || 'none',
    arrowOverlap,
  }
}

// 每一項的可見比例(找「右側半露」的那一項用)
const listInPage = ([scIndex, itemSel]) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  if (!sc) return null
  const s = sc.getBoundingClientRect()
  return [...sc.querySelectorAll(itemSel)].map((el) => {
    const r = el.getBoundingClientRect()
    const vis = Math.max(0, Math.min(r.right, s.right) - Math.max(r.left, s.left))
    return { ratio: vis / r.width, left: r.left - s.left, right: r.right - s.left, scW: s.width, label: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24) }
  })
}

// 把捲動容器的可視寬往 targetW 推一步:改它父層(flex 外殼)的寬度,差多少補多少。
// ⌄ 觸發鈕只在有溢出時才渲染,出現 / 消失會吃掉一段寬度 → 呼叫端等遮罩 / ⌄ 跟上之後再量、沒到位就再推一步。
// 回傳推之前 / 推完當下的寬度(讀 getBoundingClientRect 會強制排版:寬度真的變了,我們的 ResizeObserver 才會收到通知)
const nudgeScrollerWidthInPage = ([scIndex, targetW]) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  const host = sc?.parentElement
  if (!sc || !host) return null
  const now = sc.getBoundingClientRect().width
  const hostW = host.getBoundingClientRect().width
  host.style.maxWidth = 'none'
  host.style.flex = '0 0 auto' // 父層若是橫向 flex,寫死的寬度會被壓縮 / 撐開 → 鎖住
  host.style.width = `${Math.max(1, Math.round(hostW + (targetW - now)))}px`
  return { from: now, to: sc.getBoundingClientRect().width }
}
const scrollerWidthInPage = (scIndex) => document.querySelectorAll('[data-overflow-scroller]')[scIndex]?.getBoundingClientRect().width ?? null

// ── 揭露探針(頁面端;story 那一段與夾具那一段共用同一份)─────────────────────────────
// (1) 開頁前裝一次(page.addInitScript,整個分頁之後每一份文件都有):記下產品對捲動容器的每一次 scrollTo。
//     產品只透過 scroller.scrollTo 捲(horizontal-overflow.spec.md「只捲這個容器(scrollTo),不用 scrollIntoView」),
//     所以「產品要求捲到哪」直接讀它傳的 left,閘不重寫 computeRevealScrollLeft 的公式。
//     moves = 呼叫當下這一次會不會真的動到位置(判要不要等 scrollend 用;不看 scroll 事件 —— 瀏覽器把位置夾回範圍也會發 scroll、但沒有 scrollend)。
//     sabotage(對照組;網址參數 revealSabotage 或之後由閘直接改 window.__revealProbe.sabotage):
//       'swallow' = 產品對捲動容器的 scrollTo 變成不做事(= 拿掉 primitive 的作用;取代 2026-11-14 前的「換成空函式」,效果相同);
//       'bias' = 產品照常呼叫、也真的捲到它要求的位置,只是要求的位置整體少 probe.bias px(= 揭露公式算錯;閘在動作前一刻寫入)。
//         在「記錄」之前改:探針記到的、閘等到的都是算錯之後的位置 —— 跟真的公式錯一模一樣;
//       'no-childlist' / 'mute-user-scroll' 只能在掛載前決定(觀察器與監聽是掛載時建立的)→ 只走網址參數(夾具那一段用)。
//     sabotageHits = 破法實際打到幾次(打到 0 次 = 產品換了機制、破法不成立 → selftest 明確失敗,不默默當成「對照組綠」)。
//     userSignals = 送到捲動容器的「使用者自己捲」訊號數(滾輪 / 觸控 / 箭頭翻頁事件)。這個計數**先於**破法登記在 window 的捕獲階段,
//       所以破法擋掉的訊號照樣算到 —— U1 / U2 用它證明「這台機器真的送出了使用者的捲動」;沒送到 = 儀器失效,不指控產品。
const installRevealProbeInPage = () => {
  if (window.__revealProbe) return
  const sabotage = new URLSearchParams(window.location.search).get('revealSabotage') || ''
  const probe = { sabotage, calls: [], sabotageHits: 0, userSignals: 0, bias: 0 }
  window.__revealProbe = probe
  const nativeScrollTo = Element.prototype.scrollTo
  Element.prototype.scrollTo = function (...args) {
    if (this instanceof Element && this.hasAttribute('data-overflow-scroller')) {
      const objectForm = Boolean(args[0] && typeof args[0] === 'object')
      const o = objectForm ? args[0] : { left: args[0] }
      let left = Number(o.left)
      if (probe.sabotage === 'bias' && Number.isFinite(left)) {
        left -= probe.bias
        probe.sabotageHits += 1
        args = objectForm ? [{ ...args[0], left }] : [left, args.length > 1 ? args[1] : this.scrollTop]
      }
      const max = Math.max(0, this.scrollWidth - this.clientWidth)
      probe.calls.push({ el: this, left, moves: Math.abs(this.scrollLeft - Math.min(max, Math.max(0, left))) >= 1 })
      if (probe.sabotage === 'swallow') { probe.sabotageHits += 1; return undefined }
    }
    return nativeScrollTo.apply(this, args)
  }
  // 產品認的「使用者自己捲」訊號(horizontal-overflow.tsx useRevealSelected 的 wheel / touchstart / 箭頭翻頁事件監聽)。
  // 'ds-overflow-user-scroll' 是產品沒有 export 的事件名(OVERFLOW_USER_SCROLL_EVENT),這裡是第二個出現的地方:
  // 產品改名時 userSignals 收不到 → U2 判儀器失效;mute-user-scroll 也打不到 → selftest 的 U2「該紅沒紅」—— 會自己報出來,改這裡。
  const USER_SIGNALS = ['wheel', 'touchstart', 'ds-overflow-user-scroll']
  const inScroller = (e) => e.target instanceof Element && Boolean(e.target.closest('[data-overflow-scroller]'))
  for (const type of USER_SIGNALS) window.addEventListener(type, (e) => { if (inScroller(e)) probe.userSignals += 1 }, { capture: true, passive: true })
  if (sabotage === 'no-childlist') {
    // 只打 useRevealSelected 的那一個觀察器:它同時帶 childList + attributeOldValue + attributeFilter(產品 mo.observe);
    // useScrollEdges 的那一個沒有 attributes、揭露探針自己的那一個沒有 attributeOldValue —— 兩個都不受影響
    const nativeObserve = MutationObserver.prototype.observe
    MutationObserver.prototype.observe = function (target, options) {
      const reveal = Boolean(options && options.childList && options.attributeOldValue && Array.isArray(options.attributeFilter))
      if (reveal) probe.sabotageHits += 1
      return nativeObserve.call(this, target, reveal ? { ...options, childList: false } : options)
    }
  }
  if (sabotage === 'mute-user-scroll') {
    // 訊號送不到產品(window 捕獲階段就停掉,產品掛在捲動容器上的監聽收不到);只擋傳遞、不取消預設行為 —— 滾輪照樣會捲
    for (const type of USER_SIGNALS) window.addEventListener(type, (e) => { if (inScroller(e)) { probe.sabotageHits += 1; e.stopImmediatePropagation() } }, { capture: true })
  }
}

// (2) 捲動容器出現之後,在它身上掛我們自己的觀察器與監聽(同一份文件只掛一次)。
//     產品的觀察器早在掛載時就建好;觀察器回呼在同一次畫面更新 / 同一個微任務檢查點全部送完、同一個元素上的事件監聽在同一次派發裡跑完 ——
//     所以「我們的也收到了」再過一個影格,產品對這次觸發該呼叫的 scrollTo 一定都呼叫完了,不管兩邊誰先建立。
const armScrollerInPage = ([scIndex, attrName]) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  if (!sc || !window.__revealProbe) return null
  if (!sc.__revealArm) {
    const arm = { resize: 0, mutation: 0, focus: 0, scroll: 0, seq: 0, lastScroll: 0, lastEnd: 0 }
    sc.__revealArm = arm
    new ResizeObserver(() => { arm.resize += 1 }).observe(sc)
    new MutationObserver((records) => { arm.mutation += records.length }).observe(sc, { attributes: true, attributeFilter: [attrName], subtree: true, childList: true })
    sc.addEventListener('focusin', () => { arm.focus += 1 })
    sc.addEventListener('scroll', () => { arm.scroll += 1; arm.seq += 1; arm.lastScroll = arm.seq })
    sc.addEventListener('scrollend', () => { arm.seq += 1; arm.lastEnd = arm.seq })
  }
  return true
}

// (3) 動作前的快照:各計數 + 產品對**這個**容器已經呼叫幾次
const revealMarkInPage = (scIndex) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  const arm = sc?.__revealArm
  if (!arm || !window.__revealProbe) return null
  const { resize, mutation, focus, scroll, lastScroll, lastEnd } = arm
  return { resize, mutation, focus, scroll, lastScroll, lastEnd, calls: window.__revealProbe.calls.filter((c) => c.el === sc).length, signals: window.__revealProbe.userSignals }
}
const UNARMED_MARK = Object.freeze({ resize: 0, mutation: 0, focus: 0, scroll: 0, lastScroll: 0, lastEnd: 0, calls: 0, signals: 0 })

// (4) 動作後:a 觸發送達(kinds 任一的計數比快照大)→ b 再過一個影格 → c 這段時間產品對這個容器沒呼叫 → 立刻回(它決定不捲);
//     吞掉 scrollTo 的對照組有呼叫就回(不等位置)→ d 等 scrollLeft 到產品最後一次要求的位置(arrived = revealArrived,序列化傳入)
//     → e drain 而且有任何一次呼叫真的會動到位置 → 等一個比**動作前快照**新的 scrollend(瞬間捲動的 scrollend 可能在開始等之前就到了,基準取動作之前)。
//     掛載那一次 drain = false:產品的瞬間捲動發生在我們掛監聽之前,它的 scrollend 收不到。
const awaitRevealInPage = ([scIndex, mark, kinds, triggerCapMs, arriveCapMs, drain], arrived) => new Promise((resolve) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  const arm = sc?.__revealArm
  const probe = window.__revealProbe
  if (!arm || !probe) return resolve({ ok: false, why: 'unarmed' })
  const t0 = performance.now()
  let fencedAt = null
  const tick = () => {
    const seen = kinds.some((k) => arm[k] > mark[k])
    if (!seen) {
      if (performance.now() - t0 > triggerCapMs) return resolve({ ok: false, why: 'no-trigger' })
      return requestAnimationFrame(tick)
    }
    if (fencedAt === null) { fencedAt = performance.now(); return requestAnimationFrame(tick) }
    const calls = probe.calls.filter((c) => c.el === sc).slice(mark.calls)
    const moved = calls.some((c) => c.moves)
    if (calls.length === 0 || probe.sabotage === 'swallow') return resolve({ ok: true, calls: calls.length, moved })
    const last = calls[calls.length - 1]
    const max = sc.scrollWidth - sc.clientWidth
    const there = arrived({ scrollLeft: sc.scrollLeft, max, left: last.left })
    const drained = !drain || !moved || arm.lastEnd > mark.lastEnd
    if (there && drained) return resolve({ ok: true, calls: calls.length, moved, target: last.left })
    if (performance.now() - fencedAt > arriveCapMs) return resolve({ ok: false, why: there ? 'no-scrollend' : 'not-arrived', target: last.left, scrollLeft: sc.scrollLeft, max, calls: calls.length })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

// (5) 等遮罩 / 箭頭 / ⌄ 跟上:每次讀一份狀態(edgesConsistent 在 Node 判),中間隔整整一次畫面更新(兩個 rAF)
const edgeStateInPage = ([scIndex, menuLabel, sinceCalls]) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  const probe = window.__revealProbe
  if (!sc || !probe) return null
  const host = sc.parentElement
  const calls = probe.calls.filter((c) => c.el === sc)
  return {
    scrollLeft: sc.scrollLeft, maxScroll: sc.scrollWidth - sc.clientWidth, width: sc.clientWidth,
    mask: sc.style.maskImage || sc.style.webkitMaskImage || getComputedStyle(sc).maskImage || 'none',
    arrows: { left: Boolean(host?.querySelector('[data-overflow-arrow="left"]')), right: Boolean(host?.querySelector('[data-overflow-arrow="right"]')) },
    menu: menuLabel ? Boolean(host?.querySelector(`button[aria-label^="${menuLabel}"]`)) : null,
    calls: calls.length, lastLeft: calls.length > sinceCalls ? calls[calls.length - 1].left : null,
    swallow: probe.sabotage === 'swallow', resize: sc.__revealArm?.resize ?? null,
  }
}
const nextPaintInPage = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))

// 歸零:直接設 scrollLeft = 0(不是產品的 scrollTo,探針不記);真的動了就等它的 scrollend(免得晚到的那一個騙過後面的等待)
const zeroScrollInPage = ([scIndex, sinceEnd, capMs]) => new Promise((resolve) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  const arm = sc?.__revealArm
  if (!arm) return resolve({ ok: false, why: 'unarmed' })
  const from = sc.scrollLeft
  sc.scrollLeft = 0
  if (Math.abs(from - sc.scrollLeft) < 0.5) return resolve({ ok: true, moved: false })
  const t0 = performance.now()
  const tick = () => {
    if (arm.lastEnd > sinceEnd) return resolve({ ok: true, moved: true })
    if (performance.now() - t0 > capMs) return resolve({ ok: false, why: 'no-scrollend', from })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

// (6) 檢視器進場(縮放 95% → 100%)期間量到的座標是縮放過的:等捲動容器的祖先上所有有限長度的動畫播完
const awaitScrollerAnimationsInPage = ([scIndex, capMs]) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  if (!sc) return Promise.resolve({ ok: false, why: 'no-scroller' })
  const running = document.getAnimations().filter((a) => {
    const end = a.effect?.getComputedTiming?.().endTime
    const target = a.effect?.target
    return Number.isFinite(end) && target instanceof Element && target.contains(sc) && a.playState !== 'finished'
  })
  const cap = new Promise((resolve) => setTimeout(() => resolve('cap'), capMs))
  return Promise.race([Promise.all(running.map((a) => a.finished.catch(() => null))).then(() => 'done'), cap])
    .then((how) => ({ ok: how === 'done', count: running.length }))
}

// (7) 使用者的捲動(滾輪 / 箭頭翻頁)沒有產品呼叫可讀:等這一排在快照之後有 scroll,而且最後一個 scroll 之後有 scrollend。
//     動作之前先用 awaitScrollQuietInPage 確認「之前每一段捲動都收到了 scrollend」,所以這裡不會被上一步晚到的 scrollend 騙。
const awaitUserScrollInPage = ([scIndex, mark, capMs]) => new Promise((resolve) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  const arm = sc?.__revealArm
  const probe = window.__revealProbe
  if (!arm || !probe) return resolve({ ok: false, why: 'unarmed' })
  const t0 = performance.now()
  const tick = () => {
    const signals = probe.userSignals - mark.signals
    if (arm.scroll > mark.scroll && arm.lastEnd > arm.lastScroll) return resolve({ ok: true, scrolls: arm.scroll - mark.scroll, signals, scrollLeft: sc.scrollLeft })
    if (performance.now() - t0 > capMs) return resolve({ ok: false, why: arm.scroll > mark.scroll ? 'no-scrollend' : 'no-scroll', signals })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const awaitScrollQuietInPage = ([scIndex, capMs]) => new Promise((resolve) => {
  const arm = document.querySelectorAll('[data-overflow-scroller]')[scIndex]?.__revealArm
  if (!arm) return resolve({ ok: false, why: 'unarmed' })
  const t0 = performance.now()
  const tick = () => {
    if (arm.lastEnd >= arm.lastScroll) return resolve({ ok: true })
    if (performance.now() - t0 > capMs) return resolve({ ok: false, why: 'no-scrollend' })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

// 夾具:項目數與哪幾項是選中
const itemStatesInPage = ([scIndex, itemSel, attr, on]) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  if (!sc) return null
  const items = [...sc.querySelectorAll(itemSel)]
  return { count: items.length, selected: items.flatMap((el, i) => (el.getAttribute(attr) === on ? [i] : [])) }
}
const scrollerBoxInPage = (scIndex) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  if (!sc) return null
  const r = sc.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: sc.clientWidth, scrollLeft: sc.scrollLeft, maxScroll: sc.scrollWidth - sc.clientWidth }
}
// 夾具 Tabs / Chip 的外框變窄 by px(縮圖列改視窗寬);回傳改之前的外框寬
const shrinkBoxInPage = (by) => {
  const box = document.getElementById('box')
  if (!box) return null
  const from = box.getBoundingClientRect().width
  box.style.width = `${from - by}px`
  return from
}
// U3 的候選:每一項的內容座標、寬、離可視寬中心多遠、選中沒、有沒有一個點得到它本身的點(被箭頭蓋住的點不算)
const reselectCandidatesInPage = ([scIndex, itemSel, attr, on]) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  if (!sc) return null
  const s = sc.getBoundingClientRect()
  const mid = s.left + s.width / 2
  return [...sc.querySelectorAll(itemSel)].map((el, i) => {
    const r = el.getBoundingClientRect()
    const y = (r.top + r.bottom) / 2
    const lo = Math.max(r.left, s.left) + 1
    const hi = Math.min(r.right, s.right) - 1
    let hit = null
    const c = (r.left + r.right) / 2
    for (let d = 0; lo <= hi && d <= (hi - lo); d += 2) {
      for (const x of d === 0 ? [c] : [c - d, c + d]) {
        if (x < lo || x > hi) continue
        const at = document.elementFromPoint(x, y)
        if (at && (at === el || el.contains(at))) { hit = { x, y }; break }
      }
      if (hit) break
    }
    return { i, selected: el.getAttribute(attr) === on, centre: r.left + r.width / 2 - s.left - sc.clientLeft + sc.scrollLeft, width: r.width, fromCentre: c - mid, hit }
  })
}
// 第 atFrame 個影格才點 selector(「觸發晚到」新判準那一面:快照在排這一下之前取,新判準等的是觸發本身,兩次呼叫之間隔多久都不影響)
const scheduleClickAtFrameInPage = ([selector, atFrame]) => {
  const el = document.querySelector(selector)
  if (!el) return false
  let n = 0
  const tick = () => { n += 1; if (n >= atFrame) el.click(); else requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  return true
}
// **只當「觸發晚到」對照用**:2026-11-14 之前的判準(scrollLeft 連續 stillFrames 格不變就算捲完),原 waitScrollStill 逐字搬來改名。
// 「第 clickAtFrame 格才按 #add」與這個判準寫在**同一次頁面函式、同一條 rAF 鏈**上,先後只由影格數決定 ——
// 分成兩次 page.evaluate 的話,兩次之間只要隔超過 clickAtFrame − stillFrames 格(CI 忙時做得到),舊判準就會等到那一下 → 對照組假紅(plan 第一節第 4 點)。
// 舊判準回來的那一格當場量 measureIndex 那一項(measure = measureInPage,序列化傳入),看它會被判成什麼。
const legacyStillFramesInPage = ([scIndex, itemSel, stillFrames, capMs, clickAtFrame, measureIndex], measure) => new Promise((resolve) => {
  const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
  const add = document.getElementById('add')
  if (!sc || !add) return resolve({ ok: false, why: 'missing' })
  const count = () => sc.querySelectorAll(itemSel).length
  const itemsAtStart = count()
  const t0 = performance.now()
  let frame = 0
  let last = sc.scrollLeft
  let still = 0
  let done = false
  const tick = () => {
    frame += 1
    if (frame === clickAtFrame) add.click()
    if (!done) {
      const cur = sc.scrollLeft
      if (cur === last) still += 1; else { still = 0; last = cur }
      if (still >= stillFrames) { done = true; resolve({ ok: true, frame, itemsAtStart, itemsWhenReturned: count(), g: measure([scIndex, itemSel, measureIndex]) }) }
      else if (performance.now() - t0 > capMs) { done = true; resolve({ ok: false, why: 'not-still' }) }
    }
    if (frame < clickAtFrame || !done) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

// 把頁面函式連同它要用的純函式一起送進頁面(同 lib/launch-browser.mjs settleImagesAndFrames 以 toString 組字串的寫法):
// 純函式只有一份原始碼,判定表與頁面端共用。fn 與 helpers 都不得引用外部變數。
const evalWith = (page, fn, arg, ...helpers) => page.evaluate(`(${fn.toString()})(${JSON.stringify(arg)}${helpers.map((h) => `, ${h.toString()}`).join('')})`)

// 揭露探針回「沒等到」時的人話(主跑與 selftest 共用)
export function explainRevealWait(r, kinds) {
  if (!r) return '量測沒有回傳(頁面換掉了?)'
  if (r.why === 'unarmed') return '捲動容器沒有掛上量測(頁面換掉了,或探針沒在開頁前裝上)'
  if (r.why === 'no-trigger') return `動作沒有造成預期的觸發(等的是 ${kinds.join(' / ')}:選中屬性沒變、容器寬度沒變,或焦點沒移到項目上)`
  if (r.why === 'not-arrived') return `產品要求捲到 ${r.target}(最大 ${r.max}),上限內沒有到(停在 ${r.scrollLeft})`
  if (r.why === 'no-scrollend') return `產品要求的位置 ${r.target} 到了,但等不到 scrollend`
  return `沒等到(${JSON.stringify(r)})`
}

class Instrument extends StoryRenderInstrumentError {}
const fail = (storyId, reason) => new Instrument({ storyId, kind: 'dom-not-settled', reason })

// 兩次讀到的狀態之間沒有新的尺寸通知、產品呼叫、捲動位置或寬度改變(⌄ 出現 / 消失會讓容器再變一次寬、產品再揭露一次)
const sameEdgeState = (a, b) => a.resize === b.resize && a.calls === b.calls && a.scrollLeft === b.scrollLeft && a.width === b.width && a.maxScroll === b.maxScroll

// ── 揭露探針的 Node 端(story 那一段與夾具那一段共用;一排一份)──────────────────────────
// failWith(reason) → 這一排的儀器失效例外。每個動作的固定寫法:mark = markOf() → 動作 → awaitReveal(mark, 觸發種類) → settleEdges(mark.calls)。
function revealSync(page, strip, failWith) {
  const markOf = async (what) => {
    const m = await page.evaluate(revealMarkInPage, strip.scroller)
    if (!m) throw failWith(`${what}:捲動容器沒有掛上量測(頁面換掉了,或探針沒在開頁前裝上)`)
    return m
  }
  const awaitReveal = async (mark, kinds, what, { drain = true } = {}) => {
    const r = await evalWith(page, awaitRevealInPage, [strip.scroller, mark, kinds, REVEAL_TRIGGER_CAP_MS, REVEAL_ARRIVE_CAP_MS, drain], revealArrived)
    if (!r?.ok) throw failWith(`${what}:${explainRevealWait(r, kinds)}`)
    return r
  }
  // 遮罩 / 箭頭 / ⌄ 跟上目前的捲動位置,而且連續兩次讀值(中間隔整整一次畫面更新)之間沒有新的尺寸通知或產品呼叫
  const settleEdges = async (sinceCalls, what) => {
    const t0 = Date.now()
    let prev = null
    for (;;) {
      const s = await page.evaluate(edgeStateInPage, [strip.scroller, strip.menu, sinceCalls])
      if (!s) throw failWith(`${what}:捲動容器不見了`)
      const e = edgesConsistent(s, strip)
      if (e.ok && prev && sameEdgeState(prev, s)) return s
      if (Date.now() - t0 > REVEAL_ARRIVE_CAP_MS) throw failWith(`${what}之後遮罩 / 箭頭 / ⌄ 沒有跟上捲動位置(上限 ${REVEAL_ARRIVE_CAP_MS}ms;${e.ok ? '一直有新的尺寸通知或產品呼叫' : e.why})`)
      prev = e.ok ? s : null
      await page.evaluate(nextPaintInPage)
    }
  }
  // 開頁之後:掛觀察器 → 掛載圍欄(我們的 ResizeObserver 第一次回呼 + 一個影格 + 掛載那次呼叫到位;不收 scrollend)→ 祖先的進場動畫播完 → 遮罩跟上
  const arm = async (what) => {
    if (!(await page.evaluate(armScrollerInPage, [strip.scroller, strip.attr]))) throw failWith(`${what}:找不到捲動容器,或揭露探針沒在開頁前裝上`)
    await awaitReveal(UNARMED_MARK, ['resize'], `${what}(掛載)`, { drain: false })
    const anim = await page.evaluate(awaitScrollerAnimationsInPage, [strip.scroller, REVEAL_ARRIVE_CAP_MS])
    if (!anim?.ok) throw failWith(`${what}:捲動容器祖先上的進場動畫(${anim?.count ?? '?'} 個)上限內沒有播完`)
    await settleEdges(0, what)
  }
  // 歸零:設 scrollLeft = 0,真的動了就等它的 scrollend,再等遮罩跟上
  const zero = async (what) => {
    const m = await markOf(what)
    const z = await page.evaluate(zeroScrollInPage, [strip.scroller, m.lastEnd, REVEAL_ARRIVE_CAP_MS])
    if (!z?.ok) throw failWith(`${what}:${z?.why === 'no-scrollend' ? `把 scrollLeft 從 ${z.from} 歸零之後等不到 scrollend` : '捲動容器沒有掛上量測'}`)
    await settleEdges(m.calls, what)
  }
  // 把可視寬往 targetW 推一步:推完當場讀寬度(讀它會強制排版)—— 真的變了才有尺寸觸發可等;回傳推完之後的可視寬
  const nudgeTo = async (targetW, what) => {
    const m = await markOf(what)
    const r = await page.evaluate(nudgeScrollerWidthInPage, [strip.scroller, targetW])
    if (!r) throw failWith(`${what}:找不到捲動容器或它的父層`)
    if (Math.abs(r.to - r.from) >= 0.5) await awaitReveal(m, ['resize'], what)
    await settleEdges(m.calls, what)
    return page.evaluate(scrollerWidthInPage, strip.scroller)
  }
  return { markOf, awaitReveal, settleEdges, arm, zero, nudgeTo }
}

// ── 主量測 ─────────────────────────────────────────────────────────────────
// neutralize:'none' | 'before-action'(每種輸入動作前一刻注入 swallow)| 'bias'(同一個時點注入 bias)。回傳 { cells, totals, selfCuts }
// totals.nonClamped[輸入] = 那種輸入「需要置中」的格數(needsCentring:沒被兩端夾住,不看綠不綠)
// 每一排先照天然排版量;天然排版下「縮放」切不出「改完仍然置中」的寬度(剛點的那一項太靠端點)→ 這一排改用自備幾何(forced)重量,
// 點擊 / 縮放那一圈已經記的格子收回,後面的方向鍵 / 選單也用同一個幾何。
// 以下四個只給 selftest 的對照組用:
//   only   = 只跑這幾排(STRIPS 的 key);inputs = 只跑這幾種輸入(縮放承接點擊,要一起給)
//   starve = 開 story 歸零後先把可視寬撐成「整排塞得下」('fit')或「只切到最後一項」('last-only')—— CI 沒有中文字型時的兩種幾何
//   selfCut= false 關掉「幾何不夠就自備」(重現修之前的行為)
async function scanBuild(staticDir, { fresh = true, neutralize = 'none', log = console.log, only = null, inputs = INPUTS, starve = null, selfCut = true } = {}) {
  if (fresh) requireFreshStorybookBuild(staticDir, SOURCES)
  const server = await startA11yStaticServer({ rootDirectory: staticDir, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip()
  if (!browser) { await server.stop(); return null }
  const cells = []
  const totals = { cells: 0, nonClamped: Object.fromEntries(INPUTS.map((i) => [i, 0])) }
  const selfCuts = []
  const runs = (input) => inputs.includes(input)
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.addInitScript(installRevealProbeInPage)
    for (const strip of STRIPS) {
      if (only && !only.includes(strip.key)) continue
      const url = `${server.origin}/iframe.html?id=${encodeURIComponent(strip.story)}&viewMode=story`
      const sync = revealSync(page, strip, (reason) => fail(strip.story, `${strip.label} ${reason}`))
      let forced = false // 這一排改用自備幾何(天然排版有溢出、但縮放量不到「需要置中」的格子時由點擊 / 縮放那一圈設起來)
      const open = async () => {
        await page.setViewportSize(strip.viewport)
        await page.mouse.move(1, 1)
        await openStory(page, url, { waitFor: strip.open ? 'button' : '[data-overflow-scroller]', settleFrames: 10, notFound: server.notFound })
        if (strip.open) {
          await page.getByRole('button', { name: strip.open }).click()
          await page.waitForSelector(strip.item, { state: 'visible' })
        }
        await page.waitForSelector(`[data-overflow-scroller] ${strip.item}`, { state: 'attached' })
        await sync.arm('載入')
        await sync.zero('歸零')
        if (starve) {
          const list = await page.evaluate(listInPage, [strip.scroller, strip.item])
          const last = list[list.length - 1]
          await setVisibleWidth(Math.round(starve === 'fit' ? last.right + 64 : last.right - 4), `對照組幾何(${starve})`)
        }
        if (!selfCut) return { cut: false, plan: null }
        const plan = overflowPlan(await page.evaluate(listInPage, [strip.scroller, strip.item]), { force: forced })
        if (plan.enough) return { cut: false, plan }
        if (plan.target == null) throw fail(strip.story, `${strip.label} ${forced ? '天然排版下縮放量不到「需要置中」的格子' : '歸零後沒有可以驗的溢出'},也切不出自備幾何 —— ${plan.why}`)
        const got = await setVisibleWidth(plan.target, '自備幾何')
        if (!overflowPlan(await page.evaluate(listInPage, [strip.scroller, strip.item])).enough) throw fail(strip.story, `${strip.label} 把可視寬調成 ${plan.target}px(實得 ${got}px)之後,仍然沒有「不是最後一項、又沒有完整可讀」的項目`)
        if (!selfCuts.some((c) => c.strip === strip.key)) selfCuts.push({ strip: strip.key, label: strip.label, width: got, forced })
        return { cut: true, plan }
      }
      // 把可視寬調到 targetW(±1px;最多推 4 步)再歸零。回傳實得的寬度
      const setVisibleWidth = async (targetW, what) => {
        let got = null
        for (let k = 0; k < 4; k += 1) {
          got = await sync.nudgeTo(targetW, what)
          if (Math.abs(got - targetW) <= 1) break
        }
        if (Math.abs(got - targetW) > 1) throw fail(strip.story, `${strip.label} ${what}:可視寬調不到 ${targetW}px(停在 ${got}px)`)
        await sync.zero(`${what}後歸零`)
        return Math.round(got)
      }
      // 拿掉 primitive 的作用(selftest 對照組):揭露探針從這一刻起把產品對捲動容器的 scrollTo 吞掉;換頁就恢復(探針每份文件重裝)。
      // neutralize = 'bias':同一個時點改成「產品要求的位置整體少 REVEAL_BIAS_PX」(照常呼叫、照常捲到位,只是位置算錯)
      const before = async () => {
        if (neutralize === 'before-action') await page.evaluate(() => { window.__revealProbe.sabotage = 'swallow' })
        if (neutralize === 'bias') await page.evaluate((px) => { window.__revealProbe.sabotage = 'bias'; window.__revealProbe.bias = px }, REVEAL_BIAS_PX)
      }
      const record = async (input, step, targetIndex) => {
        const g = await page.evaluate(measureInPage, [strip.scroller, strip.item, targetIndex])
        if (!g) throw fail(strip.story, `${strip.label} ${input} 量不到第 ${targetIndex + 1} 項`)
        const obstruction = maskObstruction(g.mask, g.width)
        if (obstruction.unparsed) throw fail(strip.story, `${strip.label} 讀不懂遮罩:${g.mask}`)
        const res = judge({ ...g, obstruction }, `${strip.label} × ${input}${step ? ` ${step}` : ''}「${g.label}」`)
        cells.push({ strip: strip.key, input, step, label: g.label, ...res })
        totals.cells += 1
        if (needsCentring(res)) totals.nonClamped[input] += 1
        return res
      }
      // 1. 滑鼠點右側「沒有完整可讀」的項目(伸進右側淡出 / 箭頭區或被容器切掉,而且有點得到的可見部分 —— 使用者真的點得到的那一顆)
      // 2. 縮放視窗(承上:剛點的那一項是上一次揭露的項目)
      // 兩步包在一圈裡:外框寫死寬度、而天然排版下縮放切不出「改完仍然置中」的寬度 → 收回這一圈記的格子,這一排改用自備幾何整圈重來一次。
      if (runs('click')) {
        for (;;) {
          const mark = { length: cells.length, cells: totals.cells, nonClamped: { ...totals.nonClamped } }
          const opened = await open()
          const hitPick = await page.evaluate(([scIndex, itemSel, widest]) => {
            const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
            const s = sc.getBoundingClientRect()
            const items = [...sc.querySelectorAll(itemSel)]
            for (let i = 0; i < items.length; i += 1) {
              const r = items[i].getBoundingClientRect()
              if (r.right <= s.right - widest || r.left >= s.right) continue // 完整在可讀區(以最寬的遮擋估)或整顆在外
              const y = (r.top + r.bottom) / 2
              for (let x = Math.min(r.right, s.right) - 2; x > Math.max(r.left, s.left); x -= 2) {
                const hit = document.elementFromPoint(x, y)
                if (hit && (hit === items[i] || items[i].contains(hit))) return { i, x, y }
              }
            }
            return null
          }, [strip.scroller, strip.item, WIDEST_OBSTRUCTION_PX])
          if (!hitPick) throw fail(strip.story, `${strip.label} 歸零後找不到右側沒有完整可讀、又點得到的項目(這一排沒有溢出?)`)
          const clickedIndex = hitPick.i
          const clickMark = await sync.markOf('點擊')
          await before()
          await page.mouse.click(hitPick.x, hitPick.y)
          await sync.awaitReveal(clickMark, ['mutation'], '點擊')
          await sync.settleEdges(clickMark.calls, '點擊')
          await record('click', '', clickedIndex)
          if (!runs('resize')) break

          const clientWidthOf = () => page.evaluate((i) => document.querySelectorAll('[data-overflow-scroller]')[i].clientWidth, strip.scroller)
          const w0 = await clientWidthOf()
          const resizeMark = await sync.markOf('縮放視窗')
          await before()
          await page.setViewportSize({ width: strip.narrowTo, height: strip.viewport.height })
          // 縮完當場讀一次寬度(讀它會強制排版):容器真的變了才有尺寸觸發可等;沒變 = 視窗碰不到容器,下面走改容器寬的退路
          if (Math.abs((await clientWidthOf()) - w0) >= 0.5) await sync.awaitReveal(resizeMark, ['resize'], '縮放視窗')
          await sync.settleEdges(resizeMark.calls, '縮放視窗')
          let w1 = await clientWidthOf()
          let how = `視窗 ${strip.viewport.width} → ${strip.narrowTo}`
          if (Math.abs(w1 - w0) < RESIZE_MIN_DELTA_PX) {
            // 展示 story 的外框寫死寬度(或已經是自備幾何),視窗縮放碰不到捲動容器 → 直接改捲動容器的可視寬(同一個觸發:容器尺寸改變)。
            // 改成多少由純函式 resizePlan 從量到的幾何算:縮或放寬都算尺寸改變,只取「改完之後那一項仍然置中、不是夾在端點」的寬度。
            const geo = await page.evaluate(([i, sel, idx]) => {
              const sc = document.querySelectorAll('[data-overflow-scroller]')[i]
              const s = sc.getBoundingClientRect()
              const r = sc.querySelectorAll(sel)[idx].getBoundingClientRect()
              return { width: sc.clientWidth, itemWidth: r.width, itemCentre: r.left + r.width / 2 - s.left - sc.clientLeft + sc.scrollLeft, content: sc.scrollWidth, scrollLeft: sc.scrollLeft }
            }, [strip.scroller, strip.item, clickedIndex])
            const plan = resizePlan(geo)
            if (!plan) {
              if (selfCut && !forced && !opened.cut) {
                // 天然排版有溢出,但剛點的那一項太靠端點:這一格量出來只會是「夾住」,對有沒有捲沒有鑑別力 → 收回、改用自備幾何重來
                cells.length = mark.length
                totals.cells = mark.cells
                totals.nonClamped = mark.nonClamped
                forced = true
                continue
              }
              const planned = opened.cut ? `;自備幾何(可視寬 ${opened.plan.target}px)預計點到第 ${opened.plan.anchor == null ? '?(沒有任何寬度滿足)' : opened.plan.anchor + 1} 項` : ''
              throw fail(strip.story, `${strip.label} 縮放:外框寫死寬度,剛點的第 ${clickedIndex + 1} 項(中心 ${geo.itemCentre.toFixed(1)}、寬 ${geo.itemWidth.toFixed(1)}px,整排 ${geo.content}px)在可視寬 ${geo.width}px 下切不出「改完仍然置中、不是夾在端點」的寬度${planned}`)
            }
            for (let k = 0; k < 4 && Math.abs(w1 - plan.width) > 1; k += 1) {
              w1 = Math.round(await sync.nudgeTo(plan.width, '改容器寬度'))
            }
            if (Math.abs(w1 - plan.width) > 1) throw fail(strip.story, `${strip.label} 縮放:可視寬調不到 ${plan.width}px(停在 ${w1}px)`)
            how = `外框寫死寬度 → 可視寬 ${plan.width > w0 ? '放寬' : '縮'}到 ${plan.width}px(改寬度前 scrollLeft ${geo.scrollLeft.toFixed(1)})`
          }
          if (Math.abs(w1 - w0) < RESIZE_MIN_DELTA_PX) throw fail(strip.story, `${strip.label} 縮放後捲動容器寬度沒變(${w0} → ${w1})`)
          await record('resize', `(${how},容器 ${w0} → ${w1})`, clickedIndex)
          break
        }
      }

      // 3. 方向鍵:Tab 進入這一排(或檢視器)後連按 → 每一步都量
      if (runs('keys')) {
      await open()
      const total = (await page.evaluate(listInPage, [strip.scroller, strip.item])).length
      if (strip.keyTarget === 'focus') {
        await page.evaluate(([scIndex]) => {
          const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
          const a = document.createElement('button'); a.textContent = 'probe'; a.id = '__reveal_probe'
          a.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0'
          sc.parentElement.insertBefore(a, sc)
        }, [strip.scroller])
        await page.focus('#__reveal_probe')
        const tabMark = await sync.markOf('Tab 進入這一排')
        await page.keyboard.press('Tab')
        await sync.awaitReveal(tabMark, ['focus'], 'Tab 進入這一排')
        await sync.settleEdges(tabMark.calls, 'Tab 進入這一排')
      }
      const steps = Math.min(total - 1, 6)
      // 方向鍵之後的觸發:焦點移到下一項(Chip / Tabs 的漫遊焦點;Tabs 自動啟用另有選中改變)/ 縮圖列的 aria-current 換人
      const keyKinds = strip.keyTarget === 'focus' ? ['focus', 'mutation'] : ['mutation']
      for (let k = 0; k < steps; k += 1) {
        const keyMark = await sync.markOf(`方向鍵第 ${k + 1} 下`)
        await before()
        await page.keyboard.press('ArrowRight')
        await sync.awaitReveal(keyMark, keyKinds, `方向鍵第 ${k + 1} 下`)
        await sync.settleEdges(keyMark.calls, `方向鍵第 ${k + 1} 下`)
        const ti = await page.evaluate(([scIndex, itemSel, mode]) => {
          const sc = document.querySelectorAll('[data-overflow-scroller]')[scIndex]
          const items = [...sc.querySelectorAll(itemSel)]
          return mode === 'focus' ? items.indexOf(document.activeElement) : items.findIndex((el) => el.getAttribute('aria-current') === 'true')
        }, [strip.scroller, strip.item, strip.keyTarget])
        if (ti < 0) throw fail(strip.story, `${strip.label} 方向鍵第 ${k + 1} 下之後找不到${strip.keyTarget === 'focus' ? '焦點所在的項目' : '目前那一項(aria-current)'}`)
        await record('keys', `第 ${k + 1} 下`, ti)
      }
      }

      // 4. ⌄ 選單選取:第一個沒有完整可讀的項目(伸進右側淡出區或在容器外;不是最後一項)、最後一項
      if (strip.menu && runs('menu')) {
        for (const which of ['partial', 'last']) {
          await open()
          const list = await page.evaluate(listInPage, [strip.scroller, strip.item])
          const ti = which === 'last' ? list.length - 1 : list.findIndex((it, i) => i < list.length - 1 && it.right > it.scW - MENU_FADE_PX)
          if (ti < 0) throw fail(strip.story, `${strip.label} 選單:找不到${which === 'last' ? '最後一項' : '沒有完整可讀的項目'}`)
          const trigger = page.locator(`button[aria-label^="${strip.menu}"]`).first()
          if (await trigger.count() === 0) throw fail(strip.story, `${strip.label} 找不到 ⌄ 觸發鈕(aria-label 開頭「${strip.menu}」)`)
          await trigger.click()
          const option = page.locator('[role="menu"] [role^="menuitem"]', { hasText: list[ti].label }).first()
          await option.waitFor({ state: 'visible', timeout: 5000 })
          const menuMark = await sync.markOf('選單選取')
          await before()
          await option.click()
          await page.locator('[role="menu"]').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
          await sync.awaitReveal(menuMark, ['mutation'], '選單選取')
          await sync.settleEdges(menuMark.calls, '選單選取')
          await record('menu', which === 'last' ? '(最後一項)' : '(第一個沒有完整可讀的項目)', ti)
        }
      }
      const cut = selfCuts.find((c) => c.strip === strip.key)
      log(`  ${strip.label}:${cells.filter((c) => c.strip === strip.key).map((c) => `${c.input}${c.ok ? '✓' : '✗'}`).join(' ')}${cut ? `  〔自備幾何:${cut.forced ? '天然排版下剛點的那一項太靠端點,縮放量不到「需要置中」的格子' : '這台機器的字寬下這一排沒有溢出到中間的項目'},可視寬改成 ${cut.width}px 再量〕` : ''}`)
    }
  } finally { await browser.close(); await server.stop() }
  return { cells, totals, selfCuts }
}

// --dump 的格式:每一格只留「排 / 輸入 / 步驟 / 項目 / 判定 / 偏移」(換量法前後、本機對 CI 逐格比對用)
const dumpCells = (cells) => cells.map((c) => ({ strip: c.strip, input: c.input, step: c.step, label: c.label, ok: c.ok, how: c.how, kind: c.kind ?? null, offset: c.offset }))

export function instrumentProblems(totals) {
  const problems = []
  if (totals.cells === 0) problems.push('一格都沒量到')
  for (const input of INPUTS) if (!totals.nonClamped[input]) problems.push(`輸入「${input}」沒有任何一格「需要置中」的量測(全是夾住或沒量到 —— 置中這條從沒被驗過)`)
  return problems
}

/**
 * 純函式:主跑的結論(主跑與 selftest 判定表共用)。量到的產品紅先判 —— 任何一格紅(off-center / unreadable / 夾具 ✗)= exit 1,
 * 儀器地板沒過的條目照印、但不帶機讀標記(這一次的結論是「量到了而且錯」,不是「沒量到」);沒有產品紅才看地板 → exit 2。
 * @param {{ bad: unknown[], floor: string[] }} run  bad = 紅的格;floor = instrumentProblems + fixtureInstrumentProblems
 * @returns {{ exit: 0|1|2, kind: 'pass'|'product'|'instrument' }}
 */
export function overflowRunVerdict({ bad, floor }) {
  if (bad.length) return { exit: 1, kind: 'product' }
  if (floor.length) return { exit: 2, kind: 'instrument' }
  return { exit: 0, kind: 'pass' }
}

// ══ 夾具那一段(A7 ②,2026-11-14)════════════════════════════════════════════════
// 守的是 horizontal-overflow.spec.md「選到就露出來」觸發表裡 2026-11-12 補的三句 + 掛載那一次 —— 那張表整張是【AI 推導】(規格自己標的;
// user 2026-11-11 定的只有「都先B」= 一律置中、兩端夾住),所以這一段的期望也是【AI 推導】,不是 user 的決定。
// 量的是夾具頁(scripts/test-fixtures/overflow-reveal/fixture.tsx),不是 story:每一項寬度寫死、元件行為是這次 checkout 的原始碼。
const FIXTURE_SOURCE = 'scripts/test-fixtures/overflow-reveal/fixture.tsx'
const REVEAL_FIXTURE_ITEMS = 12
const REVEAL_FIXTURE_MID = 5 // 一開始選在第 6 項(中間)
const REVEAL_FIXTURE_LAST = REVEAL_FIXTURE_ITEMS - 1
// 「容器變窄」一律變窄(最大捲動量只會變大,瀏覽器不會把位置夾回 —— 夾回有 scroll 事件、沒有 scrollend)
const REVEAL_SHRINK_PX = 32
const REVEAL_WHEEL_DELTA_PX = 150
// 「位置沒動」的容許值(捲過不搶回)
const HELD_TOLERANCE_PX = 1
// 使用者的捲動至少要捲開這麼多,「捲過」才算真的發生(滾輪在這台機器上沒把這一排捲開 = 儀器失效)
const USER_SCROLL_MIN_PX = 24
// 「觸發晚到」對照:第幾個影格才觸發、舊判準要連續幾格不動(原 waitScrollStill 的 12)
const LATE_TRIGGER_FRAME = 30
const LEGACY_STILL_FRAMES = 12

export const FIXTURE_STRIPS = Object.freeze([
  { key: 'tabs-scroll', label: 'Tabs overflow="scroll"', scroller: 0, item: '[role="tab"]', attr: 'aria-selected', on: 'true', arrows: true, menu: null, viewport: { width: 1280, height: 900 } },
  { key: 'tabs-menu', label: 'Tabs overflow="menu"', scroller: 0, item: '[role="tab"]', attr: 'aria-selected', on: 'true', arrows: false, menu: '頁籤選單', viewport: { width: 1280, height: 900 } },
  { key: 'chip-scroll', label: 'Chip layout="scroll"', scroller: 0, item: 'button[data-state]', attr: 'data-state', on: 'on', arrows: true, menu: null, viewport: { width: 1280, height: 900 } },
  { key: 'chip-menu', label: 'Chip layout="menu"', scroller: 0, item: 'button[data-state]', attr: 'data-state', on: 'on', arrows: false, menu: '選項選單', viewport: { width: 1280, height: 900 } },
  { key: 'filmstrip', label: 'FileViewer 縮圖列', scroller: 0, item: '[data-thumb-index]', attr: 'aria-current', on: 'true', arrows: true, menu: null, viewport: { width: 390, height: 800 }, open: true },
])
// 每一格守規格的哪一句、會被哪一種破法打紅(其餘破法下必須綠;同 data-table-multi-sort-invariant.mjs 的 hitBy 寫法)
export const FIXTURE_CELLS = Object.freeze({
  M1: { name: '掛載那次置中(一開始選在中間)', spec: '容器尺寸改變(含掛載後第一次排版)→ 還沒有揭露過就揭露唯一的選中項', hitBy: ['swallow'] },
  M2: { name: '掛載那次夾在終點(一開始選最後一項)', spec: '同上 + 置中會超出範圍時夾住、項目落在那一端的半邊仍完整可讀', hitBy: ['swallow'] },
  N: { name: '新出現的已選項目', spec: '新加進來的項目一掛上去就是選中也算(childList)', hitBy: ['swallow', 'no-childlist'] },
  U1: { name: '滾輪捲過 → 容器變窄不搶回', spec: '上一次揭露之後使用者自己捲過(滾輪)→ 尺寸改變不捲', hitBy: ['mute-user-scroll'] },
  U2: { name: '箭頭翻頁 → 容器變窄不搶回', spec: '上一次揭露之後使用者自己捲過(箭頭翻頁)→ 尺寸改變不捲', hitBy: ['mute-user-scroll'] },
  U3: { name: '捲過之後再選一項 → 容器變窄照樣置中', spec: '「上一次揭露之後」—— 每次揭露把「捲過」歸零', hitBy: ['swallow'] },
})
export const FIXTURE_SABOTAGES = Object.freeze({
  swallow: '產品對捲動容器的 scrollTo 不做事(= 拿掉 primitive)',
  'no-childlist': '產品揭露用的 MutationObserver 不看 childList(= 1df095f1 之前)',
  'mute-user-scroll': '滾輪 / 觸控 / 箭頭翻頁的訊號到不了產品(= 1df095f1 之前沒有「捲過」旗標)',
})
// 主跑:每一排開兩次頁 —— 選在中間(M1 → N → U1 → U3 → U2)、選最後一項(M2)
export const FIXTURE_MAIN_RUNS = Object.freeze([
  { sabotage: '', selected: REVEAL_FIXTURE_MID, flow: 'full' },
  { sabotage: '', selected: REVEAL_FIXTURE_LAST, flow: 'mount-only' },
])

/** 純函式:一趟夾具在一排上要量哪幾格(依序)。flow:full / no-user-scroll(吞掉 scrollTo 時捲過不搶回沒東西可驗)/ mount-only */
export function fixturePlan(strip, { selected, flow }) {
  if (flow === 'mount-only') return [selected === REVEAL_FIXTURE_LAST ? 'M2' : 'M1']
  if (flow === 'no-user-scroll') return ['M1', 'N', 'U3']
  return ['M1', 'N', 'U1', 'U3', ...(strip.arrows ? ['U2'] : [])]
}
/** 純函式:一組趟數該量的「排 | 格」清單 */
export const plannedFixtureKeys = (runs) => runs.flatMap((run) => FIXTURE_STRIPS.flatMap((strip) => fixturePlan(strip, run).map((cell) => `${strip.key}|${cell}`)))

/**
 * 純函式:夾具的幾何能不能分辨「捲對了」與「沒捲」。g = measureInPage 的回傳(left / right 相對可視區,scrollLeft、maxScroll、width)。
 * centered:這一項在目前可視寬下置中不會夾到端點(centringWindow:沒捲時它的中心也離容器中心 ≥ CLAMP_MARGIN_PX、而且在右半邊)。
 * clamped-end:最後一項置中所需的位置超出終點 ≥ CLAMP_MARGIN_PX(否則「夾在終點」與「置中」是同一個判定)。不成立 = 儀器失效(夾具的幾何跑掉了)。
 */
export function fixtureGeometry(g, want) {
  const itemWidth = g.right - g.left
  const itemCentre = (g.left + g.right) / 2 + g.scrollLeft
  const content = g.maxScroll + g.width
  if (want === 'centered') {
    const win = centringWindow({ itemWidth, itemCentre, content })
    if (win && g.width >= win.lo && g.width <= win.hi) return { ok: true }
    return { ok: false, why: `這一項(內容座標中心 ${itemCentre.toFixed(1)}、寬 ${itemWidth.toFixed(1)}px,整排 ${content}px)在可視寬 ${g.width}px 下置中會夾到端點或放不下(可分辨的可視寬 ${win ? `${win.lo}..${win.hi}` : '不存在'})` }
  }
  const beyond = itemCentre - g.width / 2 - g.maxScroll
  if (beyond >= CLAMP_MARGIN_PX) return { ok: true }
  return { ok: false, why: `最後一項置中所需的位置只超出終點 ${beyond.toFixed(1)}px(< ${CLAMP_MARGIN_PX}),「夾在終點」與「置中」分不出來` }
}

/** 純函式:M1 / M2 / N / U3 的判定(judge 的結果 → 這一格綠不綠)。M2 要夾在終點,其餘要置中 */
export function judgeFixtureCell(cell, res, note = '') {
  const want = cell === 'M2' ? 'clamped-end' : 'centered'
  if (res.ok && res.how === want) return { ok: true, kind: want, offset: res.offset, text: res.text }
  const why = res.ok ? `${res.text}(這一格應該是 ${want === 'centered' ? '置中' : '夾在終點'})` : res.text
  return { ok: false, kind: res.kind ?? res.how, offset: res.offset, text: `${why}${note ? `;${note}` : ''}` }
}

/**
 * 純函式:捲過不搶回(U1 / U2)。before = 使用者捲完停下的 scrollLeft;after = 容器變窄、產品決定完之後的 scrollLeft;
 * calls = 這一步產品對捲動容器呼叫 scrollTo 幾次;anchorOffset = 上一次揭露的那一項離容器中心多遠。
 * 回 ok:true(沒搶回)/ ok:false(搶回了 = 紅)/ kind 'instrument'(分不出來或不能算到產品頭上 = 儀器失效)。
 */
export function judgeHeld({ before, after, calls, anchorOffset }, where = '') {
  const moved = Math.abs(after - before) > HELD_TOLERANCE_PX
  const offset = anchorOffset
  if (!moved) {
    if (Math.abs(anchorOffset) >= CLAMP_MARGIN_PX) return { ok: true, kind: 'held', offset, text: `${where}:位置沒動(${before} → ${after}),上次揭露的項目離中心 ${anchorOffset}px` }
    return { ok: null, kind: 'instrument', offset, text: `${where}:使用者捲到的位置剛好讓上次揭露的項目落在中心附近(偏 ${anchorOffset}px < ${CLAMP_MARGIN_PX}),「沒搶回」與「搶回了」分不出來` }
  }
  if (calls >= 1) return { ok: false, kind: 'grabbed-back', offset, text: `${where}:使用者捲到 scrollLeft ${before},容器變窄後變成 ${after}(產品呼叫 scrollTo ${calls} 次;上次揭露的項目偏移 ${anchorOffset}px)—— 搶回了使用者的捲動位置` }
  return { ok: null, kind: 'instrument', offset, text: `${where}:位置變了(${before} → ${after})但產品沒有呼叫 scrollTo —— 是使用者的捲動還沒停,或瀏覽器把位置夾回,不能算到產品頭上` }
}

/** 純函式:U3 點哪一項 —— 沒選中、點得到,而且「變窄之後的可視寬」下置中不會夾到端點的項目裡,離可視寬中心最近的那一個。沒有 → null */
export function pickReselect(candidates, { width, content }) {
  const after = width - REVEAL_SHRINK_PX
  const usable = (candidates ?? []).filter((c) => {
    if (c.selected || !c.hit) return false
    const win = centringWindow({ itemWidth: c.width, itemCentre: c.centre, content })
    return Boolean(win) && after >= win.lo && after <= win.hi
  })
  return usable.length ? usable.reduce((best, c) => (Math.abs(c.fromCentre) < Math.abs(best.fromCentre) ? c : best)) : null
}

/** 純函式:一種破法實跑的結果對期望 —— 回傳不符的說明(空陣列 = 紅的集合正好等於期望的集合、該量的都量了、沒有多量) */
export function compareFixtureControl(sabotage, planned, cells) {
  const problems = []
  const got = new Map(cells.map((c) => [`${c.strip}|${c.cell}`, c]))
  for (const key of planned) {
    const c = got.get(key)
    if (!c) { problems.push(`${key} 沒量到`); continue }
    const wantRed = FIXTURE_CELLS[c.cell].hitBy.includes(sabotage)
    if (wantRed && c.ok) problems.push(`${key} 應紅、實綠(${c.text})`)
    if (!wantRed && !c.ok) problems.push(`${key} 應綠、實紅(${c.text})`)
  }
  for (const key of got.keys()) if (!planned.includes(key)) problems.push(`${key} 不在這一趟的計畫裡卻量了`)
  return problems
}

/** 純函式:夾具那一段的儀器地板 —— 格數對得上計畫;需要置中的正向格裡至少一格記到產品的 scrollTo(全部「位置對了卻一次呼叫都沒有」= 產品換了捲動方式,探針讀不到) */
export function fixtureInstrumentProblems(cells, plannedCount) {
  const problems = []
  if (cells.length !== plannedCount) problems.push(`夾具那一段該量 ${plannedCount} 格,量到 ${cells.length} 格`)
  const positive = cells.filter((c) => ['M1', 'N', 'U3'].includes(c.cell) && c.ok)
  if (positive.length && positive.every((c) => !c.calls)) problems.push('需要置中的正向格全部「位置對了卻一次 scrollTo 都沒記到」—— 產品換了捲動的方式(不再走 scrollTo),揭露探針讀不到,閘要改')
  return problems
}

// ── 夾具:開一排 ───────────────────────────────────────────────────────────────
async function openFixtureStrip(page, fixture, strip, run) {
  const tag = run.sabotage ? `(破法 ${run.sabotage})` : ''
  const failWith = (reason) => new Instrument({ storyId: `夾具 ${strip.key}`, kind: 'dom-not-settled', reason: `夾具 ${strip.label}${tag} ${reason}` })
  const sync = revealSync(page, strip, failWith)
  const url = `${fixture.url}?strip=${strip.key}&count=${REVEAL_FIXTURE_ITEMS}&selected=${run.selected}${run.sabotage ? `&revealSabotage=${encodeURIComponent(run.sabotage)}` : ''}`
  await page.setViewportSize(strip.viewport)
  await page.mouse.move(1, 1)
  await openStory(page, url, { waitFor: strip.open ? '#open' : '[data-overflow-scroller]', settleFrames: 10, notFound: fixture.notFound, label: `夾具 ${strip.key}` })
  if (strip.open) {
    await page.click('#open')
    await page.waitForSelector(`[data-overflow-scroller] ${strip.item}`, { state: 'visible' })
  }
  await page.waitForSelector(`[data-overflow-scroller] ${strip.item}`, { state: 'attached' })
  await sync.arm('掛載')
  return { sync, failWith, tag }
}

// ── 夾具:一排一趟(M1 / M2 → N → U1 → U3 → U2,依 fixturePlan)────────────────────────
async function fixtureStripRun(page, fixture, strip, run) {
  const plan = fixturePlan(strip, run)
  const { sync, failWith, tag } = await openFixtureStrip(page, fixture, strip, run)
  const cells = []
  const states = () => page.evaluate(itemStatesInPage, [strip.scroller, strip.item, strip.attr, strip.on])
  const measure = async (index, cell) => {
    const g = await page.evaluate(measureInPage, [strip.scroller, strip.item, index])
    if (!g) throw failWith(`${cell}:量不到第 ${index + 1} 項`)
    const obstruction = maskObstruction(g.mask, g.width)
    if (obstruction.unparsed) throw failWith(`${cell}:讀不懂遮罩 ${g.mask}`)
    const where = `夾具 ${strip.label}${tag} × ${cell} ${FIXTURE_CELLS[cell].name}「${g.label}」`
    return { g, where, res: judge({ ...g, obstruction }, where) }
  }
  const expectGeometry = (g, want, where) => {
    const geo = fixtureGeometry(g, want)
    if (!geo.ok) throw failWith(`${where}:幾何不成立 —— ${geo.why}`)
  }
  const push = (cell, verdict, calls) => cells.push({ strip: strip.key, cell, calls, ...verdict })
  const quiet = async (what) => {
    const q = await page.evaluate(awaitScrollQuietInPage, [strip.scroller, REVEAL_ARRIVE_CAP_MS])
    if (!q?.ok) throw failWith(`${what}:上一段捲動等不到 scrollend`)
  }
  // 容器變窄 REVEAL_SHRINK_PX(Tabs / Chip 改外框寬,縮圖列改視窗寬)→ 等產品決定 → 回 { s(變窄之後的狀態), calls(這一步產品呼叫幾次) }
  const shrink = async (what) => {
    const m = await sync.markOf(what)
    const w0 = (await page.evaluate(scrollerBoxInPage, strip.scroller)).width
    if (strip.open) {
      const v = page.viewportSize()
      await page.setViewportSize({ width: v.width - REVEAL_SHRINK_PX, height: v.height })
    } else if ((await page.evaluate(shrinkBoxInPage, REVEAL_SHRINK_PX)) === null) throw failWith(`${what}:夾具沒有 #box`)
    const w1 = (await page.evaluate(scrollerBoxInPage, strip.scroller)).width
    if (w0 - w1 < RESIZE_MIN_DELTA_PX) throw failWith(`${what}:捲動容器只變窄 ${w0 - w1}px(< ${RESIZE_MIN_DELTA_PX})`)
    await sync.awaitReveal(m, ['resize'], what)
    const s = await sync.settleEdges(m.calls, what)
    return { s, calls: s.calls - m.calls }
  }
  // 使用者自己捲(act = 滾輪或按箭頭)→ 等捲動停 → 回停下的 scrollLeft。訊號沒送到 / 沒捲 / 等不到 scrollend / 捲不到 USER_SCROLL_MIN_PX = 儀器失效
  const userScroll = async (what, act) => {
    await quiet(`${what}之前`)
    const m = await sync.markOf(what)
    const from = (await page.evaluate(scrollerBoxInPage, strip.scroller)).scrollLeft
    await act()
    const w = await page.evaluate(awaitUserScrollInPage, [strip.scroller, m, REVEAL_ARRIVE_CAP_MS])
    await page.mouse.move(1, 1)
    if (!w?.ok) throw failWith(`${what}:${w?.why === 'no-scroll' ? `這一排沒有任何 scroll 事件(使用者捲動訊號送到 ${w?.signals ?? 0} 次)—— 這台機器的${what}沒有捲這一排` : '捲了,但等不到 scrollend'}`)
    if (!(w.signals >= 1)) throw failWith(`${what}:捲動發生了,但「使用者自己捲」的訊號(wheel / 箭頭翻頁事件)一次都沒送到這一排 —— 產品無從知道是使用者捲的,這一格不能算到產品頭上`)
    const s = await sync.settleEdges(m.calls, what)
    if (Math.abs(s.scrollLeft - from) < USER_SCROLL_MIN_PX) throw failWith(`${what}:只捲了 ${Math.abs(s.scrollLeft - from).toFixed(1)}px(< ${USER_SCROLL_MIN_PX}),「捲過」沒有真的發生`)
    return { before: s.scrollLeft, scrollEvents: w.scrolls }
  }
  // 捲過之後容器變窄 → 判搶回了沒。scrollEvents = 使用者那一下捲動發了幾個 scroll 事件(1 = 瞬間;多個 = 有動畫,例:Linux 的滾輪)只記錄、不判
  const held = async (cell, anchorIndex, user, what) => {
    const { s, calls } = await shrink(what)
    const { where, res } = await measure(anchorIndex, cell)
    const v = judgeHeld({ before: user.before, after: s.scrollLeft, calls, anchorOffset: res.offset }, where)
    if (v.kind === 'instrument') throw failWith(v.text)
    push(cell, { ...v, scrollEvents: user.scrollEvents }, calls)
  }
  // 收尾:記下這一頁破法實際打到幾次(selftest 用:打到 0 次 = 破法不成立)
  const finish = async () => {
    const hits = await page.evaluate(() => window.__revealProbe?.sabotageHits ?? null)
    for (const c of cells) c.sabotageHits = hits
    return cells
  }

  // M1 / M2:掛載那一次(不歸零)。這一排到目前為止產品對它的呼叫全算(掛載那次在我們掛監聽之前)
  {
    const cell = plan[0]
    const { g, where, res } = await measure(run.selected, cell)
    expectGeometry(g, cell === 'M2' ? 'clamped-end' : 'centered', where)
    const calls = (await sync.markOf(cell)).calls
    push(cell, judgeFixtureCell(cell, res, `產品到目前為止呼叫 scrollTo ${calls} 次`), calls)
  }
  if (plan.length === 1) return finish()

  // N:新出現的已選項目 —— 插在目前這一項後面、同一次狀態更新就是選中
  const anchorN = run.selected + 1
  {
    const before = await states()
    const m = await sync.markOf('新增一項')
    if (strip.open) {
      if (!(await page.evaluate(() => { const f = window.__overflowRevealFixture; if (!f) return false; f.addAfterCurrent(); return true }))) throw failWith('N:夾具沒有掛出 window.__overflowRevealFixture.addAfterCurrent')
    } else {
      if (!(await page.$('#add'))) throw failWith('N:找不到新增鈕 #add')
      await page.click('#add')
      await page.mouse.move(1, 1)
    }
    const r = await sync.awaitReveal(m, ['mutation'], '新增一項')
    const s = await sync.settleEdges(m.calls, '新增一項')
    const after = await states()
    if (!before || !after || after.count !== before.count + 1 || !after.selected.includes(anchorN)) {
      throw failWith(`N:新增之後項目數 ${before?.count} → ${after?.count}、選中的是第 ${(after?.selected ?? []).map((i) => i + 1).join(' / ') || '(無)'} 項 —— 動作沒有造成要量的狀態(應多 1 項、第 ${anchorN + 1} 項選中)`)
    }
    const { g, where, res } = await measure(anchorN, 'N')
    expectGeometry(g, 'centered', where)
    const calls = s.calls - m.calls
    // 紅的時候講得出是哪一種(審查第 11 條 (1)):0 次 = 新項目沒有被揭露;有呼叫但要求的就是目前位置 = 捲去的是舊的那一個(剛被取消的那一項);
    // 有呼叫而且要求的是別的位置,位置卻沒到 = 呼叫沒生效
    const note = calls === 0 ? '產品這一步 0 次 scrollTo —— 新項目沒有被揭露'
      : r.moved ? `產品這一步呼叫 scrollTo ${calls} 次、要求捲到別的位置,但新項目沒有置中 —— 呼叫沒有生效`
        : `產品這一步呼叫 scrollTo ${calls} 次,但要求的就是目前的位置 —— 捲去的是舊的那一個(剛被取消的那一項),不是新項目`
    push('N', judgeFixtureCell('N', res, note), calls)
  }

  // U1:滾輪捲過 → 容器變窄 → 不搶回(上一次揭露的 = N 的新項目)
  if (plan.includes('U1')) {
    const box = await page.evaluate(scrollerBoxInPage, strip.scroller)
    const user = await userScroll('滾輪', async () => {
      await page.mouse.move(box.x, box.y)
      await page.mouse.wheel(-REVEAL_WHEEL_DELTA_PX, 0)
    })
    await held('U1', anchorN, user, '滾輪之後容器變窄')
  }

  // U3:再選一項 → 容器變窄 → 照樣置中(每次揭露把「捲過」歸零)
  let anchorU3 = null
  {
    const box = await page.evaluate(scrollerBoxInPage, strip.scroller)
    const candidates = await page.evaluate(reselectCandidatesInPage, [strip.scroller, strip.item, strip.attr, strip.on])
    const pick = pickReselect(candidates, { width: box.width, content: box.maxScroll + box.width })
    if (!pick) throw failWith(`U3:找不到「沒選中、點得到、變窄之後置中不會夾到端點」的項目(可視寬 ${box.width}px)`)
    anchorU3 = pick.i
    const m = await sync.markOf('再選一項')
    await page.mouse.click(pick.hit.x, pick.hit.y)
    await sync.awaitReveal(m, ['mutation'], '再選一項')
    await page.mouse.move(1, 1)
    await sync.settleEdges(m.calls, '再選一項')
    const st = await states()
    if (!st?.selected.includes(pick.i)) throw failWith(`U3:點了第 ${pick.i + 1} 項之後它沒有變成選中 —— 動作沒有造成要量的狀態`)
    const { s } = await shrink('再選一項之後容器變窄')
    const { g, where, res } = await measure(pick.i, 'U3')
    expectGeometry(g, 'centered', where)
    push('U3', judgeFixtureCell('U3', res), s.calls - m.calls)
  }

  // U2:按箭頭翻頁 → 容器變窄 → 不搶回(上一次揭露的 = U3 選的那一項)。挑離端點比較遠的那一邊
  if (plan.includes('U2')) {
    const box = await page.evaluate(scrollerBoxInPage, strip.scroller)
    const dir = box.scrollLeft > box.maxScroll / 2 ? 'left' : 'right'
    const arrow = page.locator(`[data-overflow-arrow="${dir}"] button`).first()
    if (await arrow.count() === 0) throw failWith(`U2:找不到「${dir === 'left' ? '向左' : '向右'}」那一邊的箭頭(scrollLeft ${box.scrollLeft} / 最大 ${box.maxScroll})`)
    const user = await userScroll('按箭頭翻頁', () => arrow.click())
    await held('U2', anchorU3, user, '箭頭翻頁之後容器變窄')
  }
  return finish()
}

// ── 夾具:「觸發晚到」兩面(selftest)—— 第 LATE_TRIGGER_FRAME 個影格才按「複製目前檢視」────────────────
// 舊判準(scrollLeft 連續 LEGACY_STILL_FRAMES 格不變)回來的時候觸發還沒發生(項目數還是原本的)= 它沒等到、會量早;
// 新判準(等觸發送達)回來的時候項目數多 1,新項目那一格綠。兩面缺一 → selftest 失敗。
async function lateTriggerControl(page, fixture) {
  const strip = FIXTURE_STRIPS.find((s) => s.key === 'tabs-scroll')
  const run = { sabotage: '', selected: REVEAL_FIXTURE_MID, flow: 'full' }
  const target = REVEAL_FIXTURE_MID + 1
  // 舊判準那一面:排點擊與起舊判準在同一次頁面函式裡(plan 第一節第 4 點)
  const legacySide = await openFixtureStrip(page, fixture, strip, run)
  const legacy = await evalWith(page, legacyStillFramesInPage, [strip.scroller, strip.item, LEGACY_STILL_FRAMES, REVEAL_ARRIVE_CAP_MS, LATE_TRIGGER_FRAME, target], measureInPage)
  if (!legacy?.ok || !legacy.g) throw legacySide.failWith(`觸發晚到(舊判準):${legacy?.why === 'missing' ? '找不到捲動容器或 #add' : '舊判準在上限內沒有回來'}`)
  const legacyCell = judgeFixtureCell('N', judge({ ...legacy.g, obstruction: maskObstruction(legacy.g.mask, legacy.g.width) }, `舊判準回來的那一格「${legacy.g.label}」`))
  // 新判準那一面:快照 → 排第 LATE_TRIGGER_FRAME 格才點 → 等觸發送達(兩次呼叫之間隔多久都不影響:快照在排之前)
  const { sync, failWith } = await openFixtureStrip(page, fixture, strip, run)
  const itemsBefore = (await page.evaluate(itemStatesInPage, [strip.scroller, strip.item, strip.attr, strip.on]))?.count
  const m = await sync.markOf('觸發晚到')
  if (!(await page.evaluate(scheduleClickAtFrameInPage, ['#add', LATE_TRIGGER_FRAME]))) throw failWith('觸發晚到(新判準):找不到 #add')
  await sync.awaitReveal(m, ['mutation'], '觸發晚到(新判準)')
  const itemsWhenReturned = (await page.evaluate(itemStatesInPage, [strip.scroller, strip.item, strip.attr, strip.on]))?.count
  await sync.settleEdges(m.calls, '觸發晚到(新判準)')
  const g = await page.evaluate(measureInPage, [strip.scroller, strip.item, target])
  if (!g) throw failWith(`觸發晚到(新判準):量不到第 ${target + 1} 項`)
  const freshCell = judgeFixtureCell('N', judge({ ...g, obstruction: maskObstruction(g.mask, g.width) }, `新判準回來的那一格「${g.label}」`))
  return {
    legacy: { frame: legacy.frame, itemsAtStart: legacy.itemsAtStart, itemsWhenReturned: legacy.itemsWhenReturned, cell: legacyCell },
    fresh: { itemsBefore, itemsWhenReturned, cell: freshCell },
  }
}

// ── 夾具:整段(一個瀏覽器、夾具只打包一次)──────────────────────────────────────────
// export 只給工程比對用(例:單獨跑一種破法、把每一格的訊息全部印出來看);閘自己的主跑與 --selftest 都從本檔呼叫
export async function scanFixture(staticDir, { runs = FIXTURE_MAIN_RUNS, lateTrigger = false } = {}) {
  const fixture = await startStorybookCssFixture(staticDir, { source: FIXTURE_SOURCE, label: '選到就露出來夾具', title: '選到就露出來夾具' })
  const browser = await launchBrowserOrSkip({}, { cleanup: () => fixture.stop() })
  const out = { runs: [], late: null }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.addInitScript(installRevealProbeInPage)
    for (const run of runs) {
      const cells = []
      for (const strip of FIXTURE_STRIPS) cells.push(...(await fixtureStripRun(page, fixture, strip, run)))
      out.runs.push({ run, cells, planned: plannedFixtureKeys([run]) })
    }
    if (lateTrigger) out.late = await lateTriggerControl(page, fixture)
  } finally { await browser.close(); await fixture.stop() }
  return out
}

// ── selftest ───────────────────────────────────────────────────────────────
async function selftest() {
  let ok = true
  const check = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) ok = false }
  const G = (o) => ({ left: 100, right: 160, width: 260, scrollLeft: 50, maxScroll: 300, obstruction: { left: 48, right: 48 }, arrowOverlap: false, ...o })
  // 判定表
  check(judge(G({})).ok && judge(G({})).how === 'centered', '判定表:中心正好在容器中心 → 綠(centered)')
  check(judge(G({ left: 101.5, right: 161.5 })).ok, '判定表:偏 1.5px(容差內)→ 綠')
  check(judge(G({ left: 103, right: 163 })).kind === 'off-center', '判定表:偏 3px、不在兩端 → off-center')
  check(judge(G({ left: 10, right: 70, scrollLeft: 0, obstruction: { left: 0, right: 48 } })).how === 'clamped-start', '判定表:在起點(scrollLeft 0)、項目在左半邊、完整可讀 → 合法夾住')
  check(judge(G({ left: 190, right: 250, scrollLeft: 300, obstruction: { left: 48, right: 0 } })).how === 'clamped-end', '判定表:在終點、項目在右半邊 → 合法夾住')
  check(judge(G({ left: 190, right: 250, scrollLeft: 120 })).kind === 'unreadable', '判定表:右側淡出區裡(修前 Tabs 方向鍵:落在箭頭 + 淡出底下)→ unreadable')
  check(judge(G({ arrowOverlap: true })).kind === 'unreadable', '判定表:被箭頭蓋住 → unreadable')
  check(judge(G({ left: 190, right: 250, scrollLeft: 0, obstruction: { left: 0, right: 0 } })).kind === 'off-center', '判定表:在起點但項目在右半邊(本來就該往右捲)→ 不算夾住、off-center')
  // 遮罩解析
  const M = (s) => maskObstruction(s, 300)
  check(JSON.stringify(M('linear-gradient(to right, transparent 0, transparent 32px, black 48px, black calc(100% - 48px), transparent calc(100% - 32px), transparent 100%)')) === JSON.stringify({ left: 48, right: 48 }), '遮罩:scroll 模式兩側 32 + 16 → 48 / 48')
  check(JSON.stringify(M('linear-gradient(to right, black 0, black calc(100% - 16px), transparent 100%)')) === JSON.stringify({ left: 0, right: 16 }), '遮罩:menu 模式在起點 → 0 / 16')
  check(JSON.stringify(M('linear-gradient(to right, rgba(0, 0, 0, 0) 0px, rgb(0, 0, 0) 16px, rgb(0, 0, 0) calc(100% - 16px), rgba(0, 0, 0, 0) 100%)')) === JSON.stringify({ left: 16, right: 16 }), '遮罩:瀏覽器序列化成 rgb / rgba 也認得')
  check(JSON.stringify(M('none')) === JSON.stringify({ left: 0, right: 0 }), '遮罩:沒有遮罩 → 0 / 0')
  check(M('linear-gradient(to right, red, blue)').unparsed === true, '遮罩:讀不懂的形狀 → unparsed(呼叫端當儀器失效)')
  // 揭露探針:「產品要求的位置到了沒」(同一段原始碼也送進頁面)
  check(!revealArrived({ scrollLeft: 399, max: 712, left: 400 }), '到位:要求 400、目前 399 → 還沒到')
  check(revealArrived({ scrollLeft: 233, max: 712, left: 233.00003 }), '到位:要求 233.00003(檢視器進場縮放換算出來的值)、目前 233 → 到了')
  check(revealArrived({ scrollLeft: 712, max: 712, left: 900 }) && revealArrived({ scrollLeft: 0, max: 712, left: -40 }), '到位:要求超出範圍(900 / −40)→ 夾在 0..最大之後比(瀏覽器也是這樣夾)')
  check(!revealArrived({ scrollLeft: 0, max: 712, left: 1.5 }) && revealArrived({ scrollLeft: 0.5, max: 712, left: 1.4 }), '到位:差 1.5 還沒到、差 0.9 到了(門檻 < 1px)')
  // 揭露探針:「遮罩 / 箭頭 / ⌄ 跟上捲動位置了沒」
  const scrollMask = { start: 'linear-gradient(to right, black 0, black calc(100% - 48px), transparent calc(100% - 32px), transparent 100%)', both: 'linear-gradient(to right, transparent 0, transparent 32px, black 48px, black calc(100% - 48px), transparent calc(100% - 32px), transparent 100%)' }
  const E = (o) => ({ scrollLeft: 0, maxScroll: 300, width: 260, mask: scrollMask.start, arrows: { left: false, right: true }, menu: null, calls: 1, lastLeft: null, swallow: false, resize: 1, ...o })
  check(edgesConsistent(E({}), { arrows: true }).ok, '跟上:在起點、右側淡出 + 右箭頭 → 一致')
  check(!edgesConsistent(E({ scrollLeft: 50 }), { arrows: true }).ok, '跟上:捲到 50 但遮罩 / 箭頭還是起點的樣子(React 還沒重畫)→ 還沒跟上')
  check(edgesConsistent(E({ scrollLeft: 50, mask: scrollMask.both, arrows: { left: true, right: true } }), { arrows: true }).ok, '跟上:捲到中段、兩側淡出 + 兩個箭頭 → 一致')
  check(!edgesConsistent(E({ scrollLeft: 50, mask: scrollMask.both, arrows: { left: false, right: true } }), { arrows: true }).ok && edgesConsistent(E({ scrollLeft: 50, mask: scrollMask.both, arrows: { left: false, right: true } }), { arrows: false }).ok, '跟上:左箭頭還沒出現 → 有箭頭的排還沒跟上;沒有箭頭的排不看箭頭')
  check(edgesConsistent(E({ maxScroll: 0, mask: 'none', arrows: { left: false, right: false }, menu: false }), { arrows: true }).ok && !edgesConsistent(E({ maxScroll: 0, mask: 'none', menu: true }), {}).ok, '跟上:不可捲 → 沒有遮罩、沒有 ⌄ 才一致(⌄ 還在 = 還沒跟上)')
  check(!edgesConsistent(E({ lastLeft: 40 }), { arrows: true }).ok && edgesConsistent(E({ lastLeft: 40, swallow: true }), { arrows: true }).ok, '跟上:產品要求捲到 40 還沒到 → 還沒跟上;吞掉 scrollTo 的對照組不等位置')
  check(!edgesConsistent(E({ mask: 'linear-gradient(to right, red, blue)' }), {}).ok, '跟上:讀不懂遮罩 → 不算跟上(等到上限 = 儀器失效,不是綠)')
  check(/動作沒有造成預期的觸發/.test(explainRevealWait({ why: 'no-trigger' }, ['resize'])) && /上限內沒有到/.test(explainRevealWait({ why: 'not-arrived', target: 400, max: 712, scrollLeft: 120 }, ['mutation'])) && /等不到 scrollend/.test(explainRevealWait({ why: 'no-scrollend', target: 400 }, ['mutation'])),
    '揭露探針沒等到的三種原因各有人話(觸發沒送達 / 位置沒到 / 等不到 scrollend)')
  // 幾何夠不夠驗(overflowPlan):L(右緣陣列, 可視寬) 造一排等寬 40、間距 8 的項目
  const L = (n, scW, w = 40, gap = 8) => Array.from({ length: n }, (_, i) => ({ left: i * (w + gap), right: i * (w + gap) + w, scW }))
  check(overflowPlan(L(8, 200)).enough === true, '幾何:8 項、可視寬 200(第 5 項被切)→ 夠,照天然排版量')
  check(overflowPlan(L(8, 400)).enough === false && overflowPlan(L(8, 400)).target === 164, '幾何:整排 376px 塞得進 400(CI 沒有中文字型的 Tabs)→ 不夠,可視寬改成 164(第 4 項的中心:它剛好被切一半)')
  check(overflowPlan(L(8, 372)).enough === false && overflowPlan(L(8, 372)).target === 164, '幾何:只切到最後一項 → 不夠(最後一項被選時本來就夾在終點,驗不到置中),一樣改成 164')
  check(overflowPlan(L(8, 371)).enough === false && overflowPlan(L(8, 345)).enough === false && overflowPlan(L(8, 343)).enough === true, '幾何:邊界 —— 倒數第二項右緣 328,可視寬 345(328 > 345−16 不成立)不夠、343 夠')
  check(overflowPlan(L(4, 1000, 120)).target === 224, '幾何:4 項 × 120px → 中間那一項的中心 188 不夠寬,下限 = 最寬的項目 120 + 兩側遮擋 96 + 8 = 224')
  check(overflowPlan(L(3, 400, 100)).target === 204, '幾何:3 項 × 100px → 下限 204 ≤ 上限(倒數第二項右緣 208 + 8)→ 204')
  check(overflowPlan(L(3, 400, 60)).target === null && /太短/.test(overflowPlan(L(3, 400, 60)).why), '幾何:3 項 × 60px(下限 164 > 上限 136)→ 切不出來,原因講明')
  check(overflowPlan(L(2, 400)).target === null && overflowPlan([]).target === null, '幾何:只有 2 項 / 量不到項目 → 切不出來(呼叫端當儀器失效)')
  check(overflowPlan(L(8, 400)).anchor === 2 && overflowPlan(L(4, 1000, 120)).anchor === 1, '幾何:回傳預計會被滑鼠點到的那一項(8 項切在 164 → 第 3 項;4 項切在 224 → 第 2 項)')
  const runner = overflowPlan(L(8, 400, 32, 0))
  check(runner.target === 147 && runner.anchor === 3, `幾何:c55c3786 在 CI runner 的排版(8 項 × 32px、沒有間距)→ 不再切在 136(點到第 3 項、縮放只能夾在起點),改切 147、點到第 4 項(實得 ${runner.target} / 第 ${runner.anchor == null ? '?' : runner.anchor + 1} 項)`)
  const stuck = overflowPlan([{ left: 0, right: 100, scW: 400 }, { left: 108, right: 208, scW: 400 }, { left: 216, right: 236, scW: 400 }])
  check(stuck.target === 204 && stuck.anchor === null, '幾何:切得出寬度、但預計點到的那一項置中會夾在終點(最後一項太短)→ anchor null(呼叫端縮放那一格判儀器失效,不當綠燈)')
  const anchorHolds = (list) => {
    const plan = overflowPlan(list)
    if (plan.target == null || plan.anchor == null) return false
    const it = list[plan.anchor]
    const c = (it.left + it.right) / 2
    const content = list[list.length - 1].right
    return [plan.target - 1, plan.target, plan.target + 1].every((W) => {
      const want = c - W / 2
      return want > CENTER_TOLERANCE_PX && want <= content - W - CENTER_TOLERANCE_PX && resizePlan({ width: W, itemWidth: it.right - it.left, itemCentre: c, content }) !== null
    })
  }
  check([L(8, 400), L(8, 372), L(4, 1000, 120), L(3, 400, 100), L(8, 400, 32, 0)].every(anchorHolds), '幾何:回傳的寬度(實得 ±1px)下,預計點到的那一項置中不會夾在兩端、縮放也切得出寬度')
  // 置中範圍(centringWindow):範圍裡的寬度,「沒捲」與「捲到中心」一定是不同的判定(對照組才紅得起來)
  const windowHolds = (g) => {
    const win = centringWindow(g)
    if (!win) return false
    const half = g.itemWidth / 2
    return [win.lo, Math.round((win.lo + win.hi) / 2), win.hi].every((W) => {
      const base = { width: W, maxScroll: g.content - W, arrowOverlap: false }
      const unscrolled = judge({ ...base, left: g.itemCentre - half, right: g.itemCentre + half, scrollLeft: 0, obstruction: { left: 0, right: 0 } })
      const scrolled = judge({ ...base, left: W / 2 - half, right: W / 2 + half, scrollLeft: g.itemCentre - W / 2, obstruction: { left: WIDEST_OBSTRUCTION_PX, right: WIDEST_OBSTRUCTION_PX } })
      return unscrolled.ok === false && scrolled.ok === true && scrolled.how === 'centered'
    })
  }
  check([{ itemWidth: 70, itemCentre: 300, content: 520 }, { itemWidth: 62, itemCentre: 116, content: 420 }, { itemWidth: 32, itemCentre: 112, content: 256 }].every(windowHolds), '置中範圍:範圍兩端與中間的寬度 —— 沒捲(scrollLeft 0)一定判紅、捲到中心一定判 centered 且完整可讀')
  check(centringWindow({ itemWidth: 62, itemCentre: 80, content: 420 }) === null, '置中範圍:那一項太靠起點(中心 80、至少要 166px 可視寬)→ 沒有這樣的寬度')
  // 縮放退路的寬度(resizePlan):只回「改完之後那一項仍然置中、不是夾在端點」的寬度,沒有就 null
  check(resizePlan({ width: 286, itemWidth: 70, itemCentre: 300, content: 520 })?.width === 222, '縮放寬度:天然排版(可視寬 286)→ 縮 64 到 222,那一項仍需置中')
  check(resizePlan({ width: 174, itemWidth: 62, itemCentre: 116, content: 420 })?.width === 206, '縮放寬度:自備幾何 174 —— 縮 64 / 32 放不下那一項加遮擋、放寬 64 會夾在起點(116 − 119 < 0)→ 放寬 32 到 206(116 − 103 = 13,在中心)')
  check(resizePlan({ width: 174, itemWidth: 62, itemCentre: 80, content: 420 }) === null, '縮放寬度:那一項太靠起點、怎麼改都夾在起點 → null(2026-11-12 之前退而回 238 並標「不是置中」—— 那一格對有沒有捲沒有鑑別力)')
  check(resizePlan({ width: 120, itemWidth: 200, itemCentre: 300, content: 900 })?.width === 304, '縮放寬度:縮 / 放寬 64、32 都放不下那一項加遮擋 → 取範圍裡離現在最近的端點 304')
  check(resizePlan({ width: 120, itemWidth: 200, itemCentre: 110, content: 900 }) === null, '縮放寬度:放得下的寬度都會夾在起點 → null')
  check(resizePlan({ width: 136, itemWidth: 32, itemCentre: 80, content: 256 }) === null, '縮放寬度:c55c3786 在 CI runner 的幾何(自備幾何 136、點到第 3 項、中心 80)→ null(範圍 136..144 裡沒有離現在 ≥ 16px 的寬度)')
  const cutAt = (list, w) => list.map((it) => ({ ...it, scW: w }))
  check([L(8, 400), L(8, 372), L(4, 1000, 120), L(3, 400, 100)].every((l) => overflowPlan(cutAt(l, overflowPlan(l).target)).enough === true), '幾何:照回傳的可視寬切完再問一次 → 都夠(回傳值自己滿足自己的條件)')
  check(instrumentProblems({ cells: 0, nonClamped: { click: 0, keys: 0, menu: 0, resize: 0 } }).length === 5, '儀器失效:零格 + 四種輸入都沒有置中量測 → 五條')
  check(instrumentProblems({ cells: 20, nonClamped: { click: 3, keys: 9, menu: 2, resize: 4 } }).length === 0, '儀器失效:四種輸入都有置中量測 → 不報')
  // 「需要置中」數的是幾何(沒被兩端夾住),不是結果:置中成功、偏離(紅)、在淡出區但沒被夾住(紅)都算;夾住的不算
  check(needsCentring(judge(G({}))) && needsCentring(judge(G({ left: 103, right: 163 }))) && needsCentring(judge(G({ left: 190, right: 250, scrollLeft: 120 })))
    && !needsCentring(judge(G({ left: 10, right: 70, scrollLeft: 0, obstruction: { left: 0, right: 48 } }))) && !needsCentring(judge(G({ left: 190, right: 250, scrollLeft: 300, obstruction: { left: 48, right: 0 } }))),
  '需要置中的格:置中 / 偏離 3px(紅)/ 落在淡出區沒被夾住(紅)→ 算;起點夾住 / 終點夾住 → 不算(審查 A:偏離的格以前不算,產品算錯位置時地板歸零、被說成沒量到)')
  check(overflowRunVerdict({ bad: [1], floor: ['x'] }).exit === 1 && overflowRunVerdict({ bad: [1], floor: [] }).exit === 1
    && overflowRunVerdict({ bad: [], floor: ['x'] }).exit === 2 && overflowRunVerdict({ bad: [], floor: [] }).exit === 0,
  '結論先後:有產品紅 → 1(不論地板);沒有產品紅、地板沒過 → 2;都沒有 → 0')
  // 夾具那一段的純函式
  const perCell = (keys) => Object.keys(FIXTURE_CELLS).map((c) => `${c} ${keys.filter((k) => k.endsWith(`|${c}`)).length}`).join('、')
  const mainKeys = plannedFixtureKeys(FIXTURE_MAIN_RUNS)
  check(mainKeys.length === 28 && perCell(mainKeys) === 'M1 5、M2 5、N 5、U1 5、U2 3、U3 5', `夾具計畫:主跑 ${mainKeys.length} 格(${perCell(mainKeys)};U2 只有三排有箭頭)`)
  const H = (o) => judgeHeld({ before: 250, after: 250, calls: 0, anchorOffset: 166, ...o })
  check(H({}).ok === true && H({}).kind === 'held', '捲過不搶回:位置沒動、上次揭露的項目離中心 166px → 綠')
  check(H({ after: 251 }).ok === true && H({ after: 251.5, calls: 1 }).ok === false, '捲過不搶回:差 1px 算沒動、差 1.5px 算動了(產品有呼叫 → 紅)')
  check(H({ anchorOffset: 8 }).ok === true && H({ anchorOffset: -7.9 }).kind === 'instrument', '捲過不搶回:上次揭露的項目偏 8px 分得開、偏 7.9px 分不開(「沒搶回」與「搶回了」同一個樣子 → 儀器失效)')
  check(H({ after: 400, calls: 1 }).kind === 'grabbed-back' && H({ after: 400, calls: 1 }).text.includes('搶回'), '捲過不搶回:位置變了而且產品呼叫 scrollTo → 紅(搶回),訊息講出捲到哪、變成哪、呼叫幾次')
  check(H({ after: 400, calls: 0 }).kind === 'instrument', '捲過不搶回:位置變了但產品沒呼叫 → 儀器失效(使用者的捲動還沒停 / 瀏覽器夾回,不算到產品頭上)')
  const FG = (o) => ({ left: 128, right: 200, width: 328, scrollLeft: 232, maxScroll: 712, ...o })
  check(fixtureGeometry(FG({}), 'centered').ok && !fixtureGeometry(FG({ left: 20, right: 92, scrollLeft: 0 }), 'centered').ok, '夾具幾何:中間那一項置中不會夾住 → 成立;靠起點的那一項(中心 56)置中會夾在起點 → 不成立(儀器失效)')
  check(fixtureGeometry(FG({ left: 256, right: 328, scrollLeft: 712 }), 'clamped-end').ok && !fixtureGeometry(FG({ left: 132, right: 204, scrollLeft: 712 }), 'clamped-end').ok, '夾具幾何:最後一項置中超出終點 128px → 成立;只超出 4px(「夾住」與「置中」分不出來)→ 不成立')
  const RES = { ok: true, how: 'centered', offset: 0, text: 'x' }
  check(judgeFixtureCell('M1', RES).ok && !judgeFixtureCell('M2', RES).ok && judgeFixtureCell('M2', { ...RES, how: 'clamped-end' }).ok && !judgeFixtureCell('N', { ok: false, how: 'off-center', kind: 'off-center', offset: 72, text: 'y' }).ok,
    '夾具判定:M1 / N / U3 要置中、M2 要夾在終點(置中的 M2 也算紅);偏離 → 紅')
  const cand = (i, o) => ({ i, selected: false, centre: 300, width: 72, fromCentre: 40, hit: { x: 1, y: 1 }, ...o })
  const picked = pickReselect([cand(0, { selected: true, fromCentre: 0 }), cand(1, { hit: null, fromCentre: 1 }), cand(2, { centre: 60, fromCentre: 2 }), cand(3, { fromCentre: -30 }), cand(4, { fromCentre: 10 })], { width: 328, content: 1040 })
  check(picked?.i === 4 && pickReselect([cand(0, { selected: true }), cand(1, { centre: 60 })], { width: 328, content: 1040 }) === null, 'U3 挑項目:跳過已選中、點不到、變窄之後置中會夾住的,取離中心最近的(第 5 項);都不行 → null(儀器失效)')
  const ctl = [{ strip: 'tabs-scroll', cell: 'M1', ok: true, text: '' }, { strip: 'tabs-scroll', cell: 'N', ok: false, text: '' }]
  const ctlKeys = ['tabs-scroll|M1', 'tabs-scroll|N']
  check(compareFixtureControl('no-childlist', ctlKeys, ctl).length === 0
    && compareFixtureControl('no-childlist', ctlKeys, [ctl[0], { ...ctl[1], ok: true }]).length === 1
    && compareFixtureControl('no-childlist', ctlKeys, [{ ...ctl[0], ok: false }, ctl[1]]).length === 1
    && compareFixtureControl('no-childlist', ctlKeys, [ctl[0]]).length === 1
    && compareFixtureControl('no-childlist', ['tabs-scroll|M1'], ctl).length === 1,
    '破法比對:紅的集合 = 期望 → 不報;該紅沒紅 / 不該紅卻紅 / 少量一格 / 多量一格 → 各指出 1 處')
  check(fixtureInstrumentProblems([{ cell: 'M1', ok: true, calls: 1 }], 2).length === 1 && fixtureInstrumentProblems([{ cell: 'M1', ok: true, calls: 0 }, { cell: 'N', ok: true, calls: 0 }], 2).length === 1 && fixtureInstrumentProblems([{ cell: 'M1', ok: true, calls: 0 }, { cell: 'N', ok: true, calls: 1 }], 2).length === 0,
    '夾具儀器地板:格數對不上 → 報;正向格全部 0 次 scrollTo(產品換了捲動方式)→ 報;有一格記到 → 不報')
  // 經符號連結叫自己、給不存在的建置 → 必須真的跑(缺建置標記 + 結束碼 2);審查 A 2026-11-14 的 s01(只比字串時 0 行、exit 0)
  const link = missingBuildViaSymlinkControl(import.meta.url)
  check(link.ok, link.ok ? `對照組(${link.line})` : link.line)
  // 真建置
  requireStorybookBuild(path.join(STATIC, 'index.json'))
  requireFreshStorybookBuild(STATIC, SOURCES)
  const clean = await scanBuild(STATIC, { fresh: false, log: () => {} })
  if (clean === null) return ok
  check(clean.cells.every((c) => c.ok) && instrumentProblems(clean.totals).length === 0, `現況:${clean.cells.length} 格全綠、四種輸入都有置中量測`)
  // 對照組:每種輸入動作前一刻拿掉 primitive 的作用 → 每一排每種輸入都要紅
  const broken = await scanBuild(STATIC, { fresh: false, neutralize: 'before-action', log: () => {} })
  const want = STRIPS.flatMap((s) => INPUTS.filter((i) => i !== 'menu' || s.menu).map((i) => `${s.key}|${i}`))
  const red = new Set(broken.cells.filter((c) => !c.ok).map((c) => `${c.strip}|${c.input}`))
  const missed = want.filter((k) => !red.has(k))
  check(missed.length === 0, `對照組(拿掉 primitive 呼叫):${want.length} 個「排 × 輸入」應紅,${want.length - missed.length} 個紅${missed.length ? `(沒紅:${missed.join(', ')})` : ''}`)
  // 對照組(幾何不靠字型):把可視寬撐成 CI 沒有中文字型時的兩種樣子,自備幾何關 / 開各跑一次
  const quiet = { fresh: false, log: () => {} }
  const instrumentRed = async (opts) => { try { await scanBuild(STATIC, { ...quiet, ...opts }); return null } catch (e) { if (e instanceof StoryRenderInstrumentError) return e.message; throw e } }
  const redMenu = await instrumentRed({ only: ['tabs-menu'], inputs: ['menu'], starve: 'last-only', selfCut: false })
  check(redMenu !== null && redMenu.includes('找不到沒有完整可讀的項目'), `對照組(只切到最後一項、自備幾何關):Tabs menu 的選單那步重現 9126e95b 在 CI 的紅${redMenu ? '' : '(沒紅)'}`)
  const redClick = await instrumentRed({ only: ['tabs-scroll'], inputs: ['click'], starve: 'fit', selfCut: false })
  check(redClick !== null && redClick.includes('找不到右側沒有完整可讀'), `對照組(整排塞得下、自備幾何關):Tabs scroll 的點擊找不到半露的項目 → 儀器失效${redClick ? '' : '(沒紅)'}`)
  const lastOnly = await scanBuild(STATIC, { ...quiet, only: ['chip-menu', 'tabs-menu'], inputs: ['menu'], starve: 'last-only' })
  const partial = lastOnly.cells.filter((c) => c.step.includes('第一個'))
  check(lastOnly.cells.length === 4 && lastOnly.cells.every((c) => c.ok) && partial.length === 2 && partial.every((c) => c.how === 'centered') && lastOnly.selfCuts.length === 2,
    `對照組(只切到最後一項、自備幾何開):Chip menu / Tabs menu 的選單 4 格都量到、全綠,兩格「第一個沒有完整可讀的項目」在中心(實得 ${lastOnly.cells.map((c) => `${c.strip}:${c.how}${c.ok ? '' : '✗'}`).join(' ')};自備幾何 ${lastOnly.selfCuts.length} 排)`)
  const fit = await scanBuild(STATIC, { ...quiet, only: ['tabs-scroll', 'tabs-menu'], starve: 'fit' })
  const fitBad = fit.cells.filter((c) => !c.ok)
  const fitGaps = INPUTS.filter((i) => !fit.totals.nonClamped[i])
  check(fitBad.length === 0 && fitGaps.length === 0 && fit.selfCuts.length === 2,
    `對照組(整排塞得下、自備幾何開):Tabs scroll / Tabs menu ${fit.cells.length} 格全綠,四種輸入都有「需要置中」的格子(${INPUTS.map((i) => `${i} ${fit.totals.nonClamped[i]}`).join('、')})${fitBad.length ? `;紅:${fitBad.map((c) => c.text).join(' / ')}` : ''}${fitGaps.length ? `;沒有置中量測:${fitGaps.join('、')}` : ''}`)
  // 同一個幾何再拿掉 primitive:Tabs 兩排每種輸入都要紅(c55c3786 在 CI runner 上 tabs-scroll|resize、tabs-menu|resize 沒紅 —— runner 的天然排版就是「整排塞得下」)
  const fitBroken = await scanBuild(STATIC, { ...quiet, only: ['tabs-scroll', 'tabs-menu'], starve: 'fit', neutralize: 'before-action' })
  const fitWant = STRIPS.filter((s) => s.key === 'tabs-scroll' || s.key === 'tabs-menu').flatMap((s) => INPUTS.filter((i) => i !== 'menu' || s.menu).map((i) => `${s.key}|${i}`))
  const fitRed = new Set(fitBroken.cells.filter((c) => !c.ok).map((c) => `${c.strip}|${c.input}`))
  const fitMissed = fitWant.filter((k) => !fitRed.has(k))
  check(fitMissed.length === 0, `對照組(整排塞得下、自備幾何開、拿掉 primitive 呼叫):Tabs 兩排 ${fitWant.length} 個「排 × 輸入」應紅,${fitWant.length - fitMissed.length} 個紅${fitMissed.length ? `(沒紅:${fitMissed.join(', ')})` : ''}`)
  // 對照組 bias(審查 A 2026-11-14 的 b05):產品照常呼叫、也真的捲到它要求的位置,只是位置整體少 REVEAL_BIAS_PX ——
  // 「量到了而且錯」:四種輸入都要有紅、紅的都是 off-center / unreadable;儀器地板必須認得這些格是「需要置中」的量測(0 條),
  // 結論必須是產品紅(結束碼 1),不是儀器失效。Chip menu 一排就有四種輸入。
  // 另一面:舊數法(只數「判成 centered 而且 ok」)在同一組結果上必須至少漏掉一種輸入 —— 證明這一組分得出新舊數法(把 needsCentring 改回去,這一格會紅)
  const biased = await scanBuild(STATIC, { ...quiet, only: ['chip-menu'], neutralize: 'bias' })
  const biasRed = biased.cells.filter((c) => !c.ok)
  const biasFloor = instrumentProblems(biased.totals)
  const biasVerdict = overflowRunVerdict({ bad: biasRed, floor: biasFloor })
  const biasRedInputs = INPUTS.filter((i) => biasRed.some((c) => c.input === i))
  const biasKinds = [...new Set(biasRed.map((c) => c.kind))]
  const oldFloorGaps = INPUTS.filter((i) => !biased.cells.some((c) => c.input === i && c.how === 'centered' && c.ok))
  check(biasVerdict.exit === 1 && biasFloor.length === 0 && biasRedInputs.length === INPUTS.length && biasKinds.every((k) => k === 'off-center' || k === 'unreadable') && oldFloorGaps.length > 0,
    `對照組(產品要求的位置整體少 ${REVEAL_BIAS_PX}px、照常捲到位):Chip menu ${biased.cells.length} 格裡 ${biasRed.length} 格紅(${biasKinds.join(' / ') || '無'};有紅的輸入 ${biasRedInputs.join('、') || '無'}),`
    + `結論 = ${biasVerdict.kind === 'product' ? '產品紅' : biasVerdict.kind === 'instrument' ? '儀器失效' : '綠'}、結束碼 ${biasVerdict.exit};地板 ${biasFloor.length} 條${biasFloor.length ? `(${biasFloor.join(';')})` : ''};`
    + `舊數法在這一組會把 ${oldFloorGaps.join('、') || '(沒有)'} 判成「置中從沒被驗過」`)
  if (biasRed.length) console.log(`    例 ${biasRed[0].text}`)

  // 夾具那一段:現況 28 格全綠 → 三種破法的矩陣(每一格被哪一種打紅、其餘破法下必須綠)→「觸發晚到」兩面。一個瀏覽器、夾具只打包一次
  const fixtureRuns = [
    ...FIXTURE_MAIN_RUNS,
    { sabotage: 'swallow', selected: REVEAL_FIXTURE_MID, flow: 'no-user-scroll' },
    { sabotage: 'swallow', selected: REVEAL_FIXTURE_LAST, flow: 'mount-only' },
    { sabotage: 'no-childlist', selected: REVEAL_FIXTURE_MID, flow: 'full' },
    { sabotage: 'mute-user-scroll', selected: REVEAL_FIXTURE_MID, flow: 'full' },
  ]
  const fx = await scanFixture(STATIC, { runs: fixtureRuns, lateTrigger: true })
  const fxGroup = (sabotage) => {
    const runs = fx.runs.filter((r) => r.run.sabotage === sabotage)
    return { cells: runs.flatMap((r) => r.cells), planned: runs.flatMap((r) => r.planned) }
  }
  const tally = (cells) => Object.keys(FIXTURE_CELLS).map((c) => [c, cells.filter((x) => x.cell === c)]).filter(([, xs]) => xs.length)
    .map(([c, xs]) => `${c} ${xs.filter((x) => !x.ok).length}/${xs.length} 紅`).join('、')
  const fxClean = fxGroup('')
  const cleanProblems = [...compareFixtureControl('', fxClean.planned, fxClean.cells), ...fixtureInstrumentProblems(fxClean.cells, fxClean.planned.length)]
  check(cleanProblems.length === 0, `夾具現況:${fxClean.cells.length} 格全綠(${tally(fxClean.cells)})${cleanProblems.length ? `;不符:${cleanProblems.join(' / ')}` : ''}`)
  for (const sabotage of Object.keys(FIXTURE_SABOTAGES)) {
    const g = fxGroup(sabotage)
    const problems = compareFixtureControl(sabotage, g.planned, g.cells)
    const unhit = [...new Set(g.cells.filter((c) => !(c.sabotageHits >= 1)).map((c) => c.strip))]
    const redCells = g.cells.filter((c) => !c.ok)
    check(problems.length === 0 && unhit.length === 0 && g.cells.length > 0,
      `對照組「${sabotage}」${FIXTURE_SABOTAGES[sabotage]}:紅 = 期望(${tally(g.cells)};紅只出現在 ${Object.keys(FIXTURE_CELLS).filter((c) => FIXTURE_CELLS[c].hitBy.includes(sabotage)).join(' / ')})`
      + `${problems.length ? `;不符:${problems.join(' / ')}` : ''}${unhit.length ? `;破法在 ${unhit.join(' / ')} 打到 0 次(產品換了機制,這個破法不成立)` : ''}`)
    if (redCells.length) console.log(`    例 ${redCells[0].text}`)
  }
  const late = fx.late
  check(late.legacy.itemsWhenReturned === late.legacy.itemsAtStart,
    `觸發晚到(第 ${LATE_TRIGGER_FRAME} 個影格才按「複製目前檢視」)· 舊判準(連續 ${LEGACY_STILL_FRAMES} 格不動):第 ${late.legacy.frame} 格就回來,那時項目數 ${late.legacy.itemsWhenReturned}(原本 ${late.legacy.itemsAtStart},觸發還沒發生)—— 它沒等到;那一刻量會判成${late.legacy.cell.ok ? '綠' : `紅(${late.legacy.cell.text})`}`)
  check(late.fresh.itemsWhenReturned === late.fresh.itemsBefore + 1 && late.fresh.cell.ok,
    `觸發晚到 · 新判準(等觸發送達):回來時項目數 ${late.fresh.itemsBefore} → ${late.fresh.itemsWhenReturned}、新項目${late.fresh.cell.ok ? '置中' : `沒置中(${late.fresh.cell.text})`}`)
  if (CONTROL_STATIC) {
    const before = await scanBuild(CONTROL_STATIC, { fresh: false, log: () => {} })
    const r = new Set(before.cells.filter((c) => !c.ok).map((c) => `${c.strip}|${c.input}`))
    const expect = ['chip-scroll|click', 'chip-menu|click', 'tabs-scroll|click', 'tabs-menu|click', 'tabs-scroll|keys', 'chip-scroll|resize', 'tabs-scroll|resize']
    const miss = expect.filter((k) => !r.has(k))
    check(miss.length === 0, `對照組(修前建置 ${path.basename(CONTROL_STATIC)}):紅 ${[...r].sort().join(' / ')}${miss.length ? `;該紅沒紅:${miss.join(', ')}` : ''}`)
  } else {
    console.log('  (沒有 --control-static:修前建置的對照組略過;CI 靠判定表與「拿掉 primitive 呼叫」注入兩面)')
  }
  return ok
}

// 比真實路徑(lib/direct-run.mjs):經符號連結叫的時候只比字串會什麼都不跑、exit 0
if (isDirectRun(import.meta.url)) {
  try {
    if (ARGS.includes('--selftest')) {
      const ok = await selftest()
      console.log(ok ? '✅ overflow-reveal-selected selftest PASS' : '❌ overflow-reveal-selected selftest FAIL')
      process.exit(ok ? 0 : 1)
    }
    const result = await scanBuild(STATIC)
    if (result === null) process.exit(0) // launchBrowserOrSkip 已印 SKIPPED-ENV / BROWSER-REQUIRED 判定
    const fx = await scanFixture(STATIC)
    const fxCells = fx.runs.flatMap((r) => r.cells)
    for (const strip of FIXTURE_STRIPS) console.log(`  夾具 ${strip.label}:${fxCells.filter((c) => c.strip === strip.key).map((c) => `${c.cell}${c.ok ? '✓' : '✗'}`).join(' ')}`)
    if (arg('--dump')) writeFileSync(path.resolve(arg('--dump')), `${JSON.stringify({ story: dumpCells(result.cells), fixture: fxCells.map((c) => ({ strip: c.strip, cell: c.cell, ok: c.ok, kind: c.kind, offset: c.offset ?? null, calls: c.calls, scrollEvents: c.scrollEvents ?? null })) }, null, 1)}\n`)
    const floor = [...instrumentProblems(result.totals), ...fixtureInstrumentProblems(fxCells, plannedFixtureKeys(FIXTURE_MAIN_RUNS).length)]
    const bad = [...result.cells, ...fxCells].filter((c) => !c.ok)
    const verdict = overflowRunVerdict({ bad, floor })
    if (verdict.kind === 'product') {
      console.error(`❌ overflow-reveal-selected FAIL(${bad.length} / ${result.cells.length + fxCells.length} 格):\n  ${bad.map((c) => c.text).join('\n  ')}`)
      if (floor.length) console.error(`  另外,儀器地板有 ${floor.length} 條沒過(這一次的結論是上面量到的產品紅,不是沒量到):${floor.join(';')}`)
      process.exit(verdict.exit)
    }
    if (verdict.kind === 'instrument') {
      console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${floor.join(';')} —— 儀器失效,不當綠燈`)
      console.error('✗ overflow-reveal-selected:儀器失效 —— 這次沒有量完(exit 2;不是產品裁決,也不算通過)')
      process.exit(verdict.exit)
    }
    const n = result.totals.nonClamped
    console.log(`✅ overflow-reveal-selected PASS(${result.cells.length} 格:${STRIPS.length} 排 × 點擊 / 方向鍵 / 選單 / 縮放;需要置中的 點擊 ${n.click}、方向鍵 ${n.keys}、選單 ${n.menu}、縮放 ${n.resize} 格全在中心 ±${CENTER_TOLERANCE_PX}px,其餘合法夾住且完整可讀${result.selfCuts.length ? `;${result.selfCuts.map((c) => c.label).join('、')} 用自備幾何量` : ''}`
      + `;夾具 ${fxCells.length} 格:掛載置中 / 掛載夾在終點 / 新出現的已選項目置中 / 滾輪與箭頭翻頁捲過不搶回 / 捲過後再選一項照樣置中)`)
  } catch (error) {
    // 沒量到(story 開不起來、夾具打包失敗、揭露探針等不到)→ 儀器失效:印標記、exit 2(不是產品裁決,也不算通過)
    if (error instanceof StoryRenderInstrumentError || error instanceof FixtureInstrumentError) {
      const message = String(error.message)
      console.error(`✗ ${message.includes(INSTRUMENT_FAIL_MARKER) ? '' : `${INSTRUMENT_FAIL_MARKER} `}${message}`)
      console.error('✗ overflow-reveal-selected:儀器失效 —— 這次沒有量完(exit 2;不是產品裁決,也不算通過)')
      process.exit(2)
    }
    throw error
  }
}
