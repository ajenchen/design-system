#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: LinkInput 網址不合法時自帶一行錯誤說明(link-input.spec.md「驗證」段「錯誤說明」,2026-11-22,user 11-22 確認頁拍板丙)在真瀏覽器裡 ——
 *     E1 單獨用:打不是網址的字、Tab 離開 → 框下一行預設說明(FieldError:role="alert")、離框下緣 4px(欄位放在 gap 16 的 flex 直欄裡也是 4px,
 *        容器的 gap 不得疊進來);輸入框 aria-invalid,
 *        aria-describedby 連得到這一行(WCAG 3.3.1)、aria-errormessage 指到同一行;onInvalidChange 收到 true + 草稿
 *     E2 接著打字 → 說明消失、aria-describedby 不再指它;onInvalidChange 收到 false
 *     E3 不合法的字按 Enter → 說明出現、焦點留在輸入框(說明出現不讓輸入框重掛)
 *     E7 外部存進來、本身不是網址的值照 blur 驗證(form-validation.spec.md「驗證時機」規則 1–2):一掛上不紅、沒有說明;
 *        點進去 / Tab 進來、還沒離開也不驗
 *     E4 errorText 換字生效(上一格離開欄位之後)
 *     E5 包在 Field 裡(使用端的 FieldError 沒字)、離開之後 → 說明畫在 Field 的錯誤區:欄裡只有一行、在說明文字下面、間距 = Field 欄內 gap、
 *        id = 輸入框 aria-errormessage 且在 aria-describedby 裡
 *     E6 包在 Field 裡、使用端自己的 FieldError 有字、離開之後(LinkInput 自己也驗出不合法)→ 只有使用端那一行(不出兩行)
 *   保證(2026-11-26 加,同一個機制「控件交給 Field 畫在欄裡的一行」的第二個用法):Input / Textarea 的字數計數
 *   (field-controls.spec.md「字數計數」;第五輪決策卡 C7 user 點選「A:放在說明那一行的右端(「12 / 100」);沒有說明時那一行只有計數」)——
 *     C1 有說明:計數跟說明同一行、在說明右邊、右緣 = 框右緣、那一行離框下緣 4px;字級 / 顏色 = 說明文字;看得見「字數 / 上限」
 *     C2 沒有說明:那一行只有計數、在右端、緊接框下 4px,字級 / 顏色同說明
 *     C3 打字後計數 = 輸入框目前的字數;打超過上限(原生 maxLength)擋住,停在上限
 *     C4 讀屏:aria-describedby 連得到計數那一格、念的是含字數與上限的整句(看得見的「n / max」隱藏);
 *        播報區 role="status" + polite、在那一格外面、打字前空白;停下來之後焦點還在 → 念一次目前的整句
 *     C5 單獨用(不在 Field 裡):框下 4px 一行只有計數、右端、describedby 連得到
 *   紅: --selftest 在送到瀏覽器的夾具程式裡造回錯的寫法,各組必紅(兩面對照):
 *     M1 不畫說明(errorLineText 換成 null)→ E1 / E4 / E5 紅;M2 aria-describedby 不接說明 → E1 紅;
 *     M3 Field 不讓使用端的字優先 → E6 紅;M4 打字不清錯誤 → E2 紅;
 *     M5 外部存進來的值一掛上就驗(localError 初值 = 值非空白;夾具裡外部給的值都不是網址,等同 2026-11-22 第 1 次修正撤掉的那版)→ E7 紅。
 *     M6 Field 不畫計數 → C1 / C2 / C4 紅;M7 計數掉到說明下面一行 → C1 紅;M8 計數不靠右 → C2 / C5 紅;M9 打字不更新 → C3 紅;
 *     M10 aria-describedby 不接計數 → C4 / C5 紅;M11 播報區不念 → C4 紅;M12 原生 maxLength 沒傳到輸入元素 → C3 紅。
 *     改寫 0 處 = 儀器失效(不准當成「改了也沒紅」)
 *   綠: 現行原始碼全綠;夾具掛不起來 / 找不到要量的欄位 / 互動後版面不靜止 = 儀器失效(exit 2),不當通過
 * ─────
 * 為什麼:修前 LinkInput 自己驗出不合法時只有紅框、框下沒有字(form-validation.spec.md「A11y 預設」要紅框之外必有文字,WCAG 1.4.1 / 3.3.1),
 * 使用端也拿不到不合法的草稿(只在合法時呼叫 onChange)。夾具 scripts/test-fixtures/link-input-error-text/fixture.tsx(元件行為 = 這次 checkout 的原始碼,
 * 樣式 = 同一份 storybook 建置,lib/storybook-css-fixture.mjs);互動後等 settleAfterInteraction(不靠固定睡眠)。
 * 預設那句以 link-input.tsx 的 LINK_INPUT_DEFAULT_ERROR_TEXT 為準(讀原始碼,不在這裡另抄一份)。
 *
 *   node scripts/link-input-error-text-invariant.mjs              判定(exit 0 綠 / 1 紅 / 2 儀器失效)
 *   node scripts/link-input-error-text-invariant.mjs --selftest   對照組(每組都必須紅才 exit 0)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { openStory, StoryRenderInstrumentError, launchBrowserOrSkip, requireStorybookBuild, settleAfterInteraction, INSTRUMENT_FAIL_MARKER } from './lib/launch-browser.mjs'
