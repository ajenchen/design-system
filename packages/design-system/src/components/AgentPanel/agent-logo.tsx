/**
 * AgentLogo — 智慧代理標誌與狀態動畫(AgentPanel 家族附屬資產)。
 *
 * ── 消費的 SSOT ──
 * - 造型:user 提供之黃金比例莫比烏斯 SVG 定稿(內橢圓長短軸比 φ=1.618、軸角 121.717°;
 *   agent-panel.spec.md「AgentLogo」節)。漸層停駐色=**自家色階逐階取值**(primitives.css light
 *   段 blue-2..7 / indigo-5 / purple-3..8;品牌色不隨主題,color.spec.md「品牌」段);每個常數行尾
 *   `// = --color-xxx-N` 是 scripts/agent-logo-brand-scale-invariant.mjs 的機械綁定,禁刪
 *   (2026-09-02 user:「所有顏色都要根據我們的設計語言調整」→ 由自訂 oklch 改為自家色階)。
 * - 狀態動畫:agent-panel.spec.md「AgentLogo」節(靜止/招喚/思考;一息 3s 家族;
 *   2026-09-02 拍板:待機一律靜止,併入 still,無獨立呼吸態)。呼吸包絡=吸 35% / 呼至 85% /
 *   85–100% 靜止空拍(靜息 I:E ≈ 1:2 + 呼氣末停頓;spec「AgentLogo」節引用來源)。
 * - 思考態轉速:靜止 → 0.375s 加速(=半圈,exit 曲線,位移 126° = ω·T·(1−x1),交接速度連續)→ 480°/s
 *   等速(0.75s/圈=一息/4)持續到離開思考 → 減速段用 exit 曲線的時間鏡像 (0,0,0.7,1),位移取最小 ≥252°
 *   且落回正位 0°(mod 360)的角度,時長 = Δ/(ω·0.7) ∈ [0.75, 1.82]s,停定後才淡入下一狀態。
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
/** 減速 = exit 曲線的時間鏡像(起始斜率 1/0.7,速度連續);Material/Carbon 減速原則。 */
const DECEL = '0 0 0.7 1'
/**
 * 思考態等速 480°/s(0.75s/圈 = 一息/4):世界級快檔上緣(Bootstrap 0.75 / Carbon 0.69),比「600ms =
 * frantic」(doveletter 實測)慢 25%、仍快於中性帶 1.0–1.8s → 讀成「有幹勁」不是「慌」;24px 每格轉 8°、
 * 輪廓半圈 0.375s 脫離閃爍區(2026-09-02 轉速研究)。加速段 = 半圈時間(ω·T = 180 恆成立),
 * 位移 = ω·T·(1−x1) = 126° 不隨轉速漂;減速最小位移 = 360·0.7 = 252°。
 */
const SPIN_OMEGA = 480
const SPIN_PERIOD_S = 360 / SPIN_OMEGA
const SPIN_ACCEL_S = SPIN_PERIOD_S / 2
const SPIN_MID = SPIN_OMEGA * SPIN_ACCEL_S * 0.7
/** 減速最小位移 = ω·P·0.7 = 252°;實際取最小 ≥252 且落回 0°(mod 360)的角度。 */
const SPIN_DECEL_MIN = 360 * 0.7
const FRAME_S = 1 / 60
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
 * 全部取自 primitives.css light 色階(品牌色不隨主題);行尾綁定供 invariant 腳本比對,禁刪。
 * @internal AgentPanel 家族內部共用。
 */
