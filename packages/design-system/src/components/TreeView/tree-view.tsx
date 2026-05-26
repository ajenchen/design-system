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

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

// Icon / chevron 尺寸——從 item-layout pattern module 引入(在檔頂 import),
// 這裡本地不再宣告。所有 row primitives 共用同一個常數。

// indentStep = chevronSize + gap-2(8px)— 2026-05-04 升 SSOT 為 token `--tree-indent-{sm,md,lg}`
// 在 `tokens/uiSize/uiSize.css`。DataTable nested rows 共用此 SSOT,跨元件視覺一致。
// 結構對齊:子 chevron 對齊父 icon,子 icon 對齊父 label。
// Numeric value 此處保留(drop indicator JS px 計算需 number),Tailwind class 走 token。
const INDENT_STEP: Record<SizeKey, number> = { sm: 24, md: 24, lg: 28 }

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
   * - `'sidebar'`(預設):頁面側邊欄,px-2(8px)
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
   * 啟用後每個 TreeItem 左側出現 drag handle(GripVertical icon),
   * 拖曳時顯示 drop indicator(before / after / inside 三種位置)。
   * Consumer 透過 `onDragEnd` callback 接收 reorder 事件,自行更新 data。
   */
  draggable?: boolean
  /** Drag 結束時觸發,提供 sourceId、targetId、position。Consumer 負責 reorder。 */
  onDragEnd?: (event: TreeDragEndEvent) => void
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
      if (!over || over.id === active.id) {
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
              setDropTarget({ id: parentId, position: 'after', depth: parentDepth })
              return
            }
          }
        }
      }

      setDropTarget({ id: String(over.id), position, depth: finalDepth })

      // Auto-expand collapsed folder after 500ms hover (Figma behavior)
      if (position === 'inside' && hasChildren && !expandedIds.has(String(over.id))) {
        if (autoExpandTimerRef.current) clearTimeout(autoExpandTimerRef.current)
        autoExpandTimerRef.current = setTimeout(() => {
          toggleExpandRef.current(String(over.id))
        }, 500)
      } else {
        if (autoExpandTimerRef.current) { clearTimeout(autoExpandTimerRef.current); autoExpandTimerRef.current = null }
      }
    }, [expandedIds])

    const dropTargetRef = React.useRef(dropTarget)
    dropTargetRef.current = dropTarget

    const handleDragEnd = React.useCallback((event: DragEndEvent) => {
      if (autoExpandTimerRef.current) { clearTimeout(autoExpandTimerRef.current); autoExpandTimerRef.current = null }
      const { active, over } = event
      const dt = dropTargetRef.current
      if (over && active.id !== over.id && dt) {
        onDragEndProp?.({
          sourceId: String(active.id),
          targetId: String(over.id),
          position: dt.position,
        })
      }
      setDraggingId(null)
      setDropTarget(null)
    }, [onDragEndProp])

    const handleDragCancel = React.useCallback(() => {
      if (autoExpandTimerRef.current) { clearTimeout(autoExpandTimerRef.current); autoExpandTimerRef.current = null }
      setDraggingId(null)
      setDropTarget(null)
    }, [])

    // ── Node registry ──
    const { registerNode, unregisterNode, getNodeInfo } = useNodeRegistry()

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

    // ── Context value ──
    const contextValue = React.useMemo<TreeViewContextValue>(
      () => ({
        size,
        context,
        selectionMode,
        expandOnSelect,
        draggable,
        isKeyboardRef,
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

        // 取得所有可見的 treeitem
        const items = Array.from(
          treeRef.current.querySelectorAll<HTMLElement>('[role="treeitem"]:not([hidden])')
        )
        const currentIndex = items.findIndex(
          (el) => el.dataset.treeId === focusedId
        )
        if (currentIndex < 0 && items.length > 0 && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
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
      [focusedId, expandedIds, toggleExpand, select, setFocusedId]
    )

    const treeEl = (
      <div
        ref={treeRef}
        role="tree"
        aria-multiselectable={selectionMode === 'multiple' || undefined}
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
        tabIndex={0}
        {...props}
      >
        {children}
      </div>
    )

    return (
      <TreeViewContext.Provider value={contextValue}>
        {/* RowSizeProvider:讓 TreeView 子樹內任何 <ItemIcon> / <ItemAvatar> /
            <ItemInlineAction> 自動讀到對的 size,跟 SidebarProvider 同一條規則。
            未來 TreeView 接 inlineActions API 後也吃這個 context。 */}
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
   * 右側 inline actions(suffix slot,宣告式 API)。對齊 `uiSize.spec.md`「Inline Action」
   * 與 `SidebarMenuButton.inlineActions` 的同一條規格——TreeItem / SidebarMenuButton /
   * 未來的 row primitive 全部用同一個 declarative API。
   *
   * Consumer 只宣告 intent,TreeItem 用 `<ItemInlineAction>` 自動渲染:
   * - Icon 尺寸 = `ICON_SIZE[treeViewSize]`(自動)
   * - Hover bg、tooltip、aria-label、cursor-pointer 自動處理
   * - **不可以**手刻 button JSX(canonical 實作在 `item-layout.tsx`)
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
   * — 但禁止 app-code 直接 import L3 primitive,見 `check_l3_primitive_import.sh`)。
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
   * 取代 chevron 的位置。用於 stepper 的 status indicator(●/○/✓)。
   * 設定後 chevron 不渲染,改渲染 indicator。
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
          role="treeitem"
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-selected={selectionMode !== 'none' ? isSelected : undefined}
          aria-level={depth + 1}
          aria-disabled={disabled || undefined}
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
              // 預設文字色 neutral-8 (fg-secondary),選中後變 neutral-9 (foreground)
              // icon 透過 currentColor 繼承,不需要另外設
              !disabled && !isSelected && 'text-fg-secondary',
              !disabled && isSelected && 'text-foreground',
              // inside: 資料夾背景高亮(Figma 風格),不用 ring/border
              isDropTarget && dropTarget?.position === 'inside' && dropIndicatorInside,
              !disabled && 'hover:bg-neutral-hover hover:text-foreground',
              // 2026-05-26 fix(SSOT drift):移除 `selectionMode === 'single'` condition。
              // 原本只 single 套 bg-neutral-selected,multiple selected 只字色變化視覺殘缺(無 bg)。
              // 世界級對照(macOS Finder / Gmail / MUI X Tree / Atlassian Tree):
              //   multi-select 必有 bg 反白(強 signal),checkbox 為 optional addon。
              //   「只字色變」no precedent,canonical 違反。
              // Inspector multiple toggle 從此跟 WithCheckbox visual 對齊。
              !disabled && isSelected && 'bg-neutral-selected',
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
            {...(draggable ? { ...dragListeners, ...dragAttrs } : {})}
            {...props}
          >
            {chevronSlot}

            {/* Checkbox 在 icon 前——消費 `<ItemPrefix>` 對齊第一行 */}
            {checkbox && (
              <ItemPrefix className="pointer-events-none">
                {checkbox}
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
            {inlineActionsSlot ? (
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
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-neutral-hover', 'bg-primary', 'bg-primary-subtle', 'bg-surface'],
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-fg-secondary', 'text-foreground'],
    ring: ['ring-ring'],
  },
  defaultSize: 'md',
} as const

export { TreeView, TreeItem, treeItemVariants }
