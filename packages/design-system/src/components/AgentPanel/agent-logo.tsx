/**
 * AgentLogo — 智慧代理標誌與狀態動畫(AgentPanel 家族附屬資產)。
 *
 * ── 消費的 SSOT ──
 * - 造型:user 提供之黃金比例莫比烏斯 SVG 定稿(內橢圓長短軸比 φ=1.618、軸角 121.717°;
 *   agent-panel.spec.md「AgentLogo」節)。漸層停駐色=品牌資產常數(色相落於 DS 藍 252-266 /
 *   紫 294-304 家族,對應 primitives blue-6 258 / purple-6 294;資產內嵌 oklch,非 semantic
 *   token — 詳 spec 同節;2026-09-02 user 拍板由藍→土耳其藍改為藍→紫)。
 * - 狀態動畫:agent-panel.spec.md「AgentLogo」節(靜止/招喚/思考;一息 3s 家族;
 *   2026-09-02 拍板:待機一律靜止,併入 still,無獨立呼吸態)。呼吸包絡=吸 35% / 呼至 85% /
 *   85–100% 靜止空拍(靜息 I:E ≈ 1:2 + 呼氣末停頓;spec「AgentLogo」節引用來源)。
 * - 緩動:--motion-easing-swell / --motion-easing-settle / --motion-easing-exit
 *   (tokens/motion/motion.css)。SMIL keySplines 不能吃 CSS var,以下常數為 token 值的逐字鏡像,
 *   改 token 必同步此處。
 * - 狀態切換:新狀態 0.15s 淡入(--motion-duration-overlay;agent-panel.css `.agent-logo-enter`)。
 * - 減動作:互動觸發必可停(WCAG 2.3.3);常駐 loop 全停 → 一律回靜止
 *   (agent-panel.spec.md「轉場與減動作」)。
 */
import * as React from 'react'
import { cn } from '@/lib/utils'
import './agent-panel.css'

/** 一息 3 秒(標誌狀態動畫家族共用節拍;文字微光 2s 另計 — spec「動畫總表」)。 @internal */
export const BREATH_DUR = '3s'
/** = var(--motion-easing-swell) 的 SMIL 鏡像(吸氣 / 所有「起」)。 @internal */
export const SWELL = '0.4 0.14 0.3 1'
/** = var(--motion-easing-settle) 的 SMIL 鏡像(呼氣 / 所有「收」)。 @internal */
export const SETTLE = '0.2 0 0.38 0.9'
/** = var(--motion-easing-exit) 的 SMIL 鏡像(加速起步)。 */
const EXIT = '0.3 0 1 1'
/** 靜止空拍(值不變,曲線無意義,填線性)。 */
const HOLD = '0 0 1 1'
/** 呼吸包絡:0 靜 → 35% 吸頂 → 85% 回落到底 → 100% 靜止空拍(本體 / 疊層 / 洞形變共用)。 @internal */
export const BREATH_KEYTIMES = '0;.35;.85;1'
/** @internal */
export const BREATH_SPLINES = `${SWELL};${SETTLE};${HOLD}`
/** 呼出去的波:0–35% 貼邊聚亮(吸)→ 35–90% 離體擴散(呼,比本體多 0.15s 餘韻)→ 90–100% 靜。 @internal */
export const RIPPLE_KEYTIMES = '0;.35;.9;1'
/** @internal */
export const RIPPLE_SPLINES = `${SWELL};${SETTLE};${HOLD}`

/**
 * 品牌資產代表色(兩緞帶家族;FAB 環與光圈消費同一組 → repo 內唯一數值來源)。
 * @internal AgentPanel 家族內部共用。
 */
export const AGENT_BRAND = {
  blue: 'oklch(.72 .16 254)',
  purple: 'oklch(.70 .17 300)',
} as const

/* ── 幾何(user 定稿 SVG 逐字;viewBox 0 0 1254 1254,圓心 627) ── */
const D_PURPLE =
  'M 635.006,98.806 A 505.300,505.300 0 0 1 732.146,1099.915 C 566.063,1098.281 425.041,927.384 417.637,778.287 A 349.828,216.206 121.717474 1 0 885.536,308.027 C 847.485,198.771 746.887,109.003 635.006,98.806 Z'
