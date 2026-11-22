#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: LinkInput `clearable`(link-input.spec.md「驗證」段「可清除(clearable)」,2026-11-21,user 2026-11-19 拍板提案 A)在真瀏覽器裡 ——
 *     C1 清除 × 只在打字狀態、框裡有字時出現:連結狀態沒有(只有 Pencil)、空白框沒有、沒開 clearable 沒有;× 右緣到框右緣 = 邊框 + 右內距
 *     C2 滑鼠按 ×(編輯合法網址中):草稿清空、**留在打字狀態**(沒有退出編輯、沒有切回連結)、焦點在輸入框、× 消失
 *     C3 清掉之後按 Esc:還原原值、切回連結狀態、焦點給 Pencil
 *     C4 清掉之後點別處離開:照既有規則結算 —— 空白 = 清值(連結不回來、輸入框空白、不再有 Esc 層)
 *     C5 清掉之後按 Enter:同離開(清值),焦點留在輸入框
 *     C6 鍵盤:輸入框按 Tab 到 ×,**不結算**(仍在打字狀態、草稿還在);Enter 清草稿、焦點回輸入框;從 × 再按 Tab 離開欄位 = 結算(合法網址提交、回連結狀態)
 *     C7 焦點在 × 上按 Esc:還原原值、回連結狀態、焦點給 Pencil
 *     C8 不合法的字、焦點不在欄位裡:按 × 清空、焦點放進輸入框;離開後清值、沒有紅框
 *     C9 模擬 Safari(按按鈕不給焦點:mousedown 沒被擋就把焦點丟到 body):按 × 仍留在打字狀態
 *     C10 使用端的 onBlur 跟結算同一個時點(夾具 scripts/test-fixtures/link-input-clear/fixture.tsx —— 展示頁範例沒接 onBlur,見夾具檔頭):
 *         輸入框 Tab 到 ×、滑鼠按 × 都不呼叫;從 × 離開欄位呼叫一次;沒經過 × 直接離開照舊一次;每次 currentTarget / target 都是輸入框
 *     C11 使用端給的錯(展示頁「可清除」第二則:儲存時檢查出的錯,包在 <Field invalid> + <FieldError>,範例接 onInput 清)在**開始打字當下**與
 *         **按 × 當下**(都還沒離開、還沒結算)就消失 —— Field 錯誤區那一行、紅框、aria-invalid 都沒了(form-validation.spec.md 規則 5;
 *         link-input.spec.md「可清除」「按下」:按 × 跟原生輸入框清空一樣送出 input 事件)。對照:單純點進去、還沒打字時錯還在(「驗證」2)
 *   紅: --selftest 造回「舊寫法」各組必紅(兩面對照,提案 A ②):
 *     S1 攔下 × 的 mousedown(元件擋不到預設)+ 模擬 Safari → C2 必紅(退出編輯);
 *     S2 把元件裡「焦點移到同一個欄位的 × 不算離開」那一句換成 false(改寫送到瀏覽器的 story / 夾具程式,改到 0 處 = 儀器失效)+ 攔下 × 的 mousedown → C2、C6、C10 必紅;
 *     S3 攔下 Esc(元件收不到)→ C3 必紅;S4 攔下 focusout(元件收不到離開)→ C4、C10 必紅;S5 在連結狀態的框裡塞一顆「清除網址」→ C1 必紅;
 *     S6 攔下欄位裡程式送出的 input 事件(= 2026-11-22 前按 × 不送事件:草稿照清,使用端收不到;打字是使用者送的事件,不攔)→ C11 必紅
 *   綠: 現行建置全綠;story 開不起來 / 找不到要量的欄位 / 互動後版面不靜止 = 儀器失效(exit 2),不當通過
 * ─────
 * 為什麼(提案 A ②):LinkInput 的輸入框「離開就結算」(link-input.tsx handleBlur)。只把 × 接上「清字」的寫法,按 × 那一下輸入框先 blur,
 * 合法的網址當場提交、切回連結狀態,× 跟著卸載,點擊落空 —— 使用者看到的是「按了 × 卻退出編輯、網址還在」。現行兩條:
 * 按 × 時焦點不動(lib/pointer-press.ts keepFocusOnPointerPress)、焦點移到同一個欄位的 × 不算離開(lib/composite-field-focus.ts isWithinCompositeField);
 * × 卸載前焦點交回輸入框(Field/field-wrapper.tsx keepFieldFocusBeforeUnmount,經 Field/field-clear-button.tsx)。
 * 開 story 經 lib/launch-browser.mjs 的 openStory;互動後等 settleAfterInteraction(M32 第四問:不靠固定睡眠)。
 *
 *   node scripts/link-input-clear-invariant.mjs              判定(exit 0 綠 / 1 紅 / 2 儀器失效)
 *   node scripts/link-input-clear-invariant.mjs --selftest   對照組(每組都必須紅才 exit 0)
 */
