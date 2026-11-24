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
 *            **順序**(2026-11-15 B12,【AI 推導】):順序也算進預設 —— 只改順序也出現;
 *            按下順序回到 `defaultColumnOrder`(面板那幾欄;面板沒列的 id 如選取欄留在原位),沒傳 = `columns` 定義順序、鎖定欄排最前;
 *            只傳 `defaultColumnOrder` = 預設全部顯示;兩個預設都不傳 = 不出現。
 *        (4b) 欄位顯示面板的**固定零件**(2026-11-15,data-table.spec.md L4「欄位顯示面板的固定零件」;M23(f)):搜尋框恆在(2026-11-15 前的開關
 *            參數 `searchable` 已移除,0.x 不留舊名);每一個沒鎖的欄位列都有拖曳把手,鎖定欄沒有把手、有鎖頭;
 *            consumer 的 `columnOrder` 從 `[]` 開始也拖得動(順序改了)、沒寫到的面板欄照 `columns` 接在後面照樣列出來(順序必填之後的配套,【AI 推導】)。
 *            2026-11-15 前「沒接順序 = 只比顯示」「只給 columnOrder 沒給 onColumnOrderChange」兩列已拿掉:兩個參數必填,那種接法型別層不再允許。
 *        (5) 排序面板 `labels`(2026-11-15 A11 開放;data-table.spec.md「Multi-sort header」列的字串那一句):傳一整份自訂字,每個字畫在
 *            **對的元素 / 屬性**上 —— 標題、RotateCcw 鈕與 × 的讀屏名稱、加排序 / 清除全部的字、每一列拖曳把手 / 欄位下拉 / 方向下拉 / Trash 鈕的
 *            讀屏名稱、方向下拉顯示的升冪 / 降冪、兩句播報;不傳 = 每個位置是出口的預設值。位置按結構找(圖示、順序、data-*),不靠字。
 *            放在這支而不是 data-table-multi-sort(那支量 storybook 建置的 story,要傳自訂字得新增 story = 動 a11y 語料)或
 *            test-data-table-sort-cycle(純 node、沒有瀏覽器,只能查鍵有出現 —— 審查 A 第 2 輪把欄位 / 方向兩個讀屏名稱對調,它照樣全綠):
 *            這支已經直接打包 DataTableSortManager 原始碼,而且 selftest 要求每一條契約列都被某個突變弄紅過。
 *        (6) 寬度(2026-11-15 A19;data-table.spec.md「工具面板的寬度」,user 2026-11-11 逐字「此外，所有data table的工具面板應該都要具備可以被
 *            消費者調整寬度的能力對吧？處理方式照你建議…」+「尺寸:甲」):三個面板的 `width` / `minWidth` / `maxWidth`(px)量面板根元素的
 *            getBoundingClientRect 寬 ± 0.5 —— 不傳 = 預設寬不變(排序 30rem / 篩選 640、巢狀 760 / 欄位顯示撐滿外層 18rem);width 照給;
 *            比下限窄 → 照下限(排序 25rem / 篩選 35rem / 欄位顯示 15.5rem),而且在下限寬裡沒有元素凸出面板右緣;maxWidth 壓得下、minWidth 撐得開;
 *            篩選巢狀 = width + 120。375px 寬時外層浮層、面板、× 全在視窗內、寬 ≤ 視窗 − 2rem(+ 邊框)。PopoverContent `width`:數字照給、
 *            375px 夾在視窗內;`"hug"` = 跟裡面的面板一樣寬(本閘的外層浮層 2026-11-15 起就用它,取代 className="w-auto")。
 *   紅: 任一列不符 → 逐列點名 exit 1。`--selftest` 在 DS 原始碼上各造回一個根因突變(MUTANTS,含修前寫法:排序面板以 onReset 有無當「重置」渲染閘、
 *        兩個面板都沒有「清除全部」、欄位顯示面板以 resettable 開關 + 有隱藏欄當渲染閘、按下 = 全部顯示、只比也只還原顯示不管順序、
 *        按下不還原順序、搜尋要另外開才有、拖曳要另外開才有、拖曳在 consumer 的 columnOrder 上找位置、沒寫到的欄不列出來),
 *        每個突變必須**剛好**紅它負責的那幾列,而且每一條契約列都被某個突變弄紅過(`--shard` 時改成靜態驗:每條契約列都在某個突變的 expectRed)。
 *   綠: 現行原始碼每列都量到且符合;對照列(× 恆在、polite 區域恆在)在現行原始碼與每個突變上都綠。harness 打包 / 載不起來、selftest 的
 *        突變錨點對不到(共用 lib/ds-source-harness.mjs 的 bundleDsHarness 把它原樣丟回成 InstrumentError —— 2026-11-15 前會變成未捕捉的
 *        esbuild 錯誤、exit 1、沒有標記;selftest 開頭有一格對照)、等不到元素 = 儀器失效(INSTRUMENT-FAIL,exit 2),不讀成通過(M37:沒量到 ≠ 沒發生)。
 *        按鈕該出現卻不在 = 那一列判紅(那是產品裁決,不是量具壞了)。
 *   註: 2026-11-11 新增(user 2026-11-11 PR #172:排序面板加「清除全部」開關、放加排序那一排最右;「重置」與「清除所有」是兩個入口、重置由消費端決定)。
 *       2026-11-15 加欄位顯示面板(第四批成品頁「下一批直接做」;照同一條規則落地,【AI 推導】)。
 *       同日加順序(起因 user 成品頁 B12 留言,是問句,逐字見 data-table.spec.md L4;連順序還原、不加「不還原順序」開關 = 【AI 推導 2026-11-15】)。
 *       同日加固定零件 (4b)(user 問句,逐字:「“是我寫範例時漏接了”為何可以漏接？這幾個面板不都是有很多地方是固定設計的「元件」嗎」)。
 *
 * 用法:
 *   node scripts/data-table-panel-reset-clear-invariant.mjs              判定(現行原始碼)
 *   node scripts/data-table-panel-reset-clear-invariant.mjs --selftest   對照組(全部單一根因突變;基準 = 一趟完整判定)
 *   node scripts/data-table-panel-reset-clear-invariant.mjs --selftest --shard=<k>/<n>   只跑第 k 片突變(CI matrix 平行;基準照跑、覆蓋率靜態驗)
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
/**
 * `--shard=<k>/<n>`(selftest):只跑 MUTANTS 裡索引 % n === k 的那一片(基準照跑 = 每一片都是一趟完整判定)。CI 把對照組拆成 n 片平行跑
 * (ci.yml verify-browser-nested-dismiss 的 matrix;同 overlay-nested-dismiss-invariant.mjs 的寫法):各片各自驗「每個突變剛好紅它的 expectRed」;
 * 覆蓋率改成靜態驗 —— 每一條契約列都必須出現在某個突變的 expectRed。不給 = 一片跑全部(本機 `npm run test:data-table-panel-reset-clear`、meta-test)。
 */
const SHARD = (() => {
  const raw = process.argv.find((a) => a.startsWith('--shard='))?.slice('--shard='.length)
  if (raw == null) return null
  const m = /^(\d+)\/(\d+)$/.exec(raw)
  const k = m ? Number(m[1]) : NaN
  const n = m ? Number(m[2]) : NaN
  if (!m || !(n >= 1) || !(k >= 0 && k < n)) { console.error(`✗ --shard=${raw} 寫法不對(要 <k>/<n>,0 ≤ k < n)`); process.exit(2) }
  return { k, n }
})()
const SOURCE_ROOT = resolveSourceRoot()
const TOL = 0.5
const SORT = 'components/DataTable/data-table-sort-manager.tsx'
const FILTER = 'components/DataTable/data-table-filter-panel.tsx'
const HOOK = 'components/DataTable/lib/panel-bulk-action.tsx'
const VIS = 'components/DataTable/data-table-column-visibility-panel.tsx'
const WIDTH_LIB = 'components/DataTable/lib/panel-width.ts'
const POPOVER = 'components/Popover/popover.tsx'
const VIS_RESET = /const showReset = hasDefault && !isPanelResetStateEqual\(columnIds, current, defaults\)/
const VIS_RUN = /bulk\.run\(e, defaults, '已恢復預設欄位顯示'\)/
const VIS_HAS_DEFAULT = /const hasDefault = defaultVisibility !== undefined \|\| defaultColumnOrder !== undefined/
const VIS_ORDER_APPLY = /onColumnOrderChange\(applyPanelOrder\(fullOrder, next\.order, columnIdSet\)\)/
const VIS_ORDER_MERGE = /applyPanelOrder\(fullOrder, next\.order, columnIdSet\)/
const VIS_ORDER_COMPARE = /return isVisibilityEqual\(ids, a\.visibility, b\.visibility\) && isOrderEqual\(a\.order, b\.order\)/
/** 固定零件(4b):搜尋框那一塊 / 拖曳把手 / 鎖定欄分支 / 完整順序 / 拖曳在哪一份順序上找位置 */
const VIS_SEARCH_BLOCK = /<div className="shrink-0 px-\[var\(--layout-space-loose\)\] pt-\[var\(--layout-space-tight\)\]">[\s\S]*?<\/div>/
const VIS_GRIP = /<ItemInlineActionButton\s+icon=\{GripVertical\}[\s\S]*?\/>/
const VIS_LOCK_BRANCH = /\{locked \? \(/
const VIS_FULL_ORDER_RETURN = /return \[\.\.\.listed, \.\.\.columnIds\.filter\(\(id\) => !seen\.has\(id\)\)\]/
const VIS_DRAG_INDEX = /const oldIdx = fullOrder\.indexOf\(active\.id as string\)\s+const newIdx = fullOrder\.indexOf\(over\.id as string\)/
const VIS_LOCK_FIRST = /return \[\.\.\.columnIds\.filter\(\(id\) => locked\.has\(id\)\), \.\.\.columnIds\.filter\(\(id\) => !locked\.has\(id\)\)\]/
const VIS_EXPLICIT_ORDER = /if \(defaultColumnOrder\) \{/
/**
 * 欄位顯示面板的順序場景(2026-11-15 B12):面板列出的那幾欄 / 產品存的預設順序 / 面板沒列的系統欄(選取欄,只在 consumer 的 columnOrder 裡)。
 * 同一份值內插進 harness,node 端判定與 harness 場景不會各寫一份。
 */
const VIS_IDS = ['key', 'summary', 'status', 'dueDate', 'updatedAt']
/** 產品存的預設順序:「到期日」排在「摘要」後面(與定義順序不同,才分得出「照 defaultColumnOrder」與「照 columns」) */
const VIS_SAVED_ORDER = ['key', 'summary', 'dueDate', 'status', 'updatedAt']
/** 使用者把「到期日」拖到「摘要」前面(鍵值鎖在第一位) */
const VIS_DRAGGED_ORDER = ['key', 'dueDate', 'summary', 'status', 'updatedAt']
const VIS_SYSTEM_COL = '__select__'
/** 欄位定義把「鍵值」寫在第二個、但它是鎖定欄 → 沒傳 defaultColumnOrder 時預設順序把它排最前 */
const VIS_IDS_KEY_SECOND = ['summary', 'key', 'status', 'dueDate', 'updatedAt']
const VIS_LOCKED_FIRST_ORDER = ['key', 'summary', 'status', 'dueDate', 'updatedAt']
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
    // 永遠不出現 → 順序場景裡「該出現」與「按下去」的列也全紅(按鈕該在卻不在 = 產品紅);「不該出現」的列照綠
    expectRed: ['vis-reset-shown', 'vis-reset-shown-unlisted', 'vis-reset-click-value', 'vis-reset-click-focus', 'vis-reset-click-announce', 'vis-reset-edit-silences',
      'vis-order-only-shown', 'vis-order-columns-click-order', 'vis-order-click-value', 'vis-order-click-order', 'vis-order-keeps-others', 'vis-order-click-focus', 'vis-order-click-announce',
      'vis-order-locked-first', 'vis-order-default-only-shown', 'vis-order-default-only-click'],
    apply: (src) => replaceOnce(src, VIS_RESET, 'const showReset = Boolean((props as { resettable?: unknown }).resettable) && columnIds.some((id) => visibility[id] === false)'),
  },
  {
    id: 'vis-reset-default-keys-only',
    what: '欄位顯示面板「恢復預設」的出現條件只比預設寫到的那幾欄(預設沒寫的欄被收起也不出現;共用 hook 的比對不動)',
    file: VIS,
    // 只傳 defaultColumnOrder 的場景:預設顯示 = {}(全部顯示)→ 寫到的欄 = 0 欄 → 收起「到期日」也不出現
    expectRed: ['vis-reset-shown-unlisted', 'vis-order-default-only-shown', 'vis-order-default-only-click'],
    apply: (src) => replaceOnce(src, VIS_RESET, 'const showReset = hasDefault && !isPanelResetStateEqual(Object.keys(defaults.visibility), current, defaults)'),
  },
  {
    id: 'vis-reset-when-hidden',
    what: '欄位顯示面板有隱藏欄就出「恢復預設」(修前的出現條件,不比對預設、不看順序)',
    file: VIS,
    // 順序場景:預設本來就收起「更新時間」→ 按下後按鈕還在、焦點留在它身上
    expectRed: ['vis-reset-hidden-equal', 'vis-reset-hidden-nodefault', 'vis-reset-click-focus', 'vis-order-click-focus'],
    apply: (src) => replaceOnce(src, VIS_RESET, 'const showReset = columnIds.some((id) => visibility[id] === false)'),
  },
  {
    id: 'vis-reset-shows-all',
    what: '欄位顯示面板「恢復預設」按下 = 全部顯示、順序不動(修前的動作 onVisibilityChange({}))',
    file: VIS,
    // 播報列綠:這次動作的結果就是「全部顯示 + 目前的順序」,hook 的「值仍等於這次動作的結果」成立 —— 那是這個突變自己的結果
    expectRed: ['vis-reset-click-value', 'vis-reset-click-focus', 'vis-order-columns-click-order', 'vis-order-click-value', 'vis-order-click-order', 'vis-order-click-focus', 'vis-order-locked-first'],
    apply: (src) => replaceOnce(src, VIS_RUN, "bulk.run(e, { visibility: {}, order: orderedIds }, '已恢復預設欄位顯示')"),
  },
  {
    id: 'vis-reset-keeps-order',
    what: '欄位顯示面板「恢復預設」按下只還原顯示、不還原順序(B12 根因:不呼叫 onColumnOrderChange)',
    file: VIS,
    // 順序沒回去 → 按鈕還在(焦點留在它身上)、值 ≠ 這次動作的結果(不播報);選取欄本來就在原位 → keeps-others 綠
    expectRed: ['vis-order-columns-click-order', 'vis-order-click-order', 'vis-order-click-focus', 'vis-order-click-announce', 'vis-order-locked-first'],
    apply: (src) => replaceOnce(src, VIS_ORDER_APPLY, 'void columnIdSet'),
  },
  {
    id: 'vis-reset-ignores-order',
    what: '欄位顯示面板「恢復預設」只比也只還原顯示、不管順序(2026-11-15 B12 前的寫法)',
    file: VIS,
    expectRed: ['vis-order-only-shown', 'vis-order-columns-click-order', 'vis-order-click-order', 'vis-order-locked-first'],
    apply: (src) => replaceOnce(replaceOnce(src, VIS_ORDER_COMPARE, 'return isVisibilityEqual(ids, a.visibility, b.visibility)'), VIS_ORDER_APPLY, 'void columnIdSet'),
  },
  // ── 固定零件(4b,2026-11-15):把搜尋 / 拖曳改回選配 → 紅 ──
  {
    id: 'vis-search-opt-in',
    what: '欄位顯示面板修前:搜尋框要另外傳 searchable 才有(預設關;harness 不傳 → 沒有搜尋框)',
    file: VIS,
    expectRed: ['vis-search-shown'],
    apply: (src) => replaceOnce(src, VIS_SEARCH_BLOCK, '{false && ($&)}'),
  },
  {
    id: 'vis-drag-opt-in',
    what: '欄位顯示面板修前:拖曳把手要另外開才有(修前的開關是「傳了 columnOrder + onColumnOrderChange」;兩個現在必填、harness 一定傳,所以這裡以「沒開」重現同一個形狀)',
    file: VIS,
    // 沒有把手 → [] 場景也拖不動(把手該在卻不在 = 產品紅)
    expectRed: ['vis-row-handles', 'vis-order-empty-drag'],
    apply: (src) => replaceOnce(src, VIS_GRIP, '<>{false ? ($&) : null}</>'),
  },
  {
    id: 'vis-locked-draggable',
    what: '欄位顯示面板鎖定欄也畫拖曳把手(沒有鎖頭)',
    file: VIS,
    expectRed: ['vis-locked-no-handle'],
    apply: (src) => replaceOnce(src, VIS_LOCK_BRANCH, '{false ? ('),
  },
  {
    id: 'vis-drag-raw-order',
    what: '欄位顯示面板修前:拖曳在 consumer 的 columnOrder 上找位置(從 [] 開始 → 找不到 → 拖了沒反應)',
    file: VIS,
    expectRed: ['vis-order-empty-drag'],
    apply: (src) => replaceOnce(src, VIS_DRAG_INDEX, 'const oldIdx = columnOrder.indexOf(active.id as string)\n    const newIdx = columnOrder.indexOf(over.id as string)'),
  },
  {
    id: 'vis-order-drops-unlisted',
    what: '欄位顯示面板修前:consumer 的 columnOrder 沒寫到的面板欄不列出來(只有 [] 時才照 columns)',
    file: VIS,
    expectRed: ['vis-order-partial-listed'],
    apply: (src) => replaceOnce(src, VIS_FULL_ORDER_RETURN, 'return columnOrder.length > 0 ? listed : [...columnIds]'),
  },
  {
    id: 'vis-default-order-ignores-lock',
    what: '欄位顯示面板沒傳 defaultColumnOrder 時預設順序照 columns 原樣(鎖定欄沒有排最前)',
    file: VIS,
    expectRed: ['vis-order-locked-first'],
    apply: (src) => replaceOnce(src, VIS_LOCK_FIRST, 'return [...columnIds]'),
  },
  {
    id: 'vis-default-order-ignores-explicit',
    what: '欄位顯示面板傳了 defaultColumnOrder 也照 columns 排',
    file: VIS,
    expectRed: ['vis-order-click-order', 'vis-order-default-only-click'],
    apply: (src) => replaceOnce(src, VIS_EXPLICIT_ORDER, 'if (defaultColumnOrder && false) {'),
  },
  {
    id: 'vis-has-default-visibility-only',
    what: '欄位顯示面板只認 defaultVisibility 當「有預設」(只傳 defaultColumnOrder 不出現)',
    file: VIS,
    expectRed: ['vis-order-default-only-shown', 'vis-order-default-only-click'],
    apply: (src) => replaceOnce(src, VIS_HAS_DEFAULT, 'const hasDefault = defaultVisibility !== undefined'),
  },
  {
    id: 'vis-reset-without-default',
    what: '欄位顯示面板兩個預設都沒傳也拿「全部顯示 + columns 順序」當預設(不傳 = 不出現沒守住)',
    file: VIS,
    expectRed: ['vis-reset-hidden-nodefault', 'vis-order-nodefault-hidden'],
    apply: (src) => replaceOnce(src, VIS_HAS_DEFAULT, 'const hasDefault = true'),
  },
  {
    id: 'vis-reset-drops-others',
    what: '欄位顯示面板「恢復預設」把面板那幾欄的順序直接交出去(consumer columnOrder 裡面板沒列的選取欄被丟掉)',
    file: VIS,
    expectRed: ['vis-order-keeps-others'],
    apply: (src) => replaceOnce(src, VIS_ORDER_MERGE, '[...next.order]'),
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
    expectRed: ['vis-reset-click-focus', 'vis-order-click-focus'],
    apply: (src) => replaceOnce(src, VIS_FOCUS, 'focusTargets: () => []'),
  },
  {
    id: 'hook-no-focus',
    what: '整批動作後不交焦點(修前:按鈕卸載、焦點掉到 body)',
    file: HOOK,
    expectRed: ['sort-reset-click-focus', 'sort-clear-click-focus', 'sort-clear-cap-focus', 'filter-reset-click-focus', 'filter-clear-click-focus', 'vis-reset-click-focus', 'vis-order-click-focus'],
    apply: (src) => replaceOnce(src, /el\.focus\(\{ preventScroll: true \}\)/, 'void el'),
  },
  {
    id: 'hook-no-announce',
    what: '整批動作後不播報',
    file: HOOK,
    expectRed: ['sort-reset-click-announce', 'sort-clear-click-announce', 'filter-reset-click-announce', 'filter-clear-click-announce', 'vis-reset-click-announce', 'vis-order-click-announce', 'sort-labels-reset-announce', 'sort-labels-clear-announce'],
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
  // ── 寬度(6,2026-11-15 A19)──
  {
    id: 'width-param-ignored',
    what: '三個面板共用的寬度算式不理產品給的 width(畫成預設寬)',
    file: WIDTH_LIB,
    expectRed: ['sort-w-param', 'sort-w-floor', 'sort-w-max', 'filter-w-param', 'filter-w-nested-param', 'filter-w-floor', 'filter-w-max', 'vis-w-param', 'vis-w-floor', 'vis-w-max'],
    apply: (src) => replaceOnce(src, /if \(width != null\) style\.width = /, 'if (false) style.width = '),
  },
  {
    id: 'width-no-floor',
    what: '沒有下限(產品給多窄就畫多窄,列被擠壞)',
    file: WIDTH_LIB,
    expectRed: ['sort-w-floor', 'sort-w-floor-fits', 'filter-w-floor', 'filter-w-floor-fits', 'vis-w-floor', 'vis-w-floor-fits'],
    apply: (src) => replaceOnce(src, /const base = floorCss\(floor\)/, "const base = '0px'"),
  },
  {
    id: 'width-no-viewport-clamp',
    what: '沒有視窗夾限(修前排序面板的病:375px 寬時面板 480、× 出畫面;篩選面板的下限也不再讓位給視窗)',
    file: WIDTH_LIB,
    expectRed: ['sort-w-375', 'filter-w-375', 'vis-w-375'],
    apply: (src) => replaceOnce(src, /const vp = OVERLAY_VIEWPORT_MAX_WIDTH/, "const vp = '100000px'"),
  },
  {
    id: 'width-max-ignored',
    what: '不理產品給的 maxWidth',
    file: WIDTH_LIB,
    expectRed: ['sort-w-max', 'filter-w-max', 'vis-w-max'],
    apply: (src) => replaceOnce(src, /maxWidth: maxWidth != null \? `min\(\$\{maxWidth\}px, \$\{vp\}\)` : vp,/, 'maxWidth: vp,'),
  },
  {
    id: 'width-min-ignored',
    what: '不理產品給的 minWidth(下限拉不高)',
    file: WIDTH_LIB,
    expectRed: ['sort-w-min', 'filter-w-min', 'vis-w-min'],
    apply: (src) => replaceOnce(src, /minWidth: `min\(\$\{minWidth != null \? `max\(\$\{base\}, \$\{minWidth\}px\)` : base\}, \$\{vp\}\)`,/, 'minWidth: `min(${base}, ${vp})`,'),
  },
  {
    id: 'width-default-is-floor',
    what: '不傳 width 時把下限當寬寫上去(預設寬變了 = 畫面變了)',
    file: WIDTH_LIB,
    expectRed: ['sort-w-default', 'filter-w-default', 'filter-w-nested-default', 'vis-w-default'],
    apply: (src) => replaceOnce(src, /\n {2}return style\n/, '\n  if (width == null) style.width = base\n  return style\n'),
  },
  {
    id: 'filter-nested-no-extra',
    what: '篩選面板巢狀模式不加群組外框的差額(width 直接當巢狀寬)',
    file: FILTER,
    expectRed: ['filter-w-nested-param'],
    apply: (src) => replaceOnce(src, /, value\.mode === 'nested' \? `\$\{FILTER_NESTED_EXTRA_PX\}px` : undefined\), \.\.\.style \}\}/, ', undefined), ...style }}'),
  },
  {
    id: 'sort-pre-fix-width',
    what: '排序面板修前:寬寫死 30rem、沒有寬度參數也沒有視窗夾限',
    file: SORT,
    expectRed: ['sort-w-param', 'sort-w-floor', 'sort-w-max', 'sort-w-min', 'sort-w-375'],
    apply: (src) => replaceOnce(src, /style=\{\{ \.\.\.panelWidthStyle\(\{ width, minWidth, maxWidth \}, SORT_PANEL_FLOOR\), \.\.\.style \}\}/, 'style={style}'),
  },
  {
    id: 'filter-pre-fix-width',
    what: '篩選面板修前:只有預設 class 的 640 / 760(有視窗夾限),沒有寬度參數',
    file: FILTER,
    expectRed: ['filter-w-param', 'filter-w-nested-param', 'filter-w-floor', 'filter-w-max', 'filter-w-min'],
    apply: (src) => replaceOnce(src, /style=\{\{ \.\.\.panelWidthStyle\(\{ width, minWidth, maxWidth \}, widthFloor, .*?, \.\.\.style \}\}/, 'style={style}'),
  },
  {
    id: 'vis-pre-fix-width',
    what: '欄位顯示面板修前:只能撐滿外層,沒有寬度參數',
    file: VIS,
    expectRed: ['vis-w-param', 'vis-w-floor', 'vis-w-max', 'vis-w-min'],
    apply: (src) => replaceOnce(src, /style=\{\{ \.\.\.panelWidthStyle\(\{ width, minWidth, maxWidth \}, VISIBILITY_PANEL_FLOOR\), \.\.\.style \}\}/, 'style={style}'),
  },
  {
    id: 'popover-width-ignored',
    what: 'PopoverContent 不理 width 數字(修前:只能寫 className)',
    file: POPOVER,
    expectRed: ['popover-w-px'],
    // 2026-11-24 起 PopoverContent 的 style 是一個物件(高度上限 capHeight + width 數字那一段 + consumer style);拿掉 width 數字那一段
    apply: (src) => replaceOnce(src, /\.\.\.\(typeof width === "number" \? \{ width: `\$\{width\}px`, maxWidth: OVERLAY_VIEWPORT_MAX_WIDTH \} : null\),/, ''),
  },
  {
    id: 'popover-width-no-clamp',
    what: 'PopoverContent width 數字沒有視窗夾限',
    file: POPOVER,
    expectRed: ['popover-w-375'],
    apply: (src) => replaceOnce(src, /, maxWidth: OVERLAY_VIEWPORT_MAX_WIDTH \} : null\)/, ' } : null)'),
  },
  {
    id: 'popover-hug-ignored',
    what: 'PopoverContent width="hug" 不作用(停在預設 18rem,面板被外層裁掉)',
    file: POPOVER,
    expectRed: ['popover-w-hug'],
    apply: (src) => replaceOnce(src, /width === "hug" && "w-auto",/, 'false,'),
  },
]

