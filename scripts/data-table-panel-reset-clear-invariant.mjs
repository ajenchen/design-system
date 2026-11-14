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
 *        (4) 欄位顯示面板(`DataTableColumnVisibilityPanel`,2026-11-15 併入同一條)的「恢復預設」:目前 ≠ `defaultVisibility` 才出現
 *            (比對看面板列出的每一欄顯示 / 隱藏,沒寫 = 顯示 —— 只差在預設沒寫到的欄也算不同)、一樣 / 不傳都不出現;按下 → 值 = 預設(不是全部顯示);它沒有加條件鈕 → 焦點落在標題列 ×;
 *            播報「已恢復預設欄位顯示」,再切任何一欄就清空。
 *        (5) 排序面板 `labels`(2026-11-15 A11 開放;data-table.spec.md「Multi-sort header」列的字串那一句):傳一整份自訂字,每個字畫在
 *            **對的元素 / 屬性**上 —— 標題、RotateCcw 鈕與 × 的讀屏名稱、加排序 / 清除全部的字、每一列拖曳把手 / 欄位下拉 / 方向下拉 / Trash 鈕的
 *            讀屏名稱、方向下拉顯示的升冪 / 降冪、兩句播報;不傳 = 每個位置是出口的預設值。位置按結構找(圖示、順序、data-*),不靠字。
 *            放在這支而不是 data-table-multi-sort(那支量 storybook 建置的 story,要傳自訂字得新增 story = 動 a11y 語料)或
 *            test-data-table-sort-cycle(純 node、沒有瀏覽器,只能查鍵有出現 —— 審查 A 第 2 輪把欄位 / 方向兩個讀屏名稱對調,它照樣全綠):
 *            這支已經直接打包 DataTableSortManager 原始碼,而且 selftest 要求每一條契約列都被某個突變弄紅過。
 *   紅: 任一列不符 → 逐列點名 exit 1。`--selftest` 在 DS 原始碼上各造回一個根因突變(MUTANTS,含修前寫法:排序面板以 onReset 有無當「重置」渲染閘、
 *        兩個面板都沒有「清除全部」、欄位顯示面板以 resettable 開關 + 有隱藏欄當渲染閘、按下 = 全部顯示),每個突變必須**剛好**紅它負責的那幾列,
 *        而且每一條契約列都被某個突變弄紅過。
 *   綠: 現行原始碼每列都量到且符合;對照列(× 恆在、polite 區域恆在)在現行原始碼與每個突變上都綠。harness 打包 / 載不起來、selftest 的
 *        突變錨點對不到(共用 lib/ds-source-harness.mjs 的 bundleDsHarness 把它原樣丟回成 InstrumentError —— 2026-11-15 前會變成未捕捉的
 *        esbuild 錯誤、exit 1、沒有標記;selftest 開頭有一格對照)、等不到元素 = 儀器失效(INSTRUMENT-FAIL,exit 2),不讀成通過(M37:沒量到 ≠ 沒發生)。
 *        按鈕該出現卻不在 = 那一列判紅(那是產品裁決,不是量具壞了)。
 *   註: 2026-11-11 新增(user 2026-11-11 PR #172:排序面板加「清除全部」開關、放加排序那一排最右;「重置」與「清除所有」是兩個入口、重置由消費端決定)。
 *       2026-11-15 加欄位顯示面板(第四批成品頁「下一批直接做」;照同一條規則落地,【AI 推導】)。
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
const VIS = 'components/DataTable/data-table-column-visibility-panel.tsx'
const VIS_RESET = /const showReset = defaultVisibility !== undefined && !isVisibilityEqual\(columnIds, visibility, defaultVisibility\)/
const VIS_RUN = /bulk\.run\(e, defaultVisibility, '已恢復預設欄位顯示'\)/
const VIS_FOCUS = /focusTargets: \(\) => \[headerRef\.current\?\.querySelector<HTMLElement>\('button\[data-dismiss\]'\)\]/
const VIS_EQUAL = /return ids\.every\(\(id\) => \(a\[id\] !== false\) === \(b\[id\] !== false\)\)/
const SORT_RESET = /const showReset = defaultSorting !== undefined && !isSortingEqual\(sorting, defaultSorting\)/
const FILTER_RESET = /const showReset = defaultValue !== undefined && !isFilterTreeEqual\(value, defaultValue\)/
const SORT_CLEAR = /const showClearAll = clearable && sorting\.length > 0/
const FILTER_CLEAR = /const showClearAll = clearable && value\.children\.length > 0/
const ADD_ROW = /className="flex items-center justify-between gap-2" data-panel-add-row=""/
const SORT_FIELD_ARIA = /aria-label=\{labels\.fieldAriaLabel\}/
const SORT_DIRECTION_ARIA = /aria-label=\{labels\.directionAriaLabel\}/
const SORT_LABELS_RESOLVE = /const labels = React\.useMemo\(\(\) => resolveDataTableSortManagerLabels\(labelsOverride\), \[labelsOverride\]\)/
/**
 * 排序面板 `labels`(2026-11-15 A11 開放;審查 A 第 2 輪:test-data-table-sort-cycle 只查 13 個鍵有出現,不查字畫在哪):
 * 一整份與預設不同、彼此也不同的字,每個字只會出現在一個位置 —— 位置錯一個,那一格量到的就是別的鍵的字。
 */
const SORT_LABELS_EN = {
  title: 'Sort', resetToDefault: 'Reset to default', resetToDefaultDone: 'Sorting reset to default', clearAll: 'Clear all', clearAllDone: 'All sorting cleared',
  close: 'Close', addSort: 'Add sort', fieldAriaLabel: 'Sort field', directionAriaLabel: 'Sort direction', ascending: 'Ascending', descending: 'Descending',
  deleteCondition: 'Delete', dragToReorder: 'Drag to reorder',
}
/** labels 場景每一條契約列(突變 sort-labels-ignored 必須剛好紅這些) */
const SORT_LABEL_ROWS = ['sort-labels-title', 'sort-labels-reset', 'sort-labels-close', 'sort-labels-add', 'sort-labels-clear', 'sort-labels-drag', 'sort-labels-field', 'sort-labels-direction', 'sort-labels-direction-text', 'sort-labels-delete', 'sort-labels-reset-announce', 'sort-labels-clear-announce']

const MUTANTS = [
  {
    id: 'sort-pre-fix-reset',
    what: '排序面板修前:「重置」以 onReset 有無 + 有排序當渲染閘(harness 照新 API 不傳 onReset → 永遠不出現)',
    file: SORT,
    // labels 場景:「恢復預設」不在 → 它的字與播報量不到(按鈕該在卻不在 = 產品紅),不傳 labels 那一格也少了它
    expectRed: ['sort-reset-shown', 'sort-reset-click-value', 'sort-reset-click-focus', 'sort-reset-click-announce', 'sort-labels-reset', 'sort-labels-reset-announce', 'sort-labels-defaults'],
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
    // 播報句 2026-11-15 起由 labels 給(A11:sort-cycle labels);錨點跟著原始碼走,不再找寫死的中文
    apply: (src) => replaceOnce(src, /bulk\.run\(e, defaultSorting, labels\.resetToDefaultDone\)/, 'bulk.run(e, [], labels.resetToDefaultDone)'),
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
    expectRed: ['sort-clear-shown', 'sort-clear-right', 'sort-clear-click-value', 'sort-clear-click-focus', 'sort-clear-click-announce', 'sort-clear-edit-silences', 'sort-clear-cap-focus', 'sort-labels-clear', 'sort-labels-clear-announce', 'sort-labels-defaults'],
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
    id: 'vis-pre-fix-reset',
    what: '欄位顯示面板修前:「恢復預設」要另外開 resettable 才有、有隱藏欄才出現(harness 照新 API 不傳 resettable → 永遠不出現)',
    file: VIS,
    expectRed: ['vis-reset-shown', 'vis-reset-shown-unlisted', 'vis-reset-click-value', 'vis-reset-click-focus', 'vis-reset-click-announce', 'vis-reset-edit-silences'],
    apply: (src) => replaceOnce(src, VIS_RESET, 'const showReset = Boolean((props as { resettable?: unknown }).resettable) && columnIds.some((id) => visibility[id] === false)'),
  },
  {
    id: 'vis-reset-default-keys-only',
    what: '欄位顯示面板「恢復預設」的出現條件只比預設寫到的那幾欄(預設沒寫的欄被收起也不出現;共用 hook 的比對不動)',
    file: VIS,
    expectRed: ['vis-reset-shown-unlisted'],
    apply: (src) => replaceOnce(src, VIS_RESET, 'const showReset = defaultVisibility !== undefined && !isVisibilityEqual(Object.keys(defaultVisibility), visibility, defaultVisibility)'),
  },
  {
    id: 'vis-reset-when-hidden',
    what: '欄位顯示面板有隱藏欄就出「恢復預設」(修前的出現條件,不比對預設)',
    file: VIS,
    expectRed: ['vis-reset-hidden-equal', 'vis-reset-hidden-nodefault', 'vis-reset-click-focus'],
    apply: (src) => replaceOnce(src, VIS_RESET, 'const showReset = columnIds.some((id) => visibility[id] === false)'),
  },
  {
    id: 'vis-reset-shows-all',
    what: '欄位顯示面板「恢復預設」按下 = 全部顯示(修前的動作 onVisibilityChange({}))',
    file: VIS,
    expectRed: ['vis-reset-click-value', 'vis-reset-click-focus'],
    apply: (src) => replaceOnce(src, VIS_RUN, "bulk.run(e, {}, '已恢復預設欄位顯示')"),
  },
  {
    id: 'vis-strict-equal',
    what: '欄位顯示面板比對預設時逐字比(沒把「沒寫 = 顯示」當成一樣)',
    file: VIS,
    expectRed: ['vis-reset-hidden-equal'],
    apply: (src) => replaceOnce(src, VIS_EQUAL, 'return JSON.stringify(a) === JSON.stringify(b)'),
  },
  {
    id: 'vis-no-focus-target',
    what: '欄位顯示面板沒告訴共用 hook 焦點給誰(按下後焦點掉到 body)',
    file: VIS,
    expectRed: ['vis-reset-click-focus'],
    apply: (src) => replaceOnce(src, VIS_FOCUS, 'focusTargets: () => []'),
  },
  {
    id: 'hook-no-focus',
    what: '整批動作後不交焦點(修前:按鈕卸載、焦點掉到 body)',
    file: HOOK,
    expectRed: ['sort-reset-click-focus', 'sort-clear-click-focus', 'sort-clear-cap-focus', 'filter-reset-click-focus', 'filter-clear-click-focus', 'vis-reset-click-focus'],
    apply: (src) => replaceOnce(src, /el\.focus\(\{ preventScroll: true \}\)/, 'void el'),
  },
  {
    id: 'hook-no-announce',
    what: '整批動作後不播報',
    file: HOOK,
    expectRed: ['sort-reset-click-announce', 'sort-clear-click-announce', 'filter-reset-click-announce', 'filter-clear-click-announce', 'vis-reset-click-announce', 'sort-labels-reset-announce', 'sort-labels-clear-announce'],
    apply: (src) => replaceOnce(src, /const message = notice && isEqual\(value, notice\.after\) \? notice\.text : ''/, "const message = notice ? '' : ''"),
  },
  {
    id: 'sort-labels-swap-aria',
    what: '排序面板每一列的欄位下拉與方向下拉讀屏名稱對調(審查 A 第 2 輪的破法:鍵都有讀到、字放錯位置)',
    file: SORT,
    expectRed: ['sort-labels-field', 'sort-labels-direction', 'sort-labels-defaults'],
    apply: (src) => replaceOnce(replaceOnce(replaceOnce(src, SORT_FIELD_ARIA, 'aria-label={__SWAP_FIELD__}'), SORT_DIRECTION_ARIA, 'aria-label={labels.fieldAriaLabel}'), /__SWAP_FIELD__/, 'labels.directionAriaLabel'),
  },
  {
    id: 'sort-labels-ignored',
    what: '排序面板不理 labels(一律用預設字)',
    file: SORT,
    expectRed: SORT_LABEL_ROWS,
    apply: (src) => replaceOnce(src, SORT_LABELS_RESOLVE, 'const labels = React.useMemo(() => resolveDataTableSortManagerLabels(undefined), [labelsOverride])'),
  },
  {
    id: 'hook-sticky-message',
    what: '播報句在使用者再改之後不清空(下一次同一句不會再唸)',
    file: HOOK,
    expectRed: ['sort-clear-edit-silences', 'filter-clear-edit-silences', 'vis-reset-edit-silences'],
    apply: (src) => replaceOnce(src, /const message = notice && isEqual\(value, notice\.after\) \? notice\.text : ''/, "const message = notice ? notice.text : ''"),
  },
]

const HARNESS = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { Popover, PopoverTrigger, PopoverContent } from '@/design-system/components/Popover/popover'
import { Button } from '@/design-system/components/Button/button'
import { DataTableSortManager, DATA_TABLE_SORT_MANAGER_DEFAULT_LABELS } from '@/design-system/components/DataTable/data-table-sort-manager'
import { DataTableFilterPanel } from '@/design-system/components/DataTable/data-table-filter-panel'
import { DataTableColumnVisibilityPanel } from '@/design-system/components/DataTable/data-table-column-visibility-panel'

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
const VIS_COLS = [
  { id: 'key', label: '鍵值' },
  { id: 'summary', label: '摘要' },
  { id: 'status', label: '狀態' },
  { id: 'dueDate', label: '到期日' },
  { id: 'updatedAt', label: '更新時間' },
]
// 產品預設:「更新時間」不顯示(沒寫 = 顯示)
const SAVED_VIS = { updatedAt: false }

const SCENES = {
  'sort-modified':  { panel: 'sort', value: [{ id: 'updatedAt', desc: true }], def: SAVED_SORT },
  'sort-equal':     { panel: 'sort', value: SAVED_SORT, def: SAVED_SORT },
  'sort-nodefault': { panel: 'sort', value: [{ id: 'dueDate', desc: false }] },
  'sort-empty':     { panel: 'sort', value: [], def: SAVED_SORT },
  'sort-off':       { panel: 'sort', value: [{ id: 'dueDate', desc: false }], clearable: false },
  'sort-cap':       { panel: 'sort', value: [{ id: 'priority', desc: true }, { id: 'dueDate', desc: false }, { id: 'updatedAt', desc: true }] },
  // 排序面板 labels:兩列(升冪一列、降冪一列)、與預設不同(「恢復預設」與「清除全部」都在)→ 每個位置都有字可量
  'sort-labels':         { panel: 'sort', value: [{ id: 'dueDate', desc: false }, { id: 'updatedAt', desc: true }], def: SAVED_SORT, labels: ${JSON.stringify(SORT_LABELS_EN)} },
  'sort-labels-default': { panel: 'sort', value: [{ id: 'dueDate', desc: false }, { id: 'updatedAt', desc: true }], def: SAVED_SORT },
  'filter-modified':  { panel: 'filter', value: MODIFIED_FILTER, def: SAVED_FILTER },
  'filter-equal':     { panel: 'filter', value: SAVED_FILTER, def: SAVED_FILTER },
  'filter-nodefault': { panel: 'filter', value: MODIFIED_FILTER },
  // 空樹 + maxConditions=0:初次掛載不自動加空列 = 真的沒有東西可清
  'filter-empty':     { panel: 'filter', value: EMPTY_FILTER, def: SAVED_FILTER, maxConditions: 0 },
  'filter-off':       { panel: 'filter', value: MODIFIED_FILTER, clearable: false },
  // 打開了「更新時間」、收起了「到期日」→ 與預設不同
  'vis-modified':  { panel: 'vis', value: { updatedAt: true, dueDate: false }, def: SAVED_VIS },
  // 只收起了一欄預設沒寫到的欄(到期日;預設沒寫 = 顯示)→ 與預設不同(按下去會把到期日打開)
  'vis-modified-unlisted': { panel: 'vis', value: { updatedAt: false, dueDate: false }, def: SAVED_VIS },
  // 與預設一樣,只是多寫了一個 key: true(沒寫 = 顯示,應視為一樣)
  'vis-equal':     { panel: 'vis', value: { key: true, updatedAt: false }, def: SAVED_VIS },
  // 收起了幾欄、但產品沒給預設
  'vis-nodefault': { panel: 'vis', value: { dueDate: false, updatedAt: false } },
}

function Panel({ scene }) {
  const s = SCENES[scene]
  const [value, setValue] = React.useState(s.value)
  window.__value = () => JSON.stringify(value)
  const extra = s.clearable === false ? { clearable: false } : {}
  if (s.panel === 'vis') return <DataTableColumnVisibilityPanel className="w-72" columns={VIS_COLS} visibility={value} onVisibilityChange={setValue} defaultVisibility={s.def} />
  if (s.panel === 'sort') return <DataTableSortManager columns={SORT_COLS} sorting={value} onSortingChange={setValue} defaultSorting={s.def} labels={s.labels} {...extra} />
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
  // 欄位顯示面板沒有加條件那一排:就緒 = 標題列 + 底部「顯示全部 / 全部隱藏」
  const footerBtn = host.querySelector('[data-popover-footer] button')
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
    ready: Boolean(header && ((row && add) || footerBtn)),
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
      : kind === 'toggle'
        // 欄位顯示面板:第一顆可按的「隱藏此欄」(再改一處用)
        ? [...host.querySelectorAll('button[aria-label="隱藏此欄"]')].find((b) => !b.disabled)
        : host.querySelector('[data-panel-add-row] button')
  if (!el) return false
  el.setAttribute('data-press-target', '')
  return true
}
// 排序面板 labels 場景:按**結構**找每個位置(不靠字 —— 字就是要量的東西):標題列的標題 / RotateCcw 圖示鈕 / ×、
// 加條件那一排的 Plus 鈕 / 另一顆、每一列(含兩個下拉的最小容器)的 GripVertical 把手 / 第一個下拉 / 第二個下拉 / Trash 鈕
const hasIcon = (el, re) => !!el && [...el.querySelectorAll('svg')].some((s) => re.test(String(s.getAttribute('class') || '')))
const sortLabelParts = () => {
  const host = document.getElementById('scene-host')
  if (!host) return null
  const header = host.querySelector('[data-slot="surface-header"]')
  const addRow = host.querySelector('[data-panel-add-row]')
  const addRowButtons = addRow ? [...addRow.querySelectorAll('button')] : []
  const add = addRowButtons.find((b) => hasIcon(b, /lucide-plus/)) || null
  const rowOf = (el) => { let x = el; while (x && x !== host && x.querySelectorAll('[role="combobox"]').length < 2) x = x.parentElement; return x && x !== host ? x : null }
  const rows = [...new Set([...host.querySelectorAll('[role="combobox"]')].map(rowOf).filter(Boolean))]
  return {
    title: header ? header.querySelector('h1,h2,h3,h4,h5,h6') : null,
    reset: header ? [...header.querySelectorAll('button')].find((b) => !b.hasAttribute('data-dismiss') && hasIcon(b, /lucide-rotate-ccw/)) || null : null,
    close: header ? header.querySelector('button[data-dismiss]') : null,
    add,
    clear: addRowButtons.find((b) => b !== add) || null,
    rows: rows.map((row) => {
      const combos = [...row.querySelectorAll('[role="combobox"]')]
      const labelled = [...row.querySelectorAll('[aria-label]')]
      return {
        drag: labelled.find((el) => hasIcon(el, /lucide-grip-vertical/)) || null,
        field: combos[0] || null,
        direction: combos[1] || null,
        del: [...row.querySelectorAll('button')].find((b) => hasIcon(b, /lucide-trash/)) || null,
      }
    }),
    live: host.querySelector('[data-panel-live-region]'),
  }
}
window.__probeLabels = () => {
  const p = sortLabelParts()
  if (!p) return null
  const text = (el) => (el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : null)
  const aria = (el) => (el ? el.getAttribute('aria-label') : null)
  return {
    title: text(p.title), reset: aria(p.reset), close: aria(p.close), add: text(p.add), clear: text(p.clear),
    rows: p.rows.map((r) => ({ drag: aria(r.drag), field: aria(r.field), direction: aria(r.direction), directionText: text(r.direction), del: aria(r.del) })),
    live: p.live ? (p.live.textContent || '') : null,
  }
}
window.__sortManagerDefaults = DATA_TABLE_SORT_MANAGER_DEFAULT_LABELS
/** labels 場景:把結構上的「恢復預設」/「清除全部」標上 data-press-target;不在 = false */
window.__markLabels = (kind) => {
  const p = sortLabelParts()
  const el = p ? (kind === 'reset' ? p.reset : p.clear) : null
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
  vis: { saved: JSON.stringify({ updatedAt: false }), reset: '已恢復預設欄位顯示' },
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

  // ── 欄位顯示面板(2026-11-15 併入):只有「恢復預設」,沒有「清除全部」、沒有加條件鈕 ──
  const V = DEFAULTS.vis
  const visModified = await scene('vis-modified')
  check('vis-reset-shown', 'contract', '欄位顯示面板:目前 ≠ 產品預設 → 標題列出現「恢復預設」', visModified.reset, visModified)
  check('vis-dismiss', 'control', '欄位顯示面板:× 恆在', visModified.dismiss, visModified)
  check('vis-live-region', 'control', '欄位顯示面板:polite 區域恆在', visModified.liveRole === 'status/polite', { liveRole: visModified.liveRole })
  const visUnlisted = await scene('vis-modified-unlisted')
  check('vis-reset-shown-unlisted', 'contract', '欄位顯示面板:與預設只差在預設沒寫到的欄(那一欄被收起;沒寫 = 顯示)→ 標題列出現「恢復預設」', visUnlisted.reset, visUnlisted)
  const visEqual = await scene('vis-equal')
  check('vis-reset-hidden-equal', 'contract', '欄位顯示面板:目前 = 產品預設(多寫一個 key: true 也算一樣,沒寫 = 顯示)→ 不出現「恢復預設」', !visEqual.reset, visEqual)
  const visNoDefault = await scene('vis-nodefault')
  check('vis-reset-hidden-nodefault', 'contract', '欄位顯示面板:沒有預設(不傳)→ 收起了幾欄也不出現「恢復預設」', !visNoDefault.reset, visNoDefault)

  await scene('vis-modified')
  const pressedVis = await pressKey(resetBtn)
  const afterVis = await probe()
  check('vis-reset-click-value', 'contract', '欄位顯示面板:按「恢復預設」→ 值 = 產品預設(不是全部顯示)', pressedVis && afterVis.value === V.saved, { pressed: pressedVis, value: afterVis.value })
  check('vis-reset-click-focus', 'contract', '欄位顯示面板:按「恢復預設」(焦點在它上面)→ 焦點落在標題列 ×(這個面板沒有加條件鈕;不是 body)', pressedVis && afterVis.focus === 'dismiss', { pressed: pressedVis, focus: afterVis.focus })
  check('vis-reset-click-announce', 'contract', `欄位顯示面板:按「恢復預設」→ polite 區域唸「${V.reset}」`, pressedVis && afterVis.live === V.reset, { pressed: pressedVis, live: afterVis.live })
  let afterVisEdit = null
  if (pressedVis) {
    // 再切一欄:按不到 = 量具壞了(上一步剛確認面板在),不是產品裁決
    if (!(await pressKey('toggle'))) throw new InstrumentError('欄位顯示面板:找不到可按的「隱藏此欄」,量不到「再改一處」')
    afterVisEdit = await probe()
  }
  check('vis-reset-edit-silences', 'contract', '欄位顯示面板:恢復預設之後再切一欄 → 那句播報清空(下一次才唸得出來)',
    pressedVis && afterVisEdit && afterVisEdit.value !== V.saved && afterVisEdit.live === '', { pressed: pressedVis, after: afterVisEdit && { value: afterVisEdit.value, live: afterVisEdit.live } })

  // ── 排序面板 labels(2026-11-15 審查 A 第 2 輪):每個字在對的元素 / 屬性上(位置按結構找,見 harness sortLabelParts)──
  const L = SORT_LABELS_EN
  const probeLabels = async (name) => {
    const p = await page.evaluate(() => window.__probeLabels())
    // 兩列條件找不到 = 量具對不到元件結構(不是產品裁決):場景給的就是兩列
    if (!p || p.rows.length !== 2) throw new InstrumentError(`排序面板 labels 場景 ${name}:找不到兩列條件(實得 ${p ? p.rows.length : '無'} 列)—— 量具的結構定位對不到元件`)
    return p
  }
  await scene('sort-labels')
  const pl = await probeLabels('sort-labels')
  const every = (key, want) => pl.rows.every((r) => r[key] === want)
  check('sort-labels-title', 'contract', `排序面板 labels:標題列的標題 = title「${L.title}」`, pl.title === L.title, { title: pl.title })
  check('sort-labels-reset', 'contract', `排序面板 labels:標題列 RotateCcw 鈕的讀屏名稱 = resetToDefault「${L.resetToDefault}」`, pl.reset === L.resetToDefault, { reset: pl.reset })
  check('sort-labels-close', 'contract', `排序面板 labels:標題列 × 的讀屏名稱 = close「${L.close}」`, pl.close === L.close, { close: pl.close })
  check('sort-labels-add', 'contract', `排序面板 labels:加條件那一排 Plus 鈕的字 = addSort「${L.addSort}」`, pl.add === L.addSort, { add: pl.add })
  check('sort-labels-clear', 'contract', `排序面板 labels:加條件那一排另一顆的字 = clearAll「${L.clearAll}」`, pl.clear === L.clearAll, { clear: pl.clear })
  check('sort-labels-drag', 'contract', `排序面板 labels:每一列拖曳把手的讀屏名稱 = dragToReorder「${L.dragToReorder}」`, every('drag', L.dragToReorder), { rows: pl.rows.map((r) => r.drag) })
  check('sort-labels-field', 'contract', `排序面板 labels:每一列第一個下拉(欄位)的讀屏名稱 = fieldAriaLabel「${L.fieldAriaLabel}」`, every('field', L.fieldAriaLabel), { rows: pl.rows.map((r) => r.field) })
  check('sort-labels-direction', 'contract', `排序面板 labels:每一列第二個下拉(方向)的讀屏名稱 = directionAriaLabel「${L.directionAriaLabel}」`, every('direction', L.directionAriaLabel), { rows: pl.rows.map((r) => r.direction) })
  check('sort-labels-direction-text', 'contract', `排序面板 labels:方向下拉顯示的字 = ascending「${L.ascending}」(升冪那一列)/ descending「${L.descending}」(降冪那一列)`,
    pl.rows[0].directionText === L.ascending && pl.rows[1].directionText === L.descending, { rows: pl.rows.map((r) => r.directionText) })
  check('sort-labels-delete', 'contract', `排序面板 labels:每一列 Trash 鈕的讀屏名稱 = deleteCondition「${L.deleteCondition}」`, every('del', L.deleteCondition), { rows: pl.rows.map((r) => r.del) })
  const pressLabel = async (kind) => {
    const ok = await page.evaluate((k) => window.__markLabels(k), kind)
    if (!ok) return false
    await d.focus('[data-press-target]')
    await page.evaluate(() => document.querySelector('[data-press-target]')?.removeAttribute('data-press-target'))
    await d.press('Enter')
    return true
  }
  for (const [kind, key, id] of [['reset', 'resetToDefaultDone', 'sort-labels-reset-announce'], ['clear', 'clearAllDone', 'sort-labels-clear-announce']]) {
    await scene('sort-labels')
    const pressed = await pressLabel(kind)
    const after = await page.evaluate(() => window.__probeLabels())
    check(id, 'contract', `排序面板 labels:按${kind === 'reset' ? '標題列 RotateCcw 鈕' : '加條件那一排另一顆'} → polite 區域唸 ${key}「${L[key]}」`, pressed && after?.live === L[key], { pressed, live: after?.live })
  }
  // 不傳 labels:每個位置 = 面板出口的預設值(DATA_TABLE_SORT_MANAGER_DEFAULT_LABELS)
  await scene('sort-labels-default')
  const pd = await probeLabels('sort-labels-default')
  const D = await page.evaluate(() => window.__sortManagerDefaults)
  const wantDefault = { title: D.title, reset: D.resetToDefault, close: D.close, add: D.addSort, clear: D.clearAll, rows: [
    { drag: D.dragToReorder, field: D.fieldAriaLabel, direction: D.directionAriaLabel, directionText: D.ascending, del: D.deleteCondition },
    { drag: D.dragToReorder, field: D.fieldAriaLabel, direction: D.directionAriaLabel, directionText: D.descending, del: D.deleteCondition },
  ] }
  const gotDefault = { title: pd.title, reset: pd.reset, close: pd.close, add: pd.add, clear: pd.clear, rows: pd.rows }
  check('sort-labels-defaults', 'contract', '排序面板不傳 labels:每個位置 = DATA_TABLE_SORT_MANAGER_DEFAULT_LABELS 的同一個鍵', JSON.stringify(gotDefault) === JSON.stringify(wantDefault), { got: gotDefault, want: wantDefault })
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
    // 對照:突變錨點對不到 → 共用 bundleDsHarness 必須丟回 InstrumentError(本閘接住 → INSTRUMENT-FAIL、exit 2),
    // 不是被 esbuild 包成一般的 Build failed(2026-11-15 前:未捕捉、exit 1、沒有標記)
    const missAnchor = await bundleDsHarness({
      root: SOURCE_ROOT, harness: HARNESS, harnessName: 'data-table-panel-reset-clear-harness.tsx',
      mutate: mutantFor(SOURCE_ROOT, SORT, (src) => replaceOnce(src, /這個錨點在原始碼裡不存在_anchor_miss_control/, '')),
    }).then(() => null, (error) => error)
    if (missAnchor instanceof InstrumentError && missAnchor.message.includes('突變錨點命中 0 次')) {
      // 這一行不印儀器失效的標記字樣:gate-selftest-meta 看到標記一律判紅(對照組成立時印的是「抓到了」,不是「量不到」)
      console.log('\n  ✓ 對照:突變錨點對不到 → InstrumentError(本閘印儀器失效標記、exit 2)')
    } else {
      problems.push(`突變錨點對不到時應丟 InstrumentError(「突變錨點命中 0 次」),實得 ${missAnchor ? `${missAnchor.constructor?.name}:${String(missAnchor.message).split('\n')[0]}` : '打包成功(錨點對照組不成立)'}`)
    }
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
    process.exitCode = 2
  } else {
    throw error
  }
} finally {
  await browser?.close()
}
