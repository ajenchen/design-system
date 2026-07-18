// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
/**
 * DataTableColumnVisibilityPanel — Issue 3 primitive(2026-05-10)。
 *
 * 從 WithBulkActions story L868+(149 lines)+ RoadmapAllInOne(L1796+,53 lines)抽出 SSOT
 * primitive。Roadmap demo 跟 WithBulkActions 都用此 panel 開啟「欄位顯示」popover。
 *
 * **Feature SSOT**(對齊 Linear / Airtable / Notion / Material X-DataGrid 的 columnVisibility panel idiom):
 *   - 列出所有 togglable 欄位 + Eye / EyeOff 切換
 *   - Locked 欄位(`lockedIds`)— 顯 Lock icon,不可 toggle / 不可 drag
 *   - 可選 search filter(`searchable`,跨欄位 label match)
 *   - 可選 column drag reorder(`onColumnOrderChange` 傳 → 啟 DnD)
 *   - 可選 reset 按鈕(`resettable: boolean` opt-in,header 區 RotateCcw;點擊 `onVisibilityChange({})` 還原全顯示,無獨立 onReset prop)
 *   - Bidirectional bulk toggle(footer button:全可見 → 全部隱藏 / 任一隱藏 → 顯示全部)
 *
 * **Why 抽 primitive**(per Issue 3 Rule-of-3):RoadmapAllInOne + WithBulkActions + 未來 product
 * UI 至少 3 處消費同 panel。重複 hand-craft → 設計語言 drift(已抓到:Roadmap 版無 search /
 * 無 drag / 無 reset,WithBulkActions 版有,語意不一致)。Primitive 把所有 feature 集中,
 * consumer opt-in via props 確保 SSOT。
 *
 * **對齊**:Linear column-visibility-panel pattern / Material X-DataGrid `<GridColumnsPanel>`
 * / Airtable Field-config drawer。
 */

import * as React from 'react'
import { Eye, EyeOff, Lock, GripVertical, Search, RotateCcw, X as XIcon } from 'lucide-react'
import { Button } from '@/design-system/components/Button/button'
import { ButtonDivider } from '@/design-system/components/Button/button-group'
import { Input } from '@/design-system/components/Input/input'
import { ScrollArea } from '@/design-system/components/ScrollArea/scroll-area'
import { PopoverHeader, PopoverFooter, PopoverTitle, PopoverClose } from '@/design-system/components/Popover/popover'
import { ItemPrefix, ItemLabel, ItemInlineActionButton, ROW_PADDING_BY_SIZE } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { cn } from '@/lib/utils'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { dragSourceStyle } from '@/design-system/lib/drag-visual'

interface ColumnVisibilityPanelColumn {
  /** Column id(stable identifier;對齊 DataTable column.id / accessorKey)*/
  id: string
  /** Column header label(human-readable)*/
  label: string
}

export interface DataTableColumnVisibilityPanelProps {
  /** 全部可 toggle 欄位(consumer 已過濾掉 system cols 如 __select__)*/
  columns: ColumnVisibilityPanelColumn[]
  /** 受控 visibility map(`true` / undefined = visible / `false` = hidden)*/
  visibility: Record<string, boolean>
  /** Visibility 變更 callback */
  onVisibilityChange: (next: Record<string, boolean>) => void
  /** 受控 column order(若提供啟 DnD reorder) */
  columnOrder?: string[]
  /** Order 變更 callback;若提供 → 啟用 drag handle / DnD reorder */
  onColumnOrderChange?: (next: string[]) => void
  /** Locked column ids(顯 Lock icon,不可 toggle / 不可 drag)*/
  lockedIds?: string[]
  /** 是否啟搜尋 input(預設 false)*/
  searchable?: boolean
  /** 是否顯 reset button(任一欄隱藏才顯,onClick 清空 visibility map)*/
  resettable?: boolean
  // Issue 3 post-codex audit(2026-05-10):`onClose` prop retired — Radix `PopoverClose asChild`
  // 已自帶 popover dismiss,沒 concrete consumer 需 callback。Future 若需要再加。
}

