#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DataTable 試算表模式(`spreadsheetMode`)的「點外清除」認的是**這一張表**:滑鼠按在本表以外 —— 頁面空白、同一頁的另一張試算表、
 *        把本表裝在格子裡的外層表格 —— 本表的格游標與區間都清掉;按在本表自己的格上照本表的點格規則走(Shift+點延伸區間,不被當成外面)。
 *        規則:`components/DataTable/data-table.tsx` 點外清除那段(「pointerdown 落在 table outer 外 → clear selection + range」,2026-05-12 起的既有行為)、
 *        `components/DataTable/data-table.spec.md`「試算表模式」段表下第一條(滑鼠按在本表以外 = 清掉;用 Tab 離開 = 保留)。
 *   紅: 任一列不符 → 逐列點名 exit 1。`--selftest` 在 DS 原始碼上各造回一個根因突變(MUTANTS),每個突變必須**剛好**紅它負責的那幾列,
 *        契約列每一條都要被某個突變弄紅過。`--root=<修改前的整棵原始碼>` = 天然對照組(108a736f 基準樹:三條「另一張表」列紅,其餘綠)。
 *   綠: 現行原始碼每列都量到且符合;對照列(點頁面空白清掉、Shift+點本表延伸區間 —— 修前就對)在現行原始碼與每個突變上都綠 ——
 *        證明量具看得到「清掉」也看得到「區間長大」,紅燈不是量具壞了。
 *        harness 載不起來 / 格找不到或被蓋住 / 區間沒建起來 / 等不到靜止 = 儀器失效(INSTRUMENT-FAIL,exit 1),不得讀成通過(M37:沒量到 ≠ 沒發生)。
 *   註: 2026-11-03 新增(n2 同族掃 / 交接稽核 G-18)。根因:點外清除寫成 `!target.closest('[data-data-table-outer]')` ——
 *        「按在**任何一張**表的外框裡」被當成「按在本表裡」,於是同一頁兩張試算表時,點另一張表的格,本表的區間底色與游標都留著
 *        (點頁面空白卻會清掉,同一條規則兩種結果);表格放在另一張表的格子裡時,點外層表格也不清。與 SelectMenu / InlineEdit 的
 *        「任何一層浮層 = 自己的」(overlay-nested-dismiss,同日)同一個形狀:用「同一類容器的任何一個」代替「這一個」(M37)。
 *
 * ── 判定表(列名 = <種類>-<哪張表>-<動作>)──
 *   T-a-range-click-b      台北倉表選出 2×2 區間 → 點新竹倉表的格 → 台北倉區間 0 格、沒有游標;新竹倉游標在被點的格(儀器)
 *   T-b-range-click-a      反過來:新竹倉選區間 → 點台北倉的格 → 新竹倉清掉
 *   T-inner-range-click-outer  出貨單表第 1 列的格子裡裝著零件表:零件表選區間 → 點出貨單表第 2 列的格 → 零件表清掉
 *   C-a-range-click-blank  [對照] 台北倉選區間 → 點頁面標題空白處 → 清掉(修前就對;證明量具看得到「清掉」)
 *   C-a-shift-extend       [對照] 台北倉選區間 → Shift+點台北倉第 3 列 → 區間延伸成 3×2(按在本表上不是外面;證明量具看得到「區間長大」)
 *
 * ── 突變 → 該紅的列(--selftest;MUTANTS 是單一來源)──
 *   點外清除回到「按在任何一張表的外框裡都不是外面」(修前的寫法)→ T-a-range-click-b / T-b-range-click-a / T-inner-range-click-outer
 *   (反方向的錯 ——「不看按在哪、一律清」—— 不列突變:那樣連本表 Shift+點都會被清,每一列「建區間」那一步就建不起來,
 *    整支閘以 INSTRUMENT-FAIL 紅,不會綠;2026-11-03 實測過一次,訊息「a 表的 2×2 區間沒建起來:{"range":0,"cursor":true}」)
 *
 * 用法:
 *   node scripts/data-table-click-outside-invariant.mjs                判定(現行原始碼)
 *   node scripts/data-table-click-outside-invariant.mjs --selftest     對照組(全部單一根因突變)
 *   node scripts/data-table-click-outside-invariant.mjs --root=<dir>   改量另一棵原始碼(例:修改前的基準樹)
 *   node scripts/data-table-click-outside-invariant.mjs --shot=<dir>   另存每列動作後的畫面(前後圖用;不影響判定)
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip, parkPointer } from './lib/launch-browser.mjs'
import {
  InstrumentError,
  REPO_ROOT,
  WAIT_CAP_MS,
  bundleDsHarness,
  compileDsCss,
  makeDriver,
  mountHarness,
  mutantFor,
  replaceOnce,
  resolveSourceRoot,
} from './lib/ds-source-harness.mjs'

