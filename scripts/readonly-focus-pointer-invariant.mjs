#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 唯讀欄位滑鼠點**不變**、鍵盤進來才出 1px 主色邊框(focus-canonical.md 規則二「唯讀的 Field 控件」列;
 *        field-controls.spec.md「Focus 行為」readonly 段;user 2026-11-11 逐字「確認 polaris真的就是這樣的話那就照你建議」)——
 *        10 則 story 裡每一個可聚焦的唯讀欄位(Input / Textarea / NumberInput / Select ×2 / Combobox ×2 / DatePicker / TimePicker /
 *        LinkInput 連結 / PeoplePicker 頭像 / Field 內唯讀 Input · Checkbox ×2 · Switch · RadioGroup,共 16 個):
 *        P 指標情境(外框 = 點之前的顏色,焦點元素沒有外描邊):P1 滑鼠點 / P2 點過再只按住 Shift / P3 Tab 進來後再用滑鼠點同一個 /
 *          P4 點欄位標籤(label for,只有原生文字框有);
 *        K 鍵盤(一個 tab stop 只有一個指示器):欄位自己或裡面的文字框拿到焦點 → 外框 1px、顏色 = --primary、焦點元素沒有外描邊;
 *          裡面自己會畫框的東西(LinkInput 連結、PeoplePicker 頭像)拿到焦點 → 它自己 2px --ring 外描邊、外框維持點之前的顏色;
 *          K1 Tab 進來 / K2 滑鼠點過再按 → 鍵;
 *        E 不得誤傷(同頁可編輯文字欄位):滑鼠點 → 外框 = --primary。
 *        量測:每一步之後 settleAfterInteraction + 焦點穩定,再等外框顏色與焦點元素外描邊連 3 幀同值(過渡中的中間值不算,M32)才讀。
 *   紅: 修前(d817a4b6 之前的 readonly compound:wrapper `focus-within:!border-primary`、textarea `focus-visible:!border-primary`)P 全紅、
 *        LinkInput / PeoplePicker 的 K 紅(兩個指示器)。`--selftest` 在真建置上跑兩種破法:
 *        (a) 還原舊 CSS(注入與舊 class 同義的規則)→ 全部 P 與「裡面自己畫框」的 K 必紅,其餘 K 與 E 必綠;
 *        (b) 拿掉 guard(MutationObserver 隨時剝掉 data-pointer-focus)→ 文字框的 P1、全部 P2 / P3 / P4 必紅,div 型與連結 / 頭像的 P1、
 *            全部 K 與 E 必綠(證明 CSS 與 JS 各自不可少,而且 E 不受影響)。
 *        找不到欄位 / 點不到它自己 / 焦點不穩 / 外框一直在變 = INSTRUMENT-FAIL(exit 2)。
 *   綠: 修好的建置 P 全部不變、K 全部恰好一個指示器、E 全部亮。
 *   node scripts/readonly-focus-pointer-invariant.mjs [--build=<storybook 建置目錄>] [--selftest]
 */
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowserOrSkip, openStory, requireStorybookBuild, requireFreshStorybookBuild, settleAfterInteraction, waitForFocusStable, parkPointer, INSTRUMENT_FAIL_MARKER } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
const buildArg = process.argv.find((a) => a.startsWith('--build='))?.slice('--build='.length)
const STATIC = buildArg ? (isAbsolute(buildArg) ? buildArg : join(process.cwd(), buildArg)) : join(REPO, 'storybook-static')
requireStorybookBuild(join(STATIC, 'index.json'))
if (!buildArg) {
  requireFreshStorybookBuild(STATIC, [
    'packages/design-system/src/components/Field', 'packages/design-system/src/lib/pointer-focus-guard.ts', 'packages/design-system/src/styles/base.css',
    'packages/design-system/src/components/Input', 'packages/design-system/src/components/Textarea', 'packages/design-system/src/components/NumberInput',
    'packages/design-system/src/components/Select', 'packages/design-system/src/components/Combobox', 'packages/design-system/src/components/DatePicker',
    'packages/design-system/src/components/TimePicker', 'packages/design-system/src/components/LinkInput', 'packages/design-system/src/components/PeoplePicker',
    'packages/design-system/src/components/Checkbox', 'packages/design-system/src/components/Switch', 'packages/design-system/src/components/RadioGroup',
  ])
}

