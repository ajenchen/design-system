/**
 * AgentFab — 智慧代理浮動開關鈕(AgentPanel 家族附屬資產)。
 *
 * ── 消費的 SSOT ──
 * - 40 圓 = --field-height-lg 於 lg 密度(uiSize.spec.md「lg 密度」表);圓形 iconOnly。
 * - 面 = bg-surface-raised + --elevation-200(elevation.spec.md 配對規則;不寫死白色)。
 * - 外框 = AI 觸發鈕特調:錐形(環向)漸層描邊 2px(整數寬+環向漸層=正圓對稱;
 *   spec「FAB」節)。配色兩極取標誌兩緞帶家族(藍 258 / 土耳其藍 196 — 品牌資產常數,
 *   同 AgentLogo 漸層停駐;2026-09-02 對定稿標誌覆核:兩極各落於藍 252-268 /
 *   青 190-210 家族內 ✓)。
 * - 內置 24 標誌(AgentLogo 簡化檔自動生效)。
 * - 動畫:待機=靜止(常駐邊角鈕,持續呼吸干擾周邊視野);有新訊=招喚態
 *   (標誌本體蓄勢,漣漪由邊框光圈代位:35% 拍點自邊框射出 r 21→27、寬 2.5、.35→0);
 *   懸停=陰影升一級+微放大;皆 --motion-duration-overlay 過場。
 * - 減動作:光圈屬常駐位移 loop → prefers-reduced-motion 全停(標誌內部自落待機呼吸)。
 */
import * as React from 'react'
import { cn } from '@/lib/utils'
import { AgentLogo, usePrefersReducedMotion } from './agent-logo'

/** 環向漸層兩極(= AgentLogo 緞帶家族代表色;品牌資產常數)。 */
const RING_BLUE = 'oklch(.70 .18 258)'
const RING_TURQUOISE = 'oklch(.72 .13 196)'

export interface AgentFabProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** 有新訊(招喚態):標誌蓄勢 + 邊框光圈呼出。 */
  attention?: boolean
}

const AgentFab = React.forwardRef<HTMLButtonElement, AgentFabProps>(
  ({ attention = false, className, 'aria-label': ariaLabel, ...props }, ref) => {
    const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '')
    const reduced = usePrefersReducedMotion()
    const glowId = `${uid}fg`
    const showGlow = attention && !reduced
    return (
      <span className="relative inline-flex">
        {showGlow && (
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <defs>
              {/* 光圈=邊框的光外散:與環同兩極、同方位(藍在左下=環 220° 起點)。 */}
              <linearGradient id={glowId} x1="0.15" y1="0.85" x2="0.85" y2="0.15">
                <stop offset="0" stopColor={RING_BLUE} />
                <stop offset="1" stopColor={RING_TURQUOISE} />
              </linearGradient>
            </defs>
            <circle
              cx="32"
              cy="32"
              r="21"
              fill="none"
              stroke={`url(#${glowId})`}
              strokeWidth="2.5"
              opacity="0"
            >
              <animate
                attributeName="r"
                values="21;21;27"
                keyTimes="0;.35;1"
                dur="3s"
                repeatCount="indefinite"
                calcMode="spline"
                keySplines="0 0 1 1;0 .4 .2 1"
              />
              <animate
                attributeName="opacity"
                values="0;0;.35;0"
                keyTimes="0;.32;.35;1"
                dur="3s"
                repeatCount="indefinite"
                calcMode="spline"
                keySplines="0 0 1 1;0 0 1 1;0 .4 .2 1"
              />
            </circle>
          </svg>
        )}
        <span
          className="inline-flex rounded-full p-[2px] shadow-[var(--elevation-200)] transition-shadow duration-[var(--motion-duration-overlay)] hover:shadow-[var(--elevation-200-hover)]"
          style={{
            background: `conic-gradient(from 220deg, ${RING_BLUE}, ${RING_TURQUOISE}, ${RING_BLUE})`,
          }}
        >
          <button
            ref={ref}
            type="button"
            aria-label={ariaLabel ?? '開啟智慧代理'}
            className={cn(
              'inline-flex size-9 cursor-pointer items-center justify-center rounded-full border-none bg-surface-raised',
              'transition-transform duration-[var(--motion-duration-overlay)] hover:scale-[1.04] motion-reduce:transition-none motion-reduce:hover:scale-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              className,
            )}
            {...props}
          >
            <AgentLogo state={attention ? 'attract' : 'still'} ripple={false} size={24} />
          </button>
        </span>
      </span>
    )
  },
)
AgentFab.displayName = 'AgentFab'

export { AgentFab }