const SELFTEST = process.argv.includes('--selftest')
const SHOT_DIR = process.argv.find((a) => a.startsWith('--shot='))?.slice('--shot='.length)
/** 「應該清掉 / 應該變成」的列最多等多久(成立就提早往下;慢機器上晚到也不會誤紅 —— M32 第四題) */
const GRACE_MS = 3000
const SOURCE_ROOT = resolveSourceRoot()
const CLICK_OUTSIDE_ANCHOR = /if \(!tableRef\.current\?\.contains\(target\)\) \{/

const MUTANTS = [
  {
    id: 'any-table-outer',
    what: '點外清除回到「按在任何一張表的外框裡都不是外面」(2026-05-12 → 2026-11-03 的寫法)',
    file: 'components/DataTable/data-table.tsx',
    expectRed: ['T-a-range-click-b', 'T-b-range-click-a', 'T-inner-range-click-outer'],
    apply: (src) => replaceOnce(src, CLICK_OUTSIDE_ANCHOR, "if (!target.closest('[data-data-table-outer]')) {"),
  },
]

const HARNESS = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { DataTable } from '@/design-system/components/DataTable/data-table'

const STOCK_COLS = [
  { accessorKey: 'sku', header: '料號', meta: { type: 'string', width: 110 } },
  { accessorKey: 'name', header: '品名', meta: { type: 'string', editable: true, width: 160 } },
  { accessorKey: 'qty', header: '庫存', meta: { type: 'number', editable: true, width: 90 } },
]
const TAIPEI = [
  { sku: 'TP-001', name: '無線滑鼠', qty: 42 },
  { sku: 'TP-002', name: '機械鍵盤', qty: 18 },
  { sku: 'TP-003', name: '27 吋螢幕', qty: 7 },
]
const HSINCHU = [
  { sku: 'HC-001', name: '無線滑鼠', qty: 15 },
  { sku: 'HC-002', name: '機械鍵盤', qty: 33 },
  { sku: 'HC-003', name: '27 吋螢幕', qty: 4 },
]
const PARTS = [
  { sku: 'PT-101', name: '電源供應器', qty: 2 },
  { sku: 'PT-102', name: '散熱風扇', qty: 4 },
]

function Sheet({ id, rows, label }) {
  const [data, setData] = React.useState(rows)
  return (
    <section data-sheet={id} aria-label={label}>
      <DataTable columns={STOCK_COLS} data={data} height="auto" inlineEdit spreadsheetMode
        getRowId={(r) => r.sku} tableOptions={{ getRowId: (r) => r.sku }}
        onCellCommit={(rowId, colId, value) => setData((prev) => prev.map((r) => r.sku === rowId ? { ...r, [colId]: value } : r))} />
    </section>
  )
}

const ORDER_COLS = [
  { accessorKey: 'order', header: '出貨單', meta: { type: 'string', width: 110 } },
  { accessorKey: 'customer', header: '客戶', meta: { type: 'string', width: 140 } },
  { id: 'parts', header: '零件', meta: { width: 400 }, cell: ({ row }) => row.index === 0 ? <Sheet id="inner" rows={PARTS} label="零件明細" /> : '—' },
]
const ORDERS = [
  { order: 'SO-1001', customer: '宏達電子' },
  { order: 'SO-1002', customer: '光寶科技' },
]

function App() {
  const [key, setKey] = React.useState(0)
  window.__remount = () => setKey((k) => k + 1)
  return (
    <TooltipProvider>
      <main data-scene={String(key)} key={key} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, width: 760 }}>
        <p data-blank style={{ margin: 0 }}>各倉庫存(本週)</p>
        <Sheet id="a" rows={TAIPEI} label="台北倉" />
        <Sheet id="b" rows={HSINCHU} label="新竹倉" />
        <section data-sheet="outer" aria-label="出貨單">
          <DataTable columns={ORDER_COLS} data={ORDERS} height="auto" autoRowHeight spreadsheetMode
            getRowId={(r) => r.order} tableOptions={{ getRowId: (r) => r.order }} />
        </section>
      </main>
    </TooltipProvider>
  )
}
// 頁面端量具(node 端只經 window.__sheet 讀):這張表自己的外框(不是它裡面裝著的另一張表)、自己的區間格數、有沒有格游標。
// 格游標 = 表格根節點宣告 Esc 層 data-escape-layer="self"(data-table.tsx:「此刻有格游標」= 游標格畫得出來,與焦點在不在表上無關)。
window.__sheet = (id) => {
  const outer = document.querySelector('[data-sheet="' + id + '"] [data-data-table-outer]')
  if (!outer) return null
  const own = (el) => el.closest('[data-data-table-outer]') === outer
  return {
    range: [...outer.querySelectorAll('[data-range-cell]')].filter(own).length,
    cursor: outer.getAttribute('data-escape-layer') === 'self',
  }
}
createRoot(document.getElementById('root')).render(<App />)
`

async function runChecks(page, label) {
  const d = makeDriver(page)
  const checks = []
  const check = (id, kind, title, pass, detail) => checks.push({ id, kind, title, pass: !!pass, detail })
  const sheet = (id) => page.evaluate((x) => window.__sheet(x), id)
  /** 等「這張表的狀態」符合;GRACE_MS 內成立就提早往下,時間到回 false(由呼叫端判紅或判儀器失效) */
  const becomes = (id, want) => page.waitForFunction(([x, w]) => {
    const s = window.__sheet(x)
    return !!s && (w.range == null || s.range === w.range) && (w.cursor == null || s.cursor === w.cursor)
  }, [id, want], { timeout: GRACE_MS }).then(() => true, () => false)
  const fresh = async () => {
    const before = await page.evaluate(() => document.querySelector('main[data-scene]')?.getAttribute('data-scene'))
    await page.evaluate(() => window.__remount())
    await page.waitForFunction((b) => {
      const m = document.querySelector('main[data-scene]')
      return !!m && m.getAttribute('data-scene') !== b && !!document.querySelector('[data-sheet="inner"] [data-cell-id="PT-102:qty"]')
    }, before, { timeout: WAIT_CAP_MS }).catch(() => { throw new InstrumentError('場景重掛後等不到三張表都渲染出來') })
    await parkPointer(page)
    await d.settle()
  }
  /** 真滑鼠按某張表的某一格(交給 Playwright 可操作性檢查:看得見、不動、按下那點確實落在它身上);被蓋住 = 儀器失效 */
  const pressCell = async (id, cellId, { shift = false } = {}) => {
    const selector = `[data-sheet="${id}"] [data-cell-id="${cellId}"]`
    const handle = await page.waitForSelector(selector, { timeout: WAIT_CAP_MS, state: 'visible' }).catch(() => null)
    if (!handle) throw new InstrumentError(`找不到 ${id} 表的格 ${cellId}`)
    const box = await handle.boundingBox()
    if (!box) throw new InstrumentError(`${id} 表的格 ${cellId} 量不到位置`)
    await handle.click({ position: { x: Math.min(box.width / 2, 40), y: Math.min(box.height / 2, 16) }, modifiers: shift ? ['Shift'] : [], timeout: WAIT_CAP_MS })
      .catch((error) => { if (error && error.name === 'TimeoutError') throw new InstrumentError(`${id} 表的格 ${cellId} 點不到(被蓋住?)`); throw error })
    await d.settle()
  }
  /** 在某張表選出 2×2 區間(第 1 列品名 → Shift+第 2 列庫存);沒建起來 = 儀器失效 */
  const makeRange = async (id, rows) => {
    await pressCell(id, `${rows[0]}:name`)
    await pressCell(id, `${rows[1]}:qty`, { shift: true })
    if (!(await becomes(id, { range: 4, cursor: true }))) throw new InstrumentError(`${id} 表的 2×2 區間沒建起來:${JSON.stringify(await sheet(id))}`)
  }
  const shoot = async (name) => {
    if (!SHOT_DIR) return
    mkdirSync(SHOT_DIR, { recursive: true })
    await parkPointer(page)
    await d.settle()
    await page.screenshot({ path: resolve(SHOT_DIR, `${name}.png`), fullPage: true })
  }

  // T-a-range-click-b
  await fresh()
  await makeRange('a', ['TP-001', 'TP-002'])
  await shoot('a-range')
  await pressCell('b', 'HC-001:name')
  if (!(await becomes('b', { cursor: true }))) throw new InstrumentError(`點新竹倉的格之後新竹倉沒有游標:${JSON.stringify(await sheet('b'))}`)
  {
    const ok = await becomes('a', { range: 0, cursor: false })
    const a = await sheet('a')
    check('T-a-range-click-b', 'contract', '台北倉選了 2×2 區間 → 點新竹倉的格 → 台北倉區間 0 格、沒有游標', ok, { a, b: await sheet('b') })
  }
  await shoot('a-range-click-b')

  // T-b-range-click-a
  await fresh()
  await makeRange('b', ['HC-001', 'HC-002'])
  await pressCell('a', 'TP-003:name')
  if (!(await becomes('a', { cursor: true }))) throw new InstrumentError(`點台北倉的格之後台北倉沒有游標:${JSON.stringify(await sheet('a'))}`)
  check('T-b-range-click-a', 'contract', '新竹倉選了 2×2 區間 → 點台北倉的格 → 新竹倉清掉', await becomes('b', { range: 0, cursor: false }), { b: await sheet('b') })

  // T-inner-range-click-outer
  await fresh()
  await makeRange('inner', ['PT-101', 'PT-102'])
  await pressCell('outer', 'SO-1002:customer')
  if (!(await becomes('outer', { cursor: true }))) throw new InstrumentError(`點出貨單第 2 列之後出貨單沒有游標:${JSON.stringify(await sheet('outer'))}`)
  check('T-inner-range-click-outer', 'contract', '零件表(裝在出貨單的格子裡)選了區間 → 點出貨單第 2 列 → 零件表清掉', await becomes('inner', { range: 0, cursor: false }), { inner: await sheet('inner') })
  await shoot('inner-range-click-outer')

  // C-a-shift-extend
  await fresh()
  await makeRange('a', ['TP-001', 'TP-002'])
  await pressCell('a', 'TP-003:qty', { shift: true })
  check('C-a-shift-extend', 'control', '台北倉選了 2×2 區間 → Shift+點台北倉第 3 列 → 區間延伸成 3×2(本表的格不是外面)', await becomes('a', { range: 6, cursor: true }), { a: await sheet('a') })

  // C-a-range-click-blank
  await fresh()
  await makeRange('a', ['TP-001', 'TP-002'])
  {
    const handle = await page.waitForSelector('[data-blank]', { timeout: WAIT_CAP_MS, state: 'visible' }).catch(() => null)
    if (!handle) throw new InstrumentError('找不到頁面標題空白處')
    await handle.click({ position: { x: 8, y: 8 }, timeout: WAIT_CAP_MS })
    await d.settle()
  }
  check('C-a-range-click-blank', 'control', '台北倉選了 2×2 區間 → 點頁面標題空白處 → 清掉', await becomes('a', { range: 0, cursor: false }), { a: await sheet('a') })
  return { label, checks }
}

const STYLE = await compileDsCss({ root: SOURCE_ROOT, extraSources: [HARNESS] })
const VIEWPORT = { width: 1280, height: 960 }

async function runVariant(page, label, mutate) {
  const code = await bundleDsHarness({ root: SOURCE_ROOT, harness: HARNESS, harnessName: 'data-table-click-outside-harness.tsx', mutate })
  mutate?.assertApplied?.()
  const { pageErrors, dispose } = await mountHarness(page, code, 'main[data-scene]')
  try {
    await page.addStyleTag({ content: STYLE })
    const result = await runChecks(page, label)
    if (pageErrors.length) throw new InstrumentError(`頁面例外:${pageErrors.join(' | ')}`)
    return result
  } finally {
    dispose()
  }
}

function report({ label, checks }) {
  console.log(`\n── ${label} ──`)
  for (const c of checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.id.padEnd(28)} ${c.kind === 'control' ? '[對照] ' : ''}${c.title}`)
    if (!c.pass) console.log(`      實得:${JSON.stringify(c.detail)}`)
  }
}
const redIds = (checks) => checks.filter((c) => !c.pass).map((c) => c.id).sort()

