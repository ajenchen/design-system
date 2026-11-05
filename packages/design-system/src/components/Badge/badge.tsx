import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// ── Badge（notification count indicator）────────────────────────────────────
// 通知計數指示器，用於未讀數量、待辦計數等。
//
// 兩種模式：
//   count — 16px 高，10px 字，font-medium。個位數正圓，多位數膠囊。
//   dot   — 6×6px 純色圓點，無文字。
//
// 四個層級（由 passive 到 urgent）：
//   low（預設） — 灰底灰字（neutral-3 + neutral-7），被動計數
//   medium      — 淺藍底藍字（bg-info-subtle + text-info-text），可延後看
//   high        — 藍底白字（bg-info），有感影響的待辦
//   critical    — deep-orange 底白字（bg-notification = --color-deep-orange-6,hue 38;非 categorical red hue 25），立即處理
//
// dot 模式只接 critical / high（單一 attention 點,實心可見色）—— 不提供 medium/low dot:
// dot = 「這裡有東西要看」,淡點不 earn existence(一顆小點分不出四級輕重,淡色點在小尺寸下幾乎看不見 /
// dot 只承載單一 attention,非 4 級 severity 刻度;2026-06-05 user 拍板 Option A)。
// medium/low 仍完整存在於 count/text badge。
//
// 規則：count default low, escalate with reason。見 badge.spec.md「選 level 的流程」+「dot 變體」。

const badgeVariants = cva(
  // 2026-05-23 Path B revert:icon-as-text / numeric-in-circle 用 leading-none canonical(行高 = 字級,圓裡的數字 / 圖示才會上下置中,不被行高多出的上下空白推偏)。
  // 視覺等效驗證:Badge container 顯式 `h-4 (16px)` + `flex items-center` 主導,text 被 items-center 置中,line-height 1.0 vs 1.3 視覺零差別。
  // user 2026-05-23 反問要不要乾脆不分、並同意 AI 建議的 path B(原話已不可考,此為轉述):統一 leading-none,不分。
  // 廢除 2026-05-21 F1 fix 的 leading-compact migration(那次 anchor「不影響高度的話就改」core constraint 是高度不變,Path B 同樣滿足且更簡單)。
  'inline-flex items-center justify-center rounded-full leading-none',
  {
    variants: {
      variant: {
        critical: 'bg-notification text-on-emphasis',
        high: 'bg-info text-on-emphasis',
        medium: 'bg-info-subtle text-info-text',
        low: 'bg-secondary text-fg-muted',
      },
      dot: {
        true: 'w-1.5 h-1.5',
        false: 'min-w-4 h-4 px-1 text-[10px] font-medium',
      },
    },
    defaultVariants: {
      variant: 'low',
      dot: false,
    },
  }
)

type BadgeBaseProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'>

export interface BadgeDotProps extends BadgeBaseProps {
  /** dot 模式：6×6px 純色圓點，無文字 */
  dot: true
  /** dot 只接高訊號 attention 色:critical(立即)/ high(有感)。預設 critical。
   * 不提供 medium/low —— dot = 「這裡有東西要看」,淡點不 earn existence
   * (dot 只承載單一 attention,非 severity 刻度:小點分不出四級輕重)。 */
  variant?: 'critical' | 'high'
  count?: never
  max?: never
}

export interface BadgeCountProps extends BadgeBaseProps {
  dot?: false
  /** 四級 severity（low→critical),見 badge.spec.md「選 level 的流程」 */
  variant?: 'critical' | 'high' | 'medium' | 'low'
  /** 顯示的數量 */
  count?: number
  /** 數量上限，超過時顯示 "max+"（例：max=99 → "99+"） */
  max?: number
}

export type BadgeProps = BadgeDotProps | BadgeCountProps

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant, dot = false, count, max, className, role, ...props }, ref) => {
    // dot 預設 attention 色 = critical(非 cva 的 count default 'low');count 沿用 cva default 'low'。
    const effectiveVariant = variant ?? (dot ? 'critical' : 'low')
    // 2026-07-05 D4 修(續 07-04 guard):count 模式 count == null → 整顆 return null 不渲染 —
    // 原 guard 只擋文字,仍渲染 16px 空 pill + 空 role=status live region(Ant 不渲染:沒有 count 時 `isHidden` 為真、`CSSMotion visible={!isHidden}` 不掛節點,[Badge.tsx#L165-L168](https://github.com/ant-design/ant-design/blob/bf317a2426fa5a8465bb54f6d0f6e7825dcf0d01/components/badge/Badge.tsx#L165-L168);MUI 節點仍在、但 `badgeContent == null` 時標 invisible 縮成 `scale(0)`,[Badge.js#L185](https://github.com/mui/material-ui/blob/fec132cb22a5f4f7e122f56cac616195e52bfeea/packages/mui-material/src/Badge/Badge.js#L185)、[#L130](https://github.com/mui/material-ui/blob/fec132cb22a5f4f7e122f56cac616195e52bfeea/packages/mui-material/src/Badge/Badge.js#L130);兩家都沒有空的 live region)。
    if (!dot && count == null) return null
    const display = dot ? null : (
      max != null && count! > max ? `${max}+` : `${count}`
    )

    // a11y(2026-04-25 axe aria-prohibited-attr fix):
    // span default 無 role → 不接 aria-label(WCAG 禁止)。Badge 是通知指示器,
    // `role="status"` 語意正確(live region 可播報計數變化)且允許 aria-label。
    // Consumer 可 override(傳 role="img" / role={undefined})。
    return (
      <span
        ref={ref}
        role={role ?? 'status'}
        className={cn(badgeVariants({ variant: effectiveVariant, dot }), className)}
        {...props}
      >
        {display}
      </span>
    )
  }
)
Badge.displayName = 'Badge'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const badgeMeta = {
  component: 'Badge',
  family: null, // self-contained(對齊 spec frontmatter 2026-06-11 修),
  variants: {
    critical: { purpose: 'deep-orange 底白字（bg-notification = deep-orange-6）' },
    high: { purpose: '藍底白字（bg-info）' },
    medium: { purpose: '淺藍底藍字（bg-info-subtle）' },
    low: { purpose: '使用者切 tab 才看，不需搶注意力' },
  },
  sizes: {

  },
  states: ['default'],
  tokens: {
    bg: ['bg-info', 'bg-info-subtle', 'bg-notification', 'bg-secondary'],
    fg: ['text-fg-muted', 'text-info-text', 'text-on-emphasis'],
    ring: [],
  },
  defaultVariant: 'low',
} as const

export { Badge, badgeVariants }