// 每則 story 裡唯讀欄位的數量是盤點出來的期望值:數到的少於它 = 找不到要量的東西(儀器失效),不是「少量幾個也算過」
const STORIES = [
  { id: 'design-system-components-input-展示--modes', readonly: 1, edit: true },
  { id: 'design-system-components-textarea-設計規格--mode-matrix', readonly: 1, edit: true },
  { id: 'design-system-components-numberinput-展示--modes', readonly: 1, edit: true },
  { id: 'design-system-components-select-展示--modes', readonly: 2 },
  { id: 'design-system-components-combobox-展示--modes', readonly: 2 },
  { id: 'design-system-components-datepicker-展示--modes', readonly: 1 },
  { id: 'design-system-components-timepicker-展示--modes', readonly: 1 },
  { id: 'design-system-components-linkinput-展示--modes', readonly: 1 },
  { id: 'design-system-components-peoplepicker-設計規格--mode-matrix', readonly: 1 },
  { id: 'design-system-components-field-展示--state-cascade', readonly: 5 },
]
const HOST = '[data-field-mode]:not([data-field-orientation])'

// 破法(a):舊 CSS —— 與 2026-11-11 前的 readonly compound 同義(wrapper focus-within、textarea focus-visible 就轉主色)
const OLD_CSS = `${HOST}[data-field-mode="readonly"]:not(textarea):focus-within{border-color:var(--primary)!important}`
  + `textarea[data-field-mode="readonly"]:focus-visible{border-color:var(--primary)!important}`

let failCount = 0
let instrumentFail = false
const instrument = (name, detail) => { instrumentFail = true; console.log(`✗ ${INSTRUMENT_FAIL_MARKER} ${name} | ${detail}`) }

/**
 * 每一列宣告它在三種跑法下該紅還是該綠;expect = 'green' | 'red'。
 * 真跑:一律 green。selftest 破法 (a) / (b) 各自照表。
 */
const check = (mode, name, pass, detail, expect) => {
  const wantRed = expect === 'red'
  const ok = wantRed ? !pass : pass
  const tag = mode === 'real' ? '' : `[${mode}${wantRed ? ' 應紅' : ' 應綠'}] `
  console.log(`${ok ? '✓' : '✗'} ${tag}${name}${detail ? ` | ${detail}` : ''}`)
  if (!ok) failCount++
}

const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html', snapshot: true })
const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 })
const page = await context.newPage()
// 保險:連結的點擊預設動作已在頁面裡攔下;萬一還是開了新分頁,直接關掉(本閘只量焦點)
context.on('page', (p) => { if (p !== page) p.close().catch(() => {}) })

