#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 從「密度和整頁不同的區塊」打開的小浮層,用觸發點那一區的密度。
 *        (user 2026-11-11 決策頁「浮層密度」答「跟按鈕」—— 記在 tokens/density/density.spec.md:55;「哪幾種浮層、各自鎖不鎖」是同檔 :66-71 那張表。
 *         user 定的只有「跟按鈕」;下面每一種浮層量哪個元素、對哪一顆 token,是 AI 依那張表逐列落成格子【AI 推導】,不是 user 的決定。)
 *        七種浮層 × 整頁一般 / 大 × 一般 / 大密度區塊 = 28 格,每一格的每一條檢查分開記(共 60 條);期望值當場在「那一區」的元素上量 token,不寫死 28 / 32 / 36:
 *          [H] 控制項大小 = 那一區的 token —— Select(Popover 版的 sm 下拉)選項列高 = --field-height-sm;下拉選單、子選單的列高 = --field-height-md;
 *              HoverCard 裡人員卡動作鈕高 = --field-height-sm;日期區間(只有錨點)、日期單日的日期格高與寬 = --field-height-sm。
 *          [A] 同一個元素的高 = 觸發點自己的高(Select、下拉選單)。
 *          [P] 子選單列高 = 主選單列高(子選單不經 Portal、跟主選單同檔;density.spec.md:69)。
 *          [T] Tooltip 內容裡 --field-height-sm 的計算值 = 那一區的值。Tooltip 現在沒有任何會跟密度變的像素(density.spec.md:71),
 *              所以這一條量的是 token 計算值,不是像素。
 *          [L] 版面間距 —— 鎖 md 的(Popover 家族:Select、日期區間)內容的 --layout-space-loose = 16;不鎖的(下拉選單、HoverCard、Tooltip)= 那一區的值
 *              (下拉選單、Tooltip 的元件本身不消費這顆 token;HoverCard 的內容由使用端放,DS 範例在 HoverCardContent 上用 p-[var(--layout-space-loose)],這一條保的是使用端照範例寫時看得到的內距;夾具裡的人員卡不消費 —— 三種量的都是 token 計算值)。
 *   紅: 任一條不符 → 一行指名「哪一格 · 哪一種浮層 | [哪一條] 量到多少、應該多少」,exit 1。
 *       沒量到(story / 夾具開不起來、點不開、等不到內容或版面靜止、缺元素、量值不是正的有限數、開著的浮層數不對、整頁或區塊密度沒套上、格數不對)
 *       → 印儀器失效標記、先收掉瀏覽器與伺服器、exit 2:不是通過,也不指控產品。
 *       --selftest 每一種破法都比「紅的集合 = 期望的集合」(多紅一條、少紅一條都算失敗):
 *         ui-size-gone  持續拿掉內容根元素的 data-ui-size → 每一種浮層「區塊 ≠ 整頁」那 2 格的 H / A / T 紅;全部 L、子選單的 P、另外 2 格必綠。
 *         lock-gone     (只對鎖的)data-layout-space 改成那一區的檔位 → L 紅在區塊大密度的 2 格。
 *         attr-gone     data-layout-space 整個拿掉 → 鎖的:L 紅在整頁大密度的 2 格;不鎖的:L 紅在「區塊 ≠ 整頁」的 2 格。
 *         forced-md     (只對不鎖的)硬寫 data-layout-space="md" → L 紅在區塊大密度的 2 格。
 *         sub-reparent  把子選單的 popper 包層搬到 body(= 子選單被包了 Portal)→ 只有子選單「區塊 ≠ 整頁」那 2 格的 H、P 紅;主選單 4 格必綠。
 *         token-unreadable(內容的 --layout-space-loose 設成 initial → 讀到 0)與假建置(整支閘吃一份只有「無預覽」頁的建置)
 *                       → 必須被判成儀器失效(後者結束碼 2),不可以讀成紅或綠。
 *   綠: 28 格、60 條全部符合。「整頁一般 / 一般密度區塊」那一格對 L 沒有鑑別力(鎖著、跟區塊、跟整頁三種情況都是 16),照實寫在這裡 —— 它只當對照(任何破法下必綠)。
 *       不靠固定睡眠:每一步等浮層內容的元素本身出現、再等版面連續靜止才量;等不到 = 儀器失效,機器慢只會等久一點,不會改變判定。
 *   註: 量的是性質本身(像素或 token 計算值,對那一區量到的 token),不是「浮層上有沒有某個屬性」(M37)。
 *       下拉選單 / 子選單 / HoverCard / Tooltip / 日期兩種在閘自己的夾具頁量(scripts/test-fixtures/overlay-density-regions/fixture.tsx):
 *       DS 沒有「密度和整頁不同的區塊裡放這幾種浮層」的 story(為什麼不加 story 見夾具檔頭)。Select 仍在 uiSize「產品對齊用的共用尺寸」story 上量。
 *       不量的同族【AI 判斷】:浮層開著時區塊密度被改(試過的對照組不會紅 —— Radix 每次重畫都重掛 ref、產品會重讀,做不出對照組的格不加);
 *       virtualRef 錨點(使用處最少)。
 *
 * 為什麼(稽核 R7-02):浮層經 Portal 掛到 body,CSS 繼承鏈從 html 起算 → 一般密度頁面裡的大密度區塊,
 *   sm 下拉按鈕 32 高、選項列 28(反方向 28 / 32)。
 *
 * 結束碼:0 = 綠;1 = 產品紅(或 --selftest 的對照組不成立);2 = 這次沒量到 —— 看印出來的標記是哪一種
 *   (儀器失效由本閘印;缺建置 / 建置過時、起不了瀏覽器沿用 lib/launch-browser.mjs 的共用標記與結束碼,本閘不另訂)。
 *
 * 跑法:
 *   node scripts/overlay-density-follows-trigger-invariant.mjs [--static=<dir>]   現況(要綠)
 *   node scripts/overlay-density-follows-trigger-invariant.mjs --selftest         判定表(不開瀏覽器)+ 現況必綠 + 上面七種對照
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import {
  BROWSER_REQUIRED_MARKER, INSTRUMENT_FAIL_MARKER, MISSING_BUILD_MARKER, SKIPPED_ENV_MARKER, STALE_BUILD_MARKER,
  StoryRenderInstrumentError, launchBrowserOrSkip, openStory, parkPointer, requireFreshStorybookBuild, settleAfterInteraction,
} from './lib/launch-browser.mjs'
import { FixtureInstrumentError, startStorybookCssFixture } from './lib/storybook-css-fixture.mjs'
import { StorybookBuildNotStableError } from './lib/storybook-static-snapshot.mjs'

const ROOT = process.cwd()
const staticArg = process.argv.find((a) => a.startsWith('--static='))?.slice('--static='.length)
const S = staticArg ? (staticArg.startsWith('/') ? staticArg : join(ROOT, staticArg)) : join(ROOT, 'storybook-static')
const SELFTEST = process.argv.includes('--selftest')
const GATE_NAME = '浮層密度跟觸發點'

const STORY = 'design-system-tokens-uisize--product-alignment'
const FIXTURE_SOURCE = 'scripts/test-fixtures/overlay-density-regions/fixture.tsx'
const TIERS = ['md', 'lg']
const TIER_NAME = { md: '一般', lg: '大' }
const OVERLAY_DENSITY_TOLERANCE_PX = 0.5
// density.spec.md 情境 1 表 Popover 列(:68):鎖 data-layout-space="md";md 的 --layout-space-loose = 16(tokens/layoutSpace/layoutSpace.css)。
// 這個數字過時(md 的 loose 改了)由 assertPassFloors 以「儀器失效」指出,不會被說成產品紅。
const POPOVER_LOCKED_LOOSE_PX = 16
// 以下三個只是「等不到」的天花板,不是判準:成功一律由元素本身出現 / 版面靜止決定
const OVERLAY_STEP_TIMEOUT_MS = 15000
const OVERLAY_SETTLE_FRAMES = 6
const OVERLAY_SETTLE_CAP_MS = 6000

const SELECT_LABEL = { md: '角色條件(一般密度)', lg: '角色條件(大密度)' }
const inRegion = (tier, kind, rest) => `[data-odt-region="${tier}"] [data-odt-kind="${kind}"] ${rest}`
const regionOf = (tier) => `[data-odt-region="${tier}"]`
// 日期面板不綁文案(對話框的名稱是元件的預設字串):Popover 內容根元素 = popper 包層的直接子元素、role="dialog"
const DATE_DIALOG = '[data-radix-popper-content-wrapper] > [role="dialog"]'
const DAY_CELL = `${DATE_DIALOG} table tbody td:has(button)`
// 夾具頁「畫好了」的訊號:最後一個區塊的最後一種元件(日期單日的觸發欄位)已經在文件裡
const FIXTURE_READY = inRegion('lg', 'date-single', '[role="combobox"]')

