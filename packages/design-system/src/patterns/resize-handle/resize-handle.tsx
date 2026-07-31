import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * ResizeHandle — pattern primitive for drag-to-resize visual hit target(2026-05-21 v1 ship per
 * user「style 難道不用跟 data table column resize 維持 ssot」+「都照你建議做」approval)。
 *
 * ── 定位 ──
 * 統一所有 drag-resize affordance 的視覺 / cursor / 命中區。
 * Consumer 自管 drag math(TanStack column resize / Sidebar drag-resize / Aside drag-resize
 * 各有不同 width state pathway,本 primitive 不耦合)。
 *
 * Consumers(roadmap per spec.md):
 * - Phase 1(本 commit):primitive ship,DataTable / Sidebar / Aside 尚未 migrate
 * - Phase 2(future):DataTable column resize migrate(TanStack `header.getResizeHandler()` 接入)
 * - Phase 3(future):Sidebar drag-resize enable
 * - Phase 4(future):AppShell Aside drag-resize enable
 *
 * ── 實作基礎 ──
 * 視覺對齊 DataTable column resize 既有 canonical(7px 命中區 + 1px line + cursor:col-resize
 * + hover border-hover + dragging primary)。direction='vertical' 同 idiom 軸換 row-resize。
 *
 * ── 消費的 SSOT ──
 * - tokens: [--border-hover, --divider, --primary, --table-cell-py(只 DataTable consumer 用)]
 * - patterns: none(self-contained primitive)
 *
 * ── World-class 對照 ──
 * - AG Grid column resize handle(7-8px hit zone + 1px line)
 * - Material X-DataGrid `MuiDataGrid-iconSeparator`(同 visual idiom)
 * - Notion column / sidebar resize handle(同 cursor + line + hover affordance)
 * - VS Code activity bar / sidebar resize(8px hit zone + bg highlight on drag)
 * - Figma left panel resize(8px hit zone + 1px line)
 *
 * 統一共識:hit zone ≥ 7px(fingertip-friendly)/ 1px visual line(non-intrusive)/
 * hover affordance(stronger line) / drag feedback(primary highlight)。
 *
 * 本 primitive 目前只有 pointer drag visual/hit target，沒有 keyboard/value/controls contract；
 * 因此固定從 accessibility tree 隱藏，不冒充 WAI-ARIA separator/window-splitter widget。
 */
export interface ResizeHandleProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'role' | 'aria-hidden' | 'aria-label' | 'aria-orientation'> {
  /**
   * Drag 方向。`horizontal` = 拖拉左右(column resize / sidebar width);
   * `vertical` = 拖拉上下(row resize / panel height)。決定 cursor。
   */
  direction: 'horizontal' | 'vertical'
  /**
   * 命中區相對於容器位置。`end` = 右側(column right edge / sidebar right edge);
   * `start` = 左側(較少用);`vertical` direction 同邏輯:end=bottom / start=top。
   */
  position?: 'start' | 'end'
  /**
   * 是否處於拖拉中。consumer 自管(eg. `header.column.getIsResizing?.()` for TanStack /
   * `isDragging` boolean for sidebar)。primary 色 highlight feedback。
   */
  isResizing?: boolean
  /**
   * 是否禁用拖拉。consumer 透過 col / panel 的 resizable flag 決定。
   * 禁用時不 render cursor；元件所有狀態皆固定 aria-hidden。
   */
  disabled?: boolean
  /**
   * 是否畫 visual line(1px divider)。`false` = consumer 已 paint(eg. DataTable panel
   * boundary col by panel-r 接管,不重複)。Default `true`。
   */
  showLine?: boolean
  /**
   * Vertical line `top` / `bottom` inset(只 direction='horizontal' 用)。Default 0
   * (full-height line)。DataTable 用 `var(--table-cell-py)` 縮到 cell padding 內(cell-fit line)。
   */
  lineInsetStart?: string
  /** 同上 inset 對位(bottom)。 */
  lineInsetEnd?: string
}

/**
 * Primitive consumer pattern:
 *
 * ```tsx
 * // DataTable column resize(future Phase 2 migrate sample)
 * <ResizeHandle
 *   direction="horizontal"
 *   position="end"
 *   isResizing={header.column.getIsResizing?.()}
 *   disabled={!isResizable}
 *   onPointerDownCapture={(e) => {
 *     e.stopPropagation()
 *     header.getResizeHandler?.()(e.nativeEvent)
 *   }}
 *   lineInsetStart="var(--table-cell-py)"
 *   lineInsetEnd="var(--table-cell-py)"
 * />
 *
 * // Sidebar drag-resize(future Phase 3 sample)
 * <ResizeHandle
 *   direction="horizontal"
 *   position="end"
 *   isResizing={isDragging}
 *   onPointerDown={startDrag}
 * />
 * ```
 */
export const ResizeHandle = React.forwardRef<HTMLSpanElement, ResizeHandleProps>(
  (
    {
      direction,
      position = 'end',
      isResizing,
      disabled,
      showLine = true,
      lineInsetStart,
      lineInsetEnd,
      className,
      ...props
    },
    ref,
  ) => {
    const isHorizontal = direction === 'horizontal'

    // 命中區用 inline style 而非 Tailwind arbitrary values(避免 Tailwind v4 JIT 對新增 arbitrary
    // class 在 dev mode 不更新 stylesheet 的 quirk;7px 是 primitive constant 非 token,inline 妥當)。
    const hitZoneStyle: React.CSSProperties = isHorizontal
      ? {
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: 7,
          ...(position === 'end' ? { right: 0, marginRight: -3 } : { left: 0, marginLeft: -3 }),
          cursor: disabled ? undefined : 'col-resize',
        }
      : {
          position: 'absolute',
          left: 0,
          right: 0,
          height: 7,
          ...(position === 'end' ? { bottom: 0, marginBottom: -3 } : { top: 0, marginTop: -3 }),
          cursor: disabled ? undefined : 'row-resize',
        }

    // Visual line — 1px,position 端對齊。dragging=primary / hover=border-hover / idle=divider
    const lineColorClass = isResizing
      ? 'bg-primary'
      : disabled
        ? 'bg-divider'
        : 'bg-divider group-hover/resize:bg-[var(--border-hover)]'

    const lineStyle: React.CSSProperties = isHorizontal
      ? {
          position: 'absolute',
          width: 1,
          top: lineInsetStart ?? 0,
          bottom: lineInsetEnd ?? 0,
          ...(position === 'end' ? { right: 3 } : { left: 3 }),
        }
      : {
          position: 'absolute',
          height: 1,
          left: lineInsetStart ?? 0,
          right: lineInsetEnd ?? 0,
          ...(position === 'end' ? { bottom: 3 } : { top: 3 }),
        }

    const { style: extraStyle, ...restProps } = props
    return (
      <span
        ref={ref}
        {...restProps}
        aria-hidden="true"
        style={{ ...hitZoneStyle, ...extraStyle }}
        className={cn('group/resize', !disabled && 'select-none', className)}
      >
        {showLine && (
          <span
            aria-hidden
            className={cn('transition-colors', lineColorClass)}
            style={lineStyle}
          />
        )}
      </span>
    )
  },
)
ResizeHandle.displayName = 'ResizeHandle'
