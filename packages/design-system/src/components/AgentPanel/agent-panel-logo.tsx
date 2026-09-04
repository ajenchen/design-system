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
 * - 思考態轉速:靜止 → 0.25s 加速(=半圈,exit 曲線,位移 126° = ω·T·(1−x1),交接速度連續)→ 720°/s
 *   等速(0.5s/圈 = 一息/6;數值住所是 SPIN_TURNS_PER_BREATH,不是註解宣稱)持續到離開思考 → 減速段用
 *   exit 曲線的時間鏡像 (0,0,0.7,1),位移取最小 ≥252° 且落回正位 0°(mod 360)的角度,
 *   時長 = Δ/(ω·0.7) ∈ [0.50, 1.21]s,停定後才淡入下一狀態。
 * - 轉心/波源/縮放中心一律用 LOGO_CX/LOGO_CY(外輪廓圓心),**不是** viewBox 中心 627,627。
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

/** 一息秒數 —— 家族節拍的唯一數值住所(`BREATH_DUR` 與思考轉速都由它推出)。 */
const BREATH_S = 3
/**
 * 一息 3 秒(標誌狀態動畫家族共用節拍;文字微光 2s 另計 — spec「動畫總表」)。
 * @internal AgentPanel 家族內部共用(SMIL 實作常數,不進 npm front door)。
 */
export const BREATH_DUR = `${BREATH_S}s`
/**
 * = var(--motion-easing-swell) 的 SMIL 鏡像(吸氣 / 所有「起」)。
 * @internal
 */
export const SWELL = '0.4 0.14 0.3 1'
/**
 * = var(--motion-easing-settle) 的 SMIL 鏡像(呼氣 / 所有「收」)。
 * @internal
 */
export const SETTLE = '0.2 0 0.38 0.9'
/** = var(--motion-easing-exit) 的 SMIL 鏡像(加速起步)。 */
const EXIT = '0.3 0 1 1'
/** 減速 = exit 曲線的時間鏡像(起始斜率 1/0.7,速度連續);Material/Carbon 減速原則。 */
const DECEL = '0 0 0.7 1'
/**
 * 思考態等速轉速。**數值住所只有這個「一息切幾圈」**,ω 由它推出 —— 舊版把 480 寫死、把「= 一息/4」
 * 只寫在註解裡,程式碼零綁定:改一息轉速不動、改轉速註解就過期(2026-09-04 改為真綁定)。
 *
 * 取 6 圈(0.5s/圈 = 720°/s)的依據全是第一手出貨值(單層等速旋轉,逐檔讀原始碼;URL 見
 * spec「AgentLogo」節):出貨最快是 Chakra v2 的 0.45s,往下 Carbon 690ms、Bootstrap .75s、
 * Radix Themes 800ms、Primer / Chakra v3 1s、Ant 1.2s、Material 3 1.333s、Fluent / VS Code 1.5s。
 * 0.5s 落在「最快檔 0.45–0.69s」之內,不是自創的更快值;唯一更快的出貨值 0.45s 只多 11% 速度,
 * 卻讓一息 = N 圈斷掉(3 / 0.45 = 6.67),不取。
 *
 * 閃爍:造型無 C2 對稱(洞心繞轉軸轉 180° 不落回自身)→ 整圈才重複一次 = 2.0 Hz,低於 WCAG 2.3.1
 * 的 3 次/秒;且 24px 全圖僅 576 px²,遠低於其面積門檻 341×256 = 87,296 px²。
 * 加速段 = 半圈時間(ω·T = 180 恆成立),位移 = ω·T·(1−x1) = 126° 不隨轉速漂。
 */
