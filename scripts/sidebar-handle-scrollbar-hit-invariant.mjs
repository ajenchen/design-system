#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: AppShell 側欄展開時,右緣「調整選單寬度」把手與側欄直捲軸搶同一段像素的地方,由捲軸收
 *        (`ds-canonical/references/hit-area-canonical.md`「例外的四個條件」第 4 條「外擴不得蓋住別的可點目標」與
 *        「不得蓋住別人的把手」—— 捲軸滑塊就是拖曳把手;`patterns/resize-handle/resize-handle.spec.md`「命中區」)。
 *        在「主側欄佈局 — Linear 式議題追蹤」1440×230(側欄內容比視窗高、會出捲軸)逐 px 用 `elementFromPoint` 量誰接指標:
 *          H1 捲軸浮出時,滑塊那一列從捲軸左緣到側欄右緣每一 px 都是捲軸(滑塊整條拖得到);
 *          H2 同一列側欄右緣外側 3px 仍是把手(resize-handle.spec「外側 3px 必須真的抓得到」);
 *          H3 捲軸沒出現的高度(側欄標頭那一列)把手照舊 7px;
 *          H4 指標離開側欄、捲軸收起後,滑塊那一列把手照舊 7px(只在捲軸出現那段讓)。
 *   紅: 修前(8eb473c7 建置,`--build=<那份建置>`):滑塊右側 5px 打到把手 → H1 紅(2026-11-05 實測滑塊 x232–239、把手 x236–243)。
 *        `--selftest`:同一份建置注入兩種破法 —— 捲軸 z-index 拿掉(= 修前的疊放)H1 必紅;把手外推拿掉(margin 0)H2 必紅;
 *        不注入的那一次全綠(對照列)。找不到把手 / 捲軸 / 滑塊、捲軸不收 = INSTRUMENT-FAIL(exit 2),不當成通過。
 *   綠: 修好的建置四項全過。
 *   node scripts/sidebar-handle-scrollbar-hit-invariant.mjs [--build=<storybook 建置目錄>] [--selftest]
 */
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowserOrSkip, openStory, requireStorybookBuild, requireFreshStorybookBuild, settleAfterInteraction, INSTRUMENT_FAIL_MARKER } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
const buildArg = process.argv.find((a) => a.startsWith('--build='))?.slice('--build='.length)
const STATIC = buildArg ? (isAbsolute(buildArg) ? buildArg : join(process.cwd(), buildArg)) : join(REPO, 'storybook-static')
requireStorybookBuild(join(STATIC, 'index.json'))
if (!buildArg) requireFreshStorybookBuild(STATIC, ['packages/design-system/src/components/Sidebar', 'packages/design-system/src/components/ScrollArea', 'packages/design-system/src/patterns/resize-handle'])

const STORY = `iframe.html?id=${encodeURIComponent('design-system-components-appshell-展示--primary-sidebar')}&viewMode=story`
const HANDLE = '[role="separator"][aria-label="調整選單寬度"]'
const SCROLLBAR = '[data-sidebar="content"] [data-orientation="vertical"]'
const OUTSET = 3 // resize-handle.tsx HIT_OUTSET

const SABOTAGE = {
  'scrollbar-under-handle': `${SCROLLBAR}{z-index:auto!important}`,
  'handle-no-outset': `${HANDLE}{margin-right:0!important}`,
}

let failCount = 0
let instrumentFail = false
const redByRun = new Map() // 破法組合 → 紅了哪幾項(selftest 判定用)
let runKey = ''
const check = (id, name, pass, detail = '', { control = false } = {}) => {
  console.log(`${pass ? '✓' : '✗'} ${control ? '[對照列] ' : ''}${name}${detail ? ` | ${detail}` : ''}`)
  if (!pass) { failCount++; redByRun.get(runKey).add(id) }
  return pass
}
const instrument = (name, detail) => { instrumentFail = true; console.log(`✗ ${INSTRUMENT_FAIL_MARKER} ${name} | ${detail}`) }

const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html', snapshot: true })
const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
const context = await browser.newContext({ viewport: { width: 1440, height: 230 }, deviceScaleFactor: 1 })
const page = await context.newPage()

/** 一列 [x0, x1) 每一 px 中心打 elementFromPoint,回 'scrollbar' / 'handle' / 'other' */
async function hitRow(x0, x1, y) {
  return page.evaluate(({ x0, x1, y, HANDLE, SCROLLBAR }) => {
    const out = []
    for (let x = x0; x < x1; x += 1) {
      const el = document.elementFromPoint(x + 0.5, y)
      out.push(el?.closest(SCROLLBAR) ? 'scrollbar' : el?.closest(HANDLE) ? 'handle' : 'other')
    }
    return out
  }, { x0, x1, y, HANDLE, SCROLLBAR })
}
const runs = (row, x0) => row.map((who, i) => `${x0 + i}:${who[0]}`).join(' ')

/** 指標停在側欄內容裡讓捲軸浮出,等捲軸與滑塊本身出現且有寬 */
async function revealScrollbar() {
  const content = await page.evaluate(() => {
    const r = document.querySelector('[data-sidebar="content"]')?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  })
  if (!content) return null
  await page.mouse.move(content.x, content.y)
  try {
    await page.waitForFunction((sel) => {
      const sb = document.querySelector(sel); const th = sb?.firstElementChild
      return !!sb && !!th && sb.getBoundingClientRect().width > 0 && th.getBoundingClientRect().height > 0
    }, SCROLLBAR, { timeout: 5000 })
  } catch { return null }
  await settleAfterInteraction(page, { frames: 6, capMs: 3000 })
  return page.evaluate(({ HANDLE, SCROLLBAR }) => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom } }
    const sb = document.querySelector(SCROLLBAR); const th = sb.firstElementChild; const h = document.querySelector(HANDLE)
    const side = document.querySelector('[data-sidebar="sidebar"]')
    return h && side ? { sb: r(sb), th: r(th), h: r(h), side: r(side) } : null
  }, { HANDLE, SCROLLBAR })
}

