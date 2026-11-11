#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: Sidebar 展示五則有主區的範例,主區內容跟著選到的項目走(user 2026-11-06 #56 選甲):
 *         · 資料夾 → 那個資料夾裡的檔案清單(DataTable,欄位 名稱 / 最後修改 / 修改者);
 *         · 檔案 → 這個檔案的版本紀錄(DataTable,欄位 版本 / 說明 / 修改者 / 時間,撐滿主區、不放 DescriptionList;user 2026-11-10 PR #172 留言
 *           「我的意思是不想要看到description list類型的主內容，我建議改成table之類的」;2e1f2e27 以前是 max-w-2xl 的屬性清單 → 該步紅);
 *           專案 → 這個專案的議題(DataTable);每一步的表格都要撐滿主區(只扣頁面左右內距);
 *         · Dashboard 等主導覽 → 同範本 DashboardPage 的做法(「今日待處理」DataTable 一張),主區不放 DescriptionList
 *           (user 同日原話「也沒有要強迫消費者一定要使用description list」)。
 *         · 每一步主區都只有一張表格 → 標頭下不再放區段標題(h2–h6 / role=heading),表格直接接在標頭下(app-shell.spec.md「Main 內塞什麼」;
 *           user 2026-11-11 留言「此外我覺得其實大部分的情境根本不用在主內容區又放上標題和描述，因為通常的情境是標頭的標題就可以完整表示這個頁面要幹嘛了吧」)。
 *         「混合內容」實際點樹:frontend(預設)→ backend → README.md → Dashboard,每一步都驗標題與主區。
 *   紅: 任一步主區的標題 / 表格名稱 / 欄名 / 列數 / 有無 DescriptionList / 有無區段標題與期望不符 → 指名 story / 步驟並 exit 1。
 *       歷史紅燈(修前 main 8eb473c7 建置):五則主區都是同一份 Sprint 摘要 DescriptionList,沒有表格,選 frontend 也一樣。
 *       修前 411fcc49 建置:Dashboard / 專案 / 整合那幾步表格上方有區段標題 h2(今日待處理議題 / 進行中的議題)→ 紅。
 *   綠: 每一步都對。無動畫判斷;重複跑恆等。
 *   量法: 靜態站開 story,等主區的表格 / 清單本身出現(不睡固定時間);點樹用 TreeView(treegrid)列的可見文字。
 *         `--selftest` 把修前形狀、表格名稱錯、主導覽放 DescriptionList、沒量到餵進判定函式必紅,修後形狀必綠。
 *         `--static=<dir>` 指定建置(例:拿修前建置證明會紅);指定時不跑新鮮度守衛。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, openStory, requireFreshStorybookBuild, StoryRenderInstrumentError } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticArg = process.argv.find((a) => a.startsWith('--static='))
const STATIC = path.resolve(staticArg ? staticArg.slice('--static='.length) : path.join(REPO, 'storybook-static'))
const SB = 'design-system-components-sidebar-展示--'
const PENDING = { table: '今日待處理議題', headers: ['議題', '標題', '負責人', '截止日'], rows: 4, dl: false }
const FILES = ['名稱', '最後修改', '修改者']

/** 每一步:click = 樹上 / 導覽要點的文字(null = 預設);expect = 期望的主區。 */
export const CASES = [
  { story: 'icon-collapse', steps: [{ click: null, h1: 'Dashboard', ...PENDING }] },
  { story: 'group-action', steps: [{ click: null, h1: '結帳流程改版', table: '進行中的議題', headers: PENDING.headers, rows: 3, dl: false }] },
  { story: 'offcanvas', steps: [{ click: null, h1: 'Dashboard', ...PENDING }] },
  { story: 'integration-sidebar', steps: [{ click: null, h1: 'Home', ...PENDING }] },
  { story: 'mixed-content', steps: [
    { click: null, h1: 'frontend', table: 'frontend 裡的檔案', headers: FILES, rows: 4, dl: false },
    { click: 'backend', h1: 'backend', table: 'backend 裡的檔案', headers: FILES, rows: 3, dl: false },
    { click: 'README.md', h1: 'README.md', table: 'README.md 的版本紀錄', headers: ['版本', '說明', '修改者', '時間'], rows: 6, dl: false, fileView: true },
    { click: 'Dashboard', h1: 'Dashboard', ...PENDING },
  ] },
]