const SPIN_TURNS_PER_BREATH = 6
const SPIN_PERIOD_S = BREATH_S / SPIN_TURNS_PER_BREATH
const SPIN_OMEGA = 360 / SPIN_PERIOD_S
const SPIN_ACCEL_S = SPIN_PERIOD_S / 2
// 收到 1e-6:`ω·T·0.7` 在 IEEE754 下是 125.99999999999999,直接進 SVG 屬性會變成一長串小數
// (`values="0;125.99999999999999"`),對畫面無感但讓 DOM 快照與人眼檢查都變難讀。
const SPIN_MID = Math.round(SPIN_OMEGA * SPIN_ACCEL_S * 0.7 * 1e6) / 1e6
/** 減速最小位移 = ω·P·0.7 = 252°(ω·P ≡ 360,故不隨轉速漂);實際取最小 ≥252 且落回 0°(mod 360)的角度。 */
const SPIN_DECEL_MIN = 360 * 0.7
const FRAME_S = 1 / 60
/** 靜止空拍(值不變,曲線無意義,填線性)。 */
const HOLD = '0 0 1 1'
/**
 * 呼吸包絡:0 靜 → 35% 吸頂 → 85% 回落到底 → 100% 靜止空拍(本體 / 疊層 / 洞形變共用)。
 * @internal
 */
export const BREATH_KEYTIMES = '0;.35;.85;1'
/**
 * 呼吸包絡對應的 keySplines。
 * @internal
 */
export const BREATH_SPLINES = `${SWELL};${SETTLE};${HOLD}`
/**
 * 呼出去的波:0–35% 貼邊聚亮(吸)→ 35–90% 離體擴散(呼,比本體多 0.15s 餘韻)→ 90–100% 靜。
 * @internal
 */
export const RIPPLE_KEYTIMES = '0;.35;.9;1'
/**
 * 招喚波對應的 keySplines。
 * @internal
 */
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

/* ── 幾何(user 定稿 SVG 逐字;viewBox 0 0 1254 1254) ── */
/**
 * 造型的外輪廓圓心 —— **不是 viewBox 中心(627,627)**。
 *
 * 墨色區 = 圓盤(r=505.300)減去內橢圓;圓盤圓心由外弧端點反解(SVG 1.1 §F.6.5)得
 * (634.671, 604.106),與 viewBox 中心差 **24.145 單位 = 外半徑的 4.78%**。三重確認:端點反解 /
 * 展平後聯集 bbox [129.4,98.8,1140.0,1109.4](寬高皆 1010.6 = 2R,中心 634.7,604.1)/
 * 旗標排除法(只有此解讓紫弧掃 168.84° ≤ 180°,符合 large-arc-flag=0)。
 *
 * **所有旋轉 / 縮放 / 波源都必須用它**,繞 viewBox 中心會出兩個看得見的瑕疵:
 * (a) 思考態外緣每圈在 9.209↔10.133px 之間進出 —— 24px 下峰對峰 **0.924px** 的偏心晃動,
 *     讀起來像動畫沒對正,不是轉速;(b) 招喚態遮罩(r=512)本想留 6.7 單位的等寬餘量,偏心後
 *     一側超出本體 17.4、對側多切 30.8,光暈起點與本體邊緣之間出現不對稱死環。
 * 轉心選項比較(2026-09-04 覆算):外輪廓圓心對現況是 Pareto 支配 —— 外緣晃動 24.145 → **0**,
 * 洞的公轉半徑 65.051 → 43.487(仍是主要運動載體);移到洞心則外緣晃動暴增到 43.487,更糟。
 */
const LOGO_CX = 634.671
const LOGO_CY = 604.106
/** `LOGO_CX LOGO_CY` 的 SVG 座標對字串(rotate / translate 的中心參數)。 */
const LOGO_CENTER = `${LOGO_CX} ${LOGO_CY}`
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
    // 只起跑「還沒起跑過」的動畫元素:狀態切換(think → think-exit)時同一顆呼吸疊層若被重新 beginElement,
    // 亮度會從當下值跳回 0 = 斷層(2026-09-02 user 抓「圓回橢圓時有斷層」根因之一);新掛的元素(keyed)照常起跑。
    root.querySelectorAll<SVGAnimateElement>('[data-begin-on-mount]').forEach((el) => {
      if (el.dataset.begun === '1') return
      if (typeof el.beginElement === 'function') {
        el.beginElement()
        el.dataset.begun = '1'
      }
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
 * 兩段旋轉:啟動加速 = 半圈時間(exit 曲線,位移 126° 使交接速度 = 等速 連續)→ 等速 SPIN_PERIOD_S/圈
 * (= 一息 / SPIN_TURNS_PER_BREATH,linear=轉圈慣例)。加速段 begin=indefinite 由掛載觸發;等速段以 syncbase
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
    <SpinPair id={id} attributeName="gradientTransform" from={`0 ${LOGO_CENTER}`} mid={`-${SPIN_MID} ${LOGO_CENTER}`} end={`-${SPIN_MID + 360} ${LOGO_CENTER}`} />
  )
}

