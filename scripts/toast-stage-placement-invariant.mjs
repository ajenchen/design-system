#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Toast 照它自己的對齊落在舞台上 —— 代理面板並排時不落進面板:靠右的右緣離舞台右緣(面板左緣)24、置中的中心 = 舞台中線、
 *        面板拖寬跟著走;面板關著入口鈕在家時疊在入口鈕上方(間距 = 入口鈕自己的 loose)、入口鈕中心點得到、頁面捲動後仍如此;
 *        Toast 清單的定位框不是視窗時(Storybook docs 頁)量自定位框;蓋板 / 入口鈕貼邊 / 沒有代理時與 sonner 預設逐像素相同。
 *        規格:toast.spec.md「落點」。
 *   紅: 任一條不符 → exit 1。`--selftest` 三種對照組,每一種都必須紅在它該紅的地方,少一個 = 量具沒在量它宣稱的東西 → exit 1:
 *       (1) 判定表:兩支純函式各換成改壞版(置中不處理 / 量自視窗 / 不濾掉定位框外的佔用),指定的格必紅;呼叫端拿掉呼叫必紅;
 *       (2) 真建置注入改動前的落點(toaster offset 釘回 sonner 預設、置中釘回 left:50%):D / R / M / F / P 每一個情境都必須至少紅一條;
 *       (3) 真建置擋掉捲動事件(只拿掉「捲動後重量」這一件事):K 必紅。sonner 預設邊距的鏡像比對另以「讀到的值 +1」驗會紅。
 *       story / docs 頁開不起來、版面 10 秒內不靜止、Toast 沒出現 = 儀器失效(INSTRUMENT-FAIL,不是產品裁決,也不算通過)。
 *   綠: 沒改壞時全部綠;每個情境都等 Toast 元素本身出現、再等版面連續 10 個影格靜止(sonner 進場過渡也在 getAnimations 裡)才量,
 *       不用固定睡眠當「已出現」的代理;量的是幾何等式(±0.5px)而不是尾端統計,重複跑不抽籤。
 *
 * Toast 落在舞台上(2026-10-13;user 2026-08-08 原話:「toast 一樣落在舞台上啊
 * 反正視覺和互動的結果就是把原本的畫面挪出了一個空間放 ai agent,而其他的元件都應該按照原本的規則在舞台運作得好好的才對吧？」)。
 *
 * SSOT:toast.spec.md「落點」;舞台幾何通道 packages/design-system/src/lib/stage-geometry.ts(resolveStageGeometry),
 * 換算成 sonner 參數 packages/design-system/src/components/Toast/stage-offsets.ts(stageOffsets)
 *(登記者:agent-panel.tsx 並排態、agent-panel-fab.tsx 在家;讀者:toast.tsx <Toaster>)。
 * 修前實測(1ef86547):代理並排時 Toast 落進右側面板、蓋住輸入盒約一半(含送出 / 附件鈕);面板關著時蓋住入口鈕約九成,
 * 點入口鈕中心點到的是 Toast。第一版修正的複審(同日)再抓到兩件:置中的 Toast 仍以視窗為準落進面板;docs 頁的 Toast 清單
 * 定位框是 story 外框(有 transform),量自視窗差了 221px。
 *
 * 判定表(不進瀏覽器):
 *   C  toast 的 SONNER_VIEWPORT_OFFSET / SONNER_MOBILE_VIEWPORT_OFFSET(stage-offsets.ts)= sonner 原始碼的 VIEWPORT_OFFSET / MOBILE_VIEWPORT_OFFSET
 *   T  stageOffsets:六種 position × 四種佔用(沒有 / 右緣 / 右下角 / 兩者)+ 兩個邊界格;期望值逐格寫死,不是抄輸出
 *   G  resolveStageGeometry:定位框 = 視窗 / docs 外框、框外的佔用不算、入口鈕間距;期望值逐格寫死
 *   W  呼叫端真的消費:toast.tsx 以 stageOffsets(position, geometry) 展開進 SonnerToaster、以量尺 span 呼叫 useStageGeometry
 * 真建置情境(每個都等 **Toast 元素本身**出現、再等版面連續靜止 —— 不用固定睡眠當「已出現」的代理):
 *   N  沒有代理(Toast「點擊觸發通知」,1440×900):Toast 右緣 = 視窗右 − 24、底緣 = 視窗下 − 24,toaster 四邊 offset 全是 sonner 預設、
 *      清單沒有行內 left、量尺 = 視窗 —— 與修前逐像素相同
 *   D  代理並排(網址註冊表示意,1440×900,新增任務 → 建立):Toast 與面板不相交;Toast 右緣 = 面板左緣(= 舞台右緣)− 24;底緣與 N 相同
 *   R  接 D,鍵盤把面板拖寬 6 步(+96):Toast 跟著走,右緣 = 新的面板左緣 − 24,仍不相交
 *   O  接 R,視窗縮成 900(容器 < 960 → 蓋板):舞台恢復全寬,Toast 回到 N 的位置(蓋板沒有挪出空間)
 *   M  置中並排(同一則示意以 Controls 參數 toasterPosition=bottom-center 開,1000×900 —— 複審量到落進面板的寬度):
 *      Toast 中心 = 舞台中線(定位框左緣與面板左緣的中點)、與面板不相交、底緣與 N 相同
 *   F  面板關著、入口鈕在家:Toast 與入口鈕不相交;Toast 底緣 = 入口鈕頂 − loose(入口鈕自己的 --layout-space-loose);左右與 N 相同;
 *      入口鈕中心點下去命中的是入口鈕
 *   K  接 F 的設定,讓整頁可捲(story 根之後補一段空白,模擬舞台跟著頁面捲的 app)、捲 60:入口鈕在畫面上上移 60(爬進 Toast 原位),
 *      Toast 跟著重量,底緣仍 = 入口鈕頂 − loose、不相交、入口鈕中心點得到
 *   S  入口鈕鍵盤 → 貼邊(角落讓出來):Toast 回到 N 的位置
 *   P  AgentPanel「展示」docs 頁(1440×900;網址註冊表示意與十幾則有並排面板的 story 同頁,每則外框有 transform):
 *      前提 = 這份 Toaster 的量尺 ≠ 視窗、頁上有不只一個並排面板;Toast 右緣 = 這則示意的面板左緣 − 24、不相交
 * 用法:node scripts/toast-stage-placement-invariant.mjs [--static=<dir>] [--selftest]
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import {
  INSTRUMENT_FAIL_MARKER, launchBrowser, openStory, requireFreshStorybookBuild, settleAfterInteraction, StoryRenderInstrumentError, waitForDocsRender,
} from './lib/launch-browser.mjs'
import * as StageOffsetsModule from '../packages/design-system/src/components/Toast/stage-offsets.ts'
import { NO_STAGE_CLAIM, resolveStageGeometry } from '../packages/design-system/src/lib/stage-geometry.ts'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const SELFTEST = process.argv.includes('--selftest')
let failed = 0
const instrumentFails = []
/** 每個情境紅了幾條(selftest 用) */
const redBy = {}
let current = ''
const rec = (ok, msg, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${current} ${msg}${detail ? ` | ${detail}` : ''}`)
  if (!ok) { failed++; redBy[current] = (redBy[current] ?? 0) + 1 }
}
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8')
const { stageOffsets } = StageOffsetsModule

// sonner 的 ESM 建置(套件 exports 不開放 ./package.json → 從主入口所在的 dist/ 找 index.mjs;DS 實際 import 的就是這一份)
const SONNER_SRC = fs.readFileSync(path.join(path.dirname(createRequire(path.join(REPO, 'packages/design-system/package.json')).resolve('sonner')), 'index.mjs'), 'utf8')

// ── C(靜態):sonner 預設邊距的鏡像值與 sonner 原始碼一致 ─────────────────────────────
{
  current = 'C'
  const mine = (name) => StageOffsetsModule[name]
  const theirs = (name) => Number(SONNER_SRC.match(new RegExp(`const ${name} = '(\\d+)px'`))?.[1])
  const pairs = [['SONNER_VIEWPORT_OFFSET', 'VIEWPORT_OFFSET'], ['SONNER_MOBILE_VIEWPORT_OFFSET', 'MOBILE_VIEWPORT_OFFSET']]
  const same = (bump) => pairs.every(([a, b]) => Number.isFinite(mine(a)) && mine(a) === theirs(b) + bump)
  if (SELFTEST) rec(!same(1), '對照組:把 sonner 的值 +1 → 比對必紅')
  else rec(same(0), `stage-offsets.ts 鏡像的 sonner 預設邊距 = sonner 原始碼(${pairs.map(([a, b]) => `${a}=${mine(a)} / ${b}=${theirs(b)}`).join('、')})`)
}
const BASE = Number(SONNER_SRC.match(/const VIEWPORT_OFFSET = '(\d+)px'/)?.[1])

// ── T / G / W(靜態):判定表 ───────────────────────────────────────────────────
/** 鍵排序後序列化:比對與順序無關 */
const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x))
/** 跑一張判定表;回紅掉的格名(selftest 用) */
function runTable(label, rows, fn, { quiet = false } = {}) {
  const red = []
  for (const [name, input, expected] of rows) {
    const got = canon(fn(...input))
    const ok = got === canon(expected)
    if (!ok) red.push(name)
    if (!quiet) rec(ok, `${label}:${name}`, ok ? '' : `期望 ${canon(expected)} 實得 ${got}`)
  }
  return red
}

// T:stageOffsets。右緣佔用 400(面板左緣離定位框右緣 400)、右下角佔用 72(md 入口鈕:loose 16 + 40 + 間距 16)
const EDGE = { rightInset: 400, bottomInset: null }
const CORNER = { rightInset: null, bottomInset: 72 }
const BOTH = { rightInset: 400, bottomInset: 72 }
const CENTRE = { style: { left: 'calc(50% - 200px)' } }
const T_ROWS = [
  ...['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'].map((p) => [`沒有佔用 / ${p} → 什麼都不傳`, [p, NO_STAGE_CLAIM], {}]),
  ['右緣 / top-left → 舞台左緣沒動', ['top-left', EDGE], {}],
  ['右緣 / top-center → 對齊舞台中線', ['top-center', EDGE], CENTRE],
  ['右緣 / top-right → 離舞台右緣 24', ['top-right', EDGE], { offset: { right: 424 } }],
  ['右緣 / bottom-left → 舞台左緣沒動', ['bottom-left', EDGE], {}],
  ['右緣 / bottom-center → 對齊舞台中線', ['bottom-center', EDGE], CENTRE],
  ['右緣 / bottom-right → 離舞台右緣 24', ['bottom-right', EDGE], { offset: { right: 424 } }],
  ['右下角 / top-left → 碰不到', ['top-left', CORNER], {}],
  ['右下角 / top-center → 碰不到', ['top-center', CORNER], {}],
  ['右下角 / top-right → 碰不到', ['top-right', CORNER], {}],
  ['右下角 / bottom-left → 只有手機(整列滿寬)疊上去', ['bottom-left', CORNER], { mobileOffset: { bottom: 72 } }],
  ['右下角 / bottom-center → 只有手機(整列滿寬)疊上去', ['bottom-center', CORNER], { mobileOffset: { bottom: 72 } }],
  ['右下角 / bottom-right → 疊在入口鈕上方(桌機 + 手機)', ['bottom-right', CORNER], { offset: { bottom: 72 }, mobileOffset: { bottom: 72 } }],
  ['兩者 / top-center → 只管右緣', ['top-center', BOTH], CENTRE],
  ['兩者 / bottom-center → 舞台中線 + 手機疊上去', ['bottom-center', BOTH], { ...CENTRE, mobileOffset: { bottom: 72 } }],
  ['兩者 / bottom-right → 右緣 + 疊上去', ['bottom-right', BOTH], { offset: { right: 424, bottom: 72 }, mobileOffset: { bottom: 72 } }],
  ['兩者 / bottom-left → 只有手機疊上去', ['bottom-left', BOTH], { mobileOffset: { bottom: 72 } }],
  ['邊界:右下角佔用 20(≤ 桌機預設 24、> 手機 16)/ bottom-right → 只動手機', ['bottom-right', { rightInset: null, bottomInset: 20 }], { mobileOffset: { bottom: 20 } }],
  ['邊界:右緣佔用 0 / bottom-center → 不加行內 left', ['bottom-center', { rightInset: 0, bottomInset: null }], {}],
]
// G:resolveStageGeometry。V = 1440×900 視窗;D = docs 頁一則 story 的外框(視窗座標,複審量到的 x 221–1219)
const V = { left: 0, top: 0, right: 1440, bottom: 900 }
const D = { left: 221, top: 300, right: 1219, bottom: 1100 }
const edge = (left, top, right, bottom) => ({ kind: 'edge', box: { left, top, right, bottom } })
const corner = (left, top, size, gap) => ({ kind: 'corner', box: { left, top, right: left + size, bottom: top + size }, gap })
const G_ROWS = [
  ['沒有登記 → NO_STAGE_CLAIM', [[], V], { rightInset: null, bottomInset: null }],
  ['視窗 / 並排面板 999–1440 → 右緣佔 441', [[edge(999, 0, 1440, 900)], V], { rightInset: 441, bottomInset: null }],
  ['docs 外框 / 這則的面板 841–1202 → 量自外框右緣 1219:佔 378', [[edge(841, 340, 1202, 1080)], D], { rightInset: 378, bottomInset: null }],
  ['docs 外框 / 別則 story 的面板在框外(下方)→ 不算', [[edge(841, 340, 1202, 1080), edge(700, 1300, 1202, 2000)], D], { rightInset: 378, bottomInset: null }],
  ['docs 外框 / 面板整個在框的右邊外 → 不算', [[edge(1219, 340, 1500, 1080)], D], { rightInset: null, bottomInset: null }],
  ['視窗 / 入口鈕在家(頂 844、間距 16)→ 底緣最低離下緣 72', [[corner(1384, 844, 40, 16)], V], { rightInset: null, bottomInset: 72 }],
  ['docs 外框 / 入口鈕(頂 1028、間距 16)→ 量自外框下緣 1100:88', [[corner(1163, 1028, 40, 16)], D], { rightInset: null, bottomInset: 88 }],
  ['零寬盒子 → 不算', [[edge(999, 0, 999, 900)], V], { rightInset: null, bottomInset: null }],
]
// W:呼叫端真的消費兩支純函式(M37:判定表測過、呼叫端卻自己另寫一份 = 兩份平行實作)
const W_CHECKS = [
  ['toast.tsx 從 ./stage-offsets import stageOffsets', /import \{[^}]*\bstageOffsets\b[^}]*\} from '\.\/stage-offsets'/],
  ['SonnerToaster 展開 stageOffsets(position, geometry)', /<SonnerToaster[\s\S]*?\{\.\.\.stageOffsets\(position, geometry\)\}[\s\S]*?\/>/],
  ['以量尺 ref 呼叫 useStageGeometry', /useStageGeometry\(originRef\)/],
  ['量尺 span 掛上 originRef、fixed inset 0', /<span ref=\{originRef\}[^>]*style=\{STAGE_ORIGIN_STYLE\}/],
  ['量尺樣式 = fixed + inset 0', /STAGE_ORIGIN_STYLE[^=]*= \{ position: 'fixed', inset: 0,/],
]
const runWiring = (src, quiet) => W_CHECKS.filter(([name, re]) => { const ok = re.test(src); if (!quiet) rec(ok, `呼叫端:${name}`); return !ok }).map(([name]) => name)

const TOAST_SRC = read('packages/design-system/src/components/Toast/toast.tsx')
if (!SELFTEST) {
  current = 'T'; runTable('stageOffsets', T_ROWS, stageOffsets)
  current = 'G'; runTable('resolveStageGeometry', G_ROWS, resolveStageGeometry)
  current = 'W'; runWiring(TOAST_SRC, false)
} else {
  // 改壞版:每一個都必須讓它指定的格紅(不是「有紅就好」)
  const MUTANTS = [
    ['T', '置中不處理(第一版)', T_ROWS, (p, g) => { const o = stageOffsets(p, g); delete o.style; return o },
      ['右緣 / top-center → 對齊舞台中線', '右緣 / bottom-center → 對齊舞台中線', '兩者 / top-center → 只管右緣', '兩者 / bottom-center → 舞台中線 + 手機疊上去']],
    ['G', '量自視窗(第一版)', G_ROWS, (entries) => resolveStageGeometry(entries, V),
      ['docs 外框 / 這則的面板 841–1202 → 量自外框右緣 1219:佔 378', 'docs 外框 / 入口鈕(頂 1028、間距 16)→ 量自外框下緣 1100:88']],
    ['G', '不濾掉定位框上下之外的佔用', G_ROWS, (entries, frame) => resolveStageGeometry(entries.map((e) => (e.box ? { ...e, box: { ...e.box, top: frame.top, bottom: frame.top + (e.box.bottom - e.box.top) } } : e)), frame),
      ['docs 外框 / 別則 story 的面板在框外(下方)→ 不算']],
  ]
  for (const [scope, label, rows, fn, mustRed] of MUTANTS) {
    current = scope
    const red = runTable(label, rows, fn, { quiet: true })
    const missed = mustRed.filter((n) => !red.includes(n))
    rec(missed.length === 0, `對照組「${label}」:指定的 ${mustRed.length} 格都紅`, missed.length ? `沒紅:${missed.join('、')}` : `紅 ${red.length} 格`)
  }
  current = 'W'
  const unwired = TOAST_SRC.replace('{...stageOffsets(position, geometry)}', '')
  const missed = runWiring(unwired, true)
  rec(missed.includes('SonnerToaster 展開 stageOffsets(position, geometry)'), '對照組:拿掉 SonnerToaster 上的 stageOffsets 展開 → 呼叫端檢查必紅', missed.join('、') || '沒紅')
}

const root = path.resolve(REPO, arg('static', 'storybook-static'))
requireFreshStorybookBuild(root, [
  'packages/design-system/src/components/Toast/toast.tsx',
  'packages/design-system/src/components/Toast/stage-offsets.ts',
  'packages/design-system/src/lib/stage-geometry.ts',
  'packages/design-system/src/components/AgentPanel/agent-panel.tsx',
  'packages/design-system/src/components/AgentPanel/agent-panel-fab.tsx',
  'packages/design-system/src/components/AgentPanel/agent-panel.stories.tsx',
])
const server = await startA11yStaticServer({ rootDirectory: root, defaultFile: 'iframe.html' })
process.once('exit', (code) => { if (code && server.notFound.length) console.error('同源 404:', [...new Set(server.notFound)].join(', ')) })
const index = JSON.parse(fs.readFileSync(path.join(server.snapshot?.dir ?? root, 'index.json'), 'utf8'))
const findEntry = (type, re) => Object.values(index.entries).find((e) => e.type === type && re.test(e.id))?.id
const DEMO = findEntry('story', /agentpanel.*--url-registry-demo$/)
const TOAST = findEntry('story', /components-toast-.*--interactive$/)
const DOCS = findEntry('docs', /agentpanel-展示--docs$/)
if (!DEMO || !TOAST || !DOCS) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:找不到 story / docs(網址註冊表 ${DEMO ?? '缺'} / Toast 點擊觸發通知 ${TOAST ?? '缺'} / AgentPanel 展示 docs ${DOCS ?? '缺'})`)
  await server.stop()
  process.exit(1)
}

