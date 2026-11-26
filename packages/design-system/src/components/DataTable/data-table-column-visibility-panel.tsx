// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
/**
 * DataTableColumnVisibilityPanel — Issue 3 primitive(2026-05-10)。
 *
 * 從 WithBulkActions story L868+(149 lines)+ RoadmapAllInOne(L1796+,53 lines)抽出 SSOT
 * primitive。Roadmap demo 跟 WithBulkActions 都用此 panel 開啟「欄位顯示」popover。
 *
 * **固定零件**(恆渲染,不靠傳不傳某個參數決定 —— M23(f);data-table.spec.md L4「欄位顯示面板的固定零件」,2026-11-15)
 * (對齊 Linear / Airtable / Notion / Material X-DataGrid 的 columnVisibility panel idiom):
 *   - 標題列:「恢復預設」(RotateCcw)+ ×
 *   - 搜尋(跨欄位 label match)—— 2026-11-15 前要另外傳 `searchable` 才有;`searchable` 已移除
 *   - 可拖曳排序的欄位列 + Eye / EyeOff 切換;Locked 欄位(`lockedIds`)顯 Lock icon,不可 toggle / 不可 drag
 *     —— 2026-11-15 前要傳 `columnOrder` + `onColumnOrderChange` 才有拖曳;兩個現在必填(順序怎麼存只有產品能做,沒有內建 fallback)
 *   - 底部 bidirectional bulk toggle(全可見 → 全部隱藏 / 任一隱藏 → 顯示全部);按下後 polite 播報結果(2026-11-21)
 * 「恢復預設」:還原這個面板改得動的全部 —— 顯示 / 隱藏回到 `defaultVisibility`、順序回到 `defaultColumnOrder`(沒傳 = `columns`
 *   定義順序、鎖定欄排最前);兩個預設至少傳一個、目前與它不同才出現,都不傳就沒有 —— 同排序 / 篩選面板
 *   (data-table.spec.md L4「Header 恢復預設 / 清除全部」;2026-11-15 前是 `resettable` 開關 + 有隱藏欄才出現、按下 = 全部顯示;
 *   連順序一起還原是【AI 推導 2026-11-15】,起因 user 同日成品頁留言(問句))
 *
 * **Why 抽 primitive**(per Issue 3 Rule-of-3):RoadmapAllInOne + WithBulkActions + 未來 product
 * UI 至少 3 處消費同 panel。重複 hand-craft → 設計語言 drift(已抓到:Roadmap 版無 search /
 * 無 drag / 無 reset,WithBulkActions 版有,語意不一致)。Primitive 把所有 feature 集中;2026-11-15 起零件也不再讓
 * consumer opt-in —— opt-in 正是範例漏掉搜尋 / 拖曳的同一種漂移。user 同日問句(逐字):
 * 「“是我寫範例時漏接了”為何可以漏接？這幾個面板不都是有很多地方是固定設計的「元件」嗎」

 *
 * **對齊**:Linear column-visibility-panel pattern / Material X-DataGrid `<GridColumnsPanel>`
 * / Airtable Field-config drawer。
 */

import * as React from 'react'
import { Eye, EyeOff, Lock, GripVertical, Search, RotateCcw } from 'lucide-react'
import { Button } from '@/design-system/components/Button/button'
import { Input } from '@/design-system/components/Input/input'
import { type DragOutcome, useDragAccessibility } from '@/design-system/lib/drag-announcements'
import { PopoverHeader, PopoverBody, PopoverFooter, PopoverTitle } from '@/design-system/components/Popover/popover'
import { ItemPrefix, ItemLabel, ItemInlineActionButton, ROW_PADDING_BY_SIZE } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { cn } from '@/lib/utils'
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor, KeyboardSensor, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { dragSourceStyle, forwardDragActivatorAttributes, DRAG_ACTIVATION_DISTANCE_PX } from '@/design-system/lib/drag-visual'
import { usePanelBulkAction } from './lib/panel-bulk-action'
import { panelWidthStyle, useWarnBelowPanelFloor, type DataTablePanelWidthProps, type PanelWidthFloor } from './lib/panel-width'

/**
 * 欄位顯示面板的下限(【AI 推導 2026-11-15】由列的組成推出,同排序 / 篩選面板):左右內距 2×16 + 把手位 16 + 間距 2×8
 * + 欄名至少 10rem(160,同篩選面板的欄位下拉:同一份欄名)+ 眼睛鈕 24 = 248px → 15.5rem。預設(撐滿外層 w-72 = 288)不受影響。
 */