const D_BLUE =
  'M 635.006,98.806 A 505.300,505.300 0 1 0 732.146,1099.915 C 566.063,1098.281 425.041,927.384 417.637,778.287 A 349.828,216.206 121.717474 0 1 885.536,308.027 C 847.485,198.771 746.887,109.003 635.006,98.806 Z'
/** 負空間呼吸(思考態):洞由橢圓變正圓的形變終點(弧端點重參數化,指令結構與原路徑同構)。 */
const D_PURPLE_ROUND =
  'M 635.006,98.806 A 505.300,505.300 0 0 1 732.146,1099.915 C 566.063,1098.281 425.041,927.384 419.706,711.508 A 283.017,283.017 121.717474 1 0 862.379,370.696 C 847.485,198.771 746.887,109.003 635.006,98.806 Z'
const D_BLUE_ROUND =
  'M 635.006,98.806 A 505.300,505.300 0 1 0 732.146,1099.915 C 566.063,1098.281 425.041,927.384 419.706,711.508 A 283.017,283.017 121.717474 0 1 862.379,370.696 C 847.485,198.771 746.887,109.003 635.006,98.806 Z'

type Stop = readonly [number, string, number?]
/* 完整版(>24):五停駐雙緞帶 + 底面陰影 + 提亮(原稿逐層保留)。
 * 藍緞帶 252→266、紫緞帶 294→304:明度各跨 .38、彩度中段峰值貼 sRGB 色域上限不越界;
 * 兩緞帶最近處相距 ≥38°,24px 簡化檔仍分得開(2026-09-02 配色研究候選 C)。 */
const BLUE_SURFACE: readonly Stop[] = [
  [0, 'oklch(.76 .13 252)'],
  [0.28, 'oklch(.68 .17 255)'],
  [0.58, 'oklch(.58 .21 258)'],
  [0.82, 'oklch(.46 .21 262)'],
  [1, 'oklch(.38 .19 266)'],
]
const PURPLE_SURFACE: readonly Stop[] = [
  [0, 'oklch(.82 .09 294)'],
  [0.3, 'oklch(.74 .14 297)'],
  [0.58, 'oklch(.64 .18 300)'],
  [0.82, 'oklch(.52 .20 302)'],
  [1, 'oklch(.44 .19 304)'],
]
const PURPLE_UNDERSIDE: readonly Stop[] = [
  [0, 'oklch(.28 .10 302)', 0.82],
  [0.34, 'oklch(.30 .10 300)', 0.47],
  [0.74, 'oklch(.30 .10 300)', 0],
]
const BLUE_LIFT: readonly Stop[] = [
  [0, 'oklch(.86 .06 252)', 0.3],
  [0.48, 'oklch(.86 .06 252)', 0.1],
  [1, 'oklch(.86 .06 252)', 0],
]
/* 簡化版(≤24):去陰影提亮、兩停駐高對比(圖標光學校正慣例;取五停駐頭尾)。 */
const BLUE_SIMPLE: readonly Stop[] = [
  [0, 'oklch(.76 .13 252)'],
  [1, 'oklch(.38 .19 266)'],
]
const PURPLE_SIMPLE: readonly Stop[] = [
  [0, 'oklch(.82 .09 294)'],
  [1, 'oklch(.44 .19 304)'],
]
/* 招喚漣漪:雙色放射盤(內藍→靛過渡→紫→邊緣透明;波色呼應本體兩緞帶色相家族,中段 278 為兩極中點)。 */
const WAVE_STOPS: readonly Stop[] = [
  [0, 'oklch(.62 .19 254)', 0.5],
  [0.55, 'oklch(.64 .18 278)', 0.44],
  [0.8, 'oklch(.66 .17 300)', 0.34],
  [1, 'oklch(.66 .17 300)', 0],
]

/** 狀態:still 靜止(=待機)/ attract 招喚 / think 思考(=回覆中)。 */
export type AgentLogoState = 'still' | 'attract' | 'think'

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

/**
 * SMIL `begin="0s"` 以文件時間軸為基準:狀態切換時才掛上的動畫會被視為早已開始
 * (加速段直接凍在終點、呼吸從半途起跑)。改 `begin="indefinite"` + 掛載當下 beginElement():
 * 每次進入狀態都從靜止起跑第一口氣;同一 commit 內掛上的多個動畫(標誌本體 / FAB 光圈)
 * 拿到同一個文件時間 → 同相。
 * @internal AgentPanel 家族內部共用。
 */