export function DataTableColumnVisibilityPanel({
  columns,
  visibility,
  onVisibilityChange,
  columnOrder,
  onColumnOrderChange,
  lockedIds = [],
  searchable = false,
  resettable = false,
}: DataTableColumnVisibilityPanelProps) {
  const [search, setSearch] = React.useState('')
  const lockedSet = React.useMemo(() => new Set(lockedIds), [lockedIds])
  const dndEnabled = !!(columnOrder && onColumnOrderChange)

  // 計算 visible order:用 columnOrder 排,fallback columns 順序。
  const orderedIds = React.useMemo(() => {
    if (columnOrder && columnOrder.length > 0) {
      const colSet = new Set(columns.map((c) => c.id))
      return columnOrder.filter((id) => colSet.has(id))
    }
    return columns.map((c) => c.id)
  }, [columnOrder, columns])

  const filteredEntries = React.useMemo(() => {
    return orderedIds
      .map((id) => columns.find((c) => c.id === id))
      .filter((c): c is ColumnVisibilityPanelColumn => c != null)
      .filter((c) => (search ? c.label.toLowerCase().includes(search.toLowerCase()) : true))
  }, [orderedIds, columns, search])

  const togglableIds = columns.map((c) => c.id).filter((id) => !lockedSet.has(id))
  const allVisible = togglableIds.every((id) => visibility[id] !== false)
  const anyHidden = togglableIds.some((id) => visibility[id] === false)

  const handleToggle = (id: string) => {
    const visible = visibility[id] !== false
    onVisibilityChange({ ...visibility, [id]: !visible })
  }

  const handleReset = () => onVisibilityChange({})

  const handleBulkToggle = () => {
    if (allVisible) {
      const next: Record<string, boolean> = {}
      togglableIds.forEach((id) => { next[id] = false })
      onVisibilityChange(next)
    } else {
      onVisibilityChange({})
    }
  }

  const handleDragEnd = (e: DragEndEvent) => {
    if (!dndEnabled) return
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = columnOrder!.indexOf(active.id as string)
    const newIdx = columnOrder!.indexOf(over.id as string)
    if (oldIdx < 0 || newIdx < 0) return
    // Locked id 不可被 reorder 動到
    if (lockedSet.has(columnOrder![oldIdx]) || lockedSet.has(columnOrder![newIdx])) return
    const next = [...columnOrder!]
    const [m] = next.splice(oldIdx, 1)
    next.splice(newIdx, 0, m)
    onColumnOrderChange!(next)
  }

  // 2026-07-18 決策16(⚠️ 二次更正後仍有事實錯,三次修正中 — SSOT consistency 審查進行中):
  //   回傳 Fragment:`<PopoverHeader>` + `ScrollArea max-h-72` + `<PopoverFooter>` 為 PopoverContent 直接子。
  //   **前兩版理由都錯,在此明記以免再犯**:(1)「PopoverHeader 用 -mx 負邊距、包 root 會破壞」= 錯(SurfaceHeader
  //   用正 px-loose + border-b,無 -mx);(2)「sibling FilterPanel/SortManager 自刻 header 不用 primitive」= **也錯**
  //   —— 實查:FilterPanel/SortManager 一樣消費 `SurfaceHeader` + `SurfaceBody`(overlay-surface primitive),外包
  //   `<div flex flex-col h-full>` root。三個 panel **都消費 header primitive,無人自刻**。
  //   真正的差異 = **body/scroll 策略**:FilterPanel/SortManager 用 `SurfaceBody`(viewport-aware flex-1,故 root
  //   必 forward flex-col h-full 的 M25 鏈);本 panel 用 fixed `ScrollArea max-h-72`(定高,無 flex 鏈需求)故 Fragment。
  //   **此差異是否為 drift(該統一成 SurfaceBody viewport-aware)= SSOT consistency 待審**(multi-agent 稽核中);
  //   結論定案後回填正確理由。ref 需求為 0(consumer 走 PopoverContent 自身 ref)。
  return (
    <>
      <PopoverHeader hideClose>
        <div className="flex items-center gap-1 w-full min-w-0">
          <PopoverTitle className="flex-1">欄位顯示</PopoverTitle>
          {resettable && anyHidden && (
            <>
              <Button
                variant="text" size="sm" iconOnly startIcon={RotateCcw}
                aria-label="恢復預設"
                onClick={handleReset}
              />
              <ButtonDivider />
            </>
          )}
          <PopoverClose asChild>
            <Button data-dismiss iconOnly dismiss size="sm" startIcon={XIcon} aria-label="關閉" />
          </PopoverClose>
        </div>
      </PopoverHeader>
      {searchable && (
        <div className="px-[var(--layout-space-loose)] pt-[var(--layout-space-tight)]">
          <Input
            size="md"
            placeholder="搜尋欄位…"
            aria-label="搜尋欄位"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            startIcon={Search}
          />
        </div>
      )}
      <ScrollArea className="max-h-72">
        <div className="py-2 flex flex-col" style={{ '--item-prefix-slot': '16px' } as React.CSSProperties}>
          {dndEnabled ? (
            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
                    draggable
                    onToggle={() => handleToggle(id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            filteredEntries.map(({ id, label }) => (
              <VisibilityRow
                key={id}
                id={id}
                label={label}
                visible={visibility[id] !== false}
                locked={lockedSet.has(id)}
                draggable={false}
                onToggle={() => handleToggle(id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
      <PopoverFooter className="justify-start">
        <Button variant="tertiary" size="sm" onClick={handleBulkToggle}>
          {allVisible ? '全部隱藏' : '顯示全部'}
        </Button>
      </PopoverFooter>
    </>
  )
}

// VisibilityRow:single column row。Draggable mode → GripVertical handle / static mode → 無 handle。
function VisibilityRow({
  id, label, visible, locked, draggable, onToggle,
}: {
  id: string
  label: string
  visible: boolean
  locked: boolean
  draggable: boolean
  onToggle: () => void
}) {
  // Conditional hooks 不行 — 永遠呼 useSortable,只是 disabled 時 listeners no-op
  const sortable = useSortable({ id, disabled: locked || !draggable })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable
  const style: React.CSSProperties = draggable
    ? { transform: CSS.Transform.toString(transform), transition, ...dragSourceStyle(isDragging) }
    : {}
  return (
    <div
      ref={draggable ? setNodeRef : undefined}
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
        ) : draggable ? (
          <ItemInlineActionButton
            icon={GripVertical}
            size="md"
            aria-label="拖曳重排"
            className="cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          />
        ) : null}
      </ItemPrefix>
      <ItemLabel className={locked ? 'text-fg-disabled' : undefined}>{label}</ItemLabel>
      <ItemInlineActionButton
        icon={visible ? Eye : EyeOff}
        size="md"
        aria-label={visible ? '隱藏此欄' : '顯示此欄'}
        disabled={locked}
        onClick={onToggle}
        className={locked ? 'cursor-not-allowed text-fg-disabled' : ''}
      />
    </div>
  )
}
