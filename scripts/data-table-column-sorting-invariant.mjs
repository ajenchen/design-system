#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DataTable 頁面上**真的**照欄型排序(components/DataTable/lib/column-sorting.ts;data-table.spec.md「七、Column Type」排序表)——
 *        在專案排程(roadmap-all-in-one,500 列、虛擬捲動)點表頭排「負責人」(person)、「審核」(multiPerson)、「標題」(string),
 *        升冪與降冪各一次;每次把整張表捲過一遍、逐列讀出畫面上的名字 / 文字(人員欄讀名字、多人欄讀頭像的 alt,依格上順序),
 *        相鄰兩列用同一支 `compareColumnValues` 比,升冪不得出現後面比前面小、降冪反之;且讀到的不同值 ≥ 2(不然單調是空話)。
 *   紅: 修前(4e7a8572 建置,`--build=<那份建置>`):人員 / 多人欄排出來不照名字 → 紅;「標題」是對照列(500 列時自動判斷看得到字串,修前也照字排)。
 *        `--selftest`:把讀到的序列換掉相鄰一對(破法)必紅、原序列(對照列)必綠 —— 證明判定會紅;頁面讀不到列 / 捲不動 / 多人欄有 +N
 *        溢出(讀不到被藏起來的人)= INSTRUMENT-FAIL(exit 2),不當成通過。
 *   綠: 修好的建置三欄六次全部單調。
 *   node scripts/data-table-column-sorting-invariant.mjs [--build=<storybook 建置目錄>] [--selftest]
 */
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowserOrSkip, openStory, requireStorybookBuild, requireFreshStorybookBuild, settleAfterInteraction, parkPointer, INSTRUMENT_FAIL_MARKER } from './lib/launch-browser.mjs'
import { startA11yStaticServer } from './lib/a11y-static-server.mjs'
import { compareColumnValues } from '../packages/design-system/src/components/DataTable/lib/column-sorting.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SELFTEST = process.argv.includes('--selftest')
const buildArg = process.argv.find((a) => a.startsWith('--build='))?.slice('--build='.length)
const STATIC = buildArg ? (isAbsolute(buildArg) ? buildArg : join(process.cwd(), buildArg)) : join(REPO, 'storybook-static')
requireStorybookBuild(join(STATIC, 'index.json'))
if (!buildArg) requireFreshStorybookBuild(STATIC, ['packages/design-system/src/components/DataTable'])

const ROADMAP = `iframe.html?id=${encodeURIComponent('design-system-components-datatable-展示--roadmap-all-in-one')}&viewMode=story`
const COLUMNS = [
  { id: 'owner', type: 'person', label: '負責人' },
  { id: 'reviewers', type: 'multiPerson', label: '審核' },
  { id: 'title', type: 'string', label: '標題(對照列)', control: true },
]

let failCount = 0
let instrumentFail = false
const check = (name, pass, detail = '', { control = false } = {}) => {
  console.log(`${pass ? '✓' : '✗'} ${control ? '[對照列] ' : ''}${name}${detail ? ` | ${detail}` : ''}`)
  if (!pass) failCount++
}
const instrument = (name, detail) => { instrumentFail = true; console.log(`✗ ${INSTRUMENT_FAIL_MARKER} ${name} | ${detail}`) }

/** 判定:相鄰兩列比較,升冪不得 > 0、降冪不得 < 0;回第一個違規的位置(-1 = 沒有) */
function firstViolation(type, keys, desc) {
  for (let i = 1; i < keys.length; i += 1) {
    const c = compareColumnValues(type, keys[i - 1], keys[i])
    if (desc ? c < 0 : c > 0) return i
  }
  return -1
}
const distinct = (keys) => new Set(keys.map((k) => JSON.stringify(k))).size

if (SELFTEST) {
  // 判定本身的對照組:同一份排好的序列必綠、換掉相鄰一對必紅(三型各一)
  const sorted = {
    person: ['Alexander Hamilton Zhang', 'Alice Wonderland Wang', 'alice', 'Bob Christopher Chen', 'Carol Liu'].sort((a, b) => compareColumnValues('person', a, b)),
    multiPerson: [[], [{ name: 'Alice' }], [{ name: 'Alice' }, { name: 'Carol' }], [{ name: 'Bob' }]],
    string: ['A/B 測試平台', 'Dark mode 全站支援', '客服 CSAT 儀表板'],
  }
  let bad = 0
  for (const [type, keys] of Object.entries(sorted)) {
    const okSorted = firstViolation(type, keys, false) === -1
    const swapped = [...keys]; [swapped[0], swapped[swapped.length - 1]] = [swapped[swapped.length - 1], swapped[0]]
    const caught = firstViolation(type, swapped, false) !== -1
    console.log(`${okSorted ? '✓' : '✗'} [對照列應綠] ${type} 排好的序列`)
    console.log(`${caught ? '✓' : '✗'} [破法應紅] ${type} 頭尾對調`)
    if (!okSorted || !caught) bad++
  }
  console.log(bad === 0 ? '✓ selftest:判定會紅、對照列綠' : `✗ selftest:${bad} 組不符`)
  process.exit(bad === 0 ? 0 : 1)
}