const VISIBILITY_PANEL_FLOOR: PanelWidthFloor = { rem: 15.5 }

/**
 * 欄位顯示面板上的字 —— 2026-11-26 起產品可經面板的 `labels` 換字(E9;之前全部寫死,產品換不了語言)。
 * 形狀照排序面板(`lib/sort-cycle.ts` `DataTableSortManagerLabels`)與篩選面板:介面 + 預設值 + 淺合併,面板收 `labels?: Partial<…>`、
 * 預設值與型別由本檔出口、進 root barrel。鍵名沿用兩個面板同義的那幾個(`title` / `resetToDefault` / `resetToDefaultDone` / `dragToReorder`),
 * 面板自己才有的照同一個造字法(`searchPlaceholder` / `searchAriaLabel` 同篩選面板 `peopleSearchPlaceholder` / `peopleSearchAriaLabel`)。
 * 預設值 = 開放之前寫死在面板裡的字,一字未改。
 * 不在這裡:欄位名稱(consumer 的 `columns`);標題列 × 的讀屏名稱(PopoverHeader 內建,經 I18nProvider 的 `popover.close`);
 * 拖曳把手的讀屏操作說明與拖曳時的播報句(全 DS 共用的 `../../lib/drag-announcements.ts`,還沒有換字管道 —— 同排序面板)。
 */
export interface DataTableColumnVisibilityPanelLabels {
  /** 標題列的標題 */
  title: string
  /** 搜尋框的 placeholder */
  searchPlaceholder: string
  /** 搜尋框的 aria-label */
  searchAriaLabel: string
  /** 標題列「恢復預設」圖示鈕的 aria-label */
  resetToDefault: string
  /** 「恢復預設」按下後的 polite 播報 */
  resetToDefaultDone: string
  /** 底部切換鈕:有任一欄隱藏時的字(按下 = 全部顯示) */
  showAll: string
  /** 「顯示全部」按下後的 polite 播報 */
  showAllDone: string
  /** 底部切換鈕:全部可見時的字(按下 = 全部隱藏) */
  hideAll: string
  /** 「全部隱藏」按下後的 polite 播報 */
  hideAllDone: string
  /** 每一列:拖曳把手的 aria-label */
  dragToReorder: string
  /** 每一列:眼睛鈕的 aria-label(這一欄目前顯示 → 按下隱藏) */
  hideColumn: string
  /** 每一列:眼睛鈕的 aria-label(這一欄目前隱藏 → 按下顯示) */
  showColumn: string
}

// code-quality-allow: dead-export — public i18n defaults(同排序面板 DATA_TABLE_SORT_MANAGER_DEFAULT_LABELS)。
// i18n-allow: DS 預設文案(中文;lib/i18n/README.md「Fallback chain」3)—— consumer 經 `labels` 覆寫
export const DATA_TABLE_COLUMN_VISIBILITY_PANEL_DEFAULT_LABELS: DataTableColumnVisibilityPanelLabels = {
  title: '欄位顯示',
  searchPlaceholder: '搜尋欄位…',
  searchAriaLabel: '搜尋欄位',
  resetToDefault: '恢復預設',
  resetToDefaultDone: '已恢復預設欄位顯示',
  showAll: '顯示全部',
  showAllDone: '已顯示全部欄位',
  hideAll: '全部隱藏',
  hideAllDone: '已隱藏全部欄位',
  dragToReorder: '拖曳重排',
  hideColumn: '隱藏此欄',
  showColumn: '顯示此欄',
}

interface ColumnVisibilityPanelColumn {
  /** Column id(stable identifier;對齊 DataTable column.id / accessorKey)*/
  id: string
  /** Column header label(human-readable)*/
  label: string
}