import { join } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { openStory, StoryRenderInstrumentError, launchBrowserOrSkip, requireStorybookBuild, settleAfterInteraction, INSTRUMENT_FAIL_MARKER } from './lib/launch-browser.mjs'
import { FixtureInstrumentError, startStorybookCssFixture } from './lib/storybook-css-fixture.mjs'

const SELFTEST = process.argv.includes('--selftest')
const S = join(process.cwd(), 'storybook-static')
requireStorybookBuild(join(S, 'index.json'))
const sv = await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
// C10 的夾具(元件行為 = 這次 checkout 的原始碼,樣式 = 同一份 storybook 建置;lib/storybook-css-fixture.mjs)
const FIXTURE_SOURCE = 'scripts/test-fixtures/link-input-clear/fixture.tsx'
let fixture
try {
  fixture = await startStorybookCssFixture(sv.servedRoot, { source: FIXTURE_SOURCE, label: 'LinkInput 可清除夾具', title: 'LinkInput 可清除夾具' })
} catch (error) {
  await sv.stop()
  if (!(error instanceof FixtureInstrumentError)) throw error
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER} ${error.message}(${FIXTURE_SOURCE})—— 夾具掛不起來是儀器失效,不是產品裁決`)
  process.exit(2)
}
const stopServers = async () => { await fixture.stop(); await sv.stop() }
const br = await launchBrowserOrSkip({}, { cleanup: stopServers })

const CLEARABLE = 'design-system-components-linkinput-展示--clearable'
const PLAIN = 'design-system-components-linkinput-展示--default'
const FIXTURE = 'fixture:link-input-clear' // open() 認得這個名字 → 開夾具頁(C10)
const CLEAR = 'button[aria-label="清除網址"]'
const PENCIL = 'button[aria-label="編輯連結"]'
// 欄位的框 = 控件自己的外框(data-field-mode="edit")。包在 <Field> 裡的欄位(展示頁「可清除」第二則:儲存時檢查出的錯交給 Field)
// Field 的根也帶 data-field-mode,但它另帶 data-field-orientation —— 排除掉,第 i 個框才是第 i 個 LinkInput
const FRAME = '[data-field-mode="edit"]:not([data-field-orientation])'
const FIGMA = 'https://www.figma.com/design/checkout-flow'

class Instrument extends Error {}
const bail = async (msg) => {
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER} ${msg}(儀器失效,不是產品裁決)`)
  await br.close(); await stopServers(); process.exit(2)
}

