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
 * 用法:node scripts/measure-action-dividers.mjs --dir storybook-static [--json]
 *       node scripts/measure-action-dividers.mjs --base <storybook-url> [--json]
 * --dir 會用 node 內建 http 起靜態服務(不依賴 npx / 外部套件)。需要 Playwright;
 * 本機 sandbox 起不了瀏覽器時走 visual-regression CI lane。
 *
 * 開 story(2026-09-25 起):lib/launch-browser.mjs 的 openStory(全部瀏覽器閘共用的唯一實作)——
 *   Storybook 回報渲染完成(含 play)+ render-health(+ 有觸發鈕的情境等觸發鈕本身、點下去後等分隔線出現)
 *   + 版面連續 10 影格靜止(Toast 進場動畫走完)才量。取代原本的「networkidle(失敗還被 `.catch(() => {})` 吞掉)
 *   + 固定睡 1200ms」與「找不到觸發鈕就靜靜不點」(M37:都是「已渲染」的代理)。
 *   story 開不起來 / 觸發鈕點不下去 = 儀器失效:點名 story、附同源 404、exit 2 —— 不是產品裁決;
 *   舊寫法在 story 檔 404 時把它算成「這些情境沒量到任何分隔線(story id 或觸發方式不對)」並 exit 1。
 *   渲染完成且健康、卻沒有任何 [data-action-divider] → 仍是這支閘的紅(exit 1):那是元件 / 情境層的事實。
 */
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { launchBrowser, openStory, StoryRenderInstrumentError } from './lib/launch-browser.mjs'

const arg = (name, fallback = null) => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

// 靜態服務用 node 內建起,不透過 npx 抓外部套件(供應鏈規則:npx 必須 --no-install,
// 見 scripts/audit-workflow-security.mjs WF-NPX)。
// 從本次獨佔的建置快照供檔(lib/a11y-static-server.mjs),不再讀活的 storybook-static —— 2026-09-24 別的 agent 同時 build-storybook 清空目錄,導致本機誤紅。
const DIR = arg('--dir')
const served = DIR ? await startA11yStaticServer({ rootDirectory: DIR, defaultFile: 'iframe.html' }) : null
// 失敗(非零結束或拋錯)一律附上同源 404 帳本:「儀器沒拿到檔」不得被讀成「沒有分隔線 / 幾何錯」
process.on('exit', code => {
  if (code && served?.notFound.length) console.error('同源 404:', [...new Set(served.notFound)].join(', '))
})
const BASE = served?.origin || arg('--base') || process.env.STORYBOOK_BASE
if (!BASE) {
  console.error('usage: node scripts/measure-action-dividers.mjs (--dir <storybook-static> | --base <url>)')
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
  // DataTable 的三個面板(篩選/排序/欄位顯示)走同一個 ButtonDivider,且它們的列高與
  // Notice 一樣是 21px 的 chrome slot —— 也就是「容器比自身內容矮 → 地板生效」那條路徑,
  // 已由上面的 Alert 與 Toast 實測涵蓋(16px / 0.67)。面板本身要靠 Popover 互動開啟,
  // 截圖 lane 驅動不穩定,列進來只會製造 flaky,故不列;這是明示的取捨,不是漏掉。
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

const browser = await launchBrowser()
const page = await browser.newPage({ viewport: { width: 1000, height: 760 } })
const results = []
/** 沒量到的情境(儀器失效,不是產品裁決):任何一筆都讓整次 exit 2,絕不算通過 */
const instrumentFails = []
for (const testCase of CASES) {
  const url = `${BASE.replace(/\/$/, '')}/iframe.html?id=${encodeURIComponent(testCase.id)}&viewMode=story`
  const trigger = !testCase.click ? null
    : testCase.clickByLabel ? `button[aria-label="${testCase.click}"]` : `button:has-text("${testCase.click}")`
  let clickError = null
  try {
    await openStory(page, url, {
      // 有觸發鈕的情境:等觸發鈕本身;沒有的情境:分隔線在渲染完成時就該在,不另等(沒有 = 下方「沒量到任何分隔線」的紅)
      waitFor: trigger,
      // 點下去之後才出現的浮層(Toast):在靜止判定之前點,openStory 再等版面連續靜止(進場動畫走完)才回來量
      beforeSettle: trigger ? async (p) => {
        try { await p.locator(trigger).first().click({ timeout: 10_000 }) } catch (error) { clickError = error; return }
        // 等被量的分隔線本身出現;等不到不在這裡判,交給下方「沒量到任何分隔線」判紅(不吞成通過)
        await p.waitForSelector('[data-action-divider]', { state: 'attached', timeout: 10_000 }).catch(() => {})
      } : null,
      settleFrames: 10,
      notFound: served?.notFound ?? null,
    })
  } catch (error) {
    if (!(error instanceof StoryRenderInstrumentError)) throw error
    console.error(`✗ ${error.message}`)
    instrumentFails.push(`${testCase.label}(${testCase.id}):${error.detail}`)
    continue
  }
  if (clickError) {
    const reason = `觸發鈕「${testCase.click}」點不下去:${String(clickError.message).split('\n')[0]}`
    console.error(`✗ INSTRUMENT-FAIL story「${testCase.id}」沒有量到 —— ${reason}。這是儀器失效(沒量到),不是產品裁決`)
    instrumentFails.push(`${testCase.label}(${testCase.id}):${reason}`)
    continue
  }
  results.push({ ...testCase, lines: await page.evaluate(MEASURE) })
}
await browser.close()
await served?.stop()

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
if (missing.length) failures.push(`這些情境渲染完成卻沒有任何分隔線(元件不再渲染 [data-action-divider],或觸發方式不對;不得當成通過):${missing.join('、')}`)

if (asJson) {
  console.log(JSON.stringify({ base: BASE, results, failures, instrumentFails }, null, 2))
} else {
  for (const result of results) {
    console.log(`\n── ${result.label}`)
    if (!result.lines.length) { console.log('   (此 story 未渲染分隔線)'); continue }
    for (const line of result.lines) {
      console.log(`   線 ${String(line.lineHeight).padStart(5)}px / 最高元件 ${String(line.tallestSibling).padStart(5)}px = ${line.ratio}  中心偏移 ${line.centerOffset}px ${line.centered ? '✓' : '✗'}  寬 ${line.width}px`)
    }
  }
}

if (instrumentFails.length) {
  // 沒量到 ≠ 沒問題:有情境開不起來,這次不能算通過,也不是產品裁決(已量到的情境若另有失敗一併列出)
  for (const failure of failures) console.error(`   - ${failure}`)
  console.error(`\n✗ 儀器失效 ${instrumentFails.length} 個情境 —— 這次沒量完,不是產品裁決,也不算通過:`)
  for (const item of instrumentFails) console.error(`   - ${item}`)
  process.exit(2)
}
if (!measured) {
  console.error('\n❌ 沒有量到任何分隔線 —— 情境或 base URL 不對,不得視為通過')
  process.exit(1)
}
if (failures.length) {
  console.error(`\n❌ 分隔線幾何量測失敗 ${failures.length} 項:`)
  for (const failure of failures) console.error(`   - ${failure}`)
  process.exit(1)
}
console.log(`\n✅ ${measured} 個情境的分隔線全部落在 ${RATIO_MIN}–${RATIO_MAX} 比值帶、寬 1px、垂直置中,且同畫面長度一致`)