let browser
try {
  browser = await launchBrowserOrSkip({}, { hint: '這支閘不需要 storybook 建置,只需要 Chromium' })
  const context = await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const rootLabel = SOURCE_ROOT === REPO_ROOT ? '本 repo' : SOURCE_ROOT
  if (!SELFTEST) {
    const result = await runVariant(page, `原始碼 = ${rootLabel}`, null)
    report(result)
    const red = redIds(result.checks)
    if (red.length) {
      console.log(`\n✗ 試算表點外清除:${red.length} 條不符(${red.join(' / ')})—— SSOT data-table.spec.md「試算表模式」、data-table.tsx 點外清除`)
      process.exitCode = 1
    } else {
      console.log(`\n✓ 試算表點外清除:${result.checks.length} 條全綠(含 ${result.checks.filter((c) => c.kind === 'control').length} 條對照)`)
    }
  } else {
    const baseline = await runVariant(page, '現行原始碼(selftest 基準,必須全綠)', null)
    report(baseline)
    const problems = []
    if (redIds(baseline.checks).length) problems.push(`現行原始碼本身就紅(${redIds(baseline.checks).join(' / ')}),突變的紅燈無法歸因`)
    const contractIds = baseline.checks.filter((c) => c.kind === 'contract').map((c) => c.id)
    const covered = new Set()
    for (const m of MUTANTS) {
      let result
      try {
        result = await runVariant(page, `突變 ${m.id}:${m.what}`, mutantFor(SOURCE_ROOT, m.file, m.apply))
      } catch (error) {
        if (error instanceof InstrumentError) error.message = `突變 ${m.id}:${error.message}`
        throw error
      }
      report(result)
      const red = redIds(result.checks)
      const want = [...m.expectRed].sort()
      const controlRed = result.checks.filter((c) => c.kind === 'control' && !c.pass).map((c) => c.id)
      if (controlRed.length) problems.push(`${m.id}:對照列 ${controlRed.join(' / ')} 紅了 —— 突變弄壞的是量具,不是契約`)
      if (JSON.stringify(red) !== JSON.stringify(want)) problems.push(`${m.id}:紅的是 [${red.join(', ')}],應剛好是 [${want.join(', ')}]`)
      for (const id of red) covered.add(id)
    }
    const uncovered = contractIds.filter((id) => !covered.has(id))
    if (uncovered.length) problems.push(`契約列 ${uncovered.join(' / ')} 沒有任何突變能讓它紅 —— 它的綠燈是零證據`)
    if (problems.length) {
      console.log('\n✗ selftest:量具不可信 ——')
      for (const p of problems) console.log(`  - ${p}`)
      process.exitCode = 1
    } else {
      console.log(`\n✓ selftest:${MUTANTS.length} 個根因突變各自剛好紅了該紅的列(契約 ${contractIds.length} 條全被覆蓋),對照列全程綠 —— 量具會紅`)
    }
  }
} catch (error) {
  if (error instanceof InstrumentError) {
    console.error(`\n✗ ${INSTRUMENT_FAIL_MARKER}:${error.message} —— 不是產品裁決,但這一趟不能算通過`)
    process.exitCode = 1
  } else {
    throw error
  }
} finally {
  await browser?.close()
}