/**
 * 種類表(單一住所:哪幾種浮層、在哪裡量、怎麼開怎麼收、量哪幾條;兩個跑法 runStoryCells / runFixtureCells 都照這張表走,加一種 = 加一列)。
 *   target     'story' = uiSize 那一則 story(一格開一次頁);'fixture' = 閘自己的夾具頁(一種整頁密度開一次頁)
 *   inside     這一種要在哪一種「開著的時候」才打得開(子選單在下拉選單裡);沒有的不寫
 *   sizeToken  這一種的控制項大小綁哪一顆 token(--field-height-sm / -md)
 *   checks     量哪幾條(H / A / P / T / L 的定義在 judgeCell)
 *   lock       L 的期望:true = 鎖 md(16);false = 跟那一區;沒有 L 的不寫
 *   square     H 要不要連寬一起比(日期格)
 *   poppers    量的當下畫面上該開著幾個 popper 包層(子選單開著時主選單也開著 = 2)
 *   how        'click' 點 / 'focus' 聚焦(HoverCard、Tooltip:聚焦與滑過走產品同一個開啟函式,聚焦不受指標位置影響)
 *   opener     觸發點的選擇器;ready 浮層內容出現的訊號;measure 要量高(寬)的那個元素;main 子選單要比的主選單列
 *   close      'escape' 按 Esc / 'blur' 讓觸發點失焦;gone 收掉的訊號(這個選擇器從文件消失)
 *   region     那一區的元素(null = 觸發點的父元素;Select 那一則 story 的寫法)
 */
const KINDS = Object.freeze({
  select: {
    name: 'Select', what: '選項列', target: 'story', sizeToken: 'sm', checks: ['H', 'A', 'L'], lock: true, square: false, poppers: 1,
    how: 'click', opener: (tier) => `[aria-label="${SELECT_LABEL[tier]}"]`, ready: '[role=listbox] [role=option]', measure: '[role=listbox] [role=option]', main: null,
    close: 'escape', gone: '[role=listbox]', region: () => null,
  },
  dropdown: {
    name: '下拉選單', what: '選單列', target: 'fixture', sizeToken: 'md', checks: ['H', 'A', 'L'], lock: false, square: false, poppers: 1,
    how: 'click', opener: (tier) => inRegion(tier, 'dropdown', 'button'), ready: '[data-odt-content="dropdown"] [role="menuitem"]', measure: '[data-odt-content="dropdown"] [role="menuitem"]', main: null,
    close: 'escape', gone: '[data-odt-content="dropdown"]', region: regionOf,
  },
  submenu: {
    name: '子選單', what: '子選單列', target: 'fixture', inside: 'dropdown', sizeToken: 'md', checks: ['H', 'P'], square: false, poppers: 2,
    how: 'click', opener: () => '[data-odt-content="dropdown"] [role="menuitem"][aria-haspopup="menu"]', ready: '[data-odt-content="submenu"] [role="menuitem"]', measure: '[data-odt-content="submenu"] [role="menuitem"]', main: '[data-odt-content="dropdown"] [role="menuitem"]',
    close: 'escape', gone: '[data-odt-content="submenu"]', region: regionOf,
  },
  hovercard: {
    name: 'HoverCard', what: '人員卡動作鈕', target: 'fixture', sizeToken: 'sm', checks: ['H', 'L'], lock: false, square: false, poppers: 1,
    how: 'focus', opener: (tier) => inRegion(tier, 'hovercard', '[tabindex="0"]'), ready: '[data-odt-content="hovercard"] button', measure: '[data-odt-content="hovercard"] button', main: null,
    close: 'blur', gone: '[data-odt-content="hovercard"]', region: regionOf,
  },
  tooltip: {
    name: 'Tooltip', what: '提示內容', target: 'fixture', sizeToken: 'sm', checks: ['T', 'L'], lock: false, square: false, poppers: 1,
    how: 'focus', opener: (tier) => inRegion(tier, 'tooltip', 'button'), ready: '[data-odt-content="tooltip"]', measure: '[data-odt-content="tooltip"]', main: null,
    close: 'blur', gone: '[data-odt-content="tooltip"]', region: regionOf,
  },
  'date-range': {
    name: '日期區間', what: '日期格', target: 'fixture', sizeToken: 'sm', checks: ['H', 'L'], lock: true, square: true, poppers: 1,
    how: 'click', opener: (tier) => inRegion(tier, 'date-range', 'button[aria-haspopup="dialog"]'), ready: `${DAY_CELL} button`, measure: DAY_CELL, main: null,
    close: 'escape', gone: DATE_DIALOG, region: regionOf,
  },
  'date-single': {
    name: '日期單日', what: '日期格', target: 'fixture', sizeToken: 'sm', checks: ['H'], square: true, poppers: 1,
    how: 'click', opener: (tier) => inRegion(tier, 'date-single', '[role="combobox"]'), ready: `${DAY_CELL} button`, measure: DAY_CELL, main: null,
    close: 'escape', gone: DATE_DIALOG, region: regionOf,
  },
})
const KIND_IDS = Object.keys(KINDS)
const STORY_KIND_IDS = KIND_IDS.filter((id) => KINDS[id].target === 'story')
/** 夾具上直接打得開的種類(依表的順序);各自開著時再做 inside 指到它的那幾種 */
const FIXTURE_TOP_KIND_IDS = KIND_IDS.filter((id) => KINDS[id].target === 'fixture' && !KINDS[id].inside)
const nestedKindIds = (outerId) => KIND_IDS.filter((id) => KINDS[id].inside === outerId)
const CHECK_NAME = { H: '控制項大小沒跟那一區', A: '跟觸發點不一樣高', P: '子選單跟主選單不同檔', T: '內容裡的密度 token 沒跟那一區', L: '版面間距不對' }

// 既有破法(原封不動):浮層開出來後持續把讀到的控制項檔位拿掉(= 回到「跟整頁」的舊行為)
const SABOTAGE = `(() => {
  const strip = () => document.querySelectorAll('[data-radix-popper-content-wrapper] > [data-ui-size]').forEach((el) => el.removeAttribute('data-ui-size'))
  strip(); new MutationObserver(strip).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ui-size'] })
})()`

/**
 * 破法表(單一住所):每一種「弄壞什麼 → 哪一種浮層的哪一格哪一條該紅」;沒列到的一律必須綠。
 *   mode     'pre-open' 打開前裝好、整趟重開;'in-place' 浮層開著時同一次頁面函式裡「改 → 量 → 還原」;'reparent' 只跑下拉 + 子選單、每格重新載入
 *   applies  這一種破法對哪幾種浮層有意義
 *   red      (kind, kindId, cell) → 該紅的檢查代號
 */
const BREAKS = Object.freeze({
  'ui-size-gone': {
    label: '持續拿掉內容根元素的 data-ui-size(= 回到跟整頁)', mode: 'pre-open',
    applies: () => true,
    red: (kind, _kindId, cell) => (cell.pageTier !== cell.regionTier ? kind.checks.filter((code) => code === 'H' || code === 'A' || code === 'T') : []),
  },
  'lock-gone': {
    label: '鎖不見了、留下讀到的值(popover.tsx 的 data-layout-space="md" 被刪,或被排到讀到的檔位前面)', mode: 'in-place',
    applies: (kind) => kind.checks.includes('L') && kind.lock === true,
    mutate: (cell) => ({ kind: 'attr', name: 'data-layout-space', value: cell.regionTier }),
    red: (_kind, _kindId, cell) => (cell.regionTier === 'lg' ? ['L'] : []),
  },
  'attr-gone': {
    label: 'data-layout-space 整個不見(回到跟整頁)', mode: 'in-place',
    applies: (kind) => kind.checks.includes('L'),
    mutate: () => ({ kind: 'attr', name: 'data-layout-space', value: null }),
    red: (kind, _kindId, cell) => ((kind.lock ? cell.pageTier === 'lg' : cell.pageTier !== cell.regionTier) ? ['L'] : []),
  },
  'forced-md': {
    label: '不該鎖的浮層被硬寫 data-layout-space="md"', mode: 'in-place',
    applies: (kind) => kind.checks.includes('L') && kind.lock === false,
    mutate: () => ({ kind: 'attr', name: 'data-layout-space', value: 'md' }),
    red: (_kind, _kindId, cell) => (cell.regionTier === 'lg' ? ['L'] : []),
  },
  'sub-reparent': {
    label: '子選單的 popper 包層搬到 body(= 子選單被包了 Portal)', mode: 'reparent',
    applies: (_kind, kindId) => kindId === 'dropdown' || kindId === 'submenu',
    red: (_kind, kindId, cell) => (kindId === 'submenu' && cell.pageTier !== cell.regionTier ? ['H', 'P'] : []),
  },
})
const BREAK_IDS = Object.keys(BREAKS)
const TOKEN_UNREADABLE = { kind: 'style', name: '--layout-space-loose', value: 'initial' }
// token-unreadable 在哪幾格做(story 與夾具各一格 = 兩個量測目標都走過一次)
const TOKEN_UNREADABLE_CELLS = [['select', 'md', 'md'], ['dropdown', 'md', 'md']]

class InstrumentFailure extends Error {}
const isInstrumentError = (error) => error instanceof InstrumentFailure || error instanceof StoryRenderInstrumentError
  || error instanceof FixtureInstrumentError || error instanceof StorybookBuildNotStableError

const cellName = (cell) => `整頁 ${cell.pageTier} / ${TIER_NAME[cell.regionTier]}密度區塊`
const whereOf = (kindId, cell) => `${cellName(cell)} · ${KINDS[kindId].name}`
const near = (a, b) => Math.abs(a - b) < OVERLAY_DENSITY_TOLERANCE_PX
const redCodes = (verdict) => Object.keys(verdict).filter((code) => !verdict[code].pass).sort()
/** 一條檢查印出來的那一行(主跑逐條印;--selftest 拿紅的那幾行當「訊息有指名」的例子) */
const checkLine = (kindId, cell, code, verdict) => `${verdict[code].pass ? '✓' : '✗'} ${whereOf(kindId, cell)} | [${code}] ${verdict[code].detail}`
/** 一格在某種破法下的結果:紅了哪幾條 + 那幾條印出來的行 */
const redReport = (kindId, cell, verdict) => {
  const red = redCodes(verdict)
  return { kind: kindId, pageTier: cell.pageTier, regionTier: cell.regionTier, red, lines: red.map((code) => checkLine(kindId, cell, code, verdict)) }
}