/** 開 story、標記唯讀欄位與可編輯文字欄位、依破法裝上破壞 */
async function open(story, mode) {
  await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`, {
    waitFor: (n) => document.querySelectorAll('[data-field-mode="readonly"]:not([data-field-orientation])').length >= n,
    waitForArg: story.readonly, settleFrames: 6, notFound: server.notFound,
  })
  return page.evaluate(({ HOST, mode, OLD_CSS }) => {
    const FOCUSABLE = 'input:not([type=hidden]),textarea,a[href],button,[tabindex]:not([tabindex="-1"])'
    // 連結:按下去照常聚焦,但不開新分頁(焦點在 mousedown 就給了,點擊的預設動作與本閘無關)
    document.addEventListener('click', (e) => { if (e.target instanceof Element && e.target.closest('a[href]')) e.preventDefault() }, true)
    const hosts = [...document.querySelectorAll(HOST)].filter((h) => h.getAttribute('data-field-mode') === 'readonly')
    const ro = []
    hosts.forEach((h, i) => {
      const target = h.matches(FOCUSABLE) ? h : h.querySelector(FOCUSABLE)
      if (!target) return
      h.setAttribute('data-ro-host', String(i))
      target.setAttribute('data-ro-target', String(i))
      const kind = target === h && !h.matches('input,textarea') ? 'self' : target.matches('input,textarea') ? 'text' : 'inner'
      const label = target.id ? document.querySelector(`label[for="${CSS.escape(target.id)}"]`) : null
      if (label) label.setAttribute('data-ro-label', String(i))
      ro.push({ i: String(i), kind, who: `${target.tagName.toLowerCase()}${target.getAttribute('role') ? `[role=${target.getAttribute('role')}]` : ''}`,
        name: (h.getAttribute('aria-label') || h.closest('[data-field-orientation]')?.querySelector('label')?.textContent || target.getAttribute('aria-label') || h.textContent || '').trim().slice(0, 16),
        label: !!label })
    })
    const edit = [...document.querySelectorAll(HOST)].filter((h) => h.getAttribute('data-field-mode') === 'edit')
      .map((h, k) => { const t = h.matches('input,textarea') ? h : h.querySelector('input:not([type=hidden]),textarea'); if (!t) return null; h.setAttribute('data-ed-host', String(k)); t.setAttribute('data-ed-target', String(k)); return String(k) })
      .filter(Boolean)
    if (mode === 'css') { const s = document.createElement('style'); s.textContent = OLD_CSS; document.head.appendChild(s) }
    if (mode === 'guard') {
      const strip = () => document.querySelectorAll('[data-pointer-focus]').forEach((el) => el.removeAttribute('data-pointer-focus'))
      new MutationObserver(strip).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-pointer-focus'] })
    }
    return { ro, edit }
  }, { HOST, mode, OLD_CSS })
}

/** 焦點回到 body(用滑鼠點一個中性位置),拿掉哨兵,讀靜止時外框顏色 */
async function reset(hostSel) {
  const spot = await parkPointer(page)
  await page.mouse.click(spot.x, spot.y)
  await settleAfterInteraction(page, { frames: 4, capMs: 6000 })
  return page.evaluate((hostSel) => {
    document.querySelectorAll('[data-ro-sentinel]').forEach((s) => s.remove())
    const h = document.querySelector(hostSel)
    return { body: document.activeElement === document.body || document.activeElement === document.documentElement, rest: h ? getComputedStyle(h).borderTopColor : null }
  }, hostSel)
}

/** 滑鼠點元素自己(中心點命中的必須在它裡面) */
async function mouseClick(sel) {
  const at = await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return { ok: false, why: `找不到 ${sel}` }
    el.scrollIntoView({ block: 'center', behavior: 'instant' })
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    const hit = document.elementFromPoint(x, y)
    if (!hit || !(el.contains(hit) || hit.contains(el) || hit.closest('[data-ro-host]') === el.closest('[data-ro-host]'))) return { ok: false, why: `中心點命中的是 ${hit?.tagName}` }
    return { ok: true, x, y }
  }, sel)
  if (!at.ok) return at
  await page.mouse.click(at.x, at.y)
  await parkPointer(page)
  return at
}

/** 哨兵放在欄位正前方(絕對定位,不佔版面),程式聚焦哨兵後按 Tab = 真的用鍵盤進到欄位 */
async function tabInto(i) {
  await page.evaluate((i) => {
    const h = document.querySelector(`[data-ro-host="${i}"]`)
    const s = document.createElement('button')
    s.setAttribute('data-ro-sentinel', '')
    s.setAttribute('aria-hidden', 'true')
    s.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;margin:0;padding:0;border:0'
    h.before(s)
    s.focus()
  }, i)
  await page.keyboard.press('Tab')
}

/** 等穩定,再等外框顏色 / 焦點元素外描邊連 3 幀同值 */
async function measure(hostSel, targetSel) {
  const a = await settleAfterInteraction(page, { frames: 6, capMs: 6000 })
  const f = await waitForFocusStable(page, { frames: 6, capMs: 6000 })
  if (!a.ok || !f.ok) return { error: `畫面或焦點不穩(settle ${a.ok} / focus ${f.ok})` }
  return page.evaluate(({ hostSel, targetSel }) => new Promise((resolve) => {
    const probe = (v) => { const p = document.createElement('div'); p.style.color = `var(${v})`; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c }
    const primary = probe('--primary'); const ring = probe('--ring')
    let last = null; let same = 0; let n = 0
    const tick = () => {
      const h = document.querySelector(hostSel)
      const t = document.querySelector(targetSel)
      const act = document.activeElement
      if (!h || !t) { resolve({ error: '欄位不見了' }); return }
      const hs = getComputedStyle(h); const as = getComputedStyle(act)
      const now = `${hs.borderTopColor}|${hs.borderTopWidth}|${as.outlineStyle}|${as.outlineWidth}|${as.outlineColor}`
      same = now === last ? same + 1 : 0; last = now; n += 1
      if (same >= 3) {
        resolve({ border: hs.borderTopColor, borderWidth: hs.borderTopWidth, outline: as.outlineStyle !== 'none' && parseFloat(as.outlineWidth) > 0,
          outlineDesc: `${as.outlineStyle} ${as.outlineWidth} ${as.outlineColor}`, outlineRing: as.outlineStyle === 'solid' && as.outlineWidth === '2px' && as.outlineColor === ring,
          onTarget: act === t, inHost: h.contains(act), active: `${act.tagName.toLowerCase()}${act.getAttribute('role') ? `[role=${act.getAttribute('role')}]` : ''}`,
          attr: act.hasAttribute('data-pointer-focus'), primary })
      } else if (n > 120) resolve({ error: `外框 / 外描邊 120 幀一直在變(最後 ${now})` })
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }), { hostSel, targetSel })
}

/** P:指標情境 —— 外框 = 點之前、焦點元素沒有外描邊 */
function judgeNone(m, rest) { return m.border === rest && !m.outline }
/** K:恰好一個指示器 */
function judgeOne(m, kind) {
  return kind === 'inner'
    ? m.outlineRing && m.border !== m.primary
    : m.border === m.primary && m.borderWidth === '1px' && !m.outline
}
const show = (m, rest) => `焦點 ${m.active}${m.attr ? ' [data-pointer-focus]' : ''} 外框 ${m.borderWidth} ${m.border}${rest ? `(點之前 ${rest})` : ''} 外描邊 ${m.outlineDesc}`

/**
 * 每一列在三種跑法下的期望:real 一律 green;css = 還原舊 CSS;guard = 拿掉 guard。
 * 表的來源(不是猜的):舊 CSS 用 focus-within(滑鼠鍵盤都亮)→ 所有 P 亮、裡面自己畫框的 K 兩個指示器;
 * 拿掉 guard → 只剩瀏覽器 :focus-visible:文字框滑鼠點也判成立(Chromium is_text_input)、單獨的 Shift 算鍵盤、點已聚焦的元素不重算 —— 所以 P1 只有文字框紅。
 */
const EXPECT = {
  P1: (kind) => ({ css: 'red', guard: kind === 'text' ? 'red' : 'green' }),
  P2: () => ({ css: 'red', guard: 'red' }),
  P3: () => ({ css: 'red', guard: 'red' }),
  P4: () => ({ css: 'red', guard: 'red' }),
  K1: (kind) => ({ css: kind === 'inner' ? 'red' : 'green', guard: 'green' }),
  K2: (kind) => ({ css: kind === 'inner' ? 'red' : 'green', guard: 'green' }),
  E1: () => ({ css: 'green', guard: 'green' }),
}

async function runStory(story, mode) {
  const { ro, edit } = await open(story, mode)
  if (ro.length < story.readonly) { instrument(story.id, `可聚焦的唯讀欄位只找到 ${ro.length} 個,盤點是 ${story.readonly} 個`); return }
  if (story.edit && edit.length === 0) { instrument(story.id, '找不到同頁可編輯文字欄位(E 對照組)'); return }
  const exp = (key, kind) => (mode === 'real' ? 'green' : EXPECT[key](kind)[mode])
  for (const r of ro) {
    const hostSel = `[data-ro-host="${r.i}"]`, targetSel = `[data-ro-target="${r.i}"]`
    const tag = `${story.id.replace('design-system-components-', '')} #${r.i} ${r.who}「${r.name}」`
    const step = async (key, name, act, judge) => {
      const z = await reset(hostSel)
      if (!z.body) return instrument(`${key} ${tag}`, '重置後焦點沒有回到 body')
      try {
        const did = await act()
        if (did && did.ok === false) return instrument(`${key} ${tag}`, did.why)
        const m = await measure(hostSel, targetSel)
        if (m.error) return instrument(`${key} ${tag}`, m.error)
        if (!m.inHost) return instrument(`${key} ${tag}`, `焦點落在 ${m.active},不在要量的欄位裡`)
        check(mode, `${key} ${tag} ${name}`, judge(m, z.rest), show(m, z.rest), exp(key, r.kind))
      } finally {
        if (key === 'P2') await page.keyboard.up('Shift')
      }
    }
    await step('P1', '滑鼠點 → 不變', () => mouseClick(targetSel), (m, rest) => judgeNone(m, rest))
    await step('P2', '點過再只按住 Shift → 不變', async () => { const a = await mouseClick(targetSel); if (a.ok === false) return a; await page.keyboard.down('Shift') }, (m, rest) => judgeNone(m, rest))
    await step('P3', 'Tab 進來後再用滑鼠點同一個 → 不變', async () => { await tabInto(r.i); return mouseClick(targetSel) }, (m, rest) => judgeNone(m, rest))
    if (r.label) await step('P4', '點欄位標籤 → 不變', () => mouseClick(`[data-ro-label="${r.i}"]`), (m, rest) => judgeNone(m, rest))
    await step('K1', `Tab 進來 → ${r.kind === 'inner' ? '它自己的 2px 外描邊、外框不亮' : '外框 1px 主色'}`, () => tabInto(r.i), (m) => judgeOne(m, r.kind))
    await step('K2', `滑鼠點過再按 → → ${r.kind === 'inner' ? '它自己的 2px 外描邊、外框不亮' : '外框 1px 主色'}`, async () => { const a = await mouseClick(targetSel); if (a.ok === false) return a; await page.keyboard.press('ArrowRight') }, (m) => judgeOne(m, r.kind))
  }
  // E:同頁可編輯文字欄位,滑鼠點必須照舊亮(不得誤傷)。只量「點下去就是打字」的那三則(Input / Textarea / NumberInput);
  // Select / PeoplePicker 的可編輯欄位點下去會開浮層、焦點進浮層裡的搜尋框,量的就不是「外框」了
  for (const k of story.edit ? edit.slice(0, 1) : []) {
    const hostSel = `[data-ed-host="${k}"]`, targetSel = `[data-ed-target="${k}"]`
    const z = await reset(hostSel)
    if (!z.body) { instrument(`E1 ${story.id}`, '重置後焦點沒有回到 body'); continue }
    const did = await mouseClick(targetSel)
    if (did.ok === false) { instrument(`E1 ${story.id}`, did.why); continue }
    const m = await measure(hostSel, targetSel)
    if (m.error) { instrument(`E1 ${story.id}`, m.error); continue }
    check(mode, `E1 ${story.id.replace('design-system-components-', '')} 可編輯欄位滑鼠點 → 外框主色(不得誤傷)`, m.onTarget && m.border === m.primary, show(m, z.rest), exp('E1'))
  }
}

try {
  const modes = SELFTEST ? ['css', 'guard'] : ['real']
  for (const mode of modes) {
    if (mode !== 'real') console.log(`\n── 破法 ${mode === 'css' ? '(a) 還原舊 CSS' : '(b) 拿掉 guard'} ──`)
    for (const story of STORIES) await runStory(story, mode)
  }
} catch (error) {
  instrument('執行', String(error?.message ?? error).slice(0, 240))
}

await browser.close()
await server.stop()
if (instrumentFail) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:有量不到的項目(見上),不當成通過`); process.exit(2) }
console.log(failCount === 0 ? `✓ readonly-focus-pointer-invariant${SELFTEST ? ' --selftest' : ''}:全部相符` : `✗ readonly-focus-pointer-invariant:${failCount} 項不符`)
process.exit(failCount === 0 ? 0 : 1)
