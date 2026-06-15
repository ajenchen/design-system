import * as React from 'react'
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Accordion — Radix Accordion + 本 DS token
 *
 * 結構對齊 shadcn/ui accordion(Accordion / AccordionItem / AccordionTrigger /
 * AccordionContent),但視覺全改本 DS token。
 *
 * ── 視覺差異 vs shadcn 預設 ──
 * Shadcn 預設 hover 加底線(web 早期 link style),本 DS 改為文字色 tint
 * (`hover:text-fg-secondary`)——維持現代 SaaS 質感(Notion / Linear / Stripe 皆不用
 * 底線),但保留 hover 顏色變化作為可點擊提示(user 決策 2026-04-20)。
 * Chevron 用 Lucide + 本 DS icon size(16px),rotate 動畫 200ms。
 *
 * ── 使用情境 ──
 * FAQ / settings section 收合 / 多區塊表單分組 / 進階選項可隱藏。
 * 不用於「單純顯示 / 隱藏單一區塊」(那是 Collapsible,本 DS 尚未建立;用 details 或
 * 自組 toggle),Accordion 是「多個 item 可互斥或獨立收合」的 pattern。
 */

const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn('border-b border-divider', className)}
    {...props}
  />
))
AccordionItem.displayName = 'AccordionItem'

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex flex-1 items-center justify-between gap-2',
        'py-4 text-body font-medium text-foreground text-left',
        'transition-colors hover:text-fg-secondary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        // AccordionTrigger 單一 text-style 列 → semantic `text-fg-disabled`(非 opacity);Button canonical 對齊
        'disabled:text-fg-disabled disabled:pointer-events-none',
        // 2026-05-31 M24:disabled 時 chevron(icon 載體)亦降 text-fg-disabled,不停留 text-fg-muted
        //（muted=neutral-7 比 disabled=neutral-6 深 → 層級顛倒)。覆寫 chevron 自身 text-fg-muted。
        'disabled:[&>svg]:text-fg-disabled',
        "[&[data-state=open]>svg]:rotate-180",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown
        size={16}
        className="shrink-0 text-fg-muted transition-transform duration-200"
        aria-hidden
      />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
))
AccordionTrigger.displayName = 'AccordionTrigger'

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className={cn(
      'overflow-hidden text-body text-fg-secondary',
      'data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down',
    )}
    {...props}
  >
    <div className={cn('pb-4', className)}>{children}</div>
  </AccordionPrimitive.Content>
))
AccordionContent.displayName = 'AccordionContent'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const accordionMeta = {
  component: 'Accordion',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'focus-visible', 'disabled'],
  tokens: {
    bg: [],
    fg: ['text-fg-disabled', 'text-fg-muted', 'text-fg-secondary', 'text-foreground'],
    ring: ['ring-ring'],
  },
} as const

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
