import * as React from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'
import { Tag } from '@/design-system/components/Tag/tag'

// ── OverflowIndicator ───────────────────────────────────────────────────────
// 溢出指示器：+N 觸發器 + tooltip 顯示隱藏內容。
//
// 兩種 shape：
//   circle — avatar 堆疊溢出（rounded-full）
//   tag    — tag 溢出（用 Tag component，與 Tag 外觀一致）
//
// Tooltip 用 flex-wrap 排列，JS 量測後收縮寬度到最寬行。

const triggerSize: Record<string, string> = {
  sm: 'h-5 min-w-5',
  md: 'h-6 min-w-6',
  lg: 'h-6 min-w-6',
}

const triggerText: Record<string, string> = {
  sm: 'text-[10px]',
  md: 'text-caption',
  lg: 'text-caption',
}

export interface OverflowIndicatorProps {
  /** 溢出數量 */
  count: number
  /** 觸發器外觀：circle = avatar 溢出，tag = tag 溢出 */
  shape?: 'circle' | 'tag'
  /** 尺寸，與 Tag/Avatar 高度對齊 */
  size?: 'sm' | 'md' | 'lg'
  /** tooltip 內容（通常是 Tag 列表） */
  children: React.ReactNode
  /** 額外 className（套用在 +N 觸發器上） */
  className?: string
}

// ── Shrink-wrap hook ────────────────────────────────────────────────────────
// flex-wrap + fit-content 無法 shrink（CSS 規格限制）。
// 先以 max-width 渲染讓 flex-wrap 自然換行，再量測每行實際寬度，
// 將容器 max-width 收縮到最寬行 + padding。

function useShrinkWrap(ref: React.RefObject<HTMLDivElement | null>) {
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    // 重置，讓 flex-wrap 以原始 max-width 計算
    el.style.maxWidth = ''

    const cs = getComputedStyle(el)
    const padL = parseFloat(cs.paddingLeft) || 0
    const padR = parseFloat(cs.paddingRight) || 0
    const available = el.clientWidth - padL - padR

    const children = Array.from(el.querySelector('[data-overflow-list]')?.children ?? []) as HTMLElement[]
    if (children.length === 0) return

    const gap = parseFloat(getComputedStyle(el.querySelector('[data-overflow-list]')!).gap) || 0

    let currentRow = 0
    let maxRow = 0

    children.forEach((child, i) => {
      const w = child.offsetWidth
      const next = currentRow + (i > 0 && currentRow > 0 ? gap : 0) + w

      if (next > available && currentRow > 0) {
        maxRow = Math.max(maxRow, currentRow)
        currentRow = w
      } else {
        currentRow = next
      }
    })
    maxRow = Math.max(maxRow, currentRow)

    el.style.maxWidth = `${Math.ceil(maxRow) + padL + padR}px`
  })
}

function OverflowIndicator({ count, shape = 'circle', size = 'md', children, className }: OverflowIndicatorProps) {
  const contentRef = React.useRef<HTMLDivElement>(null)
  useShrinkWrap(contentRef)

  if (count <= 0) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {shape === 'tag' ? (
          <Tag variant="neutral" size={size} className={cn('cursor-default', className)}>
            +{count}
          </Tag>
        ) : (
          <span
            className={cn(
              'shrink-0 rounded-full inline-grid place-content-center',
              'bg-muted text-foreground font-medium leading-none cursor-default',
              triggerSize[size],
              triggerText[size],
              className,
            )}
          >
            +{count}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent ref={contentRef} className="px-2 py-2">
        <div data-overflow-list className="flex flex-wrap gap-1">{children}</div>
      </TooltipContent>
    </Tooltip>
  )
}
OverflowIndicator.displayName = 'OverflowIndicator'

export { OverflowIndicator }