/** 量測步驟:這一步裡任何例外(點不到、等不到、頁面函式丟錯)= 沒量到 → 儀器失效,點名哪一步 */
async function step(what, fn) {
  try { return await fn() } catch (error) {
    if (isInstrumentError(error)) throw error
    throw new InstrumentFailure(`${what}:${String(error?.message ?? error).split('\n')[0]}`, { cause: error })
  }
}

/**
 * 純函式:一格的量值 → 每一條檢查 { pass, detail }。量不到(缺元素 / 不是正的有限數 / 浮層數不對 / 整頁密度沒套上)→ 丟 InstrumentFailure。
 * 主跑與 --selftest(判定表、每一種破法)共用這一份。
 */
function judgeCell(kindId, cell, m, { poppers = KINDS[kindId].poppers } = {}) {
  const kind = KINDS[kindId]
  const where = whereOf(kindId, cell)
  if (!m || typeof m !== 'object') throw new InstrumentFailure(`${where}:沒有量測結果`)
  if (m.htmlDensity !== cell.pageTier) throw new InstrumentFailure(`${where}:<html data-density> 是 ${JSON.stringify(m.htmlDensity ?? null)},這一格要的整頁密度是 "${cell.pageTier}"(整頁密度沒套上)`)
  const mustFind = [['target', `要量的元素(${kind.what})`], ['content', '浮層內容根元素(popper 包層的直接子元素)'], ['region', '那一區的元素']]
  if (kind.checks.includes('A')) mustFind.push(['trigger', '觸發點'])
  if (kind.checks.includes('P')) mustFind.push(['main', '主選單的列'])
  for (const [key, label] of mustFind) if (m.found?.[key] !== true) throw new InstrumentFailure(`${where}:找不到${label}`)
  if (m.poppers !== poppers) throw new InstrumentFailure(`${where}:畫面上開著 ${String(m.poppers)} 個浮層,這一格應該正好 ${poppers} 個(上一格沒收乾淨,或這一格沒開成)`)
  const need = (label, value) => {
    if (!(typeof value === 'number' && Number.isFinite(value) && value > 0)) throw new InstrumentFailure(`${where}:${label}量到 ${String(value)}(要是正的有限數;token 讀不到或元素沒有版面)`)
    return value
  }
  const token = `--field-height-${kind.sizeToken}`
  const regionSize = need(`那一區的 ${token} `, m.regionSize)
  const regionLoose = need('那一區的 --layout-space-loose ', m.regionLoose)
  need('整頁的 --layout-space-loose ', m.pageLoose)
  const verdict = {}
  const put = (code, pass, okText, badText) => { verdict[code] = { pass, detail: pass ? okText : badText } }
  if (kind.checks.includes('H') || kind.checks.includes('A') || kind.checks.includes('P')) {
    const targetH = need(`${kind.what}高`, m.targetH)
    if (kind.checks.includes('H')) {
      const targetW = kind.square ? need(`${kind.what}寬`, m.targetW) : null
      const pass = near(targetH, regionSize) && (targetW === null || near(targetW, regionSize))
      const size = targetW === null ? `${kind.what}高 ${targetH}` : `${kind.what}高 ${targetH} × 寬 ${targetW}`
      put('H', pass, `${size} = 那一區的 ${token} ${regionSize}`, `${size} ≠ 那一區的 ${token} ${regionSize}`)
    }
    if (kind.checks.includes('A')) {
      const triggerH = need('觸發點高', m.triggerH)
      put('A', near(targetH, triggerH), `${kind.what}高 ${targetH} = 觸發點高 ${triggerH}`, `${kind.what}高 ${targetH} ≠ 觸發點高 ${triggerH}`)
    }
    if (kind.checks.includes('P')) {
      const mainH = need('主選單列高', m.mainH)
      put('P', near(targetH, mainH), `${kind.what}高 ${targetH} = 主選單列高 ${mainH}`, `${kind.what}高 ${targetH} ≠ 主選單列高 ${mainH}(子選單沒跟主選單同檔)`)
    }
  }
  if (kind.checks.includes('T')) {
    const contentSize = need(`浮層內容裡 ${token} 的計算值`, m.contentSize)
    put('T', near(contentSize, regionSize), `內容裡 ${token} 的計算值 ${contentSize} = 那一區的 ${regionSize}(token 計算值,不是像素)`, `內容裡 ${token} 的計算值 ${contentSize} ≠ 那一區的 ${regionSize}(token 計算值,不是像素)`)
  }
  if (kind.checks.includes('L')) {
    const contentLoose = need('浮層內容的 --layout-space-loose ', m.contentLoose)
    if (kind.lock) {
      put('L', near(contentLoose, POPOVER_LOCKED_LOOSE_PX), `內容的 --layout-space-loose ${contentLoose} = ${POPOVER_LOCKED_LOOSE_PX}(Popover 版面間距鎖 md)`,
        `內容的 --layout-space-loose ${contentLoose},應 ${POPOVER_LOCKED_LOOSE_PX}(Popover 版面間距鎖 md;density.spec.md「浮層跟觸發點」表 Popover 列)`)
    } else {
      put('L', near(contentLoose, regionLoose), `內容的 --layout-space-loose ${contentLoose} = 那一區的 ${regionLoose}(不鎖;token 計算值)`,
        `內容的 --layout-space-loose ${contentLoose} ≠ 那一區的 ${regionLoose}(這一種不鎖,應跟觸發點那一區;token 計算值)`)
    }
  }
  return verdict
}

/**
 * 純函式:一整趟的地板 —— 格數對、兩個區塊真的是兩種密度、兩種整頁密度真的不同、閘寫的鎖定值沒過時。不成立 → 丟 InstrumentFailure。
 * (密度根本沒套上時,每一格都會「相等」而全綠 —— 那是沒量到,不是通過。)
 */
function assertPassFloors(cells, kindIds, passName) {
  const expected = kindIds.length * TIERS.length * TIERS.length
  if (cells.length !== expected) throw new InstrumentFailure(`${passName}:量到 ${cells.length} 格,應該是 ${kindIds.length} 種浮層 × 4 = ${expected} 格`)
  const differs = cells.filter((c) => c.pageTier !== c.regionTier).length
  if (differs * 2 !== expected) throw new InstrumentFailure(`${passName}:「區塊與整頁不同」的格有 ${differs} 個,應該正好一半(${expected / 2})`)
  for (const kindId of kindIds) {
    for (const pageTier of TIERS) {
      const [a, b] = TIERS.map((regionTier) => cells.find((c) => c.kind === kindId && c.pageTier === pageTier && c.regionTier === regionTier))
      if (!a || !b) throw new InstrumentFailure(`${passName}:${KINDS[kindId].name} 在整頁 ${pageTier} 少量了一格`)
      if (near(a.m.regionSize, b.m.regionSize)) throw new InstrumentFailure(`${passName}:${KINDS[kindId].name} 在整頁 ${pageTier} 下,一般密度區塊與大密度區塊讀到同一個 --field-height-${KINDS[kindId].sizeToken}(${a.m.regionSize})—— 區塊密度沒套上`)
      if (near(a.m.regionLoose, b.m.regionLoose)) throw new InstrumentFailure(`${passName}:${KINDS[kindId].name} 在整頁 ${pageTier} 下,一般密度區塊與大密度區塊讀到同一個 --layout-space-loose(${a.m.regionLoose})—— 區塊密度沒套上`)
    }
  }
  const pageLoose = Object.fromEntries(TIERS.map((pageTier) => [pageTier, [...new Set(cells.filter((c) => c.pageTier === pageTier).map((c) => c.m.pageLoose))]]))
  for (const pageTier of TIERS) if (pageLoose[pageTier].length !== 1) throw new InstrumentFailure(`${passName}:整頁 ${pageTier} 的各格讀到不只一個整頁 --layout-space-loose(${pageLoose[pageTier].join(' / ')})`)
  if (near(pageLoose.md[0], pageLoose.lg[0])) throw new InstrumentFailure(`${passName}:整頁一般密度與大密度讀到同一個 --layout-space-loose(${pageLoose.md[0]})—— 整頁密度沒套上`)
  if (!near(pageLoose.md[0], POPOVER_LOCKED_LOOSE_PX)) throw new InstrumentFailure(`${passName}:整頁一般密度的 --layout-space-loose 是 ${pageLoose.md[0]},閘裡寫的「鎖 md」值是 ${POPOVER_LOCKED_LOOSE_PX} —— 閘的常數過時了,L 這一條量不準`)
}

/**
 * 純函式:一種破法實跑的結果(每格實際紅了哪幾條)對期望 —— 回傳不符的說明(空陣列 = 紅的集合正好等於期望的集合)與每種浮層的摘要。
 * runs:[{ kind, pageTier, regionTier, red: [代號], lines?: [紅的那幾條印出來的行] }]
 */
