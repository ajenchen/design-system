import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * ResizeHandle — drag-to-resize **完整 window-splitter widget**(2026-05-21 v1 視覺 primitive;
 * 2026-09-02 v2 升級為 value-driven:user directive「若雙方使用全然一致,務必變成同一個元件確保 SSOT」)。
 *
 * ── 定位 ──
 * 統一 DataTable 欄寬 / AgentPanel 面板寬(未來 Sidebar / Aside)的命中區、cursor、視覺 line、
 * pointer 拖拉、鍵盤(←/→ 或 ↑/↓、Home/End)與 ARIA `separator` 契約。consumer 只持有尺寸 state,
 * 把 `value / min / max` 交進來,接 `onValueChange`(拖拉中 live + 鍵盤每步)/ `onValueCommit`(放開)。
 *
 * ── 消費的 SSOT ──
 * - tokens: [--border-hover, --divider, --primary, --ring, --table-cell-py(只 DataTable consumer 用)]
 * - 幾何:7px 命中區(-3 外推)/ 1px line 距外緣 3px — 抽自 DataTable v11 既有 canonical
 * - a11y:WAI-ARIA window splitter(role=separator + aria-valuenow/min/max/valuetext + 方向鍵/Home/End)
 *
 * ── World-class 對照 ──
 * - AG Grid column resize handle(7-8px hit zone + 1px line)
 * - Material X-DataGrid MuiDataGrid-iconSeparator(同 visual idiom)
 * - VS Code sidebar sash(8px hit zone + drag 高亮;鍵盤走 view 命令)
 * - react-resizable-panels PanelResizeHandle(role=separator + 鍵盤 step)
 * - APG Window Splitter:Left/Right Arrow 移動垂直 splitter、Home/End 到極限
 *
 * 方向語意:`position` 決定把手貼哪一緣,拖拉 delta 與方向鍵正負隨之——「箭頭往哪、邊緣就往哪」:
 * `end`(右緣/下緣)→ 往右/下 = 變大;`start`(左緣/上緣)→ 往左/上 = 變大。
 */
export interface ResizeHandleProps
  extends Omit<
    React.HTMLAttributes<HTMLSpanElement>,
    | 'role' | 'tabIndex' | 'aria-hidden' | 'aria-label' | 'aria-orientation'
    | 'aria-valuenow' | 'aria-valuemin' | 'aria-valuemax' | 'aria-valuetext' | 'onKeyDown'
  > {
  /** 拖拉方向:`horizontal` = 左右(欄寬 / 面板寬);`vertical` = 上下(列高 / 面板高)。 */
  direction: 'horizontal' | 'vertical'
  /** 把手貼哪一緣:`end` = 右 / 下(欄寬、sidebar 右緣);`start` = 左 / 上(右側面板左緣)。 */
  position?: 'start' | 'end'
  /** 目前尺寸 px(consumer 持有)。 */
  value: number
  /** 下限 px。 */
  min: number
  /** 上限 px;省略 = 無上限(不輸出 aria-valuemax、End 停用)。 */
  max?: number
  /** 鍵盤每步 px;預設 16。 */
  step?: number
  /** 無障礙名稱(APG:separator 必有 aria-label 或 aria-labelledby)。 */
  ariaLabel: string
  /** 指向被調整的 pane id(APG 建議;欄寬場景可省)。 */
  ariaControls?: string
  /** 停用:只畫線,無 role / tabIndex / cursor / 拖拉(DataTable「不可拖但要線」分支)。 */
  disabled?: boolean
  /** 是否畫 1px line;`false` = consumer 已自己畫線(eg. DataTable 面板邊界欄)。預設 true。 */
  showLine?: boolean
  /** line 起點 inset(horizontal 為 top / vertical 為 left);DataTable 用 `var(--table-cell-py)`。 */
  lineInsetStart?: string
  /** line 終點 inset(bottom / right)。 */
  lineInsetEnd?: string
  /** 拖拉中每次移動 + 鍵盤每步(live)。 */
  onValueChange: (next: number) => void
  /** 放開(pointerup / pointercancel)一次;鍵盤每步亦視為 commit。 */
  onValueCommit?: (final: number) => void
}

const DEFAULT_STEP = 16
const HIT_ZONE = 7
const HIT_OUTSET = 3

