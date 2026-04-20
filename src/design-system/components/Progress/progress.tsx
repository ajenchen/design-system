import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { CircleCheck, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Progress — 水平進度條(determinate)
 *
 * 世界級對照:Material `LinearProgress` / Ant `Progress` / Polaris `Progress` /
 * shadcn `Progress`(皆為 Radix Progress primitive 的包裝)。
 *
 * ── 與 Spinner 的分界 ──
 * Spinner = indeterminate(不知時長,只表「在執行」)
 * Progress = determinate(0-100% 已知量化)
 * 兩者視覺與語意都不同,consumer 依「是否有進度可量化」擇一。
 *
 * ── 3 狀態 × 3 size ──
 * status: inProgress(進行中藍) / success(完成綠) / error(失敗紅)
 *   ^ 命名理由:`status` 是 lifecycle(在途 / 終態),不是視覺 emphasis 階。前身
 *   `primary` 會撞 Button `variant="primary"`(emphasis 最高階),改用世界級
 *   lifecycle 慣例(Polaris `inProgress` / Ant Progress `active`)。
 * size:   sm=2px / md=4px / lg=6px(track 高度;bar fill 等高)
 *
 * ── affix(右側附加) ──
 * `affix="value"` → 顯示 `{value}%` 文字
 * `affix="status-icon"` → 顯示狀態 icon(success ✓ / error ✗;inProgress 時無 icon)
 * `affix={<custom />}` → consumer 客製
 * 不傳 → 純 bar
 */

const TRACK_H = { sm: 2, md: 4, lg: 6 } as const
const STATUS_FILL = {
  inProgress: 'bg-primary',
  success: 'bg-success',
  error: 'bg-error',
} as const
const STATUS_ICON = {
  success: { Icon: CircleCheck, className: 'text-success' },
  error:   { Icon: XCircle,     className: 'text-error' },
} as const

export interface ProgressProps extends Omit<React.ComponentProps<typeof ProgressPrimitive.Root>, 'value'> {
  /** 當前進度 0-100 */
  value: number
  /** 狀態色(lifecycle,非 emphasis 階) */
  status?: 'inProgress' | 'success' | 'error'
  /** bar 高度:sm=2 / md=4 / lg=6 */
  size?: 'sm' | 'md' | 'lg'
  /** 右側附加 */
  affix?: 'value' | 'status-icon' | React.ReactNode
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      value,
      status = 'inProgress',
      size = 'md',
      affix,
      className,
      ...props
    },
    ref,
  ) => {
    const clampedValue = Math.max(0, Math.min(100, value))
    const fillColor = STATUS_FILL[status]
    const trackH = TRACK_H[size]

    // Affix 渲染
    let affixNode: React.ReactNode = null
    if (affix === 'value') {
      affixNode = (
        <span className="text-caption text-foreground tabular-nums shrink-0">
          {Math.round(clampedValue)}%
        </span>
      )
    } else if (affix === 'status-icon') {
      const s = status !== 'inProgress' ? STATUS_ICON[status] : null
      if (s) affixNode = <s.Icon size={16} className={cn('shrink-0', s.className)} aria-hidden />
    } else if (React.isValidElement(affix) || typeof affix === 'string' || typeof affix === 'number') {
      affixNode = affix
    }

    const bar = (
      <ProgressPrimitive.Root
        ref={ref}
        value={clampedValue}
        max={100}
        className={cn(
          'relative overflow-hidden rounded-full bg-secondary w-full',
          className,
        )}
        style={{ height: trackH }}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn('h-full rounded-full transition-all duration-300', fillColor)}
          style={{ width: `${clampedValue}%` }}
        />
      </ProgressPrimitive.Root>
    )

    if (!affixNode) return bar

    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 min-w-0">{bar}</div>
        {affixNode}
      </div>
    )
  },
)
Progress.displayName = 'Progress'

export { Progress }
