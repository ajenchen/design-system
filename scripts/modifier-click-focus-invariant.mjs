#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 按著修飾鍵點下去之後不畫焦點框(focus-canonical.md「按鈕不屬於例外列」+「什麼時候畫(真焦點)」;lib/pointer-focus-guard.ts)——
 *        DataTable 專案排程(roadmap-all-in-one)的三種「修飾鍵+點擊」控件:排序區(Shift+點擊加進多重排序)、列勾選框與表格根節點
 *        (Shift+點擊選區間;點選取格空白處焦點落在根節點):
 *        P 指標情境(每格量完都必須**沒有**焦點框):點過再 Shift+點同一個 / Shift+點換欄再點同一欄 / 點過之後只按住 Shift /
 *          勾選框點過再 Shift+點 / 選取格空白處點過再 Shift+點兩次;排序區被 Shift+點過、指標移開後 ⌄ 欄位選單收起(寬 0)——
 *          ⌄ 的「格裡有鍵盤焦點」條件不得把 Shift 當鍵盤;
 *        K 鍵盤對照(每格必須**有**框,2px 實線、顏色 = --ring):點過排序區再按 Enter / 點過再 Shift+Enter / Tab 進排序區 /
 *          點過勾選框再按 Space / 點過選取格空白處再按 ↓ —— 證明框沒有被一起拿掉;
 *        N 一般點擊對照(沒有框):點排序區 / 點勾選框。
 *        量測:每一步之後 settleAfterInteraction + 焦點穩定,再等 outline 不再變化(連 3 幀同值,`transition-colors` 會帶 outline-color,M32)才讀
 *        document.activeElement 的 computed outline。
 *   紅: 修前(4e7a8572 建置,`--build=<那份建置>`):P 六格出框 → 紅;`--selftest` 在頁面掛一支 MutationObserver 隨時拿掉
 *        `data-pointer-focus`(等於修前)→ P 必紅、K / N 對照列必綠。找不到控件 / 焦點不穩 / outline 一直在變 = INSTRUMENT-FAIL(exit 2)。
 *   綠: 修好的建置 P 全部無框、K 全部有框、N 無框。
 *   node scripts/modifier-click-focus-invariant.mjs [--build=<storybook 建置目錄>] [--selftest]
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
if (!buildArg) requireFreshStorybookBuild(STATIC, ['packages/design-system/src/components/DataTable', 'packages/design-system/src/lib/pointer-focus-guard.ts', 'packages/design-system/src/styles/base.css'])

const ROADMAP = `iframe.html?id=${encodeURIComponent('design-system-components-datatable-展示--roadmap-all-in-one')}&viewMode=story`
const HEAD = '[role="columnheader"][data-column-id] [role="button"]'
const CHECKBOX = '[role="row"][data-row-index] [role="checkbox"]'
const SELECT_CELL = '[role="row"][data-row-index] [data-column-id="__select__"]'

let failCount = 0
let instrumentFail = false
const check = (group, name, pass, detail = '', { control = false } = {}) => {
  const expectRed = SELFTEST && !control
  const ok = expectRed ? !pass : pass
  console.log(`${ok ? '✓' : '✗'} ${expectRed ? '[對照組應紅] ' : SELFTEST ? '[對照列應綠] ' : ''}${group} ${name}${detail ? ` | ${detail}` : ''}`)
  if (!ok) failCount++
}
const instrument = (name, detail) => { instrumentFail = true; console.log(`✗ ${INSTRUMENT_FAIL_MARKER} ${name} | ${detail}`) }

