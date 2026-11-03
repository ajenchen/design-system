#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 欄位的彈出層(Select / 可搜尋的 Select / Combobox 兩種搜尋位置 / PeoplePicker 單選與多選 / DatePicker / TimePicker / DropdownMenu)
 *        放在**另一個浮層裡**(Popover 面板、Dialog、Sheet;DataTable 的排序面板與篩選面板)時,「點外面關閉」照樣成立 ——
 *        開著時點面板空白處 → 它關、面板不關;開著時點同一個面板裡的另一個欄位 → 它關、**同一下就打開那一個**(SelectMenu 家族:畫面上剛好 1 個,
 *        而且是那個欄位的);`Esc` 一次只關一層(先關彈出層、再關面板)。屬於這個欄位自己的零件(Combobox「+N」浮出清單)不算外面:
 *        按卡片、按卡片裡的 × 選單照開;**另一個**欄位的「+N」卡是外面。InlineEdit 放在浮層裡時,點浮層空白處 / Tab 到浮層裡的下一格 = 離開 → 回到檢視。
 *        並存對話框(`persistentElements`)portal 進另一個 dialog 裡時,點外層 dialog = 點外面(外層是宿主,不是疊在上面的確認框)。
 *        規則:`patterns/overlay-surface/overlay-surface.spec.md`「Esc / 點外面關閉:Radix 處理」、`ds-canonical/references/keyboard-model-canonical.md`
 *        「`Esc` 一次只關最內層」(浮層疊浮層「一層一層關」)、`components/SelectMenu/select-menu.spec.md`「+N」那一列與「指標按在觸發欄位上不算按在外面」、
 *        `components/InlineEdit/inline-edit.spec.md`「滑鼠 blur(點外面)→ commit」、`components/Dialog/dialog.spec.md`「框外事件的守衛」(3)。
 *   紅: 任一列不符 → 逐列點名 exit 1。`--selftest` 在 DS 原始碼上各造回一個根因突變(MUTANTS),每個突變必須**剛好**紅它負責的那幾列,
 *        契約列每一條都要被某個突變弄紅過。`--root=<修改前的整棵原始碼>` = 天然對照組(108a736f 基準樹:Popover 面板裡 SelectMenu 家族六種欄位的
 *        D-*-blank / D-*-next、排序 / 篩選面板四列、InlineEdit 六列、K-foreign-card、C-nested-host-blank 紅,其餘綠;9e936942(第一版)只紅 K-foreign-card 與 C 列)。
 *   綠: 現行原始碼每列都量到且符合;對照列(Dialog / Sheet 裡每一種欄位的點空白、Popover 裡的 DatePicker / TimePicker / DropdownMenu、每一種欄位的 Esc 一層一層關、
 *        疊在上面的確認框)在現行原始碼與每個突變上都綠 —— 證明量具看得到「關閉」,紅燈不是量具壞了。harness 載不起來 / 元素找不到或被蓋住 / 等不到靜止
 *        = 儀器失效(INSTRUMENT-FAIL,exit 1),不得讀成通過(M37:沒量到 ≠ 沒發生)。
 *   註: 2026-11-03 新增(user 2026-10-30 第十五輪:篩選 / 排序面板的欄位選單點外不關、可同時開好幾個)。根因在 SelectMenu 的 `onInteractOutside`:
 *        為了「+N」浮出清單(欄位自己掛在另一個 portal 的零件),把「按在**任何一個** Radix popper 殼裡」都當成不是外面 —— 而裝著這個欄位的
 *        Popover 面板自己也是一個 popper 殼,於是點面板空白、點面板裡的下一格,都被當成「按在自己身上」。InlineEdit 的點外判定同一個形狀
 *        (任何 popper / listbox / dialog = 本 edit 開的浮層 —— 連裝著它的 Dialog 也算);並存對話框的守衛 (3) 也是(自己以外的任何一個 dialog)。
 *        判準收成一支:`lib/composite-field-focus.ts` `useOwnTreeEvents` —— 以**元件樹**認(這一下事件有沒有經過這個元件,含 portal 出去的零件;
 *        同 Radix DismissableLayer 判斷「按在這一層裡」)。同日第一版是「按在不裝著這個欄位的那一層上」,另一個欄位的「+N」卡被算成自己的(獨立審查實測,K-foreign-card)。
 *
 * ── 判定表(列名 = <種類>-<宿主>-<欄位>-<動作>)──
 *   D-<宿主>-<欄位>-blank  開欄位的彈出層 → 點宿主空白處(標題列文字)→ 彈出層關、宿主不關
 *   D-<宿主>-<欄位>-next   開欄位的彈出層 → 點同一個宿主裡的另一個 Select(在它上方,不被蓋住)→ 前一個關、宿主不關;SelectMenu 家族另要求
 *                          畫面上剛好 1 個、而且是欄位乙的(觸發欄位 `aria-controls` 指的那一個)= 一下就打開,不用點兩次。
 *                          DatePicker / TimePicker / DropdownMenu 只驗「前一個關、≤ 1」:那三種不經 SelectMenu,「點下一格一下打開」不是本閘的契約(讀數照記)。
 *   E-popover-<欄位>-esc   開欄位的彈出層 → Esc → 彈出層關、宿主不關 → Esc → 宿主關(對照:keyboard-model-canonical「每按一次少一層」)
 *   P-sort-blank / P-sort-next     DataTable 排序面板(Popover):第 1 列的欄位選單開著 → 點面板標題 / 點同一列的方向選單(一下打開、剛好 1 個)
 *   P-filter-blank / P-filter-next DataTable 篩選面板(Popover):第 1 列的欄位選單開著 → 點面板標題 / 點同一列的運算子選單(同上)
 *   K-plusn-card / K-plusn-remove  Popover 裡的 Combobox(窄欄位四個 Tag)選單開著 → 按「+N」浮出清單的卡片本身 / 卡片裡的 × → 選單照開(後者那一項移除)
 *   K-foreign-card         同一個 Popover 裡兩個窄 Combobox:欄位甲選單開著 → 滑到欄位乙的「+N」、按欄位乙卡片本身 → 欄位甲的選單關(別人的零件 = 外面)
 *   I-<宿主>-blank         InlineEdit(編輯控件 = Select、進編輯即開選單,inline-edit.stories.tsx 同一個寫法)→ 點宿主空白處 → 選單關、回檢視(指標那條路)
 *   I-<宿主>-tab           InlineEdit(編輯控件 = Select、不開選單)→ 焦點在編輯控件 → Tab → 焦點到宿主裡的下一格、回檢視、宿主不關(鍵盤 focusout 那條路)
 *   C-nested-host-blank    Dialog 裡放一個並存對話框(persistentElements,portalContainer 指到外層 dialog 裡的容器)→ 點外層 dialog 的空白 → 並存對話框關、外層不關
 *   C-stacked-confirm      [對照] 同一個並存對話框開著 → 從它裡面開一個一般確認框(疊在上面,portal 到 body)→ 並存對話框照開(守衛 (3) 本來的用途)
 *   宿主:popover / dialog / sheet。欄位:select / select-search / combobox / combobox-trigger / people-single / people-multi / date / time / menu。
 *
 * ── 突變 → 該紅的列(--selftest;MUTANTS 是單一來源,個數不抄進註解)──
 *   見下方 MUTANTS 的 what / expectRed。分兩類:SelectMenu 的點外判斷(修前 / 第一版 / 不認自己的零件 / 吞掉下一格的那一下)、
 *   InlineEdit 的兩條結算路(指標 / focusout 各一個,各自只紅自己那三列 —— 不再一起打回)、並存守衛 (3)。
 *
 * 用法:
 *   node scripts/overlay-nested-dismiss-invariant.mjs                判定(現行原始碼)
 *   node scripts/overlay-nested-dismiss-invariant.mjs --selftest     對照組(全部單一根因突變;基準 = 一趟完整判定)
 *   node scripts/overlay-nested-dismiss-invariant.mjs --selftest --shard=<k>/<n>   只跑第 k 片突變(CI matrix 平行;覆蓋率靜態驗)
 *   node scripts/overlay-nested-dismiss-invariant.mjs --selftest --lanes=<n>       突變分 n 條 lane 並行(每條一個瀏覽器;預設 2)
 *   node scripts/overlay-nested-dismiss-invariant.mjs --selftest --only=<id>[,<id>]  除錯:只跑這幾個突變(不算 selftest 通過)
 *   node scripts/overlay-nested-dismiss-invariant.mjs --root=<dir>   改量另一棵原始碼(例:git archive 出來的修改前基準樹)
 */
