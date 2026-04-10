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
import { ChevronRight, GripVertical } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

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
 * - `'menu'`:浮層選單 / dropdown,px-3(12px),對齊 SelectMenuItem / DropdownMenu
 */
type TreeContext = 'sidebar' | 'menu'

// Base horizontal padding per context — 用 CSS variable 注入到 TreeView 容器,
// TreeItem 用 calc(var(--tree-px) + indent) 算出最終 paddingLeft。
const CONTEXT_PX_VAR: Record<TreeContext, string> = {
  sidebar: 'var(--layout-space-loose)',  // md=16px, lg=24px(density 連動)
  menu: '12px',                          // px-3,對齊 SelectMenuItem / DropdownMenu
}

/** Drag drop position — 拖放目標的三種位置 */
export type DropPosition = 'before' | 'after' | 'inside'

/** onDragEnd callback 的參數 */
export interface TreeDragEndEvent {
  /** 被拖曳的 node id */
  sourceId: string
  /** 目標 node id */
  targetId: string
  /** 放置位置:before(同層上方)/ after(同層下方)/ inside(成為子 node) */
  position: DropPosition
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

// Icon / chevron 尺寸——跟 item-layout 的 icon tier 一致
const ICON_PX: Record<SizeKey, number> = { sm: 16, md: 16, lg: 20 }

// indentStep = chevronSize + gap-2(8px)
// 結構對齊:子 chevron 對齊父 icon,子 icon 對齊父 label
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
  /** 目前 drop indicator 的位置 */
  dropTarget: { id: string; position: DropPosition } | null
  toggleExpand: (id: string) => void
  select: (id: string) => void
  setFocusedId: (id: string | null) => void
  registerNode: (id: string, parentId: string | null, hasChildren: boolean) => void
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
}

function useNodeRegistry() {
  const nodesRef = React.useRef(new Map<string, NodeInfo>())

  const registerNode = React.useCallback(
    (id: string, parentId: string | null, hasChildren: boolean) => {
      nodesRef.current.set(id, { id, parentId, hasChildren })
    },
    []
  )

  const unregisterNode = React.useCallback((id: string) => {
    nodesRef.current.delete(id)
  }, [])

  return { nodesRef, registerNode, unregisterNode }
}

// ═══════════════════════════════════════════════════════════════════════════
// TreeView
// ═══════════════════════════════════════════════════════════════════════════

export interface TreeViewProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 元件尺寸,影響 node 高度、icon 大小、indent 寬度 */
  size?: SizeKey
  /**
   * 使用脈絡,決定 item 的水平 padding:
   * - `'sidebar'`(預設):頁面側邊欄,px-2(8px)
   * - `'menu'`:浮層選單 / dropdown,px-3(12px),對齊 SelectMenuItem
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
    const [dropTarget, setDropTarget] = React.useState<{ id: string; position: DropPosition } | null>(null)

    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    )

    const handleDragStart = React.useCallback((event: DragStartEvent) => {
      setDraggingId(String(event.active.id))
    }, [])

    const handleDragOver = React.useCallback((event: DragOverEvent) => {
      const { over, active } = event
      if (!over || over.id === active.id) {
        setDropTarget(null)
        return
      }
      // 計算 drop position:滑鼠在 item 上方 25% = before,下方 25% = after,中間 50% = inside
      const overRect = over.rect
      const mouseY = (event.activatorEvent as MouseEvent)?.clientY ?? 0
      // 用 delta 近似計算
      const offsetY = overRect ? (mouseY - overRect.top) : 0
      const height = overRect?.height ?? 32
      const ratio = offsetY / height

      let position: DropPosition = 'inside'
      if (ratio < 0.25) position = 'before'
      else if (ratio > 0.75) position = 'after'

      setDropTarget({ id: String(over.id), position })
    }, [])

    const handleDragEnd = React.useCallback((event: DragEndEvent) => {
      const { active, over } = event
      if (over && active.id !== over.id && dropTarget) {
        onDragEndProp?.({
          sourceId: String(active.id),
          targetId: String(over.id),
          position: dropTarget.position,
        })
      }
      setDraggingId(null)
      setDropTarget(null)
    }, [dropTarget, onDragEndProp])

    const handleDragCancel = React.useCallback(() => {
      setDraggingId(null)
      setDropTarget(null)
    }, [])

    // ── Node registry ──
    const { registerNode, unregisterNode } = useNodeRegistry()

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
      ]
    )

    // ── Keyboard handler ──
    const treeRef = React.useRef<HTMLDivElement>(null)
    React.useImperativeHandle(ref, () => treeRef.current!)

    const handleMouseDown = React.useCallback(() => {
      isKeyboardRef.current = false
    }, [])

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
          'flex flex-col py-2',
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
              {draggingId ? (
                <div className="opacity-80 shadow-lg rounded-md bg-surface px-3 py-1 text-body leading-compact pointer-events-none">
                  <span className="text-foreground">Dragging...</span>
                </div>
              ) : null}
            </DragOverlay>
          )}
        </DndContext>
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
  ],
  {
    variants: {
      size: {
        sm: 'text-body leading-compact py-[calc((var(--field-height-sm)-1lh)/2)]',
        md: 'text-body leading-compact py-[calc((var(--field-height-md)-1lh)/2)]',
        lg: 'text-body-lg leading-compact py-[calc((var(--field-height-lg)-1lh)/2)]',
      },
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
   * 右側 inline action(hover 該列時才出現)。
   * 用途:⋯ 選單、＋ 新增子頁、刪除等操作。
   * 元件自動處理 hover 顯隱(opacity 0→1),consumer 只需傳 ReactNode。
   *
   * 若需要永遠可見的 suffix(如 badge 計數),放在 `label` 內:
   * ```tsx
   * <TreeItem label={<>Inbox <Badge count={3} /></>} />
   * ```
   */
  actions?: React.ReactNode
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

