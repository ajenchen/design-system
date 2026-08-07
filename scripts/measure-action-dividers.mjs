#!/usr/bin/env node
/**
 * measure-action-dividers.mjs — action region 分隔線的**像素量測**驗證(M32:量真像素,不驗屬性存在)。
 *
 * 幾何 SSOT = `packages/design-system/src/patterns/action-bar/action-bar.spec.md`「分隔線幾何」:
 *   線長 = 該列最高元件 − --action-divider-inset(8px),不短於 --action-divider-min(16px),垂直置中。
 *
 * 靜態防線(scripts/test-action-divider-placement.mjs)只能鎖住 class 與 token 寫法;
 * 「算出來到底幾 px、置不置中、同列是否等長」必須實際渲染才知道。2026-08-07 事故就是
 * class 一模一樣、算出來卻是 13 / 16 / 24 三種長度。
 *
 * 用法:node scripts/measure-action-dividers.mjs --base <storybook-url> [--json]
 * 需要 Playwright(本機 sandbox 起不了瀏覽器時走 CI lane)。
 */
import { chromium } from 'playwright'

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}
const BASE = arg('--base') || process.env.STORYBOOK_BASE
if (!BASE) {
  console.error('usage: node scripts/measure-action-dividers.mjs --base <storybook-url>')
  process.exit(2)
}
const asJson = process.argv.includes('--json')

// 比值帶取自世界級 action bar 實測:Primer ActionBar 0.63 / VS Code 0.73 / JetBrains 0.77-0.86。
// 我們的公式(最高元件 − 8px)在 24/28/32/36 四個控件階算出 0.67 / 0.71 / 0.75 / 0.78。
const RATIO_MIN = 0.6
const RATIO_MAX = 0.8

const CASES = [
  { label: 'Alert 角落 action 群', id: 'design-system-components-alert-展示--corner-action-group' },
  { label: 'BulkActionBar', id: 'design-system-components-bulkactionbar-展示--default' },
  { label: 'Toast', id: 'design-system-components-toast-展示--interactive', click: '儲存專案' },
  // 面板的分隔線只在有關閉鈕時渲染(data-table-filter-panel.tsx:375 'onClose &&'),
  // 而獨立的 filter-panel-* stories 不傳 onClose;真正帶關閉鈕的是 DataTable 整合情境,
  // 要先點工具列的「篩選」把 Popover 打開。
  { label: 'DataTable 進階篩選面板', id: 'design-system-components-datatable-展示--with-bulk-actions', click: '篩選', clickByLabel: true },
]

const MEASURE = () => {
  // 只鎖 action region 群組線。版面切分家族(DataTable 欄界 / 欄寬把手 / Steps connector)
  // 同樣是 bg-divider + w-px,但規範明文不適用本節幾何,誤抓會製造假失敗。
  return [...document.querySelectorAll('[data-action-divider]')].map(outer => {
    const line = outer.firstElementChild
    const row = outer.parentElement
    const lineBox = line.getBoundingClientRect()
    const siblingBoxes = [...row.children]
      .filter(child => child !== outer)
      .map(child => child.getBoundingClientRect())
      .filter(box => box.height > 0)
    const tallestBox = siblingBoxes.reduce(
      (best, box) => (best && best.height >= box.height ? best : box),
      null,
    ) ?? row.getBoundingClientRect()
    // 置中要對「它所分隔的控件」比,不是對父層盒 —— 父層常帶不對稱 padding
    // (BulkActionBar 的 py-tight),拿父層算會把 padding 誤判成偏移。
    const lineCenter = (lineBox.top + lineBox.bottom) / 2
    const controlCenter = (tallestBox.top + tallestBox.bottom) / 2
    return {
      lineHeight: Number(lineBox.height.toFixed(1)),
      tallestSibling: Number(tallestBox.height.toFixed(1)),
      ratio: Number((lineBox.height / tallestBox.height).toFixed(2)),
      centerOffset: Number((lineCenter - controlCenter).toFixed(2)),
      centered: Math.abs(lineCenter - controlCenter) < 0.75,
      width: Number(lineBox.width.toFixed(1)),
    }
  })
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 760 } })
const results = []
for (const testCase of CASES) {
  const url = `${BASE.replace(/\/$/, '')}/iframe.html?id=${encodeURIComponent(testCase.id)}&viewMode=story`
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(1200)
  if (testCase.click) {
    const trigger = testCase.clickByLabel
      ? page.locator(`button[aria-label="${testCase.click}"]`).first()
      : page.locator(`button:has-text("${testCase.click}")`).first()
    if (await trigger.count()) {
      await trigger.click().catch(() => {})
      await page.waitForTimeout(1200)
    }
  }
  results.push({ ...testCase, lines: await page.evaluate(MEASURE) })
}
await browser.close()

const failures = []
for (const result of results) {
  if (!result.lines.length) continue
  const distinct = new Set(result.lines.map(line => Math.round(line.lineHeight)))
  if (distinct.size > 1) failures.push(`${result.label}:同一畫面出現 ${distinct.size} 種長度(${[...distinct].join(' / ')}px)`)
  for (const line of result.lines) {
    if (line.width > 1.5) failures.push(`${result.label}:線寬 ${line.width}px,不是 1px`)
    if (!line.centered) failures.push(`${result.label}:線未垂直置中`)
    if (line.ratio < RATIO_MIN || line.ratio > RATIO_MAX) {
      failures.push(`${result.label}:比值 ${line.ratio}(線 ${line.lineHeight}px / 最高元件 ${line.tallestSibling}px)超出 ${RATIO_MIN}–${RATIO_MAX}`)
    }
  }
}
const missing = results.filter(result => !result.lines.length).map(result => result.label)
const measured = results.length - missing.length
if (missing.length) failures.push(`這些情境沒量到任何分隔線(story id 或觸發方式不對,不得當成通過):${missing.join('、')}`)

if (asJson) {
  console.log(JSON.stringify({ base: BASE, results, failures }, null, 2))
} else {
  for (const result of results) {
    console.log(`\n── ${result.label}`)
    if (!result.lines.length) { console.log('   (此 story 未渲染分隔線)'); continue }
    for (const line of result.lines) {
      console.log(`   線 ${String(line.lineHeight).padStart(5)}px / 最高元件 ${String(line.tallestSibling).padStart(5)}px = ${line.ratio}  中心偏移 ${line.centerOffset}px ${line.centered ? '✓' : '✗'}  寬 ${line.width}px`)
    }
  }
}

if (!measured) {
  console.error('\n❌ 沒有量到任何分隔線 —— story id 或 base URL 不對,不得視為通過')
  process.exit(1)
}
if (failures.length) {
  console.error(`\n❌ 分隔線幾何量測失敗 ${failures.length} 項:`)
  for (const failure of failures) console.error(`   - ${failure}`)
  process.exit(1)
}
console.log(`\n✅ ${measured} 個情境的分隔線全部落在 ${RATIO_MIN}–${RATIO_MAX} 比值帶、寬 1px、垂直置中,且同畫面長度一致`)