import {
  INSTRUMENT_FAIL_MARKER,
  launchBrowserOrSkip,
  ownSurfacePosition,
  parkPointer,
} from './lib/launch-browser.mjs'
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
/** 「應該關掉」的列最多等多久(關了就提早往下;見 runChecks 的 closedWithin) */
const CLOSE_GRACE_MS = 3000
const SOURCE_ROOT = resolveSourceRoot()
/** `--lanes=<n>`(selftest):突變分 n 條 lane 並行,每條一個瀏覽器(同 escape-and-focus-contract-invariant.mjs)。判定只跑一趟,不受影響。 */
const LANES = Math.max(1, Number(process.argv.find((a) => a.startsWith('--lanes='))?.slice('--lanes='.length) ?? 2) || 2)
/** 除錯用:`--only=<突變 id>[,<id>…]` 只跑這幾個突變(不檢查覆蓋率 —— 這一趟不算 selftest 通過,結尾會明說) */
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean) ?? null
/**
 * `--shard=<k>/<n>`(selftest):只跑 MUTANTS 裡索引 % n === k 的那一片(基準照跑 = 每一片都是一趟完整判定)。CI 把對照組拆成 n 片平行跑
 * (ci.yml verify-browser-nested-dismiss 的 matrix;同 escape-and-focus-contract-invariant.mjs):各片各自驗「每個突變剛好紅它的 expectRed」;
 * 覆蓋率改成靜態驗 —— 每一條契約列都必須出現在某個突變的 expectRed。不給 = 一片跑全部(本機 `npm run test:overlay-nested-dismiss`、meta-test)。
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

const HOSTS = ['popover', 'dialog', 'sheet']
/** SelectMenu 家族(Select / Combobox / PeoplePicker 都經 SelectMenu)—— 修前在 Popover 裡紅的就是這六種 */
const SELECT_MENU_FAMILY = ['select', 'select-search', 'combobox', 'combobox-trigger', 'people-single', 'people-multi']
const CONTROLS = [...SELECT_MENU_FAMILY, 'date', 'time', 'menu']

/** 修前 InlineEdit 兩條結算路共用的「任何一層浮層」選擇器(突變用,原樣重放) */
const OLD_EDIT_OVERLAY = `'[data-radix-popper-content-wrapper],[data-radix-select-viewport],[role="listbox"],[role="dialog"]'`
const SELECT_MENU_OWN = /ownTree\.owns\(e\.detail\.originalEvent\)/

