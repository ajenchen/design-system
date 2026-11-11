#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: DataTable 排序面板(`DataTableSortManager`)與篩選面板(`DataTableFilterPanel`)的「恢復預設」與「清除全部」照
 *        `packages/design-system/src/components/DataTable/data-table.spec.md` L4「Header 恢復預設 / 清除全部」:
 *        (1) 恢復預設 = 標題列右側按鈕位、aria-label「恢復預設」,**目前 ≠ 產品給的預設**(排序 `defaultSorting` / 篩選 `defaultValue`)才出現,
 *            一樣 / 不傳預設都不出現(資料驅動,不看 callback 有無 —— M23(f));按下 → 值 = 預設。
 *        (2) 清除全部 = 「加排序 / 加篩選」那一排、**靠最右**(右緣貼 SurfaceBody 內距右緣 0 ± 0.5、與加條件鈕同一條中線 ± 0.5,量 getBoundingClientRect —— M32);
 *            `clearable` 預設開、有條件才出現、`clearable={false}` 不出現;按下 → 排序 `[]` / 篩選回空樹。
 *        (3) 兩顆按下後(鍵盤:聚焦 → Enter)焦點落在同一面板的「加排序 / 加篩選」(不是 body;加條件鈕在按下那一刻停用也一樣 —— 清掉之後它就能按了),
 *            面板內 polite 區域唸出結果;使用者再改任何一處,那句話清空(下一次才唸得出來)。
 *   紅: 任一列不符 → 逐列點名 exit 1。`--selftest` 在 DS 原始碼上各造回一個根因突變(MUTANTS,含兩個修前寫法:排序面板以 onReset 有無當「重置」渲染閘、
 *        兩個面板都沒有「清除全部」),每個突變必須**剛好**紅它負責的那幾列,而且每一條契約列都被某個突變弄紅過。
 *   綠: 現行原始碼每列都量到且符合;對照列(× 恆在)在現行原始碼與每個突變上都綠。harness 載不起來 / 等不到元素 = 儀器失效(INSTRUMENT-FAIL,exit 1),
 *        不讀成通過(M37:沒量到 ≠ 沒發生)。按鈕該出現卻不在 = 那一列判紅(那是產品裁決,不是量具壞了)。
 *   註: 2026-11-11 新增(user 2026-11-11 PR #172:排序面板加「清除全部」開關、放加排序那一排最右;「重置」與「清除所有」是兩個入口、重置由消費端決定)。
 *
 * 用法:
 *   node scripts/data-table-panel-reset-clear-invariant.mjs              判定(現行原始碼)
 *   node scripts/data-table-panel-reset-clear-invariant.mjs --selftest   對照組(全部單一根因突變;基準 = 一趟完整判定)
 *   node scripts/data-table-panel-reset-clear-invariant.mjs --root=<dir> 改量另一棵原始碼(例:git archive 出來的修改前基準樹)
 */
import { INSTRUMENT_FAIL_MARKER, launchBrowserOrSkip } from './lib/launch-browser.mjs'
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
const SOURCE_ROOT = resolveSourceRoot()
const TOL = 0.5
const SORT = 'components/DataTable/data-table-sort-manager.tsx'
const FILTER = 'components/DataTable/data-table-filter-panel.tsx'
const HOOK = 'components/DataTable/lib/panel-bulk-action.tsx'
const SORT_RESET = /const showReset = defaultSorting !== undefined && !isSortingEqual\(sorting, defaultSorting\)/
const FILTER_RESET = /const showReset = defaultValue !== undefined && !isFilterTreeEqual\(value, defaultValue\)/
const SORT_CLEAR = /const showClearAll = clearable && sorting\.length > 0/
const FILTER_CLEAR = /const showClearAll = clearable && value\.children\.length > 0/
const ADD_ROW = /className="flex items-center justify-between gap-2" data-panel-add-row=""/

const MUTANTS = [
  {
    id: 'sort-pre-fix-reset',
    what: '排序面板修前:「重置」以 onReset 有無 + 有排序當渲染閘(harness 照新 API 不傳 onReset → 永遠不出現)',
    file: SORT,
    expectRed: ['sort-reset-shown', 'sort-reset-click-value', 'sort-reset-click-focus', 'sort-reset-click-announce'],
    apply: (src) => replaceOnce(src, SORT_RESET, "const showReset = Boolean((props as { onReset?: unknown }).onReset) && sorting.length > 0"),
  },
  {
    id: 'sort-reset-when-any',
    what: '排序面板有排序就出「恢復預設」(不比對預設)',
    file: SORT,
    expectRed: ['sort-reset-hidden-equal', 'sort-reset-hidden-nodefault', 'sort-reset-click-focus'],
    apply: (src) => replaceOnce(src, SORT_RESET, 'const showReset = sorting.length > 0'),
  },
  {
    id: 'sort-reset-clears',
    what: '排序面板「恢復預設」接成清空(修前 DS 範例 onReset={() => setSorting([])} 的語意)',
    file: SORT,
    expectRed: ['sort-reset-click-value', 'sort-reset-click-focus'],
    apply: (src) => replaceOnce(src, /bulk\.run\(e, defaultSorting, '已恢復預設排序'\)/, "bulk.run(e, [], '已恢復預設排序')"),
  },
  {
    id: 'filter-reset-hidden',
    what: '篩選面板「恢復預設」永遠不出現',
    file: FILTER,
    expectRed: ['filter-reset-shown', 'filter-reset-click-value', 'filter-reset-click-focus', 'filter-reset-click-announce'],
    apply: (src) => replaceOnce(src, FILTER_RESET, 'const showReset = false'),
  },
  {
    id: 'filter-reset-when-any',
    what: '篩選面板有條件就出「恢復預設」(不比對預設)',
    file: FILTER,
    expectRed: ['filter-reset-hidden-equal', 'filter-reset-hidden-nodefault', 'filter-reset-click-focus'],
    apply: (src) => replaceOnce(src, FILTER_RESET, 'const showReset = value.children.length > 0'),
  },
  {
    id: 'sort-pre-fix-no-clear',
    what: '排序面板修前:沒有「清除全部」',
    file: SORT,
    expectRed: ['sort-clear-shown', 'sort-clear-right', 'sort-clear-click-value', 'sort-clear-click-focus', 'sort-clear-click-announce', 'sort-clear-edit-silences', 'sort-clear-cap-focus'],
    apply: (src) => replaceOnce(src, SORT_CLEAR, 'const showClearAll = false'),
  },
  {
    id: 'filter-pre-fix-no-clear',
    what: '篩選面板修前:沒有「清除全部」',
    file: FILTER,
    expectRed: ['filter-clear-shown', 'filter-clear-right', 'filter-clear-click-value', 'filter-clear-click-focus', 'filter-clear-click-announce', 'filter-clear-edit-silences'],
    apply: (src) => replaceOnce(src, FILTER_CLEAR, 'const showClearAll = false'),
  },
  {
    id: 'sort-clear-always',
    what: '排序面板沒有排序時「清除全部」照樣出現',
    file: SORT,
    expectRed: ['sort-clear-hidden-empty', 'sort-clear-click-focus', 'sort-clear-cap-focus'],
    apply: (src) => replaceOnce(src, SORT_CLEAR, 'const showClearAll = clearable'),
  },
  {
    id: 'filter-clear-always',
    what: '篩選面板沒有條件時「清除全部」照樣出現',
    file: FILTER,
    expectRed: ['filter-clear-hidden-empty', 'filter-clear-click-focus'],
    apply: (src) => replaceOnce(src, FILTER_CLEAR, 'const showClearAll = clearable'),
  },
  {
    id: 'sort-clear-ignores-toggle',
    what: '排序面板不理 clearable',
    file: SORT,
    expectRed: ['sort-clear-hidden-off'],
    apply: (src) => replaceOnce(src, SORT_CLEAR, 'const showClearAll = sorting.length > 0'),
  },
  {
    id: 'filter-clear-ignores-toggle',
    what: '篩選面板不理 clearable',
    file: FILTER,
    expectRed: ['filter-clear-hidden-off'],
    apply: (src) => replaceOnce(src, FILTER_CLEAR, 'const showClearAll = value.children.length > 0'),
  },
  {
    id: 'sort-add-row-left',
    what: '排序面板加排序那一排不推兩端(清除全部貼在加排序右邊)',
    file: SORT,
    expectRed: ['sort-clear-right'],
    apply: (src) => replaceOnce(src, ADD_ROW, 'className="flex items-center gap-2" data-panel-add-row=""'),
  },
  {
    id: 'filter-add-row-left',
    what: '篩選面板加篩選那一排不推兩端',
    file: FILTER,
    expectRed: ['filter-clear-right'],
    apply: (src) => replaceOnce(src, ADD_ROW, 'className="flex items-center gap-2" data-panel-add-row=""'),
  },
  {
    id: 'hook-no-focus',
    what: '整批動作後不交焦點(修前:按鈕卸載、焦點掉到 body)',
    file: HOOK,
    expectRed: ['sort-reset-click-focus', 'sort-clear-click-focus', 'sort-clear-cap-focus', 'filter-reset-click-focus', 'filter-clear-click-focus'],
    apply: (src) => replaceOnce(src, /el\.focus\(\{ preventScroll: true \}\)/, 'void el'),
  },
  {
    id: 'hook-no-announce',
    what: '整批動作後不播報',
    file: HOOK,
    expectRed: ['sort-reset-click-announce', 'sort-clear-click-announce', 'filter-reset-click-announce', 'filter-clear-click-announce'],
    apply: (src) => replaceOnce(src, /const message = notice && isEqual\(value, notice\.after\) \? notice\.text : ''/, "const message = notice ? '' : ''"),
  },
  {
    id: 'hook-sticky-message',
    what: '播報句在使用者再改之後不清空(下一次同一句不會再唸)',
    file: HOOK,
    expectRed: ['sort-clear-edit-silences', 'filter-clear-edit-silences'],
    apply: (src) => replaceOnce(src, /const message = notice && isEqual\(value, notice\.after\) \? notice\.text : ''/, "const message = notice ? notice.text : ''"),
  },
]

const HARNESS = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { Popover, PopoverTrigger, PopoverContent } from '@/design-system/components/Popover/popover'
import { Button } from '@/design-system/components/Button/button'
import { DataTableSortManager } from '@/design-system/components/DataTable/data-table-sort-manager'
import { DataTableFilterPanel } from '@/design-system/components/DataTable/data-table-filter-panel'

const SORT_COLS = [
  { accessorKey: 'priority', header: '優先級' },
  { accessorKey: 'dueDate', header: '到期日' },
  { accessorKey: 'updatedAt', header: '更新時間' },
]
const SAVED_SORT = [{ id: 'priority', desc: true }, { id: 'dueDate', desc: false }]
const FILTER_COLS = [
  { accessorKey: 'name', header: '名稱', meta: { type: 'string', filterable: true } },
  { accessorKey: 'category', header: '類別', meta: { type: 'select', filterable: true, options: [{ value: 'Electronics', label: 'Electronics' }, { value: 'Furniture', label: 'Furniture' }] } },
]
const SAVED_FILTER = { mode: 'flat', conjunction: 'and', children: [{ kind: 'cond', id: 'c1', field: 'category', op: 'is', value: ['Electronics'] }] }
const MODIFIED_FILTER = { mode: 'flat', conjunction: 'and', children: [{ kind: 'cond', id: 'c1', field: 'category', op: 'is', value: ['Furniture'] }] }
const EMPTY_FILTER = { mode: 'flat', conjunction: 'and', children: [] }

const SCENES = {
  'sort-modified':  { panel: 'sort', value: [{ id: 'updatedAt', desc: true }], def: SAVED_SORT },
  'sort-equal':     { panel: 'sort', value: SAVED_SORT, def: SAVED_SORT },
  'sort-nodefault': { panel: 'sort', value: [{ id: 'dueDate', desc: false }] },
  'sort-empty':     { panel: 'sort', value: [], def: SAVED_SORT },
  'sort-off':       { panel: 'sort', value: [{ id: 'dueDate', desc: false }], clearable: false },
  'sort-cap':       { panel: 'sort', value: [{ id: 'priority', desc: true }, { id: 'dueDate', desc: false }, { id: 'updatedAt', desc: true }] },
  'filter-modified':  { panel: 'filter', value: MODIFIED_FILTER, def: SAVED_FILTER },
  'filter-equal':     { panel: 'filter', value: SAVED_FILTER, def: SAVED_FILTER },
  'filter-nodefault': { panel: 'filter', value: MODIFIED_FILTER },
  // 空樹 + maxConditions=0:初次掛載不自動加空列 = 真的沒有東西可清
  'filter-empty':     { panel: 'filter', value: EMPTY_FILTER, def: SAVED_FILTER, maxConditions: 0 },
  'filter-off':       { panel: 'filter', value: MODIFIED_FILTER, clearable: false },
}

function Panel({ scene }) {
  const s = SCENES[scene]
  const [value, setValue] = React.useState(s.value)
  window.__value = () => JSON.stringify(value)
  const extra = s.clearable === false ? { clearable: false } : {}
  if (s.panel === 'sort') return <DataTableSortManager columns={SORT_COLS} sorting={value} onSortingChange={setValue} defaultSorting={s.def} {...extra} />
  return <DataTableFilterPanel columns={FILTER_COLS} value={value} onChange={setValue} defaultValue={s.def} maxConditions={s.maxConditions} {...extra} />
}

function App() {
  const [scene, setScene] = React.useState({ name: 'sort-modified', key: 0 })
  window.__setScene = (name) => setScene((s) => ({ name, key: s.key + 1 }))
  return (
    <TooltipProvider>
      <main data-scene={scene.name + ':' + scene.key} style={{ padding: 24 }}>
        <Popover key={scene.key} defaultOpen>
          <PopoverTrigger asChild><Button variant="secondary">開啟面板</Button></PopoverTrigger>
          <PopoverContent id="scene-host" align="start" className="w-auto p-0"><Panel scene={scene.name} /></PopoverContent>
        </Popover>
      </main>
    </TooltipProvider>
  )
}
window.__probe = () => {
  const host = document.getElementById('scene-host')
  if (!host) return null
  const visible = (el) => !!el && el.getBoundingClientRect().width > 0
  const header = host.querySelector('[data-slot="surface-header"]')
  const row = host.querySelector('[data-panel-add-row]')
  const body = row ? row.closest('[data-slot="surface-body"]') ?? row.parentElement : null
  const reset = header ? [...header.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '恢復預設' && visible(b)) : null
  const add = row ? row.querySelector('button') : null
  const clear = row ? [...row.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '清除全部' && visible(b)) : null
  const dismiss = header ? header.querySelector('button[data-dismiss]') : null
  const live = host.querySelector('[data-panel-live-region]')
  const r = (n) => Math.round(n * 100) / 100
  let right = null
  let centerY = null
  if (clear && body) {
    const cs = getComputedStyle(body)
    const contentRight = body.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth)
    right = r(contentRight - clear.getBoundingClientRect().right)
    const mid = (el) => { const b = el.getBoundingClientRect(); return b.top + b.height / 2 }
    centerY = add ? r(mid(clear) - mid(add)) : null
  }
  const active = document.activeElement
  return {
    ready: Boolean(header && row && add),
    reset: Boolean(reset), clear: Boolean(clear), dismiss: visible(dismiss),
    right, centerY,
    live: live ? (live.textContent || '') : null,
    liveRole: live ? live.getAttribute('role') + '/' + live.getAttribute('aria-live') : null,
    focus: active === document.body || !active ? 'body' : active === add ? 'add' : active === dismiss ? 'dismiss' : active === clear ? 'clear' : active === reset ? 'reset' : (active.getAttribute('aria-label') || active.textContent || active.tagName).trim().slice(0, 20),
    value: window.__value ? window.__value() : null,
  }
}
/** 把要按的那一顆標上 data-press-target(node 端再聚焦 + Enter);不在 = false */
window.__mark = (kind) => {
  const host = document.getElementById('scene-host')
  if (!host) return false
  const el = kind === 'reset'
    ? [...host.querySelectorAll('[data-slot="surface-header"] button')].find((b) => b.getAttribute('aria-label') === '恢復預設')
    : kind === 'clear'
      ? [...host.querySelectorAll('[data-panel-add-row] button')].find((b) => (b.textContent || '').trim() === '清除全部')
      : host.querySelector('[data-panel-add-row] button')
  if (!el) return false
  el.setAttribute('data-press-target', '')
  return true
}
createRoot(document.getElementById('root')).render(<App />)
`

const DEFAULTS = {
  sort: { saved: JSON.stringify([{ id: 'priority', desc: true }, { id: 'dueDate', desc: false }]), empty: '[]', reset: '已恢復預設排序', clear: '已清除全部排序' },
  filter: {
    saved: JSON.stringify({ mode: 'flat', conjunction: 'and', children: [{ kind: 'cond', id: 'c1', field: 'category', op: 'is', value: ['Electronics'] }] }),
    empty: JSON.stringify({ mode: 'flat', conjunction: 'and', children: [] }),
    reset: '已恢復預設篩選條件', clear: '已清除全部篩選條件',
  },
}

async function runChecks(page) {
  const d = makeDriver(page)
  const checks = []
  const check = (id, kind, title, pass, detail) => checks.push({ id, kind, title, pass: !!pass, detail })
  const probe = () => page.evaluate(() => window.__probe())
  const scene = async (name) => {
    await page.evaluate((n) => window.__setScene(n), name)
    await page.waitForFunction((n) => {
      if (!document.querySelector(`main[data-scene^="${n}:"]`)) return false
      const p = window.__probe()
      return !!p && p.ready
    }, name, { timeout: WAIT_CAP_MS }).catch(() => { throw new InstrumentError(`${WAIT_CAP_MS}ms 內等不到場景 ${name} 的面板(標題列 + 加條件那一排)`) })
    await d.settle()
    return probe()
  }
  /** 鍵盤按一顆按鈕(聚焦 → Enter);按鈕不在 = 回 false(由呼叫端判紅,不是儀器失效) */
  const pressKey = async (kind) => {
    const ok = await page.evaluate((k) => window.__mark(k), kind)
    if (!ok) return false
    await d.focus('[data-press-target]')
    await page.evaluate(() => document.querySelector('[data-press-target]')?.removeAttribute('data-press-target'))
    await d.press('Enter')
    return true
  }
  const resetBtn = 'reset'
  const clearBtn = 'clear'
  const addBtn = 'add'

  for (const panel of ['sort', 'filter']) {
    const D = DEFAULTS[panel]
    const name = panel === 'sort' ? '排序' : '篩選'
    // ── 出現 / 不出現 ──
    const modified = await scene(`${panel}-modified`)
    check(`${panel}-reset-shown`, 'contract', `${name}面板:目前 ≠ 產品預設 → 標題列出現「恢復預設」`, modified.reset, modified)
    check(`${panel}-dismiss`, 'control', `${name}面板:× 恆在`, modified.dismiss, modified)
    check(`${panel}-clear-shown`, 'contract', `${name}面板:有條件、clearable 預設 → 加條件那一排出現「清除全部」`, modified.clear, modified)
    check(`${panel}-clear-right`, 'contract', `${name}面板:「清除全部」靠最右(右緣 → 內距右緣 0 ± ${TOL})、與加條件鈕同一條中線(± ${TOL})`,
      modified.clear && Math.abs(modified.right) <= TOL && Math.abs(modified.centerY) <= TOL, { right: modified.right, centerY: modified.centerY })
    check(`${panel}-live-region`, 'control', `${name}面板:polite 區域恆在`, modified.liveRole === 'status/polite', { liveRole: modified.liveRole })
    const equal = await scene(`${panel}-equal`)
    check(`${panel}-reset-hidden-equal`, 'contract', `${name}面板:目前 = 產品預設 → 不出現「恢復預設」`, !equal.reset, equal)
    const nodefault = await scene(`${panel}-nodefault`)
    check(`${panel}-reset-hidden-nodefault`, 'contract', `${name}面板:沒有預設(不傳)→ 不出現「恢復預設」`, !nodefault.reset, nodefault)
    const empty = await scene(`${panel}-empty`)
    check(`${panel}-clear-hidden-empty`, 'contract', `${name}面板:沒有條件 → 不出現「清除全部」`, !empty.clear, empty)
    const off = await scene(`${panel}-off`)
    check(`${panel}-clear-hidden-off`, 'contract', `${name}面板:clearable={false} → 不出現「清除全部」`, !off.clear, off)

    // ── 按「恢復預設」(鍵盤)──
    await scene(`${panel}-modified`)
    const pressedReset = await pressKey(resetBtn)
    const afterReset = await probe()
    check(`${panel}-reset-click-value`, 'contract', `${name}面板:按「恢復預設」→ 值 = 產品預設`, pressedReset && afterReset.value === D.saved, { pressed: pressedReset, value: afterReset.value })
    check(`${panel}-reset-click-focus`, 'contract', `${name}面板:按「恢復預設」(焦點在它上面)→ 焦點落在加條件鈕(不是 body)`, pressedReset && afterReset.focus === 'add', { pressed: pressedReset, focus: afterReset.focus })
    check(`${panel}-reset-click-announce`, 'contract', `${name}面板:按「恢復預設」→ polite 區域唸「${D.reset}」`, pressedReset && afterReset.live === D.reset, { pressed: pressedReset, live: afterReset.live })

    // ── 按「清除全部」(鍵盤)→ 再加一條 ──
    await scene(`${panel}-modified`)
    const pressedClear = await pressKey(clearBtn)
    const afterClear = await probe()
    check(`${panel}-clear-click-value`, 'contract', `${name}面板:按「清除全部」→ 值 = 空`, pressedClear && afterClear.value === D.empty, { pressed: pressedClear, value: afterClear.value })
    check(`${panel}-clear-click-focus`, 'contract', `${name}面板:按「清除全部」(焦點在它上面)→ 焦點落在加條件鈕(不是 body)`, pressedClear && afterClear.focus === 'add', { pressed: pressedClear, focus: afterClear.focus })
    check(`${panel}-clear-click-announce`, 'contract', `${name}面板:按「清除全部」→ polite 區域唸「${D.clear}」`, pressedClear && afterClear.live === D.clear, { pressed: pressedClear, live: afterClear.live })
    let afterEdit = null
    if (pressedClear) {
      await pressKey(addBtn)
      afterEdit = await probe()
    }
    check(`${panel}-clear-edit-silences`, 'contract', `${name}面板:清除之後再加一條 → 那句播報清空(下一次才唸得出來)`,
      pressedClear && afterEdit && afterEdit.value !== D.empty && afterEdit.live === '', { pressed: pressedClear, after: afterEdit && { value: afterEdit.value, live: afterEdit.live } })
  }

  // ── 加排序在按下那一刻停用(所有欄都排了)→ 清掉之後它能按了,焦點給它 ──
  const cap = await scene('sort-cap')
  const pressedCap = cap.clear ? await pressKey(clearBtn) : false
  const afterCap = await probe()
  check('sort-clear-cap-focus', 'contract', '排序面板所有欄都排了(加排序停用)→ 按「清除全部」→ 焦點落在加排序(清掉之後可按)',
    pressedCap && afterCap.focus === 'add', { pressed: pressedCap, focus: afterCap.focus })
  return checks
}

const STYLE = await compileDsCss({ root: SOURCE_ROOT, extraSources: [HARNESS] })
const VIEWPORT = { width: 1280, height: 900 }

async function runVariant(page, label, mutate) {
  const code = await bundleDsHarness({ root: SOURCE_ROOT, harness: HARNESS, harnessName: 'data-table-panel-reset-clear-harness.tsx', mutate })
  mutate?.assertApplied?.()
  const { pageErrors, dispose } = await mountHarness(page, code, 'main[data-scene]')
  try {
    await page.addStyleTag({ content: STYLE })
    const checks = await runChecks(page)
    if (pageErrors.length) throw new InstrumentError(`頁面例外:${pageErrors.join(' | ')}`)
    return { label, checks }
  } finally {
    dispose()
  }
}

function report({ label, checks }) {
  console.log(`\n── ${label} ──`)
  for (const c of checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.id.padEnd(30)} ${c.kind === 'control' ? '[對照] ' : ''}${c.title}`)
    if (!c.pass) console.log(`      實得:${JSON.stringify(c.detail)}`)
  }
}
const redIds = (checks) => checks.filter((c) => !c.pass).map((c) => c.id).sort()

