// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Notice, useInverseTheme, SUBTLE_ICON_COLOR, type NoticeVariant } from '@/design-system/components/Notice/notice'

/**
 * Alert — inline / fixed 通知
 *
 * ── data-theme 必須搭配 text-foreground ──
 * CSS color 從 body 繼承已解析值,data-theme 只改 --foreground 不改 color。
 * 在 theme boundary 設 text-foreground 強制 re-resolve。
 *
 * ── Appearance ──
 * subtle: 淺底色 + 四邊 1px border(色相 hover 色)。不設 data-theme,跟隨頁面。
 * solid: 跟 Toast 對齊:
 *   neutral → data-theme={inverse} + bg-surface-raised（同層翻轉）
 *   info/success/error → bg on outer, data-theme="dark" on inner
 *   warning → bg on outer, data-theme="light" on inner
 *
 * ── Placement ──
 * inline: rounded-md(card-level 圓角,非 overlay — 因 Alert 在頁面流內,非 floating)
 * fixed: 無圓角,full-width,無 border
 */

const SUBTLE_CONTAINER: Record<NoticeVariant, string> = {
  neutral: 'bg-muted border border-border',
  info: 'bg-info-subtle border border-[var(--info-hover)]',
  success: 'bg-success-subtle border border-[var(--success-hover)]',
  warning: 'bg-warning-subtle border border-[var(--warning-hover)]',
  error: 'bg-error-subtle border border-[var(--error-hover)]',
}

const SOLID_HUE_BG: Record<string, string> = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
}

const SOLID_HUE_THEME: Record<string, string> = {
  info: 'dark',
  success: 'dark',
  warning: 'light',
  error: 'dark',
}

const alertVariants = cva('w-full overflow-hidden', {
  variants: {
    placement: {
      inline: 'rounded-md',
      fixed: 'rounded-none border-none',
    },
  },
  defaultVariants: { placement: 'inline' },
})

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof alertVariants> {
  variant?: NoticeVariant
  appearance?: 'subtle' | 'solid'
  title: React.ReactNode
  description?: React.ReactNode
  endContent?: React.ReactNode
  dismissible?: boolean
  onDismiss?: () => void
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      variant = 'neutral',
      appearance = 'subtle',
      placement,
      title,
      description,
      endContent,
      dismissible = true,
      onDismiss,
      className,
      ...props
    },
    ref,
  ) => {
    const inverseTheme = useInverseTheme()
    const isSolid = appearance === 'solid'
    const iconClassName = !isSolid ? SUBTLE_ICON_COLOR[variant] : undefined

    // ── Live region 由 wrapping consumer 擁有(WAI-ARIA + Atlassian / Polaris / Material 共識) ──
    // Alert 是 outer host —— 自己擁有 role + aria-live;Notice(inner layout)不再帶 role,
    // 避免 nested live region 造成 screen reader 重複朗讀。
    // - error / warning → role="alert" + aria-live="assertive"(中斷,使用者必須立刻知道)
    // - info / success / neutral → role="status" + aria-live="polite"(空閒朗讀,不打斷)
    const isCritical = variant === 'error' || variant === 'warning'
    const liveRole = isCritical ? 'alert' : 'status'
    const liveLevel = isCritical ? 'assertive' : 'polite'

    // placement="fixed" 用 loose px(density-aware)讓 Alert 嵌在更大佈局內時跟周圍
   // loose-padding 元素(Toolbar / BulkActionBar / DataTable 等)左右對齊。
    // py 維持 py-3 fixed(notification banner family canonical,垂直不隨 density)。
    const noticeEl = (
      <Notice
        variant={variant}
        title={title}
        description={description}
        endContent={endContent}
        dismissible={dismissible}
        onDismiss={onDismiss}
        iconClassName={iconClassName}
        className={placement === 'fixed' ? 'px-[var(--layout-space-loose)]' : undefined}
      />
    )

    // ── Subtle ──
    if (!isSolid) {
      return (
        <div
          ref={ref}
          role={liveRole}
          aria-live={liveLevel}
          className={cn(alertVariants({ placement }), SUBTLE_CONTAINER[variant], className)}
          {...props}
        >
          {noticeEl}
        </div>
      )
    }

    // ── Solid neutral (inverse: bg + theme 同層) ──
    if (variant === 'neutral') {
      return (
        <div
          ref={ref}
          role={liveRole}
          aria-live={liveLevel}
          data-theme={inverseTheme}
          className={cn(alertVariants({ placement }), 'bg-surface-raised text-foreground', className)}
          {...props}
        >
          {noticeEl}
        </div>
      )
    }

    // ── Solid 有色相: bg outer + data-theme inner ──
    return (
      <div
        ref={ref}
        role={liveRole}
        aria-live={liveLevel}
        className={cn(alertVariants({ placement }), SOLID_HUE_BG[variant], className)}
        {...props}
      >
        <div data-theme={SOLID_HUE_THEME[variant]} className="text-foreground">
          {noticeEl}
        </div>
      </div>
    )
  },
)
Alert.displayName = 'Alert'

// Story auto-compile metadata — Phase 2 fill(2026-05-15)
// Variants = NoticeVariant 5 hues(prop name `variant`,cva 內僅 placement,色相由 SUBTLE_CONTAINER / SOLID_HUE_BG map 控)
// Sizes = none(Alert 視覺尺寸繼承 Notice primitive,不隨 size 變;見 spec「為何無 SizeMatrix」)
export const alertMeta = {
  component: 'Alert',
  family: 2, // List item(對齊 alert.spec.md frontmatter family: 2)
  variants: {
    neutral: { purpose: '中性提示(系統公告、非緊急說明);無情緒色' },
    info: { purpose: '資訊性提示(版本更新、流程說明);藍色 hue' },
    success: { purpose: '成功狀態的持久性宣告(綁定生效、付款完成需保留確認)' },
    warning: { purpose: '警告但非阻斷(方案到期、需更新付款方式);最高頻' },
    error: { purpose: '錯誤但非阻斷(系統錯誤可重試、API 失敗摘要);aria-live=assertive' },
  },
  sizes: {},
  states: ['default'], // 2026-06-11 R2:Alert 本體無互動 state(spec L183 明文無 disabled;dismiss 互動屬內部 Button),
  tokens: {
    bg: ['bg-error', 'bg-error-subtle', 'bg-info', 'bg-info-subtle', 'bg-muted', 'bg-success', 'bg-success-subtle', 'bg-surface-raised', 'bg-warning', 'bg-warning-subtle'],
    fg: ['text-foreground'],
    ring: [],
  },
  defaultVariant: 'neutral',
} as const

export { Alert, alertVariants }