const MUTANTS = [
  {
    id: 'selectmenu-any-popper',
    what: 'SelectMenu 把「按在任何一個 Radix popper 殼裡」都當成不是外面(2026-05-07 → 2026-11-03 的寫法;裝著欄位的 Popover 面板也是 popper 殼)',
    file: 'components/SelectMenu/select-menu.tsx',
    expectRed: [
      ...SELECT_MENU_FAMILY.flatMap((c) => [`D-popover-${c}-blank`, `D-popover-${c}-next`]),
      'P-sort-blank', 'P-sort-next', 'P-filter-blank', 'P-filter-next', 'K-foreign-card',
    ],
    apply: (src) => replaceOnce(src, SELECT_MENU_OWN, "!!(e.detail.originalEvent.target as Element | null)?.closest?.('[data-radix-popper-content-wrapper]')"),
  },
  {
    id: 'selectmenu-detached-layer',
    what: 'SelectMenu 把「按在不裝著這個欄位的那一層」當成欄位自己的零件(2026-11-03 第一版 isOnDetachedLayer;同一個面板裡另一個欄位的「+N」卡也算)',
    file: 'components/SelectMenu/select-menu.tsx',
    expectRed: ['K-foreign-card'],
    apply: (src) => replaceOnce(src, SELECT_MENU_OWN,
      "((t, f) => { const sel = '[data-radix-popper-content-wrapper]'; let l = t instanceof Element ? t.closest(sel) : null; if (!l) return false; " +
      'for (; l; l = l.parentElement?.closest(sel) ?? null) if (f && l.contains(f)) return false; return true })(e.detail.originalEvent.target, popupKeys.triggerRef.current)'),
  },
  {
    id: 'selectmenu-no-own-tree',
    what: 'SelectMenu 不認「欄位自己掛在另一個 portal 的零件」(+N 浮出清單),只留指標按在觸發欄位上那一條',
    file: 'components/SelectMenu/select-menu.tsx',
    expectRed: ['K-plusn-card', 'K-plusn-remove'],
    apply: (src) => replaceOnce(src, SELECT_MENU_OWN, 'false'),
  },
  {
    id: 'selectmenu-swallow-next-click',
    what: 'SelectMenu 點外關閉時把緊接著的那一下 click 吞掉(前一個關、下一格要再點一次才開 —— 本閘「一下就打開」那一半要抓的形狀)',
    file: 'components/SelectMenu/select-menu.tsx',
    expectRed: [
      ...HOSTS.flatMap((h) => SELECT_MENU_FAMILY.map((c) => `D-${h}-${c}-next`)),
      'P-sort-next', 'P-filter-next',
    ],
    apply: (src) => replaceOnce(src, /(\n {10}if \(ownTree\.owns\(e\.detail\.originalEvent\) \|\| isPointerOnTrigger\(e\.detail\.originalEvent, popupKeys\.triggerRef\.current\)\) \{\n {12}e\.preventDefault\(\)\n {10}\})/,
      "$1 else if (e.detail.originalEvent.type === 'pointerdown') {\n            document.addEventListener('click', (c) => { c.stopPropagation(); c.preventDefault() }, { capture: true, once: true })\n          }"),
  },
  {
    id: 'inline-edit-pointer-any-overlay',
    what: 'InlineEdit 指標那條路把任何 popper / listbox / dialog 都當成本 edit 開的浮層(修前的寫法;裝著它的 Dialog / Popover 也算)—— focusout 那條不動',
    file: 'components/InlineEdit/inline-edit.tsx',
    expectRed: ['I-popover-blank', 'I-dialog-blank', 'I-sheet-blank'],
    apply: (src) => replaceOnce(src, /window\.setTimeout\(\(\) => \{ if \(!finalizedRef\.current && !ownTree\.owns\(e\)\) commit\(false\) \}, 0\)/,
      `if (target.closest(${OLD_EDIT_OVERLAY})) return\n      commit(false)`),
  },
  {
    id: 'inline-edit-focus-any-overlay',
    what: 'InlineEdit focusout 那條路把任何 popper / listbox / dialog 都當成本 edit 開的浮層(修前的寫法)—— 指標那條不動',
    file: 'components/InlineEdit/inline-edit.tsx',
    expectRed: ['I-popover-tab', 'I-dialog-tab', 'I-sheet-tab'],
    apply: (src) => replaceOnce(src, /if \(ownTree\.focusInside\(\)\) return/, `if (active && active.closest(${OLD_EDIT_OVERLAY})) return`),
  },
  {
    id: 'coexist-any-dialog',
    what: '並存對話框的守衛 (3) 把「自己以外的任何一個 dialog」都當成疊在上面的確認框(修前的寫法;裝著它的外層 dialog 也算)',
    file: 'lib/overlay-coexistence.ts',
    expectRed: ['C-nested-host-blank'],
    apply: (src) => replaceOnce(src, /return !!other && other !== self && !\(self && other\.contains\(self\)\)/, 'return !!other && other !== self'),
  },
]

const HARNESS = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/design-system/components/Tooltip/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/design-system/components/Dialog/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody } from '@/design-system/components/Sheet/sheet'
import { Popover, PopoverTrigger, PopoverContent } from '@/design-system/components/Popover/popover'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/design-system/components/DropdownMenu/dropdown-menu'
import { Button } from '@/design-system/components/Button/button'
import { Select } from '@/design-system/components/Select/select'
import { Combobox } from '@/design-system/components/Combobox/combobox'
import { PeoplePicker } from '@/design-system/components/PeoplePicker/people-picker'
import { DatePicker } from '@/design-system/components/DatePicker/date-picker'
import { TimePicker } from '@/design-system/components/TimePicker/time-picker'
import { InlineEdit } from '@/design-system/components/InlineEdit/inline-edit'
import { DataTableSortManager } from '@/design-system/components/DataTable/data-table-sort-manager'
import { DataTableFilterPanel } from '@/design-system/components/DataTable/data-table-filter-panel'

const STATUS = [{ value: 'todo', label: '待處理' }, { value: 'doing', label: '進行中' }, { value: 'review', label: '審查中' }, { value: 'done', label: '已完成' }]
const LABELS = [{ value: 'bug', label: 'Bug' }, { value: 'ux', label: '使用者體驗' }, { value: 'perf', label: '效能' }, { value: 'docs', label: '文件' }]
const PEOPLE = ['王小明', '林美玲', '陳志強', '張雅婷']

function Field({ ctl }) {
  const [v, setV] = React.useState(null)
  const [vs, setVs] = React.useState([])
  const [people, setPeople] = React.useState([])
  switch (ctl) {
    case 'select': return <Select aria-label="欄位甲" options={STATUS} value={v} onChange={setV} />
    case 'select-search': return <Select aria-label="欄位甲" searchable options={STATUS} value={v} onChange={setV} />
    case 'combobox': return <Combobox aria-label="欄位甲" options={LABELS} value={vs} onChange={setVs} />
    case 'combobox-trigger': return <Combobox aria-label="欄位甲" searchable searchIn="trigger" options={LABELS} value={vs} onChange={setVs} />
    case 'people-single': return <PeoplePicker aria-label="欄位甲" people={PEOPLE} value={people[0] ?? null} onChange={setPeople} />
    case 'people-multi': return <PeoplePicker aria-label="欄位甲" people={PEOPLE} value={people} onChange={setPeople} />
    case 'date': return <DatePicker aria-label="欄位甲" value={v} onChange={setV} />
    case 'time': return <TimePicker aria-label="欄位甲" value={v} onChange={setV} />
    case 'menu': return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button aria-label="欄位甲" variant="secondary">更多動作</Button></DropdownMenuTrigger>
        <DropdownMenuContent><DropdownMenuItem>重新命名</DropdownMenuItem><DropdownMenuItem>封存</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
    )
    case 'plusn': return <NarrowTags name="欄位甲" />
    // 編輯中 = [data-editing="true"](檢視態那一層也帶 data-editing="false",只認屬性存在會永遠讀成編輯中)
    // InlineEdit 換成 Select(inline-edit.stories.tsx「狀態」那一則同一個寫法:進編輯立刻開選單、選完即結算;不選直接點外面由 InlineEdit 保證回檢視)
    case 'inline': return (
      <InlineEdit label="狀態" value={v ?? 'todo'} onCommit={setV}
        renderRead={(x) => <Select mode="view" display="tag" value={x} options={STATUS} />}
        renderEdit={(p) => <Select autoFocus display="tag" value={p.value} options={STATUS} defaultOpen onChange={(next) => { p.onChange(next); p.commit() }} />} />
    )
    // 同一個 InlineEdit、編輯控件不開選單:焦點在編輯控件上按 Tab = 鍵盤 focusout 那條路(I-*-tab)
    case 'inline-tab': return (
      <InlineEdit label="狀態" value={v ?? 'todo'} onCommit={setV}
        renderRead={(x) => <Select mode="view" display="tag" value={x} options={STATUS} />}
        renderEdit={(p) => <Select autoFocus display="tag" value={p.value} options={STATUS} onChange={(next) => { p.onChange(next); p.commit() }} />} />
    )
    default: throw new Error('未知欄位 ' + ctl)
  }
}

