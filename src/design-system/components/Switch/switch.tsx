import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import { Check } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Switch — 開關控件
 *
 * ── 結構 ──
 *   Track（pill 形容器）→ Thumb（白色圓 + 2px border + check icon）
 *   Track 寬 = 2 × 高，thumb 直徑 = track 高度
 *
 * ── 尺寸（sm = md）──
 *   sm/md: track 20×40, thumb 20, 白色圓 16, check 12（= checkbox sm/md）
 *   lg:    track 24×48, thumb 24, 白色圓 20, check 16（= checkbox lg）
 *
 * ── 狀態 ──
 *   OFF: track fg-disabled (neutral-6), thumb 白色無 border 無 check
 *   ON:  track primary, thumb 白色 + 2px primary border + primary check icon
 *   disabled: opacity-disabled（整體透明度）
 */

const switchVariants = cva(
  [
    'group peer inline-flex shrink-0 cursor-pointer items-center rounded-full',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    'disabled:cursor-not-allowed disabled:opacity-disabled',
    // OFF → ON 背景色
    'data-[state=unchecked]:bg-border',
    'data-[state=checked]:bg-primary',
  ],
  {
    variants: {
      size: {
        sm: 'h-5 w-10',   // 20×40
        md: 'h-5 w-10',   // 20×40
        lg: 'h-6 w-12',   // 24×48
      },
    },
    defaultVariants: { size: 'md' },
  }
)

const SPECS: Record<string, { thumb: number; check: number; translate: string }> = {
  sm: { thumb: 20, check: 12, translate: 'translateX(20px)' },
  md: { thumb: 20, check: 12, translate: 'translateX(20px)' },
  lg: { thumb: 24, check: 16, translate: 'translateX(24px)' },
}

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>,
    VariantProps<typeof switchVariants> {}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, size, ...props }, ref) => {
  const sizeKey = size ?? 'md'
  const spec = SPECS[sizeKey]

  return (
    <SwitchPrimitives.Root
      className={cn(switchVariants({ size }), className)}
      ref={ref}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          'pointer-events-none flex items-center justify-center rounded-full bg-white border-2',
          'transition-all duration-150',
          'data-[state=unchecked]:translate-x-0 data-[state=unchecked]:border-border',
          'data-[state=checked]:border-primary',
          sizeKey === 'lg' ? 'data-[state=checked]:translate-x-6' : 'data-[state=checked]:translate-x-5',
        )}
        style={{ width: spec.thumb, height: spec.thumb }}
      >
        {/* Check icon — Radix Thumb inherits data-state from Root */}
        <Check
          size={spec.check}
          className="text-primary opacity-0 transition-opacity duration-150 group-data-[state=checked]:opacity-100"
          aria-hidden
        />
      </SwitchPrimitives.Thumb>
    </SwitchPrimitives.Root>
  )
})
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch, switchVariants }
