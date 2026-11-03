#!/usr/bin/env node
/**
 * @gate-contract
 *   保證: 欄位的彈出層(Select / 可搜尋的 Select / Combobox 兩種搜尋位置 / PeoplePicker 單選與多選 / DatePicker / TimePicker / DropdownMenu)
 *        放在**另一個浮層裡**(Popover 面板、Dialog、Sheet;DataTable 的排序面板與篩選面板)時,「點外面關閉」照樣成立 ——
 *        開著時點面板空白處 → 它關、面板不關;開著時點同一個面板裡的另一個欄位 → 它關,畫面上同時開著的彈出層 ≤ 1;
 *        `Esc` 一次只關一層(先關彈出層、再關面板)。屬於這個欄位自己的另一層(Combobox「+N」浮出清單)不算外面:按卡片、按卡片裡的 × 選單照開。
 *        InlineEdit 放在浮層裡時,點浮層空白處 = 點外面 → 回到檢視。
 *        規則:`patterns/overlay-surface/overlay-surface.spec.md`「Esc / 點外面關閉:Radix 處理」、`ds-canonical/references/keyboard-model-canonical.md`
 *        「`Esc` 一次只關最內層」(浮層疊浮層「一層一層關」)、`components/SelectMenu/select-menu.spec.md`「+N」那一列、`components/InlineEdit/inline-edit.spec.md`「滑鼠 blur(點外面)→ commit」。
 *   紅: 任一列不符 → 逐列點名 exit 1。`--selftest` 在 DS 原始碼上各造回一個根因突變(MUTANTS),每個突變必須**剛好**紅它負責的那幾列,
 *        契約列每一條都要被某個突變弄紅過。`--root=<修改前的整棵原始碼>` = 天然對照組(108a736f 基準樹:Popover 面板裡 SelectMenu 家族六種欄位的
 *        D-*-blank / D-*-next、排序 / 篩選面板四列、InlineEdit 三列紅,其餘綠)。
 *   綠: 現行原始碼每列都量到且符合;對照列(Dialog / Sheet 裡的每一種欄位、Popover 裡的 DatePicker / TimePicker / DropdownMenu、每一種欄位的 Esc 一層一層關)
 *        在現行原始碼與每個突變上都綠 —— 證明量具看得到「關閉」,紅燈不是量具壞了。harness 載不起來 / 元素找不到或被蓋住 / 等不到靜止
 *        = 儀器失效(INSTRUMENT-FAIL,exit 1),不得讀成通過(M37:沒量到 ≠ 沒發生)。
 *   註: 2026-11-03 新增(user 2026-10-30 第十五輪:篩選 / 排序面板的欄位選單點外不關、可同時開好幾個)。根因在 SelectMenu 的 `onInteractOutside`:
 *        為了「+N」浮出清單(欄位自己掛在另一個 portal 的零件),把「按在**任何一個** Radix popper 殼裡」都當成不是外面 —— 而裝著這個欄位的
 *        Popover 面板自己也是一個 popper 殼,於是點面板空白、點面板裡的下一格,都被當成「按在自己身上」。InlineEdit 的點外判定同一個形狀
 *        (任何 popper / listbox / dialog = 本 edit 開的浮層 —— 連裝著它的 Dialog 也算)。判準收成一支:`lib/composite-field-focus.ts`
 *        `isOnDetachedLayer`(按在**不裝著這個欄位**的那一層上才算「欄位自己的另一層」)。
 *
 * ── 判定表(列名 = <種類>-<宿主>-<欄位>-<動作>)──
 *   D-<宿主>-<欄位>-blank  開欄位的彈出層 → 點宿主空白處(標題列文字)→ 彈出層關、宿主不關
 *   D-<宿主>-<欄位>-next   開欄位的彈出層 → 點同一個宿主裡的另一個 Select(在它上方,不被蓋住)→ 前一個關、同時開著的 ≤ 1、宿主不關
 *   E-popover-<欄位>-esc   開欄位的彈出層 → Esc → 彈出層關、宿主不關 → Esc → 宿主關(對照:keyboard-model-canonical「每按一次少一層」)
 *   P-sort-blank / P-sort-next     DataTable 排序面板(Popover):第 1 列的欄位選單開著 → 點面板標題 / 點同一列的方向選單
 *   P-filter-blank / P-filter-next DataTable 篩選面板(Popover):第 1 列的欄位選單開著 → 點面板標題 / 點同一列的運算子選單
 *   K-plusn-card / K-plusn-remove  Popover 裡的 Combobox(窄欄位四個 Tag)選單開著 → 按「+N」浮出清單的卡片本身 / 卡片裡的 × → 選單照開(後者那一項移除)
 *   I-<宿主>-blank         InlineEdit(編輯控件 = Select、進編輯即開選單,inline-edit.stories.tsx 同一個寫法)→ 點宿主空白處 → 選單關、回檢視
 *   宿主:popover / dialog / sheet。欄位:select / select-search / combobox / combobox-trigger / people-single / people-multi / date / time / menu。
 *
 * ── 突變 → 該紅的列(--selftest;MUTANTS 是單一來源)──
 *   SelectMenu 回到「任何 popper 殼都不是外面」(修前的寫法)→ Popover 裡 SelectMenu 家族六種欄位的 D-*-blank / D-*-next + P-sort-* / P-filter-*
 *   SelectMenu 拿掉「欄位自己的另一層」那一條(只留指標按在觸發欄位上)→ K-plusn-card / K-plusn-remove
 *   InlineEdit 回到「任何 popper / listbox / dialog 都是本 edit 的浮層」(修前的寫法)→ I-popover-blank / I-dialog-blank / I-sheet-blank
 *
 * 用法:
 *   node scripts/overlay-nested-dismiss-invariant.mjs                判定(現行原始碼)
 *   node scripts/overlay-nested-dismiss-invariant.mjs --selftest     對照組(全部單一根因突變)
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

const HOSTS = ['popover', 'dialog', 'sheet']
/** SelectMenu 家族(Select / Combobox / PeoplePicker 都經 SelectMenu)—— 修前在 Popover 裡紅的就是這六種 */
const SELECT_MENU_FAMILY = ['select', 'select-search', 'combobox', 'combobox-trigger', 'people-single', 'people-multi']
const CONTROLS = [...SELECT_MENU_FAMILY, 'date', 'time', 'menu']

