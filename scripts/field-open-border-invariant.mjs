#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 欄位自己的浮層開著時,外框**畫出來的顏色**就是它聚焦時的顏色 —— 一般欄位 = --primary、驗證錯誤的欄位 = --error(不是 error-hover);
 *        而且只認欄位**自己的**浮層(規則住 field.spec.md「Field state machine」表,2026-11-12 AI 建議、user 採納,原話「我覺得可以照你建議」;
 *        樣式住 components/Field/field-wrapper.tsx,記號 `data-field-open` 的唯一寫入者住 lib/composite-field-focus.ts,各欄位外框自己掛)。量的是 getComputedStyle 的四邊 border-*-color
 *        (併排欄位組另量四邊中點的像素),不是量屬性在不在;期望色從頁面上的 token 取(--primary / --error 在欄位所在位置算出來的值),不寫死。
 *        F 欄位矩陣(19 種 × 滑鼠點開 / 鍵盤打開 = 38 格):Select(不可搜尋 / 可搜尋)、Combobox(多選;浮層內搜尋;欄位內搜尋)、
 *          PeoplePicker(單人 / 多人)、DatePicker(不可打字 / 可打字)、日期區間、TimePicker,各自的一般與驗證錯誤。每格:
 *          K0(鍵盤那一格)Tab 進來還沒開 → 期望色(同一個欄位「鍵盤聚焦、沒開」當基準,證明 token 取值與欄位真的畫的是同一個顏色);
 *          O1 開著、滑鼠在空白處 / O2 開著、滑鼠停在欄位上 / O3 開著、滑鼠停在浮層裡 → 四邊 = 期望色;
 *          C1 關掉並離開欄位 → 四邊回到開之前靜止時的顏色。
 *        N 表格格內(無框款)Select / DatePicker:點進編輯(浮層跟著開)→ O1–O3 同上;關掉後格子上不留那個顏色的框。
 *        G 併排欄位組中間那一格開著、滑鼠在空白處:四邊 computed = --primary,而且四邊中點**像素**也是(沒被鄰居蓋住)。
 *          「開著時滑過左 / 右鄰居,共用那條線是什麼顏色」只印數字、不判紅(那一題待 user 決定,目前沒有規定)。
 *        X 外面包一層浮層、直接把欄位當觸發點(夾具:導覽提示 × Select、Popover × 日期區間、Tooltip × TimePicker):
 *          X1 外面那層開著、欄位自己沒開 → 外框 = 開之前靜止時的顏色(不是 --primary);X2 同一個欄位自己的浮層開著 → --primary。
 *        Z 欄位裡的小按鈕開選單(FileViewer 縮放):選單開著 → 外框 = 開之前的顏色。
 *        每次量色前先等版面靜止(settleAfterInteraction),再等四邊顏色連 3 幀同值、宿主沒有進行中的過渡(transition-colors 含 border-color)。
 *   紅: 沒有這條規則的建置(c55c3786:開著 = hover 灰框 / error-hover;2026-11-13 實跑 192 列裡 83 列紅)→ 開著而焦點不在欄位裡的 O 列(夾具的驗證錯誤三種欄位除外:
 *        夾具是這次的原始碼配舊 CSS,只有滑鼠停在欄位上那一列 O2 紅)、表格格內兩格、G 的 computed 與像素列、夾具的 X2 列紅;焦點留在欄位裡的格(靠 focus-within)與 K0 / C1 / X1 / Z 綠。
 *        `--selftest` 在真建置上跑四種破法,每一列照表該紅的紅、該綠的綠,破法拿掉之後同一格當場回綠:
 *        (a) css:開著的框改回 hover 色(--border-hover / --error-hover)→ 全部 O 列、G 的 computed 與像素、X2 紅;K0 / C1 / X1 / Z 綠。
 *        (b) mark:記號一出現就拿掉(= 元件漏接記號)→ 開著而焦點不在欄位裡的 O 列紅(錯誤欄位只有滑鼠停在欄位上那一列紅 —— 靜止時本來就是 --error);
 *            焦點留在欄位裡的格(可搜尋的 Select、欄位內搜尋、滑鼠點開的可打字 DatePicker)靠 focus-within 照樣是期望色 → 綠。
 *        (c) reach:外框改認通用的 data-state="open" / 裡面任何開著的東西 → X1(導覽提示、Popover)與 Z 紅;Tooltip 的 X1(值是 instant-open)、
 *            全部 X2 與對照的欄位格綠。
 *        (d) stack:併排欄位組裡開著的那格不再浮到鄰居上面 → G 的像素列紅、computed 列綠(證明像素列量的是「有沒有被蓋住」)。
 *        找不到欄位 / 浮層沒開 / 滑鼠不在該在的地方 / 顏色一直在變 / 實際量的列數 ≠ 排定的列數 = INSTRUMENT-FAIL(exit 2),不當成通過也不當成紅。
 *   綠: 有這條規則的建置全部相符;重複跑同一份建置結果相同(每一格重新開頁、等的是值穩定不是固定毫秒,機器慢只會等久一點 ——
 *        `--cpu-throttle=6` 把頁面 CPU 放慢 6 倍重跑,列數與結果必須與不放慢時相同)。
 *   node scripts/field-open-border-invariant.mjs [--build=<storybook 建置目錄>] [--selftest] [--cpu-throttle=<倍數>]
 *
 * 夾具(scripts/test-fixtures/field-open-border/fixture.tsx,由 lib/storybook-css-fixture.mjs 打包):X 三格與「驗證錯誤 × 可搜尋的 Select /
 * 可打字的 DatePicker / 日期區間」三種欄位 —— 前者不該寫成 story、後者展示頁湊不出來(理由寫在夾具檔頭)。夾具列量到的是
 * 「這次 checkout 的元件原始碼 + 指定建置的 CSS」;其餘各列量的是指定建置裡的 story。
 */
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import {
  INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, ownSurfacePosition, parkPointer,
  requireFreshStorybookBuild, requireStorybookBuild, settleAfterInteraction,
} from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { FixtureInstrumentError, startStorybookCssFixture } from './lib/storybook-css-fixture.mjs'

