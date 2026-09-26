// code-quality-allow: file-size — foundational composite(TreeView owns tree logic + TreeItem + drag-drop + keyboard;拆 sub-component 會把 register/unregister 跨檔傳 ref 複雜化超過可讀性 gain)
import * as React from 'react'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { ChevronRight } from 'lucide-react'
import { cva } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { dragSourceClass, dropIndicatorRow, dropIndicatorInside, DRAG_ACTIVATION_DISTANCE_PX } from '@/design-system/lib/drag-visual'
import { createDragAnnouncements, type DragOutcome } from '@/design-system/lib/drag-announcements'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
// 「列上有小按鈕的一串」鍵盤路線的唯一判定與執行(與 Sidebar / FileUpload / Command 共用;判定表 scripts/test-roving-list-keyboard.mjs
// + 樹專屬格 scripts/test-tree-keyboard-route.mjs;SSOT tree-view.spec.md「鍵盤導覽」,總帳 B9 + 〇節「按鍵規則合併」)
import {
  ROVING_CONTROL_SELECTOR,
  applyRovingAction,
  isTextEntryElement,
  listRovingControls,
  pickRovingTabStop,
  removeRovingControlsFromTabOrder,
  resolveRovingKey,
  type RovingReorderKey,
} from '@/design-system/lib/roving-list-keyboard'
// Row primitive 共用常數——單一 source of truth
import {
  ICON_SIZE,
  RowSizeProvider,
  ItemIcon,
  ItemPrefix,
  ItemSuffix,
  ItemInlineAction,
  ItemInlineActionButton,
  ROW_PADDING_BY_SIZE,
  type InlineActionConfig,
} from '@/design-system/patterns/element-anatomy/item-anatomy'

/**
 * TreeView — 階層結構的遞迴元件
 *
 * 一個 TreeItem 就是一個 node——有 children 就可展開,沒有就是 leaf。
 * 沒有第二個概念(沒有 TreeGroup)。
 *
 * TreeView 負責:
 *   1. 遞迴渲染 + indent
 *   2. 展開/收合狀態管理
 *   3. 鍵盤導覽 + ARIA 樹狀表格(treegrid;2026-09-25 由 tree 改,總帳 B9)
 *
 * 它不管 node 裡面長什麼樣——icon、badge、status indicator 等
 * 由 consumer 透過 props / slots 決定。
 *
 * 詳見 tree-view.spec.md。
 */

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

type SizeKey = 'sm' | 'md' | 'lg'
type SelectionMode = 'single' | 'multiple' | 'none'
/**
 * TreeView 的使用脈絡,決定 item 的水平 padding:
 * - `'sidebar'`:頁面側邊欄,用 `--layout-space-loose` token(md=16px / lg=24px,跟 density 連動)
 * - `'menu'`:浮層選單 / dropdown,取 `--item-px`(預設 12px),**對齊 MenuItem / DropdownMenu**
 */
type TreeContext = 'sidebar' | 'menu'

// Base horizontal padding per context — 用 CSS variable 注入到 TreeView 容器,
// TreeItem 用 calc(var(--tree-px) + indent) 算出最終 paddingLeft。
const CONTEXT_PX_VAR: Record<TreeContext, string> = {
  sidebar: 'var(--layout-space-loose)',  // md=16px, lg=24px(density 連動)
  // 2026-09-17:原本是字面值 `'12px'` + 一句「對齊 MenuItem」的註解 —— 那是第二份,
  // 註解自己就是「它遲早會漂」的自白。改讀同一顆 token(預設 var(--field-px) = 12px,零視覺改動)。
  menu: 'var(--item-px, var(--field-px))', // 對齊 MenuItem / DropdownMenu(owner: item-anatomy.spec.md「Token: --item-px」)
}

/** Drag drop position — 拖放目標的三種位置 */
// code-quality-allow: dead-export — public event/state type — consumer event handler parameter type
export type TreeDropPosition = 'before' | 'after' | 'inside'

/** onDragEnd callback 的參數 */
// code-quality-allow: dead-export — public event/state type — consumer event handler parameter type
export interface TreeDragEndEvent {
  /** 被拖曳的 node id */
  sourceId: string
  /** 目標 node id */
  targetId: string
  /** 放置位置:before(同層上方)/ after(同層下方)/ inside(成為子 node) */
  position: TreeDropPosition
}

/**
 * 鍵盤重排(`Cmd/Ctrl+Shift+方向鍵`,2026-07-14 v1)的 SR 播報文案 — zh-TW 預設,
 * per-key merge 覆寫(i18n 覆寫點)。詳 tree-view.spec.md「鍵盤重排」。
 * @public
 */
