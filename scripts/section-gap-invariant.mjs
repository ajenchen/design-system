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
 *         · 標題區 → 內容(2026-11-11,layoutSpace.spec.md 規則 3「標題區 → 內容」;user 2026-11-11「我覺得主要取決於那個標題和說明是否是
 *           完完全全在描述下方的東西？若是的話，那就是親近吧？如果是描述下方的多個東西，那確實是用loose沒錯？…」+ 決策頁「說明頁:甲」):
 *           底下只有一塊 = tight(heading-one)、兩塊以上 = loose(heading-many)。三種共用元件(設計規格頁 H3 / H3 + Desc、
 *           ExampleSection、TutorialRule)× 一塊 / 兩塊以上各挑真頁量「標題區底 → 第一個內容頂」。歷史紅燈:3d7f8ae6 建置一塊的也是 md 16 / lg 24。
 *           好幾個示範塊彼此只隔 tight 也算兩塊以上(user 2026-11-12「第四批成品的問題都照你建議，但清除全部的按鈕用TERTIARY」,第四批成品頁
 *           「多塊緊排」題標「建議」的選項 =「乙：有兩塊以上就維持遠的距離」):三種共用元件各挑一頁「彼此只隔 12 的好幾塊」量 = loose;
 *           「一則示範 + 一段說明它的文字」= 一塊 = tight、一個元件(一個 Field)= 一塊(這兩條是【AI 推導】的數法,見 tutorial-page.tsx
 *           `headingContentOf`)。歷史紅燈:ada83612 建置(2026-11-11 那版數法)翻面的四格是反過來的 —— 緊排的好幾塊 md 12 / lg 16、
 *           示範 + 說明 md 16 / lg 24。
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
  // 標題區 → 內容(2026-11-11):h3 = 設計規格頁 H3(標題區尾巴 = 它自己或緊接的 Desc)、es = ExampleSection、rule = TutorialRule;
  // text = 標題字樣(開頭比對),一塊 → tight、兩塊以上 → loose。各挑一頁實際的設計規格 / 設計原則頁。
  { id: 'heading-h3-one-table', kind: 'heading-one', story: 'design-system-internal-notice-設計規格--overview', at: 'h3', text: 'Slot 對照', label: 'Notice 設計規格「Slot 對照」→ 一張表(外包一層捲動容器)' },
  { id: 'heading-es-many-sections', kind: 'heading-many', story: 'design-system-components-button-設計規格--state-behavior', at: 'es', text: '狀態行為', label: 'Button 設計規格「狀態行為」→ 一個容器裡隔 32 的三段' },
  { id: 'heading-rule-many-examples', kind: 'heading-many', story: 'design-system-components-badge-設計原則--default-low-rule', at: 'rule', text: '選 level 時問', label: 'Badge 設計原則「選 level 時問…」→ 四則範例' },
  { id: 'heading-rule-one-example', kind: 'heading-one', story: 'design-system-components-badge-設計原則--default-low-rule', at: 'rule', text: '❌ 把 passive count 當 critical', label: 'Badge 設計原則「❌ 把 passive count 當 critical」→ 一則範例 + 說明' },
  // 好幾個示範塊彼此只隔 tight 也是兩塊以上 → loose(user 2026-11-12 第四批成品頁「多塊緊排」= 乙);三種共用元件各一頁。
  // `flippedFrom` = 2026-11-11 那版數法給這一格的判定(這一格是 2026-11-12 翻面的;selftest 拿它造「修前距離必紅」的對照組)。
  { id: 'heading-h3-many-tight-rows', kind: 'heading-many', flippedFrom: 'heading-one', story: 'design-system-components-progressbar-設計規格--overview', at: 'h3', text: 'Status 一覽', label: 'ProgressBar 設計規格「Status 一覽」→ 彼此隔 12 的三列示範' },
  { id: 'heading-es-many-tight-rows', kind: 'heading-many', flippedFrom: 'heading-one', story: 'design-system-components-checkbox-設計規格--overview', at: 'es', text: '尺寸一覽', label: 'Checkbox 設計規格「尺寸一覽」→ 彼此隔 12 的三列示範' },
  { id: 'heading-rule-many-tight-demos', kind: 'heading-many', flippedFrom: 'heading-one', story: 'design-system-components-chip-設計原則--usage-guidance', at: 'rule', text: '互斥單選', label: 'Chip 設計原則「互斥單選…」→ 彼此隔 12 的兩則示範(各帶一段說明)' },
  // 一則示範 + 一段說明它的文字 = 一塊 → tight(說明文字不算一塊;【AI 推導】;2026-11-11 那版因為兩者隔 16 判成兩塊)。
  { id: 'heading-h3-one-demo-prose', kind: 'heading-one', flippedFrom: 'heading-many', story: 'design-system-components-tabs-設計規格--color-matrix', at: 'h3', text: 'TabsTrigger 四態色彩', label: 'Tabs 設計規格「TabsTrigger 四態色彩」→ 一張表 + 一段說明' },
  // 一個元件 = 一塊(元件裡面怎麼排是元件自己的事,不往裡數);好幾個欄位 = 兩塊以上。【AI 推導】的「只負責排版的容器」判斷;
  // 這兩格 2026-11-12 前後判定相同,守的是數法改寫時沒有把一個 Field 的 label 與輸入框數成兩塊。
  { id: 'heading-es-one-component', kind: 'heading-one', story: 'design-system-components-field-展示--horizontal-label-alignment', at: 'es', text: '驗證：單行 label 與 input 中線對齊', label: 'Field 展示「驗證：單行 label 與 input 中線對齊」→ 一個 Field' },
  { id: 'heading-es-many-fields', kind: 'heading-many', story: 'design-system-components-field-展示--mixed-control-alignment', at: 'es', text: '水平並排', label: 'Field 展示「水平並排…」→ 三個欄位' },
]