const HARNESS = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle, PopoverBody, PopoverFooter } from '@/design-system/components/Popover/popover'
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
const NESTED_FILTER = { mode: 'nested', conjunction: 'and', children: [{ kind: 'group', id: 'g1', conjunction: 'or', children: [{ kind: 'cond', id: 'c2', field: 'category', op: 'is', value: ['Electronics'] }] }] }
const VIS_COLS = [
  { id: 'key', label: '鍵值' },
  { id: 'summary', label: '摘要' },
  { id: 'status', label: '狀態' },
  { id: 'dueDate', label: '到期日' },
  { id: 'updatedAt', label: '更新時間' },
]
// 產品預設:「更新時間」不顯示(沒寫 = 顯示)
const SAVED_VIS = { updatedAt: false }
// 欄位定義把「鍵值」寫在第二個(它是鎖定欄)
const VIS_COLS_KEY_SECOND = ${JSON.stringify(VIS_IDS_KEY_SECOND)}.map((id) => VIS_COLS.find((c) => c.id === id))
const VIS_SAVED_ORDER = ${JSON.stringify(VIS_SAVED_ORDER)}
const VIS_DRAGGED_ORDER = ${JSON.stringify(VIS_DRAGGED_ORDER)}
const VIS_SYSTEM_COL = ${JSON.stringify(VIS_SYSTEM_COL)}

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
  // ── 順序(2026-11-15 B12):order = consumer 的 columnOrder(沒寫 = columns 定義順序;onColumnOrderChange 一律接上 —— 兩個必填)──
  // 顯示與預設相同,只把「到期日」拖到「摘要」前面;沒傳 defaultColumnOrder → 預設 = columns 定義順序
  'vis-order-only':    { panel: 'vis', value: { updatedAt: false }, def: SAVED_VIS, locked: ['key'], order: VIS_DRAGGED_ORDER },
  // 顯示與順序都改過、產品存了 defaultColumnOrder;consumer 的 columnOrder 最前面還有一個面板沒列的選取欄
  'vis-order-default': { panel: 'vis', value: { updatedAt: true, dueDate: false }, def: SAVED_VIS, defOrder: [VIS_SYSTEM_COL, ...VIS_SAVED_ORDER], locked: ['key'],
    order: [VIS_SYSTEM_COL, 'key', 'updatedAt', 'summary', 'status', 'dueDate'] },
  // 欄位定義把鎖定欄寫在第二個;顯示與預設相同、順序被拖過
  'vis-order-locked':  { panel: 'vis', cols: VIS_COLS_KEY_SECOND, value: { updatedAt: false }, def: SAVED_VIS, locked: ['key'], order: VIS_DRAGGED_ORDER },
  // 只傳 defaultColumnOrder(不傳 defaultVisibility = 預設全部顯示):順序與預設相同、收起了「到期日」
  'vis-order-default-only': { panel: 'vis', value: { dueDate: false }, defOrder: VIS_SAVED_ORDER, locked: ['key'], order: VIS_SAVED_ORDER },
  // 拖過,但兩個預設都沒傳
  'vis-order-nodefault': { panel: 'vis', value: {}, locked: ['key'], order: VIS_DRAGGED_ORDER },
  // ── 固定零件(4b,2026-11-15)──
  // consumer 的 columnOrder 從 TanStack 的初始值 [] 開始(照 columns 列出、拖得動)
  'vis-order-empty': { panel: 'vis', value: SAVED_VIS, def: SAVED_VIS, locked: ['key'], order: [] },
  // consumer 的 columnOrder 只寫到兩欄(其餘照 columns 接在後面,照樣列出來)
  'vis-order-partial': { panel: 'vis', value: SAVED_VIS, def: SAVED_VIS, order: ['key', 'summary'] },
  // ── 寬度(6,2026-11-15 A19):w = 面板的寬度參數(數字 = px);pop = 外層 PopoverContent 的 width(不寫 = 'hug')──
  'sort-w-default': { panel: 'sort', value: [{ id: 'dueDate', desc: false }] },
  'sort-w-param':   { panel: 'sort', value: [{ id: 'dueDate', desc: false }], w: { width: 600 } },
  'sort-w-floor':   { panel: 'sort', value: [{ id: 'dueDate', desc: false }], w: { width: 200 } },
  'sort-w-max':     { panel: 'sort', value: [{ id: 'dueDate', desc: false }], w: { width: 700, maxWidth: 560 } },
  'sort-w-min':     { panel: 'sort', value: [{ id: 'dueDate', desc: false }], w: { minWidth: 560 } },
  'filter-w-default':        { panel: 'filter', value: MODIFIED_FILTER },
  'filter-w-nested-default': { panel: 'filter', value: NESTED_FILTER },
  'filter-w-param':          { panel: 'filter', value: MODIFIED_FILTER, w: { width: 720 } },
  'filter-w-nested-param':   { panel: 'filter', value: NESTED_FILTER, w: { width: 720 } },
  'filter-w-floor':          { panel: 'filter', value: MODIFIED_FILTER, w: { width: 300 } },
  'filter-w-max':            { panel: 'filter', value: MODIFIED_FILTER, w: { width: 800, maxWidth: 700 } },
  'filter-w-min':            { panel: 'filter', value: MODIFIED_FILTER, w: { minWidth: 700 } },
  'vis-w-default': { panel: 'vis', value: SAVED_VIS, def: SAVED_VIS },
  'vis-w-param':   { panel: 'vis', value: SAVED_VIS, def: SAVED_VIS, w: { width: 360 } },
  'vis-w-floor':   { panel: 'vis', value: SAVED_VIS, def: SAVED_VIS, w: { width: 120 } },
  'vis-w-max':     { panel: 'vis', value: SAVED_VIS, def: SAVED_VIS, w: { width: 400, maxWidth: 320 } },
  'vis-w-min':     { panel: 'vis', value: SAVED_VIS, def: SAVED_VIS, w: { minWidth: 320 } },
  'vis-w-wide':    { panel: 'vis', value: SAVED_VIS, def: SAVED_VIS, w: { width: 480 } },
  // 外層 PopoverContent 的 width 數字(裡面放一般的標題 / 內文 / 底部,不是表格面板)
  'pop-w-px':   { panel: 'plain', pop: 420 },
  'pop-w-wide': { panel: 'plain', pop: 900 },
}