// code-quality-allow: dead-export — public prop type — consumer 覆寫播報文案的參數型別
export interface TreeReorderAnnouncements {
  /** 同層上/下移完成。`index` / `count` = 移動後在同層的 1-based 序數 / 同層總數 */
  moved?: (args: { label: string; targetLabel: string; position: 'before' | 'after'; index: number; count: number }) => string
  /** 移入 folder 完成。folder 原本收合(children 尚未 mount)時序數不可知 → `index` / `count` 為 undefined */
  movedInside?: (args: { label: string; folderLabel: string; index?: number; count?: number }) => string
  /** 移出到上層完成。`level` = 移動後所在層(1-based,同 aria-level 語意) */
  movedOut?: (args: { label: string; parentLabel: string; level: number }) => string
  /** 邊界 no-op:top(已在最上方)/ bottom(已在最下方)/ not-folder(無可移入的 folder)/ root(已在最外層) */
  blocked?: (args: { reason: 'top' | 'bottom' | 'not-folder' | 'root'; label: string; targetLabel?: string }) => string
  /** sr-only 操作說明(tree 容器 `aria-describedby` 指向;僅 `draggable` 時渲染) */
  instructions?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

// Icon / chevron 尺寸——從 item-layout pattern module 引入(在檔頂 import),
// 這裡本地不再宣告。所有 row primitives 共用同一個常數。

// indentStep = chevronSize + gap-2(8px)。值 {24,24,28} 與 CSS token `--tree-indent-{sm,md,lg}`
// (`tokens/uiSize/uiSize.css`)**完全一致、必須同步維護**(改一處要兩處一起改;非「token 取代 literal」)。
// 為何兩源並存:本元件 render 用此 JS literal 算 `indentPx`(TreeItem inline calc 需 number)+ drop-indicator
// pointer 數學(handleDragOver px 命中判斷,CSS var 在 JS 計算層拿不到);DataTable nested rows
// 則走 CSS token 的 Tailwind class(跨元件視覺一致)。結構對齊:子 chevron 對齊父 icon,子 icon 對齊父 label。
const INDENT_STEP: Record<SizeKey, number> = { sm: 24, md: 24, lg: 28 }

// 鍵盤重排 SR 播報預設文案(zh-TW;consumer 經 `reorderAnnouncements` prop per-key 覆寫)。
// 格式 =「結果 + 序數位置」— 非視覺使用者靠「第 n 項,共 m 項」建立位置模型
// (世界級 cite 詳 tree-view.spec.md「鍵盤重排」段,M22)。
// i18n-allow-block: DS default SR-only 播報文案,prop 可覆寫(同 select-menu.tsx SelectMenuLiveStatus 先例)
const DEFAULT_REORDER_ANNOUNCEMENTS: Required<TreeReorderAnnouncements> = {
  moved: ({ label, targetLabel, position, index, count }) =>
    `已將『${label}』移到『${targetLabel}』${position === 'before' ? '之前' : '之後'},第 ${index} 項,共 ${count} 項`,
  movedInside: ({ label, folderLabel, index, count }) =>
    index !== undefined && count !== undefined
      ? `已將『${label}』移入『${folderLabel}』,第 ${index} 項,共 ${count} 項`
      : `已將『${label}』移入『${folderLabel}』`,
  movedOut: ({ label, parentLabel, level }) =>
    `已將『${label}』移出到『${parentLabel}』之後,第 ${level} 層`,
  blocked: ({ reason, targetLabel }) => {
    switch (reason) {
      case 'top': return '已在最上方'
      case 'bottom': return '已在最下方'
      case 'not-folder': return targetLabel ? `無法移入:『${targetLabel}』不是資料夾` : '無法移入'
      case 'root': return '已在最外層'
    }
  },
  instructions: '按 Cmd(Ctrl)+Shift+方向鍵可重新排列項目',
}

// ── 樹狀表格的 DOM 查詢(2026-09-25 總帳 B9:由虛擬焦點改為列上的 roving tabindex)──
// 每個 node = 外層 wrapper(`data-tree-id`,無角色)+ 直屬子節點 `role="row"`(`data-tree-row`)
// + 子項容器(`data-tree-children`,Radix Collapsible Content)。列不得包住子列(treegrid 的 row 只能擁有格),
// 所以 aria-level / aria-expanded / aria-selected 都住在 row 上,wrapper 只是結構。
const ROW_SELECTOR = '[data-tree-row]'
const cssEscape = (value: string) =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&')
const rowSelector = (id: string) => `[data-tree-row="${cssEscape(id)}"]`
/** node wrapper 的那一列(直屬子節點) */
const rowOf = (wrapper: Element | null | undefined) => wrapper?.querySelector<HTMLElement>(':scope > [data-tree-row]') ?? null
/**
 * 看得到 = 不在收合中的子樹裡。Radix Collapsible 關閉動畫期間 Content 仍掛著、`data-state="closed"`,
 * 那段時間裡的列不能再被方向鍵走到(舊查詢 `:not([hidden])` 對列本身永遠成立,擋不到)。
 */
const isInOpenBranch = (el: Element) => !el.closest('[data-tree-children][data-state="closed"], [hidden]')
const isRowEnabled = (row: Element) => row.getAttribute('aria-disabled') !== 'true'
/**
 * 動作格裡可以走到的東西 —— 全部 tabIndex=-1,只用 → / ← 走到(總帳 B9;tree-view.spec.md「鍵盤導覽」)。
 * 候選與過濾 = lib/roving-list-keyboard.ts(四個宿主同一份);動作格裡的輸入框 / 可編輯區保留自己的方向鍵,
 * 那一格由共用判定的 `controlIsTextEntry` 處理(2026-09-26 前這裡另有一份 isButtonLike)。
 */
const getRowActions = (row: Element): HTMLElement[] => {
  const cell = row.querySelector<HTMLElement>(':scope > [data-tree-actions]')
  return cell ? listRovingControls(cell) : []
}
const hasAccessibleName = (el: Element) =>
  Boolean(
    el.getAttribute('aria-label')?.trim() ||
      el.getAttribute('aria-labelledby')?.trim() ||
      el.getAttribute('title')?.trim() ||
      el.textContent?.trim(),
  )
const warnedUnnamedAction = new WeakSet<Element>()

// ═══════════════════════════════════════════════════════════════════════════
// Context
// ═══════════════════════════════════════════════════════════════════════════

interface TreeViewContextValue {
  size: SizeKey
  context: TreeContext
  selectionMode: SelectionMode
  expandOnSelect: boolean
  draggable: boolean
  expandedIds: Set<string>
  selectedIds: Set<string>
  /** 焦點最後停在哪一列(真 DOM 焦點,由容器 onFocus 同步) */
  focusedId: string | null
  /** 整棵樹在 Tab 路上唯一的那一站(roving tabindex;總帳 B9) */
  tabStopId: string | null
  /** 目前拖曳中的 node id(null = 沒在拖) */
  draggingId: string | null
  /** 目前 drop indicator 的位置 + depth(用於 line indent) */
  dropTarget: { id: string; position: TreeDropPosition; depth: number } | null
  toggleExpand: (id: string) => void
  select: (id: string) => void
  setFocusedId: (id: string | null) => void
  /** 把 DOM 焦點放到某一列(不捲動;捲動由該列的 isFocused effect 以 block:nearest 處理) */
  focusRow: (id: string) => void
  /** 列卸載時通知(它若是 Tab 停靠點或焦點所在,要重新選一站,否則整棵樹 Tab 不到) */
  onRowUnmount: (id: string) => void
  registerNode: (id: string, parentId: string | null, hasChildren: boolean, label?: React.ReactNode, icon?: LucideIcon) => void
  getNodeInfo: (id: string) => NodeInfo | undefined
  unregisterNode: (id: string) => void
}

const TreeViewContext = React.createContext<TreeViewContextValue | null>(null)

function useTreeView(): TreeViewContextValue {
  const ctx = React.useContext(TreeViewContext)
  if (!ctx) throw new Error('TreeItem must be used within TreeView')
  return ctx
}

// TreeItem depth context(遞迴 depth tracking)
const DepthContext = React.createContext(0)

// ═══════════════════════════════════════════════════════════════════════════
// Node registry — 追蹤所有 node 的 parent/children 關係,用於鍵盤導覽
// ═══════════════════════════════════════════════════════════════════════════

interface NodeInfo {
  id: string
  parentId: string | null
  hasChildren: boolean
  /** 用於 DragOverlay ghost 渲染 */
  label?: React.ReactNode
  icon?: LucideIcon
}

function useNodeRegistry() {
  const nodesRef = React.useRef(new Map<string, NodeInfo>())

  const registerNode = React.useCallback(
    (id: string, parentId: string | null, hasChildren: boolean, label?: React.ReactNode, icon?: LucideIcon) => {
      nodesRef.current.set(id, { id, parentId, hasChildren, label, icon })
    },
    []
  )

  const unregisterNode = React.useCallback((id: string) => {
    nodesRef.current.delete(id)
  }, [])

  const getNodeInfo = React.useCallback((id: string) => nodesRef.current.get(id), [])

  return { nodesRef, registerNode, unregisterNode, getNodeInfo }
}

// ═══════════════════════════════════════════════════════════════════════════
// TreeView
// ═══════════════════════════════════════════════════════════════════════════

export interface TreeViewProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onDragEnd'> {
  /** 元件尺寸,影響 node 高度、icon 大小、indent 寬度 */
  size?: SizeKey
  /**
   * 使用脈絡,決定 item 的水平 padding:
   * - `'sidebar'`(預設):頁面側邊欄,`--layout-space-loose`(md=16px / lg=24px,隨 density 連動)
   * - `'menu'`:浮層選單 / dropdown,px-3(12px),對齊 MenuItem
   */
  context?: TreeContext
  /** 選取模式。預設 'single'(sidebar nav / stepper) */
  selectionMode?: SelectionMode
  /** 點擊 label 時是否同時展開 children。預設 false(chevron 是展開的唯一控件) */
  expandOnSelect?: boolean
  /** 受控:展開的 node id 集合 */
  expandedIds?: Set<string>
  /** 受控:展開狀態變更 callback */
  onExpandedChange?: (ids: Set<string>) => void
  /** 受控:選取的 node id 集合 */
  selectedIds?: Set<string>
  /** 受控:選取狀態變更 callback */
  onSelectedChange?: (ids: Set<string>) => void
  /** 非受控:預設展開的 node id 陣列 */
  defaultExpandedIds?: string[]
  /** 非受控:預設選取的 node id 陣列 */
  defaultSelectedIds?: string[]
  /**
   * 啟用拖曳排序。預設 false。
   * 啟用後整列可拖(Figma 風格,無 grip handle;靠 distance:5 區分 click vs drag),
   * 拖曳時顯示 drop indicator(before / after / inside 三種位置)。
   * Consumer 透過 `onDragEnd` callback 接收 reorder 事件,自行更新 data。
   */
  draggable?: boolean
  /** Drag 結束時觸發,提供 sourceId、targetId、position。Consumer 負責 reorder。 */
  onDragEnd?: (event: TreeDragEndEvent) => void
  /**
   * 鍵盤重排(`Cmd/Ctrl+Shift+方向鍵`)的 SR 播報文案覆寫(per-key merge;zh-TW 預設)。
   * 僅在 `draggable` 時生效;含 `instructions`(sr-only 操作說明)。
   * @public
   */
  reorderAnnouncements?: TreeReorderAnnouncements
  /** ARIA label */
  'aria-label'?: string
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const TreeView = React.forwardRef<HTMLDivElement, TreeViewProps>(
  (
    {
      size = 'md',
      context = 'sidebar',
      selectionMode = 'single',
      expandOnSelect = false,
      draggable = false,
      onDragEnd: onDragEndProp,
      reorderAnnouncements: reorderAnnouncementsProp,
      expandedIds: controlledExpanded,
      onExpandedChange,
      selectedIds: controlledSelected,
      onSelectedChange,
      defaultExpandedIds = [],
      defaultSelectedIds = [],
      className,
      children,
      ...props
    },
    ref
  ) => {
    // ── Accessible name dev-warn(2026-07-18:兌現 spec「Accessible name 必填契約」段承諾 —
    //    原 spec 宣稱有此 console.warn 但 code 缺,spec-code drift;補上使兩者一致)──
    //    role="treegrid" 名稱無法從子節點推導,缺 aria-label / aria-labelledby → SR 只讀出角色名。
    //    對齊 Button / Tag 的 dev-only 誤用警告 idiom;production 不觸發。
    const ariaLabel = props['aria-label']
    const ariaLabelledby = props['aria-labelledby']
    React.useEffect(() => {
      if (
        process.env.NODE_ENV !== 'production' &&
        ariaLabel == null &&
        ariaLabelledby == null
      ) {
        console.warn(
          '[DS] TreeView:role="treegrid" 缺 accessible name — 請傳 aria-label(直接字串)或 aria-labelledby(指向可見標題 id)其一。' +
            '兩者皆缺時螢幕閱讀器只讀出角色名、無法辨識用途(WAI-ARIA 要求 treegrid 具 accessible name)。',
        )
      }
    }, [ariaLabel, ariaLabelledby])

    // ── Expand state(受控 / 非受控) ──
    const [internalExpanded, setInternalExpanded] = React.useState(
      () => new Set(defaultExpandedIds)
    )
    const expandedIds = controlledExpanded ?? internalExpanded
    const setExpandedIds = React.useCallback(
      (updater: (prev: Set<string>) => Set<string>) => {
        const update = (prev: Set<string>) => {
          const next = updater(prev)
          onExpandedChange?.(next)
          return next
        }
        if (controlledExpanded) {
          update(controlledExpanded)
        } else {
          setInternalExpanded(update)
        }
      },
      [controlledExpanded, onExpandedChange]
    )

    // ── Selection state(受控 / 非受控) ──
    const [internalSelected, setInternalSelected] = React.useState(
      () => new Set(defaultSelectedIds)
    )
    const selectedIds = controlledSelected ?? internalSelected
    const setSelectedIds = React.useCallback(
      (updater: (prev: Set<string>) => Set<string>) => {
        const update = (prev: Set<string>) => {
          const next = updater(prev)
          onSelectedChange?.(next)
          return next
        }
        if (controlledSelected) {
          update(controlledSelected)
        } else {
          setInternalSelected(update)
        }
      },
      [controlledSelected, onSelectedChange]
    )

    // ── Focus state(2026-09-25 總帳 B9:虛擬焦點 → 列上的 roving tabindex)──
    // 真 DOM 焦點落在列(role="row")或列裡的按鈕上;focusedId 由容器 onFocus 同步。
    // 為何改:樹狀表格要讓 → 把焦點**真的**交給列裡的按鈕、← 再交回列 —— 這一步本來就是真焦點,
    // 列若維持虛擬焦點,同一棵樹就有兩種焦點模型。W3C 樹狀表格範例與 Adobe 的樹都是列上真焦點
    // (來源見 tree-view.spec.md「A11y 預設」)。
    const [focusedId, setFocusedId] = React.useState<string | null>(null)
    const treeRef = React.useRef<HTMLDivElement>(null)
    React.useImperativeHandle(ref, () => treeRef.current!)
    const focusRow = React.useCallback((id: string) => {
      treeRef.current?.querySelector<HTMLElement>(rowSelector(id))?.focus({ preventScroll: true })
    }, [])

    // ── 唯一的 Tab 停靠點(roving tabindex)──
    // 順序:焦點最後停的那一列(仍看得到)→ 選中的第一列 → 第一個可用列
    // (W3C keyboard-interface「進入組合元件時落在選中項,沒有就第一項」;來源見 spec)。
    // 每次 render 後在 layout 階段重算(列的展開 / 選取 / 卸載都會改變答案),相同就不 setState,不會迴圈。
    const [tabStopId, setTabStopId] = React.useState<string | null>(null)
    // 只用來觸發一次 re-render(值本身不讀):列卸載後讓下方 layout effect 重算停靠點
    const [, setRowRepairTick] = React.useState(0)
    const tabStopRef = React.useRef<string | null>(null)
    tabStopRef.current = tabStopId
    const focusedIdRef = React.useRef<string | null>(null)
    focusedIdRef.current = focusedId
    React.useLayoutEffect(() => {
      const tree = treeRef.current
      if (!tree) return
      const rows = Array.from(tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)).filter(isInOpenBranch)
      // 判定與 Sidebar / FileUpload 同一份(X1;lib/roving-list-keyboard.ts `pickRovingTabStop`)。
      // 焦點停過的列即使停用也還拿得住焦點(← 回上一層可能落在停用列),所以 canHoldFocus 恆真;「選中」「第一列」只算可用列。
      const stop = pickRovingTabStop(rows, {
        remembered: focusedId != null ? rows.find((row) => row.dataset.treeRow === focusedId) ?? null : null,
        canHoldFocus: () => true,
        isNavigable: isRowEnabled,
        isCurrent: (row) => row.getAttribute('aria-selected') === 'true',
      })
      const next = stop?.dataset.treeRow ?? null
      if (next !== tabStopId) setTabStopId(next)
    })
    // 列被卸載(例:consumer 收合了焦點所在列的上一層,關閉動畫結束後子樹才卸載 —— 那一刻 TreeView 本身不會 re-render)
    // → 若它是停靠點或焦點所在,觸發一次重算,否則整棵樹會從 Tab 路上消失。
    const onRowUnmount = React.useCallback((id: string) => {
      if (id === tabStopRef.current || id === focusedIdRef.current) setRowRepairTick((tick) => tick + 1)
    }, [])

    // ── DOM id prefix(重排操作說明節點的 id)──
    // useId 確保多棵 TreeView 同頁時 DOM id 不撞。
    const idPrefix = React.useId()

    // ── 鍵盤重排 SR 播報(2026-07-14 v1;詳 spec「鍵盤重排」)──
    // 單一 polite live region 覆寫式更新(textContent 替換非 append → 快速連按天然只播最新)。
    // 不可借 dnd-kit DndContext 內建 live region — 它只播 dnd-kit 管理的 drag session,
    // 自建鍵盤路徑觸不到。消費 select-menu.tsx SelectMenuLiveStatus role="status" 先例。
    const [reorderAnnouncement, setReorderAnnouncement] = React.useState('')
    const announcements = React.useMemo(
      () => ({ ...DEFAULT_REORDER_ANNOUNCEMENTS, ...reorderAnnouncementsProp }),
      [reorderAnnouncementsProp]
    )
    // sr-only 操作說明節點 id(tree 容器 aria-describedby 指向;僅 draggable 渲染)
    const reorderInstructionsId = `${idPrefix}tree-reorder-instructions`

    // ── Drag state ──
    const [draggingId, setDraggingId] = React.useState<string | null>(null)
    const [dropTarget, setDropTarget] = React.useState<{ id: string; position: TreeDropPosition; depth: number } | null>(null)
    const autoExpandTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    // 2026-05-16 audit codex Round 6:unmount cleanup(原 cleanup 只在 dragEnd/dragCancel,unmount-during-drag 漏 cancel)
    React.useEffect(() => () => { if (autoExpandTimerRef.current) clearTimeout(autoExpandTimerRef.current) }, [])
    // Ref for toggleExpand — handleDragOver 定義在 toggleExpand 之前(hook 順序限制),
    // 用 ref 打斷 temporal dead zone。
    const toggleExpandRef = React.useRef<(id: string) => void>(() => {})

    // ── Node registry ──(2026-07-14 上移至 drag handlers 之前:isInSubtree 消費 getNodeInfo,
    // 而 handleDragOver / handleDragEnd / 鍵盤 reorder 都消費 isInSubtree)
    const { registerNode, unregisterNode, getNodeInfo } = useNodeRegistry()

    // 子樹判定:candidate 是否位於 rootId 的子樹內(含相等)。沿 registry parentId 鏈上溯。
    // 雙路共用 SSOT:pointer 路徑 descendant drop guard(2026-07-14 R6 修:原 handleDragOver 只擋
    // `over.id === active.id` 未擋 descendants → 可發出 targetId ∈ source 子樹的非法事件,
    // consumer 按 remove→insert 實作會讓整個子樹靜默消失)+ 鍵盤 reorder commit 前防禦 assert。
    const isInSubtree = React.useCallback(
      (candidateId: string, rootId: string): boolean => {
        let cur: string | null = candidateId
        while (cur != null) {
          if (cur === rootId) return true
          cur = getNodeInfo(cur)?.parentId ?? null
        }
        return false
      },
      [getNodeInfo]
    )

    const sensors = useSensors(
      // 2026-09-07:5 → DRAG_ACTIVATION_DISTANCE_PX(8)。全 DS 原本三個值(8/5/8)加一處沒設,
      // 收斂到單一來源;8 是原本的多數,其中 AgentFab 那個 8 還是 user 實際用過調出來的。
      useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX } })
    )

    const handleDragStart = React.useCallback((event: DragStartEvent) => {
      setDraggingId(String(event.active.id))
    }, [])

    // ── Figma-style drop detection(X + Y 雙軸）──
    //
    // Y 軸:決定在哪個 item 附近
    //   - item 上 25% = before
    //   - item 中 50% = inside(只有 folder)
    //   - item 下 25% = after
    //
    // X 軸:決定 nesting 深度(Figma 核心邏輯)
    //   - 滑鼠越左 = 越淺層(放在 parent 層級)
    //   - 滑鼠越右 = 越深層(放進 folder)
    //   - 用 pointer X 相對於 tree 左邊界計算 indent level
    //
    const handleDragOver = React.useCallback((event: DragOverEvent) => {
      const { over, active } = event
      // 2026-07-14 R6 descendant guard:over 是 active 自己「或其子樹內節點」→ 無效目標,
      // 不設 dropTarget(拖 folder 進自己子樹會發出非法 TreeDragEndEvent;guard SSOT = isInSubtree,
      // 鍵盤 reorder 路徑共用同一 helper)。
      if (!over || isInSubtree(String(over.id), String(active.id))) {
        if (autoExpandTimerRef.current) { clearTimeout(autoExpandTimerRef.current); autoExpandTimerRef.current = null }
        setDropTarget(null)
        return
      }

      const rowEl = document.querySelector(`[data-tree-row="${over.id}"]`) as HTMLElement | null
      const targetEl = document.querySelector(`[data-tree-id="${over.id}"]`) as HTMLElement | null
      if (!rowEl || !targetEl) { setDropTarget(null); return }

      // 實際指標位置
      const startX = (event.activatorEvent as PointerEvent)?.clientX ?? 0
      const startY = (event.activatorEvent as PointerEvent)?.clientY ?? 0
      const currentX = startX + (event.delta?.x ?? 0)
      const currentY = startY + (event.delta?.y ?? 0)

      const rect = rowEl.getBoundingClientRect()
      const offsetY = currentY - rect.top
      const height = rect.height || 32
      const ratio = Math.max(0, Math.min(1, offsetY / height))

      const hasChildren = targetEl.dataset.treeHasChildren === 'true'
      // 2026-09-25:aria-level 從 wrapper 搬到列(role="row")上(樹狀表格的層級屬性住在列)
      const targetDepth = Number(rowEl.getAttribute('aria-level') ?? 1) - 1

      // ── X 軸:計算指標在哪個 indent level ──
      const treeEl = treeRef.current
      const treeLeft = treeEl?.getBoundingClientRect().left ?? 0
      const indentStep = INDENT_STEP[size]
      const pointerIndentLevel = Math.max(0, Math.floor((currentX - treeLeft) / indentStep))

      let position: TreeDropPosition
      let finalDepth = targetDepth

      if (hasChildren) {
        // Folder node
        if (ratio < 0.25) {
          position = 'before'
        } else if (ratio > 0.75) {
          // after folder: 如果指標在 folder 層級或更淺 = after(同層)
          // 如果指標更深 = inside(放進 folder)
          position = pointerIndentLevel > targetDepth ? 'inside' : 'after'
        } else {
          position = 'inside'
        }
      } else {
        // Leaf node
        if (ratio < 0.5) {
          position = 'before'
        } else {
          position = 'after'
          // X 軸:如果指標在比 target 更淺的層級,提升 drop depth
          // 例:Contact(depth 1)的 after,如果滑鼠在 depth 0 → 變成「after Pages」
          if (pointerIndentLevel < targetDepth) {
            // 找 parent 來放(2026-09-25:原本沿 role="group" / role="treeitem" 上溯,treegrid 沒有這兩個角色 → 改讀 wrapper 記的 parent id)
            const parentId = targetEl.dataset.treeParentId || null
            const parentRow = parentId ? treeEl?.querySelector<HTMLElement>(rowSelector(parentId)) ?? null : null
            if (parentId && parentId !== String(active.id)) {
              const parentDepth = Number(parentRow?.getAttribute('aria-level') ?? 1) - 1
              finalDepth = parentDepth
              setDropTarget(prev => prev && prev.id === parentId && prev.position === 'after' && prev.depth === parentDepth ? prev : { id: parentId, position: 'after', depth: parentDepth })
              return
            }
          }
        }
      }

      // 2026-07-06 D3 perf:bail-out — drop target 未變(每 dragOver 跨 row 才變)時回傳 prev,
      // React 對相同 reference bail out,避免每次 over 事件重建 contextValue → 全樹 TreeItem re-render。
      setDropTarget(prev => {
        const id = String(over.id)
        return prev && prev.id === id && prev.position === position && prev.depth === finalDepth ? prev : { id, position, depth: finalDepth }
      })

      // Auto-expand collapsed folder after 500ms hover (Figma behavior)
      if (position === 'inside' && hasChildren && !expandedIds.has(String(over.id))) {
        if (autoExpandTimerRef.current) clearTimeout(autoExpandTimerRef.current)
        autoExpandTimerRef.current = setTimeout(() => {
          toggleExpandRef.current(String(over.id))
        }, 500)
      } else {
        if (autoExpandTimerRef.current) { clearTimeout(autoExpandTimerRef.current); autoExpandTimerRef.current = null }
      }
    }, [expandedIds, isInSubtree, size])

    const dropTargetRef = React.useRef(dropTarget)
    dropTargetRef.current = dropTarget

    // C2/B2 修(2026-09-07):TreeView 自有的繁中播報只有**鍵盤重排**那條路在寫,
    // 滑鼠拖曳走的是 dnd-kit 的英文預設 —— 實測整趟拖曳下來自有播報區維持空字串。
    // 這裡把指標路徑也接上,並誠實回報結果:守衛擋下(不合法 target / 子樹內)
    // 就播「未變更」而不是假的成功。共用 SSOT 見 `lib/drag-announcements.ts`。
    const dragOutcomeRef = React.useRef<DragOutcome | null>(null)
    const dndAnnouncements = React.useMemo(
      () => createDragAnnouncements({ getOutcome: () => dragOutcomeRef.current, kind: '項目' }),
      [],
    )

    const handleDragEnd = React.useCallback((event: DragEndEvent) => {
      dragOutcomeRef.current = null
      if (autoExpandTimerRef.current) { clearTimeout(autoExpandTimerRef.current); autoExpandTimerRef.current = null }
      const { active, over } = event
      const dt = dropTargetRef.current
      // descendant guard 同 handleDragOver(dt 已由 dragOver guard 保證為 null,此為 belt-and-braces)
      if (over && !isInSubtree(String(over.id), String(active.id)) && dt) {
        dragOutcomeRef.current = { kind: '項目', label: String(active.id) }
        onDragEndProp?.({
          sourceId: String(active.id),
          targetId: String(over.id),
          position: dt.position,
        })
      }
      setDraggingId(null)
      setDropTarget(null)
    }, [onDragEndProp, isInSubtree])

    const handleDragCancel = React.useCallback(() => {
      if (autoExpandTimerRef.current) { clearTimeout(autoExpandTimerRef.current); autoExpandTimerRef.current = null }
      setDraggingId(null)
      setDropTarget(null)
    }, [])

    // ── Actions ──
    const toggleExpand = React.useCallback(
      (id: string) => {
        setExpandedIds((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      },
      [setExpandedIds]
    )
    toggleExpandRef.current = toggleExpand

    const select = React.useCallback(
      (id: string) => {
        if (selectionMode === 'none') return
        setSelectedIds((prev) => {
          if (selectionMode === 'single') {
            return new Set([id])
          }
          // multiple
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      },
      [selectionMode, setSelectedIds]
    )

    // ── Keyboard reorder(Cmd/Ctrl+Shift+方向鍵,2026-07-14 v1)──
    // 設計 SSOT:tree-view.spec.md「鍵盤重排」。與 pointer 路徑共用 TreeDragEndEvent 契約 +
    // onDragEnd prop + registry(consumer API 零改動);每按一下立即 commit(無 grab-mode /
    // 無預覽,對齊 Notion Cmd/Ctrl+Shift+Arrow 移動 block:https://www.notion.com/help/keyboard-shortcuts,
    // WebFetch 驗證紀錄 .claude/logs/treeview-keyboard-dnd-design.md#L25)。
    // 不用 dnd-kit KeyboardSensor:它是「按住 → 方向鍵搬 → 放開」的抓取模式(https://dndkit.com/api-documentation/sensors/keyboard),
    // 啟動鍵是 Enter / 空白鍵 —— 本元件那兩個鍵是「選取目前列」;每按即 commit 的語意也與抓取模式不同。
    // (2026-09-25 更正:舊理由「列不可聚焦、與虛擬焦點結構性不相容」在列改為真焦點後已不成立。)

    // 播報用 label 文字:registry label 是 ReactNode — string 直接用,否則退 DOM row textContent。
    const getNodeLabelText = React.useCallback(
      (id: string): string => {
        const info = getNodeInfo(id)
        if (typeof info?.label === 'string') return info.label
        const rowEl = treeRef.current?.querySelector<HTMLElement>(rowSelector(id))
        return rowEl?.textContent?.trim() || id
      },
      [getNodeInfo]
    )

    // code-quality-allow: long-function — 四鍵語意(同層上下 / 移入 / 移出)+ 邊界播報結構緊密,
    // 拆 sub-fn 會跨 fn 傳 siblings / announce state 反而複雜(同 handleKeyDownCapture 先例)
    const handleKeyboardReorder = React.useCallback(
      (key: RovingReorderKey, sourceId: string) => {
        const tree = treeRef.current
        if (!tree) return
        const sourceEl = tree.querySelector<HTMLElement>(`[data-tree-id="${cssEscape(sourceId)}"]`)
        // disabled node 不可移(鍵盤導覽本就跳過 disabled,此為防禦 guard)
        if (!sourceEl || !isRowEnabled(rowOf(sourceEl) ?? sourceEl)) return

        const label = getNodeLabelText(sourceId)
        // 同層 siblings(DOM 序)。focused node 可見 ⇒ 其 parent 已展開 ⇒ 全 siblings 已 mount。
        const parentId = sourceEl.dataset.treeParentId || null
        const visibleItems = Array.from(
          tree.querySelectorAll<HTMLElement>('[data-tree-id]')
        ).filter(isInOpenBranch)
        const siblings = visibleItems.filter((el) => (el.dataset.treeParentId || null) === parentId)
        const sourceIndex = siblings.findIndex((el) => el.dataset.treeId === sourceId)
        if (sourceIndex < 0) return
        const isEnabled = (el: HTMLElement) => isRowEnabled(rowOf(el) ?? el)

        // 發出與 pointer 路徑同型的 TreeDragEndEvent,並排定 re-render 後 scrollIntoView
        // (既有 effect 只在 isFocused 變化時跑;同 id 移動不 re-fire,故此處補)。
        const commit = (targetId: string, position: TreeDropPosition): boolean => {
          // 結構安全 assert:四鍵語意(sibling 間 / 進 prev sibling / 出 parent)結構上
          // 不可能移進自己子樹;防禦性仍擋(與 pointer descendant guard 共用 isInSubtree SSOT)。
          if (targetId === sourceId || isInSubtree(targetId, sourceId)) return false
          onDragEndProp?.({ sourceId, targetId, position })
          requestAnimationFrame(() => {
            const movedRow = treeRef.current?.querySelector<HTMLElement>(rowSelector(sourceId))
            movedRow?.scrollIntoView({ block: 'nearest' })
            // 2026-09-25(總帳 B9 改真焦點後):React 搬動 / 重掛那一列時,瀏覽器會把焦點丟到 body ——
            // 鍵盤使用者按完一下就失去位置。焦點還給被移動的那一列(虛擬焦點時代靠 aria-activedescendant 自動跟上)。
            if (movedRow && document.activeElement !== movedRow) movedRow.focus({ preventScroll: true })
          })
          return true
        }

        // 同層移動後的 1-based 新序數(播報用):移除 source 再插入的模擬;同層總數不變。
        const movedIndex = (targetId: string, position: 'before' | 'after'): number => {
          const order = siblings.map((el) => el.dataset.treeId).filter((id) => id !== sourceId)
          const tIdx = order.indexOf(targetId)
          return (position === 'before' ? tIdx : tIdx + 1) + 1
        }

        switch (key) {
          case 'ArrowUp':
          case 'ArrowDown': {
            // disabled sibling 不可當 target 錨點(pointer useDroppable 同樣 disable)——
            // 相鄰 sibling disabled 時錨到最近 enabled sibling 並翻轉 before/after 表達同一插槽
            // (可達位置與 pointer 一致);整個方向皆無 enabled sibling → 視同邊界。
            const dir = key === 'ArrowUp' ? -1 : 1
            const boundary = dir < 0 ? ('top' as const) : ('bottom' as const)
            const adjacent = siblings[sourceIndex + dir]
            if (!adjacent) {
              setReorderAnnouncement(announcements.blocked({ reason: boundary, label }))
              return
            }
            let target: HTMLElement | undefined
            let position: 'before' | 'after' = dir < 0 ? 'before' : 'after'
            if (isEnabled(adjacent)) {
              target = adjacent
            } else {
              for (let i = sourceIndex + dir; i >= 0 && i < siblings.length; i += dir) {
                if (isEnabled(siblings[i])) { target = siblings[i]; break }
              }
              position = dir < 0 ? 'after' : 'before' // 錨到最近 enabled sibling 的另一側 = 相鄰插槽
            }
            if (!target) {
              setReorderAnnouncement(announcements.blocked({ reason: boundary, label }))
              return
            }
            const targetId = target.dataset.treeId!
            if (commit(targetId, position)) {
              setReorderAnnouncement(
                announcements.moved({
                  label,
                  targetLabel: getNodeLabelText(targetId),
                  position,
                  index: movedIndex(targetId, position),
                  count: siblings.length,
                })
              )
            }
            return
          }
          case 'ArrowRight': {
            // 移入:成為最近 enabled 上一 sibling 的子項(沿用 pointer「inside 限 folder」規則)
            let target: HTMLElement | undefined
            for (let i = sourceIndex - 1; i >= 0; i--) {
              if (isEnabled(siblings[i])) { target = siblings[i]; break }
            }
            if (!target) {
              setReorderAnnouncement(announcements.blocked({ reason: 'not-folder', label }))
              return
            }
            const targetId = target.dataset.treeId!
            if (target.dataset.treeHasChildren !== 'true') {
              setReorderAnnouncement(
                announcements.blocked({ reason: 'not-folder', label, targetLabel: getNodeLabelText(targetId) })
              )
              return
            }
            const wasExpanded = expandedIds.has(targetId)
            if (commit(targetId, 'inside')) {
              // 移入 collapsed folder:允許 + 自動展開(pointer 500ms hover auto-expand 的鍵盤對應物)
              if (!wasExpanded) toggleExpand(targetId)
              // 序數:consumer 對 inside 的慣例語意 = append 到 children 尾端;
              // folder 原收合 → children 未 mount 無從計數 → 播報省略序數(誠實不猜)。
              const childCount = wasExpanded
                ? visibleItems.filter((el) => el.dataset.treeParentId === targetId).length
                : undefined
              setReorderAnnouncement(
                announcements.movedInside({
                  label,
                  folderLabel: getNodeLabelText(targetId),
                  index: childCount !== undefined ? childCount + 1 : undefined,
                  count: childCount !== undefined ? childCount + 1 : undefined,
                })
              )
            }
            return
          }
          case 'ArrowLeft': {
            // 移出:成為 parent 的下一個 sibling(outdent)
            if (!parentId) {
              setReorderAnnouncement(announcements.blocked({ reason: 'root', label }))
              return
            }
            const parentRow = tree.querySelector<HTMLElement>(rowSelector(parentId))
            const level = Number(parentRow?.getAttribute('aria-level') ?? '1')
            if (commit(parentId, 'after')) {
              setReorderAnnouncement(
                announcements.movedOut({ label, parentLabel: getNodeLabelText(parentId), level })
              )
            }
            return
          }
        }
      },
      [expandedIds, toggleExpand, onDragEndProp, getNodeLabelText, isInSubtree, announcements]
    )

    // ── Context value ──
    const contextValue = React.useMemo<TreeViewContextValue>(
      () => ({
        size,
        context,
        selectionMode,
        expandOnSelect,
        draggable,
        draggingId,
        dropTarget,
        expandedIds,
        selectedIds,
        focusedId,
        tabStopId,
        toggleExpand,
        select,
        setFocusedId,
        focusRow,
        onRowUnmount,
        registerNode,
        unregisterNode,
        getNodeInfo,
      }),
      [
        size,
        context,
        selectionMode,
        expandOnSelect,
        draggable,
        draggingId,
        dropTarget,
        expandedIds,
        selectedIds,
        focusedId,
        tabStopId,
        toggleExpand,
        select,
        setFocusedId,
        focusRow,
        onRowUnmount,
        registerNode,
        unregisterNode,
        getNodeInfo,
      ]
    )

    // ── Keyboard handler(2026-09-25 總帳 B9:樹狀表格路線;2026-09-26 判定與執行併入共用零件)──
    // 判定 = lib/roving-list-keyboard.ts `resolveRovingKey`(與 Sidebar / FileUpload / Command 同一份按鍵表),
    // 執行 = 同檔 `applyRovingAction`;這裡只讀樹自己的 DOM 狀態(哪一列、展開與否、上一層),以及重排。
    // 用 capture(同 Sidebar):方向鍵整串歸樹,搶在列上按鈕自己的處理之前 —— 列上的選單鈕按 ↓ 換下一列、
    // 不開選單(X6「統一成側欄做法」;開選單用 Enter / 空白鍵)。2026-09-26 之前在冒泡階段,選單鈕的 ↓ 讓給 Radix 開選單。
    // 不包 useCallback:它只掛在一個 DOM 節點上,每次 render 讀最新的 props.onKeyDownCapture / expandedIds(同下方 onFocus)
    const handleKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
      ;(props as React.HTMLAttributes<HTMLDivElement>).onKeyDownCapture?.(e)
      const tree = treeRef.current
      if (!tree) return
      const target = e.target as HTMLElement
      // React 合成事件會穿過 portal 傳遞(例:列上選單鈕打開的選單),DOM 上不在這棵樹裡的一律不管
      if (!tree.contains(target)) return
      const row = target.closest<HTMLElement>(ROW_SELECTOR)
      const id = row?.dataset.treeRow
      if (!row || !id) return
      const onRow = target === row
      const actions = getRowActions(row)
      // 列裡不在動作格的東西(展開箭頭、勾選框:都是 tabIndex=-1 的視覺件):交給它自己
      if (!onRow && !actions.includes(target)) return

      const wrapper = row.closest<HTMLElement>('[data-tree-id]')
      const parentId = wrapper?.dataset.treeParentId || null
      const action = resolveRovingKey({
        key: e.key,
        focus: onRow ? 'item' : 'control',
        controlCount: actions.length,
        controlIndex: onRow ? -1 : actions.indexOf(target),
        controlIsTextEntry: !onRow && isTextEntryElement(target),
        tree: { hasChildren: wrapper?.dataset.treeHasChildren === 'true', expanded: expandedIds.has(id), hasParent: parentId != null },
        // 未啟用拖曳 → 重排組合整組 no-op(modifier 組合不落入導覽)
        reorderable: draggable,
        defaultPrevented: e.defaultPrevented,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
      })
      if (action.type === 'reorder') {
        e.preventDefault() // 阻止瀏覽器原生行為(捲動 / 文字選取)
        if (draggingId !== null) return // pointer 拖曳進行中 → 互斥,忽略鍵盤重排
        handleKeyboardReorder(action.key, id)
        return
      }
      // 看得到的列(DOM 序)。停用列不是方向鍵的落點(既有規則),但焦點可能經 ← 停在停用的上一層,
      // 所以相鄰列以 DOM 序從目前這一列往前 / 往後找第一個可用列(pickRovingTarget)。
      applyRovingAction(action, {
        event: e,
        item: row,
        controls: actions,
        items: Array.from(tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)).filter(isInOpenBranch),
        isNavigable: isRowEnabled,
        focusOptions: { preventScroll: true },
        onExpand: () => toggleExpand(id),
        onCollapse: () => toggleExpand(id),
        onParent: () => { if (parentId) focusRow(parentId) },
        onActivateItem: () => select(id),
      })
    }

    const treeEl = (
      <div
        // {...props} 在最前:內部 role/style(--tree-px)/onKeyDownCapture 必須勝過 consumer
        // 誤傳(原 spread 在最後 → consumer style 會整組蓋掉 --tree-px、鍵盤 handler 蓋掉鍵盤導覽);
        // consumer 的 onKeyDownCapture 由 handleKeyDownCapture 先呼叫再接手(同 SidebarMenu)
        {...props}
        ref={treeRef}
        // 2026-09-25 總帳 B9:tree → treegrid。W3C 只在樹狀表格定義了「列上的按鈕」怎麼走
        // (來源見 tree-view.spec.md「A11y 預設」);容器本身不再可聚焦,唯一的 Tab 停靠點是 tabStopId 那一列。
        role="treegrid"
        aria-multiselectable={selectionMode === 'multiple' || undefined}
        // 鍵盤重排操作說明(sr-only,僅 draggable;與 consumer 傳入的 aria-describedby 合併)
        aria-describedby={
          [props['aria-describedby'], draggable ? reorderInstructionsId : undefined]
            .filter(Boolean)
            .join(' ') || undefined
        }
        className={cn(
          // TreeView root 不加任何 py——呼吸空間由外層容器負責:
          //   - 在 SidebarGroup 內: SidebarGroup py-2 提供
          //   - 在 DropdownMenuContent 內: content py-2 提供
          //   - 獨立使用(story demo): consumer 自己加 py-2
          // 這樣才能跟 DropdownMenu / MenuGroup 的結構一致(group 是容器,row 是內容)。
          // 2026-09-25:原本這裡的「有 aria-activedescendant 才抑制容器外框」(@focus-suppress A)隨虛擬焦點一起拿掉 ——
          // 容器已不可聚焦,框由拿到真焦點的那一列自己畫(TreeItem 列的 focus-visible:focus-ring-inset)。
          'flex flex-col',
          className,
        )}
        style={{
          ['--tree-px' as string]: CONTEXT_PX_VAR[context],
          ...props.style,
        } as React.CSSProperties}
        onKeyDownCapture={handleKeyDownCapture}
        // 焦點落在任何一列或列裡的按鈕 → 記下是哪一列(它就是下一次 Tab 進來的落點;總帳 B9)
        onFocus={(e) => {
          ;(props as React.HTMLAttributes<HTMLDivElement>).onFocus?.(e)
          const tree = treeRef.current
          const target = e.target as HTMLElement
          // React 合成的 focus 事件也會穿過 portal 冒泡;只認 DOM 上在這棵樹裡的
          if (!tree || !tree.contains(target)) return
          const id = target.closest<HTMLElement>(ROW_SELECTOR)?.dataset.treeRow
          if (id && id !== focusedIdRef.current) setFocusedId(id)
        }}
      >
        {children}
      </div>
    )

    return (
      <TreeViewContext.Provider value={contextValue}>
        {/* RowSizeProvider:讓 TreeView 子樹內任何 <ItemIcon> / <ItemAvatar> /
            <ItemInlineAction> 自動讀到對的 size,跟 SidebarProvider 同一條規則。
            inlineActions API 也吃這個 context。 */}
        <RowSizeProvider value={size}>
        {/* 永遠包 DndContext(hooks 不能 conditional call)。不 draggable 時無 sensors = 不可拖 */}
        <DndContext
          sensors={draggable ? sensors : undefined}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          accessibility={{ announcements: dndAnnouncements }}
        >
          {treeEl}
          {draggable && (
            <>
              {/* 鍵盤重排 SR 播報 — TreeView 自有 sr-only polite live region(單一節點覆寫式更新;
                  消費 select-menu.tsx SelectMenuLiveStatus 先例)。渲染在 role="treegrid" 之外
                  (treegrid 的合法 children 只有 row / rowgroup);dnd-kit DndContext 內建 live region
                  只播 dnd-kit drag session,自建鍵盤路徑觸不到,故必須自有。 */}
              <div role="status" aria-live="polite" className="sr-only">
                {reorderAnnouncement}
              </div>
              {/* 鍵盤重排操作說明 — tree 容器 aria-describedby 指向(對齊 dnd-kit
                  screenReaderInstructions 慣例:https://dndkit.com/guides/accessibility) */}
              <div id={reorderInstructionsId} className="sr-only">
                {announcements.instructions}
              </div>
            </>
          )}
          {draggable && (
            <DragOverlay dropAnimation={null}>
              {draggingId ? (() => {
                const info = getNodeInfo(draggingId)
                const IconComp = info?.icon
                return (
                  <div className={cn(
                    'flex items-center gap-2 rounded-lg bg-surface border border-border pointer-events-none',
                    'shadow-[var(--elevation-200)]',
                    size === 'lg' ? 'text-body-lg leading-compact px-4 py-2' : 'text-body leading-compact px-3 py-1.5',
                  )}>
                    {IconComp && <IconComp size={ICON_SIZE[size]} className="shrink-0" aria-hidden />}
                    <span className="text-foreground truncate max-w-[200px]">{info?.label ?? draggingId}</span>
                  </div>
                )
              })() : null}
            </DragOverlay>
          )}
        </DndContext>
        </RowSizeProvider>
      </TreeViewContext.Provider>
    )
  }
)
TreeView.displayName = 'TreeView'