const MUTANTS = [
  {
    id: 'selectmenu-any-popper',
    what: 'SelectMenu 把「按在任何一個 Radix popper 殼裡」都當成不是外面(2026-05-07 → 2026-11-03 的寫法;裝著欄位的 Popover 面板也是 popper 殼)',
    file: 'components/SelectMenu/select-menu.tsx',
    expectRed: [
      ...SELECT_MENU_FAMILY.flatMap((c) => [`D-popover-${c}-blank`, `D-popover-${c}-next`]),
      'P-sort-blank', 'P-sort-next', 'P-filter-blank', 'P-filter-next',
    ],
    apply: (src) => replaceOnce(src, /isOnDetachedLayer\(target, popupKeys\.triggerRef\.current\)/, "!!target?.closest('[data-radix-popper-content-wrapper]')"),
  },
  {
    id: 'selectmenu-no-detached-layer',
    what: 'SelectMenu 不認「欄位自己掛在另一個 portal 的零件」(+N 浮出清單),只留指標按在觸發欄位上那一條',
    file: 'components/SelectMenu/select-menu.tsx',
    expectRed: ['K-plusn-card', 'K-plusn-remove'],
    apply: (src) => replaceOnce(src, /isOnDetachedLayer\(target, popupKeys\.triggerRef\.current\)/, 'false'),
  },
  {
    id: 'inline-edit-any-overlay',
    what: 'InlineEdit 把任何 popper / listbox / dialog 都當成本 edit 開的浮層(修前的寫法;裝著它的 Dialog / Popover 也算)',
    file: 'components/InlineEdit/inline-edit.tsx',
    expectRed: ['I-popover-blank', 'I-dialog-blank', 'I-sheet-blank'],
    // 點外結算有兩條路(pointerdown + focusout,「雙保險」),只打回一條會被另一條補上 —— 修前兩條是同一個寫法,一起打回
    apply: (src) => replaceOnce(
      replaceOnce(src, /if \(isOnDetachedLayer\(target, box, EDIT_OVERLAY_SELECTOR\)\) return/, 'if (target.closest(EDIT_OVERLAY_SELECTOR)) return'),
      /if \(active && isOnDetachedLayer\(active, wrapper, EDIT_OVERLAY_SELECTOR\)\) return/, 'if (active && active.closest(EDIT_OVERLAY_SELECTOR)) return'),
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
    case 'plusn': return <div style={{ width: 220 }}><Combobox aria-label="欄位甲" options={LABELS} value={vs.length ? vs : ['bug', 'ux', 'perf', 'docs']} onChange={setVs} /></div>
    // 編輯中 = [data-editing="true"](檢視態那一層也帶 data-editing="false",只認屬性存在會永遠讀成編輯中)
    // InlineEdit 換成 Select(inline-edit.stories.tsx「狀態」那一則同一個寫法:進編輯立刻開選單、選完即結算;不選直接點外面由 InlineEdit 保證回檢視)
    case 'inline': return (
      <InlineEdit label="狀態" value={v ?? 'todo'} onCommit={setV}
        renderRead={(x) => <Select mode="view" display="tag" value={x} options={STATUS} />}
        renderEdit={(p) => <Select autoFocus display="tag" value={p.value} options={STATUS} defaultOpen onChange={(next) => { p.onChange(next); p.commit() }} />} />
    )
    default: throw new Error('未知欄位 ' + ctl)
  }
}

function Body({ ctl }) {
  const [b, setB] = React.useState(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 320 }}>
      <p data-blank style={{ margin: 0, padding: '4px 0' }}>任務設定</p>
      <div data-field="b"><Select aria-label="欄位乙" options={STATUS} value={b} onChange={setB} /></div>
      <div data-field="a"><Field ctl={ctl} /></div>
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
  const body = scene.ctl === 'sort' ? <SortPanel /> : scene.ctl === 'filter' ? <FilterPanel /> : <Body ctl={scene.ctl} />
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

  for (const host of HOSTS) {
    for (const ctl of CONTROLS) {
      const kind = host === 'popover' && SELECT_MENU_FAMILY.includes(ctl) ? 'contract' : 'control'
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
      await pressOn('[data-field="b"] [role="combobox"]', `${host} 的欄位乙`, { own: true })
      await closedWithin(a2)
      const afterNext = await layers()
      check(`D-${host}-${ctl}-next`, kind, `${host} 裡的 ${ctl} 開著 → 點欄位乙 → ${ctl} 關、同時開著的 ≤ 1、${host} 不關`,
        !afterNext.includes(a2) && afterNext.length <= 1 && await hostOpen(), { before: a2, after: afterNext })
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
    await closedWithin(reopened[0])
    const afterNext = await layers()
    check(`P-${panel}-next`, 'contract', `DataTable ${title}面板第 1 列的${label}開著 → 點同一列的${nextLabel} → 前一個關、同時開著的 ≤ 1`,
      !afterNext.includes(reopened[0]) && afterNext.length <= 1 && await hostOpen(), { before: reopened, after: afterNext })
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
