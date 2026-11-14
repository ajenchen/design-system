#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 表單範例(Field 展示「表單驗證」兩張、Rating「包在 Field 內」、Select 設計原則「隨 form 送出」)放在卡片裡,
 *         卡片四邊 = loose(同 Checkbox 設計原則那張卡:`border border-border rounded-lg p-[var(--layout-space-loose)]`),
 *         所以「按鈕下方 = 容器自己的底內距」看得出來(layoutSpace.spec.md 規則 4;user 2026-10-21 09:25「Q5可以基於你的建議」
 *         同意的 Q5 建議「表單放進看得見的容器」、2026-10-28「頁面上的卡片照你建議」= 卡片四邊 16)。
 *   紅: 從送出鈕往上 3 層內找不到四邊都有框線的容器,或卡片內上 / 左 / 下(最後一顆按鈕 → 卡片底)距離與 loose 差 > 0.6px
 *       → 指名 case / 密度 / 數字並 exit 1。歷史紅燈(修前 main 8eb473c7 建置):4 處都沒有外框(按鈕下方是畫布留白)。
 *   綠: 4 處卡片內上 / 左 / 下 = loose(標準密度 16 / 寬鬆 24)。純幾何,無動畫;重複跑恆等。
 *   量法: 靜態站開 story,等被量的按鈕本身出現,讀 getBoundingClientRect(M32);loose 從卡片 computed `--layout-space-loose` 讀。
 *         `--selftest` 把修前形狀(沒有卡片)、單邊縮回、沒量到餵進判定函式必紅,修後形狀必綠。
 *         `--static=<dir>` 指定建置(例:拿修前建置證明會紅);指定時不跑新鮮度守衛。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = path.resolve(staticArg ? staticArg.slice('--static='.length) : path.join(REPO, 'storybook-static'))
const TOL = 0.6
const DENSITIES = ['md', 'lg']

export const CASES = [
  { id: 'field-update', story: 'design-system-components-field-展示--form-validation', button: '儲存變更' },
  { id: 'field-create', story: 'design-system-components-field-展示--form-validation', button: '建立專案' },
  { id: 'rating-in-field', story: 'design-system-components-rating-展示--in-field', button: '送出評分' },
  { id: 'select-submit', story: 'design-system-components-select-設計原則--immediate-vs-submit-rule', button: '儲存' },
]

