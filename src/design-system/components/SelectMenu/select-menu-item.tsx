import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'

/**
 * SelectMenuItem — Select Menu 的選項元件
 *
 * ── 結構 ──
 *   [checkbox?]  [startIcon? | avatar?]  [label + description?]
 *
 * ── Prefix 對齊規則（24px 閾值）──
 *   prefix ≤ 24px  → h-[1lh]，對齊第一行 label
 *   prefix > 24px  → h-[calc(1lh+2px+desc_1lh)]，對齊文字區塊
 *   無 description → prefix 上限 24px
 *
 * ── Size ──
 *   sm / md / lg — 單行高度對齊 field-height token
 */

// ── Icon tier（與 Button 共用） ──
const ICON_SIZE: Record<string, number> = { sm: 16, md: 16, lg: 20 }
const CHECKBOX_SIZE: Record<string, 'sm' | 'md' | 'lg'> = { sm: 'sm', md: 'md', lg: 'lg' }

// ── Avatar 容器尺寸 ──
// inline (≤ 24px)：對齊 Tag 高度
// block (> 24px)：floor₈(1lh + 2px + desc_1lh)
const AVATAR_SIZE = {
  inline: { sm: 20, md: 24, lg: 24 },
  block:  { sm: 32, md: 32, lg: 40 },
} as const