function Panel({ scene }) {
  const s = SCENES[scene]
  const [value, setValue] = React.useState(s.value)
  // 欄位顯示面板:columnOrder + onColumnOrderChange 必填 → 一律接上(場景沒寫 = columns 定義順序)
  const [order, setOrder] = React.useState(s.order ?? (s.cols || VIS_COLS).map((c) => c.id))
  window.__value = () => JSON.stringify(value)
  window.__order = () => JSON.stringify(order)
  const extra = { ...(s.clearable === false ? { clearable: false } : {}), ...(s.w || {}) }
  if (s.panel === 'plain') {
    return (
      <>
        <PopoverHeader><PopoverTitle>欄位說明</PopoverTitle></PopoverHeader>
        <PopoverBody><p>「到期日」是這張工單最晚要交付的日期,過期會在列表標紅。</p></PopoverBody>
        <PopoverFooter><Button size="sm">知道了</Button></PopoverFooter>
      </>
    )
  }
  if (s.panel === 'vis') {
    return <DataTableColumnVisibilityPanel className="w-72" columns={s.cols || VIS_COLS} visibility={value} onVisibilityChange={setValue}
      columnOrder={order} onColumnOrderChange={setOrder} defaultVisibility={s.def} defaultColumnOrder={s.defOrder} lockedIds={s.locked} {...(s.w || {})} />
  }
  if (s.panel === 'sort') return <DataTableSortManager columns={SORT_COLS} sorting={value} onSortingChange={setValue} defaultSorting={s.def} labels={s.labels} {...extra} />
  return <DataTableFilterPanel columns={FILTER_COLS} value={value} onChange={setValue} defaultValue={s.def} maxConditions={s.maxConditions} {...extra} />
}