const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html', snapshot: true })
const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
const context = await browser.newContext({ viewport: { width: 2600, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()

async function open() {
  await openStory(page, `${server.origin}/${ROADMAP}`, {
    waitFor: () => document.querySelectorAll('[role="columnheader"][data-column-id] [role="button"]').length >= 3 && document.querySelectorAll('[role="row"][data-row-index] [role="checkbox"]').length >= 6,
    settleFrames: 8, notFound: server.notFound,
  })
  if (SELFTEST) {
    // 破法 = 修前:屬性一掛上就拿掉
    await page.evaluate(() => {
      const strip = () => document.querySelectorAll('[data-pointer-focus]').forEach((el) => el.removeAttribute('data-pointer-focus'))
      new MutationObserver(strip).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-pointer-focus'] })
    })
  }
}

/** 等穩定後量焦點元素的外描邊;outline 連 3 幀同值才讀(過渡中的中間值不算) */
async function measure() {
  const a = await settleAfterInteraction(page, { frames: 6, capMs: 6000 })
  const f = await waitForFocusStable(page, { frames: 6, capMs: 6000 })
  if (!a.ok || !f.ok) return { error: `畫面或焦點不穩(settle ${a.ok} / focus ${f.ok})` }
  return page.evaluate(() => new Promise((resolve) => {
    let last = null; let same = 0; let n = 0
    const tick = () => {
      const el = document.activeElement
      const cs = getComputedStyle(el)
      const now = `${cs.outlineStyle}|${cs.outlineWidth}|${cs.outlineColor}`
      same = now === last ? same + 1 : 0; last = now; n += 1
      if (same >= 3) {
        const ring = getComputedStyle(document.documentElement).getPropertyValue('--ring').trim()
        const probe = document.createElement('div'); probe.style.color = ring; document.body.appendChild(probe)
        const ringColor = getComputedStyle(probe).color; probe.remove()
        resolve({ drawn: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0, style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, ringColor,
          who: `${el.tagName.toLowerCase()}[role=${el.getAttribute('role')}]`, attr: el.hasAttribute('data-pointer-focus') })
      } else if (n > 120) resolve({ error: `outline 120 幀一直在變(最後 ${now})` })
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }))
}

async function expectRing(group, name, want, { control = false, whoRe = null } = {}) {
  const m = await measure()
  if (m.error) return instrument(`${group} ${name}`, m.error)
  if (whoRe && !whoRe.test(m.who)) return instrument(`${group} ${name}`, `焦點落在 ${m.who},不是要量的控件`)
  const ok = want ? (m.drawn && m.style === 'solid' && m.width === '2px' && m.color === m.ringColor) : !m.drawn
  check(group, name, ok, `${m.who} outline=${m.style} ${m.width} ${m.color}${m.attr ? ' [data-pointer-focus]' : ''}`, { control })
}

const ROLE_BTN = /role=button/
const ROLE_CB = /role=checkbox/
const ROLE_TABLE = /role=table/

try {
  // ── P 指標情境:不得出框 ──
  await open()
  let h = page.locator(HEAD)
  await h.nth(0).click(); await h.nth(0).click({ modifiers: ['Shift'] })
  await expectRing('P', '排序區點過再 Shift+點同一個', false, { whoRe: ROLE_BTN })
  await open(); h = page.locator(HEAD)
  await h.nth(0).click({ modifiers: ['Shift'] }); await h.nth(1).click({ modifiers: ['Shift'] }); await h.nth(1).click({ modifiers: ['Shift'] })
  await expectRing('P', '排序區 Shift+點換欄、再 Shift+點同一欄(升冪 → 降冪)', false, { whoRe: ROLE_BTN })
  // ⌄ 欄位選單:指標移開後要收起(「格裡有鍵盤焦點」條件不得把 Shift 當鍵盤)
  await parkPointer(page)
  await settleAfterInteraction(page, { frames: 6, capMs: 6000 })
  const menuW = await page.evaluate(() => {
    const btn = document.activeElement
    const menu = btn?.closest('[role="columnheader"]')?.querySelector('[data-col-menu]')
    return menu ? menu.getBoundingClientRect().width : null
  })
  if (menuW == null) instrument('P ⌄ 欄位選單', '找不到 [data-col-menu]')
  else check('P', 'Shift+點過排序區、指標移開後 ⌄ 欄位選單收起', menuW === 0, `寬 ${menuW}px`)
  await open(); h = page.locator(HEAD)
  await h.nth(0).click(); await page.keyboard.down('Shift')
  await expectRing('P', '排序區點過之後只按住 Shift', false, { whoRe: ROLE_BTN })
  await page.keyboard.up('Shift')
  await open()
  let cb = page.locator(CHECKBOX)
  await cb.nth(0).click(); await cb.nth(3).click({ modifiers: ['Shift'] }); await cb.nth(3).click({ modifiers: ['Shift'] })
  await expectRing('P', '勾選框點過再 Shift+點同一個', false, { whoRe: ROLE_CB })
  await open()
  let sc = page.locator(SELECT_CELL)
  await sc.nth(0).click({ position: { x: 3, y: 3 } }); await sc.nth(3).click({ position: { x: 3, y: 3 }, modifiers: ['Shift'] })
  await expectRing('P', '選取格空白處點過再 Shift+點(焦點在表格根節點)', false, { whoRe: ROLE_TABLE })
  await sc.nth(5).click({ position: { x: 3, y: 3 }, modifiers: ['Shift'] })
  await expectRing('P', '選取格空白處再 Shift+點一次', false, { whoRe: ROLE_TABLE })

  // ── K 鍵盤對照:必須有框 ──
  await open(); h = page.locator(HEAD)
  await h.nth(0).click(); await page.keyboard.press('Enter')
  await expectRing('K', '排序區點過再按 Enter', true, { control: true, whoRe: ROLE_BTN })
  await open(); h = page.locator(HEAD)
  await h.nth(0).click(); await page.keyboard.press('Shift+Enter')
  await expectRing('K', '排序區點過再按 Shift+Enter', true, { control: true, whoRe: ROLE_BTN })
  await open(); h = page.locator(HEAD)
  await h.nth(1).click(); await page.keyboard.press('Shift+Tab')
  await expectRing('K', 'Shift+Tab 回到前一個表頭控件', true, { control: true })
  await open(); cb = page.locator(CHECKBOX)
  await cb.nth(0).click(); await page.keyboard.press('Space')
  await expectRing('K', '勾選框點過再按 Space', true, { control: true, whoRe: ROLE_CB })
  await open(); sc = page.locator(SELECT_CELL)
  await sc.nth(0).click({ position: { x: 3, y: 3 } }); await page.keyboard.press('ArrowDown')
  await expectRing('K', '選取格空白處點過再按 ↓(根節點)', true, { control: true, whoRe: ROLE_TABLE })

  // ── N 一般點擊對照:沒有框(修前修後都一樣)──
  await open(); h = page.locator(HEAD)
  await h.nth(0).click()
  await expectRing('N', '一般點排序區', false, { control: true, whoRe: ROLE_BTN })
  await open(); cb = page.locator(CHECKBOX)
  await cb.nth(0).click()
  await expectRing('N', '一般點勾選框', false, { control: true, whoRe: ROLE_CB })
} catch (error) {
  instrument('執行', String(error?.message ?? error).slice(0, 240))
}

await browser.close()
await server.stop()
if (instrumentFail) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:有量不到的項目(見上),不當成通過`); process.exit(2) }
console.log(failCount === 0 ? `✓ modifier-click-focus-invariant${SELFTEST ? ' --selftest' : ''}:全部相符` : `✗ modifier-click-focus-invariant:${failCount} 項不符`)
process.exit(failCount === 0 ? 0 : 1)