export function useBeginAnimationsOnMount(ref: React.RefObject<SVGSVGElement | null>, key: string) {
  React.useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    root.querySelectorAll<SVGAnimateElement>('[data-begin-on-mount]').forEach((el) => {
      if (typeof el.beginElement === 'function') el.beginElement()
    })
  }, [ref, key])
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

/**
 * 兩段旋轉:啟動加速 0.3s(= 一息/10,exit 曲線)→ 等速 0.6s/圈(= 一息/5,linear=轉圈慣例)。
 * 加速段 begin=indefinite 由掛載觸發;等速段以 syncbase `<id>.end` 銜接,保證每次進入都從 0° 起步。
 */
function SpinPair({
  id,
  attributeName,
  from,
  mid,
  end,
}: {
  id: string
  attributeName: 'transform' | 'gradientTransform'
  from: string
  mid: string
  end: string
}) {
  return (
    <>
      <animateTransform
        id={id}
        attributeName={attributeName}
        type="rotate"
        values={`${from};${mid}`}
        dur="0.3s"
        begin="indefinite"
        data-begin-on-mount=""
        fill="freeze"
        calcMode="spline"
        keyTimes="0;1"
        keySplines={EXIT}
      />
      <animateTransform
        attributeName={attributeName}
        type="rotate"
        values={`${mid};${end}`}
        dur="0.6s"
        begin={`${id}.end`}
        repeatCount="indefinite"
      />
    </>
  )
}

/** 思考態:色場定錨於畫布 — 漸層以本體旋轉的同構逆轉實現「幾何流過色場」。 */
function GradientCounterSpin({ id }: { id: string }) {
  return (
    <SpinPair id={id} attributeName="gradientTransform" from="0 627 627" mid="-90 627 627" end="-450 627 627" />
  )
}

/** 思考態負空間呼吸:洞橢圓↔正圓,6s(=2 息)一輪,同一條呼吸包絡(吸 35% / 呼至 85% / 靜)。 */
function HoleMorph({ from, round }: { from: string; round: string }) {
  return (
    <animate
      attributeName="d"
      values={`${from};${round};${from};${from}`}
      keyTimes={BREATH_KEYTIMES}
      dur="6s"
      begin="indefinite"
      data-begin-on-mount=""
      repeatCount="indefinite"
      calcMode="spline"
      keySplines={BREATH_SPLINES}
    />
  )
}

interface BodyProps {
  ids: Record<'blue' | 'purple' | 'under' | 'lift', string>
  simplified: boolean
  morph: boolean
}

/** 本體雙緞帶(完整=4 層;簡化=2 層);morph=true 時掛負空間形變。 */
function LogoBody({ ids, simplified, morph }: BodyProps) {
  const purpleMorph = morph ? <HoleMorph from={D_PURPLE} round={D_PURPLE_ROUND} /> : null
  const blueMorph = morph ? <HoleMorph from={D_BLUE} round={D_BLUE_ROUND} /> : null
  return (
    <>
      <path d={D_PURPLE} fill={`url(#${ids.purple})`}>{purpleMorph}</path>
      {!simplified && (
        <path d={D_PURPLE} fill={`url(#${ids.under})`}>{purpleMorph}</path>
      )}
      <path d={D_BLUE} fill={`url(#${ids.blue})`}>{blueMorph}</path>
      {!simplified && (
        <path d={D_BLUE} fill={`url(#${ids.lift})`}>{blueMorph}</path>
      )}
    </>
  )
}

/**
 * 吸氣微亮:白色疊層 0→14%→0(吸氣亮、呼氣暗;Apple Watch Breathe「脹=吸氣」同向)。
 * 招喚與思考同一套語言、同一條呼吸包絡(思考與 6s 圓化同拍)。亮度包絡取代透明度包絡:
 * 本體不透明度恆 1(白面上變淡=像停用;spec「禁止事項」)。
 */
