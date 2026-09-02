/**
 * AgentFab — 智慧代理浮動開關鈕(AgentPanel 家族附屬資產)。
 *
 * ── 消費的 SSOT ──
 * - 40 圓 = --field-height-lg 於 lg 密度(uiSize.spec.md「lg 密度」表);圓形 iconOnly。
 * - 面 = bg-surface-raised + --elevation-200(elevation.spec.md 配對規則;不寫死白色)。
 * - 外框 = AI 觸發鈕特調:錐形(環向)漸層描邊 2px(整數寬+環向漸層=正圓對稱;
 *   spec「FAB」節)。配色兩極 = AgentLogo 兩緞帶家族代表色 AGENT_BRAND(藍 254 / 紫 300;
 *   單一數值來源在 agent-logo.tsx,本檔只 import — 2026-09-02 藍→紫改色時收斂)。
 * - 內置 24 標誌(AgentLogo 簡化檔自動生效)。
 * - 動畫:待機=靜止(=標誌 still 態,2026-09-02 全家族統一);有新訊=招喚態
 *   (標誌本體蓄勢,漣漪由邊框光圈代位:0–35% 貼邊聚亮 → 35% 呼氣起點自邊框射出 r 21→27、
 *   寬 2.5、.35→0 → 90% 散盡 → 靜止空拍;與標誌同 dur / 同 keyTimes / 同 swell→settle,
 *   同一 commit 掛載 → 同相);懸停=陰影升一級+微放大;皆 --motion-duration-overlay 過場。
 * - 減動作:光圈屬常駐位移 loop → prefers-reduced-motion 全停(標誌內部自回靜止)。
 */
import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  AGENT_BRAND,
  AgentLogo,
  BREATH_DUR,
  RIPPLE_KEYTIMES,
  RIPPLE_SPLINES,
  SETTLE,
  useBeginAnimationsOnMount,
  usePrefersReducedMotion,
} from './agent-logo'

/** 靜止空拍段(值不變)。 */
const HOLD = '0 0 1 1'

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
    const glowRef = React.useRef<SVGSVGElement | null>(null)
    useBeginAnimationsOnMount(glowRef, String(showGlow))
    return (
      <span className="relative inline-flex">
        {showGlow && (
          <svg
            ref={glowRef}
            width="64"
            height="64"
            viewBox="0 0 64 64"
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <defs>
              {/* 光圈=邊框的光外散:與環同兩極、同方位(藍在左下=環 220° 起點)。 */}
              <linearGradient id={glowId} x1="0.15" y1="0.85" x2="0.85" y2="0.15">
                <stop offset="0" stopColor={AGENT_BRAND.blue} />
                <stop offset="1" stopColor={AGENT_BRAND.purple} />
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
                values="21;21;27;27"
                keyTimes={RIPPLE_KEYTIMES}
                dur={BREATH_DUR}
                begin="indefinite"
                data-begin-on-mount=""
                repeatCount="indefinite"
                calcMode="spline"
                keySplines={`${HOLD};${SETTLE};${HOLD}`}
              />
              <animate
                attributeName="opacity"
                values="0;.35;0;0"
                keyTimes={RIPPLE_KEYTIMES}
                dur={BREATH_DUR}
                begin="indefinite"
                data-begin-on-mount=""
                repeatCount="indefinite"
                calcMode="spline"
                keySplines={RIPPLE_SPLINES}
              />
            </circle>
          </svg>
        )}
        <span
          className="inline-flex rounded-full p-[2px] shadow-[var(--elevation-200)] transition-shadow duration-[var(--motion-duration-overlay)] hover:shadow-[var(--elevation-200-hover)]"
          style={{
            background: `conic-gradient(from 220deg, ${AGENT_BRAND.blue}, ${AGENT_BRAND.purple}, ${AGENT_BRAND.blue})`,
          }}
        >
          <button
            ref={ref}
            type="button"
            aria-label={ariaLabel ?? '開啟智慧代理'} // i18n-allow: DS 預設文案,aria-label prop 可覆寫
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