export const AGENT_BRAND = {
  blue: 'oklch(0.72 0.17 258)', // = --color-blue-4
  purple: 'oklch(0.71 0.15 294)', // = --color-purple-4
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
 * 藍 blue-3→7、紫 purple-3→7:明度各跨 .37(原稿 .38)、彩度峰值在第 4 停駐(base-6);
 * 色相固定 258 / 294(自家色階 h 恆定,兩緞帶相距 36°);尾端停在 -7 而非 -8:dark
 * `--surface-raised`(L≈.24)上 blue-8(L .33)會糊進底面,-7(L .44)ΔL .20 仍可辨。 */
const BLUE_SURFACE: readonly Stop[] = [
  [0, 'oklch(0.81 0.10 258)'], // = --color-blue-3
  [0.28, 'oklch(0.72 0.17 258)'], // = --color-blue-4
  [0.58, 'oklch(0.63 0.20 258)'], // = --color-blue-5
  [0.82, 'oklch(0.54 0.22 258)'], // = --color-blue-6
  [1, 'oklch(0.44 0.20 258)'], // = --color-blue-7
]
const PURPLE_SURFACE: readonly Stop[] = [
  [0, 'oklch(0.80 0.09 294)'], // = --color-purple-3
  [0.3, 'oklch(0.71 0.15 294)'], // = --color-purple-4
  [0.58, 'oklch(0.62 0.18 294)'], // = --color-purple-5
  [0.82, 'oklch(0.52 0.20 294)'], // = --color-purple-6
  [1, 'oklch(0.43 0.19 294)'], // = --color-purple-7
]
const PURPLE_UNDERSIDE: readonly Stop[] = [
  [0, 'oklch(0.32 0.16 294)', 0.82], // = --color-purple-8
  [0.34, 'oklch(0.32 0.16 294)', 0.47], // = --color-purple-8
  [0.74, 'oklch(0.32 0.16 294)', 0], // = --color-purple-8
]
const BLUE_LIFT: readonly Stop[] = [
  [0, 'oklch(0.89 0.05 258)', 0.3], // = --color-blue-2
  [0.48, 'oklch(0.89 0.05 258)', 0.1], // = --color-blue-2
  [1, 'oklch(0.89 0.05 258)', 0], // = --color-blue-2
]
/* 招喚漣漪:雙色放射盤(內藍→靛過渡→紫→邊緣透明;中段取 indigo,自家藍紫之間唯一色相)。 */
const WAVE_STOPS: readonly Stop[] = [
  [0, 'oklch(0.63 0.20 258)', 0.5], // = --color-blue-5
  [0.55, 'oklch(0.62 0.23 265)', 0.44], // = --color-indigo-5
  [0.8, 'oklch(0.62 0.18 294)', 0.34], // = --color-purple-5
  [1, 'oklch(0.62 0.18 294)', 0], // = --color-purple-5
]

/** 狀態:still 靜止(=待機)/ attract 招喚 / think 思考(=回覆中)。 */
export type AgentLogoState = 'still' | 'attract' | 'think'

export interface AgentLogoProps extends React.SVGAttributes<SVGSVGElement> {
  /** 動態狀態;預設 still(靜止)。 */
  state?: AgentLogoState
  /** 邊長 px;預設 24。所有尺寸同一造型(2026-09-02 user 拍板:形狀規則,不設簡化檔)。 */
  size?: number
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
 * 兩段旋轉:啟動加速 = 半圈時間(exit 曲線,位移 126° 使交接速度 = 等速 連續)→ 等速 0.75s/圈
 * (= 一息/4,linear=轉圈慣例)。加速段 begin=indefinite 由掛載觸發;等速段以 syncbase
 * `<id>.end` 銜接,保證每次進入都從 0° 起步。離開思考另有減速段(見 AgentLogo think-exit)。
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
        dur={`${SPIN_ACCEL_S}s`}
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
        dur={`${SPIN_PERIOD_S}s`}
        begin={`${id}.end`}
        repeatCount="indefinite"
      />
    </>
  )
}

