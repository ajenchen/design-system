#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 產品畫面「區塊 ↔ 區塊」= 一條分隔線的位置,上下各 loose(layoutSpace.spec.md 規則 3「組 ↔ 組」;user 2026-11-06 #18)——
 *         · 不畫線(區塊感夠):上一塊底 → 下一塊頂 = loose × 2(標準密度 32 / 寬鬆 48);
 *         · 畫 Separator(區塊感不夠):上一塊底 → 線頂 = loose、線底 → 下一塊頂 = loose(間距不變,只是線看得見)。
 *         盤點出的兩類各量一處:FileViewer 資訊面板「說明」輸入框 → 「檔案資訊」標題(不畫線)、
 *         Separator「在 DescriptionList 區塊之間」的「基本資料」→ 線 → 「團隊資訊」(畫線);md 與 lg 兩種密度。
 *         · 表單欄位 → 跟在後面的表單按鈕列(不在浮層 footer 裡)也是這一級(user 2026-11-10 PR #172 留言):全 DS 盤點出的 8 處
 *           (Field 表單驗證 2、Rating 包在 Field 內、Select 隨 form 送出、Field 不放 form 動作、Checkbox 同意條款與 ❌ Switch 同意、Steps 精靈)
 *           各量「最後一個欄位底 → 按鈕列頂」= loose × 2。歷史紅燈:2e1f2e27 建置 8 處都是 md 16 / lg 24(只有一份 loose)。
 *   紅: 任一處距離與期望差 > 0.6px(subpixel)→ 指名 case / 密度 / 數字並 exit 1。
 *       歷史紅燈(修前 main 8eb473c7 建置實測):FileViewer 資訊面板 md 16 / lg 24(= 只有一份 loose,標題比離自己的清單還近上一塊)。
 *   綠: 修後 FileViewer md 32 / lg 48;Separator 兩側 md 16 / 16、lg 24 / 24。純幾何,無動畫;重複跑恆等。
 *   量法: 靜態站開 story(globals density),等被量的元素本身出現(FileViewer 先按「展開詳細資訊面板」),
 *         讀 getBoundingClientRect(M32:量像素,不看 class);loose 的值從被量容器的 computed `--layout-space-loose` 讀,
 *         並要求 md ≠ lg —— 兩種密度讀到同一個 loose = 密度沒套上 = 儀器失效(不讀成通過)。
 *         `--selftest` 把修前實測(16 / 24)餵進判定函式必紅、修後形狀必綠、線一側縮回必紅、沒量到必紅。
 *         `--static=<dir>` 指定建置(例:拿修前建置證明會紅);指定時不跑新鮮度守衛(呼叫端自己說明那是哪一份建置)。
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
  { id: 'fileviewer-info-panel', kind: 'no-line', story: 'design-system-components-fileviewer-展示--open-snapshot', label: 'FileViewer 資訊面板 說明 → 檔案資訊' },
  { id: 'separator-between-sections', kind: 'line', story: 'design-system-components-separator-展示--between-sections', label: 'Separator 基本資料 → 線 → 團隊資訊' },
  // 表單欄位 → 跟在後面的表單按鈕列(不在浮層 footer 裡的全部;user 2026-11-10 PR #172 留言;盤點見 comments-fix/report.md)
  { id: 'form-field-update', kind: 'form', story: 'design-system-components-field-展示--form-validation', button: '儲存變更', label: 'Field 表單驗證(更新)欄位 → 儲存變更' },
  { id: 'form-field-create', kind: 'form', story: 'design-system-components-field-展示--form-validation', button: '建立專案', label: 'Field 表單驗證(建立)欄位 → 建立專案' },
  { id: 'form-rating-in-field', kind: 'form', story: 'design-system-components-rating-展示--in-field', button: '送出評分', label: 'Rating 包在 Field 內 → 送出評分' },
  { id: 'form-select-submit', kind: 'form', story: 'design-system-components-select-設計原則--immediate-vs-submit-rule', button: '儲存', label: 'Select 隨 form 送出 → 儲存 / 取消' },
  { id: 'form-field-not-for-form-actions', kind: 'form', story: 'design-system-components-field-設計原則--not-for-form-actions-rule', button: '儲存', label: 'Field 不放 form 動作 → 儲存 / 取消' },
  { id: 'form-checkbox-consent', kind: 'form', story: 'design-system-components-checkbox-設計原則--usage-guidance', button: '儲存', label: 'Checkbox 同意條款 → 儲存 / 取消' },
  { id: 'form-checkbox-switch-consent', kind: 'form', story: 'design-system-components-checkbox-設計原則--usage-guidance', button: '送出', label: 'Checkbox ❌ 用 Switch 同意 → 送出' },
  { id: 'form-steps-wizard', kind: 'form', story: 'design-system-components-steps-展示--default', button: '下一步', label: 'Steps 精靈這一步的欄位 → 下一步' },
]