export interface DataTableColumnVisibilityPanelProps extends React.HTMLAttributes<HTMLDivElement>, DataTablePanelWidthProps {
  /** 全部可 toggle 欄位(consumer 已過濾掉 system cols 如 __select__)*/
  columns: ColumnVisibilityPanelColumn[]
  /** 受控 visibility map(`true` / undefined = visible / `false` = hidden)*/
  visibility: Record<string, boolean>
  /** Visibility 變更 callback */
  onVisibilityChange: (next: Record<string, boolean>) => void
  /**
   * 受控欄位順序(完整的,可含面板沒列的 id,例:選取欄;寫法同 TanStack `columnOrder`)。它沒寫到的面板欄照 `columns` 順序接在後面,
   * `[]` = 照 `columns` 順序(同 TanStack:columnOrder 沒列的欄排在後面)。順序也算進「恢復預設」。
   * 必填:拖曳排序是這個面板的固定零件(data-table.spec.md L4「欄位顯示面板的固定零件」;2026-11-15 前選填,不傳就沒有拖曳)。
   */
  columnOrder: string[]
  /**
   * 順序變更 callback(拖曳、「恢復預設」都經它;只換面板列出的那幾欄的位置,面板沒列的 id —— 例:選取欄 —— 留在原位)。
   * 必填:順序要怎麼存(跟表格共用一份 state、存進使用者的檢視)只有產品能做,元件沒有內建 fallback(M23(f))。
   */
  onColumnOrderChange: (next: string[]) => void
  /** Locked column ids(顯 Lock icon,不可 toggle / 不可 drag;哪幾欄鎖是資料,不傳 = 沒有鎖定欄)*/
  lockedIds?: string[]
  // 搜尋框是固定零件、恆顯示(data-table.spec.md L4「欄位顯示面板的固定零件」;M23(f))。2026-11-15 前要另外傳 `searchable` 才有;
  // 那個參數已移除、不留別名(0.x 相容政策,props-naming.md「相容政策」)—— 舊寫法 `searchable` 不是 div 的屬性,型別層直接報錯。
  /**
   * 產品設定的預設可見欄(例:專案管理員設的預設欄位、使用者存過的檢視;寫法同 `visibility`)。目前與預設不同時,
   * 標題列出現「恢復預設」,按下回到這一份(連順序一起回到 `defaultColumnOrder`);一樣時不出現。
   * 只傳 `defaultColumnOrder`、不傳這個 = 預設全部顯示;兩個都不傳 = 這個產品沒有預設 → 不出現「恢復預設」。
   * 「一樣」= 面板列出的每一欄顯示 / 隱藏都相同(沒寫 = 顯示,`{}` 與 `{ a: true }` 一樣),順序也相同。
   * 同排序面板 `defaultSorting`、篩選面板 `defaultValue`(data-table.spec.md L4「Header 恢復預設 / 清除全部」)。
   * 2026-11-15 取代 `resettable`(另外開才有、有隱藏欄就出現、按下 = 全部顯示 —— 不是產品的預設);不留別名,
   * 舊寫法 `resettable` 不是 div 的屬性,型別層直接報錯(M23(f):讓型別把每個 consumer 逼出來改)。
   */
  defaultVisibility?: Record<string, boolean>
  /**
   * 產品設定的預設欄位順序(寫法同 `columnOrder`)。目前的順序與它不同 → 出現「恢復預設」,按下順序回到這一份。
   * 面板沒列的 id 略過、它沒寫到的欄照 `columns` 順序接在後面。
   * 不傳 = `columns` 的定義順序(鎖定欄排最前)—— 同 AG Grid `resetColumnState` 回到欄位定義。
   * 不另設「不還原順序」開關(data-table.spec.md L4,【AI 推導 2026-11-15】)。
   */
  defaultColumnOrder?: string[]
  /**
   * 面板上的字(只給要換的鍵,其餘淺合併 `DATA_TABLE_COLUMN_VISIBILITY_PANEL_DEFAULT_LABELS`;同排序面板 / 篩選面板的 `labels`,
   * 2026-11-26 前全部寫死)。欄位名稱來自 `columns` 的 label,不在這裡。
   */
  labels?: Partial<DataTableColumnVisibilityPanelLabels>
  // Issue 3 post-codex audit(2026-05-10):`onClose` prop retired — Radix `PopoverClose asChild`
  // 已自帶 popover dismiss,沒 concrete consumer 需 callback。Future 若需要再加。
}

/** 兩份可見欄相同 = 面板列出的每一欄顯示 / 隱藏都一樣(沒寫 = 顯示,同 `visibility` 的讀法;含鎖定欄 —— 按下去會改到它就算不一樣) */
function isVisibilityEqual(ids: readonly string[], a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  return ids.every((id) => (a[id] !== false) === (b[id] !== false))
}

/**
 * 「恢復預設」管的那一份 = 這個面板讓人改得動的全部:顯示 / 隱藏 + 順序(面板列出的那幾欄由上到下)。
 * 【AI 推導 2026-11-15】data-table.spec.md L4。
 */
