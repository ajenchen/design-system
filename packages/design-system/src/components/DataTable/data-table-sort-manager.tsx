// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// same-row-mixed-allow: header chrome corner buttons(refresh/close)跟 row inline actions(drag/trash)不在同 row
import * as React from 'react'
import { Plus, Trash2, X as XIcon, RotateCcw, GripVertical } from 'lucide-react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor, KeyboardSensor, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { type DragOutcome, useDragAccessibility } from '@/design-system/lib/drag-announcements'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { dragSourceStyle, dragHandleCursorClass, forwardDragActivatorAttributes, DRAG_ACTIVATION_DISTANCE_PX } from '@/design-system/lib/drag-visual'
import { Button } from '@/design-system/components/Button/button'
import { Select, type SelectOption } from '@/design-system/components/Select/select'
import { SurfaceHeader, SurfaceBody, COMPACT_HEADER_SLOT } from '@/design-system/patterns/overlay-surface/overlay-surface'
import { PopoverTitle, PopoverClose } from '@/design-system/components/Popover/popover'
import { ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { getColumnId, getColumnLabel } from './lib/column-meta'
import { usePanelBulkAction } from './lib/panel-bulk-action'

/**
 * DataTableSortManager — Notion-style 多欄排序管理 panel
 *
 * 對齊 ref/進階篩選/sort.png 設計:
 *   Header(title + 恢復預設 + close)/ list(field + direction + delete + reorder)/
 *   加排序那一排(左「+ 加排序」、最右「清除全部」)。
 *   「恢復預設」與「清除全部」是兩件事(user 2026-11-11):前者回到產品存的那一份排序(`defaultSorting`,與目前不同才出現),
 *   後者清掉全部排序(`clearable`,有排序才出現)。規格:data-table.spec.md L4「Header 恢復預設 / 清除全部」。
 *
 * Source-of-truth: TanStack `SortingState`(同 `useReactTable.state.sorting`)。
 * 跟 cell click sort 共享 state — single source-of-truth across cell + panel。
 *
 * Reorder:DnD(useSortable + GripVertical handle,見下方 SortRow)——原 MVP ↑/↓ button 已退役。
 */

interface SortColumn {
  id: string
  label: string
  enableSorting?: boolean
}

// `Omit<…, 'onReset'>` 刻意保留:2026-11-11 拿掉的 `onReset` 若還有人傳,型別層直接報錯 ——
// 不 Omit 的話它會被當成 HTML 的表單 reset 事件收下、默默灑到 div 上,永遠不會觸發(M23(f):讓型別把每個 consumer 逼出來改)。
export interface DataTableSortManagerProps<TData> extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onReset'> {
  /** 可排序欄位來源(讀 columnDef.header / id);會自動排除 enableSorting=false */
  columns: ColumnDef<TData, any>[]
  /** 當前排序 state(TanStack SortingState) */
  sorting: SortingState
  /** 排序變更 callback */
  onSortingChange: (next: SortingState) => void
  /**
   * 產品存的預設排序(例:使用者存過的檢視、管理員設的預設)。目前的排序與它不同時,標題列出現「恢復預設」,按下回到這一份;
   * 一樣時不出現。不傳 = 這個產品沒有預設排序 → 不出現「恢復預設」。同篩選面板的 `defaultValue`(data-table.spec.md L4)。
   * 2026-11-11 取代 `onReset`(以 callback 有無當「重置」的渲染閘,DS 範例又接成清空 —— 把「恢復預設」與「清除全部」混成一顆)。
   */
  defaultSorting?: SortingState
  /** 「加排序」那一排最右要不要提供「清除全部」(預設 `true`)。提供時有排序才出現,按下清掉全部排序。 */
  clearable?: boolean
  /** × 按下時的通知(選填)。× 恆渲染、關閉由 PopoverClose 內建 —— 面板必須放在 `<Popover>` 裡 */
  onClose?: () => void
  className?: string
}

/** 兩份排序相同 = 欄位、方向、順位都一樣 */
function isSortingEqual(a: SortingState, b: SortingState): boolean {
  return a.length === b.length && a.every((s, i) => s.id === b[i].id && Boolean(s.desc) === Boolean(b[i].desc))
}

function extractColumns<TData>(columns: ColumnDef<TData, any>[]): SortColumn[] {
  const out: SortColumn[] = []
  for (const col of columns) {
    const id = getColumnId(col)
    if (!id || id === '__select__') continue
    if (col.enableSorting === false) continue
    out.push({ id, label: getColumnLabel(col, id), enableSorting: true })
  }
  return out
}

const DIRECTION_OPTIONS: SelectOption[] = [
  { value: 'asc', label: '升冪' },
  { value: 'desc', label: '降冪' },
]

