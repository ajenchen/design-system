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
 *   - 「恢復預設」(標題列 RotateCcw):回到產品給的 `defaultVisibility`,目前與它不同才出現、不傳就沒有 —— 同排序 / 篩選面板
 *     (data-table.spec.md L4「Header 恢復預設 / 清除全部」;2026-11-15 前是 `resettable` 開關 + 有隱藏欄才出現、按下 = 全部顯示)
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

interface ColumnVisibilityPanelColumn {
  /** Column id(stable identifier;對齊 DataTable column.id / accessorKey)*/
  id: string
  /** Column header label(human-readable)*/
  label: string
}

export interface DataTableColumnVisibilityPanelProps extends React.HTMLAttributes<HTMLDivElement> {
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
  /**
   * 產品設定的預設可見欄(例:專案管理員設的預設欄位、使用者存過的檢視;寫法同 `visibility`)。目前的可見欄與它不同時,
   * 標題列出現「恢復預設」,按下回到這一份;一樣時不出現。不傳 = 這個產品沒有預設 → 不出現「恢復預設」。
   * 「一樣」= 面板列出的每一欄顯示 / 隱藏都相同(沒寫 = 顯示,`{}` 與 `{ a: true }` 一樣)。
   * 同排序面板 `defaultSorting`、篩選面板 `defaultValue`(data-table.spec.md L4「Header 恢復預設 / 清除全部」)。
   * 2026-11-15 取代 `resettable`(另外開才有、有隱藏欄就出現、按下 = 全部顯示 —— 不是產品的預設);不留別名,
   * 舊寫法 `resettable` 不是 div 的屬性,型別層直接報錯(M23(f):讓型別把每個 consumer 逼出來改)。
   */
  defaultVisibility?: Record<string, boolean>
  // Issue 3 post-codex audit(2026-05-10):`onClose` prop retired — Radix `PopoverClose asChild`
  // 已自帶 popover dismiss,沒 concrete consumer 需 callback。Future 若需要再加。
}

/** 兩份可見欄相同 = 面板列出的每一欄顯示 / 隱藏都一樣(沒寫 = 顯示,同 `visibility` 的讀法;含鎖定欄 —— 按下去會改到它就算不一樣) */
function isVisibilityEqual(ids: readonly string[], a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  return ids.every((id) => (a[id] !== false) === (b[id] !== false))
}

export const DataTableColumnVisibilityPanel = React.forwardRef<HTMLDivElement, DataTableColumnVisibilityPanelProps>(({
  columns,
  visibility,
  onVisibilityChange,
  columnOrder,
  onColumnOrderChange,
  lockedIds = [],
  searchable = false,
  defaultVisibility,
  className,
  ...props
}, ref) => {
  const [search, setSearch] = React.useState('')
  const columnIds = React.useMemo(() => columns.map((c) => c.id), [columns])
  // 「恢復預設」按下後:焦點交給標題列的 ×、polite 播報結果(lib/panel-bulk-action.tsx,三個面板共用)。
  // 焦點順位照 lib 既有的「加條件鈕 → ×」:這個面板沒有加條件鈕,所以直接給 ×(PopoverHeader 內建、恆渲染)。【AI 推導 2026-11-15】
  const headerRef = React.useRef<HTMLDivElement>(null)
  const bulk = usePanelBulkAction({
    value: visibility,
    isEqual: (a, b) => isVisibilityEqual(columnIds, a, b),
    onChange: onVisibilityChange,
    focusTargets: () => [headerRef.current?.querySelector<HTMLElement>('button[data-dismiss]')],
  })
  // 出現條件 = 按下去會改變東西(資料驅動,不另開開關;同排序 / 篩選面板 —— M23(f))
  const showReset = defaultVisibility !== undefined && !isVisibilityEqual(columnIds, visibility, defaultVisibility)
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

  const handleToggle = (id: string) => {
    const visible = visibility[id] !== false
    onVisibilityChange({ ...visibility, [id]: !visible })
  }

  const handleBulkToggle = () => {
    if (allVisible) {
      const next: Record<string, boolean> = {}
      togglableIds.forEach((id) => { next[id] = false })
      onVisibilityChange(next)
    } else {
      onVisibilityChange({})
    }
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
    outcomeRef.current = { kind: '欄位', label: String(active.id) }
    onColumnOrderChange!(next)
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
    //   寬度仍由 consumer 的 `<PopoverContent w-72>` 提供(panel root w-full 撐滿)。
    // 鍵盤搬欄位(Space 提起、方向鍵移、Esc 取消)時按 Esc 只取消拖曳、面板不關(2026-10-01;lib/drag-announcements.ts useDragAccessibility.escapeLayer)
    <div ref={ref} className={cn('flex flex-col h-full min-h-0 w-full', className)} {...props} {...drag.escapeLayer}>
      {/* 右側「恢復預設 │ ×」走 PopoverHeader 的右側按鈕位(× 與分隔線由 SurfaceHeader 放,兩側各 12;overlay-surface.spec.md「SurfaceHeader」右側按鈕位)。
          2026-11-10 前自刻在 children(hideClose + 外層 gap-1)→ 分隔線兩側只有 8。
          「恢復預設」= 目前 ≠ 產品給的 defaultVisibility 才出現,按下回到那一份(2026-11-15 前:resettable 開關 + 有隱藏欄才出現、按下 = 全部顯示)。 */}
      <PopoverHeader
        ref={headerRef}
        actions={showReset ? (
          <Button
            variant="text" size="sm" iconOnly startIcon={RotateCcw}
            aria-label="恢復預設"
            onClick={(e) => { if (defaultVisibility) bulk.run(e, defaultVisibility, '已恢復預設欄位顯示') }}
          />
        ) : undefined}
      >
        <PopoverTitle>欄位顯示</PopoverTitle>
      </PopoverHeader>
      {searchable && (
        <div className="shrink-0 px-[var(--layout-space-loose)] pt-[var(--layout-space-tight)]">
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
      {/* viewport-adaptive body(List-as-region idiom:PopoverBody !px-0 !py-0 撤 chrome padding,
          內層 py-2 給垂直呼吸、row 自帶 px-loose 水平 padding)。取代原 fixed ScrollArea max-h-72。 */}
      <PopoverBody className="!px-0 !py-0">
        <div className="py-2 flex flex-col" style={{ '--item-prefix-slot': '16px' } as React.CSSProperties}>
          {dndEnabled ? (
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
      </PopoverBody>
      <PopoverFooter className="justify-start">
        <Button variant="tertiary" size="sm" onClick={handleBulkToggle}>
          {allVisible ? '全部隱藏' : '顯示全部'}
        </Button>
      </PopoverFooter>
      {/* 恆渲染的 polite 區域(sr-only = 不佔版面):「恢復預設」的結果播報 */}
      {bulk.liveRegion}
    </div>
  )
})
DataTableColumnVisibilityPanel.displayName = 'DataTableColumnVisibilityPanel'

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
            {...forwardDragActivatorAttributes(attributes)}
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