interface PanelResetState {
  visibility: Record<string, boolean>
  order: readonly string[]
}

function isOrderEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/**
 * 完整順序 = consumer 的 `columnOrder`(去重)+ 它沒寫到的面板欄照 `columns` 順序接在後面 —— 同 TanStack(columnOrder 沒列的欄排在後面),
 * `[]` = 照 `columns`。拖曳與「恢復預設」都在這一份上搬,所以從 `[]` 開始也拖得動。
 * 2026-11-15 前直接用 `columnOrder`:`[]` 時拖曳找不到位置 → 拖了沒反應;沒寫到的面板欄不列出來 → 收不起也拖不動。
 * 拖曳改成必填之後 consumer 很容易從 TanStack 的初始值 `[]` 開始,所以一起修(【AI 推導 2026-11-15】)。
 */
function resolveFullOrder(columnOrder: readonly string[], columnIds: readonly string[]): string[] {
  const listed = [...new Set(columnOrder)]
  const seen = new Set(listed)
  return [...listed, ...columnIds.filter((id) => !seen.has(id))]
}

function isPanelResetStateEqual(ids: readonly string[], a: PanelResetState, b: PanelResetState): boolean {
  return isVisibilityEqual(ids, a.visibility, b.visibility) && isOrderEqual(a.order, b.order)
}

/**
 * 預設順序(面板列出的那幾欄):產品給了 `defaultColumnOrder` 就照它(面板沒列的 id 略過、它沒寫到的欄照 `columns` 順序接在後面);
 * 沒給 = `columns` 的定義順序,鎖定欄排最前(同 AG Grid resetColumnState 回到欄位定義)。
 */
function resolveDefaultColumnOrder(columnIds: readonly string[], locked: ReadonlySet<string>, defaultColumnOrder: readonly string[] | undefined): string[] {
  if (defaultColumnOrder) {
    const listed = new Set(columnIds)
    const head = [...new Set(defaultColumnOrder)].filter((id) => listed.has(id))
    const placed = new Set(head)
    return [...head, ...columnIds.filter((id) => !placed.has(id))]
  }
  return [...columnIds.filter((id) => locked.has(id)), ...columnIds.filter((id) => !locked.has(id))]
}

/**
 * 把完整順序裡面板那幾欄的位置依序換成 `panelOrder`,面板沒列的 id(例:選取欄)留在原位 —— 同拖曳
 * (`handleDragEnd` 也是在完整順序上搬);完整順序少了的面板欄接在最後(`resolveFullOrder` 已補齊,這裡只是防呆)。
 */
function applyPanelOrder(fullOrder: readonly string[], panelOrder: readonly string[], panelIds: ReadonlySet<string>): string[] {
  const queue = [...panelOrder]
  const next = fullOrder.flatMap((id) => (panelIds.has(id) ? (queue.length > 0 ? [queue.shift()!] : []) : [id]))
  return [...next, ...queue]
}