function App() {
  const [scene, setScene] = React.useState({ name: 'sort-modified', key: 0 })
  window.__setScene = (name) => setScene((s) => ({ name, key: s.key + 1 }))
  // 外層浮層跟內容(width="hug",2026-11-15 前寫 className="w-auto");寬度場景可給數字(pop)
  const pop = SCENES[scene.name].pop ?? 'hug'
  return (
    <TooltipProvider>
      <main data-scene={scene.name + ':' + scene.key} style={{ padding: 24 }}>
        <Popover key={scene.key} defaultOpen>
          <PopoverTrigger asChild><Button variant="secondary">開啟面板</Button></PopoverTrigger>
          <PopoverContent id="scene-host" align="start" width={pop} className="p-0"><Panel scene={scene.name} /></PopoverContent>
        </Popover>
      </main>
    </TooltipProvider>
  )
}
/**
 * 寬度量測(6):外層浮層 / 面板根元素 / 標題列 × 的左右緣與寬;fits = 面板裡每一個看得到的元素右緣離面板右緣多少(> 0 = 有東西凸出去,
 * 量 getBoundingClientRect —— 捲動容器不會把凸出去的盒子量小,M32)。視窗寬取 clientWidth(扣掉捲軸)。
 */
window.__probeWidth = () => {
  const host = document.getElementById('scene-host')
  if (!host) return null
  const r2 = (n) => Math.round(n * 100) / 100
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: r2(b.left), right: r2(b.right), width: r2(b.width) } }
  const panel = host.firstElementChild
  const pb = panel.getBoundingClientRect()
  let stickOut = 0
  for (const el of panel.querySelectorAll('*')) {
    const b = el.getBoundingClientRect()
    if (b.width < 2 || b.height < 2) continue
    stickOut = Math.max(stickOut, b.right - pb.right)
  }
  // 「會長的那一格」(下限就是為了守住它的最窄可用寬;按結構找,不靠字):欄位顯示 = 第一列的欄名(ItemLabel);
  // 排序 / 篩選 = 第一列(含兩個以上下拉的最小容器):兩個下拉 = 排序(第一個 = 欄位下拉)、三個 = 篩選(第三個 = 值欄)
  const label = host.querySelector('span[data-sidebar="menu-label"]')
  let flexCell = label ? label.getBoundingClientRect().width : null
  if (flexCell == null) {
    const first = host.querySelector('[role="combobox"]')
    let row = first
    while (row && row !== host && row.querySelectorAll('[role="combobox"]').length < 2) row = row.parentElement
    const combos = row && row !== host ? [...row.querySelectorAll('[role="combobox"]')] : []
    const cell = combos.length === 2 ? combos[0] : combos.length >= 3 ? combos[2] : null
    flexCell = cell ? cell.getBoundingClientRect().width : null
  }
  return {
    vw: document.documentElement.clientWidth,
    rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    host: box(host), panel: box(panel),
    dismiss: box(host.querySelector('[data-slot="surface-header"] button[data-dismiss]')),
    stickOut: r2(stickOut),
    flexCell: flexCell == null ? null : r2(flexCell),
  }
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
    // 欄位顯示面板:consumer 的 columnOrder、搜尋框在不在、每一列(由上到下)鎖了沒 / 有沒有拖曳把手 / 有沒有鎖頭
    order: window.__order ? window.__order() : null,
    search: Boolean(host.querySelector('input[aria-label="搜尋欄位"]')),
    rows: visRows().map((r) => ({ label: r.label, locked: r.locked, handle: Boolean(r.handle), lock: r.lock })),
  }
}
/**
 * 欄位顯示面板的每一列:從每一顆「隱藏此欄 / 顯示此欄」往上找,找到「只含這一顆」的最外層 = 那一列(按結構找,不靠 class)。
 * 鎖定欄 = 那顆鈕停用(元件:disabled={locked})。
 */