/**
 * 負空間形變與轉速耦合(2026-09-02 由「6s 呼吸圓化」改為速度耦合:形狀說速度、亮度說呼吸):
 * spinup = 起步加速段 橢圓 → 正圓(同 exit 曲線、同 SPIN_ACCEL_S,轉到最快時洞正好圓);
 * spindown = 減速段 正圓 → 橢圓(同 DECEL 曲線、同減速時長,停定 0° 時洞正好回定稿形)。
 * 等速期間 fill=freeze 持圓;每次進入狀態由 beginElement 起跑(useBeginAnimationsOnMount)。
 */
/**
 * 負空間形變的段落規格(內部實作型別:只被同檔 HoleMorph / LogoBody / InhaleOverlay 消費)。
 * @internal
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
  // 基底 d = 該段起點形:spindown 段基底必為正圓,否則新掛的 animate 起跑前那一影格會先畫定稿橢圓再跳回正圓
  // (一影格斷層;2026-09-02 user 抓「圓回橢圓不連貫」根因之二)。
  const dPurple = morph?.phase === 'spindown' ? D_PURPLE_ROUND : D_PURPLE
  const dBlue = morph?.phase === 'spindown' ? D_BLUE_ROUND : D_BLUE
  return (
    <>
      <path d={dPurple} fill={`url(#${ids.purple})`}>{purpleMorph}</path>
      <path d={dPurple} fill={`url(#${ids.under})`}>{purpleMorph}</path>
      <path d={dBlue} fill={`url(#${ids.blue})`}>{blueMorph}</path>
      <path d={dBlue} fill={`url(#${ids.lift})`}>{blueMorph}</path>
    </>
  )
}

/**
 * 吸氣微亮:白色疊層 0→14%→0(吸氣亮、呼氣暗;Apple Watch Breathe「脹=吸氣」同向)。
 * 招喚與思考同一套語言、同一條呼吸包絡(思考態的亮度自成 2 息一輪;圓化已改為耦合轉速)。亮度包絡取代透明度包絡:
 * 本體不透明度恆 1(白面上變淡=像停用;spec「禁止事項」)。
 */