import { FixtureInstrumentError, startStorybookCssFixture } from './lib/storybook-css-fixture.mjs'

const SELFTEST = process.argv.includes('--selftest')
const SOURCE = 'packages/design-system/src/components/LinkInput/link-input.tsx'
const DEFAULT_TEXT = readFileSync(join(process.cwd(), SOURCE), 'utf8').match(/const LINK_INPUT_DEFAULT_ERROR_TEXT = '([^']+)'/)?.[1]
if (!DEFAULT_TEXT) {
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER} ${SOURCE} 裡找不到 LINK_INPUT_DEFAULT_ERROR_TEXT(儀器失效,不是產品裁決)`)
  process.exit(2)
}
// 夾具裡寫死的兩句(scripts/test-fixtures/link-input-error-text/fixture.tsx CUSTOM_TEXT / CONSUMER_TEXT)
const FIXTURE_CUSTOM = '請貼上會議邀請裡的連結'
const FIXTURE_CONSUMER = '這個網址已經登記在別的專案'
const TYPED_DRAFT = '結帳流程 需求文件'

const S = join(process.cwd(), 'storybook-static')
requireStorybookBuild(join(S, 'index.json'))
const sv = await startA11yStaticServer({ rootDirectory: S, defaultFile: 'iframe.html' })
const FIXTURE_SOURCE = 'scripts/test-fixtures/link-input-error-text/fixture.tsx'
let fixture
try {
  fixture = await startStorybookCssFixture(sv.servedRoot, { source: FIXTURE_SOURCE, label: 'LinkInput 錯誤說明夾具', title: 'LinkInput 錯誤說明夾具' })
} catch (error) {
  await sv.stop()
  if (!(error instanceof FixtureInstrumentError)) throw error
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER} ${error.message}(${FIXTURE_SOURCE})—— 夾具掛不起來是儀器失效,不是產品裁決`)
  process.exit(2)
}
const stopServers = async () => { await fixture.stop(); await sv.stop() }
const br = await launchBrowserOrSkip({}, { cleanup: stopServers })

class Instrument extends Error {}
const bail = async (msg) => {
  console.error(`✗ ${INSTRUMENT_FAIL_MARKER} ${msg}(儀器失效,不是產品裁決)`)
  await br.close(); await stopServers(); process.exit(2)
}