for (const breaks of SELFTEST ? [[], ['scrollbar-under-handle'], ['handle-no-outset']] : [[]]) {
  const tag = breaks.length ? `[破法 ${breaks.join('+')}] ` : ''
  runKey = breaks.join('+'); redByRun.set(runKey, new Set())
  try {
    await openStory(page, `${server.origin}/${STORY}`, { waitFor: () => !!document.querySelector('[role="separator"][aria-label="調整選單寬度"]'), settleFrames: 8, notFound: server.notFound })
  } catch (error) { instrument(`${tag}開 primary-sidebar`, String(error?.message ?? error).slice(0, 200)); continue }
  for (const b of breaks) await page.addStyleTag({ content: SABOTAGE[b] })
  const g = await revealScrollbar()
  if (!g) { instrument(`${tag}捲軸浮出`, '指標停在側欄內容上,捲軸 / 滑塊 / 把手沒出現(內容不比視窗高?)'); continue }
  const edge = Math.round(g.side.right) // 側欄右緣(把手的線畫在它內側最後一 px)
  const sbL = Math.floor(g.sb.left)
  const yThumb = Math.round((g.th.top + g.th.bottom) / 2)
  const thumbRow = await hitRow(sbL, edge + OUTSET, yThumb)
  const geo = `捲軸 x${sbL}–${Math.round(g.sb.right) - 1}、滑塊 x${Math.round(g.th.left)}–${Math.round(g.th.right) - 1}、把手 x${Math.round(g.h.left)}–${Math.round(g.h.right) - 1}、側欄右緣 ${edge}`
  const inside = thumbRow.slice(0, edge - sbL)
  const outside = thumbRow.slice(edge - sbL)
  check('H1', `${tag}H1 捲軸浮出時,滑塊那一列從捲軸左緣到側欄右緣每一 px 都是捲軸`, inside.every((w) => w === 'scrollbar'),
    `${geo};y${yThumb} ${runs(inside, sbL)}`, { control: breaks.length > 0 && !breaks.includes('scrollbar-under-handle') })
  check('H2', `${tag}H2 同一列側欄右緣外側 ${OUTSET}px 仍是把手`, outside.length === OUTSET && outside.every((w) => w === 'handle'),
    runs(outside, edge), { control: breaks.length > 0 && !breaks.includes('handle-no-outset') })
  // H3:捲軸沒出現的高度(捲軸上緣之上、側欄之內)把手照舊 7px
  const yHead = Math.round(g.sb.top) - 6
  if (yHead <= g.side.top + 2) instrument(`${tag}H3`, `捲軸上方沒有空間可量(捲軸 top ${g.sb.top}、側欄 top ${g.side.top})`)
  else {
    const headRow = await hitRow(edge - (7 - OUTSET), edge + OUTSET, yHead)
    check('H3', `${tag}H3 捲軸沒出現的高度(y${yHead})把手照舊 7px`, headRow.every((w) => w === 'handle'), runs(headRow, edge - (7 - OUTSET)),
      { control: breaks.length > 0 && !breaks.includes('handle-no-outset') })
  }
  // H4:指標離開側欄、捲軸收起後,滑塊那一列把手照舊 7px
  await page.mouse.move(g.side.right + 400, 120)
  try {
    await page.waitForFunction((sel) => { const sb = document.querySelector(sel); return !sb || sb.getBoundingClientRect().width === 0 || getComputedStyle(sb).visibility === 'hidden' }, SCROLLBAR, { timeout: 5000 })
    const gone = await hitRow(edge - (7 - OUTSET), edge + OUTSET, yThumb)
    check('H4', `${tag}H4 捲軸收起後,同一列把手照舊 7px`, gone.every((w) => w === 'handle'), runs(gone, edge - (7 - OUTSET)),
      { control: breaks.length > 0 && !breaks.includes('handle-no-outset') })
  } catch { instrument(`${tag}H4`, '指標離開側欄 5 秒後捲軸仍在') }
}

await browser.close()
await server.stop()
if (SELFTEST) {
  // 對照組判定:不注入那一輪必綠;捲軸疊放破法必紅 H1;把手外推破法必紅 H2(H3 / H4 也量外側 3px,跟著紅是預期)
  const red = (k) => [...(redByRun.get(k) ?? [])]
  const ok = !instrumentFail && red('').length === 0 && red('scrollbar-under-handle').includes('H1') && red('handle-no-outset').includes('H2')
  console.log(`${ok ? '✓' : '✗'} selftest:不注入紅 [${red('')}]、捲軸疊放破法紅 [${red('scrollbar-under-handle')}](需含 H1)、把手外推破法紅 [${red('handle-no-outset')}](需含 H2)`)
  process.exit(ok ? 0 : 1)
}
if (instrumentFail) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:有量不到的項目(見上),不當成通過`); process.exit(2) }
console.log(failCount === 0 ? '✓ sidebar-handle-scrollbar-hit-invariant:把手與捲軸各收各的' : `✗ sidebar-handle-scrollbar-hit-invariant:${failCount} 項不符`)
process.exit(failCount === 0 ? 0 : 1)