/** 純函式:[{ id, kind, density, loose, gaps:[數字] }] → 不符合的訊息清單(呼叫端與 selftest 共用)。 */
export function judge(rows) {
  const failures = []
  for (const r of rows) {
    const where = `${r.id} @${r.density}`
    if (!(r.loose > 0)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到 --layout-space-loose`); continue }
    const expected = r.kind === 'line' ? [r.loose, r.loose] : [r.loose * 2]
    if (!Array.isArray(r.gaps) || r.gaps.length !== expected.length || r.gaps.some((g) => !Number.isFinite(g))) {
      failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 沒量到區塊(應 ${expected.length} 段距離,實得 ${JSON.stringify(r.gaps)})`)
      continue
    }
    r.gaps.forEach((g, i) => {
      if (Math.abs(g - expected[i]) > TOL) {
        const what = r.kind === 'form' ? '最後一個欄位底 → 表單按鈕列頂' : r.kind === 'no-line' ? '上一塊底 → 下一塊頂' : (i === 0 ? '上一塊底 → 線頂' : '線底 → 下一塊頂')
        failures.push(`${where} ${what} = ${g}px,應 ${expected[i]}(${r.kind === 'line' ? 'loose:線的上下各 loose' : 'loose × 2:一條隱形分隔線、上下各 loose'})`)
      }
    })
  }
  for (const id of new Set(rows.map((r) => r.id))) {
    const looses = rows.filter((r) => r.id === id).map((r) => r.loose)
    if (looses.length === DENSITIES.length && new Set(looses).size === 1) failures.push(`${INSTRUMENT_FAIL_MARKER}:${id} 兩種密度讀到同一個 loose(${looses[0]})—— 密度沒套上`)
  }
  return failures
}