/** 窄欄位四個 Tag → 出現「+N」(K 列;兩個欄位各一個,K-foreign-card 量「別人的 +N 卡」) */
function NarrowTags({ name }) {
  const [vs, setVs] = React.useState(['bug', 'ux', 'perf', 'docs'])
  return <div style={{ width: 220 }}><Combobox aria-label={name} options={LABELS} value={vs} onChange={setVs} /></div>
}

function Body({ ctl }) {
  const [b, setB] = React.useState(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 320 }}>
      <p data-blank style={{ margin: 0, padding: '4px 0' }}>任務設定</p>
      <div data-field="b">{ctl === 'plusn' ? <NarrowTags name="欄位乙" /> : <Select aria-label="欄位乙" options={STATUS} value={b} onChange={setB} />}</div>
      <div data-field="a"><Field ctl={ctl} /></div>
      {ctl === 'inline-tab' ? <Button data-next variant="secondary">下一格</Button> : null}
    </div>
  )
}

const SORT_COLS = [
  { accessorKey: 'sku', header: 'SKU', meta: { type: 'string' } },
  { accessorKey: 'name', header: '名稱', meta: { type: 'string' } },
  { accessorKey: 'qty', header: '數量', meta: { type: 'number' } },
]
const FILTER_COLS = [
  { accessorKey: 'name', header: '名稱', meta: { type: 'string', filterable: true } },
  { accessorKey: 'category', header: '類別', meta: { type: 'select', filterable: true, options: [{ value: 'Electronics', label: 'Electronics' }, { value: 'Furniture', label: 'Furniture' }] } },
]
function SortPanel() {
  const [sorting, setSorting] = React.useState([{ id: 'sku', desc: false }, { id: 'qty', desc: true }])
  return <DataTableSortManager columns={SORT_COLS} sorting={sorting} onSortingChange={setSorting} />
}
function FilterPanel() {
  const [tree, setTree] = React.useState({ mode: 'flat', conjunction: 'and', children: [
    { kind: 'cond', id: 'c1', field: 'name', op: 'contains', value: 'phone' },
    { kind: 'cond', id: 'c2', field: 'category', op: 'is', value: ['Electronics'] },
  ] })
  return <DataTableFilterPanel columns={FILTER_COLS} value={tree} onChange={setTree} />
}

/**
 * 並存對話框 portal 進外層 dialog 裡的容器(Dialog 的 portalContainer + persistentElements;dialog.spec.md「並存」)。
 * 外層 dialog 是宿主:點它的空白 = 點並存對話框的外面。從並存對話框裡開的一般確認框疊在上面(portal 到 body)= 守衛 (3) 本來的用途。
 */
function Coexist() {
  const [open, setOpen] = React.useState(false)
  const [confirm, setConfirm] = React.useState(false)
  const [stage, setStage] = React.useState(null)
  const keepRef = React.useRef(null)
  const keep = React.useCallback(() => [keepRef.current].filter(Boolean), [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 440, minHeight: 420 }}>
      <p data-blank style={{ margin: 0, padding: '4px 0' }}>任務設定</p>
      <div data-keep ref={keepRef} style={{ padding: 8 }}>常駐區:負責人 王小明</div>
      <div><Button data-open-inner variant="secondary" onClick={() => setOpen(true)}>開啟並存對話框</Button></div>
      <div data-stage ref={setStage} />
      <Dialog open={open} onOpenChange={setOpen} persistentElements={keep}>
        <DialogContent id="coexist-inner" maxWidth={260} height="hug" portalContainer={stage}>
          <DialogHeader><DialogTitle>封存任務</DialogTitle></DialogHeader>
          <DialogBody><Button data-open-confirm variant="secondary" onClick={() => setConfirm(true)}>刪除</Button></DialogBody>
        </DialogContent>
      </Dialog>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent id="coexist-confirm" maxWidth={320} height="hug">
          <DialogHeader><DialogTitle>確認刪除</DialogTitle></DialogHeader>
          <DialogBody><p data-confirm-blank style={{ margin: 0 }}>刪除後無法復原</p></DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Host({ host, children }) {
  const [open, setOpen] = React.useState(false)
  window.__closeScene = () => setOpen(false)
  if (host === 'popover') return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button data-open variant="secondary">開啟面板</Button></PopoverTrigger>
      <PopoverContent id="scene-host" align="start" className="w-auto p-0" aria-label="面板">
        <div style={{ padding: 16 }}>{children}</div>
      </PopoverContent>
    </Popover>
  )
  if (host === 'panel') return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button data-open variant="secondary">開啟面板</Button></PopoverTrigger>
      <PopoverContent id="scene-host" align="start" className="w-auto p-0">{children}</PopoverContent>
    </Popover>
  )
  if (host === 'dialog') return (
    <>
      <Button data-open variant="secondary" onClick={() => setOpen(true)}>開啟對話框</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent id="scene-host" height="hug" maxWidth={480}>
          <DialogHeader><DialogTitle>編輯任務</DialogTitle></DialogHeader>
          <DialogBody>{children}</DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
  return (
    <>
      <Button data-open variant="secondary" onClick={() => setOpen(true)}>開啟側板</Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent id="scene-host" side="right">
          <SheetHeader><SheetTitle>編輯任務</SheetTitle></SheetHeader>
          <SheetBody>{children}</SheetBody>
        </SheetContent>
      </Sheet>
    </>
  )
}

