/**
 * AgentLogo — 智慧代理標誌與狀態動畫(AgentPanel 家族附屬資產)。
 *
 * ── 消費的 SSOT ──
 * - 造型:user 提供之黃金比例莫比烏斯 SVG 定稿(內橢圓長短軸比 φ=1.618、軸角 121.717°;
 *   agent-panel.spec.md「AgentLogo」節)。漸層停駐色=品牌資產常數(色相落於 DS 藍 252-268 /
 *   土耳其藍 190-210 家族;資產內嵌 oklch,非 semantic token — 詳 spec 同節)。
 * - 狀態動畫:agent-panel.spec.md「AgentLogo」節(靜止/待機/招喚/思考;一息 3s 家族)。
 * - 緩動:--motion-easing-swell / --motion-easing-settle(tokens/motion/motion.css)。
 *   SMIL keySplines 不能吃 CSS var,以下常數為 token 值的逐字鏡像,改 token 必同步此處。
 * - 減動作:互動觸發必可停(WCAG 2.3.3);常駐 loop 全停,以待機純透明度呼吸為 fallback
 *   (非位移動態;agent-panel.spec.md「轉場與減動作」)。
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

/** 一息 3 秒(標誌狀態動畫家族共用節拍;文字微光 2s 另計 — spec「動畫總表」)。 */
const BREATH_DUR = '3s'
/** = var(--motion-easing-swell) 的 SMIL 鏡像。 */
const SWELL = '0.4 0.14 0.3 1'
/** = var(--motion-easing-settle) 的 SMIL 鏡像。 */
const SETTLE = '0.2 0 0.38 0.9'

/* ── 幾何(user 定稿 SVG 逐字;viewBox 0 0 1254 1254,圓心 627) ── */
const D_TURQ =
  'M 635.006,98.806 A 505.300,505.300 0 0 1 732.146,1099.915 C 566.063,1098.281 425.041,927.384 417.637,778.287 A 349.828,216.206 121.717474 1 0 885.536,308.027 C 847.485,198.771 746.887,109.003 635.006,98.806 Z'
const D_BLUE =
  'M 635.006,98.806 A 505.300,505.300 0 1 0 732.146,1099.915 C 566.063,1098.281 425.041,927.384 417.637,778.287 A 349.828,216.206 121.717474 0 1 885.536,308.027 C 847.485,198.771 746.887,109.003 635.006,98.806 Z'
/** 負空間呼吸(思考態):洞由橢圓變正圓的形變終點(弧端點重參數化,指令結構與原路徑同構)。 */
const D_TURQ_ROUND =
  'M 635.006,98.806 A 505.300,505.300 0 0 1 732.146,1099.915 C 566.063,1098.281 425.041,927.384 419.706,711.508 A 283.017,283.017 121.717474 1 0 862.379,370.696 C 847.485,198.771 746.887,109.003 635.006,98.806 Z'
const D_BLUE_ROUND =
  'M 635.006,98.806 A 505.300,505.300 0 1 0 732.146,1099.915 C 566.063,1098.281 425.041,927.384 419.706,711.508 A 283.017,283.017 121.717474 0 1 862.379,370.696 C 847.485,198.771 746.887,109.003 635.006,98.806 Z'

