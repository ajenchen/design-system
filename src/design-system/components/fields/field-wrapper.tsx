import { cva } from 'class-variance-authority'

// ── Field Wrapper Styles ────────────────────────────────────────────────────
// 所有 Field 元件共用的 input wrapper 樣式。
//
// 三種模式：
//   edit     — bg-surface, border, hover/focus 回饋
//   readonly — bg-disabled(neutral-2), 無邊框, 文字正常色
//   disabled — bg-disabled(neutral-2), 無邊框, 文字灰化
//
// 高度：固定 h = field-height token（rem），與 Button 共用同一組 token。

export const fieldWrapperStyles = cva(
  [
    'inline-flex items-center w-full rounded-md',
    'text-foreground font-normal',
    'transition-colors duration-150',
  ],
  {
    variants: {
      mode: {
        edit: [
          'bg-surface border border-border',
          'hover:border-[var(--color-neutral-6)]',
          'focus-within:border-primary focus-within:hover:border-primary',
        ],
        readonly: 'bg-disabled border border-transparent',
        disabled: 'bg-disabled border border-transparent cursor-not-allowed',
      },
      size: {
        sm: 'text-body h-field-sm px-3 gap-2',
        md: 'text-body h-field-md px-3 gap-2',
        lg: 'text-body-lg h-field-lg px-3 gap-2',
      },
    },
    defaultVariants: {
      mode: 'edit',
      size: 'md',
    },
  }
)

// ── Bare Input Styles ───────────────────────────────────────────────────────

export const bareInputStyles = [
  'flex-1 min-w-0 bg-transparent',
  'outline-none border-none p-0',
  'text-[inherit] font-[inherit] leading-[inherit]',
  'placeholder:text-fg-muted',
].join(' ')

// ── Empty Value Display ─────────────────────────────────────────────────────

export const EMPTY_DISPLAY = '—'