/** 離開思考:從離開瞬間的角度續轉 Δ 到停(exit 鏡像曲線),fill=freeze;掛載後由 AgentLogo 觸發 beginElement。 */
function SpinDecel({
  attributeName,
  from,
  to,
  dur,
  center,
}: {
  attributeName: 'transform' | 'gradientTransform'
  from: number
  to: number
  dur: number
  center?: string
}) {
  const suffix = center ? ` ${center}` : ''
  return (
    <animateTransform
      attributeName={attributeName}
      type="rotate"
      from={`${from}${suffix}`}
      to={`${to}${suffix}`}
      dur={`${dur}s`}
      begin="indefinite"
      data-begin-on-exit=""
      fill="freeze"
      calcMode="spline"
      keyTimes="0;1"
      keySplines={DECEL}
    />
  )
}

/** 思考態:色場定錨於畫布 — 漸層以本體旋轉的同構逆轉實現「幾何流過色場」。 */
function GradientCounterSpin({ id }: { id: string }) {
  return (
    <SpinPair id={id} attributeName="gradientTransform" from="0 627 627" mid={`-${SPIN_MID} 627 627`} end={`-${SPIN_MID + 360} 627 627`} />
  )
}

/** 思考態負空間呼吸:洞橢圓↔正圓,6s(=2 息)一輪,同一條呼吸包絡(吸 35% / 呼至 85% / 靜)。 */
/**
 * 負空間形變與轉速耦合(2026-09-02 由「6s 呼吸圓化」改為速度耦合:形狀說速度、亮度說呼吸):
 * spinup = 起步加速段 橢圓 → 正圓(同 exit 曲線、同 0.375s,轉到最快時洞正好圓);
 * spindown = 減速段 正圓 → 橢圓(同 DECEL 曲線、同減速時長,停定 0° 時洞正好回定稿形)。
 * 等速期間 fill=freeze 持圓;每次進入狀態由 beginElement 起跑(useBeginAnimationsOnMount)。
 */
export interface HoleMorphSpec {
  phase: 'spinup' | 'spindown'
  /** 秒數字串(spinup 固定 SPIN_ACCEL_S;spindown = 減速段時長)。 */
  dur: string
}

function HoleMorph({ rest, round, spec }: { rest: string; round: string; spec: HoleMorphSpec }) {
  const up = spec.phase === 'spinup'
  return (
    <animate
      key={spec.phase}
      attributeName="d"
      from={up ? rest : round}
      to={up ? round : rest}
      dur={spec.dur}
      begin="indefinite"
      data-begin-on-mount=""
      fill="freeze"
      calcMode="spline"
      keyTimes="0;1"
      keySplines={up ? EXIT : DECEL}
    />
  )
}

interface BodyProps {
  ids: Record<'blue' | 'purple' | 'under' | 'lift', string>
  morph?: HoleMorphSpec
}

/** 本體雙緞帶 4 層(面 + 底面陰影 + 面 + 提亮),所有尺寸同一造型;morph 有值時掛負空間形變(耦合轉速)。 */
function LogoBody({ ids, morph }: BodyProps) {
  const purpleMorph = morph ? <HoleMorph rest={D_PURPLE} round={D_PURPLE_ROUND} spec={morph} /> : null
  const blueMorph = morph ? <HoleMorph rest={D_BLUE} round={D_BLUE_ROUND} spec={morph} /> : null
  return (
    <>
      <path d={D_PURPLE} fill={`url(#${ids.purple})`}>{purpleMorph}</path>
      <path d={D_PURPLE} fill={`url(#${ids.under})`}>{purpleMorph}</path>
      <path d={D_BLUE} fill={`url(#${ids.blue})`}>{blueMorph}</path>
      <path d={D_BLUE} fill={`url(#${ids.lift})`}>{blueMorph}</path>
    </>
  )
}

/**
 * 吸氣微亮:白色疊層 0→14%→0(吸氣亮、呼氣暗;Apple Watch Breathe「脹=吸氣」同向)。
 * 招喚與思考同一套語言、同一條呼吸包絡(思考與 6s 圓化同拍)。亮度包絡取代透明度包絡:
 * 本體不透明度恆 1(白面上變淡=像停用;spec「禁止事項」)。
 */