type Stop = readonly [number, string, number?]
/* 完整版(>24):五停駐雙緞帶 + 底面陰影 + 提亮(原稿逐層保留)。 */
const BLUE_SURFACE: readonly Stop[] = [
  [0, 'oklch(.72 .15 252)'],
  [0.28, 'oklch(.64 .19 255)'],
  [0.58, 'oklch(.55 .21 260)'],
  [0.82, 'oklch(.42 .21 265)'],
  [1, 'oklch(.35 .19 268)'],
]
const TURQ_SURFACE: readonly Stop[] = [
  [0, 'oklch(.82 .12 190)'],
  [0.3, 'oklch(.76 .12 194)'],
  [0.58, 'oklch(.66 .13 199)'],
  [0.82, 'oklch(.52 .12 205)'],
  [1, 'oklch(.44 .11 210)'],
]
const TURQ_UNDERSIDE: readonly Stop[] = [
  [0, 'oklch(.28 .08 210)', 0.82],
  [0.34, 'oklch(.30 .08 208)', 0.47],
  [0.74, 'oklch(.30 .08 208)', 0],
]
const BLUE_LIFT: readonly Stop[] = [
  [0, 'oklch(.85 .07 235)', 0.3],
  [0.48, 'oklch(.85 .07 235)', 0.1],
  [1, 'oklch(.85 .07 235)', 0],
]
/* 簡化版(≤24):去陰影提亮、兩停駐高對比(圖標光學校正慣例;取五停駐頭尾)。 */
const BLUE_SIMPLE: readonly Stop[] = [
  [0, 'oklch(.72 .15 252)'],
  [1, 'oklch(.35 .19 268)'],
]
const TURQ_SIMPLE: readonly Stop[] = [
  [0, 'oklch(.82 .12 190)'],
  [1, 'oklch(.44 .11 210)'],
]
/* 招喚漣漪:雙色放射盤(內藍→過渡→青→邊緣透明;波色呼應本體兩緞帶色相家族)。 */
const WAVE_STOPS: readonly Stop[] = [
  [0, 'oklch(.60 .18 250)', 0.5],
  [0.55, 'oklch(.63 .15 220)', 0.44],
  [0.8, 'oklch(.66 .12 196)', 0.34],
  [1, 'oklch(.66 .12 196)', 0],
]

/** 狀態:still 靜止 / idle 待機 / attract 招喚 / think 思考(=回覆中)。 */
export type AgentLogoState = 'still' | 'idle' | 'attract' | 'think'

export interface AgentLogoProps extends React.SVGAttributes<SVGSVGElement> {
  /** 動態狀態;預設 still(靜止)。 */
  state?: AgentLogoState
  /** 邊長 px;預設 24。≤24 自動切簡化造型(detail="auto")。 */
  size?: number
  /** 造型細節檔;auto = size ≤ 24 用簡化版(去陰影提亮、兩停駐高對比)。 */
  detail?: 'auto' | 'full' | 'simplified'
  /**
   * 招喚態漣漪;預設 true。AgentFab 置 false(按鈕內放不下漣漪,由邊框光圈代位 —
   * spec「FAB」節),本體蓄勢(脹 1.07+吸氣微亮)不變。
   */
  ripple?: boolean
  /** 無障礙名稱;裝飾用途可省略(將標 aria-hidden)。 */
  label?: string
}

/**
 * 常駐 loop 遵 prefers-reduced-motion 全停(嚴於 WCAG 2.3.3 條文)。
 * @internal AgentPanel 家族內部共用(AgentFab 光圈同一策略)。
 */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function GradientStops({ stops }: { stops: readonly Stop[] }) {
  return (
    <>
      {stops.map(([offset, color, opacity]) => (
        <stop
          key={offset}
          offset={offset}
          stopColor={color}
          {...(opacity !== undefined ? { stopOpacity: opacity } : {})}
        />
      ))}
    </>
  )
}

/** 思考態:色場定錨於畫布 — 漸層以本體旋轉的同構逆轉實現「幾何流過色場」。 */
function GradientCounterSpin() {
  return (
    <>
      <animateTransform
        attributeName="gradientTransform"
        type="rotate"
        values="0 627 627;-90 627 627"
        dur="0.3s"
        begin="0s"
        fill="freeze"
        calcMode="spline"
        keyTimes="0;1"
        keySplines="0.6 0 1 1"
      />
      <animateTransform
        attributeName="gradientTransform"
        type="rotate"
        values="-90 627 627;-450 627 627"
        dur="0.6s"
        begin="0.3s"
        repeatCount="indefinite"
      />
    </>
  )
}

/** 思考態負空間呼吸:洞橢圓↔正圓,6s 一輪(吸 swell / 吐 settle)。 */
function HoleMorph({ from, round }: { from: string; round: string }) {
  return (
    <animate
      attributeName="d"
      values={`${from};${round};${from}`}
      keyTimes="0;.5;1"
      dur="6s"
      repeatCount="indefinite"
      calcMode="spline"
      keySplines={`${SWELL};${SETTLE}`}
    />
  )
}