// 整趟只開一個分頁(沙箱參數 --single-process 下關分頁 / 開第二個情境會整個斷線,同 link-input-clear-invariant)。
// 破法 = 改寫送到瀏覽器的夾具程式(esbuild 沒壓縮的輸出,識別字保留;撞名時 esbuild 會加數字尾碼,所以容許 \d*)。
const page = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
const FIXTURE_JS = /\/fixture\.js(?:\?.*)?$/
let patches = []
let patched = 0
const patchRoute = async (route) => {
  const res = await route.fetch()
  let body = await res.text()
  // to = 字串(原樣換上)或函式(拿比對到的群組組出替換字;replace 的回呼不展開 $1)
  for (const [re, to] of patches) body = body.replace(re, (...m) => { patched++; return typeof to === 'function' ? to(...m) : to })
  await route.fulfill({ response: res, body })
}
async function setMode(nextPatches = []) {
  await page.unroute(FIXTURE_JS).catch(() => {})
  patches = nextPatches
  patched = 0
  if (patches.length) await page.route(FIXTURE_JS, patchRoute)
}
async function openFixture() {
  try {
    await openStory(page, fixture.url, { waitFor: '[data-eti="typed"] input', settleFrames: 10, notFound: fixture.notFound, label: '夾具 link-input-error-text' })
  } catch (e) {
    if (!(e instanceof StoryRenderInstrumentError)) throw e
    throw new Instrument(e.message)
  }
}
async function settle(what) {
  const r = await settleAfterInteraction(page, { frames: 10 })
  if (!r.ok) throw new Instrument(`${what}之後 ${r.framesWaited} 格內版面沒有靜止(變動 ${r.lateChanges} 次)`)
}
/** 某個欄位(data-eti)此刻的狀態 */
const probe = (key) => page.evaluate((key) => {
  const host = document.querySelector(`[data-eti="${key}"]`)
  if (!host) return null
  // 框 = 輸入框往上最近的 data-field-mode(包在 Field 裡時 Field 自己的根也帶 data-field-mode,不能從外往裡找)
  const input = host.querySelector('input')
  const frame = input?.closest('[data-field-mode="edit"]')
  if (!frame || !input) return null
  const lines = [...host.querySelectorAll('[data-field-slot="error"]')]
  const line = lines[0] ?? null
  const describedby = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
  const desc = host.querySelector('[data-field-slot="description"]')
  const fieldCol = host.querySelector('[data-field-orientation]')
  const r = (el) => el.getBoundingClientRect()
  return {
    error: frame.hasAttribute('data-error'),
    ariaInvalid: input.getAttribute('aria-invalid'),
    focus: document.activeElement === input,
    lines: lines.map((l) => l.textContent),
    lineId: line?.id ?? null,
    lineRole: line?.getAttribute('role') ?? null,
    describedby,
    describedResolved: line ? describedby.includes(line.id) && document.getElementById(line.id) === line : false,
    errormessage: input.getAttribute('aria-errormessage'),
    gapBelowFrame: line ? Math.round((r(line).top - r(frame).bottom) * 100) / 100 : null,
    // Field 裡:說明行要是 Field 欄的直接子元素、排在說明文字後面,間距 = 欄的 row-gap
    inFieldColumn: line && fieldCol ? line.parentElement === fieldCol || line.parentElement?.parentElement === fieldCol && fieldCol.getAttribute('data-field-orientation') === 'horizontal' : null,
    afterDescription: line && desc ? !!(desc.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
    gapBelowDescription: line && desc ? Math.round((r(line).top - r(desc).bottom) * 100) / 100 : null,
    fieldGap: fieldCol ? parseFloat(getComputedStyle(line?.parentElement ?? fieldCol).rowGap) : null,
  }
}, key)
async function field(key, what) {
  const s = await probe(key)
  if (!s) throw new Instrument(`${what}:找不到欄位 ${key}`)
  return s
}
const invalidLog = async () => {
  const raw = await page.evaluate(() => document.querySelector('[data-eti-log]')?.getAttribute('data-eti-log') ?? null)
  if (raw == null) throw new Instrument('夾具裡找不到 onInvalidChange 紀錄')
  return raw ? raw.split('|') : []
}
async function clickInput(key, what) {
  const b = await page.evaluate((key) => {
    const el = document.querySelector(`[data-eti="${key}"] input`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  }, key)
  if (!b) throw new Instrument(`${what}:欄位 ${key} 找不到輸入框`)
  await page.mouse.click(b.x, b.y)
  await settle(what)
}
async function press(key, what) { await page.keyboard.press(key); await settle(what) }

// ── 字數計數(C 組;field-controls.spec.md「字數計數」)的量具 ──
/** 某個有計數的欄位(data-eti)此刻的狀態;輸入元素 = input 或 textarea */
const probeCount = (key) => page.evaluate((key) => {
  const host = document.querySelector(`[data-eti="${key}"]`)
  const control = host?.querySelector('input, textarea')
  if (!host || !control) return null
  const counts = [...host.querySelectorAll('[data-field-slot="count"]')]
  const count = counts[0] ?? null
  const row = count?.parentElement ?? null
  const desc = host.querySelector('[data-field-slot="description"]')
  // 框 = 輸入元素往上最近的 data-field-mode(Input 是外框 div,Textarea 是自己)
  const frame = control.closest('[data-field-mode="edit"]') ?? control
  const r = (el) => el.getBoundingClientRect()
  const round = (n) => Math.round(n * 100) / 100
  const describedby = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
  const status = host.querySelector('[data-field-count-status]')
  // 讀屏念的字 = 計數那一格裡沒有 aria-hidden 的字(看得見的「12 / 100」對讀屏隱藏)
  const spoken = count ? [...count.childNodes].filter((n) => !(n.nodeType === 1 && n.getAttribute('aria-hidden') === 'true')).map((n) => n.textContent).join('').trim() : null
  const cs = (el) => (el ? { size: getComputedStyle(el).fontSize, color: getComputedStyle(el).color } : null)
  return {
    counts: counts.length,
    visible: count?.querySelector('[aria-hidden="true"]')?.textContent ?? null,
    valueLength: control.value.length,
    focus: document.activeElement === control,
    countId: count?.id ?? null,
    describedby,
    describedResolved: count ? describedby.includes(count.id) && document.getElementById(count.id) === count : false,
    spoken,
    statusRole: status?.getAttribute('role') ?? null,
    statusLive: status?.getAttribute('aria-live') ?? null,
    statusText: status?.textContent ?? null,
    statusOutsideCount: status && count ? !count.contains(status) : null,
    // 說明那一行:計數跟說明同一行(上緣相同)、計數在說明右邊不重疊;計數右緣 = 欄右緣(框右緣)
    rowChildren: row ? [...row.children].filter((c) => getComputedStyle(c).position !== 'absolute').length : null,
    sameRowAsDesc: count && desc ? Math.abs(r(count).top - r(desc).top) < 0.5 : null,
    rightOfDesc: count && desc ? r(count).left >= r(desc).right - 0.5 : null,
    countRightGap: count ? round(r(frame).right - r(count).right) : null,
    gapBelowFrame: row ? round(r(row).top - r(frame).bottom) : null,
    countStyle: cs(count),
    descStyle: cs(desc),
  }
}, key)
async function countField(key, what) {
  const s = await probeCount(key)
  if (!s) throw new Instrument(`${what}:找不到欄位 ${key}`)
  return s
}
async function clickControl(key, what) {
  const b = await page.evaluate((key) => {
    const el = document.querySelector(`[data-eti="${key}"] input, [data-eti="${key}"] textarea`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  }, key)
  if (!b) throw new Instrument(`${what}:欄位 ${key} 找不到輸入元素`)
  await page.mouse.click(b.x, b.y)
  await settle(what)
}
/** 等播報區出現字(等的是那個元素本身的內容,不是固定睡眠);等不到 = 回 null 交給斷言紅 */
async function waitStatusText(key, ms) {
  try {
    await page.waitForFunction((key) => !!document.querySelector(`[data-eti="${key}"] [data-field-count-status]`)?.textContent, key, { timeout: ms })
  } catch { return null }
  return (await countField(key, '等播報')).statusText
}
const countText = (n, max) => `${n} / ${max}`

const results = []
const ck = (group, name, ok, detail) => results.push({ group, name, ok: !!ok, detail })
const J = (v) => JSON.stringify(v)
const near = (a, b) => a != null && b != null && Math.abs(a - b) < 0.5

async function runChecks() {
  await openFixture()
  // ── E7:外部存進來、本身不是網址的值 —— 一掛上不驗(blur 驗證,form-validation.spec.md 規則 1–2)──
  for (const key of ['custom', 'field']) {
    const s = await field(key, `E7 掛上 ${key}`)
    ck('E7', `${key}:一掛上沒有紅框、沒有說明、沒有 aria-invalid`, !s.error && s.ariaInvalid == null && s.lines.length === 0, J(s))
  }
  // ── E7 → E4:點進 custom(還沒離開不驗),Tab 離開才出現換過的字 ──
  await clickInput('custom', '點進 custom')
  const cf = await field('custom', 'E7 點進 custom')
  if (!cf.focus) throw new Instrument(`點進 custom 之後焦點不在輸入框:${J(cf)}`)
  ck('E7', 'custom:點進去、還沒離開也不驗', !cf.error && cf.lines.length === 0, J(cf))
  await press('Tab', 'custom Tab 離開')
  const custom = await field('custom', 'E4')
  ck('E4', 'errorText 換字生效(離開欄位之後)', custom.error && custom.lines.length === 1 && custom.lines[0] === FIXTURE_CUSTOM, J(custom))
  ck('E4', '換字那一行也接上 aria-describedby', custom.describedResolved, J(custom))
  // ── E7 → E5:Tab 進到 field(還沒離開不驗),再 Tab 離開 → 畫在 Field 的錯誤區 ──
  const ff = await field('field', 'E7 Tab 進 field')
  if (!ff.focus) throw new Instrument(`從 custom 按 Tab 沒進到 field 的輸入框:${J(ff)}`)
  ck('E7', 'field:Tab 進來、還沒離開也不驗', !ff.error && ff.lines.length === 0, J(ff))
  await press('Tab', 'field Tab 離開')
  const inField = await field('field', 'E5')
  ck('E5', 'Field 裡:欄裡只有一行、是預設說明', inField.error && inField.lines.length === 1 && inField.lines[0] === DEFAULT_TEXT, J(inField))
  ck('E5', 'Field 裡:畫在 Field 的錯誤區(Field 欄的子元素、說明文字下面、間距 = 欄內 gap)',
    inField.inFieldColumn === true && inField.afterDescription === true && near(inField.gapBelowDescription, inField.fieldGap), J(inField))
  ck('E5', 'Field 裡:id = aria-errormessage 且在 aria-describedby 裡', inField.lineId && inField.errormessage === inField.lineId && inField.describedResolved, J(inField))
  // ── E6:Tab 進到 consumer 再離開(LinkInput 自己也驗出不合法)→ 只有使用端那一行 ──
  const pf = await field('consumer', 'E6 Tab 進 consumer')
  if (!pf.focus) throw new Instrument(`從 field 按 Tab 沒進到 consumer 的輸入框:${J(pf)}`)
  await press('Tab', 'consumer Tab 離開')
  const consumer = await field('consumer', 'E6')
  ck('E6', 'Field 裡使用端的 FieldError 有字:只有使用端那一行', consumer.error && consumer.lines.length === 1 && consumer.lines[0] === FIXTURE_CONSUMER, J(consumer))
  // ── E1:打不是網址的字、Tab 離開 ──
  const before = await field('typed', 'E1 前置')
  if (before.lines.length || before.error) throw new Instrument(`E1 前置:空白欄位一開始就有錯誤:${J(before)}`)
  await clickInput('typed', '點空白欄位')
  await page.keyboard.type(TYPED_DRAFT); await settle('打字')
  await press('Tab', 'Tab 離開')
  const a = await field('typed', 'E1')
  const logA = await invalidLog()
  ck('E1', '框下一行預設說明(role="alert")、紅框、aria-invalid', a.error && a.ariaInvalid === 'true' && a.lines.length === 1 && a.lines[0] === DEFAULT_TEXT && a.lineRole === 'alert', J(a))
  ck('E1', '說明離框下緣 4px(= Field 欄內 gap-1)', near(a.gapBelowFrame, 4), J(a))
  ck('E1', 'aria-describedby 連得到這一行、aria-errormessage 指到同一行', a.describedResolved && a.errormessage === a.lineId, J(a))
  ck('E1', 'onInvalidChange 收到 true + 草稿', logA[logA.length - 1] === `true:${TYPED_DRAFT}`, J(logA))
  // ── E2:接著打字 → 說明消失 ──
  const goneId = a.lineId
  await clickInput('typed', '點回欄位')
  await page.keyboard.press('End'); await page.keyboard.type('x'); await settle('再打字')
  const b = await field('typed', 'E2')
  const logB = await invalidLog()
  ck('E2', '打字 → 說明與紅框一起消失', !b.error && b.lines.length === 0, J(b))
  ck('E2', '打字 → aria-describedby 不再指那一行', !goneId || !b.describedby.includes(goneId), J(b))
  ck('E2', 'onInvalidChange 收到 false', logB[logB.length - 1] === `false:${TYPED_DRAFT}x`, J(logB))
  // ── E3:Enter 結算不合法 → 說明出現、焦點留在輸入框 ──
  await press('Enter', 'Enter')
  const c = await field('typed', 'E3')
  ck('E3', 'Enter 結算不合法:說明出現、焦點留在輸入框', c.error && c.lines.length === 1 && c.lines[0] === DEFAULT_TEXT && c.focus, J(c))
  await runCountChecks()
}

// ── C 組:字數計數(field-controls.spec.md「字數計數」;2026-11-26 C7 user 點選「A:放在說明那一行的右端(「12 / 100」);沒有說明時那一行只有計數」)──
// 期望值都從同一頁量出來(輸入元素的 value.length、說明文字的 computed style),不在這裡另抄數字;上限 100 / 10 / 30 = 夾具寫死的 maxLength。
async function runCountChecks() {
  // C1 計數在說明那一行的右端
  const d = await countField('count-desc', 'C1')
  ck('C1', '有說明:欄裡正好一個計數、跟說明同一行、在說明右邊不重疊', d.counts === 1 && d.sameRowAsDesc === true && d.rightOfDesc === true, J(d))
  ck('C1', '有說明:計數右緣 = 欄右緣(框右緣)、說明那一行離框下緣 4px(= Field 欄內 gap-1)', near(d.countRightGap, 0) && near(d.gapBelowFrame, 4), J(d))
  ck('C1', '字級 / 顏色 = 說明文字', d.countStyle && d.descStyle && d.countStyle.size === d.descStyle.size && d.countStyle.color === d.descStyle.color, J(d))
  ck('C1', `看得見的字 = 「字數 / 上限」`, d.visible === countText(d.valueLength, 100), J(d))
  // C2 沒有說明時那一行只有計數(右端)
  const o = await countField('count-only', 'C2')
  ck('C2', '沒有說明:那一行只有計數、在右端(右緣 = 框右緣)、緊接框下 4px', o.counts === 1 && o.rowChildren === 1 && near(o.countRightGap, 0) && near(o.gapBelowFrame, 4), J(o))
  ck('C2', '沒有說明:字級 / 顏色仍 = 說明文字(取同頁 count-desc 的說明)', o.countStyle && d.descStyle && o.countStyle.size === d.descStyle.size && o.countStyle.color === d.descStyle.color, J({ o: o.countStyle, desc: d.descStyle }))
  // C5 單獨用(不在 Field 裡):框下一行、右端
  const a = await countField('count-alone', 'C5')
  ck('C5', '單獨用:框下 4px 一行只有計數、右緣 = 框右緣、「0 / 30」', a.counts === 1 && a.rowChildren === 1 && near(a.countRightGap, 0) && near(a.gapBelowFrame, 4) && a.visible === countText(a.valueLength, 30), J(a))
  ck('C5', '單獨用:輸入框 aria-describedby 連得到計數', a.describedResolved, J(a))
  // C4 讀屏關聯(打字前):aria-describedby 連得到計數那一格;念的是整句(含字數與上限)、播報區在那一格外面、禮貌模式
  ck('C4', 'aria-describedby 連得到計數那一格', d.describedResolved, J(d))
  ck('C4', '計數那一格念的字含目前字數與上限(看得見的「n / max」對讀屏隱藏)', !!d.spoken && d.spoken.includes(String(d.valueLength)) && d.spoken.includes('100') && !d.spoken.includes(' / '), J(d))
  ck('C4', '播報區 role="status" + aria-live="polite"、在計數那一格外面(不會被描述念兩次)、打字前沒有字', d.statusRole === 'status' && d.statusLive === 'polite' && d.statusOutsideCount === true && !d.statusText, J(d))
  // C3 打字後計數更新
  await clickControl('count-desc', 'C3 點工單標題')
  await page.keyboard.press('End'); await page.keyboard.type('(iOS)'); await settle('C3 打字')
  const t = await countField('count-desc', 'C3')
  if (!t.focus) throw new Instrument(`C3:點進 count-desc 之後焦點不在輸入框:${J(t)}`)
  ck('C3', '打字後計數跟著變 = 輸入框目前的字數', t.valueLength === d.valueLength + 5 && t.visible === countText(t.valueLength, 100), J({ before: d.valueLength, after: t }))
  // C4 播報:停下來之後、焦點還在 → 念一次目前的整句(等的是播報區本身出現字,不是固定睡眠)
  const said = await waitStatusText('count-desc', 4000)
  const t2 = await countField('count-desc', 'C4 播報後')
  ck('C4', '停下來之後以禮貌模式念一次目前的整句(= 計數那一格念的字)', said != null && said === t2.spoken && t2.spoken.includes(String(t2.valueLength)), J({ said, spoken: t2.spoken }))
  // C3 打到上限擋住(原生 maxLength;上限 10)
  await clickControl('count-only', 'C3 點付款備註')
  await page.keyboard.press('End'); await page.keyboard.type('月結三十天匯款請附發票'); await settle('C3 打超過上限')
  const b = await countField('count-only', 'C3 上限')
  ck('C3', '打到上限擋住:字數停在 10、計數「10 / 10」', b.valueLength === 10 && b.visible === countText(10, 10), J(b))
}

// 對照組:每組破法 → 指定的組必須至少一條紅
const MUTANTS = [
  { name: 'M1 不畫說明', patches: [[/const errorLineText(\d*) = /g, (_, n) => `const errorLineText${n} = null && `]], mustRed: ['E1', 'E4', 'E5'] },
  { name: 'M2 aria-describedby 不接說明', patches: [[/,\s*errorLineId\d*\s*\]\s*\.filter\(Boolean\)/g, '].filter(Boolean)']], mustRed: ['E1'] },
  { name: 'M3 Field 不讓使用端的字優先', patches: [[/!consumerErrorShown\d*/g, 'true']], mustRed: ['E6'] },
  { name: 'M4 打字不清錯誤', patches: [[/if \(localError\d*\) setLocalError\d*\(false\);?/g, '']], mustRed: ['E2'] },
  // 紅框的初值改成「值非空白就紅」:值的識別字取自緊鄰的上一行 useState(<值> ?? "")(esbuild 撞名會加數字尾碼,不寫死)
  {
    name: 'M5 外部存進來的值一掛上就驗',
    patches: [[/(useState\((\w+) \?\? ""\);\s*const \[localError\d*, setLocalError\d*\] = \w+\.useState\()false\)/g,
      (_, head, v) => `${head}() => !!${v} && ${v}.trim() !== "")`]],
    mustRed: ['E7'],
  },
  // ── 字數計數(C 組)的對照組:改的是送到瀏覽器的 field-count.tsx / field.tsx / input.tsx / textarea.tsx 打包結果 ──
  // M6 Field 不把說明那一行換成「說明 + 計數」(= 計數沒畫在 Field 裡):有說明 / 沒說明兩格都沒有計數,describedby 指到不存在的 id
  { name: 'M6 Field 不畫計數', patches: [[/const descriptionArea(\d*) = controlCount\d* \?/g, (_, n) => `const descriptionArea${n} = false ?`]], mustRed: ['C1', 'C2', 'C4'] },
  // M7 計數掉到說明下面一行(說明那一行改成上下疊)
  { name: 'M7 計數不在說明那一行', patches: [[/"flex items-start gap-x-3 min-w-0"/g, '"flex flex-col gap-x-3 min-w-0"']], mustRed: ['C1'] },
  // M8 計數不靠右端(沒有說明時就會落在左邊)
  { name: 'M8 計數不靠右', patches: [[/"ml-auto shrink-0 whitespace-nowrap tabular-nums"/g, '"shrink-0 whitespace-nowrap tabular-nums"']], mustRed: ['C2', 'C5'] },
  // M9 打字後計數不更新(字數恆為 0)
  { name: 'M9 打字不更新計數', patches: [[/String\((\w+) \?\? ""\)\.length/g, '0']], mustRed: ['C3'] },
  // M10 輸入元素的 aria-describedby 不接計數
  { name: 'M10 aria-describedby 不接計數', patches: [[/,\s*charCount\d*\.countId\s*\]/g, ']']], mustRed: ['C4', 'C5'] },
  // M11 停下來之後不念(播報區永遠空白)
  { name: 'M11 播報區不念', patches: [[/text: countSpeech\d*\(\{[^}]*\}\)/g, 'text: ""']], mustRed: ['C4'] },
  // M12 控件吞掉原生 maxLength(展開 props 之後再蓋成 undefined)→ 超過上限照打
  {
    name: 'M12 原生 maxLength 沒傳到輸入元素',
    patches: [[/(\.\.\.(props\d*),\s*onChange: \((\w+)\) => \{\s*setResolved\d*\(\3\.target\.value\);\s*\2\.onChange\?\.\(\3\);\s*\})/g, (_, all) => `${all}, maxLength: void 0`]],
    mustRed: ['C3'],
  },
]

