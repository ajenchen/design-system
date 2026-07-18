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
import { dragSourceClass, dropIndicatorRow, dropIndicatorInside } from '@/design-system/lib/drag-visual'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
// Row primitive 共用常數——單一 source of truth
import {
  ICON_SIZE,
  RowSizeProvider,
  ItemIcon,
  ItemPrefix,
  ItemSuffix,
  ItemInlineAction,
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
 *   3. 鍵盤導覽 + ARIA tree
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
 * - `'menu'`:浮層選單 / dropdown,px-3(12px),對齊 MenuItem / DropdownMenu
 */
type TreeContext = 'sidebar' | 'menu'

// Base horizontal padding per context — 用 CSS variable 注入到 TreeView 容器,
// TreeItem 用 calc(var(--tree-px) + indent) 算出最終 paddingLeft。
const CONTEXT_PX_VAR: Record<TreeContext, string> = {
  sidebar: 'var(--layout-space-loose)',  // md=16px, lg=24px(density 連動)
  menu: '12px',                          // px-3,對齊 MenuItem / DropdownMenu
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

// ── 鍵盤重排(keyboard reorder,2026-07-14 v1)常數 ──
// 鍵位 = Cmd/Ctrl+Shift+方向鍵,對齊 Notion 移動 block 鍵位(https://www.notion.com/help/keyboard-shortcuts,
// WebFetch 驗證紀錄 .claude/logs/treeview-keyboard-dnd-design.md#L25);
// modifier 層與 APG tree 導覽鍵(無 modifier 的 ↑↓→←)完全正交,零衝突。
const REORDER_ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
type ReorderArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

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

// ═══════════════════════════════════════════════════════════════════════════
// Context
// ═══════════════════════════════════════════════════════════════════════════

interface TreeViewContextValue {
  size: SizeKey
  context: TreeContext
  selectionMode: SelectionMode
  expandOnSelect: boolean
  draggable: boolean
  isKeyboardRef: React.RefObject<boolean>
  /**
   * Per-tree instance 前綴(React.useId),用來組每個 treeitem 的 DOM `id`
   * (`${prefix}treeitem-${nodeId}`),讓容器的 `aria-activedescendant` 能指向目前 focused node。
   * 多棵 TreeView 同頁 / node id 跨樹重複時不會撞 DOM id。
   */
  activeDescendantPrefix: string
  expandedIds: Set<string>
  selectedIds: Set<string>
  focusedId: string | null
  /** 目前拖曳中的 node id(null = 沒在拖) */
  draggingId: string | null
  /** 目前 drop indicator 的位置 + depth(用於 line indent) */
  dropTarget: { id: string; position: TreeDropPosition; depth: number } | null
  toggleExpand: (id: string) => void
  select: (id: string) => void
  setFocusedId: (id: string | null) => void
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
    //    role="tree" 名稱無法從子節點推導,缺 aria-label / aria-labelledby → SR 只讀「tree」。
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
          '[DS] TreeView:role="tree" 缺 accessible name — 請傳 aria-label(直接字串)或 aria-labelledby(指向可見標題 id)其一。' +
            '兩者皆缺時螢幕閱讀器只讀出「tree」無法辨識用途(WAI-ARIA APG 要求 role="tree" 具 accessible name)。',
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

    // ── Focus state ──
    const [focusedId, setFocusedId] = React.useState<string | null>(null)

    // ── Virtual focus id prefix ──
    // DOM focus 永遠停在 role=tree 容器(單一 tab stop);目前 node 透過 aria-activedescendant
    // 告知 AT(對齊 DS 既有 cmdk virtual-focus canonical:SelectMenu / Command listbox)。
    // useId 確保多棵 TreeView 同頁 / node id 跨樹重複時 DOM id 不撞。
    const activeDescendantPrefix = React.useId()

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
    const reorderInstructionsId = `${activeDescendantPrefix}tree-reorder-instructions`

    // ── Keyboard vs mouse detection ──
    // focus ring 只在鍵盤操作時顯示,滑鼠點擊用 bg-neutral-selected 表達選中,不顯示 ring
    const isKeyboardRef = React.useRef(false)

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
      useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
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
      const targetDepth = Number(targetEl.getAttribute('aria-level') ?? 1) - 1

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
            // 找 parent 來放
            const groupEl = targetEl.closest('[role="group"]')
            const parentTreeItem = groupEl?.parentElement?.closest('[role="treeitem"]')
            const parentId = parentTreeItem?.getAttribute('data-tree-id')
            if (parentId && parentId !== String(active.id)) {
              const parentDepth = Number(parentTreeItem?.getAttribute('aria-level') ?? 1) - 1
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
    }, [expandedIds, isInSubtree])

    const dropTargetRef = React.useRef(dropTarget)
    dropTargetRef.current = dropTarget

    const handleDragEnd = React.useCallback((event: DragEndEvent) => {
      if (autoExpandTimerRef.current) { clearTimeout(autoExpandTimerRef.current); autoExpandTimerRef.current = null }
      const { active, over } = event
      const dt = dropTargetRef.current
      // descendant guard 同 handleDragOver(dt 已由 dragOver guard 保證為 null,此為 belt-and-braces)
      if (over && !isInSubtree(String(over.id), String(active.id)) && dt) {
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
    // 不用 dnd-kit KeyboardSensor — 其 activator 需可接收 DOM focus
    // (https://dndkit.com/api-documentation/sensors/keyboard),與 row tabIndex={-1} +
    // aria-activedescendant 虛擬焦點模型結構性不相容(2026-07-05 D4 拍板不翻案)。

    // 播報用 label 文字:registry label 是 ReactNode — string 直接用,否則退 DOM row textContent。
    const getNodeLabelText = React.useCallback(
      (id: string): string => {
        const info = getNodeInfo(id)
        if (typeof info?.label === 'string') return info.label
        const rowEl = treeRef.current?.querySelector<HTMLElement>(`[data-tree-row="${id}"]`)
        return rowEl?.textContent?.trim() || id
      },
      [getNodeInfo]
    )

    // code-quality-allow: long-function — 四鍵語意(同層上下 / 移入 / 移出)+ 邊界播報結構緊密,
    // 拆 sub-fn 會跨 fn 傳 siblings / announce state 反而複雜(同 handleKeyDown 先例)
    const handleKeyboardReorder = React.useCallback(
      (key: ReorderArrowKey) => {
        const tree = treeRef.current
        if (!tree || !focusedId) return
        const sourceId = focusedId
        const sourceEl = tree.querySelector<HTMLElement>(`[data-tree-id="${sourceId}"]`)
        // disabled node 不可移(鍵盤導覽本就跳過 disabled,此為防禦 guard)
        if (!sourceEl || sourceEl.getAttribute('aria-disabled') === 'true') return

        const label = getNodeLabelText(sourceId)
        // 同層 siblings(DOM 序)。focused node 可見 ⇒ 其 parent 已展開 ⇒ 全 siblings 已 mount。
        const parentId = sourceEl.dataset.treeParentId || null
        const visibleItems = Array.from(
          tree.querySelectorAll<HTMLElement>('[role="treeitem"]:not([hidden])')
        )
        const siblings = visibleItems.filter((el) => (el.dataset.treeParentId || null) === parentId)
        const sourceIndex = siblings.findIndex((el) => el.dataset.treeId === sourceId)
        if (sourceIndex < 0) return
        const isEnabled = (el: HTMLElement) => el.getAttribute('aria-disabled') !== 'true'

        // 發出與 pointer 路徑同型的 TreeDragEndEvent,並排定 re-render 後 scrollIntoView
        // (既有 effect 只在 isFocused 變化時跑;同 id 移動不 re-fire,故此處補)。
        const commit = (targetId: string, position: TreeDropPosition): boolean => {
          // 結構安全 assert:四鍵語意(sibling 間 / 進 prev sibling / 出 parent)結構上
          // 不可能移進自己子樹;防禦性仍擋(與 pointer descendant guard 共用 isInSubtree SSOT)。
          if (targetId === sourceId || isInSubtree(targetId, sourceId)) return false
          onDragEndProp?.({ sourceId, targetId, position })
          requestAnimationFrame(() => {
            treeRef.current
              ?.querySelector<HTMLElement>(`[data-tree-id="${sourceId}"]`)
              ?.scrollIntoView({ block: 'nearest' })
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
            const parentEl = tree.querySelector<HTMLElement>(`[data-tree-id="${parentId}"]`)
            const level = Number(parentEl?.getAttribute('aria-level') ?? '1')
            if (commit(parentId, 'after')) {
              setReorderAnnouncement(
                announcements.movedOut({ label, parentLabel: getNodeLabelText(parentId), level })
              )
            }
            return
          }
        }
      },
      [focusedId, expandedIds, toggleExpand, onDragEndProp, getNodeLabelText, isInSubtree, announcements]
    )

    // ── Context value ──
    const contextValue = React.useMemo<TreeViewContextValue>(
      () => ({
        size,
        context,
        selectionMode,
        expandOnSelect,
        draggable,
        isKeyboardRef,
        activeDescendantPrefix,
        draggingId,
        dropTarget,
        expandedIds,
        selectedIds,
        focusedId,
        toggleExpand,
        select,
        setFocusedId,
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
        isKeyboardRef,
        activeDescendantPrefix,
        draggingId,
        dropTarget,
        expandedIds,
        selectedIds,
        focusedId,
        toggleExpand,
        select,
        setFocusedId,
        registerNode,
        unregisterNode,
        getNodeInfo,
      ]
    )

    // ── Keyboard handler ──
    const treeRef = React.useRef<HTMLDivElement>(null)
    React.useImperativeHandle(ref, () => treeRef.current!)

    const handleMouseDown = React.useCallback(() => {
      isKeyboardRef.current = false
    }, [])

    // code-quality-allow: long-function — helper fn 結構緊密,拆 sub-fn 會跨 fn 傳 state 反而複雜
    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent) => {
        isKeyboardRef.current = true
        if (!treeRef.current) return

        // ── 互動 descendant 自理鍵盤(先於導覽 / 重排分支)──
        // 公開 inlineActions / inlineActionsSlot 經 <ItemInlineAction> 渲染的原生 <button>
        // (及 consumer slot 內的 link / field / role=button)是各自獨立的 tab stop(spec
        // A11y「單一 tab stop」段)。其 Enter/Space/方向鍵應由該控件自理——若冒泡到容器
        // handleKeyDown,下方 Enter/Space 分支的 e.preventDefault()+select() 會吃掉 button
        // 原生啟動並誤選 tree node。虛擬焦點模型下 tree 導覽/重排只在事件來自容器本身時處理
        // (DOM focus 停在 tree 容器;treeitem row / chevron / checkbox 皆 tabIndex=-1)。
        const keyTarget = e.target as HTMLElement | null
        if (keyTarget && keyTarget !== e.currentTarget) {
          const interactive = keyTarget.closest<HTMLElement>(
            'a[href], button, input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
          )
          // interactive === e.currentTarget:唯一可聚焦祖先是 tree 容器(tabIndex=0 單一 tab
          // stop 進出點)→ 屬非互動 descendant,照常走 tree 導覽。
          if (interactive && interactive !== e.currentTarget) return
        }

        // ── 鍵盤重排:Cmd/Ctrl+Shift+方向鍵(2026-07-14 v1,詳 spec「鍵盤重排」)──
        // 必排在下方「無焦點時方向鍵先聚焦第一項」分支之前(該分支不分 modifier 攔 Arrow*);
        // 非 modifier 導覽路徑(下方 switch)完全不變。
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && REORDER_ARROW_KEYS.includes(e.key)) {
          if (!draggable) return // 未啟用拖曳 → 整組 no-op(modifier 組合不落入導覽 switch)
          e.preventDefault() // 阻止瀏覽器原生行為(捲動 / 文字選取)
          if (draggingId !== null) return // pointer 拖曳進行中 → 互斥,忽略鍵盤重排
          handleKeyboardReorder(e.key as ReorderArrowKey)
          return
        }

        // 取得所有可見的 treeitem
        const items = Array.from(
          // a11y:排除 disabled 節點 → 鍵盤導覽/選取/展開全跳過(APG:disabled 不可鍵盤操作)
          treeRef.current.querySelectorAll<HTMLElement>('[role="treeitem"]:not([hidden]):not([aria-disabled="true"])')
        )
        const currentIndex = items.findIndex(
          (el) => el.dataset.treeId === focusedId
        )
        // a11y:沒焦點時任一方向鍵先聚焦第一個(含 ArrowLeft/Right,原漏 → AT 無 activedescendant 可讀)
        if (currentIndex < 0 && items.length > 0 && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
          // 沒有焦點時,任何方向鍵先聚焦第一個
          setFocusedId(items[0].dataset.treeId ?? null)
          e.preventDefault()
          return
        }

        const currentEl = items[currentIndex]

        switch (e.key) {
          case 'ArrowDown': {
            e.preventDefault()
            const next = items[currentIndex + 1]
            if (next) setFocusedId(next.dataset.treeId ?? null)
            break
          }
          case 'ArrowUp': {
            e.preventDefault()
            const prev = items[currentIndex - 1]
            if (prev) setFocusedId(prev.dataset.treeId ?? null)
            break
          }
          case 'ArrowRight': {
            e.preventDefault()
            const id = currentEl?.dataset.treeId
            if (!id) break
            const isExpanded = expandedIds.has(id)
            const hasChildren = currentEl?.dataset.treeHasChildren === 'true'
            if (hasChildren && !isExpanded) {
              toggleExpand(id)
            } else if (hasChildren && isExpanded) {
              // 已展開 → 移到第一個 child
              const next = items[currentIndex + 1]
              if (next) setFocusedId(next.dataset.treeId ?? null)
            }
            break
          }
          case 'ArrowLeft': {
            e.preventDefault()
            const id = currentEl?.dataset.treeId
            if (!id) break
            const isExpanded = expandedIds.has(id)
            const hasChildren = currentEl?.dataset.treeHasChildren === 'true'
            if (hasChildren && isExpanded) {
              toggleExpand(id)
            } else {
              // 收合狀態或 leaf → 移到 parent
              const parentId = currentEl?.dataset.treeParentId
              if (parentId) setFocusedId(parentId)
            }
            break
          }
          case 'Home': {
            e.preventDefault()
            if (items[0]) setFocusedId(items[0].dataset.treeId ?? null)
            break
          }
          case 'End': {
            e.preventDefault()
            const last = items[items.length - 1]
            if (last) setFocusedId(last.dataset.treeId ?? null)
            break
          }
          case 'Enter':
          case ' ': {
            e.preventDefault()
            const id = currentEl?.dataset.treeId
            if (id) select(id)
            break
          }
        }
      },
      [focusedId, expandedIds, toggleExpand, select, setFocusedId, draggable, draggingId, handleKeyboardReorder]
    )

    const treeEl = (
      <div
        // {...props} 在最前:內部 role/style(--tree-px)/onKeyDown/tabIndex 必須勝過 consumer
        // 誤傳(原 spread 在最後 → consumer style 會整組蓋掉 --tree-px、onKeyDown 蓋掉鍵盤導覽)
        {...props}
        ref={treeRef}
        role="tree"
        aria-multiselectable={selectionMode === 'multiple' || undefined}
        // Virtual focus:DOM focus 停在容器(單一 tab stop),aria-activedescendant 指向目前 node
        // 的 DOM id,讓 AT 朗讀目前焦點 node(對齊 WAI-ARIA TreeView APG aria-activedescendant 模式)。
        aria-activedescendant={focusedId ? `${activeDescendantPrefix}treeitem-${focusedId}` : undefined}
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
          'flex flex-col',
          className,
        )}
        style={{
          ['--tree-px' as string]: CONTEXT_PX_VAR[context],
          ...props.style,
        } as React.CSSProperties}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        // a11y APG:Tab 進入時初始化 virtual focus(優先 selected,其次第一個可用節點);
        // 原本無 onFocus init → focusedId=null → aria-activedescendant undefined,AT 讀不到目前節點
        onFocus={(e) => {
          ;(props as React.HTMLAttributes<HTMLDivElement>).onFocus?.(e)
          if (e.target === e.currentTarget && !focusedId && treeRef.current) {
            const first =
              treeRef.current.querySelector<HTMLElement>('[role="treeitem"][aria-selected="true"]:not([hidden]):not([aria-disabled="true"])') ??
              treeRef.current.querySelector<HTMLElement>('[role="treeitem"]:not([hidden]):not([aria-disabled="true"])')
            if (first) setFocusedId(first.dataset.treeId ?? null)
          }
        }}
        tabIndex={0}
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
        >
          {treeEl}
          {draggable && (
            <>
              {/* 鍵盤重排 SR 播報 — TreeView 自有 sr-only polite live region(單一節點覆寫式更新;
                  消費 select-menu.tsx SelectMenuLiveStatus 先例)。渲染在 role="tree" 之外
                  (tree 的合法 children 只有 treeitem / group);dnd-kit DndContext 內建 live region
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
    'transition-colors duration-150',
    'outline-none',
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
   * 位置:在 icon 之後、label 之前。
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
   *
   * 規則對齊 Input.endSlot canonical:90% case 用 `inlineActions` 宣告式 API,
   * 10% config 表達不出時走 slot。視覺一致性由 consumer 負責(可使用 host 內部 helper
   * — 但禁止 app-code 直接 import L3 primitive,見 `check_canonical_propagation.sh` E.2,原 `check_l3_primitive_import` 已 folded)。
   */
  inlineActionsSlot?: React.ReactNode
  /**
   * Inline actions 的顯示模式:
   * - `"hover"`(預設):row hover 或鍵盤 focus(focus-visible)時才淡入
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
  ({ id, label, icon: Icon, checkbox, inlineActions, inlineActionsSlot, actionsReveal = 'hover', indicator, disabled, children, className, ...props }, ref) => {
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
      draggingId,
      dropTarget,
      toggleExpand,
      select,
      setFocusedId,
      registerNode,
      unregisterNode,
      isKeyboardRef,
      activeDescendantPrefix,
    } = ctx

    const hasChildren = React.Children.count(children) > 0
    const isExpanded = expandedIds.has(id)
    const isSelected = selectedIds.has(id)
    const isFocused = focusedId === id
    const showRing = isFocused && isKeyboardRef.current
    const isDragging = draggingId === id
    const isDropTarget = dropTarget?.id === id

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

    // ── Focus scroll into view ──
    const itemRef = React.useRef<HTMLDivElement>(null)
    React.useImperativeHandle(ref, () => itemRef.current!)

    React.useEffect(() => {
      if (isFocused && itemRef.current) {
        itemRef.current.scrollIntoView({ block: 'nearest' })
      }
    }, [isFocused])

    // ── Handlers ──
    const handleRowClick = React.useCallback(
      (e: React.MouseEvent) => {
        if (disabled) return
        e.stopPropagation()
        setFocusedId(id)
        select(id)
        if (expandOnSelect && hasChildren) {
          toggleExpand(id)
        }
      },
      [id, disabled, select, setFocusedId, expandOnSelect, hasChildren, toggleExpand]
    )

    const handleChevronClick = React.useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation()
        if (disabled) return
        toggleExpand(id)
      },
      [id, disabled, toggleExpand]
    )

    // ── Chevron(永遠存在:expandable = 旋轉箭頭;leaf = placeholder 佔位) ──
    // 消費 `<ItemPrefix>` SSOT — 永遠 h-[1lh] 對齊 label 第一行中線(item-anatomy 對應)。
    // forced width 透過 style 鎖 chevron 槽寬,讓 sibling label 起點水平對齊(無 chevron leaf 佔位同寬)。
    const chevronSlot = (
      <ItemPrefix style={{ width: iconPx }}>
        {hasChildren ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={handleChevronClick}
            className={cn(
              'flex items-center justify-center rounded-md',
              'text-fg-muted hover:text-foreground hover:bg-neutral-hover',
              'transition-all duration-150',
              isExpanded && 'rotate-90',
              disabled && 'text-fg-disabled pointer-events-none',
            )}
            style={{ width: iconPx, height: iconPx }}
            aria-hidden
          >
            <ChevronRight size={iconPx} />
          </button>
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
          // DOM id 供容器 aria-activedescendant 指向(virtual focus);與 data-tree-id 並存
          // (data-tree-id 給內部 querySelector / drag,id 給 AT)。
          id={`${activeDescendantPrefix}treeitem-${id}`}
          role="treeitem"
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-selected={selectionMode !== 'none' ? isSelected : undefined}
          aria-level={depth + 1}
          aria-disabled={disabled || undefined}
          // 2026-07-05 D4 修:aria-roledescription 移到 treeitem(有 role 的元素才合法)—
          // 供 AT 提示此 node 可拖曳;值消費 dnd-kit attributes SSOT(預設 'draggable')。
          aria-roledescription={draggable && !disabled ? dragAttrs['aria-roledescription'] : undefined}
          data-tree-id={id}
          data-tree-parent-id={parentId ?? ''}
          data-tree-has-children={hasChildren}
          tabIndex={-1}
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
            ref={(node) => {
              // 合併 drag + drop ref 到同一個 element
              if (draggable) setDragRef(node)
              setDropRef(node)
            }}
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
              isDropTarget && dropTarget?.position === 'inside' && dropIndicatorInside,
              !disabled && 'hover:bg-neutral-hover hover:text-foreground',
              !disabled && isSelected && selectionMode === 'single' && 'bg-neutral-selected',
              showRing && 'ring-2 ring-ring ring-inset',
              disabled && 'pointer-events-none text-fg-disabled cursor-default',
              className,
            )}
            style={{
              paddingLeft: indentPx > 0
                ? `calc(var(--tree-px) + ${indentPx}px)`
                : 'var(--tree-px)',
              paddingRight: 'var(--tree-px)',
            }}
            onClick={handleRowClick}
            // 2026-07-05 D4 修:只 spread listeners,不 spread dnd-kit attributes —
            // useDraggable 預設 attributes 注入 role="button" + tabIndex=0 + aria-pressed +
            // aria-describedby(鍵盤拖曳指示):role=button 污染 treeitem 語意、tabIndex=0
            // 讓每 row 變 DOM tab stop 破壞單一 tab stop 虛擬焦點模型(DOM focus 在 row 上按
            // Enter 會 bubble 到容器 handleKeyDown 但 handler 操作 state focusedId → 錯位);
            // sensors 僅 PointerSensor(無 KeyboardSensor),這些 attrs 換不到鍵盤拖曳能力;
            // 鍵盤重排(2026-07-14 v1)走容器 handleKeyDown 的 Cmd/Ctrl+Shift+Arrow 分支,非 dnd-kit sensor。
            // aria-roledescription 保留在上方 treeitem 元素(有 role 才合法)。
            {...(draggable ? dragListeners : {})}
            {...props}
          >
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
                {/* 2026-07-05 D4 修:auto-render Checkbox 補 tabIndex={-1} — Radix Checkbox root
                  * 是原生 button(預設可聚焦),aria-hidden + 可聚焦 = axe aria-hidden-focus,且
                  * 破壞 tree 單一 tab stop 虛擬焦點模型(tree-view.spec.md「Focus」段);
                  * ItemPrefix pointer-events-none 只擋滑鼠不擋鍵盤。選取語意由 treeitem
                  * aria-selected 承載,checkbox 純視覺反映。 */}
                {checkbox || <Checkbox checked={isSelected} disabled={disabled} aria-hidden="true" tabIndex={-1} />}
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

            <span className={cn('flex-1 min-w-0 truncate', disabled && 'text-fg-disabled')}>
              {label}
            </span>

            {/* Suffix inline actions——宣告式 API,用 `<ItemInlineAction>` 渲染。
                消費 `<ItemSuffix hoverReveal hoverGroup="tree-item">` SSOT(2026-05-05 v8 group selector 參數化後)。
                actionsReveal="hover"(預設):row hover 或 keyboard focus-visible 才顯示;
                actionsReveal=false:常駐顯示。跟 SidebarMenuButton 共用同一條規則,行為一致。
                inlineActionsSlot escape hatch 優先(consumer 自控 JSX,reveal 一樣套外層 group)。 */}
            {/* 2026-06-12 R2(同 sidebar.tsx 修):宿主 disabled 時 render 層擋 inline actions —
                inline-action.spec.md「宿主 disabled | 不渲染」;row pointer-events 蓋不住
                actionsReveal=false 常駐顯示的視覺暗示,必須 render 層 guard。 */}
            {disabled ? null : inlineActionsSlot ? (
              <ItemSuffix hoverReveal={actionsReveal === 'hover'} hoverGroup="tree-item">
                {inlineActionsSlot}
              </ItemSuffix>
            ) : inlineActions && inlineActions.length > 0 ? (
              <ItemSuffix hoverReveal={actionsReveal === 'hover'} hoverGroup="tree-item">
                {inlineActions.map((action, i) => (
                  <ItemInlineAction key={action.label + i} action={action} />
                ))}
              </ItemSuffix>
            ) : null}
          </div>

          {/* Drop indicator — after:同 before mirror 到 bottom edge(SSOT drag-visual.ts)*/}
          {isDropTarget && dropTarget?.position === 'after' && (
            <div
              className={dropIndicatorRow.after}
              style={{ left: `calc(var(--tree-px) + ${indentPx}px)` }}
            />
          )}

          {/* Children: Collapsible 展開/收合 */}
          {hasChildren && (
            <CollapsiblePrimitive.Root open={isExpanded}>
              <CollapsiblePrimitive.Content
                className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
              >
                <DepthContext.Provider value={depth + 1}>
                  <div role="group" className="flex flex-col w-full">
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
    ring: ['ring-ring'],
  },
  defaultSize: 'md',
} as const

export { TreeView, TreeItem, treeItemVariants }
