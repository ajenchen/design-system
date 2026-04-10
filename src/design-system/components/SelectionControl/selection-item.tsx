import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, type AvatarData } from '@/design-system/components/Avatar/avatar'

// ── Selection Item Styles ───────────────────────────────────────────────────
// Checkbox 和 RadioGroup 共用的 item 佈局。
//
// 結構(item-layout.spec.md 4-slot 模型):
//   [control] [optional prefix(icon|avatar)] [content(label/desc)] [optional suffix]
//
// padding 公式：py = (field-height - 1lh) / 2
//   - 單行時 item 高度 = field-height（對齊同 size 的 Input）
//   - 多行時 padding 不變（文字間距一致）
//   - density 切換時 field-height 自動調整，padding 跟著算
//
// 容器設 text-body / text-body-lg 建立 1lh context（div 上正常繼承）。

export const selectionItemStyles = cva(
  'flex items-start gap-2',
  {
    variants: {
      size: {
        sm: 'text-body py-[calc((var(--field-height-sm)_-_1lh)_/_2)]',
        md: 'text-body py-[calc((var(--field-height-md)_-_1lh)_/_2)]',
        lg: 'text-body-lg py-[calc((var(--field-height-lg)_-_1lh)_/_2)]',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

type SizeKey = 'sm' | 'md' | 'lg'

// ── Avatar 尺寸 ──
// ── Avatar 尺寸 ──
// 跟 SelectMenuItem 共用 convention:
//   - inline(≤24px):無 desc 或 icon → 對齊 label 第一行
//   - block(>24px):有 desc → 對齊 text block center
//
// 跟 SelectMenuItem 的差異:SelectionItem 有 control(checkbox/radio)。
// block 模式時 **control 跟 prefix 一起走 block 高度**——兩者都在 text block center,
// 維持「selection + identity」是一組的視覺語意,不會歪斜。
const AVATAR_PX = {
  inline: { sm: 20, md: 24, lg: 24 },
  block:  { sm: 32, md: 32, lg: 40 },
} as const

const ICON_SIZE: Record<SizeKey, number> = { sm: 16, md: 16, lg: 20 }

// ── Block 對齊容器 ──
// reading mode: desc 永遠 14px (var(--font-body-size) * 1.5)
const blockAlignClass: Record<SizeKey, string> = {
  sm: 'h-[calc(1lh+2px+var(--font-body-size)*1.5)]',
  md: 'h-[calc(1lh+2px+var(--font-body-size)*1.5)]',
  lg: 'h-[calc(1lh+2px+var(--font-body-size)*1.5)]',
}

// ── Selection Item ──────────────────────────────────────────────────────────
// 通用 item 行：control + 可選 prefix(icon/avatar) + label + description。
// control 永遠包在 h-[1lh] 容器內,對齊第一行 label。
// prefix 走 24px 閾值規則,各自獨立對齊。

export interface SelectionItemProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof selectionItemStyles> {
  /** Checkbox 或 RadioGroupItem 元素(永遠存在,永遠 inline 對齊) */
  control: React.ReactNode
  /** Label 文字 */
  label: React.ReactNode
  /** 描述文字(fg-secondary;reading mode 永遠 14px) */
  description?: React.ReactNode
  /**
   * 可選的左側 icon(在 control 之後、label 之前)。LucideIcon 型別,元件內部控制尺寸
   * (16/16/20px @ sm/md/lg)。**永遠 inline 對齊第一行 label**(icon ≤24px)。
   * 與 `avatar` 互斥。
   */
  icon?: LucideIcon
  /**
   * 可選的左側 avatar(在 control 之後、label 之前)。`AvatarData` 資料型別,元件內部渲染 Avatar。
   * 尺寸由 `description` 自動決定(跟 SelectMenuItem 同 convention):
   * - 無 desc → inline(20/24/24px),跟 control 同步在 label 第一行
   * - 有 desc → block(32/32/40px),跟 control 同步在 text block center
   *
   * Block 模式時 **control(checkbox/radio)也一起走 block 高度**——兩者都在
   * text block center,不會歪斜。與 `icon` 互斥。
   */
  avatar?: AvatarData
  /** htmlFor（label 指向 control 的 id） */
  htmlFor?: string
  /** disabled 狀態影響 label 顏色 */
  disabled?: boolean
  /**
   * Label 最大行數(line-clamp 截斷)。
   *
   * - `undefined`(預設 prop 值未傳)→ 套用元件預設 `'none'`(form 欄位允許任意長度)
   * - 數字 → 截斷到該行數
   * - `'none'` → 明確不截斷(語意等同預設)
   *
   * 為什麼用 `'none'` 而不是 `undefined`?React props 的 destructure default 在
   * `undefined` 時會接管,要明確覆寫必須用非 undefined 的 sentinel。
   */
  labelMaxLines?: number | 'none'
  /**
   * Description 最大行數。預設 `'none'`(不截)。
   */
  descMaxLines?: number | 'none'
  className?: string
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

const SelectionItem = React.forwardRef<HTMLDivElement, SelectionItemProps>(
  (
    {
      control,
      label,
      description,
      icon: Icon,
      avatar,
      htmlFor,
      disabled,
      size,
      labelMaxLines = 'none',
      descMaxLines = 'none',
      className,
      ...props
    },
    ref
  ) => {
    const sizeKey: SizeKey = size ?? 'md'
    const labelClampClass = lineClampClass(labelMaxLines)
    const descClampClass = lineClampClass(descMaxLines)

    // ── Prefix slot(24px 閾值規則) ──
    // - icon(永遠 ≤24px)→ inline
    // - avatar + 無 desc → inline(20/24/24px)
    // - avatar + 有 desc → block(32/32/40px,centered on text block)
    //
    // Block 模式的 control 對齊:
    //   control 跟 prefix 一起走 block 高度(都在 text block center),
    //   不固定在 label 第一行——因為整列可點擊,checkbox 跟 avatar 是
    //   「selection + identity」的視覺單元,不能歪斜。
    if (process.env.NODE_ENV !== 'production' && Icon && avatar) {
      // eslint-disable-next-line no-console
      console.warn('[SelectionItem] `icon` 和 `avatar` 互斥,只會渲染 icon。')
    }
    const hasPrefix = !!Icon || !!avatar
    const useBlock = !!avatar && !Icon && !!description && AVATAR_PX.block[sizeKey] > 24
    const avatarPx = useBlock ? AVATAR_PX.block[sizeKey] : AVATAR_PX.inline[sizeKey]

    // control 和 prefix 共用同一個對齊高度:inline → h-[1lh],block → blockAlignClass
    const alignClass = useBlock ? blockAlignClass[sizeKey] : 'h-[1lh]'

    return (
      <div ref={ref} className={cn(selectionItemStyles({ size }), className)} {...props}>
        {/* Control: 跟 prefix 同高度(inline → label 第一行;block → text block center) */}
        <div className={cn(alignClass, 'flex items-center shrink-0')}>
          {control}
        </div>

        {/* Optional prefix (icon/avatar): 跟 control 同高度,24px 閾值規則 */}
        {hasPrefix && (
          <div className={cn(alignClass, 'flex items-center shrink-0')}>
            {Icon && (
              <Icon
                size={ICON_SIZE[sizeKey]}
                className={cn('shrink-0', disabled && 'text-fg-disabled')}
                aria-hidden
              />
            )}
            {!Icon && avatar && (
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
        <div className="min-w-0 flex-1">
          <label
            htmlFor={htmlFor}
            className={cn(
              'cursor-pointer block break-words',
              labelClampClass,
              disabled ? 'text-fg-disabled cursor-not-allowed' : 'text-foreground',
            )}
          >
            {label}
          </label>
          {description && (
            <p
              className={cn(
                'mt-0.5 break-words',
                descClampClass,
                disabled ? 'text-fg-disabled' : 'text-fg-secondary',
              )}
              // ── 規則(item-layout.spec.md 閱讀模式) ──
              // - Description 字體:**最小 14px**(spec「14→14px, 16→14px」)
              //   sm/md/lg 全部 14px,跟 label 不一定同字級,但永遠 ≥ 14px
              // - Description 行高:跟 label 同(reading mode 預設 1.5,**不套 leading-compact**)
              //
              // ── 為什麼用 inline style ──
              // tailwind-merge 把 font-size utility(text-body)和 color utility
              // (text-fg-secondary)誤判成同組衝突,strip 掉 text-body 導致 description
              // 從父層繼承字級。用 CSS variable inline style 直接繞過 utility 衝突。
              style={{ fontSize: 'var(--font-body-size)' }}
            >
              {description}
            </p>
          )}
        </div>
      </div>
    )
  }
)
SelectionItem.displayName = 'SelectionItem'

export { SelectionItem }
