import * as React from 'react'

import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/design-system/components/Tooltip/tooltip'
import { useTruncated } from '@/design-system/hooks/use-truncated'

// ── 消費的 SSOT ──
// - hooks/use-truncated（useTruncated）：截斷偵測引擎 + isTruncated 狀態（本 primitive 的量測核心）
// - components/Tooltip（Tooltip/TooltipTrigger/TooltipContent）：截斷才顯示完整文字的補救 overlay
// - lib/utils（cn）：className 合併
// - spec: patterns/element-anatomy/truncated-text.spec.md（本 primitive「何時用/為什麼」）
// - governing: components/Tooltip/tooltip.principles.stories.tsx「沒被截斷就不該顯示 tooltip」→ 由 open 控制機械保證

// ── TruncatedText — 單行截斷 + 截斷才顯示 tooltip 的組合式 primitive ──────────────
// 消費 `useTruncated`(量測引擎 SSOT)+ 封裝「永遠 wrap Tooltip、以 `open` 控制可見」的正解結構。
// 收斂 Breadcrumb `TruncatedLabel` 與 DataTable `TruncateCell` 兩處同構的 truncate-span+tooltip presentation。
// Tag 因 trigger≠量測元素(整個 tag root vs 內層 text span)+ Canvas measure + 自訂 a11y,正當地
//   只消費 `useTruncated` hook、不走本 component(見 tag.tsx)。
//
// 「永遠 wrap + `open={isTruncated?undefined:false}`」而非「未截斷回裸 span、截斷才 wrap」:
//   後者切換 JSX 樹會讓 span unmount/remount → ref 換到新 DOM、useEffect[] 不重跑 → 觀察的 DOM 與
//   實際 DOM 對不上(Breadcrumb 2026-05-11 抓的 bug)。always-wrap 保 DOM 節點生命週期穩定;
//   `open={false}` 時 TooltipTrigger asChild 只把 handler/data-state 合併到同一 span(無多餘 DOM、
//   tooltip 靜默),與裸 span 視覺行為等價。

/** @internal 隨 `TruncatedText`(DS-internal 組合 primitive)一併不進 root barrel front-door;subpath 仍可取。 */
export interface TruncatedTextProps {
  children: React.ReactNode
  /** 附加到截斷 span 的 className(如 DataTable 的 text-align)。 */
  className?: string
  /**
   * Tooltip 顯示內容,預設 = `children`。當 `children` 為非字串 ReactNode(icon+text 等)、
   * 但已知完整文字時傳入(Breadcrumb 的 `fullText`)。
   */
  tooltip?: React.ReactNode
  /**
   * span 的 display:`'inline'`(預設,保 baseline/垂直對齊,DataTable cell 用)/ `'block'`(Breadcrumb 用)。
   * ⚠️ DataTable 刻意用 inline —— `block` 會改 baseline 使 Field/inline-flex cell 垂直對齊 collapse。
   */
  display?: 'block' | 'inline'
}

/**
 * @internal DS-internal 組合 primitive:由 Breadcrumb / DataTable 內部消費以統一 truncate-tooltip 呈現。
 * end-user app 若需「單行截斷 + tooltip」直接消費 public `useTruncated` hook 自組(trigger/a11y 自控),
 * 或經 per-component subpath 取用本 component。不進 root barrel front-door。
 */
export function TruncatedText({ children, className, tooltip, display = 'inline' }: TruncatedTextProps) {
  const { ref, isTruncated } = useTruncated<HTMLSpanElement>()
  return (
    <Tooltip open={isTruncated ? undefined : false}>
      <TooltipTrigger asChild>
        <span ref={ref} className={cn('truncate min-w-0', display === 'block' && 'block', className)}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip ?? children}</TooltipContent>
    </Tooltip>
  )
}
TruncatedText.displayName = 'TruncatedText'