const TreeItem = React.forwardRef<HTMLDivElement, TreeItemProps>(
  ({ id, label, icon: Icon, checkbox, actions, indicator, disabled, children, className, ...props }, ref) => {
    const ctx = useTreeView()
    const depth = React.useContext(DepthContext)
    const {
      size,
      context,
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

    const iconPx = ICON_PX[size]
    const indentPx = depth * INDENT_STEP[size]

    // ── Drag hooks(只在 draggable 時啟用)──
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
      registerNode(id, parentId, hasChildren)
      return () => unregisterNode(id)
    }, [id, parentId, hasChildren, registerNode, unregisterNode])

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
    // 包在 h-[1lh] 裡,items-start 時對齊 label 第一行中線
    const chevronSlot = (
      <span className="h-[1lh] shrink-0 flex items-center" style={{ width: iconPx }}>
        {hasChildren ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={handleChevronClick}
            className={cn(
              'flex items-center justify-center rounded-sm',
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
      </span>
    )

    return (
      <ParentIdContext.Provider value={id}>
        <div
          ref={(node) => {
            // 合併 3 個 ref:itemRef(scroll into view)、drag ref、drop ref
            (itemRef as React.MutableRefObject<HTMLDivElement | null>).current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
            setDropRef(node)
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
          className={cn('w-full min-w-0 relative', isDragging && 'opacity-40')}
        >
          {/* Drop indicator — before / inside 位置 */}
          {isDropTarget && dropTarget?.position === 'before' && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-10" />
          )}

          {/* Row: drag handle + indent + chevron + checkbox + icon + label + hover actions */}
          <div
            className={cn(
              'group/tree-item',
              treeItemVariants({ size }),
              isDropTarget && dropTarget?.position === 'inside' && 'bg-primary-subtle',
              !disabled && 'hover:bg-neutral-hover',
              // selected bg 只在單選模式(multi-select 用 checkbox 表達,不用背景色)
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
            {...props}
          >
            {/* Drag handle — indent 之後、chevron 之前(spec 規定的位置) */}
            {draggable && !disabled && (
              <span
                ref={setDragRef}
                className="h-[1lh] shrink-0 flex items-center cursor-grab active:cursor-grabbing text-fg-muted hover:text-foreground opacity-0 group-hover/tree-item:opacity-100 transition-opacity"
                style={{ width: iconPx }}
                {...dragListeners}
                {...dragAttrs}
              >
                <GripVertical size={iconPx} />
              </span>
            )}

            {chevronSlot}

            {/* Checkbox 在 icon 前——h-[1lh] 對齊第一行 */}
            {checkbox && (
              <span className="h-[1lh] shrink-0 flex items-center pointer-events-none">
                {checkbox}
              </span>
            )}

            {/* indicator 取代 icon 的位置;h-[1lh] 對齊第一行 */}
            {indicator ? (
              <span className="h-[1lh] shrink-0 flex items-center justify-center" style={{ width: iconPx }}>
                {indicator}
              </span>
            ) : Icon ? (
              <span className="h-[1lh] shrink-0 flex items-center">
                <Icon
                  size={iconPx}
                  className={cn(disabled ? 'text-fg-disabled' : '')}
                  aria-hidden
                />
              </span>
            ) : null}

            <span className={cn('flex-1 min-w-0 truncate', disabled && 'text-fg-disabled')}>
              {label}
            </span>

            {/* Hover-only inline actions(opacity 0→1 on row hover） */}
            {actions && (
              <span className="h-[1lh] shrink-0 ml-auto flex items-center gap-2 opacity-0 group-hover/tree-item:opacity-100 transition-opacity duration-150">
                {actions}
              </span>
            )}
          </div>

          {/* Drop indicator — after 位置 */}
          {isDropTarget && dropTarget?.position === 'after' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary z-10" />
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

export { TreeView, TreeItem, treeItemVariants }
export type { TreeDragEndEvent, DropPosition }