// ── 破法(只給 --selftest;不改產品原始碼)──
// 攔下 × 的 mousedown:元件的 keepFocusOnPointerPress 收不到 → 擋不到預設。safari:同時把焦點丟到 body(Safari 按按鈕不給焦點的預設行為)
const blockClearMouseDown = (safari) => `window.addEventListener('mousedown', (e) => {
  if (!(e.target instanceof Element) || !e.target.closest('${CLEAR}')) return
  e.stopPropagation()
  ${safari ? "if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur()" : ''}
}, true)`
// 模擬 Safari(主跑 C9 用):mousedown 派送完沒被擋預設 → 焦點丟到 body(擋了就照擋,同真 Safari)
const SAFARI_DEFAULT = `window.addEventListener('mousedown', (e) => {
  if (!(e.target instanceof Element) || !e.target.closest('${CLEAR}') || e.defaultPrevented) return
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur()
})`
const BLOCK_ESCAPE = `window.addEventListener('keydown', (e) => { if (e.key === 'Escape') e.stopPropagation() }, true)`
const BLOCK_FOCUSOUT = `window.addEventListener('focusout', (e) => { if (e.target instanceof Element && e.target.closest('[data-field-mode="edit"]')) e.stopPropagation() }, true)`
// 程式送出的 input 事件(isTrusted = false;按 × 送的那一下)在到達 React 之前攔下;使用者打字的事件照常 —— 等同修前按 × 不送事件(元件自己照樣清草稿)
const BLOCK_SCRIPTED_INPUT = `window.addEventListener('input', (e) => { if (!e.isTrusted && e.target instanceof Element && e.target.closest('[data-field-mode="edit"]')) e.stopPropagation() }, true)`
const FAKE_CLEAR_IN_LINK_STATE = `(() => { const w = document.querySelectorAll('${FRAME}')[0]; const b = document.createElement('button'); b.setAttribute('aria-label', '清除網址'); w.appendChild(b) })()`
// 「焦點移到同一個欄位的 × 不算離開」那一句(link-input.tsx handleBlur):isWithinCompositeField(e.relatedTarget, { trigger: e.currentTarget.parentElement })
// 壓縮後識別字會換名,屬性名留著 —— 以屬性名的形狀找(容許空白:夾具是 esbuild 沒壓縮的輸出);改到 0 處 = 儀器失效(不准當成「改了也沒紅」)
const SAME_FIELD_BLUR = /[A-Za-z_$][\w$]*\(\s*([A-Za-z_$][\w$]*)\.relatedTarget,\s*\{\s*trigger:\s*\1\.currentTarget\.parentElement\s*\}\s*\)/g