function App() {
  const [scene, setScene] = React.useState({ host: 'popover', ctl: 'select', key: 0 })
  window.__setScene = (host, ctl) => setScene((s) => ({ host, ctl, key: s.key + 1 }))
  const body = scene.ctl === 'sort' ? <SortPanel /> : scene.ctl === 'filter' ? <FilterPanel /> : scene.ctl === 'coexist' ? <Coexist /> : <Body ctl={scene.ctl} />
  return (
    <TooltipProvider>
      <main data-scene={scene.host + ':' + scene.ctl + ':' + scene.key} style={{ padding: 24 }}>
        <Host key={scene.key} host={scene.host}>{body}</Host>
      </main>
    </TooltipProvider>
  )
}
// 頁面端量具(node 端只經 window.__openLayers / window.__hostOpen 讀):畫面上開著的「另一層」= 不是宿主自己、不是 Tooltip、沒在收起、量得到大小
window.__openLayers = () => {
  const host = document.getElementById('scene-host')
  return [...document.querySelectorAll('[data-radix-popper-content-wrapper]')].filter((w) => {
    if (host && w.contains(host)) return false
    if (w.querySelector('[role="tooltip"]')) return false
    const c = w.firstElementChild
    if (!c || c.getAttribute('data-state') === 'closed') return false
    const r = c.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }).map((w) => {
    const c = w.firstElementChild
    if (!c.id) c.id = 'layer-' + Math.random().toString(36).slice(2)
    return c.id
  })
}
/** 某個 dialog 內容此刻是否開著(並存對話框 / 確認框用 id 找) */
window.__dialogOpen = (id) => {
  const el = document.getElementById(id)
  if (!el || el.getAttribute('data-state') === 'closed') return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}
window.__hostOpen = () => {
  const host = document.getElementById('scene-host')
  if (!host || host.getAttribute('data-state') === 'closed') return false
  const r = host.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}