/** 純函式:[{ id, kind, density, loose, tight?, gaps:[數字] }] → 不符合的訊息清單(呼叫端與 selftest 共用)。 */
export function judge(rows) {
  const failures = []
  for (const r of rows) {
    const where = `${r.id} @${r.density}`
    if (!(r.loose > 0)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到 --layout-space-loose`); continue }
    if (r.kind === 'heading-one' && !(r.tight > 0)) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 讀不到 --layout-space-tight`); continue }
    const expected = r.kind === 'line' ? [r.loose, r.loose] : r.kind === 'heading-one' ? [r.tight] : r.kind === 'heading-many' ? [r.loose] : [r.loose * 2]
    if (!Array.isArray(r.gaps) || r.gaps.length !== expected.length || r.gaps.some((g) => !Number.isFinite(g))) {
      failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 沒量到區塊(應 ${expected.length} 段距離,實得 ${JSON.stringify(r.gaps)})`)
      continue
    }
    r.gaps.forEach((g, i) => {
      if (Math.abs(g - expected[i]) > TOL) {
        if (r.kind === 'heading-one' || r.kind === 'heading-many') {
          failures.push(`${where} 標題區底 → 內容頂 = ${g}px,應 ${expected[i]}(${r.kind === 'heading-one' ? 'tight:標題底下只有一塊' : 'loose:標題底下兩塊以上'},layoutSpace 規則 3「標題區 → 內容」)`)
          return
        }
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
  // 標題區 → 內容(2026-11-11):一塊 tight(md 12 / lg 16)、兩塊以上 loose(16 / 24)綠;3d7f8ae6 建置一塊的也是 loose → 紅;
  // 兩塊以上被縮成 tight → 紅;讀不到 tight → 儀器失效
  const hrow = (id, kind, density, loose, tight, gaps) => ({ id, kind, density, loose, tight, gaps })
  const headingCases = CASES.filter((c) => c.kind === 'heading-one' || c.kind === 'heading-many')
  const headingGood = headingCases.flatMap((c) => [hrow(c.id, c.kind, 'md', 16, 12, [c.kind === 'heading-one' ? 12 : 16]), hrow(c.id, c.kind, 'lg', 24, 16, [c.kind === 'heading-one' ? 16 : 24])])
  expect(headingCases.length >= 4 && judge(headingGood).length === 0, `標題區 → 內容修後形狀應綠,實得 ${JSON.stringify(judge(headingGood))}`)
  const oneIds = headingCases.filter((c) => c.kind === 'heading-one').map((c) => c.id)
  const headingBefore = judge(oneIds.flatMap((id) => [hrow(id, 'heading-one', 'md', 16, 12, [16]), hrow(id, 'heading-one', 'lg', 24, 16, [24])]))
  expect(oneIds.length >= 2 && headingBefore.length === oneIds.length * 2 && headingBefore.every((s) => s.includes('tight:標題底下只有一塊')), `一塊的修前 16 / 24 應 ${oneIds.length * 2} 格都紅,實得 ${headingBefore.length}`)
  const manyId = headingCases.find((c) => c.kind === 'heading-many').id
  expect(judge([hrow(manyId, 'heading-many', 'md', 16, 12, [12]), hrow(manyId, 'heading-many', 'lg', 24, 16, [24])]).some((s) => s.includes('@md') && s.includes('loose:標題底下兩塊以上')), '兩塊以上被縮成 tight 應紅')
  expect(judge([hrow(oneIds[0], 'heading-one', 'md', 16, NaN, [12])]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER) && s.includes('tight')), '讀不到 tight 應判儀器失效')
  // 2026-11-12 翻面的格子(多塊緊排 = 乙;示範 + 說明 = 一塊):三種共用元件各要有一格「緊排的好幾塊」;
  // 把 2026-11-11 那版數法會給的距離(ada83612 建置實測:緊排的好幾塊 md 12 / lg 16、示範 + 說明 md 16 / lg 24)餵進去,每格兩種密度都要紅
  const flipped = headingCases.filter((c) => c.flippedFrom)
  expect(flipped.length >= 4 && flipped.every((c) => c.flippedFrom !== c.kind && (c.flippedFrom === 'heading-one' || c.flippedFrom === 'heading-many')), '`flippedFrom` 必須是另一種判定(相同 = 這一格沒有翻面,對照組是空的)')
  const tightMany = flipped.filter((c) => c.kind === 'heading-many')
  expect(['h3', 'es', 'rule'].every((at) => tightMany.some((c) => c.at === at)), '「緊排的好幾塊」三種共用元件(h3 / es / rule)各要有一格')
  expect(flipped.some((c) => c.kind === 'heading-one'), '「一則示範 + 一段說明」至少要有一格')
  const gapBefore = (c, density) => (c.flippedFrom === 'heading-one' ? (density === 'md' ? 12 : 16) : (density === 'md' ? 16 : 24))
  const flippedBefore = judge(flipped.flatMap((c) => [hrow(c.id, c.kind, 'md', 16, 12, [gapBefore(c, 'md')]), hrow(c.id, c.kind, 'lg', 24, 16, [gapBefore(c, 'lg')])]))
  expect(flippedBefore.length === flipped.length * 2, `2026-11-12 翻面的格子用修前距離應 ${flipped.length * 2} 格都紅,實得 ${flippedBefore.length}:${JSON.stringify(flippedBefore)}`)
  expect(tightMany.every((c) => flippedBefore.some((s) => s.startsWith(`${c.id} @md`) && s.includes('loose:標題底下兩塊以上'))), '緊排的好幾塊被縮成 tight 應指名「兩塊以上」')
  console.log(ok ? '✅ section-gap selftest PASS' : '❌ section-gap selftest FAIL')
  return ok
}

async function measureCase(page, origin, c, density) {
  const url = `${origin}/iframe.html?id=${encodeURIComponent(c.story)}&viewMode=story&globals=${encodeURIComponent(`theme:light;density:${density}`)}`
  if (c.kind === 'heading-one' || c.kind === 'heading-many') {
    // 等被量的標題本身出現;標題區底 = H3(或緊接的 Desc)/ ExampleSection 第一個子節點(標題 + 說明)的底,內容頂 = 下一個畫面上佔位置的節點
    const sel = c.at === 'h3' ? '[data-spec-heading]' : c.at === 'rule' ? '[data-tutorial-rule]' : '[data-example-section]:not([data-tutorial-rule])'
    await openStory(page, url, { waitFor: sel, label: c.story })
    return page.evaluate(({ sel, at, text }) => {
      const inFlow = (e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed' }
      const host = [...document.querySelectorAll(`#storybook-root ${sel}`)].find((e) => (at === 'h3' ? e.textContent : e.firstElementChild?.textContent ?? '').trim().startsWith(text))
      const root = document.querySelector('#storybook-root')
      const loose = parseFloat(getComputedStyle(host ?? root).getPropertyValue('--layout-space-loose'))
      const tight = parseFloat(getComputedStyle(host ?? root).getPropertyValue('--layout-space-tight'))
      if (!host) return { loose, tight, gaps: [] }
      let label = host
      let next = null
      if (at === 'h3') {
        if (host.nextElementSibling?.hasAttribute('data-spec-desc')) label = host.nextElementSibling
        for (let n = label.nextElementSibling; n; n = n.nextElementSibling) if (inFlow(n)) { next = n; break }
      } else {
        const kids = [...host.children].filter(inFlow)
        label = kids[0]
        next = kids[1] ?? null
      }
      const round = (v) => Math.round(v * 10) / 10
      return { loose, tight, gaps: next ? [round(next.getBoundingClientRect().top - label.getBoundingClientRect().bottom)] : [] }
    }, { sel, at: c.at, text: c.text })
  }
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
  if (!staticArg) requireFreshStorybookBuild(STATIC, ['packages/design-system/src/components/FileViewer/file-viewer.tsx', 'packages/design-system/src/components/Separator', 'packages/design-system/src/tokens/layoutSpace/layoutSpace.css', 'packages/design-system/src/components/Field/field.stories.tsx', 'packages/design-system/src/components/Field/field.principles.stories.tsx', 'packages/design-system/src/components/Rating/rating.stories.tsx', 'packages/design-system/src/components/Select/select.principles.stories.tsx', 'packages/design-system/src/components/Checkbox/checkbox.principles.stories.tsx', 'packages/design-system/src/components/Steps/steps.stories.tsx', 'packages/design-system/src/stories-helpers/examples/tutorial-page.tsx', 'packages/design-system/src/stories-helpers/anatomy/anatomy-utils.tsx', 'packages/design-system/src/components/ProgressBar/progress-bar.anatomy.stories.tsx', 'packages/design-system/src/components/Checkbox/checkbox.anatomy.stories.tsx', 'packages/design-system/src/components/Chip/chip.principles.stories.tsx', 'packages/design-system/src/components/Tabs/tabs.anatomy.stories.tsx'])
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