let browser
try {
  browser = await launchBrowserOrSkip({}, { hint: '這支閘不需要 storybook 建置,只需要 Chromium' })
  const page = await (await browser.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' })).newPage()
  const rootLabel = SOURCE_ROOT === REPO_ROOT ? '本 repo' : SOURCE_ROOT
  if (!SELFTEST) {
    const result = await runVariant(page, `原始碼 = ${rootLabel}`, null)
    report(result)
    const red = redIds(result.checks)
    if (red.length) {
      console.log(`\n✗ 面板「恢復預設 / 清除全部」:${red.length} 條不符(${red.join(' / ')})—— SSOT data-table.spec.md L4「Header 恢復預設 / 清除全部」`)
      process.exitCode = 1
    } else {
      console.log(`\n✓ 面板「恢復預設 / 清除全部」:${result.checks.length} 條全綠(含 ${result.checks.filter((c) => c.kind === 'control').length} 條對照)`)
    }
  } else {
    const baseline = await runVariant(page, '現行原始碼(selftest 基準 = 一趟完整判定,必須全綠)', null)
    report(baseline)
    const problems = []
    if (redIds(baseline.checks).length) problems.push(`現行原始碼本身就紅(${redIds(baseline.checks).join(' / ')}),突變的紅燈無法歸因`)
    const contractIds = baseline.checks.filter((c) => c.kind === 'contract').map((c) => c.id)
    const covered = new Set()
    for (const m of MUTANTS) {
      const result = await runVariant(page, `突變 ${m.id}:${m.what}`, mutantFor(SOURCE_ROOT, m.file, m.apply))
      report(result)
      const red = redIds(result.checks)
      const want = [...m.expectRed].sort()
      const controlRed = result.checks.filter((c) => c.kind === 'control' && !c.pass).map((c) => c.id)
      if (controlRed.length) problems.push(`${m.id}:對照列 ${controlRed.join(' / ')} 紅了 —— 突變弄壞的是量具,不是契約`)
      if (JSON.stringify(red) !== JSON.stringify(want)) problems.push(`${m.id}:紅的是 [${red.join(', ')}],應剛好是 [${want.join(', ')}]`)
      for (const id of red) covered.add(id)
    }
    const claimed = new Set(MUTANTS.flatMap((m) => m.expectRed))
    const phantom = [...claimed].filter((id) => !contractIds.includes(id))
    if (phantom.length) problems.push(`突變的 expectRed 寫了不是契約列的 ${phantom.join(' / ')}`)
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