createRoot(document.getElementById('root')).render(<App />)
`

async function runChecks(page) {
  const d = makeDriver(page)
  const checks = []
  const check = (id, kind, title, pass, detail) => checks.push({ id, kind, title, pass: !!pass, detail })
  /** 等頁面端條件成立(函式 + 參數,不組字串);等不到 = 儀器失效 */
  const waitIn = async (fn, arg, label) => {
    await page.waitForFunction(fn, arg, { timeout: WAIT_CAP_MS }).catch(() => { throw new InstrumentError(`${WAIT_CAP_MS}ms 內等不到:${label}`) })
    await d.settle()
  }
  const layers = () => page.evaluate(() => window.__openLayers())
  const hostOpen = () => page.evaluate(() => window.__hostOpen())
  const sceneOf = async (host, ctl) => {
    await page.evaluate(([h, c]) => window.__setScene(h, c), [host, ctl])
    await waitIn(([h, c]) => !!document.querySelector(`main[data-scene^="${h}:${c}:"] [data-open]`), [host, ctl], `場景 ${host}:${ctl} 沒有渲染`)
    await d.click('[data-open]')
    await d.waitFor(() => window.__hostOpen(), `${host} 宿主沒有打開`)
    await parkPointer(page)
    await d.settle()
  }
  /**
   * 用真滑鼠按一個元素。交給 Playwright 的可操作性檢查(看得見、連續兩格不動、按下那一點確實落在它身上),而不是自己先算座標再點 ——
   * 浮層剛打開時 floating-ui 還在定位,先算好的座標可能已經過期。被別的層蓋住 = 儀器失效,不是產品裁決。
   */
  const pressOn = async (selector, label, { own = false } = {}) => {
    const handle = await page.waitForSelector(selector, { timeout: WAIT_CAP_MS, state: 'visible' }).catch(() => null)
    if (!handle) throw new InstrumentError(`找不到 ${label}(${selector})`)
    let position
    if (own) {
      const at = await ownSurfacePosition(handle)
      if (!at.ok) throw new InstrumentError(`${label} 找不到自己的表面:${at.why}`)
      position = at.position
    } else {
      const box = await handle.boundingBox()
      if (!box) throw new InstrumentError(`${label} 量不到位置`)
      position = { x: Math.min(box.width / 2, 24), y: box.height / 2 }
    }
    await handle.click({ position, timeout: WAIT_CAP_MS }).catch(async (error) => {
      if (!(error && error.name === 'TimeoutError')) throw error
      const top = await handle.evaluate((el, pos) => {
        const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + pos.x, r.top + pos.y)
        return t ? `${t.tagName.toLowerCase()}[${t.getAttribute('role') ?? ''}]` : null
      }, position).catch(() => null)
      throw new InstrumentError(`${label} 點不到(按下那一點是 ${top})—— 版面要讓它露出來`)
    })
    await d.settle()
    await d.focusStable()
  }
  /** 等「開著的另一層」變成 n 個;等不到回 false(由呼叫端決定是儀器失效還是判紅) */
  const layersBecome = (n) => page.waitForFunction((k) => window.__openLayers().length === k, n, { timeout: WAIT_CAP_MS }).then(() => true, () => false)
  /**
   * 「應該關掉」的列:給它 CLOSE_GRACE_MS 關,關了就提早往下(不是固定睡眠;慢機器上關得晚也不會誤紅 —— M32 第四題);
   * 時間到還開著 = 真的沒關(判紅)。讀數一律在這之後才取。
   */
  const closedWithin = (gone) => page.waitForFunction((id) => !window.__openLayers().includes(id) && window.__openLayers().length <= 1, gone, { timeout: CLOSE_GRACE_MS }).then(() => true, () => false)
  const triggerOf = (ctl) => ctl === 'menu' ? '[data-field="a"] button' : '[data-field="a"] [role="combobox"]'
  const openA = async (host, ctl) => {
    await pressOn(triggerOf(ctl), `${host}:${ctl} 的欄位甲`, { own: ctl !== 'menu' })
    await layersBecome(1)
    const open = await layers()
    if (open.length !== 1) {
      const dump = await page.evaluate(() => [...document.querySelectorAll('[data-radix-popper-content-wrapper]')].map((w) => ({ state: w.firstElementChild?.getAttribute('data-state'), role: w.firstElementChild?.getAttribute('role'), w: Math.round(w.firstElementChild?.getBoundingClientRect().width ?? -1), host: w.contains(document.getElementById('scene-host')) })))
      const trig = await page.evaluate((sel) => { const t = document.querySelector(sel); return t ? { expanded: t.getAttribute('aria-expanded'), state: t.getAttribute('data-state'), tag: t.tagName } : null }, triggerOf(ctl))
      throw new InstrumentError(`${host}:${ctl} 按欄位甲之後開著的彈出層是 ${open.length} 個(應為 1);殼 ${JSON.stringify(dump)};觸發 ${JSON.stringify(trig)}`)
    }
    await parkPointer(page)
    await d.settle()
    return open[0]
  }
  const finish = async () => { await page.evaluate(() => window.__closeScene()); await d.settle() }
  /** 觸發欄位此刻宣告的彈出層 id(開著時 `aria-controls`);「開著的那一層是不是這個欄位的」用它對 */
  const controlsOf = (selector) => page.evaluate((sel) => document.querySelector(sel)?.getAttribute('aria-controls') ?? null, selector)
  /** 「應該一下就打開下一個」:前一個關、畫面上剛好 1 個而且是 next 的;給 CLOSE_GRACE_MS(到了就提早往下) */
  const nextOpenWithin = (gone, nextSel) => page.waitForFunction(([id, sel]) => {
    const open = window.__openLayers()
    const want = document.querySelector(sel)?.getAttribute('aria-controls')
    return !open.includes(id) && open.length === 1 && !!want && open[0] === want
  }, [gone, nextSel], { timeout: CLOSE_GRACE_MS }).then(() => true, () => false)
  /** 用真滑鼠按座標(不經可操作性檢查):目標刻意是被 inert 蓋過的區域時用(C 列;那一點真正收到事件的是它的祖先) */
  const pressAt = async (selector, label) => {
    const handle = await page.waitForSelector(selector, { timeout: WAIT_CAP_MS, state: 'attached' }).catch(() => null)
    if (!handle) throw new InstrumentError(`找不到 ${label}(${selector})`)
    const box = await handle.boundingBox()
    if (!box) throw new InstrumentError(`${label} 量不到位置`)
    const x = box.x + Math.min(box.width / 2, 24)
    const y = box.y + box.height / 2
    const hit = await page.evaluate(([px, py]) => {
      const t = document.elementFromPoint(px, py)
      return t ? `${t.tagName.toLowerCase()}${t.id ? '#' + t.id : ''}[${t.getAttribute('role') ?? ''}]` : null
    }, [x, y])
    await page.mouse.click(x, y)
    await d.settle()
    return hit
  }

  for (const host of HOSTS) {
    for (const ctl of CONTROLS) {
      const family = SELECT_MENU_FAMILY.includes(ctl)
      // 點空白:修前只在 Popover 裡壞(Dialog / Sheet 不是 popper 殼)→ 其餘是對照;點下一格「一下就打開」是 SelectMenu 家族在每一種宿主的契約
      const kind = host === 'popover' && family ? 'contract' : 'control'
      const nextKind = family ? 'contract' : 'control'
      // ── 點宿主空白處 ──
      await sceneOf(host, ctl)
      const a1 = await openA(host, ctl)
      await pressOn('[data-blank]', `${host} 的空白處`)
      await closedWithin(a1)
      const afterBlank = await layers()
      check(`D-${host}-${ctl}-blank`, kind, `${host} 裡的 ${ctl} 開著 → 點空白處 → 彈出層關、${host} 不關`,
        afterBlank.length === 0 && await hostOpen(), { before: a1, after: afterBlank })
      await finish()
      // ── 點同一個宿主裡的另一個欄位(每列重新掛場景:上一列沒關掉的彈出層不得帶到這一列 —— 修前再按一次觸發欄位會把它「關掉」,量到的是別的事)──
      await sceneOf(host, ctl)
      const a2 = await openA(host, ctl)
      const bSel = '[data-field="b"] [role="combobox"]'
      await pressOn(bSel, `${host} 的欄位乙`, { own: true })
      if (family) await nextOpenWithin(a2, bSel)
      else await closedWithin(a2)
      const afterNext = await layers()
      const bLayer = await controlsOf(bSel)
      check(`D-${host}-${ctl}-next`, nextKind, family
        ? `${host} 裡的 ${ctl} 開著 → 點欄位乙 → ${ctl} 關、欄位乙一下就打開(畫面上剛好 1 個、是欄位乙的)、${host} 不關`
        : `${host} 裡的 ${ctl} 開著 → 點欄位乙 → ${ctl} 關、同時開著的 ≤ 1、${host} 不關`,
        (family ? afterNext.length === 1 && afterNext[0] === bLayer : !afterNext.includes(a2) && afterNext.length <= 1) && await hostOpen(),
        { before: a2, after: afterNext, fieldB: bLayer })
      await finish()
      // ── Esc 一次只關一層(對照:既有規則不得被破壞)──
      if (host === 'popover') {
        await sceneOf(host, ctl)
        await openA(host, ctl)
        await d.press('Escape')
        const once = { layers: await layers(), host: await hostOpen() }
        await d.press('Escape')
        const twice = { layers: await layers(), host: await hostOpen() }
        check(`E-popover-${ctl}-esc`, 'control', `Popover 裡的 ${ctl} 開著 → Esc 只關彈出層 → 再 Esc 才關面板`,
          once.layers.length === 0 && once.host && !twice.host, { once, twice })
        await finish()
      }
    }
  }

  // ── DataTable 排序 / 篩選面板(user 回報的那兩個)──
  for (const [panel, label, nextLabel, title] of [['sort', '排序欄位', '排序方向', '排序'], ['filter', '篩選欄位', '篩選運算子', '篩選']]) {
    const first = (name) => `[aria-label="${name}"][role="combobox"]`
    const titleSel = `#scene-host [data-slot="popover-title"], #scene-host h2, #scene-host h3`
    await sceneOf('panel', panel)
    const titleHandle = await page.$(titleSel)
    if (!titleHandle) throw new InstrumentError(`${panel} 面板找不到標題(${titleSel})`)
    await page.evaluate((sel) => document.querySelector(sel)?.setAttribute('data-blank', ''), titleSel)
    await pressOn(first(label), `${panel} 第 1 列的${label}`, { own: true })
    await layersBecome(1)
    const opened = await layers()
    if (opened.length !== 1) throw new InstrumentError(`${panel} 面板按${label}之後開著的彈出層是 ${opened.length} 個(應為 1)`)
    await parkPointer(page); await d.settle()
    await pressOn('[data-blank]', `${panel} 面板標題`)
    await closedWithin(opened[0])
    const afterBlank = await layers()
    check(`P-${panel}-blank`, 'contract', `DataTable ${title}面板第 1 列的${label}開著 → 點面板標題 → 選單關、面板不關`,
      afterBlank.length === 0 && await hostOpen(), { before: opened, after: afterBlank })
    await finish()
    await sceneOf('panel', panel)
    await pressOn(first(label), `${panel} 第 1 列的${label}`, { own: true })
    await layersBecome(1)
    const reopened = await layers()
    if (reopened.length !== 1) throw new InstrumentError(`${panel} 面板再按${label}之後開著的彈出層是 ${reopened.length} 個(應為 1)`)
    await parkPointer(page); await d.settle()
    await pressOn(first(nextLabel), `${panel} 第 1 列的${nextLabel}`, { own: true })
    await nextOpenWithin(reopened[0], first(nextLabel))
    const afterNext = await layers()
    const nextLayer = await controlsOf(first(nextLabel))
    check(`P-${panel}-next`, 'contract', `DataTable ${title}面板第 1 列的${label}開著 → 點同一列的${nextLabel} → 前一個關、${nextLabel}一下就打開(剛好 1 個、是它的)`,
      afterNext.length === 1 && afterNext[0] === nextLayer && await hostOpen(), { before: reopened, after: afterNext, next: nextLayer })
    await finish()
  }

  // ── 欄位自己的另一層不算外面(Combobox「+N」浮出清單;select-menu.spec.md「+N」那一列)──
  await sceneOf('popover', 'plusn')
  const menu = await openA('popover', 'plusn')
  const plus = await page.$('[data-field="a"] [data-overflow-indicator]')
  if (!plus) throw new InstrumentError('窄欄位四個 Tag 沒有出現「+N」')
  await plus.hover()
  if (!(await layersBecome(2))) throw new InstrumentError('「+N」浮出清單沒開')
  const card = (await layers()).find((id) => id !== menu)
  await page.evaluate((id) => {
    const c = document.getElementById(id)
    const blank = [...c.querySelectorAll('*')].find((el) => !el.closest('button, [data-tag-root]') && el.getBoundingClientRect().width > 0 && el.children.length > 0)
    ;(blank ?? c).setAttribute('data-card-blank', '')
  }, card)
  await pressOn('[data-card-blank]', '「+N」卡片本身')
  const afterCard = await layers()
  check('K-plusn-card', 'contract', 'Popover 裡的 Combobox 選單開著 → 按「+N」浮出清單的卡片本身 → 選單照開',
    afterCard.includes(menu), { menu, card, after: afterCard })
  const remove = `[id="${card}"] [data-collection-remove]`
  await pressOn(remove, '「+N」卡片裡的 ×')
  const afterRemove = await layers()
  const tags = await page.$$eval('[data-field="a"] [data-tag-root]', (els) => els.length)
  check('K-plusn-remove', 'contract', 'Popover 裡的 Combobox 選單開著 → 按「+N」卡片裡的 × → 那一項移除、選單照開',
    afterRemove.includes(menu), { menu, after: afterRemove, tagsOnField: tags })
  await finish()

  // ── 另一個欄位的「+N」卡不是這個欄位的零件(2026-11-03 第一版「不裝著它的那一層」把它算成自己的;獨立審查實測)──
  await sceneOf('popover', 'plusn')
  const menuA = await openA('popover', 'plusn')
  const plusB = await page.$('[data-field="b"] [data-overflow-indicator]')
  if (!plusB) throw new InstrumentError('欄位乙(窄欄位四個 Tag)沒有出現「+N」')
  await plusB.hover()
  if (!(await layersBecome(2))) throw new InstrumentError('欄位乙的「+N」浮出清單沒開')
  const cardB = (await layers()).find((id) => id !== menuA)
  await page.evaluate((id) => {
    const c = document.getElementById(id)
    const blank = [...c.querySelectorAll('*')].find((el) => !el.closest('button, [data-tag-root]') && el.getBoundingClientRect().width > 0 && el.children.length > 0)
    ;(blank ?? c).setAttribute('data-card-blank', '')
  }, cardB)
  await pressOn('[data-card-blank]', '欄位乙「+N」卡片本身')
  await closedWithin(menuA)
  const afterForeign = await layers()
  check('K-foreign-card', 'contract', 'Popover 裡兩個窄 Combobox:欄位甲選單開著 → 按欄位乙「+N」卡片本身 → 欄位甲的選單關(別人的零件 = 外面)、面板不關',
    !afterForeign.includes(menuA) && await hostOpen(), { menuA, cardB, after: afterForeign })
  await finish()

  // ── InlineEdit:點宿主空白處 = 點外面 → 回檢視 ──
  for (const host of HOSTS) {
    await sceneOf(host, 'inline')
    await pressOn('[data-field="a"] button', `${host} 裡 InlineEdit 的檢視鈕`)
    await waitIn(() => !!document.querySelector('[data-field="a"] [data-editing="true"]'), null, `${host} 裡 InlineEdit 沒有進編輯`)
    if (!(await layersBecome(1))) throw new InstrumentError(`${host} 裡 InlineEdit 進編輯後選單沒有打開`)
    await parkPointer(page); await d.settle()
    await pressOn('[data-blank]', `${host} 的空白處`)
    await page.waitForFunction(() => !document.querySelector('[data-field="a"] [data-editing="true"]') && window.__openLayers().length === 0, null, { timeout: CLOSE_GRACE_MS }).catch(() => {})
    const editing = await page.evaluate(() => !!document.querySelector('[data-field="a"] [data-editing="true"]'))
    const left = await layers()
    check(`I-${host}-blank`, 'contract', `${host} 裡的 InlineEdit(編輯控件 = Select,進編輯即開選單)→ 點空白處 → 選單關、回檢視、${host} 不關`,
      !editing && left.length === 0 && await hostOpen(), { editing, layers: left })
    await finish()
  }

  // ── InlineEdit:焦點在編輯控件上按 Tab → 宿主裡的下一格 = 離開 → 回檢視(鍵盤 focusout 那條路;指標那條在上面)──
  for (const host of HOSTS) {
    await sceneOf(host, 'inline-tab')
    await pressOn('[data-field="a"] button', `${host} 裡 InlineEdit 的檢視鈕`)
    await waitIn(() => !!document.querySelector('[data-field="a"] [data-editing="true"] [role="combobox"]'), null, `${host} 裡 InlineEdit 沒有進編輯`)
    await d.focus('[data-field="a"] [data-editing="true"] [role="combobox"]')
    const before = await page.evaluate(() => !!document.querySelector('[data-field="a"] [data-editing="true"]')?.contains(document.activeElement))
    if (!before) throw new InstrumentError(`${host} 裡 InlineEdit 的編輯控件拿不到焦點`)
    await d.press('Tab')
    await page.waitForFunction(() => !document.querySelector('[data-field="a"] [data-editing="true"]'), null, { timeout: CLOSE_GRACE_MS }).catch(() => {})
    const state = await page.evaluate(() => ({
      editing: !!document.querySelector('[data-field="a"] [data-editing="true"]'),
      onNext: document.activeElement?.hasAttribute('data-next') ?? false,
    }))
    check(`I-${host}-tab`, 'contract', `${host} 裡的 InlineEdit(編輯控件 = Select)焦點在控件上 → Tab → 焦點到下一格、回檢視、${host} 不關`,
      !state.editing && state.onNext && await hostOpen(), state)
    await finish()
  }

  // ── 並存對話框 portal 進外層 dialog:外層是宿主,不是疊在上面的確認框(dialog.spec.md「框外事件的守衛」(3))──
  const openCoexist = async () => {
    await sceneOf('dialog', 'coexist')
    await pressOn('[data-open-inner]', '開啟並存對話框')
    await waitIn(() => window.__dialogOpen('coexist-inner'), null, '並存對話框沒有打開')
    await parkPointer(page); await d.settle()
  }
  await openCoexist()
  const hit = await pressAt('#scene-host [data-blank]', '外層 dialog 的空白處')
  await page.waitForFunction(() => !window.__dialogOpen('coexist-inner'), null, { timeout: CLOSE_GRACE_MS }).catch(() => {})
  const nested = { inner: await page.evaluate(() => window.__dialogOpen('coexist-inner')), host: await hostOpen(), hit }
  check('C-nested-host-blank', 'contract', 'Dialog 裡的並存對話框(portal 進外層)開著 → 點外層 dialog 的空白 → 並存對話框關、外層不關',
    !nested.inner && nested.host, nested)
  await finish()
  await openCoexist()
  await pressOn('[data-open-confirm]', '並存對話框裡的「刪除」')
  await waitIn(() => window.__dialogOpen('coexist-confirm'), null, '確認框沒有打開')
  await pressOn('[data-confirm-blank]', '確認框的空白處')
  const stacked = { inner: await page.evaluate(() => window.__dialogOpen('coexist-inner')), confirm: await page.evaluate(() => window.__dialogOpen('coexist-confirm')) }
  check('C-stacked-confirm', 'control', '並存對話框開著 → 從它裡面開一般確認框(疊在上面)、按確認框空白 → 並存對話框照開',
    stacked.inner && stacked.confirm, stacked)
  await page.keyboard.press('Escape'); await d.settle()
  await finish()
  return checks
}