/** 修前行為:toaster 的 offset 釘回 sonner 預設、置中釘回 sonner 的 left:50%(important 作者樣式蓋過寫在 style 上的自訂屬性與行內 left) */
const OLD_BEHAVIOUR_CSS = `[data-sonner-toaster]{--offset-right:${BASE}px!important;--offset-bottom:${BASE}px!important;--mobile-offset-bottom:16px!important}`
  + '[data-sonner-toaster][data-x-position="center"]{left:50%!important}'
/** 只拿掉「捲動後重量」:在 window 的捕獲階段最先攔下所有 scroll 事件(init script 先於頁面任何監聽註冊) */
const BLOCK_SCROLL_EVENTS = () => window.addEventListener('scroll', (event) => event.stopImmediatePropagation(), { capture: true })
const PANEL = '[role="complementary"][aria-label="智慧代理"]'
const FAB = 'button[aria-label*="開啟智慧代理"]'
const TOAST_EL = '[data-sonner-toast][data-mounted="true"] [data-toast-visual-content]'

const browser = await launchBrowser()
const VIEWPORT = { width: 1440, height: 900 }
// 明確建 context(不用 browser.newPage 的自帶 context):K 的對照組要在同一個 context 裡換新分頁 —— 沙箱參數 --single-process
// 開不了第二個 context(launch-browser.mjs 檔頭),而 browser.newPage 的自帶 context 不准再開分頁
const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'no-preference' })
let page = await context.newPage()