function compareBreak(breakId, runs) {
  const spec = BREAKS[breakId]
  const problems = []
  const summary = []
  for (const kindId of KIND_IDS) {
    const kind = KINDS[kindId]
    const mine = runs.filter((r) => r.kind === kindId)
    if (!spec.applies(kind, kindId)) {
      if (mine.length) problems.push(`對照組「${breakId}」不該對 ${kind.name} 做,卻量到 ${mine.length} 格`)
      continue
    }
    const redCells = []
    const examples = []
    for (const pageTier of TIERS) for (const regionTier of TIERS) {
      const cell = { pageTier, regionTier }
      const hits = mine.filter((r) => r.pageTier === pageTier && r.regionTier === regionTier)
      if (hits.length !== 1) { problems.push(`對照組「${breakId}」${whereOf(kindId, cell)}:量到 ${hits.length} 次,應該正好 1 次`); continue }
      const want = [...spec.red(kind, kindId, cell)].sort()
      const got = [...hits[0].red].sort()
      if (want.join(' ') !== got.join(' ')) problems.push(`對照組「${breakId}」${whereOf(kindId, cell)}:應紅 [${want.join(' ') || '無'}]、實紅 [${got.join(' ') || '無'}]`)
      if (got.length) redCells.push(`${cellName(cell)} [${got.join(' ')}]`)
      if (examples.length === 0) examples.push(...(hits[0].lines ?? []))
    }
    summary.push({ kindId, text: redCells.length ? `${redCells.join('、')};其餘全綠` : '4 格全綠(這一種在這個破法下是對照,必綠)', examples })
  }
  return { problems, summary }
}

/** 儀器失效要印的兩行(第一行一定帶標記:StoryRenderInstrumentError / 建置快照的訊息自己帶,其餘由這裡補) */
function instrumentLines(error) {
  const message = String(error?.message ?? error)
  return [
    `✗ ${message.includes(INSTRUMENT_FAIL_MARKER) ? '' : `${INSTRUMENT_FAIL_MARKER} `}${message}`,
    `✗ ${GATE_NAME}${SELFTEST ? '(selftest)' : ''}:儀器失效 —— 這次沒有量完(exit 2;不是產品裁決,也不算通過)`,
  ]
}

// --selftest 成功時的輸出不可以出現任何機讀標記字樣(lib/gate-selftest-meta.mjs 看到就判儀器失效 / 略過,不看結束碼)。
// selftest 的每一行正常輸出都經過這裡;寫錯當場丟例外,不用等夜間 lane 才發現。訊息只說第幾個,不把字樣本身印出來。
const MACHINE_MARKERS = [INSTRUMENT_FAIL_MARKER, BROWSER_REQUIRED_MARKER, MISSING_BUILD_MARKER, STALE_BUILD_MARKER, SKIPPED_ENV_MARKER,
  'storybook-static missing', 'Run `npm run build-storybook`', 'Failed to launch', 'browserType.launch', "Executable doesn't exist"]
function sayClean(line) {
  const hit = MACHINE_MARKERS.findIndex((marker) => String(line).includes(marker))
  if (hit >= 0) throw new Error(`selftest 的正常輸出不得含機讀標記字樣(標記清單第 ${hit + 1} 個;字樣本身不印)—— meta-test 會把這一行當成標記`)
  console.log(line)
}
const out = SELFTEST ? sayClean : (line) => console.log(line)

// ── 頁面函式(序列化傳入,不得引用外層變數)──────────────────────────────────────────────────────────────────

/**
 * 量一格。同一種量法只有這一份:story 與夾具、現況與每一種就地破法都呼叫它。
 * mutate:量之前就地改浮層內容根元素(attr = 改 / 拿掉屬性;style = 改行內樣式),量完在同一次呼叫裡還原;null = 量現況。
 * token 的量法:在目標元素裡塞一個隱形探針,量 width:var(--token) 的寬(瀏覽器真的算出來的值)。
 */
const measureInPage = ({ trigger, target, region, main, sizeToken, mutate }) => {
  const px = (el, name) => { const p = document.createElement('i'); p.style.cssText = `position:absolute;visibility:hidden;width:var(${name})`; el.appendChild(p); const w = p.getBoundingClientRect().width; p.remove(); return w }
  const triggerEl = trigger ? document.querySelector(trigger) : null
  const targetEl = document.querySelector(target)
  const content = targetEl ? targetEl.closest('[data-radix-popper-content-wrapper] > *') : null
  const wrapper = content ? content.parentElement : null
  const regionEl = region ? document.querySelector(region) : (triggerEl ? triggerEl.parentElement : null)
  const mainEl = main ? document.querySelector(main) : null
  let restore = () => {}
  if (mutate && content) {
    if (mutate.kind === 'attr') {
      const had = content.hasAttribute(mutate.name)
      const old = content.getAttribute(mutate.name)
      if (mutate.value === null) content.removeAttribute(mutate.name); else content.setAttribute(mutate.name, mutate.value)
      restore = () => { if (had) content.setAttribute(mutate.name, old); else content.removeAttribute(mutate.name) }
    } else if (mutate.kind === 'style') {
      const old = content.style.getPropertyValue(mutate.name)
      const priority = content.style.getPropertyPriority(mutate.name)
      content.style.setProperty(mutate.name, mutate.value)
      restore = () => { if (old) content.style.setProperty(mutate.name, old, priority); else content.style.removeProperty(mutate.name) }
    }
  }
  try {
    const rect = targetEl ? targetEl.getBoundingClientRect() : null
    const host = wrapper ? wrapper.parentElement : null
    return {
      found: { trigger: trigger ? Boolean(triggerEl) : null, target: Boolean(targetEl), content: Boolean(content), region: Boolean(regionEl), main: main ? Boolean(mainEl) : null },
      mutated: mutate ? Boolean(content) : null,
      poppers: document.querySelectorAll('[data-radix-popper-content-wrapper]').length,
      wrapperHost: !host ? null : host === document.body ? 'body' : host.closest('[data-radix-popper-content-wrapper]') ? 'overlay' : 'other',
      htmlDensity: document.documentElement.getAttribute('data-density'),
      contentAttrs: content ? { uiSize: content.getAttribute('data-ui-size'), layoutSpace: content.getAttribute('data-layout-space') } : null,
      pageLoose: px(document.body, '--layout-space-loose'),
      regionSize: regionEl ? px(regionEl, `--field-height-${sizeToken}`) : null,
      regionLoose: regionEl ? px(regionEl, '--layout-space-loose') : null,
      triggerH: triggerEl ? triggerEl.getBoundingClientRect().height : null,
      targetH: rect ? rect.height : null,
      targetW: rect ? rect.width : null,
      mainH: mainEl ? mainEl.getBoundingClientRect().height : null,
      contentSize: content ? px(content, `--field-height-${sizeToken}`) : null,
      contentLoose: content ? px(content, '--layout-space-loose') : null,
    }
  } finally { restore() }
}

/** sub-reparent:把某個浮層內容的 popper 包層搬到 body;回報搬之前它在哪、搬完父層是不是真的 body */
const reparentWrapperInPage = (selector) => {
  const inner = document.querySelector(selector)
  const wrapper = inner ? inner.closest('[data-radix-popper-content-wrapper]') : null
  if (!wrapper) return { ok: false, before: null }
  const host = wrapper.parentElement
  const before = host === document.body ? 'body' : host && host.closest('[data-radix-popper-content-wrapper]') ? 'overlay' : 'other'
  document.body.appendChild(wrapper)
  return { ok: wrapper.parentElement === document.body, before }
}

// ── 瀏覽器端的步驟(每一步都包在 step 裡:等不到 / 點不到 = 儀器失效)──────────────────────────────────────────

async function settle(page, where) {
  const s = await step(`${where}:等版面靜止`, () => settleAfterInteraction(page, { frames: OVERLAY_SETTLE_FRAMES, capMs: OVERLAY_SETTLE_CAP_MS }))
  if (!s.ok) throw new InstrumentFailure(`${where}:版面在 ${OVERLAY_SETTLE_CAP_MS / 1000} 秒內沒有連續靜止 ${OVERLAY_SETTLE_FRAMES} 個影格(等了 ${s.framesWaited} 格、期間變動 ${s.lateChanges} 次)`)
}

async function openKind(page, kindId, cell) {
  const kind = KINDS[kindId]
  const where = whereOf(kindId, cell)
  const opener = kind.opener(cell.regionTier)
  const target = page.locator(opener).first()
  await step(`${where}:${kind.how === 'click' ? '點' : '聚焦'}觸發點(${opener})`,
    () => (kind.how === 'click' ? target.click({ timeout: OVERLAY_STEP_TIMEOUT_MS }) : target.focus({ timeout: OVERLAY_STEP_TIMEOUT_MS })))
  // 等浮層內容的元素本身(HoverCard 靠計時器延後才開:靜止判定預設不保證計時器,所以一定等卡片本身)
  await step(`${where}:等浮層內容出現(${kind.ready})`, () => page.waitForSelector(kind.ready, { state: 'visible', timeout: OVERLAY_STEP_TIMEOUT_MS }))
  await settle(page, `${where}:打開後`)
}

async function closeKind(page, kindId, cell) {
  const kind = KINDS[kindId]
  const where = whereOf(kindId, cell)
  await step(`${where}:收掉浮層`,
    () => (kind.close === 'escape' ? page.keyboard.press('Escape') : page.locator(kind.opener(cell.regionTier)).first().blur({ timeout: OVERLAY_STEP_TIMEOUT_MS })))
  await step(`${where}:等浮層收掉(${kind.gone})`, () => page.waitForSelector(kind.gone, { state: 'detached', timeout: OVERLAY_STEP_TIMEOUT_MS }))
}

async function park(page, where) {
  await step(`${where}:把指標停到中性位置`, () => parkPointer(page))
}