function DataTableSortManagerInner<TData>({
  columns,
  sorting,
  onSortingChange,
  defaultSorting,
  clearable = true,
  onClose,
  className,
  ...props
}: DataTableSortManagerProps<TData>, ref: React.ForwardedRef<HTMLDivElement>) {
  const sortableColumns = React.useMemo(() => extractColumns(columns), [columns])
  // 整批動作(恢復預設 / 清除全部)按下後:焦點交給「加排序」(停用時給 ×)、polite 播報結果(lib/panel-bulk-action.tsx)
  const addRef = React.useRef<HTMLButtonElement>(null)
  const dismissRef = React.useRef<HTMLButtonElement>(null)
  const bulk = usePanelBulkAction({
    value: sorting,
    isEqual: isSortingEqual,
    onChange: onSortingChange,
    focusTargets: () => [addRef.current, dismissRef.current],
  })
  // 出現條件 = 按下去會改變東西(資料驅動,不看 callback 有無;M23(f))
  const showReset = defaultSorting !== undefined && !isSortingEqual(sorting, defaultSorting)
  const showClearAll = clearable && sorting.length > 0
  const fieldOptions: SelectOption[] = React.useMemo(
    () => sortableColumns.map((c) => ({ value: c.id, label: c.label })),
    [sortableColumns]
  )

  const updateAt = (index: number, patch: Partial<{ id: string; desc: boolean }>) => {
    const next = sorting.map((s, i) => (i === index ? { ...s, ...patch } : s))
    onSortingChange(next)
  }
  const removeAt = (index: number) => {
    onSortingChange(sorting.filter((_, i) => i !== index))
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
  const drag = useDragAccessibility({ getOutcome: () => outcomeRef.current, kind: '排序條件' })

  const handleDragEnd = (event: DragEndEvent) => {
    outcomeRef.current = null
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sorting.findIndex((s) => s.id === active.id)
    const newIndex = sorting.findIndex((s) => s.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = [...sorting]
    const [moved] = next.splice(oldIndex, 1)
    next.splice(newIndex, 0, moved)
    outcomeRef.current = { kind: '排序條件', label: String(active.id) }
    onSortingChange(next)
  }
  const addSort = () => {
    const used = new Set(sorting.map((s) => s.id))
    const firstUnused = sortableColumns.find((c) => !used.has(c.id))
    if (!firstUnused) return
    onSortingChange([...sorting, { id: firstUnused.id, desc: false }])
  }

  // K11 fix(2026-05-04): viewport-aware scroll chain invariant — 詳 overlay-surface.spec.md
  // 面板寬 30rem(480px):只有這個面板在用、不隨密度切換 → 元件自己的值,不開 token
  // (token-system.spec.md 判斷流程第 0 題;2026-11-11 token「3全收」從 uiSize.css 收回)。rem 讓它跟著使用者字級設定縮放
  return (
    <div
      ref={ref}
      className={cn('flex flex-col h-full min-h-0 w-[30rem]', className)}
      {...props}
      // 鍵盤搬排序條件(Space 提起、方向鍵移、Esc 取消)時按 Esc 只取消拖曳、面板不關(2026-10-01;修前一下少兩層,實測):
      // 拖曳中宣告 Esc 層 + 把這一下標成拖曳獨占(lib/drag-announcements.ts useDragAccessibility.escapeLayer;drag-canonical.md invariant 8)
      {...drag.escapeLayer}
    >
      {/* Popover 派輕量 chrome — slot 走 COMPACT_HEADER_SLOT(=21,衍生自 PopoverTitle text-body line-box),header 自然 ~45px */}
      {/* 右側「恢復預設 │ ×」走 SurfaceHeader 的右側按鈕位(分隔線由 SurfaceHeader 放,overlay-surface.spec.md「SurfaceHeader」右側按鈕位)。
          「恢復預設」= 目前 ≠ 產品給的 defaultSorting 才出現(資料驅動;2026-11-11 前以 onReset 有無當渲染閘、aria-label「重置」,
          DS 範例接成清空 —— 文案改用篩選 / 欄位顯示面板既有的「恢復預設」)。
          × 恆渲染(data-table.spec.md L4「Header 恢復預設 / 清除全部」;M23(f) 禁以 callback 有無當渲染閘),關閉由 PopoverClose 內建,
          onClose 只是通知 —— 所以面板必須放在 Popover 裡(2026-11-10 前沒傳 onClose 就沒有 ×,n7 第七節 3)。 */}
      <SurfaceHeader
        className={COMPACT_HEADER_SLOT}
        actions={showReset ? <Button variant="text" size="sm" iconOnly startIcon={RotateCcw} aria-label="恢復預設" onClick={(e) => { if (defaultSorting) bulk.run(e, defaultSorting, '已恢復預設排序') }} /> : undefined}
        dismiss={<PopoverClose asChild><Button ref={dismissRef} data-dismiss iconOnly dismiss size="sm" startIcon={XIcon} aria-label="關閉" onClick={onClose} /></PopoverClose>}
      >
        <PopoverTitle>排序</PopoverTitle>
      </SurfaceHeader>

      {/* Body — 條件 list + inline 加排序 CTA(對齊 filter panel canonical Q3+Q6,2026-05-04)
          無條件時 CTA 直接顯示,不需要 Empty 大區塊 */}
      <SurfaceBody className="flex flex-col gap-[var(--layout-space-tight)]">
        {sorting.length > 0 && (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} accessibility={drag.accessibility}>
            {drag.liveRegion}
            <SortableContext items={sorting.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {sorting.map((sort, index) => {
                const usedByOthers = new Set(sorting.filter((_, i) => i !== index).map((s) => s.id))
                const optionsForRow = fieldOptions.filter((o) => !usedByOthers.has(o.value))
                return (
                  <SortRow
                    key={sort.id}
                    sort={sort}
                    optionsForRow={optionsForRow}
                    onChangeId={(v) => updateAt(index, { id: v })}
                    onChangeDir={(v) => updateAt(index, { desc: v === 'desc' })}
                    onRemove={() => removeAt(index)}
                  />
                )
              })}
            </SortableContext>
          </DndContext>
        )}

        {/* B1 加排序 → tertiary,parallel filter「加篩選」(root-level CTA 對等視覺重量)。
            同一排最右「清除全部」(user 2026-11-11「該按鈕應該放在 add sort 那排然後直接靠在最右邊？」):tertiary variant
            (user 2026-11-12 「第四批成品的問題都照你建議，但清除全部的按鈕用TERTIARY」;2026-11-12 前是 text);沒有排序時不出現(同 Combobox「清除全部」有值才出現、標題列「恢復預設」與預設不同才出現)。 */}
        <div className="flex items-center justify-between gap-2" data-panel-add-row="">
          <Button
            ref={addRef}
            variant="tertiary"
            size="sm"
            startIcon={Plus}
            onClick={addSort}
            disabled={sorting.length >= sortableColumns.length}
          >
            加排序
          </Button>
          {showClearAll ? (
            <Button variant="tertiary" size="sm" onClick={(e) => bulk.run(e, [], '已清除全部排序')}>清除全部</Button>
          ) : null}
        </div>
        {bulk.liveRegion}
      </SurfaceBody>
    </div>
  )
}

export const DataTableSortManager = React.forwardRef(DataTableSortManagerInner) as <TData>(
  props: DataTableSortManagerProps<TData> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => React.ReactElement
;(DataTableSortManager as { displayName?: string }).displayName = 'DataTableSortManager'

// SortRow:DnD-enabled row。GripVertical 為 drag listener handle(對齊 Notion / Airtable 拖曳 idiom)。
function SortRow({
  sort, optionsForRow, onChangeId, onChangeDir, onRemove,
}: {
  sort: { id: string; desc: boolean }
  optionsForRow: SelectOption[]
  onChangeId: (v: string) => void
  onChangeDir: (v: string) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sort.id })
  // 對齊 lib/drag-visual.ts SSOT:source dim 用 `--opacity-disabled` token(不 hardcode 0.5)
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...dragSourceStyle(isDragging),
  }
  // **#5 fix(2026-05-04)**:row 內水平 gap = gap-2 (8px),layoutSpace 規則 5 緊密相關
  // SurfaceBody row↔row vertical 仍 tight(12)— 不同 row 不緊密
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2">
      <ItemInlineActionButton
        icon={GripVertical}
        size="sm"
        aria-label="拖曳重排"
        className={dragHandleCursorClass}
        {...forwardDragActivatorAttributes(attributes)}
        {...listeners}
      />
      <div className="flex-1 min-w-0">
        <Select size="sm" aria-label="排序欄位" options={optionsForRow} value={sort.id} onChange={onChangeId} />
      </div>
      <div className="w-32 shrink-0">
        <Select size="sm" aria-label="排序方向" options={DIRECTION_OPTIONS} value={sort.desc ? 'desc' : 'asc'} onChange={onChangeDir} />
      </div>
      {/* Trash 用 text Button(Q4 對齊 filter panel)— form-control row 必 Field 同高 */}
      <Button variant="text" size="sm" iconOnly startIcon={Trash2} aria-label="刪除" onClick={onRemove} />
    </div>
  )
}