try {
  if (!SELFTEST) {
    await setMode()
    await runChecks()
    for (const r of results) console.log(`${r.ok ? '✓' : '✗'} [${r.group}] ${r.name}${r.ok ? '' : ` | ${r.detail}`}`)
    const red = results.filter((r) => !r.ok)
    if (!results.length) await bail('一條斷言都沒跑到')
    console.log(red.length ? `\n✗ ${red.length} / ${results.length} 條未通過` : `\n✓ LinkInput 錯誤說明 + 字數計數:${results.length} 條全部通過`)
    await br.close(); await stopServers(); process.exit(red.length ? 1 : 0)
  }
  let bad = 0
  for (const m of MUTANTS) {
    results.length = 0
    // 每組的改寫要對 replace 用的 RegExp 重設 lastIndex(g 旗標):每次 route 都用新的副本
    await setMode(m.patches.map(([re, to]) => [new RegExp(re.source, re.flags), to]))
    await runChecks()
    if (patched === 0) await bail(`${m.name}:送到瀏覽器的夾具程式裡改寫 0 處(破法沒套上)`)
    const reds = new Set(results.filter((r) => !r.ok).map((r) => r.group))
    const missing = m.mustRed.filter((g) => !reds.has(g))
    if (missing.length) {
      bad++
      console.log(`✗ ${m.name}:${missing.join(' / ')} 沒有紅(破法沒被量到)`)
      for (const r of results) console.log(`    ${r.ok ? '✓' : '✗'} [${r.group}] ${r.name} | ${r.detail}`)
    } else {
      const named = results.filter((r) => !r.ok).map((r) => `[${r.group}] ${r.name}`)
      console.log(`✓ ${m.name}:紅 —— ${named.join(';')}(改寫 ${patched} 處)`)
    }
  }
  console.log(bad ? `\n✗ 對照組 ${bad} / ${MUTANTS.length} 組沒紅` : `\n✓ 對照組 ${MUTANTS.length} 組全部紅(量具會紅)`)
  await br.close(); await stopServers(); process.exit(bad ? 1 : 0)
} catch (e) {
  if (e instanceof Instrument) await bail(e.message)
  throw e
}