// 整趟只開一個分頁:沙箱參數 --single-process(lib/launch-browser.mjs SANDBOX_ARGS)下關掉分頁 / 情境、或同時開第二個情境,瀏覽器就整個斷線(本機實測)。
// 所以破法不靠新情境的 addInitScript:每次開 story 之後在同一頁注入(`mode.init`);改寫送出的程式用分頁層的 route(開了 route 瀏覽器不走 HTTP 快取)。
const page = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
// story 的程式(assets/*.js)與夾具的程式(fixture.js)
const ASSET_JS = /\/(?:assets\/.*|fixture)\.js(?:\?.*)?$/
let mode = { init: [] }
let patched = 0
const patchRoute = async (route) => {
  const res = await route.fetch()
  const body = await res.text()
  const next = body.replace(SAME_FIELD_BLUR, () => { patched++; return 'false' })
  await route.fulfill({ response: res, body: next })
}
async function setMode({ init = [], patchSameFieldBlur = false } = {}) {
  await page.unroute(ASSET_JS).catch(() => {})
  mode = { init }
  patched = 0
  if (patchSameFieldBlur) await page.route(ASSET_JS, patchRoute)
}
async function open(id, waitFor) {
  try {
    if (id === FIXTURE) await openStory(page, fixture.url, { waitFor, settleFrames: 10, notFound: fixture.notFound, label: '夾具 link-input-clear' })
    else await openStory(page, `${sv.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, { waitFor, settleFrames: 10, notFound: sv.notFound })
  } catch (e) {
    if (!(e instanceof StoryRenderInstrumentError)) throw e
    throw new Instrument(e.message)
  }
  for (const script of mode.init) await page.evaluate(script)
}
/** 夾具裡使用端 onBlur 的呼叫紀錄(每筆「currentTarget 標籤/target 標籤」) */
const blurLog = async (what) => {
  const raw = await page.evaluate(() => document.querySelector('[data-lic-fixture]')?.getAttribute('data-blur-log') ?? null)
  if (raw == null) throw new Instrument(`${what}:夾具裡找不到 onBlur 紀錄`)
  return raw ? raw.split(' ') : []
}
async function settle(what) {
  const r = await settleAfterInteraction(page, { frames: 10 })
  if (!r.ok) throw new Instrument(`${what}之後 ${r.framesWaited} 格內版面沒有靜止(變動 ${r.lateChanges} 次)`)
}
/** 第 i 個編輯模式欄位此刻的狀態(故事裡三個欄位依序:有連結 / 不合法的字 / 空白) */
const probe = (i) => page.evaluate(({ i, CLEAR, PENCIL, FRAME }) => {
  const w = document.querySelectorAll(FRAME)[i]
  if (!w) return null
  const input = w.querySelector('input')
  const clear = w.querySelector(CLEAR)
  const pencil = w.querySelector(PENCIL)
  const a = w.querySelector('a[href]')
  const ae = document.activeElement
  const box = w.getBoundingClientRect()
  const cs = getComputedStyle(w)
  return {
    input: !!input, value: input ? input.value : null, link: a ? a.getAttribute('href') : null, clear: !!clear, pencil: !!pencil,
    focus: ae === input && input ? 'input' : ae === clear && clear ? 'clear' : ae === pencil && pencil ? 'pencil' : (ae ? ae.tagName : null),
    layer: input ? input.hasAttribute('data-escape-layer') : null, error: w.hasAttribute('data-error'),
    clearInset: clear ? Math.round((box.right - clear.getBoundingClientRect().right) * 100) / 100 : null,
    expectInset: Math.round((parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight)) * 100) / 100,
  }
}, { i, CLEAR, PENCIL, FRAME })
async function field(i, what) {
  const s = await probe(i)
  if (!s) throw new Instrument(`${what}:找不到第 ${i + 1} 個編輯模式欄位`)
  return s
}
/** 第 i 個欄位 + 包著它的 <Field> 此刻的錯誤:Field 錯誤區那一行的字(使用端的 <FieldError>,或 LinkInput 自己的說明)、框的紅框、輸入框 aria-invalid(C11) */
async function userError(i, what) {
  const s = await field(i, what)
  const e = await page.evaluate(({ i, FRAME }) => {
    const w = document.querySelectorAll(FRAME)[i]
    const root = w?.closest('[data-field-orientation]')
    if (!root) return null
    const line = root.querySelector('[data-field-slot="error"]')
    return { text: line ? line.textContent : null, frameError: w.hasAttribute('data-error'), ariaInvalid: w.querySelector('input')?.getAttribute('aria-invalid') === 'true' }
  }, { i, FRAME })
  if (!e) throw new Instrument(`${what}:第 ${i + 1} 個欄位不在 <Field> 裡(展示頁「可清除」第二則該包在 Field 裡)`)
  return { ...s, ...e }
}
async function clickIn(i, selector, what) {
  const b = await page.evaluate(({ i, selector, FRAME }) => {
    const el = document.querySelectorAll(FRAME)[i]?.querySelector(selector)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
  }, { i, selector, FRAME })
  if (!b) throw new Instrument(`${what}:第 ${i + 1} 個欄位裡找不到 ${selector}`)
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  await settle(what)
}
async function press(key, what) { await page.keyboard.press(key); await settle(what) }
/** 進到第 1 個欄位(合法網址)的打字狀態:按 Pencil(預設開展示頁「可清除」;C10 開夾具) */
async function editFirst(id = CLEARABLE) {
  await open(id, PENCIL)
  await clickIn(0, PENCIL, '按 Pencil')
  const s = await field(0, '按 Pencil')
  if (!s.input || s.value !== FIGMA || s.focus !== 'input') throw new Instrument(`按 Pencil 沒進到打字狀態:${JSON.stringify(s)}`)
}

const results = []
const ck = (group, name, ok, detail) => results.push({ group, name, ok: !!ok, detail })
const J = (v) => JSON.stringify(v)

// ── 各組斷言(主跑與對照組共用同一份)──
const CHECKS = {
  async C1() {
    await open(CLEARABLE, PENCIL)
    const link = await field(0, 'C1'), bad = await field(1, 'C1'), empty = await field(2, 'C1')
    ck('C1', '連結狀態沒有 ×(只有 Pencil)', link.link === FIGMA && link.pencil && !link.clear, J(link))
    ck('C1', '不合法的字(打字狀態、框裡有字)有 ×', bad.input && bad.value !== '' && bad.clear, J(bad))
    ck('C1', '× 右緣到框右緣 = 邊框 + 右內距', bad.clearInset != null && Math.abs(bad.clearInset - bad.expectInset) < 0.5, `${bad.clearInset} vs ${bad.expectInset}`)
    ck('C1', '空白框沒有 ×', empty.input && empty.value === '' && !empty.clear, J(empty))
    await open(PLAIN, PENCIL)
    await clickIn(0, PENCIL, '沒開 clearable 按 Pencil')
    const plain = await field(0, '沒開 clearable')
    ck('C1', '沒開 clearable:打字狀態有字也沒有 ×', plain.input && plain.value !== '' && !plain.clear, J(plain))
  },
  async C2() {
    await editFirst()
    await clickIn(0, CLEAR, '滑鼠按 ×')
    const s = await field(0, 'C2')
    ck('C2', '按 × 後留在打字狀態(沒有切回連結)', s.input && s.link == null, J(s))
    ck('C2', '草稿清空、× 消失', s.value === '' && !s.clear, J(s))
    ck('C2', '焦點在輸入框', s.focus === 'input', J(s))
  },
  async C3() {
    await editFirst()
    await clickIn(0, CLEAR, '滑鼠按 ×')
    await press('Escape', 'Esc')
    const s = await field(0, 'C3')
    ck('C3', 'Esc 還原原值、回連結狀態', !s.input && s.link === FIGMA, J(s))
    ck('C3', 'Esc 後焦點給 Pencil', s.focus === 'pencil', J(s))
  },
  async C4() {
    await editFirst()
    await clickIn(0, CLEAR, '滑鼠按 ×')
    await page.mouse.click(1200, 860); await settle('點別處')
    const s = await field(0, 'C4')
    ck('C4', '離開後清值:連結不回來、輸入框空白', s.input && s.value === '' && s.link == null, J(s))
    ck('C4', '離開後沒有未結算的草稿(不再有 Esc 層)', s.layer === false, J(s))
  },
  async C5() {
    await editFirst()
    await clickIn(0, CLEAR, '滑鼠按 ×')
    await press('Enter', 'Enter')
    const s = await field(0, 'C5')
    ck('C5', 'Enter 結算 = 清值,焦點留在輸入框', s.input && s.value === '' && s.link == null && s.layer === false && s.focus === 'input', J(s))
  },
  async C6() {
    await editFirst()
    await press('Tab', '輸入框按 Tab')
    const a = await field(0, 'C6 Tab')
    ck('C6', 'Tab 到 ×:不結算(仍在打字狀態、草稿還在)', a.input && a.value === FIGMA && a.link == null && a.focus === 'clear', J(a))
    await press('Enter', '× 上按 Enter')
    const b = await field(0, 'C6 Enter')
    ck('C6', '× 上按 Enter:清草稿、焦點回輸入框', b.input && b.value === '' && !b.clear && b.focus === 'input', J(b))
    await editFirst()
    await press('Tab', '輸入框按 Tab')
    await press('Tab', '× 上按 Tab')
    const c = await field(0, 'C6 離開')
    ck('C6', '從 × 按 Tab 離開欄位 = 結算(合法網址回連結狀態)', !c.input && c.link === FIGMA, J(c))
  },
  async C7() {
    await editFirst()
    await page.keyboard.press('End'); await page.keyboard.type('/v2'); await settle('打字')
    await press('Tab', '輸入框按 Tab')
    const a = await field(0, 'C7 Tab')
    if (a.focus !== 'clear') { ck('C7', '× 上按 Esc 還原(前置:焦點在 ×)', false, J(a)); return }
    // 鍵盤聚焦 × 會開它的 tooltip(Radix);Esc 一次只收一層 —— 第一下只收 tooltip,草稿與焦點都不動,第二下才還原
    if (await page.evaluate(() => !!document.querySelector('[role="tooltip"]'))) {
      await press('Escape', '× 上按第一下 Esc')
      const b = await field(0, 'C7 第一下')
      const tip = await page.evaluate(() => !!document.querySelector('[role="tooltip"]'))
      ck('C7', '× 上第一下 Esc 只收 tooltip(草稿、焦點不動)', !tip && b.focus === 'clear' && b.value === a.value && b.input, `${J(b)} tooltip=${tip}`)
    }
    await press('Escape', '× 上按 Esc')
    const s = await field(0, 'C7')
    ck('C7', '× 上按 Esc:還原原值、回連結狀態、焦點給 Pencil', !s.input && s.link === FIGMA && s.focus === 'pencil', J(s))
  },
  async C8() {
    await open(CLEARABLE, PENCIL)
    const before = await field(1, 'C8')
    if (before.focus === 'input') throw new Instrument('C8 前置:焦點不該已在第 2 個欄位')
    await clickIn(1, CLEAR, '按不合法欄位的 ×')
    const s = await field(1, 'C8')
    ck('C8', '焦點不在欄位時按 ×:清空、焦點放進輸入框', s.input && s.value === '' && !s.clear && s.focus === 'input', J(s))
    await page.mouse.click(1200, 860); await settle('點別處')
    const t = await field(1, 'C8 離開')
    ck('C8', '離開後清值、沒有紅框', t.input && t.value === '' && !t.error && t.layer === false, J(t))
  },
  async C9() {
    await editFirst()
    await clickIn(0, CLEAR, '模擬 Safari 按 ×')
    const s = await field(0, 'C9')
    ck('C9', '模擬 Safari:按 × 後仍留在打字狀態、焦點在輸入框', s.input && s.link == null && s.value === '' && s.focus === 'input', J(s))
  },
  async C10() {
    const ON_INPUT = 'INPUT/INPUT'
    // (a) 鍵盤:輸入框 → ×(不算離開)→ 欄位外的按鈕(離開)
    await editFirst(FIXTURE)
    await press('Tab', '夾具:輸入框按 Tab')
    const a = await field(0, 'C10 Tab'), la = await blurLog('C10 Tab')
    ck('C10', '輸入框 Tab 到 ×:不呼叫使用端的 onBlur', a.focus === 'clear' && la.length === 0, `${J(a)} onBlur=${J(la)}`)
    await press('Tab', '夾具:× 上按 Tab')
    const b = await field(0, 'C10 離開'), lb = await blurLog('C10 離開')
    // 量「離開這一下」多出來的呼叫(不看總數:舊寫法在移到 × 時已呼叫一次、離開時不呼叫,總數也是 1)
    ck('C10', '從 × 離開欄位:這一下 onBlur 呼叫一次、currentTarget / target 是輸入框', !b.input && b.link === FIGMA && lb.length === la.length + 1 && lb[lb.length - 1] === ON_INPUT, `${J(b)} onBlur 移到 × 時=${J(la)} 離開後=${J(lb)}`)
    // (b) 滑鼠:按 ×(焦點不動)→ 點別處(離開,空白 = 清值)
    await editFirst(FIXTURE)
    await clickIn(0, CLEAR, '夾具:滑鼠按 ×')
    const c = await field(0, 'C10 按 ×'), lc = await blurLog('C10 按 ×')
    ck('C10', '滑鼠按 ×:不呼叫使用端的 onBlur', c.input && c.value === '' && lc.length === 0, `${J(c)} onBlur=${J(lc)}`)
    await page.mouse.click(1200, 860); await settle('夾具:點別處')
    const d = await field(0, 'C10 點別處'), ld = await blurLog('C10 點別處')
    ck('C10', '按 × 後點別處離開:onBlur 呼叫一次', d.input && d.value === '' && ld.length === 1 && ld[0] === ON_INPUT, `${J(d)} onBlur=${J(ld)}`)
    // (c) 沒經過 ×:輸入框直接離開,照舊呼叫一次
    await editFirst(FIXTURE)
    await page.mouse.click(1200, 860); await settle('夾具:直接點別處')
    const e = await field(0, 'C10 直接離開'), le = await blurLog('C10 直接離開')
    ck('C10', '沒經過 × 直接離開:onBlur 呼叫一次', !e.input && e.link === FIGMA && le.length === 1 && le[0] === ON_INPUT, `${J(e)} onBlur=${J(le)}`)
  },
  async C11() {
    // 展示頁「可清除」第二則(需求文件連結):使用端在 Field 給的錯(儲存時的檢查)。開頁時要有,否則量不到「消失」
    await open(CLEARABLE, PENCIL)
    const a = await userError(1, 'C11 開頁')
    if (!a.text || !a.frameError || !a.ariaInvalid) throw new Instrument(`C11 前置:第 2 個欄位開頁時該有使用端給的錯(紅框 + Field 錯誤區那一行):${J(a)}`)
    // 單純點進去不清(link-input.spec.md「驗證」2「單純重新 focus 不清除」)—— 對照:下面的「消失」是編輯造成的,不是聚焦造成的
    await clickIn(1, 'input', 'C11 點進輸入框')
    const b = await userError(1, 'C11 點進去')
    ck('C11', '點進去還沒打字:使用端給的錯還在(單純 focus 不清)', b.focus === 'input' && b.text === a.text && b.frameError && b.ariaInvalid, J(b))
    // 開始打字當下(還沒離開、還沒結算)
    await page.keyboard.press('End'); await page.keyboard.type('x'); await settle('C11 打字')
    const c = await userError(1, 'C11 打字')
    ck('C11', '開始打字當下:使用端給的錯消失(Field 錯誤區那一行、紅框、aria-invalid)', c.input && c.focus === 'input' && c.layer === true && !c.text && !c.frameError && !c.ariaInvalid, J(c))
    // 按 × 當下(草稿清空、焦點在輸入框、還沒結算 —— 仍有 Esc 層)
    await open(CLEARABLE, PENCIL)
    await clickIn(1, CLEAR, 'C11 按 ×')
    const d = await userError(1, 'C11 按 ×')
    ck('C11', '按 × 當下:使用端給的錯消失(Field 錯誤區那一行、紅框、aria-invalid)', d.input && d.value === '' && d.focus === 'input' && d.layer === true && !d.text && !d.frameError && !d.ariaInvalid, J(d))
  },
}

// 主跑:每組一個乾淨的分頁;C9 另外掛「Safari 預設」
const MAIN = [
  { groups: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C10', 'C11'] },
  { groups: ['C9'], init: [SAFARI_DEFAULT] },
]
// 對照組:每組破法 → 指定的斷言必須至少一條紅
const MUTANTS = [
  { name: 'S1 擋不到 × 的 mousedown + Safari', init: [blockClearMouseDown(true)], groups: ['C2'], mustRed: ['C2'] },
  { name: 'S3 元件收不到 Esc', init: [BLOCK_ESCAPE], groups: ['C3'], mustRed: ['C3'] },
  { name: 'S4 元件收不到離開', init: [BLOCK_FOCUSOUT], groups: ['C4', 'C10'], mustRed: ['C4', 'C10'] },
  { name: 'S5 連結狀態塞一顆 ×', groups: ['C1'], mustRed: ['C1'], after: FAKE_CLEAR_IN_LINK_STATE },
  { name: 'S6 按 × 不送 input 事件(修前)', init: [BLOCK_SCRIPTED_INPUT], groups: ['C11'], mustRed: ['C11'] },
  // 改寫送出程式的這組排最後:開了 route 瀏覽器不走 HTTP 快取,但排最後就不必賭改寫過的檔有沒有被快取下來給後面的組用
  { name: 'S2 焦點移到 × 算離開(舊寫法)+ 擋不到 mousedown', init: [blockClearMouseDown(false)], patchSameFieldBlur: true, groups: ['C2', 'C6', 'C10'], mustRed: ['C2', 'C6', 'C10'] },
]

async function runGroups(groups, { after } = {}) {
  for (const g of groups) {
    if (after) {
      // S5:開好 story 後才塞(C1 第一段量的就是這一頁)
      await open(CLEARABLE, PENCIL)
      await page.evaluate(after)
      const link = await field(0, 'S5')
      ck(g, '連結狀態沒有 ×(只有 Pencil)', link.link === FIGMA && link.pencil && !link.clear, J(link))
      continue
    }
    await CHECKS[g]()
  }
}

try {
  if (!SELFTEST) {
    for (const run of MAIN) {
      await setMode({ init: run.init ?? [] })
      await runGroups(run.groups)
    }
    for (const r of results) console.log(`${r.ok ? '✓' : '✗'} [${r.group}] ${r.name}${r.ok ? '' : ` | ${r.detail}`}`)
    const red = results.filter((r) => !r.ok)
    if (!results.length) await bail('一條斷言都沒跑到')
    console.log(red.length ? `\n✗ ${red.length} / ${results.length} 條未通過` : `\n✓ LinkInput clearable:${results.length} 條全部通過`)
    await br.close(); await stopServers(); process.exit(red.length ? 1 : 0)
  }
  let bad = 0
  for (const m of MUTANTS) {
    results.length = 0
    await setMode({ init: m.init ?? [], patchSameFieldBlur: !!m.patchSameFieldBlur })
    await runGroups(m.groups, { after: m.after })
    if (m.patchSameFieldBlur && patched === 0) await bail(`${m.name}:送到瀏覽器的程式裡找不到「焦點移到 × 不算離開」那一句(改到 0 處)`)
    const reds = new Set(results.filter((r) => !r.ok).map((r) => r.group))
    const missing = m.mustRed.filter((g) => !reds.has(g))
    if (missing.length) {
      bad++
      console.log(`✗ ${m.name}:${missing.join(' / ')} 沒有紅(破法沒被量到)`)
      for (const r of results) console.log(`    ${r.ok ? '✓' : '✗'} [${r.group}] ${r.name} | ${r.detail}`)
    } else {
      const named = results.filter((r) => !r.ok).map((r) => `[${r.group}] ${r.name}`)
      console.log(`✓ ${m.name}:紅 —— ${named.join(';')}${m.patchSameFieldBlur ? `(改寫 ${patched} 處)` : ''}`)
    }
  }
  console.log(bad ? `\n✗ 對照組 ${bad} / ${MUTANTS.length} 組沒紅` : `\n✓ 對照組 ${MUTANTS.length} 組全部紅(量具會紅)`)
  await br.close(); await stopServers(); process.exit(bad ? 1 : 0)
} catch (e) {
  if (e instanceof Instrument) await bail(e.message)
  throw e
}
