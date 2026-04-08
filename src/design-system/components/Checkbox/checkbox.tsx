import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// ── Variants ────────────────────────────────────────────────────────────────
// 三種尺寸（sm/md=16px, lg=20px），對齊 icon 系統與 SelectionItem。

const checkboxVariants = cva(
  [
    'grid place-content-center shrink-0 rounded-md',
    'border border-border bg-surface',
    'transition-colors duration-150',
    'hover:border-border-hover',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    'data-[state=checked]:bg-primary data-[state=checked]:text-white data-[state=checked]:border-primary',
    'data-[state=checked]:hover:bg-primary-hover data-[state=checked]:hover:border-primary-hover',
    'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-white data-[state=indeterminate]:border-primary',
    'data-[state=indeterminate]:hover:bg-primary-hover data-[state=indeterminate]:hover:border-primary-hover',
    'disabled:cursor-not-allowed disabled:bg-disabled disabled:border-transparent disabled:hover:border-transparent',
    'disabled:data-[state=checked]:bg-disabled disabled:data-[state=checked]:text-fg-disabled disabled:data-[state=checked]:border-transparent',
    'disabled:data-[state=indeterminate]:bg-disabled disabled:data-[state=indeterminate]:text-fg-disabled disabled:data-[state=indeterminate]:border-transparent',
  ],
  {
    variants: {
      size: {
        sm: 'h-4 w-4',
        md: 'h-4 w-4',
        lg: 'h-5 w-5',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
)

// ── Check Icon Size ─────────────────────────────────────────────────────────
const checkIconSize: Record<string, number> = { sm: 12, md: 12, lg: 16 }

// ── Component ───────────────────────────────────────────────────────────────

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & VariantProps<typeof checkboxVariants>
>(({ className, size, ...props }, ref) => {
  const iconPx = checkIconSize[size ?? 'md']

  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(checkboxVariants({ size }), className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-content-center text-current">
        {props.checked === 'indeterminate'
          ? <Minus style={{ width: iconPx, height: iconPx }} />
          : <Check style={{ width: iconPx, height: iconPx }} />
        }
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
})
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox, checkboxVariants }