/** 純函式:[{ story, step, expect, got }] → 不符合的訊息清單。got = { h1, tableName, headers, rows, dl, dlText } 或 null(沒量到)。 */
export function judge(results) {
  const failures = []
  for (const { story, step, expect: e, got: g } of results) {
    const where = `${story} 第 ${step + 1} 步${e.click ? `(點「${e.click}」)` : '(預設)'}`
    if (!g) { failures.push(`${INSTRUMENT_FAIL_MARKER}:${where} 沒量到主區`); continue }
    if (g.h1 !== e.h1) failures.push(`${where} 標題 = 「${g.h1}」,應「${e.h1}」`)
    if (e.table) {
      if (g.tableName !== e.table) failures.push(`${where} 主區表格 = 「${g.tableName ?? '沒有表格'}」,應「${e.table}」(主區要跟著選到的項目走)`)
      else {
        if (JSON.stringify(g.headers) !== JSON.stringify(e.headers)) failures.push(`${where} 欄名 = ${JSON.stringify(g.headers)},應 ${JSON.stringify(e.headers)}`)
        if (g.rows !== e.rows) failures.push(`${where} 列數 = ${g.rows},應 ${e.rows}`)
      }
    } else if (g.tableName) failures.push(`${where} 不該有表格,實得「${g.tableName}」`)
    if (e.dl !== g.dl) failures.push(`${where} 主區 ${g.dl ? '有' : '沒有'} DescriptionList,應${e.dl ? '有' : '沒有'}${e.table === PENDING.table ? '(主導覽照範本 DashboardPage,不強迫 DescriptionList)' : e.fileView ? '(選到檔案 = 版本紀錄表格,不是屬性清單;user 2026-11-10 PR #172 留言)' : ''}`)
    if (e.table && g.tableName === e.table && !(g.fillGap <= 1)) failures.push(`${where} 表格沒有撐滿主區(比主區窄 ${g.fillGap}px)—— 不限寬,只扣頁面左右內距`)
    if (g.sectionTitle) failures.push(`${where} 主區只有一張表格,標頭下又放了區段標題「${g.sectionTitle}」—— 標頭已說明這頁是什麼,不重複放標題與說明(app-shell.spec.md「Main 內塞什麼」)`)
  }
  return failures
}

function selftest() {
  let ok = true
  const expect = (cond, msg) => { if (!cond) { console.error(`✗ selftest:${msg}`); ok = false } }
  const gotFor = (e) => ({ h1: e.h1, tableName: e.table, headers: e.headers, rows: e.rows, dl: e.dl, dlText: '', fillGap: 0, sectionTitle: null })
  const good = CASES.flatMap((c) => c.steps.map((e, i) => ({ story: c.story, step: i, expect: e, got: gotFor(e) })))
  expect(judge(good).length === 0, `修後形狀應綠,實得 ${JSON.stringify(judge(good))}`)
  // 修前 main 8eb473c7:主區一律 Sprint 摘要 DescriptionList、沒有表格
  const before = good.map((r) => ({ ...r, got: { h1: r.expect.h1, tableName: null, headers: [], rows: 0, dl: true, dlText: 'Sprint 42(5/18 – 5/29)' } }))
  const fb = judge(before)
  expect(CASES.every((c) => fb.some((s) => s.startsWith(c.story))), `修前形狀應五則都紅,實得 ${JSON.stringify(fb)}`)
  const wrongFolder = good.map((r) => (r.expect.click === 'backend' ? { ...r, got: { ...r.got, tableName: 'frontend 裡的檔案' } } : r))
  expect(judge(wrongFolder).some((s) => s.includes('backend') && s.includes('frontend 裡的檔案')), '點 backend 主區還是 frontend 應紅')
  const dlOnDashboard = good.map((r) => (r.story === 'icon-collapse' ? { ...r, got: { ...r.got, dl: true } } : r))
  expect(judge(dlOnDashboard).some((s) => s.includes('不強迫 DescriptionList')), '主導覽放 DescriptionList 應紅')
  // 2e1f2e27 的 README.md:主區是 max-w-2xl 的屬性清單(位置 / 最後修改 / 修改者),沒有表格
  const readmeBefore = good.map((r) => (r.expect.click === 'README.md' ? { ...r, got: { ...r.got, tableName: null, headers: [], rows: 0, dl: true, dlText: '位置Web App / README.md' } } : r))
  const fr = judge(readmeBefore)
  expect(fr.some((s) => s.includes('不是屬性清單')) && fr.some((s) => s.includes('README.md 的版本紀錄')), `檔案主區放屬性清單應紅,實得 ${JSON.stringify(fr)}`)
  const readmeNarrow = good.map((r) => (r.expect.click === 'README.md' ? { ...r, got: { ...r.got, fillGap: 368 } } : r))
  expect(judge(readmeNarrow).some((s) => s.includes('沒有撐滿主區')), '表格限寬(比主區窄,例:max-w-2xl)應紅')
  // 修前 411fcc49:Dashboard / 專案那幾步表格上方有區段標題(TableSection 的 h2),表格名稱由它 aria-labelledby 給 —— 名稱對、但多了標題
  const titleBack = good.map((r) => (r.expect.table === PENDING.table || r.story === 'group-action' ? { ...r, got: { ...r.got, sectionTitle: r.expect.table } } : r))
  const ft = judge(titleBack)
  expect(['icon-collapse', 'group-action', 'offcanvas', 'integration-sidebar', 'mixed-content'].every((s) => ft.some((m) => m.startsWith(s) && m.includes('區段標題'))), `主區放回區段標題應每則都紅,實得 ${JSON.stringify(ft)}`)
  const injected = titleBack.filter((r) => r.got.sectionTitle).length
  expect(injected === 5 && ft.length === injected, `只有放回標題的 5 步該紅(資料夾 / 檔案那幾步本來就沒標題,不得被誤判),實得 ${ft.length} / ${injected}`)
  expect(judge([{ ...good[0], got: null }]).some((s) => s.includes(INSTRUMENT_FAIL_MARKER)), '沒量到應判儀器失效')
  console.log(ok ? '✅ sidebar-main-follows-selection selftest PASS' : '❌ sidebar-main-follows-selection selftest FAIL')
  return ok
}