const STARTED_AT = Date.now()
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
const buildArg = process.argv.find((a) => a.startsWith('--build='))?.slice('--build='.length)
const throttleArg = process.argv.find((a) => a.startsWith('--cpu-throttle='))?.slice('--cpu-throttle='.length)
const CPU_THROTTLE = throttleArg === undefined ? 1 : Number(throttleArg)
if (!Number.isFinite(CPU_THROTTLE) || CPU_THROTTLE < 1) { console.error(`✗ --cpu-throttle 要是 ≥ 1 的數字,實得 ${JSON.stringify(throttleArg)}`); process.exit(1) }
const STATIC = buildArg ? (isAbsolute(buildArg) ? buildArg : join(process.cwd(), buildArg)) : join(REPO, 'storybook-static')
const FIXTURE_SOURCE = 'scripts/test-fixtures/field-open-border/fixture.tsx'
requireStorybookBuild(join(STATIC, 'index.json'))
if (!buildArg) {
  requireFreshStorybookBuild(STATIC, [
    'packages/design-system/src/components/Field', 'packages/design-system/src/lib/composite-field-focus.ts',
    'packages/design-system/src/components/FieldControlGroup', 'packages/design-system/src/components/SelectMenu',
    'packages/design-system/src/components/Select', 'packages/design-system/src/components/Combobox', 'packages/design-system/src/components/PeoplePicker',
    'packages/design-system/src/components/DatePicker', 'packages/design-system/src/components/TimePicker',
  ])
}

// ── 要量的格子(盤點出來的;找不到 = 儀器失效,不是「少量幾格也算過」)──────────────────────────────────
const HOST_EDIT = '[data-field-mode="edit"]:not([data-field-orientation])'
const story = (name) => `design-system-components-${name}`
/** 欄位矩陣:一列 = 一種欄位 × 一般 / 驗證錯誤;每列跑「滑鼠點開」「鍵盤打開」兩格。key = Tab 進來之後打開浮層的鍵(各元件自己支援的) */
const FIELDS = [
  { kind: 'Select(不可搜尋)', error: false, story: story('select-展示--modes'), nth: 0, key: 'ArrowDown' },
  { kind: 'Select(不可搜尋)', error: true, story: story('select-展示--with-error'), nth: 0, key: 'ArrowDown' },
  { kind: 'Select(可搜尋)', error: false, story: story('select-展示--searchable'), nth: 0, key: 'ArrowDown' },
  { kind: 'Select(可搜尋)', error: true, fixture: 'error-select-searchable', key: 'ArrowDown' },
  { kind: 'Combobox(多選)', error: false, story: story('combobox-展示--modes'), nth: 0, key: 'ArrowDown' },
  { kind: 'Combobox(多選)', error: true, story: story('combobox-展示--with-error'), nth: 0, key: 'ArrowDown' },
  { kind: 'Combobox(多選,浮層內搜尋)', error: false, story: story('combobox-展示--searchable'), nth: 0, key: 'ArrowDown' },
  { kind: 'Combobox(多選,欄位內搜尋)', error: false, story: story('combobox-展示--searchable'), nth: 1, key: 'ArrowDown' },
  { kind: 'PeoplePicker(單人)', error: false, story: story('peoplepicker-展示--single'), nth: 0, key: 'ArrowDown' },
  { kind: 'PeoplePicker(單人)', error: true, story: story('peoplepicker-展示--with-error'), nth: 0, key: 'ArrowDown' },
  { kind: 'PeoplePicker(多人)', error: false, story: story('peoplepicker-展示--multi'), nth: 0, key: 'ArrowDown' },
  { kind: 'DatePicker(不可打字)', error: false, story: story('datepicker-展示--default'), nth: 0, key: 'Enter' },
  { kind: 'DatePicker(不可打字)', error: true, story: story('datepicker-展示--with-error'), nth: 0, key: 'Enter' },
  { kind: 'DatePicker(可打字)', error: false, story: story('datepicker-展示--typed-input'), nth: 0, key: 'ArrowDown' },
  { kind: 'DatePicker(可打字)', error: true, fixture: 'error-date-typeable', key: 'ArrowDown' },
  { kind: '日期區間', error: false, story: story('datepicker-展示--range-picker'), nth: 0, key: 'Enter' },
  { kind: '日期區間', error: true, fixture: 'error-date-range', key: 'Enter' },
  { kind: 'TimePicker', error: false, story: story('timepicker-展示--modes'), nth: 0, key: 'ArrowDown' },
  { kind: 'TimePicker', error: true, story: story('timepicker-展示--with-error'), nth: 0, key: 'ArrowDown' },
]
const NAKED_STORY = story('datatable-展示--inline-edit')
const NAKED = [
  { kind: '表格格內 Select(無框款)', col: 'category' },
  { kind: '表格格內 DatePicker(無框款)', col: 'releaseDate' },
]
const GROUP_STORY = story('fieldcontrolgroup-展示--filter-row')
/** reachRed:外面那層開著時,欄位外框上的 data-state 會不會是 "open"(Tooltip 寫的是 instant-open,破法 (c) 選不到它) */
const WRAPPED = [
  { kind: '導覽提示 × Select', cell: 'wrap-coachmark-select', reachRed: true },
  { kind: 'Popover × 日期區間', cell: 'wrap-popover-range', reachRed: true },
  { kind: 'Tooltip × TimePicker', cell: 'wrap-tooltip-time', reachRed: false },
]
const INNER_STORY = story('fileviewer-展示--open-snapshot')
// 破法 (c) 的對照格:量的是「一般的欄位格不受這個破法影響」(一般與驗證錯誤各一種)
const REACH_CONTROLS = FIELDS.filter((field) => field.kind === 'Select(不可搜尋)')

// ── 判定與計數 ────────────────────────────────────────────────────────────────────────
let failCount = 0
let instrumentFail = false
let planned = 0
let judged = 0
const seen = {} // mode → { red: 應紅且真的紅, redWant: 應紅, green: 應綠且真的綠, greenWant: 應綠 }
class InstrumentError extends Error {}
const instrument = (name, detail) => { instrumentFail = true; console.log(`✗ ${INSTRUMENT_FAIL_MARKER} ${name} | ${detail}`) }

/**
 * 每一列在各種跑法下該紅還是該綠。family:
 *   open    開著的欄位該是期望色的列(O1–O3、表格格內、併排的 computed、X2)
 *   pixel   併排欄位組四邊中點的像素
 *   foreign 不該變色的列(X1 外面那層開著、Z 欄位裡的小按鈕開選單)
 *   closed  沒開浮層的列(K0、C1)/ restore 破法拿掉之後當場重量
 * 表的來源(不是猜的,field-wrapper.tsx fieldDefaultChromeCompounds 的 class):一般欄位沒有記號時只剩 `focus-within:!border-primary` →
 * 焦點在欄位裡才是 --primary;錯誤欄位靜止就是 `border-error`、`hover:border-error-hover`、`focus-within:!border-error` →
 * 沒有記號時只有「滑鼠停在欄位上而且焦點不在欄位裡」才不是 --error。
 */
