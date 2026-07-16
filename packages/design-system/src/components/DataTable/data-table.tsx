// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
// code-quality-allow: file-size — foundational composite — 拆檔會複雜化 context / ref / state 同步
//
// ── 檔案結構(2026-05-03 split matrix;2026-06-11 自 data-table.spec.md 遷入,Level 4 code home)──
// 每個檔過 M21 / M17 / Rule-of-3 三 test:
//   - data-table.tsx(主,foundational)
//   - data-table-filter-panel.tsx + data-table-sort-manager.tsx + data-table-column-visibility-panel.tsx(panel state 隔離)
//   - data-table-filter-group.tsx + data-table-filter-value-picker.tsx(@internal;2026-07-14 filter panel
//     過 800 hard cap 拆檔 — row/nested-group renderer + ValueShape picker,只被 panel 消費)
//   - cell-registry.tsx(column type → cell view / edit 解析 SSOT)
//   - data-table-interaction-layer.tsx + active-editor-controller.ts(spreadsheet overlay + portal editor)
//   - column-types.ts + filter-operators.ts(✓ Rule-of-3 SSOT,3+ consumer)
//   - filter-tree.ts(pure data + eval,test isolation)
//   - lib/column-meta.ts(Internal SSOT,消 5 處 `(col as any)`)
//   - + stories / spec / css
// M21 retract:filter-value-picker.tsx 1 consumer → 2026-05-03 inline 回 panel(上列 2026-07-14
//   @internal 拆檔非 M21 迴轉:非 public 抽象,file-size hard cap 驅動,consumer 仍只見 panel)。
import * as React from 'react'
import { createPortal } from 'react-dom'
import { Empty } from '@/design-system/components/Empty/empty'
// L5 分頁(2026-07-06):Pagination = 分頁完整功能 SSOT(頁碼 + showTotal + 每頁筆數選單
// 全 own 在 Pagination;共用模式,Ant Table 消費 Pagination 同派)—— DataTable 只轉發 config
import { Pagination } from '@/design-system/components/Pagination/pagination'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type TableOptions,
  type Column,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { TableScrollProvider } from '@/design-system/components/Field/field-context'
import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronDown, ArrowUp, ArrowDown, ArrowUpDown, Filter as FilterIcon, EyeOff, X as XIcon, GripVertical } from 'lucide-react'
// **v15.0 Path B**(對齊 user 「source 留原位 / indicator 為 drop preview / 不 auto-shift」directive):
// 砍 useSortable + SortableContext 用 useDraggable + useDroppable 分離 hooks(對齊 DS 內 TreeView SSOT)。
import { DndContext, DragOverlay, useDraggable, useDroppable, useDndContext, pointerWithin, rectIntersection, useSensor, useSensors, PointerSensor, KeyboardSensor, MeasuringStrategy, type DragEndEvent, type CollisionDetection } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { ICON_SIZE } from '@/design-system/tokens/uiSize/icon-size'
import { dragSourceStyle, dropIndicatorRow, dropIndicatorColumn, dragActiveCursor, isReorderNoop, reconstructFullRowGhost, snapToCursorModifier } from '@/design-system/lib/drag-visual'
import { nakedCellEditableDisplayHover, fieldDisplayTextClass } from '@/design-system/components/Field/field-wrapper'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/design-system/components/Tooltip/tooltip'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/design-system/components/DropdownMenu/dropdown-menu'
import { ItemInlineActionButton } from '@/design-system/patterns/element-anatomy/item-anatomy'
import { columnTypeDefaults, type ColumnType } from './column-types'
import { resolveCellComponent, type CellComponentProps } from './cell-registry'
import { DataTableInteractionLayer } from './data-table-interaction-layer'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { RadioGroupItem } from '@/design-system/components/RadioGroup/radio-group'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { useControllable } from '@/design-system/hooks/use-controllable'
import { Button } from '@/design-system/components/Button/button'

// ── Variants ─────────────────────────────────────────────────────────────────

// outer border = `border-divider`(同 row divider 色)— T-junction connectivity 設計原則:
// row divider 兩端 meet table outer border;若不同色 → 交匯處視覺斷層;
// divider 不能加重(過搶眼)→ 淡化 outer border 至 divider 同色,seamless。
// 對齊 Ant Design colorBorderSecondary idiom(table outer + divider 同色)。
// 詳 tokens/color/color.spec.md「T-junction connectivity」段。
const dataTableVariants = cva('bg-surface rounded-md overflow-hidden', {
  variants: { bordered: { true: 'border border-divider', false: '' } },
  defaultVariants: { bordered: true },
})

// ── Types ────────────────────────────────────────────────────────────────────

type TableSize = 'sm' | 'md' | 'lg'

export interface DataTableProps<TData>
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
    VariantProps<typeof dataTableVariants> {
  // any-allow: TanStack ColumnDef TValue idiom(per-column value 型別異質,官方範例同)— 對齊本 module 既有 escape 紀律
  columns: ColumnDef<TData, any>[]
  data: TData[]
  size?: TableSize
  autoRowHeight?: boolean
  /**
   * 容器高度。預設 '400px'(body 內捲動);'auto' = 自然高度(hug rows);'100%' = fill parent。
   * L5 分頁(2026-07-06):啟用 `pagination` 且未顯式傳 height 時預設改 'auto' —— 分頁的
   * 導覽通道是頁碼,再疊 body 內捲動 = 雙重導覽(一頁 20 筆只露 10 筆);對齊 Ant Table
   * 無預設高度罩、`scroll.y` 顯式選配的慣例。顯式傳 height 照舊尊重(分頁 + 頁內捲動可並用)。
   */
  height?: string
  overscan?: number
  emptyState?: React.ReactNode
  enableHover?: boolean
  estimateRowHeight?: number
  tableOptions?: Partial<Omit<TableOptions<TData>, 'data' | 'columns' | 'getCoreRowModel'>>
  rowActions?: (row: TData) => React.ReactNode
  /**
   * Issue 9 cell error system(2026-05-10)。
   *
   * Map of `${rowId}:${colId}` → error message(string | string[])。Cell view mode 在 content
   * 下方渲 `text-body text-error` 訊息,gap-1 spacing。Multi-error 用 array → ul / li 分行渲。
   *
   * **使用建議**:
   *   - 搭配 `autoRowHeight` prop:cell error 訊息 wrap → row 自動拉高吸收。fixed 高 row 模式
   *     error 訊息會被裁切(consumer 應 set autoRowHeight=true 給有 error 的 use case)。
   *   - Edit cell 自動 clear 自己的 error(展開 portal Field 時消失,新值 commit 由 consumer
   *     onCellCommit 驗證後決定 set / clear)。
   *   - aria-describedby:cell wrapper 接 error message id,AT 讀 cell 內容後讀 error。
   *
   * 對齊 AG Grid `cellClassRules='ag-cell-error'` + Material X-DataGrid `errorMessage` cell prop +
   * Airtable record validation idiom。
   */
  cellErrors?: Record<string, string | string[]>
  pinnedLeftColumns?: string[]
  pinnedRightColumns?: string[]
  /** Inline edit 視覺模式：body cell 間加垂直分隔線，select 類欄位顯示指示器 */
  inlineEdit?: boolean
  /**
   * Slice D Step 1B(2026-05-10):啟用 spreadsheet-grade interaction overlay。
   * Default false(backward-compat)。Enable 後 hover/editor/selected/range 由
   * `DataTableInteractionLayer` overlay 統一畫,per `.claude/planning/datatable-spreadsheet-rfc.md`。
   * 現況:hover ring + selection ring + active editor host 三個 sub-layer
   * (詳 `data-table-interaction-layer.tsx` 檔頭)。
   */
  experimentalSpreadsheetOverlay?: boolean
  /**
   * Slice D Step 3.2(2026-05-10):啟用 ActiveEditorController portal Field。
   * Default false(backward-compat)。
   * Enable 後 active edit cell 不 render Field inline,改 portal 進 overlay layer
   * (per RFC Contract 8 「one geometry, two paint owners」)。
   * 當前 scaffold:prop 已收,functional portal logic Step 3.3 實作。
   * Per codex Q-7 string-first canary:string cell first,picker types 漸進。
   */
  experimentalActiveEditorController?: boolean
  /**
   * Slice D Step 4(spreadsheet semantics,2026-05-10 user 拍板 + codex Layer B Q2.1 confirm):
   * Excel-like cell selection:click 1=select / click 2=edit / Shift+click=range。
   * Default false opt-in(per codex「DataTable is not a spreadsheet」既有原則 +
   * data-table.principles.stories.tsx「不是試算表」principle story)。
   * Enable 後 inlineEdit cell click 行為:
   *   - Plain click → setSelectedCellId,**不**進 edit mode
   *   - Click on already-selected → enter edit
   *   - Shift+click → extend range from anchor
   *   - Double-click / Enter / F2 / printable(deferred) → enter edit on selected
   *   - Click empty area → clear selection
   * 視覺:selection ring 1px `--primary`(layer `CELL_RING_STYLES.selected`);range 視覺
   *   = cell-bg `--primary-subtle`(`[data-range-cell]` CSS),outer ring 已 2026-05-10 retire
   *   — per user「不要 dash 直接實的就好」+ codex Q2.2 token。
   */
  spreadsheetMode?: boolean

  // ── L2 Selection(see data-table.spec.md「L2 選取」)──
  /** 已選列(controlled)。傳 string[] = include shorthand;傳 DataTableSelection 支援反向選取(all + excluded) */
  selection?: string[] | DataTableSelection
  /** 預設選取(uncontrolled);同上接受 string[] 或 DataTableSelection */
  defaultSelection?: string[] | DataTableSelection
  /** Selection 變更 callback(emit DataTableSelection union;include / all 兩模型) */
  onSelectionChange?: (next: DataTableSelection) => void
  /** 是否啟用 selection / 模式;true 等同 'multi' */
  selectable?: boolean | 'single' | 'multi'
  /** Row 是否可選(disabled rows 只 disable checkbox,row 內容正常 render) */
  isRowSelectable?: (row: TData) => boolean
  /** 取 row 唯一 ID(selection 用);default `(row, index) => String(index)` */
  getRowId?: (row: TData, index: number) => string
  /** Checkbox aria-label fallback;default `'選取此列'` */
  getRowAriaLabel?: (row: TData) => string
  /** Filter 後 hidden selected rows 是否保留(default false,對齊 Material/AG Grid 共識) */
  preserveSelectionOnFilter?: boolean

  // ── L3 Column visibility(顯示隱藏)──
  /** 欄位顯隱(controlled),Record<columnId, boolean>;true / undefined = 顯示 */
  columnVisibility?: Record<string, boolean>
  /** 預設顯隱(uncontrolled) */
  defaultColumnVisibility?: Record<string, boolean>
  /** 顯隱變更 callback */
  onColumnVisibilityChange?: (next: Record<string, boolean>) => void

  // ── L3 Sort(排序)──
  /** 啟用多欄排序(shift+click 加 secondary;單擊仍 replace);default true,對齊 AG Grid / Material */
  enableMultiSort?: boolean

  // ── L3 Filter trigger(callback only — UI in consumer)──
  /** Cell ⌄ menu「Filter by this」點擊,emit columnId 讓 consumer 開 global filter panel + prefill。
   *  對齊 ClickUp / Airtable / Notion 派 — filter 永遠 global,不 per-cell inline。 */
  onColumnFilterTrigger?: (columnId: string) => void

  // ── L4 Inline edit ──
  /**
   * Cell value commit callback。User 編完(blur/Enter/select-option)→ 觸發本 callback。
   * Consumer 自管 data update + persistence。
   * 啟用條件:該 column `meta.editable` 為 true 或 fn 回傳 true。詳 `column-types.ts`。
   */
  onCellCommit?: (rowId: string, columnId: string, value: unknown) => void

  // ── L4 Row drag(Jira-style reorder)──
  /**
   * 啟用 row drag reorder。為 true 時,row 最左出 GripVertical handle(hover-revealed),
   * 拖曳改 default order via `onRowReorder` callback。
   *
   * Sort × Drag 互斥:`sorting.length > 0` 時 drag handle 視覺 disabled + Tooltip
   * 「排序中無法拖曳,清除排序後可重排」。對齊 Notion / Airtable 共識。
   *
   * **必填 `getRowId`**:enableRowDrag 為 true 時 consumer 必傳 `getRowId`,用穩定 row identity 作 dnd source / target id。否則 dnd 用 row.index 會在 reorder 後錯位(runtime 不會 throw,但 reorder 行為不正確)。
   *
   * **v2(2026-05-05)修正**:
   * - Virtualizer × transform:被拖 row 略過 `measureElement`(透過 SortableRowCtx 廣播 active id),避免 transform 干擾測量
   * - 3-panel mirror sync:primary region 呼叫 `useDraggable` + `useDroppable`;mirror region 只 `useDroppable`(v15.4 split),isDragging 由 `useDndContext` active.id 同步 → 三 region 視覺一致
   * - Cross-parent drop:nested 全 row 各自 `useDroppable`,自訂 collisionDetection 過濾出「同 parent siblings」;cross-parent over → 不觸發,handle cursor `not-allowed`
   *
   * 詳 `data-table.spec.md`「L4 Row drag」段。
   */
  enableRowDrag?: boolean
  /**
   * Row reorder callback。User 拖曳完成觸發。
   * @param sourceId 拖曳的 row id
   * @param targetId 放下的目標 row id
   * @param position 'before' | 'after' — 放在 target 前 OR 後
   */
  onRowReorder?: (sourceId: string, targetId: string, position: 'before' | 'after') => void
  /**
   * 啟用全表 column resize(2026-05-06 v11):
   * - `true`: 所有 data columns 全 fixed width,header 右邊出現 resize handle(hover 顯色 +
   *   cursor:col-resize),user 拖拉調整 column width。System columns(checkbox / drag handle /
   *   row actions)永遠 fixed,不在 resize 集合。
   * - `false`(default): 所有 data columns 全 flex-grow:1 均分剩餘寬度。
   *
   * **二選一 canonical**(對齊 Notion / Airtable / Linear product UI 共識)— 不支援 per-column
   * mixed,簡單明確。Min width 預設 80px,consumer 透過 `columnDef.minSize` override。
   */
  enableColumnResize?: boolean
  /**
   * Column resize callback。User 拖完一輪觸發(commit-on-pointerup,非 live)。Consumer 收到
   * 自管 width persistence(localStorage / URL / API)— DS 不持久化(對齊「DS 不包全域 provider」原則)。
   * @param columnId 被 resize 的 column id
   * @param width 最終 width(px)
   */
  onColumnResize?: (columnId: string, width: number) => void
  /**
   * 啟用全表 column reorder(2026-05-06 v11):
   * - `true`: 所有 data column header 可拖曳重排,DragOverlay portal 顯示 ghost
   * - `false`(default): 不啟用
   *
   * 使用 `columnDef.meta.locked = true` 標示鎖定欄(無 grab cursor、不啟動 drag、被拖過不顯
   * drop indicator)。對齊 Notion / Linear locked column canonical。
   */
  enableColumnReorder?: boolean
  /**
   * Column reorder callback。
   * @param sourceId source column id
   * @param targetId target column id
   * @param position 'before' | 'after'
   */
  onColumnReorder?: (sourceId: string, targetId: string, position: 'before' | 'after') => void
  /**
   * L5 分頁(2026-07-06):`true` 或 config 物件啟用——內部接 TanStack `getPaginationRowModel`,
   * 表格下方渲染分頁列(消費 `<Pagination>` 獨立元件,間距 tight、頁碼靠右)。
   * 啟用時虛擬滾動自動關閉(TanStack 官方:互斥替代策略)。v1 = client-side only。
   * 詳 data-table.spec.md「L5:分頁」段。
   */
  pagination?: boolean | DataTablePaginationOptions
}

/** L5 分頁 config(頁碼 1-based 對外,對齊 Pagination / Ant;詳 data-table.spec.md「L5:分頁」段) */
export interface DataTablePaginationOptions {
  /** 每頁筆數(預設 20) */
  pageSize?: number
  /** 每頁筆數選項;傳了才渲染「每頁 N 筆」Select(消費既有 Select size="sm") */
  pageSizeOptions?: number[]
  /** 左側「共 N 筆」文字(opt-in,= Ant showTotal 邏輯;數源 = filter 後全集 getPrePaginationRowModel,非 selection all-mode 的 server-side 全集數 M — 那是 consumer 自持) */
  showTotal?: boolean
  /** 當前頁(1-based,controlled;不傳 = uncontrolled) */
  page?: number
  /** uncontrolled 初始頁(1-based,預設 1) */
  defaultPage?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
}

// ── Cell Rendering(Phase C 2026-05-05 — type-keyed registry SSOT)─────────────
//
// 原 `renderTypedValue` switch + `EditableCellContent` switch 兩條平行 type-switch
// 已 collapse 為單一 `cellRegistry`(./cell-registry.ts)— 每個 type → 一個 cell component,
// 同時處理 view + edit mode(底層 Field control 的 mode prop)。對齊 M17 SSOT consolidation。
//
// 對齊 Notion / Airtable type-aware inline edit canonical(詳 spec §十二):
//   - string / number / currency:cell click → inline edit
//   - date / time / select / multiSelect / person / multiPerson:cell click → 進 edit mode
//   - boolean:不分 read/edit mode,直接 `<Checkbox>` 點即 toggle + commit
//   - url:read = LinkInput view + hover Pencil button,click Pencil 才進 edit mode
//
// Cell id format: `${rowId}__${columnId}`(編輯狀態 keying)
// Commit: blur OR Enter OR overlay close → 呼叫 onCellCommit
// Cancel: Esc → 退出 edit mode 不 commit
//
// World-class source(@benchmark-unverified):AG Grid cellRendererSelector / Material X-Grid
// `valueGetter + renderCell` / Notion property type registry。

const cellEditId = (rowId: string, colId: string) => `${rowId}__${colId}`

// ── Constants ────────────────────────────────────────────────────────────────

// Phase C(2026-05-05):cell 水平 padding 從 magic `0.75rem` 提升為 `--table-cell-px` token
//   (詳 ./data-table.css)— consumer 可走 CSS override 改值,不再 hard-code in TS。
// L2 selection 內部 column id(避免 magic string 重複)
const SELECT_COL_ID = '__select__'

/**
 * L2 選取模型(discriminated union,2026-06-22 對齊 MUI X DataGrid v8
 * rowSelectionModel { type: include | exclude, ids } + AG Grid selectAll + toggledNodes)。
 *
 * - mode==='include' (ids):只選 ids 列(預設;= 載入/可見列逐一選取)。
 * - mode==='all' (excluded):全資料集(filter 後)選取,扣掉 excluded —— 反向選取(inverted)。
 *   解決「全選 10k 筆只載 50 筆 → 無法列舉其餘 ID」:all 模式「選取 = 全集 − excluded」,
 *   任何 toggle 都只是 excluded 的 add/remove,對任意順序封閉、O(1)、不需列舉未載入 ID。
 *
 * 計數(consumer):mode==='all' ? M − excluded.length : ids.length(M = consumer 自持的
 * server-side / filter 後全集筆數;2026-07-13 D1 拍板:DataTable 不收 totalCount prop — DS 內部
 * 零消費 no-op 已移除,計數本來就全由 consumer 端算)。
 * 進入 all 模式:consumer 在「選取全部 M」hint 點擊時 setSelection({ mode: 'all', excluded: [] })。
 */
export type DataTableSelection =
  | { mode: 'include'; ids: string[] }
  | { mode: 'all'; excluded: string[] }

// 正規化:string[] shorthand → { mode:'include' }(向後相容既有 consumer 傳 ID 陣列)
function normalizeSelection(
  input: string[] | DataTableSelection | undefined,
): DataTableSelection | undefined {
  if (input === undefined) return undefined
  if (Array.isArray(input)) return { mode: 'include', ids: input }
  return input
}

// union-aware「把 ids 設成 willSelect 狀態」純函式(對任意 toggle 順序封閉)
function applySelectIds(
  sel: DataTableSelection,
  ids: string[],
  willSelect: boolean,
): DataTableSelection {
  if (sel.mode === 'include') {
    const set = new Set(sel.ids)
    ids.forEach((id) => { if (willSelect) set.add(id); else set.delete(id) })
    return { mode: 'include', ids: Array.from(set) }
  }
  // all 模式:選取 = 全集 − excluded → willSelect 移出 excluded;取消選取 加進 excluded
  const set = new Set(sel.excluded)
  ids.forEach((id) => { if (willSelect) set.delete(id); else set.add(id) })
  return { mode: 'all', excluded: Array.from(set) }
}
const cellPadding: React.CSSProperties = { paddingBlock: 'var(--table-cell-py)', paddingInline: 'var(--table-cell-px)' }
const HEADER_BG = 'bg-muted'

// Column sizing canonical(2026-05-06 v11 — table-level all-or-nothing,Notion / Airtable / Linear 共識):
//   - **Table-level prop `enableColumnResize`** 控制全表 mode(per-column mixed 已 retire,跟 product
//     UI 世界級對齊 — Notion / Airtable / Linear 都是全表二選一,簡單明確)
//   - `enableColumnResize=true`  → 所有 data columns 全 fixed width(尊重 user 拖拉)
//   - `enableColumnResize=false` → 所有 data columns 全 flex-grow:1 均分剩餘寬度(預設,minWidth 保護)
//   - **System columns**(`__select__` / drag handle / row actions)永遠 fixed,跟 enableColumnResize 無關
//   - maxSize 一律 forward 為 maxWidth(防 flex 無限擴張)
//
// 預設 min width = `MIN_COLUMN_WIDTH`(80px;對齊 Polaris IndexTable / AG Grid 範圍下限),consumer
// 可透過 `columnDef.minSize` override。
export const MIN_COLUMN_WIDTH = 80

function columnSizeStyle(
  col: { id: string; getSize: () => number; columnDef: { minSize?: number; maxSize?: number } },
  opts: { resize: boolean; isSystemCol: boolean },
): React.CSSProperties {
  const baseSize = col.getSize()
  // **Regression fix(2026-05-06 v14.1)**:default fallback 從 `MIN_COLUMN_WIDTH (80)` 改回
  // `baseSize`(等於 v9 行為)。前 v11 column resize commit 改 fallback 為 80 後,enableColumnResize=false
  // 的 default flex case 全 column 可 shrink 到 80 → flex 均分忽視 `size` prop → Note 360 被擠到 204
  // → text wrap 行數爆增 → autoRow cell 變高 → edit textarea rows=3 估算更不準 → shrink 看起來壞掉。
  // v9 直覺:沒明示 minSize 預設不 shrink 低於 size。enableColumnResize=true 仍 honour `MIN_COLUMN_WIDTH`
  // (因 user 主動拖拉時要能縮)。
  const minSize = col.columnDef.minSize ?? (opts.resize ? MIN_COLUMN_WIDTH : baseSize)
  const maxSize = col.columnDef.maxSize
  // System columns 永遠 fixed(checkbox / drag handle 等內建欄位,不在 resize 集合)
  if (opts.isSystemCol) {
    return { width: baseSize, minWidth: baseSize, maxWidth: maxSize }
  }
  // Data columns:enableColumnResize=true → fixed 尊重 user 拖拉
  if (opts.resize) {
    return { width: baseSize, minWidth: minSize, maxWidth: maxSize }
  }
  // Data columns:enableColumnResize=false → flex grow but NOT shrink below `size` prop。
  // 對齊 v9 行為:column 沒明示 minSize 時固定 ≥ baseSize(尊重 user `size` 設定),table 寬不夠
  // 觸發 H scroll(預期)。前 v11 換 MIN_COLUMN_WIDTH=80 fallback 讓 columns 全擠等寬,違 user
  // 預期。
  // **Tanstack default 干擾**:tanstack v8 `defaultColumn.minSize=20` 會 merge 進 column.columnDef
  // → `col.columnDef.minSize` 永遠不 undefined → `?? baseSize` 不 fall back。
  // 解法:直接用 baseSize(若 user 要明示 shrink-below-size,改 `enableColumnResize=true` 或別自設
  // `minSize` < size)。
  //
  // **flex-basis: baseSize(2026-05-06 v14.2)**:把 baseSize 當 explicit basis(不是 `0%`)。
  // 為什麼:flex item base = basis + padding(box-sizing: border-box content-box 行為)。前 `0%`
  // basis → cell padding 變 base 一部分。view(padding 12)vs edit(padding 0,Field 接管)
  // 兩態 base 不同 → flex 重分配 → user 報「Price cell 進 edit 寬度縮 12px」
  // (量測:Price view 130.5 → edit 118.5 = -12px)。
  // explicit basis = baseSize 讓 padding 不參與 base 計算 → view↔edit 寬度穩定。
  return { flex: `1 1 ${baseSize}px`, minWidth: baseSize, maxWidth: maxSize }
}

const SYSTEM_COL_IDS = new Set([SELECT_COL_ID, '__drag__', '__actions__'])
const isSystemColumn = (colId: string) => SYSTEM_COL_IDS.has(colId)

