import * as React from "react"
import * as SeparatorPrimitive from "@radix-ui/react-separator"

import { cn } from "@/lib/utils"

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(
  (
    { className, orientation = "horizontal", decorative = true, ...props },
    ref
  ) => (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-divider",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      {...props}
    />
  )
)
Separator.displayName = "Separator"

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const separatorMeta = {
  component: 'Separator',
  family: 'self-contained', // 純視覺 divider,獨立視覺無 slot 結構(對齊 spec frontmatter L3 family: self-contained)
  variants: {

  },
  sizes: {

  },
  states: ['default'], // 純 Radix Separator.Root,非互動,無 hover/active/focus/disabled(對齊 spec「無 StateBehavior」bullet + A11y 段;段名指法免行號漂移)
  tokens: {
    bg: [],
    fg: [],
    ring: [],
  },
} as const

export { Separator }