const VIS_TOGGLE = 'button[aria-label="隱藏此欄"], button[aria-label="顯示此欄"]'
function visRows() {
  const host = document.getElementById('scene-host')
  if (!host) return []
  return [...host.querySelectorAll(VIS_TOGGLE)].map((b) => {
    let row = b
    while (row.parentElement && row.parentElement !== host && row.parentElement.querySelectorAll(VIS_TOGGLE).length === 1) row = row.parentElement
    return {
      row,
      label: (row.textContent || '').trim(),
      locked: b.disabled,
      handle: row.querySelector('[aria-label="拖曳重排"]'),
      lock: [...row.querySelectorAll('svg')].some((s) => String(s.getAttribute('class') || '').includes('lucide-lock')),
    }
  })
}
/** 第一個沒鎖的欄位列的拖曳把手中心與列高(拖曳用);那一列沒有把手 = null(由呼叫端判紅) */
window.__visHandleBox = () => {
  const first = visRows().find((r) => !r.locked)
  if (!first || !first.handle) return null
  const h = first.handle.getBoundingClientRect()
  return { x: h.left + h.width / 2, y: h.top + h.height / 2, rowHeight: first.row.getBoundingClientRect().height, label: first.label }
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

  // ── 欄位顯示面板的順序(2026-11-15 B12):面板接了順序時「恢復預設」連順序一起還原 ──
  const panelOnly = (json) => (json ? JSON.stringify(JSON.parse(json).filter((id) => VIS_IDS.includes(id))) : null)
  const want = (ids) => JSON.stringify(ids)
  const orderOnly = await scene('vis-order-only')
  check('vis-order-only-shown', 'contract', '欄位顯示面板:顯示與預設相同、只拖過順序 → 標題列出現「恢復預設」', orderOnly.reset, orderOnly)
  // ── 固定零件(4b,2026-11-15):搜尋框 / 拖曳把手不靠參數 ──
  const unlocked = orderOnly.rows.filter((r) => !r.locked)
  const locked = orderOnly.rows.filter((r) => r.locked)
  check('vis-row-handles', 'contract', `欄位顯示面板:每一個沒鎖的欄位列都有拖曳把手(鍵值鎖定 → ${VIS_IDS.length - 1} 列)`,
    unlocked.length === VIS_IDS.length - 1 && unlocked.every((r) => r.handle), { rows: orderOnly.rows })
  check('vis-locked-no-handle', 'contract', '欄位顯示面板:鎖定欄沒有拖曳把手、有鎖頭', locked.length === 1 && locked.every((r) => !r.handle && r.lock), { rows: orderOnly.rows })
  check('vis-search-shown', 'contract', '欄位顯示面板:搜尋框恆在(沒有開關參數)', visModified.search && orderOnly.search, { modified: visModified.search, orderOnly: orderOnly.search })
  const orderPartial = await scene('vis-order-partial')
  check('vis-order-partial-listed', 'contract', `欄位顯示面板:consumer 的 columnOrder 只寫到 2 欄 → 面板照樣列出全部 ${VIS_IDS.length} 欄(沒寫到的照 columns 接在後面)`,
    orderPartial.rows.length === VIS_IDS.length, { rows: orderPartial.rows.map((r) => r.label) })
  await scene('vis-order-empty')
  const box = await page.evaluate(() => window.__visHandleBox())
  if (box) {
    // 指標拖曳:按下 → 移過門檻 → 移到下一列的位置 → 放開(同 drag-runtime-contract.mjs 的步法;每一步之間的短暫等待是讓 dnd-kit 感測器處理事件的互動節拍)
    await page.mouse.move(box.x, box.y)
    await page.mouse.down()
    for (const dy of [3, 10, 20, Math.round(box.rowHeight * 1.2)]) {
      await page.mouse.move(box.x, box.y + dy, { steps: 3 })
      await page.waitForTimeout(70)
    }
    await page.mouse.up()
    await d.settle()
  }
  const afterEmptyDrag = await probe()
  const emptyOrder = afterEmptyDrag.order ? JSON.parse(afterEmptyDrag.order) : []
  const emptyPanelOrder = emptyOrder.filter((id) => VIS_IDS.includes(id))
  check('vis-order-empty-drag', 'contract', '欄位顯示面板:consumer 的 columnOrder 從 [] 開始 → 拖第一個沒鎖的欄往下一列 → 順序改了(五欄都在、與 columns 順序不同)',
    Boolean(box) && emptyPanelOrder.length === VIS_IDS.length && JSON.stringify(emptyPanelOrder) !== JSON.stringify(VIS_IDS),
    { handle: Boolean(box), order: afterEmptyDrag.order })
  const orderNoDefault = await scene('vis-order-nodefault')
  check('vis-order-nodefault-hidden', 'contract', '欄位顯示面板(拖過):兩個預設都沒傳 → 不出現「恢復預設」', !orderNoDefault.reset, orderNoDefault)
  const orderDefaultOnly = await scene('vis-order-default-only')
  check('vis-order-default-only-shown', 'contract', '欄位顯示面板:只傳 defaultColumnOrder(預設全部顯示)、收起了一欄 → 標題列出現「恢復預設」', orderDefaultOnly.reset, orderDefaultOnly)

  await scene('vis-order-only')
  const pressedOrderOnly = await pressKey(resetBtn)
  const afterOrderOnly = await probe()
  check('vis-order-columns-click-order', 'contract', '欄位顯示面板:沒傳 defaultColumnOrder → 按「恢復預設」順序回到 columns 定義順序', pressedOrderOnly && afterOrderOnly.order === want(VIS_IDS),
    { pressed: pressedOrderOnly, order: afterOrderOnly.order, want: VIS_IDS })

  await scene('vis-order-default')
  const pressedOrder = await pressKey(resetBtn)
  const afterOrder = await probe()
  const savedFull = [VIS_SYSTEM_COL, ...VIS_SAVED_ORDER]
  check('vis-order-click-value', 'contract', '欄位顯示面板(顯示與順序都改過):按「恢復預設」→ 顯示 = defaultVisibility', pressedOrder && afterOrder.value === V.saved, { pressed: pressedOrder, value: afterOrder.value })
  check('vis-order-click-order', 'contract', '欄位顯示面板(顯示與順序都改過):按「恢復預設」→ 面板那幾欄的順序 = defaultColumnOrder', pressedOrder && panelOnly(afterOrder.order) === want(VIS_SAVED_ORDER),
    { pressed: pressedOrder, order: afterOrder.order, want: VIS_SAVED_ORDER })
  const orderAfter = afterOrder.order ? JSON.parse(afterOrder.order) : []
  check('vis-order-keeps-others', 'contract', `欄位顯示面板:按「恢復預設」→ consumer columnOrder 裡面板沒列的 ${VIS_SYSTEM_COL} 留在原位(第一個、只有一個)`,
    pressedOrder && orderAfter[0] === VIS_SYSTEM_COL && orderAfter.filter((id) => id === VIS_SYSTEM_COL).length === 1, { pressed: pressedOrder, order: afterOrder.order, want: savedFull })
  check('vis-order-click-focus', 'contract', '欄位顯示面板(顯示與順序都改過):按「恢復預設」→ 焦點落在標題列 ×(按鈕隨順序一起回到預設而消失)', pressedOrder && afterOrder.focus === 'dismiss', { pressed: pressedOrder, focus: afterOrder.focus })
  check('vis-order-click-announce', 'contract', `欄位顯示面板(顯示與順序都改過):按「恢復預設」→ polite 區域唸「${V.reset}」`, pressedOrder && afterOrder.live === V.reset, { pressed: pressedOrder, live: afterOrder.live })

  await scene('vis-order-locked')
  const pressedLocked = await pressKey(resetBtn)
  const afterLocked = await probe()
  check('vis-order-locked-first', 'contract', '欄位顯示面板:欄位定義把鎖定欄寫在第二個、沒傳 defaultColumnOrder → 按「恢復預設」鎖定欄排最前、其餘照 columns 順序',
    pressedLocked && afterLocked.order === want(VIS_LOCKED_FIRST_ORDER), { pressed: pressedLocked, order: afterLocked.order, want: VIS_LOCKED_FIRST_ORDER })

  await scene('vis-order-default-only')
  const pressedDefaultOnly = await pressKey(resetBtn)
  const afterDefaultOnly = await probe()
  check('vis-order-default-only-click', 'contract', '欄位顯示面板:只傳 defaultColumnOrder → 按「恢復預設」全部顯示、順序 = defaultColumnOrder',
    pressedDefaultOnly && afterDefaultOnly.value === '{}' && afterDefaultOnly.order === want(VIS_SAVED_ORDER), { pressed: pressedDefaultOnly, value: afterDefaultOnly.value, order: afterDefaultOnly.order })

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

  // ── 寬度(6,2026-11-15 A19):width / minWidth / maxWidth + 下限 + 視窗夾限;預設寬不變;PopoverContent width ──
  const widthScene = async (name) => {
    await scene(name)
    const p = await page.evaluate(() => window.__probeWidth())
    if (!p || !p.host || !p.panel) throw new InstrumentError(`寬度場景 ${name}:量不到外層浮層 / 面板根元素`)
    return p
  }
  const near = (a, b) => Math.abs(a - b) <= TOL
  // [場景, 契約列, 說明, 期望寬(根字級 px → px)];rem 的值跟著根字級算(預設 30rem / 下限 25rem 等都是 rem)
  const WIDTH_ROWS = [
    ['sort-w-default', '排序面板不傳寬度參數 → 預設 30rem(畫面不變)', (px) => 30 * px],
    ['sort-w-param', '排序面板 width={600} → 600', () => 600],
    ['sort-w-floor', '排序面板 width={200}(比下限窄)→ 照下限 25rem', (px) => 25 * px],
    ['sort-w-max', '排序面板 width={700} maxWidth={560} → 560', () => 560],
    ['sort-w-min', '排序面板只傳 minWidth={560} → 560(下限往上拉,預設 30rem 被撐開)', () => 560],
    ['filter-w-default', '篩選面板(平面)不傳寬度參數 → 預設 640(畫面不變)', () => 640],
    ['filter-w-nested-default', '篩選面板(巢狀)不傳寬度參數 → 預設 760(畫面不變)', () => 760],
    ['filter-w-param', '篩選面板(平面)width={720} → 720', () => 720],
    ['filter-w-nested-param', '篩選面板(巢狀)width={720} → 720 + 群組外框差額 120 = 840', () => 840],
    ['filter-w-floor', '篩選面板 width={300}(比下限窄)→ 照下限 35rem', (px) => 35 * px],
    ['filter-w-max', '篩選面板 width={800} maxWidth={700} → 700', () => 700],
    ['filter-w-min', '篩選面板只傳 minWidth={700} → 700', () => 700],
    ['vis-w-default', '欄位顯示面板不傳寬度參數 → 撐滿外層給的 w-72(18rem,畫面不變)', (px) => 18 * px],
    ['vis-w-param', '欄位顯示面板 width={360} → 360', () => 360],
    ['vis-w-floor', '欄位顯示面板 width={120}(比下限窄)→ 照下限 15.5rem', (px) => 15.5 * px],
    ['vis-w-max', '欄位顯示面板 width={400} maxWidth={320} → 320', () => 320],
    ['vis-w-min', '欄位顯示面板只傳 minWidth={320} → 320(外層給的 18rem 被撐開)', () => 320],
  ]
  for (const [id, title, want] of WIDTH_ROWS) {
    const p = await widthScene(id)
    const w = want(p.rootPx)
    check(id, 'contract', title, near(p.panel.width, w), { want: w, panel: p.panel.width, rootPx: p.rootPx })
    if (id.endsWith('-floor')) {
      // 下限的算式(各元件常數旁)= 固定零件 + 會長的那一格的最窄可用寬:排序的欄位下拉 / 欄位顯示的欄名 ≥ 10rem(同篩選面板的欄位下拉)、篩選的值欄 ≥ 7.5rem(同條件下拉)。
      // 只量「有沒有東西凸出去」不夠:排序列在 200px 時按鈕會被壓扁、欄位下拉縮到 0,卻沒有任何盒子越過面板右緣(2026-11-15 selftest 抓到)
      const cellMin = (id.startsWith('filter') ? 7.5 : 10) * p.rootPx
      const panelName = id.startsWith('sort') ? '排序面板' : id.startsWith('filter') ? '篩選面板' : '欄位顯示面板'
      const cellName = id.startsWith('sort') ? '欄位下拉' : id.startsWith('filter') ? '值欄' : '欄名'
      // 場景給的就有一列:找不到那一格 = 量具的結構定位對不到元件(不是產品裁決)
      if (p.flexCell == null) throw new InstrumentError(`寬度場景 ${id}:找不到${panelName}第一列的${cellName}`)
      check(`${id}-fits`, 'contract', `${panelName}在下限寬裡:${cellName} ≥ ${cellMin}(最窄可用寬,-1 容差)、沒有任何元素凸出面板右緣(> ${TOL})—— 列沒被擠壞 = 下限算得對`,
        p.flexCell != null && p.flexCell >= cellMin - 1 && p.stickOut <= TOL, { flexCell: p.flexCell, cellMin, stickOut: p.stickOut, panel: p.panel.width })
    }
    if (id === 'sort-w-param') {
      check('popover-w-hug', 'contract', 'PopoverContent width="hug" → 外層跟裡面的面板一樣寬(+ 左右各 1px 邊框)', near(p.host.width, p.panel.width + 2), { host: p.host.width, panel: p.panel.width })
    }
  }
  const pxScene = await widthScene('pop-w-px')
  check('popover-w-px', 'contract', 'PopoverContent width={420} → 外層 420', near(pxScene.host.width, 420), { host: pxScene.host.width })
  // 375px 寬(手機):外層浮層、面板、標題列 × 全在視窗內,寬不超過「視窗 − 2rem」(+ 外層左右邊框)
  await page.setViewportSize({ width: 375, height: 800 })
  try {
    for (const [sc, id, title] of [
      ['sort-w-default', 'sort-w-375', '375px 寬:排序面板(預設 30rem)整個在視窗內、× 看得到(修前右緣到 490)'],
      ['filter-w-nested-default', 'filter-w-375', '375px 寬:篩選面板(巢狀,下限 35rem + 120px)整個在視窗內 —— 下限讓位給視窗夾限'],
      ['vis-w-wide', 'vis-w-375', '375px 寬:欄位顯示面板 width={480} 整個在視窗內'],
      ['pop-w-wide', 'popover-w-375', '375px 寬:PopoverContent width={900} 整個在視窗內'],
    ]) {
      const p = await widthScene(sc)
      const inside = (b) => !b || (b.left >= -TOL && b.right <= p.vw + TOL)
      const ok = inside(p.host) && inside(p.panel) && inside(p.dismiss) && p.host.width <= p.vw - 2 * p.rootPx + 2 + TOL
      check(id, 'contract', title, ok, { vw: p.vw, host: p.host, panel: p.panel, dismiss: p.dismiss })
    }
  } finally {
    await page.setViewportSize(VIEWPORT)
  }
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
      console.log(`\n✗ 面板「恢復預設 / 清除全部」與寬度:${red.length} 條不符(${red.join(' / ')})—— SSOT data-table.spec.md L4「Header 恢復預設 / 清除全部」、「工具面板的寬度」`)
      process.exitCode = 1
    } else {
      console.log(`\n✓ 面板「恢復預設 / 清除全部」與寬度:${result.checks.length} 條全綠(含 ${result.checks.filter((c) => c.kind === 'control').length} 條對照)`)
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
    const RUN = MUTANTS.filter((m, i) => !SHARD || i % SHARD.n === SHARD.k)
    if (!RUN.length) throw new InstrumentError(`這一片沒有任何突變可跑(--shard=${SHARD.k}/${SHARD.n})—— 不得讀成通過`)
    for (const m of RUN) {
      const result = await runVariant(page, `突變 ${m.id}:${m.what}`, mutantFor(SOURCE_ROOT, m.file, m.apply))
      report(result)
      const red = redIds(result.checks)
      const want = [...m.expectRed].sort()
      const controlRed = result.checks.filter((c) => c.kind === 'control' && !c.pass).map((c) => c.id)
      if (controlRed.length) problems.push(`${m.id}:對照列 ${controlRed.join(' / ')} 紅了 —— 突變弄壞的是量具,不是契約`)
      if (JSON.stringify(red) !== JSON.stringify(want)) problems.push(`${m.id}:紅的是 [${red.join(', ')}],應剛好是 [${want.join(', ')}]`)
      for (const id of red) covered.add(id)
    }
    // 靜態覆蓋:每一條契約列都要有突變宣告會讓它紅(分片時各片只看得到自己那幾個突變,動態覆蓋要所有片合起來才完整)
    const claimed = new Set(MUTANTS.flatMap((m) => m.expectRed))
    const unclaimed = contractIds.filter((id) => !claimed.has(id))
    if (unclaimed.length) problems.push(`契約列 ${unclaimed.join(' / ')} 不在任何突變的 expectRed —— 它的綠燈是零證據`)
    const phantom = [...claimed].filter((id) => !contractIds.includes(id))
    if (phantom.length) problems.push(`突變的 expectRed 寫了不是契約列的 ${phantom.join(' / ')}`)
    const uncovered = contractIds.filter((id) => !covered.has(id))
    if (!SHARD && uncovered.length) problems.push(`契約列 ${uncovered.join(' / ')} 沒有任何突變能讓它紅 —— 它的綠燈是零證據`)
    if (problems.length) {
      console.log('\n✗ selftest:量具不可信 ——')
      for (const p of problems) console.log(`  - ${p}`)
      process.exitCode = 1
    } else {
      console.log(SHARD
        ? `\n✓ selftest 第 ${SHARD.k + 1} / ${SHARD.n} 片:${RUN.length} 個根因突變各自剛好紅了該紅的列,對照列全程綠(全部 ${MUTANTS.length} 個突變的 expectRed 涵蓋契約 ${contractIds.length} 條;其餘片在 CI 同一個 matrix 的另一格跑)`
        : `\n✓ selftest:${MUTANTS.length} 個根因突變各自剛好紅了該紅的列(契約 ${contractIds.length} 條全被覆蓋),對照列全程綠 —— 量具會紅`)
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