// ── TruncateCell ─────────────────────────────────────────────────────────────
// Shared ResizeObserver(2026-04-22 D3 perf audit):從 per-cell RO 改為全 DS 共用一個 RO
// dispatch 到 per-element callback。10 col × 100 row = 1 RO(before:1000 RO)。
// 跨 OS 一致的 RO 行為;element 卸載時 cleanup。

type RoCallback = (entry: ResizeObserverEntry) => void
let sharedResizeObserver: ResizeObserver | null = null
const roCallbacks = new WeakMap<Element, RoCallback>()

function getSharedRO(): ResizeObserver {
  if (sharedResizeObserver) return sharedResizeObserver
  sharedResizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const cb = roCallbacks.get(entry.target)
      if (cb) cb(entry)
    })
  })
  return sharedResizeObserver
}

function observeShared(el: Element, cb: RoCallback): () => void {
  const obs = getSharedRO()
  roCallbacks.set(el, cb)
  obs.observe(el)
  return () => {
    roCallbacks.delete(el)
    obs.unobserve(el)
  }
}

function TruncateCell({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [isTruncated, setIsTruncated] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setIsTruncated(el.scrollWidth > el.clientWidth)
    check()
    return observeShared(el, check)
  }, [])
  const span = <span ref={ref} className={cn('truncate min-w-0', className)}>{children}</span>
  if (!isTruncated) return span
  return <Tooltip><TooltipTrigger asChild>{span}</TooltipTrigger><TooltipContent>{children}</TooltipContent></Tooltip>
}

// ── L4 Row Drag: SortableRowContext(v15 Path B;2026-07-14 JSDoc 對齊實作)──────
// 每 region(left / center / right)各 mount 一次 SortableRowProvider,依 role 分流(v15.4 split):
//   primary → SourceRowProvider(useDraggable + useDroppable)= 唯一 drag source;
//   mirror  → MirrorRowProvider(useDroppable only),isDragging 走 useDndContext active.id 同步。
// 無 SortableContext / useSortable(v15.0 Path B 已砍,見檔頭 import 註解)。listeners 全走
// RowDragHandle Button(v15.6 button-only;row 本身不接 listeners)。primary = left region 若存在否則 center。
// `invalidDrop`(cross-parent over)走 prop 廣播給 RowDragHandle 切 cursor-not-allowed。
interface SortableRowCtxValue {
  setNodeRef: (el: HTMLElement | null) => void
  role: 'primary' | 'mirror'
  style: React.CSSProperties
  attributes: Record<string, unknown>
  isDragging: boolean
  /** **v15.6 button-only drag**(對齊 Notion / Linear / Jira canonical):
   *  整列拖 + ghost 跟 cursor 在 multi-instance same-id pinned column 場景互相矛盾——
   *  唯一 single-source-of-activation = visible RowDragHandle Button。
   *  Source DOM = primary row(`setNodeRef`),activator = button(`handleSetActivatorNodeRef`),
   *  listeners = button(`handleListeners`)。User 從哪個 region 都看見 portal'd button → 點下啟動。
   *  Row click 不觸發 drag(允許 row click → select / open detail 等別的 UX)。
   *  保留 `rowListeners`/`rowAttributes` field 但 button-only mode 為 undefined。 */
  rowListeners: Record<string, unknown> | undefined
  rowAttributes: Record<string, unknown>
  /** RowDragHandle Button 用:接 setActivatorNodeRef → button rect 當 activator;
   *  primary 才提供(mirror 不需要,RowDragHandle 只在 primary region 渲染) */
  handleSetActivatorNodeRef: ((el: HTMLElement | null) => void) | undefined
  handleListeners: Record<string, unknown> | undefined
  handleAttributes: Record<string, unknown>
  /** drag 進行中且當前 over target 與 active 不同 parent → invalid signal */
  invalidDrop: boolean
}
const SortableRowCtx = React.createContext<SortableRowCtxValue | null>(null)

/** Per-region per-row drag wrapper(v15.4 architectural split)。
 *  同 row.id 在 left/center/right 三 region 各 mount 一次,但 hook mount tree 完全分離:
 *  primary → SourceRowProvider(useDraggable + useDroppable);mirror → MirrorRowProvider
 *  (useDroppable only,isDragging 由 useDndContext 同步)。activator / listeners 只給
 *  primary 的 RowDragHandle Button(v15.6 button-only);mirror 不提供避免雙觸發。 */
function SortableRowProvider(props: {
  id: string
  disabled?: boolean
  role: 'primary' | 'mirror'
  invalidDrop: boolean
  children: (ctx: SortableRowCtxValue) => React.ReactNode
}) {
  // **v15.4 final architectural split**:multi-instance same-id 是 dnd-kit anti-pattern。
  // 必須完全分離 component 讓 hook mount tree 不衝突:
  //   - primary 走 SourceRowProvider(useDraggable + useDroppable)— 唯一 source
  //   - mirror 走 MirrorRowProvider(useDroppable only)— 接受 drop target 但不參與 drag source
  // 之前 v15.2/15.3 同 component 内 conditional setNodeRef/disabled 仍讓 mirror instance 進入
  // dnd-kit context store,導致 last-mount-wins 把 activator 取成 mirror region row → ghost
  // 起點偏離 cursor。Split 後 dnd-kit 只看到 primary instance,問題消滅。
  return props.role === 'primary' ? <SourceRowProvider {...props} /> : <MirrorRowProvider {...props} />
}

function SourceRowProvider({
  id,
  disabled,
  role,
  invalidDrop,
  children,
}: {
  id: string
  disabled?: boolean
  role: 'primary' | 'mirror'
  invalidDrop: boolean
  children: (ctx: SortableRowCtxValue) => React.ReactNode
}) {
  const draggable = useDraggable({ id, disabled, data: { type: 'row' } })
  const droppable = useDroppable({ id, disabled, data: { type: 'row' } })
  // **v15.6 button-only drag**:setActivatorNodeRef 不接 row,改由 RowDragHandle Button 接(via ctx)。
  // setNodeRef = primary row(source DOM,ghost 抓這個);droppable.setNodeRef = same row(droppable target)。
  const setRefs = React.useCallback((el: HTMLElement | null) => {
    draggable.setNodeRef(el)
    droppable.setNodeRef(el)
  }, [draggable.setNodeRef, droppable.setNodeRef])
  const isDragging = draggable.isDragging
  // a11y(2026-05-07 v15.10 codex P1 fix):button-only drag mode 下,row 本身不該成為
  // keyboard tab stop。dnd-kit `useDraggable.attributes` 含 `role="button" tabIndex=0
  // aria-roledescription="..."` 全給 activator 用,套到 row div 會讓每筆 row tabbable
  // (large table 累積上百 inert focus stops,grid navigation 體驗壞)。
  // **拆分**:rowAttributes 留空(row 是 passive container)/ handleAttributes 全給
  // RowDragHandle Button(它是真 activator,Button 自帶 role/tabIndex 完全相容)。
  const handleAttrs = draggable.attributes as unknown as Record<string, unknown>
  // 2026-07-05 D3 perf fix:ctxValue useMemo — 原每 render 新 object,RowDragHandle 的
  // useLayoutEffect deps [rowEl, ctx] 在每次 DataTableInner render 都 teardown/重掛
  // MutationObserver + window scroll/resize listener(×每個 visible primary row)。
  // memo 後 identity 只在 drag 相關值真變(isDragging / invalidDrop 等)時才換。
  const ctxValue: SortableRowCtxValue = React.useMemo(() => ({
    setNodeRef: setRefs,
    role,
    style: { ...dragSourceStyle(isDragging) },
    attributes: {},
    isDragging,
    // row 不接 listeners(button-only),baseRowDiv `{...(extra?.listeners ?? {})}` 自動 noop
    rowListeners: undefined,
    rowAttributes: {},
    // Button activator + listener:portal'd RowDragHandle Button 走這條 ctx,
    // user 從任何 region 看見 button → 點下啟動 drag,activator rect = button DOM(24×24),
    // ghost 起點 = button 位置(table outer 左 12px),cursor 在 ghost 左前段(自然視覺)。
    handleSetActivatorNodeRef: draggable.setActivatorNodeRef,
    handleListeners: draggable.listeners as unknown as Record<string, unknown> | undefined,
    handleAttributes: handleAttrs,
    invalidDrop,
  }), [setRefs, role, isDragging, draggable.setActivatorNodeRef, draggable.listeners, handleAttrs, invalidDrop])
  return <SortableRowCtx.Provider value={ctxValue}>{children(ctxValue)}</SortableRowCtx.Provider>
}

function MirrorRowProvider({
  id,
  disabled,
  role,
  invalidDrop,
  children,
}: {
  id: string
  disabled?: boolean
  role: 'primary' | 'mirror'
  invalidDrop: boolean
  children: (ctx: SortableRowCtxValue) => React.ReactNode
}) {
  // Mirror region(left / right pinned)只 mount useDroppable — 接受 drop target,
  // 但不參與 drag source(避免 multi-instance same-id 衝突)。
  // RowDragHandle Button 只在 primary region 渲染(per `showDragHandle = ... && isPrimaryRegion`),
  // mirror ctx 不需要 handle listeners / activator,相關 field 為 undefined。
  // **v15.8 Bug 3 fix**(對齊 user 「source 沒一整條都有 disabled opacity」):
  //   mirror region drag 期間需跟 primary 同步顯 opacity-disabled,讓 source row 跨三 region
  //   視覺一致(SKU 釘選欄 + center + Updated 釘選欄整列半透明)。透過 useDndContext active
  //   判斷:any drag activated with active.id === own row id → mirror 也 isDragging。
  const droppable = useDroppable({ id, disabled, data: { type: 'row' } })
  const dndCtx = useDndContext()
  const isDragging = dndCtx.active?.id === id
  // 2026-07-05 D3 perf fix:ctxValue useMemo(同 SourceRowProvider — 消掉 RowDragHandle
  // effect 的每 render observer/listener churn;mirror 雖不渲 handle,identity 穩定仍省下游 diff)
  const ctxValue: SortableRowCtxValue = React.useMemo(() => ({
    setNodeRef: droppable.setNodeRef,
    role,
    style: { ...dragSourceStyle(isDragging) },
    attributes: {},
    isDragging,
    rowListeners: undefined,
    rowAttributes: {},
    handleSetActivatorNodeRef: undefined,
    handleListeners: undefined,
    handleAttributes: {},
    invalidDrop,
  }), [droppable.setNodeRef, role, isDragging, invalidDrop])
  return <SortableRowCtx.Provider value={ctxValue}>{children(ctxValue)}</SortableRowCtx.Provider>
}

/** DraggableHeaderCell — wrap header cell 跟 dnd-kit useDraggable + useDroppable 接軌
 *  (2026-05-06 v14.2;v15.0 Path B 改分離 hooks,無 SortableContext)。
 *
 *  Why wrap-not-rewrite:`headerCellEl` 既有邏輯複雜(sort / resize / select column / right region 等),
 *  改 inline useDraggable/useDroppable 入侵性高。本 wrapper cloneElement 注入 ref / style / listeners → 既有 render
 *  保持 untouched,單一職責 = 加 drag affordance。
 *
 *  Behavior:
 *    - useDraggable + useDroppable 永遠 call(Rules of Hooks)— `disabled=true` 時不啟動 listeners
 *    - `data: { type: 'column', columnId }` 餵 dnd-kit handleDragStart / handleDragEnd 區分 row/column drag
 *    - 注入 ref(setNodeRef)+ transform style + transition + opacity(drag 時 source invisible,DragOverlay 顯 ghost)
 *    - draggable 時注入 attributes + listeners + cursor:grab / `data-column-id` (DragOverlay snapshot 用)
 *    - locked column / system column → disabled,無 grab cursor / 不啟動 drag
 *
 *  對齊 TanStack Column DnD canonical(<https://tanstack.com/table/latest/docs/framework/react/examples/column-dnd>)
 *  + Notion / Airtable header drag UX。 */
function DraggableHeaderCell({
  id,
  disabled,
  isLocked,
  dropIndicatorSide,
  children,
}: {
  id: string
  disabled: boolean
  isLocked: boolean
  /** Notion blue line drop indicator(2026-05-06 v14.4):'before' = 左邊緣藍線 / 'after' = 右邊緣藍線 / null = 無 */
  dropIndicatorSide: 'before' | 'after' | null
  children: React.ReactElement
}) {
  // **v15.0 Path B refactor**(對齊 TreeView SSOT):分離 useDraggable + useDroppable,不 auto-shift
  const draggable = useDraggable({ id, disabled, data: { type: 'column', columnId: id } })
  const droppable = useDroppable({ id, disabled, data: { type: 'column', columnId: id } })
  const setRefs = React.useCallback((el: HTMLElement | null) => {
    draggable.setNodeRef(el)
    droppable.setNodeRef(el)
  }, [draggable.setNodeRef, droppable.setNodeRef])
  const isDragging = draggable.isDragging
  const dragStyle: React.CSSProperties = {
    ...dragSourceStyle(isDragging),
  }
  // cloneElement 注入 — 不額外加 wrapper div(避免破壞 flex / column width 計算)
  const childProps = (children as React.ReactElement<{ style?: React.CSSProperties; className?: string; role?: string }>).props
  // useDraggable.attributes 含 `role="button"` + `tabIndex` 等 — 全部 spread 會蓋掉 header 原 `role="columnheader"`
  // (a11y 必保 columnheader 語意)。strip role + 保留 aria-* / tabIndex / aria-roledescription:
  const { role: _draggableRole, ...draggableAttrs } = draggable.attributes as unknown as Record<string, unknown>
  // Drop indicator(SSOT 對齊 TreeView):2px primary line via pseudo-element
  const indicatorClass = dropIndicatorSide === 'before'
    ? dropIndicatorColumn.pseudoBefore
    : dropIndicatorSide === 'after'
    ? dropIndicatorColumn.pseudoAfter
    : ''
  return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    ref: setRefs,
    style: { ...(childProps.style ?? {}), ...dragStyle },
    'data-column-id': id,
    'data-column-locked': isLocked || undefined,
    ...(disabled ? {} : { ...draggableAttrs, ...(draggable.listeners as unknown as Record<string, unknown>) }),
    // 2026-05-06 v14.9 cursor canonical(對齊 Notion / Jira):
    // **idle hover NOT 顯 cursor-grab** — header click 觸發 sort,grab cursor 會誤導 user 以為「點 = 拖」;
    // **drag activation 後**(isDragging=true,過 8px activationConstraint)才顯 cursor-grabbing。
    // user 點 = sort / 長壓 = drag,兩語意分開不互踩。
    className: cn(childProps.className, isDragging && dragActiveCursor, indicatorClass),
  })
}

/** Row drag handle — Portal-rendered, position:fixed 真正水平置中於 table outer border line(Jira canonical)。
 *
 *  v15.6 button-only drag(推翻 v15.2「整列接 listeners」,2026-07-14 JSDoc 對齊):Button =
 *  唯一 activator,接 handleSetActivatorNodeRef + handleListeners(SourceRowProvider ctx);
 *  row div 不接 listeners(rowListeners=undefined),row click 保留給 select / open detail 等 UX。
 *
 *  Why Portal + position:fixed(2026-05-05 v4):
 *    DataTable 結構含三層 overflow-hidden(outer wrapper / leftBody / row),用 absolute + translate-x:-50%
 *    凸出 row 左 border 會被三層任一裁切。position:fixed escape 所有 ancestor overflow constraint。
 *
 *  - 不佔 column 空間;hover-revealed 透過 row.dataset.hovered MutationObserver 觸發
 *  - Button variant="tertiary" iconOnly size="xs"(24px chip)
 *  - 任何 row drag 進行時(activeDragId != null)整體隱藏 — 對齊 user directive:
 *    drag 期間「INDICATOR + GHOST」就夠了,所有 row 不顯 hover bg / drag button */