function expectOf(mode, family, { m, error = false, reachRed = false } = {}) {
  if (mode === 'real' || family === 'closed' || family === 'restore') return 'green'
  if (family === 'foreign') return mode === 'reach' && reachRed ? 'red' : 'green'
  if (family !== 'open' && family !== 'pixel') throw new TypeError(`expectOf:未知的 family ${family}`)
  if (mode === 'css' || (mode === 'stack' && family === 'pixel')) return 'red'
  if (mode === 'mark') return (error ? (m.fw || !m.hover) : m.fw) ? 'green' : 'red'
  return 'green'
}
const check = (mode, name, pass, detail, expect) => {
  judged += 1
  const wantRed = expect === 'red'
  const ok = wantRed ? !pass : pass
  const tally = (seen[mode] ??= { red: 0, redWant: 0, green: 0, greenWant: 0 })
  if (wantRed) { tally.redWant += 1; if (ok) tally.red += 1 } else { tally.greenWant += 1; if (ok) tally.green += 1 }
  const tag = mode === 'real' ? '' : `[${mode}${wantRed ? ' 應紅' : ' 應綠'}] `
  console.log(`${ok ? '✓' : '✗'} ${tag}${name}${detail ? ` | ${detail}` : ''}`)
  if (!ok) failCount++
}

