import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// ── Selection Item Styles ───────────────────────────────────────────────────
// Checkbox Group 和 RadioGroup 共用的 item 佈局。
//
// padding 公式：py = (field-height - 1lh) / 2
//   - 單行時 item 高度 = field-height（對齊同 size 的 TextField）
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

// ── Selection Item ──────────────────────────────────────────────────────────
// 通用 item 行：control（checkbox/radio）+ label + description。
// control 包在 h-[1lh] 容器內，自動對齊第一行文字中心。

export interface SelectionItemProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof selectionItemStyles> {
  /** Checkbox 或 RadioGroupItem 元素 */
  control: React.ReactNode
  /** Label 文字 */
  label: React.ReactNode
  /** 描述文字（同 label 字體，fg-secondary） */
  description?: React.ReactNode
  /** htmlFor（label 指向 control 的 id） */
  htmlFor?: string
  /** disabled 狀態影響 label 顏色 */
  disabled?: boolean
  className?: string
}

const SelectionItem = React.forwardRef<HTMLDivElement, SelectionItemProps>(
  ({ control, label, description, htmlFor, disabled, size, className, ...props }, ref) => (
    <div ref={ref} className={cn(selectionItemStyles({ size }), className)} {...props}>
      <div className="h-[1lh] flex items-center shrink-0">
        {control}
      </div>
      <div>
        <label
          htmlFor={htmlFor}
          className={cn(
            'cursor-pointer',
            disabled ? 'text-fg-disabled cursor-not-allowed' : 'text-foreground',
          )}
        >
          {label}
        </label>
        {description && (
          <p className={disabled ? 'text-fg-disabled' : 'text-fg-secondary'}>
            {description}
          </p>
        )}
      </div>
    </div>
  )
)
SelectionItem.displayName = 'SelectionItem'

export { SelectionItem }