/**
 * 一個情境 = 重開 story(等指定元素本身 + 版面靜止)+ 操作 + 斷言;開不起來 = 儀器失效,不是產品裁決。
 * selftest 時注入該情境的對照組:預設 = 修前落點的樣式;`control: 'block-scroll'` = 換一個先掛好捲動攔截的新分頁。
 */
async function scenario(name, storyId, waitFor, body, { viewport = VIEWPORT, args = '', control = 'old-css' } = {}) {
  current = name
  if (SELFTEST && control === 'block-scroll') {
    await swapPage(viewport)
    await page.addInitScript(BLOCK_SCROLL_EVENTS)
  } else {
    await page.setViewportSize(viewport)
  }
  try {
    await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story${args ? `&args=${args}` : ''}`, { waitFor, settleFrames: 10, notFound: server.notFound })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    console.log(`✗ 情境 ${name}:${error.message}`)
    instrumentFails.push({ scenario: name, detail: error.detail })
    return
  }
  if (SELFTEST && control === 'old-css') await page.addStyleTag({ content: OLD_BEHAVIOUR_CSS })
  try {
    await body()
  } catch (error) {
    console.log(`✗ 情境 ${name} 沒量到:${error.message.split('\n')[0]}`)
    instrumentFails.push({ scenario: name, detail: error.message.split('\n')[0] })
  }
  if (SELFTEST && control === 'block-scroll') await swapPage(VIEWPORT)
}
/**
 * 換一個乾淨的分頁(init script 拿不掉,要拿掉只能換頁)。同一個 context 開(沙箱參數 --single-process 開不了第二個 context,
 * launch-browser.mjs 檔頭),先開新的再關舊的(關掉最後一頁 = 整個瀏覽器結束)。
 */
async function swapPage(viewport) {
  const fresh = await context.newPage()
  await fresh.setViewportSize(viewport)
  await page.close()
  page = fresh
}

/** 等 Toast 元素本身、再等版面靜止(sonner 進場 400ms transform 過渡也在 getAnimations 裡);滑鼠停在 Toast 上讓 sonner 暫停倒數 */
async function waitToast(text) {
  await page.waitForFunction(({ sel, text }) => [...document.querySelectorAll(sel)].some((el) => (el.textContent ?? '').includes(text)), { sel: TOAST_EL, text }, { timeout: 10_000, polling: 'raf' })
  const box = await page.locator(TOAST_EL).first().boundingBox()
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await settle()
}
async function settle() {
  const s = await settleAfterInteraction(page, { frames: 10 })
  if (!s.ok) throw new Error(`版面 10 秒內沒有靜止(${JSON.stringify(s)})`)
}
/** 一次量齊:Toast / 面板 / 輸入盒 / 入口鈕(含它的 loose)/ 視窗 / 量尺 / toaster 的 offset 自訂屬性與行內 left */
const measure = () => page.evaluate(({ PANEL, FAB, TOAST_EL }) => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null }
  const panel = document.querySelector(PANEL)
  const ta = panel?.querySelector('textarea[aria-label="訊息"]')
  let prompt = ta ?? null
  while (prompt && !prompt.querySelector('[aria-label="新增附件"]')) prompt = prompt.parentElement
  const fab = document.querySelector(FAB)
  const shell = fab?.closest('[data-placement]')
  const ol = document.querySelector('[data-sonner-toaster]')
  const cs = ol ? getComputedStyle(ol) : null
  return {
    vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight,
    toast: box([...document.querySelectorAll(TOAST_EL)].at(-1)),
    toastCount: document.querySelectorAll(TOAST_EL).length,
    panel: panel && getComputedStyle(panel).display !== 'none' ? box(panel) : null,
    panelMode: panel?.getAttribute('data-agent-panel-mode') ?? null,
    prompt: box(prompt),
    fab: box(fab), fabPlacement: shell?.getAttribute('data-placement') ?? null,
    loose: shell ? parseFloat(getComputedStyle(shell).getPropertyValue('--layout-space-loose')) : null,
    offsets: cs ? ['top', 'right', 'bottom', 'left'].map((k) => cs.getPropertyValue(`--offset-${k}`).trim()) : null,
    xPosition: ol?.getAttribute('data-x-position') ?? null,
    // 清單 <ol> 本身的左右(高度可能是 0:Toast 都是絕對定位 —— 不能用 box() 的「有面積」條件)
    list: ol ? (({ left, right }) => ({ left, right }))(ol.getBoundingClientRect()) : null,
    inlineLeft: ol?.style.left ?? null,
    origin: box(document.querySelector('[data-toast-stage-origin]')),
    fabHit: (() => { const b = box(fab); if (!b) return null; const el = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2); return !!el && !!fab && (el === fab || fab.contains(el)) })(),
  }
}, { PANEL, FAB, TOAST_EL })
const area = (a, b) => (a && b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : NaN)
const near = (a, b) => Math.abs(a - b) <= 0.5
const fmt = (b) => (b ? `[${Math.round(b.left)},${Math.round(b.top)} – ${Math.round(b.right)},${Math.round(b.bottom)}]` : 'null')
/** 新增任務 → 打標題 → 儲存 → 等「任務已建立」 */
async function createTask(title) {
  await page.click('#demo-new-task')
  await page.waitForSelector('#demo-task-title')
  await page.click('#demo-task-title')
  await page.keyboard.type(title)
  await page.click('#demo-task-save')
  await waitToast('任務已建立')
}
/** 面板關著、等入口鈕回到家且版面靜止 */
async function closePanel() {
  await page.click('button[aria-label="關閉面板"]')
  await page.waitForSelector(FAB)
  await settle()
}
/** 「沒有代理時」的落點:N 量到、其餘情境比對 */
let ref = null

// ── N 沒有代理:sonner 預設 ─────────────────────────────────────────────
await scenario('N', TOAST, 'button', async () => {
  await page.getByRole('button', { name: '儲存專案' }).click()
  await waitToast('專案已儲存')
  const m = await measure()
  ref = { right: m.vw - m.toast.right, bottom: m.vh - m.toast.bottom }
  rec(near(ref.right, BASE) && near(ref.bottom, BASE), `沒有代理:Toast 離視窗右 / 下各 ${BASE}(sonner 預設)`, `右 ${ref.right.toFixed(1)} 下 ${ref.bottom.toFixed(1)} ${fmt(m.toast)}`)
  rec(JSON.stringify(m.offsets) === JSON.stringify(Array(4).fill(`${BASE}px`)) && !m.inlineLeft, 'toaster 四邊 offset 全是 sonner 預設、沒有行內 left(沒有代理 = 什麼都不傳)', `${JSON.stringify(m.offsets)} left=${JSON.stringify(m.inlineLeft)}`)
  rec(!!m.origin && near(m.origin.left, 0) && near(m.origin.top, 0) && near(m.origin.right, m.vw) && near(m.origin.bottom, m.vh), '量尺 = 視窗(一般頁面的定位框)', fmt(m.origin))
})
if (!ref) ref = { right: BASE, bottom: BASE }

// ── D / R / O 代理並排 → 拖寬 → 蓋板 ─────────────────────────────────────
await scenario('D', DEMO, PANEL, async () => {
  await createTask('補 QA 環境資訊')
  const m = await measure()
  rec(m.panelMode === 'side-by-side' && !!m.panel, '前提:代理並排開著', `mode=${m.panelMode}`)
  rec(area(m.toast, m.panel) === 0, 'Toast 與面板不相交', `相交 ${area(m.toast, m.panel)}px²(輸入盒 ${area(m.toast, m.prompt)}px²)Toast ${fmt(m.toast)} 面板 ${fmt(m.panel)}`)
  rec(m.panel && near(m.panel.left - m.toast.right, BASE), `Toast 右緣 = 舞台右緣(面板左緣)− ${BASE}`, `面板左 ${m.panel?.left} − Toast 右 ${m.toast.right.toFixed(1)} = ${(m.panel?.left - m.toast.right).toFixed(1)}`)
  rec(near(m.vh - m.toast.bottom, ref.bottom), '上下不動:Toast 底緣與沒有代理時相同', `${(m.vh - m.toast.bottom).toFixed(1)} vs ${ref.bottom.toFixed(1)}`)

  current = 'R'
  const handle = page.getByRole('separator', { name: '調整面板寬度' })
  await handle.focus()
  // 6 步 × 16 = 96:1440 寬時容器約 1406,並排上限 = 容器 × 3/8 ≈ 527,400 + 96 不會撞上限(撞上限量到的寬度就不是 96)
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft')
  await settle()
  const r = await measure()
  const widened = m.panel && r.panel ? (r.panel.right - r.panel.left) - (m.panel.right - m.panel.left) : NaN
  rec(near(widened, 96), '前提:面板拖寬 96(6 步 × 16)', `+${widened}`)
  rec(r.toastCount > 0 && area(r.toast, r.panel) === 0, '拖寬後 Toast 仍與面板不相交', `相交 ${area(r.toast, r.panel)}px² Toast ${fmt(r.toast)} 面板 ${fmt(r.panel)}`)
  rec(r.panel && near(r.panel.left - r.toast.right, BASE), `Toast 跟著走:右緣 = 新的面板左緣 − ${BASE}`, `面板左 ${r.panel?.left} − Toast 右 ${r.toast?.right.toFixed(1)}`)

  current = 'O'
  await page.setViewportSize({ width: 900, height: 900 })
  await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-agent-panel-mode') === 'overlay', PANEL, { timeout: 10_000, polling: 'raf' })
  await settle()
  const o = await measure()
  rec(o.toastCount > 0 && near(o.vw - o.toast.right, ref.right) && near(o.vh - o.toast.bottom, ref.bottom), '蓋板(容器 < 960):舞台全寬,Toast 回到沒有代理時的位置', `右 ${(o.vw - o.toast?.right).toFixed(1)} 下 ${(o.vh - o.toast?.bottom).toFixed(1)};與輸入盒相交 ${area(o.toast, o.prompt)}px²(待決,見 toast.spec.md「落點」)`)
})

// ── M 置中並排:Toast 中心 = 舞台中線 ────────────────────────────────────
await scenario('M', DEMO, PANEL, async () => {
  await createTask('補 QA 環境資訊')
  const m = await measure()
  rec(m.xPosition === 'center' && m.panelMode === 'side-by-side' && !!m.panel, '前提:Toaster 置中(Controls 參數生效)、代理並排開著', `x=${m.xPosition} mode=${m.panelMode}`)
  const stageLeft = m.origin?.left ?? 0
  const stageCentre = m.panel ? (stageLeft + m.panel.left) / 2 : NaN
  const listCentre = m.list ? (m.list.left + m.list.right) / 2 : NaN
  const centre = m.toast ? (m.toast.left + m.toast.right) / 2 : NaN
  // sonner 的清單寬 356(dist/index.mjs:419 TOAST_WIDTH)、DS 的 Toast 寬 360(toast.tsx w-[360px]),置中時 Toast 從清單左緣排起 →
  // Toast 中心永遠比清單中心偏右 (360 − 356) / 2 = 2;沒有代理時對視窗中線也是這 2px(sonner 幾何,不是本次改動)。所以量兩件事:
  // 清單中心 = 舞台中線(本次改動控制的那個 left),以及 Toast 對清單的偏差 = 寬度差的一半(沒有被別的東西推走)。
  const skew = m.toast && m.list ? ((m.toast.right - m.toast.left) - (m.list.right - m.list.left)) / 2 : NaN
  rec(near(listCentre, stageCentre), 'Toast 清單中心 = 舞台中線(定位框左緣與面板左緣的中點)', `清單中心 ${listCentre.toFixed(1)} vs 舞台中線 ${stageCentre.toFixed(1)}(視窗中線 ${(m.vw / 2).toFixed(1)})`)
  rec(near(centre - listCentre, skew), 'Toast 對清單的偏差 = 寬度差的一半(與沒有代理時對視窗中線相同)', `Toast 中心 ${centre.toFixed(1)} − 清單中心 ${listCentre.toFixed(1)} = ${(centre - listCentre).toFixed(1)},寬度差一半 ${skew.toFixed(1)}`)
  rec(area(m.toast, m.panel) === 0, 'Toast 與面板不相交', `相交 ${area(m.toast, m.panel)}px²(輸入盒 ${area(m.toast, m.prompt)}px²)Toast ${fmt(m.toast)} 面板 ${fmt(m.panel)}`)
  rec(near(m.vh - m.toast.bottom, ref.bottom), '上下不動:Toast 底緣與沒有代理時相同', `${(m.vh - m.toast.bottom).toFixed(1)} vs ${ref.bottom.toFixed(1)}`)
}, { viewport: { width: 1000, height: 900 }, args: 'toasterPosition:bottom-center' })

// ── F 入口鈕在家 ───────────────────────────────────────────────────────
await scenario('F', DEMO, PANEL, async () => {
  await closePanel()
  await createTask('補 QA 環境資訊')
  const m = await measure()
  rec(m.fabPlacement === 'home' && !!m.fab, '前提:面板關著、入口鈕在家', `placement=${m.fabPlacement}`)
  rec(area(m.toast, m.fab) === 0, 'Toast 與入口鈕不相交', `相交 ${area(m.toast, m.fab)}px² Toast ${fmt(m.toast)} 入口鈕 ${fmt(m.fab)}`)
  rec(m.fab && near(m.fab.top - m.toast.bottom, m.loose), `Toast 底緣 = 入口鈕頂 − loose(${m.loose})`, `${(m.fab?.top - m.toast.bottom).toFixed(1)}`)
  rec(near(m.vw - m.toast.right, ref.right), '左右不動:Toast 右緣與沒有代理時相同', `${(m.vw - m.toast.right).toFixed(1)} vs ${ref.right.toFixed(1)}`)
  rec(m.fabHit === true, '入口鈕中心點下去命中入口鈕(不是 Toast)', `hit=${m.fabHit}`)
})

// ── K 頁面捲動:入口鈕跟著內容捲,Toast 跟著重量 ───────────────────────────
await scenario('K', DEMO, PANEL, async () => {
  await closePanel()
  // 讓整頁可捲:story 根之後補一段空白(舞台跟著頁面捲的 app;入口鈕住在捲動的內容裡,Toast 清單的定位框仍是視窗)
  await page.evaluate(() => { const pad = document.createElement('div'); pad.setAttribute('data-gate-scroll-pad', ''); pad.style.height = '600px'; document.body.append(pad) })
  await settle()
  await createTask('補 QA 環境資訊')
  const before = await measure()
  // 捲 60:入口鈕上移 60,正好爬進 Toast 原本的位置(Toast 高 45 + 間距 16 —— 捲得太多反而越過 Toast,量不出「又蓋回去」)
  await page.evaluate(() => window.scrollBy(0, 60))
  await settle()
  const m = await measure()
  rec(before.fab && m.fab && near(before.fab.top - m.fab.top, 60), '前提:捲 60 後入口鈕在畫面上上移 60', `${before.fab?.top} → ${m.fab?.top}`)
  rec(area(m.toast, m.fab) === 0, '捲動後 Toast 與入口鈕不相交', `相交 ${area(m.toast, m.fab)}px² Toast ${fmt(m.toast)} 入口鈕 ${fmt(m.fab)}`)
  rec(m.fab && near(m.fab.top - m.toast.bottom, m.loose), `捲動後 Toast 底緣仍 = 入口鈕頂 − loose(${m.loose})`, `${(m.fab?.top - m.toast.bottom).toFixed(1)}(捲動前 ${(before.fab?.top - before.toast?.bottom).toFixed(1)})`)
  rec(m.fabHit === true, '捲動後入口鈕中心點下去仍命中入口鈕', `hit=${m.fabHit}`)
}, { control: 'block-scroll' })

// ── S 入口鈕貼邊:角落讓出來 ───────────────────────────────────────────
await scenario('S', DEMO, PANEL, async () => {
  await page.click('button[aria-label="關閉面板"]')
  await page.waitForSelector(FAB)
  await page.locator(FAB).first().focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction((sel) => document.querySelector(sel)?.closest('[data-placement]')?.getAttribute('data-placement') === 'dock', FAB, { timeout: 10_000, polling: 'raf' })
  await settle()
  await createTask('補 QA 環境資訊')
  const m = await measure()
  rec(near(m.vw - m.toast.right, ref.right) && near(m.vh - m.toast.bottom, ref.bottom), '入口鈕貼邊:角落讓出來,Toast 回到沒有代理時的位置', `右 ${(m.vw - m.toast.right).toFixed(1)} 下 ${(m.vh - m.toast.bottom).toFixed(1)};與貼邊鈕相交 ${area(m.toast, m.fab)}px²`)
})

// ── P docs 頁:定位框是 story 外框,不是視窗 ──────────────────────────────
{
  current = 'P'
  await page.setViewportSize(VIEWPORT)
  const url = `${server.origin}/iframe.html?id=${encodeURIComponent(DOCS)}&viewMode=docs`
  let opened = false
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await waitForDocsRender(page, { docsId: DOCS, timeoutMs: 60_000, settleFrames: 10, url, notFound: server.notFound, label: 'AgentPanel 展示 docs 頁' })
    await page.waitForSelector('#demo-new-task', { state: 'attached', timeout: 30_000 })
    opened = true
  } catch (error) {
    console.log(`✗ 情境 P:${error.message.split('\n')[0]}`)
    instrumentFails.push({ scenario: 'P', detail: error.detail ?? error.message.split('\n')[0] })
  }
  if (opened) {
    if (SELFTEST) await page.addStyleTag({ content: OLD_BEHAVIOUR_CSS })
    try {
      // 網址註冊表示意是 docs 頁上唯一的行內 #demo-new-task(未存檔確認那則以 iframe 渲染);捲到畫面中間再操作。
      // 用 DOM 的 click / 原生 value setter:docs 頁上同時有十幾則 story,Playwright 的可操作性判定會被別則的浮層擋住,
      // 而這裡要驗的是落點,不是點擊路徑(點擊路徑由 D 情境與 agent-url-registry-demo 閘負責)。
      const button = page.locator('#demo-new-task').first()
      await button.evaluate((b) => b.scrollIntoView({ block: 'center' }))
      await settle()
      await button.evaluate((b) => b.click())
      await page.waitForSelector('#demo-task-title')
      await page.locator('#demo-task-title').first().evaluate((input) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '補 QA 環境資訊')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await page.locator('#demo-task-save').first().evaluate((b) => b.click())
      await page.waitForFunction(({ sel, text }) => [...document.querySelectorAll(sel)].some((el) => (el.textContent ?? '').includes(text)), { sel: TOAST_EL, text: '任務已建立' }, { timeout: 10_000, polling: 'raf' })
      const toastEl = page.locator(TOAST_EL).last()
      await toastEl.evaluate((t) => t.scrollIntoView({ block: 'nearest' }))
      const tb = await toastEl.boundingBox()
      if (tb) await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2)
      await settle()
      const m = await page.evaluate(({ PANEL, TOAST_EL }) => {
        const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null }
        // 這則示意的範圍 = 同時含「新增任務」鈕、並排面板、正在顯示的 Toast 清單的最近祖先(頁上只有這一則剛跳出 Toast)
        let scope = document.querySelector('#demo-new-task')
        while (scope && !(scope.querySelector(PANEL) && scope.querySelector('[data-sonner-toaster]'))) scope = scope.parentElement
        const panel = scope?.querySelector(PANEL)
        const docked = [...document.querySelectorAll(PANEL)].filter((p) => p.getAttribute('data-agent-panel-mode') === 'side-by-side' && box(p))
        return {
          vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight,
          toast: box([...document.querySelectorAll(TOAST_EL)].at(-1)),
          panel: box(panel), panelMode: panel?.getAttribute('data-agent-panel-mode') ?? null,
          origin: box(scope?.querySelector('[data-toast-stage-origin]')),
          dockedPanels: docked.length,
        }
      }, { PANEL, TOAST_EL })
      rec(m.panelMode === 'side-by-side' && !!m.panel && !!m.toast, '前提:示意的代理並排開著、Toast 出現', `mode=${m.panelMode}`)
      rec(!!m.origin && !(near(m.origin.left, 0) && near(m.origin.right, m.vw)), '前提:這份 Toaster 的定位框是 story 外框,不是視窗', `量尺 ${fmt(m.origin)} 視窗寬 ${m.vw}`)
      rec(m.dockedPanels >= 2, '前提:頁上不只一個並排面板(別則 story 的不能算進這份舞台)', `${m.dockedPanels} 個`)
      rec(area(m.toast, m.panel) === 0, 'Toast 與這則示意的面板不相交', `相交 ${area(m.toast, m.panel)}px² Toast ${fmt(m.toast)} 面板 ${fmt(m.panel)}`)
      rec(m.panel && m.toast && near(m.panel.left - m.toast.right, BASE), `Toast 右緣 = 這則示意的面板左緣 − ${BASE}`, `面板左 ${m.panel?.left} − Toast 右 ${m.toast?.right.toFixed(1)} = ${(m.panel?.left - m.toast?.right).toFixed(1)}`)
    } catch (error) {
      console.log(`✗ 情境 P 沒量到:${error.message.split('\n')[0]}`)
      instrumentFails.push({ scenario: 'P', detail: error.message.split('\n')[0] })
    }
  }
}

await browser.close()
await server.stop()
if (instrumentFails.length) {
  console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:${instrumentFails.length} 個情境沒量到 —— 不是產品裁決,但這次不能宣稱 Toast 落在舞台上${SELFTEST ? ',也不能宣稱對照組紅得對' : ''}:`)
  for (const f of instrumentFails) console.log(`  · 情境 ${f.scenario}:${f.detail}`)
}
if (SELFTEST) {
  const MUST = ['D', 'R', 'M', 'F', 'K', 'P']
  const caught = MUST.filter((s) => (redBy[s] ?? 0) > 0)
  // 靜態對照組(C / T / G / W)每一條都是「必須紅才算綠」的斷言 → 那些 scope 不得有任何一條紅
  const staticOk = ['C', 'T', 'G', 'W'].every((s) => !redBy[s])
  const ok = caught.length === MUST.length && staticOk && instrumentFails.length === 0
  console.log(ok
    ? `✓ selftest:改壞的判定被判定表抓到、注入修前行為後 ${MUST.join(' / ')} 都紅、C 比對會紅 —— 量具有效`
    : `✗ selftest:對照組沒被抓到(紅的情境 ${caught.join(' / ') || '無'},該紅 ${MUST.join(' / ')};靜態對照組 ${staticOk ? '有效' : '無效'})`)
  process.exit(ok ? 0 : 1)
}
const red = failed > 0 || instrumentFails.length > 0
console.log(red ? `✗ toast-stage-placement ${failed} 條失敗、${instrumentFails.length} 個情境沒量到` : '✅ toast-stage-placement PASS(Toast 照自己的對齊落在舞台上:並排讓開面板、置中對齊舞台中線、拖寬跟著走、在家的入口鈕上方、捲動跟著走、docs 頁量自 story 外框、沒有代理逐像素不變)')
process.exit(red ? 1 : 0)