function selftest() {
  let ok = true
  const expect = (cond, msg) => { if (!cond) { console.error(`✗ selftest:${msg}`); ok = false } }
  const row = (id, kind, density, loose, gaps) => ({ id, kind, density, loose, gaps })
  const good = [
    row('fileviewer-info-panel', 'no-line', 'md', 16, [32]), row('fileviewer-info-panel', 'no-line', 'lg', 24, [48]),
    row('separator-between-sections', 'line', 'md', 16, [16, 16]), row('separator-between-sections', 'line', 'lg', 24, [24, 24]),
  ]
  expect(judge(good).length === 0, `修後形狀應綠,實得 ${JSON.stringify(judge(good))}`)
  // 修前 main 8eb473c7 建置實測:資訊面板只有一份 loose
  const before = [row('fileviewer-info-panel', 'no-line', 'md', 16, [16]), row('fileviewer-info-panel', 'no-line', 'lg', 24, [24])]
  const f1 = judge(before)
  expect(f1.length === 2 && f1.some((s) => s.includes('@md') && s.includes('16px')) && f1.some((s) => s.includes('@lg') && s.includes('24px')), `修前 16 / 24 應兩密度都紅,實得 ${JSON.stringify(f1)}`)
  expect(judge([row('separator-between-sections', 'line', 'md', 16, [16, 8]), row('separator-between-sections', 'line', 'lg', 24, [24, 24])]).some((s) => s.includes('線底 → 下一塊頂 = 8px')), '線下側縮成 8 應紅')
  expect(judge([row('fileviewer-info-panel', 'no-line', 'md', 16, [])]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '沒量到應判儀器失效')
  expect(judge([row('fileviewer-info-panel', 'no-line', 'md', 16, [32]), row('fileviewer-info-panel', 'no-line', 'lg', 16, [32])]).some((s) => s.includes('密度沒套上')), '兩密度同 loose 應判儀器失效')
  // 表單欄位 → 表單按鈕列:修後 32 / 48 綠;2e1f2e27 以前只有一份 loose(16 / 24)兩密度都紅
  const formIds = CASES.filter((c) => c.kind === 'form').map((c) => c.id)
  const formGood = formIds.flatMap((id) => [row(id, 'form', 'md', 16, [32]), row(id, 'form', 'lg', 24, [48])])
  expect(judge(formGood).length === 0, `表單修後形狀應綠,實得 ${JSON.stringify(judge(formGood))}`)
  const formBefore = judge(formIds.flatMap((id) => [row(id, 'form', 'md', 16, [16]), row(id, 'form', 'lg', 24, [24])]))
  expect(formBefore.length === formIds.length * 2 && formBefore.every((s) => s.includes('最後一個欄位底 → 表單按鈕列頂')), `表單修前 16 / 24 應 ${formIds.length * 2} 格都紅,實得 ${formBefore.length}`)
  console.log(ok ? '✅ section-gap selftest PASS' : '❌ section-gap selftest FAIL')
  return ok
}

async function measureCase(page, origin, c, density) {
  const url = `${origin}/iframe.html?id=${encodeURIComponent(c.story)}&viewMode=story&globals=${encodeURIComponent(`theme:light;density:${density}`)}`
  if (c.kind === 'form') {
    // 等被量的按鈕本身出現;按鈕列 = 從按鈕往上第一個「有前一個兄弟」的節點(ButtonGroup / 包按鈕的 div),前一個兄弟 = 最後一個欄位(或欄位群組)
    await openStory(page, url, { waitFor: '#storybook-root button', label: c.story })
    await page.waitForFunction((name) => [...document.querySelectorAll('#storybook-root button')].some((b) => b.textContent.trim() === name && b.getBoundingClientRect().height > 0), c.button)
    return page.evaluate((name) => {
      const button = [...document.querySelectorAll('#storybook-root button')].find((b) => b.textContent.trim() === name)
      let rowEl = button
      for (let i = 0; i < 4 && rowEl && !rowEl.previousElementSibling; i++) rowEl = rowEl.parentElement
      const prev = rowEl?.previousElementSibling
      const loose = parseFloat(getComputedStyle(rowEl?.parentElement ?? document.documentElement).getPropertyValue('--layout-space-loose'))
      const round = (v) => Math.round(v * 10) / 10
      return { loose, gaps: prev ? [round(rowEl.getBoundingClientRect().top - prev.getBoundingClientRect().bottom)] : [] }
    }, c.button)
  }
  if (c.id === 'fileviewer-info-panel') {
    await openStory(page, url, { waitFor: 'button[aria-label="展開詳細資訊面板"]', label: c.story })
    await page.click('button[aria-label="展開詳細資訊面板"]')
    await page.waitForFunction(() => [...document.querySelectorAll('aside span')].some((s) => s.textContent === '檔案資訊' && s.getBoundingClientRect().height > 0))
    return page.evaluate(() => {
      const heading = [...document.querySelectorAll('aside span')].find((s) => s.textContent === '檔案資訊')
      const group = heading.parentElement
      const stack = group.parentElement
      const textarea = group.previousElementSibling?.querySelector('textarea')
      const loose = parseFloat(getComputedStyle(stack).getPropertyValue('--layout-space-loose'))
      const round = (v) => Math.round(v * 10) / 10
      return { loose, gaps: textarea ? [round(heading.getBoundingClientRect().top - textarea.getBoundingClientRect().bottom)] : [] }
    })
  }
  await openStory(page, url, { waitFor: '[data-orientation="horizontal"]', label: c.story })
  return page.evaluate(() => {
    const line = document.querySelector('#storybook-root [data-orientation="horizontal"]')
    const prev = line?.previousElementSibling, next = line?.nextElementSibling
    const loose = parseFloat(getComputedStyle(line.parentElement).getPropertyValue('--layout-space-loose'))
    const round = (v) => Math.round(v * 10) / 10
    if (!prev || !next) return { loose, gaps: [] }
    const l = line.getBoundingClientRect()
    return { loose, gaps: [round(l.top - prev.getBoundingClientRect().bottom), round(next.getBoundingClientRect().top - l.bottom)] }
  })
}

async function measure() {
  if (!staticArg) requireFreshStorybookBuild(STATIC, ['packages/design-system/src/components/FileViewer/file-viewer.tsx', 'packages/design-system/src/components/Separator', 'packages/design-system/src/tokens/layoutSpace/layoutSpace.css', 'packages/design-system/src/components/Field/field.stories.tsx', 'packages/design-system/src/components/Field/field.principles.stories.tsx', 'packages/design-system/src/components/Rating/rating.stories.tsx', 'packages/design-system/src/components/Select/select.principles.stories.tsx', 'packages/design-system/src/components/Checkbox/checkbox.principles.stories.tsx', 'packages/design-system/src/components/Steps/steps.stories.tsx'])
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip()
  if (!browser) { await server.stop(); return null }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const rows = []
    for (const c of CASES) for (const density of DENSITIES) rows.push({ id: c.id, kind: c.kind, density, ...(await measureCase(page, server.origin, c, density)) })
    return rows
  } finally { await browser.close(); await server.stop() }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1)
  try {
    const rows = await measure()
    if (rows === null) process.exit(0) // launchBrowserOrSkip 已印 SKIPPED-ENV / INSTRUMENT-FAIL 判定
    for (const r of rows) console.log(`  ${r.id.padEnd(28)} ${r.density}  loose ${r.loose}  距離 ${r.gaps.join(' / ')}`)
    const failures = judge(rows)
    if (failures.length) { console.error('❌ section-gap FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
    console.log('✅ section-gap PASS(區塊 ↔ 區塊 = 一條分隔線的位置、上下各 loose;不畫線 = loose × 2)')
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}`); process.exit(1) }
    throw error
  }
}
