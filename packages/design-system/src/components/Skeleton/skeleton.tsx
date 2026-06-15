import * as React from "react"
import { cn } from "@/lib/utils"

const Skeleton = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
    {...props}
  />
))
Skeleton.displayName = "Skeleton"

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const skeletonMeta = {
  component: 'Skeleton',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: [], // 2026-06-11 R2:非互動元件,只有顯示/不顯示(spec L77;同 DescriptionList 先例),
  tokens: {
    bg: ['bg-muted'],
    fg: [],
    ring: [],
  },
} as const

export { Skeleton }
