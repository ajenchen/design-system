import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * DescriptionList — 唯讀 label + value 展示
 *
 * HTML 語義：dl + dt + dd（跟 Atlassian、Shopify Polaris 對齊）。
 *
 * ── Typography（閱讀模式）──
 * label (dt): text-body (14px) text-fg-secondary (neutral-8)
 * value (dd): text-body (14px) text-foreground (neutral-9)
 * 兩者都是 14px × 1.5 行高——層級靠色彩區分，不靠字體大小。
 *
 * ── 間距 ──
 * label → value（同 item 內）: mt-0.5 (2px)
 * items 之間垂直 gap: layout-space-tight（density-aware）
 * columns 之間水平 gap: gap-x-4 (16px)
 */

export interface DescriptionListProps extends React.HTMLAttributes<HTMLDListElement> {
  /** grid 欄數，預設 1 */
  cols?: 1 | 2 | 3
}

const colsClass: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
}

const DescriptionList = React.forwardRef<HTMLDListElement, DescriptionListProps>(
  ({ cols = 1, className, ...props }, ref) => (
    <dl
      ref={ref}
      className={cn('grid gap-x-4 gap-y-[var(--layout-space-tight)]', colsClass[cols], className)}
      {...props}
    />
  ),
)
DescriptionList.displayName = 'DescriptionList'

export interface DescriptionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  children: React.ReactNode
}

const DescriptionItem = React.forwardRef<HTMLDivElement, DescriptionItemProps>(
  ({ label, children, className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col', className)} {...props}>
      <dt className="text-body text-fg-secondary">{label}</dt>
      <dd className="text-body mt-0.5">{children}</dd>
    </div>
  ),
)
DescriptionItem.displayName = 'DescriptionItem'

export { DescriptionList, DescriptionItem }