interface BodyProps {
  ids: Record<'blue' | 'turq' | 'under' | 'lift', string>
  simplified: boolean
  morph: boolean
}

/** 本體雙緞帶(完整=4 層;簡化=2 層);morph=true 時掛負空間形變。 */
function LogoBody({ ids, simplified, morph }: BodyProps) {
  const turqMorph = morph ? <HoleMorph from={D_TURQ} round={D_TURQ_ROUND} /> : null
  const blueMorph = morph ? <HoleMorph from={D_BLUE} round={D_BLUE_ROUND} /> : null
  return (
    <>
      <path d={D_TURQ} fill={`url(#${ids.turq})`}>{turqMorph}</path>
      {!simplified && (
        <path d={D_TURQ} fill={`url(#${ids.under})`}>{turqMorph}</path>
      )}
      <path d={D_BLUE} fill={`url(#${ids.blue})`}>{blueMorph}</path>
      {!simplified && (
        <path d={D_BLUE} fill={`url(#${ids.lift})`}>{blueMorph}</path>
      )}
    </>
  )
}

/** 吸氣微亮:白色疊層 0→14%→0(招喚與思考同一套語言;思考與 6s 圓化同拍)。 */
function InhaleOverlay({ morph, dur, keyTimes }: { morph: boolean; dur: string; keyTimes: string }) {
  const turqMorph = morph ? <HoleMorph from={D_TURQ} round={D_TURQ_ROUND} /> : null
  const blueMorph = morph ? <HoleMorph from={D_BLUE} round={D_BLUE_ROUND} /> : null
  return (
    <g opacity="0" pointerEvents="none">
      <animate
        attributeName="opacity"
        values="0;.14;0"
        keyTimes={keyTimes}
        dur={dur}
        repeatCount="indefinite"
        calcMode="spline"
        keySplines={`${SWELL};${SETTLE}`}
      />
      <path d={D_BLUE} fill="#fff">{blueMorph}</path>
      <path d={D_TURQ} fill="#fff">{turqMorph}</path>
    </g>
  )
}