const server = await startA11yStaticServer({ rootDirectory: STATIC, defaultFile: 'iframe.html', snapshot: true })
const browser = await launchBrowserOrSkip({}, { cleanup: () => server.stop() })
const context = await browser.newContext({ viewport: { width: 2600, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const settle = async () => (await settleAfterInteraction(page, { frames: 6, capMs: 6000 })).ok

/** 整張表捲過一遍,依列序讀出這一欄的排序鍵(人員 = 名字;多人 = 依格上順序的頭像 alt;文字 = 格的文字) */
async function readColumn(colId, type) {
  const box = await page.evaluate((id) => {
    const cell = document.querySelector(`[data-cell-id$=":${id}"]`)
    let el = cell?.parentElement
    while (el && !(el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement
    if (!el) return null
    el.setAttribute('data-sort-probe-scroller', '')
    el.scrollTop = 0
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
  }, colId)
  if (!box) return { error: '找不到這一欄的儲存格或捲動容器' }
  const byIndex = new Map()
  let overflow = 0
  for (let top = 0, guard = 0; guard < 400; guard += 1) {
    await settle()
    const got = await page.evaluate(({ id, type }) => {
      const out = []
      let overflowHere = 0
      for (const cell of document.querySelectorAll(`[data-cell-id$=":${id}"]`)) {
        const row = cell.closest('[role="row"][data-row-index]')
        if (!row) continue
        const idx = Number(row.getAttribute('data-row-index'))
        const cellId = cell.getAttribute('data-cell-id')
        const rowId = cellId.slice(0, cellId.lastIndexOf(':'))
        if (type === 'multiPerson') {
          if (cell.querySelector('[data-overflow-indicator]')) overflowHere += 1
          out.push([idx, rowId, [...cell.querySelectorAll('img[alt]')].map((img) => ({ name: img.getAttribute('alt') }))])
        } else {
          out.push([idx, rowId, (cell.textContent ?? '').trim()])
        }
      }
      const s = document.querySelector('[data-sort-probe-scroller]')
      return { out, overflowHere, scrollTop: s.scrollTop, max: s.scrollHeight - s.clientHeight, step: Math.max(40, s.clientHeight - 80) }
    }, { id: colId, type })
    for (const [idx, rowId, key] of got.out) byIndex.set(idx, { rowId, key })
    overflow += got.overflowHere
    if (got.scrollTop >= got.max - 1) break
    top = Math.min(got.max, got.scrollTop + got.step)
    await page.evaluate((t) => { document.querySelector('[data-sort-probe-scroller]').scrollTop = t }, top)
  }
  const indices = [...byIndex.keys()].sort((a, b) => a - b)
  const gaps = indices.filter((v, i) => i > 0 && v !== indices[i - 1] + 1).length
  // 巢狀列:TanStack 只在同一層兄弟之間排序,子列跟著父列 —— 只拿最上層的列比(子列 id = 父列 id + `-N` / `.N`,本 story 的 getRowId)
  const ids = new Set(indices.map((i) => byIndex.get(i).rowId))
  const isChild = (id) => { const m = /^(.*)[-.]\d+$/.exec(id); return m != null && ids.has(m[1]) }
  const top = indices.filter((i) => !isChild(byIndex.get(i).rowId))
  return { keys: top.map((i) => byIndex.get(i).key), rows: indices.length, topRows: top.length, gaps, overflow }
}

async function sortBy(colId) {
  const head = page.locator(`[role="columnheader"][data-column-id="${colId}"] [role="button"]`).first()
  if ((await head.count()) === 0) return false
  await head.click()
  await parkPointer(page)
  return settle()
}

async function ariaSort(colId) {
  return page.evaluate((id) => document.querySelector(`[role="columnheader"][data-column-id="${id}"]`)?.getAttribute('aria-sort'), colId)
}

for (const { id, type, label, control } of COLUMNS) {
  try {
    await openStory(page, `${server.origin}/${ROADMAP}`, { waitFor: () => document.querySelectorAll('[data-cell-id]').length > 20, settleFrames: 8, notFound: server.notFound })
  } catch (error) { instrument(`開 roadmap-all-in-one`, String(error?.message ?? error).slice(0, 200)); break }
  for (const want of ['ascending', 'descending']) {
    if (!(await sortBy(id))) { instrument(`${label} 點表頭`, '找不到排序區或畫面沒穩定'); continue }
    const got = await ariaSort(id)
    if (got !== want) { instrument(`${label} 第 ${want === 'ascending' ? 1 : 2} 下`, `aria-sort=${got},預期 ${want}`); continue }
    const r = await readColumn(id, type)
    if (r.error) { instrument(`${label} 讀欄`, r.error); continue }
    if (r.rows < 100 || r.gaps > 0) { instrument(`${label} ${want} 讀欄`, `只讀到 ${r.rows} 列、斷 ${r.gaps} 處(捲動沒有走完整張表)`); continue }
    if (type === 'multiPerson' && r.overflow > 0) { instrument(`${label} ${want} 讀欄`, `${r.overflow} 格有 +N 溢出,讀不到被藏起來的人`); continue }
    const nDistinct = distinct(r.keys)
    if (nDistinct < 2) { instrument(`${label} ${want}`, `整欄只有 ${nDistinct} 種值,單調是空話`); continue }
    const v = firstViolation(type, r.keys, want === 'descending')
    check(`${label} ${want === 'ascending' ? '升冪' : '降冪'}:${r.rows} 列(最上層 ${r.topRows} 列)逐列照${type === 'string' ? '文字' : '名字'}排`, v === -1,
      v === -1 ? `${nDistinct} 種值` : `第 ${v} 列 ${JSON.stringify(r.keys[v - 1]).slice(0, 60)} → ${JSON.stringify(r.keys[v]).slice(0, 60)}`, { control })
  }
}

await browser.close()
await server.stop()
if (instrumentFail) { console.log(`✗ ${INSTRUMENT_FAIL_MARKER}:有量不到的項目(見上),不當成通過`); process.exit(2) }
console.log(failCount === 0 ? '✓ data-table-column-sorting-invariant:全部照欄型排' : `✗ data-table-column-sorting-invariant:${failCount} 項不符`)
process.exit(failCount === 0 ? 0 : 1)