export const ResizeHandle = React.forwardRef<HTMLSpanElement, ResizeHandleProps>(
  (
    {
      direction,
      position = 'end',
      value,
      min,
      max,
      step = DEFAULT_STEP,
      ariaLabel,
      ariaControls,
      disabled,
      showLine = true,
      lineInsetStart,
      lineInsetEnd,
      onValueChange,
      onValueCommit,
      className,
      style: extraStyle,
      onPointerDownCapture,
      ...restProps
    },
    ref,
  ) => {
    const isHorizontal = direction === 'horizontal'
    const sign = position === 'end' ? 1 : -1
    const [dragging, setDragging] = React.useState(false)
    const dragRef = React.useRef<{ start: number; startValue: number; pointerId: number } | null>(null)
    const latest = React.useRef({ value, min, max, onValueChange, onValueCommit })
    latest.current = { value, min, max, onValueChange, onValueCommit }

    const clamp = React.useCallback((next: number) => {
      const upper = latest.current.max
      return Math.max(latest.current.min, upper == null ? next : Math.min(upper, next))
    }, [])

    const handlePointerDownCapture = (e: React.PointerEvent<HTMLSpanElement>) => {
      onPointerDownCapture?.(e)
      if (disabled || e.button !== 0) return
      // capture + stopPropagation:不讓 dnd-kit 欄位拖曳搶到 pointerdown(DataTable);preventDefault:防選字/捲動。
      e.stopPropagation()
      e.preventDefault()
      const target = e.currentTarget
      dragRef.current = { start: isHorizontal ? e.clientX : e.clientY, startValue: latest.current.value, pointerId: e.pointerId }
      try {
        target.setPointerCapture(e.pointerId)
      } catch {
        /* 舊瀏覽器無 pointer capture:仍靠 window 事件 */
      }
      setDragging(true)
      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current
        if (!drag || ev.pointerId !== drag.pointerId) return
        const current = isHorizontal ? ev.clientX : ev.clientY
        latest.current.onValueChange(clamp(drag.startValue + (current - drag.start) * sign))
      }
      const finish = (ev: PointerEvent) => {
        const drag = dragRef.current
        if (!drag || ev.pointerId !== drag.pointerId) return
        dragRef.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', finish)
        try {
          target.releasePointerCapture(ev.pointerId)
        } catch {
          /* noop */
        }
        setDragging(false)
        const current = isHorizontal ? ev.clientX : ev.clientY
        const final = clamp(drag.startValue + (current - drag.start) * sign)
        latest.current.onValueChange(final)
        latest.current.onValueCommit?.(final)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', finish)
      window.addEventListener('pointercancel', finish)
    }

    const onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (disabled) return
      const decrease = isHorizontal ? 'ArrowLeft' : 'ArrowUp'
      const increase = isHorizontal ? 'ArrowRight' : 'ArrowDown'
      let next: number | null = null
      // 「箭頭往哪、邊緣就往哪」:end 把手 → 往右/下 = 變大;start 把手 → 往左/上 = 變大。
      if (e.key === decrease) next = clamp(value - step * sign)
      else if (e.key === increase) next = clamp(value + step * sign)
      else if (e.key === 'Home') next = min
      else if (e.key === 'End' && max != null) next = max
      if (next == null) return
      e.preventDefault()
      e.stopPropagation()
      onValueChange(next)
      onValueCommit?.(next)
    }

    // 命中區用 inline style(7px 是 primitive constant 非 token;避免 Tailwind v4 arbitrary class dev quirk)。
    const hitZoneStyle: React.CSSProperties = isHorizontal
      ? {
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: HIT_ZONE,
          ...(position === 'end' ? { right: 0, marginRight: -HIT_OUTSET } : { left: 0, marginLeft: -HIT_OUTSET }),
          cursor: disabled ? undefined : 'col-resize',
          touchAction: disabled ? undefined : 'none',
        }
      : {
          position: 'absolute',
          left: 0,
          right: 0,
          height: HIT_ZONE,
          ...(position === 'end' ? { bottom: 0, marginBottom: -HIT_OUTSET } : { top: 0, marginTop: -HIT_OUTSET }),
          cursor: disabled ? undefined : 'row-resize',
          touchAction: disabled ? undefined : 'none',
        }

    // 1px line:idle divider / hover border-hover / dragging primary(disabled 恆 divider)。
    const lineColorClass = dragging
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
          ...(position === 'end' ? { right: HIT_OUTSET } : { left: HIT_OUTSET }),
        }
      : {
          position: 'absolute',
          height: 1,
          left: lineInsetStart ?? 0,
          right: lineInsetEnd ?? 0,
          ...(position === 'end' ? { bottom: HIT_OUTSET } : { top: HIT_OUTSET }),
        }

    return (
      <span
        ref={ref}
        {...restProps}
        role={disabled ? undefined : 'separator'}
        aria-orientation={disabled ? undefined : isHorizontal ? 'vertical' : 'horizontal'}
        aria-label={disabled ? undefined : ariaLabel}
        aria-controls={disabled ? undefined : ariaControls}
        aria-valuenow={disabled ? undefined : Math.round(value)}
        aria-valuemin={disabled ? undefined : min}
        aria-valuemax={disabled || max == null ? undefined : max}
        aria-valuetext={disabled ? undefined : `${Math.round(value)}px`}
        aria-hidden={disabled ? true : undefined}
        tabIndex={disabled ? undefined : 0}
        data-resizing={dragging ? '' : undefined}
        onPointerDownCapture={handlePointerDownCapture}
        onKeyDown={onKeyDown}
        style={{ ...hitZoneStyle, ...extraStyle }}
        className={cn(
          'group/resize',
          !disabled && 'select-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
          className,
        )}
      >
        {showLine && <span aria-hidden className={cn('transition-colors', lineColorClass)} style={lineStyle} />}
      </span>
    )
  },
)
ResizeHandle.displayName = 'ResizeHandle'