function measure(page, kindId, cell, mutate = null) {
  const kind = KINDS[kindId]
  return step(`${whereOf(kindId, cell)}:量測`, () => page.evaluate(measureInPage, {
    trigger: kind.checks.includes('A') ? kind.opener(cell.regionTier) : null,
    target: kind.measure, region: kind.region(cell.regionTier), main: kind.main, sizeToken: kind.sizeToken, mutate,
  }))
}

const MEASURED_NUMBERS = ['pageLoose', 'regionSize', 'regionLoose', 'triggerH', 'targetH', 'targetW', 'mainH', 'contentSize', 'contentLoose']
const sameMeasurement = (a, b) => MEASURED_NUMBERS.every((key) => a[key] === b[key])
  && a.contentAttrs?.uiSize === b.contentAttrs?.uiSize && a.contentAttrs?.layoutSpace === b.contentAttrs?.layoutSpace

/**
 * 浮層已經打開、版面已靜止:量一格、判定、記下來。
 * ctx.inPlace(只有 --selftest 的現況那一趟):同一個開著的浮層上再做每一種就地破法(改 → 量 → 還原,不多開頁),
 * 做完再量一次確認還原乾淨。
 */
async function recordCell(page, ctx, kindId, cell) {
  const kind = KINDS[kindId]
  const where = whereOf(kindId, cell)
  const m = await measure(page, kindId, cell)
  const verdict = judgeCell(kindId, cell, m)
  ctx.cells.push({ kind: kindId, ...cell, m, verdict })
  if (ctx.print) for (const code of kind.checks) out(checkLine(kindId, cell, code, verdict))
  if (!ctx.inPlace) return
  for (const breakId of BREAK_IDS) {
    const spec = BREAKS[breakId]
    if (spec.mode !== 'in-place' || !spec.applies(kind, kindId)) continue
    const broken = await measure(page, kindId, cell, spec.mutate(cell))
    if (broken.mutated !== true) throw new InstrumentFailure(`${where}:對照組「${breakId}」沒有改到浮層內容根元素`)
    ctx.breakRuns[breakId].push(redReport(kindId, cell, judgeCell(kindId, cell, broken)))
  }
  if (TOKEN_UNREADABLE_CELLS.some(([k, p, r]) => k === kindId && p === cell.pageTier && r === cell.regionTier)) {
    const unreadable = await measure(page, kindId, cell, TOKEN_UNREADABLE)
    let outcome
    try {
      const red = redCodes(judgeCell(kindId, cell, unreadable))
      outcome = red.length ? `紅 [${red.join(' ')}]` : '綠'
    } catch (error) {
      if (!(error instanceof InstrumentFailure)) throw error
      outcome = 'instrument'
    }
    ctx.tokenUnreadable.push({ where, outcome, contentLoose: unreadable.contentLoose })
  }
  const again = await measure(page, kindId, cell)
  if (!sameMeasurement(m, again)) throw new InstrumentFailure(`${where}:就地破法還原之後,量值與破之前不同(破法留下了副作用)—— 之前 ${JSON.stringify(m)};之後 ${JSON.stringify(again)}`)
}

/** story 上量的種類(Select:uiSize 那一則 story,一格開一次頁 —— 原本的 4 格) */
async function runStoryCells(page, sv, ctx) {
  for (const kindId of STORY_KIND_IDS) {
    for (const pageTier of TIERS) {
      for (const regionTier of TIERS) {
        const cell = { pageTier, regionTier }
        const where = whereOf(kindId, cell)
        await step(`${where}:開 story`, () => openStory(page, `${sv.origin}/iframe.html?id=${encodeURIComponent(STORY)}&viewMode=story&globals=density:${pageTier}`, {
          settleFrames: OVERLAY_SETTLE_FRAMES, notFound: sv.notFound, waitFor: KINDS[kindId].opener(regionTier),
          beforeSettle: ctx.preOpen ? async (p) => { await p.addScriptTag({ content: ctx.preOpen }) } : null,
        }))
        await openKind(page, kindId, cell)
        await recordCell(page, ctx, kindId, cell)
        await closeKind(page, kindId, cell)
      }
    }
  }
}

async function openFixture(page, fixture, pageTier, preOpen) {
  const where = `夾具(整頁 ${pageTier})`
  await step(`${where}:開頁`, () => openStory(page, fixture.url, {
    waitFor: FIXTURE_READY, settleFrames: OVERLAY_SETTLE_FRAMES, notFound: fixture.notFound, label: `浮層密度夾具(整頁 ${pageTier})`,
    // 整頁密度寫到 <html>(夾具頁預設 md);破法腳本也在靜止判定之前裝好
    beforeSettle: async (p) => {
      await p.evaluate((tier) => document.documentElement.setAttribute('data-density', tier), pageTier)
      if (preOpen) await p.addScriptTag({ content: preOpen })
    },
  }))
  await park(page, where)
}

/** 夾具上量的種類:一種整頁密度開一次頁,兩個區塊依序做 下拉(開著時做子選單)→ HoverCard → Tooltip → 日期區間 → 日期單日 */
async function runFixtureCells(page, fixture, ctx) {
  for (const pageTier of TIERS) {
    await openFixture(page, fixture, pageTier, ctx.preOpen)
    for (const regionTier of TIERS) {
      const cell = { pageTier, regionTier }
      for (const kindId of FIXTURE_TOP_KIND_IDS) {
        await openKind(page, kindId, cell)
        await recordCell(page, ctx, kindId, cell)
        for (const innerId of nestedKindIds(kindId)) {
          await openKind(page, innerId, cell)
          await recordCell(page, ctx, innerId, cell)
          // 子選單的 Esc 只關那一層(dropdown-menu.spec.md「鍵盤操作」表的 Escape 列):一層一層收,每次等那一層消失
          await closeKind(page, innerId, cell)
        }
        await closeKind(page, kindId, cell)
        await park(page, whereOf(kindId, cell))
      }
    }
  }
}

/** sub-reparent:只做下拉 + 子選單;搬過的節點 React 收不掉,所以每格重新載入、不去關它 */
async function runSubReparent(page, fixture) {
  const runs = []
  const cells = []
  for (const pageTier of TIERS) {
    for (const regionTier of TIERS) {
      const cell = { pageTier, regionTier }
      const where = `對照組「sub-reparent」${whereOf('submenu', cell)}`
      await openFixture(page, fixture, pageTier, null)
      await openKind(page, 'dropdown', cell)
      const mainBefore = redCodes(judgeCell('dropdown', cell, await measure(page, 'dropdown', cell)))
      await openKind(page, 'submenu', cell)
      const subBefore = redCodes(judgeCell('submenu', cell, await measure(page, 'submenu', cell)))
      if (mainBefore.length || subBefore.length) throw new InstrumentFailure(`${where}:搬之前就有紅(主選單 [${mainBefore.join(' ') || '無'}]、子選單 [${subBefore.join(' ') || '無'}])—— 這個破法的前提不成立`)
      const moved = await step(`${where}:把子選單的 popper 包層搬到 body`, () => page.evaluate(reparentWrapperInPage, KINDS.submenu.measure))
      if (moved.before !== 'overlay') throw new InstrumentFailure(`${where}:搬之前子選單的包層不在主選單裡(在 ${String(moved.before)})—— 這個破法模擬不了「子選單逃出主選單」`)
      if (!moved.ok) throw new InstrumentFailure(`${where}:子選單的包層沒有真的搬到 body`)
      await settle(page, `${where}:搬完`)
      const sub = await measure(page, 'submenu', cell)
      if (sub.wrapperHost !== 'body') throw new InstrumentFailure(`${where}:量的時候子選單的包層不在 body 底下(在 ${String(sub.wrapperHost)})`)
      const main = await measure(page, 'dropdown', cell)
      const subVerdict = judgeCell('submenu', cell, sub)
      const mainVerdict = judgeCell('dropdown', cell, main, { poppers: KINDS.submenu.poppers })
      cells.push({ kind: 'dropdown', ...cell, m: main, verdict: mainVerdict }, { kind: 'submenu', ...cell, m: sub, verdict: subVerdict })
      runs.push(redReport('dropdown', cell, mainVerdict), redReport('submenu', cell, subVerdict))
    }
  }
  assertPassFloors(cells, ['dropdown', 'submenu'], '對照組「sub-reparent」')
  return runs
}

// ── --selftest:判定表(不開瀏覽器;全部用合成數字)────────────────────────────────────────────────────────────