const STYLE = await compileDsCss({ root: SOURCE_ROOT, extraSources: [HARNESS] })
const VIEWPORT = { width: 1280, height: 960 }

async function runVariant(page, label, mutate) {
  const code = await bundleDsHarness({ root: SOURCE_ROOT, harness: HARNESS, harnessName: 'overlay-nested-dismiss-harness.tsx', mutate })
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
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.id.padEnd(34)} ${c.kind === 'control' ? '[對照] ' : ''}${c.title}`)
    if (!c.pass) console.log(`      實得:${JSON.stringify(c.detail)}`)
  }
}
const redIds = (checks) => checks.filter((c) => !c.pass).map((c) => c.id).sort()

let browser
const laneBrowsers = []
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
      console.log(`\n✗ 浮層裡的欄位點外關閉:${red.length} 條不符(${red.join(' / ')})—— SSOT overlay-surface.spec.md「Esc / 點外面關閉」、keyboard-model-canonical.md「Esc 一次只關最內層」`)
      process.exitCode = 1
    } else {
      console.log(`\n✓ 浮層裡的欄位點外關閉:${result.checks.length} 條全綠(含 ${result.checks.filter((c) => c.kind === 'control').length} 條對照)`)
    }
  } else {
    const baseline = await runVariant(page, '現行原始碼(selftest 基準 = 一趟完整判定,必須全綠)', null)
    report(baseline)
    const problems = []
    if (redIds(baseline.checks).length) problems.push(`現行原始碼本身就紅(${redIds(baseline.checks).join(' / ')}),突變的紅燈無法歸因`)
    const contractIds = baseline.checks.filter((c) => c.kind === 'contract').map((c) => c.id)
    const covered = new Set()
    const RUN = (ONLY ? MUTANTS.filter((m) => ONLY.includes(m.id)) : MUTANTS)
      .filter((m) => !SHARD || MUTANTS.indexOf(m) % SHARD.n === SHARD.k)
    if (!RUN.length) throw new InstrumentError(`這一片沒有任何突變可跑(--shard=${SHARD ? `${SHARD.k}/${SHARD.n}` : '—'}${ONLY ? ` --only=${ONLY.join(',')}` : ''})—— 不得讀成通過`)
    if (ONLY && RUN.length !== ONLY.length) throw new InstrumentError(`--only 指名的突變不存在:${ONLY.filter((id) => !MUTANTS.some((m) => m.id === id)).join(', ')}`)
    // 突變彼此獨立:分 LANES 條 lane 並行跑(第一條沿用上面那個分頁),結果依 MUTANTS 的順序回報
    const results = new Array(RUN.length)
    const lanePages = [page]
    for (let i = 1; i < Math.min(LANES, RUN.length); i += 1) {
      const b = await launchBrowserOrSkip({}, { hint: '這支閘不需要 storybook 建置,只需要 Chromium' })
      laneBrowsers.push(b)
      lanePages.push(await (await b.newContext({ viewport: VIEWPORT, reducedMotion: 'reduce' })).newPage())
    }
    let next = 0
    let laneFailure = null
    const settled = await Promise.allSettled(lanePages.map(async (lanePage) => {
      for (let i = next++; i < RUN.length && !laneFailure; i = next++) {
        const m = RUN[i]
        try {
          results[i] = await runVariant(lanePage, `突變 ${m.id}:${m.what}`, mutantFor(SOURCE_ROOT, m.file, m.apply))
        } catch (error) {
          if (error instanceof InstrumentError) error.message = `突變 ${m.id}:${error.message}`
          laneFailure ??= error
          throw error
        }
      }
    }))
    const rejected = settled.find((r) => r.status === 'rejected')
    if (rejected) throw rejected.reason
    for (const [i, m] of RUN.entries()) {
      const result = results[i]
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
    if (phantom.length) problems.push(`突變的 expectRed 寫了不是契約列的 ${phantom.join(' / ')}(列名改了沒跟上,或把對照列當契約)`)
    const uncovered = contractIds.filter((id) => !covered.has(id))
    if (ONLY) problems.push(`只跑了 --only 指名的 ${RUN.length} 個突變(除錯用):這一趟不算 selftest 通過`)
    else if (!SHARD && uncovered.length) problems.push(`契約列 ${uncovered.join(' / ')} 沒有任何突變能讓它紅 —— 它的綠燈是零證據`)
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
    process.exitCode = 1
  } else {
    throw error
  }
} finally {
  for (const b of laneBrowsers) await b.close().catch(() => {})
  await browser?.close()
}