// ── Item variants ──
const menuItemVariants = cva(
  [
    'flex items-start gap-2 px-3 w-full',
    'cursor-pointer select-none',
    'transition-colors duration-150',
    'outline-none',
    'focus-visible:bg-neutral-hover',
  ],
  {
    variants: {
      size: {
        sm: 'text-body leading-compact py-[calc((var(--field-height-sm)-1lh)/2)]',
        md: 'text-body leading-compact py-[calc((var(--field-height-md)-1lh)/2)]',
        lg: 'text-body-lg leading-compact py-[calc((var(--field-height-lg)-1lh)/2)]',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

// ── Prefix alignment container ──
// inline：h-[1lh]，對齊第一行 label
// block：h-[calc(1lh + 2px + desc_1lh)]，對齊 label + description 文字塊
const prefixAlignVariants = cva(
  'flex items-center gap-2 shrink-0',
  {
    variants: {
      align: {
        inline: 'h-[1lh]',
        // sm/md desc = text-caption (12px * 1.3 = 15.6px)
        // lg desc = text-body leading-compact (14px * 1.3 = 18.2px)
        'block-sm': 'h-[calc(1lh+2px+var(--font-caption-size)*1.3)]',
        'block-md': 'h-[calc(1lh+2px+var(--font-caption-size)*1.3)]',
        'block-lg': 'h-[calc(1lh+2px+var(--font-body-size)*1.3)]',
      },
    },
    defaultVariants: {
      align: 'inline',
    },
  }
)

// ── Avatar container sizes (Tailwind classes) ──
const avatarSizeClasses: Record<number, string> = {
  20: 'w-5 h-5',
  24: 'w-6 h-6',
  32: 'w-8 h-8',
  40: 'w-10 h-10',
}

// ── Component ──

export interface SelectMenuItemProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
    VariantProps<typeof menuItemVariants> {
  /** Label 文字 */
  children: React.ReactNode
  /** 次要說明文字，顯示在 label 下方 */
  description?: React.ReactNode
  /** 左側 icon（LucideIcon），與 avatar 互斥 */
  startIcon?: LucideIcon
  /** 左側頭像/視覺元素（ReactNode），與 startIcon 互斥 */
  avatar?: React.ReactNode
  /** 顯示 checkbox（多選模式由父層控制） */
  checkbox?: boolean
  /** Checkbox 選中狀態 */
  checked?: boolean | 'indeterminate'
  /** 單選選中（bg-neutral-active 背景高亮） */
  selected?: boolean
  /** 後綴 Tag（ReactNode），靠右對齊 */
  tag?: React.ReactNode
  /** 後綴自訂內容（ReactNode），用於 DropdownMenu 的 badge/endIcon/shortcut 等 */
  endContent?: React.ReactNode
  /** 停用 */
  disabled?: boolean
  /** 作為群組標題（不可選，font-medium，fg-muted） */
  header?: boolean
}

const SelectMenuItem = React.forwardRef<HTMLDivElement, SelectMenuItemProps>(
  (
    {
      children,
      description,
      startIcon: StartIcon,
      avatar,
      checkbox,
      checked,
      selected,
      tag,
      endContent,
      disabled,
      header,
      size,
      className,
      ...props
    },
    ref
  ) => {
    const sizeKey = size ?? 'md'
    const iconPx = ICON_SIZE[sizeKey]

    // ── 決定 avatar 容器尺寸 + 對齊模式 ──
    // 有 description → 使用 block 尺寸（32/40px），block 對齊
    // 無 description → 使用 inline 尺寸（20/24px），inline 對齊
    const avatarPx = avatar
      ? (description ? AVATAR_SIZE.block[sizeKey] : AVATAR_SIZE.inline[sizeKey])
      : 0
    const isBlockAlign = avatarPx > 24 && !!description

    const prefixAlign = isBlockAlign
      ? (`block-${sizeKey}` as const)
      : 'inline'

    const hasPrefix = !!StartIcon || !!avatar || checkbox

    // ── Header variant ──
    if (header) {
      return (
        <div
          ref={ref}
          className={cn(
            menuItemVariants({ size }),
            'font-medium text-fg-muted cursor-default pointer-events-none',
            className,
          )}
          role="presentation"
          {...props}
        >
          {children}
        </div>
      )
    }

    return (
      <div
        ref={ref}
        role="option"
        aria-selected={selected || (checked === true) || undefined}
        aria-disabled={disabled || undefined}
        data-selected={selected ? '' : undefined}
        data-disabled={disabled ? '' : undefined}
        className={cn(
          menuItemVariants({ size }),
          !disabled && !selected && 'hover:bg-neutral-hover',
          !disabled && selected && 'bg-neutral-active',
          disabled && 'pointer-events-none text-fg-disabled cursor-default',
          className,
        )}
        {...props}
      >
        {/* Prefix 對齊容器 */}
        {hasPrefix && (
          <div className={cn(prefixAlignVariants({ align: prefixAlign }))}>
            {checkbox && (
              <Checkbox
                size={CHECKBOX_SIZE[sizeKey]}
                checked={checked === true ? true : checked === 'indeterminate' ? 'indeterminate' : false}
                disabled={disabled}
                tabIndex={-1}
                className="pointer-events-none"
              />
            )}
            {StartIcon && (
              <StartIcon
                size={iconPx}
                className={cn('shrink-0', disabled && 'text-fg-disabled')}
                aria-hidden
              />
            )}
            {avatar && (
              <div
                className={cn(
                  'shrink-0 rounded-full overflow-hidden',
                  avatarSizeClasses[avatarPx],
                )}
              >
                {avatar}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex flex-col min-w-0 flex-1">
          <span className={cn(
            'truncate',
            disabled && 'text-fg-disabled',
          )}>
            {children}
          </span>
          {description && (
            <span className={cn(
              'mt-0.5',
              sizeKey === 'lg' ? 'text-body leading-compact' : 'text-caption',
              disabled ? 'text-fg-disabled' : 'text-fg-secondary',
            )}>
              {description}
            </span>
          )}
        </div>

        {/* Suffix：tag / endContent，靠右對齊，跟 prefix 同對齊高度 */}
        {(tag || endContent) && (
          <div className={cn(prefixAlignVariants({ align: prefixAlign }), 'ml-auto gap-2')}>
            {tag}
            {endContent}
          </div>
        )}
      </div>
    )
  }
)
SelectMenuItem.displayName = 'SelectMenuItem'

// ── Group ──

export interface SelectMenuGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

const SelectMenuGroup = React.forwardRef<HTMLDivElement, SelectMenuGroupProps>(
  ({ children, className, ...props }, ref) => (
    <div
      ref={ref}
      role="group"
      className={cn('py-2 [&+&]:border-t [&+&]:border-divider', className)}
      {...props}
    >
      {children}
    </div>
  )
)
SelectMenuGroup.displayName = 'SelectMenuGroup'

// ── Footer ──

export interface SelectMenuFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

const SelectMenuFooter = React.forwardRef<HTMLDivElement, SelectMenuFooterProps>(
  ({ children, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('py-2 border-t border-divider', className)}
      {...props}
    >
      {children}
    </div>
  )
)
SelectMenuFooter.displayName = 'SelectMenuFooter'

export { SelectMenuItem, SelectMenuGroup, SelectMenuFooter, menuItemVariants }