export const DataTableColumnVisibilityPanel = React.forwardRef<HTMLDivElement, DataTableColumnVisibilityPanelProps>(({
  columns,
  visibility,
  onVisibilityChange,
  columnOrder,
  onColumnOrderChange,
  lockedIds = [],
  defaultVisibility,
  defaultColumnOrder,
  labels: labelsOverride,
  width,
  minWidth,
  maxWidth,
  className,
  style,
  ...props
}, ref) => {
  useWarnBelowPanelFloor('DataTableColumnVisibilityPanel', width, VISIBILITY_PANEL_FLOOR)
  const labels = React.useMemo(() => ({ ...DATA_TABLE_COLUMN_VISIBILITY_PANEL_DEFAULT_LABELS, ...labelsOverride }), [labelsOverride])
  const [search, setSearch] = React.useState('')
  const columnIds = React.useMemo(() => columns.map((c) => c.id), [columns])
  const columnIdSet = React.useMemo(() => new Set(columnIds), [columnIds])
  const lockedSet = React.useMemo(() => new Set(lockedIds), [lockedIds])

  // 完整順序(含面板沒列的 id;consumer 沒寫到的面板欄照 columns 接後面)與面板列出的那幾欄由上到下
  const fullOrder = React.useMemo(() => resolveFullOrder(columnOrder, columnIds), [columnOrder, columnIds])
  const orderedIds = React.useMemo(() => fullOrder.filter((id) => columnIdSet.has(id)), [fullOrder, columnIdSet])

  // 「恢復預設」= 還原這個面板讓人改得動的全部:顯示 / 隱藏 + 順序(拖曳是固定零件,順序恆算)。【AI 推導 2026-11-15】data-table.spec.md L4
  const defaultOrder = React.useMemo(() => resolveDefaultColumnOrder(columnIds, lockedSet, defaultColumnOrder), [columnIds, lockedSet, defaultColumnOrder])
  const current: PanelResetState = { visibility, order: orderedIds }
  // 沒傳 defaultVisibility = 預設全部顯示(沿用「沒寫 = 顯示」)
  const defaults: PanelResetState = { visibility: defaultVisibility ?? {}, order: defaultOrder }
  // 「恢復預設」按下後:焦點交給標題列的 ×、polite 播報結果(lib/panel-bulk-action.tsx,三個面板共用)。
  // 焦點順位照 lib 既有的「加條件鈕 → ×」:這個面板沒有加條件鈕,所以直接給 ×(PopoverHeader 內建、恆渲染)。【AI 推導 2026-11-15】
  const headerRef = React.useRef<HTMLDivElement>(null)
  const bulk = usePanelBulkAction<PanelResetState>({
    value: current,
    isEqual: (a, b) => isPanelResetStateEqual(columnIds, a, b),
    onChange: (next) => {
      onVisibilityChange(next.visibility)
      onColumnOrderChange(applyPanelOrder(fullOrder, next.order, columnIdSet))
    },
    focusTargets: () => [headerRef.current?.querySelector<HTMLElement>('button[data-dismiss]')],
  })
  // 出現條件 = 產品給了預設(顯示或順序至少一份)+ 按下去會改變東西(資料驅動,不另開開關;同排序 / 篩選面板 —— M23(f))
  const hasDefault = defaultVisibility !== undefined || defaultColumnOrder !== undefined
  const showReset = hasDefault && !isPanelResetStateEqual(columnIds, current, defaults)

  const filteredEntries = React.useMemo(() => {
    return orderedIds
      .map((id) => columns.find((c) => c.id === id))
      .filter((c): c is ColumnVisibilityPanelColumn => c != null)
      .filter((c) => (search ? c.label.toLowerCase().includes(search.toLowerCase()) : true))
  }, [orderedIds, columns, search])

  const togglableIds = columns.map((c) => c.id).filter((id) => !lockedSet.has(id))
  const allVisible = togglableIds.every((id) => visibility[id] !== false)

  const handleToggle = (id: string) => {
    const visible = visibility[id] !== false
    onVisibilityChange({ ...visibility, [id]: !visible })
  }

  // 按下後播報結果(同一個 polite 區域;2026-11-21 前無聲):這顆按下去不消失、只把字換成相反的動作,焦點留在它身上,
  // 讀屏不一定唸出聚焦中按鈕換了的名字 → 使用者聽不出欄位已全部顯示 / 隱藏。只改顯示 / 隱藏、不碰順序
  //(第 4 個參數只交出顯示那一半;交給 bulk 的 onChange 會連帶呼叫 onColumnOrderChange)。【AI 推導 2026-11-21】data-table.spec.md L4
  const handleBulkToggle = (e: React.MouseEvent<HTMLElement>) => {
    const next: Record<string, boolean> = {}
    if (allVisible) togglableIds.forEach((id) => { next[id] = false })
    bulk.run(e, { visibility: next, order: orderedIds }, allVisible ? labels.hideAllDone : labels.showAllDone, (n) => onVisibilityChange(n.visibility))
  }

  // C1/B2 修(2026-09-07):先前沒傳 accessibility → 吃 dnd-kit 英文預設,
  // 且它從自己的生命週期播報,不知道下面的守衛已經 return。共用 SSOT 見
  // `lib/drag-announcements.ts`(四個 DndContext 同一份)。
  const outcomeRef = React.useRef<DragOutcome | null>(null)
  // 2026-09-07 C4:先前**完全沒傳 sensors**,於是吃 dnd-kit 預設 —— 零位移的單次
  // pointerdown 就啟動拖曳,使用者只想點一下核取方塊,卻收到 aria-pressed=true 與兩則
  // assertive 播報。門檻值讀 `lib/drag-visual.ts` 的單一來源(全 DS 原本有三個不同答案)。
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX } }),
    useSensor(KeyboardSensor),
  )
  // 繁中播報 + polite 區域 + 繁中操作說明(2026-09-27 OE10;先前交給 dnd-kit 寫死的 assertive 區域)
  const drag = useDragAccessibility({ getOutcome: () => outcomeRef.current, kind: '欄位' })

  const handleDragEnd = (e: DragEndEvent) => {
    outcomeRef.current = null
    const { active, over } = e
    if (!over || active.id === over.id) return
    // 在完整順序上搬(consumer 從 `[]` 開始、或 columnOrder 沒寫到某幾欄也拖得動)
    const oldIdx = fullOrder.indexOf(active.id as string)
    const newIdx = fullOrder.indexOf(over.id as string)
    if (oldIdx < 0 || newIdx < 0) return
    // Locked id 不可被 reorder 動到
    if (lockedSet.has(fullOrder[oldIdx]) || lockedSet.has(fullOrder[newIdx])) return
    const next = [...fullOrder]
    const [m] = next.splice(oldIdx, 1)
    next.splice(newIdx, 0, m)
    outcomeRef.current = { kind: '欄位', label: String(active.id) }
    onColumnOrderChange(next)
  }

  // 2026-07-18 決策16 錯誤史(明記以免再犯):原本這個 panel 是 Fragment + fixed `ScrollArea max-h-72`,
  //   與 sibling FilterPanel/SortManager(root-div + viewport-aware SurfaceBody)不一致。我給過**兩個都錯**
  //   的辯護理由 —— (1)「PopoverHeader 用 -mx 負邊距、包 root 會破壞」= 錯(SurfaceHeader 用正 px-loose+border-b,
  //   無 -mx);(2)「sibling 自刻 header 不用 primitive」= 錯(三 panel 皆消費 SurfaceHeader/PopoverHeader primitive)。
  //   真正差異只是 body/scroll 策略。multi-agent SSOT consistency 稽核定案:**是 drift,該統一**(fixed 288px cap
  //   在高螢幕多欄下劣於 sibling 的 viewport-adaptive;且是唯一不能當 template 複製的 panel)。故下方已改成 canonical shape。
  return (
    // 決策16 定案(2026-07-18,SSOT consistency 稽核後):對齊 sibling FilterPanel/SortManager 的
    //   overlay-surface canonical shape —— root `<div flex flex-col h-full min-h-0>`(M25 viewport-aware
    //   scroll chain)+ viewport-adaptive `PopoverBody`(取代原 fixed `ScrollArea max-h-72`)。三個
    //   DataTable state-panel 收斂成同一形狀,body 隨視窗高度自適應(高螢幕多欄不再硬卡 288px)。
    //   預設寬仍由 consumer 的 `<PopoverContent w-72>` 提供(panel root w-full 撐滿,畫面不變);產品要指定寬走 `width`
    //   (外層 PopoverContent 改 `width="hug"`,同排序 / 篩選面板)+ `minWidth` / `maxWidth`,下限 15.5rem、視窗夾限恆在(lib/panel-width.ts;2026-11-15)。
    // 鍵盤搬欄位(Space 提起、方向鍵移、Esc 取消)時按 Esc 只取消拖曳、面板不關(2026-10-01;lib/drag-announcements.ts useDragAccessibility.escapeLayer)
    <div
      ref={ref}
      className={cn('flex flex-col h-full min-h-0 w-full', className)}
      style={{ ...panelWidthStyle({ width, minWidth, maxWidth }, VISIBILITY_PANEL_FLOOR), ...style }}
      {...props}
      {...drag.escapeLayer}
    >
      {/* 右側「恢復預設 │ ×」走 PopoverHeader 的右側按鈕位(× 與分隔線由 SurfaceHeader 放,兩側各 12;overlay-surface.spec.md「SurfaceHeader」右側按鈕位)。
          2026-11-10 前自刻在 children(hideClose + 外層 gap-1)→ 分隔線兩側只有 8。
          「恢復預設」= 目前(顯示 / 隱藏 + 順序)≠ 產品給的預設才出現,按下回到那一份(2026-11-15 前:resettable 開關 + 有隱藏欄才出現、按下 = 全部顯示)。 */}
      <PopoverHeader
        ref={headerRef}
        actions={showReset ? (
          <Button
            variant="text" size="sm" iconOnly startIcon={RotateCcw}
            aria-label={labels.resetToDefault}
            onClick={(e) => bulk.run(e, defaults, labels.resetToDefaultDone)}
          />
        ) : undefined}
      >
        <PopoverTitle>{labels.title}</PopoverTitle>
      </PopoverHeader>
      {/* 搜尋框:固定零件、恆顯示(2026-11-15 前要傳 searchable 才有 —— M23(f);data-table.spec.md L4「欄位顯示面板的固定零件」) */}
      <div className="shrink-0 px-[var(--layout-space-loose)] pt-[var(--layout-space-tight)]">
        <Input
          size="md"
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchAriaLabel}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          startIcon={Search}
        />
      </div>
      {/* viewport-adaptive body(List-as-region idiom:PopoverBody !px-0 !py-0 撤 chrome padding,
          內層 py-2 給垂直呼吸、row 自帶 px-loose 水平 padding)。取代原 fixed ScrollArea max-h-72。
          拖曳排序:固定零件、恆可用(鎖定欄除外;2026-11-15 前要傳 columnOrder + onColumnOrderChange 才有)。
          --item-prefix-slot = 16px(item-anatomy 的跨元件設定點,分類表登記;稽核 P14):每一列的前綴是 16px 的拖曳把手
          或鎖頭圖示(VisibilityRow),槽寬固定 16 讓兩種前綴的字起點同一條線。不呼叫 getUniformPrefixSlotStyle:
          那支算的是「圖示與頭像混排」時的頭像槽(AVATAR_SIZE.inline 20 / 24 / 24),這裡沒有頭像。 */}
      <PopoverBody className="!px-0 !py-0">
        <div className="py-2 flex flex-col" style={{ '--item-prefix-slot': '16px' } as React.CSSProperties}>
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} accessibility={drag.accessibility}>
            {drag.liveRegion}
            <SortableContext
              items={filteredEntries.map((e) => e.id).filter((id) => !lockedSet.has(id))}
              strategy={verticalListSortingStrategy}
            >
              {filteredEntries.map(({ id, label }) => (
                <VisibilityRow
                  key={id}
                  id={id}
                  label={label}
                  visible={visibility[id] !== false}
                  locked={lockedSet.has(id)}
                  onToggle={() => handleToggle(id)}
                  labels={labels}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </PopoverBody>
      <PopoverFooter className="justify-start">
        <Button variant="tertiary" size="sm" onClick={handleBulkToggle}>
          {allVisible ? labels.hideAll : labels.showAll}
        </Button>
      </PopoverFooter>
      {/* 恆渲染的 polite 區域(sr-only = 不佔版面):「恢復預設」與底部「顯示全部 / 全部隱藏」的結果播報 */}
      {bulk.liveRegion}
    </div>
  )
})
DataTableColumnVisibilityPanel.displayName = 'DataTableColumnVisibilityPanel'