// ═══════════════════════════════════════════════════════════════════════════
// TreeItem variants
// ═══════════════════════════════════════════════════════════════════════════

const treeItemVariants = cva(
  [
    // items-start:多行 label 時 prefix 留在第一行(item-layout 規則)
    'flex items-start gap-2 w-full',
    'cursor-pointer select-none',
    // hover 底色瞬間切換,不做過渡(user 2026-09-10 拍板「第三題改成全部瞬間」;SSOT = tokens/motion/motion.spec.md「hover 回饋不做過渡」)
    // 2026-09-07 刪 `outline-none`。2026-09-25 起這一列就是真焦點(roving tabindex,總帳 B9),
    // 焦點框由下方 TreeItem 的 `focus-visible:focus-ring-inset` 畫,更不能加 outline-none。
    // Label 字重 500(跟 SidebarMenuButton 一致)
    'font-medium',
  ],
  {
    variants: {
      // 消費 ROW_PADDING_BY_SIZE SSOT(item-anatomy.tsx)— drift risk 消除
      size: ROW_PADDING_BY_SIZE,
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// TreeItem
// ═══════════════════════════════════════════════════════════════════════════

export interface TreeItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'id'> {
  /** 唯一 id。必填,用於 expand / select / keyboard 追蹤 */
  id: string
  /** 主要文字 */
  label: React.ReactNode
  /** 左側 icon(chevron 之後)。LucideIcon 型別,尺寸由 TreeView size 決定 */
  icon?: LucideIcon
  /**
   * Checkbox(多選模式,label 前方)。傳入 ReactNode(Checkbox 元件)。
   * 位置:在 chevron 之後、indicator/icon 之前。
   * 此 slot 僅是列 selection 的視覺鏡像；有效 React element 會由 TreeItem
   * 強制正規化為 `aria-hidden` + `tabIndex=-1`，不形成第二個 Tab 停靠點。
   * 單選模式通常不需要(用 bg-neutral-selected 表達選中)。
   */
  checkbox?: React.ReactNode
  /**
   * 右側 inline actions(suffix slot,宣告式 API)。對齊 `patterns/element-anatomy/inline-action.spec.md`
   * 與 `SidebarMenuButton.inlineActions` 的同一條規格——TreeItem / SidebarMenuButton /
   * 未來的 row primitive 全部用同一個 declarative API。
   *
   * Consumer 只宣告 intent,TreeItem 用 `<ItemInlineAction>` 自動渲染:
   * - Icon 尺寸 = `ICON_SIZE[treeViewSize]`(自動)
   * - Hover bg、tooltip、aria-label、cursor-pointer 自動處理
   * - **不可以**手刻 button JSX(canonical 實作在 `patterns/element-anatomy/item-anatomy.tsx` `ItemInlineAction`)
   * - 鍵盤:按鈕不在 Tab 路上;焦點在列上按 → 進第一顆、→ / ← 在按鈕間走、第一顆再 ← 回列(tree-view.spec.md「鍵盤導覽」)
   *
   * ```tsx
   * <TreeItem
   *   id="inbox"
   *   icon={Inbox}
   *   label="Inbox"
   *   inlineActions={[
   *     { icon: MoreVertical, label: '更多', onClick: handleMore },
   *     { icon: Plus,           label: '新增', onClick: handleAdd },
   *   ]}
   *   actionsReveal="hover"
   * />
   * ```
   *
   * 若需要永遠可見的 suffix(如 badge 計數),放在 `label` 內:
   * ```tsx
   * <TreeItem label={<>Inbox <Badge count={3} /></>} />
   * ```
   */
  inlineActions?: InlineActionConfig[]
  /**
   * 右側 actions slot(ReactNode)— escape hatch 供 consumer 放自訂元素
   * (如 DropdownMenu trigger / 自訂 popover / 多 tier 動作)。
   *
   * 跟 `inlineActions` 互斥(同時傳 `inlineActionsSlot` 會優先,`inlineActions` 被忽略)。
   * slot 裡每一個可聚焦的元素都會被設成 `tabIndex=-1`、改由 → / ← 走到,而且**每一個都必須有可讀名稱**
   * (aria-label / 可見文字;缺的話 dev 模式 console.warn)。
   *
   * 規則對齊 Input.endSlot canonical:90% case 用 `inlineActions` 宣告式 API,
   * 10% config 表達不出時走 slot。視覺一致性由 consumer 負責(可使用 host 內部 helper
   * — 但禁止 app-code 直接 import L3 primitive,見 `check_canonical_propagation.sh` E.2,原 `check_l3_primitive_import` 已 folded)。
   */
  inlineActionsSlot?: React.ReactNode
  /**
   * Inline actions 的顯示模式:
   * - `"hover"`(預設):列被滑過、或鍵盤焦點在這一列(列本身或列裡的按鈕)時才出現,瞬間出現、不淡入
   *   (待辦總帳 L9;規則住 ItemSuffix `hoverReveal`,見 tree-view.spec.md「Hover-only Inline Actions」)
   * - `false`:常駐顯示
   *
   * 對齊 `SidebarMenuButton.actionsReveal`,同一套規則。
   */
  actionsReveal?: false | "hover"
  /**
   * 取代 icon 的位置。用於 stepper 的 status indicator(●/○/✓)。
   * 設定後 icon 不渲染、改渲染 indicator;chevron 永遠保留(expandable=旋轉箭頭 / leaf=placeholder)。
   */
  indicator?: React.ReactNode
  /** 是否停用 */
  disabled?: boolean
  /** 子 TreeItem(有 children = expandable,沒有 = leaf) */
  children?: React.ReactNode
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const TreeItem = React.forwardRef<HTMLDivElement, TreeItemProps>(
  ({ id, label, icon: Icon, checkbox, inlineActions, inlineActionsSlot, actionsReveal = 'hover', indicator, disabled, children, className, style, onClick, ...props }, ref) => {
    const ctx = useTreeView()
    const depth = React.useContext(DepthContext)
    const {
      size,
      selectionMode,
      expandOnSelect,
      draggable,
      expandedIds,
      selectedIds,
      focusedId,
      tabStopId,
      draggingId,
      dropTarget,
      toggleExpand,
      select,
      setFocusedId,
      focusRow,
      onRowUnmount,
      registerNode,
      unregisterNode,
    } = ctx

    const hasChildren = React.Children.count(children) > 0
    const isExpanded = expandedIds.has(id)
    const isSelected = selectedIds.has(id)
    const isFocused = focusedId === id
    // 整棵樹唯一的 Tab 停靠點(roving tabindex;總帳 B9)
    const isTabStop = tabStopId === id
    const isDragging = draggingId === id
    const isDropTarget = dropTarget?.id === id
    // 列名只取 label(aria-labelledby 指過來)。用 useId 而非 node id 組:node id 可能含空白,會把 IDREF 清單拆開
    const labelId = React.useId()
    // 沿用舊的真值判斷(slot 傳 false / '' 視同沒傳,改走 inlineActions)
    const hasSlot = Boolean(inlineActionsSlot)
    const hasActionCell = !disabled && (hasSlot || (inlineActions?.length ?? 0) > 0)
    const visualCheckbox = checkbox && React.isValidElement<Record<string, unknown>>(checkbox)
      ? React.cloneElement(checkbox, { 'aria-hidden': true, tabIndex: -1 })
      : checkbox

    const iconPx = ICON_SIZE[size]
    const indentPx = depth * INDENT_STEP[size]

    // ── Drag hooks ──
    // Figma 風格:整列可拖(不用 grip handle),靠 distance:5 區分 click vs drag
    const { attributes: dragAttrs, listeners: dragListeners, setNodeRef: setDragRef } = useDraggable({
      id, disabled: !draggable || disabled,
    })
    const { setNodeRef: setDropRef } = useDroppable({
      id, disabled: !draggable || disabled,
    })

    // ── 找 parent id(from depth context chain)──
    const parentId = React.useContext(ParentIdContext)

    // ── Register / unregister ──
    React.useEffect(() => {
      registerNode(id, parentId, hasChildren, label, Icon)
      return () => unregisterNode(id)
    }, [id, parentId, hasChildren, label, Icon, registerNode, unregisterNode])

    // 卸載時通知 TreeView 重選 Tab 停靠點(總帳 B9;見 TreeView onRowUnmount)
    React.useEffect(() => () => onRowUnmount(id), [id, onRowUnmount])

    // ── Refs ──
    const itemRef = React.useRef<HTMLDivElement>(null)
    React.useImperativeHandle(ref, () => itemRef.current!)
    const rowRef = React.useRef<HTMLDivElement | null>(null)
    const actionsRef = React.useRef<HTMLSpanElement | null>(null)

    // ── Focus scroll into view ──(捲的是列本身;原本捲 wrapper,展開的資料夾 wrapper 含整個子樹)
    React.useEffect(() => {
      if (isFocused && rowRef.current) {
        rowRef.current.scrollIntoView({ block: 'nearest' })
      }
    }, [isFocused])

    // ── 列上的按鈕不在 Tab 路上(總帳 B9;tree-view.spec.md「鍵盤導覽」)──
    // 動作格裡每一個可聚焦的東西都設 tabIndex=-1,改由 → / ← 走到。用 DOM 設而不是逐一傳 prop:
    // inlineActionsSlot 是 consumer 的任意 ReactNode(選單觸發鈕、連結…),拿不到它們的 props;
    // MutationObserver 接住 slot 內容之後才掛上 / 自己改回 tabindex 的情況。
    React.useLayoutEffect(() => {
      const cell = actionsRef.current
      if (!cell) return
      const enforce = () => {
        const controls = cell.querySelectorAll<HTMLElement>(ROVING_CONTROL_SELECTOR)
        removeRovingControlsFromTabOrder(controls)
        // 每顆列上按鈕都要有可讀名稱(總帳 B9 驗收;inlineActions 由 ItemInlineAction 的 aria-label 保證,這裡管 slot)
        if (process.env.NODE_ENV === 'production') return
        controls.forEach((el) => {
          if (!hasAccessibleName(el) && !warnedUnnamedAction.has(el)) {
            warnedUnnamedAction.add(el)
            console.warn(`[DS] TreeItem「${id}」:inlineActionsSlot 裡有一個可聚焦元素沒有可讀名稱 —— 請加 aria-label 或可見文字。`, el)
          }
        })
      }
      enforce()
      const observer = new MutationObserver(enforce)
      observer.observe(cell, { subtree: true, childList: true, attributes: true, attributeFilter: ['tabindex'] })
      return () => observer.disconnect()
    }, [hasActionCell, id])

    // ── Handlers ──
    const handleRowClick = React.useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        onClick?.(e)
        if (e.defaultPrevented || disabled) return
        e.stopPropagation()
        // 焦點:點在列上 → 列拿到焦點(roving tabindex 的停靠點跟著搬);
        // 點在列上的按鈕(或對它按 Enter 合成的 click)→ 焦點留在那顆按鈕上,不搶(總帳 B9)。
        // 選取行為沿用既有(點到按鈕也會選取該列,本次不改;見 spec「展開/收合」)。
        const fromActionCell = (e.target as HTMLElement).closest('[data-tree-actions]')
        if (!fromActionCell) focusRow(id)
        setFocusedId(id)
        select(id)
        if (expandOnSelect && hasChildren) {
          toggleExpand(id)
        }
      },
      [id, disabled, onClick, focusRow, select, setFocusedId, expandOnSelect, hasChildren, toggleExpand]
    )

    const handleChevronClick = React.useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        if (disabled) return
        // 滑鼠點展開箭頭時瀏覽器會把焦點給這顆(tabIndex=-1)按鈕 —— 還給列,鍵盤接著從這一列走
        focusRow(id)
        setFocusedId(id)
        toggleExpand(id)
      },
      [id, disabled, focusRow, setFocusedId, toggleExpand]
    )

    // dnd-kit PointerSensor listener 與 consumer DOM callback 必安全 compose：consumer 先收到
    // event，可用 preventDefault 取消 drag；未取消才執行 internal listener。`...props` 會先
    // spread，這份 composed map 隨後覆蓋同名 pointer listener，避免任一方被靜默吃掉。
    const composedDragListeners = dragListeners
      ? Object.fromEntries(
          Object.entries(dragListeners).map(([eventName, internalHandler]) => [
            eventName,
            (event: React.SyntheticEvent<HTMLElement>) => {
              const consumerHandler = (props as Record<string, unknown>)[eventName]
              if (typeof consumerHandler === 'function') {
                ;(consumerHandler as (event: React.SyntheticEvent<HTMLElement>) => void)(event)
              }
              if (!event.defaultPrevented) {
                ;(internalHandler as (event: React.SyntheticEvent<HTMLElement>) => void)(event)
              }
            },
          ])
        ) as typeof dragListeners
      : undefined

    // ── Chevron(永遠存在:expandable = 旋轉箭頭;leaf = placeholder 佔位) ──
    // 消費 `<ItemPrefix>` SSOT — 永遠 h-[1lh] 對齊 label 第一行中線(item-anatomy 對應)。
    // forced width 透過 style 鎖 chevron 槽寬,讓 sibling label 起點水平對齊(無 chevron leaf 佔位同寬;縮排不變)。
    // 箭頭本身 = 共用行內小按鈕 `ItemInlineActionButton`(2026-09-26,待辦總帳 L5,user:「是改成inline action對吧？」;
    // 依據 inline-action.spec.md「尺寸對照」TreeItem 列 + hit-area-canonical.md:滑過底色 18(lg 22)= 點得到的範圍,
    // 盒與排版佔位仍是圖示尺寸 16 / 20,多出的 1px 靠溢出;按下多一階 neutral-active)。與 DataTable 巢狀列的展開箭頭同一顆
    //(data-table.tsx nestedPrefix)。2026-09-26 之前這裡手刻一顆 16×16 的 <button>,滑過底色與點擊範圍都只有 16。
    // 鍵盤用 → / ← 展開收合(列上的 aria-expanded),箭頭本身不在 Tab 路上、對讀屏隱藏。
    const chevronSlot = (
      <ItemPrefix style={{ width: iconPx }}>
        {hasChildren ? (
          <ItemInlineActionButton
            icon={ChevronRight}
            tabIndex={-1}
            aria-hidden
            onClick={handleChevronClick}
            // 展開 / 收合的旋轉是狀態切換的動畫,不是滑過回饋 → 保留(motion.spec.md「hover 回饋不做過渡」只管滑過;
            // 滑過底色與圖示色由 ItemInlineActionButton 瞬間切換)
            iconClassName={cn('transition-transform duration-150 motion-reduce:duration-0', isExpanded && 'rotate-90')}
            className={disabled ? 'text-fg-disabled pointer-events-none' : undefined}
          />
        ) : (
          // Leaf placeholder
          <span style={{ width: iconPx }} aria-hidden />
        )}
      </ItemPrefix>
    )

    return (
      <ParentIdContext.Provider value={id}>
        <div
          ref={(node) => {
            (itemRef as React.MutableRefObject<HTMLDivElement | null>).current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
          }}
          // node wrapper(2026-09-25 總帳 B9):無角色 —— 樹狀表格的列不得包住子列,角色與 aria-* 都搬到下面的 row。
          // data-tree-* 留在這裡給內部查詢 / 拖曳 / 閘使用。
          data-tree-id={id}
          data-tree-parent-id={parentId ?? ''}
          data-tree-has-children={hasChildren}
          className={cn('w-full min-w-0 relative', isDragging && dragSourceClass)}
        >
          {/* Drop indicator — before:水平 2px primary line(指 SSOT drag-visual.ts);
              indent 跟隨 depth(left 由 inline style override class 的 left-0)*/}
          {isDropTarget && dropTarget?.position === 'before' && (
            <div
              className={dropIndicatorRow.before}
              style={{ left: `calc(var(--tree-px) + ${indentPx}px)` }}
            />
          )}

          {/* Row: draggable + droppable 都在這一行(合併 ref),確保碰撞偵測只看行高 */}
          <div
            {...props}
            ref={(node) => {
              // 合併 drag + drop + 本地 ref 到同一個 element
              rowRef.current = node
              if (draggable) setDragRef(node)
              setDropRef(node)
            }}
            // ── 樹狀表格的列(2026-09-25 總帳 B9)──
            // role / aria-* / tabIndex 放在 {...props} 之後:內部語意必須勝過 consumer 誤傳。
            role="row"
            aria-level={depth + 1}
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-selected={selectionMode !== 'none' ? isSelected : undefined}
            aria-disabled={disabled || undefined}
            // 列的名稱只取 label —— 不讓動作按鈕的 aria-label 併進列名(否則念成「Alice 重新命名 刪除」)
            aria-labelledby={labelId}
            // 2026-07-05 D4 修:aria-roledescription 放在有角色的元素上(原 treeitem,現 row)—
            // 供 AT 提示此 node 可拖曳;值消費 dnd-kit attributes SSOT(預設 'draggable')。
            aria-roledescription={draggable && !disabled ? dragAttrs['aria-roledescription'] : undefined}
            // roving tabindex:整棵樹只有停靠點那一列是 0,其餘列與所有列上按鈕都是 -1(總帳 B9)
            tabIndex={isTabStop ? 0 : -1}
            data-tree-row={id}
            className={cn(
              'group/tree-item',
              treeItemVariants({ size }),
              // 2026-05-26 SSOT lock(user explicit「multi 已有 checkbox 強信號,text 不該再變色」):
              // ── Single mode ──
              //   - default text 預設 fg-secondary muted(hierarchy navigation 慣例,跟 Sidebar 一致)
              //   - selected → text-foreground emphasis + bg-neutral-selected(無 checkbox,需 text+bg 雙信號)
              // ── Multi mode ──
              //   - default text 維持 fg-secondary muted(跟 single 對齊 hierarchy)
              //   - selected → 視覺信號只在 checkbox(auto-render below),text 不變、bg 不變
              //   - 對齊 SelectMenu multi pattern(menu-item.tsx:194-195 selected → bg only;multi → checkbox only)
              // multi-selected 也維持 fg-secondary(上方註解「text 不變」;原 !isSelected 條件讓 multi-selected 掉到繼承色)
              !disabled && (!isSelected || selectionMode === 'multiple') && 'text-fg-secondary',
              !disabled && isSelected && selectionMode === 'single' && 'text-foreground',
              !disabled && 'hover:bg-neutral-hover hover:text-foreground',
              // 2026-08-11 修偏移(SSOT = item-anatomy「選中 × 互動疊加」):先前 hover:bg-neutral-hover
              //(0,2,0)蓋掉無修飾的 bg-neutral-selected(0,1,0)→ 選中列 hover 反而變淺 = bug。
              // 釘住 hover 不變(twMerge 同組後者勝)。鍵盤焦點不改底色,只畫框(focus-canonical 規則二)。
              !disabled && isSelected && selectionMode === 'single' && 'bg-neutral-selected hover:bg-neutral-selected',
              // 落點底色排在所有其他 `bg-*` 之後 —— twMerge 同組後者勝。
              // 2026-09-06 修:原本排在 `hover:bg-neutral-hover` 與 `bg-neutral-selected` **之前**,
              // 造成兩個都會發生的 bug —— (1) 已選中的列 twMerge 直接把 `bg-drop-target` 刪掉,
              // 實跑 tailwind-merge 3.5.0 輸出只剩 `hover:text-foreground bg-neutral-selected
              // hover:bg-neutral-selected`;(2) 未選中的列兩個 class 都留著,但 hover 特異性較高、
              // 游標又必然停在該列上,落點底色一樣看不到。`dropIndicatorInside` 自帶 `hover:` 同色治 (2),
              // 這行的位置治 (1)。
              isDropTarget && dropTarget?.position === 'inside' && dropIndicatorInside,
              // 焦點框(2026-09-25 總帳 B9:虛擬游標 showRing → 真焦點 focus-visible):
              // 這一列現在是真 DOM 焦點,「這次要不要畫」交給瀏覽器的 :focus-visible(滑鼠點 → 不畫、鍵盤 → 畫),
              // 與 Sidebar 選單鈕同一種寫法(focus-canonical「真焦點用 focus-visible:」)。
              // 往內畫(outline 通道,base.css @utility):列撐滿容器寬,往外會被裁。
              // 只在列**本身**是焦點時畫;焦點在列上的按鈕時由那顆按鈕自己畫框,列不再多畫一個。
              'focus-visible:focus-ring-inset',
              disabled && 'pointer-events-none text-fg-disabled cursor-default',
              className,
            )}
            style={{
              ...style,
              // Structural indent 由 TreeView SSOT 最終擁有，consumer style 不得抹掉。
              paddingLeft: indentPx > 0
                ? `calc(var(--tree-px) + ${indentPx}px)`
                : 'var(--tree-px)',
              paddingRight: 'var(--tree-px)',
            }}
            // 2026-07-05 D4 修:只 spread listeners,不 spread dnd-kit attributes —
            // useDraggable 預設 attributes 注入 role="button" + tabIndex=0 + aria-pressed +
            // aria-describedby(鍵盤拖曳指示):role=button 會蓋掉列的語意、tabIndex=0 會讓每一列都變成
            // Tab 停靠點(破壞整棵樹只佔一站);sensors 僅 PointerSensor(無 KeyboardSensor),這些 attrs 換不到鍵盤拖曳能力;
            // 鍵盤重排(2026-07-14 v1)走容器 handleKeyDownCapture 的 Cmd/Ctrl+Shift+Arrow 分支,非 dnd-kit sensor。
            // aria-roledescription 保留在上方列元素(有 role 才合法)。
            {...(draggable ? composedDragListeners : {})}
            onClick={handleRowClick}
          >
            {/* 第一格:chevron / checkbox / indicator 或 icon / label(樹狀表格 row 只能擁有格,2026-09-25 總帳 B9) */}
            <div role="gridcell" className="flex flex-1 min-w-0 items-start gap-2">
              {chevronSlot}

              {/* Checkbox 在 icon 前——消費 `<ItemPrefix>` 對齊第一行
                * 2026-05-26 SSOT lock(user explicit「多選的方式應該也是要跟 menu 一樣是出現 checkbox」):
                *   - selectionMode='multiple' + 無 consumer checkbox prop → auto-render `<Checkbox>` reflect selectedIds
                *     (對齊 SelectMenu multi pattern;consumer 不用手寫 checkbox)
                *   - selectionMode='multiple' + consumer 傳 checkbox → 用 consumer 的(parent-child cascade 等 advanced)
                *   - selectionMode='single' / 'none' → 不 render checkbox(text-foreground + bg 雙信號表 selected)
                * 對齊 cite:menu-item.tsx:194-195(MenuItem selected bg)+ select-menu.tsx:352-354(SelectMenu multi=checkbox) */}
              {(checkbox || selectionMode === 'multiple') && (
                <ItemPrefix className="pointer-events-none">
                  {/* 2026-07-05 D4 修:auto-render Checkbox 補 tabIndex={-1} — 勾選框的 root 是原生 button
                    * (預設可聚焦),aria-hidden + 可聚焦 = axe aria-hidden-focus,且會多出 Tab 停靠點
                    * (tree-view.spec.md「A11y 預設」Focus 段);ItemPrefix pointer-events-none 只擋滑鼠不擋鍵盤。
                    * 選取語意由列的 aria-selected 承載,checkbox 純視覺反映。 */}
                  {visualCheckbox || <Checkbox checked={isSelected} disabled={disabled} aria-hidden="true" tabIndex={-1} />}
                </ItemPrefix>
              )}

              {/* indicator 取代 icon 的位置;h-[1lh] 對齊第一行
                  indicator 是 escape hatch(stepper status dot 等客製內容),消費 `<ItemPrefix>` 鎖 chevron 槽寬;
                  Icon 走 canonical `<ItemIcon>` helper——自動標 data-prefix-type="icon",
                  讓 SidebarProvider 的全域 :has() prefix-mix 偵測能命中。 */}
              {indicator ? (
                <ItemPrefix style={{ width: iconPx }}>
                  {indicator}
                </ItemPrefix>
              ) : Icon ? (
                <ItemIcon icon={Icon} className={disabled ? 'text-fg-disabled' : undefined} />
              ) : null}

              <span id={labelId} className={cn('flex-1 min-w-0 truncate', disabled && 'text-fg-disabled')}>
                {label}
              </span>
            </div>

            {/* 第二格:Suffix inline actions——宣告式 API,用 `<ItemInlineAction>` 渲染。
                消費 `<ItemSuffix hoverReveal hoverGroup="tree-item">` SSOT(2026-05-05 v8 group selector 參數化後)。
                actionsReveal="hover"(預設):列被滑過、或鍵盤焦點在這一列(列本身 / 列裡的按鈕)才顯示;
                actionsReveal=false:常駐顯示。跟 SidebarMenuButton 共用同一條規則,行為一致。
                inlineActionsSlot escape hatch 優先(consumer 自控 JSX,reveal 一樣套外層 group)。
                2026-06-12 R2(同 sidebar.tsx 修):宿主 disabled 時 render 層擋 inline actions —
                inline-action.spec.md「宿主 disabled | 不渲染」;row pointer-events 蓋不住
                actionsReveal=false 常駐顯示的視覺暗示,必須 render 層 guard。 */}
            {/* 動作格的 hover-reveal 另加 `group-focus-visible/tree-item`:ItemSuffix 內建的
                group-has-[:focus-visible] 只看**子孫**,列自己拿到鍵盤焦點時抓不到(總帳 B9:
                滑過才出現的按鈕,焦點在這一列裡時必須看得到)。 */}
            {hasActionCell && (
              <ItemSuffix
                ref={actionsRef}
                role="gridcell"
                data-tree-actions=""
                hoverReveal={actionsReveal === 'hover'}
                hoverGroup="tree-item"
                className={actionsReveal === 'hover' ? 'group-focus-visible/tree-item:opacity-100' : undefined}
              >
                {hasSlot
                  ? inlineActionsSlot
                  : inlineActions!.map((action, i) => (
                      <ItemInlineAction key={action.label + i} action={action} />
                    ))}
              </ItemSuffix>
            )}
          </div>

          {/* Drop indicator — after:同 before mirror 到 bottom edge(SSOT drag-visual.ts)*/}
          {isDropTarget && dropTarget?.position === 'after' && (
            <div
              className={dropIndicatorRow.after}
              style={{ left: `calc(var(--tree-px) + ${indentPx}px)` }}
            />
          )}

          {/* Children: Collapsible 展開/收合。
              2026-09-25:子項容器不再是 role="group"(樹狀表格裡 row 之間不允許 group);
              data-tree-children 讓鍵盤查詢認得「關閉動畫中(data-state=closed)的子樹」並跳過。 */}
          {hasChildren && (
            <CollapsiblePrimitive.Root open={isExpanded}>
              <CollapsiblePrimitive.Content
                data-tree-children=""
                className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none"
              >
                <DepthContext.Provider value={depth + 1}>
                  <div className="flex flex-col w-full">
                    {children}
                  </div>
                </DepthContext.Provider>
              </CollapsiblePrimitive.Content>
            </CollapsiblePrimitive.Root>
          )}
        </div>
      </ParentIdContext.Provider>
    )
  }
)
TreeItem.displayName = 'TreeItem'

// Parent ID context for keyboard navigation (← to parent)
const ParentIdContext = React.createContext<string | null>(null)

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const treeViewMeta = {
  component: 'TreeView',
  family: 1, // Family 1(Menu item layout)消費者 — 對齊 tree-view.spec.md frontmatter family: 1
  variants: {

  },
  sizes: {
    // 對齊 tree-view.spec.md frontmatter(compile-stories --check 驗 key 一致)
    sm: { typography: 'body', indent: 24 },
    md: { typography: 'body', indent: 24 }, // default
    lg: { typography: 'body-lg', indent: 28 },
  },
  // 'selected' = single-selection 持續選中(bg-neutral-selected + aria-selected);'active' 移除 —
  // 全檔無 Tailwind 按壓 utility,無按壓專屬視覺態(2026-07-07 詞彙統一對抗稽核補修)。
  states: ['default', 'hover', 'selected', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-neutral-hover', 'bg-neutral-selected', 'bg-surface'],
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-fg-secondary', 'text-foreground'],
    ring: ['focus-ring-inset'],
  },
  defaultSize: 'md',
} as const

export { TreeView, TreeItem, treeItemVariants }