function InhaleOverlay({ morph, dur }: { morph?: HoleMorphSpec; dur: string }) {
  const purpleMorph = morph ? <HoleMorph rest={D_PURPLE} round={D_PURPLE_ROUND} spec={morph} /> : null
  const blueMorph = morph ? <HoleMorph rest={D_BLUE} round={D_BLUE_ROUND} spec={morph} /> : null
  // 減速段外包一層 1→0 的淡出(乘上呼吸包絡):不論呼吸走到哪一拍,停定那一刻亮度必回到基準
  // (有始有終;呼吸元素本身不重啟、不跳)。
  const rampOut = morph?.phase === 'spindown' ? (
    <animate
      key="ramp"
      attributeName="opacity"
      from="1"
      to="0"
      dur={morph.dur}
      begin="indefinite"
      data-begin-on-mount=""
      fill="freeze"
      calcMode="spline"
      keyTimes="0;1"
      keySplines={DECEL}
    />
  ) : null
  return (
    <g opacity="1" pointerEvents="none">
      {rampOut}
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
      <path d={morph?.phase === 'spindown' ? D_BLUE_ROUND : D_BLUE} fill="#fff">{blueMorph}</path>
      <path d={morph?.phase === 'spindown' ? D_PURPLE_ROUND : D_PURPLE} fill="#fff">{purpleMorph}</path>
    </g>
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
    // 起跑鍵含 exit 段:減速時新掛的洞形變(圓→橢圓)與亮度淡出是 begin=indefinite,沒人 beginElement 就永不起跑
    // → 整段減速洞持圓、停定瞬間跳回橢圓(2026-09-03 deploy-preview 逐格實測:7 個 animate 全 unresolved,
    // 就是 user 看到的「圓回橢圓斷層」);已起跑的呼吸疊層由 data-begun 守衛不重啟。
    useBeginAnimationsOnMount(innerRef, `${visualKey}:${ripple}:${isExit ? 'exit' : 'run'}`)
    // 有始有終:still ↔ think 的交接瞬間兩邊長得一模一樣(定稿形、0°、無疊層),直接換、不淡入;
    // 淡入只留給形態真的不同的交接(招喚 ↔ 其他)。2026-09-02 user 抓「最後沒有流暢回到起點」:
    // 減速停定後再淡入 0.15s = 停定那一刻整顆先變透明再回來,就是那個斷層。
    // 只在 key 真的換的那一次決定要不要淡入;同 key 的後續 render(think → think-exit)沿用同一決定,
    // 否則 className 被重新加上會讓 CSS animation 重跑 = 減速起點閃一下。
    const enterRef = React.useRef<{ key: string; seamless: boolean }>({ key: visualKey, seamless: false })
    if (enterRef.current.key !== visualKey) {
      const prev = enterRef.current.key
      enterRef.current = {
        key: visualKey,
        seamless: (prev === 'still' && visualKey === 'think') || (prev === 'think' && visualKey === 'still'),
      }
    }
    const seamless = enterRef.current.seamless
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
        {/* 減速段基底 gradientTransform 必等於當下角度:SpinPair 卸載、SpinDecel 起跑前那一影格若基底是 0°,
            色場會先跳回 0° 再接減速 = 色彩斷層(2026-09-03 user 抓「色彩沒有流暢回復」根因)。 */}
        <linearGradient
          id={ids.blue}
          gradientUnits="userSpaceOnUse"
          x1="390"
          y1="1055"
          x2="770"
          y2="110"
          gradientTransform={isExit && exit ? `rotate(${-exit.angle} ${LOGO_CENTER})` : undefined}
        >
          <GradientStops stops={BLUE_SURFACE} />
          {isThink && !isExit && <GradientCounterSpin id={ids.spinBlue} />}
          {isExit && exit && (
            <SpinDecel attributeName="gradientTransform" from={-exit.angle} to={-(exit.angle + exit.delta)} dur={exit.dur} center={LOGO_CENTER} />
          )}
        </linearGradient>
        <linearGradient
          id={ids.purple}
          gradientUnits="userSpaceOnUse"
          x1="990"
          y1="145"
          x2="650"
          y2="1090"
          gradientTransform={isExit && exit ? `rotate(${-exit.angle} ${LOGO_CENTER})` : undefined}
        >
          <GradientStops stops={PURPLE_SURFACE} />
          {isThink && !isExit && <GradientCounterSpin id={ids.spinPurple} />}
          {isExit && exit && (
            <SpinDecel attributeName="gradientTransform" from={-exit.angle} to={-(exit.angle + exit.delta)} dur={exit.dur} center={LOGO_CENTER} />
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
              <circle cx={LOGO_CX} cy={LOGO_CY} r="512" fill="#000" />
            </mask>
          </>
        )}
      </defs>
    )

    // 洞形變耦合轉速:思考起步 spinup(= SPIN_ACCEL_S)、離開思考 spindown(= 減速時長);靜止/招喚不掛。
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
        <g transform={`translate(${LOGO_CENTER})`}>
          <g ref={spinRef} transform={isExit && exit ? `rotate(${exit.angle})` : undefined}>
            {isExit && exit ? (
              <SpinDecel key="decel" attributeName="transform" from={exit.angle} to={exit.angle + exit.delta} dur={exit.dur} />
            ) : (
              <SpinPair key="spin" id={ids.spinBody} attributeName="transform" from="0" mid={String(SPIN_MID)} end={String(SPIN_MID + 360)} />
            )}
            <g transform={`translate(${-LOGO_CX} ${-LOGO_CY})`}>
              {body}
              <InhaleOverlay morph={holeMorph} dur={`${BREATH_S * 2}s`} />
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
              <circle cx={LOGO_CX} cy={LOGO_CY} r="560" fill={`url(#${ids.wave})`} opacity="0">
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
          <g transform={`translate(${LOGO_CENTER})`}>
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
              <g transform={`translate(${-LOGO_CX} ${-LOGO_CY})`}>
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
        <g key={visualKey} className={seamless ? undefined : 'agent-logo-enter'}>
          {content}
        </g>
      </svg>
    )
  },
)
AgentLogo.displayName = 'AgentLogo'

export { AgentLogo }