function runJudgeTable() {
  const failures = []
  let rows = 0
  const check = (ok, name) => { rows += 1; if (!ok) failures.push(name) }
  // 合成數字 = 現行兩檔的值(md:sm 28 / md 32 / loose 16;lg:32 / 36 / 24),只用在這張表,不進任何瀏覽器判定
  const SAMPLE = { md: { sm: 28, md: 32, loose: 16 }, lg: { sm: 32, md: 36, loose: 24 } }
  const healthy = (kindId, cell, over = {}) => {
    const kind = KINDS[kindId]
    const size = SAMPLE[cell.regionTier][kind.sizeToken]
    return {
      found: { trigger: kind.checks.includes('A') ? true : null, target: true, content: true, region: true, main: kind.checks.includes('P') ? true : null },
      poppers: kind.poppers, htmlDensity: cell.pageTier, pageLoose: SAMPLE[cell.pageTier].loose,
      regionSize: size, regionLoose: SAMPLE[cell.regionTier].loose, triggerH: size, targetH: size, targetW: size, mainH: size,
      contentSize: size, contentLoose: kind.lock ? POPOVER_LOCKED_LOOSE_PX : SAMPLE[cell.regionTier].loose, ...over,
    }
  }
  const outcome = (kindId, cell, m, options) => {
    try { return redCodes(judgeCell(kindId, cell, m, options)).join(' ') || '綠' } catch (error) {
      if (!(error instanceof InstrumentFailure)) throw error
      return 'instrument'
    }
  }
  const cellOf = (key) => { const [pageTier, regionTier] = key.split('/'); return { pageTier, regionTier } }
  const ALL_CELLS = ['md/md', 'md/lg', 'lg/md', 'lg/lg']
  const row = (name, kindId, key, over, want, options) => {
    const cell = cellOf(key)
    const got = outcome(kindId, cell, over === null ? null : healthy(kindId, cell, over), options)
    check(got === want, `判定表「${name}」:應 ${want}、實得 ${got}`)
  }

  // (0) 種類表自己:每一種正好被一個跑法走到(story 那一段,或夾具那一段的直接 / 巢狀);巢狀的外層必須是夾具上直接打得開的那一種
  const reached = [...STORY_KIND_IDS, ...FIXTURE_TOP_KIND_IDS.flatMap((id) => [id, ...nestedKindIds(id)])]
  check(reached.length === KIND_IDS.length && [...reached].sort().join() === [...KIND_IDS].sort().join(), `種類表:每一種應該正好被走到一次,實際走到 ${reached.join(' / ')}`)
  for (const kindId of KIND_IDS) {
    check(KINDS[kindId].checks.includes('L') === (typeof KINDS[kindId].lock === 'boolean'), `種類表:${KINDS[kindId].name} 有 L 就要寫 lock(鎖不鎖),沒有 L 就不寫`)
    check(KINDS[kindId].checks.length > 0 && KINDS[kindId].checks.every((code) => code in CHECK_NAME), `種類表:${KINDS[kindId].name} 的檢查代號只能是 ${Object.keys(CHECK_NAME).join(' / ')}`)
  }

  // (1) 每一種 × 每一格的正常形狀 → 全綠
  for (const kindId of KIND_IDS) for (const key of ALL_CELLS) row(`${KINDS[kindId].name} ${key} 正常形狀`, kindId, key, {}, '綠')
  // (2) 修前實測(稽核 R7-02):觸發點 32、那一區 32、選項列 28;反方向 28 / 28 / 32 → H、A 一起紅
  row('Select 修前實測 32 / 32 / 28', 'select', 'md/lg', { targetH: 28 }, 'A H')
  row('Select 修前實測反方向 28 / 28 / 32', 'select', 'lg/md', { targetH: 32 }, 'A H')
  // (3) H 與 A 在頁面上分不開(同一種破法兩條一起紅),各自會不會紅由這兩列證明
  row('Select 列高 = 那一區 ≠ 觸發點 → 只紅 A', 'select', 'md/lg', { triggerH: 28 }, 'A')
  row('Select 列高 = 觸發點 ≠ 那一區 → 只紅 H', 'select', 'md/lg', { targetH: 28, triggerH: 28 }, 'H')
  row('下拉選單 列高 = 那一區 ≠ 觸發鈕 → 只紅 A', 'dropdown', 'lg/md', { triggerH: 36 }, 'A')
  row('下拉選單 列高 = 觸發鈕 ≠ 那一區 → 只紅 H', 'dropdown', 'lg/md', { targetH: 36, triggerH: 36 }, 'H')
  // (4) L:鎖的看 16,不鎖的看那一區
  row('Select 內容 loose 24 → 只紅 L', 'select', 'lg/lg', { contentLoose: 24 }, 'L')
  row('日期區間 內容 loose 24 → 只紅 L', 'date-range', 'md/lg', { contentLoose: 24 }, 'L')
  row('下拉選單(不鎖)大密度區塊、內容 loose 16 → 只紅 L', 'dropdown', 'md/lg', { contentLoose: 16 }, 'L')
  row('HoverCard(不鎖)一般密度區塊、內容 loose 24 → 只紅 L', 'hovercard', 'lg/md', { contentLoose: 24 }, 'L')
  row('Tooltip(不鎖)大密度區塊、內容 loose 16 → 只紅 L', 'tooltip', 'lg/lg', { contentLoose: 16 }, 'L')
  // (5) 子選單:H 與 P 各自會紅
  row('子選單 = 那一區 ≠ 主選單 → 只紅 P', 'submenu', 'md/lg', { mainH: 32 }, 'P')
  row('子選單 = 主選單 ≠ 那一區 → 只紅 H', 'submenu', 'md/lg', { targetH: 32, mainH: 32 }, 'H')
  row('子選單逃出主選單(子 32、主 36、那一區 36)→ H、P 一起紅', 'submenu', 'md/lg', { targetH: 32 }, 'H P')
  // (6) HoverCard / Tooltip / 日期
  row('HoverCard 動作鈕 28、那一區 32 → 紅 H', 'hovercard', 'md/lg', { targetH: 28 }, 'H')
  row('Tooltip 內容裡的 token 28、那一區 32 → 紅 T', 'tooltip', 'md/lg', { contentSize: 28 }, 'T')
  row('日期區間 日期格高對、寬不對 → 紅 H', 'date-range', 'md/lg', { targetW: 28 }, 'H')
  row('日期區間 日期格高不對 → 紅 H', 'date-range', 'lg/md', { targetH: 32 }, 'H')
  row('日期單日 日期格 28、那一區 32 → 紅 H', 'date-single', 'md/lg', { targetH: 28, targetW: 28 }, 'H')
  // (7) 容許值 0.5:差 0.4 綠、差 0.6 紅
  row('HoverCard 動作鈕差 0.4 → 綠', 'hovercard', 'md/md', { targetH: 28.4 }, '綠')
  row('HoverCard 動作鈕差 0.6 → 紅 H', 'hovercard', 'md/md', { targetH: 28.6 }, 'H')
  // (8) 沒量到 → 儀器失效(不是紅、不是綠)
  for (const [label, value] of [['0', 0], ['NaN', Number.NaN], ['null', null], ['負數', -16], ['字串', '16']]) {
    row(`Select 內容 loose 讀到 ${label} → 儀器失效`, 'select', 'md/md', { contentLoose: value }, 'instrument')
    row(`下拉選單 內容 loose 讀到 ${label} → 儀器失效`, 'dropdown', 'md/md', { contentLoose: value }, 'instrument')
  }
  row('那一區的 token 讀到 0 → 儀器失效', 'select', 'md/lg', { regionSize: 0 }, 'instrument')
  row('那一區的 loose 讀到 0 → 儀器失效', 'hovercard', 'md/lg', { regionLoose: 0 }, 'instrument')
  row('整頁的 loose 讀到 0 → 儀器失效', 'date-single', 'md/lg', { pageLoose: 0 }, 'instrument')
  row('選項列高 NaN → 儀器失效', 'select', 'md/md', { targetH: Number.NaN }, 'instrument')
  row('觸發點高 0 → 儀器失效', 'select', 'md/md', { triggerH: 0 }, 'instrument')
  row('主選單列高 null → 儀器失效', 'submenu', 'md/md', { mainH: null }, 'instrument')
  row('日期格寬 0 → 儀器失效', 'date-range', 'md/md', { targetW: 0 }, 'instrument')
  row('Tooltip 內容裡的 token 讀到 0 → 儀器失效', 'tooltip', 'md/md', { contentSize: 0 }, 'instrument')
  for (const key of ['target', 'content', 'region']) row(`缺元素(${key})→ 儀器失效`, 'hovercard', 'md/lg', { found: { trigger: null, target: true, content: true, region: true, main: null, [key]: false } }, 'instrument')
  row('缺觸發點 → 儀器失效', 'select', 'md/lg', { found: { trigger: false, target: true, content: true, region: true, main: null } }, 'instrument')
  row('缺主選單的列 → 儀器失效', 'submenu', 'md/lg', { found: { trigger: null, target: true, content: true, region: true, main: false } }, 'instrument')
  row('開著 0 個浮層 → 儀器失效', 'dropdown', 'md/md', { poppers: 0 }, 'instrument')
  row('開著 2 個浮層(上一格沒收乾淨)→ 儀器失效', 'tooltip', 'md/md', { poppers: 2 }, 'instrument')
  row('子選單那一格只開著 1 個 → 儀器失效', 'submenu', 'md/md', { poppers: 1 }, 'instrument')
  row('主選單在子選單開著時重量(呼叫端指定 2 個)→ 綠', 'dropdown', 'md/lg', { poppers: 2 }, '綠', { poppers: 2 })
  row('整頁密度沒套上(html 是 md、這一格要 lg)→ 儀器失效', 'select', 'lg/md', { htmlDensity: 'md' }, 'instrument')
  row('html 沒有 data-density → 儀器失效', 'dropdown', 'md/md', { htmlDensity: null }, 'instrument')
  row('沒有量測結果 → 儀器失效', 'select', 'md/md', null, 'instrument')

  // (9) 整趟的地板
  const fullPass = (tweak = () => {}) => {
    const cells = []
    for (const kindId of KIND_IDS) for (const key of ALL_CELLS) {
      const cell = cellOf(key)
      const m = healthy(kindId, cell)
      tweak(m, kindId, cell)
      cells.push({ kind: kindId, ...cell, m })
    }
    return cells
  }
  const floors = (cells, kindIds = KIND_IDS) => {
    try { assertPassFloors(cells, kindIds, '判定表'); return '成立' } catch (error) {
      if (!(error instanceof InstrumentFailure)) throw error
      return 'instrument'
    }
  }
  check(floors(fullPass()) === '成立', '地板:28 格正常形狀 → 成立')
  check(floors(fullPass().slice(1)) === 'instrument', '地板:少一格 → 儀器失效')
  check(floors(fullPass().filter((c) => c.kind !== 'tooltip')) === 'instrument', '地板:少一整種 → 儀器失效')
  check(floors(fullPass().filter((c) => c.kind === 'dropdown' || c.kind === 'submenu'), ['dropdown', 'submenu']) === '成立', '地板:只量下拉 + 子選單那一趟(8 格)→ 成立')
  check(floors(fullPass((m, kindId) => { m.regionSize = SAMPLE.md[KINDS[kindId].sizeToken] })) === 'instrument', '地板:兩個區塊讀到同一個控制項 token(區塊密度沒套上)→ 儀器失效')
  check(floors(fullPass((m) => { m.regionLoose = 16 })) === 'instrument', '地板:兩個區塊讀到同一個 loose → 儀器失效')
  check(floors(fullPass((m) => { m.pageLoose = 16 })) === 'instrument', '地板:兩種整頁密度讀到同一個整頁 loose(整頁密度沒套上)→ 儀器失效')
  check(floors(fullPass((m, _k, cell) => { m.pageLoose = cell.pageTier === 'md' ? 20 : 24 })) === 'instrument', '地板:整頁一般密度的 loose 不是閘寫的鎖定值 → 儀器失效')
  check(floors(fullPass((m, kindId, cell) => { if (kindId === 'select' && cell.pageTier === 'lg') m.pageLoose = 23 })) === 'instrument', '地板:同一種整頁密度讀到兩個 loose → 儀器失效')

  // (10) 破法表:哪一種破法對哪一種浮層的哪一格該紅什麼 —— 逐格寫死在這裡,跟 BREAKS 的函式互相對
  const DIFFERS = (codes) => ({ 'md/lg': codes, 'lg/md': codes })
  const REGION_LG = (codes) => ({ 'md/lg': codes, 'lg/lg': codes })
  const PAGE_LG = (codes) => ({ 'lg/md': codes, 'lg/lg': codes })
  const EXPECT = {
    'ui-size-gone': { select: DIFFERS('A H'), dropdown: DIFFERS('A H'), submenu: DIFFERS('H'), hovercard: DIFFERS('H'), tooltip: DIFFERS('T'), 'date-range': DIFFERS('H'), 'date-single': DIFFERS('H') },
    'lock-gone': { select: REGION_LG('L'), 'date-range': REGION_LG('L') },
    'attr-gone': { select: PAGE_LG('L'), 'date-range': PAGE_LG('L'), dropdown: DIFFERS('L'), hovercard: DIFFERS('L'), tooltip: DIFFERS('L') },
    'forced-md': { dropdown: REGION_LG('L'), hovercard: REGION_LG('L'), tooltip: REGION_LG('L') },
    'sub-reparent': { dropdown: {}, submenu: DIFFERS('H P') },
  }
  check(Object.keys(EXPECT).sort().join() === [...BREAK_IDS].sort().join(), `破法表:破法清單應是 ${Object.keys(EXPECT).join(' / ')},實得 ${BREAK_IDS.join(' / ')}`)
  for (const breakId of BREAK_IDS) {
    for (const kindId of KIND_IDS) {
      const applies = BREAKS[breakId].applies(KINDS[kindId], kindId)
      const listed = Boolean(EXPECT[breakId]?.[kindId])
      check(applies === listed, `破法表「${breakId}」× ${KINDS[kindId].name}:應${listed ? '有' : '沒有'}這一組,實得${applies ? '有' : '沒有'}`)
      if (!applies || !listed) continue
      for (const key of ALL_CELLS) {
        const want = EXPECT[breakId][kindId][key] ?? ''
        const got = [...BREAKS[breakId].red(KINDS[kindId], kindId, cellOf(key))].sort().join(' ')
        check(want === got, `破法表「${breakId}」× ${KINDS[kindId].name} ${key}:應紅 [${want || '無'}]、函式回 [${got || '無'}]`)
      }
    }
  }
  // 每一條檢查至少有一種破法會讓它紅(否則那一條的綠燈沒有對照組)
  for (const kindId of KIND_IDS) for (const code of KINDS[kindId].checks) {
    const hit = BREAK_IDS.some((breakId) => BREAKS[breakId].applies(KINDS[kindId], kindId) && ALL_CELLS.some((key) => BREAKS[breakId].red(KINDS[kindId], kindId, cellOf(key)).includes(code)))
    check(hit, `破法表:${KINDS[kindId].name} 的 [${code}] 沒有任何一種破法會讓它紅`)
  }

  // (11) compareBreak:紅的集合 = 期望的集合(多紅、少紅、少量一格都抓得到)
  const exactRuns = (breakId) => {
    const runs = []
    for (const kindId of KIND_IDS) {
      if (!BREAKS[breakId].applies(KINDS[kindId], kindId)) continue
      for (const key of ALL_CELLS) runs.push({ kind: kindId, ...cellOf(key), red: [...BREAKS[breakId].red(KINDS[kindId], kindId, cellOf(key))] })
    }
    return runs
  }
  for (const breakId of BREAK_IDS) check(compareBreak(breakId, exactRuns(breakId)).problems.length === 0, `compareBreak「${breakId}」:實紅 = 期望 → 應該沒有不符`)
  {
    const extra = exactRuns('ui-size-gone'); extra.find((r) => r.kind === 'dropdown' && r.pageTier === 'md' && r.regionTier === 'md').red.push('L')
    check(compareBreak('ui-size-gone', extra).problems.length === 1, 'compareBreak:多紅一條(該綠的格紅了 L)→ 正好指出 1 處')
    const fewer = exactRuns('ui-size-gone'); fewer.find((r) => r.kind === 'tooltip' && r.pageTier === 'md' && r.regionTier === 'lg').red = []
    check(compareBreak('ui-size-gone', fewer).problems.length === 1, 'compareBreak:少紅一條(該紅的 T 沒紅)→ 正好指出 1 處')
    const short = exactRuns('attr-gone').filter((r) => !(r.kind === 'select' && r.pageTier === 'lg' && r.regionTier === 'lg'))
    check(compareBreak('attr-gone', short).problems.length === 1, 'compareBreak:少量一格 → 正好指出 1 處')
    const stray = [...exactRuns('lock-gone'), { kind: 'tooltip', pageTier: 'md', regionTier: 'md', red: [] }]
    check(compareBreak('lock-gone', stray).problems.length === 1, 'compareBreak:對不該做的種類量了一格 → 正好指出 1 處')
    check(compareBreak('sub-reparent', exactRuns('sub-reparent').map((r) => (r.kind === 'dropdown' ? { ...r, red: ['H'] } : r))).problems.length === 4, 'compareBreak:sub-reparent 下主選單 4 格任一格紅都算不符(4 格各 1 處)')
  }

  // (12) 量測步驟的包裝、儀器失效的印法、selftest 輸出的守衛(三者都不印出標記字樣)
  return (async () => {
    const timeout = Object.assign(new Error('page.waitForSelector: Timeout 15000ms exceeded.\nCall log: …'), { name: 'TimeoutError' })
    const wrapped = await step('整頁 md / 一般密度區塊 · Select:等浮層內容出現', () => { throw timeout }).then(() => null, (error) => error)
    check(wrapped instanceof InstrumentFailure && wrapped.message.startsWith('整頁 md / 一般密度區塊 · Select:等浮層內容出現:page.waitForSelector: Timeout 15000ms exceeded.') && !wrapped.message.includes('Call log'),
      '量測步驟:逾時 → 帶步驟名的儀器失效(只留例外第一行)')
    const story = new StoryRenderInstrumentError({ storyId: 'x', kind: 'no-preview', reason: '無預覽' })
    check(await step('開 story', () => { throw story }).then(() => null, (error) => error) === story, '量測步驟:openStory 的儀器失效原樣往外丟(不重包)')
    check(await step('量測', async () => 7) === 7, '量測步驟:沒丟例外 → 原樣回傳')
    const count = (text) => text.split(INSTRUMENT_FAIL_MARKER).length - 1
    check(count(instrumentLines(new InstrumentFailure('找不到觸發點'))[0]) === 1, '儀器失效的印法:本閘的儀器失效 → 第一行補上標記(正好一次)')
    check(count(instrumentLines(story)[0]) === 1, '儀器失效的印法:openStory 的訊息自己帶標記 → 不重複補')
    check(count(instrumentLines(new InstrumentFailure('x'))[1]) === 0 && instrumentLines(new InstrumentFailure('x'))[1].includes('exit 2'), '儀器失效的印法:第二行說明結束碼 2、不是產品裁決')
    for (const [index, marker] of MACHINE_MARKERS.entries()) {
      let thrown = null
      const original = console.log
      console.log = () => {}
      try { sayClean(`對照組成立 ${marker}`) } catch (error) { thrown = error } finally { console.log = original }
      check(thrown instanceof Error && !MACHINE_MARKERS.some((m) => thrown.message.includes(m)), `selftest 輸出守衛:含標記清單第 ${index + 1} 個字樣的行 → 丟例外,而且例外訊息本身不含任何標記字樣`)
    }
    return { failures, rows }
  })()
}