function InhaleOverlay({ morph, dur }: { morph?: HoleMorphSpec; dur: string }) {
  const purpleMorph = morph ? <HoleMorph rest={D_PURPLE} round={D_PURPLE_ROUND} spec={morph} /> : null
  const blueMorph = morph ? <HoleMorph rest={D_BLUE} round={D_BLUE_ROUND} spec={morph} /> : null
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
    /** 減動作:常駐 loop 全停,一律回靜止。 */
    const effectiveState: AgentLogoState = reduced ? 'still' : state
    const innerRef = React.useRef<SVGSVGElement | null>(null)
    React.useImperativeHandle(ref, () => innerRef.current as SVGSVGElement)
    /**
     * 畫面狀態(visual)由 layout effect 驅動,而非直接吃 prop:離開思考時先讀活動畫的角度,
     * 掛減速段轉到停(落回 0°),endEvent 後才切到新狀態淡入 —— 使用者看不到中間 render。
     */
    const [visual, setVisual] = React.useState<AgentLogoState | 'think-exit'>(effectiveState)
    const [exit, setExit] = React.useState<{ angle: number; delta: number; dur: number } | null>(null)
    const latestState = React.useRef(effectiveState)
    latestState.current = effectiveState
    const spinRef = React.useRef<SVGGElement | null>(null)
    /** 進入思考的牆鐘時間:判斷「加速段是否已完成」用牆鐘,不用 SMIL 時間軸(背景分頁會凍在 0)。 */
    const thinkEnteredAt = React.useRef(0)
    React.useLayoutEffect(() => {
      if (visual === 'think') thinkEnteredAt.current = performance.now()
    }, [visual])
    React.useLayoutEffect(() => {
      if (visual === effectiveState) return
      // 減速進行中:由減速段的 endEvent / timer 收尾(latestState),這裡不得搶先切換。
      if (visual === 'think-exit') return
      const leavingThink = visual === 'think' && effectiveState !== 'think'
      if (!leavingThink || reduced) {
        setExit(null)
        setVisual(effectiveState)
        return
      }
      const svg = innerRef.current
      const g = spinRef.current
      const accel = svg?.querySelector<SVGAnimateElement>('g > animateTransform[fill="freeze"]') ?? null
      const start = (angle: number) => {
        // 最小 ≥252° 且落回 0°(mod 360):停定後與 still 態正位無縫接軌。
        const normalized = ((angle % 360) + 360) % 360
        let delta = (360 - normalized) % 360
        while (delta < SPIN_DECEL_MIN) delta += 360
        setExit({ angle: normalized, delta, dur: delta / (SPIN_OMEGA * 0.7) })
        setVisual('think-exit')
      }
      const elapsed = (performance.now() - thinkEnteredAt.current) / 1000
      if (elapsed < FRAME_S || !svg) {
        // 連一格都沒畫 → 直接切。
        setVisual(effectiveState)
        return
      }
      if (elapsed < SPIN_ACCEL_S && accel) {
        // 加速未完 → 等加速段結束再減速(角度已知 = SPIN_MID,免讀 DOM);endEvent 沒來(分頁凍結)→ 牆鐘補位。
        let started = false
        const onEnd = () => {
          if (started) return
          started = true
          start(SPIN_MID)
        }
        accel.addEventListener('endEvent', onEnd, { once: true })
        const timer = window.setTimeout(onEnd, (SPIN_ACCEL_S - elapsed) * 1000 + 50)
        return () => {
          accel.removeEventListener('endEvent', onEnd)
          window.clearTimeout(timer)
        }
      }
      const m = g?.getCTM() ?? null
      start(m ? (Math.atan2(m.b, m.a) * 180) / Math.PI : 0)
    }, [effectiveState, visual, reduced])
    React.useLayoutEffect(() => {
      if (!exit) return
      const svg = innerRef.current
      if (!svg) return
      const animations = [...svg.querySelectorAll<SVGAnimateElement>('[data-begin-on-exit]')]
      animations.forEach((el) => el.beginElement())
      let done = false
      const finish = () => {
        if (done) return
        done = true
        setExit(null)
        setVisual(latestState.current)
      }
      const primary = animations[0]
      primary?.addEventListener('endEvent', finish, { once: true })
      const timer = window.setTimeout(finish, exit.dur * 1000 + 50)
      return () => {
        primary?.removeEventListener('endEvent', finish)
        window.clearTimeout(timer)
      }
    }, [exit])
    const isExit = visual === 'think-exit'
    /** think→think-exit 不換 key:洞形變 / 疊層節點不重掛、不重新 beginElement。 */
    const visualKey = isExit ? 'think' : visual
    useBeginAnimationsOnMount(innerRef, `${visualKey}:${ripple}`)
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
    const isThink = visual === 'think' || isExit
    const isAttract = visual === 'attract'

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
          <GradientStops stops={BLUE_SURFACE} />
          {isThink && !isExit && <GradientCounterSpin id={ids.spinBlue} />}
          {isExit && exit && (
            <SpinDecel attributeName="gradientTransform" from={-exit.angle} to={-(exit.angle + exit.delta)} dur={exit.dur} center="627 627" />
          )}
        </linearGradient>
        <linearGradient
          id={ids.purple}
          gradientUnits="userSpaceOnUse"
          x1="990"
          y1="145"
          x2="650"
          y2="1090"
        >
          <GradientStops stops={PURPLE_SURFACE} />
          {isThink && !isExit && <GradientCounterSpin id={ids.spinPurple} />}
          {isExit && exit && (
            <SpinDecel attributeName="gradientTransform" from={-exit.angle} to={-(exit.angle + exit.delta)} dur={exit.dur} center="627 627" />
          )}
        </linearGradient>
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

    // 洞形變耦合轉速:思考起步 spinup(0.375s)、離開思考 spindown(= 減速時長);靜止/招喚不掛。
    const holeMorph: HoleMorphSpec | undefined = isThink
      ? isExit && exit
        ? { phase: 'spindown', dur: `${exit.dur}s` }
        : { phase: 'spinup', dur: `${SPIN_ACCEL_S}s` }
      : undefined
    const body = <LogoBody ids={ids} morph={holeMorph} />

    let content: React.ReactNode
    if (isThink) {
      // 平移座標系內旋轉不得帶圓心(帶了=轉心位移兩倍遠)。結束無減速檔:SMIL loop 無終點,
      // 由狀態切換的 0.15s 淡入承接(spec「AgentLogo」節)。
      content = (
        <g transform="translate(627 627)">
          <g ref={spinRef} transform={isExit && exit ? `rotate(${exit.angle})` : undefined}>
            {isExit && exit ? (
              <SpinDecel key="decel" attributeName="transform" from={exit.angle} to={exit.angle + exit.delta} dur={exit.dur} />
            ) : (
              <SpinPair key="spin" id={ids.spinBody} attributeName="transform" from="0" mid={String(SPIN_MID)} end={String(SPIN_MID + 360)} />
            )}
            <g transform="translate(-627 -627)">
              {body}
              <InhaleOverlay morph={holeMorph} dur="6s" />
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
                <InhaleOverlay dur={BREATH_DUR} />
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
        data-state={visualKey}
        data-phase={isExit ? 'exit' : undefined}
        {...props}
      >
        {defs}
        {/* 狀態切換:key 重建 + 0.15s 淡入(僅 opacity,不碰 transform 屬性),禁跳切;think→exit 同 key 不重掛。 */}
        <g key={visualKey} className="agent-logo-enter">
          {content}
        </g>
      </svg>
    )
  },
)
AgentLogo.displayName = 'AgentLogo'

export { AgentLogo }