// VisibilityRow:single column row。GripVertical handle 恆在(固定零件);鎖定欄 → Lock icon、不可拖。
function VisibilityRow({
  id, label, visible, locked, onToggle, labels,
}: {
  id: string
  label: string
  visible: boolean
  locked: boolean
  onToggle: () => void
  labels: DataTableColumnVisibilityPanelLabels
}) {
  // Conditional hooks 不行 — 永遠呼 useSortable,鎖定欄 disabled(listeners no-op)
  const sortable = useSortable({ id, disabled: locked })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, ...dragSourceStyle(isDragging) }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-start gap-2 w-full px-[var(--layout-space-loose)]',
        ROW_PADDING_BY_SIZE.md,
      )}
    >
      <ItemPrefix>
        {/* 2026-05-18 改 per user「做完」approval:14 → 16 對齊 uiSize.spec.md Icon Tier */}
        {locked ? (
          <Lock size={16} className="text-fg-muted" aria-hidden />
        ) : (
          <ItemInlineActionButton
            icon={GripVertical}
            size="md"
            aria-label={labels.dragToReorder}
            className="cursor-grab active:cursor-grabbing"
            {...forwardDragActivatorAttributes(attributes)}
            {...listeners}
          />
        )}
      </ItemPrefix>
      <ItemLabel className={locked ? 'text-fg-disabled' : undefined}>{label}</ItemLabel>
      <ItemInlineActionButton
        icon={visible ? Eye : EyeOff}
        size="md"
        aria-label={visible ? labels.hideColumn : labels.showColumn}
        disabled={locked}
        onClick={onToggle}
        className={locked ? 'cursor-not-allowed text-fg-disabled' : ''}
      />
    </div>
  )
}