// ── --selftest:假建置子行程(整支閘跑一次;結束碼的對照組)──────────────────────────────────────────────────

function runFakeBuildControl() {
  const dir = mkdtempSync(join(tmpdir(), 'overlay-density-fake-build-'))
  if (!dir || !existsSync(dir)) return { made: false }
  try {
    // 只有一個「無預覽」頁:openStory 第一次輪詢就認得出來(不靠逾時)
    writeFileSync(join(dir, 'iframe.html'), '<!doctype html><html><head><meta charset="utf-8"><title>overlay-density fake build</title></head><body class="sb-show-nopreview"></body></html>\n')
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--static=${dir}`], { cwd: ROOT, encoding: 'utf8' })
    const text = `${child.stdout ?? ''}${child.stderr ?? ''}`
    return {
      made: true, status: child.status, text,
      marked: text.includes(INSTRUMENT_FAIL_MARKER),
      noBrowser: text.includes(SKIPPED_ENV_MARKER) || text.includes(BROWSER_REQUIRED_MARKER),
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

// ── 主流程 ────────────────────────────────────────────────────────────────────────────────────────────────

if (SELFTEST) {
  const table = await runJudgeTable()
  if (table.failures.length) {
    console.log(`✗ 判定表 ${table.failures.length} / ${table.rows} 列不符(純函式,不開瀏覽器):\n  ${table.failures.join('\n  ')}`)
    console.log(`\n✗ ${GATE_NAME}(selftest):判定本身就不對,後面的瀏覽器對照不用跑`)
    process.exit(1)
  }
  out(`✓ 判定表 ${table.rows} 列全部符合(不開瀏覽器:每一條各自會紅、量不到一律判成儀器失效、破法表逐格相符、紅的集合比對抓得到多紅與少紅)`)
}

requireFreshStorybookBuild(S, [
  'packages/design-system/src/lib/overlay-density.tsx',
  'packages/design-system/src/components/Popover/popover.tsx',
  'packages/design-system/src/components/SelectMenu/select-menu.tsx',
  'packages/design-system/src/tokens/uiSize/uiSize.stories.tsx',
  'packages/design-system/src/tokens/uiSize/uiSize.css',
  'packages/design-system/src/tokens/layoutSpace/layoutSpace.css',
  // 夾具用到的元件:夾具量到的是「這次 checkout 的元件原始碼 + 那一份建置的 CSS」,元件比建置新 = 兩半對不上
  'packages/design-system/src/components/DropdownMenu',
  'packages/design-system/src/components/Menu',
  'packages/design-system/src/components/HoverCard',
  'packages/design-system/src/components/Tooltip',
  'packages/design-system/src/components/DatePicker',
  'packages/design-system/src/components/DateGrid',
  'packages/design-system/src/components/ProfileCard',
  'packages/design-system/src/components/Avatar',
  'packages/design-system/src/components/Button/button.tsx',
  'packages/design-system/src/patterns/element-anatomy/item-anatomy.tsx',
])

let sv = null
let br = null
let fixture = null
let instrumentFailure = null
const base = { cells: [], print: true, inPlace: SELFTEST, preOpen: null, tokenUnreadable: [], breakRuns: Object.fromEntries(BREAK_IDS.map((id) => [id, []])) }
const redLines = () => base.cells.flatMap((c) => redCodes(c.verdict).map((code) => ({ code, where: whereOf(c.kind, c) })))
try {
  sv = await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
  br = await launchBrowserOrSkip({}, { cleanup: () => sv.stop() })
  const page = await step('開分頁', () => br.newPage({ viewport: { width: 1280, height: 900 } }))
  // 現況:Select 4 格(story)→ 夾具 24 格。夾具在 story 那一段之後才打包(story 開不起來時不必先打包)
  await runStoryCells(page, sv, base)
  fixture = await startStorybookCssFixture(sv.servedRoot, { source: FIXTURE_SOURCE, label: '浮層密度夾具', title: '浮層密度夾具' })
  await runFixtureCells(page, fixture, base)
  assertPassFloors(base.cells, KIND_IDS, '現況')
  if (SELFTEST && redLines().length === 0) {
    // 對照組 ui-size-gone:整趟重開(打開前裝好),不印逐格、只收每格實際紅了哪幾條
    const stripped = { cells: [], print: false, inPlace: false, preOpen: SABOTAGE, tokenUnreadable: [], breakRuns: base.breakRuns }
    await runStoryCells(page, sv, stripped)
    await runFixtureCells(page, fixture, stripped)
    assertPassFloors(stripped.cells, KIND_IDS, '對照組「ui-size-gone」')
    base.breakRuns['ui-size-gone'] = stripped.cells.map((c) => redReport(c.kind, c, c.verdict))
    base.breakRuns['sub-reparent'] = await runSubReparent(page, fixture)
  }
} catch (error) {
  // 閘自己的程式錯照舊往外丟(下面的 finally 先收尾);只有「沒量到」走儀器失效的出口
  if (!isInstrumentError(error)) throw error
  instrumentFailure = error
} finally {
  await br?.close().catch(() => null)
  await fixture?.stop().catch(() => null)
  await sv?.stop().catch(() => null)
}

if (instrumentFailure) {
  for (const line of instrumentLines(instrumentFailure)) console.error(line)
  process.exit(2)
}

const red = redLines()
const checkCount = base.cells.reduce((n, c) => n + Object.keys(c.verdict).length, 0)
const redSummary = () => Object.keys(CHECK_NAME).filter((code) => red.some((r) => r.code === code))
  .map((code) => `[${code}] ${red.filter((r) => r.code === code).length} 條 ${CHECK_NAME[code]}`).join(';')

if (!SELFTEST) {
  if (red.length) { console.log(`\n✗ ${GATE_NAME}:${base.cells.length} 格 ${checkCount} 條裡 ${red.length} 條不符 —— ${redSummary()}(逐條見上面的 ✗)`); process.exit(1) }
  console.log(`\n✅ ${GATE_NAME}:${KIND_IDS.length} 種浮層 × 4 格 = ${base.cells.length} 格、${checkCount} 條全部符合(控制項大小 = 那一區的值;鎖 md 的版面間距 ${POPOVER_LOCKED_LOOSE_PX}、不鎖的跟那一區)`)
  process.exit(0)
}

// ── --selftest 的收尾:現況必綠 → 每一種破法「紅的集合 = 期望的集合」→ 兩種「必須判成儀器失效」的對照 ──────────
if (red.length) {
  console.log(`\n✗ ${GATE_NAME}(selftest):前提不成立 —— 未破壞的頁面就紅(${redSummary()});對照組紅了也不代表什麼,先修現況`)
  process.exit(1)
}
out(`✓ 現況:${base.cells.length} 格、${checkCount} 條全綠(對照組的前提成立)`)

const problems = []
for (const breakId of BREAK_IDS) {
  const { problems: mismatches, summary } = compareBreak(breakId, base.breakRuns[breakId])
  if (mismatches.length) { problems.push(...mismatches); continue }
  for (const s of summary) {
    out(`✓ 對照組「${breakId}」${BREAKS[breakId].label} · ${KINDS[s.kindId].name}:紅 = 期望 —— ${s.text}`)
    // 紅的那一格實際印出來的行(每種各舉第一格):看得到訊息有指名哪一格、哪一條、量到多少
    for (const line of s.examples) out(`    例 ${line}`)
  }
}

if (base.tokenUnreadable.length !== TOKEN_UNREADABLE_CELLS.length) problems.push(`對照組「token-unreadable」應該做 ${TOKEN_UNREADABLE_CELLS.length} 格,實際做了 ${base.tokenUnreadable.length} 格`)
for (const t of base.tokenUnreadable) {
  if (t.outcome === 'instrument') out(`✓ 對照組「token-unreadable」${t.where}:內容的 --layout-space-loose 讀到 ${t.contentLoose} → 判成沒量到(不是 L 紅,也不是綠)`)
  else problems.push(`對照組「token-unreadable」${t.where}:內容的 --layout-space-loose 讀到 ${t.contentLoose},卻被判成「${t.outcome}」—— 應該判成儀器失效`)
}

// 假建置:自己的瀏覽器已經關了才跑(同一時間只有一個 Chromium)
const fake = runFakeBuildControl()
if (!fake.made) problems.push('對照組(假建置):暫存目錄建立失敗,這一格沒有跑')
else if (fake.noBrowser) {
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER} 對照組(假建置):子行程起不了瀏覽器(本行程剛剛起得來)—— 這一格沒量到\n${fake.text}`)
  console.error(`✗ ${GATE_NAME}(selftest):儀器失效 —— 這次沒有量完(exit 2;不是產品裁決,也不算通過)`)
  process.exit(2)
} else if (fake.status === 2 && fake.marked) out('✓ 對照組(假建置):整支閘吃一份只有「無預覽」頁的建置 → 以儀器失效的標記與結束碼 2 結束(不是通過,也不是產品紅)')
else problems.push(`對照組(假建置):整支閘吃一份只有「無預覽」頁的建置,應該以儀器失效的標記與結束碼 2 結束;實得結束碼 ${String(fake.status)}、輸出${fake.marked ? '有' : '沒有'}標記。子行程輸出:\n${fake.text}`)

if (problems.length) { console.log(`\n✗ ${GATE_NAME}(selftest):\n  ${problems.join('\n  ')}\n  —— 量具沒有在該紅的地方紅(或紅到不該紅的地方),綠燈不能當證據`); process.exit(1) }
out('\n✓ selftest 通過:判定表、現況、五種破法的紅集合、兩種「必須判成沒量到」的對照全部成立')
process.exit(0)