const AgentLogo = React.forwardRef<SVGSVGElement, AgentLogoProps>(
  (
    {
      state = 'still',
      size = 24,
      detail = 'auto',
      ripple = true,
      label,
      className,
      style,
      ...props
    },
    ref,
  ) => {
    const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '')
    const reduced = usePrefersReducedMotion()
    const simplified = detail === 'simplified' || (detail === 'auto' && size <= 24)
    /** 減動作:常駐 loop 全停,fallback = 待機純透明度呼吸(非位移)。 */
    const effectiveState: AgentLogoState =
      reduced && state !== 'still' ? 'idle' : state
    const ids = {
      blue: `${uid}bs`,
      turq: `${uid}ts`,
      under: `${uid}tu`,
      lift: `${uid}bl`,
      wave: `${uid}wg`,
      mask: `${uid}wm`,
    }
    const isThink = effectiveState === 'think'
    const isAttract = effectiveState === 'attract'
    const isIdle = effectiveState === 'idle'
    const reducedIdle = reduced && state !== 'still'

    const defs = (
      <defs>
        <linearGradient
          id={ids.blue}
          gradientUnits="userSpaceOnUse"
          x1="390"
          y1="1055"
          x2="770"
          y2="110"
        >
          <GradientStops stops={simplified ? BLUE_SIMPLE : BLUE_SURFACE} />
          {isThink && <GradientCounterSpin />}
        </linearGradient>
        <linearGradient
          id={ids.turq}
          gradientUnits="userSpaceOnUse"
          x1="990"
          y1="145"
          x2="650"
          y2="1090"
        >
          <GradientStops stops={simplified ? TURQ_SIMPLE : TURQ_SURFACE} />
          {isThink && <GradientCounterSpin />}
        </linearGradient>
        {!simplified && (
          <>
            <radialGradient
              id={ids.under}
              gradientUnits="userSpaceOnUse"
              cx="490"
              cy="815"
              r="520"
            >
              <GradientStops stops={TURQ_UNDERSIDE} />
            </radialGradient>
            <radialGradient
              id={ids.lift}
              gradientUnits="userSpaceOnUse"
              cx="350"
              cy="930"
              r="510"
            >
              <GradientStops stops={BLUE_LIFT} />
            </radialGradient>
          </>
        )}
        {isAttract && ripple && (
          <>
            <radialGradient id={ids.wave}>
              <GradientStops stops={WAVE_STOPS} />
            </radialGradient>
            <mask id={ids.mask} maskUnits="userSpaceOnUse" x="-600" y="-600" width="2454" height="2454">
              <rect x="-600" y="-600" width="2454" height="2454" fill="#fff" />
              <circle cx="627" cy="627" r="512" fill="#000" />
            </mask>
          </>
        )}
      </defs>
    )

    const body = <LogoBody ids={ids} simplified={simplified} morph={isThink} />

    let content: React.ReactNode
    if (isThink) {
      // 兩段旋轉:啟動加速 0.3s(ease-in)→ 等速 0.6s/圈(linear=轉圈慣例);
      // 平移座標系內旋轉不得帶圓心(帶了=轉心位移兩倍遠)。結束減速由狀態切換的
      // 0.15s 淡出承接(SMIL loop 無終點,減速檔屬 state-exit,spec「AgentLogo」節)。
      content = (
        <g transform="translate(627 627)">
          <g>
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="0;90"
              dur="0.3s"
              begin="0s"
              fill="freeze"
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.6 0 1 1"
            />
            <animateTransform
              attributeName="transform"
              type="rotate"
              values="90;450"
              dur="0.6s"
              begin="0.3s"
              repeatCount="indefinite"
            />
            <g transform="translate(-627 -627)">
              {body}
              <InhaleOverlay morph dur="6s" keyTimes="0;.5;1" />
            </g>
          </g>
        </g>
      )
    } else if (isAttract) {
      // 招喚:蓄勢(本體脹 1.07 + 吸氣微亮)→ 35% 拍點波離體、本體回落同拍。
      content = (
        <>
          {ripple && (
          <g mask={`url(#${ids.mask})`}>
            <circle cx="627" cy="627" r="560" fill={`url(#${ids.wave})`} opacity="0">
              <animate
                attributeName="r"
                values="560;560;830"
                keyTimes="0;.35;1"
                dur={BREATH_DUR}
                repeatCount="indefinite"
                calcMode="spline"
                keySplines={`0 0 1 1;${SETTLE}`}
              />
              <animate
                attributeName="opacity"
                values="0;1;0"
                keyTimes="0;.35;1"
                dur={BREATH_DUR}
                repeatCount="indefinite"
                calcMode="spline"
                keySplines={`0 0 1 1;${SETTLE}`}
              />
            </circle>
          </g>
          )}
          <g transform="translate(627 627)">
            <g>
              <animateTransform
                attributeName="transform"
                type="scale"
                values="1;1.07;1"
                keyTimes="0;.35;1"
                dur={BREATH_DUR}
                repeatCount="indefinite"
                calcMode="spline"
                keySplines={`${SWELL};${SETTLE}`}
              />
              <g transform="translate(-627 -627)">
                {body}
                <InhaleOverlay morph={false} dur={BREATH_DUR} keyTimes="0;.35;1" />
              </g>
            </g>
          </g>
        </>
      )
    } else if (isIdle) {
      // 待機:純透明度呼吸 3s、最低 75%(非位移=減動作安全;亦為減動作 fallback)。
      content = (
        <g>
          <animate
            attributeName="opacity"
            values="1;.75;1"
            keyTimes="0;.5;1"
            dur={BREATH_DUR}
            repeatCount="indefinite"
            calcMode="spline"
            keySplines={`${SWELL};${SETTLE}`}
          />
          {body}
        </g>
      )
    } else {
      content = body
    }

    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 1254 1254"
        className={cn('shrink-0', className)}
        // 招喚波以透明度收尾,溢出視窗屬設計(波暈散出標誌框外)。
        style={{ overflow: isAttract && ripple ? 'visible' : undefined, ...style }}
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        data-state={effectiveState}
        data-reduced-motion={reducedIdle ? '' : undefined}
        {...props}
      >
        {defs}
        {content}
      </svg>
    )
  },
)
AgentLogo.displayName = 'AgentLogo'

export { AgentLogo }
