import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/design-system/components/Checkbox/checkbox'
import { Avatar, type AvatarData } from '@/design-system/components/Avatar/avatar'

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
  /** 左側頭像資料（AvatarData），元件內部渲染 Avatar。與 startIcon 互斥 */
  avatar?: AvatarData
  /** 顯示 checkbox（多選模式由父層控制） */
  checkbox?: boolean
  /** Checkbox 選中狀態 */
  checked?: boolean | 'indeterminate'
  /** 單選選中（bg-neutral-selected 背景高亮，持續選中狀態） */
  selected?: boolean
  /** 後綴 Tag（ReactNode），靠右對齊 */
  tag?: React.ReactNode
  /** 後綴自訂內容（ReactNode），用於 DropdownMenu 的 badge/endIcon/shortcut 等 */
  endContent?: React.ReactNode
  /** 停用 */
  disabled?: boolean
  /** 作為群組標題（不可選，font-medium，fg-muted） */
  header?: boolean
  /**
   * Label 最大行數(line-clamp 截斷,超過顯示 ellipsis)。
   *
   * - `undefined`(預設 prop 值未傳)→ 套用元件預設 `1`(單行截斷,符合選單快速掃視需求)
   * - 數字 → 截斷到該行數
   * - `'none'` → **明確**不截斷,自然 wrap 任意行數
   *
   * 為什麼用 `'none'` 而不是 `undefined` 表達不截斷?React props 的 destructure default
   * 在 `undefined` 時會接管,所以 `<SelectMenuItem labelMaxLines={undefined}>` 等同沒傳,
   * 會 fallback 到預設 `1`。要明確覆寫成「不截斷」,必須用一個非 undefined 的 sentinel。
   */
  labelMaxLines?: number | 'none'
  /**
   * Description 最大行數。
   *
   * - `undefined`(預設 prop 值未傳)→ 套用元件預設 `1`(跟 label 對稱,維持掃視節奏)
   * - 數字 → 截斷到該行數
   * - `'none'` → 明確不截斷
   *
   * 為什麼預設 1?SelectMenu 的設計目的是「快速掃視多個選項挑一個」,垂直空間是
   * 寶貴的——一個過高的 item 會破壞 row rhythm,讓使用者眼睛重新校準。description
   * 跟 label 對稱地截到 1 行,確保所有 item 高度一致(無 desc / 有 desc 兩種高度)。
   * Consumer 若有合理理由要 2 行 description,可顯式 override。
   */
  descMaxLines?: number | 'none'
}

/** 把 maxLines 轉成 line-clamp class;'none' / 0 → 空字串 */
function lineClampClass(maxLines: number | 'none'): string {
  if (maxLines === 'none' || !maxLines) return ''
  if (maxLines === 1) return 'line-clamp-1'
  if (maxLines === 2) return 'line-clamp-2'
  if (maxLines === 3) return 'line-clamp-3'
  if (maxLines === 4) return 'line-clamp-4'
  if (maxLines === 5) return 'line-clamp-5'
  if (maxLines === 6) return 'line-clamp-6'
  return ''
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
      labelMaxLines = 1,
      descMaxLines = 1,
      className,
      ...props
    },
    ref
  ) => {
    const sizeKey = size ?? 'md'
    const labelClampClass = lineClampClass(labelMaxLines)
    const descClampClass = lineClampClass(descMaxLines)
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
          !disabled && selected && 'bg-neutral-selected',
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
              <Avatar
                src={avatar.src}
                alt={avatar.alt}
                color={avatar.color}
                size={avatarPx}
              />
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex flex-col min-w-0 flex-1">
          <span className={cn(
            // 預設 line-clamp-1(原本是 truncate);consumer 可透過 labelMaxLines 改為多行或不截
            labelClampClass || 'break-words',
            disabled && 'text-fg-disabled',
          )}>
            {children}
          </span>
          {description && (
            <span
              className={cn(
                'mt-0.5 leading-compact',
                descClampClass || 'break-words',
                disabled ? 'text-fg-disabled' : 'text-fg-secondary',
              )}
              // ── 為什麼用 inline style 而非 text-body / text-caption utility ──
              // tailwind-merge 會把 text-body(font-size)和 text-fg-secondary(color)
              // 在 cn() chain 裡誤判成同組衝突,strip 掉 text-body,導致 description 失去
              // 自己的 font-size、從父層 text-body-lg 繼承 16px。改用 CSS variable inline
              // style 從根本繞過 utility class 衝突——值仍然是 design token,沒有硬寫 px。
              style={{
                fontSize: sizeKey === 'lg' ? 'var(--font-body-size)' : 'var(--font-caption-size)',
              }}
            >
              {description}
            </span>
          )}
        </div>

        {/*
          Suffix:tag / endContent,靠右對齊。

          ── 對齊規則(item-layout.spec.md「Suffix:永遠對齊第一行 label」) ──
          Suffix **永遠**用 `h-[1lh]`,**跟 prefix 解耦**。即使 prefix 是 block-aligned 的
          大 avatar,suffix 仍然對齊 label 第一行——因為 suffix 是 label 的 metadata
          (Tag / Chevron / Time / Badge),不是整個 item 的。

          業界 convention 全部如此:Apple Mail / Gmail / iOS Settings / Material / Polaris
          的 trailing 元素都對齊 label 第一行,沒有任何一個對齊到 avatar 中心或文字塊中心。
        */}
        {(tag || endContent) && (
          <div className={cn(
            'flex items-center gap-2 shrink-0 h-[1lh] ml-auto',
            disabled && 'opacity-disabled',
          )}>
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