// code-quality-allow: long-function — Portal escape + cross-region hover delegation + MutationObserver + scroll-tracking 4 mechanism 結合在 RowDragHandle 內;每 mechanism 獨立 hook 會破壞 row context coupling
function RowDragHandle({ disabled, anyDragActive }: { disabled: boolean; anyDragActive: boolean }) {
  const ctx = React.useContext(SortableRowCtx)
  const [rowEl, setRowEl] = React.useState<HTMLDivElement | null>(null)
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null)
  const [pos, setPos] = React.useState<{ top: number; left: number; rowHovered: boolean } | null>(null)
  // Portal 逃逸 row DOM → cursor 移到 button 上時 row mouseleave → button hide → cycle flicker(2026-05-05)。
  // Fix:button 自帶 hover state,visibility = rowHovered || buttonHovered || isDragging。
  const [buttonHovered, setButtonHovered] = React.useState(false)

  // Anchor span ref callback finds the parent row element(自身位置 = row 內部,parentElement = row div)。
  // 用 useState 觸發 effect re-run(child ref callback 會 fire 在 commit phase,early enough for layout effect)
  const anchorRef = React.useCallback((node: HTMLSpanElement | null) => {
    setRowEl((node?.parentElement as HTMLDivElement) ?? null)
  }, [])

  React.useLayoutEffect(() => {
    if (!rowEl || !ctx || ctx.role !== 'primary') return

    // Portal target = table outer 的 parent(保持 CSS variable / theme scope 繼承,
    // 不 portal 到 document.body — body 沒 theme tokens 會使 Button tertiary 變透明)
    const tableEl = rowEl.closest<HTMLElement>('[data-data-table-outer]')
    setPortalTarget(tableEl?.parentElement ?? null)

    const update = () => {
      if (!tableEl) return
      const rRect = rowEl.getBoundingClientRect()
      const tRect = tableEl.getBoundingClientRect()
      // v15.1:drag 期間 source button hide(visible 邏輯已 guard isDragging),
      // 此處只報「真實 hover」狀態,不疊 isDragging mask。
      const rowHovered = rowEl.hasAttribute('data-hovered')
      const top = rRect.top + rRect.height / 2
      const left = tRect.left // table outer 左 border line position(viewport coords)
      // 2026-07-05 D3 perf fix:prev 值比對 — 位置/hover 沒變時回傳 prev reference,
      // React Object.is bail out(原每 scroll frame 無條件新 object → 每個 visible handle
      // 每 frame 必 re-render Button + Tooltip + portal,即使位置根本沒動)。
      setPos((prev) =>
        prev && prev.top === top && prev.left === left && prev.rowHovered === rowHovered
          ? prev
          : { top, left, rowHovered },
      )
    }

    update()

    // Observe row data-hovered changes(cross-region hover delegation 設置 dataset.hovered)
    const observer = new MutationObserver(update)
    observer.observe(rowEl, { attributes: true, attributeFilter: ['data-hovered'] })

    // Update on scroll(capture phase 抓所有 scroll container)+ resize
    // 2026-05-16 Round 5 codex audit fix:capture rAF ID + cancel on cleanup(原 uncancelled
    // rAF 在 unmount 後可能 fire `update` → setPos on stale ref。Same race-pattern class as
    // useOverflowCount fix `combobox.tsx:130`)。
    let scrollRafId = 0
    const onScroll = () => {
      if (scrollRafId) cancelAnimationFrame(scrollRafId)
      scrollRafId = requestAnimationFrame(() => {
        scrollRafId = 0
        update()
      })
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)

    return () => {
      observer.disconnect()
      if (scrollRafId) cancelAnimationFrame(scrollRafId)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [rowEl, ctx])

  // 永遠 render anchor span(讓 anchorRef 可拿到 row element)。
  // A3 fix(2026-05-05):顯式 `top:0 left:0 pointer-events:none` — 雖 width/height=0 不該佔
  // flex space,但部分瀏覽器對 abs span 在 flex container 行為微妙 → 顯式座標固定原點,
  // 確保第一個 cell 文字位置不被推開。
  // ctx 為 null 或 mirror role 時 anchor 仍渲染但不渲 handle Portal
  const anchor = (
    <span
      ref={anchorRef}
      aria-hidden
      style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, pointerEvents: 'none' }}
    />
  )

  if (!ctx || ctx.role !== 'primary' || !pos) return anchor

  const canDrag = !disabled
  const showInvalid = !!ctx.invalidDrop && !!ctx.isDragging
  // Visibility canonical v15.3(對齊 Linear / Jira 世界級 + user directive
  // 「source 的 drag button 反倒是可以留在原本的位置維持被壓住的狀態」):
  //   - idle:rowHovered || buttonHovered → 顯示
  //   - drag 進行中:**source row 強制顯示 + active 視覺**(讓 user 知道哪個被壓住)
  //                  其他 row 的 button 隱藏(由 anyDragActive guard)
  const visible = ctx.isDragging || (!anyDragActive && (pos.rowHovered || buttonHovered))

  // 2026-05-12 fix(user 抓 image 1):
  //   (a) tooltip 偶爾不出 — root cause:`disabled={!canDrag}` HTML attribute 阻 pointer events
  //       → Radix Tooltip pointerenter 不 fire → tooltip 不 trigger。Fix:改 `aria-disabled`
  //       only(Button cva 已 handle disabled visual via aria-disabled),pointer events 仍 fire,
  //       Tooltip stable trigger。
  //   (b) drag button bg 透明蓋不住 row content — 加 `bg-surface-raised` overlay。
  //   (c) source row drag button 在 drag 中應 dimmed visual — `isDragging` 加 `opacity-disabled`。
  const handle = (
    <Button
      ref={canDrag ? ctx.handleSetActivatorNodeRef : undefined}
      variant="tertiary"
      iconOnly
      size="xs"
      startIcon={GripVertical}
      aria-label={canDrag ? '拖曳重排此列' : '排序中無法拖曳'}
      aria-disabled={!canDrag || undefined}
      tabIndex={canDrag ? 0 : -1}
      // 2026-05-12 fix(a):移除 disabled HTML attr(改 aria-disabled);pointer events 必 fire 才能
      // 接 Tooltip pointerenter。Button cva 已 handle aria-disabled visual styling。
      onMouseEnter={() => setButtonHovered(true)}
      onMouseLeave={() => setButtonHovered(false)}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        transform: 'translate(-50%, -50%)',
        zIndex: 50,
        // 2026-05-12 fix v2(user 抓「drag column sort 啟用時 button 不是 disable 視覺」):
        // 前 Round 4.5 加 `aria-disabled:opacity-[var(--opacity-disabled)]` 在 Button cva
        // 沒生效 — 因為 inline style `opacity` 永遠 win over Tailwind class。Fix:把 disabled
        // state opacity 也 compute 進 inline style。priority order:invisible 0 → drag var(--opacity-disabled)
        // 0.45(2026-07-04 修:原硬寫 0.5 違 lib/drag-visual.ts SSOT)→ canDrag=false(sort active)
        // disabled visual var(--opacity-disabled) 0.45 → idle 1。
        opacity: visible
          ? (ctx.isDragging ? 'var(--opacity-disabled)' as unknown as number : (canDrag ? 1 : 'var(--opacity-disabled)' as unknown as number))
          : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 150ms ease',
      }}
      className={cn(
        // 2026-05-12 debug fix(user 抓「hover 還是透明」)— Round 4.5 我未授權加
        // `border / shadow / hover:bg-neutral-hover` = over-design + hover override 讓
        // drag button hover bg 變 neutral-hover 跟 row hover bg 同色 → 視覺融入 row = 透明。
        // 撤回:**只保 bg-surface-raised(idle + hover + 所有 state 都同 bg)**,
        // border / shadow / hover override 全 retire(user verbatim「我有叫你加 elevation 嗎」)。
        // 對所有 state(idle / hover / aria-disabled / data-state)套同 bg-surface-raised — 跟
        // row 任何 state 視覺都有 token-level 對比(在 token 差異存在的 mode;light mode --surface-raised
        // 等於 --surface 是 design token semantic,非本 fix scope)。
        'bg-surface-raised hover:bg-surface-raised aria-disabled:bg-surface-raised',
        canDrag && !showInvalid && 'cursor-grab',
        canDrag && showInvalid && 'cursor-not-allowed !text-error !border-error',
        // drag 進行中 source button cursor(opacity 0.5 via style;aria-disabled visual 由 Button cva 接管)
        ctx.isDragging && 'cursor-grabbing',
      )}
      {...(canDrag ? ctx.handleListeners ?? {} : {})}
      {...(canDrag ? ctx.handleAttributes ?? {} : {})}
    />
  )

  const wrapped = disabled ? (
    <Tooltip>
      <TooltipTrigger asChild>{handle}</TooltipTrigger>
      <TooltipContent>排序中無法拖曳,清除排序後可重排</TooltipContent>
    </Tooltip>
  ) : handle

  return (
    <>
      {anchor}
      {portalTarget && createPortal(wrapped, portalTarget)}
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// AG Grid 模式：header 在 scroll 外面，V scroll 在 center-body（AR44 後現況）。
//
//  table
//  ├── header（固定頂部，不在 scroll 內）
//  │   ├── left-header
//  │   ├── center-header（overflow:hidden，JS sync scrollLeft）
//  │   └── right-header
//  └── body-viewport（display:flex，無 overflow — AR44 後不再是 scroll container）
//      ├── left-body（overflow:hidden，JS sync scrollTop）
//      ├── center-body（overflow-x:auto, overflow-y:auto — 唯一 V scroll，
//      │               onCenterBodyScroll 同步兩側 scrollTop + header scrollLeft）
//      └── right-body（overflow:hidden，JS sync scrollTop）
//
// 不用 CSS sticky。Header 永遠在頂部。細節見下方「JS scroll sync(AR44)」註解。
// ══════════════════════════════════════════════════════════════════════════════

// ── MemoCellSlot(2026-07-05 D3 perf fix)────────────────────────────────────
// cell-registry 2026-05-13 已把每個 cell type 包成 module-level cached `React.memo(CellWithSurface)`,
// 但 renderCellContent 每次 render 傳 3 個全新 inline closure(onCommit / onCommitLive /
// onRequestEdit)+ `meta ?? {}` 新 object → memo shallow-compare 100% fail,防線靜默失效
// (DataTableInner 任何 re-render — scroll / resize / drag / spreadsheet 選取 / portal keystroke —
// 都讓全部 visible cells 的 Field view subtree 整棵重渲)。
// Fix:中介 memo slot — 從 parent 接 stable callback(commitCell / cancelCellEdit / onCellCommit /
// enterCellEdit)+ primitive rowId / colId,在 slot 內 useCallback 綁 per-cell closure;
// props 全 primitive / stable reference → memo 真命中,unchanged cells render 成本歸零。
// Cite world-class:AG Grid「cell renderer stable reference」/ MUI X DataGrid memoized subcomponents。
const EMPTY_META: Record<string, unknown> = {}

interface MemoCellSlotProps {
  Cell: React.ComponentType<CellComponentProps>
  rowId: string
  colId: string
  // any-allow: free-form column value(consumer-defined,同 CellComponentProps.value)
  value: any
  // any-allow: free-form consumer meta bag(同 CellComponentProps.meta)
  meta: Record<string, any>
  mode: 'view' | 'edit'
  size: 'sm' | 'md' | 'lg'
  autoRowHeight: boolean
  isEditable: boolean
  onCommitCell: (rowId: string, colId: string, next: unknown) => void
  onCancelCell: (rowId: string, colId: string) => void
  onCellCommitLive?: (rowId: string, colId: string, next: unknown) => void
  onEnterEdit: (rowId: string, colId: string) => void
}

const MemoCellSlot = React.memo(function MemoCellSlot({
  Cell, rowId, colId, value, meta, mode, size, autoRowHeight,
  isEditable, onCommitCell, onCancelCell, onCellCommitLive, onEnterEdit,
}: MemoCellSlotProps) {
  const onCommit = React.useCallback((next: unknown) => onCommitCell(rowId, colId, next), [onCommitCell, rowId, colId])
  const onCommitLive = React.useCallback((next: unknown) => onCellCommitLive?.(rowId, colId, next), [onCellCommitLive, rowId, colId])
  const onCancel = React.useCallback(() => onCancelCell(rowId, colId), [onCancelCell, rowId, colId])
  const onRequestEdit = React.useCallback(() => onEnterEdit(rowId, colId), [onEnterEdit, rowId, colId])
  return (
    <Cell
      value={value}
      meta={meta}
      mode={mode}
      size={size}
      autoRowHeight={autoRowHeight}
      isEditable={isEditable}
      onCommit={onCommit}
      onCommitLive={onCommitLive}
      onCancel={onCancel}
      onRequestEdit={onRequestEdit}
    />
  )
})

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
function DataTableInner<TData>(
  {
    columns, data, size = 'md', autoRowHeight = false, height: heightProp,
    overscan = 5, emptyState, enableHover = true, bordered,
    estimateRowHeight, tableOptions, rowActions, cellErrors,
    pinnedLeftColumns, pinnedRightColumns, inlineEdit = false,
    selection: selectionProp, defaultSelection, onSelectionChange,
    selectable = false, isRowSelectable, getRowId, getRowAriaLabel,
    preserveSelectionOnFilter = false,
    columnVisibility: columnVisibilityProp, defaultColumnVisibility, onColumnVisibilityChange,
    enableMultiSort = true,
    onColumnFilterTrigger,
    onCellCommit,
    enableRowDrag = false,
    onRowReorder,
    enableColumnResize = false,
    onColumnResize,
    enableColumnReorder = false,
    onColumnReorder,
    experimentalSpreadsheetOverlay = false,
    experimentalActiveEditorController = false,
    spreadsheetMode = false,
    pagination,
    className, ...props
  }: DataTableProps<TData>,
  ref: React.ForwardedRef<HTMLDivElement>
) {
  // L5 分頁 × height 預設(2026-07-06):未顯式傳 height 時 —— 分頁 = 'auto' 自然高度
  // (頁碼是唯一導覽通道,不疊 body 內捲動;Ant Table 無預設高度罩慣例),
  // 未分頁 = 既有 '400px' 預設不變。顯式傳 height 一律尊重(prop docblock 有完整規則)。
  const height = heightProp ?? (pagination ? 'auto' : '400px')
  // ── L4 Inline edit state ──
  // editingCellId: `${rowId}__${columnId}` 標識當前進 edit mode 的 cell;null = 無
  const [editingCellId, setEditingCellId] = React.useState<string | null>(null)
  // Phase 7 D.3 portal Field virtualizer unmount preserve draft(2026-05-10 per codex Q-B4 verdict):
  // Lifted draft state in DataTable — Cell DOM unmount(virtualizer scroll out)時 draft 不丟,
  // mount-back 時 portal Field value=draft 而非 row.value,user 編輯中字保留。
  // draft 生命週期(2026-07-05 D4 fix):cancelCellEdit / commitCell 清 draft;Tab 換格
  // (handleEditTab)先 commit 當前 draft 再換格 — 原註解宣稱「editingCellId 變時 useEffect
  // reset draft」的 effect 從未存在,曾致 Tab 換格後下一格顯示上一格草稿。
  const [editingDraft, setEditingDraft] = React.useState<unknown>(undefined)

  // ── Slice D Step 4 spreadsheet semantics state(2026-05-10) ──
  // selectedCellId:`${rowId}:${colId}` Excel-like 選取(click 1)
  // rangeAnchor / rangeFocus:Shift+click range 起點 / 終點(rectangle from anchor↔focus)
  const [selectedCellId, setSelectedCellId] = React.useState<string | null>(null)
  const [rangeAnchor, setRangeAnchor] = React.useState<string | null>(null)
  const [rangeFocus, setRangeFocus] = React.useState<string | null>(null)
  // tableRef declared below (line 967) — click-outside effect 在 tableRef ready 後 wire,
  // 為避免 ordering 問題用 forwarded ref query via DOM `[data-data-table-outer]`。
  // 2026-05-12 click-outside canonical(user 抓「選完 range 後點任何地方該清掉 / 選 cell 後點別處該取消」):
  // 對齊 Excel / Google Sheets / Notion / Airtable cell-selection canonical — pointerdown 落在
  // table outer 外 → clear selection + range。內 cell click 由 onClick 自處理(不衝突)。
  React.useEffect(() => {
    if (!spreadsheetMode) return
    if (selectedCellId == null && rangeAnchor == null) return
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      // 點 table outer 外 → clear all selection
      if (!target.closest('[data-data-table-outer]')) {
        setSelectedCellId(null)
        setRangeAnchor(null)
        setRangeFocus(null)
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [spreadsheetMode, selectedCellId, rangeAnchor])
  // 2026-07-05 D4 fix:edit 退出(commit / cancel)後還原 spreadsheet selection 到該 cell +
  // 收回焦點到 table root — 原本只清 editingCellId,editor unmount 後 document.activeElement
  // 掉到 body、selection 不還原 → 每次編輯後鍵盤導覽死巷(方向鍵全滅、必須滑鼠重點),違反
  // datatable-spreadsheet-rfc.md Contract 11「退出後還給 active cell」(對齊 Excel / AG Grid / Sheets)。
  const restoreCellSelection = React.useCallback((rowId: string, colId: string) => {
    if (!spreadsheetMode) return
    const cellId = `${rowId}:${colId}`
    setSelectedCellId(cellId)
    setRangeAnchor(cellId)
    setRangeFocus(null)
    // 等 editor unmount 完成後才收回焦點;activeElement 非 body(user 點了其他 focusable /
    // Tab 換格後下一格 editor autoFocus)時不搶焦點。
    requestAnimationFrame(() => {
      const el = tableRef.current
      if (!el) return
      const active = document.activeElement
      if (active === document.body || active === null) el.focus({ preventScroll: true })
    })
  }, [spreadsheetMode])
  const commitCell = React.useCallback(
    (rowId: string, colId: string, next: unknown) => {
      onCellCommit?.(rowId, colId, next)
      setEditingCellId(null)
      setEditingDraft(undefined)  // Phase 7:commit 後清 draft
      restoreCellSelection(rowId, colId)  // 2026-07-05 D4:commit 後 selection 還原(Contract 11)
    },
    [onCellCommit, restoreCellSelection],
  )
  // cancel 路徑(Esc / popover dismiss)— 同 commit 還原 selection;取代舊無參數 exitEdit
  const cancelCellEdit = React.useCallback((rowId: string, colId: string) => {
    setEditingCellId(null)
    setEditingDraft(undefined)
    restoreCellSelection(rowId, colId)
  }, [restoreCellSelection])
  // edit 進入點(MemoCellSlot onEnterEdit 消費;stable identity 維持 memo 命中)
  const enterCellEdit = React.useCallback((rowId: string, colId: string) => {
    setEditingCellId(cellEditId(rowId, colId))
  }, [])
  // 判 column meta.editable 對特定 row 是否成立(支援 fn)
  // column meta 是 free-form consumer bag(同 renderTypedValue any policy),不適合窄型化
  const isCellEditable = React.useCallback(
    // any-allow: free-form consumer meta — same rationale as L143 renderTypedValue
    (meta: Record<string, any> | undefined, row: unknown): boolean => {
      const e = meta?.editable
      if (typeof e === 'function') return e(row) === true
      return e === true
    },
    [],
  )
  // 2026-07-16 round16:cell「disabled」態廢除(世界級 grid 無 disabled cell;meta.disabled 全庫 0 消費)。
  // 鎖定 cell = `editable:(row)=>false`(= isCellEditable 模型),非灰化 disabled 態。原 isCellDisabled
  // helper + bg-disabled TD 灰化 + isDisabled prop 全移除;canEditCell 收斂為 isCellEditable。
  const canEditCell = React.useCallback(
    (meta: Record<string, unknown> | undefined, row: unknown): boolean =>
      isCellEditable(meta, row),
    [isCellEditable],
  )
  const [sorting, setSorting] = React.useState<SortingState>(tableOptions?.state?.sorting as SortingState ?? [])

  // ── L3 Column visibility state(controllable)──
  const [columnVisibility, setColumnVisibility] = useControllable<Record<string, boolean>>({
    value: columnVisibilityProp,
    defaultValue: defaultColumnVisibility ?? {},
    onChange: onColumnVisibilityChange,
  })

  // ── L2 Selection state ──
  const enabled = selectable !== false
  const mode = selectable === 'single' ? 'single' : 'multi'
  const [selection, setSelection] = useControllable<DataTableSelection>({
    value: normalizeSelection(selectionProp),
    defaultValue: normalizeSelection(defaultSelection) ?? { mode: 'include', ids: [] },
    onChange: onSelectionChange,
  })
  // Shift-click anchor:存最後一次「單擊」的 row id,shift-click 時做區間選
  const anchorRowIdRef = React.useRef<string | null>(null)

  // 注入 checkbox column(L2 selection;L4 row drag handle 不佔 column,absolute 浮在 row 左 border)
  // 順序:[__select__?, ...consumer columns]
  // **Column resizable canonical**(2026-05-05 user E rule):per-column `enableResizing` flag
  //   決定 width 行為(getCanResize=true → fixed / false → flex 1 1 0%)。**無 auto-default**
  //   "last column !resizable" — consumer 顯式設(對齊 user 拒絕「autoFillLastColumn」決策)。
  //
  // **2026-05-06 v14.3 DS canonical width API**:consumer 寫 `meta.width` / `meta.minWidth` /
  //   `meta.maxWidth`(DS-internal naming,避開跟 `size: 'sm'|'md'|'lg'` density 命名衝突)。
  //   此 pre-process 把 meta 值 copy 到 root size/minSize/maxSize,確保 TanStack column
  //   resize state 正常運作。**Back-compat**:consumer 寫 root `size` 仍 work(meta.width 沒設則
  //   不覆蓋 root)。新 code 一律用 meta.width。
  const dsProcessedColumns = React.useMemo<ColumnDef<TData>[]>(() => {
    return columns.map((c) => {
      const meta = c.meta as { width?: number; minWidth?: number; maxWidth?: number } | undefined
      if (!meta) return c
      const cAny = c as { size?: number; minSize?: number; maxSize?: number }
      const updates: { size?: number; minSize?: number; maxSize?: number } = {}
      if (meta.width !== undefined && cAny.size === undefined) updates.size = meta.width
      if (meta.minWidth !== undefined && cAny.minSize === undefined) updates.minSize = meta.minWidth
      if (meta.maxWidth !== undefined && cAny.maxSize === undefined) updates.maxSize = meta.maxWidth
      return Object.keys(updates).length > 0 ? ({ ...c, ...updates } as ColumnDef<TData>) : c
    })
  }, [columns])

  const columnsWithSelection = React.useMemo(() => {
    if (!enabled) return dsProcessedColumns
    const selectCol: ColumnDef<TData, any> = {
      id: SELECT_COL_ID,
      size: 40,
      enableSorting: false,
      enableResizing: false,
      enableHiding: false,  // selection col 不能藏(L3 column visibility)
      header: 'Select',  // header cell 由下方自訂 render 取代
      cell: () => null,  // body cell 由下方自訂 render 取代
    }
    return [selectCol, ...dsProcessedColumns]
  }, [dsProcessedColumns, enabled])

  // pinned-left 自動加 __select__(__select__ 永遠最左)
  const effectivePinnedLeft = React.useMemo(() => {
    const list = pinnedLeftColumns ?? []
    const out = [...list]
    if (enabled && !out.includes(SELECT_COL_ID)) out.unshift(SELECT_COL_ID)
    return out
  }, [pinnedLeftColumns, enabled])

  // columnOrder 自動加 __select__ 在最前:consumer 傳的 columnOrder 通常只列 data
  // columns,TanStack 會把不在 order 的 column 推到末位 → 同步幫他補上
  const userColumnOrder = tableOptions?.state?.columnOrder
  const effectiveColumnOrder = React.useMemo(() => {
    if (!userColumnOrder) return userColumnOrder
    if (!enabled) return userColumnOrder
    const out = [...userColumnOrder]
    if (enabled && !out.includes(SELECT_COL_ID)) out.unshift(SELECT_COL_ID)
    return out
  }, [userColumnOrder, enabled])

  // 注意:`...tableOptions` 必 spread 在 `state` 前,否則 user 傳的 tableOptions 會
  // 整個 override 掉我們組的 state(含 __select__ 自動 pinning + columnOrder 注入)。
  // 之前 bug:checkbox column 跑到右邊 = 此處 spread 順序錯。
  // ── L5 分頁 state(2026-07-06)──────────────────────────────────────────────
  // 共用模式(user 拍板):<Pagination> 獨立元件為頁碼視覺 SSOT,DataTable 內建接 TanStack
  // 分頁模型消費它(Ant Table 消費 Pagination / Atlassian DynamicTable rowsPerPage / MUI
  // DataGrid 同派;shadcn data-table 教學同款「分頁 render 在元件 JSX 內」)。
  const paginationEnabled = !!pagination
  const paginationOpts = typeof pagination === 'object' ? pagination : undefined
  const [pageSizeState, setPageSizeState] = React.useState(paginationOpts?.pageSize ?? 20)
  // 1-based 對外(對齊 Pagination / Ant);餵 TanStack state 時換算 0-based
  const [currentPage, setCurrentPage] = useControllable<number>({
    value: paginationOpts?.page,
    defaultValue: paginationOpts?.defaultPage ?? 1,
    onChange: paginationOpts?.onPageChange,
  })

  const table = useReactTable({
    ...tableOptions,
    data, columns: columnsWithSelection,
    state: {
      sorting, columnVisibility,
      ...tableOptions?.state,
      // columnPinning + columnOrder 在 user state 後 override,確保 __select__ 永遠左
      columnPinning: { left: effectivePinnedLeft, right: pinnedRightColumns ?? [] },
      ...(effectiveColumnOrder ? { columnOrder: effectiveColumnOrder } : {}),
      // L5 分頁:必在 ...tableOptions?.state 之後 spread(同 columnPinning override 理由——
      // 防 user state 蓋掉內建接線);頁碼變更由 <Pagination onPageChange> 驅動,不走 TanStack 內部 setter
      ...(paginationEnabled ? { pagination: { pageIndex: currentPage - 1, pageSize: pageSizeState } } : {}),
    },
    enableMultiSort,
    // **#1 fix(2026-05-04)**:chain user `tableOptions.onSortingChange`(spread 在前被 override = 之前 bug)
    // 同 onColumnVisibilityChange:both internal setState + forward 給 user external state
    onSortingChange: (updater) => {
      setSorting(updater)
      tableOptions?.onSortingChange?.(updater)
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnVisibility) : updater
      setColumnVisibility(next)
      tableOptions?.onColumnVisibilityChange?.(updater)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // L4 nested rows:啟用 expanded row model(consumer 透過 tableOptions.getSubRows + state.expanded forward)
    getExpandedRowModel: getExpandedRowModel(),
    // L5 分頁:條件掛載(TanStack 官方:pagination 與 virtualization 為互斥替代策略)
    ...(paginationEnabled ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    getRowId: getRowId,
    // 2026-05-06 v14 column resize:`onChange` mode → drag 中 column 即時跟動 cursor(world-class
    // canonical:TanStack docs / AG Grid / Excel / Google Sheets 全部 live resize)。前 v13.2
    // 用 `onEnd` 拖完才 jump,user 報「感覺超頓像 bug」。tanstack 內部管 columnSizing state
    // (uncontrolled);`columnSizingState` 變動透過 useEffect 觀測 + 呼 callback。
    //
    // 前 v11 用 `onColumnSizingChange` 接管 updater 但忘了 setColumnSizing,導致 state 永遠不變動 →
    // column.getSize() 永遠回初始值 → drag visual 完全沒效果(user 報 "drag 沒反應")。本 v13.2 改回
    // tanstack uncontrolled state(預設行為)+ useEffect 觀測 columnSizing 變動 fire callback。
    enableColumnResizing: enableColumnResize,
    columnResizeMode: 'onChange',
  })

  // v13.2:onColumnResize callback 透過 useEffect 觀測 columnSizing state 變動 fire(uncontrolled state pattern)
  // 2026-07-06 D3 fix:兌現 prop docblock「commit-on-pointerup,非 live」契約 —
  // columnResizeMode:'onChange' 讓 drag 中 columnSizing 每 mousemove 變一次(視覺即時跟動,
  // 保留),原 effect 無 gate → callback 每 mousemove fire 一次;docblock 明文建議 consumer
  // 在此 callback 做 width persistence(localStorage / URL / API)= 每 mousemove I/O。
  // 改以 TanStack columnSizingInfo.isResizingColumn 為訊號:drag 進行中不 fire、也不推進
  // snapshot(保留 drag 前基準);pointerup(isResizingColumn 轉 false)才 diff snapshot,
  // fire 一次最終寬度。非 drag 路徑(「自動調整寬度」menu 的 setColumnSizing)不經
  // isResizingColumn,行為不變。
  const columnSizingState = table.getState().columnSizing
  const isResizingColumn = table.getState().columnSizingInfo.isResizingColumn
  const prevColumnSizingRef = React.useRef(columnSizingState)
  React.useEffect(() => {
    if (!onColumnResize) return
    if (isResizingColumn) return
    const prev = prevColumnSizingRef.current
    Object.keys(columnSizingState).forEach(id => {
      if (columnSizingState[id] !== prev[id]) {
        onColumnResize(id, columnSizingState[id])
      }
    })
    prevColumnSizingRef.current = columnSizingState
  }, [columnSizingState, isResizingColumn, onColumnResize])

  const { rows } = table.getRowModel()
  const isEmpty = rows.length === 0

  // L5 分頁:filter / data 縮小時 TanStack 不自動 clamp 當前頁(會停在空頁);對齊 MUI X 自動 clamp
  const pageCount = paginationEnabled ? table.getPageCount() : 0
  React.useEffect(() => {
    if (!paginationEnabled) return
    if (pageCount > 0 && currentPage > pageCount) setCurrentPage(pageCount)
  }, [paginationEnabled, pageCount, currentPage, setCurrentPage])
  const hasHeightConstraint = height !== 'auto'
  // Fill-parent mode:height='100%' / '100vh' / 'fill' 等百分比 / 視口語義 → outer flex column + body flex-1 撐滿。
  // 固定 px/rem 仍維持 maxHeight cap 行為(資料少 = 內容高度,資料多 = 上限後 scroll)— 對齊既有 stories 預期。
  const isFillHeight = hasHeightConstraint && /^(100%|100vh|fill)$/.test(height)
  // **Virtualization threshold(2026-05-07 v15.9 Bug G fix)**:小資料集 skip 虛擬化。
  // Root cause:虛擬化器(TanStack Virtual)`getVirtualItems()` 在 scrollElement
  // 還沒 mount(first render,centerBodyRef = null)時會返回空陣列 →「0 row → N row」
  // 跨 frame transition,user 看到「table 從矮長高 + 資料慢慢露出」。≤ 30 rows
  // direct render 完全 bypass 此 race,且小資料下虛擬化沒效益(浪費 reflow)。
  // 對齊 AG Grid `suppressVirtualization` / TanStack Table virtualization-when-needed idiom。
  const VIRTUAL_THRESHOLD = 30
  // L5 分頁互斥:分頁後每頁 rows ≤ pageSize,虛擬化無效益(TanStack 官方:兩者為互斥替代策略)
  const useVirtual = !paginationEnabled && hasHeightConstraint && !isEmpty && rows.length > VIRTUAL_THRESHOLD
  const hasRowActions = !!rowActions

  // Refs
  const tableRef = React.useRef<HTMLDivElement | null>(null)
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const centerHeaderRef = React.useRef<HTMLDivElement>(null)
  const centerBodyRef = React.useRef<HTMLDivElement>(null)
  const leftHeaderRef = React.useRef<HTMLDivElement>(null)
  const rightHeaderRef = React.useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = React.useState(0)
  const [rightWidth, setRightWidth] = React.useState(0)

  // estimate 預設 size-aware 對齊 token(--table-row-{sm,md,lg} = 32/40/48 md density)
  // Q7 fix(2026-05-04):前用 hardcode 36 跟真高 40 差 4px,N rows 累積誤差呈現「table 慢慢長高」假象。
  // ResizeObserver+measureElement 的修正過程被 user 看見 = mount-time growth bug 的真因。
  const ESTIMATE_BY_SIZE: Record<string, number> = { sm: 32, md: 40, lg: 48 }
  const resolvedEstimate = estimateRowHeight ?? ESTIMATE_BY_SIZE[size] ?? 40
  // 2026-05-06 v10 DragOverlay canonical:retire windowed sticky range extractor (v4-v9 workaround)。
  // 改用 `<DragOverlay>` portal 把 source row 視覺解耦 — source 即使 unmount(virtual scroll out)
  // overlay 仍 render 由 cloned outerHTML 提供視覺。dnd-kit transform / collision 走 active item id
  // (DndContext store 以 active id 追蹤,跟 hook instance mount 狀態無關;v15 無 SortableContext)。
  // 對齊 dnd-kit GitHub #1674 + drag-overlay docs canonical「virtualized list MUST use DragOverlay」。
  // overscan 仍輕微拉高(避免 source row 旁邊 rows 也 unmount 致使 hover signal 計算抖動)。
  const effectiveOverscan = enableRowDrag ? Math.max(overscan, 5) : overscan
  const activeDragIdRef = React.useRef<string | null>(null)

  const virtualizer = useVirtualizer({
    count: useVirtual ? rows.length : 0,
    // V scroll 現在在 centerBodyRef(不是外層 bodyRef)
    getScrollElement: () => centerBodyRef.current,
    estimateSize: () => resolvedEstimate,
    overscan: effectiveOverscan, enabled: useVirtual,
    // 2026-05-14 P3 perf tune(per codex+Layer A 共識,user 拍板「全部做完」+
    // CPU-throttle-reproducible verify infra):150ms → 250ms 減少 scroll
    // start/end flip 次數 → TableScrollContext 重 cascade visible rich cell
    // tree 機會降低。對齊 TanStack Virtual `isScrollingResetDelay` API。
    isScrollingResetDelay: 250,
  })

  // ── isFillHeight body maxHeight JS 計算(2026-04-30)──
  // CSS `%` height 在 flex column min-h-0 + auto basis 場景下,Chromium 不可靠 shrink
  // (實測:outer maxHeight 100% bind parent,但 body 不 shrink 反映 outer 約束 → outer
  // overflow-hidden 切掉 content,V scroll 不 trigger)。
  // 改用 ResizeObserver 算 body avail = outer rect - header rect → set centerBody
  // maxHeight = pixel value(不是 %)。content 大 → V scroll;content 小 → centerBody
  // = content,outer = intrinsic,沒留白。
  // **Q7 mount-time growth fix(2026-05-04 v3 真因)**:不是 visibility race,是 estimateRowHeight
  // 預設 36 ≠ 真實 row height(token md=40 / sm=32 / lg=48),virtualizer initial total = 6×36 = 216,
  // 後續 measureElement 修正到 6×40 = 240,差 24px 視覺看起來像「table 慢慢長高」。fix = estimate
  // 預設 size-aware 對齊 token(見下方 estimateRowHeight default 計算)。
  const [bodyMaxHeight, setBodyMaxHeight] = React.useState<number | null>(null)
  // L5 分頁 × isFillHeight(2026-07-07 C12):bar 高度量測用 — compute() 需扣分頁列 footprint
  const paginationBarRef = React.useRef<HTMLDivElement | null>(null)
  React.useLayoutEffect(() => {
    if (!isFillHeight) { setBodyMaxHeight(null); return }
    // **R4 真根因 fix(2026-05-09 v2 — codex Q3.6 root cause + Q3.9 reproduce verified)**:
    //
    // Bug:isFillHeight 時 outer 用 `style={{ maxHeight: height }}`(L1819-1824)沒 explicit height
    // → outer.getBoundingClientRect().height 受 children 反向影響(因 outer = children intrinsic,
    // children 又被 bodyMaxHeight 限制)→ **circular dependency**。
    //
    // 表現:viewport / layout 變化時 parent 變(392→672)但 outer 永遠卡(282)→ body 永遠 240,
    // 不跟 parent 變大時填滿。Initial mount 過程則看起來像 stepping(parent 從 0 慢慢長,outer 跟著
    // 一階一階長)。
    //
    // 真 fix:**改量 parent slot,不量 outer**。Parent 是 definite height 限制因子,不被 child 反向影響。
    //   - rAF coalesce:RO callback 多次觸發 → 1 frame 內只 compute 1 次(降頻,防 RO 連續 fire redundant)
    //   - diff guard:< 1px 不 setState(防 micro-step)
    //   - **observe parent 而非 self**(打破 circular)
    //
    // Codex root cause cite:circular feedback `tableRef.height ↔ bodyMaxHeight ↔ body layout ↔ tableRef.height`
    // Reproduce verified:viewport 1280→1920→900,parentH 392/672/292 變化,但 a524e03 fix 下 bodyRectH 永遠 240。
    let rafId: number | null = null
    let stableTimer: ReturnType<typeof setTimeout> | null = null
    let lastValue: number | null = null
    let pendingValue: number | null = null
    // 2026-05-21 v4 真根因 fix(per user「請你仔細查查,務必仔細查」+「確保這個問題不再出現」):
    // 即使 v3(observe parent + rAF + diff guard < 4px),Tabs / Storybook iframe / nested
    // AppShell flex chain 仍可能 100ms+ settle period 內每 frame growth > 4px → setState
    // 多次 fire → user 視覺「stepping growth」。
    //
    // **v4 加 stability window**:layout 連續 100ms 無變動才 setState。意味:
    // - 初始 mount:bodyMaxHeight=null → body 不受 maxHeight 限制 → 顯全內容(intrinsic 高度)
    // - RO 多 frame fire(layout settling):每 fire reset timer,setState 不 fire
    // - Layout 穩定 100ms:setState fire 最終值,body 套 constraint(若 parent > content 無視覺變化)
    // - 真實 resize(viewport 縮 / aside toggle):δ 必 ≫ 4px + 跨多 frame,timer 自然 settle
    // 對齊 TanStack Virtual `observeElementRect` + Material X-DataGrid 「resize debounce 100ms」慣例。
    const compute = () => {
      if (!tableRef.current) return
      // ⭐ 量 parent slot(definite height,不受 child 反向影響),fallback 用 outer
      const parentEl = tableRef.current.parentElement
      const slotH = parentEl?.getBoundingClientRect().height
                ?? tableRef.current.getBoundingClientRect().height
      const headerEl = tableRef.current.firstElementChild as HTMLElement | null
      const headerH = headerEl?.getBoundingClientRect().height ?? 0
      // L5 分頁 × isFillHeight(2026-07-07 C12):啟用分頁時 parent slot = composedContent
      // wrapper(含分頁列 + tight gap),body 可用高必扣分頁列 footprint,否則 body 撐滿
      // 把分頁列擠出 / 被 overflow 裁掉
      const barEl = paginationBarRef.current
      const barFootprint = barEl
        ? barEl.getBoundingClientRect().height +
          (parseFloat(getComputedStyle(barEl.parentElement as Element).rowGap) || 0)
        : 0
      const next = Math.max(0, slotH - headerH - barFootprint)
      // Diff guard < 4px(濾 micro-step,real resize δ 必 ≫ 4px)
      if (lastValue != null && Math.abs(next - lastValue) < 4) return
      lastValue = next
      pendingValue = next
      // Stability window 100ms:layout 連續 100ms 無變才 setState
      if (stableTimer != null) clearTimeout(stableTimer)
      stableTimer = setTimeout(() => {
        if (pendingValue != null) setBodyMaxHeight(pendingValue)
        stableTimer = null
      }, 100)
    }
    const scheduleCompute = () => {
      if (rafId != null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        compute()
      })
    }
    compute() // initial schedule(會 enter stability window 等 100ms settle)
    // ⭐ 只 observe parent,不 observe tableRef(打破 circular)
    const obs = new ResizeObserver(scheduleCompute)
    if (tableRef.current?.parentElement) obs.observe(tableRef.current.parentElement)
    return () => {
      obs.disconnect()
      if (rafId != null) cancelAnimationFrame(rafId)
      if (stableTimer != null) clearTimeout(stableTimer)
    }
  }, [isFillHeight])

  // JS scroll sync(AR44 user-reported UX fix):
  // 原本 V scroll 在 body-viewport(外層),center-body H scroll 於其內部底部 = 所有 row 都 render 下方。
  // Virtualized 1800px 內容 → H scrollbar 在 1800px 下方,user 必須 V-scroll 到底才看見 → UX bug。
  // **現在 V scroll 移到各 region 自己(left / center / right 分別)**,三者 scrollTop JS 同步;
  // H scroll 仍在 center-body,但因 center-body 現在有自己的 maxHeight,H scrollbar 落在 visible 視窗底部 → user 一眼看到。
  const leftBodyRef = React.useRef<HTMLDivElement>(null)
  const rightBodyRef = React.useRef<HTMLDivElement>(null)
  const onCenterBodyScroll = React.useCallback(() => {
    const cb = centerBodyRef.current
    if (!cb) return
    if (centerHeaderRef.current) centerHeaderRef.current.scrollLeft = cb.scrollLeft
    if (leftBodyRef.current) leftBodyRef.current.scrollTop = cb.scrollTop
    if (rightBodyRef.current) rightBodyRef.current.scrollTop = cb.scrollTop
  }, [])

  // ── Phase 9 Issue 1 fix(2026-05-10):range cells lifted compute + Set ────
  // 計算 spreadsheet range cell IDs(Shift+click rectangle from anchor↔focus),
  // 提供 `rangeCellIdSet` Set → cell wrapper data-range-cell attr for cell-bg fill
  // (per codex Q1 verdict:bg fill 走 cell bg layer 不在 overlay,內容才不被蓋;
  //  layer 的 outer ring / rangeCellIds prop 已 retire — 2026-07-14 對齊清理)
  const rangeCellIds = React.useMemo<string[] | undefined>(() => {
    if (!spreadsheetMode || !rangeAnchor || !rangeFocus || rangeAnchor === rangeFocus) return undefined
    const parseCell = (id: string) => {
      const lastColon = id.lastIndexOf(':')
      return { rowId: id.slice(0, lastColon), colId: id.slice(lastColon + 1) }
    }
    const a = parseCell(rangeAnchor)
    const f = parseCell(rangeFocus)
    const allRows = table.getRowModel().rows.map((r) => r.id)
    const allCols = table.getVisibleLeafColumns().map((c) => c.id).filter((id) => id !== SELECT_COL_ID)
    const aRowIdx = allRows.indexOf(a.rowId)
    const fRowIdx = allRows.indexOf(f.rowId)
    const aColIdx = allCols.indexOf(a.colId)
    const fColIdx = allCols.indexOf(f.colId)
    if (aRowIdx < 0 || fRowIdx < 0 || aColIdx < 0 || fColIdx < 0) return undefined
    const rowStart = Math.min(aRowIdx, fRowIdx)
    const rowEnd = Math.max(aRowIdx, fRowIdx)
    const colStart = Math.min(aColIdx, fColIdx)
    const colEnd = Math.max(aColIdx, fColIdx)
    const ids: string[] = []
    for (let r = rowStart; r <= rowEnd; r++) {
      for (let c = colStart; c <= colEnd; c++) {
        ids.push(`${allRows[r]}:${allCols[c]}`)
      }
    }
    return ids
    // any-allow: react-table runtime lookup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreadsheetMode, rangeAnchor, rangeFocus, table])
  const rangeCellIdSet = React.useMemo(() => new Set(rangeCellIds || []), [rangeCellIds])

  // 三區域欄位
  const leftCols = table.getLeftVisibleLeafColumns()
  const centerCols = table.getCenterVisibleLeafColumns()
  const rightCols = table.getRightVisibleLeafColumns()
  const hasLeft = leftCols.length > 0
  const hasRight = rightCols.length > 0 || hasRowActions
  // 2026-05-06 v13.1:Center region SSOT width — header inner wrapper + body inner wrapper 共用
  // 同一個 minWidth 算法,確保 header / body cell 寬度永遠對齊(前 v8 用 `w-max min-w-full`
  // 在 header(content max-content 小)vs body(content max-content 大)會 diverge 76+ px,
  // user 報「header / row 對不起來」)。
  const centerColsWidth = centerCols.reduce((a, c) => a + c.getSize(), 0)

  // Header 寬度 → body region 同步（virtual mode 需要明確寬度）
  React.useEffect(() => {
    const measure = () => {
      if (leftHeaderRef.current) setLeftWidth(leftHeaderRef.current.offsetWidth)
      if (rightHeaderRef.current) setRightWidth(rightHeaderRef.current.offsetWidth)
    }
    measure()
    const obs = new ResizeObserver(measure)
    if (leftHeaderRef.current) obs.observe(leftHeaderRef.current)
    if (rightHeaderRef.current) obs.observe(rightHeaderRef.current)
    return () => obs.disconnect()
  }, [hasLeft, hasRight, rows.length])

  // 2026-07-09 root-cause fix(user 以 GitHub Pages 對比抓出 regression):
  //   舊 `h-table-row-${size}` 模板字串 Tailwind **靜態掃描看不到** → `.h-table-row-{sm,md,lg}` 規則
  //   唯一靠 uiSize.spec.md 裡的 literal 被 content-detection 掃到才生成;戰役期間掃描樹變動後未生成
  //   → 規則消失 → row 塌成「內容高度」(非編輯 33px / 編輯 44px)而非固定 token 40px,連帶選取控件與
  //   列文字對不齊。改用 literal map(對齊 field-wrapper cva 的 `h-field-md` literal 慣例),Tailwind
  //   永遠掃得到、不再依賴脆弱的 spec.md literal → 永不再漂移。
  const rowHeight = { sm: 'h-table-row-sm', md: 'h-table-row-md', lg: 'h-table-row-lg' }[size] ?? 'h-table-row-md'

  // ── Cross-region row hover (2026-04-22 D3 perf audit):event delegation 改 per-row closure
  // 舊:每 row 建 `{ onMouseEnter, onMouseLeave }` + 2 arrow functions → 100 row = 200 closures/render
  // 新:表格層 single onMouseOver / onMouseOut,透過 event.target.closest 找 data-row-index
  const enterLeaveHandlers = React.useMemo(() => {
    if (!enableHover) return { onMouseOver: undefined, onMouseOut: undefined }
    const findRowIndex = (target: EventTarget | null): string | null => {
      if (!(target instanceof HTMLElement)) return null
      const rowEl = target.closest<HTMLElement>('[data-row-index]')
      return rowEl?.dataset.rowIndex ?? null
    }
    return {
      onMouseOver: (e: React.MouseEvent) => {
        // v15.3:drag 進行中只允許 source row 自己被標 hover(維持 active 視覺
        // 對齊 Linear / Jira「source 維持 pressed 狀態」canonical)。其他 row 抑制。
        if (activeDragIdRef.current != null) {
          const target = e.target instanceof HTMLElement ? e.target : null
          const rowEl = target?.closest<HTMLElement>('[data-sortable-row-id]')
          const isSource = rowEl?.dataset.sortableRowId === activeDragIdRef.current
          if (!isSource) return
        }
        const idx = findRowIndex(e.target)
        if (idx == null) return
        tableRef.current?.querySelectorAll(`[data-row-index="${idx}"]`).forEach((el) => ((el as HTMLElement).dataset.hovered = ''))
      },
      onMouseOut: (e: React.MouseEvent) => {
        const idx = findRowIndex(e.target)
        if (idx == null) return
        // 仍在同一 row 的子元素間 bubble(e.g. cell → text node)則 relatedTarget 還在 row 內
        const related = e.relatedTarget instanceof HTMLElement ? e.relatedTarget.closest<HTMLElement>('[data-row-index]') : null
        if (related?.dataset.rowIndex === idx) return
        tableRef.current?.querySelectorAll(`[data-row-index="${idx}"]`).forEach((el) => delete (el as HTMLElement).dataset.hovered)
      },
    }
  }, [enableHover])
  // 維持 API:hoverProps(idx) 仍存在但 no-op,實際邏輯搬到 table 層 delegation
  const hoverProps = (_idx: number): Record<string, never> => ({})

  // ── Cell render(Phase C 2026-05-05 — type-keyed registry SSOT)──
  // 命中 columnType → 走 cellRegistry(view / edit mode 同元件 with `mode` prop);
  // 無 columnType → consumer 自訂 cell.columnDef.cell。
  const renderCellContent = (cell: ReturnType<typeof rows[number]['getVisibleCells']>[number]) => {
    const meta = cell.column.columnDef.meta
    const colType = meta?.type as ColumnType | undefined
    const wrap = autoRowHeight && meta?.wrap === true
    // 已知 compound 欄位(Tag / PersonDisplay / LinkInput 等自帶 layout)直接 bypass TruncateCell,
    // 因為 `truncate` 的 inline baseline context 會破壞自訂 layout 的垂直對齊。
    // 2026-05-09 D-path:date / time 加入(showDisplayEndIcon → Field naked-view 需 full width 才能
    //   右對齊 ItemSuffix。TruncateCell 的 `<span truncate min-w-0>` block-display 會 collapse Field
    //   to content size,讓 Calendar / Clock icon 緊貼 value text 而非右邊緣)。
    const isKnownCompound = colType === 'select' || colType === 'multiSelect' || colType === 'person' || colType === 'multiPerson' || colType === 'url' || colType === 'date' || colType === 'time'
    const rowId = cell.row.id
    const colId = cell.column.id
    const editable = isCellEditable(meta, cell.row.original)
    const isEditingThisCell = editingCellId === cellEditId(rowId, colId)

    let content: React.ReactNode
    if (colType) {
      const Cell = resolveCellComponent(colType)
      // 2026-05-10 Slice D Step 5(D.3 portal Field):當 portal flag 啟 + cell 編輯中 →
      // cell 保持 view mode(SSOT preserved per codex Q6.2),portal layer 渲 edit Field 在上。
      // 預設 inline-edit:isEditingThisCell ? edit : view。
      const cellMode: 'edit' | 'view' =
        (experimentalActiveEditorController && isEditingThisCell)
          ? 'view'
          : isEditingThisCell ? 'edit' : 'view'
      // 2026-07-05 D3 perf fix:改經 MemoCellSlot — 原 inline closure props 讓 CellWithSurface
      // memo 100% miss(詳 MemoCellSlot 檔頭註解)。
      content = (
        <MemoCellSlot
          Cell={Cell}
          rowId={rowId}
          colId={colId}
          value={cell.getValue()}
          meta={meta ?? EMPTY_META}
          mode={cellMode}
          size={size}
          autoRowHeight={autoRowHeight}
          isEditable={editable}
          onCommitCell={commitCell}
          onCancelCell={cancelCellEdit}
          onCellCommitLive={onCellCommit}
          onEnterEdit={enterCellEdit}
        />
      )
    } else {
      content = flexRender(cell.column.columnDef.cell, cell.getContext())
    }
    // Consumer 自訂 cell(無 colType)若回傳 React element,視為 compound — consumer 自己處理
    // 對齊與截斷。回傳 primitive(string / number)才走 TruncateCell。
    // 理由:TruncateCell 的 `span.truncate` 強制 white-space:nowrap + inline baseline,
    // 對 inline-flex / icon+text 自訂結構會拉歪(見 circular-progress sync table 案例)。
    // **edit mode bypass**(2026-05-05 v9 Bug 2 修):editing cell 內部是 Field 控件
    // (Input/Textarea/Select etc.)自管 layout + 替代元素(textarea)不該被包進 inline span
    // baseline context — 否則 line-box descender 加 5-7px 致 cell 進 edit 後 row 撐高 layout shift。
    const isConsumerCompound = !colType && React.isValidElement(content)
    return isEditingThisCell ? content
      : wrap ? <span className="break-words min-w-0">{content}</span>
      : (isKnownCompound || isConsumerCompound) ? content
      : <TruncateCell>{content}</TruncateCell>
  }

  // 2026-05-18 改 import ICON_SIZE SSOT(per user『做完』approval,消除 M17 違反 7+ 重複 ternary)
  const iconSize = ICON_SIZE[size as 'sm' | 'md' | 'lg']

  // 2026-05-09 D-path retired:`getEditIndicator(colType)` parallel system 移除。
  // Indicator authority 從 DataTable cellEl 移交 **Field naked-view branch via `showDisplayEndIcon` opt-in**
  //   — Select / TimePicker / DatePicker / Combobox / PeoplePicker 5 picker 的 view mode 內建
  //   `<ItemSuffix>` 渲對應 trigger icon(同 edit DOM 結構)。LinkInput URL anchor 例外(無 suffix)。
  // SSOT chain:cell-registry.tsx(opt-in props)→ Field component(intrinsic icon + ItemSuffix DOM)→
  //   item-anatomy ItemPrefix/ItemSuffix layout SSOT。詳 `.claude/planning/cell-indicator-ssot-rfc.md`。
  // 不再有 DataTable-level cell indicator code path — 跨元件 SSOT 對齊 Field family。

  // L4 row drag:sort active 時 drag handle disabled(對齊 Notion / Airtable 共識)
  const dragDisabled = sorting.length > 0

  // ── L4 Row drag v2:nested rows + parent map ─────────────────────────────────
  // v2 cross-parent fix:全 row 各自掛 useDraggable/useDroppable(含 sub-rows;v15 無 SortableContext),
  // custom collisionDetection 過濾掉 cross-parent over candidates,保留「同 parent siblings」。沒命中 → invalid drop signal。
  // parentMap: rowId → parentId(top-level row 的 parent = '' 哨兵 string)
  const { allRowIds, parentMap } = React.useMemo(() => {
    const ids: string[] = []
    const pmap = new Map<string, string>()
    const walk = (r: typeof rows[number], parentId: string) => {
      ids.push(r.id)
      pmap.set(r.id, parentId)
      const subs = (r as unknown as { subRows?: typeof rows }).subRows
      if (subs && Array.isArray(subs)) subs.forEach(s => walk(s, r.id))
    }
    rows.forEach(r => { if ((r.depth ?? 0) === 0) walk(r, '') })
    return { allRowIds: ids, parentMap: pmap }
  }, [rows])

  // active drag state(state for invalid signal re-render;ref for fast lookup in collisionDetection)
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null)
  // sync ref + force virtualizer recompute so rangeExtractor 看得到新 active id(M25 chain invariant)
  React.useEffect(() => {
    activeDragIdRef.current = activeDragId
    if (enableRowDrag && useVirtual) virtualizer.measure()
  }, [activeDragId, enableRowDrag, useVirtual, virtualizer])
  const [invalidDropActive, setInvalidDropActive] = React.useState(false)
  // code-quality-allow: long-function — audit 誤偵測 invalidRef 為 function;真實 long-function = 下方 cellEl(L1334+,已標 markers per L1336)。type-shadow,不需 refactor
  const invalidRef = React.useRef(false)
  invalidRef.current = invalidDropActive

  // code-quality-allow: long-function — cell render 含 selection / pinned / type-aware formatter 三邏輯,拆會增 prop drilling
  const cellEl = (cell: ReturnType<typeof rows[number]['getVisibleCells']>[number], _isLastInRow = false) => {
    // L2 selection:__select__ 欄自訂 render
    // multi 模式 → Checkbox(可多選)
    // single 模式 → Radio(單選 visual,對齊 Material DataGrid / Polaris IndexTable canonical)
    if (enabled && cell.column.id === SELECT_COL_ID) {
      const rowId = cell.row.id
      const rowOriginal = cell.row.original
      const isDisabled = isRowSelectable ? !isRowSelectable(rowOriginal) : false
      const ariaLabel = getRowAriaLabel?.(rowOriginal) ?? '選取此列'
      const checkboxSize = size === 'lg' ? 'lg' : 'md'
      // Cell 整格可點:click cell padding 也觸發 toggle/select(對齊 Linear / Apple Mail / Material DataGrid)
      // 內部 checkbox/radio 用 stopPropagation 避免 double-fire
      const onCellClick = isDisabled ? undefined : (e: React.MouseEvent) => {
        e.stopPropagation()
        if (mode === 'single') setSelection({ mode: 'include', ids: [rowId] })
        else toggleRow(rowId, rowOriginal, { shiftKey: e.shiftKey })
      }
      return (
        <div
          key={cell.id}
          role="cell"
          // data-column-id 給 CSS scope:`[data-column-id="__select__"]` 在 data-table.css 加
          // border-right divider,視覺把 system selection col 跟 data col 切開(Notion / Airtable
          // / Linear idiom)。**只有 inlineEdit + selectable 模式且 select 不在 leftBody 邊界時** style
          // 才生效(避免雙線)— CSS 用 `:not(:last-child)` selector 處理。
          data-column-id={SELECT_COL_ID}
          className={cn('flex items-center justify-center shrink-0', !isDisabled && 'cursor-pointer')}
          style={{ ...columnSizeStyle(cell.column, { resize: enableColumnResize, isSystemCol: isSystemColumn(cell.column.id) }), ...cellPadding }}
          onClick={onCellClick}
        >
          {mode === 'single' ? (
            <RadioGroupItem
              size={checkboxSize}
              value={rowId}
              disabled={isDisabled}
              aria-label={ariaLabel}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <Checkbox
              size={checkboxSize}
              checked={isSelectedId(rowId)}
              disabled={isDisabled}
              aria-label={ariaLabel}
              onClick={(e) => {
                e.stopPropagation()
                if (isDisabled) return
                e.preventDefault()  // 攔截 Radix 內部 toggle,自己 toggle 帶 shiftKey
                toggleRow(rowId, rowOriginal, { shiftKey: e.shiftKey })
              }}
              onKeyDown={(e) => {
                // Space:Radix 已處理 toggle,但要帶 shiftKey 區間選 → 攔截
                if (e.key === ' ' && !isDisabled) {
                  e.preventDefault()
                  toggleRow(rowId, rowOriginal, { shiftKey: e.shiftKey })
                }
              }}
            />
          )}
        </div>
      )
    }
    const meta = cell.column.columnDef.meta
    const colType = meta?.type as ColumnType | undefined
    const align = meta?.align ?? (colType ? columnTypeDefaults[colType].align : undefined)
    // L4 inline edit 整合
    const cellRowId = cell.row.id
    const cellColId = cell.column.id
    const cellEditable = isCellEditable(meta, cell.row.original)
    const isEditingThisCell = editingCellId === cellEditId(cellRowId, cellColId)
    // Indicator canonical(2026-05-09 D-path retire):**Field naked-view branch own** via
    //   `showDisplayEndIcon` opt-in(per-picker `<ItemSuffix>` 渲 ChevronDown/Calendar/Clock)。
    //   DataTable cellEl 不再 render parallel indicator — SSOT 對齊 Field family。
    //   詳 `.claude/planning/cell-indicator-ssot-rfc.md` Step 9。
    // Cell click → 進 edit mode(boolean 不需 — 自己 toggle;url 不需 — 走內部 Pencil button,Phase C 由 UrlCell 內處理)
    const cellSpreadsheetId = `${cellRowId}:${cellColId}`
    const isSelectedCell = spreadsheetMode && selectedCellId === cellSpreadsheetId
    const onEditableCellClick = cellEditable && colType !== 'boolean' && colType !== 'url' && !isEditingThisCell
      ? (e: React.MouseEvent) => {
        if (spreadsheetMode) {
          // Slice D Step 4 spreadsheet semantics(2026-05-10 user 拍板,2026-05-12 v2 fix):
          //   Shift+click → extend range(set focus,**anchor 保持 selectedCellId**)
          //   Click on already-selected → enter edit
          //   Plain click → select(no edit)+ reset range to single cell
          // 2026-05-12 fix(user 抓「世界級設計藍邊框留在第一個選的 cell」):前 v1 setSelectedCellId
          // 到 focus(終點)→ 藍框跑去終點。Fix:selectedCellId 維持 anchor(起點)— 對齊
          // Excel / Google Sheets / Notion / Airtable shift-extend canonical(anchor 永遠 own
          // active-cell border,range 用 fill 視覺)。
          if (e.shiftKey && rangeAnchor != null) {
            setRangeFocus(cellSpreadsheetId)
            // selectedCellId stays at anchor (起點 keep active border canonical)
            return
          }
          if (isSelectedCell) {
            // 2nd click on already-selected → enter edit(Excel-like)
            setEditingCellId(cellEditId(cellRowId, cellColId))
            setSelectedCellId(null)
            setRangeAnchor(null)
            setRangeFocus(null)
            return
          }
          // 1st click → select only,no edit
          setSelectedCellId(cellSpreadsheetId)
          setRangeAnchor(cellSpreadsheetId)
          setRangeFocus(null)
          return
        }
        // Default(non-spreadsheet)inline-edit behavior:click → enter edit
        setEditingCellId(cellEditId(cellRowId, cellColId))
      }
      : undefined

    // L4 nested rows:該 cell 是否是 row 第 1 個非 select content cell(注入 chevron + indent)
    // 對齊 TreeView design language(token `--tree-indent-{sm,md,lg}` 為 SSOT,跨元件視覺一致)
    const allCells = cell.row.getVisibleCells()
    const firstContentCell = allCells.find(c => c.column.id !== SELECT_COL_ID)
    const isFirstContent = firstContentCell?.id === cell.id
    const depth = cell.row.depth ?? 0
    const canExpand = cell.row.getCanExpand?.() ?? false
    const isExpanded = cell.row.getIsExpanded?.() ?? false
    const toggleExpand = cell.row.getToggleExpandedHandler?.()
    // 2026-07-08 sibling-aware 佔位(WM root-cause 戰役):spec:382「同層 sibling 有 expandable
    // 時 leaf 也佔位」原本沒實作 — depth-0 leaf(無 children 的頂層列)拿不到 w-4+mr-2 佔位,
    // 與同層有 chevron 的列左緣錯位(PDF「chevron 空間」問題)。同層 = 同 parent 的 subRows;
    // 頂層 = core rows。只在 isFirstContent 時計算,成本一列一次。
    const siblingRows = cell.row.getParentRow?.()?.subRows ?? table.getCoreRowModel().rows
    const siblingHasExpand = isFirstContent && siblingRows.some((r) => r.getCanExpand?.() ?? false)
    const showNestedPrefix = isFirstContent && (depth > 0 || canExpand || siblingHasExpand)
    // Issue 9 cell error(2026-05-10):lookup `${rowId}:${colId}` in cellErrors map
    // editing cell 自動 clear visual error(per spec 「edit-clears-own-cell」)— consumer 走
    // onCellCommit 驗證後決定回填新 error(由 consumer 端控制 cellErrors map state)。
    const rawCellError = cellErrors?.[`${cellRowId}:${cellColId}`]
    const cellErrorMessages: string[] | null = (() => {
      if (isEditingThisCell) return null  // edit-clears-own-cell visual
      if (rawCellError == null) return null
      return Array.isArray(rawCellError) ? rawCellError : [rawCellError]
    })()
    const hasCellError = cellErrorMessages != null && cellErrorMessages.length > 0
    const cellErrorId = hasCellError ? `cell-err-${cellRowId}-${cellColId}` : undefined
    // H1 fix(2026-05-10):per-row autoRowHeight when this row has any cell error。
    // cell-level recompute(O(1) per cell map lookup)— cell-row coupling 透過 row.getVisibleCells()。
    // Field naked items-X 等 group-data-[row-mode=...] CSS propagation 跟著走。
    const rowHasAnyError = !!cellErrors && cell.row.getVisibleCells().some((c) => {
      const v = cellErrors[`${cell.row.id}:${c.column.id}`]
      return v != null && (Array.isArray(v) ? v.length > 0 : true)
    })
    const effectiveAutoRowForCell = autoRowHeight || rowHasAnyError
    return (
      <div
        key={cell.id}
        role="cell"
        // group/cell + data-row-mode:讓 Field naked 用 `group-data-[row-mode=...]/cell:items-X`
        // 從 cell 取 alignment(autoRowHeight=auto 頂對齊 / fixed=fixed 置中)。CSS propagation,
        // Field API 不變;每個 mode 內 view↔edit 同 alignment(同 Field, 同 group → 同 items)。
        // H1(2026-05-10):per-row error → effectiveAutoRowForCell 同 row.tsx effectiveAutoRow
        data-row-mode={effectiveAutoRowForCell ? 'auto' : 'fixed'}
        data-column-id={cell.column.id}
        // Slice D Step 1B(2026-05-10):composite cell-id `${rowId}:${colId}` 給 Interaction Layer
        // getCellRect 用,per RFC §Overlay Geometry。
        data-cell-id={`${cell.row.id}:${cell.column.id}`}
        // Phase 9 Issue 1 fix(2026-05-10):range cell bg fill via CSS [data-range-cell],
        // 不在 overlay layer(避免 layer fixed-position bg 蓋 cell content)。
        data-range-cell={spreadsheetMode && rangeCellIdSet.has(`${cell.row.id}:${cell.column.id}`) ? '' : undefined}
        // Issue 9 cell error(2026-05-10):aria-describedby 接 error message id 給 AT 讀
        aria-describedby={cellErrorId}
        aria-invalid={hasCellError || undefined}
        className={cn(
          // Cell box(2026-05-05 v6 — A4 canonical: Field frame seamlessly replaces cell border):
          //   - `self-stretch`: cell 永遠填 row 高
          //   - **vertical alignment by row-mode**: autoRow=items-start(top per spec) /
          //     fixed=items-center(centered per spec)。indicator + 非 Field 內容跟 cell 走。
          //   - **editing cell**: padding=0 + 無 right divider → Field naked(`!h-full !px-[cell-px]
          //     !py-[cell-py]`)邊框與 table divider 無縫接軌,seamlessly replace cell border。
          //     Adjacent cell padding+divider 仍在,只 editing cell 自己改觀。對齊 user reminder
          //     「框框跟 cell 一樣大並取代 cell 的框且與 table 隔線無縫接軌」(2026-05-05)。
          //   - **沒有** cell 自己 box-shadow ring — focus / hover / open ring 由 Field naked 自帶
          //     state machine 提供(對齊 user「狀態樣式取決於原輸入框」reminder)
          // 字級隨 size:sm/md text-body / lg text-body-lg(fieldDisplayTextClass),對齊 Field family
          // size→font SSOT。此為非-Field content(consumer 自訂 cell / TruncateCell 純文字)的 fallback 字級;
          // typed cell 各自的 Field 控件已自帶 size→font(cell-registry 傳 size)。
          'group/cell flex text-foreground font-normal shrink-0 relative self-stretch',
          fieldDisplayTextClass(size),
          // Issue 9(2026-05-10):有 cell error → unset overflow-hidden 讓 error message
          // wrap 撐 row 高。**H1(2026-05-10)升級**:overflow-visible 條件改 `rowHasAnyError` —
          // row 內任一 cell 有 error 整 row 全 cells 都 overflow-visible(error 訊息可能多行
          // 撐高 row,row 高同步 effectiveAutoRow auto)。
          rowHasAnyError ? 'overflow-visible' : 'overflow-hidden',
          effectiveAutoRowForCell ? 'items-start' : 'items-center',
          align === 'right' && 'justify-end text-right',
          align === 'center' && 'justify-center text-center',
          // Phase 9 Issue 8 fix(2026-05-10 user 撞 + codex 重比稿 verdict ADOPT):
          // 之前 `border-r border-divider` 只 right edge → hover overlay outline:-1px 只 right
          // 邊壓 cell border,上左下 sub-pixel 不一致(user 抓「右 1px / 上左下 2px」bug)。
          // 改 `dtCellGrid`(data-table.css「dtCellGrid v2/v3」段)box-shadow inset **只保右邊**
          // `inset -1px 0 0 var(--divider)`(bottom 由 row border-b 接管、:last-child 設 none 防 2px;
          // 2026-07-04 對齊 css 現況 — 原「4 邊 inset」敘述已被 v2/v3 取代),不佔 layout
          // (per user verbatim「在 cell 內容起始位置不變」前提)→ 視覺 4 邊 grid line 由
          // row border + 相鄰 cell 合成 → overlay outline:-1px 壓 cell border line。
          // Field naked edit border 仍 own(per Field SSOT)— 編輯時 Field 自帶 border 1px,
          // 跟 cell 4 邊 inset divider 視覺相疊(同 pixel)= 1 line visual,不雙線。
          inlineEdit && 'dtCellGrid',
          onEditableCellClick && ['cursor-pointer', nakedCellEditableDisplayHover],  // editable cell view hover affordance(對齊 Notion / Airtable hover-cell-shows-border canonical)
          // a11y(2026-07-14 dim-10 修):非 spreadsheet inlineEdit cell 可 Tab 聚焦(見下方
          // tabIndex/onKeyDown)— focus-visible ring 對齊本檔 expand button / sortable header canonical。
          onEditableCellClick && !spreadsheetMode && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          // z-10 raise inline-edit cell;portal mode 不需(layer z-3 already on top)。
          isEditingThisCell && !experimentalActiveEditorController && 'z-10',
        )}
        style={{
          ...columnSizeStyle(cell.column, { resize: enableColumnResize, isSystemCol: isSystemColumn(cell.column.id) }),
          // Padding override 只在 inline-edit cell(naked Field 撐滿 cell);portal mode cell 走正常 view padding
          ...(isEditingThisCell && !experimentalActiveEditorController ? {} : cellPadding),
          // Slice D Step 2(2026-05-10):flag 開時 set CSS variable 抑制 Field naked hover outline,
          // 讓 overlay layer 接管 hover ring paint(per RFC Contract 8 「one geometry owner, two paint owners」)。
          // Backward-compat:flag 關時 unset → field-wrapper default `var(--border-hover)`(既有行為)。
          ...(experimentalSpreadsheetOverlay && { '--cell-hover-outline-color': 'transparent' } as React.CSSProperties),
        }}
        onClick={onEditableCellClick}
        // a11y(2026-07-14 dim-10 修):非 spreadsheet 的 inlineEdit cell 原本只有 onClick —
        // 鍵盤 user 無法聚焦 cell、無法進入編輯(WCAG 2.1.1)。對齊 Atlassian InlineEdit
        // read-view-focusable idiom:editable view cell 可 Tab 聚焦,Enter / F2 進 edit。
        // spreadsheetMode 不加(該模式走 table-level selectedCellId 鍵盤導覽 SSOT,per-cell
        // tab stop 會跟 roving 模型衝突);cell 內 embedded 控件事件不攔(target guard)。
        tabIndex={onEditableCellClick && !spreadsheetMode ? 0 : undefined}
        onKeyDown={onEditableCellClick && !spreadsheetMode ? (e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === 'F2') {
            e.preventDefault()
            setEditingCellId(cellEditId(cellRowId, cellColId))
          }
        } : undefined}
      >
        {/* Issue 9 cell error(2026-05-10):有 error → cell 內外結構切 flex-col,
            上 row 渲既有 nested + content,下 row 渲 error message 14px text-error。
            無 error 時走原 flex-row(backward-compat 0 layout shift)。 */}
        {hasCellError ? (
          <span className="flex flex-col self-stretch w-full min-w-0 gap-1">
            <span className="flex flex-1 min-w-0">
              {showNestedPrefix && (
                <span
                  className="flex items-center shrink-0"
                  style={{ paddingLeft: depth > 0 ? `calc(${depth} * var(--tree-indent-${size}, var(--tree-indent-md)))` : 0 }}
                >
                  {canExpand ? (
                    <button
                      type="button"
                      aria-label={isExpanded ? '收合' : '展開'}
                      aria-expanded={isExpanded}
                      className="inline-flex items-center justify-center shrink-0 w-4 h-4 mr-2 text-fg-muted hover:text-foreground rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-transform"
                      style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
                      onClick={(e) => { e.stopPropagation(); toggleExpand?.() }}
                    >
                      <ChevronDown size={iconSize} aria-hidden style={{ transform: 'rotate(-90deg)' }} />
                    </button>
                  ) : (
                    <span aria-hidden className="shrink-0 w-4 h-4 mr-2" />
                  )}
                </span>
              )}
              <span className={cn(
                'flex-1 min-w-0 flex',
                // 2026-05-12 Round 4.5 fix(codex M31 Layer C 抓漏)— error-cell branch 也用 per-row state
                // (`effectiveAutoRowForCell`)非 global `autoRowHeight`,跟 line 1559 non-error wrapper 同 SSOT。
                // 前 Round 4 漏修此 branch → error 那格 row 內視覺仍走 global mode mismatch。
                effectiveAutoRowForCell ? 'items-start' : 'items-center',
                align === 'right' && 'justify-end',
              )}>
                {renderCellContent(cell)}
              </span>
            </span>
            <span id={cellErrorId} className="text-body text-error break-words" role="alert">
              {cellErrorMessages!.length === 1 ? (
                cellErrorMessages![0]
              ) : (
                <ul className="list-disc list-inside flex flex-col gap-1">
                  {cellErrorMessages!.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              )}
            </span>
          </span>
        ) : (
          <>
            {/* L4 nested rows prefix(同上,無 error 時走 flex-row 原 path) */}
            {showNestedPrefix && (
              <span
                className="flex items-center shrink-0"
                style={{ paddingLeft: depth > 0 ? `calc(${depth} * var(--tree-indent-${size}, var(--tree-indent-md)))` : 0 }}
              >
                {canExpand ? (
                  <button
                    type="button"
                    aria-label={isExpanded ? '收合' : '展開'}
                    aria-expanded={isExpanded}
                    className="inline-flex items-center justify-center shrink-0 w-4 h-4 mr-2 text-fg-muted hover:text-foreground rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-transform"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
                    onClick={(e) => { e.stopPropagation(); toggleExpand?.() }}
                  >
                    <ChevronDown size={iconSize} aria-hidden style={{ transform: 'rotate(-90deg)' }} />
                  </button>
                ) : (
                  <span aria-hidden className="shrink-0 w-4 h-4 mr-2" />
                )}
              </span>
            )}
            <span className={cn(
              'flex-1 min-w-0 self-stretch flex',
              // 2026-05-12 fix root invariant(M32 b):用 `effectiveAutoRowForCell` 而非 global
              // `autoRowHeight` — per-row error 時 row 是 auto-height,該 row 內所有 cell 都該
              // top-align(非僅 error cell)。前 v1 用 global autoRowHeight → 非 error cells in
              // error row 走 items-center → 視覺垂直置中於 tall row(user 抓 image 3 bug)。
              effectiveAutoRowForCell ? 'items-start' : 'items-center',
              align === 'right' && 'justify-end',
            )}>
              {renderCellContent(cell)}
            </span>
          </>
        )}
      </div>
    )
  }

  // ── L2 Selection helpers ──
  const visibleRowIdsKey = React.useMemo(() => rows.map(r => r.id).join(','), [rows])
  const visibleRowIdsSet = React.useMemo(() => new Set(rows.map(r => r.id)), [visibleRowIdsKey])

  // 對齊 spec L2 七、Filter 套用 → filtered-out selected rows 預設清掉
  React.useEffect(() => {
    if (!enabled || preserveSelectionOnFilter) return
    setSelection(prev => {
      // all 模式 = 「全部符合當前 filter」→ 不清(excluded 留著,被 filter 掉的 excluded 列無害)
      if (prev.mode === 'all') return prev
      const filtered = prev.ids.filter(id => visibleRowIdsSet.has(id))
      return filtered.length === prev.ids.length ? prev : { mode: 'include', ids: filtered }
    })
  }, [visibleRowIdsKey, enabled, preserveSelectionOnFilter, visibleRowIdsSet, setSelection])

  // Visible 可選 row IDs(扣除 disabled)
  const selectableVisibleIds = React.useMemo(() => {
    if (!enabled) return [] as string[]
    return rows
      .filter(r => !isRowSelectable || isRowSelectable(r.original))
      .map(r => r.id)
  }, [rows, enabled, isRowSelectable])

  // Union-aware「某列是否選取」+ 計數(include = ids 內;all = 不在 excluded 內)
  const includeSet = React.useMemo(
    () => (selection.mode === 'include' ? new Set(selection.ids) : new Set<string>()),
    [selection],
  )
  const excludeSet = React.useMemo(
    () => (selection.mode === 'all' ? new Set(selection.excluded) : new Set<string>()),
    [selection],
  )
  const isSelectedId = React.useCallback(
    (id: string) => (selection.mode === 'include' ? includeSet.has(id) : !excludeSet.has(id)),
    [selection.mode, includeSet, excludeSet],
  )
  const hasAnySelection = selection.mode === 'all' || includeSet.size > 0
  // Header tri-state checkbox value
  const visibleSelectedCount = selectableVisibleIds.filter(id => isSelectedId(id)).length
  const headerCheckedState: boolean | 'indeterminate' =
    selectableVisibleIds.length === 0 ? false
      : visibleSelectedCount === 0 ? false
      : visibleSelectedCount === selectableVisibleIds.length ? true
      : 'indeterminate'

  // visibleIdToRow Map(shift-click 區間選 lookup,避免 O(n) `rows.find()`)
  const visibleIdToRow = React.useMemo(
    () => new Map(rows.map(r => [r.id, r])),
    [rows]
  )

  const toggleHeaderCheckbox = React.useCallback(() => {
    // header tri-state visible-scoped:全可見已選 → 取消可見;否則 → 選全可見。
    // include / all 兩模型由 applySelectIds 處理(all 模式 toggle 改寫 excluded)。
    const willSelect = headerCheckedState !== true
    setSelection(prev => applySelectIds(prev, selectableVisibleIds, willSelect))
  }, [headerCheckedState, selectableVisibleIds, setSelection])

  const toggleRow = React.useCallback((rowId: string, rowOriginal: TData, opts?: { shiftKey?: boolean }) => {
    if (isRowSelectable && !isRowSelectable(rowOriginal)) return
    if (mode === 'single') {
      setSelection(isSelectedId(rowId) ? { mode: 'include', ids: [] } : { mode: 'include', ids: [rowId] })
      anchorRowIdRef.current = rowId
      return
    }
    // multi 模式
    const anchor = anchorRowIdRef.current
    if (opts?.shiftKey && anchor && anchor !== rowId) {
      // 區間選:從 anchor 到 rowId(在 visible 順序內),全 toggle 成 willCheck 狀態
      const visibleIds = rows.map(r => r.id)
      const a = visibleIds.indexOf(anchor)
      const b = visibleIds.indexOf(rowId)
      if (a !== -1 && b !== -1) {
        const [from, to] = a < b ? [a, b] : [b, a]
        const rangeIds = visibleIds.slice(from, to + 1).filter(id => {
          const row = visibleIdToRow.get(id)
          return row && (!isRowSelectable || isRowSelectable(row.original))
        })
        // Mail / GitHub 慣例:shift-click 把 range 全變「rowId 點擊後該變的狀態」
        const willCheck = !isSelectedId(rowId)
        setSelection(prev => applySelectIds(prev, rangeIds, willCheck))
        return
      }
    }
    // 一般 toggle + 更新 anchor(include / all 由 applySelectIds 處理)
    const willCheck = !isSelectedId(rowId)
    setSelection(prev => applySelectIds(prev, [rowId], willCheck))
    anchorRowIdRef.current = rowId
  }, [isRowSelectable, mode, isSelectedId, rows, visibleIdToRow, setSelection])

  // ── Cmd+A / Esc / Arrow keys 鍵盤 handler(table-level)──
  // code-quality-allow: long-function — single keyboard dispatch covering Cmd+A / Esc / Arrow / Space + selection state mutations,拆 sub-handler 會切散 keyboard mode coherence
  const tableKeyboardHandler = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // ── Spreadsheet mode keyboard nav(Phase B1+B2,2026-05-10 per codex Q-B verdict)──
      // ActiveCellId 由 mouse click(spreadsheet click 1)+ keyboard arrow 共用 SSOT。
      // ↑↓←→ 移動 / Enter / F2 進 edit / Esc exit edit OR clear active。
      // Codex Q-B1:不分 mouse selected vs keyboard focused,共用 selectedCellId state。
      // Phase B3 IME guard(2026-05-10 per codex Q-B3):中文輸入法組字中 ignore 所有 nav keys。
      // 2026-05-16 Round 5 audit Dim 27 fix:`keyCode` deprecated but still in KeyboardEvent type — no cast needed。
      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
      // 2026-07-14 dim-10 修:spreadsheet 分支排除 descendant 互動控件 — 焦點在 cell 內
      // action button / link / input 時,Enter 應 activate 該控件、方向鍵交還控件,
      // 原 handler 會 preventDefault 取消按鈕 activation、拿舊 selectedCellId 導覽。
      // 對齊下方 row-selection 分支 2026-07-09 既有 input-family guard + AG Grid
      // embedded-control convention(cell renderer 內控件 own keyboard)。
      const spreadsheetKbTarget = e.target as HTMLElement | null
      const targetIsEmbeddedControl = !!spreadsheetKbTarget?.closest?.(
        'button, a[href], input, select, textarea, [contenteditable="true"]',
      )
      // 2026-07-05 D4 fix:spreadsheet 鍵盤入口 — selection 尚未建立時按方向鍵,seed 第一個
      // visible cell(原本唯一 set 起點是 mouse click → 鍵盤-only 使用者 Tab 進 table 後方向鍵
      // 全 no-op,整個 spreadsheet 導覽被滑鼠 gate,違反 spec「鍵盤完整可操作」驗證宣稱。
      // 對齊 Excel / Google Sheets / AG Grid「focus grid → first cell active」canonical)。
      if (spreadsheetMode && !targetIsEmbeddedControl && selectedCellId == null && editingCellId == null
        && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const allRows = table.getRowModel().rows.map((r) => r.id)
        const allCols = table.getVisibleLeafColumns().map((c) => c.id).filter((id) => id !== SELECT_COL_ID)
        if (allRows.length > 0 && allCols.length > 0) {
          e.preventDefault()
          const firstCellId = `${allRows[0]}:${allCols[0]}`
          setSelectedCellId(firstCellId)
          setRangeAnchor(firstCellId)
          setRangeFocus(null)
        }
        return
      }
      if (spreadsheetMode && !targetIsEmbeddedControl && selectedCellId != null && editingCellId == null) {
        const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'F2', 'Escape']
        if (!navKeys.includes(e.key)) return
        const lastColon = selectedCellId.lastIndexOf(':')
        const curRowId = selectedCellId.slice(0, lastColon)
        const curColId = selectedCellId.slice(lastColon + 1)
        const allRows = table.getRowModel().rows.map((r) => r.id)
        const allCols = table.getVisibleLeafColumns().map((c) => c.id).filter((id) => id !== SELECT_COL_ID)
        const curRowIdx = allRows.indexOf(curRowId)
        const curColIdx = allCols.indexOf(curColId)
        if (curRowIdx < 0 || curColIdx < 0) return
        let nextRowIdx = curRowIdx
        let nextColIdx = curColIdx
        if (e.key === 'ArrowUp' && curRowIdx > 0) { nextRowIdx = curRowIdx - 1 }
        else if (e.key === 'ArrowDown' && curRowIdx < allRows.length - 1) { nextRowIdx = curRowIdx + 1 }
        else if (e.key === 'ArrowLeft' && curColIdx > 0) { nextColIdx = curColIdx - 1 }
        else if (e.key === 'ArrowRight' && curColIdx < allCols.length - 1) { nextColIdx = curColIdx + 1 }
        else if (e.key === 'Enter' || e.key === 'F2') {
          // Enter / F2 → 進 edit(若 cell editable + 非 boolean / url)。edit 入口統一走 canEditCell(= isCellEditable)。
          const row = table.getRowModel().rowsById[curRowId]
          const colDef = table.getAllLeafColumns().find((c) => c.id === curColId)
          // any-allow: column meta free-form
          const meta = (colDef?.columnDef as any)?.meta as Record<string, any> | undefined
          if (meta?.type && meta.type !== 'boolean' && meta.type !== 'url' && row && canEditCell(meta, row.original)) {
            e.preventDefault()
            setEditingCellId(cellEditId(curRowId, curColId))
            setSelectedCellId(null)
            setRangeAnchor(null)
            setRangeFocus(null)
          }
          return
        }
        else if (e.key === 'Escape') {
          e.preventDefault()
          setSelectedCellId(null)
          setRangeAnchor(null)
          setRangeFocus(null)
          return
        }
        if (nextRowIdx !== curRowIdx || nextColIdx !== curColIdx) {
          e.preventDefault()
          const nextCellId = `${allRows[nextRowIdx]}:${allCols[nextColIdx]}`
          setSelectedCellId(nextCellId)
          setRangeAnchor(nextCellId)
          setRangeFocus(null)
        }
        return
      }
      // ── Row selection mode keyboard handler(下方既有)──
      if (!enabled) return
      // 2026-07-09 fix(圖一 Ctrl+A bug):焦點在可編輯輸入元素(cell edit / inline edit / 搜尋框)時,
      // 鍵盤(Cmd/Ctrl+A 全選、Esc)應交給該元素(全選 cell 文字 / 取消編輯),**不**攔成 row selection。
      // 對齊 Notion / Airtable / Linear:編輯格內 Ctrl+A = 選格內文字,非選全表列。
      const kbTarget = e.target as HTMLElement | null
      if (
        editingCellId != null ||
        (kbTarget && (kbTarget.tagName === 'INPUT' || kbTarget.tagName === 'TEXTAREA' || kbTarget.tagName === 'SELECT' || kbTarget.isContentEditable))
      ) return
      // Cmd/Ctrl+A:選全可見(扣 disabled)— 對齊 Mail / GitHub / Linear 慣例
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && mode === 'multi') {
        e.preventDefault()
        setSelection(prev => applySelectIds(prev, selectableVisibleIds, true))
        return
      }
      // Esc:clear selection
      if (e.key === 'Escape' && hasAnySelection) {
        e.preventDefault()
        setSelection({ mode: 'include', ids: [] })
        anchorRowIdRef.current = null
        return
      }
    },
    // D3 dep-hygiene fix(2026-07-06):handler 內(portal edit Enter 分支)呼叫的是 canEditCell,
    // 非 isCellEditable — 原 deps 列 isCellEditable 是靠 canEditCell identity-stable 才無實害的
    // stale-closure 地雷;改列真實依賴 canEditCell(其 useCallback deps 已含 isCellEditable)。
    [enabled, mode, hasAnySelection, selectableVisibleIds, setSelection,
     spreadsheetMode, selectedCellId, editingCellId, table, canEditCell]
  )

  // ── Header cell ──
  // code-quality-allow: long-function — header render 含 selection tri-state / sort indicator / column dropdown / pinned / divider 五邏輯,拆 sub-fn 會切散 column type-aware rendering coherence
  const headerCellEl = (header: ReturnType<typeof table.getHeaderGroups>[number]['headers'][number], showDivider: boolean) => {
    // L2 selection:__select__ 欄自訂 render(tri-state header checkbox)
    if (enabled && header.column.id === SELECT_COL_ID) {
      const isHeaderDisabled = selectableVisibleIds.length === 0 || mode !== 'multi'
      return (
        <div
          key={header.id}
          role="columnheader"
          className={cn('flex items-center justify-center shrink-0 select-none', !isHeaderDisabled && 'cursor-pointer')}
          style={{ ...columnSizeStyle(header.column, { resize: enableColumnResize, isSystemCol: isSystemColumn(header.column.id) }), ...cellPadding }}
          onClick={isHeaderDisabled ? undefined : (e) => { e.stopPropagation(); toggleHeaderCheckbox() }}
        >
          {mode === 'multi' && (
            <Checkbox
              size={size === 'lg' ? 'lg' : 'md'}
              checked={headerCheckedState}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={() => toggleHeaderCheckbox()}
              aria-label="全選可見列"
              disabled={selectableVisibleIds.length === 0}
            />
          )}
        </div>
      )
    }
    const meta = header.column.columnDef.meta
    const colType = meta?.type as ColumnType | undefined
    const align = meta?.align ?? (colType ? columnTypeDefaults[colType].align : undefined)
    // Sort UI(Phase A.1):header cell 兩區結構
    //   左區(label + indicator slot):click → toggle sort 三態(asc → desc → none)
    //   右區:reserve future ⌄ menu(filter / hide / pin 等;hover 才出,A.x 加)
    // Indicator inline collapse:已套才顯;未套不顯(任何混雜組合不推 — 對齊 AG Grid / Notion)
    const canSort = header.column.getCanSort()
    const sortDir = header.column.getIsSorted() // false | 'asc' | 'desc'
    // **A fix(2026-05-04)**:multi-sort(≥2)hide header arrow + 取消排序 option
    //   理由:無 order 編號的單個 arrow 在 multi-sort 下是 partial info → 反而混淆
    //   user 走 SortManager panel 看完整 priority(SSOT)
    //   1 sort 仍秀 arrow(完整資訊);0 sort 自然不秀(canSort && sortDir 短路)
    const isMultiSort = (table.getState().sorting?.length ?? 0) > 1
    const SortIcon = sortDir === 'asc' ? ArrowUp : ArrowDown // 未套不渲染;套用後二擇一
    const sortHandler = canSort ? header.column.getToggleSortingHandler() : undefined
    return (
      <div
        key={header.id}
        role="columnheader"
        aria-sort={sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none'}
        className={cn(
          // **Inline action canonical**(2026-05-05 v2):header 用 `flex items-center gap-2`
          // (= 8px,inline-action.spec.md SSOT),more action 為 inline shrink-0 sibling 而非
          // absolute → hover 顯時佔位 → label 自動讓出空間給 sort + more,**不再重疊**(對齊
          // user 圖示質疑 + Notion / Airtable header layout 共識)。
          // cell padding 12px 由外層 cellPadding style 提供 → more 距 cell 右邊 = 12px。
          // header 字級也隨 size(原寫死 text-body → lg 表格 header 字偏小,跟 body 不一致)。
          // 對齊 cell wrapper + Field family size→font SSOT。色弱化由 text-fg-secondary 維持。
          'group relative flex items-center gap-2 text-fg-secondary font-normal shrink-0 overflow-hidden select-none',
          fieldDisplayTextClass(size),
          align === 'right' && 'justify-end',
          align === 'center' && 'justify-center',
        )}
        style={{ ...columnSizeStyle(header.column, { resize: enableColumnResize, isSystemCol: isSystemColumn(header.column.id) }), ...cellPadding }}
      >
        {/* 左區:label + sort indicator(整區 click → toggle sort;Shift+click 加 secondary,enableMultiSort 啟用時) */}
        <div
          role={canSort ? 'button' : undefined}
          tabIndex={canSort ? 0 : undefined}
          onClick={sortHandler}
          // any-allow: event-cast — TanStack getToggleSortingHandler 內部會 narrow,接受 KeyboardEvent
          onKeyDown={canSort ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortHandler?.(e as any) } } : undefined}
          className={cn(
            'flex items-center min-w-0 flex-1 gap-1 outline-none',
            canSort && 'cursor-pointer hover:text-foreground transition-colors',
            // 2026-07-04:rounded-sm → rounded-md(radius.spec.md 設計哲學(4)rounded-sm 保留未使用,4px 一律 rounded-md)
            canSort && 'focus-visible:ring-2 focus-visible:ring-ring rounded-md',
          )}
        >
          <TruncateCell className={cn('min-w-0', align === 'right' && 'text-right', align === 'center' && 'text-center')}>
            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
          </TruncateCell>
          {canSort && sortDir && !isMultiSort && (
            // 2026-05-18 改 per user 拍板「DataTable sort 跟 row size 變」+「做完」approval:
            // 原固定 14 違反 uiSize.spec.md Icon Tier(sm/md→16, lg→20)。改 ICON_SIZE[size]
            // 隨 DataTable size prop 變。
            <SortIcon size={ICON_SIZE[size]} aria-hidden className="shrink-0 text-fg-secondary" />
          )}
        </div>
        {/* 右區:⌄ menu(hover/focus-within 才顯;**不顯示時不佔位**)
            **Layout canonical**(2026-05-06 v3 user explicit rule):`hidden` default →
            `group-hover:inline-flex` / `group-focus-within:inline-flex` / `has-[[data-state=open]]:inline-flex`
            才出現 + 佔位。前 v2 用 `opacity-0 group-hover:opacity-100` 是「永遠佔位 hover 才顯影」—
            user 報「不應永遠佔位,沒顯示時應讓 label 多空間」。新行為:
            - 不顯示 → display:none → 不佔位 → label 取得整個 header width
            - hover/focus/menu-open → display:inline-flex → 佔位(width 同前;label 自然 truncate 讓位)
            對齊 Notion(hover-row reveal action,inline action 不佔靜態 layout)/ Linear / Airtable。
            ItemInlineActionButton asChild-compatible,size="md" 因 header 不在 RowSizeProvider。 */}
        <div className="shrink-0 hidden group-hover:inline-flex group-focus-within:inline-flex has-[[data-state=open]]:inline-flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ItemInlineActionButton
                icon={ChevronDown}
                size="md"
                aria-label={`${typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : header.column.id} 欄位選單`}
                overlayTrigger
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canSort && (
                <>
                  <DropdownMenuItem startIcon={ArrowUp} onClick={() => header.column.toggleSorting(false, false)}>升冪排序</DropdownMenuItem>
                  <DropdownMenuItem startIcon={ArrowDown} onClick={() => header.column.toggleSorting(true, false)}>降冪排序</DropdownMenuItem>
                  {sortDir && !isMultiSort && <DropdownMenuItem startIcon={XIcon} onClick={() => header.column.clearSorting()}>取消排序</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                </>
              )}
              {onColumnFilterTrigger && (
                <DropdownMenuItem startIcon={FilterIcon} onClick={() => onColumnFilterTrigger(header.column.id)}>依此欄篩選…</DropdownMenuItem>
              )}
              {header.column.getCanHide() && (
                <DropdownMenuItem startIcon={EyeOff} onClick={() => header.column.toggleVisibility(false)}>隱藏欄位</DropdownMenuItem>
              )}
              {/* 2026-05-06 v11:Auto-fit 放 more menu(不綁 double-click,避免跟 click-to-sort 衝突)。
                  scan column body cells max scrollWidth + cellPadding → reset column.size。
                  System columns 永遠 fixed 不顯此 item。 */}
              {enableColumnResize && !isSystemColumn(header.column.id) && (
                <DropdownMenuItem
                  startIcon={ArrowUpDown}
                  onClick={() => {
                    const cells = document.querySelectorAll<HTMLElement>(
                      `[role="cell"][data-column-id="${header.column.id}"]`,
                    )
                    let max = MIN_COLUMN_WIDTH
                    cells.forEach(c => {
                      const inner = c.firstElementChild as HTMLElement | null
                      const w = (inner?.scrollWidth ?? c.scrollWidth) + 32 // + cellPadding 兩側 + buffer
                      if (w > max) max = w
                    })
                    header.column.resetSize?.()
                    table.setColumnSizing(prev => ({ ...prev, [header.column.id]: max }))
                    onColumnResize?.(header.column.id, max)
                  }}
                >
                  自動調整寬度
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Header divider + resize handle(2026-05-06 v11,**2026-05-10 H2+H3 重構**):
            - **2026-05-10 split**(per user 抓「pinned 欄位右邊分隔線無法 resize」):
              `showDivider` 只 gate **視覺 1px line**(panel boundary col 由 panel border-r 接,
              不重複);**resize hot zone** 改 gate by `isResizable` 獨立,panel boundary col
              仍可拖 resize(hot zone 視覺 invisible,跟 panel border-r 不衝突)。
            - **2026-05-10 H3**:per-column `meta.resizable === false` opt-out — consumer 可標
              「此 col 寬度由內容決定不允許 resize」(對齊 AG Grid `colDef.resizable` /
              Material X-DataGrid 同 API)。System cols(__select__ / __drag__ / __actions__
              row-actions)自動 false(永遠固定寬)。
            - 視覺:1px line `bg-divider` 在 showDivider 時 paint
            - Hot zone:absolute 7px 兩側,讓 mouse 容易 hit(在 isResizable 時 render)
            - Hover/Active:`bg-border-hover` / `bg-primary`(hot zone 內 1px line 變色)
            - role="separator" + aria-orientation="vertical" 對齊 WAI-ARIA(isResizable 時)*/}
        {(() => {
          const colId = header.column.id
          const colMeta = header.column.columnDef.meta as { resizable?: boolean } | undefined
          // H3: meta.resizable === false 顯式 opt-out(default true)
          const colOptIn = colMeta?.resizable !== false
          const isResizable = enableColumnResize && !isSystemColumn(colId) && colOptIn
          const isResizing = header.column.getIsResizing?.()
          // H2: 不論 showDivider,只要 isResizable 就 render hot zone(panel boundary col 仍可拖)
          if (!showDivider && !isResizable) return null
          return (
            <span
              role={isResizable ? 'separator' : undefined}
              aria-orientation={isResizable ? 'vertical' : undefined}
              aria-label={isResizable ? '拖曳調整欄寬' : undefined}
              className={cn(
                'group/resize absolute top-0 bottom-0 right-0 -mr-[3px] w-[7px]',
                isResizable && 'cursor-col-resize select-none',
              )}
              // 2026-05-12 fix v2(user 抓 R3 stopPropagation 沒生效):dnd-kit PointerSensor
              // 監聽 `pointerdown`,我前一輪只 stop `onMouseDown` → pointerdown 仍冒泡 →
              // drag activate。改用 `onPointerDownCapture` capture-phase 一次性吃 pointerdown
              // event,**先** dnd-kit listener 拿到 → drag 不啟動;接著 emit synthesized
              // mousedown 給 TanStack resize handler。對齊 AG Grid / Material X-Grid pinned-column
              // resize idiom(resize handle 永遠 own pointer event,drag listener 不競爭)。
              onPointerDownCapture={isResizable ? (e: React.PointerEvent<HTMLSpanElement>) => {
                e.stopPropagation()
                header.getResizeHandler?.()(e.nativeEvent)
              } : undefined}
              onTouchStart={isResizable ? (e: React.TouchEvent<HTMLSpanElement>) => {
                e.stopPropagation()
                header.getResizeHandler?.()(e.nativeEvent)
              } : undefined}
            >
              {/* H2: 視覺 1px line 只在 showDivider 時 paint(panel boundary col by panel-r 接管,不重) */}
              {showDivider && (
              <span
                aria-hidden
                className={cn(
                  'absolute right-[3px] w-px transition-colors',
                  isResizing
                    ? 'bg-primary'
                    : isResizable
                      ? 'bg-divider group-hover/resize:bg-[var(--border-hover)]'
                      : 'bg-divider',
                )}
                style={{ top: 'var(--table-cell-py)', bottom: 'var(--table-cell-py)' }}
              />
              )}
            </span>
          )
        })()}
      </div>
    )
  }

  // ── Region helpers ──
  // hoist region id Sets 一次,避免 n_rows × n_regions 重建(virtual mode 1000+ rows 場景效益顯著)
  const leftIds = React.useMemo(() => new Set(leftCols.map(c => c.id)), [leftCols])
  const centerIds = React.useMemo(() => new Set(centerCols.map(c => c.id)), [centerCols])
  const rightIds = React.useMemo(() => new Set(rightCols.map(c => c.id)), [rightCols])
  const colsToIds = (cols: Column<TData, unknown>[]) =>
    cols === leftCols ? leftIds : cols === rightCols ? rightIds : centerIds

  const getRegionHeaders = (cols: Column<TData, unknown>[]) => {
    const ids = colsToIds(cols)
    return table.getHeaderGroups()[0]?.headers.filter(h => ids.has(h.id)) ?? []
  }

  const getRegionCells = (row: typeof rows[number], cols: Column<TData, unknown>[]) => {
    const ids = colsToIds(cols)
    return row.getVisibleCells().filter(c => ids.has(c.column.id))
  }

  // 2026-05-06 v14.4 Notion blue line drop indicator(column reorder visual canonical)
  // 必須宣告在 renderHeaderRow 之前(closure 引用,避 minified bundler TDZ false-positive)
  const [dropIndicator, setDropIndicator] = React.useState<{ id: string; side: 'before' | 'after'; type: 'row' | 'column' } | null>(null)
  // 2026-07-05 D3 perf fix:shallow-compare setter — drag 中每次 over 變更 handleDragOver 都
  // set 全新 object,即使 id/side/type 沒變也觸發整個 DataTableInner 重渲(全 visible rows +
  // cells + header)。值相同 → 回傳 prev reference 讓 React bail out(對齊檔內 invalidRef guard
  // pattern;`setDropIndicator(null)` 自帶 Object.is bail out 不需經此)。
  const setDropIndicatorIfChanged = React.useCallback(
    (next: { id: string; side: 'before' | 'after'; type: 'row' | 'column' }) => {
      setDropIndicator((prev) =>
        prev && prev.id === next.id && prev.side === next.side && prev.type === next.type ? prev : next,
      )
    },
    [],
  )
  // ref for stable lookup in handleDragOver(避免 closure 抓舊值)
  const reorderableColumnIdsRef = React.useRef<string[]>([])

  // ── Render header row for a region ──
  const renderHeaderRow = (cols: Column<TData, unknown>[], isRight: boolean) => {
    const headers = getRegionHeaders(cols)
    // a11y(2026-04-25 axe aria-required-children):若 region 無 visible cells(只有
    // invisible rowActions placeholder 或 region 本身空),不設 role='row' — 改為純
    // layout div,避免 axe 抓到「row 無 cell/columnheader 子元素」violation。
    const hasVisibleChildren = headers.length > 0
    const RowTag = hasVisibleChildren ? 'div' : 'div'
    const rowRole = hasVisibleChildren ? 'row' : undefined
    return (
      <RowTag role={rowRole} className={cn('flex items-center border-b border-divider', rowHeight, HEADER_BG)}>
        {headers.map((h, i) => {
          const showDivider = i < headers.length - 1 && !(isRight && i === headers.length - 1)
          const colId = h.column.id
          const meta = h.column.columnDef.meta as { locked?: boolean } | undefined
          const isLocked = meta?.locked === true
          const isSystem = isSystemColumn(colId)
          // useDraggable + useDroppable per header(Rules of Hooks compliant — same hook count per render
          // as long as headers count consistent;column reorder/hide 整 row reflow 自然觸發 React reconcile)。
          // disabled=true 時仍 call hook 不啟動 listeners。
          const isDraggable = enableColumnReorder && !isLocked && !isSystem
          const indicatorSide = dropIndicator?.type === 'column' && dropIndicator.id === colId ? dropIndicator.side : null
          return (
            <DraggableHeaderCell
              key={h.id}
              id={colId}
              disabled={!isDraggable}
              isLocked={isLocked}
              dropIndicatorSide={indicatorSide}
            >
              {headerCellEl(h, showDivider)}
            </DraggableHeaderCell>
          )
        })}
        {isRight && hasRowActions && (
          <div className="flex items-center justify-end shrink-0 gap-2 invisible" aria-hidden="true" style={cellPadding}>
            {/* 渲染一個假 row 的 actions 來佔位,確保 header 和 body 同寬(aria-hidden 避免 screen reader 讀出 invisible 內容)*/}
            {rows[0] && rowActions!(rows[0].original)}
          </div>
        )}
      </RowTag>
    )
  }

  // ── Render body rows for a region ──
  // code-quality-allow: long-function — virtualizer × sticky region × empty state × per-row drag 四正交 render path 集中,拆 sub-fn 會將 virtualItems / rows / colVirtualizer 三 closure 跨 fn 傳
  const renderBodyRows = (cols: Column<TData, unknown>[], isCenter: boolean, isRight: boolean, regionWidth?: number) => {
    if (isEmpty && isCenter) {
      // 有框容器 → 垂直置中(design principle)
      if (emptyState && typeof emptyState !== 'string') return <div className="flex-1 flex items-center justify-center py-12">{emptyState}</div>
      return <div className="flex-1 flex items-center justify-center py-12"><Empty description={typeof emptyState === 'string' ? emptyState : '沒有資料'} /></div> // i18n-allow: DS default fallback; consumer override via emptyState prop
    }
    if (isEmpty) return null

    // **v15.4 architectural decision** — primary 永遠 = center region(不論是否 pinnedLeft)。
    // 之前 `primary = left if hasLeft else center` 有兩問題:
    //   1. multi-instance same-id 是 dnd-kit anti-pattern,setActivatorNodeRef 救不了
    //      (last-mount-wins,用 last region 的 rect 當 activator → ghost 起點偏離 cursor)
    //   2. user 從 center 主視覺 grab 才直觀;pinned-left(SKU)/ pinned-right(Updated)
    //      是「鎖定欄」語意,不是 drag handle。Linear / Notion / Jira 的 pinned column
    //      都不接 drag listeners,純視覺鎖。
    // 改 center-only listeners → ghost activator = center row → cursor 跟 ghost 維持初始
    // 相對位置(SSOT 對齊 user directive)。
    // code-quality-allow: long-function — audit 誤偵測 isPrimaryRegion 為 function(實為 const);真實 long body = 下方 rowEl render closure(virtualizer × sticky × drag listeners × hover delegation),拆會破壞 closure capture
    const isPrimaryRegion = isCenter
    const regionRole: 'primary' | 'mirror' = isPrimaryRegion ? 'primary' : 'mirror'

    // code-quality-allow: long-function — virtualizer × sticky panel × drag listeners × hover delegation × per-row state 多 closure capture;拆會破壞 dnd-kit hooks 跟 row idx 的 stable binding
    const rowEl = (row: typeof rows[number], idx: number, opts?: { virtual?: boolean; start?: number; isLast?: boolean }) => {
      const showBorder = bordered !== false ? !opts?.isLast : true
      // L4 row drag v2:nested rows 也可拖(配合 cross-parent collisionDetection 過濾)
      // sub-rows: depth>0 也各自掛 useDraggable/useDroppable,但 collisionDetection 只接受 same-parent over
      const isThisRowDragging = enableRowDrag && activeDragId === row.id
      const dragRowWrap = enableRowDrag

      // H1 fix(2026-05-10,per user 確認):per-row autoRowHeight when any cell in this row has
      // error。Fixed-height row 模式下,該 row 的任一 cell 有 error msg → THAT row 自動 auto-height
      // 撐 message;error 全清 → 回 fixed。Other rows 不受影響(global autoRowHeight prop 不變)。
      // Per Material X-DataGrid `getRowHeight` per-row dynamic + AG Grid `rowHeight: 'auto'`
      // per-row idiom。Compute by scanning row's visible cells for cellErrors map hit。
      const rowHasError = !!cellErrors && row.getVisibleCells().some((c) => {
        const key = `${row.id}:${c.column.id}`
        const v = cellErrors[key]
        return v != null && (Array.isArray(v) ? v.length > 0 : true)
      })
      const effectiveAutoRow = autoRowHeight || rowHasError

      // L4 row drag:handle absolute 貼齊 row 左 border(Jira canonical),不佔 column 空間。
      // 只在 primary region + depth===0 render — primary 永遠 = center(v15.4 撤銷「left 優先」,
      // 見上方 isPrimaryRegion 註解);RowDragHandle 內部再用 ctx.role === 'primary' 守門避免
      // mirror region 重複 render。
      const showDragHandle = enableRowDrag && (row.depth ?? 0) === 0 && isPrimaryRegion
      // v15.2 SSOT 對齊 TreeView:drag 期間 suppress 全表 hover state
      // (user directive「drag 時 row 不應 hover / drag button 不應出現」)
      const anyDragActive = activeDragId != null
      // code-quality-allow: long-function — baseRowDiv 含 row drag listeners / sticky panel / hover delegation / cell render loop / divider drawing 多 closure;拆 sub-fn 會破壞 dnd-kit hooks + row.id stable binding
      const baseRowDiv = (extra?: { ref?: (el: HTMLElement | null) => void; style?: React.CSSProperties; isDragging?: boolean; listeners?: Record<string, unknown>; attributes?: Record<string, unknown> }) => (
        <div
          key={row.id}
          ref={(el) => {
            // v2 fix #1:被拖 row 略過 measureElement(transform 干擾測量,長 list 累積誤差)
            // v2 fix #4(virtual freeze):drag 進行中(activeDragId != null)整個略過 measureElement
            // **2026-05-07 v15.17 A 路徑 — revert autoRowHeight guard**:
            //   v15.8 加 `&& autoRowHeight` guard 為了解 R4 mount-time row growth animation
            //   (假設 measureElement 在 fixed mode 觸發 getTotalSize 重算 → React re-render →
            //   mount 時看起來 row height 在變)。但 codex P2 audit (`6d5188e` line 1699)指出
            //   此 guard 副作用:consumer 傳 custom `estimateRowHeight` 或 CSS theme override
            //   row height 時,fixed mode 不再 reconcile estimate vs reality → getTotalSize 錯
            //   → scroll 範圍截斷或末端留白。
            //
            //   Codex deep R4 eval (`4399272774` follow-up reply) 認為 R4 真因更可能是
            //   「首幀樣式未齊 / 字型 async load / paint stagger」,不是 measureElement。
            //   故先 revert guard 觀察 R4 是否真回歸:
            //   - R4 不重現(我 + codex 推論對)→ guard mis-fix,永久撤,P2 自動解
            //   - R4 重現(measureElement 真因)→ 補 dampening (差異 <1px 不 setState /
            //     一幀只 update 一次)+ low-freq sampling per codex 雙模式方案
            if (isCenter && opts?.virtual && el && !isThisRowDragging && activeDragId == null) {
              virtualizer.measureElement(el)
            }
            extra?.ref?.(el)
          }}
          data-index={isCenter && opts?.virtual ? idx : undefined}
          data-row-index={idx}
          data-sortable-row-id={enableRowDrag ? row.id : undefined}
          // v15.4:primary region(center)= drag source row — ghost reconstruction 用此 marker
          // 找 source row(避免 multi-region 場景挑錯 region 的 row 當 ghost)
          data-row-drag-source={enableRowDrag && isPrimaryRegion ? 'true' : undefined}
          role="row"
          // L5 分頁(2026-07-07 C13):rowindex 加分頁 offset — aria-rowcount 是全集,
          // 第 2 頁起 index 必須接續(否則 AT 讀到「第 129 列中的第 2 列」錯位);
          // 不可用 row.index(sort/filter 後是原始資料序,非視覺序)
          aria-rowindex={(paginationEnabled ? (currentPage - 1) * pageSizeState : 0) + idx + 2}
          className={cn(
            'group/row flex relative',
            // H1 fix(2026-05-10):effectiveAutoRow 覆 global autoRowHeight,per-row 若有 cell error
            // 自動 auto-height(撐 message)。Error 清 → 回 fixed。Other rows 不受影響。
            effectiveAutoRow ? 'items-start' : 'items-center',
            !effectiveAutoRow && rowHeight,
            !effectiveAutoRow && 'overflow-hidden',
            opts?.virtual && 'absolute w-full',
            showBorder && 'border-b border-divider',
            // v15.3 hover bg canonical:hover class 永遠生效,但 onMouseOver delegate
            // 在 drag 期間只允許 source row 寫 data-hovered → 其他 row 自然不顯 bg。
            // (對齊 Linear / Jira:source 維持 active 視覺,其他 row 完全靜止)
            'transition-colors data-[hovered]:bg-neutral-hover',
            extra?.isDragging && 'bg-neutral-hover',
            // **v15.3.1**:不變 cursor(對齊 Material / Carbon / Polaris / Notion canonical)。
            // 整列可拖的 affordance 由可見的 RowDragHandle Button 提供,不靠 cursor 暗示。
            // 之前 cursor-grab → drag 中 user 看到 cursor 變化反而干擾 indicator+ghost 的視覺焦點。
          )}
          style={{
            ...(opts?.virtual ? { transform: `translateY(${opts.start}px)` } : {}),
            ...(extra?.style ?? {}),
          }}
          {...hoverProps(idx)}
          {...(extra?.attributes ?? {})}
          {...(extra?.listeners ?? {})}
        >
          {showDragHandle && <RowDragHandle disabled={dragDisabled} anyDragActive={anyDragActive} />}
          {/* 2026-05-06 v14.6 row drop indicator(SSOT 對齊 TreeView):水平 2px primary line at top/bottom edge */}
          {dropIndicator?.type === 'row' && dropIndicator.id === row.id && dropIndicator.side === 'before' && (
            <div className={dropIndicatorRow.before} aria-hidden />
          )}
          {getRegionCells(row, cols).map((cell, ci, arr) => cellEl(cell, ci === arr.length - 1 && !(isRight && hasRowActions)))}
          {isRight && hasRowActions && (
            <div role="cell" className="flex items-center justify-end shrink-0 gap-2 flex-1" style={cellPadding}>
              {rowActions!(row.original)}
            </div>
          )}
          {dropIndicator?.type === 'row' && dropIndicator.id === row.id && dropIndicator.side === 'after' && (
            <div className={dropIndicatorRow.after} aria-hidden />
          )}
        </div>
      )

      if (dragRowWrap) {
        // invalidDrop 只對「正在被拖」的 row 顯示 — handle 在 active row 上,UI 警示只需該 row
        // code-quality-allow: long-function — 此 const 之下的整個 if-block 含 dnd-kit hooks + SortableRowProvider + baseRowDiv composition;audit 把 const 誤認為 function entry,實 long body 在 closure 內 dnd-kit + per-row state 多 capture,拆會破壞 hook order invariant
        const rowInvalidDrop = isThisRowDragging && invalidDropActive
        return (
          <SortableRowProvider key={row.id} id={row.id} disabled={dragDisabled} role={regionRole} invalidDrop={rowInvalidDrop}>
            {(ctx) => baseRowDiv({
              // primary 掛 useDraggable+useDroppable 合成 ref;mirror 只掛 useDroppable ref
              // (v15.4 split — mirror 不進 drag source store,isDragging 走 useDndContext 同步)
              ref: ctx.setNodeRef,
              style: ctx.style,
              isDragging: ctx.isDragging,
              // v15.6 button-only:rowListeners 恆 undefined(activator = RowDragHandle Button),
              // baseRowDiv spread `{...(extra?.listeners ?? {})}` 自動 noop;attributes 留空 = row 純 container
              listeners: ctx.rowListeners,
              attributes: ctx.rowAttributes,
            })}
          </SortableRowProvider>
        )
      }
      return baseRowDiv()
    }

    // AR44 canonical(2026-04-21):virtual / non-virtual 都用 `minWidth: colsWidth` 的 wrapper,
    // 讓兩種 rendering path 的 **水平 overflow 行為一致** — 中段 column 區塊都會因
    // columns 實際寬度超過 centerBody 可用寬而觸發 H scrollbar。
    // 先前 non-virtual 走 `<>...</>`(無 wrapper),依靠 row 內 cells 自然寬推擠容器,
    // 跟 virtual 的 `minWidth: containerWidth` 行為不同,造成 story 1 / story 2 看起來水平
    // 捲軸出現時機不一致。現在統一靠 wrapper 的 minWidth 強制 overflow。
    const colsWidth = cols.reduce((a, c) => a + c.getSize(), 0)
    const containerWidth = regionWidth || colsWidth

    if (useVirtual) {
      // 2026-05-13 (c) scroll-defer perf(per user 拍 Path (c) Roadmap >50ms 後 escalate):
      // wrap virtual body with `<TableScrollProvider isScrolling={virtualizer.isScrolling}>` →
      // 重 cell subtree(Avatar HoverCard / future Tag / etc.)讀 useTableIsScrolling() 跳
      // expensive paths during scroll,scroll end 自動接回完整 affordance。
      // 對齊 AG Grid deferRender / MUI X DataGrid scroll-defer canonical。
      return (
        <TableScrollProvider isScrolling={virtualizer.isScrolling}>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', minWidth: containerWidth }}>
            {virtualizer.getVirtualItems().map(vr => rowEl(rows[vr.index], vr.index, { virtual: true, start: vr.start, isLast: vr.index === rows.length - 1 }))}
          </div>
        </TableScrollProvider>
      )
    }
    return (
      <div style={{ minWidth: containerWidth }}>
        {rows.map((row, i) => rowEl(row, i, { isLast: i === rows.length - 1 }))}
      </div>
    )
  }

  // Single mode 用 RadioGroup wrap 整 table(Radix RadioGroup 用 context 傳遞 value/onValueChange)
  // Multi mode 不需 wrap(Checkbox 各自 controlled,不靠 context)
  const tableContent = (
    <div
      ref={(el) => { tableRef.current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el }}
      data-table-size={size}
      data-data-table-outer  // anchor for RowDragHandle Portal getBoundingClientRect (M25 invariant: outer 一定存在)
      data-active-editor-controller={experimentalActiveEditorController ? 'enabled' : undefined}  // Slice D Step 3.2 scaffold marker
      // 2026-05-12 fix(user 抓「為什麼按 shift 那麼容易會在 table 外圈出現一層藍色邊框」):
      // table outer tabIndex=0(spreadsheet keyboard nav needs)→ click 取得 focus →
      // browser default `:focus-visible` 來自 globals.css L63「outline: 2px solid var(--ring)」
      // → 整 table 藍框。Fix:`outline-none` 抑制 outer focus visual,cell selection rect
      // (SelectionRect z 2)IS the visual focus indicator per spreadsheet canonical
      // (對齊 Excel / Google Sheets / Notion / Airtable — focused cell own active border,
      // table 容器無 focus ring)。
      className={cn(dataTableVariants({ bordered }), isFillHeight && 'flex flex-col', 'outline-none focus:outline-none focus-visible:outline-none', className)}
      // isFillHeight:`maxHeight: 100%`(不是 height:100%)— content 小 → outer = intrinsic
      // (hug rows);content 大或 window 縮 < content → outer cap 到 100% of parent。
      // 行為:**永遠 hug rows**,只在被約束時才 cap + body shrink + V scroll。
      // 簡單需求:有約束 → rows 沒超就 hug;超就 cap+scroll;RWD 同理。
      style={isFillHeight ? { maxHeight: height } : undefined}
      // L5 分頁:aria-rowcount = 全集筆數非當頁(ARIA 規範;getPrePaginationRowModel = filter 後全集)
      role="table" aria-rowcount={(paginationEnabled ? table.getPrePaginationRowModel().rows.length : rows.length) + 1}
      // Phase 9 Issue 12 fix(2026-05-10 codex 抓):**single tabIndex prop**,合併 selection
      // 跟 spreadsheet 兩 path。React 在 dup props 只 keep last 是 silent regression risk。
      tabIndex={enabled || spreadsheetMode ? 0 : undefined}
      // 2026-05-10:`enabled || spreadsheetMode` — spreadsheet keyboard nav 跨 row-selection-disabled 場景也要 fire
      onKeyDown={enabled || spreadsheetMode ? tableKeyboardHandler : undefined}
      onMouseOver={enterLeaveHandlers.onMouseOver}
      onMouseOut={enterLeaveHandlers.onMouseOut}
      {...props}
    >
      {/* ══ HEADER（固定頂部，不在 scroll 內）══ */}
      <div role="rowgroup" className="flex">
        {hasLeft && (
          <div ref={leftHeaderRef} data-datatable-header-panel="left" className="shrink-0 overflow-hidden dtPanelBoundaryRight">
            {renderHeaderRow(leftCols, false)}
          </div>
        )}
        {/* Header 的 center 區保持 overflow-hidden(非 scroll)—— body 的 center 才有 scroll,
            header 靠 JS 同步 scrollLeft(見 onCenterBodyScroll)。這樣不會出現雙 scrollbar。
            V scrollbar 對齊:centerBody **刻意不用** `scrollbar-gutter: stable`(決策見 centerBody
            className 註解 — 永久預留 15px 會讓 content-fit 看起來像恆有 V 捲軸);trade-off =
            V scroll 出現時 body 內側少 ~15px、header 不縮 → 右端微 misalign,content-fit 乾淨優先。
            header 的 `scrollbar-gutter` 本就無效(overflow-hidden),刻意不設 */}
        <div
          ref={centerHeaderRef}
          data-datatable-header-panel="center"
          className="flex-1 min-w-0 overflow-hidden"
        >
          {/* 2026-05-06 v13.1:retire `w-max min-w-full` — 改 `style={{minWidth: centerColsWidth}}`
              跟 body inner wrapper 同 SSOT。前 `w-max` 讓 header content max-content(label 短)
              vs body content max-content(Note 長 break-words)diverge → header / row width 不對齊 76px。
              統一 minWidth 公式後兩者永遠等寬,cells flex 均分結果一致。 */}
          <div style={{ minWidth: centerColsWidth }}>
            {renderHeaderRow(centerCols, false)}
          </div>
        </div>
        {hasRight && (
          <div ref={rightHeaderRef} data-datatable-header-panel="right" className="shrink-0 overflow-hidden dtPanelBoundaryLeft">
            {renderHeaderRow(rightCols, true)}
          </div>
        )}
      </div>

      {/* ══ BODY(AG Grid 流派:各 region 自己 V scroll + JS 同步)══
           AR44 user-reported UX fix:H scrollbar 現在落在 center-body 的 visible 底部(不是 1800px 內容底部)。
           三個 region(left / center / right)各自 maxHeight + overflowY,JS 同步 scrollTop。
           Pinned 區 overflow-y:hidden(看不到自己的 V scrollbar),V scroll 真正發生在 center。
           isFillHeight 時 body div 加 min-h-0 讓它在 outer flex column 內可被 flex shrink — region maxHeight: 100% 才能 bind 到實際分配的高度。 */}
      {/* body 在 isFillHeight 用 `min-h-0 min-w-0`(**不**用 flex-1)。
          flex-1 會強制 body 撐滿 outer = 不 hug content。預設 `flex: 0 1 auto` + min-h-0 =
          body intrinsic = content,被 outer maxHeight 約束時可 shrink 到 outer 分配空間。
          centerBody.maxHeight 用 JS 算 px(bypass CSS % flex 場景 buggy shrink)。 */}
      <div ref={bodyRef} className={cn('flex items-start', isFillHeight && 'min-h-0 min-w-0')}>
        {hasLeft && (
          <div
            ref={leftBodyRef}
            data-datatable-panel="left"
            className="shrink-0 overflow-hidden dtPanelBoundaryRight"
            style={{
              width: leftWidth || undefined,
              // isFillHeight 用 JS 算的 px;固定 px(300px 等)直接套
              ...(isFillHeight && bodyMaxHeight != null ? { maxHeight: bodyMaxHeight } : hasHeightConstraint ? { maxHeight: height } : {}),
            }}
          >
            {renderBodyRows(leftCols, false, false, leftWidth)}
          </div>
        )}
        <div
          ref={centerBodyRef}
          // Center body 同時擁有 H + V scroll;maxHeight 限制讓 H scrollbar 落在 visible 底部
          data-datatable-hscroll
          data-datatable-panel="center"
          // overflow-x/y: auto — 沒 overflow 就不顯 bar。wrapper minWidth 仍 trigger H 真 overflow。
          // **不**用 scrollbar-gutter: stable — 那會永遠保留 V 軸 15px 空間,
          // content fit 時看起來像「永遠有 V 捲軸」(Image #5 bug)。
          // trade-off:V scroll 出現時 body 內側少 15px,header 不縮 → 右端微 misalign,
          // 但 content fit 視覺乾淨優先(Mac 用戶 overlay scrollbar 不可見)。
          className="flex-1 min-w-0 overflow-x-auto overflow-y-auto"
          // isFillHeight:用 JS 算的 px(bodyMaxHeight),bypass CSS % 在 flex 場景的不可靠 shrink。
          // 固定 px(300px etc):直接套 height。
          style={
            isFillHeight && bodyMaxHeight != null
              ? { maxHeight: bodyMaxHeight }
              : hasHeightConstraint
                ? { maxHeight: height }
                : undefined
          }
          onScroll={onCenterBodyScroll}
        >
          {/* 2026-05-06 v13.1:retire `w-max min-w-full` — 改 `style={{minWidth: centerColsWidth}}`
              跟 header inner wrapper 同 SSOT。renderBodyRows 內部已用同 containerWidth 公式 wrap rows,
              此外層 wrapper minWidth 跟內層一致 = 兩層都 = centerColsWidth → header / body 對齊。 */}
          <div style={{ minWidth: centerColsWidth }}>
            {renderBodyRows(centerCols, true, false)}
          </div>
        </div>
        {hasRight && (
          <div
            ref={rightBodyRef}
            data-datatable-panel="right"
            className="shrink-0 overflow-hidden dtPanelBoundaryLeft"
            style={{
              width: rightWidth || undefined,
              ...(isFillHeight && bodyMaxHeight != null ? { maxHeight: bodyMaxHeight } : hasHeightConstraint ? { maxHeight: height } : {}),
            }}
          >
            {renderBodyRows(rightCols, false, true, rightWidth)}
          </div>
        )}
      </div>
      {/* Slice D Step 1B(2026-05-10):Interaction Layer singleton(`.claude/planning/datatable-spreadsheet-rfc.md`)。
          Default disabled — backward-compat。Enable 後 hover/editor/selected/range 由 layer 統一畫,
          per Contract 8 「one geometry owner, two paint owners」。
          Step 1C-fix(2026-05-10):wire Contract 15 cellClickEntersEdit predicate 過濾 readonly /
          boolean / url cells(per RFC + user 拍板 USER #15「checkbox/url no-hover」)。
          Step 4(2026-05-10):wire spreadsheetMode select / range cells。 */}
      <DataTableInteractionLayer
        enabled={experimentalSpreadsheetOverlay || spreadsheetMode}
        containerRef={tableRef}
        // Slice D Step 3 wire(2026-05-10):pass editingCellId so layer renders
        // ActiveEditorHost rect at active cell。Composite cell-id format:
        // `${rowId}:${colId}` matches data-cell-id attribute(per Step 1B)。
        // Note:editingCellId 內部用 `__` separator,需轉 `:`。
        activeEditorCellId={editingCellId ? editingCellId.replace('__', ':') : null}
        // 2026-05-10 bug fix(user 圖1):dashed scaffold rect 改 gate 給
        // experimentalActiveEditorController 而非 experimentalSpreadsheetOverlay,
        // 避免 hover overlay 開啟時 cell 進 edit mode → dashed leak 出來跟 hover solid 並存。
        activeEditorEnabled={experimentalActiveEditorController}
        // Slice D Step 5(D.3 portal Field,2026-05-10):real portal Field render callback。
        // Layer 在 ActiveEditorHost(z 3 float rect)render `<Cell mode="edit" />` 同 registry。
        // Cell wrapper 保持 mode="view"(SSOT preserved per codex Q6.2)。
        activeEditorRender={experimentalActiveEditorController ? (cellId) => {
          const lastColon = cellId.lastIndexOf(':')
          if (lastColon < 0) return null
          const rowId = cellId.slice(0, lastColon)
          const colId = cellId.slice(lastColon + 1)
          const colDef = table.getAllLeafColumns().find((c) => c.id === colId)
          // any-allow: free-form column meta bag
          const meta = (colDef?.columnDef as any)?.meta as Record<string, any> | undefined
          if (!meta?.type) return null
          const colType = meta.type as ColumnType
          const Cell = resolveCellComponent(colType)
          const row = table.getRowModel().rowsById[rowId]
          if (!row) return null
          const cellEditable = isCellEditable(meta, row.original)
          // Phase 7 virtualizer unmount preserve draft:portal Field value 從 lifted editingDraft 取
          // (若 user 編輯中字 → draft 持有);未編輯時 fallback row.value(全新 edit session 顯示原值)
          // 2026-05-16 Round 5 audit Dim 27 fix:narrow type 取代 `as any`
          const rowValue = (row.original as Record<string, unknown>)[colId]
          const value = editingDraft !== undefined ? editingDraft : rowValue
          // Per codex Q6.2 invariant test:nested popovers register inside editor;
          // outside-click excludes them(future ActiveEditorController 接管 lifecycle scope)。
          // 當前 MVP:reuse cell-registry Cell mode="edit" + bound onCommit/onCancel。
          //
          // Phase B2 completion(2026-05-10 per codex Q-B2):Tab → commit + next editable + auto-edit。
          //   wrap Cell in div with onKeyDownCapture intercept Tab/Shift+Tab(capture mode 先抓
          //   不被 Field 內部 keydown 攔)。direction:Tab=next / Shift+Tab=prev。
          //   findNext skip readonly / boolean / url(non-editable click types per Contract 15)。
          // Phase B3(2026-05-10 per codex Q-B3):IME composition guard。中文輸入法組字期間
          //   compositionstart event fire,組字結束後 compositionend fire。期間 keydown 的
          //   Enter / Tab / Esc 不該觸發 commit/exit/next 行為(因 user 還在組字)。
          const handleEditTab = (e: React.KeyboardEvent) => {
            // IME guard:組字中 ignore Tab(per codex Q-B3 verdict 在 controller 層,
            // 此處 portal wrapper 是最近 controller 等價層;Field 內部 input 自帶 isComposing 但
            // wrapper-level Tab handler 必須也 guard,避免 onKeyDownCapture 早於 Field input)
            // 2026-05-16 Round 5 audit Dim 27 fix:`keyCode` deprecated but still in KeyboardEvent type — no cast needed
            if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
            if (e.key !== 'Tab') return
            e.preventDefault()
            e.stopPropagation()
            const direction: 'next' | 'prev' = e.shiftKey ? 'prev' : 'next'
            const allRows = table.getRowModel().rows.map((r) => r.id)
            const allCols = table.getVisibleLeafColumns().map((c) => c.id).filter((id) => id !== SELECT_COL_ID)
            const curRowIdx = allRows.indexOf(rowId)
            const curColIdx = allCols.indexOf(colId)
            if (curRowIdx < 0 || curColIdx < 0) return
            // Step row-by-row,each step check editable + non-boolean/url
            const NON_EDIT_TYPES = ['boolean', 'url']
            let nextRowIdx = curRowIdx
            let nextColIdx = curColIdx
            const totalCells = allRows.length * allCols.length
            let safety = 0
            while (safety < totalCells) {
              safety++
              if (direction === 'next') {
                nextColIdx++
                if (nextColIdx >= allCols.length) { nextColIdx = 0; nextRowIdx++ }
                if (nextRowIdx >= allRows.length) return  // 末尾,不 wrap
              } else {
                nextColIdx--
                if (nextColIdx < 0) { nextColIdx = allCols.length - 1; nextRowIdx-- }
                if (nextRowIdx < 0) return  // 首端,不 wrap
              }
              const nextRow = table.getRowModel().rowsById[allRows[nextRowIdx]]
              const nextColDef = table.getAllLeafColumns().find((c) => c.id === allCols[nextColIdx])
              // any-allow: column meta free-form
              const nextMeta = (nextColDef?.columnDef as any)?.meta as Record<string, any> | undefined
              if (!nextMeta?.type || NON_EDIT_TYPES.includes(nextMeta.type)) continue
              // 2026-05-13:canEditCell helper(per V4 consolidation,合 editable + !disabled invariant)
              if (!nextRow || !canEditCell(nextMeta, nextRow.original)) continue
              // 找到 next editable cell → commit current + start next edit
              // 2026-07-05 D4 fix:原本只 setEditingCellId —(a)同 type 相鄰 cell React 同位
              // 重用 input DOM,blur 不 fire → onBlur commit 不觸發,剛打的 draft 整段遺失;
              // (b)editingDraft 不清 → 下一格 portal value 顯示上一格草稿(甚至把上一格 draft
              // commit 進錯的 cell)。Fix:有 draft 先 commit 當前 cell(commitCell 內已清 draft),
              // 再換格;spreadsheet selection 對齊 edit-entry canonical 清空(commitCell 的
              // selection restore 對 Tab 換格不適用 — 下一格馬上進 edit)。
              if (editingDraft !== undefined) commitCell(rowId, colId, editingDraft)
              setEditingCellId(cellEditId(allRows[nextRowIdx], allCols[nextColIdx]))
              setSelectedCellId(null)
              setRangeAnchor(null)
              setRangeFocus(null)
              return
            }
          }
          return (
            // 2026-07-05 D4 fix:key={cellId} 強制 per-cell remount — 相鄰同型欄位 Tab 過去時
            // uncontrolled Input / NumberCell localValue 原封不動(上一格的字跑到下一格)。
            // 對齊 cell-registry「mode-keyed remount canonical」(per-cell edit session 是不同 mount cycle)。
            <div key={cellId} onKeyDownCapture={handleEditTab} style={{ width: '100%', height: '100%' }}>
              <Cell
                value={value}
                meta={meta}
                mode="edit"
                size={size}
                autoRowHeight={false}  // portal MVP 單行;auto-row defer 到 Phase 5
                isEditable={cellEditable}
                onCommit={(next) => commitCell(rowId, colId, next)}
                onCommitLive={(next) => onCellCommit?.(rowId, colId, next)}
                onCancel={() => cancelCellEdit(rowId, colId)}  // 2026-07-05 D4:cancel 還原 selection(Contract 11)
                onDraft={setEditingDraft}  // Phase 7:每 keystroke 寫 draft → preserve across virtualizer unmount
              />
            </div>
          )
        } : undefined}
        // Slice D Step 4 spreadsheet semantics(2026-05-10;2026-07-14 對齊清理):
        //   selectedCellId(click 1)= solid border SelectionRing z 2
        //   range(Shift+click rectangle from anchor↔focus)= cell-bg fill via
        //     CSS `[data-range-cell]`(per Issue 1 codex verdict;layer 不畫 range 視覺,
        //     RangeOuterRing / rangeCellIds prop 已 retire)
        selectedCellId={spreadsheetMode ? selectedCellId : null}
        cellClickEntersEdit={(cellId) => {
          // 2026-05-10 codex review red light fix(per dual-track verify):
          //   1. cellId parse 用 lastIndexOf(':')(row id 可含 colon)
          //   2. type allowlist(未知 type default false,non-editable types blocked)
          //   3. row-level editable(row) function 支援(per isCellEditable canonical)
          const lastColonIdx = cellId.lastIndexOf(':')
          if (lastColonIdx < 0) return false
          const rowId = cellId.slice(0, lastColonIdx)
          const colId = cellId.slice(lastColonIdx + 1)
          const colDef = table.getAllLeafColumns().find(c => c.id === colId)
          // any-allow: column meta 是 free-form bag
          const meta = (colDef?.columnDef as any)?.meta as Record<string, any> | undefined
          if (!meta) return false
          // Allowlist editable types(per Contract 15;未知 / boolean / url / readonly default false)
          const EDITABLE_CLICK_TYPES = ['string', 'number', 'currency', 'date', 'time', 'select', 'multiSelect', 'person', 'multiPerson', 'combobox']
          if (!EDITABLE_CLICK_TYPES.includes(meta.type)) return false
          // Row-level editable(row) function support(canonical per `isCellEditable` L720)
          // 2026-05-13:canEditCell helper consolidation(per V4)
          const row = table.getRowModel().rowsById[rowId]
          if (!row) return false
          return canEditCell(meta, row.original)
        }}
      />
    </div>
  )

  // ── L4 Row drag DnD wrapper ───────────────────────────────────────────────
  // Sensors:Pointer(8px activation distance,避免 cell click 誤觸 drag)+ Keyboard(a11y)
  // v15.0 Path B:無 SortableContext — 每 row 各自 useDraggable / useDroppable;
  // 同 parent level 限制由自訂 collisionDetection 過濾 cross-parent target 成立(cross-parent over → invalidDrop)。
  // DragEnd:active.id / over.id → 算 position(active vs over 視覺位置),呼叫 onRowReorder。
  // hooks 必呼叫(rules-of-hooks)— 即使 enableRowDrag=false 也走 useSensors;wrap 才條件化。
  // **codex P1 fix(2026-05-07 v15.13)**:KeyboardSensor 不傳 `coordinateGetter`,用
  // dnd-kit 預設 25px 箭頭 stepping。`sortableKeyboardCoordinates` 是 `@dnd-kit/sortable`
  // preset,需 `<SortableContext>` 才正確 resolve 下一個 sortable target — 但 v15.0
  // path B 已 explicit 砍 SortableContext 改用 useDraggable+useDroppable(見檔頭 import 註解),
  // 此 getter 在無 context 下 keyboard nav 無法 reliable resolve target → keyboard
  // drag/reorder regression。Default getter(arrow-key Δ25px)在 useDraggable 場景是
  // dnd-kit canonical(`@dnd-kit/core/src/sensors/keyboard/defaults.ts` 預設行為)。
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )

  // **2026-05-06 v14.8 collision detection canonical(對齊 dnd-kit official best practice)**:
  // 從 closestCenter 換 `pointerWithin + rectIntersection` composite。
  // **Why**:closestCenter 永遠返回最近 droppable → over 永遠非 null → 釋放任何位置都觸發
  // onRowReorder 強制 reorder(user 報「拉動就強制 reorder 不能 snap back」)。
  // pointerWithin 要求 pointer 真在 droppable rect 內才返回 → release 在 gap 自然 over=null →
  // 不觸發 reorder → snap back 自然成立(對齊 Notion / TreeView 行為)。
  // rectIntersection fallback 給 keyboard sensor(無 pointer)。
  // 詳 .claude/references/drag-canonical.md。
  const sameParentCollisionDetection: CollisionDetection = React.useCallback((args) => {
    const activeId = args.active?.id != null ? String(args.active.id) : null
    if (!activeId) {
      const pointer = pointerWithin(args)
      return pointer.length > 0 ? pointer : rectIntersection(args)
    }
    // **v15.8 Bug 2 fix**(對齊 user「PRD-004 拉起儘管同位置放開後一定 reorder」):
    // 預設 dnd-kit `pointerWithin` 排除 active 自身,fallback `rectIntersection` 找最近
    // next row → cursor 仍在 source row 內 但 over=next row → reorder 觸發。
    // Fix:cursor 仍在 source row vertical range 內 → return [](no over → no indicator
    // → onDragEnd over=null → noop)。User 必須 cursor 真正離開 source row vertical 範圍
    // 才視為「想 reorder」,對齊 user 的「沒動就不該 reorder」直覺。
    const activeRect = args.active?.rect.current.initial
    const cursor = args.pointerCoordinates
    if (cursor && activeRect && cursor.y >= activeRect.top && cursor.y <= activeRect.bottom) {
      return []
    }
    const activeParent = parentMap.get(activeId)
    // 過濾 droppable container collection — 只保留 same parent siblings(且不含 active 本身)
    const filtered = args.droppableContainers.filter(c => {
      const cid = String(c.id)
      if (cid === activeId) return false
      const cParent = parentMap.get(cid)
      if (cParent === undefined) return false // 非 row droppable
      return cParent === activeParent
    })
    const filteredArgs = { ...args, droppableContainers: filtered }
    const pointer = pointerWithin(filteredArgs)
    if (pointer.length > 0) return pointer
    // **v15.8 fix**(virtualized list dnd-kit droppableRects stale issue):
    // virtualized rows position 由 virtualizer transform:translateY 動態套,但 dnd-kit
    // measure droppable 在 mount 瞬間(rows 還沒 transform → 全 rect at top=100)+ 不
    // re-measure(MeasuringStrategy.Always 沒效)→ stale rects → rectIntersection 永遠
    // 0 over。Fix:fallback 用 cursor.y 對 DOM querySelector 找 row whose live
    // boundingClientRect 包含 cursor.y(同 parent siblings,排除 active)。
    if (cursor) {
      // **codex P2 fix(2026-05-07)**:scope 到 active table root + 同時驗 X 邊界。
      // 之前 document-wide query + cursor.y-only match → 多 DataTable 同頁(side-by-side
      // panels with overlapping Y ranges)會把 cursor 不在當前 table 卻 Y 帶相同的 row
      // 認成 over,觸發錯誤 reorder indicator/commit。Fix:limit 到 tableRef.current 的
      // sortable rows + 同時驗 cursor 在 row's X bounds 內。
      const tableScope = tableRef.current ?? document
      const liveRows = Array.from(tableScope.querySelectorAll<HTMLElement>('[role="row"][data-sortable-row-id]'))
        .filter(el => el.dataset.sortableRowId !== activeId)
        .filter(el => {
          const cParent = parentMap.get(el.dataset.sortableRowId ?? '')
          return cParent === activeParent
        })
      for (const el of liveRows) {
        const r = el.getBoundingClientRect()
        if (
          cursor.y >= r.top && cursor.y <= r.bottom &&
          cursor.x >= r.left && cursor.x <= r.right
        ) {
          const rowId = el.dataset.sortableRowId
          const cont = filtered.find(c => String(c.id) === rowId)
          if (cont) return [{ id: cont.id, data: { droppableContainer: cont, value: 0 } }]
        }
      }
    }
    return rectIntersection(filteredArgs)
  }, [parentMap])

  // 2026-05-06 v10 DragOverlay canonical:drag start 時 snapshot source row outerHTML(strip
  // absolute / transform / opacity / data-* + reset width to natural width)→ render in
  // DragOverlay portal。Source row scroll out-of-viewport unmount 也不影響(canvas 視覺已 detach)。
  // 移除 windowed sticky range extractor — 不再需要 mount-pin source row,DragOverlay decoupled。
  // Atlassian / dnd-kit canonical:「If your useDraggable items are within a virtualized list,
  // you will absolutely want to use a drag overlay, since the original drag source can unmount
  // while dragging as the virtualized container is scrolled.」(GitHub #1674 / docs/api-documentation/draggable/drag-overlay)
  const [dragOverlayHtml, setDragOverlayHtml] = React.useState<string | null>(null)
  const [dragOverlayWidth, setDragOverlayWidth] = React.useState<number | null>(null)
  // 2026-05-06 v11:column reorder 共用 drag overlay state — `dragType` 區分 row vs column
  // **v15.9 移除 dragType state**:之前用來條件套 row drag modifier,現在三 scenario
  // 都無 modifier(SSOT 一致),drag type 只在 handler 內部用 active.data.current.type 取即可。
  const [, setActiveDragColId] = React.useState<string | null>(null)
  const handleDragStart = React.useCallback((e: { active: { id: string | number; data: { current?: { type?: 'row' | 'column'; columnId?: string } } } }) => {
    const id = String(e.active.id)
    const type = e.active.data?.current?.type ?? 'row'
    setInvalidDropActive(false)
    // v15.3:drag 啟動清掉非 source row 的 data-hovered(避免其他 row 殘留 hover bg + drag button)。
    // **保留 source row 的 hover** — 對齊 Linear / Jira「source 維持 active 視覺」world-class canonical。
    if (type === 'row') {
      tableRef.current?.querySelectorAll<HTMLElement>('[data-hovered]').forEach((el) => {
        const rowId = el.dataset.sortableRowId
        if (rowId !== id) delete el.dataset.hovered
      })
    } else {
      tableRef.current?.querySelectorAll<HTMLElement>('[data-hovered]').forEach((el) => delete el.dataset.hovered)
    }
    if (type === 'column') {
      // Column drag:snapshot header cell visual,strip transform/inline-styles
      const colId = e.active.data?.current?.columnId ?? id
      setActiveDragColId(colId)
      const headerEl = document.querySelector<HTMLElement>(`[role="columnheader"][data-column-id="${colId}"]`)
      if (headerEl) {
        const clone = headerEl.cloneNode(true) as HTMLElement
        clone.style.position = 'static'
        clone.style.transform = 'none'
        clone.style.transition = 'none'
        clone.style.opacity = '1'
        clone.style.zIndex = ''
        clone.style.width = `${headerEl.offsetWidth}px`
        // Strip resize handle clone(避免重複疊在 overlay 上)
        clone.querySelectorAll('[role="separator"][aria-orientation="vertical"]').forEach(n => n.remove())
        setDragOverlayHtml(clone.outerHTML)
        setDragOverlayWidth(headerEl.offsetWidth)
      }
    } else {
      setActiveDragId(id)
      // **v15.4 SSOT**:reconstructFullRowGhost 跨 pinned 區域(left/center/right)
      // 重組完整 row ghost,確保 cursor 在 ghost 內部維持與 mousedown 時相對位置一致
      // (對齊 user directive「ghost 跟 cursor 維持固定相對位置」+ Linear / Notion / Jira)
      const ghost = reconstructFullRowGhost(id, tableRef.current)
      if (ghost) {
        setDragOverlayHtml(ghost.html)
        setDragOverlayWidth(ghost.width)
      }
    }
  }, [])

  // SSOT helpers `isReorderNoop` + `reconstructFullRowGhost` 已搬到 `lib/drag-visual.ts`
  // —— TreeView / DataTable row / DataTable column drag 三處 consumer 共享同一 invariant。

  const handleDragOver = React.useCallback((e: { active: { id: string | number; data?: { current?: { type?: 'row' | 'column' } } }; over: { id: string | number } | null }) => {
    const { active, over } = e
    if (!active) return
    if (!over) {
      // 無 valid same-parent over → invalid drop signal(配合 v2 cross-parent visual)
      if (!invalidRef.current) setInvalidDropActive(true)
      setDropIndicator(null)
      return
    }
    if (invalidRef.current) setInvalidDropActive(false)
    if (active.id === over.id) { setDropIndicator(null); return }
    // Drop indicator(2026-05-06 v14.6 row + column 統一 SSOT pattern):
    // 用 active vs over 在 sortable items 的相對位置判 before/after。
    // (Notion canonical:source 在 target 之前 → drop after / source 在 target 之後 → drop before)
    const dragType = active.data?.current?.type ?? 'row'
    if (dragType === 'column') {
      const activeIdx = reorderableColumnIdsRef.current.indexOf(String(active.id))
      const overIdx = reorderableColumnIdsRef.current.indexOf(String(over.id))
      if (activeIdx === -1 || overIdx === -1) { setDropIndicator(null); return }
      const side: 'before' | 'after' = activeIdx < overIdx ? 'after' : 'before'
      // **v15.3 noop suppress**:drop position 等同原位 → 不顯 indicator(對齊 handleDragEnd noop guard)
      if (isReorderNoop(activeIdx, overIdx, side)) { setDropIndicator(null); return }
      setDropIndicatorIfChanged({ id: String(over.id), side, type: 'column' })
    } else {
      // Row drag — 用 allRowIds 算位置(只 same-parent siblings,跨 parent collisionDetection 已過濾)
      const activeIdx = allRowIds.indexOf(String(active.id))
      const overIdx = allRowIds.indexOf(String(over.id))
      if (activeIdx === -1 || overIdx === -1) { setDropIndicator(null); return }
      const side: 'before' | 'after' = activeIdx < overIdx ? 'after' : 'before'
      if (isReorderNoop(activeIdx, overIdx, side)) { setDropIndicator(null); return }
      setDropIndicatorIfChanged({ id: String(over.id), side, type: 'row' })
    }
  }, [allRowIds, isReorderNoop, setDropIndicatorIfChanged])

  const handleDragCancel = React.useCallback(() => {
    setActiveDragId(null)
    setActiveDragColId(null)
    setInvalidDropActive(false)
    setDragOverlayHtml(null)
    setDragOverlayWidth(null)
    setDropIndicator(null)
  }, [])

  // Reorderable column ids(non-locked,non-system) — 用 TanStack runtime visible order
  // **v14.10 fix**:之前用 columnsWithSelection 的 declaration order,user 控的 columnOrder
  // state(tableOptions.state.columnOrder)被忽略 → side('before'/'after')算錯 → drop 落
  // 在錯誤位置(user 報「Stock 移不到 Category/Price 之間」root cause)。
  // 改用 `table.getVisibleLeafColumns()` 拿 live visual order(已套 columnPinning + columnOrder)。
  const reorderableColumnIds = React.useMemo(() => {
    return table.getVisibleLeafColumns()
      .map(c => c.id)
      .filter(id => id && !isSystemColumn(id))
      .filter(id => {
        const meta = table.getColumn(id)?.columnDef.meta as { locked?: boolean } | undefined
        return !meta?.locked
      })
    // D3 dep-hygiene fix(2026-07-06):補 columnVisibility — memo 讀 table.getVisibleLeafColumns()
    // (live,受 visibility 影響)原 deps 漏列,隱藏欄位後清單 stale(隱藏欄仍在 reorderable
    // 列表 → handleDragOver 的 drop side 計算錯位)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, columnsWithSelection, tableOptions?.state?.columnOrder, columnVisibility])
  // Sync ref(handleDragOver closure 抓不到最新 reorderableColumnIds)
  React.useEffect(() => { reorderableColumnIdsRef.current = reorderableColumnIds }, [reorderableColumnIds])

  const handleDragEnd = React.useCallback((e: DragEndEvent) => {
    const { active, over } = e
    const type = (active.data?.current as { type?: 'row' | 'column' } | undefined)?.type ?? 'row'
    setActiveDragId(null)
    setActiveDragColId(null)
    setInvalidDropActive(false)
    setDragOverlayHtml(null)
    setDragOverlayWidth(null)
    setDropIndicator(null)
    if (!over || active.id === over.id) return
    const sourceId = String(active.id)
    const targetId = String(over.id)

    if (type === 'column') {
      // Column reorder:用 reorderableColumnIds 算 before/after
      const oldIdx = reorderableColumnIds.indexOf(sourceId)
      const newIdx = reorderableColumnIds.indexOf(targetId)
      if (oldIdx === -1 || newIdx === -1) return
      const position: 'before' | 'after' = oldIdx < newIdx ? 'after' : 'before'
      // **v15.3 noop guard SSOT**(共用 isReorderNoop helper)
      if (isReorderNoop(oldIdx, newIdx, position)) return
      // 2026-05-12 Q1 fix(user 抓「column 一拉起來就一定要換位置」)— Material X / AG Grid
      // column reorder canonical:cursor 必須過 next column **50% midpoint** 才換,沒過 → snap back。
      // dnd-kit 預設 over=column-under-pointer 一拉到鄰格就 reorder。加 midpoint threshold 對齊
      // 世界級 column reorder UX。對齊 row drag noop SSOT(`isReorderNoop`)+ Material X
      // `columnReorder` midpoint canonical(https://mui.com/x/react-data-grid/column-ordering/)。
      const activeRect = active.rect.current.translated ?? active.rect.current.initial
      const overRect = over.rect
      if (activeRect && overRect) {
        const ghostCenter = activeRect.left + activeRect.width / 2
        const targetCenter = overRect.left + overRect.width / 2
        // Moving right(oldIdx < newIdx):ghost 必過 target center 才換
        if (oldIdx < newIdx && ghostCenter < targetCenter) return
        // Moving left(oldIdx > newIdx):ghost 必過 target center(從右側)才換
        if (oldIdx > newIdx && ghostCenter > targetCenter) return
      }
      onColumnReorder?.(sourceId, targetId, position)
      return
    }

    // Row reorder(原邏輯)
    if (parentMap.get(sourceId) !== parentMap.get(targetId)) return
    const parentId = parentMap.get(sourceId)
    const siblings = allRowIds.filter(id => parentMap.get(id) === parentId)
    const oldIdx = siblings.indexOf(sourceId)
    const newIdx = siblings.indexOf(targetId)
    if (oldIdx === -1 || newIdx === -1) return
    const position: 'before' | 'after' = oldIdx < newIdx ? 'after' : 'before'
    if (isReorderNoop(oldIdx, newIdx, position)) return
    onRowReorder?.(sourceId, targetId, position)
  }, [allRowIds, parentMap, onRowReorder, onColumnReorder, reorderableColumnIds, isReorderNoop])

  // 2026-05-06 v11:column reorder collision detection — drag column 時 droppable filter
  // 只保留 column id(避免 over 觸發 row);drag row 走 sameParent canonical。
  // v14.8:換 pointerWithin + rectIntersection composite(對齊 dnd-kit official canonical)
  // 解 user 報「ghost 出來但 indicator 沒 / 不能 reorder」snap-back 同類問題。
  const dndCollisionDetection: CollisionDetection = React.useCallback((args) => {
    const activeData = args.active?.data?.current as { type?: 'row' | 'column' } | undefined
    if (activeData?.type === 'column') {
      const filtered = args.droppableContainers.filter(c => {
        const cData = c.data?.current as { type?: 'row' | 'column' } | undefined
        return cData?.type === 'column' && c.id !== args.active?.id
      })
      const filteredArgs = { ...args, droppableContainers: filtered }
      const pointer = pointerWithin(filteredArgs)
      return pointer.length > 0 ? pointer : rectIntersection(filteredArgs)
    }
    return sameParentCollisionDetection(args)
  }, [sameParentCollisionDetection])

  // ── L5 分頁列(2026-07-06,詳 data-table.spec.md「L5:分頁」段)────────────────
  // 間距 tight = layoutSpace spec 規則 3「跨範疇 functional 交互」;頁碼靠右(shadcn justify-end /
  // Ant Table bottomEnd / MUI / Carbon 4 家實證,左側空也靠右);「共 N 筆」數源 = filter 後全集
  // getPrePaginationRowModel(≠ selection all-mode 的 server-side 全集數 M — consumer 自持,語意不同)。
  // 2026-07-06 user 拍板:「Pagination 元件本身提供完整功能(showTotal / 每頁筆數)= SSOT,
  // Table 按一致定義套用」—— 分頁列的資訊/選單/「資訊左、操作右」layout 全部 own 在
  // <Pagination> 完整形態;DataTable 只轉發 config + own TanStack state(controlled 消費:
  // page/pageSize 狀態在本層、定義在 Pagination)。
  const totalRowCount = paginationEnabled ? table.getPrePaginationRowModel().rows.length : 0
  const paginationBar = paginationEnabled && !isEmpty ? (
    // 無條件 justify-end(2026-07-07 C16:原 paginationHasExtras 判斷式 = 平行重複 Pagination
    // 內部 hasExtras 拼寫,未來加 extra 必 drift)——完整形態 Pagination 自帶 w-full
    // justify-between,justify-end 對其為 no-op;純頁碼形態靠右 = 拍板 #6(shadcn justify-end /
    // Ant Table bottomEnd / MUI / Carbon 4 家)。ref 供 isFillHeight bodyMaxHeight 扣 bar 高(C12)。
    <div ref={paginationBarRef} className="flex justify-end">
      <Pagination
        total={totalRowCount}
        page={currentPage}
        onPageChange={setCurrentPage}
        pageSize={pageSizeState}
        onPageSizeChange={(next) => {
          setPageSizeState(next)
          paginationOpts?.onPageSizeChange?.(next)
        }}
        showTotal={paginationOpts?.showTotal}
        pageSizeOptions={paginationOpts?.pageSizeOptions}
      />
    </div>
  ) : null
  // isFillHeight 並用:外層接管高度(h-full min-h-0),tableContent 的 maxHeight cap 在內層照常生效
  const composedContent = paginationBar ? (
    <div className={cn('flex flex-col gap-[var(--layout-space-tight)]', isFillHeight && 'h-full min-h-0')}>
      {tableContent}
      {paginationBar}
    </div>
  ) : tableContent

  const wrapWithDnd = (node: React.ReactNode): React.ReactNode => {
    if (!enableRowDrag && !enableColumnReorder) return node
    return (
      <DndContext
        sensors={dndSensors}
        // **v15.8 fix**:virtualized rows mount/unmount 期間 droppable rect cache stale →
        // rectIntersection 找不到 over → indicator/reorder 不 fire。改 `Always` 每次 collision
        // detection 都 re-measure droppables(SSOT 對齊 dnd-kit virtualized list canonical)。
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        collisionDetection={dndCollisionDetection}
        // **v15.11 Ghost-cursor SSOT 復活**:
        // - `snapToCursorModifier`(drag-visual.ts):ghost top-left 永遠對齊 cursor 位置,
        //   保證「ghost 跟 cursor 維持初始 mousedown 時的相對位置」(M17 SSOT idea)。
        //   v15.7 → v15.8 撤回原因是 `rectIntersection` collision 用 transform 後的
        //   active.rect 找不到 over → 拖不動。v15.10 collision 改用 **DOM-based 直查
        //   live row rects(忽略 active.rect)**,modifier 偏移 transform 不再影響
        //   collision detection,可安全再用。
        // - 三 drag scenario(row / column / TreeView)現在都 ghost-跟-cursor 對齊,
        //   user directive「ghost-cursor SSOT」一致。
        modifiers={[snapToCursorModifier]}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        {/* v15.0 Path B:無 SortableContext(useDraggable + useDroppable 各自獨立,不需 sort context)。
            無 auto-shift visual reorder — source 留原位,indicator 顯 drop preview。 */}
        {node}
        {/* DragOverlay portal — row 跟 column 都用同一個 overlay state(dragOverlayHtml /
            dragOverlayWidth),onDragStart 依 type 截不同 source DOM 寫入 state。 */}
        <DragOverlay dropAnimation={null}>
          {dragOverlayHtml ? (
            <div
              style={{ width: dragOverlayWidth ?? undefined }}
              className="bg-surface-raised shadow-[var(--elevation-200)] rounded-md border border-border pointer-events-none"
              dangerouslySetInnerHTML={{ __html: dragOverlayHtml }}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    )
  }

  if (enabled && mode === 'single') {
    return (
      <RadioGroupPrimitive.Root
        value={selection.mode === 'include' ? (selection.ids[0] ?? '') : ''}
        onValueChange={(v) => v && setSelection({ mode: 'include', ids: [v] })}
      >
        {wrapWithDnd(composedContent)}
      </RadioGroupPrimitive.Root>
    )
  }
  return wrapWithDnd(composedContent)
}

export const DataTable = React.forwardRef(DataTableInner) as <TData>(
  props: DataTableProps<TData> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => React.ReactElement

// any-allow: generic-constrained forwardRef cannot set displayName through typed API without erasing generic
;(DataTable as any).displayName = 'DataTable'
// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const dataTableMeta = {
  component: 'DataTable',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  // 'active' 移除 — 全檔無 Tailwind 按壓 utility(rg `active:` 僅命中 dnd-kit `e.active` 物件),
  // 無按壓專屬視覺態;row action / drag handle 的按壓屬內嵌 Button meta(2026-07-07 對抗稽核補修)。
  states: ['default', 'hover', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-muted', 'bg-neutral-hover', 'bg-surface'],
    fg: ['text-fg-muted', 'text-fg-secondary', 'text-foreground'],
    ring: [],
  },
} as const

export { dataTableVariants }
