import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/design-system/components/Button/button'
import { ButtonDivider } from '@/design-system/components/Button/button-group'

// ── 消費的 SSOT ───────────────────────────────────────────────────────────────
// - bulk-action-bar.spec.md(本元件 SSOT)
// - DataTable/data-table.spec.md「L2 選取」(整合方式)
// - button.spec.md + button-group.tsx(action variant=tertiary,size=md,
//   gap-2 + ButtonDivider 自帶 mx-1 = 12px 視覺距離)
// - inline-action.spec.md「same-row consistency rule」(close X 同尺寸 md)
// - tokens/layoutSpace/layoutSpace.spec.md(footer 用 px-loose py-tight)
// - patterns/overlay-surface/overlay-surface.spec.md SurfaceFooter canonical
// - Alert(banner)用 title ReactNode 帶 inline link CTA

// ── i18n labels ─────────────────────────────────────────────────────────────

// code-quality-allow: dead-export — public API per spec.md(consumer i18n override hook)
export interface BulkActionBarLabels {
  count: (n: number) => string
  clear: string
  hiddenSuffix: (hidden: number) => string
  toolbarAriaLabel: string
}

// code-quality-allow: dead-export — public API per spec.md(consumer spread + override)
export const BULK_ACTION_BAR_DEFAULT_LABELS: BulkActionBarLabels = {
  count: (n) => `已選 ${n} 項`,
  clear: '清除選取',
  hiddenSuffix: (hidden) => `· ${hidden} 個被 filter 隱藏`,
  toolbarAriaLabel: '批次操作',
}

// ── Props ───────────────────────────────────────────────────────────────────

export interface BulkActionBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 已選 ID,length === 0 時自動隱藏(回傳 null) */
  selection: readonly string[]
  /** Clear 觸發,user 點 X icon 或 Esc(consumer 在 page-level 監聽) */
  onClear?: () => void
  /** 批次 actions(consumer 提供 md Button,variant=tertiary 或 tertiary+danger;不用 primary) */
  actions?: React.ReactNode
  /** Filter 模式:hidden 數量,顯示在 count 區 inline「{N} 已選 · {M} 個被 filter 隱藏」 */
  hiddenByFilter?: number
  /**
   * 「擴選整個 dataset」狀態(2026-05-13 ship,per user 抓 Alert「已選 5370」但 BulkActionBar
   * 仍顯「已選 50 項」regression):
   * - undefined / null(default):count 走 `selection.length`(page-level 視覺選取)
   * - number:count 走此數值(整個 dataset 擴選後 user 已選的真總數)
   *
   * Canonical pattern:consumer 把 BulkActionBar 跟「Alert info banner(提示擴選 dataset)」
   * 一起 mount,Alert 點「點此選取全部 N 個」→ setTotalSelected(N) → BulkActionBar count 同步。
   * 對齊 Gmail / Linear / Notion 全選 dataset hint pattern。
   * 詳 `bulk-action-bar.spec.md`「Extend dataset pattern」段。
   */
  totalSelected?: number | null
  /** i18n labels(Partial,merge with default) */
  labels?: Partial<BulkActionBarLabels>
}

// ── Component ───────────────────────────────────────────────────────────────
// 視覺結構(同 SurfaceFooter / DataTable toolbar canonical):
//   px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]
//   gap-2 between elements
//   全 md Buttons(same-row consistency)
//   <ButtonDivider /> 自帶 mx-1 = 12px 視覺距離
//
// Hint banner(擴 dataset 提示)完全外包給 Alert 元件 — consumer 視 ref 圖
// 黏在 BulkActionBar 上方/下方,用 Alert variant="info" placement="fixed"
// title={inline link JSX}。BulkActionBar 自己不再有 hint banner slot。
//
// 浮起 / fixed positioning 由 consumer wrap 決定(BulkActionBar 不限定 placement)。

const BulkActionBar = React.forwardRef<HTMLDivElement, BulkActionBarProps>(
  function BulkActionBar(
    { selection, onClear, actions, hiddenByFilter, totalSelected, labels: labelsOverride, className, ...props },
    ref
  ) {
    const labels: BulkActionBarLabels = React.useMemo(
      () => ({ ...BULK_ACTION_BAR_DEFAULT_LABELS, ...labelsOverride }),
      [labelsOverride]
    )

    // selection.length === 0 自動藏(對齊 spec 禁止事項 #3)
    if (selection.length === 0) return null

    return (
      <div
        ref={ref}
        role="toolbar"
        aria-label={labels.toolbarAriaLabel}
        className={cn(
          'flex items-center gap-2',
          'px-[var(--layout-space-loose)] py-[var(--layout-space-tight)]',
          // 上分隔線:bottom toolbar canonical(Linear / Apple Mail / Notion 共識)— 視覺從上方內容收尾
          'border-t border-divider',
          className
        )}
        {...props}
      >
        {/* X close — md dismiss(2026-05-04 spec update:default placement = footer variant,
            visual weight 對齊 Dialog footer commitment buttons md;same-row consistency 維持)
            未來若有 top-toolbar variant(覆蓋 sm-density toolbar)→ 該 variant override sm */}
        {onClear && (
          <Button
            variant="text"
            size="md"
            iconOnly
            dismiss
            startIcon={X}
            aria-label={labels.clear}
            onClick={onClear}
          />
        )}

        {/* count + filter hidden inline
            color canonical(2026-05-04):count = primary foreground + medium weight
            理由:count 是 state-bearing 主資訊(「你在 selection mode + N items」),非裝飾
            World-class 共識:Linear/Notion/Carbon/Polaris 均用 primary foreground;muted 化弱化 state signal
            hiddenByFilter suffix 維持 muted(這是次資訊,視覺層次正確) */}
        {/* 2026-05-31 #3:aria-live 通知 SR 選取數變更;#20:補 font-medium 對齊 spec L90 + 上方 comment(state-bearing 主資訊) */}
        <span className="text-body text-foreground font-medium tabular-nums" aria-live="polite" aria-atomic="true">
          {/* 2026-05-13:totalSelected override 走 dataset 擴選後真總數,否則 fallback page-level selection.length */}
          {labels.count(typeof totalSelected === 'number' ? totalSelected : selection.length)}
          {hiddenByFilter !== undefined && hiddenByFilter > 0 && (
            <span className="text-fg-muted font-normal"> {labels.hiddenSuffix(hiddenByFilter)}</span>
          )}
        </span>

        {/* divider */}
        {actions && <ButtonDivider />}

        {/* batch actions slot(consumer 提供 md Buttons) */}
        {actions && (
          <div className="flex items-center gap-2 flex-1 min-w-0">{actions}</div>
        )}
      </div>
    )
  }
)
BulkActionBar.displayName = 'BulkActionBar'

// Story auto-compile metadata
export const bulkActionBarMeta = {
  component: 'BulkActionBar',
  family: null,
  variants: {},
  sizes: {},
  states: ['default'],
  tokens: {
    fg: ['text-foreground', 'text-fg-muted'],
    border: ['border-divider'],
  },
} as const

export { BulkActionBar }