/** 純函式:[{ id, density, loose, card:boolean, gaps:{ top, left, bottom } }] → 不符合的訊息清單。 */
export function judge(rows) {
  const failures = []
  for (const r of rows) {
    const where = `${r.id} @${r.density}`
    if (r.found === false) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 找不到送出鈕`); continue }
    if (!r.card) { failures.push(`${where} 送出鈕往上 3 層內沒有卡片(四邊框線)—— 表單範例沒放進容器,示範不出「按鈕下方 = 容器底內距」`); continue }
    if (!(r.loose > 0)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到 --layout-space-loose`); continue }
    for (const side of ['top', 'left', 'bottom']) {
      const g = r.gaps?.[side]
      if (!Number.isFinite(g)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 沒量到 ${side}`); continue }
      if (Math.abs(g - r.loose) > TOL) failures.push(`${where} 卡片內 ${side} = ${g}px,應 ${r.loose}(卡片四邊 loose)`)
    }
  }
  return failures
}

function selftest() {
  let ok = true
  const expect = (cond, msg) => { if (!cond) { console.error(`✗ selftest:${msg}`); ok = false } }
  const row = (id, density, loose, card, gaps) => ({ id, density, loose, card, gaps })
  const good = CASES.flatMap((c) => [row(c.id, 'md', 16, true, { top: 16, left: 16, bottom: 16 }), row(c.id, 'lg', 24, true, { top: 24, left: 24, bottom: 24 })])
  expect(judge(good).length === 0, `修後形狀應綠,實得 ${JSON.stringify(judge(good))}`)
  const before = CASES.map((c) => row(c.id, 'md', 16, false, null))
  expect(judge(before).length === CASES.length && judge(before).every((s) => s.includes('沒有卡片')), '修前沒有卡片應 4 處都紅')
  expect(judge([row('field-update', 'md', 16, true, { top: 16, left: 16, bottom: 0 })]).some((s) => s.includes('bottom = 0px')), '按鈕貼卡片底應紅')
  expect(judge([row('field-update', 'md', 16, true, { top: 16, left: 16 })]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '沒量到應判儀器失效')
  expect(judge([{ id: 'x', density: 'md', found: false }]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '找不到按鈕應判儀器失效')
  console.log(ok ? '✅ form-example-card selftest PASS' : '❌ form-example-card selftest FAIL')
  return ok
}

async function measureCase(page, origin, c, density) {
  const url = `${origin}/iframe.html?id=${encodeURIComponent(c.story)}&viewMode=story&globals=${encodeURIComponent(`theme:light;density:${density}`)}`
  await openStory(page, url, { waitFor: '#storybook-root button', label: c.story })
  await page.waitForFunction((name) => [...document.querySelectorAll('#storybook-root button')].some((b) => b.textContent.trim() === name && b.getBoundingClientRect().height > 0), c.button)
  return page.evaluate((name) => {
    const button = [...document.querySelectorAll('#storybook-root button')].find((b) => b.textContent.trim() === name)
    if (!button) return { found: false }
    const round = (v) => Math.round(v * 10) / 10
    let card = null
    for (let el = button.parentElement, i = 0; el && i < 3; el = el.parentElement, i++) {
      const cs = getComputedStyle(el)
      if (['Top', 'Right', 'Bottom', 'Left'].every((s) => parseFloat(cs[`border${s}Width`]) >= 1 && cs[`border${s}Style`] !== 'none')) { card = el; break }
    }
    if (!card) return { card: false }
    const cs = getComputedStyle(card)
    const r = card.getBoundingClientRect()
    const first = card.firstElementChild.getBoundingClientRect()
    const innerTop = r.top + parseFloat(cs.borderTopWidth), innerLeft = r.left + parseFloat(cs.borderLeftWidth), innerBottom = r.bottom - parseFloat(cs.borderBottomWidth)
    return {
      card: true,
      loose: parseFloat(cs.getPropertyValue('--layout-space-loose')),
      gaps: { top: round(first.top - innerTop), left: round(first.left - innerLeft), bottom: round(innerBottom - button.getBoundingClientRect().bottom) },
    }
  }, c.button)
}

async function measure() {
  if (!staticArg) requireFreshStorybookBuild(STATIC, ['packages/design-system/src/components/Field/field.stories.tsx', 'packages/design-system/src/components/Rating/rating.stories.tsx', 'packages/design-system/src/components/Select/select.principles.stories.tsx', 'packages/design-system/src/tokens/layoutSpace/layoutSpace.css'])
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip()
  if (!browser) { await server.stop(); return null }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const rows = []
    for (const c of CASES) for (const density of DENSITIES) rows.push({ id: c.id, density, ...(await measureCase(page, server.origin, c, density)) })
    return rows
  } finally { await browser.close(); await server.stop() }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1)
  try {
    const rows = await measure()
    if (rows === null) process.exit(0) // launchBrowserOrSkip 已印 SKIPPED-ENV / INSTRUMENT-FAIL 判定
    for (const r of rows) console.log(`  ${r.id.padEnd(16)} ${r.density}  card ${r.card}  loose ${r.loose ?? '-'}  上 / 左 / 下 ${r.gaps ? `${r.gaps.top} / ${r.gaps.left} / ${r.gaps.bottom}` : '-'}`)
    const failures = judge(rows)
    if (failures.length) { console.error('❌ form-example-card FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
    console.log('✅ form-example-card PASS(4 處表單範例在卡片裡、卡片四邊 loose、按鈕下方 = 卡片底內距)')
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}`); process.exit(1) }
    throw error
  }
}