const readMain = () => {
  const main = document.querySelector('#storybook-root main')
  if (!main) return null
  const table = main.querySelector('[role="table"], [role="grid"]')
  let tableName = null
  if (table) tableName = table.getAttribute('aria-label') ?? document.getElementById(table.getAttribute('aria-labelledby') ?? '')?.textContent?.trim() ?? ''
  const headers = table ? [...table.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent.trim()).filter(Boolean) : []
  const rows = table ? [...table.querySelectorAll('[role="row"]')].filter((r) => r.querySelector('[role="cell"], [role="gridcell"]')).length : 0
  const dl = main.querySelector('dl')
  // 撐滿:表格外框寬 vs 主區捲動容器內寬扣掉頁面左右內距(表格的包層 = 主區捲動容器的直接子元素,內距由它給)
  let fillGap = null
  if (table) {
    let wrap = table
    while (wrap.parentElement && !wrap.parentElement.classList.contains('overflow-auto')) wrap = wrap.parentElement
    const cs = getComputedStyle(wrap)
    const inner = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    let box = table
    while (box.parentElement && box.parentElement !== wrap) box = box.parentElement
    fillGap = Math.round((inner - box.getBoundingClientRect().width) * 10) / 10
  }
  // 區段標題:主區裡、標頭(header)之外、看得見的標題元素(h2–h6 或 role=heading)—— 表格內部沒有標題元素
  const heading = [...main.querySelectorAll('h2, h3, h4, h5, h6, [role="heading"]')].find((h) => !h.closest('header') && h.getBoundingClientRect().height > 0)
  return { h1: main.querySelector('h1')?.textContent.trim() ?? null, tableName, headers, rows, dl: !!dl, dlText: dl?.textContent ?? '', fillGap, sectionTitle: heading ? heading.textContent.trim() : null }
}

async function waitMain(page, e) {
  // 等主區的內容本身:有表格的步等那張表(拿舊建置當對照組時 README.md 那步是 dl,也一併等),且 h1 已換成這一步的標題
  await page.waitForFunction(({ h1, wantTable }) => {
    const main = document.querySelector('#storybook-root main')
    if (!main || main.querySelector('h1')?.textContent.trim() !== h1) return false
    return wantTable ? !!main.querySelector('[role="table"] [role="columnheader"], [role="grid"] [role="columnheader"], dl') : !!main.querySelector('dl')
  }, { h1: e.h1, wantTable: !!e.table }, { timeout: 10_000 }).catch(() => {})
  return page.evaluate(readMain)
}

async function measure() {
  if (!staticArg) requireFreshStorybookBuild(STATIC, ['packages/design-system/src/components/Sidebar/sidebar.stories.tsx', 'packages/design-system/src/components/DataTable/data-table.tsx', 'packages/design-system/src/components/DescriptionList/description-list.tsx'])
  const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html' })
  const browser = await launchBrowserOrSkip()
  if (!browser) { await server.stop(); return null }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const results = []
    for (const c of CASES) {
      const id = SB + c.story
      await openStory(page, `${server.origin}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&globals=${encodeURIComponent('theme:light')}`, { waitFor: '#storybook-root main h1', label: id })
      for (const [i, e] of c.steps.entries()) {
        if (e.click) {
          const target = page.locator('#storybook-root [role="treegrid"] [role="row"], #storybook-root button').filter({ hasText: new RegExp(`^\\s*${e.click.replace(/[.]/g, '\\.')}\\s*$`) }).first()
          if (await target.count()) await target.click()
        }
        results.push({ story: c.story, step: i, expect: e, got: await waitMain(page, e) })
      }
    }
    return results
  } finally { await browser.close(); await server.stop() }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1)
  try {
    const results = await measure()
    if (results === null) process.exit(0) // launchBrowserOrSkip 已印 SKIPPED-ENV / INSTRUMENT-FAIL 判定
    for (const r of results) console.log(`  ${r.story.padEnd(20)} 步 ${r.step + 1}  h1 ${r.got?.h1}  表格 ${r.got?.tableName ?? '-'}  列 ${r.got?.rows ?? '-'}  dl ${r.got?.dl}  區段標題 ${r.got?.sectionTitle ?? '-'}`)
    const failures = judge(results)
    if (failures.length) { console.error('❌ sidebar-main-follows-selection FAIL:\n  ' + failures.join('\n  ')); process.exit(1) }
    console.log('✅ sidebar-main-follows-selection PASS(主區跟著選到的項目走;主導覽照範本 DashboardPage;只有一張表格的主區不重複放區段標題)')
  } catch (error) {
    if (error instanceof StoryRenderInstrumentError) { console.error(`✗ ${INSTRUMENT_FAIL_MARKER}:${error.message}`); process.exit(1) }
    throw error
  }
}