// ── 啟動:建置快照、夾具、瀏覽器 ──────────────────────────────────────────────────────────
const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html', snapshot: true })
let fixture
try {
  fixture = await startStorybookCssFixture(server.servedRoot, { source: FIXTURE_SOURCE, label: '欄位開啟外框夾具', title: '欄位開啟外框夾具' })
} catch (error) {
  await server.stop()
  if (!(error instanceof FixtureInstrumentError)) throw error
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER} ${error.message}(${FIXTURE_SOURCE})—— 夾具掛不起來是儀器失效,不是產品裁決`)
  process.exit(2)
}
const stopServers = async () => { await fixture.stop(); await server.stop() }
const browser = await launchBrowserOrSkip({}, { cleanup: stopServers })
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 })
const page = await context.newPage()
// --cpu-throttle=<倍數>:把頁面的 CPU 放慢(CDP),用來證明「機器慢的時候還會綠」——等的都是訊號(版面靜止、顏色連 3 幀同值),不是固定毫秒
if (CPU_THROTTLE > 1) {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })
  console.log(`CPU 放慢 ${CPU_THROTTLE} 倍(--cpu-throttle)`)
}

// ── 頁面端函式(evaluate 序列化傳入,不得引用外部變數)────────────────────────────────────────
/** 等四邊框色連 3 幀同值、宿主沒有進行中的過渡,再回報 */
const measureInPage = (hostSel) => new Promise((resolve) => {
  const h = document.querySelector(hostSel)
  if (!h) { resolve({ error: '欄位不見了' }); return }
  const SIDES = ['top', 'right', 'bottom', 'left']
  const read = () => { const cs = getComputedStyle(h); return SIDES.map((s) => ({ color: cs.getPropertyValue(`border-${s}-color`), width: cs.getPropertyValue(`border-${s}-width`), style: cs.getPropertyValue(`border-${s}-style`) })) }
  let last = null; let same = 0; let n = 0
  const tick = () => {
    const sides = read()
    const now = sides.map((s) => `${s.color} ${s.width} ${s.style}`).join('|')
    const moving = h.getAnimations().some((a) => a.playState === 'running')
    same = now === last && !moving ? same + 1 : 0; last = now; n += 1
    if (same >= 3) {
      const a = document.activeElement
      resolve({ sides, hover: h.matches(':hover'), fw: h.matches(':focus-within'), mark: h.hasAttribute('data-field-open'), state: h.getAttribute('data-state'),
        z: getComputedStyle(h).zIndex, active: a ? `${a.tagName.toLowerCase()}${a.getAttribute('role') ? `[role=${a.getAttribute('role')}]` : ''}` : '(無)' })
    } else if (n > 180) resolve({ error: `外框 180 幀一直在變(最後 ${now})` })
    else requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
/** 在欄位所在的位置把 token 算成顏色(深色區的值不一樣,所以探針掛在宿主裡面;量完當場拿掉) */
const tokensInPage = (hostSel) => {
  const h = document.querySelector(hostSel)
  const p = document.createElement('span')
  p.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden'
  h.appendChild(p)
  const out = {}
  for (const name of ['--primary', '--error', '--border', '--border-hover', '--error-hover']) { p.style.color = `var(${name})`; out[name] = getComputedStyle(p).color }
  p.remove()
  return out
}
/** 浮層真的開了嗎(不靠記號):aria-expanded + Radix 浮層容器;own = 不是外面那層的浮層,ext = 夾具裡外面那層 */
const evidenceInPage = (hostSel) => {
  const h = document.querySelector(hostSel)
  if (!h) return { expanded: false, own: 0, ext: 0, spot: null }
  const wrappers = [...document.querySelectorAll('[data-radix-popper-content-wrapper]')]
  const isExt = (w) => !!w.querySelector('[data-fob-ext-content]')
  const own = wrappers.filter((w) => !isExt(w))
  // 欄位自己的浮層:先照 aria-controls 找(外面那層的 aria-controls 也可能落在外框上,所以排除外面那層),找不到就取最後開的那一個
  const controlled = [h, ...h.querySelectorAll('[aria-controls]')].map((n) => document.getElementById(n.getAttribute('aria-controls') || '')?.closest('[data-radix-popper-content-wrapper]')).find((w) => w && !isExt(w))
  const popup = controlled || own[own.length - 1] || null
  let spot = null
  if (popup) {
    const r = popup.getBoundingClientRect()
    const xs = [0.5, 0.3, 0.7, 0.15, 0.85].map((f) => r.left + r.width * f)
    const ys = [0.5, 0.3, 0.7, 0.15, 0.85].map((f) => r.top + r.height * f)
    outer: for (const y of ys) for (const x of xs) {
      if (x < 1 || y < 1 || x > innerWidth - 2 || y > innerHeight - 2) continue
      const hit = document.elementFromPoint(x, y)
      if (hit && popup.contains(hit)) { spot = { x, y }; break outer }
    }
  }
  return { expanded: h.matches('[aria-expanded="true"]') || !!h.querySelector('[aria-expanded="true"]'), own: own.length, ext: wrappers.length - own.length, spot }
}
/**
 * 對照組的破法(--selftest):用行內 !important 蓋(Tailwind 的 utilities 在 @layer 裡,一般樣式表的 !important 贏不了分層的 !important)。
 * window.__fobBreakStop() = 拿掉破法並把動過的東西還原。
 */
const installBreakInPage = (mode) => {
  const hosts = () => [...document.querySelectorAll('[data-field-mode]')]
  const force = (h, value) => { h.style.setProperty('border-color', value, 'important'); h.setAttribute('data-fob-forced', '') }
  const release = (h) => { if (h.hasAttribute('data-fob-forced')) { h.style.removeProperty('border-color'); h.removeAttribute('data-fob-forced') } }
  let apply = null
  let filter = []
  if (mode === 'css') {
    // (a) 開著的框改回 hover 色
    filter = ['data-field-open']
    apply = () => hosts().forEach((h) => (h.hasAttribute('data-field-open') ? force(h, h.hasAttribute('data-error') ? 'var(--error-hover)' : 'var(--border-hover)') : release(h)))
  } else if (mode === 'mark') {
    // (b) 記號一出現就拿掉(元件漏接記號)
    filter = ['data-field-open']
    apply = () => document.querySelectorAll('[data-field-open]').forEach((h) => { h.removeAttribute('data-field-open'); h.setAttribute('data-fob-stripped', '') })
  } else if (mode === 'reach') {
    // (c) 外框改認通用的 data-state="open" / 裡面任何開著的東西
    filter = ['data-state', 'aria-expanded']
    apply = () => hosts().forEach((h) => {
      if (h.hasAttribute('data-error')) return
      const on = h.getAttribute('data-state') === 'open' || !!h.querySelector('[data-state="open"], [aria-expanded="true"]')
      if (on) force(h, 'var(--primary)'); else release(h)
    })
  } else if (mode === 'stack') {
    // (d) 併排欄位組裡開著的那格不再浮到鄰居上面
    filter = ['data-field-open']
    apply = () => document.querySelectorAll('[data-field-control-group] > *').forEach((k) => {
      if (k.hasAttribute('data-field-open')) { k.style.setProperty('z-index', '2', 'important'); k.setAttribute('data-fob-forced-z', '') }
      else if (k.hasAttribute('data-fob-forced-z')) { k.style.removeProperty('z-index'); k.removeAttribute('data-fob-forced-z') }
    })
  } else throw new Error(`未知的破法 ${mode}`)
  const observer = new MutationObserver(apply)
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: filter })
  apply()
  window.__fobBreakStop = () => {
    observer.disconnect()
    hosts().forEach(release)
    document.querySelectorAll('[data-fob-forced-z]').forEach((k) => { k.style.removeProperty('z-index'); k.removeAttribute('data-fob-forced-z') })
    // 記號:只還給現在真的開著的(拿掉之後浮層若已關,React 不會再寫它,也就不該還)
    document.querySelectorAll('[data-fob-stripped]').forEach((h) => { h.removeAttribute('data-fob-stripped'); h.setAttribute('data-field-open', '') })
    return true
  }
}

// ── 量測流程共用 ──────────────────────────────────────────────────────────────────────
const HOST = '[data-fob-host]'
const TOKEN_NAMES = ['--primary', '--error', '--border', '--border-hover', '--error-hover']
let tokens = {}
const nameOf = (color) => { const t = TOKEN_NAMES.find((n) => tokens[n] === color); return t ? `${t} ${color}` : color }
const colorsOf = (m) => m.sides.map((s) => s.color)
const all4 = (m, color) => m.sides.every((s) => s.color === color && parseFloat(s.width) > 0 && s.style !== 'none' && s.style !== 'hidden')
const sameAs = (m, rest) => colorsOf(m).every((c, i) => c === rest[i]) && m.sides.every((s) => parseFloat(s.width) > 0)
const show = (m) => {
  const c = colorsOf(m)
  const sides = c.every((x) => x === c[0]) ? `四邊 ${nameOf(c[0])}` : `上 ${nameOf(c[0])} / 右 ${nameOf(c[1])} / 下 ${nameOf(c[2])} / 左 ${nameOf(c[3])}`
  return `${sides}(${m.sides[0].width});滑鼠在欄位上=${m.hover} 焦點在欄位裡=${m.fw}(焦點 ${m.active}) 記號=${m.mark ? '有' : '無'} data-state=${m.state}`
}

async function settle(what) {
  const s = await settleAfterInteraction(page, { frames: 6, capMs: 8000 })
  if (!s.ok) throw new InstrumentError(`${what}:8 秒內版面沒有連續靜止 6 格(等了 ${s.framesWaited} 格,變動 ${s.lateChanges} 次)`)
}
async function measure(what) {
  await settle(what)
  const m = await page.evaluate(measureInPage, HOST)
  if (m.error) throw new InstrumentError(`${what}:${m.error}`)
  return m
}
async function openTarget(target, waitFor, mode) {
  const url = target.fixture ? fixture.url : `${server.origin}/iframe.html?id=${encodeURIComponent(target.story)}&viewMode=story`
  await openStory(page, url, { waitFor, settleFrames: 6, notFound: target.fixture ? fixture.notFound : server.notFound, label: target.fixture ? `夾具 ${target.fixture}` : target.story })
  await parkPointer(page)
  if (mode !== 'real') await page.evaluate(installBreakInPage, mode)
}
/** 在指定範圍裡挑第 nth 個可編輯欄位外框,標成量測對象;回它的描述 */
async function markHost(scope, nth = 0) {
  const info = await page.evaluate(({ scope, nth, HOST_EDIT }) => {
    const root = scope ? document.querySelector(scope) : document
    if (!root) return { ok: false, why: `找不到範圍 ${scope}` }
    const all = [...(root.matches?.(HOST_EDIT) ? [root] : []), ...root.querySelectorAll(HOST_EDIT)]
    const h = all[nth]
    if (!h) return { ok: false, why: `範圍裡可編輯的欄位外框只有 ${all.length} 個,要第 ${nth + 1} 個` }
    document.querySelectorAll('[data-fob-host]').forEach((x) => x.removeAttribute('data-fob-host'))
    h.setAttribute('data-fob-host', '')
    h.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
    const inner = h.querySelector('input[role="combobox"]')
    return { ok: true, error: h.hasAttribute('data-error'), who: (h.getAttribute('aria-label') || inner?.getAttribute('aria-label') || h.textContent || '').trim().slice(0, 18) }
  }, { scope, nth, HOST_EDIT })
  if (!info.ok) throw new InstrumentError(info.why)
  return info
}
/** 焦點回到 body、滑鼠停到空白處,讀靜止時的四邊顏色 */
async function rest(what, { click = true } = {}) {
  const spot = await parkPointer(page)
  if (click) await page.mouse.click(spot.x, spot.y)
  const m = await measure(what)
  if (m.fw || m.hover) throw new InstrumentError(`${what}:要量靜止的顏色,但焦點在欄位裡=${m.fw}、滑鼠在欄位上=${m.hover}(焦點 ${m.active})`)
  return m
}
async function readTokens() {
  tokens = await page.evaluate(tokensInPage, HOST)
  const distinct = new Set(TOKEN_NAMES.map((n) => tokens[n]))
  if (distinct.size !== TOKEN_NAMES.length || TOKEN_NAMES.some((n) => !tokens[n])) throw new InstrumentError(`token 取不到可分辨的顏色:${JSON.stringify(tokens)}`)
}
async function evidence() { return page.evaluate(evidenceInPage, HOST) }
/** 滑鼠點欄位自己的表面(不落在 Tag / 頭像 / 按鈕上) */
async function clickOwn(what) {
  const handle = await page.$(HOST)
  const at = await ownSurfacePosition(handle)
  if (!at.ok) throw new InstrumentError(`${what}:找不到欄位自己的表面(${at.why})`)
  await handle.click({ position: at.position, timeout: 8000 })
}
async function hoverOwn(what) {
  const handle = await page.$(HOST)
  const at = await ownSurfacePosition(handle)
  if (!at.ok) throw new InstrumentError(`${what}:找不到欄位自己的表面(${at.why})`)
  await page.mouse.move(at.x, at.y)
}
/** 哨兵放在欄位正前方(絕對定位,不佔版面),程式聚焦哨兵後按 Tab = 真的用鍵盤進到欄位(同 readonly-focus-pointer-invariant) */
async function tabInto(what) {
  await page.evaluate((hostSel) => {
    const h = document.querySelector(hostSel)
    const s = document.createElement('button')
    s.setAttribute('data-fob-sentinel', '')
    s.setAttribute('aria-hidden', 'true')
    s.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;margin:0;padding:0;border:0'
    h.before(s)
    s.focus()
  }, HOST)
  await page.keyboard.press('Tab')
  const inHost = await page.evaluate((hostSel) => { document.querySelectorAll('[data-fob-sentinel]').forEach((s) => s.remove()); return !!document.querySelector(hostSel)?.contains(document.activeElement) }, HOST)
  if (!inHost) throw new InstrumentError(`${what}:按 Tab 之後焦點沒有進到欄位`)
}
const stopBreak = () => page.evaluate(() => window.__fobBreakStop?.() ?? false)

/**
 * 開著時的三個時刻(O1 空白處 / O2 欄位上 / O3 浮層裡):先確認浮層真的開了(不靠記號),每一刻四邊都要是期望色;
 * 對照組跑法另加一列「還原」(破法拿掉、同一刻重量必須回到期望色)。ctx.error = 這是不是驗證錯誤的欄位(決定破法 (b) 下的期望)。
 */
async function openMoments(mode, name, expected, ctx) {
  const ev = await evidence()
  if (!ev.own || !ev.expanded) throw new InstrumentError(`浮層沒有開(aria-expanded=${ev.expanded}、欄位自己的浮層 ${ev.own} 個)`)
  await parkPointer(page)
  const m1 = await measure('O1')
  if (m1.hover) throw new InstrumentError('O1:滑鼠已停到空白處,欄位卻還在 :hover')
  check(mode, `${name} | O1 開著、滑鼠在空白處 → 四邊 ${expected.name}`, all4(m1, expected.color), show(m1), expectOf(mode, 'open', { ...ctx, m: m1 }))
  await hoverOwn('O2')
  const m2 = await measure('O2')
  if (!m2.hover) throw new InstrumentError('O2:滑鼠移到欄位上,欄位卻不在 :hover')
  check(mode, `${name} | O2 開著、滑鼠停在欄位上 → 四邊 ${expected.name}`, all4(m2, expected.color), show(m2), expectOf(mode, 'open', { ...ctx, m: m2 }))
  const spot = (await evidence()).spot
  if (!spot) throw new InstrumentError('O3:在浮層裡找不到可以停滑鼠的點')
  await page.mouse.move(spot.x, spot.y)
  const m3 = await measure('O3')
  const still = await evidence()
  if (m3.hover || !still.own) throw new InstrumentError(`O3:滑鼠移進浮層之後,欄位 :hover=${m3.hover}、欄位自己的浮層 ${still.own} 個`)
  check(mode, `${name} | O3 開著、滑鼠停在浮層裡 → 四邊 ${expected.name}`, all4(m3, expected.color), show(m3), expectOf(mode, 'open', { ...ctx, m: m3 }))
  if (mode !== 'real') {
    await stopBreak()
    const r = await measure('還原')
    check(mode, `${name} | 還原(破法拿掉、同一刻重量)→ 四邊 ${expected.name}`, all4(r, expected.color), show(r), expectOf(mode, 'restore'))
  }
}
async function closeOwn(what) {
  await parkPointer(page)
  await page.keyboard.press('Escape')
  await settle(what)
  const ev = await evidence()
  if (ev.own) throw new InstrumentError(`${what}:按 Esc 之後欄位自己的浮層還在(${ev.own} 個)`)
}
const rowsOf = (mode, base) => base + (mode === 'real' ? 0 : 1)

// ── F:欄位矩陣 ────────────────────────────────────────────────────────────────────────
async function runField(field, opener, mode) {
  const name = `F ${field.kind} · ${field.error ? '驗證錯誤' : '一般'} · ${opener === 'mouse' ? '滑鼠點開' : `鍵盤 ${field.key} 打開`}`
  planned += rowsOf(mode, opener === 'mouse' ? 4 : 5)
  try {
    const scope = field.fixture ? `[data-fob-cell="${field.fixture}"]` : '#storybook-root'
    await openTarget(field, `${scope} ${HOST_EDIT}`, mode)
    const info = await markHost(scope, field.nth ?? 0)
    if (info.error !== field.error) throw new InstrumentError(`「${info.who}」的驗證錯誤狀態是 ${info.error},盤點是 ${field.error}(story 改了?)`)
    const z = await rest('開之前')
    await readTokens()
    const expected = field.error ? { name: '--error', color: tokens['--error'] } : { name: '--primary', color: tokens['--primary'] }
    if (!field.error && colorsOf(z).includes(tokens['--primary'])) throw new InstrumentError(`開之前靜止時就已經是 --primary(${show(z)}),這一格分不出開沒開`)
    const ctx = { error: field.error }
    if (opener === 'keyboard') {
      await tabInto('K0')
      const k = await measure('K0')
      if (!k.fw || k.mark) throw new InstrumentError(`K0:Tab 進來之後焦點在欄位裡=${k.fw}、記號=${k.mark}`)
      check(mode, `${name} | K0 鍵盤聚焦、還沒開 → 四邊 ${expected.name}(基準)`, all4(k, expected.color), show(k), expectOf(mode, 'closed'))
      await page.keyboard.press(field.key)
    } else {
      await clickOwn('滑鼠點開')
    }
    await settle('打開之後')
    await openMoments(mode, name, expected, ctx)
    await closeOwn('關掉')
    const c = await rest('關掉之後')
    check(mode, `${name} | C1 關掉並離開欄位 → 四邊回到開之前(${nameOf(colorsOf(z)[0])})`, sameAs(c, colorsOf(z)), show(c), expectOf(mode, 'closed'))
  } catch (error) {
    instrument(name, String(error?.message ?? error).split('\n')[0].slice(0, 300))
  }
}

// ── N:表格格內(無框款)────────────────────────────────────────────────────────────────
async function runNaked(cell, mode) {
  const name = `N ${cell.kind} · 滑鼠點進編輯`
  planned += rowsOf(mode, 4)
  try {
    const cellSel = `[data-cell-id$=":${cell.col}"]`
    await openTarget({ story: NAKED_STORY }, cellSel, mode)
    const at = await page.evaluate((cellSel) => {
      const c = document.querySelector(cellSel)
      c.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
      const r = c.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }, cellSel)
    await settle('捲到格子')
    await page.mouse.click(at.x, at.y)
    await settle('點進編輯')
    // 編輯器在格子裡,或浮在表格的編輯層上
    const scope = await page.evaluate(({ cellSel, HOST_EDIT }) => (document.querySelector(`${cellSel} ${HOST_EDIT}`) ? cellSel : document.querySelector(`[data-active-editor-host] ${HOST_EDIT}`) ? '[data-active-editor-host]' : null), { cellSel, HOST_EDIT })
    if (!scope) throw new InstrumentError('點了格子之後沒有出現編輯器')
    await markHost(scope, 0)
    await readTokens()
    const expected = { name: '--primary', color: tokens['--primary'] }
    await openMoments(mode, name, expected, { error: false })
    await closeOwn('關掉')
    const spot = await parkPointer(page)
    await page.mouse.click(spot.x, spot.y)
    await settle('關掉之後')
    const left = await page.evaluate(({ hostSel, primary }) => {
      const h = document.querySelector(hostSel)
      if (!h) return { gone: true }
      const cs = getComputedStyle(h)
      return { gone: false, blue: ['top', 'right', 'bottom', 'left'].some((s) => cs.getPropertyValue(`border-${s}-color`) === primary), color: cs.borderTopColor }
    }, { hostSel: HOST, primary: tokens['--primary'] })
    check(mode, `${name} | C1 關掉並離開格子 → 格子上不留 --primary 的框`, left.gone || !left.blue, left.gone ? '編輯器已收起' : `編輯器還在,上邊 ${nameOf(left.color)}`, expectOf(mode, 'closed'))
  } catch (error) {
    instrument(name, String(error?.message ?? error).split('\n')[0].slice(0, 300))
  }
}

// ── G:併排欄位組 ──────────────────────────────────────────────────────────────────────
const px = (png, x, y) => { if (x < 0 || y < 0 || x >= png.width || y >= png.height) return null; const i = (png.width * y + x) << 2; return [png.data[i], png.data[i + 1], png.data[i + 2]] }
const near = (a, b) => !!a && !!b && Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) <= 2
const rgb = (c) => (c ? `rgb(${c[0]},${c[1]},${c[2]})` : '(畫面外)')
/** 四邊中點的像素(各往垂直方向多看前後 1px:邊框那一格一定在這 3 格裡),與 --primary 色塊的像素比 */
async function edgePixels() {
  const box = await page.evaluate((hostSel) => {
    const r = document.querySelector(hostSel).getBoundingClientRect()
    const s = document.createElement('div')
    s.id = 'fob-swatch'
    s.style.cssText = 'position:fixed;left:0;bottom:0;width:12px;height:12px;z-index:2147483647;pointer-events:none;background:var(--primary)'
    document.body.appendChild(s)
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, vh: innerHeight }
  }, HOST)
  const png = PNG.sync.read(await page.screenshot())
  await page.evaluate(() => document.getElementById('fob-swatch')?.remove())
  const want = px(png, 6, box.vh - 6)
  const L = Math.round(box.left), R = Math.round(box.right) - 1, T = Math.round(box.top), B = Math.round(box.bottom) - 1
  const mx = Math.round((box.left + box.right) / 2), my = Math.round((box.top + box.bottom) / 2)
  const side = (label, at, scan) => ({ label, at, pixel: px(png, at[0], at[1]), hit: scan.some(([x, y]) => near(px(png, x, y), want)) })
  return {
    want,
    sides: [
      side('上', [mx, T], [[mx, T - 1], [mx, T], [mx, T + 1]]),
      side('右', [R, my], [[R - 1, my], [R, my], [R + 1, my]]),
      side('下', [mx, B], [[mx, B - 1], [mx, B], [mx, B + 1]]),
      side('左', [L, my], [[L - 1, my], [L, my], [L + 1, my]]),
    ],
  }
}
const showPixels = (p) => `--primary 色塊 ${rgb(p.want)};${p.sides.map((s) => `${s.label}(${s.at}) ${rgb(s.pixel)}${s.hit ? '' : ' ✗'}`).join(' / ')}`
async function runGroup(mode) {
  const name = 'G 併排欄位組中間那一格(Select)· 滑鼠點開'
  planned += rowsOf(mode, 3)
  try {
    await openTarget({ story: GROUP_STORY }, `[data-field-control-group] > ${HOST_EDIT}`, mode)
    const members = await page.evaluate((HOST_EDIT) => {
      const kids = [...document.querySelector('[data-field-control-group]').children]
      if (kids.length < 3 || !kids[1].matches(HOST_EDIT)) return null
      kids[1].setAttribute('data-fob-host', '')
      const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }
      return { left: centre(kids[0]), right: centre(kids[2]) }
    }, HOST_EDIT)
    if (!members) throw new InstrumentError('併排欄位組的成員不是「欄位 / 欄位 / 欄位」三格,或中間那格不是可編輯欄位')
    const z = await rest('開之前')
    await readTokens()
    const expected = { name: '--primary', color: tokens['--primary'] }
    await clickOwn('滑鼠點開')
    await settle('打開之後')
    const ev = await evidence()
    if (!ev.own || !ev.expanded) throw new InstrumentError(`浮層沒有開(aria-expanded=${ev.expanded}、欄位自己的浮層 ${ev.own} 個)`)
    await parkPointer(page)
    const m = await measure('G1')
    if (m.hover) throw new InstrumentError('G1:滑鼠已停到空白處,欄位卻還在 :hover')
    check(mode, `${name} | G1 開著、滑鼠在空白處 → 四邊 computed --primary`, all4(m, expected.color), `${show(m)} z-index=${m.z}`, expectOf(mode, 'open', { m }))
    const p = await edgePixels()
    check(mode, `${name} | G2 同一刻四邊中點的像素 = --primary(沒被鄰居蓋住)`, p.sides.every((s) => s.hit), showPixels(p), expectOf(mode, 'pixel', { m }))
    if (mode !== 'real') {
      await stopBreak()
      const r = await measure('還原')
      const rp = await edgePixels()
      check(mode, `${name} | 還原(破法拿掉、同一刻重量)→ computed 與像素都是 --primary`, all4(r, expected.color) && rp.sides.every((s) => s.hit), `${show(r)};${showPixels(rp)}`, expectOf(mode, 'restore'))
    } else {
      // 只記錄、不判紅:開著時滑過鄰居,共用那條線畫出來是什麼顏色(這一題還沒有規定)
      for (const [which, at, idx] of [['右', members.right, 1], ['左', members.left, 3]]) {
        await page.mouse.move(at.x, at.y)
        const n = await measure(`滑過${which}鄰居`)
        const np = await edgePixels()
        console.log(`· 紀錄(不判紅)${name} | 開著、滑鼠停在${which}邊鄰居上:共用的${which}邊那條線像素 ${rgb(np.sides[idx].pixel)}(--primary 色塊 ${rgb(np.want)});中間那格 computed ${show(n)} z-index=${n.z}`)
      }
    }
    await closeOwn('關掉')
    const c = await rest('關掉之後')
    check(mode, `${name} | C1 關掉並離開欄位 → 四邊回到開之前(${nameOf(colorsOf(z)[0])})`, sameAs(c, colorsOf(z)), show(c), expectOf(mode, 'closed'))
  } catch (error) {
    instrument(name, String(error?.message ?? error).split('\n')[0].slice(0, 300))
  }
}

// ── X:外面包一層浮層、直接把欄位當觸發點(夾具)────────────────────────────────────────────────
async function runWrapped(w, mode) {
  const name = `X ${w.kind}(外面那層把欄位當觸發點)`
  planned += rowsOf(mode, 3)
  try {
    const scope = `[data-fob-cell="${w.cell}"]`
    await openTarget({ fixture: w.cell }, `${scope} ${HOST_EDIT}`, mode)
    await markHost(scope, 0)
    const z = await rest('開之前')
    await readTokens()
    if (colorsOf(z).includes(tokens['--primary'])) throw new InstrumentError(`開之前靜止時就已經是 --primary(${show(z)})`)
    const toggle = async (want) => {
      const btn = await page.$(`${scope} [data-fob-toggle] button`)
      if (!btn) throw new InstrumentError('找不到切換外面那層的按鈕')
      await btn.click({ timeout: 8000 })
      await settle(`外面那層${want}`)
      const st = await page.evaluate((scope) => document.querySelector(scope)?.getAttribute('data-fob-ext'), scope)
      const ev = await evidence()
      if (want === '開' ? (st !== 'open' || !ev.ext) : (st !== 'closed' || ev.ext)) throw new InstrumentError(`外面那層應該${want}著,實際 data-fob-ext=${st}、畫面上外面那層 ${ev.ext} 個`)
      if (ev.own) throw new InstrumentError(`切換外面那層時,欄位自己的浮層不該開著(${ev.own} 個)`)
    }
    await toggle('開')
    await parkPointer(page)
    const x1 = await measure('X1')
    if (x1.hover || x1.fw) throw new InstrumentError(`X1:外面那層開著時要量的是「沒碰欄位」,實際滑鼠在欄位上=${x1.hover}、焦點在欄位裡=${x1.fw}`)
    check(mode, `${name} | X1 外面那層開著、欄位自己沒開 → 四邊 = 開之前(${nameOf(colorsOf(z)[0])}),不是 --primary`, sameAs(x1, colorsOf(z)) && !colorsOf(x1).includes(tokens['--primary']), show(x1), expectOf(mode, 'foreign', { reachRed: w.reachRed }))
    if (mode === 'reach') {
      await stopBreak()
      const r = await measure('還原')
      check(mode, `${name} | 還原(破法拿掉、同一刻重量)→ 四邊 = 開之前`, sameAs(r, colorsOf(z)), show(r), expectOf(mode, 'restore'))
    }
    await toggle('關')
    await rest('外面那層關掉之後') // Radix 關閉時把焦點還給觸發點(= 這個欄位),先讓焦點離開
    await clickOwn('滑鼠點開欄位自己的浮層')
    await settle('打開之後')
    const ev = await evidence()
    if (!ev.own || ev.ext) throw new InstrumentError(`要的是「只有欄位自己的浮層開著」,實際自己的 ${ev.own} 個、外面那層 ${ev.ext} 個`)
    await parkPointer(page)
    const x2 = await measure('X2')
    if (x2.hover) throw new InstrumentError('X2:滑鼠已停到空白處,欄位卻還在 :hover')
    check(mode, `${name} | X2 同一個欄位自己的浮層開著、滑鼠在空白處 → 四邊 --primary`, all4(x2, tokens['--primary']), show(x2), expectOf(mode, 'open', { m: x2 }))
    if (mode === 'css' || mode === 'mark') {
      await stopBreak()
      const r = await measure('還原')
      check(mode, `${name} | 還原(破法拿掉、同一刻重量)→ 四邊 --primary`, all4(r, tokens['--primary']), show(r), expectOf(mode, 'restore'))
    }
    await closeOwn('關掉')
    const c = await rest('關掉之後')
    check(mode, `${name} | C1 關掉並離開欄位 → 四邊回到開之前(${nameOf(colorsOf(z)[0])})`, sameAs(c, colorsOf(z)), show(c), expectOf(mode, 'closed'))
  } catch (error) {
    instrument(name, String(error?.message ?? error).split('\n')[0].slice(0, 300))
  }
}

// ── Z:欄位裡的小按鈕開選單(FileViewer 縮放)──────────────────────────────────────────────
async function runInner(mode) {
  const name = 'Z 欄位裡的小按鈕開選單(FileViewer 縮放比例)'
  planned += mode === 'reach' ? 2 : 1 // Z1;只有破法 (c) 會動到這一格,所以只有它多一列「還原」
  try {
    const BUTTON = 'button[aria-haspopup="menu"]'
    await openTarget({ story: INNER_STORY }, `${HOST_EDIT} ${BUTTON}`, mode)
    const found = await page.evaluate(({ HOST_EDIT, BUTTON }) => {
      const h = [...document.querySelectorAll(HOST_EDIT)].find((x) => x.querySelector(BUTTON))
      if (!h) return false
      h.setAttribute('data-fob-host', '')
      return true
    }, { HOST_EDIT, BUTTON })
    if (!found) throw new InstrumentError('找不到「裡面有選單按鈕」的欄位')
    // 檢視器是整頁浮層:不點空白處(會關掉檢視器),只把滑鼠移開
    const z = await rest('開之前', { click: false })
    await readTokens()
    if (colorsOf(z).includes(tokens['--primary'])) throw new InstrumentError(`開之前靜止時就已經是 --primary(${show(z)})`)
    const btn = await page.$(`${HOST} ${BUTTON}`)
    await btn.click({ timeout: 8000 })
    await settle('選單打開之後')
    const opened = await page.evaluate(({ hostSel, BUTTON }) => ({ expanded: document.querySelector(`${hostSel} ${BUTTON}`)?.getAttribute('aria-expanded'), menus: document.querySelectorAll('[role="menu"]').length }), { hostSel: HOST, BUTTON })
    if (opened.expanded !== 'true' || !opened.menus) throw new InstrumentError(`小按鈕的選單沒有開(aria-expanded=${opened.expanded}、選單 ${opened.menus} 個)`)
    await parkPointer(page)
    const m = await measure('Z1')
    if (m.hover || m.fw) throw new InstrumentError(`Z1:要量的是「選單開著、沒碰欄位」,實際滑鼠在欄位上=${m.hover}、焦點在欄位裡=${m.fw}`)
    check(mode, `${name} | Z1 選單開著、滑鼠在空白處 → 四邊 = 開之前(${nameOf(colorsOf(z)[0])}),不是 --primary`, sameAs(m, colorsOf(z)) && !colorsOf(m).includes(tokens['--primary']), show(m), expectOf(mode, 'foreign', { reachRed: true }))
    if (mode === 'reach') {
      await stopBreak()
      const r = await measure('還原')
      check(mode, `${name} | 還原(破法拿掉、同一刻重量)→ 四邊 = 開之前`, sameAs(r, colorsOf(z)), show(r), expectOf(mode, 'restore'))
    }
    await page.keyboard.press('Escape')
  } catch (error) {
    instrument(name, String(error?.message ?? error).split('\n')[0].slice(0, 300))
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────────────────
const MODE_TITLE = {
  css: '(a) css:開著的框改回 hover 色',
  mark: '(b) mark:記號一出現就拿掉(元件漏接記號)',
  reach: '(c) reach:外框改認通用的 data-state="open" / 裡面任何開著的東西',
  stack: '(d) stack:併排欄位組裡開著的那格不再浮到鄰居上面',
}
async function runMode(mode) {
  if (mode !== 'real') console.log(`\n── 破法 ${MODE_TITLE[mode]} ──`)
  if (mode === 'stack') { await runGroup(mode); return }
  if (mode === 'reach') {
    for (const w of WRAPPED) await runWrapped(w, mode)
    await runInner(mode)
    for (const field of REACH_CONTROLS) for (const opener of ['mouse', 'keyboard']) await runField(field, opener, mode)
    return
  }
  for (const field of FIELDS) for (const opener of ['mouse', 'keyboard']) await runField(field, opener, mode)
  for (const cell of NAKED) await runNaked(cell, mode)
  await runGroup(mode)
  for (const w of WRAPPED) await runWrapped(w, mode)
  await runInner(mode)
}

try {
  if (buildArg) console.log(`建置:${STATIC}(--build 指定;story 的列量這份建置,夾具的列 = 這次 checkout 的元件原始碼 + 這份建置的 CSS)`)
  for (const mode of SELFTEST ? ['css', 'mark', 'reach', 'stack'] : ['real']) await runMode(mode)
} catch (error) {
  instrument('執行', String(error?.message ?? error).slice(0, 300))
}

await browser.close()
await stopServers()
const missing = [...new Set([...server.notFound, ...fixture.notFound])]
if (missing.length) console.log(`同源 404:${missing.join(', ')}`)
if (!instrumentFail && judged !== planned) instrument('列數', `排定 ${planned} 列,實際量了 ${judged} 列 —— 有格子沒量到`)
if (!instrumentFail && SELFTEST) {
  for (const mode of ['css', 'mark', 'reach', 'stack']) {
    const t = seen[mode]
    if (!t || t.redWant === 0 || t.greenWant === 0) instrument(`破法 ${mode}`, `這個破法沒有同時量到「該紅」與「該綠」的列(該紅 ${t?.redWant ?? 0}、該綠 ${t?.greenWant ?? 0})—— 對照組沒有兩面`)
  }
}
const took = `耗時 ${Math.round((Date.now() - STARTED_AT) / 1000)} 秒`
if (instrumentFail) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:有量不到的項目(見上),不當成通過(${took})`); process.exit(2) }
if (SELFTEST) {
  const line = ['css', 'mark', 'reach', 'stack'].map((mode) => `${mode} 該紅 ${seen[mode].red}/${seen[mode].redWant}、該綠 ${seen[mode].green}/${seen[mode].greenWant}`).join(';')
  console.log(failCount === 0 ? `✓ field-open-border-invariant --selftest:${judged} 列全部照表(${line};${took})` : `✗ field-open-border-invariant --selftest:${failCount} 列不照表(${line};${took})—— 這支閘量的不是它宣稱的東西`)
} else {
  console.log(failCount === 0 ? `✓ field-open-border-invariant:${judged} 列全部相符(${took})` : `✗ field-open-border-invariant:${judged} 列裡 ${failCount} 列不符(${took})`)
}
process.exit(failCount === 0 ? 0 : 1)
