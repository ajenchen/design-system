import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/design-system/components/Avatar/avatar'
import { useRowSize } from '@/design-system/patterns/element-anatomy/item-anatomy'

/**
 * Empty — 空狀態視覺元件
 *
 * 居中垂直堆疊:icon(Avatar) → title → description → action。
 * 所有 slot 皆可選,預設只需 description。
 *
 * 間距固定,不隨 density 變（Empty 是展示性元件,不是工作區域元件）:
 *   icon → text = mb-4（16px）
 *   desc → action = mt-6（24px）
 *   title → desc = `var(--item-gap-label-desc-reading-lg)`（reading-lg tier token,item-anatomy SSOT;bare `--item-gap-label-desc` 已 retire）
 *
 * Outer padding 由 consumer 容器決定(py-12 / py-6 / py-16 等）。
 */

export interface EmptyProps extends React.HTMLAttributes<HTMLDivElement> {
  /** LucideIcon → 自動包 Avatar 48px neutral;ReactElement → 原樣渲染 */
  icon?: LucideIcon | React.ReactElement
  /** 標題(可選,font-medium,適用於首次引導) */
  title?: string
  /** 說明文字 */
  description?: string
  /** 行動按鈕(可選) */
  action?: React.ReactNode
  /**
   * Disabled context(2026-06-03 加 — FileUpload disabled 等情境消費):title / description 轉
   * `text-fg-disabled`(語意 disabled token,非 opacity)。icon glyph 也 → fg-disabled(icon 是文字一環);icon-circle bg 維持 muted。
   * 預設 false,不影響既有 consumer。
   */
  disabled?: boolean
}

const Empty = React.forwardRef<HTMLDivElement, EmptyProps>(
  ({ icon, title, description, action, disabled = false, className, ...props }, ref) => {
    // 字體 tier:讀 RowSizeContext(menu 內自動對齊 menu items 的字體）
    // 沒有 context(standalone）→ fallback 'md' → text-body (14px)
    const rowSize = useRowSize('md')
    const descFont = rowSize === 'lg' ? 'text-body-lg' : 'text-body'

    // Icon rendering: ReactElement → as-is;LucideIcon(component,包括 forwardRef 物件)→ 包 Avatar
    // 注意:Lucide v0.577+ icons 是 forwardRef 物件(`typeof === 'object'`),不是 function。
    // 必用 React.isValidElement 判斷 element vs component(typeof 會把 forwardRef 物件誤歸 object)。
    let iconElement: React.ReactNode = null
    if (icon) {
      if (React.isValidElement(icon)) {
        iconElement = icon
      } else {
        const Icon = icon as LucideIcon
        // disabled:glyph → fg-disabled([&_svg]:!… 蓋過 Avatar 內聯 color;circle bg 維持 muted)。icon 是文字一環,隨 disabled 變淡。
        iconElement = <Avatar icon={Icon} size={48} color="neutral" className={disabled ? '[&_svg]:!text-fg-disabled' : undefined} />
      }
    }

    return (
      <div
        ref={ref}
        className={cn('flex flex-col items-center text-center', className)}
        {...props}
      >
        {iconElement && (
          <div className="mb-4">{iconElement}</div>
        )}
        {title && (
          <span className={cn('text-body-lg font-medium', disabled ? 'text-fg-disabled' : 'text-foreground')}>
            {title}
          </span>
        )}
        {description && (
          <span
            className={cn(
              // 字體跟 RowSizeContext 對齊:sm/md = text-body (14px),lg = text-body-lg (16px)
              // 在 menu 內自動對齊 menu items;standalone 時 fallback text-body
              descFont,
              disabled ? 'text-fg-disabled' : (title || action) ? 'text-fg-secondary' : 'text-fg-muted',
              // Empty title 永遠 body-lg(16)→ 用 reading-lg token(label tier 決定)
              title && 'mt-[var(--item-gap-label-desc-reading-lg)]',
            )}
          >
            {description}
          </span>
        )}
        {action && (
          <div className="mt-6">{action}</div>
        )}
      </div>
    )
  },
)
Empty.displayName = 'Empty'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const emptyMeta = {
  component: 'Empty',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-muted', 'text-fg-secondary', 'text-foreground', 'text-fg-disabled'],
    ring: [],
  },
} as const

export { Empty }
