import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { Circle } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// ── RadioGroup ──────────────────────────────────────────────────────────────

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root
    className={cn("grid", className)}
    {...props}
    ref={ref}
  />
))
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

// ── RadioGroupItem Variants ─────────────────────────────────────────────────
// 與 Checkbox 完全對齊：sm/md=16px, lg=20px。差異只有形狀（rounded-full）和指示器（filled dot）。

const radioItemVariants = cva(
  [
    'grid place-content-center shrink-0 rounded-full',
    'border border-border bg-surface',
    'transition-colors duration-150',
    'hover:border-[var(--color-neutral-6)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    'data-[state=checked]:border-primary data-[state=checked]:text-primary',
    'data-[state=checked]:hover:border-primary-hover data-[state=checked]:hover:text-primary-hover',
    'disabled:cursor-not-allowed disabled:bg-disabled disabled:border-transparent disabled:hover:border-transparent',
    'disabled:data-[state=checked]:bg-disabled disabled:data-[state=checked]:border-transparent disabled:data-[state=checked]:text-fg-disabled',
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

// ── Dot Size ────────────────────────────────────────────────────────────────
const dotSize: Record<string, number> = { sm: 8, md: 8, lg: 10 }

// ── RadioGroupItem ──────────────────────────────────────────────────────────

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> & VariantProps<typeof radioItemVariants>
>(({ className, size, ...props }, ref) => {
  const dotPx = dotSize[size ?? 'md']

  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(radioItemVariants({ size }), className)}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="grid place-content-center">
        <Circle
          style={{ width: dotPx, height: dotPx }}
          className="fill-current text-current"
        />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
})
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

export { RadioGroup, RadioGroupItem, radioItemVariants }
