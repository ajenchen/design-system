// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { CircleCheck, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ProgressBar — 水平進度條(determinate)
 *
 * 世界級對照:Material `LinearProgress` / Ant `Progress` / Polaris `ProgressBar` /
 * shadcn `Progress`(皆為 Radix Progress primitive 的包裝)。本 DS 命名為
 * `ProgressBar`(linear)以和 `CircularProgress`(circular)做清楚區分。
 *
 * ── 與 CircularProgress 的分界 ──
 * CircularProgress = circular 兩態(indeterminate 旋轉 / determinate arc),inline 小空間
 * ProgressBar      = linear determinate(0-100% 已知量化),頁面級大區塊 / 表單 wizard / quota
 * 兩者視覺與語意都不同,consumer 依「形狀(linear / circular)+ 是否量化」擇一。
 *
 * ── 與 FileItem 的分界(2026-04-20 user 決策) ──
 * **檔案上傳 UI 走 `FileItem`,不直接消費 ProgressBar**。FileItem 是檔案上傳情境的
 * canonical consumer-facing primitive(檔名 / icon / 進度 / status / actions 一條龍);
 * FileItem 內部可能消費 ProgressBar(engineering 實作細節),consumer 不用也不該自己
 * 組合 raw ProgressBar + 檔名 + action 來做上傳列表。世界級對照:Ant Design 的 `Upload`
 * vs `Progress`(Upload.List 內部用 Progress,consumer 不直接用 Progress 做上傳 UI)。
 *
 * ── 3 狀態,單一 size ──
 * status: inProgress(進行中藍) / success(完成綠) / error(失敗紅)
 *   ^ 命名理由:`status` 是 lifecycle(在途 / 終態),不是視覺 emphasis 階。前身
 *   `primary` 會撞 Button `variant="primary"`(emphasis 最高階),改用世界級
 *   lifecycle 慣例(Polaris `inProgress` / Ant Progress `active`)。
 *
 * **單一高度 4px**(2026-04-20 user 決策):對齊 Material 3 / Carbon / Ant 慣例
 * (固定 4dp/px 不給 size 選項)。4px 是 linear progress 的業界 canonical;若需
 * 視覺強調改用 CircularProgress + label 或改做 full-width hero 版型,不靠 size
 * 階梯撐。移除前的 sm(2)/ md(4)/ lg(6)刻度差太小,無實質視覺區分。
 *
 * ── affix(右側附加) ──
 * `affix="value"` → 顯示 `{value}%` 文字
 * `affix="status-icon"` → 顯示狀態 icon(success ✓ / error ✗;inProgress 時無 icon)
 * `affix={<custom />}` → consumer 客製
 * 不傳 → 純 bar
 */

const DEFAULT_TRACK_H = 4 // 預設 4px(見 docblock「單一高度」)
const STATUS_FILL = {
  inProgress: 'bg-primary',
  success: 'bg-success',
  error: 'bg-error',
} as const
const STATUS_ICON = {
  success: { Icon: CircleCheck, className: 'text-success' },
  error:   { Icon: XCircle,     className: 'text-error' },
} as const

export interface ProgressBarProps extends Omit<React.ComponentProps<typeof ProgressPrimitive.Root>, 'value'> {
  /** 當前進度 0-100 */
  value: number
  /** 狀態色(lifecycle,非 emphasis 階) */
  status?: 'inProgress' | 'success' | 'error'
  /** 右側附加 */
  affix?: 'value' | 'status-icon' | React.ReactNode
  /**
   * Track 高度(px)override。**預設 4**(對齊 Material / Carbon / Ant canonical)。
   *
   * **非公開 size 階**——這不是給 consumer 自由選擇粗細的 API,而是給**內部另一個
   * DS 元件(FileItem)在極密集 row layout 下壓低到 2px** 的逃生艙。Consumer 端
   * 一律走預設 4px。未來若新 primitive(例如 health-bar 型 hero progress)需要
   * 較高的 track,再評估是否擴公開 API。
   *
   * 世界級對照:Ant `<Progress>` 有 `strokeWidth` 原生 prop;本 DS 只暴露給內部
   * 元件使用,不在 public API 宣傳,避免 consumer 重新陷入「選哪個 size」的判斷負擔。
   */
  height?: number
}

const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      value,
      status = 'inProgress',
      affix,
      height,
      className,
      ...props
    },
    ref,
  ) => {
    const clampedValue = Math.max(0, Math.min(100, value))
    const fillColor = STATUS_FILL[status]
    const trackH = height ?? DEFAULT_TRACK_H

    // Affix 渲染
    let affixNode: React.ReactNode = null
    if (affix === 'value') {
      affixNode = (
        <span className="text-caption text-foreground tabular-nums shrink-0">
          {Math.round(clampedValue)}%
        </span>
      )
    } else if (affix === 'status-icon') {
      const s = status !== 'inProgress' ? STATUS_ICON[status] : null
      if (s) affixNode = <s.Icon size={16} className={cn('shrink-0', s.className)} aria-hidden />
    } else if (React.isValidElement(affix) || typeof affix === 'string' || typeof affix === 'number') {
      affixNode = affix
    }

    const bar = (
      <ProgressPrimitive.Root
        ref={ref}
        value={clampedValue}
        max={100}
        className={cn(
          'relative overflow-hidden rounded-full bg-secondary w-full',
          className,
        )}
        style={{ height: trackH }}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn('h-full rounded-full transition-all duration-300', fillColor)}
          style={{ width: `${clampedValue}%` }}
        />
      </ProgressPrimitive.Root>
    )

    if (!affixNode) return bar

    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 min-w-0">{bar}</div>
        {affixNode}
      </div>
    )
  },
)
ProgressBar.displayName = 'ProgressBar'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const progressBarMeta = {
  component: 'ProgressBar',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default', 'hover', 'active', 'focus-visible', 'disabled'],
  tokens: {
    bg: ['bg-error', 'bg-primary', 'bg-secondary', 'bg-success'],
    fg: ['text-foreground'],
    ring: [],
  },
} as const

export { ProgressBar }