function InhaleOverlay({ morph, dur }: { morph: boolean; dur: string }) {
  const purpleMorph = morph ? <HoleMorph from={D_PURPLE} round={D_PURPLE_ROUND} /> : null
  const blueMorph = morph ? <HoleMorph from={D_BLUE} round={D_BLUE_ROUND} /> : null
  return (
    <g opacity="0" pointerEvents="none">
      <animate
        attributeName="opacity"
        values="0;.14;0;0"
        keyTimes={BREATH_KEYTIMES}
        dur={dur}
        begin="indefinite"
        data-begin-on-mount=""
        repeatCount="indefinite"
        calcMode="spline"
        keySplines={BREATH_SPLINES}
      />
      <path d={D_BLUE} fill="#fff">{blueMorph}</path>
      <path d={D_PURPLE} fill="#fff">{purpleMorph}</path>
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
    /** 減動作:常駐 loop 全停,一律回靜止。 */
    const effectiveState: AgentLogoState = reduced ? 'still' : state
    const innerRef = React.useRef<SVGSVGElement | null>(null)
    React.useImperativeHandle(ref, () => innerRef.current as SVGSVGElement)
    useBeginAnimationsOnMount(innerRef, `${effectiveState}:${simplified}:${ripple}`)
    const ids = {
      blue: `${uid}bs`,
      purple: `${uid}ps`,
      under: `${uid}pu`,
      lift: `${uid}bl`,
      wave: `${uid}wg`,
      mask: `${uid}wm`,
      spinBlue: `${uid}sb`,
      spinPurple: `${uid}sp`,
      spinBody: `${uid}sr`,
    }
    const isThink = effectiveState === 'think'
    const isAttract = effectiveState === 'attract'

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
          {isThink && <GradientCounterSpin id={ids.spinBlue} />}
        </linearGradient>
        <linearGradient
          id={ids.purple}
          gradientUnits="userSpaceOnUse"
          x1="990"
          y1="145"
          x2="650"
          y2="1090"
        >
          <GradientStops stops={simplified ? PURPLE_SIMPLE : PURPLE_SURFACE} />
          {isThink && <GradientCounterSpin id={ids.spinPurple} />}
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
              <GradientStops stops={PURPLE_UNDERSIDE} />
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
      // 平移座標系內旋轉不得帶圓心(帶了=轉心位移兩倍遠)。結束無減速檔:SMIL loop 無終點,
      // 由狀態切換的 0.15s 淡入承接(spec「AgentLogo」節)。
      content = (
        <g transform="translate(627 627)">
          <g>
            <SpinPair id={ids.spinBody} attributeName="transform" from="0" mid="90" end="450" />
            <g transform="translate(-627 -627)">
              {body}
              <InhaleOverlay morph dur="6s" />
            </g>
          </g>
        </g>
      )
    } else if (isAttract) {
      // 招喚:蓄勢(本體脹 1.07 + 吸氣微亮,波貼邊聚亮)→ 35% 呼氣起點波離體 → 85% 本體到底
      // → 90% 餘暈散盡 → 靜止空拍。
      content = (
        <>
          {ripple && (
            <g mask={`url(#${ids.mask})`}>
              <circle cx="627" cy="627" r="560" fill={`url(#${ids.wave})`} opacity="0">
                <animate
                  attributeName="r"
                  values="560;560;830;830"
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
                  values="0;1;0;0"
                  keyTimes={RIPPLE_KEYTIMES}
                  dur={BREATH_DUR}
                  begin="indefinite"
                  data-begin-on-mount=""
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines={RIPPLE_SPLINES}
                />
              </circle>
            </g>
          )}
          <g transform="translate(627 627)">
            <g>
              <animateTransform
                attributeName="transform"
                type="scale"
                values="1;1.07;1;1"
                keyTimes={BREATH_KEYTIMES}
                dur={BREATH_DUR}
                begin="indefinite"
                data-begin-on-mount=""
                repeatCount="indefinite"
                calcMode="spline"
                keySplines={BREATH_SPLINES}
              />
              <g transform="translate(-627 -627)">
                {body}
                <InhaleOverlay morph={false} dur={BREATH_DUR} />
              </g>
            </g>
          </g>
        </>
      )
    } else {
      content = body
    }

    return (
      <svg
        ref={innerRef}
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
        {...props}
      >
        {defs}
        {/* 狀態切換:key 重建 + 0.15s 淡入(僅 opacity,不碰 transform 屬性),禁跳切。 */}
        <g key={effectiveState} className="agent-logo-enter">
          {content}
        </g>
      </svg>
    )
  },
)
AgentLogo.displayName = 'AgentLogo'

export { AgentLogo }
