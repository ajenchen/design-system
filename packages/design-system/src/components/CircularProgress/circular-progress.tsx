// @benchmark-unverified-blanket: file-level retraction per M22 (d) — claims herein not individually URL-cited; treat as unverified visual/usage rumor unless retrofit per-claim. Hook escape preserved.
import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * CircularProgress — 圓形進度指示(determinate + indeterminate 雙模式)
 *
 * 世界級對照:Material `CircularProgress` / Chakra `CircularProgress` — 同元件管
 * determinate(有 `value`)+ indeterminate(無 `value`)兩態。本 DS 採此流派作為
 * circular progress 的 SSOT,`Spinner` 名稱廢除(遷至本元件)。
 *
 * ── 姊妹元件 ──
 * `ProgressBar`       = linear determinate(大區塊、頁面級、表單步驟、上傳 bar)
 * `CircularProgress`  = circular 兩態(本元件,inline 小空間 / Button loading / Field loading)
 *
 * ── API ──
 * value:     undefined → indeterminate(旋轉 partial arc,Spinner 樣式)
 *            number 0-100 → determinate(固定 arc + track)
 * size:      自由 px(預設 24,≤ 64 建議)— 跟 Avatar / Lucide icon 同策略
 * label:     可選 inline label,font-size inherit parent,color text-fg-muted
 * affix:     (determinate only)'value' | ReactNode
 *
 * ── 視覺 ──
 * SVG 雙圓:底 track(`var(--secondary)`)+ 進度 arc(`text-info`,status 進度色,不隨狀態變色)。
 * stroke-linecap round,rotate -90deg。
 * Indeterminate mode:arc 固定 25%,外層 `animate-spin` 旋轉,視覺同 Spinner。
 *
 * ── 不設 status prop(決策 2026-04-20)──
 * 世界級沒有「success / error CircularProgress」的穩態呈現——完成 / 失敗的語義應由
 * consumer 在業務邏輯上**替換 CircularProgress 為實際內容**(status icon + label、
 * 成功的結果、錯誤訊息等),而非讓 CircularProgress 變色 + 加 check icon。這種「綠底
 * 空心 circle + check icon 並排」是 DS 典型 over-designing 的 anti-pattern(參考:
 * Material / Chakra / Ant / Polaris 全部沒有此 variant)。
 *
 * Consumer 端範例:
 *   {uploading ? <CircularProgress /> : done ? <Check /> : error ? <AlertCircle /> : null}
 *
 * ── A11y ──
 * 有 value → role="progressbar" + aria-valuenow/min/max
 * 無 value → role="status"(loading 語義) + aria-label(如傳)或 aria-hidden(否則)
 */

// Indeterminate mode 的 arc 比例(Material 流派:25%-30% 視覺最平衡)
const INDETERMINATE_ARC_RATIO = 0.25

export interface CircularProgressProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * 進度 0-100。
   * - undefined → indeterminate(旋轉 partial arc,Spinner 樣式)
   * - number → determinate(固定 arc + track)
   */
  value?: number
  /** 直徑(px)。預設 24,建議 ≤ 64。 */
  size?: number
  /**
   * 視覺 label(inline 顯示於右側)。
   * - font-size 繼承 parent(不設 text-size class,CSS inherit)
   * - color 鎖 `text-fg-muted`(neutral-7)
   * - 塞在元件內時預設不用(e.g. Button loading);全頁 / Empty overlay 可用
   */
  label?: string
  /**
   * 右側 affix(determinate only;indeterminate 忽略)。
   * - `'value'` → `{value}%` 文字
   * - ReactNode → 客製(若需顯示「已完成」,consumer 端整個 swap 為 Check icon,不走此 prop)
   */
  affix?: 'value' | React.ReactNode
}

// code-quality-allow: long-function — foundational composite main body — 拆 sub-fn 會複雜化 local state / ref / context binding
const CircularProgress = React.forwardRef<HTMLSpanElement, CircularProgressProps>(
  (
    {
      value,
      size = 24,
      label,
      affix,
      className,
      'aria-label': ariaLabel,
      ...props
    },
    ref,
  ) => {
    const isDeterminate = typeof value === 'number'
    const clampedValue = isDeterminate ? Math.max(0, Math.min(100, value)) : 0
    const strokeWidth = Math.max(2, Math.round(size / 10))
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const dashOffset = isDeterminate
      ? circumference * (1 - clampedValue / 100)
      : circumference * (1 - INDETERMINATE_ARC_RATIO)

    const hasLabel = typeof label === 'string' && label.length > 0
    const hasAriaLabel = typeof ariaLabel === 'string' && ariaLabel.length > 0
    const shouldAnnounce = hasAriaLabel || hasLabel

    // Affix(determinate only)
    let affixNode: React.ReactNode = null
    if (isDeterminate) {
      if (affix === 'value') {
        affixNode = (
          <span className="text-caption text-foreground tabular-nums shrink-0">
            {Math.round(clampedValue)}%
          </span>
        )
      } else if (
        React.isValidElement(affix) ||
        typeof affix === 'string' ||
        typeof affix === 'number'
      ) {
        affixNode = affix
      }
    }

    const a11yRole = isDeterminate ? 'progressbar' : shouldAnnounce ? 'status' : undefined
    const a11yLabel = hasAriaLabel ? ariaLabel : hasLabel ? label : undefined
    const a11yValueAttrs = isDeterminate
      ? {
          'aria-valuenow': Math.round(clampedValue),
          'aria-valuemin': 0,
          'aria-valuemax': 100,
        }
      : {}

    const graphic = (
      <span
        ref={ref}
        role={a11yRole}
        aria-label={a11yLabel}
        aria-hidden={!a11yRole ? true : undefined}
        {...a11yValueAttrs}
        className={cn(
          // align-middle:inline context 內讓 SVG 對齊 adjacent text 的 x-height 中線
          //(不加會按 baseline 對齊,在 inline-flex cell 裡視覺下沉 1-2px 看起來歪)
          'inline-flex shrink-0 align-middle text-info',
          // motion-reduce:Material 流派 — prefers-reduced-motion 時不停止旋轉(loading 仍需可見回饋),
          // 而是放慢到 3s/cycle(預設 1s),保留資訊不刺激前庭。
          !isDeterminate && 'animate-spin motion-reduce:[animation-duration:3s]',
          className,
        )}
        style={{ width: size, height: size }}
        {...props}
      >
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--secondary)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className={isDeterminate ? 'transition-[stroke-dashoffset] duration-300' : undefined}
          />
        </svg>
      </span>
    )

    // 單純 graphic(無 label / affix)
    if (!hasLabel && !affixNode) return graphic

    return (
      <span className={cn('inline-flex items-center', (hasLabel || affixNode) && 'gap-2')}>
        {graphic}
        {hasLabel && <span className="text-fg-muted">{label}</span>}
        {affixNode}
      </span>
    )
  },
)
CircularProgress.displayName = 'CircularProgress'

// Story auto-compile metadata — Phase 1 mechanical migration(2026-04-24)
// Phase 2 fill needed: purpose descriptions + when rationale + world-class refs
export const circularProgressMeta = {
  component: 'CircularProgress',
  family: null, // non-family composite / overlay / layout
  variants: {

  },
  sizes: {

  },
  states: ['default'], // 無 hover / focus / active(spec);disabled 屬 consumer host(spec「邊界案例」)
  tokens: {
    bg: [],
    fg: ['text-fg-muted', 'text-foreground', 'text-info'],
    ring: [],
  },
} as const

export { CircularProgress }
