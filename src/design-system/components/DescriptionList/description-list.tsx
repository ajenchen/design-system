// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * DescriptionList — 唯讀 label + value 展示
 *
 * HTML 語義：dl + dt + dd（跟 Atlassian、Shopify Polaris 對齊）。
 *
 * ── Typography（兩個方向都一致）──
 * label (dt): text-body (14px) text-fg-secondary (neutral-8)
 * value (dd): text-body (14px) text-foreground (neutral-9)
 * 兩者都是 14px × 1.5 行高——層級靠色彩區分，不靠字體大小。
 *
 * ── direction（2026-04-20 新增）──
 * vertical（預設）：label 在上 / value 在下，適合長 value（地址、bio、說明段落）、
 *                   form-like 資訊展示
 * horizontal     ：label 左 / value 右對齊，適合短 value 的 metadata 列
 *                   （檔案資訊、訂單詳情、settings summary）— Google Drive /
 *                   Notion file info panel 模式
 *
 * ── divided（horizontal 專用，預設 false）──
 * 每個 item 下方加 `border-b border-divider`，rows 視覺對齊。長列表、key 長度
 * 不一時需要對齊格線才易讀 → 開 divided；短列表（< 4 rows）不需要。
 *
 * ── 間距 ──
 * vertical: label → value（同 item 內）: `var(--item-gap-label-desc)` token（預設 2px,item-anatomy SSOT）
 * horizontal: label ↔ value: gap-x-4（16px）最小間距
 * items 之間垂直 gap: layout-space-tight（density-aware）
 * divided horizontal 模式：每 item py-[var(--layout-space-tight)]（cell-like row 高度）
 */

export type DescriptionDirection = 'vertical' | 'horizontal'

interface DescriptionContextValue {
  direction: DescriptionDirection
  divided: boolean
}

const DescriptionContext = React.createContext<DescriptionContextValue>({
  direction: 'vertical',
  divided: false,
})

export interface DescriptionListProps extends React.HTMLAttributes<HTMLDListElement> {
  /** grid 欄數（vertical 才生效；horizontal 永遠單欄），預設 1 */
  cols?: 1 | 2 | 3
  /** 項目排列方向，預設 vertical（label 在上 / value 在下） */
  direction?: DescriptionDirection
  /**
   * horizontal 模式下每個 item 下方加分隔線以對齊 rows。預設 false。
   * 短列表（< 4 rows）不需要；檔案 metadata 等長列表、key 長度不一時建議開。
   */
  divided?: boolean
}

const colsClass: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
}

const DescriptionList = React.forwardRef<HTMLDListElement, DescriptionListProps>(
  ({ cols = 1, direction = 'vertical', divided = false, className, ...props }, ref) => {
    const isHorizontal = direction === 'horizontal'
    // Memoize provider value(2026-04-22 D3 perf audit):避免每 render 重建 2-field object
    const ctxValue = React.useMemo(() => ({ direction, divided }), [direction, divided])
    return (
      <DescriptionContext.Provider value={ctxValue}>
        <dl
          ref={ref}
          className={cn(
            isHorizontal
              ? 'flex flex-col'
              : cn('grid gap-x-4 gap-y-[var(--layout-space-tight)]', colsClass[cols]),
            className,
          )}
          {...props}
        />
      </DescriptionContext.Provider>
    )
  },
)
DescriptionList.displayName = 'DescriptionList'

export interface DescriptionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  children: React.ReactNode
}

const DescriptionItem = React.forwardRef<HTMLDivElement, DescriptionItemProps>(
  ({ label, children, className, ...props }, ref) => {
    const { direction, divided } = React.useContext(DescriptionContext)
    if (direction === 'horizontal') {
      return (
        <div
          ref={ref}
          className={cn(
            'flex items-baseline justify-between gap-4',
            divided
              ? 'py-[var(--layout-space-tight)] border-b border-divider last:border-b-0'
              : 'mb-[var(--layout-space-tight)] last:mb-0',
            className,
          )}
          {...props}
        >
          <dt className="text-body text-fg-secondary shrink-0">{label}</dt>
          <dd className="text-body text-foreground text-right break-all min-w-0">{children}</dd>
        </div>
      )
    }
    return (
      <div ref={ref} className={cn('flex flex-col', className)} {...props}>
        <dt className="text-body text-fg-secondary">{label}</dt>
        <dd className="text-body mt-[var(--item-gap-label-desc-reading)]">{children}</dd>
      </div>
    )
  },
)
DescriptionItem.displayName = 'DescriptionItem'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const descriptionListMeta = {
  component: 'DescriptionList',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-secondary', 'text-foreground'],
    ring: [],
  },
} as const

export { DescriptionList, DescriptionItem }
